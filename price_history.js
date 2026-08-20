// ================================================================
// MyDeck — Histórico de Preço + Book de Compra/Venda (price_history.js)
//
// Novo arquivo-patch (19/08/2026), zero edição em app.js/marketplace.js.
// Dois pedaços:
//  1. Gráfico de histórico de preço por carta+versão, lendo a tabela
//     `card_price_history` (snapshot diário via scripts/snapshot_card_prices.js,
//     ver card_price_history_setup.sql). Começa vazio e vai enchendo com
//     o tempo — não há como reconstruir preço passado.
//  2. Book de compra/venda: cruza `card_listings` (lado ask — agora
//     público pra qualquer usuário logado, ver card_listings_public_visibility.sql)
//     com `buy_orders` (lado bid, já era público) pra uma carta+versão,
//     mostrando TODOS os anúncios/ordens de todo mundo, não só os seus.
//
// Injetado em 3 lugares (decidido com o Eduardo em 19/08/2026):
//  - Modal "Colocar à Venda" (openVendaModal/renderVendaModal, aba Compra/Venda)
//  - Modal "Registrar Ordem de Compra" (openBuyOrderModal/renderBuyOrderModal, aba Compra/Venda)
//  - Modal de carta do Fichário (openBinderModal, app.js) — encadeado
//    depois do monkey-patch que marketplace.js já faz nele.
//
// Carregado depois de app.js e marketplace.js — reaproveita sbClient,
// fmtR(), esc(), uid(), getSlots(), VER_SHORT já definidos lá (por
// identificador direto, não window.X — ver lição em [[feedback_coding]]
// sobre const/let no topo de script clássico não virar propriedade de window).
// ================================================================

// ── ESTILOS (injetados via <style>, sem tocar style.css) ───────────
(function injectPriceHistoryStyles(){
  const css = `
  .ph-block{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
  .ph-title{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px}
  .ph-tabs{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
  .ph-tab{padding:4px 10px;border:1px solid var(--border);border-radius:20px;font-family:'Space Mono',monospace;font-size:10px;cursor:pointer;color:var(--muted)}
  .ph-tab.active{border-color:var(--accent);color:var(--accent);background:rgba(124,92,255,0.08)}
  .ph-chart-wrap{background:var(--surface2,#181c2e);border-radius:8px;padding:10px}
  .ph-chart-empty{font-size:10.5px;color:var(--muted);font-family:'IBM Plex Mono',monospace;padding:6px 2px}
  .ph-chart-summary{margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-family:'Space Mono',monospace;font-size:10px;display:flex;gap:14px;flex-wrap:wrap}
  .ph-loading{font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;padding:6px 0}
  .ph-book-cols{display:flex;gap:10px;flex-wrap:wrap}
  .ph-book-col{flex:1;min-width:140px}
  .ph-book-col-t{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:0.5px;margin-bottom:6px}
  .ph-book-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 8px;background:var(--surface2,#181c2e);border-radius:6px;margin-bottom:5px;font-size:10.5px;font-family:'IBM Plex Mono',monospace}
  .ph-book-empty{font-size:10px;color:var(--muted);font-family:'IBM Plex Mono',monospace;padding:6px 0}
  .ph-ask{color:var(--gold);white-space:nowrap}
  .ph-bid{color:var(--teal);white-space:nowrap}
  `;
  const style=document.createElement('style');
  style.textContent=css;
  document.head.appendChild(style);
})();

// ── ESTADO DOS BLOCOS MONTADOS (um por modal aberto) ───────────────
let _phSeq=0;
window._phBlocks=window._phBlocks||{};

// ── BUSCA DE DADOS ──────────────────────────────────────────────
async function phFetchHistory(slotKeyStr){
  if(!sbClient)return[];
  const since=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
  const{data,error}=await sbClient.from('card_price_history')
    .select('date,price').eq('slot_key',slotKeyStr).gte('date',since)
    .order('date',{ascending:true});
  if(error){console.error('[card_price_history select]',error);return[];}
  return data||[];
}

async function phFetchBook(setId,n){
  if(!sbClient)return{asks:[],bids:[]};
  const[{data:asks,error:aErr},{data:bids,error:bErr}]=await Promise.all([
    sbClient.from('card_listings').select('*').eq('set_id',setId).eq('card_n',n),
    sbClient.from('buy_orders').select('*').eq('set_id',setId).eq('card_n',n).eq('status','ativa')
  ]);
  if(aErr)console.error('[card_listings book select]',aErr);
  if(bErr)console.error('[buy_orders book select]',bErr);
  return{asks:asks||[],bids:bids||[]};
}

// ── RENDER: GRÁFICO (SVG desenhado à mão, mesmo estilo de renderPatrimonio) ──
function phChartHTML(hist){
  if(!hist||hist.length<2){
    return`<div class="ph-chart-empty">📈 O histórico de preço dessa carta começou a ser registrado agora (snapshot diário) — volte em alguns dias pra ver o gráfico.</div>`;
  }
  const W=320,H=86,PAD_L=42,PAD_R=8,PAD_T=8,PAD_B=16;
  const vals=hist.map(h=>Number(h.price)||0);
  const minV=Math.min(...vals),maxV=Math.max(...vals);
  const range=(maxV-minV)||1;
  const n=hist.length;
  const x=i=>PAD_L+(n>1?i/(n-1):0)*(W-PAD_L-PAD_R);
  const y=v=>PAD_T+(1-(v-minV)/range)*(H-PAD_T-PAD_B);
  const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaPts=`${x(0).toFixed(1)},${(H-PAD_B).toFixed(1)} ${pts} ${x(n-1).toFixed(1)},${(H-PAD_B).toFixed(1)}`;
  const first=vals[0],last=vals[n-1];
  const delta=last-first,deltaPct=first>0?(delta/first*100):0;
  const color=delta>=0?'var(--teal)':'var(--accent)';
  const gradId='ph-fill-'+(_phSeq++);
  const dLbl=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  return`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;overflow:visible">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${PAD_L}" y1="${y(maxV).toFixed(1)}" x2="${W-PAD_R}" y2="${y(maxV).toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="${PAD_L-4}" y="${(+y(maxV).toFixed(1)+3)}" text-anchor="end" font-size="8" fill="var(--muted)" font-family="'Space Mono',monospace">R$${fmtR(maxV)}</text>
    <line x1="${PAD_L}" y1="${y(minV).toFixed(1)}" x2="${W-PAD_R}" y2="${y(minV).toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="${PAD_L-4}" y="${(+y(minV).toFixed(1)+3)}" text-anchor="end" font-size="8" fill="var(--muted)" font-family="'Space Mono',monospace">R$${fmtR(minV)}</text>
    <polygon points="${areaPts}" fill="url(#${gradId})"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${vals.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i===n-1?3:1.6}" fill="${color}"><title>${hist[i].date}: R$${fmtR(v)}</title></circle>`).join('')}
    <text x="${x(0).toFixed(1)}" y="${H-4}" text-anchor="start" font-size="8" fill="var(--muted)" font-family="'Space Mono',monospace">${dLbl(hist[0].date)}</text>
    <text x="${x(n-1).toFixed(1)}" y="${H-4}" text-anchor="end" font-size="8" fill="var(--muted)" font-family="'Space Mono',monospace">${dLbl(hist[n-1].date)}</text>
  </svg>
  <div class="ph-chart-summary">
    <span>Atual: <b>R$${fmtR(last)}</b></span>
    <span style="color:${color}">${delta>=0?'+':''}R$${fmtR(delta)} (${deltaPct>=0?'+':''}${deltaPct.toFixed(1)}%)</span>
    <span>${n} dias registrados</span>
  </div>`;
}

// ── RENDER: BOOK (ask × bid, filtrado pela versão selecionada) ────
function phBookHTML(book,ver){
  const me=typeof uid==='function'?uid():null;
  const asks=(book.asks||[]).filter(a=>a.version===ver).sort((a,b)=>a.price-b.price);
  const bids=(book.bids||[]).filter(b=>b.version===ver).sort((a,b)=>b.max_price-a.max_price);
  const condLbl={M:'Mint',NM:'Quase M',MP:'Levemente usada',D:'Danificada'};
  const askRows=asks.length
    ?asks.map(a=>`<div class="ph-book-row"><span>${a.qty>1?a.qty+'x':'1x'} · ${condLbl[a.condition]||a.condition||'M'}${a.user_id===me?' · <b>você</b>':''}</span><b class="ph-ask">R$${fmtR(a.price)}</b></div>`).join('')
    :`<div class="ph-book-empty">Ninguém vendendo essa versão ainda.</div>`;
  const bidRows=bids.length
    ?bids.map(b=>`<div class="ph-book-row"><span>${b.qty>1?b.qty+'x':'1x'}${b.buyer_id===me?' · <b>você</b>':''}</span><b class="ph-bid">R$${fmtR(b.max_price)}</b></div>`).join('')
    :`<div class="ph-book-empty">Ninguém comprando essa versão ainda.</div>`;
  return`<div class="ph-book-cols">
    <div class="ph-book-col"><div class="ph-book-col-t">📤 À VENDA (${asks.length})</div>${askRows}</div>
    <div class="ph-book-col"><div class="ph-book-col-t">📥 COMPRANDO (${bids.length})</div>${bidRows}</div>
  </div>`;
}

// ── MONTAGEM DO BLOCO (gráfico + book) num modal ────────────────
function phSkeletonHTML(blockId,slots,curVer){
  const tabsHtml=slots.length>1
    ?`<div class="ph-tabs">${slots.map(s=>`<div class="ph-tab${s.ver===curVer?' active':''}" data-ver="${s.ver}" onclick="phSwitchVer('${blockId}','${s.ver}')">${VER_SHORT[s.ver]||s.ver}</div>`).join('')}</div>`
    :'';
  return`<div class="ph-block" id="${blockId}">
    <div class="ph-title">📈 HISTÓRICO DE PREÇO</div>
    ${tabsHtml}
    <div class="ph-chart-wrap" id="${blockId}-chart"><div class="ph-loading">carregando histórico…</div></div>
    <div class="ph-title" style="margin-top:12px">📖 BOOK DE COMPRA E VENDA</div>
    <div id="${blockId}-book"><div class="ph-loading">carregando book…</div></div>
  </div>`;
}

async function phRefreshBlock(blockId){
  const st=window._phBlocks[blockId];
  if(!st)return;
  const slotK=st.setId+':'+st.n+':'+st.ver;
  const[hist,book]=await Promise.all([phFetchHistory(slotK),phFetchBook(st.setId,st.n)]);
  const chartEl=document.getElementById(blockId+'-chart');
  const bookEl=document.getElementById(blockId+'-book');
  if(chartEl)chartEl.innerHTML=phChartHTML(hist);
  if(bookEl)bookEl.innerHTML=phBookHTML(book,st.ver);
  document.querySelectorAll('#'+blockId+' .ph-tab').forEach(t=>{
    t.classList.toggle('active',t.getAttribute('data-ver')===st.ver);
  });
}

function phSwitchVer(blockId,ver){
  const st=window._phBlocks[blockId];if(!st)return;
  st.ver=ver;
  phRefreshBlock(blockId);
}

// beforeEl: elemento de referência (normalmente .mact, a barra de botões do
// modal) — o bloco é inserido logo antes dele.
function phInjectPriceBlock(beforeEl,setId,n,slots,defaultVer){
  if(!beforeEl||!slots||!slots.length)return;
  const blockId='ph'+(_phSeq++);
  const ver=defaultVer||slots[0].ver;
  window._phBlocks[blockId]={setId,n,slots,ver};
  beforeEl.insertAdjacentHTML('beforebegin',phSkeletonHTML(blockId,slots,ver));
  phRefreshBlock(blockId);
}

// ── GANCHO 1: Modal "Colocar à Venda" (aba Compra/Venda) ──────────
if(typeof window.renderVendaModal==='function'){
  const _phOrigRenderVendaModal=window.renderVendaModal;
  window.renderVendaModal=function(){
    _phOrigRenderVendaModal();
    try{
      const st=_mvState;if(!st)return;
      const body=document.querySelector('#mvenda-content .mbinder-body');
      const mact=body&&body.querySelector('.mact');
      if(!mact)return;
      phInjectPriceBlock(mact,st.setId,st.n,[{ver:st.ver}],st.ver);
    }catch(e){console.error('[price_history] erro ao injetar no modal de venda',e);}
  };
}

// ── GANCHO 2: Modal "Registrar Ordem de Compra" (aba Compra/Venda) ─
if(typeof window.renderBuyOrderModal==='function'){
  const _phOrigRenderBuyOrderModal=window.renderBuyOrderModal;
  window.renderBuyOrderModal=function(){
    _phOrigRenderBuyOrderModal();
    try{
      const st=_mbState;if(!st)return;
      const body=document.querySelector('#mbuy-content .mbinder-body');
      const mact=body&&body.querySelector('.mact');
      if(!mact)return;
      phInjectPriceBlock(mact,st.setId,st.n,st.slots,st.ver);
    }catch(e){console.error('[price_history] erro ao injetar no modal de ordem de compra',e);}
  };
}

// ── GANCHO 3: Modal de carta do Fichário ──────────────────────────
// Encadeia depois do monkey-patch que marketplace.js já faz em
// openBinderModal (price_history.js carrega depois de marketplace.js
// em index.html) — não substitui a seção de ofertas que já existe lá,
// só acrescenta gráfico+book completo (todas as versões) logo abaixo.
if(typeof window.openBinderModal==='function'){
  const _phOrigOpenBinderModal=window.openBinderModal;
  window.openBinderModal=function(card,setId){
    _phOrigOpenBinderModal(card,setId);
    try{
      const c=typeof card==='string'?JSON.parse(card):card;
      const slots=getSlots(c,setId);
      const body=document.querySelector('#mbinder-content .mbinder-body');
      const mact=body&&body.querySelector('.mact');
      if(!mact)return;
      phInjectPriceBlock(mact,setId,c.n,slots,slots[0]&&slots[0].ver);
    }catch(e){console.error('[price_history] erro ao injetar no modal do fichário',e);}
  };
}
