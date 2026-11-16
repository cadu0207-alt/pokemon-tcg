import { DEF_RECURSO, ITENS, type ItemId } from './itens';
import { adicionar, desgastar, qtd, type Inventario } from './inventario';
import type { Mundo, Recurso } from './mundo';

export interface EstadoRecursos {
  /** índice do tile -> recurso */
  porTile: Map<number, Recurso>;
  vida: Map<number, number>;          // id -> vida atual
  renasce: Map<number, number>;       // id -> instante (ms) em que volta
  /** Recursos em terra que ainda não apareceu (ilha pequena): índice do tile -> recurso. */
  submersos: Map<number, Recurso>;
}

export function iniciarRecursos(m: Mundo): EstadoRecursos {
  const porTile = new Map<number, Recurso>();
  const vida = new Map<number, number>();
  const submersos = new Map<number, Recurso>();
  for (const r of m.recursos) {
    const i = r.y * m.largura + r.x;
    if (m.tiles[i] <= 1) submersos.set(i, r); // água (ilha ainda pequena): acorda quando a terra crescer
    else porTile.set(i, r);
    vida.set(r.id, DEF_RECURSO[r.tipo].vida);
  }
  return { porTile, vida, renasce: new Map(), submersos };
}

export const recursoAtivo = (e: EstadoRecursos, r: Recurso) => !e.renasce.has(r.id);

/** Melhor ferramenta do inventário para aquele tipo de recurso (ou mão nua). */
export function ferramentaPara(inv: Inventario, tipo: Recurso['tipo'] | 'criatura'): { id: ItemId | null; dano: number } {
  let melhor: { id: ItemId | null; dano: number } = { id: null, dano: 1 };
  // minério e cristal se quebram com picareta
  const alvo = tipo === 'minerio' || tipo === 'cristal' ? 'pedra' : tipo;
  for (const id of Object.keys(inv.itens) as ItemId[]) {
    const f = ITENS[id].ferramenta;
    if (f && f.alvo === alvo && qtd(inv, id) > 0 && f.dano > melhor.dano) melhor = { id, dano: f.dano };
  }
  return melhor;
}

export interface ResultadoGolpe {
  dano: number;
  destruido: boolean;
  ganhos: Partial<Record<ItemId, number>>;
  ferramenta: ItemId | null;
  ferramentaQuebrou: boolean;
}

/** Um golpe num recurso. Pura em relação ao tempo: recebe `agora` em ms. */
/** `bonus`: dano extra (habilidades); `extra`: itens a mais ao destruir; `poupar`: chance de não gastar durabilidade. */
export function golpear(e: EstadoRecursos, inv: Inventario, r: Recurso, agora: number,
  { bonus = 0, extra = 0, poupar = 0, rng = Math.random } = {}): ResultadoGolpe | null {
  if (!recursoAtivo(e, r)) return null;
  const f = ferramentaPara(inv, r.tipo);
  const dano = f.dano + bonus;
  const vida = (e.vida.get(r.id) ?? 0) - dano;
  const ferramentaQuebrou = f.id && !(poupar > 0 && rng() < poupar) ? desgastar(inv, f.id) : false;
  if (vida > 0) {
    e.vida.set(r.id, vida);
    return { dano, destruido: false, ganhos: {}, ferramenta: f.id, ferramentaQuebrou };
  }
  const def = DEF_RECURSO[r.tipo];
  const ganhos: Partial<Record<ItemId, number>> = {};
  Object.entries(def.solta).forEach(([id, n], i) => (ganhos[id as ItemId] = (n ?? 0) + (i === 0 ? extra : 0)));
  for (const [id, n] of Object.entries(ganhos)) adicionar(inv, id as ItemId, n ?? 0);
  e.renasce.set(r.id, agora + def.renasceMs);
  return { dano, destruido: true, ganhos, ferramenta: f.id, ferramentaQuebrou };
}

/** Faz voltar os recursos cujo tempo já passou. Retorna os que voltaram. */
export function atualizarRecursos(e: EstadoRecursos, m: Mundo, agora: number): Recurso[] {
  const voltaram: Recurso[] = [];
  for (const [id, t] of e.renasce) {
    if (t <= agora) {
      e.renasce.delete(id);
      const r = m.recursos[id];
      e.vida.set(id, DEF_RECURSO[r.tipo].vida);
      voltaram.push(r);
    }
  }
  return voltaram;
}
