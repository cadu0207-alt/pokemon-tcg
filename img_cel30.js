// ================================================================
// MyDeck — artes da Celebração de 30 Anos (img_cel30.js, 17/10/2026)
// Movido do app.js pra ser compartilhado com o Simulador (simulador.html). Carrega ANTES do app.js.
// ================================================================

// cel30: sem entrada no scrydex (set novo) — hotlink direto no CDN do
// limitlesstcg.com/cards/30C (conferido 30/09/2026: padrao
// 30C_<codigo>_R_EN_LG.png). Cartas normais/secretas usam o numero com 3
// digitos (001, 023, 158); RGB usa a letra sozinha (G/R/B); a Coleção
// Clássica guarda no `n` o codigo ORIGINAL do set de origem (ex "4/102"),
// que não é o que o limitlesstcg usa na URL — por isso o mapa CEL30_CC_IMG
// (mesmo mapeamento nome<->CC-index conferido na correção de 30/09/2026).
const CEL30_CC_IMG={
  '4/102':'CC2','5/109':'CC8','11/113':'CC11','11/101':'CC20','18/132':'CC3',
  '19/109':'CC9','25/111':'CC5','33/181':'CC25','41/122':'CC22','43/146':'CC13',
  '47/127':'CC14','050/185':'CC27','57/111':'CC24','58/102':'CC1','69/132':'CC4',
  '85/124':'CC19','89/149':'CC23','94/102':'CC15','99/102':'CC16','100/102':'CC17',
  '101/101':'CC18','106/106':'CC12','106/160':'CC21','106/105':'CC6','108/115':'CC10',
  '114/264':'CC28','123/172':'CC29','138/202':'CC26','149/147':'CC7','203/193':'CC30',
};
// lang (30/09/2026, seletor de idioma do Fichário): 'pt'|'en'|'de'|'fr'|'es'|'it'
// — os 6 confirmados no mesmo CDN pra este set (30C_<codigo>_R_<LANG>_LG.png,
// todos retornam 200). Japonês/Chinês NÃO seguem este padrão — são sets com
// numeração própria (M6a/30thC), ainda não integrados.
function imgCel30(n,lang){
  const l=(lang||'en').toUpperCase();
  // CORRIGIDO 01/10/2026 (pedido do Eduardo: "procure as artes das
  // energias") — as 8 Energias Básicas (MEE 009-016) NÃO pertencem ao set
  // "30C" no limitlesstcg, têm catálogo próprio "MEE" (Mega Evolution
  // Energy — set perene reaproveitado em vários produtos, #9-16 são a
  // versão ilustrada por YOSHIROTTEN usada no 30th Celebration). Mesmo CDN,
  // pasta/set diferente, número com 3 dígitos (ex "MEE 009" -> "009").
  if(/^MEE/.test(n)){
    const num=n.replace(/\D/g,'').padStart(3,'0');
    return`https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEE/MEE_${num}_R_${l}_LG.png`;
  }
  let code;
  if(CEL30_CC_IMG[n]) code=CEL30_CC_IMG[n];
  else if(n==='R/RGB') code='R';
  else if(n==='G/RGB') code='G';
  else if(n==='B/RGB') code='B';
  else code=String(parseInt(n)).padStart(3,'0');
  return`https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/30C/30C_${code}_R_${l}_LG.png`;
}
