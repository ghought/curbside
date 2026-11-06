import '@fontsource/archivo-black/latin-400.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import '@fontsource/caveat/latin-700.css';
import './style.css';
import { Audio } from './audio';
import { Game, type Bridge } from './game';
import { Stage } from './render/stage';
import { loadSave } from './save';
import { UI } from './ui/ui';

declare global {
  interface Window {
    PcktBridge?: { init(options: Record<string, unknown>): Bridge };
    /** Dev-only handle for automated tests. Not present in production builds. */
    __curbside?: Game;
  }
}

function fatal(msg: string) {
  const d = document.createElement('div');
  d.className = 'fatal';
  d.innerHTML = `<div><h1>CURBSIDE</h1><p>${msg}</p></div>`;
  document.body.appendChild(d);
}

function boot() {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const root = document.getElementById('ui') as HTMLElement;

  // Handlers point at `game`, which exists by the time the shell can send anything.
  let game: Game | null = null;
  let hostPaused = false;
  const noop: Bridge = { embedded: false, canonicalUrl: () => null, playStarted() {}, roundEnded() {}, score() {}, error() {} };
  const bridge: Bridge = window.PcktBridge?.init({
    gameId: 'curbside',
    allowedParents: ['https://pckt.up.railway.app'],
    capabilities: { pause: true, mute: true, restart: true },
    onPause() { hostPaused = true; game?.pauseFromHost(); },
    onResume() { hostPaused = false; game?.resumeFromHost(); },
    onMute(muted: boolean) { game?.setMuted(muted, false); },
    onRestart() { game?.restartFromHost(); },
  }) ?? noop;

  let stage: Stage;
  try {
    stage = new Stage(canvas);
  } catch (e) {
    bridge.error(`WebGL failed: ${e}`);
    fatal('This game needs WebGL, and your browser would rather not.');
    return;
  }

  const save = loadSave();
  const audio = new Audio();
  audio.muted = save.muted;
  const ui = new UI(root);
  game = new Game(stage, audio, ui, save, bridge);
  ui.game = game;
  const g = game;

  const size = () => {
    stage.resize(window.innerWidth, window.innerHeight);
    // The loop is frozen while paused, so a resize has to repaint by hand.
    if (g.paused) stage.render(0, 0, 0);
  };
  size();
  window.addEventListener('resize', size);
  window.addEventListener('orientationchange', size);

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    g.pointerDown(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => g.pointerMove(e.clientX, e.clientY));
  canvas.addEventListener('pointerup', () => g.pointerUp());
  canvas.addEventListener('pointercancel', () => g.pointerUp());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    g.keyDown(e.code);
  });
  window.addEventListener('keyup', (e) => g.keyUp(e.code));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) g.pauseFromHost();
    // Coming back shows the pause dialog, unless the arcade shell holds the pause.
    else if (!hostPaused && !g.run) g.resumeFromHost();
  });

  g.start();
  if (import.meta.env.DEV) window.__curbside = g;
}

boot();
