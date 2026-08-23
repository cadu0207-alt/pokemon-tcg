// ================================================================
// Pokémon TCG Dashboard — app.js v4 (multi-user + Google Auth)
// ================================================================
const SUPABASE_URL='https://dvkiodmhtzlkvmyyzelx.supabase.co';
const SUPABASE_KEY='sb_publishable_f4d1JHAzTWPWYAI0Vm6aRA_NwM-uzr3';

// Supabase JS client (CDN carregado antes deste script em index.html)
if(!window.supabase){
  console.error('❌ Supabase CDN não carregou — verifique conexão ou bloqueador de scripts');
}
const sbClient=window.supabase ? window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY) : null;
let currentUser=null;

// 21/08/2026 — movida pro topo do arquivo (era declarada perto de updateHsub(),
// lá embaixo). updateHsub() é chamada logo no carregamento da home (init()
// roda imediatamente, antes do script terminar de rodar até aquele ponto) —
// como MAX_HSUB_SETS era `const` declarada bem mais abaixo, toda chamada
// inicial de updateHsub() (e também as chamadas via renderTabs() depois)
// caía num "Cannot access 'MAX_HSUB_SETS' before initialization" (temporal
// dead zone do JS) e quebrava silenciosamente. Isso travava updateHsub() —
// a função que decide quais sets aparecem disponíveis vs "Em Breve" na
// home — sempre no estado padrão, mesmo com os dados certos disponíveis.
const MAX_HSUB_SETS=4;

// Escapa texto livre digitado pelo usuário (ex: nome de produto em compras)
// antes de injetar em innerHTML — evita XSS caso o campo contenha <script>,
// onerror=, etc. Usar sempre que um campo de texto livre for renderizado.
function esc(str){
  if(str===null||str===undefined)return'';
  return String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── TOAST GLOBAL (sucesso/erro/info) ─────────────────────────────
// Uso: toast('Compra salva!') · toast('Preço inválido','error') · toast('...','info')
function toast(msg,type='success'){
  let wrap=document.getElementById('md-toast-wrap');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='md-toast-wrap';
    wrap.setAttribute('aria-live','polite');
    document.body.appendChild(wrap);
  }
  const el=document.createElement('div');
  el.className='md-toast md-toast-'+type;
  el.setAttribute('role','status');
  el.textContent=msg;
  wrap.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>el.remove(),350);
  },3200);
}

// ── MODO COMPARTILHAMENTO (link público / QR code) ────────────────
// Se a URL tiver ?share=<token>, o visitante entra direto no fichário
// compartilhado, sem precisar de login — somente leitura.
let shareMode=false, shareToken=null;
(function(){
  const qp=new URLSearchParams(location.search);
  const t=qp.get('share');
  if(t){shareMode=true;shareToken=t;}
})();

// ── ROTEAMENTO POR HASH (13/08/2026) ───────────────────────────────
// Antes, toda navegação (go()/switchSet()) só trocava classes .active no
// DOM — a URL nunca mudava. Resultado: impossível compartilhar link direto
// pra uma aba (#preco, #cartas...) ou pra um fichário específico dentro de
// Fichário (#fichario/me04, #fichario/__cb__<id>), e o botão voltar do
// navegador não fazia nada. go() escreve o hash da aba (pushState — cada
// troca de aba vira uma entrada no histórico); switchSet() escreve o hash
// do fichário ativo (replaceState — trocar de fichário não empilha
// histórico, senão o botão voltar vira uma lista de binders visitados).
// _routingFromHash evita que routeFromHash() reescreva o hash que ela
// mesma acabou de ler (senão pushState empilharia de novo em loop).
let _routingFromHash=false;
function routeFromHash(){
  if(shareMode) return; // link público (?share=) tem seu próprio fluxo — ver loadSharedBinder()
  const h=(location.hash||'').replace(/^#/,'');
  if(!h) return;
  const[tabId,setId]=h.split('/');
  const el=document.getElementById('nav-tab-'+tabId);
  if(!el) return; // hash inválido/antigo — fica no Dashboard (aba padrão)
  _routingFromHash=true;
  go(tabId,el);
  if(tabId==='fichario' && setId) switchSet(decodeURIComponent(setId));
  _routingFromHash=false;
}
window.addEventListener('popstate',routeFromHash);

// ── AUTH ────────────────────────────────────────────────────────
function uid(){return currentUser?.id||null;}

async function signInGoogle(){
  await sbClient.auth.signInWithOAuth({
    provider:'google',
    options:{redirectTo:window.location.href.split('?')[0].split('#')[0]}
  });
}
async function signOut(){
  await sbClient.auth.signOut();
  currentUser=null;
  _showAuth(true);
}

// ── LOGIN/CADASTRO POR EMAIL+SENHA (18/08/2026) ────────────────────
// Antes só existia "Entrar com Google" — pedido: oferecer também
// cadastro tradicional (email/senha/usuário), com aceite explícito de
// termos de uso + política de privacidade, igual concorrência.
function authSwitchTab(tab){
  const tabLogin=document.getElementById('auth-tab-login'), tabSignup=document.getElementById('auth-tab-signup');
  const formLogin=document.getElementById('auth-form-login'), formSignup=document.getElementById('auth-form-signup');
  const msg=document.getElementById('auth-msg'); if(msg) msg.style.display='none';
  const isLogin=tab==='login';
  if(tabLogin){tabLogin.style.background=isLogin?'#e63946':'transparent';tabLogin.style.color=isLogin?'#fff':'#9aa0b8';}
  if(tabSignup){tabSignup.style.background=!isLogin?'#e63946':'transparent';tabSignup.style.color=!isLogin?'#fff':'#9aa0b8';}
  if(formLogin) formLogin.style.display=isLogin?'flex':'none';
  if(formSignup) formSignup.style.display=!isLogin?'flex':'none';
}
window.authSwitchTab=authSwitchTab;

function authTogglePw(id,btn){
  const inp=document.getElementById(id);
  if(!inp) return;
  const show=inp.type==='password';
  inp.type=show?'text':'password';
  if(btn) btn.textContent=show?'🙈':'👁';
}
window.authTogglePw=authTogglePw;

function _authMsg(text,type){
  const el=document.getElementById('auth-msg');
  if(!el) return;
  el.textContent=text;
  el.style.display='block';
  el.style.background=type==='error'?'rgba(230,57,70,.14)':'rgba(6,214,160,.14)';
  el.style.color=type==='error'?'#ff8a94':'#6ee7c2';
  el.style.border=`1px solid ${type==='error'?'rgba(230,57,70,.3)':'rgba(6,214,160,.3)'}`;
}

async function doSignInEmail(){
  const email=(document.getElementById('auth-login-email')?.value||'').trim();
  const password=document.getElementById('auth-login-password')?.value||'';
  if(!email||!password){_authMsg('Preencha email e senha.','error');return;}
  const btn=document.querySelector('#auth-form-login .auth-submit');
  if(btn){btn.disabled=true;btn.textContent='Entrando...';}
  const{error}=await sbClient.auth.signInWithPassword({email,password});
  if(btn){btn.disabled=false;btn.textContent='Entrar';}
  if(error){
    _authMsg(error.message.includes('Invalid login credentials')?'Email ou senha incorretos.':error.message,'error');
    return;
  }
  // onAuthStateChange cuida de fechar o overlay e carregar os dados
}
window.doSignInEmail=doSignInEmail;

async function doSignUpEmail(){
  const email=(document.getElementById('auth-signup-email')?.value||'').trim();
  const username=(document.getElementById('auth-signup-username')?.value||'').trim();
  const password=document.getElementById('auth-signup-password')?.value||'';
  const password2=document.getElementById('auth-signup-password2')?.value||'';
  const age=document.getElementById('auth-signup-age')?.checked;
  const terms=document.getElementById('auth-signup-terms')?.checked;

  if(!email||!username||!password||!password2){_authMsg('Preencha todos os campos.','error');return;}
  if(username.length<3){_authMsg('Nome de usuário precisa ter pelo menos 3 caracteres.','error');return;}
  if(password.length<6){_authMsg('A senha precisa ter pelo menos 6 caracteres.','error');return;}
  if(password!==password2){_authMsg('As senhas não coincidem.','error');return;}
  if(!age){_authMsg('É necessário declarar que você é maior de 18 anos.','error');return;}
  if(!terms){_authMsg('É necessário aceitar os Termos de Uso e a Política de Privacidade.','error');return;}

  const btn=document.querySelector('#auth-form-signup .auth-submit');
  if(btn){btn.disabled=true;btn.textContent='Cadastrando...';}
  const{data,error}=await sbClient.auth.signUp({
    email,password,
    options:{
      data:{username,full_name:username,terms_accepted_at:new Date().toISOString(),terms_version:'v1'},
      emailRedirectTo:window.location.href.split('?')[0].split('#')[0]
    }
  });
  if(btn){btn.disabled=false;btn.textContent='🐾 Cadastrar';}
  if(error){
    _authMsg(error.message.includes('already registered')||error.message.includes('already exists')?'Esse email já tem uma conta cadastrada.':error.message,'error');
    return;
  }
  // Supabase, por padrão, exige confirmação de email antes de liberar a sessão
  // (data.session vem null nesse caso) — se emailConfirm estiver desligado no
  // projeto, a sessão já vem pronta e onAuthStateChange loga direto.
  if(data?.session){
    _authMsg('Conta criada! Entrando...','success');
  }else{
    _authMsg('Conta criada! Confira seu email para confirmar o cadastro antes de entrar.','success');
  }
}
window.doSignUpEmail=doSignUpEmail;

async function authForgotPassword(){
  const email=(document.getElementById('auth-login-email')?.value||'').trim();
  if(!email){_authMsg('Digite seu email no campo acima e clique em "Esqueci minha senha" de novo.','error');return;}
  const{error}=await sbClient.auth.resetPasswordForEmail(email,{
    redirectTo:window.location.href.split('?')[0].split('#')[0]
  });
  if(error){_authMsg(error.message,'error');return;}
  _authMsg('Enviamos um link de redefinição de senha pro seu email.','success');
}
window.authForgotPassword=authForgotPassword;

function _showAuth(show){
  const ov=document.getElementById('auth-overlay');
  if(ov) ov.style.display=show?'flex':'none';
}
function _updateUserChip(user){
  const chip=document.getElementById('user-chip');
  if(!chip) return;
  chip.style.display=user?'flex':'none';
  if(!user) return;
  const m=user.user_metadata||{};
  const av=document.getElementById('user-avatar');
  const nm=document.getElementById('user-display-name');
  if(av) av.src=m.avatar_url||m.picture||'';
  // CORRIGIDO 18/08/2026: contas criadas por email/senha não têm avatar_url/
  // full_name do Google — usam m.username (definido no cadastro) como nome
  // de exibição, com fallback pro email caso nem isso exista.
  if(nm) nm.textContent=(m.full_name||m.name||m.username||user.email||'').split(' ')[0];
}

// Escuta mudanças de sessão (login/logout/refresh)
if(sbClient){
  sbClient.auth.onAuthStateChange((_event,session)=>{
    if(shareMode) return; // visitante de link compartilhado: não mexe na tela de login
    currentUser=session?.user??null;
    _updateUserChip(currentUser);
    if(currentUser){
      _showAuth(false);
      // TOKEN_REFRESHED (20/08/2026): o Supabase renova o JWT sozinho de tempo
      // em tempo (a cada ~1h de sessão aberta) e dispara esse mesmo evento —
      // sem isso, loadAll() rodava de novo a cada renovação e re-renderizava
      // a tela inteira (Dashboard, Fichário, gráficos...) do nada, mesmo sem
      // nenhum dado ter mudado no Supabase. Parecia a página "atualizando
      // sozinha" enquanto o usuário só estava com a aba aberta. Só recarrega
      // dados em eventos que de fato significam login novo/trocado.
      if(_event==='TOKEN_REFRESHED') return;
      // Só carrega dados se o DOM estiver pronto
      if(document.readyState==='complete'||document.readyState==='interactive'){
        loadAll();
      }else{
        document.addEventListener('DOMContentLoaded',()=>loadAll());
      }
    }else{
      _showAuth(true);
    }
  });
} else {
  // sbClient nulo = CDN da Supabase não carregou (rede, bloqueador de scripts, CDN fora do ar).
  // Sem isso, o resto do app.js quebrava silenciosamente e a tela ficava em branco.
  // Ver ANALISE_GERAL_15jul2026.md item 1.3.
  document.addEventListener('DOMContentLoaded',()=>{
    const b=document.createElement('div');
    b.style.cssText='position:fixed;inset:0;z-index:99999;background:#050609;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:sans-serif;text-align:center;padding:24px';
    b.innerHTML='<div style="font-size:40px">⚠️</div>'+
      '<div style="font-size:18px;font-weight:600">Não foi possível conectar ao MyDeck</div>'+
      '<div style="font-size:13px;color:#9aa">O serviço de dados (Supabase) não carregou. Verifique sua conexão ou desative bloqueadores de script e recarregue a página.</div>'+
      '<button onclick="location.reload()" style="margin-top:8px;padding:10px 20px;background:#e63946;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">Recarregar</button>';
    document.body.appendChild(b);
  });
}

// ── IMAGENS ──────────────────────────────────────────────────────
function imgMe04(n){return`https://images.scrydex.com/pokemon/me4-${parseInt(n)}/large`;}
function imgMe03(n){return`https://images.scrydex.com/pokemon/me3-${parseInt(n)}/large`;}
function imgMe02(n){return`https://images.scrydex.com/pokemon/me2-${parseInt(n)}/large`;}
function imgMe05(n){return`https://images.scrydex.com/pokemon/me5-${parseInt(n)}/large`;}
function imgMe06(n){return`https://images.scrydex.com/pokemon/me6-${parseInt(n)}/large`;}
// me2pt5: slug confirmado direto na resposta da api.pokemontcg.io (campo images.large
// de cada carta), diferente do padrão "me5-N" dos outros ME — aqui é "me2pt5-N" mesmo.
function imgMe2pt5(n){return`https://images.scrydex.com/pokemon/me2pt5-${parseInt(n)}/large`;}
function imgMeg(n) {return`https://images.scrydex.com/pokemon/me1-${parseInt(n)}/large`;}
// LOGO DA COLEÇÃO (12/08/2026) — pedido do Eduardo: mostrar a arte oficial de
// cada set em vez do código (ME06/SV10/etc). Confirmado na doc pública da
// Scrydex (scrydex.com/docs/pokemon/expansions) que o logo sempre segue esse
// padrão fixo: https://images.scrydex.com/pokemon/{expansion-id}-logo/logo
// Bate 100% com o id interno do SET_CATALOG/LEGACY_SETS PRA QUASE TUDO — SV,
// SWSH, SM, XY, BW, HGSS, DP, EX, clássicos. EXCEÇÃO: os sets ME02–ME06/MEG
// (esses SIM têm id de expansion diferente do id interno do site — o mesmo
// motivo pelo qual imgMe04/imgMe03/imgMe02/imgMe05/imgMe06/imgMeg acima usam
// "me4"/"me3"/"me2"/"me5"/"me6"/"me1" em vez de "me04"/"me03"/"me02"/"me05"/
// "me06"/"meg"). CORRIGIDO 12/08/2026: a primeira versão desta função ignorou
// essa exceção e usava o id interno puro — resultado: essas 6 coleções
// carregavam um logo genérico "Pokémon TCG" (a Scrydex responde 200 com uma
// arte placeholder pra id de expansion que não existe, em vez de 404, então
// o <img onerror> nunca disparava pra pegar o emoji de fallback). ME2PT5 e
// MEP não entram na exceção — o id interno já bate com o da Scrydex nesses
// dois.
const SET_LOGO_ID_OVERRIDES={me06:'me6',me05:'me5',me04:'me4',me03:'me3',me02:'me2',meg:'me1'};
function imgSetLogo(id){
  const sid=SET_LOGO_ID_OVERRIDES[id]||id;
  return`https://images.scrydex.com/pokemon/${sid}-logo/logo`;
}
// Overrides pra cartas MEP que o pkmncards.com (URL genérica abaixo) não tem —
// achadas individualmente em 16/07/2026 checando site por site (pkmncards não
// cataloga essas ainda, provavelmente por serem promos muito recentes/exclusivas).
// 26 vêm do CDN oficial assets.pokemon.com (mesmo padrão MEP_EN_{n}.png),
// 17 vêm do CDN da tcgcollector.com (sem padrão previsível, URL direta por carta).
// Ver [[project_pokemon_tcg]] antes de mexer aqui de novo.
const MEP_IMG_OVERRIDE={
  46:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_46.png',
  47:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_47.png',
  48:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_48.png',
  49:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_49.png',
  50:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_50.png',
  51:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_51.png',
  52:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_52.png',
  53:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_53.png',
  54:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_54.png',
  72:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_72.png',
  73:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_73.png',
  82:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_82.png',
  83:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_83.png',
  84:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_84.png',
  85:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_85.png',
  94:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_94.png',
  95:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_95.png',
  99:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_99.png',
  100:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_100.png',
  101:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_101.png',
  102:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_102.png',
  103:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_103.png',
  107:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_107.png',
  108:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_108.png',
  109:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_109.png',
  110:'https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/MEP_EN_110.png',
  55:'https://static.tcgcollector.com/content/images/41/3f/aa/413faa60dd1079901a094874a37d5987b54384788ca8bd7e0f3a675ba4c80211.webp',
  56:'https://static.tcgcollector.com/content/images/b3/7d/94/b37d941db9cd1b81f16f5093b4d60e6b2af13b8f3ded3b9fd384ce42a91acda1.webp',
  57:'https://static.tcgcollector.com/content/images/20/eb/70/20eb70a81fda26eaac3d3e3a8467f8d48cbe0898d8c023ffbd18767accc0a07c.webp',
  58:'https://static.tcgcollector.com/content/images/78/0f/1b/780f1b1c27872aec47e1901b9e6e4047eb476cb408067985ad4640079d18df5f.webp',
  59:'https://static.tcgcollector.com/content/images/e4/67/51/e467512598b5cee7292960177c6ebc12e77f3d6ab9115c0952ec8c1ad0b6edbf.webp',
  60:'https://static.tcgcollector.com/content/images/c8/ff/1c/c8ff1c16ac373a3fa139bb8f5e4c4c22e458727f2d4c1f770025f7a11e62f607.webp',
  61:'https://static.tcgcollector.com/content/images/28/d4/c6/28d4c6dbadee916c1185122e4ce96b1a5584452e0e85495c133dfc9f015ba6e7.webp',
  62:'https://static.tcgcollector.com/content/images/cc/6a/33/cc6a33efa2a8cf3394f2ee7df6b6122306a53163d54e03ba6712f17856bb658c.webp',
  63:'https://static.tcgcollector.com/content/images/08/74/d6/0874d67be78a4bd9825e4edc88000836a3b9c28417efbc04d0a2dadf5e48f668.webp',
  92:'https://static.tcgcollector.com/content/images/a9/71/cb/a971cba625db58900669cd9cce483a9e9c4ed889ab200d40fcdfde03ca0447e9.webp',
  93:'https://static.tcgcollector.com/content/images/9d/b7/a5/9db7a51af4c729807c969548f74034fa809f38b3bb58c378b404f119b23bbc08.webp',
  96:'https://static.tcgcollector.com/content/images/51/e2/8b/51e28b591884a949c45459931bad3405f7d731cda135b53dbb361a3ea6351a1c.webp',
  97:'https://static.tcgcollector.com/content/images/ec/48/28/ec48286e43c64c66bab7d33617f92656fc5bc7e40b5caaca383ee44488a22629.webp',
  98:'https://static.tcgcollector.com/content/images/8b/65/63/8b6563570443b1595d5103d47d83fdc69ad1248b47fbd8919d51ea364bc6b78b.webp',
  104:'https://static.tcgcollector.com/content/images/86/90/08/869008497cda2dd5466d528b92c4f7f90279ea54a241529cf68241074c18f06b.webp',
  105:'https://static.tcgcollector.com/content/images/32/03/19/320319115a12af25e9feea99f189423f73972410ee301c3c0a18298c65837666.webp',
  106:'https://static.tcgcollector.com/content/images/55/47/48/554748fad514a556add0c8180b9eb1a423ff876ab7440b93d0115f75bb4c348f.webp',
};

function imgMep(n) {
  const num=parseInt(n);
  // 140 (Snover IR) é entrada duplicada — a carta real já existe em cards_meg.js
  // com imagem funcionando via Scrydex (me1-140). Redireciona pra lá em vez de
  // procurar imagem própria pro "mep:140" que não existe de verdade.
  if(num===140) return imgMeg(140);
  if(MEP_IMG_OVERRIDE[num]) return MEP_IMG_OVERRIDE[num];
  // pkmncards.com tem a maioria das imagens MEP com URL previsível
  // formato: mebsp_en_{número_com_zeros}_std.jpg
  const pad=String(num).padStart(3,'0');
  return`https://pkmncards.com/wp-content/uploads/mebsp_en_${pad}_std.jpg`;
}

function getPurchaseImg(product){
  const p=product.toLowerCase();
  if(p.includes('me06')||p.includes('esmeralda')||p.includes('storm'))  return imgMe06(1);
  if(p.includes('me05')||p.includes('negrura')||p.includes('pitch'))    return imgMe05(61);
  if(p.includes('me04')||p.includes('caos')||p.includes('chaos'))       return p.includes('quádr')||p.includes('quadr')?imgMe04(15):imgMe04(22);
  if(p.includes('me03')||p.includes('ordem')||p.includes('perfect'))    return imgMe03(63);
  if(p.includes('me02')||p.includes('fogo')||p.includes('phantasmal'))  return imgMe02(13);
  if((p.includes('meg')||p.includes('me01'))&&!p.includes('me04'))      return imgMeg(3);
  if(p.includes('parceiros')||p.includes('partner')||p.includes('mep')) return imgMep(38);
  return imgMe04(22);
}

function getCardImg(card){
  const num=(card.num||'').match(/(\d+)/);
  if(!num) return null;
  const n=num[1];const lote=(card.lote||'').toLowerCase();const ns=card.num||'';
  if(lote.includes('me06')||lote.includes('esmeralda')||lote.includes('storm'))  return imgMe06(n);
  if(lote.includes('me05')||lote.includes('negrura')||lote.includes('pitch'))    return imgMe05(n);
  if(lote.includes('me03')||lote.includes('ordem')||lote.includes('perfect'))    return imgMe03(n);
  if(lote.includes('me02')||lote.includes('phantasmal')||lote.includes('fogo'))  return imgMe02(n);
  if(lote.includes('meg')||lote.includes('me01')||ns.includes('/132'))           return imgMeg(n);
  if(lote.includes('mep')||lote.includes('parceiros')||lote.includes('partner')) return imgMep(n);
  if(lote.includes('me04')||lote.includes('caos')||lote.includes('chaos'))       return imgMe04(n);
  return imgMe04(Math.min(parseInt(n)||1,122));
}

// Cadeia de fallback de imagem: quando o CDN principal (scrydex) ainda não tem
// a carta (comum em sets recém-lançados, ex. ME05 Escuridão Absoluta em jul/2026,
// ou promos MEP), tenta o CDN alternativo (tcgdex) antes de esconder a imagem.
function imgAltUrl(setId,n){
  const num=parseInt(n,10);const safe=isNaN(num)?n:num;
  const map={
    // não confirmado se tcgdex já cataloga este set sob este slug — best-effort
    me2pt5:`https://assets.tcgdex.net/en/me/me2pt5/${safe}/high.png`,
    me05:`https://assets.tcgdex.net/en/me/me05/${safe}/high.png`,
    me06:`https://assets.tcgdex.net/en/me/me06/${safe}/high.png`,
    me04:`https://assets.tcgdex.net/en/me/me04/${safe}/high.png`,
    me03:`https://assets.tcgdex.net/en/me/me03/${safe}/high.png`,
    me02:`https://assets.tcgdex.net/en/me/me02/${safe}/high.png`,
    meg: `https://assets.tcgdex.net/en/me/me01/${safe}/high.png`,
    mep: `https://assets.tcgdex.net/en/me/mep/${safe}/high.png`,
  };
  return map[setId]||null;
}
// Handler global reusado nos onerror de <img> do fichário — tenta o CDN alternativo
// uma única vez (via data-img-try) e só então cai no placeholder "sem imagem".
// PERF 03/08/2026 (auditoria): versão thumbnail de qualquer URL de carta.
// Grids/listas usam /small do scrydex (~10x mais leve que /large); modal e zoom
// continuam com /large. pokemontcg.io já serve o tamanho pequeno por padrão.
function imgThumb(url){
  if(typeof url!=='string')return url;
  if(url.includes('images.scrydex.com'))return url.replace(/\/large$/,'/small');
  return url;
}
// PERF 18/08/2026: variante intermediária pra impressão/PDF — /small (~55KB)
// fica granulado demais quando impresso em 63x88mm; /large (~680KB) é peso
// desnecessário pra isso. /medium (~90KB) é o meio-termo, só pro fichário
// virar PDF/impresso — grids continuam em /small.
function imgMedium(url){
  if(typeof url!=='string')return url;
  if(url.includes('images.scrydex.com'))return url.replace(/\/large$/,'/medium');
  return url;
}
function handleCardImgError(img,setId,n){
  if(img.dataset.imgTry!=='1'){
    const alt=imgAltUrl(setId,n);
    if(alt){img.dataset.imgTry='1';img.src=alt;return;}
  }
  img.style.display='none';
  if(img.nextElementSibling)img.nextElementSibling.style.display='flex';
}
function getBinderImg(c,setId){
  const n=parseInt(c.n);
  if(setId==='me2pt5') return imgMe2pt5(n);
  if(setId==='me06') return imgMe06(n);
  if(setId==='me05') return imgMe05(n);
  if(setId==='me03') return imgMe03(n);
  if(setId==='me02') return imgMe02(n);
  if(setId==='meg')  return imgMeg(n);
  if(setId==='mep')  return imgMep(n);
  // svp usa o fallback genérico sv* logo abaixo (pokemontcg.io CDN)
  if(setId==='me04') return imgMe04(n);
  // Raio Preto (Black Bolt) e Fogo Branco (White Flare) — EV10.5, jul/2025.
  // Adicionados 19/08/2026 (indicação de usuário). IDs oficiais pokemontcg.io
  // (zsv10pt5/rsv10pt5) não começam com "sv" — não caem no fallback genérico
  // abaixo, por isso entram explicitamente aqui antes dele.
  if(setId==='zsv10pt5'||setId==='rsv10pt5'){
    const num=isNaN(n)?c.n:n;
    return `https://images.pokemontcg.io/${setId}/${num}.png`;
  }
  // Sets Escarlate e Violeta — imagens via pokemontcg.io CDN (público)
  // Usa número sem zero à esquerda (padrão do CDN) ou o valor original para cartas especiais (TG01, ACE01...)
  if(setId.startsWith('sv')||setId==='pgo'||(window.LEGACY_SETS||[]).some(s=>s.id===setId)){
    const num=isNaN(n)?c.n:n;
    // FIX 18/08/2026: "Celebrations: Classic Collection" (cel25c) é um caso
    // especial no pokemontcg.io — cada card real tem id tipo "cel25c-4_A"
    // (ou _A1.._A4 pras variantes de arte de algumas cartas), e o arquivo de
    // imagem segue esse mesmo sufixo (".../cel25c/4_A.png"). Sem o "_A" a
    // URL dá 404 pra TODAS as 25 cartas do set (reportado no console: 51+
    // erros 404 em cel25c/*.png). Confirmado direto na API oficial.
    if(setId==='cel25c') return `https://images.pokemontcg.io/${setId}/${num}_A.png`;
    return `https://images.pokemontcg.io/${setId}/${num}.png`;
  }
  return imgMe04(n);
}

// ── CÂMBIO ──────────────────────────────────────────────────────
let USD_BRL=5.70,EUR_BRL=6.30;
async function fetchCambio(){
  try{
    const[ur,er]=await Promise.all([
      fetch('https://open.er-api.com/v6/latest/USD'),
      fetch('https://open.er-api.com/v6/latest/EUR')
    ]);
    const[ud,ed]=await Promise.all([ur.json(),er.json()]);
    USD_BRL=ud.rates.BRL;EUR_BRL=ed.rates.BRL;
    const el=document.getElementById('usd-brl');
    if(el)el.textContent=`USD/BRL R$${USD_BRL.toFixed(2)}`;
  }catch(e){}
}
// Câmbio ficava travado no valor do momento do login — se a aba fica aberta
// por horas o R$/USD exibido e usado no EV envelhece. Atualiza sozinho.
setInterval(()=>{ if(document.visibilityState==='visible') fetchCambio(); }, 30*60*1000);

// ── PREÇOS AO VIVO (TCGDex — CardMarket EUR + TCGPlayer USD) ─────
const TCGDX={
  me04:'me04',me03:'me03',me02:'me02',meg:'me01',mep:'mep',
  sv1:'sv1',sv2:'sv2',sv3:'sv3',sv3pt5:'sv3pt5',sv4:'sv4',sv4pt5:'sv4pt5',
  sv5:'sv5',sv6:'sv6',sv6pt5:'sv6pt5',sv7:'sv7',sv8:'sv8',sv8pt5:'sv8pt5',
  sv9:'sv9',sv10:'sv10',
  // Raio Preto/Fogo Branco — id tcgdex ainda não confirmado manualmente —
  // deixado best-effort (mesmo id do pokemontcg.io) — se não bater, o fetch
  // simplesmente falha em silêncio (try/catch) e o preço estático continua valendo.
  zsv10pt5:'zsv10pt5',rsv10pt5:'rsv10pt5'
};
const LP_KEY='lp_v2',LP_TTL=24*3600*1000;
const _lp={};  // {setId: {cardN: {eur:float|null, usd:float|null}}}

async function fetchLivePrices(setId,cards){
  const tid=TCGDX[setId];if(!tid)return;
  // Tenta cache local (24h)
  try{
    const raw=localStorage.getItem(LP_KEY+'_'+setId);
    if(raw){const{ts,p}=JSON.parse(raw);if(Date.now()-ts<LP_TTL){_lp[setId]=p;renderBinder();return;}}
  }catch(e){}
  // Apenas cards valiosos (>R$5) para minimizar chamadas API
  const val=cards.filter(c=>(c.price||0)>5);
  const ps={};const B=8;
  for(let i=0;i<val.length;i+=B){
    await Promise.all(val.slice(i,i+B).map(async c=>{
      try{
        const r=await fetch(`https://api.tcgdex.net/v2/en/cards/${tid}-${c.n}`);
        if(!r.ok)return;const d=await r.json();
        const eu=d.pricing?.cardmarket?.trend||null;
        const us=d.pricing?.tcgplayer?.holofoil?.marketPrice||null;
        if(eu!=null||us!=null)ps[c.n]={eur:eu?eu*EUR_BRL:null,usd:us?us*USD_BRL:null};
      }catch(e){}
    }));
  }
  _lp[setId]=ps;
  try{localStorage.setItem(LP_KEY+'_'+setId,JSON.stringify({ts:Date.now(),p:ps}));}catch(e){}
  renderBinder();
  _updateModalPrice();
}

// Atualiza preço no modal se estiver aberto quando os preços ao vivo chegarem
let _modalCard=null,_modalSet=null;
function _updateModalPrice(){
  const sub=document.querySelector('#mbinder-content .mbinder-sub');
  if(!sub||!_modalCard||!_modalSet)return;
  const dp=lprice(_modalSet,_modalCard.n,_modalCard.price);
  const live=!!_lp[_modalSet]?.[_modalCard.n];
  sub.innerHTML=`#${_modalCard.n} · ${_modalCard.type||''} · ${_modalCard.rare||''} ${dp?`· R$${fmtR(dp)}${live?' <span style="color:var(--teal);font-size:10px">● ao vivo</span>':''}`:''}`;
}

// Média das 3 fontes: CardMarket BRL, TCGPlayer BRL, preço hardcoded BRL
function lprice(setId,n,fallback){
  // REGRA (jul/2026): o campo price dos cards_*.js é o preço BR praticado (menor
  // preço Liga Pokémon). O mercado BR é MAIS caro que US/EU convertido para chases,
  // então NUNCA rebaixar o estático com médias internacionais (o antigo ×0.67
  // derrubava Greninja Gold de R$939 para ~R$155).
  if(fallback&&fallback>0)return fallback;
  // Sem preço estático → usa internacional convertido como estimativa
  const p=_lp[setId]?.[n];
  if(!p)return fallback;
  const v=p.usd||p.eur;
  return v?+v.toFixed(2):fallback;
}

// ── ESTADO ──────────────────────────────────────────────────────
let purchases=[],pulledCards=[],collected=new Set(),collectedQty=new Map(),valueHistory=[],cardListings=[],buyOrders=[];

// ── VERSÕES ──────────────────────────────────────────────────────
// CORRIGIDO 18/08/2026: N era #c8cfe8, quase igual a var(--border) — ver
// mesma correção em VERSIONS (fichario_patch.js).
const VER_COLOR={N:'#7c5cff',F:'#118ab2',RH:'#06d6a0',SP:'#ff6b35'};
const VER_LABEL={N:'Normal',F:'Foil',RH:'Reverse Holo',SP:'Especial'};
const VER_SHORT={N:'N',F:'F',RH:'RH',SP:'★'};

function getSlots(c,setId){
  const r=c.rare||'';
  if(!c.base) return [{ver:'SP',price:c.price}];
  if(r.includes('Dupla')||r.includes('RR')) return [{ver:'F',price:c.price}];
  // Raridade "Rara" nos sets modernos (ME/SV): a impressão padrão já nasce holo,
  // mas mantemos o slot "N" mesmo assim — remover ele em 09/07/2026 órfãou os
  // registros já coletados de quem tinha marcado a versão N dessas cartas
  // (o app parava de reconhecer o slot e a carta "sumia" do fichário/estatísticas,
  // embora o registro continuasse no Supabase). Ver [[feedback_coding]].
  // CORRIGIDO 24/07/2026: o branch abaixo era `r.startsWith('Rara ')&&!r.includes('Ultra')`
  // — pego geral demais. Até ontem só existiam raridades ME/SV nesse vocabulário
  // (lista abaixo), então funcionava por acidente. Hoje os sets legados (SM/XY/
  // BW/HGSS/DP/EX/Classic) trouxeram dezenas de raridades "Rara X" que NÃO têm
  // reverse-holo físico (GX/EX/V/VMAX/VSTAR, Rainbow, Secreta, Shiny, Incrível,
  // Radiante, BREAK, Prime, Star) — o branch antigo inventava uma 2ª versão (RH)
  // que não existe, inflando o master set com um slot impossível de completar.
  // A lista abaixo trava o comportamento EXATO de antes pros rótulos que já
  // existiam em produção (evita orfanar coleção já marcada — ver
  // [[feedback_coding]]); 'Rara Ultra' fica de fora de propósito, igual sempre
  // esteve (cai no N+RH do final, sem mudança).
  // CORRIGIDO 30/07/2026 (bug relatado pelo Eduardo: "vários fichários de
  // coleções de 2024 pra trás não estão salvando as cartas marcadas") — a
  // condição abaixo (r==='Rara') foi escrita pensando SÓ em sets modernos
  // (ME/SV), onde "Rara" nasce impressa só em holo. Mas nos sets legados
  // (SM/XY/BW/HGSS/DP/EX/Classic) "Rara"/"Rare" é a raridade comum antiga —
  // NÃO nasce holo, tem print Normal + reverse holo igual Comum/Incomum
  // (só "Rara Holo", que é um rótulo DIFERENTE, é que nasce holo mesmo nos
  // sets antigos). Como esta condição batia com r==='Rara' em QUALQUER set,
  // as 2140+ cartas "Rara" dos sets legados (populados 24/07/2026) perderam
  // o slot N do dia pro outro — quem marcava a versão Normal via não via
  // opção nenhuma de N pra clicar (só F/RH), e quem já tinha marcado antes
  // ficou com o registro órfão no Supabase (não deletado, só invisível na
  // tela — mesmo padrão do bug de 13/07 documentado abaixo, só que ao
  // contrário). 'Rara Holo'/'Rara Brilhante'/'Rara Ilustrada'/'Rara
  // Ilustrada Especial' não existem em nenhum set legado (conferido), então
  // continuam holo-only em qualquer set sem risco.
  const isLegacySet=(window.LEGACY_SETS||[]).some(s=>s.id===setId);
  if((r==='Rara'&&!isLegacySet)||r==='Rara Holo'||r==='Rara Brilhante'||r==='Rara Ilustrada'||r==='Rara Ilustrada Especial'){
    // CORRIGIDO 13/07/2026: cartas "Rara"/"Rara Holo" nos sets modernos (ME/SV)
    // nascem impressas SÓ em holo — não existe versão Normal física (conferido
    // contra pokecottage.com: Chesnaught, Ho-Oh, Delphox etc. só têm holo/reverse
    // holo). O slot N antigo inflava o master set com uma versão que não existe.
    // Registros antigos marcados como :N foram migrados para :F no Supabase
    // (ver migracao_rara_holo_n_para_f.sql) antes desta mudança, então nenhuma
    // coleção existente foi perdida. Ver [[feedback_coding]].
    return [
      {ver:'F',price:c.priceF||c.price},
      {ver:'RH',price:c.priceRH||(c.price?+(c.price*1.2).toFixed(2):null)}
    ];
  }
  // NOVO 24/07/2026 — raridades holo-únicas dos sets legados recém-populados
  // (nenhum usuário tinha coleção marcada nesses sets antes de hoje, então não
  // há risco de orfanar registro nenhum ao introduzir esse slot único agora).
  const RARA_HOLO_UNICA_LEGADA=['Rara Holo EX','Rara Holo GX','Rara Holo V','Rara Holo VMAX',
    'Rara Holo VSTAR','Rara Holo LV.X','Rara BREAK','Rara Incrível','Rara Radiante','Rara Rainbow',
    'Rara Secreta','Rara Shiny','Rara Shiny GX','Rara Shiny V','Rara Star','Rara Prime'];
  if(RARA_HOLO_UNICA_LEGADA.includes(r)) return [{ver:'SP',price:c.price}];
  // MEP: só tem IR (SP)
  if(setId==='mep'||setId==='svp') return [{ver:'SP',price:c.price}];
  return [{ver:'N',price:c.price},{ver:'RH',price:c.priceRH||(c.price?+(c.price*1.2).toFixed(2):null)}];
}

function slotKey(pfx,n,ver){return`${pfx}${n}:${ver}`;}
function getVerFromRar(rar){
  if(rar.includes('SAR')||rar.includes('UR')||rar.includes('IR')||rar.includes('Promo')) return 'SP';
  if(rar.includes('RR')||rar.includes('Dupla')||(rar.includes('Holo')&&rar.includes('Rara')&&!rar.includes('RH'))) return 'F';
  if(rar.includes('RH')||rar.includes('Reverse')) return 'RH';
  return 'N';
}

// ── OUTBOX (backup local + auto-sync) — fichário ────────────────────
// 20/08/2026. Quando marcar/desmarcar carta falha por QUEDA DE CONEXÃO
// (não por erro de negócio do banco — RLS, validação etc, esse continua
// revertendo e avisando na hora), guarda a intenção no localStorage em vez
// de desfazer a marcação na tela. Assim que a conexão volta — evento
// 'online' do navegador + retry a cada 20s como reforço, porque nem todo
// navegador/rede dispara 'online' de forma confiável — tenta sincronizar
// sozinho, na ordem em que foi guardado.
// Por que é seguro pra esse caso específico: cada slot_key só tem 2 estados
// (coletado / não coletado) e a gravação é upsert/delete por slot_key — não
// duplica nem interessa em qual ordem várias tentativas cheguem, o
// resultado final converge sempre pro mesmo estado. Esse padrão NÃO foi
// usado no leilão (dar lance) de propósito: lance depende do valor mínimo
// no momento exato e do prazo, guardar e reenviar depois daria uma falsa
// sensação de "já dei o lance" quando ele pode chegar tarde ou inválido —
// lá o certo é erro imediato e claro, como já está.
const MD_OUTBOX_KEY='md_collection_outbox_v1';
function mdOutboxRead(){
  try{return JSON.parse(localStorage.getItem(MD_OUTBOX_KEY)||'{}');}catch(e){return{};}
}
function mdOutboxWrite(ob){
  try{localStorage.setItem(MD_OUTBOX_KEY,JSON.stringify(ob));}catch(e){console.error('[outbox] falha ao salvar localStorage',e);}
}
function mdOutboxSet(slotKey,action){
  const ob=mdOutboxRead();
  ob[slotKey]={action,ts:Date.now()};
  mdOutboxWrite(ob);
}
function mdOutboxClear(slotKey){
  const ob=mdOutboxRead();
  if(ob[slotKey]){delete ob[slotKey];mdOutboxWrite(ob);}
}
function mdOutboxCount(){return Object.keys(mdOutboxRead()).length;}
// Reaplica sobre collected/collectedQty as pendências ainda não
// sincronizadas — chamado logo depois de carregar os dados do servidor em
// loadAll(), senão um card marcado offline "voltaria a desmarcar" na tela
// assim que os dados do servidor (que ainda não têm essa gravação) chegam.
function mdOutboxApplyToLocalState(){
  const ob=mdOutboxRead();
  for(const slotKey in ob){
    if(ob[slotKey].action==='add'){collected.add(slotKey);if(!collectedQty.has(slotKey))collectedQty.set(slotKey,{qty:1,origins:[]});}
    else{collected.delete(slotKey);collectedQty.delete(slotKey);}
  }
}
let mdOutboxSyncing=false;
async function mdOutboxSync(){
  if(mdOutboxSyncing||!sbClient||!uid()) return;
  const ob=mdOutboxRead();
  const keys=Object.keys(ob);
  if(!keys.length) return;
  mdOutboxSyncing=true;
  for(const slotKey of keys){
    const entry=ob[slotKey];
    try{
      let error;
      if(entry.action==='add'){
        ({error}=await sbClient.from('collection').upsert({slot_key:slotKey,user_id:uid(),quantity:1},{onConflict:'user_id,slot_key'}));
      }else{
        ({error}=await sbClient.from('collection').delete().eq('slot_key',slotKey).eq('user_id',uid()));
      }
      if(error){
        // chegou no servidor mas foi rejeitado (erro de negócio) — re-tentar
        // sozinho não resolve, reverte o estado otimista e avisa.
        console.error('[outbox] erro ao sincronizar',slotKey,error);
        mdOutboxClear(slotKey);
        if(entry.action==='add'){collected.delete(slotKey);collectedQty.delete(slotKey);}
        else{collected.add(slotKey);collectedQty.set(slotKey,{qty:1,origins:[]});}
        toast('Não foi possível sincronizar uma carta — revertida','error');
      }else{
        mdOutboxClear(slotKey);
      }
    }catch(e){
      // ainda sem conexão — deixa na fila e para por aqui, tenta tudo de
      // novo na próxima chamada (evento online ou o timer de 20s)
      console.warn('[outbox] ainda sem conexão, mantendo na fila',slotKey,e);
      mdOutboxSyncing=false;
      return;
    }
  }
  mdOutboxSyncing=false;
  renderBinder();updateDashProgress();
  const remaining=mdOutboxCount();
  const dotClass=document.getElementById('status-dot')?.className||'';
  if(remaining===0&&dotClass.includes('dot-warning')){
    setStatus('Online ✓','ok'); // tudo sincronizado, tira o aviso de pendência
  }else if(remaining>0){
    setStatus(`Sincronizando ${remaining} pendência(s)...`,'warning');
  }
}
window.addEventListener('online',()=>{mdOutboxSync();});
setInterval(()=>{if(mdOutboxCount()>0)mdOutboxSync();},20000);

// ── CARREGAR ──────────────────────────────────────────────────────
// Busca todas as linhas de uma query paginando em blocos de 1000 (limite
// padrão de "Max Rows" do PostgREST/Supabase) — sem isso, tabelas com mais
// de 1000 registros (ex: collection de quem já coletou muitas cartas)
// ficam travadas exatamente em 1000 linhas lidas, mesmo com mais no banco.
async function fetchAllRows(queryFactory){
  const pageSize=1000;let from=0;let all=[];
  while(true){
    const{data,error}=await queryFactory().range(from,from+pageSize-1);
    if(error) return{data:null,error};
    all=all.concat(data||[]);
    if(!data||data.length<pageSize) break;
    from+=pageSize;
  }
  return{data:all,error:null};
}
async function loadAll(){
  setStatus('Conectando...','warning');
  if(!uid()){setStatus('Faça login','warning');return;}
  if(!sbClient){
    // Cliente Supabase não inicializou (CDN do supabase-js não carregou pro
    // usuário) — diferencia esse caso no console pra não confundir com
    // instabilidade real do Supabase.
    setStatus('Erro de conexão','error');
    console.error('loadAll: sbClient é null — Supabase CDN não carregou');
    return;
  }
  const myUid=uid();
  // Cada "query" abaixo é uma fábrica (função que retorna a promise), não a
  // promise já disparada — assim dá pra reexecutar só as que falharem, sem
  // repetir as que já deram certo.
  const queryFactories=[
    ()=>sbClient.from('purchases').select('*').eq('user_id',myUid).order('date',{ascending:false}),
    ()=>sbClient.from('pulled_cards').select('*').eq('user_id',myUid).order('id',{ascending:true}),
    ()=>fetchAllRows(()=>sbClient.from('collection').select('slot_key,quantity,origins').eq('user_id',myUid)),
    ()=>sbClient.from('value_history').select('date,total_value').eq('user_id',myUid).order('date',{ascending:true}),
    ()=>sbClient.from('card_listings').select('*').eq('user_id',myUid).order('created_at',{ascending:false}),
    ()=>sbClient.from('buy_orders').select('*').eq('buyer_id',myUid).order('created_at',{ascending:false})
  ];
  const okData=r=>(r.status==='fulfilled'&&!r.value?.error)?(r.value.data||[]):null;
  const isFail=r=>r.status==='rejected'||r.value?.error;
  // Promise.allSettled em vez de Promise.all: se o Supabase estiver
  // instável e só 1 das 6 queries falhar, as outras 5 continuam sendo
  // usadas — antes, qualquer falha isolada derrubava a dashboard inteira
  // com "Erro de conexão", mesmo com o resto dos dados disponível.
  let results=await Promise.allSettled(queryFactories.map(f=>f()));
  // Retry automático: instabilidade do Supabase costuma ser passageira (1-2s),
  // então antes de mostrar dado incompleto pro usuário (ex: "coleção sumiu"),
  // tenta de novo só as queries que falharam, com espera crescente (1.5s,
  // 3s). Assim o usuário só vê o resultado final, quase sempre correto, em
  // vez de um número errado que depois "conserta sozinho" e assusta.
  for(let attempt=1;attempt<=2;attempt++){
    const failedIdx=results.map((r,i)=>isFail(r)?i:-1).filter(i=>i>=0);
    if(!failedIdx.length) break;
    setStatus(`Conectando... (tentativa ${attempt+1})`,'warning');
    await new Promise(r=>setTimeout(r,attempt*1500));
    const retried=await Promise.allSettled(failedIdx.map(i=>queryFactories[i]()));
    failedIdx.forEach((origIdx,j)=>{results[origIdx]=retried[j];});
  }
  const[rp,rc,rcol,rvh,rlst,rbo]=results;
  const failedCount=results.filter(isFail).length;
  const dp=okData(rp),dc=okData(rc),dcol=okData(rcol),dvh=okData(rvh),dlst=okData(rlst),dbo=okData(rbo);
  if(Array.isArray(dp))purchases=dp;
  if(Array.isArray(dc))pulledCards=dc;
  if(Array.isArray(dcol)){
    collected=new Set(dcol.map(r=>r.slot_key));
    collectedQty=new Map(dcol.map(r=>[r.slot_key,{qty:r.quantity||1,origins:r.origins||[]}]));
    // reaplica marcações feitas offline nesta ou numa sessão anterior que
    // ainda não confirmaram no servidor — senão elas "desapareceriam" da
    // tela assim que os dados do servidor (desatualizados) chegam aqui.
    mdOutboxApplyToLocalState();
  }
  if(Array.isArray(dvh))valueHistory=dvh;
  if(Array.isArray(dlst))cardListings=dlst;
  if(Array.isArray(dbo))buyOrders=dbo;
  if(failedCount===results.length){
    // as 6 falharam — sem dados nenhum pra mostrar, aí sim é erro de conexão
    setStatus('Erro de conexão','error');
    console.error('loadAll: todas as queries falharam',results);
    return;
  }
  if(failedCount>0){
    setStatus('Conexão instável','warning');
    console.warn('loadAll: '+failedCount+' de '+results.length+' queries falharam — mostrando dados parciais',results);
  }else{
    setStatus('Online ✓','ok');
  }
  fetchCambio();  // atualiza USD_BRL e EUR_BRL para conversão de preços
  renderAll();updateHomeStats();
  loadCustomBinders();
  renderTabs();
  if(typeof initFichario==='function')initFichario();
  mdOutboxSync(); // tenta sincronizar qualquer pendência de sessão anterior
  // Carrega preços ao vivo para o set inicial
  const{cards:_initCards}=getSetData();
  fetchLivePrices(currentSet,_initCards);
  // Se a URL já chegou com #aba (link compartilhado, recarregou a página,
  // favorito etc.), navega pra ela agora que os dados terminaram de
  // carregar — antes disso o fichário renderizaria sem a coleção do usuário.
  routeFromHash();
}
function setStatus(txt,state){
  const el=document.getElementById('status-txt');if(el)el.textContent=txt;
  const dot=document.getElementById('status-dot');if(dot)dot.className=`dot dot-${state}`;
}

// ── TOGGLE SLOT ──────────────────────────────────────────────────
async function toggleSlot(key){
  if(!uid()) return;
  const wasCollected=collected.has(key);
  const prevEntry=collectedQty.get(key);
  let error=null;
  let networkFailure=false;
  if(wasCollected){
    collected.delete(key);
    collectedQty.delete(key);
  }else{
    collected.add(key);
    collectedQty.set(key,{qty:1,origins:[]});
  }
  try{
    if(wasCollected){
      ({error}=await sbClient.from('collection').delete().eq('slot_key',key).eq('user_id',uid()));
    }else{
      ({error}=await sbClient.from('collection').upsert({slot_key:key,user_id:uid(),quantity:1},{onConflict:'user_id,slot_key'}));
    }
  }catch(e){
    // queda de CONEXÃO (não erro de negócio) — guarda no outbox e mantém o
    // estado otimista na tela em vez de reverter; sincroniza sozinho quando
    // a conexão voltar (ver bloco OUTBOX acima de loadAll()).
    console.warn('Sem conexão ao salvar coleção — guardando pra sincronizar depois:',e);
    networkFailure=true;
  }
  if(networkFailure){
    mdOutboxSet(key,wasCollected?'remove':'add');
    setStatus('Salvando quando a conexão voltar...','warning');
    renderBinder();updateDashProgress();
    return;
  }
  if(error){
    // erro de negócio real (RLS, validação etc — chegou no servidor e foi
    // rejeitado) — aqui sim reverte e avisa, re-tentar sozinho não resolve
    if(wasCollected){collected.add(key);collectedQty.set(key,prevEntry||{qty:1,origins:[]});}else{collected.delete(key);collectedQty.delete(key);}
    console.error('Erro ao salvar coleção:',error);
    setStatus('Erro ao salvar — tente novamente','error');
    alert('Não foi possível salvar essa carta no fichário. Verifique sua conexão e tente de novo.');
  }else{
    mdOutboxClear(key); // garante que não fica pendência velha desse slot
  }
  renderBinder();updateDashProgress();
}

// ── TEMA CLARO/ESCURO ───────────────────────────────────────────
// REVERTIDO 13/08/2026: o tema "pokemon" (3º estado) virou padrão de
// fonte+arte dos quadrados de informação nos dois temas em vez de tema
// à parte — ver .kpi-value/.sec-title/.panel-t (Fredoka + pokébola em
// CSS puro). Volta a ser um toggle simples de 2 estados.
function applyThemeIcon(t){
  const icon=document.getElementById('theme-toggle-icon');
  const meta=document.querySelector('meta[name="theme-color"]');
  if(icon) icon.textContent = t==='dark' ? '☀️' : '🌙';
  if(meta) meta.setAttribute('content', t==='dark' ? '#0d0f18' : '#f7f7fa');
}
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')||'light';
  const next=cur==='dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('mydeck-theme',next);
  applyThemeIcon(next);
}
document.addEventListener('DOMContentLoaded',()=>{
  applyThemeIcon(document.documentElement.getAttribute('data-theme')||'light');
});

// ── PÁGINAS / ABAS ───────────────────────────────────────────────
function goPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id==='home'?'pg-home':'pg-app').classList.add('active');
  if(id==='app') window.scrollTo(0,0);
}
function go(id,el){
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');el.classList.add('active');
  syncDesktopNav(id);
  if(id==='fichario'){
    // Restaura controles se estava em fichário personalizado
    const bctl=document.querySelector('.bctl');if(bctl)bctl.style.display='';
    const binderCtrl=document.getElementById('fic-binder-controls');
    const setInfo=document.getElementById('fic-set-info');
    const bstats=document.getElementById('binder-stats');
    if(binderCtrl)binderCtrl.style.display='';
    if(setInfo)setInfo.style.display='';
    if(bstats)bstats.style.display='';
    if(currentSet==='__custom__') renderCustomBindersHome();
    else renderBinder();
  }
  if(id==='dash'){renderDash();updateDashProgress();}
  if(id==='cartas'){renderCartas();}
  if(id==='gastos'){renderGastos();}
  if(id==='lojas'){if(typeof renderLojas==='function')renderLojas();}
  if(id==='mercado'){if(typeof renderMercado==='function')renderMercado();}
  if(id==='leilao'){if(typeof renderLeilaoTab==='function')renderLeilaoTab();}
  if(id==='positivo'){if(typeof renderPositivo==='function')renderPositivo();}
  if(id==='iniciantes'){if(typeof renderIniciantes==='function')renderIniciantes();}
  if(id==='centralizacao'){if(typeof renderCentralizacao==='function')renderCentralizacao();}
  if(id==='admin'){if(typeof renderAdminTab==='function')renderAdminTab();}
  if(!shareMode && !_routingFromHash){
    const h=id==='fichario'?('fichario/'+encodeURIComponent(currentSet||'me04')):id;
    if(location.hash.replace(/^#/,'')!==h) history.pushState(null,'','#'+h);
  }
}
// NOVO 02/08/2026: navega pra uma aba a partir de QUALQUER lugar do site
// (não só clicando na .tab em si) — ex: cards do Dashboard que referenciam
// uma coleção ou uma carta puxada. Acha o elemento da aba pelo id
// `nav-tab-<id>` (index.html) e chama go() com ele, exatamente como um
// clique de verdade na navegação faria.
// CORRIGIDO na mesma tarefa: switchSet() (usado pelos cards de "Destaques
// do Fichário"/fichários fixados) só atualizava o fichário por baixo dos
// panos — nunca chamava go('fichario',...), então clicar neles a partir do
// Dashboard não levava a lugar nenhum visualmente. Qualquer onclick que
// combine switchSet(...) com uma coleção/fichário agora chama goToTab
// primeiro.
function goToTab(id){
  const el=document.getElementById('nav-tab-'+id);
  if(el)go(id,el);
}
// NOVO 12/08/2026 (menu desktop): espelha o estado "active" na nav nova
// (.tdrop-item/.tdesk-link + o botão do grupo pai) sempre que go() roda —
// não importa se a navegação veio de um clique na .tdrop-menu, na .tabs
// mobile (escondida no desktop) ou de goToTab() disparado por outro lugar
// da página (cards do Dashboard etc.). Fonte única de verdade: o `id` da
// aba que acabou de ficar ativa.
function syncDesktopNav(id){
  document.querySelectorAll('.tdrop-item.active,.tdesk-link.active,.tdrop-btn.active')
    .forEach(el=>el.classList.remove('active'));
  const item=document.querySelector('.tdrop-item[data-tab="'+id+'"],.tdesk-link[data-tab="'+id+'"]');
  if(!item)return;
  item.classList.add('active');
  const group=item.closest('.tdrop');
  if(group){const btn=group.querySelector('.tdrop-btn');if(btn)btn.classList.add('active');}
}
function renderAll(){renderDash();renderGastos();renderCartas();updateDashProgress();if(typeof renderEvolucao==='function')renderEvolucao();renderPatrimonio();}

// ── UTILS ────────────────────────────────────────────────────────
const fmtR=v=>(+v||0).toFixed(2).replace('.',',');
// NOVO 02/08/2026: 5º parâmetro opcional `nav` — quando presente, faz a KPI
// virar um link clicável pra aba correspondente (goToTab). Chamadas
// existentes que não passam esse parâmetro continuam idênticas (KPI sem
// onclick), então não muda nada nas outras telas que reusam kpiHTML().
const kpiHTML=(cls,lbl,val,sub,nav)=>`<div class="kpi ${cls}"${nav?` onclick="goToTab('${nav}')" style="cursor:pointer" title="Ver na aba correspondente"`:''}><div class="kpi-label">${lbl}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div></div>`;

// ── ÍCONES DO DASHBOARD (27/07/2026) ────────────────────────────
// CORRIGIDO: KPIs/títulos do Dashboard usavam emoji solto (💰📦💵📊 etc.),
// que renderiza diferente em cada SO/navegador e destoa do resto do type
// system (Bebas Neue + Space Mono, bem cuidado). Set próprio de ícones SVG
// monocromáticos (herdam currentColor), inline, sem dependência de CDN.
const DICO_PATHS={
  wallet:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M9.7 9.8c0-1.3 1.1-2 2.3-2s2.3.8 2.3 2c0 2.6-4.6 2-4.6 4.4 0 1.2 1.1 2 2.3 2s2.3-.6 2.3-2"/>',
  box:'<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  coins:'<circle cx="9" cy="9" r="6"/><path d="M15 9a6 6 0 1 1 -5.7 8"/>',
  book:'<path d="M4 5a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2Z"/><path d="M4 5v14a2 2 0 0 0 2 2h11"/>',
  trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 6h6v6"/>',
  bars:'<rect x="3" y="12" width="4" height="8"/><rect x="10" y="7" width="4" height="13"/><rect x="17" y="3" width="4" height="17"/>',
  cart:'<circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.5 3h2l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21.5 7H6"/>',
  star:'<path d="M12 2l2.9 6.5L22 9.3l-5 4.9 1.2 7.1L12 17.9l-6.2 3.4L7 14.2 2 9.3l7.1-.8Z"/>',
  lchart:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
};
const dico=(name,size=13)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${DICO_PATHS[name]||''}</svg>`;
const barHTML=(lbl,v,max,color,txt,dot='')=>{const w=max>0?Math.round(v/max*100):0;
  return`<div class="brow"><div class="blbl">${dot}${lbl}</div><div class="btrack"><div class="bfill" style="width:${w}%;background:${color}">${txt}</div></div></div>`;};
function safeJSON(obj){return JSON.stringify(obj).replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// ── HOME STATS ───────────────────────────────────────────────────
function updateHomeStats(){
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  const pull=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const el=document.getElementById('home-stats');
  if(el) el.textContent=`R$${fmtR(invested)} investidos · ${pulledCards.length} cartas tiradas · R$${fmtR(pull)} em valor`;
}

// ── PARTÍCULAS ───────────────────────────────────────────────────
// AJUSTADO: 35 partículas coloridas (confete arco-íris) era o tell clássico
// de "hero section gerado por IA". Reduzido pra 10, tom único (dourado
// desbotado, remete a poeira/brilho de card foil, não confete de festa).
function initParticles(){
  const c=document.getElementById('particles');if(!c)return;
  for(let i=0;i<10;i++){
    const p=document.createElement('div');p.className='particle';
    const sz=1+Math.random()*1.8;
    p.style.cssText=`left:${Math.random()*100}%;width:${sz}px;height:${sz}px;`+
      `animation-duration:${12+Math.random()*16}s;animation-delay:${-Math.random()*22}s;`+
      `background:#c8960a;opacity:.5;border-radius:50%`;
    c.appendChild(p);
  }
}

// ── 3D CARDS HOME ────────────────────────────────────────────────
function init3DCards(){
  document.querySelectorAll('.hset-wrap').forEach(wrap=>{
    wrap.addEventListener('mousemove',e=>{
      const rect=wrap.getBoundingClientRect();
      const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      const dx=(e.clientX-cx)/rect.width*2;
      const dy=(e.clientY-cy)/rect.height*2;
      const rotX=-dy*18,rotY=dx*18;
      wrap.style.transform=`perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.06)`;
    });
    wrap.addEventListener('mouseleave',()=>{
      wrap.style.transform='perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
      wrap.style.transition='transform .5s ease';
    });
    wrap.addEventListener('mouseenter',()=>{wrap.style.transition='transform .1s ease';});
  });
}

// ── VALOR DO FICHÁRIO ────────────────────────────────────────────
// CORRIGIDO 27/07/2026: antes somava só getAllCardsWithSet() (escopado a
// myCollections, que vive só no localStorage). Se um set fosse desativado
// ou o usuário trocasse de navegador, os slots continuavam no Supabase mas
// o valor deles sumia do KPI "Valor Fichário" — enquanto o snapshot diário
// (scripts/snapshot_value.js, usado na "Evolução do Patrimônio") sempre
// somou a tabela `collection` inteira, sem esse filtro. Agora soma por
// TODOS os sets em SET_CARDS_MAP, igual ao snapshot, pra nunca mais
// divergir por causa de myCollections. Ver [[project_mycollections_sync_futuro]].
function calcCollectedValue(){
  let total=0;
  Object.keys(SET_CARDS_MAP).forEach(sid=>{
    const cards=SET_CARDS_MAP[sid]?.()||[];
    cards.forEach(c=>{
      getSlots(c,sid).forEach(s=>{
        const key=slotKey(sid+':',c.n,s.ver);
        if(collected.has(key)){
          const p=s.price||c.price;
          const qty=collectedQty.get(key)?.qty||1;
          if(p)total+=p*qty;
        }
      });
    });
  });
  return total;
}

// ── DASHBOARD ────────────────────────────────────────────────────
function renderDash(){
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  const bst=purchases.filter(p=>!p.acessorio);
  const tb=bst.reduce((s,p)=>s+p.boost,0),tg=bst.reduce((s,p)=>s+Number(p.price),0);
  const pull=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const fichVal=calcCollectedValue();
  // CORRIGIDO 27/07/2026: ROI usava `invested` (inclui acessórios — sleeves,
  // caixas etc., que não geram valor de coleção), o que puxava o % pra baixo
  // artificialmente. Agora usa `tg` (só boosters/cartas, mesma base já usada
  // no R$/Booster logo abaixo).
  const roi=tg>0?(fichVal/tg*100).toFixed(0):0;
  const apb=tb>0?(tg/tb).toFixed(2):'0,00';
  document.getElementById('kpi-dash').innerHTML=
    kpiHTML('red',dico('wallet')+' Total Investido','R$'+fmtR(invested),purchases.length+' compras','gastos')+
    kpiHTML('orange',dico('box')+' Boosters',''+tb,'~'+(tb*6)+' cartas','gastos')+
    kpiHTML('gold',dico('coins')+' R$/Booster','R$'+apb.replace('.',','),'média ponderada','gastos')+
    kpiHTML('teal',dico('book')+' Valor Fichário','R$'+fmtR(fichVal),collected.size+' slots coletados','fichario')+
    kpiHTML('blue',dico('trend')+' Fichário ÷ Investido',roi+'%','valor do fichário ÷ investido em cartas','fichario');

  // Gráfico raridades com dot colorido
  // CORRIGIDO 02/08/2026: classificador antigo usava .includes() com códigos
  // em inglês (SAR/RR/UR/IR/RH) que não existem nos valores reais de `rar`
  // (vêm de card.rare, em português — "Comum","Rara Ultra","Ultra Rara" etc.),
  // então quase tudo caía em "Outro" (mesmo bug de design já corrigido uma vez
  // em getSlots() — ver memória do projeto). Agora mapeia por valor exato
  // (whitelist) e só cai num fallback por substring pra strings desconhecidas.
  const RAR_BUCKET={
    'Comum':['Comum','N'],'Regular':['Comum','N'],
    'Incomum':['Incomum','N'],'Incomum (RH)':['Reverse Holo','RH'],
    'Rara':['Rara','F'],'Rara (Holo)':['Rara Holo','F'],'Rara Holo':['Rara Holo','F'],
    'Rara Dupla':['Dupla Rara','F'],'Rara Brilhante':['Rara Brilhante','F'],
    'Rara Ilustrada':['Ilustr. Rara','SP'],'Ilustr. Rara':['Ilustr. Rara','SP'],
    'Ilustração Rara (IR)':['Ilustr. Rara','SP'],
    'Rara Ilustrada Especial':['Ilustr. Esp. Rara','SP'],'Ilustr. Esp. Rara':['Ilustr. Esp. Rara','SP'],
    'Ilustracao Rara (SAR)':['Ilustr. Esp. Rara','SP'],'Ilustração Rara (SAR)':['Ilustr. Esp. Rara','SP'],
    'Ultra Rara':['Rara Ultra','SP'],'Rara Ultra':['Rara Ultra','SP'],
    'Ultra Rara Brilhante':['Rara Ultra Brilhante','SP'],
    'Hiper Rara':['Hiper Rara','SP'],'ACE SPEC':['ACE SPEC','SP'],
    'Super Rare':['Super Rare','SP'],'Art Rare':['Art Rare','SP'],
    'Special Art Rare':['Special Art Rare','SP'],
    'Mega Hyper Rare':['Mega Rara','SP'],'Mega Attack Rare':['Mega Rara','SP'],'Mega Ultra Rare':['Mega Rara','SP']
  };
  const rCount={},rVer={};
  pulledCards.forEach(c=>{
    const raw=c.rar||'';let k,ver;
    if(RAR_BUCKET[raw]){[k,ver]=RAR_BUCKET[raw];}
    else if(raw.startsWith('Promo')){k='Promo';ver='SP';}
    else if(raw.includes('Ilustr')&&(raw.includes('SAR')||raw.includes('Espec')||raw.includes('Esp.'))){k='Ilustr. Esp. Rara';ver='SP';}
    else if(raw.includes('Ilustr')){k='Ilustr. Rara';ver='SP';}
    else if(raw.includes('Ultra')){k='Rara Ultra';ver='SP';}
    else if(raw.includes('Dupla')){k='Dupla Rara';ver='F';}
    else if(raw.includes('Holo')&&raw.includes('Rara')){k='Rara Holo';ver='F';}
    else if(raw.includes('RH')){k='Reverse Holo';ver='RH';}
    else{k='Outro';ver='N';}
    rCount[k]=(rCount[k]||0)+1;rVer[k]=ver;
  });
  const rMax=Math.max(...Object.values(rCount),1);
  document.getElementById('chart-rarity').innerHTML=Object.entries(rCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
    const ver=rVer[k]||'N';const col=VER_COLOR[ver];
    const dot=`<div style="width:9px;height:9px;border-radius:2px;background:${col};flex-shrink:0"></div>`;
    return barHTML(k,v,rMax,col,''+v,dot);
  }).join('')||'<div style="color:var(--muted);font-size:12px;padding:8px">Sem cartas ainda</div>';

  // Gráfico gastos
  const byDate={};purchases.forEach(p=>{byDate[p.date]=(byDate[p.date]||0)+Number(p.price);});
  const dMax=Math.max(...Object.values(byDate),1);
  document.getElementById('chart-gastos').innerHTML=Object.entries(byDate).sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([d,v])=>barHTML(d.slice(5),v,dMax,'linear-gradient(90deg,var(--accent),var(--accent2))','R$'+fmtR(v))).join('');

  // Destaques do Fichário — cartas coletadas (aleatório, priorizando especiais e importantes)
  const rl={'Dupla Rara (RR)':'RR','Ilustração Rara (SAR)':'SAR','Ilustracao Rara (SAR)':'SAR',
    'Ilustração Rara (IR)':'IR','Ilustracao Rara (IR)':'IR','Rara Ultra (UR)':'UR',
    'Rara (Holo)':'HOLO','Incomum (RH)':'RH','Comum (RH)':'RH','Promocional':'PROMO'};
  const bcMap={SAR:'bs',UR:'bur',IR:'bi',RR:'brr',HOLO:'bh',RH:'brh',PROMO:'bp'};
  const allFich=getAllCardsWithSet();
  // cartas que o usuário coletou E têm algum destaque (importante, especial, ou preço ≥ R$20)
  const colFich=allFich.filter(c=>{
    const sid=c._setId;
    const slots=getSlots(c,sid);
    const hasCol=slots.some(s=>collected.has(slotKey(sid+':',c.n,s.ver)));
    return hasCol&&(c.important||!c.base||(c.price>=20));
  });
  // se tiver poucos destaques, complementa com qualquer carta coletada com preço
  const fallback=colFich.length<6?allFich.filter(c=>{
    const sid=c._setId;
    const slots=getSlots(c,sid);
    return slots.some(s=>collected.has(slotKey(sid+':',c.n,s.ver)))&&c.price>0&&!colFich.includes(c);
  }):[];
  const pool=[...colFich,...fallback].sort(()=>Math.random()-0.5).slice(0,6);
  document.getElementById('dash-highlights').innerHTML=pool.length>0?pool.map(c=>{
    const sid=c._setId;
    const slots=getSlots(c,sid);
    const colSlot=slots.find(s=>collected.has(slotKey(sid+':',c.n,s.ver)));
    const ver=colSlot?.ver||'N';
    const imgSrc=getBinderImg(c,sid);
    const catMeta=SET_CATALOG.find(s=>s.id===sid);
    const setShort=sid.toUpperCase().replace('SV3PT5','151').replace('SV8PT5','SV8.5').replace('SV6PT5','SV6.5').replace('SV4PT5','SV4.5');
    const rarLbl=rl[c.rare]||c.rare?.split(' ')[0]||'';
    // CORRIGIDO 02/08/2026: só chamava switchSet(), que atualiza o fichário
    // por baixo dos panos mas nunca ativa a pane #fichario — clicar aqui a
    // partir do Dashboard não levava a lugar nenhum visualmente. goToTab
    // primeiro faz a troca de aba de verdade.
    return`<div class="pc" onclick="goToTab('fichario');switchSet('${sid}',null)">
      <img class="pc-img" src="${imgSrc}" alt="${c.name}"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="fb" style="display:none"><div class="fb-n">${c.n}</div><div class="fb-name">${c.name}</div>
        <div class="fb-stripe" style="background:${c.color||'#666'}"></div></div>
      <div class="pc-info"><div class="pc-name">${c.name}</div>
        <div class="pc-meta">${setShort} · ${c.n}</div>
        <div class="pc-src">Fichário</div>
        <div class="ver-dots"><div class="ver-dot" style="background:${VER_COLOR[ver]};border-color:${VER_COLOR[ver]}" title="${VER_LABEL[ver]}"></div></div></div>
      <div class="pc-right"><span class="rb ${bcMap[rarLbl]||'bx'}">${rarLbl}</span>
        ${c.price?`<div class="pc-price">R$${fmtR(c.price)}</div>`:''}</div>
    </div>`;
  }).join(''):`<div style="color:var(--muted);padding:16px;font-size:.85rem">Nenhuma carta coletada no fichário ainda.</div>`;

}

// ── 151 DE POBRE ────────────────────────────────────────────────
const GEN1=[
  'Bulbasaur','Ivysaur','Venusaur','Charmander','Charmeleon','Charizard',
  'Squirtle','Wartortle','Blastoise','Caterpie','Metapod','Butterfree',
  'Weedle','Kakuna','Beedrill','Pidgey','Pidgeotto','Pidgeot',
  'Rattata','Raticate','Spearow','Fearow','Ekans','Arbok',
  'Pikachu','Raichu','Sandshrew','Sandslash','Nidoran','Nidorina',
  'Nidoqueen','Nidorino','Nidoking','Clefairy','Clefable',
  'Vulpix','Ninetales','Jigglypuff','Wigglytuff','Zubat','Golbat',
  'Oddish','Gloom','Vileplume','Paras','Parasect','Venonat','Venomoth',
  'Diglett','Dugtrio','Meowth','Persian','Psyduck','Golduck',
  'Mankey','Primeape','Growlithe','Arcanine','Poliwag','Poliwhirl','Poliwrath',
  'Abra','Kadabra','Alakazam','Machop','Machoke','Machamp',
  'Bellsprout','Weepinbell','Victreebel','Tentacool','Tentacruel',
  'Geodude','Graveler','Golem','Ponyta','Rapidash','Slowpoke','Slowbro',
  'Magnemite','Magneton',"Farfetch'd",'Doduo','Dodrio','Seel','Dewgong',
  'Grimer','Muk','Shellder','Cloyster','Gastly','Haunter','Gengar',
  'Onix','Drowzee','Hypno','Krabby','Kingler','Voltorb','Electrode',
  'Exeggcute','Exeggutor','Cubone','Marowak','Hitmonlee','Hitmonchan',
  'Lickitung','Koffing','Weezing','Rhyhorn','Rhydon','Chansey','Tangela',
  'Kangaskhan','Horsea','Seadra','Goldeen','Seaking','Staryu','Starmie',
  'Mr. Mime','Scyther','Jynx','Electabuzz','Magmar','Pinsir','Tauros',
  'Magikarp','Gyarados','Lapras','Ditto','Eevee','Vaporeon','Jolteon',
  'Flareon','Porygon','Omanyte','Omastar','Kabuto','Kabutops','Aerodactyl',
  'Snorlax','Articuno','Zapdos','Moltres','Dratini','Dragonair','Dragonite',
  'Mewtwo','Mew'
]; // 151 em ordem de Pokédex

// REMOVIDO 02/08/2026 (confirmado com o Eduardo — feature descontinuada):
// basePokeNames() + renderGen1Pobre() renderizavam um widget "151 de Pobre"
// num elemento #gen1-pobre que nunca existiu em nenhuma página do site —
// código morto, nunca chamado, nunca visível. A ideia sobrevive como o
// preset "🪙 151 de Pobre" dentro de Fichário → Meus Fichários
// (BINDER_PRESETS, key 'budget_151', mais abaixo) — esse continua ativo e
// usa o array GEN1 (mantido). Ver [[project_pokemon_tcg]].

// ── PROGRESS ────────────────────────────────────────────────────
const SET_META={
  me06:{label:'💎 ME06 — Esmeralda Tempestuosa',color:'#00c853',chase:'Mega Rayquaza ex Gold — R$1.500 (est.)',heroCard:1,imgFn:imgMe06,upcoming:true,releaseDate:'out/2026'},
  me2pt5:{label:'🦸 ME2.5(ASC) — Heróis Excelsos',color:'#5C6BC0',chase:'Mega Charizard Y ex Hiper Rara Mega — preço a confirmar',heroCard:294,imgFn:imgMe2pt5,releaseDate:'30/jan/2026'},
  me05:{label:'🌑 ME05(PBL) — Escuridão Absoluta',color:'#424242',chase:'Gladion\'s Showdown SAR — US$1.090',heroCard:118,imgFn:imgMe05,releaseDate:'17/jul/2026'},
  me04:{label:'🔥 ME04(CRI) — Caos Ascendente',color:'var(--accent)',chase:'Mega Greninja ex Gold — R$1.482',heroCard:22,imgFn:imgMe04},
  me03:{label:'🔵 ME03(POR) — Equilíbrio Perfeito',color:'#1565C0',chase:'Meowth ex SAR — R$870 · Mega Zygarde ex Gold — R$775',heroCard:62,imgFn:imgMe03},
  me02:{label:'👻 ME02(PFL) — Fogo Fantasmagórico',color:'#9C27B0',chase:'Mega Charizard X ex SAR — R$1.809',heroCard:13,imgFn:imgMe02},
  meg: {label:'🌿 MEG(MEG) — Megaevolução',color:'#4CAF50',chase:'Mega Greninja ex UR — R$60',heroCard:3,imgFn:imgMeg},
  mep: {label:'⭐ MEP(MEP) — Parceiros Iniciais',color:'#ffd166',chase:'Charmander MEP038 — R$36',heroCard:38,imgFn:imgMep},
};
const SET_CARDS_MAP={
  me06:()=>typeof CARDS_ME06!=='undefined'?CARDS_ME06:[],
  me2pt5:()=>typeof CARDS_ME2PT5!=='undefined'?CARDS_ME2PT5:[],
  me05:()=>typeof CARDS_ME05!=='undefined'?CARDS_ME05:[],
  me04:()=>CARDS,
  me03:()=>typeof CARDS_ME03!=='undefined'?CARDS_ME03:[],
  me02:()=>CARDS_ME02,
  meg:()=>CARDS_MEG,
  mep:()=>CARDS_MEP,
  sv1: ()=>typeof CARDS_SV1!=='undefined'?CARDS_SV1:[],
  sv2: ()=>typeof CARDS_SV2!=='undefined'?CARDS_SV2:[],
  sv3: ()=>typeof CARDS_SV3!=='undefined'?CARDS_SV3:[],
  sv3pt5:()=>typeof CARDS_SV3PT5!=='undefined'?CARDS_SV3PT5:[],
  sv4: ()=>typeof CARDS_SV4!=='undefined'?CARDS_SV4:[],
  sv4pt5:()=>typeof CARDS_SV4PT5!=='undefined'?CARDS_SV4PT5:[],
  sv5: ()=>typeof CARDS_SV5!=='undefined'?CARDS_SV5:[],
  sv6: ()=>typeof CARDS_SV6!=='undefined'?CARDS_SV6:[],
  sv6pt5:()=>typeof CARDS_SV6PT5!=='undefined'?CARDS_SV6PT5:[],
  sv7: ()=>typeof CARDS_SV7!=='undefined'?CARDS_SV7:[],
  sv8: ()=>typeof CARDS_SV8!=='undefined'?CARDS_SV8:[],
  sv8pt5:()=>typeof CARDS_SV8PT5!=='undefined'?CARDS_SV8PT5:[],
  sv9: ()=>typeof CARDS_SV9!=='undefined'?CARDS_SV9:[],
  sv10:()=>typeof CARDS_SV10!=='undefined'?CARDS_SV10:[],
  zsv10pt5:()=>typeof CARDS_ZSV10PT5!=='undefined'?CARDS_ZSV10PT5:[],
  rsv10pt5:()=>typeof CARDS_RSV10PT5!=='undefined'?CARDS_RSV10PT5:[],
  svp:()=>typeof CARDS_SVP!=='undefined'?CARDS_SVP:[],
  pgo:()=>typeof CARDS_PGO!=='undefined'?CARDS_PGO:[],
};
// sets legados entram no mapa dinamicamente
(window.LEGACY_SETS||[]).forEach(ls=>{if(!SET_CARDS_MAP[ls.id])SET_CARDS_MAP[ls.id]=()=>ls.data;});

// ── CATÁLOGO DE COLEÇÕES ─────────────────────────────────────────
const SET_CATALOG=[
  {id:'me06',label:'ME06 — Esmeralda Tempestuosa',emoji:'💎',cards:0,  color:'#00c853',series:'ME',upcoming:true},
  {id:'me2pt5',label:'ME2.5(ASC) — Heróis Excelsos', emoji:'🦸',cards:typeof CARDS_ME2PT5!=='undefined'?CARDS_ME2PT5.length:295,color:'#5C6BC0',series:'ME'},
  {id:'me05',label:'ME05(PBL) — Escuridão Absoluta', emoji:'🌑',cards:typeof CARDS_ME05!=='undefined'?CARDS_ME05.length:120,color:'#757575',series:'ME'},
  {id:'me04',label:'ME04(CRI) — Caos Ascendente',  emoji:'🔥',cards:122,color:'#FF5722',series:'ME'},
  {id:'me03',label:'ME03(POR) — Equilíbrio Perfeito',   emoji:'🔵',cards:typeof CARDS_ME03!=='undefined'?CARDS_ME03.length:120,color:'#1565C0',series:'ME'},
  {id:'me02',label:'ME02(PFL) — Fogo Fantasmagórico', emoji:'👻',cards:130,color:'#9C27B0',series:'ME'},
  {id:'meg', label:'MEG(MEG) — Megaevolução',       emoji:'🌿',cards:188,color:'#4CAF50',series:'ME'},
  // Raio Preto/Fogo Branco (EV10.5) — jul/2025, era Escarlate e Violeta, lançado
  // pouco antes da Megaevolução começar (por isso entram aqui, não como ME0x).
  // Adicionados 19/08/2026 (indicação de usuário).
  {id:'zsv10pt5',label:'EV10.5(BLK) — Raio Preto', emoji:'🐉',cards:typeof CARDS_ZSV10PT5!=='undefined'?CARDS_ZSV10PT5.length:172,color:'#212121',series:'SV'},
  {id:'rsv10pt5',label:'EV10.5(WHT) — Fogo Branco', emoji:'🦢',cards:typeof CARDS_RSV10PT5!=='undefined'?CARDS_RSV10PT5.length:173,color:'#f5f5f5',series:'SV'},
  {id:'mep', label:'MEP(MEP) — Promos Mega Evolução', emoji:'⭐',cards:typeof CARDS_MEP!=='undefined'?CARDS_MEP.length:54, color:'#ffd166',series:'ME'},
  {id:'pgo', label:'PGO(PGO) — Pokémon GO',emoji:'🗺️',cards:typeof CARDS_PGO!=='undefined'?CARDS_PGO.length:88,color:'#4285F4',series:'SWSH'},
  {id:'svp', label:'SVP(SVP) — Promos Escarlate e Violeta',emoji:'🎫',cards:typeof CARDS_SVP!=='undefined'?CARDS_SVP.length:218,color:'#546E7A',series:'SV'},
  {id:'sv10',label:'SV10(DRI) — Rivais do Destino',emoji:'⚔️',cards:244,color:'#E91E63',series:'SV'},
  {id:'sv9', label:'SV9(JTG) — Jornada Juntos',     emoji:'🤝',cards:190,color:'#3F51B5',series:'SV'},
  {id:'sv8pt5',label:'SV8.5(PRE) — Evoluções Prismáticas',emoji:'💫',cards:180,color:'#9C27B0',series:'SV'},
  {id:'sv8', label:'SV8(SSP) — Faíscas Furiosas',   emoji:'⚡',cards:252,color:'#FF9800',series:'SV'},
  {id:'sv7', label:'SV7(SCR) — Coroa Estelar',      emoji:'👑',cards:175,color:'#FFC107',series:'SV'},
  {id:'sv6pt5',label:'SV6.5(SFA) — Véu das Sombras',emoji:'🌑',cards:99, color:'#607D8B',series:'SV'},
  {id:'sv6', label:'SV6(TWM) — Máscara do Futuro',  emoji:'🎭',cards:226,color:'#00BCD4',series:'SV'},
  {id:'sv5', label:'SV5(TEF) — Forças Triplas',     emoji:'💥',cards:218,color:'#FF5722',series:'SV'},
  {id:'sv4pt5',label:'SV4.5(PAF) — Destinos de Paldea',emoji:'✨',cards:245,color:'#FFD700',series:'SV'},
  {id:'sv4', label:'SV4(PAR) — Fenda Temporal',     emoji:'⏰',cards:266,color:'#673AB7',series:'SV'},
  {id:'sv3pt5',label:'SV3.5(MEW) — Coleção 151',   emoji:'💯',cards:207,color:'#E91E63',series:'SV'},
  {id:'sv3', label:'SV3(OBF) — Obsidiana Chamejante',emoji:'🌋',cards:230,color:'#BF360C',series:'SV'},
  {id:'sv2', label:'SV2(PAL) — Evolução em Paldea', emoji:'🏔️',cards:279,color:'#00ACC1',series:'SV'},
  {id:'sv1', label:'SV1(SVI) — Escarlate e Violeta',emoji:'🌿',cards:258,color:'#8E24AA',series:'SV'},
];

// ── SÉRIES (ordem de exibição na home e no gerenciador) ─────────
const SERIES_META={
  ME:    {t:'⚡ MEGA EVOLUÇÃO — SÉRIE ATUAL',           sub:'⚡ Mega Evoluções'},
  SV:    {t:'🌋 ESCARLATE & VIOLETA (2023–2025)',       sub:'⚔️ Escarlate & Violeta (2023–2025)'},
  SWSH:  {t:'⚔️ ESPADA & ESCUDO (2020–2022)',           sub:'⚔️ Espada & Escudo (2020–2022)'},
  SM:    {t:'🌙 SOL & LUA (2017–2019)',                 sub:'🌙 Sol & Lua (2017–2019)'},
  XY:    {t:'🧬 XY (2014–2016)',                        sub:'🧬 XY (2014–2016)'},
  BW:    {t:'⚫ PRETO & BRANCO (2011–2013)',            sub:'⚫ Preto & Branco (2011–2013)'},
  HGSS:  {t:'💛 HEARTGOLD & SOULSILVER (2010–2011)',    sub:'💛 HeartGold & SoulSilver (2010–2011)'},
  DP:    {t:'💎 DIAMANTE & PÉROLA / PLATINUM (2007–2010)',sub:'💎 Diamante & Pérola / Platinum (2007–2010)'},
  EX:    {t:'🔷 ERA EX (2003–2007)',                    sub:'🔷 Era EX (2003–2007)'},
  CLASSIC:{t:'🕰️ CLÁSSICOS — BASE A E-CARD (1999–2003)',sub:'🕰️ Clássicos (1999–2003)'},
};

// ── SETS LEGADOS (legacy_*.js, gerados automaticamente) ────────
// Cada entrada: {id,label,emoji,cards,color,series,releaseDate,data:[{n,name,rare,price,base}]}
// Preços legados = TCGplayer market (USD) convertido p/ BRL — estimativa, não Liga.
(window.LEGACY_SETS||[]).forEach(ls=>{
  if(SET_CATALOG.some(s=>s.id===ls.id))return;
  SET_CATALOG.push({id:ls.id,label:ls.label,emoji:ls.emoji,cards:ls.cards,color:ls.color,series:ls.series});
});

function _loadMyCollections(){
  try{const v=JSON.parse(localStorage.getItem('myCollections'));
    return Array.isArray(v)&&v.length?v:['me06','me2pt5','me05','me04','me03','me02','meg','mep'];}
  catch(e){return['me06','me2pt5','me05','me04','me03','me02','meg','mep'];}
}
let myCollections=_loadMyCollections();
function saveMyCollections(){try{localStorage.setItem('myCollections',JSON.stringify(myCollections));}catch(e){}}

// ── Fichários personalizados fixados na aba principal (22/07/2026) ──────
// Guardado local (mesmo padrão de myCollections) — não precisa de coluna nova
// no Supabase. Guarda só os IDs; o binder em si continua vindo de customBinders.
function _loadPinnedBinders(){
  try{const v=JSON.parse(localStorage.getItem('pinnedBinders'));return Array.isArray(v)?v:[];}
  catch(e){return[];}
}
let pinnedBinders=_loadPinnedBinders();
function savePinnedBinders(){try{localStorage.setItem('pinnedBinders',JSON.stringify(pinnedBinders));}catch(e){}}
function isBinderPinned(id){return pinnedBinders.includes(String(id));}
function toggleBinderPinned(id){
  id=String(id);
  if(pinnedBinders.includes(id))pinnedBinders=pinnedBinders.filter(x=>x!==id);
  else pinnedBinders.push(id);
  savePinnedBinders();
  renderTabs();
  // NOVO 27/07/2026: fixar/desafixar agora também atualiza o "Progresso
  // Master Set" do Dashboard na hora, sem precisar trocar de aba e voltar.
  if(typeof updateDashProgress==='function')updateDashProgress();
}
function toggleCollection(id){
  if(myCollections.includes(id)){
    myCollections=myCollections.filter(x=>x!==id);
    if(currentSet===id){currentSet='__custom__';}
  }else{
    const order=SET_CATALOG.map(s=>s.id);
    myCollections=[...myCollections,id].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  }
  saveMyCollections();
  renderTabs();
  if(currentSet==='__custom__'||!myCollections.includes(currentSet))renderCustomBindersHome();
}

function countSlotsFor(cards,pfx){
  let total=0,col=0;
  cards.forEach(c=>{getSlots(c,pfx).forEach(s=>{total++;if(collected.has(slotKey(pfx+':',c.n,s.ver)))col++;});});
  return{total,col};
}
// NOVO 27/07/2026: conta slots + valor (R$ já coletado e R$ faltante pra
// completar) — pedido do Eduardo pro "Progresso Master Set" mostrar preço
// acumulado de cada coleção, não só %/contagem. `sid` fixo pra coleções
// oficiais (mesmo set pra toda a lista); se `sid` for null, usa `c._setId`
// de cada carta — necessário pros fichários personalizados fixados, que
// podem misturar cartas de vários sets diferentes.
function slotsAndValue(cards,sid){
  let total=0,col=0,have=0,missing=0;
  cards.forEach(c=>{
    const s2=sid||c._setId;
    getSlots(c,s2).forEach(s=>{
      total++;
      const key=slotKey(s2+':',c.n,s.ver);
      const p=s.price||c.price||0;
      if(collected.has(key)){
        col++;
        have+=p*(collectedQty.get(key)?.qty||1);
      }else{
        missing+=p;
      }
    });
  });
  return{total,col,have,missing};
}
function updateDashProgress(){
  let grand=0,grandC=0;

  // Monta lista de sets ativos: usa myCollections se disponível, senão todos
  // do SET_CATALOG. CORRIGIDO 27/07/2026: o fallback antigo usava só
  // Object.keys(SET_META), que só tem os sets ME — se myCollections ficasse
  // vazio, todos os sets SV desapareciam do progresso "Master Set" nesse
  // cenário. SET_CATALOG cobre ME+SV.
  const activeIds=(typeof myCollections!=='undefined'&&myCollections.length)
    ?myCollections
    :SET_CATALOG.map(s=>s.id);

  const html=activeIds.map(id=>{
    const meta=SET_META[id]||null;
    const cat=SET_CATALOG?SET_CATALOG.find(s=>s.id===id):null;
    const cards=SET_CARDS_MAP[id]?.()||[];
    if(!meta&&!cat)return''; // set desconhecido
    const base=countSlotsFor(cards.filter(c=>c.base),id);
    const sec=countSlotsFor(cards.filter(c=>!c.base),id);
    const tot=base.total+sec.total,col=base.col+sec.col;
    grand+=tot;grandC+=col;
    const pct=tot>0?(col/tot*100).toFixed(0):0;
    // NOVO 27/07/2026: valor R$ já coletado e R$ faltante pra completar esta coleção.
    const{have,missing}=slotsAndValue(cards,id);
    const valorRow=tot>0?`<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:10px;font-family:'Space Mono',monospace">
      <span style="color:var(--teal)">R$${fmtR(have)} coletado</span>
      <span style="color:var(--muted)">faltam R$${fmtR(missing)}</span>
    </div>`:'';

    if(meta){
      // ── Display completo (sets ME com SET_META) ──
      const color=meta.color;
      // CORRIGIDO 27/07/2026: cor hardcoded (#f0932b) não batia com nenhum token
      // do design system — trocado por var(--accent2), a mesma laranja usada em
      // "Boosters" e no resto do site.
      const upBadge=meta.upcoming?`<div style="position:absolute;top:10px;right:10px;background:var(--accent2);color:#fff;font-size:9px;letter-spacing:1px;padding:2px 8px;border-radius:4px;font-family:'Space Mono',monospace">EM BREVE ${meta.releaseDate||''}</div>`:'';
      // NOVO 02/08/2026: painel agora navega pro Fichário dessa coleção ao
      // clicar — mesmo padrão de goToTab+switchSet usado nos outros cards
      // do Dashboard que referenciam uma coleção.
      return`<div class="panel panel-link" style="border-color:${color}44;overflow:hidden;position:relative;${meta.upcoming?'opacity:.8':''}" onclick="goToTab('fichario');switchSet('${id}',null)">
        ${upBadge}
        <div style="position:absolute;right:-8px;top:-8px;width:70px;height:100px;opacity:.1;pointer-events:none">
          <img loading="lazy" decoding="async" alt="" src="${imgThumb(meta.imgFn(meta.heroCard))}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <div style="flex:1"><div style="font-weight:700;font-size:13px">${meta.label}</div>
          <div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">${meta.upcoming?'Lançamento: '+(meta.releaseDate||'em breve'):(tot+' slots · master set')}</div></div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:30px;color:${color};line-height:1">${meta.upcoming?'?':pct+'%'}</div>
        </div>
        ${!meta.upcoming?`<div class="prog"><div class="prog-lbl"><span>Base</span><span>${base.col}/${base.total}</span></div>
          <div class="prog-t"><div class="prog-f" style="width:${base.total>0?(base.col/base.total*100).toFixed(1):0}%;background:${color}"></div></div></div>
        ${sec.total>0?`<div class="prog" style="margin:0"><div class="prog-lbl"><span>Especiais</span><span>${sec.col}/${sec.total}</span></div>
          <div class="prog-t"><div class="prog-f" style="width:${sec.total>0?(sec.col/sec.total*100).toFixed(1):0}%;background:${color}88"></div></div></div>`:''}
        ${valorRow}`:''}
        <div style="margin-top:10px;font-size:10px;font-family:'Space Mono',monospace;color:var(--muted)">Chase: <span style="color:${color}">${chaseFor(id)||meta.chase}</span></div>
      </div>`;
    }else{
      // ── Display simplificado (sets SV via SET_CATALOG) ──
      const color=cat.color||'#666';
      const upcoming=cat.upcoming||false;
      return`<div class="panel panel-link" style="border-color:${color}44;overflow:hidden;position:relative;${upcoming?'opacity:.7':''}" onclick="goToTab('fichario');switchSet('${id}',null)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div style="font-size:28px;line-height:1">${cat.emoji||'📦'}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:12px;line-height:1.3">${cat.label}</div>
            <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;margin-top:2px">
              ${upcoming?'em breve':(tot>0?tot+' slots · SV':'sem dados carregados')}</div>
          </div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:${color};line-height:1">${upcoming?'?':(tot>0?pct+'%':'–')}</div>
        </div>
        ${tot>0&&!upcoming?`
        <div class="prog"><div class="prog-lbl"><span>Base</span><span>${base.col}/${base.total}</span></div>
          <div class="prog-t"><div class="prog-f" style="width:${base.total>0?(base.col/base.total*100).toFixed(1):0}%;background:${color}"></div></div></div>
        ${sec.total>0?`<div class="prog" style="margin:0"><div class="prog-lbl"><span>Especiais</span><span>${sec.col}/${sec.total}</span></div>
          <div class="prog-t"><div class="prog-f" style="width:${(sec.col/sec.total*100).toFixed(1)}%;background:${color}88"></div></div></div>`:''}
        ${valorRow}
        `:`<div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;padding:6px 0">
          ${upcoming?'Lançamento em breve':'Ative o set no Fichário para carregar as cartas'}</div>`}
      </div>`;
    }
  }).filter(Boolean).join('');

  // NOVO 27/07/2026: pedido do Eduardo — o Progresso Master Set deve incluir
  // também os fichários personalizados que ele fixou (pinnedBinders), com o
  // mesmo R$ coletado/faltante dos painéis oficiais. NÃO entram em
  // grand/grandC (o resumo "Master Set Completo" lá embaixo) porque um
  // fichário fixado é um recorte de cartas que já pertencem a algum set
  // oficial — contar os dois somaria o mesmo slot 2x.
  const pinnedHtml=(typeof pinnedBinders!=='undefined'?pinnedBinders:[]).map(pid=>{
    const b=(typeof customBinders!=='undefined'?customBinders:[]).find(x=>String(x.id)===pid);
    if(!b)return'';
    const cards=getBinderCards(b);
    const{total,col,have,missing}=slotsAndValue(cards,null);
    const pct=total>0?(col/total*100).toFixed(0):0;
    const color=b.cover_color||'#a855f7';
    // CORRIGIDO 02/08/2026: mesmo bug do switchSet() sem goToTab — ver nota acima nos cards de "Destaques do Fichário".
    return`<div class="panel panel-link" style="border-color:${color}44;overflow:hidden;position:relative" onclick="goToTab('fichario');switchSet('__cb__${pid}',null)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="font-size:26px;line-height:1">${b.emoji||'📚'}</div>
        <div style="flex:1"><div style="font-weight:700;font-size:12px;line-height:1.3">${b.name}</div>
          <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;margin-top:2px">
            ${total>0?total+' slots · fichário fixado':'sem cartas neste filtro'}</div></div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:${color};line-height:1">${total>0?pct+'%':'–'}</div>
      </div>
      ${total>0?`<div class="prog"><div class="prog-lbl"><span>Slots</span><span>${col}/${total}</span></div>
        <div class="prog-t"><div class="prog-f" style="width:${pct}%;background:${color}"></div></div></div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:10px;font-family:'Space Mono',monospace">
          <span style="color:var(--teal)">R$${fmtR(have)} coletado</span>
          <span style="color:var(--muted)">faltam R$${fmtR(missing)}</span>
        </div>`:''}
    </div>`;
  }).filter(Boolean).join('');

  document.getElementById('progress-sets').innerHTML=(html+pinnedHtml)||
    `<div style="color:var(--muted);font-size:12px;font-family:'Space Mono',monospace;padding:20px;text-align:center">
      Nenhuma coleção ativa — vá em Fichário → Minhas Coleções para selecionar sets.</div>`;

  const pct=grand>0?(grandC/grand*100).toFixed(1):0;
  const allCards=Object.values(SET_CARDS_MAP).flatMap(fn=>fn());
  const imp=allCards.filter(c=>c.important).length;
  const el=document.getElementById('binder-stats');
  if(el)el.innerHTML=`
    <div><div class="bsv" style="color:var(--teal)">${grandC}</div><div class="bsl">Slots Coletados</div></div>
    <div><div class="bsv" style="color:var(--gold)">${imp}</div><div class="bsl">Importantes</div></div>
    <div><div class="bsv" style="color:var(--muted)">${grand}</div><div class="bsl">Total Slots</div></div>
    <div style="flex:1;min-width:180px">
      <div style="height:6px;background:var(--surface2);border-radius:3px;margin-bottom:5px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:3px"></div></div>
      <div class="bsl"><span style="color:var(--teal)">${pct}%</span> MASTER SET COMPLETO</div>
    </div>`;
}

// ── GASTOS ──────────────────────────────────────────────────────
function renderGastos(){
  const total=purchases.reduce((s,p)=>s+Number(p.price),0);
  const bst=purchases.filter(p=>!p.acessorio);
  const tb=bst.reduce((s,p)=>s+p.boost,0),tc=bst.reduce((s,p)=>s+p.cards,0),tg=bst.reduce((s,p)=>s+Number(p.price),0);
  const pull=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const roi=total>0?(pull/total*100).toFixed(0):0;
  const apb=tb>0?(tg/tb).toFixed(2):'0,00',apc=tc>0?(tg/tc).toFixed(2):'0,00';
  document.getElementById('gastos-resumo').innerHTML=`<div class="kpi-grid">
    ${kpiHTML('red','💰 Total Investido','R$'+fmtR(total),purchases.length+' compras · '+tb+' boosters')}
    ${kpiHTML('gold','📦 R$/Booster','R$'+apb.replace('.',','),'média ponderada')}
    ${kpiHTML('orange','🃏 R$/Carta','R$'+apc.replace('.',','),'~'+tc+' cartas')}
    ${kpiHTML('teal','💎 Valor Tirado','R$'+fmtR(pull),pulledCards.length+' cartas')}
    ${kpiHTML('blue','📊 Recuperado em Pulls',roi+'%',(pull>=total?'✅ acima do gasto':'📉 abaixo do gasto')+' · R$ tirado ÷ R$ gasto')}
  </div>`;

  document.getElementById('gastos-cards').innerHTML=purchases.map(p=>{
    const pb=p.boost>0?(Number(p.price)/p.boost).toFixed(2):null;
    const d=new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
    const imgSrc=getPurchaseImg(p.product);
    // Profit por compra: soma das cartas tiradas vinculadas via purchase_id - preço pago.
    // Cartas antigas (lançadas antes do vínculo existir) não têm purchase_id e não entram aqui.
    const linked=pulledCards.filter(c=>String(c.purchase_id)===String(p.id));
    const linkedVal=linked.reduce((s,c)=>s+Number(c.price||0),0);
    const profit=linked.length?linkedVal-Number(p.price):null;
    return`<div class="pcard">
      <div class="pcard-img-wrap">
        <img src="${imgSrc}" alt="${esc(p.product)}" onerror="this.style.display='none'">
        <div class="pcard-img-overlay"></div>
        <div class="pcard-img-label">${esc(p.tipo)}</div>
      </div>
      <div class="pcard-body">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span class="pill pt">${esc(p.tipo)}</span>
              <span style="font-size:11px;color:var(--muted);font-family:'Space Mono',monospace">${d}</span>
              ${p.acessorio?'<span style="font-family:\'Space Mono\',monospace;font-size:9px;color:var(--muted);background:rgba(107,117,153,.15);padding:2px 7px;border-radius:10px">ACESSÓRIO</span>':''}
            </div>
            <div style="font-weight:700;font-size:14px;margin-bottom:4px">${esc(p.product)}</div>
            ${p.boost>0?`<div style="font-size:11px;color:var(--muted)">${p.boost} boosters · ~${p.cards} cartas</div>`:''}
            ${profit!==null?`<div style="font-size:11px;margin-top:4px;color:${profit>=0?'var(--teal)':'var(--accent)'}">${profit>=0?'▲':'▼'} R$${fmtR(Math.abs(profit))} ${profit>=0?'de lucro':'abaixo do gasto'} · ${linked.length} carta${linked.length!==1?'s':''} vinculada${linked.length!==1?'s':''}</div>`:''}
          </div>
          <div style="display:flex;gap:16px;align-items:center">
            <div style="text-align:center"><div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--accent);line-height:1">R$${fmtR(p.price)}</div>
              <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">PAGO</div></div>
            ${pb?`<div style="text-align:center"><div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--gold);line-height:1">R$${pb.replace('.',',')}</div>
              <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">POR BOOSTER</div></div>`:''}
            <div class="pcard-actions">
              <button class="pcard-act" aria-label="Editar compra" title="Editar" onclick="editPurchase('${p.id}')">✏️</button>
              <button class="pcard-act pcard-act-del" aria-label="Remover compra" title="Remover" onclick="removePurchase('${p.id}')">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('tlwrap').innerHTML=[...purchases].reverse().map(p=>{
    const d=new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
    const pb=p.boost>0?(Number(p.price)/p.boost).toFixed(2):null;
    return`<div class="tli"><div class="tl-date">${d}</div><div class="tl-desc">${esc(p.product)}</div>
      <div class="tl-amt">R$${fmtR(p.price)}${pb?` · <span style="color:var(--gold)">R$${pb.replace('.',',')}/booster</span>`:''}</div></div>`;
  }).join('');
}

// ── CARTAS TIRADAS & À VENDA ─────────────────────────────────────
const cvSetLbl=id=>id.toUpperCase()
  .replace('SV3PT5','151').replace('SV8PT5','SV8.5')
  .replace('SV6PT5','SV6.5').replace('SV4PT5','SV4.5');

const MV_DISCOUNTS=[5,10,15,20,25,30];

// Estado de conservação da carta anunciada (padrão internacional TCG)
const CV_CONDITIONS=[
  {code:'M', label:'Nova',                  sub:'Mint',              color:'#06d6a0'},
  {code:'NM',label:'Praticamente Nova',     sub:'Near Mint',         color:'#ffd166'},
  {code:'MP',label:'Usada Moderadamente',   sub:'Moderately Played', color:'#ff6b35'},
  {code:'D', label:'Danificada',            sub:'Damaged',           color:'#e63946'},
];
const cvCondInfo=code=>CV_CONDITIONS.find(x=>x.code===code)||CV_CONDITIONS[0];

// Idioma da edição da carta anunciada
const CV_LANGUAGES=[
  {code:'pt-BR',flag:'🇧🇷',label:'Português'},
  {code:'en',   flag:'🇺🇸',label:'Inglês'},
  {code:'ja',   flag:'🇯🇵',label:'Japonês'},
];
const cvLangInfo=code=>CV_LANGUAGES.find(x=>x.code===code)||CV_LANGUAGES[0];

function renderCartas(){
  const fichVal=calcCollectedValue();
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  // UNIFICADO 03/08/2026 (auditoria): mesma conta e mesmo nome do KPI
  // "Fichário ÷ Investido" do Dashboard — antes aqui era "% Investimento"
  // sobre o total COM acessórios, enquanto o Dashboard dividia só pelo gasto
  // em cartas. Três nomes diferentes pra métricas parecidas confundiam.
  const tgCartas=purchases.filter(p=>!p.acessorio).reduce((s,p)=>s+Number(p.price),0);
  const roi=tgCartas>0?(fichVal/tgCartas*100).toFixed(0):0;
  const vendaTotal=cardListings.reduce((s,l)=>s+Number(l.price||0)*Number(l.qty||1),0);
  document.getElementById('cards-hdr').innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:22px">
    ${kpiHTML('teal','📚 Valor Fichário','R$'+fmtR(fichVal),collected.size+' slots')}
    ${kpiHTML('gold','📊 Fichário ÷ Investido',roi+'%','fichário vale '+roi+'% do investido em cartas')}
    ${kpiHTML('red','🛍️ Investido','R$'+fmtR(invested),purchases.length+' compras')}
    ${kpiHTML('teal','🏷️ À Venda','R$'+fmtR(vendaTotal),cardListings.length+' anúncios')}
  </div>`;
  populateCvSetFilter();
  renderCardsAll();
  renderCardsVenda();
  renderCardsBuySearch();
  renderMyBuyOrders();
}

// Lista achatada de todos os slots coletados (qty>0), 1 item por versão/carta
function getOwnedSlotsFlat(){
  const out=[];
  getAllCatalogCards().forEach(c=>{
    const sid=c._setId;
    getSlots(c,sid).forEach(s=>{
      const key=slotKey(sid+':',c.n,s.ver);
      const entry=collectedQty.get(key);
      if(!entry||!entry.qty)return;
      out.push({c,sid,ver:s.ver,key,qty:entry.qty,ligaPrice:lprice(sid,c.n,s.price)});
    });
  });
  return out;
}

// Preenche o dropdown "coleções" com os sets que têm cartas coletadas,
// preservando a seleção atual do usuário (só reconstrói se a lista mudou).
function populateCvSetFilter(){
  const sel=document.getElementById('cv-filter-set');
  if(!sel)return;
  const sids=[...new Set(getOwnedSlotsFlat().map(s=>s.sid))].sort((a,b)=>cvSetLbl(a).localeCompare(cvSetLbl(b)));
  const sig=sids.join(',');
  if(sel.dataset.sig===sig)return;
  const prev=sel.value;
  sel.innerHTML='<option value="">Todas as coleções</option>'+
    sids.map(sid=>`<option value="${sid}">${cvSetLbl(sid)}</option>`).join('');
  sel.dataset.sig=sig;
  if(sids.includes(prev))sel.value=prev;
}

// Classifica um slot em um dos 4 grupos de versão/raridade do filtro
function cvVerGroup(c,ver){
  if(ver==='N')return'normal';
  if(ver==='F'||ver==='RH')return'foil';
  // ver==='SP' (cartas sem versão base): separa IR das demais especiais (ISR/SAR/UR/Promo/Mega...)
  return(c.rare==='Ilustr. Rara')?'ir':'isr_sar';
}

function renderCardsAll(){
  const q=(document.getElementById('cv-search-all')?.value||'').trim().toLowerCase();
  const setFilter=document.getElementById('cv-filter-set')?.value||'';
  const repFilter=document.getElementById('cv-filter-rep')?.value||'all';
  const verFilter=document.getElementById('cv-filter-ver')?.value||'all';
  let slots=getOwnedSlotsFlat();
  if(setFilter)slots=slots.filter(s=>s.sid===setFilter);
  if(repFilter==='rep')slots=slots.filter(s=>s.qty>1);
  if(verFilter!=='all')slots=slots.filter(({c,ver})=>cvVerGroup(c,ver)===verFilter);
  if(q)slots=slots.filter(({c,sid})=>c.name.toLowerCase().includes(q)||c.n.includes(q)||cvSetLbl(sid).toLowerCase().includes(q));
  slots.sort((a,b)=>a.c.name.localeCompare(b.c.name));
  const cEl=document.getElementById('cv-count-all');if(cEl)cEl.textContent=`(${slots.length})`;
  const wrap=document.getElementById('cards-list-all');if(!wrap)return;
  if(!slots.length){
    wrap.innerHTML=`<div class="cv-item-empty">Nenhuma carta encontrada.<br>Marque cartas no Fichário para elas aparecerem aqui.</div>`;
    return;
  }
  wrap.innerHTML=slots.map(({c,sid,ver,key,qty,ligaPrice})=>{
    const imgSrc=imgThumb(getBinderImg(c,sid));
    const col=VER_COLOR[ver]||'#888';
    const listed=cardListings.find(l=>l.slot_key===key);
    return`<div class="cv-item" onclick="openVendaModal('${sid}','${c.n}','${ver}')" title="Colocar à venda">
      ${imgSrc?`<img class="cv-item-img" src="${imgSrc}" loading="lazy" decoding="async" alt="${c.name}" onerror="this.style.display='none'">`:
        `<div class="cv-item-icon">🃏</div>`}
      <div class="cv-item-info">
        <div class="cv-item-name">${c.name}</div>
        <div class="cv-item-meta">${c.n} · ${cvSetLbl(sid)} · <span style="color:${col}">${VER_SHORT[ver]||ver}</span></div>
      </div>
      <div class="cv-item-right">
        <span class="cv-item-qty">×${qty}</span>
        ${ligaPrice?`<div class="cv-item-price">R$${fmtR(ligaPrice)}</div>`:''}
        ${listed?`<div style="font-size:9px;color:var(--accent);font-family:'Space Mono',monospace;margin-top:3px">🏷️ à venda</div>`:''}
      </div>
    </div>`;
  }).join('');
}

function renderCardsVenda(){
  const q=(document.getElementById('cv-search-venda')?.value||'').trim().toLowerCase();
  let list=cardListings.filter(l=>!q||l.card_name.toLowerCase().includes(q)||l.card_n.includes(q)||cvSetLbl(l.set_id).toLowerCase().includes(q));
  list=[...list].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const cEl=document.getElementById('cv-count-venda');if(cEl)cEl.textContent=`(${list.length})`;
  const wrap=document.getElementById('cards-list-venda');if(!wrap)return;
  if(!list.length){
    wrap.innerHTML=`<div class="cv-item-empty">Nenhuma carta à venda ainda.<br>Clique em uma carta à esquerda para anunciar.</div>`;
    updateVendaSelectUI();
    return;
  }
  const allCards=getAllCatalogCards();
  wrap.innerHTML=list.map(l=>{
    const col=VER_COLOR[l.version]||'#888';
    const c=allCards.find(cc=>cc._setId===l.set_id&&cc.n===l.card_n);
    const imgSrc=c?imgThumb(getBinderImg(c,l.set_id)):null;
    const selIdx=_vendaSelected.indexOf(l.slot_key);
    const isSel=selIdx>-1;
    const clickAttr=_vendaSelectMode?`toggleVendaSelect('${l.slot_key}')`:`openVendaModal('${l.set_id}','${l.card_n}','${l.version}')`;
    return`<div class="cv-item${isSel?' cv-selected':''}" onclick="${clickAttr}" title="${_vendaSelectMode?'Selecionar para imagem':'Editar anúncio'}">
      ${_vendaSelectMode?`<div class="cv-select-badge">${isSel?(selIdx+1):''}</div>`:''}
      ${imgSrc?`<img class="cv-item-img" src="${imgSrc}" loading="lazy" decoding="async" alt="${l.card_name}" onerror="this.style.display='none'">`:
        `<div class="cv-item-icon">🏷️</div>`}
      <div class="cv-item-info">
        <div class="cv-item-name">${l.card_name}</div>
        <div class="cv-item-meta">${l.card_n} · ${cvSetLbl(l.set_id)} · <span style="color:${col}">${VER_SHORT[l.version]||l.version}</span> · <span class="cv-cond-chip" style="color:${cvCondInfo(l.condition).color};border-color:${cvCondInfo(l.condition).color}55">${l.condition||'M'}</span> ${cvLangInfo(l.language).flag}</div>
      </div>
      <div class="cv-item-right">
        <span class="cv-item-qty">×${l.qty}</span>
        <div class="cv-item-price">R$${fmtR(l.price)}</div>
        ${_vendaSelectMode?'':`<button class="cv-item-remove" onclick="event.stopPropagation();removeVenda('${l.slot_key}')">remover</button>`}
      </div>
    </div>`;
  }).join('');
  updateVendaSelectUI();
}

// ── SELEÇÃO DE CARTAS PARA GERAR IMAGEM/PDF (sem limite) ──────────
// Cada carta selecionada vira uma página no modelo "cartão de produto"
// (ver openVendaPrintView) — sem cap de 9, dá pra imprimir/exportar
// um catálogo inteiro em PDF via window.print().
let _vendaSelectMode=false,_vendaSelected=[];

function toggleVendaSelectMode(){
  _vendaSelectMode=!_vendaSelectMode;
  _vendaSelected=[];
  renderCardsVenda();
}

function toggleVendaSelect(key){
  const i=_vendaSelected.indexOf(key);
  if(i>-1){_vendaSelected.splice(i,1);}
  else{_vendaSelected.push(key);}
  renderCardsVenda();
}

function updateVendaSelectUI(){
  const btn=document.getElementById('cv-select-toggle');
  const bar=document.getElementById('cv-select-bar');
  const cnt=document.getElementById('cv-select-count');
  const genBtn=document.getElementById('cv-gen-img-btn');
  const msgBtn=document.getElementById('cv-copy-msg-btn');
  if(btn)btn.classList.toggle('active',_vendaSelectMode);
  if(btn)btn.textContent=_vendaSelectMode?'✕ Cancelar seleção':'☑️ Selecionar';
  if(bar)bar.style.display=_vendaSelectMode?'flex':'none';
  if(cnt)cnt.textContent=`${_vendaSelected.length} selecionada${_vendaSelected.length!==1?'s':''}`;
  if(genBtn)genBtn.disabled=_vendaSelected.length===0;
  if(msgBtn)msgBtn.disabled=_vendaSelected.length===0;
}

// ── SISTEMA DE COMPRA — buscar carta e registrar ordem de compra ──
// Lado "bid" do livro de ofertas: não exige que o usuário já tenha a
// carta (busca em getAllCardsWithSet(), catálogo inteiro, não só o
// fichário). Guarda em buy_orders com o mesmo formato de slot_key
// usado em card_listings, pra facilitar o cruzamento (match) no futuro.
function renderCardsBuySearch(){
  const q=(document.getElementById('cv-search-buy')?.value||'').trim().toLowerCase();
  const wrap=document.getElementById('cards-list-buy-search');if(!wrap)return;
  if(!q){
    wrap.innerHTML=`<div class="cv-item-empty">Digite o nome de uma carta pra registrar uma ordem de compra — não precisa ser uma carta que você já tem.</div>`;
    return;
  }
  const results=getAllCatalogCards().filter(c=>c.name.toLowerCase().includes(q)||c.n.includes(q)).slice(0,40);
  if(!results.length){
    wrap.innerHTML=`<div class="cv-item-empty">Nenhuma carta encontrada.</div>`;
    return;
  }
  wrap.innerHTML=results.map(c=>{
    const sid=c._setId;
    const imgSrc=imgThumb(getBinderImg(c,sid));
    return`<div class="cv-item" onclick="openBuyOrderModal('${sid}','${c.n}')" title="Registrar ordem de compra">
      ${imgSrc?`<img class="cv-item-img" src="${imgSrc}" loading="lazy" decoding="async" alt="${c.name}" onerror="this.style.display='none'">`:
        `<div class="cv-item-icon">🃏</div>`}
      <div class="cv-item-info">
        <div class="cv-item-name">${c.name}</div>
        <div class="cv-item-meta">${c.n} · ${cvSetLbl(sid)}</div>
      </div>
      <div class="cv-item-right"><span class="cv-item-qty">+</span></div>
    </div>`;
  }).join('');
}

function renderMyBuyOrders(){
  const q=(document.getElementById('cv-search-buyorders')?.value||'').trim().toLowerCase();
  let list=buyOrders.filter(o=>!q||o.card_name.toLowerCase().includes(q)||o.card_n.includes(q)||cvSetLbl(o.set_id).toLowerCase().includes(q));
  list=[...list].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const cEl=document.getElementById('cv-count-buyorders');if(cEl)cEl.textContent=`(${list.length})`;
  const wrap=document.getElementById('cards-list-buyorders');if(!wrap)return;
  if(!list.length){
    wrap.innerHTML=`<div class="cv-item-empty">Nenhuma ordem de compra registrada ainda.<br>Busque uma carta à esquerda pra começar.</div>`;
    return;
  }
  const allCards=getAllCatalogCards();
  wrap.innerHTML=list.map(o=>{
    const col=VER_COLOR[o.version]||'#888';
    const c=allCards.find(cc=>cc._setId===o.set_id&&cc.n===o.card_n);
    const imgSrc=c?imgThumb(getBinderImg(c,o.set_id)):null;
    return`<div class="cv-item" onclick="openBuyOrderModal('${o.set_id}','${o.card_n}')" title="Editar ordem">
      ${imgSrc?`<img class="cv-item-img" src="${imgSrc}" loading="lazy" decoding="async" alt="${o.card_name}" onerror="this.style.display='none'">`:
        `<div class="cv-item-icon">🎯</div>`}
      <div class="cv-item-info">
        <div class="cv-item-name">${o.card_name}</div>
        <div class="cv-item-meta">${o.card_n} · ${cvSetLbl(o.set_id)} · <span style="color:${col}">${VER_SHORT[o.version]||o.version}</span></div>
      </div>
      <div class="cv-item-right">
        <span class="cv-item-qty">×${o.qty}</span>
        <div class="cv-item-price">R$${fmtR(o.max_price)}</div>
        <button class="cv-item-remove" onclick="event.stopPropagation();removeBuyOrder('${o.slot_key}')">remover</button>
      </div>
    </div>`;
  }).join('');
}

// ── MODAL REGISTRAR ORDEM DE COMPRA ────────────────────────────────
let _mbState=null;
function openBuyOrderModal(setId,n){
  const c=getAllCatalogCards().find(cc=>cc._setId===setId&&cc.n===n);
  if(!c)return;
  const slots=getSlots(c,setId);
  const existing=buyOrders.find(o=>o.set_id===setId&&o.card_n===n);
  const ver=existing?.version||slots[0].ver;
  _mbState={
    setId,n,card:c,slots,ver,
    qty:existing?.qty||1,
    maxPrice:existing?Number(existing.max_price):(lprice(setId,n,slots.find(s=>s.ver===ver)?.price)||0)
  };
  renderBuyOrderModal();
  openModal('mbuy');
}

function renderBuyOrderModal(){
  const st=_mbState;if(!st)return;
  const c=st.card;
  const imgSrc=getBinderImg(c,st.setId);
  const key=slotKey(st.setId+':',st.n,st.ver);
  const existing=buyOrders.find(o=>o.slot_key===key);
  document.getElementById('mbuy-content').innerHTML=`
    ${imgSrc?`<img class="mbinder-img" src="${imgSrc}" alt="${c.name}" onerror="this.style.display='none'">`:''}
    <div class="mbinder-body">
      <div class="mbinder-title">${c.name}</div>
      <div class="mbinder-sub">#${c.n} · ${cvSetLbl(st.setId)}</div>

      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">VERSÃO DESEJADA</div>
      <div class="ver-select-grid">
        ${st.slots.map(s=>{
          const col=VER_COLOR[s.ver];
          const active=st.ver===s.ver;
          return`<div class="ver-card${active?' active':''}" onclick="mbSetVersion('${s.ver}')" style="${active?`border-color:${col};background:${col}18`:''}">
            <div class="ver-card-dot" style="background:${active?col:'transparent'};border-color:${col}"></div>
            <div class="ver-card-label" style="color:${active?col:'var(--text)'}">${VER_LABEL[s.ver]}</div>
          </div>`;
        }).join('')}
      </div>

      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:6px">QUANTIDADE DESEJADA</div>
      <div class="mv-qty-row">
        <button class="mv-qty-btn" onclick="mbChangeQty(-1)">−</button>
        <div class="mv-qty-val" id="mb-qty-val">${st.qty}</div>
        <button class="mv-qty-btn" onclick="mbChangeQty(1)">+</button>
      </div>

      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">VALOR QUE VOCÊ TOPA PAGAR (por unidade)</div>
      <div class="mv-final-price">
        <span style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)">R$</span>
        <input type="number" id="mb-price" step="0.01" value="${st.maxPrice}" oninput="mbSetPrice(this.value)">
      </div>

      <div class="mact">
        <button class="btn-cx" onclick="closeModal('mbuy')">Cancelar</button>
        ${existing?`<button class="btn-cx" style="color:var(--accent)" onclick="removeBuyOrder('${key}')">Remover ordem</button>`:''}
        <button class="btn-add" onclick="saveBuyOrder()">✓ Registrar Interesse</button>
      </div>
    </div>`;
}

function mbSetVersion(ver){
  const st=_mbState;if(!st)return;
  st.ver=ver;
  const s=st.slots.find(sl=>sl.ver===ver);
  st.maxPrice=lprice(st.setId,st.n,s?.price)||st.maxPrice;
  renderBuyOrderModal();
}

function mbChangeQty(d){
  const st=_mbState;if(!st)return;
  st.qty=Math.max(1,st.qty+d);
  const el=document.getElementById('mb-qty-val');if(el)el.textContent=st.qty;
}

function mbSetPrice(v){
  const st=_mbState;if(!st)return;
  st.maxPrice=parseFloat(v)||0;
}

async function saveBuyOrder(){
  const st=_mbState;if(!st||!uid())return;
  if(!st.maxPrice||st.maxPrice<=0){alert('Informe um valor válido.');return;}
  const key=slotKey(st.setId+':',st.n,st.ver);
  const payload={
    buyer_id:uid(),slot_key:key,set_id:st.setId,card_n:st.n,version:st.ver,
    card_name:st.card.name,qty:st.qty,max_price:st.maxPrice,status:'ativa',
    updated_at:new Date().toISOString()
  };
  const{data:res,error}=await sbClient.from('buy_orders').upsert(payload,{onConflict:'buyer_id,slot_key'}).select();
  if(error){
    console.error('[buy_orders upsert]',error);
    alert('Não foi possível salvar a ordem de compra. Verifique se a tabela buy_orders já foi criada no Supabase (rode buy_orders_setup.sql).');
    return;
  }
  buyOrders=buyOrders.filter(o=>o.slot_key!==key);
  if(Array.isArray(res))buyOrders.unshift(...res);
  closeModal('mbuy');_mbState=null;
  renderMyBuyOrders();
  setStatus('Ordem de compra registrada','ok');
}

async function removeBuyOrder(key){
  if(!uid())return;
  const{error}=await sbClient.from('buy_orders').delete().eq('slot_key',key).eq('buyer_id',uid());
  if(error){console.error('[buy_orders delete]',error);alert('Não foi possível remover a ordem.');return;}
  buyOrders=buyOrders.filter(o=>o.slot_key!==key);
  closeModal('mbuy');_mbState=null;
  renderMyBuyOrders();
}

// ── MODAL COLOCAR À VENDA ─────────────────────────────────────────
let _mvState=null;
function openVendaModal(setId,n,ver){
  const c=getAllCatalogCards().find(cc=>cc._setId===setId&&cc.n===n);
  if(!c)return;
  const slots=getSlots(c,setId);
  const s=slots.find(sl=>sl.ver===ver)||slots[0];
  const key=slotKey(setId+':',n,ver);
  const owned=collectedQty.get(key)?.qty||0;
  if(!owned){toast('Você não tem essa carta marcada no fichário.','error');return;}
  const ligaPrice=lprice(setId,n,s.price)||0;
  const existing=cardListings.find(l=>l.slot_key===key);
  _mvState={
    setId,n,ver,key,card:c,owned,ligaPrice,
    qty: existing?Math.min(existing.qty,owned):1,
    discountType: existing?existing.discount_type:'liga_10',
    price: existing?Number(existing.price):+(ligaPrice*0.9).toFixed(2),
    condition: existing?.condition||'M',
    language: existing?.language||'pt-BR'
  };
  renderVendaModal();
  openModal('mvenda');
}

function renderVendaModal(){
  const st=_mvState;if(!st)return;
  const c=st.card;
  const imgSrc=getBinderImg(c,st.setId);
  const col=VER_COLOR[st.ver]||'#888';
  const isIndividual=st.discountType==='individual';
  const existing=cardListings.find(l=>l.slot_key===st.key);
  document.getElementById('mvenda-content').innerHTML=`
    ${imgSrc?`<img class="mbinder-img" src="${imgSrc}" alt="${c.name}" onerror="this.style.display='none'">`:''}
    <div class="mbinder-body">
      <div class="mbinder-title">${c.name}</div>
      <div class="mbinder-sub">#${c.n} · ${cvSetLbl(st.setId)} · <span style="color:${col}">${VER_LABEL[st.ver]||st.ver}</span> ${st.ligaPrice?`· Liga R$${fmtR(st.ligaPrice)}`:''}</div>

      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:6px">QUANTIDADE À VENDA (você tem ${st.owned})</div>
      <div class="mv-qty-row">
        <button class="mv-qty-btn" onclick="mvChangeQty(-1)">−</button>
        <div class="mv-qty-val" id="mv-qty-val">${st.qty}</div>
        <button class="mv-qty-btn" onclick="mvChangeQty(1)">+</button>
      </div>

      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">ESTADO DE CONSERVAÇÃO</div>
      <div class="mv-cond-grid">
        ${CV_CONDITIONS.map(cd=>`<div class="mv-cond-opt${st.condition===cd.code?' active':''}" onclick="mvSetCondition('${cd.code}')" style="${st.condition===cd.code?`border-color:${cd.color};background:${cd.color}18`:''}">
          <div class="mv-cond-code" style="color:${cd.color}">${cd.code}</div>
          <div class="mv-cond-label">${cd.label}</div>
          <div class="mv-cond-sub">${cd.sub}</div>
        </div>`).join('')}
      </div>

      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">IDIOMA</div>
      <div class="mv-lang-grid">
        ${CV_LANGUAGES.map(lg=>`<div class="mv-lang-opt${st.language===lg.code?' active':''}" onclick="mvSetLanguage('${lg.code}')">
          <span>${lg.flag}</span><span>${lg.label}</span>
        </div>`).join('')}
      </div>

      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">PREÇO DE VENDA</div>
      <div class="mv-disc-grid">
        ${MV_DISCOUNTS.map(pct=>{
          const dt='liga_'+pct;
          const p=st.ligaPrice?+(st.ligaPrice*(1-pct/100)).toFixed(2):null;
          return`<div class="mv-disc-opt${st.discountType===dt?' active':''}" onclick="mvSetDiscount('${dt}')">
            <div class="mv-disc-label">Liga -${pct}%</div>
            <div class="mv-disc-price">${p?'R$'+fmtR(p):'—'}</div>
          </div>`;
        }).join('')}
        <div class="mv-disc-opt${isIndividual?' active':''}" onclick="mvSetDiscount('individual')">
          <div class="mv-disc-label">Preço individual</div>
          <div class="mv-disc-price">manual</div>
        </div>
      </div>

      <div class="mv-final-price">
        <span style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)">R$</span>
        <input type="number" id="mv-price" step="0.01" value="${st.price}" ${isIndividual?'':'disabled'} oninput="mvSetPrice(this.value)">
      </div>

      <div class="mact">
        <button class="btn-cx" onclick="closeModal('mvenda')">Cancelar</button>
        ${existing?`<button class="btn-cx" style="color:var(--accent)" onclick="removeVenda('${st.key}')">Remover da venda</button>`:''}
        <button class="btn-add" onclick="saveVenda()">✓ Colocar à Venda</button>
      </div>
    </div>`;
}

function mvChangeQty(d){
  const st=_mvState;if(!st)return;
  st.qty=Math.max(1,Math.min(st.owned,st.qty+d));
  const el=document.getElementById('mv-qty-val');if(el)el.textContent=st.qty;
}

function mvSetDiscount(dt){
  const st=_mvState;if(!st)return;
  st.discountType=dt;
  if(dt!=='individual'){
    const pct=+dt.split('_')[1];
    st.price=st.ligaPrice?+(st.ligaPrice*(1-pct/100)).toFixed(2):0;
  }
  renderVendaModal();
}

function mvSetPrice(v){
  const st=_mvState;if(!st)return;
  st.price=parseFloat(v)||0;
}

function mvSetCondition(code){
  const st=_mvState;if(!st)return;
  st.condition=code;
  renderVendaModal();
}

function mvSetLanguage(code){
  const st=_mvState;if(!st)return;
  st.language=code;
  renderVendaModal();
}

async function saveVenda(){
  const st=_mvState;if(!st||!uid())return;
  if(st.qty<1||st.qty>st.owned){toast('Quantidade inválida.','error');return;}
  if(!st.price||st.price<=0){toast('Informe um preço de venda válido.','error');return;}
  const payload={
    user_id:uid(),slot_key:st.key,set_id:st.setId,card_n:st.n,version:st.ver,
    card_name:st.card.name,qty:st.qty,price:st.price,discount_type:st.discountType,
    liga_price:st.ligaPrice||null,condition:st.condition||'M',language:st.language||'pt-BR',updated_at:new Date().toISOString()
  };
  const{data:res,error}=await sbClient.from('card_listings').upsert(payload,{onConflict:'user_id,slot_key'}).select();
  if(error){
    console.error('[card_listings upsert]',error);
    alert('Não foi possível salvar o anúncio. Verifique se a tabela card_listings já foi criada no Supabase (rode card_listings_setup.sql).');
    return;
  }
  cardListings=cardListings.filter(l=>l.slot_key!==st.key);
  if(Array.isArray(res))cardListings.unshift(...res);
  closeModal('mvenda');_mvState=null;
  renderCardsAll();renderCardsVenda();
}

async function removeVenda(key){
  if(!uid())return;
  const{error}=await sbClient.from('card_listings').delete().eq('slot_key',key).eq('user_id',uid());
  if(error){console.error('[card_listings delete]',error);alert('Não foi possível remover o anúncio.');return;}
  cardListings=cardListings.filter(l=>l.slot_key!==key);
  closeModal('mvenda');_mvState=null;
  renderCardsAll();renderCardsVenda();
}

// ── GERAR IMAGEM/PDF (modelo "cartão de produto", 1 carta por página) ──
// Sem limite de cartas: cada carta selecionada vira uma página inteira
// no popup de impressão, no modelo de divulgação (imagem grande + painel
// de detalhes). O usuário aperta "Imprimir/Salvar PDF" e usa o diálogo
// nativo do navegador — dá pra baixar 1 carta ou um catálogo com várias.
// Por ser HTML normal (não canvas), o navegador renderiza as imagens das
// cartas do jeito que sempre renderizou — sem risco de bloqueio de CORS
// que existia na exportação em PNG via canvas.
let _vimgItems=[];

function openVendaImageModal(){
  if(!_vendaSelected.length)return;
  const allCards=getAllCatalogCards();
  _vimgItems=_vendaSelected.map(key=>{
    const l=cardListings.find(x=>x.slot_key===key);
    if(!l)return null;
    const c=allCards.find(cc=>cc._setId===l.set_id&&cc.n===l.card_n);
    const imgSrc=c?getBinderImg(c,l.set_id):null;
    return{l,c,imgSrc};
  }).filter(Boolean);
  if(!_vimgItems.length)return;

  const total=_vimgItems.reduce((s,{l})=>s+Number(l.price||0),0);
  document.getElementById('mvimg-content').innerHTML=`
    <div class="vimg-wrap">
      <div class="vimg-title">🖨️ Gerar Imagem/PDF</div>
      <div class="vimg-sub">${_vimgItems.length} carta(s) selecionada(s). Cada carta vira uma página no modelo de divulgação — sem limite de quantidade, ótimo pra imprimir um catálogo.</div>
      <div class="vimg-list-preview">
        ${_vimgItems.map(({l})=>`<div class="vimg-preview-row">
          <span>${l.card_name} · #${l.card_n} · ${cvCondInfo(l.condition).code} · ${cvLangInfo(l.language).flag}</span>
          <b>R$${fmtR(l.price)}</b>
        </div>`).join('')}
      </div>
      <div class="vimg-actions">
        <div class="vimg-total">Total: <b>R$${fmtR(total)}</b></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-cx" onclick="closeModal('mvimg')">Fechar</button>
          <button class="cv-msg-btn" onclick="copyVendaMessage(_vimgItems)">📋 Copiar Mensagem</button>
          <button class="btn-add" onclick="openVendaPrintView()">🖨️ Gerar Imagem/PDF</button>
        </div>
      </div>
    </div>`;
  openModal('mvimg');
}

// Uma página completa no modelo "cartão de produto" pra uma carta
function mktProductPageHTML({l,c,imgSrc}){
  const cond=cvCondInfo(l.condition);
  const lang=cvLangInfo(l.language);
  const rarity=c?.rare||'';
  return`<div class="page">
    <div class="mkc-header">
      <div class="mkc-logo">MYDECK</div>
      <div class="mkc-tagline">CARTAS À VENDA</div>
    </div>
    <div class="mkc-main">
      <div class="mkc-imgwrap">
        ${imgSrc?`<img src="${imgSrc}" alt="${l.card_name}">`:`<div class="mkc-noimg">🃏</div>`}
      </div>
      <div class="mkc-info">
        <div class="mkc-name">${l.card_name}</div>
        <div class="mkc-pill">${rarity?rarity+' · ':''}#${l.card_n}${l.qty>1?' · '+l.qty+'x':''}</div>
        <div class="mkc-box">
          <div class="mkc-box-label">VALOR</div>
          <div class="mkc-box-value">R$ ${fmtR(l.price)}</div>
        </div>
        <div class="mkc-row">
          <div class="mkc-row-label">QUALIDADE</div>
          <div class="mkc-row-content">
            <div class="mkc-badge" style="border-color:${cond.color};color:${cond.color}">${cond.code}</div>
            <div><b>${cond.label}</b><br><span>(${cond.sub})</span></div>
          </div>
        </div>
        <div class="mkc-row">
          <div class="mkc-row-label">IDIOMA</div>
          <div class="mkc-row-content">
            <div class="mkc-lang-pill">${lang.flag} ${lang.label.toUpperCase()}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="mkc-trust">
      <div class="mkc-trust-item"><span>🛡️</span><div>COMPRA 100%<br>SEGURA</div></div>
      <div class="mkc-trust-item"><span>🚚</span><div>ENVIO<br>RÁPIDO</div></div>
      <div class="mkc-trust-item"><span>✅</span><div>CARTAS ORIGINAIS<br>E AUTÊNTICAS</div></div>
    </div>
    <div class="mkc-cta">
      <div class="mkc-cta-icon">🛒</div>
      <div class="mkc-cta-text"><b>QUER VENDER RÁPIDO E FÁCIL?</b><br>ANUNCIE SUAS CARTAS AGORA MESMO!</div>
      <div class="mkc-cta-btn">ACESSE AGORA →</div>
    </div>
    <div class="mkc-footer">🌐 ${MYDECK_SITE_URL.replace(/^https?:\/\//,'')}</div>
  </div>`;
}

function openVendaPrintView(){
  if(!_vimgItems.length)return;
  const popup=window.open('','_blank');
  if(!popup){alert('Permita pop-ups pra gerar a imagem/PDF.');return;}

  popup.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>MyDeck — Cartas à Venda</title>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0d0f18; font-family:'DM Sans',sans-serif; color:#eef0f8; }
    .page {
      width:210mm; min-height:297mm; padding:14mm; position:relative;
      background:radial-gradient(ellipse at top,#141827,#0a0c14 65%);
      page-break-after:always; break-after:page;
      display:flex; flex-direction:column;
    }
    .mkc-header { text-align:center; padding-bottom:8mm; border-bottom:1px solid #2a2e42; margin-bottom:10mm; }
    .mkc-logo { font-family:'Bebas Neue',sans-serif; font-size:30pt; letter-spacing:3px; color:#fff; }
    .mkc-tagline { font-family:'Space Mono',monospace; font-size:10pt; letter-spacing:5px; color:#ffd166; margin-top:2mm; }
    .mkc-main { display:flex; gap:10mm; flex:1; }
    .mkc-imgwrap {
      width:85mm; flex-shrink:0; border:2px solid #2a2e42; border-radius:6mm; padding:5mm;
      background:#111422; display:flex; align-items:center; justify-content:center;
      box-shadow:0 0 0 1px rgba(255,209,102,.15) inset;
    }
    .mkc-imgwrap img { width:100%; border-radius:3mm; display:block; }
    .mkc-noimg { font-size:48pt; opacity:.3; }
    .mkc-info { flex:1; padding-top:4mm; }
    .mkc-name { font-family:'Bebas Neue',sans-serif; font-size:24pt; letter-spacing:1px; color:#fff; margin-bottom:6mm; }
    .mkc-pill {
      display:inline-block; border:1px solid #2a2e42; border-radius:8mm; padding:2mm 6mm;
      font-family:'Space Mono',monospace; font-size:10pt; color:#c8cfe8; margin-bottom:8mm;
    }
    .mkc-box { border:1px solid #ffd16655; border-radius:4mm; padding:5mm 6mm; margin-bottom:8mm; background:#111422; }
    .mkc-box-label { font-family:'Space Mono',monospace; font-size:8pt; letter-spacing:2px; color:#52597a; margin-bottom:2mm; }
    .mkc-box-value { font-family:'Bebas Neue',sans-serif; font-size:30pt; color:#ffd166; }
    .mkc-row { margin-bottom:7mm; }
    .mkc-row-label { font-family:'Space Mono',monospace; font-size:8pt; letter-spacing:2px; color:#52597a; margin-bottom:3mm; }
    .mkc-row-content { display:flex; align-items:center; gap:5mm; }
    .mkc-badge {
      border:2px solid; border-radius:3mm; padding:2mm 4mm; font-family:'Bebas Neue',sans-serif;
      font-size:16pt; text-align:center; min-width:16mm;
    }
    .mkc-row-content > div:last-child { font-size:10pt; line-height:1.5; }
    .mkc-row-content > div:last-child span { color:#52597a; font-size:9pt; }
    .mkc-lang-pill {
      border:1px solid #2a2e42; border-radius:8mm; padding:2mm 6mm; font-family:'Space Mono',monospace;
      font-size:10pt; letter-spacing:1px; background:#111422;
    }
    .mkc-trust {
      display:flex; justify-content:space-around; padding:6mm 0; margin-top:8mm;
      border-top:1px solid #2a2e42; border-bottom:1px solid #2a2e42;
    }
    .mkc-trust-item { text-align:center; font-family:'Space Mono',monospace; font-size:8pt; letter-spacing:.5px; color:#c8cfe8; }
    .mkc-trust-item span { display:block; font-size:16pt; margin-bottom:2mm; }
    .mkc-cta {
      display:flex; align-items:center; gap:6mm; margin-top:8mm; padding:6mm 8mm; border-radius:4mm;
      background:linear-gradient(120deg,#e63946,#7a0c14);
    }
    .mkc-cta-icon { font-size:20pt; }
    .mkc-cta-text { flex:1; font-size:10pt; line-height:1.5; color:#fff; }
    .mkc-cta-btn {
      background:#ffd166; color:#1c1f2e; font-family:'Space Mono',monospace; font-weight:700;
      font-size:9pt; padding:3mm 6mm; border-radius:2mm; white-space:nowrap;
    }
    .mkc-footer { text-align:center; font-family:'Space Mono',monospace; font-size:9pt; color:#52597a; margin-top:8mm; }
    @media print {
      html,body{width:210mm;}
      .page{page-break-after:always; break-after:page;}
      .no-print{display:none!important;}
    }
  </style></head><body>`);

  popup.document.write(`<div class="no-print" style="position:fixed;top:10px;right:10px;z-index:999;display:flex;gap:8px">
    <span style="font-size:12px;color:#ccc;align-self:center;font-family:sans-serif">${_vimgItems.length} página${_vimgItems.length!==1?'s':''}</span>
    <button onclick="window.print()" style="background:#06d6a0;color:#000;border:none;padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖨️ Imprimir / Salvar PDF</button>
    <button onclick="window.close()" style="background:#1e2436;color:#aaa;border:none;padding:8px 12px;border-radius:6px;cursor:pointer">✕</button>
  </div>`);

  _vimgItems.forEach(item=>popup.document.write(mktProductPageHTML(item)));
  popup.document.write(`</body></html>`);
  popup.document.close();
}

// ── MENSAGEM DE VENDA (texto pronto pra colar no WhatsApp/ML) ─────
function buildVendaMessage(items){
  const lines=[`🃏 *CARTAS À VENDA* — MyDeck TCG`,''];
  items.forEach(({l})=>{
    const qtyStr=l.qty>1?` (${l.qty}x)`:'';
    const cond=cvCondInfo(l.condition);
    lines.push(`🔹 ${l.card_name} #${l.card_n} [${VER_LABEL[l.version]||l.version} · ${cond.code} - ${cond.label}]${qtyStr} — *R$${fmtR(l.price)}*`);
  });
  const total=items.reduce((s,{l})=>s+Number(l.price||0)*Number(l.qty||1),0);
  lines.push('',`💰 Total: *R$${fmtR(total)}*`,'',`🔥 Quer vender/comprar rápido e fácil? Acesse ${MYDECK_SITE_URL}`);
  return lines.join('\n');
}

async function copyVendaMessage(items){
  if(!items||!items.length)return;
  const text=buildVendaMessage(items);
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>setStatus('Mensagem copiada! Cole no WhatsApp.','ok')).catch(()=>{});
  }
  showTextExportModal(text,`Cartas à venda — ${items.length} carta${items.length!==1?'s':''}`);
}

function copyVendaMessageFromSelection(){
  if(!_vendaSelected.length){setStatus('Selecione ao menos uma carta','warning');return;}
  const items=_vendaSelected.map(key=>{
    const l=cardListings.find(x=>x.slot_key===key);
    return l?{l}:null;
  }).filter(Boolean);
  copyVendaMessage(items);
}

// ── MODAL CARTA TIRADA EXPANDIDA ─────────────────────────────────
function openCardModal(card){
  if(typeof card==='string') card=JSON.parse(card);
  const imgSrc=getCardImg(card);const ver=getVerFromRar(card.rar||'');
  document.getElementById('card-modal-content').innerHTML=`
    ${imgSrc?`<img class="cmc-img" src="${imgSrc}" alt="${card.name}" onerror="this.style.display='none'">`:
      `<div style="height:180px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:40px">${card.icon||'🃏'}</div>`}
    <div class="cmc-body">
      <div class="cmc-title">${card.name}</div>
      <div class="cmc-sub">${card.num||''} · ${card.rar||''}</div>
      <div class="cmc-grid">
        <div class="cmc-item"><label>Origem</label><span>${card.src||'—'}</span></div>
        <div class="cmc-item"><label>Lote</label><span>${(card.lote||'—').split('—').pop().trim()}</span></div>
        <div class="cmc-item"><label>Valor Médio</label><span style="color:var(--teal)">${card.price?'R$'+fmtR(card.price):'—'}</span></div>
        <div class="cmc-item"><label>Fonte</label><span>${card.psrc||'—'}</span></div>
        ${card.pmin&&card.pmax?`<div class="cmc-item"><label>Mínimo</label><span>R$${fmtR(card.pmin)}</span></div>
          <div class="cmc-item"><label>Máximo</label><span>R$${fmtR(card.pmax)}</span></div>`:''}
      </div>
      <div class="cmc-vers">
        <div class="cmc-dot" style="background:${VER_COLOR[ver]};border-radius:3px;width:12px;height:12px"></div>
        <span style="font-family:'Space Mono',monospace;font-size:10px">${VER_LABEL[ver]}</span>
      </div>
    </div>`;
  openModal('card-modal');
}

// ── FICHÁRIO ────────────────────────────────────────────────────
let currentSet='me04';

// ── NAVEGAÇÃO DE BUSCA ───────────────────────────────────────────
let _binderNavIdx=0,_binderNavTotal=0,_lastBinderQuery='';

function binderNavGo(dir){
  if(_binderNavTotal===0)return;
  _binderNavIdx=(_binderNavIdx+dir+_binderNavTotal)%_binderNavTotal;
  _binderNavUpdate();
  _binderNavScroll();
}
function _binderNavUpdate(){
  const pos=document.querySelector('.bnav-pos');
  if(pos)pos.textContent=`${_binderNavIdx+1} / ${_binderNavTotal}`;
}
function _binderNavScroll(){
  const el=document.querySelector(`[data-nav-idx="${_binderNavIdx}"]`);
  if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.classList.remove('nav-focused');
  void el.offsetWidth; // reflow para reiniciar animação
  el.classList.add('nav-focused');
  setTimeout(()=>el.classList.remove('nav-focused'),1500);
}

function renderTabs(){
  const container=document.getElementById('binder-tabs');
  if(!container)return;
  const cur=currentSet;
  const hasME=myCollections.some(id=>SET_CATALOG.find(s=>s.id===id&&s.series==='ME'));
  const hasSV=myCollections.some(id=>SET_CATALOG.find(s=>s.id===id&&s.series==='SV'));
  let html=`<div class="ctab${cur==='__custom__'?' active':''}" id="fic-tab-custom"
    onclick="switchSet('__custom__',this)"
    style="${cur==='__custom__'?'border-bottom:2px solid #a855f7;color:#a855f7':''}">
    ✨ Meus <span class="ctab-n">Fichários</span></div>`;
  // Fichários personalizados fixados (22/07/2026) — aparecem como abas próprias,
  // igual as coleções normais, além de dentro de "Meus Fichários".
  // 20/08/2026: cada iteração ganhou seu próprio try/catch — antes, se UM
  // fichário fixado ou UM set desse erro (ex: dado incompleto por causa da
  // instabilidade do Supabase, ou entrada sem "label" no catálogo), a
  // exceção interrompia o forEach inteiro ANTES do `container.innerHTML=html`
  // no final rodar — resultado: a barra de abas inteira ficava travada no
  // que já estava na tela (só o set inicial), sem "Meus Fichários" nem os
  // outros sets, mesmo os que não tinham nada de errado.
  pinnedBinders.forEach(pid=>{
    try{
      const b=customBinders.find(x=>String(x.id)===pid);
      if(!b)return;
      const tabId='__cb__'+pid;
      const isActive=cur===tabId;
      const col=b.cover_color||'#a855f7';
      html+=`<div class="ctab${isActive?' active':''}" id="fic-tab-cb-${pid}"
        onclick="switchSet('${tabId}',this)"
        style="${isActive?`border-bottom:2px solid ${col};color:${col}`:''}">
        ${b.emoji||'📚'} ${b.name} <span class="ctab-n">${getBinderCards(b).length}</span></div>`;
    }catch(e){console.error('[renderTabs] falha ao montar aba do fichário fixado',pid,e);}
  });
  let lastSeries='';
  myCollections.forEach(id=>{
    try{
      const s=SET_CATALOG.find(s=>s.id===id);
      if(!s)return;
      if(hasME&&hasSV&&lastSeries&&lastSeries!==s.series){
        html+=`<div style="width:1px;background:var(--border);margin:4px 4px;flex-shrink:0"></div>`;
      }
      lastSeries=s.series;
      const isActive=cur===id;
      const lbl=id.toUpperCase().replace('SV8PT5','SV8.5').replace('SV6PT5','SV6.5')
                  .replace('SV4PT5','SV4.5').replace('SV3PT5','151');
      // NOVO 02/08/2026 (relato de usuários: queriam o nome completo da coleção
      // na aba, não só o código ME05/ME06/etc) — s.label já tinha o nome certo
      // (ex "ME05(PBL) — Escuridão Absoluta"), só nunca era usado aqui. Pega só
      // a parte depois do "—" (o nome bonito, sem repetir o código/sigla entre
      // parênteses) e mostra ao lado do código, num span separado que não herda
      // o uppercase do .ctab (nome próprio fica mais legível em minúsculas).
      const niceName=((s.label||'').split('—')[1]||'').trim();
      html+=`<div class="ctab${isActive?' active':''}" id="fic-tab-${id}"
        onclick="switchSet('${id}',this)"
        ${s.upcoming?'style="opacity:.7"':''}>
        ${s.emoji} ${lbl}${niceName?` <span class="ctab-name">${niceName}</span>`:''} <span class="ctab-n">${s.upcoming?'breve':s.cards}</span></div>`;
    }catch(e){console.error('[renderTabs] falha ao montar aba do set',id,e);}
  });
  container.innerHTML=html;
  if(typeof updateHsub==='function')updateHsub();
}

function switchSet(id,el){
  currentSet=id;
  if(!shareMode && !_routingFromHash){
    const h='fichario/'+encodeURIComponent(id);
    if(location.hash.replace(/^#/,'')!==h) history.replaceState(null,'','#'+h);
  }
  renderTabs();
  if(id==='__custom__'){renderCustomBindersHome();return;}
  if(String(id).startsWith('__cb__')){
    const binderId=id.slice(6);
    const b=customBinders.find(x=>String(x.id)===binderId);
    if(b)openCustomBinderView(b);
    return;
  }
  // CORRIGIDO 22/07/2026: faltava restaurar .bctl aqui — abrir "Meus Fichários"
  // ou um fichário personalizado (openCustomBinderView/renderCustomBindersHome)
  // escondem a barra de busca/filtros/copiar lista/imprimir/compartilhar via
  // display:none direto no elemento. Antes, só o go() (troca de página) restaurava
  // isso — trocar de aba DENTRO do fichário (ex: "Meus Fichários" → ME04) não
  // passava por lá, então a barra sumia pra sempre em qualquer coleção normal
  // até recarregar a página. Ver [[feedback_coding]].
  const bctl=document.querySelector('.bctl');if(bctl)bctl.style.display='';
  const binderCtrl=document.getElementById('fic-binder-controls');
  const setInfo=document.getElementById('fic-set-info');
  const bstats=document.getElementById('binder-stats');
  if(binderCtrl)binderCtrl.style.display='';
  if(setInfo)setInfo.style.display='';
  if(bstats)bstats.style.display='';
  renderBinder();
  const{cards:_sc}=getSetData();
  fetchLivePrices(id,_sc);
}
function getSetData(){
  const me03c=typeof CARDS_ME03!=='undefined'?CARDS_ME03:[];
  const me05c=typeof CARDS_ME05!=='undefined'?CARDS_ME05:[];
  const me06c=typeof CARDS_ME06!=='undefined'?CARDS_ME06:[];
  const me2pt5c=typeof CARDS_ME2PT5!=='undefined'?CARDS_ME2PT5:[];
  const map={
    me06:{cards:me06c,imgFn:imgMe06,label:'ME06 — Esmeralda Tempestuosa',upcoming:true,
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Secretas',filter:c=>!c.base}]},
    me2pt5:{cards:me2pt5c,imgFn:imgMe2pt5,label:'ME2.5(ASC) — Heróis Excelsos', // lançou 30/jan/2026
      sections:[{lbl:'📄 Base — 001 a 217',filter:c=>c.base},{lbl:'✨ Secretas — 218 a 295',filter:c=>!c.base}]},
    me05:{cards:me05c,imgFn:imgMe05,label:'ME05(PBL) — Escuridão Absoluta', // lançou 17/jul/2026 — já ativo, consistente com SET_CATALOG
      sections:[{lbl:'📄 Base — 001 a 081',filter:c=>c.base},{lbl:'✨ Secretas — 082 a 118',filter:c=>!c.base}]},
    me04:{cards:CARDS,imgFn:imgMe04,label:'ME04(CRI) — Caos Ascendente',
      sections:[{lbl:'📄 Base — 001 a 086',filter:c=>c.base},{lbl:'✨ Secretas — 087 a 122',filter:c=>!c.base}]},
    me03:{cards:me03c,imgFn:imgMe03,label:'ME03(POR) — Equilíbrio Perfeito',
      sections:[{lbl:'📄 Base — 001 a 070',filter:c=>c.base},{lbl:'✨ Secretas — 071 a 120',filter:c=>!c.base}]},
    me02:{cards:CARDS_ME02,imgFn:imgMe02,label:'ME02(PFL) — Fogo Fantasmagórico',
      sections:[{lbl:'📄 Base — 001 a 094',filter:c=>c.base},{lbl:'✨ Secretas — 095 a 130',filter:c=>!c.base}]},
    meg: {cards:CARDS_MEG,imgFn:imgMeg,label:'MEG(MEG) — Megaevolução',
      sections:[{lbl:'📄 Base — 001 a 132',filter:c=>c.base},{lbl:'✨ Secretas — 133 a 188',filter:c=>!c.base}]},
    mep: {cards:CARDS_MEP,imgFn:imgMep,label:'MEP(MEP) — Promos Mega Evolução (todas)',
      sections:[
        {lbl:'📦 Promos MEP001–036 — Staff/Torneio/Jumbo/Pokémon Center', filter:c=>c.series==='Promos MEP 001–036'},
        {lbl:'⭐ Série 1 — Kanto · Sinnoh · Alola (MEP037–045)',  filter:c=>c.series&&c.series.includes('Série 1')},
        {lbl:'⭐ Série 2 — Johto · Unova · Galar (MEP046–054)',   filter:c=>c.series&&c.series.includes('Série 2')},
        {lbl:'⭐ Série 3 — Hoenn · Kalos · Paldea (MEP055–063)',  filter:c=>c.series&&c.series.includes('Série 3')},
        {lbl:'📦 Promos MEP064–081 — Equilíbrio Perfeito/Caos Ascendente', filter:c=>c.series==='Promos MEP 064–081'},
        {lbl:'📦 Promos MEP082–110 — Ex\'s, Legendary Birds & mais', filter:c=>c.series==='Promos MEP 082–110'},
        {lbl:'📦 Outros',                                          filter:c=>!c.series||(!c.series.includes('Série')&&c.series!=='Promos MEP 001–036'&&c.series!=='Promos MEP 064–081'&&c.series!=='Promos MEP 082–110')},
      ]},
    // ── Pokémon GO (2022) ───────────────────────────────────────────
    pgo: {cards:typeof CARDS_PGO!=='undefined'?CARDS_PGO:[], label:'PGO(PGO) — Pokémon GO',
      sections:[{lbl:'📄 Base — 001 a 078',filter:c=>c.base},{lbl:'✨ Secretas — 079 a 088',filter:c=>!c.base}]},
    // ── Escarlate e Violeta (2023-2025) ─────────────────────────────
    svp:   {cards:typeof CARDS_SVP!=='undefined'?CARDS_SVP:[],    label:'SVP(SVP) — Promos Escarlate e Violeta',
      sections:[{lbl:'🎫 Promos (todas)',filter:c=>true}]},
    sv10:  {cards:typeof CARDS_SV10!=='undefined'?CARDS_SV10:[],  label:'SV10(DRI) — Rivais do Destino',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    zsv10pt5:{cards:typeof CARDS_ZSV10PT5!=='undefined'?CARDS_ZSV10PT5:[],label:'EV10.5(BLK) — Raio Preto',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    rsv10pt5:{cards:typeof CARDS_RSV10PT5!=='undefined'?CARDS_RSV10PT5:[],label:'EV10.5(WHT) — Fogo Branco',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv9:   {cards:typeof CARDS_SV9!=='undefined'?CARDS_SV9:[],    label:'SV9(JTG) — Jornada Juntos',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv8pt5:{cards:typeof CARDS_SV8PT5!=='undefined'?CARDS_SV8PT5:[],label:'SV8.5(PRE) — Evoluções Prismáticas',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv8:   {cards:typeof CARDS_SV8!=='undefined'?CARDS_SV8:[],    label:'SV8(SSP) — Faíscas Furiosas',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv7:   {cards:typeof CARDS_SV7!=='undefined'?CARDS_SV7:[],    label:'SV7(SCR) — Coroa Estelar',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv6pt5:{cards:typeof CARDS_SV6PT5!=='undefined'?CARDS_SV6PT5:[],label:'SV6.5(SFA) — Véu das Sombras',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv6:   {cards:typeof CARDS_SV6!=='undefined'?CARDS_SV6:[],    label:'SV6(TWM) — Máscara do Futuro',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv5:   {cards:typeof CARDS_SV5!=='undefined'?CARDS_SV5:[],    label:'SV5(TEF) — Forças Triplas',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv4pt5:{cards:typeof CARDS_SV4PT5!=='undefined'?CARDS_SV4PT5:[],label:'SV4.5(PAF) — Destinos de Paldea',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv4:   {cards:typeof CARDS_SV4!=='undefined'?CARDS_SV4:[],    label:'SV4(PAR) — Fenda Temporal',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv3pt5:{cards:typeof CARDS_SV3PT5!=='undefined'?CARDS_SV3PT5:[],label:'SV3.5(MEW) — Coleção 151',
      sections:[{lbl:'📄 Base (001-165)',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv3:   {cards:typeof CARDS_SV3!=='undefined'?CARDS_SV3:[],    label:'SV3(OBF) — Obsidiana Chamejante',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv2:   {cards:typeof CARDS_SV2!=='undefined'?CARDS_SV2:[],    label:'SV2(PAL) — Evolução em Paldea',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
    sv1:   {cards:typeof CARDS_SV1!=='undefined'?CARDS_SV1:[],    label:'SV1(SVI) — Escarlate e Violeta',
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais',filter:c=>!c.base}]},
  };
  if(!map[currentSet]){
    const ls=(window.LEGACY_SETS||[]).find(x=>x.id===currentSet);
    if(ls)return{cards:ls.data,label:ls.label,
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Especiais / Secretas',filter:c=>!c.base}]};
  }
  return map[currentSet]||map.me04;
}

// renderBinder() foi movida pra fichario_patch.js (carrega depois e sobrescreve
// a global — a versão antiga que ficava aqui nunca era executada). Removida em
// 15/jul/2026 na conferência geral pra não confundir manutenção futura.
// Ver ANALISE_GERAL_15jul2026.md item 1.4.

// ── EXPORTAR LISTA EM TEXTO (para colar na Liga Pokémon / MYP Cards) ──
const MYDECK_SITE_URL='https://mydecktcg.com.br';
const TYPE_ICON={Grama:'🌿',Fogo:'🔥',Aquático:'💧',Raio:'⚡',Psíquico:'🔮',Lutador:'🥊',Escuridão:'⚫',Metal:'⚙️',Dragão:'🐉',Incolor:'⬜',Treinador:'🎴'};

function exportBinderText(){
  const{cards,label}=getSetData();
  const pfx=currentSet;
  const q=document.getElementById('bsrch').value.toLowerCase();
  const oc=document.getElementById('fc').checked,om=document.getElementById('fm').checked,oi=document.getElementById('fi2').checked;

  function visible(c){
    const term=(c.name+c.n+(c.type||'')).toLowerCase();
    if(q&&!term.includes(q))return false;
    const slots=getSlots(c,pfx);
    const anyCol=slots.some(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    const allCol=slots.every(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    // Mesma correção do cardVisible: "Só faltantes" tem que mostrar cartas que
    // ainda faltam alguma versão (foil/reverse holo), não só as que não têm
    // nenhuma versão. Ver [[feedback_coding]].
    if(oc&&!anyCol)return false;if(om&&allCol)return false;if(oi&&!c.important)return false;
    return true;
  }

  const filterLbl=oc?'✅ Só coletadas':om?'🔍 Só faltantes':'📚 Todas';
  const visibleCards=cards.filter(visible);
  let slotsTotal=0,slotsCol=0,cardsComplete=0;
  // Valor consolidado — pedido do Eduardo: em "Só coletadas" mostra o total já
  // gasto (preço × qtd de cada versão marcada); em "Cartas faltantes" mostra o
  // total que falta pra fechar (preço × 1 de cada versão que ainda não tem,
  // já que "fechar" só precisa de 1 cópia por slot, não da qtd que a pessoa quer).
  let valorColetado=0,valorFaltante=0;
  const rows=visibleCards.map(c=>{
    const slots=getSlots(c,pfx);
    const dp=lprice(pfx,c.n,c.price);
    const priceStr=dp?` — 💰 R$${fmtR(dp)}`:'';
    const icon=TYPE_ICON[c.type||'']||'🃏';

    // Detalha o status de CADA versão da carta (Normal/Foil/Reverse Holo/Especial)
    // em vez de marcar a carta inteira como ✅ só por ter uma versão qualquer.
    // Isso é o que fazia o master set "fechar" no texto exportado mesmo faltando
    // foils/reverse holos. Ver [[feedback_coding]].
    const slotParts=slots.map(s=>{
      const key=slotKey(pfx+':',c.n,s.ver);
      const has=collected.has(key);
      slotsTotal++;if(has)slotsCol++;
      const sp=s.price!=null?s.price:dp;
      if(has){
        const qty=(typeof collectedQty!=='undefined'&&collectedQty.get(key)?.qty)||1;
        if(sp)valorColetado+=sp*qty;
        // "quantidade de cada uma que listei": só faz sentido mostrar ×N em
        // "Só coletadas" — nas outras visões (Todas/Faltantes) fica ruído.
        return oc&&qty>1?`${VER_SHORT[s.ver]}✅×${qty}`:`${VER_SHORT[s.ver]}✅`;
      }
      if(sp)valorFaltante+=sp;
      return`${VER_SHORT[s.ver]}❌`;
    }).join(' ');
    const allCol=slots.every(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    const anyCol=slots.some(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    if(allCol)cardsComplete++;
    const statusIcon=allCol?'✅':anyCol?'🟡':'❌';
    return`${statusIcon} ${icon} *${c.n}* ${c.name}${c.rare?` _(${c.rare})_`:''} [${slotParts}]${priceStr}`;
  });

  const dateStr=new Date().toLocaleDateString('pt-BR');
  const pctSlots=slotsTotal>0?(slotsCol/slotsTotal*100).toFixed(0):0;
  const header=`🎴✨ *${label}* ✨🎴\n${filterLbl}${q?` · busca: "${q}"`:''}\n📅 ${dateStr}\n━━━━━━━━━━━━━━━━━━`;
  let valorLine='';
  if(oc)valorLine=`\n💰 *Valor total da coleção (o que já tenho):* R$${fmtR(valorColetado)}`;
  else if(om)valorLine=`\n💸 *Valor pra fechar a coleção:* R$${fmtR(valorFaltante)}`;
  const footer=`━━━━━━━━━━━━━━━━━━\n📦 Cartas completas: *${cardsComplete}/${rows.length}*\n🎯 Versões (master set): *${slotsCol}/${slotsTotal}* (${pctSlots}%)${valorLine}\n\n🔥 Confira minha coleção completa e todas as novidades no *MyDeck*! 👉 ${MYDECK_SITE_URL} 🎉🃏`;
  const text=`${header}\n${rows.join('\n')}\n${footer}`;

  // Tentar copiar direto pra área de transferência
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>setStatus('Lista copiada! Cole no WhatsApp.','ok')).catch(()=>{});
  }
  showTextExportModal(text,`${label} — ${rows.length} carta${rows.length!==1?'s':''}`);
}

// Mesma lógica de exportBinderText(), adaptada pra fichário personalizado:
// cartas vêm de vários sets (c._setId por carta) em vez de um currentSet só,
// e os filtros são os do próprio painel (#cb-view-q/oc/om) — ver [[project_pokemon_tcg]].
function exportCustomBinderText(binder){
  if(typeof binder==='string')binder=JSON.parse(binder);
  const cards=getBinderCards(binder);
  const q=(document.getElementById('cb-view-q')?.value||'').toLowerCase();
  const oc=document.getElementById('cb-view-oc')?.checked||false;
  const om=document.getElementById('cb-view-om')?.checked||false;

  function visible(c){
    if(q&&!(c.name+c.n+(c.type||'')).toLowerCase().includes(q))return false;
    const slots=getSlots(c,c._setId);
    const anyCol=slots.some(s=>collected.has(slotKey(c._setId+':',c.n,s.ver)));
    const allCol=slots.every(s=>collected.has(slotKey(c._setId+':',c.n,s.ver)));
    if(oc&&!anyCol)return false;if(om&&allCol)return false;
    return true;
  }

  const filterLbl=oc?'✅ Só coletadas':om?'🔍 Só faltantes':'📚 Todas';
  const visibleCards=cards.filter(visible);
  let slotsTotal=0,slotsCol=0,cardsComplete=0,valorColetado=0,valorFaltante=0;
  const rows=visibleCards.map(c=>{
    const pfx=c._setId;
    const slots=getSlots(c,pfx);
    const dp=lprice(pfx,c.n,c.price);
    const priceStr=dp?` — 💰 R$${fmtR(dp)}`:'';
    const icon=TYPE_ICON[c.type||'']||'🃏';
    const slotParts=slots.map(s=>{
      const key=slotKey(pfx+':',c.n,s.ver);
      const has=collected.has(key);
      slotsTotal++;if(has)slotsCol++;
      const sp=s.price!=null?s.price:dp;
      if(has){
        const qty=(typeof collectedQty!=='undefined'&&collectedQty.get(key)?.qty)||1;
        if(sp)valorColetado+=sp*qty;
        return oc&&qty>1?`${VER_SHORT[s.ver]}✅×${qty}`:`${VER_SHORT[s.ver]}✅`;
      }
      if(sp)valorFaltante+=sp;
      return`${VER_SHORT[s.ver]}❌`;
    }).join(' ');
    const allCol=slots.every(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    const anyCol=slots.some(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    if(allCol)cardsComplete++;
    const statusIcon=allCol?'✅':anyCol?'🟡':'❌';
    return`${statusIcon} ${icon} *${(SET_CATALOG.find(s=>s.id===pfx)?.label||pfx.toUpperCase())} ${c.n}* ${c.name}${c.rare?` _(${c.rare})_`:''} [${slotParts}]${priceStr}`;
  });

  const dateStr=new Date().toLocaleDateString('pt-BR');
  const pctSlots=slotsTotal>0?(slotsCol/slotsTotal*100).toFixed(0):0;
  const header=`🎴✨ *${binder.emoji||'📚'} ${binder.name}* ✨🎴\n${filterLbl}${q?` · busca: "${q}"`:''}\n📅 ${dateStr}\n━━━━━━━━━━━━━━━━━━`;
  let valorLine='';
  if(oc)valorLine=`\n💰 *Valor total da coleção (o que já tenho):* R$${fmtR(valorColetado)}`;
  else if(om)valorLine=`\n💸 *Valor pra fechar a coleção:* R$${fmtR(valorFaltante)}`;
  const footer=`━━━━━━━━━━━━━━━━━━\n📦 Cartas completas: *${cardsComplete}/${rows.length}*\n🎯 Versões: *${slotsCol}/${slotsTotal}* (${pctSlots}%)${valorLine}\n\n🔥 Confira minha coleção completa e todas as novidades no *MyDeck*! 👉 ${MYDECK_SITE_URL} 🎉🃏`;
  const text=`${header}\n${rows.join('\n')}\n${footer}`;

  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>setStatus('Lista copiada! Cole no WhatsApp.','ok')).catch(()=>{});
  }
  showTextExportModal(text,`${binder.name} — ${rows.length} carta${rows.length!==1?'s':''}`);
}

function showTextExportModal(text,title){
  let ov=document.getElementById('text-export-overlay');
  if(ov)ov.remove();
  ov=document.createElement('div');
  ov.id='text-export-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=`
    <div style="background:var(--surface,#111422);border:1px solid var(--border,#2a2e42);border-radius:10px;max-width:640px;width:100%;max-height:80vh;display:flex;flex-direction:column;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px">${title}</div>
        <button onclick="document.getElementById('text-export-overlay').remove()" style="background:none;border:none;color:var(--muted,#888);font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="font-size:11px;color:var(--muted,#888);margin-bottom:8px;font-family:'Space Mono',monospace">
        Lista copiada para a área de transferência (se o navegador permitiu). Se não copiou, selecione tudo abaixo (Ctrl+A) e copie manualmente.
      </div>
      <textarea readonly style="flex:1;min-height:280px;width:100%;background:var(--surface2,#181c2e);color:var(--text,#eee);border:1px solid var(--border,#2a2e42);border-radius:6px;padding:10px;font-family:'Space Mono',monospace;font-size:11px;resize:vertical" onclick="this.select()">${text}</textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
        <button class="btn-add" onclick="navigator.clipboard.writeText(document.querySelector('#text-export-overlay textarea').value).then(()=>setStatus('Lista copiada!','ok'))">📋 Copiar de novo</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

// ── MODAL FICHÁRIO — marcar versão + origem da compra ────────────
function openBinderModal(card, setId){
  if(typeof card==='string') card=JSON.parse(card);
  _modalCard=card;_modalSet=setId;
  const slots=getSlots(card,setId);
  const pfx=setId+':';
  const imgSrc=getBinderImg(card,setId);

  // Opções de versão
  const verHTML=slots.map(s=>{
    const key=slotKey(pfx,card.n,s.ver);
    const isCol=collected.has(key);
    const col=VER_COLOR[s.ver];
    return`<div class="ver-card${isCol?' active':''}" id="vcard-${s.ver}"
      onclick="toggleVerCard('${key}','${s.ver}')"
      style="${isCol?`border-color:${col};background:${col}18`:''}">
      <div class="ver-card-dot" style="background:${isCol?col:'transparent'};border-color:${col}"></div>
      <div class="ver-card-label" style="color:${isCol?col:'var(--text)'}">${VER_LABEL[s.ver]}</div>
      <div class="ver-card-price">${(()=>{const dp=lprice(setId,card.n,s.price);return dp?'R$'+fmtR(dp):''})()}</div>
      ${isCol?`<div style="color:var(--teal);font-size:10px;margin-top:4px">✓ Coletada</div>`:''}
    </div>`;
  }).join('');

  // Lista de compras (mais recente primeiro)
  const purchaseOpts=purchases.map(p=>`<option value="${p.id}">${new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} — ${esc(p.product.substring(0,45))}</option>`).join('');

  document.getElementById('mbinder-content').innerHTML=`
    ${imgSrc?`<img class="mbinder-img" src="${imgSrc}" alt="${card.name}" onerror="this.style.display='none'">`:
      `<div style="height:160px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:36px;border-radius:8px 8px 0 0">🃏</div>`}
    <div class="mbinder-body">
      <div class="mbinder-title">${card.name}</div>
      <div class="mbinder-sub">#${card.n} · ${card.type||''} · ${card.rare||''} ${(()=>{const dp=lprice(setId,card.n,card.price);return dp?'· R$'+fmtR(dp):''})()}</div>
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:10px">MARCAR VERSÕES COLETADAS</div>
      <div class="ver-select-grid" id="ver-grid-${card.n}">${verHTML}</div>
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px;margin-top:14px">REGISTRAR CARTA TIRADA NESTA COMPRA</div>
      <select class="origin-select" id="origin-purchase">
        <option value="">— Não registrar como tirada —</option>
        ${purchaseOpts}
      </select>
      <div id="origin-ver-wrap" style="display:none;margin-top:8px">
        <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">VERSÃO TIRADA</div>
        <div style="display:flex;gap:8px;">
          ${slots.map(s=>`<div class="ver-card" id="pulled-ver-${s.ver}" onclick="selectPulledVer('${s.ver}')"
            style="flex:1;padding:8px">
            <div class="ver-card-dot" style="background:transparent;border-color:${VER_COLOR[s.ver]}"></div>
            <div class="ver-card-label">${VER_LABEL[s.ver]}</div>
          </div>`).join('')}
        </div>
      </div>
      <div class="mact">
        <button class="btn-cx" onclick="closeModal('mbinder')">Cancelar</button>
        <button class="btn-add" onclick='saveBinderModal(${safeJSON(card)},"${setId}")'>✓ Salvar</button>
      </div>
    </div>`;

  // Mostrar seleção de versão quando escolher uma compra
  document.getElementById('origin-purchase').onchange=function(){
    document.getElementById('origin-ver-wrap').style.display=this.value?'block':'none';
  };
  openModal('mbinder');
}

let _selectedPulledVer=null;
function selectPulledVer(ver){
  _selectedPulledVer=ver;
  document.querySelectorAll('[id^="pulled-ver-"]').forEach(el=>{
    const v=el.id.replace('pulled-ver-','');
    const col=VER_COLOR[v];
    el.style.borderColor=v===ver?col:'var(--border)';
    el.style.background=v===ver?col+'22':'';
    el.querySelector('.ver-card-dot').style.background=v===ver?col:'transparent';
  });
}

async function toggleVerCard(key,ver){
  if(!uid()) return;
  const isCol=collected.has(key);
  let error=null;
  let networkFailure=false;
  if(isCol)collected.delete(key);else collected.add(key);
  try{
    if(isCol){({error}=await sbClient.from('collection').delete().eq('slot_key',key).eq('user_id',uid()));}
    else{({error}=await sbClient.from('collection').upsert({slot_key:key,user_id:uid()},{onConflict:'user_id,slot_key'}));}
  }catch(e){
    // queda de conexão — mesma lógica de outbox do toggleSlot(), ver bloco
    // OUTBOX acima de loadAll()
    console.warn('Sem conexão ao salvar coleção — guardando pra sincronizar depois:',e);
    networkFailure=true;
  }
  if(networkFailure){
    mdOutboxSet(key,isCol?'remove':'add');
    setStatus('Salvando quando a conexão voltar...','warning');
  }else if(error){
    if(isCol)collected.add(key);else collected.delete(key);
    console.error('Erro ao salvar coleção:',error);
    setStatus('Erro ao salvar — tente novamente','error');
    alert('Não foi possível salvar essa carta no fichário. Verifique sua conexão e tente de novo.');
    return;
  }else{
    mdOutboxClear(key);
  }
  // Atualizar visual do card clicado
  const card=document.getElementById(`vcard-${ver}`);
  if(card){
    const col=VER_COLOR[ver];const nowCol=collected.has(key);
    card.style.borderColor=nowCol?col:'var(--border)';
    card.style.background=nowCol?col+'18':'';
    card.querySelector('.ver-card-dot').style.background=nowCol?col:'transparent';
    const lbl=card.querySelector('.ver-card-label');if(lbl)lbl.style.color=nowCol?col:'var(--text)';
    let status=card.querySelector('.ver-status');
    if(nowCol&&!status){const s=document.createElement('div');s.className='ver-status';s.style.cssText='color:var(--teal);font-size:10px;margin-top:4px';s.textContent='✓ Coletada';card.appendChild(s);}
    if(!nowCol&&status)status.remove();
  }
  updateDashProgress();
}

async function saveBinderModal(card,setId){
  // Verificar se quer registrar como tirada
  const purchaseId=document.getElementById('origin-purchase').value;
  if(purchaseId&&_selectedPulledVer){
    const purchase=purchases.find(p=>String(p.id)===String(purchaseId));
    const ver=_selectedPulledVer;
    const slots=getSlots(card,setId);
    const slot=slots.find(s=>s.ver===ver)||slots[0];
    const rMap={SP:'Ilustração Rara (IR)',F:'Rara (Holo)',RH:'Incomum (RH)',N:'Regular'};
    const icons={Grama:'🌿',Fogo:'🔥',Aquático:'💧',Raio:'⚡',Psíquico:'🔮',Lutador:'🥊',Escuridão:'⚫',Metal:'⚙️',Dragão:'🐉',Incolor:'⬜'};
    const row={
      name:card.name,
      num:`${card.n}/${String(setId==='me04'?86:setId==='me02'?94:setId==='meg'?132:card.n).padStart(3,'0')} — ${VER_LABEL[ver]}`,
      rar:card.rare||rMap[ver]||'Regular',
      src:purchase?purchase.product.substring(0,60):'Fichário',
      lote:`${purchase?new Date(purchase.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):''} — ${setId.toUpperCase()}`,
      icon:icons[card.type||'']||'🃏',
      ic:'fp',
      bc:ver==='SP'?'bi':ver==='F'?'br':'bx',
      price:slot.price||card.price||null,
      psrc:'Fichário — preço estimado',
      purchase_id:purchase?purchase.id:null
    };
    if(!uid()) return;
    const {data:res}=await sbClient.from('pulled_cards').insert({...row,user_id:uid()}).select();
    if(Array.isArray(res))pulledCards.push(...res);
    renderCartas();renderDash();
  }
  closeModal('mbinder');
  _selectedPulledVer=null;
  renderBinder();
}

// ── ABERTURA DE BOOSTERS ─────────────────────────────────────────
let _boosterCards={}; // {cardN_setId: true}

function loadBoosterSlots(){
  const sel=document.getElementById('open-purchase');
  const pid=sel.value;
  const purchase=purchases.find(p=>String(p.id)===String(pid));
  if(!purchase){document.getElementById('open-slots').innerHTML='';return;}

  // Detectar qual set pela compra
  const prod=purchase.product.toLowerCase();
  let setId='me04',setCards=CARDS,setLabel='ME04(CRI) — Caos Ascendente';
  if(prod.includes('me02')||prod.includes('fogo')||prod.includes('phantasmal')){setId='me02';setCards=CARDS_ME02;setLabel='ME02';}
  else if((prod.includes('meg')||prod.includes('me01'))&&!prod.includes('me04')){setId='meg';setCards=CARDS_MEG;setLabel='MEG';}
  else if(prod.includes('parceiros')||prod.includes('partner')||prod.includes('mep')){setId='mep';setCards=CARDS_MEP;setLabel='MEP';}

  _boosterCards={};
  const boosters=purchase.boost||3;

  // Renderizar slots de boosters com lista de cartas
  let html=`<div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:1px;margin-bottom:12px">${setLabel} · ${boosters} booster${boosters!==1?'s':''}</div>`;

  for(let b=1;b<=boosters;b++){
    html+=`<div class="booster-slot">
      <div class="booster-slot-title">📦 Booster ${b}</div>
      <div id="booster-search-${b}" style="margin-bottom:8px">
        <input placeholder="Buscar carta para adicionar..." class="bsrch" style="max-width:100%"
          oninput="filterBoosterCards(this.value,${b},'${setId}')">
      </div>
      <div id="booster-cards-${b}" style="max-height:200px;overflow-y:auto"></div>
      <div id="booster-selected-${b}" style="margin-top:8px"></div>
    </div>`;
  }
  document.getElementById('open-slots').innerHTML=html;
  // Inicializar cada booster vazio
  for(let b=1;b<=boosters;b++) filterBoosterCards('',b,setId);
}

function filterBoosterCards(q,boosterN,setId){
  const setCards={me04:CARDS,me02:CARDS_ME02,meg:CARDS_MEG,mep:CARDS_MEP}[setId]||CARDS;
  const term=q.toLowerCase();
  const filtered=q.length>1?setCards.filter(c=>(c.name+c.n).toLowerCase().includes(term)).slice(0,8):[];
  const container=document.getElementById(`booster-cards-${boosterN}`);
  if(!container)return;
  if(!filtered.length){container.innerHTML=q.length>1?'<div style="color:var(--muted);font-size:11px;padding:6px">Nenhuma carta encontrada</div>':'';return;}
  container.innerHTML=filtered.map(c=>{
    const imgSrc=imgThumb(getBinderImg(c,setId));
    return`<div class="card-pick">
      ${imgSrc?`<img class="card-pick-img" src="${imgSrc}" loading="lazy" decoding="async" alt="${c.name}" onerror="this.style.display='none'">`:
        `<div style="width:36px;height:50px;background:var(--surface2);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px">${c.color?'🃏':'🃏'}</div>`}
      <div class="card-pick-info"><div class="card-pick-name">${c.name}</div><div class="card-pick-num">#${c.n} · ${c.rare||''}</div></div>
      <div class="card-pick-check" onclick='addToBooster(${safeJSON(c)},"${setId}",${boosterN})' title="Adicionar">＋</div>
    </div>`;
  }).join('');
}

let _boosterSelected={}; // {boosterN: [{card, setId, ver}]}

function addToBooster(card,setId,boosterN){
  if(!_boosterSelected[boosterN])_boosterSelected[boosterN]=[];
  // Verificar duplicata
  if(_boosterSelected[boosterN].find(x=>x.card.n===card.n&&x.setId===setId))return;
  const slots=getSlots(card,setId);
  const defaultVer=slots[slots.length-1].ver; // última versão como padrão
  _boosterSelected[boosterN].push({card,setId,ver:defaultVer});
  renderBoosterSelected(boosterN,setId);
}

function removeFromBooster(boosterN,cardN){
  if(!_boosterSelected[boosterN])return;
  _boosterSelected[boosterN]=_boosterSelected[boosterN].filter(x=>x.card.n!==cardN);
  renderBoosterSelected(boosterN,_boosterSelected[boosterN]?.[0]?.setId||currentSet);
}

function changeBoosterVer(boosterN,cardN,ver){
  const item=(_boosterSelected[boosterN]||[]).find(x=>x.card.n===cardN);
  if(item)item.ver=ver;
}

function renderBoosterSelected(boosterN,setId){
  const items=_boosterSelected[boosterN]||[];
  const container=document.getElementById(`booster-selected-${boosterN}`);
  if(!container)return;
  if(!items.length){container.innerHTML='';return;}
  container.innerHTML=`<div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:6px">CARTAS ADICIONADAS</div>`+
    items.map(({card,setId:sid,ver})=>{
      const slots=getSlots(card,sid);
      const verOpts=slots.map(s=>`<option value="${s.ver}"${s.ver===ver?' selected':''}>${VER_LABEL[s.ver]}</option>`).join('');
      return`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(30,36,54,.5)">
        <div style="width:8px;height:8px;border-radius:2px;background:${VER_COLOR[ver]};flex-shrink:0"></div>
        <div style="flex:1;font-size:12px;font-weight:600">${card.name} <span style="color:var(--muted);font-size:10px">#${card.n}</span></div>
        <select style="background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:3px 6px;font-size:10px"
          onchange="changeBoosterVer(${boosterN},'${card.n}',this.value)">${verOpts}</select>
        <div onclick="removeFromBooster(${boosterN},'${card.n}')" style="cursor:pointer;color:var(--muted);font-size:16px;line-height:1" title="Remover">×</div>
      </div>`;
    }).join('');
}

async function saveBoosterOpening(){
  const sel=document.getElementById('open-purchase');
  const pid=sel.value;
  const purchase=purchases.find(p=>String(p.id)===String(pid));
  if(!purchase){toast('Selecione uma compra.','error');return;}

  const allItems=Object.values(_boosterSelected).flat();
  if(!allItems.length){toast('Adicione pelo menos uma carta.','error');return;}

  const d=new Date(purchase.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  const icons={Grama:'🌿',Fogo:'🔥',Aquático:'💧',Raio:'⚡',Psíquico:'🔮',Lutador:'🥊',Escuridão:'⚫',Metal:'⚙️',Dragão:'🐉',Incolor:'⬜'};

  const rows=allItems.map(({card,setId,ver})=>{
    const slots=getSlots(card,setId);
    const slot=slots.find(s=>s.ver===ver)||slots[0];
    const verBc={SP:'bi',F:'br',RH:'bx',N:'bx'};
    return{
      name:card.name,
      num:`${card.n} — ${VER_LABEL[ver]}`,
      rar:card.rare||'Regular',
      src:purchase.product.substring(0,60),
      lote:`${d} — ${setId.toUpperCase()} (Abertura)`,
      icon:icons[card.type||'']||'🃏',ic:'fp',
      bc:verBc[ver]||'bx',
      price:slot.price||card.price||null,
      psrc:'Abertura registrada',
      purchase_id:purchase.id
    };
  });

  // Salvar cartas tiradas
  if(uid()){
    const erros=[];
    for(const row of rows){
      const{data:res,error}=await sbClient.from('pulled_cards').insert({...row,user_id:uid()}).select();
      if(error){erros.push(row.name+': '+error.message);console.error('[pulled_cards insert]',error,row);}
      else if(Array.isArray(res))pulledCards.push(...res);
      else{
        // insert OK mas sem select retornado — adiciona versão local para UI
        pulledCards.push({...row,user_id:uid(),id:Date.now()+'_'+row.num});
      }
    }
    if(erros.length){alert('⚠️ Erro ao salvar:\n'+erros.join('\n'));return;}
    // Marcar slots como coletados
    for(const{card,setId,ver}of allItems){
      const key=slotKey(setId+':',card.n,ver);
      if(!collected.has(key)){
        collected.add(key);
        await sbClient.from('collection').upsert({slot_key:key,user_id:uid()},{onConflict:'user_id,slot_key'});
      }
    }
  }else{
    alert('⚠️ Faça login para salvar cartas tiradas.');return;
  }

  _boosterSelected={};
  closeModal('mopen');
  renderAll();
  toast(`✓ ${allItems.length} carta${allItems.length!==1?'s':''} registrada${allItems.length!==1?'s':''}! Fichário atualizado.`);
}

// ── MODAIS BASE ──────────────────────────────────────────────────
function openModal(id){
  document.getElementById(id).classList.add('open');
  if(id==='mp'){
    // Abrir sempre em modo "nova compra" — editPurchase() sobrescreve depois se for edição
    _editPurchaseId=null;
    const t=document.querySelector('#mp h3');if(t)t.textContent='Nova Compra';
    document.getElementById('m-data').value=new Date().toISOString().split('T')[0];
  }
  if(id==='mopen'){
    _boosterSelected={};
    // Preencher lista de compras (mais recente primeiro, já está order=date.desc)
    const sel=document.getElementById('open-purchase');
    sel.innerHTML='<option value="">— Selecione a compra —</option>'+
      purchases.filter(p=>!p.acessorio).map(p=>{
        const d=new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
        return`<option value="${p.id}">${d} — ${esc(p.product.substring(0,50))}</option>`;
      }).join('');
    document.getElementById('open-slots').innerHTML='';
  }
}
function closeModal(id){document.getElementById(id).classList.remove('open');}

// ── MODAIS COMPRA / CARTA ────────────────────────────────────────
const rIC={'Dupla Rara (RR)':'🔥','Ilustração Rara (IR)':'⭐','Ilustracao Rara (IR)':'⭐',
  'Ilustração Rara (SAR)':'⭐','Ilustracao Rara (SAR)':'⭐','Rara Ultra (UR)':'💎',
  'Rara (Holo)':'🌟','Incomum (RH)':'🟢','Comum (RH)':'🟢','Promocional':'🎁'};
const rBC={'Dupla Rara (RR)':'br','Ilustração Rara (IR)':'bi','Ilustracao Rara (IR)':'bi',
  'Ilustração Rara (SAR)':'bi','Ilustracao Rara (SAR)':'bi','Rara Ultra (UR)':'bi','Promocional':'bp'};

// Compra em edição (null = criando nova). Setado por editPurchase().
let _editPurchaseId=null;

async function addPurchase(){
  if(!uid()) return;
  const prod=document.getElementById('m-prod').value.trim();
  const tipo=document.getElementById('m-tipo').value;
  const date=document.getElementById('m-data').value;
  const price=parseFloat(document.getElementById('m-preco').value);
  const boost=parseInt(document.getElementById('m-boost').value)||0;
  const acess=document.getElementById('m-acess').checked;
  // Validação — nada de gravar lixo no banco (auditoria 03/08/2026)
  if(!prod){toast('Informe o nome do produto.','error');return;}
  if(!date){toast('Informe a data da compra.','error');return;}
  if(isNaN(price)||price<=0){toast('Preço inválido — informe um valor maior que zero.','error');return;}
  if(price>100000){toast('Preço muito alto — confira o valor digitado.','error');return;}
  if(boost<0||boost>2000){toast('Nº de boosters inválido.','error');return;}
  const row={date,product:prod,tipo,boost,cards:boost*6,price,acessorio:acess};
  if(_editPurchaseId!==null){
    const{data:res,error}=await sbClient.from('purchases').update(row).eq('id',_editPurchaseId).select();
    if(error||!Array.isArray(res)||!res.length){toast('Erro ao atualizar a compra. Tente de novo.','error');console.error('updatePurchase',error);return;}
    const i=purchases.findIndex(p=>String(p.id)===String(_editPurchaseId));
    if(i>=0)purchases[i]=res[0];
    _editPurchaseId=null;
    toast('Compra atualizada!');
  }else{
    const{data:res,error}=await sbClient.from('purchases').insert({...row,user_id:uid()}).select();
    if(error||!Array.isArray(res)){toast('Erro ao salvar a compra. Tente de novo.','error');console.error('addPurchase',error);return;}
    purchases.unshift(...res);
    toast('Compra registrada!');
  }
  closeModal('mp');renderGastos();renderDash();
}

function editPurchase(id){
  const p=purchases.find(x=>String(x.id)===String(id));
  if(!p){toast('Compra não encontrada.','error');return;}
  openModal('mp');
  _editPurchaseId=p.id;
  document.getElementById('m-prod').value=p.product||'';
  document.getElementById('m-tipo').value=p.tipo||'Outro';
  document.getElementById('m-data').value=p.date||'';
  document.getElementById('m-preco').value=p.price;
  document.getElementById('m-boost').value=p.boost||0;
  document.getElementById('m-acess').checked=!!p.acessorio;
  const t=document.querySelector('#mp h3');if(t)t.textContent='Editar Compra';
}

async function removePurchase(id){
  const p=purchases.find(x=>String(x.id)===String(id));
  if(!p)return;
  if(!confirm(`Remover a compra "${p.product}" (R$${fmtR(p.price)})?\nAs cartas tiradas vinculadas NÃO serão apagadas.`))return;
  const{error}=await sbClient.from('purchases').delete().eq('id',p.id);
  if(error){toast('Erro ao remover a compra.','error');console.error('removePurchase',error);return;}
  purchases=purchases.filter(x=>String(x.id)!==String(p.id));
  toast('Compra removida.');
  renderGastos();renderDash();
}
async function addCard(){
  if(!uid()) return;
  const nome=document.getElementById('c-nome').value.trim();
  const num=document.getElementById('c-num').value.trim();
  const rar=document.getElementById('c-rar').value;
  const src=document.getElementById('c-src').value.trim();
  const lote=document.getElementById('c-lote').value.trim();
  const price=parseFloat(document.getElementById('c-val').value)||0;
  if(!nome)return;
  const{data:res}=await sbClient.from('pulled_cards').insert({name:nome,num,rar,src,lote,icon:rIC[rar]||'🃏',ic:'fp',bc:rBC[rar]||'bx',price,psrc:'Manual',user_id:uid()}).select();
  if(Array.isArray(res))pulledCards.push(...res);
  closeModal('mc');renderCartas();renderDash();
}

// ════════════════════════════════════════════════════════════════
// FICHÁRIOS PERSONALIZADOS
// ════════════════════════════════════════════════════════════════

let customBinders=[];
let _cbDraft={};
let _cbManualSelected=new Set();
let _currentCustomBinderId=null;

// ── Presets temáticos ─────────────────────────────────────────────
const BINDER_PRESETS=[
  {key:'sv151_pokedex',   name:'Pokédex 151',         emoji:'💯',desc:'001–151 da Coleção 151, em ordem exata de Pokédex (só Pokémon)',
    // CORRIGIDO 22/07/2026: c.base sozinho pega 165 cartas (001-165), mas 152-165
    // são treinador (Antique Dome Fossil, Big Air Balloon, Energy Sticker, Erika's
    // Invitation etc.) — conferido carta por carta em cards_sv3pt5.js. Como as
    // cartas SV usam type:'Incolor' tanto pra Pokémon Normal quanto pra treinador
    // (não tem campo de supertipo separado — ver [[project_pokemon_tcg]]), filtrar
    // por tipo não funciona aqui. A sorte é que nesse set especificamente o número
    // da carta BATE com o número da Pokédex Nacional (n:150=Mewtwo, n:151=Mew ex,
    // conferido) — então basta cortar em 151 pelo número, não pelo tipo.
    filter:c=>c._setId==='sv3pt5'&&parseInt(c.n)<=151,                                                          color:'#E91E63'},
  {key:'sv151_arte',      name:'Galeria Kanto',       emoji:'🖼️',desc:'Ilustr. Rara + Esp. Rara da Coleção 151',
    filter:c=>c._setId==='sv3pt5'&&(c.rare==='Rara Ilustrada'||c.rare==='Rara Ilustrada Especial'),          color:'#7C3AED'},
  {key:'budget_151',      name:'151 de Pobre',        emoji:'🪙',desc:'Gen 1 < R$50 — carta mais barata de cada Pokémon original',
    filter:c=>{
      if(!c.price||c.price<=0||c.price>=50)return false;
      const nm=c.name.toLowerCase();
      return GEN1.some(g=>nm.includes(g.toLowerCase()));
    },color:'#10b981'},
  {key:'ilustr_esp_rara', name:'Galeria das Estrelas',emoji:'🌟',desc:'Todas as Ilustração Especial Rara',   filter:c=>c.rare==='Ilustr. Esp. Rara',              color:'#a855f7'},
  {key:'ilustr_rara',     name:'Museu da Arte',       emoji:'🎨',desc:'Todas as Ilustração Rara',            filter:c=>c.rare==='Ilustr. Rara',                   color:'#118ab2'},
  {key:'mega_attack',     name:'Coroa Dourada',       emoji:'👑',desc:'Mega Attack Rare e importantes ★',    filter:c=>c.important||c.rare==='Mega Attack Rare',  color:'#ffd166'},
  {key:'vitrine',         name:'Minha Vitrine',       emoji:'⭐',desc:'Cartas marcadas como importantes ★', filter:c=>!!c.important,                             color:'#e63946'},
  {key:'tipo_fogo',       name:'Chamas do Caos',      emoji:'🔥',desc:'Cartas de tipo Fogo',                filter:c=>c.type==='Fogo',                           color:'#ff6b35'},
  {key:'tipo_aquatico',   name:'Abismo Oceânico',     emoji:'🌊',desc:'Cartas de tipo Aquático',            filter:c=>c.type==='Aquático',                       color:'#118ab2'},
  {key:'tipo_grama',      name:'Floresta Primordial', emoji:'🌿',desc:'Cartas de tipo Grama',               filter:c=>c.type==='Grama',                          color:'#06d6a0'},
  {key:'tipo_raio',       name:'Tempestade Elétrica', emoji:'⚡',desc:'Cartas de tipo Raio',                filter:c=>c.type==='Raio',                           color:'#ffd166'},
  {key:'tipo_escuridao',  name:'Véu das Sombras',     emoji:'👻',desc:'Cartas de tipo Escuridão',           filter:c=>c.type==='Escuridão',                      color:'#a855f7'},
  {key:'tipo_dragao',     name:'Dragões Ancestrais',  emoji:'🐉',desc:'Cartas de tipo Dragão',              filter:c=>c.type==='Dragão',                         color:'#e63946'},
  {key:'tipo_lutador',    name:'Arena dos Titãs',     emoji:'⚔️',desc:'Cartas de tipo Lutador',             filter:c=>c.type==='Lutador',                        color:'#ff6b35'},
  {key:'tipo_psiquico',   name:'Mente Cósmica',       emoji:'🧠',desc:'Cartas de tipo Psíquico',            filter:c=>c.type==='Psíquico',                       color:'#c084fc'},
  {key:'tipo_metal',      name:'Aço Inabalável',      emoji:'🤖',desc:'Cartas de tipo Metal',               filter:c=>c.type==='Metal',                          color:'#8d96b5'},
];

const IMG_FNS={me04:imgMe04,me03:imgMe03,me02:imgMe02,meg:imgMeg,mep:imgMep,me05:imgMe05,me06:imgMe06,me2pt5:imgMe2pt5};
const CB_SET_LABELS={
  me04:'🔥 ME04(CRI) — Caos Ascendente',
  me03:'🔵 ME03(POR) — Equilíbrio Perfeito',
  me02:'👻 ME02(PFL) — Fogo Fantasmagórico',
  meg: '🌿 MEG(MEG) — Megaevolução',
  mep: '⭐ MEP(MEP) — Promos',
  me05:'🌑 ME05(PBL) — Escuridão Absoluta',
  me06:'💎 ME06 — Esmeralda Tempestuosa',
  me2pt5:'🦸 ME2.5(ASC) — Heróis Excelsos',
};

function getAllCardsWithSet(){
  // usa myCollections para incluir todos os sets ATIVOS (ME + SV) — é o que
  // o Fichário e os fichários personalizados devem respeitar (o usuário
  // escolheu quais coleções acompanhar). Para o sistema de Compra/Venda,
  // que precisa abranger TODO o catálogo (a carta pode ser de uma coleção
  // que o usuário não deixou "ativa" pra exibição), use getAllCatalogCards().
  const result=[];
  myCollections.forEach(id=>{
    const cards=SET_CARDS_MAP[id]?.()??[];
    cards.forEach(c=>result.push({...c,_setId:id}));
  });
  return result;
}

// Igual getAllCardsWithSet(), mas ignora o filtro de "coleções ativas"
// (myCollections) — varre TODO SET_CARDS_MAP. Usado pelo sistema de
// Compra/Venda (busca de cartas pra vender/comprar), que precisa achar
// qualquer carta do jogo, não só das coleções que o usuário deixou
// marcadas pra exibir no Fichário. Bug relatado 08/08/2026: a busca de
// "Todas as Cartas" só trazia Mega Evolução porque myCollections do
// usuário só tinha 'meg' ativo — a venda/compra não deveria depender
// dessa preferência de exibição.
function getAllCatalogCards(){
  const result=[];
  Object.keys(SET_CARDS_MAP).forEach(id=>{
    const cards=SET_CARDS_MAP[id]?.()??[];
    cards.forEach(c=>result.push({...c,_setId:id}));
  });
  return result;
}

function getBinderCards(binder){
  const all=getAllCardsWithSet();
  const cfg=binder.filter_config||{};
  if(cfg.type==='manual'){
    const ids=binder.card_ids||[];
    return all.filter(c=>ids.some(id=>id.set===c._setId&&id.n===c.n));
  }
  if(cfg.type==='preset'){
    const preset=BINDER_PRESETS.find(p=>p.key===cfg.key);
    return preset?all.filter(preset.filter):[];
  }
  return[];
}

function binderProgress(binder){
  const cards=getBinderCards(binder);
  if(!cards.length)return 0;
  let col=0;
  cards.forEach(c=>{if(getSlots(c,c._setId).some(s=>collected.has(slotKey(c._setId+':',c.n,s.ver))))col++;});
  return Math.round(col/cards.length*100);
}

// ── Supabase CRUD ─────────────────────────────────────────────────
async function loadCustomBinders(){
  if(!uid())return;
  // 20/08/2026: try/catch + retry — essa função é chamada sem await (fire-
  // and-forget) lá em loadAll(), então se a query falhar por instabilidade
  // do Supabase, a exceção não tinha tratamento nenhum: quebrava aqui e os
  // dois re-renders do fim (que trazem "Meus Fichários"/fixados de volta
  // pras abas) nunca aconteciam — abas ficavam faltando até um F5 com sorte.
  let data,error;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      ({data,error}=await sbClient.from('custom_binders').select('*').eq('user_id',uid()).order('created_at',{ascending:false}));
      break;
    }catch(e){
      console.error(`[loadCustomBinders] falha de conexão (tentativa ${attempt})`,e);
      if(attempt===3)return; // desiste sem mexer em customBinders — mantém o que já tinha em vez de zerar
      await new Promise(r=>setTimeout(r,attempt*1500));
    }
  }
  if(error){console.error('[loadCustomBinders] erro',error);return;}
  customBinders=data||[];
  // CORRIGIDO 27/07/2026: no login inicial, loadCustomBinders() é chamado
  // sem await (fire-and-forget) — renderTabs()/updateDashProgress() já
  // tinham rodado antes de customBinders chegar do Supabase, então
  // fichários fixados podiam não aparecer nem nas abas nem no Progresso
  // Master Set até o usuário trocar de aba e voltar. Agora, ao terminar de
  // carregar, dispara os dois re-renders sozinho.
  if(typeof renderTabs==='function')renderTabs();
  if(typeof updateDashProgress==='function')updateDashProgress();
}

async function saveCustomBinder(binder){
  if(!uid())return null;
  const payload={...binder,user_id:uid(),updated_at:new Date().toISOString()};
  if(payload.id){
    await sbClient.from('custom_binders').update(payload).eq('id',payload.id).eq('user_id',uid());
    const idx=customBinders.findIndex(b=>b.id===payload.id);
    if(idx>=0)customBinders[idx]={...customBinders[idx],...payload};
    return payload;
  }else{
    delete payload.id;
    const{data}=await sbClient.from('custom_binders').insert(payload).select();
    if(data?.[0])customBinders.unshift(data[0]);
    return data?.[0]||null;
  }
}

async function deleteCustomBinder(id){
  if(!uid()||!confirm('Excluir este fichário?'))return;
  await sbClient.from('custom_binders').delete().eq('id',id).eq('user_id',uid());
  customBinders=customBinders.filter(b=>b.id!==id);
  _currentCustomBinderId=null;
  if(isBinderPinned(id)){pinnedBinders=pinnedBinders.filter(x=>x!==String(id));savePinnedBinders();}
  renderCustomBindersHome();
}

// ── GALERIA PRINCIPAL ─────────────────────────────────────────────
function renderCustomBindersHome(){
  _currentCustomBinderId=null;
  ['fic-binder-controls','fic-set-info','binder-stats'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const bctl=document.querySelector('.bctl');if(bctl)bctl.style.display='none';

  const all=getAllCardsWithSet();

  const myHtml=customBinders.length===0
    ?`<div style="text-align:center;padding:40px 20px;color:var(--muted);font-family:'Space Mono',monospace;font-size:11px;line-height:2.2">
        Você ainda não criou nenhum fichário.<br>
        <span style="color:var(--accent)">Use os presets abaixo ou crie o seu próprio ✨</span>
      </div>`
    :`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px;margin-bottom:28px">
      ${customBinders.map(b=>{
        const cards=getBinderCards(b);
        const pct=binderProgress(b);
        const col=b.cover_color||'#a855f7';
        const pinned=isBinderPinned(b.id);
        return`<div onclick="openCustomBinderView(${safeJSON(b)})"
          style="padding:16px;border-radius:10px;cursor:pointer;transition:all .2s;
                 border:1px solid var(--border);background:var(--surface2);position:relative;
                 border-left:3px solid ${col}"
          onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='${col}'"
          onmouseout="this.style.transform='';this.style.borderColor='var(--border)'">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <div onclick="event.stopPropagation();toggleBinderPinned('${b.id}')"
              title="${pinned?'Fixado na aba principal — clique pra desfixar':'Fixar na aba principal do Fichário'}"
              style="width:15px;height:15px;border-radius:50%;flex-shrink:0;cursor:pointer;
                     border:2px solid ${pinned?col:'var(--muted)'};
                     background:${pinned?col:'transparent'};
                     display:flex;align-items:center;justify-content:center;
                     font-size:8px;color:#fff;font-weight:700;transition:all .15s">
              ${pinned?'✓':''}</div>
            <div style="font-size:26px">${b.emoji||'📚'}</div>
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px;word-break:break-word;line-height:1.3">${b.name}</div>
          <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:8px">${cards.length} cartas${pinned?' · 📌 fixado':''}</div>
          <div style="height:3px;background:var(--surface3);border-radius:2px;overflow:hidden;margin-bottom:4px">
            <div style="height:100%;width:${pct}%;background:${col};border-radius:2px"></div>
          </div>
          <div style="font-size:9px;color:${col};font-family:'Space Mono',monospace">${pct}% coletado</div>
          <div style="position:absolute;top:6px;right:6px;display:flex;gap:4px">
            <button onclick="event.stopPropagation();openCreateBinderModal(${safeJSON(b)})"
              style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:2px;
                     opacity:.5;transition:opacity .15s" title="Editar"
              onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.5'">✏️</button>
            <button onclick="event.stopPropagation();shareCustomBinderPrompt(${safeJSON(b)})"
              style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:2px;
                     opacity:.5;transition:opacity .15s" title="Compartilhar"
              onmouseover="this.style.opacity='1';this.style.color='var(--teal)'"
              onmouseout="this.style.opacity='.5';this.style.color='var(--muted)'">🔗</button>
            <button onclick="event.stopPropagation();deleteCustomBinder('${b.id}')"
              style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:2px;
                     opacity:.5;transition:opacity .15s" title="Excluir"
              onmouseover="this.style.opacity='1';this.style.color='var(--accent)'"
              onmouseout="this.style.opacity='.5';this.style.color='var(--muted)'">✕</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  const presetsHtml=BINDER_PRESETS.map(p=>{
    const count=all.filter(p.filter).length;
    const already=customBinders.some(b=>b.filter_config&&b.filter_config.key===p.key&&b.filter_config.type==='preset');
    return`<div onclick="openPresetPreview('${p.key}')"
      style="padding:14px;border-radius:10px;cursor:pointer;transition:all .2s;
             border:1px solid var(--border);background:var(--surface2);
             border-top:3px solid ${p.color};${already?'opacity:.55;':''}position:relative"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 20px ${p.color}33'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="font-size:22px;margin-bottom:8px">${p.emoji}</div>
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">${p.name}</div>
      <div style="font-size:9px;color:var(--muted);line-height:1.5;margin-bottom:8px">${p.desc}</div>
      <div style="font-size:9px;color:${p.color};font-family:'Space Mono',monospace">${count} cartas${already?' · Já criado':''}</div>
    </div>`;
  }).join('');

  // ── Seletor de coleções ──────────────────────────────────────────
  function setCard(s){
    const on=myCollections.includes(s.id);
    const lbl=s.id.toUpperCase().replace('SV8PT5','SV8.5').replace('SV6PT5','SV6.5')
                  .replace('SV4PT5','SV4.5').replace('SV3PT5','151');
    return`<div onclick="toggleCollection('${s.id}')"
      style="padding:10px;border-radius:8px;cursor:pointer;transition:all .18s;
             border:1px solid ${on?s.color:'var(--border)'};
             background:${on?s.color+'1a':'var(--surface2)'};
             border-left:3px solid ${s.color};user-select:none"
      onmouseover="this.style.transform='translateY(-2px)'"
      onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px">
        <span style="font-size:18px;line-height:1">${s.emoji}</span>
        <div style="width:15px;height:15px;border-radius:50%;flex-shrink:0;
                    border:2px solid ${on?s.color:'var(--muted)'};
                    background:${on?s.color:'transparent'};
                    display:flex;align-items:center;justify-content:center;
                    font-size:8px;color:white;font-weight:700">
          ${on?'✓':''}</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:${on?'var(--text)':'var(--muted)'};
                  line-height:1.2;margin-bottom:2px">${lbl}</div>
      <div style="font-size:8px;font-family:'Space Mono',monospace;
                  color:${on?s.color:'var(--muted)'};line-height:1.3">
        ${s.upcoming?'breve':s.cards+' cartas'}</div>
    </div>`;
  }
  const seriesSections=Object.keys(SERIES_META)
    .map(sr=>({sr,sets:SET_CATALOG.filter(s=>s.series===sr)}))
    .filter(x=>x.sets.length)
    .map(x=>`
      <div style="font-size:9px;font-family:'Space Mono',monospace;color:var(--muted);
                  text-transform:uppercase;letter-spacing:.08em;margin:14px 0 8px">${(SERIES_META[x.sr]||{}).sub||x.sr}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">
        ${x.sets.map(setCard).join('')}
      </div>`).join('');

  document.getElementById('bwrap').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px">✨ MEUS FICHÁRIOS</div>
      <button onclick="openCreateBinderModal()"
        style="padding:8px 18px;background:var(--accent);color:#fff;border:none;border-radius:6px;
               font-family:'Space Mono',monospace;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:1px;
               transition:opacity .15s"
        onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">+ NOVO FICHÁRIO</button>
    </div>

    <!-- ── Seletor de Coleções ─────────────────────────────────── -->
    <div style="margin-bottom:28px">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);
                  letter-spacing:2px;margin-bottom:12px;padding-bottom:8px;
                  border-bottom:1px solid var(--border)">
        MINHAS COLEÇÕES — TOQUE PARA ATIVAR NAS ABAS
      </div>
      ${seriesSections}
    </div>

    ${myHtml}
    <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:2px;
                margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--border)">
      SUGESTÕES TEMÁTICAS
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
      ${presetsHtml}
    </div>

    `;
}

// ── VISUALIZADOR ──────────────────────────────────────────────────
function openCustomBinderView(binder){
  if(typeof binder==='string')binder=JSON.parse(binder);
  _currentCustomBinderId=binder.id||'__preview__';
  ['fic-binder-controls','fic-set-info','binder-stats'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const bctl=document.querySelector('.bctl');if(bctl)bctl.style.display='none';

  const cards=getBinderCards(binder);
  const layout=binder.layout||3;
  const color=binder.cover_color||'#a855f7';

  let colCount=0;
  cards.forEach(c=>{if(getSlots(c,c._setId).some(s=>collected.has(slotKey(c._setId+':',c.n,s.ver))))colCount++;});
  const pct=cards.length>0?Math.round(colCount/cards.length*100):0;

  window._cbCurrentBinder={...binder};

  // Busca/filtros próprios do fichário personalizado (22/07/2026) — antes essa
  // view não tinha busca nem "só coletadas"/"só faltantes", só o grid cru.
  function applyFilters(list){
    const q=(document.getElementById('cb-view-q')?.value||'').toLowerCase();
    const oc=document.getElementById('cb-view-oc')?.checked||false;
    const om=document.getElementById('cb-view-om')?.checked||false;
    return list.filter(c=>{
      if(q&&!(c.name+c.n+(c.type||'')).toLowerCase().includes(q))return false;
      const slots=getSlots(c,c._setId);
      const anyCol=slots.some(s=>collected.has(slotKey(c._setId+':',c.n,s.ver)));
      const allCol=slots.every(s=>collected.has(slotKey(c._setId+':',c.n,s.ver)));
      if(oc&&!anyCol)return false;
      if(om&&allCol)return false;
      return true;
    });
  }

  // CORRIGIDO 29/07/2026 (pedido do Eduardo: "mesmo tamanho, mesmas funções"
  // dos fichários oficiais ME04/ME05/etc): antes esse grid tinha card fluido
  // (aspect-ratio 2/3, tamanho variável conforme a tela) e abria um modal mais
  // simples (openBinderModal, sem contador de quantidade). Agora usa
  // window.ficCardHtml() — a MESMA função/CSS (.bc2/.fic-card/--cw/--ch) do
  // fichário oficial (fichario_patch.js) — e abre o MESMO modal de slot
  // (openSlotModal, com +/- de quantidade e registro de origem).
  function buildGrid(lay){
    const filteredCards=applyFilters(cards);
    if(filteredCards.length===0){
      return'<div style="text-align:center;padding:50px;color:var(--muted);font-family:\'Space Mono\',monospace;font-size:11px">Nenhuma carta encontrada.</div>';
    }
    // NOVO 30/07/2026 (pedido do Eduardo: "opção de visualização de grade e
    // fichário" também nos personalizados) — modo Fichário físico usa a mesma
    // renderBinderView() do oficial (páginas NxN), agnóstica de set (recebe
    // setIdOf explícito), então funciona igual mesmo com cartas de vários sets.
    if((window._cbViewMode||'grid')==='binder'){
      return (typeof window.renderBinderView==='function')
        ? window.renderBinderView(filteredCards, c=>c._setId)
        : '<div style="text-align:center;padding:30px;color:var(--muted)">Modo Fichário indisponível.</div>';
    }
    const bySets={};
    filteredCards.forEach(c=>{if(!bySets[c._setId])bySets[c._setId]=[];bySets[c._setId].push(c);});
    // lay (2/3/4) agora só define quantas colunas o grid força no máximo —
    // o TAMANHO de cada card continua fixo em --cw/--ch, igual ao oficial.
    return Object.entries(bySets).map(([setId,setCards])=>`
      <div class="bsec-lbl">${CB_SET_LABELS[setId]||setId}</div>
      <div class="bgrid" style="grid-template-columns:repeat(${lay},var(--cw,90px))">
        ${setCards.map(c=>(typeof window.ficCardHtml==='function'?window.ficCardHtml(c,setId):'')).join('')}
      </div>`).join('');
  }

  // Clique na carta abre o MESMO modal do fichário oficial (qty +/-, origem
  // da compra), passando o set de origem e o objeto da carta explicitamente
  // (o fichário personalizado mistura cartas de vários sets ao mesmo tempo,
  // então não dá pra confiar em currentSet/getSetCards() como o modal faz
  // por padrão). Ao salvar, re-renderiza esta mesma tela (onSaved).
  function wireGridClicks(){
    const cardsByKey={};
    cards.forEach(c=>{cardsByKey[c._setId+':'+c.n]=c;});
    document.querySelectorAll('#cb-view-grid .fic-card').forEach(el=>{
      el.addEventListener('click',()=>{
        const setId=el.dataset.setid;
        const cardObj=cardsByKey[setId+':'+el.dataset.n];
        if(typeof openSlotModal==='function'){
          openSlotModal(el.dataset.n, el.dataset.ver, setId, cardObj,
            ()=>openCustomBinderView(window._cbCurrentBinder||binder));
        }
      });
    });
  }

  const isPreview=!!binder._preview;
  const layoutBtns=[2,3,4].map(n=>`<button onclick="changeCustomLayout(${n})"
    style="padding:4px 12px;border-radius:5px;border:1px solid ${n===layout?color:'var(--border)'};
           background:${n===layout?color+'22':'var(--surface2)'};
           color:${n===layout?color:'var(--muted)'};font-family:'Space Mono',monospace;font-size:10px;
           cursor:pointer;font-weight:${n===layout?700:400};transition:all .15s">${n}×${n}</button>`).join('');

  // NOVO 30/07/2026 (pedido do Eduardo: "opção de visualização de grade e
  // fichário" nos personalizados, igual já existe no oficial) — dois botões
  // que alternam window._cbViewMode; em modo Fichário troca os botões de
  // coluna (2×2/3×3/4×4) pelo seletor de tamanho de página física (mesma
  // lógica/global ficBinderSize do fichário oficial).
  const cbViewMode=window._cbViewMode||'grid';
  const viewToggleBtns=`
    <button onclick="cbSetView('grid')"
      style="padding:5px 12px;border-radius:5px;border:1px solid ${cbViewMode==='grid'?color:'var(--border)'};
             background:${cbViewMode==='grid'?color:'var(--surface2)'};
             color:${cbViewMode==='grid'?'#fff':'var(--muted)'};font-family:'Space Mono',monospace;font-size:10px;
             cursor:pointer;font-weight:${cbViewMode==='grid'?700:400};white-space:nowrap">🔲 Grade</button>
    <button onclick="cbSetView('binder')"
      style="padding:5px 12px;border-radius:5px;border:1px solid ${cbViewMode==='binder'?color:'var(--border)'};
             background:${cbViewMode==='binder'?color:'var(--surface2)'};
             color:${cbViewMode==='binder'?'#fff':'var(--muted)'};font-family:'Space Mono',monospace;font-size:10px;
             cursor:pointer;font-weight:${cbViewMode==='binder'?700:400};white-space:nowrap">📖 Fichário físico</button>`;
  const cbBinderSize=(typeof ficBinderSize!=='undefined'&&ficBinderSize)||3;
  const binderSizeBtns=[2,3,4].map(n=>`<button id="cb-binder-${n}" onclick="cbSetBinderSize(${n})"
    style="padding:4px 12px;border-radius:5px;border:1px solid ${n===cbBinderSize?'var(--gold)':'var(--border)'};
           background:var(--surface2);color:${n===cbBinderSize?'var(--gold)':'var(--muted)'};
           font-family:'Space Mono',monospace;font-size:10px;cursor:pointer;
           font-weight:${n===cbBinderSize?700:400}">${n}×${n} por página</button>`).join('');

  document.getElementById('bwrap').innerHTML=`
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
      <button onclick="renderCustomBindersHome()"
        style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
               color:var(--muted);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer">← Voltar</button>
      <div style="font-size:26px;line-height:1">${binder.emoji||'📚'}</div>
      <div style="flex:1;min-width:100px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;color:var(--text)">${binder.name}</div>
        <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${cards.length} cartas · ${colCount} coletadas</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;min-width:120px">
        <div style="flex:1;height:4px;background:var(--surface3);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .4s"></div>
        </div>
        <span style="font-size:10px;color:${color};font-family:'Space Mono',monospace;font-weight:700;white-space:nowrap">${pct}%</span>
      </div>
      ${isPreview
        ?`<button onclick="createBinderFromPreset(${safeJSON(binder)})"
            style="padding:8px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;
                   font-family:'Space Mono',monospace;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:1px">+ SALVAR</button>`
        :`<button onclick="cbOpenAddCard(${safeJSON(binder)})"
            style="padding:6px 12px;background:${color};border:none;border-radius:6px;
                   color:#fff;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;cursor:pointer">+ Adicionar carta</button>
          <button onclick="openCreateBinderModal(${safeJSON(binder)})"
            style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
                   color:var(--muted);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer">✏️ Editar</button>`
      }
    </div>
    ${isPreview?'':(()=>{
      // CORRIGIDO 29/07/2026 (pedido do Eduardo: "fazer exatamente assim pra
      // todos os fichários personalizados, inclusive Kanto/Sinnoh/etc, igual
      // já fazemos no fichário nacional") — o Master Set Nacional já tinha
      // ganhado botão de fixar aba + compartilhar (24/07/2026); esta toolbar
      // é a mesma usada por TODO fichário personalizado (preset regional,
      // manual, temático), então generalizando aqui cobre todos de uma vez.
      const pinned=(typeof isBinderPinned==='function')&&binder.id&&isBinderPinned(binder.id);
      return `
    <div class="bctl" style="gap:10px;flex-wrap:wrap;margin-bottom:10px">
      <input class="bsrch" id="cb-view-q" placeholder="Buscar carta..." oninput="_cbRefreshGrid()"
        style="padding:7px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
               color:var(--text);font-size:12px;flex:1;min-width:120px;outline:none">
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);cursor:pointer">
        <input type="checkbox" id="cb-view-oc" onchange="_cbRefreshGrid()">Só coletadas</label>
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);cursor:pointer">
        <input type="checkbox" id="cb-view-om" onchange="_cbRefreshGrid()">Só faltantes</label>
      ${binder.id?`<button onclick="toggleBinderPinned('${binder.id}')"
        title="${pinned?'Remover da aba principal':'Fixar na aba principal (aparece junto com ME04, SV1 etc.)'}"
        style="padding:7px 12px;background:${pinned?color:'var(--surface2)'};border:1px solid ${pinned?color:'var(--border)'};
               border-radius:6px;color:${pinned?'#fff':'var(--text)'};font-family:'Space Mono',monospace;
               font-size:10px;cursor:pointer;white-space:nowrap">📌 ${pinned?'Fixado':'Fixar aba'}</button>`:''}
      <button onclick="exportCustomBinderText(${safeJSON(binder)})"
        style="padding:7px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
               color:var(--text);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer">📋 Copiar lista</button>
      ${binder.id?`<button onclick="shareCustomBinderPrompt(${safeJSON(binder)})"
        style="padding:7px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
               color:var(--text);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer">🔗 Compartilhar</button>`:''}
      <button onclick="cbPrintBinder(${safeJSON(binder)})"
        style="padding:7px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
               color:var(--text);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer">🖨️ Imprimir</button>
    </div>`;})()}
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">${viewToggleBtns}</div>
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">${cbViewMode==='binder'?binderSizeBtns:layoutBtns}</div>
    <div id="cb-view-grid">${buildGrid(layout)}</div>`;
  wireGridClicks();

  // Exposto pro oninput/onchange dos filtros re-renderizarem só o grid, sem
  // reconstruir o header/toolbar inteiro (evita perder foco do campo de busca).
  window._cbRefreshGrid=function(){
    const g=document.getElementById('cb-view-grid');
    if(g)g.innerHTML=buildGrid(window._cbCurrentBinder?.layout||layout);
    wireGridClicks();
  };
}

// Atalho pedido pelo Eduardo: abrir direto na aba de seleção manual (busca no
// "banco de dados"/getAllCardsWithSet) em vez de precisar entrar em Editar e
// trocar de aba manualmente toda vez que quiser só adicionar uma carta.
function cbOpenAddCard(binder){
  if(typeof binder==='string')binder=JSON.parse(binder);
  openCreateBinderModal(binder);
  cbPickFilterType('manual');
  setTimeout(()=>document.getElementById('cb-msearch')?.focus(),50);
}

// NOVO 29/07/2026 (pedido do Eduardo: "imprimir o pdf" pros fichários
// personalizados também) — reaproveita o printBinder() de fichario_patch.js,
// que agora aceita cartas+setId explícitos (mesma ideia usada em ficCardHtml/
// openSlotModal pra tudo funcionar com cartas de vários sets misturados).
function cbPrintBinder(binder){
  if(typeof binder==='string')binder=JSON.parse(binder);
  const cards=getBinderCards(binder);
  // NOVO 30/07/2026 (pedido do Eduardo: imprimir só o que a tela está
  // mostrando — se marcou "Só faltantes", o PDF sai só com faltantes)
  const onlyState=typeof _printOnlyState==='function'?_printOnlyState():undefined;
  if(typeof printBinder==='function') printBinder(cards, c=>c._setId, binder.name, onlyState);
}

function changeCustomLayout(n){
  const b=window._cbCurrentBinder;
  if(!b)return;
  b.layout=n;
  window._cbCurrentBinder=b;
  if(b.id&&!b._preview){
    sbClient.from('custom_binders').update({layout:n,updated_at:new Date().toISOString()}).eq('id',b.id).eq('user_id',uid());
    const idx=customBinders.findIndex(x=>x.id===b.id);
    if(idx>=0)customBinders[idx].layout=n;
  }
  openCustomBinderView(b);
}

// NOVO 30/07/2026 (pedido do Eduardo: toggle Grade/Fichário físico nos
// personalizados) — window._cbViewMode persiste entre re-renders da mesma
// aba; re-abre a view inteira (igual changeCustomLayout) pra reconstruir a
// toolbar (troca layoutBtns<->binderSizeBtns) e o grid de uma vez.
function cbSetView(mode){
  window._cbViewMode=mode;
  openCustomBinderView(window._cbCurrentBinder);
}

// Reaproveita setBinderSize() de fichario_patch.js (mesmo global ficBinderSize
// do fichário oficial) só que com ids próprios (cb-binder-2/3/4) e refresh
// próprio, pra não interferir na toolbar oficial quando ambas existirem.
function cbSetBinderSize(n){
  if(typeof setBinderSize==='function'){
    setBinderSize(n, ()=>openCustomBinderView(window._cbCurrentBinder), {sizePrefix:'cb-binder-'});
  }
}

function openPresetPreview(key){
  const p=BINDER_PRESETS.find(x=>x.key===key);
  if(!p)return;
  openCustomBinderView({id:null,name:p.emoji+' '+p.name,emoji:p.emoji,layout:3,
    filter_config:{type:'preset',key},card_ids:[],cover_color:p.color,_preview:true});
}

async function createBinderFromPreset(previewBinder){
  if(typeof previewBinder==='string')previewBinder=JSON.parse(previewBinder);
  const{_preview,...payload}=previewBinder;
  delete payload.id;
  await saveCustomBinder(payload);
  const saved=customBinders[0];
  if(saved)openCustomBinderView(saved);
}

// ── MODAL CRIAR / EDITAR ──────────────────────────────────────────
function openCreateBinderModal(editBinder){
  if(typeof editBinder==='string')editBinder=JSON.parse(editBinder);
  _cbDraft=editBinder?{...editBinder}:{
    name:'',emoji:'📚',layout:3,
    filter_config:{type:'preset',key:'ilustr_esp_rara'},
    card_ids:[],cover_color:'#a855f7'
  };
  _cbManualSelected=new Set(
    (_cbDraft.filter_config&&_cbDraft.filter_config.type==='manual'?(_cbDraft.card_ids||[]):[])
    .map(id=>id.set+':'+id.n)
  );
  _renderCreateModal(!!editBinder,editBinder?editBinder.id:null);
  openModal('mcustom');
}

function _renderCreateModal(isEdit,editId){
  const colors=['#a855f7','#e63946','#ffd166','#06d6a0','#118ab2','#ff6b35','#c084fc','#8d96b5'];
  const emojis=['📚','🌟','🎨','👑','🔥','🌊','🌿','⚡','👻','🐉','⚔️','🧠','🤖','💎','🏆','🎯','🌈','🦋'];
  const ft=(_cbDraft.filter_config&&_cbDraft.filter_config.type)||'preset';
  const presetKey=(_cbDraft.filter_config&&_cbDraft.filter_config.key)||'ilustr_esp_rara';
  const curColor=_cbDraft.cover_color||'#a855f7';
  const curLayout=_cbDraft.layout||3;
  const all=getAllCardsWithSet();

  const presetGrid=BINDER_PRESETS.map(p=>{
    const cnt=all.filter(p.filter).length;
    const active=p.key===presetKey&&ft!=='manual';
    return`<div onclick="cbPickPreset('${p.key}')" id="cbp-${p.key}"
      style="padding:10px;border-radius:8px;cursor:pointer;transition:all .2s;
             border:1px solid ${active?p.color:'var(--border)'};
             background:${active?p.color+'22':'var(--surface2)'};
             ${active?'box-shadow:0 0 10px '+p.color+'44':''}">
      <div style="font-size:18px;margin-bottom:4px">${p.emoji}</div>
      <div style="font-size:10px;font-weight:700;color:${active?p.color:'var(--text)'};margin-bottom:2px;line-height:1.3">${p.name}</div>
      <div style="font-size:8px;color:var(--muted);font-family:'Space Mono',monospace">${cnt} cartas</div>
    </div>`;
  }).join('');

  document.getElementById('mcustom-content').innerHTML=`
    <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;margin-bottom:18px">
      ${isEdit?'✏️ EDITAR FICHÁRIO':'✨ NOVO FICHÁRIO'}
    </div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px">
      <div id="cb-emoji-disp" onclick="cbToggleEmojiPicker()"
        style="font-size:28px;cursor:pointer;padding:8px 10px;background:var(--surface2);
               border-radius:8px;border:1px solid var(--border);line-height:1;flex-shrink:0;
               transition:border-color .15s"
        onmouseover="this.style.borderColor='var(--accent)'"
        onmouseout="this.style.borderColor='var(--border)'">${_cbDraft.emoji||'📚'}</div>
      <input id="cb-name-inp" type="text" placeholder="Nome do fichário..." maxlength="40"
        value="${(_cbDraft.name||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}"
        oninput="_cbDraft.name=this.value"
        style="flex:1;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);
               border-radius:8px;color:var(--text);font-size:14px;font-family:'DM Sans',sans-serif;
               outline:none;transition:border-color .15s"
        onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
    </div>
    <div id="cb-emoji-pick" style="display:none;flex-wrap:wrap;gap:6px;margin-bottom:12px;padding:10px;
                                    background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
      ${emojis.map(e=>`<span onclick="cbPickEmoji('${e}')"
        style="font-size:20px;cursor:pointer;padding:4px;border-radius:4px;transition:background .15s"
        onmouseover="this.style.background='var(--surface3)'"
        onmouseout="this.style.background=''">${e}</span>`).join('')}
    </div>
    <div style="margin-bottom:16px">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">COR DO FICHÁRIO</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${colors.map(col=>`<div onclick="cbPickColor('${col}')" id="cbcol-${col.replace('#','')}"
          style="width:26px;height:26px;border-radius:50%;background:${col};cursor:pointer;
                 border:2px solid ${col===curColor?'#fff':'transparent'};
                 transition:all .15s;box-shadow:0 0 0 1px rgba(255,255,255,.1)"
          onmouseover="this.style.transform='scale(1.2)'"
          onmouseout="this.style.transform=''"></div>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:16px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text)">
        <input type="checkbox" id="cb-pin-inp" ${isEdit&&isBinderPinned(editId)?'checked':''}
          style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)">
        📌 Fixar na aba principal do Fichário (aparece junto com ME04, SV1 etc.)
      </label>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">VISUALIZAÇÃO PADRÃO</div>
      <div style="display:flex;gap:6px">
        ${[2,3,4].map(n=>`<button onclick="cbPickLayout(${n})" id="cblay-${n}"
          style="padding:6px 14px;border-radius:6px;
                 border:1px solid ${n===curLayout?'var(--accent)':'var(--border)'};
                 background:${n===curLayout?'rgba(230,57,70,.15)':'var(--surface2)'};
                 color:${n===curLayout?'var(--accent)':'var(--muted)'};
                 font-family:'Space Mono',monospace;font-size:11px;cursor:pointer;transition:all .15s;
                 font-weight:${n===curLayout?700:400}">${n}×${n}</button>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:10px">TIPO DE COLEÇÃO</div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button onclick="cbPickFilterType('preset')" id="cbft-preset"
          style="padding:8px 14px;border-radius:6px;
                 border:1px solid ${ft!=='manual'?'var(--accent)':'var(--border)'};
                 background:${ft!=='manual'?'rgba(230,57,70,.15)':'var(--surface2)'};
                 color:${ft!=='manual'?'var(--accent)':'var(--muted)'};
                 font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;transition:all .15s">
          🏷️ Por tema / raridade
        </button>
        <button onclick="cbPickFilterType('manual')" id="cbft-manual"
          style="padding:8px 14px;border-radius:6px;
                 border:1px solid ${ft==='manual'?'var(--accent)':'var(--border)'};
                 background:${ft==='manual'?'rgba(230,57,70,.15)':'var(--surface2)'};
                 color:${ft==='manual'?'var(--accent)':'var(--muted)'};
                 font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;transition:all .15s">
          🃏 Seleção manual
        </button>
      </div>
      <div id="cbsec-preset" style="display:${ft==='manual'?'none':'block'}">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;
                    max-height:230px;overflow-y:auto;padding:4px">
          ${presetGrid}
        </div>
      </div>
      <div id="cbsec-manual" style="display:${ft==='manual'?'block':'none'}">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
          <input id="cb-msearch" type="text" placeholder="Buscar carta..." oninput="cbRenderManual()"
            style="padding:7px 12px;background:var(--surface2);border:1px solid var(--border);
                   border-radius:6px;color:var(--text);font-size:12px;flex:1;min-width:100px;outline:none">
          <select id="cb-mset" onchange="cbRenderManual()"
            style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);
                   border-radius:6px;color:var(--text);font-size:12px;cursor:pointer">
            <option value="">Todos os sets</option>
            ${
              /* CORRIGIDO 22/07/2026: antes era uma lista fixa de só 6 sets ME —
                 buscar carta pra fichário personalizado não achava nada de SV,
                 SVP ou legados mesmo esses estando em myCollections e disponíveis
                 em getAllCardsWithSet(). Agora lista toda coleção ativa do usuário
                 dinamicamente, na mesma ordem de exibição do fichário normal. */
              myCollections.map(id=>{
                const s=SET_CATALOG.find(x=>x.id===id);
                if(!s)return'';
                return`<option value="${id}">${s.emoji||''} ${id.toUpperCase()}</option>`;
              }).join('')
            }
          </select>
          <span id="cb-mcount" style="font-size:10px;color:var(--gold);font-family:'Space Mono',monospace;white-space:nowrap">${_cbManualSelected.size} selecionadas</span>
        </div>
        <div id="cb-mgrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));
                                   gap:6px;max-height:240px;overflow-y:auto;padding:4px"></div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:18px">
      <button onclick="cbConfirmSave('${isEdit?editId:''}')"
        style="flex:1;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:8px;
               font-family:'Space Mono',monospace;font-size:12px;font-weight:700;cursor:pointer;
               letter-spacing:1px;transition:opacity .15s"
        onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">
        ${isEdit?'✓ SALVAR':'✨ CRIAR FICHÁRIO'}
      </button>
      <button onclick="closeModal('mcustom')"
        style="padding:12px 18px;background:var(--surface2);color:var(--muted);border:1px solid var(--border);
               border-radius:8px;font-family:'Space Mono',monospace;font-size:12px;cursor:pointer">CANCELAR</button>
    </div>`;

  if(ft==='manual')setTimeout(cbRenderManual,0);
}

function cbToggleEmojiPicker(){
  const el=document.getElementById('cb-emoji-pick');
  if(el)el.style.display=el.style.display==='none'?'flex':'none';
}
function cbPickEmoji(e){
  _cbDraft.emoji=e;
  const d=document.getElementById('cb-emoji-disp');if(d)d.textContent=e;
  const p=document.getElementById('cb-emoji-pick');if(p)p.style.display='none';
}
function cbPickColor(col){
  _cbDraft.cover_color=col;
  document.querySelectorAll('[id^="cbcol-"]').forEach(el=>el.style.borderColor='transparent');
  const el=document.getElementById('cbcol-'+col.replace('#',''));
  if(el)el.style.borderColor='#fff';
}
function cbPickLayout(n){
  _cbDraft.layout=n;
  [2,3,4].forEach(x=>{
    const btn=document.getElementById('cblay-'+x);if(!btn)return;
    const a=x===n;
    btn.style.borderColor=a?'var(--accent)':'var(--border)';
    btn.style.background=a?'rgba(230,57,70,.15)':'var(--surface2)';
    btn.style.color=a?'var(--accent)':'var(--muted)';
    btn.style.fontWeight=a?'700':'400';
  });
}
function cbPickFilterType(type){
  _cbDraft.filter_config=type==='manual'
    ?{type:'manual'}
    :{type:'preset',key:(_cbDraft.filter_config&&_cbDraft.filter_config.key)||'ilustr_esp_rara'};
  ['preset','manual'].forEach(t=>{
    const btn=document.getElementById('cbft-'+t);if(!btn)return;
    const a=t===type;
    btn.style.borderColor=a?'var(--accent)':'var(--border)';
    btn.style.background=a?'rgba(230,57,70,.15)':'var(--surface2)';
    btn.style.color=a?'var(--accent)':'var(--muted)';
  });
  const ps=document.getElementById('cbsec-preset');
  const ms=document.getElementById('cbsec-manual');
  if(ps)ps.style.display=type==='manual'?'none':'block';
  if(ms){ms.style.display=type==='manual'?'block':'none';if(type==='manual')setTimeout(cbRenderManual,0);}
}
function cbPickPreset(key){
  _cbDraft.filter_config={type:'preset',key};
  BINDER_PRESETS.forEach(p=>{
    const el=document.getElementById('cbp-'+p.key);if(!el)return;
    const a=p.key===key;
    el.style.borderColor=a?p.color:'var(--border)';
    el.style.background=a?p.color+'22':'var(--surface2)';
    el.style.boxShadow=a?'0 0 10px '+p.color+'44':'';
  });
}
function cbRenderManual(){
  const q=(document.getElementById('cb-msearch')&&document.getElementById('cb-msearch').value||'').toLowerCase();
  const sf=(document.getElementById('cb-mset')&&document.getElementById('cb-mset').value)||'';
  const filtered=getAllCardsWithSet().filter(c=>{
    if(sf&&c._setId!==sf)return false;
    if(q&&!(c.name+c.n).toLowerCase().includes(q))return false;
    return true;
  }).slice(0,120);
  const grid=document.getElementById('cb-mgrid');
  if(!grid)return;
  grid.innerHTML=filtered.map(c=>{
    const k=c._setId+':'+c.n;
    const sel=_cbManualSelected.has(k);
    const imgFn=IMG_FNS[c._setId];
    const src=imgFn?imgFn(c.n):'';
    return`<div onclick="cbToggleManual('${c._setId}','${c.n}')" title="${c.name} #${c.n}"
      style="border-radius:6px;overflow:hidden;cursor:pointer;position:relative;
             border:2px solid ${sel?'var(--teal)':'transparent'};
             background:${sel?'rgba(6,214,160,.1)':'var(--surface2)'};transition:all .15s">
      <img src="${src}" alt="${c.n}"
        style="width:100%;display:block;aspect-ratio:2/3;object-fit:cover;
               filter:${sel?'none':'brightness(.5)'}">
      ${sel?'<div style="position:absolute;top:3px;right:3px;width:14px;height:14px;background:var(--teal);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7px;color:#000;font-weight:700">✓</div>':''}
      <div style="font-size:7px;text-align:center;padding:2px;color:var(--muted);font-family:\'Space Mono\',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.n}</div>
    </div>`;
  }).join('');
}
function cbToggleManual(setId,n){
  const k=setId+':'+n;
  _cbManualSelected.has(k)?_cbManualSelected.delete(k):_cbManualSelected.add(k);
  cbRenderManual();
  const cnt=document.getElementById('cb-mcount');
  if(cnt)cnt.textContent=_cbManualSelected.size+' selecionadas';
}

async function cbConfirmSave(editId){
  const name=((document.getElementById('cb-name-inp')&&document.getElementById('cb-name-inp').value)||_cbDraft.name||'').trim();
  if(!name){toast('Dê um nome ao fichário!','error');return;}
  const isManual=_cbDraft.filter_config&&_cbDraft.filter_config.type==='manual';
  const payload={
    ...(editId?{id:editId}:{}),
    name,
    emoji:_cbDraft.emoji||'📚',
    layout:_cbDraft.layout||3,
    filter_config:_cbDraft.filter_config||{type:'preset',key:'ilustr_esp_rara'},
    card_ids:isManual
      ?Array.from(_cbManualSelected).map(k=>{const parts=k.split(':');return{set:parts[0],n:parts[1]};})
      :[],
    cover_color:_cbDraft.cover_color||'#a855f7',
  };
  const wantsPin=!!(document.getElementById('cb-pin-inp')&&document.getElementById('cb-pin-inp').checked);
  closeModal('mcustom');
  await saveCustomBinder(payload);
  const binder=editId
    ?customBinders.find(b=>b.id===editId)
    :customBinders[0];
  // Sincroniza o "fixar na aba" (guardado local, ver toggleBinderPinned) — só
  // mexe se o estado mudou, e só depois de ter o id real (fichário novo só
  // ganha id depois do insert em saveCustomBinder()).
  if(binder){
    const bid=String(binder.id);
    if(wantsPin&&!isBinderPinned(bid)){pinnedBinders.push(bid);savePinnedBinders();}
    else if(!wantsPin&&isBinderPinned(bid)){pinnedBinders=pinnedBinders.filter(x=>x!==bid);savePinnedBinders();}
    renderTabs();
  }
  if(binder)openCustomBinderView(binder);
  else renderCustomBindersHome();
}

/* ═══════════════════════════════════════════════════════════════
   HOME PAGE — CARD ROTATION (top 3 por preço de cada coleção)
   ═══════════════════════════════════════════════════════════════ */
(function initHomeRotation(){
  const INTERVAL = 30000; // ms entre cada card (30s — antes 3.8s, ajustado a pedido do Eduardo em 22/08)

  // Formata preço BR
  function fmtPriceBR(p){
    if(p>=1000) return 'R$ '+Math.round(p).toLocaleString('pt-BR');
    if(p>=100)  return 'R$ '+p.toFixed(0);
    return 'R$ '+p.toFixed(2).replace('.',',');
  }

  function setupRotation(el){
    // Guard de re-execução (auditoria 03/08/2026): setupRotation agora roda de
    // novo depois do lazy load dos sets (evento lazy-sets-loaded) — sem isso,
    // cada re-render criaria um segundo interval no mesmo card.
    if(el._rotWired) return;
    el._rotWired=true;
    let raw;
    try{ raw=JSON.parse(el.dataset.cards); }catch(e){ return; }
    if(!raw||raw.length<2) return;

    const setId   = el.dataset.setid;
    const imgEl   = el.querySelector('.hset-img-wrap img');
    const badgeEl = el.querySelector('.hset-price-badge');
    const rankEl  = el.querySelector('.hset-rank-badge');
    const nameEl  = el.querySelector('.hset-card-name');
    const dots    = el.querySelectorAll('.hset-dot');

    let idx = 0;

    function showCard(i, animate){
      const c = raw[i];
      // thumb (/small) — carrossel da home renderiza ~150px, /large era desperdício
      const url = imgThumb(homeImg(setId, c.n)); // suporta ME (scrydex) e SV (pokemontcg.io)

      if(animate && imgEl){
        // PRELOAD (auditoria 03/08/2026): antes o src trocava no meio do fade e a
        // moldura ficava vazia por segundos até a imagem nova baixar. Agora só
        // troca depois que a próxima imagem já está no cache.
        const pre=new Image();
        let _swapped=false;
        const doSwap=()=>{
          if(_swapped)return;_swapped=true;
          imgEl.classList.add('fading');
          setTimeout(()=>{
            imgEl.src = url;
            imgEl.alt = c.name||'';
            imgEl.classList.remove('fading');
          }, 480);
        };
        pre.onload=doSwap;
        pre.onerror=doSwap; // mesmo se falhar, mantém o carrossel girando
        pre.src=url;
        if(pre.complete)doSwap();
      } else if(imgEl){
        imgEl.src = url;
        imgEl.alt = c.name||'';
      }

      if(badgeEl) badgeEl.textContent = fmtPriceBR(c.price);
      if(rankEl)  rankEl.textContent  = i+1;
      if(nameEl)  nameEl.textContent  = c.name;

      dots.forEach((d,di)=>{
        d.classList.toggle('active', di===i);
      });
    }

    // Clique nos dots para navegar manualmente
    dots.forEach((d,di)=>{
      d.addEventListener('click', (e)=>{
        e.stopPropagation();
        idx=di;
        showCard(idx, true);
      });
    });

    const rotTimer=setInterval(()=>{
      // Se o card saiu do DOM (re-render da home), mata o interval — senão
      // ele ficaria pra sempre baixando imagens num nó morto.
      if(!el.isConnected){clearInterval(rotTimer);return;}
      idx = (idx+1) % raw.length;
      showCard(idx, true);
    }, INTERVAL + Math.random()*600); // offset aleatório para não sincroni­zar

    // Ouve preços ao vivo vindos de initHomePrices()
    el.addEventListener('pricesUpdated', e=>{
      raw = e.detail.raw;
      idx = 0;
      showCard(0, false);
    });
  }

  function init(){
    renderHomeSets();                 // gera cards da home a partir dos cards_*.js
    document.querySelectorAll('.hset[data-cards]').forEach(setupRotation);
    initParticles();init3DCards();    // antes nunca eram chamadas
    initGlobalSearch();
    updateHsub();
  }

  // Quando os sets SV/legados chegam (lazy load — fim do app.js), a home é
  // re-renderizada com os sets novos e os carrosséis/tilt são religados.
  // setupRotation tem guard (_rotWired), então não duplica interval.
  document.addEventListener('lazy-sets-loaded',()=>{
    renderHomeSets();
    document.querySelectorAll('.hset[data-cards]').forEach(setupRotation);
    if(typeof init3DCards==='function')init3DCards();
  });

  // Aguarda DOM pronto
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ═══════════════════════════════════════════════════════════════
   HOME DINÂMICA (jul/2026) — substitui o HTML hardcoded.
   Fonte única: SET_CATALOG + SET_CARDS_MAP. Preço = BR praticado (Liga).
   A antiga initHomePrices (média EUR/USD ×0.67) foi removida: derrubava
   os preços para ~1/6 do mercado BR.
   ═══════════════════════════════════════════════════════════════ */
async function initHomePrices(){/* desativada — ver renderHomeSets() */}

function homeImg(setId,n){
  const legacy={me1:'meg',me2:'me02',me3:'me03',me4:'me04',me5:'me05',me6:'me06'};
  return imgThumb(getBinderImg({n:String(n)},legacy[setId]||setId));
}

function _topCards(id,k){
  const cards=SET_CARDS_MAP[id]?.()||[];
  return [...cards].filter(c=>(c.price||0)>0)
    .sort((a,b)=>b.price-a.price).slice(0,k)
    .map(c=>({n:c.n,name:c.name,price:c.price}));
}

function chaseFor(id){
  const t=_topCards(id,1)[0];
  if(!t)return'';
  const v=t.price>=100?'R$'+Math.round(t.price).toLocaleString('pt-BR'):'R$'+t.price.toFixed(2).replace('.',',');
  return`${t.name} — ${v}`;
}

function _fmtBadge(p){
  if(p>=1000)return'R$ '+Math.round(p).toLocaleString('pt-BR');
  if(p>=100) return'R$ '+p.toFixed(0);
  return'R$ '+p.toFixed(2).replace('.',',');
}

// PERF 18/08/2026 (dados móveis): a home tinha TODAS as linhas de era
// (Mega Evolução, Escarlate&Violeta, Espada&Escudo, Sol&Lua...) montadas de
// uma vez no innerHTML, com <img loading="lazy"> em cada carta — mas
// loading="lazy" nativo só considera distância vertical até o viewport,
// não o clipping horizontal de containers com overflow-x (carrossel). Ou
// seja: TODAS as linhas, mesmo as "escondidas" pelo scroll horizontal,
// contavam como "visíveis" e baixavam a imagem de cara. Resultado: ~150
// sets × imagem de carta = dezenas de MB só de abrir a home, antes do
// usuário rolar um pixel sequer (reportado: ~370MB só pra criar conta e
// logar, em rede móvel).
// Fix: cada linha de era vira um placeholder leve (só o título, sem
// nenhuma <img>) até entrar na margem de segurança do IntersectionObserver
// abaixo — só então o HTML real (com as imagens) é injetado. Rolar rápido
// não "pula" cartas: HOME_ROW_SAFETY_MARGIN dá um respiro antes da linha
// ficar visível de fato, pra imagem já estar carregada quando ela aparece.
var HOME_ROW_SAFETY_MARGIN = '900px 0px 900px 0px';
var _homeRowObserver = null;

function _homeRowCardHtml(cat,meta,top3,id,code,name){
  if(cat.upcoming||!top3.length){
    const hero=meta?meta.imgFn(meta.heroCard):(top3[0]?homeImg(id,top3[0].n):'');
    return`<div class="hset-wrap" data-tilt><div class="hset" style="border-color:${cat.color}88">
      <div class="hset-glow" style="background:radial-gradient(circle at 50% 50%,${cat.color},transparent 70%)"></div>
      <div class="hset-img-wrap">${hero?`<img loading="lazy" decoding="async" src="${imgThumb(hero)}" alt="${code}" onerror="this.style.opacity='.25'">`:''}</div>
      <div style="position:absolute;top:10px;right:10px;background:#f0932b;color:#fff;font-size:8px;padding:2px 8px;border-radius:4px;font-family:'Space Mono',monospace;z-index:4">EM BREVE</div>
      <div class="hset-info"><div class="hset-name">${name}</div>
      <div class="hset-code">${code}${meta&&meta.releaseDate?' · '+meta.releaseDate:''}</div></div>
    </div></div>`;
  }
  const c0=top3[0];
  return`<div class="hset-wrap" data-tilt>
    <div class="hset" id="hset-${id}" data-setid="${id}" data-cards="${safeJSON(top3)}" style="border-color:${cat.color}88">
      <div class="hset-glow" style="background:radial-gradient(circle at 50% 50%,${cat.color},transparent 70%)"></div>
      <div class="hset-img-wrap"><img loading="lazy" decoding="async" src="${imgThumb(homeImg(id,c0.n))}" alt="${code}" onerror="this.style.opacity='.25'"></div>
      <div class="hset-price-badge">${_fmtBadge(c0.price)}</div>
      <div class="hset-rank-badge">1</div>
      <div class="hset-dots">${top3.map((_,i)=>`<span class="hset-dot${i===0?' active':''}"></span>`).join('')}</div>
      <div class="hset-info">
        <div class="hset-name">${name}</div>
        <div class="hset-code">${code} · ${cat.cards} cartas</div>
        <div class="hset-card-name">${c0.name}</div>
      </div>
    </div></div>`;
}

function renderHomeSets(){
  const box=document.getElementById('home-sets');
  if(!box)return;
  const seriesOrder=Object.keys(SERIES_META);
  const groups=seriesOrder
    .map(sr=>({t:(SERIES_META[sr]||{}).t||sr,ids:SET_CATALOG.filter(s=>s.series===sr).map(s=>s.id)}))
    .filter(g=>g.ids.length);

  if(_homeRowObserver){ _homeRowObserver.disconnect(); _homeRowObserver=null; }

  let html='';
  groups.forEach((g,gi)=>{
    // Linha 0 (primeira era, sempre "acima da dobra") renderiza na hora —
    // sem isso o primeiro paint ficaria vazio. As demais entram via observer.
    html+=`<div class="hsec-title">${g.t}</div><div class="home-row" id="home-row-${gi}" data-group="${gi}"${gi===0?'':' data-lazy-row="1"'}>`
        + (gi===0? _buildRowCardsHtml(g):'')
        + `</div>`;
  });
  box.innerHTML=html;

  const lazyRows=box.querySelectorAll('[data-lazy-row="1"]');
  if(!lazyRows.length)return;
  _homeRowObserver=new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      const el=entry.target;
      const gi=parseInt(el.dataset.group,10);
      const g=groups[gi];
      if(g) el.innerHTML=_buildRowCardsHtml(g);
      el.removeAttribute('data-lazy-row');
      _homeRowObserver.unobserve(el);
    });
  },{root:null,rootMargin:HOME_ROW_SAFETY_MARGIN,threshold:0});
  lazyRows.forEach(el=>_homeRowObserver.observe(el));
}

function _buildRowCardsHtml(g){
  return g.ids.map(id=>{
    const cat=SET_CATALOG.find(s=>s.id===id);if(!cat)return'';
    const meta=(typeof SET_META!=='undefined'&&SET_META[id])||null;
    const top3=_topCards(id,3);
    const name=cat.label.split('—')[1]?.trim().toUpperCase()||cat.label;
    const code=cat.label.split('—')[0].trim();
    return _homeRowCardHtml(cat,meta,top3,id,code,name);
  }).join('');
}

// ── HEADER: subtítulo dinâmico ───────────────────────────────────
// 20/08/2026: com muitas coleções marcadas essa linha ficava poluída
// (sigla atrás de sigla sem fim antes de "MASTER SET TRACKER"). Agora
// mostra só as primeiras MAX_HSUB_SETS e resume o resto em "+N" — a
// lista completa continua acessível no title (tooltip ao passar o mouse).
// (MAX_HSUB_SETS foi movida pro topo do arquivo em 21/08/2026 — declará-la
// aqui embaixo causava "Cannot access before initialization" toda vez que
// updateHsub() era chamada no carregamento inicial da página.)
function updateHsub(){
  const el=document.getElementById('hsub-dyn');
  if(!el)return;
  const lbls=myCollections.map(id=>id.toUpperCase()
    .replace('SV8PT5','SV8.5').replace('SV6PT5','SV6.5')
    .replace('SV4PT5','SV4.5').replace('SV3PT5','151'));
  let setsTxt='';
  if(lbls.length){
    const visiveis=lbls.length>MAX_HSUB_SETS?lbls.slice(0,MAX_HSUB_SETS):lbls;
    const resto=lbls.length-visiveis.length;
    setsTxt=visiveis.join(' · ')+(resto>0?` +${resto}`:'')+'  /  ';
  }
  el.textContent=setsTxt+'MASTER SET TRACKER';
  el.title=lbls.length?lbls.join(' · '):'';
}

// ── BUSCA GLOBAL (header) — todos os sets ────────────────────────
function initGlobalSearch(){
  const header=document.querySelector('#pg-app header');
  if(!header||document.getElementById('gsearch'))return;
  const wrap=document.createElement('div');
  wrap.id='gsearch-wrap';
  wrap.innerHTML=`<input id="gsearch" placeholder="🔍 Buscar em todos os sets... ( / )" autocomplete="off">
    <div id="gsearch-dd"></div>`;
  const st=header.querySelector('.hstatus');
  header.insertBefore(wrap,st||null);

  const inp=wrap.querySelector('#gsearch'),dd=wrap.querySelector('#gsearch-dd');
  let deb=null;
  inp.addEventListener('input',()=>{clearTimeout(deb);deb=setTimeout(run,160);});
  inp.addEventListener('keydown',e=>{if(e.key==='Escape'){dd.style.display='none';inp.blur();}});
  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&!/INPUT|TEXTAREA/.test(document.activeElement?.tagName||'')){e.preventDefault();inp.focus();}
  });
  document.addEventListener('click',e=>{if(!wrap.contains(e.target))dd.style.display='none';});

  function run(){
    const q=inp.value.trim().toLowerCase();
    if(q.length<2){dd.style.display='none';return;}
    const out=[];
    for(const s of SET_CATALOG){
      const cards=SET_CARDS_MAP[s.id]?.()||[];
      for(const c of cards){
        if(c.name.toLowerCase().includes(q)){
          out.push({set:s,c});
          if(out.length>=24)break;
        }
      }
      if(out.length>=24)break;
    }
    if(!out.length){dd.innerHTML='<div class="gs-empty">Nenhuma carta encontrada</div>';dd.style.display='block';return;}
    dd.innerHTML=out.map(({set,c})=>`
      <div class="gs-item" onclick="gsGo('${set.id}','${String(c.n)}')">
        <img loading="lazy" decoding="async" alt="${c.name} #${c.n}" src="${imgThumb(homeImg(set.id,c.n))}" onerror="this.style.visibility='hidden'">
        <div class="gs-txt"><div class="gs-name">${c.name}</div>
        <div class="gs-set">${set.emoji} ${set.label.split('—')[0].trim()} · #${c.n}</div></div>
        <div class="gs-price">${c.price?_fmtBadge(c.price):''}</div>
      </div>`).join('');
    dd.style.display='block';
  }
}
function gsGo(setId,n){
  const dd=document.getElementById('gsearch-dd');if(dd)dd.style.display='none';
  const ficTab=[...document.querySelectorAll('.tabs .tab')].find(t=>(t.getAttribute('onclick')||'').includes("'fichario'"));
  if(typeof go==='function'&&ficTab)go('fichario',ficTab);
  switchSet(setId,null);
  const cards=SET_CARDS_MAP[setId]?.()||[];
  const card=cards.find(c=>String(parseInt(c.n))===String(parseInt(n)));
  const bs=document.getElementById('bsrch');
  if(bs&&card){bs.value=card.name;renderBinder();}
}

// ── EVOLUÇÃO MENSAL (dash) ───────────────────────────────────────
function renderEvolucao(){
  const el=document.getElementById('chart-evolucao');
  if(!el)return;
  if(!purchases.length){el.innerHTML='<div style="color:var(--muted);font-size:11px">Sem compras registradas ainda.</div>';return;}
  const MESES={jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};
  const byMonth={};
  purchases.forEach(p=>{
    const k=(p.date||'').slice(0,7);if(!k)return;
    (byMonth[k]=byMonth[k]||{inv:0,pull:0}).inv+=Number(p.price)||0;
  });
  // pulls: tenta extrair "dd mmm" do lote; ano = ano de compra mais próximo.
  // CORRIGIDO 27/07/2026: cartas cujo lote não batia com o regex eram
  // simplesmente ignoradas (return sem somar nada) — o "Valor tirado" (accP)
  // deste gráfico ficava menor que o KPI "💎 Valor Tirado" da aba Gastos
  // (que soma pulledCards inteiro, sem depender de parse de texto). Agora
  // toda carta sem match cai no bucket "sem data", então accP sempre bate
  // com o total real.
  const anos=[...new Set(purchases.map(p=>(p.date||'').slice(0,4)).filter(Boolean))];
  const SEM_DATA='9999-00';
  // CORRIGIDO 02/08/2026: antes só existia o parse por regex do texto livre
  // `lote` — que quebra pra qualquer carta cujo lote não siga o padrão
  // "dd mmm" (ex: cartas adicionadas manualmente via addCard(), com lote
  // digitado à mão). Cartas que vieram de uma compra real (saveBinderModal,
  // saveBoosterOpening) já guardam `purchase_id` — usar a data real da
  // compra primeiro, só cair pro parse de texto (e depois "sem data") quando
  // não há purchase_id associado.
  const purchaseById={};
  purchases.forEach(p=>{purchaseById[p.id]=p;});
  pulledCards.forEach(c=>{
    const linked=c.purchase_id!=null?purchaseById[c.purchase_id]:null;
    let k;
    if(linked&&linked.date){
      k=linked.date.slice(0,7);
    }else{
      const m=(c.lote||'').toLowerCase().match(/(\d{1,2})\s*(?:de\s*)?([a-zç]{3})/);
      if(m&&m[2]in MESES){
        const mm=String(MESES[m[2]]+1).padStart(2,'0');
        k=(anos.find(a=>byMonth[`${a}-${mm}`])||anos[anos.length-1]||new Date().getFullYear())+'-'+mm;
      }else{
        k=SEM_DATA;
      }
    }
    (byMonth[k]=byMonth[k]||{inv:0,pull:0}).pull+=Number(c.price)||0;
  });
  const keys=Object.keys(byMonth).sort();
  const maxV=Math.max(...keys.map(k=>Math.max(byMonth[k].inv,byMonth[k].pull)),1);
  let accI=0,accP=0;
  el.innerHTML=keys.map(k=>{
    const{inv,pull}=byMonth[k];accI+=inv;accP+=pull;
    const lbl=k===SEM_DATA?'sem data':new Date(k+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
    return barHTML(lbl,inv,maxV,'var(--accent)','R$'+fmtR(inv))+
           (pull>0?barHTML('↳ pulls',pull,maxV,'var(--teal)','R$'+fmtR(pull)):'');
  }).join('')+
  `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-family:'Space Mono',monospace;font-size:11px;display:flex;gap:18px;flex-wrap:wrap">
    <span>Investido: <b style="color:var(--accent)">R$${fmtR(accI)}</b></span>
    <span>Valor tirado: <b style="color:var(--teal)">R$${fmtR(accP)}</b></span>
    <span>ROI: <b style="color:${accP>=accI?'var(--teal)':'var(--gold)'}">${accI>0?((accP/accI-1)*100).toFixed(0):0}%</b></span>
  </div>`;
}

// ── EVOLUÇÃO DO PATRIMÔNIO (snapshot diário via value_history) ────
// Os dados vêm de scripts/snapshot_value.js, rodado 1x/dia via GitHub
// Actions — não há gravação client-side aqui, só leitura.
function renderPatrimonio(){
  const el=document.getElementById('chart-patrimonio');
  if(!el)return;
  if(!valueHistory||valueHistory.length<2){
    el.innerHTML='<div style="color:var(--muted);font-size:11px">Ainda sem histórico suficiente — o snapshot diário roda todo dia à noite. Volte amanhã.</div>';
    return;
  }
  const W=760,H=180,PAD_L=54,PAD_R=14,PAD_T=14,PAD_B=26;
  const vals=valueHistory.map(v=>Number(v.total_value)||0);
  const minV=Math.min(...vals),maxV=Math.max(...vals);
  const range=(maxV-minV)||1;
  const n=valueHistory.length;
  const x=i=>PAD_L+(n>1?i/(n-1):0)*(W-PAD_L-PAD_R);
  const y=v=>PAD_T+(1-(v-minV)/range)*(H-PAD_T-PAD_B);
  const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaPts=`${x(0).toFixed(1)},${(H-PAD_B).toFixed(1)} ${pts} ${x(n-1).toFixed(1)},${(H-PAD_B).toFixed(1)}`;
  // Eixo Y: 3 linhas-guia (min, meio, max)
  const guides=[minV,(minV+maxV)/2,maxV].map(v=>{
    const yy=y(v).toFixed(1);
    return`<line x1="${PAD_L}" y1="${yy}" x2="${W-PAD_R}" y2="${yy}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>
      <text x="${PAD_L-6}" y="${+yy+3}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="'Space Mono',monospace">R$${fmtR(v)}</text>`;
  }).join('');
  // Rótulos de data: primeiro, meio e último ponto
  const dLbl=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  const idxs=n>2?[0,Math.floor((n-1)/2),n-1]:[0,n-1];
  const dateLbls=idxs.map(i=>`<text x="${x(i).toFixed(1)}" y="${H-6}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="'Space Mono',monospace">${dLbl(valueHistory[i].date)}</text>`).join('');
  const last=vals[n-1],first=vals[0];
  const delta=last-first,deltaPct=first>0?(delta/first*100):0;
  const deltaColor=delta>=0?'var(--teal)':'var(--accent)';
  el.innerHTML=`
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;overflow:visible">
      <defs>
        <!-- CORRIGIDO 27/07/2026: usava --accent2 (laranja, mesma cor de
             "Boosters"/gasto) — mas em todo o resto do dashboard teal =
             "valor/dinheiro que você tem" (Valor Fichário, Valor Tirado).
             Trocado pra teal, consistente com a linguagem de cor do resto
             da tela. -->
        <linearGradient id="pat-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--teal)" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="var(--teal)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${guides}
      <polygon points="${areaPts}" fill="url(#pat-fill)"/>
      <polyline points="${pts}" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${vals.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i===n-1?3.5:2}" fill="var(--teal)"><title>${valueHistory[i].date}: R$${fmtR(v)}</title></circle>`).join('')}
      ${dateLbls}
    </svg>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-family:'Space Mono',monospace;font-size:11px;display:flex;gap:18px;flex-wrap:wrap">
      <span>Atual: <b>R$${fmtR(last)}</b></span>
      <span>Variação no período: <b style="color:${deltaColor}">${delta>=0?'+':''}R$${fmtR(delta)} (${deltaPct>=0?'+':''}${deltaPct.toFixed(1)}%)</b></span>
      <span>${n} dias registrados</span>
    </div>`;
}

// ── COMPARTILHAMENTO PÚBLICO DE FICHÁRIO (link + QR code) ─────────
let _shareCustomBinder=null; // {id,name,card_ids} quando compartilhando um fichário personalizado

async function loadSharedBinder(){
  _showAuth(false);
  goPage('app');
  setStatus('Coleção compartilhada · somente leitura','ok');
  document.body.classList.add('share-view');
  try{
    const{data,error}=await sbClient.rpc('get_share_collection',{p_token:shareToken});
    const row=Array.isArray(data)?data[0]:data;
    if(error||!row||(!row.set_key&&!row.card_ids)){
      setStatus('Link inválido ou expirado','error');
      return;
    }
    collected=new Set(row.slot_keys||[]);
    fetchCambio();
    const fichTab=[...document.querySelectorAll('.tab')].find(t=>(t.getAttribute('onclick')||'').includes("'fichario'"));
    go('fichario', fichTab||document.querySelector('.tab'));

    if(row.card_ids){
      // Fichário personalizado compartilhado (snapshot resolvido no momento do link)
      renderSharedCustomBinder(row.card_ids, row.binder_name||'Fichário Compartilhado');
    }else{
      currentSet=row.set_key;
      if(typeof setFicView==='function') setFicView(row.view_mode==='binder'?'binder':'grid');
      if(row.view_mode==='binder' && typeof setBinderSize==='function') setBinderSize(row.layout||3);
      else renderBinder();
    }
  }catch(e){console.error(e);setStatus('Erro ao carregar link','error');}
}
if(shareMode){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadSharedBinder);
  else loadSharedBinder();
}

// Renderiza (somente leitura) um fichário personalizado compartilhado, a partir
// de um snapshot [{set,n}] resolvido no momento em que o link foi gerado.
function renderSharedCustomBinder(cardIds, binderName){
  ['fic-binder-controls','fic-set-info'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  const bctl=document.querySelector('.bctl'); if(bctl) bctl.style.display='none';

  const items=(cardIds||[]).map(ref=>{
    const cards=SET_CARDS_MAP[ref.set]?.()??[];
    const card=cards.find(c=>c.n===ref.n);
    return card?{...card,_setId:ref.set}:null;
  }).filter(Boolean);

  let total=0,got=0;
  const cellsHtml=items.map(c=>{
    const slots=getSlots(c,c._setId);
    const imgUrl=imgThumb(getBinderImg(c,c._setId)||'');
    let anyCollected=false;
    slots.forEach(s=>{ total++; if(collected.has(slotKey(c._setId+':',c.n,s.ver))){got++;anyCollected=true;} });
    return `<div class="bc2${anyCollected?' collected':''}">
      <div class="bc2-in"><img src="${imgUrl}" loading="lazy" decoding="async" alt="${c.name||''}" onerror="this.style.opacity=.15"></div>
      <div class="chk">✓</div>
    </div>`;
  }).join('');

  const pct=total>0?Math.round(got/total*100):0;
  const bstats=document.getElementById('binder-stats');
  if(bstats){
    bstats.style.display='flex';
    bstats.innerHTML=`<div><div class="bsv" style="color:var(--purple)">${binderName}</div><div class="bsl">Fichário compartilhado</div></div>
      <div><div class="bsv">${pct}%</div><div class="bsl">Coletado</div></div>
      <div><div class="bsv">${got}/${total}</div><div class="bsl">Slots</div></div>`;
  }

  const wrap=document.getElementById('bwrap');
  if(wrap) wrap.innerHTML = items.length
    ? `<div class="bgrid">${cellsHtml}</div>`
    : `<div style="color:var(--muted);font-size:11px;padding:20px">Este fichário está vazio.</div>`;
}

function openShareModal(){
  _shareCustomBinder=null;
  const modeRow=document.getElementById('share-mode-row'); if(modeRow) modeRow.style.display='';
  if(currentSet==='__custom__'){
    alert('Pra compartilhar um fichário personalizado específico, use o botão 🔗 dentro do card dele em "Meus Fichários".');
    return;
  }
  if(!uid()){ alert('Faça login para gerar um link de compartilhamento.'); return; }
  const lbl=document.getElementById('share-set-label');
  if(lbl){ const sd=getSetData(); lbl.textContent = (sd&&sd.label)||currentSet; }
  const urlInp=document.getElementById('share-url'); if(urlInp) urlInp.value='';
  const qr=document.getElementById('share-qr'); if(qr){ const ctx=qr.getContext&&qr.getContext('2d'); if(ctx) ctx.clearRect(0,0,qr.width,qr.height); }
  const modeSel=document.getElementById('share-mode'); if(modeSel) modeSel.value=ficViewMode||'grid';
  document.getElementById('mshare').classList.add('open');
}

// Compartilhar um fichário personalizado específico (chamado pelo botão 🔗 no card dele)
function shareCustomBinderPrompt(binder){
  if(!uid()){ alert('Faça login para gerar um link de compartilhamento.'); return; }
  const cards=getBinderCards(binder);
  if(!cards.length){ alert('Este fichário ainda não tem cartas — adicione cartas antes de compartilhar.'); return; }
  _shareCustomBinder={ id:binder.id, name:binder.name, card_ids: cards.map(c=>({set:c._setId,n:c.n})) };
  const modeRow=document.getElementById('share-mode-row'); if(modeRow) modeRow.style.display='none';
  const lbl=document.getElementById('share-set-label'); if(lbl) lbl.textContent=binder.name;
  const urlInp=document.getElementById('share-url'); if(urlInp) urlInp.value='';
  const qr=document.getElementById('share-qr'); if(qr){ const ctx=qr.getContext&&qr.getContext('2d'); if(ctx) ctx.clearRect(0,0,qr.width,qr.height); }
  document.getElementById('mshare').classList.add('open');
}

async function generateShareLink(){
  const btn=document.getElementById('share-gen-btn');
  const isCustom=!!_shareCustomBinder;
  const modeSel=document.getElementById('share-mode');
  const view_mode=isCustom?'grid':((modeSel&&modeSel.value==='binder')?'binder':'grid');
  const layout=ficBinderSize||3;
  if(btn){btn.disabled=true;btn.textContent='Gerando...';}
  try{
    const payload=isCustom
      ? {user_id:uid(), view_mode:'grid', layout, card_ids:_shareCustomBinder.card_ids, binder_name:_shareCustomBinder.name}
      : {user_id:uid(), set_key:currentSet, view_mode, layout};
    const{data,error}=await sbClient.from('binder_shares')
      .insert(payload)
      .select('token').single();
    if(error||!data){ alert('Erro ao gerar link. Verifique se rodou o SQL binder_shares_setup.sql (e a migração de card_ids) no Supabase.'); return; }
    const url=`${location.origin}${location.pathname}?share=${data.token}`;
    const urlInp=document.getElementById('share-url'); if(urlInp) urlInp.value=url;
    const qr=document.getElementById('share-qr');
    if(qr && window.QRCode){
      QRCode.toCanvas(qr, url, {width:220,margin:1,color:{dark:'#1c1f2e',light:'#ffffff'}}, err=>{ if(err) console.error(err); });
    }
  }catch(e){ console.error(e); alert('Erro ao gerar link.'); }
  finally{ if(btn){btn.disabled=false;btn.textContent='🔗 Gerar Link e QR Code';} }
}

function copyShareUrl(){
  const inp=document.getElementById('share-url');
  if(!inp||!inp.value) return;
  inp.select(); inp.setSelectionRange(0,99999);
  try{ document.execCommand('copy'); }catch(e){}
  if(navigator.clipboard) navigator.clipboard.writeText(inp.value).catch(()=>{});
  const btn=document.getElementById('share-copy-btn');
  if(btn){ const old=btn.textContent; btn.textContent='Copiado ✓'; setTimeout(()=>btn.textContent=old,1500); }
}

// ═══════════════════════════════════════════════════════════════════
// LAZY LOAD DOS SETS PESADOS — auditoria 03/08/2026
// ═══════════════════════════════════════════════════════════════════
// Os 23 arquivos abaixo (~2,2 MB, sets SV + legados) NÃO carregam mais no
// boot (ver comentário no index.html). São injetados aqui depois do
// window.load, em paralelo, e quando TODOS chegam:
//   1. registra os sets legados em SET_CARDS_MAP/SET_CATALOG (mesmo código
//      que antes rodava no parse do app.js);
//   2. re-renderiza home/dashboard/fichário pra incluir os dados novos.
// Enquanto isso o site funciona 100% com os sets ME (uso diário) — os
// consumidores de SET_CARDS_MAP são todos guarded (typeof/?.()||[]).
const LAZY_SET_SCRIPTS=[
  'cards_sv1.js','cards_sv2.js','cards_sv3.js','cards_sv3pt5.js',
  'cards_sv4.js','cards_sv4pt5.js','cards_sv5.js','cards_sv6.js',
  'cards_sv6pt5.js','cards_sv7.js','cards_sv8.js','cards_sv8pt5.js',
  'cards_sv9.js','cards_sv10.js','cards_zsv10pt5.js','cards_rsv10pt5.js','cards_svp.js','cards_pgo.js',
  'legacy_swsh.js','legacy_sm.js','legacy_xy.js','legacy_bw.js',
  'legacy_hgss.js','legacy_dp.js','legacy_ex.js','legacy_classic.js',
];
let _lazySetsLoaded=false,_lazySetsLoading=false;

function _registerLazySets(){
  // Idêntico ao registro que roda no parse (linhas ~828/873) — mas agora os
  // LEGACY_SETS só existem depois do lazy load, então registra de novo aqui.
  (window.LEGACY_SETS||[]).forEach(ls=>{
    if(!SET_CARDS_MAP[ls.id])SET_CARDS_MAP[ls.id]=()=>ls.data;
  });
  (window.LEGACY_SETS||[]).forEach(ls=>{
    if(SET_CATALOG.some(s=>s.id===ls.id))return;
    SET_CATALOG.push({id:ls.id,label:ls.label,emoji:ls.emoji,cards:ls.cards,color:ls.color,series:ls.series});
  });
}

function loadLazySets(){
  if(_lazySetsLoaded||_lazySetsLoading)return;
  _lazySetsLoading=true;
  let pending=LAZY_SET_SCRIPTS.length;
  const done=()=>{
    if(--pending>0)return;
    _lazySetsLoaded=true;_lazySetsLoading=false;
    _registerLazySets();
    // Re-renderiza o que depende dos dados novos (tudo guarded). A home
    // (renderHomeSets + carrosséis) é religada pelo listener de
    // 'lazy-sets-loaded' dentro do IIFE initHomeRotation — não chamar aqui
    // pra não renderizar duas vezes.
    try{
      if(currentUser){
        if(typeof renderDash==='function')renderDash();
        if(typeof updateDashProgress==='function')updateDashProgress();
        // Se o usuário já estava com o fichário aberto num set SV/legado
        // (renderizado vazio), redesenha agora com os dados na mão.
        const fic=document.getElementById('fichario');
        if(fic&&fic.classList.contains('active')){
          if(currentSet==='__custom__'&&typeof renderCustomBindersHome==='function')renderCustomBindersHome();
          else if(typeof renderBinder==='function')renderBinder();
        }
      }
    }catch(e){console.error('lazy rerender',e);}
    document.dispatchEvent(new CustomEvent('lazy-sets-loaded'));
  };
  LAZY_SET_SCRIPTS.forEach(src=>{
    const s=document.createElement('script');
    s.src=src;s.async=true;
    s.onload=done;
    s.onerror=()=>{console.error('lazy set falhou:',src);done();};
    document.body.appendChild(s);
  });
}

// Dispara depois do load + folga, sem atrapalhar o primeiro paint.
if(document.readyState==='complete'){
  setTimeout(loadLazySets,600);
}else{
  window.addEventListener('load',()=>setTimeout(loadLazySets,600));
}

// ── Header compacto no scroll (mobile) — auditoria 03/08/2026 ──────
// Em telas pequenas o header (logo + badge + busca) ocupava ~1/3 da tela.
// Depois de 60px de scroll ele colapsa (CSS .hdr-compact, só <=768px).
(function(){
  let _hdrTick=false;
  function _updHdr(){
    _hdrTick=false;
    const hdr=document.querySelector('#pg-app header');
    if(!hdr)return;
    hdr.classList.toggle('hdr-compact',window.scrollY>60);
  }
  window.addEventListener('scroll',()=>{
    if(_hdrTick)return;
    _hdrTick=true;
    requestAnimationFrame(_updHdr);
  },{passive:true});
})();
