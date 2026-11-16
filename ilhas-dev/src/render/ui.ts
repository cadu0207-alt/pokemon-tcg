import { ITENS, RECEITAS, type ItemId } from '../sim/itens';
import { criar, podeCriar, qtd, type Inventario } from '../sim/inventario';
import { contar, proximoNivel, type Construcao } from '../sim/construcao';
import { icone } from './icones';

/** Estado dos controles de toque, lido pela cena a cada quadro. */
export const toque = { x: 0, y: 0, acao: false, ativo: false };

const $ = (id: string) => document.getElementById(id)!;

export interface Ganchos {
  nivel: () => number;
  construcoes: () => Construcao[];
  selecionarConstrucao: (id: ItemId | null) => void;
  confirmarConstrucao: () => void;
  zoom: (fator: number) => void;
  mudou: () => void;
}

/** Interface em HTML por cima do canvas. */
export class Interface {
  private barra = $('barra');
  private craft = $('craft');
  private avisos = $('avisos');
  aberto = false;
  construindo: ItemId | null = null;

  constructor(private inv: Inventario, private g: Ganchos) {
    $('btn-craft').addEventListener('click', () => this.alternarCraft());
    $('btn-ok').addEventListener('click', () => g.confirmarConstrucao());
    $('btn-cancelar').addEventListener('click', () => g.selecionarConstrucao(null));
    $('zoom-mais').addEventListener('click', () => g.zoom(1.25));
    $('zoom-menos').addEventListener('click', () => g.zoom(0.8));
    this.barra.addEventListener('click', e => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!slot) return;
      const id = slot.dataset.id as ItemId;
      if (ITENS[id].construivel) g.selecionarConstrucao(this.construindo === id ? null : id);
      else this.aviso(ITENS[id].nome);
    });
    this.iniciarToque();
  }

  alternarCraft(forcar?: boolean) {
    this.aberto = forcar ?? !this.aberto;
    this.craft.hidden = !this.aberto;
    this.atualizar();
  }

  aviso(texto: string) {
    const el = document.createElement('div');
    el.className = 'aviso'; el.textContent = texto;
    this.avisos.append(el);
    while (this.avisos.children.length > 3) this.avisos.firstElementChild!.remove();
    setTimeout(() => el.remove(), 2600);
  }

  modoConstrucao(id: ItemId | null) {
    this.construindo = id;
    document.body.classList.toggle('construindo', !!id);
    $('dica-construcao').textContent = id
      ? `Construindo: ${ITENS[id].nome} — ${toque.ativo ? 'toque no mapa e depois em ✔' : 'clique no mapa ou Espaço · Esc cancela'}`
      : '';
    this.atualizar();
  }

  atualizar() {
    const inv = this.inv;
    const nivel = this.g.nivel();
    const ids = Object.keys(inv.itens) as ItemId[];
    this.barra.innerHTML = ids.length
      ? ids.map(id => {
          const def = ITENS[id], f = def.ferramenta;
          const dur = f ? `<i style="width:${(100 * (inv.durabilidade[id] ?? 0)) / f.durabilidade}%"></i>` : '';
          const cls = ['slot', def.construivel ? 'construivel' : '', this.construindo === id ? 'sel' : ''].join(' ');
          return `<button class="${cls}" data-id="${id}" title="${def.nome}"><img src="${icone(id)}"><b>${qtd(inv, id)}</b>${dur}</button>`;
        }).join('')
      : '<span class="vazio">Mochila vazia: chegue perto de uma árvore e colete</span>';

    // Painel do nível da ilha.
    const prox = proximoNivel(this.g.construcoes());
    const tem = contar(this.g.construcoes());
    $('nivel').innerHTML = `<b>Ilha nível ${nivel}</b>` + (prox
      ? `<div class="req">Nível ${prox.nivel}: ${Object.entries(prox.requer).map(([id, n]) =>
          `<span class="${(tem[id as ItemId] ?? 0) >= (n ?? 0) ? 'ok' : ''}"><img src="${icone(id as ItemId)}">${tem[id as ItemId] ?? 0}/${n}</span>`).join('')}</div>
         <small>${prox.recompensa}</small>`
      : '<small>nível máximo por enquanto</small>');

    if (!this.aberto) return;
    this.craft.innerHTML = '<h3>Criar <small>(C)</small><button class="fechar" aria-label="Fechar">✕</button></h3>' + RECEITAS.map((r, i) => {
      const travada = nivel < (r.nivel ?? 1);
      const ok = podeCriar(inv, r, nivel);
      const custo = travada ? `<span class="falta">Requer ilha nível ${r.nivel}</span>` : Object.entries(r.custo).map(([id, n]) => {
        const tem = qtd(inv, id as ItemId) >= (n ?? 0);
        return `<span class="${tem ? '' : 'falta'}"><img src="${icone(id as ItemId)}">${qtd(inv, id as ItemId)}/${n}</span>`;
      }).join('');
      return `<button data-r="${i}" ${ok ? '' : 'disabled'}><img class="grande" src="${icone(r.id)}">
        <div><b>${ITENS[r.id].nome}${r.qtd > 1 ? ` ×${r.qtd}` : ''}</b><div class="custo">${custo}</div></div></button>`;
    }).join('');
    this.craft.querySelector('.fechar')!.addEventListener('click', () => this.alternarCraft(false));
    this.craft.querySelectorAll<HTMLButtonElement>('button[data-r]').forEach(b => b.addEventListener('click', () => {
      const r = RECEITAS[Number(b.dataset.r)];
      if (criar(inv, r, this.g.nivel())) {
        this.aviso(`Criou: ${ITENS[r.id].nome}${ITENS[r.id].construivel ? ' — toque nele na mochila para construir' : ''}`);
        this.g.mudou();
      }
    }));
  }

  /** Joystick virtual (lado esquerdo) e botão de ação. Aparecem no primeiro toque. */
  private iniciarToque() {
    const ativar = () => {
      if (toque.ativo) return;
      toque.ativo = true;
      document.body.classList.add('toque');
      if (this.construindo) this.modoConstrucao(this.construindo);
    };
    window.addEventListener('touchstart', ativar, { passive: true });
    if (matchMedia('(pointer: coarse)').matches) ativar();

    const base = $('joy'), pino = $('joy-pino');
    let id: number | null = null, cx = 0, cy = 0;
    const R = 44;
    const mover = (e: PointerEvent) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      pino.style.transform = `translate(${dx}px, ${dy}px)`;
      const zona = 0.25;
      toque.x = Math.abs(dx / R) > zona ? dx / R : 0;
      toque.y = Math.abs(dy / R) > zona ? dy / R : 0;
    };
    base.addEventListener('pointerdown', e => {
      id = e.pointerId;
      const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      try { base.setPointerCapture(id); } catch { /* alguns navegadores recusam; o joystick funciona sem */ }
      mover(e);
    });
    base.addEventListener('pointermove', e => { if (e.pointerId === id) mover(e); });
    const soltar = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null; toque.x = toque.y = 0; pino.style.transform = '';
    };
    base.addEventListener('pointerup', soltar);
    base.addEventListener('pointercancel', soltar);

    const acao = $('btn-acao');
    acao.addEventListener('pointerdown', e => {
      e.preventDefault(); toque.acao = true;
      if (this.construindo) this.g.confirmarConstrucao();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) acao.addEventListener(ev, () => (toque.acao = false));
  }
}
