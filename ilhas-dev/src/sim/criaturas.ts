import type { ItemId } from './itens';
import type { Raridade } from './baus';

/** Multiplicadores por raridade da criatura: [vida, dano, xp/itens]. */
export const MULT_RARIDADE: Record<Raridade, [number, number, number]> = {
  comum: [1, 1, 1], raro: [1.6, 1.3, 2], epico: [2.5, 1.6, 3.5], lendario: [4, 2, 6],
};

export type TipoCriatura = 'coelho' | 'javali' | 'slime' | 'lobo';
export type Comportamento = 'passivo' | 'neutro' | 'hostil';

export interface DefCriatura {
  nome: string; vida: number; velocidade: number; // tiles/s
  comportamento: Comportamento; visao: number;     // tiles
  dano: number; intervaloAtaque: number;          // ms
  xp: number; solta: Partial<Record<ItemId, number>>;
  noturno?: boolean;                              // só aparece à noite
}

export const CRIATURAS: Record<TipoCriatura, DefCriatura> = {
  coelho: { nome: 'Guaxinim', vida: 3, velocidade: 3.2, comportamento: 'passivo', visao: 3, dano: 0, intervaloAtaque: 0, xp: 2, solta: { carne: 1 } },
  javali: { nome: 'Javali', vida: 10, velocidade: 2.6, comportamento: 'neutro', visao: 6, dano: 3, intervaloAtaque: 1100, xp: 8, solta: { carne: 2, couro: 1 } },
  slime: { nome: 'Slime', vida: 6, velocidade: 1.4, comportamento: 'hostil', visao: 5, dano: 2, intervaloAtaque: 1200, xp: 5, solta: { gosma: 1 } },
  lobo: { nome: 'Fera', vida: 14, velocidade: 3.4, comportamento: 'hostil', visao: 8, dano: 4, intervaloAtaque: 900, xp: 14, solta: { couro: 2, carne: 1 }, noturno: true },
};

export interface Criatura {
  id: number; tipo: TipoCriatura;
  x: number; y: number;           // posição em tiles (contínua)
  vida: number;
  estado: 'vagar' | 'fugir' | 'perseguir' | 'parado';
  dir: [number, number];
  tempoEstado: number;            // ms restantes no estado de vagar/parado
  recarga: number;                // ms até poder atacar de novo
  provocado: boolean;
  raridade: Raridade;
  /** Guardião de baú: fica perto deste ponto e não persegue para longe dele. */
  ancora?: { x: number; y: number; raio: number; bau: number };
}

export interface Contexto {
  jogador: { x: number; y: number; vivo: boolean };
  andavel: (tx: number, ty: number) => boolean;
  rng: () => number;
}

export function novaCriatura(id: number, tipo: TipoCriatura, x: number, y: number, raridade: Raridade = 'comum'): Criatura {
  return { id, tipo, x, y, vida: CRIATURAS[tipo].vida * MULT_RARIDADE[raridade][0], estado: 'parado', dir: [0, 0], tempoEstado: 500, recarga: 0, provocado: false, raridade };
}

/** Vida máxima desta criatura (com a raridade). */
export const vidaMaxima = (c: Criatura) => CRIATURAS[c.tipo].vida * MULT_RARIDADE[c.raridade][0];

const RAIO = 0.3; // meia largura da criatura em tiles

function mover(c: Criatura, dx: number, dy: number, ctx: Contexto) {
  const livre = (x: number, y: number) =>
    ctx.andavel(Math.floor(x - RAIO), Math.floor(y)) && ctx.andavel(Math.floor(x + RAIO), Math.floor(y)) &&
    ctx.andavel(Math.floor(x), Math.floor(y - RAIO)) && ctx.andavel(Math.floor(x), Math.floor(y + RAIO));
  let moveu = false;
  if (dx && livre(c.x + dx, c.y)) { c.x += dx; moveu = true; }
  if (dy && livre(c.x, c.y + dy)) { c.y += dy; moveu = true; }
  return moveu;
}

/**
 * Um passo de IA. Retorna o dano causado ao jogador neste passo (0 se nenhum).
 * Máquina de estados simples: vagar/parado ↔ fugir (passivos) ↔ perseguir (hostis e neutros provocados).
 */
export function atualizarCriatura(c: Criatura, ctx: Contexto, dt: number): number {
  const def = CRIATURAS[c.tipo];
  c.recarga = Math.max(0, c.recarga - dt);
  const j = ctx.jogador;
  const dx = j.x - c.x, dy = j.y - c.y;
  const dist = Math.hypot(dx, dy);
  // guardião: não persegue para longe do baú; volta quando se afasta demais
  const longeDaAncora = c.ancora ? Math.hypot(c.x - c.ancora.x, c.y - c.ancora.y) : 0;
  const jogadorPertoDaAncora = !c.ancora || Math.hypot(j.x - c.ancora.x, j.y - c.ancora.y) <= c.ancora.raio * 1.8;
  const vePlayer = j.vivo && dist <= def.visao && jogadorPertoDaAncora;
  if (c.ancora) c.provocado = vePlayer;

  if (def.comportamento === 'passivo' && vePlayer) c.estado = 'fugir';
  else if ((def.comportamento === 'hostil' || c.provocado) && vePlayer) c.estado = 'perseguir';
  else if (c.estado === 'fugir' || c.estado === 'perseguir') {
    c.estado = 'parado'; c.tempoEstado = 600;
    if (dist > def.visao * 1.5) c.provocado = false;
  }

  const passo = (def.velocidade * dt) / 1000;
  if (c.estado === 'fugir' && dist > 0) {
    if (!mover(c, (-dx / dist) * passo, (-dy / dist) * passo, ctx)) {
      // encurralado: tenta de lado
      mover(c, (dy / dist) * passo, (-dx / dist) * passo, ctx);
    }
    c.dir = [-dx / dist, -dy / dist];
    return 0;
  }
  if (c.estado === 'perseguir') {
    c.dir = dist > 0 ? [dx / dist, dy / dist] : c.dir;
    if (dist > 0.8) { mover(c, (dx / dist) * passo, (dy / dist) * passo, ctx); return 0; }
    if (c.recarga === 0 && def.dano > 0) { c.recarga = def.intervaloAtaque; return Math.round(def.dano * MULT_RARIDADE[c.raridade][1]); }
    return 0;
  }
  // vagar / parado
  c.tempoEstado -= dt;
  if (c.tempoEstado <= 0) {
    if (c.estado === 'vagar' || ctx.rng() < 0.4) { c.estado = 'parado'; c.tempoEstado = 800 + ctx.rng() * 1600; }
    else {
      const a = ctx.rng() * Math.PI * 2;
      c.estado = 'vagar'; c.dir = [Math.cos(a), Math.sin(a)]; c.tempoEstado = 600 + ctx.rng() * 1400;
    }
  }
  if (c.ancora && longeDaAncora > c.ancora.raio) {
    // volta para perto do baú
    const ax = c.ancora.x - c.x, ay = c.ancora.y - c.y, ad = Math.hypot(ax, ay) || 1;
    c.dir = [ax / ad, ay / ad]; mover(c, (ax / ad) * passo * 0.6, (ay / ad) * passo * 0.6, ctx);
    return 0;
  }
  if (c.estado === 'vagar' && !mover(c, c.dir[0] * passo * 0.5, c.dir[1] * passo * 0.5, ctx)) c.tempoEstado = 0;
  return 0;
}

/** Aplica dano à criatura. Neutros ficam provocados. Retorna true se morreu. */
export function ferirCriatura(c: Criatura, dano: number): boolean {
  c.vida -= dano;
  if (CRIATURAS[c.tipo].comportamento === 'neutro') c.provocado = true;
  return c.vida <= 0;
}

// ---------- Personagem: vida, experiência e níveis ----------

export interface Status { vida: number; vidaMax: number; xp: number; nivel: number; }

export const novoStatus = (): Status => ({ vida: 20, vidaMax: 20, xp: 0, nivel: 1 });

/** XP necessário para passar do nível n para n+1. */
export const xpParaProximo = (n: number) => Math.round(20 * Math.pow(n, 1.5));

/** Ganha XP; retorna quantos níveis subiu. Cada nível dá +4 de vida máxima e cura tudo. */
export function ganharXp(s: Status, xp: number): number {
  s.xp += xp;
  let subiu = 0;
  while (s.xp >= xpParaProximo(s.nivel)) {
    s.xp -= xpParaProximo(s.nivel);
    s.nivel++; subiu++;
    s.vidaMax += 4; s.vida = s.vidaMax;
  }
  return subiu;
}

/** Bônus de dano corpo a corpo pelo nível do personagem. */
export const bonusDano = (s: Status) => Math.floor((s.nivel - 1) / 2);

// ---------- Ciclo de dia e noite ----------

export const DURACAO_DIA = 6 * 60_000; // 6 min reais por dia completo
export const INICIO_NOITE = 0.68;       // fração do dia em que escurece

/** 0 = dia pleno, 1 = noite plena, com transições suaves no anoitecer e amanhecer. */
export function escuridao(tempo: number): number {
  const f = (tempo % DURACAO_DIA) / DURACAO_DIA;
  const t = 0.06;
  if (f < INICIO_NOITE - t) return f < t ? 1 - f / t : 0;
  if (f < INICIO_NOITE) return (f - (INICIO_NOITE - t)) / t;
  return 1;
}

export const ehNoite = (tempo: number) => escuridao(tempo) > 0.5;
