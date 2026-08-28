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
let rifAutoNavigated=false; // evita reabrir a aba toda vez que o hook de login roda (mesmo padrão de aucAutoNavigated)
let rifCountdownTimer=null;
let rifAutoDrawTriggered=new Set(); // evita chamar draw_raffle mais de uma vez por rifa nesta aba aberta
let rifScheduleFormOpenFor=null;    // id da rifa com o formulário de agendar sorteio aberto
let rifArchiveConfirmFor=null;      // id da rifa com o "tem certeza?" de arquivar aberto

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
  }else if(!rifAutoNavigated&&typeof goToTab==='function'&&new URLSearchParams(window.location.search).get('rifa')){
    // Chegou por um link compartilhado (?rifa=<id>) — abre a aba direto,
    // sem precisar clicar no menu (mesmo padrão do leilão).
    rifAutoNavigated=true;
    goToTab('rifas');
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
  ['rif-tab-cadastro','rif-tab-revisao','rif-tab-acompanhamento'].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn)btn.style.display=aucIsLeilaoAdmin?'':'none';
  });
  const allowed=aucIsLeilaoAdmin?['rifas','cadastro','revisao','acompanhamento','arquivo']:['rifas','arquivo'];
  switchRifasSubtab(allowed.includes(rifActiveSubtab)?rifActiveSubtab:'rifas');

  await loadRifRulesAcceptance();
  await loadRaffles();
  await loadRaffleNumberCounts();
  await loadMyRaffleNumbers();
  renderRafflesList();
  renderRaffleArchive();
  rifScrollToShared();

  if(aucIsLeilaoAdmin){
    await loadPendingRafflePayments();
    renderRafflePaymentsReview();
    renderRifTracking();
  }

  rifStartPolling();
  startRifCountdownLoop();
}

function switchRifasSubtab(name){
  rifActiveSubtab=name;
  if(name==='acompanhamento'&&aucIsLeilaoAdmin)renderRifTracking();
  ['rifas','cadastro','revisao','acompanhamento','arquivo'].forEach(n=>{
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
    if(newlyDrawn.length)renderRaffleArchive();
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
// Lista principal: só rifas abertas. Sorteadas, canceladas e arquivadas
// (sem sorteio) ficam todas no Arquivo (renderRaffleArchive) — canceladas
// só aparecem lá pro próprio rifeiro que cancelou (RLS, seção 10).
function renderRafflesList(){
  const wrap=document.getElementById('rif-list');
  if(!wrap)return;
  const visible=rifRaffles.filter(r=>r.status==='aberta');
  if(!visible.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhuma rifa aberta no momento.</div>`;return;}
  wrap.innerHTML=visible.map(r=>rifCardHtml(r)).join('');
}

function rifCardHtml(r){
  const img=rifImgFor(r);
  const c=rifNumberCounts[r.id]||{livres:r.ticket_count,pendentes:0,confirmados:0};
  const vendidos=c.pendentes+c.confirmados;
  const pct=r.ticket_count?Math.round((vendidos/r.ticket_count)*100):0;
  const mine=rifMyNumbers[r.id]||[];
  const isWinner=r.status==='sorteada'&&r.winner_user_id===uid();
  // Só o rifeiro que CRIOU essa rifa específica pode gerenciá-la — outro
  // rifeiro (aucIsLeilaoAdmin também) não tem acesso de administrar aqui,
  // só de criar as próprias (ver rifa_setup.sql seção 10).
  const isMine=aucIsLeilaoAdmin&&r.created_by===uid();

  return`<div class="panel${isWinner?' auc-hot-card':''}" id="rif-card-${r.id}">
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
    ${r.status==='aberta'?rifCountdownBannerHtml(r):''}
    ${isMine&&r.status==='aberta'?rifScheduleFormHtml(r,c):''}
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      ${r.status==='aberta'?`<button class="btn-add" onclick="openRifParticipate(${r.id})">🎟️ Participar</button>`:''}
      ${r.status==='aberta'?`<button class="cv-item-remove" style="color:#25d366;border-color:#25d366" onclick="rifShareRaffle(${r.id})">📤 Compartilhar no WhatsApp</button>`:''}
      ${isWinner?`<button class="btn-add" onclick="rifContactRifeiro(${r.id})">💬 Falar com o rifeiro no WhatsApp</button>`:''}
      ${isMine&&r.status==='aberta'?`<button class="btn-add" onclick="openRifManualPayment(${r.id})">✍️ Marcar Pagamento Manual</button>`:''}
      ${isMine&&r.status==='aberta'?`<button class="cv-item-remove" style="color:var(--gold);border-color:var(--gold)" onclick="rifDrawNow(${r.id})">🎬 Realizar Sorteio Agora</button>`:''}
      ${isMine&&r.status==='aberta'?rifArchiveButtonHtml(r.id):''}
      ${isMine&&r.status==='aberta'?`<button class="cv-item-remove" onclick="rifCancelRaffle(${r.id})">🗑️ Cancelar</button>`:''}
    </div>
  </div>`;
}

// Botão de arquivar com confirmação DENTRO da própria tela (não usa o
// confirm() nativo do navegador) — pedido do Eduardo: clique sem querer
// não pode disparar a ação, precisa de um segundo clique explícito.
function rifArchiveButtonHtml(raffleId){
  if(rifArchiveConfirmFor===raffleId){
    return`<span style="font-size:10.5px;color:var(--muted);align-self:center">Arquivar mesmo, sem sortear?</span>
      <button class="btn-add" onclick="rifArchiveRaffleManually(${raffleId})">✓ Confirmar arquivamento</button>
      <button class="cv-item-remove" onclick="cancelRifArchiveConfirm()">Voltar</button>`;
  }
  return`<button class="cv-item-remove" onclick="openRifArchiveConfirm(${raffleId})">📦 Arquivar</button>`;
}

function openRifArchiveConfirm(raffleId){
  rifArchiveConfirmFor=raffleId;
  renderRafflesList();
}
function cancelRifArchiveConfirm(){
  rifArchiveConfirmFor=null;
  renderRafflesList();
}

async function rifArchiveRaffleManually(raffleId){
  rifArchiveConfirmFor=null;
  const{error}=await sbClient.rpc('archive_raffle_without_draw',{p_raffle_id:raffleId});
  if(error){console.error('[rifa] rifArchiveRaffleManually',error);setStatus(error.message||'Erro ao arquivar','err');return;}
  setStatus('Rifa arquivada','ok');
  await loadRaffles();
  renderRafflesList();
  renderRaffleArchive();
}

// ── ARQUIVO DE RIFAS ENCERRADAS (28/08/2026) ────────────────────
// Pedido do Eduardo: aberto pra qualquer usuário, mostra as rifas
// sorteadas (número vencedor em destaque), arquivadas sem sorteio e —
// só pro próprio rifeiro que cancelou, via RLS da seção 10 — as
// canceladas, que antes ficavam misturadas na lista principal.
function renderRaffleArchive(){
  const wrap=document.getElementById('rif-archive-list');
  if(!wrap)return;
  const done=rifRaffles.filter(r=>['sorteada','arquivada','cancelada'].includes(r.status))
    .sort((a,b)=>new Date(b.drawn_at||b.updated_at)-new Date(a.drawn_at||a.updated_at));
  if(!done.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhuma rifa encerrada ainda.</div>`;return;}
  wrap.innerHTML=done.map(r=>rifArchiveCardHtml(r)).join('');
}

function rifArchiveCardHtml(r){
  const img=rifImgFor(r);
  const isWinner=r.status==='sorteada'&&r.winner_user_id===uid();
  const dt=new Date(r.drawn_at||r.updated_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});

  let statusBox;
  if(r.status==='sorteada'){
    statusBox=`<div style="text-align:center;padding:8px 16px;background:var(--surface2);border-radius:10px;border:1px solid var(--gold)">
      <div style="font-size:9px;color:var(--muted)">NÚMERO SORTEADO</div>
      <div style="font-size:26px;font-weight:800;color:var(--gold);font-family:'Space Mono',monospace">${r.winner_number}</div>
    </div>`;
  }else if(r.status==='arquivada'){
    statusBox=`<div style="text-align:center;padding:8px 16px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--muted)">📦 Encerrada sem sorteio</div>
    </div>`;
  }else{
    statusBox=`<div style="text-align:center;padding:8px 16px;background:var(--surface2);border-radius:10px;border:1px solid var(--accent)">
      <div style="font-size:11px;color:var(--accent)">🗑️ Cancelada</div>
    </div>`;
  }

  return`<div class="panel${isWinner?' auc-hot-card':''}">
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
      ${img?`<img src="${img}" alt="${esc(r.title)}" style="width:80px;border-radius:8px;object-fit:contain;background:var(--surface2)">`:''}
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:14px">🎟️ ${esc(r.title)}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px">${r.ticket_count} número(s) · ${dt}</div>
      </div>
      ${statusBox}
    </div>
    ${isWinner?`<div style="font-size:12px;font-weight:700;color:var(--gold);margin-top:10px">🎉 Parabéns, você ganhou essa rifa!</div>`:''}
  </div>`;
}

// ── COMPARTILHAR NO WHATSAPP (28/08/2026, com link + imagem) ────
// Botão aberto pra qualquer um (participante ou não) espalhar a rifa —
// já leva as regras resumidas + passo a passo, o link direto pra essa
// rifa (?rifa=<id> — abre a aba sozinho, ver updateRifasTabVisibility) e,
// quando o navegador suporta (celular, principalmente), a FOTO do prêmio
// anexada de verdade — mesmo padrão de shareAuctionText/aucFetchImageBlob
// do leilão (leilao.js), sem número fixo de destino.
function rifShareUrl(raffleId){
  const base=window.location.origin+window.location.pathname;
  return`${base}?rifa=${raffleId}`;
}

function rifShareMessage(r){
  const c=rifNumberCounts[r.id]||{livres:r.ticket_count};
  const url=rifShareUrl(r.id);
  return`🎟️ *RIFA: ${r.title}*\n\n`+
    `${r.description?r.description+'\n\n':''}`+
    `💰 R$ ${fmtR(r.ticket_price)} por número — ${c.livres} de ${r.ticket_count} ainda livre(s)\n\n`+
    `📋 *Como participar:*\n`+
    `1️⃣ Entre no link abaixo (abre direto na rifa)\n`+
    `2️⃣ Clique em "Participar" e escolha quantos números quer\n`+
    `3️⃣ Pague via PIX (a chave aparece na hora) e envie o comprovante\n`+
    `4️⃣ Escolha seus números entre os livres\n`+
    `5️⃣ Aguarde a confirmação e acompanhe o sorteio ao vivo, com contagem regressiva! 🎬\n\n`+
    `Ao participar você aceita as regras da rifa, exibidas no site antes de começar.\n\n`+
    `Vem ver:\n${url}`;
}

async function rifShareRaffle(raffleId){
  const r=rifRaffleById(raffleId);
  if(!r)return;
  const msg=rifShareMessage(r);
  const imgUrl=rifImgFor(r);

  // Celular com suporte a compartilhar arquivo: manda a foto do prêmio
  // JUNTO com o texto (link incluso), tudo num só compartilhamento nativo.
  if(imgUrl&&navigator.share&&navigator.canShare){
    try{
      const blob=typeof aucFetchImageBlob==='function'?await aucFetchImageBlob(imgUrl):null;
      if(blob){
        const file=new File([blob],'rifa.jpg',{type:blob.type||'image/jpeg'});
        if(navigator.canShare({files:[file]})){
          await navigator.share({title:`Rifa — ${r.title}`,text:msg,files:[file]});
          return;
        }
      }
    }catch(e){ if(e?.name==='AbortError')return; /* cai pro fallback abaixo */ }
  }
  // Sem imagem, ou sem suporte a anexar arquivo: compartilhamento nativo só
  // com texto (que já leva o link) — ou, no desktop, abre o WhatsApp Web
  // direto com a mensagem pronta e copia pro clipboard também.
  if(navigator.share){
    try{ await navigator.share({title:`Rifa — ${r.title}`,text:msg}); return; }
    catch(e){ if(e?.name==='AbortError')return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
  if(navigator.clipboard)navigator.clipboard.writeText(msg).catch(()=>{});
  setStatus('Mensagem pronta pro WhatsApp (também copiada)','ok');
}

// Se chegou por um link compartilhado (?rifa=<id>), rola a tela até o
// card daquela rifa específica e dá um destaque rápido, pra não precisar
// procurar na lista.
function rifScrollToShared(){
  const id=parseInt(new URLSearchParams(window.location.search).get('rifa'));
  if(!id)return;
  const el=document.getElementById(`rif-card-${id}`);
  if(!el)return;
  setTimeout(()=>{
    el.scrollIntoView({behavior:'smooth',block:'center'});
    el.style.transition='box-shadow .3s ease';
    el.style.boxShadow='0 0 0 3px var(--accent)';
    setTimeout(()=>{el.style.boxShadow='';},2200);
  },300);
}

// ── LETREIRO DE CONTAGEM REGRESSIVA (28/08/2026) ────────────────
// Pedido do Eduardo: depois que o rifeiro agenda o sorteio, todo mundo
// com a aba aberta vê um letreiro contando o tempo até a hora marcada —
// nos últimos 10s os números ficam maiores/animados. Ao chegar a zero,
// quem é rifeiro dispara o sorteio automaticamente (uma única vez);
// quem só está assistindo pega a mudança pelo polling normal.
function rifCountdownBannerHtml(r){
  if(!r.draw_scheduled_at)return'';
  return`<div class="rif-countdown-banner" id="rif-countdown-${r.id}" data-raffle-id="${r.id}" data-scheduled="${r.draw_scheduled_at}">
    <div class="rif-countdown-label">🎬 SORTEIO AO VIVO EM</div>
    <div class="rif-countdown-clock">--:--:--</div>
  </div>`;
}

function rifFmtCountdown(ms){
  const total=Math.max(0,Math.floor(ms/1000));
  const h=Math.floor(total/3600), m=Math.floor((total%3600)/60), s=total%60;
  return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function startRifCountdownLoop(){
  stopRifCountdownLoop();
  rifCountdownLoopTick();
  rifCountdownTimer=setInterval(rifCountdownLoopTick,500);
}
function stopRifCountdownLoop(){
  if(rifCountdownTimer){clearInterval(rifCountdownTimer);rifCountdownTimer=null;}
}
function rifCountdownLoopTick(){
  const pane=document.getElementById('rifas');
  if(!pane||!pane.classList.contains('active')){stopRifCountdownLoop();return;}
  document.querySelectorAll('.rif-countdown-banner').forEach(box=>{
    const raffleId=parseInt(box.dataset.raffleId);
    const scheduled=new Date(box.dataset.scheduled).getTime();
    const clock=box.querySelector('.rif-countdown-clock');
    const diff=scheduled-Date.now();
    if(diff<=0){
      if(clock)clock.textContent='🎬 AO VIVO AGORA';
      box.classList.add('rif-hot');
      rifMaybeAutoDraw(raffleId);
      return;
    }
    if(clock)clock.textContent=rifFmtCountdown(diff);
    box.classList.toggle('rif-hot',diff<=10000);
  });
}

// Só quem é rifeiro dispara o sorteio de fato (a RPC já barra qualquer
// outra pessoa) — dispara uma única vez por rifa nesta sessão da aba.
async function rifMaybeAutoDraw(raffleId){
  if(!aucIsLeilaoAdmin)return;
  if(rifAutoDrawTriggered.has(raffleId))return;
  const r=rifRaffleById(raffleId);
  if(!r||r.status!=='aberta')return;
  rifAutoDrawTriggered.add(raffleId);
  const{data,error}=await sbClient.rpc('draw_raffle',{p_raffle_id:raffleId});
  if(error){
    console.error('[rifa] rifMaybeAutoDraw',error);
    rifAutoDrawTriggered.delete(raffleId); // permite tentar de novo no próximo tick
    return;
  }
  await loadRaffles();
  await loadRaffleNumberCounts();
  const updated=rifRaffleById(raffleId);
  renderRafflesList();
  renderRaffleArchive();
  if(updated)rifPlayDrawReveal(updated);
}

// ── FORMULÁRIO DO RIFEIRO PRA AGENDAR O SORTEIO (28/08/2026) ───
function rifScheduleFormHtml(r,c){
  const pendencias=c.pendentes>0;
  if(pendencias){
    return`<div class="mkt-note" style="margin-top:10px">⏳ Ainda tem ${c.pendentes} pagamento(s) pendente(s) — revise em "Revisão de Pagamentos" antes de agendar o sorteio.</div>`;
  }
  if(rifScheduleFormOpenFor===r.id){
    return`<div class="panel" style="padding:12px;margin-top:10px">
      <div class="ff"><label>Dia e hora do sorteio</label>
        <input type="datetime-local" id="rif-schedule-input-${r.id}" value="${rifDefaultScheduleValue()}">
      </div>
      <div id="rif-schedule-status-${r.id}" style="font-size:10.5px;color:var(--accent);margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-add" onclick="submitRifSchedule(${r.id})">✓ Confirmar horário</button>
        <button class="cv-item-remove" onclick="closeRifScheduleForm()">Cancelar</button>
      </div>
    </div>`;
  }
  if(r.draw_scheduled_at){
    return`<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-add" onclick="openRifScheduleForm(${r.id})">🗓️ Alterar horário do sorteio</button>
      <button class="cv-item-remove" onclick="cancelRifSchedule(${r.id})">✕ Cancelar agendamento</button>
    </div>`;
  }
  return`<div style="margin-top:10px">
    <button class="btn-add" onclick="openRifScheduleForm(${r.id})">🗓️ Agendar Sorteio</button>
  </div>`;
}

function rifDefaultScheduleValue(){
  // datetime-local pede horário local sem timezone — sugere daqui 10min.
  const d=new Date(Date.now()+10*60000);
  d.setSeconds(0,0);
  const pad=n=>String(n).padStart(2,'0');
  return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openRifScheduleForm(raffleId){
  rifScheduleFormOpenFor=raffleId;
  renderRafflesList();
}
function closeRifScheduleForm(){
  rifScheduleFormOpenFor=null;
  renderRafflesList();
}

async function submitRifSchedule(raffleId){
  const input=document.getElementById(`rif-schedule-input-${raffleId}`);
  const statusEl=document.getElementById(`rif-schedule-status-${raffleId}`);
  if(!input?.value){if(statusEl)statusEl.textContent='Escolha um dia e horário.';return;}
  const scheduledAt=new Date(input.value);
  if(isNaN(scheduledAt.getTime())||scheduledAt.getTime()<=Date.now()){
    if(statusEl)statusEl.textContent='Escolha um horário no futuro.';return;
  }
  if(statusEl)statusEl.textContent='Agendando...';
  const{error}=await sbClient.rpc('schedule_raffle_draw',{p_raffle_id:raffleId,p_scheduled_at:scheduledAt.toISOString()});
  if(error){
    console.error('[rifa] submitRifSchedule',error);
    if(statusEl)statusEl.textContent=error.message||'Erro ao agendar.';
    return;
  }
  rifScheduleFormOpenFor=null;
  rifAutoDrawTriggered.delete(raffleId);
  setStatus('Sorteio agendado! O letreiro de contagem regressiva já está visível pra todo mundo.','ok');
  await loadRaffles();
  renderRafflesList();
  startRifCountdownLoop();
}

async function cancelRifSchedule(raffleId){
  if(!confirm('Cancelar o agendamento do sorteio? O letreiro de contagem regressiva vai sumir.'))return;
  const{error}=await sbClient.rpc('cancel_raffle_draw_schedule',{p_raffle_id:raffleId});
  if(error){console.error('[rifa] cancelRifSchedule',error);setStatus('Erro ao cancelar agendamento','err');return;}
  setStatus('Agendamento cancelado','ok');
  await loadRaffles();
  renderRafflesList();
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
      <div class="ff"><label>Seu nome *</label>
        <input id="rif-buyer-name" placeholder="Nome completo (o rifeiro usa isso pra te identificar)">
      </div>
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
  const buyerName=(document.getElementById('rif-buyer-name')?.value||'').trim();
  const qty=parseInt(document.getElementById('rif-qty-input')?.value);
  const c=rifNumberCounts[r.id]||{livres:r.ticket_count};
  if(!buyerName){if(statusEl)statusEl.textContent='Informe seu nome.';return;}
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
      .insert({raffle_id:raffleId,user_id:uid(),quantity:qty,total_amount:total,proof_path:path,status:'pendente',buyer_name:buyerName})
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

// ── PAGAMENTO MANUAL PELO RIFEIRO (28/08/2026) ──────────────────
// Pra gente que pagou por fora do site (dinheiro, PIX combinado direto
// etc.) — o próprio rifeiro dono da rifa escreve o nome, marca os
// números e confirma tudo de uma vez (não passa pela fila de revisão,
// já nasce confirmado — ver admin_add_manual_raffle_payment no SQL).
// rifManualPayment.mode: 'new' (lançar pagamento do zero) ou 'fix'
// (completar números de um pagamento que já existe e ficou faltando —
// ver openRifFixPaymentNumbers, pro relato do Eduardo de PIX recebido
// sem os números aparecerem).
let rifManualPayment=null; // {raffleId, chosen:Set, mode, paymentId, neededCount, buyerLabel}

function openRifManualPayment(raffleId){
  const r=rifRaffleById(raffleId);
  if(!r||!aucIsLeilaoAdmin||r.created_by!==uid())return;
  rifManualPayment={raffleId,chosen:new Set(),mode:'new'};
  renderRifManualPaymentContent();
  if(typeof openModal==='function')openModal('rif-manual-payment-ov');
}

// Chamado a partir da Revisão de Pagamentos (ou da aba Acompanhamento)
// quando um pagamento pendente tem menos números escolhidos do que a
// quantidade paga — o rifeiro completa a diferença aqui.
function openRifFixPaymentNumbers(paymentId,raffleId,neededCount,buyerLabel){
  const r=rifRaffleById(raffleId);
  if(!r||!aucIsLeilaoAdmin||r.created_by!==uid())return;
  rifManualPayment={raffleId,chosen:new Set(),mode:'fix',paymentId,neededCount,buyerLabel};
  renderRifManualPaymentContent();
  if(typeof openModal==='function')openModal('rif-manual-payment-ov');
}

async function renderRifManualPaymentContent(){
  const box=document.getElementById('rif-manual-payment-content');
  if(!box||!rifManualPayment)return;
  const r=rifRaffleById(rifManualPayment.raffleId);
  if(!r)return;
  if(rifManualPayment.mode==='fix'){
    box.innerHTML=`
      <h3 style="margin-bottom:4px">🔢 Completar números</h3>
      <div style="font-size:11px;color:var(--muted);margin-bottom:14px">${esc(r.title)} — ${esc(rifManualPayment.buyerLabel||'pagamento')} pagou mas não terminou de escolher os números. Marque exatamente ${rifManualPayment.neededCount} pra completar.</div>
      <div style="font-size:11px;color:var(--muted);margin:10px 0 6px">Selecionados: <b id="rif-manual-picked-count">0</b>/${rifManualPayment.neededCount}</div>
      <div id="rif-manual-number-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:6px;max-height:36vh;overflow-y:auto;margin-bottom:14px"></div>
      <div id="rif-manual-status" style="font-size:10.5px;color:var(--accent);margin:8px 0"></div>
      <button class="btn-add" id="rif-manual-submit-btn" disabled onclick="submitRifFixPaymentNumbers()">✓ Atribuir números</button>`;
  }else{
    box.innerHTML=`
      <h3 style="margin-bottom:4px">✍️ Marcar pagamento manual</h3>
      <div style="font-size:11px;color:var(--muted);margin-bottom:14px">${esc(r.title)} — pra quem pagou por fora do site (dinheiro, PIX combinado direto etc.)</div>
      <div class="ff"><label>Nome de quem pagou *</label>
        <input id="rif-manual-name" placeholder="Nome completo">
      </div>
      <div style="font-size:11px;color:var(--muted);margin:10px 0 6px">Marque os números que essa pessoa ficou. Selecionados: <b id="rif-manual-picked-count">0</b></div>
      <div id="rif-manual-number-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:6px;max-height:36vh;overflow-y:auto;margin-bottom:14px"></div>
      <div id="rif-manual-status" style="font-size:10.5px;color:var(--accent);margin:8px 0"></div>
      <button class="btn-add" onclick="submitRifManualPayment()">✓ Confirmar pagamento</button>`;
  }
  await renderRifManualNumberGrid();
}

async function renderRifManualNumberGrid(){
  const grid=document.getElementById('rif-manual-number-grid');
  if(!grid||!rifManualPayment)return;
  const raffleId=rifManualPayment.raffleId;
  const{data,error}=await sbClient.from('raffle_numbers')
    .select('number,payment_id').eq('raffle_id',raffleId).order('number');
  if(error){console.error('[rifa] renderRifManualNumberGrid',error);return;}
  grid.innerHTML=(data||[]).map(n=>{
    const taken=!!n.payment_id;
    const chosen=rifManualPayment.chosen.has(n.number);
    const bg=taken?'var(--surface2)':chosen?'var(--accent)':'var(--surface)';
    const color=taken?'var(--muted)':chosen?'#fff':'var(--text)';
    return`<button type="button" ${taken?'disabled':''} onclick="rifToggleManualNumber(${n.number})"
      style="padding:8px 0;border-radius:6px;border:1px solid var(--border);background:${bg};color:${color};font-size:11px;cursor:${taken?'not-allowed':'pointer'}">${n.number}</button>`;
  }).join('');
}

function rifToggleManualNumber(number){
  if(!rifManualPayment)return;
  if(rifManualPayment.chosen.has(number)){
    rifManualPayment.chosen.delete(number);
  }else{
    if(rifManualPayment.mode==='fix'&&rifManualPayment.chosen.size>=rifManualPayment.neededCount){
      setStatus(`Marque no máximo ${rifManualPayment.neededCount} número(s).`,'err');
      return;
    }
    rifManualPayment.chosen.add(number);
  }
  renderRifManualNumberGrid();
  const countEl=document.getElementById('rif-manual-picked-count');
  if(countEl)countEl.textContent=rifManualPayment.chosen.size;
  if(rifManualPayment.mode==='fix'){
    const btn=document.getElementById('rif-manual-submit-btn');
    if(btn)btn.disabled=rifManualPayment.chosen.size!==rifManualPayment.neededCount;
  }
}

async function submitRifManualPayment(){
  if(!rifManualPayment)return;
  const statusEl=document.getElementById('rif-manual-status');
  const name=(document.getElementById('rif-manual-name')?.value||'').trim();
  const numbers=Array.from(rifManualPayment.chosen);
  if(!name){if(statusEl)statusEl.textContent='Informe o nome de quem pagou.';return;}
  if(!numbers.length){if(statusEl)statusEl.textContent='Marque pelo menos um número.';return;}
  if(statusEl)statusEl.textContent='Salvando...';
  const{error}=await sbClient.rpc('admin_add_manual_raffle_payment',{
    p_raffle_id:rifManualPayment.raffleId,p_buyer_name:name,p_numbers:numbers
  });
  if(error){
    console.error('[rifa] submitRifManualPayment',error);
    if(statusEl)statusEl.textContent=error.message||'Erro ao salvar — atualize e tente de novo.';
    renderRifManualNumberGrid();
    return;
  }
  setStatus(`Pagamento de ${name} confirmado — ${numbers.length} número(s).`,'ok');
  if(typeof closeModal==='function')closeModal('rif-manual-payment-ov');
  rifManualPayment=null;
  await loadRaffleNumberCounts();
  renderRafflesList();
  if(typeof renderRifTracking==='function')renderRifTracking();
}

async function submitRifFixPaymentNumbers(){
  if(!rifManualPayment||rifManualPayment.mode!=='fix')return;
  const statusEl=document.getElementById('rif-manual-status');
  const numbers=Array.from(rifManualPayment.chosen);
  if(numbers.length!==rifManualPayment.neededCount){
    if(statusEl)statusEl.textContent=`Marque exatamente ${rifManualPayment.neededCount} número(s).`;
    return;
  }
  if(statusEl)statusEl.textContent='Salvando...';
  const{error}=await sbClient.rpc('admin_assign_numbers_to_payment',{
    p_payment_id:rifManualPayment.paymentId,p_numbers:numbers
  });
  if(error){
    console.error('[rifa] submitRifFixPaymentNumbers',error);
    if(statusEl)statusEl.textContent=error.message||'Erro ao salvar — atualize e tente de novo.';
    renderRifManualNumberGrid();
    return;
  }
  setStatus('Números completados — já dá pra confirmar o pagamento.','ok');
  if(typeof closeModal==='function')closeModal('rif-manual-payment-ov');
  rifManualPayment=null;
  await loadPendingRafflePayments();
  await renderRafflePaymentsReview();
  await loadRaffleNumberCounts();
  renderRafflesList();
  if(typeof renderRifTracking==='function')renderRifTracking();
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
    const have=(nums||[]).length;
    const missing=p.quantity-have;
    return`<div class="cv-item" style="cursor:default;flex-direction:column;align-items:stretch;gap:8px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        ${signed?.signedUrl?`<img src="${signed.signedUrl}" onclick="window.open('${signed.signedUrl}','_blank')" style="width:80px;border-radius:6px;object-fit:contain;background:var(--surface2);cursor:zoom-in" title="Clique pra ampliar">`:''}
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700">${esc(p.raffles?.title||'Rifa')}${p.buyer_name?` — ${esc(p.buyer_name)}`:''}</div>
          <div style="font-size:11px;color:var(--muted)">${p.quantity} número(s) — R$ ${fmtR(p.total_amount)}</div>
          <div style="font-size:11px;color:${missing>0?'var(--accent)':'var(--muted)'}">Números: ${(nums||[]).map(n=>n.number).join(', ')||'—'}${missing>0?` ⚠️ faltam ${missing}`:''}</div>
          <div style="font-size:11px;color:var(--muted)">${addr?.whatsapp?`WhatsApp: ${esc(addr.whatsapp)}`:'Sem WhatsApp cadastrado'}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${missing>0?`<button class="btn-add" onclick="openRifFixPaymentNumbers(${p.id},${p.raffle_id},${missing},'${esc(p.buyer_name||'esse pagamento').replace(/'/g,"\\'")}')">🔢 Completar ${missing} número(s)</button>`
          :`<button class="btn-add" onclick="confirmRifPayment(${p.id})">✓ Confirmar pagamento</button>`}
        <button class="cv-item-remove" onclick="rejectRifPayment(${p.id})">✕ Rejeitar</button>
      </div>
    </div>`;
  }));
  wrap.innerHTML=rows.join('');
}

async function confirmRifPayment(paymentId){
  if(!aucIsLeilaoAdmin)return;
  const{error}=await sbClient.rpc('confirm_raffle_payment',{p_payment_id:paymentId});
  if(error){console.error('[rifa] confirmRifPayment',error);setStatus(error.message||'Erro ao confirmar','err');return;}
  setStatus('Pagamento confirmado','ok');
  await loadPendingRafflePayments();
  await renderRafflePaymentsReview();
  await loadRaffleNumberCounts();
  renderRafflesList();
  renderRifTracking();
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
  renderRifTracking();
}

// ── ACOMPANHAMENTO (rifeiro/admin, 28/08/2026) ──────────────────
// Pedido do Eduardo: visão de tudo — nome de quem pagou, quantidade,
// números, confirmado ou não — mais o financeiro consolidado, pra pegar
// na hora um pagamento "travado" sem número (relato do PIX recebido sem
// os números aparecerem). RLS (seção 10) já garante que só vêm
// pagamentos das rifas que o próprio rifeiro criou.
async function renderRifTracking(){
  const summaryBox=document.getElementById('rif-tracking-summary');
  const listBox=document.getElementById('rif-tracking-list');
  if(!summaryBox||!listBox||!aucIsLeilaoAdmin)return;

  const{data,error}=await sbClient.from('raffle_payments')
    .select('*, raffles!inner(title,created_by,status), raffle_numbers(number)')
    .eq('raffles.created_by',uid())
    .order('created_at',{ascending:false});
  if(error){
    console.error('[rifa] renderRifTracking',error);
    listBox.innerHTML=`<div class="cv-item-empty">Erro ao carregar acompanhamento.</div>`;
    return;
  }
  const payments=Array.isArray(data)?data:[];

  const confirmados=payments.filter(p=>p.status==='confirmado');
  const pendentes=payments.filter(p=>p.status==='pendente');
  const rejeitados=payments.filter(p=>p.status==='rejeitado');
  const totalConfirmado=confirmados.reduce((s,p)=>s+Number(p.total_amount||0),0);
  const totalPendente=pendentes.reduce((s,p)=>s+Number(p.total_amount||0),0);
  const numerosConfirmados=confirmados.reduce((s,p)=>s+p.quantity,0);
  const semNumeroCompleto=payments.filter(p=>p.status!=='rejeitado'&&(p.raffle_numbers||[]).length<p.quantity).length;

  summaryBox.innerHTML=[
    {label:'💰 Recebido (confirmado)',val:`R$ ${fmtR(totalConfirmado)}`,color:'var(--teal)'},
    {label:'⏳ Aguardando confirmação',val:`R$ ${fmtR(totalPendente)}`,color:'var(--gold)'},
    {label:'🎟️ Números confirmados',val:numerosConfirmados,color:'var(--text)'},
    {label:'⚠️ Pagamentos com número faltando',val:semNumeroCompleto,color:semNumeroCompleto>0?'var(--accent)':'var(--muted)'}
  ].map(s=>`<div class="panel" style="padding:12px;text-align:center">
    <div style="font-size:9.5px;color:var(--muted);margin-bottom:4px">${s.label}</div>
    <div style="font-size:18px;font-weight:800;color:${s.color};font-family:'Space Mono',monospace">${s.val}</div>
  </div>`).join('');

  if(!payments.length){listBox.innerHTML=`<div class="cv-item-empty">Nenhum pagamento registrado ainda.</div>`;return;}

  const STATUS_LBL={pendente:['⏳ Pendente','var(--gold)'],confirmado:['✓ Confirmado','var(--teal)'],rejeitado:['✕ Rejeitado','var(--muted)']};
  listBox.innerHTML=payments.map(p=>{
    const have=(p.raffle_numbers||[]).length;
    const missing=p.quantity-have;
    const[lbl,color]=STATUS_LBL[p.status]||[p.status,'var(--muted)'];
    const dt=new Date(p.created_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
    const nums=(p.raffle_numbers||[]).map(n=>n.number).sort((a,b)=>a-b).join(', ')||'—';
    return`<div class="cv-item" style="cursor:default;flex-direction:column;align-items:stretch;gap:6px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="font-weight:700">${esc(p.buyer_name||'(sem nome)')}${p.is_manual?' <span style="font-size:9px;color:var(--muted);font-weight:400">· manual</span>':''}</div>
        <div style="font-size:11px;font-weight:700;color:${color}">${lbl}</div>
      </div>
      <div style="font-size:10.5px;color:var(--muted)">${esc(p.raffles?.title||'Rifa')} · ${dt}</div>
      <div style="font-size:11px">${p.quantity} número(s) — R$ ${fmtR(p.total_amount)}</div>
      <div style="font-size:11px;color:${missing>0&&p.status!=='rejeitado'?'var(--accent)':'var(--muted)'}">Números: ${nums}${missing>0&&p.status!=='rejeitado'?` ⚠️ faltam ${missing}`:''}</div>
      ${missing>0&&p.status==='pendente'?`<button class="btn-add" style="align-self:flex-start" onclick="openRifFixPaymentNumbers(${p.id},${p.raffle_id},${missing},'${esc(p.buyer_name||'esse pagamento').replace(/'/g,"\\'")}')">🔢 Completar ${missing} número(s)</button>`:''}
    </div>`;
  }).join('');
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
  renderRaffleArchive();
  if(r)rifPlayDrawReveal(r);
}

// Roleta "show de TV" (28/08/2026): gira só entre os números que
// realmente foram vendidos/confirmados (exclui os que ninguém escolheu —
// não faria sentido girar em cima de número que nem concorre) e vai
// freando (easing CSS) até parar exatamente no número sorteado que já
// veio do servidor. Aberto pra qualquer um com a rifa na tela — quem só
// está vendo via polling (rifStartPolling) roda a mesma animação no
// momento em que percebe a mudança de status, então todo mundo assiste
// praticamente junto.
async function rifPlayDrawReveal(raffle){
  const box=document.getElementById('rif-draw-reveal-content');
  if(!box)return;

  const{data,error}=await sbClient.from('raffle_numbers')
    .select('number,raffle_payments!inner(status)')
    .eq('raffle_id',raffle.id).eq('raffle_payments.status','confirmado').order('number');
  let sold=(error?[]:(data||[]).map(n=>n.number));
  if(!sold.includes(raffle.winner_number))sold.push(raffle.winner_number);
  if(sold.length<2)sold=[...sold,...sold,...sold]; // garante roleta com mais de um "clique" mesmo em rifa pequena

  if(typeof openModal==='function')openModal('rif-draw-reveal-ov');

  // Embaralha os números vendidos, monta uma sequência longa o bastante
  // pra dar sensação de giro, e garante que o ÚLTIMO ladrilho seja o
  // número sorteado de verdade.
  const shuffled=[...sold].sort(()=>Math.random()-0.5);
  const REPEATS=Math.max(3,Math.ceil(24/shuffled.length));
  let sequence=[];
  for(let i=0;i<REPEATS;i++)sequence=sequence.concat(shuffled);
  sequence=sequence.filter(n=>n!==raffle.winner_number);
  sequence.push(raffle.winner_number);

  const TILE_W=90+10; // largura do ladrilho (90px) + margem (5px de cada lado)
  box.innerHTML=`<div style="text-align:center;padding:16px 8px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:4px">🎬 ${esc(raffle.title)}</div>
    <div style="font-size:10px;color:var(--muted);margin-bottom:10px">Sorteando entre os números vendidos...</div>
    <div class="rif-reel-wrap">
      <div class="rif-reel-marker"></div>
      <div class="rif-reel-track" id="rif-reel-track">
        ${sequence.map((n,i)=>`<div class="rif-reel-tile${i===sequence.length-1?' rif-reel-winner':''}">${n}</div>`).join('')}
      </div>
    </div>
    <div id="rif-reveal-caption"></div>
  </div>`;

  const track=document.getElementById('rif-reel-track');
  if(track){
    // Ponto de parada: centraliza o último ladrilho (o vencedor) embaixo
    // do marcador central do compartimento.
    const wrapWidth=track.parentElement.clientWidth||360;
    const finalOffset=(sequence.length-1)*TILE_W+TILE_W/2-wrapWidth/2;
    requestAnimationFrame(()=>{
      track.classList.add('rif-reel-spinning');
      track.style.transform=`translateX(-${finalOffset}px)`;
    });
    track.addEventListener('transitionend',()=>{
      const caption=document.getElementById('rif-reveal-caption');
      if(caption)caption.innerHTML=`<div class="rif-reveal-winner-number">🏆 Número sorteado: ${raffle.winner_number}</div>`;
    },{once:true});
  }
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
