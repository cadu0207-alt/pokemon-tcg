import { describe, it, expect } from 'vitest';
import { gerarMundo } from '../src/sim/mundo';
import { nivelIlha, proximoNivel, validarLocal, type Construcao } from '../src/sim/construcao';
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

  it('sobe de nível com as construções exigidas', () => {
    const c: Construcao[] = [];
    expect(nivelIlha(c)).toBe(1);
    c.push({ tipo: 'fogueira', x: 0, y: 0 });
    expect(nivelIlha(c)).toBe(1);
    c.push({ tipo: 'bancada', x: 1, y: 0 });
    expect(nivelIlha(c)).toBe(2);
    expect(proximoNivel(c)?.nivel).toBe(3);
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
