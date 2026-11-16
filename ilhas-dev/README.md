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
Parâmetros na URL: `?seed=123` muda o mundo, `?n=25` muda o número de participantes (padrão 100).

Controles: WASD ou setas para andar, Espaço ou E para coletar, C para criar itens, roda do mouse para zoom.

## Estrutura
- `src/sim/` — regras puras, sem Phaser (geração do mundo, RNG determinístico). Roda também em testes e, no futuro, em Web Worker/servidor.
- `src/render/` — cenas Phaser, texturas geradas em código (placeholder até a arte final).
- `tests/` — Vitest.

## Estado
- [x] Fase 0 — mapa procedural com arquipélago, câmera, personagem andando com colisão
- [x] Fase 1 — coleta (árvore, pedra, arbusto) com renascimento, inventário, 6 receitas, ferramentas com durabilidade
- [ ] Fase 2 — construção na ilha e salvar/carregar
