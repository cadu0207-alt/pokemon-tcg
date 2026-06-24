# Pokémon TCG Dashboard — Megaevolução

Dashboard para rastrear coleção ME04, ME02 e MEG com master set tracker.

## Stack
- **Frontend:** HTML + CSS + JS vanilla (sem framework)
- **Banco:** Supabase (PostgreSQL na nuvem)
- **Imagens:** Scrydex (gratuito, CORS aberto)
- **Câmbio:** Frankfurter API (gratuito, sem chave)
- **Hospedagem:** GitHub Pages

## Setup do Banco (Supabase)

1. Acesse seu projeto no Supabase
2. Vá em **SQL Editor**
3. Cole o conteúdo de `supabase_setup.sql` e execute

## Deploy no GitHub Pages

1. Crie um repositório público no GitHub (ex: `pokemon-tcg`)
2. Faça upload de todos os arquivos desta pasta
3. Vá em **Settings → Pages**
4. Source: **Deploy from branch → main → / (root)**
5. Salve — em ~1 minuto o site estará em:
   `https://SEU_USUARIO.github.io/pokemon-tcg`

## Estrutura
```
/
├── index.html          # App principal
├── style.css           # Estilos
├── app.js              # Lógica + Supabase + APIs
├── supabase_setup.sql  # Setup do banco
├── README.md
└── data/
    ├── cards_me04.js   # 122 cartas ME04
    ├── cards_me02.js   # 130 cartas ME02
    └── cards_meg.js    # 188 cartas MEG
```

## Arquivos para subir no GitHub
Todos os arquivos acima — o GitHub Pages serve automaticamente o `index.html`.
