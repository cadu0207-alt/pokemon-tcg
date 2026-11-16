import { describe, it, expect } from 'vitest';
import { MISSOES, missaoAtual, type EstadoTutorial } from '../src/sim/tutorial';
import { novoInventario, adicionar } from '../src/sim/inventario';
import { novoStatus } from '../src/sim/criaturas';

const estado = (): EstadoTutorial => ({ inv: novoInventario(), construcoes: [], status: novoStatus(), habilidades: [], criados: {}, mortos: 0 });

describe('tutorial', () => {
  it('avança conforme o jogador progride', () => {
    const e = estado();
    expect(missaoAtual(e)).toBe(0);
    adicionar(e.inv, 'madeira', 3);
    expect(missaoAtual(e)).toBe(1);
    adicionar(e.inv, 'fibra', 3); adicionar(e.inv, 'pedra', 2);
    expect(missaoAtual(e)).toBe(2);
    e.criados.corda = 1; e.criados.machado_pedra = 1;
    expect(missaoAtual(e)).toBe(4);
    e.construcoes.push({ tipo: 'fogueira', x: 0, y: 0 }, { tipo: 'bancada', x: 2, y: 0 });
    e.mortos = 1; e.habilidades.push('c1'); e.criados.jangada = 1;
    expect(missaoAtual(e)).toBe(MISSOES.length);
  });
  it('não volta atrás quando o inventário é gasto', () => {
    const e = estado();
    adicionar(e.inv, 'madeira', 3);
    const i = missaoAtual(e);
    e.inv.itens = {};
    expect(missaoAtual(e, i)).toBe(i);
  });
});
