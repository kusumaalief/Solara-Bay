// Solara Bay — every tuning number, colour and story beat in one file.
// The island is 640 by 480 units (x east, z south, y up). Streets sit on
// an 80-unit grid, 14 units wide; the blocks between them hold the
// buildings. Leo is about 1.8 units tall; a sedan is about 4.6 long.
// The three guns, the two real car models, the five missions and the
// named places all live here so the simulation and the renderer agree
// on them without duplicating numbers.

export const WORLD = { width: 640, height: 480 };
export const STEP = 1 / 60;
export const SAVE_KEY = 'solara-bay-3d.save.v3';
export const CITY_NAME = 'Solara Bay';
export const HERO_NAME = 'Leo Marin';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Leo on foot: how fast he walks and runs, how high he jumps, how much
// punishment he takes, and how hard his fists and his bullets hit.
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

// Marin's Armory, run by Gus Ferraro. Three original guns, each with a
// different personality: the pistol is cheap and steady, the shotgun
// throws five pellets up close, the rifle is fast and reaches far.
// price is cash, damage is per pellet, fireRate is seconds between
// shots, range is metres, magSize is the magazine, reserveAmmo is the
// starter reserve, reloadTime is seconds, spread is radians of scatter.
export const WEAPONS = {
  pistol: {
    label: 'Bay Pistol',
    blurb: 'Cheap, steady, always there for you.',
    price: 150,
    damage: 30,
    pellets: 1,
    spread: 0.02,
    fireRate: 0.25,
    range: 55,
    bulletSpeed: 80,
    magSize: 12,
    reserveAmmo: 60,
    reloadTime: 1.0,
    tracer: 0xffe14d,
  },
  shotgun: {
    label: 'Boomstick',
    blurb: 'Five pellets of close-range persuasion.',
    price: 400,
    damage: 18,
    pellets: 5,
    spread: 0.09,
    fireRate: 0.9,
    range: 30,
    bulletSpeed: 60,
    magSize: 6,
    reserveAmmo: 24,
    reloadTime: 1.6,
    tracer: 0xff9e3a,
  },
  rifle: {
    label: 'Harbor Rifle',
    blurb: 'Fast, far, and very loud.',
    price: 700,
    damage: 55,
    pellets: 1,
    spread: 0.008,
    fireRate: 0.14,
    range: 110,
    bulletSpeed: 130,
    magSize: 30,
    reserveAmmo: 90,
    reloadTime: 1.4,
    tracer: 0x7ad7ff,
  },
};

export const ARMORY = {
  name: "Marin's Armory",
  keeper: 'Gus Ferraro',
  door: { x: 228, z: 164 },
  interactRange: 8,
  blurb: 'Gus Ferraro sells hardware to anyone with cash and a steady hand.',
};

// The two real low-poly cars, converted from the free-to-use cars pack
// the entrant supplied. The GLBs are baked at the game's 4.6-unit sedan
// length with the wheels on y=0 and the hood at +Z; wheelRadius is what
// the renderer spins the wheels by, headlightY is where the lamp blocks
// sit, lightBarY (police only) is the roof bar's height.
export const CAR_MODELS = {
  comet: {
    label: 'Comet 01',
    glb: 'models/car1.glb',
    texture: 'textures/car-1.png',
    wheelRadius: 0.36,
    headlightY: 0.55,
  },
  police: {
    label: 'Interceptor',
    glb: 'models/car2.glb',
    texture: 'textures/car-2.png',
    wheelRadius: 0.37,
    headlightY: 0.6,
    lightBarY: 1.78,
  },
};

// Four drivable kinds, each with its own feel: the sports car is quick
// but fragile, the truck is slow and tough, the bike is nimble.
export const VEHICLES = {
  sedan: {
    label: 'Sedan',
    length: 4.6,
    width: 2.1,
    accel: 22,
    brake: 34,
    drag: 3,
    maxSpeed: 38,
    reverseMax: 12,
    steer: 1.9,
    toughness: 1,
  },
  sports: {
    label: 'Sports car',
    length: 4.4,
    width: 2.0,
    accel: 32,
    brake: 40,
    drag: 2.2,
    maxSpeed: 50,
    reverseMax: 14,
    steer: 2.4,
    toughness: 0.8,
  },
  truck: {
    label: 'Truck',
    length: 5.6,
    width: 2.3,
    accel: 15,
    brake: 28,
    drag: 2.5,
    maxSpeed: 30,
    reverseMax: 10,
    steer: 1.4,
    toughness: 2,
  },
  bike: {
    label: 'Motorcycle',
    length: 2.6,
    width: 1.0,
    accel: 28,
    brake: 38,
    drag: 1.8,
    maxSpeed: 46,
    reverseMax: 8,
    steer: 3.1,
    toughness: 0.6,
  },
};
export const CAR = { ...VEHICLES.sedan };

// The heat: how many police cars may hunt at once, how fast they chase,
// how close a foot officer must get to arrest Leo, and how far away a
// unit must spawn. The wanted level only cools while no unit can see Leo.
export const POLICE = {
  maxCars: 5,
  chaseSpeed: 34,
  footSpeed: 9,
  arrestRange: 2.2,
  arrestTime: 1.6,
  spawnDistance: 90,
  hiddenDistance: 70,
};

export const WANTED = { decaySeconds: 24, max: 5 };

// Earned, not bought: hit the cash mark and the reward appears.
export const UNLOCKS = [
  {
    cash: 600,
    id: 'sports',
    label: 'Sports car unlocked — a red Comet is parked at the Harbor Garage',
  },
  {
    cash: 1200,
    id: 'beach',
    label: 'Beach House unlocked — the sunset cabana on Solara Beach is yours',
  },
];

// Leo's story, in order. drops is how many courier stops, checkpoints
// is how many race gates, timeLimit is the race clock in seconds.
export const MISSIONS = [
  {
    id: 'borrowed-wheels',
    title: 'Borrowed Wheels',
    giver: 'Mara Voss',
    brief: 'Mara Voss needs wheels for a job. Steal any car (E near a car) and drive it to the yellow marker at the docks.',
    objective: 'Steal a car, then reach the docks marker',
    reward: 250,
  },
  {
    id: 'courier',
    title: 'The Courier',
    giver: 'Mara Voss',
    brief: 'Mara needs three packages dropped across Solara Bay. Reach each yellow marker. The cops are watching.',
    objective: 'Deliver all 3 packages',
    drops: 3,
    reward: 400,
  },
  {
    id: 'bay-heist',
    title: 'Bay Heist',
    giver: 'Dario Kess',
    brief: 'Dario Kess has the marina bank scoped out. Grab the cash at the bank (F at the marker), then lose the heat and reach the safehouse.',
    objective: 'Grab the cash, then reach the safehouse',
    reward: 800,
  },
  {
    id: 'harbor-lights',
    title: 'Harbor Lights',
    giver: 'Dario Kess',
    brief: 'Dario wants a sunset race: hit all four checkpoints around the harbor before the timer runs out. A fast car helps — steal a sports car if you can find one.',
    objective: 'Hit all 4 race checkpoints before time runs out',
    checkpoints: 4,
    timeLimit: 90,
    reward: 600,
  },
  {
    id: 'getaway',
    title: 'The Getaway',
    giver: 'Officer Reyes',
    brief: 'Officer Reyes tipped Leo off: the heat is coming for the beach house. Get to the beach cabana with three stars on you, then shake the cops and stay hidden until the heat dies.',
    objective: 'Reach the beach cabana with the heat on, then lose it',
    reward: 900,
  },
];

// After the heist, fares wait at the taxi stands; sun coins hide on the beach.
export const TAXI = { fareMin: 60, fareMax: 120, stands: 3 };
export const COLLECTIBLES = { count: 8, value: 25 };

// The named cast: outfit colours, skin, height and hat per person.
export const CHARACTERS = {
  leo: { name: 'Leo Marin', shirt: 0xf2c94c, pants: 0x2b4acb, skin: 0xf2c48a, height: 1.0, hat: null, hair: 0x2a1a12 },
  mara: { name: 'Mara Voss', shirt: 0xc94b6b, pants: 0x22242c, skin: 0xe8b07a, height: 0.96, hat: 'cap', hair: 0x111111 },
  dario: { name: 'Dario Kess', shirt: 0x2b6b4a, pants: 0x4a3a2a, skin: 0xd9a05a, height: 1.06, hat: 'fedora', hair: 0x555555 },
  reyes: { name: 'Officer Reyes', shirt: 0x1a2a6b, pants: 0x1a2a6b, skin: 0xf2c48a, height: 1.02, hat: 'police', hair: 0x2a1a12 },
  gus: { name: 'Gus Ferraro', shirt: 0x5a3a1a, pants: 0x2b2b33, skin: 0xd9a05a, height: 1.08, hat: 'fedora', hair: 0x888888 },
};

// The crowd's wardrobe: pedestrians pick a shirt, trousers, skin tone,
// height and (sometimes) a hat from these.
export const CROWD = {
  shirts: [0xe5534b, 0x4fc3f7, 0x7ab648, 0xe8a13a, 0x9a7ab8, 0xf2f2f2, 0x2b6b8a, 0xc9a13a],
  pants: [0x333344, 0x2b4acb, 0x4a3a2a, 0x5a5a6b, 0x1e5c2e],
  skins: [0xf2c48a, 0xe8b07a, 0xd9a05a, 0xc98a5a, 0xf2d0a0],
  heights: [0.92, 0.96, 1.0, 1.04, 1.08],
  hats: [null, null, null, 'cap', 'cap', 'beanie', 'fedora'],
};

// The look of the place, as hex colours.
export const PALETTE = {
  sky: 0x8fc3ea,
  sunset: 0xff9e5e,
  sun: 0xffe8b0,
  grass: 0x4a8a4f,
  park: 0x2f6b3d,
  sand: 0xd9c08a,
  water: 0x1e6f8e,
  road: 0x2b2f38,
  lane: 0xe8d44d,
  sidewalk: 0x9aa0aa,
  roofs: [0xb0563a, 0x4a6b8a, 0x7a5a8a, 0x3a7a6b, 0x8a6b3a, 0x5a5a6b, 0xc96a4a, 0x3a5a7a],
  harborRoofs: [0x3a7a8a, 0x2b6b8a, 0x8a4a3a, 0x4a8a6b],
  tree: 0x1e5c2e,
  palm: 0x2a7a3a,
  trunk: 0x6b4a2a,
  avatarSkin: 0xf2c48a,
  avatarShirt: 0xf2c94c,
  avatarPants: 0x2b4acb,
  playerCar: 0xe5534b,
  sportsCar: 0xd21f3c,
  truckCar: 0x4a7a4a,
  bikeCar: 0x2b2f38,
  trafficCar: [0x4fc3f7, 0xf2f2f2, 0x7ab648, 0xe8a13a, 0x9a7ab8, 0xc94b6b],
  policeCar: 0x2b4acb,
  policeLight: 0xff3b30,
  taxi: 0xffd23a,
  coin: 0xffd23a,
  armory: 0x8a1a1a,
  armorySign: 0xffd23a,
  musicStore: 0x7a3ab8,
  violetTower: 0x6b4a9e,
  kiosk: 0xe5534b,
  foodCart: 0xff9e3a,
};
