import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
} from "../sim/actorPerception";
import { createWorldView, deserializeWorld } from "../sim/public";
import {
  createRegionCoord,
  globalTileToRegion,
  regionKey,
  regionLocalToGlobalTile,
} from "../sim/regions";
import type { RootSeed } from "../sim/rng";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH, type WorldView } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import { ADRIFT_STAND_DEPTH } from "./adrift";
import { deserializeBio0Ecology } from "./bio0Ecology";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  migrateLegacyCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  projectCoreEcologyActivity,
  projectCoreEcologyDayPhase,
} from "./coreEcologyActivity";
import {
  CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS,
  CORE_ECOLOGY_GROUP_COHESION_RECOVERY,
  CORE_ECOLOGY_GROUP_REJOIN_COMPLETE_COHESION,
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  reconcileCoreEcologyGroupAnchors,
  reconcileCoreEcologyGroupMaterialized,
  type CoreEcologyGroupState,
} from "./coreEcologyGroups";
import {
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES,
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_VERSION,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_VERSION,
  CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_VERSION,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_VERSION,
  type CoreEcologyRegionalPredatorHabitatAssemblage,
} from "./coreEcologyHabitat";
import type {
  CoreEcologySettlementShadowsStimulusFrame,
  CoreEcologySmallWorldSourceStepInput,
} from "./coreEcologySmallWorld";
import { deserializeDogActorRoster } from "./dogActorRoster";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import {
  repositionCoreWildlifeActor,
  replaceCoreWildlifeActorPhysiology,
} from "./coreWildlifeActor";
import {
  deriveCoreEcologyMaterializedActorIds,
  setCoreEcologyMaterializationForWindow,
} from "./coreEcologyRuntime";
import {
  coreEcologySpeciesCanOwnActorAddress,
  coreEcologySpeciesHasRuntimeCapability,
  coreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import { stepCoreEcologyTidalTable } from "./coreEcologyTidalTable";
import { coreWildlifeTraversabilityCell } from "./coreWildlifeLocomotionProfile";
import { TILE_UNITS, type PlayerState } from "./player";
import {
  capturePlayerRegionalTravel,
  recenterRegionalPlayer,
  restorePlayerRegionalTravel,
  serializePlayerRegionalTravel,
} from "./regionalPlayerTravel";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  regionLocalToWindowTile,
} from "./regionalTravel";
import { putRegionalEcologyResidentDeviation } from "./regionalEcology";
import {
  createRegionalEcologyState,
  regionalEcologyRegionalResidentsForActiveRegions,
  type RegionalEcologyActiveResidentInput,
  type RegionalEcologyStateV1,
} from "./regionalEcologyState";
import {
  createRegionalEcologyStateV2,
  deserializeRegionalEcologyStateV2,
  replaceRegionalEcologyStateV2ActiveState,
  serializeRegionalEcologyStateV2,
} from "./regionalEcologyStateV2";
import {
  createRegionalWorldView,
  regionalStorageRegionsInView,
  regionalTileIndexInView,
} from "./regionalWorldView";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import {
  canonicalizeSettlementEcologyState,
  deserializeSettlementEcologyState,
  serializeSettlementEcologyState,
} from "./settlementEcology";
import {
  deserializeSettlementDomesticAnimalRecoveryState,
  resolveSettlementDomesticAnimalRecovery,
  serializeSettlementDomesticAnimalRecoveryState,
  stageSettlementDomesticAnimalRecovery,
} from "./settlementDomesticAnimalRecovery";
import {
  PRIOR_SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
  PRIOR_SETTLEMENT_WORKING_ANIMALS_VERSION,
  PRIOR_SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
  deserializeSettlementWorkingAnimalState,
  resolveSettlementWorkingAnimalActivity,
  serializeSettlementWorkingAnimalState,
  settlementWorkingAnimalReturnArea,
  stageSettlementWorkingAnimalActivity,
  stageSettlementWorkingAnimalTaskLifecycle,
} from "./settlementWorkingAnimals";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

const settlementShadowsHarness = vi.hoisted(() => ({
  excludePhysicalFood: false,
  exposeOnlyPhysicalFood: false,
  rejectAfterWorkingDog: false,
}));
const runtimeEcologyHarness = vi.hoisted(() => ({
  disableDomesticFoodInvestigation: false,
}));
const guardianPerceptionHarness = vi.hoisted(() => ({
  mode: null as null | "reachable" | "unreachable-or-outside-duty",
  observerId: null as string | null,
  handlerId: null as string | null,
  observationId: null as string | null,
  area: null as null | Readonly<{
    center: WorldPosition;
    radiusUnits: number;
  }>,
  targetKind: null as null | "reachable" | "unreachable" | "outside-duty",
}));
const domesticRecoveryHarness = vi.hoisted(() => ({
  enabled: false,
  caretakerActorId: null as string | null,
  separatedActorId: null as string | null,
  memberActorIds: [] as string[],
}));

function capturedGuardianPerceptionArea(): Readonly<{
  center: WorldPosition;
  radiusUnits: number;
}> | null {
  return guardianPerceptionHarness.area;
}

vi.mock("./coreEcologyPerception", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./coreEcologyPerception")>();
  const { createActorObservation } = await import("../sim/actorPerception");
  const { ADRIFT_STAND_DEPTH } = await import("./adrift");
  const { livingActorAddressInRegionalWindow } = await import("./livingActor");
  const {
    WORLD_POSITION_UNITS_PER_TILE,
    createWorldPosition,
    worldPositionDelta,
  } = await import("./worldPosition");

  const stripHarnessObserver = (
    batches: readonly import("./coreEcologyPerception").CoreEcologyObservationBatch[] | null,
  ) => {
    if (batches === null || guardianPerceptionHarness.observerId === null) return batches;
    return Object.freeze(batches.map((batch) => batch.observerId
      === guardianPerceptionHarness.observerId
      ? Object.freeze({ ...batch, observations: Object.freeze([]) })
      : batch));
  };

  return {
    ...actual,
    collectCoreEcologyVisualObservationBatches: (
      ...args: Parameters<typeof actual.collectCoreEcologyVisualObservationBatches>
    ) => {
      let collected = actual.collectCoreEcologyVisualObservationBatches(...args);
      const frame = args[0] as import("./coreEcologyPerception").CoreEcologyPerceptionFrameInput;
      if (
        collected !== null
        && domesticRecoveryHarness.enabled
        && domesticRecoveryHarness.caretakerActorId !== null
        && domesticRecoveryHarness.separatedActorId !== null
      ) {
        const actorById = new Map(frame.actors.map((actor) => (
          [actor.identity.stableId, actor] as const
        )));
        const handler = frame.participants?.find(({ address }) => (
          address.actorId === domesticRecoveryHarness.caretakerActorId
        ))?.address;
        const witnessedAnimals = domesticRecoveryHarness.memberActorIds.flatMap((actorId) => {
          const actor = actorById.get(actorId);
          if (actor === undefined) return [];
          const observation = createActorObservation({
            id: `TEST-RECOVERY-CENSUS-${frame.tick}-${actorId}`,
            observerId: domesticRecoveryHarness.caretakerActorId!,
            observedAtTick: frame.tick,
            channel: "vision",
            perceivedClass: actor.identity.species,
            subjectId: actorId,
            area: { center: actor.address.position, radiusUnits: 0 },
            confidence: 1_000_000,
            salience: 1_000_000,
            identification: "identified",
            interrupt: "none",
          });
          return observation === null ? [] : [observation];
        });
        const separated = actorById.get(domesticRecoveryHarness.separatedActorId);
        const retreatObservation = frame.tick === 1
          && separated !== undefined
          && handler !== undefined
          ? createActorObservation({
              id: `TEST-RECOVERY-LIVE-HUMAN-${frame.tick}`,
              observerId: separated.identity.stableId,
              observedAtTick: frame.tick,
              channel: "vision",
              perceivedClass: "human",
              subjectId: handler.actorId,
              area: { center: handler.position, radiusUnits: 0 },
              confidence: 1_000_000,
              salience: 1_000_000,
              identification: "identified",
              interrupt: "none",
            })
          : null;
        collected = Object.freeze(collected.map((batch) => {
          if (batch.observerId === domesticRecoveryHarness.caretakerActorId) {
            return Object.freeze({
              ...batch,
              observations: Object.freeze([...batch.observations, ...witnessedAnimals]),
            });
          }
          if (
            retreatObservation !== null
            && batch.observerId === domesticRecoveryHarness.separatedActorId
          ) {
            return Object.freeze({
              ...batch,
              observations: Object.freeze([...batch.observations, retreatObservation]),
            });
          }
          return batch;
        }));
      }
      const observerId = guardianPerceptionHarness.observerId;
      const mode = guardianPerceptionHarness.mode;
      if (collected === null || observerId === null) return collected;
      if (mode === null) {
        return Object.freeze(collected.map((batch) => batch.observerId === observerId
          ? Object.freeze({
              ...batch,
              observations: Object.freeze(batch.observations.filter(({ subjectId }) => (
                subjectId === guardianPerceptionHarness.handlerId
              ))),
            })
          : batch));
      }
      const participant = frame.participants?.find(({ address }) => (
        address.actorId === observerId
      ));
      const placement = participant === undefined
        ? null
        : livingActorAddressInRegionalWindow(participant.address, frame.window);
      if (participant === undefined || placement === null) return collected;
      const columns = frame.world.terrain.width;
      const rows = frame.world.terrain.height;
      const originX = placement.tileIndex % columns;
      const originY = Math.floor(placement.tileIndex / columns);
      const open = (x: number, y: number): boolean => {
        const tile = frame.world.terrain.tiles[y * columns + x];
        return tile !== undefined
          && tile.terrain !== "deep-water"
          && tile.waterDepth <= ADRIFT_STAND_DEPTH;
      };
      const candidateAt = (x: number, y: number) => {
        if (x < 0 || x >= columns || y < 0 || y >= rows) return null;
        const address = frame.window.addresses[y * columns + x];
        return address === undefined
          ? null
          : createWorldPosition(
              address.region,
              address.localX * WORLD_POSITION_UNITS_PER_TILE
                + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
              address.localY * WORLD_POSITION_UNITS_PER_TILE
                + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
            );
      };

      let target: WorldPosition | null = null;
      let radiusUnits = 250;
      let targetKind: typeof guardianPerceptionHarness.targetKind = null;
      if (mode === "reachable") {
        const visited = new Set([placement.tileIndex]);
        let frontier = [{ x: originX, y: originY, depth: 0 }];
        while (frontier.length > 0 && target === null) {
          const next = [] as typeof frontier;
          for (const cell of frontier) {
            if (cell.depth >= 2) {
              target = candidateAt(cell.x, cell.y);
              if (target !== null) break;
            }
            if (cell.depth >= 4) continue;
            for (const delta of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
              const x = cell.x + delta[0];
              const y = cell.y + delta[1];
              const index = y * columns + x;
              if (
                x < 0 || x >= columns || y < 0 || y >= rows
                || visited.has(index) || !open(x, y)
              ) continue;
              visited.add(index);
              next.push({ x, y, depth: cell.depth + 1 });
            }
          }
          frontier = next;
        }
        targetKind = target === null ? null : "reachable";
      } else {
        const deepCandidates = [] as Array<Readonly<{
          x: number;
          y: number;
          distanceSquared: number;
        }>>;
        for (let y = Math.max(0, originY - 17); y <= Math.min(rows - 1, originY + 17); y += 1) {
          for (let x = Math.max(0, originX - 17); x <= Math.min(columns - 1, originX + 17); x += 1) {
            const distanceSquared = (x - originX) ** 2 + (y - originY) ** 2;
            const tile = frame.world.terrain.tiles[y * columns + x];
            if (
              distanceSquared > 0 && distanceSquared <= 289
              && tile !== undefined
              && (tile.terrain === "deep-water" || tile.waterDepth > ADRIFT_STAND_DEPTH)
            ) deepCandidates.push({ x, y, distanceSquared });
          }
        }
        deepCandidates.sort((left, right) => (
          left.distanceSquared - right.distanceSquared
          || left.y - right.y
          || left.x - right.x
        ));
        const deep = deepCandidates[0];
        if (deep !== undefined) {
          target = candidateAt(deep.x, deep.y);
          if (target !== null) {
            const displacement = worldPositionDelta(participant.address.position, target);
            // A wide but still lawful hearing uncertainty overlaps the duty
            // area while its deterministic search probe remains the closed
            // deep-water center. This exercises exact-route preflight.
            radiusUnits = Math.max(
              250,
              Math.min(10_000, Math.ceil(Math.hypot(displacement.x, displacement.y) - 7_000)),
            );
            targetKind = "unreachable";
          }
        } else {
          for (let distance = 10; distance <= 16 && target === null; distance += 1) {
            for (const delta of [[distance, 0], [0, distance], [-distance, 0], [0, -distance]] as const) {
              const candidate = candidateAt(originX + delta[0], originY + delta[1]);
              if (candidate === null) continue;
              const displacement = worldPositionDelta(participant.address.position, candidate);
              if (Math.hypot(displacement.x, displacement.y) <= 8_250) continue;
              target = candidate;
              targetKind = "outside-duty";
              break;
            }
          }
        }
      }
      if (target === null || targetKind === null) return collected;
      const observationId = `TEST-GUARDIAN-ALARM-${frame.tick}-${targetKind}`;
      const area = Object.freeze({ center: target, radiusUnits });
      const observation = createActorObservation({
        id: observationId,
        observerId,
        observedAtTick: frame.tick,
        channel: "hearing",
        perceivedClass: "animal-alarm",
        subjectId: null,
        area,
        // Strong enough to open lawful work, yet bounded enough to decay after
        // the dog has physically checked the uncertain area. The lifecycle
        // must wait for that actor-owned self-preservation to clear.
        confidence: 400_000,
        salience: 400_000,
        identification: "anonymous",
        interrupt: "none",
      });
      if (observation === null) return collected;
      guardianPerceptionHarness.mode = null;
      guardianPerceptionHarness.observationId = observationId;
      guardianPerceptionHarness.area = area;
      guardianPerceptionHarness.targetKind = targetKind;
      return Object.freeze(collected.map((batch) => batch.observerId === observerId
        ? Object.freeze({ ...batch, observations: Object.freeze([observation]) })
        : batch));
    },
    collectCoreEcologyAggregateActivityObservationBatches: (
      ...args: Parameters<typeof actual.collectCoreEcologyAggregateActivityObservationBatches>
    ) => stripHarnessObserver(
      actual.collectCoreEcologyAggregateActivityObservationBatches(...args),
    ),
    propagateCoreEcologyAlarmObservationBatches: (
      ...args: Parameters<typeof actual.propagateCoreEcologyAlarmObservationBatches>
    ) => stripHarnessObserver(actual.propagateCoreEcologyAlarmObservationBatches(...args)),
  };
});

vi.mock("./coreEcologySpeciesRuntimePolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./coreEcologySpeciesRuntimePolicy")>();
  return {
    ...actual,
    coreEcologySpeciesHasRuntimeCapability: (
      ...args: Parameters<typeof actual.coreEcologySpeciesHasRuntimeCapability>
    ) => runtimeEcologyHarness.disableDomesticFoodInvestigation
        && args[0] === "domestic-chicken"
        && args[1] === "food-investigation"
      ? false
      : actual.coreEcologySpeciesHasRuntimeCapability(...args),
  };
});

vi.mock("./coreEcologySmallWorld", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./coreEcologySmallWorld")>();
  const filteredFrame = (
    frame: CoreEcologySettlementShadowsStimulusFrame,
  ): CoreEcologySettlementShadowsStimulusFrame => ({
    ...frame,
    stimuli: frame.stimuli.filter(({ sourceKind }) => (
      settlementShadowsHarness.exposeOnlyPhysicalFood
        ? sourceKind === "exposed-food"
        : sourceKind !== "exposed-food"
    )),
  });
  return {
    ...actual,
    // This one integration seam isolates the existing physical-food channel
    // from stronger lawful co-located pressure. Production winner arbitration
    // remains untouched and is covered by the shared small-world kernel tests.
    stepCoreEcologySettlementShadows: (
      ...args: Parameters<typeof actual.stepCoreEcologySettlementShadows>
    ) => {
      if (settlementShadowsHarness.rejectAfterWorkingDog) return null;
      if (
        !settlementShadowsHarness.exposeOnlyPhysicalFood
        && !settlementShadowsHarness.excludePhysicalFood
        || args[2] === undefined
      ) {
        return actual.stepCoreEcologySettlementShadows(...args);
      }
      const frame = args[2] as CoreEcologySettlementShadowsStimulusFrame;
      return actual.stepCoreEcologySettlementShadows(args[0], args[1], filteredFrame(frame));
    },
    stepCoreEcologySmallWorldSourceSet: (
      ...args: Parameters<typeof actual.stepCoreEcologySmallWorldSourceSet>
    ) => {
      if (settlementShadowsHarness.rejectAfterWorkingDog) return null;
      if (
        !settlementShadowsHarness.exposeOnlyPhysicalFood
        && !settlementShadowsHarness.excludePhysicalFood
      ) {
        return actual.stepCoreEcologySmallWorldSourceSet(...args);
      }
      const sources = args[0] as readonly CoreEcologySmallWorldSourceStepInput[];
      return actual.stepCoreEcologySmallWorldSourceSet(sources.map((source) => ({
        ...source,
        stimulusFrame: filteredFrame(source.stimulusFrame),
      })), args[1]);
    },
  };
});

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {}

  async list() {
    return [];
  }

  async load(slotId: string) {
    return slotId === "autosave" && this.record
      ? structuredClone(this.record)
      : undefined;
  }

  async save(record: SaveRecord) {
    this.record = structuredClone(record);
  }

  async remove() {
    this.record = undefined;
  }

  snapshot(): SaveRecord {
    if (!this.record) throw new Error("settlement ecology fixture has no autosave");
    return structuredClone(this.record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime = 100;

beforeEach(() => {
  scheduledFrame = undefined;
  nextFrameTime = 100;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  settlementShadowsHarness.excludePhysicalFood = false;
  settlementShadowsHarness.exposeOnlyPhysicalFood = false;
  settlementShadowsHarness.rejectAfterWorkingDog = false;
  runtimeEcologyHarness.disableDomesticFoodInvestigation = false;
  guardianPerceptionHarness.mode = null;
  guardianPerceptionHarness.observerId = null;
  guardianPerceptionHarness.handlerId = null;
  guardianPerceptionHarness.observationId = null;
  guardianPerceptionHarness.area = null;
  guardianPerceptionHarness.targetKind = null;
  domesticRecoveryHarness.enabled = false;
  domesticRecoveryHarness.caretakerActorId = null;
  domesticRecoveryHarness.separatedActorId = null;
  domesticRecoveryHarness.memberActorIds = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function advancePlayerSteps(
  runtime: TideweftRuntime,
  count: number,
  afterFrame?: () => void,
): void {
  runtime.start();
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    afterFrame?.();
    nextFrameTime += 100;
  }
  runtime.stop();
}

function moveBeyondStoreDetailVisibility(runtime: TideweftRuntime): boolean {
  const initial = runtime.getRenderView();
  const { columns, rows, tileSize, tiles } = initial.terrain;
  const destinations = tiles
    .map((tile, tileIndex) => ({
      tile,
      tileIndex,
      x: (tileIndex % columns + 0.5) * tileSize,
      y: (Math.floor(tileIndex / columns) + 0.5) * tileSize,
    }))
    .filter(({ tile }) => !tile.blocked && tile.kind !== "deep-water")
    .sort((left, right) => (
      Math.hypot(right.x - initial.player.position.x, right.y - initial.player.position.y)
      - Math.hypot(left.x - initial.player.position.x, left.y - initial.player.position.y)
    ));
  for (const destination of destinations.slice(0, Math.max(columns, rows))) {
    runtime.dispatchRenderer({
      type: "move-target",
      point: { x: destination.x, y: destination.y },
      additive: false,
    });
    for (let frame = 0; frame < 160; frame += 1) {
      advancePlayerSteps(runtime, 1);
      if (!runtime.getRenderView().settlements.some(({ foodStore }) => foodStore !== undefined)) {
        runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
        return true;
      }
    }
  }
  return false;
}

const PRIOR_SETTLEMENT_ECOLOGY_FIELDS = [
  "carrier",
  "closure",
  "identity",
  "keeperKnowledge",
  "lastClosureTransactionId",
  "lastResolvedCauseEventId",
  "lastResolvedCauseEventTick",
  "lastResolvedLossOrdinal",
  "lastResolvedTransactionId",
  "pendingLoss",
] as const;

function savedEnvelope(repository: MemoryRepository): Record<string, unknown> {
  return JSON.parse(repository.snapshot().worldJson) as Record<string, unknown>;
}

function withCurrentEnvelopeFields(
  record: SaveRecord,
  replacement: Readonly<Record<string, unknown>>,
): SaveRecord {
  const current = JSON.parse(record.worldJson) as Record<string, unknown>;
  if (record.payloadVersion !== 26 || current.version !== 26) {
    throw new Error("runtime fixture is not a current v26 save");
  }
  const { integrity: _integrity, ...currentFields } = current;
  const nextFields = { ...currentFields, ...replacement };
  return {
    ...record,
    updatedAt: record.updatedAt + 1,
    worldJson: JSON.stringify({
      ...nextFields,
      integrity: gameSaveEnvelopeIntegrity(nextFields),
    }),
  };
}

function safeEastSeamRow(view: WorldView): number {
  for (let localY = 0; localY < WORLD_HEIGHT; localY += 1) {
    const sourceIndex = regionalTileIndexInView(
      view,
      createRegionCoord(0, 0),
      localY * WORLD_WIDTH + WORLD_WIDTH - 1,
    );
    const destinationIndex = regionalTileIndexInView(
      view,
      createRegionCoord(1, 0),
      localY * WORLD_WIDTH,
    );
    const source = sourceIndex === null ? undefined : view.terrain.tiles[sourceIndex];
    const destination = destinationIndex === null ? undefined : view.terrain.tiles[destinationIndex];
    if (
      source !== undefined
      && destination !== undefined
      && source.terrain !== "ridge"
      && destination.terrain !== "ridge"
      && Math.max(source.waterDepth, destination.waterDepth) <= ADRIFT_STAND_DEPTH
      && Math.max(source.roughness, destination.roughness) < 650_000
      && Math.abs(destination.elevation - source.elevation) < 180_000
    ) return localY;
  }
  throw new Error("guardian fixture did not produce a safe east seam");
}

function rebaseFixtureRegionalEcology(
  serialized: unknown,
  rootSeed: RootSeed,
  spatial: WorldView,
): string {
  const priorV2 = deserializeRegionalEcologyStateV2(serialized);
  if (priorV2 === null) throw new Error("guardian fixture started with invalid regional ecology");
  const prior = priorV2.base;
  const activeRegions = regionalStorageRegionsInView(spatial);
  const desiredRegionKeys = new Set(activeRegions.map(regionKey));
  let root = prior.root;
  for (const resident of prior.activeResidents) {
    if (
      resident.kind !== "regional-habitat"
      || desiredRegionKeys.has(regionKey(resident.region))
    ) continue;
    root = putRegionalEcologyResidentDeviation(root, {
      rootSeed,
      patch: resident.patch,
    });
  }
  const entrants = regionalEcologyRegionalResidentsForActiveRegions(
    root,
    rootSeed,
    activeRegions,
  );
  if (entrants === null) {
    throw new Error("guardian fixture could not derive regional ecology entrants");
  }
  const retainedBySource = new Map(prior.activeResidents
    .filter(({ kind }) => kind === "regional-habitat")
    .map((resident) => [resident.sourceKey, resident] as const));
  const activeResidents: RegionalEcologyActiveResidentInput[] = entrants.map((entrant) => ({
    kind: "regional-habitat" as const,
    sourceKey: entrant.sourceKey,
    patch: retainedBySource.get(entrant.sourceKey)?.patch ?? entrant.patch,
  }));
  for (const legacy of prior.activeResidents.filter(({ kind }) => kind === "legacy-cohort")) {
    activeResidents.push({
      kind: "legacy-cohort",
      sourceKey: legacy.sourceKey,
      patch: legacy.patch,
    });
  }
  return serializeRegionalEcologyStateV2(replaceRegionalEcologyStateV2ActiveState(priorV2, {
    expectedIntegrity: priorV2.integrity,
    base: {
      expectedIntegrity: prior.integrity,
      rootSeed,
      root,
      settlementHome: {
        sourceKey: prior.settlementHome.sourceKey,
        patch: prior.settlementHome.patch,
      },
      activeRegions,
      activeResidents,
    },
  }));
}

function withPlayerAtEastSeam(record: SaveRecord): SaveRecord {
  const current = JSON.parse(record.worldJson) as Record<string, unknown>;
  if (
    typeof current.world !== "string"
    || typeof current.regionalTravel !== "string"
    || typeof current.regionalEcology !== "string"
    || typeof current.player !== "object"
    || current.player === null
    || Array.isArray(current.player)
  ) throw new Error("guardian fixture omitted regional player authority");
  const world = deserializeWorld(current.world);
  const player = structuredClone(current.player) as PlayerState;
  const travel = restorePlayerRegionalTravel(
    world.meta.rootSeed,
    player,
    current.regionalTravel,
  );
  if (travel === null) throw new Error("guardian fixture regional sidecar did not restore");
  const view = createRegionalWorldView(createWorldView(world), travel.window, {
    discovered: player.discovered,
    depthSoundings: player.depthSoundings,
  });
  const localY = safeEastSeamRow(view);
  const source = regionLocalToWindowTile(
    travel.window,
    createRegionCoord(0, 0),
    WORLD_WIDTH - 1,
    localY,
  );
  if (source === null) throw new Error("guardian fixture lost its east seam source");
  const sourceIndex = source.y * REGIONAL_TRAVEL_COLUMNS + source.x;
  player.x = (source.x + 1) * TILE_UNITS - 1;
  player.y = source.y * TILE_UNITS + Math.floor(TILE_UNITS / 2);
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.stamina = FIXED_POINT;
  player.stability = FIXED_POINT;
  player.stabilityTrend = "steady";
  player.stabilityHint = "Stable on sound footing";
  player.pace = "steady";
  player.mode = "foot";
  player.sweepTicksRemaining = 0;
  player.sweepTotalTicks = 0;
  player.sweepPath = [];
  player.sweepSupport = null;
  player.currentTrace = [sourceIndex];
  player.surveyTrace = [sourceIndex];
  const transition = recenterRegionalPlayer(world.meta.rootSeed, travel, player);
  if (transition.crossed || !transition.rebased) {
    throw new Error("guardian fixture could not stage the origin-region seam");
  }
  const regionalTravel = serializePlayerRegionalTravel(
    capturePlayerRegionalTravel(transition.state, player),
  );
  if (restorePlayerRegionalTravel(world.meta.rootSeed, player, regionalTravel) === null) {
    throw new Error("guardian fixture produced an invalid seam sidecar");
  }
  const spatial = createRegionalWorldView(createWorldView(world), transition.state.window, {
    discovered: player.discovered,
    depthSoundings: player.depthSoundings,
  });
  return withCurrentEnvelopeFields(record, {
    player,
    regionalTravel,
    regionalEcology: rebaseFixtureRegionalEcology(
      current.regionalEcology,
      world.meta.rootSeed,
      spatial,
    ),
  });
}

function withPlayerFacing(record: SaveRecord, facingMilliRadians: number): SaveRecord {
  const current = JSON.parse(record.worldJson) as Record<string, unknown>;
  const { integrity: _integrity, ...currentFields } = current;
  if (
    typeof current.player !== "object"
    || current.player === null
    || Array.isArray(current.player)
  ) throw new Error("runtime fixture omitted its player state");
  const facedBase = {
    ...currentFields,
    player: {
      ...current.player,
      facingMilliRadians,
    },
  };
  return {
    ...record,
    worldJson: JSON.stringify({
      ...facedBase,
      integrity: gameSaveEnvelopeIntegrity(facedBase),
    }),
  };
}

function requireRegionalEcology(encoded: unknown): RegionalEcologyStateV1 {
  const state = deserializeRegionalEcologyStateV2(encoded);
  if (state === null) throw new Error("runtime fixture omitted canonical regional ecology");
  return state.base;
}

function requireCurrentCoreEcology(envelope: Readonly<Record<string, unknown>>) {
  return requireRegionalEcology(envelope.regionalEcology).settlementHome.patch;
}

function requireAuthenticatedLegacyCore(envelope: Readonly<Record<string, unknown>>) {
  const source = requireRegionalEcology(envelope.regionalEcology).root.legacyCohort?.sourcePatch;
  if (source === undefined) {
    throw new Error("migrated fixture omitted its authenticated v24 source");
  }
  return source;
}

function withCurrentSettlementHomeCore(
  record: SaveRecord,
  patch: CoreEcologyAggregatePatchState,
): SaveRecord {
  const envelope = JSON.parse(record.worldJson) as Record<string, unknown>;
  const regionalV2 = deserializeRegionalEcologyStateV2(envelope.regionalEcology);
  if (regionalV2 === null) throw new Error("settlement-home fixture omitted v26 authority");
  const regional = requireRegionalEcology(envelope.regionalEcology);
  if (patch.patchKey !== regional.settlementHome.sourceKey) {
    throw new Error("settlement-home fixture changed its signed source key");
  }
  const replacedBase = createRegionalEcologyState({
    root: regional.root,
    settlementHome: {
      sourceKey: regional.settlementHome.sourceKey,
      patch,
    },
    activeRegions: regional.activeRegions,
    activeResidents: regional.activeResidents.map(({ kind, sourceKey, patch: residentPatch }) => ({
      kind: kind === "legacy-cohort" ? "legacy-cohort" as const : "regional-habitat" as const,
      sourceKey,
      patch: residentPatch,
    })),
  });
  const replaced = createRegionalEcologyStateV2({
    base: replacedBase,
    alpineRoot: regionalV2.alpineRoot,
    alpineActiveResidents: regionalV2.alpineActiveResidents.map(({ sourceKey, patch: alpinePatch }) => ({
      sourceKey,
      patch: alpinePatch,
    })),
    adoption: regionalV2.adoption,
  });
  return withCurrentEnvelopeFields(record, {
    regionalEcology: serializeRegionalEcologyStateV2(replaced),
  });
}

function requireLegacyCoreEcology(encoded: unknown) {
  const state = migrateLegacyCoreEcologyAggregatePatch(encoded);
  if (state === null) throw new Error("runtime fixture omitted canonical legacy core ecology");
  return state;
}

/** Emit the exact pre-mortality v4 aggregate shape used by outer-v15–v19 fixtures. */
function serializeLegacyCoreEcologyAggregatePatchV4(
  patch: CoreEcologyAggregatePatchState,
): string {
  if (
    patch.nextMortalityOrdinal !== 0
    || patch.mortalityTransactions.length !== 0
    || patch.carcasses.length !== 0
    || patch.populations.some(({ baselinePopulationSize, populationSize, reserveUnits }) => (
      baselinePopulationSize !== populationSize || reserveUnits !== 0
    ))
  ) throw new Error("legacy aggregate fixture cannot discard committed mortality");
  const {
    carcasses: _carcasses,
    mortalityTransactions: _mortalityTransactions,
    nextMortalityOrdinal: _nextMortalityOrdinal,
    ...legacyPatch
  } = patch;
  return stableStringify({
    ...legacyPatch,
    version: 4,
    populations: patch.populations.map((population) => {
      const {
        baselinePopulationSize: _baselinePopulationSize,
        reserveUnits: _reserveUnits,
        ...legacyPopulation
      } = population;
      return legacyPopulation;
    }),
  });
}

interface ExpectedDomesticRepresentative {
  readonly species: "domestic-chicken" | "domestic-goat";
  readonly organization: "flock" | "herd";
  readonly custodyOrdinal: number;
  readonly structureKind: "coop" | "pen";
  readonly position: WorldPosition;
  readonly radiusUnits: number;
}

function expectDomesticRepresentatives(
  core: CoreEcologyAggregatePatchState,
  store: ReturnType<typeof deserializeSettlementEcologyState>,
  expected: readonly ExpectedDomesticRepresentative[],
): void {
  expect(store.domesticCustodies.filter(({ memberGroupId }) => memberGroupId !== null))
    .toHaveLength(expected.length);
  for (const representative of expected) {
    const populations = core.populations.filter(({ species }) => (
      species === representative.species
    ));
    const groups = core.groups.groups.filter(({ identity }) => (
      identity.species === representative.species
    ));
    const custodies = store.domesticCustodies.filter(({ species }) => (
      species === representative.species
    ));
    expect(populations).toHaveLength(1);
    expect(groups).toHaveLength(1);
    expect(custodies).toHaveLength(1);
    const population = populations[0];
    const group = groups[0];
    const custody = custodies[0];
    if (population === undefined || group === undefined || custody === undefined) {
      throw new Error(`runtime omitted ${representative.species} custody authority`);
    }
    expect(group.identity).toMatchObject({
      species: representative.species,
      organization: representative.organization,
    });
    expect(group.identity.stableId).toMatch(
      representative.organization === "herd" ? /^HERD-v1-/u : /^CHICKEN-FLOCK-v1-/u,
    );
    expect(custody).toMatchObject({
      custodyOrdinal: representative.custodyOrdinal,
      owner: { kind: "settlement", id: store.identity.settlementId },
      caretakerActorId: store.identity.keeperActorId,
      species: representative.species,
      memberGroupId: group.identity.stableId,
      homeStructure: {
        kind: representative.structureKind,
        position: representative.position,
        radiusUnits: representative.radiusUnits,
      },
    });
    expect(custody.memberActorIds).toEqual(population.members
      .map(({ actor }) => actor.identity.stableId)
      .sort());
  }
}

function expectSettlementHomePreservesDomesticSource(
  source: CoreEcologyAggregatePatchState,
  home: CoreEcologyAggregatePatchState,
): void {
  expect(home.derivation.kind).toBe("settlement-home-v1");
  const domesticSpecies = new Set([
    "domestic-cat",
    "domestic-chicken",
    "domestic-goat",
  ]);
  const sourcePopulations = source.populations.filter(({ species }) => (
    domesticSpecies.has(species)
  ));
  expect(home.populations).toEqual(sourcePopulations.map((population) => ({
    ...population,
    members: population.members.map((member) => ({
      ...member,
      materialization: "coarse" as const,
    })),
  })));
  expect(home.groups.groups.map(({ identity, memberOrdinals }) => ({
    identity,
    memberOrdinals,
  }))).toEqual(source.groups.groups.filter(({ identity }) => (
    domesticSpecies.has(identity.species)
  )).map(({ identity, memberOrdinals }) => ({
    identity,
    memberOrdinals,
  })));
  expect(home.aggregatePopulations).toEqual(source.aggregatePopulations.filter(({ species }) => (
    species === "brown-rat"
  )));
  expect(home.mortalityTransactions).toEqual([]);
  expect(home.carcasses).toEqual([]);
}

function storedFoodQuantity(
  state: ReturnType<typeof deserializeSettlementEcologyState>,
): number {
  const lot = state.carrier.lots.find(({ id }) => id === state.identity.foodLotId);
  return lot?.payload.kind === "provision" ? lot.payload.quantity : 0;
}

function downgradeSettlementEcologyToV1(encoded: unknown): string {
  if (typeof encoded !== "string") {
    throw new Error("current fixture omitted settlement ecology");
  }
  const prior = JSON.parse(encoded) as Record<string, unknown>;
  for (const field of [
    "domesticCustodies",
    "lastResolvedDomesticFoodUseCauseEventId",
    "lastResolvedDomesticFoodUseCauseEventTick",
    "lastResolvedDomesticFoodUseMemberActorId",
    "lastResolvedDomesticFoodUseOrdinal",
    "lastResolvedDomesticFoodUseTransactionId",
    "pendingDomesticFoodUse",
  ]) delete prior[field];
  if (typeof prior.revision !== "number" || prior.revision < 1) {
    throw new Error("current settlement fixture omitted its domestic revision");
  }
  prior.revision -= 3;
  prior.version = 1;
  return JSON.stringify(prior);
}

function downgradeSettlementEcologyToV2(encoded: unknown): string {
  if (typeof encoded !== "string") {
    throw new Error("current fixture omitted settlement ecology");
  }
  const current = JSON.parse(encoded) as Record<string, unknown>;
  if (!Array.isArray(current.domesticCustodies)) {
    throw new Error("current settlement fixture omitted plural custody");
  }
  const chicken = current.domesticCustodies.find((candidate) => (
    typeof candidate === "object"
    && candidate !== null
    && !Array.isArray(candidate)
    && (candidate as Record<string, unknown>).species === "domestic-chicken"
  )) as Record<string, unknown> | undefined;
  if (
    chicken === undefined
    || typeof chicken.homeStructure !== "object"
    || chicken.homeStructure === null
    || Array.isArray(chicken.homeStructure)
    || typeof current.revision !== "number"
    || current.revision < 1
  ) throw new Error("current settlement fixture omitted its Alpha-24 custody");
  const structure = chicken.homeStructure as Record<string, unknown>;
  const {
    homeStructure: _homeStructure,
    ...custodyFields
  } = chicken;
  const {
    domesticCustodies: _domesticCustodies,
    ...stateFields
  } = current;
  return JSON.stringify({
    ...stateFields,
    version: 2,
    revision: current.revision - 2,
    domesticCustody: {
      ...custodyFields,
      version: 1,
      coopId: structure.structureId,
      homePosition: structure.position,
      homeRadiusUnits: structure.radiusUnits,
    },
  });
}

/**
 * Historical envelope tests need the exact whole-patch v24 owner that existed
 * before regional storage split it. Fresh v26 saves retain the frozen v11
 * habitat on the settlement-home owner, so rebuild that source through the
 * same public construction and initialization kernels used by v24.
 */
function createExactV24CoreFromFreshV26(
  envelope: Readonly<Record<string, unknown>>,
): CoreEcologyAggregatePatchState {
  if (typeof envelope.world !== "string") {
    throw new Error("current fixture omitted its world");
  }
  const regional = requireRegionalEcology(envelope.regionalEcology);
  const home = regional.settlementHome.patch;
  if (home.derivation.kind !== "settlement-home-v1") {
    throw new Error("current fixture omitted its frozen settlement-home habitat");
  }
  const habitat = home.derivation.habitat;
  const world = deserializeWorld(envelope.world);
  const completedTick = world.meta.completedTick;
  let patch = createCoreEcologyAggregatePatch({
    seed: world.meta.rootSeed,
    patchKey: "wave-a/alarm-crossing",
    originRegion: habitat.originRegion,
    tick: completedTick,
    derivation: { kind: "habitat-v11", habitat },
    groups: exactV24Groups(world.meta.rootSeed, habitat, completedTick),
    populations: exactV24IndividualPopulations(habitat),
  });
  const regionOrigin = regionLocalToGlobalTile(habitat.originRegion, 0, 0);
  const materialized = setCoreEcologyMaterializationForWindow(patch, {
    origin: {
      x: regionOrigin.x - Math.trunc((REGIONAL_TRAVEL_COLUMNS - WORLD_WIDTH) / 2),
      y: regionOrigin.y - Math.trunc((REGIONAL_TRAVEL_ROWS - WORLD_HEIGHT) / 2),
    },
    terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
  }, completedTick);
  if (materialized === null) throw new Error("exact v24 fixture materialization failed");
  patch = materialized;
  const bear = patch.populations.find(({ species }) => species === "black-bear")
    ?.members[0]?.actor;
  if (bear !== undefined) {
    patch = replaceCoreEcologyAggregatePatchActor(patch, replaceCoreWildlifeActorPhysiology(
      bear,
      {
        atTick: completedTick,
        needs: { ...bear.needs, hunger: Math.max(680_000, bear.needs.hunger) },
        condition: bear.condition,
      },
    ));
  }
  const tidal = stepCoreEcologyTidalTable(patch, { atTick: completedTick });
  if (tidal === null) throw new Error("exact v24 fixture tidal initialization failed");
  patch = initializeExactV24Egret(tidal.patch, tidal.projection, completedTick);
  patch = initializeExactV24ActivityActor(patch, "american-black-duck", completedTick);
  return initializeExactV24ActivityActor(
    patch,
    "north-american-river-otter",
    completedTick,
  );
}

function exactV24Groups(
  seed: readonly [number, number, number, number],
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
  tick: number,
) {
  const groups: CoreEcologyGroupState[] = [];
  for (const population of habitat.populations) {
    const policy = coreEcologySpeciesRuntimePolicy(population.species);
    const anchor = population.allocations[0]?.position;
    if (
      policy === null
      || !policy.actorAddressable
      || policy.groupOrganization === null
      || policy.groupStableIdNamespace === null
      || !coreEcologySpeciesHasRuntimeCapability(population.species, "group-coordination")
      || population.allocations.length < 2
      || anchor === undefined
    ) continue;
    groups.push(createCoreEcologyGroup({
      seed,
      species: population.species,
      originRegion: habitat.originRegion,
      populationKey: population.populationKey,
      groupOrdinal: 0,
      memberOrdinals: population.allocations.map(({ allocationOrdinal }) => allocationOrdinal),
      anchor,
      tick,
    }));
  }
  return createCoreEcologyGroupSet(groups);
}

function exactV24IndividualPopulations(
  habitat: CoreEcologyRegionalPredatorHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
      || population.populationUnits === 0
      || !coreEcologySpeciesCanOwnActorAddress(population.species)
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "coarse" as const,
          })),
        }]
  ));
}

function initializeExactV24Egret(
  patch: CoreEcologyAggregatePatchState,
  projection: NonNullable<ReturnType<typeof stepCoreEcologyTidalTable>>["projection"],
  tick: number,
): CoreEcologyAggregatePatchState {
  if (projection.snowyEgret === null) return patch;
  const actor = patch.populations.find(({ species }) => species === "snowy-egret")
    ?.members[0]?.actor;
  const day = projectCoreEcologyDayPhase(tick);
  if (actor === undefined || day === null) {
    throw new Error("exact v24 fixture egret initialization failed");
  }
  const target = day.phase === "daylight" && projection.snowyEgret.wadingTarget !== null
    ? projection.snowyEgret.wadingTarget
    : projection.snowyEgret.refugeTarget;
  return replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
    atTick: tick,
    position: target.targetPosition,
    heading: actor.address.heading,
  }));
}

function initializeExactV24ActivityActor(
  patch: CoreEcologyAggregatePatchState,
  species: "american-black-duck" | "north-american-river-otter",
  tick: number,
): CoreEcologyAggregatePatchState {
  const member = patch.populations.find((population) => population.species === species)
    ?.members[0];
  if (member === undefined || member.materialization !== "materialized") return patch;
  const activity = projectCoreEcologyActivity(patch, {
    actorId: member.actor.identity.stableId,
    atTick: tick,
  });
  if (activity === null) throw new Error(`exact v24 ${species} initialization failed`);
  if (activity.motion.kind !== "target-area") return patch;
  return replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(member.actor, {
    atTick: tick,
    position: activity.motion.targetArea.center,
    heading: member.actor.address.heading,
  }));
}

function downgradeCoreEcologyToTidalWeb(
  current: CoreEcologyAggregatePatchState,
): string {
  if (
    current.derivation.kind !== "habitat-v11"
    && current.derivation.kind !== "legacy-fixed-v1-with-habitat-v11"
  ) throw new Error("current fixture did not use the regional-predator habitat");
  const {
    domesticAnchor: _domesticAnchor,
    domesticPenAnchor: _domesticPenAnchor,
    regionalHabitat: _regionalHabitat,
    ...habitatFields
  } = current.derivation.habitat;
  const populations = habitatFields.populations.filter(({ species }) => (
    species !== "domestic-chicken"
    && species !== "domestic-goat"
    && species !== "wild-boar"
    && species !== "elk"
    && species !== "gray-wolf"
    && species !== "cougar"
    && species !== "brown-bear"
  ));
  const downgraded = canonicalizeCoreEcologyAggregatePatch({
    ...current,
    derivation: {
      kind: current.derivation.kind === "habitat-v11"
        ? "habitat-v7"
        : "legacy-fixed-v1-with-habitat-v7",
      habitat: {
        ...habitatFields,
        generationVersion: CORE_ECOLOGY_TIDAL_WEB_HABITAT_VERSION,
        maximumAllocationBudget: CORE_ECOLOGY_TIDAL_WEB_HABITAT_MAX_ALLOCATIONS,
        populations,
        speciesEvaluations:
          habitatFields.evaluatedTiles * CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES.length,
      },
    },
    groups: {
      ...current.groups,
      groups: current.groups.groups.filter(({ identity }) => (
        identity.species !== "domestic-chicken"
        && identity.species !== "domestic-goat"
        && identity.species !== "wild-boar"
        && identity.species !== "elk"
        && identity.species !== "gray-wolf"
        && identity.species !== "cougar"
        && identity.species !== "brown-bear"
      )),
    },
    populations: current.populations.filter(({ species }) => (
      species !== "domestic-chicken"
      && species !== "domestic-goat"
      && species !== "wild-boar"
      && species !== "elk"
      && species !== "gray-wolf"
      && species !== "cougar"
      && species !== "brown-bear"
    )),
  });
  if (downgraded === null) throw new Error("tidal-web downgrade is not canonical");
  return serializeLegacyCoreEcologyAggregatePatchV4(downgraded);
}

function downgradeCoreEcologyToDomesticYard(
  current: CoreEcologyAggregatePatchState,
): string {
  if (
    current.derivation.kind !== "habitat-v11"
    && current.derivation.kind !== "legacy-fixed-v1-with-habitat-v11"
  ) throw new Error("current fixture did not use the regional-predator habitat");
  const {
    domesticPenAnchor: _domesticPenAnchor,
    regionalHabitat: _regionalHabitat,
    ...habitatFields
  } = current.derivation.habitat;
  const populations = habitatFields.populations.filter(({ species }) => (
    species !== "domestic-goat"
    && species !== "wild-boar"
    && species !== "elk"
    && species !== "gray-wolf"
    && species !== "cougar"
    && species !== "brown-bear"
  ));
  const downgraded = canonicalizeCoreEcologyAggregatePatch({
    ...current,
    derivation: {
      kind: current.derivation.kind === "habitat-v11"
        ? "habitat-v8"
        : "legacy-fixed-v1-with-habitat-v8",
      habitat: {
        ...habitatFields,
        generationVersion: CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_VERSION,
        maximumAllocationBudget: CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_MAX_ALLOCATIONS,
        populations,
        speciesEvaluations:
          habitatFields.evaluatedTiles * CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES.length,
      },
    },
    groups: {
      ...current.groups,
      groups: current.groups.groups.filter(({ identity }) => (
        identity.species !== "domestic-goat"
        && identity.species !== "wild-boar"
        && identity.species !== "elk"
        && identity.species !== "gray-wolf"
        && identity.species !== "cougar"
        && identity.species !== "brown-bear"
      )),
    },
    populations: current.populations.filter(({ species }) => (
      species !== "domestic-goat"
      && species !== "wild-boar"
      && species !== "elk"
      && species !== "gray-wolf"
      && species !== "cougar"
      && species !== "brown-bear"
    )),
  });
  if (downgraded === null) throw new Error("domestic-yard downgrade is not canonical");
  return serializeLegacyCoreEcologyAggregatePatchV4(downgraded);
}

function downgradeCoreEcologyToDomesticPen(
  current: CoreEcologyAggregatePatchState,
): string {
  if (
    current.derivation.kind !== "habitat-v11"
    && current.derivation.kind !== "legacy-fixed-v1-with-habitat-v11"
  ) throw new Error("current fixture did not use the regional-predator habitat");
  const { regionalHabitat: _regionalHabitat, ...habitatFields } =
    current.derivation.habitat;
  const regionalSpecies = new Set([
    "wild-boar",
    "elk",
    "gray-wolf",
    "cougar",
    "brown-bear",
  ]);
  const downgraded = canonicalizeCoreEcologyAggregatePatch({
    ...current,
    derivation: {
      kind: current.derivation.kind === "habitat-v11"
        ? "habitat-v9"
        : "legacy-fixed-v1-with-habitat-v9",
      habitat: {
        ...habitatFields,
        generationVersion: CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_VERSION,
        maximumAllocationBudget: CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_MAX_ALLOCATIONS,
        populations: habitatFields.populations.slice(
          0,
          CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES.length,
        ),
        speciesEvaluations:
          habitatFields.evaluatedTiles * CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES.length,
      },
    },
    groups: {
      ...current.groups,
      groups: current.groups.groups.filter(({ identity }) => (
        !regionalSpecies.has(identity.species)
      )),
    },
    populations: current.populations.filter(({ species }) => !regionalSpecies.has(species)),
  });
  if (downgraded === null) throw new Error("domestic-pen downgrade is not canonical");
  return serializeLegacyCoreEcologyAggregatePatchV4(downgraded);
}

function asStorehouseV16Record(currentRecord: SaveRecord): SaveRecord {
  const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
  if (current.version !== 26) throw new Error("fixture is not a current save");
  const historicalCore = createExactV24CoreFromFreshV26(current);
  const {
    integrity: _integrity,
    regionalEcology: _regionalEcology,
    dogActorRoster: _dogActorRoster,
    settlementWorkingAnimals: _settlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _settlementDomesticAnimalRecovery,
    ...currentFields
  } = current;
  const priorBase = {
    ...currentFields,
    version: 16,
    coreEcology: downgradeCoreEcologyToTidalWeb(historicalCore),
    settlementEcology: downgradeSettlementEcologyToV1(current.settlementEcology),
  };
  return {
    ...currentRecord,
    payloadVersion: 16,
    worldJson: JSON.stringify({
      ...priorBase,
      integrity: gameSaveEnvelopeIntegrity(priorBase),
    }),
  };
}

function asDomesticYardV17Record(currentRecord: SaveRecord): SaveRecord {
  const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
  if (current.version !== 26) throw new Error("fixture is not a current save");
  const historicalCore = createExactV24CoreFromFreshV26(current);
  const {
    integrity: _integrity,
    regionalEcology: _regionalEcology,
    dogActorRoster: _dogActorRoster,
    settlementWorkingAnimals: _settlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _settlementDomesticAnimalRecovery,
    ...currentFields
  } = current;
  const priorBase = {
    ...currentFields,
    version: 17,
    coreEcology: downgradeCoreEcologyToDomesticYard(historicalCore),
    settlementEcology: downgradeSettlementEcologyToV2(current.settlementEcology),
  };
  return {
    ...currentRecord,
    payloadVersion: 17,
    worldJson: JSON.stringify({
      ...priorBase,
      integrity: gameSaveEnvelopeIntegrity(priorBase),
    }),
  };
}

function asDomesticPenV18Record(currentRecord: SaveRecord): SaveRecord {
  const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
  if (current.version !== 26 || typeof current.settlementEcology !== "string") {
    throw new Error("fixture is not a current working-dog save");
  }
  const historicalCore = createExactV24CoreFromFreshV26(current);
  const currentSettlement = JSON.parse(current.settlementEcology) as Record<string, unknown>;
  if (
    currentSettlement.version !== 4
    || typeof currentSettlement.revision !== "number"
    || !Array.isArray(currentSettlement.domesticCustodies)
  ) throw new Error("current fixture omitted its working-dog custody");
  const domesticCustodies = currentSettlement.domesticCustodies.filter((candidate) => (
    typeof candidate === "object"
    && candidate !== null
    && !Array.isArray(candidate)
    && (candidate as Record<string, unknown>).species !== "domestic-dog"
  ));
  if (domesticCustodies.length + 1 !== currentSettlement.domesticCustodies.length) {
    throw new Error("current fixture did not contain exactly one working-dog custody");
  }
  const priorSettlement = {
    ...currentSettlement,
    version: 3,
    revision: currentSettlement.revision - 1,
    domesticCustodies,
  };
  const {
    integrity: _integrity,
    regionalEcology: _regionalEcology,
    dogActorRoster: _dogActorRoster,
    settlementWorkingAnimals: _settlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _settlementDomesticAnimalRecovery,
    ...currentFields
  } = current;
  const priorBase = {
    ...currentFields,
    version: 18,
    coreEcology: downgradeCoreEcologyToDomesticPen(historicalCore),
    settlementEcology: JSON.stringify(priorSettlement),
  };
  return {
    ...currentRecord,
    payloadVersion: 18,
    worldJson: JSON.stringify({
      ...priorBase,
      integrity: gameSaveEnvelopeIntegrity(priorBase),
    }),
  };
}

function asPaddockWatchV19Record(currentRecord: SaveRecord): SaveRecord {
  const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
  if (
    current.version !== 26
    || typeof current.settlementWorkingAnimals !== "string"
  ) throw new Error("fixture is not a current task-lifecycle save");
  const historicalCore = createExactV24CoreFromFreshV26(current);
  const currentWork = JSON.parse(current.settlementWorkingAnimals) as Record<string, unknown>;
  if (!Array.isArray(currentWork.assignments)) {
    throw new Error("current fixture omitted working-animal assignments");
  }
  const priorAssignments = currentWork.assignments.map((candidate) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("current fixture contains a malformed assignment");
    }
    const {
      currentTask: _currentTask,
      lastResolvedTaskTransitionOrdinal: _lastResolvedTaskTransitionOrdinal,
      lastTaskOrdinal: _lastTaskOrdinal,
      lastTaskOutcome: _lastTaskOutcome,
      pendingTaskTransition: _pendingTaskTransition,
      ...prior
    } = candidate as Record<string, unknown>;
    return {
      ...prior,
      version: PRIOR_SETTLEMENT_WORKING_ANIMAL_ASSIGNMENT_VERSION,
    };
  });
  const priorWork = {
    ...currentWork,
    version: PRIOR_SETTLEMENT_WORKING_ANIMALS_VERSION,
    ownerId: PRIOR_SETTLEMENT_WORKING_ANIMALS_OWNER_ID,
    assignments: priorAssignments,
  };
  const {
    integrity: _integrity,
    regionalEcology: _regionalEcology,
    settlementDomesticAnimalRecovery: _settlementDomesticAnimalRecovery,
    ...currentFields
  } = current;
  const priorBase = {
    ...currentFields,
    version: 19,
    coreEcology: downgradeCoreEcologyToDomesticPen(historicalCore),
    settlementWorkingAnimals: stableStringify(priorWork),
  };
  return {
    ...currentRecord,
    payloadVersion: 19,
    worldJson: JSON.stringify({
      ...priorBase,
      integrity: gameSaveEnvelopeIntegrity(priorBase),
    }),
  };
}

async function advanceUntilDomesticFoodUse(
  runtime: TideweftRuntime,
  repository: MemoryRepository,
  maximumWorldTicks = 64,
): Promise<Readonly<{
  envelope: Record<string, unknown>;
  state: ReturnType<typeof deserializeSettlementEcologyState>;
  worldTicks: number;
  announcement: string | undefined;
}>> {
  let lastEnvelope: Record<string, unknown> | undefined;
  let witnessedFoodUseAnnouncement: string | undefined;
  for (let worldTicks = 1; worldTicks <= maximumWorldTicks; worldTicks += 1) {
    advancePlayerSteps(runtime, 10, () => {
      const message = runtime.getUIView().announcement?.message;
      if (message?.includes("eats one produce unit from the open store")) {
        witnessedFoodUseAnnouncement = message;
      }
    });
    await runtime.save();
    const envelope = savedEnvelope(repository);
    lastEnvelope = envelope;
    const state = deserializeSettlementEcologyState(envelope.settlementEcology);
    if (state.lastResolvedDomesticFoodUseOrdinal > 0) {
      return {
        envelope,
        state,
        worldTicks,
        announcement: witnessedFoodUseAnnouncement
          ?? runtime.getUIView().announcement?.message,
      };
    }
  }
  const store = lastEnvelope === undefined
    ? undefined
    : deserializeSettlementEcologyState(lastEnvelope.settlementEcology);
  const core = lastEnvelope === undefined
    ? undefined
    : requireCurrentCoreEcology(lastEnvelope);
  throw new Error(`domestic chicken did not reach the open store: ${JSON.stringify({
    store: store === undefined ? undefined : {
      closure: store.closure,
      position: store.identity.position,
      custody: store.domesticCustodies.find(({ species }) => (
        species === "domestic-chicken"
      ))?.memberActorIds,
    },
    chickens: core?.populations.find(({ species }) => species === "domestic-chicken")?.members
      .map(({ actor, materialization }) => ({
        id: actor.identity.stableId,
        materialization,
        position: actor.address.position,
        hunger: actor.needs.hunger,
        intent: actor.intent,
        beliefs: actor.perception.beliefs,
      })),
  })}`);
}

describe("runtime settlement ecology integration", () => {
  it("keeps a boundary-straddling social group atomic while coarse-aging its off-frame member", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "atomic social group window boundary",
      posture: "gale",
      sessionShape: "wander",
    });
    await source.save();
    source.destroy();

    const sourceRecord = sourceRepository.snapshot();
    const envelope = savedEnvelope(sourceRepository);
    if (
      typeof envelope.world !== "string"
      || typeof envelope.regionalTravel !== "string"
      || typeof envelope.player !== "object"
      || envelope.player === null
      || Array.isArray(envelope.player)
    ) throw new Error("boundary fixture omitted regional authority");
    const world = deserializeWorld(envelope.world);
    const player = structuredClone(envelope.player) as PlayerState;
    const travel = restorePlayerRegionalTravel(
      world.meta.rootSeed,
      player,
      envelope.regionalTravel,
    );
    if (travel === null) throw new Error("boundary fixture regional sidecar did not restore");

    let core = requireCurrentCoreEcology(envelope);
    const group = core.groups.groups.find(({ memberOrdinals }) => memberOrdinals.length > 1);
    const population = group === undefined ? undefined : core.populations.find((candidate) => (
      candidate.species === group.identity.species
      && candidate.populationKey === group.identity.populationKey
    ));
    const members = population?.members.filter(({ populationOrdinal }) => (
      group?.memberOrdinals.includes(populationOrdinal) ?? false
    )).sort((left, right) => left.populationOrdinal - right.populationOrdinal);
    if (group === undefined || population === undefined || members === undefined || members.length < 2) {
      throw new Error("boundary fixture omitted one bounded social group");
    }
    const localMemberIds = core.populations.flatMap(({ species, members: owned }) => (
      species === "wild-boar"
      || species === "elk"
      || species === "gray-wolf"
      || species === "cougar"
      || species === "brown-bear"
        ? []
        : owned.map(({ actor }) => actor.identity.stableId)
    ));
    core = setCoreEcologyAggregatePatchMaterializedActors(core, {
      atTick: core.updatedAtTick,
      actorIds: localMemberIds,
    });
    const worldPositionAtGlobalTile = (x: number, y: number): WorldPosition => {
      const address = globalTileToRegion(x, y);
      return createWorldPosition(
        address.region,
        address.localX * WORLD_POSITION_UNITS_PER_TILE
          + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
        address.localY * WORLD_POSITION_UNITS_PER_TILE
          + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
    };
    const inside = worldPositionAtGlobalTile(
      travel.window.origin.x,
      travel.window.origin.y + Math.floor(REGIONAL_TRAVEL_COLUMNS / 2),
    );
    const outside = worldPositionAtGlobalTile(
      travel.window.origin.x - 1,
      travel.window.origin.y + Math.floor(REGIONAL_TRAVEL_COLUMNS / 2),
    );
    const targetIndexById = new Map(members.map((member, index) => (
      [member.actor.identity.stableId, index] as const
    )));
    for (const [ordinal, member] of core.populations.flatMap(({ members: owned }) => (
      owned
    )).entries()) {
      const targetIndex = targetIndexById.get(member.actor.identity.stableId);
      core = replaceCoreEcologyAggregatePatchActor(core, repositionCoreWildlifeActor(
        member.actor,
        {
          atTick: core.updatedAtTick,
          position: targetIndex === 0
            ? inside
            : targetIndex === undefined
              ? worldPositionAtGlobalTile(
                  travel.window.origin.x + REGIONAL_TRAVEL_COLUMNS + 100 + ordinal,
                  travel.window.origin.y + REGIONAL_TRAVEL_COLUMNS + 100,
                )
              : outside,
          heading: member.actor.address.heading,
        },
      ));
    }
    expect(deriveCoreEcologyMaterializedActorIds(core, {
      origin: travel.window.origin,
      terrain: {
        width: REGIONAL_TRAVEL_COLUMNS,
        height: travel.window.addresses.length / REGIONAL_TRAVEL_COLUMNS,
      },
    })).toEqual(members.map(({ actor }) => actor.identity.stableId).sort());
    const stagedRecord = withCurrentSettlementHomeCore(sourceRecord, core);
    const stagedEnvelope = JSON.parse(stagedRecord.worldJson) as Record<string, unknown>;
    const storedCore = requireCurrentCoreEcology(stagedEnvelope);
    const rematerializedCore = setCoreEcologyMaterializationForWindow(storedCore, {
      origin: travel.window.origin,
      terrain: {
        width: REGIONAL_TRAVEL_COLUMNS,
        height: travel.window.addresses.length / REGIONAL_TRAVEL_COLUMNS,
      },
    }, storedCore.updatedAtTick);
    const expectedOffFrame = rematerializedCore?.populations.find((candidate) => (
      candidate.species === group.identity.species
      && candidate.populationKey === group.identity.populationKey
    ))?.members.find(({ actor }) => (
      actor.identity.stableId === members[1]?.actor.identity.stableId
    ));
    if (expectedOffFrame?.materialization !== "materialized") {
      throw new Error("boundary fixture did not rematerialize its whole social group");
    }
    const repository = new MemoryRepository(stagedRecord);
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    advancePlayerSteps(runtime, 10);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    await runtime.save();

    const saved = savedEnvelope(repository);
    const advancedWorld = deserializeWorld(String(saved.world));
    const advancedCore = requireCurrentCoreEcology(saved);
    const advancedPopulation = advancedCore.populations.find((candidate) => (
      candidate.species === group.identity.species
      && candidate.populationKey === group.identity.populationKey
    ));
    const advancedMembers = advancedPopulation?.members.filter(({ populationOrdinal }) => (
      group.memberOrdinals.includes(populationOrdinal)
    ));
    expect(advancedWorld.meta.completedTick).toBe(1);
    expect(advancedMembers).toHaveLength(members.length);
    expect(advancedMembers?.map(({ materialization, actor }) => ({
      materialization,
      updatedAtTick: actor.updatedAtTick,
    }))).toEqual(members.map(() => ({
      materialization: "coarse",
      updatedAtTick: advancedWorld.meta.completedTick,
    })));
    const advancedOffFrame = advancedMembers?.find(({ actor }) => (
      actor.identity.stableId === members[1]?.actor.identity.stableId
    ));
    expect(advancedOffFrame?.actor.address.position).toEqual(
      expectedOffFrame.actor.address.position,
    );
    expect(advancedOffFrame?.actor.intent.kind).toBe("observe");
    runtime.destroy();
  });

  it("links a witnessed livestock split, retains its coarse reunion off-frame, and closes after reload", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "physical livestock recovery witness",
      posture: "gale",
      sessionShape: "wander",
    });
    await source.save();
    source.destroy();

    const sourceRecord = sourceRepository.snapshot();
    const envelope = savedEnvelope(sourceRepository);
    if (
      typeof envelope.world !== "string"
      || typeof envelope.regionalTravel !== "string"
      || typeof envelope.player !== "object"
      || envelope.player === null
      || Array.isArray(envelope.player)
    ) throw new Error("recovery fixture omitted regional authority");
    const world = deserializeWorld(envelope.world);
    const player = structuredClone(envelope.player) as PlayerState;
    const travel = restorePlayerRegionalTravel(
      world.meta.rootSeed,
      player,
      envelope.regionalTravel,
    );
    if (travel === null) throw new Error("recovery fixture regional sidecar did not restore");
    const view = createRegionalWorldView(createWorldView(world), travel.window, {
      discovered: player.discovered,
      depthSoundings: player.depthSoundings,
    });
    const settlement = deserializeSettlementEcologyState(envelope.settlementEcology);
    const bio0 = deserializeBio0Ecology(envelope.bio0Ecology);
    const custody = settlement.domesticCustodies.find(({ species }) => (
      species === "domestic-goat"
    ));
    let core = requireCurrentCoreEcology(envelope);
    const group = core.groups.groups.find(({ identity }) => (
      identity.stableId === custody?.memberGroupId
    ));
    const population = group === undefined ? undefined : core.populations.find((candidate) => (
      candidate.species === group.identity.species
      && candidate.populationKey === group.identity.populationKey
    ));
    const goats = population?.members.filter(({ populationOrdinal }) => (
      group?.memberOrdinals.includes(populationOrdinal) ?? false
    )).sort((left, right) => left.populationOrdinal - right.populationOrdinal);
    if (
      custody === undefined
      || group === undefined
      || group.phase !== "cohesive"
      || goats === undefined
      || goats.length !== 2
      || bio0 === null
    ) throw new Error("recovery fixture omitted its bounded goat custody");

    const positionAtViewTile = (tileIndex: number): WorldPosition => {
      const address = travel.window.addresses[tileIndex];
      if (address === undefined) throw new Error("recovery fixture lost a terrain address");
      return createWorldPosition(
        address.region,
        address.localX * WORLD_POSITION_UNITS_PER_TILE
          + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
        address.localY * WORLD_POSITION_UNITS_PER_TILE
          + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
    };
    const positionAtGlobalTile = (x: number, y: number): WorldPosition => {
      const address = globalTileToRegion(x, y);
      return createWorldPosition(
        address.region,
        address.localX * WORLD_POSITION_UNITS_PER_TILE
          + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
        address.localY * WORLD_POSITION_UNITS_PER_TILE
          + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
    };
    const separatedPosition = view.terrain.tiles.map((tile, tileIndex) => ({
      tile,
      tileIndex,
      position: positionAtViewTile(tileIndex),
    })).filter(({ tile, tileIndex, position }) => {
      const delta = worldPositionDelta(custody.homeStructure.position, position);
      const caretakerDelta = worldPositionDelta(
        custody.homeStructure.position,
        bio0.porterAddress.position,
      );
      const distance = Math.hypot(delta.x, delta.y);
      const x = tileIndex % view.terrain.width;
      const y = Math.floor(tileIndex / view.terrain.width);
      if (
        distance <= 6_500
        || distance >= 7_800
        || delta.x * caretakerDelta.x + delta.y * caretakerDelta.y >= 0
        || x < 2
        || y < 2
        || x >= view.terrain.width - 2
        || y >= view.terrain.height - 2
        || coreWildlifeTraversabilityCell("domestic-goat", tile).access !== "open"
      ) return false;
      return ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).every(([dx, dy]) => {
        const neighbor = view.terrain.tiles[(y + dy) * view.terrain.width + x + dx];
        return neighbor !== undefined
          && coreWildlifeTraversabilityCell("domestic-goat", neighbor).access === "open";
      });
    }).sort((left, right) => {
      const leftDelta = worldPositionDelta(custody.homeStructure.position, left.position);
      const rightDelta = worldPositionDelta(custody.homeStructure.position, right.position);
      return Math.hypot(rightDelta.x, rightDelta.y) - Math.hypot(leftDelta.x, leftDelta.y)
        || left.tileIndex - right.tileIndex;
    })[0]?.position;
    if (separatedPosition === undefined) {
      throw new Error("recovery fixture could not find a traversable separated position");
    }
    const homePosition = view.terrain.tiles.map((tile, tileIndex) => ({
      tile,
      tileIndex,
      position: positionAtViewTile(tileIndex),
    })).filter(({ tile, position }) => {
      const homeDelta = worldPositionDelta(custody.homeStructure.position, position);
      return Math.hypot(homeDelta.x, homeDelta.y) <= custody.homeStructure.radiusUnits
        && coreWildlifeTraversabilityCell("domestic-goat", tile).access === "open";
    }).sort((left, right) => {
      const leftDelta = worldPositionDelta(separatedPosition, left.position);
      const rightDelta = worldPositionDelta(separatedPosition, right.position);
      return Math.hypot(rightDelta.x, rightDelta.y) - Math.hypot(leftDelta.x, leftDelta.y)
        || left.tileIndex - right.tileIndex;
    })[0]?.position;
    if (homePosition === undefined) {
      throw new Error("recovery fixture could not find a traversable home position");
    }

    const everyMember = core.populations.flatMap(({ species, members }) => (
      species === "cougar" || species === "brown-bear" ? [] : members
    ));
    core = setCoreEcologyAggregatePatchMaterializedActors(core, {
      atTick: core.updatedAtTick,
      actorIds: everyMember.map(({ actor }) => actor.identity.stableId),
    });
    const goatIds = new Set(goats.map(({ actor }) => actor.identity.stableId));
    const separatedActorId = goats[1]!.actor.identity.stableId;
    for (const [ordinal, member] of core.populations.flatMap(({ members }) => members).entries()) {
      const isSeparated = member.actor.identity.stableId === separatedActorId;
      const isHomeGoat = goatIds.has(member.actor.identity.stableId) && !isSeparated;
      const position = isSeparated
        ? separatedPosition
        : isHomeGoat
          ? homePosition
          : positionAtGlobalTile(
              travel.window.origin.x + view.terrain.width + 100 + ordinal,
              travel.window.origin.y + view.terrain.height + 100,
            );
      core = replaceCoreEcologyAggregatePatchActor(core, repositionCoreWildlifeActor(
        member.actor,
        {
          atTick: core.updatedAtTick,
          position,
          heading: member.actor.address.heading,
        },
      ));
    }
    expect(deriveCoreEcologyMaterializedActorIds(core, {
      origin: travel.window.origin,
      terrain: { width: view.terrain.width, height: view.terrain.height },
    })).toEqual(goats.map(({ actor }) => actor.identity.stableId).sort());

    const positionedGroup = core.groups.groups.find(({ identity }) => (
      identity.stableId === group.identity.stableId
    ));
    const positionedGoats = core.populations.find(({ species, populationKey }) => (
      species === group.identity.species
      && populationKey === group.identity.populationKey
    ))?.members.filter(({ populationOrdinal }) => (
      group.memberOrdinals.includes(populationOrdinal)
    )).sort((left, right) => left.populationOrdinal - right.populationOrdinal);
    if (positionedGroup === undefined || positionedGoats?.length !== goats.length) {
      throw new Error("recovery fixture lost its positioned goat authorities");
    }
    const split = reconcileCoreEcologyGroupMaterialized(positionedGroup, {
      atTick: core.updatedAtTick,
      memberPositions: positionedGoats.map(({ populationOrdinal, actor }) => ({
        memberOrdinal: populationOrdinal,
        position: actor.address.position,
      })),
      splitDistanceUnits: 6_000,
      rejoinDistanceUnits: 2_000,
      currentEscapeCause: {
        eventId: `test-recovery:escape:${core.updatedAtTick}`,
        causeReferenceId: "test-recovery:open-gate",
        memberOrdinal: goats[1]!.populationOrdinal,
      },
    });
    if (split === null || split.events.length !== 1 || split.events[0]?.kind !== "group-split") {
      throw new Error("recovery fixture could not authenticate its physical group split");
    }
    const splitCore = canonicalizeCoreEcologyAggregatePatch({
      ...core,
      groups: createCoreEcologyGroupSet(core.groups.groups.map((candidate) => (
        candidate.identity.stableId === split.group.identity.stableId
          ? split.group
          : candidate
      ))),
    });
    if (splitCore === null) {
      throw new Error("recovery fixture could not retain its split topology");
    }
    core = splitCore;
    const separatedMember = positionedGoats.find(({ actor }) => (
      actor.identity.stableId === separatedActorId
    ))?.actor;
    const initialRecovery = deserializeSettlementDomesticAnimalRecoveryState(
      envelope.settlementDomesticAnimalRecovery,
    );
    if (separatedMember === undefined || initialRecovery === null) {
      throw new Error("recovery fixture omitted its opening authorities");
    }
    const opened = stageSettlementDomesticAnimalRecovery(initialRecovery, {
      kind: "open",
      atTick: core.updatedAtTick,
      settlement,
      custodyRelationshipId: custody.relationshipId,
      group: split.group,
      splitEvent: split.events[0],
      separatedMember,
      memberActors: positionedGoats.map(({ actor }) => actor),
      lastKnownArea: { center: separatedMember.address.position, radiusUnits: 0 },
    });
    const resolvedOpening = opened === null
      ? null
      : resolveSettlementDomesticAnimalRecovery(opened.state, opened.transaction);
    if (resolvedOpening === null || resolvedOpening.state.currentCase?.phase !== "unnoticed") {
      throw new Error("recovery fixture could not commit its authenticated opening");
    }

    domesticRecoveryHarness.enabled = true;
    domesticRecoveryHarness.caretakerActorId = custody.caretakerActorId;
    domesticRecoveryHarness.separatedActorId = separatedActorId;
    domesticRecoveryHarness.memberActorIds = [...custody.memberActorIds];
    const preparedRecord = withCurrentEnvelopeFields(
      withCurrentSettlementHomeCore(sourceRecord, core),
      {
        settlementDomesticAnimalRecovery: serializeSettlementDomesticAnimalRecoveryState(
          resolvedOpening.state,
        ),
      },
    );
    const repository = new MemoryRepository(preparedRecord);
    const runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 20);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    await runtime.save();
    const searchingRecord = repository.snapshot();
    const searchingEnvelope = savedEnvelope(repository);
    const searchingRecovery = deserializeSettlementDomesticAnimalRecoveryState(
      searchingEnvelope.settlementDomesticAnimalRecovery,
    );
    const searchingWork = deserializeSettlementWorkingAnimalState(
      searchingEnvelope.settlementWorkingAnimals,
    );
    const searchingCase = searchingRecovery?.currentCase;
    const searchingAssignment = searchingWork?.assignments.find(({ protectedGroupId }) => (
      protectedGroupId === group.identity.stableId
    ));
    if (searchingAssignment === undefined) {
      throw new Error("recovery fixture lost its guardian assignment");
    }
    if (searchingCase === null) throw new Error("recovery fixture lost its open case");
    expect(searchingCase).toMatchObject({
      phase: "searching",
      groupId: group.identity.stableId,
      separatedMemberActorId: separatedActorId,
      notice: { source: "current-dual-sight" },
    });
    expect(searchingAssignment?.currentActivity).toMatchObject({
      activity: "investigate",
      cause: { kind: "handler-report" },
      perceivedArea: searchingCase?.lastKnownArea,
    });
    expect(searchingAssignment?.currentTask).toMatchObject({
      phase: "investigating",
      sourceObservationId: searchingAssignment.currentActivity.cause.referenceId,
      perceivedArea: searchingCase?.lastKnownArea,
    });
    expect(searchingCase?.linkedSearch).toMatchObject({
      taskId: searchingAssignment?.currentTask?.taskId,
      sourceObservationId: searchingAssignment?.currentTask?.sourceObservationId,
      sourceArea: searchingCase?.lastKnownArea,
    });

    const tamperedRecovery = JSON.parse(String(
      searchingEnvelope.settlementDomesticAnimalRecovery,
    )) as {
      currentCase: null | {
        memberBindings: Array<{ actorId: string; populationOrdinal: number }>;
        separatedMemberActorId: string;
        separatedMemberOrdinal: number;
      };
    };
    const tamperedCase = tamperedRecovery.currentCase;
    const separatedBinding = tamperedCase?.memberBindings.find(({ actorId }) => (
      actorId === tamperedCase.separatedMemberActorId
    ));
    const otherBinding = tamperedCase?.memberBindings.find(({ actorId }) => (
      actorId !== tamperedCase.separatedMemberActorId
    ));
    if (
      tamperedCase === null
      || separatedBinding === undefined
      || otherBinding === undefined
    ) throw new Error("recovery fixture omitted swappable member bindings");
    const separatedOrdinal = separatedBinding.populationOrdinal;
    separatedBinding.populationOrdinal = otherBinding.populationOrdinal;
    otherBinding.populationOrdinal = separatedOrdinal;
    tamperedCase.separatedMemberOrdinal = separatedBinding.populationOrdinal;
    const tamperedRepository = new MemoryRepository(withCurrentEnvelopeFields(searchingRecord, {
      settlementDomesticAnimalRecovery: stableStringify(tamperedRecovery),
    }));
    const rejected = await createTideweftRuntime(tamperedRepository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
    runtime.destroy();

    let offFrameCore = requireCurrentCoreEcology(searchingEnvelope);
    const currentGoatActors = offFrameCore.populations
      .find(({ species, populationKey }) => (
        species === group.identity.species
        && populationKey === group.identity.populationKey
      ))?.members.filter(({ populationOrdinal }) => group.memberOrdinals.includes(
        populationOrdinal,
      ));
    if (currentGoatActors === undefined || currentGoatActors.length !== goats.length) {
      throw new Error("recovery fixture lost its exact goat bodies before coarse reunion");
    }
    const farPositions = currentGoatActors.map((_, ordinal) => positionAtGlobalTile(
      travel.window.origin.x + view.terrain.width + 100 + ordinal * 10,
      travel.window.origin.y + view.terrain.height + 100,
    ));
    for (const [ordinal, member] of currentGoatActors.entries()) {
      offFrameCore = replaceCoreEcologyAggregatePatchActor(
        offFrameCore,
        repositionCoreWildlifeActor(member.actor, {
          atTick: offFrameCore.updatedAtTick,
          position: farPositions[ordinal]!,
          heading: member.actor.address.heading,
        }),
      );
    }
    offFrameCore = setCoreEcologyAggregatePatchMaterializedActors(offFrameCore, {
      atTick: offFrameCore.updatedAtTick,
      actorIds: [],
    });
    const offFrameGroup = offFrameCore.groups.groups.find(({ identity }) => (
      identity.stableId === group.identity.stableId
    ));
    if (offFrameGroup === undefined || offFrameGroup.components.length !== 2) {
      throw new Error("recovery fixture lost its separated group topology off-frame");
    }
    const offFrameAnchoredGroup = reconcileCoreEcologyGroupAnchors(offFrameGroup, {
      atTick: offFrameCore.updatedAtTick,
      componentAnchors: offFrameGroup.components.map((component, ordinal) => ({
        componentId: component.componentId,
        anchor: farPositions[ordinal]!,
      })),
      rendezvousAnchor: farPositions[0]!,
    });
    if (offFrameAnchoredGroup === null) {
      throw new Error("recovery fixture could not retain its off-frame rendezvous");
    }
    const pressureCycleCadences = 8;
    const pressurePhase = Number.parseInt(hashCanonical([
      offFrameGroup.identity.stableId,
      "player-absent-population-pressure",
    ]).slice(0, 8), 16) % pressureCycleCadences;
    const nextCoarseTick = Array.from(
      { length: CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS },
      (_, index) => offFrameCore.updatedAtTick + index + 1,
    ).find((tick) => (
      Math.trunc(tick / CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS)
        % pressureCycleCadences !== pressurePhase
    ));
    if (nextCoarseTick === undefined) {
      throw new Error("recovery fixture could not find an undisturbed coarse cadence");
    }
    const primedCore = canonicalizeCoreEcologyAggregatePatch({
      ...offFrameCore,
      groups: createCoreEcologyGroupSet(offFrameCore.groups.groups.map((candidate) => (
        candidate.identity.stableId === offFrameGroup.identity.stableId
          ? {
              ...offFrameAnchoredGroup,
              updatedAtTick: offFrameCore.updatedAtTick,
              nextCoarseTick,
              phase: "rejoining" as const,
              cohesion: CORE_ECOLOGY_GROUP_REJOIN_COMPLETE_COHESION
                - CORE_ECOLOGY_GROUP_COHESION_RECOVERY,
            }
          : candidate
      ))),
    });
    if (primedCore === null) {
      throw new Error("recovery fixture could not prime a valid off-frame reunion cadence");
    }
    offFrameCore = primedCore;
    const coarseRepository = new MemoryRepository(
      withCurrentSettlementHomeCore(searchingRecord, offFrameCore),
    );
    const coarseRuntime = await createTideweftRuntime(coarseRepository);
    let coarseEnvelope = savedEnvelope(coarseRepository);
    let coarseRecovery = deserializeSettlementDomesticAnimalRecoveryState(
      coarseEnvelope.settlementDomesticAnimalRecovery,
    );
    let coarseGroup = requireCurrentCoreEcology(coarseEnvelope).groups.groups.find(
      ({ identity }) => identity.stableId === group.identity.stableId,
    );
    for (let elapsedTick = offFrameCore.updatedAtTick; elapsedTick <= nextCoarseTick; elapsedTick += 1) {
      if (
        coarseGroup?.phase === "cohesive"
        && coarseRecovery?.currentCase?.phase === "awaiting-confirmation"
      ) break;
      advancePlayerSteps(coarseRuntime, 10);
      expect(coarseRuntime.getUIView().saveWarning).toBeUndefined();
      await coarseRuntime.save();
      coarseEnvelope = savedEnvelope(coarseRepository);
      coarseRecovery = deserializeSettlementDomesticAnimalRecoveryState(
        coarseEnvelope.settlementDomesticAnimalRecovery,
      );
      coarseGroup = requireCurrentCoreEcology(coarseEnvelope).groups.groups.find(
        ({ identity }) => identity.stableId === group.identity.stableId,
      );
    }
    expect({
      groupPhase: coarseGroup?.phase,
      groupTick: coarseGroup?.updatedAtTick,
      recoveryPhase: coarseRecovery?.currentCase?.phase,
    }).toMatchObject({
      groupPhase: "cohesive",
      groupTick: nextCoarseTick,
      recoveryPhase: "awaiting-confirmation",
    });
    expect(coarseRecovery?.currentCase).toMatchObject({
      caseId: searchingCase?.caseId,
      phase: "awaiting-confirmation",
      reunionEvent: { atTick: nextCoarseTick, kind: "group-rejoined" },
    });
    coarseRuntime.destroy();

    const replayedCoarse = await createTideweftRuntime(coarseRepository);
    expect(replayedCoarse.getUIView().saveWarning).toBeUndefined();
    await replayedCoarse.save();
    const replayedEnvelope = savedEnvelope(coarseRepository);
    expect(replayedEnvelope.settlementDomesticAnimalRecovery)
      .toBe(coarseEnvelope.settlementDomesticAnimalRecovery);
    replayedCoarse.destroy();

    let homeCore = requireCurrentCoreEcology(replayedEnvelope);
    const materializedIds = homeCore.populations.flatMap(({ members }) => members)
      .filter(({ materialization }) => materialization === "materialized")
      .map(({ actor }) => actor.identity.stableId);
    homeCore = setCoreEcologyAggregatePatchMaterializedActors(homeCore, {
      atTick: homeCore.updatedAtTick,
      actorIds: [...materializedIds, ...custody.memberActorIds].sort(),
    });
    const homeGoatActors = homeCore.populations
      .find(({ species, populationKey }) => (
        species === group.identity.species
        && populationKey === group.identity.populationKey
      ))?.members.filter(({ populationOrdinal }) => group.memberOrdinals.includes(
        populationOrdinal,
      ));
    if (homeGoatActors === undefined || homeGoatActors.length !== goats.length) {
      throw new Error("recovery fixture lost its rematerialized goat bodies");
    }
    for (const member of homeGoatActors) {
      homeCore = replaceCoreEcologyAggregatePatchActor(
        homeCore,
        repositionCoreWildlifeActor(member.actor, {
          atTick: homeCore.updatedAtTick,
          position: custody.homeStructure.position,
          heading: member.actor.address.heading,
        }),
      );
    }
    const reunionRepository = new MemoryRepository(withCurrentSettlementHomeCore(
      coarseRepository.snapshot(),
      homeCore,
    ));
    const reunited = await createTideweftRuntime(reunionRepository);
    advancePlayerSteps(reunited, 20);
    expect(reunited.getUIView().saveWarning).toBeUndefined();
    await reunited.save();
    const closedEnvelope = savedEnvelope(reunionRepository);
    const closedRecovery = deserializeSettlementDomesticAnimalRecoveryState(
      closedEnvelope.settlementDomesticAnimalRecovery,
    );
    const closedCore = requireCurrentCoreEcology(closedEnvelope);
    expect(closedRecovery?.currentCase).toBeNull();
    expect(closedRecovery?.latestClosedOutcome).toMatchObject({
      caseId: searchingCase?.caseId,
      outcome: "recovered",
    });
    expect(closedCore.groups.groups.find(({ identity }) => (
      identity.stableId === group.identity.stableId
    ))?.phase).toBe("cohesive");
    reunited.destroy();
  });

  it("projects and secures one directly witnessed physical store through the keeper action", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "one visible storehouse door",
      posture: "gale",
      sessionShape: "wander",
    });
    expect(runtime.getUIView().controls?.interactLabel).toBe("Warn the store keeper");
    const openStore = runtime.getRenderView().settlements.find(({ foodStore }) => (
      foodStore?.closure === "open"
    ))?.foodStore;
    expect(openStore).toBeDefined();

    runtime.dispatchUI({ type: "interact" });
    expect(runtime.getUIView().announcement?.message).toContain("storehouse door is barred");
    expect(runtime.getUIView().controls?.interactLabel).not.toBe("Warn the store keeper");
    expect(runtime.getRenderView().settlements.find(({ foodStore }) => (
      foodStore?.id === openStore?.id
    ))?.foodStore?.closure).toBe("secured");

    const offer = runtime.getUIView().contracts.find(({ actionLabel }) => (
      actionLabel === "Pick up cargo here"
    ));
    if (offer === undefined) throw new Error("store fixture did not begin beside a Promise");
    runtime.dispatchUI({ type: "contract", action: "accept", contractId: offer.id });
    advancePlayerSteps(runtime, 10);

    await runtime.save();
    const record = repository.snapshot();
    const envelope = JSON.parse(record.worldJson) as Record<string, unknown>;
    expect(record.payloadVersion).toBe(26);
    expect(envelope.version).toBe(26);
    expect(Object.keys(envelope).sort()).toEqual([
      "bio0Ecology",
      "dogActorRoster",
      "fieldResources",
      "format",
      "integrity",
      "livingActorPlayerChoice",
      "perceptionCarry",
      "physicalCargo",
      "player",
      "porterResponse",
      "promiseJourney",
      "regionalEcology",
      "regionalTravel",
      "session",
      "settlementDomesticAnimalRecovery",
      "settlementEcology",
      "settlementWorkingAnimals",
      "traversalFeedback",
      "version",
      "world",
    ]);
    const state = deserializeSettlementEcologyState(envelope.settlementEcology);
    const core = requireCurrentCoreEcology(envelope);
    if (core.derivation.kind !== "settlement-home-v1") {
      throw new Error("current save omitted its v25 settlement-home owner");
    }
    expect(core.derivation.habitat.generationVersion)
      .toBe(CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_VERSION);
    expect(state.version).toBe(4);
    expect((envelope.player as { activeContractId: number | null }).activeContractId).not.toBeNull();
    expect(state).toMatchObject({
      closure: "secured",
      identity: {
        storeId: openStore?.id,
        keeperActorId: expect.any(String),
      },
      carrier: {
        owner: { kind: "settlement", id: state.identity.settlementId },
      },
    });
    expect(state.keeperKnowledge).toHaveLength(1);
    expect(state.keeperKnowledge[0]?.source).toBe("player-report");
    expect(state.carrier.lots).toHaveLength(1);
    expect(state.carrier.lots[0]?.payload).toMatchObject({
      kind: "provision",
      provision: "fresh-produce",
      quantity: 8,
    });
    runtime.destroy();

    const reloaded = await createTideweftRuntime(repository);
    expect(reloaded.getRenderView().settlements.find(({ foodStore }) => (
      foodStore?.id === openStore?.id
    ))?.foodStore?.closure).toBe("secured");
    expect(reloaded.getUIView().controls?.interactLabel).not.toBe("Warn the store keeper");
    reloaded.destroy();
  });

  it("migrates an exact v15 envelope once without allowing the future root into v15", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "storehouse v15 migration",
      posture: "gale",
      sessionShape: "wander",
    });
    await source.save();
    source.destroy();

    const currentRecord = sourceRepository.snapshot();
    const storehouseRecord = asStorehouseV16Record(currentRecord);
    const storehouse = JSON.parse(storehouseRecord.worldJson) as Record<string, unknown>;
    const controlRepository = new MemoryRepository(storehouseRecord);
    const control = await createTideweftRuntime(controlRepository);
    await control.save();
    control.destroy();
    const controlEnvelope = JSON.parse(
      controlRepository.snapshot().worldJson,
    ) as Record<string, unknown>;
    const {
      integrity: _currentIntegrity,
      settlementEcology: _futureRoot,
      ...v15Fields
    } = storehouse;
    const v15Base = { ...v15Fields, version: 15 };
    const v15Record: SaveRecord = {
      ...storehouseRecord,
      payloadVersion: 15,
      worldJson: JSON.stringify({
        ...v15Base,
        integrity: gameSaveEnvelopeIntegrity(v15Base),
      }),
    };

    const migratedRepository = new MemoryRepository(v15Record);
    const migrated = await createTideweftRuntime(migratedRepository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const migratedRecord = migratedRepository.snapshot();
    const migratedEnvelope = JSON.parse(migratedRecord.worldJson) as Record<string, unknown>;
    expect(migratedRecord.payloadVersion).toBe(26);
    expect(migratedEnvelope.version).toBe(26);
    expect(migratedEnvelope.settlementEcology).toBe(controlEnvelope.settlementEcology);
    for (const field of [
      "world",
      "player",
      "fieldResources",
      "traversalFeedback",
      "physicalCargo",
      "regionalTravel",
      "promiseJourney",
      "perceptionCarry",
      "bio0Ecology",
      "porterResponse",
      "livingActorPlayerChoice",
    ]) {
      expect(migratedEnvelope[field], field).toEqual(controlEnvelope[field]);
    }
    expect(requireCurrentCoreEcology(migratedEnvelope))
      .toEqual(requireCurrentCoreEcology(controlEnvelope));
    expect(requireAuthenticatedLegacyCore(migratedEnvelope))
      .toEqual(requireAuthenticatedLegacyCore(controlEnvelope));
    migrated.destroy();

    const illegalV15Base = { ...storehouse, version: 15 };
    const illegalRepository = new MemoryRepository({
      ...storehouseRecord,
      payloadVersion: 15,
      worldJson: JSON.stringify({
        ...illegalV15Base,
        integrity: gameSaveEnvelopeIntegrity(illegalV15Base),
      }),
    });
    const quarantined = await createTideweftRuntime(illegalRepository);
    expect(quarantined.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    quarantined.destroy();
  });

  it("migrates an exact v16 store and appends authenticated domestic relationships once", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "domestic custody v16 migration",
      posture: "gale",
      sessionShape: "wander",
    });
    expect(source.getUIView().controls?.interactLabel).toBe("Warn the store keeper");
    source.dispatchUI({ type: "interact" });
    await source.save();
    source.destroy();

    const v16Record = asStorehouseV16Record(sourceRepository.snapshot());
    const v16Envelope = JSON.parse(v16Record.worldJson) as Record<string, unknown>;
    if (typeof v16Envelope.settlementEcology !== "string") {
      throw new Error("v16 fixture omitted its storehouse state");
    }
    const priorStore = JSON.parse(v16Envelope.settlementEcology) as Record<string, unknown>;
    const priorCore = requireLegacyCoreEcology(v16Envelope.coreEcology);
    expect(v16Record.payloadVersion).toBe(16);
    expect(v16Envelope.version).toBe(16);
    expect(priorStore.version).toBe(1);
    expect(Object.hasOwn(priorStore, "domesticCustody")).toBe(false);
    expect(priorCore.populations.some(({ species }) => species === "domestic-chicken"))
      .toBe(false);
    expect(priorCore.groups.groups.some(({ identity }) => (
      identity.species === "domestic-chicken"
    ))).toBe(false);
    expect(priorCore.populations.some(({ species }) => species === "domestic-goat"))
      .toBe(false);
    expect(priorCore.groups.groups.some(({ identity }) => (
      identity.species === "domestic-goat"
    ))).toBe(false);

    const migratedRepository = new MemoryRepository(v16Record);
    const migrated = await createTideweftRuntime(migratedRepository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const migratedRecord = migratedRepository.snapshot();
    const migratedEnvelope = JSON.parse(migratedRecord.worldJson) as Record<string, unknown>;
    const migratedStore = deserializeSettlementEcologyState(
      migratedEnvelope.settlementEcology,
    );
    const migratedStoreRecord = migratedStore as unknown as Record<string, unknown>;
    const migratedCore = requireCurrentCoreEcology(migratedEnvelope);
    const migratedLegacy = requireAuthenticatedLegacyCore(migratedEnvelope);
    expect(migratedRecord.payloadVersion).toBe(26);
    expect(migratedEnvelope.version).toBe(26);
    expect(migratedStore.version).toBe(4);
    for (const field of PRIOR_SETTLEMENT_ECOLOGY_FIELDS) {
      expect(migratedStoreRecord[field], field).toEqual(priorStore[field]);
    }
    expect(migratedStore.revision).toBe((priorStore.revision as number) + 3);
    expect(migratedStore.identity).toEqual(priorStore.identity);
    expect(migratedStore.carrier).toEqual(priorStore.carrier);
    expect(migratedStore.closure).toBe("secured");
    expect(migratedStore.keeperKnowledge).toHaveLength(1);

    if (
      migratedCore.derivation.kind !== "settlement-home-v1"
      || (
        migratedLegacy.derivation.kind !== "habitat-v11"
        && migratedLegacy.derivation.kind !== "legacy-fixed-v1-with-habitat-v11"
      )
    ) throw new Error("v16 migration omitted its split v25 ecology authority");
    expectDomesticRepresentatives(migratedCore, migratedStore, [
      {
        species: "domestic-chicken",
        organization: "flock",
        custodyOrdinal: 0,
        structureKind: "coop",
        position: migratedCore.derivation.habitat.domesticAnchor.position,
        radiusUnits:
          migratedCore.derivation.habitat.domesticAnchor.radiusTiles
            * WORLD_POSITION_UNITS_PER_TILE,
      },
      {
        species: "domestic-goat",
        organization: "herd",
        custodyOrdinal: 1,
        structureKind: "pen",
        position: migratedCore.derivation.habitat.domesticPenAnchor.position,
        radiusUnits:
          migratedCore.derivation.habitat.domesticPenAnchor.radiusTiles
            * WORLD_POSITION_UNITS_PER_TILE,
      },
    ]);
    expect(migratedLegacy.populations.filter(({ species }) => (
      species !== "domestic-chicken"
      && species !== "domestic-goat"
      && species !== "wild-boar"
      && species !== "elk"
      && species !== "gray-wolf"
      && species !== "cougar"
      && species !== "brown-bear"
    ))).toEqual(priorCore.populations);
    expect(migratedLegacy.groups.groups.filter(({ identity }) => (
      identity.species !== "domestic-chicken"
      && identity.species !== "domestic-goat"
      && identity.species !== "wild-boar"
      && identity.species !== "elk"
      && identity.species !== "gray-wolf"
    ))).toEqual(priorCore.groups.groups);
    expect(migratedLegacy.aggregatePopulations).toEqual(priorCore.aggregatePopulations);
    if (
      priorCore.derivation.kind !== "habitat-v7"
      && priorCore.derivation.kind !== "legacy-fixed-v1-with-habitat-v7"
    ) throw new Error("v16 fixture lost its tidal-web derivation");
    expect(migratedLegacy.derivation.habitat.populations.slice(
      0,
      priorCore.derivation.habitat.populations.length,
    )).toEqual(priorCore.derivation.habitat.populations);
    expect(migratedLegacy.derivation.habitat.tidalAnchors)
      .toEqual(priorCore.derivation.habitat.tidalAnchors);
    for (const field of [
      "world",
      "player",
      "fieldResources",
      "traversalFeedback",
      "physicalCargo",
      "regionalTravel",
      "promiseJourney",
      "perceptionCarry",
      "bio0Ecology",
      "porterResponse",
      "livingActorPlayerChoice",
    ]) {
      expect(migratedEnvelope[field], field).toEqual(v16Envelope[field]);
    }

    const committedRegional = migratedEnvelope.regionalEcology;
    const committedStore = migratedEnvelope.settlementEcology;
    migrated.destroy();
    const reloaded = await createTideweftRuntime(migratedRepository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    await reloaded.save();
    const replayEnvelope = savedEnvelope(migratedRepository);
    expect(replayEnvelope.regionalEcology).toBe(committedRegional);
    expect(replayEnvelope.settlementEcology).toBe(committedStore);
    const replayCore = requireCurrentCoreEcology(replayEnvelope);
    const replayLegacy = requireAuthenticatedLegacyCore(replayEnvelope);
    const replayStore = deserializeSettlementEcologyState(replayEnvelope.settlementEcology);
    expect(replayCore).toEqual(migratedCore);
    expect(replayLegacy).toEqual(migratedLegacy);
    expect(replayStore).toEqual(migratedStore);
    reloaded.destroy();
  });

  it("migrates v17 without rewriting chicken actors, flock, or custody identity", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "domestic yard v17 plural custody migration",
      posture: "gale",
      sessionShape: "wander",
    });
    await source.save();
    source.destroy();

    const v17Record = asDomesticYardV17Record(sourceRepository.snapshot());
    const v17Envelope = JSON.parse(v17Record.worldJson) as Record<string, unknown>;
    if (typeof v17Envelope.settlementEcology !== "string") {
      throw new Error("v17 fixture omitted its settlement ecology state");
    }
    const priorStore = JSON.parse(v17Envelope.settlementEcology) as Record<string, unknown>;
    const priorCustody = priorStore.domesticCustody as Record<string, unknown> | undefined;
    const priorCore = requireLegacyCoreEcology(v17Envelope.coreEcology);
    const priorChickenPopulation = priorCore.populations.find(({ species }) => (
      species === "domestic-chicken"
    ));
    const priorChickenGroup = priorCore.groups.groups.find(({ identity }) => (
      identity.species === "domestic-chicken"
    ));
    if (
      priorCustody === undefined
      || priorChickenPopulation === undefined
      || priorChickenGroup === undefined
      || (
        priorCore.derivation.kind !== "habitat-v8"
        && priorCore.derivation.kind !== "legacy-fixed-v1-with-habitat-v8"
      )
    ) throw new Error("v17 fixture omitted its frozen Alpha-24 authority");
    expect(v17Record.payloadVersion).toBe(17);
    expect(v17Envelope.version).toBe(17);
    expect(priorStore.version).toBe(2);
    expect(priorCustody.version).toBe(1);
    expect(priorCore.populations.some(({ species }) => species === "domestic-goat"))
      .toBe(false);
    expect(priorCore.groups.groups.some(({ identity }) => (
      identity.species === "domestic-goat"
    ))).toBe(false);

    const migratedRepository = new MemoryRepository(v17Record);
    const migrated = await createTideweftRuntime(migratedRepository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const migratedRecord = migratedRepository.snapshot();
    const migratedEnvelope = savedEnvelope(migratedRepository);
    const migratedStore = deserializeSettlementEcologyState(
      migratedEnvelope.settlementEcology,
    );
    const migratedCore = requireCurrentCoreEcology(migratedEnvelope);
    const migratedLegacy = requireAuthenticatedLegacyCore(migratedEnvelope);
    if (
      migratedCore.derivation.kind !== "settlement-home-v1"
      || (
        migratedLegacy.derivation.kind !== "habitat-v11"
        && migratedLegacy.derivation.kind !== "legacy-fixed-v1-with-habitat-v11"
      )
    ) throw new Error("v17 migration omitted its split v25 ecology authority");
    expect(migratedRecord.payloadVersion).toBe(26);
    expect(migratedEnvelope.version).toBe(26);
    expect(migratedStore.version).toBe(4);
    expect(migratedStore.revision).toBe((priorStore.revision as number) + 2);
    expect(migratedStore.identity).toEqual(priorStore.identity);
    expect(migratedStore.carrier).toEqual(priorStore.carrier);

    const priorPopulationKeys = new Set(priorCore.populations.map(({ populationKey }) => (
      populationKey
    )));
    const expectedAddedPopulations = migratedLegacy.derivation.habitat.populations.filter(
      ({ populationKey, populationUnits, representation }) => (
        !priorPopulationKeys.has(populationKey)
        && populationUnits > 0
        && representation === "individual-representatives"
      ),
    );
    expect(migratedLegacy.populations).toHaveLength(
      priorCore.populations.length + expectedAddedPopulations.length,
    );
    expect(migratedLegacy.groups.groups).toHaveLength(priorCore.groups.groups.length + 4);
    expect(migratedLegacy.populations.filter(({ species }) => (
      species !== "domestic-goat"
      && species !== "wild-boar"
      && species !== "elk"
      && species !== "gray-wolf"
      && species !== "cougar"
      && species !== "brown-bear"
    ))).toEqual(priorCore.populations);
    expect(migratedLegacy.groups.groups.filter(({ identity }) => (
      identity.species !== "domestic-goat"
      && identity.species !== "wild-boar"
      && identity.species !== "elk"
      && identity.species !== "gray-wolf"
    ))).toEqual(priorCore.groups.groups);
    expect(migratedLegacy.aggregatePopulations).toEqual(priorCore.aggregatePopulations);
    expect(migratedLegacy.derivation.habitat.populations.slice(
      0,
      priorCore.derivation.habitat.populations.length,
    )).toEqual(priorCore.derivation.habitat.populations);
    expect(migratedLegacy.derivation.habitat.tidalAnchors)
      .toEqual(priorCore.derivation.habitat.tidalAnchors);
    expect(migratedLegacy.derivation.habitat.domesticAnchor)
      .toEqual(priorCore.derivation.habitat.domesticAnchor);

    const migratedChickenPopulation = migratedCore.populations.find(({ species }) => (
      species === "domestic-chicken"
    ));
    const migratedLegacyChickenPopulation = migratedLegacy.populations.find(({ species }) => (
      species === "domestic-chicken"
    ));
    const migratedChickenGroup = migratedCore.groups.groups.find(({ identity }) => (
      identity.species === "domestic-chicken"
    ));
    const migratedLegacyChickenGroup = migratedLegacy.groups.groups.find(({ identity }) => (
      identity.species === "domestic-chicken"
    ));
    const migratedChickenCustody = migratedStore.domesticCustodies.find(({ species }) => (
      species === "domestic-chicken"
    ));
    if (
      migratedChickenPopulation === undefined
      || migratedLegacyChickenPopulation === undefined
      || migratedChickenGroup === undefined
      || migratedLegacyChickenGroup === undefined
      || migratedChickenCustody === undefined
    ) throw new Error("v17 migration rewrote its chicken authority");
    expectSettlementHomePreservesDomesticSource(migratedLegacy, migratedCore);
    expect(JSON.stringify(migratedLegacyChickenPopulation))
      .toBe(JSON.stringify(priorChickenPopulation));
    expect(JSON.stringify(migratedLegacyChickenGroup)).toBe(JSON.stringify(priorChickenGroup));
    expect(migratedChickenCustody.relationshipId).toBe(priorCustody.relationshipId);
    expect(migratedChickenCustody.homeId).toBe(priorCustody.homeId);
    expect(migratedChickenCustody.homeStructure.structureId).toBe(priorCustody.coopId);
    expect(migratedChickenCustody.memberActorIds).toEqual(priorCustody.memberActorIds);
    expect(migratedChickenCustody.memberGroupId).toBe(priorCustody.memberGroupId);

    expectDomesticRepresentatives(migratedCore, migratedStore, [
      {
        species: "domestic-chicken",
        organization: "flock",
        custodyOrdinal: 0,
        structureKind: "coop",
        position: migratedCore.derivation.habitat.domesticAnchor.position,
        radiusUnits:
          migratedCore.derivation.habitat.domesticAnchor.radiusTiles
            * WORLD_POSITION_UNITS_PER_TILE,
      },
      {
        species: "domestic-goat",
        organization: "herd",
        custodyOrdinal: 1,
        structureKind: "pen",
        position: migratedCore.derivation.habitat.domesticPenAnchor.position,
        radiusUnits:
          migratedCore.derivation.habitat.domesticPenAnchor.radiusTiles
            * WORLD_POSITION_UNITS_PER_TILE,
      },
    ]);

    const committedRegional = migratedEnvelope.regionalEcology;
    const committedStore = migratedEnvelope.settlementEcology;
    migrated.destroy();
    const reloaded = await createTideweftRuntime(migratedRepository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    await reloaded.save();
    const replayEnvelope = savedEnvelope(migratedRepository);
    expect(replayEnvelope.regionalEcology).toBe(committedRegional);
    expect(replayEnvelope.settlementEcology).toBe(committedStore);
    reloaded.destroy();
  });

  it("migrates one v18 livestock pen into a conserved guardian body, custody, and work assignment", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "guardian relationship v18 migration",
      posture: "gale",
      sessionShape: "wander",
    });
    await source.save();
    source.destroy();

    const currentRecord = sourceRepository.snapshot();
    const currentEnvelope = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
    const v18Record = asDomesticPenV18Record(currentRecord);
    const v18Envelope = JSON.parse(v18Record.worldJson) as Record<string, unknown>;
    const priorSettlement = JSON.parse(String(v18Envelope.settlementEcology)) as Record<
      string,
      unknown
    >;
    expect(v18Record.payloadVersion).toBe(18);
    expect(v18Envelope.version).toBe(18);
    expect(Object.hasOwn(v18Envelope, "dogActorRoster")).toBe(false);
    expect(Object.hasOwn(v18Envelope, "settlementWorkingAnimals")).toBe(false);
    expect(priorSettlement.version).toBe(3);
    expect((priorSettlement.domesticCustodies as unknown[])).toHaveLength(2);

    const migratedRepository = new MemoryRepository(v18Record);
    const migrated = await createTideweftRuntime(migratedRepository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const migratedRecord = migratedRepository.snapshot();
    const migratedEnvelope = savedEnvelope(migratedRepository);
    const roster = deserializeDogActorRoster(migratedEnvelope.dogActorRoster);
    const work = deserializeSettlementWorkingAnimalState(
      migratedEnvelope.settlementWorkingAnimals,
    );
    const settlement = deserializeSettlementEcologyState(
      migratedEnvelope.settlementEcology,
    );
    const bio0 = deserializeBio0Ecology(migratedEnvelope.bio0Ecology);
    if (roster === null || work === null || bio0 === null) {
      throw new Error("v18 migration omitted a canonical guardian authority");
    }
    expect(migratedRecord.payloadVersion).toBe(26);
    expect(migratedEnvelope.version).toBe(26);
    expect(roster.actors).toHaveLength(1);
    expect(work.assignments).toHaveLength(1);
    expect(settlement.version).toBe(4);
    expect(settlement.domesticCustodies).toHaveLength(3);

    const guardian = roster.actors[0]!;
    const guardianCustody = settlement.domesticCustodies.find(({ species }) => (
      species === "domestic-dog"
    ));
    const goatCustody = settlement.domesticCustodies.find(({ species }) => (
      species === "domestic-goat"
    ));
    const assignment = work.assignments[0]!;
    expect(guardian.identity.stableId).not.toBe(bio0.dog.identity.stableId);
    expect(guardianCustody).toMatchObject({
      custodyOrdinal: 2,
      owner: { kind: "settlement", id: settlement.identity.settlementId },
      caretakerActorId: settlement.identity.keeperActorId,
      memberActorIds: [guardian.identity.stableId],
      memberGroupId: null,
      homeStructure: { kind: "kennel" },
    });
    expect(assignment).toMatchObject({
      workerActorId: guardian.identity.stableId,
      workerSpecies: "domestic-dog",
      handlerActorId: settlement.identity.keeperActorId,
      workerCustodyRelationshipId: guardianCustody?.relationshipId,
      protectedCustodyRelationshipId: goatCustody?.relationshipId,
      protectedGroupId: goatCustody?.memberGroupId,
      role: "guardian",
      worksiteId: goatCustody?.homeStructure.structureId,
      currentActivity: { activity: "watch", perceivedArea: null },
    });
    expect(migratedEnvelope.dogActorRoster).toBe(currentEnvelope.dogActorRoster);
    expect(migratedEnvelope.settlementWorkingAnimals)
      .toBe(currentEnvelope.settlementWorkingAnimals);
    const migratedLegacy = requireAuthenticatedLegacyCore(migratedEnvelope);
    expect(migratedLegacy.derivation.kind).toBe("habitat-v11");
    expectSettlementHomePreservesDomesticSource(
      migratedLegacy,
      requireCurrentCoreEcology(migratedEnvelope),
    );
    for (const field of [
      "world",
      "player",
      "fieldResources",
      "traversalFeedback",
      "physicalCargo",
      "regionalTravel",
      "promiseJourney",
      "perceptionCarry",
      "bio0Ecology",
      "porterResponse",
      "livingActorPlayerChoice",
    ]) {
      expect(migratedEnvelope[field], field).toEqual(v18Envelope[field]);
    }

    const committedRoster = migratedEnvelope.dogActorRoster;
    const committedWork = migratedEnvelope.settlementWorkingAnimals;
    migrated.destroy();
    const reloaded = await createTideweftRuntime(migratedRepository);
    await reloaded.save();
    const replay = savedEnvelope(migratedRepository);
    expect(replay.dogActorRoster).toBe(committedRoster);
    expect(replay.settlementWorkingAnimals).toBe(committedWork);
    expect(deserializeDogActorRoster(replay.dogActorRoster)?.actors).toHaveLength(1);
    reloaded.destroy();
  });

  it("adopts the sealed v19 work relationship into one empty persisted task lifecycle", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "keeper signal v19 migration",
      posture: "gale",
      sessionShape: "wander",
    });
    await source.save();
    source.destroy();

    const currentRecord = sourceRepository.snapshot();
    const currentEnvelope = savedEnvelope(sourceRepository);
    const currentWork = deserializeSettlementWorkingAnimalState(
      currentEnvelope.settlementWorkingAnimals,
    );
    if (currentWork === null) throw new Error("current fixture omitted its work root");
    const v19Record = asPaddockWatchV19Record(currentRecord);
    const v19Envelope = JSON.parse(v19Record.worldJson) as Record<string, unknown>;
    const priorWork = JSON.parse(String(v19Envelope.settlementWorkingAnimals)) as {
      assignments: Array<Record<string, unknown>>;
    };
    expect(v19Record.payloadVersion).toBe(19);
    expect(v19Envelope.version).toBe(19);
    expect(priorWork.assignments[0]).not.toHaveProperty("currentTask");
    expect(priorWork.assignments[0]?.assignmentId)
      .toBe(currentWork.assignments[0]?.assignmentId);
    expect(priorWork.assignments[0]?.currentActivity)
      .toEqual(currentWork.assignments[0]?.currentActivity);

    const migratedRepository = new MemoryRepository(v19Record);
    const migrated = await createTideweftRuntime(migratedRepository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const migratedRecord = migratedRepository.snapshot();
    const migratedEnvelope = savedEnvelope(migratedRepository);
    const migratedWork = deserializeSettlementWorkingAnimalState(
      migratedEnvelope.settlementWorkingAnimals,
    );
    if (migratedWork === null) throw new Error("v19 migration omitted its adopted work root");
    expect(migratedRecord.payloadVersion).toBe(26);
    expect(migratedEnvelope.version).toBe(26);
    expect(migratedWork.assignments[0]).toMatchObject({
      assignmentId: currentWork.assignments[0]?.assignmentId,
      currentActivity: currentWork.assignments[0]?.currentActivity,
      lastTaskOrdinal: 0,
      lastResolvedTaskTransitionOrdinal: 0,
      currentTask: null,
      lastTaskOutcome: null,
      pendingTaskTransition: null,
    });

    const committedWork = migratedEnvelope.settlementWorkingAnimals;
    migrated.destroy();
    const reloaded = await createTideweftRuntime(migratedRepository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    await reloaded.save();
    expect(savedEnvelope(migratedRepository).settlementWorkingAnimals).toBe(committedWork);
    reloaded.destroy();
  });

  it("rejects a resealed v19 envelope carrying the future v2 work root", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "working lifecycle version fence",
      posture: "gale",
      sessionShape: "wander",
    });
    await source.save();
    source.destroy();

    const currentRecord = sourceRepository.snapshot();
    const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
    const {
      integrity: _integrity,
      settlementDomesticAnimalRecovery: _settlementDomesticAnimalRecovery,
      ...currentFields
    } = current;
    const disguised = { ...currentFields, version: 19 };
    const repository = new MemoryRepository({
      ...currentRecord,
      payloadVersion: 19,
      worldJson: JSON.stringify({
        ...disguised,
        integrity: gameSaveEnvelopeIntegrity(disguised),
      }),
    });
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  });

  it("recovers a saved task transition before its later pending activity exactly once", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "dual pending work recovery",
      posture: "gale",
      sessionShape: "wander",
    });
    await source.save();
    const baselineEnvelope = savedEnvelope(sourceRepository);
    const initial = deserializeSettlementWorkingAnimalState(
      baselineEnvelope.settlementWorkingAnimals,
    );
    if (initial === null) throw new Error("dual-pending fixture omitted its work root");
    advancePlayerSteps(source, 20);
    await source.save();
    source.destroy();

    const sourceRecord = sourceRepository.snapshot();
    const assignment = initial.assignments[0];
    if (assignment === undefined) throw new Error("dual-pending fixture omitted its assignment");
    const alarm = createActorObservation({
      id: "OBS-dual-pending-alarm",
      observerId: assignment.workerActorId,
      observedAtTick: 1,
      channel: "hearing",
      perceivedClass: "animal-alarm",
      subjectId: null,
      area: assignment.dutyArea,
      confidence: 400_000,
      salience: 400_000,
      identification: "anonymous",
      interrupt: "none",
    });
    if (alarm === null) throw new Error("dual-pending alarm was malformed");
    const workerAtOne = stepActorPerception(
      createActorPerceptionState(assignment.workerActorId, 0),
      { tick: 1, observations: [alarm] },
    );
    const handlerAtOne = stepActorPerception(
      createActorPerceptionState(assignment.handlerActorId, 0),
      { tick: 1, observations: [] },
    );
    if (workerAtOne === null || handlerAtOne === null) {
      throw new Error("dual-pending cognition could not advance");
    }
    const investigation = stageSettlementWorkingAnimalActivity(initial, {
      assignmentId: assignment.assignmentId,
      tick: 1,
      perception: workerAtOne,
      welfare: {
        injuryPressure: 0,
        coldPressure: 0,
        heatPressure: 0,
        exhaustionPressure: 0,
        hungerPressure: 0,
        thirstPressure: 0,
      },
      accessibility: { watch: true, investigate: true, return: true },
      actorDisposition: { kind: "available" },
      workerInsideDutyArea: true,
    });
    if (investigation?.transaction === null || investigation === null) {
      throw new Error("dual-pending investigation was not staged");
    }
    const committedInvestigation = resolveSettlementWorkingAnimalActivity(
      investigation.state,
      investigation.transaction,
    );
    if (committedInvestigation === null) {
      throw new Error("dual-pending investigation was not committed");
    }
    const pendingTask = stageSettlementWorkingAnimalTaskLifecycle(
      committedInvestigation.state,
      {
        assignmentId: assignment.assignmentId,
        tick: 1,
        workerPosition: assignment.dutyArea.center,
        handlerPosition: assignment.dutyArea.center,
        workerPerception: workerAtOne,
        handlerPerception: handlerAtOne,
        welfare: {
          injuryPressure: 0,
          coldPressure: 0,
          heatPressure: 0,
          exhaustionPressure: 0,
          hungerPressure: 0,
          thirstPressure: 0,
        },
        actorDisposition: { kind: "available" },
        handlerDisposition: { kind: "continue" },
      },
    );
    if (pendingTask?.transaction === null || pendingTask === null) {
      throw new Error("dual-pending task was not staged");
    }
    const workerAtTwo = stepActorPerception(workerAtOne, { tick: 2, observations: [] });
    if (workerAtTwo === null) throw new Error("dual-pending worker cognition did not age");
    const pendingActivity = stageSettlementWorkingAnimalActivity(pendingTask.state, {
      assignmentId: assignment.assignmentId,
      tick: 2,
      perception: workerAtTwo,
      welfare: {
        injuryPressure: 0,
        coldPressure: 0,
        heatPressure: 0,
        exhaustionPressure: 0,
        hungerPressure: 0,
        thirstPressure: 0,
      },
      accessibility: { watch: true, investigate: true, return: true },
      actorDisposition: {
        kind: "defer-to-actor",
        referenceId: "actor-intent:retreat",
      },
      workerInsideDutyArea: true,
    });
    if (pendingActivity?.transaction === null || pendingActivity === null) {
      throw new Error("dual-pending later activity was not staged");
    }
    expect(pendingActivity.state.assignments[0]).toMatchObject({
      currentTask: null,
      pendingTaskTransition: { transition: "open" },
      pendingActivity: { activity: "defer-to-actor" },
    });

    const interrupted = withCurrentEnvelopeFields(sourceRecord, {
      settlementWorkingAnimals: serializeSettlementWorkingAnimalState(pendingActivity.state),
    });
    const repository = new MemoryRepository(interrupted);
    const recovered = await createTideweftRuntime(repository);
    expect(recovered.getUIView().saveWarning).toBeUndefined();
    await recovered.save();
    const recoveredEnvelope = savedEnvelope(repository);
    const recoveredWork = deserializeSettlementWorkingAnimalState(
      recoveredEnvelope.settlementWorkingAnimals,
    );
    expect(recoveredWork?.assignments[0]).toMatchObject({
      currentActivity: { ordinal: 2, activity: "defer-to-actor" },
      pendingActivity: null,
      lastTaskOrdinal: 1,
      lastResolvedTaskTransitionOrdinal: 1,
      currentTask: { taskOrdinal: 1, phase: "investigating" },
      pendingTaskTransition: null,
    });
    const recoveredBytes = recoveredEnvelope.settlementWorkingAnimals;
    recovered.destroy();

    const replayed = await createTideweftRuntime(repository);
    expect(replayed.getUIView().saveWarning).toBeUndefined();
    await replayed.save();
    expect(savedEnvelope(repository).settlementWorkingAnimals).toBe(recoveredBytes);
    replayed.destroy();
  });

  it("rolls both working-animal roots back after a later ecology rejection", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "working roots late rollback",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();
    const before = savedEnvelope(repository);
    const roster = deserializeDogActorRoster(before.dogActorRoster);
    const work = deserializeSettlementWorkingAnimalState(before.settlementWorkingAnimals);
    const guardian = roster?.actors[0];
    const assignment = work?.assignments[0];
    if (guardian === undefined || assignment === undefined) {
      throw new Error("late-rollback fixture omitted its guardian relationship");
    }
    guardianPerceptionHarness.observerId = guardian.identity.stableId;
    guardianPerceptionHarness.handlerId = assignment.handlerActorId;
    guardianPerceptionHarness.mode = "reachable";
    settlementShadowsHarness.rejectAfterWorkingDog = true;
    advancePlayerSteps(runtime, 10);
    expect(guardianPerceptionHarness.observationId).not.toBeNull();
    expect(runtime.getUIView().saveWarning).toMatchObject({
      message: "SIMULATION PAUSED SAFELY",
    });
    await runtime.save();
    const after = savedEnvelope(repository);
    expect(after.dogActorRoster).toBe(before.dogActorRoster);
    expect(after.settlementWorkingAnimals).toBe(before.settlementWorkingAnimals);
    expect(deserializeWorld(String(after.world)).meta.completedTick).toBe(0);
    runtime.destroy();
  });

  it("carries one guardian through shared perception, work, locomotion, recovery, and a regional seam without duplication", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "guardian water route 3",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();
    const initialEnvelope = savedEnvelope(repository);
    const initialRoster = deserializeDogActorRoster(initialEnvelope.dogActorRoster);
    const initialWork = deserializeSettlementWorkingAnimalState(
      initialEnvelope.settlementWorkingAnimals,
    );
    const initialSettlement = deserializeSettlementEcologyState(
      initialEnvelope.settlementEcology,
    );
    const initialBio0 = deserializeBio0Ecology(initialEnvelope.bio0Ecology);
    if (initialRoster === null || initialWork === null || initialBio0 === null) {
      throw new Error("guardian witness omitted one of its v20 authorities");
    }
    const initialGuardian = initialRoster.actors[0];
    const initialAssignment = initialWork.assignments[0];
    if (initialGuardian === undefined || initialAssignment === undefined) {
      throw new Error("guardian witness omitted its actor or assignment");
    }
    expect(initialRoster.actors).toHaveLength(1);
    expect(initialWork.assignments).toHaveLength(1);
    expect(initialAssignment.currentActivity.activity).toBe("watch");
    expect(initialSettlement.domesticCustodies.find(({ species }) => (
      species === "domestic-dog"
    ))?.memberActorIds).toEqual([initialGuardian.identity.stableId]);
    expect(initialGuardian.identity.stableId).not.toBe(initialBio0.dog.identity.stableId);

    // Only the sensory input is fixed by this harness. The runtime still has
    // to advance shared cognition, assignment arbitration, transaction
    // resolution, and the generic locomotion solver to produce the witness.
    guardianPerceptionHarness.observerId = initialGuardian.identity.stableId;
    guardianPerceptionHarness.handlerId = initialAssignment.handlerActorId;
    guardianPerceptionHarness.mode = "reachable";
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const advancedRecord = repository.snapshot();
    const advancedEnvelope = savedEnvelope(repository);
    const advancedRoster = deserializeDogActorRoster(advancedEnvelope.dogActorRoster);
    const advancedWork = deserializeSettlementWorkingAnimalState(
      advancedEnvelope.settlementWorkingAnimals,
    );
    const advancedSettlement = deserializeSettlementEcologyState(
      advancedEnvelope.settlementEcology,
    );
    const advancedBio0 = deserializeBio0Ecology(advancedEnvelope.bio0Ecology);
    const reachedObservationId = guardianPerceptionHarness.observationId;
    const reachedArea = guardianPerceptionHarness.area;
    if (
      advancedRoster === null || advancedWork === null || advancedBio0 === null
      || reachedObservationId === null || reachedArea === null
    ) throw new Error("guardian witness did not accept its reachable sensory fixture");
    const advancedGuardian = advancedRoster.actors[0];
    const advancedAssignment = advancedWork.assignments[0];
    if (advancedGuardian === undefined || advancedAssignment === undefined) {
      throw new Error("guardian witness lost its actor or assignment after advance");
    }
    expect(guardianPerceptionHarness.targetKind).toBe("reachable");
    expect(advancedGuardian.identity).toEqual(initialGuardian.identity);
    expect(advancedGuardian.perception.beliefs.some(({ sourceObservationId }) => (
      sourceObservationId === reachedObservationId
    ))).toBe(true);
    expect(advancedAssignment.currentActivity).toMatchObject({
      ordinal: 1,
      activity: "investigate",
      cause: { kind: "perception", referenceId: reachedObservationId },
      perceivedArea: reachedArea,
    });
    const beforeDistance = worldPositionDelta(
      initialGuardian.address.position,
      reachedArea.center,
    );
    const afterDistance = worldPositionDelta(
      advancedGuardian.address.position,
      reachedArea.center,
    );
    expect(Math.hypot(afterDistance.x, afterDistance.y)).toBeLessThan(
      Math.hypot(beforeDistance.x, beforeDistance.y),
    );
    expect(advancedRoster.actors).toHaveLength(1);
    expect(advancedWork.assignments).toHaveLength(1);
    expect(advancedSettlement.domesticCustodies).toEqual(initialSettlement.domesticCustodies);
    expect(new Set([
      advancedBio0.dog.identity.stableId,
      ...advancedRoster.actors.map(({ identity }) => identity.stableId),
    ]).size).toBe(2);

    expect(advancedAssignment.currentTask).toMatchObject({
      taskOrdinal: 1,
      phase: "investigating",
      outcome: null,
      sourceObservationId: reachedObservationId,
      perceivedArea: reachedArea,
      searchProbe: {
        probeOrdinal: 0,
        sourceArea: reachedArea,
        probeArea: { radiusUnits: 0 },
      },
    });

    // Reload while the sensory belief is already aging. The retained task,
    // not renewed omniscient target knowledge, must carry the dog to its exact
    // search probe and physically home again.
    runtime.destroy();
    const recoveredRepository = new MemoryRepository(advancedRecord);
    const recovered = await createTideweftRuntime(recoveredRepository);
    expect(recovered.getUIView().saveWarning).toBeUndefined();
    await recovered.save();
    const recoveredEnvelope = savedEnvelope(recoveredRepository);
    const recoveredRoster = deserializeDogActorRoster(recoveredEnvelope.dogActorRoster);
    const recoveredWork = deserializeSettlementWorkingAnimalState(
      recoveredEnvelope.settlementWorkingAnimals,
    );
    expect(recoveredRoster).toEqual(advancedRoster);
    expect(recoveredWork).toEqual(advancedWork);

    let completedRoster = recoveredRoster;
    let completedWork = recoveredWork;
    for (let tick = 0; tick < 20; tick += 1) {
      advancePlayerSteps(recovered, 10);
      await recovered.save();
      const envelope = savedEnvelope(recoveredRepository);
      completedRoster = deserializeDogActorRoster(envelope.dogActorRoster);
      completedWork = deserializeSettlementWorkingAnimalState(
        envelope.settlementWorkingAnimals,
      );
      if (
        completedWork?.assignments[0]?.currentTask === null
        && completedWork.assignments[0]?.lastTaskOutcome !== null
      ) break;
    }
    const completedGuardian = completedRoster?.actors[0];
    const completedAssignment = completedWork?.assignments[0];
    if (completedGuardian === undefined || completedAssignment === undefined) {
      throw new Error("guardian witness did not retain its completed authorities");
    }
    expect(completedAssignment).toMatchObject({
      currentActivity: { activity: "watch" },
      currentTask: null,
      lastTaskOrdinal: 1,
      lastTaskOutcome: {
        outcome: "completed",
        outcomeTransition: { transition: "complete", cause: { kind: "probe" } },
        lastTransition: { transition: "acknowledge" },
      },
    });
    const returnArea = settlementWorkingAnimalReturnArea(completedAssignment);
    if (returnArea === null) throw new Error("guardian worksite geometry was lost");
    const returnedDelta = worldPositionDelta(
      completedGuardian.address.position,
      returnArea.center,
    );
    expect(Math.hypot(returnedDelta.x, returnedDelta.y)).toBeLessThanOrEqual(
      returnArea.radiusUnits,
    );

    guardianPerceptionHarness.observationId = null;
    guardianPerceptionHarness.area = null;
    guardianPerceptionHarness.targetKind = null;
    guardianPerceptionHarness.mode = "unreachable-or-outside-duty";
    advancePlayerSteps(recovered, 10);
    await recovered.save();
    const deferredEnvelope = savedEnvelope(recoveredRepository);
    const deferredRoster = deserializeDogActorRoster(deferredEnvelope.dogActorRoster);
    const deferredWork = deserializeSettlementWorkingAnimalState(
      deferredEnvelope.settlementWorkingAnimals,
    );
    const deferredObservationId = guardianPerceptionHarness.observationId;
    const deferredArea = capturedGuardianPerceptionArea();
    if (
      deferredRoster === null || deferredWork === null
      || deferredObservationId === null || deferredArea === null
    ) throw new Error("guardian witness did not accept its non-consumable alarm");
    const deferredGuardian = deferredRoster.actors[0];
    const deferredAssignment = deferredWork.assignments[0];
    if (deferredGuardian === undefined || deferredAssignment === undefined) {
      throw new Error("guardian witness lost its deferred actor or assignment");
    }
    expect(guardianPerceptionHarness.targetKind).toBe("unreachable");
    const dutyDisplacement = worldPositionDelta(
      deferredAssignment.dutyArea.center,
      deferredArea.center,
    );
    expect(Math.hypot(dutyDisplacement.x, dutyDisplacement.y)).toBeLessThanOrEqual(
      deferredAssignment.dutyArea.radiusUnits + deferredArea.radiusUnits,
    );
    expect(deferredGuardian.perception.beliefs.some(({ sourceObservationId }) => (
      sourceObservationId === deferredObservationId
    ))).toBe(true);
    expect(deferredGuardian.intent.kind).toBe("retreat");
    expect(deferredAssignment.currentActivity).toMatchObject({
      activity: "defer-to-actor",
      cause: {
        kind: "actor-disposition",
        referenceId: "actor-intent:retreat",
      },
      perceivedArea: null,
    });
    expect(deferredAssignment.currentTask).toBeNull();
    expect(deferredAssignment.lastTaskOrdinal).toBe(1);
    expect(deferredAssignment.lastTaskOutcome)
      .toEqual(completedAssignment.lastTaskOutcome);
    expect(deferredRoster.actors).toHaveLength(1);
    recovered.destroy();

    const beforeSeamRecord = recoveredRepository.snapshot();
    const beforeSeamEnvelope = savedEnvelope(recoveredRepository);
    const beforeSeamRoster = deserializeDogActorRoster(beforeSeamEnvelope.dogActorRoster);
    const beforeSeamWork = deserializeSettlementWorkingAnimalState(
      beforeSeamEnvelope.settlementWorkingAnimals,
    );
    const beforeSeamSettlement = deserializeSettlementEcologyState(
      beforeSeamEnvelope.settlementEcology,
    );
    if (beforeSeamRoster === null || beforeSeamWork === null) {
      throw new Error("guardian witness lost its authority before the regional seam");
    }
    const seamRepository = new MemoryRepository(withPlayerAtEastSeam(beforeSeamRecord));
    const east = await createTideweftRuntime(seamRepository);
    expect(east.getUIView().saveWarning).toBeUndefined();
    east.dispatchUI({ type: "resume-world" });
    east.dispatchRenderer({ type: "brace", active: true });
    east.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    east.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(east, 1);
    east.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await east.save();
    const eastEnvelope = savedEnvelope(seamRepository);
    const eastWorld = deserializeWorld(String(eastEnvelope.world));
    const eastTravel = restorePlayerRegionalTravel(
      eastWorld.meta.rootSeed,
      eastEnvelope.player as PlayerState,
      String(eastEnvelope.regionalTravel),
    );
    const eastRoster = deserializeDogActorRoster(eastEnvelope.dogActorRoster);
    const eastWork = deserializeSettlementWorkingAnimalState(
      eastEnvelope.settlementWorkingAnimals,
    );
    const eastSettlement = deserializeSettlementEcologyState(eastEnvelope.settlementEcology);
    if (eastRoster === null || eastWork === null) {
      throw new Error("guardian witness lost its authority across the regional seam");
    }
    expect(eastTravel?.stream.center).toEqual({ x: 1, y: 0 });
    expect((eastEnvelope.physicalCargo as { activeRegion: unknown }).activeRegion)
      .toEqual({ x: 1, y: 0 });
    expect(eastRoster.actors).toHaveLength(1);
    expect(eastRoster.actors.map(({ identity }) => identity.stableId))
      .toEqual(beforeSeamRoster.actors.map(({ identity }) => identity.stableId));
    expect(eastRoster.actors[0]?.identity).toEqual(beforeSeamRoster.actors[0]?.identity);
    expect(eastWork.assignments).toHaveLength(1);
    expect(eastWork.assignments[0]?.assignmentId)
      .toBe(beforeSeamWork.assignments[0]?.assignmentId);
    expect(eastWork.assignments[0]?.workerActorId)
      .toBe(beforeSeamRoster.actors[0]?.identity.stableId);
    expect(eastSettlement.domesticCustodies).toEqual(
      beforeSeamSettlement.domesticCustodies,
    );
    east.destroy();

    const reloaded = await createTideweftRuntime(seamRepository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    await reloaded.save();
    const replay = savedEnvelope(seamRepository);
    expect(replay.dogActorRoster).toBe(eastEnvelope.dogActorRoster);
    expect(replay.settlementWorkingAnimals).toBe(eastEnvelope.settlementWorkingAnimals);
    expect(replay.settlementEcology).toBe(eastEnvelope.settlementEcology);
    expect(deserializeDogActorRoster(replay.dogActorRoster)?.actors).toHaveLength(1);
    reloaded.destroy();
  }, 30_000);

  it("lets a witnessed domestic chicken perceive and consume one open-store unit while a secured store stays sealed", async () => {
    settlementShadowsHarness.excludePhysicalFood = true;
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "domestic chicken shared store claim",
      posture: "gale",
      sessionShape: "wander",
    });
    await source.save();
    // The flock approaches from the west in this deterministic fixture. Face
    // the ordinary player perception cone toward the yard without moving the
    // player, forcing the narration to earn direct event-time sight.
    const initialRecord = withPlayerFacing(sourceRepository.snapshot(), -3_142);
    const initialEnvelope = JSON.parse(initialRecord.worldJson) as Record<string, unknown>;
    const initialStore = deserializeSettlementEcologyState(initialEnvelope.settlementEcology);
    const initialCore = requireCurrentCoreEcology(initialEnvelope);
    const initialCustody = initialStore.domesticCustodies.find(({ species }) => (
      species === "domestic-chicken"
    ));
    if (initialCustody === undefined) throw new Error("runtime omitted domestic custody");
    expect(initialStore.closure).toBe("open");
    expect(initialStore.lastResolvedDomesticFoodUseOrdinal).toBe(0);
    expect(storedFoodQuantity(initialStore)).toBe(8);
    const initialChickenIds = initialCore.populations
      .filter(({ species }) => species === "domestic-chicken")
      .flatMap(({ members }) => members)
      .map(({ actor }) => actor.identity.stableId);
    expect(initialChickenIds).toHaveLength(initialCustody.memberActorIds.length);
    expect(initialChickenIds.length).toBeGreaterThanOrEqual(2);
    source.destroy();

    const witnessedRepository = new MemoryRepository(initialRecord);
    const witnessed = await createTideweftRuntime(witnessedRepository);
    const witnessedUse = await advanceUntilDomesticFoodUse(
      witnessed,
      witnessedRepository,
    );
    expect(witnessedUse.state).toMatchObject({
      closure: "open",
      lastResolvedLossOrdinal: 0,
      lastResolvedDomesticFoodUseOrdinal: 1,
      pendingDomesticFoodUse: null,
    });
    expect(storedFoodQuantity(witnessedUse.state)).toBe(7);
    expect(witnessedUse.state.lastResolvedDomesticFoodUseTransactionId)
      .toMatch(/^STORE-DOMESTIC-FOOD-USE-/u);
    expect(witnessedUse.state.lastResolvedDomesticFoodUseCauseEventId).not.toBeNull();
    expect(witnessedUse.state.lastResolvedDomesticFoodUseCauseEventTick).not.toBeNull();
    const consumingActorId = witnessedUse.state.lastResolvedDomesticFoodUseMemberActorId;
    expect(initialCustody.memberActorIds).toContain(consumingActorId);
    if (consumingActorId === null) throw new Error("domestic food use omitted its actor");
    const witnessedCore = requireCurrentCoreEcology(witnessedUse.envelope);
    const consumingActor = witnessedCore.populations
      .flatMap(({ members }) => members)
      .find(({ actor }) => actor.identity.stableId === consumingActorId)?.actor;
    if (consumingActor === undefined) {
      throw new Error("domestic food use actor left its authoritative population");
    }
    expect(consumingActor.intent).toMatchObject({
      kind: "forage",
      resourceReference: {
        resourceId: witnessedUse.state.identity.foodLotId,
        sourceKind: "physical-item",
        observedAvailableUnits: 8,
      },
    });
    expect(consumingActor.perception.beliefs).toContainEqual(expect.objectContaining({
      channel: "vision",
      perceivedClass: "exposed-food",
      subjectId: witnessedUse.state.identity.foodLotId,
      identification: "identified",
    }));
    expect(consumingActor.memories).toContainEqual(expect.objectContaining({
      kind: "food",
      referenceId: witnessedUse.state.identity.foodLotId,
    }));
    expect(witnessedUse.announcement).toContain(
      "eats one produce unit from the open store. The physical stock is reduced.",
    );
    witnessed.destroy();

    const securedRepository = new MemoryRepository(withPlayerFacing(initialRecord, 0));
    const secured = await createTideweftRuntime(securedRepository);
    expect(secured.getUIView().controls?.interactLabel).toBe("Warn the store keeper");
    secured.dispatchUI({ type: "interact" });
    for (let worldTick = 0; worldTick < witnessedUse.worldTicks + 8; worldTick += 1) {
      advancePlayerSteps(secured, 10);
    }
    await secured.save();
    const securedEnvelope = savedEnvelope(securedRepository);
    const securedStore = deserializeSettlementEcologyState(securedEnvelope.settlementEcology);
    const securedCore = requireCurrentCoreEcology(securedEnvelope);
    expect(securedStore.closure).toBe("secured");
    expect(securedStore.lastResolvedDomesticFoodUseOrdinal).toBe(0);
    expect(securedStore.lastResolvedLossOrdinal).toBe(0);
    expect(storedFoodQuantity(securedStore)).toBe(8);
    expect(secured.getRenderView().settlements.find(({ foodStore }) => (
      foodStore?.id === securedStore.identity.storeId
    ))?.foodStore?.closure).toBe("secured");
    for (const memberActorId of initialCustody.memberActorIds) {
      const actor = securedCore.populations
        .flatMap(({ members }) => members)
        .find(({ actor: candidate }) => candidate.identity.stableId === memberActorId)?.actor;
      expect(actor?.perception.beliefs.some(({ subjectId }) => (
        subjectId === securedStore.identity.foodLotId
      ))).toBe(false);
    }
    expect(secured.getUIView().announcement?.message).not.toContain(
      "eats one produce unit from the open store",
    );
    secured.destroy();

    const hiddenRepository = new MemoryRepository(initialRecord);
    const hidden = await createTideweftRuntime(hiddenRepository);
    runtimeEcologyHarness.disableDomesticFoodInvestigation = true;
    expect(moveBeyondStoreDetailVisibility(hidden)).toBe(true);
    runtimeEcologyHarness.disableDomesticFoodInvestigation = false;
    await hidden.save();
    const hiddenBefore = deserializeSettlementEcologyState(
      savedEnvelope(hiddenRepository).settlementEcology,
    );
    expect(hiddenBefore.lastResolvedDomesticFoodUseOrdinal).toBe(0);
    expect(storedFoodQuantity(hiddenBefore)).toBe(8);
    const hiddenUse = await advanceUntilDomesticFoodUse(hidden, hiddenRepository);
    expect(hiddenUse.state.lastResolvedDomesticFoodUseOrdinal).toBe(1);
    expect(hiddenUse.state.lastResolvedLossOrdinal).toBe(0);
    expect(storedFoodQuantity(hiddenUse.state)).toBe(7);
    expect(hiddenUse.announcement).not.toContain(
      "eats one produce unit from the open store",
    );
    hidden.destroy();
  }, 45_000);

  it("consumes exactly one stored unit after the shared rat-attraction event and never on save replay", async () => {
    settlementShadowsHarness.exposeOnlyPhysicalFood = true;
    runtimeEcologyHarness.disableDomesticFoodInvestigation = true;
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "store-scent-16",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();
    const initialEnvelope = JSON.parse(repository.snapshot().worldJson) as Record<string, unknown>;
    const initialStore = deserializeSettlementEcologyState(initialEnvelope.settlementEcology);

    let afterStepEnvelope: Record<string, unknown> | undefined;
    let afterStep = null as ReturnType<typeof deserializeSettlementEcologyState> | null;
    for (let worldTick = 0; worldTick < 24 && afterStep?.lastResolvedLossOrdinal !== 1; worldTick += 1) {
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      afterStepEnvelope = JSON.parse(repository.snapshot().worldJson) as Record<string, unknown>;
      afterStep = deserializeSettlementEcologyState(afterStepEnvelope.settlementEcology);
    }
    if (afterStepEnvelope === undefined || afterStep === null) {
      throw new Error("runtime did not produce a settlement ecology snapshot");
    }
    expect(afterStep.lastResolvedLossOrdinal).toBe(1);
    expect(afterStep.pendingLoss).toBeNull();
    expect(afterStep.carrier.lots[0]?.payload).toMatchObject({
      kind: "provision",
      provision: "fresh-produce",
      quantity: 7,
    });
    expect(runtime.getUIView().announcement?.message).toContain(
      "One produce bundle is ruined inside the open storehouse.",
    );
    expect(runtime.getUIView().announcement?.message.toLowerCase()).not.toContain("rat");

    const committedRecord = repository.snapshot();
    runtime.destroy();

    if (
      afterStep.lastResolvedTransactionId === null
      || afterStep.lastResolvedCauseEventId === null
      || afterStep.lastResolvedCauseEventTick === null
    ) throw new Error("resolved store loss omitted its authoritative cause");
    const interrupted = canonicalizeSettlementEcologyState({
      ...initialStore,
      revision: initialStore.revision + 1,
      pendingLoss: {
        transactionId: afterStep.lastResolvedTransactionId,
        ordinal: 1,
        storeId: initialStore.identity.storeId,
        foodLotId: initialStore.identity.foodLotId,
        ratAggregateId: initialStore.identity.ratAggregateId,
        storeAnchorOrdinal: initialStore.identity.storeAnchorOrdinal,
        quantity: 1,
        causeEventId: afterStep.lastResolvedCauseEventId,
        causeEventTick: afterStep.lastResolvedCauseEventTick,
      },
    });
    if (interrupted === null) throw new Error("could not construct interrupted store fixture");
    const { integrity: _committedIntegrity, ...pendingBaseFields } = afterStepEnvelope;
    const pendingBase = {
      ...pendingBaseFields,
      settlementEcology: serializeSettlementEcologyState(interrupted),
    };
    const interruptedRepository = new MemoryRepository({
      ...committedRecord,
      worldJson: JSON.stringify({
        ...pendingBase,
        integrity: gameSaveEnvelopeIntegrity(pendingBase),
      }),
    });
    const recovered = await createTideweftRuntime(interruptedRepository);
    expect(recovered.getUIView().saveWarning).toBeUndefined();
    await recovered.save();
    const recoveredEnvelope = JSON.parse(
      interruptedRepository.snapshot().worldJson,
    ) as Record<string, unknown>;
    expect(recoveredEnvelope.settlementEcology).toBe(afterStepEnvelope.settlementEcology);
    recovered.destroy();

    const reloaded = await createTideweftRuntime(repository);
    await reloaded.save();
    const replayEnvelope = JSON.parse(repository.snapshot().worldJson) as Record<string, unknown>;
    expect(replayEnvelope.settlementEcology).toBe(afterStepEnvelope.settlementEcology);
    const replayState = deserializeSettlementEcologyState(replayEnvelope.settlementEcology);
    expect(replayState.lastResolvedLossOrdinal).toBe(1);
    expect(replayState.carrier.lots[0]?.payload).toMatchObject({ quantity: 7 });
    reloaded.destroy();
  });

  it("keeps an unwitnessed physical store loss out of the player's announcements", async () => {
    runtimeEcologyHarness.disableDomesticFoodInvestigation = true;
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "store loss outside direct sight",
      posture: "gale",
      sessionShape: "wander",
    });
    expect(moveBeyondStoreDetailVisibility(runtime)).toBe(true);

    settlementShadowsHarness.exposeOnlyPhysicalFood = true;
    let state = null as ReturnType<typeof deserializeSettlementEcologyState> | null;
    for (let worldTick = 0; worldTick < 24 && state?.lastResolvedLossOrdinal !== 1; worldTick += 1) {
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const envelope = JSON.parse(repository.snapshot().worldJson) as Record<string, unknown>;
      state = deserializeSettlementEcologyState(envelope.settlementEcology);
    }
    expect(state?.lastResolvedLossOrdinal).toBe(1);
    expect(runtime.getUIView().announcement?.message).not.toContain(
      "One produce bundle is ruined inside the open storehouse.",
    );
    runtime.destroy();
  });
});
