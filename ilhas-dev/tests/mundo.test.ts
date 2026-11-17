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

describe('escala', () => {
  it('gera o mundo de 1000 participantes rápido e com recursos mínimos em toda ilha inicial', () => {
    const t0 = performance.now();
    const m = gerarMundo({ seed: 2026, participantes: 1000 });
    expect(performance.now() - t0).toBeLessThan(8000); // antes da grade espacial: ~83 s
    const L = m.largura;
    const porTile = new Map(m.recursos.map(r => [r.y * L + r.x, r]));
    for (const ilha of m.ilhas.filter(i => i.dono !== null).slice(0, 200)) {
      const cont = { arvore: 0, pedra: 0, arbusto: 0, minerio: 0, cristal: 0 };
      const inicio = { arvore: 0, pedra: 0, arbusto: 0, minerio: 0, cristal: 0 };
      const R = Math.ceil(ilha.raioMax * 1.3);
      for (let y = Math.floor(ilha.cy) - R; y <= ilha.cy + R; y++) for (let x = Math.floor(ilha.cx) - R; x <= ilha.cx + R; x++) {
        const r = porTile.get(y * L + x);
        if (!r || Math.hypot(r.x + 0.5 - ilha.cx, r.y + 0.5 - ilha.cy) >= ilha.raioMax * 1.3) continue;
        if (r.tipo === 'minerio' || r.tipo === 'cristal') { if (Math.hypot(r.x + 0.5 - ilha.cx, r.y + 0.5 - ilha.cy) < ilha.raioMax * 0.9) cont[r.tipo]++; } // vizinhas podem encostar
        else cont[r.tipo]++;
        if (TILE_ANDAVEL[m.tiles[r.y * L + r.x] as 0]) inicio[r.tipo]++; // em terra visível no nível 1
      }
      expect(cont.pedra, `ilha ${ilha.id}`).toBeGreaterThanOrEqual(4);
      expect(cont.minerio + cont.cristal, `ilha ${ilha.id}: minério e cristal só fora de casa`).toBe(0);
      expect(inicio.arvore, `ilha ${ilha.id}`).toBeGreaterThanOrEqual(3);
      expect(inicio.pedra, `ilha ${ilha.id}`).toBeGreaterThanOrEqual(1);
      expect(inicio.arbusto, `ilha ${ilha.id}`).toBeGreaterThanOrEqual(2);
      expect(ilha.raio).toBeLessThan(ilha.raioMax * 0.5); // começa pequena
    }
  }, 30_000);
});
