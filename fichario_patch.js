/**
 * fichario_patch.js — v2 (corrigido)
 *
 * CORREÇÕES APLICADAS:
 *  1. Usa sb REST client do app.js (não sdk .from())
 *  2. Usa `collected` Set do app.js como fonte de verdade
 *  3. Usa `currentSet` do app.js (remove ficCurrentSet duplicado)
 *  4. renderBinder() aponta para #bwrap (era #fic-binder-wrap — não existia)
 *  5. Filtros lidos do DOM diretamente (#bsrch, #fc, #fm, #fi2)
 *  6. setFicView() usa style.display (era classList.toggle('hidden') sem efeito)
 *  7. getSetCards() usa CARDS/CARDS_ME02/CARDS_MEG/CARDS_MEP
 *  8. openSlotModal() usa purchases[] já carregado (não chama sb.from())
 *  9. renderGlobalStats() delega para updateDashProgress() do app.js
 * 10. initFichario() chamado pelo loadAll() do app.js após collected ser carregado
 *
 * DEPENDE DO app.js:
 *   currentSet, collected (Set), purchases[], sb, slotKey(), getSlots(), fmtR()
 *   CARDS, CARDS_ME02, CARDS_MEG, CARDS_MEP (dos arquivos de cartas)
 */

/* ─────────────────────────────────────────────
   CONSTANTES DE VERSÃO
───────────────────────────────────────────── */
// CORRIGIDO 18/08/2026: cor de "Normal" (#c8cfe8) era quase idêntica a
// var(--border) (#dcdfe8 no tema claro) — o Eduardo reportou que, com mais
// de uma variação, uma ficava verde (RH) e a outra cinza-claro (N), e a
// cinza-claro parecia "não selecionada" (mesma cor do dot vazio). Trocado
// por um roxo saturado, bem distinto das outras 3 cores e do cinza de fundo.
const VERSIONS = [
  { code: 'N',  label: 'Normal',       color: '#7c5cff', bg: 'rgba(124,92,255,.15)' },
  { code: 'F',  label: 'Foil/Holo',   color: '#118ab2', bg: 'rgba(17,138,178,.15)'  },
  { code: 'RH', label: 'Reverse Holo', color: '#06d6a0', bg: 'rgba(6,214,160,.15)'   },
  { code: 'SP', label: 'Especial',     color: '#ff6b35', bg: 'rgba(255,107,53,.15)'  },
  // 01/10/2026 — exclusivo da ME2.5(ASC): 2ª variante de reverse holo
  // (padrão Poké Bola/Love Ball/etc ou carimbo Equipe Rocket, varia por
  // carta — ver getSlots() em app.js). slotBadge() caía no fallback
  // genérico (VERSIONS[3], laranja de "Especial") sem este registro.
  { code: 'RH2', label: 'Reverse Holo (2ª variante)', color: '#ef476f', bg: 'rgba(239,71,111,.15)' },
];

/* ─────────────────────────────────────────────
   BADGE DE RARIDADE (04/09/2026, pedido do Eduardo)
   getSlots() (app.js) joga QUALQUER carta que não seja N/F/RH simples no
   slot genérico "SP" — Full Art, Illustration Rare, Ultra Rara, ACE SPEC,
   Promo, Secreta etc. viravam todas o mesmo badge laranja "SP", sem
   diferenciação nenhuma no fichário/PDF.
   slotBadge(card,ver) resolve isso SÓ NA EXIBIÇÃO (não muda getSlots, não
   muda slotKey/collected — zero risco pra coleção já salva de ninguém):
   pra N/F/RH devolve exatamente o que já existia; pra SP, olha o campo
   `card.rare` de verdade e devolve um badge específico.
   Auditoria 04/09/2026 encontrou o MESMO conceito escrito de formas
   diferentes em coleções diferentes (ex: Illustration Rare aparece como
   "Rara Ilustrada" no SV, "Ilustr. Rara" no ME, "Ilustração Rara (IR)" no
   MEP) — RARITY_BADGE_MAP normaliza tudo isso pro mesmo badge "IR". A
   tabela cobre toda raridade encontrada nos ~90 arquivos de carta hoje;
   rarityBadge() tem um fallback por trecho de texto (igual getSlots() já
   faz) pra não quebrar se aparecer uma raridade nova/inesperada amanhã. */
const RARITY_BADGE_MAP = {
  // Full Art
  'rara preto e branco':        { code: 'FA',    label: 'Full Art',                     color: '#f4a261' },
  // Illustration Rare — 3 grafias diferentes já encontradas nos dados
  'rara ilustrada':              { code: 'IR',    label: 'Illustration Rare',            color: '#e9c46a' },
  'ilustr. rara':                { code: 'IR',    label: 'Illustration Rare',            color: '#e9c46a' },
  'ilustração rara (ir)':        { code: 'IR',    label: 'Illustration Rare',            color: '#e9c46a' },
  // Special Illustration Rare
  'rara ilustrada especial':     { code: 'SIR',   label: 'Special Illustration Rare',    color: '#e76f51' },
  'ilustr. esp. rara':           { code: 'SIR',   label: 'Special Illustration Rare',    color: '#e76f51' },
  // Ultra Rara
  'ultra rara':                  { code: 'UR',    label: 'Ultra Rara',                   color: '#9d4edd' },
  'rara ultra':                  { code: 'UR',    label: 'Ultra Rara',                   color: '#9d4edd' },
  // Hyper Rara
  'hiper rara':                  { code: 'HR',    label: 'Hyper Rara',                   color: '#f72585' },
  'hiper rara mega':             { code: 'HR',    label: 'Hyper Rara',                   color: '#f72585' },
  'mega hyper rare':             { code: 'HR',    label: 'Hyper Rara',                   color: '#f72585' },
  'ultra rara brilhante':        { code: 'HR',    label: 'Hyper Rara',                   color: '#f72585' },
  // Shiny / Brilhante
  'rara brilhante':              { code: 'SH',    label: 'Shiny/Brilhante',              color: '#ffd60a' },
  'rara shiny':                  { code: 'SH',    label: 'Shiny/Brilhante',              color: '#ffd60a' },
  'rara shiny gx':               { code: 'SH',    label: 'Shiny/Brilhante',              color: '#ffd60a' },
  // Radiant / Radiante
  'rara radiante':               { code: 'RAD',   label: 'Radiante',                     color: '#ff5400' },
  // ACE SPEC
  'ace spec':                    { code: 'ACE',   label: 'ACE SPEC',                     color: '#3a86ff' },
  // Secreta / Rainbow
  'rara secreta':                { code: 'SEC',   label: 'Secreta',                      color: '#d00000' },
  'rara rainbow':                { code: 'RB',    label: 'Rainbow',                      color: '#ff70a6' },
  // Mega Ataque (coleções ME)
  'mega attack rare':            { code: 'MEGA',  label: 'Mega Ataque',                  color: '#7209b7' },
  'rara mega ataque':            { code: 'MEGA',  label: 'Mega Ataque',                  color: '#7209b7' },
  // Vintage/especiais (raras o bastante pra compartilhar cor — o texto do
  // badge já diferencia cada uma)
  'legend':                      { code: 'LEGEND',label: 'LEGEND',                       color: '#6c757d' },
  'prism star':                  { code: 'PRISM', label: 'Prism Star',                   color: '#6c757d' },
  'rara break':                  { code: 'BREAK', label: 'BREAK',                        color: '#6c757d' },
  'rara star':                   { code: 'STAR',  label: 'Star',                         color: '#6c757d' },
  'rara prime':                  { code: 'PRIME', label: 'Prime',                        color: '#6c757d' },
  'rara incrível':               { code: 'INC',   label: 'Incrível',                     color: '#6c757d' },
  'galeria de treinador':        { code: 'TG',    label: 'Trainer Gallery',              color: '#6c757d' },
  'coleção clássica':            { code: 'CC',    label: 'Coleção Clássica',             color: '#6c757d' },
  // Holo única por mecânica (legado) — mostra a própria mecânica no badge
  'rara holo ex':                { code: 'EX',    label: 'EX',                           color: '#495057' },
  'rara holo gx':                { code: 'GX',    label: 'GX',                           color: '#495057' },
  'rara holo v':                 { code: 'V',     label: 'V',                            color: '#495057' },
  'rara holo vmax':              { code: 'VMAX',  label: 'VMAX',                         color: '#495057' },
  'rara holo vstar':             { code: 'VSTAR', label: 'VSTAR',                        color: '#495057' },
  'rara holo lv.x':              { code: 'LVX',   label: 'LV.X',                         color: '#495057' },
};
function rarityBadge(card) {
  const raw  = (card && card.rare || '').trim();
  const norm = raw.toLowerCase();
  if (RARITY_BADGE_MAP[norm]) return RARITY_BADGE_MAP[norm];
  // Fallback por trecho de texto — mesma ideia de getSlots() (app.js), pra
  // raridade que não bateu exato na tabela (grafia nova, set futuro etc.)
  if (norm.startsWith('promo'))                          return { code: 'PROMO', label: 'Promo',                  color: '#8ecae6' };
  if (norm.includes('ilustrada especial') || norm.includes('esp. rara')) return { code: 'SIR', label: 'Special Illustration Rare', color: '#e76f51' };
  if (norm.includes('ilustr'))                            return { code: 'IR',    label: 'Illustration Rare',      color: '#e9c46a' };
  if (norm.includes('ultra'))                             return { code: 'UR',    label: 'Ultra Rara',             color: '#9d4edd' };
  if (norm.includes('hiper') || norm.includes('hyper'))   return { code: 'HR',    label: 'Hyper Rara',             color: '#f72585' };
  if (norm.includes('brilhante') || norm.includes('shiny')) return { code: 'SH', label: 'Shiny/Brilhante',        color: '#ffd60a' };
  if (norm.includes('radiante') || norm.includes('radiant')) return { code: 'RAD', label: 'Radiante',              color: '#ff5400' };
  if (norm.includes('secreta') || norm.includes('secret')) return { code: 'SEC',  label: 'Secreta',                color: '#d00000' };
  if (norm.includes('rainbow'))                           return { code: 'RB',    label: 'Rainbow',                color: '#ff70a6' };
  // Raridade não reconhecida (ou "—"/vazia): mantém o comportamento de
  // antes (badge "Especial" genérico), só que mostrando o texto real
  // quando existir, em vez de sumir com a informação.
  return { code: (raw && raw !== '—' ? raw.slice(0, 6).toUpperCase() : 'SP'), label: raw || 'Especial', color: '#6c757d' };
}
// Resolve o badge de UM slot (card+versão): N/F/RH ficam exatamente como
// sempre foram (VERSIONS); só SP passa a virar a raridade específica.
function slotBadge(card, ver) {
  if (ver !== 'SP') return VERSIONS.find(x => x.code === ver) || VERSIONS[3];
  return rarityBadge(card);
}
// Preto ou branco por cima de cada cor de badge, pelo contraste (luminância
// relativa) — em vez de fixar branco pra todo mundo, o que ficava ilegível
// nas cores mais claras (SH #ffd60a, IR #e9c46a etc.), o mesmo problema de
// legibilidade que a mudança inteira tá tentando resolver.
function _badgeInk(hex) {
  const h = (hex || '#6c757d').replace('#', '');
  const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#14151a' : '#ffffff';
}

/* ─────────────────────────────────────────────
   ESTADO LOCAL (view mode e size)
───────────────────────────────────────────── */
let ficViewMode   = 'grid'; // 'grid' | 'binder'
let ficBinderSize = 3;      // 2, 3 ou 4
// Idioma de exibição (30/09/2026, piloto cel30) — troca nome/arte/preço
// exibidos por carta; NÃO afeta a coleção rastreada nem os totais em R$
// (dashboard/gastos continuam em cima de c.price, igual sempre foi).
let ficLang = localStorage.getItem('ficLang') || 'pt';

// Camada de enriquecimento: qty > 1 e origens (localStorage only)
// A fonte de verdade de "tem/não tem" é o `collected` Set do app.js
let ficCollection = {}; // key → { qty, origins }

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
function initFichario() {
  // Sincroniza ficCollection a partir do collected Set já carregado
  loadCollection();
  // HTML usa inline onclick/oninput — sem necessidade de addEventListener aqui
}

/* ─────────────────────────────────────────────
   CARREGAR COLEÇÃO
   Fonte de verdade: `collectedQty` (Map carregado do Supabase
   pelo loadAll do app.js — colunas quantity/origins de `collection`).
   localStorage (`fic_extras`) só é usado como cache/fallback para
   sessões antigas que ainda não sincronizaram com o banco (ex:
   antes da migração de 13/07/2026 que criou as colunas quantity/origins).
───────────────────────────────────────────── */
function loadCollection() {
  const extras = JSON.parse(localStorage.getItem('fic_extras') || '{}');
  ficCollection = {};
  collected.forEach(key => {
    const dbEntry = (typeof collectedQty !== 'undefined') ? collectedQty.get(key) : null;
    if (dbEntry) {
      ficCollection[key] = { qty: dbEntry.qty || 1, origins: dbEntry.origins || [] };
    } else {
      // fallback: ainda não sincronizado no banco — usa cache local e agenda a migração
      const qty = extras[key]?.qty || 1;
      const origins = extras[key]?.origins || [];
      ficCollection[key] = { qty, origins };
      if (extras[key] && (extras[key].qty > 1 || (extras[key].origins || []).length)) {
        saveSlot(key, qty, origins); // sobe o dado local pro Supabase na próxima chance
      }
    }
  });
}

/* ─────────────────────────────────────────────
   SALVAR SLOT
   Sincroniza com `collected` Set + `collectedQty` Map (app.js) +
   grava quantity/origins na tabela `collection` do Supabase.
   localStorage continua sendo atualizado como cache local.
───────────────────────────────────────────── */
async function saveSlot(key, qty, origins) {
  // CORRIGIDO 30/07/2026 (bug relatado: "marco a carta mas não salva" — num
  // caso testado com SV7/Coroas Estelares, mas a causa não é do set, é
  // genérica) — antes retornava aqui SEM NENHUM aviso quando !uid(). O modal
  // fecha normal (saveSlotModal chama closeSlotModal() de qualquer jeito),
  // dando a impressão de que salvou, mas nada persiste — some ao recarregar
  // a página. Acontece se currentUser ainda não carregou (corrida entre o
  // check de auth e o clique) ou se a sessão expirou no meio do uso.
  if (!uid()) {
    if (typeof setStatus === 'function') setStatus('Faça login pra salvar sua coleção', 'error');
    alert('Não foi possível salvar — parece que você não está logado (ou sua sessão expirou). Faça login de novo e tente marcar a carta.');
    return;
  }
  const wasCollected = collected.has(key);
  const prevEntry = (typeof collectedQty !== 'undefined') ? collectedQty.get(key) : null;
  let error = null;
  if (qty <= 0) {
    if (wasCollected) {
      collected.delete(key);
      if (typeof collectedQty !== 'undefined') collectedQty.delete(key);
      ({ error } = await sbClient.from('collection').delete().eq('slot_key', key).eq('user_id', uid()));
      if (error) {
        collected.add(key);
        if (typeof collectedQty !== 'undefined' && prevEntry) collectedQty.set(key, prevEntry);
      }
    }
    if (!error) delete ficCollection[key];
  } else {
    collected.add(key);
    if (typeof collectedQty !== 'undefined') collectedQty.set(key, { qty, origins: origins || [] });
    // upsert SEMPRE que qty>0 — precisa atualizar quantity/origins mesmo
    // quando o slot já estava marcado (ex: subir de 1 pra 3 cópias)
    ({ error } = await sbClient.from('collection').upsert(
      { slot_key: key, user_id: uid(), quantity: qty, origins: origins || [] },
      { onConflict: 'user_id,slot_key' }
    ));
    if (error) {
      if (!wasCollected) collected.delete(key);
      if (typeof collectedQty !== 'undefined') {
        if (prevEntry) collectedQty.set(key, prevEntry); else collectedQty.delete(key);
      }
    }
    if (!error) ficCollection[key] = { qty, origins };
  }
  if (error) {
    console.error('Erro ao salvar slot do fichário:', error);
    if (typeof setStatus === 'function') setStatus('Erro ao salvar — tente novamente', 'error');
    alert('Não foi possível salvar essa carta no fichário. Verifique sua conexão e tente de novo.');
    return;
  }
  // Cache local (fallback pra quando não houver conexão)
  const extras = JSON.parse(localStorage.getItem('fic_extras') || '{}');
  if (qty <= 0) delete extras[key];
  else extras[key] = { qty, origins };
  localStorage.setItem('fic_extras', JSON.stringify(extras));
}

/* ─────────────────────────────────────────────
   DADOS DO SET (usa variáveis globais dos arquivos de cartas)
───────────────────────────────────────────── */
function getSetCards() {
  // CORRIGIDO: delega para getSetData() do app.js, que cobre TODOS os sets
  // (me03, me05, me06, sv1-sv10 etc). O switch antigo só conhecia me02/meg/mep
  // e caía no "default: return CARDS" (me04) para qualquer outro set — por isso
  // o fichário parecia "não atualizar" ao trocar de coleção.
  if (typeof getSetData === 'function') return getSetData().cards;
  switch (currentSet) {            // fallback caso getSetData() não exista
    case 'me02': return CARDS_ME02;
    case 'meg':  return CARDS_MEG;
    case 'mep':  return CARDS_MEP;
    default:     return CARDS;
  }
}

function getSetLabel() {
  // CORRIGIDO: mesma delegação — evita rótulo/coleção dessincronizados
  if (typeof getSetData === 'function') return getSetData().label;
  return {
    me04: 'ME04 — Caos Ascendente',
    me02: 'ME02 — Fogo Fantasmagórico',
    meg:  'MEG — Megaevolução',
    mep:  'MEP — Parceiros Iniciais',
  }[currentSet] || currentSet.toUpperCase();
}

function imgUrl(n, setId, card) {
  // CORRIGIDO 29/07/2026: aceita setId opcional (2º parâmetro) — necessário pra
  // fichário personalizado/fixado, que mistura cartas de vários sets ao mesmo
  // tempo e não pode depender só do `currentSet` global. Sem o 2º argumento,
  // comportamento 100% igual a antes (usa currentSet).
  const sid = setId || currentSet;
  // CORRIGIDO 01/10/2026: bug real por trás do "chinês com imagem preta" que
  // sobreviveu ao fix de referrerpolicy — este helper só repassava {n} (sem
  // o resto da carta) pro getBinderImg(). Isso é inofensivo pros sets que
  // calculam a URL só a partir do número (imgCel30Jp, scrydex, etc.), mas
  // cel30cn GUARDA a URL pronta no próprio campo `img` da carta (não dá pra
  // calcular só com `n`) — então c.img vinha sempre undefined e a imagem
  // nunca nem tentava carregar (não é hotlink, era um <img src=""> vazio).
  // Agora os 4 chamadores passam a carta inteira (3º parâmetro opcional);
  // sets que só precisam do número continuam funcionando igual (fallback {n}).
  if (typeof getBinderImg === 'function') {
    return getBinderImg(card || { n }, sid, ficLang);
  }
  // Fallback inline (caso app.js ainda não tenha carregado)
  const num = parseInt(n, 10);
  if (sid.startsWith('sv') || sid === 'pgo') {
    const safe = isNaN(num) ? n : num;
    return `https://images.pokemontcg.io/${sid}/${safe}.png`;
  }
  switch (sid) {
    case 'me06': return `https://images.scrydex.com/pokemon/me6-${num}/large`;
    case 'me05': return `https://images.scrydex.com/pokemon/me5-${num}/large`;
    case 'me03': return `https://images.scrydex.com/pokemon/me3-${num}/large`;
    case 'me02': return `https://images.scrydex.com/pokemon/me2-${num}/large`;
    case 'meg':  return `https://images.scrydex.com/pokemon/me1-${num}/large`;
    case 'mep':  return `https://images.scrydex.com/pokemon/mep-${num}/large`;
    default:     return `https://images.scrydex.com/pokemon/me4-${num}/large`;
  }
}

/* ─────────────────────────────────────────────
   SWITCH DE ABAS / VIEW / SIZE
───────────────────────────────────────────── */
function switchFicSet(setId) {
  // Delega para switchSet() do app.js (seta currentSet e chama renderBinder)
  const tab = document.getElementById('fic-tab-' + setId);
  if (typeof switchSet === 'function' && tab) switchSet(setId, tab);
}

function setFicView(mode, onRefresh, ids) {
  // ids opcional: {grid,binder,dash,controls} — permite reusar esta função em
  // toolbars de fichário personalizado/Master Set que têm seus próprios ids de
  // botão (retrocompat: sem 'ids', usa os ids do fichário oficial, comportamento
  // igual a antes). 'dash' (04/09/2026): 3º modo, sem botão próprio nos
  // fichários que não passam 'ids' com um — getElementById some/vira no-op,
  // então não quebra Master Set/fichário personalizado/Lorcana.
  ficViewMode = mode;
  const gid = (ids && ids.grid)  || 'fic-view-grid';
  const bid = (ids && ids.binder)|| 'fic-view-binder';
  const did = (ids && ids.dash)  || 'fic-view-dash';
  const cid = (ids && ids.controls) || 'fic-binder-controls';
  const gBtn = document.getElementById(gid);
  const bBtn = document.getElementById(bid);
  const dBtn = document.getElementById(did);
  const ctrl = document.getElementById(cid);
  const styleBtn = (btn, active) => {
    if (!btn) return;
    btn.style.background  = active ? 'var(--accent)' : 'var(--surface)';
    btn.style.color       = active ? '#fff' : 'var(--muted)';
    btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
  };
  styleBtn(gBtn, mode === 'grid');
  styleBtn(bBtn, mode === 'binder');
  styleBtn(dBtn, mode === 'dash');
  // CORRIGIDO: era classList.toggle('hidden') — o elemento usa style="display:none"
  if (ctrl) ctrl.style.display = mode === 'binder' ? 'flex' : 'none';
  if (typeof onRefresh === 'function') onRefresh(); else renderBinder();
}

function setBinderSize(n, onRefresh, ids) {
  ficBinderSize = n;
  const prefix = (ids && ids.sizePrefix) || 'fic-binder-';
  [2, 3, 4].forEach(s => {
    const btn = document.getElementById(prefix + s);
    if (!btn) return;
    btn.style.borderColor = s === n ? 'var(--gold)' : 'var(--border)';
    btn.style.color       = s === n ? 'var(--gold)' : 'var(--muted)';
    btn.style.fontWeight  = s === n ? '700' : '400';
  });
  if (typeof onRefresh === 'function') onRefresh(); else renderBinder();
}

// Sets da "família" cel30 — a única com seletor de idioma por enquanto.
// PT/EN são troca de DISPLAY dentro do MESMO array (cel30 — mesma carta,
// mesma numeração). JP/CN são checklists DIFERENTES (cards_cel30_jp.js/
// cards_cel30_cn.js — numeração, contagem e até seleção de Pokémon
// própria), então "escolher idioma" ali precisa trocar o currentSet de
// verdade (via switchSet), não só re-renderizar com outro campo.
// 01/10/2026 (pedido do Eduardo): JP/CN deixaram de ser coleções soltas no
// catálogo (cel30jp/cel30cn removidos de SET_CATALOG em app.js) — agora só
// aparecem aqui, dentro do seletor de idioma da coleção "Celebração de 30
// Anos", pra não inchar a lista principal a cada idioma de cada coleção
// futura parecida.
const FIC_LANG_REGION_SET = { jp: 'cel30jp', cn: 'cel30cn' };
// SWITCH_FAMILY: só o cel30 precisa trocar de `setId` pra mostrar jp/cn,
// porque lá são checklists DIFERENTES (cel30jp/cel30cn têm suas próprias
// cards_*.js, numeração e contagem). Sets novos (01/10/2026, começando pela
// ME2.5) guardam nameJp/img direto na MESMA carta — não precisam trocar de
// set, só o idioma exibido (ver LANG_SETS logo abaixo).
const FIC_LANG_SWITCH_FAMILY = ['cel30', 'cel30jp', 'cel30cn'];
// Quais idiomas cada set mostra no seletor, e em que ordem os botões ficam
// visíveis. Sets fora deste mapa não mostram o controle (comportamento
// anterior, zero mudança pro resto do catálogo).
const FIC_LANG_SETS = {
  cel30: ['pt', 'en', 'jp', 'cn'], cel30jp: ['pt', 'en', 'jp', 'cn'], cel30cn: ['pt', 'en', 'jp', 'cn'],
  // ME2.5(ASC): sem chinês confirmado ainda (ver header de cards_me2pt5.js)
  me2pt5: ['pt', 'en', 'jp'],
  // ME05(PBL): JP resolvido carta a carta (limitlesstcg, ver header de cards_me05.js); sem chinês
  // (a série Megaevolução chinesa ainda não tem set principal).
  me05: ['pt', 'en', 'jp'],
  // ME04(CRI): idem (JP via limitlesstcg, ver header de cards_me04.js); sem chinês
  me04: ['pt', 'en', 'jp'],
};

function setFicLang(lang, onRefresh, ids) {
  const regionSet = FIC_LANG_SWITCH_FAMILY.includes(currentSet) ? FIC_LANG_REGION_SET[lang] : null;
  if (regionSet) {
    // JP/CN não têm conceito de EN separado — PT é sempre o texto exibido
    // (os arquivos já trazem name em português; nameEn é só metadado).
    ficLang = 'pt';
    try { localStorage.setItem('ficLang', 'pt'); } catch (e) {}
    if (typeof switchSet === 'function') switchSet(regionSet);
    syncFicLangButtons(ids);
    return;
  }
  // pt/en: precisa estar no array compartilhado (cel30) — se o usuário
  // estava em cel30jp/cel30cn, troca de volta antes de só mudar o display.
  if ((currentSet === 'cel30jp' || currentSet === 'cel30cn') && typeof switchSet === 'function') {
    switchSet('cel30');
  }
  ficLang = lang;
  try { localStorage.setItem('ficLang', lang); } catch (e) {}
  syncFicLangButtons(ids);
  if (typeof onRefresh === 'function') onRefresh(); else renderBinder();
}

function syncFicLangButtons(ids) {
  const idOf = {
    pt: (ids && ids.pt) || 'fic-lang-pt',
    en: (ids && ids.en) || 'fic-lang-en',
    jp: (ids && ids.jp) || 'fic-lang-jp',
    cn: (ids && ids.cn) || 'fic-lang-cn',
  };
  const active = currentSet === 'cel30jp' ? 'jp' : currentSet === 'cel30cn' ? 'cn' : ficLang;
  const supported = FIC_LANG_SETS[currentSet] || ['pt', 'en', 'jp', 'cn'];
  Object.entries(idOf).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('active', key === active);
    // esconde botão de idioma que este set não tem ainda (ex: CN na
    // ME2.5) — evita mostrar um idioma que só cai no fallback PT silencioso
    btn.style.display = supported.includes(key) ? '' : 'none';
  });
}

// Mostra/esconde o seletor de idioma — só aparece pros sets cadastrados em
// FIC_LANG_SETS (cada um com seus próprios idiomas suportados). Chamado por
// switchSet() (app.js) toda vez que troca de coleção.
function updateFicLangVisibility() {
  const ctrl = document.getElementById('fic-lang-controls');
  if (!ctrl) return;
  const supported = FIC_LANG_SETS[currentSet];
  ctrl.style.display = supported ? 'flex' : 'none';
  if (supported) syncFicLangButtons();
}

// Nome/preço exibidos de acordo com ficLang — cai no PT/BRL padrão quando a
// carta não tem tradução (todo o resto do catálogo, por enquanto).
function cardI18n(c, lang) {
  const l = lang || ficLang;
  if (l === 'en') {
    return {
      name: c.nameEn || c.name,
      price: c.priceUsd != null ? c.priceUsd : c.price,
      symbol: c.priceUsd != null ? '$' : 'R$',
    };
  }
  // 01/10/2026 — jp/cn genéricos (fora da família cel30, que já guarda o
  // nome certo direto em `name`): troca só o nome exibido, preço continua
  // em R$ igual ao PT (nenhuma das duas tem fonte de mercado própria ainda
  // pros sets que não são o cel30).
  if (l === 'jp') return { name: c.nameJp || c.nameEn || c.name, price: c.price, symbol: 'R$' };
  if (l === 'cn') return { name: c.nameCn || c.name, price: c.price, symbol: 'R$' };
  return { name: c.name, price: c.price, symbol: 'R$' };
}

/* ─────────────────────────────────────────────
   RENDER PRINCIPAL
───────────────────────────────────────────── */
function renderBinder() {
  const cards = getSetCards();
  const wrap  = document.getElementById('bwrap'); // CORRIGIDO: era 'fic-binder-wrap'
  if (!wrap) return;

  // CORRIGIDO: ler filtros do DOM (IDs do HTML), não de um objeto ficFilter
  const q  = (document.getElementById('bsrch')?.value || '').toLowerCase();
  const oc = document.getElementById('fc')?.checked  || false;
  const om = document.getElementById('fm')?.checked  || false;
  const oi = document.getElementById('fi2')?.checked || false;

  // Estatísticas do set — usa getSlots() para consistência com app.js
  let totalSlots = 0, colSlots = 0;
  cards.forEach(c => {
    getSlots(c, currentSet).forEach(s => {
      totalSlots++;
      if (collected.has(`${currentSet}:${c.n}:${s.ver}`)) colSlots++;
    });
  });
  const pct = totalSlots ? Math.round(colSlots / totalSlots * 100) : 0;

  // Stats globais (reutiliza app.js)
  updateDashProgress();

  // Label de progresso do set
  const infoEl = document.getElementById('fic-set-info');
  if (infoEl) {
    // Mesma data mostrada na aba Preço Justo (price_updated_at.js, mantido por
    // scripts/update_prices.py) — sets fora do map (SV, legado, mep, me06 ainda
    // sem cards) simplesmente não mostram o selo, sem quebrar nada.
    const priceUpdated = (typeof formatPriceUpdatedAt === 'function' && typeof PRICE_UPDATED_AT !== 'undefined' && PRICE_UPDATED_AT.hasOwnProperty(currentSet))
      ? `<span style="font-size:9px;color:var(--muted)">🗓️ preços atualizados em ${formatPriceUpdatedAt(currentSet)}</span>`
      : '';
    infoEl.innerHTML = `
      <span>${getSetLabel()}</span>
      <span style="color:var(--teal)">${colSlots}/${totalSlots} slots</span>
      <span style="color:var(--gold)">${pct}% completo</span>
      <div style="flex:1;min-width:120px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:2px;transition:width .4s"></div>
      </div>
      ${priceUpdated}
      <span style="font-size:9px;color:var(--muted)">Clique na carta para editar slots</span>`;
  }

  // Filtrar cartas
  const filtered = cards.filter(c => {
    if (q && !(c.name + c.n + (c.type || '')).toLowerCase().includes(q)) return false;
    const slots = getSlots(c, currentSet);
    const hasAny = slots.some(s => collected.has(`${currentSet}:${c.n}:${s.ver}`));
    const hasAll = slots.every(s => collected.has(`${currentSet}:${c.n}:${s.ver}`));
    if (oc && !hasAny) return false;
    // "Só faltantes": mostra a carta se falta QUALQUER versão (Normal/Foil/Reverse Holo),
    // não só quando não tem nenhuma. Antes escondia a carta inteira se tivesse só 1 de 2-3 versões.
    if (om && hasAll) return false;
    if (oi && !c.important) return false;
    return true;
  });

  if (ficViewMode === 'grid') {
    wrap.innerHTML = renderGridView(filtered);
  } else if (ficViewMode === 'dash') {
    // Dashboard usa TODAS as cartas do set (cards), não o `filtered` da busca/
    // checkboxes acima — é um resumo do set inteiro, não da busca no momento.
    wrap.innerHTML = renderFicDashboard(cards);
  } else {
    wrap.innerHTML = renderBinderView(filtered);
  }

  // PERF 03/08/2026 (auditoria): delegação de evento no wrapper em vez de um
  // addEventListener POR CARTA (eram ~2.000 listeners no Master Set Nacional a
  // cada render). Comportamento idêntico: os dots de versão continuam usando
  // stopPropagation, então clique em dot não abre o modal — igual a antes.
  if (!wrap._ficDelegated) {
    wrap.addEventListener('click', e => {
      const el = e.target.closest('.fic-card');
      if (!el || !wrap.contains(el)) return;
      // Fichário personalizado (#cb-view-grid, renderizado dentro de #bwrap)
      // tem wiring próprio com cardObj/onSaved — não duplicar o modal aqui.
      if (el.closest('#cb-view-grid')) return;
      openSlotModal(el.dataset.n, el.dataset.ver, el.dataset.setid);
    });
    wrap._ficDelegated = true;
  }
}

/* ─────────────────────────────────────────────
   RENDER — MODO DASHBOARD (04/09/2026, pedido do Eduardo)
   Resumo do set aberto: valor da coleção, quanto falta pra fechar, carta
   mais valiosa (sua e a que falta) e quantidade por versão. Usa getSlots()
   igual o resto do arquivo — cada versão (N/F/RH/SP) tem preço próprio
   (ver getSlots em app.js: RH costuma valer mais que N, por exemplo), então
   o valor é somado por SLOT, não por carta.
───────────────────────────────────────────── */
function renderFicDashboard(cards) {
  let ownedValue = 0, missingValue = 0, ownedCount = 0, missingCount = 0;
  let bestOwned = null, bestMissing = null;
  const verCounts = {};
  cards.forEach(c => {
    getSlots(c, currentSet).forEach(s => {
      const key   = `${currentSet}:${c.n}:${s.ver}`;
      const price = s.price || 0;
      if (collected.has(key)) {
        ownedValue += price; ownedCount++;
        verCounts[s.ver] = (verCounts[s.ver] || 0) + 1;
        if (!bestOwned || price > bestOwned.price) bestOwned = { card: c, ver: s.ver, price };
      } else {
        missingValue += price; missingCount++;
        if (!bestMissing || price > bestMissing.price) bestMissing = { card: c, ver: s.ver, price };
      }
    });
  });
  const totalValue = ownedValue + missingValue;
  const pctValue = totalValue ? Math.round(ownedValue / totalValue * 100) : 0;
  const verLabel = v => (VERSIONS.find(x => x.code === v) || {}).label || v;

  const tiles = [
    kpiHTML('teal',  '💰 Valor da Coleção',   'R$' + fmtR(ownedValue),   ownedCount + ' slot' + (ownedCount === 1 ? '' : 's') + ' que você tem'),
    kpiHTML('red',   '🎯 Falta pra Fechar',   'R$' + fmtR(missingValue), missingCount + ' slot' + (missingCount === 1 ? '' : 's') + ' faltando'),
    kpiHTML('gold',  '📦 Valor Total do Set', 'R$' + fmtR(totalValue),   pctValue + '% do valor já é seu'),
  ];
  if (bestOwned)   tiles.push(kpiHTML('blue',   '⭐ Sua Carta Mais Valiosa', 'R$' + fmtR(bestOwned.price),   bestOwned.card.name   + ' #' + bestOwned.card.n   + ' · ' + verLabel(bestOwned.ver)));
  if (bestMissing) tiles.push(kpiHTML('orange', '💸 Falta Mais Cara',        'R$' + fmtR(bestMissing.price), bestMissing.card.name + ' #' + bestMissing.card.n + ' · ' + verLabel(bestMissing.ver)));

  const verChips = Object.keys(verCounts).length
    ? `<div class="fic-dash-vercounts">${
        VERSIONS.filter(vc => verCounts[vc.code]).map(vc =>
          `<span class="fic-dash-verchip" style="border-color:${vc.color};color:${vc.color}">${vc.label}: <b>${verCounts[vc.code]}</b></span>`
        ).join('')
      }</div>`
    : '';

  return `<div class="kpi-grid">${tiles.join('')}</div>${verChips}`;
}

/* ─────────────────────────────────────────────
   RENDER — MODO GRADE
───────────────────────────────────────────── */
// CORRIGIDO 29/07/2026 (pedido do Eduardo: fichários fixados devem ter "mesmo
// tamanho, mesmas funções" que os fichários oficiais ME04/ME05/etc): extraído
// de dentro de renderGridView() pra escopo de módulo, recebendo `setId`
// explícito em vez de usar `currentSet` direto — assim pode ser reaproveitado
// por qualquer lista de cartas de QUALQUER set, inclusive fichário personalizado
// (que mistura cartas de vários sets na mesma tela). Chamado por renderGridView
// abaixo (fichário oficial) e por openCustomBinderView em app.js (fichário
// personalizado/fixado) — os dois produzem exatamente o mesmo HTML/CSS agora.
function ficCardHtml(c, setId) {
  const lc = cardI18n(c, ficLang);
  const slots  = getSlots(c, setId);
  const vers   = slots.map(s => s.ver);
  const allCol = vers.every(v => collected.has(`${setId}:${c.n}:${v}`));
  const hasAny = vers.some(v  => collected.has(`${setId}:${c.n}:${v}`));
  const isImp  = c.important;

  const imgFilter = allCol ? 'none' : hasAny ? 'saturate(.6) brightness(.75)' : 'grayscale(80%) brightness(.55)';
  const border    = allCol ? '2px solid var(--teal)' : hasAny ? '2px solid var(--blue)' : (isImp ? '2px solid var(--gold)' : '2px solid var(--border)');
  const glow      = allCol ? '0 0 14px rgba(6,214,160,.45)' : hasAny ? '0 0 8px rgba(17,138,178,.3)' : (isImp ? '0 0 8px rgba(255,209,102,.3)' : 'none');

  // CORRIGIDO 30/07/2026 (pedido do Eduardo: "aumentar o tamanho, estão
  // pequenos" + precisa funcionar em QUALQUER fichário, não só o oficial):
  // quadradinhos maiores (14px → 20px numa 2ª rodada, pedido "pode aumentar
  // mais ainda") e cada um leva `data-ver` direto — fmInjectQuickToggleDots()
  // (em fichario_melhorias_23jul.js) não precisa mais recalcular a ordem das
  // versões via getSetCards()/currentSet, só lê o atributo.
  // CORRIGIDO 30/07/2026 (pedido do Eduardo: "no mobile está muito grande,
  // toma muita tela") — tamanho agora usa var(--dotsize) em vez de px fixo,
  // que o style.css encolhe pra 12px no media query mobile (@600px), igual
  // já é feito com --cw/--ch (tamanho do card) pro mesmo breakpoint.
  // CORRIGIDO 04/09/2026: dot de SP usava sempre a cor genérica "Especial"
  // (VERSIONS) — agora usa slotBadge(c,v), que devolve a cor/label da
  // raridade específica da carta (Full Art, Illustration Rare, ACE SPEC
  // etc.) quando o slot é SP; N/F/RH continuam exatamente como sempre foram.
  const dots = vers.map(v => {
    const key = `${setId}:${c.n}:${v}`;
    const qty = ficCollection[key]?.qty || (collected.has(key) ? 1 : 0);
    const vc  = slotBadge(c, v);
    return `<div data-ver="${v}" style="width:var(--dotsize,20px);height:var(--dotsize,20px);border-radius:5px;
      background:${qty>0?vc.color:'var(--border)'};flex-shrink:0;position:relative;box-shadow:0 1px 3px rgba(0,0,0,.4)"
      title="${vc.label} ×${qty} — clique pra marcar/desmarcar 1 cópia">
      ${qty>1?`<span style="position:absolute;top:-6px;right:-6px;font-size:9px;color:${vc.color};font-weight:900;
        text-shadow:0 0 2px rgba(0,0,0,.8)">×${qty}</span>`:''}
    </div>`;
  }).join('');

  return `
  <div class="bc2 fic-card${allCol?' collected':''}${isImp?' important':''}"
       data-n="${c.n}" data-ver="${vers[0]}" data-setid="${setId}"
       style="cursor:pointer;border-radius:7px;transition:transform .2s"
       onmouseover="this.style.transform='scale(1.1) translateY(-4px)'"
       onmouseout="this.style.transform=''">
    <div style="width:var(--cw,90px);height:var(--ch,126px);border-radius:7px;border:${border};
         box-shadow:${glow};position:relative;overflow:hidden;background:#0a0b10">
      <img src="${(typeof imgThumb==='function')?imgThumb(imgUrl(c.n, setId, c)):imgUrl(c.n, setId, c)}" alt="${lc.name}" loading="lazy" decoding="async" referrerpolicy="no-referrer"
           style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${imgFilter}"
           onerror="handleCardImgError(this,'${setId}','${c.n}')">
      <div style="display:none;flex-direction:column;align-items:center;justify-content:center;
           gap:3px;position:absolute;inset:0;padding:5px;text-align:center">
        <div style="font-family:'Space Mono',monospace;font-size:7px;color:var(--muted)">${c.n}</div>
        <div style="font-size:7px;font-weight:700;color:var(--text);line-height:1.2">${lc.name}</div>
        <div style="font-size:6px;color:var(--muted)">${c.type||''}</div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${c.color||'#666'}"></div>
      </div>
      <!-- check completo -->
      ${allCol?`<div style="position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;
        background:var(--teal);color:var(--bg);font-size:11px;display:flex;align-items:center;
        justify-content:center;font-weight:900;box-shadow:0 2px 8px rgba(6,214,160,.6)">✓</div>`:''}
      ${isImp&&!hasAny?`<div style="position:absolute;top:3px;right:4px;font-size:11px;color:var(--gold)">★</div>`:''}
    </div>
    <!-- CORRIGIDO 04/09/2026 (pedido do Eduardo: "espaço abaixo da carta,
         imagens ficam apagadas") — dots de versão saíram de cima da imagem
         (que fica escurecida quando falta) pra essa faixa própria embaixo,
         mesma ideia já aplicada no PDF (printBinder). data-dotswrap:
         marcador estável pra fmInjectQuickToggleDots achar isto sem
         depender do texto do style. -->
    <div data-dotswrap="1" style="display:flex;gap:4px;justify-content:center;padding-top:4px;width:var(--cw,90px)">${dots}</div>
    <!-- tooltip -->
    <div class="tip" style="position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);
         background:rgba(8,9,13,.96);border:1px solid var(--border);border-radius:6px;padding:8px 11px;
         font-size:11px;white-space:nowrap;opacity:0;pointer-events:none;z-index:100;min-width:140px;
         transition:opacity .15s">
      <div style="font-weight:700;color:var(--text)">${lc.name}</div>
      <div style="color:var(--muted);font-family:'Space Mono',monospace;font-size:9px">#${c.n} · ${c.type||''}</div>
      <div style="color:var(--accent2);font-size:9px;margin-top:2px">${c.rare||''}</div>
      ${lc.price?`<div style="color:var(--teal);font-size:10px;font-weight:700;margin-top:3px">${lc.symbol}${fmtR(lc.price)}</div>`:''}
      <div style="margin-top:4px;display:flex;gap:4px">
        ${vers.map(v => {
          const key = `${setId}:${c.n}:${v}`;
          const qty = ficCollection[key]?.qty || (collected.has(key) ? 1 : 0);
          const vc = VERSIONS.find(x => x.code === v);
          return `<span style="font-size:8px;padding:2px 5px;border-radius:3px;background:${qty>0?vc.bg:'rgba(0,0,0,.3)'};
            color:${qty>0?vc.color:'var(--muted)'};">${v}${qty>1?' ×'+qty:''}</span>`;
        }).join('')}
      </div>
      <div style="font-size:9px;color:var(--muted);margin-top:3px">Clique para editar</div>
    </div>
  </div>`;
}

function renderGridView(cards, setIdOf) {
  // setIdOf é opcional — sem ele, comportamento idêntico a antes (currentSet
  // pra toda carta). Fichário personalizado passa uma função que lê o set de
  // origem de cada carta (c._setId), já que mistura cartas de vários sets.
  const sIdOf = setIdOf || (() => currentSet);
  const cardHtml = c => ficCardHtml(c, sIdOf(c));

  // CORRIGIDO 01/10/2026 (pedido do Eduardo, cel30): antes só existia o split
  // fixo Base/Secretas. Agora usa o array `sections` de getSetData() (app.js)
  // quando o set define um — permite qualquer número de grupos com label e
  // filtro próprios (ex: cel30 separa Base/Pikachu Especial/Secretas/Especial
  // RGB/Coleção Clássica/Energias). Sem `sections` (todo o resto do catálogo,
  // fichário personalizado, etc.) cai no mesmo Base/Secretas de sempre —
  // nenhum outro set muda de comportamento.
  const customSections = (!setIdOf && typeof getSetData === 'function') ? getSetData()?.sections : null;
  const sections = (customSections && customSections.length)
    ? customSections
    : [{ lbl: '📄 Cartas Base', filter: c => c.base !== false },
       { lbl: '✨ Cartas Secretas', filter: c => c.base === false }];

  let html = '';
  let any = false;
  sections.forEach(sec => {
    const group = cards.filter(sec.filter);
    if (!group.length) return;
    any = true;
    html += `<div class="bsec-lbl">${sec.lbl}</div><div class="bgrid">${group.map(cardHtml).join('')}</div>`;
  });
  if (!any) html = `<div style="color:var(--muted);font-size:13px;padding:40px;text-align:center">Nenhuma carta encontrada com esses filtros.</div>`;
  return html;
}

/* ─────────────────────────────────────────────
   RENDER — MODO FICHÁRIO FÍSICO (páginas NxN)
───────────────────────────────────────────── */
// CORRIGIDO 30/07/2026 (pedido do Eduardo: fichários personalizados/Master
// Set também precisam do toggle "Grade/Fichário") — mesmo padrão retrocompatível
// de renderGridView: setIdOf opcional, sem ele usa currentSet pra toda carta
// (comportamento idêntico a antes).
function renderBinderView(cards, setIdOf) {
  const N = ficBinderSize;
  const sIdOf = setIdOf || (() => currentSet);
  const slots = [];
  cards.forEach(c => {
    const setId = sIdOf(c);
    getSlots(c, setId).forEach(s => slots.push({ card: c, ver: s.ver, setId }));
  });

  const slotsPerPage = N * N;
  const pages = [];
  for (let i = 0; i < slots.length; i += slotsPerPage) {
    pages.push(slots.slice(i, i + slotsPerPage));
  }

  const isMob = window.innerWidth <= 600;
  const cellSize = N === 2 ? (isMob ? 130 : 160) : N === 3 ? (isMob ? 96 : 130) : (isMob ? 72 : 90);
  const gap = N === 2 ? (isMob ? 12 : 14) : N === 3 ? (isMob ? 8 : 12) : (isMob ? 6 : 8);

  function slotHtml(slot) {
    if (!slot) return `<div style="width:${cellSize}px;height:${Math.round(cellSize*1.4)}px;
      border:2px dashed var(--border);border-radius:6px;opacity:.3"></div>`;
    const { card: c, ver: v, setId } = slot;
    const lc = cardI18n(c, ficLang);
    const key = `${setId}:${c.n}:${v}`;
    const isCollected = collected.has(key);
    const qty = ficCollection[key]?.qty || (isCollected ? 1 : 0);
    // CORRIGIDO 04/09/2026: SP usava sempre a cor genérica "Especial" — agora
    // slotBadge(c,v) devolve a raridade específica quando o slot é SP (N/F/RH
    // continuam idênticos a sempre). ink = texto claro/escuro pelo contraste,
    // pro badge de fundo sólido logo abaixo (era ${vc.bg} a ~15% de opacidade
    // — mesmo problema de legibilidade do PDF, só que na tela).
    const vc  = slotBadge(c, v);
    const ink = _badgeInk(vc.color);
    const imgFilter  = isCollected ? 'none' : 'grayscale(100%) brightness(.5)';
    const borderColor = isCollected ? vc.color : 'var(--border)';
    const glow       = isCollected ? `0 0 10px ${vc.color}55` : 'none';

    return `
    <div class="fic-card" data-n="${c.n}" data-ver="${v}" data-setid="${setId}"
         style="width:${cellSize}px;cursor:pointer;position:relative;transition:transform .15s"
         onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform=''">
      <div style="width:${cellSize}px;height:${Math.round(cellSize*1.4)}px;border-radius:6px;
           border:2px solid ${borderColor};box-shadow:${glow};background:#0a0b10;overflow:hidden;position:relative">
        <img src="${(typeof imgThumb==='function')?imgThumb(imgUrl(c.n, setId, c)):imgUrl(c.n, setId, c)}" alt="${lc.name}" loading="lazy" decoding="async" referrerpolicy="no-referrer"
             style="width:100%;height:100%;object-fit:cover;filter:${imgFilter}"
             onerror="handleCardImgError(this,'${setId}','${c.n}')">
        <div style="display:none;flex-direction:column;align-items:center;justify-content:center;
             gap:2px;position:absolute;inset:0;padding:4px;text-align:center">
          <div style="font-size:${cellSize>90?7:6}px;color:var(--muted);font-family:'Space Mono',monospace">${c.n}</div>
          <div style="font-size:${cellSize>90?7:5}px;font-weight:700;color:var(--text);line-height:1.1">${lc.name}</div>
          <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${c.color||'#666'}"></div>
        </div>
        ${qty>1?`<div style="position:absolute;top:2px;right:2px;font-size:8px;font-weight:900;
          color:${vc.color};background:rgba(0,0,0,.7);padding:1px 3px;border-radius:3px">×${qty}</div>`:''}
        ${isCollected?`<div style="position:absolute;bottom:2px;right:2px;width:14px;height:14px;border-radius:50%;
          background:${vc.color};color:#000;font-size:8px;display:flex;align-items:center;
          justify-content:center;font-weight:900">✓</div>`:''}
      </div>
      <!-- CORRIGIDO 04/09/2026 (pedido do Eduardo: "espaço abaixo da carta,
           imagens ficam apagadas") — badge de versão/raridade saiu de cima
           da imagem (que fica escurecida quando falta) pra essa faixa
           embaixo, junto do número — mesma ideia já aplicada no PDF. -->
      <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-top:2px;width:${cellSize}px">
        <div title="${vc.label}" style="font-size:${cellSize>90?7:6}px;padding:1px 4px;border-radius:3px;flex-shrink:0;
             background:${vc.color};color:${ink};font-family:'Space Mono',monospace;font-weight:700">${vc.code}</div>
        <div style="font-size:${cellSize>90?7:6}px;color:var(--muted);
             font-family:'Space Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.n}</div>
      </div>
    </div>`;
  }

  if (!pages.length) return `<div style="color:var(--muted);padding:40px;text-align:center">Nenhum slot encontrado.</div>`;

  return pages.map((page, pi) => {
    while (page.length < slotsPerPage) page.push(null);
    return `
    <div style="margin-bottom:32px">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);
           letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;
           display:flex;align-items:center;gap:10px">
        <span>📖 PÁGINA ${pi+1}</span>
        <span style="color:var(--accent2)">slots ${pi*slotsPerPage+1}–${Math.min((pi+1)*slotsPerPage, slots.length)}</span>
        <div style="flex:1;height:1px;background:var(--border)"></div>
      </div>
      <div style="display:flex;justify-content:center">
        <div style="display:grid;grid-template-columns:repeat(${N},${cellSize}px);gap:${gap}px;
             background:var(--surface);border:1px solid var(--border);border-radius:10px;
             padding:16px">
          ${page.map(slotHtml).join('')}
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ─────────────────────────────────────────────
   MODAL DE SLOT
───────────────────────────────────────────── */
// CORRIGIDO 29/07/2026 (pedido do Eduardo: fichário fixado com as mesmas
// funções do fichário oficial): 3 novos parâmetros opcionais.
//  - setIdOverride: set de origem da carta (fichário personalizado passa
//    c._setId, já que mistura cartas de vários sets — sem isso o modal ia
//    tentar usar `currentSet`, que não corresponde à carta clicada).
//  - cardOverride: objeto da carta já em mãos (fichário personalizado não
//    pode achar a carta via getSetCards(), que só cobre o set ATIVO na aba).
//  - onSaved: callback de re-render pós-salvar (default: renderBinder(), igual
//    a antes — fichário personalizado passa sua própria função de refresh).
// Sem esses argumentos, comportamento 100% igual a antes.
let _ficModalSetId    = null;
let _ficModalCardObj  = null;
let _ficModalOnSaved  = null;
async function openSlotModal(cardN, defaultVer, setIdOverride, cardOverride, onSaved) {
  const setId = setIdOverride || currentSet;
  const card  = cardOverride || getSetCards().find(c => c.n === cardN);
  if (!card) return;
  const _lcCard = cardI18n(card, ficLang);
  _ficModalSetId   = setId;
  _ficModalCardObj = card;
  _ficModalOnSaved = onSaved || null;

  const slots = getSlots(card, setId);

  // CORRIGIDO: usa purchases[] já carregado pelo app.js (sem chamada extra ao Supabase)
  const purchaseOptions = [...purchases].map(p =>
    `<option value="${p.product}">${new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} — ${p.product.substring(0,40)}</option>`
  ).join('');

  const slotsHtml = slots.map(s => {
    const v     = s.ver;
    const key   = `${setId}:${cardN}:${v}`;
    const entry = ficCollection[key] || { qty: collected.has(key) ? 1 : 0, origins: [] };
    const vc    = VERSIONS.find(x => x.code === v);
    const active = entry.qty > 0;
    return `
    <div id="slot-block-${v}" style="background:${active?vc.bg:'var(--surface2)'};border:1px solid ${active?vc.color:'var(--border)'};
         border-radius:8px;padding:14px;margin-bottom:10px;transition:all .2s">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <span style="color:${vc.color};font-family:'Space Mono',monospace;font-size:11px;font-weight:700">${v}</span>
          <span style="color:var(--muted);font-size:11px;margin-left:6px">${vc.label}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button onclick="adjSlotQty('${v}',-1)" style="width:24px;height:24px;border-radius:50%;
            background:var(--surface);border:1px solid var(--border);color:var(--text);cursor:pointer;
            font-size:14px;display:flex;align-items:center;justify-content:center">−</button>
          <span id="slot-qty-${v}" style="font-family:'Bebas Neue',sans-serif;font-size:24px;
            color:${active?vc.color:'var(--muted)'};min-width:24px;text-align:center">${entry.qty}</span>
          <button onclick="adjSlotQty('${v}',+1)" style="width:24px;height:24px;border-radius:50%;
            background:var(--surface);border:1px solid var(--border);color:var(--text);cursor:pointer;
            font-size:14px;display:flex;align-items:center;justify-content:center">+</button>
        </div>
      </div>
      ${entry.origins.length?`<div style="font-size:10px;color:var(--muted);margin-bottom:6px">
        Origens: ${entry.origins.join(', ')}</div>`:''}
      <div id="slot-origins-${v}" style="${entry.qty>0?'':'display:none'}">
        <select id="slot-origin-sel-${v}" style="width:100%;background:var(--surface);border:1px solid var(--border);
          border-radius:5px;padding:6px 8px;color:var(--text);font-size:11px;margin-bottom:4px">
          <option value="">— Selecionar origem —</option>
          ${purchaseOptions}
          <option value="Troca">Troca</option>
          <option value="Presente">Presente</option>
          <option value="Avulso">Avulso (loja)</option>
        </select>
        <button onclick="addOrigin('${v}')" style="font-size:10px;color:var(--teal);background:none;
          border:none;cursor:pointer;font-family:'Space Mono',monospace">+ Adicionar origem</button>
      </div>
    </div>`;
  }).join('');

  // Criar overlay se não existir
  let overlay = document.getElementById('slot-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'slot-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);z-index:2000;display:flex;align-items:center;justify-content:center';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSlotModal(); });
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
  <div class="slot-modal-box">
    <button onclick="closeSlotModal()" style="position:absolute;top:12px;right:12px;background:none;
      border:none;color:var(--muted);font-size:18px;cursor:pointer;z-index:2">✕</button>
    <div class="slot-modal-head">
      <img class="slot-modal-img" src="${imgUrl(cardN, setId, card)}" alt="${_lcCard.name}" referrerpolicy="no-referrer"
           onerror="handleCardImgError(this,'${setId}','${cardN}')">
      <div class="slot-modal-info">
        <div class="slot-modal-title">${_lcCard.name}</div>
        <div class="slot-modal-sub">#${card.n} · ${card.type||''}</div>
        <div class="slot-modal-rare">${card.rare||''}</div>
        ${_lcCard.price?`<div class="slot-modal-price">${_lcCard.symbol}${fmtR(_lcCard.price)}</div>`:''}
        ${card.important?'<div style="color:var(--gold);font-size:12px;margin-top:4px">★ Carta importante</div>':''}
      </div>
    </div>
    <div id="slot-modal-body">
      <div style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--muted);
           text-transform:uppercase;margin-bottom:10px">Versões disponíveis</div>
      ${slotsHtml}
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <button onclick="closeSlotModal()" style="background:var(--surface2);border:1px solid var(--border);
        color:var(--muted);padding:8px 14px;border-radius:6px;font-family:'Space Mono',monospace;
        font-size:11px;cursor:pointer">Cancelar</button>
      <button onclick="saveSlotModal('${cardN}')" style="background:var(--teal);color:var(--bg);
        border:none;padding:9px 18px;border-radius:6px;font-family:'Space Mono',monospace;
        font-size:11px;font-weight:700;cursor:pointer">Salvar</button>
    </div>
  </div>`;

  overlay.style.display = 'flex';

  // Estado temporário para este modal
  window._ficModalCard = cardN;
  window._ficModalQtys = {};
  window._ficModalOrigins = {};
  slots.forEach(s => {
    const v   = s.ver;
    const key = `${setId}:${cardN}:${v}`;
    const entry = ficCollection[key] || { qty: collected.has(key) ? 1 : 0, origins: [] };
    window._ficModalQtys[v]    = entry.qty;
    window._ficModalOrigins[v] = [...entry.origins];
  });
}

function adjSlotQty(ver, delta) {
  const qty = Math.max(0, (window._ficModalQtys[ver] || 0) + delta);
  window._ficModalQtys[ver] = qty;
  const vc = VERSIONS.find(x => x.code === ver);
  const el = document.getElementById('slot-qty-' + ver);
  if (el) { el.textContent = qty; el.style.color = qty > 0 ? vc.color : 'var(--muted)'; }
  const originBlock = document.getElementById('slot-origins-' + ver);
  if (originBlock) originBlock.style.display = qty > 0 ? '' : 'none';
  const block = document.getElementById('slot-block-' + ver);
  if (block) {
    block.style.background  = qty > 0 ? vc.bg : 'var(--surface2)';
    block.style.borderColor = qty > 0 ? vc.color : 'var(--border)';
  }
}

function addOrigin(ver) {
  const sel = document.getElementById('slot-origin-sel-' + ver);
  if (!sel?.value) return;
  if (!window._ficModalOrigins[ver]) window._ficModalOrigins[ver] = [];
  if (!window._ficModalOrigins[ver].includes(sel.value)) {
    window._ficModalOrigins[ver].push(sel.value);
  }
  sel.value = '';
  const btn = sel.nextElementSibling;
  if (btn) { btn.textContent = '✓ Adicionado'; setTimeout(() => btn.textContent = '+ Adicionar origem', 1500); }
}

async function saveSlotModal(cardN) {
  // CORRIGIDO 29/07/2026: usa o setId/carta guardados por openSlotModal em vez
  // de currentSet/getSetCards() — necessário pro fichário personalizado, cuja
  // carta clicada pode não pertencer ao set atualmente ativo na aba.
  const setId = _ficModalSetId || currentSet;
  const card  = _ficModalCardObj || getSetCards().find(c => c.n === cardN);
  if (!card) return;
  const slots = getSlots(card, setId);

  for (const s of slots) {
    const key     = `${setId}:${cardN}:${s.ver}`;
    const qty     = window._ficModalQtys[s.ver]     || 0;
    const origins = window._ficModalOrigins[s.ver]  || [];
    await saveSlot(key, qty, origins);
  }

  closeSlotModal();
  if (typeof _ficModalOnSaved === 'function') _ficModalOnSaved();
  else renderBinder();
  updateDashProgress();
}

function closeSlotModal() {
  const ov = document.getElementById('slot-modal-overlay');
  if (ov) ov.style.display = 'none';
}

/* ─────────────────────────────────────────────
   STATS GLOBAIS — delega para app.js
───────────────────────────────────────────── */
function renderGlobalStats() {
  updateDashProgress(); // app.js já faz o trabalho correto
}

/* ─────────────────────────────────────────────
   IMPRESSÃO / PDF
───────────────────────────────────────────── */
// CORRIGIDO 29/07/2026 (pedido do Eduardo: "imprimir o pdf" também nos
// fichários personalizados) — 3 parâmetros opcionais, mesma ideia de
// retrocompatibilidade usada em renderGridView/openSlotModal: sem eles,
// comportamento 100% igual a antes (set ativo na aba, currentSet pra toda
// carta). Com eles, imprime QUALQUER lista de cartas de QUALQUER set(s) —
// fichário personalizado passa suas próprias cartas (com _setId cada uma)
// e um resolver de setId por carta.
// NOVO 30/07/2026 (pedido do Eduardo: "seria legal se pudesse escolher quais
// imprimir, por exemplo se escolher visualizar só as faltantes, poder
// imprimir só as faltantes") — lê o MESMO checkbox "Só coletadas"/"Só
// faltantes" que já existe na tela (oficial usa #fc/#fm, personalizado e
// Master Set usam #cb-view-oc/#cb-view-om), sem precisar de UI nova.
function _printOnlyState() {
  const oc = document.getElementById('fc')?.checked ?? document.getElementById('cb-view-oc')?.checked ?? false;
  const om = document.getElementById('fm')?.checked ?? document.getElementById('cb-view-om')?.checked ?? false;
  if (om) return 'missing';
  if (oc) return 'collected';
  return undefined; // sem filtro — imprime tudo, igual sempre foi
}
window._printOnlyState = _printOnlyState;

async function printBinder(cardsOverride, setIdOf, labelOverride, onlyState) {
  const N     = ficBinderSize;
  const cards = cardsOverride || getSetCards();
  const sIdOf = setIdOf || (() => currentSet);
  let slots = [];
  cards.forEach(c => getSlots(c, sIdOf(c)).forEach(s => slots.push({ card: c, ver: s.ver, setId: sIdOf(c) })));

  // Filtra ANTES de paginar — imprime só o que o filtro pede, sem página
  // vazia sobrando pros slots que ficaram de fora.
  if (onlyState === 'missing' || onlyState === 'collected') {
    slots = slots.filter(slot => {
      const key = `${slot.setId}:${slot.card.n}:${slot.ver}`;
      const qty = ficCollection[key]?.qty || (collected.has(key) ? 1 : 0);
      return onlyState === 'missing' ? qty <= 0 : qty > 0;
    });
  }
  if (slots.length === 0) {
    alert('Nenhuma carta encontrada com esse filtro pra imprimir.');
    return;
  }

  // CORRIGIDO 18/08/2026: impressão de fichário grande baixava TODAS as
  // imagens em resolução `large` (Scrydex) de uma vez, sem aviso — um set
  // de ~250 cartas passava fácil de 150-200MB num único clique (reportado
  // por usuário em rede móvel). Abaixo: (1) aviso de tamanho antes de abrir
  // o popup pra sets grandes, (2) usa imgThumb() (versão pequena, ~1/10 do
  // peso) em vez de imgUrl() puro — ver troca no loop de render mais abaixo.
  if (slots.length > 60) {
    const estMB = Math.round(slots.length * 0.09); // ~90KB/imagem em /medium
    const ok = confirm(`Isso vai carregar ${slots.length} imagens (~${estMB}MB estimados). Continuar?`);
    if (!ok) return;
  }

  const slotsPerPage = N * N;
  // CORRIGIDO 04/09/2026 (pedido do Eduardo: "colocar um espaço logo abaixo
  // da carta, pois as imagens ficam muito apagadas") — badge e número
  // viviam OVERLAY em cima da imagem (que já fica escurecida/dessaturada
  // pra carta faltante — ver grayFilter abaixo); a etiqueta competindo
  // visualmente com uma imagem apagada ficava difícil de ler e feio.
  // LABEL_H_MM abre uma faixa branca FORA da imagem (não em cima) só pro
  // badge + número — a imagem em si fica intocada, sem nada sobreposto.
  const CARD_W_MM = 63, CARD_H_MM = 88, LABEL_H_MM = 6, GAP_MM = 3;
  const SLOT_H_MM = CARD_H_MM + LABEL_H_MM;
  const PAGE_W = N * CARD_W_MM + (N - 1) * GAP_MM + 20;
  const PAGE_H = N * SLOT_H_MM + (N - 1) * GAP_MM + 20;

  const popup = window.open('', '_blank');
  if (!popup) { alert('Permita pop-ups para imprimir.'); return; }

  popup.document.write(`<!DOCTYPE html><html><head><title>Fichário ${labelOverride || getSetLabel()}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#fff; font-family:sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; color-adjust:exact; }
    .page { width:${PAGE_W}mm; height:${PAGE_H}mm; display:grid;
      grid-template-columns:repeat(${N},${CARD_W_MM}mm);
      grid-template-rows:repeat(${N},${SLOT_H_MM}mm);
      gap:${GAP_MM}mm; padding:10mm; page-break-after:always; break-after:page; }
    .slot { width:${CARD_W_MM}mm; height:${SLOT_H_MM}mm; border:0.5px solid #ccc;
      border-radius:3mm; overflow:hidden; background:#f5f5f5; display:flex; flex-direction:column; }
    .slot .imgwrap { width:100%; height:${CARD_H_MM}mm; position:relative; overflow:hidden; flex-shrink:0; }
    .slot img { width:100%; height:100%; object-fit:cover; }
    .slot .label { height:${LABEL_H_MM}mm; flex-shrink:0; display:flex; align-items:center; justify-content:space-between;
      gap:1mm; padding:0 1.5mm; background:#fff; border-top:0.5px solid #eee; }
    .slot .empty { display:flex;align-items:center;justify-content:center;height:100%;color:#ccc;font-size:8pt; }
    .slot .badge { font-size:6pt;padding:.5mm 1.5mm;border-radius:1mm;font-weight:bold;line-height:1.4;white-space:nowrap; }
    .slot .num { font-size:6pt;color:#666;white-space:nowrap; }
    /* CORRIGIDO 18/08/2026 (pedido de usuário: "uma lojinha me pediu pra imprimir
       a lista de faltantes colorida, facilita a identificação das cartas"):
       -webkit-print-color-adjust/print-color-adjust garantem que a maioria dos
       navegadores mantenha as cores de fundo (badge de versão) na impressão sem
       precisar que o usuário ative manualmente "imprimir imagens de fundo". */
    @media print {
      html,body{width:${PAGE_W}mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
      .page{page-break-after:always;break-after:page;} .no-print{display:none!important;}
      * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; color-adjust:exact!important; }
    }
  </style></head><body>`);

  const onlyLabel = onlyState === 'missing' ? ' · só faltantes' : onlyState === 'collected' ? ' · só coletadas' : '';
  popup.document.write(`<div class="no-print" style="position:fixed;top:10px;right:10px;z-index:999;display:flex;gap:8px">
    <span style="font-size:12px;color:#666;align-self:center">${slots.length} slots${onlyLabel} · ${Math.ceil(slots.length/slotsPerPage)} páginas</span>
    <button onclick="window.print()" style="background:#06d6a0;color:#000;border:none;padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖨️ Imprimir</button>
    <button onclick="window.close()" style="background:#1e2436;color:#aaa;border:none;padding:8px 12px;border-radius:6px;cursor:pointer">✕</button>
  </div>`);

  for (let pi = 0; pi < Math.ceil(slots.length / slotsPerPage); pi++) {
    const page = slots.slice(pi * slotsPerPage, (pi + 1) * slotsPerPage);
    while (page.length < slotsPerPage) page.push(null);
    popup.document.write(`<div class="page">`);
    page.forEach(slot => {
      if (!slot) { popup.document.write(`<div class="slot"><div class="empty">vazio</div></div>`); return; }
      const { card: c, ver: v, setId } = slot;
      const key = `${setId}:${c.n}:${v}`;
      const qty = ficCollection[key]?.qty || (collected.has(key) ? 1 : 0);
      // CORRIGIDO 04/09/2026 (pedido do Eduardo, mockup "antes/depois"): badge
      // era um texto colorido sobre fundo quase transparente (${col}33 = ~20%
      // opacidade) — ilegível, principalmente em P&B. Agora fundo SÓLIDO da
      // cor do badge (slotBadge — específica por raridade quando é SP, não só
      // o genérico "SP" laranja de sempre) com tinta clara/escura calculada
      // pelo contraste (_badgeInk), igual a sugestão do mockup.
      const badge = slotBadge(c, v);
      const ink   = _badgeInk(badge.color);
      // CORRIGIDO 18/08/2026: quando a impressão já está filtrada por
      // "só faltantes"/"só coletadas" (onlyState), TODA carta da lista tem o
      // mesmo status por definição — aplicar o filtro cinza (que existe pra
      // diferenciar coletada/faltante no fichário COMPLETO) só deixava a lista
      // de faltantes toda apagada, sem servir pra nada. Só escurece quando
      // imprime o fichário sem filtro (onlyState undefined).
      const grayFilter = (qty > 0 || onlyState) ? '' : 'filter:grayscale(100%) opacity(0.4);';
      popup.document.write(`
      <div class="slot">
        <div class="imgwrap">
          <img src="${(typeof imgMedium === 'function') ? imgMedium(imgUrl(c.n, setId, c)) : imgUrl(c.n, setId, c)}" alt="${c.name}" style="${grayFilter}" referrerpolicy="no-referrer"
               onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=empty>${c.n}<br>${c.name}</div>')">
        </div>
        <div class="label">
          <div class="badge" title="${badge.label}" style="background:${badge.color};color:${ink}">${badge.code}${qty>1?' ×'+qty:''}</div>
          <div class="num">#${c.n}</div>
        </div>
      </div>`);
    });
    popup.document.write(`</div>`);
  }
  popup.document.write(`</body></html>`);
  popup.document.close();
}

/* ─────────────────────────────────────────────
   WRAPPER DE UI
───────────────────────────────────────────── */
function renderFicharioUI() {
  loadCollection();
  renderBinder();
  updateDashProgress();
}

// Expor globalmente
window.initFichario      = initFichario;
window.renderBinder      = renderBinder;
window.renderFicDashboard = renderFicDashboard;
window.switchFicSet      = switchFicSet;
window.setFicView        = setFicView;
window.setBinderSize     = setBinderSize;
window.openSlotModal     = openSlotModal;
window.closeSlotModal    = closeSlotModal;
window.saveSlotModal     = saveSlotModal;
window.adjSlotQty        = adjSlotQty;
window.addOrigin         = addOrigin;
window.printBinder       = printBinder;
window.renderFicharioUI  = renderFicharioUI;
window.renderGlobalStats = renderGlobalStats;
window.loadCollection    = loadCollection;
// CORRIGIDO 29/07/2026: exposto pra fichário personalizado/fixado (app.js)
// poder renderizar cards com a MESMA função/HTML/CSS do fichário oficial.
window.ficCardHtml       = ficCardHtml;
window.renderGridView    = renderGridView;
window.imgUrl            = imgUrl;
// ADICIONADO 30/07/2026: exposto pra fichário personalizado/Master Set poderem
// oferecer o toggle Grade/Fichário físico (renderBinderView já aceita setIdOf
// explícito, então funciona com cartas de múltiplos sets misturados).
window.renderBinderView  = renderBinderView;
