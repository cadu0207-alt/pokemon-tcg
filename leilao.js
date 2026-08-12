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
let aucAutoNavigated=false; // evita reabrir a aba toda vez que o hook de login roda

// ── SOU LEILOEIRO? (admin principal OU autorizado em auction_admins) ─
async function resolveLeilaoAdminStatus(){
  if(!uid()){aucIsLeilaoAdmin=false;return;}
  if(typeof isAdmin==='function'&&isAdmin()){aucIsLeilaoAdmin=true;return;}
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
  }else if(!aucAutoNavigated&&new URLSearchParams(window.location.search).get('leilao')&&typeof goToTab==='function'){
    // Chegou por um link compartilhado (?leilao=<id>) — abre a aba direto,
    // sem precisar clicar no menu.
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
  const adminWrap=document.getElementById('leilao-admin-wrap');
  if(adminWrap)adminWrap.style.display=aucIsLeilaoAdmin?'':'none';
  const superWrap=document.getElementById('leilao-super-admin-wrap');
  if(superWrap)superWrap.style.display=(typeof isAdmin==='function'&&isAdmin())?'':'none';

  await loadRoundsAndAuctions();
  await loadMyAuctionOrders();
  renderRoundSelect();
  renderAuctionsList();
  renderMyBidsAndOrders();
  scrollToSharedAuction();

  if(aucIsLeilaoAdmin){
    renderRoundsAdminList();
    await loadAdminAuctionOrders();
    renderAdminOrders();
  }
  if(typeof isAdmin==='function'&&isAdmin()){
    await loadLeiloeiros();
    renderLeiloeirosList();
  }
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
  const[{data:orders},{data:addr},{data:flag}]=await Promise.all([
    sbClient.from('auction_orders').select('*').eq('buyer_id',uid()).order('created_at',{ascending:false}),
    sbClient.from('user_addresses').select('*').eq('user_id',uid()).maybeSingle(),
    sbClient.from('auction_bidder_flags').select('*').eq('user_id',uid()).maybeSingle()
  ]);
  aucMyOrders=Array.isArray(orders)?orders:[];
  aucAddress=addr||null;
  aucBlocked=!!flag?.blocked;
  aucBlockedReason=flag?.reason||'';
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
  const visibleRounds=aucRounds.filter(r=>r.status!=='cancelado'&&aucAuctions.some(a=>a.round_id===r.id&&a.status!=='cancelado'));
  if(!visibleRounds.length){
    wrap.innerHTML=`<div class="cv-item-empty">Nenhum leilão no momento.</div>`;
    return;
  }
  wrap.innerHTML=(aucBlocked?`<div class="mkt-note" style="border-color:var(--accent);color:var(--accent)">
      🚫 Você está temporariamente bloqueado de dar lances: ${esc(aucBlockedReason||'pagamento pendente de uma rodada anterior')}. Fale com o leiloeiro pra liberar.
    </div>`:'')+
  visibleRounds.map(r=>{
    const cards=aucAuctions.filter(a=>a.round_id===r.id&&a.status!=='cancelado');
    return`<div class="sec-title" style="margin-top:20px">🗓️ ${esc(r.title)}
      <span style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;font-weight:400;margin-left:8px">
        Lances até ${new Date(r.end_at).toLocaleString('pt-BR')} · Pagamento até ${new Date(r.payment_due_at).toLocaleString('pt-BR')}
      </span></div>
      ${r.shipping_note?`<div class="mkt-note" style="margin-bottom:14px">🚚 ${esc(r.shipping_note)}</div>`:''}
      ${cards.map(a=>aucCardHtml(a)).join('')}`;
  }).join('');
}

function aucCardHtml(a){
  const st=aucStatusLabel(a);
  const img=aucImgFor(a);
  const isActive=a.status==='ativo'&&new Date(a.end_at)>new Date();
  const isOwnAuction=a.created_by===uid();
  const iAmWinning=a.current_bidder===uid();
  return`<div class="panel" style="margin-bottom:14px">
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      ${img?`<img src="${img}" alt="${esc(a.card_name)}" style="width:100px;border-radius:8px;object-fit:contain;background:var(--surface2)" onerror="this.style.display='none'">`:''}
      <div style="flex:1;min-width:220px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
          <b style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.5px">${esc(a.card_name)}</b>
          <span style="font-size:10px;font-family:'Space Mono',monospace;color:${st.color};border:1px solid ${st.color};border-radius:20px;padding:2px 10px">${st.txt}</span>
        </div>
        <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace;margin:4px 0">
          ${AUC_COND_LBL[a.condition]||a.condition} · ${AUC_LANG_LBL[a.language]||a.language}
          ${a.set_id?` · ${esc(a.set_id.toUpperCase())} #${esc(a.card_n||'')}`:''}
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
            <input type="number" id="auc-bid-${a.id}" placeholder="Mín. R$ ${fmtR(aucMinNext(a))}" step="0.01" style="width:150px" class="cv-select">
            <button class="btn-add" onclick="submitBid(${a.id})">🔨 Dar Lance</button>
          </div>
          <div style="font-size:9.5px;color:var(--muted);margin-top:4px">Lance é compromisso — não dá pra retirar depois de enviado.</div>
          <div id="auc-bid-status-${a.id}" style="font-size:10px;color:var(--accent);margin-top:4px;font-family:'Space Mono',monospace"></div>`:''}
        ${a.status==='agendado'?`<div style="font-size:10.5px;color:var(--muted);margin-top:6px">Começa em ${new Date(a.start_at).toLocaleString('pt-BR')}</div>`:''}
        <div style="margin-top:10px">
          <button class="cv-item-remove" style="color:var(--teal);border-color:var(--teal)" onclick="shareAuction(${a.id})">📲 Compartilhar</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ── COMPARTILHAR (link direto + mensagem pronta pro WhatsApp) ────
function aucShareUrl(auctionId){
  const base=window.location.origin+window.location.pathname;
  return`${base}?leilao=${auctionId}`;
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

async function shareAuction(auctionId){
  const a=aucAuctions.find(x=>x.id===auctionId);
  if(!a)return;
  const round=aucRoundById(a.round_id);
  const url=aucShareUrl(auctionId);
  const precoAtual=fmtR(a.current_bid||a.starting_price);
  const prazo=new Date(a.end_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  const msg=`🔨 *LEILÃO ${esc(a.card_name)}*\n`+
    `${AUC_COND_LBL[a.condition]||a.condition} · ${AUC_LANG_LBL[a.language]||a.language}\n\n`+
    `💰 Lance atual: R$ ${precoAtual}\n`+
    `⏰ Encerra em: ${prazo}${round?` (${esc(round.title)})`:''}\n\n`+
    `Dá seu lance aqui:\n${url}`;

  const imgBlob=await aucFetchImageBlob(aucImgFor(a));

  // 1) Celular: Web Share API manda foto + texto juntos direto pro WhatsApp,
  // quando o navegador suporta compartilhar arquivos.
  if(navigator.share){
    const shareData={title:`Leilão — ${a.card_name}`,text:msg};
    if(imgBlob&&navigator.canShare){
      const file=new File([imgBlob],'carta.jpg',{type:imgBlob.type||'image/jpeg'});
      if(navigator.canShare({files:[file]})){
        shareData.files=[file];
      }else{
        shareData.url=url;
      }
    }else{
      shareData.url=url;
    }
    try{await navigator.share(shareData);return;}
    catch(e){ if(e?.name==='AbortError')return; /* senão cai pro fallback abaixo */ }
  }

  // 2) Desktop: copia a imagem pro clipboard (se conseguiu baixar) e abre o
  // WhatsApp Web já com o texto preenchido — só falta colar (Ctrl+V) a
  // imagem na conversa antes de mandar.
  let imgCopied=false;
  if(imgBlob&&navigator.clipboard&&window.ClipboardItem){
    try{
      await navigator.clipboard.write([new ClipboardItem({'image/png':await aucBlobToPng(imgBlob)})]);
      imgCopied=true;
    }catch(e){console.warn('[leilao] não deu pra copiar a imagem pro clipboard',e);}
  }
  const waUrl=`https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(waUrl,'_blank');
  if(!imgCopied&&navigator.clipboard)navigator.clipboard.writeText(msg).catch(()=>{});
  setStatus(imgCopied
    ? 'Imagem copiada — cole com Ctrl+V na conversa do WhatsApp'
    : (imgBlob===null?'Mensagem pronta pro WhatsApp (não deu pra copiar a imagem automaticamente — baixe e anexe à mão)':'Mensagem pronta pro WhatsApp (também copiada)'),
    'ok');
}

// Se a página abriu com ?leilao=<id> (link compartilhado), rola até o card
// assim que a lista renderizar.
function scrollToSharedAuction(){
  const params=new URLSearchParams(window.location.search);
  const id=params.get('leilao');
  if(!id)return;
  setTimeout(()=>{
    const btn=Array.from(document.querySelectorAll(`[onclick="submitBid(${id})"]`))[0];
    const card=btn?btn.closest('.panel'):null;
    if(card){
      card.scrollIntoView({behavior:'smooth',block:'center'});
      card.style.outline='2px solid var(--teal)';
      setTimeout(()=>{card.style.outline='';},2500);
    }
  },300);
}

async function submitBid(auctionId){
  if(!uid()){setStatus('Faça login para dar lance','err');return;}
  const input=document.getElementById(`auc-bid-${auctionId}`);
  const statusEl=document.getElementById(`auc-bid-status-${auctionId}`);
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
      ${o.status==='aguardando_pagamento'?`<div class="mkt-note" style="margin-top:8px">
        Pague via <b>PIX diretamente ao leiloeiro</b> (combine a chave por fora do site) — um PIX só cobre tudo que você arrematou nesta rodada. Envio por conta do comprador.
      </div>`:''}
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
  if(!aucRounds.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhuma rodada criada ainda.</div>`;return;}
  wrap.innerHTML=aucRounds.map(r=>{
    const cards=aucAuctions.filter(a=>a.round_id===r.id&&a.status!=='cancelado');
    const st={agendado:'var(--gold)',ativo:'var(--accent)',encerrado:'var(--teal)',cancelado:'var(--muted)'}[r.status]||'var(--muted)';
    return`<div class="cv-item" style="cursor:default">
      <div class="cv-item-info">
        <div class="cv-item-name">${esc(r.title)}</div>
        <div class="cv-item-meta">${cards.length} carta(s) · <span style="color:${st}">${r.status}</span></div>
      </div>
      ${r.status==='agendado'?`<button class="cv-item-remove" onclick="cancelAuctionRound(${r.id})">Cancelar</button>`:''}
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
  if(typeof isAdmin!=='function'||!isAdmin())return;
  const statusEl=document.getElementById('leilao-leiloeiro-status');
  const email=(document.getElementById('leilao-leiloeiro-email')?.value||'').trim();
  if(!email){if(statusEl)statusEl.textContent='Informe o e-mail.';return;}
  const{error}=await sbClient.rpc('add_auction_admin',{p_email:email});
  if(error){
    if(statusEl)statusEl.textContent=error.message||'Erro ao autorizar.';
    return;
  }
  if(statusEl)statusEl.textContent=`✓ ${email} autorizado como leiloeiro.`;
  const input=document.getElementById('leilao-leiloeiro-email');
  if(input)input.value='';
  setStatus('Leiloeiro autorizado','ok');
  await loadLeiloeiros();
  renderLeiloeirosList();
}

async function removeLeiloeiro(email){
  if(typeof isAdmin!=='function'||!isAdmin())return;
  if(!confirm(`Remover ${email} como leiloeiro?`))return;
  const{error}=await sbClient.rpc('remove_auction_admin',{p_email:email});
  if(error){console.error('[leilao] removeLeiloeiro',error);setStatus('Erro ao remover leiloeiro','err');return;}
  setStatus('Leiloeiro removido','ok');
  await loadLeiloeiros();
  renderLeiloeirosList();
}
