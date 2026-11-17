import Phaser from 'phaser';
import { CenaJogo, type Config } from './render/CenaJogo';
import type { Dificuldade } from './sim/bots';
import { BASE, PERSONAGENS, type Personagem } from './render/assets';
import { Nuvem } from './rede/nuvem';

const ESCOLHAS: Personagem[] = ['Boy', 'Princess', 'Cavegirl', 'NinjaGreen', 'EggGirl', 'Monk', 'Knight', 'LionBoy', 'Eskimo', 'Hunter'];

const MUNDOS = {
  vila: { nome: 'Vila', descricao: '30 bots', n: 100, bots: 30 },
  arquipelago: { nome: 'Arquipélago', descricao: '99 bots', n: 100, bots: 99 },
  gigante: { nome: 'Gigante', descricao: '999 bots', n: 1000, bots: 999 },
} as const;
type Mundo = keyof typeof MUNDOS;

const ler = <T,>(k: string, padrao: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? padrao; } catch { return padrao; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ok */ } };
const temSave = (n: number) => { try { return !!localStorage.getItem(`ilhas-save-2026-${n}`); } catch { return false; } };

function iniciar(cfg: Config) {
  document.getElementById('menu')!.hidden = true;
  // Exposto para testes automatizados no navegador.
  (window as any).game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'jogo',
    backgroundColor: '#3b6ea8',
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    callbacks: { preBoot: g => g.registry.set('cfg', cfg) },
    scene: [CenaJogo],
  });
}

const q = new URLSearchParams(location.search);
if (q.has('n') || q.has('bots') || q.has('seed')) {
  // Modo de desenvolvimento: parâmetros na URL pulam o menu.
  iniciar({
    seed: Number(q.get('seed')) || 2026, participantes: Number(q.get('n')) || 100,
    bots: Number(q.get('bots') ?? 99), dificuldade: (q.get('dificuldade') as Dificuldade) || 'normal', novo: false,
  });
} else {
  const ultimo = ler<{ mundo: Mundo; dificuldade: Dificuldade; personagem?: Personagem }>('ilhas-ultimo', { mundo: 'arquipelago', dificuldade: 'normal' });
  let personagem: Personagem = ultimo.personagem && PERSONAGENS.includes(ultimo.personagem) ? ultimo.personagem : 'Boy';
  let mundo: Mundo = ultimo.mundo in MUNDOS ? ultimo.mundo : 'arquipelago';
  let dificuldade: Dificuldade = ultimo.dificuldade;
  const menu = document.getElementById('menu')!;
  // link de desafio: ?de=Nome&nv=5
  const desafio = q.get('de') ? { nome: q.get('de')!.replace(/[<>&"]/g, '').slice(0, 16), nv: Number(q.get('nv')) || 0,
    slot: q.has('c') ? Number(q.get('c')) : null, temporada: Number(q.get('t')) || null } : null;
  const desenhar = () => {
    const salvo = temSave(MUNDOS[mundo].n);
    menu.innerHTML = `
      <div class="cartao">
        <h1>Ilhas</h1>${desafio ? `<p class="desafio">⚔ <b>${desafio.nome}</b>${desafio.nv ? ` (ilha nível ${desafio.nv})` : ''} te desafiou! Comece sua ilha e tente passar — você ganha <b>1 cristal</b> de presente.</p>` : ''}<p class="sub">Você começa numa ilha minúscula com um Cristal no centro. <b>Objetivo: alimente o Cristal até o nível 10</b> —
          a ilha cresce de verdade — e chegue ao topo do ranking. Saia de jangada atrás de baús, mas cuidado: sua ilha fica desprotegida.</p>
        <h2>Seu nome</h2><input id="apelido-local" maxlength="16" placeholder="Seu nome na ilha" value="${apelido.replace(/"/g, '')}">
        <h2>Seu personagem</h2><div class="personagens">${ESCOLHAS.map(p =>
          `<button data-p="${p}" class="${p === personagem ? 'sel' : ''}" title="${p}" style="background-image:url(${BASE}chars/${p}.png)"></button>`).join('')}</div>
        <h2>Mundo</h2><div class="opcoes">${Object.entries(MUNDOS).map(([k, m]) =>
          `<button data-mundo="${k}" class="${k === mundo ? 'sel' : ''}"><b>${m.nome}</b><small>${m.descricao}</small></button>`).join('')}</div>
        <h2>Dificuldade dos bots</h2><div class="opcoes">${(['facil', 'normal', 'dificil'] as Dificuldade[]).map(d =>
          `<button data-dif="${d}" class="${d === dificuldade ? 'sel' : ''}"><b>${{ facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' }[d]}</b></button>`).join('')}</div>
        <div class="acoes">
          ${salvo ? '<button id="continuar" class="principal">Continuar</button>' : ''}
          <button id="novo" class="${salvo ? '' : 'principal'}">${salvo ? 'Novo jogo' : 'Jogar'}</button>
        </div>
        ${salvo ? '<p class="aviso-novo">Novo jogo apaga o progresso deste mundo.</p>' : ''}
        <div id="online"></div>
        <p class="creditos">Arte: <a href="https://pixel-boy.itch.io/ninja-adventure-asset-pack" target="_blank" rel="noopener">Ninja Adventure</a> por Pixel-boy e AAA (CC0)</p>
      </div>`;
  };
  // ---------- Online: temporada com pessoas reais (login do MyDeck) ----------
  let nuvem: Nuvem | null = null;
  let estadoOnline = '<p>Verificando sua conta do MyDeck…</p>';
  let apelido = ler<string>('ilhas-apelido', '');
  const desenharOnline = () => {
    const el = document.getElementById('online');
    if (el) el.innerHTML = `<div class="online"><h2>🌐 Jogar online</h2>${estadoOnline}</div>`;
  };
  const desenharTudo = () => { desenhar(); desenharOnline(); };
  void Nuvem.conectar().then(async r => {
    if (r instanceof Nuvem) {
      nuvem = r;
      const [meu, todos] = await Promise.all([r.meuPerfil(), r.jogadores().catch(() => [])]);
      if (meu) apelido = meu.nome;
      if (!apelido) apelido = (r.email.split('@')[0] || 'Ilhéu').slice(0, 16);
      const dias = Math.max(0, Math.ceil((Date.parse(r.temporada.fim) - Date.now()) / 86_400_000));
      estadoOnline = `<p><b>${r.temporada.nome}</b> · ${todos.length} ${todos.length === 1 ? 'pessoa' : 'pessoas'} · termina em ${dias} dia${dias === 1 ? '' : 's'}.
        Cada pessoa tem sua ilha no mesmo arquipélago; os bots ocupam as ilhas livres.</p>
        <input id="apelido" maxlength="16" placeholder="Seu nome na ilha" value="${apelido.replace(/"/g, '')}">
        <button id="jogar-online">${meu ? 'Continuar online' : 'Entrar na temporada'}</button>`;
    } else if (r.motivo === 'sem-login') {
      estadoOnline = '<p>Entre na sua conta do MyDeck para jogar no mesmo mundo que outras pessoas.</p><p><a href="../" target="_self">Entrar no MyDeck →</a> e depois volte aqui.</p>';
    } else if (r.motivo === 'sem-temporada') {
      estadoOnline = '<p>Nenhuma temporada aberta no momento.</p>';
    } else {
      estadoOnline = '<p>O modo online ainda não está disponível.</p>';
      console.warn('Ilhas online indisponível:', r);
    }
    desenharOnline();
  });
  desenharTudo();
  menu.addEventListener('click', async e => {
    const bo = (e.target as HTMLElement).closest<HTMLElement>('#jogar-online');
    if (bo && nuvem) {
      bo.textContent = 'Entrando…'; (bo as HTMLButtonElement).disabled = true;
      try {
        apelido = ((document.getElementById('apelido') as HTMLInputElement)?.value || apelido).trim().slice(0, 16) || 'Ilhéu';
        gravar('ilhas-apelido', apelido);
        gravar('ilhas-ultimo', { mundo, dificuldade, personagem });
        const jaEstava = !!(await nuvem.meuPerfil());
        const slot = await nuvem.entrar(apelido, personagem);
        // chegou pelo link de alguém da mesma temporada: registra o convite (os dois ganham presente)
        let convite: string | undefined;
        if (!jaEstava && desafio && desafio.slot !== null && desafio.temporada === nuvem.temporada.id && desafio.slot !== slot)
          convite = (await nuvem.registrarConvite(desafio.slot)) ?? undefined;
        const [saveNuvem, todos] = await Promise.all([nuvem.carregarSave(), nuvem.jogadores()]);
        const t = nuvem.temporada;
        iniciar({ seed: t.seed, participantes: t.participantes, bots: Math.max(0, Math.min(99, t.participantes - todos.length)),
          dificuldade, personagem, novo: false, slot, nome: apelido, nuvem, saveNuvem, outros: todos, convite });
      } catch (err) {
        estadoOnline = `<p>Não deu para entrar: ${(err as Error).message}</p>`; desenharOnline();
      }
      return;
    }
  });
  menu.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.mundo) { mundo = b.dataset.mundo as Mundo; desenharTudo(); return; }
    if (b.dataset.dif) { dificuldade = b.dataset.dif as Dificuldade; desenharTudo(); return; }
    if (b.dataset.p) { personagem = b.dataset.p as Personagem; desenharTudo(); return; }
    if (b.id === 'novo' && temSave(MUNDOS[mundo].n) && !confirm('Começar de novo? O progresso deste mundo será apagado.')) return;
    if (b.id === 'continuar' || b.id === 'novo') {
      gravar('ilhas-ultimo', { mundo, dificuldade, personagem });
      const m = MUNDOS[mundo];
      apelido = ((document.getElementById('apelido-local') as HTMLInputElement)?.value || apelido).trim().slice(0, 16);
      if (apelido) gravar('ilhas-apelido', apelido);
      iniciar({ seed: 2026, participantes: m.n, bots: m.bots, dificuldade, personagem, novo: b.id === 'novo', nome: apelido || undefined,
        convite: b.id === 'novo' || !temSave(m.n) ? desafio?.nome : undefined });
    }
  });
}
