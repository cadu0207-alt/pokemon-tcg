// ================================================================
// MyDeck — Supabase Edge Function: ml-refresh-all
//
// Roda por trás de um Cron Job do Supabase (pg_cron) a cada X horas,
// sem depender de ninguém com o site aberto no navegador. Ela busca
// TODOS os produtos ativos em ml_search_terms, consulta o catálogo do
// Mercado Livre pra cada um (mesma lógica de ml-catalog) e grava um
// novo registro em ml_price_history — mantendo o "menor preço já
// registrado" da vitrine sempre atualizado.
//
// Deploy:
//   supabase functions deploy ml-refresh-all --no-verify-jwt
// Usa os mesmos secrets já configurados pra ml-catalog:
//   ML_CLIENT_ID, ML_CLIENT_SECRET
//
// Depois do deploy, agende via SQL Editor do Supabase (veja
// lojas_ml_update7.sql) — não precisa chamar essa function manualmente.
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ML_API = 'https://api.mercadolibre.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

interface TokenRow {
  id: number;
  access_token: string | null;
  refresh_token: string;
  expires_at: string | null;
}

async function getValidAccessToken(): Promise<string> {
  const { data, error } = await sbAdmin
    .from('ml_tokens')
    .select('*')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle<TokenRow>();

  if (error) throw new Error('Erro lendo ml_tokens: ' + error.message);
  if (!data) throw new Error('Nenhum token ML cadastrado em ml_tokens.');

  const bufferMs = 5 * 60 * 1000;
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (data.access_token && Date.now() + bufferMs < expiresAt) {
    return data.access_token;
  }

  const res = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('ML_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('ML_CLIENT_SECRET') ?? '',
      refresh_token: data.refresh_token,
    }),
  });

  if (!res.ok) throw new Error(`Falha ao renovar token ML: ${res.status} ${await res.text()}`);

  const tok = await res.json();
  const newExpiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();

  await sbAdmin
    .from('ml_tokens')
    .update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.id);

  return tok.access_token as string;
}

interface TermRow {
  id: number;
  term: string;
  label: string | null;
  catalog_product_id: string | null;
  image_url: string | null;
}

async function refreshOneTerm(term: TermRow, token: string) {
  const catalogId = term.catalog_product_id;
  if (!catalogId) return { id: term.id, ok: false, error: 'sem catalog_product_id' };

  const [productRes, itemsRes] = await Promise.all([
    fetch(`${ML_API}/products/${catalogId}`, { headers: { Authorization: `Bearer ${token}` } }),
    fetch(`${ML_API}/products/${catalogId}/items`, { headers: { Authorization: `Bearer ${token}` } }),
  ]);

  if (!productRes.ok) return { id: term.id, ok: false, error: `produto ${productRes.status}` };
  const product = await productRes.json();

  let sellers: Array<{ price: number; seller_id: number; free_shipping: boolean }> = [];
  if (itemsRes.ok) {
    const itemsData = await itemsRes.json();
    sellers = (itemsData.results || [])
      .map((r: Record<string, unknown>) => ({
        price: r.price as number,
        seller_id: r.seller_id as number,
        free_shipping: !!(r.shipping as { free_shipping?: boolean } | undefined)?.free_shipping,
      }))
      .sort((a: { price: number }, b: { price: number }) => a.price - b.price);
  }

  if (!sellers.length) return { id: term.id, ok: false, error: 'sem vendedores' };

  const image = product.pictures && product.pictures[0] ? product.pictures[0].url : null;
  const lowestPrice = sellers[0].price;

  await sbAdmin.from('ml_price_history').insert([{
    term_id: term.id,
    ml_item_id: catalogId,
    title: product.name || term.label || term.term,
    price: lowestPrice,
    currency: 'BRL',
    url: `https://www.mercadolivre.com.br/p/${catalogId}`,
    thumbnail: image,
    seller: sellers.length + ' vendedores',
  }]);

  if (image && image !== term.image_url) {
    await sbAdmin.from('ml_search_terms').update({ image_url: image }).eq('id', term.id);
  }

  return { id: term.id, ok: true, lowestPrice, sellersCount: sellers.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { data: terms, error } = await sbAdmin
      .from('ml_search_terms')
      .select('id, term, label, catalog_product_id, image_url')
      .eq('active', true);

    if (error) throw new Error('Erro lendo ml_search_terms: ' + error.message);
    if (!terms || !terms.length) return json({ ok: true, refreshed: 0, results: [] });

    const token = await getValidAccessToken();
    const results = [];
    // Sequencial (não paralelo) pra não estourar rate limit da API do ML.
    for (const term of terms as TermRow[]) {
      try {
        results.push(await refreshOneTerm(term, token));
      } catch (e) {
        results.push({ id: term.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return json({ ok: true, refreshed: results.filter(r => r.ok).length, total: terms.length, results });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
