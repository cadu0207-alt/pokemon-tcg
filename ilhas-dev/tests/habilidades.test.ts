import { describe, it, expect } from 'vitest';
import { aprender, efeitos, escolherHabilidade, podeAprender, pontosLivres } from '../src/sim/habilidades';
import { novoStatus } from '../src/sim/criaturas';

describe('árvore de habilidades', () => {
  it('exige pontos, nível e o nó anterior', () => {
    const s = novoStatus(); const a: string[] = [];
    expect(podeAprender(s, a, 'c1')).toBe('nivel');
    s.nivel = 3;
    expect(pontosLivres(s, a)).toBe(2);
    expect(podeAprender(s, a, 'c2')).toBe('requer_anterior');
    expect(aprender(s, a, 'c1')).toBe(true);
    expect(aprender(s, a, 'c2')).toBe(true);
    expect(podeAprender(s, a, 's1')).toBe('sem_pontos');
  });
  it('soma efeitos e libera magias', () => {
    const s = novoStatus(); s.nivel = 10; const a: string[] = [];
    for (const id of ['s1', 'a1', 'a2', 'e1']) aprender(s, a, id);
    const e = efeitos(a);
    expect(s.vidaMax).toBe(26);
    expect(e.magias).toEqual(['faisca', 'agua']);
    expect(e.manaMax).toBe(25); expect(e.coleta).toBe(1);
  });
  it('bots escolhem pelo perfil', () => {
    const s = novoStatus(); s.nivel = 3;
    expect(escolherHabilidade(s, [], 'cacador')).toBe('c1');
    expect(escolherHabilidade(s, [], 'explorador')).toBe('a1');
    expect(escolherHabilidade(s, [], 'coletor')).toBe('e1');
  });
});
