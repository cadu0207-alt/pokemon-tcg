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
  // fila de prioridade (heap binário) por f; entradas velhas são ignoradas ao sair
  type No = { x: number; y: number; g: number; f: number };
  const heap: No[] = [];
  const subir = (i: number) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const descer = (i: number) => {
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < heap.length && heap[l].f < heap[m].f) m = l;
      if (r < heap.length && heap[r].f < heap[m].f) m = r;
      if (m === i) return; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
    }
  };
  const por = (n: No) => { heap.push(n); subir(heap.length - 1); };
  const tirar = () => { const t = heap[0]; const u = heap.pop()!; if (heap.length) { heap[0] = u; descer(0); } return t; };
  por({ x: ox, y: oy, g: 0, f: h(ox, oy) });
  const veio = new Map<number, number>();
  const custo = new Map<number, number>([[chave(ox, oy), 0]]);
  let nos = 0;
  while (heap.length && nos < maxNos) {
    const atual = tirar();
    if (atual.g > (custo.get(chave(atual.x, atual.y)) ?? Infinity)) continue; // entrada velha
    nos++;
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
        por({ x: nx, y: ny, g, f: g + h(nx, ny) });
      }
    }
  }
  return null;
}
