// Drawing only, in 3D: a Three.js scene for Solara Bay, built from blocky
// boxes — blocky avatars, blocky cars, blocky buildings. No textures from
// outside, no network: every material is a flat colour. v2 adds real-time
// shadows from a warm sun, drifting clouds, a second district's taller
// towers, a lighthouse, a pier, palms, lamps, billboards and benches, four
// vehicle shapes (sedan, sports car, truck, motorcycle with a rider),
// avatars with heights, hair and hats, a smooth lagging follow camera, and a
// much richer minimap (north, player arrow, police blips, mission marker,
// taxi and coin dots). The camera is a third-person follow camera; the
// minimap is a separate 2D canvas.
import * as THREE from 'three';
import { PALETTE, WORLD } from './config.js';
import { HORIZONTAL_ROADS, ROAD_WIDTH, VERTICAL_ROADS } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// opts: shirt, pants, skin, height (scale), hat ('cap'|'fedora'|'beanie'|'police'|null), hair colour.
function makeAvatar(opts) {
  const { shirt, pants, skin, height = 1, hat = null, hair = 0x2a1a12 } = opts || {};
  const group = new THREE.Group();
  const legL = box(0.32, 0.7, 0.36, pants);
  legL.position.set(-0.2, 0.35, 0);
  const legR = box(0.32, 0.7, 0.36, pants);
  legR.position.set(0.2, 0.35, 0);
  const torso = box(0.9, 0.7, 0.45, shirt);
  torso.position.set(0, 1.05, 0);
  const armL = box(0.24, 0.65, 0.28, shirt);
  armL.position.set(-0.58, 1.05, 0);
  const armR = box(0.24, 0.65, 0.28, shirt);
  armR.position.set(0.58, 1.05, 0);
  const head = box(0.55, 0.5, 0.5, skin);
  head.position.set(0, 1.65, 0);
  const hairMesh = box(0.57, 0.16, 0.52, hair);
  hairMesh.position.set(0, 1.88, 0);
  group.add(legL, legR, torso, armL, armR, head, hairMesh);
  if (hat === 'cap') {
    const cap = box(0.6, 0.14, 0.56, 0xd21f3c);
    cap.position.set(0, 1.96, 0);
    const brim = box(0.56, 0.06, 0.3, 0xd21f3c);
    brim.position.set(0, 1.9, 0.38);
    group.add(cap, brim);
  } else if (hat === 'fedora') {
    const top = box(0.4, 0.18, 0.4, 0x4a3a2a);
    top.position.set(0, 1.98, 0);
    const brim = box(0.7, 0.05, 0.7, 0x4a3a2a);
    brim.position.set(0, 1.9, 0);
    group.add(top, brim);
  } else if (hat === 'beanie') {
    const beanie = box(0.58, 0.2, 0.54, 0x2b6b8a);
    beanie.position.set(0, 1.92, 0);
    group.add(beanie);
  } else if (hat === 'police') {
    const cap = box(0.6, 0.14, 0.56, 0x1a2a6b);
    cap.position.set(0, 1.96, 0);
    const brim = box(0.56, 0.06, 0.3, 0x111111);
    brim.position.set(0, 1.9, 0.38);
    const badge = box(0.12, 0.12, 0.05, 0xffd23a);
    badge.position.set(0, 1.55, 0.26);
    group.add(cap, brim, badge);
  }
  const stud = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.08, 8),
    new THREE.MeshLambertMaterial({ color: 0x333333 }),
  );
  stud.position.set(0, 1.94, 0);
  if (!hat) group.add(stud);
  group.scale.set(height, height, height);
  group.userData = { legL, legR, armL, armR };
  return group;
}

function makeCarMesh(color, kind, vtype) {
  const isPolice = kind === 'police';
  const group = new THREE.Group();
  if (vtype === 'bike') {
    // Motorcycle: two wheels, a low seat and a rider already seated on it.
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.18, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    for (const wz of [0.9, -0.9]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.42, wz);
      group.add(wheel);
    }
    const body = box(0.5, 0.35, 2.6, color);
    body.position.set(0, 0.75, 0);
    const seat = box(0.45, 0.2, 0.7, 0x222222);
    seat.position.set(0, 0.95, -0.4);
    const bars = box(0.9, 0.08, 0.12, 0x888888);
    bars.position.set(0, 1.05, 0.9);
    group.add(body, seat, bars);
    const rider = makeAvatar({ shirt: 0xe5534b, pants: 0x22242c, skin: 0xf2c48a, height: 0.9, hat: 'cap' });
    rider.position.set(0, 0.55, -0.35);
    rider.rotation.x = -0.4;
    group.add(rider);
    return group;
  }
  if (vtype === 'truck') {
    const body = box(2.3, 1.1, 3.4, color);
    body.position.set(0, 0.85, -0.9);
    const cabin = box(2.2, 1.3, 1.6, isPolice ? 0xffffff : 0x222831);
    cabin.position.set(0, 0.95, 1.6);
    const windshield = box(2.0, 0.7, 0.1, 0x9fc3d8);
    windshield.position.set(0, 1.1, 2.42);
    group.add(body, cabin, windshield);
  } else if (vtype === 'sports') {
    const body = box(2.0, 0.5, 4.4, color);
    body.position.set(0, 0.45, 0);
    const cabin = box(1.7, 0.45, 1.8, 0x222831);
    cabin.position.set(0, 0.9, -0.3);
    const spoiler = box(1.8, 0.08, 0.4, 0x111111);
    spoiler.position.set(0, 0.95, -2.1);
    const spoilerL = box(0.08, 0.35, 0.08, 0x111111);
    spoilerL.position.set(-0.8, 0.75, -2.1);
    const spoilerR = spoilerL.clone();
    spoilerR.position.x = 0.8;
    group.add(body, cabin, spoiler, spoilerL, spoilerR);
  } else {
    const body = box(2.1, 0.7, 4.6, color);
    body.position.set(0, 0.55, 0);
    const cabin = box(1.8, 0.6, 2.2, isPolice ? 0xffffff : 0x222831);
    cabin.position.set(0, 1.2, -0.2);
    group.add(body, cabin);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: isPolice ? 0xff3b30 : 0xfff2b0 });
  const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
  lightL.position.set(-0.7, 0.6, 2.32);
  const lightR = lightL.clone();
  lightR.position.x = 0.7;
  group.add(lightL, lightR);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelPositions = vtype === 'truck'
    ? [[-1.05, 1.8], [1.05, 1.8], [-1.05, -1.8], [1.05, -1.8], [-1.05, -0.4], [1.05, -0.4]]
    : [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]];
  for (const [wx, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
  }
  if (isPolice) {
    const bar = box(1.2, 0.18, 0.5, 0x111111);
    bar.position.set(0, 1.6, -0.2);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    red.position.set(-0.3, 1.72, -0.2);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0x2b4acb }));
    blue.position.set(0.3, 1.72, -0.2);
    group.add(bar, red, blue);
    group.userData.policeLights = { red, blue };
  }
  return group;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 120, 320);
  const hemi = new THREE.HemisphereLight(0xfff2d8, 0x3a5a3a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.6);
  sun.position.set(80, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 400;
  scene.add(sun);
  scene.add(sun.target);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 800);

  let cityMeshes = null;
  const carMeshes = new Map();
  const pedMeshes = new Map();
  const npcMeshes = new Map();
  let playerMesh = null;
  let markerMesh = null;
  let markerBeam = null;
  let markerRing = null;
  let taxiMarker = null;
  const coinMeshes = [];
  const cloudMeshes = [];
  const bulletMeshes = [];
  const particleMeshes = [];
  let time = 0;
  let firstDraw = true;
  const smoothCam = new THREE.Vector3();
  const smoothLook = new THREE.Vector3();

  function buildCity(city) {
    if (cityMeshes) scene.remove(cityMeshes);
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
      new THREE.PlaneGeometry(WORLD.width, 36),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(WORLD.width / 2, 0.05, WORLD.height - 18);
    beach.receiveShadow = true;
    cityMeshes.add(beach);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.width, 24),
      new THREE.MeshLambertMaterial({ color: PALETTE.water }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(WORLD.width / 2, 0.04, WORLD.height + 10);
    cityMeshes.add(water);
    for (const park of city.parks) {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(park.width, park.depth),
        new THREE.MeshLambertMaterial({ color: PALETTE.park }),
      );
      p.rotation.x = -Math.PI / 2;
      p.position.set(park.x + park.width / 2, 0.06, park.z + park.depth / 2);
      p.receiveShadow = true;
      cityMeshes.add(p);
    }
    for (const rx of VERTICAL_ROADS) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_WIDTH, WORLD.height),
        new THREE.MeshLambertMaterial({ color: PALETTE.road }),
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(rx, 0.08, WORLD.height / 2);
      road.receiveShadow = true;
      cityMeshes.add(road);
      for (let z = 20; z < WORLD.height; z += 24) {
        const dash = new THREE.Mesh(
          new THREE.PlaneGeometry(0.6, 6),
          new THREE.MeshBasicMaterial({ color: PALETTE.lane }),
        );
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(rx, 0.1, z);
        cityMeshes.add(dash);
      }
    }
    for (const rz of HORIZONTAL_ROADS) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(WORLD.width, ROAD_WIDTH),
        new THREE.MeshLambertMaterial({ color: PALETTE.road }),
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(WORLD.width / 2, 0.09, rz);
      road.receiveShadow = true;
      cityMeshes.add(road);
      for (let x = 20; x < WORLD.width; x += 24) {
        const dash = new THREE.Mesh(
          new THREE.PlaneGeometry(6, 0.6),
          new THREE.MeshBasicMaterial({ color: PALETTE.lane }),
        );
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.11, rz);
        cityMeshes.add(dash);
      }
    }
    for (const b of city.buildings) {
      const mesh = box(b.width, b.height, b.depth, b.color);
      mesh.position.set(b.x + b.width / 2, b.height / 2, b.z + b.depth / 2);
      cityMeshes.add(mesh);
      const roof = box(b.width + 0.6, 0.5, b.depth + 0.6, b.harbor ? 0x1e3a4a : 0x22242c);
      roof.position.set(b.x + b.width / 2, b.height + 0.25, b.z + b.depth / 2);
      cityMeshes.add(roof);
      // Rooftop detail: a water tank on the taller towers.
      if (b.height > 24) {
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(1.4, 1.4, 2.2, 8),
          new THREE.MeshLambertMaterial({ color: 0x8a6b3a }),
        );
        tank.position.set(b.x + b.width / 2, b.height + 1.6, b.z + b.depth / 2);
        tank.castShadow = true;
        cityMeshes.add(tank);
      }
    }
    for (const t of city.trees) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 1.6, 6),
        new THREE.MeshLambertMaterial({ color: PALETTE.trunk }),
      );
      trunk.position.set(t.x, 0.8, t.z);
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(
        new THREE.BoxGeometry(t.h, t.h, t.h),
        new THREE.MeshLambertMaterial({ color: PALETTE.tree }),
      );
      leaves.position.set(t.x, 1.6 + t.h / 2, t.z);
      leaves.castShadow = true;
      cityMeshes.add(trunk, leaves);
    }
    // Props: palms, lamps, benches, billboards, lighthouse and pier.
    for (const prop of city.props || []) {
      if (prop.kind === 'palm') {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.4, prop.h, 6),
          new THREE.MeshLambertMaterial({ color: PALETTE.trunk }),
        );
        trunk.position.set(prop.x, prop.h / 2, prop.z);
        trunk.castShadow = true;
        const top = new THREE.Mesh(
          new THREE.BoxGeometry(3.4, 1.2, 3.4),
          new THREE.MeshLambertMaterial({ color: PALETTE.palm }),
        );
        top.position.set(prop.x, prop.h + 0.6, prop.z);
        top.castShadow = true;
        cityMeshes.add(trunk, top);
      } else if (prop.kind === 'lamp') {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 4.4, 6),
          new THREE.MeshLambertMaterial({ color: 0x22242c }),
        );
        pole.position.set(prop.x, 2.2, prop.z);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.35, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
        );
        bulb.position.set(prop.x, 4.5, prop.z);
        cityMeshes.add(pole, bulb);
      } else if (prop.kind === 'bench') {
        const bench = box(2.4, 0.4, 0.8, 0x8a6b3a);
        bench.position.set(prop.x, 0.5, prop.z);
        cityMeshes.add(bench);
      } else if (prop.kind === 'sign') {
        const board = box(10, 2.4, 0.4, prop.color);
        board.position.set(prop.x, 6, prop.z);
        const postL = box(0.4, 5, 0.4, 0x22242c);
        postL.position.set(prop.x - 4, 2.5, prop.z);
        const postR = postL.clone();
        postR.position.x = prop.x + 4;
        cityMeshes.add(board, postL, postR);
      } else if (prop.kind === 'lighthouse') {
        const tower = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 2.2, 16, 10),
          new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
        );
        tower.position.set(prop.x, 8, prop.z);
        tower.castShadow = true;
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(1.7, 1.7, 2, 10),
          new THREE.MeshLambertMaterial({ color: 0xd21f3c }),
        );
        band.position.set(prop.x, 12, prop.z);
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(1.1, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
        );
        lamp.position.set(prop.x, 16.8, prop.z);
        cityMeshes.add(tower, band, lamp);
      } else if (prop.kind === 'pier') {
        const planks = box(16, 0.5, 5, 0x8a6b3a);
        planks.position.set(prop.x, 0.4, prop.z);
        cityMeshes.add(planks);
      }
    }
    scene.add(cityMeshes);
    // Mission marker: a spinning yellow octahedron on a light beam, plus a
    // ground ring so the target reads from any camera angle.
    markerMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23a }),
    );
    markerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 30, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    markerRing = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 4.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    markerRing.rotation.x = -Math.PI / 2;
    taxiMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.3),
      new THREE.MeshBasicMaterial({ color: 0x4fc3f7 }),
    );
    scene.add(markerMesh, markerBeam, markerRing, taxiMarker);
    // Drifting blocky clouds.
    for (let i = 0; i < 6; i += 1) {
      const cloud = new THREE.Group();
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(14, 2.4, 7), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      c2.position.set(4, 1, 1);
      cloud.add(c1, c2);
      cloud.position.set(60 + i * 95, 55 + (i % 3) * 8, 40 + (i % 4) * 90);
      scene.add(cloud);
      cloudMeshes.push(cloud);
    }
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

    // Named mission givers stand at their places, distinct from the crowd.
    const seenNpcs = new Set();
    for (const npc of state.npcs || []) {
      seenNpcs.add(npc.id);
      let mesh = npcMeshes.get(npc.id);
      if (!mesh) {
        mesh = makeAvatar({ shirt: npc.char.shirt, pants: npc.char.pants, skin: npc.char.skin, height: npc.char.height, hat: npc.char.hat, hair: npc.char.hair });
        scene.add(mesh);
        npcMeshes.set(npc.id, mesh);
      }
      syncAvatar(mesh, npc.x, 0, npc.z, npc.heading, npc.walkPhase, false);
    }
    for (const [id, mesh] of [...npcMeshes]) {
      if (!seenNpcs.has(id)) { scene.remove(mesh); npcMeshes.delete(id); }
    }

    // Cars
    const seenCars = new Set();
    for (const car of state.cars) {
      seenCars.add(car.id);
      let mesh = carMeshes.get(car.id);
      if (!mesh) {
        mesh = makeCarMesh(car.color, car.kind, car.vtype);
        scene.add(mesh);
        carMeshes.set(car.id, mesh);
      }
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.heading;
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
    // Bullets
    while (bulletMeshes.length < state.bullets.length) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
      scene.add(m);
      bulletMeshes.push(m);
    }
    state.bullets.forEach((b, i) => bulletMeshes[i].position.set(b.x, b.y, b.z));
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
      const target = state.taxi.boarded ? state.taxi.dest : state.taxi.pickup;
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
    ctx.fillStyle = '#1c2a1e';
    ctx.fillRect(0, 0, w, h);
    // Parks and the beach strip.
    ctx.fillStyle = '#2f6b3d';
    for (const park of state.city.parks) ctx.fillRect(park.x * sx, park.z * sz, park.width * sx, park.depth * sz);
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(0, h - 8, w, 8);
    ctx.fillStyle = '#1e6f8e';
    ctx.fillRect(0, h - 2, w, 2);
    // Harbor district tint.
    ctx.fillStyle = 'rgba(79, 195, 247, 0.25)';
    ctx.fillRect(0, 0, 200 * sx, 200 * sz);
    ctx.fillStyle = '#2b2f38';
    for (const rx of VERTICAL_ROADS) ctx.fillRect(rx * sx - 2, 0, 4, h);
    for (const rz of HORIZONTAL_ROADS) ctx.fillRect(0, rz * sz - 2, w, 4);
    // North indicator.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('N', 6, 15);
    ctx.beginPath();
    ctx.moveTo(10, 18);
    ctx.lineTo(6, 26);
    ctx.lineTo(14, 26);
    ctx.closePath();
    ctx.fill();
    // Sun coins.
    ctx.fillStyle = '#ffd23a';
    for (const coin of state.coins || []) {
      if (coin.taken) continue;
      ctx.beginPath();
      ctx.arc(coin.x * sx, coin.z * sz, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Taxi: cyan square at the pickup, cyan ring at the destination.
    if (state.taxi) {
      const t = state.taxi.boarded ? state.taxi.dest : state.taxi.pickup;
      ctx.fillStyle = '#4fc3f7';
      ctx.fillRect(t.x * sx - 4, t.z * sz - 4, 8, 8);
    }
    // Mission marker: pulsing gold ring.
    if (state.missionTarget) {
      ctx.strokeStyle = '#ffd23a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.missionTarget.x * sx, state.missionTarget.z * sz, 6 + Math.sin(time * 3) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.arc(state.missionTarget.x * sx, state.missionTarget.z * sz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Named givers: purple dots.
    ctx.fillStyle = '#c98af2';
    for (const npc of state.npcs || []) {
      ctx.beginPath();
      ctx.arc(npc.x * sx, npc.z * sz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police blips.
    for (const u of state.police) {
      const e = u.car || u.ped;
      if (!e) continue;
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(e.x * sx - 3.5, e.z * sz - 3.5, 7, 7);
    }
    // Player arrow, pointing where Leo faces.
    const p = state.player;
    const px = p.x * sx;
    const pz = p.z * sz;
    ctx.fillStyle = '#f2c94c';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + Math.sin(p.heading) * 9, pz + Math.cos(p.heading) * 9);
    ctx.lineTo(px + Math.sin(p.heading + 2.5) * 6, pz + Math.cos(p.heading + 2.5) * 6);
    ctx.lineTo(px + Math.sin(p.heading - 2.5) * 6, pz + Math.cos(p.heading - 2.5) * 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, drawMinimap, resize };
}
