import type { ItemId } from './itens';
import { tileEm, TILE_ANDAVEL, type Ilha, type Mundo } from './mundo';

/** `plantadoEm`: tempo do mundo (ms) em que a plantação foi semeada; ausente = terra vazia. */
export interface Construcao { tipo: ItemId; x: number; y: number; plantadoEm?: number; }

/** Tiles que contam como "dentro" da ilha do jogador (área de construção). */
export function naIlha(ilha: Ilha, x: number, y: number) {
  return Math.hypot(x + 0.5 - ilha.cx, y + 0.5 - ilha.cy) <= ilha.raio * 1.35;
}

export type MotivoInvalido = 'fora_da_ilha' | 'terreno' | 'ocupado' | null;

export function validarLocal(
  m: Mundo, ilha: Ilha, construcoes: Construcao[], ocupadoPorRecurso: (x: number, y: number) => boolean,
  x: number, y: number,
): MotivoInvalido {
  if (!naIlha(ilha, x, y)) return 'fora_da_ilha';
  if (!TILE_ANDAVEL[tileEm(m, x, y)]) return 'terreno';
  if (ocupadoPorRecurso(x, y) || construcoes.some(c => c.x === x && c.y === y)) return 'ocupado';
  return null;
}

/** Requisitos para atingir cada nível (o índice 0 é o nível 2). */
/**
 * Construções exigidas para cada nível de expansão (acumulado). Enxuto de propósito: a ilha começa
 * minúscula e cresce aos poucos; o motor da evolução é alimentar o Cristal (ver expansao.ts).
 */
export const NIVEIS: { nivel: number; requer: Partial<Record<ItemId, number>>; recompensa: string }[] = [
  { nivel: 2, requer: { fogueira: 1 }, recompensa: 'libera baú, casa e cerca' },
  { nivel: 3, requer: { fogueira: 1, bancada: 1 }, recompensa: '' },
  { nivel: 4, requer: { fogueira: 1, bancada: 1, bau: 1, casa: 1 }, recompensa: 'libera a forja' },
  { nivel: 5, requer: { fogueira: 1, bancada: 1, bau: 1, casa: 1, cerca: 4 }, recompensa: 'libera ferro' },
  { nivel: 6, requer: { fogueira: 1, bancada: 1, bau: 1, casa: 1, cerca: 4, forja: 1 }, recompensa: 'libera o altar' },
  { nivel: 7, requer: { fogueira: 2, bancada: 1, bau: 1, casa: 2, cerca: 4, forja: 1 }, recompensa: 'libera o portal' },
  { nivel: 8, requer: { fogueira: 2, bancada: 1, bau: 1, casa: 2, cerca: 4, forja: 1, altar: 1 }, recompensa: '' },
  { nivel: 9, requer: { fogueira: 2, bancada: 1, bau: 2, casa: 2, cerca: 6, forja: 1, altar: 1, torre: 1 }, recompensa: 'libera a estátua' },
  { nivel: 10, requer: { fogueira: 2, bancada: 1, bau: 2, casa: 2, cerca: 8, forja: 1, altar: 1, torre: 1, estatua: 1 }, recompensa: 'ela vira lendária' },
];

export function contar(construcoes: Construcao[]) {
  const n: Partial<Record<ItemId, number>> = {};
  for (const c of construcoes) n[c.tipo] = (n[c.tipo] ?? 0) + 1;
  return n;
}

export function nivelIlha(construcoes: Construcao[]): number {
  const n = contar(construcoes);
  let nivel = 1;
  for (const req of NIVEIS) {
    if (Object.entries(req.requer).every(([id, q]) => (n[id as ItemId] ?? 0) >= (q ?? 0))) nivel = req.nivel;
    else break;
  }
  return nivel;
}

export function proximoNivel(construcoes: Construcao[]) {
  return NIVEIS.find(n => n.nivel === nivelIlha(construcoes) + 1) ?? null;
}
