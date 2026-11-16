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
Parâmetros na URL: `?seed=123` muda o mundo, `?n=25` muda o número de participantes (padrão 100), `?bots=10` muda quantos bots jogam (padrão 99).

Controles no PC: WASD ou setas para andar, Espaço ou E para coletar, C para criar, clique num item construível da mochila e depois no mapa para construir (Esc cancela), roda do mouse para zoom.

No celular: joystick à esquerda, botão AÇÃO à direita, toque no item construível, toque no mapa e em ✔.

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
- [ ] Fase 6 — níveis 5–10 da ilha, árvore de habilidades e magia
