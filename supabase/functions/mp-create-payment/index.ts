// ================================================================
// MyDeck — Supabase Edge Function: mp-create-payment
//
// Cria uma "preference" no Mercado Pago (Checkout Pro — PIX + cartão +
// boleto) pra um pedido de leilão (auction_orders) e devolve o link de
// pagamento (init_point) pro front redirecionar o comprador.
//
// Por que precisa ser uma Edge Function (não dá pra chamar o Mercado
// Pago direto do leilao.js): criar a preference exige o Access Token
// de produção, que não pode existir no client (JS público) — quem
// tivesse esse token conseguiria criar cobranças em nome da sua conta.
// Aqui ele fica só como secret da function.
//
// Segurança:
//   • Exige JWT válido do Supabase (a function roda SEM --no-verify-jwt
//     — o próprio Supabase barra chamada sem sessão logada antes mesmo
//     de entrar aqui).
//   • Confere com a service_role que o pedido pertence mesmo a quem tá
//     chamando (buyer_id = user.id) e que ainda está aguardando
//     pagamento — não dá pra gerar cobrança pro pedido de outra pessoa
//     nem pagar de novo um pedido já pago.
//
// Deploy:
//   supabase functions deploy mp-create-payment
// Secrets necessários (supabase secrets set ...):
//   MP_ACCESS_TOKEN   (Access Token de PRODUÇÃO do Mercado Pago, conta
//                      do Eduardo — cadu0207@gmail.com)
// (SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já
// existem automaticamente dentro de toda Edge Function.)
//
// Uso: POST /functions/v1/mp-create-payment  { order_id: 123 }
//      Header: Authorization: Bearer <access_token do usuário logado>
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

interface OrderRow {
  id: number;
  round_id: number;
  buyer_id: string;
  buyer_email: string | null;
  amount: number;
  status: string;
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

    const { order_id } = await req.json();
    if (!order_id) return json({ ok: false, error: 'order_id é obrigatório.' }, 400);

    const { data: order, error: orderErr } = await sbAdmin
      .from('auction_orders')
      .select('*')
      .eq('id', order_id)
      .maybeSingle<OrderRow>();

    if (orderErr || !order) return json({ ok: false, error: 'Pedido não encontrado.' }, 404);
    if (order.buyer_id !== user.id) return json({ ok: false, error: 'Este pedido não é seu.' }, 403);
    if (order.status !== 'aguardando_pagamento') {
      return json({ ok: false, error: 'Este pedido não está mais aguardando pagamento.' }, 400);
    }

    const { data: round } = await sbAdmin
      .from('auction_rounds')
      .select('title')
      .eq('id', order.round_id)
      .maybeSingle<{ title: string }>();

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
    if (!mpAccessToken) {
      return json({ ok: false, error: 'Pagamento online ainda não configurado (MP_ACCESS_TOKEN ausente).' }, 500);
    }

    const preferenceBody = {
      items: [
        {
          title: `Leilão MyDeck — ${round?.title || 'Rodada #' + order.round_id}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(order.amount),
        },
      ],
      payer: order.buyer_email ? { email: order.buyer_email } : undefined,
      external_reference: String(order.id),
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
      back_urls: {
        success: `${SITE_URL}/?leilao_pago=1`,
        pending: `${SITE_URL}/?leilao_pendente=1`,
        failure: `${SITE_URL}/?leilao_falhou=1`,
      },
      auto_return: 'approved',
      statement_descriptor: 'MYDECKTCG LEILAO',
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
      console.error('[mp-create-payment] preference error', mpRes.status, errText);
      return json({ ok: false, error: 'Erro ao criar cobrança no Mercado Pago.' }, 502);
    }

    const pref = await mpRes.json();

    await sbAdmin
      .from('auction_orders')
      .update({ mp_preference_id: pref.id, payment_method: 'mercado_pago', updated_at: new Date().toISOString() })
      .eq('id', order.id);

    return json({ ok: true, init_point: pref.init_point, preference_id: pref.id });
  } catch (err) {
    console.error('[mp-create-payment] erro', err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
