import { describe, expect, it } from "vitest";

import { keyedRandomInt, keyedRandomU32, seedFromText } from "./rng";

describe("counter-keyed RNG", () => {
  it("matches golden seed and random-word vectors", () => {
    const seed = seedFromText("TIDEWEFT golden tide");
    expect(seed).toEqual([750_933_189, 249_230_347, 1_441_725_847, 2_701_920_939]);
    expect(
      [0, 1, 2, 3, 4].map((ordinal) =>
        keyedRandomU32(seed, 0x5445_5354, 12_345, 77, 9, ordinal),
      ),
    ).toEqual([1_554_727_807, 2_461_720_902, 1_916_778_577, 3_664_560_243, 197_324_768]);
    expect(
      [0, 1, 2, 3, 4].map((ordinal) =>
        keyedRandomInt(seed, 99, 7, 42, 3, -20, 20, ordinal),
      ),
    ).toEqual([-15, 13, -4, 15, 17]);
  });

  it("addresses each draw independently and stays inside inclusive bounds", () => {
    const seed = seedFromText("independent threads");
    const before = keyedRandomU32(seed, 8, 90, 12, 2, 4);
    for (let ordinal = 0; ordinal < 200; ordinal += 1) {
      const value = keyedRandomInt(seed, 19, 400, 33, 6, 17, 31, ordinal);
      expect(value).toBeGreaterThanOrEqual(17);
      expect(value).toBeLessThanOrEqual(31);
    }
    expect(keyedRandomU32(seed, 8, 90, 12, 2, 4)).toBe(before);
    expect(keyedRandomU32(seed, 8, 91, 12, 2, 4)).not.toBe(before);
  });
});
