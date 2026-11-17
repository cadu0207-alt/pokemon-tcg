import { atualizarBot, criarBots, pontuacao, DIFICULDADE, type Bot, type Dificuldade, type MundoBots } from './bots';
import { iniciarRecursos, atualizarRecursos, type EstadoRecursos } from './coleta';
import { expandirTerreno, tileDoCristal } from './expansao';
import { DURACAO_DIA, ehNoite } from './criaturas';
import { gerarMundo, type Mundo } from './mundo';
import { membroDe, novoEstadoReinos, pagarTributo, passoReinos, reiDe, vassalosDe, type EventoReino } from './reinos';

/** Mundo só com bots, sem tela. Serve para testes e para balancear o jogo. */
export class SimulacaoHeadless {
  mundo: Mundo; recursos: EstadoRecursos; bots: Bot[];
  bloqueio = new Set<number>();
  agora = 0;
  reinos = novoEstadoReinos();
  eventosReinos: EventoReino[] = [];

  constructor(seed: number, participantes: number, nBots: number, public dificuldade: Dificuldade = 'dificil') {
    this.mundo = gerarMundo({ seed, participantes });
    this.recursos = iniciarRecursos(this.mundo);
    for (const [i, r] of this.recursos.porTile) if (r.tipo !== 'arbusto') this.bloqueio.add(i); // submersos não bloqueiam
    this.bots = criarBots(this.mundo, nBots, seed);
    // o Cristal ocupa o centro de cada ilha de participante
    for (const i of this.mundo.ilhas) if (i.dono !== null) { const c = tileDoCristal(i); this.bloqueio.add(c.y * this.mundo.largura + c.x); }
  }

  private ctx(): MundoBots {
    const L = this.mundo.largura;
    return {
      mundo: this.mundo, recursos: this.recursos, agora: this.agora,
      ritmo: DIFICULDADE[this.dificuldade].ritmo, velocidade: DIFICULDADE[this.dificuldade].velocidade, preguica: DIFICULDADE[this.dificuldade].preguica,
      noite: ehNoite(this.agora + DURACAO_DIA * 0.15),
      bloqueado: (x, y) => this.bloqueio.has(y * L + x),
      aoDestruir: r => this.bloqueio.delete(r.y * L + r.x),
      aoConstruir: (_b, c) => this.bloqueio.add(c.y * L + c.x),
      aoExpandir: b => {
        const r = expandirTerreno(this.mundo, this.recursos, b.ilha, b.nivel);
        for (const x of r.emergiram) if (x.tipo !== 'arbusto' && !this.recursos.renasce.has(x.id)) this.bloqueio.add(x.y * L + x.x);
        for (const x of r.submergiram) this.bloqueio.delete(x.y * L + x.x);
      },
    };
  }

  rodar(ms: number, dt = 100) {
    const L = this.mundo.largura;
    for (let t = 0; t < ms; t += dt) {
      this.agora += dt;
      const ctx = this.ctx();
      for (const b of this.bots) atualizarBot(b, ctx, dt);
      if (this.agora % 30_000 === 0) this.passoReinos();
      if (this.agora % 1000 === 0) {
        for (const r of atualizarRecursos(this.recursos, this.mundo, this.agora)) {
          if (this.recursos.porTile.get(r.y * L + r.x) === r && r.tipo !== 'arbusto') this.bloqueio.add(r.y * L + r.x);
        }
      }
    }
  }

  passoReinos() {
    const porIlha = new Map(this.bots.map(b => [b.ilha.id, b]));
    for (const ev of passoReinos(this.reinos, this.bots.map(b => membroDe(b)), this.agora)) {
      if (ev.tipo === 'tributo') { const v = porIlha.get(ev.vassalo), r = porIlha.get(ev.rei); if (v && r) ev.itens = pagarTributo(v.inv, r.inv); }
      this.eventosReinos.push(ev);
    }
  }

  /** Reinos atuais: rei -> número de vassalos. */
  resumoReinos() {
    const reis = new Set(Object.values(this.reinos.senhor));
    return [...reis].map(r => ({ rei: this.bots.find(b => b.ilha.id === r)?.nome ?? String(r), vassalos: vassalosDe(this.reinos, r).length }))
      .sort((a, b) => b.vassalos - a.vassalos);
  }

  /** Reino de um bot (id da ilha do rei). */
  reinoDe(b: { ilha: { id: number } }) { return reiDe(this.reinos, b.ilha.id); }

  resumo() {
    return this.bots.map(b => ({
      nome: b.nome, perfil: b.perfil, nivelIlha: b.nivel, construcoes: b.construcoes.length,
      nivel: b.status.nivel, pontos: pontuacao(b.nivel, b.construcoes, b.status),
    })).sort((a, b) => b.pontos - a.pontos);
  }
}
