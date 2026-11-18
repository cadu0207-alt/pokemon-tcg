# _ocultos — recursos escondidos do site (não apagados)

Escondidos em 18/11/2026 por decisão do Eduardo ("esconde por enquanto"). Nada daqui carrega no site.
Os dados dos usuários continuam intactos no Supabase (`purchases`, `pulled_cards`, `raffles`, `raffle_numbers`, `raffle_payments`, `raffle_rules_acceptance`).

## O que foi escondido
| Recurso | Onde está o código | Como estava no menu |
|---|---|---|
| **Rifas** | `rifa.js` (esta pasta) + `rifas_aba_e_modais.html` (aba e 4 modais que ficavam no `index.html`) | aba "Rifas" |
| **Gastos** | continua no `app.js` (`renderGastos`, `setGastosFilter`) e a aba `#gastos` continua no `index.html`, só sem botão | aba "Gastos" |
| **Leilão** (adormecido) | `leilao.js`, `leilao_participantes.js` e a aba `#leilao` continuam carregando, só sem botão de menu | aba "Leilão" |
| **Venda de Produtos** | continua no `app.js` (`renderCartas` etc.) e a aba `#cartas` continua no `index.html`, só sem botão | aba "Compra/Venda" |

Gastos e Venda de Produtos não foram movidos para cá porque o `app.js` e o Dashboard escrevem nos elementos dessas abas (cartas tiradas, total investido); tirar o HTML quebraria o carregamento.

## Como religar
1. Cole de volta os botões de `botoes_de_menu.html` nos mesmos 4 lugares do `index.html` (barra desktop `.tdesk`, `.tabs`, `.mnav`, folha `.msheet`).
2. Em `app.js`, tire `gastos`, `cartas` e `rifas` da constante `RETIRED_TABS` (é ela que manda links antigos e notificações para o Dashboard/Início).
3. Só para Rifas: devolva `rifa.js` para a raiz, volte o `<script defer src="rifa.js">` no `index.html` (depois do `leilao.js`) e cole `rifas_aba_e_modais.html` antes do bloco "MEU PERFIL".
4. No Dashboard, os KPIs de investimento deixaram de ser clicáveis (levavam a Gastos) e o passo 2/3 do "Como começar" saiu; ver o commit desta limpeza no git.

Leilão: para religar, cole os 3 botões `*-tab-leilao` de `botoes_de_menu.html`, tire `leilao` de `RETIRED_TABS` e devolva o `frete.js` (histórico do git, commit 854626a^) com `<script defer src="frete.js">` antes do `leilao.js`. O `frete.js` foi tirado do `index.html` porque o arquivo não existe mais (dava 404).

Backup do estado anterior: tag `backup-2026-11-18-pre-limpeza`.
