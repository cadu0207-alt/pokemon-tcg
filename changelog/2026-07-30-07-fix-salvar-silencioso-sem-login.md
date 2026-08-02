---
title: 🐛 Marcar carta parecia salvar mas falhava em silêncio
---
Se a sessão de login ainda não tivesse carregado (ou expirasse) no momento do clique, marcar uma carta fechava o modal normalmente — parecia ter salvo, mas nada era gravado, e a marcação sumia ao recarregar. Agora aparece um aviso pedindo pra fazer login de novo, em vez de falhar em silêncio.
