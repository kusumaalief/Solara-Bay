// The two real low-poly cars for Solara Bay: the orange Comet 01 is
// Leo's car and every stealable sedan; the blue-and-grey Interceptor is
// every police car. Both come from a free-to-use low-poly cars pack the
// entrant supplied (see the README credits). Their FBX files were
// converted to GLB with the length on Z (hood at +Z, the way the game
// drives), the width on X, the wheels on y=0 and the whole car scaled
// to the game's 4.6-unit sedan length. Each GLB keeps its four wheels
// as separate meshes under named steer pivots, so the game can spin
// them with speed and steer the front pair, and the police car gets a
// blocky red/blue light bar on its roof. The textures are the pack's
// PNGs, applied through the meshes' own UVs. Everything is local
// under game/ — no network.
//
// Loading is asynchronous (fetch the GLBs, parse them with the game's
// own tiny loader in glb.js): until a model is ready the renderer
// keeps the blocky car for that slot, then swaps the model in on the
// next frame, so a slow load never breaks the game.
import * as THREE from 'three';
import { CAR_MODELS } from './config.js';
import { loadGlb } from './glb.js';

const LOADED = new Map(); // modelId -> template Group (cloned per car)
let loadStarted = null;
let loadBroken = false;

async function loadOne(modelId) {
  const def = CAR_MODELS[modelId];
  const group = await loadGlb(def.glb);
  const tex = await new THREE.TextureLoader().loadAsync(def.texture);
  tex.colorSpace = THREE.SRGBColorSpace;
  const skin = new THREE.MeshLambertMaterial({ map: tex });
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.material = skin;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  LOADED.set(modelId, group);
}

// Start loading both models (once) and resolve when they are ready —
// or after a timeout, so a missing file can never stall the game or a shot.
export function loadCarModels() {
  if (loadStarted) return loadStarted;
  loadStarted = Promise.race([
    Promise.allSettled([loadOne('comet'), loadOne('police')]).then((results) => {
      loadBroken = results.some((r) => r.status === 'rejected');
      return !loadBroken;
    }),
    new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
  ]);
  return loadStarted;
}

export function carModelReady(modelId) {
  return LOADED.has(modelId);
}

export function carModelsFailed() {
  return loadBroken;
}

// Clone a loaded model into a drivable car mesh. userData carries the
// wheel pivots (FL/FR steer, all four spin), the spin angle, the
// previous heading (for steering) and, for police cars, the flashing
// light bar.
export function makeModelCar(modelId) {
  const template = LOADED.get(modelId);
  if (!template) return null;
  const def = CAR_MODELS[modelId];
  const group = template.clone(true);
  const pivots = {};
  const wheels = {};
  group.traverse((o) => {
    if (!o.name) return;
    if (o.name.indexOf('wheelPivot_') === 0) pivots[o.name.slice('wheelPivot_'.length)] = o;
    if (o.name.indexOf('wheel_') === 0) wheels[o.name.slice('wheel_'.length)] = o;
  });

  // Headlights: two bright blocks at the front, toggled with L.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const lampGeo = new THREE.BoxGeometry(0.34, 0.16, 0.1);
  const lamps = [];
  for (const side of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(side, def.headlightY, 2.28);
    lamp.visible = false;
    group.add(lamp);
    lamps.push(lamp);
  }

  if (modelId === 'police') {
    // A flashing red/blue bar on the roof, above the beacon the model
    // already carries — the blocky police bar, refitted to this roof line.
    const barMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.5), barMat);
    bar.position.set(0, def.lightBarY, -0.3);
    bar.castShadow = true;
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    );
    red.position.set(-0.3, def.lightBarY + 0.14, -0.3);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2b4acb }),
    );
    blue.position.set(0.3, def.lightBarY + 0.14, -0.3);
    group.add(bar, red, blue);
    group.userData.policeLights = { red, blue };
  }

  group.userData.isModel = true;
  group.userData.modelId = modelId;
  group.userData.pivots = pivots;
  group.userData.wheels = wheels;
  group.userData.headlights = lamps;
  group.userData.spin = 0;
  group.userData.prevHeading = 0;
  group.userData.steer = 0;
  return group;
}

// Per frame, for one model car: spin the four wheels with the car's
// speed, steer the front pair from how fast the heading is changing,
// and show or hide the headlights. dt is the frame step (1/60 in the
// render loop).
export function updateModelCar(mesh, car, dt, headlightsOn) {
  const def = CAR_MODELS[mesh.userData.modelId];
  const ud = mesh.userData;
  ud.spin += ((car.speed || 0) * dt) / def.wheelRadius;
  for (const key of Object.keys(ud.wheels)) {
    ud.wheels[key].rotation.x = ud.spin;
  }
  // Steering: the heading change this frame, wrapped, clamped and
  // smoothed, so the front wheels visibly turn into a corner and
  // straighten out after it.
  const change = car.heading - ud.prevHeading;
  const wrapped = Math.atan2(Math.sin(change), Math.cos(change));
  const wanted = Math.max(-0.45, Math.min(0.45, wrapped * 8));
  ud.steer += (wanted - ud.steer) * 0.3;
  ud.prevHeading = car.heading;
  if (ud.pivots.FL) ud.pivots.FL.rotation.y = ud.steer;
  if (ud.pivots.FR) ud.pivots.FR.rotation.y = ud.steer;
  for (const lamp of ud.headlights) lamp.visible = !!headlightsOn;
}
