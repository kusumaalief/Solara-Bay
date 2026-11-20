// Solara Bay 3D map: a road grid, the blocks between the roads, and the
// named places missions point at. Buildings are solid boxes; the beach runs
// along the south edge and the marina sits in the south-east.
// Coordinates: x east (0..640), z south (0..480), y up. Roads are 14 wide.
import { PALETTE, WORLD } from './config.js';
import { pick, range } from './random.js';

export const ROAD_WIDTH = 14;
export const VERTICAL_ROADS = [40, 120, 200, 280, 360, 440, 520, 600];
export const HORIZONTAL_ROADS = [40, 120, 200, 280, 360, 440];

export function isOnRoad(x, z) {
  for (const rx of VERTICAL_ROADS) if (Math.abs(x - rx) < ROAD_WIDTH / 2) return true;
  for (const rz of HORIZONTAL_ROADS) if (Math.abs(z - rz) < ROAD_WIDTH / 2) return true;
  return false;
}

export function nearestRoadPoint(x, z) {
  let bestX = VERTICAL_ROADS[0];
  let best = Infinity;
  for (const rx of VERTICAL_ROADS) { const d = Math.abs(x - rx); if (d < best) { best = d; bestX = rx; } }
  let bestZ = HORIZONTAL_ROADS[0];
  best = Infinity;
  for (const rz of HORIZONTAL_ROADS) { const d = Math.abs(z - rz); if (d < best) { best = d; bestZ = rz; } }
  return Math.abs(x - bestX) < Math.abs(z - bestZ) ? { x: bestX, z } : { x, z: bestZ };
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const parks = [];
  for (let ix = 0; ix < VERTICAL_ROADS.length - 1; ix += 1) {
    for (let iy = 0; iy < HORIZONTAL_ROADS.length - 1; iy += 1) {
      const x0 = VERTICAL_ROADS[ix] + ROAD_WIDTH / 2 + 4;
      const x1 = VERTICAL_ROADS[ix + 1] - ROAD_WIDTH / 2 - 4;
      const z0 = HORIZONTAL_ROADS[iy] + ROAD_WIDTH / 2 + 4;
      const z1 = HORIZONTAL_ROADS[iy + 1] - ROAD_WIDTH / 2 - 4;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (ix === 3 && iy === 2) {
        parks.push({ x: x0, z: z0, width: x1 - x0, depth: z1 - z0 });
        for (let t = 0; t < 12; t += 1) {
          trees.push({ x: range(random, x0 + 4, x1 - 4), z: range(random, z0 + 4, z1 - 4), h: range(random, 3, 5) });
        }
        continue;
      }
      if (cz > 430) continue;
      const w = range(random, 18, 34);
      const d = range(random, 14, 26);
      buildings.push({
        x: cx - w / 2, z: cz - d / 2, width: w, depth: d,
        height: range(random, 8, 30),
        color: pick(random, PALETTE.roofs),
      });
      if (random() < 0.5) trees.push({ x: range(random, x0, x1), z: range(random, z0, z1), h: range(random, 3, 5) });
    }
  }
  const places = {
    start: { x: 280, z: 200, name: 'Solara Plaza' },
    docks: { x: 580, z: 420, name: 'Docks' },
    bank: { x: 200, z: 120, name: 'Marina Bank' },
    safehouse: { x: 120, z: 360, name: 'Safehouse' },
    hospital: { x: 440, z: 200, name: 'Bay Hospital' },
    beach: { x: 280, z: 465, name: 'Solara Beach' },
  };
  return { buildings, trees, parks, places, width: WORLD.width, height: WORLD.height };
}

export function buildingAt(city, x, z, radius) {
  for (const b of city.buildings) {
    if (x + radius > b.x && x - radius < b.x + b.width && z + radius > b.z && z - radius < b.z + b.depth) return b;
  }
  return null;
}

export function pushOutOfBuilding(city, entity, radius) {
  const b = buildingAt(city, entity.x, entity.z, radius);
  if (!b) return false;
  const left = entity.x + radius - b.x;
  const right = b.x + b.width - (entity.x - radius);
  const top = entity.z + radius - b.z;
  const bottom = b.z + b.depth - (entity.z - radius);
  const min = Math.min(left, right, top, bottom);
  if (min === left) entity.x = b.x - radius;
  else if (min === right) entity.x = b.x + b.width + radius;
  else if (min === top) entity.z = b.z - radius;
  else entity.z = b.z + b.depth + radius;
  return true;
}

export function clampToWorld(entity, radius) {
  entity.x = Math.max(radius, Math.min(WORLD.width - radius, entity.x));
  entity.z = Math.max(radius, Math.min(WORLD.height - radius, entity.z));
}
