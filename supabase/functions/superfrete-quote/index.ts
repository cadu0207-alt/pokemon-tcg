// ================================================================
// MyDeck — Supabase Edge Function: superfrete-quote
// 31/08/2026
//
// Cotação ESTIMADA de frete (SuperFrete → Correios/transportadoras)
// pra leilão, rifa e (depois) loja/marketplace. Não gera etiqueta, não
// move dinheiro — só devolve preço + prazo pro comprador ter uma ideia
// antes de combinar o envio de verdade com o vendedor pelo WhatsApp.
//
// Por que precisa ser Edge Function (não dá pra chamar direto do
// front, tipo leilao.js):
//   1. Token do SuperFrete não pode existir no client (JS público).
//   2. O CEP de ORIGEM é do VENDEDOR (leiloeiro/rifeiro/loja), não de
//      quem está chamando — e RLS de user_addresses só deixa cada um
//      ler a própria linha. Só o service_role (aqui dentro) consegue
//      ler o endereço de outro usuário pra montar a cotação.
//
// Contexto suportado hoje (o gate de "endereço" pega o erro claro
// "vendedor sem CEP cadastrado" — é o mesmo aviso que serve de sinal
// pro leiloeiro/rifeiro completar o cadastro antes da 1ª venda):
//   context: 'auction_round'      → context_id = auction_rounds.id
//   context: 'raffle'             → context_id = raffles.id
//   context: 'marketplace_store'  → context_id = trusted_stores.id
//
// ⚠️ VERIFICAR ANTES DE IR PRA PRODUÇÃO:
// O payload/resposta abaixo segue o formato publicamente conhecido da
// API do SuperFrete (POST /api/v0/calculator), mas não pôde ser
// confirmado ao vivo nesta sessão (robots.txt bloqueou o fetch da doc
// em superfrete.readme.io). Antes de confiar nos valores:
//   1. Crie conta em superfrete.com → pegue o token em "Integrações
//      > API" (ou o token de sandbox, se eles ainda oferecerem).
//   2. Rode uma cotação de teste (Postman/Insomnia) com CEPs reais e
//      confirme os nomes de campo no corpo E na resposta batem com o
//      que este arquivo espera — ajuste PAYLOAD_BODY / parseQuotes()
//      se algo tiver mudado.
//   3. Só depois disso divulgar os valores pros usuários.
//
// Deploy:
//   supabase functions deploy superfrete-quote
// Secrets necessários (supabase secrets set ...):
//   SUPERFRETE_TOKEN     (token de API do SuperFrete, conta do Eduardo)
//   SUPERFRETE_BASE_URL  (opcional — default abaixo é produção; use
//                         a URL de sandbox deles aqui enquanto testa)
// (SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já
// existem automaticamente dentro de toda Edge Function.)
//
// Uso: POST /functions/v1/superfrete-quote
//      { context, context_id, destination_cep, package_type, quantity }
//      Header: Authorization: Bearer <access_token do usuário logado>
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_BASE_URL = 'https://api.superfrete.com';
const SUPERFRETE_BASE_URL = Deno.env.get('SUPERFRETE_BASE_URL') || DEFAULT_BASE_URL;
const SUPERFRETE_TOKEN = Deno.env.get('SUPERFRETE_TOKEN') ?? '';

// Cache de cotação — evita bater na API de novo pro mesmo par
// origem/destino/pacote em poucos minutos (freight_quote_cache, ver
// frete_setup.sql). TTL curto porque preço de frete muda com o tempo.
const CACHE_TTL_MINUTES = 30;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

// Mesma tabela de FRETE_PACKAGE_TYPES do frete.js — mantenha os dois
// sincronizados se ajustar peso/dimensão.
const PACKAGE_TYPES: Record<string, { peso_g: number; compr_cm: number; larg_cm: number; alt_cm: number }> = {
  avulsa:     { peso_g: 150,  compr_cm: 20, larg_cm: 14, alt_cm: 2 },
  quadripack: { peso_g: 200,  compr_cm: 20, larg_cm: 15, alt_cm: 5 },
  etb:        { peso_g: 700,  compr_cm: 30, larg_cm: 23, alt_cm: 9 },
  displaybox: { peso_g: 1000, compr_cm: 30, larg_cm: 20, alt_cm: 10 },
};

interface QuoteResult { service: string; price: number; dias: number | null }

// Resolve o CEP de origem (vendedor) a partir do contexto. Retorna
// null se o vendedor ainda não completou o próprio endereço — o front
// mostra isso como "complete seu endereço antes de vender" (mesmo
// espírito de requireSellerAcceptance em leilao.js).
async function resolveOriginCep(context: string, contextId: number | string): Promise<{ cep: string } | { error: string }> {
  if (context === 'auction_round') {
    const { data: round } = await sbAdmin.from('auction_rounds').select('created_by').eq('id', contextId).maybeSingle();
    if (!round) return { error: 'Rodada de leilão não encontrada.' };
    const { data: addr } = await sbAdmin.from('user_addresses').select('cep').eq('user_id', round.created_by).maybeSingle();
    if (!addr?.cep) return { error: 'O leiloeiro ainda não cadastrou o CEP de origem. Peça pra ele completar o endereço no painel dele antes.' };
    return { cep: addr.cep };
  }
  if (context === 'raffle') {
    const { data: raffle } = await sbAdmin.from('raffles').select('created_by').eq('id', contextId).maybeSingle();
    if (!raffle) return { error: 'Rifa não encontrada.' };
    const { data: addr } = await sbAdmin.from('user_addresses').select('cep').eq('user_id', raffle.created_by).maybeSingle();
    if (!addr?.cep) return { error: 'O rifeiro ainda não cadastrou o CEP de origem. Peça pra ele completar o endereço no painel dele antes.' };
    return { cep: addr.cep };
  }
  if (context === 'marketplace_store') {
    const { data: store } = await sbAdmin.from('trusted_stores').select('cep').eq('id', contextId).maybeSingle();
    if (!store?.cep) return { error: 'Essa loja ainda não cadastrou CEP de origem.' };
    return { cep: store.cep };
  }
  return { error: `Contexto de cotação desconhecido: "${context}".` };
}

function computePackage(packageType: string, quantity: number) {
  const base = PACKAGE_TYPES[packageType] || PACKAGE_TYPES.avulsa;
  const qty = Math.max(1, Math.min(quantity || 1, 50));
  return {
    weightKg: (base.peso_g * qty) / 1000,
    // Mais de um item empilha altura, não largura/comprimento —
    // heurística simples: soma altura extra por item adicional.
    heightCm: base.alt_cm + Math.max(0, qty - 1) * Math.max(1, Math.round(base.alt_cm * 0.3)),
    widthCm: base.larg_cm,
    lengthCm: base.compr_cm,
  };
}

// Monta o payload do SuperFrete. Formato baseado na documentação
// pública conhecida — CONFIRME contra a doc/sandbox real antes de
// confiar (ver aviso no topo do arquivo).
function buildSuperfretePayload(originCep: string, destCep: string, pkg: ReturnType<typeof computePackage>) {
  return {
    from: { postal_code: originCep.replace(/\D/g, '') },
    to: { postal_code: destCep.replace(/\D/g, '') },
    services: '1,2,17', // PAC, SEDEX, Jadlog .Package — ajustar/expandir depois de confirmar os códigos válidos na conta
    options: { insurance_value: 0, receipt: false, own_hand: false },
    products: [{
      id: '1',
      width: pkg.widthCm,
      height: pkg.heightCm,
      length: pkg.lengthCm,
      weight: pkg.weightKg,
      insurance_value: 0,
      quantity: 1,
    }],
  };
}

// Normaliza a resposta do SuperFrete pro formato simples que o front
// usa. Defensivo de propósito (tenta vários nomes de campo) porque o
// contrato exato não pôde ser confirmado ao vivo nesta sessão.
function parseQuotes(raw: unknown): QuoteResult[] {
  const list = Array.isArray(raw) ? raw : (raw as any)?.data ?? [];
  const out: QuoteResult[] = [];
  for (const q of list) {
    if (!q || q.error) continue; // SuperFrete marca serviço indisponível com um campo "error" na própria linha
    const service = q.name || q.company?.name || q.service || 'Transportadora';
    const priceRaw = q.price ?? q.custom_price ?? q.total ?? null;
    const price = priceRaw != null ? parseFloat(priceRaw) : null;
    if (price == null || Number.isNaN(price)) continue;
    const dias = q.delivery_time ?? q.custom_delivery_time ?? q.delivery_range?.max ?? null;
    out.push({ service, price, dias: dias != null ? Number(dias) : null });
  }
  out.sort((a, b) => a.price - b.price);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const sbUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ ok: false, error: 'Faça login para calcular o frete.' }, 401);
    }

    if (!SUPERFRETE_TOKEN) {
      return json({ ok: false, error: 'Cotação de frete ainda não configurada (falta o token do SuperFrete no servidor).' }, 500);
    }

    const { context, context_id, destination_cep, package_type, quantity } = await req.json();
    if (!context || context_id == null) return json({ ok: false, error: 'context e context_id são obrigatórios.' }, 400);
    const destCepDigits = (destination_cep || '').replace(/\D/g, '');
    if (destCepDigits.length !== 8) return json({ ok: false, error: 'CEP de destino inválido.' }, 400);

    const origin = await resolveOriginCep(context, context_id);
    if ('error' in origin) return json({ ok: false, error: origin.error }, 422);

    const pkg = computePackage(package_type, quantity);
    const cacheKey = `${context}:${context_id}:${destCepDigits}:${package_type || 'avulsa'}:${quantity || 1}`;

    const { data: cached } = await sbAdmin
      .from('freight_quote_cache')
      .select('quotes, created_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (cached && (Date.now() - new Date(cached.created_at).getTime()) < CACHE_TTL_MINUTES * 60 * 1000) {
      return json({ ok: true, quotes: cached.quotes, cached: true });
    }

    const payload = buildSuperfretePayload(origin.cep, destCepDigits, pkg);
    const sfResp = await fetch(`${SUPERFRETE_BASE_URL}/api/v0/calculator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${SUPERFRETE_TOKEN}`,
        // SuperFrete pede um User-Agent identificando app + contato —
        // troque o e-mail se não for esse.
        'User-Agent': 'MyDeck TCG (cadu0207@gmail.com)',
      },
      body: JSON.stringify(payload),
    });

    if (!sfResp.ok) {
      const errText = await sfResp.text().catch(() => '');
      console.error('[superfrete-quote] SuperFrete respondeu erro', sfResp.status, errText);
      return json({ ok: false, error: 'A cotação de frete falhou. Tente de novo em instantes.' }, 502);
    }

    const sfData = await sfResp.json();
    const quotes = parseQuotes(sfData);

    await sbAdmin.from('freight_quote_cache')
      .upsert({ cache_key: cacheKey, quotes, created_at: new Date().toISOString() }, { onConflict: 'cache_key' });

    return json({ ok: true, quotes });
  } catch (e) {
    console.error('[superfrete-quote] erro inesperado', e);
    return json({ ok: false, error: 'Erro inesperado ao calcular o frete.' }, 500);
  }
});
