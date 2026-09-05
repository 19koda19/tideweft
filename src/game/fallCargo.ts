import { evaluateCargoEnvironment } from "../sim/cargoEnvironment";
import { keyedChance, keyedRandomInt, type RootSeed } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import type { FallRiskEvaluation } from "./fallRisk";
import {
  LOOSE_CARGO_MAX_ENTITIES,
  LOOSE_CARGO_MAX_VELOCITY,
  createLooseCargoExpectedManifest,
  createLooseCargoMultiWorldExpectedManifest,
  looseCargoPayloadProperty,
  scatterLooseCargo,
  setLooseCargoLotMaterialState,
  validateLooseCargoExpectedManifest,
  validateLooseCargoMultiWorldExpectedManifest,
  type LooseCargoCarrierState,
  type LooseCargoExpectedManifest,
  type LooseCargoWorldState,
} from "./looseCargo";

export const FALL_CARGO_VERSION = 1 as const;
const FALL_CARGO_DOMAIN = 0x4643_4152;
const SELECT_LOT_PURPOSE = 1;
const SEPARATE_PURPOSE = 2;
const VELOCITY_X_PURPOSE = 3;
const VELOCITY_Y_PURPOSE = 4;

export type FallCargoOutcome =
  | "unchanged"
  | "impacted-carried"
  | "separated"
  | "rejected";

export interface FallCargoResolutionInput {
  readonly seed: RootSeed;
  readonly actorId: number;
  readonly evaluation: FallRiskEvaluation;
  /** Current persisted traversal cursor before accepting this evaluation. */
  readonly nextTraversalOrdinal: number;
  readonly world: LooseCargoWorldState;
  /**
   * Other persisted regional owners covered by `expectedManifest`. They are
   * immutable during this local fall transaction, but must remain part of the
   * conservation proof when cargo exists outside the active region.
   */
  readonly otherWorlds?: readonly LooseCargoWorldState[];
  readonly carrier: LooseCargoCarrierState;
  /** Persisted independently; never rebuild this from a possibly damaged save. */
  readonly expectedManifest: LooseCargoExpectedManifest;
  readonly x: number;
  readonly y: number;
}

export interface FallCargoResolution {
  readonly version: typeof FALL_CARGO_VERSION;
  readonly ok: boolean;
  readonly outcome: FallCargoOutcome;
  readonly reason: string;
  readonly world: LooseCargoWorldState;
  readonly carrier: LooseCargoCarrierState;
  readonly expectedManifest: LooseCargoExpectedManifest;
  readonly selectedLotId: string | null;
  readonly separatedEntityIds: readonly string[];
  readonly cargoShock: number;
}

/**
 * Apply one accepted stumble/fall quote to physical cargo. Selection and
 * separation are addressed by the traversal ordinal and sorted stable lot IDs,
 * so neither save/reload nor carrier array order can reroll the result.
 */
export function resolveFallCargo(input: FallCargoResolutionInput): FallCargoResolution {
  const unchanged = (
    ok: boolean,
    outcome: FallCargoOutcome,
    reason: string,
    selectedLotId: string | null = null,
  ): FallCargoResolution => ({
    version: FALL_CARGO_VERSION,
    ok,
    outcome,
    reason,
    world: input.world,
    carrier: input.carrier,
    expectedManifest: input.expectedManifest,
    selectedLotId,
    separatedEntityIds: [],
    cargoShock: input.evaluation.consequenceQuote?.cargoShock ?? 0,
  });

  const manifest = input.otherWorlds === undefined
    ? validateLooseCargoExpectedManifest(
        input.expectedManifest,
        input.world,
        input.carrier,
      )
    : validateLooseCargoMultiWorldExpectedManifest(
        input.expectedManifest,
        [input.world, ...input.otherWorlds],
        input.carrier,
      );
  if (!manifest.valid) return unchanged(false, "rejected", `manifest-${manifest.reason}`);
  if (!validSeed(input.seed)
    || !Number.isSafeInteger(input.actorId)
    || input.actorId < 0
    || !Number.isSafeInteger(input.nextTraversalOrdinal)
    || input.nextTraversalOrdinal < 0
    || !Number.isSafeInteger(input.x)
    || !Number.isSafeInteger(input.y)) {
    return unchanged(false, "rejected", "invalid-input");
  }

  const evaluation = input.evaluation;
  const quote = evaluation.consequenceQuote;
  if (!evaluation.valid || !evaluation.evaluated || (!evaluation.fell && !evaluation.stumbled)) {
    return unchanged(true, "unchanged", "no-cargo-incident");
  }
  if (quote === null
    || evaluation.usedTraversalOrdinal === null
    || !Number.isSafeInteger(evaluation.usedTraversalOrdinal)
    || evaluation.usedTraversalOrdinal < 0) {
    return unchanged(false, "rejected", "invalid-fall-evaluation");
  }
  const traversalOrdinal = evaluation.usedTraversalOrdinal;
  if (traversalOrdinal !== input.nextTraversalOrdinal) {
    return unchanged(false, "rejected", "traversal-already-processed");
  }
  const orderedLots = [...input.carrier.lots].sort((left, right) => left.id.localeCompare(right.id));
  if (orderedLots.length === 0 || quote.cargoShock <= 0) {
    return unchanged(true, "unchanged", "no-physical-cargo");
  }

  const selectedIndex = keyedRandomInt(
    input.seed,
    FALL_CARGO_DOMAIN,
    traversalOrdinal,
    input.actorId,
    SELECT_LOT_PURPOSE,
    0,
    orderedLots.length - 1,
  );
  const selected = orderedLots[selectedIndex];
  if (!selected) return unchanged(false, "rejected", "lot-selection-failed");
  const material = evaluateCargoEnvironment({
    property: looseCargoPayloadProperty(selected.payload),
    state: selected.materialState,
    environment: {
      rain: 0,
      heat: 0,
      cold: 0,
      immersion: 0,
      currentX: 0,
      currentY: 0,
      magicalWaterFlux: 0,
      impact: quote.cargoShock,
    },
  });
  const impacted = setLooseCargoLotMaterialState(
    input.carrier,
    selected.id,
    material.nextState,
  );
  if (!impacted.ok) return unchanged(false, "rejected", `impact-${impacted.reason}`, selected.id);

  const impactedManifest = input.otherWorlds === undefined
    ? createLooseCargoExpectedManifest(input.world, impacted.carrier)
    : createLooseCargoMultiWorldExpectedManifest(
        [input.world, ...input.otherWorlds],
        impacted.carrier,
      );
  const impactedOnly = (reason: string): FallCargoResolution => ({
    version: FALL_CARGO_VERSION,
    ok: true,
    outcome: "impacted-carried",
    reason,
    world: input.world,
    carrier: impacted.carrier,
    expectedManifest: impactedManifest,
    selectedLotId: selected.id,
    separatedEntityIds: [],
    cargoShock: quote.cargoShock,
  });
  if (!evaluation.fell) return impactedOnly("stumble-impact");

  const separationChance = Math.min(
    940_000,
    220_000 + Math.trunc(quote.cargoShock * 3 / 4),
  );
  const separates = quote.cargoShock >= 850_000 || keyedChance(
    input.seed,
    FALL_CARGO_DOMAIN,
    traversalOrdinal,
    input.actorId,
    SEPARATE_PURPOSE,
    separationChance,
  );
  if (!separates) return impactedOnly("load-held-after-impact");

  const partCount = selected.payload.kind === "gear"
    ? 1
    : selected.payload.quantity >= 2 && quote.cargoShock >= 650_000
      ? 2
      : 1;
  if (input.world.entities.length + partCount > LOOSE_CARGO_MAX_ENTITIES) {
    return impactedOnly("loaded-region-cap-held-impact");
  }
  const parts = Array.from({ length: partCount }, (_, index) => {
    const velocityX = index === 1 ? 0 : keyedRandomInt(
      input.seed,
      FALL_CARGO_DOMAIN,
      traversalOrdinal,
      input.actorId,
      VELOCITY_X_PURPOSE,
      -LOOSE_CARGO_MAX_VELOCITY,
      LOOSE_CARGO_MAX_VELOCITY,
      index,
    );
    const velocityY = index === 1 ? 0 : keyedRandomInt(
      input.seed,
      FALL_CARGO_DOMAIN,
      traversalOrdinal,
      input.actorId,
      VELOCITY_Y_PURPOSE,
      -LOOSE_CARGO_MAX_VELOCITY,
      LOOSE_CARGO_MAX_VELOCITY,
      index,
    );
    const quantity = selected.payload.kind === "gear" ? undefined : 1;
    return { ...(quantity === undefined ? {} : { quantity }), velocityX, velocityY };
  });
  const scattered = scatterLooseCargo(input.world, impacted.carrier, {
    lotId: selected.id,
    x: input.x,
    y: input.y,
    cause: "fall-separation",
    parts,
  });
  if (!scattered.ok) return impactedOnly(`separation-${scattered.reason}`);
  const nextManifest = input.otherWorlds === undefined
    ? createLooseCargoExpectedManifest(scattered.world, scattered.carrier)
    : createLooseCargoMultiWorldExpectedManifest(
        [scattered.world, ...input.otherWorlds],
        scattered.carrier,
      );
  const verified = input.otherWorlds === undefined
    ? validateLooseCargoExpectedManifest(
        nextManifest,
        scattered.world,
        scattered.carrier,
      )
    : validateLooseCargoMultiWorldExpectedManifest(
        nextManifest,
        [scattered.world, ...input.otherWorlds],
        scattered.carrier,
      );
  if (!verified.valid) return unchanged(false, "rejected", "post-transaction-manifest", selected.id);
  return {
    version: FALL_CARGO_VERSION,
    ok: true,
    outcome: scattered.entities.length > 0 ? "separated" : "impacted-carried",
    reason: scattered.reason,
    world: scattered.world,
    carrier: scattered.carrier,
    expectedManifest: nextManifest,
    selectedLotId: selected.id,
    separatedEntityIds: scattered.entities.map(({ id }) => id),
    cargoShock: quote.cargoShock,
  };
}

function validSeed(seed: RootSeed): boolean {
  return Array.isArray(seed)
    && seed.length === 4
    && seed.every((word) => Number.isSafeInteger(word) && word >= 0 && word <= 0xffff_ffff);
}

/** Useful to UI and balancing without exposing the random branch itself. */
export function fallCargoSeparationBand(cargoShock: number): "held" | "possible" | "likely" | "violent" {
  const shock = Math.max(0, Math.min(FIXED_POINT, Math.trunc(cargoShock)));
  if (shock < 260_000) return "held";
  if (shock < 520_000) return "possible";
  if (shock < 850_000) return "likely";
  return "violent";
}
