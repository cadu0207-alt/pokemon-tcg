# Análise Fichário — 24/07/2026

Revisão pedida pelo Eduardo depois da expansão do banco de cartas (dex nacional + artista em ~19 mil cartas, 122 sets legados populados via `expand_card_database.py`). Objetivo: caçar erros reais introduzidos ou expostos por essa mudança, e levantar sugestões de melhoria de layout e de funcionalidade agora que existe muito mais dado disponível.

## 1. Bugs encontrados e corrigidos nesta revisão

### 1.1 `getSlots()` inventava um slot reverse-holo impossível em 994 cartas legadas (real, corrigido)

Em `app.js`, a regra que decide quantas "versões" (N/F/RH/SP) uma carta tem usava:

```js
if(r==='Rara'||r.startsWith('Rara ')&&!r.includes('Ultra')){
  return [{ver:'F',...},{ver:'RH',...}];
}
```

Isso funcionava por acidente até ontem porque o vocabulário de raridade só tinha `Rara`/`Rara Holo`/`Rara Brilhante`/`Rara Ilustrada`/`Rara Ilustrada Especial` (todas cartas ME/SV que de fato nascem com versão Foil + Reverse Holo). Os 122 sets legados trouxeram dezenas de raridades novas que também começam com "Rara " mas **não têm reverse-holo físico**: `Rara Holo EX/GX/V/VMAX/VSTAR`, `Rara Rainbow`, `Rara Secreta`, `Rara Shiny`, `Rara Incrível`, `Rara Radiante`, `Rara BREAK`, `Rara Star`, `Rara Prime`. O branch antigo capturava todas elas sem querer e inventava uma 2ª versão (RH) que não existe — o fichário desses sets nunca chegaria a 100%, porque pedia uma carta que fisicamente não existe.

**Impacto medido**: 994 cartas afetadas em `legacy_*.js`.

**Correção aplicada**: trocado por um whitelist explícito que preserva **exatamente** o comportamento antigo pros rótulos que já estavam em produção (zero risco de orfanar coleção já marcada — nenhum usuário tinha progresso nesses sets antes de hoje mesmo assim) e redireciona as raridades novas pro slot único (`SP`), igual já é feito pra cartas `base:false`. Testado com os 22 valores reais de `rare:` encontrados no repo, confirmando que nada que já existia mudou de comportamento.

**Lição pro projeto**: regra de negócio que decide *estrutura de dado* (quantos slots uma carta tem) nunca deveria usar `.startsWith()`/`.includes()` solto contra string de raridade — o vocabulário cresce, e um match "genérico o suficiente pra funcionar hoje" vira bug amanhã. Preferir whitelist explícita nesses casos.

### 1.2 Colisão visual de badges no card (corrigido)

O badge novo de Pokédex (`#142`) foi colocado inicialmente no canto superior direito (`top:3px;right:3px`) — mesmo canto do ★ de "carta importante" (`top:3px;right:4px`) e perto do ✓ de "completa" (`top:-7px;right:-7px`). Pra uma carta importante, com dex conhecido, ainda não coletada, os dois badges ficariam sobrepostos. Corrigido: o badge de dex agora fica empilhado acima do badge de preço, no canto inferior direito.

### 1.3 Controles novos sem guard de contexto (corrigido)

`fmInjectDexSortControl()` e `fmInjectArtistFilter()` (os dois controles novos de hoje) não checavam se a toolbar (`.bctl`) estava escondida antes de injetar — diferente de `fmInjectRarityBulk()`, que já tinha esse guard desde 23/07 especificamente pra não vazar controle pras telas de fichário personalizado/compartilhado. Adicionado o mesmo guard nos dois, por consistência.

## 2. Achado que NÃO foi corrigido agora — precisa de decisão/confirmação

### 2.1 XP provavelmente não é creditado nos 122 sets legados novos

O sistema de XP (`xp_system_setup.sql`) credita XP via trigger Postgres que consulta `card_catalog` (tabela server-side com raridade de cada slot, `set_code`/`n`/`ver`/`rare`) — `fn_award_card_xp()` **retorna sem creditar nada se não achar a carta em `card_catalog`** (mesmo comportamento já documentado quando ME05/ME06 foram lançados: "sem isso, cartas desses sets não geram XP"). O seed desse catálogo (`card_catalog_seed.sql`) roda contra os `cards_*.js`/`legacy_*.js` que existiam **no momento em que foi rodado pela última vez** — como os 122 sets legados só passaram a ter dado real hoje, é bem provável que marcar uma carta desses sets no fichário não gere XP nenhum, silenciosamente (sem erro visível, só sem o "+N XP" no toast).

Não confirmei isso direto no Supabase (não tenho acesso à instância daqui). **Recomendação**: rodar `card_catalog_seed.sql` de novo antes de anunciar os sets legados como "prontos" — senão o primeiro feedback real vai ser "marquei uma carta e não ganhei XP".

## 3. Sugestões de melhoria — Layout

1. **Selo "preço estimado" nos sets legados.** Sets com preço via Liga já mostram "🗓️ atualizado em DD/MM" no cabeçalho do fichário; sets legados (todos, por enquanto) simplesmente não mostram nada porque não têm entrada em `price_updated_at.js` — ambíguo, dá a entender que ninguém pensou no preço, quando na real é uma estimativa TCGplayer (USD×BRL) conhecida. Sugestão: mostrar um selo "💵 preço estimado (TCGplayer, não Liga)" nesses casos, reaproveitando o mesmo espaço do selo de data — a mesma lógica de "nunca fingir dado que não existe" que já rege o resto do site (Preço Justo, Pokédex Nacional).
2. **Picker de coleção por era, não lista plana.** Com 122 sets legados + 21 modernos = 143 coleções possíveis, qualquer seletor que hoje é uma lista simples (ex: `cb-mset` no fichário personalizado, ou o modal de "adicionar coleção") vai ficar de rolagem quilométrica. `SERIES_META` já agrupa por era (ME/SV/SWSH/SM/XY/BW/HGSS/DP/EX/CLASSIC) — vale usar esse agrupamento como `<optgroup>`/acordeão nesses seletores em vez de lista única.
3. **Densidade dos badges no card da Grade.** Hoje um card pode acumular simultaneamente: dots de versão, badge "quase completo", ★ de importante, ✓ de completa, badge de preço e agora badge de dex — 6 elementos competindo por 4 cantos de um card de ~90×126px. Funciona, mas está no limite. Sugestão: um toggle "Modo compacto/detalhado" na toolbar — compacto mostra só borda de status + preço; detalhado mostra tudo (dex, badges extras), ajudável em telas menores.

## 4. Sugestões de melhoria — App/Funcionalidade

1. **Ligar "Meus Artistas" a navegação, não só números.** O relatório novo mostra quantas cartas você tem de cada ilustrador, mas é só leitura. Próximo passo natural: clicar num artista abre uma visão cross-coleção com só as cartas dele (reaproveitando a mesma ideia do filtro por artista dentro de 1 set, mas espalhado por todas as coleções) — fecha o loop da pergunta original do Eduardo ("fichário só de um artista").
2. **Busca global por artista.** A busca global (`#gsearch`) hoje indexa nome/número da carta. Com `artist` disponível em quase tudo, dava pra aceitar `artista:Mitsuhiro Arita` (ou um modo de busca dedicado) e already reaproveitar o ✓ de coletado que a busca global já tem desde 23/07.
3. **Ascended Heroes (`me2pt5`/ASC) e Black Bolt/White Flare (BLK/WHT) ainda fora do catálogo.** Achado desde 18/07, ainda não implementado — e agora tem um motivo concreto a mais: são exatamente os sets que provavelmente cobrem as 3 espécies que faltam pra Pokédex Nacional bater 1025/1025 (#1014, #1021, #1022). Se o objetivo é fechar 100%, esses são os sets que faltam.
4. **Seed do `card_catalog` pros sets legados** (ver achado 2.1) — sem isso, o incentivo de XP simplesmente não existe pra 122 novas coleções, o que é uma perda de oportunidade justo na hora que mais conteúdo novo está disponível.
5. **Preço real (Liga) pros sets legados mais valiosos primeiro.** Com 92 sets ainda pendentes de URL da Liga, faz sentido priorizar pelos sets historicamente mais caros (Base Set, Neo Genesis, Gym Heroes/Challenge — já visíveis em `legacy_classic.js`) em vez de ordem alfabética/cronológica, já que é lá que a diferença entre estimativa TCGplayer e preço real do mercado brasileiro costuma ser maior (mesmo motivo que fez o site trocar de TCGWatchtower pra Liga nos sets modernos).

## 5. Verificação feita

- `node --check` em `app.js` e `fichario_melhorias_23jul.js` depois de cada mudança.
- Teste offline (Node, sem DOM) simulando `getSlots()` contra os 22 valores reais de `rare:` encontrados no repo — confirmado que nenhum comportamento pré-existente mudou, só os 16 rótulos novos passaram a usar slot único.
- Contagem programática: 994 cartas legadas corrigidas pelo fix de slots; 1022/1025 espécies de Pokédex cobertas (contra 824/1025 antes, usando só casamento por nome).
- Não foi possível testar no navegador real (sandbox sem Playwright/Chromium instalado, sem rede pra baixar) — a verificação foi por leitura de código + simulação da lógica isolada. Recomendo abrir o site e conferir visualmente ao menos 1 set de cada era (SM/XY/BW/HGSS/DP/EX/Classic) depois do próximo deploy.
