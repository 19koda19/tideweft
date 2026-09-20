import { describe, expect, it } from "vitest";
import {
  canonicalIntegrityMetrics,
  hashCanonical,
  stableStringify,
} from "./util";

const UTF8_ENCODER = new TextEncoder();

function priorSealOracle(value: Readonly<Record<string, unknown>>): Readonly<{
  integrity: string;
  serializedBytes: number;
}> {
  const integrity = hashCanonical(value);
  return Object.freeze({
    integrity,
    serializedBytes: UTF8_ENCODER.encode(stableStringify({
      ...value,
      integrity,
    })).byteLength,
  });
}

describe("canonical integrity metrics", () => {
  it("preserves the released canonical hash lanes", () => {
    expect(hashCanonical({})).toBe("5465b8258350d6ee");
    expect(hashCanonical({ z: 1, a: "tide" })).toBe("66b2fa471441e5dc");
    expect(hashCanonical({
      z: "🌊\u0000é",
      a: [-0, true, null, { 雪: "風" }],
    })).toBe("c75106719a1fa1b8");
  });

  it("derives exact sealed bytes from one canonical base encoding", () => {
    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, {
      omega: "Ω",
      alpha: "a\u0301",
    });
    const samples: ReadonlyArray<Readonly<Record<string, unknown>>> = [
      Object.freeze({}),
      Object.freeze({ z: 1, a: "tide" }),
      Object.freeze({
        zebra: "last",
        alpha: "first",
        middle: "quotes \" slashes \\ controls \n \t",
      }),
      Object.freeze({
        z: "🌊\u0000é",
        a: [-0, true, false, null, { 雪: "風", nested: { integrity: "allowed" } }],
      }),
      nullPrototype,
    ];

    for (const sample of samples) {
      const expected = priorSealOracle(sample);
      const actual = canonicalIntegrityMetrics(sample);
      expect(actual.integrity).toBe(expected.integrity);
      expect(actual.sealedSerializedBytes).toBe(expected.serializedBytes);
    }
  });

  it("rejects envelopes that cannot be sealed exactly once", () => {
    expect(() => canonicalIntegrityMetrics(null)).toThrow(TypeError);
    expect(() => canonicalIntegrityMetrics([])).toThrow(TypeError);
    expect(() => canonicalIntegrityMetrics(new Date(0))).toThrow(TypeError);
    expect(() => canonicalIntegrityMetrics({ integrity: "already-sealed" }))
      .toThrow(TypeError);
  });

  it("preserves canonical encoding failures", () => {
    expect(() => canonicalIntegrityMetrics({ missing: undefined })).toThrow(TypeError);
    expect(() => canonicalIntegrityMetrics({ invalid: Number.POSITIVE_INFINITY }))
      .toThrow(TypeError);
    expect(() => canonicalIntegrityMetrics({ invalid: Number.NaN })).toThrow(TypeError);
  });
});
