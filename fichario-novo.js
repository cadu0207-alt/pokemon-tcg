/* Fichário (beta) — interface nova do MyDeck.
 * Usa o MESMO motor do site (app.js): login, leitura da coleção, toggleSlot() e catálogos.
 * Esta página só troca o visual. Nada aqui grava no banco por conta própria: toda marcação passa
 * por toggleSlot(), a mesma função do fichário atual — então o que se marca aqui aparece lá e vice-versa.
 * Modo demonstração (?demo): coleção fictícia só na tela, não grava nada. */
(function () {
  'use strict';

  // ── utilidades ─────────────────────────────────────────────
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); };
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('fn_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('fn_' + k, JSON.stringify(v)); } catch (e) { } }
  };
  var CUR = 'R$'; // moeda da coleção na tela: '$' só quando o idioma é EN e as cartas têm preço em dólar (hoje: Celebração 30 Anos)
  var money = function (v) {
    if (v == null || isNaN(v)) return '—';
    return CUR === '$' ? '$ ' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var money0 = function (v) { return v >= 100 ? (CUR === '$' ? '$ ' + Math.round(v).toLocaleString('en-US') : 'R$ ' + Math.round(v).toLocaleString('pt-BR')) : money(v); };

  var DEMO = /[?&]demo\b/.test(location.search);
  var VERSION_NAME = { N: 'Normal', RH: 'Reverse Holo', RH2: 'Reverse Holo 2', F: 'Foil / Holo', SP: 'Especial' };
  var GROUP_NAME = { ME: 'Mega Evolução', SV: 'Escarlate & Violeta' };

  // ── estado ─────────────────────────────────────────────────
  var defCols = innerWidth < 480 ? 3 : innerWidth < 800 ? 4 : innerWidth < 1200 ? 6 : 7;
  var st = {
    set: (location.hash || '').replace('#', '') || LS.get('set', 'me06'),
    q: '', status: 'all', sort: 'num',
    view: LS.get('view', 'grid'),
    cols: LS.get('cols', defCols),
    lang: LS.get('lang', 'pt'), // idioma próprio do fichário novo (começa em PT: quem usava EN só para ver a arte no fichário atual não "perde" a coleção de vista)
    pocket: (function () { var p = String(LS.get('pocket', '9')); return p === '20a' ? '20b' : p; })(), // 4×5 foi removido: quem tinha escolhido passa ao 5×4
    imp: false,
    focus: !!LS.get('focus', false),
    artist: '',
    bpage: 0
  };
  var POCKETS = [{ id: '4', cols: 2, per: 4, label: '2×2' }, { id: '9', cols: 3, per: 9, label: '3×3' }, { id: '12', cols: 4, per: 12, label: '4×3' },
    { id: '16', cols: 4, per: 16, label: '4×4' }, { id: '20b', cols: 5, per: 20, label: '5×4' }];
  function pocketCfg() { return POCKETS.filter(function (p) { return p.id === String(st.pocket); })[0] || POCKETS[1]; }
  var FAMILY = ['cel30', 'cel30jp', 'cel30cn'];
  var REGION = { pt: 'cel30', en: 'cel30', jp: 'cel30jp', cn: 'cel30cn' };
  function setKey(id) { return FAMILY.indexOf(id) >= 0 ? 'cel30' : id; }
  var demoSet = new Set();
  var demoQty = new Map();
  (function seedDemo() {
    if (!DEMO) return;
    var seed = 7; var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    window.__fnSeed = rnd;
  })();

  // ── ponte com o motor ──────────────────────────────────────
  function engineReady() { return typeof getSetData === 'function' && typeof getSlots === 'function' && typeof SET_CATALOG !== 'undefined'; }
  function loggedIn() { try { return !!uid(); } catch (e) { return false; } }
  function has(key) { return DEMO ? demoSet.has(key) : (typeof collected !== 'undefined' && collected.has(key)); }
  // Pokédex: a tela mistura cartas de VÁRIOS sets. Cada carta carrega o seu set real (_set) e uma chave única (_k = "set~n").
  // Fora da Pokédex nada muda: _set/_k não existem, então vale o set da tela e o número da carta.
  function ck(c) { return c._k || c.n; }
  function sidOf(id, c) { return c._set || id; }
  function findCard(k) { return cur.cards.filter(function (x) { return String(ck(x)) === String(k); })[0]; }
  // 17/11/2026: cada idioma tem a sua própria coleção. Português mantém as chaves de sempre ("me04:001:N");
  // EN e JP ganham sufixo no código do set ("me04-en:001:N"). cel30jp/cel30cn já são coleções próprias; a Pokédex é sempre PT.
  // O banco trata um código de set sem catálogo como "slot desconhecido": grava normalmente, só não dá XP.
  function langSfx(sid) {
    if (sid === 'cel30jp' || sid === 'cel30cn') return '';
    var l = effLang(sid); return l === 'pt' ? '' : '-' + l;
  }
  function keyOf(id, c, ver) { var sid = sidOf(id, c); return slotKey(sid + (c._k ? '' : langSfx(sid)) + ':', c.n, ver); }
  // preço do slot no idioma da coleção (EN usa dólar quando a carta tem; senão mantém o preço em R$)
  function priceOf(id, c, sl) {
    var base = (sl && sl.price != null) ? sl.price : c.price;
    if (c._k || effLang(sidOf(id, c)) === 'pt') return base || 0;
    var i = i18n(c, id); if (i.symbol !== '$' || !c.price) return base || 0;
    return (i.price || 0) * ((base || c.price) / c.price);
  }

  function setData(id) {
    var prev = currentSet;
    try {
      currentSet = id;
      var d = getSetData();
      if (id !== 'me04' && d && d.cards === CARDS) return null; // id desconhecido caiu no fallback do me04
      return d;
    } catch (e) { return null; } finally { currentSet = prev; }
  }
  function slotsOf(id, c) { try { return getSlots(c, sidOf(id, c)) || []; } catch (e) { return []; } }
  function stateOf(id, c) {
    var sl = slotsOf(id, c); if (!sl.length) return { st: 'miss', have: 0, tot: 0, sl: sl };
    var h = 0; sl.forEach(function (s) { if (has(keyOf(id, c, s.ver))) h++; });
    return { st: h === 0 ? 'miss' : h === sl.length ? 'have' : 'part', have: h, tot: sl.length, sl: sl };
  }
  function langsOf(id) { return (typeof FIC_LANG_SETS !== 'undefined' && FIC_LANG_SETS[id]) || null; }
  // idioma efetivo da arte/nomes nesta coleção (cel30jp/cel30cn são coleções próprias; sem suporte = português)
  function effLang(id) {
    var l = langsOf(id); if (!l) return 'pt';
    if (id === 'cel30jp') return 'jp'; if (id === 'cel30cn') return 'cn';
    return l.indexOf(st.lang) >= 0 ? st.lang : 'pt';
  }
  function i18n(c, id) { try { return cardI18n(c, effLang(sidOf(id, c))); } catch (e) { return { name: c.name, price: c.price, symbol: 'R$' }; } }
  function priceFmt(c, id) {
    var i = i18n(c, id); if (i.price == null || isNaN(i.price)) return '—';
    return i.symbol === '$' ? '$ ' + Number(i.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : money0(i.price);
  }
  function imgSrc(d, id, c, big) {
    var u = imgRaw(d, id, c);
    if (big) return u;
    try { return typeof imgThumb === 'function' ? imgThumb(u) : u; } catch (e) { return u; }
  }
  function imgRaw(d, id, c) {
    try {
      var sid = sidOf(id, c);
      if (typeof getBinderImg === 'function') { var u = getBinderImg(c, sid, effLang(sid)); if (u) return u; }
      if (d && d.imgFn) { var u2 = d.imgFn(c.n); if (u2) return u2; }
    } catch (e) { }
    return c.img || '';
  }
  // quantidade e origens de uma versão (lê do motor; em demonstração, de um mapa local)
  function entryOf(key) {
    if (DEMO) return demoSet.has(key) ? (demoQty.get(key) || { qty: 1, origins: [] }) : { qty: 0, origins: [] };
    if (typeof collectedQty !== 'undefined' && collectedQty.has(key)) { var e = collectedQty.get(key); return { qty: e.qty || 1, origins: (e.origins || []).slice() }; }
    return { qty: has(key) ? 1 : 0, origins: [] };
  }
  // número da Pokédex da carta (campo dex do catálogo ou, se faltar, pelo nome em inglês)
  var dexMemo = new Map(), dexBySlug = null;
  function dexOf(c) {
    if (c.dex != null && c.dex !== '') { var n0 = parseInt(String(c.dex).split(',')[0], 10); if (!isNaN(n0)) return n0; }
    if (dexMemo.has(c)) return dexMemo.get(c);
    var v = null;
    try {
      if (typeof normalizeCardNameToSpeciesSlug === 'function' && typeof POKEDEX_NACIONAL !== 'undefined') {
        if (!dexBySlug) { dexBySlug = {}; POKEDEX_NACIONAL.forEach(function (x) { dexBySlug[x.slug] = x.dex; }); }
        var sl = normalizeCardNameToSpeciesSlug(c.nameEn || c.name); v = (sl && dexBySlug[sl]) || null;
      }
    } catch (e) { }
    dexMemo.set(c, v); return v;
  }
  function rareCls(r) {
    r = r || '';
    if (/Hiper|Hyper|Mega Attack/i.test(r)) return 'rr-hyper';
    if (/Especial|SAR|SIR/i.test(r)) return 'rr-sir';
    if (/Ilustr|\bIR\b/i.test(r)) return 'rr-ir';
    if (/Ultra|\bUR\b/i.test(r)) return 'rr-ur';
    if (/Dupla|Double|\bRR\b/i.test(r)) return 'rr-dr';
    return '';
  }
  // Nome como o colecionador brasileiro fala. Só para exibir: c.rare (original) segue definindo slots, cor e ordem.
  function rareLabel(r) {
    r = r || '';
    if (/Hiper|Hyper|Mega Attack/i.test(r)) return r;
    if (/Ilustr.*Esp|Especial|\bSAR\b|\bSIR\b|Special Illustration/i.test(r)) return 'Ilustração Rara Especial';
    if (/Ilustr|Illustration|\bIR\b/i.test(r)) return 'Ilustração Rara';
    if (/Ultra|\bUR\b/i.test(r)) return 'Full Art';
    if (/Dupla|Double|\bRR\b/i.test(r)) return 'Dupla Rara';
    return r;
  }
  function rareRank(r) {
    r = r || '';
    if (/Hiper|Hyper|Attack/i.test(r)) return 9;
    if (/Especial|SAR|SIR/i.test(r)) return 8;
    if (/Ultra|\bUR\b/i.test(r)) return 7;
    if (/Ilustr|\bIR\b/i.test(r)) return 6;
    if (/Dupla|Double|RR/i.test(r)) return 5;
    if (/Holo|Rara/i.test(r)) return 4;
    if (/Incomum/i.test(r)) return 2;
    return 1;
  }

  // ── dados da tela atual ────────────────────────────────────
  var cur = { d: null, cards: [], view: [] };
  // ── Pokédex (Master Set Nacional e regionais) ──────────────
  // São os MESMOS fichários do site atual: tabela custom_binders, filter_config.type = 'masterdex', card_ids = [{set,n,dex}]
  // (uma entrada por vaga PREENCHIDA; vaga sem entrada = sem carta escolhida, mostra a arte neutra do Pokémon).
  // Aqui só lemos e trocamos a carta de cada vaga. As marcações N/RH/F continuam nos slots das coleções reais.
  var REGION_META = { 1: ['🔴', '#E53935'], 2: ['🟡', '#FDD835'], 3: ['🟢', '#43A047'], 4: ['💎', '#5C6BC0'], 5: ['⚫', '#424242'], 6: ['🌸', '#EC407A'], 7: ['🌺', '#FF7043'], 8: ['⚔️', '#7E57C2'], 9: ['🍇', '#8E24AA'] };
  function isDex(id) { return /^dex:/.test(String(id)); }
  var demoBinders = null, dexIdx = null, picker = null, dexLimit = 300;
  function normTxt(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function setLabelOf(sid) { var s = SET_CATALOG.filter(function (x) { return x.id === sid; })[0]; return s ? (s.label || sid) : sid; }
  // catálogo inteiro agrupado por espécie (1x; refaz quando os sets legados terminam de carregar)
  function dexIndex() {
    if (dexIdx) return dexIdx;
    var by = {};
    try {
      Object.keys(SET_CARDS_MAP).forEach(function (sid) {
        var cards = []; try { cards = SET_CARDS_MAP[sid]() || []; } catch (e) { return; }
        cards.forEach(function (c) { var d = dexOf(c); if (d == null) return; (by[d] = by[d] || []).push({ set: sid, c: c }); });
      });
    } catch (e) { }
    return (dexIdx = by);
  }
  function dexBinders() {
    if (DEMO) {
      if (!demoBinders) {
        var by = dexIndex(), refs = [];
        for (var d = 1; d <= 120; d++) { if (d % 3 === 0 || !by[d]) continue; refs.push({ set: by[d][0].set, n: by[d][0].c.n, dex: d }); }
        if (!refs.length) return [];
        demoBinders = [{ id: 'demo', name: '🌐 Pokédex (demonstração)', emoji: '🌐', cover_color: '#118ab2', filter_config: { type: 'masterdex', dexFrom: 1, dexTo: 151 }, card_ids: refs }];
      }
      return demoBinders;
    }
    try { return (customBinders || []).filter(function (b) { return b && b.filter_config && b.filter_config.type === 'masterdex'; }); } catch (e) { return []; }
  }
  function dexBinder(id) { return dexBinders().filter(function (b) { return 'dex:' + b.id === String(id); })[0] || null; }
  function dexRange(b) { var f = b.filter_config || {}; return { from: f.dexFrom || 1, to: f.dexTo || (typeof POKEDEX_NACIONAL !== 'undefined' ? POKEDEX_NACIONAL.length : 1025) }; }
  // carta de cada vaga preenchida. `pending` = referências que ainda não acharam a carta (set legado carregando): nunca grave nada enquanto > 0
  function dexResolve(b) {
    var memo = {}, cards = [], byDex = {}, miss = 0;
    (b.card_ids || []).forEach(function (r) {
      if (!(r.set in memo)) { try { memo[r.set] = SET_CARDS_MAP[r.set]() || []; } catch (e) { memo[r.set] = []; } }
      var card = memo[r.set].filter(function (x) { return String(x.n) === String(r.n); })[0];
      if (!card) { miss++; return; }
      var c = Object.assign({}, card, { _set: r.set, _k: r.set + '~' + card.n, _dex: Number(r.dex) });
      cards.push(c); byDex[c._dex] = c;
    });
    return { cards: cards, byDex: byDex, pending: miss };
  }
  function loadDex() {
    var b = dexBinder(st.set);
    cur.binder = b; cur.pending = 0; cur.byDex = {}; cur.species = [];
    if (!b || typeof POKEDEX_NACIONAL === 'undefined') { cur.d = null; cur.cards = []; return; }
    var r = dexResolve(b), rg = dexRange(b);
    cur.cards = r.cards; cur.byDex = r.byDex; cur.pending = r.pending;
    cur.species = POKEDEX_NACIONAL.filter(function (sp) { return sp.dex >= rg.from && sp.dex <= rg.to; });
    cur.d = { label: b.name, cards: r.cards, sections: [], dex: true };
    if (DEMO && !demoSet.size) cur.cards.forEach(function (c) { slotsOf(st.set, c).forEach(function (s) { if (window.__fnSeed() < 0.45) demoSet.add(keyOf(st.set, c, s.ver)); }); });
  }
  function dexOwned(c) { return !!c && stateOf(st.set, c).have > 0; }
  function dexProg(b) {
    var key = 'dex:' + b.id; if (progCache[key] !== undefined) return progCache[key];
    var r = dexResolve(b), rg = dexRange(b), tot = rg.to - rg.from + 1, got = 0;
    r.cards.forEach(function (c) { var any = false; slotsOf('', c).forEach(function (s) { if (has(keyOf('', c, s.ver))) any = true; }); if (any) got++; });
    if (r.pending) return { got: got, tot: tot, pct: tot ? Math.round(got / tot * 100) : 0 }; // incompleto: não guarda
    return (progCache[key] = { got: got, tot: tot, pct: tot ? Math.round(got / tot * 100) : 0 });
  }
  function dexArt(d) { return d <= 151 ? 'assets/wild/' + d + '.webp' : 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/' + d + '.png'; }
  window.__fnArtFb = function (img, d) {
    var s = img.dataset.fb || '0';
    if (s === '0') { img.dataset.fb = '1'; img.src = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/' + d + '.png'; }
    else if (s === '1') { img.dataset.fb = '2'; img.src = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' + d + '.png'; }
    else img.style.display = 'none';
  };
  function artImg(d) { return '<img loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" src="' + esc(dexArt(d)) + '"' + (d > 151 ? ' onerror="__fnArtFb(this,' + d + ')"' : '') + '>'; }
  // espécies visíveis com os filtros da tela (busca sem acento, "faltantes", "coletadas")
  function dexVisible() {
    var words = normTxt(st.q).split(/\s+/).filter(Boolean), out = [];
    cur.species.forEach(function (sp) {
      var c = cur.byDex[sp.dex], own = dexOwned(c);
      if (words.length) {
        var hay = normTxt(sp.name + ' ' + sp.dex + (c ? ' ' + c.name + ' ' + c.n + ' ' + c._set + ' ' + setLabelOf(c._set) : ''));
        if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return;
      }
      if (st.status === 'miss' && own) return;
      if (st.status === 'have' && !own) return;
      out.push({ sp: sp, c: c });
    });
    return out;
  }
  function dexTile(x) {
    if (x.c) return cardHtml(x.c);
    var sp = x.sp;
    return '<article class="fn-card is-miss fn-ph" data-dexph="' + sp.dex + '"><button type="button" class="fn-img" data-dexpick="' + sp.dex + '" aria-label="Escolher a carta de ' + esc(sp.name) + '">' + artImg(sp.dex) +
      '<span class="fn-dexn">#' + sp.dex + '</span></button><div class="fn-meta"><span class="fn-name">' + esc(sp.name) + '</span></div>' +
      '<div class="fn-sub"><span>sem carta escolhida</span></div><div class="fn-vers"><button type="button" class="fn-ver" data-dexpick="' + sp.dex + '">+ Escolher carta</button></div></article>';
  }
  function renderDex() {
    if (!cur.binder) return '<div class="fn-empty">' + (loggedIn() || DEMO ? 'Carregando a sua Pokédex…' : 'Entre no MyDeck para ver a sua Pokédex.') + '</div>';
    var vis = dexVisible(); if (!vis.length) return '<div class="fn-empty">Nenhuma espécie com esse filtro.</div>';
    if (st.view === 'binder') return renderBinder(vis);
    var shown = vis.slice(0, dexLimit);
    return '<div class="fn-grid">' + shown.map(dexTile).join('') + '</div>' +
      (vis.length > shown.length ? '<div class="fn-more"><button type="button" class="fn-btn" data-act="dexmore">Mostrar mais (' + (vis.length - shown.length) + ' espécies)</button></div>' : '');
  }
  function renderDexHero() {
    var b = cur.binder, t = cur.species.length, own = 0, missV = 0, empty = 0;
    cur.species.forEach(function (sp) {
      var c = cur.byDex[sp.dex]; if (!c) { empty++; return; }
      if (dexOwned(c)) own++; else { var sl = slotsOf(st.set, c)[0]; missV += (sl && sl.price) || c.price || 0; }
    });
    var pct = t ? Math.round(own / t * 100) : 0, name = b ? b.name.replace(/^[^\wÀ-ú(]+/, '') : 'Pokédex';
    $('#fn-hero').innerHTML = '<div class="fn-hero-top"><div><h1>' + esc(name) + '</h1><p class="fn-hero-sub">Pokédex · ' + t + ' espécies · uma carta por vaga</p></div><div class="fn-pct">' + pct + '<small>%</small></div></div>' +
      '<div class="fn-progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>' +
      '<div class="fn-stats">' + (b ? '<span><b>' + own + '</b>/' + t + ' espécies</span><span>Com carta escolhida <b>' + (t - empty) + '</b></span>' + (empty ? '<span>Vagas sem carta <b>' + empty + '</b></span>' : '') +
        (missV > 0 ? '<span class="fn-miss">Faltam <b>' + esc(money0(missV)) + '</b> <small>(só nas vagas com carta)</small></span>' : '') : '<span>' + (loggedIn() || DEMO ? 'Carregando a sua Pokédex…' : 'Entre no MyDeck para carregar a sua Pokédex.') + '</span>') + '</div>' +
      '<div class="fn-hero-links"><a href="./#fichario">Abrir no fichário atual</a></div>';
    $('#fn-setbtn-emoji').textContent = (b && b.emoji) || '🌐'; $('#fn-setbtn-code').textContent = 'Pokédex'; $('#fn-setbtn-name').textContent = name;
  }
  function dexTreeHtml() {
    var bs = dexBinders();
    var rows = bs.map(function (b) {
      var p = dexProg(b), nm = b.name.replace(/^[^\wÀ-ú(]+/, '');
      return '<button type="button" class="fn-set' + ('dex:' + b.id === st.set ? ' is-cur' : '') + '" data-pick="dex:' + esc(b.id) + '" data-find="' + esc(normTxt(nm + ' pokedex master set')) + '"><span class="em">' + esc(b.emoji || '🌐') + '</span><span class="tx"><b>' + esc(nm) + '</b><small>Pokédex</small>' +
        '<div class="mini"><i style="width:' + p.pct + '%"></i></div></span><span class="pc' + (p.pct ? '' : ' z') + '">' + p.pct + '%</span></button>';
    }).join('');
    rows += '<button type="button" class="fn-set" data-act="dexnew" data-find="criar pokedex nacional regional"><span class="em">➕</span><span class="tx"><b>Criar Pokédex</b><small>Nacional ou por região</small></span></button>';
    return '<section class="fn-blk is-open" data-blk-id="__dex"><div class="fn-blk-h"><span class="t">Pokédex</span><span class="n">' + bs.length + '</span></div><div class="fn-blk-b">' + rows + '</div></section>';
  }
  function openDexNew() {
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para criar a sua Pokédex.'); return; }
    var have = dexBinders(), isNat = function (b) { return !b.filter_config.dexFrom && !b.filter_config.dexTo; };
    var opts = [{ k: 'nat', t: '🌐 Master Set Nacional', s: '1025 vagas (#1–#1025)', done: have.some(isNat) }];
    (typeof POKEDEX_GEN_RANGES !== 'undefined' ? POKEDEX_GEN_RANGES : []).forEach(function (g) {
      opts.push({ k: String(g.gen), t: (REGION_META[g.gen] || ['🗺️'])[0] + ' ' + g.label, s: (g.to - g.from + 1) + ' vagas (#' + g.from + '–#' + g.to + ')', done: have.some(function (b) { return b.filter_config.dexFrom === g.from && b.filter_config.dexTo === g.to; }) });
    });
    openSheet('<p class="fn-note">Cada vaga começa com a arte do Pokémon. Você escolhe a carta que quer em cada uma.</p><div class="fn-acts">' + opts.map(function (o) {
      return '<button type="button" class="fn-act" data-act="dexcreate" data-kind="' + o.k + '"' + (o.done ? ' disabled' : '') + '><span class="em">' + esc(o.t.split(' ')[0]) + '</span><span><b>' + esc(o.t.split(' ').slice(1).join(' ')) + '</b><small>' + (o.done ? 'Você já tem esta Pokédex' : esc(o.s)) + '</small></span></button>';
    }).join('') + '</div>', 'Criar Pokédex');
  }
  async function dexCreate(kind) {
    var payload;
    if (kind === 'nat') payload = { name: '🌐 Master Set Nacional (1025)', emoji: '🌐', layout: 3, filter_config: { type: 'masterdex' }, card_ids: [], cover_color: '#118ab2' };
    else {
      var g = (typeof POKEDEX_GEN_RANGES !== 'undefined' ? POKEDEX_GEN_RANGES : []).filter(function (x) { return String(x.gen) === String(kind); })[0]; if (!g) return;
      var m = REGION_META[g.gen] || ['🗺️', '#118ab2'];
      payload = { name: m[0] + ' Master Set ' + g.label + ' (#' + g.from + '-' + g.to + ')', emoji: m[0], layout: 3, filter_config: { type: 'masterdex', dexFrom: g.from, dexTo: g.to }, card_ids: [], cover_color: m[1] };
    }
    if (DEMO) { toast('Criar não funciona no modo demonstração.'); return; }
    if (typeof saveCustomBinder !== 'function') { toast('Não foi possível criar agora. Recarregue a página.'); return; }
    var saved = await saveCustomBinder(payload);
    if (!saved) { toast('Não foi possível criar. Confira a conexão e tente de novo.'); return; }
    closeSheet(); progCache = {}; pickSet('dex:' + saved.id);
  }
  // ── escolher / trocar / tirar a carta de uma vaga ──
  function dexCands(d) {
    var list = (dexIndex()[d] || []).slice();
    var rank = function (x) { var c = Object.assign({}, x.c, { _set: x.set, _k: x.set + '~' + x.c.n }), own = slotsOf('', c).some(function (s) { return has(keyOf('', c, s.ver)); }); return own ? 0 : 1; };
    list.sort(function (a, b) { var ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb; var pa = a.c.price || 1e9, pb = b.c.price || 1e9; return ra === 0 ? (b.c.price || 0) - (a.c.price || 0) : pa - pb; });
    return list;
  }
  function openDexPicker(d) {
    if (!cur.binder) return;
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para escolher cartas.'); return; }
    if (cur.pending > 0) { toast('Ainda carregando todas as coleções. Tente de novo em instantes.'); return; }
    var sp = cur.species.filter(function (x) { return x.dex === d; })[0] || { dex: d, name: '#' + d };
    picker = { dex: d, list: dexCands(d), name: sp.name };
    openSheet('<div class="fn-form"><label>Buscar nesta espécie<input id="fn-dp-q" type="search" placeholder="coleção, número, raridade…" autocomplete="off"></label></div><div class="fn-dp" id="fn-dp"></div>', '#' + d + ' ' + sp.name);
    renderDexPicker('');
  }
  function renderDexPicker(q) {
    var box = $('#fn-dp'); if (!box || !picker) return;
    var words = normTxt(q).split(/\s+/).filter(Boolean), cur0 = cur.byDex[picker.dex];
    var items = picker.list.filter(function (x) { var hay = normTxt(x.c.name + ' ' + x.c.n + ' ' + x.set + ' ' + setLabelOf(x.set) + ' ' + (x.c.rare || '')); return words.every(function (w) { return hay.indexOf(w) >= 0; }); });
    var html = '';
    if (cur0) html += '<button type="button" class="fn-dp-item is-clear" data-act="dexclear" data-dex="' + picker.dex + '"><span class="tx"><b>✖ Deixar sem carta</b><small>volta para a arte do Pokémon</small></span></button>';
    if (!items.length) html += '<div class="fn-empty">' + (picker.list.length ? 'Nenhuma carta com essa busca.' : 'Ainda não há carta cadastrada dessa espécie.') + '</div>';
    html += items.slice(0, 80).map(function (x) {
      var c = Object.assign({}, x.c, { _set: x.set, _k: x.set + '~' + x.c.n }), on = cur0 && cur0._set === x.set && String(cur0.n) === String(x.c.n);
      var own = slotsOf('', c).some(function (s) { return has(keyOf('', c, s.ver)); });
      return '<button type="button" class="fn-dp-item' + (on ? ' is-on' : '') + '" data-act="dexchoose" data-dex="' + picker.dex + '" data-dset="' + esc(x.set) + '" data-dn="' + esc(x.c.n) + '">' +
        '<img loading="lazy" decoding="async" alt="" src="' + esc(imgSrc(null, '', c)) + '"><span class="tx"><b>' + esc(i18n(c, '').name) + (own ? ' ✓' : '') + '</b><small>' + esc(setLabelOf(x.set).split('—')[0].trim()) + ' · #' + esc(x.c.n) + ' · ' + esc(rareLabel(x.c.rare)) + '</small></span><span class="pr">' + esc(priceFmt(c, '')) + '</span></button>';
    }).join('');
    if (items.length > 80) html += '<div class="fn-empty">Mostrando 80 de ' + items.length + '. Refine a busca.</div>';
    box.innerHTML = html;
  }
  var dexBusy = false;
  async function dexAssign(d, set, n) {
    var b = cur.binder; if (!b || dexBusy) return;
    if (cur.pending > 0) { toast('Ainda carregando todas as coleções. Tente de novo em instantes.'); return; }
    dexBusy = true;
    try {
      var ids = (b.card_ids || []).filter(function (r) { return Number(r.dex) !== Number(d); });
      if (set) ids.push({ set: set, n: n, dex: d });
      var nb = Object.assign({}, b, { card_ids: ids });
      if (!DEMO) {
        var saved = await saveCustomBinder(nb);
        if (!saved) { toast('Não foi possível salvar. Tente de novo.'); return; }
        var i = (customBinders || []).findIndex(function (x) { return x.id === b.id; }); if (i >= 0) customBinders[i] = nb;
      } else demoBinders[0] = nb;
      closeSheet(); picker = null; progCache = {}; loadCur(); renderHero(); renderBody(); renderSide();
      toast(set ? 'Carta da vaga atualizada.' : 'Vaga sem carta.');
    } finally { dexBusy = false; }
  }
  // lista para colar no WhatsApp: tudo que falta (ótimo para comprar bulks)
  function dexListText() {
    var b = cur.binder, vis = dexVisible(), got = 0;
    var rows = vis.map(function (x) {
      var own = dexOwned(x.c); if (own) got++;
      return (own ? '✅' : '❌') + ' *' + x.sp.dex + '* ' + x.sp.name + (x.c ? ' — ' + i18n(x.c, st.set).name + ' _(' + setLabelOf(x.c._set).split('—')[0].trim() + ' #' + x.c.n + ')_' : '');
    });
    return '🎴✨ *' + (b ? b.name : 'Pokédex') + '* ✨🎴\n' + filterLabel() + '\n📅 ' + new Date().toLocaleDateString('pt-BR') + '\n━━━━━━━━━━━━━━━━━━\n' + rows.join('\n') + '\n━━━━━━━━━━━━━━━━━━\n📦 Espécies: *' + got + '/' + vis.length + '*';
  }
  function dexShareRefs() {
    var rg = dexRange(cur.binder), byDex = {};
    (cur.binder.card_ids || []).forEach(function (r) { byDex[Number(r.dex)] = r; });
    return cur.species.map(function (sp) { var r = byDex[sp.dex]; return r ? { set: r.set, n: r.n, dex: sp.dex } : { dex: sp.dex, name: sp.name, empty: true }; });
  }

  function loadCur() {
    if (isDex(st.set)) { loadDex(); return; }
    cur.d = setData(st.set);
    cur.cards = cur.d && cur.d.cards ? cur.d.cards : [];
    CUR = (effLang(st.set) === 'en' && cur.cards.some(function (c) { return c.priceUsd != null; })) ? '$' : 'R$';
    if (DEMO && !demoSet.size && cur.cards.length) {
      cur.cards.forEach(function (c) {
        var base = c.base ? 0.7 : 0.35;
        slotsOf(st.set, c).forEach(function (s) { if (window.__fnSeed() < base) demoSet.add(keyOf(st.set, c, s.ver)); });
      });
    }
  }
  function computeView() {
    var q = st.q.trim().toLowerCase(), id = st.set;
    var arr = cur.cards.filter(function (c) {
      if (q && (c.name + ' ' + c.n + ' ' + (c.nameEn || '') + ' ' + (c.nameJp || '') + ' ' + (c.nameCn || '') + ' ' + (c.type || '') + ' ' + rareLabel(c.rare) + ' ' + (c.rare || '')).toLowerCase().indexOf(q) < 0) return false;
      if (st.imp && !c.important) return false;
      if (st.artist && c.artist !== st.artist) return false;
      if (st.status !== 'all') { var s = stateOf(id, c).st; if (st.status === 'miss' && s === 'have') return false; if (st.status === 'have' && s !== 'have') return false; }
      return true;
    });
    var by = {
      num: function (a, b) { return secIdx(a) - secIdx(b) || String(a.n).localeCompare(String(b.n), undefined, { numeric: true }); },
      name: function (a, b) { return String(a.name).localeCompare(String(b.name), 'pt'); },
      rare: function (a, b) { return rareRank(b.rare) - rareRank(a.rare) || by.num(a, b); },
      price: function (a, b) { return (b.price || 0) - (a.price || 0); },
      dex: function (a, b) { var x = dexOf(a), y = dexOf(b); if (x == null && y == null) return by.num(a, b); if (x == null) return 1; if (y == null) return -1; return x - y || by.num(a, b); }
    };
    // ordem por número respeita as seções da coleção (ex.: Base 001–103 primeiro, Coleção Clássica depois)
    var secs = (cur.d && cur.d.sections) || [], idxCache = new Map();
    function secIdx(c) {
      if (!secs.length) return 0;
      if (idxCache.has(c)) return idxCache.get(c);
      var r = secs.length; for (var i = 0; i < secs.length; i++) { try { if (secs[i].filter(c)) { r = i; break; } } catch (e) { } }
      idxCache.set(c, r); return r;
    }
    arr.sort(by[st.sort] || by.num);
    cur.view = arr;
  }
  function totals() {
    var id = st.set, t = { slots: 0, got: 0, miss: 0, bT: 0, bG: 0, sT: 0, sG: 0, cards: 0, cardsHave: 0 };
    cur.cards.forEach(function (c) {
      var s = stateOf(id, c); t.cards++; if (s.st === 'have') t.cardsHave++;
      s.sl.forEach(function (x) {
        var k = has(keyOf(id, c, x.ver)); t.slots++; if (k) t.got++; else t.miss += priceOf(id, c, x);
        if (c.base) { t.bT++; if (k) t.bG++; } else { t.sT++; if (k) t.sG++; }
      });
    });
    return t;
  }

  // ── renderização ───────────────────────────────────────────
  function verButtons(id, c) {
    var sl = slotsOf(id, c), nm0 = i18n(c, id).name;
    return '<div class="fn-vers">' + sl.map(function (s) {
      var key = keyOf(id, c, s.ver), e = entryOf(key), on = e.qty > 0;
      var nm = VERSION_NAME[s.ver] || s.ver;
      return '<button type="button" class="fn-ver' + (on ? ' is-on' : '') + '" data-mark="' + esc(ck(c)) + '" data-ver="' + esc(s.ver) + '" aria-pressed="' + on + '" aria-label="' + esc(nm0 + ' — ' + nm + (on ? ' (coletada' + (e.qty > 1 ? ', ' + e.qty + ' cópias' : '') + ')' : ' (faltando)')) + '">' +
        (on ? '✓ ' : '') + s.ver + (e.qty > 1 ? ' <span class="fn-x2">×' + e.qty + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function cardHtml(c) {
    var id = st.set, s = stateOf(id, c), r = rareCls(c.rare), nm = i18n(c, id).name;
    return '<article class="fn-card is-' + s.st + '" data-n="' + esc(ck(c)) + '">' +
      '<button type="button" class="fn-img" data-open="' + esc(ck(c)) + '" aria-label="Ver ' + esc(nm) + '">' +
      (c._dex ? '<span class="fn-dexn">#' + c._dex + '</span>' : '') +
      '<img loading="lazy" decoding="async" alt="' + esc(nm) + '" src="' + esc(imgSrc(cur.d, id, c)) + '">' +
      (c.important ? '<span class="fn-star" title="Carta importante" aria-hidden="true">★</span>' : '') +
      '<span class="fn-tick" aria-hidden="true">' + (s.st === 'part' ? '½' : '✓') + '</span></button>' +
      '<div class="fn-meta"><span class="fn-name" title="' + esc(nm) + '">' + esc(nm) + '</span><span class="fn-price">' + esc(priceFmt(c, id)) + '</span></div>' +
      '<div class="fn-sub"><span>#' + esc(c.n) + '</span><span class="fn-rare ' + r + '">' + esc(rareLabel(c.rare)) + '</span></div>' +
      verButtons(id, c) + '</article>';
  }
  function sections() {
    var d = cur.d, secs = (d && d.sections) || [{ lbl: 'Todas', filter: function () { return true; } }];
    var set = new Set(cur.view);
    return secs.map(function (s) {
      var items = []; try { items = cur.view.filter(function (c) { return set.has(c) && s.filter(c); }); } catch (e) { }
      return { lbl: s.lbl, items: items };
    }).filter(function (s) { return s.items.length; });
  }
  function renderGrid() {
    var secs = sections(), grouped = st.sort === 'num' && secs.length > 1;
    if (!cur.view.length) return emptyMsg();
    if (!grouped) return '<div class="fn-grid">' + cur.view.map(cardHtml).join('') + '</div>';
    return secs.map(function (s) {
      var got = 0, tot = s.items.length; s.items.forEach(function (c) { if (stateOf(st.set, c).st === 'have') got++; });
      return '<div class="fn-sec"><h2>' + esc(s.lbl.replace(/^[^\wÀ-ú]+/, '')) + '</h2><span>' + got + '/' + tot + ' cartas</span><i></i></div>' +
        '<div class="fn-grid">' + s.items.map(cardHtml).join('') + '</div>';
    }).join('');
  }
  function renderTable() {
    var id = st.set;
    if (!cur.view.length) return emptyMsg();
    return '<div class="fn-tablewrap"><table class="fn-table"><thead><tr><th></th><th>Nº</th><th>Nome</th><th>Raridade</th><th>Preço</th><th>Versões</th></tr></thead><tbody>' +
      cur.view.map(function (c) {
        var s = stateOf(id, c);
        return '<tr data-n="' + esc(ck(c)) + '" class="' + (s.st === 'miss' ? 't-miss' : '') + '"><td class="t-thumb"><img loading="lazy" alt="" src="' + esc(imgSrc(cur.d, id, c)) + '"></td><td>#' + esc(c.n) + '</td>' +
          '<td><button type="button" style="all:unset;cursor:pointer;font-weight:700" data-open="' + esc(ck(c)) + '">' + (c.important ? '★ ' : '') + esc(i18n(c, id).name) + '</button></td>' +
          '<td class="' + rareCls(c.rare) + '">' + esc(rareLabel(c.rare)) + '</td><td>' + esc(priceFmt(c, id)) + '</td><td>' + verButtons(id, c) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function renderBinder(dexVis) {
    var id = st.set, P = pocketCfg(), per = P.per, cols = P.cols, items = [];
    if (dexVis) {
      // Pokédex: 1 bolso por ESPÉCIE (a carta escolhida, ou a arte do Pokémon se ainda não escolheu)
      items = dexVis.map(function (x) { return { sp: x.sp, c: x.c, ver: null }; });
    } else {
      if (!cur.view.length) return emptyMsg();
      // 1 bolso por VERSÃO (Normal, Reverse…), como no fichário físico e no fichário atual — cada um com a sua marcação
      cur.view.forEach(function (c) { slotsOf(id, c).forEach(function (s) { items.push({ c: c, ver: s.ver }); }); });
      if (!items.length) return emptyMsg();
    }
    var pages = Math.ceil(items.length / per), two = innerWidth >= 700, step = two ? 2 : 1;
    if (st.bpage >= pages) st.bpage = Math.max(0, pages - 1);
    st.bpage = st.bpage - (st.bpage % step);
    var p0 = st.bpage;
    function page(i) {
      if (i >= pages) return '<div></div>';
      var chunk = items.slice(i * per, i * per + per);
      return '<div class="fn-page"><div class="fn-page-lbl">Página ' + (i + 1) + '</div><div class="fn-pocket-grid" style="--pc:' + cols + '">' +
        chunk.map(function (it) {
          if (dexVis && !it.c) return '<button type="button" class="fn-pocket is-miss fn-ph" data-dexpick="' + it.sp.dex + '" aria-label="Escolher a carta de ' + esc(it.sp.name) + '">' + artImg(it.sp.dex) + '<span class="fn-slotn">#' + it.sp.dex + '</span></button>';
          if (dexVis) { var cd = it.c; return '<button type="button" class="fn-pocket is-' + (dexOwned(cd) ? 'have' : 'miss') + '" data-n="' + esc(ck(cd)) + '" data-open="' + esc(ck(cd)) + '" aria-label="' + esc(i18n(cd, id).name) + '"><img loading="lazy" decoding="async" alt="" src="' + esc(imgSrc(cur.d, id, cd)) + '"><span class="fn-slotn">#' + it.sp.dex + '</span><span class="fn-tick">✓</span></button>'; }
          var c = it.c, on = has(keyOf(id, c, it.ver));
          return '<button type="button" class="fn-pocket is-' + (on ? 'have' : 'miss') + '" data-n="' + esc(ck(c)) + '" data-ver="' + esc(it.ver) + '" data-open="' + esc(ck(c)) + '" aria-label="' + esc(i18n(c, id).name + ' — ' + (VERSION_NAME[it.ver] || it.ver) + (on ? ' (coletada)' : ' (faltando)')) + '">' +
            '<img loading="lazy" decoding="async" alt="" src="' + esc(imgSrc(cur.d, id, c)) + '"><span class="fn-slotn">#' + esc(c.n) + '</span><span class="fn-slotv v-' + esc(it.ver) + '">' + esc(it.ver) + '</span><span class="fn-tick">✓</span></button>';
        }).join('') + '</div></div>';
    }
    var lbl = two ? 'Páginas ' + (p0 + 1) + (p0 + 2 <= pages ? '–' + (p0 + 2) : '') + ' de ' + pages : 'Página ' + (p0 + 1) + ' de ' + pages;
    return '<div class="fn-binder-nav"><button type="button" data-bnav="-1"' + (p0 <= 0 ? ' disabled' : '') + '>‹ Anterior</button>' +
      '<span class="fn-binder-pg">' + lbl + '</span><button type="button" data-bnav="1"' + (p0 + step >= pages ? ' disabled' : '') + '>Próxima ›</button>' +
      '<div class="fn-seg" id="fn-pocket" role="group" aria-label="Bolsos por página">' + POCKETS.map(function (p) { return '<button type="button" data-pocket="' + p.id + '" class="' + (p.id === P.id ? 'is-on' : '') + '">' + p.label + '</button>'; }).join('') + '</div></div>' +
      '<div class="fn-spread" style="--pr:' + Math.round(per / cols) + '">' + page(p0) + (two ? page(p0 + 1) : '') + '</div>';
  }
  function renderDashView() {
    var id = st.set, own = 0, miss = 0, ownN = 0, missN = 0, bestO = null, bestM = null, ver = {}, rar = {}, missing = [];
    if (!cur.cards.length) return emptyMsg();
    cur.cards.forEach(function (c) {
      var rl = rareLabel(c.rare); rar[rl] = rar[rl] || { got: 0, tot: 0, miss: 0, rank: rareRank(c.rare) };
      slotsOf(id, c).forEach(function (sl) {
        var p = priceOf(id, c, sl), k = has(keyOf(id, c, sl.ver)); rar[rl].tot++;
        if (k) { own += p; ownN++; rar[rl].got++; ver[sl.ver] = (ver[sl.ver] || 0) + 1; if (!bestO || p > bestO.p) bestO = { c: c, v: sl.ver, p: p }; }
        else { miss += p; missN++; rar[rl].miss += p; missing.push({ c: c, v: sl.ver, p: p }); if (!bestM || p > bestM.p) bestM = { c: c, v: sl.ver, p: p }; }
      });
    });
    var tot = own + miss, pv = tot ? Math.round(own / tot * 100) : 0;
    var kpi = function (cls, t, v, sub) { return '<div class="fn-kpi ' + cls + '"><small>' + t + '</small><b>' + esc(v) + '</b><span>' + esc(sub) + '</span></div>'; };
    var line = function (x) { return i18n(x.c, id).name + ' #' + x.c.n + ' · ' + x.v; };
    var html = '<div class="fn-dash"><div class="fn-kpis">' +
      kpi('k-teal', '💰 Valor da coleção', money(own), ownN + ' slot' + (ownN === 1 ? '' : 's') + ' que você tem') +
      kpi('k-red', '🎯 Falta para fechar', money(miss), missN + ' slot' + (missN === 1 ? '' : 's') + ' faltando') +
      kpi('k-gold', '📦 Valor total do set', money(tot), pv + '% do valor já é seu') +
      (bestO ? kpi('k-blue', '⭐ Sua carta mais valiosa', money(bestO.p), line(bestO)) : '') +
      (bestM ? kpi('k-red', '💸 A que falta mais cara', money(bestM.p), line(bestM)) : '') + '</div>';
    var rows = Object.keys(rar).map(function (k) { return { k: k, r: rar[k] }; }).sort(function (a, b) { return b.r.rank - a.r.rank; });
    html += '<h3>Por raridade</h3><div>' + rows.map(function (x) {
      var pc = x.r.tot ? Math.round(x.r.got / x.r.tot * 100) : 0;
      return '<div class="fn-rrow"><span>' + esc(x.k) + '</span><div class="bar"><i style="width:' + pc + '%"></i></div><span class="num">' + x.r.got + '/' + x.r.tot + (x.r.miss > 0 ? ' · faltam ' + esc(money0(x.r.miss)) : '') + '</span></div>';
    }).join('') + '</div>';
    var top = missing.sort(function (a, b) { return b.p - a.p; }).slice(0, 8);
    if (top.length) html += '<h3>As mais caras que faltam</h3><div class="fn-toplist">' + top.map(function (x) {
      return '<button type="button" class="fn-topitem" data-open="' + esc(ck(x.c)) + '"><img loading="lazy" alt="" src="' + esc(imgSrc(cur.d, id, x.c)) + '"><span class="tx"><b>' + esc(i18n(x.c, id).name) + '</b><small>#' + esc(x.c.n) + ' · ' + esc(rareLabel(x.c.rare)) + ' · ' + esc(x.v) + '</small></span><span class="pr">' + esc(money(x.p)) + '</span></button>';
    }).join('') + '</div>';
    var vk = Object.keys(ver);
    if (vk.length) html += '<h3>Versões que você tem</h3><div class="fn-stats">' + vk.map(function (v) { return '<span>' + esc(VERSION_NAME[v] || v) + ': <b>' + ver[v] + '</b></span>'; }).join('') + '</div>';
    return html + '</div>';
  }
  function emptyMsg() {
    if (!cur.d || !cur.cards.length) return '<div class="fn-empty">' + (loggedIn() || DEMO ? 'Carregando as cartas desta coleção…' : 'Esta coleção carrega depois do login.') + '</div>';
    return '<div class="fn-empty">Nenhuma carta com esse filtro.</div>';
  }
  // quanto faltam em cartas, traduzido em boosters (usa o catálogo de produtos; sem produto cadastrado, não inventa número)
  function bridgeHtml(t) {
    if (!t.slots || t.miss <= 0 || typeof CATALOG === 'undefined' || effLang(st.set) !== 'pt') return '';
    var ent = CATALOG.filter(function (p) { return p.set === setKey(st.set) && p.boosters > 0 && p.varejo > 0; });
    if (!ent.length) return '';
    var per = Math.min.apply(null, ent.map(function (p) { return p.varejo / p.boosters; }));
    var n = Math.max(1, Math.round(t.miss / per));
    return '<div class="fn-stats fn-bridge" style="margin-top:6px"><span>📦 Com esse valor dá para comprar <b>~' + n + ' booster' + (n > 1 ? 's' : '') + '</b> (' + esc(money(per)) + '/un.)</span></div>';
  }
  // aviso no cabeçalho quando a coleção aberta é a de outro idioma (marcações separadas do português)
  function langNote() {
    if (st.set === 'cel30jp' || st.set === 'cel30cn') return '';
    var l = effLang(st.set); return l === 'pt' ? '' : ' · coleção em ' + ({ en: 'inglês', jp: 'japonês', cn: 'chinês' }[l] || l) + ' (marcações separadas do português)';
  }
  function renderHero() {
    if (isDex(st.set)) { renderDexHero(); return; }
    var d = cur.d, meta = (typeof SET_META !== 'undefined' && SET_META[setKey(st.set)]) || {}, cat = SET_CATALOG.filter(function (s) { return s.id === setKey(st.set); })[0] || {};
    var t = totals(), pct = t.slots ? Math.round(t.got / t.slots * 100) : 0;
    var label = (cat.label || (d && d.label) || st.set);
    var nameOnly = label.indexOf('—') >= 0 ? label.split('—')[1].trim() : label;
    $('#fn-hero').innerHTML =
      '<div class="fn-hero-top"><div><h1>' + esc(nameOnly) + '</h1><p class="fn-hero-sub">' + esc(label.split('—')[0].trim()) + (meta.releaseDate ? ' · lançada em ' + esc(meta.releaseDate) : '') + ' · ' + t.cards + ' cartas' + langNote() + '</p></div>' +
      '<div class="fn-pct">' + pct + '<small>%</small></div></div>' +
      '<div class="fn-progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>' +
      '<div class="fn-stats"><span><b>' + t.got + '</b>/' + t.slots + ' slots</span>' +
      (t.sT ? '<span>Base <b>' + t.bG + '</b>/' + t.bT + '</span><span>Secretas <b>' + t.sG + '</b>/' + t.sT + '</span>' : '') +
      (!t.slots ? '<span>' + (loggedIn() || DEMO ? 'Carregando as cartas…' : 'Entre no MyDeck para carregar esta coleção.') + '</span>' : t.got >= t.slots ? '<span><b style="color:var(--teal)">Coleção completa 🎉</b></span>' : t.miss > 0 ? '<span class="fn-miss">Faltam <b>' + esc(money0(t.miss)) + '</b></span>' : '<span class="fn-miss">Faltam <b>' + (t.slots - t.got) + '</b> slots</span>') + '</div>' +
      bridgeHtml(t) + '<div class="fn-hero-links"><a href="./#lojas">Ver ofertas</a><a href="./#fichario/' + esc(st.set) + '">Abrir no fichário atual</a></div>';
    $('#fn-setbtn-emoji').textContent = cat.emoji || '🃏';
    $('#fn-setbtn-code').textContent = label.split('—')[0].trim();
    $('#fn-setbtn-name').textContent = nameOnly;
  }
  function renderBody() {
    computeView();
    var html = isDex(st.set) && (st.view === 'grid' || st.view === 'binder') ? renderDex() :
      st.view === 'table' ? renderTable() : st.view === 'binder' ? renderBinder() : st.view === 'dash' ? renderDashView() : renderGrid();
    $('#fn-body').innerHTML = html;
  }
  function renderControls() {
    $$('.fn-chip[data-status]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.status === st.status); });
    var imp = $('#fn-imp'), hasImp = cur.cards.some(function (c) { return c.important; });
    imp.hidden = !hasImp; imp.classList.add('is-star'); imp.classList.toggle('is-on', st.imp && hasImp);
    var L = langsOf(st.set), lg = $('#fn-lang'); lg.hidden = !L;
    if (L) $$('button', lg).forEach(function (b) { b.hidden = L.indexOf(b.dataset.lang) < 0; b.classList.toggle('is-on', b.dataset.lang === effLang(st.set)); });
    $$('#fn-view button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.view === st.view); });
    $('#fn-sort').value = st.sort;
    $('#fn-sort').disabled = isDex(st.set) && (st.view === 'grid' || st.view === 'binder'); // na Pokédex a ordem é sempre a da Pokédex
    var arts = []; cur.cards.forEach(function (c) { if (c.artist && arts.indexOf(c.artist) < 0) arts.push(c.artist); });
    arts.sort(function (a, b) { return a.localeCompare(b, 'pt'); });
    var aw = $('#fn-artist-wrap'), as = $('#fn-artist'); aw.hidden = !arts.length;
    if (arts.length) { as.innerHTML = '<option value="">Todos</option>' + arts.map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join(''); as.value = arts.indexOf(st.artist) >= 0 ? st.artist : ''; if (as.value !== st.artist) st.artist = as.value; }
    else st.artist = '';
    applyFocus();
    $('#fn-cols-val').textContent = st.cols;
    $('#fn-cols-wrap').style.display = st.view === 'grid' ? '' : 'none';
    document.documentElement.style.setProperty('--cols', st.cols);
  }
  // Modo foco: só no fichário, em tela larga. Esconde cabeçalho/coleções e encaixa as páginas na altura da tela.
  function applyFocus() {
    var can = st.view === 'binder' && innerWidth >= 700, on = can && st.focus;
    document.body.classList.toggle('fn-focus', on);
    var b = $('#fn-focus'); if (!b) return;
    b.hidden = !can; b.classList.toggle('is-on', on); b.textContent = on ? '✕ Sair do foco' : '⛶ Foco';
  }
  function renderAll() { loadCur(); renderHero(); renderControls(); renderBody(); renderSide(); }

  // atualização pontual (marcou uma versão): troca só aquele cartão e o resumo
  function patchOne(n) {
    var c = findCard(n); if (!c) return;
    if (st.status !== 'all') { renderBody(); renderHero(); delete progCache[st.set]; renderSide(); return; } // filtro ativo: a carta pode sair da lista
    $$('[data-n="' + n + '"]', $('#fn-body')).forEach(function (el) {
      var tmp = document.createElement('div');
      if (el.matches('article.fn-card')) { tmp.innerHTML = cardHtml(c); el.replaceWith(tmp.firstChild); }
      else if (el.matches('tr')) { var holder = document.createElement('table'); holder.innerHTML = renderTable(); var nr = $('tr[data-n="' + n + '"]', holder); if (nr) el.replaceWith(nr); }
      else if (el.matches('.fn-pocket')) { el.className = 'fn-pocket is-' + ((el.dataset.ver ? has(keyOf(st.set, c, el.dataset.ver)) : dexOwned(c)) ? 'have' : 'miss'); }
    });
    renderHero(); delete progCache[st.set]; renderSide();
    var ov = $('#fn-overlay'); if (!ov.hidden && ov.dataset.detail === String(n)) openDetail(n, true);
  }

  // ── marcar ─────────────────────────────────────────────────
  var busy = {};
  function mark(n, ver) {
    var c = findCard(n); if (!c) return;
    var key = keyOf(st.set, c, ver), cur1 = entryOf(key);
    if (cur1.qty > 1) { toast('Você tem ' + cur1.qty + ' cópias. Ajuste a quantidade no detalhe da carta.'); openDetail(n); return; }
    if (DEMO) { if (demoSet.has(key)) { demoSet.delete(key); demoQty.delete(key); } else demoSet.add(key); patchOne(n); return; }
    if (!loggedIn()) { toast('Entre no MyDeck para marcar suas cartas.'); return; }
    if (busy[key]) return; busy[key] = true;
    var p; try { p = toggleSlot(key); } catch (e) { busy[key] = false; toast('Não foi possível marcar. Tente de novo.'); return; }
    patchOne(n); // o motor já mexeu na coleção (otimista) antes do primeiro await
    Promise.resolve(p).then(function () { patchOne(n); }, function () { toast('Não foi possível salvar. Tente de novo.'); patchOne(n); }).then(function () { busy[key] = false; });
  }

  // idioma da arte e dos nomes (mesma chave do fichário atual). cel30 jp/cn são coleções próprias.
  function setLang(l) {
    progCache = {}; LS.set('lang', l);
    var fam = FAMILY.indexOf(st.set) >= 0;
    try { localStorage.setItem('ficLang', fam && (l === 'jp' || l === 'cn') ? 'pt' : l); } catch (e) { }
    if (fam) {
      st.lang = (l === 'pt' || l === 'en') ? l : 'pt';
      var target = REGION[l] || 'cel30';
      if (target !== st.set) { st.set = target; try { history.replaceState(null, '', '#' + target); } catch (e) { } }
    } else st.lang = l;
    renderAll();
  }

  // ── quantidade e origem (grava com a mesma função do fichário atual: saveSlot) ──
  function setEntry(n, ver, qty, origins) {
    var c = findCard(n); if (!c) return;
    var key = keyOf(st.set, c, ver);
    if (DEMO) { if (qty <= 0) { demoSet.delete(key); demoQty.delete(key); } else { demoSet.add(key); demoQty.set(key, { qty: qty, origins: origins }); } patchOne(n); return; }
    if (!loggedIn()) { toast('Entre no MyDeck para salvar suas cartas.'); return; }
    if (typeof saveSlot !== 'function') { toast('Não foi possível salvar agora. Recarregue a página.'); return; }
    if (busy[key]) return; busy[key] = true;
    Promise.resolve(saveSlot(key, qty, origins)).then(function () { patchOne(n); }, function () { toast('Não foi possível salvar. Tente de novo.'); patchOne(n); }).then(function () { busy[key] = false; });
  }
  function originOptions() {
    var o = [];
    try { (purchases || []).forEach(function (p) { var d = ''; try { d = new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch (e) { } o.push('<option value="' + esc(p.product) + '">' + esc(d + ' — ' + String(p.product).substring(0, 40)) + '</option>'); }); } catch (e) { }
    o.push('<option value="Troca">Troca</option><option value="Presente">Presente</option><option value="Avulso">Avulso (loja)</option>');
    return o.join('');
  }
  function verBlocks(id, c) {
    return '<div class="fn-vblocks">' + slotsOf(id, c).map(function (s) {
      var e = entryOf(keyOf(id, c, s.ver)), on = e.qty > 0, at = ' data-n="' + esc(ck(c)) + '" data-ver="' + esc(s.ver) + '"';
      return '<div class="fn-vb' + (on ? ' is-on' : '') + '"><div class="fn-vb-h"><span class="fn-vb-n"><b>' + esc(s.ver) + '</b>' + esc(VERSION_NAME[s.ver] || s.ver) + '</span>' +
        '<span class="fn-q"><button type="button" data-qty="-1"' + at + ' aria-label="Menos uma cópia">−</button><output aria-live="polite">' + e.qty + '</output><button type="button" data-qty="1"' + at + ' aria-label="Mais uma cópia">+</button></span></div>' +
        (on ? '<div class="fn-orig">' + (e.origins.length ? e.origins.map(function (o, i) { return '<span class="fn-ochip">' + esc(o) + '<button type="button" data-delorig="' + i + '"' + at + ' aria-label="Remover origem">×</button></span>'; }).join('') : '<small>Sem origem informada</small>') +
          '<div class="fn-oadd"><select aria-label="Origem"><option value="">— de onde veio? —</option>' + originOptions() + '</select><button type="button" data-addorig="1"' + at + '>+ origem</button></div></div>' : '') + '</div>';
    }).join('') + '</div>';
  }

  // ── Mais ações: copiar lista, imprimir, marcar por raridade ──
  function filterLabel() { return st.status === 'have' ? '✅ Só coletadas' : st.status === 'miss' ? '🔍 Só faltantes' : '📚 Todas'; }
  function listText() {
    var id = st.set, cat = SET_CATALOG.filter(function (x) { return x.id === setKey(id); })[0] || {}, label = cat.label || id;
    var icons = (typeof TYPE_ICON !== 'undefined' && TYPE_ICON) || {}, vs = (typeof VER_SHORT !== 'undefined' && VER_SHORT) || { N: 'N', F: 'F', RH: 'RH', RH2: 'RH2', SP: '★' };
    var slotsTotal = 0, slotsCol = 0, complete = 0, vc = 0, vf = 0;
    var rows = cur.view.map(function (c) {
      var sl = slotsOf(id, c), dp = effLang(id) !== 'pt' ? priceOf(id, c, null) : ((typeof lprice === 'function') ? lprice(id, c.n, c.price) : c.price);
      var parts = sl.map(function (x) {
        var k = keyOf(id, c, x.ver), on = has(k), sp = effLang(id) !== 'pt' ? priceOf(id, c, x) : (x.price != null ? x.price : dp); slotsTotal++;
        if (on) { slotsCol++; var q = entryOf(k).qty; if (sp) vc += sp * q; return vs[x.ver] + '✅' + (st.status === 'have' && q > 1 ? '×' + q : ''); }
        if (sp) vf += sp; return vs[x.ver] + '❌';
      }).join(' ');
      var s = stateOf(id, c); if (s.st === 'have') complete++;
      return (s.st === 'have' ? '✅' : s.st === 'part' ? '🟡' : '❌') + ' ' + (icons[c.type || ''] || '🃏') + ' *' + c.n + '* ' + i18n(c, id).name + (c.rare ? ' _(' + rareLabel(c.rare) + ')_' : '') + ' [' + parts + ']' + (dp ? ' — 💰 ' + money(dp) : '');
    });
    var pct = slotsTotal ? Math.round(slotsCol / slotsTotal * 100) : 0;
    var head = '🎴✨ *' + label + '* ✨🎴\n' + filterLabel() + (st.q ? ' · busca: "' + st.q + '"' : '') + '\n📅 ' + new Date().toLocaleDateString('pt-BR') + '\n━━━━━━━━━━━━━━━━━━';
    var val = st.status === 'have' ? '\n💰 *Valor da coleção (o que já tenho):* ' + money(vc) : st.status === 'miss' ? '\n💸 *Valor para fechar a coleção:* ' + money(vf) : '';
    return head + '\n' + rows.join('\n') + '\n━━━━━━━━━━━━━━━━━━\n📦 Cartas completas: *' + complete + '/' + rows.length + '*\n🎯 Versões (master set): *' + slotsCol + '/' + slotsTotal + '* (' + pct + '%)' + val;
  }
  function openActions() {
    var n = cur.view.length;
    if (isDex(st.set)) {
      var nv = dexVisible().length;
      openSheet('<div class="fn-acts">' +
        '<button type="button" class="fn-act" data-act="share"><span class="em">🔗</span><span><b>Compartilhar Pokédex</b><small>Link e QR code só para ver; as vagas que faltam aparecem com a arte do Pokémon</small></span></button>' +
        '<button type="button" class="fn-act" data-act="copy"><span class="em">📋</span><span><b>Copiar lista (texto)</b><small>' + nv + ' espécie' + (nv === 1 ? '' : 's') + ' como estão na tela, com ✅ e ❌, pronto para colar no WhatsApp</small></span></button></div>', 'Ferramentas');
      return;
    }
    openSheet('<div class="fn-acts">' +
      '<button type="button" class="fn-act" data-act="share"><span class="em">🔗</span><span><b>Compartilhar coleção</b><small>Gera um link (e QR code) só para ver, sem precisar de login</small></span></button>' +
      '<button type="button" class="fn-act" data-act="copy"><span class="em">📋</span><span><b>Copiar lista (texto)</b><small>' + n + ' carta' + (n === 1 ? '' : 's') + ' como estão na tela, pronto para colar no WhatsApp</small></span></button>' +
      '<button type="button" class="fn-act" data-act="print"><span class="em">🖨️</span><span><b>Imprimir PDF</b><small>Fichário em páginas, no tamanho escolhido</small></span></button>' +
      '<button type="button" class="fn-act" data-act="bulk"><span class="em">✅</span><span><b>Marcar várias de uma vez</b><small>Base set, secretas, tudo ou uma raridade: marca como coletadas as cartas visíveis</small></span></button>' +
      '</div>', 'Ferramentas');
  }
  var shareUrl = '';
  function doShare() {
    if (DEMO) { toast('Compartilhar não funciona no modo demonstração.'); return; }
    if (!loggedIn()) { toast('Entre no MyDeck para gerar um link de compartilhamento.'); return; }
    shareUrl = '';
    var cat = SET_CATALOG.filter(function (x) { return x.id === setKey(st.set); })[0] || {};
    var dx = isDex(st.set);
    if (dx && (!cur.binder || cur.pending > 0)) { toast(cur.binder ? 'Ainda carregando todas as coleções. Tente de novo em instantes.' : 'Sua Pokédex ainda não carregou.'); return; }
    var ln = (!dx && langSfx(st.set)) ? '<br><b>Atenção:</b> por enquanto o link mostra as marcações em <b>português</b>, não as desta coleção em outro idioma.' : '';
    openSheet('<div class="fn-form"><p class="fn-note"><b>' + esc(dx ? cur.binder.name : (cat.label || st.set)) + '</b><br>Quem abrir o link vê sua coleção marcada, somente leitura. Mostra o que você tem agora.' + ln + '</p>' +
      (dx ? '' : '<label>Como mostrar<select id="fn-share-mode"><option value="grid">Grade</option><option value="binder"' + (st.view === 'binder' ? ' selected' : '') + '>Fichário (páginas)</option></select></label>') +
      '<button type="button" class="fn-btn" id="fn-share-go" data-act="sharerun">🔗 Gerar link e QR code</button>' +
      '<div id="fn-share-out" hidden><input id="fn-share-url" type="text" readonly aria-label="Link"><canvas id="fn-share-qr" width="220" height="220"></canvas>' +
      '<button type="button" class="fn-btn" data-act="sharecopy">📋 Copiar link</button><button type="button" class="fn-btn is-alt" data-act="sharewa">💬 Enviar pelo WhatsApp</button></div></div>', 'Compartilhar coleção');
  }
  async function runShare() {
    var go = $('#fn-share-go'); if (!go) return; go.disabled = true; go.textContent = 'Gerando…';
    var mode = ($('#fn-share-mode') || {}).value === 'binder' ? 'binder' : 'grid';
    var layout = { '4': 2, '9': 3, '12': 7, '16': 4, '20b': 6 }[String(st.pocket)] || 3;
    try {
      var payload = isDex(st.set)
        ? { user_id: uid(), view_mode: 'grid', layout: layout, card_ids: dexShareRefs(), binder_name: cur.binder.name } // mesmo formato do link do fichário atual, já com as vagas vazias
        : { user_id: uid(), set_key: setKey(st.set), view_mode: mode, layout: layout };
      var r = await sbClient.from('binder_shares').insert(payload).select('token').single();
      if (r.error || !r.data) throw new Error('x');
      shareUrl = new URL('./?share=' + r.data.token, location.href).href;
      $('#fn-share-url').value = shareUrl; $('#fn-share-out').hidden = false; go.hidden = true;
      var qr = $('#fn-share-qr'); if (qr && window.QRCode) QRCode.toCanvas(qr, shareUrl, { width: 220, margin: 1, color: { dark: '#1c1f2e', light: '#ffffff' } }, function () { });
      else if (qr) qr.hidden = true;
    } catch (e) { go.disabled = false; go.textContent = '🔗 Gerar link e QR code'; toast('Não foi possível gerar o link. Tente de novo.'); }
  }
  function copyShare() {
    var inp = $('#fn-share-url'); if (!inp || !inp.value) return;
    var done = function () { toast('Link copiado!'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done, function () { inp.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Selecione o link e copie.'); } });
    else { inp.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Selecione o link e copie.'); } }
  }
  function waShare() {
    if (!shareUrl) return; var cat = SET_CATALOG.filter(function (x) { return x.id === setKey(st.set); })[0] || {};
    window.open('https://wa.me/?text=' + encodeURIComponent('Minha coleção ' + (isDex(st.set) && cur.binder ? cur.binder.name : (cat.label || '')) + ' no MyDeck: ' + shareUrl), '_blank', 'noopener');
  }
  function doCopy() {
    var t = isDex(st.set) ? dexListText() : listText();
    openSheet('<div class="fn-form"><label>Lista pronta<textarea id="fn-copytxt" readonly>' + esc(t) + '</textarea></label><button type="button" class="fn-btn" data-act="copyrun">📋 Copiar</button></div>', 'Copiar lista');
    var ta = $('#fn-copytxt'); if (ta) { ta.focus(); ta.select(); }
  }
  function runCopy() {
    var ta = $('#fn-copytxt'); if (!ta) return; var t = ta.value;
    var done = function () { toast('Lista copiada! Cole no WhatsApp.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Selecione o texto e copie.'); } });
    else { ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Selecione o texto e copie.'); } }
  }
  function doPrint() {
    if (DEMO) { toast('Imprimir não funciona no modo demonstração.'); return; }
    if (typeof printBinder !== 'function') { toast('Impressão indisponível agora. Recarregue a página.'); return; }
    if (langSfx(st.set)) toast('Atenção: por enquanto o PDF mostra as marcações em português, não as deste idioma.');
    var code = { '4': 2, '9': 3, '12': 7, '16': 4, '20b': 6 }[String(st.pocket)] || 3;
    try { ficBinderSize = code; if (typeof loadCollection === 'function') loadCollection(); } catch (e) { }
    var cat = SET_CATALOG.filter(function (x) { return x.id === setKey(st.set); })[0] || {};
    closeSheet();
    var only = st.status === 'miss' ? 'missing' : st.status === 'have' ? 'collected' : undefined;
    try { Promise.resolve(printBinder(cur.view.slice(), function () { return st.set; }, cat.label || st.set, only)); } catch (e) { toast('Não foi possível gerar o PDF.'); }
  }
  function bulkMatch(v) {
    return function (c) {
      if (v === 'g:all') return true;
      if (v === 'g:base') return c.base !== false;
      if (v === 'g:sec') return c.base === false;
      return c.rare === v.slice(2);
    };
  }
  function doBulk() {
    var rs = {}; cur.view.forEach(function (c) { if (c.rare) rs[c.rare] = (rs[c.rare] || 0) + 1; });
    var keys = Object.keys(rs).sort(function (a, b) { return rareRank(b) - rareRank(a); });
    if (!cur.view.length) { toast('Nenhuma carta visível para marcar.'); return; }
    var nBase = cur.view.filter(bulkMatch('g:base')).length, nSec = cur.view.filter(bulkMatch('g:sec')).length;
    var pl = function (n) { return ' (' + n + ' carta' + (n > 1 ? 's' : '') + ')'; };
    var opts = '';
    if (nBase && nSec) opts += '<option value="g:base">📄 Base set inteiro' + pl(nBase) + '</option><option value="g:sec">✨ Secretas' + pl(nSec) + '</option>';
    opts += '<option value="g:all">📚 Tudo que está na tela' + pl(cur.view.length) + '</option>';
    if (keys.length) opts += '<option disabled>— ou por raridade —</option>' + keys.map(function (k) { return '<option value="r:' + esc(k) + '">' + esc(rareLabel(k)) + pl(rs[k]) + '</option>'; }).join('');
    var body = '<div class="fn-form"><label>O que marcar<select id="fn-bulk-r">' + opts + '</select></label>' +
      '<div class="fn-warn" id="fn-bulk-info"></div><button type="button" class="fn-btn" id="fn-bulk-go" data-act="bulkrun">Marcar como coletadas</button><button type="button" class="fn-btn is-alt" data-close>Cancelar</button></div>';
    openSheet(body, 'Marcar várias de uma vez');
    var upd = function () {
      var r = $('#fn-bulk-r').value, n = 0, cards = 0;
      cur.view.filter(bulkMatch(r)).forEach(function (c) { var t = 0; slotsOf(st.set, c).forEach(function (x) { if (!has(keyOf(st.set, c, x.ver))) t++; }); if (t) cards++; n += t; });
      $('#fn-bulk-info').innerHTML = n ? 'Vai marcar <b>' + n + (n > 1 ? ' versões' : ' versão') + '</b> em <b>' + cards + ' carta' + (cards > 1 ? 's' : '') + '</b> como coletadas (1 cópia cada). Só as cartas que estão visíveis agora, respeitando busca e filtros.' : 'Todas as cartas visíveis dessa opção já estão marcadas.';
      $('#fn-bulk-go').disabled = !n;
    };
    $('#fn-bulk-r').addEventListener('change', upd); upd();
  }
  async function runBulk() {
    var sel = $('#fn-bulk-r'); if (!sel) return; var rare = sel.value, id = st.set, keys = [];
    cur.view.filter(bulkMatch(rare)).forEach(function (c) { slotsOf(id, c).forEach(function (x) { var k = keyOf(id, c, x.ver); if (!has(k)) keys.push(k); }); });
    if (!keys.length) { toast('Já estão todas marcadas.'); closeSheet(); return; }
    var go = $('#fn-bulk-go'); if (go) { go.disabled = true; go.textContent = 'Marcando…'; }
    if (DEMO) { keys.forEach(function (k) { demoSet.add(k); }); closeSheet(); renderAll(); toast(keys.length + ' versões marcadas (demonstração).'); return; }
    if (!loggedIn()) { toast('Entre no MyDeck para marcar suas cartas.'); closeSheet(); return; }
    var done = 0, failed = false;
    for (var i = 0; i < keys.length; i += 50) {
      var chunk = keys.slice(i, i + 50);
      chunk.forEach(function (k) { collected.add(k); collectedQty.set(k, { qty: 1, origins: [] }); });
      var res; try { res = await sbClient.from('collection').upsert(chunk.map(function (k) { return { slot_key: k, user_id: uid(), quantity: 1, origins: [] }; }), { onConflict: 'user_id,slot_key' }); } catch (e) { res = { error: e }; }
      if (res && res.error) { chunk.forEach(function (k) { collected.delete(k); collectedQty.delete(k); }); failed = true; console.error(res.error); break; }
      done += chunk.length; if (go) go.textContent = 'Marcando… ' + done + '/' + keys.length;
    }
    closeSheet(); progCache = {}; renderAll();
    toast(failed ? 'Marquei ' + done + ' de ' + keys.length + '. Houve um erro, tente de novo.' : keys.length + ' versões marcadas como coletadas.');
  }

  // ── folhas ─────────────────────────────────────────────────
  function openSheet(inner, title, extra) {
    var ov = $('#fn-overlay'); ov.hidden = false; ov.dataset.detail = ''; ov.classList.remove('is-drawer');
    ov.innerHTML = '<div class="fn-sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="fn-sheet-h"><h3>' + esc(title) + '</h3><button class="fn-x" type="button" data-close aria-label="Fechar">×</button></div><div class="fn-sheet-b">' + inner + '</div></div>';
    document.body.style.overflow = 'hidden';
    if (extra) extra(ov);
  }
  function closeSheet() { var ov = $('#fn-overlay'); ov.hidden = true; ov.innerHTML = ''; ov.dataset.detail = ''; ov.classList.remove('is-drawer'); document.body.style.overflow = ''; }
  function openDetail(n, keep) {
    var c = findCard(n); if (!c) return;
    var id = st.set, s = stateOf(id, c), nm = i18n(c, id).name;
    var title = s.st === 'have' ? 'Coletada ✓' : s.st === 'part' ? 'Parcial' : 'Faltando';
    var html = '<div class="fn-detail"><div class="fn-detail-top"><div class="fn-detail-img"><img alt="' + esc(nm) + '" src="' + esc(imgSrc(cur.d, id, c, true)) + '"></div>' +
      '<div class="fn-detail-info"><h4>' + (c.important ? '★ ' : '') + esc(nm) + '</h4><p>#' + esc(c.n) + ' · ' + esc(c.type || '') + '<br><span class="' + rareCls(c.rare) + '">' + esc(rareLabel(c.rare)) + '</span> · ' + esc(priceFmt(c, id)) + (c.artist ? '<br><small style="color:var(--muted)">Ilustrador: ' + esc(c.artist) + '</small>' : '') + '</p></div></div>' +
      verBlocks(id, c) +
      (isDex(id) && c._dex ? '<div class="fn-dexact"><p class="fn-note">Vaga #' + c._dex + ' da Pokédex · ' + esc(setLabelOf(c._set).split('—')[0].trim()) + '</p><button type="button" class="fn-btn is-alt" data-dexpick="' + c._dex + '">🔁 Trocar a carta desta vaga</button></div>' : '') + '</div>';
    if (keep) { var b = $('#fn-overlay .fn-sheet-b'); if (b) { b.innerHTML = html; var h3 = $('#fn-overlay .fn-sheet-h h3'); if (h3) h3.textContent = title; return; } }
    openSheet(html, title, function (ov) { ov.dataset.detail = String(n); });
    $('#fn-overlay').dataset.detail = String(n);
  }
  // ── navegação por blocos (eras) e expansões ──────────────
  var progCache = {};
  function progOf(id) {
    if (progCache[id] !== undefined) return progCache[id];
    var d = setData(id); if (!d || !d.cards || !d.cards.length) return null; // sem dados ainda: não guarda, tenta de novo depois
    var tot = 0, got = 0;
    d.cards.forEach(function (c) { slotsOf(id, c).forEach(function (x) { tot++; if (has(keyOf(id, c, x.ver))) got++; }); });
    return (progCache[id] = tot ? { got: got, tot: tot, pct: Math.round(got / tot * 100) } : null);
  }
  function seriesOrder() {
    var meta = (typeof SERIES_META !== 'undefined' && SERIES_META) || {}, keys = Object.keys(meta);
    SET_CATALOG.forEach(function (s) { var k = s.series || 'Outros'; if (keys.indexOf(k) < 0) keys.push(k); });
    return keys;
  }
  function blockTitle(k) {
    var meta = (typeof SERIES_META !== 'undefined' && SERIES_META && SERIES_META[k]) || null;
    return meta ? (meta.sub || meta.t) : (GROUP_NAME[k] || k);
  }
  function openBlocks() { var v = LS.get('open', null); return v || [(SET_CATALOG.filter(function (s) { return s.id === st.set; })[0] || {}).series]; }
  function treeHtml() {
    var open = openBlocks(), by = {};
    SET_CATALOG.forEach(function (s) { (by[s.series || 'Outros'] = by[s.series || 'Outros'] || []).push(s); });
    var html = seriesOrder().filter(function (k) { return by[k] && by[k].length; }).map(function (k) {
      var sets = by[k], got = 0, tot = 0;
      var rows = sets.map(function (s) {
        var p = progOf(s.id); if (p) { got += p.got; tot += p.tot; }
        var nm = (s.label || '').split('—').slice(1).join('—').trim() || s.label, code = (s.label || '').split('—')[0].trim();
        return '<button type="button" class="fn-set' + (s.id === setKey(st.set) ? ' is-cur' : '') + '" data-pick="' + esc(s.id) + '" data-find="' + esc((nm + ' ' + code).toLowerCase()) + '">' +
          '<span class="em">' + esc(s.emoji || '🃏') + '</span><span class="tx"><b>' + esc(nm) + '</b><small>' + esc(code) + (s.upcoming ? ' · em breve' : '') + '</small>' +
          (p ? '<div class="mini"><i style="width:' + p.pct + '%"></i></div>' : '') + '</span>' +
          '<span class="pc' + (p && p.pct ? '' : ' z') + '">' + (p ? p.pct + '%' : '—') + '</span></button>';
      }).join('');
      var isOpen = open.indexOf(k) >= 0, bp = tot ? Math.round(got / tot * 100) : null;
      return '<section class="fn-blk' + (isOpen ? ' is-open' : '') + '" data-blk-id="' + esc(k) + '">' +
        '<button type="button" class="fn-blk-h" data-blk="' + esc(k) + '" aria-expanded="' + isOpen + '"><span class="ch">▸</span><span class="t">' + esc(blockTitle(k)) + '</span>' +
        '<span class="n">' + (bp != null ? '<b>' + bp + '%</b> · ' : '') + sets.length + '</span></button><div class="fn-blk-b">' + rows + '</div></section>';
    }).join('');
    return dexTreeHtml() + (html || '<div class="fn-tree-empty">Nenhuma coleção encontrada.</div>');
  }
  function sideHtml() { return '<input class="fn-tsearch" type="search" placeholder="Buscar coleção…" autocomplete="off" aria-label="Buscar coleção"><div class="fn-tree">' + treeHtml() + '</div>'; }
  function renderSide() {
    var side = $('#fn-side'); if (!side) return;
    if (!$('.fn-tsearch', side)) side.innerHTML = sideHtml(); else $('.fn-tree', side).innerHTML = treeHtml();
    applyTreeFilter(side);
    var cur = $('.fn-set.is-cur', side);
    // rola só a barra lateral (nunca a página): leva a coleção atual para uma posição visível
    if (cur && innerWidth >= 1000) { var r = cur.getBoundingClientRect(), sr = side.getBoundingClientRect(); if (r.top < sr.top + 40 || r.bottom > sr.bottom - 40) side.scrollTop += (r.top - sr.top) - sr.height / 3; }
  }
  function applyTreeFilter(root) {
    if (!root) return; var inp = $('.fn-tsearch', root); if (!inp) return; var q = inp.value.trim().toLowerCase();
    $$('.fn-blk', root).forEach(function (b) {
      var any = false;
      $$('.fn-set', b).forEach(function (r) { var ok = !q || r.dataset.find.indexOf(q) >= 0; r.hidden = !ok; if (ok) any = true; });
      b.hidden = !!q && !any; if (q && any) b.classList.add('is-open');
    });
  }
  function toggleBlock(k) {
    var open = openBlocks().slice(), i = open.indexOf(k); if (i >= 0) open.splice(i, 1); else open.push(k);
    LS.set('open', open);
    $$('.fn-blk[data-blk-id="' + k + '"]').forEach(function (b) { b.classList.toggle('is-open', i < 0); var h = $('.fn-blk-h', b); if (h) h.setAttribute('aria-expanded', String(i < 0)); });
  }
  function openDrawer() {
    var ov = $('#fn-overlay'); ov.hidden = false; ov.dataset.detail = ''; ov.classList.add('is-drawer');
    ov.innerHTML = '<div class="fn-drawer" role="dialog" aria-modal="true" aria-label="Escolher coleção"><div class="fn-sheet-h"><h3>Coleções</h3><button class="fn-x" type="button" data-close aria-label="Fechar">×</button></div><div class="fn-sheet-b">' + sideHtml() + '</div></div>';
    document.body.style.overflow = 'hidden';
    var cur = $('.fn-drawer .fn-set.is-cur'), body = $('.fn-drawer .fn-sheet-b'); if (cur && body) body.scrollTop = Math.max(0, cur.offsetTop - body.clientHeight / 3);
  }
  function pickSet(id) {
    dexLimit = 300; st.set = id; st.q = ''; st.status = 'all'; st.bpage = 0; st.artist = ''; st.imp = false; LS.set('set', id);
    try { history.replaceState(null, '', '#' + id); } catch (e) { }
    $('#fn-q').value = '';
    var ser = (SET_CATALOG.filter(function (x) { return x.id === setKey(id); })[0] || {}).series; var ob = openBlocks(); if (ser && ob.indexOf(ser) < 0) { ob.push(ser); LS.set('open', ob); }
    closeSheet(); renderAll(); window.scrollTo({ top: 0 });
    var langs = langsOf(id); if (langs && langs.indexOf(st.lang) < 0) st.lang = 'en';
  }

  // ── avisos ─────────────────────────────────────────────────
  var toastT;
  function toast(msg) { var t = $('#fn-toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200); }
  function banner() {
    var b = $('#fn-banner');
    if (DEMO) { b.hidden = false; b.innerHTML = '<b>Modo demonstração</b> — coleção fictícia só nesta tela. Nada é salvo.'; return; }
    if (!loggedIn()) { b.hidden = false; b.innerHTML = 'Você ainda não entrou. <a href="./">Entre no MyDeck</a> e volte aqui para ver e marcar a sua coleção.'; }
    else b.hidden = true;
    var u = $('#fn-user'); try { var cu = currentUser; u.textContent = cu ? ((cu.user_metadata && (cu.user_metadata.name || cu.user_metadata.full_name)) || (cu.email || '').split('@')[0]) : ''; } catch (e) { }
  }

  // ── eventos ────────────────────────────────────────────────
  var qT;
  function bind() {
    $('#fn-q').addEventListener('input', function (e) { clearTimeout(qT); var v = e.target.value; qT = setTimeout(function () { st.q = v; st.bpage = 0; renderBody(); }, 120); });
    $$('.fn-chip[data-status]').forEach(function (b) { b.addEventListener('click', function () { st.status = b.dataset.status; st.bpage = 0; renderControls(); renderBody(); }); });
    $('#fn-imp').addEventListener('click', function () { st.imp = !st.imp; st.bpage = 0; renderControls(); renderBody(); });
    $$('#fn-lang button').forEach(function (b) { b.addEventListener('click', function () { setLang(b.dataset.lang); }); });
    $('#fn-sort').addEventListener('change', function (e) { st.sort = e.target.value; renderBody(); });
    $$('#fn-view button').forEach(function (b) { b.addEventListener('click', function () { st.view = b.dataset.view; LS.set('view', st.view); renderControls(); renderBody(); }); });
    $('#fn-cols-minus').addEventListener('click', function () { st.cols = Math.max(2, st.cols - 1); LS.set('cols', st.cols); renderControls(); });
    $('#fn-cols-plus').addEventListener('click', function () { st.cols = Math.min(10, st.cols + 1); LS.set('cols', st.cols); renderControls(); });
    $('#fn-setbtn').addEventListener('click', openDrawer);
    $('#fn-more').addEventListener('click', openActions);
    $('#fn-focus').addEventListener('click', function () {
      st.focus = !st.focus; LS.set('focus', st.focus); applyFocus(); window.scrollTo({ top: 0 });
      if (st.focus) toast('Modo foco: use as setas ← → para trocar de página e Esc para sair.');
    });
    window.addEventListener('resize', applyFocus);
    $('#fn-artist').addEventListener('change', function (e) { st.artist = e.target.value; st.bpage = 0; renderBody(); });
    $('#fn-theme').addEventListener('click', function () {
      var n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', n); try { localStorage.setItem('mydeck-theme', n); } catch (e) { }
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-mark],[data-open],[data-pick],[data-close],[data-bnav],[data-pocket],[data-blk],[data-qty],[data-addorig],[data-delorig],[data-act],[data-dexpick]'); if (!t) { if (e.target.id === 'fn-overlay') closeSheet(); return; }
      if (t.dataset.mark != null) { e.preventDefault(); mark(t.dataset.mark, t.dataset.ver); }
      else if (t.dataset.open != null) openDetail(t.dataset.open);
      else if (t.dataset.dexpick != null) openDexPicker(Number(t.dataset.dexpick));
      else if (t.dataset.qty != null) {
        var cc = findCard(t.dataset.n); if (cc) { var ee = entryOf(keyOf(st.set, cc, t.dataset.ver)), q = Math.max(0, ee.qty + Number(t.dataset.qty)); setEntry(t.dataset.n, t.dataset.ver, q, q > 0 ? ee.origins : []); }
      }
      else if (t.dataset.addorig != null) {
        var sel = t.parentNode.querySelector('select'), cc2 = findCard(t.dataset.n);
        if (sel && sel.value && cc2) { var e2 = entryOf(keyOf(st.set, cc2, t.dataset.ver)); if (e2.origins.indexOf(sel.value) < 0) e2.origins.push(sel.value); setEntry(t.dataset.n, t.dataset.ver, Math.max(1, e2.qty), e2.origins); }
      }
      else if (t.dataset.delorig != null) {
        var cc3 = findCard(t.dataset.n);
        if (cc3) { var e3 = entryOf(keyOf(st.set, cc3, t.dataset.ver)); e3.origins.splice(Number(t.dataset.delorig), 1); setEntry(t.dataset.n, t.dataset.ver, e3.qty, e3.origins); }
      }
      else if (t.dataset.act) { var a = t.dataset.act; if (a === 'share') doShare(); else if (a === 'sharerun') runShare(); else if (a === 'sharecopy') copyShare(); else if (a === 'sharewa') waShare(); else if (a === 'copy') doCopy(); else if (a === 'copyrun') runCopy(); else if (a === 'print') doPrint(); else if (a === 'bulk') doBulk(); else if (a === 'bulkrun') runBulk();
        else if (a === 'dexmore') { dexLimit += 300; renderBody(); }
        else if (a === 'dexnew') openDexNew();
        else if (a === 'dexcreate') dexCreate(t.dataset.kind);
        else if (a === 'dexchoose') dexAssign(Number(t.dataset.dex), t.dataset.dset, t.dataset.dn);
        else if (a === 'dexclear') dexAssign(Number(t.dataset.dex), null); }
      else if (t.dataset.blk) toggleBlock(t.dataset.blk);
      else if (t.dataset.pick) pickSet(t.dataset.pick);
      else if (t.dataset.close != null) closeSheet();
      else if (t.dataset.bnav) { st.bpage = Math.max(0, st.bpage + Number(t.dataset.bnav) * (innerWidth >= 700 ? 2 : 1)); renderBody(); }
      else if (t.dataset.pocket) { st.pocket = String(t.dataset.pocket); LS.set('pocket', st.pocket); st.bpage = 0; renderBody(); }
    });
    document.addEventListener('input', function (e) { if (e.target.id === 'fn-dp-q') { renderDexPicker(e.target.value); return; } if (e.target.classList && e.target.classList.contains('fn-tsearch')) applyTreeFilter(e.target.closest('.fn-side,.fn-drawer')); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { var ov = $('#fn-overlay'); if (ov && !ov.hidden) closeSheet(); else if (document.body.classList.contains('fn-focus')) { st.focus = false; LS.set('focus', false); applyFocus(); } return; }
      var tg = e.target && e.target.tagName; if (/INPUT|SELECT|TEXTAREA/.test(tg || '')) return;
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && document.body.classList.contains('fn-focus') && $('#fn-overlay').hidden) { var nb = $('[data-bnav="' + (e.key === 'ArrowRight' ? 1 : -1) + '"]'); if (nb && !nb.disabled) nb.click(); }
    });
    var bar = $('#fn-bar'), top = function () { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top-h')) || 52; };
    var lastY = scrollY;
    addEventListener('scroll', function () {
      bar.classList.toggle('is-stuck', bar.getBoundingClientRect().top <= top() + 1);
      var y = scrollY, dy = y - lastY;
      if (innerWidth < 700 && Math.abs(dy) > 6) { bar.classList.toggle('is-hidden', dy > 0 && y > 260); lastY = y; }
      else if (innerWidth >= 700) bar.classList.remove('is-hidden');
    }, { passive: true });
    var lastW = innerWidth; addEventListener('resize', function () { if ((lastW >= 700) !== (innerWidth >= 700)) { lastW = innerWidth; if (st.view === 'binder') renderBody(); } });
    addEventListener('error', function (e) { toast('Algo deu errado nesta tela. Se repetir, mande um print.'); try { console.error(e.message); } catch (x) { } });
  }

  // ── acoplamento com o motor (não deixa o app.js desenhar nada no lugar) ──
  function neutralizeOldRenderers() {
    // quem só reflete uma marcação já tratada aqui (patchOne) fica mudo; quem indica dado novo manda reler
    ['renderBinder', 'updateDashProgress', 'renderFicDashboard'].forEach(function (n) {
      if (typeof window[n] === 'function') window[n] = function () { };
    });
    ['renderAll', 'renderDash', 'renderGastos', 'renderCartas', 'renderTabs', 'renderEvolucao', 'renderPatrimonio', 'renderCustomBindersHome'].forEach(function (n) {
      if (typeof window[n] === 'function') window[n] = function () { onData(); };
    });
    if (typeof window.loadAll === 'function') {
      var orig = window.loadAll;
      window.loadAll = function () { var r = orig.apply(this, arguments); Promise.resolve(r).then(onData, onData); return r; };
    }
  }
  var dataT;
  function onData() { clearTimeout(dataT); dataT = setTimeout(function () { banner(); if (engineReady()) { progCache = {}; loadCur(); renderHero(); renderBody(); renderSide(); } }, 60); }

  function boot() {
    if (!engineReady()) { return setTimeout(boot, 80); }
    neutralizeOldRenderers();
    if (!isDex(st.set) && !SET_CATALOG.some(function (s) { return s.id === st.set; })) st.set = 'me06';
    bind(); banner(); renderAll();
    window.addEventListener('lazy-sets-loaded', function () { dexIdx = null; onData(); });
    setTimeout(banner, 2500);
    window.__fn = { st: st, renderAll: renderAll, mark: mark }; // útil para depurar no console
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
