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

const NOTIF_LIMIT=30;
const NOTIF_ICON={auction_outbid:'🔔',auction_closed:'🏁'};

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
  const aid=n.auction_id||(n.data&&n.data.auction_id);
  if(!aid)return;
  // leilao.js abre a carta em renderLeilaoTab() → scrollToSharedAuction()
  if(typeof aucPendingOpenId!=='undefined')aucPendingOpenId=aid;
  if(typeof goToTab==='function')goToTab('leilao');
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
    :`<div class="notif-empty">Nenhuma notificação ainda.<br>Você será avisado aqui quando um lance seu for coberto ou um leilão em que participou encerrar.</div>`;
  panel.innerHTML=`
    <div class="notif-panel-head">
      <span>Notificações</span>
      <button type="button" class="notif-markall" onclick="notifMarkAllRead()"${notifUnread?'':' disabled'}>Marcar todas como lidas</button>
    </div>
    <div class="notif-list">${items}</div>`;
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
  if((wrap&&wrap.contains(e.target))||(panel&&panel.contains(e.target)))return;
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
