// ================================================================
// MyDeck — Sistema de XP / Níveis / Conquistas (xp_system.js)
// ================================================================
// Arquivo AUTOCONTIDO: não edita app.js. Pluga via monkey-patch de
// window.go / window._updateUserChip / window.toggleSlot — mesmo
// padrão já usado em admin_stats.js (hookAdminStatsIntoDash) pra
// evitar mexer em arquivos grandes que já truncaram com o Edit tool
// (ver feedback_coding). CSS injetado via <style> no fim deste
// arquivo — não mexe em style.css. HTML de painel/modal é montado
// via JS — não mexe em index.html além da tag <script> que carrega
// este arquivo.
//
// Todo identificador global aqui usa prefixo xp* pra não colidir com
// nada de app.js/fichario_patch.js/ev_calculator.js/lojas.js (ver
// feedback_coding: colisão de nome global já causou bug real — aba
// Fichário mostrando "0/0 slots" por causa de getSetCards duplicada).
//
// Depende de (já definidos em app.js, carregado antes deste arquivo):
//   sbClient, uid(), currentUser, window.go, window._updateUserChip,
//   window.toggleSlot, SET_CATALOG
//
// FIX 16/07/2026: sbClient é declarado com `const` em app.js — const
// no topo de um script clássico NÃO vira propriedade de `window`
// (diferente de `function`/`var`). O código antigo checava
// `window.sbClient`, que é sempre undefined, então o painel nunca
// carregava nada (o loop de hook nunca instalava, xpFetchAll sempre
// abortava cedo). Corrigido pra referenciar `sbClient` direto.
// ================================================================

const XP_TITLES = [
  { min: 1,  max: 3,        label: 'Treinador Novato' },
  { min: 4,  max: 7,        label: 'Aprendiz de Colecionador' },
  { min: 8,  max: 12,       label: 'Colecionador' },
  { min: 13, max: 17,       label: 'Caçador de Cartas' },
  { min: 18, max: 23,       label: 'Especialista em Sets' },
  { min: 24, max: 30,       label: 'Mestre de Master Set' },
  { min: 31, max: 42,       label: 'Grão-Mestre Pokémon' },
  { min: 43, max: 60,       label: 'Lenda dos Fichários' },
  { min: 61, max: 80,       label: 'Mito Vivo' },
  { min: 81, max: Infinity, label: 'Lenda Suprema' },
];
function xpTitleForLevel(level) {
  const t = XP_TITLES.find(t => level >= t.min && level <= t.max);
  return t ? t.label : 'Treinador Novato';
}
// Espelha fn_level_for_xp() do Supabase: cumulative(L) = 25*L*(L+1)
function xpCumulative(L) { return 25 * L * (L + 1); }
function xpProgressInfo(level, totalXp) {
  const floor = level - 1;
  const start = xpCumulative(floor);
  const next = xpCumulative(level);
  const pct = next > start ? Math.max(0, Math.min(100, Math.round((totalXp - start) / (next - start) * 100))) : 100;
  return { start, next, pct };
}
function xpDisplayName(userId, rawName) {
  if (rawName) return rawName.trim().split(' ')[0]; // só primeiro nome (decisão do Eduardo)
  return 'Treinador #' + String(userId || '').slice(-4).toUpperCase();
}
function xpAchievementLabel(a) {
  if (a.meta && a.meta.title) return a.meta.title;
  if (a.meta && a.meta.set_code) {
    const catalog = (typeof SET_CATALOG !== 'undefined') ? SET_CATALOG : [];
    const setInfo = catalog.find(s => s.id === a.meta.set_code);
    const setLabel = setInfo ? `${setInfo.emoji || ''} ${setInfo.label || a.meta.set_code}`.trim() : a.meta.set_code;
    const suffix = a.meta.category === 'master_set' ? 'Master Set' : 'Set Completo';
    return `${setLabel} — ${suffix}`;
  }
  return a.achievement_code;
}
function xpAchievementIcon(a) {
  if (a.meta && a.meta.icon) return a.meta.icon;
  return (a.meta && a.meta.category === 'master_set') ? '👑' : '✅';
}
function xpHasClient() {
  return typeof sbClient !== 'undefined' && !!sbClient;
}
// SEGURANÇA 16/07/2026: display_name é definido pelo próprio usuário
// (profiles RLS deixa qualquer authenticated escrever a própria linha,
// sem validação de conteúdo) e aparece pra TODO MUNDO no ranking —
// sempre escapar antes de jogar em innerHTML, senão é XSS armazenado
// (alguém setando display_name via API direta, não pelo modal, poderia
// injetar <img onerror=...> e rodar JS na sessão de quem visse o board).
function xpEscapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str == null ? '' : str);
  return d.innerHTML;
}

// ── ESTADO ──────────────────────────────────────────────────────
let xpState = { progress: null, achievements: [], leaderboard: [], namesByUid: {}, myProfile: null, myRank: null, loaded: false };

async function xpFetchAll() {
  const myUid = (typeof uid === 'function') ? uid() : null;
  if (!myUid || !xpHasClient()) return;
  try {
    const [{ data: prog }, { data: myAchv }, { data: allAchv }, { data: board }, { data: myProf }] = await Promise.all([
      sbClient.from('user_progress').select('total_xp,level').eq('user_id', myUid).maybeSingle(),
      sbClient.from('user_achievements').select('achievement_code,unlocked_at,is_pioneer').eq('user_id', myUid),
      sbClient.from('achievements').select('code,title,description,icon,category,set_code,xp_bonus'),
      sbClient.from('user_progress').select('user_id,total_xp,level').order('total_xp', { ascending: false }).limit(10),
      sbClient.from('profiles').select('display_name').eq('user_id', myUid).maybeSingle(),
    ]);
    const achMap = Object.fromEntries((allAchv || []).map(a => [a.code, a]));
    xpState.progress = prog || { total_xp: 0, level: 1 };
    xpState.achievements = (myAchv || [])
      .map(ua => ({ ...ua, meta: achMap[ua.achievement_code] }))
      .sort((a, b) => new Date(b.unlocked_at) - new Date(a.unlocked_at));
    xpState.leaderboard = board || [];
    xpState.myProfile = myProf || null;
    xpState.loaded = true;

    const ids = xpState.leaderboard.map(r => r.user_id);
    if (ids.length) {
      const { data: names } = await sbClient.from('profiles').select('user_id,display_name').in('user_id', ids);
      xpState.namesByUid = Object.fromEntries((names || []).map(n => [n.user_id, n.display_name]));
    } else {
      xpState.namesByUid = {};
    }

    // posição no ranking geral, mesmo se estiver fora do top 10
    // (conta quantos usuários têm mais XP que eu — não precisa
    // baixar a tabela inteira, só a contagem)
    const { count: aheadCount } = await sbClient
      .from('user_progress')
      .select('user_id', { count: 'exact', head: true })
      .gt('total_xp', xpState.progress.total_xp);
    xpState.myRank = (aheadCount || 0) + 1;
  } catch (e) {
    console.error('xp_system: falha ao buscar dados de XP', e);
  }
}

// ── BADGE NO HEADER ─────────────────────────────────────────────
function xpRenderBadge(user) {
  const chip = document.getElementById('user-chip');
  if (!chip || !user) return;
  let badge = document.getElementById('xp-level-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'xp-level-badge';
    badge.className = 'xp-badge-pill';
    const nameSpan = document.getElementById('user-display-name');
    if (nameSpan && nameSpan.parentNode) nameSpan.parentNode.insertBefore(badge, nameSpan.nextSibling);
    else chip.appendChild(badge);
  }
  const lvl = xpState.progress ? xpState.progress.level : 1;
  badge.textContent = `Nv.${lvl}`;
  badge.title = xpTitleForLevel(lvl) + ' — clique pra ver seu progresso';
  badge.onclick = () => {
    const dashTab = document.querySelector('nav.tabs .tab');
    if (dashTab && typeof window.go === 'function') window.go('dash', dashTab);
  };
}

// ── PAINEL NO DASHBOARD ──────────────────────────────────────────
function xpRenderDashPanel() {
  if (!xpState.loaded) return;
  const dash = document.getElementById('dash');
  if (!dash) return;
  let wrap = document.getElementById('xp-panel-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'xp-panel-wrap';
    dash.insertBefore(wrap, dash.firstChild);
  }

  const prog = xpState.progress || { total_xp: 0, level: 1 };
  const { next, pct } = xpProgressInfo(prog.level, prog.total_xp);
  const title = xpTitleForLevel(prog.level);
  const myName = xpState.myProfile && xpState.myProfile.display_name;

  const achvCount = (xpState.achievements || []).length;
  const recentAchv = (xpState.achievements || []).slice(0, 8).map(a => `
    <div class="xp-achv-chip" title="${((a.meta && a.meta.description) || '').replace(/"/g, '&quot;')}">
      <span class="xp-achv-icon">${xpAchievementIcon(a)}</span>
      <span>${xpAchievementLabel(a)}</span>
      ${a.is_pioneer ? '<span class="xp-pioneer-badge" title="Primeiro a desbloquear!">🥇 pioneiro</span>' : ''}
    </div>`).join('');

  const myUid = (typeof uid === 'function') ? uid() : null;
  const boardRows = (xpState.leaderboard || []).map((r, i) => {
    const isMe = r.user_id === myUid;
    const nm = xpEscapeHtml(xpDisplayName(r.user_id, xpState.namesByUid ? xpState.namesByUid[r.user_id] : null));
    return `<div class="xp-board-row ${isMe ? 'xp-board-me' : ''}">
      <span class="xp-board-pos">${i + 1}º</span>
      <span class="xp-board-name">${nm}</span>
      <span class="xp-board-title">${xpTitleForLevel(r.level)}</span>
      <span class="xp-board-lvl">Nv.${r.level}</span>
      <span class="xp-board-xp">${(r.total_xp || 0).toLocaleString('pt-BR')} XP</span>
    </div>`;
  }).join('');

  // se eu não estou no top 10, mostra minha posição real separada
  // (com "..." de divisor), pra sempre saber onde estou
  const amIInTop10 = (xpState.leaderboard || []).some(r => r.user_id === myUid);
  let myRankBlock = '';
  if (!amIInTop10 && xpState.myRank) {
    const myName2 = xpEscapeHtml(xpDisplayName(myUid, myName));
    myRankBlock = `
      <div class="xp-board-divider">⋯</div>
      <div class="xp-board-row xp-board-me">
        <span class="xp-board-pos">${xpState.myRank}º</span>
        <span class="xp-board-name">${myName2}</span>
        <span class="xp-board-title">${title}</span>
        <span class="xp-board-lvl">Nv.${prog.level}</span>
        <span class="xp-board-xp">${(prog.total_xp || 0).toLocaleString('pt-BR')} XP</span>
      </div>`;
  }

  wrap.innerHTML = `
    <div class="sec-title" style="margin-top:0">🏆 Seu Progresso</div>
    <div class="xp-progress-panel">
      <div class="xp-progress-top">
        <div class="xp-progress-level">Nível ${prog.level}</div>
        <div class="xp-progress-title">${title}</div>
      </div>
      <div class="xp-progress-bar-track"><div class="xp-progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="xp-progress-sub">${(prog.total_xp || 0).toLocaleString('pt-BR')} XP — faltam ${Math.max(0, next - prog.total_xp).toLocaleString('pt-BR')} XP pro nível ${prog.level + 1}</div>
      <button class="xp-btn xp-btn-ghost xp-btn-sm" style="margin-top:10px" onclick="xpOpenNameModal()">${myName ? `✎ mudar nome (${xpEscapeHtml(myName)})` : 'Definir nome de exibição'}</button>
    </div>

    <div class="dual" style="margin-top:16px">
      <div class="panel">
        <div class="panel-t">🎖️ Conquistas (${achvCount})</div>
        <div class="xp-achv-grid">${recentAchv || '<div class="xp-empty">Nenhuma conquista ainda — marca uma carta no fichário pra começar!</div>'}</div>
      </div>
      <div class="panel">
        <div class="panel-t">📊 Ranking — Top 10${xpState.myRank ? ` · Você: ${xpState.myRank}º` : ''}</div>
        <div class="xp-board">${boardRows || '<div class="xp-empty">Ranking vazio por enquanto.</div>'}${myRankBlock}</div>
      </div>
    </div>`;
}

// ── MODAL "DEFINIR NOME" ─────────────────────────────────────────
function xpOpenNameModal() {
  const existing = document.getElementById('xp-name-modal');
  if (existing) existing.remove();
  const current = (xpState.myProfile && xpState.myProfile.display_name) || '';
  const html = `
    <div id="xp-name-modal" class="xp-modal-overlay" onclick="if(event.target===this) this.remove()">
      <div class="xp-modal-box">
        <div class="xp-modal-title">Como você quer aparecer no ranking?</div>
        <input id="xp-name-input" class="xp-modal-input" maxlength="24" placeholder="Seu nome ou apelido" value="${current.replace(/"/g, '&quot;')}">
        <div class="xp-modal-actions">
          <button class="xp-btn xp-btn-ghost" onclick="document.getElementById('xp-name-modal').remove()">Cancelar</button>
          <button class="xp-btn xp-btn-primary" onclick="xpSaveName()">Salvar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => document.getElementById('xp-name-input')?.focus(), 50);
}
async function xpSaveName() {
  const input = document.getElementById('xp-name-input');
  const val = (input?.value || '').trim();
  if (!val) { alert('Digita um nome ou apelido.'); return; }
  const myUid = (typeof uid === 'function') ? uid() : null;
  if (!myUid) return;
  const { error } = await sbClient.from('profiles').upsert({ user_id: myUid, display_name: val }, { onConflict: 'user_id' });
  if (error) { alert('Não foi possível salvar. Tenta de novo.'); console.error(error); return; }
  xpState.myProfile = { display_name: val };
  document.getElementById('xp-name-modal')?.remove();
  xpRenderBadge(currentUser);
  if (document.getElementById('dash')?.classList.contains('active')) xpRenderDashPanel();
}

// ── TOAST ─────────────────────────────────────────────────────────
function xpToast(msg) {
  const el = document.createElement('div');
  el.className = 'xp-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, 4200);
}

// ── HOOKS (monkey-patch, sem tocar em app.js) ────────────────────
(function hookXpSystem() {
  function tryHook() {
    if (typeof window.go !== 'function' || typeof window._updateUserChip !== 'function' ||
        typeof window.toggleSlot !== 'function' || !xpHasClient()) {
      setTimeout(tryHook, 50);
      return;
    }

    const originalGo = window.go;
    window.go = function (id, el) {
      originalGo(id, el);
      if (id === 'dash') xpRenderDashPanel();
    };

    const originalChip = window._updateUserChip;
    window._updateUserChip = function (user) {
      originalChip(user);
      if (user) {
        xpFetchAll().then(() => {
          xpRenderBadge(user);
          if (document.getElementById('dash')?.classList.contains('active')) xpRenderDashPanel();
        });
      }
    };

    const originalToggle = window.toggleSlot;
    window.toggleSlot = async function (key) {
      const prevLevel = xpState.progress ? xpState.progress.level : null;
      // #33 (23/07/2026): antes o XP só aparecia depois, na Dashboard — o
      // Eduardo pediu feedback imediato ao marcar a carta. Guarda o total
      // de XP de ANTES pra calcular a diferença real (não é um valor
      // chutado no cliente — vem do mesmo fetch que já é feito aqui).
      const prevXp = xpState.progress ? xpState.progress.total_xp : null;
      const prevAchvCodes = new Set((xpState.achievements || []).map(a => a.achievement_code));
      await originalToggle(key);
      // pequeno respiro pra garantir que o trigger do Supabase já commitou
      setTimeout(async () => {
        await xpFetchAll();
        xpRenderBadge(currentUser);
        if (document.getElementById('dash')?.classList.contains('active')) xpRenderDashPanel();
        if (prevXp != null && xpState.progress && xpState.progress.total_xp > prevXp) {
          xpToast(`✨ +${xpState.progress.total_xp - prevXp} XP`);
        }
        if (prevLevel != null && xpState.progress && xpState.progress.level > prevLevel) {
          xpToast(`🎉 Você subiu para o nível ${xpState.progress.level} — ${xpTitleForLevel(xpState.progress.level)}!`);
        }
        (xpState.achievements || [])
          .filter(a => !prevAchvCodes.has(a.achievement_code))
          .forEach((a, i) => setTimeout(() => xpToast(`🏆 Conquista desbloqueada: ${xpAchievementLabel(a)}`), 350 + i * 350));
      }, 500);
    };
  }
  tryHook();
})();

// Cobre o caso do evento de auth já ter disparado antes deste script
// terminar de instalar os hooks (mesma janela de segurança que
// admin_stats.js usa com 800ms — aqui 900ms, roda logo depois).
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(async () => {
    if (typeof currentUser !== 'undefined' && currentUser) {
      await xpFetchAll();
      xpRenderBadge(currentUser);
      const dash = document.getElementById('dash');
      if (dash && dash.classList.contains('active')) xpRenderDashPanel();
    }
  }, 900);
});

// ================================================================
// CSS — injetado aqui, não mexe em style.css
// ================================================================
(function injectXpStyles() {
  const css = `
.xp-badge-pill{display:inline-flex;align-items:center;margin-left:6px;padding:2px 8px;background:linear-gradient(90deg,var(--accent),var(--gold));color:#fff;border-radius:20px;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:.5px;white-space:nowrap;}
.xp-progress-panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin-bottom:8px;}
.xp-progress-top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px;}
.xp-progress-level{font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--accent);letter-spacing:1px;}
.xp-progress-title{font-family:'Space Mono',monospace;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;}
.xp-progress-bar-track{height:10px;border-radius:6px;background:var(--surface2);overflow:hidden;border:1px solid var(--border);}
.xp-progress-bar-fill{height:100%;background:linear-gradient(90deg,var(--teal),var(--accent2));transition:width .4s ease;}
.xp-progress-sub{margin-top:6px;font-size:11px;color:var(--muted);font-family:'Space Mono',monospace;}
.xp-achv-grid{display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;}
.xp-achv-chip{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border-radius:10px;font-size:12px;color:var(--text2);}
.xp-achv-icon{font-size:16px;}
.xp-pioneer-badge{margin-left:auto;font-size:9px;background:var(--gold);color:#fff;padding:2px 6px;border-radius:8px;white-space:nowrap;}
.xp-board{display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;}
.xp-board-row{display:grid;grid-template-columns:32px 1fr auto auto auto;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;font-size:12px;}
.xp-board-me{background:var(--surface3);font-weight:700;}
.xp-board-divider{text-align:center;color:var(--muted2);font-size:11px;padding:2px 0;}
.xp-board-pos{color:var(--muted);font-family:'Space Mono',monospace;}
.xp-board-name{color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.xp-board-title{color:var(--muted2);font-size:10px;text-transform:uppercase;}
.xp-board-lvl{color:var(--accent);font-family:'Space Mono',monospace;}
.xp-board-xp{color:var(--muted);font-family:'Space Mono',monospace;font-size:10px;white-space:nowrap;}
.xp-btn{border:none;border-radius:20px;padding:6px 14px;font-family:'Space Mono',monospace;font-size:11px;cursor:pointer;}
.xp-btn-primary{background:var(--accent);color:#fff;}
.xp-btn-ghost{background:transparent;color:var(--accent);border:1px solid var(--border2);}
.xp-btn-sm{padding:4px 10px;font-size:10px;}
.xp-empty{font-size:12px;color:var(--muted);padding:12px;text-align:center;}
.xp-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;}
.xp-modal-box{background:var(--surface);border-radius:14px;padding:24px;width:90%;max-width:340px;box-shadow:0 10px 40px rgba(0,0,0,.3);}
.xp-modal-title{font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--text);margin-bottom:12px;}
.xp-modal-input{width:100%;padding:10px 12px;border:1px solid var(--border2);border-radius:8px;font-size:14px;margin-bottom:14px;box-sizing:border-box;}
.xp-modal-actions{display:flex;justify-content:flex-end;gap:8px;}
.xp-toast{position:fixed;bottom:20px;right:20px;background:var(--text);color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:10000;max-width:300px;animation:xpToastIn .3s ease;}
@keyframes xpToastIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
@media (max-width:768px){
  .xp-board-row{grid-template-columns:24px 1fr auto;}
  .xp-board-title{display:none;}
  .xp-badge-pill{font-size:9px;}
}`;
  const style = document.createElement('style');
  style.setAttribute('data-source', 'xp_system.js');
  style.textContent = css;
  document.head.appendChild(style);
})();
