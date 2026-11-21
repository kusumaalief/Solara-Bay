// Boot and the one loop for Solara Bay: input is read every frame, the
// world advances in fixed 1/60 s steps, and the Three.js renderer paints
// what is there. Screens: title, play, paused, over, and a short
// mission-complete banner. The camera yaw is smoothed toward its target
// so turning the camera and driving feel calmer, and the driving camera
// sits further back than the on-foot one. Marin's Armory and the weapon
// chooser panel: a big readable card per gun (blocky SVG icon, damage,
// fire rate, range, ammo, price / owned status) that opens at the armory
// with F or anywhere with Tab/B, pauses the world while it is open, and
// lets Leo buy and equip guns with mouse or 1/2/3.
// ?seed=N fixes the city and traffic. ?shot=chase|drive|mission|armory
// (with &seed=N) stages that scene instead of running the loop, paints
// it and sets window.__shotReady for a screenshot.
// The real low-poly cars — the Comet 01 (Leo's car, every sedan) and the
// police Interceptor (every police car) — load in the background and swap
// in when ready; screenshot scenes wait for them before the first paint.
// L toggles the headlights on the model cars.
import { CAR_MODELS, MISSIONS, STEP, VEHICLES, WEAPONS } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_BUY, EVENT_CASH, EVENT_COLLECT, EVENT_CRASH, EVENT_MISSION, EVENT_RACE, EVENT_RELOAD, EVENT_SHOT, EVENT_TAXI, EVENT_UNLOCK } from './world.js';
import {
  ACTION_CAMERA, ACTION_CHOOSER, ACTION_CONFIRM, ACTION_ENTER, ACTION_HORN, ACTION_INTERACT, ACTION_JUMP, ACTION_LIGHTS, ACTION_MUTE,
  ACTION_PAUSE, ACTION_PUNCH, ACTION_RESTART, ACTION_SAVE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { loadCarModels } from './cars.js';
import { shopSubtitle } from './armory.js';
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
const weaponEl = document.getElementById('weapon');
const minimap = document.getElementById('minimap');
const armoryEl = document.getElementById('armory');
const armoryTitle = document.getElementById('armory-title');
const armorySub = document.getElementById('armory-sub');
const armoryCash = document.getElementById('armory-cash');
const gunListEl = document.getElementById('gun-list');
const armoryCloseBtn = document.getElementById('armory-close');
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
const input = createInput(canvas);
const audio = createAudio();
let cameraYaw = Math.PI;
let cameraYawTarget = Math.PI;
let cameraPitch = 0.15;
let dusk = false;
let lastHealth = 100;
let missionBannerTimer = null;
let chooserOpen = false;
let chooserMode = 'shop'; // 'shop' at the armory (buy + equip), 'chooser' anywhere (equip owned)

const GUN_ICONS = {
  pistol: '<svg viewBox="0 0 64 32" width="64" height="32"><rect x="6" y="8" width="40" height="10" fill="#222831"/><rect x="14" y="18" width="8" height="12" fill="#222831"/><rect x="46" y="10" width="12" height="6" fill="#888"/></svg>',
  shotgun: '<svg viewBox="0 0 64 32" width="64" height="32"><rect x="4" y="10" width="52" height="8" fill="#222831"/><rect x="4" y="18" width="22" height="8" fill="#6b4a2a"/><rect x="56" y="12" width="6" height="4" fill="#888"/></svg>',
  rifle: '<svg viewBox="0 0 64 32" width="64" height="32"><rect x="4" y="11" width="56" height="6" fill="#222831"/><rect x="10" y="17" width="16" height="8" fill="#6b4a2a"/><rect x="26" y="6" width="10" height="5" fill="#111"/><rect x="52" y="12" width="8" height="4" fill="#888"/></svg>',
};

function renderChooser() {
  const s = world.state;
  const w = s.weapons;
  armoryTitle.textContent = chooserMode === 'shop' ? "Marin's Armory" : 'Weapons';
  armorySub.textContent = chooserMode === 'shop' ? shopSubtitle(s) : 'Equip a gun you own — Tab or B to close.';
  armoryCash.textContent = `$${s.cash}`;
  gunListEl.innerHTML = '';
  for (const id of ['pistol', 'shotgun', 'rifle']) {
    const stats = WEAPONS[id];
    const owned = w.owned.includes(id);
    const equipped = w.current === id;
    const a = w.ammo[id];
    const row = document.createElement('div');
    row.className = `gun-row${equipped ? ' equipped' : ''}${owned ? '' : ' locked'}`;
    const fireRate = `${(1 / stats.fireRate).toFixed(1)}/s`;
    row.innerHTML = `
      <div class="gun-icon">${GUN_ICONS[id]}</div>
      <div class="gun-info">
        <div class="gun-name">${stats.label}${equipped ? ' — equipped' : ''}</div>
        <div class="gun-blurb">${stats.blurb}</div>
        <div class="gun-stats">Damage ${stats.damage}${stats.pellets > 1 ? ` × ${stats.pellets}` : ''} · ${fireRate} · Range ${stats.range}m · Mag ${stats.magSize}</div>
        <div class="gun-ammo">${owned ? `Ammo ${a.mag}/${a.reserve}` : `Price $${stats.price}`}</div>
      </div>
      <div class="gun-actions"></div>`;
    const actionsEl = row.querySelector('.gun-actions');
    if (!owned) {
      const buy = document.createElement('button');
      buy.textContent = chooserMode === 'shop' ? `Buy $${stats.price}` : 'Locked';
      buy.disabled = chooserMode !== 'shop' || s.cash < stats.price;
      buy.addEventListener('click', () => {
        if (world.buyGun(id)) audio.buy();
        renderChooser();
      });
      actionsEl.appendChild(buy);
      const note = document.createElement('div');
      note.className = 'gun-note';
      note.textContent = chooserMode === 'shop' ? '' : 'Buy it at the armory';
      actionsEl.appendChild(note);
    } else {
      const equip = document.createElement('button');
      equip.textContent = equipped ? 'Equipped' : 'Equip';
      equip.disabled = equipped;
      equip.addEventListener('click', () => { world.equipGun(id); renderChooser(); });
      actionsEl.appendChild(equip);
      const ammo = document.createElement('button');
      ammo.textContent = 'Ammo $40';
      ammo.disabled = chooserMode !== 'shop' || s.cash < 40;
      ammo.addEventListener('click', () => {
        if (world.buyGunAmmo(id)) audio.buy();
        renderChooser();
      });
      actionsEl.appendChild(ammo);
    }
    gunListEl.appendChild(row);
  }
}

function openChooser(mode) {
  chooserMode = mode;
  chooserOpen = true;
  armoryEl.classList.remove('hidden');
  renderChooser();
}

function closeChooser() {
  chooserOpen = false;
  armoryEl.classList.add('hidden');
  if (chooserMode === 'shop') world.closeArmory();
}

function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

function progressFraction() {
  const s = world.state;
  if (s.missionIndex === 1) return s.dropsDone / 3;
  if (s.missionIndex === 3) return s.raceIndex / 4;
  if (s.missionIndex === 0) return s.missionStage === 1 ? 0.5 : 0;
  if (s.missionIndex === 2) return s.missionStage === 1 ? 0.5 : 0;
  if (s.missionIndex === 4) return s.missionStage === 1 ? 0.5 + (5 - s.wanted) / 10 : 0;
  if (s.missionIndex >= 5) return s.coinsCollected / 8;
  return 0;
}

function updateHud() {
  const s = world.state;
  const p = s.player;
  cashEl.textContent = `$${s.cash}`;
  const healthPct = Math.max(0, Math.round((p.health / 100) * 100));
  healthFill.style.width = `${healthPct}%`;
  healthLabel.textContent = `${Math.ceil(p.health)} HP`;
  starsEl.textContent = '★'.repeat(s.wanted) + '☆'.repeat(5 - s.wanted);
  missionTitleEl.textContent = s.missionTitle;
  objectiveEl.textContent = s.missionText;
  progressEl.textContent = world.missionProgress();
  progressFill.style.width = `${Math.round(progressFraction() * 100)}%`;
  messageEl.textContent = s.messageTimer > 0 ? s.message : '';
  const car = p.inCar;
  speedEl.textContent = car ? `${Math.round(Math.abs(car.speed) * 2.2)} mph` : `${Math.round(p.speed * 2.2)} mph`;
  vehicleEl.textContent = car
    ? (car.model && CAR_MODELS[car.model] ? CAR_MODELS[car.model].label : VEHICLES[car.vtype].label)
    : 'On foot';
  const w = s.weapons;
  if (w.current) {
    const stats = WEAPONS[w.current];
    const a = w.ammo[w.current];
    weaponEl.textContent = w.reloading > 0
      ? `${stats.label} — reloading…`
      : `${stats.label} ${a.mag}/${a.reserve}`;
  } else {
    weaponEl.textContent = 'No gun — visit the armory';
  }
  if (p.health < lastHealth) {
    damageFlash.classList.add('on');
    setTimeout(() => damageFlash.classList.remove('on'), 140);
  }
  lastHealth = p.health;
  lowHealthEl.classList.toggle('hidden', p.health > 30);
  renderer.drawMinimap(s, minimap);
}

function setOverlayButtons(mode) {
  const show = (el, yes) => { if (el) el.classList.toggle('hidden', !yes); };
  if (mode === 'title') {
    show(startBtn, true);
    show(newBtn, true);
    show(resumeBtn, world.hasSave());
    show(restartBtn, false);
    show(saveBtn, false);
  } else if (mode === 'paused') {
    show(startBtn, false);
    show(newBtn, false);
    show(resumeBtn, true);
    show(restartBtn, true);
    show(saveBtn, true);
  } else {
    show(startBtn, true);
    show(newBtn, true);
    show(resumeBtn, false);
    show(restartBtn, false);
    show(saveBtn, false);
  }
}

function showOverlay(title, lines, prompt) {
  overlayTitle.textContent = title;
  overlayLines.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  overlayPrompt.textContent = prompt;
  overlay.classList.remove('hidden');
  hud.classList.add('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
}

function showMissionComplete(title, reward) {
  showOverlay('MISSION COMPLETE', [title, `+$${reward}`], 'Press Enter to continue');
  if (missionBannerTimer) clearTimeout(missionBannerTimer);
  missionBannerTimer = setTimeout(() => {
    if (overlayTitle.textContent === 'MISSION COMPLETE') hideOverlay();
  }, 3500);
}

function runShot(name) {
  // Hide the title overlay: the shot is the game itself, not a menu.
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  const scene = stageShot(name, world);
  dusk = !!scene.dusk;
  cameraYaw = scene.cameraYaw ?? Math.PI;
  cameraYawTarget = cameraYaw;
  // Screenshot scenes wait for the real car models before the first
  // paint, so the frames show the Comet 01 and the Interceptor, not
  // the blocky cars. A 90-frame chain stalls headless Chrome, so the
  // ready flag is set on a timer after one painted frame instead.
  loadCarModels().catch(() => {});
  function paintOnce() {
    updateHud();
    renderer.draw(world.state, cameraYaw, cameraPitch, dusk);
  }
  requestAnimationFrame(paintOnce);
  setTimeout(() => { paintOnce(); window.__shotReady = true; }, 1800);
}

function runGame() {
  // Start the real car models loading behind the title screen, so they
  // are usually ready by the time Leo gets in a car.
  loadCarModels().catch(() => {});
  let screen = SCREEN_TITLE;
  const hasSave = world.hasSave();
  showOverlay(
    'SOLARA BAY',
    [
      'A blocky open-world crime game in the spirit of GTA 6.',
      'Leo Marin is back in Solara Bay. Steal cars, outrun the cops,',
      'run five missions for Mara Voss and Dario Kess — and mind the heat.',
      '',
      'WASD drive / walk · E enter car · F interact · Q punch · Click shoot',
      'Tab weapons · 1/2/3 switch gun · T reload · L headlights · H horn',
      'Shift run · Space jump · P pause · C save · M mute',
    ],
    hasSave ? 'Press Enter to continue, or start a new game' : 'Press Enter to start',
  );
  setOverlayButtons('title');
  announce('Solara Bay — press Enter to start');

  function startGame(fresh) {
    if (fresh) world.reset();
    else if (world.hasSave()) world.load();
    lastHealth = world.state.player.health;
    screen = SCREEN_PLAY;
    hideOverlay();
    audio.unlock();
    announce('Welcome to Solara Bay');
  }

  function showPaused() {
    screen = SCREEN_PAUSED;
    showOverlay('PAUSED', ['Take a breath, Leo.', 'Your progress is saved when you finish a mission.'], 'Press P or Enter to resume');
    setOverlayButtons('paused');
  }

  // One-shot keys and screen changes, read once per rendered frame — not
  // once per world sub-step, and not only while playing. This is what
  // makes P resume from pause and Enter start from the title screen:
  // while paused the world does not step, so nothing that only runs
  // inside the world step would ever see the key.
  function handleActions() {
    const actions = input.takeActions();
    // Tab/B toggles the chooser: the open branch is else-if of the close
    // branch, so one press cannot close it and immediately re-open it.
    // P closes the chooser without pausing as well.
    const chooserWasOpen = chooserOpen;
    if (actions & (ACTION_CHOOSER | ACTION_PAUSE) && chooserOpen) closeChooser();
    else if (actions & ACTION_CHOOSER && screen === SCREEN_PLAY && !chooserOpen) {
      openChooser('chooser');
    }
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted' : 'Sound on');
    }
    if (actions & ACTION_HORN && screen === SCREEN_PLAY && world.state.player.inCar) audio.horn();
    if (actions & ACTION_LIGHTS && screen === SCREEN_PLAY) {
      world.state.headlights = !world.state.headlights;
      announce(world.state.headlights ? 'Headlights on' : 'Headlights off');
    }
    if (actions & ACTION_CAMERA) { cameraYawTarget = Math.PI; }
    if (actions & ACTION_RESTART && screen === SCREEN_PLAY) {
      world.reset();
      lastHealth = world.state.player.health;
    }
    if (actions & ACTION_SAVE && screen === SCREEN_PLAY) world.save();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame(screen === SCREEN_OVER);
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY && !chooserWasOpen) showPaused();
    else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      hideOverlay();
    }
    if (actions & ACTION_CONFIRM && overlayTitle.textContent === 'MISSION COMPLETE' && !overlay.classList.contains('hidden')) {
      hideOverlay();
    }
    return actions;
  }

  // One fixed world step of gameplay. `actions` is the frame's one-shot
  // keys, passed only on the first sub-step of the frame — the later
  // sub-steps get 0, so Enter is not pressed twenty times in one frame.
  // Held keys (WASD, mouse) are read live on every sub-step.
  function stepGameplay(actions) {
    if (screen !== SCREEN_PLAY) return;
    // While the weapon chooser is open the world is frozen — but 1/2/3
    // still switches the equipped gun, and Tab/B or P closes it.
    if (chooserOpen) {
      const slot = input.takeWeaponSlot();
      if (slot) {
        const id = ['pistol', 'shotgun', 'rifle'][slot - 1];
        if (id) { world.equipGun(id); renderChooser(); }
      }
      input.takeReload();
      return;
    }
    const cam = input.takeCameraDelta();
    cameraYawTarget += cam.yaw;
    cameraPitch = Math.max(-0.1, Math.min(0.8, cameraPitch + cam.pitch * 0.5));
    const controls = {
      moveX: input.moveX(),
      moveY: input.moveY(),
      run: input.run(),
      jump: !!(actions & ACTION_JUMP),
      enter: !!(actions & ACTION_ENTER),
      interact: !!(actions & ACTION_INTERACT),
      punch: !!(actions & ACTION_PUNCH),
      fire: input.mouseDown() || input.takeMouseClick(),
      weaponSlot: input.takeWeaponSlot(),
      reload: input.takeReload(),
      cameraYaw,
    };
    const events = world.step(STEP, controls);
    if (world.state.armoryOpen && !chooserOpen) openChooser('shop');
    if (events & EVENT_SHOT) audio.shoot(world.state.weapons.current);
    if (events & EVENT_BUY) audio.buy();
    if (events & EVENT_RELOAD) audio.reload();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_CASH) audio.pickup();
    if (events & EVENT_COLLECT) audio.coin();
    if (events & EVENT_TAXI) audio.taxi();
    if (events & EVENT_RACE) audio.raceStart();
    if (events & EVENT_UNLOCK) audio.mission();
    if (events & EVENT_MISSION) {
      audio.mission();
      const done = MISSIONS[world.state.missionIndex - 1];
      if (done) showMissionComplete(done.title, done.reward);
      world.save();
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      showOverlay('BUSTED', ['The cops caught Leo.', 'Woke up at Bay Hospital — $100'], 'Press Enter to continue');
      setOverlayButtons('paused');
      screen = SCREEN_PAUSED;
    }
    audio.engine(world.state.player.inCar ? world.state.player.inCar.speed : 0, !!world.state.player.inCar, world.state.player.inCar ? world.state.player.inCar.model : null);
    audio.siren(STEP, world.state.wanted);
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_PLAY) {
      acc += dt;
      let guard = 0;
      let first = true;
      while (acc >= STEP && guard < 20) {
        stepGameplay(first ? actions : 0);
        first = false;
        acc -= STEP;
        guard += 1;
        if (screen !== SCREEN_PLAY) break;
      }
      if (guard >= 20) acc = 0;
    }
    const diff = cameraYawTarget - cameraYaw;
    cameraYaw += diff * 0.18;
    if (screen !== SCREEN_TITLE) {
      renderer.draw(world.state, cameraYaw, cameraPitch, dusk);
      updateHud();
    }
    if (document.hidden && screen === SCREEN_PLAY) showPaused();
  }

  if (resumeBtn) resumeBtn.addEventListener('click', () => { screen = SCREEN_PLAY; hideOverlay(); });
  if (restartBtn) restartBtn.addEventListener('click', () => { world.reset(); lastHealth = world.state.player.health; screen = SCREEN_PLAY; hideOverlay(); });
  if (saveBtn) saveBtn.addEventListener('click', () => { world.save(); screen = SCREEN_PLAY; hideOverlay(); });
  if (startBtn) startBtn.addEventListener('click', () => startGame(false));
  if (newBtn) newBtn.addEventListener('click', () => startGame(true));
  if (armoryCloseBtn) armoryCloseBtn.addEventListener('click', closeChooser);
  window.__solara = {
    world, renderer, input, audio,
    screen: () => screen,
    start: (fresh) => startGame(fresh),
  };
  window.__solaraRenderer = renderer;
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
