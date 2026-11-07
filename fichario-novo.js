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
  var money = function (v) { return (v == null || isNaN(v)) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var money0 = function (v) { return v >= 100 ? 'R$ ' + Math.round(v).toLocaleString('pt-BR') : money(v); };

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
    lang: LS.get('lang', 'pt'),
    pocket: LS.get('pocket', 9),
    bpage: 0
  };
  var demoSet = new Set();
  (function seedDemo() {
    if (!DEMO) return;
    var seed = 7; var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    window.__fnSeed = rnd;
  })();

  // ── ponte com o motor ──────────────────────────────────────
  function engineReady() { return typeof getSetData === 'function' && typeof getSlots === 'function' && typeof SET_CATALOG !== 'undefined'; }
  function loggedIn() { try { return !!uid(); } catch (e) { return false; } }
  function has(key) { return DEMO ? demoSet.has(key) : (typeof collected !== 'undefined' && collected.has(key)); }
  function keyOf(id, c, ver) { return slotKey(id + ':', c.n, ver); }

  function setData(id) {
    var prev = currentSet;
    try {
      currentSet = id;
      var d = getSetData();
      if (id !== 'me04' && d && d.cards === CARDS) return null; // id desconhecido caiu no fallback do me04
      return d;
    } catch (e) { return null; } finally { currentSet = prev; }
  }
  function slotsOf(id, c) { try { return getSlots(c, id) || []; } catch (e) { return []; } }
  function stateOf(id, c) {
    var sl = slotsOf(id, c); if (!sl.length) return { st: 'miss', have: 0, tot: 0, sl: sl };
    var h = 0; sl.forEach(function (s) { if (has(keyOf(id, c, s.ver))) h++; });
    return { st: h === 0 ? 'miss' : h === sl.length ? 'have' : 'part', have: h, tot: sl.length, sl: sl };
  }
  function langsOf(id) { return (typeof FIC_LANG_SETS !== 'undefined' && FIC_LANG_SETS[id]) || null; }
  function imgSrc(d, id, c, big) {
    var u = imgRaw(d, id, c);
    if (big) return u;
    try { return typeof imgThumb === 'function' ? imgThumb(u) : u; } catch (e) { return u; }
  }
  function imgRaw(d, id, c) {
    var langs = langsOf(id);
    try {
      if (langs && st.lang !== 'en' && langs.indexOf(st.lang) >= 0 && d.imgFn) {
        var u = d.imgFn(c, st.lang); if (u) return u;
      }
      if (d.imgFn) { var u2 = d.imgFn(c.n); if (u2) return u2; }
    } catch (e) { }
    return c.img || '';
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
    if (/Ilustr.*Esp|Especial|SAR|SIR|Special Illustration/i.test(r)) return 'Ilustração Rara Especial';
    if (/Ilustr|Illustration|IR/i.test(r)) return 'Ilustração Rara';
    if (/Ultra|UR/i.test(r)) return 'Full Art';
    if (/Dupla|Double|RR/i.test(r)) return 'Dupla Rara';
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
  function loadCur() {
    cur.d = setData(st.set);
    cur.cards = cur.d && cur.d.cards ? cur.d.cards : [];
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
      if (q && (c.name + ' ' + c.n + ' ' + (c.nameEn || '') + ' ' + (c.type || '') + ' ' + rareLabel(c.rare) + ' ' + (c.rare || '')).toLowerCase().indexOf(q) < 0) return false;
      if (st.status !== 'all') { var s = stateOf(id, c).st; if (st.status === 'miss' && s === 'have') return false; if (st.status === 'have' && s !== 'have') return false; }
      return true;
    });
    var by = {
      num: function (a, b) { return String(a.n).localeCompare(String(b.n), undefined, { numeric: true }); },
      name: function (a, b) { return String(a.name).localeCompare(String(b.name), 'pt'); },
      rare: function (a, b) { return rareRank(b.rare) - rareRank(a.rare) || by.num(a, b); },
      price: function (a, b) { return (b.price || 0) - (a.price || 0); }
    };
    arr.sort(by[st.sort] || by.num);
    cur.view = arr;
  }
  function totals() {
    var id = st.set, t = { slots: 0, got: 0, miss: 0, bT: 0, bG: 0, sT: 0, sG: 0, cards: 0, cardsHave: 0 };
    cur.cards.forEach(function (c) {
      var s = stateOf(id, c); t.cards++; if (s.st === 'have') t.cardsHave++;
      s.sl.forEach(function (x) {
        var k = has(keyOf(id, c, x.ver)); t.slots++; if (k) t.got++; else t.miss += (x.price || c.price || 0);
        if (c.base) { t.bT++; if (k) t.bG++; } else { t.sT++; if (k) t.sG++; }
      });
    });
    return t;
  }

  // ── renderização ───────────────────────────────────────────
  function verButtons(id, c, big) {
    var sl = slotsOf(id, c);
    return '<div class="fn-vers">' + sl.map(function (s) {
      var on = has(keyOf(id, c, s.ver));
      var nm = VERSION_NAME[s.ver] || s.ver;
      return '<button type="button" class="fn-ver' + (on ? ' is-on' : '') + '" data-mark="' + esc(c.n) + '" data-ver="' + esc(s.ver) + '" aria-pressed="' + on + '" aria-label="' + esc(c.name + ' — ' + nm + (on ? ' (coletada)' : ' (faltando)')) + '">' +
        (big ? s.ver + '<small>' + (on ? 'Tenho ✓' : 'Marcar') + '</small>' : (on ? '✓ ' : '') + s.ver) + '</button>';
    }).join('') + '</div>';
  }
  function cardHtml(c) {
    var id = st.set, s = stateOf(id, c), r = rareCls(c.rare);
    return '<article class="fn-card is-' + s.st + '" data-n="' + esc(c.n) + '">' +
      '<button type="button" class="fn-img" data-open="' + esc(c.n) + '" aria-label="Ver ' + esc(c.name) + '">' +
      '<img loading="lazy" decoding="async" alt="' + esc(c.name) + '" src="' + esc(imgSrc(cur.d, id, c)) + '">' +
      '<span class="fn-tick" aria-hidden="true">' + (s.st === 'part' ? '½' : '✓') + '</span></button>' +
      '<div class="fn-meta"><span class="fn-name" title="' + esc(c.name) + '">' + esc(c.name) + '</span><span class="fn-price">' + esc(money0(c.price || 0)) + '</span></div>' +
      '<div class="fn-sub"><span>#' + esc(c.n) + '</span><span class="fn-rare ' + r + '">' + esc(rareLabel(c.rare)) + '</span></div>' +
      verButtons(id, c, false) + '</article>';
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
        return '<tr data-n="' + esc(c.n) + '" class="' + (s.st === 'miss' ? 't-miss' : '') + '"><td class="t-thumb"><img loading="lazy" alt="" src="' + esc(imgSrc(cur.d, id, c)) + '"></td><td>#' + esc(c.n) + '</td>' +
          '<td><button type="button" style="all:unset;cursor:pointer;font-weight:700" data-open="' + esc(c.n) + '">' + esc(c.name) + '</button></td>' +
          '<td class="' + rareCls(c.rare) + '">' + esc(rareLabel(c.rare)) + '</td><td>' + esc(money(c.price)) + '</td><td>' + verButtons(id, c, false) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function renderBinder() {
    var id = st.set, per = st.pocket, cols = per === 4 ? 2 : per === 16 ? 4 : 3;
    var items = cur.view; if (!items.length) return emptyMsg();
    var pages = Math.ceil(items.length / per), two = innerWidth >= 700, step = two ? 2 : 1;
    if (st.bpage >= pages) st.bpage = Math.max(0, pages - 1);
    st.bpage = st.bpage - (st.bpage % step);
    var p0 = st.bpage;
    function page(i) {
      if (i >= pages) return '<div></div>';
      var chunk = items.slice(i * per, i * per + per);
      return '<div class="fn-page"><div class="fn-page-lbl">Página ' + (i + 1) + '</div><div class="fn-pocket-grid" style="--pc:' + cols + '">' +
        chunk.map(function (c) {
          var s = stateOf(id, c);
          return '<button type="button" class="fn-pocket is-' + s.st + '" data-n="' + esc(c.n) + '" data-open="' + esc(c.n) + '" aria-label="' + esc(c.name) + '">' +
            '<img loading="lazy" decoding="async" alt="" src="' + esc(imgSrc(cur.d, id, c)) + '"><span class="fn-slotn">#' + esc(c.n) + '</span><span class="fn-tick">' + (s.st === 'part' ? '½' : '✓') + '</span></button>';
        }).join('') + '</div></div>';
    }
    var lbl = two ? 'Páginas ' + (p0 + 1) + (p0 + 2 <= pages ? '–' + (p0 + 2) : '') + ' de ' + pages : 'Página ' + (p0 + 1) + ' de ' + pages;
    return '<div class="fn-binder-nav"><button type="button" data-bnav="-1"' + (p0 <= 0 ? ' disabled' : '') + '>‹ Anterior</button>' +
      '<span class="fn-binder-pg">' + lbl + '</span><button type="button" data-bnav="1"' + (p0 + step >= pages ? ' disabled' : '') + '>Próxima ›</button>' +
      '<div class="fn-seg" id="fn-pocket" role="group" aria-label="Bolsos por página">' + [4, 9, 12, 16].map(function (n) { return '<button type="button" data-pocket="' + n + '" class="' + (per === n ? 'is-on' : '') + '">' + n + '</button>'; }).join('') + '</div></div>' +
      '<div class="fn-spread">' + page(p0) + (two ? page(p0 + 1) : '') + '</div>';
  }
  function emptyMsg() {
    if (!cur.d || !cur.cards.length) return '<div class="fn-empty">' + (loggedIn() || DEMO ? 'Carregando as cartas desta coleção…' : 'Esta coleção carrega depois do login.') + '</div>';
    return '<div class="fn-empty">Nenhuma carta com esse filtro.</div>';
  }
  function renderHero() {
    var d = cur.d, meta = (typeof SET_META !== 'undefined' && SET_META[st.set]) || {}, cat = SET_CATALOG.filter(function (s) { return s.id === st.set; })[0] || {};
    var t = totals(), pct = t.slots ? Math.round(t.got / t.slots * 100) : 0;
    var label = (cat.label || (d && d.label) || st.set);
    var nameOnly = label.indexOf('—') >= 0 ? label.split('—')[1].trim() : label;
    $('#fn-hero').innerHTML =
      '<div class="fn-hero-top"><div><h1>' + esc(nameOnly) + '</h1><p class="fn-hero-sub">' + esc(label.split('—')[0].trim()) + (meta.releaseDate ? ' · lançada em ' + esc(meta.releaseDate) : '') + ' · ' + t.cards + ' cartas' + '</p></div>' +
      '<div class="fn-pct">' + pct + '<small>%</small></div></div>' +
      '<div class="fn-progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>' +
      '<div class="fn-stats"><span><b>' + t.got + '</b>/' + t.slots + ' slots</span>' +
      (t.sT ? '<span>Base <b>' + t.bG + '</b>/' + t.bT + '</span><span>Secretas <b>' + t.sG + '</b>/' + t.sT + '</span>' : '') +
      (!t.slots ? '<span>' + (loggedIn() || DEMO ? 'Carregando as cartas…' : 'Entre no MyDeck para carregar esta coleção.') + '</span>' : t.miss > 0 ? '<span class="fn-miss">Faltam <b>' + esc(money0(t.miss)) + '</b></span>' : '<span><b style="color:var(--teal)">Coleção completa 🎉</b></span>') + '</div>' +
      '<div class="fn-hero-links"><a href="./#fichario/' + esc(st.set) + '">Abrir no fichário atual</a></div>';
    $('#fn-setbtn-emoji').textContent = cat.emoji || '🃏';
    $('#fn-setbtn-code').textContent = label.split('—')[0].trim();
    $('#fn-setbtn-name').textContent = nameOnly;
  }
  function renderBody() {
    computeView();
    var html = st.view === 'table' ? renderTable() : st.view === 'binder' ? renderBinder() : renderGrid();
    $('#fn-body').innerHTML = html;
  }
  function renderControls() {
    $$('.fn-chip').forEach(function (b) { b.classList.toggle('is-on', b.dataset.status === st.status); });
    $$('#fn-view button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.view === st.view); });
    $('#fn-sort').value = st.sort;
    $('#fn-cols-val').textContent = st.cols;
    $('#fn-cols-wrap').style.display = st.view === 'grid' ? '' : 'none';
    document.documentElement.style.setProperty('--cols', st.cols);
  }
  function renderAll() { loadCur(); renderHero(); renderControls(); renderBody(); renderSide(); }

  // atualização pontual (marcou uma versão): troca só aquele cartão e o resumo
  function patchOne(n) {
    var c = cur.cards.filter(function (x) { return String(x.n) === String(n); })[0]; if (!c) return;
    if (st.status !== 'all') { renderBody(); renderHero(); delete progCache[st.set]; renderSide(); return; } // filtro ativo: a carta pode sair da lista
    $$('[data-n="' + n + '"]', $('#fn-body')).forEach(function (el) {
      var tmp = document.createElement('div');
      if (el.matches('article.fn-card')) { tmp.innerHTML = cardHtml(c); el.replaceWith(tmp.firstChild); }
      else if (el.matches('tr')) { var holder = document.createElement('table'); holder.innerHTML = renderTable(); var nr = $('tr[data-n="' + n + '"]', holder); if (nr) el.replaceWith(nr); }
      else if (el.matches('.fn-pocket')) { var s = stateOf(st.set, c); el.className = 'fn-pocket is-' + s.st; $('.fn-tick', el).textContent = s.st === 'part' ? '½' : '✓'; }
    });
    renderHero(); delete progCache[st.set]; renderSide();
    var ov = $('#fn-overlay'); if (!ov.hidden && ov.dataset.detail === String(n)) openDetail(n, true);
  }

  // ── marcar ─────────────────────────────────────────────────
  var busy = {};
  function mark(n, ver) {
    var c = cur.cards.filter(function (x) { return String(x.n) === String(n); })[0]; if (!c) return;
    var key = keyOf(st.set, c, ver);
    if (DEMO) { if (demoSet.has(key)) demoSet.delete(key); else demoSet.add(key); patchOne(n); return; }
    if (!loggedIn()) { toast('Entre no MyDeck para marcar suas cartas.'); return; }
    if (busy[key]) return; busy[key] = true;
    var p; try { p = toggleSlot(key); } catch (e) { busy[key] = false; toast('Não foi possível marcar. Tente de novo.'); return; }
    patchOne(n); // o motor já mexeu na coleção (otimista) antes do primeiro await
    Promise.resolve(p).then(function () { patchOne(n); }, function () { toast('Não foi possível salvar. Tente de novo.'); patchOne(n); }).then(function () { busy[key] = false; });
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
    var c = cur.cards.filter(function (x) { return String(x.n) === String(n); })[0]; if (!c) return;
    var id = st.set, s = stateOf(id, c);
    var qty = (!DEMO && typeof collectedQty !== 'undefined') ? slotsOf(id, c).map(function (x) { var e = collectedQty.get(keyOf(id, c, x.ver)); return e && e.qty > 1 ? x.ver + ' ×' + e.qty : ''; }).filter(Boolean).join(' · ') : '';
    var html = '<div class="fn-detail"><div class="fn-detail-img"><img alt="' + esc(c.name) + '" src="' + esc(imgSrc(cur.d, id, c, true)) + '"></div>' +
      '<div><h4>' + esc(c.name) + '</h4><p>#' + esc(c.n) + ' · <span class="' + rareCls(c.rare) + '">' + esc(rareLabel(c.rare)) + '</span> · ' + esc(money(c.price)) + (qty ? '<br>' + esc(qty) : '') + '</p></div>' +
      verButtons(id, c, true) + '</div>';
    if (keep) { var b = $('#fn-overlay .fn-sheet-b'); if (b) { b.innerHTML = html; return; } }
    openSheet(html, s.st === 'have' ? 'Coletada ✓' : s.st === 'part' ? 'Parcial' : 'Faltando', function (ov) { ov.dataset.detail = String(n); });
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
        return '<button type="button" class="fn-set' + (s.id === st.set ? ' is-cur' : '') + '" data-pick="' + esc(s.id) + '" data-find="' + esc((nm + ' ' + code).toLowerCase()) + '">' +
          '<span class="em">' + esc(s.emoji || '🃏') + '</span><span class="tx"><b>' + esc(nm) + '</b><small>' + esc(code) + (s.upcoming ? ' · em breve' : '') + '</small>' +
          (p ? '<div class="mini"><i style="width:' + p.pct + '%"></i></div>' : '') + '</span>' +
          '<span class="pc' + (p && p.pct ? '' : ' z') + '">' + (p ? p.pct + '%' : '—') + '</span></button>';
      }).join('');
      var isOpen = open.indexOf(k) >= 0, bp = tot ? Math.round(got / tot * 100) : null;
      return '<section class="fn-blk' + (isOpen ? ' is-open' : '') + '" data-blk-id="' + esc(k) + '">' +
        '<button type="button" class="fn-blk-h" data-blk="' + esc(k) + '" aria-expanded="' + isOpen + '"><span class="ch">▸</span><span class="t">' + esc(blockTitle(k)) + '</span>' +
        '<span class="n">' + (bp != null ? '<b>' + bp + '%</b> · ' : '') + sets.length + '</span></button><div class="fn-blk-b">' + rows + '</div></section>';
    }).join('');
    return html || '<div class="fn-tree-empty">Nenhuma coleção encontrada.</div>';
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
    st.set = id; st.q = ''; st.status = 'all'; st.bpage = 0; LS.set('set', id);
    try { history.replaceState(null, '', '#' + id); } catch (e) { }
    $('#fn-q').value = '';
    var ser = (SET_CATALOG.filter(function (x) { return x.id === id; })[0] || {}).series; var ob = openBlocks(); if (ser && ob.indexOf(ser) < 0) { ob.push(ser); LS.set('open', ob); }
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
    $$('.fn-chip').forEach(function (b) { b.addEventListener('click', function () { st.status = b.dataset.status; st.bpage = 0; renderControls(); renderBody(); }); });
    $('#fn-sort').addEventListener('change', function (e) { st.sort = e.target.value; renderBody(); });
    $$('#fn-view button').forEach(function (b) { b.addEventListener('click', function () { st.view = b.dataset.view; LS.set('view', st.view); renderControls(); renderBody(); }); });
    $('#fn-cols-minus').addEventListener('click', function () { st.cols = Math.max(2, st.cols - 1); LS.set('cols', st.cols); renderControls(); });
    $('#fn-cols-plus').addEventListener('click', function () { st.cols = Math.min(10, st.cols + 1); LS.set('cols', st.cols); renderControls(); });
    $('#fn-setbtn').addEventListener('click', openDrawer);
    $('#fn-theme').addEventListener('click', function () {
      var n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', n); try { localStorage.setItem('mydeck-theme', n); } catch (e) { }
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-mark],[data-open],[data-pick],[data-close],[data-bnav],[data-pocket],[data-blk]'); if (!t) { if (e.target.id === 'fn-overlay') closeSheet(); return; }
      if (t.dataset.mark != null) { e.preventDefault(); mark(t.dataset.mark, t.dataset.ver); }
      else if (t.dataset.open != null) openDetail(t.dataset.open);
      else if (t.dataset.blk) toggleBlock(t.dataset.blk);
      else if (t.dataset.pick) pickSet(t.dataset.pick);
      else if (t.dataset.close != null) closeSheet();
      else if (t.dataset.bnav) { st.bpage = Math.max(0, st.bpage + Number(t.dataset.bnav) * (innerWidth >= 700 ? 2 : 1)); renderBody(); }
      else if (t.dataset.pocket) { st.pocket = Number(t.dataset.pocket); LS.set('pocket', st.pocket); st.bpage = 0; renderBody(); }
    });
    document.addEventListener('input', function (e) { if (e.target.classList && e.target.classList.contains('fn-tsearch')) applyTreeFilter(e.target.closest('.fn-side,.fn-drawer')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
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
    if (!SET_CATALOG.some(function (s) { return s.id === st.set; })) st.set = 'me06';
    bind(); banner(); renderAll();
    window.addEventListener('lazy-sets-loaded', onData);
    setTimeout(banner, 2500);
    window.__fn = { st: st, renderAll: renderAll, mark: mark }; // útil para depurar no console
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
