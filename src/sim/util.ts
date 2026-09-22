import { FIXED_POINT, RESOURCE_KINDS, type Inventory, type ResourceKind } from "./types";

const UTF8_ENCODER = new TextEncoder();

export function clampInteger(value: number, minimum = 0, maximum = FIXED_POINT): number {
  if (value <= minimum) return minimum;
  if (value >= maximum) return maximum;
  return Math.trunc(value);
}

export function createEmptyInventory(): Inventory {
  return {
    food: 0,
    freshWater: 0,
    reed: 0,
    medicine: 0,
    parts: 0,
  };
}

export function copyInventory(inventory: Readonly<Inventory>): Inventory {
  return {
    food: inventory.food,
    freshWater: inventory.freshWater,
    reed: inventory.reed,
    medicine: inventory.medicine,
    parts: inventory.parts,
  };
}

export function addInventory(target: Inventory, resource: ResourceKind, amount: number): void {
  target[resource] += amount;
}

export function sumInventories(inventories: readonly Readonly<Inventory>[]): Inventory {
  const result = createEmptyInventory();
  for (const inventory of inventories) {
    for (const resource of RESOURCE_KINDS) {
      result[resource] += inventory[resource];
    }
  }
  return result;
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function stableStringify(value: unknown): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("Cannot encode a non-finite number");
      if (Object.is(value, -0)) return "0";
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
      }
      const object = value as Record<string, unknown>;
      const keys = Object.keys(object).sort(compareText);
      const entries = keys.map((key) => {
        if (object[key] === undefined) {
          throw new TypeError(`Cannot encode undefined at key ${key}`);
        }
        return `${JSON.stringify(key)}:${stableStringify(object[key])}`;
      });
      return `{${entries.join(",")}}`;
    }
    default:
      throw new TypeError(`Cannot canonically encode ${typeof value}`);
  }
}

/** @internal Two independent 32-bit FNV-style lanes over one canonical UTF-16 string. */
export function hashCanonicalEncoding(encoded: string): string {
  let high = 0x811c_9dc5;
  let low = 0x9e37_79b9;
  for (let index = 0; index < encoded.length; index += 1) {
    const code = encoded.charCodeAt(index);
    high = Math.imul(high ^ code, 0x0100_0193) >>> 0;
    low = Math.imul(low ^ code, 0x85eb_ca6b) >>> 0;
    low ^= high >>> 13;
  }
  const highHex = (high >>> 0).toString(16).padStart(8, "0");
  const lowHex = (low >>> 0).toString(16).padStart(8, "0");
  return `${highHex}${lowHex}`;
}

/** Two independent 32-bit FNV-style lanes, returned as a fixed 64-bit hex label. */
export function hashCanonical(value: unknown): string {
  return hashCanonicalEncoding(stableStringify(value));
}

export interface CanonicalIntegrityMetrics {
  readonly integrity: string;
  readonly sealedSerializedBytes: number;
}

/**
 * Hash one no-integrity object and measure its sealed representation from the
 * same canonical encoding. Inserting a top-level member changes ordering but
 * not byte count, so the exact sealed size is the base size plus the encoded
 * member and, for a nonempty object, one comma.
 */
export function canonicalIntegrityMetrics(
  value: unknown,
): CanonicalIntegrityMetrics {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
    || Object.hasOwn(value, "integrity")
  ) {
    throw new TypeError("Canonical integrity metrics require one unsealed plain object");
  }
  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record);
  const encoded = stableStringify(record);
  const integrity = hashCanonicalEncoding(encoded);
  const integrityMember = `${keys.length === 0 ? "" : ","}${
    JSON.stringify("integrity")
  }:${JSON.stringify(integrity)}`;
  return Object.freeze({
    integrity,
    sealedSerializedBytes:
      UTF8_ENCODER.encode(encoded).byteLength
      + UTF8_ENCODER.encode(integrityMember).byteLength,
  });
}
