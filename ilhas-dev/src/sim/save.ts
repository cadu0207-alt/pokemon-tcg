import type { Construcao } from './construcao';
import type { Inventario } from './inventario';

export const VERSAO_SAVE = 1;

export interface Save {
  versao: number; seed: number; participantes: number;
  jogador: { x: number; y: number };
  inventario: Inventario;
  construcoes: Construcao[];
}

export function serializar(s: Omit<Save, 'versao'>): string {
  return JSON.stringify({ versao: VERSAO_SAVE, ...s });
}

/** Retorna null se o texto for inválido ou de outra versão/mundo. */
export function carregar(texto: string | null, seed: number, participantes: number): Save | null {
  if (!texto) return null;
  try {
    const s = JSON.parse(texto) as Save;
    if (s.versao !== VERSAO_SAVE || s.seed !== seed || s.participantes !== participantes) return null;
    if (!s.inventario?.itens || !Array.isArray(s.construcoes)) return null;
    return s;
  } catch { return null; }
}
