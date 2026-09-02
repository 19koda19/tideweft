import { assertWorldInvariants } from "./invariants";
import {
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  type ResidentRole,
  type SaveEnvelope,
  type WorldState,
} from "./types";
import { hashCanonical, stableStringify } from "./util";
import {
  createResidentCondition,
  createResidentPlayerKnowledge,
  generateResidentIdentity,
} from "./npcIdentity";
import { stableRegionObjectId } from "./regions";

const ALPHA_SAVE_FORMAT_VERSION = 1;
const ALPHA_RULES_VERSION = "tideweft-sim/2";
const CHOIR_RULES_VERSION = "tideweft-sim/3";
const PRIOR_SAVE_FORMAT_VERSION = 2;
const PRIOR_RULES_VERSION = "tideweft-sim/4";

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

function migrateResidentIdentityFields(world: Record<string, unknown>): void {
  const meta = world.meta;
  if (!isRecord(meta) || !Array.isArray(meta.rootSeed) || meta.rootSeed.length !== 4) {
    throw new Error("TIDEWEFT prior save has no valid root seed");
  }
  const seed = meta.rootSeed;
  if (!seed.every((word) => Number.isSafeInteger(word) && word >= 0 && word <= 0xffff_ffff)) {
    throw new Error("TIDEWEFT prior save root seed is invalid");
  }
  if (!Array.isArray(world.residents) || !Array.isArray(world.settlements)) {
    throw new Error("TIDEWEFT prior save has no resident population");
  }
  const localOrdinals = new Map<number, number>();
  const settlementKeys = new Map<number, string>();
  for (let settlementOrdinal = 0; settlementOrdinal < world.settlements.length; settlementOrdinal += 1) {
    const settlement = world.settlements[settlementOrdinal];
    if (!isRecord(settlement) || !Array.isArray(settlement.residentIds)) continue;
    if (typeof settlement.originKey !== "string" || settlement.originKey.length === 0) {
      settlement.originKey = stableRegionObjectId(
        seed as [number, number, number, number],
        { x: 0, y: 0 },
        "settlement",
        settlementOrdinal,
      );
    }
    const originKey = settlement.originKey;
    if (typeof originKey !== "string") throw new Error("TIDEWEFT prior settlement origin is invalid");
    if (Number.isSafeInteger(settlement.id)) {
      settlementKeys.set(settlement.id as number, originKey);
    }
    settlement.residentIds.forEach((residentId, localOrdinal) => {
      if (Number.isSafeInteger(residentId)) localOrdinals.set(residentId as number, localOrdinal);
    });
  }
  const roles = new Set<ResidentRole>([
    "fisher",
    "harvester",
    "medic",
    "mechanic",
    "navigator",
    "steward",
  ]);
  for (const resident of world.residents) {
    if (!isRecord(resident)) throw new Error("TIDEWEFT prior save resident is invalid");
    const id = resident.id;
    const homeSettlementId = resident.homeSettlementId;
    const role = resident.role;
    if (
      !Number.isSafeInteger(id)
      || !Number.isSafeInteger(homeSettlementId)
      || typeof role !== "string"
      || !roles.has(role as ResidentRole)
    ) throw new Error("TIDEWEFT prior save resident identity inputs are invalid");
    const localOrdinal = localOrdinals.get(id as number);
    const homeSettlementKey = settlementKeys.get(homeSettlementId as number);
    if (localOrdinal === undefined || homeSettlementKey === undefined) {
      throw new Error(`TIDEWEFT prior save resident ${String(id)} has no settlement ordinal`);
    }
    const input = {
      seed: seed as [number, number, number, number],
      originSettlementId: homeSettlementId as number,
      originSettlementKey: homeSettlementKey,
      originActorOrdinal: localOrdinal,
      role: role as ResidentRole,
      originRegion: { x: 0, y: 0 },
    };
    if (!isRecord(resident.identity)) resident.identity = generateResidentIdentity(input);
    if (!isRecord(resident.condition)) resident.condition = createResidentCondition(input);
    if (!isRecord(resident.playerKnowledge)) resident.playerKnowledge = createResidentPlayerKnowledge();
    if (!Array.isArray(resident.memories)) resident.memories = [];
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
  migrateResidentIdentityFields(envelope.world);
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
  if (decoded.saveFormatVersion === PRIOR_SAVE_FORMAT_VERSION) {
    if (decoded.rulesVersion === CHOIR_RULES_VERSION) {
      return migratePriorWorld(decoded, PRIOR_SAVE_FORMAT_VERSION, CHOIR_RULES_VERSION, false);
    }
    if (decoded.rulesVersion === PRIOR_RULES_VERSION) {
      return migratePriorWorld(decoded, PRIOR_SAVE_FORMAT_VERSION, PRIOR_RULES_VERSION, false);
    }
    throw new Error(`TIDEWEFT rules ${String(decoded.rulesVersion)} are incompatible with ${RULES_VERSION}`);
  }
  if (decoded.saveFormatVersion !== SAVE_FORMAT_VERSION) {
    throw new Error(`TIDEWEFT save format ${String(decoded.saveFormatVersion)} has no migration`);
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
