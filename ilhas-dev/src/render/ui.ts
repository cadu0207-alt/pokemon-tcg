import { GRUPOS, ITENS, RECEITAS, grupoDe, nivelJogadorDe, type Grupo, type ItemId } from '../sim/itens';
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
  ranking: () => { nome: string; perfil: string; pontos: number; tag?: string }[];
  /** situação no jogo de reinos */
  reino: () => InfoReino;
  rebelar: () => void;
  /** anda até um tile (toque no mapa-múndi) */
  viajar: (x: number, y: number) => boolean;
  /** cartão compartilhável da sua ilha */
  cartao: () => Promise<{ blob: Blob; texto: string; url: string }>;
  irVingar: () => void;
  pedirAjuda: () => void;
  libertar: (id: number) => void;
  assistir: (nome: string | null) => void;
  habilidades: () => { status: Status; aprendidas: string[] };
  requisitos: () => Requisitos | null;
  /** há uma construção deste tipo (da sua ilha) perto do jogador? */
  perto: (estacao: ItemId) => boolean;
  /** nível do personagem (libera receitas aos poucos) */
  nivelJogador: () => number;
  /** larga no chão `n` unidades (Infinity = a pilha toda) */
  largar: (id: ItemId, n: number) => void;
  /** desenha o mapa-múndi no canvas; devolve fração explorada e posição relativa do jogador */
  mapaMundi: (cv: HTMLCanvasElement) => { explorado: number; jx: number; jy: number };
  armazem: () => Inventario;
  capacidadeArmazem: () => number;
  moverParaBau: (id: ItemId) => void;
  moverParaMochila: (id: ItemId) => void;
  expandir: () => void;
  energia: () => number;
  recarregar: (id: ItemId) => void;
  diario: () => string[];
  aprender: (id: string) => void;
  lancar: (m: Magia) => void;
  criou: (id: ItemId) => void;
  alternarSom: () => void;
  alternarMusica: () => void;
  tocar: (e: import('./Som').Efeito) => void;
  mudou: () => void;
}

/** Interface em HTML por cima do canvas. */
export interface InfoReino {
  situacao: 'livre' | 'rei' | 'vassalo';
  rei?: string; forcaRei?: number; minhaForca: number; raio: number;
  vassalos: { id: number; nome: string; forca: number }[];
  proximoTributoMin?: number; esperaRebeliaoMin?: number; resistindoMin?: number;
}

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
    $('btn-mapa').addEventListener('click', () => this.alternarMapa());
    window.addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M') && !(e.target instanceof HTMLInputElement)) this.alternarMapa(); });
    $('btn-hab').addEventListener('click', () => this.alternarHabilidades());
    $('status').addEventListener('click', e => {
      const rv = (e.target as HTMLElement).closest<HTMLElement>('[data-rival]');
      if (rv) { g.assistir(rv.dataset.rival!); return; }
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
      if (li && li.dataset.nome && li.dataset.nome !== 'Você' && !li.classList.contains('eu') && !li.classList.contains('sep')) { g.assistir(li.classList.contains('pessoa') ? `pessoa:${li.dataset.nome}` : li.dataset.nome); this.alternarRanking(false); }
    });
    this.barra.addEventListener('click', e => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!slot) return;
      const id = slot.dataset.id as ItemId;
      // com uma construção selecionada, tocar nela de novo cancela (atalho de sempre)
      if (this.construindo === id) { g.selecionarConstrucao(null); return; }
      this.abrirMenuItem(id, slot);
    });
    $('item-menu').addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-acao]');
      const id = $('item-menu').dataset.id as ItemId;
      $('item-menu').hidden = true;
      if (!b || !id) return;
      const acao = b.dataset.acao;
      if (acao === 'construir') g.selecionarConstrucao(id);
      else if (acao === 'comer') g.comer(id);
      else if (acao === 'largar1') g.largar(id, 1);
      else if (acao === 'largar') g.largar(id, Infinity);
    });
    this.iniciarToque();
    // tocar fora de um painel (no fundo escurecido) ou apertar Esc fecha tudo
    $('fundo').addEventListener('click', () => this.fecharPaineis());
    window.addEventListener('keydown', e => { if (e.key === 'Escape') this.fecharPaineis(); });
    // marca no <body> quando algum painel está aberto (mostra o fundo)
    const observar = () => document.body.classList.toggle('painel-aberto', ['craft', 'habilidades', 'cristal', 'bau', 'ranking', 'mapa'].some(id => !$(id).hidden));
    new MutationObserver(observar).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }

  fecharPaineis() {
    this.alternarCraft(false); this.alternarHabilidades(false); this.alternarRanking(false); this.alternarMapa(false);
    $('cristal').hidden = true; $('bau').hidden = true;
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
    const en = Math.round(this.g.energia());
    const energia = `<div class="bar energia"><i style="width:${en}%"></i><span>Energia ${en}%</span></div>
      <p class="dica">Saques drenam a energia. Se zerar, a ilha perde um nível.</p>
      <div class="recarga"><button data-rec="cristal" ${qtd(this.inv, 'cristal') ? '' : 'disabled'}><img src="${icone('cristal')}">+50%</button>
      <button data-rec="gosma" ${qtd(this.inv, 'gosma') ? '' : 'disabled'}><img src="${icone('gosma')}">+10%</button></div>`;
    const diario = this.g.diario();
    const compartilhar = '<button class="compartilhar">📸 Compartilhar minha ilha</button>';
    const diarioHtml = diario.length ? `<h4>Diário da ilha</h4><ul class="diario">${diario.map(l => `<li>${l}</li>`).join('')}</ul>` : '';
    $('cristal').innerHTML = `<h3>Cristal da ilha <button class="fechar">✕</button></h3>` + energia + this.htmlReino() + compartilhar + (req
      ? `<p>Nível <b>${nivel}</b> → <b>${req.nivel}</b>: a ilha cresce${libera ? ` e ${libera}` : ''}.</p>
         ${req.construcoes.length ? `<h4>Construções na ilha</h4><ul>${req.construcoes.map(linha).join('')}</ul>` : ''}
         <h4>Alimentar o Cristal com</h4><ul>${req.itens.map(linha).join('')}</ul>
         <p class="dica">Cristais só existem fora da sua ilha — pegue a jangada.</p>
         <button class="expandir" ${req.pronto ? '' : 'disabled'}>Expandir a ilha</button>`
      : '<p>Sua ilha chegou ao tamanho máximo. Lendária!</p>') + diarioHtml;
    $('cristal').querySelector('.fechar')!.addEventListener('click', () => ($('cristal').hidden = true));
    $('cristal').querySelector('.expandir')?.addEventListener('click', () => { this.g.expandir(); this.desenharCristal(); });
    $('cristal').querySelector('.compartilhar')?.addEventListener('click', () => { $('cristal').hidden = true; void this.abrirCartao(); });
    $('cristal').querySelector('.rebelar')?.addEventListener('click', () => { this.g.rebelar(); this.desenharCristal(); });
    $('cristal').querySelectorAll<HTMLElement>('[data-libertar]').forEach(b => b.addEventListener('click', () => {
      if (confirm('Libertar este vassalo? Ele deixa de pagar tributo.')) { this.g.libertar(Number(b.dataset.libertar)); this.desenharCristal(); }
    }));
    $('cristal').querySelectorAll<HTMLElement>('[data-rec]').forEach(b => b.addEventListener('click', () => { this.g.recarregar(b.dataset.rec as ItemId); this.desenharCristal(); }));
  }

  private htmlReino() {
    const r = this.g.reino();
    const forca = `<small>Sua força: <b>${Math.round(r.minhaForca)}</b> · influência: ${Math.round(r.raio)} tiles</small>`;
    let corpo = '';
    if (r.situacao === 'vassalo') {
      corpo = `<p>Você é <b>vassalo de ${r.rei}</b> (força ${Math.round(r.forcaRei ?? 0)}). Paga 15% dos materiais a cada hora de jogo${
        r.proximoTributoMin !== undefined ? ` (próximo em ${r.proximoTributoMin} min)` : ''}; em troca, o reino protege sua ilha (metade dos saques).</p>
        <button class="rebelar" ${r.esperaRebeliaoMin ? 'disabled' : ''}>${r.esperaRebeliaoMin ? `Rebelião possível em ${r.esperaRebeliaoMin} min` : '⚔ Rebelar-se'}</button>
        <p class="dica">A rebelião vence se a sua força (mais metade da força dos vassalos fortes do mesmo rei) passar a do rei. Se falhar, o Cristal perde 30% de energia.</p>`;
    } else if (r.situacao === 'rei') {
      corpo = `<p>👑 Você é <b>rei</b> de ${r.vassalos.length} ${r.vassalos.length === 1 ? 'ilha' : 'ilhas'}. Os vassalos pagam 15% dos materiais por hora, direto no seu baú.</p>
        <ul class="vassalos">${r.vassalos.map(v => `<li>${v.nome} <small>força ${Math.round(v.forca)}</small><button data-libertar="${v.id}">Libertar</button></li>`).join('')}</ul>
        <p class="dica">Vassalos que ficarem mais fortes que você se rebelam.</p>`;
    } else {
      corpo = `<p>Sua ilha é <b>livre</b>. Quando seu círculo de influência tocar o de um vizinho bem mais fraco (25% a menos), ele vira seu vassalo — e o contrário também vale.</p>${
        r.resistindoMin ? `<p class="dica">⚔ Você recusou a vassalagem: o rei vai pressionar com saques por mais ${r.resistindoMin} min.</p>` : ''}`;
    }
    return `<h4>Reino</h4><div class="reino">${corpo}${forca}</div>`;
  }

  /** Um rei mais forte chegou à sua fronteira: aceitar a vassalagem ou resistir. */
  proposta(rei: string, forcaRei: number, minhaForca: number, aceitar: () => void, resistir: () => void) {
    document.getElementById('proposta')?.remove();
    const el = document.createElement('div');
    el.id = 'proposta'; el.className = 'painel';
    el.innerHTML = `<h3>👑 ${rei} chegou à sua fronteira</h3>
      <p>O reino de <b>${rei}</b> tem força <b>${Math.round(forcaRei)}</b>; a sua é <b>${Math.round(minhaForca)}</b>.</p>
      <p><b>Aceitar:</b> vira vassalo — paga 15% dos materiais por hora e ganha proteção contra saques. Pode se rebelar quando ficar forte.</p>
      <p><b>Resistir:</b> continua livre, mas ${rei} saqueia sua ilha com mais frequência por 15 min.</p>
      <div class="botoes"><button class="aceitar">Aceitar vassalagem</button><button class="resistir">⚔ Resistir</button></div>`;
    el.querySelector('.aceitar')!.addEventListener('click', () => { el.remove(); aceitar(); });
    el.querySelector('.resistir')!.addEventListener('click', () => { el.remove(); resistir(); });
    document.body.appendChild(el);
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

  /** Aba aberta no menu de criação (lembrada entre sessões). */
  private grupo: Grupo | null = (() => { try { return localStorage.getItem('ilhas-grupo') as Grupo | null; } catch { return null; } })();

  /** Menu do item da mochila: construir/comer, largar 1, largar tudo. */
  private abrirMenuItem(id: ItemId, slot: HTMLElement) {
    const def = ITENS[id], n = qtd(this.inv, id);
    const menu = $('item-menu');
    menu.dataset.id = id;
    menu.innerHTML = `<b><img src="${icone(id)}">${def.nome} <small>×${n}</small></b>
      ${def.construivel ? '<button data-acao="construir">🔨 Construir</button>' : ''}
      ${def.comida || def.mana ? `<button data-acao="comer">${def.mana ? '✨ Usar' : '🍖 Comer'}</button>` : ''}
      <button data-acao="largar1">⬇ Largar 1</button>
      ${n > 1 ? `<button data-acao="largar">⬇ Largar tudo (${n})</button>` : ''}
      <button data-acao="fechar" class="fechar-menu">✕</button>`;
    menu.hidden = false;
    const r = slot.getBoundingClientRect();
    const larg = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - larg - 8, r.left + r.width / 2 - larg / 2))}px`;
    menu.style.bottom = `${window.innerHeight - r.top + 8}px`;
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

  /** Conquista: oferece um botão de compartilhar por alguns segundos. */
  /** Fui saqueado: ir se vingar (rota automática) ou pedir ajuda (cartão com link). */
  vinganca(nome: string, levou: string) {
    document.getElementById('vinganca')?.remove();
    const el = document.createElement('div');
    el.id = 'vinganca'; el.className = 'painel';
    el.innerHTML = `<b>⚔ ${nome} saqueou sua ilha!</b><small>Levou ${levou}. Vá até o Cristal de ${nome} em 15 min e recupere tudo com 50% a mais.</small>
      <div class="botoes"><button class="ir">📍 Ir até lá</button><button class="ajuda">📸 Pedir ajuda</button><button class="fechar">✕</button></div>`;
    el.querySelector('.ir')!.addEventListener('click', () => { el.remove(); this.g.irVingar(); });
    el.querySelector('.ajuda')!.addEventListener('click', () => { el.remove(); this.g.pedirAjuda(); void this.abrirCartao(); });
    el.querySelector('.fechar')!.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 20_000);
  }

  conquista(texto: string) {
    document.getElementById('conquista')?.remove();
    const el = document.createElement('button');
    el.id = 'conquista'; el.innerHTML = `🏆 ${texto}<small>📸 Toque para compartilhar</small>`;
    el.addEventListener('click', () => { el.remove(); void this.abrirCartao(); });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 12_000);
  }

  /** Mostra o cartão pronto com Compartilhar / Baixar / Copiar link. */
  async abrirCartao() {
    document.getElementById('cartao')?.remove();
    const el = document.createElement('div');
    el.id = 'cartao'; el.className = 'painel';
    el.innerHTML = '<p>Preparando o cartão…</p>';
    document.body.appendChild(el);
    const { blob, texto, url } = await this.g.cartao();
    const src = URL.createObjectURL(blob);
    const arquivo = new File([blob], 'minha-ilha.png', { type: 'image/png' });
    const podeArquivo = !!navigator.canShare?.({ files: [arquivo] });
    el.innerHTML = `<h3>Compartilhe sua ilha <button class="fechar">✕</button></h3><img src="${src}" alt="Cartão da sua ilha">
      <div class="botoes">${'share' in navigator ? '<button class="share">📤 Compartilhar</button>' : ''}
      <a class="baixar" href="${src}" download="minha-ilha.png">⬇ Baixar imagem</a><button class="copiar">🔗 Copiar link</button></div>
      <p class="dica">Quem entrar pelo seu link começa com 1 cristal de presente. Jogando online, você também ganha: 1 cristal, 10 madeira e 5 pedra por amigo que entrar na temporada.</p>`;
    const fechar = () => { el.remove(); URL.revokeObjectURL(src); };
    el.querySelector('.fechar')!.addEventListener('click', fechar);
    el.querySelector('.share')?.addEventListener('click', async () => {
      try { await navigator.share(podeArquivo ? { files: [arquivo], text: `${texto} ${url}` } : { text: texto, url }); } catch { /* cancelou */ }
    });
    el.querySelector('.copiar')!.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(`${texto} ${url}`); this.aviso('Link copiado!'); } catch { prompt('Copie o link:', url); }
    });
  }

  /** Resumo ao voltar ao jogo depois de um tempo fora. */
  boasVindas(tempo: string, plantacoes: number, eventos: string[]) {
    const el = document.createElement('div');
    el.id = 'boas-vindas'; el.className = 'painel';
    el.innerHTML = `<h3>Bem-vindo de volta!</h3><p>Você ficou fora <b>${tempo}</b>.</p>
      ${plantacoes ? `<p>🌾 ${plantacoes} plantaç${plantacoes > 1 ? 'ões estão prontas' : 'ão está pronta'} para colher.</p>` : ''}
      ${eventos.length ? `<p class="ev">Últimos acontecimentos:</p><ul>${eventos.map(e => `<li>${e}</li>`).join('')}</ul>` : ''}
      <button>Bora!</button>`;
    el.querySelector('button')!.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 15_000);
  }

  mapaAberto = false;
  alternarMapa(forcar?: boolean) {
    this.mapaAberto = forcar ?? !this.mapaAberto;
    $('mapa').hidden = !this.mapaAberto;
    if (!this.mapaAberto) return;
    this.alternarCraft(false); this.alternarRanking(false); this.alternarHabilidades(false);
    $('mapa').innerHTML = `<h3>Mapa-múndi <button class="fechar">✕</button></h3>
      <div class="moldura"><canvas></canvas></div>
      <p class="legenda"><i style="background:#fff"></i>você <i style="background:#b48cff"></i>sua ilha <i style="background:#ffcf4a"></i>baú
        <i style="background:#e8607a"></i>rival <i style="background:#5fb3ff"></i>jogador <i style="background:#ff3b3b"></i>vingança <span>◯ influência do reino</span></p><p class="explorado"></p>`;
    const cv = $('mapa').querySelector('canvas')!;
    const r = this.g.mapaMundi(cv);
    // tocar num lugar conhecido do mapa: o personagem vai até lá sozinho
    cv.addEventListener('click', e => {
      const b = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - b.left) * (cv.width / b.width)), y = Math.floor((e.clientY - b.top) * (cv.height / b.height));
      if (this.g.viajar(x, y)) this.alternarMapa(false);
    });
    $('mapa').querySelector('.explorado')!.textContent = `Terra explorada: ${(r.explorado * 100).toFixed(1)}% · toque num lugar para ir até lá`;
    // abre centrado em você
    const mol = $('mapa').querySelector<HTMLElement>('.moldura')!;
    requestAnimationFrame(() => { mol.scrollLeft = r.jx * mol.scrollWidth - mol.clientWidth / 2; mol.scrollTop = r.jy * mol.scrollHeight - mol.clientHeight / 2; });
    $('mapa').querySelector('.fechar')!.addEventListener('click', () => this.alternarMapa(false));
  }

  rankingAberto = false;
  alternarRanking(forcar?: boolean) {
    this.rankingAberto = forcar ?? !this.rankingAberto;
    $('ranking').hidden = !this.rankingAberto;
    if (this.rankingAberto) { this.alternarCraft(false); this.atualizarRanking(); }
  }

  private static ROTULO: Record<string, string> = { coletor: 'coletor', construtor: 'construtor', cacador: 'caçador', explorador: 'explorador', jogador: 'você', pessoa: 'jogador' };
  atualizarRanking() {
    if (!this.rankingAberto) return;
    const r = this.g.ranking();
    const minha = r.findIndex(l => l.perfil === 'jogador');
    // posição de verdade: empatados dividem a posição; o alvo é quem está logo acima com MAIS pontos
    const eu = r[minha];
    const pos = r.filter(l => l.pontos > eu.pontos).length + 1;
    const empatados = r.filter(l => l !== eu && l.pontos === eu.pontos).length;
    const acima = [...r].reverse().find(l => l.pontos > eu.pontos);
    const mostrar = r.slice(0, 8);
    const linha = (l: (typeof r)[number], i: number) =>
      `<li data-nome="${l.nome}" class="${l.perfil === 'jogador' ? 'eu' : l.perfil === 'pessoa' ? 'pessoa' : ''}"><span>${r.filter(o => o.pontos > l.pontos).length + 1}º</span><b>${l.nome}</b><small>${l.tag ?? Interface.ROTULO[l.perfil]}</small><em>${l.pontos}</em></li>`;
    $('ranking').innerHTML = `<h3>Ranking <button class="fechar">✕</button></h3>
      <p class="sua">Sua posição: <b>${pos}º de ${r.length}</b>${empatados ? ` <small class="emp">empatado com ${empatados}</small>` : ''}${acima ? `<span class="alvo">Faltam <b>${acima.pontos - eu.pontos + 1}</b> pts para passar ${acima.nome}</span>` : r.length > 1 && !empatados ? `<span class="alvo">Você lidera por ${eu.pontos - r.find(l => l !== eu)!.pontos} pts</span>` : ''}<small>Toque num nome para assistir</small></p><ol>${
      mostrar.map(linha).join('')}${minha >= 8 ? linha(r[minha], minha) : ''}</ol>`;
    $('ranking').querySelector('.fechar')!.addEventListener('click', () => this.alternarRanking(false));
  }

  assistindo(nome: string | null, perfil = '') {
    document.body.classList.toggle('espectador', !!nome);
    $('espectador-nome').textContent = nome ? (perfil === 'pessoa' ? `Visitando a ilha de ${nome}` : `Assistindo ${nome} (${Interface.ROTULO[perfil] ?? perfil})`) : '';
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
    const en = Math.round(this.g.energia());
    $('nivel').innerHTML = `<b>Ilha nível ${nivel}</b> <span class="energia ${en < 30 ? 'baixa' : ''}">⚡${en}%</span>` + (req
      ? `<div class="req">${[...req.construcoes, ...req.itens].map(item).join('')}</div><small>${req.pronto ? 'Pronto! Vá até o Cristal' : `para o nível ${req.nivel}`}</small>`
      : '<small>nível máximo</small>');
    if (!$('cristal').hidden) this.desenharCristal();

    if (!this.aberto) return;
    // abas por grupo, com quantas receitas dá para criar agora em cada uma
    const nj = this.g.nivelJogador();
    const liberada = (r: (typeof RECEITAS)[number]) => nj >= nivelJogadorDe(r.id);
    const prontas = (g: Grupo) => RECEITAS.filter(r => grupoDe(r.id) === g && liberada(r) && podeCriar(inv, r, nivel) && (!r.estacao || this.g.perto(r.estacao))).length;
    if (!this.grupo) this.grupo = GRUPOS.find(g => prontas(g.id) > 0)?.id ?? 'extracao';
    const abas = `<div class="abas">${GRUPOS.map(g => {
      const n = prontas(g.id);
      return `<button class="aba ${g.id === this.grupo ? 'sel' : ''}" data-g="${g.id}" title="${g.nome}"><img src="${icone(g.icone)}"><span>${g.nome}</span>${n ? `<i>${n}</i>` : ''}</button>`;
    }).join('')}</div>`;
    // dentro da aba: o que dá para criar agora, depois o que falta material, por último o travado por nível
    const ordem = (r: (typeof RECEITAS)[number]) => (liberada(r) && podeCriar(inv, r, nivel) && (!r.estacao || this.g.perto(r.estacao)) ? 0 : liberada(r) && nivel >= (r.nivel ?? 1) ? 1 : 2) * 100 + nivelJogadorDe(r.id) * 10 + (r.nivel ?? 1);
    const daAba = RECEITAS.map((r, i) => ({ r, i })).filter(({ r }) => grupoDe(r.id) === this.grupo).sort((a, b) => ordem(a.r) - ordem(b.r));
    this.craft.innerHTML = '<h3>Criar <small>(C)</small><button class="fechar" aria-label="Fechar">✕</button></h3>' + abas + daAba.map(({ r, i }) => {
      const travadaJogador = !liberada(r);
      const travada = travadaJogador || nivel < (r.nivel ?? 1);
      const semEstacao = !!r.estacao && !this.g.perto(r.estacao);
      const ok = !travada && podeCriar(inv, r, nivel) && !semEstacao;
      const custo = travadaJogador ? `<span class="falta">🔒 Você nível ${nivelJogadorDe(r.id)}</span>` : travada ? `<span class="falta">Requer ilha nível ${r.nivel}</span>` : (semEstacao ? `<span class="falta">Perto de: ${ITENS[r.estacao!].nome}</span>` : '') + Object.entries(r.custo).map(([id, n]) => {
        const tem = qtd(inv, id as ItemId) >= (n ?? 0);
        return `<span class="${tem ? '' : 'falta'}"><img src="${icone(id as ItemId)}">${qtd(inv, id as ItemId)}/${n}</span>`;
      }).join('');
      return `<button data-r="${i}" ${ok ? '' : 'disabled'}><img class="grande" src="${icone(r.id)}">
        <div><b>${ITENS[r.id].nome}${r.qtd > 1 ? ` ×${r.qtd}` : ''}</b><div class="custo">${custo}</div></div></button>`;
    }).join('');
    this.craft.querySelector('.fechar')!.addEventListener('click', () => this.alternarCraft(false));
    this.craft.querySelectorAll<HTMLElement>('[data-g]').forEach(b => b.addEventListener('click', () => {
      this.grupo = b.dataset.g as Grupo;
      try { localStorage.setItem('ilhas-grupo', this.grupo); } catch { /* ok */ }
      this.atualizar();
    }));
    this.craft.querySelectorAll<HTMLButtonElement>('button[data-r]').forEach(b => b.addEventListener('click', () => {
      const r = RECEITAS[Number(b.dataset.r)];
      if (this.g.nivelJogador() < nivelJogadorDe(r.id)) { this.aviso(`Libera no nível ${nivelJogadorDe(r.id)} do personagem`); return; }
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
    const chave = `${this.rivalHtml}|${Math.ceil(s.vida)}|${s.vidaMax}|${s.xp}|${s.nivel}|${noite}|${Math.floor(fracDia * 24)}|${Math.floor(mana)}|${manaMax}`;
    if (chave === this.ultimoStatus) return;
    this.ultimoStatus = chave;
    const hora = Math.floor((fracDia * 24 + 6) % 24);
    $('status').innerHTML = `
      <div class="linha"><b>Nv ${s.nivel}</b><span class="icones"><button data-cfg="som" title="Som">${this.somLigado() ? '🔊' : '🔇'}</button><button data-cfg="musica" title="Música">${this.musicaLigada() ? '♫' : '♪̸'}</button></span><span class="relogio">${noite ? '☾' : '☀'} ${String(hora).padStart(2, '0')}h</span></div>
      <div class="bar vida"><i style="width:${(100 * Math.max(0, s.vida)) / s.vidaMax}%"></i><span>${Math.max(0, Math.ceil(s.vida))}/${s.vidaMax}</span></div>
      ${manaMax ? `<div class="bar mana"><i style="width:${(100 * mana) / manaMax}%"></i><span>${Math.floor(mana)}/${manaMax}</span></div>` : ''}
      <div class="bar xp"><i style="width:${(100 * s.xp) / xpParaProximo(s.nivel)}%"></i><span>XP ${s.xp}/${xpParaProximo(s.nivel)}</span></div>${this.rivalHtml}`;
    this.atualizarHabilidades();
  }

  private rivalHtml = '';
  /** Linha do rival da semana no painel de status (toque = visitar a ilha dele). */
  rival(r: { nome: string; chave: string; dele: number; meus: number; dias: number } | null) {
    const html = r ? `<button class="rival" data-rival="${r.chave}" title="Seu rival da semana — toque para ver a ilha">⚔ <b>${r.nome}</b> ${
      r.meus > r.dele ? `<em class="frente">+${r.meus - r.dele}</em>` : r.meus === r.dele ? '<em>empate</em>' : `<em class="atras">−${r.dele - r.meus}</em>`}<small>${r.dias}d</small></button>` : '';
    if (html !== this.rivalHtml) { this.rivalHtml = html; this.ultimoStatus = ''; }
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
