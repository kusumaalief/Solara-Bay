// The map of Solara Bay: a road grid, the blocks between the roads, and
// the named places the missions point at. Buildings are solid boxes;
// the beach runs along the south edge and the marina sits in the
// south-east. A second district — the Harbor District in the north-west
// — has taller towers in harbour colours, plus a beach promenade, a
// lighthouse, a pier, palms, lamps, benches and billboards, so the city
// reads as two places rather than one repeated grid.
// Coordinates: x east (0..640), z south (0..480), y up. Roads are 14 wide.
import { PALETTE, WORLD } from './config.js';
import { chance, intRange, pick, range, sample } from './random.js';

export const ROAD_WIDTH = 14;
export const VERTICAL_ROADS = [40, 120, 200, 280, 360, 440, 520, 600];
export const HORIZONTAL_ROADS = [40, 120, 200, 280, 360, 440];

export function isOnRoad(x, z) {
  for (const rx of VERTICAL_ROADS) {
    if (Math.abs(x - rx) < ROAD_WIDTH / 2) return true;
  }
  for (const rz of HORIZONTAL_ROADS) {
    if (Math.abs(z - rz) < ROAD_WIDTH / 2) return true;
  }
  return false;
}

export function nearestRoadPoint(x, z) {
  let roadX = VERTICAL_ROADS[0];
  let gap = Infinity;
  for (const rx of VERTICAL_ROADS) {
    const d = Math.abs(x - rx);
    if (d < gap) { gap = d; roadX = rx; }
  }
  let roadZ = HORIZONTAL_ROADS[0];
  gap = Infinity;
  for (const rz of HORIZONTAL_ROADS) {
    const d = Math.abs(z - rz);
    if (d < gap) { gap = d; roadZ = rz; }
  }
  if (Math.abs(x - roadX) < Math.abs(z - roadZ)) return { x: roadX, z };
  return { x, z: roadZ };
}

function blockBounds(ix, iy) {
  return {
    x0: VERTICAL_ROADS[ix] + ROAD_WIDTH / 2 + 4,
    x1: VERTICAL_ROADS[ix + 1] - ROAD_WIDTH / 2 - 4,
    z0: HORIZONTAL_ROADS[iy] + ROAD_WIDTH / 2 + 4,
    z1: HORIZONTAL_ROADS[iy + 1] - ROAD_WIDTH / 2 - 4,
  };
}

// Blocks the generator must leave alone because a hand-placed landmark
// lives there: the armory (2,1), the music store (4,1), the Violet
// Towers (1,0) and Comet Motors (3,1).
const RESERVED = new Set(['2,1', '4,1', '1,0', '3,1']);

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const parks = [];
  const props = [];
  const cols = VERTICAL_ROADS.length - 1;
  const rows = HORIZONTAL_ROADS.length - 1;

  for (let ix = 0; ix < cols; ix += 1) {
    for (let iy = 0; iy < rows; iy += 1) {
      const { x0, x1, z0, z1 } = blockBounds(ix, iy);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const harbor = ix <= 1 && iy <= 1;
      if (ix === 3 && iy === 2) {
        // The central park: grass and a dozen trees, no tower.
        parks.push({ x: x0, z: z0, width: x1 - x0, depth: z1 - z0 });
        for (let t = 0; t < 12; t += 1) {
          trees.push({
            x: range(random, x0 + 4, x1 - 4),
            z: range(random, z0 + 4, z1 - 4),
            h: range(random, 3, 5),
          });
        }
        continue;
      }
      if (cz > 430) continue;
      if (RESERVED.has(`${ix},${iy}`)) continue;
      const w = harbor ? range(random, 24, 36) : range(random, 18, 34);
      const d = harbor ? range(random, 20, 30) : range(random, 14, 26);
      buildings.push({
        x: cx - w / 2,
        z: cz - d / 2,
        width: w,
        depth: d,
        height: harbor ? range(random, 22, 42) : range(random, 8, 30),
        color: pick(random, harbor ? PALETTE.harborRoofs : PALETTE.roofs),
        harbor,
      });
      if (random() < 0.5) {
        trees.push({ x: range(random, x0, x1), z: range(random, z0, z1), h: range(random, 3, 5) });
      }
    }
  }

  // Hand-placed landmarks, inspired by the city street pack the entrant
  // supplied: its orange apartment facade, purple towers and neon skyline
  // are the textures on these buildings (see render.js). Marin's Armory,
  // the Vinyl Bay Records music store, the Violet Towers, and Comet
  // Motors — the dealership where Leo's Comet 01 lives.
  buildings.push(
    { x: 215, z: 140, width: 26, depth: 18, height: 10, color: PALETTE.armory, kind: 'armory' },
    { x: 380, z: 140, width: 30, depth: 20, height: 12, color: PALETTE.musicStore, kind: 'musicstore', facade: 'textures/facade-orange.jpg' },
    { x: 150, z: 60, width: 20, depth: 16, height: 38, color: PALETTE.violetTower, kind: 'tower', facade: 'textures/facade-violet.jpg' },
    { x: 300, z: 140, width: 30, depth: 18, height: 8, color: 0xe5534b, kind: 'dealership' },
  );

  // Record Row: a small plaza in front of the music store — a kiosk, a
  // food cart, benches and planters, market stalls in the block below,
  // and a neon-skyline billboard. The pack's benches, cans and street
  // props are the reference.
  props.push({ kind: 'kiosk', x: 360, z: 185 });
  props.push({ kind: 'foodcart', x: 430, z: 185 });
  props.push({ kind: 'billboard', x: 320, z: 188, texture: 'textures/skyline-neon.jpg' });
  props.push({ kind: 'busstop', x: 365, z: 220 });
  const stallCount = intRange(random, 2, 3);
  for (let i = 0; i < stallCount; i += 1) {
    props.push({ kind: 'stall', x: 395 + i * 16, z: 222 });
  }
  for (const bx of [375, 395, 415]) {
    if (chance(random, 0.8)) props.push({ kind: 'bench', x: bx, z: 192 });
    props.push({ kind: 'planter', x: bx + 8, z: 192 });
  }
  // Benches and planters outside the armory, on its south sidewalk.
  props.push({ kind: 'bench', x: 216, z: 170 });
  props.push({ kind: 'bench', x: 250, z: 170 });
  props.push({ kind: 'planter', x: 244, z: 170 });

  // Beach promenade: palms, lamps and benches along the sand (z ~ 448-462).
  for (let x = 30; x < WORLD.width - 20; x += 40) {
    props.push({ kind: 'palm', x, z: 452, h: range(random, 4, 6) });
    props.push({ kind: 'lamp', x: x + 20, z: 448 });
    if (random() < 0.6) props.push({ kind: 'bench', x: x + 10, z: 456 });
  }

  // Street lamps at every other intersection, and big signs on three plazas.
  for (const rx of VERTICAL_ROADS) {
    for (const rz of HORIZONTAL_ROADS) {
      if ((rx + rz) % 160 === 0) props.push({ kind: 'lamp', x: rx + 9, z: rz + 9 });
    }
  }
  props.push({ kind: 'sign', x: 280, z: 188, text: 'SOLARA', color: 0xffd23a });
  props.push({ kind: 'sign', x: 120, z: 108, text: 'HARBOR', color: 0x4fc3f7 });
  props.push({ kind: 'sign', x: 580, z: 408, text: 'DOCKS', color: 0xe5534b });

  // Lighthouse and pier at the south-east marina.
  props.push({ kind: 'lighthouse', x: 612, z: 470 });
  props.push({ kind: 'pier', x: 560, z: 468 });
  props.push({ kind: 'pier', x: 580, z: 468 });

  const places = {
    start: { x: 280, z: 200, name: 'Solara Plaza' },
    docks: { x: 580, z: 420, name: 'Docks' },
    bank: { x: 200, z: 120, name: 'Marina Bank' },
    safehouse: { x: 120, z: 360, name: 'Safehouse' },
    hospital: { x: 440, z: 200, name: 'Bay Hospital' },
    beach: { x: 280, z: 465, name: 'Solara Beach' },
    harbor: { x: 80, z: 80, name: 'Harbor District' },
    garage: { x: 120, z: 80, name: 'Harbor Garage' },
    cabana: { x: 320, z: 462, name: 'Beach Cabana' },
    taxiStand: { x: 360, z: 200, name: 'Taxi Stand' },
    taxiStand2: { x: 200, z: 360, name: 'Taxi Stand' },
    taxiStand3: { x: 520, z: 120, name: 'Taxi Stand' },
    armory: { x: 228, z: 164, name: "Marin's Armory" },
    musicstore: { x: 395, z: 166, name: 'Vinyl Bay Records' },
    recordrow: { x: 395, z: 190, name: 'Record Row' },
    dealership: { x: 315, z: 158, name: 'Comet Motors' },
    // Two forecourt spots for the dealership's stock, picked from four,
    // so the cars sit somewhere different on each seed.
    dealershipSpots: sample(random, [
      { x: 306, z: 168 }, { x: 318, z: 168 }, { x: 330, z: 168 }, { x: 342, z: 168 },
    ], 2),
  };

  // Race checkpoints ring the harbor and the beach.
  const racePoints = [
    { x: 120, z: 80, name: 'Harbor Gate' },
    { x: 520, z: 120, name: 'North Shops' },
    { x: 580, z: 420, name: 'Docks Turn' },
    { x: 280, z: 462, name: 'Beach Finish' },
  ];
  return { buildings, trees, parks, props, places, racePoints, width: WORLD.width, height: WORLD.height };
}

export function buildingAt(city, x, z, radius) {
  for (const b of city.buildings) {
    const overlapsX = x + radius > b.x && x - radius < b.x + b.width;
    const overlapsZ = z + radius > b.z && z - radius < b.z + b.depth;
    if (overlapsX && overlapsZ) return b;
  }
  return null;
}

export function pushOutOfBuilding(city, entity, radius) {
  const b = buildingAt(city, entity.x, entity.z, radius);
  if (!b) return false;
  const pushLeft = entity.x + radius - b.x;
  const pushRight = b.x + b.width - (entity.x - radius);
  const pushUp = entity.z + radius - b.z;
  const pushDown = b.z + b.depth - (entity.z - radius);
  const smallest = Math.min(pushLeft, pushRight, pushUp, pushDown);
  if (smallest === pushLeft) entity.x = b.x - radius;
  else if (smallest === pushRight) entity.x = b.x + b.width + radius;
  else if (smallest === pushUp) entity.z = b.z - radius;
  else entity.z = b.z + b.depth + radius;
  return true;
}

export function clampToWorld(entity, radius) {
  entity.x = Math.max(radius, Math.min(WORLD.width - radius, entity.x));
  entity.z = Math.max(radius, Math.min(WORLD.height - radius, entity.z));
}
