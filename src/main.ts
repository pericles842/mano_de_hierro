import { audio } from './audio/AudioEngine';
import { Game } from './Game';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('No se encontró #app');

// El navegador solo permite sonido después de un gesto del usuario.
document.addEventListener('pointerdown', () => audio.unlock());
document.addEventListener('keydown', () => audio.unlock());
document.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('button')) audio.play('click');
});

new Game(root).start();
