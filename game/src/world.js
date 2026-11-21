// The simulation of Solara Bay: Leo, the traffic, the crowd, the
// police, the five missions, the taxi fares, the sun coins and the
// armory. Pure logic — no drawing, no sound, no DOM — so the same
// step() runs the live game, the screenshot scenes and the play-tests.
// One fixed step (1/60 s) keeps the game deterministic: the same
// inputs on the same seed always play out the same way.
// Leo starts at Solara Plaza with $120. The first mission is
// Borrowed Wheels: steal any car, drive it to the docks.
import { ARMORY, CAR_MODELS, CHARACTERS, COLLECTIBLES, CROWD, MISSIONS, PALETTE, PLAYER, POLICE, SAVE_KEY, TAXI, UNLOCKS, VEHICLES, WANTED, WEAPONS, WORLD } from './config.js';
import { buildingAt, clampToWorld, createCity, nearestRoadPoint, pushOutOfBuilding } from './city.js';
import { nextId, pick, range, weightedPick } from './random.js';
import { buyAmmo, buyWeapon, createWeaponState, equipWeapon, finishReload, fireWeapon, startReload } from './armory.js';

export const EVENT_MISSION = 1;
export const EVENT_BUSTED = 2;
export const EVENT_CASH = 4;
export const EVENT_SHOT = 8;
export const EVENT_CRASH = 16;
export const EVENT_STEAL = 32;
export const EVENT_TAXI = 64;
export const EVENT_RACE = 128;
export const EVENT_COLLECT = 256;
export const EVENT_UNLOCK = 512;
export const EVENT_BUY = 1024;
export const EVENT_RELOAD = 2048;

// The three courier drops, in order: Marina Bank, Bay Hospital, North Shops.
const DROP_POINTS = [
  { x: 200, z: 120, name: 'Marina Bank' },
  { x: 440, z: 280, name: 'Bay Hospital' },
  { x: 120, z: 120, name: 'North Shops' },
];

// Where a taxi fare can end: hospital, docks, harbor, cabana, plaza.
const TAXI_DESTS = [
  { x: 440, z: 200, name: 'Bay Hospital' },
  { x: 580, z: 420, name: 'Docks' },
  { x: 120, z: 80, name: 'Harbor District' },
  { x: 320, z: 462, name: 'Beach Cabana' },
  { x: 280, z: 200, name: 'Solara Plaza' },
];

const PED_NAMES = ['Ana', 'Bo', 'Cleo', 'Dante', 'Elsa', 'Finn', 'Gita', 'Hugo', 'Ivy', 'Jonas', 'Kira', 'Luca', 'Mina', 'Nico', 'Opal', 'Pablo', 'Rosa', 'Sami', 'Tara', 'Umar', 'Vera', 'Wes', 'Yara', 'Zeke'];

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function angleTo(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

// Turn `from` toward `to` by at most `maxTurn` radians this frame,
// taking the short way around the circle.
function turnToward(from, to, maxTurn) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > maxTurn) return from + maxTurn;
  if (diff < -maxTurn) return from - maxTurn;
  return to;
}

export function createWorld(random) {
  const city = createCity(random);
  const state = {
    city,
    time: 0,
    cash: 120,
    wanted: 0,
    wantedTimer: 0,
    crimeCooldown: 0,
    missionIndex: 0,
    missionStage: 0,
    dropsDone: 0,
    raceIndex: 0,
    raceTimer: 0,
    taxiDone: 0,
    coinsCollected: 0,
    unlocked: [],
    missionTarget: null,
    missionText: MISSIONS[0].objective,
    missionTitle: MISSIONS[0].title,
    message: '',
    messageTimer: 0,
    busted: false,
    player: null,
    cars: [],
    peds: [],
    npcs: [],
    police: [],
    bullets: [],
    particles: [],
    pickups: [],
    coins: [],
    taxi: null,
    taxiTimer: 0,
    weapons: createWeaponState(),
    armoryOpen: false,
    armoryHintTimer: 0,
    headlights: false,
  };

  // ---- Vehicles -------------------------------------------------------
  function statsOf(car) {
    return VEHICLES[car.vtype] || VEHICLES.sedan;
  }

  // Which real model a car renders as: 'comet' for Leo's orange Comet 01
  // (every sedan), 'police' for the Interceptor (every police car), null
  // for the blocky truck, sports car and motorcycle. The model survives
  // a steal (kind changes to 'player', model stays), so Leo keeps
  // driving whatever he took.
  function buildCar(x, z, heading, color, kind, vtype) {
    const vt = vtype || 'sedan';
    const model = kind === 'police' ? 'police' : (vt === 'sedan' ? 'comet' : null);
    return {
      id: nextId(random),
      x, z, heading,
      speed: 0,
      cruise: range(random, 9, 15),
      color, kind: kind || 'traffic', vtype: vt, model,
      parked: false,
      axis: Math.abs(Math.sin(heading)) < 0.5 ? 'z' : 'x',
      dir: Math.random() < 0.5 ? 1 : -1,
    };
  }

  function randomVtype() {
    return weightedPick(random, [[60, 'sedan'], [20, 'truck'], [10, 'sports'], [10, 'bike']]);
  }

  function carColorFor(vtype) {
    if (vtype === 'sports') return PALETTE.sportsCar;
    if (vtype === 'truck') return PALETTE.truckCar;
    if (vtype === 'bike') return PALETTE.bikeCar;
    return pick(random, PALETTE.trafficCar);
  }

  function spawnTrafficCar() {
    const alongX = Math.random() < 0.5;
    const vt = randomVtype();
    let x;
    let z;
    let heading;
    if (alongX) {
      z = pick(random, [40, 120, 200, 280, 360, 440]);
      x = range(random, 30, 610);
      heading = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = pick(random, [40, 120, 200, 280, 360, 440, 520, 600]);
      z = range(random, 30, 450);
      heading = Math.random() < 0.5 ? 0 : Math.PI;
    }
    const car = buildCar(x, z, heading, carColorFor(vt), 'traffic', vt);
    car.axis = alongX ? 'x' : 'z';
    car.dir = Math.sin(heading) > 0 || Math.cos(heading) > 0 ? 1 : -1;
    return car;
  }

  function spawnParkedCar(x, z, heading, vtype) {
    const car = buildCar(x, z, heading, carColorFor(vtype || 'sedan'), 'parked', vtype || 'sedan');
    car.parked = true;
    return car;
  }

  // ---- People ---------------------------------------------------------
  function spawnPed(x, z) {
    return {
      x, z,
      heading: random() * Math.PI * 2,
      speed: range(random, 2, 3.5),
      color: pick(random, CROWD.skins),
      shirt: pick(random, CROWD.shirts),
      pants: pick(random, CROWD.pants),
      height: pick(random, CROWD.heights),
      hat: pick(random, CROWD.hats),
      name: pick(random, PED_NAMES),
      health: 100,
      police: false,
      flee: 0,
      arrestTimer: 0,
      walkPhase: random() * 6,
      wanderTimer: range(random, 1, 4),
    };
  }

  function spawnNpc(id, x, z, heading) {
    const def = CHARACTERS[id];
    return {
      id, name: def.name, x, z, heading,
      shirt: def.shirt, pants: def.pants, skin: def.skin,
      height: def.height, hat: def.hat, hair: def.hair,
    };
  }

  // ---- Mission bookkeeping --------------------------------------------
  function setMissionTarget() {
    const m = MISSIONS[state.missionIndex];
    if (!m) {
      state.missionTarget = null;
      state.missionTitle = 'Free roam';
      state.missionText = 'Free roam — taxi fares and sun coins around Solara Bay';
      return;
    }
    state.missionTitle = m.title;
    if (state.missionIndex === 0) {
      state.missionTarget = state.missionStage === 0
        ? { x: state.player.x, z: state.player.z, name: 'Steal a car' }
        : { ...city.places.docks, name: 'Docks' };
    } else if (state.missionIndex === 1) {
      const d = DROP_POINTS[state.dropsDone];
      state.missionTarget = d ? { ...d } : null;
    } else if (state.missionIndex === 2) {
      state.missionTarget = state.missionStage === 0
        ? { ...city.places.bank, name: 'Marina Bank' }
        : { ...city.places.safehouse, name: 'Safehouse' };
    } else if (state.missionIndex === 3) {
      state.missionTarget = { ...city.racePoints[state.raceIndex] };
    } else if (state.missionIndex === 4) {
      state.missionTarget = state.missionStage === 0
        ? { ...city.places.cabana, name: 'Beach Cabana' }
        : { x: state.player.x, z: state.player.z, name: 'Stay hidden' };
    }
    state.missionText = m.objective;
  }

  function missionProgress() {
    if (state.missionIndex === 1) return `${state.dropsDone}/${MISSIONS[1].drops} packages`;
    if (state.missionIndex === 3) {
      return `${state.raceIndex}/${MISSIONS[3].checkpoints} checkpoints · ${Math.max(0, Math.ceil(state.raceTimer))}s left`;
    }
    if (state.missionIndex === 4 && state.missionStage === 1) return `Wanted ${state.wanted}★ — stay hidden`;
    if (state.missionIndex >= MISSIONS.length) {
      return `Taxi fares ${state.taxiDone} · Coins ${state.coinsCollected}/${COLLECTIBLES.count}`;
    }
    return '';
  }

  function checkUnlocks() {
    let events = 0;
    for (const u of UNLOCKS) {
      if (state.unlocked.includes(u.id)) continue;
      if (state.cash < u.cash) continue;
      state.unlocked.push(u.id);
      state.message = u.label;
      state.messageTimer = 5;
      events |= EVENT_UNLOCK;
      if (u.id === 'sports') {
        const car = buildCar(city.places.garage.x, city.places.garage.z, Math.PI / 2, PALETTE.sportsCar, 'parked', 'sports');
        car.parked = true;
        state.cars.push(car);
      }
    }
    return events;
  }

  // ---- Reset / save / load --------------------------------------------
  function reset() {
    state.time = 0;
    state.cash = 120;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.crimeCooldown = 0;
    state.missionIndex = 0;
    state.missionStage = 0;
    state.dropsDone = 0;
    state.raceIndex = 0;
    state.raceTimer = 0;
    state.taxiDone = 0;
    state.coinsCollected = 0;
    state.unlocked = [];
    state.message = '';
    state.messageTimer = 0;
    state.busted = false;
    state.cars = [];
    state.peds = [];
    state.police = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    state.taxi = null;
    state.taxiTimer = 6;
    state.weapons = createWeaponState();
    state.armoryOpen = false;
    state.armoryHintTimer = 0;
    state.headlights = false;

    state.player = {
      x: city.places.start.x,
      z: city.places.start.z,
      y: 0, vy: 0,
      heading: 0,
      speed: 0,
      health: PLAYER.health,
      inCar: null,
      fireCooldown: 0,
      invulnerable: 0,
    };

    // The named cast, standing where the story expects them.
    state.npcs = [
      spawnNpc('mara', 280, 196, Math.PI),
      spawnNpc('dario', 204, 128, 0),
      spawnNpc('reyes', 440, 196, Math.PI),
      spawnNpc('gus', 236, 166, Math.PI),
    ];

    // Traffic on the roads, parked cars on the curbs, and two Comets on
    // the Comet Motors forecourt for Leo to borrow.
    for (let i = 0; i < 14; i += 1) state.cars.push(spawnTrafficCar());
    for (const spot of city.places.dealershipSpots) {
      state.cars.push(spawnParkedCar(spot.x, spot.z, Math.PI / 2, 'sedan'));
    }
    for (let i = 0; i < 4; i += 1) {
      const road = nearestRoadPoint(range(random, 60, 580), range(random, 60, 420));
      state.cars.push(spawnParkedCar(road.x + 9, road.z + 9, Math.PI / 2, randomVtype()));
    }
    for (let i = 0; i < 24; i += 1) {
      state.peds.push(spawnPed(range(random, 30, 610), range(random, 30, 450)));
    }

    // Eight sun coins along the beach.
    state.coins = [];
    for (let i = 0; i < COLLECTIBLES.count; i += 1) {
      state.coins.push({
        x: 60 + i * 68 + range(random, -12, 12),
        z: range(random, 452, 468),
        taken: false,
      });
    }
    setMissionTarget();
    state.message = 'Welcome to Solara Bay — Mara Voss is waiting at the plaza';
    state.messageTimer = 4;
  }

  function save() {
    try {
      const p = state.player;
      const data = {
        cash: state.cash,
        missionIndex: state.missionIndex,
        missionStage: state.missionStage,
        dropsDone: state.dropsDone,
        raceIndex: state.raceIndex,
        taxiDone: state.taxiDone,
        coinsCollected: state.coinsCollected,
        unlocked: state.unlocked,
        x: p.x, z: p.z, health: p.health, time: state.time,
        weapons: {
          owned: state.weapons.owned,
          current: state.weapons.current,
          ammo: state.weapons.ammo,
        },
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      state.message = 'Game saved';
      state.messageTimer = 2;
      return true;
    } catch {
      return false;
    }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.cash = data.cash ?? 120;
      state.missionIndex = data.missionIndex ?? 0;
      state.missionStage = data.missionStage ?? 0;
      state.dropsDone = data.dropsDone ?? 0;
      state.raceIndex = data.raceIndex ?? 0;
      state.taxiDone = data.taxiDone ?? 0;
      state.coinsCollected = data.coinsCollected ?? 0;
      state.unlocked = data.unlocked ?? [];
      state.player.x = data.x ?? state.player.x;
      state.player.z = data.z ?? state.player.z;
      state.player.health = data.health ?? PLAYER.health;
      state.time = data.time ?? 0;
      if (data.weapons) {
        state.weapons.owned = (data.weapons.owned || []).filter((id) => WEAPONS[id]);
        state.weapons.current = WEAPONS[data.weapons.current]
          ? data.weapons.current
          : (state.weapons.owned[0] || null);
        for (const id of state.weapons.owned) {
          const a = data.weapons.ammo?.[id];
          if (a) state.weapons.ammo[id] = { mag: a.mag ?? 0, reserve: a.reserve ?? 0 };
        }
      }
      if (state.missionIndex === 3) state.raceTimer = MISSIONS[3].timeLimit;
      for (let i = 0; i < state.coinsCollected && i < state.coins.length; i += 1) {
        state.coins[i].taken = true;
      }
      setMissionTarget();
      return true;
    } catch {
      return false;
    }
  }

  function hasSave() {
    try { return !!window.localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  // ---- Wanted / police --------------------------------------------------
  function addWanted(amount) {
    if (state.crimeCooldown > 0) return;
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.wantedTimer = 0;
    state.crimeCooldown = 2;
  }

  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      const d = dist2(x, z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function spawnPoliceCar() {
    const p = state.player;
    const angle = random() * Math.PI * 2;
    const x = p.x + Math.cos(angle) * POLICE.spawnDistance;
    const z = p.z + Math.sin(angle) * POLICE.spawnDistance;
    const road = nearestRoadPoint(
      Math.max(20, Math.min(620, x)),
      Math.max(20, Math.min(460, z)),
    );
    const car = buildCar(road.x, road.z, angleTo(road.x, road.z, p.x, p.z), PALETTE.policeCar, 'police', 'sedan');
    car.speed = 10;
    state.cars.push(car);
    state.police.push({ car, kind: 'car' });
    return car;
  }

  function spawnPoliceFoot() {
    const p = state.player;
    const angle = random() * Math.PI * 2;
    const x = Math.max(20, Math.min(620, p.x + Math.cos(angle) * 40));
    const z = Math.max(20, Math.min(460, p.z + Math.sin(angle) * 40));
    const ped = spawnPed(x, z);
    ped.police = true;
    ped.shirt = 0x1a2a6b;
    ped.pants = 0x1a2a6b;
    ped.hat = 'police';
    ped.name = 'Officer Reyes';
    ped.speed = POLICE.footSpeed;
    state.peds.push(ped);
    state.police.push({ ped, kind: 'foot' });
    return ped;
  }

  function ensurePolice() {
    if (state.wanted <= 0) {
      // Heat gone: the units stand down and drive off (despawned).
      for (const u of state.police) {
        if (u.car) {
          const i = state.cars.indexOf(u.car);
          if (i >= 0) state.cars.splice(i, 1);
        }
        if (u.ped) {
          const i = state.peds.indexOf(u.ped);
          if (i >= 0) state.peds.splice(i, 1);
        }
      }
      state.police = [];
      return;
    }
    const carUnits = state.police.filter((u) => u.kind === 'car').length;
    const wantedCars = Math.min(state.wanted, POLICE.maxCars);
    for (let i = carUnits; i < wantedCars; i += 1) spawnPoliceCar();
    if (state.wanted >= 2) {
      const footUnits = state.police.filter((u) => u.kind === 'foot').length;
      for (let i = footUnits; i < 2; i += 1) spawnPoliceFoot();
    }
  }

  function bustPlayer() {
    const p = state.player;
    if (p.inCar) {
      p.inCar.speed = 0;
      p.inCar.kind = 'parked';
      p.inCar.parked = true;
      p.inCar = null;
    }
    p.x = city.places.hospital.x;
    p.z = city.places.hospital.z;
    p.y = 0;
    p.vy = 0;
    p.health = PLAYER.health;
    p.invulnerable = 3;
    state.cash = Math.max(0, state.cash - 100);
    state.wanted = 0;
    state.wantedTimer = 0;
    state.police = [];
    state.busted = true;
    if (state.missionIndex === 3) state.raceTimer = MISSIONS[3].timeLimit;
    state.message = 'Busted! Woke up at Bay Hospital -$100';
    state.messageTimer = 4;
  }

  // ---- Armory -----------------------------------------------------------
  function nearArmory() {
    const p = state.player;
    return dist2(p.x, p.z, ARMORY.door.x, ARMORY.door.z) < ARMORY.interactRange * ARMORY.interactRange;
  }

  function openArmory() {
    state.armoryOpen = true;
    return 0;
  }

  function closeArmory() {
    state.armoryOpen = false;
  }

  function buyGun(id) {
    const r = buyWeapon({ state }, id);
    return r.ok ? EVENT_BUY : 0;
  }

  function buyGunAmmo(id) {
    const r = buyAmmo({ state }, id);
    return r.ok ? EVENT_BUY : 0;
  }

  function equipGun(id) {
    equipWeapon({ state }, id);
    return 0;
  }

  // ---- Missions -----------------------------------------------------------
  function completeMission() {
    const m = MISSIONS[state.missionIndex];
    if (!m) return EVENT_MISSION;
    state.cash += m.reward;
    state.missionIndex += 1;
    state.missionStage = 0;
    state.dropsDone = 0;
    state.raceIndex = 0;
    if (state.missionIndex === 3) state.raceTimer = MISSIONS[3].timeLimit;
    setMissionTarget();
    state.message = `Mission complete — ${m.title} +$${m.reward}`;
    state.messageTimer = 4;
    return EVENT_MISSION;
  }

  function checkMission() {
    const p = state.player;
    const target = state.missionTarget;
    let events = 0;
    if (state.missionIndex === 0) {
      if (state.missionStage === 0 && p.inCar) {
        state.missionStage = 1;
        setMissionTarget();
        state.message = 'Car stolen — get to the docks marker';
        state.messageTimer = 3;
      } else if (state.missionStage === 1 && target && dist2(p.x, p.z, target.x, target.z) < 10 * 10) {
        events |= completeMission();
      }
    } else if (state.missionIndex === 1) {
      if (target && dist2(p.x, p.z, target.x, target.z) < 10 * 10) {
        state.dropsDone += 1;
        state.cash += 80;
        state.message = `Package delivered +$80 (${state.dropsDone}/${MISSIONS[1].drops})`;
        state.messageTimer = 3;
        events |= EVENT_CASH;
        if (state.dropsDone >= MISSIONS[1].drops) events |= completeMission();
        else setMissionTarget();
      }
    } else if (state.missionIndex === 2) {
      if (state.missionStage === 1 && target && dist2(p.x, p.z, target.x, target.z) < 10 * 10) {
        events |= completeMission();
      }
    } else if (state.missionIndex === 3) {
      if (target && dist2(p.x, p.z, target.x, target.z) < 12 * 12) {
        state.raceIndex += 1;
        state.message = `Checkpoint ${state.raceIndex}/${MISSIONS[3].checkpoints}!`;
        state.messageTimer = 2;
        events |= EVENT_RACE;
        if (state.raceIndex >= MISSIONS[3].checkpoints) events |= completeMission();
        else setMissionTarget();
      }
    } else if (state.missionIndex === 4) {
      if (state.missionStage === 0 && target && dist2(p.x, p.z, target.x, target.z) < 10 * 10 && state.wanted >= 3) {
        state.missionStage = 1;
        setMissionTarget();
        state.message = 'Made it — now lose the heat and stay hidden';
        state.messageTimer = 4;
      } else if (state.missionStage === 1 && state.wanted === 0) {
        events |= completeMission();
      }
    }
    return events;
  }

  // ---- Per-frame updates --------------------------------------------------
  function updateTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      car.speed = car.cruise;
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const out = car.axis === 'x' ? (nx < 24 || nx > 616) : (nz < 24 || nz > 456);
      if (out) {
        car.heading += Math.PI;
        car.dir *= -1;
        continue;
      }
      if (!buildingAt(city, nx, nz, 2.4)) {
        car.x = nx;
        car.z = nz;
      }
    }
  }

  function updatePeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.health <= 0) continue;
      ped.walkPhase += dt * ped.speed * 2;
      if (ped.flee > 0) {
        ped.flee -= dt;
        const away = angleTo(p.x, p.z, ped.x, ped.z);
        ped.heading = away;
        ped.x += Math.sin(away) * 6 * dt;
        ped.z += Math.cos(away) * 6 * dt;
      } else {
        ped.wanderTimer -= dt;
        if (ped.wanderTimer <= 0) {
          ped.heading = random() * Math.PI * 2;
          ped.wanderTimer = range(random, 2, 5);
        }
        ped.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
      }
      pushOutOfBuilding(city, ped, 0.9);
      clampToWorld(ped, 1);
    }
  }

  function updatePolice(dt) {
    const p = state.player;
    let events = 0;
    for (const u of state.police) {
      if (u.car) {
        const car = u.car;
        const wantedHeading = angleTo(car.x, car.z, p.x, p.z);
        car.heading = turnToward(car.heading, wantedHeading, 2.6 * dt);
        const d = Math.sqrt(dist2(car.x, car.z, p.x, p.z));
        car.speed = d > 12 ? POLICE.chaseSpeed : Math.max(6, POLICE.chaseSpeed * 0.4);
        const nx = car.x + Math.sin(car.heading) * car.speed * dt;
        const nz = car.z + Math.cos(car.heading) * car.speed * dt;
        if (!buildingAt(city, nx, nz, 2.4)) {
          car.x = nx;
          car.z = nz;
        } else {
          car.heading += 0.6 * dt;
        }
        clampToWorld(car, 3);
        // Ramming an on-foot Leo hurts him; getting caught ends the run.
        if (!p.inCar && d < 2.6) {
          if (p.invulnerable <= 0) {
            p.health -= 20;
            p.invulnerable = 1;
            if (p.health <= 0) {
              bustPlayer();
              events |= EVENT_BUSTED;
            }
          }
        }
      } else if (u.ped) {
        const ped = u.ped;
        if (ped.health <= 0) continue;
        const d = Math.sqrt(dist2(ped.x, ped.z, p.x, p.z));
        ped.heading = angleTo(ped.x, ped.z, p.x, p.z);
        ped.walkPhase += dt * ped.speed * 2;
        if (d > POLICE.arrestRange) {
          ped.x += Math.sin(ped.heading) * POLICE.footSpeed * dt;
          ped.z += Math.cos(ped.heading) * POLICE.footSpeed * dt;
          ped.arrestTimer = Math.max(0, ped.arrestTimer - dt);
        } else if (!p.inCar) {
          ped.arrestTimer += dt;
          if (ped.arrestTimer >= POLICE.arrestTime) {
            bustPlayer();
            events |= EVENT_BUSTED;
          }
        }
        pushOutOfBuilding(city, ped, 0.9);
        clampToWorld(ped, 1);
      }
    }
    return events;
  }

  function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      const speed = b.speed || 70;
      b.x += b.dx * speed * dt;
      b.y += b.dy * speed * dt;
      b.z += b.dz * speed * dt;
      b.life -= dt;
      let hit = b.life <= 0;
      if (!hit && buildingAt(city, b.x, b.z, 0.5)) {
        hit = true;
        state.particles.push({ x: b.x, y: b.y, z: b.z, vx: 0, vy: 1, vz: 0, life: 0.2, color: 0xffe14d, size: 0.4 });
      }
      if (!hit) {
        for (const ped of state.peds) {
          if (ped.health > 0 && dist2(b.x, b.z, ped.x, ped.z) < 1.6 * 1.6 && Math.abs(b.y - 1.2) < 1.4) {
            ped.health -= b.damage || PLAYER.bulletDamage;
            ped.flee = 4;
            if (ped.police) addWanted(1);
            hit = true;
            break;
          }
        }
      }
      if (hit) state.bullets.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
  }

  function updateTaxi(dt) {
    // Fares open up after the heist, once per cooldown.
    if (state.missionIndex < 3) return 0;
    if (!state.taxi) {
      state.taxiTimer -= dt;
      if (state.taxiTimer > 0) return 0;
      const stands = [city.places.taxiStand, city.places.taxiStand2, city.places.taxiStand3];
      const pickup = pick(random, stands);
      const dest = pick(random, TAXI_DESTS.filter((d) => dist2(d.x, d.z, pickup.x, pickup.z) > 100 * 100));
      state.taxi = {
        pickup, dest,
        fare: Math.floor(range(random, TAXI.fareMin, TAXI.fareMax)),
        pickedUp: false,
      };
      state.message = `Taxi fare waiting at ${pickup.name} — reach the yellow marker`;
      state.messageTimer = 4;
      return 0;
    }
    const p = state.player;
    const taxi = state.taxi;
    if (!taxi.pickedUp) {
      if (dist2(p.x, p.z, taxi.pickup.x, taxi.pickup.z) < 6 * 6) {
        taxi.pickedUp = true;
        state.message = `Fare picked up — take them to ${taxi.dest.name} ($${taxi.fare})`;
        state.messageTimer = 3;
        return EVENT_TAXI;
      }
    } else if (dist2(p.x, p.z, taxi.dest.x, taxi.dest.z) < 8 * 8) {
      state.cash += taxi.fare;
      state.taxiDone += 1;
      state.message = `Fare complete +$${taxi.fare}`;
      state.messageTimer = 3;
      state.taxi = null;
      state.taxiTimer = 8;
      return EVENT_TAXI;
    }
    return 0;
  }

  function updateCoins() {
    const p = state.player;
    for (const coin of state.coins) {
      if (coin.taken) continue;
      if (dist2(p.x, p.z, coin.x, coin.z) < 2 * 2) {
        coin.taken = true;
        state.coinsCollected += 1;
        state.cash += COLLECTIBLES.value;
        state.message = `Sun coin! +$${COLLECTIBLES.value} (${state.coinsCollected}/${COLLECTIBLES.count})`;
        state.messageTimer = 3;
        return EVENT_COLLECT;
      }
    }
    return 0;
  }

  // ---- The main step ------------------------------------------------------
  function step(dt, controls) {
    let events = 0;
    state.time += dt;
    if (state.crimeCooldown > 0) state.crimeCooldown -= dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    const p = state.player;
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (p.invulnerable > 0) p.invulnerable -= dt;

    // Wanted decay: the timer only advances while no police unit is close
    // enough to see Leo — hide behind the city to lose the heat.
    if (state.wanted > 0) {
      const policeNear = state.police.some((u) => {
        const e = u.car || u.ped;
        return e && dist2(p.x, p.z, e.x, e.z) < POLICE.hiddenDistance * POLICE.hiddenDistance;
      });
      if (policeNear) {
        state.wantedTimer = 0;
      } else {
        state.wantedTimer += dt;
        if (state.wantedTimer > WANTED.decaySeconds) {
          state.wanted = 0;
          state.wantedTimer = 0;
          state.message = 'You lost the heat';
          state.messageTimer = 3;
        }
      }
    }
    ensurePolice();

    // Race timer.
    if (state.missionIndex === 3) {
      state.raceTimer -= dt;
      if (state.raceTimer <= 0) {
        state.raceIndex = 0;
        state.raceTimer = MISSIONS[3].timeLimit;
        setMissionTarget();
        state.message = 'Race failed — the timer ran out. Try again!';
        state.messageTimer = 4;
      }
    }

    // --- Player movement (camera-relative) ---
    const camSin = Math.sin(controls.cameraYaw || 0);
    const camCos = Math.cos(controls.cameraYaw || 0);
    const fwdX = -camSin;
    const fwdZ = -camCos;
    const rightX = camCos;
    const rightZ = -camSin;
    const mx = controls.moveX || 0;
    const my = controls.moveY || 0;
    let wx = fwdX * -my + rightX * mx;
    let wz = fwdZ * -my + rightZ * mx;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }

    if (p.inCar) {
      const car = p.inCar;
      const stats = statsOf(car);
      const accelInput = -my;
      const steerInput = mx;
      car.speed += accelInput * stats.accel * dt;
      if (accelInput === 0 && car.speed !== 0) car.speed -= Math.sign(car.speed) * stats.drag * 8 * dt;
      if (Math.abs(car.speed) < 0.5 && accelInput === 0) car.speed = 0;
      car.speed = Math.max(-stats.reverseMax, Math.min(stats.maxSpeed, car.speed));
      const steerAmount = steerInput * stats.steer * dt * Math.min(1, Math.abs(car.speed) / 12 + 0.25) * Math.sign(car.speed || 1);
      car.heading += steerAmount;
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const radius = car.vtype === 'bike' ? 1.4 : 2.4;
      if (!buildingAt(city, nx, nz, radius)) {
        car.x = nx;
        car.z = nz;
      } else {
        car.speed *= -0.3;
        events |= EVENT_CRASH;
      }
      clampToWorld(car, 3);
      p.x = car.x;
      p.z = car.z;
      p.heading = car.heading;
      p.speed = car.speed;
      if (Math.abs(car.speed) > 20 && random() < dt * 2) {
        state.particles.push({ x: car.x, y: 0.3, z: car.z, vx: 0, vy: 1, vz: 0, life: 0.5, color: 0x888888, size: 0.5 });
      }
    } else {
      const speed = controls.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      p.x += wx * speed * dt;
      p.z += wz * speed * dt;
      p.speed = len > 0 ? speed : 0;
      if (len > 0) p.heading = Math.atan2(wx, wz);
      pushOutOfBuilding(city, p, 0.9);
      clampToWorld(p, 1);
      if (controls.jump && p.y === 0) p.vy = PLAYER.jumpSpeed;
      p.vy -= 22 * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.y === 0) p.vy = 0;
    }

    // --- Enter / exit car ---
    if (controls.enter) {
      if (p.inCar) {
        const car = p.inCar;
        car.speed = 0;
        p.inCar = null;
        p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 3;
        p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 3;
      } else {
        const car = nearestCar(p.x, p.z, 5);
        if (car) {
          const wasParked = car.kind === 'parked' || car.kind === 'traffic';
          p.inCar = car;
          car.parked = false;
          car.kind = 'player';
          if (wasParked) {
            addWanted(1);
            const label = car.model && CAR_MODELS[car.model]
              ? CAR_MODELS[car.model].label
              : VEHICLES[car.vtype].label;
            state.message = `${label} stolen — the cops noticed!`;
            state.messageTimer = 3;
            events |= EVENT_STEAL;
          }
        }
      }
    }

    // --- Interact (mission grab / armory door) ---
    if (controls.interact) {
      if (nearArmory()) {
        openArmory();
      } else if (state.missionIndex === 2 && state.missionStage === 0) {
        const d = Math.sqrt(dist2(p.x, p.z, city.places.bank.x, city.places.bank.z));
        if (d < 9) {
          state.missionStage = 1;
          addWanted(3);
          state.cash += 200;
          setMissionTarget();
          state.message = 'Cash grabbed! Lose the heat, reach the safehouse';
          state.messageTimer = 4;
          events |= EVENT_CASH;
        }
      }
    }

    // --- Weapon switching (1/2/3) and reload (T) ---
    if (controls.weaponSlot) {
      const id = ['pistol', 'shotgun', 'rifle'][controls.weaponSlot - 1];
      if (id) equipGun(id);
    }
    if (controls.reload) {
      if (startReload({ state })) events |= EVENT_RELOAD;
    }
    const w = state.weapons;
    if (w.reloading > 0) {
      w.reloading -= dt;
      if (w.reloading <= 0) finishReload({ state });
    }
    if (w.muzzle > 0) w.muzzle -= dt;

    // --- Punch / shoot ---
    if (controls.punch && !p.inCar) {
      for (const ped of state.peds) {
        if (!ped.police && dist2(p.x, p.z, ped.x, ped.z) < 3 * 3) {
          ped.health -= PLAYER.punchDamage;
          ped.flee = 3;
          if (ped.health <= 0) ped.health = 0;
        }
      }
      for (const u of state.police) {
        const e = u.ped;
        if (e && dist2(p.x, p.z, e.x, e.z) < 3 * 3) {
          e.health -= PLAYER.punchDamage;
          addWanted(1);
        }
      }
    }
    if (controls.fire && p.fireCooldown <= 0) {
      if (!state.weapons.current) {
        if (state.armoryHintTimer <= 0) {
          state.message = "No gun yet — visit Marin's Armory (F at the red shop)";
          state.messageTimer = 3;
          state.armoryHintTimer = 5;
        }
      } else {
        const fired = fireWeapon({ state });
        if (fired) {
          state.bullets.push(...fired);
          const p2 = state.player;
          state.particles.push({
            x: p2.x + Math.sin(p2.heading) * 1.4, y: 1.3,
            z: p2.z + Math.cos(p2.heading) * 1.4,
            vx: 0, vy: 0.5, vz: 0, life: 0.12, color: 0xffe14d, size: 0.7,
          });
          events |= EVENT_SHOT;
        }
      }
    }
    if (state.armoryHintTimer > 0) state.armoryHintTimer -= dt;

    updateBullets(dt);
    updateTraffic(dt);
    updatePeds(dt);
    events |= updatePolice(dt);
    updateParticles(dt);
    events |= updateTaxi(dt);
    events |= updateCoins();
    events |= checkMission();
    events |= checkUnlocks();
    return events;
  }

  reset();
  return {
    state, reset, step, save, load, hasSave, setMissionTarget,
    nearestCar, missionProgress, checkUnlocks,
    nearArmory, openArmory, closeArmory, buyGun, buyGunAmmo, equipGun,
  };
}
