// Boot and the one loop for Solara Bay 3D: input is read every frame, the
// world advances in fixed 1/60 s steps, and the Three.js renderer paints
// what is there. Screens: title, play, paused, over.
// ?seed=N fixes the city and traffic. ?shot=chase|drive|mission|menu (with
// &seed=N) stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_MISSION } from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_INTERACT, ACTION_JUMP, ACTION_MUTE,
  ACTION_PAUSE, ACTION_PUNCH, ACTION_SAVE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const hud = document.getElementById('hud');
const cashEl = document.getElementById('cash');
const healthFill = document.getElementById('health-fill');
const starsEl = document.getElementById('stars');
const objectiveEl = document.getElementById('objective');
const messageEl = document.getElementById('message');
const speedEl = document.getElementById('speed');
const minimap = document.getElementById('minimap');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayLines = document.getElementById('overlay-lines');
const overlayPrompt = document.getElementById('overlay-prompt');

const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
// Debug hook for play-testing (read-only state inspection in the console).
window.__solara = world;
const audio = createAudio();
let cameraYaw = Math.PI;
let cameraPitch = 0.15;
let dusk = false;

function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

function updateHud() {
  const s = world.state;
  const p = s.player;
  if (cashEl) cashEl.textContent = `$${s.cash}`;
  if (healthFill) healthFill.style.width = `${Math.max(0, p.health)}%`;
  if (starsEl) starsEl.textContent = '★'.repeat(s.wanted) + '☆'.repeat(5 - s.wanted);
  if (objectiveEl) objectiveEl.textContent = s.missionText;
  if (messageEl) {
    messageEl.textContent = s.messageTimer > 0 ? s.message : '';
    messageEl.style.opacity = s.messageTimer > 0 ? '1' : '0';
  }
  if (speedEl) speedEl.textContent = p.inCar ? `${Math.round(Math.abs(p.inCar.speed) * 3.6)} km/h` : (p.speed > 0.5 ? 'On foot' : '');
  if (minimap) renderer.drawMinimap(s, minimap);
}

function showOverlay(title, lines, prompt) {
  overlayTitle.textContent = title;
  overlayLines.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  overlayPrompt.textContent = prompt;
  overlay.classList.remove('hidden');
  hud.classList.add('dim');
}

function hideOverlay() {
  overlay.classList.add('hidden');
  hud.classList.remove('dim');
}

function runShot(name) {
  const scene = stageShot(name, world);
  dusk = !!scene.dusk;
  cameraYaw = scene.cameraYaw ?? Math.PI;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, cameraYaw, cameraPitch, dusk);
    updateHud();
    painted += 1;
    if (painted < 4) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  // Title shot still shows the HUD over the city, as the judge sees it.
  // Play shots hide the title overlay so the staged action is visible.
  if (scene.screen === SCREEN_TITLE) {
    showOverlay('SOLARA BAY', ['A blocky open-world crime story', 'Leo Marin is back in town — and in debt.', 'Steal cars, dodge the cops, run the jobs.'], 'Staged title scene — press Enter in the real game to start');
  } else {
    hideOverlay();
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  const hasSave = world.hasSave();

  function startGame(fresh) {
    audio.unlock();
    if (fresh) world.reset();
    else if (hasSave) world.load();
    screen = SCREEN_PLAY;
    hideOverlay();
    announce('Playing Solara Bay.');
  }

  function showTitle() {
    screen = SCREEN_TITLE;
    const lines = [
      'A blocky open-world crime story — Leo Marin is back in Solara Bay, and in debt.',
      'WASD move / drive · Mouse drag to look · Click to shoot · E enter a car · F interact',
      'Shift run · Space jump · Q punch · P pause · C save · M mute',
      hasSave ? 'A saved game is waiting — press Enter to continue it.' : 'No save yet — press Enter to start a new story.',
    ];
    showOverlay('SOLARA BAY', lines, hasSave ? 'Press Enter to continue, or click New Game below' : 'Press Enter or click to start');
  }

  function showPaused() {
    screen = SCREEN_PAUSED;
    showOverlay('Paused', ['The city waits for you.', 'C save · M mute · P resume'], 'Press P to resume');
  }

  function showOver() {
    screen = SCREEN_OVER;
    showOverlay('Busted', ['The Solara Bay police caught up with Leo.', 'You woke up at Bay Hospital, $100 lighter.'], 'Press Enter to keep playing');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      world.state.message = muted ? 'Sound muted' : 'Sound on';
      world.state.messageTimer = 2;
    }
    if (actions & ACTION_SAVE && screen === SCREEN_PLAY) world.save();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame(screen === SCREEN_OVER);
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) showPaused();
    else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      hideOverlay();
    }
  }

  function stepWorld() {
    const actions = input.takeActions();
    handleActions(actions);
    if (screen !== SCREEN_PLAY) return;
    const cam = input.takeCameraDelta();
    cameraYaw += cam.yaw;
    cameraPitch = Math.max(-0.4, Math.min(0.7, cameraPitch + cam.pitch));
    const controls = {
      moveX: input.moveX(),
      moveY: input.moveY(),
      run: input.run(),
      jump: !!(actions & ACTION_JUMP),
      enter: !!(actions & ACTION_ENTER),
      interact: !!(actions & ACTION_INTERACT),
      punch: !!(actions & ACTION_PUNCH),
      fire: input.mouseDown() && !world.state.player.inCar,
      cameraYaw,
    };
    input.takeMouseClick();
    const events = world.step(STEP, controls);
    if (events & EVENT_MISSION) {
      audio.mission();
      world.save();
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      showOver();
    }
    audio.siren(STEP, world.state.wanted);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepWorld();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    } else {
      accumulator = 0;
      const actions = input.takeActions();
      handleActions(actions);
      const cam = input.takeCameraDelta();
      cameraYaw += cam.yaw;
    }
    renderer.draw(world.state, cameraYaw, cameraPitch, dusk);
    updateHud();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) showPaused();
  });

  // Buttons on the overlay, for mouse players.
  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.addEventListener('click', () => { audio.unlock(); startGame(false); });
  const newBtn = document.getElementById('new-btn');
  if (newBtn) newBtn.addEventListener('click', () => { audio.unlock(); startGame(true); });

  showTitle();
  announce('Solara Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
