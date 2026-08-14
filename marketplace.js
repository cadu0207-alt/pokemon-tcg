// ================================================================
// MyDeck — Sistema de Vendas (marketplace.js)
// Fase 1 (MVP, jul/2026): o app NÃO processa dinheiro. Só cadastra
// lojas confiáveis (CNPJ + termo de responsabilidade), endereço do
// usuário (cidade/UF, pra sugerir loja mais próxima) e ofertas feitas
// em cartas específicas do fichário. Pagamento acontece fora do app,
// direto entre comprador e loja.
//
// Carregado depois de app.js e lojas.js — reaproveita sbClient,
// currentUser, uid(), setStatus(), fmtR(), isAdmin(), getSlots(),
// slotKey(), VER_SHORT() já definidos lá.
//
// Escopo geográfico inicial: Belo Horizonte (MG) e São Paulo (SP).
// ================================================================

let myAddress=null,trustedStores=[];

// ── CARREGAR ────────────────────────────────────────────────────
async function loadMarketplaceData(){
  if(!uid())return;
  const[{data:addr},{data:stores}]=await Promise.all([
    sbClient.from('user_addresses').select('*').eq('user_id',uid()).maybeSingle(),
    sbClient.from('trusted_stores').select('*').order('created_at',{ascending:false})
  ]);
  myAddress=addr||null;
  trustedStores=Array.isArray(stores)?stores:[];
}

function renderMercado(){
  loadMarketplaceData().then(()=>{
    fillAddressForm();
    renderStoreLists();
  }).catch(e=>console.error('[marketplace] erro ao carregar dados',e));
}

// ── MEU ENDEREÇO ────────────────────────────────────────────────
function fillAddressForm(){
  const cidadeEl=document.getElementById('addr-cidade');
  const ufEl=document.getElementById('addr-uf');
  const cepEl=document.getElementById('addr-cep');
  const bairroEl=document.getElementById('addr-bairro');
  if(!cidadeEl)return;
  cidadeEl.value=myAddress?.cidade||'';
  ufEl.value=myAddress?.uf||'';
  cepEl.value=myAddress?.cep||'';
  bairroEl.value=myAddress?.bairro||'';
}

async function saveMyAddress(){
  if(!uid())return;
  const cidade=document.getElementById('addr-cidade').value.trim();
  const uf=document.getElementById('addr-uf').value;
  const cep=document.getElementById('addr-cep').value.trim();
  const bairro=document.getElementById('addr-bairro').value.trim();
  const statusEl=document.getElementById('addr-status');
  if(!cidade||!uf){if(statusEl)statusEl.textContent='Preencha cidade e UF.';return;}
  const{data,error}=await sbClient.from('user_addresses')
    .upsert({user_id:uid(),cidade,uf,cep:cep||null,bairro:bairro||null,updated_at:new Date().toISOString()},{onConflict:'user_id'})
    .select();
  if(error){console.error('[user_addresses upsert]',error);if(statusEl)statusEl.textContent='Erro ao salvar. Verifique se rodou marketplace_setup.sql no Supabase.';return;}
  myAddress=Array.isArray(data)?data[0]:myAddress;
  if(statusEl)statusEl.textContent='✓ Endereço salvo.';
  setStatus('Endereço salvo','ok');
}

// ── CADASTRAR LOJA CONFIÁVEL ───────────────────────────────────
async function submitTrustedStore(){
  if(!uid())return;
  const statusEl=document.getElementById('store-status');
  const nome=document.getElementById('store-nome').value.trim();
  const razao=document.getElementById('store-razao').value.trim();
  const cnpj=document.getElementById('store-cnpj').value.trim();
  const cidadeSel=document.getElementById('store-cidade').value; // "Cidade|UF"
  const endereco=document.getElementById('store-endereco').value.trim();
  const whatsapp=document.getElementById('store-whatsapp').value.trim();
  const email=document.getElementById('store-email').value.trim();
  const comissao=parseFloat(document.getElementById('store-comissao').value)||10;
  const termoOk=document.getElementById('store-termo-check').checked;
  const termoNome=document.getElementById('store-termo-nome').value.trim();

  if(!nome||!cnpj||!cidadeSel){if(statusEl)statusEl.textContent='Preencha nome, CNPJ e cidade.';return;}
  if(!termoOk||!termoNome){if(statusEl)statusEl.textContent='É preciso aceitar o termo e informar o responsável.';return;}

  const[cidade,ufv]=cidadeSel.split('|');
  const payload={
    owner_user_id:uid(),nome_fantasia:nome,razao_social:razao||null,cnpj,
    cidade,uf:ufv,logradouro:endereco||null,whatsapp:whatsapp||null,email:email||null,
    comissao_pct:comissao,status:'pendente',
    termo_versao:'v1',termo_aceito:true,termo_aceito_por:termoNome,termo_aceito_em:new Date().toISOString()
  };
  const{error}=await sbClient.from('trusted_stores').insert(payload);
  if(error){
    console.error('[trusted_stores insert]',error);
    if(statusEl)statusEl.textContent='Erro ao enviar. Verifique se rodou marketplace_setup.sql no Supabase.';
    return;
  }
  if(statusEl)statusEl.textContent='✓ Cadastro enviado! Fica pendente até aprovação.';
  setStatus('Loja cadastrada — aguardando aprovação','ok');
  ['store-nome','store-razao','store-cnpj','store-endereco','store-whatsapp','store-email','store-termo-nome'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('store-cidade').value='';
  document.getElementById('store-termo-check').checked=false;
  document.getElementById('store-comissao').value='10';
  await loadMarketplaceData();
  renderStoreLists();
}

// ── LISTAS ──────────────────────────────────────────────────────
function mktStoreCard(s,{pending}={}){
  const canEdit=typeof isAdminEditor==='function'&&isAdminEditor();
  return`<div class="mkt-store-card">
    <div class="mkt-store-top">
      <div class="mkt-store-name">${s.nome_fantasia}</div>
      <span class="mkt-store-badge mkt-badge-${s.status}">${s.status}</span>
    </div>
    <div class="mkt-store-meta">${s.cidade} — ${s.uf} · CNPJ ${s.cnpj}</div>
    ${s.logradouro?`<div class="mkt-store-meta">${s.logradouro}</div>`:''}
    <div class="mkt-store-meta">Comissão: ${s.comissao_pct}% ${s.whatsapp?` · 📱 ${s.whatsapp}`:''}</div>
    ${pending&&canEdit?`<div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn-add" style="padding:5px 10px;font-size:10px" onclick="approveStore('${s.id}')">✓ Aprovar</button>
      <button class="cv-item-remove" onclick="rejectStore('${s.id}')">Rejeitar</button>
    </div>`:''}
  </div>`;
}

function renderStoreLists(){
  const activeWrap=document.getElementById('mkt-active-list');
  const pendingWrap=document.getElementById('mkt-pending-wrap');
  const pendingList=document.getElementById('mkt-pending-list');
  if(!activeWrap)return;

  const active=trustedStores.filter(s=>s.status==='ativa');
  activeWrap.innerHTML=active.length
    ?active.map(s=>mktStoreCard(s)).join('')
    :`<div class="cv-item-empty">Nenhuma loja ativa ainda em Belo Horizonte ou São Paulo.</div>`;

  // isAdmin() aqui é visibilidade (viewer também vê a fila de pendentes);
  // os botões de aprovar/rejeitar só aparecem pra isAdminEditor() (mktStoreCard).
  const admin=typeof isAdmin==='function'&&isAdmin();
  const pending=trustedStores.filter(s=>s.status==='pendente');
  if(admin&&pending.length){
    pendingWrap.style.display='block';
    pendingList.innerHTML=pending.map(s=>mktStoreCard(s,{pending:true})).join('');
  }else if(pendingWrap){
    pendingWrap.style.display='none';
  }
}

async function approveStore(id){
  if(typeof isAdminEditor!=='function'||!isAdminEditor())return;
  const{error}=await sbClient.from('trusted_stores').update({status:'ativa',updated_at:new Date().toISOString()}).eq('id',id);
  if(error){console.error('[trusted_stores approve]',error);alert('Não foi possível aprovar.');return;}
  await loadMarketplaceData();renderStoreLists();
}

async function rejectStore(id){
  if(typeof isAdminEditor!=='function'||!isAdminEditor())return;
  const{error}=await sbClient.from('trusted_stores').update({status:'rejeitada',updated_at:new Date().toISOString()}).eq('id',id);
  if(error){console.error('[trusted_stores reject]',error);alert('Não foi possível rejeitar.');return;}
  await loadMarketplaceData();renderStoreLists();
}

// ── OFERTAS NO POPUP DO FICHÁRIO ───────────────────────────────
// Envolve openBinderModal (definida em app.js) sem alterar o arquivo:
// mantém tudo que já acontece lá e só acrescenta uma seção de ofertas
// recebidas logo antes dos botões de ação do modal.
if(typeof window.openBinderModal==='function'){
  const _mktOrigOpenBinderModal=window.openBinderModal;
  window.openBinderModal=function(card,setId){
    _mktOrigOpenBinderModal(card,setId);
    try{
      const c=typeof card==='string'?JSON.parse(card):card;
      injectOffersSection(c,setId);
    }catch(e){console.error('[marketplace] erro ao injetar ofertas no modal do fichário',e);}
  };
}

async function injectOffersSection(card,setId){
  const wrap=document.querySelector('#mbinder-content .mbinder-body');
  if(!wrap||!uid())return;
  const mact=wrap.querySelector('.mact');
  const holderId='mkt-offers-'+Date.now();
  const holderId2='mkt-buyorders-'+Date.now();
  const block=`<div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin:14px 0 8px">💰 OFERTAS RECEBIDAS</div>
    <div id="${holderId}" style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">carregando…</div>
    <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin:14px 0 8px">🎯 QUEM QUER COMPRAR ESSA CARTA</div>
    <div id="${holderId2}" style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">carregando…</div>`;
  if(mact)mact.insertAdjacentHTML('beforebegin',block);
  else wrap.insertAdjacentHTML('beforeend',block);

  const slots=getSlots(card,setId).map(s=>slotKey(setId+':',card.n,s.ver));

  const{data,error}=await sbClient.from('card_offers').select('*')
    .eq('seller_id',uid()).eq('status','pendente').in('slot_key',slots);
  const holder=document.getElementById(holderId);
  if(holder){
    if(error){holder.textContent='Erro ao carregar ofertas.';}
    else{
      const offers=(data||[]).sort((a,b)=>b.offer_price-a.offer_price);
      holder.outerHTML=offers.length
        ?offers.map(o=>`<div class="mkt-offer-row"><span>${VER_SHORT[o.version]||o.version} · ${o.buyer_cidade}/${o.buyer_uf}</span><b>R$${fmtR(o.offer_price)}</b></div>`).join('')
        :`<div id="${holderId}" style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">Nenhuma oferta recebida ainda nesta carta.</div>`;
    }
  }

  // Ordens de compra ativas de OUTRAS pessoas nessa mesma carta (livro de ofertas — lado bid)
  const{data:bo,error:boErr}=await sbClient.from('buy_orders').select('*')
    .eq('status','ativa').in('slot_key',slots).neq('buyer_id',uid());
  const holder2=document.getElementById(holderId2);
  if(!holder2)return; // modal já fechado
  if(boErr){holder2.textContent='Erro ao carregar ordens de compra.';return;}
  const orders=(bo||[]).sort((a,b)=>b.max_price-a.max_price);
  if(!orders.length){holder2.textContent='Ninguém registrou interesse de compra nessa carta ainda.';return;}
  holder2.outerHTML=orders.map(o=>`<div class="mkt-offer-row">
      <span>${VER_SHORT[o.version]||o.version} · quer ${o.qty>1?o.qty+'x':'1x'}</span>
      <b>R$${fmtR(o.max_price)}</b>
    </div>`).join('');
}
