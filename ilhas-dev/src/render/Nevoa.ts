import Phaser from 'phaser';
import { Tile, type Mundo } from '../sim/mundo';
import { T } from './texturas';

/** Cada célula da névoa cobre R×R tiles (mundo de 480×480 tiles ⇒ 240×240 células). */
const R = 1;
/** Raio de visão do jogador, em tiles. */
export const RAIO_VISAO = 7;
/** a textura da névoa tem AMPLIA px por célula, para a borda sair suave */
const AMPLIA = 1;

/**
 * Névoa de guerra: tudo que você ainda não visitou fica coberto. A névoa é uma textura pequena
 * (1 pixel por célula) esticada sobre o mundo com filtro linear, o que deixa as bordas suaves.
 * O que já foi visto fica guardado no save como bits em base64.
 */
export class Nevoa {
  readonly larg: number; readonly alt: number;
  readonly visto: Uint8Array;
  private tex: Phaser.Textures.CanvasTexture;
  private dados: ImageData;
  /** máscara pequena (1 px por célula), ampliada com desfoque na textura final */
  private peq: HTMLCanvasElement;
  private ultima = -1;
  private sujo = false;

  constructor(scene: Phaser.Scene, mundo: Mundo, salvo?: string) {
    this.larg = Math.ceil(mundo.largura / R); this.alt = Math.ceil(mundo.altura / R);
    this.visto = new Uint8Array(this.larg * this.alt);
    if (salvo) this.carregar(salvo);
    if (scene.textures.exists('nevoa')) scene.textures.remove('nevoa');
    this.peq = document.createElement('canvas'); this.peq.width = this.larg; this.peq.height = this.alt;
    this.tex = scene.textures.createCanvas('nevoa', this.larg * AMPLIA, this.alt * AMPLIA)!;
    this.tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.dados = this.peq.getContext('2d')!.createImageData(this.larg, this.alt);
    for (let i = 0; i < this.visto.length; i++) this.pintar(i);
    this.redesenhar();
    // acima do mundo e da noite, abaixo do fantasma de construção e da interface
    scene.add.image(0, 0, 'nevoa').setOrigin(0).setDisplaySize(this.larg * R * T, this.alt * R * T).setDepth(25000);
  }

  private pintar(i: number) {
    const p = i * 4;
    this.dados.data[p] = 22; this.dados.data[p + 1] = 26; this.dados.data[p + 2] = 48;
    this.dados.data[p + 3] = Math.round(245 * (1 - this.visto[i] / 255));
  }

  /** Revela um círculo (em tiles). Devolve quantas células novas apareceram. */
  revelar(tx: number, ty: number, raio = RAIO_VISAO) {
    const cx = tx / R, cy = ty / R, rc = raio / R;
    let novas = 0;
    for (let y = Math.max(0, Math.floor(cy - rc - 1)); y <= Math.min(this.alt - 1, Math.ceil(cy + rc + 1)); y++)
      for (let x = Math.max(0, Math.floor(cx - rc - 1)); x <= Math.min(this.larg - 1, Math.ceil(cx + rc + 1)); x++) {
        const i = y * this.larg + x;
        // borda suave: clareia aos poucos nas últimas 2,5 células do raio
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const v = Math.round(Math.max(0, Math.min(1, (rc + 1 - d) / 2.5)) * 255);
        if (v <= this.visto[i]) continue;
        this.visto[i] = v; this.pintar(i); novas++;
      }
    if (novas) this.sujo = true;
    return novas;
  }

  /** Chamado a cada quadro: só recalcula quando o jogador muda de célula. */
  atualizar(px: number, py: number) {
    const tx = px / T, ty = py / T;
    const c = Math.floor(ty / R) * this.larg + Math.floor(tx / R);
    if (c !== this.ultima) { this.ultima = c; this.revelar(tx, ty); }
    if (this.sujo) { this.sujo = false; this.redesenhar(); }
  }

  private redesenhar() {
    this.peq.getContext('2d')!.putImageData(this.dados, 0, 0);
    const ctx = this.tex.context;
    ctx.clearRect(0, 0, this.tex.width, this.tex.height);
    // ampliação bilinear (funciona em todos os navegadores; ctx.filter não existe no Safari)
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.peq, 0, 0, this.tex.width, this.tex.height);
    this.tex.refresh();
    this.tex.setFilter(Phaser.Textures.FilterMode.LINEAR); // a placa de vídeo suaviza a borda
  }

  vistoEm(tx: number, ty: number) { return this.visto[Math.floor(ty / R) * this.larg + Math.floor(tx / R)] >= 128; }

  /** Fração do mundo já explorada (0–1), contando só células com terra. */
  explorado(mundo: Mundo) {
    let terra = 0, vistas = 0;
    for (let y = 0; y < this.alt; y++) for (let x = 0; x < this.larg; x++) {
      const t = mundo.tiles[(y * R) * mundo.largura + x * R];
      if (t === Tile.Agua || t === Tile.AguaFunda) continue;
      terra++; if (this.visto[y * this.larg + x] >= 128) vistas++;
    }
    return terra ? vistas / terra : 0;
  }

  salvar(): string {
    const bytes = new Uint8Array(Math.ceil(this.visto.length / 8));
    for (let i = 0; i < this.visto.length; i++) if (this.visto[i] >= 128) bytes[i >> 3] |= 1 << (i & 7);
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }

  private carregar(b64: string) {
    try {
      const s = atob(b64);
      for (let i = 0; i < this.visto.length && (i >> 3) < s.length; i++) this.visto[i] = ((s.charCodeAt(i >> 3) >> (i & 7)) & 1) * 255;
    } catch { /* save antigo/corrompido: começa sem nada visto */ }
  }
}

const COR: Record<Tile, [number, number, number]> = {
  [Tile.AguaFunda]: [52, 120, 190], [Tile.Agua]: [96, 178, 226], [Tile.Areia]: [240, 214, 150],
  [Tile.Grama]: [126, 190, 90], [Tile.Floresta]: [70, 140, 70], [Tile.Rocha]: [140, 136, 140],
};

export interface Marca { x: number; y: number; cor: string; raio?: number; rotulo?: string; /** só o contorno (círculo de influência), em tiles */ anel?: number }

/** Desenha o mapa-múndi num canvas: terreno onde já foi visto, névoa no resto, e as marcas. */
export function desenharMapaMundi(cv: HTMLCanvasElement, mundo: Mundo, nevoa: Nevoa, marcas: Marca[]) {
  const { larg, alt } = nevoa;
  cv.width = larg; cv.height = alt;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(larg, alt);
  for (let y = 0; y < alt; y++) for (let x = 0; x < larg; x++) {
    const i = y * larg + x, p = i * 4;
    if (nevoa.visto[i] < 128) {
      // névoa com um leve ruído para não parecer um bloco chapado
      const n = ((x * 73856093) ^ (y * 19349663)) & 7;
      img.data[p] = 34 + n; img.data[p + 1] = 38 + n; img.data[p + 2] = 64 + n; img.data[p + 3] = 255;
      continue;
    }
    const c = COR[mundo.tiles[(y * R) * mundo.largura + x * R] as Tile] ?? COR[Tile.Agua];
    img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (const m of marcas) {
    if (m.anel) { ctx.strokeStyle = m.cor; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(m.x / R, m.y / R, m.anel / R, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; continue; }
    ctx.fillStyle = m.cor; ctx.strokeStyle = '#2b2238'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(m.x / R, m.y / R, m.raio ?? 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
