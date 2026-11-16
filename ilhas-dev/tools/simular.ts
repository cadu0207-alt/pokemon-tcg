// Uso: npx vite-node tools/simular.ts [minutos] [bots]  (ou via vitest: tests/bots.test.ts)
import { SimulacaoHeadless } from '../src/sim/simulacao';
const minutos = Number(process.argv[2] ?? 30), n = Number(process.argv[3] ?? 20);
const dif = (process.argv[4] ?? 'normal') as 'facil' | 'normal' | 'dificil';
const sim = new SimulacaoHeadless(2026, 100, n, dif);
console.log('dificuldade', dif);
const t0 = performance.now();
for (let m = 1; m <= minutos; m++) {
  sim.rodar(60_000);
  if (m % 5 === 0) {
    const r = sim.resumo();
    const niveis = r.reduce((acc, b) => ((acc[b.nivelIlha] = (acc[b.nivelIlha] ?? 0) + 1), acc), {} as Record<number, number>);
    console.log(`${m} min de jogo | ilhas por nível ${JSON.stringify(niveis)} | líder ${r[0].nome} (${r[0].perfil}) ${r[0].pontos} pts`);
  }
}
console.log(`tempo real: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.table(sim.resumo().slice(0, 10));
