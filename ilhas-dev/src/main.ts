import Phaser from 'phaser';
import { CenaJogo } from './render/CenaJogo';

// Exposto para testes automatizados no navegador.
(window as any).game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'jogo',
  backgroundColor: '#3b6ea8',
  pixelArt: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [CenaJogo],
});
