# Análise profissional — aba Fichário (23/07/2026)

Pedido pelo Eduardo: análise completa da aba Fichário pensando como um site
profissional de verdade — layout desktop, layout mobile, sistemas que
poderiam estar integrados e não estão, tipografia/cores/estilo. Este
documento é só análise; nada foi implementado ainda, é insumo pra decidir
prioridades. Baseado em leitura completa de `index.html` (estrutura da aba),
`style.css` (variáveis de tema + regras existentes), `app.js`/
`fichario_patch.js`/`fichario_melhorias_23jul.js` (toda a lógica), e nos três
documentos de análise anteriores (`ANALISE_GERAL_15jul2026.md`,
`ANALISE_FICHARIO_22jul2026.md`) pra não repetir o que já foi corrigido.

## 1. Layout Desktop

### O que já funciona bem
- Hierarquia clara: stats globais → abas de coleção → toolbar → progresso do
  set → grade de cartas. Segue um padrão de "dashboard" reconhecível.
- Abas roláveis horizontalmente (`#binder-tabs`) escalam bem com 21+ coleções
  sem quebrar layout.
- Hover states consistentes (cartas ampliam, tooltip aparece, botões mudam de
  cor) — dá sensação de app "vivo", não estático.

### Problemas reais
1. **Toolbar (`.bctl`) virou uma sopa de controles sem agrupamento visual.**
   Hoje ela tem, na ordem: busca, 3 checkboxes, botão copiar lista,
   seletor Grade/Fichário, controles de tamanho (2×2/3×3/4×4 + imprimir),
   botão compartilhar, texto de dica, e agora (23/07) mais um `<select>` de
   raridade + botão "Marcar raridade". São **9 grupos de controle diferentes
   numa única linha `flex-wrap`**, sem nenhum separador visual além de duas
   barras verticais soltas. Em telas de notebook (1366px, ainda muito comum),
   isso já quebra em 2-3 linhas de forma desorganizada — os controles somem e
   reaparecem em posições diferentes a cada toggle de checkbox. Um site
   profissional agruparia isso em **duas barras**: uma de "busca e filtro"
   (fixa, sempre visível) e uma de "ações" (copiar, imprimir, compartilhar,
   modo de visualização) como um grupo de botões com ícone, talvez num menu
   "⋯ Mais ações" nos grupos menos usados.
2. **Todo o CSS da toolbar é inline no HTML/JS, não em classes.** Cada botão
   repete o mesmo bloco de 5-6 propriedades (`padding`, `border-radius`,
   `border`, `background`, `font-family`, `font-size`, `cursor`) em vez de uma
   classe `.fic-btn` reutilizável. Isso não é só estética — é dívida técnica
   real: mudar o estilo de botão do fichário hoje exige editar N lugares
   diferentes em `index.html` + `app.js` + `fichario_patch.js` +
   `fichario_melhorias_23jul.js`, ao invés de 1 regra CSS. Ver seção 3.
3. **Densidade de informação da carta no modo Grade é baixa pro espaço que
   ocupa.** Cada carta mostra: imagem, dots de versão, check de completo,
   estrela de importante, badge "quase completo" (novo). Falta o **preço**
   visível sem abrir modal — hoje só aparece no tooltip ao passar o mouse.
   Num site "de qualidade" orientado a colecionador/investidor (como o
   Eduardo se posiciona), o preço da carta é informação de primeira
   importância e devia estar sempre visível, não escondida atrás de hover.
4. **`#fic-set-info` virou uma barra de texto corrida.** Com a adição de
   23/07 (Base/Secretas), a linha já tem: nome do set, "N/M slots", "P%
   completo", barra de progresso geral, data de atualização de preço, "Base
   X/Y", "Secretas X/Y", e a dica "clique na carta". São 7 informações
   diferentes competindo por espaço numa única faixa `flex-wrap` de fundo
   cinza claro. Fica com cara de "log de debug", não de painel de resumo.
   Merece virar um **cabeçalho estruturado** (nome do set grande + badge de
   progresso circular ou barra dupla, com o resto como metadados secundários
   menores abaixo).
5. **Nenhuma indicação de qual coleção tem "chase cards" valiosas faltando.**
   `app.js` já tem `chaseFor(id)` (usado no Dashboard) mas isso não aparece em
   lugar nenhum dentro do próprio Fichário — quem está dentro da coleção
   filtrando cartas não vê "sua carta mais valiosa que falta é X, R$Y" sem
   voltar pro Dashboard.
6. **Botões de ação da toolbar não têm ícone+texto consistente.** Alguns usam
   emoji+texto ("📋 Copiar lista", "🖨️ Imprimir PDF"), outros só ícone+texto
   curto ("⊞ Grade"), o botão de marcar raridade novo usa "✅". Não há um
   padrão de tamanho de emoji/peso visual entre eles — funcional, mas não
   com o polimento de um design system real.

### Sugestões concretas (desktop)
- Separar a toolbar em **"Barra de busca e filtros"** (sempre visível, fixa
  no topo da aba) e **"Barra de ações"** (agrupada por contexto: exportar/
  compartilhar num grupo, modo de visualização + tamanho noutro).
- Preço visível direto no card da carta (rodapé pequeno, sem precisar
  hover) — pelo menos quando a carta não está coletada (funciona como
  "quanto falta pra eu ter isso").
- Reestruturar `#fic-set-info` em duas linhas: título do set + badge de %
  grande numa linha; metadados pequenos (data de preço, base/secretas) numa
  segunda linha discreta.
- Considerar um badge de "chase card" (⭐ com preço) fixo no cabeçalho do set,
  linkando a `chaseFor()`.

## 2. Layout Mobile

### O que já foi corrigido (22/07/2026)
Já existe um bloco `@media (max-width:600px)` sólido: abas com padding maior,
botões com `min-height` de 32-40px (dentro da recomendação de alvo de toque de
Apple/Google, ~40-44px), busca ocupando 100% da largura, checkboxes maiores
(18×18px). Isso resolveu o problema mais grave (toque impreciso).

### Problemas que ainda ficam

1. **9 grupos de controle da toolbar viram uma pilha vertical enorme no
   celular.** O `flex-wrap` empilha tudo, então antes de ver qualquer carta
   o usuário rola por: busca (linha inteira) → 3 checkboxes → separador →
   botão copiar lista → separador → 2 botões de modo → (se fichário) 4
   botões de tamanho → botão compartilhar → texto de dica → agora + o select
   de raridade. Em iPhone SE (375px de largura) isso é facilmente **300-400px
   de altura só de controles antes do conteúdo**, empurrando a primeira
   carta pra fora da tela sem rolar. Um app mobile profissional colapsaria
   filtros secundários atrás de um botão "🔍 Filtros" (só busca visível por
   padrão) e ações atrás de um menu "⋯".
2. **Modo Grade no celular ainda usa o mesmo `--cw:72px` fixo** — em telas de
   360-390px de largura (a maioria dos Android hoje), isso dá só 4-5 cartas
   por linha com scroll vertical longo. Não há adaptação de colunas por
   largura real de tela (`clamp()`/`auto-fill` com `minmax` já existe via
   `.bgrid`, mas o valor fixo de `--cw` no media query limita o ganho). Vale
   testar 2 densidades: "compacta" (mais cartas, menor) vs. "confortável"
   (padrão atual), com toggle salvo em preferência.
3. **Modo Fichário físico (páginas N×N) não tem ajuste mobile específico
   documentado** — só o Grade foi ajustado em 22/07. Layouts de página fixa
   (2×2/3×3/4×4) tendem a ficar apertados ou cortados em telas pequenas; não
   há confirmação de que os `fic-binder-N` funcionam bem abaixo de 400px.
4. **O botão "Marcar raridade" novo (23/07) não foi testado especificamente
   em mobile** — o `<select>` de raridade ao lado do botão, dentro de um
   `.bctl` já lotado, tende a ficar espremido ou quebrar em telas muito
   estreitas (<360px). Vale revisão visual dedicada.
5. **Cards de "Meus Fichários"** (grid `auto-fill minmax(148px,1fr)`) ficam
   OK em 2 colunas no celular, mas o cluster de 4 ícones (📌 pin, ✏️ editar,
   ⧉ duplicar novo, 🔗 compartilhar, ✕ excluir) no canto superior direito
   fica com alvo de toque bem menor que 40px cada — 5 ícones espremidos em
   ~80px de largura é o oposto do padrão de toque recomendado. Esse é
   provavelmente o ponto de maior atrito mobile no Fichário hoje.
6. **Texto de dica "Clique na carta para editar slots"** não faz sentido
   literal no celular (é toque, não clique) — já identificado na análise de
   22/07 como pendente, ainda não resolvido.

### Sugestões concretas (mobile)
- Colapsar filtros secundários (checkboxes) atrás de um ícone de filtro que
  expande, deixando só a busca sempre visível.
- Menu de ações "⋯" pra copiar lista/imprimir/compartilhar em vez de botões
  soltos.
- Revisar o cluster de 5 ícones em "Meus Fichários" — talvez esconder atrás
  de um único botão "⋯" que abre um menu, ou aumentar a área de toque de
  cada um individualmente.
- Trocar o texto "Clique na carta" por "Toque na carta" quando `matchMedia`
  detectar `(pointer: coarse)`.
- Testar e documentar o modo Fichário físico especificamente em 375-414px.

## 3. Tipografia, cores e estilo

### Pontos fortes (herdados do resto do site)
- Paleta consistente via CSS custom properties (`--accent`, `--teal`,
  `--gold`, `--muted` etc.) — qualquer ajuste de cor central propaga.
- 3 fontes bem escolhidas e usadas com propósito: **Bebas Neue** (títulos de
  impacto), **Space Mono** (dados/badges — reforça a sensação "técnica" de
  colecionador/planilha), **DM Sans** (corpo). Essa combinação já é de nível
  profissional — a maioria dos apps hobby usa 1 fonte só.

### Problemas reais
1. **Fonte de 8-9px em elementos interativos.** `.ctab` (abas de coleção) usa
   `font-size:9px`, `.ctab-n` (contagem de cartas) usa `8px`. Isso é **abaixo
   do mínimo geralmente recomendado (~11-12px) pra texto de interface** em
   qualquer guia de acessibilidade/legibilidade (WCAG não define um número
   fixo, mas 9px é considerado ilegível pra boa parte dos usuários,
   especialmente 40+ anos, sem zoom). Em telas de alta densidade (retina)
   fica pior ainda. Isso se repete no fichário inteiro: dezenas de
   `font-size:10px`/`9px` inline em botões, labels e texto informativo.
   **Isso é provavelmente o item de maior impacto em "parecer profissional"
   ou não** — sites de investimento/coleção de alto padrão (ex: apps de
   portfólio de ações, PSA/CardLadder) usam 12-13px como piso pra texto
   funcional, reservando <10px só pra metadados realmente secundários
   (timestamp, ID técnico).
2. **Contraste de texto `--muted` (#6b7288) em `--surface2` (#f0f1f6)** dá
   uma razão de contraste baixa (~3.2:1) — abaixo do mínimo AA (4.5:1) do
   WCAG pra texto normal. Some com o problema #1 (fonte pequena) e o texto
   informativo do Fichário (datas, contagens, dicas) fica difícil de ler pra
   quem não tem visão perfeita, mesmo em tela grande.
3. **Inconsistência de unidade de border-radius.** Botões usam `4px`, `5px`,
   `6px`, `7px`, `8px`, `10px` misturados sem padrão aparente dentro da mesma
   tela (ex: botão "Marcar raridade" novo usa 6px, botão "Copiar lista" usa
   5px, cards de "Meus Fichários" usam 10px). Pequeno, mas é o tipo de
   detalhe que separa "parece feito por um dev só" de "parece produto com
   design system".
4. **Cor por coleção não é sistemática.** Cada set tem uma cor própria
   (`SET_META[x].color`, `SET_CATALOG[x].color`) escolhida à mão, sem uma
   lógica visível de paleta (ex: por era/série) — dentro da mesma série ME
   as cores pulam de verde (MEG) pra dourado (MEP) pra vermelho (ME06) sem
   gradiente ou parentesco visual. Não é errado, mas um site "premium"
   normalmente deriva cor de coleção de uma paleta calculada (matiz por
   ordem cronológica, por exemplo), não escolhida manualmente carta por
   carta — mais fácil de manter e sempre harmônico conforme cresce.
5. **Emojis como ícone principal em vez de um sistema de ícones.** Funciona
   (leve, sem dependência), mas emoji renderiza diferente por
   SO/navegador/fonte (Windows vs Mac vs Android têm desenhos de emoji
   visivelmente diferentes) — um app "profissional de verdade" tende a usar
   um icon set consistente (SVG inline ou biblioteca tipo Lucide/Feather)
   pra ter o mesmo visual em qualquer dispositivo. Trade-off real: emoji é
   zero-dependência e rápido de implementar; ícone SVG dá consistência visual
   mas exige mais setup. Não é urgente, mas é a diferença entre "site
   caseiro bem feito" e "produto".
6. **Uso de `!important` em cascata no bloco mobile.** Necessário hoje porque
   quase tudo é inline style, mas é sintoma direto do problema #2 da seção 1
   (falta de classes CSS reutilizáveis) — se os componentes usassem classes
   desde o início, o mobile não precisaria de um bloco de `!important` pra
   sobrepor.

### Sugestões concretas (tipografia/cores/estilo)
- Estabelecer um piso de **11px** pra qualquer texto clicável/interativo no
  Fichário (abas, botões, labels de checkbox) — os 8-9px atuais sobem pra
  11-12px.
- Revisar `--muted` pra uma variação um pouco mais escura só quando usada
  sobre `--surface2`/`--surface3` (ou criar `--muted-oncard` com contraste
  garantido), mantendo a atual pra fundos brancos onde já funciona.
- Padronizar border-radius em 2-3 valores fixos (ex: `--radius-sm:6px`,
  `--radius-md:10px`) e trocar os valores soltos por eles.
- Extrair os botões repetidos da toolbar pra 2-3 classes CSS (`.fic-btn`,
  `.fic-btn-primary`, `.fic-btn-danger`) — resolve o problema de manutenção
  E abre caminho pra remover boa parte do `!important` do mobile.

## 4. Sistemas que não estão integrados (e poderiam estar)

Esta é provavelmente a parte de maior valor da análise — o Fichário hoje
funciona como uma ilha dentro do MyDeck, quando várias peças que já existem
no site poderiam alimentar e ser alimentadas por ele.

1. **Sistema de XP/Níveis/Conquistas (`xp_system.js`) — zero feedback visual
   dentro do Fichário.** O XP é calculado 100% server-side (trigger Postgres
   na tabela `collection`) e mostrado só no Dashboard. Quando o Eduardo marca
   uma carta como coletada dentro do Fichário, **nada acontece na tela** — só
   se ele for pro Dashboard depois é que vê o XP ganho. Isso é uma
   oportunidade perdida de reforço positivo imediato: um toast "+15 XP" (ou
   "+50 XP — Set completo! 🎉") no momento exato em que a carta é marcada
   daria a mesma sensação de "recompensa instantânea" que jogos/apps de
   hábito usam pra reter engajamento. Tecnicamente simples: o evento de
   marcar carta já dispara `saveSlot()`; bastaria consultar o XP após o
   insert (delta calculável) e mostrar o toast — não precisa duplicar a
   lógica de cálculo, só ler o resultado.
2. **Lojas & Ofertas (`lojas.js`, catálogo Mercado Livre) não conversa com o
   que falta no Fichário.** Hoje as duas abas são independentes: "Lojas &
   Ofertas" mostra preços de produtos rastreados, "Fichário" mostra o que
   falta coletar — mas nada liga um ao outro. Um colecionador vendo "faltam
   12 cartas do MEG" não tem, dentro do próprio Fichário, um link "🛒 Ver
   ofertas de MEG" que leva direto pra aba Lojas filtrada nesse set. Essa
   ponte é praticamente gratuita de implementar (já existe
   `ml_search_terms.collection` como campo, visto em `lojas.js`) e fecha o
   loop "descobri o que falta → comprei" dentro do próprio site, em vez de o
   usuário ter que sair e comprar em outro lugar sem nem lembrar que o
   MyDeck rastreia oferta.
3. **Calculadora de Preço Justo/EV (`ev_calculator.js`) não é referenciada no
   Fichário.** Quando o usuário está decidindo se vale a pena comprar mais
   um booster/box pra completar o master set, ele precisa navegar pra outra
   aba, calcular o EV, memorizar/anotar, voltar pro Fichário. Um "quanto
   falta" calculado (ex: "faltam 8 cartas base, valor de mercado somado
   R$142 — comprar N boosters do set custa em média R$X, EV de achar essas
   cartas específicas é Y%") uniria as duas ferramentas numa decisão só.
4. **Patrimônio/Evolução (`renderPatrimonio`, snapshot diário) não mostra
   impacto do que falta.** A aba de patrimônio mostra valor histórico da
   coleção já possuída, mas não projeta "se eu completar os sets ativos,
   meu patrimônio sobe pra R$X" — informação que já é 100% calculável com os
   dados existentes (`getSlots` + `price` de cada carta faltante), só não
   está exposta. Encaixaria bem como um card extra dentro do próprio
   Fichário ou da aba Patrimônio.
5. **Busca global (`#gsearch`) não indica progresso de coleção no resultado.**
   Buscar uma carta pelo header mostra nome/set/preço, mas não indica se
   aquela carta específica já está coletada ou não — o usuário tem que abrir
   o Fichário do set pra descobrir. Um ✓ pequeno no resultado de busca (igual
   ao que já existe no Grid) resolveria isso com dado que já está em memória
   (`collected`), sem nova consulta.
6. **Compartilhamento (`openShareModal`) gera link público mas não gera
   nenhum artefato "social" reaproveitável.** O fichário compartilhado (link
   + QR code) existe, mas não há, por exemplo, uma imagem/card de resumo
   pronta pra postar em rede social ("Meu MEG está 73% completo! 🔥") — o
   mesmo padrão que já existe pra "vender carta" (`openVendaImageModal`, que
   gera imagem de combo pra WhatsApp) poderia ser reaproveitado aqui pra
   gerar uma imagem de "cartão de progresso" do fichário. Approach já
   validado tecnicamente em outra aba do mesmo site, só falta aplicar aqui.
7. **Notas de corretagem / skill `notas-corretagem` e planilha de
   investimentos são domínios financeiros separados do Eduardo, sem relação
   com o Fichário** — mencionado aqui só pra registrar que NÃO há
   sobreposição de dados esperada entre eles; não é uma integração pendente,
   é escopo corretamente separado.

### Priorização sugerida das integrações
| Integração | Esforço estimado | Valor pro usuário |
|---|---|---|
| Toast de XP ao marcar carta | Baixo (dado já existe, só falta ler e mostrar) | Alto — reforço imediato, "vicia" o uso |
| ✓ de coletado na busca global | Baixo (reusa `collected` já em memória) | Médio |
| Link "Ver ofertas" Fichário→Lojas | Baixo-médio (campo já existe em `ml_search_terms`) | Alto — fecha o loop de compra |
| Card "impacto de completar" na aba Patrimônio | Médio (cálculo novo, mas com dado existente) | Médio-alto |
| Imagem de "cartão de progresso" pra compartilhar | Médio (reaproveita padrão de `openVendaImageModal`) | Médio |
| Ponte com EV Calculator (quanto vale completar vs. custo de comprar) | Alto (cruza dois modelos de dado diferentes) | Alto, mas mais caro de fazer certo |

## 5. Resumo executivo

O Fichário funciona e já recebeu bastante polimento pontual (bugs reais
corrigidos, 8 melhorias de UX entregues em 23/07, responsividade mobile
básica resolvida). O que falta pra ele parecer um **produto profissional**
em vez de "uma ferramenta bem construída por um único dev" é, em ordem de
impacto:

1. **Tipografia**: tirar o texto de 8-9px de qualquer elemento interativo —
   isso sozinho muda a percepção de qualidade mais que qualquer outra coisa
   nesta lista.
2. **Consolidar a toolbar** em grupos claros (busca sempre visível, ações
   secundárias agrupadas/colapsadas) — hoje ela cresce a cada nova feature
   sem reorganização, e isso vai piorar conforme mais melhorias forem
   pedidas.
3. **Extrair estilos inline pra classes CSS** — não é só limpeza de código,
   é o que permite consistência real (radius, padding, cor de botão) sem
   precisar `!important` no mobile.
4. **Fechar os loops de integração de maior valor/menor esforço primeiro**:
   toast de XP e link Fichário→Lojas são baratos e mudam a experiência de
   forma perceptível.

Nenhum item aqui é urgente/quebrado — é tudo sobre elevar de "funciona bem" pra
"parece um produto pago de verdade". Fica à disposição pra priorizar e
implementar o que fizer mais sentido primeiro.
