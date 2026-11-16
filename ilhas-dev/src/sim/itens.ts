export type ItemId =
  | 'madeira' | 'pedra' | 'fibra' | 'baga' | 'corda'
  | 'machado_pedra' | 'picareta_pedra' | 'foice_pedra'
  | 'fogueira' | 'bancada' | 'bau' | 'casa' | 'cerca'
  | 'carne' | 'couro' | 'gosma' | 'carne_assada' | 'espada_pedra' | 'lanca_madeira';

export interface DefItem {
  nome: string;
  /** Ferramentas: tipo de recurso em que dão mais dano, dano e durabilidade. */
  ferramenta?: { alvo: 'arvore' | 'pedra' | 'arbusto' | 'criatura'; dano: number; durabilidade: number };
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
  bau: { nome: 'Baú', construivel: true },
  casa: { nome: 'Casa', construivel: true },
  cerca: { nome: 'Cerca', construivel: true },
  carne: { nome: 'Carne crua', comida: 3 },
  couro: { nome: 'Couro' },
  gosma: { nome: 'Gosma' },
  carne_assada: { nome: 'Carne assada', comida: 12 },
  lanca_madeira: { nome: 'Lança de madeira', ferramenta: { alvo: 'criatura', dano: 3, durabilidade: 30 } },
  espada_pedra: { nome: 'Espada de pedra', ferramenta: { alvo: 'criatura', dano: 5, durabilidade: 50 } },
};

/** `nivel`: nível mínimo da ilha para liberar a receita. */
export interface Receita { id: ItemId; qtd: number; custo: Partial<Record<ItemId, number>>; nivel?: number; }

export const RECEITAS: Receita[] = [
  { id: 'corda', qtd: 1, custo: { fibra: 3 } },
  { id: 'machado_pedra', qtd: 1, custo: { madeira: 3, pedra: 2, corda: 1 } },
  { id: 'picareta_pedra', qtd: 1, custo: { madeira: 3, pedra: 3, corda: 1 } },
  { id: 'foice_pedra', qtd: 1, custo: { madeira: 2, pedra: 2, corda: 1 } },
  { id: 'fogueira', qtd: 1, custo: { madeira: 5, pedra: 3 } },
  { id: 'bancada', qtd: 1, custo: { madeira: 8, corda: 2 } },
  { id: 'lanca_madeira', qtd: 1, custo: { madeira: 4, corda: 1 } },
  { id: 'espada_pedra', qtd: 1, custo: { madeira: 2, pedra: 4, corda: 1, couro: 1 }, nivel: 2 },
  { id: 'carne_assada', qtd: 1, custo: { carne: 1, madeira: 1 }, nivel: 2 },
  { id: 'cerca', qtd: 2, custo: { madeira: 2 }, nivel: 2 },
  { id: 'bau', qtd: 1, custo: { madeira: 10, corda: 1 }, nivel: 2 },
  { id: 'casa', qtd: 1, custo: { madeira: 20, pedra: 10, corda: 4 }, nivel: 2 },
];

/** O que cada recurso tem de vida, o que solta ao ser destruído e quanto tempo leva para voltar. */
export const DEF_RECURSO = {
  arvore: { vida: 6, solta: { madeira: 3 } as Partial<Record<ItemId, number>>, renasceMs: 120_000 },
  pedra: { vida: 6, solta: { pedra: 2 } as Partial<Record<ItemId, number>>, renasceMs: 180_000 },
  arbusto: { vida: 2, solta: { fibra: 2, baga: 1 } as Partial<Record<ItemId, number>>, renasceMs: 60_000 },
};
