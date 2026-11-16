import { DEF_RECURSO, ITENS, type ItemId } from './itens';
import { adicionar, desgastar, qtd, type Inventario } from './inventario';
import type { Mundo, Recurso } from './mundo';

export interface EstadoRecursos {
  /** índice do tile -> recurso */
  porTile: Map<number, Recurso>;
  vida: Map<number, number>;          // id -> vida atual
  renasce: Map<number, number>;       // id -> instante (ms) em que volta
}

export function iniciarRecursos(m: Mundo): EstadoRecursos {
  const porTile = new Map<number, Recurso>();
  const vida = new Map<number, number>();
  for (const r of m.recursos) {
    porTile.set(r.y * m.largura + r.x, r);
    vida.set(r.id, DEF_RECURSO[r.tipo].vida);
  }
  return { porTile, vida, renasce: new Map() };
}

export const recursoAtivo = (e: EstadoRecursos, r: Recurso) => !e.renasce.has(r.id);

/** Melhor ferramenta do inventário para aquele tipo de recurso (ou mão nua). */
export function ferramentaPara(inv: Inventario, tipo: Recurso['tipo']): { id: ItemId | null; dano: number } {
  let melhor: { id: ItemId | null; dano: number } = { id: null, dano: 1 };
  for (const id of Object.keys(inv.itens) as ItemId[]) {
    const f = ITENS[id].ferramenta;
    if (f && f.alvo === tipo && qtd(inv, id) > 0 && f.dano > melhor.dano) melhor = { id, dano: f.dano };
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
export function golpear(e: EstadoRecursos, inv: Inventario, r: Recurso, agora: number): ResultadoGolpe | null {
  if (!recursoAtivo(e, r)) return null;
  const f = ferramentaPara(inv, r.tipo);
  const vida = (e.vida.get(r.id) ?? 0) - f.dano;
  const ferramentaQuebrou = f.id ? desgastar(inv, f.id) : false;
  if (vida > 0) {
    e.vida.set(r.id, vida);
    return { dano: f.dano, destruido: false, ganhos: {}, ferramenta: f.id, ferramentaQuebrou };
  }
  const def = DEF_RECURSO[r.tipo];
  for (const [id, n] of Object.entries(def.solta)) adicionar(inv, id as ItemId, n ?? 0);
  e.renasce.set(r.id, agora + def.renasceMs);
  return { dano: f.dano, destruido: true, ganhos: { ...def.solta }, ferramenta: f.id, ferramentaQuebrou };
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
