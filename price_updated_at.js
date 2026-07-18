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
  me04: '2026-06-28',
  me03: '2026-06-28',
  me02: '2026-06-28',
  meg:  '2026-06-28',
  me05: null
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
