// ================================================================
// MyDeck — SISTEMA DE RIFAS (rifa.js) — 24/08/2026
// Pedido do Eduardo: aba de rifas dentro do grupo "Compra e Venda e
// Leilão". Reaproveita o que já existe no leilão sempre que possível:
// mesma permissão de rifeiro (is_auction_admin()/aucIsLeilaoAdmin, ver
// leilao.js), mesmo bucket de fotos do prêmio (leilao-fotos) e mesmas
// funções de compressão/upload (compressAuctionPhoto/uploadAuctionPhotos),
// mesmo padrão de aceite de regras, e o mesmo "Falar no WhatsApp" a
// partir de user_addresses. Precisa de leilao.js carregado ANTES deste
// arquivo (ver <script defer> em index.html).
//
// Fluxo (ver rifa_setup.sql pro desenho completo do banco):
//  1) Rifeiro cadastra: prêmio (catálogo OU foto real), quantidade de
//     números, valor por número, chave PIX + titular.
//  2) Participante aceita os termos (uma vez), escolhe quantos números
//     quer, vê o total e a chave PIX, sobe o comprovante.
//  3) Só DEPOIS de subir o comprovante escolhe quais números — reserva
//     atômica via RPC claim_raffle_numbers (trava a corrida).
//  4) Rifeiro revisa cada comprovante (bucket privado) e confirma ou
//     rejeita — rejeitar devolve os números pro estoque livre.
//  5) Só com zero pendências, rifeiro sorteia (RPC no servidor, entre os
//     números confirmados) — client mostra uma animação de alguns
//     segundos antes de revelar, e qualquer um com a rifa aberta na tela
//     pega a mudança por polling (ver rifStartPolling) — não é um
//     websocket de verdade, mas todo mundo vê o resultado quase junto.
// ================================================================

let rifRaffles=[];
let rifNumberCounts={}; // {raffle_id: {livres, pendentes, confirmados}}
let rifMyNumbers={};    // {raffle_id: [{number,status}]} — só os MEUS números, pra mostrar no card
let rifAdminPendingPayments=[];
let rifRulesAccepted=null;
const RIF_RULES_VERSION='v1';
let rifActiveSubtab='rifas';
let rifSelectedCard=null;
let rifCustomPhotoFiles=[];
const RIF_PHOTO_MAX=4;
const RIF_PHOTO_MAX_INPUT_MB=15;
let rifPollTimer=null;

// ── VISIBILIDADE DA ABA (mesmo padrão de hookLeilaoTabVisibility) ──
async function updateRifasTabVisibility(){
  const btn=document.getElementById('nav-tab-rifas');
  const deskBtn=document.getElementById('desk-tab-rifas');
  const show=!!uid();
  if(btn)btn.style.display=show?'':'none';
  if(deskBtn)deskBtn.style.display=show?'':'none';
  if(!show){
    const pane=document.getElementById('rifas');
    if(pane&&pane.classList.contains('active')&&typeof goToTab==='function')goToTab('dash');
  }
}
(function hookRifasTabVisibility(){
  function tryHook(){
    if(typeof window._updateUserChip!=='function'){setTimeout(tryHook,50);return;}
    const original=window._updateUserChip;
    window._updateUserChip=function(user){original(user);updateRifasTabVisibility();};
    updateRifasTabVisibility();
  }
  tryHook();
})();

// ── CARREGAR TUDO ───────────────────────────────────────────────
async function renderRifasTab(){
  if(typeof resolveLeilaoAdminStatus==='function')await resolveLeilaoAdminStatus();
  ['rif-tab-cadastro','rif-tab-revisao'].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn)btn.style.display=aucIsLeilaoAdmin?'':'none';
  });
  const allowed=aucIsLeilaoAdmin?['rifas','cadastro','revisao']:['rifas'];
  switchRifasSubtab(allowed.includes(rifActiveSubtab)?rifActiveSubtab:'rifas');

  await loadRifRulesAcceptance();
  await loadRaffles();
  await loadRaffleNumberCounts();
  await loadMyRaffleNumbers();
  renderRafflesList();

  if(aucIsLeilaoAdmin){
    await loadPendingRafflePayments();
    renderRafflePaymentsReview();
  }

  rifStartPolling();
}

function switchRifasSubtab(name){
  rifActiveSubtab=name;
  ['rifas','cadastro','revisao'].forEach(n=>{
    const pane=document.getElementById('rif-sub-'+n);
    if(pane)pane.style.display=(n===name)?'':'none';
    const btn=document.querySelector(`.rif-subtab-btn[data-sub="${n}"]`);
    if(btn){
      if(n===name){btn.style.background='';btn.style.color='';btn.style.border='';}
      else{btn.style.background='transparent';btn.style.color='var(--text)';btn.style.border='1px solid var(--border)';}
    }
  });
}

// Enquanto a aba Rifas estiver visível, checa a cada ~4s se alguma rifa
// mudou de status (sorteio aconteceu) — não é realtime de verdade, mas dá
// o efeito de "ao vivo" sem precisar de infraestrutura nova.
function rifStartPolling(){
  rifStopPolling();
  rifPollTimer=setInterval(async ()=>{
    const pane=document.getElementById('rifas');
    if(!pane||!pane.classList.contains('active')){rifStopPolling();return;}
    const prevStatus={};
    rifRaffles.forEach(r=>{prevStatus[r.id]=r.status;});
    await loadRaffles();
    await loadRaffleNumberCounts();
    const newlyDrawn=rifRaffles.filter(r=>prevStatus[r.id]==='aberta'&&r.status==='sorteada');
    renderRafflesList();
    newlyDrawn.forEach(r=>rifPlayDrawReveal(r));
  },4000);
}
function rifStopPolling(){
  if(rifPollTimer){clearInterval(rifPollTimer);rifPollTimer=null;}
}

async function loadRaffles(){
  const{data,error}=await sbClient.from('raffles').select('*').order('created_at',{ascending:false});
  if(error){console.error('[rifa] loadRaffles',error);rifRaffles=[];return;}
  rifRaffles=Array.isArray(data)?data:[];
}

async function loadRaffleNumberCounts(){
  rifNumberCounts={};
  if(!rifRaffles.length)return;
  const ids=rifRaffles.map(r=>r.id);
  const{data,error}=await sbClient.from('raffle_numbers')
    .select('raffle_id,payment_id,raffle_payments(status)')
    .in('raffle_id',ids);
  if(error){console.error('[rifa] loadRaffleNumberCounts',error);return;}
  (data||[]).forEach(n=>{
    if(!rifNumberCounts[n.raffle_id])rifNumberCounts[n.raffle_id]={livres:0,pendentes:0,confirmados:0};
    const c=rifNumberCounts[n.raffle_id];
    const st=n.raffle_payments?.status;
    if(!n.payment_id)c.livres++;
    else if(st==='confirmado')c.confirmados++;
    else if(st==='pendente')c.pendentes++;
    else c.livres++; // rejeitado (não deveria sobrar payment_id, mas por segurança)
  });
}

async function loadMyRaffleNumbers(){
  rifMyNumbers={};
  if(!uid()||!rifRaffles.length)return;
  const ids=rifRaffles.map(r=>r.id);
  const{data,error}=await sbClient.from('raffle_numbers')
    .select('raffle_id,number,raffle_payments!inner(user_id,status)')
    .in('raffle_id',ids)
    .eq('raffle_payments.user_id',uid());
  if(error){console.error('[rifa] loadMyRaffleNumbers',error);return;}
  (data||[]).forEach(n=>{
    if(!rifMyNumbers[n.raffle_id])rifMyNumbers[n.raffle_id]=[];
    rifMyNumbers[n.raffle_id].push({number:n.number,status:n.raffle_payments?.status});
  });
}

function rifImgFor(r){
  if(r.image_url)return r.image_url;
  if(Array.isArray(r.photo_urls)&&r.photo_urls.length)return r.photo_urls[0];
  return null;
}

function rifRaffleById(id){return rifRaffles.find(r=>r.id===id);}

// ── LISTA DE RIFAS ──────────────────────────────────────────────
function renderRafflesList(){
  const wrap=document.getElementById('rif-list');
  if(!wrap)return;
  if(!rifRaffles.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhuma rifa cadastrada ainda.</div>`;return;}
  wrap.innerHTML=rifRaffles.filter(r=>r.status!=='cancelada'||aucIsLeilaoAdmin).map(r=>rifCardHtml(r)).join('');
}

function rifCardHtml(r){
  const img=rifImgFor(r);
  const c=rifNumberCounts[r.id]||{livres:r.ticket_count,pendentes:0,confirmados:0};
  const vendidos=c.pendentes+c.confirmados;
  const pct=r.ticket_count?Math.round((vendidos/r.ticket_count)*100):0;
  const mine=rifMyNumbers[r.id]||[];
  const isWinner=r.status==='sorteada'&&r.winner_user_id===uid();

  return`<div class="panel${isWinner?' auc-hot-card':''}">
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      ${img?`<img src="${img}" alt="${esc(r.title)}" style="width:100px;border-radius:8px;object-fit:contain;background:var(--surface2)">`:''}
      <div style="flex:1;min-width:220px">
        <div style="font-weight:700;font-size:14px">🎟️ ${esc(r.title)}</div>
        ${r.description?`<div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(r.description)}</div>`:''}
        <div style="font-size:11px;color:var(--muted);margin-top:6px;font-family:'Space Mono',monospace">
          R$ ${fmtR(r.ticket_price)} por número · ${r.ticket_count} número(s) no total
        </div>
        <div style="margin-top:8px;background:var(--surface2);border-radius:6px;height:8px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--accent)"></div>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px">
          ${vendidos}/${r.ticket_count} vendido(s) — ${c.confirmados} confirmado(s), ${c.pendentes} aguardando revisão
        </div>
        ${mine.length?`<div style="font-size:10.5px;color:var(--teal);margin-top:6px">
          🎫 Seus números: ${mine.map(m=>`${m.number}${m.status==='pendente'?' (revisão)':''}`).join(', ')}
        </div>`:''}
        ${r.status==='sorteada'?`<div style="font-size:12px;font-weight:700;color:var(--gold);margin-top:8px">
          🏆 Número sorteado: ${r.winner_number}${isWinner?' — parabéns, você ganhou! 🎉':''}
        </div>`:''}
      </div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      ${r.status==='aberta'?`<button class="btn-add" onclick="openRifParticipate(${r.id})">🎟️ Participar</button>`:''}
      ${isWinner?`<button class="btn-add" onclick="rifContactRifeiro(${r.id})">💬 Falar com o rifeiro no WhatsApp</button>`:''}
      ${aucIsLeilaoAdmin&&r.status==='aberta'?`<button class="cv-item-remove" style="color:var(--gold);border-color:var(--gold)" onclick="rifDrawNow(${r.id})">🎬 Realizar Sorteio</button>`:''}
      ${aucIsLeilaoAdmin&&r.status!=='cancelada'?`<button class="cv-item-remove" onclick="rifCancelRaffle(${r.id})">🗑️ Cancelar</button>`:''}
    </div>
  </div>`;
}

// ── REGRAS DA RIFA (mesmo padrão do leilão) ────────────────────
async function loadRifRulesAcceptance(){
  if(!uid()){rifRulesAccepted=null;return;}
  const{data,error}=await sbClient.from('raffle_rules_acceptance')
    .select('user_id').eq('user_id',uid()).eq('rules_version',RIF_RULES_VERSION).maybeSingle();
  rifRulesAccepted=!error&&!!data;
}

function openRifRulesModal(pendingRaffleId){
  window._rifPendingParticipate=pendingRaffleId;
  const check=document.getElementById('rif-rules-check');
  if(check)check.checked=false;
  const btn=document.getElementById('rif-rules-accept-btn');
  if(btn)btn.disabled=true;
  if(typeof openModal==='function')openModal('rif-rules-ov');
}

function toggleRifRulesAccept(){
  const check=document.getElementById('rif-rules-check');
  const btn=document.getElementById('rif-rules-accept-btn');
  if(btn)btn.disabled=!check?.checked;
}

async function acceptRifRules(){
  if(!uid())return;
  const check=document.getElementById('rif-rules-check');
  if(!check?.checked)return;
  const btn=document.getElementById('rif-rules-accept-btn');
  if(btn){btn.disabled=true;btn.textContent='Salvando...';}
  const{error}=await sbClient.from('raffle_rules_acceptance')
    .upsert({user_id:uid(),rules_version:RIF_RULES_VERSION,accepted_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error){
    console.error('[rifa] acceptRifRules',error);
    if(btn){btn.disabled=false;btn.textContent='✓ Li e aceito as regras';}
    setStatus('Erro ao registrar aceite. Verifique se rodou rifa_setup.sql no Supabase.','err');
    return;
  }
  rifRulesAccepted=true;
  if(typeof closeModal==='function')closeModal('rif-rules-ov');
  if(btn){btn.disabled=false;btn.textContent='✓ Li e aceito as regras';}
  const pending=window._rifPendingParticipate;
  window._rifPendingParticipate=null;
  if(pending)openRifParticipate(pending);
}

// ── PARTICIPAR (escolher quantidade → pagar → comprovante → números) ──
let rifParticipate=null; // {raffleId, step:'qty'|'numbers', qty, paymentId, chosen:Set}

function openRifParticipate(raffleId){
  if(!uid())return;
  if(!rifRulesAccepted){openRifRulesModal(raffleId);return;}
  const r=rifRaffleById(raffleId);
  if(!r)return;
  rifParticipate={raffleId,step:'qty',qty:1,paymentId:null,chosen:new Set()};
  renderRifParticipateContent();
  if(typeof openModal==='function')openModal('rif-participate-ov');
}

function renderRifParticipateContent(){
  const box=document.getElementById('rif-participate-content');
  if(!box||!rifParticipate)return;
  const r=rifRaffleById(rifParticipate.raffleId);
  if(!r)return;
  const c=rifNumberCounts[r.id]||{livres:r.ticket_count};

  if(rifParticipate.step==='qty'){
    box.innerHTML=`
      <h3 style="margin-bottom:4px">🎟️ ${esc(r.title)}</h3>
      <div style="font-size:11px;color:var(--muted);margin-bottom:14px">${c.livres} número(s) livre(s) de ${r.ticket_count} — R$ ${fmtR(r.ticket_price)} cada</div>
      <div class="ff"><label>Quantos números você quer?</label>
        <input type="number" id="rif-qty-input" min="1" max="${c.livres}" value="1" oninput="rifUpdateQtyTotal(${r.id})">
      </div>
      <div id="rif-qty-total" style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:14px"></div>
      <div class="panel" style="padding:12px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:6px">💸 CHAVE PIX PRA PAGAMENTO</div>
        <div style="font-size:12px"><b>Chave:</b> ${esc(r.pix_key)}</div>
        <div style="font-size:12px"><b>Titular:</b> ${esc(r.pix_titular)}</div>
        <div style="font-size:9.5px;color:var(--muted);margin-top:6px">Pague o valor exato acima, direto por PIX (fora do site), e suba o comprovante abaixo.</div>
      </div>
      <div class="ff"><label>Comprovante do PIX (foto ou print)</label>
        <input type="file" id="rif-proof-input" accept="image/*" capture="environment">
      </div>
      <div id="rif-participate-status" style="font-size:10.5px;color:var(--accent);margin:8px 0"></div>
      <button class="btn-add" onclick="submitRifPayment(${r.id})">✓ Enviar comprovante</button>`;
    rifUpdateQtyTotal(r.id);
  }else if(rifParticipate.step==='numbers'){
    box.innerHTML=`
      <h3 style="margin-bottom:4px">🎯 Escolha ${rifParticipate.qty} número(s)</h3>
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px">
        Comprovante enviado — agora escolha quais números você quer entre os livres. Selecionados: <b id="rif-picked-count">0</b>/${rifParticipate.qty}
      </div>
      <div id="rif-number-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:6px;max-height:40vh;overflow-y:auto;margin-bottom:14px"></div>
      <div id="rif-participate-status" style="font-size:10.5px;color:var(--accent);margin:8px 0"></div>
      <button class="btn-add" id="rif-confirm-numbers-btn" disabled onclick="confirmRifNumbers()">✓ Confirmar números escolhidos</button>`;
    renderRifNumberGrid();
  }
}

function rifUpdateQtyTotal(raffleId){
  const r=rifRaffleById(raffleId);
  const qtyEl=document.getElementById('rif-qty-input');
  const totalEl=document.getElementById('rif-qty-total');
  if(!r||!qtyEl||!totalEl)return;
  const qty=parseInt(qtyEl.value)||0;
  totalEl.textContent=qty>0?`Total: R$ ${fmtR(qty*r.ticket_price)}`:'';
}

async function submitRifPayment(raffleId){
  if(!uid()||!rifParticipate)return;
  const r=rifRaffleById(raffleId);
  if(!r)return;
  const statusEl=document.getElementById('rif-participate-status');
  const qty=parseInt(document.getElementById('rif-qty-input')?.value);
  const c=rifNumberCounts[r.id]||{livres:r.ticket_count};
  if(!qty||qty<1){if(statusEl)statusEl.textContent='Escolha uma quantidade válida.';return;}
  if(qty>c.livres){if(statusEl)statusEl.textContent=`Só tem ${c.livres} número(s) livre(s) — escolha uma quantidade menor.`;return;}
  const file=document.getElementById('rif-proof-input')?.files?.[0];
  if(!file){if(statusEl)statusEl.textContent='Anexe o comprovante do PIX.';return;}
  if(!file.type.startsWith('image/')){if(statusEl)statusEl.textContent='O comprovante precisa ser uma imagem.';return;}
  if(file.size>RIF_PHOTO_MAX_INPUT_MB*1024*1024){if(statusEl)statusEl.textContent=`Arquivo muito grande (máx ${RIF_PHOTO_MAX_INPUT_MB}MB).`;return;}

  if(statusEl)statusEl.textContent='Enviando comprovante...';
  try{
    const blob=typeof compressAuctionPhoto==='function'?await compressAuctionPhoto(file):file;
    const path=`${uid()}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
    const{error:upErr}=await sbClient.storage.from('rifa-comprovantes').upload(path,blob,{contentType:'image/jpeg',upsert:false});
    if(upErr)throw upErr;

    const total=Math.round(qty*r.ticket_price*100)/100;
    const{data:payment,error:payErr}=await sbClient.from('raffle_payments')
      .insert({raffle_id:raffleId,user_id:uid(),quantity:qty,total_amount:total,proof_path:path,status:'pendente'})
      .select().single();
    if(payErr)throw payErr;

    rifParticipate.step='numbers';
    rifParticipate.qty=qty;
    rifParticipate.paymentId=payment.id;
    rifParticipate.chosen=new Set();
    renderRifParticipateContent();
  }catch(e){
    console.error('[rifa] submitRifPayment',e);
    if(statusEl)statusEl.textContent='Erro ao enviar. Verifique se rodou rifa_setup.sql no Supabase, e tente de novo.';
  }
}

async function renderRifNumberGrid(){
  const grid=document.getElementById('rif-number-grid');
  if(!grid||!rifParticipate)return;
  const raffleId=rifParticipate.raffleId;
  const{data,error}=await sbClient.from('raffle_numbers')
    .select('number,payment_id').eq('raffle_id',raffleId).order('number');
  if(error){console.error('[rifa] renderRifNumberGrid',error);return;}
  grid.innerHTML=(data||[]).map(n=>{
    const taken=!!n.payment_id;
    const chosen=rifParticipate.chosen.has(n.number);
    const bg=taken?'var(--surface2)':chosen?'var(--accent)':'var(--surface)';
    const color=taken?'var(--muted)':chosen?'#fff':'var(--text)';
    return`<button type="button" ${taken?'disabled':''} onclick="rifToggleNumber(${n.number})"
      style="padding:8px 0;border-radius:6px;border:1px solid var(--border);background:${bg};color:${color};font-size:11px;cursor:${taken?'not-allowed':'pointer'}">${n.number}</button>`;
  }).join('');
}

function rifToggleNumber(number){
  if(!rifParticipate)return;
  if(rifParticipate.chosen.has(number)){
    rifParticipate.chosen.delete(number);
  }else{
    if(rifParticipate.chosen.size>=rifParticipate.qty){
      setStatus(`Você já escolheu ${rifParticipate.qty} número(s) — desmarque um antes de escolher outro.`,'err');
      return;
    }
    rifParticipate.chosen.add(number);
  }
  renderRifNumberGrid();
  const countEl=document.getElementById('rif-picked-count');
  if(countEl)countEl.textContent=rifParticipate.chosen.size;
  const btn=document.getElementById('rif-confirm-numbers-btn');
  if(btn)btn.disabled=rifParticipate.chosen.size!==rifParticipate.qty;
}

async function confirmRifNumbers(){
  if(!rifParticipate)return;
  const statusEl=document.getElementById('rif-participate-status');
  const numbers=Array.from(rifParticipate.chosen);
  if(numbers.length!==rifParticipate.qty){if(statusEl)statusEl.textContent=`Escolha exatamente ${rifParticipate.qty} número(s).`;return;}
  if(statusEl)statusEl.textContent='Reservando...';
  const{error}=await sbClient.rpc('claim_raffle_numbers',{p_payment_id:rifParticipate.paymentId,p_numbers:numbers});
  if(error){
    console.error('[rifa] confirmRifNumbers',error);
    if(statusEl)statusEl.textContent=error.message||'Erro ao reservar números — atualize e tente de novo.';
    renderRifNumberGrid();
    return;
  }
  setStatus('Números reservados! Aguardando o rifeiro confirmar seu pagamento.','ok');
  if(typeof closeModal==='function')closeModal('rif-participate-ov');
  rifParticipate=null;
  await loadRaffleNumberCounts();
  await loadMyRaffleNumbers();
  renderRafflesList();
}

// ── PAINEL DO RIFEIRO — CADASTRO ────────────────────────────────
function searchRifCards(){
  const q=(document.getElementById('rif-admin-search')?.value||'').trim().toLowerCase();
  const box=document.getElementById('rif-admin-search-results');
  if(!box)return;
  if(q.length<2){box.innerHTML='';return;}
  const all=typeof getAllCatalogCards==='function'?getAllCatalogCards():[];
  const matches=all.filter(c=>c.name.toLowerCase().includes(q)||c.n.includes(q)).slice(0,25);
  if(!matches.length){box.innerHTML=`<div class="cv-item-empty">Nenhuma carta encontrada.</div>`;return;}
  box.innerHTML=matches.map(c=>{
    const img=typeof getBinderImg==='function'?getBinderImg(c,c._setId):null;
    return`<div class="cv-item" onclick='pickRifCard(${JSON.stringify({setId:c._setId,n:c.n,name:c.name}).replace(/'/g,"&#39;")})'>
      ${img?`<img class="cv-item-img" src="${img}" alt="${esc(c.name)}" onerror="this.style.display='none'">`:`<div class="cv-item-icon">🃏</div>`}
      <div class="cv-item-info"><div class="cv-item-name">${esc(c.name)}</div><div class="cv-item-meta">${c.n} · ${esc((c._setId||'').toUpperCase())}</div></div>
    </div>`;
  }).join('');
}

function pickRifCard(card){
  rifSelectedCard=card;
  const all=typeof getAllCatalogCards==='function'?getAllCatalogCards():[];
  const c=all.find(cc=>cc._setId===card.setId&&cc.n===card.n);
  const img=c&&typeof getBinderImg==='function'?getBinderImg(c,card.setId):null;
  const preview=document.getElementById('rif-admin-preview');
  if(preview){
    preview.innerHTML=`${img?`<img src="${img}" style="width:70px;border-radius:6px;object-fit:contain;background:var(--surface2)">`:''}
      <div><b>${esc(card.name)}</b><div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">${card.n} · ${(card.setId||'').toUpperCase()}</div></div>`;
    preview.style.display='flex';
  }
  const nameEl=document.getElementById('rif-admin-titulo');
  if(nameEl)nameEl.value=card.name;
  const box=document.getElementById('rif-admin-search-results');
  if(box)box.innerHTML='';
  const searchEl=document.getElementById('rif-admin-search');
  if(searchEl)searchEl.value='';
}

function clearRifCardSelection(){
  rifSelectedCard=null;
  const preview=document.getElementById('rif-admin-preview');
  if(preview){preview.style.display='none';preview.innerHTML='';}
}

function handleRifPhotoPick(ev){
  const picked=Array.from(ev.target?.files||[]);
  if(!picked.length)return;
  const statusEl=document.getElementById('rif-admin-status');
  for(const file of picked){
    if(!file.type.startsWith('image/')){if(statusEl)statusEl.textContent=`"${file.name}" não é uma imagem — ignorado.`;continue;}
    if(file.size>RIF_PHOTO_MAX_INPUT_MB*1024*1024){if(statusEl)statusEl.textContent=`"${file.name}" passa de ${RIF_PHOTO_MAX_INPUT_MB}MB — ignorado.`;continue;}
    if(rifCustomPhotoFiles.length>=RIF_PHOTO_MAX){if(statusEl)statusEl.textContent=`Máximo de ${RIF_PHOTO_MAX} fotos.`;break;}
    rifCustomPhotoFiles.push(file);
  }
  ev.target.value='';
  renderRifPhotoPreview();
}

function removeRifPhotoPick(idx){rifCustomPhotoFiles.splice(idx,1);renderRifPhotoPreview();}
function clearRifPhotoPick(){
  rifCustomPhotoFiles=[];
  const input=document.getElementById('rif-admin-foto');
  if(input)input.value='';
  renderRifPhotoPreview();
}
function renderRifPhotoPreview(){
  const preview=document.getElementById('rif-admin-foto-preview');
  if(!preview)return;
  if(!rifCustomPhotoFiles.length){preview.style.display='none';preview.innerHTML='';return;}
  preview.style.display='flex';
  preview.innerHTML=rifCustomPhotoFiles.map((file,idx)=>{
    const url=URL.createObjectURL(file);
    return`<div style="position:relative">
      <img src="${url}" style="width:70px;height:70px;border-radius:6px;object-fit:cover;background:var(--surface2)">
      <button type="button" onclick="removeRifPhotoPick(${idx})" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:none;background:var(--surface2);color:var(--muted);cursor:pointer;font-size:11px">✕</button>
    </div>`;
  }).join('');
}

async function publishRaffle(){
  if(!aucIsLeilaoAdmin)return;
  const statusEl=document.getElementById('rif-admin-status');
  const titulo=(document.getElementById('rif-admin-titulo')?.value||'').trim();
  const descricao=(document.getElementById('rif-admin-desc')?.value||'').trim();
  const ticketCount=parseInt(document.getElementById('rif-admin-qtd')?.value);
  const ticketPrice=parseFloat(document.getElementById('rif-admin-preco')?.value);
  const pixKey=(document.getElementById('rif-admin-pix')?.value||'').trim();
  const pixTitular=(document.getElementById('rif-admin-pix-titular')?.value||'').trim();

  if(!titulo){if(statusEl)statusEl.textContent='Informe o nome/prêmio da rifa (ou selecione uma carta na busca).';return;}
  if(!ticketCount||ticketCount<2||ticketCount>1000){if(statusEl)statusEl.textContent='Quantidade de números precisa ser entre 2 e 1000.';return;}
  if(!ticketPrice||ticketPrice<=0){if(statusEl)statusEl.textContent='Informe um valor por número válido.';return;}
  if(!pixKey||!pixTitular){if(statusEl)statusEl.textContent='Informe a chave PIX e o nome do titular.';return;}

  const all=typeof getAllCatalogCards==='function'?getAllCatalogCards():[];
  const matchedCard=rifSelectedCard?all.find(cc=>cc._setId===rifSelectedCard.setId&&cc.n===rifSelectedCard.n):null;
  let imageUrl=matchedCard&&typeof getBinderImg==='function'?getBinderImg(matchedCard,rifSelectedCard.setId):null;
  let photoUrls=null;

  if(rifCustomPhotoFiles.length){
    if(statusEl)statusEl.textContent=`Enviando ${rifCustomPhotoFiles.length} foto(s)...`;
    try{
      photoUrls=typeof uploadAuctionPhotos==='function'?await uploadAuctionPhotos(rifCustomPhotoFiles):[];
      if(photoUrls.length)imageUrl=photoUrls[0];
    }catch(e){
      console.error('[rifa] publishRaffle upload',e);
      if(statusEl)statusEl.textContent='Erro ao enviar as fotos. Tente de novo.';
      return;
    }
  }

  const payload={
    title:titulo,
    set_id:rifSelectedCard?.setId||null,
    card_n:rifSelectedCard?.n||null,
    image_url:imageUrl||null,
    photo_urls:photoUrls,
    description:descricao||null,
    ticket_count:ticketCount,
    ticket_price:ticketPrice,
    pix_key:pixKey,
    pix_titular:pixTitular
  };

  const{error}=await sbClient.from('raffles').insert(payload);
  if(error){console.error('[rifa] publishRaffle',error);if(statusEl)statusEl.textContent='Erro ao publicar. Verifique se rodou rifa_setup.sql no Supabase.';return;}

  if(statusEl)statusEl.textContent='✓ Rifa publicada!';
  clearRifCardSelection();
  clearRifPhotoPick();
  ['rif-admin-titulo','rif-admin-desc','rif-admin-qtd','rif-admin-preco','rif-admin-pix','rif-admin-pix-titular']
    .forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  setStatus('Rifa publicada','ok');
  await loadRaffles();
  await loadRaffleNumberCounts();
  renderRafflesList();
}

async function rifCancelRaffle(raffleId){
  if(!aucIsLeilaoAdmin)return;
  if(!confirm('Cancelar esta rifa? Isso não pode ser desfeito.'))return;
  const{error}=await sbClient.from('raffles').update({status:'cancelada',updated_at:new Date().toISOString()}).eq('id',raffleId);
  if(error){console.error('[rifa] rifCancelRaffle',error);setStatus('Erro ao cancelar rifa','err');return;}
  setStatus('Rifa cancelada','ok');
  await loadRaffles();
  renderRafflesList();
}

// ── PAINEL DO RIFEIRO — REVISÃO DE PAGAMENTOS ───────────────────
async function loadPendingRafflePayments(){
  const{data,error}=await sbClient.from('raffle_payments')
    .select('*, raffles(title)')
    .eq('status','pendente')
    .order('created_at',{ascending:true});
  if(error){console.error('[rifa] loadPendingRafflePayments',error);rifAdminPendingPayments=[];return;}
  rifAdminPendingPayments=Array.isArray(data)?data:[];
}

async function renderRafflePaymentsReview(){
  const wrap=document.getElementById('rif-review-list');
  if(!wrap)return;
  if(!rifAdminPendingPayments.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhum pagamento pendente de revisão.</div>`;return;}

  const rows=await Promise.all(rifAdminPendingPayments.map(async p=>{
    const{data:signed}=await sbClient.storage.from('rifa-comprovantes').createSignedUrl(p.proof_path,600);
    const{data:nums}=await sbClient.from('raffle_numbers').select('number').eq('payment_id',p.id).order('number');
    const{data:addr}=await sbClient.from('user_addresses').select('whatsapp').eq('user_id',p.user_id).maybeSingle();
    return`<div class="cv-item" style="cursor:default;flex-direction:column;align-items:stretch;gap:8px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        ${signed?.signedUrl?`<img src="${signed.signedUrl}" onclick="window.open('${signed.signedUrl}','_blank')" style="width:80px;border-radius:6px;object-fit:contain;background:var(--surface2);cursor:zoom-in" title="Clique pra ampliar">`:''}
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700">${esc(p.raffles?.title||'Rifa')}</div>
          <div style="font-size:11px;color:var(--muted)">${p.quantity} número(s) — R$ ${fmtR(p.total_amount)}</div>
          <div style="font-size:11px;color:var(--muted)">Números: ${(nums||[]).map(n=>n.number).join(', ')||'—'}</div>
          <div style="font-size:11px;color:var(--muted)">${addr?.whatsapp?`WhatsApp: ${esc(addr.whatsapp)}`:'Sem WhatsApp cadastrado'}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-add" onclick="confirmRifPayment(${p.id})">✓ Confirmar pagamento</button>
        <button class="cv-item-remove" onclick="rejectRifPayment(${p.id})">✕ Rejeitar</button>
      </div>
    </div>`;
  }));
  wrap.innerHTML=rows.join('');
}

async function confirmRifPayment(paymentId){
  if(!aucIsLeilaoAdmin)return;
  const{error}=await sbClient.rpc('confirm_raffle_payment',{p_payment_id:paymentId});
  if(error){console.error('[rifa] confirmRifPayment',error);setStatus('Erro ao confirmar','err');return;}
  setStatus('Pagamento confirmado','ok');
  await loadPendingRafflePayments();
  await renderRafflePaymentsReview();
  await loadRaffleNumberCounts();
  renderRafflesList();
}

async function rejectRifPayment(paymentId){
  if(!aucIsLeilaoAdmin)return;
  const reason=prompt('Motivo da rejeição (opcional — visível só pra você):')||null;
  const{error}=await sbClient.rpc('reject_raffle_payment',{p_payment_id:paymentId,p_reason:reason});
  if(error){console.error('[rifa] rejectRifPayment',error);setStatus('Erro ao rejeitar','err');return;}
  setStatus('Pagamento rejeitado — números liberados de novo','ok');
  await loadPendingRafflePayments();
  await renderRafflePaymentsReview();
  await loadRaffleNumberCounts();
  renderRafflesList();
}

// ── SORTEIO ──────────────────────────────────────────────────────
async function rifDrawNow(raffleId){
  if(!aucIsLeilaoAdmin)return;
  if(!confirm('Realizar o sorteio agora? Só dá pra fazer isso uma vez por rifa.'))return;
  const{data,error}=await sbClient.rpc('draw_raffle',{p_raffle_id:raffleId});
  if(error){
    console.error('[rifa] rifDrawNow',error);
    setStatus(error.message||'Erro ao sortear — confira se ainda tem pagamento pendente.','err');
    return;
  }
  setStatus('Sorteio realizado!','ok');
  await loadRaffles();
  await loadRaffleNumberCounts();
  const r=rifRaffleById(raffleId);
  renderRafflesList();
  if(r)rifPlayDrawReveal(r);
}

// Animação simples: gira por números aleatórios por ~2.5s e revela o
// número real que já veio do servidor — dá o efeito "ao vivo" mesmo
// quem só está vendo via polling (rifStartPolling) roda a mesma animação
// no momento em que percebe a mudança de status.
function rifPlayDrawReveal(raffle){
  const box=document.getElementById('rif-draw-reveal-content');
  if(!box){return;}
  if(typeof openModal==='function')openModal('rif-draw-reveal-ov');
  box.innerHTML=`<div style="text-align:center;padding:20px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px">🎬 ${esc(raffle.title)}</div>
    <div id="rif-reveal-number" style="font-size:48px;font-weight:800;color:var(--accent)">?</div>
  </div>`;
  const numEl=document.getElementById('rif-reveal-number');
  let ticks=0;
  const maxN=raffle.ticket_count;
  const spin=setInterval(()=>{
    ticks++;
    if(numEl)numEl.textContent=1+Math.floor(Math.random()*maxN);
    if(ticks>=14){
      clearInterval(spin);
      if(numEl){
        numEl.textContent=raffle.winner_number;
        numEl.style.color='var(--gold)';
      }
      const box2=document.getElementById('rif-draw-reveal-content');
      if(box2)box2.innerHTML+=`<div style="text-align:center;font-size:12px;color:var(--muted);margin-top:10px">Número vencedor 🎉</div>`;
    }
  },180);
}

// ── FALAR COM O RIFEIRO (WhatsApp — vencedor só, reaproveita user_addresses) ──
async function rifContactRifeiro(raffleId){
  const r=rifRaffleById(raffleId);
  if(!r)return;
  const{data:addr}=await sbClient.from('user_addresses').select('whatsapp').eq('user_id',r.created_by).maybeSingle();
  if(!addr?.whatsapp){setStatus('O rifeiro ainda não tem WhatsApp cadastrado — combine por outro canal.','err');return;}
  const digits=typeof aucPhoneDigits==='function'?aucPhoneDigits(addr.whatsapp):addr.whatsapp.replace(/\D/g,'');
  const msg=`Olá! Sou o ganhador do número ${r.winner_number} na rifa "${r.title}" no MyDeck 🎉`;
  window.open(`https://wa.me/55${digits}?text=${encodeURIComponent(msg)}`,'_blank');
}
