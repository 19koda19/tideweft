export type RootSeed = readonly [number, number, number, number];

const UINT32_SIZE = 0x1_0000_0000;

function asUint32(value: number): number {
  return value >>> 0;
}

/** A documented, dependency-free 32-bit avalanche mixer. */
export function mixUint32(value: number): number {
  let mixed = asUint32(value);
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb_352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846c_a68b);
  mixed ^= mixed >>> 16;
  return asUint32(mixed);
}

/**
 * Converts the exact UTF-16 contents of a seed label into four non-zero words.
 * The numeric words, rather than platform text APIs, are persisted in saves.
 */
export function seedFromText(seedText: string): [number, number, number, number] {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < seedText.length; index += 1) {
    hash ^= seedText.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }

  hash ^= seedText.length;
  const first = mixUint32(hash ^ 0xa341_316c);
  const second = mixUint32(hash ^ 0xc801_3ea4);
  const third = mixUint32(hash ^ 0xad90_777d);
  const fourth = mixUint32(hash ^ 0x7e95_761e);
  return [first || 1, second || 2, third || 3, fourth || 4];
}

function foldSafeInteger(value: number): number {
  const low = asUint32(value);
  const high = asUint32(Math.floor(value / UINT32_SIZE));
  return mixUint32(low ^ Math.imul(high, 0x9e37_79b1));
}

/**
 * A counter-keyed random word. Every draw is independently addressed; there
 * is no global cursor whose draw order can couple unrelated systems.
 */
export function keyedRandomU32(
  seed: RootSeed,
  domain: number,
  tick: number,
  entityId: number,
  purpose: number,
  ordinal = 0,
): number {
  let value = seed[0] ^ mixUint32(domain);
  value = mixUint32(value ^ seed[1] ^ foldSafeInteger(tick));
  value = mixUint32(value ^ seed[2] ^ foldSafeInteger(entityId));
  value = mixUint32(value ^ seed[3] ^ foldSafeInteger(purpose));
  return mixUint32(value ^ foldSafeInteger(ordinal));
}

/** Inclusive integer range with rejection sampling to avoid modulo bias. */
export function keyedRandomInt(
  seed: RootSeed,
  domain: number,
  tick: number,
  entityId: number,
  purpose: number,
  minimum: number,
  maximum: number,
  ordinal = 0,
): number {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
    throw new RangeError("Random integer bounds must be ordered safe integers");
  }

  const span = maximum - minimum + 1;
  if (span <= 0 || span > UINT32_SIZE) {
    throw new RangeError("Random integer span must be between 1 and 2^32");
  }

  const limit = Math.floor(UINT32_SIZE / span) * span;
  let attempt = 0;
  while (true) {
    const sample = keyedRandomU32(seed, domain, tick, entityId, purpose, ordinal + attempt);
    if (sample < limit) {
      return minimum + (sample % span);
    }
    attempt += 1;
  }
}

export function keyedChance(
  seed: RootSeed,
  domain: number,
  tick: number,
  entityId: number,
  purpose: number,
  threshold: number,
  ordinal = 0,
): boolean {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 1_000_000) {
    throw new RangeError("Chance threshold must be an integer from 0 to 1,000,000");
  }
  if (threshold === 0) return false;
  if (threshold === 1_000_000) return true;
  const roll = keyedRandomU32(seed, domain, tick, entityId, purpose, ordinal);
  return roll < Math.floor((threshold * UINT32_SIZE) / 1_000_000);
}
