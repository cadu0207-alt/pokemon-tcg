import { Boot } from './scenes/Boot.js';
import { Camp } from './scenes/Camp.js';
import { Battle } from './scenes/Battle.js';
import { LevelUp } from './scenes/LevelUp.js';
import { Result } from './scenes/Result.js';
import { Credits } from './scenes/Credits.js';
import { initCloud } from './save.js';
import { setBestiary } from './creatures.js';
import { Starter } from './scenes/Starter.js';

async function start() {
  const manifest = await (await fetch('assets/manifest.json')).json();
  setBestiary(await (await fetch('assets/encantados.json')).json());
  // As fontes do Google precisam estar prontas antes do Phaser desenhar textos.
  await Promise.all([
    document.fonts.load('800 32px Cinzel'),
    document.fonts.load('700 20px "Alegreya Sans"'),
  ]).catch(() => {});
  const cloudEmail = await initCloud();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#14100c',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 720 },
    scene: [Boot, Starter, Camp, Battle, LevelUp, Result, Credits],
  });
  game.registry.set('manifest', manifest);
  game.registry.set('cloudEmail', cloudEmail);
  window.rpgGame = game; // acesso pelo console do navegador para testes
}

start();
