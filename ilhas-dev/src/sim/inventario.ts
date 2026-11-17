import { ITENS, type ItemId, type Receita } from './itens';

export interface Inventario {
  itens: Partial<Record<ItemId, number>>;
  /** Durabilidade restante de cada ferramenta possuída (uma de cada tipo por vez). */
  durabilidade: Partial<Record<ItemId, number>>;
}

export const novoInventario = (): Inventario => ({ itens: {}, durabilidade: {} });

export const qtd = (inv: Inventario, id: ItemId) => inv.itens[id] ?? 0;

export function adicionar(inv: Inventario, id: ItemId, n = 1) {
  inv.itens[id] = qtd(inv, id) + n;
  const f = ITENS[id].ferramenta;
  if (f && inv.durabilidade[id] === undefined) inv.durabilidade[id] = f.durabilidade;
}

export function remover(inv: Inventario, id: ItemId, n = 1): boolean {
  if (qtd(inv, id) < n) return false;
  inv.itens[id] = qtd(inv, id) - n;
  if (inv.itens[id] === 0) { delete inv.itens[id]; delete inv.durabilidade[id]; }
  return true;
}

export const podeCriar = (inv: Inventario, r: Receita, nivelIlha = 1) =>
  nivelIlha >= (r.nivel ?? 1) && Object.entries(r.custo).every(([id, n]) => qtd(inv, id as ItemId) >= (n ?? 0));

export function criar(inv: Inventario, r: Receita, nivelIlha = 1): boolean {
  if (!podeCriar(inv, r, nivelIlha)) return false;
  for (const [id, n] of Object.entries(r.custo)) remover(inv, id as ItemId, n ?? 0);
  adicionar(inv, r.id, r.qtd);
  return true;
}

/** Gasta 1 de durabilidade; quando acaba, a ferramenta quebra. Retorna true se quebrou. */
export function desgastar(inv: Inventario, id: ItemId): boolean {
  const d = (inv.durabilidade[id] ?? 0) - 1;
  if (d > 0) { inv.durabilidade[id] = d; return false; }
  remover(inv, id, 1);
  const f = ITENS[id].ferramenta;
  if (f && qtd(inv, id) > 0) inv.durabilidade[id] = f.durabilidade;
  return true;
}

/** Mochila do jogador: no máximo esta quantidade de TIPOS de item (a quantidade de cada um é livre). */
export const LIMITE_MOCHILA = 10;

/** Cabem estes itens? Só conta tipos novos (empilhar o que já tem sempre cabe). */
export function cabe(inv: Inventario, ids: ItemId[], limite = LIMITE_MOCHILA): boolean {
  const novos = new Set(ids.filter(id => qtd(inv, id) === 0));
  return Object.keys(inv.itens).length + novos.size <= limite;
}

/** Move a pilha inteira de um item entre inventários (mochila ↔ armazém). Retorna quanto moveu. */
export function moverPilha(de: Inventario, para: Inventario, id: ItemId, limitePara = Infinity): number {
  const n = qtd(de, id);
  if (!n || !cabe(para, [id], limitePara)) return 0;
  const dur = de.durabilidade[id];
  remover(de, id, n);
  adicionar(para, id, n);
  if (dur !== undefined) para.durabilidade[id] = dur;
  return n;
}
