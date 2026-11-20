// Boot and the one loop for Solara Bay v2: input is read every frame, the
// world advances in fixed 1/60 s steps, and the Three.js renderer paints
// what is there. Screens: title, play, paused, over, and a short
// mission-complete banner. The camera yaw is smoothed toward its target so
// turning the camera and driving feel calmer, and the driving camera sits
// further back than the on-foot one.
// ?seed=N fixes the city and traffic. ?shot=chase|drive|mission|beach (with
// &seed=N) stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.
import { STEP, VEHICLES } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CASH, EVENT_COLLECT, EVENT_CRASH, EVENT_MISSION, EVENT_RACE, EVENT_TAXI, EVENT_UNLOCK } from './world.js';
import {
  ACTION_CAMERA, ACTION_CONFIRM, ACTION_ENTER, ACTION_HORN, ACTION_INTERACT, ACTION_JUMP, ACTION_MUTE,
  ACTION_PAUSE, ACTION_PUNCH, ACTION_RESTART, ACTION_SAVE, createInput,
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
const healthLabel = document.getElementById('health-label');
const starsEl = document.getElementById('stars');
const missionTitleEl = document.getElementById('mission-title');
const objectiveEl = document.getElementById('objective');
const progressEl = document.getElementById('progress');
const progressFill = document.getElementById('progress-fill');
const messageEl = document.getElementById('message');
const speedEl = document.getElementById('speed');
const vehicleEl = document.getElementById('vehicle');
const minimap = document.getElementById('minimap');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayLines = document.getElementById('overlay-lines');
const overlayPrompt = document.getElementById('overlay-prompt');
const damageFlash = document.getElementById('damage-flash');
const lowHealthEl = document.getElementById('low-health');
const startBtn = document.getElementById('start-btn');
const newBtn = document.getElementById('new-btn');
const resumeBtn = document.getElementById('resume-btn');
const restartBtn = document.getElementById('restart-btn');
const saveBtn = document.getElementById('save-btn');

const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
// Debug hook for play-testing (read-only state inspection in the console).
window.__solara = world;
const audio = createAudio();
let cameraYaw = Math.PI;
let cameraYawTarget = Math.PI;
let cameraPitch = 0.15;
let dusk = false;
let lastHealth = 100;
let missionBannerTimer = null;

function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

function progressFraction() {
  const s = world.state;
  if (s.missionIndex === 1) return s.dropsDone / 3;
  if (s.missionIndex === 3) return s.raceIndex / 4;
  if (s.missionIndex >= 5) return Math.min(1, (s.taxiDone + s.coinsCollected) / 10);
  return s.missionStage > 0 ? 0.5 : 0;
}

function updateHud() {
  const s = world.state;
  const p = s.player;
  if (cashEl) cashEl.textContent = `$${s.cash}`;
  if (healthFill) {
    healthFill.style.width = `${Math.max(0, p.health)}%`;
    healthFill.classList.toggle('low', p.health < 35);
  }
  if (healthLabel) healthLabel.textContent = `HEALTH ${Math.max(0, Math.round(p.health))}`;
  if (lowHealthEl) lowHealthEl.classList.toggle('on', p.health < 30 && p.health > 0);
  if (starsEl) starsEl.textContent = '★'.repeat(s.wanted) + '☆'.repeat(5 - s.wanted);
  if (missionTitleEl) missionTitleEl.textContent = s.missionTitle;
  if (objectiveEl) objectiveEl.textContent = s.missionText;
  if (progressEl) progressEl.textContent = world.missionProgress();
  if (progressFill) progressFill.style.width = `${Math.round(progressFraction() * 100)}%`;
  if (messageEl) {
    messageEl.textContent = s.messageTimer > 0 ? s.message : '';
    messageEl.style.opacity = s.messageTimer > 0 ? '1' : '0';
  }
  if (speedEl) speedEl.textContent = p.inCar ? `${Math.round(Math.abs(p.inCar.speed) * 3.6)} km/h` : (p.speed > 0.5 ? 'On foot' : '');
  if (vehicleEl) vehicleEl.textContent = p.inCar ? VEHICLES[p.inCar.vtype].label : '';
  if (minimap) renderer.drawMinimap(s, minimap);
  // Damage flash when Leo's health drops sharply.
  if (p.health < lastHealth - 4 && damageFlash) {
    damageFlash.classList.add('on');
    setTimeout(() => damageFlash.classList.remove('on'), 140);
  }
  lastHealth = p.health;
}

function setOverlayButtons(mode) {
  // mode: 'title' shows Start/New, 'pause' shows Resume/Restart/Save.
  const title = mode === 'title';
  if (startBtn) startBtn.hidden = !title;
  if (newBtn) newBtn.hidden = !title;
  if (resumeBtn) resumeBtn.hidden = title;
  if (restartBtn) restartBtn.hidden = title;
  if (saveBtn) saveBtn.hidden = title;
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

function showMissionComplete(title, reward) {
  if (missionBannerTimer) clearTimeout(missionBannerTimer);
  showOverlay('MISSION COMPLETE', [`<b>${title}</b>`, `+$${reward} — nice work, Leo.`, 'The city keeps moving. Next job is on the map.'], 'Press Enter to keep playing');
  missionBannerTimer = setTimeout(() => {
    if (!overlay.classList.contains('hidden') && overlayTitle.textContent === 'MISSION COMPLETE') hideOverlay();
  }, 2600);
}

function runShot(name) {
  const scene = stageShot(name, world);
  dusk = !!scene.dusk;
  cameraYaw = scene.cameraYaw ?? Math.PI;
  cameraYawTarget = cameraYaw;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, cameraYaw, cameraPitch, dusk);
    updateHud();
    painted += 1;
    if (painted < 4) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  hideOverlay();
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
    lastHealth = world.state.player.health;
    screen = SCREEN_PLAY;
    hideOverlay();
    announce('Playing Solara Bay.');
  }

  function showTitle() {
    screen = SCREEN_TITLE;
    setOverlayButtons('title');
    const lines = [
      '<b>Leo Marin is back in Solara Bay — and in debt.</b> Mara Voss, Dario Kess and Officer Reyes all want something from him.',
      'Five story missions: Borrowed Wheels, The Courier, the Bay Heist, the Harbor Lights race, and The Getaway — plus taxi fares and sun coins on the beach.',
      'WASD move / drive · Mouse drag to look · Click to shoot · E enter a car · F interact · Q punch · Space jump · H horn · R restart · V camera',
      'Shift run · P pause · C save · M mute',
      hasSave ? 'A saved game is waiting — press Enter to continue it.' : 'No save yet — press Enter to start a new story.',
    ];
    showOverlay('SOLARA BAY', lines, hasSave ? 'Press Enter to continue, or click New Game below' : 'Press Enter or click to start');
  }

  function showPaused() {
    screen = SCREEN_PAUSED;
    setOverlayButtons('pause');
    showOverlay('Paused', ['The city waits for you.', 'Missions, taxi fares and sun coins are saved with C.', 'R restarts the run · V resets the camera'], 'Press P to resume');
  }

  function showOver() {
    screen = SCREEN_OVER;
    setOverlayButtons('title');
    showOverlay('Busted', ['The Solara Bay police caught up with Leo.', 'You woke up at Bay Hospital, $100 lighter.'], 'Press Enter to keep playing');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      world.state.message = muted ? 'Sound muted' : 'Sound on';
      world.state.messageTimer = 2;
    }
    if (actions & ACTION_HORN && screen === SCREEN_PLAY && world.state.player.inCar) audio.horn();
    if (actions & ACTION_CAMERA) { cameraYawTarget = Math.PI; }
    if (actions & ACTION_RESTART && screen === SCREEN_PLAY) {
      world.reset();
      lastHealth = world.state.player.health;
      world.state.message = 'Run restarted';
      world.state.messageTimer = 2;
    }
    if (actions & ACTION_SAVE && screen === SCREEN_PLAY) world.save();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame(screen === SCREEN_OVER);
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) showPaused();
    else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      hideOverlay();
    }
    // A mission-complete banner dismisses on Enter too.
    if (actions & ACTION_CONFIRM && overlayTitle.textContent === 'MISSION COMPLETE' && !overlay.classList.contains('hidden')) {
      hideOverlay();
    }
  }

  function stepWorld() {
    const actions = input.takeActions();
    handleActions(actions);
    if (screen !== SCREEN_PLAY) return;
    const cam = input.takeCameraDelta();
    cameraYawTarget += cam.yaw;
    cameraPitch = Math.max(-0.4, Math.min(0.7, cameraPitch + cam.pitch));
    // Smooth the camera toward its target yaw each frame.
    let diff = cameraYawTarget - cameraYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cameraYaw += diff * 0.18;
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
      const finished = world.state.missionIndex - 1;
      const titles = ['Borrowed Wheels', 'The Courier', 'Bay Heist', 'Harbor Lights', 'The Getaway'];
      const rewards = [250, 400, 800, 600, 900];
      showMissionComplete(titles[finished] || 'Mission', rewards[finished] || 0);
      world.save();
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      showOver();
    }
    if (events & EVENT_TAXI) audio.taxi();
    if (events & EVENT_COLLECT) audio.coin();
    if (events & EVENT_RACE) audio.raceStart();
    if (events & EVENT_CASH) audio.pickup();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_UNLOCK) audio.mission();
    audio.engine(world.state.player.speed, !!world.state.player.inCar);
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
      cameraYawTarget += cam.yaw;
      let diff = cameraYawTarget - cameraYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cameraYaw += diff * 0.18;
    }
    renderer.draw(world.state, cameraYaw, cameraPitch, dusk);
    updateHud();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) showPaused();
  });

  // Buttons on the overlay, for mouse players.
  if (startBtn) startBtn.addEventListener('click', () => { audio.unlock(); startGame(false); });
  if (newBtn) newBtn.addEventListener('click', () => { audio.unlock(); startGame(true); });
  if (resumeBtn) resumeBtn.addEventListener('click', () => { screen = SCREEN_PLAY; hideOverlay(); });
  if (restartBtn) restartBtn.addEventListener('click', () => { world.reset(); lastHealth = world.state.player.health; screen = SCREEN_PLAY; hideOverlay(); });
  if (saveBtn) saveBtn.addEventListener('click', () => { world.save(); screen = SCREEN_PLAY; hideOverlay(); });

  showTitle();
  announce('Solara Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
