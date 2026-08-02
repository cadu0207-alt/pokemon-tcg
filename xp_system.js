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
// FIX 16/07/2026: sbClient é const em app.js — const no topo de um
// script clássico NÃO vira propriedade de window. Referenciar direto
// via xpHasClient().
//
// PACOTE 18/07/2026: nome de exibição virou 100% gerado automaticamente
// (sem campo de texto livre — decisão pra eliminar o vetor de XSS na
// raiz, não só escapar). Som + efeito visual em level-up/conquista.
// Loading state no painel. Roteiro de conquistas bloqueadas com
// progresso (usa RPC fn_xp_achievement_progress). Feed de atividade
// global (usa RPC fn_xp_recent_activity). xpEscapeHtml() continua
// aplicado em todo nome renderizado — defesa em profundidade, mesmo
// não havendo mais texto livre do usuário.
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
function xpCumulative(L) { return 25 * L * (L + 1); }
function xpProgressInfo(level, totalXp) {
  const floor = level - 1;
  const start = xpCumulative(floor);
  const next = xpCumulative(level);
  const pct = next > start ? Math.max(0, Math.min(100, Math.round((totalXp - start) / (next - start) * 100))) : 100;
  return { start, next, pct };
}
function xpDisplayName(userId, rawName) {
  if (rawName) return rawName.trim().split(' ')[0];
  return 'Treinador #' + String(userId || '').slice(-4).toUpperCase();
}
const XP_ACHV_CATEGORY_LABEL = {
  set_complete: '📦 Sets Completos', master_set: '👑 Master Sets',
  volume: '🗂️ Marcos de Volume', master_volume: '🏆 Marcos de Master Set', geral: '⭐ Gerais',
};
function xpAchievementCategory(code, meta) {
  if (meta && meta.category === 'set_complete') return 'set_complete';
  if (meta && meta.category === 'master_set') return 'master_set';
  if (/^cards_/.test(code)) return 'volume';
  if (/^master_sets_/.test(code) || code === 'first_master_set') return 'master_volume';
  return 'geral';
}
function xpAchievementLabel(a) {
  const meta = a.meta || a;
  if (meta.title) return meta.title;
  if (meta.set_code) {
    const catalog = (typeof SET_CATALOG !== 'undefined') ? SET_CATALOG : [];
    const setInfo = catalog.find(s => s.id === meta.set_code);
    const setLabel = setInfo ? `${setInfo.emoji || ''} ${setInfo.label || meta.set_code}`.trim() : meta.set_code;
    const suffix = meta.category === 'master_set' ? 'Master Set' : 'Set Completo';
    return `${setLabel} — ${suffix}`;
  }
  return meta.title || a.achievement_code || a.code;
}
function xpAchievementIcon(a) {
  const meta = a.meta || a;
  if (meta.icon) return meta.icon;
  return meta.category === 'master_set' ? '👑' : '✅';
}
function xpHasClient() {
  return typeof sbClient !== 'undefined' && !!sbClient;
}
// SEGURANÇA 16/07/2026: display_name aparece pra TODO MUNDO no ranking —
// sempre escapar antes de innerHTML. Desde 18/07 o nome nunca vem de
// texto livre do usuário (gerado automaticamente), mas mantemos o
// escape como defesa em profundidade.
function xpEscapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str == null ? '' : str);
  return d.innerHTML;
}

// ── GERADOR DE NOME (18/07/2026 — sem texto livre) ────────────────
// Decisão: em vez do usuário digitar (risco de conteúdo malicioso/
// ofensivo via API direta), o nome é sorteado de listas fixas.
// Limite de tamanho é automático (maior nome possível ~22 chars).
const XP_NAME_ADJ = ['Sombrio','Radiante','Veloz','Audaz','Místico','Dourado','Cristalino','Feroz','Lendário','Sereno','Elétrico','Ancestral'];
const XP_NAME_NOUN = ['Treinador','Caçador','Mestre','Guardião','Explorador','Colecionador','Campeão','Aprendiz'];
function xpGenerateRandomName() {
  const adj = XP_NAME_ADJ[Math.floor(Math.random() * XP_NAME_ADJ.length)];
  const noun = XP_NAME_NOUN[Math.floor(Math.random() * XP_NAME_NOUN.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${noun} ${adj} #${num}`;
}
async function xpEnsureName(myUid) {
  if (!myUid) return;
  const { data } = await sbClient.from('profiles').select('display_name').eq('user_id', myUid).maybeSingle();
  if (data && data.display_name) { xpState.myProfile = data; return; }
  const name = xpGenerateRandomName();
  const { error } = await sbClient.from('profiles').upsert({ user_id: myUid, display_name: name }, { onConflict: 'user_id' });
  if (!error) xpState.myProfile = { display_name: name };
}
async function xpRerollName() {
  const myUid = (typeof uid === 'function') ? uid() : null;
  if (!myUid) return;
  const name = xpGenerateRandomName();
  const { error } = await sbClient.from('profiles').upsert({ user_id: myUid, display_name: name }, { onConflict: 'user_id' });
  if (error) { xpToast('Não foi possível trocar o nome agora.'); return; }
  xpState.myProfile = { display_name: name };
  xpRenderBadge(currentUser);
  if (document.getElementById('dash')?.classList.contains('active')) xpRenderDashPanel();
  xpToast(`Novo nome: ${name}`);
}

// ── SOM (Web Audio, sem asset externo) ────────────────────────────
function xpSoundMuted() { return localStorage.getItem('xp_muted') === '1'; }
function xpToggleMute() {
  localStorage.setItem('xp_muted', xpSoundMuted() ? '0' : '1');
  const btn = document.getElementById('xp-mute-btn');
  if (btn) btn.textContent = xpSoundMuted() ? '🔇' : '🔊';
}
let xpAudioCtx = null;
function xpPlaySound(kind) {
  if (xpSoundMuted()) return;
  try {
    xpAudioCtx = xpAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = xpAudioCtx;
    const notes = kind === 'levelup' ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
    notes.forEach((freq, i) => {
      const t0 = ctx.currentTime + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.26);
    });
  } catch (e) { /* AudioContext pode falhar sem interação prévia — silencioso */ }
}

// ── EFEITO VISUAL (confete leve em CSS puro) ──────────────────────
function xpBurst(target) {
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const colors = ['#e63946', '#ffd166', '#06d6a0', '#4361ee'];
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('div');
    p.className = 'xp-particle';
    p.style.left = (rect.left + rect.width / 2) + 'px';
    p.style.top = (rect.top + rect.height / 2) + 'px';
    p.style.background = colors[i % colors.length];
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 60;
    p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}
function xpPulse(el) {
  if (!el) return;
  el.classList.remove('xp-pulse'); void el.offsetWidth; el.classList.add('xp-pulse');
}

// ── ESTADO ──────────────────────────────────────────────────────
let xpState = { progress: null, achievements: [], allAchievements: [], progressByCode: {}, recentActivity: [], leaderboard: [], namesByUid: {}, myProfile: null, myRank: null, loaded: false };

async function xpFetchAll() {
  const myUid = (typeof uid === 'function') ? uid() : null;
  if (!myUid || !xpHasClient()) return;
  try {
    await xpEnsureName(myUid);
    const [{ data: prog }, { data: myAchv }, { data: allAchv }, { data: board }, progRes, actRes] = await Promise.all([
      sbClient.from('user_progress').select('total_xp,level').eq('user_id', myUid).maybeSingle(),
      sbClient.from('user_achievements').select('achievement_code,unlocked_at,is_pioneer').eq('user_id', myUid),
      sbClient.from('achievements').select('code,title,description,icon,category,set_code,xp_bonus'),
      sbClient.from('user_progress').select('user_id,total_xp,level').order('total_xp', { ascending: false }).limit(10),
      sbClient.rpc('fn_xp_achievement_progress', { p_user_id: myUid }),
      sbClient.rpc('fn_xp_recent_activity', { p_limit: 12 }),
    ]);
    const achMap = Object.fromEntries((allAchv || []).map(a => [a.code, a]));
    xpState.progress = prog || { total_xp: 0, level: 1 };
    xpState.achievements = (myAchv || [])
      .map(ua => ({ ...ua, meta: achMap[ua.achievement_code] }))
      .sort((a, b) => new Date(b.unlocked_at) - new Date(a.unlocked_at));
    xpState.allAchievements = allAchv || [];
    xpState.progressByCode = Object.fromEntries(((progRes && progRes.data) || []).map(r => [r.achievement_code, r]));
    xpState.recentActivity = (actRes && actRes.data) || [];
    xpState.leaderboard = board || [];
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
  const prevLvl = badge.dataset.lvl ? parseInt(badge.dataset.lvl, 10) : null;
  badge.textContent = `Nv.${lvl}`;
  badge.title = xpTitleForLevel(lvl) + ' — clique pra ver seu progresso';
  badge.onclick = () => {
    const dashTab = document.querySelector('nav.tabs .tab');
    if (dashTab && typeof window.go === 'function') window.go('dash', dashTab);
  };
  if (prevLvl != null && lvl > prevLvl) xpPulse(badge);
  badge.dataset.lvl = String(lvl);

  if (!xpState._introShown && !localStorage.getItem('xp_intro_seen')) {
    xpState._introShown = true;
    localStorage.setItem('xp_intro_seen', '1');
    setTimeout(() => xpToast('🎮 Novo: sistema de XP! Clique no seu nível pra ver conquistas e ranking.'), 1200);
  }
}

// ── PAINEL NO DASHBOARD ──────────────────────────────────────────
function xpRenderLoading() {
  const dash = document.getElementById('dash');
  if (!dash) return;
  let wrap = document.getElementById('xp-panel-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'xp-panel-wrap';
    dash.insertBefore(wrap, dash.firstChild);
  }
  wrap.innerHTML = `
    <div class="sec-title" style="margin-top:0">🏆 Seu Progresso</div>
    <div class="xp-skel xp-skel-bar"></div>
    <div class="xp-skel xp-skel-line" style="width:60%"></div>
    <div class="dual" style="margin-top:16px">
      <div class="panel"><div class="xp-skel xp-skel-line" style="width:40%"></div><div class="xp-skel xp-skel-block"></div></div>
      <div class="panel"><div class="xp-skel xp-skel-line" style="width:40%"></div><div class="xp-skel xp-skel-block"></div></div>
    </div>`;
}

function xpRenderDashPanel() {
  if (!xpState.loaded) { xpRenderLoading(); return; }
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
  const myNameEsc = xpEscapeHtml(myName || '');

  // ── Vitrine completa de conquistas: desbloqueadas + bloqueadas com progresso ──
  const unlockedCodes = new Set((xpState.achievements || []).map(a => a.achievement_code));
  const unlockedByCode = Object.fromEntries((xpState.achievements || []).map(a => [a.achievement_code, a]));
  const groups = {};
  (xpState.allAchievements || []).forEach(a => {
    const cat = xpAchievementCategory(a.code, a);
    (groups[cat] = groups[cat] || []).push(a);
  });
  const catOrder = ['set_complete', 'master_set', 'volume', 'master_volume', 'geral'];
  let gallery = '';
  catOrder.forEach(cat => {
    const items = groups[cat]; if (!items || !items.length) return;
    const chips = items.map(a => {
      const isUnlocked = unlockedCodes.has(a.code);
      const ua = unlockedByCode[a.code];
      const label = xpAchievementLabel(a);
      if (isUnlocked) {
        return `<div class="xp-achv-chip xp-achv-done" title="${xpEscapeHtml(a.description || '')}">
          <span class="xp-achv-icon">${xpAchievementIcon(a)}</span>
          <span>${xpEscapeHtml(label)}</span>
          ${ua && ua.is_pioneer ? '<span class="xp-pioneer-badge" title="Primeiro a desbloquear!">🥇</span>' : ''}
          <button class="xp-share-btn" title="Copiar pra compartilhar" onclick="xpShareAchievement('${String(a.code).replace(/[^a-zA-Z0-9_]/g, '')}')">↗</button>
        </div>`;
      }
      const p = xpState.progressByCode[a.code];
      const pctDone = p && p.target_count > 0 ? Math.min(100, Math.round((p.current_count / p.target_count) * 100)) : 0;
      const missing = p ? Math.max(0, p.target_count - p.current_count) : null;
      return `<div class="xp-achv-chip xp-achv-locked" title="${xpEscapeHtml(a.description || '')}">
        <span class="xp-achv-icon">🔒</span>
        <span>${xpEscapeHtml(label)}${missing != null ? ` — faltam ${missing}` : ''}</span>
        <div class="xp-achv-mini-track"><div class="xp-achv-mini-fill" style="width:${pctDone}%"></div></div>
      </div>`;
    }).join('');
    gallery += `<div class="xp-achv-group-title">${XP_ACHV_CATEGORY_LABEL[cat] || cat}</div>${chips}`;
  });

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

  const amIInTop10 = (xpState.leaderboard || []).some(r => r.user_id === myUid);
  let myRankBlock = '';
  if (!amIInTop10 && xpState.myRank) {
    myRankBlock = `
      <div class="xp-board-divider">⋯</div>
      <div class="xp-board-row xp-board-me">
        <span class="xp-board-pos">${xpState.myRank}º</span>
        <span class="xp-board-name">${myNameEsc}</span>
        <span class="xp-board-title">${title}</span>
        <span class="xp-board-lvl">Nv.${prog.level}</span>
        <span class="xp-board-xp">${(prog.total_xp || 0).toLocaleString('pt-BR')} XP</span>
      </div>`;
  }

  const activityRows = (xpState.recentActivity || []).slice(0, 10).map(ev => {
    const nm = xpEscapeHtml(xpDisplayName(ev.user_id, ev.display_name));
    const label = xpAchievementLabel({ code: ev.achievement_code, meta: xpState.allAchievements.find(a => a.code === ev.achievement_code) });
    const when = ev.unlocked_at ? new Date(ev.unlocked_at).toLocaleDateString('pt-BR') : '';
    return `<div class="xp-activity-row"><b>${nm}</b> desbloqueou <span>${xpEscapeHtml(label)}</span><span class="xp-activity-when">${when}</span></div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="sec-title" style="margin-top:0">🏆 Seu Progresso</div>
    <div class="xp-progress-panel">
      <div class="xp-progress-top">
        <div class="xp-progress-level">Nível ${prog.level}</div>
        <div class="xp-progress-title">${title}</div>
        <button id="xp-mute-btn" class="xp-btn xp-btn-ghost xp-btn-sm" style="margin-left:auto" onclick="xpToggleMute()" title="Ligar/desligar som">${xpSoundMuted() ? '🔇' : '🔊'}</button>
      </div>
      <div class="xp-progress-bar-track"><div class="xp-progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="xp-progress-sub">${(prog.total_xp || 0).toLocaleString('pt-BR')} XP — faltam ${Math.max(0, next - prog.total_xp).toLocaleString('pt-BR')} XP pro nível ${prog.level + 1}</div>
      <div class="xp-name-row">Você é <b>${myNameEsc}</b> no ranking. <button class="xp-btn xp-btn-ghost xp-btn-sm" onclick="xpRerollName()">🎲 sortear outro nome</button></div>
    </div>

    <div class="dual" style="margin-top:16px">
      <div class="panel">
        <div class="panel-t">🎖️ Conquistas — roteiro completo</div>
        <div class="xp-achv-grid">${gallery || '<div class="xp-empty">Carregando conquistas…</div>'}</div>
      </div>
      <div class="panel">
        <div class="panel-t">📊 Ranking — Top 10${xpState.myRank ? ` · Você: ${xpState.myRank}º` : ''}</div>
        <div class="xp-board">${boardRows || '<div class="xp-empty">Ranking vazio por enquanto.</div>'}${myRankBlock}</div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="panel-t">📰 Atividade recente</div>
      <div class="xp-activity-feed">${activityRows || '<div class="xp-empty">Ninguém desbloqueou nada ainda.</div>'}</div>
    </div>`;
}

function xpShareAchievement(code) {
  const a = (xpState.allAchievements || []).find(x => x.code === code);
  const ua = (xpState.achievements || []).find(x => x.achievement_code === code);
  if (!a) return;
  const label = xpAchievementLabel(a);
  const myName = (xpState.myProfile && xpState.myProfile.display_name) || 'Treinador';
  const text = `🏆 ${myName} desbloqueou "${label}" no MyDeck! ${ua && ua.is_pioneer ? '(pioneiro 🥇) ' : ''}mydecktcg.com.br`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => xpToast('📋 Copiado! Cola onde quiser compartilhar.'));
  } else {
    xpToast(text);
  }
}

// ── TOAST ─────────────────────────────────────────────────────────
function xpToast(msg) {
  const el = document.createElement('div');
  el.className = 'xp-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  xpBurst(el);
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
        if (document.getElementById('dash')?.classList.contains('active')) xpRenderLoading();
        xpFetchAll().then(() => {
          xpRenderBadge(user);
          if (document.getElementById('dash')?.classList.contains('active')) xpRenderDashPanel();
        });
      }
    };

    const originalToggle = window.toggleSlot;
    window.toggleSlot = async function (key) {
      const prevLevel = xpState.progress ? xpState.progress.level : null;
      // #33 (23/07/2026): feedback imediato ao marcar a carta — guarda o
      // total de XP de ANTES pra calcular a diferença real (não é um
      // valor chutado no cliente, vem do mesmo fetch de sempre).
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
          xpPlaySound('levelup');
          xpToast(`🎉 Você subiu para o nível ${xpState.progress.level} — ${xpTitleForLevel(xpState.progress.level)}!`);
        }
        (xpState.achievements || [])
          .filter(a => !prevAchvCodes.has(a.achievement_code))
          .forEach((a, i) => setTimeout(() => {
            xpPlaySound('achievement');
            xpToast(`🏆 Conquista desbloqueada: ${xpAchievementLabel(a)}`);
          }, 350 + i * 500));
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
      if (document.getElementById('dash')?.classList.contains('active')) xpRenderLoading();
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
.xp-badge-pill{display:inline-flex;align-items:center;margin-left:6px;padding:2px 8px;background:linear-gradient(90deg,var(--accent),var(--gold));color:#fff;border-radius:20px;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:.5px;white-space:nowrap;transition:transform .2s;}
.xp-badge-pill.xp-pulse{animation:xpBadgePulse 1.6s ease;}
@keyframes xpBadgePulse{0%{transform:scale(1)}20%{transform:scale(1.5)}40%{transform:scale(1.15)}60%{transform:scale(1.35)}100%{transform:scale(1)}}
.xp-progress-panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin-bottom:8px;}
.xp-progress-top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px;}
.xp-progress-level{font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--accent);letter-spacing:1px;}
.xp-progress-title{font-family:'Space Mono',monospace;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;}
.xp-progress-bar-track{height:10px;border-radius:6px;background:var(--surface2);overflow:hidden;border:1px solid var(--border);}
.xp-progress-bar-fill{height:100%;background:linear-gradient(90deg,var(--teal),var(--accent2));transition:width .4s ease;}
.xp-progress-sub{margin-top:6px;font-size:11px;color:var(--muted);font-family:'Space Mono',monospace;}
.xp-name-row{margin-top:10px;font-size:12px;color:var(--text2);}
.xp-achv-group-title{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted2);margin:10px 0 4px;font-family:'Space Mono',monospace;}
.xp-achv-grid{display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;}
.xp-achv-chip{position:relative;display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border-radius:10px;font-size:12px;color:var(--text2);}
.xp-achv-locked{opacity:.6;flex-wrap:wrap;}
.xp-achv-mini-track{flex:1 0 100%;height:4px;border-radius:3px;background:var(--surface3,#eee);overflow:hidden;margin-top:4px;}
.xp-achv-mini-fill{height:100%;background:var(--teal);}
.xp-achv-icon{font-size:16px;}
.xp-pioneer-badge{margin-left:auto;font-size:9px;background:var(--gold);color:#fff;padding:2px 6px;border-radius:8px;white-space:nowrap;}
.xp-share-btn{margin-left:auto;background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px;}
.xp-share-btn:hover{color:var(--accent);}
.xp-board{display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;}
.xp-board-row{display:grid;grid-template-columns:32px 1fr auto auto auto;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;font-size:12px;}
.xp-board-me{background:var(--surface3);font-weight:700;}
.xp-board-divider{text-align:center;color:var(--muted2);font-size:11px;padding:2px 0;}
.xp-board-pos{color:var(--muted);font-family:'Space Mono',monospace;}
.xp-board-name{color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.xp-board-title{color:var(--muted2);font-size:10px;text-transform:uppercase;}
.xp-board-lvl{color:var(--accent);font-family:'Space Mono',monospace;}
.xp-board-xp{color:var(--muted);font-family:'Space Mono',monospace;font-size:10px;white-space:nowrap;}
.xp-activity-feed{display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;font-size:12px;}
.xp-activity-row{padding:6px 8px;background:var(--surface2);border-radius:8px;color:var(--text2);}
.xp-activity-row span{color:var(--muted);}
.xp-activity-when{float:right;font-size:10px;font-family:'Space Mono',monospace;}
.xp-btn{border:none;border-radius:20px;padding:6px 14px;font-family:'Space Mono',monospace;font-size:11px;cursor:pointer;}
.xp-btn-ghost{background:transparent;color:var(--accent);border:1px solid var(--border2);}
.xp-btn-sm{padding:4px 10px;font-size:10px;}
.xp-empty{font-size:12px;color:var(--muted);padding:12px;text-align:center;}
.xp-skel{background:linear-gradient(90deg,var(--surface2) 25%,var(--surface3,#eee) 50%,var(--surface2) 75%);background-size:200% 100%;animation:xpSkelWave 1.4s infinite;border-radius:8px;}
.xp-skel-bar{height:32px;margin-bottom:10px;}
.xp-skel-line{height:12px;margin-bottom:8px;}
.xp-skel-block{height:120px;margin-top:8px;}
@keyframes xpSkelWave{0%{background-position:200% 0}100%{background-position:-200% 0}}
.xp-toast{position:fixed;bottom:20px;right:20px;background:var(--text);color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:10000;max-width:300px;animation:xpToastIn .3s ease;}
@keyframes xpToastIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
.xp-particle{position:fixed;width:6px;height:6px;border-radius:50%;pointer-events:none;z-index:10001;animation:xpParticleFly .65s ease-out forwards;}
@keyframes xpParticleFly{to{transform:translate(var(--dx),var(--dy));opacity:0;}}
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
