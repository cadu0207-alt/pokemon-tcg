# Ilhas (protótipo)

Publicado em https://mydecktcg.com.br/ilhas/ (pasta `../ilhas`, gerada pelo build; não editar à mão).

Jogo 2D em pixel art no navegador. Plano completo em [PLANO.md](./PLANO.md).

## Rodar
```bash
cd ilhas-dev
npm install
npm run dev      # abre em http://localhost:5173
npm test         # testes da simulação
npm run build    # gera ../ilhas (commitar junto para publicar)
```
Sem parâmetros, abre a tela inicial. Parâmetros na URL pulam o menu (modo de desenvolvimento): `?seed=123` muda o mundo, `?n=25` muda o número de participantes (padrão 100), `?bots=10` muda quantos bots jogam (padrão 99), `?dificuldade=facil|normal|dificil`.

`npm run simular -- 240 30 facil` compara dificuldades sem tela.

Controles no PC: K abre habilidades, 1–5 lançam magias. WASD ou setas para andar, Espaço ou E para coletar, C para criar, clique num item construível da mochila e depois no mapa para construir (Esc cancela), roda do mouse para zoom.

No celular: toque em qualquer ponto da metade esquerda para o joystick aparecer ali, pinça com dois dedos para zoom, botão AÇÃO à direita, toque no item construível, toque no mapa e em ✔.

O progresso fica salvo no navegador (localStorage, chave `ilhas-save-<seed>-<n>`).

## Simulador sem tela
`npm run simular -- 40 30` roda 40 minutos de jogo com 30 bots em poucos segundos e mostra a evolução por nível.
Foi assim que achamos ilhas sem pedra, bots que se trancavam nas próprias construções e caçadas que nunca terminavam.

## Estrutura
- `src/sim/` — regras puras, sem Phaser (geração do mundo, RNG determinístico). Roda também em testes e, no futuro, em Web Worker/servidor.
- `src/render/` — cenas Phaser, texturas geradas em código (placeholder até a arte final).
- `tests/` — Vitest.

## Estado
- [x] Fase 0 — mapa procedural com arquipélago, câmera, personagem andando com colisão
- [x] Fase 1 — coleta (árvore, pedra, arbusto) com renascimento, inventário, 6 receitas, ferramentas com durabilidade
- [x] Fase 2 — construção na ilha (fogueira, bancada, cerca, baú, casa), nível da ilha 1→4, salvamento automático
- [x] Celular — joystick virtual, botão de ação, construção por toque, zoom +/−
- [x] Fase 3 — criaturas (coelho, javali, slime, lobo) com IA, combate, armas, vida/XP/nível, comida, dia/noite (6 min) com fogueira que protege, desmaio sem perda de itens
- [x] Fase 4 — bots com 4 perfis, utility AI, A*, planejamento de construção; ranking e modo espectador
- [x] Fase 5 — 99 bots por padrão e 1000 participantes com `?n=1000&bots=999` (1,7 s para carregar, ~37 MB, 60 fps); mapa desenhado em pedaços de 32×32; geração do mundo 115× mais rápida; jangada para navegar entre ilhas
- [x] Fase 6 — minério e cristal (ilhas neutras são ricas), ferro, forja/altar/torre/estátua, ilha nível 1→10, árvore de habilidades (4 ramos × 5), 5 magias com mana, bots planejando a cadeia completa e escolhendo habilidades pelo perfil
- [x] Fase 7 — tela inicial (mundo Vila/Arquipélago/Gigante, dificuldade, continuar/novo jogo), dificuldade dos bots, tutorial em 9 missões, sons e música gerados com Web Audio, sombras
- [x] Visual — terreno com costas orgânicas (pintado pixel a pixel, ~13 ms por pedaço), personagens chibi 24×24 gerados com 3 penteados, 4 tons de pele e 4 quadros de caminhada
- [x] Celular — joystick flutuante, pinça para zoom, mira automática, botão de ação com rótulo (Cortar/Minerar/Atacar/Construir), vibração, botões compactos
- [x] Arte do Ninja Adventure Asset Pack (CC0): 24 personagens (escolha na tela inicial), criaturas, árvores, pedras, minério, cristal, construções e ícones; terreno com a paleta do pacote
- [x] Sons e músicas do pacote (13 efeitos + música de dia e de noite, MP3 leve), ícones restantes, câmera mais próxima
- [x] Bots navegam: constroem jangada e fazem expedições às ilhas neutras atrás de minério e cristal (ida, coleta, volta; rede de segurança de 6 min); checagem de conectividade trata pedras e minérios como paredes permanentes
- [x] **v2 Fase A — Núcleo de Cristal** (ver `DESIGN-v2.md`): ilha começa minúscula, alimentar o Cristal com cristal (só existe fora) faz a terra crescer; bots com o mesmo ciclo
- [x] Cada construção tem função (baú/armazém com mochila limitada, casa, plantação, estações de trabalho, altar, portal que atira, estátua) — ver tabela em `DESIGN-v2.md`
- [x] **v2 Fase B — Baús e raridades**: ~2 baús por ilha neutra (comum/raro/épico/lendário) com guardiões que só deixam abrir depois de derrotados; criaturas com raridade (mais vida, dano, XP e itens); baú aberto reaparece em outro lugar
- [ ] v2 Fases C–E — baús com guardiões e raridades, saque e defesa, bots rivais, temporada

## Créditos
Arte: [Ninja Adventure Asset Pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack), por Pixel-boy e AAA — licença CC0 (`public/ninja/LICENSE.txt`).
Só os arquivos usados estão em `public/ninja/` (~424 KB); o mapeamento de recortes fica em `src/render/assets.ts`.
