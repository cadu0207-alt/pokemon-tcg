// ================================================================
// MyDeck — NOTIFICAÇÕES (02/10/2026)
// Etapa 1 (no app): sino no cabeçalho + aviso ao vivo (realtime) quando
// chega uma notificação. As linhas vêm da tabela `notifications`,
// gravadas por gatilhos do banco (ver notificacoes_setup_02out2026.sql) —
// o client só LÊ, marca como lida e escuta INSERT.
//
// As etapas seguintes (push do celular e e-mail) leem as MESMAS linhas;
// nada aqui precisa mudar quando elas entrarem.
// ================================================================

let notifItems=[];        // mais recentes primeiro (máx. NOTIF_LIMIT)
let notifUnread=0;
let notifUserId=null;     // dono da assinatura atual
let notifChannel=null;
let notifPanelOpen=false;
let notifSubscribedOnce=false;
let notifEmailEnabled=null; // null = ainda carregando; sem linha em notification_prefs = ligado
let notifEmailBusy=false;
let notifNewsEnabled=null;  // novidades/notícias no sino e push (notification_prefs.news_enabled); null = carregando
let notifNewsBusy=false;

const NOTIF_LIMIT=30;
const NOTIF_ICON={auction_outbid:'🔔',auction_closed:'🏁',site_update:'🆕',news:'🗞️'};

// ── CARGA ──────────────────────────────────────────────────────────
async function notifLoad(){
  if(!sbClient||!notifUserId)return;
  const uidAtStart=notifUserId;
  const{data,error}=await sbClient.from('notifications')
    .select('id,type,auction_id,title,body,data,read_at,created_at')
    .order('created_at',{ascending:false}).limit(NOTIF_LIMIT);
  if(error){console.error('[notif] load',error);return;}
  if(uidAtStart!==notifUserId)return; // trocou de conta no meio da consulta
  notifItems=data||[];
  // contagem à parte: pode haver mais não lidas do que cabem na lista
  const{count}=await sbClient.from('notifications')
    .select('id',{count:'exact',head:true}).is('read_at',null);
  if(uidAtStart!==notifUserId)return;
  notifUnread=count!=null?count:notifItems.filter(n=>!n.read_at).length;
  notifRender();
}

// ── REALTIME ───────────────────────────────────────────────────────
function notifSubscribe(userId){
  notifChannel=sbClient.channel('notif-'+userId)
    .on('postgres_changes',
      {event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+userId},
      payload=>notifOnInsert(payload.new))
    .subscribe((status,err)=>{
      if(status==='SUBSCRIBED'){
        // reconexão: o que chegou enquanto estava fora do ar não vem pelo
        // canal — ressincroniza pela consulta normal.
        if(notifSubscribedOnce)notifLoad();
        notifSubscribedOnce=true;
      }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
        console.warn('[notif] realtime',status,err||'');
      }
    });
}

function notifOnInsert(row){
  if(!row||notifItems.some(n=>n.id===row.id))return;
  notifItems.unshift(row);
  if(notifItems.length>NOTIF_LIMIT)notifItems.length=NOTIF_LIMIT;
  if(!row.read_at)notifUnread++;
  notifRender();
  notifShowToast(row);
}

// ── CICLO DE VIDA (login/logout) ───────────────────────────────────
function notifTeardown(){
  if(notifChannel&&sbClient){sbClient.removeChannel(notifChannel);}
  notifChannel=null;
  notifSubscribedOnce=false;
  notifItems=[];
  notifUnread=0;
  notifEmailEnabled=null;
  notifNewsEnabled=null;
  notifClosePanel();
  notifRender();
}

function notifOnSession(user){
  const id=(user&&user.id)||null;
  if(id===notifUserId)return; // TOKEN_REFRESHED e afins: mesma pessoa, nada a fazer
  notifTeardown();
  notifUserId=id;
  const wrap=document.getElementById('notif-wrap');
  if(wrap)wrap.style.display=id?'':'none';
  if(!id||!sbClient)return;
  notifLoad();
  notifSubscribe(id);
  notifPushSync();
  notifEmailLoad();
  notifHandlePrefsLink();
}

// Mesmo padrão do hookLeilaoTabVisibility (leilao.js): _updateUserChip roda a
// cada mudança de sessão, então é o gancho de login/logout.
(function hookNotifSession(){
  function tryHook(){
    if(typeof window._updateUserChip!=='function'){setTimeout(tryHook,50);return;}
    const original=window._updateUserChip;
    window._updateUserChip=function(user){original(user);notifOnSession(user);};
    notifOnSession(typeof currentUser!=='undefined'?currentUser:null);
  }
  tryHook();
})();

// Aba que ficou em segundo plano pode ter perdido eventos (o navegador
// segura o websocket) — ao voltar, confere de novo.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&notifUserId)notifLoad();
});

// ── LEITURA ────────────────────────────────────────────────────────
async function notifMarkRead(ids){
  const targets=notifItems.filter(n=>ids.includes(n.id)&&!n.read_at);
  if(!targets.length)return;
  const now=new Date().toISOString();
  targets.forEach(n=>{n.read_at=now;});
  notifUnread=Math.max(0,notifUnread-targets.length);
  notifRender();
  const{error}=await sbClient.from('notifications').update({read_at:now}).in('id',targets.map(n=>n.id));
  if(error){console.error('[notif] markRead',error);notifLoad();} // desfaz o otimista
}

async function notifMarkAllRead(){
  if(!notifUnread)return;
  const now=new Date().toISOString();
  notifItems.forEach(n=>{if(!n.read_at)n.read_at=now;});
  notifUnread=0;
  notifRender();
  const{error}=await sbClient.from('notifications').update({read_at:now}).is('read_at',null);
  if(error){console.error('[notif] markAllRead',error);notifLoad();}
}

// ── AÇÃO: abrir o leilão da notificação ────────────────────────────
function notifOpen(id){
  const n=notifItems.find(x=>x.id===id);
  if(!n)return;
  notifClosePanel();
  notifMarkRead([id]);
  notifRoute(n);
}

// Pra onde cada tipo de notificação leva. Leilão abre a carta; notícia abre
// a matéria; novidade do site leva pro Início (onde fica o mural).
function notifRoute(n){
  const d=n.data||{};
  const aid=n.auction_id||d.auction_id;
  if(aid){
    // leilao.js abre a carta em renderLeilaoTab() → scrollToSharedAuction()
    if(typeof aucPendingOpenId!=='undefined')aucPendingOpenId=aid;
    if(typeof goToTab==='function')goToTab('leilao');
    return;
  }
  if(d.news_id){
    if(typeof goToTab==='function')goToTab('inicio');
    if(typeof openInicioArticle==='function')setTimeout(()=>openInicioArticle(d.news_id),250);
    return;
  }
  if(n.type==='site_update'){
    if(typeof goToTab==='function')goToTab('inicio');
    setTimeout(()=>{const w=document.getElementById('inicio-updates-wrap');if(w)w.scrollIntoView({behavior:'smooth',block:'center'});},300);
  }
}

// ── RENDER ─────────────────────────────────────────────────────────
function notifTimeAgo(iso){
  const s=Math.max(0,(Date.now()-new Date(iso).getTime())/1000);
  if(s<60)return'agora';
  if(s<3600)return Math.floor(s/60)+' min';
  if(s<86400)return Math.floor(s/3600)+' h';
  if(s<172800)return'ontem';
  return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}

function notifRender(){
  const badge=document.getElementById('notif-badge');
  const bell=document.getElementById('notif-bell');
  if(badge){
    badge.style.display=notifUnread?'':'none';
    badge.textContent=notifUnread>99?'99+':String(notifUnread);
  }
  if(bell){
    bell.setAttribute('aria-label',notifUnread?`Notificações (${notifUnread} não lidas)`:'Notificações');
  }
  if(notifPanelOpen)notifRenderPanel();
}

function notifRenderPanel(){
  const panel=document.getElementById('notif-panel');
  if(!panel)return;
  const items=notifItems.length
    ?notifItems.map(n=>`
      <button type="button" class="notif-item${n.read_at?'':' unread'}" onclick="notifOpen(${n.id})">
        <span class="notif-item-ic">${NOTIF_ICON[n.type]||'🔔'}</span>
        <span class="notif-item-main">
          <span class="notif-item-title">${esc(n.title)}</span>
          <span class="notif-item-body">${esc(n.body||'')}</span>
        </span>
        <span class="notif-item-time">${notifTimeAgo(n.created_at)}</span>
      </button>`).join('')
    :`<div class="notif-empty">Nenhuma notificação ainda.<br>Você será avisado aqui quando um lance seu for coberto, um leilão em que participou encerrar ou o MyDeck tiver novidades.</div>`;
  panel.innerHTML=`
    <div class="notif-panel-head">
      <span>Notificações</span>
      <button type="button" class="notif-markall" onclick="notifMarkAllRead()"${notifUnread?'':' disabled'}>Marcar todas como lidas</button>
    </div>
    <div class="notif-list">${items}</div>
    ${notifEmailRowHtml()}
    ${notifNewsRowHtml()}
    ${notifPushRowHtml()}`;
}

// ── PAINEL (abrir/fechar/posicionar) ───────────────────────────────
function notifPositionPanel(){
  const panel=document.getElementById('notif-panel');
  const bell=document.getElementById('notif-bell');
  if(!panel||!bell)return;
  const r=bell.getBoundingClientRect();
  panel.style.top=(r.bottom+8)+'px';
  if(window.innerWidth<=600){
    panel.style.left='8px';panel.style.right='8px';panel.style.width='auto';
  }else{
    const w=Math.min(380,window.innerWidth-16);
    panel.style.width=w+'px';
    panel.style.left=Math.max(8,Math.min(r.right-w,window.innerWidth-w-8))+'px';
    panel.style.right='auto';
  }
}

function notifTogglePanel(ev){
  if(ev)ev.stopPropagation();
  notifPanelOpen?notifClosePanel():notifOpenPanel();
}

function notifOpenPanel(){
  const panel=document.getElementById('notif-panel');
  if(!panel)return;
  // o header cria contexto de empilhamento próprio (o z-index do painel só
  // valeria DENTRO dele e os botões fixos do topo, z-index 999, passavam por
  // cima) — no body ele compete de igual pra igual com o resto da página.
  if(panel.parentElement!==document.body)document.body.appendChild(panel);
  notifPanelOpen=true;
  notifRenderPanel();
  notifPushRefreshState(); // a permissão pode ter mudado nas configurações do navegador
  panel.style.display='flex';
  notifPositionPanel();
  const bell=document.getElementById('notif-bell');
  if(bell)bell.setAttribute('aria-expanded','true');
}

function notifClosePanel(){
  notifPanelOpen=false;
  const panel=document.getElementById('notif-panel');
  if(panel)panel.style.display='none';
  const bell=document.getElementById('notif-bell');
  if(bell)bell.setAttribute('aria-expanded','false');
}

document.addEventListener('click',e=>{
  if(!notifPanelOpen)return;
  const wrap=document.getElementById('notif-wrap');
  const panel=document.getElementById('notif-panel');
  // composedPath() é gravado no INÍCIO do disparo: clicar num botão do painel
  // re-desenha o painel (innerHTML) antes do evento chegar aqui, e aí
  // panel.contains(e.target) daria false (alvo já fora da árvore) e o painel
  // fecharia sozinho a cada clique em "Ativar"/"Marcar todas como lidas".
  const path=typeof e.composedPath==='function'?e.composedPath():[];
  const inside=(el)=>!!el&&(path.includes(el)||el.contains(e.target));
  if(inside(wrap)||inside(panel))return;
  notifClosePanel();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&notifPanelOpen)notifClosePanel();});
window.addEventListener('resize',()=>{if(notifPanelOpen)notifPositionPanel();});

// ── AVISO AO VIVO (clicável) ───────────────────────────────────────
// toast() do app.js é texto puro e #md-toast-wrap tem pointer-events:none —
// aqui precisa ser clicável (leva direto pro leilão), então monta o próprio.
function notifShowToast(n){
  let wrap=document.getElementById('md-toast-wrap');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='md-toast-wrap';
    wrap.setAttribute('aria-live','polite');
    document.body.appendChild(wrap);
  }
  const el=document.createElement('div');
  el.className='md-toast md-toast-info notif-toast';
  el.setAttribute('role','status');
  el.innerHTML=`<strong>${NOTIF_ICON[n.type]||'🔔'} ${esc(n.title)}</strong><span>${esc(n.body||'')}</span>`;
  el.onclick=()=>{el.remove();notifOpen(n.id);};
  wrap.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>el.remove(),350);
  },9000);
}

// ================================================================
// PUSH (etapa 2, 02/10/2026) — aviso no celular/PC com o app FECHADO.
// Cada aparelho/navegador tem a própria inscrição, guardada no servidor
// por RPC (o client nunca lê as chaves de volta). Quem envia é a Edge
// Function notify-dispatch, disparada pelo banco a cada nova notificação.
// ================================================================
let notifPushState='unknown'; // 'unsupported'|'ios-install'|'blocked'|'off'|'on'|'busy'|'unknown'
let notifVapidKey=null;

function notifIsIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}
function notifIsStandalone(){
  return (window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
}
function notifPushSupported(){
  return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
}
function notifB64ToBytes(b64){
  const raw=atob((b64+'='.repeat((4-b64.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function notifBytesToB64(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
// navigator.serviceWorker.ready nunca resolve se não há SW registrado — não
// deixa o painel nem o logout ficarem pendurados esperando.
function notifSwReady(ms){
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_,rej)=>setTimeout(()=>rej(new Error('service worker indisponível')),ms||4000)),
  ]);
}

// "Ativei push NESTE aparelho com ESTA conta" — por usuário, só no navegador.
// Sem isso, a conta B que entrasse num computador onde a A já liberou as
// notificações passaria a receber os avisos de B sem nunca ter pedido.
function notifPushOptInKey(){return notifUserId?'notifPushOptIn:'+notifUserId:null;}
function notifPushOptIn(){
  try{const k=notifPushOptInKey();return !!k&&localStorage.getItem(k)==='1';}catch(e){return false;}
}
function notifPushSetOptIn(on){
  try{const k=notifPushOptInKey();if(!k)return;on?localStorage.setItem(k,'1'):localStorage.removeItem(k);}catch(e){}
}

async function notifPushRefreshState(){
  if(notifPushState==='busy')return;
  let next;
  // iPhone no Safari comum (fora da Tela de Início): o iOS expõe PushManager mas
  // reporta permission='denied' — não é bloqueio do usuário, é falta de instalar.
  if(notifIsIOS()&&!notifIsStandalone()){
    next='ios-install';
  }else if(!notifPushSupported()){
    next='unsupported';
  }else if(Notification.permission==='denied'){
    next='blocked';
  }else{
    try{
      const reg=await notifSwReady();
      const sub=await reg.pushManager.getSubscription();
      next=(sub&&Notification.permission==='granted'&&notifPushOptIn())?'on':'off';
    }catch(e){next='off';}
  }
  if(next!==notifPushState){notifPushState=next;if(notifPanelOpen)notifRenderPanel();}
}

function notifPushRowHtml(){
  const s=notifPushState;
  if(s==='unknown'||s==='unsupported')return'';
  let txt,btn='';
  if(s==='ios-install'){
    txt='📲 No iPhone, adicione o MyDeck à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá pra receber avisos com o app fechado.';
  }else if(s==='blocked'){
    txt='🔕 Avisos bloqueados neste navegador. Libere nas configurações do site pra receber com o app fechado.';
  }else if(s==='on'){
    txt='📲 Avisos neste aparelho: <strong>ativados</strong>';
    btn='<button type="button" class="notif-push-btn ghost" onclick="notifPushDisable()">Desativar</button>';
  }else if(s==='busy'){
    txt='📲 Aguarde…';
  }else{
    txt='📲 Receba os avisos mesmo com o app fechado';
    btn='<button type="button" class="notif-push-btn" onclick="notifPushEnable()">Ativar neste aparelho</button>';
  }
  return `<div class="notif-push-row"><span>${txt}</span>${btn}</div>`;
}

async function notifFetchVapidKey(){
  if(notifVapidKey)return notifVapidKey;
  const{data,error}=await sbClient.from('app_public_config').select('value').eq('key','vapid_public_key').maybeSingle();
  if(error){console.error('[notif] chave VAPID',error);return null;}
  notifVapidKey=(data&&data.value)||null;
  return notifVapidKey;
}

async function notifPushRegister(sub){
  const p256dh=sub.getKey('p256dh'),auth=sub.getKey('auth');
  if(!p256dh||!auth)throw new Error('inscrição sem chaves');
  const{error}=await sbClient.rpc('register_push_subscription',{
    p_endpoint:sub.endpoint,
    p_p256dh_key:notifBytesToB64(p256dh),
    p_auth_key:notifBytesToB64(auth),
    p_user_agent:navigator.userAgent,
  });
  if(error)throw error;
}

async function notifPushEnable(){
  if(notifPushState==='busy'||!notifPushSupported())return;
  notifPushState='busy';notifRenderPanel();
  try{
    // requestPermission precisa sair DIRETO do clique (nenhum await antes)
    const perm=await Notification.requestPermission();
    if(perm!=='granted'){
      if(perm==='denied')toast('Notificações bloqueadas neste navegador. Libere nas configurações do site.','error');
      return;
    }
    const key=await notifFetchVapidKey();
    if(!key)throw new Error('chave VAPID indisponível');
    const reg=await notifSwReady();
    let sub=await reg.pushManager.getSubscription();
    // inscrição feita com outra chave VAPID (se algum dia as chaves mudarem)
    if(sub&&sub.options&&sub.options.applicationServerKey&&notifBytesToB64(sub.options.applicationServerKey)!==key){
      await sub.unsubscribe();sub=null;
    }
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:notifB64ToBytes(key)});
    await notifPushRegister(sub);
    notifPushSetOptIn(true);
    toast('Avisos ativados neste aparelho 🔔');
  }catch(e){
    console.error('[notif] push enable',e);
    toast('Não consegui ativar os avisos agora. Tente de novo em instantes.','error');
  }finally{
    notifPushState='unknown';
    await notifPushRefreshState();
  }
}

async function notifPushDisable(){
  if(notifPushState==='busy')return;
  notifPushState='busy';notifRenderPanel();
  try{
    notifPushSetOptIn(false);
    const reg=await notifSwReady();
    const sub=await reg.pushManager.getSubscription();
    if(sub){
      try{await sbClient.rpc('unregister_push_subscription',{p_endpoint:sub.endpoint});}catch(e){}
      await sub.unsubscribe();
    }
    toast('Avisos desativados neste aparelho');
  }catch(e){
    console.error('[notif] push disable',e);
    toast('Não consegui desativar agora. Tente de novo.','error');
  }finally{
    notifPushState='unknown';
    await notifPushRefreshState();
  }
}

// Ao entrar: se ESTA conta já ativou push neste aparelho, reafirma a
// inscrição no servidor (idempotente — reaponta o aparelho pra conta certa
// e renova se o navegador trocou o endpoint).
async function notifPushSync(){
  try{
    if(notifPushSupported()&&Notification.permission==='granted'&&notifPushOptIn()){
      const reg=await notifSwReady();
      const sub=await reg.pushManager.getSubscription();
      if(sub)await notifPushRegister(sub);
    }
  }catch(e){console.warn('[notif] push sync',e);}
  notifPushRefreshState();
}

// Ao sair: tira o aparelho desta conta no servidor ANTES do logout (depois
// não há mais sessão pra autorizar a chamada) — senão o próximo a usar o
// aparelho receberia os avisos de quem saiu. A inscrição do navegador fica;
// o opt-in guardado reativa tudo no próximo login desta conta.
async function notifPushUnbind(){
  if(!sbClient||!notifPushSupported()||Notification.permission!=='granted')return;
  const reg=await notifSwReady(1500);
  const sub=await reg.pushManager.getSubscription();
  if(sub)await sbClient.rpc('unregister_push_subscription',{p_endpoint:sub.endpoint});
}
(function hookSignOutPush(){
  function tryHook(){
    if(typeof window.signOut!=='function'){setTimeout(tryHook,50);return;}
    const original=window.signOut;
    window.signOut=async function(){
      try{await notifPushUnbind();}catch(e){console.warn('[notif] push unbind',e);}
      return original.apply(this,arguments);
    };
  }
  tryHook();
})();

// Clique numa notificação do sistema com o app JÁ aberto: o sw.js traz a
// janela pra frente e manda esta mensagem (sem recarregar a página).
async function notifMarkReadById(id){
  if(notifItems.some(n=>n.id===id)){notifMarkRead([id]);return;}
  if(!sbClient)return;
  await sbClient.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id);
  notifLoad();
}
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message',e=>{
    const d=e.data;
    if(!d||d.type!=='notif-click')return;
    if(d.notificationId)notifMarkReadById(d.notificationId);
    const clicked=d.notificationId?notifItems.find(x=>x.id===d.notificationId):null;
    if(clicked&&!d.auctionId){notifRoute(clicked);return;}
    if(d.auctionId){
      if(typeof aucPendingOpenId!=='undefined')aucPendingOpenId=d.auctionId;
      if(typeof goToTab==='function')goToTab('leilao');
    }
  });
}

// ================================================================
// E-MAIL (etapa 3, 02/10/2026) — o envio é feito pela Edge Function
// notify-dispatch (Resend); aqui fica só a preferência do usuário. Sem
// linha em notification_prefs = ligado. O link "desativar avisos por
// e-mail" dos e-mails abre /?notif=prefs, que abre este painel.
// ================================================================
async function notifEmailLoad(){
  if(!sbClient||!notifUserId)return;
  const uidAtStart=notifUserId;
  let{data,error}=await sbClient.from('notification_prefs').select('email_enabled,news_enabled').maybeSingle();
  if(error){ // coluna news_enabled ainda não existe no banco: pelo menos o e-mail
    const r=await sbClient.from('notification_prefs').select('email_enabled').maybeSingle();
    data=r.data;error=r.error;
    if(!error)notifNewsEnabled=null;
  }
  if(uidAtStart!==notifUserId)return;
  if(error){console.warn('[notif] preferência de e-mail',error);return;} // fica sem a linha em vez de mostrar estado falso
  notifEmailEnabled=data?data.email_enabled!==false:true;
  if(!error&&data&&'news_enabled' in data)notifNewsEnabled=data.news_enabled!==false;
  else if(!error&&!data)notifNewsEnabled=true;
  if(notifPanelOpen)notifRenderPanel();
}

function notifEmailRowHtml(){
  if(notifEmailEnabled===null)return'';
  const mail=(typeof currentUser!=='undefined'&&currentUser&&currentUser.email)?currentUser.email:'';
  const who=mail?` (${esc(mail)})`:'';
  return notifEmailEnabled
    ?`<div class="notif-push-row"><span>✉️ Avisos por e-mail${who}: <strong>ativados</strong></span><button type="button" class="notif-push-btn ghost" onclick="notifEmailSet(false)">Desativar</button></div>`
    :`<div class="notif-push-row"><span>✉️ Avisos por e-mail${who}: desativados</span><button type="button" class="notif-push-btn" onclick="notifEmailSet(true)">Ativar</button></div>`;
}

async function notifEmailSet(on){
  if(notifEmailBusy||!sbClient||!notifUserId)return;
  notifEmailBusy=true;
  const prev=notifEmailEnabled;
  notifEmailEnabled=on;               // otimista; volta se o banco recusar
  if(notifPanelOpen)notifRenderPanel();
  const{error}=await sbClient.from('notification_prefs')
    .upsert({user_id:notifUserId,email_enabled:on,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  notifEmailBusy=false;
  if(error){
    console.error('[notif] salvar preferência de e-mail',error);
    notifEmailEnabled=prev;
    toast('Não consegui salvar agora. Tente de novo.','error');
  }else{
    toast(on?'Avisos por e-mail ativados':'Avisos por e-mail desativados');
  }
  if(notifPanelOpen)notifRenderPanel();
}

// Novidades e notícias (etapa 4): liga/desliga sino + push desse tipo.
function notifNewsRowHtml(){
  if(notifNewsEnabled===null)return'';
  return notifNewsEnabled
    ?`<div class="notif-push-row"><span>🆕 Novidades e notícias do MyDeck: <strong>ativadas</strong></span><button type="button" class="notif-push-btn ghost" onclick="notifNewsSet(false)">Desativar</button></div>`
    :`<div class="notif-push-row"><span>🆕 Novidades e notícias do MyDeck: desativadas</span><button type="button" class="notif-push-btn" onclick="notifNewsSet(true)">Ativar</button></div>`;
}

async function notifNewsSet(on){
  if(notifNewsBusy||!sbClient||!notifUserId)return;
  notifNewsBusy=true;
  const prev=notifNewsEnabled;
  notifNewsEnabled=on;
  if(notifPanelOpen)notifRenderPanel();
  const{error}=await sbClient.from('notification_prefs')
    .upsert({user_id:notifUserId,news_enabled:on,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  notifNewsBusy=false;
  if(error){
    console.error('[notif] salvar preferência de novidades',error);
    notifNewsEnabled=prev;
    toast('Não consegui salvar agora. Tente de novo.','error');
  }else{
    toast(on?'Novidades e notícias ativadas':'Novidades e notícias desativadas');
  }
  if(notifPanelOpen)notifRenderPanel();
}

// /?notif=prefs (link do rodapé dos e-mails): abre o painel e limpa o
// parâmetro da URL pra não reabrir a cada recarregamento.
function notifHandlePrefsLink(){
  try{
    const p=new URLSearchParams(window.location.search);
    if(p.get('notif')!=='prefs')return;
    p.delete('notif');
    const q=p.toString();
    history.replaceState(null,'',window.location.pathname+(q?'?'+q:'')+window.location.hash);
    setTimeout(()=>{if(notifUserId&&!notifPanelOpen)notifOpenPanel();},700);
  }catch(e){}
}
