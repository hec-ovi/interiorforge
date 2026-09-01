/** Deterministic RNG: sfc32 streams seeded via splitmix32 over a hashed key path.
 *  Only 32-bit integer ops and division by 2^32, so output is identical on every platform. */

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

function splitmix32(state: number): () => number {
  let s = state >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  };
}

/** FNV-1a over the string form of each key, folded into the seed. */
function hashKeys(seed: number, keys: readonly (string | number)[]): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (const key of keys) {
    for (const ch of String(key)) {
      h ^= ch.codePointAt(0)!;
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c; // key separator so ["ab"] differs from ["a","b"]
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number, ...streamKeys: (string | number)[]): Rng {
  const mix = splitmix32(hashKeys(seed, streamKeys));
  const next = sfc32(mix(), mix(), mix(), mix());
  for (let i = 0; i < 12; i++) next(); // scramble initial correlation

  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    range(min, max) {
      return min + next() * (max - min);
    },
    pick(items) {
      if (items.length === 0) throw new Error("pick on empty array");
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}
