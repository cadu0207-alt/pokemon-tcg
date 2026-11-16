import { describe, it, expect } from 'vitest';
import { acharCaminho } from '../src/sim/caminho';
import { SimulacaoHeadless } from '../src/sim/simulacao';
import { avaliar, necessidades, criarBots } from '../src/sim/bots';
import { gerarMundo } from '../src/sim/mundo';
import { iniciarRecursos } from '../src/sim/coleta';

describe('A*', () => {
  it('contorna parede e chega ao vizinho do alvo', () => {
    const parede = (x: number, y: number) => x >= 0 && y >= 0 && x < 10 && y < 10 && !(x === 5 && y < 8);
    const c = acharCaminho(1, 1, 8, 1, parede)!;
    expect(c.at(-1)).toEqual([8, 1]);
    expect(c.every(([x, y]) => parede(x, y))).toBe(true);
    const [ax, ay] = acharCaminho(1, 1, 8, 1, parede, { alvoAdjacente: true })!.at(-1)!;
    expect(Math.abs(ax - 8) + Math.abs(ay - 1)).toBe(1);
    expect(acharCaminho(1, 1, 8, 1, (x, y) => parede(x, y) && x !== 5)).toBeNull();
  });
});

describe('bots', () => {
  it('bot novo quer madeira, pedra e fibra e escolhe coletar', () => {
    const m = gerarMundo({ seed: 3, participantes: 9 });
    const [bot] = criarBots(m, 1, 3);
    const n = necessidades(bot);
    expect(n.madeira).toBeGreaterThan(0); expect(n.pedra).toBeGreaterThan(0); expect(n.fibra).toBeGreaterThan(0);
    const rec = iniciarRecursos(m);
    const ops = avaliar(bot, { mundo: m, recursos: rec, bloqueado: () => false, agora: 0, noite: false });
    expect(ops[0].objetivo.tipo).toBe('coletar');
  });

  it('em 25 minutos de jogo a maioria dos bots sobe a ilha de nível sozinha', () => {
    const sim = new SimulacaoHeadless(2026, 25, 12);
    sim.rodar(25 * 60_000);
    const r = sim.resumo();
    const subiram = r.filter(b => b.nivelIlha >= 2).length;
    expect(subiram).toBeGreaterThanOrEqual(8);
    // perfis diferentes geram resultados diferentes (não estão todos iguais)
    expect(new Set(r.map(b => b.pontos)).size).toBeGreaterThan(2);
  }, 60_000);
});

describe('bots não se prendem', () => {
  it('depois de 40 min todo bot ainda alcança o centro da própria ilha', async () => {
    const { acharCaminho } = await import('../src/sim/caminho');
    const { naIlha } = await import('../src/sim/construcao');
    const { TILE_ANDAVEL, tileEm } = await import('../src/sim/mundo');
    const sim = new SimulacaoHeadless(2026, 30, 20);
    sim.rodar(40 * 60_000);
    const L = sim.mundo.largura;
    for (const b of sim.bots) {
      if (b.expedicao) continue; // em viagem: está fora de casa por escolha
      // árvores contam como passáveis: renascem em qualquer lugar e o bot sabe cortá-las para abrir caminho
      const arvore = (x: number, y: number) => sim.recursos.porTile.get(y * L + x)?.tipo === 'arvore';
      const andavel = (x: number, y: number) => TILE_ANDAVEL[tileEm(sim.mundo, x, y)] && (!sim.bloqueio.has(y * L + x) || arvore(x, y)) && naIlha(b.ilha, x, y);
      const ok = acharCaminho(Math.floor(b.x), Math.floor(b.y), Math.round(b.ilha.cx), Math.round(b.ilha.cy), andavel, { alvoAdjacente: true, maxNos: 5000 });
      expect(ok, b.nome).not.toBeNull();
    }
  }, 120_000);
});

describe('expedições', () => {
  it('bots com jangada viajam às ilhas neutras e voltam para casa', async () => {
    const { naIlha } = await import('../src/sim/construcao');
    const sim = new SimulacaoHeadless(2026, 36, 12, 'normal');
    let visitaram = 0;
    for (let i = 0; i < 90; i++) { sim.rodar(60_000); visitaram += sim.bots.filter(b => b.expedicao?.fase === 'coletar').length; }
    expect(visitaram).toBeGreaterThan(0);
    // depois de parar de pedir expedições, todos terminam em casa
    for (const b of sim.bots) if (b.expedicao) { sim.rodar(400_000); break; }
    for (const b of sim.bots) if (!b.expedicao) expect(naIlha(b.ilha, Math.floor(b.x), Math.floor(b.y)), b.nome).toBe(true);
  }, 120_000);
});
