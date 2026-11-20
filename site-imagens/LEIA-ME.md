# site-imagens — onde ficam as imagens do site

Esta pasta é o **lugar único** das imagens do MyDeck (criada em 19/11/2026, pedido da Alice/André).
Regra: imagem nova ou trocada entra **aqui**, numa subpasta por uso, e o código aponta para `site-imagens/<subpasta>/<arquivo>`.
Para trocar uma imagem sem mexer no código, substitua o arquivo mantendo o **mesmo nome** (e o mesmo formato).

> A mudança está sendo feita **aos poucos** (uma subpasta por commit, testando). O que ainda não foi movido
> está na tabela abaixo com o endereço atual.

| Subpasta / arquivo | O que é | Onde aparece | Situação |
|---|---|---|---|
| `iniciantes/` (7 jpg) | infográficos da aba Iniciantes | `iniciantes.js` | **movido** |
| `colecoes/` (27 png, `<id da coleção>.png`) | selo de cada coleção (o código impresso na carta: DLR, CRI, MEG…), 38×23 px, vindo da Limitless (`s3.limitlesstcg.com/sets/en/<CÓDIGO>.png`) | fichário novo: início, lista e botão da coleção (`setIco()` em `fichario-novo.js`) | **novo** — coleção nova = baixar o selo e salvar com o id dela |
| `logo-mydeck.png/.webp`, `logo-mydeck-dark.png/.webp` | logotipo (claro/escuro) | topo do site (`index.html`), fichário novo e caixa de opiniões | ainda na raiz do repositório |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | ícones do app (PWA) | `manifest.json`, `sw.js`, `index.html` | ainda na raiz (o navegador procura por esses nomes) |
| `og-image.jpg` | imagem de compartilhamento (WhatsApp, redes) | `index.html` (meta tags) | ainda na raiz |
| `rayquaza-watermark-*.webp`, `mosaic-sprite.webp` | marca d'água e mosaico do fundo | `index.html` / `style.css` | ainda na raiz |
| `assets/wild/` (155 arquivos) | sprites e bolas do minigame | `wild_pokemon.js` | ainda em `assets/wild` |
| `ilhas/`, `ilhas-dev/`, `rpg/` | jogos/protótipos | páginas próprias | fora do escopo por enquanto |

## O que NÃO fica aqui
- **Imagens das cartas**: vêm da Limitless (`limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/...`), escolhidas por
  `getBinderImg()` em `app.js`. Para coleções antigas (SM, XY, BW…) ainda vêm de pokemontcg.io.
- **Imagens de notícias do Início**: endereço fixo dentro do texto da notícia (cadastradas no painel).
- **Prints de teste** (`debug_screenshots/`, `_claude_tmp/`): ficam fora do Git (`.gitignore`).

## Como combinar com a Alice
Antes de mexer nesta pasta ou nas referências (`index.html`, `sw.js`, `manifest.json`), avise: mover arquivo sem atualizar
a referência deixa imagem quebrada no ar (a publicação é imediata).
