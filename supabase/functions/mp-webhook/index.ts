// ================================================================
// MyDeck — Supabase Edge Function: mp-webhook
//
// Recebe a notificação do Mercado Pago quando um pagamento muda de
// status (aprovado, rejeitado, pendente...) e, se for um pagamento
// aprovado de um pedido de leilão, marca o auction_orders como pago
// automaticamente — substitui o "Marcar como Pago" manual do leiloeiro
// pra pedidos pagos pelo Checkout Pro.
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
//   MP_ACCESS_TOKEN   (mesmo token usado em mp-create-payment)
//
// Configuração no Mercado Pago: não precisa cadastrar nada manualmente
// no painel — a notification_url já vai junto em cada preference
// criada por mp-create-payment.
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

interface OrderRow {
  id: number;
  buyer_id: string;
  status: string;
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
    const orderId = parseInt(payment.external_reference);
    if (!orderId) return json({ ok: true, ignored: true, reason: 'sem external_reference' });

    const { data: order } = await sbAdmin
      .from('auction_orders')
      .select('id, buyer_id, status')
      .eq('id', orderId)
      .maybeSingle<OrderRow>();

    if (!order) return json({ ok: true, ignored: true, reason: 'pedido não encontrado' });

    // Idempotência — pagamento já processado antes, não refaz nada.
    if (order.status === 'pago' || order.status === 'enviado' || order.status === 'concluido') {
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

    return json({ ok: true, approved: true });
  } catch (err) {
    console.error('[mp-webhook] erro', err);
    // Ainda assim 200 — erro nosso não deve virar retry infinito do MP;
    // fica logado pra investigar (supabase functions logs mp-webhook).
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
