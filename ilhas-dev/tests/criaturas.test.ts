import { describe, it, expect } from 'vitest';
import { atualizarCriatura, novaCriatura, ferirCriatura, ganharXp, novoStatus, xpParaProximo, escuridao, DURACAO_DIA, type Contexto } from '../src/sim/criaturas';
import { criarRng } from '../src/sim/rng';

const ctx = (x: number, y: number, andavel: (tx: number, ty: number) => boolean = () => true): Contexto => ({ jogador: { x, y, vivo: true }, andavel, rng: criarRng(1) });

describe('IA das criaturas', () => {
  it('coelho foge do jogador', () => {
    const c = novaCriatura(0, 'coelho', 10, 10);
    for (let i = 0; i < 10; i++) atualizarCriatura(c, ctx(11, 10), 100);
    expect(c.x).toBeLessThan(10);
  });
  it('slime persegue e ataca com intervalo', () => {
    const c = novaCriatura(0, 'slime', 10, 10);
    let dano = 0;
    for (let i = 0; i < 40; i++) dano += atualizarCriatura(c, ctx(12, 10), 100);
    expect(c.x).toBeGreaterThan(11);
    expect(dano).toBeGreaterThan(0);
    expect(dano).toBeLessThanOrEqual(2 * 3); // no máximo 3 ataques em 4 s com intervalo de 1,2 s
  });
  it('javali só ataca depois de provocado', () => {
    const c = novaCriatura(0, 'javali', 10, 10);
    let dano = 0;
    for (let i = 0; i < 20; i++) dano += atualizarCriatura(c, ctx(10.5, 10), 100);
    expect(dano).toBe(0);
    ferirCriatura(c, 1);
    for (let i = 0; i < 20; i++) dano += atualizarCriatura(c, ctx(10.5, 10), 100);
    expect(dano).toBeGreaterThan(0);
  });
  it('não atravessa terreno bloqueado', () => {
    const c = novaCriatura(0, 'slime', 10.5, 10.5);
    for (let i = 0; i < 30; i++) atualizarCriatura(c, ctx(14, 10.5, (tx: number) => tx < 11), 100);
    expect(c.x).toBeLessThan(11);
  });
});

describe('status do personagem', () => {
  it('sobe de nível com XP e ganha vida máxima', () => {
    const s = novoStatus();
    expect(ganharXp(s, xpParaProximo(1) - 1)).toBe(0);
    expect(ganharXp(s, 1)).toBe(1);
    expect(s.nivel).toBe(2); expect(s.vidaMax).toBe(24); expect(s.vida).toBe(24);
  });
});

describe('dia e noite', () => {
  it('começa claro, escurece e amanhece', () => {
    expect(escuridao(DURACAO_DIA * 0.3)).toBe(0);
    expect(escuridao(DURACAO_DIA * 0.8)).toBe(1);
    expect(escuridao(DURACAO_DIA * 0.65)).toBeGreaterThan(0);
    expect(escuridao(DURACAO_DIA * 1.3)).toBe(0);
  });
});
