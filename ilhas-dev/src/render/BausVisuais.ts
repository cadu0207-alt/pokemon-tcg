import Phaser from 'phaser';
import { GUARDIOES, RARIDADES, REAPARECE_MS, abrirBau, gerarBaus, novoBau, type Bau } from '../sim/baus';
import type { Inventario } from '../sim/inventario';
import type { ItemId } from '../sim/itens';
import type { Mundo } from '../sim/mundo';
import { criarRng } from '../sim/rng';
import type { Fauna } from './Fauna';
import { T } from './texturas';

interface Visual { bau: Phaser.GameObjects.Image; brilho: Phaser.GameObjects.Image; rotulo?: Phaser.GameObjects.Text; }

/** Baús espalhados pelas ilhas neutras: desenho, guardiões, abertura e reaparecimento. */
/** Nível do personagem recomendado para encarar os guardiões de cada raridade. */
export const NIVEL_RECOMENDADO: Record<import('../sim/baus').Raridade, number> = { comum: 3, raro: 5, epico: 7, lendario: 9 };

export class BausVisuais {
  baus: Bau[];
  /** nível do jogador (para colorir o aviso de perigo do baú) */
  nivelJogador: () => number = () => 1;
  private visuais = new Map<number, Visual>();
  private reaparecer: number[] = [];     // instantes em que um baú novo deve surgir
  private proximoId: number;
  private rng: () => number;

  constructor(
    private scene: Phaser.Scene, private mundo: Mundo, seed: number,
    private fauna: Fauna, private bloquear: (x: number, y: number, sim: boolean) => void,
    private ocupado: (x: number, y: number) => boolean,
    salvo?: { baus: Bau[]; proximoId: number },
  ) {
    this.rng = criarRng(seed ^ 0x7e50 ^ Date.now());
    this.baus = salvo?.baus ?? gerarBaus(mundo, seed, ocupado);
    this.proximoId = salvo?.proximoId ?? this.baus.length;
    for (const b of this.baus) { b.guardioesCriados = b.guardioesCriados && b.guardioes === 0; if (!b.aberto) bloquear(b.x, b.y, true); }
    for (const b of this.baus) if (b.aberto) this.reaparecer.push(0);
    this.baus = this.baus.filter(b => !b.aberto);
  }

  salvar() { return { baus: this.baus, proximoId: this.proximoId }; }

  private textura(b: Bau): [string, number] {
    return [b.raridade === 'comum' || b.raridade === 'raro' ? 'bau-pequeno' : 'bau-grande', b.aberto ? 1 : 0];
  }

  /** Baú fechado perto do jogador (para o botão de ação). */
  perto(jx: number, jy: number, raio = 1.6): Bau | null {
    let melhor: Bau | null = null, d = raio;
    for (const b of this.baus) {
      if (b.aberto) continue;
      const dist = Math.hypot(b.x + 0.5 - jx, b.y + 0.5 - jy);
      if (dist < d) { d = dist; melhor = b; }
    }
    return melhor;
  }

  /** Guardiões vivos de um baú que estão no mundo agora. */
  private guardioesNoMundo(b: Bau) { return this.fauna.lista.filter(x => x.c.ancora?.bau === b.id).length; }

  guardiaoMorreu(bauId: number) {
    const b = this.baus.find(x => x.id === bauId);
    if (b) b.guardioes = Math.max(0, b.guardioes - 1);
  }

  abrir(b: Bau, mochila: Inventario): { pegou: Partial<Record<ItemId, number>> } | { motivo: 'guardioes' | 'vazio' } {
    const r = abrirBau(b, mochila);
    if ('pegou' in r && b.aberto) {
      const v = this.visuais.get(b.id);
      v?.bau.setFrame(1);
      this.bloquear(b.x, b.y, false);
      // some depois de um tempo e um novo surge em outro lugar
      this.scene.time.delayedCall(4000, () => { this.removerVisual(b.id); this.baus = this.baus.filter(x => x !== b); });
      this.reaparecer.push(this.scene.time.now + REAPARECE_MS);
    }
    return r;
  }

  private removerVisual(id: number) {
    const v = this.visuais.get(id);
    if (v) { v.bau.destroy(); v.brilho.destroy(); v.rotulo?.destroy(); this.visuais.delete(id); }
  }

  atualizar(jx: number, jy: number, vista: Phaser.Geom.Rectangle, agora: number) {
    // reaparecimento
    for (let i = this.reaparecer.length - 1; i >= 0; i--) {
      if (this.reaparecer[i] > agora) continue;
      this.reaparecer.splice(i, 1);
      const L = this.mundo.largura;
      const b = novoBau(this.proximoId++, this.mundo, (x, y) => this.ocupado(x, y) || this.baus.some(o => o.x === x && o.y === y) || Math.hypot(x - jx, y - jy) < 12, this.rng);
      if (b) { this.baus.push(b); this.bloquear(b.x, b.y, true); } void L;
    }
    const m = 3 * T;
    for (const b of this.baus) {
      const px = (b.x + 0.5) * T, py = (b.y + 1) * T;
      const visivel = px > vista.x - m && px < vista.right + m && py > vista.y - m && py < vista.bottom + m;
      let v = this.visuais.get(b.id);
      if (visivel && !v) {
        const [tex, quadro] = this.textura(b);
        const img = this.scene.add.image(px, py - 1, tex, quadro).setOrigin(0.5, 1).setDepth(py - 2);
        if (b.raridade === 'raro') img.setTint(0x9ad0ff);
        if (b.raridade === 'lendario') img.setTint(0xffe08a);
        const brilho = this.scene.add.image(px, py - 6, 'brilho').setBlendMode(Phaser.BlendModes.ADD).setDepth(20003)
          .setTint(RARIDADES[b.raridade].cor).setScale(b.raridade === 'lendario' ? 0.6 : 0.4);
        this.scene.tweens.add({ targets: brilho, alpha: { from: 0.25, to: 0.7 }, duration: 900 + this.rng() * 400, yoyo: true, repeat: -1 });
        const rotulo = this.scene.add.text(px, py - 20, ' ', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', fontStyle: 'bold', stroke: '#2b2238', strokeThickness: 5 })
          .setOrigin(0.5, 1).setScale(0.22).setDepth(20004);
        v = { bau: img, brilho, rotulo }; this.visuais.set(b.id, v);
      } else if (!visivel && v) { this.removerVisual(b.id); v = undefined; }
      if (v?.rotulo) {
        // nível recomendado e cor: verde = dá, amarelo = arriscado, vermelho = perigoso
        const rec = NIVEL_RECOMENDADO[b.raridade], nv = this.nivelJogador();
        const cor = b.aberto ? '#cccccc' : nv >= rec ? '#8fd37c' : nv >= rec - 1 ? '#ffd166' : '#ff7b6b';
        const txt = b.aberto ? '' : `${RARIDADES[b.raridade].nome} · Nv ${rec}${nv >= rec ? ' ✓' : nv >= rec - 1 ? ' ⚠' : ' ☠'}`;
        v.rotulo.setVisible(!!txt);
        if (txt && v.rotulo.text !== txt) v.rotulo.setText(txt);
        v.rotulo.setColor(cor);
      }
      // guardiões nascem quando o jogador chega perto (e voltam se ele tiver ido embora)
      if (b.aberto) continue;
      const dist = Math.hypot(b.x + 0.5 - jx, b.y + 0.5 - jy);
      if (dist > 9) continue;
      const g = GUARDIOES[b.raridade];
      if (!b.guardioesCriados) { b.guardioesCriados = true; b.guardioes = g.qtd[0] + Math.floor(this.rng() * (g.qtd[1] - g.qtd[0] + 1)); }
      for (let n = this.guardioesNoMundo(b); n < b.guardioes; n++) {
        const tipo = g.tipos[Math.floor(this.rng() * g.tipos.length)];
        let gx = b.x + 0.5, gy = b.y + 1.5;
        for (let t = 0; t < 12; t++) { // em terra, perto do baú
          const a = this.rng() * Math.PI * 2, r = 1.5 + this.rng() * 1.5;
          const x = b.x + 0.5 + Math.cos(a) * r, y = b.y + 0.5 + Math.sin(a) * r;
          if (this.fauna.livre(x, y)) { gx = x; gy = y; break; }
        }
        this.fauna.adicionar(tipo, gx, gy, g.raridade, { x: b.x + 0.5, y: b.y + 0.5, raio: 3.5, bau: b.id });
      }
    }
  }
}
