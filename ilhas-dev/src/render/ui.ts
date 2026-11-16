import { ITENS, RECEITAS, type ItemId } from '../sim/itens';
import { criar, podeCriar, qtd, type Inventario } from '../sim/inventario';
import { icone } from './icones';

/** Interface em HTML por cima do canvas: barra de inventário, menu de criação e avisos. */
export class Interface {
  private barra = document.getElementById('barra')!;
  private craft = document.getElementById('craft')!;
  private avisos = document.getElementById('avisos')!;
  aberto = false;

  constructor(private inv: Inventario, private aoMudar: () => void) {
    document.getElementById('btn-craft')!.addEventListener('click', () => this.alternarCraft());
  }

  alternarCraft() {
    this.aberto = !this.aberto;
    this.craft.hidden = !this.aberto;
    this.atualizar();
  }

  aviso(texto: string) {
    const el = document.createElement('div');
    el.className = 'aviso'; el.textContent = texto;
    this.avisos.append(el);
    setTimeout(() => el.remove(), 2600);
  }

  atualizar() {
    const inv = this.inv;
    const ids = Object.keys(inv.itens) as ItemId[];
    this.barra.innerHTML = ids.length
      ? ids.map(id => {
          const f = ITENS[id].ferramenta;
          const dur = f ? `<i style="width:${(100 * (inv.durabilidade[id] ?? 0)) / f.durabilidade}%"></i>` : '';
          return `<div class="slot" title="${ITENS[id].nome}"><img src="${icone(id)}"><b>${qtd(inv, id)}</b>${dur}</div>`;
        }).join('')
      : '<span class="vazio">Mochila vazia: chegue perto de uma árvore e aperte Espaço</span>';

    if (!this.aberto) return;
    this.craft.innerHTML = '<h3>Criar <small>(C)</small></h3>' + RECEITAS.map((r, i) => {
      const ok = podeCriar(inv, r);
      const custo = Object.entries(r.custo).map(([id, n]) => {
        const tem = qtd(inv, id as ItemId) >= (n ?? 0);
        return `<span class="${tem ? '' : 'falta'}"><img src="${icone(id as ItemId)}">${qtd(inv, id as ItemId)}/${n}</span>`;
      }).join('');
      return `<button data-r="${i}" ${ok ? '' : 'disabled'}><img class="grande" src="${icone(r.id)}">
        <div><b>${ITENS[r.id].nome}</b><div class="custo">${custo}</div></div></button>`;
    }).join('');
    this.craft.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const r = RECEITAS[Number(b.dataset.r)];
      if (criar(inv, r)) { this.aviso(`Criou: ${ITENS[r.id].nome}`); this.aoMudar(); }
    }));
  }
}
