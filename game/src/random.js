// A small seeded random generator (xorshift32) for Solara Bay v2: the same
// seed gives the same city, traffic colours and pedestrian outfits, which is
// what makes the screenshot scenes repeatable. State is one 32-bit word.
// v2 adds shuffle, weighted picks and stable ids, used for the crowd, the
// race checkpoints and the taxi fares.
export function createRandom(seed) {
  let state = (seed | 0) || 0x9e3779b9;
  if (state === 0) state = 0x2545f491;
  return function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}

export function range(random, min, max) {
  return min + random() * (max - min);
}

export function shuffle(random, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function weightedPick(random, entries) {
  // entries: [[weight, value], ...]. Returns a value, weighted by weight.
  let total = 0;
  for (const [w] of entries) total += w;
  let roll = random() * total;
  for (const [w, value] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][1];
}

// v3: small helpers the armory district uses — a whole-number range (for
// rack slots, crates and market stalls) and a plain probability roll.
export function intRange(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

export function chance(random, p) {
  return random() < p;
}

// v4: pick n distinct items from a list, in a shuffled order — the
// dealership forecourt uses it to choose two of its four stock spots.
export function sample(random, list, n) {
  return shuffle(random, list).slice(0, Math.min(n, list.length));
}

export function nextId(random) {
  return Math.floor(random() * 1e9);
}
