// MyDeck — mk-shop (marketplace): cotação de frete + criação de pedido/pagamento.
// 17/10/2026
//
// Duas ações, mesmo endpoint (POST /functions/v1/mk-shop):
//   { action:'quote',    seller, items:[{product_id,qty}], destination_cep }   → público (anon ok)
//   { action:'checkout', seller, items, delivery, shipping_option, address, name, whatsapp, email, note, payment_method } → exige login
//
// Regras de ouro:
//   - O PREÇO e o FRETE nunca vêm do cliente. Itens são relidos do banco; o frete é recotado aqui
//     (cache de 30 min) e a opção escolhida é achada pelo id.
//   - O pedido nasce em mk_create_order (RPC, só service_role): trava estoque, reserva, calcula total.
//   - Se o provedor de pagamento falhar depois do pedido criado, o pedido é cancelado e o estoque volta.
//   - Tudo é injetado via Deps para testar sem rede/banco (ver scripts/test_mk_shop.mjs).
//
// ⚠️ SuperFrete: o contrato (POST /api/v0/calculator) NÃO foi confirmado ao vivo. Tentamos o formato
// `package` e, se a API recusar (400/422), repetimos com `products`. Confirmar com o token real.

export interface Seller {
  id: string; slug: string; name: string; status: string; cep_origin: string | null; whatsapp: string | null;
  commission_pct: number; pickup_enabled: boolean; pickup_note: string | null;
  flat_shipping: number | null; free_shipping_over: number | null; handling_days: number;
  checkout_enabled: boolean; pay_methods: string[];
}
export interface Product {
  id: number; seller_id: string; title: string; kind: string; price: number; status: string;
  weight_g: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null;
}
export interface Quote { service: string; price: number; dias: number | null }
export interface ShipOption { id: string; kind: 'retirada' | 'gratis' | 'fixo' | 'transportadora'; service: string; price: number; dias: number | null }
export interface Secrets { pix_key: string | null; pix_holder: string | null; mp_access_token: string | null }

export interface Deps {
  env: { SUPERFRETE_TOKEN: string; SUPERFRETE_BASE_URL: string; SITE_URL: string; WEBHOOK_URL: string };
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
  getUser: (authHeader: string) => Promise<{ id: string; email: string | null } | null>;
  getSeller: (ref: { id?: string; slug?: string }) => Promise<Seller | null>;
  getProducts: (ids: number[]) => Promise<Product[]>;
  getSecrets: (sellerId: string) => Promise<Secrets | null>;
  getPrivate: (key: string) => Promise<string | null>;
  cacheGet: (key: string) => Promise<{ quotes: Quote[]; created_at: string } | null>;
  cacheSet: (key: string, quotes: Quote[]) => Promise<void>;
  countPendingOrders: (userId: string) => Promise<number>;
  createOrder: (args: Record<string, unknown>) => Promise<{ id: number; total: number; subtotal: number; shipping_cost: number; expires_at: string | null; buyer_name: string }>;
  closeOrder: (orderId: number, reason: string) => Promise<void>;
  insertPayment: (row: Record<string, unknown>) => Promise<void>;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
class HttpError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_PENDING_ORDERS = 3;
const PIX_MINUTES = 30;      // Pix direto (QR) vence rápido
const MANUAL_MINUTES = 24 * 60; // WhatsApp / Pix manual: dá tempo de combinar e pagar
const CARD_MINUTES = 60;     // Checkout Pro (cartão/boleto) — boleto compensa depois, ver nota no webhook

// ── pacote ────────────────────────────────────────────────────────────────
// Medidas padrão por tipo (mesma ordem de grandeza do frete.js) quando o produto não tem medidas.
const DEFAULT_DIMS: Record<string, { g: number; l: number; w: number; h: number }> = {
  carta: { g: 20, l: 16, w: 11, h: 2 },
  selado: { g: 300, l: 20, w: 15, h: 6 },
  acessorio: { g: 200, l: 20, w: 15, h: 8 },
  outro: { g: 250, l: 20, w: 15, h: 8 },
};
export function computePackage(lines: { p: Product; qty: number }[]) {
  let weightG = 0, length = 0, width = 0, height = 0;
  for (const { p, qty } of lines) {
    const d = DEFAULT_DIMS[p.kind] || DEFAULT_DIMS.outro;
    weightG += (p.weight_g ?? d.g) * qty;
    length = Math.max(length, p.length_cm ?? d.l);
    width = Math.max(width, p.width_cm ?? d.w);
    height += (p.height_cm ?? d.h) * qty; // empilha
  }
  // mínimos dos Correios
  return {
    weight: Math.max(0.1, Math.round(weightG) / 1000),
    length: Math.max(16, Math.round(length)),
    width: Math.max(11, Math.round(width)),
    height: Math.max(2, Math.round(height)),
  };
}

export function parseQuotes(raw: unknown): Quote[] {
  const list = Array.isArray(raw) ? raw : (raw as any)?.data ?? [];
  const out: Quote[] = [];
  for (const q of list) {
    if (!q || q.error) continue;
    const service = String(q.name || q.company?.name || q.service || 'Transportadora');
    const priceRaw = q.price ?? q.custom_price ?? q.total ?? null;
    const price = priceRaw != null ? parseFloat(priceRaw) : NaN;
    if (!Number.isFinite(price) || price < 0) continue;
    const dias = q.delivery_time ?? q.custom_delivery_time ?? q.delivery_range?.max ?? null;
    out.push({ service, price: Math.round(price * 100) / 100, dias: dias != null && Number.isFinite(Number(dias)) ? Number(dias) : null });
  }
  out.sort((a, b) => a.price - b.price);
  return out;
}

async function carrierQuotes(d: Deps, originCep: string, destCep: string, pkg: ReturnType<typeof computePackage>): Promise<Quote[]> {
  const common = {
    from: { postal_code: originCep }, to: { postal_code: destCep },
    services: '1,2,17', options: { insurance_value: 0, receipt: false, own_hand: false },
  };
  const bodies = [
    { ...common, package: { height: pkg.height, width: pkg.width, length: pkg.length, weight: pkg.weight } },
    { ...common, products: [{ id: '1', width: pkg.width, height: pkg.height, length: pkg.length, weight: pkg.weight, insurance_value: 0, quantity: 1 }] },
  ];
  let lastStatus = 0;
  for (const body of bodies) {
    const r = await d.fetch(`${d.env.SUPERFRETE_BASE_URL}/api/v0/calculator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        Authorization: `Bearer ${d.env.SUPERFRETE_TOKEN}`, 'User-Agent': 'MyDeck TCG (cadu0207@gmail.com)',
      },
      body: JSON.stringify(body),
    });
    if (r.ok) return parseQuotes(await r.json());
    lastStatus = r.status;
    if (r.status !== 400 && r.status !== 422) break; // erro que não é de formato (401, 5xx…): não adianta repetir
  }
  throw new HttpError(502, `A cotação de frete falhou (SuperFrete ${lastStatus}). Tente de novo em instantes.`);
}

// ── carrinho / frete ──────────────────────────────────────────────────────
interface Line { p: Product; qty: number }
async function loadLines(d: Deps, seller: Seller, rawItems: unknown): Promise<{ lines: Line[]; subtotal: number }> {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 20) throw new HttpError(400, 'Carrinho vazio ou grande demais.');
  const want = new Map<number, number>();
  for (const it of rawItems) {
    const id = Number((it as any)?.product_id), qty = Number((it as any)?.qty);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 100) throw new HttpError(400, 'Item inválido no carrinho.');
    if (want.has(id)) throw new HttpError(400, 'Produto repetido no carrinho.');
    want.set(id, qty);
  }
  const prods = await d.getProducts([...want.keys()]);
  const lines: Line[] = [];
  for (const [id, qty] of want) {
    const p = prods.find((x) => x.id === id);
    if (!p || p.seller_id !== seller.id || p.status !== 'ativo') throw new HttpError(422, 'Um dos produtos não está mais à venda.');
    lines.push({ p, qty });
  }
  const subtotal = Math.round(lines.reduce((s, l) => s + Number(l.p.price) * l.qty, 0) * 100) / 100;
  return { lines, subtotal };
}

export async function shippingOptions(d: Deps, seller: Seller, lines: Line[], subtotal: number, destCepRaw: string | undefined, wantCarrier = true) {
  const options: ShipOption[] = [];
  const warnings: string[] = [];
  if (seller.pickup_enabled) options.push({ id: 'retirada', kind: 'retirada', service: 'Retirar com a loja', price: 0, dias: null });
  const freeOver = seller.free_shipping_over != null ? Number(seller.free_shipping_over) : null;
  if (freeOver != null && freeOver > 0 && subtotal >= freeOver) {
    options.push({ id: 'gratis', kind: 'gratis', service: 'Frete grátis', price: 0, dias: null });
  }
  if (seller.flat_shipping != null) {
    options.push({ id: 'fixo', kind: 'fixo', service: 'Frete fixo da loja', price: Number(seller.flat_shipping), dias: null });
  }
  const dest = (destCepRaw || '').replace(/\D/g, '');
  if (wantCarrier) {
    if (dest.length !== 8) throw new HttpError(400, 'CEP de destino inválido.');
    const origin = (seller.cep_origin || '').replace(/\D/g, '');
    if (!d.env.SUPERFRETE_TOKEN) warnings.push('carrier_not_configured');
    else if (origin.length !== 8) warnings.push('seller_without_cep');
    else {
      const pkg = computePackage(lines);
      const key = `mk:${seller.id}:${origin}:${dest}:${pkg.weight}:${pkg.length}x${pkg.width}x${pkg.height}`;
      let quotes: Quote[] | null = null;
      const cached = await d.cacheGet(key);
      if (cached && d.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) quotes = cached.quotes;
      if (!quotes) {
        quotes = await carrierQuotes(d, origin, dest, pkg);
        await d.cacheSet(key, quotes);
      }
      for (const q of quotes) options.push({ id: 'sf:' + q.service, kind: 'transportadora', service: q.service, price: q.price, dias: q.dias });
    }
  }
  options.sort((a, b) => a.price - b.price);
  return { options, warnings };
}

async function resolveSeller(d: Deps, ref: unknown): Promise<Seller> {
  const str = String(ref ?? '').trim();
  if (!str) throw new HttpError(400, 'Informe a loja.');
  const isUuid = /^[0-9a-f-]{36}$/i.test(str);
  const s = await d.getSeller(isUuid ? { id: str } : { slug: str });
  if (!s || s.status !== 'ativa') throw new HttpError(404, 'Loja não encontrada ou pausada.');
  return s;
}

// ── pagamento ─────────────────────────────────────────────────────────────
const MP = 'https://api.mercadopago.com';
function mpDate(ms: number): string { // yyyy-MM-ddTHH:mm:ss.000-03:00 (Brasília)
  const t = new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 19);
  return t + '.000-03:00';
}
function waUrl(phone: string | null, text: string): string | null {
  let n = (phone || '').replace(/\D/g, '');
  if (!n) return null;
  if (n.length <= 11) n = '55' + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
const brl = (v: number) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

async function mpToken(d: Deps, secrets: Secrets | null): Promise<string> {
  const t = secrets?.mp_access_token || (await d.getPrivate('mp_access_token')) || '';
  if (!t) throw new HttpError(503, 'Pagamento online ainda não está configurado nesta loja.');
  return t;
}
async function mpCall(d: Deps, token: string, path: string, body: unknown, idem: string) {
  const r = await d.fetch(MP + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Idempotency-Key': idem },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let data: any = null; try { data = JSON.parse(txt); } catch { /* corpo não-JSON */ }
  if (!r.ok) {
    console.error('[mk-shop] Mercado Pago', path, r.status, txt.slice(0, 500));
    throw new HttpError(502, 'O provedor de pagamento recusou a criação da cobrança. Tente outra forma de pagamento.');
  }
  return data;
}

interface OrderLike { id: number; total: number; subtotal: number; shipping_cost: number; expires_at: string | null; buyer_name: string }

async function startPayment(d: Deps, seller: Seller, order: OrderLike, method: string, lines: Line[], buyerEmail: string | null, secrets: Secrets | null) {
  const orderUrl = `${d.env.WEBHOOK_URL}?o=${order.id}`;
  if (method === 'whatsapp') {
    const text = `Olá! Fiz o pedido #${order.id} na ${seller.name} pelo MyDeck (${brl(order.total)}). ` +
      lines.map((l) => `${l.qty}x ${l.p.title}`).join(', ') + '. Como posso pagar?';
    return { method, whatsapp_url: waUrl(seller.whatsapp, text) };
  }
  if (method === 'pix_manual') {
    if (!secrets?.pix_key) throw new HttpError(503, 'A loja ainda não cadastrou a chave Pix.');
    await d.insertPayment({ order_id: order.id, provider: 'manual', method, status: 'pendente', amount: order.total, expires_at: order.expires_at });
    return {
      method, pix_key: secrets.pix_key, pix_holder: secrets.pix_holder, amount: order.total,
      whatsapp_url: waUrl(seller.whatsapp, `Oi! Paguei o pedido #${order.id} (${brl(order.total)}) por Pix. Segue o comprovante.`),
    };
  }
  const token = await mpToken(d, secrets);
  if (method === 'pix') {
    if (!buyerEmail) throw new HttpError(400, 'Informe um e-mail para gerar o Pix.');
    const exp = order.expires_at ? new Date(order.expires_at).getTime() : d.now() + PIX_MINUTES * 60000;
    const resp = await mpCall(d, token, '/v1/payments', {
      transaction_amount: order.total, description: `Pedido #${order.id} — ${seller.name}`,
      payment_method_id: 'pix', payer: { email: buyerEmail }, external_reference: String(order.id),
      notification_url: orderUrl, date_of_expiration: mpDate(exp),
    }, `mk-order-${order.id}-pix`);
    const td = resp?.point_of_interaction?.transaction_data;
    if (!resp?.id || !td?.qr_code) throw new HttpError(502, 'O provedor não devolveu o QR do Pix.');
    await d.insertPayment({
      order_id: order.id, provider: 'mercadopago', method, status: 'pendente', amount: order.total,
      provider_payment_id: String(resp.id), pix_copy_paste: td.qr_code, pix_qr_base64: td.qr_code_base64 ?? null, expires_at: order.expires_at,
    });
    return { method, pix_copy_paste: td.qr_code, pix_qr_base64: td.qr_code_base64 ?? null, amount: order.total, expires_at: order.expires_at };
  }
  if (method === 'card' || method === 'boleto') {
    const items = lines.map((l) => ({ id: String(l.p.id), title: l.p.title.slice(0, 120), quantity: l.qty, unit_price: Number(l.p.price), currency_id: 'BRL' }));
    if (order.shipping_cost > 0) items.push({ id: 'frete', title: 'Frete', quantity: 1, unit_price: Number(order.shipping_cost), currency_id: 'BRL' });
    const exp = order.expires_at ? new Date(order.expires_at).getTime() : d.now() + CARD_MINUTES * 60000;
    const excluded = method === 'card'
      ? [{ id: 'ticket' }, { id: 'bank_transfer' }, { id: 'atm' }]
      : [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'bank_transfer' }, { id: 'atm' }, { id: 'prepaid_card' }];
    const site = d.env.SITE_URL + '/#mk';
    const resp = await mpCall(d, token, '/checkout/preferences', {
      items, external_reference: String(order.id), notification_url: orderUrl,
      payer: buyerEmail ? { email: buyerEmail, name: order.buyer_name } : undefined,
      back_urls: { success: site, pending: site, failure: site }, auto_return: 'approved',
      expires: true, expiration_date_to: mpDate(exp), statement_descriptor: seller.name.slice(0, 22).toUpperCase(),
      payment_methods: { excluded_payment_types: excluded, installments: method === 'card' ? 12 : 1 },
    }, `mk-order-${order.id}-pref`);
    if (!resp?.init_point) throw new HttpError(502, 'O provedor não devolveu o link de pagamento.');
    await d.insertPayment({
      order_id: order.id, provider: 'mercadopago', method, status: 'pendente', amount: order.total,
      provider_ref: String(resp.id ?? ''), checkout_url: resp.init_point, expires_at: order.expires_at,
    });
    return { method, checkout_url: resp.init_point, amount: order.total, expires_at: order.expires_at };
  }
  throw new HttpError(400, 'Forma de pagamento desconhecida.');
}

function minutesFor(method: string): number {
  return method === 'pix' ? PIX_MINUTES : method === 'card' || method === 'boleto' ? CARD_MINUTES : MANUAL_MINUTES;
}

// ── address ───────────────────────────────────────────────────────────────
function cleanAddress(a: any) {
  const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  const cep = s(a?.cep, 12).replace(/\D/g, '');
  const out = { cep, street: s(a?.street, 120), number: s(a?.number, 20), complement: s(a?.complement, 60), district: s(a?.district, 80), city: s(a?.city, 80), uf: s(a?.uf, 2).toUpperCase() };
  if (cep.length !== 8 || !out.street || !out.number || !out.city || out.uf.length !== 2) throw new HttpError(400, 'Preencha o endereço completo (CEP, rua, número, cidade e UF).');
  return out;
}

// ── handler ───────────────────────────────────────────────────────────────
export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método não permitido.' }, 405);
  try {
    const body = await req.json().catch(() => null) as any;
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Corpo inválido.');
    const seller = await resolveSeller(d, body.seller);
    const { lines, subtotal } = await loadLines(d, seller, body.items);

    if (body.action === 'quote') {
      const { options, warnings } = await shippingOptions(d, seller, lines, subtotal, body.destination_cep, true);
      return json({ ok: true, subtotal, handling_days: seller.handling_days, options, warnings });
    }

    if (body.action === 'checkout') {
      const user = await d.getUser(req.headers.get('Authorization') ?? '');
      if (!user) throw new HttpError(401, 'Faça login para comprar.');
      if (!seller.checkout_enabled) throw new HttpError(403, 'A compra pelo site ainda não está liberada nesta loja. Use o WhatsApp.');
      const method = String(body.payment_method ?? '');
      if (!seller.pay_methods.includes(method)) throw new HttpError(422, 'Forma de pagamento indisponível nesta loja.');
      const delivery = body.delivery === 'retirada' ? 'retirada' : 'envio';
      const name = String(body.name ?? '').trim();
      if (name.length < 3) throw new HttpError(400, 'Informe seu nome completo.');
      const email = String(body.email ?? user.email ?? '').trim() || null;
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
      if ((await d.countPendingOrders(user.id)) >= MAX_PENDING_ORDERS) {
        throw new HttpError(429, 'Você já tem pedidos aguardando pagamento. Pague ou cancele um deles antes de fazer outro.');
      }

      let address: ReturnType<typeof cleanAddress> | null = null;
      let ship: ShipOption;
      if (delivery === 'retirada') {
        if (!seller.pickup_enabled) throw new HttpError(422, 'Esta loja não oferece retirada.');
        ship = { id: 'retirada', kind: 'retirada', service: 'Retirar com a loja', price: 0, dias: null };
      } else {
        address = cleanAddress(body.address);
        const { options } = await shippingOptions(d, seller, lines, subtotal, address.cep, true);
        const found = options.find((o) => o.id === String(body.shipping_option ?? '') && o.kind !== 'retirada');
        if (!found) throw new HttpError(422, 'Essa opção de frete não está mais disponível. Calcule o frete de novo.');
        ship = found;
      }

      const secrets = await d.getSecrets(seller.id);
      // checagens baratas ANTES de reservar estoque
      if (method === 'pix_manual' && !secrets?.pix_key) throw new HttpError(503, 'A loja ainda não cadastrou a chave Pix.');
      if (method === 'pix' || method === 'card' || method === 'boleto') await mpToken(d, secrets);
      if (method === 'pix' && !email) throw new HttpError(400, 'Informe um e-mail para gerar o Pix.');

      const order = await d.createOrder({
        p_user: user.id, p_seller: seller.id,
        p_items: lines.map((l) => ({ product_id: l.p.id, qty: l.qty })),
        p_delivery: delivery, p_service: ship.service, p_shipping: ship.price, p_method: method,
        p_expires_minutes: minutesFor(method), p_address: address, p_name: name, p_email: email,
        p_whatsapp: String(body.whatsapp ?? ''), p_note: String(body.note ?? ''),
      });
      try {
        const payment = await startPayment(d, seller, order, method, lines, email, secrets);
        return json({ ok: true, order: { id: order.id, total: order.total, subtotal: order.subtotal, shipping_cost: order.shipping_cost, expires_at: order.expires_at }, payment });
      } catch (e) {
        await d.closeOrder(order.id, 'falha ao criar a cobrança').catch((x) => console.error('[mk-shop] closeOrder', x));
        throw e;
      }
    }
    throw new HttpError(400, 'Ação desconhecida.');
  } catch (e) {
    if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status);
    const msg = String((e as Error)?.message ?? e);
    // erros levantados pelas funções SQL (raise exception) são mensagens para o comprador
    if (/Estoque insuficiente|não está mais à venda|Quem é da equipe|não está vendendo|não está liberada|indisponível|Carrinho|Quantidade|Frete inválido|Retirada|Entrega inválida|Produto repetido/.test(msg)) {
      return json({ ok: false, error: msg }, 422);
    }
    console.error('[mk-shop] erro inesperado', e);
    return json({ ok: false, error: 'Erro inesperado. Tente de novo em instantes.' }, 500);
  }
}
