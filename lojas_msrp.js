// ================================================================
// MyDeck — Preço sugerido do fabricante (lojas_msrp.js)
//
// Pedido do Eduardo (15/10/2026): rastrear a coleção "Celebração 30
// Anos" (Copag) e destacar quando o preço no Mercado Livre estiver
// IGUAL, ABAIXO ou até +10% do preço sugerido oficial da Copag.
//
// Como funciona:
//   • ml_search_terms ganhou 2 colunas (lojas_msrp_setup.sql):
//       msrp         NUMERIC — preço sugerido do fabricante
//       release_date DATE    — lançamento oficial no Brasil
//   • Na vitrine, produto com msrp e preço atual <= msrp × 1,10 entra
//     em "🔥 Ofertas em Destaque" (como se fosse pin manual), com o
//     selo "🎯 PREÇO DE TABELA". Não grava nada no banco — o pin é só
//     visual, então a estrela do admin continua intacta.
//   • Todo card com msrp mostra a linha "Sugerido Copag: R$ X · ±Y%".
//   • Antes de release_date, mostra selo "PRÉ-VENDA".
//   • A mensagem do botão "Enviar pro grupo" (lojas_whatsapp.js) ganha
//     a linha de comparação com o preço sugerido.
//
// Carregar DEPOIS de lojas_destaques.js e lojas_whatsapp.js — reaproveita
// as versões já ativas de renderShowcaseSection/renderProductCard
// (monkey-patch em camadas, sem tocar lojas.js).
// ================================================================

const MSRP_TOLERANCE = 0.10; // até +10% do sugerido conta como destaque

function msrpInfo(term, price) {
  const msrp = term && term.msrp != null ? +term.msrp : null;
  if (!msrp || !Number.isFinite(msrp) || !(price > 0)) return null;
  const pct = ((price - msrp) / msrp) * 100;
  return { msrp, price, pct, hit: price <= msrp * (1 + MSRP_TOLERANCE) + 0.005 };
}

function msrpIsPreRelease(term) {
  if (!term || !term.release_date) return false;
  return new Date() < new Date(term.release_date + 'T00:00:00-03:00');
}

function msrpPctLabel(pct) {
  if (Math.abs(pct) < 0.5) return 'no preço sugerido';
  return pct < 0 ? Math.abs(pct).toFixed(0) + '% abaixo' : '+' + pct.toFixed(0) + '%';
}

// ── 1. Destaque: marca "pin visual" só durante a montagem da vitrine ──
// loadSearchTerms() também é usada pelo painel admin; por isso o pin
// só é aplicado enquanto renderShowcaseSection() está rodando.
let _msrpInShowcase = false;

if (typeof window.loadSearchTerms === 'function') {
  const _origLoadSearchTerms = window.loadSearchTerms;
  window.loadSearchTerms = async function () {
    const terms = await _origLoadSearchTerms();
    if (!_msrpInShowcase || !terms.length || typeof sbClient === 'undefined' || !sbClient) return terms;
    const withMsrp = terms.filter(t => t.msrp != null);
    if (!withMsrp.length) return terms;
    try {
      const latest = await Promise.all(withMsrp.map(t =>
        sbClient.from('ml_price_history').select('price')
          .eq('term_id', t.id).order('found_at', { ascending: false }).limit(1)
          .then(r => (r.data && r.data[0]) ? +r.data[0].price : null)
      ));
      withMsrp.forEach((t, i) => {
        const info = msrpInfo(t, latest[i]);
        if (info && info.hit) { t.featured = true; t._msrpHit = true; }
      });
    } catch (e) { console.warn('lojas_msrp: falha lendo preços', e); }
    return terms;
  };
}

if (typeof window.renderShowcaseSection === 'function') {
  const _origRenderShowcase = window.renderShowcaseSection;
  window.renderShowcaseSection = async function () {
    _msrpInShowcase = true;
    try { return await _origRenderShowcase.apply(this, arguments); }
    finally { _msrpInShowcase = false; }
  };
}

// ── 2. Card: linha do sugerido + selos ─────────────────────────────
if (typeof window.renderProductCard === 'function') {
  const _origRenderProductCardMsrp = window.renderProductCard;
  window.renderProductCard = function (term, history, featured, coupon, rules, dealScore) {
    let html = _origRenderProductCardMsrp(term, history, featured, coupon, rules, dealScore);
    if (!term || term.msrp == null) return html;

    const latest = (history && history.length) ? history[history.length - 1] : null;
    const info = latest ? msrpInfo(term, +latest.price) : null;
    const pre = msrpIsPreRelease(term);

    if (info && info.hit) {
      html = html.replace('🔥 OFERTA IMPERDÍVEL', '🎯 PREÇO DE TABELA');
    }

    let line = '<div class="product-msrp' + (info && info.hit ? ' product-msrp-hit' : '') + '">' +
      'Sugerido Copag: R$ ' + fmtBRLLoja(term.msrp) +
      (info ? ' · <strong>' + msrpPctLabel(info.pct) + '</strong>' : '') +
      (pre ? ' · <span class="product-msrp-pre">PRÉ-VENDA até ' +
        new Date(term.release_date + 'T12:00:00').toLocaleDateString('pt-BR') + '</span>' : '') +
      '</div>';

    // Entra logo depois do bloco de preço (antes da nota "menor preço já registrado").
    const anchor = html.indexOf('<div class="product-note">');
    if (anchor !== -1) html = html.slice(0, anchor) + line + html.slice(anchor);
    else {
      const nameEnd = html.indexOf('</div>', html.indexOf('product-name'));
      if (nameEnd !== -1) html = html.slice(0, nameEnd + 6) + line + html.slice(nameEnd + 6);
    }

    // ── 3. Mensagem do WhatsApp ──
    const msgs = window._lojasWhatsappMsgs;
    if (info && msgs && msgs[term.id] && msgs[term.id].indexOf('Preço sugerido') === -1) {
      const extra = '🏷️ Preço sugerido Copag: R$ ' + fmtBRLLoja(term.msrp) + ' — ' +
        (info.pct <= 0.5 ? '✅ ' : '') + msrpPctLabel(info.pct) + '\n' +
        (pre ? '⏳ Pré-venda — lançamento ' + new Date(term.release_date + 'T12:00:00').toLocaleDateString('pt-BR') + '\n' : '');
      const linkIdx = msgs[term.id].lastIndexOf('\n🔗');
      msgs[term.id] = linkIdx === -1 ? msgs[term.id] + '\n' + extra
        : msgs[term.id].slice(0, linkIdx) + extra + msgs[term.id].slice(linkIdx);
    }
    return html;
  };
}

(function injectMsrpStyle() {
  const css =
    '.product-msrp{margin-top:6px;font-family:"Space Mono",monospace;font-size:10.5px;color:var(--muted,#8a90b0)}' +
    '.product-msrp strong{color:var(--text,#e8eaf6)}' +
    '.product-msrp-hit{color:var(--teal,#06d6a0)}' +
    '.product-msrp-hit strong{color:var(--teal,#06d6a0)}' +
    '.product-msrp-pre{color:var(--gold,#ffd166);font-weight:700}';
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

// ── 4. Aviso de promoção no celular (type 'deal_alert') ────────────
// Os avisos são criados no banco por ml_check_deals() (lojas_ml_update15.sql)
// e o push sai pelo notify-dispatch de sempre. Aqui só: ícone no sino e,
// ao tocar no aviso com o site aberto, abrir o link da oferta (com o app
// fechado, o service worker já abre data.url direto).
(function setupDealAlertNotifications() {
  try { if (typeof NOTIF_ICON !== 'undefined') NOTIF_ICON.deal_alert = '💰'; } catch (e) { /* sino não carregado */ }
  if (typeof window.notifRoute === 'function') {
    const _origNotifRoute = window.notifRoute;
    window.notifRoute = function (n) {
      if (n && n.type === 'deal_alert') {
        const url = n.data && typeof n.data.url === 'string' ? n.data.url : null;
        if (url && /^https:\/\//.test(url)) window.open(url, '_blank', 'noopener');
        else if (typeof goToTab === 'function') goToTab('lojas');
        return;
      }
      return _origNotifRoute.apply(this, arguments);
    };
  }
})();
