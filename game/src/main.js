// Boot and the one loop for Solara Bay v3: input is read every frame, the
// world advances in fixed 1/60 s steps, and the Three.js renderer paints
// what is there. Screens: title, play, paused, over, and a short
// mission-complete banner. The camera yaw is smoothed toward its target so
// turning the camera and driving feel calmer, and the driving camera sits
// further back than the on-foot one. v3 adds Marin's Armory and the weapon
// chooser panel: a big readable card per gun (blocky SVG icon, damage, fire
// rate, range, ammo, price / owned status) that opens at the armory with F
// or anywhere with Tab/B, pauses the world while it is open, and lets Leo
// buy and equip guns with mouse or 1/2/3.
// ?seed=N fixes the city and traffic. ?shot=chase|drive|mission|armory (with
// &seed=N) stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.
// v4 adds the real low-poly cars: the Comet 01 (Leo's car, every sedan) and
// the police Interceptor (every police car). Screenshot scenes await the
// models before the first paint so the frames show them; in normal play
// they load in the background and swap in when ready. L toggles the
// headlights on the model cars.
import { CAR_MODELS, STEP, VEHICLES, WEAPONS } from './config.js';
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
// Debug hook for play-testing (read-only state inspection in the console).
window.__solara = world;
window.__solaraRenderer = renderer;
const audio = createAudio();
let cameraYaw = Math.PI;
let cameraYawTarget = Math.PI;
let cameraPitch = 0.15;
let dusk = false;
let lastHealth = 100;
let missionBannerTimer = null;
let chooserOpen = false;
let chooserMode = 'shop'; // 'shop' at the armory (buy + equip), 'chooser' anywhere (equip owned)

// Blocky SVG icons for the chooser cards — chunky rectangles, no images.
const GUN_ICONS = {
  pistol: '<svg width="110" height="52" viewBox="0 0 110 52"><rect x="18" y="12" width="62" height="14" fill="#c8cfdb"/><rect x="18" y="26" width="16" height="20" fill="#8a6b3a"/><rect x="74" y="16" width="10" height="6" fill="#ffd23a"/></svg>',
  shotgun: '<svg width="110" height="52" viewBox="0 0 110 52"><rect x="8" y="16" width="86" height="10" fill="#8a6b3a"/><rect x="30" y="26" width="26" height="8" fill="#6b4a2a"/><rect x="8" y="26" width="14" height="14" fill="#5a3a1a"/><rect x="88" y="18" width="8" height="6" fill="#ffd23a"/></svg>',
  rifle: '<svg width="110" height="52" viewBox="0 0 110 52"><rect x="6" y="16" width="96" height="9" fill="#2b4a6b"/><rect x="40" y="6" width="22" height="8" fill="#111111"/><rect x="46" y="25" width="8" height="14" fill="#22242c"/><rect x="6" y="25" width="12" height="12" fill="#22242c"/><rect x="96" y="17" width="8" height="7" fill="#7ad7ff"/></svg>',
};

function renderChooser() {
  const s = world.state;
  const w = s.weapons;
  armoryCash.textContent = `Your cash: $${s.cash}`;
  gunListEl.innerHTML = '';
  for (const id of ['pistol', 'shotgun', 'rifle']) {
    const stats = WEAPONS[id];
    const owned = w.owned.includes(id);
    const equipped = w.current === id;
    const a = w.ammo[id];
    const row = document.createElement('div');
    row.className = `gun-row${equipped ? ' equipped' : ''}${owned ? '' : ' locked'}`;
    const fireRate = `${(1 / stats.fireRate).toFixed(1)}/s`;
    row.innerHTML = `<div class="gun-icon">${GUN_ICONS[id]}<div style="font-size:13px;font-weight:700;color:#c8cfdb">press ${['pistol', 'shotgun', 'rifle'].indexOf(id) + 1}</div></div>`
      + `<div class="gun-info"><div class="gun-name">${stats.label}${equipped ? '<span class="tag">✓ EQUIPPED</span>' : ''}${owned ? '' : ' 🔒'}</div>`
      + `<div class="gun-blurb">${stats.blurb}</div>`
      + `<div class="gun-stats">Damage <span>${stats.damage}${stats.pellets > 1 ? ` × ${stats.pellets}` : ''}</span> Fire rate <span>${fireRate}</span> Range <span>${stats.range}m</span> Mag <span>${owned ? `${a.mag}/${stats.magSize}` : stats.magSize}</span> Reserve <span>${owned ? a.reserve : stats.reserveAmmo}</span></div></div>`
      + `<div class="gun-actions"></div>`;
    const actionsEl = row.querySelector('.gun-actions');
    if (!owned) {
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.textContent = `Buy — $${stats.price}`;
      buy.disabled = chooserMode !== 'shop' || s.cash < stats.price;
      if (chooserMode !== 'shop') buy.title = "Visit Marin's Armory to buy";
      buy.addEventListener('click', () => {
        if (world.buyGun(id)) { audio.buy(); renderChooser(); }
        else renderChooser();
      });
      actionsEl.appendChild(buy);
      const note = document.createElement('div');
      note.style.cssText = 'font-size:13px;color:#c8cfdb;text-align:center';
      note.textContent = chooserMode === 'shop' ? 'At the armory' : 'Buy at the armory';
      actionsEl.appendChild(note);
    } else {
      const equip = document.createElement('button');
      equip.type = 'button';
      equip.textContent = equipped ? '✓ Equipped' : 'Equip';
      equip.disabled = equipped;
      equip.addEventListener('click', () => { world.equipGun(id); renderChooser(); });
      actionsEl.appendChild(equip);
      const ammo = document.createElement('button');
      ammo.type = 'button';
      ammo.className = 'secondary';
      ammo.textContent = 'Ammo +60 — $40';
      ammo.disabled = chooserMode !== 'shop' || s.cash < 40;
      if (chooserMode !== 'shop') ammo.title = "Visit Marin's Armory to buy ammo";
      ammo.addEventListener('click', () => {
        if (world.buyGunAmmo(id)) { audio.buy(); renderChooser(); }
        else renderChooser();
      });
      actionsEl.appendChild(ammo);
    }
    gunListEl.appendChild(row);
  }
}

function openChooser(mode) {
  chooserMode = mode;
  chooserOpen = true;
  if (mode === 'shop') {
    armoryTitle.textContent = "MARIN'S ARMORY";
    armorySub.textContent = shopSubtitle(world.state);
  } else {
    armoryTitle.textContent = 'WEAPONS';
    armorySub.textContent = 'Your guns — click Equip, or press 1 / 2 / 3. Locked guns can only be bought at Marin\'s Armory.';
  }
  renderChooser();
  armoryEl.classList.remove('hidden');
  hud.classList.add('dim');
}

function closeChooser() {
  chooserOpen = false;
  world.closeArmory();
  armoryEl.classList.add('hidden');
  hud.classList.remove('dim');
}

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
  if (vehicleEl) {
    const car = p.inCar;
    vehicleEl.textContent = car
      ? (car.model && CAR_MODELS[car.model] ? CAR_MODELS[car.model].label : VEHICLES[car.vtype].label)
      : '';
  }
  // Weapon HUD: equipped gun and ammo, updating live as the choice changes.
  if (weaponEl) {
    const w = s.weapons;
    if (w.current) {
      const stats = WEAPONS[w.current];
      const a = w.ammo[w.current];
      const reloading = w.reloading > 0
        ? ` <span class="reload">RELOADING…</span>`
        : '';
      weaponEl.innerHTML = `${stats.label} <span class="ammo">${a.mag} / ${a.reserve}</span>${reloading}`;
    } else {
      weaponEl.textContent = "NO GUN — visit Marin's Armory (Tab for weapons)";
    }
  }
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
  // v4: wait for the real car models before staging and painting, so the
  // screenshots show the Comet 01 and the Interceptor, not the blocky
  // stand-ins. If a model fails to load the scenes still paint (blocky).
  loadCarModels().then(() => {
    const scene = stageShot(name, world);
    dusk = !!scene.dusk;
    cameraYaw = scene.cameraYaw ?? Math.PI;
    cameraYawTarget = cameraYaw;
    function paintOnce() {
      renderer.draw(world.state, cameraYaw, cameraPitch, dusk);
      updateHud();
    }
    hideOverlay();
    // Paint once right away, then once more after 1.8 s: the v3 textured
    // facades load asynchronously, and a timer (not a long rAF chain) is
    // what guarantees the final frame shows them — headless Chrome throttles
    // requestAnimationFrame, so a 90-frame chain stalls there.
    requestAnimationFrame(paintOnce);
    setTimeout(() => { paintOnce(); window.__shotReady = true; }, 1800);
  });
}

function runGame() {
  // v4: start the real car models loading behind the title screen, so
  // they are usually ready by the time Leo gets in a car.
  loadCarModels();
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
      "New in v3: Marin's Armory, run by Gus Ferraro — buy the Bay Pistol, the Boomstick shotgun or the Harbor Rifle, and pick your gun in the weapon chooser (Tab or B). Vinyl Bay Records and Record Row are new on the map too.",
      "New in v4: real low-poly cars — Leo's orange Comet 01 (every sedan, with spinning wheels and steering) and the police Interceptor with its flashing light bar, both from a free-to-use cars pack. Comet Motors, the dealership, is on the block south-east of the plaza. Press L for headlights.",
      'WASD move / drive · Mouse drag to look · Click to shoot · E enter a car · F interact · Q punch · Space jump · H horn · R restart · V camera',
      'Shift run · P pause · C save · M mute · T reload · 1/2/3 switch gun · Tab weapon chooser · L headlights',
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
    // The weapon chooser eats its own keys: Tab/B or Esc closes it, and
    // 1/2/3 equip straight from the panel. The world stays frozen while
    // it is open — police and missions wait for Leo.
    if (chooserOpen) {
      if (actions & (ACTION_CHOOSER | ACTION_PAUSE)) closeChooser();
      return;
    }
    if (actions & ACTION_CHOOSER && screen === SCREEN_PLAY) {
      openChooser('chooser');
      return;
    }
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      world.state.message = muted ? 'Sound muted' : 'Sound on';
      world.state.messageTimer = 2;
    }
    if (actions & ACTION_HORN && screen === SCREEN_PLAY && world.state.player.inCar) audio.horn();
    if (actions & ACTION_LIGHTS && screen === SCREEN_PLAY) {
      world.state.headlights = !world.state.headlights;
      audio.click();
      world.state.message = world.state.headlights ? 'Headlights on' : 'Headlights off';
      world.state.messageTimer = 2;
    }
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
    // While the weapon chooser is open the world is frozen — but 1/2/3
    // still equip straight from the panel.
    if (chooserOpen) {
      const slot = input.takeWeaponSlot();
      if (slot) {
        const id = ['pistol', 'shotgun', 'rifle'][slot - 1];
        if (id && world.equipGun(id)) renderChooser();
      }
      input.takeReload();
      return;
    }
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
      weaponSlot: input.takeWeaponSlot(),
      reload: input.takeReload(),
      cameraYaw,
    };
    input.takeMouseClick();
    const events = world.step(STEP, controls);
    if (world.state.armoryOpen && !chooserOpen) openChooser('shop');
    if (events & EVENT_SHOT) audio.shoot(world.state.weapons.current);
    if (events & EVENT_BUY) audio.buy();
    if (events & EVENT_RELOAD) audio.reload();
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
    audio.engine(world.state.player.speed, !!world.state.player.inCar, world.state.player.inCar?.model);
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
  if (armoryCloseBtn) armoryCloseBtn.addEventListener('click', () => closeChooser());
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
