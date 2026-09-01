import { assertWorldInvariants } from "./invariants";
import {
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  type SaveEnvelope,
  type WorldState,
} from "./types";
import { hashCanonical, stableStringify } from "./util";

const ALPHA_SAVE_FORMAT_VERSION = 1;
const ALPHA_RULES_VERSION = "tideweft-sim/2";
const CHOIR_RULES_VERSION = "tideweft-sim/3";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hashWorld(world: WorldState): string {
  return hashCanonical(world);
}

export function serializeWorld(world: WorldState): string {
  assertWorldInvariants(world);
  const envelope: SaveEnvelope = {
    format: "tideweft-world",
    saveFormatVersion: SAVE_FORMAT_VERSION,
    rulesVersion: RULES_VERSION,
    checksum: hashWorld(world),
    world,
  };
  return stableStringify(envelope);
}

function assertSnapshotChecksum(envelope: Record<string, unknown>, world: unknown): void {
  const checksum = hashCanonical(world);
  if (typeof envelope.checksum !== "string" || envelope.checksum !== checksum) {
    throw new Error("TIDEWEFT save checksum does not match its world snapshot");
  }
}

function migratePriorWorld(
  envelope: Record<string, unknown>,
  priorSaveFormatVersion: number,
  priorRulesVersion: string,
  addEmptyChoirs: boolean,
): WorldState {
  if (envelope.rulesVersion !== priorRulesVersion) {
    throw new Error(`TIDEWEFT rules ${String(envelope.rulesVersion)} are incompatible with ${RULES_VERSION}`);
  }
  if (!isRecord(envelope.world)) throw new Error("TIDEWEFT save has no world snapshot");
  assertSnapshotChecksum(envelope, envelope.world);
  const legacyMeta = envelope.world.meta;
  if (!isRecord(legacyMeta)) throw new Error("TIDEWEFT save has no world metadata");
  if (
    legacyMeta.saveFormatVersion !== priorSaveFormatVersion
    || legacyMeta.rulesVersion !== priorRulesVersion
  ) {
    throw new Error("TIDEWEFT prior save metadata does not match its envelope");
  }

  // The parsed snapshot is private to this call. Mutate it only after its old
  // checksum has been verified, then validate it under the current rules.
  if (addEmptyChoirs) envelope.world.choirs = [];
  legacyMeta.saveFormatVersion = SAVE_FORMAT_VERSION;
  legacyMeta.rulesVersion = RULES_VERSION;
  const world = envelope.world as unknown as WorldState;
  assertWorldInvariants(world);
  return world;
}

export function deserializeWorld(text: string): WorldState {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`TIDEWEFT save is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
  if (!isRecord(decoded) || decoded.format !== "tideweft-world") {
    throw new Error("TIDEWEFT save has an unknown format");
  }
  if (typeof decoded.saveFormatVersion === "number" && decoded.saveFormatVersion > SAVE_FORMAT_VERSION) {
    throw new Error(`TIDEWEFT save format ${decoded.saveFormatVersion} is newer than supported format ${SAVE_FORMAT_VERSION}`);
  }
  if (decoded.saveFormatVersion === ALPHA_SAVE_FORMAT_VERSION) {
    return migratePriorWorld(decoded, ALPHA_SAVE_FORMAT_VERSION, ALPHA_RULES_VERSION, true);
  }
  if (decoded.saveFormatVersion !== SAVE_FORMAT_VERSION) {
    throw new Error(`TIDEWEFT save format ${String(decoded.saveFormatVersion)} has no migration`);
  }
  if (decoded.rulesVersion === CHOIR_RULES_VERSION) {
    return migratePriorWorld(decoded, SAVE_FORMAT_VERSION, CHOIR_RULES_VERSION, false);
  }
  if (decoded.rulesVersion !== RULES_VERSION) {
    throw new Error(`TIDEWEFT rules ${String(decoded.rulesVersion)} are incompatible with ${RULES_VERSION}`);
  }
  if (!isRecord(decoded.world)) throw new Error("TIDEWEFT save has no world snapshot");
  const world = decoded.world as unknown as WorldState;
  assertSnapshotChecksum(decoded, world);
  assertWorldInvariants(world);
  return world;
}
