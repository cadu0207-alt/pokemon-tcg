/**
 * A* em grade, 4 direções. `andavel` diz se um tile pode ser pisado.
 * Se `alvoAdjacente` for true, basta chegar num vizinho do destino (ex.: para bater numa árvore).
 * Retorna a lista de tiles do caminho (sem a origem) ou null.
 */
export function acharCaminho(
  ox: number, oy: number, dx: number, dy: number,
  andavel: (x: number, y: number) => boolean,
  { alvoAdjacente = false, maxNos = 3000 } = {},
): [number, number][] | null {
  const chave = (x: number, y: number) => (y << 16) | (x & 0xffff);
  const chegou = (x: number, y: number) =>
    alvoAdjacente ? Math.abs(x - dx) + Math.abs(y - dy) === 1 : x === dx && y === dy;
  if (chegou(ox, oy)) return [];
  const h = (x: number, y: number) => Math.abs(x - dx) + Math.abs(y - dy);
  const aberto: { x: number; y: number; g: number; f: number }[] = [{ x: ox, y: oy, g: 0, f: h(ox, oy) }];
  const veio = new Map<number, number>();
  const custo = new Map<number, number>([[chave(ox, oy), 0]]);
  let nos = 0;
  while (aberto.length && nos++ < maxNos) {
    // fila de prioridade simples: as áreas são pequenas (uma ilha)
    let mi = 0;
    for (let i = 1; i < aberto.length; i++) if (aberto[i].f < aberto[mi].f) mi = i;
    const atual = aberto.splice(mi, 1)[0];
    if (chegou(atual.x, atual.y)) {
      const caminho: [number, number][] = [];
      let k = chave(atual.x, atual.y);
      while (k !== chave(ox, oy)) {
        caminho.push([k & 0xffff, k >> 16]);
        k = veio.get(k)!;
      }
      return caminho.reverse();
    }
    for (const [vx, vy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = atual.x + vx, ny = atual.y + vy;
      if (!andavel(nx, ny)) continue;
      const g = atual.g + 1, k = chave(nx, ny);
      if (g < (custo.get(k) ?? Infinity)) {
        custo.set(k, g); veio.set(k, chave(atual.x, atual.y));
        aberto.push({ x: nx, y: ny, g, f: g + h(nx, ny) });
      }
    }
  }
  return null;
}
