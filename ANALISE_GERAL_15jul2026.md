# Conferência Geral — MyDeck Pokémon TCG (15/jul/2026)

Revisão de `app.js`, os 20 arquivos `cards_*.js`, `fichario_patch.js`, `ev_calculator.js`, `index.html` e `style.css`. Todos os achados abaixo foram **verificados no arquivo real do repositório** (não no cache do sandbox, que estava desatualizado e me deu um falso positivo de arquivo corrompido — ignorem se algo parecido aparecer de novo).

## 1. Erros confirmados

### 1.1 SV1/SV2/SV4/SV8 — dados truncados em 250 cartas (perdendo as mais caras)
`cards_sv1.js`, `cards_sv2.js`, `cards_sv4.js`, `cards_sv8.js` param exatamente em `n:'250'`, mas o `SET_CATALOG` (app.js:692-702) já sabe que os totais reais são maiores:

| Set | No arquivo | Real (`SET_CATALOG`) | Faltam |
|---|---|---|---|
| SV1 | 250 | 258 | 8 |
| SV2 | 250 | 279 | 29 |
| SV4 | 250 | 266 | 16 |
| SV8 | 250 | 252 | 2 |

Causa: `generate_set.js` usa `pageSize=250` sem paginar. Consequência prática: as cartas 251+ (secretas/hiper raras — as mais valiosas do set) não existem no app, não aparecem no fichário e não entram no cálculo de valor da coleção. Esse bug já estava anotado na análise de 3/jul e continua sem correção — vale priorizar, principalmente o SV2 (29 cartas faltando).

### 1.2 `SET_CATALOG` desatualizado para ME03
Linha 685: `cards:120`. O arquivo `cards_me03.js` vai até `n:'124'` (Mega Zygarde ex Gold, R$619,85 — a carta mais cara do set). O contador mostrado no app fica errado e, dependendo de onde `cards` é usado para montar os slots do fichário, essas 4 últimas cartas de altíssimo valor podem ficar de fora da visualização.

### 1.3 Crash silencioso se o CDN do Supabase falhar
`app.js:56` — `sbClient.auth.onAuthStateChange(...)` roda direto no topo do arquivo, sem checar se `sbClient` é `null`. Se o script da Supabase não carregar (CDN fora do ar, bloqueio de rede, adblock agressivo), essa linha lança `TypeError` e trava a execução de todo o `app.js` — sem nenhuma mensagem de erro pro usuário, a tela fica em branco. Fix simples: `if(sbClient){ ... }` em volta do bloco, com um aviso visível se for `null`.

### 1.4 `renderBinder` duplicado — metade do código é morto
`app.js:1134` e `fichario_patch.js:223` declaram a mesma função `function renderBinder()`. Como `fichario_patch.js` carrega depois no `index.html`, a versão dele sobrescreve a do `app.js` — ou seja, a implementação em `app.js:1134` **nunca roda**. Isso é risco de manutenção: qualquer ajuste feito na versão errada não tem efeito nenhum, e é fácil perder tempo mexendo no lugar errado (já aconteceu na análise anterior).

### 1.5 Data de lançamento do ME05 inconsistente
- `app.js:647` (o que aparece pro usuário, badge "EM BREVE"): `releaseDate:'17/jul/2026'` — ou seja, daqui a **2 dias**.
- `app.js:1076` e `ev_calculator.js:98` (comentários internos): "lança ago/2026".

Se a data real for 17/jul, os preços do `ev_calculator.js` para ME05 ainda estão marcados como "estimado, ajustar no lançamento" — vale confirmar qual data está certa e, se for mesmo essa semana, atualizar os preços reais antes do lançamento.

### 1.6 Arquivo órfão vazio
`index_fixed.html` — 0 bytes, sobrou de alguma sessão anterior. Lixo, dá pra apagar.

## 2. O que já está bom (verificado, sem ação)

- Sintaxe válida em todos os `.js` do repo.
- Nomenclatura do ME05 ("Escuridão Absoluta") está consistente em `app.js`, `ev_calculator.js` e `simulador.html` — a inconsistência antiga com "Pitch Black"/"Negrura Absoluta" já foi corrigida.
- `style.css` tem 10 media queries agora — a responsividade mobile evoluiu bastante desde a época de "1 media query só".
- Nenhuma chave secreta exposta — a `SUPABASE_KEY` no `app.js` é a publishable key (equivalente à anon key), protegida por RLS; não é um segredo.
- Sem `console.log`/`debugger` esquecidos, sem `TODO`/`FIXME` pendentes em `app.js`.
- Sem funções duplicadas dentro do próprio `app.js` (só o caso cross-file do item 1.4).

## 3. Opiniões de melhoria

1. **Contagem dinâmica em vez de número fixo.** Trocar `cards:120` (e todos os outros hardcoded) por `cards:CARDS_ME03.length` no `SET_CATALOG` elimina de vez essa classe de bug — hoje ela já se repetiu duas vezes (ME03 continua errado desde 3/jul; SV1/2/4/8 é o mesmo problema de raiz). Only `mep` já faz isso certo (`CARDS_MEP.length` como fallback dinâmico) — vale replicar o padrão pros outros sets.
2. **Unificar os dois `renderBinder`.** Escolher uma implementação (a do `fichario_patch.js` já é a que roda de verdade) e apagar a outra, ou pelo menos comentar deixando claro que `app.js:1134` está morta.
3. **Paginar `generate_set.js`** para sets com mais de 250 cartas — resolve SV1/SV2/SV4/SV8 de uma vez e evita que o próximo set grande caia na mesma armadilha.
4. **Guard no `sbClient` nulo** com uma mensagem visível na tela ("Não foi possível conectar — recarregue a página"), em vez de tela branca silenciosa.
5. **`.gitattributes` com `* text=auto eol=lf`** — vários `cards_*.js` acumulam diffs enormes (arquivo inteiro marcado como alterado) só por causa de quebra de linha CRLF/LF trocada entre edições, o que polui o histórico do git e dificulta revisar o que realmente mudou.

## 4. Nota sobre o ambiente

Na primeira passada, a cópia do repositório que o sandbox usa via `bash` estava desatualizada/dessincronizada da sua máquina real — cheguei a ver um `app.js` aparentemente truncado (função `generateShareLink` cortada no meio, `copyShareUrl` sumida) e um lock de git preso. Confirmei depois, lendo o arquivo real diretamente, que isso **não existe** no seu repositório de verdade — foi um artefato do cache do sandbox. Mantive só os achados que confirmei no arquivo real (itens 1.1 a 1.6 acima).
