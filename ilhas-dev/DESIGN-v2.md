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

## Primeira impressão e retenção (implementado após a avaliação de 17/11)
- Menu com nome e o objetivo da temporada (Cristal nível 10 + topo do ranking).
- Textos do tutorial conforme o aparelho (celular fala dos botões, PC das teclas); missão recolhida no celular; ajuda de teclas some após 60 s no PC.
- **Escudo de novato**: sem saque nos primeiros 10 min de jogo ou até a ilha chegar ao nível 2 (avisado ao sair da ilha).
- Ranking: empatados dividem a posição; mostra "faltam X pts para passar Fulano".
- **Bem-vindo de volta**: ao voltar depois de 2+ min, resumo do tempo fora e dos últimos acontecimentos; plantações crescem enquanto você está fora (até 8 h).

## Compartilhar e convidar (implementado)
- Cartão PNG da ilha (foto de cima, nome, nível, reino, posição) nas conquistas e no painel do Cristal; Compartilhar/Baixar/Copiar link.
- Link de desafio `?de=Nome&nv=N` (+ `&c=slot&t=temporada` online): quem chega ganha 1 cristal.
- Online: o convite é registrado no servidor (`ilhas_convites`, sql/ilhas_convites_17nov2026.sql) e quem convidou recebe
  1 cristal + 10 madeira + 5 pedra no baú por amigo (até 20 por temporada; só vale para quem entrou há menos de 1 h).
- Visitar: tocar numa pessoa no ranking leva a câmera até a ilha dela.

## Rival da semana (implementado)
- Rival = quem está logo acima de você no ranking (bot ou pessoa); dura 7 dias reais; aparece no painel de status (toque = ver a ilha).
- Aviso quando um passa o outro; o rival aparece em 40% dos saques à sua ilha.
- Vitória: abrir 30% de vantagem (ou estar na frente no fim da semana) = +1 cristal no baú, XP e cartão para compartilhar; vem um novo rival.
- Se você lidera, o rival é o mais perto abaixo e a regra vira "segurar a frente até o fim da semana" (sem vitória instantânea).

## Ajustes da 2ª avaliação (17/11)
- Morte justa: cristal e jangada nunca caem; morrer de novo junta o túmulo antigo ao novo (nada se perde).
- Saque que não leva nada não drena o Cristal; escudo de novato até a ilha nível 3 ou 20 min de jogo.
- Baús mostram raridade e nível recomendado (verde ✓ / amarelo ⚠ / vermelho ☠): comum 3, raro 5, épico 7, lendário 9.
- Missões 9–12: abrir baú do mundo, cerca/torre, baú da ilha, ilha nível 3. Metas do dia só contam depois das 8 primeiras.
- Bugs: "zumbi" com 0 de vida ao recarregar, preso dentro de recurso ao recarregar, posição do ranking diferente no cabeçalho e na lista,
  painéis abertos durante viagem pelo mapa.

## Vingança (implementado)
- Saqueado por um bot (que levou algo): aviso com **📍 Ir até lá** (rota automática até o Cristal dele) e **📸 Pedir ajuda** (cartão
  "Kai saqueou minha ilha! Me ajuda a revidar?" com o link de convite). Marca vermelha no mapa-múndi.
- Em até 15 min de jogo, no Cristal do invasor: **Vingar** = recupera o que ele levou +50% (o bot perde o que tiver), XP e cartão "Me vinguei".

## Metas do dia (implementado)
- 3 metas curtas por dia (as mesmas para todos no mesmo dia), ajustadas ao nível da ilha: coletar, criar, derrotar criaturas,
  abrir baús, construir, colher, explorar. Aparecem no card de missão depois do tutorial.
- Cada meta: +5 madeira, +3 pedra, XP. As 3: +1 cristal e +1 na sequência de dias; marcos 3/7/14/30 dias dão cristais extras e cartão.
- Faltar um dia **não zera** a sequência (só pausa) — retenção sem punição.
- Presentes (metas, rival, convites) vão para o baú se houver um; senão para a mochila.

## Exploração (implementado)
- **Névoa**: o mundo começa coberto; abre num raio de 7 tiles em volta de você e fica aberto (salvo no save). Sua ilha inteira já começa conhecida.
- **Mapa-múndi** (botão 🗺 ou tecla M): terreno só onde você já viu, você, sua ilha, baús, ilhas rivais e de outros jogadores que você já encontrou, e o % de terra explorada.

## Reinos (ideia do dono, 17/11/2026 — 1ª versão implementada com bots)
Crescer não é só ter mais terra: cada Cristal projeta um **círculo de influência** que aumenta com o nível da ilha.
- **Choque de fronteiras**: quando o círculo de uma ilha alcança a ilha vizinha (ou as ilhas crescem até se encostar),
  abre-se uma **disputa**. A ilha mais forte (nível + defesa + força do dono) pressiona a mais fraca.
- **O lado que perde escolhe**:
  1. **Mudar-se**: leva parte do que tem e recomeça numa ilha livre (sem perder tudo);
  2. **Entrar no reino** do vencedor como **vassalo**: continua jogando a própria ilha, mas paga **tributo** de tempos em
     tempos (uma % da produção vai para o rei). Em troca ganha **proteção**: as torres do reino ajudam a defender.
- **Reinos** = grupos de pessoas e bots com um rei; aparecem no mapa-múndi com a mesma cor e no ranking como reino.
- **Rebelião**: um vassalo que cresce pode se rebelar (sozinho ou junto com outros vassalos). Se a força dos rebeldes
  passar a do rei, a ilha se liberta (ou o rebelde vira o novo rei).
- **Decidido e implementado (src/sim/reinos.ts)**:
  - influência = raio da ilha + 2,2 tiles por nível; força = nível×10 + defesa das construções + nível do dono×2;
    reino = força do rei + metade da força dos vassalos;
  - disputa **automática** a cada 30 s: domina quem tem ≥ 25% a mais; quem é dominado leva os próprios vassalos junto;
  - pessoa recebe **proposta** (aceitar vassalagem ou resistir: livre, mas o rei saqueia o dobro por 15 min);
  - **tributo** de 15% de madeira/pedra/fibra/minério/lingote/couro a cada hora de jogo (baú do vassalo → baú do rei);
    vassalo sofre metade dos saques (proteção do reino);
  - **rebelião**: bots se rebelam sozinhos quando passam o rei; você usa o botão no Cristal (soma metade da força dos
    vassalos fortes do mesmo rei); falhou = −30% de energia e espera de 10 min; venceu = 20 min de imunidade;
  - o **rei pode libertar** vassalos; ranking mostra 👑 rei de N / vassalo de X (+30 pts por vassalo);
    mapa-múndi desenha os círculos de influência com a cor do reino.
  - Simulador (60 min, 99 bots): primeiros reinos aos ~40 min; aos 60 min, 6 reinos (o maior com 4 vassalos).
- Ainda falta: **mudar-se** para outra ilha (opção de quem perde), reinos com **pessoas reais** (etapa 2 do online),
  ataque jogado opcional.

## Fases de implementação
| Fase | Entrega | Status |
|---|---|---|
| **A — Núcleo e expansão** | ilha inicial minúscula; Cristal no centro; alimentar o Cristal faz a terra crescer (níveis 1→10); escassez em casa (sem minério/cristal); jangada desde o início; tutorial novo; bots no mesmo ciclo | ✅ pronta (a energia que drena entra na Fase C) |
| **B — Baús e raridades** | baús aleatórios com guardiões; tabelas de loot por raridade; criaturas com raridade; reaparecimento | ✅ pronta |
| **C — Saque e defesa** | mochila limitada; baú guarda itens; invasões quando você está fora; drenagem do Cristal; defesa com torre/cerca; morte derruba itens | ✅ pronta (saques abstratos; bots indo fisicamente saquear entram na fase D) |
| **D — Bots rivais** | bots com o mesmo ciclo (expandir, caçar baús, saquear ilhas desprotegidas, inclusive a sua); feed de eventos ("Kai saqueou sua ilha!") | |
| **E — Temporada** | relógio de temporada, pódio, reinício com recompensa cosmética | |

Cada fase termina com testes, simulador (balanceamento) e teste no navegador (PC e celular), e é publicada.
