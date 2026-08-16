// Deterministic randomness. Math.random is not used in this project:
// a villager with the same name must look and behave identically across
// sessions (decision #2).

/** FNV-1a: string to 32 bits. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a tiny generator over a single 32-bit state. */
export function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('[random] пустой список для выбора');
  return item;
}

/** Random number within a range. */
export function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}
