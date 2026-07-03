# MyDeck — Auditoria Completa · 03/jul/2026
Foco: coleção MEP (Parceiros Iniciais) + varredura geral do codebase.

---

## 1. MEP — Parceiros Iniciais (o que está errado)

A boa notícia primeiro: **a lista de cartas está correta**. Conferi contra Bulbapedia, Cardmarket e PokeBeach:
- Série 1 (MEP037–045 = Kanto/Sinnoh/Alola) ✅ confere
- Série 2 (MEP046–054 = Johto/Unova/Galar, lançada 19/jun) ✅ confere

Os erros estão em volta dos dados:

### 1.1 ⚠️ CRÍTICO — URL de imagem provavelmente inventada (`app.js:69-74`)
```js
return `https://pkmncards.com/wp-content/uploads/mebsp_en_${pad}_std.jpg`;
```
O padrão `mebsp_en_XXX_std.jpg` **não tem nenhuma referência na web** (busquei — zero resultados). O commit `b8fe041` trocou a versão anterior (scrydex para 037–039 + Liga Pokémon CDN para o resto) por esse padrão único não verificado. Se as imagens do fichário MEP aparecem quebradas/placeholder, a causa é essa.

**Como testar (30 segundos):** abra no navegador:
1. `https://pkmncards.com/wp-content/uploads/mebsp_en_038_std.jpg`
2. `https://images.scrydex.com/pokemon/mep-38/large`
3. `https://images.ligapokemon.com.br/cards/MEPBR/MEP038.png`
4. `https://assets.tcgdex.net/en/me/mep/38/high.png` (tcgdex tem o set `mep` — já é usado para preços)

**Correção recomendada:** em vez de uma fonte única, cadeia de fallback via `onerror` (tenta scrydex → tcgdex → liga). Elimina esse tipo de quebra para sempre.

### 1.2 ⚠️ Snover duplicado e no set errado (`cards_mep.js:38`)
```js
{n:'140',name:'Snover',...,series:'MEG Secretas'}
```
- Snover 140/188 é carta do **MEG** — e já existe em `cards_meg.js:157` (`Snover (IR)`, R$1,81).
- Duplicado = conta 2× no total de slots do master set e no valor da coleção.
- Preços divergem: R$8,00 no MEP × R$1,81 no MEG.
- `imgMep(140)` nunca vai achar imagem (não existe promo MEP140 — o set oficial só vai até ~081).
- **Fix:** remover a linha do `cards_mep.js`. Se coletado, o slot certo é `meg:140:SP`.

### 1.3 Contagem errada: "45 cartas" (`app.js:616`)
`SET_CATALOG` diz `cards:45` — mas a coleção tem **18 promos** (19 com o Snover). O "45" aparece na aba do fichário e no seletor "Minhas Coleções". Deveria ser 18 (ou atualizar conforme séries novas entram).

### 1.4 Série 3 faltando (lança 07/ago/2026)
Confirmado por PokeBeach/PokeGuardian: Série 3 = **Hoenn, Kalos e Paldea**, MEP055–063 (Fennekin já confirmada como MEP059 na Bulbapedia). Numeração quase certa pelo padrão grama/fogo/água:
```
055 Treecko · 056 Torchic · 057 Mudkip      (Hoenn)
058 Chespin · 059 Fennekin ✓ · 060 Froakie  (Kalos)
061 Sprigatito · 062 Fuecoco · 063 Quaxly   (Paldea)
```
A seção "Série 3 — em breve" já existe em `getSetData()`, mas sem cartas nunca renderiza. Vale adicionar com flag `upcoming`.

### 1.5 As seções "Série 1/2/3" nunca aparecem (ver item 2.1)

---

## 2. Erros gerais (fora do MEP)

### 2.1 ⚠️ ARQUITETURAL — `renderBinder()` duplicado: o do app.js é código morto
`app.js` e `fichario_patch.js` declaram `function renderBinder()`. Como `fichario_patch.js` carrega **depois** (index.html:731), a versão dele sobrescreve a do app.js. Consequências:
- As **seções customizadas** do `getSetData()` (Série 1/2/3 do MEP, "Base 001–086" etc.) são ignoradas — o patch só divide em "Cartas Base" / "Cartas Secretas".
- A navegação de busca com setas (`binderNavGo`, app.js:927+) é código morto.
- Os **preços ao vivo** (`_lp`/`lprice`) que o app.js renderizava nos slots não aparecem — o patch só mostra `c.price` estático no tooltip. `fetchLivePrices()` roda, gasta API, e o resultado quase não é exibido.
- **Fix:** deletar um dos dois e fundir o que falta no sobrevivente (recomendo manter o do patch, portando seções custom + preços live).

### 2.2 ⚠️ DADOS — Sets SV truncados em 250 cartas (`generate_set.js:92`)
`pageSize=250` sem paginação. Sets com mais de 250 cartas perderam o final (justamente as secretas mais valiosas):

| Set | No arquivo | Real | Faltam |
|-----|-----------|------|--------|
| SV1 | 250 | 258 | 8 |
| SV2 | 250 | 279 | **29** |
| SV4 | 250 | 266 | 16 |
| SV8 | 250 | 252 | 2 |

**Fix:** paginar no `generate_set.js` (`page=2` quando `count===250`) e regerar esses 4 sets.

### 2.3 ME03 — catálogo diz 120, o set tem 124
`cards_me03.js` vai até a 124 (Mega Zygarde ex Gold). Errados: `SET_CATALOG` (`cards:120`, app.js:613) e o label "✨ Secretas — 071 a 120" (app.js:1003). A aba mostra "120" mas renderiza 124.

### 2.4 ME05 com nome inconsistente
`SET_META` (app.js:575): "ME05 — Pitch Black". Todo o resto do site: "Negrura Absoluta". O dashboard mostra o nome em inglês.

### 2.5 Chases estáticos defasados no `SET_META`
`chaseFor(id)` já calcula dinâmico e tem prioridade no dash, mas os fallbacks estão velhos (ex.: mep `'Charmander MEP038 — R$36'` vs preço real no arquivo R$190). Baixo impacto, mas vale limpar ou remover o campo.

### 2.6 Crash silencioso se o CDN do Supabase falhar (`app.js:46`)
`sbClient.auth.onAuthStateChange(...)` roda no top-level; se `sbClient===null` (CDN bloqueado), lança TypeError e **o app.js inteiro morre** sem mensagem pro usuário. Fix: `if(sbClient){...}` em volta, com aviso na tela.

### 2.7 `saveBinderModal` gera numerador errado para sets não-ME (`app.js:1249`)
```js
num:`${card.n}/${String(setId==='me04'?86:setId==='me02'?94:setId==='meg'?132:card.n)...}`
```
Para me03/mep/sv* o denominador vira o próprio número da carta ("022/022"). Cosmético, mas polui `pulled_cards`.

### 2.8 Shopping — "Coleções Disponíveis" hardcoded
Só ME04/ME03/ME02/ME05. Sem MEG e sem MEP (que é justamente produto que a iWorld vende — a compra de 23/jun foi uma Coleção Parceiros Iniciais). Fácil gerar do `SET_CATALOG`.

---

## 3. Melhorias sugeridas (priorizada)

1. **Fallback de imagem em cadeia** (resolve MEP e previne quebras futuras em todos os sets).
2. **Unificar renderBinder** — devolve seções por série no MEP e os preços live no fichário.
3. **Regerar SV1/SV2/SV4/SV8 com paginação** — hoje o "master set" desses sets é impossível de completar no app.
4. **EV Calculator: produto "Coleção Parceiros Iniciais"** (R$109,90 · 3 boosters + 3–4 promos IR) — o EV dos promos muda muito a conta vs blister comum. Também falta ME05 já ter EV via template quando lançar.
5. **Série 3 MEP com `upcoming:true`** — pronta para virar ativa em 07/ago.
6. **Snover:** remover do MEP; conferir se algum slot `mep:140:SP` existe no Supabase e migrar para `meg:140:SP`.
7. Contagens dinâmicas no `SET_CATALOG` (`cards: CARDS_X.length` em vez de número fixo) — elimina os bugs 1.3 e 2.3 de vez.
8. Guard no `sbClient` nulo com mensagem de erro visível.

## 4. O que já está bom (conferido, sem ação)
- Sintaxe OK em todos os 30+ arquivos JS (`node --check`).
- `cards_me03.js` sem declaração duplicada (armadilha antiga resolvida).
- `.ad-side` oculto <1400px + 6 media queries (pendência antiga resolvida).
- Home dinâmica (`renderHomeSets`), busca global, hsub dinâmico, PWA (manifest + sw.js com estratégia correta: network-first para código, cache-first para imagens).
- Sem duplicatas de número dentro de nenhum arquivo de cartas (exceto o Snover cross-set).
- Preços MEP Série 1/2 coerentes com mercado (S1 Kanto premium, S2 recém-lançada volátil — ok).

---
**Fontes:** [Bulbapedia — MEP Black Star Promos](https://bulbapedia.bulbagarden.net/wiki/MEP_Black_Star_Promos_(TCG)) · [Bulbapedia — Fennekin MEP 59](https://bulbapedia.bulbagarden.net/wiki/Fennekin_(MEP_Promo_59)) · [Cardmarket — Chikorita MEP046](https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Chikorita-MEP046) · [PokeBeach — Série 2](https://www.pokebeach.com/2026/04/first-partner-illustration-collection-series-2-revealed-for-june-featuring-johto-unova-and-galar) · [PokeGuardian — Série 3](https://www.pokeguardian.com/3182523_first-partner-illustration-collection-series-3-revealed)
