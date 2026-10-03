#!/usr/bin/env node
/**
 * build_mosaic_sprite.js — gera mosaic-sprite.webp, o sprite do mosaico de fundo
 * da tela do app (#app-mosaic no index.html).
 *
 * POR QUÊ: o mosaico antigo baixava ~184 PNGs de carta (~51 KB cada ≈ 9,2 MB) do
 * scrydex só pra desenhar cartinhas de 32x44 px atrás de um overlay 90% opaco.
 * Agora é UMA imagem WebP de baixa qualidade (dezenas de KB), gerada aqui.
 *
 * Uso (precisa do pacote "sharp", instale fora do repo):
 *   mkdir %TEMP%\sprite && cd %TEMP%\sprite && npm init -y && npm i sharp
 *   node C:\caminho\do\repo\scripts\build_mosaic_sprite.js [saida.webp]
 *
 * Grade: COLS x ROWS tiles de TILE_W x TILE_H px (1,5x o tamanho exibido, 32x44).
 * O índice do tile (i) → coluna i % COLS, linha floor(i / COLS). O index.html usa
 * as mesmas constantes (SPRITE_COLS/SPRITE_TILES) — se mudar aqui, mude lá.
 */
const fs = require('fs');
const path = require('path');
let sharp;
try { sharp = require('sharp'); } catch (e) {
  console.error('Falta o pacote "sharp" (npm i sharp, numa pasta temporária).'); process.exit(1);
}

const TILE_W = 48, TILE_H = 66, COLS = 12, ROWS = 6; // 72 cartas
const QUALITY = Number(process.env.SPRITE_QUALITY || 38);
const OUT = process.argv[2] || path.join(__dirname, '..', 'mosaic-sprite.webp');

// mesmos sets/faixas que o mosaico usava
const POOLS = [['me4', 1, 122], ['me3', 1, 120], ['me2', 1, 130]];

// sorteio determinístico (mesma grade toda vez que rodar)
let seed = 20261003;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const per = (COLS * ROWS) / POOLS.length;
const ids = [];
for (const [s, a, b] of POOLS) {
  const pool = [];
  for (let n = a; n <= b; n++) pool.push(`${s}-${n}`);
  ids.push(...shuffle(pool).slice(0, per));
}
shuffle(ids);

async function fetchTile(id) {
  const res = await fetch(`https://images.scrydex.com/pokemon/${id}/small`);
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf).resize(TILE_W, TILE_H, { fit: 'cover' }).toBuffer();
}

(async () => {
  const tiles = [];
  // lotes de 8 em paralelo
  for (let i = 0; i < ids.length; i += 8) {
    const part = await Promise.all(ids.slice(i, i + 8).map(async (id) => {
      try { return await fetchTile(id); } catch (e) { console.warn('pulou', e.message); return null; }
    }));
    tiles.push(...part);
  }
  const ok = tiles.filter(Boolean).length;
  if (ok < ids.length * 0.9) throw new Error(`Só ${ok}/${ids.length} cartas baixaram — abortando.`);

  const composites = [];
  tiles.forEach((buf, i) => {
    if (buf) composites.push({ input: buf, left: (i % COLS) * TILE_W, top: Math.floor(i / COLS) * TILE_H });
  });
  const out = await sharp({ create: { width: COLS * TILE_W, height: ROWS * TILE_H, channels: 3, background: '#e8eaf2' } })
    .composite(composites)
    .webp({ quality: QUALITY, effort: 6 })
    .toBuffer();
  fs.writeFileSync(OUT, out);
  console.log(`ok: ${OUT} — ${(out.length / 1024).toFixed(1)} KB, ${ok}/${ids.length} cartas, grade ${COLS}x${ROWS} de ${TILE_W}x${TILE_H}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
