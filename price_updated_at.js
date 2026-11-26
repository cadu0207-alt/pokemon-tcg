// ============================================================
//  PRICE_UPDATED_AT — data da última atualização de preços por set,
//  exibida tanto na aba Preço Justo (ev_calculator.js) quanto no
//  Fichário (app.js), pra deixar claro pro usuário quão fresco é o
//  preço que ele está vendo.
//
//  Mantido por scripts/update_prices.py: toda vez que o robô
//  atualiza com sucesso os preços de um set (usando o menor preço
//  da Liga Pokémon), ele reescreve a entrada correspondente aqui
//  com a data do próprio dia. Sets sem URL configurada em
//  liga_sets.json (ex.: me06) nunca são tocados — ficam com a
//  última data conhecida.
//
//  Datas abaixo são a semente inicial (jul/2026), obtidas do
//  histórico do git / comentários de cabeçalho de cada cards_*.js
//  na ausência de um registro próprio anterior:
//    - me04/me03/me02/meg: commit "chore: atualiza preços [2026-06-28]
//      | fonte: tcgwatchtower.com" — é o último commit que de fato
//      confirma uma atualização em massa de preços nesses 4 arquivos.
//    - me05: ainda não passou pelo pull da Liga (cards_me05.js tem
//      preços de deckcerto.com em USD, parte estimados por raridade —
//      ver nota no topo do arquivo). Marcado como null de propósito.
// ============================================================
var PRICE_UPDATED_AT = {
  me04: '2026-11-26',
  me03: '2026-11-26',
  me02: '2026-11-26',
  meg:  '2026-11-26',
  me05: '2026-11-26',
  me2pt5: '2026-11-26',
  me06: '2026-11-26',
  cel30: '2026-11-26',
  mep: '2026-11-26',
  sv1: '2026-11-26',
  sv2: '2026-11-26',
  sv3: '2026-11-26',
  sv3pt5: '2026-11-26',
  sv4: '2026-11-26',
  sv4pt5: '2026-11-26',
  sv5: '2026-11-26',
  sv6: '2026-11-26',
  sv6pt5: '2026-11-26',
  sv7: '2026-11-26',
  sv8: '2026-11-26',
  sv8pt5: '2026-11-26',
  sv9: '2026-11-26',
  sv10: '2026-11-26',
  pgo: '2026-11-26'
};

// Formata pra exibição em pt-BR, ou uma mensagem clara quando não há data
// registrada ainda (em vez de simplesmente omitir/mostrar "Invalid Date").
function formatPriceUpdatedAt(setId) {
  var iso = PRICE_UPDATED_AT[setId];
  if (!iso) return 'sem registro de atualização ainda';
  var d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return 'sem registro de atualização ainda';
  return d.toLocaleDateString('pt-BR');
}
