# Procedimento — Batch de Sets Legados (5 por hora)

Objetivo: importar os 125 sets de `scripts/legacy_queue.json` (2023 → 1999) para os
arquivos `legacy_<era>.js`, com cartas, raridades e preços (TCGplayer market USD → BRL).

## Restrições conhecidas
- O sandbox NÃO acessa api.pokemontcg.io (proxy bloqueia; curl/python inúteis).
- Caminho que funciona: **Claude in Chrome** → `javascript_tool` com `fetch()` na página
  (usar uma aba em https://example.com). CORS liberado pela API.
- O retorno do javascript_tool trunca em ~1.100 caracteres → guardar o resultado em
  `window._set` e puxar em fatias de 1.000: `window._set.slice(i,i+1000)`.
- NUNCA usar Edit/Write nos arquivos do repo (truncam!) — só python via bash / cat >>.

## Passo a passo por batch
1. Ler `scripts/legacy_queue.json`, pegar os 5 primeiros com status `pending`.
2. Câmbio (1x por batch, no Chrome): `(await (await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL')).json()).rates.BRL`
3. Para cada set (id, printed): rodar no Chrome:
```js
const id='<SETID>';let all=[],page=1;
while(true){const r=await fetch(`https://api.pokemontcg.io/v2/cards?q=set.id:${id}&pageSize=250&page=${page}&select=number,name,rarity,tcgplayer`);
const d=await r.json();all=all.concat(d.data);if(all.length>=d.totalCount||!d.data.length)break;page++;}
const RAR={'Common':'C','Uncommon':'U','Rare':'R','Rare Holo':'RH','Rare Ultra':'UR','Rare Secret':'SEC','Rare Rainbow':'RB','Rare Shiny':'SH','Rare Shiny GX':'SHG','Amazing Rare':'AZ','Radiant Rare':'RAD','Trainer Gallery Rare Holo':'TG','Illustration Rare':'IR','Special Illustration Rare':'SIR','Rare Holo EX':'REX','Rare Holo GX':'RGX','Rare Holo V':'RV','Rare Holo VMAX':'RVM','Rare Holo VSTAR':'RVS','Rare BREAK':'BRK','Rare Prism Star':'PRS','Rare Holo Star':'STAR','Rare Prime':'PRI','Rare ACE':'ACE','LEGEND':'LEG','Promo':'P','Classic Collection':'CC','Double Rare':'DR','Hyper Rare':'HR'};
const pick=t=>{const p=t?.prices||{};let b=0;for(const k in p){const m=p[k]?.market||p[k]?.mid||0;if(m>b)b=m;}return b;};
window._set=all.map(c=>[c.number,c.name.replace(/[;|]/g,','),RAR[c.rarity]||c.rarity||'',pick(c.tcgplayer).toFixed(2)].join(';')).join('|');
'len='+window._set.length+' cards='+all.length
```
4. Puxar fatias e concatenar no sandbox (arquivo temp).
5. Rodar `python3 scripts/build_legacy_set.py <id> <arquivo_tmp> <usd_brl>` — ele monta a
   entrada e faz append no `legacy_<era>.js` correto + `node --check`.
6. Marcar `status:"done"` no queue (python). Em erro → `status:"erro"` e seguir.
7. Ao final do batch: informar Eduardo do progresso (X/125). O push é manual dele.

## Encerramento
Às 05:00 de 02/07/2026 (ou fila vazia): parar, gerar resumo (sets ok/erro, cartas totais,
tamanho dos arquivos) e pedir avaliação do Eduardo antes de continuar.
