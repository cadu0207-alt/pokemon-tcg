// ================================================================
// MyDeck — Cotação de frete (SuperFrete) — módulo compartilhado
// 31/08/2026
//
// Usado por leilão, rifa e (depois) marketplace/loja pra mostrar uma
// ESTIMATIVA de frete antes de combinar pagamento/envio direto com o
// vendedor. NÃO gera etiqueta, NÃO processa pagamento de frete — é só
// informativo, do mesmo jeito que o resto do fluxo de leilão/rifa hoje
// (pagamento e envio combinados por fora, no WhatsApp).
//
// Como funciona:
//  1. Cada tipo de item (carta avulsa, quadripack, ETB, display box)
//     tem peso/dimensão padrão FIXO — ver FRETE_PACKAGE_TYPES abaixo.
//     São estimativas; ajuste os valores aqui se a pesagem real (numa
//     balança) divergir muito do que o SuperFrete cobrar de verdade.
//  2. O CEP de ORIGEM (do vendedor) nunca é lido pelo navegador de quem
//     está comprando — quem resolve isso é a Edge Function
//     superfrete-quote, usando service_role (mesmo motivo de
//     shipping_snapshot em leilao.js: RLS não deixa um usuário ler o
//     endereço de outro). O front só manda contexto + CEP de destino.
//  3. O CEP de destino é o do COMPRADOR — pode vir pré-preenchido do
//     endereço salvo dele (user_addresses) ou ser digitado na hora.
//
// ⚠️ IMPORTANTE ANTES DE CONFIAR NOS VALORES EM PRODUÇÃO:
// O formato exato do payload/resposta da API do SuperFrete (endpoint
// /api/v0/calculator) foi escrito com base no que é publicamente
// documentado, mas não pôde ser confirmado ao vivo nesta sessão (o
// robots.txt do superfrete.readme.io bloqueou o fetch automático).
// Teste com uma chamada real (sandbox ou produção com valor baixo)
// antes de divulgar os preços pros usuários — ver comentário no topo
// de supabase/functions/superfrete-quote/index.ts.
// ================================================================

// Peso (gramas) e dimensões (cm) por tipo de pacote.
const FRETE_PACKAGE_TYPES = {
  avulsa:     { label: 'Carta avulsa (toploader + envelope)', peso_g: 150,  compr_cm: 20, larg_cm: 14, alt_cm: 2 },
  quadripack: { label: 'Quadripack / blister pequeno',        peso_g: 200,  compr_cm: 20, larg_cm: 15, alt_cm: 5 },
  etb:        { label: 'Elite Trainer Box (ETB)',             peso_g: 700,  compr_cm: 30, larg_cm: 23, alt_cm: 9 },
  displaybox: { label: 'Display Box (booster box)',           peso_g: 1000, compr_cm: 30, larg_cm: 20, alt_cm: 10 },
};

function freteLabelForType(type) {
  return FRETE_PACKAGE_TYPES[type]?.label || type || 'Item';
}

function freteOnCepInput(el) {
  const d = (el.value || '').replace(/\D/g, '').slice(0, 8);
  el.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// ── Chamada à Edge Function ─────────────────────────────────────
// context identifica de onde vem o CEP de origem: hoje só
// 'auction_round' está implementado de ponta a ponta na Edge Function;
// 'raffle' e 'marketplace_store' seguem o mesmo contrato, só faltando
// o branch equivalente lá (ver TODO no index.ts da function).
//
//   getFreteQuote({context:'auction_round', context_id:12, destination_cep:'01310100', package_type:'avulsa', quantity:1})
//
// Retorna {ok:true, quotes:[{service,price,dias}]} ou {ok:false,error}.
async function getFreteQuote({ context, context_id, destination_cep, package_type, quantity }) {
  const cepDigits = (destination_cep || '').replace(/\D/g, '');
  if (cepDigits.length !== 8) return { ok: false, error: 'Informe um CEP de destino válido (8 dígitos).' };
  try {
    const { data: sessionData } = await sbClient.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { ok: false, error: 'Faça login para calcular o frete.' };
    const resp = await fetch(SUPABASE_URL + '/functions/v1/superfrete-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        context,
        context_id,
        destination_cep: cepDigits,
        package_type: package_type || 'avulsa',
        quantity: quantity || 1,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) return { ok: false, error: data.error || 'Não foi possível calcular o frete agora.' };
    return { ok: true, quotes: data.quotes || [] };
  } catch (e) {
    console.error('[frete] getFreteQuote', e);
    return { ok: false, error: 'Erro de conexão ao calcular o frete. Tente de novo em instantes.' };
  }
}

// ── Widget reutilizável: input de CEP + botão + resultado ─────────
// idSuffix precisa ser único na tela (ex: o id do pedido de leilão) pra
// poder ter mais de um bloco de cotação na mesma página.
const _freteBlockOpts = {};

function freteQuoteBlockHtml(idSuffix, opts = {}) {
  _freteBlockOpts[idSuffix] = opts;
  return `<div class="mkt-note" style="margin-top:10px">
    <b>📦 Calcular frete estimado</b>
    <div style="font-size:9.5px;color:var(--muted);margin:4px 0 8px">Estimativa via SuperFrete (Correios/transportadoras) — não substitui o combinado com o vendedor, nem inclui seguro/frete grátis eventualmente oferecido.</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <input id="frete-cep-${idSuffix}" placeholder="Seu CEP" value="${esc(opts.initialCep || '')}" oninput="freteOnCepInput(this)" style="max-width:140px" maxlength="9">
      <button class="btn-add" style="width:auto;padding:6px 14px" onclick="runFreteQuote('${idSuffix}')">Calcular</button>
    </div>
    <div id="frete-result-${idSuffix}" style="margin-top:8px;font-size:11px"></div>
  </div>`;
}

async function runFreteQuote(idSuffix) {
  const opts = _freteBlockOpts[idSuffix] || {};
  const cepEl = document.getElementById(`frete-cep-${idSuffix}`);
  const resEl = document.getElementById(`frete-result-${idSuffix}`);
  if (!resEl) return;
  resEl.innerHTML = `<span style="color:var(--muted)">Calculando...</span>`;
  const r = await getFreteQuote({ ...opts, destination_cep: cepEl?.value });
  if (!r.ok) { resEl.innerHTML = `<span style="color:var(--accent)">${esc(r.error)}</span>`; return; }
  if (!r.quotes.length) { resEl.innerHTML = `<span style="color:var(--muted)">Nenhuma transportadora retornou cotação pra esse CEP.</span>`; return; }
  resEl.innerHTML = r.quotes.map(q =>
    `<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding:4px 0">
      <span>${esc(q.service)}</span>
      <span><b style="color:var(--teal)">R$ ${fmtR(q.price)}</b> <span style="color:var(--muted)">· ${q.dias ? q.dias + ' dia(s)' : '—'}</span></span>
    </div>`
  ).join('');
}
