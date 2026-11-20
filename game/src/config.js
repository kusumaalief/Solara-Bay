// Solara Bay 3D — every tuning number and colour in one place.
// The world is 640 by 480 units on the ground plane (x east, z south, y up).
// Roads run on an 80-unit grid; blocks between them hold blocky buildings.
// A blocky avatar is about 1.8 units tall; a blocky car is about 4.4 long.
export const WORLD = { width: 640, height: 480 };
export const STEP = 1 / 60;
export const SAVE_KEY = 'solara-bay-3d.save.v1';

export const PLAYER = {
  height: 1.8,
  walkSpeed: 8,
  runSpeed: 13,
  jumpSpeed: 8,
  health: 100,
  bulletDamage: 34,
  punchDamage: 25,
  fireCooldown: 0.22,
};

export const CAR = {
  length: 4.6,
  width: 2.1,
  accel: 22,
  brake: 34,
  drag: 3,
  maxSpeed: 38,
  reverseMax: 12,
  steer: 1.9,
};

export const POLICE = {
  maxCars: 5,
  chaseSpeed: 34,
  footSpeed: 9,
  arrestRange: 2.2,
  arrestTime: 1.6,
  spawnDistance: 90,
};

export const WANTED = { decaySeconds: 24, max: 5 };

export const MISSIONS = [
  {
    id: 'borrowed-wheels',
    title: 'Borrowed Wheels',
    brief: 'Leo needs wheels. Steal any car (E near a car) and drive it to the yellow marker at the docks.',
    objective: 'Steal a car, then reach the docks marker',
  },
  {
    id: 'courier',
    title: 'The Courier',
    brief: 'Mara needs three packages dropped across Solara Bay. Reach each yellow marker. The cops are watching.',
    objective: 'Deliver all 3 packages',
    drops: 3,
  },
  {
    id: 'bay-heist',
    title: 'Bay Heist',
    brief: 'Grab the cash at the marina bank (E at the marker), then lose the heat and reach the safehouse.',
    objective: 'Grab the cash, then reach the safehouse',
  },
];

export const PALETTE = {
  sky: 0x87b5e0,
  sun: 0xffe8b0,
  grass: 0x4a8a4f,
  park: 0x2f6b3d,
  sand: 0xd9c08a,
  water: 0x1e6f8e,
  road: 0x2b2f38,
  lane: 0xe8d44d,
  sidewalk: 0x9aa0aa,
  roofs: [0xb0563a, 0x4a6b8a, 0x7a5a8a, 0x3a7a6b, 0x8a6b3a, 0x5a5a6b],
  tree: 0x1e5c2e,
  trunk: 0x6b4a2a,
  avatarSkin: 0xf2c48a,
  avatarShirt: 0xf2c94c,
  avatarPants: 0x2b4acb,
  playerCar: 0xe5534b,
  trafficCar: [0x4fc3f7, 0xf2f2f2, 0x7ab648, 0xe8a13a, 0x9a7ab8, 0xc94b6b],
  policeCar: 0x2b4acb,
  policeLight: 0xff3b30,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const CITY_NAME = 'Solara Bay';
export const HERO_NAME = 'Leo Marin';
