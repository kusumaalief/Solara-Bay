// Marin's Armory — the gun shop. Pure weapon rules, no drawing and
// no Three.js: what each gun costs, how it shoots, and the buy / equip
// / reload bookkeeping the world simulation calls. The guns are
// original (Bay Pistol, Boomstick shotgun, Harbor Rifle) and the shop
// itself is an original storefront run by Gus Ferraro, a new named
// character who minds the counter by the armory door.
import { CAR_MODELS, WEAPONS } from './config.js';

export const WEAPON_ORDER = ['pistol', 'shotgun', 'rifle'];
export const AMMO_PRICE = 40;
export const AMMO_PACK = 60;

// A fresh loadout: nothing owned, nothing equipped, empty magazines.
export function createWeaponState() {
  const ammo = {};
  for (const id of WEAPON_ORDER) ammo[id] = { mag: 0, reserve: 0 };
  return {
    owned: [],
    current: null,
    ammo,
    reloading: 0,
    reloadTotal: 0,
    muzzle: 0,
  };
}

export function weaponStats(id) {
  return WEAPONS[id] || null;
}

function say(state, text, seconds) {
  state.message = text;
  state.messageTimer = seconds;
}

// The shop greeting: Gus names Leo's car when the orange Comet 01 is
// parked out front — it is the talk of the plaza.
export function shopSubtitle(state) {
  const parked = state.cars.find((c) => c.model === 'comet' && c.parked);
  if (parked) {
    return `Gus Ferraro is minding the counter. Nice ${CAR_MODELS.comet.label} out front — buy a gun, stock up on ammo, or equip what you own.`;
  }
  return 'Gus Ferraro is minding the counter. Buy a gun, stock up on ammo, or equip what you own.';
}

export function hasWeapon(state, id) {
  return state.weapons.owned.includes(id);
}

// Buy a gun: cash check first, then it arrives loaded (a full magazine
// plus the starter reserve) and equipped straight away, so Leo can feel
// it at once.
export function buyWeapon(world, id) {
  const stats = weaponStats(id);
  const s = world.state;
  if (!stats) return { ok: false, reason: 'No such gun' };
  if (hasWeapon(s, id)) return { ok: false, reason: `You already own the ${stats.label}` };
  if (s.cash < stats.price) return { ok: false, reason: `Need $${stats.price} — you have $${s.cash}` };
  s.cash -= stats.price;
  s.weapons.owned.push(id);
  s.weapons.ammo[id] = { mag: stats.magSize, reserve: stats.reserveAmmo };
  s.weapons.current = id;
  say(s, `${stats.label} bought and equipped!`, 3);
  return { ok: true };
}

// Ammo is sold per gun: one $40 pack adds 60 reserve rounds for that gun.
export function buyAmmo(world, id) {
  const stats = weaponStats(id);
  const s = world.state;
  if (!stats) return { ok: false, reason: 'No such gun' };
  if (!hasWeapon(s, id)) return { ok: false, reason: `Buy the ${stats.label} first` };
  if (s.cash < AMMO_PRICE) return { ok: false, reason: `Ammo is $${AMMO_PRICE} — you have $${s.cash}` };
  s.cash -= AMMO_PRICE;
  s.weapons.ammo[id].reserve += AMMO_PACK;
  say(s, `+${AMMO_PACK} ${stats.label} rounds`, 3);
  return { ok: true };
}

export function equipWeapon(world, id) {
  const s = world.state;
  if (!hasWeapon(s, id)) return { ok: false, reason: 'You do not own that gun' };
  if (s.weapons.current === id) return { ok: false, reason: 'Already equipped' };
  s.weapons.current = id;
  s.weapons.reloading = 0;
  say(s, `${WEAPONS[id].label} equipped — press 1/2/3 to switch`, 2);
  return { ok: true };
}

export function startReload(world) {
  const s = world.state;
  const w = s.weapons;
  if (!w.current || w.reloading > 0) return false;
  const stats = WEAPONS[w.current];
  const pouch = w.ammo[w.current];
  if (pouch.mag >= stats.magSize || pouch.reserve <= 0) return false;
  w.reloading = stats.reloadTime;
  w.reloadTotal = stats.reloadTime;
  return true;
}

export function finishReload(world) {
  const s = world.state;
  const w = s.weapons;
  const stats = WEAPONS[w.current];
  const pouch = w.ammo[w.current];
  const missing = stats.magSize - pouch.mag;
  const moved = Math.min(missing, pouch.reserve);
  pouch.mag += moved;
  pouch.reserve -= moved;
  w.reloading = 0;
  say(s, `${stats.label} reloaded`, 1.5);
}

// One trigger pull: returns the bullets to spawn (a shotgun fires a
// spread of pellets) or null when it cannot fire. Ammo, the cooldown
// and the muzzle-flash timer live on the weapon state.
export function fireWeapon(world) {
  const s = world.state;
  const w = s.weapons;
  const p = s.player;
  if (!w.current || p.inCar || w.reloading > 0) return null;
  const stats = WEAPONS[w.current];
  const pouch = w.ammo[w.current];
  if (pouch.mag <= 0) {
    startReload(world);
    say(s, pouch.reserve > 0 ? 'Reloading… (T)' : 'Out of ammo — buy more at the armory', 2);
    return null;
  }
  pouch.mag -= 1;
  p.fireCooldown = stats.fireRate;
  w.muzzle = 0.09;
  const bullets = [];
  for (let i = 0; i < stats.pellets; i += 1) {
    const scatter = (Math.random() - 0.5) * stats.spread * 2;
    const dir = p.heading + scatter;
    bullets.push({
      x: p.x + Math.sin(p.heading) * 1.2,
      y: 1.25,
      z: p.z + Math.cos(p.heading) * 1.2,
      dx: Math.sin(dir),
      dy: 0,
      dz: Math.cos(dir),
      life: stats.range / stats.bulletSpeed,
      damage: stats.damage,
      speed: stats.bulletSpeed,
      weapon: w.current,
    });
  }
  if (pouch.mag === 0 && pouch.reserve > 0) startReload(world);
  return bullets;
}
