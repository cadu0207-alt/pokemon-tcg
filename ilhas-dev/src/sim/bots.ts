import { acharCaminho } from './caminho';
import { golpear, recursoAtivo, ferramentaPara, type EstadoRecursos } from './coleta';
import { NIVEIS, validarLocal, naIlha, type Construcao } from './construcao';
import { CUSTO_EXPANSAO, pagarExpansao } from './expansao';
import { ganharXp, novoStatus, type Status } from './criaturas';
import { adicionar, criar, novoInventario, podeCriar, qtd, type Inventario } from './inventario';
import { ITENS, RECEITAS, type ItemId, type Receita } from './itens';
import { TILE_ANDAVEL, tileEm, ehAgua, type Ilha, type Mundo, type Recurso } from './mundo';
import { criarRng } from './rng';
import { aprender, efeitos, escolherHabilidade } from './habilidades';

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
  | { tipo: 'vagar'; ate: number }
  | { tipo: 'expedicao'; destino: Ilha };

/** Apelidos para nomes repetidos ("Shin do Recife" em vez de "Shin 2"). Curtos para caber no ranking. */
const APELIDOS = ['do Mar', 'da Brisa', 'das Pedras', 'Pé-Leve', 'da Lua', 'do Sol', 'Raio', 'da Névoa', 'Coral', 'da Maré',
  'Faísca', 'do Vale', 'Trovão', 'da Areia', 'Estrela', 'do Norte', 'do Sul', 'da Ilha', 'Cometa', 'Âncora', 'do Farol', 'da Onda',
  'Tufão', 'Pérola', 'do Cais', 'da Serra', 'Corsário', 'Gaivota', 'da Aurora', 'do Bosque', 'Relâmpago', 'Pirata', 'do Porto',
  'da Rocha', 'Vento', 'Lírio', 'do Recife', 'da Baía', 'Ciclone', 'Brasa', 'do Cabo', 'Orvalho', 'da Duna', 'Granizo', 'Tritão',
  'da Lagoa', 'Sereia', 'do Abismo', 'Garoa', 'Arpão'];

/** Nome único: primeiro o nome puro, depois com apelido; só em mundos enormes volta a numerar. */
export function nomeDoBot(i: number): string {
  const base = NOMES[i % NOMES.length], volta = Math.floor(i / NOMES.length);
  if (volta === 0) return base;
  if (volta <= APELIDOS.length) return `${base} ${APELIDOS[(volta - 1 + i) % APELIDOS.length]}`;
  return `${base} ${volta + 1}`;
}

export interface Bot {
  id: number; nome: string; perfil: NomePerfil; cor: number;
  ilha: Ilha;
  x: number; y: number;              // em tiles (contínuo, centro do tile = .5)
  inv: Inventario; construcoes: Construcao[]; status: Status;
  /** Nível de expansão da ilha (o Cristal faz a terra crescer). */
  nivel: number;
  habilidades: string[];
  objetivo: Objetivo | null;
  caminho: [number, number][];
  proximaDecisao: number;            // instante (ms) da próxima reavaliação
  proximoGolpe: number;
  dir: [number, number]; andando: boolean;
  rng: () => number;
  /** recursos sem caminho: id -> até quando ignorar */
  ignorar: Map<number, number>;
  /** Ilha onde o bot está agindo agora (a dele, ou uma neutra durante uma expedição). */
  ilhaAtual: Ilha | null;
  expedicao: { destino: Ilha; fase: 'ida' | 'coletar' | 'volta'; ate: number; inicio: number; parado: number; alvo?: { x: number; y: number } | null; porto?: boolean; rota?: boolean } | null;
}

/**
 * Cria os bots nas ilhas iniciais livres. `ocupadas` são os índices (slots) de ilhas com dono humano
 * — por padrão só a 0, do jogador solo; no multijogador, as de todas as pessoas da temporada.
 */
export function criarBots(m: Mundo, quantidade: number, seed: number, ocupadas: Set<number> = new Set([0])): Bot[] {
  const perfis = Object.keys(PERFIS) as NomePerfil[];
  const rng = criarRng(seed ^ 0xb075);
  const livres = m.ilhas.filter(i => i.dono !== null).filter((_, slot) => !ocupadas.has(slot));
  const bots: Bot[] = [];
  for (let i = 0; i < Math.min(quantidade, livres.length); i++) {
    const ilha = livres[i];
    bots.push({
      id: i, nome: nomeDoBot(i),
      perfil: perfis[Math.floor(rng() * perfis.length)], cor: Math.floor(rng() * 8),
      ilha, x: Math.round(ilha.cx) + 0.5, y: Math.round(ilha.cy) + 1.5, // ao lado do Cristal
      inv: novoInventario(), construcoes: [], status: novoStatus(), habilidades: [], nivel: 1,
      objetivo: null, caminho: [], proximaDecisao: rng() * 2000, proximoGolpe: 0,
      dir: [0, 1], andando: false, rng: criarRng(seed + i * 7919), ignorar: new Map(), ilhaAtual: null, expedicao: null,
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
  /** Dificuldade: multiplica o tempo entre golpes e a velocidade dos bots. */
  ritmo?: number;
  velocidade?: number;
  /** Peso extra de "passear em vez de trabalhar". */
  preguica?: number;
  /** avisos para quem desenha */
  aoDestruir?: (r: Recurso) => void;
  aoConstruir?: (bot: Bot, c: Construcao) => void;
  /** O bot alimentou o Cristal: quem tem o mundo faz a terra crescer. */
  aoExpandir?: (bot: Bot) => void;
}

// ---------- Planejamento: o que falta para o próximo nível ----------

const META_FERRAMENTAS: ItemId[] = ['machado_pedra', 'picareta_pedra'];

/** Itens que o bot quer ter agora (construções do próximo nível + ferramentas). */
export function metas(bot: Bot): ItemId[] {
  const quer: ItemId[] = [];
  const prox = NIVEIS.find(n => n.nivel === bot.nivel + 1);
  if (prox) {
    const tem: Partial<Record<ItemId, number>> = {};
    for (const c of bot.construcoes) tem[c.tipo] = (tem[c.tipo] ?? 0) + 1;
    for (const [id, n] of Object.entries(prox.requer)) {
      const falta = (n ?? 0) - (tem[id as ItemId] ?? 0) - qtd(bot.inv, id as ItemId);
      for (let i = 0; i < falta; i++) quer.push(id as ItemId);
    }
  }
  for (const f of META_FERRAMENTAS) if (!qtd(bot.inv, f)) quer.push(f);
  if (bot.nivel >= 5) for (const f of ['machado_ferro', 'picareta_ferro'] as ItemId[]) if (!qtd(bot.inv, f)) quer.push(f);
  // jangada para buscar minério e cristal nas ilhas neutras (exploradores querem antes)
  // jangada desde o começo: cristal (para expandir) só existe fora de casa
  if (!qtd(bot.inv, 'jangada')) quer.push('jangada');
  if (bot.perfil === 'cacador' && !qtd(bot.inv, 'lanca_madeira') && !qtd(bot.inv, 'espada_pedra')) quer.push('lanca_madeira');
  return quer;
}

const receitaDe = (id: ItemId): Receita | undefined => RECEITAS.find(r => r.id === id);

export const MATERIAS = ['madeira', 'pedra', 'fibra', 'minerio', 'cristal'] as const;
export type Materia = (typeof MATERIAS)[number];

/**
 * Matérias-primas que faltam para cumprir as metas. Expande receitas recursivamente
 * (estátua → lingote → minério), descontando o que já está na mochila.
 */
export function necessidades(bot: Bot): Record<Materia, number> {
  const estoque: Partial<Record<ItemId, number>> = { ...bot.inv.itens };
  const falta: Record<Materia, number> = { madeira: 0, pedra: 0, fibra: 0, minerio: 0, cristal: 0 };
  const precisar = (id: ItemId, n: number, prof = 0) => {
    const tem = Math.min(estoque[id] ?? 0, n);
    estoque[id] = (estoque[id] ?? 0) - tem;
    const resto = n - tem;
    if (resto <= 0) return;
    if ((MATERIAS as readonly string[]).includes(id)) { falta[id as Materia] += resto; return; }
    const r = receitaDe(id);
    if (!r || prof > 4) return;
    const vezes = Math.ceil(resto / r.qtd);
    for (const [sub, q] of Object.entries(r.custo)) precisar(sub as ItemId, (q ?? 0) * vezes, prof + 1);
  };
  for (const meta of metas(bot)) { const r = receitaDe(meta); if (r) for (const [id, q] of Object.entries(r.custo)) precisar(id as ItemId, q ?? 0); }
  // pacote para alimentar o Cristal no próximo nível
  for (const [id, q] of Object.entries(CUSTO_EXPANSAO[bot.nivel + 1] ?? {})) precisar(id as ItemId, q ?? 0);
  return falta;
}

/** Cria tudo o que já dá para criar e que ajuda nas metas. Retorna o que criou. */
export function criarOQueDer(bot: Bot): ItemId[] {
  const criados: ItemId[] = [];
  const nivel = bot.nivel;
  for (let tentativas = 0; tentativas < 10; tentativas++) {
    const ms = metas(bot);
    // corda primeiro se alguma meta pede corda
    // intermediários primeiro, se alguma meta pede mais do que há na mochila
    const custoCristal = CUSTO_EXPANSAO[bot.nivel + 1] ?? {};
    const intermediarios = (['corda', 'lingote'] as ItemId[]).filter(i =>
      ms.some(m => (receitaDe(m)?.custo[i] ?? 0) > qtd(bot.inv, i)) || (custoCristal[i] ?? 0) > qtd(bot.inv, i));
    const ordem: ItemId[] = [...intermediarios, ...ms];
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

const TIPO_DE: Record<Materia, Recurso['tipo']> = { madeira: 'arvore', pedra: 'pedra', fibra: 'arbusto', minerio: 'minerio', cristal: 'cristal' };

function recursoMaisProximo(bot: Bot, ctx: MundoBots, tipo: Recurso['tipo']): Recurso | null {
  const ignorado = (r: Recurso) => (bot.ignorar.get(r.id) ?? 0) > ctx.agora;
  let melhor: Recurso | null = null, d = Infinity;
  const ilha = bot.ilhaAtual ?? bot.ilha;
  const raio = Math.ceil(ilha.raio * 1.6);
  const cx = Math.round(ilha.cx), cy = Math.round(ilha.cy), L = ctx.mundo.largura;
  for (let y = cy - raio; y <= cy + raio; y++) for (let x = cx - raio; x <= cx + raio; x++) {
    const r = ctx.recursos.porTile.get(y * L + x);
    if (!r || r.tipo !== tipo || !recursoAtivo(ctx.recursos, r) || ignorado(r)) continue;
    const dist = Math.abs(x + 0.5 - bot.x) + Math.abs(y + 0.5 - bot.y);
    if (dist < d) { d = dist; melhor = r; }
  }
  return melhor;
}

/** Quantos tiles andáveis da ilha são alcançáveis a partir do centro, tratando `sem` como bloqueado. */
function alcancaveis(bot: Bot, ctx: MundoBots, sem: number | null): number {
  const L = ctx.mundo.largura;
  const ini = (Math.round(bot.ilha.cy) + 1) * L + Math.round(bot.ilha.cx); // ao lado do Cristal (o centro é dele)
  // Pedras, minério e cristal renascem no mesmo lugar: contam sempre como parede (mesmo quebrados).
  // Árvores e arbustos contam como passagem: o bot sabe cortá-los para abrir caminho.
  const pode = (i: number) => {
    if (i === sem) return false;
    const x = i % L, y = Math.floor(i / L);
    if (!naIlha(bot.ilha, x, y) || !TILE_ANDAVEL[tileEm(ctx.mundo, x, y)]) return false;
    const r = ctx.recursos.porTile.get(i);
    if (r) return r.tipo === 'arvore' || r.tipo === 'arbusto';
    return !ctx.bloqueado(x, y);
  };
  if (!pode(ini)) return 0;
  const visto = new Set([ini]); const fila = [ini];
  while (fila.length) {
    const i = fila.pop()!;
    for (const v of [i + 1, i - 1, i + L, i - L]) if (!visto.has(v) && pode(v)) { visto.add(v); fila.push(v); }
  }
  return visto.size;
}

/**
 * Lugar livre na ilha do bot, em espiral a partir do centro.
 * Só aceita tiles que não separam a ilha em partes (senão o bot pode se trancar).
 */
export function lugarParaConstruir(bot: Bot, ctx: MundoBots): { x: number; y: number } | null {
  const cx = Math.round(bot.ilha.cx), cy = Math.round(bot.ilha.cy);
  const L = ctx.mundo.largura;
  const ocupado = (x: number, y: number) => ctx.bloqueado(x, y) || !!ctx.recursos.porTile.get(y * L + x);
  const bx = Math.floor(bot.x), by = Math.floor(bot.y);
  let base = -1;
  // 1ª passada: grade de passo 2 (corredores regulares, ilha bonita); 2ª: qualquer tile que não separe a ilha.
  for (const soGrade of [true, false]) for (let r = 2; r < bot.ilha.raio * 1.3; r++) {
    for (let i = -r; i <= r; i++) for (const [x, y] of [[cx + i, cy - r], [cx + i, cy + r], [cx - r, cy + i], [cx + r, cy + i]]) {
      if (soGrade && ((x - cx) % 2 !== 0 || (y - cy) % 2 !== 0)) continue;
      if (!soGrade && (x - cx) % 2 === 0 && (y - cy) % 2 === 0) continue; // já vistos
      if (x === bx && y === by) continue;
      if (bot.ignorar.has(-(y * L + x) - 1)) continue; // lugar já tentado sem caminho
      if (validarLocal(ctx.mundo, bot.ilha, bot.construcoes, ocupado, x, y)) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([vx, vy]) => andavelPara(ctx, x + vx, y + vy) && naIlha(bot.ilha, x + vx, y + vy))) continue;
      if (base < 0) base = alcancaveis(bot, ctx, null);
      if (alcancaveis(bot, ctx, y * L + x) !== base - 1) continue; // separaria a ilha (pode mudar quando árvores caírem)
      return { x, y };
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

  const emExpedicao = bot.expedicao?.fase === 'coletar';
  // Construir o que já está na mochila (só na ilha de casa)
  for (const id of Object.keys(bot.inv.itens) as ItemId[]) {
    if (emExpedicao || !ITENS[id].construivel) continue;
    const lugar = lugarParaConstruir(bot, ctx);
    if (lugar) ops.push({ objetivo: { tipo: 'construir', item: id, ...lugar }, nota: 1.0 * p.construir * ruido() });
    break;
  }
  // Coletar o que falta
  const nec = necessidades(bot);
  const faltaRaro = { minerio: false, cristal: false };
  for (const mat of MATERIAS) {
    const n = nec[mat];
    if (n <= 0) continue;
    if (emExpedicao && mat !== 'minerio' && mat !== 'cristal') continue;
    const r = recursoMaisProximo(bot, ctx, TIPO_DE[mat]);
    if (!r) { if (mat === 'minerio' || mat === 'cristal') faltaRaro[mat] = true; continue; }
    const dist = Math.abs(r.x - bot.x) + Math.abs(r.y - bot.y);
    ops.push({ objetivo: { tipo: 'coletar', recurso: r }, nota: (n / (n + 4)) * p.coletar * (1 / (1 + dist / 20)) * ruido() });
  }
  // Expedição: falta minério/cristal em casa e o bot tem jangada → ilha neutra mais próxima
  if (!bot.expedicao && qtd(bot.inv, 'jangada') && (faltaRaro.minerio || faltaRaro.cristal)) {
    const destino = ilhaNeutraMaisProxima(bot, ctx);
    if (destino) ops.push({ objetivo: { tipo: 'expedicao', destino }, nota: 0.45 * (0.6 + p.explorar * 0.5) * (ctx.noite ? 0.4 : 1) * ruido() });
  }
  if (emExpedicao) return ops.sort((a, b) => b.nota - a.nota).concat([{ objetivo: { tipo: 'vagar', ate: ctx.agora + 2000 }, nota: 0 }]);
  // Caçar (abstrato: anda pela ilha e volta com carne/couro/XP)
  const fome = bot.status.vida < bot.status.vidaMax * 0.5 && !qtd(bot.inv, 'carne') ? 0.4 : 0;
  // Com construção pendente, caçar perde prioridade (senão o caçador nunca termina a ilha).
  const pendente = MATERIAS.some(m => nec[m] > 0) ? 0.5 : 1;
  ops.push({ objetivo: { tipo: 'cacar', ate: ctx.agora + 6000 + bot.rng() * 5000 }, nota: (0.25 * pendente + fome) * p.cacar * (ctx.noite ? 0.3 : 1) * ruido() });
  // À noite, quem tem fogueira descansa perto dela
  if (ctx.noite && temFogueira) ops.push({ objetivo: { tipo: 'descansar', ate: ctx.agora + 8000 }, nota: 0.75 * ruido() });
  // Vagar: sempre possível, nota baixa
  ops.push({ objetivo: { tipo: 'vagar', ate: ctx.agora + 2000 + bot.rng() * 3000 }, nota: (0.08 * p.explorar + (ctx.preguica ?? 0) * bot.rng()) * ruido() });
  return ops.sort((a, b) => b.nota - a.nota);
}

// ---------- Execução ----------

function irPara(bot: Bot, ctx: MundoBots, x: number, y: number, adjacente: boolean) {
  const c = acharCaminho(Math.floor(bot.x), Math.floor(bot.y), x, y, (tx, ty) => andavelPara(ctx, tx, ty) &&
    naIlha(bot.ilhaAtual ?? bot.ilha, tx, ty), { alvoAdjacente: adjacente, maxNos: 1500 });
  bot.caminho = c ?? [];
  return c !== null;
}

/** Primeira árvore no caminho até (x, y), considerando árvores como atravessáveis. */
function arvoreNoCaminho(bot: Bot, ctx: MundoBots, x: number, y: number): Recurso | null {
  const L = ctx.mundo.largura;
  const arvoreEm = (tx: number, ty: number) => {
    const r = ctx.recursos.porTile.get(ty * L + tx);
    return r && r.tipo === 'arvore' && recursoAtivo(ctx.recursos, r) ? r : null;
  };
  const c = acharCaminho(Math.floor(bot.x), Math.floor(bot.y), x, y, (tx, ty) => naIlha(bot.ilhaAtual ?? bot.ilha, tx, ty) &&
    TILE_ANDAVEL[tileEm(ctx.mundo, tx, ty)] && (!ctx.bloqueado(tx, ty) || !!arvoreEm(tx, ty)), { alvoAdjacente: true, maxNos: 2000 });
  if (!c) return null;
  for (const [tx, ty] of c) { const a = arvoreEm(tx, ty); if (a) return a; }
  return null;
}

function ilhaNeutraMaisProxima(bot: Bot, ctx: MundoBots): Ilha | null {
  let melhor: Ilha | null = null, d = Infinity;
  for (const i of ctx.mundo.ilhas) {
    if (i.dono !== null) continue;
    const dist = Math.hypot(i.cx - bot.x, i.cy - bot.y);
    if (dist < d) { d = dist; melhor = i; }
  }
  return melhor;
}

/** Tile da costa da ilha atual (terra encostada na água) mais perto do destino. */
function portoDeSaida(bot: Bot, ctx: MundoBots, dx: number, dy: number): { x: number; y: number } | null {
  const ilha = bot.ilhaAtual ?? bot.ilha;
  const R = Math.ceil(ilha.raio * 1.4);
  const costa: { x: number; y: number; d: number }[] = [];
  for (let y = Math.floor(ilha.cy) - R; y <= ilha.cy + R; y++) for (let x = Math.floor(ilha.cx) - R; x <= ilha.cx + R; x++) {
    if (!andavelPara(ctx, x, y) || !naIlha(ilha, x, y)) continue;
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([vx, vy]) => ehAgua(tileEm(ctx.mundo, x + vx, y + vy)))) continue;
    costa.push({ x, y, d: Math.hypot(x - dx, y - dy) });
  }
  costa.sort((a, b) => a.d - b.d);
  return costa[0] ?? null;
}

/**
 * Tile de terra da ilha mais perto de (x, y): onde a jangada encosta.
 * Com `conectado`, só aceita tiles alcançáveis a pé a partir do centro (senão o bot pode
 * desembarcar numa praia isolada por árvores e pedras e ficar preso).
 */
function pontoDeDesembarque(ilha: Ilha, ctx: MundoBots, x: number, y: number, conectado = false): { x: number; y: number } | null {
  const L = ctx.mundo.largura;
  let permitido: Set<number> | null = null;
  if (conectado) {
    const ini = (Math.round(ilha.cy) + 1) * L + Math.round(ilha.cx); // ao lado do Cristal
    const pode = (i: number) => naIlha(ilha, i % L, Math.floor(i / L)) && andavelPara(ctx, i % L, Math.floor(i / L));
    permitido = new Set(pode(ini) ? [ini] : []);
    const fila = [...permitido];
    while (fila.length) {
      const i = fila.pop()!;
      for (const v of [i + 1, i - 1, i + L, i - L]) if (!permitido.has(v) && pode(v)) { permitido.add(v); fila.push(v); }
    }
  }
  let melhor: { x: number; y: number } | null = null, d = Infinity;
  const R = Math.ceil(ilha.raio * 1.4);
  for (let ty = Math.floor(ilha.cy) - R; ty <= ilha.cy + R; ty++) for (let tx = Math.floor(ilha.cx) - R; tx <= ilha.cx + R; tx++) {
    if (permitido ? !permitido.has(ty * L + tx) : !(andavelPara(ctx, tx, ty) && naIlha(ilha, tx, ty))) continue;
    const dist = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
    if (dist < d) { d = dist; melhor = { x: tx, y: ty }; }
  }
  return melhor;
}

/** Navega em linha reta (água ou terra), desviando de obstáculos. Retorna true ao chegar. */
function navegar(bot: Bot, ctx: MundoBots, alvoX: number, alvoY: number, dt: number, fatorVel: number): boolean {
  const dx = alvoX - bot.x, dy = alvoY - bot.y, dist = Math.hypot(dx, dy);
  if (dist < 0.4) { bot.andando = false; return true; }
  const passoT = Math.min(dist, (PERFIS[bot.perfil].velocidade * 0.8 * fatorVel * dt) / 1000);
  const livre = (x: number, y: number) => {
    const tx = Math.floor(x), ty = Math.floor(y), t = tileEm(ctx.mundo, tx, ty);
    return tx >= 0 && ty >= 0 && tx < ctx.mundo.largura && ty < ctx.mundo.altura && (ehAgua(t) || TILE_ANDAVEL[t]) && !ctx.bloqueado(tx, ty);
  };
  const base = Math.atan2(dy, dx);
  for (const desvio of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
    const a = base + desvio, nx = bot.x + Math.cos(a) * passoT, ny = bot.y + Math.sin(a) * passoT;
    if (livre(nx, ny)) { bot.x = nx; bot.y = ny; bot.dir = [Math.cos(a), Math.sin(a)]; bot.andando = true; return false; }
  }
  bot.andando = false;
  return false;
}

const DURACAO_COLETA = 120_000, LIMITE_EXPEDICAO = 360_000;

/**
 * Rota completa (terra livre + água) com A*, calculada uma vez por trecho. Em mar aberto o A*
 * vai quase reto (barato) e contorna ilhas e florestas com garantia. Retorna true ao chegar.
 * Se não achar rota, `e.rota` fica false e a expedição usa o plano B (porto + linha reta).
 */
function seguirRota(bot: Bot, ctx: MundoBots, e: NonNullable<Bot['expedicao']>, dt: number, vel: number): boolean {
  if (!e.alvo) return false;
  if (e.rota === undefined || e.rota === false && !bot.caminho.length && e.porto !== true && !(e as { tentou?: boolean }).tentou) {
    (e as { tentou?: boolean }).tentou = true;
    const navegavel = (x: number, y: number) => {
      const t = tileEm(ctx.mundo, x, y);
      return x >= 0 && y >= 0 && x < ctx.mundo.largura && y < ctx.mundo.altura && (ehAgua(t) || TILE_ANDAVEL[t]) && !ctx.bloqueado(x, y);
    };
    const c = acharCaminho(Math.floor(bot.x), Math.floor(bot.y), e.alvo.x, e.alvo.y, navegavel, { maxNos: 12000 });
    e.rota = !!c;
    bot.caminho = c ?? [];
  }
  if (!e.rota) return false;
  return passo(bot, dt, vel) && Math.abs(Math.floor(bot.x) - e.alvo.x) + Math.abs(Math.floor(bot.y) - e.alvo.y) <= 1;
}

/** Ida, coleta e volta da expedição. Retorna true enquanto a expedição controla o bot neste passo. */
function atualizarExpedicao(bot: Bot, ctx: MundoBots, dt: number): boolean {
  const e = bot.expedicao;
  if (!e) return false;
  const vel = ctx.velocidade ?? 1;
  // rede de segurança: expedição longa demais volta para casa
  if (ctx.agora - e.inicio > LIMITE_EXPEDICAO) {
    bot.x = Math.round(bot.ilha.cx) + 0.5; bot.y = Math.round(bot.ilha.cy) + 0.5;
    bot.expedicao = null; bot.ilhaAtual = null; bot.objetivo = null; bot.caminho = [];
    return true;
  }
  if (e.fase === 'ida') {
    if (e.alvo === undefined) e.alvo = pontoDeDesembarque(e.destino, ctx, bot.x, bot.y);
    if (seguirRota(bot, ctx, e, dt, vel)) {
      e.fase = 'coletar'; e.ate = ctx.agora + DURACAO_COLETA; e.alvo = undefined; e.porto = false; e.rota = false;
      bot.ilhaAtual = e.destino; bot.objetivo = null; bot.caminho = [];
      return true;
    }
    if (e.rota) return true;
    // 1ª etapa: andar pela própria ilha (A*) até a costa virada para o destino; em terra a linha reta trava em árvores
    if (!e.porto) {
      if (!bot.caminho.length) {
        const porto = portoDeSaida(bot, ctx, e.destino.cx, e.destino.cy);
        if (porto && !(Math.floor(bot.x) === porto.x && Math.floor(bot.y) === porto.y)) {
          if (!irPara(bot, ctx, porto.x, porto.y, false)) e.porto = true; // sem caminho: tenta direto
          else return true;
        } else e.porto = true;
      } else { if (passo(bot, dt, vel)) e.porto = true; return true; }
    }
    if (e.alvo === undefined) e.alvo = pontoDeDesembarque(e.destino, ctx, bot.x, bot.y); // calcula uma vez por trecho
    const p = e.alvo;
    if (!p) { e.fase = 'volta'; e.alvo = undefined; return true; }
    if (navegar(bot, ctx, p.x + 0.5, p.y + 0.5, dt, vel)) {
      e.fase = 'coletar'; e.ate = ctx.agora + DURACAO_COLETA; e.alvo = undefined; e.porto = false;
      bot.ilhaAtual = e.destino; bot.objetivo = null; bot.caminho = [];
    }
    return true;
  }
  if (e.fase === 'coletar') {
    const nec = necessidades(bot);
    if (ctx.agora >= e.ate || (nec.minerio <= 0 && nec.cristal <= 0)) { e.fase = 'volta'; e.alvo = undefined; e.porto = false; e.rota = false; bot.objetivo = null; bot.caminho = []; return true; }
    return false; // a lógica normal coleta na ilha neutra
  }
  if (e.alvo === undefined) e.alvo = pontoDeDesembarque(bot.ilha, ctx, bot.x, bot.y, true);
  if (seguirRota(bot, ctx, e, dt, vel)) { bot.expedicao = null; bot.ilhaAtual = null; bot.objetivo = null; bot.caminho = []; return true; }
  if (e.rota) return true;
  // volta: primeiro sai da ilha neutra pela costa virada para casa (mesmo esquema da ida)
  if (!e.porto) {
    if (!bot.caminho.length) {
      const porto = portoDeSaida(bot, ctx, bot.ilha.cx, bot.ilha.cy);
      if (porto && !(Math.floor(bot.x) === porto.x && Math.floor(bot.y) === porto.y) && irPara(bot, ctx, porto.x, porto.y, false)) return true;
      e.porto = true;
    } else { if (passo(bot, dt, vel)) e.porto = true; return true; }
  }
  // volta: desembarca num ponto conectado ao centro da ilha de casa
  if (e.alvo === undefined) e.alvo = pontoDeDesembarque(bot.ilha, ctx, bot.x, bot.y, true);
  const p = e.alvo;
  if (!p) { bot.x = Math.round(bot.ilha.cx) + 0.5; bot.y = Math.round(bot.ilha.cy) + 0.5; } // sem lugar: leva para casa
  if (!p || navegar(bot, ctx, p.x + 0.5, p.y + 0.5, dt, vel)) {
    bot.expedicao = null; bot.ilhaAtual = null; bot.objetivo = null; bot.caminho = [];
  }
  return true;
}

function passo(bot: Bot, dt: number, fatorVel = 1): boolean {
  if (!bot.caminho.length) { bot.andando = false; return true; }
  const [tx, ty] = bot.caminho[0];
  const dx = tx + 0.5 - bot.x, dy = ty + 0.5 - bot.y, d = Math.hypot(dx, dy);
  const p = (PERFIS[bot.perfil].velocidade * fatorVel * dt) / 1000;
  bot.andando = true;
  if (d <= p) { bot.x = tx + 0.5; bot.y = ty + 0.5; bot.caminho.shift(); }
  else { bot.x += (dx / d) * p; bot.y += (dy / d) * p; bot.dir = [dx / d, dy / d]; }
  return !bot.caminho.length;
}

function pontoAleatorio(bot: Bot, ctx: MundoBots, raio: number) {
  for (let i = 0; i < 8; i++) {
    const ilha = bot.ilhaAtual ?? bot.ilha;
    const x = Math.floor(ilha.cx + (bot.rng() - 0.5) * 2 * raio), y = Math.floor(ilha.cy + (bot.rng() - 0.5) * 2 * raio);
    if (andavelPara(ctx, x, y)) return { x, y };
  }
  return null;
}

/** Um passo de simulação do bot. Chamado a cada quadro (ou em lotes, numa simulação sem tela). */
export function atualizarBot(bot: Bot, ctx: MundoBots, dt: number) {
  if (atualizarExpedicao(bot, ctx, dt)) return;
  // Objetivos com tempo (caçar, vagar, descansar) terminam sozinhos; coletar/construir são reavaliados de tempos em tempos.
  const reavaliar = bot.objetivo && (bot.objetivo.tipo === 'coletar' || bot.objetivo.tipo === 'construir') && ctx.agora >= bot.proximaDecisao;
  if (!bot.objetivo || reavaliar) {
    criarOQueDer(bot);
    const novo = pagarExpansao(bot.nivel, bot.construcoes, bot.inv);
    if (novo) { bot.nivel = novo; ctx.aoExpandir?.(bot); }
    for (let h = escolherHabilidade(bot.status, bot.habilidades, bot.perfil); h; h = escolherHabilidade(bot.status, bot.habilidades, bot.perfil)) aprender(bot.status, bot.habilidades, h);
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
      // Sem caminho: se árvores estão no meio, abre caminho cortando a primeira delas.
      const arvore = arvoreNoCaminho(bot, ctx, escolha.recurso.x, escolha.recurso.y);
      if (arvore && irPara(bot, ctx, arvore.x, arvore.y, true)) bot.objetivo = { tipo: 'coletar', recurso: arvore };
      else { bot.ignorar.set(escolha.recurso.id, ctx.agora + 60_000); bot.objetivo = null; }
    }
    else if (escolha.tipo === 'expedicao') {
      bot.expedicao = { destino: escolha.destino, fase: 'ida', ate: 0, inicio: ctx.agora, parado: 0 };
      bot.objetivo = null;
      return;
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
  const chegou = passo(bot, dt, ctx.velocidade ?? 1);

  switch (o.tipo) {
    case 'coletar': {
      if (!chegou) return;
      if (!recursoAtivo(ctx.recursos, o.recurso)) { bot.objetivo = null; return; }
      bot.proximaDecisao = Math.max(bot.proximaDecisao, ctx.agora + 1000); // não abandona no meio
      bot.dir = [o.recurso.x + 0.5 - bot.x, o.recurso.y + 0.5 - bot.y];
      if (ctx.agora < bot.proximoGolpe) return;
      bot.proximoGolpe = ctx.agora + PERFIS[bot.perfil].ritmo * (ctx.ritmo ?? 1);
      const ef = efeitos(bot.habilidades);
      const res = golpear(ctx.recursos, bot.inv, o.recurso, ctx.agora, { bonus: ef.coleta, extra: ef.extra, poupar: ef.poupar, rng: bot.rng });
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
      const sorte = bot.rng() + (arma.id ? 0.35 : 0) + efeitos(bot.habilidades).dano * 0.03;
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
export type Dificuldade = 'facil' | 'normal' | 'dificil';
/** Fácil: bots lentos e com pausas; difícil: bots um pouco mais rápidos que no normal. */
export const DIFICULDADE: Record<Dificuldade, { ritmo: number; velocidade: number; preguica: number; nome: string }> = {
  facil: { ritmo: 2.6, velocidade: 0.7, preguica: 1.2, nome: 'Fácil' },
  normal: { ritmo: 1.6, velocidade: 0.85, preguica: 0.35, nome: 'Normal' },
  dificil: { ritmo: 1.0, velocidade: 1.0, preguica: 0, nome: 'Difícil' },
};

export const pontuacao = (nivel: number, construcoes: Construcao[], status: Status) =>
  nivel * 100 + construcoes.length * 5 + status.nivel * 10;
