// ================================================================
// MyDeck — Sistema de Leilão (leilao.js) — v2
// Criado 12/08/2026, revisado no mesmo dia com base no fluxo real de
// leilão do Eduardo (grupo "JOTA COLEÇÕES" no WhatsApp): leilões em
// RODADAS semanais, carrinho único por comprador por rodada, prazo de
// pagamento separado do fechamento do lance, e bloqueio silencioso de
// quem fica inadimplente (sem exposição pública — decisão consciente
// de não replicar essa parte do grupo).
//
// FASE DE TESTES: a aba "🔨 Leilão" só fica visível pro admin
// principal (Eduardo) e pra quem estiver autorizado como leiloeiro em
// auction_admins (ver painel "👥 Leiloeiros Autorizados", só o Eduardo
// vê/mexe nesse painel). Pra abrir a aba pra todo mundo dar lance,
// trocar a condição em updateLeilaoTabVisibility() — ver comentário lá.
//
// SEGURANÇA — nada disso é feito por INSERT/UPDATE direto do client:
//   • place_bid()   → valida lance (login, prazo, incremento, bloqueio
//                      de inadimplência) e aplica extensão anti-sniping.
//   • close_round() → fecha os leilões vencidos de uma rodada e
//                      consolida os arremates de cada comprador em UM
//                      pedido (carrinho).
//   • add_auction_admin()/remove_auction_admin() → só o admin
//                      principal (checado no banco, não só no client).
// Tudo roda no banco (security definer) — ver leilao_setup.sql.
//
// Carregado depois de app.js, lojas.js e marketplace.js — reaproveita
// sbClient, currentUser, uid(), isAdmin(), esc(), fmtR(), setStatus(),
// getAllCatalogCards(), getBinderImg() já definidos lá.
// ================================================================

let aucIsLeilaoAdmin=false;  // eu sou leiloeiro (admin principal OU autorizado)?
let aucRounds=[];
let aucAuctions=[];
let aucMyOrders=[];
let aucMyOrderItems=[];
let aucAdminOrders=[];
let aucAdminOrderItems=[];
let aucAddress=null;
let aucBlocked=false;
let aucBlockedReason='';
let aucSelectedCard=null;
let aucLeiloeiros=[];
let aucLeiloeiroNames={}; // {user_id: nome de exibição} — todo participante vê, ver loadLeiloeiroNames()
let aucAutoNavigated=false; // evita reabrir a aba toda vez que o hook de login roda
let aucRulesAccepted=null;  // null=ainda não checou · true/false depois de loadRulesAcceptance()
let aucPendingBid=null;     // {auctionId,idSuffix} — lance que ficou esperando o aceite das regras
const AUC_RULES_VERSION='v1'; // precisa bater com a checada em place_bid() no banco (leilao_setup.sql)

// ── SOU LEILOEIRO? (admin principal OU autorizado em auction_admins) ─
async function resolveLeilaoAdminStatus(){
  if(!uid()){aucIsLeilaoAdmin=false;return;}
  // ADMIN VIEWER 14/08/2026: isAdmin() sozinho não basta mais aqui — inclui
  // o admin só-leitura (adnresollecito@gmail.com), que NÃO deve virar
  // leiloeiro (cadastrar carta, fechar rodada, marcar pagamento = editar).
  // Só isAdminEditor() (Eduardo) ganha o papel automaticamente; qualquer
  // outra pessoa (inclusive o admin viewer) só vira leiloeiro se for
  // explicitamente autorizada em auction_admins (is_auction_admin() abaixo).
  if(typeof isAdminEditor==='function'&&isAdminEditor()){aucIsLeilaoAdmin=true;return;}
  try{
    const{data,error}=await sbClient.rpc('is_auction_admin');
    aucIsLeilaoAdmin=!error&&!!data;
  }catch(e){console.error('[leilao] is_auction_admin',e);aucIsLeilaoAdmin=false;}
}

// ── VISIBILIDADE DA ABA ────────────────────────────────────────────
async function updateLeilaoTabVisibility(){
  const btn=document.getElementById('nav-tab-leilao');
  if(!btn)return;
  await resolveLeilaoAdminStatus();
  // ABERTO 12/08/2026: qualquer usuário logado no MyDeck vê a aba e pode
  // dar lance — necessário pro botão "Compartilhar" (link direto pro
  // leilão, divulgado no WhatsApp) funcionar pra quem recebe o link.
  // O painel do leiloeiro (cadastrar carta, fechar rodada, marcar
  // pagamento) continua restrito a aucIsLeilaoAdmin — ver renderLeilaoTab().
  const show=!!uid();
  btn.style.display=show?'':'none';
  // ESPELHO 12/08/2026: mesmo toggle no item do menu desktop novo (dentro
  // de "COMPRA E VENDA E LEILÃO"), senão ele nunca aparece lá.
  const deskBtn=document.getElementById('desk-tab-leilao');
  if(deskBtn)deskBtn.style.display=show?'':'none';
  if(!show){
    const pane=document.getElementById('leilao');
    if(pane&&pane.classList.contains('active')&&typeof goToTab==='function')goToTab('dash');
  }else if(!aucAutoNavigated&&typeof goToTab==='function'&&(new URLSearchParams(window.location.search).get('leilao')||new URLSearchParams(window.location.search).get('leilao_rodada'))){
    // Chegou por um link compartilhado (?leilao=<id> ou ?leilao_rodada=<id>)
    // — abre a aba direto, sem precisar clicar no menu.
    aucAutoNavigated=true;
    goToTab('leilao');
  }
}
(function hookLeilaoTabVisibility(){
  function tryHook(){
    if(typeof window._updateUserChip!=='function'){setTimeout(tryHook,50);return;}
    const original=window._updateUserChip;
    window._updateUserChip=function(user){original(user);updateLeilaoTabVisibility();};
    updateLeilaoTabVisibility();
  }
  tryHook();
})();

// ── CARREGAR TUDO ───────────────────────────────────────────────
async function renderLeilaoTab(){
  await resolveLeilaoAdminStatus();
  const subnav=document.getElementById('leilao-subnav');
  if(subnav)subnav.style.display=aucIsLeilaoAdmin?'flex':'none';
  const superWrap=document.getElementById('leilao-super-admin-wrap');
  if(superWrap)superWrap.style.display=(typeof isAdminEditor==='function'&&isAdminEditor())?'':'none';
  // Quem não é leiloeiro sempre fica na sub-aba "Leilões" (as outras nem
  // aparecem no menu pra ele); leiloeiro mantém a última sub-aba escolhida.
  switchLeilaoSubtab(aucIsLeilaoAdmin?(aucActiveSubtab||'leiloes'):'leiloes');

  await loadRoundsAndAuctions();
  await loadLeiloeiroNames();
  await loadMyAuctionOrders();
  renderRoundSelect();
  renderAuctionsList();
  renderMyBidsAndOrders();
  scrollToSharedAuction();
  scrollToSharedRound();

  if(aucIsLeilaoAdmin){
    renderRoundsAdminList();
    await loadAdminAuctionOrders();
    renderAdminOrders();
    renderLeilaoAnalises();
    renderLeilaoArquivo();
  }
  if(typeof isAdminEditor==='function'&&isAdminEditor()){
    await loadLeiloeiros();
    renderLeiloeirosList();
  }
}

// ── SUB-MENU (Leilões / Cadastro / Análises / Arquivo — as 3 últimas só leiloeiro) ─
let aucActiveSubtab='leiloes';
function switchLeilaoSubtab(name){
  aucActiveSubtab=name;
  ['leiloes','cadastro','analises','arquivo'].forEach(n=>{
    const pane=document.getElementById('leilao-sub-'+n);
    if(pane)pane.style.display=(n===name)?'':'none';
    const btn=document.querySelector(`.leilao-subtab-btn[data-sub="${n}"]`);
    if(btn){
      if(n===name){btn.style.background='';btn.style.color='';btn.style.border='';}
      else{btn.style.background='transparent';btn.style.color='var(--text)';btn.style.border='1px solid var(--border)';}
    }
  });
}

// ── ANÁLISES (KPIs simples pro leiloeiro) ─────────────────────────
function renderLeilaoAnalises(){
  const wrap=document.getElementById('leilao-analises-kpis');
  if(!wrap)return;
  const ativos=aucAuctions.filter(a=>a.status==='ativo').length;
  const arrematados=aucAuctions.filter(a=>a.status==='encerrado'&&a.winner_id);
  const totalArrecadado=arrematados.reduce((s,a)=>s+ +a.winning_bid,0);
  const pendentes=aucAdminOrders.filter(o=>o.status==='aguardando_pagamento');
  const vencidos=pendentes.filter(o=>aucIsOverdue(o));
  const totalPendente=pendentes.reduce((s,o)=>s+ +o.amount,0);
  const kpi=(label,value,color)=>`<div class="panel" style="padding:16px">
    <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${color||'var(--text)'}">${value}</div>
  </div>`;
  wrap.innerHTML=
    kpi('LEILÕES ATIVOS',ativos)+
    kpi('CARTAS ARREMATADAS',arrematados.length)+
    kpi('TOTAL ARRECADADO',`R$ ${fmtR(totalArrecadado)}`,'var(--teal)')+
    kpi('PAGAMENTOS PENDENTES',`${pendentes.length} · R$ ${fmtR(totalPendente)}`,'var(--gold)')+
    kpi('PAGAMENTOS VENCIDOS',vencidos.length,vencidos.length?'var(--accent)':'var(--text)');
  renderLeilaoComissao();
}

// ── COMISSÃO MYDECK (mesmos termos combinados com o leiloeiro, baseados
// na tabela de comissão decrescente da MYP Cards): 7% padrão em cima da
// soma de pedidos PAGOS no mês, caindo por faixa conforme essa soma
// mensal sobe — 6% a partir de R$10k, 5% a partir de R$20k, 4% a partir
// de R$30k, 3% a partir de R$40k, 2,5% a partir de R$50k, 2% a partir de
// R$60k, 1,5% a partir de R$70k, 1% a partir de R$80k. Aplicado por
// FAIXA (progressivo, como imposto por tramo) sobre o total pago no mês
// — não retroage sobre pedidos já pagos em meses anteriores.
const AUC_COMMISSION_TIERS=[
  {upTo:10000, rate:0.07},
  {upTo:20000, rate:0.06},
  {upTo:30000, rate:0.05},
  {upTo:40000, rate:0.04},
  {upTo:50000, rate:0.03},
  {upTo:60000, rate:0.025},
  {upTo:70000, rate:0.02},
  {upTo:80000, rate:0.015},
  {upTo:Infinity, rate:0.01}
];

function aucCommissionBreakdown(total){
  let remaining=total, prevLimit=0, commission=0;
  const rows=[];
  for(const tier of AUC_COMMISSION_TIERS){
    if(remaining<=0)break;
    const tierSize=tier.upTo-prevLimit;
    const amountInTier=Math.min(remaining,tierSize);
    if(amountInTier>0){
      const tierCommission=amountInTier*tier.rate;
      commission+=tierCommission;
      rows.push({from:prevLimit,to:tier.upTo,rate:tier.rate,amount:amountInTier,commission:tierCommission});
    }
    remaining-=amountInTier;
    prevLimit=tier.upTo;
  }
  return{commission,rows,effectiveRate:total>0?commission/total:AUC_COMMISSION_TIERS[0].rate};
}

function renderLeilaoComissao(){
  const wrap=document.getElementById('leilao-analises-comissao');
  if(!wrap)return;
  const now=new Date();
  const inicioMes=new Date(now.getFullYear(),now.getMonth(),1);
  // "Pagos" = todo pedido que já teve o PIX confirmado (pago/enviado/concluído),
  // no mês corrente, com base em paid_at — mesma lógica de "soma de pedidos
  // pagos" que a MYP usa pra escalonar a comissão.
  const pagosMes=aucAdminOrders.filter(o=>
    ['pago','enviado','concluido'].includes(o.status)&&o.paid_at&&new Date(o.paid_at)>=inicioMes
  );
  const totalMes=pagosMes.reduce((s,o)=>s+ +o.amount,0);
  const{commission,rows,effectiveRate}=aucCommissionBreakdown(totalMes);
  const liquido=totalMes-commission;
  const mesLabel=now.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

  const kpi=(label,value,color)=>`<div class="panel" style="padding:16px">
    <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${color||'var(--text)'}">${value}</div>
  </div>`;

  const tabelaFaixas=rows.length?`<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:11px">
    <thead><tr style="text-align:left;color:var(--muted);font-family:'Space Mono',monospace;font-size:9px">
      <th style="padding:4px 6px">FAIXA</th><th style="padding:4px 6px">TAXA</th>
      <th style="padding:4px 6px;text-align:right">VALOR NA FAIXA</th><th style="padding:4px 6px;text-align:right">COMISSÃO</th>
    </tr></thead>
    <tbody>
      ${rows.map(r=>`<tr style="border-top:1px solid var(--border)">
        <td style="padding:4px 6px">R$ ${fmtR(r.from)} – ${r.to===Infinity?'∞':'R$ '+fmtR(r.to)}</td>
        <td style="padding:4px 6px">${(r.rate*100).toFixed(1).replace('.0','')}%</td>
        <td style="padding:4px 6px;text-align:right">R$ ${fmtR(r.amount)}</td>
        <td style="padding:4px 6px;text-align:right;color:var(--accent)">R$ ${fmtR(r.commission)}</td>
      </tr>`).join('')}
    </tbody>
  </table>`:`<div class="cv-item-empty">Nenhum pedido pago ainda em ${esc(mesLabel)}.</div>`;

  wrap.innerHTML=`<div class="kpi-grid" style="margin-bottom:10px">
      ${kpi('PAGO NO MÊS ('+mesLabel.toUpperCase()+')',`R$ ${fmtR(totalMes)}`,'var(--teal)')}
      ${kpi('TAXA EFETIVA VIGENTE',`${(effectiveRate*100).toFixed(2)}%`)}
      ${kpi('COMISSÃO MYDECK',`R$ ${fmtR(commission)}`,'var(--accent)')}
      ${kpi('LÍQUIDO P/ LEILOEIRO',`R$ ${fmtR(liquido)}`,'var(--gold)')}
    </div>
    <div class="panel" style="padding:14px">
      <div style="font-size:10.5px;color:var(--muted);margin-bottom:4px">
        Comissão decrescente por faixa de soma de pedidos pagos no mês (mesmos termos combinados com o leiloeiro):
        7% até R$10k · 6% até R$20k · 5% até R$30k · 4% até R$40k · 3% até R$50k · 2,5% até R$60k · 2% até R$70k · 1,5% até R$80k · 1% acima de R$80k.
      </div>
      ${tabelaFaixas}
    </div>`;
}

// ── ARQUIVO (rodadas encerradas — quem deu lance, quem ganhou, opção
// de arquivar/desarquivar) ────────────────────────────────────────
// Arquivar é reversível e não apaga nada — só marca auction_rounds.
// archived=true (RLS já restringe update a is_auction_admin(), igual
// cancelAuctionRound), o que tira a rodada da lista pública "Leilões"
// (renderAuctionsList) e da lista de gestão em "Cadastro"
// (renderRoundsAdminList) sem perder o histórico.
function renderLeilaoArquivo(){
  const wrap=document.getElementById('leilao-arquivo-list');
  if(!wrap)return;
  const rounds=aucRounds
    .filter(r=>r.status==='encerrado'||r.status==='cancelado')
    .sort((a,b)=>new Date(b.end_at)-new Date(a.end_at));
  if(!rounds.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhuma rodada encerrada ainda.</div>`;return;}
  wrap.innerHTML=rounds.map(r=>{
    const cards=aucAuctions.filter(a=>a.round_id===r.id);
    return`<div class="panel" style="margin-bottom:14px${r.archived?';opacity:.6':''}">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
        <b style="font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:.5px">🗓️ ${esc(r.title)}</b>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${r.status==='cancelado'?`<span style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">cancelada</span>`:''}
          ${r.archived
            ?`<span style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">📦 arquivada${r.archived_at?' em '+new Date(r.archived_at).toLocaleDateString('pt-BR'):''}</span>
              <button class="cv-item-remove" onclick="unarchiveAuctionRound(${r.id})">Desarquivar</button>`
            :`<button class="btn-add" onclick="archiveAuctionRound(${r.id})">📦 Arquivar</button>`}
          <button class="cv-item-remove" onclick="deleteAuctionRound(${r.id})">🗑️ Excluir</button>
        </div>
      </div>
      <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace;margin:6px 0">
        Encerrada em ${new Date(r.end_at).toLocaleString('pt-BR')} · ${cards.length} carta(s)
      </div>
      ${cards.length?cards.map(a=>aucArchiveCardHtml(a)).join(''):'<div class="cv-item-empty">Nenhuma carta nesta rodada.</div>'}
    </div>`;
  }).join('');
}

function aucArchiveCardHtml(a){
  const item=aucAdminOrderItems.find(it=>it.auction_id===a.id);
  const order=item?aucAdminOrders.find(o=>o.id===item.order_id):null;
  const img=aucImgFor(a);
  return`<div style="display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--border);flex-wrap:wrap;align-items:center">
    ${img?`<img src="${img}" style="width:44px;border-radius:6px;object-fit:contain;background:var(--surface2)">`:''}
    <div style="flex:1;min-width:200px">
      <b style="font-size:12.5px">${esc(a.card_name)}</b>
      <div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">
        ${a.winner_id?`Vencedor: ${esc(order?.buyer_email||'—')} · R$ ${fmtR(a.winning_bid)}`:'Sem vencedor'} · ${a.bid_count||0} lance(s)
        ${order?` · <span style="color:${aucOrderStatusColor(order.status)}">${AUC_ORDER_LBL[order.status]||order.status}</span>`:''}
      </div>
    </div>
    ${a.bid_count?`<button class="cv-item-remove" onclick="toggleAuctionBidLogAdmin(${a.id})">📜 Ver lances</button>`:''}
    <div id="auc-arquivo-log-${a.id}" style="display:none;width:100%;padding-left:54px;margin-top:2px"></div>
  </div>`;
}

// Log completo (e-mail de verdade, não só iniciais) — só o leiloeiro
// consegue chamar essa RPC (auction_bid_log_admin checa is_auction_admin()
// no banco). Diferente do log público (auction_bid_log), que só mostra
// iniciais pra qualquer participante.
async function toggleAuctionBidLogAdmin(auctionId){
  const box=document.getElementById(`auc-arquivo-log-${auctionId}`);
  if(!box)return;
  if(box.style.display==='none'){
    box.style.display='block';
    if(box.dataset.loaded)return;
    box.innerHTML=`<div style="font-size:10.5px;color:var(--muted)">Carregando…</div>`;
    const{data,error}=await sbClient.rpc('auction_bid_log_admin',{p_auction_id:auctionId});
    if(error){
      console.error('[leilao] auction_bid_log_admin',error);
      box.innerHTML=`<div style="font-size:10.5px;color:var(--muted)">Não deu pra carregar — rodou leilao_setup.sql atualizado?</div>`;
      return;
    }
    const bids=Array.isArray(data)?data:[];
    box.innerHTML=bids.length?bids.map(b=>`<div style="display:flex;justify-content:space-between;gap:10px;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border)">
      <span>${esc(b.email||'—')}</span>
      <span style="color:var(--teal);white-space:nowrap">R$ ${fmtR(b.amount)} · ${new Date(b.created_at).toLocaleString('pt-BR')}</span>
    </div>`).join(''):`<div style="font-size:10.5px;color:var(--muted)">Nenhum lance registrado.</div>`;
    box.dataset.loaded='1';
  }else{
    box.style.display='none';
  }
}

async function archiveAuctionRound(roundId){
  if(!aucIsLeilaoAdmin)return;
  const{error}=await sbClient.from('auction_rounds').update({archived:true,archived_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',roundId);
  if(error){console.error('[leilao] archiveAuctionRound',error);setStatus('Erro ao arquivar rodada. Verifique se rodou leilao_setup.sql atualizado.','err');return;}
  setStatus('Rodada arquivada','ok');
  await loadRoundsAndAuctions();
  renderAuctionsList();renderRoundsAdminList();renderLeilaoArquivo();
}

async function unarchiveAuctionRound(roundId){
  if(!aucIsLeilaoAdmin)return;
  const{error}=await sbClient.from('auction_rounds').update({archived:false,archived_at:null,updated_at:new Date().toISOString()}).eq('id',roundId);
  if(error){console.error('[leilao] unarchiveAuctionRound',error);setStatus('Erro ao desarquivar rodada','err');return;}
  setStatus('Rodada desarquivada','ok');
  await loadRoundsAndAuctions();
  renderAuctionsList();renderRoundsAdminList();renderLeilaoArquivo();
}

async function loadRoundsAndAuctions(){
  if(!uid())return;
  try{
    await sbClient.rpc('activate_scheduled_auctions');
    await sbClient.rpc('close_all_expired_rounds');
    await sbClient.rpc('flag_overdue_bidders');
  }catch(e){console.error('[leilao] manutenção lazy',e);}

  const[{data:rounds,error:e1},{data:auctions,error:e2}]=await Promise.all([
    sbClient.from('auction_rounds').select('*').order('start_at',{ascending:false}),
    sbClient.from('auctions').select('*').order('end_at',{ascending:true})
  ]);
  if(e1)console.error('[leilao] load rounds',e1);
  if(e2)console.error('[leilao] load auctions',e2);
  aucRounds=Array.isArray(rounds)?rounds:[];
  aucAuctions=Array.isArray(auctions)?auctions:[];
}

async function loadMyAuctionOrders(){
  if(!uid())return;
  const[{data:orders},{data:addr},{data:flag},{data:rules}]=await Promise.all([
    sbClient.from('auction_orders').select('*').eq('buyer_id',uid()).order('created_at',{ascending:false}),
    sbClient.from('user_addresses').select('*').eq('user_id',uid()).maybeSingle(),
    sbClient.from('auction_bidder_flags').select('*').eq('user_id',uid()).maybeSingle(),
    sbClient.from('auction_rules_acceptance').select('*').eq('user_id',uid()).maybeSingle()
  ]);
  aucMyOrders=Array.isArray(orders)?orders:[];
  aucAddress=addr||null;
  aucBlocked=!!flag?.blocked;
  aucBlockedReason=flag?.reason||'';
  aucRulesAccepted=rules?.rules_version===AUC_RULES_VERSION;
  if(aucMyOrders.length){
    const{data:items}=await sbClient.from('auction_order_items').select('*, auctions(card_name,image_url)').in('order_id',aucMyOrders.map(o=>o.id));
    aucMyOrderItems=Array.isArray(items)?items:[];
  }else aucMyOrderItems=[];
}

async function loadAdminAuctionOrders(){
  const{data:orders,error}=await sbClient.from('auction_orders').select('*').order('created_at',{ascending:false});
  if(error){console.error('[leilao] admin orders',error);aucAdminOrders=[];aucAdminOrderItems=[];return;}
  aucAdminOrders=Array.isArray(orders)?orders:[];
  if(aucAdminOrders.length){
    const{data:items}=await sbClient.from('auction_order_items').select('*, auctions(card_name,image_url)').in('order_id',aucAdminOrders.map(o=>o.id));
    aucAdminOrderItems=Array.isArray(items)?items:[];
  }else aucAdminOrderItems=[];
}

async function loadLeiloeiros(){
  const{data,error}=await sbClient.from('auction_admins').select('*').order('created_at',{ascending:false});
  if(error){console.error('[leilao] load leiloeiros',error);aucLeiloeiros=[];return;}
  aucLeiloeiros=Array.isArray(data)?data:[];
}

// Nomes de exibição dos leiloeiros (uid → nome) — diferente de
// loadLeiloeiros() acima (que só o admin principal consegue ler, por
// RLS, e traz e-mail junto), essa é a versão pública/resumida: todo
// participante logado chama pra saber "Leiloeiro: Fulano" nas cartas e
// nas mensagens de compartilhamento, sem expor e-mail de ninguém.
async function loadLeiloeiroNames(){
  const{data,error}=await sbClient.rpc('auction_leiloeiro_names');
  if(error){console.error('[leilao] loadLeiloeiroNames',error);aucLeiloeiroNames={};return;}
  aucLeiloeiroNames={};
  (Array.isArray(data)?data:[]).forEach(r=>{aucLeiloeiroNames[r.user_id]=r.display_name;});
}
function aucLeiloeiroNome(uid){return aucLeiloeiroNames[uid]||'o leiloeiro';}

// ── HELPERS ─────────────────────────────────────────────────────
function aucRoundById(id){return aucRounds.find(r=>r.id===id);}

function aucStatusLabel(a){
  const now=new Date();
  if(a.status==='cancelado')return{txt:'Cancelado',color:'var(--muted)'};
  if(a.status==='agendado')return{txt:'Agendado',color:'var(--gold)'};
  if(a.status==='encerrado')return a.winner_id?{txt:'Arrematado',color:'var(--teal)'}:{txt:'Encerrado sem vencedor',color:'var(--muted)'};
  if(a.status==='ativo'){
    if(new Date(a.end_at)<now)return{txt:'Fechando…',color:'var(--gold)'};
    return{txt:'Em andamento',color:'var(--accent)'};
  }
  return{txt:a.status,color:'var(--muted)'};
}

function aucCountdown(endAt){
  const diff=new Date(endAt)-new Date();
  if(diff<=0)return'encerrando…';
  const mins=Math.floor(diff/60000);
  const d=Math.floor(mins/1440),h=Math.floor((mins%1440)/60),m=mins%60;
  if(d>0)return`${d}d ${h}h restantes`;
  if(h>0)return`${h}h ${m}min restantes`;
  return`${m}min restantes`;
}

// Incremento mínimo por faixa (regra do leiloeiro, 12/08/2026): até R$10 →
// R$0,50 · até R$50 → R$1,00 · acima de R$50 → 2% do valor atual. Espelha
// auction_min_increment() do banco (leilao_setup.sql) — só pra mostrar o
// mínimo certo no placeholder; quem valida de verdade é sempre o RPC.
function aucMinIncrement(base){
  if(base<=10)return 0.5;
  if(base<=50)return 1;
  return Math.round(base*0.02*100)/100;
}
function aucMinNext(a){return a.current_bid?(+a.current_bid+aucMinIncrement(+a.current_bid)):+a.starting_price;}
// "Lance com folga" — um passo de incremento ACIMA do mínimo, pra quem
// quer dar um lance de segurança sem precisar digitar/calcular nada.
function aucMinPlus(a){const min=aucMinNext(a);return Math.round((min+aucMinIncrement(min))*100)/100;}

function aucImgFor(a){
  if(a.image_url)return a.image_url;
  if(!a.set_id||!a.card_n)return null;
  const all=typeof getAllCatalogCards==='function'?getAllCatalogCards():[];
  const c=all.find(cc=>cc._setId===a.set_id&&cc.n===a.card_n);
  return c&&typeof getBinderImg==='function'?getBinderImg(c,a.set_id):null;
}

const AUC_COND_LBL={M:'Mint',NM:'Quase Nova (NM)',MP:'Levemente Jogada (MP)',D:'Danificada (D)'};
const AUC_LANG_LBL={'pt-BR':'🇧🇷 Português','en':'🇺🇸 Inglês','ja':'🇯🇵 Japonês'};
const AUC_ORDER_LBL={aguardando_pagamento:'Aguardando pagamento',pago:'Pago',enviado:'Enviado',concluido:'Concluído',cancelado:'Cancelado'};
function aucOrderStatusColor(s){
  return{aguardando_pagamento:'var(--gold)',pago:'var(--teal)',enviado:'var(--teal)',concluido:'var(--teal)',cancelado:'var(--muted)'}[s]||'var(--muted)';
}
function aucIsOverdue(o){return o.status==='aguardando_pagamento'&&o.payment_due_at&&new Date(o.payment_due_at)<new Date();}

// ── LISTA PÚBLICA DE LEILÕES (agrupada por rodada) ─────────────
function renderAuctionsList(){
  const wrap=document.getElementById('leilao-list');
  if(!wrap)return;
  const visibleRounds=aucRounds.filter(r=>r.status!=='cancelado'&&!r.archived&&aucAuctions.some(a=>a.round_id===r.id&&a.status!=='cancelado'));
  if(!visibleRounds.length){
    wrap.innerHTML=`<div class="cv-item-empty">Nenhum leilão no momento.</div>`;
    return;
  }
  wrap.innerHTML=(aucBlocked?`<div class="mkt-note" style="border-color:var(--accent);color:var(--accent)">
      🚫 Você está temporariamente bloqueado de dar lances: ${esc(aucBlockedReason||'pagamento pendente de uma rodada anterior')}. Fale com o leiloeiro pra liberar.
    </div>`:'')+
  visibleRounds.map(r=>{
    const cards=aucAuctions.filter(a=>a.round_id===r.id&&a.status!=='cancelado');
    return`<div id="leilao-round-sec-${r.id}" class="sec-title" style="margin-top:20px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
      <span>🗓️ ${esc(r.title)}
        <span style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;font-weight:400;margin-left:8px">
          Lances até ${new Date(r.end_at).toLocaleString('pt-BR')} · Pagamento até ${new Date(r.payment_due_at).toLocaleString('pt-BR')}
        </span>
      </span>
      ${aucIsLeilaoAdmin?`<button class="cv-item-remove" style="color:var(--teal);border-color:var(--teal);font-size:10px" onclick="shareRoundText(${r.id})">📤 Compartilhar rodada</button>`:''}
      </div>
      ${r.shipping_note?`<div class="mkt-note" style="margin-bottom:14px">🚚 ${esc(r.shipping_note)}</div>`:''}
      ${cards.map(a=>aucCardHtml(a)).join('')}`;
  }).join('');
  refreshOpenAuctionZoom();
}

// idSuffix diferencia os ids de input/status quando a MESMA carta aparece
// duas vezes na tela ao mesmo tempo (card na lista + zoom aberto) — sem
// isso os dois formulários de lance colidiriam no mesmo id.
function aucInfoBlockHtml(a,idSuffix){
  idSuffix=idSuffix||'';
  const st=aucStatusLabel(a);
  const isActive=a.status==='ativo'&&new Date(a.end_at)>new Date();
  const isOwnAuction=a.created_by===uid();
  const iAmWinning=a.current_bidder===uid();
  return`<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
      <b style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.5px">${esc(a.card_name)}</b>
      <span style="font-size:10px;font-family:'Space Mono',monospace;color:${st.color};border:1px solid ${st.color};border-radius:20px;padding:2px 10px">${st.txt}</span>
    </div>
    <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace;margin:4px 0">
      ${AUC_COND_LBL[a.condition]||a.condition} · ${AUC_LANG_LBL[a.language]||a.language}
      ${a.set_id?` · ${esc(a.set_id.toUpperCase())} #${esc(a.card_n||'')}`:''}
      · Leiloeiro: ${esc(aucLeiloeiroNome(a.created_by))}
    </div>
    ${a.description?`<div style="font-size:11px;color:var(--text);margin-bottom:6px">${esc(a.description)}</div>`:''}
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px">
      <div><div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">LANCE ATUAL</div>
        <div style="font-size:17px;font-weight:700;color:var(--teal)">R$ ${fmtR(a.current_bid||a.starting_price)}</div></div>
      <div><div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">LANCES</div>
        <div style="font-size:17px;font-weight:700">${a.bid_count||0}</div></div>
      ${isActive?`<div><div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">PRAZO</div>
        <div style="font-size:13px;font-weight:600;color:var(--gold)">${aucCountdown(a.end_at)}</div></div>`:''}
    </div>
    ${iAmWinning&&isActive?`<div style="font-size:10.5px;color:var(--teal);margin-top:6px">✓ Você está na frente</div>`:''}
    ${isActive&&!isOwnAuction&&!aucBlocked?`
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">
        <button class="btn-add" onclick="quickBid(${a.id},'${idSuffix}','min')">⚡ R$ ${fmtR(aucMinNext(a))} <span style="opacity:.75;font-weight:400">(mínimo)</span></button>
        <button class="btn-add" onclick="quickBid(${a.id},'${idSuffix}','plus')">⚡ R$ ${fmtR(aucMinPlus(a))} <span style="opacity:.75;font-weight:400">(com folga)</span></button>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center">
        <input type="number" id="auc-bid-${a.id}${idSuffix}" placeholder="Outro valor" step="0.01" style="width:150px" class="cv-select">
        <button class="cv-item-remove" onclick="submitBid(${a.id},'${idSuffix}')">Dar esse lance</button>
      </div>
      <div style="font-size:9.5px;color:var(--muted);margin-top:4px">Lance é compromisso — não dá pra retirar depois de enviado.</div>
      <div id="auc-bid-status-${a.id}${idSuffix}" style="font-size:10px;color:var(--accent);margin-top:4px;font-family:'Space Mono',monospace"></div>`:''}
    ${a.status==='agendado'?`<div style="font-size:10.5px;color:var(--muted);margin-top:6px">Começa em ${new Date(a.start_at).toLocaleString('pt-BR')}</div>`:''}
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="cv-item-remove" style="color:var(--teal);border-color:var(--teal)" onclick="shareAuctionPdf(${a.id})">📄 PDF (foto + texto)</button>
      <button class="cv-item-remove" style="color:var(--teal);border-color:var(--teal)" onclick="shareAuctionText(${a.id})">💬 Só texto</button>
      ${aucIsLeilaoAdmin?`<button class="cv-item-remove" onclick="deleteAuction(${a.id})">🗑️ Excluir leilão</button>`:''}
    </div>`;
}

function aucCardHtml(a){
  const img=aucImgFor(a);
  return`<div class="panel" style="margin-bottom:14px">
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      ${img?`<img src="${img}" alt="${esc(a.card_name)}" title="Clique pra ampliar" style="width:100px;border-radius:8px;object-fit:contain;background:var(--surface2);cursor:zoom-in" onclick="openAuctionZoom(${a.id})" onerror="this.style.display='none'">`:''}
      <div style="flex:1;min-width:220px">
        ${aucInfoBlockHtml(a,'')}
      </div>
    </div>
  </div>`;
}

// ── ZOOM (clicar na foto abre a carta ampliada no meio da tela) ──
let aucZoomAuctionId=null;

function openAuctionZoom(auctionId){
  const a=aucAuctions.find(x=>x.id===auctionId);
  if(!a)return;
  aucZoomAuctionId=auctionId;
  renderAuctionZoomContent(a);
  if(typeof openModal==='function')openModal('leilao-zoom-ov');
}

function renderAuctionZoomContent(a){
  const box=document.getElementById('leilao-zoom-content');
  if(!box)return;
  const img=aucImgFor(a);
  box.innerHTML=`<div style="display:flex;flex-wrap:wrap">
    <div style="flex:1;min-width:240px;background:var(--surface2);display:flex;align-items:center;justify-content:center;padding:24px">
      ${img?`<img src="${img}" alt="${esc(a.card_name)}" style="max-width:100%;max-height:60vh;object-fit:contain;border-radius:10px" onerror="this.style.display='none'">`
        :`<div style="font-size:60px">🃏</div>`}
    </div>
    <div style="flex:1;min-width:260px;padding:24px">
      ${aucInfoBlockHtml(a,'-zoom')}
      <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:8px">📜 HISTÓRICO DE LANCES</div>
        <div id="leilao-zoom-bidlog" style="max-height:180px;overflow-y:auto"></div>
      </div>
    </div>
  </div>`;
  renderAuctionBidLog(a.id,'leilao-zoom-bidlog');
}

// Log público de lances, só com iniciais (ex: "E.C.A em 12/08/2026, R$1,50")
// — nunca o nome completo, e-mail ou uid de quem deu o lance. Calculado no
// banco (auction_bid_log/auction_bidder_initials, leilao_setup.sql), não
// dá pra pedir a identidade completa nem mexendo no client.
async function renderAuctionBidLog(auctionId,containerId){
  const box=document.getElementById(containerId);
  if(!box)return;
  box.innerHTML=`<div style="font-size:10.5px;color:var(--muted)">Carregando…</div>`;
  const{data,error}=await sbClient.rpc('auction_bid_log',{p_auction_id:auctionId});
  if(error){
    console.error('[leilao] auction_bid_log',error);
    box.innerHTML=`<div style="font-size:10.5px;color:var(--muted)">Não deu pra carregar o histórico.</div>`;
    return;
  }
  const bids=Array.isArray(data)?data:[];
  if(!bids.length){
    box.innerHTML=`<div style="font-size:10.5px;color:var(--muted)">Nenhum lance ainda — seja o primeiro.</div>`;
    return;
  }
  box.innerHTML=bids.map(b=>{
    const d=new Date(b.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    return`<div style="display:flex;justify-content:space-between;gap:10px;font-size:11px;padding:5px 0;border-bottom:1px solid var(--border)">
      <span><b>${esc(b.initials)}</b> em ${d}</span>
      <span style="color:var(--teal);font-weight:700;white-space:nowrap">R$ ${fmtR(b.amount)}</span>
    </div>`;
  }).join('');
}

// Se o zoom estiver aberto quando a lista atualizar (ex: alguém deu lance,
// ou o próprio timer de fechamento passou), reflete o valor novo sem
// precisar fechar e reabrir o modal.
function refreshOpenAuctionZoom(){
  if(aucZoomAuctionId==null)return;
  const ov=document.getElementById('leilao-zoom-ov');
  if(!ov||!ov.classList.contains('open')){aucZoomAuctionId=null;return;}
  const a=aucAuctions.find(x=>x.id===aucZoomAuctionId);
  if(a)renderAuctionZoomContent(a);
}

// ── COMPARTILHAR (link direto + mensagem pronta pro WhatsApp) ────
function aucShareUrl(auctionId){
  const base=window.location.origin+window.location.pathname;
  return`${base}?leilao=${auctionId}`;
}

// Link de uma RODADA inteira (não uma carta só) — abre a aba de leilão
// e desce a tela direto pro bloco daquela rodada (ver scrollToSharedRound).
function aucRoundShareUrl(roundId){
  const base=window.location.origin+window.location.pathname;
  return`${base}?leilao_rodada=${roundId}`;
}

// Baixa a imagem da carta como blob, pra poder ir junto no compartilhamento
// nativo (celular) ou ser copiada pro clipboard (desktop). Pode falhar se o
// CDN da imagem (scrydex/tcgdex) não liberar CORS pro fetch — nesse caso
// cai de volta pro compartilhamento só com texto, sem travar nada.
async function aucFetchImageBlob(url){
  if(!url)return null;
  try{
    const resp=await fetch(url,{mode:'cors'});
    if(!resp.ok)return null;
    return await resp.blob();
  }catch(e){
    console.warn('[leilao] não deu pra baixar a imagem pra compartilhar (CORS do CDN?)',e);
    return null;
  }
}

// Clipboard.write() só aceita alguns tipos de imagem em navegadores mais
// antigos/Firefox — reconverte pra PNG via canvas quando precisar. Como o
// blob já foi baixado pelo fetch acima, o object URL é local (mesma
// origem), então o canvas não fica "contaminado" mesmo se o CDN original
// bloqueasse CORS pra <img> direto.
function aucBlobToPng(blob){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');
      canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      canvas.getContext('2d').drawImage(img,0,0);
      canvas.toBlob(b=>b?resolve(b):reject(new Error('canvas.toBlob falhou')),'image/png');
      URL.revokeObjectURL(img.src);
    };
    img.onerror=reject;
    img.src=URL.createObjectURL(blob);
  });
}

// Nome de exibição da coleção a partir do CB_SET_LABELS (app.js) — ex:
// "me04" → "Caos Ascendente". Cai pro código do set se não achar.
function aucColecaoNome(setId){
  if(!setId)return'';
  const full=typeof CB_SET_LABELS==='object'&&CB_SET_LABELS?CB_SET_LABELS[setId]:null;
  if(full){
    const dashIdx=full.indexOf('—');
    if(dashIdx>-1)return full.slice(dashIdx+1).trim();
  }
  return typeof cvSetLbl==='function'?cvSetLbl(setId):setId.toUpperCase();
}

function aucFmtDate(d){
  return new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

// Mensagem padrão de divulgação — mesmo texto nos dois botões de
// compartilhar (PDF e só-texto), pra manter a mesma "cara" sempre.
function aucShareMessage(a){
  const url=aucShareUrl(a.id);
  const colecao=aucColecaoNome(a.set_id);
  const inicio=aucFmtDate(a.start_at);
  const fim=aucFmtDate(a.end_at);
  const inicial=fmtR(a.starting_price);
  const atual=fmtR(a.current_bid||a.starting_price);
  return`Ei, vem ver só esse leilão no site mydecktcg.com.br!\n\n`+
    `É a carta *${a.card_name}*${colecao?` da coleção *${colecao}*`:''}. `+
    `Leilão começando dia ${inicio} e terminando dia ${fim}.\n`+
    `Valor inicial de R$ ${inicial}, no momento em R$ ${atual}.\n`+
    `Leiloeiro: ${aucLeiloeiroNome(a.created_by)}.\n\n`+
    `Vem ver no link:\n${url}`;
}

// ── BOTÃO 1: só texto (mensagem padrão + link) ────────────────────
function shareAuctionText(auctionId){
  const a=aucAuctions.find(x=>x.id===auctionId);
  if(!a)return;
  const msg=aucShareMessage(a);
  if(navigator.share){
    navigator.share({title:`Leilão — ${a.card_name}`,text:msg}).catch(()=>{});
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
  if(navigator.clipboard)navigator.clipboard.writeText(msg).catch(()=>{});
  setStatus('Mensagem pronta pro WhatsApp (também copiada)','ok');
}

// ── COMPARTILHAR RODADA INTEIRA (botão do leiloeiro) ──────────────
// Diferente do shareAuctionText/Pdf (uma carta só): divulga a rodada
// toda de uma vez — quantidade de cartas, início, término e o link.
function aucRoundShareMessage(round,cards){
  const url=aucRoundShareUrl(round.id);
  const ativas=cards.filter(a=>a.status!=='cancelado');
  const inicio=aucFmtDate(round.start_at);
  const fim=aucFmtDate(round.end_at);
  return`🔨 Leilão aberto no MyDeck! 🔨\n\n`+
    `Rodada: *${round.title}*\n`+
    `🃏 ${ativas.length} carta${ativas.length===1?'':'s'} em leilão\n`+
    `🕐 Início: ${inicio}\n`+
    `⏰ Término: ${fim}\n`+
    `Leiloeiro: ${aucLeiloeiroNome(round.created_by)}.\n\n`+
    `Vem dar seu lance no site mydecktcg.com.br:\n${url}`;
}

function shareRoundText(roundId){
  const round=aucRoundById(roundId);
  if(!round)return;
  const cards=aucAuctions.filter(a=>a.round_id===roundId);
  const msg=aucRoundShareMessage(round,cards);
  if(navigator.share){
    navigator.share({title:`Leilão MyDeck — ${round.title}`,text:msg}).catch(()=>{});
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
  if(navigator.clipboard)navigator.clipboard.writeText(msg).catch(()=>{});
  setStatus('Mensagem da rodada pronta pro WhatsApp (também copiada)','ok');
}

// ── BOTÃO 2: PDF com a foto da carta + a mesma mensagem padrão ────
async function shareAuctionPdf(auctionId){
  const a=aucAuctions.find(x=>x.id===auctionId);
  if(!a)return;
  if(typeof window.jspdf==='undefined'){
    setStatus('Gerador de PDF ainda carregando, tenta de novo em 1 segundo','err');
    return;
  }
  setStatus('Gerando PDF...','ok');
  const msg=aucShareMessage(a);
  const imgBlob=await aucFetchImageBlob(aucImgFor(a));

  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'pt',format:'a4'});
  const pageW=doc.internal.pageSize.getWidth();
  let y=48;

  doc.setFont('helvetica','bold');
  doc.setFontSize(18);
  doc.text('Leilão MyDeck — mydecktcg.com.br',pageW/2,y,{align:'center'});
  y+=32;

  if(imgBlob){
    try{
      const pngBlob=await aucBlobToPng(imgBlob);
      const dataUrl=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=reject;
        reader.readAsDataURL(pngBlob);
      });
      const props=doc.getImageProperties(dataUrl);
      const maxW=260,maxH=340;
      let w=props.width,h=props.height;
      const scale=Math.min(maxW/w,maxH/h,1);
      w*=scale;h*=scale;
      doc.addImage(dataUrl,'PNG',(pageW-w)/2,y,w,h);
      y+=h+28;
    }catch(e){console.warn('[leilao] não deu pra colocar a imagem no PDF',e);}
  }

  doc.setFont('helvetica','normal');
  doc.setFontSize(12);
  const lines=doc.splitTextToSize(msg.replace(/\*/g,''),pageW-96);
  doc.text(lines,48,y,{lineHeightFactor:1.5});

  const fileName=`leilao-${(a.card_name||'carta').toLowerCase().replace(/[^a-z0-9]+/g,'-')}.pdf`;

  // Celular com suporte a compartilhar arquivo: manda o PDF direto pro
  // WhatsApp (ou outro app). Senão, baixa o PDF e abre o WhatsApp Web com
  // o texto pronto — só falta anexar o arquivo baixado na conversa.
  if(navigator.share&&navigator.canShare){
    try{
      const pdfBlob=doc.output('blob');
      const file=new File([pdfBlob],fileName,{type:'application/pdf'});
      if(navigator.canShare({files:[file]})){
        await navigator.share({title:`Leilão — ${a.card_name}`,text:msg,files:[file]});
        setStatus('','ok');
        return;
      }
    }catch(e){ if(e?.name==='AbortError'){setStatus('','ok');return;} /* cai pro fallback */ }
  }

  doc.save(fileName);
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
  setStatus('PDF baixado — anexe o arquivo na conversa do WhatsApp que já abriu com o texto','ok');
}

// Se a página abriu com ?leilao=<id> (link compartilhado), abre a carta
// já ampliada (zoom) assim que a lista carregar — só uma vez por sessão de
// página, senão reabriria toda vez que renderLeilaoTab() rodar de novo.
let aucSharedZoomOpened=false;
function scrollToSharedAuction(){
  if(aucSharedZoomOpened)return;
  const id=parseInt(new URLSearchParams(window.location.search).get('leilao'));
  if(!id)return;
  const a=aucAuctions.find(x=>x.id===id);
  if(!a)return;
  aucSharedZoomOpened=true;
  openAuctionZoom(id);
}

// Mesma ideia, só que pra link de RODADA (?leilao_rodada=<id>) — desce a
// tela até o bloco daquela rodada em vez de abrir uma carta específica.
let aucSharedRoundScrolled=false;
function scrollToSharedRound(){
  if(aucSharedRoundScrolled)return;
  const id=parseInt(new URLSearchParams(window.location.search).get('leilao_rodada'));
  if(!id)return;
  const el=document.getElementById(`leilao-round-sec-${id}`);
  if(!el)return;
  aucSharedRoundScrolled=true;
  el.scrollIntoView({behavior:'smooth',block:'start'});
}

// Atalho de 1 clique: preenche o valor certo (mínimo ou mínimo+folga) no
// campo de lance e já dispara submitBid — reaproveita toda a validação
// normal (regras aceitas, endereço cadastrado, RPC place_bid etc), só
// poupa a pessoa de digitar/calcular o valor na correria do leilão.
function quickBid(auctionId,idSuffix,kind){
  idSuffix=idSuffix||'';
  const a=aucAuctions.find(x=>x.id===auctionId);
  if(!a)return;
  const amount=kind==='plus'?aucMinPlus(a):aucMinNext(a);
  const input=document.getElementById(`auc-bid-${auctionId}${idSuffix}`);
  if(input)input.value=amount;
  submitBid(auctionId,idSuffix);
}

async function submitBid(auctionId,idSuffix){
  idSuffix=idSuffix||'';
  if(!uid()){setStatus('Faça login para dar lance','err');return;}

  // Primeiro lance de sempre: precisa aceitar as regras antes. O valor
  // digitado fica no campo (não é limpo) e o lance é retomado sozinho
  // assim que a pessoa aceitar — ver acceptLeilaoRules().
  if(!aucRulesAccepted){
    aucPendingBid={auctionId,idSuffix};
    openLeilaoRulesModal();
    return;
  }

  const input=document.getElementById(`auc-bid-${auctionId}${idSuffix}`);
  const statusEl=document.getElementById(`auc-bid-status-${auctionId}${idSuffix}`);
  const amount=parseFloat(input?.value);
  if(!amount||amount<=0){if(statusEl)statusEl.textContent='Informe um valor válido.';return;}

  // Boa prática: exige endereço de entrega cadastrado ANTES de aceitar
  // o lance, pra não ter vencedor sem pra onde enviar a carta depois.
  if(!aucAddress||!aucAddress.cidade||!aucAddress.uf||!aucAddress.logradouro){
    if(statusEl)statusEl.innerHTML='Cadastre seu endereço de entrega antes de dar lance (veja "📍 Meu Endereço de Entrega" abaixo).';
    return;
  }

  const{error}=await sbClient.rpc('place_bid',{p_auction_id:auctionId,p_amount:amount});
  if(error){
    if(statusEl)statusEl.textContent=error.message||'Não foi possível registrar o lance.';
    return;
  }
  if(statusEl)statusEl.textContent='';
  if(input)input.value='';
  setStatus('Lance registrado!','ok');
  await loadRoundsAndAuctions();
  renderAuctionsList();
  refreshOpenAuctionZoom();
}

// ── MEU ENDEREÇO DE ENTREGA (reaproveita tabela user_addresses) ──
function fillLeilaoAddressForm(){
  const map={'auc-addr-cep':'cep','auc-addr-logradouro':'logradouro','auc-addr-numero':'numero','auc-addr-bairro':'bairro','auc-addr-cidade':'cidade','auc-addr-uf':'uf'};
  Object.keys(map).forEach(id=>{const el=document.getElementById(id);if(el)el.value=aucAddress?.[map[id]]||'';});
}

async function saveLeilaoAddress(){
  if(!uid())return;
  const cep=document.getElementById('auc-addr-cep')?.value.trim();
  const logradouro=document.getElementById('auc-addr-logradouro')?.value.trim();
  const numero=document.getElementById('auc-addr-numero')?.value.trim();
  const bairro=document.getElementById('auc-addr-bairro')?.value.trim();
  const cidade=document.getElementById('auc-addr-cidade')?.value.trim();
  const uf=document.getElementById('auc-addr-uf')?.value;
  const statusEl=document.getElementById('auc-addr-status');
  if(!logradouro||!numero||!cidade||!uf){
    if(statusEl)statusEl.textContent='Preencha ao menos rua, número, cidade e UF — é o endereço que vai receber a carta.';
    return;
  }
  const{data,error}=await sbClient.from('user_addresses')
    .upsert({user_id:uid(),cep:cep||null,logradouro,numero,bairro:bairro||null,cidade,uf,updated_at:new Date().toISOString()},{onConflict:'user_id'})
    .select();
  if(error){console.error('[leilao] user_addresses upsert',error);if(statusEl)statusEl.textContent='Erro ao salvar. Verifique se rodou leilao_setup.sql/marketplace_setup.sql no Supabase.';return;}
  aucAddress=Array.isArray(data)?data[0]:aucAddress;
  if(statusEl)statusEl.textContent='✓ Endereço salvo.';
  setStatus('Endereço de entrega salvo','ok');
}

// ── PAGAMENTO ONLINE (Mercado Pago Checkout Pro) ──────────────────
// Chama a Edge Function mp-create-payment (supabase/functions/) que
// cria a cobrança (PIX/cartão/boleto) e devolve o link do checkout —
// o Access Token do Mercado Pago nunca fica no client, só na function.
// A confirmação de pagamento é automática via mp-webhook, não precisa
// mais o leiloeiro marcar "Pago" na mão (esse botão continua existindo
// no painel dele só como exceção, ver renderAdminOrders).
async function payAuctionOrder(orderId){
  if(!uid())return;
  const btn=document.getElementById(`auc-pay-btn-${orderId}`);
  const statusEl=document.getElementById(`auc-pay-status-${orderId}`);
  const resetBtn=()=>{if(btn){btn.disabled=false;btn.textContent='💳 Pagar agora (PIX / Cartão / Boleto)';}};
  if(btn){btn.disabled=true;btn.textContent='Gerando pagamento...';}
  if(statusEl)statusEl.textContent='';
  try{
    const{data:sessionData}=await sbClient.auth.getSession();
    const token=sessionData?.session?.access_token;
    if(!token){if(statusEl)statusEl.textContent='Sessão expirada — faça login de novo.';resetBtn();return;}

    const resp=await fetch(SUPABASE_URL+'/functions/v1/mp-create-payment',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({order_id:orderId})
    });
    const data=await resp.json().catch(()=>({}));
    if(!resp.ok||!data.ok){
      if(statusEl)statusEl.textContent=data.error||'Erro ao gerar pagamento.';
      resetBtn();
      return;
    }
    window.location.href=data.init_point;
  }catch(e){
    console.error('[leilao] payAuctionOrder',e);
    if(statusEl)statusEl.textContent='Erro ao gerar pagamento. Tente de novo em instantes.';
    resetBtn();
  }
}

// ── COMBINAR COM O LEILOEIRO (WhatsApp) ───────────────────────────
// O MyDeck é só a plataforma que roda o leilão — o combinado de envio
// (e qualquer ajuste de pagamento fora do Checkout Pro) é sempre direto
// entre comprador e leiloeiro. Isso é intencional e explicado no
// disclaimer abaixo, não só por transparência: o site nunca teve posse
// da carta física, então não tem como assumir responsabilidade pelo
// envio — só pelo funcionamento do leilão em si.
const AUC_LEILOEIRO_WHATSAPP='5585988930110'; // formato internacional, sem símbolos (wa.me)

function aucWinnerWhatsappMessage(o,round,items){
  const cartas=items.length
    ?items.map(it=>`${it.auctions?.card_name||('Carta #'+it.auction_id)} (R$ ${fmtR(it.amount)})`).join(', ')
    :'—';
  return`Olá! Ganhei o leilão "${round?round.title:('Rodada #'+o.round_id)}" no MyDeck (mydecktcg.com.br): ${cartas}. `+
    `Total: R$ ${fmtR(o.amount)}. Como procedo?`;
}

function contactLeiloeiroWhatsapp(orderId){
  const o=aucMyOrders.find(x=>x.id===orderId);
  if(!o)return;
  const round=aucRoundById(o.round_id);
  const items=aucMyOrderItems.filter(it=>it.order_id===o.id);
  const msg=aucWinnerWhatsappMessage(o,round,items);
  window.open(`https://wa.me/${AUC_LEILOEIRO_WHATSAPP}?text=${encodeURIComponent(msg)}`,'_blank');
}

// Disclaimer + botão, mostrado em todo pedido arrematado (qualquer
// status) — pagamento (PIX) e envio são combinados direto pelo
// WhatsApp por enquanto; pagamento automático (Mercado Pago) fica pra
// depois — ver payAuctionOrder()/mp-create-payment, código já pronto,
// só não está no fluxo do comprador no momento.
function aucWinnerWhatsappBlockHtml(o){
  return`<div class="mkt-note" style="margin-top:10px;border-color:var(--gold)">
    <b>💬 Combine pagamento e envio com o leiloeiro.</b> O MyDeck é só a plataforma que roda o leilão —
    o pagamento (PIX) e o acerto de envio (endereço, transportadora, prazo) são sempre
    <b>direto entre você e o leiloeiro</b>, o site não participa nem se responsabiliza por essa parte.
    <div style="margin-top:8px">
      <button class="btn-add" onclick="contactLeiloeiroWhatsapp(${o.id})">💬 Falar com o leiloeiro no WhatsApp</button>
    </div>
  </div>`;
}

// ── MEUS PEDIDOS (carrinho consolidado por rodada) ────────────────
function renderMyBidsAndOrders(){
  fillLeilaoAddressForm();
  const wrap=document.getElementById('leilao-my-orders');
  if(!wrap)return;
  if(!aucMyOrders.length){
    wrap.innerHTML=`<div class="cv-item-empty">Você ainda não arrematou nenhum leilão.</div>`;
    return;
  }
  wrap.innerHTML=aucMyOrders.map(o=>{
    const round=aucRoundById(o.round_id);
    const items=aucMyOrderItems.filter(it=>it.order_id===o.id);
    const overdue=aucIsOverdue(o);
    return`<div class="panel" style="margin-bottom:10px${overdue?';border-color:var(--accent)':''}">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
        <b>${esc(round?round.title:('Rodada #'+o.round_id))}</b>
        <span style="font-size:10px;font-family:'Space Mono',monospace;color:${overdue?'var(--accent)':aucOrderStatusColor(o.status)};border:1px solid ${overdue?'var(--accent)':aucOrderStatusColor(o.status)};border-radius:20px;padding:2px 10px">${overdue?'⚠️ Pagamento vencido':(AUC_ORDER_LBL[o.status]||o.status)}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin:8px 0 4px">Cartas arrematadas nesta rodada:</div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px">
        ${items.map(it=>`<div style="display:flex;justify-content:space-between;font-size:11px">
          <span>${esc(it.auctions?.card_name||('Carta #'+it.auction_id))}</span><span style="color:var(--teal)">R$ ${fmtR(it.amount)}</span>
        </div>`).join('')||'<span style="font-size:10.5px;color:var(--muted)">—</span>'}
      </div>
      <div style="font-size:12px;font-weight:700;border-top:1px solid var(--border);padding-top:6px">Total: <span style="color:var(--teal)">R$ ${fmtR(o.amount)}</span></div>
      ${o.payment_due_at?`<div style="font-size:10.5px;color:${overdue?'var(--accent)':'var(--muted)'};margin-top:4px">Prazo de pagamento: ${new Date(o.payment_due_at).toLocaleString('pt-BR')}</div>`:''}
      ${aucWinnerWhatsappBlockHtml(o)}
      ${o.tracking_code?`<div style="font-size:11px;margin-top:6px">📦 Rastreio: <b>${esc(o.tracking_code)}</b></div>`:''}
    </div>`;
  }).join('');
}

// ================================================================
// PAINEL DO LEILOEIRO (admin principal + autorizados)
// ================================================================

// ── RODADAS ────────────────────────────────────────────────────
async function createAuctionRound(){
  if(!aucIsLeilaoAdmin)return;
  const statusEl=document.getElementById('leilao-round-status');
  const title=(document.getElementById('leilao-round-title')?.value||'').trim();
  const startAt=document.getElementById('leilao-round-inicio')?.value;
  const endAt=document.getElementById('leilao-round-fim')?.value;
  const payDue=document.getElementById('leilao-round-pagamento')?.value;
  const shippingNote=(document.getElementById('leilao-round-frete')?.value||'').trim();

  if(!title){if(statusEl)statusEl.textContent='Dê um nome pra rodada (ex: "Rodada 7").';return;}
  if(!startAt||!endAt||!payDue){if(statusEl)statusEl.textContent='Preencha início, término e prazo de pagamento.';return;}
  if(new Date(endAt)<=new Date(startAt)){if(statusEl)statusEl.textContent='O término precisa ser depois do início.';return;}
  if(new Date(payDue)<new Date(endAt)){if(statusEl)statusEl.textContent='O prazo de pagamento precisa ser igual ou depois do término dos lances.';return;}

  const payload={
    title,
    start_at:new Date(startAt).toISOString(),
    end_at:new Date(endAt).toISOString(),
    payment_due_at:new Date(payDue).toISOString(),
    shipping_note:shippingNote||null,
    status:new Date(startAt)<=new Date()?'ativo':'agendado'
  };
  const{error}=await sbClient.from('auction_rounds').insert(payload);
  if(error){console.error('[leilao] createAuctionRound',error);if(statusEl)statusEl.textContent='Erro ao criar rodada. Verifique se rodou leilao_setup.sql no Supabase.';return;}
  if(statusEl)statusEl.textContent='✓ Rodada criada!';
  ['leilao-round-title','leilao-round-inicio','leilao-round-fim','leilao-round-pagamento','leilao-round-frete'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  setStatus('Rodada criada','ok');
  await loadRoundsAndAuctions();
  renderRoundSelect();
  renderRoundsAdminList();
}

function renderRoundSelect(){
  const sel=document.getElementById('leilao-admin-round');
  if(!sel)return;
  const open=aucRounds.filter(r=>r.status==='agendado'||r.status==='ativo');
  const prev=sel.value;
  sel.innerHTML=open.length
    ?open.map(r=>`<option value="${r.id}">${esc(r.title)} (${r.status==='ativo'?'ativa':'agendada'})</option>`).join('')
    :`<option value="">— crie uma rodada primeiro —</option>`;
  if(prev&&open.some(r=>String(r.id)===prev))sel.value=prev;
}

function renderRoundsAdminList(){
  const wrap=document.getElementById('leilao-admin-rounds');
  if(!wrap)return;
  // Rodada arquivada some daqui — ela já tem seu lugar na sub-aba
  // "🗄️ Arquivo", pra essa lista não ficar poluída de rodada antiga.
  const rounds=aucRounds.filter(r=>!r.archived);
  if(!rounds.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhuma rodada criada ainda.</div>`;return;}
  wrap.innerHTML=rounds.map(r=>{
    const cards=aucAuctions.filter(a=>a.round_id===r.id&&a.status!=='cancelado');
    const st={agendado:'var(--gold)',ativo:'var(--accent)',encerrado:'var(--teal)',cancelado:'var(--muted)'}[r.status]||'var(--muted)';
    return`<div class="cv-item" style="cursor:default">
      <div class="cv-item-info">
        <div class="cv-item-name">${esc(r.title)}</div>
        <div class="cv-item-meta">${cards.length} carta(s) · <span style="color:${st}">${r.status}</span></div>
      </div>
      ${r.status==='agendado'?`<button class="cv-item-remove" onclick="cancelAuctionRound(${r.id})">Cancelar</button>`:''}
      <button class="cv-item-remove" onclick="deleteAuctionRound(${r.id})">🗑️ Excluir</button>
    </div>`;
  }).join('');
}

async function cancelAuctionRound(roundId){
  if(!aucIsLeilaoAdmin)return;
  if(!confirm('Cancelar esta rodada e todas as cartas agendadas nela?'))return;
  const{error:e1}=await sbClient.from('auctions').update({status:'cancelado',updated_at:new Date().toISOString()}).eq('round_id',roundId).in('status',['agendado','ativo']);
  const{error:e2}=await sbClient.from('auction_rounds').update({status:'cancelado',updated_at:new Date().toISOString()}).eq('id',roundId);
  if(e1||e2){console.error('[leilao] cancelAuctionRound',e1||e2);setStatus('Erro ao cancelar rodada','err');return;}
  setStatus('Rodada cancelada','ok');
  await loadRoundsAndAuctions();
  renderRoundSelect();renderAuctionsList();renderRoundsAdminList();
}

// ── CADASTRAR CARTA (dentro de uma rodada) ────────────────────
function searchAuctionCards(){
  const q=(document.getElementById('leilao-admin-search')?.value||'').trim().toLowerCase();
  const box=document.getElementById('leilao-admin-search-results');
  if(!box)return;
  if(q.length<2){box.innerHTML='';return;}
  const all=typeof getAllCatalogCards==='function'?getAllCatalogCards():[];
  const matches=all.filter(c=>c.name.toLowerCase().includes(q)||c.n.includes(q)).slice(0,25);
  if(!matches.length){box.innerHTML=`<div class="cv-item-empty">Nenhuma carta encontrada.</div>`;return;}
  box.innerHTML=matches.map(c=>{
    const img=typeof getBinderImg==='function'?getBinderImg(c,c._setId):null;
    return`<div class="cv-item" onclick='pickAuctionCard(${JSON.stringify({setId:c._setId,n:c.n,name:c.name}).replace(/'/g,"&#39;")})'>
      ${img?`<img class="cv-item-img" src="${img}" alt="${esc(c.name)}" onerror="this.style.display='none'">`:`<div class="cv-item-icon">🃏</div>`}
      <div class="cv-item-info"><div class="cv-item-name">${esc(c.name)}</div><div class="cv-item-meta">${c.n} · ${esc((c._setId||'').toUpperCase())}</div></div>
    </div>`;
  }).join('');
}

function pickAuctionCard(card){
  aucSelectedCard=card;
  const all=typeof getAllCatalogCards==='function'?getAllCatalogCards():[];
  const c=all.find(cc=>cc._setId===card.setId&&cc.n===card.n);
  const img=c&&typeof getBinderImg==='function'?getBinderImg(c,card.setId):null;
  const preview=document.getElementById('leilao-admin-preview');
  if(preview){
    preview.innerHTML=`${img?`<img src="${img}" style="width:70px;border-radius:6px;object-fit:contain;background:var(--surface2)">`:''}
      <div><b>${esc(card.name)}</b><div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">${card.n} · ${(card.setId||'').toUpperCase()}</div></div>`;
    preview.style.display='flex';
  }
  const nameEl=document.getElementById('leilao-admin-nome');
  if(nameEl)nameEl.value=card.name;
  const box=document.getElementById('leilao-admin-search-results');
  if(box)box.innerHTML='';
  const searchEl=document.getElementById('leilao-admin-search');
  if(searchEl)searchEl.value='';
}

function clearAuctionCardSelection(){
  aucSelectedCard=null;
  const preview=document.getElementById('leilao-admin-preview');
  if(preview){preview.style.display='none';preview.innerHTML='';}
  const nameEl=document.getElementById('leilao-admin-nome');
  if(nameEl)nameEl.value='';
}

async function publishAuction(){
  if(!aucIsLeilaoAdmin)return;
  const statusEl=document.getElementById('leilao-admin-status');
  const roundId=parseInt(document.getElementById('leilao-admin-round')?.value);
  const cardName=(document.getElementById('leilao-admin-nome')?.value||'').trim();
  const condition=document.getElementById('leilao-admin-cond')?.value||'M';
  const language=document.getElementById('leilao-admin-lang')?.value||'pt-BR';
  const description=(document.getElementById('leilao-admin-desc')?.value||'').trim();
  const startingPrice=parseFloat(document.getElementById('leilao-admin-preco')?.value);
  const reserveRaw=document.getElementById('leilao-admin-reserva')?.value;
  const reservePrice=reserveRaw?parseFloat(reserveRaw):null;
  const antiSnipe=parseInt(document.getElementById('leilao-admin-antisnipe')?.value)||3;

  if(!roundId){if(statusEl)statusEl.textContent='Crie ou selecione uma rodada primeiro.';return;}
  const round=aucRoundById(roundId);
  if(!round){if(statusEl)statusEl.textContent='Rodada inválida — recarregue a aba.';return;}
  if(!cardName){if(statusEl)statusEl.textContent='Informe o nome da carta (ou selecione uma na busca).';return;}
  if(!startingPrice||startingPrice<=0){if(statusEl)statusEl.textContent='Informe um preço inicial válido.';return;}
  if(reservePrice&&reservePrice<startingPrice){if(statusEl)statusEl.textContent='O preço de reserva não pode ser menor que o inicial.';return;}

  const all=typeof getAllCatalogCards==='function'?getAllCatalogCards():[];
  const matchedCard=aucSelectedCard?all.find(cc=>cc._setId===aucSelectedCard.setId&&cc.n===aucSelectedCard.n):null;
  const imageUrl=matchedCard&&typeof getBinderImg==='function'?getBinderImg(matchedCard,aucSelectedCard.setId):null;

  // A carta herda o prazo da rodada — todas fecham juntas, como no fluxo real.
  const payload={
    round_id:roundId,
    card_name:cardName,
    set_id:aucSelectedCard?.setId||null,
    card_n:aucSelectedCard?.n||null,
    version:null,
    image_url:imageUrl||null,
    condition,language,
    description:description||null,
    starting_price:startingPrice,
    reserve_price:reservePrice,
    anti_snipe_minutes:antiSnipe,
    start_at:round.start_at,
    end_at:round.end_at,
    status:round.status==='ativo'?'ativo':'agendado'
  };

  const{error}=await sbClient.from('auctions').insert(payload);
  if(error){console.error('[leilao] publish',error);if(statusEl)statusEl.textContent='Erro ao publicar. Verifique se rodou leilao_setup.sql no Supabase.';return;}

  if(statusEl)statusEl.textContent='✓ Carta adicionada à rodada!';
  clearAuctionCardSelection();
  ['leilao-admin-desc','leilao-admin-preco','leilao-admin-reserva']
    .forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  setStatus('Carta publicada no leilão','ok');
  await loadRoundsAndAuctions();
  renderAuctionsList();
  renderRoundsAdminList();
}

async function cancelAuction(auctionId){
  if(!aucIsLeilaoAdmin)return;
  if(!confirm('Cancelar este leilão? Os lances já dados ficam sem efeito.'))return;
  const{error}=await sbClient.from('auctions').update({status:'cancelado',updated_at:new Date().toISOString()}).eq('id',auctionId);
  if(error){console.error('[leilao] cancel',error);setStatus('Erro ao cancelar leilão','err');return;}
  setStatus('Leilão cancelado','ok');
  await loadRoundsAndAuctions();
  renderAuctionsList();
  renderRoundsAdminList();
}

// Exclusão DE VERDADE (diferente de cancelar) — apaga a carta e o
// histórico de lances dela do banco. Só via RPC (delete_auction, ver
// leilao_setup.sql), que confere is_auction_admin() no servidor — não dá
// pra excluir mexendo direto no client, mesmo pra outro leiloeiro.
async function deleteAuction(auctionId){
  if(!aucIsLeilaoAdmin)return;
  const a=aucAuctions.find(x=>x.id===auctionId);
  if(!confirm(`Excluir de vez o leilão "${a?a.card_name:'#'+auctionId}"? Isso apaga a carta e todos os lances dela — não dá pra desfazer.`))return;
  const{error}=await sbClient.rpc('delete_auction',{p_auction_id:auctionId});
  if(error){console.error('[leilao] deleteAuction',error);setStatus(error.message||'Erro ao excluir leilão. Verifique se rodou leilao_setup.sql no Supabase.','err');return;}
  if(aucZoomAuctionId===auctionId){aucZoomAuctionId=null;if(typeof closeModal==='function')closeModal('leilao-zoom-ov');}
  setStatus('Leilão excluído','ok');
  await loadRoundsAndAuctions();
  renderAuctionsList();
  renderRoundsAdminList();
}

// Exclusão de uma rodada inteira e tudo dentro dela (cartas, lances,
// pedidos/carrinhos gerados). Mesma lógica: só via RPC delete_auction_round.
async function deleteAuctionRound(roundId){
  if(!aucIsLeilaoAdmin)return;
  const r=aucRoundById(roundId);
  if(!confirm(`Excluir de vez a rodada "${r?r.title:'#'+roundId}"? Isso apaga TODAS as cartas, lances e pedidos dela — não dá pra desfazer.`))return;
  const{error}=await sbClient.rpc('delete_auction_round',{p_round_id:roundId});
  if(error){console.error('[leilao] deleteAuctionRound',error);setStatus(error.message||'Erro ao excluir rodada. Verifique se rodou leilao_setup.sql no Supabase.','err');return;}
  setStatus('Rodada excluída','ok');
  await loadRoundsAndAuctions();
  await loadAdminAuctionOrders();
  renderRoundSelect();renderAuctionsList();renderRoundsAdminList();renderAdminOrders();
}

// ── PAINEL DE PEDIDOS / CARRINHOS (admin) ─────────────────────
function renderAdminOrders(){
  const wrap=document.getElementById('leilao-admin-orders');
  if(!wrap)return;
  if(!aucAdminOrders.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhum pedido de leilão ainda.</div>`;return;}
  wrap.innerHTML=aucAdminOrders.map(o=>{
    const round=aucRoundById(o.round_id);
    const addr=o.shipping_snapshot||{};
    const items=aucAdminOrderItems.filter(it=>it.order_id===o.id);
    const overdue=aucIsOverdue(o);
    return`<div class="panel" style="margin-bottom:12px${overdue?';border-color:var(--accent)':''}">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
        <b>${esc(round?round.title:('Rodada #'+o.round_id))}</b>
        <span style="font-size:10px;font-family:'Space Mono',monospace;color:${overdue?'var(--accent)':aucOrderStatusColor(o.status)};border:1px solid ${overdue?'var(--accent)':aucOrderStatusColor(o.status)};border-radius:20px;padding:2px 10px">${overdue?'⚠️ Vencido':(AUC_ORDER_LBL[o.status]||o.status)}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin:6px 0">
        Comprador: <b style="color:var(--text)">${esc(o.buyer_email||'—')}</b> · Total: <b style="color:var(--teal)">R$ ${fmtR(o.amount)}</b>
      </div>
      <div style="font-size:10.5px;margin-bottom:6px">
        ${items.map(it=>`${esc(it.auctions?.card_name||('Carta #'+it.auction_id))} — R$ ${fmtR(it.amount)}`).join('<br>')}
      </div>
      <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:8px">
        📍 ${esc(addr.logradouro||'—')}, ${esc(addr.numero||'—')} ${addr.bairro?'— '+esc(addr.bairro):''} · ${esc(addr.cidade||'—')}/${esc(addr.uf||'—')} ${addr.cep?'· CEP '+esc(addr.cep):''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${o.status==='aguardando_pagamento'?`<button class="btn-add" onclick="markOrderPaid(${o.id})">✓ Marcar como Pago (PIX recebido)</button>`:''}
        ${o.status==='pago'?`<input id="auc-track-${o.id}" placeholder="Código de rastreio" class="cv-select" style="width:180px">
          <button class="btn-add" onclick="markOrderShipped(${o.id})">📦 Marcar como Enviado</button>`:''}
        ${o.status==='enviado'?`<button class="btn-add" onclick="markOrderDone(${o.id})">✓ Marcar como Concluído</button>`:''}
        ${overdue?`<button class="cv-item-remove" onclick="unblockBuyer('${o.buyer_id}')">🔓 Liberar bloqueio deste comprador</button>`:''}
      </div>
    </div>`;
  }).join('');
}

async function markOrderPaid(orderId){
  const{data,error}=await sbClient.from('auction_orders').update({status:'pago',paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',orderId).select().maybeSingle();
  if(error){console.error('[leilao] markOrderPaid',error);setStatus('Erro ao atualizar pedido','err');return;}
  // pagou → resolve o motivo do bloqueio automático (flag_overdue_bidders só
  // reflagra quem ainda estiver com pedido vencido e não pago).
  if(data?.buyer_id){
    await sbClient.from('auction_bidder_flags').update({blocked:false,updated_at:new Date().toISOString()}).eq('user_id',data.buyer_id);
  }
  setStatus('Pedido marcado como pago','ok');
  await loadAdminAuctionOrders();renderAdminOrders();
}
async function markOrderShipped(orderId){
  const code=(document.getElementById(`auc-track-${orderId}`)?.value||'').trim();
  const{error}=await sbClient.from('auction_orders').update({status:'enviado',tracking_code:code||null,shipped_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',orderId);
  if(error){console.error('[leilao] markOrderShipped',error);setStatus('Erro ao atualizar pedido','err');return;}
  setStatus('Pedido marcado como enviado','ok');
  await loadAdminAuctionOrders();renderAdminOrders();
}
async function markOrderDone(orderId){
  const{error}=await sbClient.from('auction_orders').update({status:'concluido',updated_at:new Date().toISOString()}).eq('id',orderId);
  if(error){console.error('[leilao] markOrderDone',error);setStatus('Erro ao atualizar pedido','err');return;}
  setStatus('Pedido concluído','ok');
  await loadAdminAuctionOrders();renderAdminOrders();
}
// Liberação manual pra casos excepcionais (ex: comprador avisou que já
// pagou mas o leiloeiro ainda não conferiu). Se o pedido continuar
// vencido e sem pagamento confirmado, flag_overdue_bidders() (chamada
// lazy ao abrir a aba) pode reflagrar automaticamente — o jeito
// "definitivo" de destravar é marcar o pedido como pago.
async function unblockBuyer(buyerId){
  const{error}=await sbClient.from('auction_bidder_flags').update({blocked:false,updated_at:new Date().toISOString()}).eq('user_id',buyerId);
  if(error){console.error('[leilao] unblockBuyer',error);setStatus('Erro ao liberar bloqueio','err');return;}
  setStatus('Bloqueio liberado','ok');
  await loadAdminAuctionOrders();renderAdminOrders();
}

// ── LEILOEIROS AUTORIZADOS (só o admin principal, Eduardo) ────────
function renderLeiloeirosList(){
  const wrap=document.getElementById('leilao-leiloeiros-list');
  if(!wrap)return;
  if(!aucLeiloeiros.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhum leiloeiro adicional autorizado ainda.</div>`;return;}
  wrap.innerHTML=aucLeiloeiros.map(l=>`<div class="cv-item" style="cursor:default">
    <div class="cv-item-info"><div class="cv-item-name">${esc(l.email)}</div></div>
    <button class="cv-item-remove" onclick="removeLeiloeiro('${esc(l.email)}')">Remover</button>
  </div>`).join('');
}

async function addLeiloeiro(){
  if(typeof isAdminEditor!=='function'||!isAdminEditor())return;
  const statusEl=document.getElementById('leilao-leiloeiro-status');
  const email=(document.getElementById('leilao-leiloeiro-email')?.value||'').trim();
  const displayName=(document.getElementById('leilao-leiloeiro-nome')?.value||'').trim();
  if(!email){if(statusEl)statusEl.textContent='Informe o e-mail.';return;}
  const{error}=await sbClient.rpc('add_auction_admin',{p_email:email,p_display_name:displayName||null});
  if(error){
    if(statusEl)statusEl.textContent=error.message||'Erro ao autorizar. Verifique se rodou leilao_setup.sql atualizado.';
    return;
  }
  if(statusEl)statusEl.textContent=`✓ ${email} autorizado como leiloeiro.`;
  const input=document.getElementById('leilao-leiloeiro-email');
  if(input)input.value='';
  const nomeInput=document.getElementById('leilao-leiloeiro-nome');
  if(nomeInput)nomeInput.value='';
  setStatus('Leiloeiro autorizado','ok');
  await loadLeiloeiros();
  await loadLeiloeiroNames();
  renderLeiloeirosList();
}

async function removeLeiloeiro(email){
  if(typeof isAdminEditor!=='function'||!isAdminEditor())return;
  if(!confirm(`Remover ${email} como leiloeiro?`))return;
  const{error}=await sbClient.rpc('remove_auction_admin',{p_email:email});
  if(error){console.error('[leilao] removeLeiloeiro',error);setStatus('Erro ao remover leiloeiro','err');return;}
  setStatus('Leiloeiro removido','ok');
  await loadLeiloeiros();
  renderLeiloeirosList();
}

// ================================================================
// REGRAS DO LEILÃO — popup de aceite (12/08/2026)
// Aparece só na primeira vez que a pessoa tenta dar um lance (não a
// cada visita à aba). Depois de aceitar, fica salvo em
// auction_rules_acceptance (banco) — não pergunta de novo, mesmo em
// outro navegador/dispositivo, a não ser que AUC_RULES_VERSION mude.
// place_bid() também checa isso no banco (leilao_setup.sql), então não
// dá pra pular essa etapa mexendo direto no client.
// ================================================================
function openLeilaoRulesModal(){
  const check=document.getElementById('leilao-rules-check');
  if(check)check.checked=false;
  const btn=document.getElementById('leilao-rules-accept-btn');
  if(btn)btn.disabled=true;
  if(typeof openModal==='function')openModal('leilao-rules-ov');
}

function toggleLeilaoRulesAccept(){
  const check=document.getElementById('leilao-rules-check');
  const btn=document.getElementById('leilao-rules-accept-btn');
  if(btn)btn.disabled=!check?.checked;
}

async function acceptLeilaoRules(){
  if(!uid())return;
  const check=document.getElementById('leilao-rules-check');
  if(!check?.checked)return;
  const btn=document.getElementById('leilao-rules-accept-btn');
  if(btn){btn.disabled=true;btn.textContent='Salvando...';}

  const{error}=await sbClient.from('auction_rules_acceptance')
    .upsert({user_id:uid(),rules_version:AUC_RULES_VERSION,accepted_at:new Date().toISOString()},{onConflict:'user_id'});

  if(error){
    console.error('[leilao] acceptLeilaoRules',error);
    if(btn){btn.disabled=false;btn.textContent='✓ Li e aceito as regras';}
    setStatus('Erro ao registrar aceite. Verifique se rodou leilao_setup.sql no Supabase.','err');
    return;
  }

  aucRulesAccepted=true;
  if(typeof closeModal==='function')closeModal('leilao-rules-ov');
  if(btn){btn.disabled=false;btn.textContent='✓ Li e aceito as regras';}

  // Retoma o lance que ficou esperando o aceite, se houver.
  if(aucPendingBid){
    const{auctionId,idSuffix}=aucPendingBid;
    aucPendingBid=null;
    submitBid(auctionId,idSuffix);
  }
}
