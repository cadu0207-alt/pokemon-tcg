// Encantados com arte, peças que se encaixam no corpo e as contas de atributos.
// Os atributos base vêm do bestiário (assets/encantados.json); aqui ficam só a arte e as regras.

let bestiary = null;
export function setBestiary(data) { bestiary = data; }
export function bestiaryEntry(name) { return bestiary.criaturas.find(c => c.nome === name); }

// Coordenadas no SVG de 300x250, com os pés em y = 250 e o corpo olhando para a direita.
export const SPECIES = {
  brasinho: {
    name: 'Brasinho', type: 'Fogo', color: 0xef6a2b,
    special: { name: 'Rolo Ardente', desc: 'Golpe forte que deixa o inimigo queimando.' },
    anchors: { back: [112, 104], eye: [234, 168], leg: [192, 204] },
  },
  botinho: {
    name: 'Botinho', type: 'Água', color: 0x3a8fd8,
    special: { name: 'Bolha', desc: 'Prende o inimigo numa bolha por 2,5 s.' },
    anchors: { back: [100, 112], eye: [215, 146], leg: [185, 202] },
  },
  capinho: {
    name: 'Capinho', type: 'Mata', color: 0x4caf50,
    special: { name: 'Brotar', desc: 'Recupera 35% da vida em 5 s.' },
    anchors: { back: [104, 112], eye: [240, 140], leg: [205, 202] },
  },
};
export const SPECIES_IDS = Object.keys(SPECIES);

// Peças: em qual ponto do corpo encaixam, origem da imagem, escala e deslocamento.
export const PARTS = {
  espinhos:          { slot: 'back', origin: [0.5, 66 / 70], scale: 0.75, offset: [0, 4] },
  olho_rubro:        { slot: 'eye',  origin: [0.5, 0.5],     scale: 0.8,  offset: [0, 0] },
  pata_mecanica:     { slot: 'leg',  origin: [0.5, 6 / 76],  scale: 0.62, offset: [0, -4] },
  pata_metralhadora: { slot: 'leg',  origin: [12 / 120, 0.5], scale: 0.7, offset: [6, 14], muzzle: [116 - 12, 0] },
};

// Vantagem de tipo: quem ataca -> tipos contra os quais causa mais dano.
export const STRONG = {
  Fera: [], Fogo: ['Mata', 'Inseto'], 'Água': ['Fogo', 'Terra'], Mata: ['Água', 'Terra'], Raio: ['Água', 'Vento'],
  Terra: ['Fogo', 'Raio', 'Veneno'], Vento: ['Mata', 'Inseto'], Inseto: ['Mata', 'Encanto'],
  Veneno: ['Mata', 'Fera'], Encanto: ['Fera', 'Encanto'],
};
export function typeMultiplier(attack, defend) {
  if (STRONG[attack]?.includes(defend)) return 1.5;
  if (STRONG[defend]?.includes(attack)) return 0.7;
  return 1;
}

export const TEMPERAMENTS = [
  ['Bravo', 'ataque', 'defesa'], ['Teimoso', 'defesa', 'velocidade'], ['Afoito', 'velocidade', 'defesa'],
  ['Robusto', 'vida', 'velocidade'], ['Sereno', 'defesa', 'ataque'], ['Esperto', 'velocidade', 'vida'],
  ['Feroz', 'ataque', 'vida'], ['Calmo', 'vida', 'ataque'], ['Equilibrado', null, null],
];
const STATS = ['vida', 'ataque', 'defesa', 'velocidade'];
export const STAT_LABEL = { vida: 'Vida', ataque: 'Ataque', defesa: 'Defesa', velocidade: 'Velocidade' };

// Cria um Encantado novo com talento (0 a 5 estrelas por atributo) e temperamento sorteados.
export function rollCreature(species, rng = Math.random) {
  const talent = Object.fromEntries(STATS.map(s => [s, Math.floor(rng() * 6)]));
  const temperament = TEMPERAMENTS[Math.floor(rng() * TEMPERAMENTS.length)][0];
  return { species, talent, temperament, variant: rng() < 0.01, caughtAt: Date.now() };
}

// Atributos finais (0 a ~150) de um Encantado do jogador.
export function creatureAttributes(c) {
  const base = bestiaryEntry(SPECIES[c.species].name).atributos;
  const temp = TEMPERAMENTS.find(t => t[0] === c.temperament) || TEMPERAMENTS[8];
  const out = {};
  for (const s of STATS) {
    let v = base[s] * (1 + 0.04 * (c.talent?.[s] || 0));
    if (temp[1] === s) v *= 1.1;
    if (temp[2] === s) v *= 0.9;
    if (c.variant) v *= 1.1;
    out[s] = Math.round(v);
  }
  return out;
}

// Converte atributos em números de combate.
export function combatStats(attr) {
  const dmg = attr.ataque * 0.3;
  return {
    maxHp: Math.round(attr.vida * 3.5),
    dmgMin: dmg * 0.8,
    dmgMax: dmg * 1.2,
    defense: attr.defesa / (attr.defesa + 80), // fração do dano que é absorvida
    atkInterval: Math.max(0.45, 1.1 - attr.velocidade * 0.01),
  };
}

// Inimigo selvagem (corrompido pela Cinza) de uma espécie, mais forte a cada onda.
export function enemyStats(species, wave, boss = false) {
  const a = bestiaryEntry(SPECIES[species].name).atributos;
  const grow = 1 + 0.12 * wave;
  const mult = boss ? 9 : 1;
  return {
    hp: Math.round(a.vida * 1.05 * grow * mult),
    dmg: Math.round(a.ataque * 0.13 * (1 + 0.05 * wave) * (boss ? 1.8 : 1)),
    defense: a.defesa / (a.defesa + 120),
    interval: Math.max(0.7, 1.25 - a.velocidade * 0.006),
  };
}

// Monta o Encantado em um Container: sombra, corpo e peças. Olha para a direita; flip = olha para a esquerda.
export function buildCreature(scene, species, x, y, { scale = 0.8, flip = false, parts = [], corrupted = false } = {}) {
  const sp = SPECIES[species];
  const c = scene.add.container(x, y);
  const shadow = scene.add.ellipse(0, 0, 210, 26, 0x000000, 0.35);
  const rig = scene.add.container(0, 0); // tudo o que se mexe junto (corpo + peças)
  const body = scene.add.image(0, 0, `cr_${species}`).setOrigin(0.5, 1);
  rig.add(body);
  c.add([shadow, rig]);
  c.rig = rig;
  c.body = body;
  c.species = species;
  c.partImages = {};
  c.corrupted = corrupted;
  rig.setScale(flip ? -scale : scale, scale);
  shadow.setScale(scale);
  if (corrupted) body.setTint(0x9a8aa6);
  for (const p of parts) addPart(scene, c, p);
  return c;
}

export function addPart(scene, creature, partId) {
  if (creature.partImages[partId]) return;
  const part = PARTS[partId];
  const [ax, ay] = SPECIES[creature.species].anchors[part.slot];
  const img = scene.add.image(ax - 150 + part.offset[0], ay - 250 + part.offset[1], `part_${partId}`)
    .setOrigin(...part.origin).setScale(part.scale);
  creature.rig.add(img);
  creature.partImages[partId] = img;
  scene.tweens.add({ targets: img, scale: { from: part.scale * 1.6, to: part.scale }, duration: 300, ease: 'Back.easeOut' });
}

// Ponto (em coordenadas da cena) de onde saem os tiros da pata metralhadora.
export function muzzlePoint(creature) {
  const part = PARTS.pata_metralhadora;
  const [ax, ay] = SPECIES[creature.species].anchors.leg;
  const sx = creature.rig.scaleX, sy = creature.rig.scaleY;
  const lx = (ax - 150 + part.offset[0] + part.muzzle[0] * part.scale) * sx;
  const ly = (ay - 250 + part.offset[1]) * sy;
  return { x: creature.x + lx, y: creature.y + ly };
}

// Animações por movimento (o corpo é uma imagem só).
export function playIdle(scene, creature) {
  scene.tweens.killTweensOf(creature.rig);
  const sx = creature.rig.scaleX, sy = Math.abs(creature.rig.scaleY);
  creature.baseScale = { sx, sy };
  creature.rig.setPosition(0, 0).setAngle(0);
  creature.idleTween = scene.tweens.add({
    targets: creature.rig, scaleY: sy * 0.96, scaleX: sx * 1.02, duration: 700 + Math.random() * 200,
    yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  });
}

export function playWalk(scene, creature) {
  scene.tweens.killTweensOf(creature.rig);
  const { sx, sy } = creature.baseScale || { sx: creature.rig.scaleX, sy: creature.rig.scaleY };
  creature.rig.setScale(sx, sy).setAngle(0);
  scene.tweens.add({ targets: creature.rig, y: -10, duration: 170, yoyo: true, repeat: -1, ease: 'Sine.easeOut' });
  scene.tweens.add({ targets: creature.rig, angle: sx > 0 ? 3 : -3, duration: 340, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
}

// Avança e volta. onHit é chamado no momento do impacto.
export function playAttack(scene, creature, onHit, onDone) {
  scene.tweens.killTweensOf(creature.rig);
  const dir = creature.rig.scaleX > 0 ? 1 : -1;
  creature.rig.setPosition(0, 0).setAngle(0);
  scene.tweens.chain({
    targets: creature.rig,
    tweens: [
      { x: -14 * dir, angle: -4 * dir, duration: 110, ease: 'Quad.easeOut' },
      { x: 44 * dir, angle: 6 * dir, duration: 90, ease: 'Quad.easeIn' },
      { x: 0, angle: 0, duration: 200, ease: 'Quad.easeOut' },
    ],
  });
  // A lógica usa temporizadores próprios: se outra animação interromper esta, o golpe e o fim ainda acontecem.
  if (onHit) scene.time.delayedCall(200, onHit);
  if (onDone) scene.time.delayedCall(400, onDone);
}

export function playHurt(scene, creature) {
  const body = creature.body;
  body.setTintFill(0xffffff);
  scene.time.delayedCall(70, () => {
    if (!body.active) return;
    body.clearTint();
    if (creature.corrupted) body.setTint(0x9a8aa6);
  });
  const dir = creature.rig.scaleX > 0 ? 1 : -1;
  scene.tweens.add({ targets: creature.rig, x: -10 * dir, duration: 60, yoyo: true });
}

export function playFaint(scene, creature, onDone) {
  scene.tweens.killTweensOf(creature.rig);
  const dir = creature.rig.scaleX > 0 ? 1 : -1;
  scene.tweens.add({
    targets: creature.rig, angle: -80 * dir, y: -10, duration: 420, ease: 'Quad.easeIn',
    onComplete: () => scene.tweens.add({ targets: creature, alpha: 0, duration: 450, delay: 250, onComplete: onDone }),
  });
}
