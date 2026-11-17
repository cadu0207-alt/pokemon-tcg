import type { Construcao } from './construcao';
import { adicionar, qtd, remover, type Inventario } from './inventario';
import type { ItemId } from './itens';

/**
 * Saque de ilhas desprotegidas. A força do invasor cresce com o nível da ilha (mais rica, mais
 * cobiçada); a defesa vem das construções. Se a defesa perder, o invasor leva parte do baú
 * e drena a energia do Cristal. Energia zerada = a ilha perde um nível (ver CenaJogo/expansão).
 */

export const PESO_DEFESA: Partial<Record<ItemId, number>> = { torre: 14, cerca: 2, fogueira: 3, casa: 3, estatua: 6 };

export const defesa = (construcoes: Construcao[]) =>
  construcoes.reduce((t, c) => t + (PESO_DEFESA[c.tipo] ?? 0), 0);

/** Força de um invasor contra uma ilha deste nível (com um sorteio de ±30%). */
export const forcaInvasor = (nivel: number, rng: () => number) => (8 + nivel * 6) * (0.7 + rng() * 0.6);

/** Chance de uma tentativa de saque a cada checagem (20 s) com o dono fora de casa. */
export const chanceDeSaque = (nivel: number) => Math.min(0.35, 0.08 + nivel * 0.025);

export interface ResultadoSaque {
  repelido: boolean; forca: number; defesa: number;
  roubado: Partial<Record<ItemId, number>>;
  energiaPerdida: number;
}

/** Resolve um ataque: retorna o que foi levado do armazém e a energia perdida (já aplicados). */
export function resolverSaque(nivel: number, construcoes: Construcao[], armazem: Inventario, rng: () => number): ResultadoSaque {
  const f = forcaInvasor(nivel, rng), d = defesa(construcoes);
  if (d >= f) return { repelido: true, forca: f, defesa: d, roubado: {}, energiaPerdida: 0 };
  // quanto mais a força supera a defesa, mais leva (25% a 50% de até 4 pilhas)
  const vantagem = Math.min(1, (f - d) / f);
  const fracao = 0.25 + 0.25 * vantagem;
  const roubado: Partial<Record<ItemId, number>> = {};
  const pilhas = (Object.keys(armazem.itens) as ItemId[]).sort(() => rng() - 0.5).slice(0, 4);
  for (const id of pilhas) {
    const n = Math.ceil(qtd(armazem, id) * fracao);
    if (n > 0 && remover(armazem, id, n)) roubado[id] = n;
  }
  return { repelido: false, forca: f, defesa: d, roubado, energiaPerdida: Math.round(20 + 25 * vantagem) };
}

/** Recarga do Cristal: o que cada item dá de energia. */
export const ENERGIA_POR_ITEM: Partial<Record<ItemId, number>> = { cristal: 50, gosma: 10 };

// ---------- Morte e túmulo ----------

export interface Tumulo { x: number; y: number; itens: Inventario; }

/** Na morte, metade de cada pilha cai no túmulo (a jangada nunca: sem ela não dá para voltar). */
export function criarTumulo(mochila: Inventario, x: number, y: number): Tumulo | null {
  const itens: Inventario = { itens: {}, durabilidade: {} };
  for (const id of Object.keys(mochila.itens) as ItemId[]) {
    if (id === 'jangada') continue;
    const n = Math.ceil(qtd(mochila, id) / 2);
    const dur = mochila.durabilidade[id];
    if (n > 0 && remover(mochila, id, n)) { adicionar(itens, id, n); if (dur !== undefined) itens.durabilidade[id] = dur; }
  }
  return Object.keys(itens.itens).length ? { x, y, itens } : null;
}
