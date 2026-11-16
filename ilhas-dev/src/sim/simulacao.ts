import { atualizarBot, criarBots, pontuacao, type Bot, type MundoBots } from './bots';
import { iniciarRecursos, atualizarRecursos, type EstadoRecursos } from './coleta';
import { nivelIlha } from './construcao';
import { DURACAO_DIA, ehNoite } from './criaturas';
import { gerarMundo, type Mundo } from './mundo';

/** Mundo só com bots, sem tela. Serve para testes e para balancear o jogo. */
export class SimulacaoHeadless {
  mundo: Mundo; recursos: EstadoRecursos; bots: Bot[];
  bloqueio = new Set<number>();
  agora = 0;

  constructor(seed: number, participantes: number, nBots: number) {
    this.mundo = gerarMundo({ seed, participantes });
    this.recursos = iniciarRecursos(this.mundo);
    for (const r of this.mundo.recursos) if (r.tipo !== 'arbusto') this.bloqueio.add(r.y * this.mundo.largura + r.x);
    this.bots = criarBots(this.mundo, nBots, seed);
  }

  private ctx(): MundoBots {
    const L = this.mundo.largura;
    return {
      mundo: this.mundo, recursos: this.recursos, agora: this.agora,
      noite: ehNoite(this.agora + DURACAO_DIA * 0.15),
      bloqueado: (x, y) => this.bloqueio.has(y * L + x),
      aoDestruir: r => this.bloqueio.delete(r.y * L + r.x),
      aoConstruir: (_b, c) => this.bloqueio.add(c.y * L + c.x),
    };
  }

  rodar(ms: number, dt = 100) {
    const L = this.mundo.largura;
    for (let t = 0; t < ms; t += dt) {
      this.agora += dt;
      const ctx = this.ctx();
      for (const b of this.bots) atualizarBot(b, ctx, dt);
      if (this.agora % 1000 === 0) {
        for (const r of atualizarRecursos(this.recursos, this.mundo, this.agora)) {
          if (this.recursos.porTile.get(r.y * L + r.x) === r && r.tipo !== 'arbusto') this.bloqueio.add(r.y * L + r.x);
        }
      }
    }
  }

  resumo() {
    return this.bots.map(b => ({
      nome: b.nome, perfil: b.perfil, nivelIlha: nivelIlha(b.construcoes), construcoes: b.construcoes.length,
      nivel: b.status.nivel, pontos: pontuacao(b.construcoes, b.status),
    })).sort((a, b) => b.pontos - a.pontos);
  }
}
