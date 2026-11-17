import { describe, expect, it } from 'vitest';
import { novoEstadoMetas, progredir, sortearMetas, virarDia } from '../src/sim/metas';

describe('metas do dia', () => {
  it('3 metas diferentes, iguais para todos no mesmo dia, e mudam no dia seguinte', () => {
    const a = sortearMetas('2026-11-17', 3), b = sortearMetas('2026-11-17', 3);
    expect(a).toEqual(b);
    expect(new Set(a.map(m => m.tipo)).size).toBe(3);
    const dias = ['2026-11-18', '2026-11-19', '2026-11-20'].map(d => sortearMetas(d, 3).map(m => m.tipo).join());
    expect(new Set([a.map(m => m.tipo).join(), ...dias]).size).toBeGreaterThan(1);
  });

  it('nível baixo não recebe metas que ainda não dá para fazer', () => {
    for (let d = 1; d <= 28; d++) for (const m of sortearMetas(`2026-02-${String(d).padStart(2, '0')}`, 1)) expect(['bau', 'colher']).not.toContain(m.tipo);
  });

  it('completar as 3 soma 1 na sequência só uma vez; faltar um dia não zera', () => {
    const e = novoEstadoMetas(3, '2026-11-17');
    for (const m of e.metas) progredir(e, m.tipo, m.alvo);
    expect(e.sequencia).toBe(1); expect(e.completouHoje).toBe(true);
    for (const m of e.metas) expect(progredir(e, m.tipo, 5).todas).toBe(false);
    expect(e.sequencia).toBe(1);
    virarDia(e, 3, '2026-11-20'); // pulou 2 dias
    expect(e.sequencia).toBe(1); expect(e.completouHoje).toBe(false);
    expect(e.metas.every(m => m.feito === 0)).toBe(true);
    const r = progredir(e, e.metas[0].tipo, 1);
    expect(r.todas).toBe(false);
  });
});
