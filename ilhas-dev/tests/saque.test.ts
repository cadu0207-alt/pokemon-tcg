import { describe, it, expect } from 'vitest';
import { resolverSaque, defesa, criarTumulo, chanceDeSaque } from '../src/sim/saque';
import { novoInventario, adicionar, qtd } from '../src/sim/inventario';
import { criarRng } from '../src/sim/rng';
import type { Construcao } from '../src/sim/construcao';

describe('saque', () => {
  it('sem defesa, o invasor leva parte do baú e drena energia', () => {
    const arm = novoInventario(); adicionar(arm, 'madeira', 20); adicionar(arm, 'cristal', 4);
    const r = resolverSaque(3, [], arm, criarRng(1));
    expect(r.repelido).toBe(false);
    expect(r.energiaPerdida).toBeGreaterThanOrEqual(20);
    expect(qtd(arm, 'madeira')).toBeLessThan(20);
    expect(qtd(arm, 'madeira')).toBeGreaterThan(0);  // nunca leva tudo
  });
  it('torres e cercas repelem invasores de ilhas pequenas', () => {
    const c: Construcao[] = [{ tipo: 'torre', x: 0, y: 0 }, { tipo: 'torre', x: 1, y: 0 }, ...Array.from({ length: 6 }, (_, i) => ({ tipo: 'cerca' as const, x: i, y: 1 }))];
    expect(defesa(c)).toBe(40);
    const arm = novoInventario(); adicionar(arm, 'madeira', 10);
    let repelidos = 0;
    for (let s = 0; s < 50; s++) if (resolverSaque(2, c, arm, criarRng(s)).repelido) repelidos++;
    expect(repelidos).toBe(50);
  });
  it('ilhas mais evoluídas atraem mais saques', () => {
    expect(chanceDeSaque(8)).toBeGreaterThan(chanceDeSaque(2));
  });
  it('morte deixa metade da mochila no túmulo, mas nunca a jangada', () => {
    const m = novoInventario(); adicionar(m, 'madeira', 9); adicionar(m, 'jangada', 1); adicionar(m, 'cristal', 1);
    const t = criarTumulo(m, 5, 5)!;
    expect(qtd(t.itens, 'madeira')).toBe(5); expect(qtd(m, 'madeira')).toBe(4);
    expect(qtd(t.itens, 'cristal')).toBe(1); expect(qtd(m, 'cristal')).toBe(0);
    expect(qtd(m, 'jangada')).toBe(1); expect(qtd(t.itens, 'jangada')).toBe(0);
  });
});
