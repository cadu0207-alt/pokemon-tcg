/** Desenha sprites a partir de "mapas de caracteres" + paleta. Placeholder até a arte final. */
export type Paleta = Record<string, string>;

export function desenhar(ctx: CanvasRenderingContext2D, linhas: string[], paleta: Paleta, ox = 0, oy = 0) {
  linhas.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      const cor = paleta[c];
      if (!cor) return;
      ctx.fillStyle = cor;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    });
  });
}

/** Paleta pastel do jogo. */
export const COR = {
  aguaFunda: '#3b6ea8', agua: '#5fa3d9', espuma: '#a8d8f0',
  areia: '#f1dca7', areiaEsc: '#d9bf83',
  grama: '#8fd27a', gramaEsc: '#6db35c', gramaClara: '#b2e69a',
  floresta: '#5e9e57', florestaEsc: '#447a43',
  rocha: '#a39e9b', rochaEsc: '#7c7674',
  tronco: '#8a5a3c', copa: '#4f9a4a', copaClara: '#79c46a',
  pedra: '#b9b4b0', pedraEsc: '#8d8784',
  baga: '#e06a8c',
  pele: '#ffe0c8', cabelo: '#ff8fb1', cabeloEsc: '#d9668e', olho: '#2d2a4a',
  roupa: '#7aa7ff', roupaEsc: '#5a82d6', branco: '#ffffff', contorno: '#3a2f45',
};
