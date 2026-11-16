// Estilos e componentes de interface usados por várias cenas.

export const COLORS = {
  ink: '#2b1d10',
  parchment: '#f1e3c2',
  gold: '#ffd34d',
  cream: '#f4e9cf',
  red: '#ff5a4f',
  green: '#7fdc7f',
};

export function title(scene, x, y, text, size = 48) {
  return scene.add.text(x, y, text, {
    fontFamily: 'Cinzel, Georgia, serif', fontSize: size, fontStyle: '800', color: COLORS.gold,
    stroke: '#2a1606', strokeThickness: Math.round(size / 7),
    shadow: { offsetX: 0, offsetY: 4, color: '#000', blur: 8, fill: true },
  }).setOrigin(0.5);
}

export function label(scene, x, y, text, opts = {}) {
  return scene.add.text(x, y, text, {
    fontFamily: '"Alegreya Sans", system-ui, sans-serif', fontSize: opts.size || 22, fontStyle: opts.weight || '700',
    color: opts.color || COLORS.cream, stroke: opts.stroke ?? '#1a0f06', strokeThickness: opts.strokeThickness ?? 4,
    align: opts.align || 'left', wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
  }).setOrigin(opts.ox ?? 0, opts.oy ?? 0.5);
}

// Botão retangular de madeira com texto. Devolve o container com setEnabled().
export function button(scene, x, y, w, h, text, onClick, opts = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const t = label(scene, 0, 0, text, { size: opts.size || 24, ox: 0.5, align: 'center' });
  c.add([g, t]);
  let enabled = true;
  let hover = false;

  const draw = () => {
    g.clear();
    const base = !enabled ? 0x4a4038 : (opts.color || 0x8a4b1f);
    g.fillStyle(0x000000, 0.45).fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, 12);
    g.fillStyle(base, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.fillStyle(0xffffff, hover && enabled ? 0.16 : 0.07).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h / 2 - 4, 8);
    g.lineStyle(3, enabled ? 0xe0b25a : 0x6d6258, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    t.setAlpha(enabled ? 1 : 0.55);
  };
  draw();

  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => { hover = true; draw(); });
  c.on('pointerout', () => { hover = false; draw(); c.setScale(1); });
  c.on('pointerdown', () => { if (enabled) c.setScale(0.96); });
  c.on('pointerup', () => {
    c.setScale(1);
    if (enabled) onClick();
  });
  c.setEnabled = v => { enabled = v; draw(); return c; };
  c.setText = v => { t.setText(v); return c; };
  return c;
}

// Barra feita com uma das imagens do pacote "2D Bars": fundo escuro + imagem recortada.
export function imageBar(scene, x, y, w, h, textureKey) {
  const c = scene.add.container(x, y);
  const back = scene.add.graphics();
  back.fillStyle(0x0d0806, 0.85).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 6);
  back.lineStyle(2, 0xc9a25a, 1).strokeRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 6);
  const fill = scene.add.image(-w / 2, 0, textureKey).setOrigin(0, 0.5);
  const texW = fill.width;
  fill.setDisplaySize(w, h);
  c.add([back, fill]);
  c.setRatio = r => {
    const ratio = Phaser.Math.Clamp(r, 0, 1);
    fill.setCrop(0, 0, texW * ratio, fill.height);
    return c;
  };
  return c;
}

export function formatNumber(n) {
  return Math.floor(n).toLocaleString('pt-BR');
}
