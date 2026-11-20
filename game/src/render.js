// Drawing only, in 3D: a Three.js scene for Solara Bay, built from blocky
// boxes — blocky avatars, blocky cars, blocky buildings. No textures from
// outside, no network: every material is a flat colour. The camera is a
// third-person follow camera; the minimap is a separate 2D canvas.
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
  mesh.castShadow = false;
  return mesh;
}

function makeAvatar(shirt, pants, skin) {
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
  const stud = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.08, 8),
    new THREE.MeshLambertMaterial({ color: 0x333333 }),
  );
  stud.position.set(0, 1.94, 0);
  group.add(legL, legR, torso, armL, armR, head, stud);
  group.userData = { legL, legR, armL, armR };
  return group;
}

function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const body = box(2.1, 0.7, 4.6, color);
  body.position.set(0, 0.55, 0);
  const cabin = box(1.8, 0.6, 2.2, isPolice ? 0xffffff : 0x222831);
  cabin.position.set(0, 1.2, -0.2);
  const lightMat = new THREE.MeshBasicMaterial({ color: isPolice ? 0xff3b30 : 0xfff2b0 });
  const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
  lightL.position.set(-0.7, 0.6, 2.32);
  const lightR = lightL.clone();
  lightR.position.x = 0.7;
  group.add(body, cabin, lightL, lightR);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelPositions = [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]];
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
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 120, 320);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a5a3a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.4);
  sun.position.set(80, 120, 40);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 800);

  let cityMeshes = null;
  const carMeshes = new Map();
  const pedMeshes = new Map();
  let playerMesh = null;
  let markerMesh = null;
  let markerBeam = null;
  const bulletMeshes = [];
  const particleMeshes = [];
  let time = 0;

  function buildCity(city) {
    if (cityMeshes) scene.remove(cityMeshes);
    cityMeshes = new THREE.Group();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.width, WORLD.height),
      new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD.width / 2, 0, WORLD.height / 2);
    cityMeshes.add(ground);
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.width, 36),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(WORLD.width / 2, 0.05, WORLD.height - 18);
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
      cityMeshes.add(p);
    }
    for (const rx of VERTICAL_ROADS) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_WIDTH, WORLD.height),
        new THREE.MeshLambertMaterial({ color: PALETTE.road }),
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(rx, 0.08, WORLD.height / 2);
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
      const roof = box(b.width + 0.6, 0.5, b.depth + 0.6, 0x22242c);
      roof.position.set(b.x + b.width / 2, b.height + 0.25, b.z + b.depth / 2);
      cityMeshes.add(roof);
    }
    for (const t of city.trees) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 1.6, 6),
        new THREE.MeshLambertMaterial({ color: PALETTE.trunk }),
      );
      trunk.position.set(t.x, 0.8, t.z);
      const leaves = new THREE.Mesh(
        new THREE.BoxGeometry(t.h, t.h, t.h),
        new THREE.MeshLambertMaterial({ color: PALETTE.tree }),
      );
      leaves.position.set(t.x, 1.6 + t.h / 2, t.z);
      cityMeshes.add(trunk, leaves);
    }
    scene.add(cityMeshes);
    // Mission marker: a spinning yellow octahedron on a light beam.
    markerMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23a }),
    );
    markerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 30, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    scene.add(markerMesh, markerBeam);
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
    scene.background = new THREE.Color(dusk ? 0xe08a4b : PALETTE.sky);
    scene.fog.color = new THREE.Color(dusk ? 0xe08a4b : PALETTE.sky);
    const p = state.player;
    // Player avatar
    if (!playerMesh) {
      playerMesh = makeAvatar(PALETTE.avatarShirt, PALETTE.avatarPants, PALETTE.avatarSkin);
      scene.add(playerMesh);
    }
    playerMesh.visible = !p.inCar;
    if (!p.inCar) syncAvatar(playerMesh, p.x, p.y, p.z, p.heading, p.x * 0.4 + p.z * 0.4 + state.time * 8, p.speed > 0.5);

    // Cars
    const seenCars = new Set();
    for (const car of state.cars) {
      seenCars.add(car.id);
      let mesh = carMeshes.get(car.id);
      if (!mesh) {
        mesh = makeCarMesh(car.color, car.kind === 'police');
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
    // Pedestrians (and police on foot)
    const seenPeds = new Set();
    state.peds.forEach((ped, index) => {
      const key = `ped-${index}`;
      seenPeds.add(key);
      let mesh = pedMeshes.get(key);
      if (!mesh) {
        mesh = makeAvatar(ped.shirt, 0x333344, PALETTE.avatarSkin);
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
    // Mission marker
    if (state.missionTarget && markerMesh) {
      markerMesh.visible = true;
      markerBeam.visible = true;
      markerMesh.position.set(state.missionTarget.x, 5 + Math.sin(time * 2) * 0.5, state.missionTarget.z);
      markerMesh.rotation.y = time;
      markerBeam.position.set(state.missionTarget.x, 15, state.missionTarget.z);
    } else if (markerMesh) {
      markerMesh.visible = false;
      markerBeam.visible = false;
    }
    // Third-person camera: behind the player, orbit by yaw/pitch.
    const dist = p.inCar ? 17 : 13;
    const height = 6 + cameraPitch * 4;
    const cx = p.x + Math.sin(cameraYaw) * dist;
    const cz = p.z + Math.cos(cameraYaw) * dist;
    camera.position.set(cx, height, cz);
    camera.lookAt(p.x, 1.6, p.z);
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
    ctx.fillStyle = '#2b2f38';
    for (const rx of VERTICAL_ROADS) ctx.fillRect(rx * sx - 2, 0, 4, h);
    for (const rz of HORIZONTAL_ROADS) ctx.fillRect(0, rz * sz - 2, w, 4);
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(0, h - 6, w, 6);
    if (state.missionTarget) {
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.arc(state.missionTarget.x * sx, state.missionTarget.z * sz, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const u of state.police) {
      const e = u.car || u.ped;
      if (!e) continue;
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(e.x * sx - 3, e.z * sz - 3, 6, 6);
    }
    const p = state.player;
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(p.x * sx, p.z * sz, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(p.x * sx, p.z * sz);
    ctx.lineTo(p.x * sx + Math.sin(p.heading) * 10, p.z * sz + Math.cos(p.heading) * 10);
    ctx.stroke();
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, drawMinimap, resize };
}
