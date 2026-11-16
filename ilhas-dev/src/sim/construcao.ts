import type { ItemId } from './itens';
import { tileEm, TILE_ANDAVEL, type Ilha, type Mundo } from './mundo';

export interface Construcao { tipo: ItemId; x: number; y: number; }

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
export const NIVEIS: { nivel: number; requer: Partial<Record<ItemId, number>>; recompensa: string }[] = [
  { nivel: 2, requer: { fogueira: 1, bancada: 1 }, recompensa: 'libera cerca, baú e casa' },
  { nivel: 3, requer: { fogueira: 1, bancada: 1, bau: 1, casa: 1 }, recompensa: 'próximas fases: forja e altar' },
  { nivel: 4, requer: { fogueira: 2, bancada: 1, bau: 2, casa: 1, cerca: 12 }, recompensa: 'em breve' },
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
