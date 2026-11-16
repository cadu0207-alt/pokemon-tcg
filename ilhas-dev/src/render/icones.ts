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
  bau: [['..........', '.kkkkkkkk.', 'kwwwwwwwwk', 'kkkkyykkkk', 'kttkyyktt.', 'kttttttttk', 'kttttttttk', 'kkkkkkkkkk', '..........', '..........'],
    { k: K, w: '#c08a62', t: COR.tronco, y: '#ffd166' }],
  casa: [['....kk....', '...krrk...', '..krRrrk..', '.krrrrRrk.', 'kkkkkkkkkk', '.kwbwwbwk.', '.kwwkdkwk.', '.kwwkdkwk.', '.kkkkkkkk.', '..........'],
    { k: K, r: '#e07a8a', R: '#f2a3ae', w: '#f6efe0', b: COR.agua, d: COR.tronco }],
  cerca: [['..........', '.kk....kk.', '.kt....tk.', 'kktkkkktkk', 'wwtwwwwtww', 'kktkkkktkk', '.kt....tk.', '.kk....kk.', '..........', '..........'],
    { k: K, w: '#c08a62', t: COR.tronco }],
  carne: [['..........', '...kkkk...', '..krrrrk..', '.krrwrrrk.', '.krrrrrrk.', '..krrrrkw.', '...kkkkww.', '.......ww.', '..........', '..........'],
    { k: K, r: '#e8838f', w: '#fbf6ee' }],
  carne_assada: [['..........', '...kkkk...', '..kbbbbk..', '.kbbybbbk.', '.kbbbbbbk.', '..kbbbbkw.', '...kkkkww.', '.......ww.', '..........', '..........'],
    { k: K, b: '#a8603f', y: '#e0a060', w: '#fbf6ee' }],
  couro: [['..........', '.kkkkkkk..', 'kbbbbbbbk.', 'kbbcbbbbk.', '.kbbbbcbk.', 'kbbbbbbbk.', 'kbcbbbbk..', '.kkkkkkk..', '..........', '..........'],
    { k: K, b: '#9b6b4f', c: '#7a5038' }],
  gosma: [['..........', '..........', '...kkkk...', '..kgggwk..', '.kggggggk.', '.kgggggggk', '.kkkkkkkk.', '..........', '..........', '..........'],
    { k: K, g: '#8fd6e8', w: '#e8fbff' }],
  lanca_madeira: [['........kk', '.......kpk', '......kpk.', '.....ktk..', '....ktk...', '...ktk....', '..ktk.....', '.ktk......', 'kk........', '..........'],
    { k: K, p: '#d9c9a0', t: COR.tronco }],
  jangada: [['..........', '..........', '....kk....', '...kwk....', '..kwwk....', '.kwwwkt...', 'kkkkkkkkkk', 'ktktktktkk', '.kkkkkkkk.', '..........'],
    { k: K, w: '#fbf6ee', t: COR.tronco }],
  minerio: [['..........', '...kkkk...', '..kpopok..', '.kppppopk.', '.kpoppppk.', 'kppppopddk', '.kkkkkkkk.', '..........', '..........', '..........'],
    { k: K, p: COR.pedra, d: COR.pedraEsc, o: '#d9844a' }],
  cristal: [['....k.....', '...kck....', '..kcwck...', '..kccck...', '.kcccwck..', '.kccccck..', '..kccck...', '...kck....', '....k.....', '..........'],
    { k: K, c: '#a98bff', w: '#fff' }],
  lingote: [['..........', '..........', '...kkkkkk.', '..kwwwwwk.', '.kssssskk.', 'kssssssk..', 'kkkkkkkk..', '..........', '..........', '..........'],
    { k: K, w: '#e8edf2', s: '#a9b4c2' }],
  machado_ferro: [['..kkk.....', '.kssswk...', 'ksssstk...', 'kssskttk..', '.kkk.tk...', '.....tk...', '.....tk...', '.....tk...', '.....kk...', '..........'],
    { k: K, s: '#a9b4c2', w: '#fff', t: COR.tronco }],
  picareta_ferro: [['.kkkkkkk..', 'kssssssk..', 'ksk.t.ksk.', 'k...t...k.', '....t.....', '....t.....', '....t.....', '....t.....', '....k.....', '..........'],
    { k: K, s: '#a9b4c2', t: COR.tronco }],
  espada_ferro: [['........kk', '.......kwk', '......ksk.', '.....ksk..', '....ksk...', '.k.ksk....', '..kyk.....', '.kykk.....', 'kk..k.....', '..........'],
    { k: K, s: '#a9b4c2', w: '#fff', y: '#ffd166' }],
  pocao_mana: [['...kkk....', '...kwk....', '..kkkkk...', '.kcccwck..', 'kccccccck.', 'kccccccck.', '.kcccccck.', '..kkkkkk..', '..........', '..........'],
    { k: K, c: '#7aa7ff', w: '#fff' }],
  forja: [['..........', '.......kk.', '.kkkkkkkpk', 'kppppppppk', 'kpkoyyokpk', 'kpkoyyokpk', 'kppppppppk', 'kkkkkkkkkk', '..........', '..........'],
    { k: K, p: COR.pedra, o: '#ff9a3c', y: '#ffe07a' }],
  altar: [['....kk....', '...kcck...', '....kk....', '..kkkkkk..', '..kppppk..', '.kkkkkkkk.', '.kppppppk.', 'kkkkkkkkkk', '..........', '..........'],
    { k: K, p: COR.pedra, c: '#a98bff' }],
  torre: [['.k.k.k.k..', '.kkkkkkk..', '.kpppppk..', '..kpbpk...', '..kpppk...', '..kpbpk...', '.kpppppk..', '.kppkppk..', '.kkkkkkk..', '..........'],
    { k: K, p: COR.pedra, b: K }],
  estatua: [['...kkk....', '...kck....', '..kpppk...', '.kpkpkpk..', '...kpk....', '...kpk....', '.kkkkkkk..', 'kpppppppk.', 'kkkkkkkkk.', '..........'],
    { k: K, p: COR.pedra, c: '#a98bff' }],
  espada_pedra: [['........kk', '.......kwk', '......kpk.', '.....kpk..', '....kpk...', '.k.kpk....', '..kyk.....', '.kykk.....', 'kk..k.....', '..........'],
    { k: K, p: COR.pedra, w: '#fff', y: COR.tronco }],
};

import { ICONES_PNG } from './assets';

/** Quem consegue recortar ícones das folhas carregadas (a cena registra ao iniciar). */
let recortar: ((id: ItemId) => string | null) | null = null;
export const registrarRecorte = (f: (id: ItemId) => string | null) => { recortar = f; cache.clear(); };

const cache = new Map<ItemId, string>();
export function icone(id: ItemId): string {
  let url = cache.get(id);
  if (!url && ICONES_PNG[id]) url = ICONES_PNG[id];
  if (!url && recortar) url = recortar(id) ?? undefined;
  if (url) cache.set(id, url);
  if (!url) {
    const c = document.createElement('canvas'); c.width = c.height = 10;
    const [linhas, pal] = MAPAS[id];
    desenhar(c.getContext('2d')!, linhas, pal);
    url = c.toDataURL(); cache.set(id, url);
  }
  return url;
}
