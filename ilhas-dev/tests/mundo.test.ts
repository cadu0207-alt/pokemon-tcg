import { describe, it, expect } from 'vitest';
import { gerarMundo, tileEm, TILE_ANDAVEL } from '../src/sim/mundo';

describe('gerarMundo', () => {
  it('é determinístico pela seed', () => {
    const a = gerarMundo({ seed: 42, participantes: 16 });
    const b = gerarMundo({ seed: 42, participantes: 16 });
    expect(a.tiles).toEqual(b.tiles);
    expect(a.recursos).toEqual(b.recursos);
  });
  it('cria uma ilha por participante com ponto inicial andável', () => {
    const m = gerarMundo({ seed: 7, participantes: 100 });
    const iniciais = m.ilhas.filter(i => i.dono !== null);
    expect(iniciais).toHaveLength(100);
    for (const i of iniciais) {
      expect(TILE_ANDAVEL[tileEm(m, Math.round(i.cx), Math.round(i.cy))]).toBe(true);
    }
  });
  it('tem recursos para coletar', () => {
    const m = gerarMundo({ seed: 1, participantes: 16 });
    expect(m.recursos.some(r => r.tipo === 'arvore')).toBe(true);
    expect(m.recursos.some(r => r.tipo === 'pedra')).toBe(true);
  });
});
