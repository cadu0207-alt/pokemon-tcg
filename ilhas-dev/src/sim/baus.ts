import { adicionar, cabe, qtd, type Inventario } from './inventario';
import type { ItemId } from './itens';
import { criarRng } from './rng';
import { TILE_ANDAVEL, type Mundo } from './mundo';
import type { TipoCriatura } from './criaturas';

export type Raridade = 'comum' | 'raro' | 'epico' | 'lendario';

export const RARIDADES: Record<Raridade, { nome: string; peso: number; cor: number; corCss: string }> = {
  comum: { nome: 'Comum', peso: 55, cor: 0xffffff, corCss: '#f6efe0' },
  raro: { nome: 'Raro', peso: 28, cor: 0x7fc4ff, corCss: '#7fc4ff' },
  epico: { nome: 'Épico', peso: 13, cor: 0xc39bff, corCss: '#c39bff' },
  lendario: { nome: 'Lendário', peso: 4, cor: 0xffd166, corCss: '#ffd166' },
};

/** Conteúdo possível: [item, mínimo, máximo, chance]. */
const TABELAS: Record<Raridade, [ItemId, number, number, number][]> = {
  comum: [['madeira', 4, 8, 1], ['pedra', 2, 5, 1], ['fibra', 3, 6, 0.8], ['baga', 2, 4, 0.7], ['carne', 1, 2, 0.4], ['corda', 1, 2, 0.4]],
  raro: [['minerio', 2, 4, 1], ['couro', 1, 3, 0.8], ['corda', 2, 3, 0.7], ['cristal', 1, 1, 0.5], ['machado_pedra', 1, 1, 0.25], ['picareta_pedra', 1, 1, 0.25]],
  epico: [['cristal', 2, 3, 1], ['lingote', 1, 3, 0.9], ['minerio', 3, 5, 0.7], ['pocao_mana', 1, 2, 0.5], ['espada_pedra', 1, 1, 0.3], ['carne_assada', 2, 3, 0.5]],
  lendario: [['cristal', 4, 6, 1], ['lingote', 3, 5, 1], ['espada_ferro', 1, 1, 0.5], ['picareta_ferro', 1, 1, 0.5], ['pocao_mana', 2, 3, 0.7]],
};

/** Guardiões por raridade: tipos possíveis, quantidade e raridade das próprias criaturas. */
export const GUARDIOES: Record<Raridade, { tipos: TipoCriatura[]; qtd: [number, number]; raridade: Raridade }> = {
  comum: { tipos: ['javali', 'slime'], qtd: [1, 2], raridade: 'comum' },
  raro: { tipos: ['javali', 'slime'], qtd: [2, 3], raridade: 'raro' },
  epico: { tipos: ['slime', 'lobo', 'javali'], qtd: [3, 4], raridade: 'raro' },
  lendario: { tipos: ['lobo', 'lobo', 'javali'], qtd: [3, 4], raridade: 'epico' },
};

export interface Bau {
  id: number; x: number; y: number; ilha: number; raridade: Raridade;
  conteudo: Inventario;
  /** guardiões já foram criados (nascem quando alguém chega perto) e quantos restam */
  guardioes: number; guardioesCriados: boolean;
  aberto: boolean;
}

export const REAPARECE_MS = 300_000; // baú aberto volta em outro lugar depois de 5 min

function sortearRaridade(rng: () => number): Raridade {
  let r = rng() * 100;
  for (const [k, v] of Object.entries(RARIDADES) as [Raridade, { peso: number }][]) { if ((r -= v.peso) <= 0) return k; }
  return 'comum';
}

export function gerarConteudo(raridade: Raridade, rng: () => number): Inventario {
  const inv: Inventario = { itens: {}, durabilidade: {} };
  for (const [id, min, max, chance] of TABELAS[raridade]) {
    if (rng() > chance) continue;
    adicionar(inv, id, min + Math.floor(rng() * (max - min + 1)));
  }
  return inv;
}

/** Ponto aleatório de terra livre numa ilha neutra. */
function lugarLivre(m: Mundo, ocupado: (x: number, y: number) => boolean, rng: () => number): { x: number; y: number; ilha: number } | null {
  const neutras = m.ilhas.filter(i => i.dono === null);
  for (let t = 0; t < 60 && neutras.length; t++) {
    const ilha = neutras[Math.floor(rng() * neutras.length)];
    const a = rng() * Math.PI * 2, d = rng() * ilha.raio * 0.75;
    const x = Math.floor(ilha.cx + Math.cos(a) * d), y = Math.floor(ilha.cy + Math.sin(a) * d);
    if (x < 1 || y < 1 || x >= m.largura - 1 || y >= m.altura - 1) continue;
    if (!TILE_ANDAVEL[m.tiles[y * m.largura + x] as 0] || ocupado(x, y)) continue;
    return { x, y, ilha: ilha.id };
  }
  return null;
}

export function novoBau(id: number, m: Mundo, ocupado: (x: number, y: number) => boolean, rng: () => number): Bau | null {
  const p = lugarLivre(m, ocupado, rng);
  if (!p) return null;
  const raridade = sortearRaridade(rng);
  return { id, ...p, raridade, conteudo: gerarConteudo(raridade, rng), guardioes: 0, guardioesCriados: false, aberto: false };
}

/** Cerca de 2 baús por ilha neutra no começo. */
export function gerarBaus(m: Mundo, seed: number, ocupado: (x: number, y: number) => boolean): Bau[] {
  const rng = criarRng(seed ^ 0xba05);
  const n = m.ilhas.filter(i => i.dono === null).length * 2;
  const baus: Bau[] = [];
  const usados = new Set<number>();
  for (let i = 0; i < n; i++) {
    const b = novoBau(i, m, (x, y) => ocupado(x, y) || usados.has(y * m.largura + x), rng);
    if (b) { baus.push(b); usados.add(b.y * m.largura + b.x); }
  }
  return baus;
}

/**
 * Abre o baú (se os guardiões foram derrotados) e passa o que couber na mochila.
 * O que não couber fica no baú. Retorna o que foi pego, ou o motivo de não abrir.
 */
export function abrirBau(b: Bau, mochila: Inventario): { pegou: Partial<Record<ItemId, number>> } | { motivo: 'guardioes' | 'vazio' } {
  if (b.aberto) return { motivo: 'vazio' };
  if (!b.guardioesCriados || b.guardioes > 0) return { motivo: 'guardioes' };
  const pegou: Partial<Record<ItemId, number>> = {};
  for (const id of Object.keys(b.conteudo.itens) as ItemId[]) {
    if (!cabe(mochila, [id])) continue;
    const n = qtd(b.conteudo, id);
    adicionar(mochila, id, n);
    pegou[id] = n;
    delete b.conteudo.itens[id];
  }
  if (!Object.keys(b.conteudo.itens).length) b.aberto = true;
  return { pegou };
}
