/**
 * Sons e música gerados com Web Audio (sem arquivos para baixar).
 * O navegador só libera áudio depois de um toque/tecla: `destravar()` é chamado no primeiro gesto.
 */
export type Efeito = 'madeira' | 'pedra' | 'arbusto' | 'cai' | 'criar' | 'construir' | 'nivel' | 'dano' | 'golpe' | 'magia' | 'cura' | 'noite' | 'clique';

const PENTA = [0, 2, 4, 7, 9]; // escala pentatônica: soa bem em qualquer combinação

export class Som {
  private ctx: AudioContext | null = null;
  private mestre!: GainNode;
  private musicaGanho!: GainNode;
  private proximaNota = 0;
  private passo = 0;
  ligado: boolean;
  musica: boolean;

  constructor() {
    let cfg: { som?: boolean; musica?: boolean } = {};
    try { cfg = JSON.parse(localStorage.getItem('ilhas-som') ?? '{}'); } catch { /* sem armazenamento */ }
    this.ligado = cfg.som ?? true;
    this.musica = cfg.musica ?? true;
  }

  private salvarCfg() {
    try { localStorage.setItem('ilhas-som', JSON.stringify({ som: this.ligado, musica: this.musica })); } catch { /* ok */ }
  }

  destravar() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.mestre = this.ctx.createGain(); this.mestre.gain.value = this.ligado ? 0.5 : 0; this.mestre.connect(this.ctx.destination);
    this.musicaGanho = this.ctx.createGain(); this.musicaGanho.gain.value = this.musica ? 0.18 : 0; this.musicaGanho.connect(this.mestre);
    this.proximaNota = this.ctx.currentTime + 0.3;
  }

  alternarSom() { this.ligado = !this.ligado; if (this.ctx) this.mestre.gain.value = this.ligado ? 0.5 : 0; this.salvarCfg(); }
  alternarMusica() { this.musica = !this.musica; if (this.ctx) this.musicaGanho.gain.value = this.musica ? 0.18 : 0; this.salvarCfg(); }

  private tom(freq: number, dur: number, tipo: OscillatorType, vol: number, inicio = 0, deslize = 0, destino?: AudioNode) {
    const c = this.ctx!; const t = c.currentTime + inicio;
    const o = c.createOscillator(), g = c.createGain();
    o.type = tipo; o.frequency.setValueAtTime(freq, t);
    if (deslize) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * deslize), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(destino ?? this.mestre); o.start(t); o.stop(t + dur + 0.02);
  }

  private ruido(dur: number, vol: number, freq: number, inicio = 0) {
    const c = this.ctx!; const t = c.currentTime + inicio;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.mestre); s.start(t);
  }

  tocar(e: Efeito) {
    if (!this.ctx || !this.ligado) return;
    const v = 0.9 + Math.random() * 0.2; // pequena variação para não cansar
    switch (e) {
      case 'madeira': this.tom(180 * v, 0.09, 'triangle', 0.35, 0, 0.6); this.ruido(0.06, 0.25, 900); break;
      case 'pedra': this.tom(900 * v, 0.05, 'square', 0.12, 0, 0.7); this.ruido(0.05, 0.3, 3000); break;
      case 'arbusto': this.ruido(0.12, 0.3, 1800); break;
      case 'cai': this.tom(120, 0.25, 'triangle', 0.35, 0, 0.5); this.ruido(0.2, 0.25, 500); break;
      case 'golpe': this.ruido(0.07, 0.35, 1200); this.tom(220 * v, 0.06, 'sawtooth', 0.12, 0, 0.5); break;
      case 'dano': this.tom(160, 0.18, 'sawtooth', 0.22, 0, 0.5); break;
      case 'criar': [0, 4, 7].forEach((n, i) => this.tom(523 * 2 ** (n / 12), 0.12, 'triangle', 0.2, i * 0.06)); break;
      case 'construir': this.tom(196, 0.12, 'square', 0.12); this.tom(294, 0.16, 'triangle', 0.2, 0.08); break;
      case 'nivel': [0, 4, 7, 12, 16].forEach((n, i) => this.tom(523 * 2 ** (n / 12), 0.18, 'triangle', 0.22, i * 0.08)); break;
      case 'magia': this.tom(700, 0.25, 'sine', 0.2, 0, 2); this.ruido(0.2, 0.15, 2500); break;
      case 'cura': [0, 7, 12].forEach((n, i) => this.tom(660 * 2 ** (n / 12), 0.25, 'sine', 0.15, i * 0.07)); break;
      case 'noite': [12, 7, 4, 0].forEach((n, i) => this.tom(330 * 2 ** (n / 12), 0.4, 'sine', 0.12, i * 0.18)); break;
      case 'clique': this.tom(880, 0.04, 'square', 0.06); break;
    }
  }

  /** Música generativa calma: pentatônica, mais grave e lenta à noite. Chamar a cada quadro. */
  atualizarMusica(noite: boolean) {
    if (!this.ctx || !this.musica) return;
    const c = this.ctx;
    const bpm = noite ? 60 : 76, colcheia = 60 / bpm / 2;
    const raiz = noite ? 196 : 262; // sol / dó
    while (this.proximaNota < c.currentTime + 0.4) {
      const t0 = this.proximaNota - c.currentTime;
      if (this.passo % 8 === 0) this.tom(raiz / 2, colcheia * 7, 'sine', 0.35, t0, 0, this.musicaGanho);
      if (Math.random() < (noite ? 0.35 : 0.55)) {
        const n = PENTA[Math.floor(Math.random() * PENTA.length)] + (Math.random() < 0.3 ? 12 : 0);
        this.tom(raiz * 2 ** (n / 12), colcheia * 1.8, 'triangle', 0.25, t0, 0, this.musicaGanho);
      }
      this.proximaNota += colcheia; this.passo++;
    }
  }
}
