// ================================================================
// MyDeck — mk-mp-sandbox: FASE 0 do marketplace (validação no sandbox do Mercado Pago)
//
// Ferramenta de TESTE, descartável depois da Fase 0. Responde às perguntas que o plano deixou em aberto antes de
// construir o marketplace:
//   1. O OAuth entrega um token por lojista e ele renova? (oauth_url → callback → status → refresh)
//   2. A cobrança criada com o token do LOJISTA aceita a taxa do marketplace? (preference)
//   3. Depois que o comprador de teste paga, a taxa aparece e o dinheiro cai no lojista? (payments)
//   4. O reembolso com taxa de marketplace funciona e devolve a comissão? (refund)
//
// Segurança: toda ação exige o header x-notify-secret (mesmo segredo do notify-dispatch, em app_private_config);
// a única exceção é o retorno do OAuth (GET com code+state), que só vale com o `state` aleatório que oauth_url gravou
// (validade de 15 min, uso único). Os tokens ficam em app_private_config e NUNCA são devolvidos na resposta.
//
// Credenciais (o Eduardo grava pelo SQL Editor, nunca no chat): mp_app_client_id, mp_app_client_secret.
// ================================================================

export interface Deps {
  getPrivate(key: string): Promise<string | null>;
  setPrivate(key: string, value: string): Promise<void>;
  deletePrivate(key: string): Promise<void>;
  fetch: typeof fetch;
  now(): number;
  uuid(): string;
  siteUrl: string;       // https://mydecktcg.com.br
  functionUrl: string;   // https://<projeto>.supabase.co/functions/v1/mk-mp-sandbox (= redirect_uri cadastrada no app do MP)
}

export const MP_API = 'https://api.mercadopago.com';
export const MP_AUTH = 'https://auth.mercadopago.com.br/authorization';
const STATE_TTL_MS = 15 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const html = (body: string, status = 200) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:520px;margin:48px auto;padding:0 16px">${body}</body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

interface SellerTokens {
  access_token: string;
  refresh_token: string;
  user_id: number | string;
  public_key?: string;
  live_mode?: boolean;
  expires_at: number; // ms
}

async function appCreds(deps: Deps): Promise<{ id: string; secret: string } | null> {
  const id = await deps.getPrivate('mp_app_client_id');
  const secret = await deps.getPrivate('mp_app_client_secret');
  return id && secret ? { id, secret } : null;
}

async function loadSeller(deps: Deps): Promise<SellerTokens | null> {
  const raw = await deps.getPrivate('mp_sandbox_seller');
  if (!raw) return null;
  try { return JSON.parse(raw) as SellerTokens; } catch (_) { return null; }
}

async function tokenCall(deps: Deps, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: any }> {
  const r = await deps.fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await r.json(); } catch (_) { /* corpo vazio */ }
  return { ok: r.ok, status: r.status, data };
}

function toSeller(data: any, nowMs: number): SellerTokens {
  return {
    access_token: String(data.access_token),
    refresh_token: String(data.refresh_token),
    user_id: data.user_id,
    public_key: data.public_key,
    live_mode: data.live_mode,
    expires_at: nowMs + Number(data.expires_in ?? 0) * 1000,
  };
}

// só os campos que interessam ao teste (nunca devolve token nem dados do pagador)
function paymentSummary(p: any) {
  return {
    id: p.id,
    status: p.status,
    status_detail: p.status_detail,
    transaction_amount: p.transaction_amount,
    net_received_amount: p.transaction_details?.net_received_amount ?? null,
    payment_method_id: p.payment_method_id,
    payment_type_id: p.payment_type_id,
    fee_details: (p.fee_details ?? []).map((f: any) => ({ type: f.type, amount: f.amount, fee_payer: f.fee_payer })),
    marketplace_fee: p.marketplace_fee ?? null,
    money_release_date: p.money_release_date ?? null,
    collector_id: p.collector_id ?? null,
    refunds: (p.refunds ?? []).map((r: any) => ({ id: r.id, amount: r.amount, status: r.status })),
    external_reference: p.external_reference,
  };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);

  // ── retorno do OAuth (navegador do lojista, sem header secreto): valida o `state` ──
  if (req.method === 'GET') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return html('<h2>mk-mp-sandbox</h2><p>Nada a fazer aqui.</p>', 400);
    const stored = await deps.getPrivate('mp_sandbox_state');
    let ok = false;
    if (stored) {
      try {
        const s = JSON.parse(stored) as { state: string; exp: number };
        ok = safeEqual(s.state, state) && deps.now() < s.exp;
      } catch (_) { ok = false; }
    }
    if (!ok) return html('<h2>Link inválido ou vencido</h2><p>Gere o link de autorização de novo.</p>', 400);
    await deps.deletePrivate('mp_sandbox_state'); // uso único
    const creds = await appCreds(deps);
    if (!creds) return html('<h2>App do Mercado Pago não configurado</h2>', 500);
    const t = await tokenCall(deps, {
      client_id: creds.id, client_secret: creds.secret, grant_type: 'authorization_code',
      code, redirect_uri: deps.functionUrl,
    });
    if (!t.ok || !t.data?.access_token) {
      console.error('[mk-mp-sandbox] troca de code falhou', t.status, JSON.stringify(t.data ?? {}).slice(0, 300));
      return html(`<h2>O Mercado Pago recusou a autorização</h2><p>Código ${t.status}. Veja os logs da função.</p>`, 502);
    }
    await deps.setPrivate('mp_sandbox_seller', JSON.stringify(toSeller(t.data, deps.now())));
    return html(`<h2>Conta conectada ✅</h2><p>Mercado Pago user_id <b>${String(t.data.user_id)}</b>. Pode fechar esta janela.</p>`);
  }

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // ── ações de teste: exigem o segredo ──
  const secret = await deps.getPrivate('notify_secret');
  const given = req.headers.get('x-notify-secret') ?? '';
  if (!secret || !safeEqual(given, secret)) return json({ error: 'unauthorized' }, 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch (_) { return json({ error: 'invalid json' }, 400); }
  const action = String(body.action ?? '');

  if (action === 'oauth_url') {
    const creds = await appCreds(deps);
    if (!creds) return json({ error: 'grave mp_app_client_id e mp_app_client_secret em app_private_config' }, 400);
    const state = deps.uuid();
    await deps.setPrivate('mp_sandbox_state', JSON.stringify({ state, exp: deps.now() + STATE_TTL_MS }));
    const q = new URLSearchParams({
      client_id: creds.id, response_type: 'code', platform_id: 'mp', state, redirect_uri: deps.functionUrl,
    });
    return json({ ok: true, url: `${MP_AUTH}?${q.toString()}`, redirect_uri: deps.functionUrl, valid_minutes: 15 });
  }

  if (action === 'status') {
    const s = await loadSeller(deps);
    if (!s) return json({ ok: true, connected: false });
    return json({
      ok: true, connected: true, user_id: s.user_id, live_mode: s.live_mode ?? null,
      expires_at: new Date(s.expires_at).toISOString(), days_left: Math.floor((s.expires_at - deps.now()) / 86400000),
    });
  }

  const seller = await loadSeller(deps);
  if (!seller) return json({ error: 'nenhum lojista conectado (rode oauth_url e autorize)' }, 400);

  if (action === 'refresh') {
    const creds = await appCreds(deps);
    if (!creds) return json({ error: 'app não configurado' }, 400);
    const t = await tokenCall(deps, {
      client_id: creds.id, client_secret: creds.secret, grant_type: 'refresh_token', refresh_token: seller.refresh_token,
    });
    if (!t.ok || !t.data?.access_token) {
      return json({ ok: false, status: t.status, error: t.data?.message ?? t.data?.error ?? 'refresh recusado' }, 502);
    }
    const next = toSeller(t.data, deps.now());
    await deps.setPrivate('mp_sandbox_seller', JSON.stringify(next));
    return json({
      ok: true, expires_at: new Date(next.expires_at).toISOString(),
      refresh_token_rotated: next.refresh_token !== seller.refresh_token, // o MP troca o refresh_token a cada uso?
    });
  }

  if (action === 'preference') {
    const amount = Number(body.amount);
    const fee = Number(body.fee);
    if (!Number.isFinite(amount) || amount < 1 || amount > 5000) return json({ error: 'amount inválido (1 a 5000)' }, 400);
    if (!Number.isFinite(fee) || fee < 0 || fee >= amount) return json({ error: 'fee inválida (0 até menos que amount)' }, 400);
    const external_reference = `mk-sandbox:${deps.uuid()}`;
    const r = await deps.fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${seller.access_token}` },
      body: JSON.stringify({
        items: [{ title: String(body.title ?? 'Teste MyDeck Marketplace').slice(0, 120), quantity: 1, currency_id: 'BRL', unit_price: amount }],
        marketplace_fee: fee,
        external_reference,
        back_urls: { success: `${deps.siteUrl}/?mk_teste=ok`, pending: `${deps.siteUrl}/?mk_teste=pendente`, failure: `${deps.siteUrl}/?mk_teste=falhou` },
        auto_return: 'approved',
      }),
    });
    let data: any = null;
    try { data = await r.json(); } catch (_) { /* vazio */ }
    if (!r.ok) {
      console.error('[mk-mp-sandbox] preference falhou', r.status, JSON.stringify(data ?? {}).slice(0, 400));
      return json({ ok: false, status: r.status, mp_error: data?.message ?? data?.error ?? null, cause: data?.cause ?? null }, 502);
    }
    return json({
      ok: true, preference_id: data.id, external_reference,
      applied_marketplace_fee: data.marketplace_fee ?? null, // se vier nulo/zero, o MP ignorou a taxa
      init_point: data.init_point, sandbox_init_point: data.sandbox_init_point,
    });
  }

  if (action === 'payments') {
    const ref = String(body.external_reference ?? '');
    if (!ref) return json({ error: 'external_reference é obrigatório' }, 400);
    const r = await deps.fetch(`${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(ref)}&sort=date_created&criteria=desc`, {
      headers: { Authorization: `Bearer ${seller.access_token}` },
    });
    let data: any = null;
    try { data = await r.json(); } catch (_) { /* vazio */ }
    if (!r.ok) return json({ ok: false, status: r.status, mp_error: data?.message ?? null }, 502);
    return json({ ok: true, count: (data.results ?? []).length, payments: (data.results ?? []).map(paymentSummary) });
  }

  if (action === 'refund') {
    const id = String(body.payment_id ?? '');
    if (!/^\d+$/.test(id)) return json({ error: 'payment_id inválido' }, 400);
    const r = await deps.fetch(`${MP_API}/v1/payments/${id}/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${seller.access_token}`, 'X-Idempotency-Key': deps.uuid() },
      body: JSON.stringify(body.amount ? { amount: Number(body.amount) } : {}),
    });
    let data: any = null;
    try { data = await r.json(); } catch (_) { /* vazio */ }
    if (!r.ok) return json({ ok: false, status: r.status, mp_error: data?.message ?? data?.error ?? null }, 502);
    return json({ ok: true, refund: { id: data.id, amount: data.amount, status: data.status } });
  }

  return json({ error: 'action desconhecida' }, 400);
}
