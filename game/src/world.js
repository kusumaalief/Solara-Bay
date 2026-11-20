// Solara Bay v2 simulation: no drawing and no Three.js in here, just rules
// and state. The player walks or drives, traffic and pedestrians use the road
// grid, police respond to the wanted level, and five missions tell Leo's
// story. v2 adds: four vehicle types with their own handling, a timed harbor
// race and a getaway mission, a taxi side activity, beach collectibles, cash
// unlocks, named mission givers, and smarter traffic, pedestrian and police
// AI (traffic brakes for the car ahead, pedestrians flee, police ram toward
// where Leo is heading, and the wanted level only cools off while Leo is
// hidden from the police). step() advances one fixed step and returns what
// happened as flags.
import { CHARACTERS, COLLECTIBLES, CROWD, MISSIONS, PALETTE, PLAYER, POLICE, SAVE_KEY, TAXI, UNLOCKS, VEHICLES, WANTED, WORLD } from './config.js';
import { buildingAt, clampToWorld, createCity, nearestRoadPoint, pushOutOfBuilding } from './city.js';
import { nextId, pick, range, weightedPick } from './random.js';

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

const DROP_POINTS = [
  { x: 200, z: 120, name: 'Marina Bank' },
  { x: 440, z: 280, name: 'Bay Hospital' },
  { x: 120, z: 120, name: 'North Shops' },
];

const PED_NAMES = ['Ana', 'Bo', 'Cleo', 'Dante', 'Elsa', 'Finn', 'Gita', 'Hugo', 'Ivy', 'Jonas', 'Kira', 'Luca', 'Mina', 'Nico', 'Opal', 'Pablo', 'Rosa', 'Sami', 'Tara', 'Umar', 'Vera', 'Wes', 'Yara', 'Zeke'];
const TAXI_DESTS = [
  { x: 440, z: 200, name: 'Bay Hospital' },
  { x: 580, z: 420, name: 'Docks' },
  { x: 120, z: 80, name: 'Harbor District' },
  { x: 320, z: 462, name: 'Beach Cabana' },
  { x: 280, z: 200, name: 'Solara Plaza' },
];

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function angleTo(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
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
  };

  function statsOf(car) {
    return VEHICLES[car.vtype] || VEHICLES.sedan;
  }

  function makeCar(x, z, heading, color, kind, vtype) {
    const vt = vtype || 'sedan';
    return {
      id: nextId(random), x, z, heading, speed: 0, cruise: range(random, 9, 15),
      color, kind: kind || 'traffic', vtype: vt, parked: false,
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

  function makePed(x, z, police) {
    return {
      x, z, heading: random() * Math.PI * 2, speed: police ? POLICE.footSpeed : range(random, 2, 4),
      color: police ? 0x1a2a6b : pick(random, CROWD.skins),
      shirt: police ? 0x1a2a6b : pick(random, CROWD.shirts),
      pants: pick(random, CROWD.pants),
      height: pick(random, CROWD.heights),
      hat: police ? 'police' : pick(random, CROWD.hats),
      name: pick(random, PED_NAMES),
      health: 100, police: !!police, flee: 0, arrestTimer: 0, walkPhase: random() * 6,
    };
  }

  function spawnTraffic(count) {
    for (let i = 0; i < count; i += 1) {
      const onVertical = random() < 0.5;
      const road = onVertical
        ? pick(random, [40, 120, 200, 280, 360, 440, 520, 600])
        : pick(random, [40, 120, 200, 280, 360, 440]);
      const along = range(random, 20, onVertical ? WORLD.height - 20 : WORLD.width - 20);
      const vtype = randomVtype();
      const car = makeCar(
        onVertical ? road + (random() < 0.5 ? -3 : 3) : along,
        onVertical ? along : road + (random() < 0.5 ? -3 : 3),
        onVertical ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        carColorFor(vtype), 'traffic', vtype,
      );
      car.speed = range(random, 9, 15);
      car.axis = onVertical ? 'z' : 'x';
      state.cars.push(car);
    }
  }

  function spawnParked(count) {
    for (let i = 0; i < count; i += 1) {
      const p = nearestRoadPoint(range(random, 60, 580), range(random, 60, 420));
      const vtype = randomVtype();
      const car = makeCar(p.x + (random() < 0.5 ? -9 : 9), p.z + (random() < 0.5 ? -9 : 9), random() * Math.PI * 2, carColorFor(vtype), 'parked', vtype);
      car.parked = true;
      state.cars.push(car);
    }
  }

  function spawnPeds(count) {
    for (let i = 0; i < count; i += 1) {
      const p = nearestRoadPoint(range(random, 60, 580), range(random, 60, 420));
      state.peds.push(makePed(p.x + range(random, -12, 12), p.z + range(random, -12, 12), false));
    }
  }

  function spawnNpcs() {
    state.npcs = [
      { id: 'mara', char: CHARACTERS.mara, x: city.places.start.x - 8, z: city.places.start.z + 4, heading: Math.PI / 4, walkPhase: 0 },
      { id: 'dario', char: CHARACTERS.dario, x: city.places.harbor.x + 6, z: city.places.harbor.z + 6, heading: -Math.PI / 2, walkPhase: 0 },
      { id: 'reyes', char: CHARACTERS.reyes, x: city.places.hospital.x - 6, z: city.places.hospital.z - 4, heading: Math.PI, walkPhase: 0 },
    ];
  }

  function spawnCoins() {
    state.coins = [];
    for (let i = 0; i < COLLECTIBLES.count; i += 1) {
      state.coins.push({ x: 60 + i * 68 + range(random, -12, 12), z: range(random, 452, 468), taken: false });
    }
  }

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
    if (state.missionIndex === 3) return `${state.raceIndex}/${MISSIONS[3].checkpoints} checkpoints · ${Math.max(0, Math.ceil(state.raceTimer))}s left`;
    if (state.missionIndex === 4 && state.missionStage === 1) return `Wanted ${state.wanted}★ — stay hidden`;
    if (state.missionIndex >= MISSIONS.length) return `Taxi fares ${state.taxiDone} · Coins ${state.coinsCollected}/${COLLECTIBLES.count}`;
    return '';
  }

  function checkUnlocks() {
    let events = 0;
    for (const u of UNLOCKS) {
      if (state.unlocked.includes(u.id)) continue;
      if (state.cash >= u.cash) {
        state.unlocked.push(u.id);
        state.message = u.label;
        state.messageTimer = 5;
        events |= EVENT_UNLOCK;
        if (u.id === 'sports') {
          const car = makeCar(city.places.garage.x, city.places.garage.z, Math.PI / 2, PALETTE.sportsCar, 'parked', 'sports');
          car.parked = true;
          state.cars.push(car);
        }
      }
    }
    return events;
  }

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
    state.busted = false;
    state.cars = [];
    state.peds = [];
    state.npcs = [];
    state.police = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    state.coins = [];
    state.taxi = null;
    state.taxiTimer = 0;
    state.player = {
      x: city.places.start.x, z: city.places.start.z, y: 0, vy: 0,
      heading: 0, speed: 0, health: PLAYER.health, inCar: null, fireCooldown: 0, invulnerable: 0,
    };
    spawnTraffic(16);
    spawnParked(10);
    spawnPeds(24);
    spawnNpcs();
    spawnCoins();
    // Leo's own starter car, parked by the plaza.
    const starter = makeCar(city.places.start.x + 12, city.places.start.z + 6, Math.PI / 2, PALETTE.playerCar, 'player', 'sedan');
    starter.parked = true;
    state.cars.push(starter);
    setMissionTarget();
    state.message = 'Welcome to Solara Bay — Mara Voss is waiting at the plaza';
    state.messageTimer = 4;
  }

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
    const road = nearestRoadPoint(Math.max(20, Math.min(620, x)), Math.max(20, Math.min(460, z)));
    const car = makeCar(road.x, road.z, 0, PALETTE.policeCar, 'police', 'sedan');
    car.speed = 10;
    state.cars.push(car);
    state.police.push({ car, kind: 'car' });
  }

  function spawnPoliceFoot() {
    const p = state.player;
    const angle = random() * Math.PI * 2;
    const ped = makePed(p.x + Math.cos(angle) * 30, p.z + Math.sin(angle) * 30, true);
    state.peds.push(ped);
    state.police.push({ ped, kind: 'foot' });
  }

  function ensurePolice() {
    const wantCars = Math.min(POLICE.maxCars, state.wanted);
    const haveCars = state.police.filter((u) => u.kind === 'car').length;
    if (state.wanted > 0 && haveCars < wantCars && random() < 0.02) spawnPoliceCar();
    const haveFoot = state.police.filter((u) => u.kind === 'foot').length;
    if (state.wanted >= 2 && haveFoot < 2 && random() < 0.01) spawnPoliceFoot();
  }

  function completeMission(cashReward) {
    const m = MISSIONS[state.missionIndex];
    state.cash += cashReward;
    state.missionIndex += 1;
    state.missionStage = 0;
    state.dropsDone = 0;
    state.raceIndex = 0;
    state.raceTimer = 0;
    if (state.missionIndex === 3) state.raceTimer = MISSIONS[3].timeLimit;
    setMissionTarget();
    state.message = `${m ? m.title : 'Mission'} complete! +$${cashReward}`;
    state.messageTimer = 4;
    let events = EVENT_MISSION;
    events |= checkUnlocks();
    return events;
  }

  function spawnTaxi() {
    const stands = [city.places.taxiStand, city.places.taxiStand2, city.places.taxiStand3];
    const pickup = pick(random, stands);
    const dest = pick(random, TAXI_DESTS.filter((d) => dist2(d.x, d.z, pickup.x, pickup.z) > 100 * 100));
    state.taxi = {
      pickup: { ...pickup }, dest,
      fare: Math.floor(range(random, TAXI.fareMin, TAXI.fareMax)),
      boarded: false,
    };
    state.message = `Taxi fare waiting at ${pickup.name} — drive there`;
    state.messageTimer = 4;
  }

  function checkMission() {
    const p = state.player;
    const t = state.missionTarget;
    if (!t || state.missionIndex >= MISSIONS.length) return 0;
    const d = Math.sqrt(dist2(p.x, p.z, t.x, t.z));
    if (state.missionIndex === 0) {
      if (state.missionStage === 0 && p.inCar) {
        state.missionStage = 1;
        setMissionTarget();
        state.message = 'Now drive to the docks marker';
        state.messageTimer = 3;
        return EVENT_CASH;
      }
      if (state.missionStage === 1 && p.inCar && d < 10) return completeMission(MISSIONS[0].reward);
    } else if (state.missionIndex === 1) {
      if (d < 9) {
        state.dropsDone += 1;
        state.cash += 80;
        if (state.dropsDone >= MISSIONS[1].drops) return completeMission(MISSIONS[1].reward);
        setMissionTarget();
        state.message = `Package delivered (${state.dropsDone}/3)`;
        state.messageTimer = 3;
        return EVENT_CASH;
      }
    } else if (state.missionIndex === 2) {
      if (state.missionStage === 1 && d < 10) return completeMission(MISSIONS[2].reward);
    } else if (state.missionIndex === 3) {
      if (d < 10) {
        state.raceIndex += 1;
        if (state.raceIndex >= MISSIONS[3].checkpoints) return completeMission(MISSIONS[3].reward);
        setMissionTarget();
        state.message = `Checkpoint ${state.raceIndex}/${MISSIONS[3].checkpoints}!`;
        state.messageTimer = 2;
        return EVENT_RACE;
      }
    } else if (state.missionIndex === 4) {
      if (state.missionStage === 0 && d < 10) {
        state.missionStage = 1;
        if (state.wanted < 3) { state.wanted = 3; state.wantedTimer = 0; }
        setMissionTarget();
        state.message = 'The heat is on! Stay hidden until it dies';
        state.messageTimer = 4;
        return EVENT_CASH;
      }
      if (state.missionStage === 1 && state.wanted === 0) return completeMission(MISSIONS[4].reward);
    }
    return 0;
  }

  function fireBullet() {
    const p = state.player;
    if (p.fireCooldown > 0 || p.inCar) return 0;
    p.fireCooldown = PLAYER.fireCooldown;
    const dir = p.heading;
    state.bullets.push({
      x: p.x, y: 1.2, z: p.z,
      dx: Math.sin(dir), dy: 0, dz: Math.cos(dir),
      life: 1.4,
    });
    return EVENT_SHOT;
  }

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
      if (policeNear) state.wantedTimer = 0;
      else {
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

    // --- Player movement ---
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
      if (!buildingAt(city, nx, nz, radius)) { car.x = nx; car.z = nz; } else { car.speed *= -0.3; events |= EVENT_CRASH; }
      clampToWorld(car, 3);
      p.x = car.x; p.z = car.z; p.heading = car.heading; p.speed = car.speed;
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
            const label = VEHICLES[car.vtype].label;
            state.message = `${label} stolen — the cops noticed!`;
            state.messageTimer = 3;
            events |= EVENT_STEAL;
          }
        }
      }
    }

    // --- Interact (mission grab / pickup) ---
    if (controls.interact) {
      if (state.missionIndex === 2 && state.missionStage === 0) {
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

    // --- Punch / shoot ---
    if (controls.punch && !p.inCar) {
      for (const ped of state.peds) {
        if (!ped.police && dist2(p.x, p.z, ped.x, ped.z) < 3 * 3) {
          ped.health -= PLAYER.punchDamage;
          ped.flee = 3;
          if (ped.health <= 0) { ped.health = 0; }
        }
      }
      for (const u of state.police) {
        const e = u.ped;
        if (e && dist2(p.x, p.z, e.x, e.z) < 3 * 3) { e.health -= PLAYER.punchDamage; addWanted(1); }
      }
    }
    if (controls.fire) events |= fireBullet();

    // --- Bullets ---
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.dx * 70 * dt;
      b.y += b.dy * 70 * dt;
      b.z += b.dz * 70 * dt;
      b.life -= dt;
      let hit = b.life <= 0;
      for (const ped of state.peds) {
        if (ped.health > 0 && dist2(b.x, b.z, ped.x, ped.z) < 1.6 * 1.6 && Math.abs(b.y - 1.2) < 1.4) {
          ped.health -= PLAYER.bulletDamage;
          ped.flee = 4;
          if (ped.police) addWanted(1);
          hit = true;
          break;
        }
      }
      if (hit) state.bullets.splice(i, 1);
    }

    // --- Traffic: cruise, brake for the car ahead, turn at intersections ---
    for (const car of state.cars) {
      if (car.kind === 'player' || car.kind === 'police') continue;
      if (car.parked) continue;
      const stats = statsOf(car);
      let desired = car.cruise || 12;
      // Brake if another car is right ahead on the same axis.
      for (const other of state.cars) {
        if (other === car || other.parked) continue;
        const ahead = car.axis === 'z'
          ? (other.z - car.z) * car.dir
          : (other.x - car.x) * car.dir;
        const side = car.axis === 'z' ? Math.abs(other.x - car.x) : Math.abs(other.z - car.z);
        if (ahead > 0 && ahead < 14 && side < 4) { desired = Math.min(desired, 4); break; }
      }
      car.speed += Math.max(-20 * dt, Math.min(12 * dt, desired - car.speed));
      car.speed = Math.max(0, Math.min(stats.maxSpeed * 0.45, car.speed));
      if (car.axis === 'z') car.z += car.dir * car.speed * dt;
      else car.x += car.dir * car.speed * dt;
      const onIntersection = (car.axis === 'z' && [40, 120, 200, 280, 360, 440].some((r) => Math.abs(car.z - r) < 2))
        || (car.axis === 'x' && [40, 120, 200, 280, 360, 440, 520, 600].some((r) => Math.abs(car.x - r) < 2));
      if (onIntersection && random() < 0.01) {
        car.axis = car.axis === 'z' ? 'x' : 'z';
        car.dir = random() < 0.5 ? 1 : -1;
        car.heading = car.axis === 'z' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      if (car.x < 10) car.x = 630;
      if (car.x > 630) car.x = 10;
      if (car.z < 10) car.z = 470;
      if (car.z > 470) car.z = 10;
      if (buildingAt(city, car.x, car.z, 2.4)) {
        car.axis = car.axis === 'z' ? 'x' : 'z';
        car.dir *= -1;
      }
    }

    // --- Pedestrians: walk, flee when scared, police chase on foot ---
    for (const ped of state.peds) {
      if (ped.health <= 0) continue;
      ped.walkPhase += dt * 6;
      if (ped.police) {
        const d = Math.sqrt(dist2(p.x, p.z, ped.x, ped.z));
        if (d > 2 && state.wanted > 0 && !p.inCar) {
          const a = angleTo(ped.x, ped.z, p.x, p.z);
          ped.heading = a;
          ped.x += Math.sin(a) * ped.speed * dt;
          ped.z += Math.cos(a) * ped.speed * dt;
        }
        if (d < POLICE.arrestRange && !p.inCar && state.wanted > 0) {
          ped.arrestTimer += dt;
          if (ped.arrestTimer > POLICE.arrestTime) {
            state.busted = true;
            events |= EVENT_BUSTED;
          }
        } else ped.arrestTimer = 0;
        continue;
      }
      if (ped.flee > 0) {
        ped.flee -= dt;
        const a = angleTo(p.x, p.z, ped.x, ped.z) + Math.PI;
        ped.heading = a;
        ped.x += Math.sin(a) * 7 * dt;
        ped.z += Math.cos(a) * 7 * dt;
      } else {
        if (random() < dt * 0.08) ped.heading = random() * Math.PI * 2;
        ped.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
        const road = nearestRoadPoint(ped.x, ped.z);
        if (dist2(ped.x, ped.z, road.x, road.z) > 18 * 18) {
          ped.x = road.x + range(random, -10, 10);
          ped.z = road.z + range(random, -10, 10);
        }
      }
      pushOutOfBuilding(city, ped, 0.9);
      clampToWorld(ped, 1);
    }
    state.peds = state.peds.filter((ped) => ped.health > 0 || ped.police);

    // --- Police cars chase: steer toward where Leo is heading, then ram ---
    for (const u of state.police) {
      if (u.kind !== 'car') continue;
      const car = u.car;
      const d = Math.sqrt(dist2(p.x, p.z, car.x, car.z));
      if (state.wanted === 0) {
        car.speed = Math.max(0, car.speed - 10 * dt);
        continue;
      }
      // Aim at Leo's position half a second ahead of him.
      const tx = p.x + Math.sin(p.heading) * (p.speed || 0) * 0.5;
      const tz = p.z + Math.cos(p.heading) * (p.speed || 0) * 0.5;
      const targetHeading = angleTo(car.x, car.z, tx, tz);
      let diff = targetHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      car.speed = Math.min(POLICE.chaseSpeed, car.speed + 18 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      if (buildingAt(city, car.x, car.z, 2.4)) { car.speed *= 0.4; }
      clampToWorld(car, 3);
      if (d < 4) {
        if (p.inCar) { p.inCar.speed *= 0.7; events |= EVENT_CRASH; }
        else if (p.invulnerable <= 0) {
          p.health -= 18 * dt * 10;
          p.invulnerable = 0.6;
        }
      }
    }
    state.police = state.police.filter((u) => (u.car && state.cars.includes(u.car)) || (u.ped && u.ped.health > 0));

    // --- Taxi side activity (after the heist) ---
    if (state.missionIndex >= 2) {
      if (!state.taxi) {
        state.taxiTimer += dt;
        if (state.taxiTimer > 6) { state.taxiTimer = 0; spawnTaxi(); }
      } else if (!state.taxi.boarded) {
        if (p.inCar && dist2(p.x, p.z, state.taxi.pickup.x, state.taxi.pickup.z) < 8 * 8) {
          state.taxi.boarded = true;
          state.message = `Passenger aboard — take them to ${state.taxi.dest.name} ($${state.taxi.fare})`;
          state.messageTimer = 3;
        }
      } else if (p.inCar && dist2(p.x, p.z, state.taxi.dest.x, state.taxi.dest.z) < 9 * 9) {
        state.cash += state.taxi.fare;
        state.taxiDone += 1;
        state.message = `Fare complete! +$${state.taxi.fare}`;
        state.messageTimer = 3;
        state.taxi = null;
        state.taxiTimer = 0;
        events |= EVENT_TAXI;
        events |= checkUnlocks();
      }
    }

    // --- Beach sun coins ---
    for (const coin of state.coins) {
      if (coin.taken) continue;
      if (dist2(p.x, p.z, coin.x, coin.z) < 3.5 * 3.5) {
        coin.taken = true;
        state.coinsCollected += 1;
        state.cash += COLLECTIBLES.value;
        state.message = `Sun coin! +$${COLLECTIBLES.value} (${state.coinsCollected}/${COLLECTIBLES.count})`;
        state.messageTimer = 2;
        events |= EVENT_COLLECT;
        events |= checkUnlocks();
      }
    }

    // --- Pickups in free roam ---
    if (state.missionIndex >= MISSIONS.length && state.pickups.length < 3 && random() < dt * 0.1) {
      const p2 = nearestRoadPoint(range(random, 60, 580), range(random, 60, 420));
      state.pickups.push({ x: p2.x, z: p2.z, amount: 50 });
    }
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      if (dist2(p.x, p.z, state.pickups[i].x, state.pickups[i].z) < 4 * 4) {
        state.cash += state.pickups[i].amount;
        state.pickups.splice(i, 1);
        events |= EVENT_CASH;
      }
    }

    // --- Particles ---
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.y += pt.vy * dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }

    // --- Health / busted ---
    if (p.health <= 0 && !state.busted) {
      state.busted = true;
      events |= EVENT_BUSTED;
    }
    if (state.busted) {
      p.health = PLAYER.health;
      p.x = city.places.hospital.x;
      p.z = city.places.hospital.z;
      p.inCar = null;
      state.cash = Math.max(0, state.cash - 100);
      state.wanted = 0;
      state.raceIndex = 0;
      state.raceTimer = state.missionIndex === 3 ? MISSIONS[3].timeLimit : 0;
      state.police = [];
      state.busted = false;
      state.message = 'Busted! Woke up at Bay Hospital -$100';
      state.messageTimer = 4;
    }

    events |= checkMission();
    return events;
  }

  function save() {
    try {
      const p = state.player;
      const data = {
        cash: state.cash, missionIndex: state.missionIndex, missionStage: state.missionStage,
        dropsDone: state.dropsDone, raceIndex: state.raceIndex, taxiDone: state.taxiDone,
        coinsCollected: state.coinsCollected, unlocked: state.unlocked,
        x: p.x, z: p.z, health: p.health, time: state.time,
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      state.message = 'Game saved';
      state.messageTimer = 2;
      return true;
    } catch { return false; }
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
      if (state.missionIndex === 3) state.raceTimer = MISSIONS[3].timeLimit;
      for (let i = 0; i < state.coinsCollected && i < state.coins.length; i += 1) state.coins[i].taken = true;
      setMissionTarget();
      return true;
    } catch { return false; }
  }

  function hasSave() {
    try { return !!window.localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  reset();
  return { state, reset, step, save, load, hasSave, setMissionTarget, nearestCar, missionProgress, checkUnlocks };
}
