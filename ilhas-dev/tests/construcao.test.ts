import { describe, it, expect } from 'vitest';
import { gerarMundo } from '../src/sim/mundo';
import { validarLocal, type Construcao } from '../src/sim/construcao';
import { carregar, serializar } from '../src/sim/save';
import { novoInventario, adicionar, criar, podeCriar } from '../src/sim/inventario';
import { RECEITAS } from '../src/sim/itens';

describe('construção', () => {
  const m = gerarMundo({ seed: 9, participantes: 4 });
  const ilha = m.ilhas[0];
  const cx = Math.round(ilha.cx), cy = Math.round(ilha.cy);
  const livre = () => false;

  it('valida o local', () => {
    expect(validarLocal(m, ilha, [], livre, cx, cy)).toBeNull();
    expect(validarLocal(m, ilha, [{ tipo: 'bau', x: cx, y: cy }], livre, cx, cy)).toBe('ocupado');
    expect(validarLocal(m, ilha, [], () => true, cx, cy)).toBe('ocupado');
    expect(validarLocal(m, ilha, [], livre, cx + 200, cy)).toBe('fora_da_ilha');
  });

  it('expansão exige construções e alimentar o Cristal (cristal só existe fora de casa)', async () => {
    const { requisitosExpansao, pagarExpansao } = await import('../src/sim/expansao');
    const inv = novoInventario();
    const c: Construcao[] = [];
    expect(requisitosExpansao(1, c, inv)!.pronto).toBe(false);
    c.push({ tipo: 'fogueira', x: 0, y: 0 });
    adicionar(inv, 'madeira', 10);
    expect(pagarExpansao(1, c, inv)).toBeNull();          // falta cristal
    adicionar(inv, 'cristal', 1);
    expect(pagarExpansao(1, c, inv)).toBe(2);
    expect(inv.itens.cristal ?? 0).toBe(0);               // o Cristal consumiu
    expect(requisitosExpansao(10, c, inv)).toBeNull();    // nível máximo
  });

  it('a terra cresce ao expandir e os recursos da área nova aparecem', async () => {
    const { expandirTerreno } = await import('../src/sim/expansao');
    const { iniciarRecursos } = await import('../src/sim/coleta');
    const { TILE_ANDAVEL } = await import('../src/sim/mundo');
    const m2 = gerarMundo({ seed: 11, participantes: 4 });
    const rec = iniciarRecursos(m2);
    const ilha = m2.ilhas[0];
    const terra = () => { let n = 0; for (let i = 0; i < m2.tiles.length; i++) if (TILE_ANDAVEL[m2.tiles[i] as 0] && Math.hypot(i % m2.largura - ilha.cx, Math.floor(i / m2.largura) - ilha.cy) < ilha.raioMax * 1.3) n++; return n; };
    const antes = terra(), submersosAntes = rec.submersos.size;
    const r = expandirTerreno(m2, rec, ilha, 6);
    expect(terra()).toBeGreaterThan(antes * 2);
    expect(r.emergiram.length).toBeGreaterThan(0);
    expect(rec.submersos.size).toBe(submersosAntes - r.emergiram.length);
  });

  it('receitas travadas por nível', () => {
    const inv = novoInventario(); adicionar(inv, 'madeira', 50); adicionar(inv, 'corda', 5);
    const bau = RECEITAS.find(r => r.id === 'bau')!;
    expect(podeCriar(inv, bau, 1)).toBe(false);
    expect(criar(inv, bau, 2)).toBe(true);
  });
});

describe('save', () => {
  it('ida e volta, e rejeita mundo diferente ou lixo', () => {
    const inv = novoInventario(); adicionar(inv, 'machado_pedra');
    const txt = serializar({ seed: 1, participantes: 4, jogador: { x: 10, y: 20 }, inventario: inv, construcoes: [{ tipo: 'casa', x: 3, y: 4 }] });
    expect(carregar(txt, 1, 4)?.inventario.durabilidade.machado_pedra).toBe(40);
    expect(carregar(txt, 2, 4)).toBeNull();
    expect(carregar('{quebrado', 1, 4)).toBeNull();
    expect(carregar(null, 1, 4)).toBeNull();
  });
});
