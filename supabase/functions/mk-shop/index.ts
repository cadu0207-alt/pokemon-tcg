// MyDeck — mk-shop: cotação de frete + checkout do marketplace. Lógica em handler.ts.
// Deploy com verify_jwt DESLIGADO: o site usa chave publishable (não é JWT) e visitante anônimo precisa cotar frete.
// O checkout valida o login aqui dentro (getUser). A cotação pública é protegida pelo cache de 30 min.
// Secrets (Edge Functions): SUPERFRETE_TOKEN (e opcional SUPERFRETE_BASE_URL). SUPABASE_* já existem.
// Chaves do Mercado Pago: por loja em mk_seller_secrets.mp_access_token, ou da plataforma em app_private_config('mp_access_token').

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type Deps, handle } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
const sbAnon = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false } });

const SELLER_COLS = 'id,slug,name,status,cep_origin,whatsapp,commission_pct,pickup_enabled,pickup_note,flat_shipping,free_shipping_over,handling_days,checkout_enabled,pay_methods';
const PRODUCT_COLS = 'id,seller_id,title,kind,price,status,weight_g,length_cm,width_cm,height_cm';

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T | null {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

const deps: Deps = {
  env: {
    SUPERFRETE_TOKEN: Deno.env.get('SUPERFRETE_TOKEN') ?? '',
    SUPERFRETE_BASE_URL: Deno.env.get('SUPERFRETE_BASE_URL') || 'https://api.superfrete.com',
    SITE_URL: 'https://mydecktcg.com.br',
    WEBHOOK_URL: `${SUPABASE_URL}/functions/v1/mk-payment-webhook`,
  },
  fetch: (i, init) => fetch(i, init),
  now: () => Date.now(),
  async getUser(authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const { data, error } = await sbAnon.auth.getUser(token);
    if (error || !data?.user) return null; // a anon key é um JWT válido, mas não é um usuário
    return { id: data.user.id, email: data.user.email ?? null };
  },
  async getSeller(ref) {
    const q = sb.from('mk_sellers').select(SELLER_COLS);
    return must(await (ref.id ? q.eq('id', ref.id) : q.eq('slug', ref.slug!)).maybeSingle(), 'mk_sellers') as any;
  },
  async getProducts(ids) {
    return (must(await sb.from('mk_products').select(PRODUCT_COLS).in('id', ids), 'mk_products') ?? []) as any;
  },
  async getSecrets(sellerId) {
    return must(await sb.from('mk_seller_secrets').select('pix_key,pix_holder,mp_access_token').eq('seller_id', sellerId).maybeSingle(), 'mk_seller_secrets') as any;
  },
  async getPrivate(key) {
    const row = must(await sb.from('app_private_config').select('value').eq('key', key).maybeSingle(), 'app_private_config') as { value: string } | null;
    return row?.value ?? null;
  },
  async cacheGet(key) {
    return must(await sb.from('freight_quote_cache').select('quotes,created_at').eq('cache_key', key).maybeSingle(), 'freight_quote_cache') as any;
  },
  async cacheSet(key, quotes) {
    await sb.from('freight_quote_cache').upsert({ cache_key: key, quotes, created_at: new Date().toISOString() }, { onConflict: 'cache_key' });
  },
  async countPendingOrders(userId) {
    const { count, error } = await sb.from('mk_orders').select('id', { count: 'exact', head: true }).eq('buyer_id', userId).eq('status', 'aguardando_pagamento');
    if (error) throw new Error('mk_orders: ' + error.message);
    return count ?? 0;
  },
  async createOrder(args) {
    const { data, error } = await sb.rpc('mk_create_order', args);
    if (error) throw new Error(error.message);
    return data as any;
  },
  async closeOrder(orderId, reason) {
    const { error } = await sb.rpc('mk_close_order', { p_order: orderId, p_status: 'cancelado', p_reason: reason, p_actor: null });
    if (error) throw new Error(error.message);
  },
  async insertPayment(row) {
    const { error } = await sb.from('mk_payments').insert(row);
    if (error) throw new Error('mk_payments: ' + error.message);
  },
};

Deno.serve((req) => handle(req, deps));
