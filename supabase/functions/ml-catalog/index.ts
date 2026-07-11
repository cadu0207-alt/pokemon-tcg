// ================================================================
// MyDeck — Supabase Edge Function: ml-catalog
//
// Proxy autenticado para o catálogo do Mercado Livre. O site estático
// (lojas.js) chama esta função em vez de bater direto na API do ML,
// porque os endpoints /products/{id} e /products/{id}/items exigem
// um token OAuth — e esse token (com client_secret) não pode ficar
// exposto no JS público. Aqui ele fica seguro, como variável de
// ambiente da função, e o token de acesso/refresh fica guardado na
// tabela ml_tokens (trancada por RLS, só a service_role acessa).
//
// Descobrimos nesta mesma sessão que /items/{id} e /sites/{s}/search
// foram bloqueados pelo ML pra apps de terceiros (403 em qualquer
// app), mas /products/{id} (dados do produto de catálogo: nome,
// imagens) e /products/{id}/items (lista de vendedores COM preço)
// continuam funcionando normalmente — e é só disso que precisamos.
//
// Deploy:
//   supabase functions deploy ml-catalog --no-verify-jwt
// Secrets necessários (supabase secrets set ...):
//   ML_CLIENT_ID, ML_CLIENT_SECRET
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente
// dentro de toda Edge Function, não precisa configurar.)
//
// Uso: GET /functions/v1/ml-catalog?catalogId=MLB69246167
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
  if (!data) {
    throw new Error(
      'Nenhum token ML cadastrado. Rode: INSERT INTO ml_tokens (refresh_token) VALUES (\'...\');'
    );
  }

  const bufferMs = 5 * 60 * 1000;
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (data.access_token && Date.now() + bufferMs < expiresAt) {
    return data.access_token;
  }

  // Access token ausente/expirado — renova via refresh_token.
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

  if (!res.ok) {
    throw new Error(`Falha ao renovar token ML: ${res.status} ${await res.text()}`);
  }

  const tok = await res.json();
  const newExpiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();

  // O ML rotaciona o refresh_token a cada renovação — tem que salvar
  // o novo, senão a próxima renovação falha.
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

function extractCatalogId(input: string): string | null {
  const trimmed = input.trim();
  const pathMatch = trimmed.match(/\/p\/MLB-?(\d{6,})/i);
  if (pathMatch) return `MLB${pathMatch[1]}`;
  const bareMatch = trimmed.match(/^MLB-?(\d{6,})$/i);
  if (bareMatch) return `MLB${bareMatch[1]}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get('catalogId') || url.searchParams.get('url') || '';
    const catalogId = extractCatalogId(raw) || (/^MLB\d{6,}$/i.test(raw.trim()) ? raw.trim() : null);

    if (!catalogId) {
      return json(
        { ok: false, error: 'Link/ID de catálogo inválido. Use o formato .../p/MLB1234567 ou MLB1234567.' },
        400
      );
    }

    const token = await getValidAccessToken();

    const [productRes, itemsRes] = await Promise.all([
      fetch(`${ML_API}/products/${catalogId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${ML_API}/products/${catalogId}/items`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    if (!productRes.ok) {
      return json(
        { ok: false, error: `Produto de catálogo não encontrado (${productRes.status}). Confira o link.` },
        404
      );
    }
    const product = await productRes.json();

    let sellers: Array<{ price: number; original_price: number | null; free_shipping: boolean; seller_id: number; itemId: string | null; permalink: string | null }> = [];
    if (itemsRes.ok) {
      const itemsData = await itemsRes.json();
      sellers = (itemsData.results || [])
        .map((r: Record<string, unknown>) => ({
          price: r.price as number,
          original_price: (r.original_price as number) ?? null,
          free_shipping: !!(r.shipping as { free_shipping?: boolean } | undefined)?.free_shipping,
          seller_id: r.seller_id as number,
          // Alguns retornos do catálogo trazem o id/permalink do anúncio
          // específico daquele vendedor — se vier, dá pra linkar direto
          // no anúncio mais barato em vez da página geral de catálogo
          // (que o ML pode mostrar com outro vendedor "em destaque").
          itemId: (r.item_id as string) ?? (r.id as string) ?? null,
          permalink: (r.permalink as string) ?? null,
        }))
        .sort((a: { price: number }, b: { price: number }) => a.price - b.price);
    }

    const image =
      product.pictures && product.pictures[0]
        ? product.pictures[0].url
        : null;

    const catalogUrl = `https://www.mercadolivre.com.br/p/${catalogId}`;
    const lowestPriceUrl = sellers.length ? (sellers[0].permalink || catalogUrl) : catalogUrl;

    return json({
      ok: true,
      catalogId,
      name: product.name || null,
      image,
      images: (product.pictures || []).map((p: { url: string }) => p.url),
      catalogUrl,
      lowestPriceUrl,
      sellersCount: sellers.length,
      lowestPrice: sellers.length ? sellers[0].price : null,
      sellers: sellers.slice(0, 8),
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
