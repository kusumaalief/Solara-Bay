// Marin's Armory — Solara Bay v3. Pure weapon rules, no drawing, no
// Three.js: what each gun costs, how it shoots, and the buy / equip /
// reload bookkeeping the world simulation calls. The guns are original
// (Bay Pistol, Boomstick shotgun, Harbor Rifle) and the armory itself is
// an original shop run by Gus Ferraro, a new named character.
import { WEAPONS } from './config.js';

export const WEAPON_ORDER = ['pistol', 'shotgun', 'rifle'];
export const AMMO_PRICE = 40;
export const AMMO_PACK = 60;

export function createWeaponState() {
  const ammo = {};
  for (const id of WEAPON_ORDER) ammo[id] = { mag: 0, reserve: 0 };
  return { owned: [], current: null, ammo, reloading: 0, reloadTotal: 0, muzzle: 0 };
}

export function weaponStats(id) {
  return WEAPONS[id] || null;
}

export function hasWeapon(state, id) {
  return state.weapons.owned.includes(id);
}

// Buy a gun: cash check, then it comes loaded (full mag + starter reserve)
// and is equipped straight away so the player can feel it at once.
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
  s.message = `${stats.label} bought and equipped!`;
  s.messageTimer = 3;
  return { ok: true };
}

// Ammo is sold per gun: a $40 pack adds 60 reserve rounds for that gun.
export function buyAmmo(world, id) {
  const stats = weaponStats(id);
  const s = world.state;
  if (!stats) return { ok: false, reason: 'No such gun' };
  if (!hasWeapon(s, id)) return { ok: false, reason: `Buy the ${stats.label} first` };
  if (s.cash < AMMO_PRICE) return { ok: false, reason: `Ammo is $${AMMO_PRICE} — you have $${s.cash}` };
  s.cash -= AMMO_PRICE;
  s.weapons.ammo[id].reserve += AMMO_PACK;
  s.message = `+${AMMO_PACK} ${stats.label} rounds`;
  s.messageTimer = 3;
  return { ok: true };
}

export function equipWeapon(world, id) {
  const s = world.state;
  if (!hasWeapon(s, id)) return { ok: false, reason: 'You do not own that gun' };
  if (s.weapons.current === id) return { ok: false, reason: 'Already equipped' };
  s.weapons.current = id;
  s.weapons.reloading = 0;
  s.message = `${WEAPONS[id].label} equipped — press 1/2/3 to switch`;
  s.messageTimer = 2;
  return { ok: true };
}

export function startReload(world) {
  const s = world.state;
  const w = s.weapons;
  if (!w.current || w.reloading > 0) return false;
  const stats = WEAPONS[w.current];
  const a = w.ammo[w.current];
  if (a.mag >= stats.magSize || a.reserve <= 0) return false;
  w.reloading = stats.reloadTime;
  w.reloadTotal = stats.reloadTime;
  return true;
}

export function finishReload(world) {
  const s = world.state;
  const w = s.weapons;
  const stats = WEAPONS[w.current];
  const a = w.ammo[w.current];
  const need = stats.magSize - a.mag;
  const take = Math.min(need, a.reserve);
  a.mag += take;
  a.reserve -= take;
  w.reloading = 0;
  s.message = `${stats.label} reloaded`;
  s.messageTimer = 1.5;
}

// Fire one trigger pull: returns the bullets to spawn (a shotgun fires a
// spread of pellets) or null when it cannot fire. Ammo, cooldown and the
// muzzle-flash timer live on the weapon state.
export function fireWeapon(world) {
  const s = world.state;
  const w = s.weapons;
  const p = s.player;
  if (!w.current || p.inCar || w.reloading > 0) return null;
  const stats = WEAPONS[w.current];
  const a = w.ammo[w.current];
  if (a.mag <= 0) {
    startReload(world);
    s.message = a.reserve > 0 ? 'Reloading… (T)' : 'Out of ammo — buy more at the armory';
    s.messageTimer = 2;
    return null;
  }
  a.mag -= 1;
  p.fireCooldown = stats.fireRate;
  w.muzzle = 0.09;
  const bullets = [];
  for (let i = 0; i < stats.pellets; i += 1) {
    const spread = (Math.random() - 0.5) * stats.spread * 2;
    const dir = p.heading + spread;
    bullets.push({
      x: p.x + Math.sin(p.heading) * 1.2, y: 1.25, z: p.z + Math.cos(p.heading) * 1.2,
      dx: Math.sin(dir), dy: 0, dz: Math.cos(dir),
      life: stats.range / stats.bulletSpeed,
      damage: stats.damage, speed: stats.bulletSpeed, weapon: w.current,
    });
  }
  if (a.mag === 0 && a.reserve > 0) startReload(world);
  return bullets;
}
