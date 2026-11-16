// Testes das Edge Functions mk-shop e mk-payment-webhook (sem rede, sem banco).
// Rodar: node --experimental-strip-types scripts/test_mk_shop.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handle as shop } from '../supabase/functions/mk-shop/handler.ts';
import { handle as hook, mapStatus } from '../supabase/functions/mk-payment-webhook/handler.ts';

let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } };

const seller = { id: 'S1', slug: 'toybox', name: 'Toybox', status: 'ativa', cep_origin: '17250-000', whatsapp: '(14) 99999-0000', commission_pct: 5,
  pickup_enabled: false, pickup_note: null, flat_shipping: null, free_shipping_over: 200, handling_days: 2, checkout_enabled: true, pay_methods: ['whatsapp', 'pix_manual', 'pix', 'card'] };
const products = [
  { id: 1, seller_id: 'S1', title: 'Booster ME3', kind: 'selado', price: 30, status: 'ativo', weight_g: 20, length_cm: null, width_cm: null, height_cm: null },
  { id: 2, seller_id: 'S1', title: 'ETB', kind: 'selado', price: 250, status: 'ativo', weight_g: 700, length_cm: 30, width_cm: 23, height_cm: 9 },
  { id: 3, seller_id: 'S1', title: 'Rascunho', kind: 'outro', price: 10, status: 'rascunho', weight_g: null, length_cm: null, width_cm: null, height_cm: null },
  { id: 9, seller_id: 'OUTRA', title: 'Alheio', kind: 'outro', price: 10, status: 'ativo', weight_g: null, length_cm: null, width_cm: null, height_cm: null },
];
const addr = { cep: '01310-100', street: 'Av Paulista', number: '1', city: 'São Paulo', uf: 'sp' };

function mk(over = {}) {
  const calls = { fetch: [], created: [], closed: [], payments: [], cacheSets: 0 };
  const cache = new Map();
  const d = {
    env: { SUPERFRETE_TOKEN: 'tok', SUPERFRETE_BASE_URL: 'https://sf.test', SITE_URL: 'https://site.test', WEBHOOK_URL: 'https://fn.test/mk-payment-webhook' },
    now: () => Date.now(),
    fetch: async (url, init) => {
      calls.fetch.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
      if (url.includes('/api/v0/calculator')) return Response.json([{ name: 'PAC', price: '22.50', delivery_time: 6 }, { name: 'SEDEX', price: '41.1', delivery_time: 2 }, { name: 'Mini', error: 'x' }]);
      if (url.endsWith('/v1/payments')) return Response.json({ id: 777, status: 'pending', point_of_interaction: { transaction_data: { qr_code: '000201PIX', qr_code_base64: 'QUJD' } } });
      if (url.endsWith('/checkout/preferences')) return Response.json({ id: 'pref1', init_point: 'https://mp.test/pay/pref1' });
      return new Response('nf', { status: 404 });
    },
    getUser: async (a) => (a === 'Bearer user' ? { id: 'U1', email: 'a@b.co' } : null),
    getSeller: async (r) => ((r.id ? r.id === seller.id : r.slug === seller.slug) ? { ...seller, ...(over.seller || {}) } : null),
    getProducts: async (ids) => products.filter((p) => ids.includes(p.id)),
    getSecrets: async () => over.secrets === undefined ? { pix_key: 'pix@toybox.com', pix_holder: 'Alex', mp_access_token: 'MPTOKEN' } : over.secrets,
    getPrivate: async () => null,
    cacheGet: async (k) => cache.get(k) ?? null,
    cacheSet: async (k, q) => { calls.cacheSets++; cache.set(k, { quotes: q, created_at: new Date().toISOString() }); },
    countPendingOrders: async () => over.pending ?? 0,
    createOrder: async (args) => { calls.created.push(args); if (over.createErr) throw new Error(over.createErr);
      const sub = args.p_items.reduce((s, i) => s + products.find((p) => p.id === i.product_id).price * i.qty, 0);
      return { id: 55, subtotal: sub, shipping_cost: args.p_shipping, total: sub + args.p_shipping, expires_at: new Date(Date.now() + 1800e3).toISOString(), buyer_name: args.p_name }; },
    closeOrder: async (id, r) => { calls.closed.push([id, r]); },
    insertPayment: async (row) => { if (over.payErr) throw new Error('boom'); calls.payments.push(row); },
  };
  return { d, calls };
}
const post = (body, auth) => new Request('https://fn.test/mk-shop', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) });
const run = async (d, body, auth) => { const r = await shop(post(body, auth), d); return { status: r.status, j: await r.json() }; };
const base = { seller: 'toybox', items: [{ product_id: 1, qty: 2 }] };

await t('quote: opções ordenadas, erro do SuperFrete ignorado, cache', async () => {
  const { d, calls } = mk();
  const q1 = await run(d, { ...base, action: 'quote', destination_cep: '01310-100' });
  assert.equal(q1.status, 200);
  assert.deepEqual(q1.j.options.map((o) => [o.id, o.price]), [['sf:PAC', 22.5], ['sf:SEDEX', 41.1]]);
  assert.equal(q1.j.subtotal, 60);
  const sfCalls = calls.fetch.filter((c) => c.url.includes('calculator'));
  assert.equal(sfCalls.length, 1);
  assert.equal(sfCalls[0].body.package.length, 20); assert.equal(sfCalls[0].body.package.height, 12); assert.equal(sfCalls[0].body.package.weight, 0.1) // selado 20x15x6 empilhado, peso mín.
  assert.equal(sfCalls[0].body.from.postal_code, '17250000');
  await run(d, { ...base, action: 'quote', destination_cep: '01310100' });
  assert.equal(calls.fetch.filter((c) => c.url.includes('calculator')).length, 1, 'segunda cotação vem do cache');
});

await t('quote: frete grátis acima do mínimo + sem token degrada', async () => {
  const { d } = mk();
  const q = await run(d, { ...base, items: [{ product_id: 2, qty: 1 }], action: 'quote', destination_cep: '01310100' });
  assert.equal(q.j.options[0].id, 'gratis');
  d.env.SUPERFRETE_TOKEN = '';
  const q2 = await run(d, { ...base, action: 'quote', destination_cep: '01310100' });
  assert.deepEqual(q2.j.options, []);
  assert.deepEqual(q2.j.warnings, ['carrier_not_configured']);
});

await t('quote: fallback package→products quando a API recusa o formato', async () => {
  const { d, calls } = mk();
  const orig = d.fetch;
  d.fetch = async (u, i) => { const b = JSON.parse(i.body); if (u.includes('calculator') && b.package) { calls.fetch.push({ url: u, body: b }); return new Response('bad', { status: 422 }); } return orig(u, i); };
  const q = await run(d, { ...base, action: 'quote', destination_cep: '01310100' });
  assert.equal(q.status, 200); assert.equal(q.j.options.length, 2);
});

await t('quote: rejeita produto de outra loja, rascunho, CEP ruim, item repetido, qty absurda', async () => {
  const { d } = mk();
  assert.equal((await run(d, { seller: 'toybox', items: [{ product_id: 9, qty: 1 }], action: 'quote', destination_cep: '01310100' })).status, 422);
  assert.equal((await run(d, { seller: 'toybox', items: [{ product_id: 3, qty: 1 }], action: 'quote', destination_cep: '01310100' })).status, 422);
  assert.equal((await run(d, { ...base, action: 'quote', destination_cep: '123' })).status, 400);
  assert.equal((await run(d, { seller: 'toybox', items: [{ product_id: 1, qty: 1 }, { product_id: 1, qty: 1 }], action: 'quote', destination_cep: '01310100' })).status, 400);
  assert.equal((await run(d, { seller: 'toybox', items: [{ product_id: 1, qty: 1e9 }], action: 'quote', destination_cep: '01310100' })).status, 400);
  assert.equal((await run(d, { seller: 'naoexiste', ...{ items: base.items }, action: 'quote', destination_cep: '01310100' })).status, 404);
});

const co = (extra = {}) => ({ ...base, action: 'checkout', delivery: 'envio', shipping_option: 'sf:PAC', address: addr, name: 'Fulano de Tal', whatsapp: '(11) 98888-7777', payment_method: 'pix', ...extra });

await t('checkout pix: frete recotado no servidor, QR devolvido, pagamento gravado', async () => {
  const { d, calls } = mk();
  const r = await run(d, co({ shipping_price: 0.01 }), 'Bearer user'); // preço do cliente é ignorado
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(calls.created[0].p_shipping, 22.5);
  assert.equal(calls.created[0].p_expires_minutes, 30);
  assert.equal(calls.created[0].p_address.uf, 'SP');
  assert.equal(r.j.payment.pix_copy_paste, '000201PIX');
  assert.equal(r.j.order.total, 82.5);
  const mp = calls.fetch.find((c) => c.url.endsWith('/v1/payments'));
  assert.equal(mp.body.transaction_amount, 82.5);
  assert.equal(mp.body.external_reference, '55');
  assert.match(mp.body.notification_url, /mk-payment-webhook\?o=55$/);
  assert.match(mp.body.date_of_expiration, /-03:00$/);
  assert.equal(mp.init.headers['X-Idempotency-Key'], 'mk-order-55-pix');
  assert.equal(calls.payments[0].provider_payment_id, '777');
});

await t('checkout card: Checkout Pro com frete como item', async () => {
  const { d, calls } = mk();
  const r = await run(d, co({ payment_method: 'card' }), 'Bearer user');
  assert.equal(r.j.payment.checkout_url, 'https://mp.test/pay/pref1');
  const pref = calls.fetch.find((c) => c.url.endsWith('/checkout/preferences')).body;
  assert.equal(pref.items.at(-1).title, 'Frete');
  assert.equal(pref.payment_methods.excluded_payment_types.some((x) => x.id === 'ticket'), true);
});

await t('checkout pix_manual e whatsapp: sem chamar o MP', async () => {
  const { d, calls } = mk();
  const a = await run(d, co({ payment_method: 'pix_manual' }), 'Bearer user');
  assert.equal(a.j.payment.pix_key, 'pix@toybox.com');
  assert.match(a.j.payment.whatsapp_url, /^https:\/\/wa\.me\/5514999990000\?text=/);
  const b = await run(d, co({ payment_method: 'whatsapp' }), 'Bearer user');
  assert.match(b.j.payment.whatsapp_url, /pedido%20%2355/);
  assert.equal(calls.fetch.filter((c) => c.url.includes('mercadopago')).length, 0);
});

await t('checkout: login, gate, método, opção de frete inválida, pendentes, nome, endereço', async () => {
  assert.equal((await run(mk().d, co(), undefined)).status, 401);
  assert.equal((await run(mk().d, co(), 'Bearer anon-key')).status, 401);
  assert.equal((await run(mk({ seller: { checkout_enabled: false } }).d, co(), 'Bearer user')).status, 403);
  assert.equal((await run(mk({ seller: { pay_methods: ['whatsapp'] } }).d, co(), 'Bearer user')).status, 422);
  assert.equal((await run(mk().d, co({ shipping_option: 'sf:INVENTADO' }), 'Bearer user')).status, 422);
  assert.equal((await run(mk({ pending: 3 }).d, co(), 'Bearer user')).status, 429);
  assert.equal((await run(mk().d, co({ name: 'A' }), 'Bearer user')).status, 400);
  assert.equal((await run(mk().d, co({ address: { cep: '1' } }), 'Bearer user')).status, 400);
  assert.equal((await run(mk().d, co({ delivery: 'retirada' }), 'Bearer user')).status, 422); // loja sem retirada
});

await t('checkout: sem credenciais de pagamento falha ANTES de reservar estoque', async () => {
  const { d, calls } = mk({ secrets: { pix_key: null, pix_holder: null, mp_access_token: null } });
  assert.equal((await run(d, co(), 'Bearer user')).status, 503);
  assert.equal((await run(d, co({ payment_method: 'pix_manual' }), 'Bearer user')).status, 503);
  assert.equal(calls.created.length, 0);
});

await t('checkout: erro do estoque vira 422 com mensagem; falha do provedor cancela o pedido', async () => {
  const a = await run(mk({ createErr: 'Estoque insuficiente de "Booster": restam 1.' }).d, co(), 'Bearer user');
  assert.equal(a.status, 422); assert.match(a.j.error, /Estoque insuficiente/);
  const { d, calls } = mk();
  const orig = d.fetch;
  d.fetch = async (u, i) => (u.endsWith('/v1/payments') ? new Response('{"message":"x"}', { status: 400 }) : orig(u, i));
  const r = await run(d, co(), 'Bearer user');
  assert.equal(r.status, 502);
  assert.deepEqual(calls.closed, [[55, 'falha ao criar a cobrança']]);
  const { d: d2, calls: c2 } = mk({ payErr: true });
  assert.equal((await run(d2, co({ payment_method: 'pix_manual' }), 'Bearer user')).status, 500);
  assert.equal(c2.closed.length, 1, 'erro ao gravar pagamento também devolve o estoque');
});

await t('retirada: frete zero', async () => {
  const { d, calls } = mk({ seller: { pickup_enabled: true } });
  const r = await run(d, co({ delivery: 'retirada', shipping_option: undefined, address: undefined, payment_method: 'whatsapp' }), 'Bearer user');
  assert.equal(r.status, 200); assert.equal(calls.created[0].p_shipping, 0); assert.equal(calls.created[0].p_address, null);
});

// ── webhook ───────────────────────────────────────────────────────────────
function mkHook({ mpStatus = 'approved', ref = '55', secret = null, tokenNull = false, mpCode = 200 } = {}) {
  const applied = [];
  const d = {
    fetch: async (u) => (mpCode !== 200 ? new Response('x', { status: mpCode }) : Response.json({ id: 777, status: mpStatus, external_reference: ref, transaction_amount: 82.5, payment_method_id: 'pix', status_detail: 'accredited' })),
    getPrivate: async (k) => (k === 'mp_webhook_secret' ? secret : null),
    getOrderToken: async () => (tokenNull ? null : 'MPTOKEN'),
    applyPayment: async (a) => { applied.push(a); return { ok: true }; },
  };
  return { d, applied };
}
const wh = (qs = 'o=55', body = { type: 'payment', data: { id: '777' } }, headers = {}) => new Request('https://fn.test/mk-payment-webhook?' + qs, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

await t('webhook: aprovado aplica no pedido com id de evento determinístico', async () => {
  const { d, applied } = mkHook();
  const r = await hook(wh(), d);
  assert.equal(r.status, 200);
  assert.equal(applied[0].p_status, 'aprovado'); assert.equal(applied[0].p_amount, 82.5); assert.equal(applied[0].p_event_id, '777:approved'); assert.equal(applied[0].p_order, 55);
});

await t('webhook: referência diferente, outro tipo, sem pedido, status desconhecido → ignora sem aplicar', async () => {
  for (const [opts, req] of [[{ ref: '99' }, wh()], [{}, wh('o=55', { type: 'merchant_order', data: { id: '1' } })], [{}, wh('')], [{ mpStatus: 'weird' }, wh()], [{ tokenNull: true }, wh()]]) {
    const { d, applied } = mkHook(opts);
    assert.equal((await hook(req, d)).status, 200);
    assert.equal(applied.length, 0);
  }
});

await t('webhook: falha transitória do MP devolve 502 (reenvio); 404 ignora', async () => {
  assert.equal((await hook(wh(), mkHook({ mpCode: 503 }).d)).status, 502);
  assert.equal((await hook(wh(), mkHook({ mpCode: 404 }).d)).status, 200);
});

await t('webhook: assinatura x-signature', async () => {
  const secret = 's3cr3t', ts = '1700000000', rid = 'req-1';
  const v1 = createHmac('sha256', secret).update(`id:777;request-id:${rid};ts:${ts};`).digest('hex');
  const good = mkHook({ secret });
  assert.equal((await hook(wh('o=55', undefined, { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid }), good.d)).status, 200);
  assert.equal(good.applied.length, 1);
  const bad = mkHook({ secret });
  assert.equal((await hook(wh('o=55', undefined, { 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}`, 'x-request-id': rid }), bad.d)).status, 401);
  assert.equal((await hook(wh(), bad.d)).status, 401); // sem cabeçalho
  assert.equal(bad.applied.length, 0);
});

await t('webhook: mapStatus', () => {
  assert.equal(mapStatus('refunded'), 'reembolsado'); assert.equal(mapStatus('in_process'), 'pendente'); assert.equal(mapStatus('x'), null);
});

console.log(`\n${passed} testes ok`);
