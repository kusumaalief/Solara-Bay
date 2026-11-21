// Keyboard, mouse and touch input for Solara Bay.
// Held keys give a move vector; single presses (start, pause, enter a
// car, interact, punch, save, mute, horn, restart, camera, reload,
// weapon chooser, headlights) queue one-shot action flags that the game
// loop takes once per frame. Dragging orbits the third-person camera
// and a click fires. Arrow keys mirror WASD, and pointer events cover
// touch drags too. 1/2/3 pick a gun slot, T reloads, Tab or B opens the
// weapon chooser, L toggles the headlights.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_INTERACT = 8;
export const ACTION_PUNCH = 16;
export const ACTION_SAVE = 32;
export const ACTION_MUTE = 64;
export const ACTION_JUMP = 128;
export const ACTION_HORN = 256;
export const ACTION_RESTART = 512;
export const ACTION_CAMERA = 1024;
export const ACTION_CHOOSER = 2048;
export const ACTION_LIGHTS = 4096;

// Each row: the key codes that trigger it, and what the loop should see.
// 'move' rows feed the held-keys set; 'once' rows set an action flag;
// 'slot' rows pick a weapon; 'reload' is its own one-shot.
const BINDINGS = [
  { codes: ['ArrowUp', 'KeyW'], move: 'up' },
  { codes: ['ArrowDown', 'KeyS'], move: 'down' },
  { codes: ['ArrowLeft', 'KeyA'], move: 'left' },
  { codes: ['ArrowRight', 'KeyD'], move: 'right' },
  { codes: ['Enter'], once: ACTION_CONFIRM },
  { codes: ['KeyP', 'Escape'], once: ACTION_PAUSE },
  { codes: ['KeyE'], once: ACTION_ENTER },
  { codes: ['KeyF'], once: ACTION_INTERACT },
  { codes: ['KeyQ'], once: ACTION_PUNCH },
  { codes: ['KeyC'], once: ACTION_SAVE },
  { codes: ['KeyM'], once: ACTION_MUTE },
  { codes: ['Space'], once: ACTION_JUMP },
  { codes: ['KeyH'], once: ACTION_HORN },
  { codes: ['KeyR'], once: ACTION_RESTART },
  { codes: ['KeyV'], once: ACTION_CAMERA },
  { codes: ['Tab', 'KeyB'], once: ACTION_CHOOSER },
  { codes: ['KeyL'], once: ACTION_LIGHTS },
  { codes: ['KeyT'], reload: true },
  { codes: ['Digit1'], slot: 1 },
  { codes: ['Digit2'], slot: 2 },
  { codes: ['Digit3'], slot: 3 },
];

const BY_CODE = new Map();
for (const b of BINDINGS) {
  for (const code of b.codes) BY_CODE.set(code, b);
}

export function createInput(canvas) {
  const held = new Set();
  let queued = 0;
  let sprint = false;
  let yawTurn = 0;
  let pitchTurn = 0;
  let pointerDown = false;
  let tapped = false;
  let lastX = 0;
  let lastY = 0;
  let activePointer = null;
  let slot = 0;
  let reloadQueued = false;

  function onKeyDown(event) {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      sprint = true;
      return;
    }
    const binding = BY_CODE.get(event.code);
    if (!binding) return;
    if (event.repeat) return;
    if (binding.move) held.add(binding.move);
    else if (binding.once) queued |= binding.once;
    else if (binding.reload) reloadQueued = true;
    else if (binding.slot) slot = binding.slot;
    event.preventDefault();
  }

  function onKeyUp(event) {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      sprint = false;
      return;
    }
    const binding = BY_CODE.get(event.code);
    if (binding && binding.move) held.delete(binding.move);
  }

  function clearAll() {
    held.clear();
    sprint = false;
    pointerDown = false;
    activePointer = null;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearAll);

  canvas.addEventListener('pointerdown', (event) => {
    pointerDown = true;
    tapped = true;
    lastX = event.clientX;
    lastY = event.clientY;
    activePointer = event.pointerId;
    queued |= ACTION_CONFIRM;
  });
  window.addEventListener('pointermove', (event) => {
    if (!pointerDown) return;
    if (activePointer !== null && event.pointerId !== activePointer) return;
    yawTurn -= (event.clientX - lastX) * 0.005;
    pitchTurn += (event.clientY - lastY) * 0.004;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointerup', (event) => {
    if (activePointer !== null && event.pointerId !== activePointer) return;
    pointerDown = false;
    activePointer = null;
  });

  function axis(negative, positive) {
    let value = 0;
    if (held.has(negative)) value -= 1;
    if (held.has(positive)) value += 1;
    return value;
  }

  return {
    // -1..1 across, -1..1 along (up is -1, matching moveY's old sign).
    moveX() { return axis('left', 'right'); },
    moveY() { return axis('up', 'down'); },
    run() { return sprint; },
    mouseDown() { return pointerDown; },
    takeMouseClick() {
      const was = tapped;
      tapped = false;
      return was;
    },
    takeWeaponSlot() {
      const picked = slot;
      slot = 0;
      return picked;
    },
    takeReload() {
      const was = reloadQueued;
      reloadQueued = false;
      return was;
    },
    takeCameraDelta() {
      const delta = { yaw: yawTurn, pitch: pitchTurn };
      yawTurn = 0;
      pitchTurn = 0;
      return delta;
    },
    takeActions() {
      const taken = queued;
      queued = 0;
      return taken;
    },
  };
}
