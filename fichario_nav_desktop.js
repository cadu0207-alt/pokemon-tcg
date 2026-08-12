// fichario_nav_desktop.js — menu desktop do Fichário (12/08/2026).
//
// Pedido do Eduardo: aplicar o MESMO sistema responsivo de dropdown hover
// do menu principal (.tdrop/.tdrop-menu — ver .tdesk em index.html/style.css,
// menu MYDECK/COMPRA E VENDA E LEILÃO/INICIANTES) dentro da aba Fichário.
// Motivo: o catálogo de coleções (SET_CATALOG) já passa de 30 fichários
// oficiais (ME + SV + legados) fora os fichários por artista/manuais — uma
// aba por coleção não cabe mais numa barra só.
//
// Estrutura pedida:
//   ✨ MEUS FICHÁRIOS  → Coleções Gerais (home de sempre) + Por Artista
//                        (lista TODOS os fichários de artista que existem,
//                        não só os fixados)
//   💎 MEGA EVOLUÇÃO   → todos os sets da série ME (me06...mep)
//   🌋 ESCARLATE & VIOLETA → todos os sets da série SV (sv1...svp)
//   ...e assim por diante, um grupo por série em SERIES_META (SWSH, SM, XY,
//   BW, HGSS, DP, EX, CLASSIC) — só aparece grupo pra série que tiver pelo
//   menos 1 set no SET_CATALOG.
//
// Indicador visual pedido: coleção sem NENHUMA carta coletada ainda fica com
// opacidade reduzida (.fic-unowned, style.css); assim que tiver ao menos 1
// carta marcada, volta à cor normal — sinaliza de relance quais coleções
// "já são minhas" em meio a um catálogo grande.
//
// Só ATIVA ≥901px (mobile mantém #binder-tabs de sempre, sem nenhuma
// mudança — ver .fic-tdesk em style.css). Mesmo padrão de monkey-patch já
// usado em fichario_accordion.js/fichario_melhorias_23jul.js/
// fichario_masterdex.js: embrulha window.renderTabs (que essa altura já é a
// versão de fichario_accordion.js) SEM reimplementar nada da lógica de abas
// mobile/customBinders/collected — só lê os mesmos globais que app.js já
// expõe (SET_CATALOG, SERIES_META, SET_CARDS_MAP, myCollections,
// customBinders, pinnedBinders, currentSet, collected, getSlots, slotKey,
// switchSet, getBinderCards, esc). Precisa carregar DEPOIS de
// fichario_accordion.js no index.html.
(function(){

  // Um set "tem carta coletada" se QUALQUER slot (normal/foil/etc) dele
  // estiver no Set `collected` — mesma checagem usada em countSlotsFor/
  // binderProgress (app.js), só que para no primeiro match (.some) porque
  // aqui só precisamos de sim/não, não da contagem exata.
  function fmSetHasAnyCard(id){
    try{
      const cardsFn=typeof SET_CARDS_MAP!=='undefined'?SET_CARDS_MAP[id]:null;
      if(!cardsFn)return false;
      const cards=cardsFn()||[];
      if(typeof collected==='undefined'||typeof getSlots!=='function'||typeof slotKey!=='function')return false;
      return cards.some(c=>getSlots(c,id).some(s=>collected.has(slotKey(id+':',c.n,s.ver))));
    }catch(e){return false;}
  }

  function fmNiceSetLabel(id){
    return id.toUpperCase().replace('SV8PT5','SV8.5').replace('SV6PT5','SV6.5')
              .replace('SV4PT5','SV4.5').replace('SV3PT5','151');
  }

  function fmMeusFicharioisGroup(cur){
    const customList=typeof customBinders!=='undefined'?customBinders:[];
    const artistBinders=customList.filter(b=>b.filter_config&&b.filter_config.type==='artist');
    const pinned=typeof pinnedBinders!=='undefined'?pinnedBinders:[];
    const geraisActive=cur==='__custom__';
    const groupActive=geraisActive||String(cur).startsWith('__cb__');

    const artistItems=artistBinders.length
      ? artistBinders.map(b=>{
          const tabId='__cb__'+b.id;
          const isActive=cur===tabId;
          const n=typeof getBinderCards==='function'?getBinderCards(b).length:0;
          return`<button type="button" class="tdrop-item${isActive?' active':''}" data-tab="${tabId}"
            onclick="switchSet('${tabId}',null)">${b.emoji||'🎨'} ${esc(b.name)} <span class="tdrop-count">${n}</span></button>`;
        }).join('')
      : `<div class="tdrop-item fic-empty-note">Nenhum fichário por artista ainda</div>`;

    const pinnedItems=pinned.length
      ? `<div class="tdrop-label">📌 Fixados</div>` + pinned.map(pid=>{
          const b=customList.find(x=>String(x.id)===pid);
          if(!b)return'';
          const tabId='__cb__'+pid;
          const isActive=cur===tabId;
          return`<button type="button" class="tdrop-item${isActive?' active':''}" data-tab="${tabId}"
            onclick="switchSet('${tabId}',null)">${b.emoji||'📚'} ${esc(b.name)}</button>`;
        }).join('')
      : '';

    return`<div class="tdrop">
      <button type="button" class="tdrop-btn${groupActive?' active':''}">✨ MEUS FICHÁRIOS
        <svg class="tdrop-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="tdrop-menu">
        <button type="button" class="tdrop-item${geraisActive?' active':''}" data-tab="__custom__"
          onclick="switchSet('__custom__',null)">📋 Coleções Gerais</button>
        <div class="tdrop-label">🎨 Por Artista</div>
        ${artistItems}
        ${pinnedItems}
      </div>
    </div>`;
  }

  function fmSeriesGroup(sr,cur){
    const sets=(typeof SET_CATALOG!=='undefined'?SET_CATALOG:[]).filter(s=>s.series===sr);
    if(!sets.length)return'';
    const meta=(typeof SERIES_META!=='undefined'&&SERIES_META[sr])||{sub:sr};
    const ownedCount=sets.filter(s=>!s.upcoming&&fmSetHasAnyCard(s.id)).length;
    const groupActive=sets.some(s=>s.id===cur);
    const items=sets.map(s=>{
      const isActive=cur===s.id;
      const owned=!s.upcoming&&fmSetHasAnyCard(s.id);
      const fade=(owned||isActive)?'':' fic-unowned';
      const niceName=(s.label.split('—')[1]||fmNiceSetLabel(s.id)).trim();
      // ATUALIZADO 12/08/2026: mesmo tratamento do card em "Coleções Gerais" —
      // logo oficial da coleção (imgSetLogo, app.js) em vez do emoji genérico,
      // com fallback pro emoji se a Scrydex não tiver essa expansion ainda.
      const logoUrl=typeof imgSetLogo==='function'?imgSetLogo(s.id):'';
      return`<button type="button" class="tdrop-item${isActive?' active':''}${fade}" data-tab="${s.id}"
        onclick="switchSet('${s.id}',null)" style="display:flex;align-items:center;gap:7px">
        <span style="width:18px;height:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center">
          <img src="${logoUrl}" alt="" loading="lazy" style="max-width:18px;max-height:14px;object-fit:contain"
               onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
          <span style="display:none;font-size:12px;line-height:1">${s.emoji}</span>
        </span>
        <span style="flex:1">${niceName}</span>
        <span class="tdrop-count">${s.upcoming?'breve':s.cards}</span></button>`;
    }).join('');
    return`<div class="tdrop">
      <button type="button" class="tdrop-btn${groupActive?' active':''}">${meta.sub||sr}
        <span class="tdrop-count">${ownedCount}/${sets.length}</span>
        <svg class="tdrop-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="tdrop-menu">${items}</div>
    </div>`;
  }

  function fmRenderFicNavDesktop(){
    const host=document.getElementById('fic-tabs-desktop');
    if(!host)return;
    const cur=typeof currentSet!=='undefined'?currentSet:null;
    let html=fmMeusFicharioisGroup(cur);
    Object.keys(typeof SERIES_META!=='undefined'?SERIES_META:{}).forEach(sr=>{
      html+=fmSeriesGroup(sr,cur);
    });
    host.innerHTML=html;
  }
  window.fmRenderFicNavDesktop=fmRenderFicNavDesktop;

  // Embrulha window.renderTabs (nessa altura já é a versão de
  // fichario_accordion.js) — chama a original primeiro (mantém #binder-tabs
  // do mobile funcionando 100% igual) e só ADICIONA o preenchimento do menu
  // novo em seguida. Assim, toda chamada existente a renderTabs() espalhada
  // pelo app.js (login, loadCustomBinders, switchSet, toggleCollection etc.)
  // já mantém o menu desktop sincronizado de graça, sem precisar caçar cada
  // call site.
  const prevRenderTabs=window.renderTabs;
  window.renderTabs=function(){
    if(typeof prevRenderTabs==='function')prevRenderTabs();
    fmRenderFicNavDesktop();
  };

})();
