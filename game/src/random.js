// A small seeded random generator (xorshift32) for Solara Bay 3D: the same
// seed gives the same city, traffic colours and pedestrian outfits, which is
// what makes the screenshot scenes repeatable. State is one 32-bit word.
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
