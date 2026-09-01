// ================================================================
// MyDeck — Ranking de Batalhas na aba Início (inicio_ranking.js)
// ================================================================
// Painel lateral ao lado do Feed do Mundo Pokémon (ver .inicio-side-col
// em index.html/style.css) com o ranking de vitórias em batalhas
// (wild_battle_log / battle_random_opponent, ver wild_pokemon.js e
// wild_ranking_setup.sql) — 4 abas: Hoje / Semana / Mês / Total.
//
// Público mesmo sem login (a aba Início não exige — ver cabeçalho de
// inicio.js): quem não está logado vê o ranking mas não o formulário de
// definir nome (esse exige estar logado, óbvio).
//
// Nome exibido: cada jogador escolhe livremente o próprio (RPC
// set_display_name, com validação de tamanho/caracteres + filtro de
// termos ofensivos no servidor — ver wild_ranking_setup.sql). Sem nome
// definido, aparece "Treinador Anônimo".
//
// Depende de sbClient/currentUser (app.js) já definidos — carrega depois
// (ver <script defer> em index.html, logo após wild_pokemon.js).
// ================================================================

(function () {
  'use strict';

  const IRK_PERIODS = [
    { key: 'day', label: 'Hoje' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mês' },
    { key: 'all', label: 'Total' },
  ];
  let irkActivePeriod = 'day';

  function irkHasClient() { return typeof sbClient !== 'undefined' && !!sbClient; }
  function irkUid() { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null; }

  // Mesmo escape usado no resto da aba Início — nome vem de outro
  // usuário (display_name é livre), então nunca pode ir cru pro innerHTML.
  function irkEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function irkMedal(pos) {
    return pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : String(pos);
  }

  async function irkFetchMyName() {
    if (!irkHasClient() || !irkUid()) return null;
    const { data, error } = await sbClient.from('wild_loadout').select('display_name').eq('user_id', irkUid()).maybeSingle();
    if (error) { console.warn('[irk] falha ao buscar nome:', error.message); return null; }
    return data ? data.display_name : null;
  }

  async function irkRenderPanel() {
    const holder = document.getElementById('inicio-ranking-wrap');
    if (!holder) return; // aba Início ainda não montou o container

    holder.innerHTML = `
      <div class="inicio-ranking-panel">
        <div class="inicio-ranking-tabs">${IRK_PERIODS.map(p =>
          `<div class="inicio-ranking-tab ${p.key === irkActivePeriod ? 'inicio-ranking-tab-active' : ''}" data-period="${p.key}">${p.label}</div>`
        ).join('')}</div>
        <div class="inicio-ranking-list"><div class="admin-stats-loading">Carregando...</div></div>
        <div class="inicio-ranking-name-form-wrap"></div>
      </div>
    `;

    holder.querySelectorAll('.inicio-ranking-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        irkActivePeriod = tab.dataset.period;
        irkRenderPanel();
      });
    });

    irkLoadList(holder.querySelector('.inicio-ranking-list'));
    irkRenderNameForm(holder.querySelector('.inicio-ranking-name-form-wrap'));
  }

  async function irkLoadList(listEl) {
    if (!irkHasClient()) { listEl.innerHTML = '<div class="inicio-ranking-empty">Ranking indisponível no momento.</div>'; return; }

    const [{ data, error }, myName] = await Promise.all([
      sbClient.rpc('wild_ranking', { p_period: irkActivePeriod }),
      irkFetchMyName(),
    ]);

    if (error) {
      console.warn('[irk] falha ao buscar ranking:', error.message);
      listEl.innerHTML = '<div class="inicio-ranking-empty">Não foi possível carregar o ranking agora.</div>';
      return;
    }
    if (!data || !data.length) {
      listEl.innerHTML = '<div class="inicio-ranking-empty">Ninguém venceu uma batalha neste período ainda.</div>';
      return;
    }

    listEl.innerHTML = data.map((row, i) => {
      const isMe = myName && row.display_name === myName;
      return `<div class="inicio-ranking-row ${isMe ? 'inicio-ranking-me' : ''}">
        <span class="inicio-ranking-pos">${irkMedal(i + 1)}</span>
        <span class="inicio-ranking-name">${irkEsc(row.display_name)}</span>
        <span class="inicio-ranking-wins">${row.wins}V</span>
      </div>`;
    }).join('');
  }

  async function irkRenderNameForm(wrapEl) {
    if (!irkHasClient() || !irkUid()) { wrapEl.innerHTML = ''; return; }
    const myName = await irkFetchMyName();

    wrapEl.innerHTML = `
      <div class="inicio-ranking-name-form">
        <input type="text" class="inicio-ranking-name-input" maxlength="18" placeholder="Seu nome no ranking" value="${irkEsc(myName || '')}">
        <button type="button" class="inicio-ranking-name-save">Salvar</button>
      </div>
      <div class="inicio-ranking-name-hint">3–18 caracteres. Nomes ofensivos são bloqueados.</div>
    `;

    const input = wrapEl.querySelector('.inicio-ranking-name-input');
    const btn = wrapEl.querySelector('.inicio-ranking-name-save');
    const save = async () => {
      const val = input.value.trim();
      if (!val || val === myName) return;
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      const { data, error } = await sbClient.rpc('set_display_name', { p_name: val });
      btn.disabled = false;
      btn.textContent = 'Salvar';
      if (error) {
        alert(error.message); // curto e raro o suficiente (erro de validação) pra não precisar de toast próprio aqui
        return;
      }
      input.value = data.display_name;
      irkLoadList(document.querySelector('.inicio-ranking-list')); // reflete o nome novo na hora, se já estiver no ranking
    };
    btn.addEventListener('click', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  }

  // ── Boot: monta quando a aba Início existir, e recarrega toda vez que
  // o usuário abre a aba (cobre login/logout acontecendo depois do boot).
  function irkTryInit() {
    if (!document.getElementById('inicio-ranking-wrap')) { setTimeout(irkTryInit, 100); return; }
    irkRenderPanel();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', irkTryInit);
  } else {
    irkTryInit();
  }

  // Reaproveita o mesmo hook em window.go que wild_pokemon.js já usa —
  // toda vez que o usuário troca de aba, se ele voltar pra Início o
  // ranking atualiza (pega batalhas novas de outros jogadores).
  (function hookInicioRanking() {
    function tryHook() {
      if (typeof window.go !== 'function') { setTimeout(tryHook, 50); return; }
      const originalGo = window.go;
      window.go = function (id, el) {
        originalGo(id, el);
        if (id === 'inicio') irkRenderPanel();
      };
    }
    tryHook();
  })();
})();
