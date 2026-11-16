import Phaser from 'phaser';
import { gerarMundo, tileEm, ehAgua, TILE_ANDAVEL, type Mundo, type Recurso } from '../sim/mundo';
import { iniciarRecursos, golpear, atualizarRecursos, recursoAtivo, ferramentaPara, type EstadoRecursos } from '../sim/coleta';
import { CRIATURAS, DURACAO_DIA, bonusDano, ehNoite, ganharXp, novoStatus, type Status } from '../sim/criaturas';
import { novoInventario, remover, qtd, adicionar, desgastar, type Inventario } from '../sim/inventario';
import { nivelIlha, validarLocal, type Construcao } from '../sim/construcao';
import { carregar, serializar } from '../sim/save';
import { ITENS, type ItemId } from '../sim/itens';
import { criarChibi, quadroParado } from './chibi';
import { criarCriaturas, criarTileset, T, TILE_CONSTRUCAO, TILE_RECURSO as RECURSO_TILE } from './texturas';
import { Fauna } from './Fauna';
import { DiaNoite } from './DiaNoite';
import { BotsVisuais } from './BotsVisuais';
import { MapaEmPedacos } from './MapaEmPedacos';
import { Magias } from './Magias';
import { Som, type Efeito } from './Som';
import { MISSOES, missaoAtual } from '../sim/tutorial';
import { DIFICULDADE, type Dificuldade } from '../sim/bots';

export interface Config { seed: number; participantes: number; bots: number; dificuldade: Dificuldade; novo: boolean; }
import { aprender, efeitos, MAGIAS, podeAprender, type Efeitos, type Magia } from '../sim/habilidades';
import { Interface, toque } from './ui';

const VELOCIDADE = 5;          // tiles por segundo
const INTERVALO_GOLPE = 280;   // ms entre golpes em recursos
const INTERVALO_ATAQUE = 380;  // ms entre golpes em criaturas
const INVULNERAVEL = 600;      // ms sem levar dano depois de um golpe
const DIRS = ['baixo', 'cima', 'esquerda', 'direita'] as const;
type Dir = (typeof DIRS)[number];
const VETOR: Record<Dir, [number, number]> = { baixo: [0, 1], cima: [0, -1], esquerda: [-1, 0], direita: [1, 0] };

export class CenaJogo extends Phaser.Scene {
  private mundo!: Mundo;
  private recursos!: EstadoRecursos;
  private inv: Inventario = novoInventario();
  private ui!: Interface;
  private jogador!: Phaser.GameObjects.Sprite;
  private mapa!: MapaEmPedacos;
  /** construções de todos (jogador e bots), por índice do tile */
  private construidoEm = new Map<number, ItemId>();
  private alvo!: Phaser.GameObjects.Rectangle;
  private teclas!: Record<string, Phaser.Input.Keyboard.Key>;
  private bloqueio = new Set<number>();
  private direcao: Dir = 'baixo';
  private ultimoGolpe = 0;
  private golpeando = false;
  private construcoes: Construcao[] = [];
  private nivel = 1;
  private fantasma!: Phaser.GameObjects.Image;
  private localEscolhido: { x: number; y: number } | null = null;
  private chaveSave = '';
  private sujo = false;
  private status: Status = novoStatus();
  private fauna!: Fauna;
  private diaNoite!: DiaNoite;
  private tempoMundo = DURACAO_DIA * 0.15; // começa de manhã
  private eraNoite = false;
  private invulneravelAte = 0;
  private morto = false;
  private habilidades: string[] = [];
  private ef: Efeitos = efeitos([]);
  private mana = 0;
  private magias!: Magias;
  private som = new Som();
  private cfg!: Config;
  private missao = 0;
  private criados: Partial<Record<ItemId, number>> = {};
  private mortos = 0;
  private sombra!: Phaser.GameObjects.Image;
  private barco!: Phaser.GameObjects.Image;
  private avisouJangada = false;
  private naAgua = false;
  private bots!: BotsVisuais;
  private assistindo: import('../sim/bots').Bot | null = null;

  constructor() { super('jogo'); }

  create() {
    this.cfg = this.registry.get('cfg') as Config;
    const { seed, participantes } = this.cfg;
    this.mundo = gerarMundo({ seed, participantes });
    this.recursos = iniciarRecursos(this.mundo);
    this.chaveSave = `ilhas-save-${seed}-${participantes}`;
    let lido: string | null = null;
    try {
      if (this.cfg.novo) localStorage.removeItem(this.chaveSave);
      lido = localStorage.getItem(this.chaveSave);
    } catch { /* armazenamento bloqueado */ }
    const save = carregar(lido, seed, participantes);
    criarTileset(this);
    criarChibi(this, 'heroi', { pele: '#ffe0c8', cabelo: '#ff8fb1', roupa: '#7aa7ff', calca: '#4a5a8a', penteado: 'rabo' });
    criarCriaturas(this);

    const m = this.mundo;
    this.mapa = new MapaEmPedacos(this, m, (x, y) => {
      const i = this.idx(x, y);
      const c = this.construidoEm.get(i);
      if (c) return TILE_CONSTRUCAO[c as keyof typeof TILE_CONSTRUCAO];
      const r = this.recursos.porTile.get(i);
      return r && recursoAtivo(this.recursos, r) ? RECURSO_TILE[r.tipo] : -1;
    });
    if (save) {
      Object.assign(this.inv.itens, save.inventario.itens);
      Object.assign(this.inv.durabilidade, save.inventario.durabilidade);
      this.construcoes = save.construcoes;
      if (save.status) this.status = save.status;
      if (save.habilidades) this.habilidades = save.habilidades;
      if (save.mana !== undefined) this.mana = save.mana;
      if (save.tutorial) { this.missao = save.tutorial.missao; this.criados = save.tutorial.criados; this.mortos = save.tutorial.mortos; }
      else if (nivelIlha(save.construcoes) >= 2) this.missao = MISSOES.length; // jogador veterano: sem tutorial
      if (save.tempo !== undefined) this.tempoMundo = save.tempo;
    }
    for (const c of this.construcoes) this.removerRecursoSob(c.x, c.y);
    for (const r of m.recursos) if (this.recursos.porTile.get(this.idx(r.x, r.y)) === r) this.mostrarRecurso(r);
    for (const c of this.construcoes) this.mostrarConstrucao(c);
    this.nivel = nivelIlha(this.construcoes);

    // Bots: cada um na sua ilha, decidindo sozinho o que fazer.
    const nBots = Math.max(0, Math.min(participantes - 1, this.cfg.bots));
    this.bots = new BotsVisuais(this, m, nBots, seed,
      r => { this.mapa.definirObjeto(r.x, r.y, -1); this.bloqueio.delete(this.idx(r.x, r.y)); },
      c => { this.removerRecursoSob(c.x, c.y); this.mostrarConstrucao(c); },
      save?.bots);
    for (const c of this.bots.todasConstrucoes()) {
      if (this.recursos.porTile.get(this.idx(c.x, c.y))) this.removerRecursoSob(c.x, c.y);
      this.mostrarConstrucao(c);
    }

    const casa = m.ilhas[0];
    const ini = save?.jogador ?? { x: (Math.round(casa.cx) + 0.5) * T, y: (Math.round(casa.cy) + 0.5) * T };
    this.jogador = this.add.sprite(ini.x, ini.y, 'heroi', 0);
    this.jogador.setOrigin(0.5, 0.92).setDepth(this.jogador.y);
    this.sombra = this.add.image(0, 0, 'sombra').setAlpha(0.28);
    const destravar = () => this.som.destravar();
    window.addEventListener('pointerdown', destravar); window.addEventListener('keydown', destravar);
    this.barco = this.add.image(0, 0, 'jangada').setOrigin(0.5, 0).setVisible(false);
    const andavel = (tx: number, ty: number) => TILE_ANDAVEL[tileEm(m, tx, ty)] && !this.bloqueio.has(this.idx(tx, ty));
    this.fauna = new Fauna(this, andavel, m.ilhas[0], () => this.construcoes.filter(c => c.tipo === 'fogueira'), seed);
    this.diaNoite = new DiaNoite(this);
    this.eraNoite = ehNoite(this.tempoMundo);
    this.time.addEvent({ delay: 700, loop: true, callback: () => {
      if (!this.morto) this.fauna.tentarNascer(this.jogador.x / T, this.jogador.y / T, ehNoite(this.tempoMundo));
    } });
    const tex = this.textures.get('tileset');
    for (const [, i] of Object.entries(TILE_CONSTRUCAO)) tex.add(`t${i}`, 0, 1 + i * (T + 2), 1, T, T);
    this.fantasma = this.add.image(0, 0, 'tileset', `t${TILE_CONSTRUCAO.fogueira}`).setOrigin(0).setDepth(6).setAlpha(0.75).setVisible(false);
    this.alvo = this.add.rectangle(0, 0, T, T).setStrokeStyle(1, 0xffffff, 0.9).setOrigin(0).setDepth(5).setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, m.largura * T, m.altura * T);
    // Mostra ~13 tiles no lado menor da tela (bom no celular e no PC).
    cam.setZoom(Phaser.Math.Clamp(Math.min(this.scale.width, this.scale.height) / (T * 13), 2, 4)).startFollow(this.jogador, true, 0.15, 0.15).setRoundPixels(true);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.25, 6));
    });

    const kb = this.input.keyboard!;
    this.teclas = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.ui = new Interface(this.inv, {
      nivel: () => this.nivel,
      construcoes: () => this.construcoes,
      selecionarConstrucao: id => this.selecionarConstrucao(id),
      confirmarConstrucao: () => this.construir(),
      zoom: f => cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, 0.5, 5)),
      comer: id => this.comer(id),
      ranking: () => this.bots.ranking({ construcoes: this.construcoes, status: this.status }),
      assistir: nome => this.assistir(nome),
      habilidades: () => ({ status: this.status, aprendidas: this.habilidades }),
      aprender: id => this.aprenderHabilidade(id),
      lancar: m => this.lancar(m),
      criou: id => { this.criados[id] = (this.criados[id] ?? 0) + 1; this.tocar('criar'); },
      alternarSom: () => this.som.alternarSom(),
      alternarMusica: () => this.som.alternarMusica(),
      tocar: e => this.tocar(e),
      mudou: () => this.mudou(),
    });
    this.ui.somLigado = () => this.som.ligado;
    this.ui.musicaLigada = () => this.som.musica;
    kb.on('keydown-C', () => this.ui.alternarCraft());
    kb.on('keydown-ESC', () => { this.selecionarConstrucao(null); this.assistir(null); });
    kb.on('keydown-R', () => this.ui.alternarRanking());
    kb.on('keydown-K', () => this.ui.alternarHabilidades());
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((tecla, i) => kb.on(`keydown-${tecla}`, () => {
      const m = this.ef.magias[i]; if (m) this.lancar(m);
    }));
    this.ef = efeitos(this.habilidades);
    this.magias = new Magias(this, this.fauna, (b, dano) => this.ferirBicho(b, dano));
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.ui.atualizarRanking() });
    this.ui.atualizar();

    // No modo de construção: mouse escolhe e clica para construir; no toque, o toque escolhe e o ✔ confirma.
    const tilePonteiro = (p: Phaser.Input.Pointer) => {
      const w = cam.getWorldPoint(p.x, p.y);
      return { x: Math.floor(w.x / T), y: Math.floor(w.y / T) };
    };
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.ui.construindo && !toque.ativo) this.localEscolhido = tilePonteiro(p);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.ui.construindo) return;
      this.localEscolhido = tilePonteiro(p);
      if (!toque.ativo) this.construir();
    });

    // Salva a cada 5 s se algo mudou, e ao sair da página.
    this.time.addEvent({ delay: 5000, loop: true, callback: () => this.salvar() });
    window.addEventListener('pagehide', () => this.salvar(true));
    document.addEventListener('visibilitychange', () => document.hidden && this.salvar(true));
    if (save) this.ui.aviso('Progresso carregado');
    document.getElementById('missao')!.addEventListener('click', e => (e.currentTarget as HTMLElement).classList.toggle('fechada'));
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.atualizarTutorial() });

    // Recursos renascem: checa a cada segundo.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.renascer() });
  }

  private idx(x: number, y: number) { return y * this.mundo.largura + x; }

  private mostrarRecurso(r: Recurso) {
    this.mapa.definirObjeto(r.x, r.y, RECURSO_TILE[r.tipo]);
    if (r.tipo !== 'arbusto') this.bloqueio.add(this.idx(r.x, r.y));
  }

  private mostrarConstrucao(c: Construcao) {
    this.construidoEm.set(this.idx(c.x, c.y), c.tipo);
    this.mapa.definirObjeto(c.x, c.y, TILE_CONSTRUCAO[c.tipo as keyof typeof TILE_CONSTRUCAO]);
    this.bloqueio.add(this.idx(c.x, c.y));
  }

  /** Construção em cima de um recurso o remove de vez (não renasce mais). */
  private removerRecursoSob(x: number, y: number) {
    const r = this.recursos.porTile.get(this.idx(x, y));
    if (r) this.recursos.porTile.delete(this.idx(x, y));
  }

  private mudou() { this.sujo = true; this.ui.atualizar(); }

  private salvar(forcar = false) {
    if (!this.sujo && !forcar) return;
    const texto = serializar({
      seed: this.mundo.seed, participantes: this.mundo.ilhas.filter(i => i.dono !== null).length,
      jogador: { x: Math.round(this.jogador.x), y: Math.round(this.jogador.y) },
      inventario: this.inv, construcoes: this.construcoes,
      status: this.status, tempo: Math.round(this.tempoMundo), habilidades: this.habilidades, mana: Math.floor(this.mana),
      tutorial: { missao: this.missao, criados: this.criados, mortos: this.mortos },
      bots: this.bots.salvar(),
    });
    try { localStorage.setItem(this.chaveSave, texto); this.sujo = false; } catch { /* sem armazenamento: segue sem salvar */ }
  }

  private selecionarConstrucao(id: ItemId | null) {
    if (id && qtd(this.inv, id) === 0) id = null;
    this.localEscolhido = null;
    this.ui.alternarCraft(false);
    this.ui.modoConstrucao(id);
    this.fantasma.setVisible(!!id);
    if (id) this.fantasma.setFrame(`t${TILE_CONSTRUCAO[id as keyof typeof TILE_CONSTRUCAO]}`);
  }

  private localConstrucao() {
    if (this.localEscolhido) return this.localEscolhido;
    const [dx, dy] = VETOR[this.direcao];
    return { x: Math.floor(this.jogador.x / T) + dx, y: Math.floor(this.jogador.y / T) + dy };
  }

  private motivoInvalido(x: number, y: number) {
    const ocupado = (tx: number, ty: number) => {
      const r = this.recursos.porTile.get(this.idx(tx, ty));
      return !!r && recursoAtivo(this.recursos, r);
    };
    const motivo = validarLocal(this.mundo, this.mundo.ilhas[0], this.construcoes, ocupado, x, y);
    if (motivo) return motivo;
    // Não pode construir em cima do personagem.
    const j = this.jogador;
    if (Math.abs(j.x - (x + 0.5) * T) < T * 0.85 && Math.abs(j.y - (y + 0.5) * T) < T * 0.7) return 'ocupado';
    return null;
  }

  private construir() {
    const id = this.ui.construindo;
    if (!id) return;
    const { x, y } = this.localConstrucao();
    const motivo = this.motivoInvalido(x, y);
    if (motivo) {
      this.ui.aviso(motivo === 'fora_da_ilha' ? 'Só dá para construir na sua ilha' : motivo === 'terreno' ? 'Terreno inválido' : 'Local ocupado');
      return;
    }
    remover(this.inv, id, 1);
    const c = { tipo: id, x, y };
    this.construcoes.push(c);
    this.removerRecursoSob(x, y);
    this.mostrarConstrucao(c);
    const cx = (x + 0.5) * T, cy = (y + 0.5) * T;
    for (let i = 0; i < 8; i++) {
      const p = this.add.rectangle(cx, cy + 4, 2, 2, 0xf6efe0).setDepth(11);
      this.tweens.add({ targets: p, x: cx + Phaser.Math.Between(-12, 12), y: cy + Phaser.Math.Between(-4, 8), alpha: 0, duration: 450, onComplete: () => p.destroy() });
    }
    this.tocar('construir');
    const novo = nivelIlha(this.construcoes);
    if (novo > this.nivel) {
      this.nivel = novo;
      this.ui.aviso(`Sua ilha subiu para o nível ${novo}!`);
      this.tocar('nivel');
      this.cameras.main.flash(300, 255, 240, 200);
    }
    if (qtd(this.inv, id) === 0) this.selecionarConstrucao(null);
    else this.localEscolhido = null;
    this.mudou();
    this.salvar(true);
  }

  private renascer() {
    const agora = this.time.now;
    for (const r of atualizarRecursos(this.recursos, this.mundo, agora)) {
      if (this.recursos.porTile.get(this.idx(r.x, r.y)) !== r) continue; // tem construção em cima
      const tx = Math.floor(this.jogador.x / T), ty = Math.floor(this.jogador.y / T);
      if (r.tipo !== 'arbusto' && Math.abs(tx - r.x) <= 1 && Math.abs(ty - r.y) <= 1) {
        this.recursos.renasce.set(r.id, agora + 5000); // não nasce em cima do jogador
        continue;
      }
      this.mostrarRecurso(r);
    }
  }

  private livre(px: number, py: number) {
    const jangada = qtd(this.inv, 'jangada') > 0;
    for (const [ox, oy] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) {
      const tx = Math.floor((px + ox) / T), ty = Math.floor((py + oy) / T);
      if (tx < 0 || ty < 0 || tx >= this.mundo.largura || ty >= this.mundo.altura) return false;
      const t = tileEm(this.mundo, tx, ty);
      if (!(TILE_ANDAVEL[t] || (jangada && ehAgua(t))) || this.bloqueio.has(this.idx(tx, ty))) return false;
    }
    return true;
  }

  /** Recurso à frente do personagem; se não houver, o mais próximo encostado nele. */
  private recursoAlvo(): Recurso | null {
    const j = this.jogador;
    const tx = Math.floor(j.x / T), ty = Math.floor(j.y / T);
    const [dx, dy] = VETOR[this.direcao];
    const ativo = (x: number, y: number) => {
      const r = this.recursos.porTile.get(this.idx(x, y));
      return r && recursoAtivo(this.recursos, r) ? r : null;
    };
    const frente = ativo(tx + dx, ty + dy) ?? ativo(tx, ty);
    if (frente) return frente;
    let melhor: Recurso | null = null, dist = Infinity;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const r = ativo(tx + ox, ty + oy);
      if (!r) continue;
      const d = Math.hypot((r.x + 0.5) * T - j.x, (r.y + 0.5) * T - j.y);
      if (d < dist && d < T * 1.4) { dist = d; melhor = r; }
    }
    return melhor;
  }

  private golpe(r: Recurso) {
    const res = golpear(this.recursos, this.inv, r, this.time.now, { bonus: this.ef.coleta, extra: this.ef.extra, poupar: this.ef.poupar });
    if (!res) return;
    const cx = (r.x + 0.5) * T, cy = (r.y + 0.5) * T;
    // Personagem dá um "tranco" na direção do alvo.
    this.golpeando = true;
    const [dx, dy] = [Math.sign(cx - this.jogador.x), Math.sign(cy - this.jogador.y)];
    this.tweens.add({
      targets: this.jogador, x: this.jogador.x + dx * 2, y: this.jogador.y + dy * 2,
      duration: 70, yoyo: true, onComplete: () => (this.golpeando = false),
    });
    // Lascas saindo do recurso.
    const cor = r.tipo === 'pedra' || r.tipo === 'minerio' ? 0xb9b4b0 : r.tipo === 'cristal' ? 0xa98bff : r.tipo === 'arvore' ? 0x8a5a3c : 0x6db35c;
    for (let i = 0; i < 4; i++) {
      const p = this.add.rectangle(cx, cy, 2, 2, cor).setDepth(11);
      this.tweens.add({
        targets: p, x: cx + Phaser.Math.Between(-10, 10), y: cy + Phaser.Math.Between(-12, 2),
        alpha: 0, duration: 350, onComplete: () => p.destroy(),
      });
    }
    this.tocar(r.tipo === 'arvore' ? 'madeira' : r.tipo === 'arbusto' ? 'arbusto' : 'pedra');
    if (res.ferramentaQuebrou && res.ferramenta) this.ui.aviso(`${ITENS[res.ferramenta].nome} quebrou!`);
    if (res.destruido) {
      this.tocar('cai');
      this.mapa.definirObjeto(r.x, r.y, -1);
      this.bloqueio.delete(this.idx(r.x, r.y));
      let i = 0;
      for (const [id, n] of Object.entries(res.ganhos)) this.textoFlutuante(cx, cy - 6 - i++ * 7, `+${n} ${ITENS[id as ItemId].nome}`);
    }
    this.mudou();
  }

  private assistir(nome: string | null) {
    const cam = this.cameras.main;
    const bot = nome ? this.bots.bots.find(b => b.nome === nome) ?? null : null;
    this.assistindo = bot;
    this.ui.assistindo(bot?.nome ?? null, bot?.perfil);
    if (!bot) cam.startFollow(this.jogador, true, 0.15, 0.15);
    else cam.stopFollow();
  }

  private tocar(e: Efeito) {
    this.som.tocar(e);
    // vibração curta no celular (Android; o iPhone ignora)
    const ms = { madeira: 8, pedra: 8, golpe: 15, cai: 25, dano: 45, nivel: 30 }[e as string];
    if (ms && toque.ativo && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* sem vibração */ }
  }

  /** Avança o tutorial e mostra a missão atual. */
  private atualizarTutorial() {
    const el = document.getElementById('missao')!;
    const nova = missaoAtual({ inv: this.inv, construcoes: this.construcoes, status: this.status, habilidades: this.habilidades, criados: this.criados, mortos: this.mortos }, this.missao);
    if (nova !== this.missao) {
      this.missao = nova; this.sujo = true;
      el.classList.remove('feita'); void el.offsetWidth; el.classList.add('feita');
      this.tocar('criar');
      if (nova >= MISSOES.length) this.ui.aviso('Tutorial completo! Agora é com você');
    }
    if (this.missao >= MISSOES.length || this.assistindo) { el.hidden = true; return; }
    const m = MISSOES[this.missao];
    el.hidden = false;
    const html = `<b>${this.missao + 1}/${MISSOES.length} · ${m.titulo}</b><p>${m.dica}</p><small>toque para recolher</small>`;
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  }

  private aprenderHabilidade(id: string) {
    const motivo = podeAprender(this.status, this.habilidades, id);
    if (motivo) {
      if (motivo !== 'aprendida') this.ui.aviso(motivo === 'nivel' ? 'Seu nível ainda é baixo' : motivo === 'sem_pontos' ? 'Sem pontos: suba de nível' : 'Aprenda a anterior primeiro');
      return;
    }
    aprender(this.status, this.habilidades, id);
    const antes = this.ef.manaMax;
    this.ef = efeitos(this.habilidades);
    if (this.ef.manaMax > antes) this.mana = this.ef.manaMax;
    this.ui.aviso('Nova habilidade aprendida!');
    this.mudou();
  }

  private lancar(m: Magia) {
    const t = this.time.now;
    if (this.morto || this.assistindo || !this.ef.magias.includes(m)) return;
    if (!this.magias.pronta(m, t)) return;
    const custo = MAGIAS[m].custo;
    if (this.mana < custo) { this.ui.aviso('Mana insuficiente'); return; }
    this.mana -= custo;
    const cura = this.magias.lancar(m, t, this.jogador.x, this.jogador.y, VETOR[this.direcao]);
    this.tocar(cura ? 'cura' : 'magia');
    if (cura) {
      this.status.vida = Math.min(this.status.vidaMax, this.status.vida + cura);
      this.textoFlutuante(this.jogador.x, this.jogador.y - 14, `+${cura} vida`, '#9be38a');
    }
    if (m === 'pedra') this.ui.aviso('Pele de pedra: metade do dano por 8 s');
    if (m === 'vento') this.ui.aviso('Rajada de vento!');
    this.sujo = true;
  }

  private comer(id: ItemId) {
    if (ITENS[id].mana) {
      if (!this.ef.manaMax) { this.ui.aviso('Aprenda magia (Arcano) para usar mana'); return; }
      if (this.mana >= this.ef.manaMax) { this.ui.aviso('Mana cheia'); return; }
      if (!remover(this.inv, id, 1)) return;
      this.mana = Math.min(this.ef.manaMax, this.mana + ITENS[id].mana!);
      this.textoFlutuante(this.jogador.x, this.jogador.y - 14, `+${ITENS[id].mana} mana`, '#9cc0ff');
      this.mudou(); return;
    }
    const cura = Math.round((ITENS[id].comida ?? 0) * (1 + this.ef.comida));
    if (this.status.vida >= this.status.vidaMax) { this.ui.aviso('Você está de barriga cheia'); return; }
    if (!remover(this.inv, id, 1)) return;
    this.status.vida = Math.min(this.status.vidaMax, this.status.vida + cura);
    this.textoFlutuante(this.jogador.x, this.jogador.y - 14, `+${cura} vida`, '#9be38a');
    this.mudou();
  }

  private atacar(b: import('./Fauna').Bicho) {
    const arma = ferramentaPara(this.inv, 'criatura');
    // Sem arma, o machado ajuda um pouco.
    const base = arma.id ? arma.dano : qtd(this.inv, 'machado_pedra') ? 2 : 1;
    const critico = Math.random() < this.ef.critico;
    const dano = (base + bonusDano(this.status) + this.ef.dano) * (critico ? 2 : 1);
    if (arma.id && !(Math.random() < this.ef.poupar) && desgastar(this.inv, arma.id)) this.ui.aviso(`${ITENS[arma.id].nome} quebrou!`);
    const j = this.jogador;
    this.golpeando = true;
    const [dx, dy] = [Math.sign(b.c.x * T - j.x), Math.sign(b.c.y * T - j.y)];
    this.tweens.add({ targets: j, x: j.x + dx * 3, y: j.y + dy * 3, duration: 70, yoyo: true, onComplete: () => (this.golpeando = false) });
    this.tocar('golpe');
    this.ferirBicho(b, dano, critico);
    this.mudou();
  }

  /** Dano em criatura por golpe ou magia: recompensa, XP e nível. */
  private ferirBicho(b: import('./Fauna').Bicho, dano: number, critico = false) {
    const j = this.jogador;
    this.textoFlutuante(b.c.x * T, b.c.y * T - 14, critico ? `${dano}!` : `${dano}`, critico ? '#ff8a3c' : '#ffd166');
    const def = CRIATURAS[b.c.tipo];
    if (this.fauna.ferir(b, dano, j.x / T, j.y / T)) {
      let i = 0;
      for (const [id, n] of Object.entries(def.solta)) {
        adicionar(this.inv, id as ItemId, n ?? 0);
        this.textoFlutuante(b.c.x * T, b.c.y * T - 20 - i++ * 7, `+${n} ${ITENS[id as ItemId].nome}`);
      }
      const subiu = ganharXp(this.status, def.xp);
      this.textoFlutuante(j.x, j.y - 26, `+${def.xp} XP`, '#ffd166');
      this.mortos++;
      if (subiu) { this.tocar('nivel'); this.ui.aviso(`Você subiu para o nível ${this.status.nivel}!`); this.cameras.main.flash(250, 255, 230, 150); }
    }
    this.mudou();
  }

  private levarDano(dano: number, agora: number) {
    if (dano <= 0 || this.morto || agora < this.invulneravelAte) return;
    this.invulneravelAte = agora + INVULNERAVEL;
    if (this.time.now < this.magias.escudoAte) dano = Math.ceil(dano / 2);
    this.status.vida -= dano;
    this.textoFlutuante(this.jogador.x, this.jogador.y - 14, `-${dano}`, '#ff8080');
    this.tocar('dano');
    this.jogador.setTint(0xff8080);
    this.time.delayedCall(150, () => this.jogador.clearTint());
    this.cameras.main.shake(120, 0.004);
    document.body.classList.remove('dano'); void document.body.offsetWidth; document.body.classList.add('dano');
    if (this.status.vida <= 0) this.desmaiar();
    this.sujo = true;
  }

  /** Sem punição pesada: acorda em casa com a vida cheia e mantém a mochila. */
  private desmaiar() {
    this.morto = true;
    this.status.vida = 0;
    this.cameras.main.fadeOut(700, 20, 16, 40);
    this.time.delayedCall(900, () => {
      const casa = this.mundo.ilhas[0];
      this.jogador.setPosition((Math.round(casa.cx) + 0.5) * T, (Math.round(casa.cy) + 0.5) * T);
      for (const b of [...this.fauna.lista]) this.fauna.remover(b);
      this.status.vida = this.status.vidaMax;
      this.morto = false;
      this.invulneravelAte = this.time.now + 3000;
      this.cameras.main.fadeIn(700, 20, 16, 40);
      this.ui.aviso('Você desmaiou e acordou em casa');
      this.mudou();
    });
  }

  private textoFlutuante(x: number, y: number, txt: string, cor = '#fff') {
    const t = this.add.text(x, y, txt, {
      fontFamily: 'monospace', fontSize: '24px', color: cor, stroke: '#3a2f45', strokeThickness: 5,
    }).setOrigin(0.5).setScale(0.25).setDepth(30000);
    this.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: 1100, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  update(t: number, dt: number) {
    const k = this.teclas;
    const j = this.jogador;
    this.mapa.atualizar(this.cameras.main.worldView);
    // Relógio do mundo, noite e criaturas.
    this.tempoMundo += dt;
    const noite = ehNoite(this.tempoMundo);
    if (noite !== this.eraNoite) {
      this.eraNoite = noite;
      this.ui.aviso(noite ? 'A noite chegou — fique perto de uma fogueira' : 'Amanheceu');
      if (noite) this.tocar('noite');
    }
    this.diaNoite.atualizar(this.tempoMundo, this.construcoes.filter(c => c.tipo === 'fogueira'), t);
    this.levarDano(this.fauna.atualizar(dt, j.x / T, j.y / T, !this.morto, noite), t);
    if (!this.morto) {
      this.mana = Math.min(this.ef.manaMax, this.mana + dt / 1000);
      if (this.ef.regen) this.status.vida = Math.min(this.status.vidaMax, this.status.vida + (this.ef.regen * dt) / 1000);
    }
    this.magias.atualizar(dt, (px, py) => !TILE_ANDAVEL[tileEm(this.mundo, Math.floor(px / T), Math.floor(py / T))] && !ehAgua(tileEm(this.mundo, Math.floor(px / T), Math.floor(py / T))) || this.bloqueio.has(this.idx(Math.floor(px / T), Math.floor(py / T))));
    this.ui.atualizarMagias(this.ef.magias, this.mana, m => this.magias.progressoRecarga(m, t));
    this.ui.atualizarStatus(this.status, noite, (this.tempoMundo % DURACAO_DIA) / DURACAO_DIA, this.mana, this.ef.manaMax);
    this.bots.atualizar({
      mundo: this.mundo, recursos: this.recursos, agora: t, noite,
      ritmo: DIFICULDADE[this.cfg.dificuldade].ritmo, velocidade: DIFICULDADE[this.cfg.dificuldade].velocidade, preguica: DIFICULDADE[this.cfg.dificuldade].preguica,
      bloqueado: (x, y) => this.bloqueio.has(this.idx(x, y)),
    }, Math.min(dt, 100));
    if (this.assistindo) {
      const cam = this.cameras.main;
      cam.centerOn(Phaser.Math.Linear(cam.midPoint.x, this.assistindo.x * T, 0.15), Phaser.Math.Linear(cam.midPoint.y, this.assistindo.y * T, 0.15));
    }
    j.setDepth(j.y);
    this.sombra.setPosition(j.x, j.y + 2).setDepth(j.y - 1).setVisible(!this.naAgua);
    this.som.atualizarMusica(noite);
    const agora = ehAgua(tileEm(this.mundo, Math.floor(j.x / T), Math.floor(j.y / T)));
    if (agora !== this.naAgua) {
      this.naAgua = agora;
      if (agora && !this.avisouJangada) { this.avisouJangada = true; this.ui.aviso('Navegando! Explore as ilhas vizinhas'); }
    }
    this.barco.setVisible(this.naAgua).setPosition(j.x, j.y - 1 + Math.sin(t / 250) * 0.6).setDepth(j.y - 0.5);
    if (this.morto) return;
    let vx = 0, vy = 0;
    if (k.A.isDown || k.LEFT.isDown) vx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) vx += 1;
    if (k.W.isDown || k.UP.isDown) vy -= 1;
    if (k.S.isDown || k.DOWN.isDown) vy += 1;
    if (toque.x || toque.y) { vx = toque.x; vy = toque.y; }
    if ((vx || vy) && !this.golpeando) {
      const vel = VELOCIDADE * (this.naAgua ? 0.85 : 1) * (1 + this.ef.velocidade) * (t < this.magias.ventoAte ? 1.8 : 1);
      const passo = (vel * T * dt) / 1000 / Math.max(1, Math.hypot(vx, vy));
      const nx = j.x + vx * passo, ny = j.y + vy * passo;
      if (this.livre(nx, j.y)) j.x = nx;
      if (this.livre(j.x, ny)) j.y = ny;
      this.direcao = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'esquerda' : 'direita') : (vy < 0 ? 'cima' : 'baixo');
      j.anims.play(`heroi-${this.direcao}`, true);
    } else if (!this.golpeando) {
      j.anims.stop();
      j.setFrame(quadroParado(this.direcao));
    }

    if (this.ui.construindo) {
      const { x, y } = this.localConstrucao();
      this.fantasma.setPosition(x * T, y * T).setTint(this.motivoInvalido(x, y) ? 0xff6666 : 0xffffff);
      this.alvo.setVisible(false);
      this.ui.rotuloAcao('Construir');
      if (Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.E)) this.construir();
      return;
    }
    const apertou = k.SPACE.isDown || k.E.isDown || toque.acao;
    const bicho = this.fauna.alvo(j.x / T, j.y / T, VETOR[this.direcao]);
    if (bicho) {
      this.alvo.setVisible(false);
      this.ui.rotuloAcao('Atacar');
      // vira para o alvo da mira automática
      const dx = bicho.c.x - j.x / T, dy = bicho.c.y - j.y / T;
      if (apertou) this.direcao = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : (dy < 0 ? 'cima' : 'baixo');
      if (apertou && t - this.ultimoGolpe >= INTERVALO_ATAQUE / (1 + this.ef.velocidadeAtaque)) { this.ultimoGolpe = t; this.atacar(bicho); }
      return;
    }
    const alvo = this.recursoAlvo();
    this.alvo.setVisible(!!alvo);
    this.ui.rotuloAcao(alvo ? ({ arvore: 'Cortar', pedra: 'Quebrar', arbusto: 'Colher', minerio: 'Minerar', cristal: 'Minerar' } as const)[alvo.tipo] : 'AÇÃO');
    if (alvo) this.alvo.setPosition(alvo.x * T, alvo.y * T);
    if (alvo && apertou && t - this.ultimoGolpe >= INTERVALO_GOLPE) {
      this.ultimoGolpe = t;
      this.golpe(alvo);
    }
  }
}
