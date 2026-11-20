// Keyboard and mouse input for Solara Bay v3.
// Held keys give a move vector; one-shot presses (start, pause, enter a car,
// interact, punch, save, mute, horn, restart, camera reset) are queued as
// bit flags and taken once by the loop. Dragging the mouse orbits the
// third-person camera; a click fires. Arrow keys work alongside WASD, and
// the game also listens for touch drags through pointer events, so the same
// camera drag works on a touch screen. v3 adds: 1/2/3 switch guns, T
// reloads, Tab or B opens the weapon chooser panel.
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

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const INTERACT = new Set(['KeyF']);
const PUNCH = new Set(['KeyQ']);
const SAVE = new Set(['KeyC']);
const MUTE = new Set(['KeyM']);
const JUMP = new Set(['Space']);
const HORN = new Set(['KeyH']);
const RESTART = new Set(['KeyR']);
const CAMERA = new Set(['KeyV']);
const RELOAD = new Set(['KeyT']);
const CHOOSER = new Set(['Tab', 'KeyB']);
const WEAPON_KEYS = { Digit1: 1, Digit2: 2, Digit3: 3 };

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let shift = false;
  let yawDelta = 0;
  let pitchDelta = 0;
  let mouseDown = false;
  let clicked = false;
  let lastX = 0;
  let lastY = 0;
  let activePointer = null;
  let weaponSlot = 0;
  let reloadPressed = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') shift = true;
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) keys.add(event.code);
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (ENTER.has(event.code)) { if (!event.repeat) actions |= ACTION_ENTER; }
    else if (INTERACT.has(event.code)) { if (!event.repeat) actions |= ACTION_INTERACT; }
    else if (PUNCH.has(event.code)) { if (!event.repeat) actions |= ACTION_PUNCH; }
    else if (SAVE.has(event.code)) { if (!event.repeat) actions |= ACTION_SAVE; }
    else if (MUTE.has(event.code)) { if (!event.repeat) actions |= ACTION_MUTE; }
    else if (HORN.has(event.code)) { if (!event.repeat) actions |= ACTION_HORN; }
    else if (RESTART.has(event.code)) { if (!event.repeat) actions |= ACTION_RESTART; }
    else if (CAMERA.has(event.code)) { if (!event.repeat) actions |= ACTION_CAMERA; }
    else if (RELOAD.has(event.code)) { if (!event.repeat) reloadPressed = true; }
    else if (CHOOSER.has(event.code)) { if (!event.repeat) actions |= ACTION_CHOOSER; }
    else if (WEAPON_KEYS[event.code]) { if (!event.repeat) weaponSlot = WEAPON_KEYS[event.code]; }
    else if (JUMP.has(event.code)) { if (!event.repeat) actions |= ACTION_JUMP; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') shift = false;
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => { keys.clear(); shift = false; mouseDown = false; activePointer = null; });
  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true; clicked = true; lastX = event.clientX; lastY = event.clientY;
    activePointer = event.pointerId;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointermove', (event) => {
    if (!mouseDown || (activePointer !== null && event.pointerId !== activePointer)) return;
    yawDelta -= (event.clientX - lastX) * 0.005;
    pitchDelta += (event.clientY - lastY) * 0.004;
    lastX = event.clientX; lastY = event.clientY;
  });
  window.addEventListener('pointerup', (event) => {
    if (activePointer !== null && event.pointerId !== activePointer) return;
    mouseDown = false;
    activePointer = null;
  });

  function axis(setA, setB) {
    let v = 0;
    for (const code of setA) if (keys.has(code)) v -= 1;
    for (const code of setB) if (keys.has(code)) v += 1;
    return Math.max(-1, Math.min(1, v));
  }

  return {
    moveX() { return axis(LEFT, RIGHT); },
    moveY() { return axis(UP, DOWN); },
    run() { return shift; },
    mouseDown() { return mouseDown; },
    takeMouseClick() { const c = clicked; clicked = false; return c; },
    takeWeaponSlot() { const s = weaponSlot; weaponSlot = 0; return s; },
    takeReload() { const r = reloadPressed; reloadPressed = false; return r; },
    takeCameraDelta() { const d = { yaw: yawDelta, pitch: pitchDelta }; yawDelta = 0; pitchDelta = 0; return d; },
    takeActions() { const taken = actions; actions = 0; return taken; },
  };
}
