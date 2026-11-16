import { ITENS, RECEITAS, type ItemId } from '../sim/itens';
import { cabe, criar, podeCriar, qtd, LIMITE_MOCHILA, type Inventario } from '../sim/inventario';
import type { Construcao } from '../sim/construcao';
import type { Requisitos } from '../sim/expansao';
import { NIVEIS } from '../sim/construcao';
import { icone } from './icones';
import { xpParaProximo, type Status } from '../sim/criaturas';
import { HABILIDADES, MAGIAS, podeAprender, pontosLivres, type Magia, type Ramo } from '../sim/habilidades';

/** Estado dos controles de toque, lido pela cena a cada quadro. */
export const toque = { x: 0, y: 0, acao: false, ativo: false };

const $ = (id: string) => document.getElementById(id)!;

export interface Ganchos {
  nivel: () => number;
  construcoes: () => Construcao[];
  selecionarConstrucao: (id: ItemId | null) => void;
  confirmarConstrucao: () => void;
  zoom: (fator: number) => void;
  comer: (id: ItemId) => void;
  ranking: () => { nome: string; perfil: string; pontos: number }[];
  assistir: (nome: string | null) => void;
  habilidades: () => { status: Status; aprendidas: string[] };
  requisitos: () => Requisitos | null;
  /** há uma construção deste tipo (da sua ilha) perto do jogador? */
  perto: (estacao: ItemId) => boolean;
  armazem: () => Inventario;
  capacidadeArmazem: () => number;
  moverParaBau: (id: ItemId) => void;
  moverParaMochila: (id: ItemId) => void;
  expandir: () => void;
  aprender: (id: string) => void;
  lancar: (m: Magia) => void;
  criou: (id: ItemId) => void;
  alternarSom: () => void;
  alternarMusica: () => void;
  tocar: (e: import('./Som').Efeito) => void;
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
    $('btn-ranking').addEventListener('click', () => this.alternarRanking());
    $('btn-hab').addEventListener('click', () => this.alternarHabilidades());
    $('status').addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cfg]');
      if (!b) return;
      if (b.dataset.cfg === 'som') g.alternarSom(); else g.alternarMusica();
      this.ultimoStatus = '';
    });
    $('habilidades').addEventListener('click', e => {
      const el = e.target as HTMLElement;
      if (el.closest('.fechar')) return this.alternarHabilidades(false);
      const no = el.closest<HTMLElement>('[data-h]');
      if (no) { g.aprender(no.dataset.h!); this.atualizarHabilidades(); }
    });
    $('magias').addEventListener('pointerdown', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
      if (b) { e.preventDefault(); g.lancar(b.dataset.m as Magia); }
    });
    $('btn-voltar').addEventListener('click', () => g.assistir(null));
    $('ranking').addEventListener('click', e => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('[data-nome]');
      if (li && li.dataset.nome !== 'Você') { g.assistir(li.dataset.nome!); this.alternarRanking(false); }
    });
    this.barra.addEventListener('click', e => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!slot) return;
      const id = slot.dataset.id as ItemId;
      if (ITENS[id].construivel) g.selecionarConstrucao(this.construindo === id ? null : id);
      else if (ITENS[id].comida) g.comer(id);
      else this.aviso(ITENS[id].nome);
    });
    this.iniciarToque();
  }

  alternarCraft(forcar?: boolean) {
    this.aberto = forcar ?? !this.aberto;
    this.craft.hidden = !this.aberto;
    this.atualizar();
  }

  /** Painel do Cristal: o que falta e o botão de expandir. */
  abrirCristal() {
    this.alternarCraft(false); this.alternarRanking(false); this.alternarHabilidades(false);
    $('cristal').hidden = false;
    this.desenharCristal();
  }

  private desenharCristal() {
    const req = this.g.requisitos();
    const nivel = this.g.nivel();
    const linha = ([id, t, p]: [ItemId, number, number]) =>
      `<li class="${t >= p ? 'ok' : 'falta'}"><img src="${icone(id)}">${ITENS[id].nome}<b>${Math.min(t, p)}/${p}</b></li>`;
    const libera = req ? NIVEIS.find(n => n.nivel === req.nivel)?.recompensa ?? '' : '';
    $('cristal').innerHTML = `<h3>Cristal da ilha <button class="fechar">✕</button></h3>` + (req
      ? `<p>Nível <b>${nivel}</b> → <b>${req.nivel}</b>: a ilha cresce${libera ? ` e ${libera}` : ''}.</p>
         ${req.construcoes.length ? `<h4>Construções na ilha</h4><ul>${req.construcoes.map(linha).join('')}</ul>` : ''}
         <h4>Alimentar o Cristal com</h4><ul>${req.itens.map(linha).join('')}</ul>
         <p class="dica">Cristais só existem fora da sua ilha — pegue a jangada.</p>
         <button class="expandir" ${req.pronto ? '' : 'disabled'}>Expandir a ilha</button>`
      : '<p>Sua ilha chegou ao tamanho máximo. Lendária!</p>');
    $('cristal').querySelector('.fechar')!.addEventListener('click', () => ($('cristal').hidden = true));
    $('cristal').querySelector('.expandir')?.addEventListener('click', () => { this.g.expandir(); this.desenharCristal(); });
  }

  /** Painel do baú: mochila de um lado, armazém da ilha do outro; toque num item para mover a pilha. */
  abrirBau() {
    this.alternarCraft(false); this.alternarRanking(false); this.alternarHabilidades(false);
    $('bau').hidden = false;
    this.desenharBau();
  }

  desenharBau() {
    if ($('bau').hidden) return;
    const arm = this.g.armazem();
    const lista = (inv: Inventario, lado: 'mochila' | 'bau') => {
      const ids = Object.keys(inv.itens) as ItemId[];
      return ids.length ? ids.map(id => `<button class="slot" data-lado="${lado}" data-id="${id}" title="${ITENS[id].nome}"><img src="${icone(id)}"><b>${qtd(inv, id)}</b></button>`).join('')
        : '<span class="vazio">vazio</span>';
    };
    $('bau').innerHTML = `<h3>Baú da ilha <button class="fechar">✕</button></h3>
      <p class="dica">Toque num item para mover a pilha. O que fica no baú está seguro na ilha (mas pode ser saqueado se você sair).</p>
      <h4>Mochila <small>${Object.keys(this.inv.itens).length}/${LIMITE_MOCHILA} tipos</small></h4><div class="grade">${lista(this.inv, 'mochila')}</div>
      <h4>Baú <small>${Object.keys(arm.itens).length}/${this.g.capacidadeArmazem()} tipos</small></h4><div class="grade">${lista(arm, 'bau')}</div>`;
    $('bau').querySelector('.fechar')!.addEventListener('click', () => ($('bau').hidden = true));
    $('bau').querySelectorAll<HTMLElement>('[data-lado]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id as ItemId;
      if (b.dataset.lado === 'mochila') this.g.moverParaBau(id); else this.g.moverParaMochila(id);
      this.desenharBau();
    }));
  }

  habAberto = false;
  alternarHabilidades(forcar?: boolean) {
    this.habAberto = forcar ?? !this.habAberto;
    $('habilidades').hidden = !this.habAberto;
    if (this.habAberto) { this.alternarCraft(false); this.alternarRanking(false); this.atualizarHabilidades(); }
  }

  private static RAMOS: [Ramo, string][] = [['sobrevivencia', 'Sobrevivência'], ['combate', 'Combate'], ['arcano', 'Arcano'], ['engenharia', 'Engenharia']];
  atualizarHabilidades() {
    const { status, aprendidas } = this.g.habilidades();
    const livres = pontosLivres(status, aprendidas);
    $('btn-hab').innerHTML = `✦ Habilidades${livres > 0 ? ` <span class="badge">${livres}</span>` : ''}`;
    if (!this.habAberto) return;
    $('habilidades').innerHTML = `<h3>Habilidades <small>(K) · ${livres} ponto${livres === 1 ? '' : 's'}</small><button class="fechar">✕</button></h3>
      <div class="ramos">${Interface.RAMOS.map(([ramo, nome]) => `<div class="ramo ${ramo}"><h4>${nome}</h4>${
        HABILIDADES.filter(h => h.ramo === ramo).map(h => {
          const motivo = podeAprender(status, aprendidas, h.id);
          const cls = motivo === 'aprendida' ? 'ok' : motivo === null ? 'pode' : 'bloq';
          const dica = motivo === 'nivel' ? `Nível ${h.nivelMin}` : motivo === 'requer_anterior' ? 'Aprenda o anterior' : motivo === 'sem_pontos' ? 'Sem pontos' : '';
          return `<button class="no ${cls}" data-h="${h.id}" ${cls === 'pode' ? '' : 'tabindex="-1"'}><b>${h.nome}</b><small>${h.descricao}</small>${dica ? `<em>${dica}</em>` : ''}</button>`;
        }).join('')}</div>`).join('')}</div>`;
  }

  /** Botões das magias aprendidas, com mana e recarga. */
  atualizarMagias(magias: Magia[], mana: number, pronta: (m: Magia) => number) {
    const el = $('magias');
    if (el.childElementCount !== magias.length) {
      el.innerHTML = magias.map((m, i) => `<button data-m="${m}" class="magia ${m}"><span>${i + 1}</span>${MAGIAS[m].nome}<i></i></button>`).join('');
    }
    el.querySelectorAll<HTMLElement>('[data-m]').forEach(b => {
      const m = b.dataset.m as Magia, p = pronta(m);
      b.classList.toggle('sem-mana', mana < MAGIAS[m].custo);
      (b.querySelector('i') as HTMLElement).style.width = `${(1 - p) * 100}%`;
    });
  }

  rankingAberto = false;
  alternarRanking(forcar?: boolean) {
    this.rankingAberto = forcar ?? !this.rankingAberto;
    $('ranking').hidden = !this.rankingAberto;
    if (this.rankingAberto) { this.alternarCraft(false); this.atualizarRanking(); }
  }

  private static ROTULO: Record<string, string> = { coletor: 'coletor', construtor: 'construtor', cacador: 'caçador', explorador: 'explorador', jogador: 'você' };
  atualizarRanking() {
    if (!this.rankingAberto) return;
    const r = this.g.ranking();
    const minha = r.findIndex(l => l.perfil === 'jogador');
    const mostrar = r.slice(0, 8);
    const linha = (l: (typeof r)[number], i: number) =>
      `<li data-nome="${l.nome}" class="${l.perfil === 'jogador' ? 'eu' : ''}"><span>${i + 1}º</span><b>${l.nome}</b><small>${Interface.ROTULO[l.perfil]}</small><em>${l.pontos}</em></li>`;
    $('ranking').innerHTML = `<h3>Ranking <button class="fechar">✕</button></h3>
      <p class="sua">Sua posição: <b>${minha + 1}º de ${r.length}</b><small>Toque num nome para assistir</small></p><ol>${
      mostrar.map(linha).join('')}${minha >= 8 ? linha(r[minha], minha) : ''}</ol>`;
    $('ranking').querySelector('.fechar')!.addEventListener('click', () => this.alternarRanking(false));
  }

  assistindo(nome: string | null, perfil = '') {
    document.body.classList.toggle('espectador', !!nome);
    $('espectador-nome').textContent = nome ? `Assistindo ${nome} (${Interface.ROTULO[perfil] ?? perfil})` : '';
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
      ? `${ITENS[id].nome}: ${toque.ativo ? 'toque no mapa e depois em Construir' : 'clique no mapa ou Espaço · Esc cancela'}`
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
          const cls = ['slot', def.construivel ? 'construivel' : '', def.comida ? 'comida' : '', this.construindo === id ? 'sel' : ''].join(' ');
          return `<button class="${cls}" data-id="${id}" title="${def.nome}"><img src="${icone(id)}"><b>${qtd(inv, id)}</b>${dur}</button>`;
        }).join('')
      : '<span class="vazio">Mochila vazia: chegue perto de uma árvore e colete</span>';
    $('barra').dataset.cheia = String(ids.length >= LIMITE_MOCHILA);
    this.desenharBau();

    // Painel do nível da ilha: o que falta para alimentar o Cristal.
    const req = this.g.requisitos();
    const item = ([id, t, p]: [ItemId, number, number]) =>
      `<span class="${t >= p ? 'ok' : ''}"><img src="${icone(id)}">${Math.min(t, p)}/${p}</span>`;
    $('nivel').innerHTML = `<b>Ilha nível ${nivel}</b>` + (req
      ? `<div class="req">${[...req.construcoes, ...req.itens].map(item).join('')}</div><small>${req.pronto ? 'Pronto! Vá até o Cristal' : `para o nível ${req.nivel}`}</small>`
      : '<small>nível máximo</small>');
    if (!$('cristal').hidden) this.desenharCristal();

    if (!this.aberto) return;
    this.craft.innerHTML = '<h3>Criar <small>(C)</small><button class="fechar" aria-label="Fechar">✕</button></h3>' + RECEITAS.map((r, i) => {
      const travada = nivel < (r.nivel ?? 1);
      const semEstacao = !!r.estacao && !this.g.perto(r.estacao);
      const ok = podeCriar(inv, r, nivel) && !semEstacao;
      const custo = travada ? `<span class="falta">Requer ilha nível ${r.nivel}</span>` : (semEstacao ? `<span class="falta">Perto de: ${ITENS[r.estacao!].nome}</span>` : '') + Object.entries(r.custo).map(([id, n]) => {
        const tem = qtd(inv, id as ItemId) >= (n ?? 0);
        return `<span class="${tem ? '' : 'falta'}"><img src="${icone(id as ItemId)}">${qtd(inv, id as ItemId)}/${n}</span>`;
      }).join('');
      return `<button data-r="${i}" ${ok ? '' : 'disabled'}><img class="grande" src="${icone(r.id)}">
        <div><b>${ITENS[r.id].nome}${r.qtd > 1 ? ` ×${r.qtd}` : ''}</b><div class="custo">${custo}</div></div></button>`;
    }).join('');
    this.craft.querySelector('.fechar')!.addEventListener('click', () => this.alternarCraft(false));
    this.craft.querySelectorAll<HTMLButtonElement>('button[data-r]').forEach(b => b.addEventListener('click', () => {
      const r = RECEITAS[Number(b.dataset.r)];
      if (r.estacao && !this.g.perto(r.estacao)) { this.aviso(`Precisa estar perto de: ${ITENS[r.estacao].nome}`); return; }
      if (!cabe(inv, [r.id])) { this.aviso('Mochila cheia! Guarde coisas no baú'); return; }
      if (criar(inv, r, this.g.nivel())) {
        this.g.criou(r.id);
        this.aviso(`Criou: ${ITENS[r.id].nome}${ITENS[r.id].construivel ? ' — toque nele na mochila para construir' : ''}`);
        this.g.mudou();
      }
    }));
  }

  private ultimoStatus = '';
  somLigado = () => true;
  musicaLigada = () => true;
  /** Vida, experiência, nível do personagem e relógio do dia. */
  atualizarStatus(s: Status, noite: boolean, fracDia: number, mana = 0, manaMax = 0) {
    const chave = `${Math.ceil(s.vida)}|${s.vidaMax}|${s.xp}|${s.nivel}|${noite}|${Math.floor(fracDia * 24)}|${Math.floor(mana)}|${manaMax}`;
    if (chave === this.ultimoStatus) return;
    this.ultimoStatus = chave;
    const hora = Math.floor((fracDia * 24 + 6) % 24);
    $('status').innerHTML = `
      <div class="linha"><b>Nv ${s.nivel}</b><span class="icones"><button data-cfg="som" title="Som">${this.somLigado() ? '🔊' : '🔇'}</button><button data-cfg="musica" title="Música">${this.musicaLigada() ? '♫' : '♪̸'}</button></span><span class="relogio">${noite ? '☾' : '☀'} ${String(hora).padStart(2, '0')}h</span></div>
      <div class="bar vida"><i style="width:${(100 * Math.max(0, s.vida)) / s.vidaMax}%"></i><span>${Math.max(0, Math.ceil(s.vida))}/${s.vidaMax}</span></div>
      ${manaMax ? `<div class="bar mana"><i style="width:${(100 * mana) / manaMax}%"></i><span>${Math.floor(mana)}/${manaMax}</span></div>` : ''}
      <div class="bar xp"><i style="width:${(100 * s.xp) / xpParaProximo(s.nivel)}%"></i><span>XP ${s.xp}/${xpParaProximo(s.nivel)}</span></div>`;
    this.atualizarHabilidades();
  }

  private rotuloAtual = '';
  /** Texto do botão de ação conforme o alvo (Cortar, Minerar, Atacar…). */
  rotuloAcao(texto: string) {
    if (texto === this.rotuloAtual) return;
    this.rotuloAtual = texto;
    $('btn-acao').textContent = texto;
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

    // Joystick flutuante: nasce onde o polegar tocar na metade esquerda da tela.
    const base = $('joy'), pino = $('joy-pino');
    let id: number | null = null, cx = 0, cy = 0;
    const R = 44;
    const mover = (e: PointerEvent) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      pino.style.transform = `translate(${dx}px, ${dy}px)`;
      // zona morta pequena e resposta analógica (empurrar pouco = andar devagar)
      const m = Math.hypot(dx, dy) / R;
      const f = m < 0.18 ? 0 : (m - 0.18) / 0.82 / (m || 1);
      toque.x = (dx / R) * f; toque.y = (dy / R) * f;
    };
    const comecar = (e: PointerEvent, flutuante: boolean) => {
      id = e.pointerId;
      if (flutuante) {
        base.style.left = `${e.clientX - 60}px`; base.style.top = `${e.clientY - 60}px`; base.style.bottom = 'auto';
        base.classList.add('ativo');
      }
      const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      mover(e);
    };
    base.addEventListener('pointerdown', e => { e.preventDefault(); comecar(e, false); });
    const jogo = $('jogo');
    // Pinça para zoom: dois dedos no mapa (fora do joystick).
    const dedos = new Map<number, { x: number; y: number }>();
    let distAnt = 0;
    jogo.addEventListener('pointerdown', e => {
      if (!toque.ativo || e.pointerType !== 'touch') return;
      if (id === null && !this.construindo && e.clientX < window.innerWidth * 0.5 && dedos.size === 0) { comecar(e, true); return; }
      dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dedos.size === 2) { const [a, b] = [...dedos.values()]; distAnt = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    window.addEventListener('pointermove', e => {
      if (e.pointerId === id) { mover(e); return; }
      if (!dedos.has(e.pointerId)) return;
      dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dedos.size === 2) {
        const [a, b] = [...dedos.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (distAnt > 0 && Math.abs(dist / distAnt - 1) > 0.02) { this.g.zoom(dist / distAnt); distAnt = dist; }
      }
    });
    const soltar = (e: PointerEvent) => {
      dedos.delete(e.pointerId);
      if (e.pointerId !== id) return;
      id = null; toque.x = toque.y = 0; pino.style.transform = '';
      base.classList.remove('ativo'); base.style.left = ''; base.style.top = ''; base.style.bottom = '';
    };
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    window.addEventListener('contextmenu', e => e.preventDefault());

    const acao = $('btn-acao');
    acao.addEventListener('pointerdown', e => {
      e.preventDefault(); toque.acao = true;
      if (this.construindo) this.g.confirmarConstrucao();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) acao.addEventListener(ev, () => (toque.acao = false));
  }
}
