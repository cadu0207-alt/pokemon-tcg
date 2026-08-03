# Conferência Geral — MyDeck Pokémon TCG (02/ago/2026)

Segunda rodada, ~2,5 semanas depois da de 15/jul. O projeto cresceu bastante nesse período: Lorcana (13 sets), legados totalmente populados (SWSH→Clássicos), Master Set Nacional/Regional, tema claro/escuro, marketplace, várias lojas novas. Revisei tudo de novo do zero (sintaxe, colisões de nome, contagens, changelog) em vez de assumir que os achados de 15/jul ainda valiam.

## O que já foi corrigido desde a última vez (sem ação — só registrando)

Boa notícia: as 6 correções de 15/jul continuam de pé, e o padrão de contagem dinâmica que apliquei no ME03 foi **adotado em mais 3 sets** (ME05, MEP, SVP agora usam `typeof CARDS_X!=='undefined'?CARDS_X.length:fallback`) — bom sinal de que o padrão pegou. O changelog de 30/jul também mostra que vocês (ou outra sessão) já acharam e corrigiram sozinhos vários bugs reais: raridade "Rara" legada sem slot Normal, salvar carta falhando em silêncio sem login, e os "quadradinhos" de marcar carta chamando uma função inexistente. Não vou repetir esses.

## 1. Erros encontrados agora

### 1.1 Dead code acumulando em `lojas.js` (mesmo padrão do `renderBinder`, mas aqui é o padrão funcionando como esperado)
`lojas.js` define `renderProductCard`, `renderShowcaseSection`, `filterLojasByCollection` e `renderAdminPanel` — e 3 arquivos "patch" carregados depois (`lojas_fix_latest_price.js`, `lojas_destaques.js`, `lojas_admin_collapse.js`) redefinem essas mesmas 4 funções, sobrescrevendo as originais. Isso é o padrão intencional do projeto (estender sem editar o arquivo base), então não é bug — mas as versões antigas em `lojas.js` viraram código morto que ninguém executa mais. Vale uma limpeza quando tiver tempo, só pra quem for mexer em `lojas.js` não perder tempo editando a versão errada (like já aconteceu com o `renderBinder`).

### 1.2 `.git/index` ainda com problema
Ao rodar `git status` no sandbox, deu `unable to unlink .git/index.lock: Operation not permitted` — mesmo problema já documentado (achado independente em 18/jul): o índice do git no mount do sandbox está com lock/corrupção. **Não mexi nisso agora** porque já está registrado que é provavelmente só cache do sandbox, não do seu repositório real. Se o GitHub Desktop/terminal do Windows também reclamar de índice corrompido, aí sim vale apagar `.git/index` manualmente (é só cache, sem perda de dado).

### 1.3 `cards_*.js` e `legacy_*.js` continuam gerando diffs gigantes sem mudança real
Conferi de novo: `cards_me02.js`, `cards_sv1.js`, `legacy_bw.js` aparecem como "modified" no git, mas o conteúdo é idêntico — é só troca de quebra de linha (CRLF/LF), provavelmente do script `update_prices.py` ou de alguma regeneração. Isso já estava na recomendação de 15/jul e continua sem `.gitattributes` — a cada rodada do scraper de preços, o `git diff` fica ilegível (arquivo inteiro marcado como alterado) e dificulta revisar o que realmente mudou de preço.

## 2. Indicações — performance

### 2.1 Payload de JS carregado sempre, mesmo sem uso (a mais importante desta rodada)
O site carrega **~3,7 MB de JavaScript** logo de cara pra qualquer visitante, incluindo `legacy_swsh.js` (359 KB), `legacy_sm.js` (311 KB), `legacy_xy.js` (200 KB), `legacy_ex.js` (187 KB), `legacy_classic.js` (174 KB), `legacy_bw.js`/`legacy_dp.js` (~148 KB cada) — mais de 1,3 MB só de sets legados que a maioria dos usuários provavelmente nunca abre. Isso pesa especialmente em conexão de celular. Dá pra carregar cada `legacy_*.js` (e os `cards_lorcana_*.js`) sob demanda — só quando o usuário clica na aba daquele set — em vez de via `<script defer>` fixo no `index.html`. Não muda a arquitetura (ainda são variáveis globais), só troca o timing do carregamento.

## 3. Indicações — manutenção/arquitetura

### 3.1 `.gitattributes` (repetindo de 15/jul, ainda relevante)
`* text=auto eol=lf` resolveria o ruído de diff citado no item 1.3 de uma vez por todas.

### 3.2 Consolidar os "patches" de `lojas.js`
Já são 4 arquivos satélite (`lojas_fix_latest_price.js`, `lojas_destaques.js`, `lojas_admin_collapse.js`, `lojas_store_vespa.js`, `lojas_banner_centraltcg.js`) além do original. O padrão monkey-patch é ótimo pra evitar truncar arquivo grande, mas em algum ponto vale um "merge" desses patches de volta pro `lojas.js` (feito com cuidado, testando) pra não acumular 6 arquivos fazendo a mesma coisa em camadas.

## 4. Indicações — produto/UX

### 4.1 Menu de abas está ficando denso
Contando Dashboard, Gastos, Cartas, Fichário (+ sub-aba Meus Fichários/Master Set), Preço Justo, Shopping/Lojas, Marketplace, Pokédex Nacional, Simulador, Iniciantes — são muitas abas de primeiro nível. Com o Master Set Nacional/Regional e o Marketplace sendo adições recentes, pode ser a hora de agrupar (ex: um menu "Coleção" com submenu Fichário/Master Set/Pokédex, outro "Mercado" com Lojas/Marketplace/Preço Justo) em vez de tudo na mesma barra.

### 4.2 Tema claro/escuro — validar contraste
Foi implementado em 30/jul (bom!). Vale um teste rápido de contraste no tema escuro especificamente nas telas com muita cor (fichário com stripes coloridas por tipo, gráficos do dashboard) — é comum tema escuro "por cima" de um design pensado pro claro deixar alguma cor ilegível.

### 4.3 Lorcana e multi-TCG
13 sets de Lorcana já estão carregados (`cards_lorcana_set1-13.js`, `lorcana.html`, `lorcana_app.js`) mas parecem viver numa página separada (`lorcana.html`) em vez de dentro do fluxo principal do MyDeck. Se a ideia é crescer pra multi-TCG de verdade, vale decidir cedo: fica como produto irmão separado, ou integra na mesma navegação/XP/conta do usuário? Isso muda bastante a arquitetura de dados (perfil único vs. por-jogo).

## 5. Indicações — dados

### 5.1 Rotina de imagens faltando (já anotado, reforçando)
Segue pendente a rotina periódica de checar cartas sem imagem no Scrydex — ainda mais relevante agora com Lorcana e legados totalmente populados (muito mais superfície pra imagem quebrada).

### 5.2 ME05 já lançou — conferir preços reais
O ME05 tinha lançamento previsto pra 17/jul/2026. Hoje é 02/ago — se já lançou, vale conferir se os preços do `ev_calculator.js` (que estavam marcados "ESTIMADO, urgente ajustar" em 15/jul) já foram atualizados com preço real de varejo.
