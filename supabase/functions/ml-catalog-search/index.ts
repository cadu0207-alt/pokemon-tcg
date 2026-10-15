// ================================================================
// MyDeck — Supabase Edge Function: ml-catalog-search
//
// Busca produtos de CATÁLOGO do Mercado Livre por texto (ex.:
// "pokemon celebração 30 anos minilata") e devolve, pra cada um,
// o catalog_product_id (MLBxxxx), nome, imagem e o menor preço entre
// os vendedores. Serve pra achar o ID certo antes de cadastrar um
// produto em ml_search_terms — o /sites/MLB/search está bloqueado pra
// apps de terceiros (ver ml-catalog), mas /products/search funciona.
//
// Uso: GET /functions/v1/ml-catalog-search?q=texto&limit=10
// (exige JWT — anon key ou sessão do site; só leitura).
// Mesmos secrets de ml-catalog: ML_CLIENT_ID, ML_CLIENT_SECRET.
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ML_API = 'https://api.mercadolibre.com';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

async function getValidAccessToken(): Promise<string> {
  const { data, error } = await sbAdmin
    .from('ml_tokens').select('*').order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('Erro lendo ml_tokens: ' + error.message);
  if (!data) throw new Error('Nenhum token ML cadastrado em ml_tokens.');
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (data.access_token && Date.now() + 5 * 60 * 1000 < expiresAt) return data.access_token;

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
  await sbAdmin.from('ml_tokens').update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', data.id);
  return tok.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(20, Math.max(1, +(url.searchParams.get('limit') || 10)));
    if (!q) return json({ ok: false, error: 'parâmetro q vazio' }, 400);

    const token = await getValidAccessToken();
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const sRes = await fetch(
      `${ML_API}/products/search?status=active&site_id=MLB&q=${encodeURIComponent(q)}&limit=${limit}`, auth);
    if (!sRes.ok) return json({ ok: false, error: `products/search ${sRes.status}`, detail: await sRes.text() }, 502);
    const sData = await sRes.json();

    const results = [];
    for (const p of (sData.results || []).slice(0, limit)) {
      let lowest: number | null = null, sellers = 0;
      try {
        const iRes = await fetch(`${ML_API}/products/${p.id}/items`, auth);
        if (iRes.ok) {
          const items = (await iRes.json()).results || [];
          sellers = items.length;
          for (const it of items) if (lowest == null || it.price < lowest) lowest = it.price;
        }
      } catch (_) { /* sem vendedores agora — segue */ }
      results.push({
        catalogId: p.id,
        name: p.name,
        image: p.pictures && p.pictures[0] ? p.pictures[0].url : null,
        lowestPrice: lowest,
        sellers,
        url: `https://www.mercadolivre.com.br/p/${p.id}`,
      });
    }
    return json({ ok: true, q, total: sData.paging?.total ?? results.length, results });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
