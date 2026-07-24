# Log de Atualizações — 24/07/2026

Entradas prontas pra colar no Mural de Atualizações (Dashboard → publicar
atualização). Cada bloco = 1 título + 1 mensagem, dentro dos limites do
formulário (título ≤80 caracteres, mensagem ≤400 caracteres).

Ordem sugerida de publicação (mais recente/relevante primeiro, já que o mural
provavelmente lista do mais novo pro mais antigo):

---

**Título:**
⚡ Marcação rápida por versão no Fichário

**Mensagem:**
Inspirado no pkmn.gg: os pontinhos coloridos embaixo de cada carta (Normal/Foil/Reverse Holo) agora são clicáveis — um clique marca ou desmarca 1 cópia daquela versão na hora. Clicar em outra parte da carta continua abrindo o card completo, pra registrar mais de uma cópia ou a origem.

---

**Título:**
📢 Mural de Atualizações

**Mensagem:**
Agora o Dashboard mostra as novidades do site direto aqui, sem precisar perguntar o que mudou. Toda melhoria, correção ou feature nova vai aparecer nesse mural — com opção de minimizar quando já tiver lido.

---

**Título:**
🗂️ Master Set Nacional (1025 vagas)

**Mensagem:**
Novo fichário fixo com as 1025 espécies da Pokédex Nacional, uma vaga por Pokémon. Ele mostra automaticamente a melhor carta já coletada de cada espécie, cruzando todos os sets — ótimo pra fechar "pelo menos uma carta de cada Pokémon" sem se prender a um set só.

---

**Título:**
🎨 Fichário por Artista

**Mensagem:**
Agora dá pra criar um fichário fixo reunindo todas as cartas de um ilustrador, direto da aba "Meus Artistas". Também tem filtro/ordenação por artista em qualquer fichário e um relatório de quantas cartas de cada artista você já tem.

---

**Título:**
🔢 Pokédex completa nos 122 sets legados

**Mensagem:**
Terminamos de colocar número da Pokédex e ilustrador em todos os 122 sets legados (SM/XY/BW/HGSS/DP/EX/Classic) — cobertura de 1022 das 1025 espécies. Também corrigimos um bug que inflava o Master Set com uma versão Reverse Holo que várias raridades legadas nunca tiveram de verdade.

---

**Título:**
🛒 Estado de conservação nas Cartas à Venda

**Mensagem:**
Ao anunciar uma carta em "Cartas Tiradas & À Venda" agora dá pra marcar o estado dela: Nova, Praticamente Nova, Usada Moderadamente ou Danificada — fica visível pra quem for comprar.

---

**Título:**
⭐ Nova loja parceira: Vespa TCG

**Mensagem:**
A Vespa TCG (Belo Horizonte/MG) entrou na lista de lojas recomendadas em Lojas & Ofertas, com link direto de WhatsApp e Instagram.

---

## Observação técnica

A tabela `site_updates` só tem `title` + `message` (sem campo de versão) — a
publicação é feita manualmente pelo formulário admin em `updates.js`
(`publishUpdate()`), logado como você. Eu não tenho como inserir direto no
Supabase por aqui, então é só colar cada bloco acima no mural, um de cada vez.

A versão de git (convenção 1.6.x melhoria / 1.7+ feature / 2.0+ grande) segue
só nas mensagens de commit — hoje chegamos a v1.7 com o próprio mural de
atualizações. A marcação rápida por versão (pontinhos clicáveis) ainda está
sem commit; se quiser, posso commitar como v1.8 antes de você publicar essa
entrada.
