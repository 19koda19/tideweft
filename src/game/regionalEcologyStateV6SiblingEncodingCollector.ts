/**
 * @internal Bounded, one-shot collector for the V6 terminal sibling encoding.
 * It owns completed snapshot strings only until they are either transferred to
 * one exact ordered result or revoked. This module is intentionally not
 * re-exported through a public barrel.
 */

export interface RegionalEcologyV6SiblingEncodingCollection<T extends object> {
  readonly values: readonly T[];
  readonly segments: readonly string[];
  readonly combinedCodeUnits: number;
}

export interface RegionalEcologyV6SiblingEncodingCollector<T extends object> {
  readonly accepting: boolean;
  readonly totalCodeUnits: number;
  readonly retainedSnapshotCount: number;
  collect(value: T, canonicalEncodingSegments: readonly string[]): boolean;
  finish(
    orderedValues: readonly T[],
  ): RegionalEcologyV6SiblingEncodingCollection<T> | null;
  revoke(): void;
}

interface RetainedEncoding<T extends object> {
  readonly value: T;
  readonly encoding: string;
}

/**
 * Reserve the already-retained source text and array punctuation before any
 * completed snapshot text is joined. Crossing the combined ceiling is
 * terminal and releases every completed string retained so far.
 */
export function createRegionalEcologyV6SiblingEncodingCollector<T extends object>(
  maximumCodeUnits: number,
  retainedSourcePatchCodeUnits: readonly number[],
): RegionalEcologyV6SiblingEncodingCollector<T> {
  const expectedSnapshotCount = retainedSourcePatchCodeUnits.length;
  const retained: RetainedEncoding<T>[] = [];
  const seen = new Set<T>();
  let totalCodeUnits = 2 + Math.max(0, expectedSnapshotCount - 1);
  let accepting = Number.isSafeInteger(maximumCodeUnits)
    && maximumCodeUnits >= 0
    && Number.isSafeInteger(totalCodeUnits)
    && totalCodeUnits <= maximumCodeUnits;

  for (const sourceCodeUnits of retainedSourcePatchCodeUnits) {
    if (!Number.isSafeInteger(sourceCodeUnits) || sourceCodeUnits < 0) {
      accepting = false;
      break;
    }
    totalCodeUnits += sourceCodeUnits;
    if (
      !Number.isSafeInteger(totalCodeUnits)
      || totalCodeUnits > maximumCodeUnits
    ) {
      accepting = false;
      break;
    }
  }
  if (!accepting) totalCodeUnits = 0;

  const revoke = (): void => {
    retained.length = 0;
    seen.clear();
    totalCodeUnits = 0;
    accepting = false;
  };

  const collector: RegionalEcologyV6SiblingEncodingCollector<T> = {
    get accepting() {
      return accepting;
    },
    get totalCodeUnits() {
      return totalCodeUnits;
    },
    get retainedSnapshotCount() {
      return retained.length;
    },
    collect(value, canonicalEncodingSegments) {
      if (
        !accepting
        || typeof value !== "object"
        || value === null
        || seen.has(value)
        || retained.length >= expectedSnapshotCount
        || !Array.isArray(canonicalEncodingSegments)
      ) {
        revoke();
        return false;
      }
      let encodingCodeUnits = 0;
      for (const segment of canonicalEncodingSegments) {
        if (typeof segment !== "string") {
          revoke();
          return false;
        }
        encodingCodeUnits += segment.length;
        if (!Number.isSafeInteger(encodingCodeUnits)) {
          revoke();
          return false;
        }
      }
      const nextTotalCodeUnits = totalCodeUnits + encodingCodeUnits;
      if (
        !Number.isSafeInteger(nextTotalCodeUnits)
        || nextTotalCodeUnits > maximumCodeUnits
      ) {
        revoke();
        return false;
      }
      let encoding: string;
      try {
        encoding = canonicalEncodingSegments.join("");
      } catch {
        revoke();
        return false;
      }
      if (encoding.length !== encodingCodeUnits) {
        revoke();
        return false;
      }
      seen.add(value);
      retained.push(Object.freeze({ value, encoding }));
      totalCodeUnits = nextTotalCodeUnits;
      return true;
    },
    finish(orderedValues) {
      if (
        !accepting
        || retained.length !== expectedSnapshotCount
        || orderedValues.length !== expectedSnapshotCount
      ) {
        revoke();
        return null;
      }
      const encodingByValue = new Map<T, string>();
      for (const entry of retained) encodingByValue.set(entry.value, entry.encoding);
      const segments: string[] = ["["];
      for (let index = 0; index < orderedValues.length; index += 1) {
        const encoding = encodingByValue.get(orderedValues[index]!);
        if (encoding === undefined) {
          revoke();
          return null;
        }
        if (index > 0) segments.push(",");
        segments.push(encoding);
      }
      segments.push("]");
      const combinedCodeUnits = totalCodeUnits;
      revoke();
      return Object.freeze({
        values: orderedValues,
        segments: Object.freeze(segments),
        combinedCodeUnits,
      });
    },
    revoke,
  };
  return Object.freeze(collector);
}
