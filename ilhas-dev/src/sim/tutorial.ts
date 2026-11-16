import type { Construcao } from './construcao';
import { nivelIlha } from './construcao';
import type { Status } from './criaturas';
import type { Inventario } from './inventario';
import type { ItemId } from './itens';

export interface EstadoTutorial {
  inv: Inventario; construcoes: Construcao[]; status: Status; habilidades: string[];
  /** contadores de eventos que não ficam no inventário */
  criados: Partial<Record<ItemId, number>>; mortos: number;
}

export interface Missao { titulo: string; dica: string; feita: (e: EstadoTutorial) => boolean; }

const tem = (e: EstadoTutorial, id: ItemId, n = 1) => (e.inv.itens[id] ?? 0) >= n;
const criou = (e: EstadoTutorial, id: ItemId) => (e.criados[id] ?? 0) > 0;
const construiu = (e: EstadoTutorial, id: ItemId) => e.construcoes.some(c => c.tipo === id);

/** Missões curtas que ensinam o jogo em ordem; cada uma termina sozinha quando a condição é cumprida. */
export const MISSOES: Missao[] = [
  { titulo: 'Junte madeira', dica: 'Chegue perto de uma árvore e segure Espaço (ou AÇÃO). Junte 3 madeiras.', feita: e => tem(e, 'madeira', 3) || criou(e, 'machado_pedra') },
  { titulo: 'Junte fibra e pedra', dica: 'Arbustos dão fibra; pedras dão pedra. Junte 3 fibras e 2 pedras.', feita: e => (tem(e, 'fibra', 3) || criou(e, 'corda')) && (tem(e, 'pedra', 2) || criou(e, 'machado_pedra')) },
  { titulo: 'Faça uma corda', dica: 'Abra Criar (C) e faça uma Corda com 3 fibras.', feita: e => criou(e, 'corda') },
  { titulo: 'Faça um machado', dica: 'Machado de pedra: árvores caem 3× mais rápido.', feita: e => criou(e, 'machado_pedra') },
  { titulo: 'Acenda uma fogueira', dica: 'Crie uma Fogueira, toque nela na mochila e escolha o lugar. À noite ela afasta monstros.', feita: e => construiu(e, 'fogueira') },
  { titulo: 'Monte uma bancada', dica: 'Fogueira + bancada sobem sua ilha para o nível 2.', feita: e => nivelIlha(e.construcoes) >= 2 },
  { titulo: 'Enfrente uma criatura', dica: 'Coelhos e javalis dão carne e couro. Ataque com Espaço/AÇÃO.', feita: e => e.mortos > 0 },
  { titulo: 'Aprenda uma habilidade', dica: 'Ao subir de nível você ganha pontos. Abra Habilidades (K).', feita: e => e.habilidades.length > 0 },
  { titulo: 'Construa uma jangada', dica: 'Com ela você navega até ilhas neutras, ricas em minério e cristal.', feita: e => criou(e, 'jangada') || tem(e, 'jangada') },
];

/** Índice da primeira missão não cumprida (MISSOES.length = tutorial completo). */
export function missaoAtual(e: EstadoTutorial, inicio = 0): number {
  let i = inicio;
  while (i < MISSOES.length && MISSOES[i].feita(e)) i++;
  return i;
}
