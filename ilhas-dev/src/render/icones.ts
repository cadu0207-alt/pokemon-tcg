import { COR, desenhar } from './pixels';
import type { ItemId } from '../sim/itens';

/** Ícones 10×10 em pixel art, convertidos para dataURL para a interface HTML. */
const K = COR.contorno;
const MAPAS: Record<ItemId, [string[], Record<string, string>]> = {
  madeira: [['..........', '..kkkkkk..', '.kttttttk.', 'kwttttttkk', 'kwtttttktk', 'kttttttkk.', '.kkkkkkk..', '..........', '..........', '..........'],
    { k: K, t: COR.tronco, w: '#c08a62' }],
  pedra: [['..........', '...kkkk...', '..kppppk..', '.kpwpppdk.', '.kpppppdk.', 'kpppppdddk', '.kkkkkkkk.', '..........', '..........', '..........'],
    { k: K, p: COR.pedra, d: COR.pedraEsc, w: '#fff' }],
  fibra: [['....g.....', '...g..g...', '...g.g..g.', '..g..g.g..', '..g.g..g..', '.g..g.g...', '.g.g..g...', '..g.g.....', '..........', '..........'],
    { g: COR.gramaEsc }],
  baga: [['....g.....', '...gg.....', '..kkk.kkk.', '.kbbbkbwbk', '.kbwbkbbbk', '.kbbbkbbbk', '..kkk.kkk.', '..........', '..........', '..........'],
    { k: K, b: COR.baga, w: '#ffd0dc', g: COR.gramaEsc }],
  corda: [['..........', '..kkkkk...', '.kyyyyyk..', 'kyk...kyk.', 'kyk...kyk.', '.kyyyyyk..', '...kyk....', '...kyk....', '....k.....', '..........'],
    { k: K, y: '#d9b778' }],
  machado_pedra: [['..kkk.....', '.kpppk....', 'kpppptk...', 'kpppktk...', '.kkk.tk...', '.....tk...', '.....tk...', '.....tk...', '.....kk...', '..........'],
    { k: K, p: COR.pedra, t: COR.tronco }],
  picareta_pedra: [['.kkkkkkk..', 'kpppppppk.', 'kpk.t.kpk.', 'k...t...k.', '....t.....', '....t.....', '....t.....', '....t.....', '....k.....', '..........'],
    { k: K, p: COR.pedra, t: COR.tronco }],
  foice_pedra: [['...kkkk...', '..kpppk...', '.kpkk.....', '.kpk......', '..kptk....', '....tk....', '....tk....', '....tk....', '....kk....', '..........'],
    { k: K, p: COR.pedra, t: COR.tronco }],
  fogueira: [['....r.....', '...rory...', '..roooyr..', '..royyor..', '...ryyr...', '.tkkkkkt..', 'tttttttttt', '.p.p.p.p..', '..........', '..........'],
    { r: '#e0503c', o: '#ff9a3c', y: '#ffe07a', k: K, t: COR.tronco, p: COR.pedra }],
  bancada: [['..........', 'kkkkkkkkkk', 'kwwwwwwwwk', 'kttttttttk', '.kt....tk.', '.kt....tk.', '.kt....tk.', '.kk....kk.', '..........', '..........'],
    { k: K, w: '#c08a62', t: COR.tronco }],
};

const cache = new Map<ItemId, string>();
export function icone(id: ItemId): string {
  let url = cache.get(id);
  if (!url) {
    const c = document.createElement('canvas'); c.width = c.height = 10;
    const [linhas, pal] = MAPAS[id];
    desenhar(c.getContext('2d')!, linhas, pal);
    url = c.toDataURL(); cache.set(id, url);
  }
  return url;
}
