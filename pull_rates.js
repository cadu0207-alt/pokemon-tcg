// ============================================================
//  PULL_RATES — fonte única, compartilhada por:
//    - ev_calculator.js  (aba Preço Justo — calcula EV)
//    - simulador.html    (aba Simulador — sorteia cartas do pack)
//
//  Antes desse arquivo, as duas telas tinham cada uma sua própria
//  cópia de PULL_RATES + função de normalização de raridade. Elas
//  divergiram: normalizeRare() (Preço Justo) já reconhecia os nomes
//  provisórios do ME05 ("Art Rare", "Super Rare" etc.), mas
//  normalizeRareBucket() (Simulador) não — resultado: todo hit raro
//  do ME05 caía no bucket base (76%) dentro do Simulador. Unificando
//  aqui, os dois consumidores usam exatamente a mesma lógica.
//  Ver [[feedback_coding]] — incidente "EV só bate em Caos Ascendente".
// ============================================================
var PULL_RATES = {
  'Rara':              { prob: 0.7639, label: 'Rara base (76,4%)' },
  'Dupla Rara':        { prob: 0.12,   label: 'Dupla Rara (RD) 1/8' },
  'Ilustr. Rara':      { prob: 0.07,   label: 'Ilustr. Rara (IR) 1/14' },
  'Rara Ultra':        { prob: 0.035,  label: 'Rara Ultra (UR) 1/29' },
  'Ilustr. Esp. Rara': { prob: 0.01,   label: 'Ilustr. Especial (SAR) 1/100' },
  'Mega Hyper Rare':   { prob: 1/909,  label: 'Mega Hiper Raro 1/909' },
  'Rara (Holo)':       { prob: 0,      label: 'Rara Holo (nao existe)' },
  'Comum':             { prob: 3.0,    label: 'Comum' },
  'Incomum':           { prob: 1.0,    label: 'Incomum' }
};
var EV_EXCLUDE = { 'Comum': true, 'Incomum': true };

// ── Mapa de raridades por era/idioma ─────────────────────────────
// Cada geração (ME, SV) e cada tradução usa um texto diferente pra
// dizer a MESMA coisa. Ver histórico do incidente acima — antes só
// as strings do ME04 eram reconhecidas.
//
// SV usa as MESMAS taxas calibradas pra era ME como aproximação (não
// há dado real de pull rate por era ainda — decisão consciente do
// Eduardo até termos números melhores).
function normalizeRare(r) {
  if (!r) return 'Rara';
  var s = r.trim();
  if (s === 'Dupla Rara' || s === 'Rara Dupla' || s === 'Double Rare') return 'Dupla Rara';
  // Illustration Rare (IR) — ME: "Ilustr. Rara" · SV: "Rara Ilustrada" · Promo: "Ilustração Rara (IR)" · ME05 (provisório): "Art Rare"
  if (s === 'Ilustr. Rara' || s === 'Illustration Rare' || s === 'Rara Ilustrada' ||
      s === 'Ilustração Rara (IR)' || s === 'Art Rare') return 'Ilustr. Rara';
  // Ultra Rare (UR) — ME: "Rara Ultra" · SV: "Ultra Rara" (ordem invertida) · ME05 (provisório): "Super Rare"
  if (s === 'Rara Ultra' || s === 'Ultra Rare' || s === 'Ultra Rara' || s === 'Super Rare') return 'Rara Ultra';
  // Special Illustration Rare (SAR/SIR) — ME: "Ilustr. Esp. Rara" · SV: "Rara Ilustrada Especial" · ME05 (provisório): "Special Art Rare"
  if (s === 'Ilustr. Esp. Rara' || s === 'Special Illustration Rare' || s === 'Rara Ilustrada Especial' ||
      s === 'Special Art Rare') return 'Ilustr. Esp. Rara';
  // Hyper Rare (topo da raridade) — ME: "Mega Hyper Rare"/"Mega Attack Rare" · SV: "Hiper Rara" · ME05 (provisório): "Mega Ultra Rare"
  if (s === 'Mega Hyper Rare' || s === 'Hyper Rare' || s === 'Mega Attack Rare' ||
      s === 'Hiper Rara' || s === 'Mega Ultra Rare') return 'Mega Hyper Rare';
  // Holo Rare (slot bônus, sem valor de mercado relevante — fica fora do EV, prob 0)
  if (s === 'Rara (Holo)' || s === 'Holo Rare' || s === 'Rara Holo') return 'Rara (Holo)';
  // ACE SPEC e Shiny Vault (Rara Brilhante / Ultra Rara Brilhante) — mecânica exclusiva
  // da era SV, sem equivalente na era ME. Sem taxa real calibrada ainda: fica de fora
  // do cálculo de EV por enquanto (não existe entrada correspondente em PULL_RATES,
  // então calcEV() ignora essas cartas em vez de tratá-las como raridade comum).
  if (s === 'ACE SPEC') return 'ACE SPEC';
  if (s === 'Rara Brilhante' || s === 'Ultra Rara Brilhante') return 'Rara Brilhante (Shiny Vault)';
  if (s === 'Comum' || s === 'Common')   return 'Comum';
  if (s === 'Incomum' || s === 'Uncommon') return 'Incomum';
  // Fallback: nenhum padrão reconhecido. Antes isso virava 'Rara' (raridade base,
  // 76% de chance) EM SILÊNCIO — foi exatamente essa falha que causou o incidente
  // "EV só bate em Caos Ascendente" (raridades da era SV inteira caindo aqui sem
  // ninguém perceber). Agora avisa no console pra pegar isso cedo da próxima vez
  // que um cards_*.js novo usar um texto de raridade ainda não mapeado.
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[pull_rates] raridade não reconhecida, caindo no default "Rara": "' + s + '" — adicionar em normalizeRare() se for uma raridade nova/variante de idioma.');
  }
  return 'Rara';
}

// ── Bucket curto (RD/IR/UR/IRE/MHR/BASE) usado pelo Simulador para
//    sortear a carta dentro do pool certo. Reaproveita normalizeRare()
//    acima — qualquer variante de idioma/era que ela reconhecer já
//    cai automaticamente no bucket certo aqui também.
var RARE_TO_BUCKET = {
  'Dupla Rara':        'RD',
  'Ilustr. Rara':      'IR',
  'Rara Ultra':        'UR',
  'Ilustr. Esp. Rara': 'IRE',
  'Mega Hyper Rare':   'MHR'
};
function normalizeRareBucket(r) {
  return RARE_TO_BUCKET[normalizeRare(r)] || 'BASE';
}
