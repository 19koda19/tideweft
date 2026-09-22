import { describe, expect, it } from "vitest";
import {
  canonicalIntegrityMetrics,
  hashCanonical,
  stableStringify,
} from "../sim/util";
import {
  prepareRegionalEcologyCanonicalParentFromReceipt,
  prepareRegionalEcologyCanonicalReceiptSeed,
  publishRegionalEcologyCanonicalReceipt,
  revokeRegionalEcologyCanonicalReceipt,
} from "./regionalEcologyCanonicalSeal";

const UTF8_ENCODER = new TextEncoder();

function freezeState<T extends object>(
  value: T,
  integrity: string,
): Readonly<T & { readonly integrity: string }> {
  return Object.freeze({ ...value, integrity });
}

describe("regional ecology canonical seal receipts", () => {
  it("matches the canonical hash and byte oracle exactly", () => {
    const nested = Object.freeze({
      array: Object.freeze(["tide🌊", -0, true, null]),
      combining: "e\u0301",
      control: "line\n\tend",
    });
    const value = { zed: 7, baseLike: nested, alpha: "α" };
    const expected = canonicalIntegrityMetrics(value);

    const preparation = prepareRegionalEcologyCanonicalReceiptSeed(value);
    const state = freezeState(value, preparation.integrity);

    expect(preparation).toEqual(expected);
    expect(preparation.integrity).toBe(hashCanonical(value));
    expect(preparation.sealedSerializedBytes).toBe(
      UTF8_ENCODER.encode(stableStringify(state)).byteLength,
    );
    expect(stableStringify(state)).toBe(stableStringify({
      ...value,
      integrity: hashCanonical(value),
    }));
    expect(publishRegionalEcologyCanonicalReceipt(preparation, state, true)).toBe(true);
  });

  it("matches canonical ordering and escaping edge cases", () => {
    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, {
      zeta: Object.freeze({ "quote\"comma,brace}": "𐐷🌊" }),
    });
    Object.freeze(nullPrototype);
    const samples: readonly Record<string, unknown>[] = [
      {},
      nullPrototype,
      { alpha: "integrity sorts after this key" },
      { zulu: "integrity sorts before this key" },
      {
        "escaped\"key,[]{}": "slash\\quote\"line\n",
        array: Object.freeze([-0, 0, "é", "e\u0301", Object.freeze({ 雨: "水" })]),
      },
    ];

    for (const value of samples) {
      const expected = canonicalIntegrityMetrics(value);
      const preparation = prepareRegionalEcologyCanonicalReceiptSeed(value);
      const state = freezeState(value, preparation.integrity);
      expect(preparation).toEqual(expected);
      expect(stableStringify(state)).toBe(stableStringify({
        ...value,
        integrity: expected.integrity,
      }));
      expect(publishRegionalEcologyCanonicalReceipt(preparation, state, true)).toBe(true);
    }
  });

  it("consumes an exact direct-base receipt only once", () => {
    const childValue = { payload: Object.freeze({ count: 3 }) };
    const childPreparation = prepareRegionalEcologyCanonicalReceiptSeed(childValue);
    const child = freezeState(childValue, childPreparation.integrity);
    expect(publishRegionalEcologyCanonicalReceipt(childPreparation, child, true)).toBe(true);

    const parentValue = { version: 2, base: child, overlay: Object.freeze(["north"]) };
    const first = prepareRegionalEcologyCanonicalParentFromReceipt(parentValue);
    expect(first).not.toBeNull();
    expect(first).toEqual(canonicalIntegrityMetrics(parentValue));
    expect(prepareRegionalEcologyCanonicalParentFromReceipt(parentValue)).toBeNull();
  });

  it("carries one exact receipt through all five V1 to V6 wrapper edges", () => {
    const seedValue = { version: 1, payload: Object.freeze({ count: 45 }) };
    const seedPreparation = prepareRegionalEcologyCanonicalReceiptSeed(seedValue);
    let state: Readonly<Record<string, unknown>> = freezeState(
      seedValue,
      seedPreparation.integrity,
    );
    expect(publishRegionalEcologyCanonicalReceipt(seedPreparation, state, true)).toBe(true);

    for (let version = 2; version <= 6; version += 1) {
      const value = {
        version,
        base: state,
        overlay: Object.freeze({ version, label: `layer-${version}` }),
      };
      const preparation = prepareRegionalEcologyCanonicalParentFromReceipt(value);
      expect(preparation).toEqual(canonicalIntegrityMetrics(value));
      state = freezeState(value, preparation!.integrity);
      expect(publishRegionalEcologyCanonicalReceipt(
        preparation!,
        state,
        version < 6,
      )).toBe(true);
    }

    expect(prepareRegionalEcologyCanonicalParentFromReceipt({
      version: 7,
      base: state,
    })).toBeNull();
  });

  it("fails closed for a byte-equal clone and does not reseed the next edge", () => {
    const childValue = { payload: Object.freeze({ count: 5 }) };
    const childPreparation = prepareRegionalEcologyCanonicalReceiptSeed(childValue);
    const child = freezeState(childValue, childPreparation.integrity);
    expect(publishRegionalEcologyCanonicalReceipt(childPreparation, child, true)).toBe(true);
    const clone = freezeState(childValue, childPreparation.integrity);
    expect(stableStringify(clone)).toBe(stableStringify(child));

    const missedValue = { version: 2, base: clone };
    expect(prepareRegionalEcologyCanonicalParentFromReceipt(missedValue)).toBeNull();
    const fallback = freezeState(missedValue, canonicalIntegrityMetrics(missedValue).integrity);
    expect(prepareRegionalEcologyCanonicalParentFromReceipt({
      version: 3,
      base: fallback,
    })).toBeNull();
  });

  it("does not publish mutable state or a state assembled from mismatched fields", () => {
    const value = { payload: Object.freeze({ count: 8 }) };
    const preparation = prepareRegionalEcologyCanonicalReceiptSeed(value);
    expect(publishRegionalEcologyCanonicalReceipt(
      preparation,
      { ...value, integrity: preparation.integrity },
      true,
    )).toBe(false);
    expect(prepareRegionalEcologyCanonicalParentFromReceipt({
      base: freezeState(value, preparation.integrity),
    })).toBeNull();

    const next = prepareRegionalEcologyCanonicalReceiptSeed(value);
    const forged = Object.freeze({
      payload: Object.freeze({ count: 9 }),
      integrity: next.integrity,
    });
    expect(publishRegionalEcologyCanonicalReceipt(next, forged, true)).toBe(false);
    expect(prepareRegionalEcologyCanonicalParentFromReceipt({ base: forged })).toBeNull();
  });

  it("rejects an envelope mutated between preparation and publication", () => {
    const value = { scalar: 1, payload: Object.freeze({ count: 8 }) };
    const preparation = prepareRegionalEcologyCanonicalReceiptSeed(value);
    value.scalar = 2;
    const staleState = freezeState(value, preparation.integrity);
    expect(publishRegionalEcologyCanonicalReceipt(preparation, staleState, true)).toBe(false);
    expect(hashCanonical({ scalar: 1, payload: value.payload })).toBe(preparation.integrity);
    expect(hashCanonical(value)).not.toBe(preparation.integrity);
    expect(prepareRegionalEcologyCanonicalParentFromReceipt({ base: staleState })).toBeNull();
  });

  it("withholds a receipt when a shallow-frozen descendant could later mutate", () => {
    const mutable = { count: 1 };
    const shallowFrozen = Object.freeze({ mutable });
    const value = { nested: shallowFrozen };
    const preparation = prepareRegionalEcologyCanonicalReceiptSeed(value);
    const state = freezeState(value, preparation.integrity);
    expect(publishRegionalEcologyCanonicalReceipt(preparation, state, true)).toBe(true);

    mutable.count = 2;
    expect(hashCanonical(value)).not.toBe(preparation.integrity);
    expect(prepareRegionalEcologyCanonicalParentFromReceipt({ base: state })).toBeNull();
  });

  it("revokes rejected preparations and clears stale receipts on encoding errors", () => {
    const value = { payload: Object.freeze({ count: 13 }) };
    const preparation = prepareRegionalEcologyCanonicalReceiptSeed(value);
    const state = freezeState(value, preparation.integrity);
    expect(publishRegionalEcologyCanonicalReceipt(preparation, state, true)).toBe(true);

    expect(() => prepareRegionalEcologyCanonicalReceiptSeed({ invalid: undefined })).toThrow(
      TypeError,
    );
    expect(prepareRegionalEcologyCanonicalParentFromReceipt({ base: state })).toBeNull();

    const rejected = prepareRegionalEcologyCanonicalReceiptSeed(value);
    const rejectedState = freezeState(value, rejected.integrity);
    revokeRegionalEcologyCanonicalReceipt();
    expect(publishRegionalEcologyCanonicalReceipt(rejected, rejectedState, true)).toBe(false);
    expect(prepareRegionalEcologyCanonicalParentFromReceipt({ base: rejectedState })).toBeNull();
  });

  it("lets the terminal owner consume without emitting another receipt", () => {
    const childValue = { payload: Object.freeze({ count: 21 }) };
    const childPreparation = prepareRegionalEcologyCanonicalReceiptSeed(childValue);
    const child = freezeState(childValue, childPreparation.integrity);
    publishRegionalEcologyCanonicalReceipt(childPreparation, child, true);
    const terminalValue = { version: 6, base: child };
    const terminalPreparation = prepareRegionalEcologyCanonicalParentFromReceipt(terminalValue);
    expect(terminalPreparation).not.toBeNull();
    const terminal = freezeState(terminalValue, terminalPreparation!.integrity);
    expect(publishRegionalEcologyCanonicalReceipt(
      terminalPreparation!,
      terminal,
      false,
    )).toBe(true);
    expect(prepareRegionalEcologyCanonicalParentFromReceipt({
      version: 7,
      base: terminal,
    })).toBeNull();
  });
});
