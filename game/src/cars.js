// Real low-poly car models for Solara Bay v4 — the player's car and the
// police car are no longer blocky boxes. Both come from a free-to-use
// low-poly cars pack the entrant supplied (see README credits): Car_1
// (orange, "01") is Leo's car and every stealable sedan; Car_2 (blue/grey,
// "POLICE") is every police car. The FBX files were converted to GLB with
// the length on Z (front at +Z, the way the game drives), the width on X,
// the wheels touching y=0 and the whole car scaled to the game's 4.6-unit
// sedan length — see the converter notes in the commit. Each GLB keeps its
// four wheels as separate meshes inside named steer pivots, so the game
// can spin them with speed and steer the front pair, and the police car
// gets a blocky red/blue light bar on its roof on top of the beacon the
// model already carries. Textures are applied from the pack's PNGs via the
// meshes' own UVs. Everything is local under game/ — no network.
// Loading is asynchronous (GLTFLoader fetches the GLBs): until a model is
// ready the renderer keeps the v3 blocky car for that slot, then swaps it
// in on the next frame, so a slow load never breaks the game.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { CAR_MODELS } from './config.js';

const templates = new Map(); // modelId -> template Group (cloned per car)
let loadPromise = null;
let loadFailed = false;

function loadOne(modelId) {
  const def = CAR_MODELS[modelId];
  return new Promise((resolve, reject) => {
    const tex = new THREE.TextureLoader().load(def.texture);
    tex.colorSpace = THREE.SRGBColorSpace;
    new GLTFLoader().load(def.glb, (gltf) => {
      const group = gltf.scene;
      group.traverse((o) => {
        if (o.isMesh) {
          // One shared Lambert material per model, textured from the pack.
          o.material = new THREE.MeshLambertMaterial({ map: tex });
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      templates.set(modelId, group);
      resolve();
    }, undefined, reject);
  });
}

// Starts loading both models (once) and resolves when they are ready — or
// after a timeout, so a missing file can never stall the game or a shot.
export function loadCarModels() {
  if (loadPromise) return loadPromise;
  loadPromise = Promise.race([
    Promise.allSettled([loadOne('comet'), loadOne('police')]).then((results) => {
      loadFailed = results.some((r) => r.status === 'rejected');
      return !loadFailed;
    }),
    new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
  ]);
  return loadPromise;
}

export function carModelReady(modelId) {
  return templates.has(modelId);
}

export function carModelsFailed() {
  return loadFailed;
}

// Clone a loaded model into a drivable car mesh. userData carries the
// wheel pivots (FL/FR steer, all four spin), the spin angle, the previous
// heading (for steering) and, for police cars, the flashing light bar.
export function makeModelCar(modelId) {
  const template = templates.get(modelId);
  if (!template) return null;
  const group = template.clone(true);
  const pivots = {};
  const wheels = {};
  group.traverse((o) => {
    if (o.name && o.name.startsWith('wheelPivot_')) pivots[o.name.slice('wheelPivot_'.length)] = o;
    if (o.name && o.name.startsWith('wheel_')) wheels[o.name.slice('wheel_'.length)] = o;
  });
  // Headlights: two bright blocks at the front, toggled with L.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const headlightGeo = new THREE.BoxGeometry(0.34, 0.16, 0.1);
  const headlights = [];
  for (const hx of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(headlightGeo, lightMat);
    lamp.position.set(hx, CAR_MODELS[modelId].headlightY, 2.28);
    lamp.visible = false;
    group.add(lamp);
    headlights.push(lamp);
  }
  if (modelId === 'police') {
    // Flashing red/blue light bar on the roof, above the model's own
    // beacon — the v3 blocky police bar, refitted to this car's roof line.
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.16, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    bar.position.set(0, CAR_MODELS.police.lightBarY, -0.3);
    bar.castShadow = true;
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    );
    red.position.set(-0.3, CAR_MODELS.police.lightBarY + 0.14, -0.3);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2b4acb }),
    );
    blue.position.set(0.3, CAR_MODELS.police.lightBarY + 0.14, -0.3);
    group.add(bar, red, blue);
    group.userData.policeLights = { red, blue };
  }
  group.userData.isModel = true;
  group.userData.modelId = modelId;
  group.userData.pivots = pivots;
  group.userData.wheels = wheels;
  group.userData.headlights = headlights;
  group.userData.spin = 0;
  group.userData.prevHeading = 0;
  group.userData.steer = 0;
  return group;
}

// Per frame, for one model car: spin the four wheels with the car's speed,
// steer the front pair from how fast the heading is changing, and show or
// hide the headlights. dt is the frame step (1/60 in the render loop).
export function updateModelCar(mesh, car, dt, headlightsOn) {
  const def = CAR_MODELS[mesh.userData.modelId];
  const ud = mesh.userData;
  ud.spin += ((car.speed || 0) * dt) / def.wheelRadius;
  for (const key of Object.keys(ud.wheels)) {
    ud.wheels[key].rotation.x = ud.spin;
  }
  // Steering: the heading delta this frame, clamped and smoothed, so the
  // front wheels visibly turn into a corner and straighten out after it.
  const delta = car.heading - ud.prevHeading;
  const wrapped = Math.atan2(Math.sin(delta), Math.cos(delta));
  const target = Math.max(-0.45, Math.min(0.45, wrapped * 8));
  ud.steer += (target - ud.steer) * 0.3;
  ud.prevHeading = car.heading;
  if (ud.pivots.FL) ud.pivots.FL.rotation.y = ud.steer;
  if (ud.pivots.FR) ud.pivots.FR.rotation.y = ud.steer;
  for (const lamp of ud.headlights) lamp.visible = !!headlightsOn;
}
