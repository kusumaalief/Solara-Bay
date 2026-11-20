// Solara Bay 3D simulation: no drawing and no Three.js in here, just rules
// and state. The player walks or drives, traffic and pedestrians use the road
// grid, police respond to the wanted level, and three missions tell Leo's
// story. step() advances one fixed step and returns what happened as flags.
import { CAR, MISSIONS, PALETTE, PLAYER, POLICE, WANTED, WORLD } from './config.js';
import { buildingAt, clampToWorld, createCity, nearestRoadPoint, pushOutOfBuilding } from './city.js';
import { pick, range } from './random.js';

export const EVENT_MISSION = 1;
export const EVENT_BUSTED = 2;
export const EVENT_CASH = 4;
export const EVENT_SHOT = 8;
export const EVENT_CRASH = 16;
export const EVENT_STEAL = 32;

const DROP_POINTS = [
  { x: 200, z: 120, name: 'Marina Bank' },
  { x: 440, z: 280, name: 'Bay Hospital' },
  { x: 120, z: 120, name: 'North Shops' },
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
    missionTarget: null,
    missionText: MISSIONS[0].objective,
    message: '',
    messageTimer: 0,
    busted: false,
    player: null,
    cars: [],
    peds: [],
    police: [],
    bullets: [],
    particles: [],
    pickups: [],
  };

  function makeCar(x, z, heading, color, kind) {
    return {
      id: Math.floor(random() * 1e9), x, z, heading, speed: 0,
      color, kind: kind || 'traffic', parked: false,
      axis: Math.abs(Math.sin(heading)) < 0.5 ? 'z' : 'x',
      dir: Math.random() < 0.5 ? 1 : -1,
    };
  }

  function makePed(x, z, police) {
    return {
      x, z, heading: random() * Math.PI * 2, speed: police ? POLICE.footSpeed : range(random, 2, 4),
      color: police ? 0x1a2a6b : pick(random, [0xf2a65a, 0x7ab8f2, 0xc98af2, 0x8af2c9, 0xf28a8a, 0xffffff]),
      shirt: police ? 0x1a2a6b : pick(random, [0xe5534b, 0x4fc3f7, 0x7ab648, 0xe8a13a, 0x9a7ab8]),
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
      const car = makeCar(
        onVertical ? road + (random() < 0.5 ? -3 : 3) : along,
        onVertical ? along : road + (random() < 0.5 ? -3 : 3),
        onVertical ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        pick(random, PALETTE.trafficCar), 'traffic',
      );
      car.speed = range(random, 9, 15);
      car.axis = onVertical ? 'z' : 'x';
      state.cars.push(car);
    }
  }

  function spawnParked(count) {
    for (let i = 0; i < count; i += 1) {
      const p = nearestRoadPoint(range(random, 60, 580), range(random, 60, 420));
      const car = makeCar(p.x + (random() < 0.5 ? -9 : 9), p.z + (random() < 0.5 ? -9 : 9), random() * Math.PI * 2, pick(random, PALETTE.trafficCar), 'parked');
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

  function setMissionTarget() {
    const m = MISSIONS[state.missionIndex];
    if (!m) {
      state.missionTarget = null;
      state.missionText = 'Free roam — collect cash bags around Solara Bay';
      return;
    }
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
    }
    state.missionText = m.objective;
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
    state.busted = false;
    state.cars = [];
    state.peds = [];
    state.police = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    state.player = {
      x: city.places.start.x, z: city.places.start.z, y: 0, vy: 0,
      heading: 0, speed: 0, health: PLAYER.health, inCar: null, fireCooldown: 0, invulnerable: 0,
    };
    spawnTraffic(16);
    spawnParked(10);
    spawnPeds(22);
    // Leo's own starter car, parked by the plaza.
    const starter = makeCar(city.places.start.x + 12, city.places.start.z + 6, Math.PI / 2, PALETTE.playerCar, 'player');
    starter.parked = true;
    state.cars.push(starter);
    setMissionTarget();
    state.message = 'Welcome to Solara Bay';
    state.messageTimer = 3;
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
    const car = makeCar(road.x, road.z, 0, PALETTE.policeCar, 'police');
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
    state.cash += cashReward;
    state.missionIndex += 1;
    state.missionStage = 0;
    state.dropsDone = 0;
    setMissionTarget();
    state.message = `Mission complete! +$${cashReward}`;
    state.messageTimer = 4;
    return EVENT_MISSION;
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
      if (state.missionStage === 1 && p.inCar && d < 10) return completeMission(250);
    } else if (state.missionIndex === 1) {
      if (d < 9) {
        state.dropsDone += 1;
        state.cash += 80;
        if (state.dropsDone >= MISSIONS[1].drops) return completeMission(400);
        setMissionTarget();
        state.message = `Package delivered (${state.dropsDone}/3)`;
        state.messageTimer = 3;
        return EVENT_CASH;
      }
    } else if (state.missionIndex === 2) {
      if (state.missionStage === 0 && d < 8) {
        // Grab is via Interact in step(); reaching alone only arms it.
      }
      if (state.missionStage === 1 && d < 10) return completeMission(800);
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

    // Wanted decay: no crime, no police close, and the heat cools off.
    if (state.wanted > 0) {
      state.wantedTimer += dt;
      const policeNear = state.police.some((u) => {
        const e = u.car || u.ped;
        return e && dist2(p.x, p.z, e.x, e.z) < 60 * 60;
      });
      if (state.wantedTimer > WANTED.decaySeconds && !policeNear) {
        state.wanted = 0;
        state.wantedTimer = 0;
        state.message = 'You lost the heat';
        state.messageTimer = 3;
      }
    }
    ensurePolice();

    // --- Player movement ---
    const camSin = Math.sin(controls.cameraYaw || 0);
    const camCos = Math.cos(controls.cameraYaw || 0);
    // moveY forward is -W in screen terms: forward = camera direction.
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
      const accelInput = -my;
      const steerInput = mx;
      car.speed += accelInput * CAR.accel * dt;
      if (accelInput === 0 && car.speed !== 0) car.speed -= Math.sign(car.speed) * CAR.drag * 8 * dt;
      if (Math.abs(car.speed) < 0.5 && accelInput === 0) car.speed = 0;
      car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
      const steerAmount = steerInput * CAR.steer * dt * Math.min(1, Math.abs(car.speed) / 12 + 0.25) * Math.sign(car.speed || 1);
      car.heading += steerAmount;
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      if (!buildingAt(city, nx, nz, 2.4)) { car.x = nx; car.z = nz; } else { car.speed *= -0.3; events |= EVENT_CRASH; }
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
      // Gravity / jump
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
            state.message = 'Car stolen — the cops noticed!';
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

    // --- Traffic ---
    for (const car of state.cars) {
      if (car.kind === 'player' || car.kind === 'police') continue;
      if (car.parked) continue;
      // Move along its axis; at an intersection, sometimes turn.
      const speed = car.speed || 12;
      if (car.axis === 'z') car.z += car.dir * speed * dt;
      else car.x += car.dir * speed * dt;
      const onIntersection = (car.axis === 'z' && [40, 120, 200, 280, 360, 440].some((r) => Math.abs(car.z - r) < 2))
        || (car.axis === 'x' && [40, 120, 200, 280, 360, 440, 520, 600].some((r) => Math.abs(car.x - r) < 2));
      if (onIntersection && random() < 0.01) {
        car.axis = car.axis === 'z' ? 'x' : 'z';
        car.dir = random() < 0.5 ? 1 : -1;
        car.heading = car.axis === 'z' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      // Wrap around the city edge instead of driving off the map.
      if (car.x < 10) car.x = 630;
      if (car.x > 630) car.x = 10;
      if (car.z < 10) car.z = 470;
      if (car.z > 470) car.z = 10;
      if (buildingAt(city, car.x, car.z, 2.4)) {
        car.axis = car.axis === 'z' ? 'x' : 'z';
        car.dir *= -1;
      }
    }

    // --- Pedestrians ---
    for (const ped of state.peds) {
      if (ped.health <= 0) continue;
      ped.walkPhase += dt * 6;
      let tx = ped.x;
      let tz = ped.z;
      if (ped.police) {
        // Police on foot chase the player.
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

    // --- Police cars chase ---
    for (const u of state.police) {
      if (u.kind !== 'car') continue;
      const car = u.car;
      const d = Math.sqrt(dist2(p.x, p.z, car.x, car.z));
      if (state.wanted === 0) {
        car.speed = Math.max(0, car.speed - 10 * dt);
        continue;
      }
      const targetHeading = angleTo(car.x, car.z, p.x, p.z);
      let diff = targetHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      car.speed = Math.min(POLICE.chaseSpeed, car.speed + 18 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      if (buildingAt(city, car.x, car.z, 2.4)) { car.speed *= 0.4; }
      clampToWorld(car, 3);
      // Ram the player: on foot it hurts, in a car it slows them.
      if (d < 4) {
        if (p.inCar) { p.inCar.speed *= 0.7; events |= EVENT_CRASH; }
        else if (p.invulnerable <= 0) {
          p.health -= 18 * dt * 10;
          p.invulnerable = 0.6;
        }
      }
    }
    // Remove police units whose car/ped is gone.
    state.police = state.police.filter((u) => (u.car && state.cars.includes(u.car)) || (u.ped && u.ped.health > 0));

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
        dropsDone: state.dropsDone, x: p.x, z: p.z, health: p.health, time: state.time,
      };
      window.localStorage.setItem('solara-bay-3d.save.v1', JSON.stringify(data));
      state.message = 'Game saved';
      state.messageTimer = 2;
      return true;
    } catch { return false; }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem('solara-bay-3d.save.v1');
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.cash = data.cash ?? 120;
      state.missionIndex = data.missionIndex ?? 0;
      state.missionStage = data.missionStage ?? 0;
      state.dropsDone = data.dropsDone ?? 0;
      state.player.x = data.x ?? state.player.x;
      state.player.z = data.z ?? state.player.z;
      state.player.health = data.health ?? PLAYER.health;
      state.time = data.time ?? 0;
      setMissionTarget();
      return true;
    } catch { return false; }
  }

  function hasSave() {
    try { return !!window.localStorage.getItem('solara-bay-3d.save.v1'); } catch { return false; }
  }

  reset();
  return { state, reset, step, save, load, hasSave, setMissionTarget, nearestCar };
}
