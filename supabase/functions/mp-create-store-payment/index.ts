// ================================================================
// MyDeck — Supabase Edge Function: mp-create-store-payment
//
// Igual a mp-create-payment, só que pra reservas da "Loja do
// Leiloeiro" (store_reservations) em vez de pedidos de leilão
// (auction_orders). Cria uma "preference" no Mercado Pago
// (Checkout Pro — PIX + cartão + boleto) e devolve o link de
// pagamento (init_point) pro front redirecionar o comprador.
//
// Por que uma function separada em vez de reaproveitar mp-create-payment:
// os dois tipos de pedido vivem em tabelas diferentes, com regras de
// validação diferentes (reserva expira em 24h, pedido de leilão tem
// payment_due_at da rodada) — manter separado evita um único arquivo
// com dois caminhos condicionais e reduz o risco de misturar as duas
// lógicas por engano. O mp-webhook é COMPARTILHADO pelas duas (ver
// prefixo "store:" no external_reference).
//
// Segurança:
//   • Exige JWT válido do Supabase (a function roda SEM --no-verify-jwt
//     — o próprio Supabase barra chamada sem sessão logada antes mesmo
//     de entrar aqui).
//   • Confere com a service_role que a reserva pertence mesmo a quem
//     tá chamando (buyer_id = user.id) e que ainda está 'reservado' —
//     não dá pra gerar cobrança pra reserva de outra pessoa nem pagar
//     de novo uma já paga/cancelada/expirada.
//
// Deploy:
//   supabase functions deploy mp-create-store-payment
// Secrets necessários (supabase secrets set ...):
//   MP_ACCESS_TOKEN   (mesmo token de mp-create-payment/mp-webhook —
//                      Access Token de PRODUÇÃO do Mercado Pago, conta
//                      do Eduardo — cadu0207@gmail.com)
// (SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já
// existem automaticamente dentro de toda Edge Function.)
//
// Uso: POST /functions/v1/mp-create-store-payment  { reservation_id: 123 }
//      Header: Authorization: Bearer <access_token do usuário logado>
//
// AINDA NÃO ESTÁ NO FLUXO DO COMPRADOR (19/08/2026) — código pronto,
// igual ao que já existia pro leilão, só falta chamar isso de um botão
// visível. Ver payStoreReservation() em leilao.js.
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL = 'https://mydecktcg.com.br';
const MP_API = 'https://api.mercadopago.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const sbAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface ReservationRow {
  id: number;
  item_id: number;
  buyer_id: string;
  buyer_email: string | null;
  qty: number;
  unit_price: number;
  status: string;
  expires_at: string | null;
}

interface StoreItemRow {
  id: number;
  title: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const sbUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ ok: false, error: 'Faça login para pagar.' }, 401);
    }
    const user = userData.user;

    const { reservation_id } = await req.json();
    if (!reservation_id) return json({ ok: false, error: 'reservation_id é obrigatório.' }, 400);

    const { data: reservation, error: resErr } = await sbAdmin
      .from('store_reservations')
      .select('*')
      .eq('id', reservation_id)
      .maybeSingle<ReservationRow>();

    if (resErr || !reservation) return json({ ok: false, error: 'Reserva não encontrada.' }, 404);
    if (reservation.buyer_id !== user.id) return json({ ok: false, error: 'Esta reserva não é sua.' }, 403);
    if (reservation.status !== 'reservado') {
      return json({ ok: false, error: 'Esta reserva não está mais aguardando pagamento.' }, 400);
    }
    if (reservation.expires_at && new Date(reservation.expires_at) < new Date()) {
      return json({ ok: false, error: 'Esta reserva expirou.' }, 400);
    }

    const { data: item } = await sbAdmin
      .from('store_items')
      .select('id, title')
      .eq('id', reservation.item_id)
      .maybeSingle<StoreItemRow>();

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
    if (!mpAccessToken) {
      return json({ ok: false, error: 'Pagamento online ainda não configurado (MP_ACCESS_TOKEN ausente).' }, 500);
    }

    const preferenceBody = {
      items: [
        {
          title: `Loja MyDeck — ${item?.title || 'Item #' + reservation.item_id}`,
          quantity: reservation.qty,
          currency_id: 'BRL',
          unit_price: Number(reservation.unit_price),
        },
      ],
      payer: reservation.buyer_email ? { email: reservation.buyer_email } : undefined,
      external_reference: `store:${reservation.id}`,
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
      back_urls: {
        success: `${SITE_URL}/?loja_pago=1`,
        pending: `${SITE_URL}/?loja_pendente=1`,
        failure: `${SITE_URL}/?loja_falhou=1`,
      },
      auto_return: 'approved',
      statement_descriptor: 'MYDECKTCG LOJA',
    };

    const mpRes = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    if (!mpRes.ok) {
      const errText = await mpRes.text();
      console.error('[mp-create-store-payment] preference error', mpRes.status, errText);
      return json({ ok: false, error: 'Erro ao criar cobrança no Mercado Pago.' }, 502);
    }

    const pref = await mpRes.json();

    await sbAdmin
      .from('store_reservations')
      .update({ mp_preference_id: pref.id, payment_method: 'mercado_pago', updated_at: new Date().toISOString() })
      .eq('id', reservation.id);

    return json({ ok: true, init_point: pref.init_point, preference_id: pref.id });
  } catch (err) {
    console.error('[mp-create-store-payment] erro', err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
