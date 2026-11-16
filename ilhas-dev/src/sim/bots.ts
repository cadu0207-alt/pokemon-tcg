import { acharCaminho } from './caminho';
import { golpear, recursoAtivo, ferramentaPara, type EstadoRecursos } from './coleta';
import { nivelIlha, proximoNivel, validarLocal, naIlha, type Construcao } from './construcao';
import { ganharXp, novoStatus, type Status } from './criaturas';
import { adicionar, criar, novoInventario, podeCriar, qtd, type Inventario } from './inventario';
import { ITENS, RECEITAS, type ItemId, type Receita } from './itens';
import { TILE_ANDAVEL, tileEm, type Ilha, type Mundo, type Recurso } from './mundo';
import { criarRng } from './rng';

// ---------- Perfis de personalidade ----------

export type NomePerfil = 'coletor' | 'construtor' | 'cacador' | 'explorador';
export interface Perfil {
  coletar: number; construir: number; cacar: number; explorar: number;
  erro: number;        // 0..1: ruído nas decisões ("erro humano")
  velocidade: number;  // tiles/s
  ritmo: number;       // ms entre golpes
}
export const PERFIS: Record<NomePerfil, Perfil> = {
  coletor:    { coletar: 1.3, construir: 0.9, cacar: 0.4, explorar: 0.3, erro: 0.15, velocidade: 3.4, ritmo: 700 },
  construtor: { coletar: 1.0, construir: 1.4, cacar: 0.3, explorar: 0.2, erro: 0.10, velocidade: 3.2, ritmo: 760 },
  cacador:    { coletar: 0.8, construir: 0.8, cacar: 1.4, explorar: 0.5, erro: 0.20, velocidade: 3.6, ritmo: 680 },
  explorador: { coletar: 0.7, construir: 0.7, cacar: 0.6, explorar: 1.4, erro: 0.30, velocidade: 3.8, ritmo: 820 },
};

const NOMES = ['Aiko', 'Ren', 'Mika', 'Sora', 'Yuki', 'Kai', 'Hana', 'Riku', 'Nami', 'Taro', 'Emi', 'Haru', 'Kiko', 'Shin',
  'Luna', 'Tobi', 'Mei', 'Jun', 'Rin', 'Kenta', 'Ayla', 'Bruno', 'Caio', 'Duda', 'Lia', 'Theo', 'Nina', 'Igor', 'Bia', 'Davi'];

// ---------- Estado do bot ----------

export type Objetivo =
  | { tipo: 'coletar'; recurso: Recurso }
  | { tipo: 'construir'; item: ItemId; x: number; y: number }
  | { tipo: 'cacar'; ate: number }
  | { tipo: 'descansar'; ate: number }
  | { tipo: 'vagar'; ate: number };

export interface Bot {
  id: number; nome: string; perfil: NomePerfil; cor: number;
  ilha: Ilha;
  x: number; y: number;              // em tiles (contínuo, centro do tile = .5)
  inv: Inventario; construcoes: Construcao[]; status: Status;
  objetivo: Objetivo | null;
  caminho: [number, number][];
  proximaDecisao: number;            // instante (ms) da próxima reavaliação
  proximoGolpe: number;
  dir: [number, number]; andando: boolean;
  rng: () => number;
  /** recursos sem caminho: id -> até quando ignorar */
  ignorar: Map<number, number>;
}

export function criarBots(m: Mundo, quantidade: number, seed: number): Bot[] {
  const perfis = Object.keys(PERFIS) as NomePerfil[];
  const rng = criarRng(seed ^ 0xb075);
  const iniciais = m.ilhas.filter(i => i.dono !== null);
  const bots: Bot[] = [];
  // a ilha 0 é do jogador; bots ficam com as próximas
  for (let i = 0; i < Math.min(quantidade, iniciais.length - 1); i++) {
    const ilha = iniciais[i + 1];
    bots.push({
      id: i, nome: `${NOMES[i % NOMES.length]}${i >= NOMES.length ? ` ${Math.floor(i / NOMES.length) + 1}` : ''}`,
      perfil: perfis[Math.floor(rng() * perfis.length)], cor: Math.floor(rng() * 8),
      ilha, x: Math.round(ilha.cx) + 0.5, y: Math.round(ilha.cy) + 0.5,
      inv: novoInventario(), construcoes: [], status: novoStatus(),
      objetivo: null, caminho: [], proximaDecisao: rng() * 2000, proximoGolpe: 0,
      dir: [0, 1], andando: false, rng: criarRng(seed + i * 7919), ignorar: new Map(),
    });
  }
  return bots;
}

// ---------- Contexto que o mundo oferece aos bots ----------

export interface MundoBots {
  mundo: Mundo;
  recursos: EstadoRecursos;
  /** tile bloqueado por recurso ativo ou construção */
  bloqueado: (x: number, y: number) => boolean;
  agora: number;
  noite: boolean;
  /** avisos para quem desenha */
  aoDestruir?: (r: Recurso) => void;
  aoConstruir?: (bot: Bot, c: Construcao) => void;
}

// ---------- Planejamento: o que falta para o próximo nível ----------

const META_FERRAMENTAS: ItemId[] = ['machado_pedra', 'picareta_pedra'];

/** Itens que o bot quer ter agora (construções do próximo nível + ferramentas). */
export function metas(bot: Bot): ItemId[] {
  const quer: ItemId[] = [];
  const prox = proximoNivel(bot.construcoes);
  if (prox) {
    const tem: Partial<Record<ItemId, number>> = {};
    for (const c of bot.construcoes) tem[c.tipo] = (tem[c.tipo] ?? 0) + 1;
    for (const [id, n] of Object.entries(prox.requer)) {
      const falta = (n ?? 0) - (tem[id as ItemId] ?? 0) - qtd(bot.inv, id as ItemId);
      for (let i = 0; i < falta; i++) quer.push(id as ItemId);
    }
  }
  for (const f of META_FERRAMENTAS) if (!qtd(bot.inv, f)) quer.push(f);
  if (bot.perfil === 'cacador' && !qtd(bot.inv, 'lanca_madeira') && !qtd(bot.inv, 'espada_pedra')) quer.push('lanca_madeira');
  return quer;
}

const receitaDe = (id: ItemId): Receita | undefined => RECEITAS.find(r => r.id === id);

/** Matérias-primas que faltam para cumprir as metas (corda vira fibra). */
export function necessidades(bot: Bot): { madeira: number; pedra: number; fibra: number } {
  const total: Partial<Record<ItemId, number>> = {};
  const somar = (id: ItemId, n: number) => (total[id] = (total[id] ?? 0) + n);
  for (const meta of metas(bot)) {
    const r = receitaDe(meta);
    if (r) for (const [id, n] of Object.entries(r.custo)) somar(id as ItemId, n ?? 0);
  }
  const cordaFalta = Math.max(0, (total.corda ?? 0) - qtd(bot.inv, 'corda'));
  somar('fibra', cordaFalta * 3);
  const falta = (id: ItemId) => Math.max(0, (total[id] ?? 0) - qtd(bot.inv, id));
  return { madeira: falta('madeira'), pedra: falta('pedra'), fibra: falta('fibra') };
}

/** Cria tudo o que já dá para criar e que ajuda nas metas. Retorna o que criou. */
export function criarOQueDer(bot: Bot): ItemId[] {
  const criados: ItemId[] = [];
  const nivel = nivelIlha(bot.construcoes);
  for (let tentativas = 0; tentativas < 10; tentativas++) {
    const ms = metas(bot);
    // corda primeiro se alguma meta pede corda
    const precisaCorda = ms.some(m => (receitaDe(m)?.custo.corda ?? 0) > qtd(bot.inv, 'corda'));
    const ordem: ItemId[] = precisaCorda ? ['corda', ...ms] : ms;
    const r = ordem.map(receitaDe).find(r => r && podeCriar(bot.inv, r, nivel));
    if (!r || !criar(bot.inv, r, nivel)) break;
    criados.push(r.id);
  }
  if (bot.status.vida < bot.status.vidaMax * 0.6) {
    const assada = receitaDe('carne_assada')!;
    if (podeCriar(bot.inv, assada, nivel)) { criar(bot.inv, assada, nivel); criados.push('carne_assada'); }
  }
  return criados;
}

// ---------- Utility AI: escolher o próximo objetivo ----------

const TIPO_DE: Record<'madeira' | 'pedra' | 'fibra', Recurso['tipo']> = { madeira: 'arvore', pedra: 'pedra', fibra: 'arbusto' };

function recursoMaisProximo(bot: Bot, ctx: MundoBots, tipo: Recurso['tipo']): Recurso | null {
  const ignorado = (r: Recurso) => (bot.ignorar.get(r.id) ?? 0) > ctx.agora;
  let melhor: Recurso | null = null, d = Infinity;
  const raio = Math.ceil(bot.ilha.raio * 1.6);
  const cx = Math.round(bot.ilha.cx), cy = Math.round(bot.ilha.cy), L = ctx.mundo.largura;
  for (let y = cy - raio; y <= cy + raio; y++) for (let x = cx - raio; x <= cx + raio; x++) {
    const r = ctx.recursos.porTile.get(y * L + x);
    if (!r || r.tipo !== tipo || !recursoAtivo(ctx.recursos, r) || ignorado(r)) continue;
    const dist = Math.abs(x + 0.5 - bot.x) + Math.abs(y + 0.5 - bot.y);
    if (dist < d) { d = dist; melhor = r; }
  }
  return melhor;
}

/** Lugar livre na ilha do bot, em espiral a partir do centro. */
export function lugarParaConstruir(bot: Bot, ctx: MundoBots): { x: number; y: number } | null {
  const cx = Math.round(bot.ilha.cx), cy = Math.round(bot.ilha.cy);
  const ocupado = (x: number, y: number) => ctx.bloqueado(x, y) || !!ctx.recursos.porTile.get(y * ctx.mundo.largura + x);
  const bx = Math.floor(bot.x), by = Math.floor(bot.y);
  for (let r = 2; r < bot.ilha.raio * 1.3; r++) {
    for (let i = -r; i <= r; i++) for (const [x, y] of [[cx + i, cy - r], [cx + i, cy + r], [cx - r, cy + i], [cx + r, cy + i]]) {
      // Só em pontos de uma grade de passo 2: linhas e colunas ímpares ficam sempre livres,
      // então as construções nunca fecham um corredor (nem prendem o próprio bot).
      if ((x - cx) % 2 !== 0 || (y - cy) % 2 !== 0) continue;
      if (x === bx && y === by) continue;
      if (bot.ignorar.has(-(y * ctx.mundo.largura + x) - 1)) continue; // lugar já tentado sem caminho
      if (validarLocal(ctx.mundo, bot.ilha, bot.construcoes, ocupado, x, y)) continue;
      // precisa ter um vizinho andável para o bot chegar
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([vx, vy]) => andavelPara(ctx, x + vx, y + vy) && naIlha(bot.ilha, x + vx, y + vy))) return { x, y };
    }
  }
  return null;
}

const andavelPara = (ctx: MundoBots, x: number, y: number) => TILE_ANDAVEL[tileEm(ctx.mundo, x, y)] && !ctx.bloqueado(x, y);

export interface Opcao { objetivo: Objetivo; nota: number; }

/** Dá uma nota a cada objetivo possível e retorna a lista ordenada (a primeira é a escolhida). */
export function avaliar(bot: Bot, ctx: MundoBots): Opcao[] {
  const p = PERFIS[bot.perfil];
  const ops: Opcao[] = [];
  const ruido = () => 1 + (bot.rng() - 0.5) * 2 * p.erro;
  const temFogueira = bot.construcoes.some(c => c.tipo === 'fogueira');

  // Construir o que já está na mochila
  for (const id of Object.keys(bot.inv.itens) as ItemId[]) {
    if (!ITENS[id].construivel) continue;
    const lugar = lugarParaConstruir(bot, ctx);
    if (lugar) ops.push({ objetivo: { tipo: 'construir', item: id, ...lugar }, nota: 1.0 * p.construir * ruido() });
    break;
  }
  // Coletar o que falta
  const nec = necessidades(bot);
  for (const mat of ['madeira', 'pedra', 'fibra'] as const) {
    const n = nec[mat];
    if (n <= 0) continue;
    const r = recursoMaisProximo(bot, ctx, TIPO_DE[mat]);
    if (!r) continue;
    const dist = Math.abs(r.x - bot.x) + Math.abs(r.y - bot.y);
    ops.push({ objetivo: { tipo: 'coletar', recurso: r }, nota: (n / (n + 4)) * p.coletar * (1 / (1 + dist / 20)) * ruido() });
  }
  // Caçar (abstrato: anda pela ilha e volta com carne/couro/XP)
  const fome = bot.status.vida < bot.status.vidaMax * 0.5 && !qtd(bot.inv, 'carne') ? 0.4 : 0;
  // Com construção pendente, caçar perde prioridade (senão o caçador nunca termina a ilha).
  const pendente = nec.madeira + nec.pedra + nec.fibra > 0 ? 0.5 : 1;
  ops.push({ objetivo: { tipo: 'cacar', ate: ctx.agora + 6000 + bot.rng() * 5000 }, nota: (0.25 * pendente + fome) * p.cacar * (ctx.noite ? 0.3 : 1) * ruido() });
  // À noite, quem tem fogueira descansa perto dela
  if (ctx.noite && temFogueira) ops.push({ objetivo: { tipo: 'descansar', ate: ctx.agora + 8000 }, nota: 0.75 * ruido() });
  // Vagar: sempre possível, nota baixa
  ops.push({ objetivo: { tipo: 'vagar', ate: ctx.agora + 2000 + bot.rng() * 3000 }, nota: 0.08 * p.explorar * ruido() });
  return ops.sort((a, b) => b.nota - a.nota);
}

// ---------- Execução ----------

function irPara(bot: Bot, ctx: MundoBots, x: number, y: number, adjacente: boolean) {
  const c = acharCaminho(Math.floor(bot.x), Math.floor(bot.y), x, y, (tx, ty) => andavelPara(ctx, tx, ty) &&
    naIlha(bot.ilha, tx, ty), { alvoAdjacente: adjacente, maxNos: 1500 });
  bot.caminho = c ?? [];
  return c !== null;
}

function passo(bot: Bot, dt: number): boolean {
  if (!bot.caminho.length) { bot.andando = false; return true; }
  const [tx, ty] = bot.caminho[0];
  const dx = tx + 0.5 - bot.x, dy = ty + 0.5 - bot.y, d = Math.hypot(dx, dy);
  const p = (PERFIS[bot.perfil].velocidade * dt) / 1000;
  bot.andando = true;
  if (d <= p) { bot.x = tx + 0.5; bot.y = ty + 0.5; bot.caminho.shift(); }
  else { bot.x += (dx / d) * p; bot.y += (dy / d) * p; bot.dir = [dx / d, dy / d]; }
  return !bot.caminho.length;
}

function pontoAleatorio(bot: Bot, ctx: MundoBots, raio: number) {
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(bot.ilha.cx + (bot.rng() - 0.5) * 2 * raio), y = Math.floor(bot.ilha.cy + (bot.rng() - 0.5) * 2 * raio);
    if (andavelPara(ctx, x, y)) return { x, y };
  }
  return null;
}

/** Um passo de simulação do bot. Chamado a cada quadro (ou em lotes, numa simulação sem tela). */
export function atualizarBot(bot: Bot, ctx: MundoBots, dt: number) {
  // Objetivos com tempo (caçar, vagar, descansar) terminam sozinhos; coletar/construir são reavaliados de tempos em tempos.
  const reavaliar = bot.objetivo && (bot.objetivo.tipo === 'coletar' || bot.objetivo.tipo === 'construir') && ctx.agora >= bot.proximaDecisao;
  if (!bot.objetivo || reavaliar) {
    criarOQueDer(bot);
    // come se estiver machucado
    for (const c of ['carne_assada', 'baga', 'carne'] as ItemId[]) {
      if (bot.status.vida < bot.status.vidaMax - 4 && qtd(bot.inv, c)) {
        bot.inv.itens[c]! -= 1; if (!bot.inv.itens[c]) delete bot.inv.itens[c];
        bot.status.vida = Math.min(bot.status.vidaMax, bot.status.vida + (ITENS[c].comida ?? 0));
      }
    }
    const escolha = avaliar(bot, ctx)[0].objetivo;
    bot.objetivo = escolha;
    bot.proximaDecisao = ctx.agora + 4000;
    bot.caminho = [];
    if (escolha.tipo === 'coletar' && !irPara(bot, ctx, escolha.recurso.x, escolha.recurso.y, true)) {
      bot.ignorar.set(escolha.recurso.id, ctx.agora + 60_000); // sem caminho: tenta outro
      bot.objetivo = null;
    }
    else if (escolha.tipo === 'construir' && !irPara(bot, ctx, escolha.x, escolha.y, true)) {
      bot.ignorar.set(-(escolha.y * ctx.mundo.largura + escolha.x) - 1, Infinity); // chave negativa = lugar
      bot.objetivo = null;
    }
    else if (escolha.tipo === 'descansar') {
      const f = bot.construcoes.find(c => c.tipo === 'fogueira')!;
      irPara(bot, ctx, f.x, f.y, true);
    }
  }
  const o = bot.objetivo;
  if (!o) return;
  const chegou = passo(bot, dt);

  switch (o.tipo) {
    case 'coletar': {
      if (!chegou) return;
      if (!recursoAtivo(ctx.recursos, o.recurso)) { bot.objetivo = null; return; }
      bot.proximaDecisao = Math.max(bot.proximaDecisao, ctx.agora + 1000); // não abandona no meio
      bot.dir = [o.recurso.x + 0.5 - bot.x, o.recurso.y + 0.5 - bot.y];
      if (ctx.agora < bot.proximoGolpe) return;
      bot.proximoGolpe = ctx.agora + PERFIS[bot.perfil].ritmo;
      const res = golpear(ctx.recursos, bot.inv, o.recurso, ctx.agora);
      if (res?.destruido) { ctx.aoDestruir?.(o.recurso); bot.objetivo = null; }
      return;
    }
    case 'construir': {
      if (!chegou) return;
      const ocupado = (x: number, y: number) => ctx.bloqueado(x, y) || !!ctx.recursos.porTile.get(y * ctx.mundo.largura + x);
      if (qtd(bot.inv, o.item) && !validarLocal(ctx.mundo, bot.ilha, bot.construcoes, ocupado, o.x, o.y)) {
        bot.inv.itens[o.item]! -= 1; if (!bot.inv.itens[o.item]) delete bot.inv.itens[o.item];
        const c = { tipo: o.item, x: o.x, y: o.y };
        bot.construcoes.push(c);
        ctx.aoConstruir?.(bot, c);
      }
      bot.objetivo = null;
      return;
    }
    case 'cacar': {
      if (chegou) { const p = pontoAleatorio(bot, ctx, bot.ilha.raio); if (p) irPara(bot, ctx, p.x, p.y, false); }
      if (ctx.agora < o.ate) return;
      // resultado abstrato da caçada: depende da arma
      const arma = ferramentaPara(bot.inv, 'criatura');
      const sorte = bot.rng() + (arma.id ? 0.35 : 0);
      if (sorte > 0.45) {
        adicionar(bot.inv, 'carne', 1 + (sorte > 0.9 ? 1 : 0));
        if (sorte > 0.75) adicionar(bot.inv, 'couro', 1);
        ganharXp(bot.status, 4 + Math.floor(bot.rng() * 8));
      } else {
        bot.status.vida = Math.max(1, bot.status.vida - 3); // levou umas mordidas
      }
      bot.objetivo = null;
      return;
    }
    case 'descansar':
    case 'vagar':
      if (o.tipo === 'vagar' && chegou) { const p = pontoAleatorio(bot, ctx, bot.ilha.raio * 0.8); if (p) irPara(bot, ctx, p.x, p.y, false); }
      if (o.tipo === 'descansar') bot.status.vida = Math.min(bot.status.vidaMax, bot.status.vida + dt / 3000);
      if (ctx.agora >= o.ate) bot.objetivo = null;
  }
}

/** Pontuação do ranking. */
export const pontuacao = (construcoes: Construcao[], status: Status) =>
  nivelIlha(construcoes) * 100 + construcoes.length * 5 + status.nivel * 10;
