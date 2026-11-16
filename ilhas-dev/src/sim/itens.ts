export type ItemId =
  | 'madeira' | 'pedra' | 'fibra' | 'baga' | 'corda'
  | 'machado_pedra' | 'picareta_pedra' | 'foice_pedra' | 'fogueira' | 'bancada';

export interface DefItem {
  nome: string;
  /** Ferramentas: tipo de recurso em que dão mais dano, dano e durabilidade. */
  ferramenta?: { alvo: 'arvore' | 'pedra' | 'arbusto'; dano: number; durabilidade: number };
  /** Itens que serão posicionados na ilha (fase 2). */
  construivel?: boolean;
  comida?: number;
}

export const ITENS: Record<ItemId, DefItem> = {
  madeira: { nome: 'Madeira' },
  pedra: { nome: 'Pedra' },
  fibra: { nome: 'Fibra' },
  baga: { nome: 'Baga', comida: 5 },
  corda: { nome: 'Corda' },
  machado_pedra: { nome: 'Machado de pedra', ferramenta: { alvo: 'arvore', dano: 3, durabilidade: 40 } },
  picareta_pedra: { nome: 'Picareta de pedra', ferramenta: { alvo: 'pedra', dano: 3, durabilidade: 40 } },
  foice_pedra: { nome: 'Foice de pedra', ferramenta: { alvo: 'arbusto', dano: 3, durabilidade: 40 } },
  fogueira: { nome: 'Fogueira', construivel: true },
  bancada: { nome: 'Bancada', construivel: true },
};

export interface Receita { id: ItemId; qtd: number; custo: Partial<Record<ItemId, number>>; }

export const RECEITAS: Receita[] = [
  { id: 'corda', qtd: 1, custo: { fibra: 3 } },
  { id: 'machado_pedra', qtd: 1, custo: { madeira: 3, pedra: 2, corda: 1 } },
  { id: 'picareta_pedra', qtd: 1, custo: { madeira: 3, pedra: 3, corda: 1 } },
  { id: 'foice_pedra', qtd: 1, custo: { madeira: 2, pedra: 2, corda: 1 } },
  { id: 'fogueira', qtd: 1, custo: { madeira: 5, pedra: 3 } },
  { id: 'bancada', qtd: 1, custo: { madeira: 8, corda: 2 } },
];

/** O que cada recurso tem de vida, o que solta ao ser destruído e quanto tempo leva para voltar. */
export const DEF_RECURSO = {
  arvore: { vida: 6, solta: { madeira: 3 } as Partial<Record<ItemId, number>>, renasceMs: 120_000 },
  pedra: { vida: 6, solta: { pedra: 2 } as Partial<Record<ItemId, number>>, renasceMs: 180_000 },
  arbusto: { vida: 2, solta: { fibra: 2, baga: 1 } as Partial<Record<ItemId, number>>, renasceMs: 60_000 },
};
