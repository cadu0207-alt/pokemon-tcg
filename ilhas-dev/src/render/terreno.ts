import { Tile, type Mundo } from '../sim/mundo';

/**
 * Pinta o chão de um pedaço do mapa com bordas orgânicas.
 * Cada pixel interpola o "peso" de cada tipo de terreno a partir dos 4 centros de tile mais próximos
 * e escolhe o maior (com um pouco de ruído). O resultado são costas arredondadas em vez de degraus.
 * A colisão continua por tile; só o desenho é suave.
 */
const T = 16;

// paletas: [base, detalhe1, detalhe2]
// cores amostradas do Ninja Adventure Asset Pack, para o chão combinar com os sprites
const COR: Record<number, [number, number, number]> = {
  [Tile.AguaFunda]: [0x4f9cc4, 0x5aa8cf, 0x4892b9],
  [Tile.Agua]: [0x71ddee, 0x79cfe6, 0x8fe6f2],
  [Tile.Areia]: [0xffcb8d, 0xf5bb7c, 0xffd8a4],
  [Tile.Grama]: [0xadbc3a, 0x9fb034, 0xbcc94c],
  [Tile.Floresta]: [0x74a334, 0x68952e, 0x82b03c],
  [Tile.Rocha]: [0x90775e, 0x816855, 0xa3896e],
};
const ESPUMA = 0xd4f5fa, BORDA_AREIA = 0xffad5d, BORDA_GRAMA = 0x8e9c2c;

// ruído determinístico barato por pixel
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function pintarPedaco(m: Mundo, px0: number, py0: number, tamanho: number): ImageData {
  const W = tamanho * T;
  const img = new ImageData(W, W);
  const d = img.data;
  const tile = (x: number, y: number) =>
    x < 0 || y < 0 || x >= m.largura || y >= m.altura ? Tile.AguaFunda : (m.tiles[y * m.largura + x] as Tile);
  const pesos = new Float32Array(6);
  const tipoEm = new Uint8Array(W * W);

  // Caminho rápido: tile cercado (3×3) pelo mesmo tipo não tem borda, preenche direto.
  for (let ty = 0; ty < tamanho; ty++) for (let tx = 0; tx < tamanho; tx++) {
    const gx0 = px0 * tamanho + tx, gy0 = py0 * tamanho + ty;
    const k0 = tile(gx0, gy0);
    let uniforme = true;
    for (let dy = -1; dy <= 1 && uniforme; dy++) for (let dx = -1; dx <= 1; dx++) if (tile(gx0 + dx, gy0 + dy) !== k0) { uniforme = false; break; }
    for (let y = 0; y < T; y++) {
      const py = ty * T + y, gy = py0 * W + py;
      const fy = (gy + 0.5) / T - 0.5, iy = Math.floor(fy), ay = fy - iy;
      for (let x = 0; x < T; x++) {
        const px = tx * T + x;
        if (uniforme) { tipoEm[py * W + px] = k0; continue; }
        const gx = px0 * W + px;
        const fx = (gx + 0.5) / T - 0.5, ix = Math.floor(fx), ax = fx - ix;
        pesos.fill(0);
        pesos[tile(ix, iy)] += (1 - ax) * (1 - ay);
        pesos[tile(ix + 1, iy)] += ax * (1 - ay);
        pesos[tile(ix, iy + 1)] += (1 - ax) * ay;
        pesos[tile(ix + 1, iy + 1)] += ax * ay;
        const r = hash(gx >> 1, gy >> 1) * 0.22; // ruído em blocos de 2 px: borda com cara de pixel art
        let melhor = 0, bv = -1;
        for (let k = 0; k < 6; k++) { const v = pesos[k] + (k === Tile.Areia || k === Tile.Grama ? r : 0); if (v > bv) { bv = v; melhor = k; } }
        tipoEm[py * W + px] = melhor;
      }
    }
  }
  const ehAgua = (t: number) => t <= Tile.Agua; // AguaFunda = 0, Agua = 1
  const u32 = new Uint32Array(d.buffer);
  // ImageData é RGBA em memória; em little-endian o Uint32 fica 0xAABBGGRR
  const rgba = (c: number) => (0xff000000 | ((c & 255) << 16) | (c & 0xff00) | (c >> 16)) >>> 0;
  const PAL = Object.fromEntries(Object.entries(COR).map(([k, v]) => [k, v.map(rgba)])) as Record<number, number[]>;
  const C_ESPUMA = rgba(ESPUMA), C_AREIA = rgba(BORDA_AREIA), C_GRAMA = rgba(BORDA_GRAMA), C_ROCHA = rgba(0x6e6866);
  for (let py = 0; py < W; py++) {
    const gy = py0 * W + py, linha = py * W;
    for (let px = 0; px < W; px++) {
      const k = tipoEm[linha + px];
      const gx = px0 * W + px;
      const pal = PAL[k];
      const h = hash(gx, gy);
      let cor = h < 0.06 ? pal[1] : h > 0.96 ? pal[2] : pal[0];
      const cima = py > 0 ? tipoEm[linha - W + px] : k;
      const baixo = py < W - 1 ? tipoEm[linha + W + px] : k;
      if (ehAgua(k)) {
        const cima2 = py > 1 ? tipoEm[linha - 2 * W + px] : k;
        if (!ehAgua(cima) || (!ehAgua(cima2) && (h * 7) % 1 > 0.4)) cor = C_ESPUMA;           // espuma na praia
        else if (gy % 9 === 0 && hash(gx >> 3, gy) > 0.8) cor = pal[1];                         // ondinhas
      } else if (k === Tile.Areia) {
        const esq = px > 0 ? tipoEm[linha + px - 1] : k, dir = px < W - 1 ? tipoEm[linha + px + 1] : k;
        if (ehAgua(baixo) || ehAgua(esq) || ehAgua(dir)) cor = C_AREIA;
      } else if (k === Tile.Grama || k === Tile.Floresta) {
        if (baixo === Tile.Areia) cor = C_GRAMA;
        else if ((gx & 3) === 1 && (gy & 3) < 2 && hash(gx >> 2, gy >> 2) > 0.93) cor = pal[1];   // tufos
      } else if (k === Tile.Rocha && baixo !== Tile.Rocha) cor = C_ROCHA;
      u32[linha + px] = cor;
    }
  }
  return img;
}
