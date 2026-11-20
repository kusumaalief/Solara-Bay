// Screenshot scenes for Solara Bay 3D: ?shot=chase|drive|mission|menu
// (with &seed=N). Each one sets the real world to a fixed, readable scene —
// a police chase, a drive through traffic, an on-foot mission, the title
// screen at dusk — then the main loop paints it and sets window.__shotReady.
// No autopilot drives the game here: the scenes are staged positions, so the
// same seed always gives the same frame.
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function putPlayerInCar(state, x, z, heading) {
  const car = state.cars.find((c) => c.kind === 'player') || state.cars[0];
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = 22;
  car.kind = 'player';
  car.parked = false;
  state.player.inCar = car;
  state.player.x = x;
  state.player.z = z;
  state.player.heading = heading;
}

function addTrafficCar(state, x, z, heading, speed) {
  const car = {
    id: Math.floor(Math.random() * 1e9) + Math.floor(x * 10) + 7,
    x, z, heading, speed, color: 0xd86a2c, kind: 'traffic', parked: false, axis: 'x', dir: 1,
  };
  state.cars.push(car);
  return car;
}
function addPoliceCar(state, x, z, heading) {
  const car = {
    id: Math.floor(Math.random() * 1e9) + Math.floor(x * 10),
    x, z, heading, speed: 20, color: 0x2b4acb, kind: 'police', parked: false, axis: 'x', dir: 1,
  };
  state.cars.push(car);
  state.police.push({ car, kind: 'car' });
  return car;
}

export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'menu') {
    state.player.x = 280;
    state.player.z = 200;
    state.player.heading = Math.PI / 4;
    state.missionIndex = 0;
    state.missionStage = 0;
    world.setMissionTarget();
    return { screen: SCREEN_TITLE, dusk: true, cameraYaw: Math.PI * 0.75 };
  }
  if (name === 'chase') {
    putPlayerInCar(state, 280, 200, Math.PI / 2);
    state.wanted = 3;
    state.missionIndex = 0;
    state.missionStage = 1;
    world.setMissionTarget();
    state.missionTarget = { x: 580, z: 420, name: 'Docks' };
    state.missionText = 'Steal a car, then reach the docks marker';
    // Police ahead of Leo on the same road, so the chase reads in frame
    // (camera sits behind the player car, looking east down the road).
    addPoliceCar(state, 302, 194, Math.PI / 2);
    addPoliceCar(state, 310, 207, Math.PI / 2);
    addPoliceCar(state, 318, 200, Math.PI / 2);
    state.message = 'Police chase! Lose the heat';
    state.messageTimer = 10;
    return { screen: SCREEN_PLAY, dusk: false, cameraYaw: -Math.PI / 2 };
  }
  if (name === 'mission') {
    // Leo faces north toward Marina Bank (200, 120); the camera sits behind
    // him to the south, so the bank and its marker beam are in frame.
    state.player.x = 200;
    state.player.z = 140;
    state.player.heading = Math.PI;
    state.wanted = 2;
    state.missionIndex = 2;
    state.missionStage = 0;
    world.setMissionTarget();
    state.missionText = 'Grab the cash, then reach the safehouse';
    const ped = { x: 208, z: 132, heading: -Math.PI / 4, speed: 9, color: 0x1a2a6b, shirt: 0x1a2a6b, health: 100, police: true, flee: 0, arrestTimer: 0, walkPhase: 0 };
    state.peds.push(ped);
    state.police.push({ ped, kind: 'foot' });
    state.message = 'Marina Bank — grab the cash (F)';
    state.messageTimer = 10;
    return { screen: SCREEN_PLAY, dusk: false, cameraYaw: 0 };
  }
  // drive (default)
  putPlayerInCar(state, 360, 120, Math.PI / 2);
  state.wanted = 0;
  state.missionIndex = 1;
  state.missionStage = 0;
  state.dropsDone = 1;
  world.setMissionTarget();
  state.missionText = 'Deliver all 3 packages';
  // Traffic ahead on the same road, so the drive reads as city traffic.
  addTrafficCar(state, 395, 117, Math.PI / 2, 12);
  addTrafficCar(state, 420, 124, Math.PI / 2, 12);
  state.message = 'Driving through Solara Bay';
  state.messageTimer = 10;
  return { screen: SCREEN_PLAY, dusk: false, cameraYaw: -Math.PI / 2 };
}
