import { describe, it, expect } from 'vitest';
import { gerarMundo } from '../src/sim/mundo';
import { iniciarRecursos, golpear, atualizarRecursos, recursoAtivo } from '../src/sim/coleta';
import { novoInventario, criar, qtd, adicionar } from '../src/sim/inventario';
import { RECEITAS } from '../src/sim/itens';

const receita = (id: string) => RECEITAS.find(r => r.id === id)!;

describe('coleta', () => {
  const m = gerarMundo({ seed: 5, participantes: 4 });
  it('árvore cai com mão nua em 6 golpes, solta madeira e renasce depois', () => {
    const e = iniciarRecursos(m); const inv = novoInventario();
    const arv = m.recursos.find(r => r.tipo === 'arvore')!;
    for (let i = 0; i < 5; i++) expect(golpear(e, inv, arv, 0)!.destruido).toBe(false);
    expect(golpear(e, inv, arv, 0)!.destruido).toBe(true);
    expect(qtd(inv, 'madeira')).toBe(3);
    expect(golpear(e, inv, arv, 1000)).toBeNull();
    atualizarRecursos(e, m, 119_999); expect(recursoAtivo(e, arv)).toBe(false);
    atualizarRecursos(e, m, 120_000); expect(recursoAtivo(e, arv)).toBe(true);
  });
  it('machado derruba em 2 golpes e se desgasta', () => {
    const e = iniciarRecursos(m); const inv = novoInventario();
    adicionar(inv, 'machado_pedra');
    const arv = m.recursos.find(r => r.tipo === 'arvore')!;
    golpear(e, inv, arv, 0);
    expect(golpear(e, inv, arv, 0)!.destruido).toBe(true);
    expect(inv.durabilidade.machado_pedra).toBe(38);
  });
});

describe('criação', () => {
  it('consome o custo e entrega o item', () => {
    const inv = novoInventario();
    adicionar(inv, 'fibra', 3);
    expect(criar(inv, receita('corda'))).toBe(true);
    expect(qtd(inv, 'fibra')).toBe(0);
    expect(qtd(inv, 'corda')).toBe(1);
    expect(criar(inv, receita('corda'))).toBe(false);
  });
  it('ferramenta quebra quando a durabilidade acaba', () => {
    const m = gerarMundo({ seed: 5, participantes: 4 });
    const e = iniciarRecursos(m); const inv = novoInventario();
    adicionar(inv, 'machado_pedra');
    const arvores = m.recursos.filter(r => r.tipo === 'arvore');
    let golpes = 0;
    for (const a of arvores) {
      while (qtd(inv, 'machado_pedra') > 0 && golpear(e, inv, a, 0)) golpes++;
      if (qtd(inv, 'machado_pedra') === 0) break;
    }
    expect(qtd(inv, 'machado_pedra')).toBe(0);
    expect(golpes).toBe(40);
  });
});
