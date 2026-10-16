// ================================================================
// MyDeck — Favoritos do Fichário (fichario_favoritos.js) — 17/10/2026
// Pedido do Eduardo: "depois de clicar na carta, um campo pequeno pra marcar os favoritos; os favoritos, de
// qualquer coleção, entram numa coleção Favoritos".
//
// Sem tabela nova: "Favoritos" é um fichário personalizado comum (custom_binders, type 'manual') marcado com
// filter_config.favorites = true — o resto do sistema já funciona sem mexer: grade/fichário físico, busca,
// "só coletadas/faltantes", imprimir, compartilhar, fixar na aba. Ele nasce no 1º favorito marcado, já FIXADO
// como aba. Renomear continua valendo (o marcador é filter_config.favorites, não o nome).
//
// Carregado depois de app.js e fichario_patch.js (usa customBinders, saveCustomBinder, pinnedBinders, uid,
// sbClient, renderTabs, openCustomBinderView, setStatus). openSlotModal()/ficCardHtml() (fichario_patch.js)
// chamam favButtonHtml()/favIsFav() quando existirem.
// ================================================================
(function () {
  'use strict';

  function favList() { try { return (typeof customBinders !== 'undefined' && Array.isArray(customBinders)) ? customBinders : []; } catch (e) { return []; } }
  function favBinder() { return favList().find(function (b) { return b && b.filter_config && b.filter_config.favorites === true; }) || null; }

  // Set de "set:n" cacheado pela referência do array card_ids (troca de array = recalcula)
  let keyCache = { ref: null, set: null };
  function favKeys() {
    const b = favBinder();
    if (!b) return new Set();
    const ids = b.card_ids || [];
    if (keyCache.ref !== ids) keyCache = { ref: ids, set: new Set(ids.map(function (i) { return i.set + ':' + i.n; })) };
    return keyCache.set;
  }
  function favIsFav(setId, n) { return favKeys().has(setId + ':' + n); }
  window.favIsFav = favIsFav;

  async function favFetchRemote() {
    if (typeof sbClient === 'undefined' || !sbClient || !uid()) return null;
    const r = await sbClient.from('custom_binders').select('*').eq('user_id', uid()).contains('filter_config', { favorites: true }).limit(1);
    return (r.data && r.data[0]) || null;
  }

  function favPin(b) {
    try {
      const id = String(b.id);
      if (typeof pinnedBinders !== 'undefined' && !pinnedBinders.includes(id)) { pinnedBinders.push(id); savePinnedBinders(); }
      localStorage.setItem('fav_autopin', id);
    } catch (e) { /* sem localStorage: a aba só não fica fixa */ }
  }

  async function favEnsureBinder() {
    let b = favBinder();
    if (b) return b;
    // a lista local ainda pode não ter chegado do banco (loadCustomBinders é assíncrona) — confere antes de criar
    const remote = await favFetchRemote();
    if (remote) { customBinders.unshift(remote); favPin(remote); return remote; }
    const created = await saveCustomBinder({
      name: 'Favoritos', emoji: '⭐', layout: 3, cover_color: '#f5b301',
      filter_config: { type: 'manual', favorites: true }, card_ids: [],
    });
    if (created) favPin(created);
    return created || null;
  }

  function favPaintBtn(btn, on) {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? '★ Favorita' : '☆ Favoritar';
  }
  // marca/desmarca o selo ★ nas cartas que já estão na tela (sem re-render da grade)
  function favPaintBadges(setId, n, on) {
    document.querySelectorAll('.fic-card').forEach(function (el) {
      if (el.dataset.setid !== setId || el.dataset.n !== n) return;
      const box = el.firstElementChild;
      if (!box) return;
      const cur = box.querySelector('.fav-badge');
      if (on && !cur) { const s = document.createElement('span'); s.className = 'fav-badge'; s.setAttribute('aria-hidden', 'true'); s.textContent = '★'; box.appendChild(s); }
      else if (!on && cur) cur.remove();
    });
  }

  window.favButtonHtml = function (setId, n) {
    if (typeof uid !== 'function' || !uid()) return '';
    const on = favIsFav(setId, n);
    return '<button type="button" class="fav-toggle' + (on ? ' on' : '') + '" data-set="' + String(setId).replace(/[^\w.-]/g, '') + '" data-n="' + String(n).replace(/[^\w./-]/g, '') + '" ' +
      'aria-pressed="' + (on ? 'true' : 'false') + '" onclick="favToggle(this)" title="Favoritos de todas as coleções ficam juntos no fichário ⭐ Favoritos">' +
      (on ? '★ Favorita' : '☆ Favoritar') + '</button>';
  };

  window.favToggle = async function (btn) {
    if (!btn || btn.dataset.busy === '1' || typeof uid !== 'function' || !uid()) return;
    btn.dataset.busy = '1';
    const setId = btn.dataset.set, n = btn.dataset.n;
    const wasFav = favIsFav(setId, n);
    favPaintBtn(btn, !wasFav);                 // otimista; volta se o banco recusar
    try {
      const b = await favEnsureBinder();
      if (!b) throw new Error('não consegui criar o fichário Favoritos');
      const ids = (b.card_ids || []).filter(function (i) { return !(i.set === setId && i.n === n); });
      if (!wasFav) ids.push({ set: setId, n: n });
      const r = await sbClient.from('custom_binders').update({ card_ids: ids, updated_at: new Date().toISOString() }).eq('id', b.id).eq('user_id', uid());
      if (r.error) throw r.error;
      b.card_ids = ids;                        // array novo => o cache de chaves se refaz sozinho
      favPaintBadges(setId, n, !wasFav);
      if (typeof renderTabs === 'function') renderTabs();   // contador da aba Favoritos
      if (typeof setStatus === 'function') setStatus(wasFav ? 'Removida dos Favoritos' : '⭐ Adicionada aos Favoritos', 'success');
      // se a tela aberta é o próprio fichário Favoritos, atualiza a grade (a carta some/entra)
      if (typeof _currentCustomBinderId !== 'undefined' && String(_currentCustomBinderId) === String(b.id) && typeof openCustomBinderView === 'function') {
        openCustomBinderView(b);
      }
    } catch (e) {
      console.error('[favoritos]', e);
      favPaintBtn(btn, wasFav);
      if (typeof setStatus === 'function') setStatus('Não consegui salvar o favorito. Tente de novo.', 'error');
    } finally {
      btn.dataset.busy = '0';
    }
  };

  // Em outro aparelho a aba fixa ("pinnedBinders") é por navegador — fixa o Favoritos uma vez por aparelho
  // quando a lista de fichários chegar do banco, pra ele aparecer junto das coleções sem precisar fixar à mão.
  function hookLoad() {
    if (typeof window.loadCustomBinders !== 'function') { setTimeout(hookLoad, 80); return; }
    const original = window.loadCustomBinders;
    window.loadCustomBinders = async function () {
      const out = await original.apply(this, arguments);
      try {
        const b = favBinder();
        if (b && localStorage.getItem('fav_autopin') !== String(b.id)) { favPin(b); if (typeof renderTabs === 'function') renderTabs(); }
      } catch (e) { /* ok */ }
      return out;
    };
  }
  hookLoad();
})();
