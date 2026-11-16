// ================================================================
// MyDeck — Instalar como app (pwa_install.js, 17/10/2026)
// ================================================================
// O site já é um PWA (manifest.json + sw.js + push), mas nada convidava a instalar. Este arquivo:
//   • guarda o evento beforeinstallprompt (Android/Chrome/Edge) e dispara o diálogo nativo quando a pessoa toca
//     em "Instalar";
//   • no iPhone/iPad (Safari não tem esse evento) mostra o passo a passo "Compartilhar → Adicionar à Tela de Início";
//   • coloca o item "📲 Instalar app" na folha "Mais" do mobile e, a partir da 2ª visita em dias diferentes, um
//     convite dispensável no topo da Início (#pwa-install-slot) — some por 30 dias se a pessoa dispensar;
//   • nada disso aparece quando o site já está rodando instalado (display-mode: standalone).
// Sem dependências; falha em silêncio se o navegador não suportar algo.
// ================================================================

(function () {
  'use strict';

  const LS_DISMISSED = 'pwa_install_dismissed_at';
  const LS_DAYS = 'pwa_install_visit_days';
  const DISMISS_MS = 30 * 24 * 3600 * 1000;
  let deferred = null;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* modo privado */ } },
  };

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function isIOS() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isAndroid() { return /Android/i.test(navigator.userAgent || ''); }
  function isInAppBrowser() { return /FBAN|FBAV|Instagram|Line\/|WhatsApp|Telegram|; wv\)/i.test(navigator.userAgent || ''); }
  function isMobileViewport() { return window.matchMedia && window.matchMedia('(max-width: 900px)').matches; }
  function canInstall() { return !isStandalone() && (!!deferred || isIOS() || isAndroid()); }

  // ── dias distintos de visita (pra só convidar quem já voltou) ──
  function recordVisit() {
    const today = new Date().toISOString().slice(0, 10);
    let days = [];
    try { days = JSON.parse(store.get(LS_DAYS) || '[]'); } catch (e) { days = []; }
    if (!Array.isArray(days)) days = [];
    if (!days.includes(today)) { days.push(today); store.set(LS_DAYS, JSON.stringify(days.slice(-10))); }
    return days.length;
  }
  function recentlyDismissed() {
    const t = Number(store.get(LS_DISMISSED) || 0);
    return t && Date.now() - t < DISMISS_MS;
  }

  // ── estilo (injetado; usa as variáveis do site com reserva) ──
  function injectStyle() {
    if (document.getElementById('pwa-install-style')) return;
    const st = document.createElement('style');
    st.id = 'pwa-install-style';
    st.textContent = `
      .pwa-banner { display: flex; align-items: center; gap: 12px; margin: 0 0 14px; padding: 12px 14px; border-radius: 14px;
        border: 1px solid rgba(var(--accent-rgb, 230,57,70), .35); background: linear-gradient(135deg, rgba(var(--accent-rgb, 230,57,70), .12), rgba(6,163,127,.10));
        color: var(--text, #1c1f2e); font-size: 13px; line-height: 1.4; }
      .pwa-banner-ic { font-size: 26px; flex: none; }
      .pwa-banner-tx { flex: 1; min-width: 0; }
      .pwa-banner-tx b { display: block; font-size: 14px; }
      .pwa-banner-btn { flex: none; padding: 9px 14px; border: 0; border-radius: 10px; background: var(--accent, #e63946); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      .pwa-banner-x { flex: none; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: var(--muted, #6b7089); font-size: 20px; line-height: 1; cursor: pointer; }
      .pwa-modal-bd { position: fixed; inset: 0; z-index: 10050; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; justify-content: center; padding: 0; }
      .pwa-modal { width: 100%; max-width: 440px; background: var(--surface, #fff); color: var(--text, #1c1f2e); border-radius: 18px 18px 0 0; padding: 20px 20px 28px; box-shadow: 0 -10px 40px rgba(0,0,0,.35); }
      .pwa-modal h3 { margin: 0 0 12px; font-size: 18px; }
      .pwa-modal ol { margin: 0 0 14px; padding-left: 22px; font-size: 14px; line-height: 1.7; }
      .pwa-modal .pwa-warn { margin: 0 0 14px; padding: 10px 12px; border-radius: 10px; background: rgba(255,209,102,.2); font-size: 13px; }
      .pwa-modal button { width: 100%; padding: 12px; border: 0; border-radius: 10px; background: var(--accent, #e63946); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      @media (min-width: 901px) { .pwa-modal-bd { align-items: center; } .pwa-modal { border-radius: 18px; } }
    `;
    document.head.appendChild(st);
  }

  // ── passo a passo (iPhone/iPad e Android sem o diálogo nativo) ──
  function openHowTo() {
    injectStyle();
    document.querySelectorAll('.pwa-modal-bd').forEach(n => n.remove());
    const ios = isIOS();
    const steps = ios
      ? ['Toque no botão <b>Compartilhar</b> (o quadrado com a seta ↑) na barra do Safari.', 'Role e toque em <b>Adicionar à Tela de Início</b>.', 'Toque em <b>Adicionar</b>. O ícone do MyDeck aparece na sua tela.']
      : ['Toque no menu <b>⋮</b> do navegador (canto superior direito).', 'Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).', 'Confirme. O ícone do MyDeck aparece na sua tela.'];
    const warn = isInAppBrowser()
      ? `<div class="pwa-warn">Você abriu o MyDeck dentro de outro app (WhatsApp, Instagram…). Abra o link no ${ios ? '<b>Safari</b>' : '<b>Chrome</b>'} para conseguir instalar.</div>`
      : '';
    const bd = document.createElement('div');
    bd.className = 'pwa-modal-bd';
    bd.innerHTML = `<div class="pwa-modal" role="dialog" aria-modal="true" aria-label="Instalar o MyDeck">
      <h3>📲 Instalar o MyDeck</h3>${warn}<ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>
      <button type="button">Entendi</button></div>`;
    bd.addEventListener('click', (e) => { if (e.target === bd) bd.remove(); });
    bd.querySelector('button').addEventListener('click', () => bd.remove());
    document.body.appendChild(bd);
  }

  async function install() {
    if (deferred) {
      const ev = deferred; deferred = null;
      try {
        ev.prompt();
        const choice = await ev.userChoice;
        if (choice && choice.outcome === 'accepted') { render(); return; }
      } catch (e) { /* cai pro passo a passo */ }
      store.set(LS_DISMISSED, String(Date.now()));
      render();
      return;
    }
    openHowTo();
  }

  // ── item na folha "Mais" + convite na Início ──
  function ensureMenuItem() {
    let it = document.getElementById('msheet-install');
    if (!it) {
      const admin = document.getElementById('msheet-tab-admin');
      if (!admin || !admin.parentNode) return null;
      it = document.createElement('button');
      it.type = 'button';
      it.id = 'msheet-install';
      it.className = 'msheet-item msheet-cta';
      it.innerHTML = '<span class="msheet-ic">📲</span><span class="msheet-lb">Instalar app</span>';
      it.addEventListener('click', () => { if (typeof closeMSheet === 'function') closeMSheet(); install(); });
      admin.parentNode.insertBefore(it, admin);
    }
    return it;
  }

  function render() {
    const show = canInstall();
    const it = ensureMenuItem();
    if (it) it.style.display = show ? '' : 'none';

    const slot = document.getElementById('pwa-install-slot');
    if (!slot) return;
    const invite = show && isMobileViewport() && !recentlyDismissed() && recordVisitCount >= 2;
    if (!invite) { slot.innerHTML = ''; return; }
    injectStyle();
    slot.innerHTML = `<div class="pwa-banner" role="region" aria-label="Instalar o MyDeck">
      <span class="pwa-banner-ic" aria-hidden="true">📲</span>
      <div class="pwa-banner-tx"><b>Instale o MyDeck no celular</b>Abre direto da tela inicial, sem barra do navegador, e avisa dos leilões e eventos.</div>
      <button type="button" class="pwa-banner-btn">Instalar</button>
      <button type="button" class="pwa-banner-x" aria-label="Agora não">×</button></div>`;
    slot.querySelector('.pwa-banner-btn').addEventListener('click', install);
    slot.querySelector('.pwa-banner-x').addEventListener('click', () => { store.set(LS_DISMISSED, String(Date.now())); render(); });
  }

  let recordVisitCount = 0;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; render(); });
  window.addEventListener('appinstalled', () => { deferred = null; store.set(LS_DISMISSED, String(Date.now() + 5 * 365 * 86400000)); render(); });

  function boot() {
    recordVisitCount = recordVisit();
    render();
    // a folha "Mais" e a Início são montadas junto com o app; tenta de novo uma vez depois do boot
    setTimeout(render, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
