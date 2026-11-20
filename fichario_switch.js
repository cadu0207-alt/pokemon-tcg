/* Redireciona o Fichário para o fichário novo (fichario-novo.html).
 *
 * 18/11/2026: o fichário novo virou o padrão de todos. 19/11/2026: o atalho ?classico/?novo foi retirado
 * (o fichário antigo está sendo removido do site aos poucos). Os dados são os mesmos (tabelas collection e
 * custom_binders). Este arquivo só mantém os links antigos funcionando: ?share=<token>, #fichario, #fichario/<set>. */
(function () {
  'use strict';
  window.MYDECK_FICHARIO_UI = 'novo';

  var TARGET = 'fichario-novo.html';
  // link público de coleção compartilhada: abre no visualizador novo
  try {
    var tok = new URLSearchParams(location.search).get('share');
    if (tok && /^[\w-]{6,100}$/.test(tok)) { location.replace(TARGET + '?s=' + encodeURIComponent(tok)); return; }
  } catch (e) { }
  // #fichario, #fichario/me04, #fichario/__cb__<id>
  function targetFromHash(h) {
    h = String(h || '').replace(/^#/, ''); if (h.indexOf('fichario') !== 0) return null;
    var rest = h.split('/')[1] || '', m = /^__cb__(.+)$/.exec(rest);
    return TARGET + (m ? '#cb:' + m[1] : rest ? '#' + rest : '');
  }
  var t0 = targetFromHash(location.hash);
  if (t0) { location.replace(t0); return; }

  // Abre o fichário novo (com a coleção/fichário pedido, se houver): sid = 'me04', '__cb__<id>' ou '__custom__'.
  function openNovo(sid) {
    var h = '';
    if (sid && sid !== '__custom__') { var m = /^__cb__(.+)$/.exec(String(sid)); h = m ? '#cb:' + m[1] : '#' + sid; }
    location.href = TARGET + h;
  }
  // go()/goToTab()/mNav() com 'fichario' viram atalho para o fichário novo (logado ou não: a página nova trata o login).
  function wrap(name) {
    var orig = window[name]; if (typeof orig !== 'function' || orig.__fs) return;
    var w = function (id) { if (id === 'fichario') { location.href = TARGET; return; } return orig.apply(this, arguments); };
    w.__fs = true; window[name] = w;
  }
  function install() { wrap('go'); wrap('goToTab'); wrap('mNav'); }
  install(); window.addEventListener('DOMContentLoaded', install); window.addEventListener('load', install);
  window.addEventListener('hashchange', function () { var t = targetFromHash(location.hash); if (t) location.href = t; });

  // 19/11/2026 — o painel do fichário antigo não é mais usado. Depois que TODOS os scripts rodaram (DOMContentLoaded),
  // as funções que desenhavam o painel viram "não faz nada" e as que navegavam para uma coleção abrem o fichário novo.
  // (Cartões do Dashboard, busca global e leilão ainda chamam essas funções.) Sai junto com o código antigo.
  function neutralizeOld() {
    ['renderBinder', 'renderTabs', 'renderCustomBindersHome', 'renderSharedCustomBinder', 'openCustomBinderView',
      'updateFicLangVisibility', 'ficToggleOpts', 'ficUpdateFilterBadge', 'fmMdexRender', 'fmMdexInjectHomeEntry'].forEach(function (n) {
      if (typeof window[n] === 'function') window[n] = function () { };
    });
    if (typeof window.switchSet === 'function') window.switchSet = function (sid) { openNovo(sid); };
  }
  window.addEventListener('DOMContentLoaded', neutralizeOld);
})();
