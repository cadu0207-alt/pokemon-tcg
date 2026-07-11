# MyDeck — Análise Visual · 11/jul/2026

Passei por todas as abas logado como Eduardo (mydecktcg.com.br), tab a tab, com screenshots. Achados abaixo, do mais para o menos importante.

## 1. Inconsistência de tema entre páginas (achado principal)

O app principal (Dashboard, Gastos, Cartas Tiradas, Fichário, Preço Justo, Lojas & Ofertas, Iniciantes) está todo em **tema claro** (lavanda/branco). Mas o **Simulador de Abertura** (`simulador.html`) abre em outra aba e está no **tema escuro** original (`--bg:#0d0f18` etc., da paleta antiga).

Resultado: sair do app e abrir o simulador parece trocar de produto. Isso é o maior ponto contra "profissionalismo" — a identidade visual não é única. Precisa escolher um tema (recomendo consolidar no escuro, que é mais premium e já tem toda a paleta pronta — accent vermelho, teal, gold) e aplicar em tudo, ou portar o simulador pro claro.

## 2. Gastos: banners decorativos ocupam espaço demais

Cada compra na aba **Gastos** tem um banner full-width (~140px de altura) com arte borrada do produto antes de mostrar os dados reais (nome, preço, boosters). Com 17 compras isso vira uma rolagem enorme pra pouca informação.

Comparar com a aba **Cartas Tiradas**, que resolve o mesmo problema (mostrar muitos itens) com um grid denso de thumbnails pequenas — muito mais rápido de escanear.

**Sugestão:** trocar o banner grande por uma linha compacta com thumbnail pequena (como um list-item), aplicando o mesmo padrão de densidade da aba Cartas Tiradas.

## 3. Imagem quebrada no Dashboard

Em "Destaques do Pull", o card **Cyndaquil (MEP·047)** não carrega a arte — aparece um placeholder cinza vazio com texto sobreposto. Vale checar o fallback de imagem (`onerror`) pra cartas sem URL válida, hoje ele não está tratando bem esse caso.

## 4. Linhas de grid com item órfão

Acontece em dois lugares:
- **Dashboard → Progresso Master Set**: a última linha (MEP) tem só 1 card, sobrando 3 colunas de espaço vazio à direita.
- **Lojas & Ofertas → Ofertas Rastreadas**: mesma coisa, último produto sozinho na linha.

**Sugestão:** `justify-content` ajustado pro último row, ou usar `grid-auto-flow` com preenchimento, ou simplesmente limitar a largura do container pra não sobrar vão.

## 5. Disclaimer repetido 9× em Lojas & Ofertas

Já existe um aviso único no topo da aba ("Esta aba contém links de afiliado..."). Mesmo assim, cada um dos 9 produtos rastreados repete a caixa amarela inteira ("Se o preço na página não bater, veja 'Outras opções de compra'..."). É a mesma frase 9 vezes, ocupando bastante altura por card.

**Sugestão:** manter só o disclaimer do topo e tirar a caixa individual, ou reduzir pra um ícone com tooltip.

## 6. Ferramentas de admin misturadas na aba pública

Ainda em Lojas & Ofertas: "Admin · Regra geral de cupom" e "Admin · Cadastrar produto rastreado" aparecem embaixo do grid de ofertas — na mesma aba que um visitante comum veria. Faz sentido pra você (é sua única conta), mas estruturalmente esses controles ficariam mais organizados numa aba/área separada de administração, longe do que é "vitrine".

## 7. Contraste ruim numa barra do gráfico de gastos

Em "Gastos por Data" (Dashboard), a barra do dia **07-07** tem um valor baixo e a barra fica tão fina que o texto branco dentro dela quase some contra o fundo rosa claro. Vale um contraste mínimo garantido (ex.: texto escuro quando a barra é muito curta, ou o valor sempre fora da barra).

## 8. Cartas Tiradas não tem os mesmos filtros do Fichário

A aba Fichário tem "Só coletadas / Só faltantes / Só importantes" + busca local. Cartas Tiradas (que também é uma lista longa, ex. 141 slots só do ME04) não tem nada disso — só a busca global do header, que filtra o site inteiro, não a aba. Dá pra reaproveitar o mesmo componente de filtro.

## 9. Ícones inconsistentes nos presets de Fichário

Em "Meus Fichários → Sugestões Temáticas", a maioria dos 16 presets tem um emoji dentro de um quadrado colorido, mas alguns (ex. "151 de Pobre") aparecem só com o emoji solto, sem o fundo. Pequeno, mas quebra o padrão visual da grade.

## 10. Botões da home não são elementos semânticos

Rodando o accessibility tree da landing page, só o link "Política de Privacidade" aparece como elemento interativo — os botões principais ("Entrar na Coleção", "Simulador de Packs") não são capturados, sugerindo que são `<div onclick>` em vez de `<button>`/`<a>`. Afeta acessibilidade (leitor de tela, navegação por teclado) e SEO. Também notei que rolar rápido / usar a tecla Home na home às vezes deixa um vão em branco enorme antes do conteúdo reaparecer — vale testar esse scroll glitch com calma.

---

## O que já está funcionando bem (não mexer)

- **Preço Justo / EV**: a melhor aba do site — banner de nota (A–F) com cor, métricas em cards, tabela de composição por raridade. Esse é o padrão visual que o resto do site deveria copiar.
- **Cartas Tiradas**: grid denso, ícones de raridade claros, accordion por set.
- **Iniciantes**: FAQ accordion limpo, ícones consistentes, toggle +/- funciona certinho.
- **Simulador**: a mecânica de abrir pacote (glow no card, reveal) está muito boa — só destoa no tema, não na interação.
- **Home**: já foi reorganizada por era (Mega Evolução / Escarlate & Violeta / Espada & Escudo) — resolve a reclamação antiga do `ANALISE_SITE_jul2026.md` sobre home desatualizada.

## Prioridade sugerida

1. Unificar tema (claro vs. escuro) entre app e simulador
2. Redesenhar linhas de "Gastos" pra formato compacto
3. Corrigir fallback de imagem quebrada (Cyndaquil e casos similares)
4. Ajustar grids com item órfão (Dashboard e Lojas)
5. Remover disclaimer duplicado em Lojas & Ofertas
6. Separar ferramentas de admin da aba pública
7. Corrigir contraste da barra de gastos
8. Levar filtros do Fichário pra Cartas Tiradas
9. Padronizar ícones dos presets
10. Trocar divs por elementos semânticos nos CTAs da home + investigar scroll glitch
