/**
 * scenarioGenerator — generic, deterministic seeded randomness for building varied
 * artificial-customer scenarios WITHOUT an LLM (cheap, reproducible, safe).
 *
 * Same seed → same scenarios (reproducible runs). Different seed (e.g. the daily
 * date) → different personas/constraints/phrasings, so "indecisive today" is not
 * identical to "indecisive tomorrow". Adapters layer their templates on top.
 */

/** A small, deterministic PRNG (mulberry32) seeded from a string. */
export interface SeededRng {
  next(): number; // [0,1)
  int(maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  bool(probability?: number): boolean;
  shuffle<T>(arr: readonly T[]): T[];
}

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function makeRng(seed: string): SeededRng {
  let a = hashSeed(seed) || 1;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: SeededRng = {
    next,
    int: (maxExclusive: number) => Math.floor(next() * Math.max(1, maxExclusive)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)] as T,
    bool: (probability = 0.5) => next() < probability,
    shuffle: <T>(arr: readonly T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
  };
  return rng;
}

/** The default daily seed — stable within a day, different across days. */
export function dailySeed(now: Date = new Date()): string {
  return `daily-${now.toISOString().slice(0, 10)}`;
}
