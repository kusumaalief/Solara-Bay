// Deterministic dice for Solara Bay. One seed drives the whole city —
// the buildings, the traffic colours, the crowd's outfits, the race
// order — so the same seed always rebuilds the same streets, which is
// what keeps the screenshot scenes repeatable. The generator below is
// mulberry32: a tiny 32-bit state machine with a long, even period.
// Nothing here touches the DOM or the network.
export function createRandom(seed) {
  let a = (seed >>> 0) || 0x6d2b79f5;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One element, uniformly, from a list.
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

// A float in [min, max).
export function range(random, min, max) {
  return min + (max - min) * random();
}

// A whole number in [min, max], both ends included.
export function intRange(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

// True with probability p.
export function chance(random, p) {
  return random() < p;
}

// A fresh list with the same items in a shuffled order.
export function shuffle(random, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const held = out[i];
    out[i] = out[j];
    out[j] = held;
  }
  return out;
}

// n distinct items, shuffled. The dealership forecourt uses this to pick
// two of its four stock spots.
export function sample(random, list, n) {
  return shuffle(random, list).slice(0, Math.min(n, list.length));
}

// entries look like [weight, value]; heavier entries come up more often.
export function weightedPick(random, entries) {
  let total = 0;
  for (let i = 0; i < entries.length; i += 1) total += entries[i][0];
  let roll = random() * total;
  for (let i = 0; i < entries.length; i += 1) {
    roll -= entries[i][0];
    if (roll <= 0) return entries[i][1];
  }
  return entries[entries.length - 1][1];
}

// A stable-looking id for spawned cars.
export function nextId(random) {
  return Math.floor(random() * 1000000000);
}
