// fichario_accordion.js — dropdown de fichários fixados na barra de abas +
// accordion por categoria em "Meus Fichários" (08/08/2026).
//
// Pedido do Eduardo: com Master Sets (masterdex) + fichários por artista +
// fichários manuais/preset crescendo juntos, a barra de abas do Fichário
// (#binder-tabs) virou uma aba por fichário fixado sem limite, e o grid de
// "Meus Fichários" era uma lista plana sem distinguir tipo. Inspirado no menu
// retrátil do MYP Cards/Liga Pokémon (mockup aprovado na conversa).
//
// Categorias vêm de graça do dado que já existe — filter_config.type:
//   'masterdex' → Master Sets | 'artist' → Por artista | resto ('manual',
//   'preset', sem filter_config) → Meus fichários.
//
// Mesmo padrão de monkey-patch de fichario_melhorias_23jul.js — sobrescreve
// window.renderTabs e window.renderCustomBindersHome inteiros (mudança é
// estrutural, não dá pra só "estender"). Carrega DEPOIS de app.js,
// fichario_patch.js, fichario_melhorias_23jul.js e fichario_masterdex.js no
// index.html — todos os globais usados aqui (currentSet, myCollections,
// customBinders, pinnedBinders, SET_CATALOG, SERIES_META, BINDER_PRESETS,
// switchSet, getBinderCards, binderProgress, isBinderPinned,
// getAllCardsWithSet, safeJSON, openCustomBinderView, openPresetPreview,
// toggleCollection, openCreateBinderModal, toggleBinderPinned,
// shareCustomBinderPrompt, deleteCustomBinder, updateHsub) já existem em
// app.js — ver [[feedback_coding]] sobre não editar esses arquivos grandes
// direto.
(function(){

// ── Dropdown "Fichários" na barra de abas ──────────────────────────────
// Reaproveita as classes .fic-more-menu/.fic-more-item (já usadas pelo menu
// "⋯ Mais ações") pra manter a mesma linguagem visual sem CSS novo.
function fmToggleBindersTabMenu(e){
  if(e) e.stopPropagation();
  const menu=document.getElementById('fic-tabs-binders-menu');
  if(!menu) return;
  menu.classList.toggle('open');
}
window.fmToggleBindersTabMenu=fmToggleBindersTabMenu;
document.addEventListener('click', function(e){
  const menu=document.getElementById('fic-tabs-binders-menu');
  const btn=document.getElementById('fic-tabs-binders-btn');
  if(!menu||!menu.classList.contains('open')) return;
  if(e.target===btn||(btn&&btn.contains(e.target))||menu.contains(e.target)) return;
  menu.classList.remove('open');
});

window.renderTabs=function(){
  const container=document.getElementById('binder-tabs');
  if(!container)return;
  const cur=currentSet;
  const hasME=myCollections.some(id=>SET_CATALOG.find(s=>s.id===id&&s.series==='ME'));
  const hasSV=myCollections.some(id=>SET_CATALOG.find(s=>s.id===id&&s.series==='SV'));
  let html=`<div class="ctab${cur==='__custom__'?' active':''}" id="fic-tab-custom"
    onclick="switchSet('__custom__',this)"
    style="${cur==='__custom__'?'border-bottom:2px solid #a855f7;color:#a855f7':''}">
    ✨ Meus <span class="ctab-n">Fichários</span></div>`;

  // Dropdown único pra fichários personalizados fixados — antes cada um virava
  // uma aba própria (pinnedBinders.forEach), crescia sem limite conforme
  // Master Sets/artistas/manuais iam sendo fixados.
  if(pinnedBinders.length){
    const activePid=pinnedBinders.find(pid=>cur==='__cb__'+pid);
    const activeBinder=activePid?customBinders.find(x=>String(x.id)===activePid):null;
    const col=(activeBinder&&activeBinder.cover_color)||'#a855f7';
    html+=`<div style="position:relative;flex-shrink:0">
      <div class="ctab${activeBinder?' active':''}" id="fic-tabs-binders-btn"
        onclick="fmToggleBindersTabMenu(event)"
        style="display:flex;align-items:center;gap:5px;${activeBinder?`border-bottom:2px solid ${col};color:${col}`:''}">
        ${activeBinder?`${activeBinder.emoji||'📚'} ${activeBinder.name}`:'📚 Fichários'}
        <span class="ctab-n">${pinnedBinders.length}</span> ▾</div>
      <div id="fic-tabs-binders-menu" class="fic-more-menu">
        ${pinnedBinders.map(pid=>{
          const b=customBinders.find(x=>String(x.id)===pid);
          if(!b)return'';
          const isActive=cur==='__cb__'+pid;
          const bcol=b.cover_color||'#a855f7';
          return`<button class="fic-more-item" style="${isActive?`color:${bcol};font-weight:700`:''}"
            onclick="switchSet('__cb__${pid}',null);fmToggleBindersTabMenu()">
            ${b.emoji||'📚'} ${b.name} <span style="opacity:.6">· ${getBinderCards(b).length}</span></button>`;
        }).join('')}
      </div>
    </div>`;
  }

  let lastSeries='';
  myCollections.forEach(id=>{
    const s=SET_CATALOG.find(s=>s.id===id);
    if(!s)return;
    if(hasME&&hasSV&&lastSeries&&lastSeries!==s.series){
      html+=`<div style="width:1px;background:var(--border);margin:4px 4px;flex-shrink:0"></div>`;
    }
    lastSeries=s.series;
    const isActive=cur===id;
    const lbl=id.toUpperCase().replace('SV8PT5','SV8.5').replace('SV6PT5','SV6.5')
                .replace('SV4PT5','SV4.5').replace('SV3PT5','151');
    const niceName=(s.label.split('—')[1]||'').trim();
    html+=`<div class="ctab${isActive?' active':''}" id="fic-tab-${id}"
      onclick="switchSet('${id}',this)"
      ${s.upcoming?'style="opacity:.7"':''}>
      ${s.emoji} ${lbl}${niceName?` <span class="ctab-name">${niceName}</span>`:''} <span class="ctab-n">${s.upcoming?'breve':s.cards}</span></div>`;
  });
  container.innerHTML=html;
  if(typeof updateHsub==='function')updateHsub();
};

// ── Accordion por categoria em "Meus Fichários" ────────────────────────
// NOTA: 'masterdex' (Master Set Nacional/regional) NÃO entra aqui — descobri
// ao investigar fichario_masterdex.js que esses binders já têm uma entrada
// própria e mais elaborada (fmMdexInjectHomeEntry — caixa fixa com "criar
// Nacional"/"criar regional" embutido, sempre visível logo abaixo do
// cabeçalho), sempre REMOVIDA do array customBinders durante o render padrão
// e reinserida depois. Meter Master Set dentro do accordion genérico
// duplicaria/quebraria essa UI própria sem necessidade — o problema real
// (grid plano demais) só existia mesmo pra 'artist' e 'manual'/'preset'.
const FM_CATS=[
  {key:'artist', emoji:'🎨',label:'Por artista',   color:'#a855f7',
   test:b=>b.filter_config&&b.filter_config.type==='artist'},
  {key:'own',    emoji:'✨',label:'Meus fichários',color:'#06a37f',
   test:b=>!b.filter_config||b.filter_config.type!=='artist'},
];

function fmBinderCardHtml(b){
  const cards=getBinderCards(b);
  const pct=binderProgress(b);
  const col=b.cover_color||'#a855f7';
  const pinned=isBinderPinned(b.id);
  return`<div onclick="openCustomBinderView(${safeJSON(b)})"
    style="padding:16px;border-radius:10px;cursor:pointer;transition:all .2s;
           border:1px solid var(--border);background:var(--surface2);position:relative;
           border-left:3px solid ${col}"
    onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='${col}'"
    onmouseout="this.style.transform='';this.style.borderColor='var(--border)'">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <div onclick="event.stopPropagation();toggleBinderPinned('${b.id}')"
        title="${pinned?'Fixado na aba principal — clique pra desfixar':'Fixar na aba principal do Fichário'}"
        style="width:15px;height:15px;border-radius:50%;flex-shrink:0;cursor:pointer;
               border:2px solid ${pinned?col:'var(--muted)'};
               background:${pinned?col:'transparent'};
               display:flex;align-items:center;justify-content:center;
               font-size:8px;color:#fff;font-weight:700;transition:all .15s">
        ${pinned?'✓':''}</div>
      <div style="font-size:26px">${b.emoji||'📚'}</div>
    </div>
    <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px;word-break:break-word;line-height:1.3">${b.name}</div>
    <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:8px">${cards.length} cartas${pinned?' · 📌 fixado':''}</div>
    <div style="height:3px;background:var(--surface3);border-radius:2px;overflow:hidden;margin-bottom:4px">
      <div style="height:100%;width:${pct}%;background:${col};border-radius:2px"></div>
    </div>
    <div style="font-size:9px;color:${col};font-family:'Space Mono',monospace">${pct}% coletado</div>
    <div style="position:absolute;top:6px;right:6px;display:flex;gap:4px">
      <button onclick="event.stopPropagation();openCreateBinderModal(${safeJSON(b)})"
        style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:2px;
               opacity:.5;transition:opacity .15s" title="Editar"
        onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.5'">✏️</button>
      <button onclick="event.stopPropagation();shareCustomBinderPrompt(${safeJSON(b)})"
        style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:2px;
               opacity:.5;transition:opacity .15s" title="Compartilhar"
        onmouseover="this.style.opacity='1';this.style.color='var(--teal)'"
        onmouseout="this.style.opacity='.5';this.style.color='var(--muted)'">🔗</button>
      <button onclick="event.stopPropagation();deleteCustomBinder('${b.id}')"
        style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:2px;
               opacity:.5;transition:opacity .15s" title="Excluir"
        onmouseover="this.style.opacity='1';this.style.color='var(--accent)'"
        onmouseout="this.style.opacity='.5';this.style.color='var(--muted)'">✕</button>
    </div>
  </div>`;
}

window.fmToggleAccordion=function(key){
  const panel=document.getElementById('fm-acc-'+key);
  const icon=document.getElementById('fm-acc-ic-'+key);
  if(!panel)return;
  const open=panel.style.display!=='none';
  panel.style.display=open?'none':'grid';
  if(icon)icon.textContent=open?'▸':'▾';
};

window.renderCustomBindersHome=function(){
  _currentCustomBinderId=null;
  ['fic-binder-controls','fic-set-info','binder-stats'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const bctl=document.querySelector('.bctl');if(bctl)bctl.style.display='none';

  const all=getAllCardsWithSet();

  // Mesma ordem de operações que a cadeia antiga masterdex→melhorias já fazia
  // (esconde masterdex, DEPOIS ordena, DEPOIS renderiza) — replicado aqui
  // porque este arquivo SUBSTITUI window.renderCustomBindersHome inteiro,
  // então a cadeia de wrappers antiga não roda mais. Ver nota em FM_CATS.
  const mdexRemovidos=[];
  if(typeof fmMdexAllBinders==='function'){
    fmMdexAllBinders().forEach(b=>{
      const idx=customBinders.indexOf(b);
      if(idx>=0) mdexRemovidos.push({idx,binder:customBinders.splice(idx,1)[0]});
    });
  }
  if(typeof fmSortBinders==='function') fmSortBinders();

  // Agrupa por categoria (ver FM_CATS acima). A categoria do fichário mais
  // recente abre por padrão (customBinders[0], já ordenado por fmSortBinders
  // e sem os masterdex, que têm caixa própria); as outras começam fechadas.
  const defaultOpenKey=customBinders.length
    ? (FM_CATS.find(c=>c.test(customBinders[0]))||FM_CATS[1]).key
    : 'own';

  const myHtml=customBinders.length===0
    ?`<div style="text-align:center;padding:40px 20px;color:var(--muted);font-family:'Space Mono',monospace;font-size:11px;line-height:2.2">
        Você ainda não criou nenhum fichário.<br>
        <span style="color:var(--accent)">Use os presets abaixo ou crie o seu próprio ✨</span>
      </div>`
    :FM_CATS.map(cat=>{
        const items=customBinders.filter(cat.test);
        if(!items.length)return'';
        const isOpen=cat.key===defaultOpenKey;
        return`<div style="margin-bottom:8px">
          <div onclick="fmToggleAccordion('${cat.key}')"
            style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;
                   padding:10px 12px;background:var(--surface2);border-radius:8px;
                   border-left:3px solid ${cat.color};margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;color:var(--text)">${cat.emoji} ${cat.label}</span>
            <span style="display:flex;align-items:center;gap:8px">
              <span style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)">${items.length}</span>
              <span id="fm-acc-ic-${cat.key}" style="font-size:11px;color:var(--muted)">${isOpen?'▾':'▸'}</span>
            </span>
          </div>
          <div id="fm-acc-${cat.key}" style="display:${isOpen?'grid':'none'};
               grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px">
            ${items.map(fmBinderCardHtml).join('')}
          </div>
        </div>`;
      }).join('');

  const presetsHtml=BINDER_PRESETS.map(p=>{
    const count=all.filter(p.filter).length;
    const already=customBinders.some(b=>b.filter_config&&b.filter_config.key===p.key&&b.filter_config.type==='preset');
    return`<div onclick="openPresetPreview('${p.key}')"
      style="padding:14px;border-radius:10px;cursor:pointer;transition:all .2s;
             border:1px solid var(--border);background:var(--surface2);
             border-top:3px solid ${p.color};${already?'opacity:.55;':''}position:relative"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 20px ${p.color}33'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="font-size:22px;margin-bottom:8px">${p.emoji}</div>
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">${p.name}</div>
      <div style="font-size:9px;color:var(--muted);line-height:1.5;margin-bottom:8px">${p.desc}</div>
      <div style="font-size:9px;color:${p.color};font-family:'Space Mono',monospace">${count} cartas${already?' · Já criado':''}</div>
    </div>`;
  }).join('');

  function setCard(s){
    const on=myCollections.includes(s.id);
    const lbl=s.id.toUpperCase().replace('SV8PT5','SV8.5').replace('SV6PT5','SV6.5')
                  .replace('SV4PT5','SV4.5').replace('SV3PT5','151');
    return`<div onclick="toggleCollection('${s.id}')"
      style="padding:10px;border-radius:8px;cursor:pointer;transition:all .18s;
             border:1px solid ${on?s.color:'var(--border)'};
             background:${on?s.color+'1a':'var(--surface2)'};
             border-left:3px solid ${s.color};user-select:none"
      onmouseover="this.style.transform='translateY(-2px)'"
      onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px">
        <span style="font-size:18px;line-height:1">${s.emoji}</span>
        <div style="width:15px;height:15px;border-radius:50%;flex-shrink:0;
                    border:2px solid ${on?s.color:'var(--muted)'};
                    background:${on?s.color:'transparent'};
                    display:flex;align-items:center;justify-content:center;
                    font-size:8px;color:white;font-weight:700">
          ${on?'✓':''}</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:${on?'var(--text)':'var(--muted)'};
                  line-height:1.2;margin-bottom:2px">${lbl}</div>
      <div style="font-size:8px;font-family:'Space Mono',monospace;
                  color:${on?s.color:'var(--muted)'};line-height:1.3">
        ${s.upcoming?'breve':s.cards+' cartas'}</div>
    </div>`;
  }
  const seriesSections=Object.keys(SERIES_META)
    .map(sr=>({sr,sets:SET_CATALOG.filter(s=>s.series===sr)}))
    .filter(x=>x.sets.length)
    .map(x=>`
      <div style="font-size:9px;font-family:'Space Mono',monospace;color:var(--muted);
                  text-transform:uppercase;letter-spacing:.08em;margin:14px 0 8px">${(SERIES_META[x.sr]||{}).sub||x.sr}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">
        ${x.sets.map(setCard).join('')}
      </div>`).join('');

  document.getElementById('bwrap').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px">✨ MEUS FICHÁRIOS</div>
      <button onclick="openCreateBinderModal()"
        style="padding:8px 18px;background:var(--accent);color:#fff;border:none;border-radius:6px;
               font-family:'Space Mono',monospace;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:1px;
               transition:opacity .15s"
        onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">+ NOVO FICHÁRIO</button>
    </div>

    <!-- ── Seletor de Coleções ─────────────────────────────────── -->
    <div style="margin-bottom:28px">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);
                  letter-spacing:2px;margin-bottom:12px;padding-bottom:8px;
                  border-bottom:1px solid var(--border)">
        MINHAS COLEÇÕES — TOQUE PARA ATIVAR NAS ABAS
      </div>
      ${seriesSections}
    </div>

    ${myHtml}
    <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:2px;
                margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--border)">
      SUGESTÕES TEMÁTICAS
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
      ${presetsHtml}
    </div>

    `;

  // Reinsere os masterdex na posição original e deixa a caixa própria deles
  // (fmMdexInjectHomeEntry) se inserir logo abaixo do cabeçalho, exatamente
  // como fichario_masterdex.js já fazia antes deste arquivo existir.
  mdexRemovidos.sort((a,b)=>a.idx-b.idx).forEach(r=>customBinders.splice(r.idx,0,r.binder));
  if(typeof fmMdexInjectHomeEntry==='function'){
    try{ fmMdexInjectHomeEntry(); }catch(e){}
  }
  // Controle de ordenação (Mais recentes/Mais completos) já existente,
  // injetado no cabeçalho — ver fichario_melhorias_23jul.js.
  if(typeof fmInjectSortControl==='function'){
    try{ fmInjectSortControl(); }catch(e){}
  }
};

})();
