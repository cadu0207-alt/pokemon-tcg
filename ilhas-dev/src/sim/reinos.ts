import type { Construcao } from './construcao';
import { adicionar, novoInventario, remover, type Inventario } from './inventario';
import type { ItemId } from './itens';
import { raioDoNivel, type Ilha } from './mundo';
import { defesa } from './saque';

/**
 * Reinos: cada Cristal projeta um círculo de influência que cresce com o nível da ilha. Quando dois
 * círculos se tocam e um reino é bem mais forte, o mais fraco vira vassalo (paga tributo, ganha proteção).
 * Vassalos que crescem se rebelam. Tudo aqui é puro: o tempo (`agora`) é tempo de jogo em ms.
 */

/** Participante: o jogador, um bot (ou, no futuro, outra pessoa). `id` é o id da ilha inicial. */
export interface Membro {
  id: number; nome: string; ilha: Ilha; nivel: number; nivelJogador: number; construcoes: Construcao[];
  /** pessoa de verdade: recebe uma proposta em vez de ser dominada na hora */
  humano?: boolean;
}

export interface EstadoReinos {
  /** vassalo -> rei (só um nível: o rei de um rei vira o rei de todos) */
  senhor: Record<number, number>;
  /** depois de se libertar/recusar, ninguém tenta dominar até este instante */
  imuneAte: Record<number, number>;
  /** pessoa que recusou a vassalagem: o rei a pressiona com saques até este instante */
  resistindo: Record<number, { rei: number; ate: number }>;
  /** rebelião que falhou: só pode tentar de novo depois disto */
  esperaRebeliao: Record<number, number>;
  /** quando foi cobrado o último tributo de cada vassalo */
  ultimoTributo: Record<number, number>;
}

export const novoEstadoReinos = (): EstadoReinos => ({ senhor: {}, imuneAte: {}, resistindo: {}, esperaRebeliao: {}, ultimoTributo: {} });

/** O mais forte precisa ter pelo menos isto vezes a força do outro para dominar. */
export const VANTAGEM = 1.25;
export const TRIBUTO_FRACAO = 0.15;
export const TRIBUTO_MS = 60 * 60_000;
export const IMUNIDADE_MS = 20 * 60_000;
export const RESISTENCIA_MS = 15 * 60_000;
export const ESPERA_REBELIAO_MS = 10 * 60_000;
/** vassalos somam metade da força para o reino */
const PESO_VASSALO = 0.5;
/** materiais que entram no tributo (cristal e comida ficam com o vassalo) */
export const ITENS_TRIBUTO: ItemId[] = ['madeira', 'pedra', 'fibra', 'minerio', 'lingote', 'couro'];

/** Raio de influência em tiles: o raio da ilha mais 2,2 tiles por nível. */
export const raioInfluencia = (ilha: Ilha, nivel: number) => raioDoNivel(ilha.raioMax || ilha.raio, nivel) + 2.2 * nivel;

export const emContato = (a: Membro, b: Membro) =>
  Math.hypot(a.ilha.cx - b.ilha.cx, a.ilha.cy - b.ilha.cy) <= raioInfluencia(a.ilha, a.nivel) + raioInfluencia(b.ilha, b.nivel);

/** Força de uma ilha sozinha: nível da ilha, defesas construídas e nível do dono. */
export const forcaIlha = (m: Membro) => m.nivel * 10 + defesa(m.construcoes) + m.nivelJogador * 2;

export const reiDe = (e: EstadoReinos, id: number) => e.senhor[id] ?? id;
export const vassalosDe = (e: EstadoReinos, rei: number) => Object.keys(e.senhor).map(Number).filter(v => e.senhor[v] === rei);

export function forcaReino(e: EstadoReinos, porId: Map<number, Membro>, rei: number) {
  const r = porId.get(rei);
  let f = r ? forcaIlha(r) : 0;
  for (const v of vassalosDe(e, rei)) { const m = porId.get(v); if (m) f += forcaIlha(m) * PESO_VASSALO; }
  return f;
}

/** Membro a partir de um bot (ou qualquer coisa com o mesmo formato). */
export const membroDe = (b: { ilha: Ilha; nome: string; nivel: number; status: { nivel: number }; construcoes: Construcao[] }, humano = false): Membro =>
  ({ id: b.ilha.id, nome: b.nome, ilha: b.ilha, nivel: b.nivel, nivelJogador: b.status.nivel, construcoes: b.construcoes, humano });

/** Passa o tributo entre dois inventários; devolve o que foi pago. */
export function pagarTributo(de: Inventario, para: Inventario, fracao = TRIBUTO_FRACAO) {
  const levado = cobrarTributo(de, fracao);
  for (const [id, n] of Object.entries(levado.itens)) adicionar(para, id as ItemId, n!);
  return levado.itens as Partial<Record<ItemId, number>>;
}

export type EventoReino =
  | { tipo: 'dominou'; rei: number; alvo: number; vassalos: number[] }
  | { tipo: 'proposta'; rei: number; alvo: number; forcaRei: number; forcaAlvo: number }
  | { tipo: 'rebeliao'; vassalo: number; rei: number; sucesso: boolean }
  | { tipo: 'tributo'; vassalo: number; rei: number; itens: Partial<Record<ItemId, number>> };

/** Coloca `alvo` (e os vassalos dele) sob o rei `rei`. */
export function submeter(e: EstadoReinos, rei: number, alvo: number, agora: number): number[] {
  const levados = [alvo, ...vassalosDe(e, alvo)];
  for (const v of levados) { e.senhor[v] = rei; e.ultimoTributo[v] = agora; delete e.resistindo[v]; }
  return levados;
}

export function libertar(e: EstadoReinos, vassalo: number, agora: number) {
  delete e.senhor[vassalo]; delete e.ultimoTributo[vassalo];
  e.imuneAte[vassalo] = agora + IMUNIDADE_MS;
}

/** Pessoa recusou a vassalagem: fica imune a novas propostas por um tempo, mas o rei pressiona com saques. */
export function resistir(e: EstadoReinos, alvo: number, rei: number, agora: number) {
  e.resistindo[alvo] = { rei, ate: agora + RESISTENCIA_MS };
  e.imuneAte[alvo] = agora + RESISTENCIA_MS;
}

/**
 * Rebelião: o vassalo se junta aos outros vassalos do mesmo rei que estão perto de igualá-lo (≥ 60% da força
 * do rei) e soma metade da força deles. Vence se passar a força da ilha do rei.
 */
export function rebelar(e: EstadoReinos, porId: Map<number, Membro>, vassalo: number, agora: number): { sucesso: boolean; forca: number; forcaRei: number } {
  const rei = e.senhor[vassalo];
  const mv = porId.get(vassalo), mr = rei !== undefined ? porId.get(rei) : undefined;
  if (rei === undefined || !mv || !mr) return { sucesso: false, forca: 0, forcaRei: 0 };
  const forcaRei = forcaIlha(mr);
  let forca = forcaIlha(mv);
  for (const o of vassalosDe(e, rei)) {
    const m = porId.get(o);
    if (o !== vassalo && m && forcaIlha(m) >= forcaRei * 0.6) forca += forcaIlha(m) * PESO_VASSALO;
  }
  const sucesso = forca > forcaRei;
  if (sucesso) libertar(e, vassalo, agora);
  else e.esperaRebeliao[vassalo] = agora + ESPERA_REBELIAO_MS;
  return { sucesso, forca, forcaRei };
}

/** Separa a parte do tributo de um inventário (remove dele e devolve o que foi tirado). */
export function cobrarTributo(inv: Inventario, fracao = TRIBUTO_FRACAO): Inventario {
  const levado = novoInventario();
  for (const id of ITENS_TRIBUTO) {
    const n = Math.floor((inv.itens[id] ?? 0) * fracao);
    if (n > 0) { remover(inv, id, n); adicionar(levado, id, n); }
  }
  return levado;
}

/**
 * Um passo dos reinos: disputas de fronteira, rebeliões automáticas (bots) e o que vence de tributo.
 * Devolve os eventos; o tributo em si (mexer nos inventários) fica com quem chama, porque cada lado
 * guarda os itens num lugar (mochila do bot, baú do jogador).
 */
export function passoReinos(e: EstadoReinos, membros: Membro[], agora: number): EventoReino[] {
  const ev: EventoReino[] = [];
  const porId = new Map(membros.map(m => [m.id, m]));
  // vassalos de quem sumiu ficam livres
  for (const v of Object.keys(e.senhor).map(Number)) if (!porId.has(v) || !porId.has(e.senhor[v])) delete e.senhor[v];

  // 1) rebeliões automáticas: o bot vassalo que já é mais forte que o rei se liberta
  for (const m of membros) {
    const rei = e.senhor[m.id];
    if (rei === undefined || m.humano || (e.esperaRebeliao[m.id] ?? 0) > agora) continue;
    const mr = porId.get(rei);
    if (mr && forcaIlha(m) > forcaIlha(mr)) {
      const r = rebelar(e, porId, m.id, agora);
      ev.push({ tipo: 'rebeliao', vassalo: m.id, rei, sucesso: r.sucesso });
    }
  }

  // 2) fronteiras: reinos que se tocam; o bem mais forte domina o outro
  const ordenados = [...membros].sort((a, b) => forcaReino(e, porId, reiDe(e, b.id)) - forcaReino(e, porId, reiDe(e, a.id)));
  for (let i = 0; i < ordenados.length; i++) for (let j = i + 1; j < ordenados.length; j++) {
    const a = ordenados[i], b = ordenados[j];
    const ra = reiDe(e, a.id), rb = reiDe(e, b.id);
    if (ra === rb || !emContato(a, b)) continue;
    let fa = forcaReino(e, porId, ra), fb = forcaReino(e, porId, rb);
    let forte = ra, fraco = rb;
    if (fb > fa) { forte = rb; fraco = ra; [fa, fb] = [fb, fa]; }
    if (fa < fb * VANTAGEM || (e.imuneAte[fraco] ?? 0) > agora) continue;
    const alvo = porId.get(fraco)!;
    if (alvo.humano) {
      e.imuneAte[fraco] = agora + RESISTENCIA_MS; // não repete a proposta a cada passo
      ev.push({ tipo: 'proposta', rei: forte, alvo: fraco, forcaRei: fa, forcaAlvo: fb });
      continue;
    }
    const vassalos = submeter(e, forte, fraco, agora);
    ev.push({ tipo: 'dominou', rei: forte, alvo: fraco, vassalos });
  }

  // 3) tributo vencido (a cada hora de jogo)
  for (const v of Object.keys(e.senhor).map(Number)) {
    if (agora - (e.ultimoTributo[v] ?? agora) < TRIBUTO_MS) { e.ultimoTributo[v] ??= agora; continue; }
    e.ultimoTributo[v] = agora;
    ev.push({ tipo: 'tributo', vassalo: v, rei: e.senhor[v], itens: {} });
  }
  return ev;
}
