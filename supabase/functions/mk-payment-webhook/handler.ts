// MyDeck — mk-payment-webhook: recebe o aviso do Mercado Pago e aplica no pedido.
// 17/10/2026
//
// Não confiamos no corpo do aviso: ele só diz "o pagamento X mudou". Buscamos o pagamento no MP
// (GET /v1/payments/X) com o token da loja, conferimos external_reference == pedido da URL (?o=)
// e só então chamamos mk_apply_payment (idempotente por provider+event_id).
// Assinatura (x-signature) é verificada quando existir app_private_config('mp_webhook_secret').
//
// Resposta: 200 para tudo que foi tratado ou deve ser ignorado (evita reenvio infinito);
// 5xx só para falha transitória (busca no MP ou RPC falhou) — o MP tenta de novo.
//
// Nota boleto: o MP avisa "approved" quando o boleto compensa (1–3 dias). Pedido de boleto expira em
// 60 min (CARD_MINUTES) e o pagamento chega depois → mk_apply_payment avisa a loja ("pago após cancelar").
// Se boleto virar produto de verdade, aumente o prazo no mk-shop para 3 dias úteis.

export interface WDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  getPrivate: (key: string) => Promise<string | null>;
  getOrderToken: (orderId: number) => Promise<string | null>; // token do MP da loja do pedido (ou da plataforma)
  applyPayment: (args: Record<string, unknown>) => Promise<unknown>;
}

const MP = 'https://api.mercadopago.com';
const ok = (body: unknown = { ok: true }, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function mapStatus(s: string): string | null {
  switch (s) {
    case 'approved': return 'aprovado';
    case 'pending': case 'in_process': case 'authorized': case 'in_mediation': return 'pendente';
    case 'rejected': return 'recusado';
    case 'cancelled': return 'cancelado';
    case 'refunded': case 'charged_back': return 'reembolsado';
    default: return null;
  }
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifySignature(secret: string, req: Request, dataId: string): Promise<boolean> {
  const header = req.headers.get('x-signature') ?? '';
  const requestId = req.headers.get('x-request-id') ?? '';
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=').map((x) => x.trim()) as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  return safeEq(await hmacHex(secret, manifest), parts.v1);
}

export async function handle(req: Request, d: WDeps): Promise<Response> {
  if (req.method !== 'POST') return ok({ ok: true, ignored: 'method' });
  try {
    const url = new URL(req.url);
    const orderId = Number(url.searchParams.get('o'));
    let body: any = null;
    try { body = await req.json(); } catch { /* aviso sem corpo: usa a query */ }
    const type = String(body?.type ?? body?.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '');
    const dataId = String(body?.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '');
    if (type !== 'payment' || !dataId) return ok({ ok: true, ignored: 'not-payment' });
    if (!Number.isInteger(orderId) || orderId <= 0) return ok({ ok: true, ignored: 'no-order' });

    const secret = await d.getPrivate('mp_webhook_secret');
    if (secret && !(await verifySignature(secret, req, dataId))) return ok({ ok: false, error: 'assinatura inválida' }, 401);

    const token = await d.getOrderToken(orderId);
    if (!token) return ok({ ok: true, ignored: 'no-token' });

    const r = await d.fetch(`${MP}/v1/payments/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404) return ok({ ok: true, ignored: 'payment-not-found' });
    if (!r.ok) return ok({ ok: false, error: 'mp ' + r.status }, 502); // transitório: MP reenvia
    const pay = await r.json() as any;

    if (String(pay.external_reference ?? '') !== String(orderId)) return ok({ ok: true, ignored: 'reference-mismatch' });
    const status = mapStatus(String(pay.status ?? ''));
    if (!status) return ok({ ok: true, ignored: 'status:' + pay.status });

    const result = await d.applyPayment({
      p_order: orderId, p_provider: 'mercadopago', p_provider_payment_id: String(pay.id ?? dataId), p_status: status,
      p_amount: pay.transaction_amount != null ? Number(pay.transaction_amount) : null,
      p_event_id: `${pay.id ?? dataId}:${pay.status}`,
      p_payload: { id: pay.id, status: pay.status, status_detail: pay.status_detail, transaction_amount: pay.transaction_amount, payment_method_id: pay.payment_method_id, date_approved: pay.date_approved },
    });
    return ok({ ok: true, result });
  } catch (e) {
    console.error('[mk-payment-webhook]', e);
    return ok({ ok: false, error: 'erro interno' }, 500);
  }
}
