import type { Construcao } from './construcao';
import type { Status } from './criaturas';
import type { Inventario } from './inventario';
import type { ItemId } from './itens';

export interface EstadoTutorial {
  inv: Inventario; construcoes: Construcao[]; status: Status; habilidades: string[];
  /** contadores de eventos que não ficam no inventário */
  criados: Partial<Record<ItemId, number>>; mortos: number;
  /** nível de expansão da ilha e se já pisou em outra ilha */
  nivel?: number; visitouOutra?: boolean;
}

export interface Missao { titulo: string; dica: string; feita: (e: EstadoTutorial) => boolean; }

const tem = (e: EstadoTutorial, id: ItemId, n = 1) => (e.inv.itens[id] ?? 0) >= n;
const criou = (e: EstadoTutorial, id: ItemId) => (e.criados[id] ?? 0) > 0;
const construiu = (e: EstadoTutorial, id: ItemId) => e.construcoes.some(c => c.tipo === id);

/** Missões curtas que ensinam o jogo em ordem; cada uma termina sozinha quando a condição é cumprida. */
export const MISSOES: Missao[] = [
  { titulo: 'Faça cordas', dica: 'Sua ilha é pequena e pobre. Abra Criar (C) e faça 2 Cordas com a fibra que você trouxe.', feita: e => (e.criados.corda ?? 0) >= 2 || criou(e, 'jangada') || tem(e, 'jangada') },
  { titulo: 'Construa a jangada', dica: 'Crie a Jangada: com ela você atravessa o mar.', feita: e => criou(e, 'jangada') || tem(e, 'jangada') },
  { titulo: 'Explore outra ilha', dica: 'Ande até a água e navegue até uma ilha vizinha. Cuidado: sua ilha fica desprotegida.', feita: e => !!e.visitouOutra },
  { titulo: 'Consiga um cristal', dica: 'Rochas com cristais roxos ficam nas ilhas neutras. Quebre uma com Espaço/AÇÃO.', feita: e => tem(e, 'cristal') || (e.nivel ?? 1) >= 2 },
  { titulo: 'Acenda uma fogueira', dica: 'De volta em casa, crie uma Fogueira e construa. À noite ela afasta monstros.', feita: e => construiu(e, 'fogueira') },
  { titulo: 'Alimente o Cristal', dica: 'Encoste no Cristal do centro da ilha e expanda: a ilha cresce de verdade.', feita: e => (e.nivel ?? 1) >= 2 },
  { titulo: 'Enfrente uma criatura', dica: 'Guaxinins e javalis dão carne e couro. Ataque com Espaço/AÇÃO.', feita: e => e.mortos > 0 },
  { titulo: 'Aprenda uma habilidade', dica: 'Ao subir de nível você ganha pontos. Abra Habilidades (K).', feita: e => e.habilidades.length > 0 },
];

/** Índice da primeira missão não cumprida (MISSOES.length = tutorial completo). */
export function missaoAtual(e: EstadoTutorial, inicio = 0): number {
  let i = inicio;
  while (i < MISSOES.length && MISSOES[i].feita(e)) i++;
  return i;
}
