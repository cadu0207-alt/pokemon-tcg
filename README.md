# MyDeck

Site de coleção e fichário de Pokémon TCG: **[mydecktcg.com.br](https://mydecktcg.com.br)**.

JavaScript puro (vanilla), sem framework e sem etapa de build. Banco de dados, login e funções de servidor ficam no Supabase.

## Como funciona o deploy

- O GitHub Pages publica o que está na raiz da branch **`Rotower`**. O domínio vem do arquivo `CNAME`.
- Não há ambiente de homologação: **cada push na `Rotower` vai direto para o site** (em poucos minutos).
- Teste antes de enviar e prefira commits pequenos, com mensagem clara.
- O `index.html` carrega os scripts por tags `<script>`, e **a ordem das tags importa**: vários arquivos complementam funções de `app.js` e `fichario_patch.js`.
- Por isso, **não mova nem renomeie arquivos sem combinar antes**: os caminhos são usados pelo `index.html`, pelo `sw.js`, pelos workflows e pelos scripts de apoio.

## Raiz: o prefixo do nome indica o módulo

Quase tudo fica na raiz, sem subpastas por módulo.

| Arquivo / prefixo | O que é |
|---|---|
| `index.html` | Página principal; carrega todos os scripts. |
| `app.js` | Núcleo: login, carga da coleção, abas, fichários personalizados, gravação das marcações. |
| `fichario_*.js` | Fichário: patch principal, Master Set Nacional/regionais (`masterdex`), favoritos, menus mobile e desktop. |
| `cards_*.js` | Catálogo de cartas, um arquivo por coleção. Variantes em japonês e chinês terminam em `_jp` e `_cn`. |
| `leilao*.js`, `leilao_*.sql` | Leilão. |
| `mk_*.js`, `mk.css` | Marketplace e loja Toybox. |
| `lojas*.js` | Lojas e ofertas rastreadas, cupons e alertas de preço. |
| `lorcana*.js`, `lorcana.html` | Seção de Lorcana. |
| `rifa.js`, `inicio*.js`, `notificacoes.js`, `wild_pokemon.js` | Rifa, página inicial, notificações e minigame. |
| `*.sql` | Migrações do banco, com a data no nome. São executadas manualmente no Supabase. |
| `sw.js`, `manifest.json`, `pwa_install.js` | Service worker e instalação como aplicativo (PWA). |
| `CNAME`, `robots.txt`, `sitemap.xml`, `llms.txt` | Domínio, SEO e indexação. |

## Pastas

| Pasta | Conteúdo |
|---|---|
| `assets/`, `img/` | Imagens do site (`assets/wild/` tem os sprites do minigame). |
| `data/` | Catálogos antigos de cartas. |
| `scripts/` | Scripts de apoio em Python e Node (importar coleções, sprites, histórico de preços). Não fazem parte do site. |
| `supabase/functions/` | Edge functions do Supabase (código que roda no servidor). |
| `.github/workflows/` | Rotinas automáticas: atualizar preços, snapshots diários de preço e de valor da coleção, publicar o changelog e checar a sintaxe dos `.js`. |
| `changelog/` | Uma nota por atualização do site. |
| `atacado_toybox/` | Catálogo e imagens do atacado da loja Toybox. |
| `rpg/`, `ancord/`, `meusinvestimentos/` | Aplicativos separados, publicados em `/rpg`, `/ancord` e `/meusinvestimentos`. |

## Banco de dados

Mudanças no banco entram como um arquivo `.sql` com a data no nome, aplicado manualmente no Supabase. O site não cria nem altera tabelas sozinho.

## Cuidados ao mexer no fichário

Teste todos os modos: fichário oficial, fichários personalizados, Master Set e impressão (PDF).

## O que não vai para o GitHub

Rascunhos e análises internas (`_claude_tmp/`, `_to_delete/`, `debug_screenshots/`, `ANALISE_*.md`, `LOG_ATUALIZACOES_*.md`) e o `.env` ficam só no computador, listados no `.gitignore`. **Chaves e senhas nunca entram no repositório.**
