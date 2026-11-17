import { describe, it, expect } from 'vitest';
import { MISSOES, TUTORIAL_BASE, missaoAtual, type EstadoTutorial } from '../src/sim/tutorial';
import { novoInventario, adicionar } from '../src/sim/inventario';
import { novoStatus } from '../src/sim/criaturas';

const estado = (): EstadoTutorial => ({ inv: novoInventario(), construcoes: [], status: novoStatus(), habilidades: [], criados: {}, mortos: 0 });

describe('tutorial', () => {
  it('avança conforme o jogador progride', () => {
    const e = estado();
    expect(missaoAtual(e)).toBe(0);
    e.criados.corda = 2;
    expect(missaoAtual(e)).toBe(1);
    e.criados.jangada = 1;
    expect(missaoAtual(e)).toBe(2);
    e.visitouOutra = true;
    expect(missaoAtual(e)).toBe(3);
    adicionar(e.inv, 'cristal', 1);
    expect(missaoAtual(e)).toBe(4);
    e.construcoes.push({ tipo: 'fogueira', x: 0, y: 0 });
    expect(missaoAtual(e)).toBe(5);
    e.nivel = 2; e.mortos = 1; e.habilidades.push('c1');
    expect(missaoAtual(e)).toBe(TUTORIAL_BASE);
    e.bausAbertos = 1; e.construcoes.push({ tipo: 'cerca', x: 1, y: 0 }, { tipo: 'bau', x: 2, y: 0 }); e.nivel = 3;
    expect(missaoAtual(e)).toBe(MISSOES.length);
  });
  it('não volta atrás quando o inventário é gasto', () => {
    const e = estado();
    e.criados.corda = 2; adicionar(e.inv, 'jangada', 1);
    const i = missaoAtual(e);
    e.inv.itens = {};
    expect(missaoAtual(e, i)).toBe(i);
  });
});
