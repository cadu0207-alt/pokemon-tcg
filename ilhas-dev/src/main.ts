import Phaser from 'phaser';
import { CenaJogo, type Config } from './render/CenaJogo';
import type { Dificuldade } from './sim/bots';

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
  const ultimo = ler<{ mundo: Mundo; dificuldade: Dificuldade }>('ilhas-ultimo', { mundo: 'arquipelago', dificuldade: 'normal' });
  let mundo: Mundo = ultimo.mundo in MUNDOS ? ultimo.mundo : 'arquipelago';
  let dificuldade: Dificuldade = ultimo.dificuldade;
  const menu = document.getElementById('menu')!;
  const desenhar = () => {
    const salvo = temSave(MUNDOS[mundo].n);
    menu.innerHTML = `
      <div class="cartao">
        <h1>Ilhas</h1><p class="sub">Colete, construa e faça sua ilha crescer num arquipélago cheio de vizinhos.</p>
        <h2>Mundo</h2><div class="opcoes">${Object.entries(MUNDOS).map(([k, m]) =>
          `<button data-mundo="${k}" class="${k === mundo ? 'sel' : ''}"><b>${m.nome}</b><small>${m.descricao}</small></button>`).join('')}</div>
        <h2>Dificuldade dos bots</h2><div class="opcoes">${(['facil', 'normal', 'dificil'] as Dificuldade[]).map(d =>
          `<button data-dif="${d}" class="${d === dificuldade ? 'sel' : ''}"><b>${{ facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' }[d]}</b></button>`).join('')}</div>
        <div class="acoes">
          ${salvo ? '<button id="continuar" class="principal">Continuar</button>' : ''}
          <button id="novo" class="${salvo ? '' : 'principal'}">${salvo ? 'Novo jogo' : 'Jogar'}</button>
        </div>
        ${salvo ? '<p class="aviso-novo">Novo jogo apaga o progresso deste mundo.</p>' : ''}
      </div>`;
  };
  desenhar();
  menu.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.mundo) { mundo = b.dataset.mundo as Mundo; desenhar(); return; }
    if (b.dataset.dif) { dificuldade = b.dataset.dif as Dificuldade; desenhar(); return; }
    if (b.id === 'novo' && temSave(MUNDOS[mundo].n) && !confirm('Começar de novo? O progresso deste mundo será apagado.')) return;
    if (b.id === 'continuar' || b.id === 'novo') {
      gravar('ilhas-ultimo', { mundo, dificuldade });
      const m = MUNDOS[mundo];
      iniciar({ seed: 2026, participantes: m.n, bots: m.bots, dificuldade, novo: b.id === 'novo' });
    }
  });
}
