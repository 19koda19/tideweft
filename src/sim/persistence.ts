import { assertWorldInvariants } from "./invariants";
import {
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  type SaveEnvelope,
  type WorldState,
} from "./types";
import { hashCanonical, stableStringify } from "./util";

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
  if (decoded.saveFormatVersion !== SAVE_FORMAT_VERSION) {
    if (typeof decoded.saveFormatVersion === "number" && decoded.saveFormatVersion > SAVE_FORMAT_VERSION) {
      throw new Error(`TIDEWEFT save format ${decoded.saveFormatVersion} is newer than supported format ${SAVE_FORMAT_VERSION}`);
    }
    throw new Error(`TIDEWEFT save format ${String(decoded.saveFormatVersion)} has no migration`);
  }
  if (decoded.rulesVersion !== RULES_VERSION) {
    throw new Error(`TIDEWEFT rules ${String(decoded.rulesVersion)} are incompatible with ${RULES_VERSION}`);
  }
  if (!isRecord(decoded.world)) throw new Error("TIDEWEFT save has no world snapshot");
  const world = decoded.world as unknown as WorldState;
  const checksum = hashWorld(world);
  if (typeof decoded.checksum !== "string" || decoded.checksum !== checksum) {
    throw new Error("TIDEWEFT save checksum does not match its world snapshot");
  }
  assertWorldInvariants(world);
  return world;
}
