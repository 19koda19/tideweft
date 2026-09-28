import {
  compareText,
  hashCanonicalEncoding,
  hashCanonicalEncodingSegments,
} from "../sim/util";

const UTF8_ENCODER = new TextEncoder();

interface PendingCanonicalReceipt {
  readonly state: object;
  readonly integrity: string;
  readonly encoding: string;
}

interface PendingCanonicalPreparation {
  readonly preparation: RegionalEcologyCanonicalPreparation;
  readonly keys: readonly string[];
  readonly values: readonly unknown[];
  readonly integrity: string;
  readonly encoding: string | null;
  readonly receiptEligible: boolean;
}

export interface RegionalEcologyCanonicalPreparation {
  readonly integrity: string;
  readonly sealedSerializedBytes: number;
}

/**
 * @internal Exact V6-local sibling text authenticated by the V6 owner before
 * it crosses this terminal sealing boundary. The segments must describe the
 * same frozen `breadthActiveResidents` array identity in canonical order.
 */
export interface RegionalEcologyCanonicalV6BreadthEncoding {
  readonly value: readonly unknown[];
  readonly segments: readonly string[];
}

const MAX_V6_BREADTH_ENCODING_CODE_UNITS = 16 * 1_024 * 1_024;

let pendingReceipt: PendingCanonicalReceipt | null = null;
let pendingPreparation: PendingCanonicalPreparation | null = null;

function isUnsealedPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null)
    && !Object.hasOwn(value, "integrity")
  );
}

interface NestedFreezeProof {
  allObjectsFrozen: boolean;
}

function encodeNested(value: unknown, proof: NestedFreezeProof): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("Cannot encode a non-finite number");
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      proof.allObjectsFrozen &&= Object.isFrozen(value);
      if (Array.isArray(value)) {
        return `[${value.map((entry) => encodeNested(entry, proof)).join(",")}]`;
      }
      const record = value as Readonly<Record<string, unknown>>;
      const keys = Object.keys(record).sort(compareText);
      const entries = keys.map((key) => {
        if (record[key] === undefined) {
          throw new TypeError(`Cannot encode undefined at key ${key}`);
        }
        return `${JSON.stringify(key)}:${encodeNested(record[key], proof)}`;
      });
      return `{${entries.join(",")}}`;
    }
    default:
      throw new TypeError(`Cannot canonically encode ${typeof value}`);
  }
}

function prepareExact(
  value: Readonly<Record<string, unknown>>,
  baseEncoding?: string,
): RegionalEcologyCanonicalPreparation {
  const keys = Object.keys(value).sort(compareText);
  const values = keys.map((key) => value[key]);
  const freezeProof: NestedFreezeProof = { allObjectsFrozen: true };
  const entries = keys.map((key, index) => {
    const nested = values[index];
    if (nested === undefined) throw new TypeError(`Cannot encode undefined at key ${key}`);
    let encodedValue: string;
    if (key === "base" && baseEncoding !== undefined) {
      encodedValue = baseEncoding;
    } else {
      encodedValue = encodeNested(nested, freezeProof);
    }
    return `${JSON.stringify(key)}:${encodedValue}`;
  });
  const unsealedEncoding = `{${entries.join(",")}}`;
  const integrity = hashCanonicalEncoding(unsealedEncoding);
  const firstGreaterKey = keys.findIndex((key) => compareText("integrity", key) < 0);
  const insertionIndex = firstGreaterKey < 0 ? keys.length : firstGreaterKey;
  const sealedEntries = [...entries];
  sealedEntries.splice(
    insertionIndex,
    0,
    `${JSON.stringify("integrity")}:${JSON.stringify(integrity)}`,
  );
  const encoding = `{${sealedEntries.join(",")}}`;
  const preparation = Object.freeze({
    integrity,
    sealedSerializedBytes: UTF8_ENCODER.encode(encoding).byteLength,
  });
  pendingPreparation = Object.freeze({
    preparation,
    keys: Object.freeze([...keys]),
    values: Object.freeze(values),
    integrity,
    encoding,
    receiptEligible: freezeProof.allObjectsFrozen,
  });
  return preparation;
}

function validV6BreadthEncoding(
  value: Readonly<Record<string, unknown>>,
  prepared: RegionalEcologyCanonicalV6BreadthEncoding,
): boolean {
  if (
    !Object.isFrozen(prepared)
    || value.breadthActiveResidents !== prepared.value
    || !Array.isArray(prepared.value)
    || !Object.isFrozen(prepared.value)
    || !Array.isArray(prepared.segments)
    || !Object.isFrozen(prepared.segments)
    || prepared.segments.length < 2
    || prepared.segments[0] !== "["
    || prepared.segments[prepared.segments.length - 1] !== "]"
  ) return false;
  let codeUnits = 0;
  let priorSegmentEndsWithHighSurrogate = false;
  for (const segment of prepared.segments) {
    if (typeof segment !== "string") return false;
    if (segment.length > 0) {
      const first = segment.charCodeAt(0);
      if (
        priorSegmentEndsWithHighSurrogate
        && first >= 0xdc00
        && first <= 0xdfff
      ) return false;
      const last = segment.charCodeAt(segment.length - 1);
      priorSegmentEndsWithHighSurrogate = last >= 0xd800 && last <= 0xdbff;
    }
    codeUnits += segment.length;
    if (codeUnits > MAX_V6_BREADTH_ENCODING_CODE_UNITS) return false;
  }
  return true;
}

/**
 * Terminal V6 preparation that preserves the complete released hash and
 * UTF-8 byte sweeps while avoiding a second deep traversal of one exact,
 * same-stack breadth-resident array. A malformed hint is ignored and the
 * ordinary parent preparation remains authoritative.
 */
export function prepareRegionalEcologyCanonicalTerminalV6FromReceipt(
  value: unknown,
  preparedBreadth: RegionalEcologyCanonicalV6BreadthEncoding,
): RegionalEcologyCanonicalPreparation | null {
  const receipt = pendingReceipt;
  pendingReceipt = null;
  pendingPreparation = null;
  if (!isUnsealedPlainObject(value) || !Object.hasOwn(value, "base")) return null;
  const base = value.base;
  if (typeof base !== "object" || base === null || !Object.isFrozen(base)) return null;
  if (receipt === null || receipt.state !== base) return null;
  if ((base as Readonly<Record<string, unknown>>).integrity !== receipt.integrity) return null;
  if (!validV6BreadthEncoding(value, preparedBreadth)) {
    return prepareExact(value, receipt.encoding);
  }

  const keys = Object.keys(value).sort(compareText);
  const values = keys.map((key) => value[key]);
  const freezeProof: NestedFreezeProof = { allObjectsFrozen: true };
  const encodedValues = keys.map((key, index): readonly string[] => {
    const nested = values[index];
    if (nested === undefined) throw new TypeError(`Cannot encode undefined at key ${key}`);
    if (key === "base") return Object.freeze([receipt.encoding]);
    if (key === "breadthActiveResidents") return preparedBreadth.segments;
    return Object.freeze([encodeNested(nested, freezeProof)]);
  });
  const unsealedSegments: string[] = ["{"];
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) unsealedSegments.push(",");
    unsealedSegments.push(`${JSON.stringify(keys[index])}:`);
    unsealedSegments.push(...encodedValues[index]!);
  }
  unsealedSegments.push("}");
  const integrity = hashCanonicalEncodingSegments(unsealedSegments);

  const sealedKeys = [...keys, "integrity"].sort(compareText);
  let sealedSerializedBytes = 0;
  const addBytes = (segment: string): void => {
    sealedSerializedBytes += UTF8_ENCODER.encode(segment).byteLength;
  };
  addBytes("{");
  for (let index = 0; index < sealedKeys.length; index += 1) {
    if (index > 0) addBytes(",");
    const key = sealedKeys[index]!;
    addBytes(`${JSON.stringify(key)}:`);
    if (key === "integrity") {
      addBytes(JSON.stringify(integrity));
      continue;
    }
    const sourceIndex = keys.indexOf(key);
    for (const segment of encodedValues[sourceIndex]!) addBytes(segment);
  }
  addBytes("}");

  const preparation = Object.freeze({ integrity, sealedSerializedBytes });
  pendingPreparation = Object.freeze({
    preparation,
    keys: Object.freeze([...keys]),
    values: Object.freeze(values),
    integrity,
    encoding: null,
    receiptEligible: false,
  });
  return preparation;
}

/** Seed the private V1 -> V6 exact-identity sealing chain. */
export function prepareRegionalEcologyCanonicalReceiptSeed(
  value: unknown,
): RegionalEcologyCanonicalPreparation {
  pendingReceipt = null;
  pendingPreparation = null;
  if (!isUnsealedPlainObject(value)) {
    throw new TypeError("Regional ecology canonical sealing requires one unsealed plain object");
  }
  return prepareExact(value);
}

/**
 * Consume the exact frozen `base` state produced by the preceding sealer once.
 * A miss is deliberately final for that chain; callers retain their original
 * full canonical-metrics fallback and do not synthesize a new receipt.
 */
export function prepareRegionalEcologyCanonicalParentFromReceipt(
  value: unknown,
): RegionalEcologyCanonicalPreparation | null {
  const receipt = pendingReceipt;
  pendingReceipt = null;
  pendingPreparation = null;
  if (!isUnsealedPlainObject(value) || !Object.hasOwn(value, "base")) return null;
  const base = value.base;
  if (typeof base !== "object" || base === null || !Object.isFrozen(base)) return null;
  if (receipt === null || receipt.state !== base) return null;
  if ((base as Readonly<Record<string, unknown>>).integrity !== receipt.integrity) return null;
  return prepareExact(value, receipt.encoding);
}

/** Publish only after the owner has frozen, budget-accepted, and trusted the state. */
export function publishRegionalEcologyCanonicalReceipt(
  preparation: RegionalEcologyCanonicalPreparation,
  state: unknown,
  emitReceipt: boolean,
): boolean {
  const pending = pendingPreparation;
  pendingPreparation = null;
  pendingReceipt = null;
  if (
    pending === null
    || pending.preparation !== preparation
    || typeof state !== "object"
    || state === null
    || !Object.isFrozen(state)
  ) return false;
  const record = state as Readonly<Record<string, unknown>>;
  const stateKeys = Object.keys(record).sort(compareText);
  const expectedStateKeys = [...pending.keys, "integrity"].sort(compareText);
  if (
    record.integrity !== pending.integrity
    || stateKeys.length !== expectedStateKeys.length
    || stateKeys.some((key, index) => key !== expectedStateKeys[index])
    || pending.keys.some((key, index) => !Object.is(record[key], pending.values[index]))
  ) return false;
  if (emitReceipt && pending.receiptEligible && pending.encoding !== null) {
    pendingReceipt = Object.freeze({
      state,
      integrity: pending.integrity,
      encoding: pending.encoding,
    });
  }
  return true;
}

/** Drop any in-flight preparation/receipt after a rejected owner state. */
export function revokeRegionalEcologyCanonicalReceipt(): void {
  pendingPreparation = null;
  pendingReceipt = null;
}
