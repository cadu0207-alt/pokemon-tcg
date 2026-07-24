# Análise e sugestões — aba Fichário (22/07/2026)

Pedido pelo Eduardo: sugestões de melhoria de UX pra aba Fichário inteira e todas
as sub-abas (coleções normais, "Meus Fichários", modal de criar/editar fichário
personalizado), mais responsividade mobile e uma ideia de Pokédex usando o banco
de dados existente. Este documento cobre os bugs já corrigidos nesta sessão e as
sugestões que ainda dependem de decisão do Eduardo.

## 1. Bugs corrigidos nesta sessão (não são só sugestão, já foram pro código)

1. **Toolbar sumia pra sempre depois de visitar "Meus Fichários".** `switchSet()`
   em `app.js` restaurava `#fic-binder-controls`/`#fic-set-info`/`#binder-stats`
   ao trocar de aba, mas esquecia de restaurar `.bctl` (a barra de busca/filtros/
   copiar lista/imprimir/compartilhar). Como `openCustomBinderView()` e
   `renderCustomBindersHome()` escondem `.bctl` via `display:none` direto no
   elemento, a barra ficava escondida em QUALQUER coleção normal depois de
   passar por "Meus Fichários", sem precisar sair da aba Fichário. Corrigido.
2. **Fichário personalizado não tinha botão de adicionar carta, busca, filtros
   nem copiar lista.** Só dava pra adicionar/remover carta indo em "✏️ Editar" e
   trocando pra aba "🃏 Seleção manual" — nada óbvio nem rápido. Agora
   `openCustomBinderView()` tem: botão "+ Adicionar carta" (atalho que já abre
   direto na seleção manual com o campo de busca focado), busca + "Só
   coletadas"/"Só faltantes" (reaproveitando `getSlots()`/`collected`, igual o
   fichário normal), e "📋 Copiar lista" (`exportCustomBinderText()`, adaptado
   do `exportBinderText()` pra funcionar com cartas de vários sets ao mesmo
   tempo, já que um fichário personalizado pode misturar ME04+SV3.5+etc).
3. **Seletor de set no picker manual só listava 6 sets ME, hardcoded.** Buscar
   carta de SV, SVP ou legado pra colocar num fichário personalizado não
   aparecia no filtro de set (aparecia só se a pessoa deixasse "Todos os sets" e
   buscasse pelo nome). Agora lista dinamicamente tudo que está em
   `myCollections`.
4. **Fichário personalizado não tinha como virar aba fixa** — só dava pra abrir
   entrando primeiro em "Meus Fichários". Agora o modal de criar/editar tem um
   checkbox "📌 Fixar na aba principal" que registra o fichário em
   `pinnedBinders` (guardado local, mesmo padrão do `myCollections`) e ele passa
   a aparecer como aba própria ao lado de ME04/SV1/etc, com contagem de cartas
   ao vivo.
5. **"Copiar lista" não mostrava quantidade nem valor consolidado** (pedido
   antigo do Eduardo que tinha ficado pendente). Em "Só coletadas", cada slot
   com mais de 1 cópia agora mostra `✅×N`, e o rodapé soma
   *"Valor total da coleção (o que já tenho)"*. Em "Só faltantes", o rodapé
   soma *"Valor pra fechar a coleção"* (preço de 1 cópia de cada slot que falta).
   Vale tanto pro fichário normal quanto pro personalizado.
6. **Preset "Pokédex 151" incluía cartas que não são Pokémon.** Ver seção 4 —
   corrigido e verificado carta por carta contra `cards_sv3pt5.js`.
7. **Menus do fichário minúsculos no celular.** Quase todo controle (abas,
   busca, checkboxes, botões) usa `style` inline fixo com `font-size:10px` e
   padding de 4-5px, sem nenhuma regra responsiva. Adicionado bloco
   `@media (max-width:600px)` em `style.css` que aumenta toque/fonte só em tela
   pequena (abas com padding 12x14, botões com no mínimo ~38-40px de altura,
   campo de busca ocupando a linha inteira). Não fiz nada além disso — layout
   desktop continua idêntico.

## 2. Sugestões de UX — coleções normais (ME/SV/legados)

- **Barra de progresso por seção.** Hoje o `#fic-set-info` mostra só o progresso
  do set inteiro (ex: "159/198 slots"). Pra sets grandes como MEG (188 cartas)
  ou os legados SWSH (200+), separar "Base: X/Y" e "Secretas: X/Y" ajudaria a
  enxergar onde falta esforço sem contar na mão.
- **Indicador de "quase completo".** Uma carta com 1 de 2 slots (ex: só a Foil,
  falta a Reverse Holo) fica visualmente igual a uma carta com 0 slots no modo
  Grade — só muda a cor da borda, sutil. Um badge tipo "1/2" no canto ajudaria
  a achar rápido o que falta fechar.
- **Atalho "Marcar tudo desta raridade".** Pra quem compra um lote/box inteiro
  de reprints comuns, marcar carta por carta é repetitivo. Um botão "marcar
  todas as Comuns/Incomuns visíveis como coletadas" (respeitando o filtro atual)
  economizaria bastante clique.
- **Aviso quando um set muda de coleção pra outra.** ME05/ME06 mudam de
  "upcoming" pra ativo com o lançamento — já existe essa lógica, mas não há
  nenhum aviso visual pro usuário no momento da virada (ex: notificação "ME05 já
  está disponível pra colecionar!"). Pequeno, mas evita o usuário nem perceber
  que pode começar a preencher.

## 3. Sugestões de UX — "Meus Fichários" e fichário personalizado

- **Duplicar fichário existente.** Pra criar variações (ex: "Vitrine" e
  "Vitrine — vendidas") o usuário tem que recriar a seleção manual do zero.
  Um botão "Duplicar" no card do fichário economizaria isso.
- **Preview de progresso por set dentro do fichário personalizado.** Quando o
  fichário mistura vários sets (ex: 151 Novo com SV3.5 + outros), hoje só existe
  um progresso geral (%). Mostrar um mini-resumo por set dentro do fichário
  ajudaria a identificar qual "sub-coleção" está mais perto de fechar.
- **Ordenar "Meus Fichários" por progresso ou por atualização recente.** Hoje a
  ordem vem só de `created_at` (mais novo primeiro). Com muitos fichários
  criados, ordenar por "mais perto de completar" ajuda a decidir o que priorizar.
- **Presets temáticos por geração** (Johto/Hoenn/etc.), não só por raridade/tipo
  — hoje `BINDER_PRESETS` só tem "Pokédex 151" como preset por geração
  específica. Dá pra generalizar isso (ver seção 4).

## 4. Pokédex — o que o Eduardo pediu, corrigido e com plano pra virar feature grande

### 4.1 — "Pokédex 151" (já existe, estava com bug, corrigido agora)

O preset `sv151_pokedex` (em `BINDER_PRESETS`, `app.js`) já existia — filtra as
cartas base de `sv3pt5` (Coleção 151 / Pokémon 151). Só que o filtro era
`c._setId==='sv3pt5' && c.base`, o que pega **165** cartas, não 151: as cartas
`n:152` a `n:165` de `cards_sv3pt5.js` são treinador (Antique Dome Fossil, Big
Air Balloon, Bill's Transfer, Energy Sticker, Erika's Invitation etc.), não
Pokémon — conferido carta por carta. Tentei filtrar por `c.type`, mas não
funciona: cartas SV usam `type:'Incolor'` tanto pra Pokémon Normal quanto pra
treinador (sem campo de supertipo separado no cadastro). A sorte é que, nesse
set específico, **o número da carta bate exatamente com o número da Pokédex
Nacional** (conferido: n:001=Bulbasaur, n:025=Pikachu, n:150=Mewtwo,
n:151=Mew ex). Corrigido pra `parseInt(c.n)<=151` — agora são exatamente 151
cartas, uma por espécie, na ordem certa. Verificado via script.

### 4.2 — "Pokédex Nacional 1024" (ideia nova do Eduardo — viável, mas é projeto grande)

A ideia é boa: um fichário/preset que mostra, pra cada um dos 1024 Pokémon
conhecidos, se o usuário já tem QUALQUER carta daquela espécie em QUALQUER
coleção que ele possui (ME, SV, SVP, legados SWSH). Não dá pra fazer isso hoje
com um filtro simples como o da seção 4.1, por três motivos reais:

1. **Não existe número de Pokédex no cadastro.** Cada carta só tem `name`
   (string) — não tem um campo `dexNumber`. Pra saber que "Charmander" é #4,
   precisaria de uma tabela de referência nova (nome → número), separada dos
   arquivos `cards_*.js` atuais.
2. **Nome de carta ≠ nome de espécie.** O banco tem variações que não batem
   direto com o nome da espécie: `"Mega Charizard X ex"`, `"Team Rocket's
   Mewtwo ex"`, `"Galarian Meowth"`, `"N's Zorua"`, `"Hisuian Samurott V"` etc.
   Pra contar isso como "tenho Charizard/Mewtwo/Meowth/Zorua/Samurott" seria
   preciso uma função de normalização de nome (tirar "Mega ", " ex", "Team
   Rocket's ", prefixos regionais Galarian/Alolan/Hisuian, sufixos V/VMAX/
   VSTAR/GX das cartas legadas) — não é 1:1 direto, e tem risco real de acerto
   errado (ex: "Iron Bundle"/"Iron Treads" são Paradoxos baseados em espécies
   existentes mas com nome totalmente diferente — não têm como resolver por
   regra simples, precisariam de mapeamento manual).
3. **Cobertura real provavelmente não bate 1024/1024.** As coleções cadastradas
   no MyDeck (ME01-06, MEP, SV1-10, SVP, 25 sets SWSH) cobrem bastante gente,
   mas não necessariamente TODAS as 1024 espécies — teria buraco garantido em
   Pokémon muito recentes ou muito nichados que nunca saíram num desses sets
   específicos. Uma versão honesta do recurso mostraria algo como "612/1024
   possíveis com as coleções que você tem", não fingir que dá 100%.

**Plano se o Eduardo quiser seguir com isso** (projeto à parte, não é ajuste
rápido):
1. Gerar/obter uma lista de referência dos 1024 nomes de espécie em ordem de
   Pokédex Nacional (arquivo novo, ex. `pokedex_nacional.js`).
2. Escrever uma função de normalização de nome de carta → espécie base (regras
   pra Mega/ex/regional/promo-personagem + uma tabela de exceções manual pra
   casos tipo Paradoxo que não têm como resolver por regra).
3. Rodar essa normalização contra `getAllCardsWithSet()` uma vez, comparar com
   a lista de 1024 e reportar quantas espécies têm pelo menos 1 match — aí sim
   dá pra saber o número real de cobertura antes de prometer a feature pronta.
4. Só depois disso vale construir o preset/fichário em si — do contrário corre
   o risco de o app "descobrir" Pokémon errado por causa de nome mal casado.

Não implementei o item 4.2 nesta sessão — é claramente maior que o resto do
pedido e tem decisões de dado (a lista de referência, as regras de
normalização) que fazem mais sentido o Eduardo validar antes de eu gerar
arquivo novo de dados pro repositório.

## 5. Responsividade mobile — o que foi feito e o que mais dá pra fazer

Feito nesta sessão (`style.css`, bloco `@media (max-width:600px)`): abas de
coleção com padding maior, botões da barra de controle com altura mínima
~38-40px, campo de busca ocupando a largura inteira, checkboxes maiores. Isso
resolve o "clicável" — o alvo de toque ficou dentro do recomendado (~40px).

Ideias adicionais, não implementadas (peço confirmação antes, mexem mais no
layout visual):
- Esconder o texto "Clique na carta para editar slots" no mobile (ocupa espaço
  e o gesto já é intuitivo depois do primeiro toque).
- No modo Grade em telas muito estreitas (<380px), considerar 2 colunas fixas
  em vez de deixar o grid espremer.
- Abas de coleção (`#binder-tabs`) já rolam horizontalmente — dá pra adicionar
  uma seta ou sombra de gradiente nas bordas indicando que tem mais conteúdo pra
  rolar (hoje não tem nenhuma pista visual disso).
