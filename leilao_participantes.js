// ================================================================
// MyDeck — Leilão: aba "Participantes & Bloqueios" (leilao_participantes.js)
// Criado 02/10/2026. Pra quem é leiloeiro: lista TODO mundo que já deu lance
// (ou tem pedido/bloqueio no leilão), mostra quem está bloqueado e quem não,
// e deixa bloquear/liberar na hora.
//
// Sem SQL novo — usa o que o banco já permite a qualquer auction_admin:
//   • auction_bids / auction_bidder_flags: SELECT liberado (is_auction_admin)
//   • auction_bidder_flags: INSERT/UPDATE liberado (is_auction_admin)
//   • profiles: leitura pública (nome de exibição)
// O bloqueio em si é conferido no servidor por place_bid() (v_blocked), então
// quem está bloqueado não consegue dar lance mesmo mexendo no client.
//
// Carregado depois de leilao.js — reaproveita sbClient, uid(), esc(),
// setStatus(), aucIsLeilaoAdmin, aucAuctions, aucAdminOrders, aucIsOverdue().
// ================================================================

let aucPartRows=[];
let aucPartFilter='todos';   // todos | bloqueados | vencidos | liberados
let aucPartSearch='';
let aucPartLoading=false;
let aucPartBusy=false;
let aucPartLoadedOnce=false;

// Abre a aba: sempre recarrega (flag pode ter mudado por pedido pago, por
// outro leiloeiro ou pela rotina de inadimplência).
async function aucPartOpen(){
  if(!sbClient||!aucIsLeilaoAdmin)return;
  await aucPartLoad();
}

async function aucPartFetchAllBids(){
  const out=[];
  const PAGE=1000;
  for(let from=0;from<50000;from+=PAGE){
    const{data,error}=await sbClient.from('auction_bids')
      .select('id,bidder_id,auction_id,created_at').order('id',{ascending:true}).range(from,from+PAGE-1);
    if(error)throw error;
    out.push(...(data||[]));
    if(!data||data.length<PAGE)break;
  }
  return out;
}

async function aucPartLoad(){
  if(aucPartLoading)return;
  aucPartLoading=true;
  if(!aucPartLoadedOnce)aucPartRenderList();
  try{
    // pega o estado mais novo dos pedidos (pagou? venceu?) antes de classificar
    if(typeof loadAdminAuctionOrders==='function')await loadAdminAuctionOrders();
    const[bids,flagsRes]=await Promise.all([
      aucPartFetchAllBids(),
      sbClient.from('auction_bidder_flags').select('user_id,blocked,reason,updated_at'),
    ]);
    if(flagsRes.error)throw flagsRes.error;

    const people=new Map(); // uid -> acumulador
    const get=id=>{
      if(!people.has(id))people.set(id,{uid:id,bids:0,auctions:new Set(),last:null,wins:0,overdue:0,blocked:false,reason:'',flagAt:null,hasFlag:false});
      return people.get(id);
    };
    bids.forEach(b=>{
      const p=get(b.bidder_id);
      p.bids++;
      p.auctions.add(b.auction_id);
      if(!p.last||b.created_at>p.last)p.last=b.created_at;
    });
    (aucAuctions||[]).forEach(a=>{if(a.winner_id)get(a.winner_id).wins++;});
    (aucAdminOrders||[]).forEach(o=>{if(o.buyer_id&&aucIsOverdue(o))get(o.buyer_id).overdue++;});
    (flagsRes.data||[]).forEach(f=>{
      const p=get(f.user_id);
      p.hasFlag=true;p.blocked=!!f.blocked;p.reason=f.reason||'';p.flagAt=f.updated_at;
    });

    // nomes de exibição (profiles é público)
    const ids=[...people.keys()];
    const names={};
    for(let i=0;i<ids.length;i+=150){
      const{data}=await sbClient.from('profiles').select('user_id,display_name').in('user_id',ids.slice(i,i+150));
      (data||[]).forEach(r=>{names[r.user_id]=r.display_name;});
    }
    aucPartRows=ids.map(id=>{
      const p=people.get(id);
      return{...p,auctions:p.auctions.size,name:names[id]||('Usuário '+id.slice(0,6))};
    });
    aucPartLoadedOnce=true;
  }catch(e){
    console.error('[leilao] participantes',e);
    setStatus('Não consegui carregar os participantes','err');
  }
  aucPartLoading=false;
  aucPartRender();
}

function aucPartState(r){
  if(r.blocked)return'bloqueado';
  if(r.overdue>0)return'vencido';
  return'liberado';
}

function aucPartSorted(rows){
  const rank={bloqueado:0,vencido:1,liberado:2};
  return rows.slice().sort((a,b)=>
    rank[aucPartState(a)]-rank[aucPartState(b)]
    ||String(b.last||'').localeCompare(String(a.last||''))
    ||a.name.localeCompare(b.name));
}

function aucPartRender(){
  aucPartRenderKpis();
  aucPartRenderFilters();
  aucPartRenderList();
}

function aucPartCounts(){
  const c={todos:aucPartRows.length,bloqueados:0,vencidos:0,liberados:0};
  aucPartRows.forEach(r=>{
    const s=aucPartState(r);
    if(s==='bloqueado')c.bloqueados++;
    else if(s==='vencido')c.vencidos++;
    else c.liberados++;
  });
  return c;
}

function aucPartRenderKpis(){
  const wrap=document.getElementById('leilao-part-kpis');
  if(!wrap)return;
  const c=aucPartCounts();
  const kpi=(label,value,color)=>`<div class="panel" style="padding:16px">
    <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${color||'var(--text)'}">${value}</div>
  </div>`;
  wrap.innerHTML=
    kpi('PARTICIPANTES',c.todos)+
    kpi('🚫 BLOQUEADOS',c.bloqueados,c.bloqueados?'var(--accent)':'var(--text)')+
    kpi('⚠️ PEDIDO VENCIDO',c.vencidos,c.vencidos?'var(--gold)':'var(--text)')+
    kpi('✅ LIBERADOS',c.liberados,'var(--teal)');
}

function aucPartRenderFilters(){
  const wrap=document.getElementById('leilao-part-filters');
  if(!wrap)return;
  const c=aucPartCounts();
  const chip=(key,label)=>{
    const on=aucPartFilter===key;
    // btn-add ocupa a linha toda no celular: width/flex travados pra virar "chip"
    return`<button type="button" class="btn-add" onclick="aucPartSetFilter('${key}')" style="width:auto;flex:0 0 auto;padding:6px 12px;font-size:11px;${on?'':'background:transparent;color:var(--text);border:1px solid var(--border)'}">${label} (${c[key]})</button>`;
  };
  wrap.innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:14px 0">
    ${chip('todos','Todos')}${chip('bloqueados','🚫 Bloqueados')}${chip('vencidos','⚠️ Pedido vencido')}${chip('liberados','✅ Liberados')}
    <input type="search" id="leilao-part-search" class="cv-select" placeholder="Buscar por nome…" value="${esc(aucPartSearch)}" oninput="aucPartSetSearch(this.value)" style="flex:1 1 100%;min-width:150px;max-width:320px">
  </div>`;
}

function aucPartSetFilter(key){
  aucPartFilter=key;
  aucPartRenderFilters();
  aucPartRenderList();
}
function aucPartSetSearch(v){
  aucPartSearch=v||'';
  aucPartRenderList(); // só a lista: não recria o campo (perderia o foco)
}

function aucPartDate(iso){
  return iso?new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
}

function aucPartRowHtml(r){
  const s=aucPartState(r);
  const color=s==='bloqueado'?'var(--accent)':s==='vencido'?'var(--gold)':'var(--teal)';
  const badge=s==='bloqueado'?'🚫 Bloqueado':s==='vencido'?'⚠️ Pedido vencido':(r.hasFlag?'✅ Liberado':'✅ Liberado');
  const isMe=r.uid===uid();
  const nota=s==='bloqueado'
    ?`${esc(r.reason||'Sem motivo informado')}${r.flagAt?` · desde ${aucPartDate(r.flagAt)}`:''}`
    :s==='vencido'
      ?`${r.overdue} pedido(s) vencido(s) sem pagamento — será bloqueado automaticamente na próxima verificação`
      :(r.hasFlag&&r.reason?`Já esteve bloqueado: ${esc(r.reason)}${r.flagAt?` · liberado em ${aucPartDate(r.flagAt)}`:''}`:'');
  const botao=isMe?'':(s==='bloqueado'
    ?`<button class="cv-item-remove" style="color:var(--teal);border-color:var(--teal)" onclick="aucPartUnblock('${esc(r.uid)}')">🔓 Liberar</button>`
    :`<button class="cv-item-remove" onclick="aucPartBlock('${esc(r.uid)}')">🚫 Bloquear</button>`);
  return`<div class="panel" style="margin-bottom:8px;padding:12px 14px${s==='bloqueado'?';border-color:var(--accent)':''}">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
      <div style="min-width:0;flex:1 1 200px">
        <div style="font-weight:700;font-size:13.5px;word-break:break-word">${esc(r.name)}${isMe?' <span style="font-size:10px;color:var(--muted)">(você)</span>':''}</div>
        <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace;margin-top:2px">
          ${r.bids} lance(s) em ${r.auctions} leilão(ões) · ${r.wins} arremate(s) · último lance ${aucPartDate(r.last)}
        </div>
      </div>
      <span style="font-size:10px;font-family:'Space Mono',monospace;color:${color};border:1px solid ${color};border-radius:20px;padding:2px 10px;white-space:nowrap">${badge}</span>
      ${botao}
    </div>
    ${nota?`<div style="font-size:11px;color:${s==='liberado'?'var(--muted)':color};margin-top:6px">${nota}</div>`:''}
  </div>`;
}

function aucPartRenderList(){
  const wrap=document.getElementById('leilao-part-list');
  if(!wrap)return;
  if(aucPartLoading&&!aucPartLoadedOnce){wrap.innerHTML=`<div class="cv-item-empty">Carregando participantes…</div>`;return;}
  const q=aucPartSearch.trim().toLowerCase();
  let rows=aucPartSorted(aucPartRows).filter(r=>{
    const s=aucPartState(r);
    if(aucPartFilter==='bloqueados'&&s!=='bloqueado')return false;
    if(aucPartFilter==='vencidos'&&s!=='vencido')return false;
    if(aucPartFilter==='liberados'&&s!=='liberado')return false;
    return !q||r.name.toLowerCase().includes(q);
  });
  if(!rows.length){
    wrap.innerHTML=`<div class="cv-item-empty">${aucPartRows.length?'Ninguém neste filtro.':'Ninguém participou de leilão ainda.'}</div>`;
    return;
  }
  wrap.innerHTML=rows.map(aucPartRowHtml).join('');
}

// ── AÇÕES ──────────────────────────────────────────────────────────
async function aucPartBlock(userId){
  if(aucPartBusy||!aucIsLeilaoAdmin||!userId||userId===uid())return;
  const r=aucPartRows.find(x=>x.uid===userId);
  if(!r)return;
  const motivo=prompt(`Bloquear "${r.name}"?\n\nEle(a) não poderá dar lances até você liberar. Motivo (aparece pra ele(a) e pros leiloeiros):`,'Bloqueio manual');
  if(motivo===null)return;
  aucPartBusy=true;
  const now=new Date().toISOString();
  const reason=(motivo.trim()||'Bloqueio manual').slice(0,200);
  const{error}=await sbClient.from('auction_bidder_flags')
    .upsert({user_id:userId,blocked:true,reason,updated_at:now},{onConflict:'user_id'});
  aucPartBusy=false;
  if(error){console.error('[leilao] bloquear',error);setStatus('Erro ao bloquear','err');return;}
  Object.assign(r,{blocked:true,reason,flagAt:now,hasFlag:true});
  setStatus(`${r.name} bloqueado`,'ok');
  aucPartRender();
}

async function aucPartUnblock(userId){
  if(aucPartBusy||!aucIsLeilaoAdmin||!userId)return;
  const r=aucPartRows.find(x=>x.uid===userId);
  if(!r)return;
  const aviso=r.overdue>0
    ?'\n\nAtenção: ele(a) ainda tem pedido vencido sem pagamento — o bloqueio automático pode voltar na próxima verificação. O jeito definitivo é marcar o pedido como pago em "Pedidos & Envios".'
    :'';
  if(!confirm(`Liberar "${r.name}" para dar lances de novo?${aviso}`))return;
  aucPartBusy=true;
  const now=new Date().toISOString();
  const{error}=await sbClient.from('auction_bidder_flags').update({blocked:false,updated_at:now}).eq('user_id',userId);
  aucPartBusy=false;
  if(error){console.error('[leilao] liberar',error);setStatus('Erro ao liberar','err');return;}
  Object.assign(r,{blocked:false,flagAt:now});
  setStatus(`${r.name} liberado`,'ok');
  aucPartRender();
}
