// Drawing only, in 3D: a Three.js scene for Solara Bay, built from
// blocky boxes — blocky avatars, blocky cars, blocky buildings. Marin's
// Armory is a gun shop with a weapon rack, ammo crates and a big red
// sign; Vinyl Bay Records and the Violet Towers wear textured facades
// from a free-to-use city street pack; Record Row plaza has a kiosk, a
// food cart, market stalls and a neon-skyline billboard. Leo holds one
// blocky gun model per weapon, with a muzzle flash, and bullets fly as
// tracer-coloured dots. The real low-poly car models — Leo's Comet 01
// (every sedan) and the police Interceptor (every police car) — load
// from game/models/ through cars.js; until a model is ready its slot
// keeps the blocky car and swaps in on the next frame. Model wheels
// spin with speed, the front pair steers, and the police bar flashes
// red/blue. Everything is local under game/ — no network.
import * as THREE from 'three';
import { PALETTE, WEAPONS, WORLD } from './config.js';
import { carModelReady, loadCarModels, makeModelCar, updateModelCar } from './cars.js';
import { HORIZONTAL_ROADS, ROAD_WIDTH, VERTICAL_ROADS } from './city.js';

// Textures from the free-to-use city street pack the entrant supplied:
// three small downscaled JPEGs used as storefront facades and a
// billboard, so the flat-colour blocky style stays coherent. The shop
// signs are canvas-drawn text textures (original).
const FACADE_ASPECT = {
  'textures/facade-orange.jpg': 512 / 413,
  'textures/facade-violet.jpg': 512 / 467,
  'textures/skyline-neon.jpg': 512 / 117,
};
const textureCache = new Map();
function loadTexture(path) {
  if (!textureCache.has(path)) {
    const tex = new THREE.TextureLoader().load(path);
    tex.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(path, tex);
  }
  return textureCache.get(path);
}

function makeSignTexture(lines, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.font = '900 56px system-ui, sans-serif';
  ctx.fillText(lines[0], 256, 62);
  if (lines[1]) {
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.fillText(lines[1], 256, 104);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

// A box centred at (x, y, z) with the given size and colour. Most of the
// city is built from these.
function box(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function place(mesh, x, y, z) {
  mesh.position.set(x, y, z);
  return mesh;
}

// A blocky person: legs and arms swing from hip and shoulder pivots
// (the geometry is translated so the top of each limb is the origin),
// torso, head, hair, and one of four hats. userData keeps the limbs
// so the renderer can walk them.
function makeAvatar(opts) {
  const { shirt, pants, skin, height = 1, hat = null, hair = 0x2a1a12 } = opts || {};
  const group = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(0.32, 0.7, 0.36);
  legGeo.translate(0, -0.35, 0);
  const armGeo = new THREE.BoxGeometry(0.24, 0.65, 0.28);
  armGeo.translate(0, -0.3, 0);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const legL = new THREE.Mesh(legGeo, legMat);
  const legR = new THREE.Mesh(legGeo, legMat);
  const armL = new THREE.Mesh(armGeo, armMat);
  const armR = new THREE.Mesh(armGeo, armMat);
  legL.castShadow = true;
  legR.castShadow = true;
  armL.castShadow = true;
  armR.castShadow = true;
  legL.position.set(-0.2, 0.7, 0);
  legR.position.set(0.2, 0.7, 0);
  armL.position.set(-0.57, 1.35, 0);
  armR.position.set(0.57, 1.35, 0);
  const torso = place(box(0.9, 0.7, 0.45, shirt), 0, 1.05, 0);
  const head = place(box(0.55, 0.5, 0.5, skin), 0, 1.65, 0);
  const hairMesh = place(box(0.57, 0.16, 0.52, hair), 0, 1.94, 0);
  group.add(legL, legR, armL, armR, torso, head, hairMesh);
  if (hat === 'cap') {
    const cap = place(box(0.6, 0.14, 0.56, 0xd21f3c), 0, 1.98, 0);
    const brim = place(box(0.56, 0.06, 0.3, 0xd21f3c), 0, 1.93, 0.38);
    group.add(cap, brim);
  } else if (hat === 'fedora') {
    const top = place(box(0.4, 0.18, 0.4, 0x4a3a2a), 0, 2.0, 0);
    const brim = place(box(0.7, 0.05, 0.7, 0x4a3a2a), 0, 1.93, 0);
    group.add(top, brim);
  } else if (hat === 'beanie') {
    group.add(place(box(0.58, 0.2, 0.54, 0x2b6b8a), 0, 1.98, 0));
  } else if (hat === 'police') {
    const cap = place(box(0.6, 0.14, 0.56, 0x1a2a6b), 0, 1.98, 0);
    const brim = place(box(0.56, 0.06, 0.3, 0x111111), 0, 1.93, 0.38);
    const badge = place(box(0.12, 0.12, 0.05, 0xffd23a), 0, 2.0, 0.28);
    group.add(cap, brim, badge);
  }
  // A little stud on the chest so the avatar reads at a distance.
  const stud = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  stud.position.set(0, 1.2, 0.26);
  group.add(stud);
  group.scale.setScalar(height);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  return group;
}

// The blocky fallback car, used while a real model is still loading and
// for the truck, sports car and motorcycle (which have no GLB). The
// bike gets a rider; the police car gets a flashing light bar.
function makeCarMesh(color, kind, vtype) {
  const isPolice = kind === 'police';
  const group = new THREE.Group();
  if (vtype === 'bike') {
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.18, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    for (const wz of [0.9, -0.9]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.42, wz);
      wheel.castShadow = true;
      group.add(wheel);
    }
    group.add(place(box(0.5, 0.35, 2.6, color), 0, 0.75, 0));
    group.add(place(box(0.45, 0.2, 0.7, 0x222222), 0, 1.0, -0.3));
    group.add(place(box(0.9, 0.08, 0.12, 0x888888), 0, 1.05, 0.9));
    const rider = makeAvatar({ shirt: 0xe5534b, pants: 0x22242c, skin: 0xf2c48a, height: 0.9, hat: 'cap' });
    rider.position.set(0, 0.55, -0.2);
    group.add(rider);
    return group;
  }
  if (vtype === 'truck') {
    group.add(place(box(2.3, 1.1, 3.4, color), 0, 0.75, -0.6));
    group.add(place(box(2.2, 1.3, 1.6, isPolice ? 0xffffff : 0x222831), 0, 1.35, 1.6));
    group.add(place(box(2.0, 0.7, 0.1, 0x9fc3d8), 0, 1.5, 2.42));
  } else if (vtype === 'sports') {
    group.add(place(box(2.0, 0.5, 4.4, color), 0, 0.45, 0));
    group.add(place(box(1.7, 0.45, 1.8, 0x222831), 0, 0.9, -0.2));
    const spoiler = place(box(1.8, 0.08, 0.4, 0x111111), 0, 1.0, -2.0);
    const spoilerL = place(box(0.08, 0.35, 0.08, 0x111111), -0.7, 0.8, -2.0);
    const spoilerR = place(box(0.08, 0.35, 0.08, 0x111111), 0.7, 0.8, -2.0);
    group.add(spoiler, spoilerL, spoilerR);
  } else {
    group.add(place(box(2.1, 0.7, 4.6, color), 0, 0.55, 0));
    group.add(place(box(1.8, 0.6, 2.2, isPolice ? 0xffffff : 0x222831), 0, 1.2, -0.2));
    group.add(place(box(1.7, 0.5, 0.1, 0x9fc3d8), 0, 1.25, 0.95));
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: isPolice ? 0xff3b30 : 0xfff2b0 });
  const lightGeo = new THREE.BoxGeometry(0.35, 0.18, 0.1);
  const lightL = new THREE.Mesh(lightGeo, lightMat);
  const lightR = new THREE.Mesh(lightGeo, lightMat.clone());
  lightL.position.set(-0.7, 0.55, 2.32);
  lightR.position.set(0.7, 0.55, 2.32);
  lightL.visible = false;
  lightR.visible = false;
  group.add(lightL, lightR);
  group.userData.headlights = [lightL, lightR];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelPositions = vtype === 'truck'
    ? [[-0.95, 1.6], [0.95, 1.6], [-0.95, -1.4], [0.95, -1.4]]
    : [[-0.95, 1.55], [0.95, 1.55], [-0.95, -1.55], [0.95, -1.55]];
  for (const [wx, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    group.add(wheel);
  }
  if (isPolice) {
    const bar = place(box(1.2, 0.14, 0.5, 0x111111), 0, 1.62, -0.2);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    );
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2b4acb }),
    );
    red.position.set(-0.3, 1.78, -0.2);
    blue.position.set(0.3, 1.78, -0.2);
    group.add(bar, red, blue);
    group.userData.policeLights = { red, blue };
  }
  return group;
}

// One blocky gun model per weapon, held in Leo's right hand.
function makeGunMesh(id) {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x222831 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  if (id === 'pistol') {
    group.add(place(box(0.12, 0.16, 0.5, 0x222831), 0, 0, 0.25));
    group.add(place(box(0.1, 0.3, 0.12, 0x222831), 0, -0.2, 0));
  } else if (id === 'shotgun') {
    group.add(place(box(0.14, 0.14, 1.1, 0x222831), 0, 0, 0.4));
    group.add(place(box(0.16, 0.18, 0.5, 0x6b4a2a), 0, -0.02, -0.1));
    group.add(place(box(0.1, 0.1, 0.3, 0x888888), 0, 0.1, 0.7));
  } else {
    group.add(place(box(0.12, 0.12, 1.4, 0x222831), 0, 0, 0.5));
    group.add(place(box(0.14, 0.2, 0.4, 0x6b4a2a), 0, -0.05, -0.2));
    group.add(place(box(0.1, 0.08, 0.3, 0x111111), 0, 0.12, 0.3));
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  void dark;
  void wood;
  return group;
}

export function createRenderer(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 120, 420);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a5a3a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8b0, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 400;
  scene.add(sun);
  scene.add(sun.target);

  let cityMeshes = null;
  let cloudMeshes = [];
  let playerMesh = null;
  let muzzleMesh = null;
  const gunMeshes = new Map();
  const carMeshes = new Map();
  const npcMeshes = new Map();
  const pedMeshes = new Map();
  const bulletMeshes = [];
  const particleMeshes = [];
  const coinMeshes = [];
  let markerMesh = null;
  let markerBeam = null;
  let markerRing = null;
  let taxiMarker = null;
  let time = 0;
  let firstDraw = true;
  const smoothCam = new THREE.Vector3();
  const smoothLook = new THREE.Vector3();

  // The static city: ground, beach, water, parks, roads with dashes,
  // sidewalks, buildings with facades and shop signs, trees, palms, and
  // every plaza prop. Built once per renderer; the moving things are
  // synced in draw().
  function buildCity(city) {
    cityMeshes = new THREE.Group();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.width, WORLD.height),
      new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD.width / 2, 0, WORLD.height / 2);
    ground.receiveShadow = true;
    cityMeshes.add(ground);

    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.width, 34),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(WORLD.width / 2, 0.02, 463);
    beach.receiveShadow = true;
    cityMeshes.add(beach);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.width + 200, 120),
      new THREE.MeshLambertMaterial({ color: PALETTE.water }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(WORLD.width / 2, -0.4, WORLD.height + 55);
    cityMeshes.add(water);

    for (const park of city.parks) {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(park.width, park.depth),
        new THREE.MeshLambertMaterial({ color: PALETTE.park }),
      );
      p.rotation.x = -Math.PI / 2;
      p.position.set(park.x + park.width / 2, 0.03, park.z + park.depth / 2);
      p.receiveShadow = true;
      cityMeshes.add(p);
    }

    // Roads: dark strips with a dashed yellow centre line, and pale
    // sidewalks flanking them.
    for (const rx of VERTICAL_ROADS) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_WIDTH, WORLD.height),
        new THREE.MeshLambertMaterial({ color: PALETTE.road }),
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(rx, 0.04, WORLD.height / 2);
      road.receiveShadow = true;
      cityMeshes.add(road);
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(
          new THREE.PlaneGeometry(5, WORLD.height),
          new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
        );
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(rx + side * 9.5, 0.03, WORLD.height / 2);
        walk.receiveShadow = true;
        cityMeshes.add(walk);
      }
      for (let z = 20; z < WORLD.height; z += 40) {
        const dash = place(box(0.6, 0.05, 6, PALETTE.lane), rx, 0.06, z);
        cityMeshes.add(dash);
      }
    }
    for (const rz of HORIZONTAL_ROADS) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(WORLD.width, ROAD_WIDTH),
        new THREE.MeshLambertMaterial({ color: PALETTE.road }),
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(WORLD.width / 2, 0.04, rz);
      road.receiveShadow = true;
      cityMeshes.add(road);
      for (let x = 20; x < WORLD.width; x += 40) {
        const dash = place(box(6, 0.05, 0.6, PALETTE.lane), x, 0.06, rz);
        cityMeshes.add(dash);
      }
    }

    // Buildings: a coloured box, a darker roof slab, and — for the three
    // landmarks — the pack texture on the south face, plus shop signs.
    for (const b of city.buildings) {
      const cx = b.x + b.width / 2;
      const cz = b.z + b.depth / 2;
      const mesh = place(box(b.width, b.height, b.depth, b.color), cx, b.height / 2, cz);
      cityMeshes.add(mesh);
      const roofColor = new THREE.Color(b.color).multiplyScalar(0.7).getHex();
      cityMeshes.add(place(box(b.width + 0.6, 0.5, b.depth + 0.6, roofColor), cx, b.height + 0.25, cz));
      if (b.facade) {
        const aspect = FACADE_ASPECT[b.facade] || 1;
        const faceH = Math.min(b.height * 0.8, b.width / aspect);
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(b.width * 0.9, faceH),
          new THREE.MeshLambertMaterial({ map: loadTexture(b.facade) }),
        );
        face.position.set(cx, faceH / 2 + 0.5, b.z + b.depth + 0.06);
        cityMeshes.add(face);
      }
      if (b.kind === 'armory') {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(24, 6),
          new THREE.MeshBasicMaterial({ map: makeSignTexture(["MARIN'S ARMORY", 'GUNS · AMMO'], '#8a1a1a', '#ffd23a') }),
        );
        sign.position.set(cx, b.height - 2, b.z + b.depth + 0.08);
        cityMeshes.add(sign);
        // Weapon rack and ammo crates by the door.
        cityMeshes.add(place(box(3, 0.3, 0.6, 0x6b4a2a), cx - 6, 1.2, b.z + b.depth + 0.8));
        cityMeshes.add(place(box(1.2, 1.2, 1.2, 0x8a6b3a), cx + 8, 0.6, b.z + b.depth + 1));
        cityMeshes.add(place(box(1.2, 1.2, 1.2, 0x8a6b3a), cx + 9.4, 0.6, b.z + b.depth + 1));
      }
      if (b.kind === 'musicstore') {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(26, 6.5),
          new THREE.MeshBasicMaterial({ map: makeSignTexture(['VINYL BAY RECORDS', 'RECORD ROW'], '#7a3ab8', '#ffffff') }),
        );
        sign.position.set(cx, b.height - 2, b.z + b.depth + 0.08);
        cityMeshes.add(sign);
      }
      if (b.kind === 'dealership') {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(24, 6),
          new THREE.MeshBasicMaterial({ map: makeSignTexture(['COMET MOTORS', 'COMET 01 · IN STOCK'], '#e5534b', '#ffffff') }),
        );
        sign.position.set(cx, b.height - 1.5, b.z + b.depth + 0.08);
        cityMeshes.add(sign);
      }
    }

    // Trees in the blocks and palms along the beach.
    for (const t of city.trees) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 2, 6),
        new THREE.MeshLambertMaterial({ color: PALETTE.trunk }),
      );
      trunk.position.set(t.x, 1, t.z);
      trunk.castShadow = true;
      const top = place(box(t.h * 0.8, t.h, t.h * 0.8, PALETTE.tree), t.x, 2 + t.h / 2, t.z);
      cityMeshes.add(trunk, top);
    }

    // Plaza props.
    for (const prop of city.props) {
      if (prop.kind === 'kiosk') {
        cityMeshes.add(place(box(4, 3, 3, PALETTE.kiosk), prop.x, 1.5, prop.z));
        cityMeshes.add(place(box(4.6, 0.3, 3.6, 0xffd23a), prop.x, 3.2, prop.z));
      } else if (prop.kind === 'foodcart') {
        cityMeshes.add(place(box(3, 2, 2, PALETTE.foodCart), prop.x, 1, prop.z));
        cityMeshes.add(place(box(3.4, 0.2, 2.4, 0xffffff), prop.x, 2.2, prop.z));
      } else if (prop.kind === 'billboard') {
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(16, 16 / (FACADE_ASPECT[prop.texture] || 1)),
          new THREE.MeshLambertMaterial({ map: loadTexture(prop.texture) }),
        );
        board.position.set(prop.x, 8, prop.z);
        cityMeshes.add(board);
        cityMeshes.add(place(box(0.5, 8, 0.5, 0x333344), prop.x - 6, 4, prop.z));
        cityMeshes.add(place(box(0.5, 8, 0.5, 0x333344), prop.x + 6, 4, prop.z));
      } else if (prop.kind === 'busstop') {
        cityMeshes.add(place(box(4, 0.4, 1.2, 0x888888), prop.x, 0.8, prop.z));
        cityMeshes.add(place(box(0.2, 2.4, 0.2, 0x333344), prop.x - 1.8, 1.2, prop.z));
        cityMeshes.add(place(box(1.2, 0.8, 0.1, 0x4fc3f7), prop.x - 1.8, 2.8, prop.z));
      } else if (prop.kind === 'stall') {
        cityMeshes.add(place(box(3, 1.2, 2, 0xe8a13a), prop.x, 0.6, prop.z));
        cityMeshes.add(place(box(3.4, 0.2, 2.4, 0xe5534b), prop.x, 1.6, prop.z));
      } else if (prop.kind === 'bench') {
        cityMeshes.add(place(box(2.4, 0.2, 0.8, 0x8a6b3a), prop.x, 0.6, prop.z));
        cityMeshes.add(place(box(2.4, 0.8, 0.15, 0x8a6b3a), prop.x, 1.0, prop.z - 0.4));
        cityMeshes.add(place(box(0.2, 0.5, 0.7, 0x333344), prop.x - 1, 0.25, prop.z));
        cityMeshes.add(place(box(0.2, 0.5, 0.7, 0x333344), prop.x + 1, 0.25, prop.z));
      } else if (prop.kind === 'planter') {
        cityMeshes.add(place(box(1.4, 0.8, 1.4, 0x6b4a2a), prop.x, 0.4, prop.z));
        cityMeshes.add(place(box(1.2, 0.6, 1.2, PALETTE.tree), prop.x, 1.0, prop.z));
      } else if (prop.kind === 'palm') {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.35, prop.h, 6),
          new THREE.MeshLambertMaterial({ color: PALETTE.trunk }),
        );
        trunk.position.set(prop.x, prop.h / 2, prop.z);
        trunk.castShadow = true;
        cityMeshes.add(trunk);
        for (let a = 0; a < 4; a += 1) {
          const leaf = place(box(3, 0.15, 0.8, PALETTE.palm), prop.x, prop.h + 0.3, prop.z);
          leaf.rotation.y = (a * Math.PI) / 2;
          cityMeshes.add(leaf);
        }
      } else if (prop.kind === 'lamp') {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.15, 5, 6),
          new THREE.MeshLambertMaterial({ color: 0x333344 }),
        );
        pole.position.set(prop.x, 2.5, prop.z);
        cityMeshes.add(pole);
        cityMeshes.add(place(box(0.7, 0.3, 0.7, 0xfff2b0), prop.x, 5.1, prop.z));
      } else if (prop.kind === 'sign') {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(10, 2.5),
          new THREE.MeshBasicMaterial({ map: makeSignTexture([prop.text], '#222831', `#${prop.color.toString(16).padStart(6, '0')}`) }),
        );
        sign.position.set(prop.x, 6, prop.z);
        cityMeshes.add(sign);
        cityMeshes.add(place(box(0.4, 6, 0.4, 0x333344), prop.x - 4, 3, prop.z));
        cityMeshes.add(place(box(0.4, 6, 0.4, 0x333344), prop.x + 4, 3, prop.z));
      } else if (prop.kind === 'lighthouse') {
        const tower = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 2.2, 14, 8),
          new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
        );
        tower.position.set(prop.x, 7, prop.z);
        tower.castShadow = true;
        cityMeshes.add(tower);
        cityMeshes.add(place(box(4.6, 1, 4.6, 0xe5534b), prop.x, 4, prop.z));
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(1.2, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xffe14d }),
        );
        lamp.position.set(prop.x, 14.6, prop.z);
        cityMeshes.add(lamp);
      } else if (prop.kind === 'pier') {
        cityMeshes.add(place(box(2.5, 0.4, 18, 0x8a6b3a), prop.x, 0.2, prop.z + 8));
      }
    }

    // Drifting clouds.
    cloudMeshes = [];
    for (let i = 0; i < 6; i += 1) {
      const cloud = new THREE.Group();
      cloud.add(place(box(14, 2.5, 6, 0xffffff), 0, 0, 0));
      cloud.add(place(box(8, 2, 5, 0xffffff), 4, 1, 0));
      cloud.position.set(i * 110 + 20, 48 + (i % 3) * 8, 60 + (i % 4) * 90);
      cityMeshes.add(cloud);
      cloudMeshes.push(cloud);
    }

    // Mission marker: a spinning gold diamond on a light beam over a
    // pulsing ring, plus a cyan marker for the taxi fare.
    markerMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23a }),
    );
    markerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 30, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.25 }),
    );
    markerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    markerRing.rotation.x = -Math.PI / 2;
    taxiMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4),
      new THREE.MeshBasicMaterial({ color: 0x4fc3f7 }),
    );
    cityMeshes.add(markerMesh, markerBeam, markerRing, taxiMarker);
    scene.add(cityMeshes);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function syncAvatar(group, x, y, z, heading, walkPhase, moving) {
    group.position.set(x, y, z);
    group.rotation.y = heading;
    const swing = moving ? Math.sin(walkPhase) * 0.55 : 0;
    group.userData.legL.rotation.x = swing;
    group.userData.legR.rotation.x = -swing;
    group.userData.armL.rotation.x = -swing;
    group.userData.armR.rotation.x = swing;
  }

  function draw(state, cameraYaw, cameraPitch, dusk) {
    time += 1 / 60;
    if (!cityMeshes) buildCity(state.city);
    scene.background = new THREE.Color(dusk ? 0xff9e5e : PALETTE.sky);
    scene.fog.color = new THREE.Color(dusk ? 0xff9e5e : PALETTE.sky);
    const p = state.player;
    // Sun follows the player so shadows stay crisp wherever Leo goes.
    sun.position.set(p.x + 80, 120, p.z + 40);
    sun.target.position.set(p.x, 0, p.z);
    for (let i = 0; i < cloudMeshes.length; i += 1) {
      cloudMeshes[i].position.x += 0.03;
      if (cloudMeshes[i].position.x > WORLD.width + 40) cloudMeshes[i].position.x = -40;
    }
    // Player avatar (Leo Marin, yellow shirt).
    if (!playerMesh) {
      playerMesh = makeAvatar({ shirt: PALETTE.avatarShirt, pants: PALETTE.avatarPants, skin: PALETTE.avatarSkin, height: 1, hat: null, hair: 0x2a1a12 });
      scene.add(playerMesh);
    }
    playerMesh.visible = !p.inCar;
    if (!p.inCar) syncAvatar(playerMesh, p.x, p.y, p.z, p.heading, p.x * 0.4 + p.z * 0.4 + state.time * 8, p.speed > 0.5);
    // The gun in Leo's hand: one blocky model per weapon, shown only for
    // the equipped gun, with a muzzle flash while the flash timer runs.
    const currentGun = state.weapons ? state.weapons.current : null;
    for (const id of ['pistol', 'shotgun', 'rifle']) {
      let gun = gunMeshes.get(id);
      if (!gun) {
        gun = makeGunMesh(id);
        gun.position.set(0.55, 1.05, 0.35);
        playerMesh.add(gun);
        gunMeshes.set(id, gun);
      }
      gun.visible = !p.inCar && currentGun === id;
    }
    if (!muzzleMesh) {
      muzzleMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffe14d }),
      );
      muzzleMesh.position.set(0.55, 1.05, 1.5);
      playerMesh.add(muzzleMesh);
    }
    muzzleMesh.visible = !p.inCar && !!currentGun && state.weapons.muzzle > 0;

    // Named mission givers stand at their places, distinct from the crowd.
    const seenNpcs = new Set();
    for (const npc of state.npcs || []) {
      seenNpcs.add(npc.id);
      let mesh = npcMeshes.get(npc.id);
      if (!mesh) {
        mesh = makeAvatar({ shirt: npc.shirt, pants: npc.pants, skin: npc.skin, height: npc.height, hat: npc.hat, hair: npc.hair });
        scene.add(mesh);
        npcMeshes.set(npc.id, mesh);
      }
      syncAvatar(mesh, npc.x, 0, npc.z, npc.heading, npc.walkPhase || 0, false);
    }
    for (const [id, mesh] of [...npcMeshes]) {
      if (!seenNpcs.has(id)) { scene.remove(mesh); npcMeshes.delete(id); }
    }

    // Cars — a sedan or a police car uses its real low-poly model once it
    // has loaded, and falls back to the blocky car until then. A mesh
    // built one way is rebuilt the other way if the model's readiness
    // changes, so a late load still swaps the model in mid-game.
    const seenCars = new Set();
    for (const car of state.cars) {
      seenCars.add(car.id);
      const wantModel = !!car.model && carModelReady(car.model);
      let mesh = carMeshes.get(car.id);
      if (mesh && !!mesh.userData.isModel !== wantModel) {
        scene.remove(mesh);
        carMeshes.delete(car.id);
        mesh = null;
      }
      if (!mesh) {
        mesh = wantModel ? makeModelCar(car.model) : makeCarMesh(car.color, car.kind, car.vtype);
        scene.add(mesh);
        carMeshes.set(car.id, mesh);
      }
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.heading;
      if (mesh.userData.isModel) updateModelCar(mesh, car, 1 / 60, state.headlights);
      if (mesh.userData.headlights) {
        for (const lamp of mesh.userData.headlights) lamp.visible = !!state.headlights;
      }
      if (car.kind === 'police' && mesh.userData.policeLights) {
        const on = Math.floor(time * 4) % 2 === 0;
        mesh.userData.policeLights.red.material.color.setHex(on ? 0xff3b30 : 0x551111);
        mesh.userData.policeLights.blue.material.color.setHex(on ? 0x111155 : 0x2b4acb);
      }
    }
    for (const [id, mesh] of [...carMeshes]) {
      if (!seenCars.has(id)) { scene.remove(mesh); carMeshes.delete(id); }
    }
    // Pedestrians (and police on foot), each with their own outfit/height/hat.
    const seenPeds = new Set();
    state.peds.forEach((ped, index) => {
      const key = `ped-${index}`;
      seenPeds.add(key);
      let mesh = pedMeshes.get(key);
      if (!mesh) {
        mesh = makeAvatar({ shirt: ped.shirt, pants: ped.pants || 0x333344, skin: ped.color, height: ped.height || 1, hat: ped.hat || null, hair: 0x2a1a12 });
        scene.add(mesh);
        pedMeshes.set(key, mesh);
      }
      syncAvatar(mesh, ped.x, 0, ped.z, ped.heading, ped.walkPhase, true);
    });
    for (const [key, mesh] of [...pedMeshes]) {
      if (!seenPeds.has(key)) { scene.remove(mesh); pedMeshes.delete(key); }
    }
    // Bullets, coloured by the gun that fired them (pistol gold, shotgun
    // orange, rifle blue tracer).
    while (bulletMeshes.length < state.bullets.length) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
      scene.add(m);
      bulletMeshes.push(m);
    }
    state.bullets.forEach((b, i) => {
      bulletMeshes[i].position.set(b.x, b.y, b.z);
      bulletMeshes[i].material.color.setHex((b.weapon && WEAPONS[b.weapon] && WEAPONS[b.weapon].tracer) || 0xffe14d);
    });
    bulletMeshes.forEach((m, i) => { m.visible = i < state.bullets.length; });
    // Particles
    while (particleMeshes.length < state.particles.length) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5), new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.6 }));
      scene.add(m);
      particleMeshes.push(m);
    }
    state.particles.forEach((pt, i) => {
      particleMeshes[i].position.set(pt.x, pt.y, pt.z);
      particleMeshes[i].material.opacity = Math.max(0, pt.life);
    });
    particleMeshes.forEach((m, i) => { m.visible = i < state.particles.length; });
    // Sun coins on the beach: spinning gold discs.
    while (coinMeshes.length < (state.coins || []).length) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 0.2, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd23a }),
      );
      scene.add(m);
      coinMeshes.push(m);
    }
    (state.coins || []).forEach((coin, i) => {
      coinMeshes[i].visible = !coin.taken;
      coinMeshes[i].position.set(coin.x, 1 + Math.sin(time * 3 + i) * 0.3, coin.z);
      coinMeshes[i].rotation.y = time * 2 + i;
    });
    // Mission marker
    if (state.missionTarget && markerMesh) {
      markerMesh.visible = true;
      markerBeam.visible = true;
      markerRing.visible = true;
      markerMesh.position.set(state.missionTarget.x, 5 + Math.sin(time * 2) * 0.5, state.missionTarget.z);
      markerMesh.rotation.y = time;
      markerBeam.position.set(state.missionTarget.x, 15, state.missionTarget.z);
      markerRing.position.set(state.missionTarget.x, 0.15, state.missionTarget.z);
      const pulse = 3.4 + Math.sin(time * 3) * 0.4;
      markerRing.scale.set(pulse / 3.4, pulse / 3.4, 1);
    } else if (markerMesh) {
      markerMesh.visible = false;
      markerBeam.visible = false;
      markerRing.visible = false;
    }
    // Taxi marker (cyan): pickup, then destination.
    if (state.taxi && taxiMarker) {
      const target = state.taxi.pickedUp ? state.taxi.dest : state.taxi.pickup;
      taxiMarker.visible = true;
      taxiMarker.position.set(target.x, 4 + Math.sin(time * 2.5) * 0.4, target.z);
      taxiMarker.rotation.y = time * 1.5;
    } else if (taxiMarker) {
      taxiMarker.visible = false;
    }
    // Third-person camera with a smooth lag: the camera chases the player
    // instead of snapping to them, which reads as a steadier, calmer shot.
    const dist = p.inCar ? 15 : 12;
    const height = 6 + cameraPitch * 4;
    const desired = new THREE.Vector3(
      p.x + Math.sin(cameraYaw) * dist,
      height,
      p.z + Math.cos(cameraYaw) * dist,
    );
    const look = new THREE.Vector3(p.x, 1.6, p.z);
    if (firstDraw) {
      smoothCam.copy(desired);
      smoothLook.copy(look);
      firstDraw = false;
    } else {
      smoothCam.lerp(desired, 0.14);
      smoothLook.lerp(look, 0.2);
    }
    camera.position.copy(smoothCam);
    camera.lookAt(smoothLook);
    renderer.render(scene, camera);
  }

  function drawMinimap(state, mapCanvas) {
    const ctx = mapCanvas.getContext('2d');
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    const sx = w / WORLD.width;
    const sz = h / WORLD.height;
    ctx.fillStyle = '#4a8a4f';
    ctx.fillRect(0, 0, w, h);
    // Beach and water along the south edge.
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(0, 448 * sz, w, 32 * sz);
    ctx.fillStyle = '#1e6f8e';
    ctx.fillRect(0, 478 * sz, w, 2 * sz);
    // Roads.
    ctx.fillStyle = '#2b2f38';
    for (const rx of VERTICAL_ROADS) ctx.fillRect((rx - 7) * sx, 0, 14 * sx, h);
    for (const rz of HORIZONTAL_ROADS) ctx.fillRect(0, (rz - 7) * sz, w, 14 * sz);
    // Buildings.
    ctx.fillStyle = '#8a8a9a';
    for (const b of state.city.buildings) {
      ctx.fillRect(b.x * sx, b.z * sz, b.width * sx, b.depth * sz);
    }
    // Mission target.
    if (state.missionTarget) {
      ctx.fillStyle = '#ffd23a';
      const tx = state.missionTarget.x * sx;
      const tz = state.missionTarget.z * sz;
      ctx.beginPath();
      ctx.moveTo(tx, tz - 6);
      ctx.lineTo(tx + 6, tz);
      ctx.lineTo(tx, tz + 6);
      ctx.lineTo(tx - 6, tz);
      ctx.closePath();
      ctx.fill();
    }
    // Taxi fare.
    if (state.taxi) {
      const target = state.taxi.pickedUp ? state.taxi.dest : state.taxi.pickup;
      ctx.fillStyle = '#4fc3f7';
      ctx.beginPath();
      ctx.arc(target.x * sx, target.z * sz, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sun coins.
    ctx.fillStyle = '#ffd23a';
    for (const coin of state.coins || []) {
      if (!coin.taken) ctx.fillRect(coin.x * sx - 2, coin.z * sz - 2, 4, 4);
    }
    // Cars and police.
    for (const car of state.cars) {
      ctx.fillStyle = car.kind === 'police' ? '#ff3b30' : '#f2f2f2';
      ctx.fillRect(car.x * sx - 2, car.z * sz - 2, 4, 4);
    }
    // Player, with a heading tick.
    const p = state.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x * sx, p.z * sz, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(p.x * sx, p.z * sz);
    ctx.lineTo((p.x + Math.sin(p.heading) * 12) * sx, (p.z + Math.cos(p.heading) * 12) * sz);
    ctx.stroke();
  }

  function debugCars() {
    const out = [];
    for (const [id, mesh] of carMeshes) {
      out.push({
        id,
        x: mesh.position.x,
        z: mesh.position.z,
        heading: mesh.rotation.y,
        isModel: !!mesh.userData.isModel,
        model: mesh.userData.modelId || null,
        // Wheel state, for play-tests: spin grows with speed, steer is
        // the front wheels' angle (0 for blocky cars).
        spin: mesh.userData.spin || 0,
        steer: mesh.userData.steer || 0,
        headlights: mesh.userData.headlights ? mesh.userData.headlights[0].visible : false,
      });
    }
    return out;
  }

  loadCarModels();
  resize();
  window.addEventListener('resize', resize);
  return { draw, drawMinimap, resize, debugCars };
}
