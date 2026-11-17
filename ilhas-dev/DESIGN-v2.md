# Ilhas v2 — Núcleo de Cristal

Redesenho a partir da avaliação independente (nota 3,5/10 para sobrevivência + construção + dominação)
e da visão do dono do projeto. Objetivo: transformar o jogo em **sobrevivência com escassez, expansão
evolutiva e disputa entre ilhas**, mantendo o tom bonitinho/anime.

## A ideia em uma frase
Você começa numa **ilha minúscula com um Cristal no centro** e quase nada para coletar. Para sobreviver
e crescer precisa **sair de jangada** atrás de **baús guardados por animais** nas outras ilhas — mas
**enquanto está fora, sua ilha fica desprotegida** e pode ser saqueada.

## Decisões do dono (respostas de 16/11/2026)
| Tema | Escolha |
|---|---|
| Ataque com você fora | **Rouba e enfraquece**: o invasor leva parte do que está guardado e drena energia do Cristal; energia zerada = a ilha perde 1 nível de expansão (dói, não acaba o jogo) |
| Crescimento | **A terra cresce de verdade**: alimentar o Cristal aumenta o raio da ilha (mais terra, mais espaço, mais recursos) |
| Baús e raridades | **Nas ilhas, em lugares aleatórios, protegidos por animais**; raridade comum → raro → épico → lendário |
| O que já existe | **Adaptar**: construções, habilidades, magias, bots e arte continuam; os níveis da ilha passam a ser a expansão do Cristal |

## Pilares
1. **Escassez em casa** — a ilha inicial só tem o básico (algumas árvores, uma pedra, arbustos). Minério,
   cristal e itens bons só existem fora.
2. **Sair é obrigatório e arriscado** — baús guardados por animais; quanto mais raro, mais forte o guardião.
3. **Ficar fora tem custo** — sua ilha pode ser saqueada; construções de defesa e o Cristal protegem.
4. **Crescer é visível** — cada nível de expansão aumenta a ilha de verdade e libera construções.
5. **Rivais de verdade** — bots também caçam baús, disputam as mesmas ilhas e saqueiam ilhas desprotegidas
   (inclusive a sua).

## Sistemas

### Cristal (núcleo da ilha)
- Fica no centro da ilha inicial, não pode ser movido.
- **Energia** (0–100%): enche ao **alimentar** o Cristal com cristais e alguns materiais; drena lentamente com
  o tempo e rapidamente quando a ilha é saqueada.
- **Nível de expansão** 1→10: cada nível custa um pacote de recursos + energia cheia. Ao subir:
  - o **raio da ilha cresce** (nova terra aparece em volta, com novos recursos);
  - libera novas construções (as atuais: fogueira, bancada, baú, casa, forja, altar, portal, estátua…).
- Energia zerada por saque ⇒ perde 1 nível de expansão (a terra encolhe; construções fora do novo raio
  viram ruína recuperável).

### Baús e raridades
- Surgem em **pontos aleatórios das ilhas** (neutras e, mais raramente, abandonadas), cada um com
  **guardiões** (criaturas que nascem perto e o defendem).
- Raridade define conteúdo e guardiões:
  | Raridade | Conteúdo típico | Guardiões |
  |---|---|---|
  | Comum | madeira, pedra, fibra, comida | 1–2 fracos |
  | Raro | minério, couro, ferramentas | 2–3 médios |
  | Épico | cristal, lingotes, armas | 3–4 fortes |
  | Lendário | muitos cristais, itens únicos | chefe |
- Baú aberto some e reaparece em outro lugar depois de um tempo.

### Criaturas com raridade
- Mesma criatura em versões **comum / rara / épica** (mais vida, dano, cor/brilho diferente, loot melhor).

### Saque e defesa
- Você está **fora** quando sai do raio da sua ilha.
- Bots rivais (e futuramente jogadores) podem **invadir** uma ilha desprotegida: levam parte do **baú**
  (o que está guardado) e drenam a energia do Cristal.
- **Mochila limitada** (slots) + **baú da ilha guarda** o excedente ⇒ decisão real: levar ou guardar.
- **Defesa**: torre/portal atira em invasores, cerca atrasa, casa dá regeneração; voltar a tempo expulsa o
  invasor.

### Sobrevivência
- **Morte com custo**: parte da mochila cai num túmulo recuperável no lugar da morte.
- (Opcional por dificuldade) fome leve.

## Função de cada construção (implementado)
| Construção | Função |
|---|---|
| Baú (armazém) | guarda itens; 12 tipos por baú; a mochila só leva 10 tipos ⇒ decidir o que levar |
| Casa | regenera vida por perto; à noite, **dormir** pula para a manhã; você renasce ao lado dela |
| Plantação | plante 1 baga; em 2 min colha 3 bagas + 2 fibras |
| Fogueira | afasta monstros à noite; **cozinha** (carne assada só perto dela) |
| Bancada | ferramentas e armas só perto dela |
| Forja | lingote e itens de ferro só perto dela |
| Altar | mana 3× mais rápida por perto |
| Portal (torre) | atira sozinho nos monstros que chegam perto (defesa) |
| Cerca | barreira: criaturas não atravessam |
| Estátua | +25% de XP |

## Fases de implementação
| Fase | Entrega | Status |
|---|---|---|
| **A — Núcleo e expansão** | ilha inicial minúscula; Cristal no centro; alimentar o Cristal faz a terra crescer (níveis 1→10); escassez em casa (sem minério/cristal); jangada desde o início; tutorial novo; bots no mesmo ciclo | ✅ pronta (a energia que drena entra na Fase C) |
| **B — Baús e raridades** | baús aleatórios com guardiões; tabelas de loot por raridade; criaturas com raridade; reaparecimento | ✅ pronta |
| **C — Saque e defesa** | mochila limitada; baú guarda itens; invasões quando você está fora; drenagem do Cristal; defesa com torre/cerca; morte derruba itens | |
| **D — Bots rivais** | bots com o mesmo ciclo (expandir, caçar baús, saquear ilhas desprotegidas, inclusive a sua); feed de eventos ("Kai saqueou sua ilha!") | |
| **E — Temporada** | relógio de temporada, pódio, reinício com recompensa cosmética | |

Cada fase termina com testes, simulador (balanceamento) e teste no navegador (PC e celular), e é publicada.
