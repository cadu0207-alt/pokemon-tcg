import { describe, expect, it } from 'vitest';
import { novoInventario, adicionar } from '../src/sim/inventario';
import { cobrarTributo, emContato, forcaIlha, novoEstadoReinos, passoReinos, rebelar, reiDe, vassalosDe, TRIBUTO_MS, type Membro } from '../src/sim/reinos';
import type { Ilha } from '../src/sim/mundo';

const ilha = (id: number, cx: number): Ilha => ({ id, cx, cy: 0, raio: 10, raioMax: 10, dono: id });
const membro = (id: number, cx: number, nivel: number, humano = false): Membro =>
  ({ id, nome: `m${id}`, ilha: ilha(id, cx), nivel, nivelJogador: 1, construcoes: [], humano });

describe('reinos', () => {
  it('a influência cresce com o nível: vizinhos só se tocam no meio do jogo', () => {
    expect(emContato(membro(1, 0, 1), membro(2, 40, 1))).toBe(false);
    expect(emContato(membro(1, 0, 6), membro(2, 40, 6))).toBe(true);
  });

  it('o bem mais forte domina; força parecida não domina', () => {
    const e = novoEstadoReinos();
    passoReinos(e, [membro(1, 0, 7), membro(2, 40, 6)], 0);
    expect(e.senhor[2]).toBeUndefined();
    const ev = passoReinos(e, [membro(1, 0, 9), membro(2, 40, 6)], 0);
    expect(ev[0]).toMatchObject({ tipo: 'dominou', rei: 1, alvo: 2 });
    expect(reiDe(e, 2)).toBe(1);
  });

  it('pessoa recebe proposta em vez de ser dominada, e não é perguntada de novo logo em seguida', () => {
    const e = novoEstadoReinos();
    const a = passoReinos(e, [membro(1, 0, 9), membro(2, 40, 5, true)], 0);
    expect(a[0]).toMatchObject({ tipo: 'proposta', rei: 1, alvo: 2 });
    expect(e.senhor[2]).toBeUndefined();
    expect(passoReinos(e, [membro(1, 0, 9), membro(2, 40, 5, true)], 60_000).some(x => x.tipo === 'proposta')).toBe(false);
  });

  it('dominar um rei leva os vassalos dele junto', () => {
    const e = novoEstadoReinos();
    passoReinos(e, [membro(2, 40, 6), membro(3, 65, 3)], 0);
    expect(reiDe(e, 3)).toBe(2);
    passoReinos(e, [membro(1, 0, 10), membro(2, 40, 6), membro(3, 65, 3)], 0);
    expect(vassalosDe(e, 1).sort()).toEqual([2, 3]);
  });

  it('bot vassalo que fica mais forte que o rei se rebela; rebelião fraca falha e espera', () => {
    const e = novoEstadoReinos();
    e.senhor[2] = 1;
    const ev = passoReinos(e, [membro(1, 0, 4), membro(2, 200, 6)], 0);
    expect(ev.some(x => x.tipo === 'rebeliao' && x.sucesso)).toBe(true);
    expect(e.senhor[2]).toBeUndefined();
    e.senhor[3] = 1;
    const porId = new Map([membro(1, 0, 8), membro(3, 200, 2)].map(m => [m.id, m]));
    expect(rebelar(e, porId, 3, 0).sucesso).toBe(false);
    expect(e.esperaRebeliao[3]).toBeGreaterThan(0);
  });

  it('tributo: 15% dos materiais a cada hora de jogo', () => {
    const inv = novoInventario(); adicionar(inv, 'madeira', 40); adicionar(inv, 'cristal', 5);
    const levado = cobrarTributo(inv);
    expect(levado.itens.madeira).toBe(6); expect(inv.itens.madeira).toBe(34); expect(inv.itens.cristal).toBe(5);
    const e = novoEstadoReinos(); e.senhor[2] = 1; e.ultimoTributo[2] = 0;
    const longe = [membro(1, 0, 3), membro(2, 500, 1)];
    expect(passoReinos(e, longe, TRIBUTO_MS - 1).some(x => x.tipo === 'tributo')).toBe(false);
    expect(passoReinos(e, longe, TRIBUTO_MS).some(x => x.tipo === 'tributo')).toBe(true);
    expect(forcaIlha(membro(1, 0, 3))).toBe(32);
  });
});
