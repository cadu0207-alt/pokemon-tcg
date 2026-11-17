import { NIVEIS, contar, type Construcao } from './construcao';
import { qtd, remover, type Inventario } from './inventario';
import type { ItemId } from './itens';
import type { EstadoRecursos } from './coleta';
import { aplicarExpansao, NIVEL_MAX, Tile, type Ilha, type Mundo, type Recurso, type Retangulo } from './mundo';

/**
 * Expansão da ilha pelo Cristal: para subir do nível n para n+1 é preciso ter as construções do
 * próximo nível (lista NIVEIS) e alimentar o Cristal com o pacote de recursos abaixo.
 * Cristal só existe fora de casa: expandir obriga a navegar.
 */
export const CUSTO_EXPANSAO: Record<number, Partial<Record<ItemId, number>>> = {
  2: { cristal: 1, madeira: 4 },
  3: { cristal: 1, madeira: 6, pedra: 2 },
  4: { cristal: 2, madeira: 8, pedra: 4 },
  5: { cristal: 2, pedra: 4, minerio: 2 },
  6: { cristal: 3, pedra: 5, minerio: 3 },
  7: { cristal: 3, lingote: 2 },
  8: { cristal: 4, lingote: 3 },
  9: { cristal: 4, lingote: 4 },
  10: { cristal: 6, lingote: 6 },
};

export interface Requisitos {
  nivel: number;                                      // nível que será alcançado
  construcoes: [ItemId, number, number][];            // [tipo, tem, precisa]
  itens: [ItemId, number, number][];                  // [item, tem, precisa]
  pronto: boolean;
}

/** O que falta para expandir do nível atual para o próximo (null no nível máximo). */
export function requisitosExpansao(nivelAtual: number, construcoes: Construcao[], inv: Inventario): Requisitos | null {
  const alvo = nivelAtual + 1;
  if (alvo > NIVEL_MAX) return null;
  const req = NIVEIS.find(n => n.nivel === alvo)?.requer ?? {};
  const tem = contar(construcoes);
  const cons = Object.entries(req).map(([id, n]) => [id as ItemId, tem[id as ItemId] ?? 0, n ?? 0] as [ItemId, number, number]);
  const itens = Object.entries(CUSTO_EXPANSAO[alvo] ?? {}).map(([id, n]) => [id as ItemId, qtd(inv, id as ItemId), n ?? 0] as [ItemId, number, number]);
  return { nivel: alvo, construcoes: cons, itens, pronto: [...cons, ...itens].every(([, t, p]) => t >= p) };
}

/** Consome o pacote do Cristal (sem mexer no terreno). Retorna o novo nível ou null. */
export function pagarExpansao(nivelAtual: number, construcoes: Construcao[], inv: Inventario): number | null {
  const r = requisitosExpansao(nivelAtual, construcoes, inv);
  if (!r?.pronto) return null;
  for (const [id, , n] of r.itens) remover(inv, id, n);
  return r.nivel;
}

export interface ResultadoExpansao { area: Retangulo; emergiram: Recurso[]; submergiram: Recurso[]; }

/** Muda o terreno da ilha para o nível e acorda/adormece os recursos que ganharam/perderam terra. */
export function expandirTerreno(m: Mundo, rec: EstadoRecursos, ilha: Ilha, nivel: number): ResultadoExpansao {
  const area = aplicarExpansao(m, ilha, nivel);
  const emergiram: Recurso[] = [], submergiram: Recurso[] = [];
  for (let y = area.y0; y <= area.y1; y++) for (let x = area.x0; x <= area.x1; x++) {
    const i = y * m.largura + x;
    const terra = m.tiles[i] > Tile.Agua;
    const dormindo = rec.submersos.get(i);
    if (terra && dormindo) { rec.submersos.delete(i); rec.porTile.set(i, dormindo); emergiram.push(dormindo); }
    const ativo = rec.porTile.get(i);
    if (!terra && ativo) { rec.porTile.delete(i); rec.submersos.set(i, ativo); submergiram.push(ativo); }
  }
  return { area, emergiram, submergiram };
}

/** Tile do Cristal (centro da ilha) e um tile andável ao lado dele, para nascer/voltar. */
export const tileDoCristal = (ilha: Ilha) => ({ x: Math.round(ilha.cx), y: Math.round(ilha.cy) });
export const tileDeNascimento = (ilha: Ilha) => ({ x: Math.round(ilha.cx), y: Math.round(ilha.cy) + 1 });
