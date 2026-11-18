/* Fichário novo x clássico — implantação gradual (18/11/2026).
 *
 * Por padrão tudo continua como sempre (fichário clássico). Quem abrir o MyDeck com  ?novo  passa a usar o fichário novo
 * (a aba "Fichário" e os links de fichário levam para fichario-novo.html); com  ?classico  volta ao clássico. A escolha fica
 * guardada neste aparelho. Para virar o padrão de TODO MUNDO, é só trocar DEFAULT_UI para 'novo' (uma palavra).
 * Os dados são os mesmos nos dois (tabela collection e custom_binders): nada se perde indo e voltando. */
(function () {
  'use strict';
  var DEFAULT_UI = 'classico';
  var KEY = 'mydeck_fichario_ui';
  var ui = DEFAULT_UI;
  try {
    var q = new URLSearchParams(location.search);
    if (q.has('novo')) localStorage.setItem(KEY, 'novo');
    else if (q.has('classico')) localStorage.setItem(KEY, 'classico');
    ui = localStorage.getItem(KEY) || DEFAULT_UI;
  } catch (e) { ui = DEFAULT_UI; }
  window.MYDECK_FICHARIO_UI = ui;
  if (ui !== 'novo') return;

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

  function loggedIn() { try { return typeof uid === 'function' && !!uid(); } catch (e) { return false; } }
  function wrap(name) {
    var orig = window[name]; if (typeof orig !== 'function' || orig.__fs) return;
    var w = function (id) { if (id === 'fichario' && loggedIn()) { location.href = TARGET; return; } return orig.apply(this, arguments); };
    w.__fs = true; window[name] = w;
  }
  function install() { wrap('go'); wrap('goToTab'); wrap('mNav'); }
  install(); window.addEventListener('DOMContentLoaded', install); window.addEventListener('load', install);
  window.addEventListener('hashchange', function () { var t = targetFromHash(location.hash); if (t && loggedIn()) location.href = t; });
})();
