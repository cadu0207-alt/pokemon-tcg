import type { Construcao } from './construcao';
import type { Inventario } from './inventario';
import type { Status } from './criaturas';

/** 2 = mundo v2 (ilhas que crescem pelo Cristal): saves antigos não servem mais. */
export const VERSAO_SAVE = 2;

export interface Save {
  versao: number; seed: number; participantes: number;
  jogador: { x: number; y: number };
  inventario: Inventario;
  construcoes: Construcao[];
  /** Opcionais: saves da fase 2 não têm. */
  status?: Status;
  tempo?: number;
  /** Estado compacto dos bots (fase 4). */
  bots?: { ilha?: number; x: number; y: number; inv: Inventario; construcoes: Construcao[]; status: Status; habilidades?: string[]; nivel?: number }[];
  habilidades?: string[];
  mana?: number;
  /** Nível de expansão da ilha do jogador. */
  nivel?: number;
  /** Itens guardados nos baús da ilha. */
  armazem?: Inventario;
  /** Baús do mundo (fase B). */
  bausMundo?: { baus: import('./baus').Bau[]; proximoId: number };
  energia?: number;
  diario?: string[];
  tumulo?: import('./saque').Tumulo | null;
  /** Itens largados no chão. */
  /** Névoa: células já vistas, bits em base64. */
  nevoa?: string;
  /** ms de jogo acumulados (escudo de novato) e quando foi salvo (resumo ao voltar) */
  tempoJogado?: number; salvoEm?: number;
  /** reinos (vassalos, imunidades, tributos) entre você e os bots */
  reinos?: import('./reinos').EstadoReinos;
  metas?: import('./metas').EstadoMetas;
  /** vingança pendente: quem saqueou, o que levou e até quando (tempo de jogo) */
  vinganca?: { ilha: number; nome: string; itens: Partial<Record<import('./itens').ItemId, number>>; ate: number } | null;
  /** rival da semana: chave ('Nome' de bot ou 'pessoa:Nome'), até quando vale (Date.now) e quem estava na frente */
  rival?: { chave: string; nome: string; ate: number; frente: boolean; defender?: boolean } | null;
  chao?: { x: number; y: number; itens: Inventario }[];
  tutorial?: { missao: number; criados: Partial<Record<import('./itens').ItemId, number>>; mortos: number; bausAbertos?: number };
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
