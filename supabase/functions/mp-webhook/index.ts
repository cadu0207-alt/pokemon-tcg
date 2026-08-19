// ================================================================
// MyDeck — Supabase Edge Function: mp-webhook
//
// Recebe a notificação do Mercado Pago quando um pagamento muda de
// status (aprovado, rejeitado, pendente...) e marca o pedido correto
// como pago automaticamente — substitui o "Marcar como Pago" manual
// do leiloeiro pra pedidos pagos pelo Checkout Pro. Atende DOIS tipos
// de pedido, distinguidos pelo external_reference que cada Edge
// Function de criação de pagamento gerou:
//   • auction_orders     → external_reference = "<id>" (número puro,
//                          formato original, criado por mp-create-payment)
//   • store_reservations → external_reference = "store:<id>" (criado
//                          por mp-create-store-payment)
//
// SEGURANÇA — nunca confia no corpo da notificação em si (qualquer um
// pode mandar um POST fingindo ser o Mercado Pago dizendo "aprovado").
// O único jeito confiável é: pegar o ID que veio na notificação e
// buscar o pagamento de VERDADE na API do Mercado Pago com o Access
// Token — só o que essa consulta devolver é confiável.
//
// Idempotente: se o pedido já estiver "pago", não faz nada de novo
// (o Mercado Pago pode reenviar a mesma notificação várias vezes).
//
// Deploy:
//   supabase functions deploy mp-webhook --no-verify-jwt
// Secrets necessários (supabase secrets set ...):
//   MP_ACCESS_TOKEN   (mesmo token usado em mp-create-payment/mp-create-store-payment)
//
// Configuração no Mercado Pago: não precisa cadastrar nada manualmente
// no painel — a notification_url já vai junto em cada preference
// criada por mp-create-payment/mp-create-store-payment.
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
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

interface AuctionOrderRow {
  id: number;
  buyer_id: string;
  status: string;
}

interface StoreReservationRow {
  id: number;
  buyer_id: string;
  status: string;
}

const DONE_STATUSES = ['pago', 'enviado', 'concluido'];

// ── auction_orders (external_reference = "<id>") ────────────────────
async function handleAuctionOrder(orderId: number, payment: any) {
  const { data: order } = await sbAdmin
    .from('auction_orders')
    .select('id, buyer_id, status')
    .eq('id', orderId)
    .maybeSingle<AuctionOrderRow>();

  if (!order) return json({ ok: true, ignored: true, reason: 'pedido não encontrado' });

  // Idempotência — pagamento já processado antes, não refaz nada.
  if (DONE_STATUSES.includes(order.status)) {
    return json({ ok: true, already: true });
  }

  if (payment.status !== 'approved') {
    // pending/rejected/in_process etc — só registra o payment_id pra
    // rastreio, não muda o status do pedido ainda.
    await sbAdmin
      .from('auction_orders')
      .update({ mp_payment_id: String(payment.id), updated_at: new Date().toISOString() })
      .eq('id', order.id);
    return json({ ok: true, status: payment.status });
  }

  await sbAdmin
    .from('auction_orders')
    .update({
      status: 'pago',
      paid_at: new Date().toISOString(),
      mp_payment_id: String(payment.id),
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);

  // Pagou → resolve o bloqueio por inadimplência, igual ao
  // markOrderPaid() manual (leilao.js).
  await sbAdmin
    .from('auction_bidder_flags')
    .update({ blocked: false, updated_at: new Date().toISOString() })
    .eq('user_id', order.buyer_id);

  return json({ ok: true, approved: true, kind: 'auction' });
}

// ── store_reservations (external_reference = "store:<id>") ──────────
// Diferente de auction_orders, aqui NÃO mexemos em estoque/qty_sold
// direto — o trigger store_reservation_after_update() (leilao_setup.sql)
// já faz isso sozinho quando o status vira 'pago', mesmo padrão do
// leiloeiro marcando manualmente no painel dele.
async function handleStoreReservation(reservationId: number, payment: any) {
  const { data: res } = await sbAdmin
    .from('store_reservations')
    .select('id, buyer_id, status')
    .eq('id', reservationId)
    .maybeSingle<StoreReservationRow>();

  if (!res) return json({ ok: true, ignored: true, reason: 'reserva não encontrada' });

  // Idempotência — mesma regra do lado do leilão.
  if (DONE_STATUSES.includes(res.status)) {
    return json({ ok: true, already: true });
  }

  if (payment.status !== 'approved') {
    await sbAdmin
      .from('store_reservations')
      .update({ mp_payment_id: String(payment.id), updated_at: new Date().toISOString() })
      .eq('id', res.id);
    return json({ ok: true, status: payment.status });
  }

  // Só atualiza reservas ainda 'reservado' (não confirma pagamento de
  // uma reserva já cancelada/expirada — o comprador precisaria reservar
  // de novo primeiro).
  if (res.status !== 'reservado') {
    return json({ ok: true, ignored: true, reason: `reserva em status ${res.status}` });
  }

  await sbAdmin
    .from('store_reservations')
    .update({
      status: 'pago',
      paid_at: new Date().toISOString(),
      mp_payment_id: String(payment.id),
      updated_at: new Date().toISOString(),
    })
    .eq('id', res.id);

  return json({ ok: true, approved: true, kind: 'store' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const url = new URL(req.url);

    // O Mercado Pago manda o id do pagamento de formas diferentes
    // dependendo da versão/tipo de notificação — cobre as variações.
    let paymentId =
      url.searchParams.get('data.id') ||
      url.searchParams.get('id') ||
      null;
    let topic = url.searchParams.get('type') || url.searchParams.get('topic') || '';

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        paymentId = paymentId || body?.data?.id || body?.id || null;
        topic = topic || body?.type || body?.action || '';
      } catch {
        // corpo vazio/não-JSON — segue só com os query params
      }
    }

    // Só nos interessa notificação de pagamento — outros tópicos
    // (merchant_order, etc.) a gente só confirma recebimento (200) e
    // ignora, senão o Mercado Pago fica reenviando.
    if (!paymentId || (topic && !topic.includes('payment'))) {
      return json({ ok: true, ignored: true });
    }

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
    const payRes = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    });

    if (!payRes.ok) {
      console.error('[mp-webhook] não deu pra buscar o pagamento', paymentId, payRes.status);
      // 200 mesmo assim — se devolvermos erro o MP fica reenviando a
      // notificação indefinidamente pra um pagamento que pode nem
      // existir mais (teste, cancelado etc).
      return json({ ok: true, warning: 'payment lookup failed' });
    }

    const payment = await payRes.json();
    const ref = String(payment.external_reference ?? '');
    if (!ref) return json({ ok: true, ignored: true, reason: 'sem external_reference' });

    if (ref.startsWith('store:')) {
      const reservationId = parseInt(ref.slice('store:'.length));
      if (!reservationId) return json({ ok: true, ignored: true, reason: 'external_reference de loja inválido' });
      return await handleStoreReservation(reservationId, payment);
    }

    const orderId = parseInt(ref);
    if (!orderId) return json({ ok: true, ignored: true, reason: 'external_reference inválido' });
    return await handleAuctionOrder(orderId, payment);
  } catch (err) {
    console.error('[mp-webhook] erro', err);
    // Ainda assim 200 — erro nosso não deve virar retry infinito do MP;
    // fica logado pra investigar (supabase functions logs mp-webhook).
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
