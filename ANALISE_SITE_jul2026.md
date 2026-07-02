# MyDeck — Análise Técnica e Plano de Atualização · 01/jul/2026

## 1. Diagnóstico: por que a home está desatualizada

A causa raiz é estrutural, não um bug: **a página inicial é HTML hardcoded** (`index.html` linhas 76–170), enquanto o resto do app lê dos arquivos `cards_*.js`. Toda atualização de preço/set exige editar o HTML na mão — e isso parou de ser feito.

### O que a home mostra hoje vs. dados reais do banco

| Set | Home (hardcoded) | Dados reais (cards_*.js) |
|-----|------------------|--------------------------|
| ME04 | #1 Greninja Gold n122 R$1.453 | #1 é Greninja **SAR n116 R$280** (ranking e preços mudaram) |
| ME03 | #1 Clefairy n94 R$23,50 | #1 é **Meowth ex n121 R$171** — os 3 cards da home nem estão no top 3 |
| ME02 | Charizard SAR R$1.809 | R$878 (−51%) |
| MEG | #1 Lucario Gold n187 R$120 | #1 é **Greninja Gold n188 R$284** — não aparece na home |

### Sets ausentes da home
- **MEP** (Parceiros Iniciais) — carregado, com fichário funcionando, invisível na home
- **ME06** — tem arquivo e aba, não tem card na home
- **Todos os 15 sets SV** (sv1–sv10, incluindo Coleção 151, Evoluções Prismáticas etc.) — o banco cresceu de 7 para 22 sets e a home continua mostrando 5

### Outras referências defasadas
- `<div class="hsub">` do header: "ME06 · ME05 · ME04 · ME03 · ME02 · MEG · MEP" — sem SV
- `SET_META` (app.js ~572): chases com preços velhos ("Greninja Gold R$1.482" → real R$248; "Charizard SAR R$1.809" → real R$878)
- **ME05 inconsistente:** `SET_CATALOG` diz `upcoming:true`, `getSetData()` diz `upcoming:false`. Lançamento é ago/2026 — o correto é `upcoming:true` nos dois
- Calculadora EV: só ME02/ME03/ME04/MEG — sem ME05 (lança em semanas), MEP e SV
- Simulador: só sets ME

## 2. Causa arquitetural: 5 registros paralelos por set

Cada set novo precisa ser cadastrado manualmente em **cinco lugares**:
1. `SET_CATALOG` (app.js 605)
2. `SET_META` (app.js 572 — só ME)
3. `getSetData()` map (app.js 968)
4. `SET_CARDS_MAP` (app.js 581)
5. `TCGDX` (live prices)
...mais o `<script src>` no index.html e o card hardcoded da home.

**Recomendação central:** unificar tudo num único `SETS` registry (id, label, emoji, cor, série, imgFn, tcgdexId, upcoming, releaseDate, chase calculado) e derivar o resto dele. A home passa a ser `renderHomeSets()` que:
- lê `SET_CATALOG` (sets em destaque, ex. ME + últimos 2 SV)
- calcula top 3 por `price` direto de `SET_CARDS_MAP[id]()`
- gera os cards rotativos dinamicamente

Resultado: home **nunca mais** desatualiza — qualquer update de `cards_*.js` reflete automático.

## 3. Performance

| Problema | Impacto | Correção |
|----------|---------|----------|
| 23 `<script>` síncronos (~500KB de dados de cards) bloqueando render | First paint lento | `defer` em todos; ideal: carregar `cards_sv*.js` sob demanda (só quando o usuário abre o set) |
| Mosaico do app: 8 fileiras × ~100 cards × 3 cópias ≈ **2.400 `<img>`** | Centenas de requests, memória, scroll pesado | Reduzir pool para ~20 cards/fileira; `loading="lazy"` já existe mas triplicar é desnecessário — usar CSS para o loop |
| Mosaico do auth: +80 imgs | idem | Reduzir para 30–40 |
| `mousemove` global recalculando `getBoundingClientRect()` de 8 fileiras a cada pixel | Jank em máquinas fracas | Throttle (requestAnimationFrame) |
| Live prices (tcgdex) buscados card a card | OK com cache 24h, mas só atualiza fichário | Reaproveitar `_lp` na home e no dash |

## 4. Mobile (pendência crítica)

Só 3 media queries em 1.289 linhas de CSS:
- `.ad-side` sobrepõe conteúdo em telas <1400px (bug conhecido, ainda aberto)
- Abas do fichário com 22 sets não têm overflow tratado no mobile
- Home cards 3D (`data-tilt` via mouse) não fazem nada no touch

Correções mínimas: ocultar `.ad-side` <1400px; `overflow-x:auto` + scroll-snap nas abas; grid da home 1 coluna <600px.

## 5. Sugestões de layout e navegação

1. **Home agrupada por série** — duas fileiras: "Mega Evolução (atual)" e "Escarlate & Violeta", com scroll horizontal. Destaque grande para o set mais recente + ME05 "em breve" com countdown para ago/2026.
2. **Busca global no header** — hoje a busca (`bsrch`) só filtra o set aberto. Com 22 sets, uma busca por nome em todos os sets (usando `SET_CARDS_MAP`) vira a feature mais útil do site. Atalho `/` para focar.
3. **Aba "Sets" dedicada** — em vez de 22 abas espremidas no fichário: uma grade de sets (capa, % completo, valor da coleção) que leva ao fichário. As abas atuais ficam como atalho dos favoritos (`myCollections`).
4. **Dash: valor da coleção ao longo do tempo** — você já tem `purchases` com data e `_lp` com preços live; um gráfico ROI temporal fecha o ciclo (item 6 do backlog).
5. **Header dinâmico** — `hsub` gerado de `myCollections`, não hardcoded.
6. **EV Calculator** — gerar produtos por template (display/ETB/blister são iguais para todo set), só variando `varejo` — elimina o cadastro manual por set e libera ME05/SV.
7. **PWA** (manifest + service worker) — o site é ideal para uso no celular na loja/evento.

## 6. Rotina de atualização periódica (recomendada)

Já existe `scripts/update_prices.py` (Playwright + TCGWatchtower, GitHub Actions semanal). Plano para o site "se manter sozinho":

| Frequência | Ação | Como |
|------------|------|------|
| Semanal (já existe) | Preços ME via update_prices.py | Verificar se o Action está rodando e se cobre ME03/MEG (config atual parece só 124 cards de um set) |
| Semanal | Preços SV | Já vem "de graça" via tcgdex live prices no cliente — basta reaproveitar na home/dash |
| Após update de preços | Home/dash/chases | Automático, se a home virar render dinâmico (seção 2) — **este é o pré-requisito** |
| Mensal | Revisão de sets novos (ME05 ago, ME06 out) | Sessão comigo: gerar cards_*.js, flip de `upcoming`, produtos EV |
| Pendente (1x) | Rodar `custom_binders_setup.sql` no Supabase | app.supabase.com → SQL Editor |

## 7. Prioridade de execução

1. **renderHomeSets() dinâmico** — resolve a reclamação principal e previne recorrência
2. Registry unificado de sets (elimina os 5 cadastros paralelos)
3. Fix ME05 `upcoming` + header hsub + chases do SET_META (rápidos)
4. `.ad-side` mobile + overflow das abas
5. `defer`/lazy-load dos scripts + mosaico enxuto
6. Busca global
7. EV por template (habilita ME05/SV)
8. Gráfico temporal no dash · PWA · link público
