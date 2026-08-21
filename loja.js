// ================================================================
// MyDeck — Loja do Leiloeiro (loja.js) — 19/08/2026
//
// Venda direta, preço fixo, dentro da mesma aba "Leilão" — cartas
// avulsas e produtos selados cadastrados por quem já é leiloeiro
// (is_auction_admin(), mesmo grupo Eduardo/Juan do sistema de lances).
// Fluxo combinado: "Reservar" trava o estoque por 24h e abre o
// WhatsApp já com a mensagem pronta pra combinar pagamento (PIX) e
// envio — mesmo modelo do leilão. Mercado Pago fica pra depois (as
// colunas já existem no banco, dormentes, ver leilao_setup.sql).
//
// Carregado DEPOIS de app.js, fichario_patch.js e leilao.js — reaproveita
// sbClient, uid(), esc(), fmtR(), setStatus(), aucAddress, aucIsLeilaoAdmin,
// aucLeiloeiroNome(), aucPhoneDigits(), goToLeilaoAddressForm(),
// AUC_COND_LBL/AUC_LANG_LBL/AUC_VER_LBL, AUC_LEILOEIRO_WHATSAPP,
// getAllCatalogCards()/getBinderImg() (todos já definidos nesses arquivos).
// ================================================================

let lojaItems=[];
let lojaMyReservations=[];
let lojaAdminReservations=[];
let lojaSelectedCard=null; // carta escolhida na busca do catálogo (Cadastrar Carta)
let lojaActiveFilters={};

// Mesmo padrão da aba Leilões (aucListView/aucExpandedLeiloeiros em
// leilao.js, 21/08/2026) — "Todos os Itens" (grade única, como sempre foi)
// x "Por Leiloeiro" (acordeão por quem cadastrou). Reaproveita
// aucAvatarColor()/aucAvatarInitial() de leilao.js (carregado antes, ver
// cabeçalho do arquivo).
let lojaListView='grade'; // 'grade' | 'leiloeiro'
let lojaExpandedLeiloeiros=new Set();

function lojaSwitchListView(view){
  if(lojaListView===view)return;
  lojaListView=view;
  document.querySelectorAll('#loja-view-toggle .filter-chip').forEach(b=>{
    b.classList.toggle('filter-chip-active',b.dataset.view===view);
  });
  renderLojaGrid();
}

// ── CARREGAR ────────────────────────────────────────────────────
// Sem filtro de status no select — a RLS já cuida disso sozinha:
// quem não é leiloeiro só recebe linhas com status <> 'removido';
// leiloeiro (is_auction_admin()) recebe tudo, inclusive pausado/removido,
// pra conseguir gerenciar o próprio estoque.
async function loadLojaItems(){
  const{data,error}=await sbClient.from('store_items').select('*').order('created_at',{ascending:false});
  if(error){console.error('[loja] loadLojaItems',error);lojaItems=[];return;}
  lojaItems=Array.isArray(data)?data:[];
}

async function loadMyLojaReservations(){
  if(!uid()){lojaMyReservations=[];return;}
  const{data,error}=await sbClient.from('store_reservations')
    .select('*, store_items(title,image_url,kind)')
    .eq('buyer_id',uid()).order('created_at',{ascending:false});
  if(error){console.error('[loja] loadMyLojaReservations',error);lojaMyReservations=[];return;}
  lojaMyReservations=Array.isArray(data)?data:[];
}

async function loadAdminLojaReservations(){
  const{data,error}=await sbClient.from('store_reservations')
    .select('*, store_items(title,image_url,kind)')
    .order('created_at',{ascending:false});
  if(error){console.error('[loja] loadAdminLojaReservations',error);lojaAdminReservations=[];return;}
  lojaAdminReservations=Array.isArray(data)?data:[];
}

function lojaAvailableQty(item){
  return Math.max((item.qty_total||0)-(item.qty_reserved||0)-(item.qty_sold||0),0);
}

// ── BUSCA + FILTROS (vitrine) ───────────────────────────────────
function lojaNormalize(s){
  return(s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function lojaMatchesSearch(i){
  const q=lojaNormalize(document.getElementById('loja-search')?.value||'');
  if(!q)return true;
  return lojaNormalize(`${i.title} ${i.set_id||''} ${i.card_n||''}`).includes(q);
}

function lojaMatchesFilters(i){
  if(lojaActiveFilters.kind&&i.kind!==lojaActiveFilters.kind)return false;
  if(lojaActiveFilters.set&&i.set_id!==lojaActiveFilters.set)return false;
  if(lojaActiveFilters.version&&(i.version||'')!==lojaActiveFilters.version)return false;
  return true;
}

function lojaToggleFilter(group,value){
  lojaActiveFilters[group]=(lojaActiveFilters[group]===value)?null:value;
  renderLojaGrid();
}

// Só monta filtro pra grupo com mais de 1 valor diferente entre os itens
// ativos/esgotados (mesma lógica do filtro de leilões).
function renderLojaFilterBar(){
  const bar=document.getElementById('loja-filter-bar');
  if(!bar)return;
  const visiveis=lojaItems.filter(i=>['ativo','esgotado'].includes(i.status));
  const groups=[
    {key:'kind',values:[...new Set(visiveis.map(i=>i.kind).filter(Boolean))],fmt:v=>v==='carta'?'Cartas':'Selados'},
    {key:'set',values:[...new Set(visiveis.map(i=>i.set_id).filter(Boolean))].sort(),fmt:v=>v.toUpperCase()},
    {key:'version',values:[...new Set(visiveis.map(i=>i.version).filter(Boolean))],fmt:v=>AUC_VER_LBL[v]||v},
  ].filter(g=>g.values.length>1);
  if(!groups.length){bar.innerHTML='';return;}
  bar.innerHTML=groups.map(g=>g.values.map(v=>
    `<button class="filter-chip${lojaActiveFilters[g.key]===v?' filter-chip-active':''}" onclick="lojaToggleFilter('${g.key}','${v}')">${esc(g.fmt(v))}</button>`
  ).join('')).join('');
}

// ── VITRINE ──────────────────────────────────────────────────────
function renderLojaGrid(){
  const wrap=document.getElementById('loja-grid');
  if(!wrap)return;
  renderLojaFilterBar();
  const visiveis=lojaItems.filter(i=>['ativo','esgotado'].includes(i.status))
    .filter(i=>lojaMatchesSearch(i)&&lojaMatchesFilters(i));
  if(!visiveis.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhum item na loja no momento.</div>`;return;}
  wrap.innerHTML=lojaListView==='leiloeiro'
    ?lojaLeiloeiroViewHtml(visiveis)
    :`<div class="auc-grid">${visiveis.map(i=>lojaItemCardHtml(i)).join('')}</div>`;
}

// ── VISÃO "POR LEILOEIRO" (21/08/2026) — mesmo espírito da aba Leilões ──
function lojaLeiloeiroViewHtml(visiveis){
  const byLeiloeiro={};
  visiveis.forEach(i=>{
    const key=i.created_by||'—';
    (byLeiloeiro[key]=byLeiloeiro[key]||[]).push(i);
  });
  const keys=Object.keys(byLeiloeiro).sort((x,y)=>aucLeiloeiroNome(x).localeCompare(aucLeiloeiroNome(y)));
  if(!lojaExpandedLeiloeiros.size&&keys.length)lojaExpandedLeiloeiros.add(keys[0]);
  return keys.map(k=>lojaLeiloeiroSectionHtml(k,byLeiloeiro[k])).join('');
}

function lojaLeiloeiroSectionHtml(key,items){
  const open=lojaExpandedLeiloeiros.has(key);
  const disponiveis=items.filter(i=>i.status==='ativo'&&lojaAvailableQty(i)>0).length;
  const esgotados=items.length-disponiveis;
  const isPrincipal=key===(typeof ADMIN_UID!=='undefined'?ADMIN_UID:null);
  return`<div class="panel auc-leiloeiro-card${open?' open':''}" style="padding:0;margin-bottom:12px">
    <div class="auc-leiloeiro-head" onclick="lojaToggleLeiloeiroSection('${key}')">
      <div class="auc-leiloeiro-avatar" style="background:${aucAvatarColor(key)}">${esc(aucAvatarInitial(key))}</div>
      <div class="auc-leiloeiro-info">
        <div class="auc-leiloeiro-name">${esc(aucLeiloeiroNome(key))}${isPrincipal?' <span class="auc-leiloeiro-badge">LEILOEIRO PRINCIPAL</span>':''}</div>
        <div class="auc-leiloeiro-meta">
          <span>${disponiveis} ${disponiveis===1?'item':'itens'} à venda</span>
          ${esgotados?`<span>${esgotados} esgotado${esgotados===1?'':'s'}</span>`:''}
        </div>
      </div>
      <div class="auc-leiloeiro-chevron">▾</div>
    </div>
    <div class="auc-leiloeiro-body">
      <div class="auc-grid">${items.map(i=>lojaItemCardHtml(i)).join('')}</div>
    </div>
  </div>`;
}

function lojaToggleLeiloeiroSection(key){
  if(lojaExpandedLeiloeiros.has(key))lojaExpandedLeiloeiros.delete(key);
  else lojaExpandedLeiloeiros.add(key);
  renderLojaGrid();
}

function lojaItemCardHtml(item){
  const disponivel=lojaAvailableQty(item);
  const esgotado=item.status==='esgotado'||disponivel<=0;
  return`<div class="panel">
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      ${item.image_url?`<img src="${item.image_url}" alt="${esc(item.title)}" style="width:100px;border-radius:8px;object-fit:contain;background:var(--surface2)" onerror="this.style.display='none'">`:''}
      <div style="flex:1;min-width:220px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
          <b style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.5px">${esc(item.title)}</b>
          <span style="font-size:10px;font-family:'Space Mono',monospace;color:${esgotado?'var(--muted)':'var(--teal)'};border:1px solid ${esgotado?'var(--muted)':'var(--teal)'};border-radius:20px;padding:2px 10px">${esgotado?'Esgotado':(item.kind==='carta'?'Carta':'Selado')}</span>
        </div>
        <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace;margin:4px 0">
          ${item.kind==='carta'?`${AUC_COND_LBL[item.condition]||item.condition||''}${item.language?' · '+(AUC_LANG_LBL[item.language]||item.language):''}`:''}
          ${item.version?` · ${esc(AUC_VER_LBL[item.version]||item.version)}`:''}
          ${item.set_id?` · ${esc(item.set_id.toUpperCase())} #${esc(item.card_n||'')}`:''}
          · Vendido por: ${esc(aucLeiloeiroNome(item.created_by))}
        </div>
        ${item.description?`<div style="font-size:11px;color:var(--text);margin-bottom:6px">${esc(item.description)}</div>`:''}
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px">
          <div><div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">PREÇO</div>
            <div style="font-size:17px;font-weight:700;color:var(--teal)">R$ ${fmtR(item.price)}</div></div>
          <div><div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">DISPONÍVEL</div>
            <div style="font-size:17px;font-weight:700">${disponivel}</div></div>
        </div>
        ${!esgotado&&item.created_by!==uid()?`<div style="margin-top:10px">
          <button class="btn-add" onclick="reserveLojaItem(${item.id})">🛒 Reservar</button>
        </div>
        <div id="loja-reserve-status-${item.id}" style="font-size:10px;color:var(--accent);margin-top:4px;font-family:'Space Mono',monospace"></div>`:''}
      </div>
    </div>
  </div>`;
}

// ── RESERVAR (comprador) ────────────────────────────────────────
async function reserveLojaItem(itemId){
  if(!uid()){setStatus('Faça login para reservar','err');return;}
  const statusEl=document.getElementById(`loja-reserve-status-${itemId}`);
  // Mesma exigência do leilão: endereço + WhatsApp cadastrados ANTES,
  // senão o leiloeiro não teria como combinar pagamento/envio depois.
  if(!aucAddress||!aucAddress.logradouro||!aucAddress.whatsapp){
    if(statusEl)statusEl.innerHTML='Cadastre seu endereço de entrega e WhatsApp antes de reservar. '+
      '<button type="button" class="cv-item-remove" style="font-size:9.5px;padding:2px 8px;margin-left:2px;color:var(--teal);border-color:var(--teal)" onclick="goToLeilaoAddressForm()">📍 Cadastrar agora</button>';
    return;
  }
  const{error}=await sbClient.rpc('reserve_store_item',{p_item_id:itemId,p_qty:1});
  if(error){
    if(statusEl)statusEl.textContent=error.message||'Não foi possível reservar.';
    return;
  }
  setStatus('Item reservado! Você tem 24h antes de perder a reserva — combine o pagamento no WhatsApp abaixo, em "Minhas Reservas".','ok');
  await loadLojaItems();
  await loadMyLojaReservations();
  renderLojaGrid();
  renderMyLojaReservations();
}

async function cancelLojaReservation(reservationId){
  if(!confirm('Cancelar essa reserva? O item volta a ficar disponível pra outros compradores.'))return;
  const{error}=await sbClient.rpc('cancel_store_reservation',{p_reservation_id:reservationId});
  if(error){setStatus(error.message||'Não foi possível cancelar a reserva','err');return;}
  setStatus('Reserva cancelada','ok');
  await loadLojaItems();await loadMyLojaReservations();
  renderLojaGrid();renderMyLojaReservations();
}

// ── MINHAS RESERVAS (comprador) ─────────────────────────────────
const LOJA_STATUS_LBL={
  reservado:{txt:'Reservado — combine com o leiloeiro',color:'var(--gold)'},
  pago:{txt:'Pago — aguardando envio',color:'var(--teal)'},
  enviado:{txt:'Enviado',color:'var(--blue)'},
  concluido:{txt:'Concluído',color:'var(--teal)'},
  cancelado:{txt:'Cancelado',color:'var(--muted)'},
  expirado:{txt:'Expirado (não pago a tempo)',color:'var(--muted)'}
};

function renderMyLojaReservations(){
  const wrap=document.getElementById('loja-my-reservations');
  if(!wrap)return;
  if(!lojaMyReservations.length){wrap.innerHTML=`<div class="cv-item-empty">Você ainda não reservou nada na loja.</div>`;return;}
  wrap.innerHTML=lojaMyReservations.map(r=>{
    const st=LOJA_STATUS_LBL[r.status]||{txt:r.status,color:'var(--muted)'};
    const item=r.store_items||{};
    return`<div class="panel" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
        <b>${esc(item.title||('Item #'+r.item_id))}</b>
        <span style="font-size:10px;font-family:'Space Mono',monospace;color:${st.color};border:1px solid ${st.color};border-radius:20px;padding:2px 10px">${st.txt}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin:6px 0">
        Qtd: ${r.qty} · Total: <b style="color:var(--teal)">R$ ${fmtR(r.unit_price*r.qty)}</b>
        ${r.status==='reservado'&&r.expires_at?` · Reserva expira em ${new Date(r.expires_at).toLocaleString('pt-BR')}`:''}
      </div>
      ${['reservado','pago','enviado'].includes(r.status)?`<div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="cv-item-remove" style="color:var(--teal);border-color:var(--teal)" onclick="contactLeiloeiroLojaWhatsapp(${r.id})">💬 Falar com o leiloeiro</button>
        ${r.status==='reservado'?`<button class="cv-item-remove" onclick="cancelLojaReservation(${r.id})">✕ Cancelar reserva</button>`:''}
      </div>`:''}
    </div>`;
  }).join('');
}

// ── WHATSAPP — comprador → leiloeiro (mesmo padrão do leilão) ──────
function lojaWinnerWhatsappMessage(r){
  const item=r.store_items||{};
  return`Olá! Reservei na Loja do MyDeck (mydecktcg.com.br): ${item.title||('Item #'+r.item_id)} `+
    `(qtd ${r.qty}, R$ ${fmtR(r.unit_price*r.qty)}). Como procedo com o pagamento e envio?`;
}

function contactLeiloeiroLojaWhatsapp(reservationId){
  const r=lojaMyReservations.find(x=>x.id===reservationId);
  if(!r)return;
  const msg=lojaWinnerWhatsappMessage(r);
  window.open(`https://wa.me/${AUC_LEILOEIRO_WHATSAPP}?text=${encodeURIComponent(msg)}`,'_blank');
}

// ── WHATSAPP — leiloeiro → comprador (bidirecional, mesmo padrão
// de contactBuyerWhatsapp em leilao.js) ────────────────────────────
function lojaAdminWhatsappMessage(r){
  const item=r.store_items||{};
  return`Olá! Aqui é do MyDeck (mydecktcg.com.br) — você reservou na loja: ${item.title||('Item #'+r.item_id)} `+
    `(qtd ${r.qty}, R$ ${fmtR(r.unit_price*r.qty)}). Vamos combinar o pagamento (PIX) e o envio?`;
}

function contactBuyerLojaWhatsapp(reservationId){
  const r=lojaAdminReservations.find(x=>x.id===reservationId);
  if(!r)return;
  const addr=r.shipping_snapshot||{};
  const digits=aucPhoneDigits(addr.whatsapp);
  if(digits.length!==10&&digits.length!==11){setStatus('Esse comprador não tem WhatsApp no snapshot dessa reserva.','err');return;}
  const msg=lojaAdminWhatsappMessage(r);
  window.open(`https://wa.me/55${digits}?text=${encodeURIComponent(msg)}`,'_blank');
}

// ── CADASTRAR CARTA (busca no catálogo, mesmo padrão do Cadastro
// de leilão — searchAuctionCards/pickAuctionCard em leilao.js) ────
function searchLojaCards(){
  const q=(document.getElementById('loja-carta-search')?.value||'').trim().toLowerCase();
  const box=document.getElementById('loja-carta-search-results');
  if(!box)return;
  if(q.length<2){box.innerHTML='';return;}
  const all=typeof getAllCatalogCards==='function'?getAllCatalogCards():[];
  const matches=all.filter(c=>c.name.toLowerCase().includes(q)||c.n.includes(q)).slice(0,25);
  if(!matches.length){box.innerHTML=`<div class="cv-item-empty">Nenhuma carta encontrada.</div>`;return;}
  box.innerHTML=matches.map(c=>{
    const img=typeof getBinderImg==='function'?getBinderImg(c,c._setId):null;
    return`<div class="cv-item" onclick='pickLojaCard(${JSON.stringify({setId:c._setId,n:c.n,name:c.name}).replace(/'/g,"&#39;")})'>
      ${img?`<img class="cv-item-img" src="${img}" alt="${esc(c.name)}" onerror="this.style.display='none'">`:`<div class="cv-item-icon">🃏</div>`}
      <div class="cv-item-info"><div class="cv-item-name">${esc(c.name)}</div><div class="cv-item-meta">${c.n} · ${esc((c._setId||'').toUpperCase())}</div></div>
    </div>`;
  }).join('');
}

function pickLojaCard(card){
  lojaSelectedCard=card;
  const all=typeof getAllCatalogCards==='function'?getAllCatalogCards():[];
  const c=all.find(cc=>cc._setId===card.setId&&cc.n===card.n);
  const img=c&&typeof getBinderImg==='function'?getBinderImg(c,card.setId):null;
  const preview=document.getElementById('loja-carta-preview');
  if(preview){
    preview.innerHTML=`${img?`<img src="${img}" style="width:70px;border-radius:6px;object-fit:contain;background:var(--surface2)">`:''}
      <div><b>${esc(card.name)}</b><div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">${card.n} · ${(card.setId||'').toUpperCase()}</div></div>`;
    preview.style.display='flex';
  }
  const nameEl=document.getElementById('loja-carta-nome');
  if(nameEl)nameEl.value=card.name;
  const box=document.getElementById('loja-carta-search-results');
  if(box)box.innerHTML='';
  const searchEl=document.getElementById('loja-carta-search');
  if(searchEl)searchEl.value='';
}

function clearLojaCardSelection(){
  lojaSelectedCard=null;
  const preview=document.getElementById('loja-carta-preview');
  if(preview){preview.style.display='none';preview.innerHTML='';}
  const nameEl=document.getElementById('loja-carta-nome');
  if(nameEl)nameEl.value='';
}

async function publishLojaCarta(){
  if(!aucIsLeilaoAdmin)return;
  const statusEl=document.getElementById('loja-carta-status');
  const nome=(document.getElementById('loja-carta-nome')?.value||'').trim();
  const condition=document.getElementById('loja-carta-cond')?.value||'M';
  const language=document.getElementById('loja-carta-lang')?.value||'pt-BR';
  const versao=document.getElementById('loja-carta-versao')?.value||null;
  const desc=(document.getElementById('loja-carta-desc')?.value||'').trim();
  const preco=parseFloat(document.getElementById('loja-carta-preco')?.value);
  const qty=parseInt(document.getElementById('loja-carta-qty')?.value)||1;

  if(!nome){if(statusEl)statusEl.textContent='Informe o nome da carta (ou selecione uma na busca).';return;}
  if(!preco||preco<=0){if(statusEl)statusEl.textContent='Informe um preço válido.';return;}
  if(!qty||qty<=0){if(statusEl)statusEl.textContent='Informe uma quantidade válida.';return;}

  const all=typeof getAllCatalogCards==='function'?getAllCatalogCards():[];
  const matchedCard=lojaSelectedCard?all.find(cc=>cc._setId===lojaSelectedCard.setId&&cc.n===lojaSelectedCard.n):null;
  const imageUrl=matchedCard&&typeof getBinderImg==='function'?getBinderImg(matchedCard,lojaSelectedCard.setId):null;

  const payload={
    kind:'carta', title:nome,
    set_id:lojaSelectedCard?.setId||null, card_n:lojaSelectedCard?.n||null,
    version:versao||null, condition, language,
    image_url:imageUrl||null, description:desc||null,
    price:preco, qty_total:qty
  };
  const{error}=await sbClient.from('store_items').insert(payload);
  if(error){console.error('[loja] publishLojaCarta',error);if(statusEl)statusEl.textContent='Erro ao cadastrar. Verifique se rodou leilao_setup.sql no Supabase.';return;}
  if(statusEl)statusEl.textContent='✓ Carta adicionada à loja!';
  clearLojaCardSelection();
  ['loja-carta-desc','loja-carta-preco'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const qtyEl=document.getElementById('loja-carta-qty');if(qtyEl)qtyEl.value='1';
  const versaoEl=document.getElementById('loja-carta-versao');if(versaoEl)versaoEl.value='';
  await loadLojaItems();renderLojaAdminItems();renderLojaGrid();
}

// ── CADASTRAR PRODUTO SELADO (formulário livre, sem busca no catálogo) ──
async function publishLojaSelado(){
  if(!aucIsLeilaoAdmin)return;
  const statusEl=document.getElementById('loja-selado-status');
  const nome=(document.getElementById('loja-selado-nome')?.value||'').trim();
  const img=(document.getElementById('loja-selado-img')?.value||'').trim();
  const desc=(document.getElementById('loja-selado-desc')?.value||'').trim();
  const preco=parseFloat(document.getElementById('loja-selado-preco')?.value);
  const qty=parseInt(document.getElementById('loja-selado-qty')?.value)||1;

  if(!nome){if(statusEl)statusEl.textContent='Informe o nome do produto.';return;}
  if(!preco||preco<=0){if(statusEl)statusEl.textContent='Informe um preço válido.';return;}
  if(!qty||qty<=0){if(statusEl)statusEl.textContent='Informe uma quantidade válida.';return;}

  const payload={kind:'selado', title:nome, image_url:img||null, description:desc||null, price:preco, qty_total:qty};
  const{error}=await sbClient.from('store_items').insert(payload);
  if(error){console.error('[loja] publishLojaSelado',error);if(statusEl)statusEl.textContent='Erro ao cadastrar. Verifique se rodou leilao_setup.sql no Supabase.';return;}
  if(statusEl)statusEl.textContent='✓ Produto adicionado à loja!';
  ['loja-selado-nome','loja-selado-img','loja-selado-desc','loja-selado-preco'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const qtyEl=document.getElementById('loja-selado-qty');if(qtyEl)qtyEl.value='1';
  await loadLojaItems();renderLojaAdminItems();renderLojaGrid();
}

// ── ITENS CADASTRADOS (gestão do leiloeiro) ─────────────────────
function renderLojaAdminItems(){
  const wrap=document.getElementById('loja-admin-items');
  if(!wrap)return;
  if(!lojaItems.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhum item cadastrado ainda.</div>`;return;}
  wrap.innerHTML=lojaItems.map(i=>{
    const disp=lojaAvailableQty(i);
    return`<div class="panel" style="margin-bottom:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div>
        <b>${esc(i.title)}</b>
        <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace">
          ${i.kind==='carta'?'Carta':'Selado'} · R$ ${fmtR(i.price)} · ${disp}/${i.qty_total} disponível · ${esc(i.status)} · ${esc(aucLeiloeiroNome(i.created_by))}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${i.status==='ativo'?`<button class="cv-item-remove" onclick="pauseLojaItem(${i.id})">⏸️ Pausar</button>`:''}
        ${i.status==='pausado'?`<button class="cv-item-remove" style="color:var(--teal);border-color:var(--teal)" onclick="reactivateLojaItem(${i.id})">▶️ Reativar</button>`:''}
        ${i.status!=='removido'?`<button class="cv-item-remove" onclick="removeLojaItem(${i.id})">🗑️ Remover</button>`:''}
      </div>
    </div>`;
  }).join('');
}

async function pauseLojaItem(id){
  const{error}=await sbClient.from('store_items').update({status:'pausado',updated_at:new Date().toISOString()}).eq('id',id);
  if(error){console.error('[loja] pauseLojaItem',error);setStatus('Erro ao pausar item','err');return;}
  await loadLojaItems();renderLojaAdminItems();renderLojaGrid();
}
async function reactivateLojaItem(id){
  const{error}=await sbClient.from('store_items').update({status:'ativo',updated_at:new Date().toISOString()}).eq('id',id);
  if(error){console.error('[loja] reactivateLojaItem',error);setStatus('Erro ao reativar item','err');return;}
  await loadLojaItems();renderLojaAdminItems();renderLojaGrid();
}
async function removeLojaItem(id){
  if(!confirm('Remover esse item da loja? Ele some da vitrine (soft-delete — reservas antigas continuam intactas).'))return;
  const{error}=await sbClient.from('store_items').update({status:'removido',updated_at:new Date().toISOString()}).eq('id',id);
  if(error){console.error('[loja] removeLojaItem',error);setStatus('Erro ao remover item','err');return;}
  await loadLojaItems();renderLojaAdminItems();renderLojaGrid();
}

// ── RESERVAS / PEDIDOS DA LOJA (gestão do leiloeiro, mesmo padrão
// de renderAdminOrders em leilao.js) ────────────────────────────
function lojaAdminStatusColor(s){
  return{reservado:'var(--gold)',pago:'var(--teal)',enviado:'var(--blue)',concluido:'var(--teal)',cancelado:'var(--muted)',expirado:'var(--muted)'}[s]||'var(--muted)';
}

function renderLojaAdminReservations(){
  const wrap=document.getElementById('loja-admin-reservations');
  if(!wrap)return;
  if(!lojaAdminReservations.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhuma reserva na loja ainda.</div>`;return;}
  wrap.innerHTML=lojaAdminReservations.map(r=>{
    const item=r.store_items||{};
    const addr=r.shipping_snapshot||{};
    const st=LOJA_STATUS_LBL[r.status]||{txt:r.status};
    return`<div class="panel" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
        <b>${esc(item.title||('Item #'+r.item_id))}</b>
        <span style="font-size:10px;font-family:'Space Mono',monospace;color:${lojaAdminStatusColor(r.status)};border:1px solid ${lojaAdminStatusColor(r.status)};border-radius:20px;padding:2px 10px">${esc(st.txt||r.status)}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin:6px 0">
        Comprador: <b style="color:var(--text)">${esc(r.buyer_email||'—')}</b> · Qtd: ${r.qty} · Total: <b style="color:var(--teal)">R$ ${fmtR(r.unit_price*r.qty)}</b>
      </div>
      <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:8px">
        📍 ${esc(addr.logradouro||'—')}, ${esc(addr.numero||'—')} ${addr.bairro?'— '+esc(addr.bairro):''} · ${esc(addr.cidade||'—')}/${esc(addr.uf||'—')} ${addr.cep?'· CEP '+esc(addr.cep):''}
      </div>
      <div style="margin-bottom:8px">
        ${addr.whatsapp?`<button class="cv-item-remove" style="color:var(--teal);border-color:var(--teal);font-size:10.5px" onclick="contactBuyerLojaWhatsapp(${r.id})">💬 Chamar no WhatsApp (${esc(addr.whatsapp)})</button>`
          :`<div style="font-size:10px;color:var(--muted)">Comprador sem WhatsApp no snapshot dessa reserva.</div>`}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${r.status==='reservado'?`<button class="btn-add" onclick="markLojaReservationPaid(${r.id})">✓ Marcar como Pago (PIX recebido)</button>
          <button class="cv-item-remove" onclick="cancelLojaReservationAdmin(${r.id})">✕ Cancelar reserva</button>`:''}
        ${r.status==='pago'?`<input id="loja-track-${r.id}" placeholder="Código de rastreio" class="cv-select" style="width:180px">
          <button class="btn-add" onclick="markLojaReservationShipped(${r.id})">📦 Marcar como Enviado</button>`:''}
        ${r.status==='enviado'?`<button class="btn-add" onclick="markLojaReservationDone(${r.id})">✓ Marcar como Concluído</button>`:''}
      </div>
    </div>`;
  }).join('');
}

async function markLojaReservationPaid(id){
  const{error}=await sbClient.from('store_reservations').update({status:'pago',paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);
  if(error){console.error('[loja] markLojaReservationPaid',error);setStatus('Erro ao atualizar reserva','err');return;}
  setStatus('Reserva marcada como paga','ok');
  await loadLojaItems();await loadAdminLojaReservations();
  renderLojaAdminItems();renderLojaAdminReservations();
}

async function markLojaReservationShipped(id){
  const code=(document.getElementById(`loja-track-${id}`)?.value||'').trim();
  const{error}=await sbClient.from('store_reservations').update({status:'enviado',tracking_code:code||null,shipped_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);
  if(error){console.error('[loja] markLojaReservationShipped',error);setStatus('Erro ao atualizar reserva','err');return;}
  setStatus('Reserva marcada como enviada','ok');
  await loadAdminLojaReservations();renderLojaAdminReservations();
}

async function markLojaReservationDone(id){
  const{error}=await sbClient.from('store_reservations').update({status:'concluido',updated_at:new Date().toISOString()}).eq('id',id);
  if(error){console.error('[loja] markLojaReservationDone',error);setStatus('Erro ao atualizar reserva','err');return;}
  setStatus('Reserva concluída','ok');
  await loadAdminLojaReservations();renderLojaAdminReservations();
}

async function cancelLojaReservationAdmin(id){
  if(!confirm('Cancelar essa reserva? O item volta a ficar disponível.'))return;
  const{error}=await sbClient.rpc('cancel_store_reservation',{p_reservation_id:id});
  if(error){setStatus(error.message||'Erro ao cancelar','err');return;}
  setStatus('Reserva cancelada','ok');
  await loadLojaItems();await loadAdminLojaReservations();
  renderLojaAdminItems();renderLojaAdminReservations();renderLojaGrid();
}

// ================================================================
// INTEGRAÇÃO COM ANÁLISES E FINANCEIRO — 19/08/2026
//
// Reaproveita funções genéricas já existentes em leilao.js
// (aucCommissionBreakdown, aucMonthKey, aucWeekKey, aucBarChartSvg,
// aucLeiloeiroNome) — nenhuma delas é específica de leilão, todas
// recebem os dados como parâmetro, então servem igual pra loja.
//
// Comissão da Loja é SEPARADA da comissão do Leilão (confirmado com o
// Eduardo): cada uma tem sua própria progressão de faixas sobre o total
// pago do MÊS. O painel de Análises mostra as duas comissões mais um
// card de "total geral" que é só SOMA informativa das duas (não muda
// a faixa de nenhuma).
// ================================================================

// ── CUSTO DE AQUISIÇÃO (privado, mesmo padrão de auction_costs) ────
let lojaItemCosts={}; // {item_id: {cost_price, note}}

async function loadLojaItemCosts(){
  const{data,error}=await sbClient.from('store_item_costs').select('*');
  if(error){console.error('[loja] loadLojaItemCosts',error);lojaItemCosts={};return;}
  lojaItemCosts={};
  (Array.isArray(data)?data:[]).forEach(c=>{lojaItemCosts[c.item_id]={cost_price:c.cost_price,note:c.note};});
}

// itemId = chave real no banco (o custo é por ITEM, não por reserva);
// rowId = id da reserva que gerou essa linha na tabela, só pra achar o
// input certo quando o MESMO item aparece em mais de uma linha (várias
// unidades vendidas em reservas diferentes) — sem isso, dois <input>
// com o mesmo id na página fariam getElementById só enxergar o primeiro.
async function saveLojaCostPrice(itemId,rowId){
  if(!aucIsLeilaoAdmin)return;
  const input=document.getElementById(`loja-cost-${rowId}`);
  const raw=input?.value;
  if(raw===''||raw==null){setStatus('Informe o valor que você pagou pelo item','err');return;}
  const val=parseFloat(raw);
  if(isNaN(val)||val<0){setStatus('Valor de custo inválido','err');return;}
  const{error}=await sbClient.from('store_item_costs')
    .upsert({item_id:itemId,cost_price:val,created_by:uid(),updated_at:new Date().toISOString()},{onConflict:'item_id'});
  if(error){console.error('[loja] saveLojaCostPrice',error);setStatus('Erro ao salvar custo. Verifique se rodou leilao_setup.sql atualizado.','err');return;}
  lojaItemCosts[itemId]={...(lojaItemCosts[itemId]||{}),cost_price:val};
  setStatus('Custo salvo','ok');
  renderLojaFinanceiro();
}

// ── ANÁLISES: KPIs + itens ativos por leiloeiro ─────────────────
function renderLojaAnalisesKpis(){
  const wrap=document.getElementById('loja-analises-kpis');
  if(!wrap)return;
  const ativos=lojaItems.filter(i=>i.status==='ativo');
  const vendidoTotal=lojaAdminReservations.filter(r=>['pago','enviado','concluido'].includes(r.status))
    .reduce((s,r)=>s+ +r.unit_price*r.qty,0);
  const aguardando=lojaAdminReservations.filter(r=>r.status==='reservado');
  const totalAguardando=aguardando.reduce((s,r)=>s+ +r.unit_price*r.qty,0);

  const kpi=(label,value,color)=>`<div class="panel" style="padding:16px">
    <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${color||'var(--text)'}">${value}</div>
  </div>`;
  wrap.innerHTML=
    kpi('ITENS ATIVOS NA LOJA',ativos.length)+
    kpi('VENDIDO NA LOJA (total)',`R$ ${fmtR(vendidoTotal)}`,'var(--teal)')+
    kpi('RESERVAS AGUARDANDO PAGAMENTO',`${aguardando.length} · R$ ${fmtR(totalAguardando)}`,'var(--gold)');
}

function renderLojaAnalisesPorLeiloeiro(){
  const wrap=document.getElementById('loja-analises-por-leiloeiro');
  if(!wrap)return;
  const ativos=lojaItems.filter(i=>i.status==='ativo');
  const porLeiloeiro={};
  ativos.forEach(i=>{
    const key=i.created_by||'—';
    if(!porLeiloeiro[key])porLeiloeiro[key]={count:0,valor:0};
    porLeiloeiro[key].count++;
    porLeiloeiro[key].valor+=+(i.price||0)*lojaAvailableQty(i);
  });
  const keys=Object.keys(porLeiloeiro);
  if(!keys.length){wrap.innerHTML=`<div class="cv-item-empty">Nenhum item ativo na loja no momento.</div>`;return;}
  wrap.innerHTML=keys.map(k=>{
    const d=porLeiloeiro[k];
    return`<div class="panel" style="padding:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <b>${esc(aucLeiloeiroNome(k))}</b>
      <span style="font-size:11px;color:var(--muted);font-family:'Space Mono',monospace">${d.count} ${d.count===1?'item ativo':'itens ativos'} · R$ ${fmtR(d.valor)} em estoque</span>
    </div>`;
  }).join('');
}

// ── ANÁLISES: comissão da Loja (progressão SEPARADA da do Leilão) ──
function renderLojaComissao(){
  const wrap=document.getElementById('loja-analises-comissao');
  if(!wrap)return;
  const now=new Date();
  const inicioMes=new Date(now.getFullYear(),now.getMonth(),1);
  const pagosMes=lojaAdminReservations.filter(r=>
    ['pago','enviado','concluido'].includes(r.status)&&r.paid_at&&new Date(r.paid_at)>=inicioMes
  );
  const totalMes=pagosMes.reduce((s,r)=>s+ +r.unit_price*r.qty,0);
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
  </table>`:`<div class="cv-item-empty">Nenhuma reserva paga ainda em ${esc(mesLabel)}.</div>`;

  wrap.innerHTML=`<div class="kpi-grid" style="margin-bottom:10px">
      ${kpi('VENDIDO NA LOJA NO MÊS ('+mesLabel.toUpperCase()+')',`R$ ${fmtR(totalMes)}`,'var(--teal)')}
      ${kpi('TAXA EFETIVA VIGENTE',`${(effectiveRate*100).toFixed(2)}%`)}
      ${kpi('COMISSÃO MYDECK (LOJA)',`R$ ${fmtR(commission)}`,'var(--accent)')}
      ${kpi('LÍQUIDO P/ LEILOEIRO',`R$ ${fmtR(liquido)}`,'var(--gold)')}
    </div>
    <div class="panel" style="padding:14px">
      <div style="font-size:10.5px;color:var(--muted);margin-bottom:4px">
        Comissão da Loja é calculada SEPARADA da comissão do Leilão — cada uma com sua própria progressão
        sobre o total pago do mês (mesmas faixas: 7% até R$10k · 6% até R$20k · 5% até R$30k · 4% até R$40k ·
        3% até R$50k · 2,5% até R$60k · 2% até R$70k · 1,5% até R$80k · 1% acima de R$80k).
      </div>
      ${tabelaFaixas}
    </div>`;

  renderLojaComissaoTotalGeral(totalMes,commission);
}

// Card informativo só de SOMA (Leilão + Loja) — não altera a faixa de
// nenhuma das duas comissões, é só o panorama geral do mês. Depende de
// aucAdminOrders/aucCommissionBreakdown já carregados por leilao.js.
function renderLojaComissaoTotalGeral(totalMesLoja,comissaoLoja){
  const wrap=document.getElementById('loja-analises-comissao-total');
  if(!wrap)return;
  if(typeof aucAdminOrders==='undefined'||typeof aucCommissionBreakdown!=='function'){wrap.innerHTML='';return;}
  const now=new Date();
  const inicioMes=new Date(now.getFullYear(),now.getMonth(),1);
  const pagosMesLeilao=aucAdminOrders.filter(o=>
    ['pago','enviado','concluido'].includes(o.status)&&o.paid_at&&new Date(o.paid_at)>=inicioMes
  );
  const totalMesLeilao=pagosMesLeilao.reduce((s,o)=>s+ +o.amount,0);
  const comissaoLeilao=aucCommissionBreakdown(totalMesLeilao).commission;

  const totalGeral=totalMesLoja+totalMesLeilao;
  const comissaoGeral=comissaoLoja+comissaoLeilao;
  const liquidoGeral=totalGeral-comissaoGeral;

  const kpi=(label,value,color)=>`<div class="panel" style="padding:16px">
    <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${color||'var(--text)'}">${value}</div>
  </div>`;
  wrap.innerHTML=`<div style="font-size:10.5px;color:var(--muted);margin-bottom:8px">
      Soma informativa Leilão + Loja no mês (cada uma manteve sua própria faixa calculada separadamente acima):
    </div>
    <div class="kpi-grid">
      ${kpi('VENDIDO NO MÊS (GERAL)',`R$ ${fmtR(totalGeral)}`,'var(--teal)')}
      ${kpi('COMISSÃO MYDECK (GERAL)',`R$ ${fmtR(comissaoGeral)}`,'var(--accent)')}
      ${kpi('LÍQUIDO P/ LEILOEIRO (GERAL)',`R$ ${fmtR(liquidoGeral)}`,'var(--gold)')}
    </div>`;
}

function renderLojaAnalises(){
  renderLojaAnalisesKpis();
  renderLojaAnalisesPorLeiloeiro();
  renderLojaComissao();
}

// ── FINANCEIRO: custo/venda/lucro por venda da loja ─────────────
// Mesmo raciocínio de aucComputeFinanceiroRows: comissão do mês é
// rateada proporcionalmente entre as vendas daquele mês, só pra cada
// linha fazer sentido sozinha — a comissão "de verdade" é sempre a
// calculada por faixa em renderLojaComissao().
function lojaComputeFinanceiroRows(){
  const pagosPorMes={};
  lojaAdminReservations.forEach(r=>{
    if(['pago','enviado','concluido'].includes(r.status)&&r.paid_at){
      const k=aucMonthKey(r.paid_at);
      pagosPorMes[k]=(pagosPorMes[k]||0)+ +r.unit_price*r.qty;
    }
  });
  const comissaoPorMes={};
  Object.keys(pagosPorMes).forEach(k=>{comissaoPorMes[k]=aucCommissionBreakdown(pagosPorMes[k]).commission;});

  const vendidas=lojaAdminReservations.filter(r=>['pago','enviado','concluido'].includes(r.status));
  return vendidas.map(r=>{
    const item=r.store_items||lojaItems.find(i=>i.id===r.item_id)||{};
    const venda=+r.unit_price*r.qty;
    const costEntry=lojaItemCosts[r.item_id];
    const custoUnit=(costEntry&&costEntry.cost_price!=null)?+costEntry.cost_price:null;
    const custo=custoUnit!=null?custoUnit*r.qty:null;
    let comissao=null;
    if(r.paid_at){
      const k=aucMonthKey(r.paid_at);
      const totalMes=pagosPorMes[k]||0;
      comissao=totalMes>0?comissaoPorMes[k]*(venda/totalMes):0;
    }
    const lucro=(custo!=null&&comissao!=null)?(venda-custo-comissao):null;
    return{r,item,venda,custo,custoUnit,comissao,lucro};
  }).sort((x,y)=>new Date(y.r.paid_at)-new Date(x.r.paid_at));
}

function lojaAggregateByPeriod(rows,granularity){
  const map={};
  rows.forEach(row=>{
    if(row.lucro==null||!row.r.paid_at)return;
    const key=granularity==='month'?aucMonthKey(row.r.paid_at):aucWeekKey(row.r.paid_at);
    map[key]=(map[key]||0)+row.lucro;
  });
  return Object.keys(map).sort().slice(-12).map(k=>({key:k,value:map[k]}));
}

function renderLojaFinanceiro(){
  const kpiWrap=document.getElementById('loja-financeiro-kpis');
  const listWrap=document.getElementById('loja-financeiro-list');
  const chartSemanaWrap=document.getElementById('loja-financeiro-chart-semana');
  const chartMesWrap=document.getElementById('loja-financeiro-chart-mes');
  if(!kpiWrap||!listWrap)return;

  const rows=lojaComputeFinanceiroRows();
  const receitaTotal=rows.reduce((s,r)=>s+r.venda,0);
  const comCusto=rows.filter(r=>r.custo!=null);
  const custoTotal=comCusto.reduce((s,r)=>s+r.custo,0);
  const comLucro=rows.filter(r=>r.lucro!=null);
  const lucroTotal=comLucro.reduce((s,r)=>s+r.lucro,0);
  const comissaoTotal=comLucro.reduce((s,r)=>s+(r.comissao||0),0);
  const faltandoCusto=rows.length-comCusto.length;

  const kpi=(label,value,color)=>`<div class="panel" style="padding:16px">
    <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${color||'var(--text)'}">${value}</div>
  </div>`;
  kpiWrap.innerHTML=
    kpi('RECEITA TOTAL (LOJA)',`R$ ${fmtR(receitaTotal)}`,'var(--teal)')+
    kpi('CUSTO CADASTRADO',`R$ ${fmtR(custoTotal)}`)+
    kpi('COMISSÃO MYDECK (rateada)',`R$ ${fmtR(comissaoTotal)}`,'var(--gold)')+
    kpi('LUCRO LÍQUIDO (LOJA)',`R$ ${fmtR(lucroTotal)}`,lucroTotal>=0?'var(--teal)':'var(--accent)')+
    kpi('FALTA CADASTRAR CUSTO',faltandoCusto,faltandoCusto?'var(--gold)':'var(--text)');

  if(chartSemanaWrap)chartSemanaWrap.innerHTML=aucBarChartSvg(lojaAggregateByPeriod(rows,'week'));
  if(chartMesWrap)chartMesWrap.innerHTML=aucBarChartSvg(lojaAggregateByPeriod(rows,'month'));

  if(!rows.length){listWrap.innerHTML=`<div class="cv-item-empty">Nenhuma venda da loja ainda.</div>`;return;}
  listWrap.innerHTML=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr style="text-align:left;color:var(--muted);font-family:'Space Mono',monospace;font-size:9px">
      <th style="padding:6px">ITEM</th><th style="padding:6px">COMPRADOR</th>
      <th style="padding:6px;text-align:right">VENDA</th><th style="padding:6px">CUSTO (UNIT.)</th>
      <th style="padding:6px;text-align:right">COMISSÃO</th><th style="padding:6px;text-align:right">LUCRO</th>
    </tr></thead>
    <tbody>
      ${rows.map(row=>`<tr style="border-top:1px solid var(--border)">
        <td style="padding:6px">${esc(row.item.title||('Item #'+row.r.item_id))}${row.r.qty>1?` ×${row.r.qty}`:''}</td>
        <td style="padding:6px;color:var(--muted)">${esc(row.r.buyer_email||'—')}</td>
        <td style="padding:6px;text-align:right;color:var(--teal)">R$ ${fmtR(row.venda)}</td>
        <td style="padding:6px">
          <input type="number" id="loja-cost-${row.r.id}" value="${row.custoUnit!=null?row.custoUnit:''}" placeholder="0,00" step="0.01" min="0" style="width:90px" class="cv-select">
          <button class="cv-item-remove" style="padding:2px 8px;font-size:10px" onclick="saveLojaCostPrice(${row.r.item_id},${row.r.id})">💾</button>
        </td>
        <td style="padding:6px;text-align:right;color:var(--gold)">${row.comissao!=null?'R$ '+fmtR(row.comissao):'—'}</td>
        <td style="padding:6px;text-align:right;font-weight:700;color:${row.lucro==null?'var(--muted)':(row.lucro>=0?'var(--teal)':'var(--accent)')}">${row.lucro!=null?'R$ '+fmtR(row.lucro):'—'}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}
