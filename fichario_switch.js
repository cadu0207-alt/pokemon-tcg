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
