/* Fichário (beta) — interface nova do MyDeck.
- Usa o MESMO motor do site (app.js): login, leitura da coleção, toggleSlot(), saveSlot() e catálogos.
- Nenhuma marcação, qualidade, lote ou progresso é salvo no localStorage: tudo vai para o banco (Supabase).
- Modo demonstração (?demo): coleção fictícia só na tela, não grava nada. */
(function () {
  'use strict';

  // ── utilidades ─────────────────────────────────────────────
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); };
  function bIco(b, size, tipo) {
    var t = tipo || (typeof cbType === 'function' ? cbType(b) : ''), n;
    if (b && b.filter_config && b.filter_config.favorites === true) n = 'star';
    else if (t === 'artist') n = 'palette';
    else if (t === 'pokemon') n = 'pokeball';
    else if (t === 'masterdex') n = 'pokedex';
    else if (t === 'preset') n = 'crown';
    else n = 'book';
    return MD_ICO(n, { size: size || 20 });
  }
  function pkIco(b, size) {
    var d = b && b.filter_config && b.filter_config.dex;
    if (!d) return MD_ICO('pokeball', { size: size });
    var s = Math.round(size * 1.3);
    return '<img class="ico pk-ico" width="' + s + '" height="' + s + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" src="' + esc(dexArt(d)) + '"' + (d > 151 ? ' onerror="__fnArtFb(this,' + d + ')"' : '') + '>';
  }
  var I = function (n, sz, o) { return MD_ICO(n, Object.assign({ size: sz || 16 }, o || {})); };
  var isIcoHtml = function (x) { return /^<(img|svg)/.test(x); };
  function setIco(id, fallback) {
    var k = setKey(id); var ok = k === 'cel30' || (typeof LMT_CODES !== 'undefined' && LMT_CODES[k]);
    return ok ? '<img class="set-ico" src="site-imagens/colecoes/' + esc(k) + '.png" alt="" loading="lazy" decoding="async">' : esc(fallback || '🃏');
  }
  // Apenas preferências de interface (visualização, colunas, idioma, abas abertas).
  // Nenhuma marcação, progresso, qualidade ou lote de carta é salvo aqui.
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('fn_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('fn_' + k, JSON.stringify(v)); } catch (e) { } }
  };
  var CUR = 'R$';
  var money = function (v) {
    if (v == null || isNaN(v)) return '—';
    return CUR === '$' ? '$ ' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var money0 = function (v) { return v >= 100 ? (CUR === '$' ? '$ ' + Math.round(v).toLocaleString('en-US') : 'R$ ' + Math.round(v).toLocaleString('pt-BR')) : money(v); };

  var DEMO = /[?&]demo\b/.test(location.search);
  var VERSION_NAME = { N: 'Normal', RH: 'Reverse Holo', RH2: 'Reverse Holo 2', F: 'Foil / Holo', SP: 'Especial' };
  var GROUP_NAME = { ME: 'Mega Evolução', SV: 'Escarlate & Violeta' };

  // ── qualidade / estado da carta (100% via banco / origins) ──
  var COND_PREFIX = 'cond:';
  var LOT_PREFIX = 'lot:';
  var CARD_CONDITIONS = [
    { code: 'M', label: 'Nova' },
    { code: 'NM', label: 'Praticamente Nova' },
    { code: 'SP', label: 'Usada Levemente' },
    { code: 'MP', label: 'Usada Moderadamente' },
    { code: 'HP', label: 'Muito Usada' },
    { code: 'D', label: 'Danificada' }
  ];

  function isValidCond(code) {
    return CARD_CONDITIONS.some(function (x) { return x.code === code; });
  }

  function isMetaOrigin(o) {
    var s = String(o || '');
    return s.indexOf(COND_PREFIX) === 0 || s.indexOf(LOT_PREFIX) === 0;
  }

  function parseOriginsMeta(origins) {
    var plain = [];
    var cond = '';
    var lots = [];
    (origins || []).forEach(function (o) {
      var s = String(o || '');
      if (!s) return;
      if (s.indexOf(COND_PREFIX) === 0) {
        var cd = s.slice(COND_PREFIX.length);
        if (isValidCond(cd)) cond = cd;
      } else if (s.indexOf(LOT_PREFIX) === 0) {
        try {
          var obj = JSON.parse(s.slice(LOT_PREFIX.length));
          if (obj && (Number(obj.q) || 0) > 0) {
            lots.push({
              qty: Math.max(1, Number(obj.q) || 1),
              cond: isValidCond(obj.c) ? obj.c : '',
              origins: Array.isArray(obj.o) ? obj.o.filter(function (x) { return x && !isMetaOrigin(x); }) : []
            });
          }
        } catch (e) { }
      } else {
        plain.push(s);
      }
    });
    return { plain: plain, cond: cond, lots: lots };
  }

  function buildOriginsMeta(plainOrigins, cond, lots) {
    var out = (plainOrigins || []).filter(function (o) { return o && !isMetaOrigin(o); });
    if (isValidCond(cond)) out.push(COND_PREFIX + cond);
    (lots || []).forEach(function (it) {
      var q = Number(it.qty) || 0;
      if (q <= 0) return;
      var payload = { q: q };
      if (isValidCond(it.cond)) payload.c = it.cond;
      var po = (it.origins || []).filter(function (x) { return x && !isMetaOrigin(x); });
      if (po.length) payload.o = po;
      out.push(LOT_PREFIX + JSON.stringify(payload));
    });
    return out;
  }

  function lotsOf(baseKey) {
    var e = entryOf(baseKey);
    if (!e || e.qty <= 0) return [];
    return parseOriginsMeta(e.origins).lots;
  }

  function saveLots(baseKey, list) {
    if (SHARE) return;
    var e = entryOf(baseKey);
    if (!e || e.qty <= 0) return;
    var meta = parseOriginsMeta(e.origins);
    var cleanLots = (list || []).filter(function (it) { return (Number(it.qty) || 0) > 0; });
    var nextOrigins = buildOriginsMeta(meta.plain, meta.cond, cleanLots);
    setEntryByKey(baseKey, e.qty, nextOrigins);
  }

  function totalQtyOf(baseKey) {
    var baseE = entryOf(baseKey);
    var baseQty = baseE.qty || 0;
    if (baseQty <= 0) return 0;
    var extraQty = lotsOf(baseKey).reduce(function (acc, l) { return acc + l.qty; }, 0);
    return baseQty + extraQty;
  }

  function condOf(key) {
    var e = entryOf(key);
    if (!e || e.qty <= 0) return '';
    return parseOriginsMeta(e.origins).cond;
  }

  function condLabel(code) {
    var hit = CARD_CONDITIONS.filter(function (x) { return x.code === code; })[0];
    return hit ? (hit.code + ' · ' + hit.label) : '';
  }

  function setCondSync(n, ver, code) {
    var c = findCard(n); if (!c || SHARE) return;
    var key = keyOf(st.set, c, ver);
    var e = entryOf(key);
    if (e.qty <= 0) return;

    var meta = parseOriginsMeta(e.origins);
    var nextCode = (!code || meta.cond === code) ? '' : code;
    var nextOrigins = buildOriginsMeta(meta.plain, nextCode, meta.lots);
    setEntry(n, ver, e.qty, nextOrigins);
  }

  function cardCondBadge(id, c, ver) {
    var sl = ver ? [{ ver: ver }] : slotsOf(id, c);
    var codes = [];

    for (var i = 0; i < sl.length; i++) {
      var k = keyOf(id, c, sl[i].ver);

      var cd = condOf(k);
      if (cd && codes.indexOf(cd) < 0) {
        codes.push(cd);
      }

      var lots = lotsOf(k);
      for (var j = 0; j < lots.length; j++) {
        var lcd = lots[j].cond;
        if (lcd && codes.indexOf(lcd) < 0) {
          codes.push(lcd);
        }
      }
    }

    if (!codes.length) return '';

    var rank = { M: 0, NM: 1, SP: 2, MP: 3, HP: 4, D: 5 };
    codes.sort(function (a, b) {
      return (rank[a] != null ? rank[a] : 99) - (rank[b] != null ? rank[b] : 99);
    });

    return '<div class="fn-conds">' + codes.map(function (code) {
      return '<span class="fn-cond c-' + esc(code) + '" title="' + esc(condLabel(code)) + '">' + esc(code) + '</span>';
    }).join('') + '</div>';
  }

  function condCountsHtml(scope) {
    var counts = {};
    CARD_CONDITIONS.forEach(function (q) { counts[q.code] = 0; });

    function addQty(code, qty) {
      var qNum = Number(qty) || 0;
      if (!code || qNum <= 0 || counts[code] == null) return;
      counts[code] += qNum;
    }

    function tallyByKey(key) {
      var e = entryOf(key);
      if (e && e.qty > 0) {
        addQty(condOf(key), e.qty);
        var lots = lotsOf(key);
        for (var i = 0; i < lots.length; i++) {
          addQty(lots[i].cond, lots[i].qty);
        }
      }
    }

    if (scope && scope.kind === 'dex') {
      var bid = scope.bid || 'shared';
      (scope.species || []).forEach(function (sp) {
        var c = scope.byDex && scope.byDex[sp.dex];
        if (!c) return;
        slotsOf(scope.id, c).forEach(function (s) {
          var sid = c._set || sidOf(scope.id, c);
          var k = resolveDexKey(bid, sid, c.n, s.ver);
          if (k) tallyByKey(k);
        });
      });
    } else if (scope && scope.kind === 'pk') {
      (scope.pages || []).forEach(function (pg) {
        (pg || []).forEach(function (sl) {
          if (!sl || !sl.c || !sl.r) return;
          tallyByKey(keyOf('', sl.c, sl.r.ver));
        });
      });
    } else {
      var id = (scope && scope.id) || st.set;
      var cards = (scope && scope.cards) || cur.cards || [];
      cards.forEach(function (c) {
        slotsOf(id, c).forEach(function (s) {
          tallyByKey(keyOf(id, c, s.ver));
        });
      });
    }

    var parts = [];
    CARD_CONDITIONS.forEach(function (q) {
      var n = counts[q.code] || 0;
      if (n > 0) {
        parts.push('<span><b class="fn-cond c-' + esc(q.code) + '" style="padding:1px 5px;border-radius:4px">' + esc(q.code) + '</b> ' + n + '</span>');
      }
    });

    return parts.join('');
  }

  // ── estado ─────────────────────────────────────────────────
  var defCols = innerWidth < 480 ? 3 : innerWidth < 800 ? 4 : innerWidth < 1200 ? 6 : 7;
  var st = {
    set: (location.hash || '').replace('#', '') || 'home',
    q: '', status: 'all', sort: 'num',
    view: LS.get('view', 'grid'),
    cols: LS.get('cols', defCols),
    lang: LS.get('lang', 'pt'),
    progMode: LS.get('progMode', 'slots'),
    pocket: (function () { var p = String(LS.get('pocket', '9')); return p === '20a' ? '20b' : p; })(),
    focus: false,
    tableFocus: LS.get('tableFocus', false),
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

  function tagDuplicateCards(cards, defaultSet) {
    var seen = {};
    return (cards || []).map(function (c) {
      var sid = c._set || c._setId || defaultSet || '';
      var baseKey = c._k ? String(c._k) : (sid + ':' + String(c.n));
      var count = (seen[baseKey] || 0) + 1;
      seen[baseKey] = count;
      if (count === 1 && !c._k) {
        return Object.assign({}, c, { _dupIdx: 0 });
      }
      var k = c._k ? (String(c._k) + (count > 1 ? '#' + count : '')) : (sid + ':' + String(c.n) + (count > 1 ? '#d' + count : ''));
      return Object.assign({}, c, {
        _set: sid || c._set,
        _k: k,
        _dupIdx: count - 1
      });
    });
  }

  // ── ponte com o motor ──────────────────────────────────────
  function engineReady() { return typeof getSetData === 'function' && typeof getSlots === 'function' && typeof SET_CATALOG !== 'undefined'; }
  function loggedIn() { try { return !!uid(); } catch (e) { return false; } }
  var SHARE = null;

  function has(key) {
    if (DEMO) return demoSet.has(key);
    if (SHARE) return SHARE.keys.has(key);
    return typeof collected !== 'undefined' && collected.has(key);
  }
  function ck(c) { return c._k || c.n; }
  function sidOf(id, c) { return (c && (c._set || c._setId)) || id; }
  function findCard(k) {
    var exact = cur.cards.filter(function (x) { return String(ck(x)) === String(k); })[0];
    if (exact) return exact;
    return cur.cards.filter(function (x) { return String(x.n) === String(k); })[0];
  }
  function langSfx(sid) {
    if (sid === 'cel30jp' || sid === 'cel30cn') return '';
    var l = effLang(sid); return l === 'pt' ? '' : '-' + l;
  }
  function dexSlotKey(dexId, sid, n, ver) {
    var base = slotKey(sid + ':', n, ver);
    return 'dex-' + String(dexId || 'shared') + ':' + base;
  }
  function resolveDexKey(dexId, sid, n, ver) {
    var base = slotKey(sid + ':', n, ver);
    if (dexId && has('dex-' + String(dexId) + ':' + base)) return 'dex-' + String(dexId) + ':' + base;
    if (has('dex-shared:' + base)) return 'dex-shared:' + base;
    if (SHARE && SHARE.dexAnyKeys) {
      var hit = SHARE.dexAnyKeys.get(base);
      if (hit) return hit;
    }
    return null;
  }
  function hasDexSlot(dexId, sid, n, ver) {
    return !!resolveDexKey(dexId, sid, n, ver);
  }
  function keyOf(id, c, ver) {
    var sid = sidOf(id, c);
    if (isDex(id)) {
      var bid = (cur.binder && cur.binder.id) || String(id).replace(/^dex:/, '') || 'shared';
      var resolved = resolveDexKey(bid, sid, String(c.n), ver);
      return resolved || dexSlotKey(bid, sid, String(c.n), ver);
    }
    // Fichários personalizados (cb:*) e de Pokémon (pk:*) usam a mesma chave da coleção principal
    if (isCb(id) || isPk(id)) {
      return slotKey(sid + ':', String(c.n), ver);
    }
    return slotKey(sid + (c._k ? '' : langSfx(sid)) + ':', String(c.n), ver);
  }
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
      if (id !== 'me04' && d && d.cards === CARDS) return null;
      if (d && Array.isArray(d.cards)) {
        return Object.assign({}, d, { cards: tagDuplicateCards(d.cards, id) });
      }
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
  function effLang(id) {
    var l = langsOf(id); if (!l) return 'pt';
    if (id === 'cel30jp') return 'jp'; if (id === 'cel30cn') return 'cn';
    return l.indexOf(st.lang) >= 0 ? st.lang : 'pt';
  }
  function lgOf(id, c) { return c && c._k ? 'pt' : effLang(sidOf(id, c)); }
  function i18n(c, id) { try { return cardI18n(c, lgOf(id, c)); } catch (e) { return { name: c.name, price: c.price, symbol: 'R$' }; } }
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
      if (typeof getBinderImg === 'function') { var u = getBinderImg(c, sid, lgOf(id, c)); if (u) return u; }
      if (d && d.imgFn) { var u2 = d.imgFn(c.n); if (u2) return u2; }
    } catch (e) { }
    return c.img || '';
  }
  function entryOf(key) {
    if (SHARE) {
      if (SHARE.entries && SHARE.entries.has(key)) {
        var se = SHARE.entries.get(key);
        return { qty: se.qty || 1, origins: (se.origins || []).slice() };
      }
      return { qty: SHARE.keys.has(key) ? 1 : 0, origins: [] };
    }
    if (DEMO) return demoSet.has(key) ? (demoQty.get(key) || { qty: 1, origins: [] }) : { qty: 0, origins: [] };
    if (typeof collectedQty !== 'undefined' && collectedQty.has(key)) { var e = collectedQty.get(key); return { qty: e.qty || 1, origins: (e.origins || []).slice() }; }
    return { qty: has(key) ? 1 : 0, origins: [] };
  }
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

  // ── confirmação de exclusão de fichário ───────────────────
  function openDeleteConfirm(opts) {
    var title = opts.title || 'Excluir fichário';
    var name = opts.name || 'Sem nome';
    var kind = opts.kind || 'Fichário';
    var note = opts.note || 'As suas marcações de cartas na coleção não são apagadas, apenas este fichário.';
    var confirmAct = opts.confirmAct;
    var bidAttr = opts.bid ? ' data-bid="' + esc(opts.bid) + '"' : '';
    var html = '<div class="fn-form">' +
      '<div class="fn-warn"><b>' + esc(kind) + ':</b> ' + esc(name) + '<br><small>' + esc(note) + '</small></div>' +
      '<p class="fn-note">Tem certeza de que deseja excluir este fichário? Essa ação não pode ser desfeita.</p>' +
      '<button type="button" class="fn-btn is-alt" data-act="' + esc(confirmAct) + '"' + bidAttr + '>' + I('trash', 14) + ' Confirmar exclusão</button>' +
      '<button type="button" class="fn-btn" data-close>Cancelar</button>' +
      '</div>';
    openSheet(html, title);
  }

  // ── dados da tela atual ────────────────────────────────────
  var cur = { d: null, cards: [], view: [] };
  var REGION_META = { 1: ['🔴', '#E53935'], 2: ['🟡', '#FDD835'], 3: ['🟢', '#43A047'], 4: ['💎', '#5C6BC0'], 5: ['⚫', '#424242'], 6: ['🌸', '#EC407A'], 7: ['🌺', '#FF7043'], 8: ['⚔️', '#7E57C2'], 9: ['🍇', '#8E24AA'] };
  function isDex(id) { return /^dex:/.test(String(id)); }
  function isRegionalDexBinder(b) { return !!(b && b.filter_config && (b.filter_config.dexFrom != null || b.filter_config.dexTo != null)); }
  function binderCardCount(b) { return (b && Array.isArray(b.card_ids)) ? b.card_ids.length : 0; }
  var demoBinders = null, dexIdx = null, picker = null, dexLimit = 300;
  function normTxt(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function setLabelOf(sid) { var s = SET_CATALOG.filter(function (x) { return x.id === sid; })[0]; return s ? (s.label || sid) : sid; }
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
    if (SHARE) return SHARE.dex ? [SHARE.binder] : [];
    if (DEMO) {
      if (!demoBinders) {
        var by = dexIndex(), refs = [];
        for (var d = 1; d <= 120; d++) { if (d % 3 === 0 || !by[d]) continue; refs.push({ set: by[d][0].set, n: by[d][0].c.n, dex: d }); }
        if (!refs.length) return [];
        demoBinders = [{ id: 'demo', name: '🌐 Pokédex (demonstração)', emoji: '🌐', cover_color: '#118ab2', filter_config: { type: 'masterdex', dexFrom: 1, dexTo: 151 }, card_ids: refs }];
      }
      return demoBinders;
    }
    try {
      var list = (customBinders || []).filter(function (b) { return b && b.filter_config && b.filter_config.type === 'masterdex'; });
      list.sort(function (a, b) {
        var aNat = !isRegionalDexBinder(a), bNat = !isRegionalDexBinder(b);
        if (aNat && bNat) return binderCardCount(b) - binderCardCount(a);
        return 0;
      });
      return list;
    } catch (e) { return []; }
  }
  function dexBinder(id) { return dexBinders().filter(function (b) { return 'dex:' + b.id === String(id); })[0] || null; }
  function dexRange(b) { var f = b.filter_config || {}; return { from: f.dexFrom || 1, to: f.dexTo || (typeof POKEDEX_NACIONAL !== 'undefined' ? POKEDEX_NACIONAL.length : 1025) }; }
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
  function dexOwned(c) {
    if (!c) return false;
    var bid = (cur.binder && cur.binder.id) || String(st.set).replace(/^dex:/, '') || 'shared';
    var sid = c._set || sidOf(st.set, c);
    return slotsOf('', c).some(function (s) {
      return hasDexSlot(bid, sid, c.n, s.ver) || has(keyOf(st.set, c, s.ver));
    });
  }
  function dexCalc(b) {
    var r = dexResolve(b), rg = dexRange(b), totSp = rg.to - rg.from + 1, ownSp = 0, filled = 0, gotSlots = 0, totSlots = 0;
    r.cards.forEach(function (c) {
      filled++;
      var sl = slotsOf('', c), any = false;
      sl.forEach(function (s) {
        totSlots++;
        if (hasDexSlot(b.id, c._set, c.n, s.ver)) { gotSlots++; any = true; }
      });
      if (any) ownSp++;
    });
    var pct = 0;
    if (totSp > 0) {
      var spFrac = ownSp / totSp;
      var slotFrac = filled > 0 ? (ownSp / filled) * (filled / totSp) : 0;
      pct = Math.round(Math.max(spFrac * 100, slotFrac * 100));
      if (ownSp > 0 && pct === 0) pct = 1;
    }
    return { got: ownSp, tot: totSp, filled: filled, gotSlots: gotSlots, totSlots: totSlots, pct: pct, pending: r.pending };
  }
  function dexProg(b) {
    var key = 'dex:' + b.id; if (progCache[key] !== undefined) return progCache[key];
    var c = dexCalc(b);
    var out = { got: c.got, tot: c.tot, filled: c.filled, gotSlots: c.gotSlots, totSlots: c.totSlots, pct: c.pct };
    if (c.pending) return out;
    return (progCache[key] = out);
  }
  function dexArt(d) { return d <= 151 ? 'assets/wild/' + d + '.webp' : 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/' + d + '.png'; }
  window.__fnArtFb = function (img, d) {
    var s = img.dataset.fb || '0';
    if (s === '0') { img.dataset.fb = '1'; img.src = 'https://raw.githubusercontent.com/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/' + d + '.png'; }
    else if (s === '1') { img.dataset.fb = '2'; img.src = 'https://raw.githubusercontent.com/PokeAPI/sprites@master/sprites/pokemon/' + d + '.png'; }
    else img.style.display = 'none';
  };
  function artImg(d) { return '<img loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" src="' + esc(dexArt(d)) + '"' + (d > 151 ? ' onerror="__fnArtFb(this,' + d + ')"' : '') + '>'; }
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
    if (st.view === 'table') return renderTable(vis);
    var shown = vis.slice(0, dexLimit);
    return '<div class="fn-grid">' + shown.map(dexTile).join('') + '</div>' +
      (vis.length > shown.length ? '<div class="fn-more"><button type="button" class="fn-btn" data-act="dexmore">Mostrar mais (' + (vis.length - shown.length) + ' espécies)</button></div>' : '');
  }
  function renderDexHero() {
    var b = cur.binder, t = cur.species.length, own = 0, empty = 0, gotSlots = 0, totSlots = 0;
    var bid = (b && b.id) || String(st.set).replace(/^dex:/, '') || 'shared';
    cur.species.forEach(function (sp) {
      var c = cur.byDex[sp.dex]; if (!c) { empty++; return; }
      var sl = slotsOf(st.set, c), any = false;
      sl.forEach(function (s) {
        totSlots++;
        if (hasDexSlot(bid, c._set || sidOf(st.set, c), c.n, s.ver) || has(keyOf(st.set, c, s.ver))) {
          gotSlots++;
          any = true;
        }
      });
      if (any) own++;
    });
    var chosen = t - empty;
    var pct = t ? Math.round(Math.max((own / t) * 100, chosen > 0 ? (own / chosen) * (chosen / t) * 100 : 0)) : 0;
    if (own > 0 && pct === 0) pct = 1;
    var name = b ? b.name.replace(/^[^\wÀ-ú(]+/, '') : 'Pokédex';
    var delLbl = b && isRegionalDexBinder(b) ? I('trash') + ' Excluir região' : I('trash') + ' Excluir Pokédex';
    $('#fn-hero').innerHTML = '<div class="fn-hero-top"><div><h1>' + esc(name) + '</h1><p class="fn-hero-sub">Pokédex · ' + t + ' espécies · progresso isolado desta Pokédex</p></div><div class="fn-pct">' + pct + '<small>%</small></div></div>' +
      '<div class="fn-progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>' +
      '<div class="fn-stats">' + (b ? '<span><b>' + own + '</b>/' + t + ' espécies</span><span>Com carta escolhida <b>' + chosen + '</b></span>' + (empty ? '<span>Vagas sem carta <b>' + empty + '</b></span>' : '') : '<span>' + (loggedIn() || DEMO ? 'Carregando a sua Pokédex…' : 'Entre no MyDeck para carregar a sua Pokédex.') + '</span>') + condCountsHtml({ kind: 'dex', id: st.set, bid: bid, species: cur.species, byDex: cur.byDex }) + '</div>' +
      (b && !SHARE ? '<div class="fn-hero-links"><a href="#" data-act="dexaskdelete" data-bid="' + esc(b.id) + '">' + delLbl + '</a></div>' : '');
    $('#fn-setbtn-emoji').innerHTML = b ? bIco(b, 22, 'masterdex') : MD_ICO('pokedex', { size: 22 }); $('#fn-setbtn-code').textContent = 'Pokédex'; $('#fn-setbtn-name').textContent = name;
  }

  function dexTreeHtml() {
    var bs = dexBinders();
    var isOpen = openBlocks().indexOf('__dex') >= 0 || isDex(st.set);
    var isNat = function (b) { return !isRegionalDexBinder(b); };
    var natBinders = bs.filter(isNat);
    var genRanges = typeof POKEDEX_GEN_RANGES !== 'undefined' ? POKEDEX_GEN_RANGES : [];

    var rows = [];

    if (natBinders.length) {
      natBinders.forEach(function (nb, idx) {
        var pNat = dexProg(nb);
        var nmNat = nb.name.replace(/^[^\wÀ-ú(]+/, '') || 'Master Set Nacional (#1–1025)';
        var subNat = 'Nacional · 1025 espécies' + (natBinders.length > 1 ? ' · ' + binderCardCount(nb) + ' cartas' : '');
        rows.push('<button type="button" class="fn-set' + ('dex:' + nb.id === st.set ? ' is-cur' : '') +
          '" data-pick="dex:' + esc(nb.id) + '" data-find="' + esc(normTxt(nmNat + ' nacional 1025 pokedex master set ' + (idx + 1))) + '">' +
          '<span class="em">' + bIco(nb, 18, 'masterdex') + '</span>' +
          '<span class="tx"><b>' + esc(nmNat) + '</b><small>' + esc(subNat) + '</small>' +
          '<div class="mini"><i style="width:' + pNat.pct + '%"></i></div></span>' +
          '<span class="pc' + (pNat.pct ? '' : ' z') + '">' + pNat.pct + '%</span></button>');
      });
    } else {
      rows.push('<button type="button" class="fn-set" data-act="dexcreate" data-kind="nat" data-find="master set nacional 1025 pokedex">' +
        '<span class="em">' + MD_ICO('pokedex', { size: 18 }) + '</span><span class="tx"><b>Master Set Nacional (#1–1025)</b><small>Nacional · 1025 espécies</small></span><span class="pc z">0%</span></button>');
    }

    bs.filter(function (b) { return !isNat(b); }).forEach(function (b) {
      var rg = dexRange(b);
      var g = genRanges.filter(function (x) { return x.from === rg.from && x.to === rg.to; })[0];
      var m = (g && REGION_META[g.gen]) || ['🗺️'];
      var p = dexProg(b);
      var nm = b.name.replace(/^[^\wÀ-ú(]+/, '') || (g ? 'Master Set ' + g.label : 'Pokédex regional');
      var sub = g ? (g.label + ' · ' + (g.to - g.from + 1) + ' espécies') : ('#' + rg.from + '–#' + rg.to);
      rows.push('<button type="button" class="fn-set' + ('dex:' + b.id === st.set ? ' is-cur' : '') +
        '" data-pick="dex:' + esc(b.id) + '" data-find="' + esc(normTxt(nm + ' ' + sub + ' pokedex master set')) + '">' +
        '<span class="em">' + bIco(b, 18, 'masterdex') + '</span>' +
        '<span class="tx"><b>' + esc(nm) + '</b><small>' + esc(sub) + '</small>' +
        '<div class="mini"><i style="width:' + p.pct + '%"></i></div></span>' +
        '<span class="pc' + (p.pct ? '' : ' z') + '">' + p.pct + '%</span></button>');
    });

    rows.push('<button type="button" class="fn-set" data-act="dexnew" data-find="nova pokedex regiao criar kanto johto hoenn sinnoh unova kalos alola galar paldea">' +
      '<span class="em">' + MD_ICO('plus', { size: 18 }) + '</span><span class="tx"><b>Nova Pokédex regional</b><small>Criar por região</small></span></button>');

    var countShown = natBinders.length + bs.filter(function (b) { return !isNat(b); }).length;

    return '<section class="fn-blk' + (isOpen ? ' is-open' : '') + '" data-blk-id="__dex">' +
      '<button type="button" class="fn-blk-h" data-blk="__dex" aria-expanded="' + isOpen + '">' +
      '<span class="ch">▸</span><span class="t">Pokédex</span>' +
      '<span class="n">' + countShown + '</span>' +
      '</button><div class="fn-blk-b">' + rows.join('') + '</div></section>';
  }

  function openDexNew() {
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para criar a sua Pokédex.'); return; }
    var have = dexBinders(), isNat = function (b) { return !isRegionalDexBinder(b); };
    var natList = have.filter(isNat);
    var opts = [{ k: 'nat', t: 'Master Set Nacional', s: '1025 vagas (#1–#1025)', done: natList.length > 0, existing: natList[0] || null }];
    (typeof POKEDEX_GEN_RANGES !== 'undefined' ? POKEDEX_GEN_RANGES : []).forEach(function (g) {
      var ex = have.filter(function (b) { return b.filter_config.dexFrom === g.from && b.filter_config.dexTo === g.to; })[0] || null;
      opts.push({ k: String(g.gen), t: g.label, s: (g.to - g.from + 1) + ' vagas (#' + g.from + '–#' + g.to + ')', done: !!ex, existing: ex });
    });
    openSheet('<p class="fn-note">Cada vaga começa com a arte do Pokémon. Você escolhe a carta que quer em cada uma.</p><div class="fn-acts">' + opts.map(function (o) {
      var delBtn = o.existing
        ? '<button type="button" class="fn-ver" data-act="dexaskdelete" data-bid="' + esc(o.existing.id) + '" title="Excluir esta Pokédex">' + I('trash', 14) + ' Excluir</button>'
        : '';
      return '<div class="fn-dp-item' + (o.done ? ' is-on' : '') + '">' +
        '<button type="button" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;flex:1" data-act="dexcreate" data-kind="' + o.k + '"' + (o.done ? ' disabled' : '') + '>' +
        '<span class="em" style="width:30px;text-align:center">' + MD_ICO('pokedex', { size: 20 }) + '</span>' +
        '<span class="tx"><b>' + esc(o.t) + '</b><small>' + (o.done ? 'Você já tem esta Pokédex' : esc(o.s)) + '</small></span>' +
        '</button>' + delBtn + '</div>';
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
  async function dexRemoveRecord(b) {
    if (DEMO) {
      demoBinders = (demoBinders || []).filter(function (x) { return String(x.id) !== String(b.id); });
      return true;
    }
    if (typeof sbClient !== 'undefined' && sbClient && loggedIn()) {
      var r = await sbClient.from('custom_binders').delete().eq('id', b.id).eq('user_id', uid());
      if (r.error) return false;
    }
    if (typeof customBinders !== 'undefined' && Array.isArray(customBinders)) {
      var i = customBinders.findIndex(function (x) { return String(x.id) === String(b.id); });
      if (i >= 0) customBinders.splice(i, 1);
    }
    try {
      if (typeof pinnedBinders !== 'undefined' && Array.isArray(pinnedBinders)) {
        var pi = pinnedBinders.indexOf(String(b.id));
        if (pi >= 0) { pinnedBinders.splice(pi, 1); if (typeof savePinnedBinders === 'function') savePinnedBinders(); }
      }
    } catch (e) { }
    return true;
  }
  function askDexDelete(bid) {
    var b = dexBinders().filter(function (x) { return String(x.id) === String(bid); })[0];
    if (!b || dexBusy) return;
    var isReg = isRegionalDexBinder(b);
    var nm = b.name.replace(/^[^\wÀ-ú(]+/, '') || (isReg ? 'Pokédex regional' : 'Master Set Nacional');
    openDeleteConfirm({
      title: isReg ? 'Excluir Pokédex regional' : 'Excluir Master Set Nacional',
      name: nm,
      kind: isReg ? 'Pokédex regional' : 'Pokédex nacional',
      note: 'As suas coleções normais e as cartas escolhidas nas vagas não serão apagadas.',
      confirmAct: 'dexdelete',
      bid: b.id
    });
  }
  async function dexDelete(bid) {
    var b = dexBinders().filter(function (x) { return String(x.id) === String(bid); })[0];
    if (!b || dexBusy) return;
    var isReg = isRegionalDexBinder(b);
    var nm = b.name.replace(/^[^\wÀ-ú(]+/, '') || (isReg ? 'Pokédex regional' : 'Master Set Nacional');
    dexBusy = true;
    try {
      var ok = await dexRemoveRecord(b);
      if (!ok) { toast('Não foi possível excluir. Tente de novo.'); return; }
      closeSheet();
      dropMultiProg();
      toast('“' + nm + '” excluída.');
      if (String(st.set) === 'dex:' + String(b.id)) {
        pickSet('home');
      } else {
        loadCur(); renderHero(); renderBody(); renderSide();
      }
    } finally { dexBusy = false; }
  }
  var natCleanBusy = false;
  async function cleanupAndEnsureNatDex() {
    if (DEMO || SHARE || !loggedIn() || natCleanBusy) return;
    if (typeof customBinders === 'undefined' || !Array.isArray(customBinders)) return;
    natCleanBusy = true;
    try {
      var nats = customBinders.filter(function (b) { return b && b.filter_config && b.filter_config.type === 'masterdex' && !isRegionalDexBinder(b); });
      var withCards = nats.filter(function (b) { return binderCardCount(b) > 0; });
      if (withCards.length > 0 && nats.length > withCards.length) {
        var extras = nats.filter(function (b) { return binderCardCount(b) === 0; });
        var removedAny = false;
        for (var i = 0; i < extras.length; i++) {
          var ok = await dexRemoveRecord(extras[i]);
          if (ok) removedAny = true;
        }
        if (removedAny) {
          dropMultiProg();
          if (String(st.set) === 'dex:' + String(extras[0].id)) st.set = 'dex:' + String(withCards[0].id);
          loadCur(); renderHero(); renderBody(); renderSide();
        }
      }
    } finally { natCleanBusy = false; }
  }

  function dexCands(d) {
    var list = (dexIndex()[d] || []).slice();
    var bid = (cur.binder && cur.binder.id) || String(st.set).replace(/^dex:/, '') || 'shared';
    var rank = function (x) { var c = Object.assign({}, x.c, { _set: x.set, _k: x.set + '~' + x.c.n }), own = slotsOf('', c).some(function (s) { return hasDexSlot(bid, x.set, x.c.n, s.ver); }); return own ? 0 : 1; };
    list.sort(function (a, b) { var ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb; var pa = a.c.price || 1e9, pb = b.c.price || 1e9; return ra === 0 ? (b.c.price || 0) - (a.c.price || 0) : pa - pb; });
    return list;
  }
  function openDexPicker(d) {
    if (!cur.binder) return;
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para escolher cartas.'); return; }
    if (cur.pending > 0) { toast('Ainda carregando todas as coleções. Tente de novo em instantes.'); return; }
    var sp = cur.species.filter(function (x) { return x.dex === d; })[0] || { dex: d, name: '#' + d };
    picker = { dex: d, list: dexCands(d), name: sp.name, sort: 'price-asc', own: false };
    openSheet('<p class="fn-dp-sub" id="fn-dp-count"></p>' +
      '<div class="fn-dp-bar"><input id="fn-dp-q" type="search" placeholder="Buscar: sv3 125, obf 125, ex…" autocomplete="off" enterkeyhint="search" aria-label="Buscar nesta espécie">' +
      '<select id="fn-dp-sort" aria-label="Ordenar"><option value="price-asc">Menor preço</option><option value="price-desc">Maior preço</option><option value="set">Coleção</option><option value="num">Número</option></select>' +
      '<label class="fn-dp-own"><input type="checkbox" id="fn-dp-own">Só as que tenho</label></div>' +
      '<div class="fn-dp" id="fn-dp"></div><div class="fn-dp-foot" id="fn-dp-foot"></div>', '#' + d + ' ' + sp.name, function (ov) { var sh = ov.querySelector('.fn-sheet'); if (sh) sh.classList.add('fn-sheet-wide'); });
    renderDexPicker('');
  }
  function renderDexPicker(q) {
    var box = $('#fn-dp'); if (!box || !picker) return;
    var bid = (cur.binder && cur.binder.id) || String(st.set).replace(/^dex:/, '') || 'shared';
    var words = normTxt(q).split(/\s+/).filter(Boolean), cur0 = cur.byDex[picker.dex];
    var order = {}; SET_CATALOG.forEach(function (x, i) { order[x.id] = i; });
    var rows = picker.list.map(function (x) {
      var c = Object.assign({}, x.c, { _set: x.set, _k: x.set + '~' + x.c.n });
      return { x: x, c: c, own: slotsOf('', c).some(function (s) { return hasDexSlot(bid, x.set, x.c.n, s.ver); }), hay: normTxt(x.c.name + ' ' + x.c.n + ' ' + x.set + ' ' + setLabelOf(x.set) + ' ' + (x.c.rare || '')) };
    });
    var items = rows.filter(function (r) { return (!picker.own || r.own) && words.every(function (w) { return r.hay.indexOf(w) >= 0; }); });
    var pr = function (r) { var v = Number(r.x.c.price); return isFinite(v) && v > 0 ? v : null; };
    var num = function (r) { var v = parseInt(r.x.c.n, 10); return isFinite(v) ? v : 1e9; };
    var ord = function (r) { return order[r.x.set] == null ? 9999 : order[r.x.set]; };
    items.sort(function (a, b) {
      if (picker.sort === 'price-desc') return (pr(b) == null ? -1 : pr(b)) - (pr(a) == null ? -1 : pr(a));
      if (picker.sort === 'set') return ord(a) - ord(b) || num(a) - num(b);
      if (picker.sort === 'num') return num(a) - num(b) || ord(a) - ord(b);
      return (pr(a) == null ? 1e12 : pr(a)) - (pr(b) == null ? 1e12 : pr(b)) || ord(a) - ord(b);
    });
    var cnt = $('#fn-dp-count');
    if (cnt) cnt.textContent = (items.length === picker.list.length ? picker.list.length + ' carta(s) desta espécie em todas as coleções do site.' : items.length + ' de ' + picker.list.length + ' carta(s) com esse filtro.') + ' Toque na carta para escolher qual ocupa a vaga.';
    var html = '';
    if (!items.length) html += '<div class="fn-empty">' + (picker.list.length ? 'Nenhuma carta com essa busca. Tente só o código da coleção (ex: <b>sv3</b>) ou só o número.' : 'Ainda não há carta cadastrada dessa espécie.') + '</div>';
    html += items.slice(0, 120).map(function (r) {
      var x = r.x, c = r.c, on = cur0 && cur0._set === x.set && String(cur0.n) === String(x.c.n);
      var im = ''; try { var raw = imgRaw(null, '', c); im = typeof imgMedium === 'function' ? imgMedium(raw) : raw; } catch (e) { im = imgSrc(null, '', c); }
      return '<button type="button" class="fn-dp-item' + (on ? ' is-on' : '') + '" data-act="dexchoose" data-dex="' + picker.dex + '" data-dset="' + esc(x.set) + '" data-dn="' + esc(x.c.n) + '" title="' + esc(i18n(c, '').name) + ' — ' + esc(x.set.toUpperCase()) + ' #' + esc(x.c.n) + '">' +
        '<span class="im"><img loading="lazy" decoding="async" alt="' + esc(i18n(c, '').name) + '" src="' + esc(im) + '">' + (on || r.own ? '<span class="bdg">' + (on ? '<em class="cur">atual</em>' : '') + (r.own ? '<em class="own">tenho</em>' : '') + '</span>' : '') + '</span>' +
        '<span class="tx"><b>' + esc(i18n(c, '').name) + '</b><small>' + esc(setLabelOf(x.set).split('—')[0].trim()) + ' · #' + esc(x.c.n) + '</small><small>' + esc(rareLabel(x.c.rare)) + '</small></span><span class="pr">' + esc(priceFmt(c, '')) + '</span></button>';
    }).join('');
    if (items.length > 120) html += '<div class="fn-empty">Mostrando 120 de ' + items.length + '. Refine a busca.</div>';
    box.innerHTML = html;
    var foot = $('#fn-dp-foot');
    if (foot) foot.innerHTML = cur0 ? '<button type="button" class="fn-dp-clear" data-act="dexclear" data-dex="' + picker.dex + '">' + I('trash', 14) + ' deixar esta vaga vazia (volta para a imagem padrão)</button>' : '';
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
  function dexListText() {
    var b = cur.binder, vis = dexVisible(), got = 0;
    var rows = vis.map(function (x) {
      var own = dexOwned(x.c); if (own) got++;
      return (own ? '✅' : '❌') + ' *' + x.sp.dex + '* ' + x.sp.name + (x.c ? ' — ' + i18n(x.c, st.set).name + ' _(' + setLabelOf(x.c._set).split('—')[0].trim() + ' #' + x.c.n + ')_' : '');
    });
    return '🎩✨ *' + (b ? b.name : 'Pokédex') + '* ✨🎩\n' + filterLabel() + '\n📅 ' + new Date().toLocaleDateString('pt-BR') + '\n━━━━━━━━━━━━━━━━━━\n' + rows.join('\n') + '\n━━━━━━━━━━━━━━━━━━\n📦 Espécies: *' + got + '/' + vis.length + '*';
  }
  function dexShareRefs() {
    var byDex = {};
    (cur.binder.card_ids || []).forEach(function (r) { byDex[Number(r.dex)] = r; });
    return cur.species.map(function (sp) { var r = byDex[sp.dex]; return r ? { set: r.set, n: r.n, dex: sp.dex } : { dex: sp.dex, name: sp.name, empty: true }; });
  }

  // ── Personalizados e Favoritos ──────────────────────────
  var demoCb = null, demoSeq = 0, cbBusy = false, cbAllIdx = null;
  function isCb(id) { return /^cb:/.test(String(id)); }
  function cbType(b) { return (b && b.filter_config && b.filter_config.type) || ''; }
  function cbIsFav(b) { return !!(b && b.filter_config && b.filter_config.favorites === true); }
  function plainName(s) { return String(s || '').replace(/^[^\wÀ-ú(]+/, '').trim(); }
  function demoCbInit() {
    var refs = [];
    try {
      Object.keys(SET_CARDS_MAP).slice(0, 12).forEach(function (s) {
        if (refs.length > 14) return; var cs = []; try { cs = SET_CARDS_MAP[s]() || []; } catch (e) { }
        if (cs.length < 12) return; for (var k = 0; k < 4; k++) if (cs[k * 3 + 1]) refs.push({ set: s, n: String(cs[k * 3 + 1].n) });
      });
    } catch (e) { }
    demoCb = [{ id: 'demofav', name: 'Favoritos', emoji: '⭐', cover_color: '#f5b301', filter_config: { type: 'manual', favorites: true }, card_ids: refs },
      { id: 'demotroca', name: 'Para trocar', emoji: '🔁', cover_color: '#118ab2', filter_config: { type: 'manual' }, card_ids: refs.slice(0, 4) },
      { id: 'demopreset', name: '👑 Coroa Dourada', emoji: '👑', cover_color: '#ffd166', filter_config: { type: 'preset', key: 'mega_attack' }, card_ids: [] }];
  }
  function cbBinders() {
    if (SHARE) return SHARE.dex ? [] : (SHARE.binder ? [SHARE.binder] : []);
    if (DEMO) { if (!demoCb) demoCbInit(); return demoCb; }
    try { return (customBinders || []).filter(function (b) { var t = cbType(b); return b && (t === 'manual' || t === 'preset' || t === 'artist'); }); } catch (e) { return []; }
  }
  function cbOnlyBinders() { return cbBinders().filter(function (b) { return cbType(b) !== 'artist'; }); }
  function artBinders() { return cbBinders().filter(function (b) { return cbType(b) === 'artist'; }); }
  function cbSorted() { return cbOnlyBinders().slice().sort(function (a, b) { return (cbIsFav(b) ? 1 : 0) - (cbIsFav(a) ? 1 : 0); }); }
  function cbById(id) { return cbBinders().filter(function (b) { return String(b.id) === String(id); })[0] || null; }
  function cbBinder(setId) { return cbById(String(setId).replace(/^cb:/, '')); }
  function favBinder() { return cbOnlyBinders().filter(cbIsFav)[0] || null; }
  function hasRef(b, sid, n) { return (b.card_ids || []).some(function (r) { return r.set === sid && String(r.n) === String(n); }); }
  async function cbSave(p) {
    if (DEMO) {
      var isP = p.filter_config && p.filter_config.type === 'pokemon', arr = isP ? (pkBinders(), demoPk) : demoCb;
      if (!p.id) { p = Object.assign({}, p, { id: 'demo' + (++demoSeq) }); arr.unshift(p); }
      else { var i = arr.findIndex(function (x) { return x.id === p.id; }); if (i >= 0) arr[i] = p; }
      return p;
    }
    if (typeof saveCustomBinder !== 'function') return null;
    return await saveCustomBinder(p);
  }
  function cbResolve(b) {
    var rawCards = [], miss = 0, cfg = b.filter_config || {};
    if (cfg.type === 'preset') {
      try { getBinderCards(b).forEach(function (c) { rawCards.push(Object.assign({}, c, { _set: c._setId, _k: c._setId + '~' + c.n })); }); } catch (e) { }
      return { cards: tagDuplicateCards(rawCards, ''), pending: 0 };
    }
    if (cfg.type === 'artist') {
      try { Object.keys(SET_CARDS_MAP).forEach(function (sid) { var cs = []; try { cs = SET_CARDS_MAP[sid]() || []; } catch (e) { return; } cs.forEach(function (c) { if (c.artist === cfg.artist) rawCards.push(Object.assign({}, c, { _set: sid, _setId: sid, _k: sid + '~' + c.n })); }); }); } catch (e) { }
      return { cards: tagDuplicateCards(rawCards, ''), pending: 0 };
    }
    var memo = {};
    (b.card_ids || []).forEach(function (r) {
      if (!(r.set in memo)) { var m = {}; try { (SET_CARDS_MAP[r.set]() || []).forEach(function (x) { m[String(x.n)] = x; }); } catch (e) { m = null; } memo[r.set] = m; }
      var card = memo[r.set] && memo[r.set][String(r.n)];
      if (!card) { miss++; return; }
      rawCards.push(Object.assign({}, card, { _set: r.set, _setId: r.set, _k: r.set + '~' + card.n }));
    });
    return { cards: tagDuplicateCards(rawCards, ''), pending: miss };
  }
  function cbSections(cards) {
    var order = SET_CATALOG.map(function (s) { return s.id; }), seen = {};
    cards.forEach(function (c) { seen[c._set] = 1; });
    return Object.keys(seen).sort(function (a, b) { var x = order.indexOf(a), y = order.indexOf(b); return (x < 0 ? 999 : x) - (y < 0 ? 999 : y); })
      .map(function (sid) { return { lbl: setLabelOf(sid), filter: function (c) { return c._set === sid; } }; });
  }
  function loadCb() {
    var b = cbBinder(st.set); CUR = 'R$';
    cur.binder = b; cur.pending = 0; cur.byDex = {}; cur.species = [];
    if (!b) { cur.d = null; cur.cards = []; return; }
    var r = cbResolve(b); cur.cards = r.cards; cur.pending = r.pending;
    cur.d = { label: b.name, cards: r.cards, sections: cbSections(r.cards), cb: true };
    if (DEMO && !demoSet.size && cur.cards.length) cur.cards.forEach(function (c) { slotsOf(st.set, c).forEach(function (s) { if (window.__fnSeed() < 0.4) demoSet.add(keyOf(st.set, c, s.ver)); }); });
  }
  function cbProg(b) {
    var key = 'cb:' + b.id + ':' + st.progMode; if (progCache[key] !== undefined) return progCache[key];
    var r = cbResolve(b), tot = 0, got = 0, cardsAny = 0;
    r.cards.forEach(function (c) {
      var any = false;
      slotsOf('', c).forEach(function (s) {
        tot++;
        if (has(keyOf('', c, s.ver))) { got++; any = true; }
      });
      if (any) cardsAny++;
    });
    var num = st.progMode === 'cards' ? cardsAny : got;
    var den = st.progMode === 'cards' ? r.cards.length : tot;
    var out = { got: got, tot: tot, cards: r.cards.length, cardsAny: cardsAny, pct: den ? Math.round(num / den * 100) : 0 };
    if (r.pending) return out;
    return (progCache[key] = out);
  }
  function dropMultiProg() { Object.keys(progCache).forEach(function (k) { if (/^(dex|cb|pk):/.test(k)) delete progCache[k]; }); }
  function cbKind(b) { return cbIsFav(b) ? 'Favoritas de todas as coleções' : cbType(b) === 'preset' ? 'Sugestão temática' : cbType(b) === 'artist' ? 'Fichário por artista' : 'Fichário personalizado'; }

  function cbTreeHtml() {
    var bs = cbSorted();
    var pks = pkBinders();
    var isCurCb = isCb(st.set) && cur.binder && cbType(cur.binder) !== 'artist';
    var isOpen = openBlocks().indexOf('__cb') >= 0 || isCurCb || isPk(st.set);
    var rows = bs.map(function (b) {
      var p = cbProg(b), nm = plainName(b.name) || 'Sem nome';
      return '<button type="button" class="fn-set' + ('cb:' + b.id === st.set ? ' is-cur' : '') + '" data-pick="cb:' + esc(b.id) + '" data-find="' + esc(normTxt(nm + ' personalizados meus fichários favoritos')) + '"><span class="em">' + bIco(b, 18) + '</span><span class="tx"><b>' + esc(nm) + '</b><small>' + p.cards + ' carta' + (p.cards === 1 ? '' : 's') + (cbIsFav(b) ? ' · favoritas' : cbType(b) === 'preset' ? ' · temático' : '') + '</small>' +
        '<div class="mini"><i style="width:' + p.pct + '%"></i></div></span><span class="pc' + (p.pct ? '' : ' z') + '">' + p.pct + '%</span></button>';
    }).join('');
    rows += pks.map(function (b) {
      var p = pkProg(b), nm = plainName(b.name) || 'Sem nome';
      return '<button type="button" class="fn-set' + ('pk:' + b.id === st.set ? ' is-cur' : '') + '" data-pick="pk:' + esc(b.id) + '" data-find="' + esc(normTxt(nm + ' pokemon fichario personalizados ' + ((b.filter_config || {}).name || ''))) + '"><span class="em">' + pkIco(b, 18) + '</span><span class="tx"><b>' + esc(nm) + '</b><small>' + p.filled + ' carta' + (p.filled === 1 ? '' : 's') + ' · Pokémon</small><div class="mini"><i style="width:' + p.pct + '%"></i></div></span><span class="pc' + (p.pct ? '' : ' z') + '">' + p.pct + '%</span></button>';
    }).join('');
    rows += '<button type="button" class="fn-set" data-act="cbnew" data-find="novo fichário criar personalizado"><span class="em">' + MD_ICO('plus', { size: 18 }) + '</span><span class="tx"><b>Novo fichário</b><small>Personalizado ou sugestão temática</small></span></button>';
    return '<section class="fn-blk' + (isOpen ? ' is-open' : '') + '" data-blk-id="__cb">' +
      '<button type="button" class="fn-blk-h" data-blk="__cb" aria-expanded="' + isOpen + '">' +
      '<span class="ch">▸</span><span class="t">Personalizados</span>' +
      '<span class="n">' + (bs.length + pks.length) + '</span>' +
      '</button><div class="fn-blk-b">' + rows + '</div></section>';
  }

  function artTreeHtml() {
    var bs = artBinders();
    var isCurArt = isCb(st.set) && cur.binder && cbType(cur.binder) === 'artist';
    var isOpen = openBlocks().indexOf('__art') >= 0 || isCurArt;
    var rows = bs.map(function (b) {
      var p = cbProg(b), nm = plainName(b.name) || (b.filter_config && b.filter_config.artist) || 'Artista';
      return '<button type="button" class="fn-set' + ('cb:' + b.id === st.set ? ' is-cur' : '') + '" data-pick="cb:' + esc(b.id) + '" data-find="' + esc(normTxt(nm + ' artista ilustrador')) + '"><span class="em">' + bIco(b, 18, 'artist') + '</span><span class="tx"><b>' + esc(nm) + '</b><small>' + p.cards + ' carta' + (p.cards === 1 ? '' : 's') + ' · ilustrador</small>' +
        '<div class="mini"><i style="width:' + p.pct + '%"></i></div></span><span class="pc' + (p.pct ? '' : ' z') + '">' + p.pct + '%</span></button>';
    }).join('');
    rows += '<button type="button" class="fn-set" data-act="artists" data-find="adicionar artista ilustrador meus artistas"><span class="em">' + MD_ICO('plus', { size: 18 }) + '</span><span class="tx"><b>Adicionar artista</b><small>Escolher ilustrador</small></span></button>';
    return '<section class="fn-blk' + (isOpen ? ' is-open' : '') + '" data-blk-id="__art">' +
      '<button type="button" class="fn-blk-h" data-blk="__art" aria-expanded="' + isOpen + '">' +
      '<span class="ch">▸</span><span class="t">Artistas</span>' +
      '<span class="n">' + bs.length + '</span>' +
      '</button><div class="fn-blk-b">' + rows + '</div></section>';
  }

  function renderCbHero() {
    var b = cur.binder;
    if (!b) {
      $('#fn-hero').innerHTML = '<div class="fn-hero-top"><div><h1>Personalizados</h1><p class="fn-hero-sub">' + (loggedIn() || DEMO ? 'Carregando os seus fichários…' : 'Entre no MyDeck para ver os seus fichários.') + '</p></div></div>';
      $('#fn-setbtn-emoji').innerHTML = MD_ICO('book', { size: 22 }); $('#fn-setbtn-code').textContent = 'Fichário'; $('#fn-setbtn-name').textContent = 'Personalizados'; return;
    }
    var t = totals(), isCardMode = st.progMode === 'cards';
    var pct = isCardMode ? (t.cards ? Math.round(t.cardsAny / t.cards * 100) : 0) : (t.slots ? Math.round(t.got / t.slots * 100) : 0);
    var nm = plainName(b.name) || 'Sem nome', nsets = (cur.d.sections || []).length, manual = cbType(b) === 'manual', isArtistBinder = cbType(b) === 'artist';
    $('#fn-hero').innerHTML = '<div class="fn-hero-top"><div><h1><span class="h-ico">' + bIco(b, 26) + '</span>' + esc(nm) + '</h1><p class="fn-hero-sub">' + esc(cbKind(b)) + ' · ' + t.cards + ' carta' + (t.cards === 1 ? '' : 's') + (nsets > 1 ? ' de ' + nsets + ' coleções' : '') + '</p></div>' +
      '<div class="fn-hero-right"><div class="fn-pct">' + pct + '<small>%</small></div>' +
      '<div class="fn-seg fn-seg-mini" role="group" aria-label="Base do progresso">' +
      '<button type="button" data-progmode="slots" class="' + (!isCardMode ? 'is-on' : '') + '">Slots</button>' +
      '<button type="button" data-progmode="cards" class="' + (isCardMode ? 'is-on' : '') + '">Cartas</button>' +
      '</div></div></div>' +
      '<div class="fn-progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>' +
      '<div class="fn-stats">' + (t.slots ? '<span' + (!isCardMode ? ' class="is-active-metric"' : '') + '><b>' + t.got + '</b>/' + t.slots + ' slots</span><span' + (isCardMode ? ' class="is-active-metric"' : '') + '><b>' + t.cardsAny + '</b>/' + t.cards + ' cartas</span>' + ((isCardMode ? t.cardsAny >= t.cards : t.got >= t.slots) ? '<span><b style="color:var(--teal)">Fichário completo</b></span>' : '<span><b>' + (isCardMode ? (t.cards - t.cardsAny) + '</b> cartas restantes' : (t.slots - t.got) + '</b> slots restantes') + '</span>')
        : '<span>' + (manual ? (cur.pending ? 'Carregando as cartas…' : 'Este fichário ainda não tem cartas. Use “Adicionar cartas” ou o botão “Guardar em fichário” de qualquer carta.') : 'Nenhuma carta nas suas coleções ativas para esta sugestão.') + '</span>') + condCountsHtml({ kind: 'set', id: st.set, cards: cur.cards }) + '</div>' +
      (!SHARE ? '<div class="fn-hero-links">' + (manual ? '<a href="#" data-act="cbadd">' + I('plus', 14) + ' Adicionar cartas</a>' : '') + (isArtistBinder ? '<a href="#" data-act="artists">' + I('palette', 14) + ' Outros artistas</a>' : '') + '<a href="#" data-act="cbedit">' + I('pencil', 14) + ' Editar fichário</a></div>' : '');
    $('#fn-setbtn-emoji').innerHTML = bIco(b, 22); $('#fn-setbtn-code').textContent = cbIsFav(b) ? 'Favoritos' : isArtistBinder ? 'Artista' : 'Personalizado'; $('#fn-setbtn-name').textContent = nm;
  }

  // ── Personalizados (tela inicial) ──
  function renderHomeHero() {
    $('#fn-hero').innerHTML = '';
    $('#fn-setbtn-emoji').innerHTML = MD_ICO('book', { size: 22 });
    $('#fn-setbtn-code').textContent = 'Fichário';
    $('#fn-setbtn-name').textContent = 'Meus fichários';
  }
  function homeTile(pick, em, title, sub, pct) {
    return '<button type="button" class="fn-hcard" data-pick="' + esc(pick) + '"><span class="em' + (isIcoHtml(em) ? ' has-ico' : '') + '">' + (isIcoHtml(em) ? em : esc(em)) + '</span><span class="tx"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span>' +
      '<span class="pc' + (pct ? '' : ' z') + '">' + pct + '%</span><div class="mini"><i style="width:' + pct + '%"></i></div></button>';
  }
  function renderHome() {
    var out = '';
    if (!SHARE && !loggedIn() && !DEMO) return '<div class="fn-empty">Entre no MyDeck para ver e montar os seus fichários. <a href="./">Entrar</a></div>';
    var tiles = '', fav = favBinder();
    cbSorted().forEach(function (b) {
      var p = cbProg(b), nm = plainName(b.name) || 'Sem nome';
      tiles += homeTile('cb:' + b.id, bIco(b, 24), nm, p.cards + ' carta' + (p.cards === 1 ? '' : 's') + ' · ' + cbKind(b), p.pct);
    });
    pkBinders().forEach(function (b) { var p = pkProg(b), nm = plainName(b.name) || 'Sem nome'; tiles += homeTile('pk:' + b.id, pkIco(b, 24), nm, p.filled + ' carta' + (p.filled === 1 ? '' : 's') + ' · Pokémon', p.pct); });
    dexBinders().forEach(function (b) { var p = dexProg(b), nm = b.name.replace(/^[^\wÀ-ú(]+/, ''); tiles += homeTile('dex:' + b.id, bIco(b, 24, 'masterdex'), nm, 'Pokédex · ' + p.got + '/' + p.tot, p.pct); });
    artBinders().forEach(function (b) { var p = cbProg(b), nm = plainName(b.name) || 'Artista'; tiles += homeTile('cb:' + b.id, bIco(b, 24, 'artist'), nm, p.cards + ' carta' + (p.cards === 1 ? '' : 's') + ' · Artista', p.pct); });
    if (!fav) tiles += '<div class="fn-hcard is-hint"><span class="em">' + I('star', 24) + '</span><span class="tx"><b>Favoritos</b><small>Abra uma carta e toque em “Favoritar”: o fichário Favoritos aparece aqui.</small></span></div>';
    out += '<h2 class="fn-home-h">Personalizados</h2><div class="fn-home-grid">' + tiles + '</div>';
    var sets = SET_CATALOG.map(function (x) { return { s: x, p: progOf(x.id) }; }).filter(function (o) { return o.p && o.p.pct > 0; }).sort(function (a, b) { return b.p.pct - a.p.pct; }).slice(0, 9);
    var started = sets.length > 0;
    if (!started) sets = SET_CATALOG.filter(function (x) { return !x.upcoming; }).slice(0, 6).map(function (x) { return { s: x, p: progOf(x.id) || { got: 0, tot: 0, pct: 0 } }; });
    if (sets.length) {
      out += '<h2 class="fn-home-h">' + (started ? 'Coleções em andamento' : 'Coleções') + '</h2><div class="fn-home-grid">' + sets.map(function (o) {
        var nm = (o.s.label || '').split('—').slice(1).join('—').trim() || o.s.label, code = (o.s.label || '').split('—')[0].trim();
        return homeTile(o.s.id, setIco(o.s.id, o.s.emoji), nm, o.p.tot ? code + ' · ' + o.p.got + '/' + o.p.tot + ' slots' : code, o.p.pct);
      }).join('') + '</div>';
    }
    return out;
  }

  // ── favoritos ──
  var favKeyCache = { ref: null, set: null };
  function favKeys() {
    var b = favBinder(); if (!b) return new Set();
    var ids = b.card_ids || [];
    if (favKeyCache.ref !== ids) favKeyCache = { ref: ids, set: new Set(ids.map(function (r) { return r.set + ':' + r.n; })) };
    return favKeyCache.set;
  }
  function isFav(c) { return favKeys().has(sidOf(st.set, c) + ':' + c.n); }
  function favPin(b) { try { var id = String(b.id); if (typeof pinnedBinders !== 'undefined' && pinnedBinders.indexOf(id) < 0) { pinnedBinders.push(id); savePinnedBinders(); } localStorage.setItem('fav_autopin', id); } catch (e) { } }
  async function favEnsure() {
    var b = favBinder(); if (b) return b;
    if (DEMO) return await cbSave({ name: 'Favoritos', emoji: '⭐', layout: 3, cover_color: '#f5b301', filter_config: { type: 'manual', favorites: true }, card_ids: [] });
    var r = await sbClient.from('custom_binders').select('*').eq('user_id', uid()).contains('filter_config', { favorites: true }).limit(1);
    if (r.data && r.data[0]) { customBinders.unshift(r.data[0]); favPin(r.data[0]); return r.data[0]; }
    var created = await cbSave({ name: 'Favoritos', emoji: '⭐', layout: 3, cover_color: '#f5b301', filter_config: { type: 'manual', favorites: true }, card_ids: [] });
    if (created) favPin(created);
    return created;
  }
  async function cbToggleRef(b, sid, n) {
    var was = hasRef(b, sid, n);
    var ids = (b.card_ids || []).filter(function (r) { return !(r.set === sid && String(r.n) === String(n)); });
    if (!was) ids.push({ set: sid, n: String(n) });
    var saved = await cbSave(Object.assign({}, b, { card_ids: ids }));
    return saved ? (was ? 'removed' : 'added') : null;
  }
  function refreshAfterCb() { progCache = {}; loadCur(); renderHero(); renderControls(); renderBody(); renderSide(); }
  async function toggleFav(n) {
    var c = findCard(n); if (!c || cbBusy) return;
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para favoritar suas cartas.'); return; }
    cbBusy = true;
    try {
      var b = await favEnsure(); if (!b) throw new Error('sem fichário');
      var res = await cbToggleRef(b, sidOf(st.set, c), c.n);
      if (!res) { toast('Não consegui salvar o favorito. Tente de novo.'); return; }
      toast(res === 'removed' ? 'Removida dos Favoritos.' : 'Adicionada aos Favoritos.');
      dropMultiProg();
      if (isCb(st.set) && cbIsFav(cur.binder) && res === 'removed') { closeSheet(); refreshAfterCb(); } else { patchOne(ck(c)); renderSide(); }
    } catch (e) { console.error('[favoritos]', e); toast('Não consegui salvar o favorito. Tente de novo.'); }
    finally { cbBusy = false; }
  }
  function openCbMember(n) {
    var c = findCard(n); if (!c) return;
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para guardar cartas em fichários.'); return; }
    var sid = sidOf(st.set, c), list = cbSorted().filter(function (b) { return cbType(b) === 'manual'; });
    var rows = list.map(function (b) {
      var on = hasRef(b, sid, c.n);
      return '<button type="button" class="fn-dp-item' + (on ? ' is-on' : '') + '" data-act="cbtoggle" data-bid="' + esc(b.id) + '" data-n="' + esc(ck(c)) + '"><span class="em" style="width:30px;text-align:center">' + bIco(b, 22) + '</span><span class="tx"><b>' + esc(plainName(b.name) || 'Sem nome') + (on ? ' ✓' : '') + '</b><small>' + (b.card_ids || []).length + ' carta' + ((b.card_ids || []).length === 1 ? '' : 's') + (on ? ' · toque para tirar' : ' · toque para guardar') + '</small></span></button>';
    }).join('');
    rows += '<button type="button" class="fn-dp-item is-clear" data-act="cbnew" data-withn="' + esc(ck(c)) + '"><span class="tx"><b>' + I('plus', 14) + ' Novo fichário com esta carta</b><small>cria e já guarda</small></span></button>';
    openSheet('<p class="fn-note">' + esc(i18n(c, st.set).name) + ' · #' + esc(c.n) + '</p><div class="fn-dp">' + rows + '</div>', 'Guardar em fichário');
  }
  async function cbToggleFromSheet(bid, n) {
    var b = cbById(bid), c = findCard(n); if (!b || !c || cbBusy) return; cbBusy = true;
    try {
      var res = await cbToggleRef(b, sidOf(st.set, c), c.n);
      if (!res) { toast('Não consegui salvar. Tente de novo.'); return; }
      dropMultiProg(); toast(res === 'removed' ? 'Tirada de “' + plainName(b.name) + '”.' : 'Guardada em “' + plainName(b.name) + '”.');
      if (isCb(st.set) && cur.binder && String(cur.binder.id) === String(b.id)) { closeSheet(); refreshAfterCb(); }
      else { renderSide(); patchOne(ck(c)); openCbMember(ck(c)); }
    } finally { cbBusy = false; }
  }

  // ── criar / editar / excluir ──
  function openCbNew(withN) {
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para criar fichários.'); return; }
    var have = cbOnlyBinders(), all = []; try { all = getAllCardsWithSet(); } catch (e) { }
    var presets = (typeof BINDER_PRESETS !== 'undefined' ? BINDER_PRESETS : []).map(function (p) {
      var done = have.some(function (b) { return cbType(b) === 'preset' && b.filter_config.key === p.key; }), n = 0; try { n = all.filter(p.filter).length; } catch (e) { }
      return '<button type="button" class="fn-act" data-act="cbpreset" data-key="' + esc(p.key) + '"' + (done ? ' disabled' : '') + '><span class="em">' + esc(p.emoji) + '</span><span><b>' + esc(p.name) + '</b><small>' + (done ? 'Você já tem este fichário' : esc(p.desc) + ' · ' + n + ' cartas') + '</small></span></button>';
    }).join('');
    openSheet((withN ? '' : '<div class="fn-acts"><button type="button" class="fn-act" data-act="pknew"><span class="em">' + I('pokeball', 20) + '</span><span><b>Fichário de um Pokémon</b><small>Cada carta na posição que você escolher, página a página</small></span></button></div><h3 class="fn-sub-h">Ou um fichário comum</h3>') + '<div class="fn-form"><label>Nome<input type="text" id="fn-cb-name" maxlength="40" placeholder="Ex.: Meus Pikachus" autocomplete="off"></label>' +
      '<div class="fn-row"><label>Cor<input type="color" id="fn-cb-color" value="#a855f7"></label></div>' +
      '<button type="button" class="fn-btn" data-act="cbcreate"' + (withN ? ' data-withn="' + esc(withN) + '"' : '') + '>Criar fichário vazio</button>' +
      '<p class="fn-note">Depois é só guardar as cartas nele: toque em uma carta e escolha “Guardar em fichário”, ou use “Adicionar cartas”.</p></div>' +
      (withN ? '' : '<h3 class="fn-sub-h">Ou comece por uma sugestão temática</h3><div class="fn-acts">' + presets + '</div>'), 'Novo fichário');
  }
  async function cbCreate(withN) {
    var name = (($('#fn-cb-name') || {}).value || '').trim(); if (!name) { toast('Dê um nome ao fichário.'); return; }
    var payload = { name: name, emoji: '📚', layout: 3, filter_config: { type: 'manual' }, card_ids: [], cover_color: ($('#fn-cb-color') || {}).value || '#a855f7' };
    if (withN) { var c = findCard(withN); if (c) payload.card_ids = [{ set: sidOf(st.set, c), n: String(c.n) }]; }
    if (cbBusy) return; cbBusy = true;
    try {
      var saved = await cbSave(payload); if (!saved) { toast('Não foi possível criar. Confira a conexão e tente de novo.'); return; }
      closeSheet(); dropMultiProg(); if (withN) { toast('Fichário criado com a carta.'); renderSide(); patchOne(withN); } else pickSet('cb:' + saved.id);
    } finally { cbBusy = false; }
  }
  async function cbPreset(key) {
    var p = (typeof BINDER_PRESETS !== 'undefined' ? BINDER_PRESETS : []).filter(function (x) { return x.key === key; })[0]; if (!p || cbBusy) return; cbBusy = true;
    try {
      var saved = await cbSave({ name: p.emoji + ' ' + p.name, emoji: p.emoji, layout: 3, filter_config: { type: 'preset', key: key }, card_ids: [], cover_color: p.color });
      if (!saved) { toast('Não foi possível criar. Confira a conexão e tente de novo.'); return; }
      closeSheet(); dropMultiProg(); pickSet('cb:' + saved.id);
    } finally { cbBusy = false; }
  }
  function openCbEdit() {
    var b = cur.binder; if (!b || !(isCb(st.set) || isPk(st.set))) return;
    openSheet('<div class="fn-form"><label>Nome<input type="text" id="fn-cb-name" maxlength="40" value="' + esc(plainName(b.name)) + '" autocomplete="off"></label>' +
      '<div class="fn-row"><label>Cor<input type="color" id="fn-cb-color" value="' + esc(/^#[0-9a-f]{6}$/i.test(b.cover_color || '') ? b.cover_color : '#a855f7') + '"></label></div>' +
      (cbIsFav(b) ? '<p class="fn-note">⭐ Favoritos junta as favoritas de todas as coleções. Você pode renomear à vontade.</p>' : '') +
      '<button type="button" class="fn-btn" data-act="cbsave">Salvar</button><button type="button" class="fn-btn is-alt" data-act="cbaskdelete">' + I('trash', 14) + ' Excluir fichário</button></div>', 'Editar fichário');
  }
  async function cbSaveEdit() {
    var b = cur.binder; if (!b || cbBusy) return;
    var name = (($('#fn-cb-name') || {}).value || '').trim(); if (!name) { toast('Dê um nome ao fichário.'); return; }
    cbBusy = true;
    try {
      var saved = await cbSave(Object.assign({}, b, { name: name, cover_color: ($('#fn-cb-color') || {}).value || b.cover_color }));
      if (!saved) { toast('Não foi possível salvar. Tente de novo.'); return; }
      closeSheet(); refreshAfterCb(); toast('Fichário atualizado.');
    } finally { cbBusy = false; }
  }
  function askCbDelete() {
    var b = cur.binder; if (!b || cbBusy) return;
    openDeleteConfirm({
      title: 'Excluir fichário',
      name: plainName(b.name) || 'Sem nome',
      kind: isPk(st.set) ? 'Fichário de Pokémon' : cbKind(b),
      note: 'As suas marcações de cartas na coleção não serão apagadas, apenas este fichário.',
      confirmAct: 'cbdelete'
    });
  }
  async function cbDelete() {
    var b = cur.binder; if (!b || cbBusy) return;
    cbBusy = true;
    try {
      if (DEMO) demoCb = demoCb.filter(function (x) { return x.id !== b.id; });
      else {
        var r = await sbClient.from('custom_binders').delete().eq('id', b.id).eq('user_id', uid());
        if (r.error) { toast('Não foi possível excluir. Tente de novo.'); return; }
        var i = customBinders.findIndex(function (x) { return x.id === b.id; }); if (i >= 0) customBinders.splice(i, 1);
        try { var pi = pinnedBinders.indexOf(String(b.id)); if (pi >= 0) { pinnedBinders.splice(pi, 1); savePinnedBinders(); } } catch (e) { }
      }
      closeSheet(); dropMultiProg(); toast('Fichário excluído.'); pickSet('home');
    } finally { cbBusy = false; }
  }

  // ── adicionar cartas (busca no catálogo inteiro) ──
  function cbAll() {
    if (cbAllIdx) return cbAllIdx; var out = [];
    try {
      Object.keys(SET_CARDS_MAP).forEach(function (sid) {
        var cs = []; try { cs = SET_CARDS_MAP[sid]() || []; } catch (e) { return; }
        var lbl = setLabelOf(sid); cs.forEach(function (c) { out.push({ set: sid, c: c, hay: normTxt(c.name + ' ' + (c.nameEn || '') + ' ' + c.n + ' ' + sid + ' ' + lbl + ' ' + (c.rare || '')) }); });
      });
    } catch (e) { }
    return (cbAllIdx = out);
  }
  var cbPickBid = null;
 function openCbAdd() {
    if (SHARE) { toast('Somente leitura: este link só mostra a coleção.'); return; }
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para adicionar cartas.'); return; }
    var b = cur.binder; if (!b || cbType(b) !== 'manual') return;
    cbPickBid = String(b.id);
    openSheet(
      '<div class="fn-form"><label>Buscar carta<input id="fn-cp-q" type="search" placeholder="nome, número ou coleção…" autocomplete="off"></label></div><div class="fn-dp" id="fn-cp"></div>',
      'Adicionar a ' + plainName(b.name),
      function (ov) { var sh = ov.querySelector('.fn-sheet'); if (sh) sh.classList.add('fn-sheet-wide'); }
    );
    renderCbAdd('');
  }
  function renderCbAdd(q) {
    var box = $('#fn-cp'), b = cbById(cbPickBid); if (!box || !b) return;
    var words = normTxt(q).split(/\s+/).filter(Boolean);
    if (!words.length || normTxt(q).length < 2) { box.innerHTML = '<div class="fn-empty">Digite pelo menos 2 letras (ex.: “pikachu”, “charizard 125” ou “caos”).</div>'; return; }
    var items = cbAll().filter(function (x) { return words.every(function (w) { return x.hay.indexOf(w) >= 0; }); });
    if (!items.length) { box.innerHTML = '<div class="fn-empty">Nenhuma carta com essa busca.</div>'; return; }
    box.innerHTML = items.slice(0, 60).map(function (x) {
      var c = Object.assign({}, x.c, { _set: x.set, _k: x.set + '~' + x.c.n }), on = hasRef(b, x.set, x.c.n);
      return '<button type="button" class="fn-dp-item' + (on ? ' is-on' : '') + '" data-act="cbpick" data-set="' + esc(x.set) + '" data-cn="' + esc(x.c.n) + '"><img loading="lazy" decoding="async" alt="" src="' + esc(imgSrc(null, '', c)) + '"><span class="tx"><b>' + esc(i18n(c, '').name) + (on ? ' ✓' : '') + '</b><small>' + esc(setLabelOf(x.set).split('—')[0].trim()) + ' · #' + esc(x.c.n) + ' · ' + esc(rareLabel(x.c.rare)) + '</small></span><span class="pr">' + esc(on ? 'tirar' : '+ guardar') + '</span></button>';
    }).join('') + (items.length > 60 ? '<div class="fn-empty">Mostrando 60 de ' + items.length + '. Refine a busca.</div>' : '');
  }
  async function cbPick(sid, n) {
    var b = cbById(cbPickBid); if (!b || cbBusy) return; cbBusy = true;
    try {
      var res = await cbToggleRef(b, sid, n); if (!res) { toast('Não consegui salvar. Tente de novo.'); return; }
      dropMultiProg(); var q = ($('#fn-cp-q') || {}).value || '';
      if (isCb(st.set) && cur.binder && String(cur.binder.id) === String(b.id)) { loadCur(); renderHero(); renderControls(); renderBody(); renderSide(); } else renderSide();
      renderCbAdd(q);
    } finally { cbBusy = false; }
  }

  // ── Meus artistas ──
  function artistStats() {
    var by = {};
    try {
      Object.keys(SET_CARDS_MAP).forEach(function (sid) {
        var cs = []; try { cs = SET_CARDS_MAP[sid]() || []; } catch (e) { return; }
        cs.forEach(function (c) {
          if (!c.artist) return; var a = by[c.artist] = by[c.artist] || { owned: 0, total: 0 }; a.total++;
          var c2 = Object.assign({}, c, { _set: sid, _k: sid + '~' + c.n });
          if (slotsOf('', c2).some(function (x) { return has(keyOf('', c2, x.ver)); })) a.owned++;
        });
      });
    } catch (e) { }
    return Object.keys(by).map(function (k) { return { name: k, owned: by[k].owned, total: by[k].total }; })
      .sort(function (a, b) { return b.owned - a.owned || b.total - a.total || a.name.localeCompare(b.name, 'pt'); });
  }
  var artistList = null;
  function openArtists() {
    artistList = artistStats();
    var withAny = artistList.filter(function (a) { return a.owned > 0; }).length;
    openSheet('<p class="fn-note"><b>' + withAny + '</b> de <b>' + artistList.length + '</b> ilustradores com pelo menos 1 carta sua, somando todas as coleções do site. Cartas sem dado de ilustrador não entram na conta.</p>' +
      '<div class="fn-form"><label>Buscar ilustrador<input id="fn-ar-q" type="search" placeholder="nome…" autocomplete="off"></label></div><div class="fn-dp" id="fn-ar"></div>', 'Meus artistas');
    renderArtists('');
  }
  function renderArtists(q) {
    var box = $('#fn-ar'); if (!box || !artistList) return;
    var w = normTxt(q).split(/\s+/).filter(Boolean), have = artBinders();
    var items = artistList.filter(function (a) { var h = normTxt(a.name); return w.every(function (x) { return h.indexOf(x) >= 0; }); });
    if (!items.length) { box.innerHTML = '<div class="fn-empty">Nenhum ilustrador com essa busca.</div>'; return; }
    box.innerHTML = items.slice(0, 80).map(function (a) {
      var pc = a.total ? Math.round(a.owned / a.total * 100) : 0, ex = have.filter(function (b) { return b.filter_config && b.filter_config.artist === a.name; })[0];
      return '<div class="fn-dp-item"><span class="tx"><b>' + esc(a.name) + '</b><small>' + a.owned + ' de ' + a.total + ' cartas · ' + pc + '%</small></span>' +
        '<button type="button" class="fn-ver' + (ex ? ' is-on' : '') + '" data-act="artbinder" data-artist="' + esc(a.name) + '">' + (ex ? 'Abrir' : '+ Fichário') + '</button></div>';
    }).join('') + (items.length > 80 ? '<div class="fn-empty">Mostrando 80 de ' + items.length + '. Use a busca.</div>' : '');
  }
  async function artistBinder(name) {
    var ex = artBinders().filter(function (b) { return b.filter_config && b.filter_config.artist === name; })[0];
    if (ex) { closeSheet(); pickSet('cb:' + ex.id); return; }
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para criar fichários.'); return; }
    if (cbBusy) return; cbBusy = true;
    try {
      var saved = await cbSave({ name: '🎨 ' + name, emoji: '🎨', layout: 3, filter_config: { type: 'artist', artist: name }, card_ids: [], cover_color: '#a855f7' });
      if (!saved) { toast('Não foi possível criar. Confira a conexão e tente de novo.'); return; }
      closeSheet(); dropMultiProg(); pickSet('cb:' + saved.id);
    } finally { cbBusy = false; }
  }

  // ── Cartão de progresso (PNG para compartilhar) ──
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  async function progressCard() {
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      var t = totals(), isCardMode = st.progMode === 'cards';
      var curGot = isCardMode ? t.cardsAny : t.got;
      var curTot = isCardMode ? t.cards : t.slots;
      var pct = curTot ? Math.round(curGot / curTot * 100) : 0;
      var sub = (isCb(st.set) || isDex(st.set)) ? (t.cards + ' cartas') : '';
      var label = isCb(st.set) || isDex(st.set) ? (cur.binder ? cur.binder.name : 'Meu fichário') : ((SET_CATALOG.filter(function (x) { return x.id === setKey(st.set); })[0] || {}).label || st.set);
      var cw = 680, chh = 360, pad = 28, cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
      var ctx = cv.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, chh); g.addColorStop(0, '#141726'); g.addColorStop(1, '#0a0b10');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, chh); ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffd166'; ctx.font = "700 20px 'Bebas Neue', sans-serif"; ctx.fillText('MEU PROGRESSO — MYDECK TCG', pad, pad - 6);
      ctx.fillStyle = '#fff'; ctx.font = "700 30px 'Bebas Neue', sans-serif"; ctx.fillText(String(label).slice(0, 42), pad, pad + 34);
      var pc = pct >= 100 ? '#06d6a0' : '#ffd166'; ctx.fillStyle = pc; ctx.font = "700 96px 'Bebas Neue', sans-serif"; ctx.textAlign = 'right'; ctx.fillText(pct + '%', cw - pad, pad + 40); ctx.textAlign = 'left';
      var by = pad + 150, bw = cw - pad * 2, bh = 16;
      rrect(ctx, pad, by, bw, bh, 8); ctx.fillStyle = '#242840'; ctx.fill();
      rrect(ctx, pad, by, Math.max(bh, bw * pct / 100), bh, 8); ctx.fillStyle = pc; ctx.fill();
      ctx.fillStyle = '#c7cbe0'; ctx.font = "700 18px 'Space Mono', monospace"; ctx.fillText(curGot + '/' + curTot + (isCardMode ? ' cartas coletadas' : ' slots coletados'), pad, by + 34);
      if (sub) { ctx.fillStyle = '#118ab2'; ctx.font = "700 15px 'Space Mono', monospace"; ctx.fillText(sub.slice(0, 60), pad, by + 64); }
      ctx.fillStyle = '#565d74'; ctx.font = "14px 'Space Mono', monospace"; ctx.fillText('mydecktcg.com.br', pad, chh - pad - 14);
      var blob = await new Promise(function (r) { cv.toBlob(r, 'image/png'); }); if (!blob) throw new Error('png');
      var name = 'mydeck-progresso-' + String(st.set).replace(/[^\w-]/g, '_') + '.png';
      try { var f = new File([blob], name, { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Meu progresso no MyDeck' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      var url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('Imagem salva. Mande no grupo!');
    } catch (e) { console.error(e); toast('Não foi possível gerar a imagem agora.'); }
  }

  async function dexAutoFill() {
    var b = cur.binder; if (!b || !isDex(st.set) || dexBusy) return;
    if (cur.pending > 0) { toast('Ainda carregando todas as coleções. Tente de novo em instantes.'); return; }
    var bid = (b && b.id) || String(st.set).replace(/^dex:/, '') || 'shared';
    var ids = (b.card_ids || []).slice(), added = 0, idx = dexIndex();
    cur.species.forEach(function (sp) {
      if (cur.byDex[sp.dex]) return;
      var cands = (idx[sp.dex] || []).map(function (x) { var c = Object.assign({}, x.c, { _set: x.set, _k: x.set + '~' + x.c.n }); return { set: x.set, c: c, own: slotsOf('', c).some(function (s) { return hasDexSlot(bid, x.set, x.c.n, s.ver); }) }; });
      if (!cands.length) return;
      var owned = cands.filter(function (x) { return x.own; }), pr = function (x) { return (typeof x.c.price === 'number' && x.c.price > 0) ? x.c.price : Infinity; };
      var pick = owned.length ? owned.reduce(function (m, x) { return pr(x) > pr(m) ? x : m; }, owned[0]) : cands.reduce(function (m, x) { return pr(x) < pr(m) ? x : m; }, cands[0]);
      ids.push({ set: pick.set, n: String(pick.c.n), dex: sp.dex }); added++;
    });
    if (!added) { toast('Nenhuma vaga vazia com carta disponível para preencher.'); return; }
    if (!confirm('Preencher ' + added + ' vaga' + (added > 1 ? 's' : '') + ' vazia' + (added > 1 ? 's' : '') + '? Em cada uma entra a carta mais valiosa que você já tem daquela espécie ou, se não tiver nenhuma, a mais barata. As vagas que você já escolheu não mudam.')) return;
    dexBusy = true;
    try {
      var nb = Object.assign({}, b, { card_ids: ids });
      if (DEMO) {
        var di = (demoBinders || []).findIndex(function (x) { return String(x.id) === String(b.id); });
        if (di >= 0) demoBinders[di] = nb;
      } else {
        var saved = await saveCustomBinder(nb);
        if (!saved) { toast('Não foi possível salvar. Tente de novo.'); return; }
      }
      closeSheet(); progCache = {}; loadCur(); renderHero(); renderBody(); renderSide(); toast(added + ' vaga' + (added > 1 ? 's preenchidas.' : ' preenchida.'));
    } finally { dexBusy = false; }
  }

  // ── Fichário de um Pokémon ──
  var demoPk = null, pkEdit = false, pkTarget = null, pkSpecies = false;
  function isPk(id) { return /^pk:/.test(String(id)); }
  function pkBinders() {
    if (SHARE) return [];
    if (DEMO) {
      if (!demoPk) {
        var idx = dexIndex(), list = (idx[6] || idx[25] || []).slice(0, 9), pg = Array(9).fill(null);
        list.forEach(function (x, i) { var sl = null; try { sl = getSlots(x.c, x.set)[0]; } catch (e) { } if (sl && i < 9) pg[i] = { set: x.set, n: String(x.c.n), ver: sl.ver }; });
        demoPk = [{ id: 'demopk', name: 'Charizard', emoji: '📍', layout: 3, cover_color: '#3b82f6', filter_config: { type: 'pokemon', dex: 6, name: 'Charizard' }, pages: [pg, Array(9).fill(null)], card_ids: [] }];
      }
      return demoPk;
    }
    try { return (customBinders || []).filter(function (b) { return b && cbType(b) === 'pokemon'; }); } catch (e) { return []; }
  }
  function pkBinder(setId) { var id = String(setId).replace(/^pk:/, ''); return pkBinders().filter(function (b) { return String(b.id) === id; })[0] || null; }
  function pkDims(b) { return binderDims(b.layout || 3); }
  function pkPages(b) { var n = pkDims(b); n = n.cols * n.rows; var pg = (b.pages && b.pages.length) ? b.pages : [[]]; return pg.map(function (p) { var a = (p || []).slice(); while (a.length < n) a.push(null); return a; }); }
  function pkResolve(b) {
    var memo = {}, pages = pkPages(b), cards = [], seen = {}, miss = 0, filled = 0, got = 0;
    var out = pages.map(function (pg) {
      return pg.map(function (r) {
        if (!r || !r.set) return null; filled++;
        if (!(r.set in memo)) { var m = {}; try { (SET_CARDS_MAP[r.set]() || []).forEach(function (x) { m[String(x.n)] = x; }); } catch (e) { m = null; } memo[r.set] = m; }
        var card = memo[r.set] && memo[r.set][String(r.n)]; if (!card) { miss++; return { r: r, c: null }; }
        var k = r.set + '~' + card.n, c = Object.assign({}, card, { _set: r.set, _setId: r.set, _k: k });
        if (!seen[k]) { seen[k] = c; cards.push(c); } else c = seen[k];
        if (has(keyOf('', c, r.ver))) got++;
        return { r: r, c: c };
      });
    });
    return { pages: out, cards: cards, pending: miss, filled: filled, got: got };
  }
  function loadPk() {
    var b = pkBinder(st.set); CUR = 'R$'; cur.binder = b; cur.pending = 0; cur.byDex = {}; cur.species = []; cur.pk = null;
    if (!b) { cur.d = null; cur.cards = []; return; }
    var r = pkResolve(b); cur.pk = r; cur.cards = r.cards; cur.pending = r.pending; cur.d = { label: b.name, cards: r.cards, sections: [], pk: true };
  }
  function pkProg(b) {
    var key = 'pk:' + b.id; if (progCache[key] !== undefined) return progCache[key];
    var r = pkResolve(b), out = { got: r.got, filled: r.filled, pct: r.filled ? Math.round(r.got / r.filled * 100) : 0 };
    if (r.pending) return out; return (progCache[key] = out);
  }
  function renderPkHero() {
    var b = cur.binder;
    if (!b) { $('#fn-hero').innerHTML = '<div class="fn-hero-top"><div><h1>Fichário de Pokémon</h1><p class="fn-hero-sub">' + (loggedIn() || DEMO ? 'Carregando…' : 'Entre no MyDeck para ver os seus fichários.') + '</p></div></div>'; $('#fn-setbtn-emoji').innerHTML = MD_ICO('pokeball', { size: 22 }); $('#fn-setbtn-code').textContent = 'Pokémon'; $('#fn-setbtn-name').textContent = 'Personalizados'; return; }
    var r = cur.pk, pages = pkPages(b), per = pages[0].length, total = pages.length * per, pct = r.filled ? Math.round(r.got / r.filled * 100) : 0, sp = (b.filter_config || {}).name;
    $('#fn-hero').innerHTML = '<div class="fn-hero-top"><div><h1><span class="h-ico">' + pkIco(b, 26) + '</span>' + esc(plainName(b.name) || 'Sem nome') + '</h1><p class="fn-hero-sub">Fichário de Pokémon' + (sp ? ' · ' + esc(sp) : '') + ' · ' + pages.length + ' página' + (pages.length === 1 ? '' : 's') + ' de ' + binderSizeLabel(b.layout || 3) + '</p></div><div class="fn-pct">' + pct + '<small>%</small></div></div>' +
      '<div class="fn-progress"><i style="width:' + pct + '%"></i></div><div class="fn-stats"><span><b>' + r.got + '</b>/' + r.filled + ' cartas colocadas que você tem</span><span>Vagas preenchidas <b>' + r.filled + '</b>/' + total + '</span>' + condCountsHtml({ kind: 'pk', pages: r.pages }) + '</div>' +
      (!SHARE ? '<div class="fn-hero-links"><a href="#" data-act="pkedit">' + (pkEdit ? I('check') + ' Terminar edição' : I('pencil') + ' Editar posições') + '</a><a href="#" data-act="cbedit">' + I('settings', 14) + ' Nome / excluir</a></div>' : '') +
      (pkEdit ? '<div class="fn-warn" style="margin-top:10px">Modo edição: toque numa vaga vazia para escolher a carta, ou numa carta para trocá-la ou tirá-la. Tudo é salvo na hora.</div>' : '');
    $('#fn-setbtn-emoji').innerHTML = pkIco(b, 22); $('#fn-setbtn-code').textContent = 'Pokémon'; $('#fn-setbtn-name').textContent = plainName(b.name) || 'Pokémon';
  }
  function renderPk() {
    var b = cur.binder; if (!b) return '<div class="fn-empty">' + (loggedIn() || DEMO ? 'Carregando o seu fichário…' : 'Entre no MyDeck para ver o seu fichário.') + '</div>';
    var d = pkDims(b), pages = cur.pk.pages, two = innerWidth >= 700, step = two ? 2 : 1, np = pages.length;
    if (st.bpage >= np) st.bpage = Math.max(0, np - 1); st.bpage = st.bpage - (st.bpage % step); var p0 = st.bpage;
    function page(i) {
      if (i >= np) return '<div></div>';
      var pg = pages[i];
      return '<div class="fn-page"><div class="fn-page-lbl">Página ' + (i + 1) + '</div><div class="fn-pocket-grid" style="--pc:' + d.cols + '">' +
        pg.map(function (sl, j) {
         if (!sl) {
            return !SHARE
              ? '<button type="button" class="fn-pocket is-empty" data-act="pkslot" data-pkpage="' + i + '" data-pkslot="' + j + '" aria-label="Vaga ' + (j + 1) + ' vazia"><span class="fn-slotn">' + (j + 1) + '</span><span>+</span></button>'
              : '<div class="fn-pocket is-empty is-placeholder" aria-hidden="true"><span class="fn-slotn">' + (j + 1) + '</span></div>';
          }
          var c = sl.c;
          if (!c) return '<div class="fn-pocket is-miss"><span class="fn-slotn">#' + esc(sl.r.n) + '</span></div>';
          var on = has(keyOf('', c, sl.r.ver)), kId = ck(c);
          var attrs = pkEdit
            ? 'data-act="pkslot" data-pkpage="' + i + '" data-pkslot="' + j + '"'
            : 'data-n="' + esc(kId) + '" data-ver="' + esc(sl.r.ver) + '" data-open="' + esc(kId) + '"';
          return '<button type="button" class="fn-pocket is-' + (on ? 'have' : 'miss') + '" ' + attrs + ' aria-label="' + esc(i18n(c, '').name) + '">' +
            '<img loading="lazy" decoding="async" alt="" src="' + esc(imgSrc(null, '', c)) + '">' +
            '<span class="fn-slotn">#' + esc(c.n) + '</span><span class="fn-slotv v-' + esc(sl.r.ver) + '">' + esc(sl.r.ver) + '</span>' +
            '<span class="fn-tick">✓</span>' + cardCondBadge('', c, sl.r.ver) + '</button>';
        }).join('') + '</div></div>';
    }
    var lbl = two ? 'Páginas ' + (p0 + 1) + (p0 + 2 <= np ? '–' + (p0 + 2) : '') + ' de ' + np : 'Página ' + (p0 + 1) + ' de ' + np;
    return '<div class="fn-binder-nav"><button type="button" data-bnav="-1"' + (p0 <= 0 ? ' disabled' : '') + '>‹ Anterior</button>' +
      '<span class="fn-binder-pg">' + lbl + '</span><button type="button" data-bnav="1"' + (p0 + step >= np ? ' disabled' : '') + '>Próxima ›</button>' +
      (pkEdit ? '<button type="button" class="fn-btn" data-act="pkaddpage">+ Página</button>' : '') +
      '</div><div class="fn-spread" style="--pr:' + d.rows + '">' + page(p0) + (two ? page(p0 + 1) : '') + '</div>';
  }
  async function pkSavePages(pages, extra) {
    var b = cur.binder; if (!b || cbBusy) return false; cbBusy = true;
    try {
      var saved = await cbSave(Object.assign({}, b, { pages: pages }, extra || {}));
      if (!saved) { toast('Não foi possível salvar. Tente de novo.'); return false; }
      return true;
    } finally { cbBusy = false; }
  }
  function pkRefresh() { dropMultiProg(); loadCur(); renderHero(); renderBody(); renderSide(); }
  async function pkAddPage() {
    var b = cur.binder; if (!b) return; var pages = pkPages(b), n = pages[0].length; pages.push(Array(n).fill(null));
    if (await pkSavePages(pages)) { st.bpage = pages.length - 1; pkRefresh(); }
  }
  function pkSlotTap(pg, j) {
    if (SHARE) { toast('Somente leitura: este link só mostra a coleção.'); return; }
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para editar este fichário.'); return; }
    var b = cur.binder; if (!b) return; var sl = pkPages(b)[pg][j]; pkTarget = { page: pg, slot: j };
    if (!sl) { openPkPicker(); return; }
    var card = cur.pk.pages[pg][j] && cur.pk.pages[pg][j].c;
    openSheet('<p class="fn-note">' + esc(card ? i18n(card, '').name + ' · #' + card.n + ' · ' + sl.ver : 'Vaga ' + (j + 1)) + '</p><div class="fn-acts">' +
      '<button type="button" class="fn-act" data-act="pkchange"><span class="em">' + I('repeat', 20) + '</span><span><b>Trocar a carta</b><small>Escolher outra carta ou versão para esta vaga</small></span></button>' +
      '<button type="button" class="fn-act" data-act="pkremove"><span class="em">' + I('x', 20) + '</span><span><b>Tirar da vaga</b><small>A vaga fica vazia (a sua marcação da carta não muda)</small></span></button>' +
      (card ? '<button type="button" class="fn-act" data-open="' + esc(ck(card)) + '"><span class="em">' + I('search', 20) + '</span><span><b>Ver / marcar a carta</b><small>Quantidade, origem e versões</small></span></button>' : '') + '</div>', 'Vaga ' + (j + 1) + ' · página ' + (pg + 1));
  }
  function openPkPicker() {
    var b = cur.binder; if (!b || !pkTarget) return;
    if (cur.pending > 0) { toast('Ainda carregando todas as coleções. Tente de novo em instantes.'); return; }
    var dex = (b.filter_config || {}).dex;
    if (dex == null || pkSpecies) { openPkSpecies(); return; }
    var sp = (typeof POKEDEX_NACIONAL !== 'undefined' ? POKEDEX_NACIONAL : []).filter(function (x) { return x.dex === dex; })[0];
    openSheet('<div class="fn-form"><p class="fn-note"><b>#' + dex + ' ' + esc((sp && sp.name) || (b.filter_config.name || '')) + '</b> · vaga ' + (pkTarget.slot + 1) + ' da página ' + (pkTarget.page + 1) + ' · <a href="#" data-act="pkspecies">outro Pokémon</a></p></div><div class="fn-dp" id="fn-pkp"></div>', 'Escolher a carta');
    renderPkPicker(dex);
  }
  function renderPkPicker(dex) {
    var box = $('#fn-pkp'); if (!box) return; var list = dexIndex()[dex] || [], rows = [];
    list.forEach(function (x) { var c = Object.assign({}, x.c, { _set: x.set, _k: x.set + '~' + x.c.n }); slotsOf('', c).forEach(function (s) { rows.push({ c: c, ver: s.ver, own: has(keyOf('', c, s.ver)), p: priceOf('', c, s) }); }); });
    rows.sort(function (a, b) { return (b.own ? 1 : 0) - (a.own ? 1 : 0) || (a.p || 1e9) - (b.p || 1e9); });
    if (!rows.length) { box.innerHTML = '<div class="fn-empty">Ainda não há carta desse Pokémon no catálogo.</div>'; return; }
    box.innerHTML = rows.map(function (r) {
      return '<button type="button" class="fn-dp-item' + (r.own ? ' is-on' : '') + '" data-act="pkplace" data-set="' + esc(r.c._set) + '" data-cn="' + esc(r.c.n) + '" data-ver="' + esc(r.ver) + '"><img loading="lazy" decoding="async" alt="" src="' + esc(imgSrc(null, '', r.c)) + '"><span class="tx"><b>' + esc(i18n(r.c, '').name) + (r.own ? ' ✓' : '') + '</b><small>' + esc(setLabelOf(r.c._set).split('—')[0].trim()) + ' · #' + esc(r.c.n) + ' · ' + esc(VERSION_NAME[r.ver] || r.ver) + (r.own ? '' : ' · você ainda não tem') + '</small></span><span class="pr">' + esc(money(r.p)) + '</span></button>';
    }).join('');
  }
  function openPkSpecies() {
    pkSpecies = true;
    openSheet('<div class="fn-form"><label>Qual Pokémon?<input id="fn-pks-q" type="search" placeholder="nome ou número (ex.: Charizard, 6)" autocomplete="off"></label></div><div class="fn-dp" id="fn-pks"></div>', 'Escolher o Pokémon');
    renderPkSpecies('');
  }
  function renderPkSpecies(q) {
    var box = $('#fn-pks'); if (!box) return; var list = typeof POKEDEX_NACIONAL !== 'undefined' ? POKEDEX_NACIONAL : [], w = normTxt(q).replace(/^#/, '').split(/\s+/).filter(Boolean);
    var m = list.filter(function (sp) { var h = normTxt(sp.name + ' ' + sp.dex); return w.every(function (x) { return h.indexOf(x) >= 0; }); }).slice(0, 50);
    box.innerHTML = m.length ? m.map(function (sp) { return '<button type="button" class="fn-dp-item" data-act="pkspecpick" data-dex="' + sp.dex + '" data-name="' + esc(sp.name) + '"><span class="tx"><b>' + esc(sp.name) + '</b><small>#' + sp.dex + '</small></span></button>'; }).join('') : '<div class="fn-empty">Nenhum Pokémon encontrado.</div>';
  }
  async function pkPickSpecies(dex, name) {
    var b = cur.binder; if (!b) return; pkSpecies = false;
    if (Number((b.filter_config || {}).dex) !== Number(dex)) { var ok = await pkSavePages(pkPages(b), { filter_config: Object.assign({}, b.filter_config, { dex: dex, name: name }) }); if (!ok) return; loadCur(); renderHero(); renderSide(); }
    openPkPicker();
  }
  async function pkPlace(set, n, ver) {
    var b = cur.binder; if (!b || !pkTarget) return; var pages = pkPages(b); pages[pkTarget.page][pkTarget.slot] = { set: set, n: String(n), ver: ver };
    if (await pkSavePages(pages)) { closeSheet(); pkRefresh(); toast('Carta colocada.'); }
  }
  async function pkRemove() {
    var b = cur.binder; if (!b || !pkTarget) return; var pages = pkPages(b); pages[pkTarget.page][pkTarget.slot] = null;
    if (await pkSavePages(pages)) { closeSheet(); pkRefresh(); toast('Vaga esvaziada.'); }
  }
  function openPkNew() {
    if (!DEMO && !loggedIn()) { toast('Entre no MyDeck para criar fichários.'); return; }
    var sizes = (window.BINDER_SIZES || [2, 3, 4, 5, 6]);
    openSheet('<div class="fn-form"><label>Nome do fichário<input type="text" id="fn-pk-name" maxlength="40" placeholder="Ex.: Charizard" autocomplete="off"></label>' +
      '<label>Tamanho da página<div class="fn-seg" id="fn-pk-size" role="group">' + sizes.map(function (n) { return '<button type="button" data-act="pksize" data-size="' + n + '" class="' + (n === 3 ? 'is-on' : '') + '">' + binderSizeLabel(n) + '</button>'; }).join('') + '</div></label>' +
      '<button type="button" class="fn-btn" data-act="pkcreate">Criar e escolher as cartas</button><p class="fn-note">Um fichário dedicado a um Pokémon, com cada carta na posição que você quiser, como no fichário de verdade.</p></div>', 'Fichário de Pokémon');
  }
  async function pkCreate() {
    var name = (($('#fn-pk-name') || {}).value || '').trim(); if (!name) { toast('Dê um nome ao fichário.'); return; }
    var sz = Number((($('#fn-pk-size .is-on') || {}).dataset || {}).size) || 3, d = binderDims(sz), n = d.cols * d.rows;
    if (cbBusy) return; cbBusy = true;
    try {
      var saved = await cbSave({ name: name, emoji: '📍', layout: sz, filter_config: { type: 'pokemon', dex: null, name: null }, card_ids: [], cover_color: '#3b82f6', pages: [Array(n).fill(null)] });
      if (!saved) { toast('Não foi possível criar. Confira a conexão e tente de novo.'); return; }
      closeSheet(); dropMultiProg(); pickSet('pk:' + saved.id); pkEdit = true; renderHero(); renderBody(); toast('Toque numa vaga vazia para escolher a carta.');
    } finally { cbBusy = false; }
  }

  function cbRefs() { return cur.cards.map(function (c) { return { set: c._set, n: c.n }; }); }

  function fixSetId() {
    if (!isCb(st.set) || cbBinder(st.set)) return; var id = st.set.slice(3);
    if (pkBinder('pk:' + id)) st.set = 'pk:' + id; else if (dexBinder('dex:' + id)) st.set = 'dex:' + id;
  }
  function isHome(id) { return String(id) === 'home'; }
  function loadCur() {
    fixSetId();
    if (isHome(st.set)) { cur.binder = null; cur.pending = 0; cur.pk = null; cur.byDex = {}; cur.species = []; cur.cards = []; cur.d = { label: 'Personalizados', cards: [], sections: [], home: true }; CUR = 'R$'; return; }
    if (isDex(st.set)) { loadDex(); return; }
    if (isCb(st.set)) { loadCb(); return; }
    if (isPk(st.set)) { loadPk(); return; }
    cur.binder = null; cur.pending = 0; cur.pk = null;
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
      if (st.artist && c.artist !== st.artist) return false;
      if (st.status !== 'all') { var s = stateOf(id, c).st; if (st.status === 'miss' && s === 'have') return false; if (st.status === 'have' && s !== 'have') return false; }
      return true;
    });
    var by = {
      num: function (a, b) { return secIdx(a) - secIdx(b) || String(a.n).localeCompare(String(b.n), undefined, { numeric: true }) || ((a._dupIdx || 0) - (b._dupIdx || 0)); },
      name: function (a, b) { return String(a.name).localeCompare(String(b.name), 'pt') || ((a._dupIdx || 0) - (b._dupIdx || 0)); },
      rare: function (a, b) { return rareRank(b.rare) - rareRank(a.rare) || by.num(a, b); },
      price: function (a, b) { return (b.price || 0) - (a.price || 0) || ((a._dupIdx || 0) - (b._dupIdx || 0)); },
      dex: function (a, b) { var x = dexOf(a), y = dexOf(b); if (x == null && y == null) return by.num(a, b); if (x == null) return 1; if (y == null) return -1; return x - y || by.num(a, b); }
    };
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
    var id = st.set, t = { slots: 0, got: 0, bT: 0, bG: 0, sT: 0, sG: 0, cards: 0, cardsHave: 0, cardsAny: 0, bCardsT: 0, bCardsAny: 0, sCardsT: 0, sCardsAny: 0 };
    cur.cards.forEach(function (c) {
      var s = stateOf(id, c), any = s.have > 0;
      t.cards++; if (s.st === 'have') t.cardsHave++; if (any) t.cardsAny++;
      if (c.base) { t.bCardsT++; if (any) t.bCardsAny++; } else { t.sCardsT++; if (any) t.sCardsAny++; }
      s.sl.forEach(function (x) {
        var k = has(keyOf(id, c, x.ver)); t.slots++; if (k) t.got++;
        if (c.base) { t.bT++; if (k) t.bG++; } else { t.sT++; if (k) t.sG++; }
      });
    });
    return t;
  }

  // ── renderização ───────────────────────────────────────────
  function verButtons(id, c) {
    var sl = slotsOf(id, c), nm0 = i18n(c, id).name, kId = ck(c);
    return '<div class="fn-vers">' + sl.map(function (s) {
      var key = keyOf(id, c, s.ver), totQ = totalQtyOf(key), on = totQ > 0;
      var nm = VERSION_NAME[s.ver] || s.ver;
      return '<button type="button" class="fn-ver' + (on ? ' is-on' : '') + '" data-mark="' + esc(kId) + '" data-ver="' + esc(s.ver) + '" aria-pressed="' + on + '" aria-label="' + esc(nm0 + ' — ' + nm + (on ? ' (coletada' + (totQ > 1 ? ', ' + totQ + ' cópias' : '') + ')' : ' (faltando)')) + '">' +
        (on ? '✓ ' : '') + s.ver + (totQ > 1 ? ' <span class="fn-x2">×' + totQ + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function cardHtml(c) {
    var id = st.set, s = stateOf(id, c), r = rareCls(c.rare), nm = i18n(c, id).name, kId = ck(c);
    return '<article class="fn-card is-' + s.st + '" data-n="' + esc(kId) + '">' +
      '<button type="button" class="fn-img" data-open="' + esc(kId) + '" aria-label="Ver ' + esc(nm) + '">' +
      (c._dex ? '<span class="fn-dexn">#' + c._dex + '</span>' : '') +
      '<img loading="lazy" decoding="async" alt="' + esc(nm) + '" src="' + esc(imgSrc(cur.d, id, c)) + '">' +
      (isFav(c) ? '<span class="fn-fav" title="Nos seus Favoritos" aria-hidden="true">' + I('star', 12, { fill: true }) + '</span>' : '') +
      '<span class="fn-tick" aria-hidden="true">' + (s.st === 'part' ? '½' : '✓') + '</span>' +
      cardCondBadge(id, c) + '</button>' +
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
  function verCondsHtml(id, c, ver) {
    var k = keyOf(id, c, ver);
    var e = entryOf(k);
    var lots = lotsOf(k);
    var rank = { M: 0, NM: 1, SP: 2, MP: 3, HP: 4, D: 5 };

    var entries = [];

    if (e.qty > 0) {
      entries.push({
        cond: condOf(k) || '',
        qty: e.qty
      });
    }

    for (var j = 0; j < lots.length; j++) {
      var lq = Number(lots[j].qty) || 0;
      if (lq > 0) {
        entries.push({
          cond: lots[j].cond || '',
          qty: lq
        });
      }
    }

    if (!entries.length) return '<span class="t-dash">—</span>';

    var grouped = {};
    var orderKeys = [];
    entries.forEach(function (it) {
      var grpKey = it.cond || '__NONE__';
      if (!grouped[grpKey]) {
        grouped[grpKey] = { cond: it.cond, qty: 0 };
        orderKeys.push(grpKey);
      }
      grouped[grpKey].qty += it.qty;
    });

    var rows = orderKeys.map(function (gk) { return grouped[gk]; });
    rows.sort(function (a, b) {
      if (!a.cond && !b.cond) return 0;
      if (!a.cond) return 1;
      if (!b.cond) return -1;
      return (rank[a.cond] != null ? rank[a.cond] : 99) - (rank[b.cond] != null ? rank[b.cond] : 99);
    });

    return '<div class="fn-qcond-stack">' + rows.map(function (r) {
      var badge = r.cond
        ? '<span class="fn-cond c-' + esc(r.cond) + '" title="' + esc(condLabel(r.cond)) + '">' + esc(r.cond) + '</span>'
        : '<span class="fn-cond c-none" title="Sem qualidade definida">—</span>';
      return '<div class="fn-qcond-row">' + badge + '<span class="fn-qcond-x">×' + r.qty + '</span></div>';
    }).join('') + '</div>';
  }

  function verPriceFmt(id, c, sl) {
    var val = priceOf(id, c, sl);
    if (val == null || isNaN(Number(val)) || Number(val) <= 0) return priceFmt(c, id);
    var i = i18n(c, id);
    if (i.symbol === '$') {
      return '$ ' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return money0(Number(val));
  }

  function collectVerCols(id, cards) {
    var seen = {}, list = [];
    (cards || []).forEach(function (c) {
      if (!c) return;
      slotsOf(id, c).forEach(function (s) {
        if (!seen[s.ver]) {
          seen[s.ver] = true;
          list.push(s.ver);
        }
      });
    });
    return list.length ? list : ['N'];
  }

  function renderVersionCells(id, c, kId, nm0, versList) {
    var sl = slotsOf(id, c);
    var byVer = {};
    sl.forEach(function (s) { byVer[s.ver] = s; });

    return versList.map(function (ver) {
      var slot = byVer[ver];
      if (!slot) {
        return (
          '<td class="t-ver-empty t-grp-start t-col-cond"><span class="t-dash">—</span></td>' +
          '<td class="t-ver-empty t-col-qty"><span class="t-dash">—</span></td>' +
          '<td class="t-ver-empty t-col-price"><span class="t-dash">—</span></td>'
        );
      }

      var key = keyOf(id, c, ver);
      var totQ = totalQtyOf(key);
      var on = totQ > 0;
      var vName = VERSION_NAME[ver] || ver;
      var qtyNum = on ? totQ : 0;

      var condCell = '<td class="t-grp-start t-col-cond">' + verCondsHtml(id, c, ver) + '</td>';

      var qtyCell =
        '<td class="t-col-qty">' +
        '<div class="t-qty-box">' +
        '<span class="t-qty-num' + (on ? ' is-have' : ' is-zero') + '">' + qtyNum + '</span>' +
        '<button type="button" class="fn-ver t-ver-btn' + (on ? ' is-on' : '') + '"' +
        ' data-mark="' + esc(kId) + '"' +
        ' data-ver="' + esc(ver) + '"' +
        ' aria-pressed="' + on + '"' +
        ' title="' + esc(on ? 'Coletada (' + qtyNum + ' cópia' + (qtyNum === 1 ? '' : 's') + ')' : 'Marcar ' + vName) + '"' +
        ' aria-label="' + esc(nm0 + ' — ' + vName + (on ? ' (coletada, ' + qtyNum + ' cópias)' : ' (faltando)')) + '">' +
        (on ? '✓ ' + esc(ver) : '+ ' + esc(ver)) +
        '</button>' +
        '</div>' +
        '</td>';

      var priceCell = '<td class="t-price t-col-price">' + esc(verPriceFmt(id, c, slot)) + '</td>';

      return condCell + qtyCell + priceCell;
    }).join('');
  }

  function renderTable(dexVis) {
    var id = st.set;

    if (dexVis) {
      if (!dexVis.length) return '<div class="fn-empty">Nenhuma espécie com esse filtro.</div>';
      var shownDex = dexVis.slice(0, dexLimit);
      var dexCards = shownDex.map(function (x) { return x.c; }).filter(Boolean);
      var dVers = collectVerCols(id, dexCards);

      var dHead1 = '<tr>' +
        '<th rowspan="2" class="t-col-img">Imagem</th>' +
        '<th rowspan="2" class="t-col-num">Dex</th>' +
        '<th rowspan="2" class="t-col-name">Espécie / Carta</th>' +
        '<th rowspan="2" class="t-col-rare">Raridade</th>' +
        dVers.map(function (v) {
          var vLbl = VERSION_NAME[v] ? (v + ' · ' + VERSION_NAME[v]) : v;
          return '<th colspan="3" class="t-grp-th t-grp-start">' + esc(vLbl) + '</th>';
        }).join('') +
        '</tr>';

      var dHead2 = '<tr class="t-subhead">' +
        dVers.map(function () {
          return '<th class="t-grp-start t-col-cond">Qualidade</th>' +
            '<th class="t-col-qty">Quantidade</th>' +
            '<th class="t-col-price">Preço</th>';
        }).join('') +
        '</tr>';

      return '<div class="fn-tablewrap"><table class="fn-table fn-table-lg fn-table-matrix"><thead>' + dHead1 + dHead2 + '</thead><tbody>' +
        shownDex.map(function (x) {
          var sp = x.sp, c = x.c;
          if (!c) {
            return '<tr class="t-miss fn-ph" data-dexph="' + sp.dex + '">' +
              '<td class="t-thumb t-col-img">' + artImg(sp.dex) + '</td>' +
              '<td class="t-col-num">#' + sp.dex + '</td>' +
              '<td class="t-col-name"><button type="button" class="t-name-btn" data-dexpick="' + sp.dex + '">' + esc(sp.name) + '</button><br><small style="color:var(--muted)">sem carta escolhida</small></td>' +
              '<td class="t-col-rare">—</td>' +
              '<td colspan="' + (dVers.length * 3) + '" class="t-grp-start"><button type="button" class="fn-ver" data-dexpick="' + sp.dex + '">+ Escolher carta</button></td></tr>';
          }
          var own = dexOwned(c), kId = ck(c), nm0 = i18n(c, id).name;
          return '<tr data-n="' + esc(kId) + '" class="' + (!own ? 't-miss' : '') + '">' +
            '<td class="t-thumb t-col-img"><img loading="lazy" alt="" src="' + esc(imgSrc(cur.d, id, c)) + '"></td>' +
            '<td class="t-col-num">#' + sp.dex + '</td>' +
            '<td class="t-col-name"><button type="button" class="t-name-btn" data-open="' + esc(kId) + '">' + esc(sp.name) + '</button><br><small style="color:var(--muted)">' + esc(nm0) + ' · #' + esc(c.n) + '</small></td>' +
            '<td class="t-col-rare ' + rareCls(c.rare) + '">' + esc(rareLabel(c.rare)) + '</td>' +
            renderVersionCells(id, c, kId, nm0, dVers) +
            '</tr>';
        }).join('') + '</tbody></table></div>' +
        (dexVis.length > shownDex.length ? '<div class="fn-more"><button type="button" class="fn-btn" data-act="dexmore">Mostrar mais (' + (dexVis.length - shownDex.length) + ' espécies)</button></div>' : '');
    }

    if (!cur.view.length) return emptyMsg();

    var vers = collectVerCols(id, cur.view);
    var head1 = '<tr>' +
      '<th rowspan="2" class="t-col-img">Imagem</th>' +
      '<th rowspan="2" class="t-col-num">Número</th>' +
      '<th rowspan="2" class="t-col-name">Nome</th>' +
      '<th rowspan="2" class="t-col-rare">Raridade</th>' +
      vers.map(function (v) {
        var vLbl = VERSION_NAME[v] ? (v + ' · ' + VERSION_NAME[v]) : v;
        return '<th colspan="3" class="t-grp-th t-grp-start">' + esc(vLbl) + '</th>';
      }).join('') +
      '</tr>';

    var head2 = '<tr class="t-subhead">' +
      vers.map(function () {
        return '<th class="t-grp-start t-col-cond">Qualidade</th>' +
          '<th class="t-col-qty">Quantidade</th>' +
          '<th class="t-col-price">Preço</th>';
      }).join('') +
      '</tr>';

    return '<div class="fn-tablewrap"><table class="fn-table fn-table-lg fn-table-matrix"><thead>' + head1 + head2 + '</thead><tbody>' +
      cur.view.map(function (c) {
        var s = stateOf(id, c), kId = ck(c), nm0 = i18n(c, id).name;
        return '<tr data-n="' + esc(kId) + '" class="' + (s.st === 'miss' ? 't-miss' : '') + '">' +
          '<td class="t-thumb t-col-img"><img loading="lazy" alt="" src="' + esc(imgSrc(cur.d, id, c)) + '"></td>' +
          '<td class="t-col-num">#' + esc(c.n) + '</td>' +
          '<td class="t-col-name"><button type="button" class="t-name-btn" data-open="' + esc(kId) + '">' + esc(nm0) + '</button></td>' +
          '<td class="t-col-rare ' + rareCls(c.rare) + '">' + esc(rareLabel(c.rare)) + '</td>' +
          renderVersionCells(id, c, kId, nm0, vers) +
          '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function renderBinder(dexVis) {
    var id = st.set, P = pocketCfg(), per = P.per, cols = P.cols, items = [];
    if (dexVis) {
      items = dexVis.map(function (x) { return { sp: x.sp, c: x.c, ver: null }; });
    } else {
      if (!cur.view.length) return emptyMsg();
      cur.view.forEach(function (c) { slotsOf(id, c).forEach(function (s) { items.push({ c: c, ver: s.ver }); }); });
      if (!items.length) return emptyMsg();
    }

    var pages = Math.max(1, Math.ceil(items.length / per));
    var two = innerWidth >= 700, step = two ? 2 : 1;
    if (st.bpage >= pages) st.bpage = Math.max(0, pages - 1);
    st.bpage = st.bpage - (st.bpage % step);
    var p0 = st.bpage;

    function emptyPocket(idx, pageIdx) {
      var canAddManual = !SHARE && isCb(id) && cur.binder && cbType(cur.binder) === 'manual';
      var canAddPk = !SHARE && isPk(id) && cur.binder;

      if (canAddManual) {
        return '<button type="button" class="fn-pocket is-empty" data-act="cbadd" aria-label="Adicionar carta">' +
          '<span class="fn-slotn">' + (idx + 1) + '</span>' +
          '<span aria-hidden="true">+</span>' +
          '</button>';
      }

      if (canAddPk) {
        return '<button type="button" class="fn-pocket is-empty" data-act="pkslot" data-pkpage="' + pageIdx + '" data-pkslot="' + idx + '" aria-label="Escolher carta para a vaga ' + (idx + 1) + '">' +
          '<span class="fn-slotn">' + (idx + 1) + '</span>' +
          '<span aria-hidden="true">+</span>' +
          '</button>';
      }

      return '<div class="fn-pocket is-empty is-placeholder" aria-hidden="true">' +
        '<span class="fn-slotn">' + (idx + 1) + '</span>' +
        '</div>';
    }
    function page(i) {
      if (i >= pages) return '<div></div>';
      var chunk = items.slice(i * per, i * per + per);
      while (chunk.length < per) chunk.push(null);

      return '<div class="fn-page"><div class="fn-page-lbl">Página ' + (i + 1) + '</div><div class="fn-pocket-grid" style="--pc:' + cols + '">' +
        chunk.map(function (it, idx) {
          if (!it) return emptyPocket(idx);
          if (dexVis && !it.c) {
            return '<button type="button" class="fn-pocket is-miss fn-ph" data-dexpick="' + it.sp.dex + '" aria-label="Escolher a carta de ' + esc(it.sp.name) + '">' +
              artImg(it.sp.dex) + '<span class="fn-slotn">#' + it.sp.dex + '</span></button>';
          }
          if (dexVis) {
            var cd = it.c;
            return '<button type="button" class="fn-pocket is-' + (dexOwned(cd) ? 'have' : 'miss') + '" data-n="' + esc(ck(cd)) + '" data-open="' + esc(ck(cd)) + '" aria-label="' + esc(i18n(cd, id).name) + '">' +
              '<img loading="lazy" decoding="async" alt="" src="' + esc(imgSrc(cur.d, id, cd)) + '">' +
              '<span class="fn-slotn">#' + it.sp.dex + '</span><span class="fn-tick">✓</span>' + cardCondBadge(id, cd) + '</button>';
          }
          var c = it.c, on = has(keyOf(id, c, it.ver)), kId = ck(c);
          return '<button type="button" class="fn-pocket is-' + (on ? 'have' : 'miss') + '" data-n="' + esc(kId) + '" data-ver="' + esc(it.ver) + '" data-open="' + esc(kId) + '" aria-label="' + esc(i18n(c, id).name + ' — ' + (VERSION_NAME[it.ver] || it.ver) + (on ? ' (coletada)' : ' (faltando)')) + '">' +
            '<img loading="lazy" decoding="async" alt="" src="' + esc(imgSrc(cur.d, id, c)) + '">' +
            '<span class="fn-slotn">#' + esc(c.n) + '</span><span class="fn-slotv v-' + esc(it.ver) + '">' + esc(it.ver) + '</span>' +
            '<span class="fn-tick">✓</span>' + cardCondBadge(id, c, it.ver) + '</button>';
        }).join('') + '</div></div>';
    }

    var lbl = two ? 'Páginas ' + (p0 + 1) + (p0 + 2 <= pages ? '–' + (p0 + 2) : '') + ' de ' + pages : 'Página ' + (p0 + 1) + ' de ' + pages;
    return '<div class="fn-binder-nav"><button type="button" data-bnav="-1"' + (p0 <= 0 ? ' disabled' : '') + '>‹ Anterior</button>' +
      '<span class="fn-binder-pg">' + lbl + '</span><button type="button" data-bnav="1"' + (p0 + step >= pages ? ' disabled' : '') + '>Próxima ›</button>' +
      '<div class="fn-seg fn-seg-soft" id="fn-pocket" role="group" aria-label="Bolsos por página">' +
      POCKETS.map(function (p) { return '<button type="button" data-pocket="' + p.id + '" class="' + (p.id === P.id ? 'is-on' : '') + '">' + p.label + '</button>'; }).join('') +
      '</div></div>' +
      '<div class="fn-spread" style="--pr:' + Math.ceil(per / cols) + '">' + page(p0) + (two ? page(p0 + 1) : '') + '</div>';
  }
  function renderDashView() {
    var id = st.set, own = 0, miss = 0, ownN = 0, missN = 0, bestO = null, bestM = null, ver = {}, rar = {}, missing = [];
    if (!cur.cards.length) return emptyMsg();
    cur.cards.forEach(function (c) {
      var rl = rareLabel(c.rare); rar[rl] = rar[rl] || { got: 0, tot: 0, rank: rareRank(c.rare) };
      slotsOf(id, c).forEach(function (sl) {
        var p = priceOf(id, c, sl), k = has(keyOf(id, c, sl.ver)); rar[rl].tot++;
        if (k) { own += p; ownN++; rar[rl].got++; ver[sl.ver] = (ver[sl.ver] || 0) + 1; if (!bestO || p > bestO.p) bestO = { c: c, v: sl.ver, p: p }; }
        else { miss += p; missN++; missing.push({ c: c, v: sl.ver, p: p }); if (!bestM || p > bestM.p) bestM = { c: c, v: sl.ver, p: p }; }
      });
    });
    var tot = own + miss, pv = tot ? Math.round(own / tot * 100) : 0;
    var kpi = function (cls, t, v, sub) { return '<div class="fn-kpi ' + cls + '"><small>' + t + '</small><b>' + esc(v) + '</b><span>' + esc(sub) + '</span></div>'; };
    var line = function (x) { return i18n(x.c, id).name + ' #' + x.c.n + ' · ' + x.v; };
    var html = '<div class="fn-dash"><div class="fn-kpis">' +
      kpi('k-teal', 'Valor da coleção', money(own), ownN + ' slot' + (ownN === 1 ? '' : 's') + ' que você tem') +
      kpi('k-gold', 'Valor total do set', money(tot), pv + '% do valor já é seu') +
      (bestO ? kpi('k-blue', 'Sua carta mais valiosa', money(bestO.p), line(bestO)) : '') +
      (bestM ? kpi('k-red', 'Maior valor entre faltantes', money(bestM.p), line(bestM)) : '') + '</div>';
    var rows = Object.keys(rar).map(function (k) { return { k: k, r: rar[k] }; }).sort(function (a, b) { return b.r.rank - a.r.rank; });
    html += '<h3>Por raridade</h3><div>' + rows.map(function (x) {
      var pc = x.r.tot ? Math.round(x.r.got / x.r.tot * 100) : 0;
      return '<div class="fn-rrow"><span>' + esc(x.k) + '</span><div class="bar"><i style="width:' + pc + '%"></i></div><span class="num">' + x.r.got + '/' + x.r.tot + '</span></div>';
    }).join('') + '</div>';
    var top = missing.sort(function (a, b) { return b.p - a.p; }).slice(0, 8);
    if (top.length) html += '<h3>Destaques que faltam</h3><div class="fn-toplist">' + top.map(function (x) {
      return '<button type="button" class="fn-topitem" data-open="' + esc(ck(x.c)) + '"><img loading="lazy" alt="" src="' + esc(imgSrc(cur.d, id, x.c)) + '"><span class="tx"><b>' + esc(i18n(x.c, id).name) + '</b><small>#' + esc(x.c.n) + ' · ' + esc(rareLabel(x.c.rare)) + ' · ' + esc(x.v) + '</small></span><span class="pr">' + esc(money(x.p)) + '</span></button>';
    }).join('') + '</div>';
    var vk = Object.keys(ver);
    if (vk.length) html += '<h3>Versões que você tem</h3><div class="fn-stats">' + vk.map(function (v) { return '<span>' + esc(VERSION_NAME[v] || v) + ': <b>' + ver[v] + '</b></span>'; }).join('') + '</div>';
    return html + '</div>';
  }
  function emptyMsg() {
    if (isCb(st.set) && cur.binder && !cur.cards.length) return '<div class="fn-empty">' + (cur.pending ? 'Carregando as cartas…' : cbType(cur.binder) === 'manual' ? 'Nenhuma carta guardada ainda. Toque em “Adicionar cartas” acima, ou abra qualquer carta e escolha “Guardar em fichário”.' : 'Nenhuma carta entra neste fichário por enquanto.') + '</div>';
    if (!cur.d || !cur.cards.length) return '<div class="fn-empty">' + (loggedIn() || DEMO ? 'Carregando as cartas desta coleção…' : 'Esta coleção carrega depois do login.') + '</div>';
    return '<div class="fn-empty">Nenhuma carta com esse filtro.</div>';
  }
  function langNote() {
    if (st.set === 'cel30jp' || st.set === 'cel30cn') return '';
    var l = effLang(st.set); if (SHARE && l !== 'pt') return ' · coleção em ' + ({ en: 'inglês', jp: 'japonês', cn: 'chinês' }[l] || l); return l === 'pt' ? '' : ' · coleção em ' + ({ en: 'inglês', jp: 'japonês', cn: 'chinês' }[l] || l) + ' (marcações separadas do português)';
  }
  function renderHero() {
    renderHeroCore();
    if (SHARE) { var l = $('#fn-hero .fn-hero-links'); if (!l) { l = document.createElement('div'); l.className = 'fn-hero-links'; $('#fn-hero').appendChild(l); } l.innerHTML = '<a href="./">Montar a minha coleção no MyDeck</a>'; }
  }
  function renderHeroCore() {
    if (isHome(st.set)) { renderHomeHero(); return; }
    if (isDex(st.set)) { renderDexHero(); return; }
    if (isCb(st.set)) { renderCbHero(); return; }
    if (isPk(st.set)) { renderPkHero(); return; }
    var d = cur.d, meta = (typeof SET_META !== 'undefined' && SET_META[setKey(st.set)]) || {}, cat = SET_CATALOG.filter(function (s) { return s.id === setKey(st.set); })[0] || {};
    var t = totals();
    var isCardMode = st.progMode === 'cards';
    var pct = isCardMode ? (t.cards ? Math.round(t.cardsAny / t.cards * 100) : 0) : (t.slots ? Math.round(t.got / t.slots * 100) : 0);
    var rem = isCardMode ? (t.cards - t.cardsAny) : (t.slots - t.got);
    var done = isCardMode ? (t.cards > 0 && t.cardsAny >= t.cards) : (t.slots > 0 && t.got >= t.slots);
    var label = (cat.label || (d && d.label) || st.set);
    var nameOnly = label.indexOf('—') >= 0 ? label.split('—')[1].trim() : label;
    $('#fn-hero').innerHTML =
      '<div class="fn-hero-top"><div><h1>' + esc(nameOnly) + '</h1><p class="fn-hero-sub">' + esc(label.split('—')[0].trim()) + (meta.releaseDate ? ' · lançada em ' + esc(meta.releaseDate) : '') + ' · ' + t.cards + ' cartas' + langNote() + '</p></div>' +
      '<div class="fn-hero-right"><div class="fn-pct">' + pct + '<small>%</small></div>' +
      '<div class="fn-seg fn-seg-mini" role="group" aria-label="Base do progresso">' +
      '<button type="button" data-progmode="slots" class="' + (!isCardMode ? 'is-on' : '') + '" title="Contar cada versão (F e RH)">Slots</button>' +
      '<button type="button" data-progmode="cards" class="' + (isCardMode ? 'is-on' : '') + '" title="Contar 1 por carta, independente da versão">Cartas</button>' +
      '</div></div></div>' +
      '<div class="fn-progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>' +
      '<div class="fn-stats">' +
      '<span' + (!isCardMode ? ' class="is-active-metric"' : '') + '><b>' + t.got + '</b>/' + t.slots + ' slots</span>' +
      '<span' + (isCardMode ? ' class="is-active-metric"' : '') + '><b>' + t.cardsAny + '</b>/' + t.cards + ' cartas</span>' +
      (t.sT ? '<span>Base <b>' + t.bG + '</b>/' + t.bT + '</span><span>Secretas <b>' + t.sG + '</b>/' + t.sT + '</span>' : '') +
      (!t.slots ? '<span>' + (loggedIn() || DEMO ? 'Carregando as cartas…' : 'Entre no MyDeck para carregar esta coleção.') + '</span>' : done ? '<span><b style="color:var(--teal)">Coleção completa</b></span>' : '<span><b>' + rem + '</b> ' + (isCardMode ? 'cartas restantes' : 'slots restantes') + '</span>') +
      condCountsHtml({ kind: 'set', id: st.set, cards: cur.cards }) + '</div>';
  }
  function renderBody() {
    computeView();
    var html = isHome(st.set) ? renderHome() : isPk(st.set) ? renderPk() : isDex(st.set) && (st.view === 'grid' || st.view === 'binder' || st.view === 'table') ? renderDex() :
      st.view === 'table' ? renderTable() : st.view === 'binder' ? renderBinder() : st.view === 'dash' ? renderDashView() : renderGrid();
    $('#fn-body').innerHTML = html;
  }
  function renderControls() {
    document.body.classList.toggle('fn-pk', isPk(st.set)); document.body.classList.toggle('fn-home', isHome(st.set));
    $$('.fn-chip[data-status]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.status === st.status); });
    var L = langsOf(st.set), lg = $('#fn-lang'); lg.hidden = !L || !!SHARE; $('#fn-lang-grp').hidden = lg.hidden;
    if (L) $$('button', lg).forEach(function (b) { b.hidden = L.indexOf(b.dataset.lang) < 0; b.classList.toggle('is-on', b.dataset.lang === effLang(st.set)); });
    $$('#fn-view button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.view === st.view); });
    var sw = $('#fn-sort-wrap');
    if (sw) sw.hidden = isDex(st.set);
    $('#fn-sort').value = st.sort;
    $('#fn-sort').disabled = isDex(st.set);
    var arts = []; cur.cards.forEach(function (c) { if (c.artist && arts.indexOf(c.artist) < 0) arts.push(c.artist); });
    arts.sort(function (a, b) { return a.localeCompare(b, 'pt'); });
    var aw = $('#fn-artist-wrap'), as = $('#fn-artist'); aw.hidden = !arts.length;
    if (arts.length) { as.innerHTML = '<option value="">Todos</option>' + arts.map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join(''); as.value = arts.indexOf(st.artist) >= 0 ? st.artist : ''; if (as.value !== st.artist) st.artist = as.value; }
    else st.artist = '';
    applyFocus();
    $('#fn-cols-val').textContent = st.cols;
    $('#fn-cols-grp').style.display = st.view === 'grid' ? '' : 'none';
    document.documentElement.style.setProperty('--cols', st.cols);
  }
  function applyFocus() {
    var canBinder = st.view === 'binder' && innerWidth >= 700;
    var canTable = st.view === 'table' && innerWidth >= 700;
    var onBinder = canBinder && st.focus;
    var onTable = canTable && st.tableFocus;

    document.body.classList.toggle('fn-focus', onBinder);
    document.body.classList.toggle('fn-table-focus', onTable);

    var b = $('#fn-focus');
    if (!b) return;

    if (canBinder) {
      b.hidden = false;
      b.classList.toggle('is-on', onBinder);
      b.innerHTML = onBinder ? I('x') + ' Sair do foco' : I('maximize') + ' Foco';
    } else if (canTable) {
      b.hidden = false;
      b.classList.toggle('is-on', onTable);
      b.innerHTML = onTable ? I('x') + ' Sair do foco' : I('maximize') + ' Foco';
    } else {
      b.hidden = true;
      b.classList.remove('is-on');
    }
  }

  function exitFocus() {
    var hadBinder = document.body.classList.contains('fn-focus');
    var hadTable = document.body.classList.contains('fn-table-focus');
    if (hadBinder) {
      st.focus = false;
      LS.set('focus', false);
    }
    if (hadTable) {
      st.tableFocus = false;
      LS.set('tableFocus', false);
    }
    applyFocus();
  }
  function renderAll() { loadCur(); renderHero(); renderControls(); renderBody(); renderSide(); }

  function patchOne(n) {
    var c = findCard(n); if (!c) return;
    var kId = ck(c);
    if (st.status !== 'all') { renderBody(); renderHero(); delete progCache[st.set]; dropMultiProg(); renderSide(); return; }
    $$('[data-n="' + CSS.escape(String(kId)) + '"]', $('#fn-body')).forEach(function (el) {
      var tmp = document.createElement('div');
      if (el.matches('article.fn-card')) { tmp.innerHTML = cardHtml(c); el.replaceWith(tmp.firstChild); }
      else if (el.matches('tr')) {
        var holder = document.createElement('table');
        holder.innerHTML = isDex(st.set) ? renderTable(dexVisible()) : renderTable();
        var nr = $('tr[data-n="' + CSS.escape(String(kId)) + '"]', holder);
        if (nr) el.replaceWith(nr);
      } else {
        var ver = el.dataset.ver;
        el.className = 'fn-pocket is-' + ((ver ? has(keyOf(st.set, c, ver)) : dexOwned(c)) ? 'have' : 'miss');
        var oldBdg = el.querySelector('.fn-conds');
        if (oldBdg) oldBdg.remove();
        var bdgHtml = ver ? cardCondBadge(st.set, c, ver) : cardCondBadge(st.set, c);
        if (bdgHtml) el.insertAdjacentHTML('beforeend', bdgHtml);
      }
    });
    renderHero(); delete progCache[st.set]; dropMultiProg(); renderSide();
    var ov = $('#fn-overlay'); if (!ov.hidden && ov.dataset.detail === String(kId)) openDetail(kId, true);
  }

  // ── marcar ─────────────────────────────────────────────────
  var busy = {};
  function mark(n, ver) {
    var c = findCard(n); if (!c) return;
    var kId = ck(c);
    if (SHARE) { toast('Somente leitura: este link só mostra a coleção.'); openDetail(kId); return; }
    var key = keyOf(st.set, c, ver), totQ = totalQtyOf(key);
    if (totQ > 1) { toast('Você tem ' + totQ + ' cópias. Ajuste a quantidade no detalhe da carta.'); openDetail(kId); return; }
    if (DEMO) {
      if (demoSet.has(key)) { demoSet.delete(key); demoQty.delete(key); }
      else { demoSet.add(key); demoQty.set(key, { qty: 1, origins: [] }); }
      patchOne(kId);
      return;
    }
    if (!loggedIn()) { toast('Entre no MyDeck para marcar suas cartas.'); return; }
    if (busy[key]) return; busy[key] = true;
    var p; try { p = toggleSlot(key); } catch (e) { busy[key] = false; toast('Não foi possível marcar. Tente de novo.'); return; }
    patchOne(kId);
    Promise.resolve(p).then(function () { patchOne(kId); }, function () { toast('Não foi possível salvar. Tente de novo.'); patchOne(kId); }).then(function () { busy[key] = false; });
  }

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

  function setEntryByKey(key, qty, origins, kIdOpt) {
    if (SHARE) return;
    if (DEMO) {
      if (qty <= 0) { demoSet.delete(key); demoQty.delete(key); }
      else { demoSet.add(key); demoQty.set(key, { qty: qty, origins: origins || [] }); }
      if (kIdOpt) patchOne(kIdOpt);
      return;
    }
    if (!loggedIn()) { toast('Entre no MyDeck para salvar suas cartas.'); return; }
    if (typeof saveSlot !== 'function') { toast('Não foi possível salvar agora. Recarregue a página.'); return; }
    if (busy[key]) return; busy[key] = true;
    Promise.resolve(saveSlot(key, qty, origins || [])).then(function () {
      if (kIdOpt) patchOne(kIdOpt);
    }, function () {
      toast('Não foi possível salvar. Tente de novo.');
    }).then(function () { busy[key] = false; });
  }

  function setEntry(n, ver, qty, origins) {
    var c = findCard(n); if (!c || SHARE) return;
    var kId = ck(c), key = keyOf(st.set, c, ver);
    setEntryByKey(key, qty, origins, kId);
  }

  function verRO(id, c) {
    return '<div class="fn-vblocks">' + slotsOf(id, c).map(function (s) {
      var key = keyOf(id, c, s.ver);
      var e = entryOf(key);
      var lots = lotsOf(key);
      var totQ = totalQtyOf(key);
      var on = totQ > 0;

      var lines = [];
      if (e.qty > 0) {
        var cd0 = condOf(key);
        lines.push({ cond: cd0, qty: e.qty });
      }
      lots.forEach(function (l) {
        if ((Number(l.qty) || 0) > 0) lines.push({ cond: l.cond || '', qty: Number(l.qty) });
      });

      var detailsHtml = lines.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + lines.map(function (it) {
        var bdg = it.cond
          ? '<span class="fn-cond c-' + esc(it.cond) + '" title="' + esc(condLabel(it.cond)) + '">' + esc(it.cond) + '</span>'
          : '<span class="fn-cond c-none">Sem qualidade</span>';
        return '<span style="display:inline-flex;align-items:center;gap:4px">' + bdg + '<small>×' + it.qty + '</small></span>';
      }).join('') + '</div>' : '';

      return '<div class="fn-vb' + (on ? ' is-on' : '') + '"><div class="fn-vb-h"><span class="fn-vb-n"><b>' + esc(s.ver) + '</b>' + esc(VERSION_NAME[s.ver] || s.ver) + '</span><span class="fn-q"><output>' + (on ? ('✓ ' + (totQ > 1 ? totQ + ' cópias' : 'Tem')) : 'Falta') + '</output></span></div>' + detailsHtml + '</div>';
    }).join('') + '</div>';
  }
  function renderCondBar(curCond, extraAttrs) {
    return '<div class="fn-cond-box"><div class="fn-cond-list">' +
      CARD_CONDITIONS.map(function (q) {
        var isOn = curCond === q.code;
        return '<button type="button" class="fn-cond-btn' + (isOn ? ' is-on' : '') + '" data-act="setcond"' + extraAttrs + ' data-cond="' + esc(q.code) + '" title="' + esc(q.label) + '">' + esc(q.code) + '</button>';
      }).join('') +
      '</div></div>';
  }
  function renderOriginBar(origins, extraAttrs) {
    var curOrig = '';
    for (var i = 0; i < (origins || []).length; i++) {
      if (!isMetaOrigin(origins[i])) {
        curOrig = String(origins[i]);
        break;
      }
    }

    var seen = {};
    var options = [{ value: '', label: '— origem (sem origem) —' }];

    function addOpt(val, lbl) {
      if (val == null || val === '' || seen[val]) return;
      seen[val] = true;
      options.push({ value: String(val), label: String(lbl || val) });
    }

    try {
      (purchases || []).forEach(function (p) {
        var d = '';
        try {
          d = new Date(p.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        } catch (e) { }
        addOpt(p.product, (d ? d + ' — ' : '') + String(p.product).substring(0, 40));
      });
    } catch (e) { }

    addOpt('Troca', 'Troca');
    addOpt('Presente', 'Presente');
    addOpt('Avulso', 'Avulso (loja)');
    if (curOrig) addOpt(curOrig, curOrig);

    var activeOpt = options.filter(function (o) { return o.value === curOrig; })[0] || options[0];

    var menuHtml = options.map(function (o) {
      var isSel = o.value === activeOpt.value;
      return '<li class="origem-opcao' + (isSel ? ' is-selected' : '') + '" role="option" aria-selected="' + isSel + '" data-value="' + esc(o.value) + '"' + (extraAttrs || '') + '>' + esc(o.label) + '</li>';
    }).join('');

    return '<div class="fn-orig" style="margin-top:8px">' +
      '<div class="origem-control" data-origem-select>' +
      '<button type="button" class="origem-trigger" aria-haspopup="listbox" aria-expanded="false"' + (extraAttrs || '') + '>' +
      '<span class="origem-valor">' + esc(activeOpt.label) + '</span>' +
      '<span class="origem-chevron" aria-hidden="true">⌄</span>' +
      '</button>' +
      '<ul class="origem-menu" role="listbox" hidden>' + menuHtml + '</ul>' +
      '</div>' +
      '</div>';
  }

  function verBlocks(id, c) {
    var kId = ck(c);
    var addCopyStyle = 'padding:4px 8px;font-size:11px;line-height:1.2;width:auto;display:inline-flex;align-items:center;gap:4px;margin-top:8px';
    return '<div class="fn-vblocks">' + slotsOf(id, c).map(function (s) {
      var key = keyOf(id, c, s.ver), e = entryOf(key), lots = lotsOf(key);
      var on = e.qty > 0 || lots.length > 0;
      var at = ' data-n="' + esc(kId) + '" data-ver="' + esc(s.ver) + '"';
      var curCond = condOf(key);
      var condBar = on ? renderCondBar(curCond, at) : '';
      var origBar = on ? renderOriginBar(e.origins, at) : '';

      var extraHtml = lots.map(function (lot, idx) {
        var lotAt = at + ' data-lot="' + idx + '"';
        return '<div class="fn-vb-sub" style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(255,255,255,.14)">' +
          '<div class="fn-vb-h"><span class="fn-vb-n"><b>' + esc(s.ver) + '</b> (outra condição #' + (idx + 2) + ')</span>' +
          '<span class="fn-q">' +
          '<button type="button" data-lotqty="-1"' + lotAt + ' aria-label="Menos uma cópia">−</button>' +
          '<output aria-live="polite">' + lot.qty + '</output>' +
          '<button type="button" data-lotqty="1"' + lotAt + ' aria-label="Mais uma cópia">+</button>' +
          '<button type="button" data-dellot="1"' + lotAt + ' aria-label="Remover esta condição">×</button>' +
          '</span></div>' +
          renderCondBar(lot.cond, lotAt) +
          renderOriginBar(lot.origins, lotAt) +
          '</div>';
      }).join('');

      var addLotBtn = on
        ? '<button type="button" class="fn-btn is-alt" data-act="addlot"' + at + ' style="' + addCopyStyle + '">+1 cópia</button>'
        : '';

      return '<div class="fn-vb' + (on ? ' is-on' : '') + '"><div class="fn-vb-h"><span class="fn-vb-n"><b>' + esc(s.ver) + '</b>' + esc(VERSION_NAME[s.ver] || s.ver) + '</span>' +
        '<span class="fn-q"><button type="button" data-qty="-1"' + at + ' aria-label="Menos uma cópia">−</button><output aria-live="polite">' + e.qty + '</output><button type="button" data-qty="1"' + at + ' aria-label="Mais uma cópia">+</button></span></div>' +
        condBar +
        origBar +
        extraHtml +
        addLotBtn +
        '</div>';
    }).join('') + '</div>';
  }

  function filterLabel() { return st.status === 'have' ? '✅ Só coletadas' : st.status === 'miss' ? '🔍 Só faltantes' : '📚 Todas'; }
  function listText() {
    var id = st.set, cat = SET_CATALOG.filter(function (x) { return x.id === setKey(id); })[0] || {}, label = isCb(id) && cur.binder ? cur.binder.name : (cat.label || id), multi = isCb(id);
    var icons = (typeof TYPE_ICON !== 'undefined' && TYPE_ICON) || {}, vs = (typeof VER_SHORT !== 'undefined' && VER_SHORT) || { N: 'N', F: 'F', RH: 'RH', RH2: 'RH2', SP: '★' };
    var slotsTotal = 0, slotsCol = 0, complete = 0;
    var rows = cur.view.map(function (c) {
      var sl = slotsOf(id, c), dp = effLang(id) !== 'pt' ? priceOf(id, c, null) : ((typeof lprice === 'function') ? lprice(sidOf(id, c), c.n, c.price) : c.price);
      var parts = sl.map(function (x) {
        var k = keyOf(id, c, x.ver), on = has(k); slotsTotal++;
        if (on) { slotsCol++; var q = totalQtyOf(k); return vs[x.ver] + '✅' + (st.status === 'have' && q > 1 ? '×' + q : ''); }
        return vs[x.ver] + '❌';
      }).join(' ');
      var s = stateOf(id, c); if (s.st === 'have') complete++;
      return (s.st === 'have' ? '✅' : s.st === 'part' ? '🟡' : '❌') + ' ' + (icons[c.type || ''] || '🃏') + ' *' + c.n + '* ' + i18n(c, id).name + (c.rare ? ' _(' + rareLabel(c.rare) + ')_' : '') + (multi ? ' _(' + setLabelOf(c._set).split('—')[0].trim() + ')_' : '') + ' [' + parts + ']' + (dp ? ' — 💰 ' + money(dp) : '');
    });
    var pct = slotsTotal ? Math.round(slotsCol / slotsTotal * 100) : 0;
    var head = '🎩✨ *' + label + '* ✨🎩\n' + filterLabel() + (st.q ? ' · busca: "' + st.q + '"' : '') + '\n📅 ' + new Date().toLocaleDateString('pt-BR') + '\n━━━━━━━━━━━━━━━━━━';
    return head + '\n' + rows.join('\n') + '\n━━━━━━━━━━━━━━━━━━\n📦 Cartas completas: *' + complete + '/' + rows.length + '*\n🎯 Versões (master set): *' + slotsCol + '/' + slotsTotal + '* (' + pct + '%)';
  }
  function openActions() {
    var n = cur.view.length;
    if (isDex(st.set)) {
      var nv = dexVisible().length;
      var isReg = cur.binder && isRegionalDexBinder(cur.binder);
      var dexDelBtn = cur.binder
        ? '<button type="button" class="fn-act" data-act="dexaskdelete" data-bid="' + esc(cur.binder.id) + '"><span class="em">' + I('trash', 20) + '</span><span><b>' + (isReg ? 'Excluir região' : 'Excluir Pokédex') + '</b><small>Remove esta Pokédex (as suas coleções normais e as cartas escolhidas não são apagadas)</small></span></button>'
        : '';
      openSheet('<div class="fn-acts">' +
        '<button type="button" class="fn-act" data-act="share"><span class="em">' + I('link', 20) + '</span><span><b>Compartilhar Pokédex</b><small>Link e QR code só para ver; as vagas que faltam aparecem com a arte do Pokémon</small></span></button>' +
        '<button type="button" class="fn-act" data-act="copy"><span class="em">' + I('clipboard', 20) + '</span><span><b>Copiar lista (texto)</b><small>' + nv + ' espécie' + (nv === 1 ? '' : 's') + ' como estão na tela, com ✅ e ❌, pronto para colar no WhatsApp</small></span></button>' +
        '<button type="button" class="fn-act" data-act="dexfill"><span class="em">' + I('sparkles', 20) + '</span><span><b>Preencher vagas vazias</b><small>Escolhe uma carta para cada vaga sem carta (a mais valiosa que você tem, ou a mais barata). Não mexe nas que você já escolheu</small></span></button>' +
        dexDelBtn + extraTools() + '</div>', 'Ferramentas');
      return;
    }
    if (isPk(st.set)) {
      openSheet('<div class="fn-acts"><button type="button" class="fn-act" data-act="pkedit"><span class="em">' + I('pencil', 20) + '</span><span><b>Editar posições</b><small>Escolher, trocar e tirar cartas das vagas, e adicionar páginas</small></span></button>' +
        '<button type="button" class="fn-act" data-act="share"><span class="em">' + I('link', 20) + '</span><span><b>Compartilhar fichário</b><small>Gera um link (e QR code) só para ver, sem precisar de login</small></span></button>' +
        '<button type="button" class="fn-act" data-act="cbedit"><span class="em">' + I('settings', 20) + '</span><span><b>Nome / excluir</b><small>Renomear ou excluir este fichário</small></span></button>' + extraTools() + '</div>', 'Ferramentas');
      return;
    }
    if (isCb(st.set)) {
      var cbm = cur.binder && cbType(cur.binder) === 'manual';
      openSheet('<div class="fn-acts">' +
        (cbm ? '<button type="button" class="fn-act" data-act="cbadd"><span class="em">' + MD_ICO('plus', { size: 18 }) + '</span><span><b>Adicionar cartas</b><small>Busque no catálogo inteiro e guarde neste fichário</small></span></button>' : '') +
        '<button type="button" class="fn-act" data-act="share"><span class="em">' + I('link', 20) + '</span><span><b>Compartilhar fichário</b><small>Gera um link (e QR code) só para ver, sem precisar de login</small></span></button>' +
        '<button type="button" class="fn-act" data-act="copy"><span class="em">' + I('clipboard', 20) + '</span><span><b>Copiar lista (texto)</b><small>' + n + ' carta' + (n === 1 ? '' : 's') + ' como estão na tela, pronto para colar no WhatsApp</small></span></button>' +
        '<button type="button" class="fn-act" data-act="print"><span class="em">' + I('printer', 20) + '</span><span><b>Imprimir PDF</b><small>Fichário em páginas, no tamanho escolhido</small></span></button>' +
        '<button type="button" class="fn-act" data-act="bulk"><span class="em">' + I('check', 20) + '</span><span><b>Marcar várias de uma vez</b><small>Marca como coletadas as cartas visíveis deste fichário</small></span></button>' +
        '<button type="button" class="fn-act" data-act="cbedit"><span class="em">' + I('pencil', 20) + '</span><span><b>Editar fichário</b><small>Nome, cor ou excluir</small></span></button>' + extraTools() + '</div>', 'Ferramentas');
      return;
    }
    openSheet('<div class="fn-acts">' +
      '<button type="button" class="fn-act" data-act="share"><span class="em">' + I('link', 20) + '</span><span><b>Compartilhar coleção</b><small>Gera um link (e QR code) só para ver, sem precisar de login</small></span></button>' +
      '<button type="button" class="fn-act" data-act="copy"><span class="em">' + I('clipboard', 20) + '</span><span><b>Copiar lista (texto)</b><small>' + n + ' carta' + (n === 1 ? '' : 's') + ' como estão na tela, pronto para colar no WhatsApp</small></span></button>' +
      '<button type="button" class="fn-act" data-act="print"><span class="em">' + I('printer', 20) + '</span><span><b>Imprimir PDF</b><small>Fichário em páginas, no tamanho escolhido</small></span></button>' +
      '<button type="button" class="fn-act" data-act="bulk"><span class="em">' + I('check', 20) + '</span><span><b>Marcar várias de uma vez</b><small>Base set, secretas, tudo ou uma raridade: marca como coletadas as cartas visíveis (dá para desfazer)</small></span></button>' + extraTools() +
      '</div>', 'Ferramentas');
  }
  function extraTools() {
    return '<button type="button" class="fn-act" data-act="progcard"><span class="em">' + I('image', 20) + '</span><span><b>Cartão de progresso (imagem)</b><small>Uma imagem com a sua porcentagem, para mandar no grupo</small></span></button>' +
      '<button type="button" class="fn-act" data-act="artists"><span class="em">' + I('palette', 20) + '</span><span><b>Meus artistas</b><small>Quantas cartas você tem de cada ilustrador, e criar um fichário por artista</small></span></button>';
  }
  var shareUrl = '';
  function doShare() {
    if (DEMO) { toast('Compartilhar não funciona no modo demonstração.'); return; }
    if (!loggedIn()) { toast('Entre no MyDeck para gerar um link de compartilhamento.'); return; }
    shareUrl = '';
    var cat = SET_CATALOG.filter(function (x) { return x.id === setKey(st.set); })[0] || {};
    var dx = isDex(st.set) || isCb(st.set) || isPk(st.set);
    if (dx && (!cur.binder || cur.pending > 0)) { toast(cur.binder ? 'Ainda carregando todas as coleções. Tente de novo em instantes.' : 'Seu fichário ainda não carregou.'); return; }
    if ((isCb(st.set) || isPk(st.set)) && !cur.cards.length) { toast('Este fichário ainda não tem cartas. Adicione cartas antes de compartilhar.'); return; }
    var ln = (!dx && langSfx(st.set)) ? '<br>Este link mostra a coleção em <b>' + ({ en: 'inglês', jp: 'japonês', cn: 'chinês' }[effLang(st.set)] || '') + '</b>, com as marcações desse idioma.' : '';
    openSheet('<div class="fn-form"><p class="fn-note"><b>' + esc(dx ? cur.binder.name : (cat.label || st.set)) + '</b><br>Quem abrir o link vê sua coleção marcada, somente leitura. Mostra o que você tem agora.' + ln + '</p>' +
      (dx ? '' : '<label>Como mostrar<select id="fn-share-mode"><option value="grid">Grade</option><option value="binder"' + (st.view === 'binder' ? ' selected' : '') + '>Fichário (páginas)</option></select></label>') +
      '<button type="button" class="fn-btn" id="fn-share-go" data-act="sharerun">' + I('link', 14) + ' Gerar link e QR code</button>' +
      '<div id="fn-share-out" hidden><input id="fn-share-url" type="text" readonly aria-label="Link"><canvas id="fn-share-qr" width="220" height="220"></canvas>' +
      '<button type="button" class="fn-btn" data-act="sharecopy">' + I('clipboard', 14) + ' Copiar link</button><button type="button" class="fn-btn is-alt" data-act="sharewa">' + I('message', 14) + ' Enviar pelo WhatsApp</button></div></div>', 'Compartilhar coleção');
  }
  async function runShare() {
    var go = $('#fn-share-go'); if (!go) return; go.disabled = true; go.textContent = 'Gerando…';
    var mode = ($('#fn-share-mode') || {}).value === 'binder' ? 'binder' : 'grid';
    var layout = { '4': 2, '9': 3, '12': 7, '16': 4, '20b': 6 }[String(st.pocket)] || 3;
    try {
      var payload = isDex(st.set)
        ? { user_id: uid(), view_mode: 'grid', layout: layout, card_ids: dexShareRefs(), binder_name: cur.binder.name }
        : (isCb(st.set) || isPk(st.set)) ? { user_id: uid(), view_mode: 'grid', layout: layout, card_ids: cbRefs(), binder_name: cur.binder.name }
          : { user_id: uid(), set_key: setKey(st.set) + langSfx(st.set), view_mode: mode, layout: layout };
      var r = await sbClient.from('binder_shares').insert(payload).select('token').single();
      if (r.error || !r.data) throw new Error('x');
      shareUrl = new URL('?s=' + r.data.token, location.href).href;
      $('#fn-share-url').value = shareUrl; $('#fn-share-out').hidden = false; go.hidden = true;
      var qr = $('#fn-share-qr'); if (qr && window.QRCode) QRCode.toCanvas(qr, shareUrl, { width: 220, margin: 1, color: { dark: '#1c1f2e', light: '#ffffff' } }, function () { });
      else if (qr) qr.hidden = true;
    } catch (e) { go.disabled = false; go.innerHTML = I('link') + ' Gerar link e QR code'; toast('Não foi possível gerar o link. Tente de novo.'); }
  }
  function copyShare() {
    var inp = $('#fn-share-url'); if (!inp || !inp.value) return;
    var done = function () { toast('Link copiado!'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done, function () { inp.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Selecione o link e copie.'); } });
    else { inp.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Selecione o link e copie.'); } }
  }
  function waShare() {
    if (!shareUrl) return; var cat = SET_CATALOG.filter(function (x) { return x.id === setKey(st.set); })[0] || {};
    window.open('https://wa.me/?text=' + encodeURIComponent('Minha coleção ' + ((isDex(st.set) || isCb(st.set) || isPk(st.set)) && cur.binder ? cur.binder.name : (cat.label || '')) + ' no MyDeck: ' + shareUrl), '_blank', 'noopener');
  }
  function doCopy() {
    var t = isDex(st.set) ? dexListText() : listText();
    openSheet('<div class="fn-form"><label>Lista pronta<textarea id="fn-copytxt" readonly>' + esc(t) + '</textarea></label><button type="button" class="fn-btn" data-act="copyrun">' + I('clipboard', 14) + ' Copiar</button></div>', 'Copiar lista');
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
    var code = { '4': 2, '9': 3, '12': 7, '16': 4, '20b': 6 }[String(st.pocket)] || 3;
    try { ficBinderSize = code; if (typeof loadCollection === 'function') loadCollection(); } catch (e) { }
    var cat = SET_CATALOG.filter(function (x) { return x.id === setKey(st.set); })[0] || {};
    closeSheet();
    var only = st.status === 'miss' ? 'missing' : st.status === 'have' ? 'collected' : undefined;
    try {
      if (isCb(st.set)) Promise.resolve(printBinder(cur.view.map(function (c) { return Object.assign({}, c, { _setId: c._set }); }), function (c) { return c._setId; }, cur.binder.name, only));
      else Promise.resolve(printBinder(cur.view.slice(), function () { return st.set; }, (cat.label || st.set) + (langSfx(st.set) ? ' (' + effLang(st.set).toUpperCase() + ')' : ''), only, { keySetOf: function () { return st.set + langSfx(st.set); }, lang: effLang(st.set) }));
    } catch (e) { toast('Não foi possível gerar o PDF.'); }
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
    if (nBase && nSec) opts += '<option value="g:base">Base set inteiro' + pl(nBase) + '</option><option value="g:sec">Secretas' + pl(nSec) + '</option>';
    opts += '<option value="g:all">Tudo que está na tela' + pl(cur.view.length) + '</option>';
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
    if (DEMO) { keys.forEach(function (k) { demoSet.add(k); }); closeSheet(); renderAll(); bulkDone(keys, keys.length, false); return; }
    if (!loggedIn()) { toast('Entre no MyDeck para marcar suas cartas.'); closeSheet(); return; }
    var done = 0, failed = false, okKeys = [];
    for (var i = 0; i < keys.length; i += 50) {
      var chunk = keys.slice(i, i + 50);
      chunk.forEach(function (k) { collected.add(k); collectedQty.set(k, { qty: 1, origins: [] }); });
      var res; try { res = await sbClient.from('collection').upsert(chunk.map(function (k) { return { slot_key: k, user_id: uid(), quantity: 1, origins: [] }; }), { onConflict: 'user_id,slot_key' }); } catch (e) { res = { error: e }; }
      if (res && res.error) { chunk.forEach(function (k) { collected.delete(k); collectedQty.delete(k); }); failed = true; console.error(res.error); break; }
      done += chunk.length; okKeys = okKeys.concat(chunk); if (go) go.textContent = 'Marcando… ' + done + '/' + keys.length;
    }
    closeSheet(); progCache = {}; renderAll();
    bulkDone(okKeys, keys.length, failed);
  }
  var lastBulk = null;
  function bulkDone(okKeys, total, failed) {
    lastBulk = okKeys.slice();
    if (!okKeys.length) { toast('Não foi possível marcar. Tente de novo.'); return; }
    openSheet('<div class="fn-form"><p class="fn-note"><b>' + okKeys.length + (okKeys.length === 1 ? ' versão marcada' : ' versões marcadas') + ' como coletadas.</b>' + (failed ? '<br>Houve um erro e só marquei ' + okKeys.length + ' de ' + total + '. Você pode tentar de novo.' : '') +
      '<br>Se foi sem querer, dá para desfazer agora: só tira o que esta marcação adicionou.</p>' +
      '<button type="button" class="fn-btn is-alt" data-act="bulkundo">' + I('undo', 14) + ' Desfazer esta marcação</button><button type="button" class="fn-btn" data-close>Fechar</button></div>', 'Marcação concluída');
  }
  async function runUndoBulk() {
    var keys = lastBulk || []; if (!keys.length) { closeSheet(); return; }
    var btn = $('#fn-overlay [data-act="bulkundo"]'); if (btn) { btn.disabled = true; btn.textContent = 'Desfazendo…'; }
    if (DEMO) { keys.forEach(function (k) { demoSet.delete(k); demoQty.delete(k); }); lastBulk = null; closeSheet(); progCache = {}; renderAll(); toast('Marcação desfeita.'); return; }
    if (!loggedIn()) { closeSheet(); return; }
    var removed = [], failed = false;
    for (var i = 0; i < keys.length; i += 50) {
      var chunk = keys.slice(i, i + 50), res;
      try { res = await sbClient.from('collection').delete().eq('user_id', uid()).in('slot_key', chunk); } catch (e) { res = { error: e }; }
      if (res && res.error) { failed = true; console.error(res.error); break; }
      chunk.forEach(function (k) { collected.delete(k); collectedQty.delete(k); }); removed = removed.concat(chunk);
    }
    lastBulk = failed ? keys.filter(function (k) { return removed.indexOf(k) < 0; }) : null;
    closeSheet(); progCache = {}; renderAll();
    toast(failed ? 'Desfiz ' + removed.length + ' de ' + keys.length + '. Houve um erro.' : 'Marcação desfeita (' + removed.length + (removed.length === 1 ? ' versão' : ' versões') + ').');
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
    var id = st.set, kId = ck(c), info = i18n(c, id), r = rareCls(c.rare), title = info.name + ' · #' + c.n;
    var sub = [rareLabel(c.rare), c.type, c.artist ? 'ilustração: ' + c.artist : ''].filter(Boolean).join(' · ');

    var isManualBinder = isCb(id) && cur.binder && cbType(cur.binder) === 'manual';
    var isDexBinder = isDex(id) && cur.binder && c._dex != null;
    var canRemoveFromBinder = isManualBinder || isDexBinder;

    var favBtnHtml = '<button type="button" class="fn-btn is-alt" data-act="favtoggle" data-n="' + esc(kId) + '">' +
      (isFav(c) ? I('star', 14, { fill: true }) + ' Favorita — toque para tirar' : I('star') + ' Favoritar') +
    '</button>';

    var secondaryBtnHtml = canRemoveFromBinder
      ? '<button type="button" class="fn-btn is-alt" data-act="binderremove" data-n="' + esc(kId) + '"' +
          (isDexBinder ? ' data-dex="' + esc(c._dex) + '"' : '') + '>' +
          I('trash', 14) + ' Tirar deste fichário' +
        '</button>'
      : '<button type="button" class="fn-btn is-alt" data-act="cbmember" data-n="' + esc(kId) + '">' +
          I('folder', 14) + ' Guardar em fichário…' +
        '</button>';

    var detailActionsHtml = (!SHARE && (loggedIn() || DEMO))
      ? '<div class="fn-dexact">' + favBtnHtml + secondaryBtnHtml + '</div>'
      : '';

    var html = '<div class="fn-detail">' +
      '<div class="fn-detail-top">' +
        '<div class="fn-detail-img"><img alt="' + esc(info.name) + '" src="' + esc(imgSrc(cur.d, id, c, true)) + '"></div>' +
        '<div class="fn-detail-info">' +
          '<h4>' + esc(info.name) + '</h4>' +
          '<p>' + (sub ? '<span class="' + r + '">' + esc(sub) + '</span><br>' : '') +
            'Preço de referência: <b>' + esc(priceFmt(c, id)) + '</b>' +
            (isCb(id) ? '<br>Coleção: <b>' + esc(setLabelOf(c._set)) + '</b>' : '') +
          '</p>' +
        '</div>' +
      '</div>' +
      (SHARE ? verRO(id, c) : verBlocks(id, c)) +
      detailActionsHtml +
      (!SHARE && isDex(id) && c._dex ? '<div class="fn-dexact"><p class="fn-note">Vaga #' + c._dex + ' da Pokédex · ' + esc(setLabelOf(c._set).split('—')[0].trim()) + '</p><button type="button" class="fn-btn is-alt" data-dexpick="' + c._dex + '">' + I('repeat', 14) + ' Trocar a carta desta vaga</button></div>' : '') +
    '</div>';

    if (keep) {
      var b = $('#fn-overlay .fn-sheet-b');
      if (b) {
        b.innerHTML = html;
        var h3 = $('#fn-overlay .fn-sheet-h h3'); if (h3) h3.textContent = title;
        var shKeep = $('#fn-overlay .fn-sheet'); if (shKeep) shKeep.classList.add('fn-sheet-detail');
        return;
      }
    }
    openSheet(html, title, function (ov) {
      ov.dataset.detail = String(kId);
      var sh = ov.querySelector('.fn-sheet');
      if (sh) sh.classList.add('fn-sheet-detail');
    });
    $('#fn-overlay').dataset.detail = String(kId);
  }

  // ── navegação por blocos (eras) e expansões ──────────────
  var progCache = {};
  function progOf(id) {
    var cacheKey = id + ':' + st.progMode;
    if (progCache[cacheKey] !== undefined) return progCache[cacheKey];
    var d = setData(id); if (!d || !d.cards || !d.cards.length) return null;
    var tot = 0, got = 0;
    if (st.progMode === 'cards') {
      d.cards.forEach(function (c) {
        tot++;
        if (slotsOf(id, c).some(function (x) { return has(keyOf(id, c, x.ver)); })) got++;
      });
    } else {
      d.cards.forEach(function (c) { slotsOf(id, c).forEach(function (x) { tot++; if (has(keyOf(id, c, x.ver))) got++; }); });
    }
    return (progCache[cacheKey] = tot ? { got: got, tot: tot, pct: Math.round(got / tot * 100) } : null);
  }
  function seriesOrder() {
    var meta = (typeof SERIES_META !== 'undefined' && SERIES_META) || {}, keys = Object.keys(meta);
    SET_CATALOG.forEach(function (s) { var k = s.series || 'Outros'; if (keys.indexOf(k) < 0) keys.push(k); });
    return keys;
  }
  function blockTitle(k) {
    var meta = (typeof SERIES_META !== 'undefined' && SERIES_META && SERIES_META[k]) || null;
    return plainName(meta ? (meta.sub || meta.t) : (GROUP_NAME[k] || k));
  }
function openBlocks() {
  var v = LS.get('open', null);
  if (v) return v;
  if (isHome(st.set)) return ['__cb', '__dex'];
  return [(SET_CATALOG.filter(function (s) { return s.id === st.set; })[0] || {}).series];
}
  function treeHtml() {
    var open = openBlocks(), by = {};
    SET_CATALOG.forEach(function (s) { (by[s.series || 'Outros'] = by[s.series || 'Outros'] || []).push(s); });
    var html = seriesOrder().filter(function (k) { return by[k] && by[k].length; }).map(function (k) {
      var sets = by[k], got = 0, tot = 0;
      var rows = sets.map(function (s) {
        var p = progOf(s.id); if (p) { got += p.got; tot += p.tot; }
        var nm = (s.label || '').split('—').slice(1).join('—').trim() || s.label, code = (s.label || '').split('—')[0].trim();
        return '<button type="button" class="fn-set' + (s.id === setKey(st.set) ? ' is-cur' : '') + '" data-pick="' + esc(s.id) + '" data-find="' + esc((nm + ' ' + code).toLowerCase()) + '">' +
          '<span class="em has-ico">' + setIco(s.id, s.emoji) + '</span><span class="tx"><b>' + esc(nm) + '</b><small>' + esc(code) + (s.upcoming ? ' · em breve' : '') + '</small>' +
          (p ? '<div class="mini"><i style="width:' + p.pct + '%"></i></div>' : '') + '</span>' +
          '<span class="pc' + (p && p.pct ? '' : ' z') + '">' + (p ? p.pct + '%' : '—') + '</span></button>';
      }).join('');
      var isOpen = open.indexOf(k) >= 0, bp = tot ? Math.round(got / tot * 100) : null;
      return '<section class="fn-blk' + (isOpen ? ' is-open' : '') + '" data-blk-id="' + esc(k) + '">' +
        '<button type="button" class="fn-blk-h" data-blk="' + esc(k) + '" aria-expanded="' + isOpen + '"><span class="ch">▸</span><span class="t">' + esc(blockTitle(k)) + '</span>' +
        '<span class="n">' + (bp != null ? '<b>' + bp + '%</b> · ' : '') + sets.length + '</span></button><div class="fn-blk-b">' + rows + '</div></section>';
    }).join('');
    var homeRow = '<button type="button" class="fn-set fn-home-row' + (isHome(st.set) ? ' is-cur' : '') + '" data-pick="home" data-find="meus fichários personalizados início home"><span class="em">' + MD_ICO('home', { size: 18 }) + '</span><span class="tx"><b>Meus fichários</b><small>Visão geral</small></span></button>';
    return homeRow + cbTreeHtml() + dexTreeHtml() + artTreeHtml() + (html || '<div class="fn-tree-empty">Nenhuma coleção encontrada.</div>');
  }
  function sideHtml() { return '<input class="fn-tsearch" type="search" placeholder="Buscar coleção…" autocomplete="off" aria-label="Buscar coleção"><div class="fn-tree">' + treeHtml() + '</div>'; }
  function renderSide() {
    var side = $('#fn-side'); if (!side) return;
    if (!$('.fn-tsearch', side)) side.innerHTML = sideHtml(); else $('.fn-tree', side).innerHTML = treeHtml();
    applyTreeFilter(side);
    var cur = $('.fn-set.is-cur', side);
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
    if (!isPk(id) || String(id) !== String(st.set)) pkEdit = false;
    pkSpecies = false;
    dexLimit = 300; st.set = id; st.q = ''; st.status = 'all'; st.bpage = 0; st.artist = ''; if (SET_CATALOG.some(function (x) { return x.id === id; })) LS.set('set', id);
    try { history.replaceState(null, '', '#' + id); } catch (e) { }
    $('#fn-q').value = '';
    var langs = langsOf(id); if (langs && langs.indexOf(st.lang) < 0) st.lang = 'en';
    var bObj = isCb(id) ? cbBinder(id) : null;
    var ser = isDex(id) ? '__dex'
      : isPk(id) ? '__cb'
        : bObj ? (cbType(bObj) === 'artist' ? '__art' : '__cb')
          : (SET_CATALOG.filter(function (x) { return x.id === setKey(id); })[0] || {}).series;
    var ob = openBlocks();
    if (ser && ob.indexOf(ser) < 0) { ob.push(ser); LS.set('open', ob); }
    closeSheet(); renderAll(); window.scrollTo({ top: 0 });
  }

  // ── avisos ─────────────────────────────────────────────────
  var toastT;
  function toast(msg) { var t = $('#fn-toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200); }
  function banner() {
    var b = $('#fn-banner');
    if (SHARE) { b.hidden = false; b.innerHTML = '<b>Coleção compartilhada</b> — somente leitura. Mostra o que a pessoa tinha quando gerou o link. <a href="./">Entrar no MyDeck</a>'; return; }
    if (DEMO) { b.hidden = false; b.innerHTML = '<b>Modo demonstração</b> — coleção fictícia só nesta tela. Nada é salvo.'; return; }
    if (!loggedIn()) { b.hidden = false; b.innerHTML = 'Você ainda não entrou. <a href="./">Entre no MyDeck</a> e volte aqui para ver e marcar a sua coleção.'; }
    else b.hidden = true;
    var u = $('#fn-user'); try { var cu = currentUser; u.textContent = cu ? ((cu.user_metadata && (cu.user_metadata.name || cu.user_metadata.full_name)) || (cu.email || '').split('@')[0]) : ''; } catch (e) { }
  }

  // ── helper origem ──────────────────────────────────────────
  function applyOriginValue(dataset, chosenVal) {
    var cSel = findCard(dataset.n);
    if (!cSel) return;
    var val = chosenVal || '';
    if (dataset.lot != null) {
      var kLotO = keyOf(st.set, cSel, dataset.ver);
      var listO = lotsOf(kLotO);
      var idxO = Number(dataset.lot);
      if (listO[idxO]) {
        listO[idxO].origins = val ? [val] : [];
        saveLots(kLotO, listO);
        patchOne(ck(cSel));
      }
    } else {
      var kBase = keyOf(st.set, cSel, dataset.ver);
      var eBase = entryOf(kBase);
      var meta = parseOriginsMeta(eBase.origins);
      var nextOrigins = buildOriginsMeta(val ? [val] : [], meta.cond, meta.lots);
      setEntry(dataset.n, dataset.ver, Math.max(1, eBase.qty), nextOrigins);
    }
  }

  function closeAllOriginMenus() {
    $$('.origem-menu').forEach(function (m) { m.hidden = true; });
    $$('.origem-trigger').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }

  // ── eventos ────────────────────────────────────────────────
  var qT;
  function bind() {
    $('#fn-q').addEventListener('input', function (e) { clearTimeout(qT); var v = e.target.value; qT = setTimeout(function () { st.q = v; st.bpage = 0; renderBody(); }, 120); });
    $$('.fn-chip[data-status]').forEach(function (b) { b.addEventListener('click', function () { st.status = b.dataset.status; st.bpage = 0; renderControls(); renderBody(); }); });
    $$('#fn-lang button').forEach(function (b) { b.addEventListener('click', function () { setLang(b.dataset.lang); }); });
    $('#fn-sort').addEventListener('change', function (e) { st.sort = e.target.value; renderBody(); });
    $$('#fn-view button').forEach(function (b) { b.addEventListener('click', function () { st.view = b.dataset.view; LS.set('view', st.view); renderControls(); renderBody(); }); });
    $('#fn-cols-minus').addEventListener('click', function () { st.cols = Math.max(2, st.cols - 1); LS.set('cols', st.cols); renderControls(); });
    $('#fn-cols-plus').addEventListener('click', function () { st.cols = Math.min(10, st.cols + 1); LS.set('cols', st.cols); renderControls(); });
    $('#fn-setbtn').addEventListener('click', openDrawer);
    $('#fn-more').addEventListener('click', openActions);
    $('#fn-focus').addEventListener('click', function () {
      if (st.view === 'table') {
        st.tableFocus = !st.tableFocus;
        LS.set('tableFocus', st.tableFocus);
        applyFocus();
        window.scrollTo({ top: 0 });
        if (st.tableFocus) toast('Modo foco na tabela: pressione Esc para sair.');
      } else {
        st.focus = !st.focus;
        LS.set('focus', st.focus);
        applyFocus();
        window.scrollTo({ top: 0 });
        if (st.focus) toast('Modo foco: use as setas ← → para trocar de página e Esc para sair.');
      }
    });
    window.addEventListener('resize', applyFocus);
    $('#fn-artist').addEventListener('change', function (e) { st.artist = e.target.value; st.bpage = 0; renderBody(); });
    $('#fn-theme').addEventListener('click', function () {
      var n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', n); try { localStorage.setItem('mydeck-theme', n); } catch (e) { }
    });

    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('fn-focus') && !document.body.classList.contains('fn-table-focus')) return;
      var homeLink = e.target && e.target.closest ? e.target.closest('a[href="./"], a[href="index.html"], a[href="/"], #fn-home, .fn-brand, .fn-logo') : null;
      if (!homeLink) return;
      e.preventDefault();
      e.stopPropagation();
      exitFocus();
    }, true);

    document.addEventListener('click', function (e) {
      // 1. Tratamento do dropdown customizado de origem
      var origTrigger = e.target.closest ? e.target.closest('.origem-trigger') : null;
      var origOpcao = e.target.closest ? e.target.closest('.origem-opcao') : null;

      if (origTrigger) {
        e.preventDefault();
        e.stopPropagation();
        var box = origTrigger.closest('.origem-control');
        var menu = box ? box.querySelector('.origem-menu') : null;
        var willOpen = menu ? menu.hidden : false;

        closeAllOriginMenus();

        if (menu && willOpen) {
          menu.hidden = false;
          origTrigger.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      if (origOpcao) {
        e.preventDefault();
        e.stopPropagation();
        var boxOp = origOpcao.closest('.origem-control');
        var menuOp = boxOp ? boxOp.querySelector('.origem-menu') : null;
        var trigOp = boxOp ? boxOp.querySelector('.origem-trigger') : null;
        var chosenVal = origOpcao.dataset.value != null ? origOpcao.dataset.value : '';
        var chosenLabel = (origOpcao.textContent || '').trim() || '— origem (sem origem) —';

        if (menuOp) menuOp.hidden = true;
        if (trigOp) {
          trigOp.setAttribute('aria-expanded', 'false');
          var lblEl = trigOp.querySelector('.origem-valor');
          if (lblEl) lblEl.textContent = chosenLabel;
        }

        applyOriginValue(origOpcao.dataset, chosenVal);
        return;
      }

      if (!e.target.closest || !e.target.closest('.origem-control')) {
        closeAllOriginMenus();
      }

      async function removeFromCurrentBinder(n, dexNum) {
        var c = findCard(n);
        if (!c || !cur.binder || cbBusy || dexBusy) return;
        if (!DEMO && !loggedIn()) {
          toast('Entre no MyDeck para alterar seus fichários.');
          return;
        }

        var id = st.set;
        var b = cur.binder;

        if (isDex(id)) {
          var d = dexNum != null && dexNum !== '' ? Number(dexNum) : Number(c._dex);
          if (!d) return;
          dexBusy = true;
          try {
            var idsDex = (b.card_ids || []).filter(function (r) {
              return Number(r.dex) !== d;
            });
            var nb = Object.assign({}, b, { card_ids: idsDex });
            if (!DEMO) {
              var savedDex = await saveCustomBinder(nb);
              if (!savedDex) {
                toast('Não foi possível salvar. Tente de novo.');
                return;
              }
              var idxB = (customBinders || []).findIndex(function (x) { return String(x.id) === String(b.id); });
              if (idxB >= 0) customBinders[idxB] = nb;
            } else if (Array.isArray(demoBinders) && demoBinders[0]) {
              demoBinders[0] = nb;
            }
            closeSheet();
            progCache = {};
            loadCur();
            renderHero();
            renderBody();
            renderSide();
            toast('Carta removida da vaga da Pokédex.');
          } finally {
            dexBusy = false;
          }
          return;
        }

        if (isCb(id) && cbType(b) === 'manual') {
          cbBusy = true;
          try {
            var sid = sidOf(id, c);
            var nextIds = (b.card_ids || []).filter(function (r) {
              return !(r.set === sid && String(r.n) === String(c.n));
            });
            var savedCb = await cbSave(Object.assign({}, b, { card_ids: nextIds }));
            if (!savedCb) {
              toast('Não foi possível salvar. Tente de novo.');
              return;
            }
            closeSheet();
            dropMultiProg();
            refreshAfterCb();
            toast('Carta tirada de “' + plainName(b.name) + '”.');
          } finally {
            cbBusy = false;
          }
        }
      }

      // 2. Tratamento dos demais controles da interface
      var t = e.target.closest('[data-mark],[data-open],[data-pick],[data-close],[data-bnav],[data-pocket],[data-blk],[data-qty],[data-act],[data-dexpick],[data-progmode],[data-lotqty],[data-dellot]');
      if (!t) { if (e.target.id === 'fn-overlay') closeSheet(); return; }
      if (t.dataset.progmode != null) { st.progMode = t.dataset.progmode; LS.set('progMode', st.progMode); progCache = {}; renderHero(); renderSide(); if (isHome(st.set)) renderBody(); return; }
      if (t.dataset.mark != null) { e.preventDefault(); mark(t.dataset.mark, t.dataset.ver); }
      else if (t.dataset.open != null) openDetail(t.dataset.open);
      else if (t.dataset.dexpick != null) { if (!SHARE) openDexPicker(Number(t.dataset.dexpick)); }
      else if (t.dataset.qty != null) {
        var cc = findCard(t.dataset.n);
        if (cc) {
          var kQty = keyOf(st.set, cc, t.dataset.ver), ee = entryOf(kQty), q = Math.max(0, ee.qty + Number(t.dataset.qty));
          var metaQ = parseOriginsMeta(ee.origins);
          if (q === 0 && metaQ.lots.length > 0) {
            var promoted = metaQ.lots.shift();
            var nextOrig = buildOriginsMeta(promoted.origins, promoted.cond, metaQ.lots);
            setEntry(t.dataset.n, t.dataset.ver, promoted.qty, nextOrig);
          } else {
            var nextOrigQ = q > 0 ? buildOriginsMeta(metaQ.plain, metaQ.cond, metaQ.lots) : [];
            setEntry(t.dataset.n, t.dataset.ver, q, nextOrigQ);
          }
        }
      }
      else if (t.dataset.lotqty != null) {
        var cLot = findCard(t.dataset.n);
        if (cLot) {
          var kLot = keyOf(st.set, cLot, t.dataset.ver);
          var list = lotsOf(kLot);
          var idx = Number(t.dataset.lot);
          if (list[idx]) {
            var nq = list[idx].qty + Number(t.dataset.lotqty);
            if (nq <= 0) list.splice(idx, 1);
            else list[idx].qty = nq;
            saveLots(kLot, list);
            patchOne(ck(cLot));
          }
        }
      }
      else if (t.dataset.dellot != null) {
        var cDel = findCard(t.dataset.n);
        if (cDel) {
          var kDel = keyOf(st.set, cDel, t.dataset.ver);
          var listDel = lotsOf(kDel);
          listDel.splice(Number(t.dataset.lot), 1);
          saveLots(kDel, listDel);
          patchOne(ck(cDel));
        }
      }
      else if (t.dataset.act) {
        var a = t.dataset.act;
        if (a === 'addlot') {
          var cAdd = findCard(t.dataset.n);
          if (cAdd) {
            var kAdd = keyOf(st.set, cAdd, t.dataset.ver);
            var eAdd = entryOf(kAdd);
            var metaAdd = parseOriginsMeta(eAdd.origins);
            metaAdd.lots.push({ qty: 1, cond: '', origins: [] });
            var nextOrigAdd = buildOriginsMeta(metaAdd.plain, metaAdd.cond, metaAdd.lots);
            setEntry(t.dataset.n, t.dataset.ver, Math.max(1, eAdd.qty), nextOrigAdd);
          }
        }
        else if (a === 'setcond') {
          if (t.dataset.lot != null) {
            var cSc = findCard(t.dataset.n);
            if (cSc) {
              var kSc = keyOf(st.set, cSc, t.dataset.ver);
              var lSc = lotsOf(kSc);
              var iSc = Number(t.dataset.lot);
              if (lSc[iSc]) {
                lSc[iSc].cond = lSc[iSc].cond === t.dataset.cond ? '' : t.dataset.cond;
                saveLots(kSc, lSc);
                patchOne(ck(cSc));
              }
            }
          } else {
            setCondSync(t.dataset.n, t.dataset.ver, t.dataset.cond);
          }
        }
        else if (a === 'share') doShare();
        else if (a === 'sharerun') runShare();
        else if (a === 'sharecopy') copyShare();
        else if (a === 'sharewa') waShare();
        else if (a === 'copy') doCopy();
        else if (a === 'copyrun') runCopy();
        else if (a === 'print') doPrint();
        else if (a === 'bulk') doBulk();
        else if (a === 'bulkrun') runBulk();
        else if (a === 'bulkundo') runUndoBulk();
        else if (a === 'progcard') progressCard();
        else if (a === 'dexmore') { dexLimit += 300; renderBody(); }
        else if (a === 'dexnew') openDexNew();
        else if (a === 'dexcreate') dexCreate(t.dataset.kind);
        else if (a === 'dexchoose') dexAssign(Number(t.dataset.dex), t.dataset.dset, t.dataset.dn);
        else if (a === 'dexclear') dexAssign(Number(t.dataset.dex), null, null);
        else if (a === 'dexfill') dexAutoFill();
        else if (a === 'dexaskdelete') askDexDelete(t.dataset.bid);
        else if (a === 'dexdelete') dexDelete(t.dataset.bid);
        else if (a === 'favtoggle') toggleFav(t.dataset.n);
        else if (a === 'binderremove') removeFromCurrentBinder(t.dataset.n, t.dataset.dex);
        else if (a === 'cbmember') openCbMember(t.dataset.n);
        else if (a === 'cbtoggle') cbToggleFromSheet(t.dataset.bid, t.dataset.n);
        else if (a === 'cbnew') openCbNew(t.dataset.withn);
        else if (a === 'cbcreate') cbCreate(t.dataset.withn);
        else if (a === 'cbpreset') cbPreset(t.dataset.key);
        else if (a === 'cbedit') openCbEdit();
        else if (a === 'cbsave') cbSaveEdit();
        else if (a === 'cbaskdelete') askCbDelete();
        else if (a === 'cbdelete') cbDelete();
        else if (a === 'cbadd') openCbAdd();
        else if (a === 'cbpick') cbPick(t.dataset.set, t.dataset.cn);
        else if (a === 'artists') openArtists();
        else if (a === 'artbinder') artistBinder(t.dataset.artist);
        else if (a === 'pknew') openPkNew();
        else if (a === 'pksize') { $$('#fn-pk-size button').forEach(function (b) { b.classList.toggle('is-on', b === t); }); }
        else if (a === 'pkcreate') pkCreate();
        else if (a === 'pkedit') { pkEdit = !pkEdit; closeSheet(); renderHero(); renderBody(); }
        else if (a === 'pkaddpage') pkAddPage();
        else if (a === 'pkslot') pkSlotTap(Number(t.dataset.pkpage), Number(t.dataset.pkslot));
        else if (a === 'pkchange') openPkPicker();
        else if (a === 'pkremove') pkRemove();
        else if (a === 'pkspecies') openPkSpecies();
        else if (a === 'pkspecpick') pkPickSpecies(Number(t.dataset.dex), t.dataset.name);
        else if (a === 'pkplace') pkPlace(t.dataset.set, t.dataset.cn, t.dataset.ver);
      }
      else if (t.dataset.pick != null) pickSet(t.dataset.pick);
      else if (t.dataset.blk != null) toggleBlock(t.dataset.blk);
      else if (t.dataset.close != null) closeSheet();
      else if (t.dataset.bnav != null) { var step = innerWidth >= 700 ? 2 : 1; st.bpage = Math.max(0, st.bpage + Number(t.dataset.bnav) * step); renderBody(); }
      else if (t.dataset.pocket != null) { st.pocket = t.dataset.pocket; LS.set('pocket', st.pocket); st.bpage = 0; renderBody(); }
    });
    document.addEventListener('change', function (e) { if (e.target && e.target.id === 'fn-dp-sort' && picker) { picker.sort = e.target.value; renderDexPicker(($('#fn-dp-q') || {}).value || ''); } else if (e.target && e.target.id === 'fn-dp-own' && picker) { picker.own = e.target.checked; renderDexPicker(($('#fn-dp-q') || {}).value || ''); } });
    document.addEventListener('input', function (e) { if (e.target && e.target.classList && e.target.classList.contains('fn-tsearch')) applyTreeFilter(e.target.closest('.fn-drawer') || $('#fn-side')); else if (e.target && e.target.id === 'fn-dp-q') renderDexPicker(e.target.value); else if (e.target && e.target.id === 'fn-cp-q') renderCbAdd(e.target.value); else if (e.target && e.target.id === 'fn-ar-q') renderArtists(e.target.value); else if (e.target && e.target.id === 'fn-pks-q') renderPkSpecies(e.target.value); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var hasOpenOrig = $$('.origem-menu').some(function (m) { return !m.hidden; });
        if (hasOpenOrig) {
          closeAllOriginMenus();
          return;
        }
        if (!$('#fn-overlay').hidden) { closeSheet(); return; }
        if (document.body.classList.contains('fn-focus') || document.body.classList.contains('fn-table-focus')) { exitFocus(); return; }
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && st.view === 'binder' && $('#fn-overlay').hidden && document.activeElement.tagName !== 'INPUT') {
        var step = innerWidth >= 700 ? 2 : 1; st.bpage = Math.max(0, st.bpage + (e.key === 'ArrowRight' ? step : -step)); renderBody();
      }
    });
  }

  // ── carregamento de link compartilhado (?s=token) ──────────
  async function loadShare(tok) {
    try {
      var r = await sbClient.rpc('get_share_collection', { share_token: tok });
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (r.error || !row) { toast('Este link não existe ou foi removido.'); return false; }

      var keys = new Set();
      var entries = new Map();
      var dexAnyKeys = new Map();

      function registerSlot(slotKeyStr, qtyVal, originsVal) {
        if (!slotKeyStr) return;
        var k = String(slotKeyStr);
        var q = Number(qtyVal);
        if (!isFinite(q) || q <= 0) q = 1;
        var orig = Array.isArray(originsVal) ? originsVal.slice() : [];
        keys.add(k);
        entries.set(k, { qty: q, origins: orig });
        if (k.indexOf('dex-') === 0) {
          var colonIdx = k.indexOf(':');
          if (colonIdx > 0) {
            var basePart = k.slice(colonIdx + 1);
            if (!dexAnyKeys.has(basePart)) dexAnyKeys.set(basePart, k);
          }
        }
      }

      // 1. Lê slot_keys (array de strings ou objetos)
      (row.slot_keys || []).forEach(function (it) {
        if (typeof it === 'string') {
          registerSlot(it, 1, []);
        } else if (it && typeof it === 'object') {
          registerSlot(it.slot_key || it.key, it.quantity != null ? it.quantity : it.qty, it.origins);
        }
      });

      // 2. Se a RPC também retornar registros detalhados (slots / collection / items / slot_details), mescla quantidade e origins (qualidade e lotes)
      var richList = row.slots || row.collection || row.items || row.slot_details || [];
      if (Array.isArray(richList)) {
        richList.forEach(function (it) {
          if (!it || typeof it !== 'object') return;
          registerSlot(it.slot_key || it.key, it.quantity != null ? it.quantity : it.qty, it.origins);
        });
      }

      var raw = row.set_key || '';
      var ids = row.card_ids;
      var hasCards = Array.isArray(ids) && ids.length > 0;
      var isDexShare = hasCards && ids.some(function (x) { return x && (x.dex != null || x.empty); });
      var binder = hasCards ? {
        id: 'shared',
        name: row.binder_name || (isDexShare ? 'Pokédex compartilhada' : 'Fichário compartilhado'),
        emoji: isDexShare ? '🌐' : '📚',
        filter_config: isDexShare ? { type: 'masterdex', dexFrom: ids[0].dex, dexTo: ids[ids.length - 1].dex } : { type: 'manual' },
        card_ids: ids.filter(function (x) { return x && !x.empty && x.set; })
      } : null;

      SHARE = { keys: keys, entries: entries, dexAnyKeys: dexAnyKeys, dex: isDexShare, binder: binder };
      if (binder) {
        st.set = (isDexShare ? 'dex:' : 'cb:') + 'shared';
        st.view = 'grid';
      } else {
        var m = raw.match(/^(.*?)(?:-(en|jp|cn))?$/);
        var base = (m && m[1]) || 'me04';
        var lang = (m && m[2]) || 'pt';
        st.set = SET_CATALOG.some(function (x) { return x.id === base; }) ? base : 'me04';
        st.lang = lang;
        st.view = row.view_mode === 'binder' ? 'binder' : 'grid';
        st.pocket = { 2: '4', 3: '9', 4: '16', 6: '20b', 7: '12' }[row.layout] || '9';
      }
      document.body.classList.add('fn-share');
      return true;
    } catch (e) { console.error(e); return false; }
  }

  // ── arranque ───────────────────────────────────────────────
  function boot() {
    if (!engineReady()) { setTimeout(boot, 50); return; }
    var tok = new URLSearchParams(location.search).get('s');
    if (tok) {
      bind();
      loadShare(tok).then(function (ok) { banner(); if (ok) renderAll(); else $('#fn-body').innerHTML = '<div class="fn-empty">Este link de compartilhamento não é válido ou foi apagado. <a href="./">Ir para o MyDeck</a></div>'; });
      return;
    }

    // 1. Sempre abre em "Meus fichários" (home) se não houver #hash na URL
    if (!location.hash) {
      st.set = 'home';
    }

    if (FAMILY.indexOf(st.set) >= 0) {
      try { var fl = localStorage.getItem('ficLang'); if (fl === 'en' || fl === 'pt') st.lang = fl; } catch (e) { }
    }
    if (!SET_CATALOG.some(function (s) { return s.id === setKey(st.set); }) && !isDex(st.set) && !isCb(st.set) && !isPk(st.set) && !isHome(st.set)) st.set = 'home';

    bind(); banner(); renderAll();

    // 2. Garante o carregamento dos fichários personalizados (via motor ou direto do Supabase)
    var bindersFetchedForUid = null;
    var bindersFetching = false;

    async function ensureCustomBindersLoaded(force) {
      if (DEMO || SHARE || !loggedIn() || bindersFetching) return;
      var currentUid = uid();
      if (!currentUid) return;

      var alreadyHas = typeof customBinders !== 'undefined' && Array.isArray(customBinders) && customBinders.length > 0;
      if (!force && alreadyHas) return;
      if (!force && bindersFetchedForUid === currentUid) return;

      bindersFetching = true;
      try {
        // Tenta primeiro a função nativa do app.js, se existir
        if (typeof loadCustomBinders === 'function') {
          await Promise.resolve(loadCustomBinders());
        }

        // Se ainda estiver vazio (ex.: app.js não carregou nesta página), busca direto no Supabase
        var stillEmpty = typeof customBinders === 'undefined' || !Array.isArray(customBinders) || customBinders.length === 0;
        if (stillEmpty && typeof sbClient !== 'undefined' && sbClient) {
          var res = await sbClient
            .from('custom_binders')
            .select('*')
            .eq('user_id', currentUid)
            .order('created_at', { ascending: false });

          if (!res.error && Array.isArray(res.data)) {
            if (typeof customBinders !== 'undefined' && Array.isArray(customBinders)) {
              customBinders.splice(0, customBinders.length);
              res.data.forEach(function (item) { customBinders.push(item); });
            } else {
              window.customBinders = res.data;
            }
          }
        }

        bindersFetchedForUid = currentUid;
        progCache = {};
        renderAll();
        if (typeof customBinders !== 'undefined' && customBinders.length > 0) {
          cleanupAndEnsureNatDex();
        }
      } catch (e) {
        console.error('[fichario] erro ao carregar fichários:', e);
      } finally {
        bindersFetching = false;
      }
    }

    // 3. Monitora login, coleção, fichários e catálogos (sem desistir cedo no reload)
    var tries = 0;
    var lastSig = '';

    function getSyncSignature() {
      var u = loggedIn() ? uid() : '';
      var colSize = (typeof collected !== 'undefined' && collected) ? collected.size : 0;
      var cbs = (typeof customBinders !== 'undefined' && Array.isArray(customBinders)) ? customBinders : [];
      var cbSig = cbs.map(function (b) {
        var len = Array.isArray(b.card_ids) ? b.card_ids.length : (Array.isArray(b.pages) ? b.pages.length : 0);
        return b.id + ':' + (b.name || '') + ':' + len;
      }).join('|');
      var mapKeys = (typeof SET_CARDS_MAP !== 'undefined' && SET_CARDS_MAP) ? Object.keys(SET_CARDS_MAP).length : 0;
      return u + '#' + colSize + '#' + cbs.length + '#' + cbSig + '#' + mapKeys;
    }

    function syncTick() {
      banner();
      if (loggedIn()) {
        ensureCustomBindersLoaded(false);
      }
      var sig = getSyncSignature();
      if (sig !== lastSig) {
        lastSig = sig;
        progCache = {};
        renderAll();
      }
    }

    // Dispara imediatamente e continua monitorando
    syncTick();
    var poll = setInterval(function () {
      tries++;
      syncTick();
      if (tries >= 80) clearInterval(poll); // ~20s para conexões lentas no reload
    }, 250);

    // Também escuta mudança de sessão do Supabase (essencial no reload da página)
  try {
      if (typeof sbClient !== 'undefined' && sbClient && sbClient.auth && typeof sbClient.auth.onAuthStateChange === 'function') {
        sbClient.auth.onAuthStateChange(function (_event, session) {
          if (session && session.user) {
            bindersFetchedForUid = null;
            syncTick();
          }
        });
      }
    } catch (e) { }
  }

  boot();
})();
