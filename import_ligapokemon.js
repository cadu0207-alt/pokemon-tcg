// import_ligapokemon.js — NOVO 07/08/2026
// Importador de fichário a partir do export CSV da LigaPokemon (colecaoresultado.php
// ou tela equivalente de "exportar coleção"). Pedido do Eduardo: colar o CSV e
// preencher nosso fichário EXATAMENTE como está lá, ACRESCENTANDO (somando) à
// quantidade que já temos — nunca substituindo/zerando o que já existe.
//
// Padrão monkey-patch de sempre (ver [[feedback_coding]] / project_pokemon_tcg.md):
// arquivo isolado, zero edição em app.js/fichario_patch.js, só injeta 1 botão
// novo no menu "⋯ Mais ações" do Fichário (ver index.html linha ~401) via JS,
// sem tocar no HTML estático.
//
// Mapeamento de raridade e a leitura da coluna "Extras" foram validados
// carta-a-carta contra cards_sv3.js (Obsidiana em Chamas/OBF) usando o export
// real que o Eduardo mandou, e confirmados por ele em 07/08/2026:
//   - Raridade Liga → nossa raridade PT: bate 1:1, sem ambiguidade.
//   - Extras "Foil" → é a versão Reverse Holo (RH); Extras vazio → é a outra
//     versão da carta (Foil "F" quando a raridade é Rara, ou "Normal" "N"
//     quando é Comum/Incomum). Confirmado pelo Eduardo, não é chute.
//
// ESCOPO INICIAL (confirmado 07/08/2026): só coleções "modernas" já com sigla
// oficial no nosso SET_CATALOG (SV1-10 + ME02-06/MEG/MEP/SVP). Sets legados
// (SWSH pra trás) ficam pra uma rodada seguinte — LIGA_SIGLA_MAP abaixo é
// fácil de estender, só adicionar mais entradas.

const LIGA_SIGLA_MAP = {
  // Scarlet & Violet (EN sigla oficial da Liga == ptcgoCode)
  SVI:'sv1', PAL:'sv2', OBF:'sv3', MEW:'sv3pt5', PAR:'sv4', PAF:'sv4pt5',
  TEF:'sv5', TWM:'sv6', SFA:'sv6pt5', SCR:'sv7', SSP:'sv8', PRE:'sv8pt5',
  JTG:'sv9', DRI:'sv10', SVP:'svp',
  // Mega Evolução (siglas já usadas nos nossos próprios labels SET_CATALOG)
  PFL:'me02', POR:'me03', CRI:'me04', PBL:'me05', MEG:'meg', MEP:'mep',
};

// Raridade Liga → nossa raridade PT (usado só pra um aviso de conferência —
// quem decide a versão real é getSlots() em cima da carta que já achamos no
// nosso cadastro, não esse texto).
const LIGA_RARITY_MAP = {
  C:'Comum', U:'Incomum', R:'Rara', RD:'Rara Dupla', RU:'Ultra Rara',
  IR:'Rara Ilustrada', IS:'Rara Ilustrada Especial', HR:'Hiper Rara',
};

// ── Parser CSV (RFC4180 simplificado: aspas duplas, campos com vírgula dentro) ──
function ligaParseCSVLine(line){
  const out=[]; let cur=''; let inQ=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(inQ){
      if(ch==='"'){
        if(line[i+1]==='"'){ cur+='"'; i++; } else { inQ=false; }
      } else cur+=ch;
    } else {
      if(ch==='"') inQ=true;
      else if(ch===','){ out.push(cur); cur=''; }
      else cur+=ch;
    }
  }
  out.push(cur);
  return out;
}

function ligaParseCSV(text){
  const lines=text.replace(/\r\n/g,'\n').split('\n').filter(l=>l.trim().length);
  if(!lines.length) return [];
  const header=ligaParseCSVLine(lines[0]).map(h=>h.trim());
  const idx={
    sigla: header.findIndex(h=>/Edicao \(Sigla\)/i.test(h)),
    cardPT: header.findIndex(h=>/^Card \(PT\)/i.test(h)),
    cardEN: header.findIndex(h=>/^Card \(EN\)/i.test(h)),
    qtd: header.findIndex(h=>/Quantidade/i.test(h)),
    raridade: header.findIndex(h=>/Raridade/i.test(h)),
    extras: header.findIndex(h=>/^Extras/i.test(h)),
    numero: header.findIndex(h=>/Card #/i.test(h)),
  };
  if(idx.sigla<0||idx.numero<0||idx.raridade<0){
    return {error:'Cabeçalho do CSV não reconhecido — confere se colou o export completo (com a primeira linha de cabeçalho).'};
  }
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const f=ligaParseCSVLine(lines[i]);
    if(f.length<2) continue;
    rows.push({
      sigla:(f[idx.sigla]||'').trim().toUpperCase(),
      cardPT:(f[idx.cardPT]||'').trim(),
      cardEN:(f[idx.cardEN]||'').trim(),
      qtd: parseInt(f[idx.qtd])||1,
      raridade:(f[idx.raridade]||'').trim().toUpperCase(),
      extras:(f[idx.extras]||'').trim(),
      numero: parseInt(f[idx.numero]),
    });
  }
  return {rows};
}

// ── Regra de leitura da coluna "Extras" (confirmada com o Eduardo em 07/08/2026) ──
// Não existe 1 regra só — existem 2 pares possíveis de versão, e a regra muda
// conforme QUAL par a carta tem (isso é decidido pelo getSlots() de cada carta,
// não pela Liga):
//   Regra A — carta só tem [Normal, Reverse Holo] (raridade Comum/Incomum):
//     Extras vazio  → Normal (N)
//     Extras "Foil" → Reverse Holo (RH)
//   Regra B — carta só tem [Foil, Reverse Holo] (raridade Rara/Ilustrada/etc,
//   que não existe impressão "normal" — o pull padrão já nasce holo):
//     Extras vazio  → Foil (F)
//     Extras "Foil" → Reverse Holo (RH)
// Nos dois casos o "Foil" da Liga sempre aponta pro Reverse Holo — é sempre a
// SEGUNDA versão do par. Cartas de versão única (SP: secretas/ex/legadas) não
// entram nessa regra, o Extras é ignorado pra elas.
function ligaResolveVersion(slots, extrasRaw){
  if(slots.length===1) return slots[0].ver; // versão única — Extras não importa
  const isFoilExtra=/foil/i.test(extrasRaw||'');
  const rh=slots.find(s=>s.ver==='RH');
  const outraVersao=slots.find(s=>s.ver!=='RH'); // N (Regra A) ou F (Regra B), conforme o par
  return isFoilExtra ? (rh?rh.ver:slots[1].ver) : (outraVersao?outraVersao.ver:slots[0].ver);
}

// ── Resolução: linha do CSV → slot_key do nosso sistema ──────────────────────
function ligaResolveRows(rows){
  const resolved=new Map(); // key -> {setId,n,ver,qty,name,warnings:[]}
  const unresolved=[]; // {row, reason}
  for(const row of rows){
    if(!row.sigla || isNaN(row.numero)){ unresolved.push({row,reason:'Linha sem sigla ou sem número de carta'}); continue; }
    const setId=LIGA_SIGLA_MAP[row.sigla];
    if(!setId){ unresolved.push({row,reason:`Sigla "${row.sigla}" ainda não mapeada (fora do escopo desta 1ª versão)`}); continue; }
    const getCards=(typeof SET_CARDS_MAP!=='undefined')&&SET_CARDS_MAP[setId];
    const cards=getCards?getCards():null;
    if(!cards||!cards.length){ unresolved.push({row,reason:`Coleção "${setId}" sem dados carregados`}); continue; }
    const card=cards.find(c=>parseInt(c.n)===row.numero);
    if(!card){ unresolved.push({row,reason:`Carta #${row.numero} não encontrada em ${setId}`}); continue; }
    const slots=(typeof getSlots==='function')?getSlots(card,setId):null;
    if(!slots||!slots.length){ unresolved.push({row,reason:`Não consegui calcular versões pra ${card.name} (${setId} #${row.numero})`}); continue; }
    const ver=ligaResolveVersion(slots, row.extras);
    const key=`${setId}:${card.n}:${ver}`;
    const warnings=[];
    const expectedRare=LIGA_RARITY_MAP[row.raridade];
    if(expectedRare && card.rare!==expectedRare){
      warnings.push(`raridade Liga (${row.raridade}=${expectedRare}) diverge do nosso cadastro (${card.rare}) — conferir`);
    }
    if(resolved.has(key)){
      const e=resolved.get(key);
      e.qty+=row.qtd;
    } else {
      resolved.set(key,{setId,n:card.n,ver,qty:row.qtd,name:card.name,warnings});
    }
  }
  return {resolved,unresolved};
}

// ── Modal ──────────────────────────────────────────────────────────────────
function ligaEnsureModal(){
  if(document.getElementById('mligaimport')) return;
  const ov=document.createElement('div');
  ov.className='ov'; ov.id='mligaimport';
  ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('mligaimport'); });
  ov.innerHTML=`<div class="modal modal-wide" style="max-height:88vh;overflow-y:auto">
    <button class="mc-btn" onclick="closeModal('mligaimport')">✕</button>
    <h3 style="margin:0 0 4px">📥 Importar fichário da Liga Pokémon</h3>
    <p style="font-size:11px;color:var(--muted);margin:0 0 12px;line-height:1.5">
      Cole abaixo o CSV exportado da Liga Pokémon (com a linha de cabeçalho). Vamos reconhecer
      as cartas e <b>somar</b> à quantidade que você já tem no fichário — nada é substituído ou
      zerado. Escopo desta versão: coleções SV1-10, ME02-06, MEG, MEP e SVP.
    </p>
    <textarea id="liga-csv-input" placeholder='"Edicao (PTBR)","Edicao (EN)","Edicao (Sigla)",...'
      style="width:100%;min-height:140px;background:var(--bg2);color:var(--text);border:1px solid var(--border);
             border-radius:8px;padding:10px;font-family:'Space Mono',monospace;font-size:11px;resize:vertical"></textarea>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button id="liga-parse-btn" class="fic-btn" onclick="ligaProcessPaste()">🔍 Processar</button>
      <button id="liga-confirm-btn" class="fic-btn" style="display:none" onclick="ligaConfirmImport()">✅ Confirmar importação</button>
    </div>
    <div id="liga-preview" style="margin-top:14px"></div>
  </div>`;
  document.body.appendChild(ov);
}

function ligaOpenImportModal(){
  ligaEnsureModal();
  const ta=document.getElementById('liga-csv-input'); if(ta) ta.value='';
  const prev=document.getElementById('liga-preview'); if(prev) prev.innerHTML='';
  const cbtn=document.getElementById('liga-confirm-btn'); if(cbtn) cbtn.style.display='none';
  openModal('mligaimport');
}

let _ligaLastResolved=null;

function ligaProcessPaste(){
  const ta=document.getElementById('liga-csv-input');
  const preview=document.getElementById('liga-preview');
  const cbtn=document.getElementById('liga-confirm-btn');
  if(!ta||!preview) return;
  const text=ta.value;
  if(!text.trim()){ preview.innerHTML='<p style="color:var(--muted);font-size:12px">Cole o CSV antes de processar.</p>'; return; }
  const parsed=ligaParseCSV(text);
  if(parsed.error){
    preview.innerHTML=`<p style="color:#ff6b6b;font-size:12px">${parsed.error}</p>`;
    if(cbtn) cbtn.style.display='none';
    return;
  }
  const {resolved,unresolved}=ligaResolveRows(parsed.rows);
  _ligaLastResolved=resolved;

  // Agrupa reconhecidas por coleção
  const bySet={};
  for(const [,e] of resolved){
    (bySet[e.setId]=bySet[e.setId]||[]).push(e);
  }
  const setBlocks=Object.entries(bySet).map(([setId,entries])=>{
    const totalQty=entries.reduce((s,e)=>s+e.qty,0);
    const withWarn=entries.filter(e=>e.warnings.length);
    const label=(typeof SET_CATALOG!=='undefined'&&SET_CATALOG.find(s=>s.id===setId)?.label)||setId;
    return `<div style="margin-bottom:10px;padding:10px;border:1px solid var(--border);border-radius:8px">
      <b style="color:var(--teal)">${label}</b>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">
        ${entries.length} carta(s) diferentes reconhecidas · ${totalQty} cópia(s) no total
        ${withWarn.length?`· <span style="color:var(--gold)">${withWarn.length} com aviso de raridade</span>`:''}
      </div>
    </div>`;
  }).join('');

  const unresolvedBlock = unresolved.length ? `
    <details style="margin-top:8px">
      <summary style="cursor:pointer;color:var(--gold);font-size:12px">⚠️ ${unresolved.length} linha(s) não reconhecidas (clique pra ver)</summary>
      <div style="max-height:200px;overflow-y:auto;margin-top:8px;font-size:10.5px;color:var(--muted)">
        ${unresolved.slice(0,300).map(u=>`<div style="padding:3px 0;border-bottom:1px solid var(--border)">
          ${u.row.cardPT||u.row.cardEN||'?'} — ${u.row.sigla} #${isNaN(u.row.numero)?'?':u.row.numero} — <i>${u.reason}</i>
        </div>`).join('')}
        ${unresolved.length>300?`<div style="padding:6px 0">... e mais ${unresolved.length-300}</div>`:''}
      </div>
    </details>` : '';

  const totalResolved=resolved.size;
  preview.innerHTML = `
    <p style="font-size:12px;color:var(--text)">
      <b style="color:var(--teal)">${totalResolved}</b> carta(s) reconhecida(s)
      ${unresolved.length?`, <b style="color:var(--gold)">${unresolved.length}</b> não reconhecida(s)`:''}.
    </p>
    ${setBlocks||'<p style="color:var(--muted);font-size:12px">Nenhuma carta reconhecida.</p>'}
    ${unresolvedBlock}
  `;
  if(cbtn) cbtn.style.display = totalResolved ? '' : 'none';
}

async function ligaConfirmImport(){
  if(!_ligaLastResolved || !_ligaLastResolved.size) return;
  if(!uid()){ alert('Faça login pra importar — sem login não dá pra salvar no seu fichário.'); return; }
  if(!confirm(`Vamos ADICIONAR ${_ligaLastResolved.size} carta(s) ao seu fichário, somando à quantidade que você já tem. Confirmar?`)) return;
  const btn=document.getElementById('liga-confirm-btn');
  const entries=[..._ligaLastResolved.entries()];
  let done=0, errors=0;
  if(btn){ btn.disabled=true; }
  for(const [key,e] of entries){
    const prevEntry=(typeof collectedQty!=='undefined')?collectedQty.get(key):null;
    const newQty=(prevEntry?.qty||0)+e.qty;
    const origins=prevEntry?.origins||[];
    try{
      await saveSlot(key,newQty,origins);
      done++;
    }catch(err){
      errors++;
      console.error('Erro importando', key, err);
    }
    if(btn) btn.textContent=`Importando… ${done+errors}/${entries.length}`;
  }
  if(btn){ btn.disabled=false; btn.textContent='✅ Confirmar importação'; }
  if(typeof renderBinder==='function') renderBinder();
  if(typeof updateDashProgress==='function') updateDashProgress();
  if(typeof setStatus==='function') setStatus(`Importação concluída: ${done} carta(s) atualizadas${errors?`, ${errors} erro(s)`:''}`, errors?'error':'success');
  closeModal('mligaimport');
}

// ── Injeção do botão no menu "⋯ Mais ações" ──────────────────────────────────
function ligaInjectMenuButton(){
  const menu=document.getElementById('fic-more-menu');
  if(!menu || document.getElementById('fic-import-liga')) return;
  const btn=document.createElement('button');
  btn.id='fic-import-liga';
  btn.className='fic-more-item';
  btn.textContent='📥 Importar da Liga Pokémon';
  btn.onclick=function(){ ligaOpenImportModal(); if(typeof ficCloseMoreMenu==='function') ficCloseMoreMenu(); };
  menu.appendChild(btn);
}

(function ligaBoot(){
  const tryInject=()=>ligaInjectMenuButton();
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', tryInject);
  } else tryInject();
  // O menu #fic-more-menu já existe estático no index.html (não depende de
  // render dinâmico), mas garantimos algumas tentativas iniciais caso este
  // script carregue antes do DOM terminar de montar essa parte específica.
  let tries=0;
  const iv=setInterval(()=>{ tries++; ligaInjectMenuButton(); if(document.getElementById('fic-import-liga')||tries>20) clearInterval(iv); }, 300);
})();

if(typeof window!=='undefined'){
  window.ligaOpenImportModal=ligaOpenImportModal;
  window.ligaProcessPaste=ligaProcessPaste;
  window.ligaConfirmImport=ligaConfirmImport;
  window.LIGA_SIGLA_MAP=LIGA_SIGLA_MAP;
}
