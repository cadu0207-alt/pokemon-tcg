import type { Status } from './criaturas';

export type Ramo = 'sobrevivencia' | 'combate' | 'arcano' | 'engenharia';
export type Magia = 'faisca' | 'agua' | 'pedra' | 'vento' | 'chuva';

export interface Efeitos {
  vidaMax: number; regen: number;        // regen: vida por segundo
  comida: number;                        // multiplicador extra da cura por comida
  dano: number; velocidadeAtaque: number; critico: number;
  coleta: number; extra: number; poupar: number;
  manaMax: number; magias: Magia[];
  velocidade: number;                    // multiplicador extra de movimento
}

export interface Habilidade {
  id: string; ramo: Ramo; nome: string; descricao: string;
  requer: string | null; nivelMin: number;
  efeito: Partial<Omit<Efeitos, 'magias'>> & { magia?: Magia };
}

const H = (id: string, ramo: Ramo, nome: string, descricao: string, requer: string | null, nivelMin: number, efeito: Habilidade['efeito']): Habilidade =>
  ({ id, ramo, nome, descricao, requer, nivelMin, efeito });

/** Cada ramo é uma corrente de 5 nós: cada nó exige o anterior. */
export const HABILIDADES: Habilidade[] = [
  H('s1', 'sobrevivencia', 'Pele grossa', '+6 de vida máxima', null, 2, { vidaMax: 6 }),
  H('s2', 'sobrevivencia', 'Boa digestão', 'Comida cura 50% a mais', 's1', 3, { comida: 0.5 }),
  H('s3', 'sobrevivencia', 'Fôlego', 'Recupera 0,3 de vida por segundo', 's2', 4, { regen: 0.3 }),
  H('s4', 'sobrevivencia', 'Pés ligeiros', 'Anda 15% mais rápido', 's3', 6, { velocidade: 0.15 }),
  H('s5', 'sobrevivencia', 'Coração de ilhéu', '+14 de vida máxima', 's4', 8, { vidaMax: 14 }),

  H('c1', 'combate', 'Golpe firme', '+2 de dano em criaturas', null, 2, { dano: 2 }),
  H('c2', 'combate', 'Ritmo de luta', 'Ataca 20% mais rápido', 'c1', 3, { velocidadeAtaque: 0.2 }),
  H('c3', 'combate', 'Olho certeiro', '15% de chance de dano dobrado', 'c2', 4, { critico: 0.15 }),
  H('c4', 'combate', 'Força bruta', '+3 de dano em criaturas', 'c3', 6, { dano: 3 }),
  H('c5', 'combate', 'Fúria', 'Ataca mais 20% mais rápido e +10% de crítico', 'c4', 8, { velocidadeAtaque: 0.2, critico: 0.1 }),

  H('a1', 'arcano', 'Faísca', 'Magia de fogo: dispara uma chama (5 de mana)', null, 2, { magia: 'faisca', manaMax: 20 }),
  H('a2', 'arcano', 'Água viva', 'Magia de água: cura 10 de vida (8 de mana)', 'a1', 3, { magia: 'agua', manaMax: 5 }),
  H('a3', 'arcano', 'Pele de pedra', 'Magia de terra: metade do dano por 8 s (10 de mana)', 'a2', 4, { magia: 'pedra', manaMax: 5 }),
  H('a4', 'arcano', 'Rajada', 'Magia de vento: corre 80% mais rápido por 5 s (6 de mana)', 'a3', 6, { magia: 'vento', manaMax: 10 }),
  H('a5', 'arcano', 'Chuva de fogo', 'Fogo em volta de você: 12 de dano em área (15 de mana)', 'a4', 8, { magia: 'chuva', manaMax: 15 }),

  H('e1', 'engenharia', 'Mãos hábeis', '+1 de dano ao coletar', null, 2, { coleta: 1 }),
  H('e2', 'engenharia', 'Cuidado com as ferramentas', '30% de chance de não gastar durabilidade', 'e1', 3, { poupar: 0.3 }),
  H('e3', 'engenharia', 'Aproveitamento', '+1 item ao derrubar um recurso', 'e2', 4, { extra: 1 }),
  H('e4', 'engenharia', 'Braço forte', '+2 de dano ao coletar', 'e3', 6, { coleta: 2 }),
  H('e5', 'engenharia', 'Mestre artesão', 'Mais 30% de chance de poupar ferramentas', 'e4', 8, { poupar: 0.3 }),
];

export const MAGIAS: Record<Magia, { nome: string; custo: number; recarga: number }> = {
  faisca: { nome: 'Faísca', custo: 5, recarga: 450 },
  agua: { nome: 'Água viva', custo: 8, recarga: 1500 },
  pedra: { nome: 'Pele de pedra', custo: 10, recarga: 9000 },
  vento: { nome: 'Rajada', custo: 6, recarga: 6000 },
  chuva: { nome: 'Chuva de fogo', custo: 15, recarga: 3000 },
};

export const porId = new Map(HABILIDADES.map(h => [h.id, h]));

/** Pontos disponíveis: 1 por nível acima do 1, menos os já gastos. */
export const pontosLivres = (s: Status, aprendidas: string[]) => s.nivel - 1 - aprendidas.length;

export type MotivoBloqueio = 'aprendida' | 'sem_pontos' | 'requer_anterior' | 'nivel' | null;

export function podeAprender(s: Status, aprendidas: string[], id: string): MotivoBloqueio {
  const h = porId.get(id);
  if (!h) return 'requer_anterior';
  if (aprendidas.includes(id)) return 'aprendida';
  if (h.requer && !aprendidas.includes(h.requer)) return 'requer_anterior';
  if (s.nivel < h.nivelMin) return 'nivel';
  if (pontosLivres(s, aprendidas) <= 0) return 'sem_pontos';
  return null;
}

/** Aprende e aplica o efeito permanente de vida máxima. Retorna true se aprendeu. */
export function aprender(s: Status, aprendidas: string[], id: string): boolean {
  if (podeAprender(s, aprendidas, id)) return false;
  aprendidas.push(id);
  const vm = porId.get(id)!.efeito.vidaMax ?? 0;
  s.vidaMax += vm; s.vida += vm;
  return true;
}

export function efeitos(aprendidas: string[]): Efeitos {
  const e: Efeitos = { vidaMax: 0, regen: 0, comida: 0, dano: 0, velocidadeAtaque: 0, critico: 0, coleta: 0, extra: 0, poupar: 0, manaMax: 0, magias: [], velocidade: 0 };
  for (const id of aprendidas) {
    const ef = porId.get(id)?.efeito;
    if (!ef) continue;
    for (const [k, v] of Object.entries(ef)) {
      if (k === 'magia') e.magias.push(v as Magia);
      else (e as unknown as Record<string, number>)[k] += v as number;
    }
  }
  return e;
}

/** Ordem de preferência dos ramos por perfil de bot. */
export const RAMOS_DO_PERFIL: Record<string, Ramo[]> = {
  coletor: ['engenharia', 'sobrevivencia', 'combate', 'arcano'],
  construtor: ['engenharia', 'sobrevivencia', 'arcano', 'combate'],
  cacador: ['combate', 'sobrevivencia', 'engenharia', 'arcano'],
  explorador: ['arcano', 'sobrevivencia', 'combate', 'engenharia'],
};

/** Bots gastam pontos seguindo o perfil: o primeiro nó disponível no ramo preferido. */
export function escolherHabilidade(s: Status, aprendidas: string[], perfil: string): string | null {
  for (const ramo of RAMOS_DO_PERFIL[perfil] ?? []) {
    const h = HABILIDADES.find(h => h.ramo === ramo && !podeAprender(s, aprendidas, h.id));
    if (h) return h.id;
  }
  return null;
}
