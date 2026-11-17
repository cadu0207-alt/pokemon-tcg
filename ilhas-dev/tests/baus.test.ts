import { describe, it, expect } from 'vitest';
import { gerarBaus, abrirBau, gerarConteudo, RARIDADES } from '../src/sim/baus';
import { gerarMundo, TILE_ANDAVEL } from '../src/sim/mundo';
import { novoInventario, adicionar, LIMITE_MOCHILA } from '../src/sim/inventario';
import { criarRng } from '../src/sim/rng';

describe('baús', () => {
  const m = gerarMundo({ seed: 2026, participantes: 100 });
  const baus = gerarBaus(m, 2026, () => false);
  it('ficam em terra das ilhas neutras, sem repetir lugar', () => {
    expect(baus.length).toBeGreaterThan(40);
    const lugares = new Set(baus.map(b => b.y * m.largura + b.x));
    expect(lugares.size).toBe(baus.length);
    for (const b of baus) {
      expect(TILE_ANDAVEL[m.tiles[b.y * m.largura + b.x] as 0]).toBe(true);
      expect(m.ilhas[b.ilha].dono).toBeNull();
    }
  });
  it('raridades seguem os pesos (lendário é raro)', () => {
    const rng = criarRng(7); const cont: Record<string, number> = {};
    const muitos = gerarBaus(gerarMundo({ seed: 9, participantes: 400 }), 9, () => false);
    for (const b of muitos) cont[b.raridade] = (cont[b.raridade] ?? 0) + 1;
    expect(cont.comum).toBeGreaterThan(cont.raro);
    expect(cont.raro).toBeGreaterThan(cont.epico);
    expect(cont.epico).toBeGreaterThan(cont.lendario ?? 0);
    expect(Object.keys(RARIDADES)).toHaveLength(4); void rng;
  });
  it('lendário sempre traz cristal; comum nunca', () => {
    for (let s = 0; s < 30; s++) {
      expect(gerarConteudo('lendario', criarRng(s)).itens.cristal).toBeGreaterThanOrEqual(4);
      expect(gerarConteudo('comum', criarRng(s)).itens.cristal ?? 0).toBe(0);
    }
  });
  it('só abre sem guardiões e respeita a mochila', () => {
    const b = { ...baus[0], conteudo: novoInventario() };
    adicionar(b.conteudo, 'cristal', 3); adicionar(b.conteudo, 'lingote', 2);
    const mochila = novoInventario();
    expect(abrirBau(b, mochila)).toEqual({ motivo: 'guardioes' });     // guardiões ainda não apareceram
    b.guardioesCriados = true; b.guardioes = 2;
    expect(abrirBau(b, mochila)).toEqual({ motivo: 'guardioes' });
    b.guardioes = 0;
    // mochila quase cheia: só cabe 1 tipo novo
    const ids = ['madeira', 'pedra', 'fibra', 'baga', 'corda', 'carne', 'couro', 'gosma', 'minerio'] as const;
    ids.slice(0, LIMITE_MOCHILA - 1).forEach(id => adicionar(mochila, id, 1));
    const r = abrirBau(b, mochila) as { pegou: Record<string, number> };
    expect(Object.keys(r.pegou)).toHaveLength(1);
    expect(b.aberto).toBe(false);               // ficou o resto lá dentro
  });
});
