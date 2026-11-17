import { criarRng } from './rng';

/**
 * Metas do dia: 3 tarefas curtas (5–10 min cada), as mesmas para todos no mesmo dia, ajustadas ao nível.
 * Completar as 3 aumenta a sequência de dias. Faltar um dia NÃO zera a sequência: ela só pausa.
 */
export type TipoMeta = 'quebrar' | 'criar' | 'bau' | 'bicho' | 'construir' | 'colher' | 'explorar';

export const DEF_METAS: Record<TipoMeta, { texto: (n: number) => string; base: number; porNivel: number; minNivel?: number }> = {
  quebrar: { texto: n => `Colete ${n} recursos (árvores, pedras, arbustos)`, base: 12, porNivel: 2 },
  criar: { texto: n => `Crie ${n} itens`, base: 4, porNivel: 1 },
  bicho: { texto: n => `Derrote ${n} criaturas`, base: 3, porNivel: 1 },
  bau: { texto: n => `Abra ${n} ${n === 1 ? 'baú' : 'baús'} do mundo`, base: 1, porNivel: 0.3, minNivel: 2 },
  construir: { texto: n => `Construa ${n} ${n === 1 ? 'coisa' : 'coisas'} na ilha`, base: 1, porNivel: 0.3 },
  colher: { texto: n => `Colha ${n} ${n === 1 ? 'plantação' : 'plantações'}`, base: 1, porNivel: 0.3, minNivel: 3 },
  explorar: { texto: n => `Descubra ${n} tiles novos no mapa`, base: 300, porNivel: 40 },
};

export interface Meta { tipo: TipoMeta; alvo: number; feito: number; }
export interface EstadoMetas {
  dia: string; metas: Meta[];
  /** dias com as 3 metas completas (não zera quando você falta) */
  sequencia: number;
  /** o bônus de completar as 3 já foi dado hoje */
  completouHoje: boolean;
}

/** Dia local no formato AAAA-MM-DD. */
export const hoje = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Sorteia as 3 metas do dia (mesmo dia = mesmas metas), sem repetir tipo e respeitando o nível da ilha. */
export function sortearMetas(dia: string, nivelIlha: number): Meta[] {
  const seed = [...dia].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
  const rng = criarRng(seed);
  const tipos = (Object.keys(DEF_METAS) as TipoMeta[]).filter(t => (DEF_METAS[t].minNivel ?? 1) <= nivelIlha);
  const escolhidos: TipoMeta[] = [];
  while (escolhidos.length < 3 && tipos.length) escolhidos.push(tipos.splice(Math.floor(rng() * tipos.length), 1)[0]);
  return escolhidos.map(tipo => {
    const d = DEF_METAS[tipo];
    return { tipo, alvo: Math.max(1, Math.round(d.base + d.porNivel * (nivelIlha - 1))), feito: 0 };
  });
}

export function novoEstadoMetas(nivelIlha: number, dia = hoje()): EstadoMetas {
  return { dia, metas: sortearMetas(dia, nivelIlha), sequencia: 0, completouHoje: false };
}

/** Virou o dia: novas metas; a sequência continua (só cresce quando você completa). */
export function virarDia(e: EstadoMetas, nivelIlha: number, dia = hoje()): boolean {
  if (e.dia === dia) return false;
  e.dia = dia; e.metas = sortearMetas(dia, nivelIlha); e.completouHoje = false;
  return true;
}

export type ResultadoMeta = { concluida: Meta[]; todas: boolean };

/** Registra progresso; devolve as metas que acabaram de ser concluídas e se o dia ficou completo agora. */
export function progredir(e: EstadoMetas, tipo: TipoMeta, n = 1): ResultadoMeta {
  const concluida: Meta[] = [];
  for (const m of e.metas) {
    if (m.tipo !== tipo || m.feito >= m.alvo) continue;
    m.feito = Math.min(m.alvo, m.feito + n);
    if (m.feito >= m.alvo) concluida.push(m);
  }
  let todas = false;
  if (!e.completouHoje && e.metas.length && e.metas.every(m => m.feito >= m.alvo)) {
    e.completouHoje = true; e.sequencia++; todas = true;
  }
  return { concluida, todas };
}

/** Marcos da sequência com presente extra. */
export const MARCOS_SEQUENCIA = [3, 7, 14, 30];
