import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  ACTOR_BELIEF_CAP,
  createActorObservation,
  createActorPerceptionState,
  stepActorPerception,
} from "../sim/actorPerception";
import {
  LIVING_CIRCADIAN_OWNER_ID,
  LIVING_CIRCADIAN_VERSION,
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  WORLD_DAWN_START_TICK,
  WORLD_DUSK_START_TICK,
  WORLD_NIGHT_START_TICK,
  WORLD_TICKS_PER_DAY,
  assertWorldInvariants,
  createWorld,
  createWorldView,
  deserializeWorld,
  replaceResidentCircadian,
  residentHomeRestDestinationId,
  runTicks,
  serializeWorld,
  stepWorld,
  type WorldState,
} from "../sim/public";
import {
  createRegionCoord,
  globalTileToRegion,
  regionKey,
  regionLocalToGlobalTile,
} from "../sim/regions";
import type { RootSeed } from "../sim/rng";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH, type WorldView } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import * as dogPhysicalAcoustics from "./dogPhysicalAcousticPerception";
import * as humanPerception from "./humanPerception";
import { ADRIFT_STAND_DEPTH } from "./adrift";
import {
  animalContactAcousticBodySizeForDogSize,
  animalContactAcousticTriggerEventId,
  animalContactMovementForDistance,
  canonicalizeAnimalContactAcousticCarry,
  createAnimalContactAcousticCarryRecord,
} from "./animalContactAcousticCarry";
import { deserializeBio0Ecology, serializeBio0Ecology } from "./bio0Ecology";
import {
  repositionDogActor,
  replaceDogActorCircadian,
  replaceDogActorPerception,
  replaceDogActorPhysiology,
  setDogActorIntent,
} from "./dogActor";
import { guardianDogShelterWhineTriggerEventId } from "./dogSignalExpression";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  migrateLegacyCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import { CORE_ECOLOGY_CHORUS_CADENCE_TICKS } from "./coreEcologyAggregateAudio";
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
import {
  deserializeDogActorRoster,
  replaceDogActorInRoster,
  serializeDogActorRoster,
} from "./dogActorRoster";
import { firstLivingCircadianActiveTick } from "./livingCircadian";
import {
  headingFromRadians,
  livingActorAddressInRegionalWindow,
} from "./livingActor";
import { createPorterResponseState } from "./porterResponse";
import {
  gameSaveEnvelopeIntegrity,
  snapshotPhysicalCargoState,
  transitionPhysicalCargoRegion,
  validatePhysicalCargoState,
} from "./physicalCargoState";
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
import { TILE_UNITS, createPlayer, type PlayerState } from "./player";
import { PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE } from "./playerTimeAction";
import {
  capturePlayerRegionalTravel,
  recenterRegionalPlayer,
  restorePlayerRegionalTravel,
  serializePlayerRegionalTravel,
} from "./regionalPlayerTravel";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  REGIONAL_TRAVEL_SAFE_MAX_X,
  REGIONAL_TRAVEL_SAFE_MAX_Y,
  REGIONAL_TRAVEL_SAFE_MIN_Y,
  regionLocalToWindowTile,
} from "./regionalTravel";
import { putRegionalEcologyResidentDeviation } from "./regionalEcology";
import { createCoreEcologyRegionalResidentPatchForRoot } from "./regionalEcologyResidents";
import {
  createRegionalEcologyState,
  regionalEcologyRegionalResidentsForActiveRegions,
  type RegionalEcologyActiveResidentInput,
  type RegionalEcologyStateV1,
} from "./regionalEcologyState";
import { createRegionalEcologyStateV2 } from "./regionalEcologyStateV2";
import { createRegionalEcologyStateV3 } from "./regionalEcologyStateV3";
import { createRegionalEcologyStateV4 } from "./regionalEcologyStateV4";
import { createRegionalEcologyStateV5 } from "./regionalEcologyStateV5";
import {
  createRegionalEcologyStateV6,
  deserializeRegionalEcologyStateV6,
  replaceRegionalEcologyStateV6ActiveState,
  serializeRegionalEcologyStateV6,
} from "./regionalEcologyStateV6";
import {
  createRegionalWorldView,
  regionalAddressAt,
  regionalStorageRegionsInView,
  regionalTileIndexInView,
} from "./regionalWorldView";
import {
  playerWorldPositionInRegionalWindow,
  resolveResidentWorldPlacement,
} from "./residentSpatial";
import {
  advanceRuntimeResidentCircadian,
  createTideweftRuntime,
  type TideweftRuntime,
} from "./runtime";
import { createSessionState } from "./sessionTypes";
import { SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE } from "./situatedExpressionAcoustics";
import type { SituatedExpressionAdmissionLedger } from "./situatedExpressionAdmissionLedger";
import type { SituatedExpressionChannelBank } from "./situatedExpressionChannelBank";
import * as situatedExpressionChannels from "./situatedExpressionChannelBank";
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
  SETTLEMENT_WORKING_ANIMAL_RETURN_RADIUS_UNITS,
  deserializeSettlementWorkingAnimalState,
  resolveSettlementWorkingAnimalActivity,
  serializeSettlementWorkingAnimalState,
  settlementWorkingAnimalReturnArea,
  stageSettlementWorkingAnimalActivity,
  stageSettlementWorkingAnimalTaskLifecycle,
} from "./settlementWorkingAnimals";
import {
  SETTLEMENT_WORKING_DOG_CIRCADIAN_POLICY,
  projectSettlementWorkingDogCircadian,
  settlementWorkingDogCircadianRestDestinationId,
} from "./settlementWorkingDogCircadian";
import { createHeardUnseenSituatedExpressionReception } from "./situatedExpressionReception";
import {
  animalContactAcousticEvent,
  type WorldAcousticEvent,
} from "./worldAcoustics";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

const settlementShadowsHarness = vi.hoisted(() => ({
  excludePhysicalFood: false,
  exposeOnlyPhysicalFood: false,
  forceRainIntensity: null as number | null,
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
const soundscapePlay = vi.hoisted(() => vi.fn());

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
    patch?: CoreEcologyAggregatePatchState,
  ): CoreEcologySettlementShadowsStimulusFrame => {
    const stimuli = frame.stimuli
      .filter(({ sourceKind }) => (
        settlementShadowsHarness.exposeOnlyPhysicalFood
          ? sourceKind === "exposed-food"
          : sourceKind !== "exposed-food"
      ))
      .map((stimulus) => (
        stimulus.sourceKind !== "rain"
        || settlementShadowsHarness.forceRainIntensity === null
          ? stimulus
          : {
              ...stimulus,
              anchorInfluences: stimulus.anchorInfluences.map((influence) => ({
                ...influence,
                intensity: settlementShadowsHarness.forceRainIntensity!,
              })),
            }
      ));
    if (settlementShadowsHarness.forceRainIntensity !== null && patch !== undefined) {
      for (const population of patch.aggregatePopulations) {
        if (
          population.species !== "southern-leopard-frog"
          || stimuli.some(({ sourceKind, targetAggregateId }) => (
            sourceKind === "rain" && targetAggregateId === population.aggregateId
          ))
        ) continue;
        stimuli.push({
          version: 1,
          stimulusId: `test-rain:${hashCanonical([
            population.aggregateId,
            frame.atTick,
          ])}`,
          sourceReferenceId: "weather:test-rain",
          sourceKind: "rain",
          response: "attraction",
          targetAggregateId: population.aggregateId,
          channels: ["hearing", "touch"],
          anchorInfluences: population.anchors.map(({ anchorOrdinal }) => ({
            anchorOrdinal,
            intensity: settlementShadowsHarness.forceRainIntensity!,
          })),
        });
      }
    }
    return { ...frame, stimuli };
  };
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
        && settlementShadowsHarness.forceRainIntensity === null
        || args[2] === undefined
      ) {
        return actual.stepCoreEcologySettlementShadows(...args);
      }
      const frame = args[2] as CoreEcologySettlementShadowsStimulusFrame;
      return actual.stepCoreEcologySettlementShadows(
        args[0],
        args[1],
        filteredFrame(frame, args[0] as CoreEcologyAggregatePatchState),
      );
    },
    stepCoreEcologySmallWorldSourceSet: (
      ...args: Parameters<typeof actual.stepCoreEcologySmallWorldSourceSet>
    ) => {
      if (settlementShadowsHarness.rejectAfterWorkingDog) return null;
      if (
        !settlementShadowsHarness.exposeOnlyPhysicalFood
        && !settlementShadowsHarness.excludePhysicalFood
        && settlementShadowsHarness.forceRainIntensity === null
      ) {
        return actual.stepCoreEcologySmallWorldSourceSet(...args);
      }
      const sources = args[0] as readonly CoreEcologySmallWorldSourceStepInput[];
      return actual.stepCoreEcologySmallWorldSourceSet(sources.map((source) => ({
        ...source,
        stimulusFrame: filteredFrame(source.stimulusFrame, source.patch),
      })), args[1]);
    },
  };
});

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void {
      soundscapePlay(...args);
    }
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

/** Obsolete unpublished Voice formats are recognized, never partially loaded or overwritten. */
async function expectRetiredVoiceSaveUntouched(record: SaveRecord): Promise<void> {
  const repository = new MemoryRepository(record);
  const priorCueCount = soundscapePlay.mock.calls.length;
  const runtime = await createTideweftRuntime(repository);
  expect(runtime.getUIView().title.hasSave).toBe(false);
  expect(runtime.getUIView().title.requiresSeed).toBe(true);
  expect(runtime.getUIView().saveWarning?.message).toBe("PRE-1.0 SAVE INCOMPATIBLE");
  expect(runtime.getUIView().announcement?.message).toContain(
    `development schema ${record.payloadVersion} is intentionally unsupported`,
  );
  expect(soundscapePlay.mock.calls).toHaveLength(priorCueCount);
  await expect(runtime.save()).rejects.toThrow(
    "non-empty seed before replacing the incompatible pre-1.0 development save",
  );
  expect(repository.snapshot()).toEqual(record);
  expect(soundscapePlay.mock.calls).toHaveLength(priorCueCount);
  runtime.destroy();
  scheduledFrame = undefined;
}

let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime = 100;

beforeEach(() => {
  scheduledFrame = undefined;
  nextFrameTime = 100;
  soundscapePlay.mockReset();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  settlementShadowsHarness.excludePhysicalFood = false;
  settlementShadowsHarness.exposeOnlyPhysicalFood = false;
  settlementShadowsHarness.forceRainIntensity = null;
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

/** WAIT accepts a fixed step on its first frame; there is no clock-establishing frame. */
function advanceWaitFrames(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  for (let frame = 0; frame < count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next WAIT frame");
    scheduledFrame = undefined;
    callback(nextFrameTime);
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

function progressedPlayerTimeActionAtEnvelope(
  source: NonNullable<PlayerState["timeAction"]>,
  envelope: Readonly<Record<string, unknown>>,
): NonNullable<PlayerState["timeAction"]> {
  const carry = envelope.perceptionCarry as { playerStepsSinceWorldTick?: unknown };
  const playerStepPhase = carry.playerStepsSinceWorldTick;
  const worldText = envelope.world;
  if (typeof worldText !== "string" || !Number.isSafeInteger(playerStepPhase)) {
    throw new Error("time-action tamper fixture omitted its authoritative clock");
  }
  const completedSteps = (
    (deserializeWorld(worldText).meta.completedTick - source.startedAtWorldTick)
      * PLAYER_TIME_ACTION_STEPS_PER_WORLD_MINUTE
    + (playerStepPhase as number)
    - source.startedAtPlayerStepPhase
  );
  if (
    !Number.isSafeInteger(completedSteps)
    || completedSteps < 0
    || completedSteps >= source.totalSteps
  ) throw new Error("time-action tamper fixture could not progress its recovery receipt");
  return { ...source, completedSteps };
}

function legacyPlayerWithoutTimeAction(player: PlayerState): PlayerState {
  const { timeAction: _futureTimeAction, ...legacyPlayer } = player;
  return legacyPlayer as PlayerState;
}

function legacyPlayerPerceptionCarry(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("current fixture omitted its player perception carry");
  }
  const {
    actorVocalizationSamples: _futureVocalizations,
    animalContactAcousticCarry: _futureAnimalContactCarry,
    intervalStartFacingMilliRadians: _futureIntervalStartFacing,
    intervalStartPosition: _futureIntervalStartPosition,
    intervalStartWasSleeping: _futureIntervalStartWasSleeping,
    playerStepStateAnchor: _futurePlayerStepStateAnchor,
    playerStepStateSamples: _futurePlayerStepStateSamples,
    situatedExpressionAdmissions: _futureAdmissions,
    situatedExpressionCausalAuthority: _futureCausalAuthority,
    situatedExpressionChannels: _futureExpressionChannels,
    ...legacy
  } = structuredClone(value) as Record<string, unknown>;
  return Object.freeze({ ...legacy, version: 1 });
}

function withCurrentEnvelopeFields(
  record: SaveRecord,
  replacement: Readonly<Record<string, unknown>>,
): SaveRecord {
  const current = JSON.parse(record.worldJson) as Record<string, unknown>;
  if (record.payloadVersion !== 50 || current.version !== 50) {
    throw new Error("runtime fixture is not a current v50 save");
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

function legacyRuntimeSaveRecord(world: WorldState): SaveRecord {
  const session = createSessionState(world.meta.seedText, "gale", "wander");
  session.paused = false;
  session.titleVisible = false;
  return {
    slotId: "autosave",
    label: "Working dog night routine",
    seed: world.meta.seedText,
    updatedAt: 1,
    playTicks: world.meta.completedTick,
    settlementCount: world.settlements.length,
    connectedCount: 0,
    worldJson: JSON.stringify({
      format: "tideweft-session",
      version: 1,
      world: serializeWorld(world),
      player: legacyPlayerWithoutTimeAction(createPlayer(createWorldView(world))),
      session,
    }),
  };
}

function connectedOpenDogPositionOutside(
  view: WorldView,
  center: WorldPosition,
  radiusUnits: number,
): WorldPosition {
  const centerLocalX = Math.floor(center.localX / WORLD_POSITION_UNITS_PER_TILE);
  const centerLocalY = Math.floor(center.localY / WORLD_POSITION_UNITS_PER_TILE);
  const start = regionalTileIndexInView(
    view,
    center.region,
    centerLocalY * WORLD_WIDTH + centerLocalX,
  );
  if (start === null) throw new Error("working-dog kennel is outside its fixture view");

  const visited = new Set([start]);
  const frontier = [start];
  while (frontier.length > 0) {
    const index = frontier.shift();
    if (index === undefined) break;
    const tile = view.terrain.tiles[index];
    if (
      tile === undefined
      || tile.terrain === "deep-water"
      || tile.waterDepth > ADRIFT_STAND_DEPTH
    ) continue;
    const address = regionalAddressAt(view, index);
    if (address === null) throw new Error("working-dog route lost a regional address");
    const position = createWorldPosition(
      address.region,
      address.localX * WORLD_POSITION_UNITS_PER_TILE
        + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
      address.localY * WORLD_POSITION_UNITS_PER_TILE
        + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
    );
    const delta = worldPositionDelta(position, center);
    const distance = Math.hypot(delta.x, delta.y);
    if (
      distance > radiusUnits + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2)
      && distance <= radiusUnits + WORLD_POSITION_UNITS_PER_TILE * 1.5
    ) return position;

    const x = index % view.terrain.width;
    const y = Math.floor(index / view.terrain.width);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (
        nextX < 0 || nextX >= view.terrain.width
        || nextY < 0 || nextY >= view.terrain.height
      ) continue;
      const next = nextY * view.terrain.width + nextX;
      if (visited.has(next)) continue;
      visited.add(next);
      frontier.push(next);
    }
  }
  throw new Error("working-dog fixture found no connected open tile outside its kennel");
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
  const priorV6 = deserializeRegionalEcologyStateV6(serialized);
  if (priorV6 === null) throw new Error("guardian fixture started with invalid regional ecology");
  const priorV5 = priorV6.base;
  const priorV4 = priorV5.base;
  const priorV3 = priorV4.base;
  const priorV2 = priorV3.base;
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
  return serializeRegionalEcologyStateV6(replaceRegionalEcologyStateV6ActiveState(priorV6, {
    expectedIntegrity: priorV6.integrity,
    base: {
      expectedIntegrity: priorV5.integrity,
      base: {
        expectedIntegrity: priorV4.integrity,
        base: {
          expectedIntegrity: priorV3.integrity,
          base: {
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
          },
        },
      },
    },
  }));
}

function withPlayerAtEastSeam(
  record: SaveRecord,
  stamina: number = FIXED_POINT,
): SaveRecord {
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
  player.stamina = stamina;
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
  const intervalStartPosition = playerWorldPositionInRegionalWindow(
    transition.state.window,
    player,
  );
  if (intervalStartPosition === null) {
    throw new Error("guardian fixture could not anchor its phase-zero seam pose");
  }
  const perceptionCarry = structuredClone(current.perceptionCarry) as Record<string, unknown>;
  if (perceptionCarry.playerStepsSinceWorldTick !== 0) {
    throw new Error("guardian seam fixture requires a phase-zero perception interval");
  }
  return withCurrentEnvelopeFields(record, {
    player,
    regionalTravel,
    perceptionCarry: {
      ...perceptionCarry,
      intervalStartPosition,
      intervalStartFacingMilliRadians: player.facingMilliRadians,
    },
    regionalEcology: rebaseFixtureRegionalEcology(
      current.regionalEcology,
      world.meta.rootSeed,
      spatial,
    ),
  });
}

function withPlayerWitnessingWorldPosition(
  record: SaveRecord,
  position: WorldPosition,
  lookAt: WorldPosition,
  stamina: number = FIXED_POINT,
): SaveRecord {
  const current = JSON.parse(record.worldJson) as Record<string, unknown>;
  if (
    typeof current.world !== "string"
    || typeof current.regionalTravel !== "string"
    || typeof current.player !== "object"
    || current.player === null
    || Array.isArray(current.player)
  ) throw new Error("witness fixture omitted regional player authority");
  const world = deserializeWorld(current.world);
  const player = structuredClone(current.player) as PlayerState;
  const travel = restorePlayerRegionalTravel(
    world.meta.rootSeed,
    player,
    current.regionalTravel,
  );
  if (travel === null) throw new Error("witness fixture regional sidecar did not restore");
  const view = createRegionalWorldView(createWorldView(world), travel.window, {
    discovered: player.discovered,
    depthSoundings: player.depthSoundings,
  });
  const positionTile = regionLocalToWindowTile(
    travel.window,
    position.region,
    Math.floor(position.localX / WORLD_POSITION_UNITS_PER_TILE),
    Math.floor(position.localY / WORLD_POSITION_UNITS_PER_TILE),
  );
  const lookAtTile = regionLocalToWindowTile(
    travel.window,
    lookAt.region,
    Math.floor(lookAt.localX / WORLD_POSITION_UNITS_PER_TILE),
    Math.floor(lookAt.localY / WORLD_POSITION_UNITS_PER_TILE),
  );
  if (positionTile === null || lookAtTile === null) {
    throw new Error("witness fixture target fell outside the regional window");
  }
  const positionIndex = positionTile.y * REGIONAL_TRAVEL_COLUMNS + positionTile.x;
  const footing = view.terrain.tiles[positionIndex];
  if (
    footing === undefined
    || footing.terrain === "ridge"
    || footing.waterDepth > ADRIFT_STAND_DEPTH
    || footing.roughness >= 650_000
  ) throw new Error("witness fixture target is not safe player footing");
  const localRemainderX = position.localX % WORLD_POSITION_UNITS_PER_TILE;
  const localRemainderY = position.localY % WORLD_POSITION_UNITS_PER_TILE;
  player.x = positionTile.x * TILE_UNITS + localRemainderX;
  player.y = positionTile.y * TILE_UNITS + localRemainderY;
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.stamina = stamina;
  player.stability = FIXED_POINT;
  player.stabilityTrend = "steady";
  player.stabilityHint = "Stable on sound footing";
  player.pace = "steady";
  player.mode = "foot";
  player.sweepTicksRemaining = 0;
  player.sweepTotalTicks = 0;
  player.sweepPath = [];
  player.sweepSupport = null;
  player.currentTrace = [positionIndex];
  player.surveyTrace = [positionIndex];
  const lookAtX = lookAtTile.x * TILE_UNITS
    + lookAt.localX % WORLD_POSITION_UNITS_PER_TILE;
  const lookAtY = lookAtTile.y * TILE_UNITS
    + lookAt.localY % WORLD_POSITION_UNITS_PER_TILE;
  player.facingMilliRadians = Math.round(
    Math.atan2(lookAtY - player.y, lookAtX - player.x) * 1_000,
  );
  const regionalTravel = serializePlayerRegionalTravel(
    capturePlayerRegionalTravel(travel, player),
  );
  if (restorePlayerRegionalTravel(world.meta.rootSeed, player, regionalTravel) === null) {
    throw new Error("witness fixture produced an invalid regional sidecar");
  }
  const intervalStartPosition = playerWorldPositionInRegionalWindow(travel.window, player);
  if (intervalStartPosition === null) {
    throw new Error("witness fixture could not anchor its phase-zero player pose");
  }
  const perceptionCarry = structuredClone(current.perceptionCarry) as Record<string, unknown>;
  if (perceptionCarry.playerStepsSinceWorldTick !== 0) {
    throw new Error("witness fixture requires a phase-zero perception interval");
  }
  return withCurrentEnvelopeFields(record, {
    player,
    regionalTravel,
    perceptionCarry: {
      ...perceptionCarry,
      intervalStartPosition,
      intervalStartFacingMilliRadians: player.facingMilliRadians,
    },
  });
}

function requireRegionalEcology(encoded: unknown): RegionalEcologyStateV1 {
  const state = deserializeRegionalEcologyStateV6(encoded);
  if (state === null) throw new Error("runtime fixture omitted canonical regional ecology");
  return state.base.base.base.base.base;
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
  sources: Readonly<{
    root?: RegionalEcologyStateV1["root"];
    activeResidents?: readonly RegionalEcologyActiveResidentInput[];
  }> = {},
): SaveRecord {
  const envelope = JSON.parse(record.worldJson) as Record<string, unknown>;
  const regionalV6 = deserializeRegionalEcologyStateV6(envelope.regionalEcology);
  if (regionalV6 === null) throw new Error("settlement-home fixture omitted v30 authority");
  const regionalV5 = regionalV6.base;
  const regionalV4 = regionalV5.base;
  const regionalV3 = regionalV4.base;
  const regionalV2 = regionalV3.base;
  const regional = regionalV2.base;
  if (patch.patchKey !== regional.settlementHome.sourceKey) {
    throw new Error("settlement-home fixture changed its signed source key");
  }
  const replacedBase = createRegionalEcologyState({
    root: sources.root ?? regional.root,
    settlementHome: {
      sourceKey: regional.settlementHome.sourceKey,
      patch,
    },
    activeRegions: regional.activeRegions,
    activeResidents: sources.activeResidents ?? regional.activeResidents.map(({
      kind,
      sourceKey,
      patch: residentPatch,
    }) => ({
      kind: kind === "legacy-cohort"
        ? "legacy-cohort" as const
        : "regional-habitat" as const,
      sourceKey,
      patch: residentPatch,
    })),
  });
  const replacedV2 = createRegionalEcologyStateV2({
    base: replacedBase,
    alpineRoot: regionalV2.alpineRoot,
    alpineActiveResidents: regionalV2.alpineActiveResidents.map(({
      sourceKey,
      patch: alpinePatch,
    }) => ({ sourceKey, patch: alpinePatch })),
    adoption: regionalV2.adoption,
  });
  const replacedV3 = createRegionalEcologyStateV3({
    base: replacedV2,
    polarShoreRoot: regionalV3.polarShoreRoot,
    polarShoreActiveResidents: regionalV3.polarShoreActiveResidents.map(({
      sourceKey,
      patch: polarPatch,
    }) => ({ sourceKey, patch: polarPatch })),
    adoption: regionalV3.adoption,
  });
  const replacedV4 = createRegionalEcologyStateV4({
    base: replacedV3,
    coldShoreRoot: regionalV4.coldShoreRoot,
    coldShoreActiveResidents: regionalV4.coldShoreActiveResidents.map(({
      sourceKey,
      patch: coldShorePatch,
    }) => ({ sourceKey, patch: coldShorePatch })),
    adoption: regionalV4.adoption,
  });
  const replacedV5 = createRegionalEcologyStateV5({
    base: replacedV4,
    polarConsumerRoot: regionalV5.polarConsumerRoot,
    polarConsumerActiveResidents: regionalV5.polarConsumerActiveResidents.map(({
      sourceKey,
      patch: polarConsumerPatch,
    }) => ({ sourceKey, patch: polarConsumerPatch })),
    adoption: regionalV5.adoption,
  });
  const replacedV6 = createRegionalEcologyStateV6({
    base: replacedV5,
    breadthRoot: regionalV6.breadthRoot,
    breadthActiveResidents: regionalV6.breadthActiveResidents.map(({
      sourceKey,
      patch: breadthPatch,
    }) => ({ sourceKey, patch: breadthPatch })),
    adoption: regionalV6.adoption,
  });
  return withCurrentEnvelopeFields(record, {
    regionalEcology: serializeRegionalEcologyStateV6(replacedV6),
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
 * before regional storage split it. Fresh v34 saves retain the frozen v11
 * habitat on the settlement-home owner, so rebuild that source through the
 * same public construction and initialization kernels used by v24.
 */
function createExactV24CoreFromFreshV34(
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
    weather: {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: tick + 1,
    },
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
  if (current.version !== 50) throw new Error("fixture is not a current save");
  const historicalCore = createExactV24CoreFromFreshV34(current);
  const {
    integrity: _integrity,
    playerExpressionRecency: _futurePlayerExpressionRecency,
    regionalEcology: _regionalEcology,
    dogActorRoster: _dogActorRoster,
    settlementWorkingAnimals: _settlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _settlementDomesticAnimalRecovery,
    ...currentFields
  } = current;
  const priorBase = {
    ...currentFields,
    player: legacyPlayerWithoutTimeAction(current.player as PlayerState),
    perceptionCarry: legacyPlayerPerceptionCarry(current.perceptionCarry),
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
  if (current.version !== 50) throw new Error("fixture is not a current save");
  const historicalCore = createExactV24CoreFromFreshV34(current);
  const {
    integrity: _integrity,
    playerExpressionRecency: _futurePlayerExpressionRecency,
    regionalEcology: _regionalEcology,
    dogActorRoster: _dogActorRoster,
    settlementWorkingAnimals: _settlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _settlementDomesticAnimalRecovery,
    ...currentFields
  } = current;
  const priorBase = {
    ...currentFields,
    player: legacyPlayerWithoutTimeAction(current.player as PlayerState),
    perceptionCarry: legacyPlayerPerceptionCarry(current.perceptionCarry),
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
  if (current.version !== 50 || typeof current.settlementEcology !== "string") {
    throw new Error("fixture is not a current working-dog save");
  }
  const historicalCore = createExactV24CoreFromFreshV34(current);
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
    playerExpressionRecency: _futurePlayerExpressionRecency,
    regionalEcology: _regionalEcology,
    dogActorRoster: _dogActorRoster,
    settlementWorkingAnimals: _settlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _settlementDomesticAnimalRecovery,
    ...currentFields
  } = current;
  const priorBase = {
    ...currentFields,
    player: legacyPlayerWithoutTimeAction(current.player as PlayerState),
    perceptionCarry: legacyPlayerPerceptionCarry(current.perceptionCarry),
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
    current.version !== 50
    || typeof current.settlementWorkingAnimals !== "string"
  ) throw new Error("fixture is not a current task-lifecycle save");
  const historicalCore = createExactV24CoreFromFreshV34(current);
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
    playerExpressionRecency: _futurePlayerExpressionRecency,
    regionalEcology: _regionalEcology,
    settlementDomesticAnimalRecovery: _settlementDomesticAnimalRecovery,
    ...currentFields
  } = current;
  const priorBase = {
    ...currentFields,
    player: legacyPlayerWithoutTimeAction(current.player as PlayerState),
    perceptionCarry: legacyPlayerPerceptionCarry(current.perceptionCarry),
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

interface ChickenVoiceCarry {
  readonly intervalStartWasSleeping: boolean;
  readonly situatedExpressionAdmissions: SituatedExpressionAdmissionLedger;
  readonly situatedExpressionChannels: SituatedExpressionChannelBank;
  readonly actorVocalizationSamples: readonly humanPerception.SupplementalSoundSample[];
}

/** Current generated custody and real dog threat; no injected observations or alarm events. */
async function createChickenAlarmRuntime(
  runtimeFactory = createTideweftRuntime,
  options: Readonly<{ observer?: "visible" | "unseen" | "unheard" | "sleep" | "store"; threat?: boolean }> = {},
): Promise<{
  runtime: TideweftRuntime;
  repository: MemoryRepository;
  memberActorIds: readonly string[];
  guardianActorId: string;
}> {
  const observer = options.observer ?? "visible";
  let nightRecord: SaveRecord | undefined;
  if (observer === "sleep") {
    const night = createWorld("domestic chicken shared store claim", "wild");
    runTicks(night, WORLD_DUSK_START_TICK - night.meta.completedTick);
    night.weather.kind = "clear";
    night.weather.intensity = 0;
    night.weather.windX = 0;
    night.weather.windY = 0;
    night.weather.nextChangeTick = night.meta.completedTick + 100_000;
    assertWorldInvariants(night);
    // Existing supported world fixture initializes fresh current ecology;
    // all following staging and reload use current50 generated-home authority.
    nightRecord = legacyRuntimeSaveRecord(night);
  }
  const sourceRepository = new MemoryRepository(nightRecord);
  const source = await runtimeFactory(sourceRepository);
  if (nightRecord === undefined) source.dispatchUI({
    type: "new-world", seed: "domestic chicken shared store claim",
    posture: "gale", sessionShape: "wander",
  });
  await source.save();
  source.destroy();
  scheduledFrame = undefined;
  const record = sourceRepository.snapshot();
  const envelope = savedEnvelope(sourceRepository);
  const world = deserializeWorld(String(envelope.world));
  const view = createWorldView(world);
  const store = deserializeSettlementEcologyState(envelope.settlementEcology);
  const custody = store.domesticCustodies.find(({ species }) => species === "domestic-chicken");
  const roster = deserializeDogActorRoster(envelope.dogActorRoster);
  const guardian = roster?.actors[0];
  const bio0 = deserializeBio0Ecology(envelope.bio0Ecology);
  if (custody === undefined || roster === null || guardian === undefined || bio0 === null) {
    throw new Error("Generated chicken fixture omitted real custody or guardian");
  }
  const position = observer === "sleep" || observer === "store" ? store.identity.position
    : connectedOpenDogPositionOutside(view, custody.homeStructure.position, 3_000);
  const distantDogPosition = connectedOpenDogPositionOutside(view, store.identity.position, 20_000);
  const dogPosition = options.threat === false ? distantDogPosition
    : translateWorldPosition(position, 300, 0);
  for (const point of [position, dogPosition]) {
    const index = Math.floor(point.localY / WORLD_POSITION_UNITS_PER_TILE) * WORLD_WIDTH
      + Math.floor(point.localX / WORLD_POSITION_UNITS_PER_TILE);
    const tile = view.terrain.tiles[index];
    if (tile === undefined || coreWildlifeTraversabilityCell("domestic-chicken", tile).access !== "open") {
      throw new Error("Chicken fixture needs actual shared traversable footing");
    }
  }
  let core = requireCurrentCoreEcology(envelope);
  core = setCoreEcologyAggregatePatchMaterializedActors(core, {
    atTick: core.updatedAtTick, actorIds: custody.memberActorIds,
  });
  const chickens = core.populations.filter(({ species }) => species === "domestic-chicken")
    .flatMap(({ members }) => members.map(({ actor }) => actor));
  expect(chickens.map(({ identity }) => identity.stableId).sort())
    .toEqual([...custody.memberActorIds].sort());
  for (const chicken of chickens) {
    core = replaceCoreEcologyAggregatePatchActor(core, repositionCoreWildlifeActor(chicken, {
      atTick: core.updatedAtTick, position, heading: headingFromRadians(0),
    }));
  }
  const movedRoster = replaceDogActorInRoster(roster, repositionDogActor(guardian, {
    position: dogPosition, heading: guardian.address.heading, atTick: world.meta.completedTick,
  }));
  if (movedRoster === null) throw new Error("Chicken fixture guardian replacement rejected");
  const staged = withCurrentEnvelopeFields(withCurrentSettlementHomeCore(record, core), {
    dogActorRoster: serializeDogActorRoster(movedRoster),
    bio0Ecology: serializeBio0Ecology({
      ...bio0, dog: repositionDogActor(bio0.dog, {
        position: distantDogPosition, heading: bio0.dog.address.heading, atTick: bio0.tick,
      }),
    }),
  });
  const observerPosition = observer === "unseen" ? translateWorldPosition(position, -3_000, 0)
    : observer === "unheard" ? translateWorldPosition(position, -7_000, 0) : position;
  const lookAt = observer === "unseen" || observer === "unheard"
    ? translateWorldPosition(observerPosition, -1_000, 0) : dogPosition;
  const repository = new MemoryRepository(withPlayerWitnessingWorldPosition(
    staged, observerPosition, lookAt, 800_000,
  ));
  const runtime = await runtimeFactory(repository);
  expect(runtime.getUIView().saveWarning).toBeUndefined();
  return { runtime, repository, memberActorIds: custody.memberActorIds, guardianActorId: guardian.identity.stableId };
}

/**
 * Finite current home goats and one genuinely generated signed native bear.
 * Physical positions/group anchors and clear weather are staged; no alarm,
 * observation or population is injected. Ordinary runtime perception owns the
 * cause, alarm, materialization and listener receipts. The displaced bear
 * keeps its remote source/identity through the existing sparse residence law.
 */
async function createGoatAlarmRuntime(
  options: Readonly<{ threat?: boolean; humanListener?: boolean }> = {},
): Promise<{
  runtime: TideweftRuntime;
  repository: MemoryRepository;
  memberActorIds: readonly string[];
  bearActorId: string;
  bearSourceKey: string;
  initialSettlement: string;
  initialGroupId: string;
  listenerActorId: string | null;
}> {
  const sourceRepository = new MemoryRepository();
  const source = await createTideweftRuntime(sourceRepository);
  source.dispatchUI({
    type: "new-world", seed: "goat-runtime-1", posture: "gale", sessionShape: "wander",
  });
  await source.save();
  source.destroy();
  scheduledFrame = undefined;
  const record = sourceRepository.snapshot();
  const envelope = savedEnvelope(sourceRepository);
  const world = deserializeWorld(String(envelope.world));
  world.weather.kind = "clear";
  world.weather.intensity = 0;
  world.weather.windX = 0;
  world.weather.windY = 0;
  world.weather.nextChangeTick = world.meta.completedTick + 100_000;
  const view = createWorldView(world);
  const settlement = deserializeSettlementEcologyState(envelope.settlementEcology);
  const custody = settlement.domesticCustodies.find(({ species }) => species === "domestic-goat");
  if (custody === undefined) throw new Error("Goat fixture omitted its generated custody");
  const nativeGoatPosition = requireCurrentCoreEcology(envelope).populations
    .find(({ species }) => species === "domestic-goat")?.members[0]?.actor.address.position;
  if (nativeGoatPosition === undefined) throw new Error("Goat fixture omitted its original finite body");
  // The exact pen is beyond current human hearing range from generated routes.
  // Hearing tests use the first goat's existing generated grazing address,
  // retaining its original home/custody and staging the same finite group.
  const position = options.humanListener === true ? nativeGoatPosition : custody.homeStructure.position;
  const bearPosition = translateWorldPosition(position, 300, 0);
  let listenerActorId: string | null = null;
  if (options.humanListener === true) {
    const bio0 = deserializeBio0Ecology(envelope.bio0Ecology);
    const listener = world.residents.find(({ activeContractId, identity }) => (
      activeContractId === null && identity.stableId !== settlement.identity.keeperActorId
      && identity.stableId !== bio0?.porterAddress.actorId
    ));
    if (listener === undefined) throw new Error("Goat fixture lacks an existing free human");
    // Compatibility humans have a settlement/route location owner, not an
    // arbitrary world-point setter. Stage this same finite resident on an
    // actual generated route's closest real segment; preserve all knowledge,
    // identity, needs and custody. This is controlled placement, not travel.
    let placement: { routeId: number; progress: number; distance: number } | undefined;
    for (const route of world.routes) for (const [offset, tileIndex] of route.path.entries()) {
      if (route.path.length < 2) continue;
      const tile = view.terrain.tiles[tileIndex];
      if (tile === undefined) continue;
      const distance = Math.hypot((tile.x + 0.5) * WORLD_POSITION_UNITS_PER_TILE - position.localX,
        (tile.y + 0.5) * WORLD_POSITION_UNITS_PER_TILE - position.localY);
      if (placement === undefined || distance < placement.distance) placement = {
        routeId: route.id, progress: Math.round(offset * FIXED_POINT / (route.path.length - 1)), distance,
      };
    }
    if (placement === undefined || placement.distance > 10_000) {
      throw new Error("Goat fixture lacks a real nearby human route segment");
    }
    listener.location = { kind: "route", routeId: placement.routeId, progress: placement.progress };
    assertWorldInvariants(world);
    listenerActorId = listener.identity.stableId;
    const physical = resolveResidentWorldPlacement(createWorldView(world), listener);
    if (physical === null) throw new Error("Goat fixture could not resolve its real human route place");
    const delta = worldPositionDelta(position, physical.position);
    expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(10_000);
  }
  for (const point of [position, bearPosition]) {
    const tile = view.terrain.tiles[Math.floor(point.localY / WORLD_POSITION_UNITS_PER_TILE)
      * WORLD_WIDTH + Math.floor(point.localX / WORLD_POSITION_UNITS_PER_TILE)];
    if (point.region.x !== 0 || point.region.y !== 0 || tile === undefined
      || tile.terrain === "ridge" || tile.waterDepth > ADRIFT_STAND_DEPTH
      || tile.roughness >= 650_000
      || coreWildlifeTraversabilityCell("domestic-goat", tile).access !== "open"
      || coreWildlifeTraversabilityCell("brown-bear", tile).access !== "open") {
      throw new Error("Goat fixture needs unchanged shared safe meadow footing");
    }
  }
  let core = requireCurrentCoreEcology(envelope);
  const goats = core.populations.find(({ species }) => species === "domestic-goat")?.members;
  const group = core.groups.groups.find(({ identity }) => identity.stableId === custody.memberGroupId);
  if (goats === undefined || goats.length !== 2 || group === undefined) {
    throw new Error("Goat fixture omitted its finite generated herd");
  }
  expect(goats.map(({ actor }) => actor.identity.stableId).sort())
    .toEqual([...custody.memberActorIds].sort());
  for (const { actor } of goats) core = replaceCoreEcologyAggregatePatchActor(core,
    repositionCoreWildlifeActor(actor, {
      atTick: core.updatedAtTick, position, heading: headingFromRadians(0),
    }));
  // Coarse herd addresses are dormant history; current group anchors own
  // ordinary rematerialization. Keep the same finite herd and its topology at
  // the staged pen, rather than forcing materialization or observations.
  const anchoredGroup = reconcileCoreEcologyGroupAnchors(group, {
    atTick: core.updatedAtTick,
    componentAnchors: group.components.map(({ componentId }) => ({ componentId, anchor: position })),
    rendezvousAnchor: position,
  });
  if (anchoredGroup === null) throw new Error("Goat fixture could not retain its physical herd anchors");
  const anchoredCore = canonicalizeCoreEcologyAggregatePatch({
    ...core,
    groups: createCoreEcologyGroupSet(core.groups.groups.map((candidate) => (
      candidate.identity.stableId === group.identity.stableId ? anchoredGroup : candidate
    ))),
  });
  if (anchoredCore === null) throw new Error("Goat fixture could not retain its conserved herd");
  core = anchoredCore;
  const regional = requireRegionalEcology(envelope.regionalEcology);
  expect(regional.root.legacyCohort).toBeNull();
  const native = createCoreEcologyRegionalResidentPatchForRoot({
    seed: world.meta.rootSeed, root: regional.root, region: createRegionCoord(-6, -24),
  });
  const bear = native?.populations.find(({ species }) => species === "brown-bear")?.members[0]?.actor;
  if (native === null || bear === undefined) throw new Error("Goat fixture omitted its real native bear");
  expect(native.derivation.kind).toBe("regional-habitat-v1");
  expect(native.patchKey).toBe("regional-habitat-v1:eb39097919c23ecf");
  const bearPatch = options.threat === false ? native : replaceCoreEcologyAggregatePatchActor(native,
    repositionCoreWildlifeActor(bear, {
      atTick: native.updatedAtTick, position: bearPosition, heading: headingFromRadians(Math.PI),
    }));
  const root = putRegionalEcologyResidentDeviation(regional.root, {
    rootSeed: world.meta.rootSeed, patch: bearPatch,
  });
  const entrants = regionalEcologyRegionalResidentsForActiveRegions(root, world.meta.rootSeed,
    regional.activeRegions);
  if (entrants === null) throw new Error("Goat fixture could not admit its native resident by residence");
  const retained = new Map(regional.activeResidents.map((resident) => [resident.sourceKey, resident]));
  const activeResidents = entrants.map((entrant): RegionalEcologyActiveResidentInput => ({
    kind: "regional-habitat", sourceKey: entrant.sourceKey,
    patch: retained.get(entrant.sourceKey)?.patch ?? entrant.patch,
  }));
  expect(activeResidents.some(({ sourceKey }) => sourceKey === native.patchKey))
    .toBe(options.threat !== false);
  const prepared = withCurrentEnvelopeFields(withCurrentSettlementHomeCore(record, core, {
    root, activeResidents,
  }), { world: serializeWorld(world) });
  const repository = new MemoryRepository(withPlayerWitnessingWorldPosition(
    prepared, position, bearPosition, 800_000,
  ));
  const runtime = await createTideweftRuntime(repository);
  expect(runtime.getUIView().saveWarning).toBeUndefined();
  await runtime.save();
  const restored = requireRegionalEcology(savedEnvelope(repository).regionalEcology);
  const restoredBear = restored.activeResidents.find(({ sourceKey }) => sourceKey === native.patchKey)
    ?.patch.populations.find(({ species }) => species === "brown-bear")?.members[0]?.actor;
  if (options.threat !== false) expect(restoredBear?.address.position).toEqual(bearPosition);
  expect(requireCurrentCoreEcology(savedEnvelope(repository)).populations
    .find(({ species }) => species === "domestic-goat")?.members.map(({ actor }) => actor.address.position))
    .toEqual([position, position]);
  return {
    runtime, repository, memberActorIds: custody.memberActorIds,
    bearActorId: bear.identity.stableId, bearSourceKey: native.patchKey,
    initialSettlement: stableStringify(settlement), initialGroupId: group.identity.stableId,
    listenerActorId,
  };
}

describe("runtime settlement ecology integration", () => {
  it("routes finite current goat alarms from a real native bear through strong Voice and WAIT", async () => {
    const fixture = await createGoatAlarmRuntime();
    const { runtime, repository } = fixture;
    soundscapePlay.mockClear();
    runtime.dispatchUI({ type: "wait", action: "begin" });
    expect(runtime.getUIView().controls?.waitActive).toBe(true);
    advanceWaitFrames(runtime, 10);
    await runtime.save();
    const saved = savedEnvelope(repository);
    const core = requireCurrentCoreEcology(saved);
    const goats = core.populations.filter(({ species }) => species === "domestic-goat")
      .flatMap(({ members }) => members.map(({ actor }) => actor));
    expect(goats.map(({ identity }) => identity.stableId).sort())
      .toEqual([...fixture.memberActorIds].sort());
    expect(goats.every(({ intent, perception }) => intent.kind === "alarm"
      && perception.beliefs.some(({ subjectId, perceivedClass, sourceObservationId }) => (
        subjectId === fixture.bearActorId && perceivedClass === "large-predator"
        && sourceObservationId === intent.cause.referenceId
      )))).toBe(true);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-goat-alarm-bleat"))
      .toHaveLength(goats.length);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(runtime.getUIView().controls?.waitActive).toBe(false);
    const carry = saved.perceptionCarry as ChickenVoiceCarry;
    const admissions = carry.situatedExpressionAdmissions.records.filter((candidate) => (
      candidate.kind === "core-wildlife-alarm" && candidate.sourceSpecies === "domestic-goat"
    ));
    expect(admissions).toHaveLength(goats.length);
    for (const admission of admissions) expect(carry.actorVocalizationSamples[admission.sampleOrdinal])
      .toMatchObject({ soundClass: "animal-call", soundInterrupt: "strong", soundLoudness: 1_000_000 });
    expect(runtime.getRenderView().expressions?.some(({ sourceActorId, text }) => (
      fixture.memberActorIds.includes(sourceActorId) && text === "MAAA!"
    ))).toBe(true);
    expect(core.groups.groups.find(({ identity }) => identity.stableId === fixture.initialGroupId)
      ?.memberOrdinals).toEqual(goats.map(({ identity }) => identity.populationOrdinal));
    expect(deserializeSettlementEcologyState(saved.settlementEcology).domesticCustodies)
      .toEqual((JSON.parse(fixture.initialSettlement) as ReturnType<typeof deserializeSettlementEcologyState>)
        .domesticCustodies);
    const regional = requireRegionalEcology(saved.regionalEcology);
    const bearSources = regional.activeResidents.filter(({ sourceKey }) => sourceKey === fixture.bearSourceKey);
    expect(bearSources).toHaveLength(1);
    expect(bearSources[0]?.patch.originRegion).toEqual(createRegionCoord(-6, -24));
    expect(bearSources[0]?.patch.populations.find(({ species }) => species === "brown-bear")
      ?.members.map(({ actor }) => actor.identity.stableId)).toEqual([fixture.bearActorId]);
    expect(saved.version).toBe(50);
    expect((saved.perceptionCarry as { version: number }).version).toBe(14);
    runtime.destroy();
    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    await resumed.save();
    const reloaded = savedEnvelope(repository);
    expect(Object.keys(saved).filter((key) => key !== "session" && key !== "integrity"
      && stableStringify(reloaded[key]) !== stableStringify(saved[key]))).toEqual([]);
    const beforeSession = saved.session as Record<string, unknown>;
    const afterSession = reloaded.session as Record<string, unknown>;
    // The current loader intentionally begins a new session and announces its
    // continuation. World/physical/perception roots above remain byte-exact;
    // only the explicitly reinitialized session fields are excluded here.
    const restartFields = new Set([
      "sessionStartedTick", "sessionPlayMilliseconds", "sessionBaseline", "announcement", "nextAnnouncementId",
    ]);
    expect(Object.keys(beforeSession).filter((key) => (
      !restartFields.has(key) && stableStringify(beforeSession[key]) !== stableStringify(afterSession[key])
    ))).toEqual([]);
    expect(afterSession.sessionStartedTick).toBe(deserializeWorld(String(saved.world)).meta.completedTick);
    expect(afterSession.sessionPlayMilliseconds).toBe(0);
    expect(soundscapePlay.mock.calls.filter(([cue]) => (
      cue === "vocalization-goat-alarm-bleat" || cue === "wildlife-alarm"
    ))).toEqual([]);
    resumed.destroy();
    const forgedCarry = structuredClone(carry);
    const forgedRepository = new MemoryRepository(withCurrentEnvelopeFields(repository.snapshot(), {
      perceptionCarry: {
        ...forgedCarry,
        situatedExpressionAdmissions: {
          ...forgedCarry.situatedExpressionAdmissions,
          records: forgedCarry.situatedExpressionAdmissions.records.map((record) => (
            record.kind === "core-wildlife-alarm" && record.sourceSpecies === "domestic-goat"
              ? { ...record, sourceSpecies: "gull" as const } : record
          )),
        },
      },
    }));
    const untouched = stableStringify(forgedRepository.snapshot());
    const rejected = await createTideweftRuntime(forgedRepository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    await expect(rejected.save()).rejects.toThrow("Choose a seed before replacing");
    expect(stableStringify(forgedRepository.snapshot())).toBe(untouched);
    rejected.destroy();
  }, 60_000);

  it("interrupts actual REST through the real goat bleat without generic duplicate audio", async () => {
    const { runtime } = await createGoatAlarmRuntime();
    runtime.dispatchUI({ type: "recover", action: "begin" });
    expect(runtime.getUIView().controls).toMatchObject({ recoveryActive: true, recoveryKind: "rest" });
    soundscapePlay.mockClear();
    advanceWaitFrames(runtime, 1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-goat-alarm-bleat"))
      .toHaveLength(2);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(runtime.getUIView().controls?.recoveryActive).toBe(false);
    runtime.destroy();
  }, 60_000);

  it.each([false, true])("preserves exact anonymous goat hearing and audio at T+1 (optional refusal=%s)", async (saturated) => {
    let runtime: TideweftRuntime | null = null;
    const actualReduction = situatedExpressionChannels.reduceSituatedExpressionChannelBank;
    // Refuse only optional presentation, not an acoustic cause, observation,
    // population, physical action or listener. Real channel capacity is tested
    // by its own owner; this boundary proves lawful downstream hearing survives.
    const refused = saturated ? vi.spyOn(situatedExpressionChannels, "reduceSituatedExpressionChannelBank")
      .mockImplementation((bankValue, intent, reception) => {
        if (typeof intent === "object" && intent !== null && "meaning" in intent
          && intent.meaning === "domestic-goat-alarm-call") return {
          accepted: false, reason: "channel-capacity-reached", event: null,
          bank: situatedExpressionChannels.canonicalizeSituatedExpressionChannelBank(bankValue),
        };
        return actualReduction(bankValue, intent, reception);
      }) : null;
    try {
      const fixture = await createGoatAlarmRuntime({ humanListener: true });
      runtime = fixture.runtime;
      soundscapePlay.mockClear();
      runtime.dispatchUI({ type: "wait", action: "begin" });
      advanceWaitFrames(runtime, 10);
      expect(runtime.getUIView().controls?.waitActive).toBe(false);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-goat-alarm-bleat"))
        .toHaveLength(fixture.memberActorIds.length);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
      await runtime.save();
      const saved = savedEnvelope(fixture.repository);
      const carry = saved.perceptionCarry as ChickenVoiceCarry;
      const admissions = carry.situatedExpressionAdmissions.records.filter((record) => (
        record.kind === "core-wildlife-alarm" && record.sourceSpecies === "domestic-goat"
      ));
      expect(admissions).toHaveLength(saturated ? 0 : fixture.memberActorIds.length);
      if (saturated) {
        expect(carry.actorVocalizationSamples.some(({ sourceActorId }) => (
          fixture.memberActorIds.includes(sourceActorId)
        ))).toBe(false);
        expect(carry.situatedExpressionChannels.channels.some(({ sourceActorId }) => (
          fixture.memberActorIds.includes(sourceActorId)
        ))).toBe(false);
      }
      const sourceWorld = deserializeWorld(String(saved.world));
      const sourceGoats = requireCurrentCoreEcology(saved).populations
        .find(({ species }) => species === "domestic-goat")?.members.map(({ actor }) => actor);
      if (sourceGoats === undefined) throw new Error("Goat hearing fixture lost its finite source");
      // The same resident's existing route location establishes physical range;
      // only the ensuing ordinary simulation may create a hearing receipt.
      const view = createWorldView(sourceWorld);
      const listener = sourceWorld.residents.find(({ identity }) => (
        identity.stableId === fixture.listenerActorId
      ));
      if (listener === undefined) throw new Error("Goat pen lacks a genuine nearby human listener");
      const placement = resolveResidentWorldPlacement(view, listener);
      if (placement === null) throw new Error("Goat listener lost its physical route place");
      const distance = worldPositionDelta(placement.position, sourceGoats[0]!.address.position);
      expect(Math.hypot(distance.x, distance.y)).toBeLessThanOrEqual(10_000);
      const targetTick = sourceWorld.meta.completedTick + 1;
      // Refusal enters the same bounded physical-hearing owner as other world
      // sounds, not the former porter-only ecology leg. Preserve exact event
      // identity, anonymous class/strength and one receipt per real bleat.
      const expectedIds = saturated ? sourceGoats.map(({ identity, intent }) => {
        const eventHash = hashCanonical({
          domain: "core-wildlife-alarm-physical:v1",
          eventId: `${identity.stableId}:e:${intent.enteredAtTick.toString(36)}:alarm`,
          sourceActorId: identity.stableId,
          species: identity.species,
        });
        return `hp-h-${targetTick}-${listener.id}-cap-${eventHash}`;
      }) : admissions.map(({ sampleOrdinal }) => {
        const sample = carry.actorVocalizationSamples[sampleOrdinal];
        if (sample === undefined) throw new Error("Goat admission omitted its acoustic sample");
        return `hp-h-${targetTick}-${listener.id}-${sample.id}`;
      });
      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      soundscapePlay.mockClear();
      runtime = await createTideweftRuntime(fixture.repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-goat-alarm-bleat"))
        .toEqual([]);
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const world = deserializeWorld(String(savedEnvelope(fixture.repository).world));
      expect(world.meta.completedTick, runtime.getUIView().announcement?.message).toBe(targetTick);
      const heard = world.residents.find(({ identity }) => identity.stableId === listener.identity.stableId)
        ?.perception.beliefs.filter(({ sourceObservationId }) => expectedIds.includes(sourceObservationId)) ?? [];
      expect(heard.map(({ sourceObservationId }) => sourceObservationId).sort()).toEqual(expectedIds.sort());
      for (const belief of heard) expect(belief).toMatchObject({
        channel: "hearing", perceivedClass: "animal-call", identification: "anonymous", subjectId: null,
        firstObservedTick: targetTick, lastObservedTick: targetTick, strongInterrupt: true,
      });
      const animalHearing = world.residents.find(({ identity }) => identity.stableId === listener.identity.stableId)
        ?.perception.beliefs.filter(({ channel, lastObservedTick, perceivedClass, strongInterrupt }) => (
          channel === "hearing" && lastObservedTick === targetTick
          && perceivedClass === "animal-call" && strongInterrupt
        )) ?? [];
      expect(animalHearing).toHaveLength(heard.length);
    } finally {
      runtime?.destroy();
      scheduledFrame = undefined;
      refused?.mockRestore();
    }
  }, 120_000);

  it("removing the displaced real bear removes the goat alarm without deleting its native source", async () => {
    const fixture = await createGoatAlarmRuntime({ threat: false });
    const { runtime, repository } = fixture;
    soundscapePlay.mockClear();
    runtime.dispatchUI({ type: "wait", action: "begin" });
    advanceWaitFrames(runtime, 10);
    await runtime.save();
    const saved = savedEnvelope(repository);
    const goats = requireCurrentCoreEcology(saved).populations
      .find(({ species }) => species === "domestic-goat")?.members.map(({ actor }) => actor);
    expect(goats?.map(({ identity }) => identity.stableId).sort())
      .toEqual([...fixture.memberActorIds].sort());
    expect(goats?.every(({ intent, perception }) => intent.kind !== "alarm"
      && !perception.beliefs.some(({ subjectId }) => subjectId === fixture.bearActorId))).toBe(true);
    expect(soundscapePlay.mock.calls.filter(([cue]) => (
      cue === "vocalization-goat-alarm-bleat" || cue === "wildlife-alarm"
    ))).toEqual([]);
    expect(runtime.getUIView().controls?.waitActive).toBe(true);
    const regional = requireRegionalEcology(saved.regionalEcology);
    expect(regional.activeResidents.some(({ sourceKey }) => sourceKey === fixture.bearSourceKey)).toBe(false);
    const native = createCoreEcologyRegionalResidentPatchForRoot({
      seed: deserializeWorld(String(saved.world)).meta.rootSeed,
      root: regional.root, region: createRegionCoord(-6, -24),
    });
    expect(native?.patchKey).toBe(fixture.bearSourceKey);
    expect(native?.populations.find(({ species }) => species === "brown-bear")?.members
      .map(({ actor }) => actor.identity.stableId)).toEqual([fixture.bearActorId]);
    runtime.destroy();
  }, 60_000);

  it("routes generated chicken alarms through soft Voice without legacy playback, WAIT interruption or reload replay", async () => {
    const fixture = await createChickenAlarmRuntime();
    const { runtime, repository } = fixture;
    soundscapePlay.mockClear();
    runtime.dispatchUI({ type: "wait", action: "begin" });
    expect(runtime.getUIView().controls?.waitActive).toBe(true);
    advanceWaitFrames(runtime, 10);
    await runtime.save();
    const saved = savedEnvelope(repository);
    const core = requireCurrentCoreEcology(saved);
    const alarms = core.populations.filter(({ species }) => species === "domestic-chicken")
      .flatMap(({ members }) => members.map(({ actor }) => actor))
      .filter(({ intent }) => intent.kind === "alarm");
    expect(alarms.length).toBeGreaterThan(0);
    expect(alarms.every(({ identity }) => fixture.memberActorIds.includes(identity.stableId))).toBe(true);
    expect(alarms.every(({ perception }) => perception.beliefs.some(({ subjectId, perceivedClass }) => (
      subjectId === fixture.guardianActorId && perceivedClass === "predator"
    )))).toBe(true);
    const calls = soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-chicken-alarm-squawk");
    expect(calls).toHaveLength(alarms.length);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(runtime.getUIView().controls?.waitActive).toBe(true);
    expect(runtime.getUIView().announcement?.message ?? "").not.toContain("ANIMAL ALARM");
    expect(runtime.getRenderView().expressions?.some(({ sourceActorId, text }) => (
      fixture.memberActorIds.includes(sourceActorId) && text === "SQUAWK."
    ))).toBe(true);
    const carry = saved.perceptionCarry as {
      situatedExpressionAdmissions: { records: Array<{ kind: string; sourceSpecies?: string; sourceActorId: string; sampleOrdinal: number }> };
      actorVocalizationSamples: Array<{ soundClass: string; soundInterrupt: string; soundLoudness: number }>;
    };
    const admissions = carry.situatedExpressionAdmissions.records.filter(({ kind, sourceSpecies }) => (
      kind === "core-wildlife-alarm" && sourceSpecies === "domestic-chicken"
    ));
    expect(admissions).toHaveLength(alarms.length);
    for (const admission of admissions) expect(carry.actorVocalizationSamples[admission.sampleOrdinal])
      .toMatchObject({ soundClass: "animal-call", soundInterrupt: "none", soundLoudness: 420_000 });
    const durableCarry = stableStringify(saved.perceptionCarry);
    runtime.destroy();
    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    await resumed.save();
    expect(stableStringify(savedEnvelope(repository).perceptionCarry)).toBe(durableCarry);
    expect(soundscapePlay.mock.calls.filter(([cue]) => (
      cue === "vocalization-chicken-alarm-squawk" || cue === "wildlife-alarm"
    ))).toEqual([]);
    resumed.destroy();
    const wrongSpecies = structuredClone(saved.perceptionCarry) as ChickenVoiceCarry;
    const forged = {
      ...wrongSpecies,
      situatedExpressionAdmissions: {
        ...wrongSpecies.situatedExpressionAdmissions,
        records: wrongSpecies.situatedExpressionAdmissions.records.map((record) => (
          record.kind === "core-wildlife-alarm" && record.sourceSpecies === "domestic-chicken"
            ? { ...record, sourceSpecies: "gull" as const } : record
        )),
      },
    };
    const forgedRepository = new MemoryRepository(withCurrentEnvelopeFields(
      repository.snapshot(), { perceptionCarry: forged },
    ));
    const untouched = stableStringify(forgedRepository.snapshot());
    const rejected = await createTideweftRuntime(forgedRepository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    await expect(rejected.save()).rejects.toThrow("Choose a seed before replacing");
    expect(stableStringify(forgedRepository.snapshot())).toBe(untouched);
    rejected.destroy();
  }, 60_000);

  it("re-sources the chicken alarm to a remaining real cat rather than an absent guardian", async () => {
    const { runtime, repository, guardianActorId } = await createChickenAlarmRuntime(
      createTideweftRuntime, { threat: false },
    );
    soundscapePlay.mockClear();
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const core = requireCurrentCoreEcology(savedEnvelope(repository));
    const chickens = core.populations.filter(({ species }) => species === "domestic-chicken")
      .flatMap(({ members }) => members.map(({ actor }) => actor));
    expect(chickens.every(({ perception }) => !perception.beliefs.some(({ subjectId }) => (
      subjectId === guardianActorId
    )))).toBe(true);
    // Removing one predator is not removing every causal input. This seed also
    // contains a real cat; the same world must notice that remaining threat.
    expect(chickens.every(({ intent, perception }) => intent.kind === "alarm"
      && perception.beliefs.some(({ subjectId, sourceObservationId, perceivedClass }) => (
        subjectId?.startsWith("CAT-v1-") && perceivedClass === "predator"
        && sourceObservationId === intent.cause.referenceId
      )))).toBe(true);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-chicken-alarm-squawk"))
      .toHaveLength(chickens.length);
    runtime.destroy();
  }, 60_000);

  it.each(["unseen", "unheard"] as const)("keeps a real %s chicken alarm knowledge-honest", async (observer) => {
    const { runtime, repository, memberActorIds } = await createChickenAlarmRuntime(
      createTideweftRuntime, { observer },
    );
    soundscapePlay.mockClear();
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const chickens = requireCurrentCoreEcology(savedEnvelope(repository)).populations
      .filter(({ species }) => species === "domestic-chicken")
      .flatMap(({ members }) => members.map(({ actor }) => actor));
    expect(chickens.some(({ intent }) => intent.kind === "alarm")).toBe(true);
    expect(runtime.getRenderView().expressions?.some(({ sourceActorId }) => memberActorIds.includes(sourceActorId)))
      .toBe(false);
    const calls = soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-chicken-alarm-squawk");
    if (observer === "unseen") {
      expect(calls.length).toBeGreaterThan(0);
      const carry = savedEnvelope(repository).perceptionCarry as ChickenVoiceCarry;
      const sourceChannels = carry.situatedExpressionChannels.channels.filter(({ sourceActorId }) => (
        memberActorIds.includes(sourceActorId)
      ));
      expect(sourceChannels.length).toBeGreaterThan(0);
      expect(sourceChannels.every(({ reception }) => reception?.kind === "heard-unseen")).toBe(true);
      const caption = runtime.getUIView().expressionCaption;
      // The single caption arbiter may prefer a genuine nearby impact over this
      // quiet call. When selected, the bird remains anonymous; its receipt and
      // committed audio survive either outcome.
      if (caption?.animalCallKind === "bird-call") expect(caption).toMatchObject({
        speakerLabel: "A bird", text: "CALL.", assertive: false,
      });
      expect(JSON.stringify(caption)).not.toMatch(/chicken|SQUAWK|predator|custody/iu);
    } else {
      expect(calls).toEqual([]);
      expect(runtime.getUIView().expressionCaption?.animalCallKind).not.toBe("chicken-call");
    }
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    runtime.destroy();
  }, 60_000);

  it("keeps actual REST active through a chicken call", async () => {
    const { runtime } = await createChickenAlarmRuntime();
    runtime.dispatchUI({ type: "recover", action: "begin" });
    expect(runtime.getUIView().controls).toMatchObject({ recoveryActive: true, recoveryKind: "rest" });
    soundscapePlay.mockClear();
    advanceWaitFrames(runtime, 1);
    expect(soundscapePlay.mock.calls.some(([cue]) => cue === "vocalization-chicken-alarm-squawk")).toBe(true);
    expect(runtime.getUIView().controls).toMatchObject({ recoveryActive: true, recoveryKind: "rest" });
    runtime.destroy();
  }, 60_000);

  it("keeps a real sleeping courier asleep and current reload cannot invent chicken hearing", async () => {
    const { runtime, repository, memberActorIds } = await createChickenAlarmRuntime(
      createTideweftRuntime, { observer: "sleep" },
    );
    expect(runtime.getUIView().controls).toMatchObject({ canRecover: true, recoveryKind: "sleep" });
    runtime.dispatchUI({ type: "recover", action: "begin" });
    soundscapePlay.mockClear();
    advanceWaitFrames(runtime, 1);
    expect(runtime.getUIView().controls).toMatchObject({ recoveryActive: true, recoveryKind: "sleep" });
    await runtime.save();
    const saved = savedEnvelope(repository);
    const carry = saved.perceptionCarry as ChickenVoiceCarry;
    expect(carry.intervalStartWasSleeping).toBe(true);
    expect(carry.situatedExpressionAdmissions.records.some((record) => (
      record.kind === "core-wildlife-alarm" && record.sourceSpecies === "domestic-chicken"
    ))).toBe(true);
    const channels = carry.situatedExpressionChannels.channels.filter(({ sourceActorId }) => (
      memberActorIds.includes(sourceActorId)
    ));
    expect(channels.length).toBeGreaterThan(0);
    expect(channels.every(({ reception, state }) => reception === null && state.active?.audioAcknowledged === true))
      .toBe(true);
    expect(soundscapePlay.mock.calls.filter(([cue]) => (
      cue === "vocalization-chicken-alarm-squawk" || cue === "wildlife-alarm"
    ))).toEqual([]);
    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    await resumed.save();
    expect(stableStringify(savedEnvelope(repository).perceptionCarry)).toBe(stableStringify(saved.perceptionCarry));
    resumed.dispatchUI({ type: "recover", action: "cancel" });
    expect(resumed.getRenderView().expressions?.some(({ sourceActorId }) => memberActorIds.includes(sourceActorId)))
      .toBe(false);
    resumed.destroy();
  }, 90_000);


  it.each([false, true])("preserves anonymous keeper hearing and chicken audio at T+1 (optional capacity refusal=%s)", async (saturated) => {
    let runtime: TideweftRuntime | null = null;
    const actualReduction = situatedExpressionChannels.reduceSituatedExpressionChannelBank;
    // A contract fixture at the optional presentation boundary, not a fake
    // physical event or listener. Keep one module/receipt-custody instance.
    // The channel-bank suite separately proves the real sixteen-channel cap.
    const refused = saturated ? vi.spyOn(situatedExpressionChannels, "reduceSituatedExpressionChannelBank")
      .mockImplementation((bankValue, intent, reception) => {
        if (typeof intent === "object" && intent !== null && "meaning" in intent
          && intent.meaning === "domestic-chicken-alarm-call") {
          return {
            accepted: false, reason: "channel-capacity-reached", event: null,
            bank: situatedExpressionChannels.canonicalizeSituatedExpressionChannelBank(bankValue),
          };
        }
        return actualReduction(bankValue, intent, reception);
      }) : null;
    try {
      const factory = createTideweftRuntime;
      const fixture = await createChickenAlarmRuntime(factory, { observer: "store" });
      runtime = fixture.runtime;
      soundscapePlay.mockClear();
      runtime.dispatchUI({ type: "wait", action: "begin" });
      advanceWaitFrames(runtime, 10);
      expect(runtime.getUIView().controls?.waitActive).toBe(true);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-chicken-alarm-squawk"))
        .toHaveLength(fixture.memberActorIds.length);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
      await runtime.save();
      const saved = savedEnvelope(fixture.repository);
      const carry = saved.perceptionCarry as ChickenVoiceCarry;
      const admissions = carry.situatedExpressionAdmissions.records.filter((record) => (
        record.kind === "core-wildlife-alarm" && record.sourceSpecies === "domestic-chicken"
      ));
      expect(admissions).toHaveLength(saturated ? 0 : fixture.memberActorIds.length);
      if (saturated) {
        expect(carry.actorVocalizationSamples).toEqual([]);
        expect(carry.situatedExpressionChannels.channels.some(({ sourceActorId }) => (
          fixture.memberActorIds.includes(sourceActorId)
        ))).toBe(false);
      }
      const store = deserializeSettlementEcologyState(saved.settlementEcology);
      const beforeWorld = deserializeWorld(String(saved.world));
      const keeper = beforeWorld.residents.find(({ identity }) => identity.stableId === store.identity.keeperActorId);
      if (keeper === undefined) throw new Error("Generated chicken fixture omitted its keeper");
      const placement = resolveResidentWorldPlacement(createWorldView(beforeWorld), keeper);
      if (placement === null) throw new Error("Keeper lacks actual physical placement");
      const distance = worldPositionDelta(store.identity.position, placement.position);
      expect(Math.hypot(distance.x, distance.y)).toBeLessThan(2_000);
      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      soundscapePlay.mockClear();
      runtime = await factory(fixture.repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-chicken-alarm-squawk")).toEqual([]);
      runtime.dispatchUI({ type: "wait", action: "cancel" });
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const afterWorld = deserializeWorld(String(savedEnvelope(fixture.repository).world));
      const hearing = afterWorld.residents.find(({ identity }) => identity.stableId === keeper.identity.stableId)
        ?.perception.beliefs.filter((belief) => belief.channel === "hearing"
          && belief.lastObservedTick === afterWorld.meta.completedTick
          && (belief.perceivedClass === "animal-call" || belief.perceivedClass === "animal-alarm")) ?? [];
      expect(hearing, runtime.getUIView().announcement?.message).toHaveLength(fixture.memberActorIds.length);
      expect(new Set(hearing.map(({ sourceObservationId }) => sourceObservationId)).size).toBe(hearing.length);
      for (const belief of hearing) expect(belief).toMatchObject({
        perceivedClass: "animal-call", identification: "anonymous", subjectId: null, strongInterrupt: false,
      });
    } finally {
      runtime?.destroy();
      scheduledFrame = undefined;
      refused?.mockRestore();
    }
  }, 120_000);

  it("routes one ecology-owned frog chorus through shared actor hearing and Living Voice", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "shared chorus belongs to the acoustic world",
      posture: "gale",
      sessionShape: "wander",
    });
    await source.save();
    source.destroy();

    const sourceRecord = sourceRepository.snapshot();
    const sourceEnvelope = savedEnvelope(sourceRepository);
    const sourceWorld = deserializeWorld(String(sourceEnvelope.world));
    const sourcePlayer = structuredClone(sourceEnvelope.player) as PlayerState;
    const sourceTravel = restorePlayerRegionalTravel(
      sourceWorld.meta.rootSeed,
      sourcePlayer,
      String(sourceEnvelope.regionalTravel),
    );
    const sourceBio0 = deserializeBio0Ecology(sourceEnvelope.bio0Ecology);
    const chorusSource = requireRegionalEcology(sourceEnvelope.regionalEcology)
      .activeResidents.find(({ patch }) => patch.aggregatePopulations.some(({ species }) => (
        species === "southern-leopard-frog"
      )));
    const frogs = chorusSource?.patch.aggregatePopulations.find(({ species }) => (
      species === "southern-leopard-frog"
    ));
    const representative = frogs === undefined
      ? undefined
      : [...frogs.anchors]
          .filter(({ populationUnits }) => populationUnits > 0)
          .sort((left, right) => (
            right.populationUnits - left.populationUnits
            || left.anchorOrdinal - right.anchorOrdinal
          ))[0];
    if (sourceTravel === null || sourceBio0 === null || frogs === undefined
      || representative === undefined) {
      throw new Error("shared-chorus fixture omitted its current ecology authority");
    }
    const startingPlayerPosition = playerWorldPositionInRegionalWindow(
      sourceTravel.window,
      sourcePlayer,
    );
    if (startingPlayerPosition === null) {
      throw new Error("shared-chorus fixture omitted the player's world position");
    }
    const sourceView = createRegionalWorldView(
      createWorldView(sourceWorld),
      sourceTravel.window,
      { discovered: sourcePlayer.discovered, depthSoundings: sourcePlayer.depthSoundings },
    );
    const safeListener = sourceView.terrain.tiles.flatMap((tile, tileIndex) => {
      if (
        tile.terrain === "ridge"
        || tile.waterDepth > ADRIFT_STAND_DEPTH
        || tile.roughness >= 650_000
      ) return [];
      const address = regionalAddressAt(sourceView, tileIndex);
      if (
        address === null
        || regionKey(address.region) !== regionKey(startingPlayerPosition.region)
      ) return [];
      const position = createWorldPosition(
        address.region,
        address.localX * WORLD_POSITION_UNITS_PER_TILE
          + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
        address.localY * WORLD_POSITION_UNITS_PER_TILE
          + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
      );
      let distance: number;
      try {
        distance = Math.max(...frogs.anchors
          .filter(({ populationUnits }) => populationUnits > 0)
          .map(({ position: anchorPosition }) => {
            const delta = worldPositionDelta(position, anchorPosition);
            return Math.hypot(delta.x, delta.y);
          }));
      } catch {
        return [];
      }
      return distance <= 24 * WORLD_POSITION_UNITS_PER_TILE
        ? [{ distance, position }]
        : [];
    }).sort((left, right) => left.distance - right.distance)[0];
    if (safeListener === undefined) {
      throw new Error("shared-chorus fixture found no safe nearby listener footing");
    }
    expect(safeListener.distance).toBeLessThanOrEqual(8 * WORLD_POSITION_UNITS_PER_TILE);
    const ticksUntilChorus = CORE_ECOLOGY_CHORUS_CADENCE_TICKS
      - sourceWorld.meta.completedTick % CORE_ECOLOGY_CHORUS_CADENCE_TICKS;
    const chorusTick = sourceWorld.meta.completedTick + ticksUntilChorus;

    // The core rain/activity contract is covered independently. This fixture
    // holds the acoustic listener's weather clear while injecting that already
    // authenticated aggregate stimulus, isolating only the runtime bridge.
    settlementShadowsHarness.forceRainIntensity = 900_000;
    sourceWorld.weather = {
      ...sourceWorld.weather,
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: chorusTick + CORE_ECOLOGY_CHORUS_CADENCE_TICKS,
    };
    assertWorldInvariants(sourceWorld);
    const stagedRoots = withCurrentEnvelopeFields(sourceRecord, {
      world: serializeWorld(sourceWorld),
    });
    const staged = withPlayerWitnessingWorldPosition(
      stagedRoots,
      safeListener.position,
      representative.position,
    );
    const repository = new MemoryRepository(staged);
    const perceptionSpy = vi.spyOn(humanPerception, "collectExistingHumanObservations");
    const dogHearingSpy = vi.spyOn(
      dogPhysicalAcoustics,
      "collectDogPhysicalAcousticObservationBatches",
    );
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    soundscapePlay.mockClear();

    advancePlayerSteps(
      runtime,
      ticksUntilChorus * 10,
    );
    await runtime.save();
    const chorusEnvelope = savedEnvelope(repository);
    expect(deserializeWorld(String(chorusEnvelope.world)).meta.completedTick).toBe(chorusTick);
    const committedFrogs = requireRegionalEcology(chorusEnvelope.regionalEcology)
      .activeResidents.flatMap(({ patch }) => patch.aggregatePopulations)
      .find(({ aggregateId }) => aggregateId === frogs.aggregateId);
    expect(committedFrogs?.activitySignal).toMatchObject({
      kind: "rain-chorus",
      intensity: expect.any(Number),
      updatedAtTick: chorusTick,
    });
    expect(committedFrogs?.activitySignal.intensity).toBeGreaterThanOrEqual(180_000);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "frog-chorus"))
      .toHaveLength(1);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "Sound",
      text: "chorus",
      presentationKind: "animal-call",
      animalCallKind: "chorus",
      assertive: false,
    });
    expect(runtime.getUIView().expressionCaption).not.toHaveProperty("position");
    expect(JSON.stringify(runtime.getUIView().expressionCaption)).not.toMatch(
      /frog|aggregate|sourceId/iu,
    );
    expect(runtime.getUIView().announcement?.message ?? "").not.toMatch(/chorus/iu);
    expect((runtime.getRenderView().acousticText ?? []).some(({ text }) => (
      text === "chorus"
    ))).toBe(false);

    const committedRecord = repository.snapshot();

    // Ephemeral playback/labels are not saved and never replay on load.
    soundscapePlay.mockClear();
    const reloadedRepository = new MemoryRepository(committedRecord);
    const reloaded = await createTideweftRuntime(reloadedRepository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay).not.toHaveBeenCalled();
    expect(reloaded.getUIView().expressionCaption).toBeUndefined();
    expect((reloaded.getRenderView().acousticText ?? []).some(({ text }) => (
      text === "chorus"
    ))).toBe(false);
    // On the next interval after reload, the same committed cadence event is
    // deterministically re-derived into bounded anonymous human and dog
    // hearing without replaying its player-facing sound.
    soundscapePlay.mockClear();
    advancePlayerSteps(reloaded, 10);
    const chorusHumanInputs = perceptionSpy.mock.calls.flatMap(([input]) => (
      (input.physicalSoundSamples ?? []).filter(({ soundClass }) => (
        soundClass === "animal-call"
      ))
    ));
    expect(chorusHumanInputs).toEqual([
      expect.objectContaining({
        sourceId: expect.stringMatching(/^ecology-aggregate-source:/u),
        soundClass: "animal-call",
        soundInterrupt: "none",
      }),
    ]);
    expect(chorusHumanInputs[0]).not.toHaveProperty("sourceActorId");
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "frog-chorus"))
      .toHaveLength(0);
    const chorusDogInputs = dogHearingSpy.mock.calls.flatMap(([input]) => (
      input.physicalSoundSamples.filter(({ soundClass }) => soundClass === "animal-call")
    ));
    expect(chorusDogInputs).toEqual([
      expect.objectContaining({
        sourceId: expect.stringMatching(/^ecology-aggregate-source:/u),
        soundClass: "animal-call",
        soundInterrupt: "none",
      }),
    ]);
    // This generated dog is outside the lawful reception range. Feeding the
    // shared bounded hearing bridge must not fabricate a belief at a distance.
    await reloaded.save();
    const distantDog = deserializeBio0Ecology(
      savedEnvelope(reloadedRepository).bio0Ecology,
    )?.dog;
    expect(distantDog?.perception.beliefs).not.toContainEqual(expect.objectContaining({
      channel: "hearing",
      perceivedClass: "animal-call",
    }));
    reloaded.destroy();
    runtime.destroy();
    dogHearingSpy.mockRestore();
    perceptionSpy.mockRestore();
  }, 180_000);

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
    const startingTick = world.meta.completedTick;
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
    expect(advancedWorld.meta.completedTick).toBe(startingTick + 1);
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
    const preparedEnvelope = JSON.parse(preparedRecord.worldJson) as Record<string, unknown>;
    const sleepingWorld = deserializeWorld(String(preparedEnvelope.world));
    const caretakerIndex = sleepingWorld.residents.findIndex(({ identity }) => (
      identity.stableId === custody.caretakerActorId
    ));
    const sleepingCaretaker = sleepingWorld.residents[caretakerIndex];
    const restDestinationId = sleepingCaretaker === undefined
      ? null
      : residentHomeRestDestinationId(
          sleepingCaretaker.identity.stableId,
          sleepingCaretaker.homeSettlementId,
        );
    if (
      sleepingCaretaker === undefined
      || restDestinationId === null
      || sleepingCaretaker.location.kind !== "settlement"
      || sleepingCaretaker.location.settlementId !== sleepingCaretaker.homeSettlementId
      || sleepingCaretaker.activeContractId !== null
    ) throw new Error("recovery fixture could not bind the sleeping caretaker at home");
    sleepingWorld.residents[caretakerIndex] = replaceResidentCircadian(sleepingCaretaker, {
      atTick: sleepingWorld.meta.completedTick,
      circadian: {
        version: LIVING_CIRCADIAN_VERSION,
        ownerId: LIVING_CIRCADIAN_OWNER_ID,
        policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
        restDestinationId,
        restDestinationArrived: true,
        posture: {
          state: "asleep",
          enteredAtTick: sleepingWorld.meta.completedTick,
        },
      },
    });
    assertWorldInvariants(sleepingWorld);
    const repository = new MemoryRepository(withCurrentEnvelopeFields(preparedRecord, {
      world: serializeWorld(sleepingWorld),
    }));
    const runtime = await createTideweftRuntime(repository);
    // The harness presents current direct goat images to the raw collector.
    // Final sim admission removes them while the keeper is asleep, so the
    // secondary recovery system cannot bypass cognition and notice the split.
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const sleepingRecovery = deserializeSettlementDomesticAnimalRecoveryState(
      savedEnvelope(repository).settlementDomesticAnimalRecovery,
    );
    expect(sleepingRecovery?.currentCase?.phase).toBe("unnoticed");

    // Day-active projection lawfully wakes the same keeper after that tick;
    // the next admitted direct sight may then advance the existing case.
    advancePlayerSteps(runtime, 10);
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
  }, 45_000);

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
    expect(record.payloadVersion).toBe(50);
    expect(envelope.version).toBe(50);
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
      "playerExpressionRecency",
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

  it("voices the committed store closure once through shared Living Voice authority", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "one keeper reply in the acoustic world",
      posture: "gale",
      sessionShape: "wander",
    });

    soundscapePlay.mockClear();
    runtime.dispatchUI({ type: "interact" });

    const replyLabels = (runtime.getRenderView().acousticText ?? []).filter(({ text }) => (
      text === "Storehouse door's barred."
    ));
    expect(replyLabels).toHaveLength(1);
    expect(replyLabels[0]).toMatchObject({
      acousticKind: "speech",
      sourceKind: "human",
      text: "Storehouse door's barred.",
    });
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-steady"))
      .toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "ui")).toHaveLength(0);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      text: "Storehouse door's barred.",
      presentationKind: "speech",
    });

    await runtime.save();
    const saved = savedEnvelope(repository);
    const settlement = deserializeSettlementEcologyState(saved.settlementEcology);
    const carry = saved.perceptionCarry as {
      version: number;
      actorVocalizationSamples: Array<Record<string, unknown>>;
      animalContactAcousticCarry: unknown;
      situatedExpressionAdmissions: { records: Array<Record<string, unknown>> };
      situatedExpressionChannels: {
        channels: Array<{
          sourceActorId: string;
          reception: Record<string, unknown> | null;
          state: { active: Record<string, unknown> | null };
        }>;
      };
    };
    expect(carry.version).toBe(14);
    expect(carry.situatedExpressionAdmissions.records).toEqual([
      expect.objectContaining({
        kind: "settlement-keeper-store-response",
        sourceActorId: settlement.identity.keeperActorId,
        storeId: settlement.identity.storeId,
        closureTransactionId: settlement.lastClosureTransactionId,
        sourceEvidenceId: settlement.keeperKnowledge[0]?.evidenceId,
        respondedAtTick: deserializeWorld(String(saved.world)).meta.completedTick,
        hearingCertainty: expect.any(Number),
      }),
    ]);
    expect(carry.actorVocalizationSamples).toEqual([
      expect.objectContaining({
        sourceActorId: settlement.identity.keeperActorId,
        soundClass: "human-vocalization",
        soundInterrupt: "none",
      }),
    ]);
    expect(carry.situatedExpressionChannels.channels).toEqual([
      expect.objectContaining({
        sourceActorId: settlement.identity.keeperActorId,
        reception: expect.objectContaining({ kind: "heard-visible" }),
        state: expect.objectContaining({
          active: expect.objectContaining({
            meaning: "keeper-secure-store-response",
            knowledgeBasis: "self-committed-store-closure",
            audioAcknowledged: true,
          }),
        }),
      }),
    ]);
    const savedRecord = repository.snapshot();
    runtime.destroy();

    const tamperedCarry = structuredClone(carry);
    const tamperedAdmission = tamperedCarry.situatedExpressionAdmissions.records[0];
    if (tamperedAdmission === undefined) {
      throw new Error("keeper reply fixture omitted its admission");
    }
    tamperedAdmission.hearingCertainty = Number(tamperedAdmission.hearingCertainty) - 1;
    const rejected = await createTideweftRuntime(new MemoryRepository(
      withCurrentEnvelopeFields(savedRecord, { perceptionCarry: tamperedCarry }),
    ));
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();

    soundscapePlay.mockClear();
    const reloaded = await createTideweftRuntime(repository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay).not.toHaveBeenCalled();
    expect((reloaded.getRenderView().acousticText ?? []).filter(({ text }) => (
      text === "Storehouse door's barred."
    ))).toHaveLength(1);
    await reloaded.save();
    expect(soundscapePlay).not.toHaveBeenCalled();
    reloaded.destroy();

    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumedPending = await createTideweftRuntime(repository);
    expect(resumedPending.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay).not.toHaveBeenCalled();
    expect((resumedPending.getRenderView().acousticText ?? []).filter(({ text }) => (
      text === "Storehouse door's barred."
    ))).toHaveLength(1);
    advancePlayerSteps(resumedPending, 10);
    await resumedPending.save();
    expect(soundscapePlay).not.toHaveBeenCalled();
    const consumed = savedEnvelope(repository);
    const consumedWorld = deserializeWorld(String(consumed.world));
    const factHolders = consumedWorld.residents.filter(({ perception }) => (
      perception.beliefs.some(({ perceivedClass }) => (
        perceivedClass === "store-secured-report"
      ))
    ));
    expect(factHolders.length).toBeGreaterThan(0);
    expect(factHolders.length).toBeLessThanOrEqual(
      humanPerception.HUMAN_PERCEPTION_MAX_RESIDENTS - 1,
    );
    expect(consumedWorld.residents.every(({ perception }) => (
      perception.beliefs.length <= ACTOR_BELIEF_CAP
    ))).toBe(true);
    expect(factHolders.some(({ identity }) => (
      identity.stableId === settlement.identity.keeperActorId
    ))).toBe(false);
    const learnedFacts = factHolders.flatMap(({ perception }) => (
      perception.beliefs.filter(({ perceivedClass }) => (
        perceivedClass === "store-secured-report"
      ))
    ));
    expect(learnedFacts).toHaveLength(factHolders.length);
    for (const fact of learnedFacts) {
      expect(fact).toMatchObject({
        channel: "hearing",
        perceivedClass: "store-secured-report",
        subjectId: null,
        identification: "anonymous",
        firstObservedTick: consumedWorld.meta.completedTick,
        lastObservedTick: consumedWorld.meta.completedTick,
        strongInterrupt: false,
      });
      expect(fact.confidence)
        .toBeGreaterThanOrEqual(SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE);
      expect(fact.area.radiusUnits).toBeGreaterThanOrEqual(250);
      expect(fact).not.toHaveProperty("quantity");
      expect(JSON.stringify(fact)).not.toContain(settlement.identity.keeperActorId);
      expect(JSON.stringify(fact)).not.toContain(settlement.identity.storeId);
      expect(JSON.stringify(fact)).not.toContain(String(settlement.lastClosureTransactionId));
      expect(JSON.stringify(fact)).not.toContain(String(
        settlement.keeperKnowledge[0]?.evidenceId,
      ));
      expect(JSON.stringify(fact)).not.toContain(humanPerception.LOCAL_PLAYER_SUBJECT_ID);
      expect(JSON.stringify(fact)).not.toContain("fresh-produce");
      expect(JSON.stringify(fact)).not.toContain("rat");
      expect(consumedWorld.residents.some(({ perception }) => (
        perception.beliefs.some((belief) => (
          belief.sourceObservationId === fact.sourceObservationId
          && belief.perceivedClass === "human-vocalization"
        ))
      ))).toBe(false);
    }
    const consumedCarry = consumed.perceptionCarry as typeof carry;
    expect(consumedCarry.actorVocalizationSamples).toEqual([]);
    expect(consumedCarry.situatedExpressionAdmissions.records).toEqual([]);
    const learnedFactReceipts = learnedFacts.map((fact) => ({
      sourceObservationId: fact.sourceObservationId,
      firstObservedTick: fact.firstObservedTick,
      lastObservedTick: fact.lastObservedTick,
    }));
    resumedPending.destroy();

    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumedAfterReceipt = await createTideweftRuntime(repository);
    expect(resumedAfterReceipt.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay).not.toHaveBeenCalled();
    advancePlayerSteps(resumedAfterReceipt, 10);
    await resumedAfterReceipt.save();
    expect(soundscapePlay).not.toHaveBeenCalled();
    const afterReplayWindow = deserializeWorld(String(savedEnvelope(repository).world));
    const replayedFacts = afterReplayWindow.residents.flatMap(({ perception }) => (
      perception.beliefs.filter(({ perceivedClass }) => (
        perceivedClass === "store-secured-report"
      ))
    ));
    expect(replayedFacts.map((fact) => ({
      sourceObservationId: fact.sourceObservationId,
      firstObservedTick: fact.firstObservedTick,
      lastObservedTick: fact.lastObservedTick,
    }))).toEqual(learnedFactReceipts);
    resumedAfterReceipt.destroy();
  });

  it("migrates released v32 store state without inventing speech, fences future knowledge and preserves retired Voice records", async () => {
    const sourceRepository = new MemoryRepository();
    const source = await createTideweftRuntime(sourceRepository);
    source.dispatchUI({
      type: "new-world",
      seed: "v40 store closure has no retroactive voice",
      posture: "gale",
      sessionShape: "wander",
    });
    source.dispatchUI({ type: "interact" });
    await source.save();
    source.destroy();

    const currentRecord = sourceRepository.snapshot();
    const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
    const currentCarry = structuredClone(current.perceptionCarry) as Record<string, unknown>;
    const {
      intervalStartWasSleeping: _futureIntervalStartWasSleeping,
      playerStepStateAnchor: _futurePlayerStepStateAnchor,
      playerStepStateSamples: _futurePlayerStepStateSamples,
      ...v8CurrentCarry
    } = currentCarry;
    const { integrity: _currentIntegrity, playerExpressionRecency: _futurePlayerExpressionRecency, ...currentFields } = current;
    const honestV32Base = {
      ...currentFields,
      version: 32,
      // Released v32 already owns recovery/timeAction; only Voice is absent.
      player: structuredClone(current.player as PlayerState),
      perceptionCarry: legacyPlayerPerceptionCarry(currentCarry),
    };
    const honestRepository = new MemoryRepository({
      ...currentRecord,
      payloadVersion: 32,
      updatedAt: currentRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...honestV32Base,
        integrity: gameSaveEnvelopeIntegrity(honestV32Base),
      }),
    });
    soundscapePlay.mockClear();
    const migrated = await createTideweftRuntime(honestRepository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay).not.toHaveBeenCalled();
    expect((migrated.getRenderView().acousticText ?? []).some(({ text }) => (
      text === "Storehouse door's barred."
    ))).toBe(false);
    advancePlayerSteps(migrated, 10);
    await migrated.save();
    const migratedEnvelope = savedEnvelope(honestRepository);
    expect(migratedEnvelope.version).toBe(50);
    expect(migratedEnvelope.perceptionCarry).toMatchObject({
      version: 14,
      actorVocalizationSamples: [],
      situatedExpressionAdmissions: { records: [] },
      situatedExpressionChannels: { channels: [] },
    });
    expect(deserializeWorld(String(migratedEnvelope.world)).residents.some(({ perception }) => (
      perception.beliefs.some(({ perceivedClass }) => (
        perceivedClass === "store-secured-report"
      ))
    ))).toBe(false);
    migrated.destroy();

    const smuggledWorld = deserializeWorld(String(current.world));
    const smuggledResident = smuggledWorld.residents[0];
    if (smuggledResident === undefined) {
      throw new Error("v32 semantic-smuggling fixture needs a resident");
    }
    const forgedObservationTick = smuggledResident.perception.tick + 1;
    const forgedObservation = createActorObservation({
      id: "OBS-v32-future-secured-store-report",
      observerId: smuggledResident.identity.stableId,
      observedAtTick: forgedObservationTick,
      channel: "hearing",
      perceivedClass: "store-secured-report",
      subjectId: null,
      area: {
        center: createWorldPosition(createRegionCoord(0, 0), 500, 500),
        radiusUnits: 250,
      },
      confidence: 500_000,
      salience: 500_000,
      identification: "anonymous",
      interrupt: "none",
    });
    const learnedFutureReport = forgedObservation === null
      ? null
      : stepActorPerception(
          createActorPerceptionState(
            smuggledResident.identity.stableId,
            smuggledResident.perception.tick,
          ),
          { tick: forgedObservationTick, observations: [forgedObservation] },
        );
    if (learnedFutureReport === null || learnedFutureReport.beliefs.length !== 1) {
      throw new Error("v32 semantic-smuggling fixture could not form its forged belief");
    }
    smuggledWorld.residents[0] = {
      ...smuggledResident,
      perception: {
        ...learnedFutureReport,
        tick: smuggledResident.perception.tick,
        beliefs: learnedFutureReport.beliefs.map((belief) => ({
          ...belief,
          firstObservedTick: smuggledResident.perception.tick,
          lastObservedTick: smuggledResident.perception.tick,
        })),
        salientMemory: [],
      },
    };
    const smuggledV32Base = {
      ...honestV32Base,
      world: serializeWorld(smuggledWorld),
    };
    const smuggledV32Record: SaveRecord = {
      ...currentRecord,
      payloadVersion: 32,
      updatedAt: currentRecord.updatedAt + 2,
      worldJson: JSON.stringify({
        ...smuggledV32Base,
        integrity: gameSaveEnvelopeIntegrity(smuggledV32Base),
      }),
    };
    const smuggledV32Repository = new MemoryRepository(smuggledV32Record);
    const rejectedFutureBelief = await createTideweftRuntime(smuggledV32Repository);
    expect(rejectedFutureBelief.getUIView().saveWarning?.message)
      .toBe("LOCAL AUTOSAVE UNREADABLE");
    expect(smuggledV32Repository.snapshot()).toEqual(smuggledV32Record);
    rejectedFutureBelief.destroy();

    for (const [index, historical] of [
      { outerVersion: 40, carryVersion: 8, keepsAnimalContactCarry: true },
      { outerVersion: 39, carryVersion: 7, keepsAnimalContactCarry: false },
      { outerVersion: 34, carryVersion: 3, keepsAnimalContactCarry: false },
    ].entries()) {
      const {
        animalContactAcousticCarry: _futureAnimalContactCarry,
        ...preContactCarry
      } = v8CurrentCarry;
      const forgedCarry = historical.keepsAnimalContactCarry
        ? { ...v8CurrentCarry, version: historical.carryVersion }
        : { ...preContactCarry, version: historical.carryVersion };
      const forgedHistoricalBase = {
        ...currentFields,
        version: historical.outerVersion,
        perceptionCarry: forgedCarry,
      };
      const retiredRecord: SaveRecord = {
        ...currentRecord,
        payloadVersion: historical.outerVersion,
        updatedAt: currentRecord.updatedAt + 3 + index,
        worldJson: JSON.stringify({
          ...forgedHistoricalBase,
          integrity: gameSaveEnvelopeIntegrity(forgedHistoricalBase),
        }),
      };
      await expectRetiredVoiceSaveUntouched(retiredRecord);
    }
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
    expect(migratedRecord.payloadVersion).toBe(50);
    expect(migratedEnvelope.version).toBe(50);
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
  }, 30_000);

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

    const currentRecord = sourceRepository.snapshot();
    const currentEnvelope = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
    const v16Record = asStorehouseV16Record(currentRecord);
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
    expect(migratedRecord.payloadVersion).toBe(50);
    expect(migratedEnvelope.version).toBe(50);
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
    expect(migratedEnvelope.player).toEqual({
      ...(v16Envelope.player as Record<string, unknown>),
      timeAction: null,
    });
    for (const field of [
      "world",
      "fieldResources",
      "traversalFeedback",
      "physicalCargo",
      "regionalTravel",
      "promiseJourney",
      "bio0Ecology",
      "porterResponse",
      "livingActorPlayerChoice",
    ]) {
      expect(migratedEnvelope[field], field).toEqual(v16Envelope[field]);
    }
    // Historical store closure is authoritative; speech that was never emitted is not.
    expect(migratedEnvelope.perceptionCarry).toEqual({
      ...(currentEnvelope.perceptionCarry as Record<string, unknown>),
      actorVocalizationSamples: [],
      situatedExpressionAdmissions: { version: 1, records: [] },
      situatedExpressionChannels: { version: 1, channels: [] },
    });

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
  }, 30_000);

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
    expect(migratedRecord.payloadVersion).toBe(50);
    expect(migratedEnvelope.version).toBe(50);
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
  }, 45_000);

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
    expect(migratedRecord.payloadVersion).toBe(50);
    expect(migratedEnvelope.version).toBe(50);
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
    expect(migratedEnvelope.player).toEqual({
      ...(v18Envelope.player as Record<string, unknown>),
      timeAction: null,
    });
    for (const field of [
      "world",
      "fieldResources",
      "traversalFeedback",
      "physicalCargo",
      "regionalTravel",
      "promiseJourney",
      "bio0Ecology",
      "porterResponse",
      "livingActorPlayerChoice",
    ]) {
      expect(migratedEnvelope[field], field).toEqual(v18Envelope[field]);
    }
    expect(migratedEnvelope.perceptionCarry).toEqual(currentEnvelope.perceptionCarry);

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
  }, 30_000);

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
    expect(migratedRecord.payloadVersion).toBe(50);
    expect(migratedEnvelope.version).toBe(50);
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
  }, 30_000);

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
      playerExpressionRecency: _futurePlayerExpressionRecency,
      settlementDomesticAnimalRecovery: _settlementDomesticAnimalRecovery,
      ...currentFields
    } = current;
    const disguised = {
      ...currentFields,
      player: legacyPlayerWithoutTimeAction(current.player as PlayerState),
      perceptionCarry: legacyPlayerPerceptionCarry(current.perceptionCarry),
      version: 19,
    };
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
    const baselineTick = deserializeWorld(String(baselineEnvelope.world)).meta.completedTick;
    const transitionTick = baselineTick + 1;
    const activityTick = baselineTick + 2;
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
      observedAtTick: transitionTick,
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
      createActorPerceptionState(assignment.workerActorId, baselineTick),
      { tick: transitionTick, observations: [alarm] },
    );
    const handlerAtOne = stepActorPerception(
      createActorPerceptionState(assignment.handlerActorId, baselineTick),
      { tick: transitionTick, observations: [] },
    );
    if (workerAtOne === null || handlerAtOne === null) {
      throw new Error("dual-pending cognition could not advance");
    }
    const investigation = stageSettlementWorkingAnimalActivity(initial, {
      assignmentId: assignment.assignmentId,
      tick: transitionTick,
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
        tick: transitionTick,
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
    const workerAtTwo = stepActorPerception(workerAtOne, {
      tick: activityTick,
      observations: [],
    });
    if (workerAtTwo === null) throw new Error("dual-pending worker cognition did not age");
    const pendingActivity = stageSettlementWorkingAnimalActivity(pendingTask.state, {
      assignmentId: assignment.assignmentId,
      tick: activityTick,
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
    soundscapePlay.mockClear();
    advancePlayerSteps(runtime, 10);
    expect(guardianPerceptionHarness.observationId).not.toBeNull();
    expect(runtime.getUIView().saveWarning).toMatchObject({
      message: "SIMULATION PAUSED SAFELY",
    });
    await runtime.save();
    const after = savedEnvelope(repository);
    expect(after.dogActorRoster).toBe(before.dogActorRoster);
    expect(after.settlementWorkingAnimals).toBe(before.settlementWorkingAnimals);
    expect((after.perceptionCarry as Record<string, unknown>).animalContactAcousticCarry)
      .toEqual((before.perceptionCarry as Record<string, unknown>).animalContactAcousticCarry);
    expect(deserializeWorld(String(after.world)).meta.completedTick).toBe(
      deserializeWorld(String(before.world)).meta.completedTick,
    );
    expect(soundscapePlay.mock.calls.filter(([cue]) => (
      cue === "impact" || cue === "stumble" || cue === "sweep"
    ))).toEqual([]);
    runtime.destroy();
  });

  it("keeps an unheard warning world-only, preserves recovery, and rejects a forged receipt", async () => {
    const setupRepository = new MemoryRepository();
    const setup = await createTideweftRuntime(setupRepository);
    setup.dispatchUI({
      type: "new-world",
      seed: "guardian boundary replay d",
      posture: "gale",
      sessionShape: "wander",
    });
    await setup.save();
    setup.destroy();

    const seamRecord = withPlayerAtEastSeam(
      setupRepository.snapshot(),
      800_000,
    );
    const repository = new MemoryRepository(seamRecord);
    const runtime = await createTideweftRuntime(repository);
    const before = savedEnvelope(repository);
    const roster = deserializeDogActorRoster(before.dogActorRoster);
    const work = deserializeSettlementWorkingAnimalState(before.settlementWorkingAnimals);
    const guardian = roster?.actors[0];
    const assignment = work?.assignments[0];
    if (guardian === undefined || assignment === undefined) {
      throw new Error("unheard guardian fixture omitted its work relationship");
    }
    guardianPerceptionHarness.observerId = guardian.identity.stableId;
    guardianPerceptionHarness.handlerId = assignment.handlerActorId;
    guardianPerceptionHarness.mode = "reachable";

    const recoveryControls = runtime.getUIView().controls;
    if (recoveryControls?.canRecover !== true || recoveryControls.recoveryKind !== "rest") {
      throw new Error(`unheard guardian recovery blocked: ${recoveryControls?.recoveryHint ?? "missing controls"}`);
    }
    runtime.dispatchUI({ type: "recover", action: "begin" });
    expect(runtime.getRenderView().player.recoveryKind).toBe("rest");
    advanceWaitFrames(runtime, 1);
    await runtime.save();
    const committedRecord = repository.snapshot();
    const committed = savedEnvelope(repository);
    const carry = committed.perceptionCarry as {
      intervalStartPosition: WorldPosition;
      intervalStartFacingMilliRadians: number;
      playerStepsSinceWorldTick: number;
      playerSenseSamples: unknown[];
      playerStepStateAnchor: {
        version: number;
        sampleOrdinal: number;
        stamina: number;
        mode: PlayerState["mode"];
      };
      actorVocalizationSamples: Array<Record<string, unknown> & {
        position: WorldPosition;
      }>;
      animalContactAcousticCarry: {
        version: number;
        records: Array<{
          beforePosition: WorldPosition;
          event: WorldAcousticEvent;
        }>;
      };
      situatedExpressionChannels: {
        channels: Array<{
          sourceActorId: string;
          reception: unknown;
          state: { active: null | Record<string, unknown> };
        }>;
      };
    };
    const dogChannel = carry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    );
    expect(carry.actorVocalizationSamples).toEqual([
      expect.objectContaining({
        sourceActorId: guardian.identity.stableId,
        soundClass: "animal-alarm",
        soundInterrupt: "strong",
      }),
    ]);
    expect(dogChannel).toMatchObject({
      sourceActorId: guardian.identity.stableId,
      reception: null,
      state: {
        active: {
          meaning: "guardian-dog-warning",
          audioAcknowledged: true,
        },
      },
    });
    const guardianContact = carry.animalContactAcousticCarry.records.find(
      ({ event }) => event.sourceId === guardian.identity.stableId,
    );
    expect(guardianContact).toMatchObject({
      beforePosition: guardian.address.position,
      event: {
        sourceId: guardian.identity.stableId,
      },
    });
    expect(guardianContact?.event.sourcePosition).not.toEqual(
      guardianContact?.beforePosition,
    );
    if (guardianContact === undefined) {
      throw new Error("unheard guardian fixture omitted its committed contact");
    }
    expect(runtime.getRenderView().acousticText?.some((label) => (
      label.acousticKind === "physical"
      && label.sourceId === guardian.identity.stableId
    ))).toBe(false);
    expect(soundscapePlay.mock.calls.some(([cue]) => (
      cue === "impact" || cue === "stumble" || cue === "sweep"
    ))).toBe(false);
    expect(runtime.getRenderView().expressions ?? []).toEqual([]);
    expect(runtime.getUIView().expressionCaption).toBeUndefined();
    expect((committed.player as PlayerState).timeAction).toMatchObject({ kind: "rest" });
    runtime.destroy();

    // v35/carry-v4 owned warning barks, but is now an intentionally retired
    // unpublished Voice format. Its nonempty interval must remain untouched.
    const { integrity: _currentIntegrity, playerExpressionRecency: _futurePlayerExpressionRecency, ...committedFields } = committed;
    const committedCarry = committed.perceptionCarry as Readonly<Record<string, unknown>>;
    expect(committedCarry.version).toBe(14);
    const {
      animalContactAcousticCarry: _currentAnimalContactCarry,
      intervalStartWasSleeping: _currentIntervalStartWasSleeping,
      playerStepStateAnchor: _currentPlayerStepStateAnchor,
      playerStepStateSamples: _currentPlayerStepStateSamples,
      ...v7CommittedCarry
    } = committedCarry;
    const v35Base = {
      ...committedFields,
      version: 35,
      perceptionCarry: { ...v7CommittedCarry, version: 4 },
    };
    const v35WarningRecord: SaveRecord = {
      ...committedRecord,
      payloadVersion: 35,
      updatedAt: committedRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v35Base,
        integrity: gameSaveEnvelopeIntegrity(v35Base),
      }),
    };
    await expectRetiredVoiceSaveUntouched(v35WarningRecord);

    // Keep the bark's cause and identity intact while coherently staging its
    // physical source inside the trailing strip. Event identity is cause-bound;
    // dog address, event position, and world-sound position still move as one.
    const boundaryRoster = deserializeDogActorRoster(committed.dogActorRoster);
    const boundaryWork = deserializeSettlementWorkingAnimalState(
      committed.settlementWorkingAnimals,
    );
    const boundaryGuardian = boundaryRoster?.actors.find(({ identity }) => (
      identity.stableId === guardian.identity.stableId
    ));
    if (boundaryRoster === null || boundaryWork === null || boundaryGuardian === undefined) {
      throw new Error("unheard guardian boundary fixture lost its source authorities");
    }
    const boundaryWorld = deserializeWorld(String(committed.world));
    const boundaryPlayer = structuredClone(committed.player) as PlayerState;
    const boundaryTravel = restorePlayerRegionalTravel(
      boundaryWorld.meta.rootSeed,
      boundaryPlayer,
      String(committed.regionalTravel),
    );
    if (boundaryTravel === null) {
      throw new Error("unheard guardian boundary fixture lost regional authority");
    }
    const boundaryView = createRegionalWorldView(
      createWorldView(boundaryWorld),
      boundaryTravel.window,
      {
        discovered: boundaryPlayer.discovered,
        depthSoundings: boundaryPlayer.depthSoundings,
      },
    );
    const boundarySourceTileIndex = Math.floor(REGIONAL_TRAVEL_ROWS / 2)
      * REGIONAL_TRAVEL_COLUMNS + 8;
    const boundarySourceAddress = regionalAddressAt(
      boundaryView,
      boundarySourceTileIndex,
    );
    if (boundarySourceAddress === null) {
      throw new Error("unheard guardian boundary fixture lost its trailing-strip address");
    }
    const boundarySourcePosition = createWorldPosition(
      boundarySourceAddress.region,
      boundarySourceAddress.localX * WORLD_POSITION_UNITS_PER_TILE
        + WORLD_POSITION_UNITS_PER_TILE / 2,
      boundarySourceAddress.localY * WORLD_POSITION_UNITS_PER_TILE
        + WORLD_POSITION_UNITS_PER_TILE / 2,
    );
    let trailingGuardian = repositionDogActor(boundaryGuardian, {
      atTick: boundaryWorld.meta.completedTick,
      heading: boundaryGuardian.address.heading,
      position: boundarySourcePosition,
    });
    if (trailingGuardian.circadian !== undefined) {
      const boundarySettlement = deserializeSettlementEcologyState(
        committed.settlementEcology,
      );
      const boundaryAssignment = boundaryWork.assignments.find(({ workerActorId }) => (
        workerActorId === trailingGuardian.identity.stableId
      ));
      const boundaryCustody = boundarySettlement.domesticCustodies.find(({ relationshipId }) => (
        relationshipId === boundaryAssignment?.workerCustodyRelationshipId
      ));
      if (boundaryAssignment === undefined || boundaryCustody === undefined) {
        throw new Error("unheard guardian boundary fixture lost its routine authority");
      }
      const kennelDelta = worldPositionDelta(
        trailingGuardian.address.position,
        boundaryCustody.homeStructure.position,
      );
      const kennelArrived = kennelDelta.x * kennelDelta.x + kennelDelta.y * kennelDelta.y
        <= boundaryCustody.homeStructure.radiusUnits
          * boundaryCustody.homeStructure.radiusUnits;
      const projection = projectSettlementWorkingDogCircadian({
        dog: trailingGuardian,
        custody: boundaryCustody,
        assignment: boundaryAssignment,
        atTick: trailingGuardian.updatedAtTick,
        kennelArrived,
      });
      if (projection === null) {
        throw new Error("unheard guardian boundary fixture could not reproject its routine");
      }
      trailingGuardian = replaceDogActorCircadian(trailingGuardian, {
        atTick: trailingGuardian.updatedAtTick,
        circadian: projection.receipt,
      });
    }
    const trailingRoster = replaceDogActorInRoster(boundaryRoster, trailingGuardian);
    const boundaryCarry = structuredClone(carry);
    const trailingPlacement = livingActorAddressInRegionalWindow(
      trailingGuardian.address,
      boundaryTravel.window,
    );
    const trailingTile = trailingPlacement === null
      ? undefined
      : boundaryView.terrain.tiles[trailingPlacement.tileIndex];
    if (trailingTile === undefined) {
      throw new Error("unheard guardian boundary fixture left the starting window too early");
    }
    const originalContactDelta = worldPositionDelta(
      guardianContact.beforePosition,
      guardianContact.event.sourcePosition,
    );
    const boundaryBeforePosition = translateWorldPosition(
      trailingGuardian.address.position,
      -originalContactDelta.x,
      -originalContactDelta.y,
    );
    const boundaryDelta = worldPositionDelta(
      boundaryBeforePosition,
      trailingGuardian.address.position,
    );
    const boundaryMovement = animalContactMovementForDistance(Math.hypot(
      boundaryDelta.x,
      boundaryDelta.y,
    ));
    const boundaryTriggerEventId = animalContactAcousticTriggerEventId({
      sourceId: trailingGuardian.identity.stableId,
      beforePosition: boundaryBeforePosition,
      afterPosition: trailingGuardian.address.position,
      occurredAtTick: boundaryWorld.meta.completedTick,
    });
    const boundarySurfaceMaterial = trailingTile.waterDepth > 60_000
      || trailingTile.terrain === "deep-water"
      ? "water" as const
      : trailingTile.terrain === "marsh"
        ? "foliage" as const
        : trailingTile.terrain === "ridge"
          ? "stone" as const
          : trailingTile.terrain === "tidal-flat"
            ? "sand" as const
            : "soil" as const;
    const boundaryEvent = boundaryMovement === null || boundaryTriggerEventId === null
      ? null
      : animalContactAcousticEvent({
          triggerEventId: boundaryTriggerEventId,
          sourceId: trailingGuardian.identity.stableId,
          sourcePosition: trailingGuardian.address.position,
          occurredAtTick: boundaryWorld.meta.completedTick,
          bodySize: animalContactAcousticBodySizeForDogSize(
            trailingGuardian.identity.body.size,
          ),
          movement: boundaryMovement,
          surfaceMaterial: boundarySurfaceMaterial,
        });
    const boundaryContact = boundaryEvent === null
      ? null
      : createAnimalContactAcousticCarryRecord({
          beforePosition: boundaryBeforePosition,
          event: boundaryEvent,
        });
    if (boundaryContact === null) {
      throw new Error("unheard guardian boundary fixture could not move its contact cause");
    }
    boundaryCarry.animalContactAcousticCarry = {
      version: 1,
      records: [boundaryContact],
    };
    expect(canonicalizeAnimalContactAcousticCarry(
      boundaryCarry.animalContactAcousticCarry,
    )?.records).toHaveLength(1);
    const boundaryChannel = boundaryCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    );
    const boundarySample = boundaryCarry.actorVocalizationSamples.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    );
    if (
      trailingRoster === null
      || boundaryChannel?.state.active === null
      || boundaryChannel?.state.active === undefined
      || boundarySample === undefined
    ) throw new Error("unheard guardian boundary fixture lost its bark trajectory");
    boundaryChannel.state.active.position = trailingGuardian.address.position;
    boundarySample.position = trailingGuardian.address.position;
    const boundaryRebaseRow = Array.from(
      { length: REGIONAL_TRAVEL_SAFE_MAX_Y - REGIONAL_TRAVEL_SAFE_MIN_Y + 1 },
      (_, offset) => REGIONAL_TRAVEL_SAFE_MIN_Y + offset,
    ).find((row) => {
      const currentAddress = regionalAddressAt(
        boundaryView,
        row * REGIONAL_TRAVEL_COLUMNS + REGIONAL_TRAVEL_SAFE_MAX_X,
      );
      const currentTile = boundaryView.terrain.tiles[
        row * REGIONAL_TRAVEL_COLUMNS + REGIONAL_TRAVEL_SAFE_MAX_X
      ];
      const nextTile = boundaryView.terrain.tiles[
        row * REGIONAL_TRAVEL_COLUMNS + REGIONAL_TRAVEL_SAFE_MAX_X + 1
      ];
      return currentAddress?.region.y === boundaryTravel.stream.center.y
        && currentAddress.region.x !== boundaryTravel.stream.center.x
        && currentTile !== undefined
        && nextTile !== undefined
        && currentTile.terrain !== "ridge"
        && nextTile.terrain !== "ridge"
        && currentTile.waterDepth <= ADRIFT_STAND_DEPTH
        && nextTile.waterDepth <= ADRIFT_STAND_DEPTH
        && currentTile.roughness < 650_000
        && nextTile.roughness < 650_000;
    });
    if (boundaryRebaseRow === undefined) {
      throw new Error("unheard guardian boundary fixture found no safe rebase crossing");
    }
    const boundaryPlayerTileIndex = boundaryRebaseRow * REGIONAL_TRAVEL_COLUMNS
      + REGIONAL_TRAVEL_SAFE_MAX_X;
    boundaryPlayer.x = (REGIONAL_TRAVEL_SAFE_MAX_X + 1) * TILE_UNITS - 1;
    boundaryPlayer.y = boundaryRebaseRow * TILE_UNITS + Math.floor(TILE_UNITS / 2);
    boundaryPlayer.previousX = boundaryPlayer.x;
    boundaryPlayer.previousY = boundaryPlayer.y;
    boundaryPlayer.velocityX = 0;
    boundaryPlayer.velocityY = 0;
    boundaryPlayer.facingMilliRadians = 0;
    boundaryPlayer.stamina = FIXED_POINT;
    boundaryPlayer.stability = FIXED_POINT;
    boundaryPlayer.stabilityTrend = "steady";
    boundaryPlayer.stabilityHint = "Stable on sound footing";
    boundaryPlayer.pace = "steady";
    boundaryPlayer.mode = "foot";
    boundaryPlayer.timeAction = null;
    boundaryPlayer.sweepTicksRemaining = 0;
    boundaryPlayer.sweepTotalTicks = 0;
    boundaryPlayer.sweepPath = [];
    boundaryPlayer.sweepSupport = null;
    boundaryPlayer.currentTrace = [boundaryPlayerTileIndex];
    boundaryPlayer.surveyTrace = [boundaryPlayerTileIndex];
    if (
      boundaryCarry.playerStepsSinceWorldTick !== 0
      || boundaryCarry.playerSenseSamples.length !== 0
    ) {
      throw new Error("unheard guardian boundary fixture requires a phase-zero interval");
    }
    const boundaryPlayerPosition = playerWorldPositionInRegionalWindow(
      boundaryTravel.window,
      boundaryPlayer,
    );
    if (boundaryPlayerPosition === null) {
      throw new Error("unheard guardian boundary fixture lost its staged player position");
    }
    boundaryCarry.intervalStartPosition = boundaryPlayerPosition;
    boundaryCarry.intervalStartFacingMilliRadians = boundaryPlayer.facingMilliRadians;
    boundaryCarry.playerStepStateAnchor = {
      version: 1,
      sampleOrdinal: 0,
      stamina: boundaryPlayer.stamina,
      mode: boundaryPlayer.mode,
    };
    const boundaryCenterTransition = recenterRegionalPlayer(
      boundaryWorld.meta.rootSeed,
      boundaryTravel,
      boundaryPlayer,
    );
    if (!boundaryCenterTransition.crossed || boundaryCenterTransition.rebased) {
      throw new Error("unheard guardian boundary fixture could not stage its storage owner");
    }
    const boundaryRegionalTravel = serializePlayerRegionalTravel(
      capturePlayerRegionalTravel(boundaryCenterTransition.state, boundaryPlayer),
    );
    const boundaryCargoValidation = validatePhysicalCargoState(
      committed.physicalCargo,
      boundaryPlayer,
      WORLD_WIDTH,
      WORLD_HEIGHT,
    );
    if (!boundaryCargoValidation.valid || boundaryCargoValidation.state === null) {
      throw new Error("unheard guardian boundary fixture lost physical cargo authority");
    }
    const boundaryPhysicalCargo = snapshotPhysicalCargoState(
      transitionPhysicalCargoRegion(
        boundaryCargoValidation.state,
        boundaryCenterTransition.to,
        WORLD_WIDTH,
        WORLD_HEIGHT,
      ),
    );
    const boundaryRepository = new MemoryRepository(withCurrentEnvelopeFields(
      committedRecord,
      {
        player: boundaryPlayer,
        regionalTravel: boundaryRegionalTravel,
        physicalCargo: boundaryPhysicalCargo,
        dogActorRoster: serializeDogActorRoster(trailingRoster),
        perceptionCarry: boundaryCarry,
      },
    ));
    const boundaryRuntime = await createTideweftRuntime(boundaryRepository);
    expect(boundaryRuntime.getUIView().saveWarning).toBeUndefined();
    boundaryRuntime.dispatchRenderer({ type: "brace", active: false });
    boundaryRuntime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    boundaryRuntime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(boundaryRuntime, 1);
    boundaryRuntime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await boundaryRuntime.save();
    const rebasedRecord = boundaryRepository.snapshot();
    const rebasedEnvelope = savedEnvelope(boundaryRepository);
    const rebasedWorld = deserializeWorld(String(rebasedEnvelope.world));
    const rebasedTravel = restorePlayerRegionalTravel(
      rebasedWorld.meta.rootSeed,
      rebasedEnvelope.player as PlayerState,
      String(rebasedEnvelope.regionalTravel),
    );
    const rebasedRoster = deserializeDogActorRoster(rebasedEnvelope.dogActorRoster);
    const rebasedGuardian = rebasedRoster?.actors.find(({ identity }) => (
      identity.stableId === guardian.identity.stableId
    ));
    if (rebasedTravel === null || rebasedGuardian === undefined) {
      throw new Error("unheard guardian rebase fixture lost its physical authorities");
    }
    expect(rebasedTravel.stream.center).toEqual({ x: 1, y: 0 });
    expect(rebasedTravel.window.origin.x).not.toBe(boundaryTravel.window.origin.x);
    expect(livingActorAddressInRegionalWindow(
      rebasedGuardian.address,
      rebasedTravel.window,
    )).toBeNull();
    expect((rebasedEnvelope.perceptionCarry as typeof carry).actorVocalizationSamples)
      .toHaveLength(1);
    expect((rebasedEnvelope.perceptionCarry as typeof carry).animalContactAcousticCarry)
      .toEqual({ version: 1, records: [] });
    boundaryRuntime.destroy();
    const hearingFixtureWorld = deserializeWorld(String(committed.world));
    const hearingResident = hearingFixtureWorld.residents.at(-1);
    const routeCandidates = hearingFixtureWorld.routes.flatMap((route) => (
      route.path.map((tileIndex, offset) => {
        const position = createWorldPosition(
          { x: 0, y: 0 },
          (tileIndex % WORLD_WIDTH) * WORLD_POSITION_UNITS_PER_TILE
            + WORLD_POSITION_UNITS_PER_TILE / 2,
          Math.floor(tileIndex / WORLD_WIDTH) * WORLD_POSITION_UNITS_PER_TILE
            + WORLD_POSITION_UNITS_PER_TILE / 2,
        );
        const delta = worldPositionDelta(guardianContact.event.sourcePosition, position);
        return {
          route,
          offset,
          position,
          distance: Math.hypot(delta.x, delta.y),
        };
      })
    )).sort((left, right) => left.distance - right.distance);
    const nearestRoute = routeCandidates[0];
    if (hearingResident === undefined || nearestRoute === undefined) {
      throw new Error("unheard guardian fixture omitted a human/route hearing locus");
    }
    hearingResident.location = {
      kind: "route",
      routeId: nearestRoute.route.id,
      progress: nearestRoute.route.path.length <= 1
        ? 0
        : Math.round(
            nearestRoute.offset * FIXED_POINT / (nearestRoute.route.path.length - 1),
          ),
    };
    delete hearingResident.circadian;
    const hearingWind = worldPositionDelta(
      guardianContact.event.sourcePosition,
      nearestRoute.position,
    );
    const hearingWindDistance = Math.hypot(hearingWind.x, hearingWind.y);
    hearingFixtureWorld.weather.kind = "clear";
    hearingFixtureWorld.weather.intensity = 0;
    hearingFixtureWorld.weather.windX = Math.round(
      hearingWind.x / hearingWindDistance * FIXED_POINT,
    );
    hearingFixtureWorld.weather.windY = Math.round(
      hearingWind.y / hearingWindDistance * FIXED_POINT,
    );
    hearingFixtureWorld.weather.nextChangeTick = hearingFixtureWorld.meta.completedTick
      + WORLD_TICKS_PER_DAY;
    assertWorldInvariants(hearingFixtureWorld);
    const hearingRecord = withCurrentEnvelopeFields(committedRecord, {
      world: serializeWorld(hearingFixtureWorld),
    });
    const hearingRepository = new MemoryRepository(hearingRecord);
    const hearingSpy = vi.spyOn(humanPerception, "collectExistingHumanObservations");
    const reloaded = await createTideweftRuntime(hearingRepository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    expect(reloaded.getRenderView().player.recoveryKind).toBe("rest");
    advancePlayerSteps(reloaded, 10);
    await reloaded.save();
    const physicalIntervals = hearingSpy.mock.calls
      .map(([input]) => input.physicalSoundSamples ?? [])
      .filter((samples) => samples.some(({ acousticEventId }) => (
        acousticEventId === guardianContact?.event.eventId
      )));
    expect(physicalIntervals).toHaveLength(1);
    expect(physicalIntervals[0]).toContainEqual(expect.objectContaining({
      acousticEventId: guardianContact?.event.eventId,
      sourceId: guardian.identity.stableId,
      soundClass: guardianContact?.event.soundClass,
    }));
    const hearingWorld = deserializeWorld(String(savedEnvelope(hearingRepository).world));
    const contactBeliefs = hearingWorld.residents.flatMap(({ perception }) => (
      perception.beliefs.filter(({ perceivedClass }) => (
        perceivedClass === guardianContact?.event.soundClass
      ))
    ));
    expect(contactBeliefs.length).toBeGreaterThan(0);
    expect(contactBeliefs.every((belief) => (
      belief.channel === "hearing"
      && belief.identification === "anonymous"
      && belief.subjectId === null
      && belief.sourceObservationId.includes("-pac-")
    ))).toBe(true);
    advancePlayerSteps(reloaded, 10);
    await reloaded.save();
    expect(hearingSpy.mock.calls
      .map(([input]) => input.physicalSoundSamples ?? [])
      .filter((samples) => samples.some(({ acousticEventId }) => (
        acousticEventId === guardianContact?.event.eventId
      )))).toHaveLength(1);
    reloaded.destroy();

    const replacementRepository = new MemoryRepository(committedRecord);
    const replacement = await createTideweftRuntime(replacementRepository);
    replacement.dispatchUI({
      type: "new-world",
      seed: "replacement world clears pending contact",
      posture: "gale",
      sessionShape: "wander",
      restartPhrase: "restartrestartrestart",
    });
    await replacement.save();
    expect((savedEnvelope(replacementRepository).perceptionCarry as typeof carry)
      .animalContactAcousticCarry).toEqual({ version: 1, records: [] });
    replacement.destroy();

    const rebasedReload = await createTideweftRuntime(new MemoryRepository(rebasedRecord));
    expect(rebasedReload.getUIView().saveWarning).toBeUndefined();
    hearingSpy.mockClear();
    advancePlayerSteps(rebasedReload, 10);
    expect(hearingSpy.mock.calls.some(([input]) => (
      input.physicalSoundSamples?.some(({ acousticEventId }) => (
        acousticEventId === boundaryEvent?.eventId
      )) ?? false
    ))).toBe(false);
    await rebasedReload.save();
    rebasedReload.destroy();

    const forgedCarry = structuredClone(carry);
    const forgedDogChannel = forgedCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    );
    const forgedEvent = forgedDogChannel?.state.active;
    if (
      forgedDogChannel === undefined
      || forgedEvent === undefined
      || forgedEvent === null
      || typeof forgedEvent.eventId !== "string"
      || typeof forgedEvent.sourceActorId !== "string"
    ) throw new Error("unheard guardian fixture omitted its active expression identity");
    const forgedReceipt = createHeardUnseenSituatedExpressionReception(
      {
        eventId: forgedEvent.eventId,
        sourceActorId: forgedEvent.sourceActorId,
      },
      deserializeWorld(String(committed.world)).meta.completedTick,
      {
        bearing: { centerRadians: 0, uncertaintyRadians: Math.PI / 12 },
        distanceBand: { minimum: 1_000, maximum: 4_000 },
        certainty: 0.5,
      },
    );
    if (forgedReceipt === null) {
      throw new Error("unheard guardian fixture could not construct canonical forged evidence");
    }
    forgedDogChannel.reception = forgedReceipt;
    const tamperedRepository = new MemoryRepository(withCurrentEnvelopeFields(
      committedRecord,
      { perceptionCarry: forgedCarry },
    ));
    const rejected = await createTideweftRuntime(tamperedRepository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();

    const forgedSurfaceCarry = structuredClone(carry);
    const forgedSurfaceRecord = forgedSurfaceCarry.animalContactAcousticCarry.records.find(
      ({ event }) => event.sourceId === guardian.identity.stableId,
    );
    if (forgedSurfaceRecord === undefined) {
      throw new Error("unheard guardian fixture omitted its physical contact record");
    }
    const forgedDelta = worldPositionDelta(
      forgedSurfaceRecord.beforePosition,
      forgedSurfaceRecord.event.sourcePosition,
    );
    const forgedMovement = animalContactMovementForDistance(Math.hypot(
      forgedDelta.x,
      forgedDelta.y,
    ));
    const forgedSurface = forgedSurfaceRecord.event.surfaceMaterial === "water"
      ? "stone" as const
      : "water" as const;
    const forgedSurfaceEvent = forgedMovement === null
      ? null
      : animalContactAcousticEvent({
          triggerEventId: forgedSurfaceRecord.event.triggerEventId,
          sourceId: forgedSurfaceRecord.event.sourceId,
          sourcePosition: forgedSurfaceRecord.event.sourcePosition,
          occurredAtTick: forgedSurfaceRecord.event.occurredAtTick,
          bodySize: guardian.identity.body.size === "tiny"
              || guardian.identity.body.size === "small"
            ? "small"
            : guardian.identity.body.size === "medium"
              ? "medium"
              : "large",
          movement: forgedMovement,
          surfaceMaterial: forgedSurface,
        });
    if (forgedSurfaceEvent === null) {
      throw new Error("unheard guardian fixture could not forge canonical surface semantics");
    }
    forgedSurfaceRecord.event = forgedSurfaceEvent;
    expect(canonicalizeAnimalContactAcousticCarry(
      forgedSurfaceCarry.animalContactAcousticCarry,
    )).not.toBeNull();
    const forgedSurfaceRepository = new MemoryRepository(withCurrentEnvelopeFields(
      committedRecord,
      { perceptionCarry: forgedSurfaceCarry },
    ));
    const rejectedSurface = await createTideweftRuntime(forgedSurfaceRepository);
    expect(rejectedSurface.getUIView().saveWarning?.message).toBe(
      "LOCAL AUTOSAVE UNREADABLE",
    );
    rejectedSurface.destroy();

    const forgedPriorCarry = structuredClone(carry);
    const forgedPriorRecord = forgedPriorCarry.animalContactAcousticCarry.records.find(
      ({ event }) => event.sourceId === guardian.identity.stableId,
    );
    if (forgedPriorRecord === undefined) {
      throw new Error("unheard guardian fixture omitted its prior-position evidence");
    }
    const forgedPriorPosition = [
      [-500, 0],
      [500, 0],
      [0, -500],
      [0, 500],
    ].map(([x, y]) => translateWorldPosition(
      forgedPriorRecord.event.sourcePosition,
      x!,
      y!,
    )).find((candidate) => {
      const delta = worldPositionDelta(candidate, forgedPriorRecord.event.sourcePosition);
      return headingFromRadians(Math.atan2(delta.y, delta.x)) !== guardian.address.heading;
    });
    if (forgedPriorPosition === undefined) {
      throw new Error("unheard guardian fixture could not choose a forged prior heading");
    }
    const forgedPriorTrigger = animalContactAcousticTriggerEventId({
      sourceId: forgedPriorRecord.event.sourceId,
      beforePosition: forgedPriorPosition,
      afterPosition: forgedPriorRecord.event.sourcePosition,
      occurredAtTick: forgedPriorRecord.event.occurredAtTick,
    });
    const forgedPriorEvent = forgedPriorTrigger === null
      ? null
      : animalContactAcousticEvent({
          triggerEventId: forgedPriorTrigger,
          sourceId: forgedPriorRecord.event.sourceId,
          sourcePosition: forgedPriorRecord.event.sourcePosition,
          occurredAtTick: forgedPriorRecord.event.occurredAtTick,
          bodySize: guardian.identity.body.size === "tiny"
              || guardian.identity.body.size === "small"
            ? "small"
            : guardian.identity.body.size === "medium"
              ? "medium"
              : "large",
          movement: "slow",
          surfaceMaterial: forgedPriorRecord.event.surfaceMaterial,
        });
    if (forgedPriorEvent === null) {
      throw new Error("unheard guardian fixture could not forge prior-position semantics");
    }
    forgedPriorRecord.beforePosition = forgedPriorPosition;
    forgedPriorRecord.event = forgedPriorEvent;
    expect(canonicalizeAnimalContactAcousticCarry(
      forgedPriorCarry.animalContactAcousticCarry,
    )).not.toBeNull();
    const forgedPriorRepository = new MemoryRepository(withCurrentEnvelopeFields(
      committedRecord,
      { perceptionCarry: forgedPriorCarry },
    ));
    const rejectedPrior = await createTideweftRuntime(forgedPriorRepository);
    expect(rejectedPrior.getUIView().saveWarning?.message).toBe(
      "LOCAL AUTOSAVE UNREADABLE",
    );
    rejectedPrior.destroy();
  }, 90_000);

  it("authenticates recovery interruption across an audible guardian warning", async () => {
    const nearDawnTick = WORLD_TICKS_PER_DAY + 333;
    const world = createWorld("a", "wild");
    runTicks(world, nearDawnTick - world.meta.completedTick);
    world.weather.kind = "clear";
    world.weather.intensity = 0;
    world.weather.windX = 0;
    world.weather.windY = 0;
    world.weather.nextChangeTick = nearDawnTick + WORLD_TICKS_PER_DAY;
    assertWorldInvariants(world);
    const migrationRepository = new MemoryRepository(legacyRuntimeSaveRecord(world));
    const migration = await createTideweftRuntime(migrationRepository);
    await migration.save();
    const migratedRecord = migrationRepository.snapshot();
    const before = savedEnvelope(migrationRepository);
    const roster = deserializeDogActorRoster(before.dogActorRoster);
    const work = deserializeSettlementWorkingAnimalState(before.settlementWorkingAnimals);
    const guardian = roster?.actors[0];
    const assignment = work?.assignments[0];
    if (guardian === undefined || assignment === undefined) {
      throw new Error("sleep-warning fixture omitted its guardian relationship");
    }
    const wakeTick = firstLivingCircadianActiveTick(
      guardian.identity.stableId,
      WORLD_TICKS_PER_DAY + 300,
      WORLD_TICKS_PER_DAY + 400,
      SETTLEMENT_WORKING_DOG_CIRCADIAN_POLICY,
    );
    if (wakeTick === null || wakeTick >= WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK) {
      throw new Error(`sleep-warning fixture guardian wakes too late: ${wakeTick ?? "never"}`);
    }
    expect(wakeTick).toBe(nearDawnTick + 1);
    const preparedGuardian = setDogActorIntent(guardian, {
      kind: "observe",
      cause: { kind: "world-event", referenceId: "event:test-pre-dawn-watch" },
      enteredAtTick: nearDawnTick,
      nextThinkTick: nearDawnTick + WORLD_TICKS_PER_DAY,
    });
    const preparedRoster = replaceDogActorInRoster(roster!, preparedGuardian);
    if (preparedRoster === null) {
      throw new Error("sleep-warning fixture rejected its neutral guardian intent");
    }
    const repository = new MemoryRepository(withCurrentEnvelopeFields(migratedRecord, {
      dogActorRoster: serializeDogActorRoster(preparedRoster),
    }));
    const preparedRecord = repository.snapshot();
    migration.destroy();
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    guardianPerceptionHarness.observerId = guardian.identity.stableId;
    guardianPerceptionHarness.handlerId = assignment.handlerActorId;
    guardianPerceptionHarness.mode = "reachable";

    const recoveryControls = runtime.getUIView().controls;
    if (recoveryControls?.canRecover !== true) {
      throw new Error(`sleep-warning recovery blocked: ${recoveryControls?.recoveryHint ?? "missing controls"}`);
    }
    expect(recoveryControls).toMatchObject({
      canRecover: true,
      recoveryKind: "sleep",
      recoveryActive: false,
    });
    runtime.dispatchUI({ type: "recover", action: "begin" });
    expect(runtime.getRenderView().player.recoveryKind).toBe("sleep");
    await runtime.save();
    const preWarningAction = (savedEnvelope(repository).player as PlayerState).timeAction;
    if (preWarningAction === null) {
      throw new Error("sleep-warning fixture omitted its pre-warning recovery receipt");
    }
    advanceWaitFrames(runtime, Math.max(1, wakeTick - nearDawnTick));

    await runtime.save();
    const committedRecord = repository.snapshot();
    const committed = savedEnvelope(repository);
    const carry = committed.perceptionCarry as {
      actorVocalizationSamples: Array<{ sourceActorId: string; soundClass: string }>;
      situatedExpressionAdmissions: {
        records: Array<{ kind: string; acceptedAtTick?: number }>;
      };
      situatedExpressionChannels: {
        channels: Array<{
          sourceActorId: string;
          reception: unknown;
          state: { active: null | Record<string, unknown> };
        }>;
      };
    };
    if (carry.actorVocalizationSamples.length === 0) {
      throw new Error(`sleep-warning bark missing at wake ${wakeTick}: ${JSON.stringify(
        deserializeSettlementWorkingAnimalState(committed.settlementWorkingAnimals)?.assignments[0],
      )}`);
    }
    expect(carry.actorVocalizationSamples).toContainEqual(expect.objectContaining({
      sourceActorId: guardian.identity.stableId,
      soundClass: "animal-alarm",
    }));
    expect((committed.player as PlayerState).timeAction).toBeNull();
    expect(runtime.getRenderView().player.recoveryKind).toBeUndefined();
    const receivedDogChannel = carry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    );
    expect(receivedDogChannel?.reception).toMatchObject({
      kind: expect.stringMatching(/^heard-(visible|unseen)$/),
    });
    const dogAdmission = carry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-warning",
    );
    if (dogAdmission?.acceptedAtTick === undefined) {
      throw new Error("sleep-warning fixture omitted its guardian admission tick");
    }

    const impossiblePlayer = structuredClone(committed.player as PlayerState);
    impossiblePlayer.timeAction = progressedPlayerTimeActionAtEnvelope(
      preWarningAction,
      committed,
    );
    const impossibleRepository = new MemoryRepository(withCurrentEnvelopeFields(
      committedRecord,
      { player: impossiblePlayer },
    ));
    const impossible = await createTideweftRuntime(impossibleRepository);
    expect(impossible.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    impossible.destroy();

    const erasedCarry = structuredClone(carry);
    const erasedDogChannel = erasedCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    );
    if (erasedDogChannel === undefined || erasedDogChannel.reception === null) {
      throw new Error("sleep-warning fixture omitted its authoritative reception");
    }
    erasedDogChannel.reception = null;
    const tamperedRepository = new MemoryRepository(withCurrentEnvelopeFields(
      committedRecord,
      { perceptionCarry: erasedCarry },
    ));
    const rejected = await createTideweftRuntime(tamperedRepository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();

    runtime.dispatchUI({ type: "recover", action: "begin" });
    expect(runtime.getRenderView().player.recoveryKind).toBe("sleep");
    await runtime.save();
    const postWarningRecord = repository.snapshot();
    const postWarningEnvelope = savedEnvelope(repository);
    expect((postWarningEnvelope.player as PlayerState).timeAction).toMatchObject({
      startedAtWorldTick: dogAdmission.acceptedAtTick,
    });
    runtime.destroy();

    const lawfulReload = await createTideweftRuntime(new MemoryRepository(postWarningRecord));
    expect(lawfulReload.getUIView().saveWarning).toBeUndefined();
    expect(lawfulReload.getRenderView().player.recoveryKind).toBe("sleep");
    lawfulReload.destroy();

    const expiryRepository = new MemoryRepository(committedRecord);
    const expiryRuntime = await createTideweftRuntime(expiryRepository);
    expect(expiryRuntime.getUIView().saveWarning).toBeUndefined();
    advancePlayerSteps(expiryRuntime, 6);
    await expiryRuntime.save();
    const expiredRecord = expiryRepository.snapshot();
    const expiredEnvelope = savedEnvelope(expiryRepository);
    const expiredCarry = expiredEnvelope.perceptionCarry as typeof carry;
    expect(expiredCarry.actorVocalizationSamples).toHaveLength(1);
    expect(expiredCarry.situatedExpressionAdmissions.records).toHaveLength(1);
    expect(expiredCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    )?.state.active).toBeNull();
    expiryRuntime.destroy();

    const expiredImpossiblePlayer = structuredClone(expiredEnvelope.player as PlayerState);
    expiredImpossiblePlayer.timeAction = progressedPlayerTimeActionAtEnvelope(
      preWarningAction,
      expiredEnvelope,
    );
    const expiredImpossibleRepository = new MemoryRepository(withCurrentEnvelopeFields(
      expiredRecord,
      { player: expiredImpossiblePlayer },
    ));
    const expiredImpossible = await createTideweftRuntime(expiredImpossibleRepository);
    expect(expiredImpossible.getUIView().saveWarning?.message).toBe(
      "LOCAL AUTOSAVE UNREADABLE",
    );
    expiredImpossible.destroy();

    guardianPerceptionHarness.mode = "reachable";
    guardianPerceptionHarness.observationId = null;
    guardianPerceptionHarness.area = null;
    guardianPerceptionHarness.targetKind = null;
    const waitRepository = new MemoryRepository(preparedRecord);
    const waiting = await createTideweftRuntime(waitRepository);
    expect(waiting.getUIView().saveWarning).toBeUndefined();
    expect(waiting.getUIView().controls).toMatchObject({
      canWait: true,
      waitActive: false,
    });
    waiting.dispatchUI({ type: "wait", action: "begin" });
    expect(waiting.getUIView().controls?.waitActive).toBe(true);
    for (let step = 0; step < 20 && waiting.getUIView().controls?.waitActive; step += 1) {
      advanceWaitFrames(waiting, 1);
    }
    expect(waiting.getUIView().controls?.waitActive).toBe(false);
    await waiting.save();
    const waitCarry = savedEnvelope(waitRepository).perceptionCarry as typeof carry;
    expect(waitCarry.actorVocalizationSamples).toContainEqual(expect.objectContaining({
      sourceActorId: guardian.identity.stableId,
      soundClass: "animal-alarm",
    }));
    expect(waitCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    )?.reception).toMatchObject({
      kind: expect.stringMatching(/^heard-(visible|unseen)$/),
    });
    waiting.destroy();
  }, 120_000);

  it("persists one audible defensive growl without interrupting REST or repeating during retreat", async () => {
    const nearDawnTick = WORLD_TICKS_PER_DAY + 333;
    const world = createWorld("a", "wild");
    runTicks(world, nearDawnTick - world.meta.completedTick);
    world.weather.kind = "clear";
    world.weather.intensity = 0;
    world.weather.windX = 0;
    world.weather.windY = 0;
    world.weather.nextChangeTick = nearDawnTick + WORLD_TICKS_PER_DAY;
    assertWorldInvariants(world);
    const migrationRepository = new MemoryRepository(legacyRuntimeSaveRecord(world));
    const migration = await createTideweftRuntime(migrationRepository);
    await migration.save();
    const migratedRecord = migrationRepository.snapshot();
    const before = savedEnvelope(migrationRepository);
    const roster = deserializeDogActorRoster(before.dogActorRoster);
    const work = deserializeSettlementWorkingAnimalState(before.settlementWorkingAnimals);
    const guardian = roster?.actors[0];
    const assignment = work?.assignments[0];
    if (guardian === undefined || assignment === undefined) {
      throw new Error("rest-growl fixture omitted its guardian relationship");
    }
    const wakeTick = firstLivingCircadianActiveTick(
      guardian.identity.stableId,
      WORLD_TICKS_PER_DAY + 300,
      WORLD_TICKS_PER_DAY + 400,
      SETTLEMENT_WORKING_DOG_CIRCADIAN_POLICY,
    );
    if (wakeTick === null || wakeTick >= WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK) {
      throw new Error(`rest-growl fixture guardian wakes too late: ${wakeTick ?? "never"}`);
    }
    expect(wakeTick).toBe(nearDawnTick + 1);
    const preparedGuardian = setDogActorIntent(guardian, {
      kind: "observe",
      cause: { kind: "world-event", referenceId: "event:test-pre-dawn-growl-watch" },
      enteredAtTick: nearDawnTick,
      nextThinkTick: nearDawnTick + WORLD_TICKS_PER_DAY,
    });
    const preparedRoster = replaceDogActorInRoster(roster!, preparedGuardian);
    if (preparedRoster === null) {
      throw new Error("rest-growl fixture rejected its neutral guardian intent");
    }
    const preparedGrowlRecord = withCurrentEnvelopeFields(migratedRecord, {
      dogActorRoster: serializeDogActorRoster(preparedRoster),
    });
    const migratedWorld = deserializeWorld(String(before.world));
    const sleeperPlayer = structuredClone(before.player as PlayerState);
    const sleeperTravel = restorePlayerRegionalTravel(
      migratedWorld.meta.rootSeed,
      sleeperPlayer,
      String(before.regionalTravel),
    );
    const sleeperPosition = sleeperTravel === null
      ? null
      : playerWorldPositionInRegionalWindow(sleeperTravel.window, sleeperPlayer);
    if (sleeperPosition === null) {
      throw new Error("sleep-growl fixture omitted its sheltered listener position");
    }
    const nearbyPreparedGuardian = repositionDogActor(preparedGuardian, {
      atTick: nearDawnTick,
      heading: preparedGuardian.address.heading,
      position: sleeperPosition,
    });
    const nearbyPreparedRoster = replaceDogActorInRoster(roster!, nearbyPreparedGuardian);
    if (nearbyPreparedRoster === null) {
      throw new Error("sleep-growl fixture rejected its nearby guardian position");
    }
    const preparedSleepGrowlRecord = withCurrentEnvelopeFields(migratedRecord, {
      dogActorRoster: serializeDogActorRoster(nearbyPreparedRoster),
    });
    const repository = new MemoryRepository(withPlayerWitnessingWorldPosition(
      preparedGrowlRecord,
      preparedGuardian.address.position,
      preparedGuardian.address.position,
      Math.floor(FIXED_POINT / 2),
    ));
    migration.destroy();
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    guardianPerceptionHarness.observerId = guardian.identity.stableId;
    guardianPerceptionHarness.handlerId = assignment.handlerActorId;

    const recoveryControls = runtime.getUIView().controls;
    if (recoveryControls?.canRecover !== true) {
      throw new Error(`rest-growl recovery blocked: ${recoveryControls?.recoveryHint ?? "missing controls"}`);
    }
    expect(recoveryControls).toMatchObject({
      canRecover: true,
      recoveryKind: "rest",
      recoveryActive: false,
    });
    runtime.dispatchUI({ type: "recover", action: "begin" });
    expect(runtime.getRenderView().player.recoveryKind).toBe("rest");
    await runtime.save();
    const preGrowlAction = (savedEnvelope(repository).player as PlayerState).timeAction;
    if (preGrowlAction === null) {
      throw new Error("rest-growl fixture omitted its pre-growl recovery receipt");
    }

    // Wake the guardian before presenting the alarm. A perception sampled on
    // the same tick as its circadian wake is retained honestly for the next
    // cognition pass, but is not an immediate actor decision.
    advanceWaitFrames(runtime, Math.max(1, wakeTick - nearDawnTick));
    expect(runtime.getRenderView().player.recoveryKind).toBe("rest");
    guardianPerceptionHarness.observationId = null;
    guardianPerceptionHarness.area = null;
    guardianPerceptionHarness.targetKind = null;
    guardianPerceptionHarness.mode = "unreachable-or-outside-duty";
    advanceWaitFrames(runtime, 1);
    await runtime.save();
    const growlRecord = repository.snapshot();
    const growlEnvelope = savedEnvelope(repository);
    const growlTick = deserializeWorld(String(growlEnvelope.world)).meta.completedTick;
    const growlRoster = deserializeDogActorRoster(growlEnvelope.dogActorRoster);
    const growlWork = deserializeSettlementWorkingAnimalState(
      growlEnvelope.settlementWorkingAnimals,
    );
    const growlGuardian = growlRoster?.actors[0];
    const growlAssignment = growlWork?.assignments[0];
    const growlObservationId = guardianPerceptionHarness.observationId;
    if (
      growlGuardian === undefined
      || growlAssignment === undefined
      || growlObservationId === null
    ) throw new Error("rest-growl fixture omitted its retreat authorities");
    const growlCarry = growlEnvelope.perceptionCarry as {
      version: number;
      intervalStartPosition: WorldPosition;
      animalContactAcousticCarry: unknown;
      actorVocalizationSamples: Array<{
        expressionEventId: string;
        position: WorldPosition;
        soundClass: string;
        soundInterrupt: string;
        sourceActorId: string;
      }>;
      situatedExpressionAdmissions: {
        records: Array<{
          kind: string;
          eventId: string;
          sourceActorId: string;
          triggerEventId: string;
          assignmentId?: string;
          activityTransactionId?: string;
          sourceObservationId?: string;
          acceptedAtTick?: number;
          listenerWasSleepingAtAdmission?: boolean;
        }>;
      };
      situatedExpressionChannels: {
        channels: Array<{
          sourceActorId: string;
          reception: null | { kind: string };
          state: {
            active: null | {
              eventId: string;
              meaning: string;
              family: string;
              vocalization: string;
              audioAcknowledged: boolean;
            };
          };
        }>;
      };
    };
    const growlAdmission = growlCarry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-defensive-growl",
    );
    if (growlAdmission === undefined) {
      throw new Error(`rest-growl fixture omitted its admission receipt: ${JSON.stringify({
        targetKind: guardianPerceptionHarness.targetKind,
        intent: growlGuardian.intent,
        activity: growlAssignment.currentActivity,
        beliefs: growlGuardian.perception.beliefs,
        admissions: growlCarry.situatedExpressionAdmissions.records,
      })}`);
    }
    expect(growlGuardian.intent).toMatchObject({
      kind: "retreat",
      enteredAtTick: growlTick,
      cause: { kind: "perception" },
    });
    expect(growlAssignment.currentActivity).toMatchObject({
      activity: "defer-to-actor",
      acceptedAtTick: growlTick,
      cause: {
        kind: "actor-disposition",
        referenceId: "actor-intent:retreat",
      },
    });
    expect(growlAdmission).toMatchObject({
      sourceActorId: growlGuardian.identity.stableId,
      triggerEventId: growlAssignment.currentActivity.transactionId,
      assignmentId: growlAssignment.assignmentId,
      activityTransactionId: growlAssignment.currentActivity.transactionId,
      sourceObservationId: growlObservationId,
      acceptedAtTick: growlTick,
      listenerWasSleepingAtAdmission: false,
    });
    expect(growlCarry.actorVocalizationSamples).toEqual([
      expect.objectContaining({
        expressionEventId: growlAdmission.eventId,
        position: growlGuardian.address.position,
        soundClass: "animal-alarm",
        soundInterrupt: "none",
        sourceActorId: growlGuardian.identity.stableId,
      }),
    ]);
    const growlChannel = growlCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === growlGuardian.identity.stableId,
    );
    expect(growlChannel).toMatchObject({
      sourceActorId: growlGuardian.identity.stableId,
      reception: { kind: expect.stringMatching(/^heard-(visible|unseen)$/) },
      state: {
        active: {
          eventId: growlAdmission.eventId,
          meaning: "guardian-dog-defensive-growl",
          family: "animal-signal",
          vocalization: "dog-defensive-growl",
          audioAcknowledged: true,
        },
      },
    });
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      text: "GRRRR.",
      presentationKind: "animal-call",
      animalCallKind: "growl",
      assertive: false,
    });
    expect((growlEnvelope.player as PlayerState).timeAction).toMatchObject({
      kind: "rest",
      startedAtWorldTick: preGrowlAction.startedAtWorldTick,
    });
    expect(runtime.getRenderView().player.recoveryKind).toBe("rest");
    runtime.destroy();

    const tamperedCarry = structuredClone(growlCarry);
    const tamperedAdmission = tamperedCarry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-defensive-growl",
    );
    if (tamperedAdmission === undefined) {
      throw new Error("rest-growl tamper fixture omitted its admission");
    }
    tamperedAdmission.sourceObservationId = `${growlObservationId}:forged`;
    const tampered = await createTideweftRuntime(new MemoryRepository(
      withCurrentEnvelopeFields(growlRecord, { perceptionCarry: tamperedCarry }),
    ));
    expect(tampered.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    tampered.destroy();

    const { integrity: _currentIntegrity, playerExpressionRecency: _futurePlayerExpressionRecency, ...growlFields } = growlEnvelope;
    const {
      animalContactAcousticCarry: _currentAnimalContactCarry,
      intervalStartWasSleeping: _currentIntervalStartWasSleeping,
      playerStepStateAnchor: _currentPlayerStepStateAnchor,
      playerStepStateSamples: _currentPlayerStepStateSamples,
      ...v7GrowlCarry
    } = growlCarry as Readonly<Record<string, unknown>>;
    const v35Base = {
      ...growlFields,
      version: 35,
      perceptionCarry: { ...v7GrowlCarry, version: 4 },
    };
    const v35GrowlRecord: SaveRecord = {
      ...growlRecord,
      payloadVersion: 35,
      updatedAt: growlRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v35Base,
        integrity: gameSaveEnvelopeIntegrity(v35Base),
      }),
    };
    await expectRetiredVoiceSaveUntouched(v35GrowlRecord);

    // Retirement must not hide the original admission-kind rejection: the
    // obsolete tuple is also invalid inside a full current carry.
    const legacyGrowlTupleCarry = {
      ...growlCarry,
      situatedExpressionAdmissions: {
        version: 1,
        records: growlCarry.situatedExpressionAdmissions.records.map((record) => (
          record.kind === "guardian-dog-defensive-growl"
            ? { ...record, kind: "guardian-dog-warning" }
            : record
        )),
      },
    };
    const legacyGrowlTupleRecord = withCurrentEnvelopeFields(growlRecord, {
      perceptionCarry: legacyGrowlTupleCarry,
    });
    const legacyGrowlTupleRepository = new MemoryRepository(legacyGrowlTupleRecord);
    const rejectedLegacyGrowlTuple = await createTideweftRuntime(legacyGrowlTupleRepository);
    expect(rejectedLegacyGrowlTuple.getUIView().saveWarning?.message)
      .toBe("LOCAL AUTOSAVE UNREADABLE");
    expect(legacyGrowlTupleRepository.snapshot()).toEqual(legacyGrowlTupleRecord);
    rejectedLegacyGrowlTuple.destroy();

    // The obsolete v36/carry-v5 growl checkpoint is recognized without replay,
    // partial adoption or overwrite. Current reload below still proves cause.
    const v36Base = {
      ...growlFields,
      version: 36,
      perceptionCarry: { ...v7GrowlCarry, version: 5 },
    };
    const v36GrowlRecord: SaveRecord = {
      ...growlRecord,
      payloadVersion: 36,
      updatedAt: growlRecord.updatedAt + 2,
      worldJson: JSON.stringify({
        ...v36Base,
        integrity: gameSaveEnvelopeIntegrity(v36Base),
      }),
    };
    await expectRetiredVoiceSaveUntouched(v36GrowlRecord);
    soundscapePlay.mockClear();

    const perceptionSpy = vi.spyOn(humanPerception, "collectExistingHumanObservations");
    const resumedRepository = new MemoryRepository(growlRecord);
    const resumed = await createTideweftRuntime(resumedRepository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(resumed.getRenderView().player.recoveryKind).toBe("rest");
    expect(resumed.getUIView().expressionCaption).toMatchObject({
      text: "GRRRR.",
      animalCallKind: "growl",
    });
    await resumed.save();
    const exactReload = savedEnvelope(resumedRepository);
    expect(exactReload.perceptionCarry).toEqual(growlEnvelope.perceptionCarry);
    expect(exactReload.dogActorRoster).toBe(growlEnvelope.dogActorRoster);
    expect(exactReload.settlementWorkingAnimals).toBe(
      growlEnvelope.settlementWorkingAnimals,
    );
    expect(exactReload.player).toEqual(growlEnvelope.player);

    advanceWaitFrames(resumed, 1);
    await resumed.save();
    const continuedEnvelope = savedEnvelope(resumedRepository);
    const continuedCarry = continuedEnvelope.perceptionCarry as typeof growlCarry;
    const continuedGuardian = deserializeDogActorRoster(
      continuedEnvelope.dogActorRoster,
    )?.actors[0];
    expect(continuedGuardian?.intent.kind).toBe("retreat");
    expect(continuedCarry.actorVocalizationSamples.some(({ expressionEventId }) => (
      expressionEventId === growlAdmission.eventId
    ))).toBe(false);
    expect(continuedCarry.situatedExpressionAdmissions.records.some(({ kind }) => (
      kind === "guardian-dog-defensive-growl"
    ))).toBe(false);
    const continuedChannel = continuedCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === growlGuardian.identity.stableId,
    );
    expect(continuedChannel === undefined || continuedChannel.state.active === null).toBe(true);
    expect((continuedEnvelope.player as PlayerState).timeAction).toMatchObject({
      kind: "rest",
      startedAtWorldTick: preGrowlAction.startedAtWorldTick,
    });
    expect(resumed.getRenderView().player.recoveryKind).toBe("rest");
    const growlSoundIntervals = perceptionSpy.mock.calls
      .map(([input]) => input.supplementalSoundSamples ?? [])
      .filter((samples) => samples.some(({ expressionEventId }) => (
        expressionEventId === growlAdmission.eventId
      )));
    expect(growlSoundIntervals).toHaveLength(1);
    expect(growlSoundIntervals[0]?.filter(({ expressionEventId }) => (
      expressionEventId === growlAdmission.eventId
    ))).toEqual([
      expect.objectContaining({
        sourceActorId: growlGuardian.identity.stableId,
        soundClass: "animal-alarm",
        soundInterrupt: "none",
      }),
    ]);
    resumed.destroy();
    perceptionSpy.mockRestore();

    // Place the same guardian at the sheltered listener's exact world point.
    // The awake counterfactual must hear this spoken growl; SLEEP, not range,
    // is therefore the only reason the otherwise identical sleeping branch
    // receives no knowledge or caption.
    guardianPerceptionHarness.observationId = null;
    guardianPerceptionHarness.area = null;
    guardianPerceptionHarness.targetKind = null;
    guardianPerceptionHarness.mode = null;
    const awakeRepository = new MemoryRepository(preparedSleepGrowlRecord);
    const awake = await createTideweftRuntime(awakeRepository);
    expect(awake.getUIView().saveWarning).toBeUndefined();
    guardianPerceptionHarness.observerId = guardian.identity.stableId;
    guardianPerceptionHarness.handlerId = assignment.handlerActorId;
    advancePlayerSteps(awake, Math.max(10, (wakeTick - nearDawnTick) * 10));
    guardianPerceptionHarness.observationId = null;
    guardianPerceptionHarness.area = null;
    guardianPerceptionHarness.targetKind = null;
    guardianPerceptionHarness.mode = "unreachable-or-outside-duty";
    advancePlayerSteps(awake, 10);
    await awake.save();
    const awakeGrowlEnvelope = savedEnvelope(awakeRepository);
    const awakeGrowlCarry = awakeGrowlEnvelope.perceptionCarry as typeof growlCarry;
    const awakeGrowlAdmission = awakeGrowlCarry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-defensive-growl",
    );
    if (awakeGrowlAdmission === undefined) {
      throw new Error("awake growl counterfactual omitted its admission");
    }
    expect(awakeGrowlAdmission.listenerWasSleepingAtAdmission).toBe(false);
    expect(awakeGrowlCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    )?.reception).toMatchObject({
      kind: expect.stringMatching(/^heard-(visible|unseen)$/),
    });
    expect(awake.getUIView().expressionCaption).toMatchObject({
      text: "GRRRR.",
      animalCallKind: "growl",
    });

    // Starting SLEEP after the phase-zero event cannot rewrite its already
    // authenticated awake receipt. The equal start tick is lawful on reload.
    expect(awake.getUIView().controls).toMatchObject({
      canRecover: true,
      recoveryKind: "sleep",
      recoveryActive: false,
    });
    awake.dispatchUI({ type: "recover", action: "begin" });
    await awake.save();
    const postGrowlSleepRecord = awakeRepository.snapshot();
    const postGrowlSleepEnvelope = savedEnvelope(awakeRepository);
    expect((postGrowlSleepEnvelope.player as PlayerState).timeAction).toMatchObject({
      kind: "sleep",
      startedAtWorldTick: awakeGrowlAdmission.acceptedAtTick,
    });
    awake.destroy();

    const postGrowlSleeper = await createTideweftRuntime(
      new MemoryRepository(postGrowlSleepRecord),
    );
    expect(postGrowlSleeper.getUIView().saveWarning).toBeUndefined();
    expect(postGrowlSleeper.getRenderView().player.recoveryKind).toBe("sleep");
    postGrowlSleeper.destroy();

    guardianPerceptionHarness.observationId = null;
    guardianPerceptionHarness.area = null;
    guardianPerceptionHarness.targetKind = null;
    guardianPerceptionHarness.mode = null;
    const sleepRepository = new MemoryRepository(preparedSleepGrowlRecord);
    const sleeping = await createTideweftRuntime(sleepRepository);
    expect(sleeping.getUIView().saveWarning).toBeUndefined();
    guardianPerceptionHarness.observerId = guardian.identity.stableId;
    guardianPerceptionHarness.handlerId = assignment.handlerActorId;
    expect(sleeping.getUIView().controls).toMatchObject({
      canRecover: true,
      recoveryKind: "sleep",
      recoveryActive: false,
    });
    sleeping.dispatchUI({ type: "recover", action: "begin" });
    advanceWaitFrames(sleeping, Math.max(1, wakeTick - nearDawnTick));
    expect(sleeping.getRenderView().player.recoveryKind).toBe("sleep");
    guardianPerceptionHarness.observationId = null;
    guardianPerceptionHarness.area = null;
    guardianPerceptionHarness.targetKind = null;
    guardianPerceptionHarness.mode = "unreachable-or-outside-duty";
    advanceWaitFrames(sleeping, 1);
    await sleeping.save();
    const sleepEnvelope = savedEnvelope(sleepRepository);
    const sleepCarry = sleepEnvelope.perceptionCarry as typeof growlCarry;
    const sleepAdmission = sleepCarry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-defensive-growl",
    );
    if (sleepAdmission === undefined) {
      throw new Error("sleep-growl branch omitted its world-authoritative admission");
    }
    expect(sleepAdmission.listenerWasSleepingAtAdmission).toBe(true);
    expect(sleepAdmission.eventId).toBe(awakeGrowlAdmission.eventId);
    expect(sleepCarry.intervalStartPosition).toEqual(
      awakeGrowlCarry.intervalStartPosition,
    );
    expect(sleepCarry.actorVocalizationSamples.filter(({ expressionEventId }) => (
      expressionEventId === sleepAdmission.eventId
    ))).toEqual([
      expect.objectContaining({
        expressionEventId: sleepAdmission.eventId,
        sourceActorId: guardian.identity.stableId,
        soundClass: "animal-alarm",
        soundInterrupt: "none",
      }),
    ]);
    expect(sleepCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    )).toMatchObject({
      reception: null,
      state: {
        active: {
          eventId: sleepAdmission.eventId,
          meaning: "guardian-dog-defensive-growl",
          vocalization: "dog-defensive-growl",
          audioAcknowledged: true,
        },
      },
    });
    expect(sleeping.getRenderView().expressions ?? []).toEqual([]);
    expect(sleeping.getUIView().expressionCaption).toBeUndefined();
    expect((sleepEnvelope.player as PlayerState).timeAction).toMatchObject({
      kind: "sleep",
    });
    expect(sleeping.getRenderView().player.recoveryKind).toBe("sleep");
    sleeping.destroy();

    // Cancelling SLEEP after the event likewise cannot manufacture an awake
    // receipt. The immutable admission remains the event-time hearing gate.
    const cancelRepository = new MemoryRepository(sleepRepository.snapshot());
    const cancelling = await createTideweftRuntime(cancelRepository);
    expect(cancelling.getUIView().saveWarning).toBeUndefined();
    cancelling.dispatchUI({ type: "recover", action: "cancel" });
    expect(cancelling.getRenderView().player.recoveryKind).toBeUndefined();
    await cancelling.save();
    const cancelledRecord = cancelRepository.snapshot();
    cancelling.destroy();

    const cancelledReload = await createTideweftRuntime(
      new MemoryRepository(cancelledRecord),
    );
    expect(cancelledReload.getUIView().saveWarning).toBeUndefined();
    expect(cancelledReload.getRenderView().player.recoveryKind).toBeUndefined();
    expect(cancelledReload.getUIView().expressionCaption).toBeUndefined();
    cancelledReload.destroy();
  }, 180_000);

  it("persists one weather-caused shelter whine without interrupting WAIT, REST, or SLEEP", async () => {
    const nearDawnTick = WORLD_TICKS_PER_DAY + 333;
    const world = createWorld("a", "wild");
    runTicks(world, nearDawnTick - world.meta.completedTick);
    world.weather.kind = "rain";
    world.weather.intensity = FIXED_POINT;
    world.weather.windX = FIXED_POINT;
    world.weather.windY = -FIXED_POINT;
    world.weather.nextChangeTick = nearDawnTick + WORLD_TICKS_PER_DAY;
    assertWorldInvariants(world);

    const migrationRepository = new MemoryRepository(legacyRuntimeSaveRecord(world));
    const migration = await createTideweftRuntime(migrationRepository);
    await migration.save();
    const migratedRecord = migrationRepository.snapshot();
    const before = savedEnvelope(migrationRepository);
    const migratedWorld = deserializeWorld(String(before.world));
    const roster = deserializeDogActorRoster(before.dogActorRoster);
    const work = deserializeSettlementWorkingAnimalState(before.settlementWorkingAnimals);
    const settlement = deserializeSettlementEcologyState(before.settlementEcology);
    const guardian = roster?.actors[0];
    const assignment = work?.assignments[0];
    const custody = settlement.domesticCustodies.find(({ species }) => (
      species === "domestic-dog"
    ));
    if (
      guardian === undefined
      || assignment === undefined
      || custody === undefined
      || custody.homeStructure.kind !== "kennel"
    ) throw new Error("shelter-whine fixture omitted its guardian kennel relationship");
    const migratedWorldView = createWorldView(migratedWorld);
    const handler = migratedWorld.residents.find(({ identity }) => (
      identity.stableId === assignment.handlerActorId
    ));
    const handlerPlacement = handler === undefined
      ? null
      : resolveResidentWorldPlacement(migratedWorldView, handler);
    if (handlerPlacement === null) {
      throw new Error("shelter-whine fixture omitted its nearby human handler");
    }
    const whineStartPosition = handlerPlacement.position;
    const initialKennelDelta = worldPositionDelta(
      whineStartPosition,
      custody.homeStructure.position,
    );
    const initialKennelDistance = Math.hypot(initialKennelDelta.x, initialKennelDelta.y);
    if (initialKennelDistance <= custody.homeStructure.radiusUnits) {
      throw new Error("shelter-whine fixture guardian began inside its kennel");
    }
    const wakeTick = firstLivingCircadianActiveTick(
      guardian.identity.stableId,
      WORLD_TICKS_PER_DAY + 300,
      WORLD_TICKS_PER_DAY + 400,
      SETTLEMENT_WORKING_DOG_CIRCADIAN_POLICY,
    );
    if (wakeTick === null || wakeTick >= WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK) {
      throw new Error(`shelter-whine fixture guardian wakes too late: ${wakeTick ?? "never"}`);
    }
    expect(wakeTick).toBe(nearDawnTick + 1);

    let preparedGuardian = replaceDogActorPhysiology(guardian, {
      needs: { hunger: 0, thirst: 0, rest: 0, safety: 0, company: 0 },
      condition: {
        health: FIXED_POINT,
        wetness: FIXED_POINT,
        coldStress: 0,
        heatStress: 0,
        exhaustion: 0,
        injuries: [],
      },
      humanFamiliarity: guardian.humanFamiliarity,
      atTick: nearDawnTick,
    });
    preparedGuardian = setDogActorIntent(preparedGuardian, {
      kind: "observe",
      cause: { kind: "world-event", referenceId: "event:test-pre-whine-watch" },
      enteredAtTick: nearDawnTick,
      nextThinkTick: nearDawnTick + WORLD_TICKS_PER_DAY,
    });
    preparedGuardian = repositionDogActor(preparedGuardian, {
      atTick: nearDawnTick,
      heading: preparedGuardian.address.heading,
      position: whineStartPosition,
    });
    const preparedRoster = replaceDogActorInRoster(roster!, preparedGuardian);
    if (preparedRoster === null) {
      throw new Error("shelter-whine fixture rejected its weathered guardian");
    }
    const preparedWhineRecord = withCurrentEnvelopeFields(migratedRecord, {
      dogActorRoster: serializeDogActorRoster(preparedRoster),
    });

    const sleeperPlayer = structuredClone(before.player as PlayerState);
    const sleeperTravel = restorePlayerRegionalTravel(
      migratedWorld.meta.rootSeed,
      sleeperPlayer,
      String(before.regionalTravel),
    );
    const sleeperPosition = sleeperTravel === null
      ? null
      : playerWorldPositionInRegionalWindow(sleeperTravel.window, sleeperPlayer);
    if (sleeperPosition === null) {
      throw new Error("shelter-whine fixture omitted its sheltered listener position");
    }
    const nearbyPreparedGuardian = repositionDogActor(preparedGuardian, {
      atTick: nearDawnTick,
      heading: preparedGuardian.address.heading,
      position: sleeperPosition,
    });
    const sleeperKennelDelta = worldPositionDelta(
      nearbyPreparedGuardian.address.position,
      custody.homeStructure.position,
    );
    if (Math.hypot(sleeperKennelDelta.x, sleeperKennelDelta.y)
      <= custody.homeStructure.radiusUnits) {
      throw new Error("sleep-whine listener fixture overlaps the guardian kennel");
    }
    const nearbyPreparedRoster = replaceDogActorInRoster(roster!, nearbyPreparedGuardian);
    if (nearbyPreparedRoster === null) {
      throw new Error("sleep-whine fixture rejected its nearby guardian position");
    }
    const preparedSleepWhineRecord = withCurrentEnvelopeFields(migratedRecord, {
      dogActorRoster: serializeDogActorRoster(nearbyPreparedRoster),
    });
    const preparedVisibleWhineRecord = withPlayerWitnessingWorldPosition(
      preparedWhineRecord,
      preparedGuardian.address.position,
      preparedGuardian.address.position,
      Math.floor(FIXED_POINT / 2),
    );
    migration.destroy();

    // A kennel is physical shelter, not a decorative destination label. Even
    // under the same storm and condition pressure, a guardian already inside
    // its assigned kennel cannot freshly request that shelter or emit the
    // corresponding call.
    const shelteredPreparedGuardian = repositionDogActor(preparedGuardian, {
      atTick: nearDawnTick,
      heading: preparedGuardian.address.heading,
      position: custody.homeStructure.position,
    });
    const shelteredPreparedRoster = replaceDogActorInRoster(
      roster!,
      shelteredPreparedGuardian,
    );
    if (shelteredPreparedRoster === null) {
      throw new Error("shelter-whine negative fixture rejected its kenneled guardian");
    }
    const shelteredRepository = new MemoryRepository(withCurrentEnvelopeFields(
      migratedRecord,
      { dogActorRoster: serializeDogActorRoster(shelteredPreparedRoster) },
    ));
    const sheltered = await createTideweftRuntime(shelteredRepository);
    expect(sheltered.getUIView().saveWarning).toBeUndefined();
    advanceWaitFrames(sheltered, Math.max(1, wakeTick - nearDawnTick));
    await sheltered.save();
    const shelteredEnvelope = savedEnvelope(shelteredRepository);
    const shelteredGuardian = deserializeDogActorRoster(
      shelteredEnvelope.dogActorRoster,
    )?.actors[0];
    const shelteredAdmissions = (shelteredEnvelope.perceptionCarry as {
      situatedExpressionAdmissions: { records: Array<{ kind: string }> };
    }).situatedExpressionAdmissions.records;
    expect(shelteredGuardian?.intent.kind).not.toBe("seek-shelter");
    expect(shelteredAdmissions.some(({ kind }) => (
      kind === "guardian-dog-shelter-whine"
    ))).toBe(false);
    expect(sheltered.getUIView().expressionCaption).toBeUndefined();
    sheltered.destroy();

    guardianPerceptionHarness.observerId = guardian.identity.stableId;
    guardianPerceptionHarness.handlerId = "TEST-NO-WHINE-DISTRACTION";
    guardianPerceptionHarness.mode = null;
    const repository = new MemoryRepository(preparedVisibleWhineRecord);
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    const recoveryControls = runtime.getUIView().controls;
    if (recoveryControls?.canRecover !== true || recoveryControls.recoveryKind !== "rest") {
      throw new Error(`rest-whine recovery blocked: ${recoveryControls?.recoveryHint ?? "missing controls"}`);
    }
    runtime.dispatchUI({ type: "recover", action: "begin" });
    expect(runtime.getRenderView().player.recoveryKind).toBe("rest");
    await runtime.save();
    const preWhineRest = (savedEnvelope(repository).player as PlayerState).timeAction;
    if (preWhineRest === null) throw new Error("rest-whine fixture omitted its recovery receipt");

    const perceptionSpy = vi.spyOn(humanPerception, "collectExistingHumanObservations");
    advanceWaitFrames(runtime, Math.max(1, wakeTick - nearDawnTick));
    await runtime.save();
    const whineRecord = repository.snapshot();
    const whineEnvelope = savedEnvelope(repository);
    const whineTick = deserializeWorld(String(whineEnvelope.world)).meta.completedTick;
    const whineRoster = deserializeDogActorRoster(whineEnvelope.dogActorRoster);
    const whineWork = deserializeSettlementWorkingAnimalState(
      whineEnvelope.settlementWorkingAnimals,
    );
    const whineGuardian = whineRoster?.actors[0];
    const whineAssignment = whineWork?.assignments[0];
    if (whineGuardian === undefined || whineAssignment === undefined) {
      throw new Error("rest-whine fixture omitted its committed authorities");
    }
    const whineCarry = whineEnvelope.perceptionCarry as {
      version: number;
      playerStepsSinceWorldTick: number;
      intervalStartPosition: WorldPosition;
      animalContactAcousticCarry: unknown;
      actorVocalizationSamples: Array<{
        expressionEventId: string;
        position: WorldPosition;
        soundClass: string;
        soundInterrupt: string;
        sourceActorId: string;
      }>;
      situatedExpressionAdmissions: {
        records: Array<{
          kind: string;
          eventId: string;
          sourceActorId: string;
          triggerEventId: string;
          assignmentId?: string;
          activityTransactionId?: string;
          acceptedAtTick?: number;
          admittedAtPlayerStepPhase?: number;
          shelterIntentScore?: number;
          listenerWasSleepingAtAdmission?: boolean;
        }>;
      };
      situatedExpressionChannels: {
        channels: Array<{
          sourceActorId: string;
          reception: null | { kind: string };
          state: {
            active: null | {
              eventId: string;
              meaning: string;
              family: string;
              vocalization: string;
              audioAcknowledged: boolean;
            };
            recent: Array<{
              triggerEventId: string;
              meaning: string;
              priority: number;
            }>;
          };
        }>;
      };
    };
    const whineAdmission = whineCarry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-shelter-whine",
    );
    if (whineAdmission === undefined) {
      throw new Error(`rest-whine fixture omitted its admission receipt: ${JSON.stringify({
        intent: whineGuardian.intent,
        activity: whineAssignment.currentActivity,
        condition: whineGuardian.condition,
        admissions: whineCarry.situatedExpressionAdmissions.records,
      })}`);
    }
    if (typeof whineAdmission.shelterIntentScore !== "number") {
      throw new Error("rest-whine fixture omitted its shelter score receipt");
    }
    const expectedWhineTriggerEventId = guardianDogShelterWhineTriggerEventId(
      whineAssignment.currentActivity.transactionId,
      whineAdmission.shelterIntentScore,
    );
    if (expectedWhineTriggerEventId === null) {
      throw new Error("rest-whine fixture could not derive its bound trigger");
    }
    expect(whineGuardian.intent).toMatchObject({
      kind: "seek-shelter",
      enteredAtTick: whineTick,
      cause: {
        kind: "condition",
        referenceId: "condition:weather-exposure",
      },
    });
    expect(whineAssignment.currentActivity).toMatchObject({
      activity: "defer-to-actor",
      acceptedAtTick: whineTick,
      cause: {
        kind: "actor-disposition",
        referenceId: "actor-intent:seek-shelter",
      },
    });
    expect(whineAdmission).toMatchObject({
      sourceActorId: whineGuardian.identity.stableId,
      triggerEventId: expectedWhineTriggerEventId,
      assignmentId: whineAssignment.assignmentId,
      activityTransactionId: whineAssignment.currentActivity.transactionId,
      acceptedAtTick: whineTick,
      shelterIntentScore: expect.any(Number),
      listenerWasSleepingAtAdmission: false,
    });
    const movedKennelDelta = worldPositionDelta(
      whineGuardian.address.position,
      custody.homeStructure.position,
    );
    expect(Math.hypot(movedKennelDelta.x, movedKennelDelta.y)).toBeLessThan(
      initialKennelDistance,
    );
    expect(whineCarry.actorVocalizationSamples.filter(({ expressionEventId }) => (
      expressionEventId === whineAdmission.eventId
    ))).toEqual([
      expect.objectContaining({
        expressionEventId: whineAdmission.eventId,
        position: whineGuardian.address.position,
        soundClass: "animal-call",
        soundInterrupt: "none",
        sourceActorId: whineGuardian.identity.stableId,
      }),
    ]);
    expect(whineCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === whineGuardian.identity.stableId,
    )).toMatchObject({
      reception: { kind: expect.stringMatching(/^heard-(visible|unseen)$/) },
      state: {
        active: {
          eventId: whineAdmission.eventId,
          meaning: "guardian-dog-shelter-whine",
          family: "animal-signal",
          vocalization: "dog-shelter-whine",
          audioAcknowledged: true,
        },
      },
    });
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      text: "WHINE...",
      presentationKind: "animal-call",
      animalCallKind: "whine",
      assertive: false,
    });
    expect((whineEnvelope.player as PlayerState).timeAction).toMatchObject({
      kind: "rest",
      startedAtWorldTick: preWhineRest.startedAtWorldTick,
    });
    expect(runtime.getRenderView().player.recoveryKind).toBe("rest");

    // This is a controlled weather/source continuation, not a natural-play
    // call-rate or hours-long annoyance witness. The existing guardian sensory
    // filter remains in place; cognition, work, movement and shelter stay real.
    // Cancel accelerated REST before using the ordinary fixed-step helper.
    const originalWhineAudio = soundscapePlay.mock.calls.filter(([cue]) => (
      cue === "vocalization-dog-shelter-whine"
    ));
    expect(originalWhineAudio).toHaveLength(1);
    runtime.dispatchUI({ type: "recover", action: "cancel" });
    expect(runtime.getRenderView().player.recoveryKind).toBeUndefined();
    const acceptedClock = (envelope: Record<string, unknown>): number => {
      const phase = (envelope.perceptionCarry as typeof whineCarry).playerStepsSinceWorldTick;
      expect(Number.isSafeInteger(phase) && phase >= 0 && phase < 10).toBe(true);
      return deserializeWorld(String(envelope.world)).meta.completedTick * 10 + phase;
    };
    const originClock = acceptedClock(whineEnvelope);
    let audioFrontier = soundscapePlay.mock.calls.length;
    let hearingFrontier = perceptionSpy.mock.calls.length;
    const captureContinuation = async (
      branch: TideweftRuntime,
      branchRepository: MemoryRepository,
      acceptedSteps: number,
    ) => {
      await branch.save();
      const envelope = savedEnvelope(branchRepository);
      const carry = envelope.perceptionCarry as typeof whineCarry;
      const tick = deserializeWorld(String(envelope.world)).meta.completedTick;
      expect(acceptedClock(envelope) - originClock).toBe(acceptedSteps);
      const source = deserializeDogActorRoster(envelope.dogActorRoster)?.actors.find(
        ({ identity }) => identity.stableId === whineGuardian.identity.stableId,
      );
      const sourceAssignment = deserializeSettlementWorkingAnimalState(
        envelope.settlementWorkingAnimals,
      )?.assignments.find(({ assignmentId }) => assignmentId === whineAssignment.assignmentId);
      const sourceCustody = deserializeSettlementEcologyState(envelope.settlementEcology)
        .domesticCustodies.find(({ relationshipId }) => (
          relationshipId === whineAssignment.workerCustodyRelationshipId
        ));
      if (source === undefined || sourceAssignment === undefined || sourceCustody === undefined
        || sourceCustody.homeStructure.kind !== "kennel") {
        throw new Error("Shelter continuation lost its actual dog, work or kennel custody");
      }
      const kennelDelta = worldPositionDelta(source.address.position, sourceCustody.homeStructure.position);
      const insideKennel = Math.hypot(kennelDelta.x, kennelDelta.y) <= sourceCustody.homeStructure.radiusUnits;
      const admissions = carry.situatedExpressionAdmissions.records.filter(({ sourceActorId }) => (
        sourceActorId === source.identity.stableId
      ));
      for (const admission of admissions) {
        if (admission.kind !== "guardian-dog-shelter-whine" || admission.eventId === whineAdmission.eventId) continue;
        // A genuinely new cause is allowed. It must independently own a fresh
        // weather-backed actor/work edge, not resurrect the continuing request.
        expect(source.intent).toMatchObject({ kind: "seek-shelter", enteredAtTick: admission.acceptedAtTick,
          cause: { kind: "condition", referenceId: "condition:weather-exposure" } });
        expect(sourceAssignment.currentActivity).toMatchObject({ activity: "defer-to-actor",
          transactionId: admission.activityTransactionId, acceptedAtTick: admission.acceptedAtTick,
          cause: { kind: "actor-disposition", referenceId: "actor-intent:seek-shelter" } });
        expect(admission.acceptedAtTick).toBe(tick);
        expect(admission.shelterIntentScore).toBeGreaterThan(0);
        if (typeof admission.shelterIntentScore !== "number") {
          throw new Error("Fresh shelter admission omitted its causal score");
        }
        expect(admission.triggerEventId).toBe(guardianDogShelterWhineTriggerEventId(
          sourceAssignment.currentActivity.transactionId, admission.shelterIntentScore,
        ));
        expect(insideKennel).toBe(false);
        expect(admission.triggerEventId).not.toBe(whineAdmission.triggerEventId);
      }
      const audio = structuredClone(soundscapePlay.mock.calls.slice(audioFrontier).filter(([cue]) => (
        cue === "vocalization-dog-shelter-whine"
      )));
      audioFrontier = soundscapePlay.mock.calls.length;
      const hearing = perceptionSpy.mock.calls.slice(hearingFrontier).flatMap(([input], offset) => {
        const samples = (input.supplementalSoundSamples ?? []).filter(({ expressionEventId }) => (
          expressionEventId === whineAdmission.eventId
        ));
        if (samples.length === 0) return [];
        expect(samples).toHaveLength(1);
        const result = perceptionSpy.mock.results[hearingFrontier + offset];
        if (result?.type !== "return") throw new Error("Shelter hearing did not complete");
        const batches: ReturnType<typeof humanPerception.collectExistingHumanObservations> = result.value;
        const observations = batches.flatMap(({ observerId, observations: received }) => received.filter(({ id, channel }) => channel === "hearing"
          && samples.some((sample) => id.endsWith(`-${sample.id}`)))
          .map((observation) => ({ observerId, observation })));
        expect(observations.length).toBeGreaterThan(0);
        expect(observations.every(({ observation }) => observation.perceivedClass === "animal-call"
          && observation.interrupt === "none" && observation.identification === "anonymous"
          && observation.subjectId === null)).toBe(true);
        return [{ tick: input.targetTick, samples: structuredClone(samples), observations }];
      });
      hearingFrontier = perceptionSpy.mock.calls.length;
      if (acceptedSteps >= 10) {
        expect(admissions.some(({ eventId }) => eventId === whineAdmission.eventId)).toBe(false);
        expect(carry.actorVocalizationSamples.some(({ expressionEventId }) => (
          expressionEventId === whineAdmission.eventId
        ))).toBe(false);
      }
      if (source.intent.kind === "seek-shelter" && source.intent.enteredAtTick === whineTick) {
        expect(admissions.every(({ kind, eventId }) => kind !== "guardian-dog-shelter-whine"
          || eventId === whineAdmission.eventId)).toBe(true);
        expect(audio).toEqual([]);
      }
      return { envelope, trace: { acceptedSteps, tick, phase: carry.playerStepsSinceWorldTick,
        source, assignment: sourceAssignment, custody: sourceCustody, insideKennel, admissions,
        samples: carry.actorVocalizationSamples.filter(({ sourceActorId }) => sourceActorId === source.identity.stableId),
        channel: carry.situatedExpressionChannels.channels.find(({ sourceActorId }) => sourceActorId === source.identity.stableId) ?? null,
        audio, hearing } };
    };
    const uninterrupted = [(await captureContinuation(runtime, repository, 0)).trace];
    let checkpoint19: SaveRecord | undefined;
    let checkpoint19Envelope: Record<string, unknown> | undefined;
    let terminal: Record<string, unknown> | undefined;
    for (let step = 1; step <= 40; step += 1) {
      advancePlayerSteps(runtime, 1);
      const captured = await captureContinuation(runtime, repository, step);
      uninterrupted.push(captured.trace);
      if (step === 19) {
        checkpoint19 = repository.snapshot();
        checkpoint19Envelope = captured.envelope;
      }
      if (step === 40) terminal = captured.envelope;
    }
    if (checkpoint19 === undefined || checkpoint19Envelope === undefined || terminal === undefined) {
      throw new Error("Shelter continuation omitted its accepted checkpoint or terminal state");
    }
    expect(uninterrupted.flatMap(({ hearing }) => hearing)).toHaveLength(1);
    const continuingOriginalRequestStepsAfterCooldown = uninterrupted.filter(({ acceptedSteps, source }) => (
      acceptedSteps >= 24 && source.intent.kind === "seek-shelter" && source.intent.enteredAtTick === whineTick
    )).length;
    // Losing this continuing-source window is lost fixture coverage, not proof
    // of a runtime defect. A legitimate later request/kennel arrival is allowed.
    expect(continuingOriginalRequestStepsAfterCooldown).toBeGreaterThan(0);
    runtime.destroy();

    // Both branches share the same actual first nineteen steps. Resume that
    // consumed-origin snapshot, not a fabricated actor or reconstructed sound.
    const continuationRepository = new MemoryRepository(checkpoint19);
    const audioBeforeReload = soundscapePlay.mock.calls.length;
    const hearingBeforeReload = perceptionSpy.mock.calls.length;
    const continuation = await createTideweftRuntime(continuationRepository);
    try {
      expect(continuation.getUIView().saveWarning).toBeUndefined();
      expect(continuation.getRenderView().player.recoveryKind).toBeUndefined();
      expect(soundscapePlay.mock.calls.slice(audioBeforeReload).filter(([cue]) => (
        cue === "vocalization-dog-shelter-whine"
      ))).toEqual([]);
      expect(perceptionSpy.mock.calls.slice(hearingBeforeReload).flatMap(([input]) => (
        (input.supplementalSoundSamples ?? []).filter(({ expressionEventId }) => (
          expressionEventId === whineAdmission.eventId
        ))
      ))).toEqual([]);
      audioFrontier = soundscapePlay.mock.calls.length;
      hearingFrontier = perceptionSpy.mock.calls.length;
      const restored = [(await captureContinuation(continuation, continuationRepository, 19)).trace];
      const { audio: _checkpointAudio, hearing: _checkpointHearing, ...checkpointFacts } = uninterrupted[19]!;
      const { audio: reloadAudio, hearing: reloadHearing, ...reloadFacts } = restored[0]!;
      expect(reloadFacts).toEqual(checkpointFacts);
      expect(reloadAudio).toEqual([]);
      expect(reloadHearing).toEqual([]);
      for (let step = 20; step <= 40; step += 1) {
        advancePlayerSteps(continuation, 1);
        const captured = await captureContinuation(continuation, continuationRepository, step);
        restored.push(captured.trace);
      }
      expect(restored.slice(1)).toEqual(uninterrupted.slice(20));
      expect(restored.flatMap(({ hearing }) => hearing)).toEqual([]);
      const comparableTerminal = (envelope: Record<string, unknown>) => {
        const { session: _session, integrity: _seal, regionalTravel, ...roots } = envelope;
        const travel = restorePlayerRegionalTravel(deserializeWorld(String(envelope.world)).meta.rootSeed,
          envelope.player as PlayerState, String(regionalTravel));
        if (travel === null) throw new Error("Shelter terminal failed its actual travel owner validation");
        // Validate the actual travel owner and all semantic fields. Unlike the
        // moving fall witness, this idle continuation leaves its chart clean;
        // require exact publication revision/seals and serialized travel too.
        const { revision, integrity: _chartSeal, ...chart } = travel.cartography;
        const { integrity: _travelSeal, cartography: _serializedChart, ...frame } = JSON.parse(
          String(regionalTravel),
        ) as Record<string, unknown>;
        return { revision, facts: { roots, chart, frame } };
      };
      const uninterruptedTerminal = comparableTerminal(terminal);
      const restoredTerminal = comparableTerminal(savedEnvelope(continuationRepository));
      expect(restoredTerminal.facts).toEqual(uninterruptedTerminal.facts);
      expect(restoredTerminal.revision).toBe(uninterruptedTerminal.revision);
      expect(savedEnvelope(continuationRepository).regionalTravel).toBe(terminal.regionalTravel);
      const sourceTransitions = uninterrupted.filter((trace, index) => index === 0
        || stableStringify([trace.source.intent, trace.assignment.currentActivity, trace.insideKennel])
          !== stableStringify([uninterrupted[index - 1]!.source.intent,
            uninterrupted[index - 1]!.assignment.currentActivity, uninterrupted[index - 1]!.insideKennel]));
      console.info("Guardian shelter-whine continuation proof:", JSON.stringify({
        scope: "controlled weather/filtered sensory fixture, not ordinary play or hours annoyance",
        acceptedSteps: 40, originPhase: whineCarry.playerStepsSinceWorldTick,
        reloadAtStep: 19, reloadPhase: (checkpoint19Envelope.perceptionCarry as typeof whineCarry).playerStepsSinceWorldTick,
        originalWhineAudio: originalWhineAudio.length,
        continuationWhineAudio: uninterrupted.flatMap(({ audio }) => audio).length,
        originalHumanHearing: uninterrupted.flatMap(({ hearing }) => hearing).length,
        reloadedSuffixHumanHearing: restored.flatMap(({ hearing }) => hearing).length,
        continuingOriginalRequestStepsAfterCooldown,
        sourceTransitions: sourceTransitions.map(({ acceptedSteps, source, assignment, insideKennel }) => ({
          acceptedSteps, intent: source.intent.kind, enteredAtTick: source.intent.enteredAtTick,
          activity: assignment.currentActivity.activity, insideKennel,
        })),
        excludedPublicationFields: ["session", "envelope integrity"],
      }));
    } finally { continuation.destroy(); }
    // The later original whineRecord branch retains its independent exact-one
    // T+1 hearing proof; do not count this new reference continuation twice.
    perceptionSpy.mockClear();

    const tamperedActivityCarry = structuredClone(whineCarry);
    const tamperedActivityAdmission =
      tamperedActivityCarry.situatedExpressionAdmissions.records.find(
        ({ kind }) => kind === "guardian-dog-shelter-whine",
      );
    if (tamperedActivityAdmission === undefined) {
      throw new Error("rest-whine activity tamper fixture omitted its admission");
    }
    tamperedActivityAdmission.activityTransactionId =
      `${whineAssignment.currentActivity.transactionId}:forged`;
    const rejectedActivity = await createTideweftRuntime(new MemoryRepository(
      withCurrentEnvelopeFields(whineRecord, {
        perceptionCarry: tamperedActivityCarry,
      }),
    ));
    expect(rejectedActivity.getUIView().saveWarning?.message).toBe(
      "LOCAL AUTOSAVE UNREADABLE",
    );
    rejectedActivity.destroy();

    const tamperedShelterScoreCarry = structuredClone(whineCarry);
    const tamperedShelterScoreAdmission =
      tamperedShelterScoreCarry.situatedExpressionAdmissions.records.find(
        ({ kind }) => kind === "guardian-dog-shelter-whine",
      );
    if (typeof tamperedShelterScoreAdmission?.shelterIntentScore !== "number") {
      throw new Error("rest-whine score tamper fixture omitted its cognition receipt");
    }
    tamperedShelterScoreAdmission.shelterIntentScore =
      tamperedShelterScoreAdmission.shelterIntentScore >= FIXED_POINT
        ? FIXED_POINT - 1
        : tamperedShelterScoreAdmission.shelterIntentScore + 1;
    const rejectedShelterScore = await createTideweftRuntime(new MemoryRepository(
      withCurrentEnvelopeFields(whineRecord, {
        perceptionCarry: tamperedShelterScoreCarry,
      }),
    ));
    expect(rejectedShelterScore.getUIView().saveWarning?.message).toBe(
      "LOCAL AUTOSAVE UNREADABLE",
    );
    rejectedShelterScore.destroy();

    // The score receipt remains bound after the audible event expires. A
    // recent-only cooldown memory keeps the literal score-bearing trigger,
    // while the working-animal transaction independently keeps its own ID.
    const cooldownRepository = new MemoryRepository(whineRecord);
    const cooldownRuntime = await createTideweftRuntime(cooldownRepository);
    expect(cooldownRuntime.getUIView().saveWarning).toBeUndefined();
    expect(cooldownRuntime.getRenderView().player.recoveryKind).toBe("rest");
    cooldownRuntime.dispatchUI({ type: "recover", action: "cancel" });
    expect(cooldownRuntime.getRenderView().player.recoveryKind).toBeUndefined();
    // With accelerated REST cancelled, this establishes the frame clock and
    // advances exactly the event's eight remaining fixed steps without closing
    // the ten-step world interval.
    advancePlayerSteps(cooldownRuntime, 8);
    await cooldownRuntime.save();
    const cooldownRecord = cooldownRepository.snapshot();
    const cooldownCarry = savedEnvelope(cooldownRepository)
      .perceptionCarry as typeof whineCarry;
    const cooldownChannel = cooldownCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === whineGuardian.identity.stableId,
    );
    const cooldownAdmission = cooldownCarry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-shelter-whine",
    );
    expect(cooldownChannel?.state.active).toBeNull();
    expect(cooldownChannel?.state.recent).toContainEqual(expect.objectContaining({
      triggerEventId: whineAdmission.triggerEventId,
      meaning: "guardian-dog-shelter-whine",
      priority: 740_000,
    }));
    if (typeof cooldownAdmission?.shelterIntentScore !== "number") {
      throw new Error("cooldown shelter-whine fixture omitted its score receipt");
    }
    cooldownRuntime.destroy();

    const tamperedCooldownCarry = structuredClone(cooldownCarry);
    const tamperedCooldownAdmission =
      tamperedCooldownCarry.situatedExpressionAdmissions.records.find(
        ({ kind }) => kind === "guardian-dog-shelter-whine",
      );
    if (typeof tamperedCooldownAdmission?.shelterIntentScore !== "number") {
      throw new Error("cooldown shelter-whine tamper omitted its score receipt");
    }
    tamperedCooldownAdmission.shelterIntentScore =
      tamperedCooldownAdmission.shelterIntentScore >= FIXED_POINT
        ? FIXED_POINT - 1
        : tamperedCooldownAdmission.shelterIntentScore + 1;
    const rejectedCooldownScore = await createTideweftRuntime(new MemoryRepository(
      withCurrentEnvelopeFields(cooldownRecord, {
        perceptionCarry: tamperedCooldownCarry,
      }),
    ));
    expect(rejectedCooldownScore.getUIView().saveWarning?.message).toBe(
      "LOCAL AUTOSAVE UNREADABLE",
    );
    rejectedCooldownScore.destroy();

    // A pre-admission REST receipt proves this listener was not sleeping.
    // Resealing only the quiet-call listener bit must not manufacture an
    // unheard branch from otherwise authentic causal roots.
    const forgedSleepingCarry = structuredClone(whineCarry);
    const forgedSleepingAdmission = forgedSleepingCarry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-shelter-whine",
    );
    if (forgedSleepingAdmission === undefined) {
      throw new Error("rest-whine listener tamper fixture omitted its admission");
    }
    forgedSleepingAdmission.listenerWasSleepingAtAdmission = true;
    const rejectedSleepingFact = await createTideweftRuntime(new MemoryRepository(
      withCurrentEnvelopeFields(whineRecord, {
        perceptionCarry: forgedSleepingCarry,
      }),
    ));
    expect(rejectedSleepingFact.getUIView().saveWarning?.message).toBe(
      "LOCAL AUTOSAVE UNREADABLE",
    );
    rejectedSleepingFact.destroy();

    const forgedSourceGuardian = setDogActorIntent(whineGuardian, {
      kind: "seek-shelter",
      cause: { kind: "condition", referenceId: "condition:forged-weather-exposure" },
      enteredAtTick: whineGuardian.intent.enteredAtTick,
      nextThinkTick: whineGuardian.intent.nextThinkTick,
    });
    const forgedSourceRoster = replaceDogActorInRoster(whineRoster!, forgedSourceGuardian);
    if (forgedSourceRoster === null) {
      throw new Error("rest-whine source tamper fixture rejected its canonical actor");
    }
    const rejectedSource = await createTideweftRuntime(new MemoryRepository(
      withCurrentEnvelopeFields(whineRecord, {
        dogActorRoster: serializeDogActorRoster(forgedSourceRoster),
      }),
    ));
    expect(rejectedSource.getUIView().saveWarning?.message).toBe(
      "LOCAL AUTOSAVE UNREADABLE",
    );
    rejectedSource.destroy();

    const { integrity: _currentIntegrity, playerExpressionRecency: _futurePlayerExpressionRecency, ...whineFields } = whineEnvelope;
    const {
      animalContactAcousticCarry: _currentAnimalContactCarry,
      actorVocalizationSamples: _currentActorVocalizationSamples,
      intervalStartWasSleeping: _currentIntervalStartWasSleeping,
      playerStepStateAnchor: _currentPlayerStepStateAnchor,
      playerStepStateSamples: _currentPlayerStepStateSamples,
      situatedExpressionAdmissions: _currentSituatedExpressionAdmissions,
      situatedExpressionChannels: _currentSituatedExpressionChannels,
      ...v7WhineCarryBase
    } = whineCarry as Readonly<Record<string, unknown>>;
    // Keep this retired-format witness narrowly bound to its actual whine;
    // same-tick current resident weather speech belongs to the live proof below.
    const v7WhineCarry: Readonly<Record<string, unknown>> = {
      ...v7WhineCarryBase,
      actorVocalizationSamples: whineCarry.actorVocalizationSamples.filter(
        ({ expressionEventId }) => expressionEventId === whineAdmission.eventId,
      ),
      situatedExpressionAdmissions: {
        version: 1,
        records: whineCarry.situatedExpressionAdmissions.records.filter(
          ({ kind }) => kind === "guardian-dog-shelter-whine",
        ),
      },
      situatedExpressionChannels: {
        version: 1,
        channels: whineCarry.situatedExpressionChannels.channels.filter(
          ({ sourceActorId }) => sourceActorId === whineGuardian.identity.stableId,
        ),
      },
    };
    const v36Base = {
      ...whineFields,
      version: 36,
      perceptionCarry: { ...v7WhineCarry, version: 5 },
    };
    const v36WhineRecord: SaveRecord = {
      ...whineRecord,
      payloadVersion: 36,
      updatedAt: whineRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v36Base,
        integrity: gameSaveEnvelopeIntegrity(v36Base),
      }),
    };
    await expectRetiredVoiceSaveUntouched(v36WhineRecord);

    // A whine cannot masquerade as an older growl tuple in the full current
    // carry either; retirement alone is not the admission-authentication proof.
    const legacyWhineTupleCarry = {
      ...whineCarry,
      situatedExpressionAdmissions: {
        version: 1,
        records: whineCarry.situatedExpressionAdmissions.records.map((record) => (
          record.kind === "guardian-dog-shelter-whine"
            ? { ...record, kind: "guardian-dog-defensive-growl" }
            : record
        )),
      },
    };
    const legacyWhineTupleRecord = withCurrentEnvelopeFields(whineRecord, {
      perceptionCarry: legacyWhineTupleCarry,
    });
    const legacyWhineTupleRepository = new MemoryRepository(legacyWhineTupleRecord);
    const rejectedLegacyWhineTuple = await createTideweftRuntime(legacyWhineTupleRepository);
    expect(rejectedLegacyWhineTuple.getUIView().saveWarning?.message)
      .toBe("LOCAL AUTOSAVE UNREADABLE");
    expect(legacyWhineTupleRepository.snapshot()).toEqual(legacyWhineTupleRecord);
    rejectedLegacyWhineTuple.destroy();

    // The obsolete v37/carry-v6 whine checkpoint is recognized without replay,
    // partial adoption or overwrite. Full current reload remains required.
    expect(whineCarry.version).toBe(14);
    const v37Base = {
      ...whineFields,
      version: 37,
      perceptionCarry: { ...v7WhineCarry, version: 6 },
    };
    const v37WhineRecord: SaveRecord = {
      ...whineRecord,
      payloadVersion: 37,
      updatedAt: whineRecord.updatedAt + 2,
      worldJson: JSON.stringify({
        ...v37Base,
        integrity: gameSaveEnvelopeIntegrity(v37Base),
      }),
    };
    await expectRetiredVoiceSaveUntouched(v37WhineRecord);
    soundscapePlay.mockClear();

    const resumedRepository = new MemoryRepository(whineRecord);
    const resumed = await createTideweftRuntime(resumedRepository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(resumed.getRenderView().player.recoveryKind).toBe("rest");
    expect(resumed.getUIView().expressionCaption).toMatchObject({
      text: "WHINE...",
      animalCallKind: "whine",
    });
    await resumed.save();
    const exactReload = savedEnvelope(resumedRepository);
    expect(exactReload.perceptionCarry).toEqual(whineEnvelope.perceptionCarry);
    expect(exactReload.dogActorRoster).toBe(whineEnvelope.dogActorRoster);
    expect(exactReload.settlementWorkingAnimals).toBe(
      whineEnvelope.settlementWorkingAnimals,
    );
    expect(exactReload.player).toEqual(whineEnvelope.player);

    advanceWaitFrames(resumed, 1);
    await resumed.save();
    const continuedEnvelope = savedEnvelope(resumedRepository);
    const continuedCarry = continuedEnvelope.perceptionCarry as typeof whineCarry;
    const continuedGuardian = deserializeDogActorRoster(
      continuedEnvelope.dogActorRoster,
    )?.actors[0];
    expect(continuedGuardian?.intent.kind).toBe("seek-shelter");
    expect(continuedCarry.actorVocalizationSamples.some(({ expressionEventId }) => (
      expressionEventId === whineAdmission.eventId
    ))).toBe(false);
    expect(continuedCarry.situatedExpressionAdmissions.records.some(({ kind }) => (
      kind === "guardian-dog-shelter-whine"
    ))).toBe(false);
    expect((continuedEnvelope.player as PlayerState).timeAction).toMatchObject({
      kind: "rest",
      startedAtWorldTick: preWhineRest.startedAtWorldTick,
    });
    expect(resumed.getRenderView().player.recoveryKind).toBe("rest");
    const whineSoundCallOrdinals = perceptionSpy.mock.calls.flatMap(([input], ordinal) => (
      (input.supplementalSoundSamples ?? []).some(({ expressionEventId }) => (
        expressionEventId === whineAdmission.eventId
      )) ? [ordinal] : []
    ));
    expect(whineSoundCallOrdinals).toHaveLength(1);
    const whineSoundCallOrdinal = whineSoundCallOrdinals[0];
    if (whineSoundCallOrdinal === undefined) {
      throw new Error("shelter whine never entered shared human perception");
    }
    expect(perceptionSpy.mock.calls[whineSoundCallOrdinal]?.[0].supplementalSoundSamples
      ?.filter(({ expressionEventId }) => expressionEventId === whineAdmission.eventId))
      .toEqual([
        expect.objectContaining({
          expressionEventId: whineAdmission.eventId,
          sourceActorId: whineGuardian.identity.stableId,
          soundClass: "animal-call",
          soundInterrupt: "none",
        }),
      ]);
    const whineHumanBatches = perceptionSpy.mock.results[whineSoundCallOrdinal]?.value;
    expect(whineHumanBatches.some(({ observations }: {
      observations: readonly { perceivedClass: string; interrupt: string }[];
    }) => observations.some(({ perceivedClass, interrupt }) => (
      perceivedClass === "animal-call" && interrupt === "none"
    )))).toBe(true);
    resumed.destroy();
    perceptionSpy.mockRestore();

    guardianPerceptionHarness.mode = null;
    const waitRepository = new MemoryRepository(preparedVisibleWhineRecord);
    const waiting = await createTideweftRuntime(waitRepository);
    expect(waiting.getUIView().saveWarning).toBeUndefined();
    expect(waiting.getUIView().controls).toMatchObject({
      canWait: true,
      waitActive: false,
    });
    waiting.dispatchUI({ type: "wait", action: "begin" });
    expect(waiting.getUIView().controls?.waitActive).toBe(true);
    let waitCarry: typeof whineCarry | null = null;
    let waitStillActiveAtWhine = false;
    for (let frame = 0; frame < 20 && waiting.getUIView().controls?.waitActive; frame += 1) {
      advanceWaitFrames(waiting, 1);
      await waiting.save();
      const candidate = savedEnvelope(waitRepository).perceptionCarry as typeof whineCarry;
      if (candidate.situatedExpressionAdmissions.records.some(({ kind }) => (
        kind === "guardian-dog-shelter-whine"
      ))) {
        waitCarry = candidate;
        waitStillActiveAtWhine = waiting.getUIView().controls?.waitActive === true;
        break;
      }
    }
    if (waitCarry === null) {
      throw new Error("WAIT shelter-whine fixture never admitted its world sound");
    }
    expect(waitStillActiveAtWhine).toBe(true);
    expect(waitCarry.actorVocalizationSamples).toContainEqual(expect.objectContaining({
      soundClass: "animal-call",
      soundInterrupt: "none",
    }));
    waiting.destroy();

    guardianPerceptionHarness.mode = null;
    const awakeRepository = new MemoryRepository(preparedSleepWhineRecord);
    const awake = await createTideweftRuntime(awakeRepository);
    expect(awake.getUIView().saveWarning).toBeUndefined();
    advancePlayerSteps(awake, Math.max(10, (wakeTick - nearDawnTick) * 10));
    await awake.save();
    const awakeWhineEnvelope = savedEnvelope(awakeRepository);
    const awakeWhineCarry = awakeWhineEnvelope.perceptionCarry as typeof whineCarry;
    const awakeWhineAdmission = awakeWhineCarry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-shelter-whine",
    );
    if (awakeWhineAdmission === undefined) {
      throw new Error("awake shelter-whine counterfactual omitted its admission");
    }
    expect(awakeWhineAdmission.listenerWasSleepingAtAdmission).toBe(false);
    expect(awakeWhineCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    )?.reception).toMatchObject({
      kind: expect.stringMatching(/^heard-(visible|unseen)$/),
    });
    expect(awake.getUIView().expressionCaption).toMatchObject({
      text: "WHINE...",
      animalCallKind: "whine",
    });
    expect(awake.getUIView().controls).toMatchObject({
      canRecover: true,
      recoveryKind: "sleep",
      recoveryActive: false,
    });
    awake.dispatchUI({ type: "recover", action: "begin" });
    await awake.save();
    const postWhineSleepRecord = awakeRepository.snapshot();
    const postWhineSleepEnvelope = savedEnvelope(awakeRepository);
    expect((postWhineSleepEnvelope.player as PlayerState).timeAction).toMatchObject({
      kind: "sleep",
      startedAtWorldTick: awakeWhineAdmission.acceptedAtTick,
    });
    awake.destroy();

    const postWhineSleeper = await createTideweftRuntime(
      new MemoryRepository(postWhineSleepRecord),
    );
    expect(postWhineSleeper.getUIView().saveWarning).toBeUndefined();
    expect(postWhineSleeper.getRenderView().player.recoveryKind).toBe("sleep");
    postWhineSleeper.destroy();

    guardianPerceptionHarness.mode = null;
    const sleepRepository = new MemoryRepository(preparedSleepWhineRecord);
    const sleeping = await createTideweftRuntime(sleepRepository);
    expect(sleeping.getUIView().saveWarning).toBeUndefined();
    expect(sleeping.getUIView().controls).toMatchObject({
      canRecover: true,
      recoveryKind: "sleep",
      recoveryActive: false,
    });
    sleeping.dispatchUI({ type: "recover", action: "begin" });
    advanceWaitFrames(sleeping, Math.max(1, wakeTick - nearDawnTick));
    await sleeping.save();
    const sleepEnvelope = savedEnvelope(sleepRepository);
    const sleepCarry = sleepEnvelope.perceptionCarry as typeof whineCarry;
    const sleepAdmission = sleepCarry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-shelter-whine",
    );
    if (sleepAdmission === undefined) {
      throw new Error("sleep-whine branch omitted its world-authoritative admission");
    }
    expect(sleepAdmission.listenerWasSleepingAtAdmission).toBe(true);
    expect(sleepAdmission.eventId).toBe(awakeWhineAdmission.eventId);
    expect(sleepCarry.actorVocalizationSamples.filter(({ expressionEventId }) => (
      expressionEventId === sleepAdmission.eventId
    ))).toEqual([
      expect.objectContaining({
        expressionEventId: sleepAdmission.eventId,
        sourceActorId: guardian.identity.stableId,
        soundClass: "animal-call",
        soundInterrupt: "none",
      }),
    ]);
    expect(sleepCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === guardian.identity.stableId,
    )).toMatchObject({
      reception: null,
      state: {
        active: {
          eventId: sleepAdmission.eventId,
          meaning: "guardian-dog-shelter-whine",
          vocalization: "dog-shelter-whine",
          audioAcknowledged: true,
        },
      },
    });
    expect(sleeping.getRenderView().expressions ?? []).toEqual([]);
    expect(sleeping.getUIView().expressionCaption).toBeUndefined();
    expect((sleepEnvelope.player as PlayerState).timeAction).toMatchObject({ kind: "sleep" });
    expect(sleeping.getRenderView().player.recoveryKind).toBe("sleep");
    sleeping.destroy();

    const cancelRepository = new MemoryRepository(sleepRepository.snapshot());
    const cancelling = await createTideweftRuntime(cancelRepository);
    expect(cancelling.getUIView().saveWarning).toBeUndefined();
    cancelling.dispatchUI({ type: "recover", action: "cancel" });
    expect(cancelling.getRenderView().player.recoveryKind).toBeUndefined();
    // Move beyond the phase-zero admission without closing its expression
    // interval, then begin a distinct replacement sleep. Only a recovery that
    // predates admission can attest the immutable listener bit.
    advancePlayerSteps(cancelling, 1);
    expect(cancelling.getUIView().controls).toMatchObject({
      canRecover: true,
      recoveryKind: "sleep",
      recoveryActive: false,
    });
    cancelling.dispatchUI({ type: "recover", action: "begin" });
    await cancelling.save();
    const replacementSleepRecord = cancelRepository.snapshot();
    const replacementSleepEnvelope = savedEnvelope(cancelRepository);
    const replacementSleep = (replacementSleepEnvelope.player as PlayerState).timeAction;
    if (replacementSleep === null) {
      throw new Error("sleep-whine fixture omitted its replacement sleep receipt");
    }
    expect(replacementSleep).toMatchObject({
      kind: "sleep",
      startedAtWorldTick: sleepAdmission.acceptedAtTick,
    });
    expect(replacementSleep.startedAtPlayerStepPhase).toBeGreaterThan(
      sleepAdmission.admittedAtPlayerStepPhase ?? -1,
    );
    cancelling.destroy();

    const replacementSleepReload = await createTideweftRuntime(
      new MemoryRepository(replacementSleepRecord),
    );
    expect(replacementSleepReload.getUIView().saveWarning).toBeUndefined();
    expect(replacementSleepReload.getRenderView().player.recoveryKind).toBe("sleep");
    expect(replacementSleepReload.getUIView().expressionCaption).toBeUndefined();
    replacementSleepReload.destroy();
  }, 240_000);

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
    expect(initialGuardian.circadian).toBeUndefined();
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
    const guardianCustody = advancedSettlement.domesticCustodies.find(({ relationshipId }) => (
      relationshipId === advancedAssignment.workerCustodyRelationshipId
    ));
    if (guardianCustody === undefined || guardianCustody.homeStructure.kind !== "kennel") {
      throw new Error("guardian witness lost its actual kennel custody");
    }
    expect(advancedGuardian.circadian).toMatchObject({
      policy: { profileId: "day-active", drivers: ["clock"] },
      restDestinationId: settlementWorkingDogCircadianRestDestinationId(
        advancedGuardian.identity.stableId,
        guardianCustody.homeStructure.structureId,
      ),
      posture: { state: "awake" },
    });
    expect(advancedGuardian.perception.beliefs.some(({ sourceObservationId }) => (
      sourceObservationId === reachedObservationId
    ))).toBe(true);
    expect(advancedAssignment.currentActivity).toMatchObject({
      ordinal: 1,
      activity: "investigate",
      cause: { kind: "perception", referenceId: reachedObservationId },
      perceivedArea: reachedArea,
    });
    const advancedCarry = advancedEnvelope.perceptionCarry as {
      animalContactAcousticCarry: {
        version: number;
        records: Array<{
          beforePosition: WorldPosition;
          event: WorldAcousticEvent;
        }>;
      };
      actorVocalizationSamples: Array<{
        expressionEventId: string;
        position: WorldPosition;
        soundClass: string;
        soundInterrupt: string;
        sourceActorId: string;
      }>;
      situatedExpressionAdmissions: {
        records: Array<Record<string, unknown>>;
      };
      situatedExpressionChannels: {
        channels: Array<{
          sourceActorId: string;
          reception: unknown;
          state: { active: null | Record<string, unknown> };
        }>;
      };
    };
    const dogAdmission = advancedCarry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "guardian-dog-warning",
    );
    const dogChannel = advancedCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === advancedGuardian.identity.stableId,
    );
    expect(dogAdmission).toMatchObject({
      kind: "guardian-dog-warning",
      sourceActorId: advancedGuardian.identity.stableId,
      triggerEventId: advancedAssignment.currentActivity.transactionId,
      assignmentId: advancedAssignment.assignmentId,
      activityTransactionId: advancedAssignment.currentActivity.transactionId,
      sourceObservationId: reachedObservationId,
      acceptedAtTick: deserializeWorld(String(advancedEnvelope.world)).meta.completedTick,
    });
    expect(advancedCarry.actorVocalizationSamples).toEqual([
      expect.objectContaining({
        expressionEventId: dogAdmission?.eventId,
        position: advancedGuardian.address.position,
        soundClass: "animal-alarm",
        soundInterrupt: "strong",
        sourceActorId: advancedGuardian.identity.stableId,
      }),
    ]);
    const dogSample = advancedCarry.actorVocalizationSamples[0];
    if (dogSample === undefined) throw new Error("guardian warning omitted its world sound");
    expect(dogChannel).toMatchObject({
      sourceActorId: advancedGuardian.identity.stableId,
      state: {
        active: {
          eventId: dogAdmission?.eventId,
          meaning: "guardian-dog-warning",
          family: "animal-signal",
          vocalization: "dog-warning-bark",
          audioAcknowledged: true,
        },
      },
    });
    expect(dogChannel?.reception).toMatchObject({
      kind: "heard-unseen",
      directVisualReceipt: false,
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
    const guardianPhysicalContact = advancedCarry.animalContactAcousticCarry.records.find(
      ({ event }) => event.sourceId === advancedGuardian.identity.stableId,
    );
    if (guardianPhysicalContact === undefined) {
      throw new Error("guardian witness omitted its committed physical contact");
    }

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

    // Branch from the real pending contact and place the other current dog at
    // its source locus. The next authoritative frame must admit one anonymous
    // physical belief to that listener, never to the source dog itself, and
    // must persist cognition without adding a replay marker to the save.
    const dogHearingWorld = deserializeWorld(String(advancedEnvelope.world));
    const stagedBio0 = {
      ...advancedBio0,
      dog: repositionDogActor(advancedBio0.dog, {
        position: guardianPhysicalContact.event.sourcePosition,
        heading: advancedBio0.dog.address.heading,
        atTick: advancedBio0.tick,
      }),
    };
    const stagedPhysicalCarry = structuredClone(advancedCarry);
    stagedPhysicalCarry.animalContactAcousticCarry.records = [guardianPhysicalContact];
    const dogHearingRecord = withCurrentEnvelopeFields(advancedRecord, {
      world: serializeWorld(dogHearingWorld),
      bio0Ecology: serializeBio0Ecology(stagedBio0),
      perceptionCarry: stagedPhysicalCarry,
    });
    const dogHearingRepository = new MemoryRepository(dogHearingRecord);
    const dogHearingRuntime = await createTideweftRuntime(dogHearingRepository);
    expect(dogHearingRuntime.getUIView().saveWarning).toBeUndefined();
    advancePlayerSteps(dogHearingRuntime, 10);
    await dogHearingRuntime.save();
    const dogHearingEnvelope = savedEnvelope(dogHearingRepository);
    const heardBio0 = deserializeBio0Ecology(dogHearingEnvelope.bio0Ecology);
    const heardRoster = deserializeDogActorRoster(dogHearingEnvelope.dogActorRoster);
    const heardWork = deserializeSettlementWorkingAnimalState(
      dogHearingEnvelope.settlementWorkingAnimals,
    );
    if (heardBio0 === null || heardRoster === null || heardWork === null) {
      throw new Error("dog physical-hearing witness lost a current authority");
    }
    const contactObservationTick = dogHearingWorld.meta.completedTick + 1;
    const otherDogObservationId = `physical-hearing:${hashCanonical({
      acousticEventId: guardianPhysicalContact.event.eventId,
      observerId: stagedBio0.dog.identity.stableId,
      targetTick: contactObservationTick,
    })}`;
    const sourceSelfObservationId = `physical-hearing:${hashCanonical({
      acousticEventId: guardianPhysicalContact.event.eventId,
      observerId: advancedGuardian.identity.stableId,
      targetTick: contactObservationTick,
    })}`;
    const heardContactBelief = heardBio0.dog.perception.beliefs.find(
      ({ sourceObservationId }) => sourceObservationId === otherDogObservationId,
    );
    expect(heardContactBelief).toMatchObject({
      channel: "hearing",
      perceivedClass: guardianPhysicalContact.event.soundClass,
      subjectId: null,
      identification: "anonymous",
      firstObservedTick: contactObservationTick,
      lastObservedTick: contactObservationTick,
      sourceObservationId: otherDogObservationId,
      strongInterrupt: false,
    });
    expect(heardContactBelief?.area.radiusUnits).toBeGreaterThan(0);
    expect(heardContactBelief?.area.center).not.toEqual(
      guardianPhysicalContact.event.sourcePosition,
    );
    const heardGuardian = heardRoster.actors.find(({ identity }) => (
      identity.stableId === advancedGuardian.identity.stableId
    ));
    expect(heardGuardian?.perception.beliefs.some(({ sourceObservationId }) => (
      sourceObservationId === sourceSelfObservationId
    ))).toBe(false);
    expect(heardWork.assignments[0]?.currentTask?.sourceObservationId)
      .not.toBe(sourceSelfObservationId);
    expect(stableStringify(heardWork)).not.toContain(sourceSelfObservationId);
    expect((dogHearingEnvelope.perceptionCarry as typeof advancedCarry)
      .animalContactAcousticCarry.records.some(({ event }) => (
        event.eventId === guardianPhysicalContact.event.eventId
      ))).toBe(false);
    dogHearingRuntime.destroy();

    const dogHearingReload = await createTideweftRuntime(dogHearingRepository);
    expect(dogHearingReload.getUIView().saveWarning).toBeUndefined();
    advancePlayerSteps(dogHearingReload, 10);
    await dogHearingReload.save();
    const replayBio0 = deserializeBio0Ecology(
      savedEnvelope(dogHearingRepository).bio0Ecology,
    );
    const replayedBelief = replayBio0?.dog.perception.beliefs.find(
      ({ sourceObservationId }) => sourceObservationId === otherDogObservationId,
    );
    expect(replayedBelief?.lastObservedTick).toBe(contactObservationTick);
    expect((savedEnvelope(dogHearingRepository).perceptionCarry as typeof advancedCarry)
      .animalContactAcousticCarry.records.some(({ event }) => (
        event.eventId === guardianPhysicalContact.event.eventId
      ))).toBe(false);
    dogHearingReload.destroy();

    const recoveredRepository = new MemoryRepository(advancedRecord);
    const perceptionSpy = vi.spyOn(humanPerception, "collectExistingHumanObservations");
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
    const dogSoundIntervals = perceptionSpy.mock.calls
      .map(([input]) => input.supplementalSoundSamples ?? [])
      .filter((samples) => samples.some(
        ({ expressionEventId }) => expressionEventId === dogSample.expressionEventId,
      ));
    expect(dogSoundIntervals).toHaveLength(1);
    expect(dogSoundIntervals[0]?.filter(
      ({ expressionEventId }) => expressionEventId === dogSample.expressionEventId,
    )).toEqual([
      expect.objectContaining({
        sourceActorId: advancedGuardian.identity.stableId,
        soundClass: "animal-alarm",
      }),
    ]);
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

    // The fresh morning epoch changes deterministic think scheduling. Let the
    // guardian's newly restored neutral observation intent complete its
    // ordinary two-tick hold before presenting a distinct alarm; the alarm
    // must still force the actor-owned retreat asserted below.
    advancePlayerSteps(recovered, 10);

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
  }, 180_000);

  it("returns the neutral night guardian to its kennel, sleeps through WAIT, reloads, and wakes at its dawn", async () => {
    const nearDawnTick = WORLD_TICKS_PER_DAY + 350;
    const world = createWorld("working dog kennel sleep continuity", "wild");
    runTicks(world, nearDawnTick - world.meta.completedTick);
    world.weather.kind = "clear";
    world.weather.intensity = 0;
    world.weather.windX = 0;
    world.weather.windY = 0;
    world.weather.nextChangeTick = nearDawnTick + WORLD_TICKS_PER_DAY;

    // Advance the cheap headless world first, then let the legacy-load path
    // construct every newer authoritative root at the same near-dawn tick.
    const migrationRepository = new MemoryRepository(legacyRuntimeSaveRecord(world));
    const migration = await createTideweftRuntime(migrationRepository);
    expect(migration.getUIView().saveWarning).toBeUndefined();
    await migration.save();
    const migratedRecord = migrationRepository.snapshot();
    const migratedEnvelope = savedEnvelope(migrationRepository);
    const migratedWorld = deserializeWorld(String(migratedEnvelope.world));
    const migratedRoster = deserializeDogActorRoster(migratedEnvelope.dogActorRoster);
    const migratedWork = deserializeSettlementWorkingAnimalState(
      migratedEnvelope.settlementWorkingAnimals,
    );
    const migratedSettlement = deserializeSettlementEcologyState(
      migratedEnvelope.settlementEcology,
    );
    const guardian = migratedRoster?.actors[0];
    const assignment = migratedWork?.assignments[0];
    const custody = migratedSettlement.domesticCustodies.find(({ species }) => (
      species === "domestic-dog"
    ));
    if (
      guardian === undefined
      || assignment === undefined
      || custody === undefined
      || custody.homeStructure.kind !== "kennel"
    ) throw new Error("night guardian fixture omitted its kennel relationship");
    expect(migratedWorld.meta.completedTick).toBe(nearDawnTick);
    expect(guardian.updatedAtTick).toBe(nearDawnTick);
    expect(guardian.circadian).toBeUndefined();
    expect(assignment.workerCustodyRelationshipId).toBe(custody.relationshipId);

    const displacedPosition = connectedOpenDogPositionOutside(
      createWorldView(migratedWorld),
      custody.homeStructure.position,
      custody.homeStructure.radiusUnits,
    );
    const initialKennelDelta = worldPositionDelta(
      displacedPosition,
      custody.homeStructure.position,
    );
    const initialKennelDistance = Math.hypot(initialKennelDelta.x, initialKennelDelta.y);
    const dutyDelta = worldPositionDelta(displacedPosition, assignment.dutyArea.center);
    expect(initialKennelDistance).toBeGreaterThan(custody.homeStructure.radiusUnits);
    expect(Math.hypot(dutyDelta.x, dutyDelta.y)).toBeLessThanOrEqual(
      assignment.dutyArea.radiusUnits,
    );

    let preparedGuardian = replaceDogActorPhysiology(guardian, {
      needs: { hunger: 0, thirst: 0, rest: 0, safety: 0, company: 0 },
      condition: {
        health: FIXED_POINT,
        wetness: 0,
        coldStress: 0,
        heatStress: 0,
        exhaustion: 100_000,
        injuries: [],
      },
      humanFamiliarity: guardian.humanFamiliarity,
      atTick: nearDawnTick,
    });
    preparedGuardian = setDogActorIntent(preparedGuardian, {
      kind: "observe",
      cause: { kind: "world-event", referenceId: "event:test-neutral-night-watch" },
      enteredAtTick: nearDawnTick,
      nextThinkTick: nearDawnTick + WORLD_TICKS_PER_DAY,
    });
    preparedGuardian = repositionDogActor(preparedGuardian, {
      position: displacedPosition,
      heading: guardian.address.heading,
      atTick: nearDawnTick,
    });
    const preparedRoster = replaceDogActorInRoster(migratedRoster, preparedGuardian);
    if (preparedRoster === null) throw new Error("night guardian fixture rejected its actor");
    const preparedRecord = withCurrentEnvelopeFields(migratedRecord, {
      dogActorRoster: serializeDogActorRoster(preparedRoster),
    });
    migration.destroy();

    // Make the perception seam a complete empty snapshot for this observer so
    // a co-located handler or ambient alarm cannot mask clock-owned behavior.
    guardianPerceptionHarness.observerId = guardian.identity.stableId;
    guardianPerceptionHarness.handlerId = "TEST-NO-NIGHT-GUARDIAN-SUBJECT";
    const repository = new MemoryRepository(preparedRecord);
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();

    let priorDistance = initialKennelDistance;
    let priorAwakeExhaustion = preparedGuardian.condition.exhaustion;
    let sawPhysicalProgress = false;
    let sawAwakeWithoutRecovery = false;
    let restingTick: number | null = null;
    let restingPosition: WorldPosition | null = null;
    for (let elapsed = 0; elapsed < 12 && restingTick === null; elapsed += 1) {
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const envelope = savedEnvelope(repository);
      const steppedWorld = deserializeWorld(String(envelope.world));
      const steppedDog = deserializeDogActorRoster(envelope.dogActorRoster)?.actors[0];
      if (steppedDog === undefined || steppedDog.circadian === undefined) {
        throw new Error("runtime did not persist the guardian routine");
      }
      const kennelDelta = worldPositionDelta(
        steppedDog.address.position,
        custody.homeStructure.position,
      );
      const kennelDistance = Math.hypot(kennelDelta.x, kennelDelta.y);
      sawPhysicalProgress ||= kennelDistance < priorDistance;
      if (steppedDog.circadian.posture.state === "resting") {
        expect(kennelDistance).toBeLessThanOrEqual(custody.homeStructure.radiusUnits);
        // The work-return area shares this center but is much narrower. Holding
        // here proves the destination is the kennel, not the livestock worksite.
        expect(kennelDistance).toBeGreaterThan(
          SETTLEMENT_WORKING_ANIMAL_RETURN_RADIUS_UNITS,
        );
        restingTick = steppedWorld.meta.completedTick;
        restingPosition = steppedDog.address.position;
        expect(steppedDog.circadian).toMatchObject({
          posture: { state: "resting", enteredAtTick: restingTick },
          restDestinationArrived: true,
          restDestinationId: settlementWorkingDogCircadianRestDestinationId(
            steppedDog.identity.stableId,
            custody.homeStructure.structureId,
          ),
        });
      } else {
        expect(steppedDog.circadian.posture.state).toBe("awake");
        if (kennelDistance > custody.homeStructure.radiusUnits) {
          expect(steppedDog.circadian.restDestinationArrived).toBe(false);
          expect(steppedDog.condition.exhaustion).toBeGreaterThanOrEqual(
            priorAwakeExhaustion,
          );
          sawAwakeWithoutRecovery = true;
          priorAwakeExhaustion = steppedDog.condition.exhaustion;
        }
      }
      priorDistance = kennelDistance;
    }
    expect(sawPhysicalProgress).toBe(true);
    expect(sawAwakeWithoutRecovery).toBe(true);
    if (restingTick === null || restingPosition === null) {
      throw new Error("guardian did not physically reach and settle in its kennel");
    }

    for (let tick = 0; tick < 11; tick += 1) advancePlayerSteps(runtime, 10);
    await runtime.save();
    const beforeWaitEnvelope = savedEnvelope(repository);
    const beforeWaitDog = deserializeDogActorRoster(
      beforeWaitEnvelope.dogActorRoster,
    )?.actors[0];
    expect(deserializeWorld(String(beforeWaitEnvelope.world)).meta.completedTick)
      .toBe(restingTick + 11);
    expect(beforeWaitDog?.circadian?.posture).toEqual({
      state: "resting",
      enteredAtTick: restingTick,
    });
    expect(beforeWaitDog?.address.position).toEqual(restingPosition);

    runtime.dispatchUI({ type: "wait", action: "begin" });
    expect(runtime.getUIView().controls?.waitActive).toBe(true);
    advanceWaitFrames(runtime, 100);
    expect(runtime.getUIView().controls?.waitActive).toBe(false);
    await runtime.save();
    const asleepRecord = repository.snapshot();
    const asleepEnvelope = savedEnvelope(repository);
    const asleepTick = deserializeWorld(String(asleepEnvelope.world)).meta.completedTick;
    const asleepDog = deserializeDogActorRoster(asleepEnvelope.dogActorRoster)?.actors[0];
    if (asleepDog?.circadian === undefined) {
      throw new Error("WAIT lost the guardian routine receipt");
    }
    expect(asleepTick).toBe(restingTick + 21);
    expect(asleepDog.address.position).toEqual(restingPosition);
    expect(asleepDog.circadian).toMatchObject({
      posture: { state: "asleep", enteredAtTick: asleepTick },
      restDestinationArrived: true,
    });
    const asleepRosterBytes = asleepEnvelope.dogActorRoster;
    runtime.destroy();

    // Branch from the authenticated sleeping save at its exact current tick.
    // The activity transaction is the sole pending owner; no stale/future
    // task transaction is needed to exercise load-time circadian recovery.
    const asleepRoster = deserializeDogActorRoster(asleepEnvelope.dogActorRoster);
    const asleepWork = deserializeSettlementWorkingAnimalState(
      asleepEnvelope.settlementWorkingAnimals,
    );
    const asleepAssignment = asleepWork?.assignments[0];
    if (asleepRoster === null || asleepAssignment === undefined) {
      throw new Error("sleeping guardian recovery fixture lost its work relationship");
    }
    expect(asleepAssignment).toMatchObject({
      currentTask: null,
      pendingActivity: null,
      pendingTaskTransition: null,
    });
    const pendingAlarm = createActorObservation({
      id: `OBS-night-pending-investigate-${asleepTick}`,
      observerId: asleepDog.identity.stableId,
      observedAtTick: asleepTick,
      channel: "hearing",
      perceivedClass: "animal-alarm",
      subjectId: null,
      area: asleepAssignment.dutyArea,
      confidence: 400_000,
      salience: 400_000,
      identification: "anonymous",
      interrupt: "none",
    });
    if (pendingAlarm === null) throw new Error("pending recovery alarm was malformed");
    const pendingPerception = stepActorPerception(
      createActorPerceptionState(asleepDog.identity.stableId, asleepTick - 1),
      { tick: asleepTick, observations: [pendingAlarm] },
    );
    if (pendingPerception === null) {
      throw new Error("pending recovery alarm did not enter dog cognition");
    }
    const pendingActivity = stageSettlementWorkingAnimalActivity(asleepWork, {
      assignmentId: asleepAssignment.assignmentId,
      tick: asleepTick,
      perception: pendingPerception,
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
    if (pendingActivity?.transaction === null || pendingActivity === null) {
      throw new Error("pending recovery investigation was not staged");
    }
    expect(pendingActivity.transaction).toMatchObject({
      activity: "investigate",
      acceptedAtTick: asleepTick,
      cause: { kind: "perception", referenceId: pendingAlarm.id },
    });
    expect(pendingActivity.state.assignments[0]).toMatchObject({
      currentTask: null,
      pendingActivity: { activity: "investigate" },
      pendingTaskTransition: null,
    });

    const pendingDog = replaceDogActorPerception(asleepDog, pendingPerception);
    expect(pendingDog.circadian?.posture.state).toBe("asleep");
    const pendingRoster = replaceDogActorInRoster(asleepRoster, pendingDog);
    if (pendingRoster === null) throw new Error("pending recovery dog roster was rejected");
    const pendingRecord = withCurrentEnvelopeFields(asleepRecord, {
      dogActorRoster: serializeDogActorRoster(pendingRoster),
      settlementWorkingAnimals: serializeSettlementWorkingAnimalState(
        pendingActivity.state,
      ),
    });
    const pendingRepository = new MemoryRepository(pendingRecord);
    const recoveredPending = await createTideweftRuntime(pendingRepository);
    expect(recoveredPending.getUIView().saveWarning).toBeUndefined();
    await recoveredPending.save();
    const recoveredPendingEnvelope = savedEnvelope(pendingRepository);
    const recoveredPendingWork = deserializeSettlementWorkingAnimalState(
      recoveredPendingEnvelope.settlementWorkingAnimals,
    );
    const recoveredPendingDog = deserializeDogActorRoster(
      recoveredPendingEnvelope.dogActorRoster,
    )?.actors[0];
    if (recoveredPendingDog?.circadian === undefined) {
      throw new Error("pending work recovery lost the same dog's circadian receipt");
    }
    expect(recoveredPendingWork?.assignments[0]).toMatchObject({
      currentActivity: {
        ordinal: pendingActivity.transaction.ordinal,
        activity: "investigate",
        acceptedAtTick: asleepTick,
      },
      lastResolvedActivityOrdinal: pendingActivity.transaction.ordinal,
      pendingActivity: null,
      currentTask: null,
      pendingTaskTransition: null,
    });
    expect(recoveredPendingDog.identity).toEqual(asleepDog.identity);
    expect(recoveredPendingDog.address).toEqual(asleepDog.address);
    expect(recoveredPendingDog.updatedAtTick).toBe(asleepTick);
    expect(recoveredPendingDog.perception).toEqual(pendingPerception);
    expect(recoveredPendingDog.circadian).toMatchObject({
      policy: asleepDog.circadian.policy,
      restDestinationId: asleepDog.circadian.restDestinationId,
      restDestinationArrived: true,
      posture: { state: "awake", enteredAtTick: asleepTick },
    });
    const recoveredPendingRosterBytes = recoveredPendingEnvelope.dogActorRoster;
    const recoveredPendingWorkBytes = recoveredPendingEnvelope.settlementWorkingAnimals;
    recoveredPending.destroy();

    const replayedPending = await createTideweftRuntime(pendingRepository);
    expect(replayedPending.getUIView().saveWarning).toBeUndefined();
    await replayedPending.save();
    const replayedPendingEnvelope = savedEnvelope(pendingRepository);
    expect(replayedPendingEnvelope.dogActorRoster).toBe(recoveredPendingRosterBytes);
    expect(replayedPendingEnvelope.settlementWorkingAnimals).toBe(recoveredPendingWorkBytes);
    replayedPending.destroy();

    const reloadRepository = new MemoryRepository(asleepRecord);
    const reloaded = await createTideweftRuntime(reloadRepository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    await reloaded.save();
    const reloadEnvelope = savedEnvelope(reloadRepository);
    expect(reloadEnvelope.dogActorRoster).toBe(asleepRosterBytes);
    const reloadedDog = deserializeDogActorRoster(reloadEnvelope.dogActorRoster)?.actors[0];
    if (reloadedDog?.circadian === undefined) {
      throw new Error("reload lost the sleeping guardian receipt");
    }
    const wakeTick = firstLivingCircadianActiveTick(
      reloadedDog.identity.stableId,
      asleepTick,
      asleepTick + WORLD_TICKS_PER_DAY,
      reloadedDog.circadian.policy,
    );
    if (wakeTick === null) throw new Error("guardian has no bounded dawn wake tick");
    expect(wakeTick % WORLD_TICKS_PER_DAY).toBeGreaterThanOrEqual(330);
    expect(wakeTick % WORLD_TICKS_PER_DAY).toBeLessThanOrEqual(390);

    const ticksBeforeWake = wakeTick - asleepTick - 1;
    if (ticksBeforeWake > 0) advancePlayerSteps(reloaded, ticksBeforeWake * 10);
    await reloaded.save();
    const beforeWakeEnvelope = savedEnvelope(reloadRepository);
    const beforeWakeDog = deserializeDogActorRoster(
      beforeWakeEnvelope.dogActorRoster,
    )?.actors[0];
    expect(deserializeWorld(String(beforeWakeEnvelope.world)).meta.completedTick)
      .toBe(wakeTick - 1);
    expect(beforeWakeDog?.circadian?.posture.state).toBe("asleep");
    expect(beforeWakeDog?.address.position).toEqual(restingPosition);

    advancePlayerSteps(reloaded, 10);
    await reloaded.save();
    const awakeEnvelope = savedEnvelope(reloadRepository);
    const awakeDog = deserializeDogActorRoster(awakeEnvelope.dogActorRoster)?.actors[0];
    expect(deserializeWorld(String(awakeEnvelope.world)).meta.completedTick).toBe(wakeTick);
    expect(awakeDog?.circadian?.posture).toEqual({
      state: "awake",
      enteredAtTick: wakeTick,
    });
    expect(awakeDog?.address.position).toEqual(restingPosition);
    reloaded.destroy();
  }, 180_000);

  it("adopts every current settled resident atomically while preserving the keeper's exact dawn wake", async () => {
    const world = createWorld("settlement keeper home night continuity", "wild");
    const startingSettlementId = world.contracts.find(({ status }) => status === "offered")
      ?.originSettlementId ?? world.settlements[0]?.id;
    const expectedKeeper = world.residents
      .filter((resident) => (
        resident.location.kind === "settlement"
        && resident.location.settlementId === startingSettlementId
      ))
      .sort((left, right) => (
        left.identity.stableId < right.identity.stableId
          ? -1
          : left.identity.stableId > right.identity.stableId
            ? 1
            : left.id - right.id
      ))[0];
    if (expectedKeeper === undefined) throw new Error("keeper fixture has no bootstrap human");
    const visitingResident = world.residents.find(({ identity }) => (
      identity.stableId !== expectedKeeper.identity.stableId
    ));
    const visitorRefuge = visitingResident === undefined
      ? undefined
      : world.settlements.find(({ id }) => id !== visitingResident.homeSettlementId);
    if (visitingResident === undefined || visitorRefuge === undefined) {
      throw new Error("keeper fixture has no reciprocal settlement visitor");
    }
    visitingResident.location = {
      kind: "settlement",
      settlementId: visitorRefuge.id,
    };
    const wakeTick = firstLivingCircadianActiveTick(
      expectedKeeper.identity.stableId,
      WORLD_NIGHT_START_TICK + 31,
      WORLD_TICKS_PER_DAY + WORLD_DAWN_START_TICK + 31,
      RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
    );
    if (wakeTick === null) throw new Error("keeper fixture has no bounded dawn wake tick");
    const startingTick = wakeTick - 2;
    // This test owns only the runtime/save routine seam, not the already-proven
    // complete clock journey. Rebase the otherwise untouched deterministic
    // fixture immediately before this keeper's stable dawn edge so setup does
    // not simulate a day of unrelated contracts and ecology.
    world.meta.completedTick = startingTick - 1;
    for (const resident of world.residents) {
      resident.perception = createActorPerceptionState(
        resident.identity.stableId,
        startingTick - 1,
      );
    }
    for (const contract of world.contracts) {
      if (contract.status !== "offered") continue;
      contract.playerExclusiveUntilTick = startingTick + WORLD_TICKS_PER_DAY;
      contract.dueTick = startingTick + WORLD_TICKS_PER_DAY * 2;
    }
    for (const settlement of world.settlements) {
      for (const recipe of settlement.recipes) {
        recipe.nextRunTick = startingTick + recipe.intervalTicks;
      }
    }
    world.weather = {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: startingTick + WORLD_TICKS_PER_DAY,
    };
    stepWorld(world);
    expect(world.meta.completedTick).toBe(startingTick);
    assertWorldInvariants(world);

    const migrationRepository = new MemoryRepository(legacyRuntimeSaveRecord(world));
    const migration = await createTideweftRuntime(migrationRepository);
    expect(migration.getUIView().saveWarning).toBeUndefined();
    await migration.save();
    const migratedRecord = migrationRepository.snapshot();
    const migratedEnvelope = savedEnvelope(migrationRepository);
    const migratedWorld = deserializeWorld(String(migratedEnvelope.world));
    const migratedSettlement = deserializeSettlementEcologyState(
      migratedEnvelope.settlementEcology,
    );
    const keeperIndex = migratedWorld.residents.findIndex(({ identity }) => (
      identity.stableId === migratedSettlement.identity.keeperActorId
    ));
    const keeper = migratedWorld.residents[keeperIndex];
    if (keeper === undefined) throw new Error("keeper night fixture lost its human owner");
    expect(keeper.identity.stableId).toBe(expectedKeeper.identity.stableId);
    expect(migratedWorld.meta.completedTick).toBe(startingTick);
    expect(keeper.circadian).toBeUndefined();
    expect(keeper.activeContractId).toBeNull();
    expect(keeper.location).toEqual({
      kind: "settlement",
      settlementId: keeper.homeSettlementId,
    });
    const residentContinuity = migratedWorld.residents.map((resident) => ({
      id: resident.id,
      identity: resident.identity,
      homeSettlementId: resident.homeSettlementId,
      relationships: resident.relationships,
    }));

    keeper.condition.exhaustion = 360_000;
    keeper.needs.rest = 480_000;
    keeper.perception = createActorPerceptionState(
      keeper.identity.stableId,
      startingTick,
    );
    const quietResponse = {
      ...createPorterResponseState(keeper.identity.stableId, startingTick),
      nextThinkTick: startingTick + WORLD_TICKS_PER_DAY,
    };
    const invalidRosterWorld = deserializeWorld(serializeWorld(migratedWorld));
    const invalidIndex = invalidRosterWorld.residents.at(-1)?.identity.stableId
      === keeper.identity.stableId
      ? invalidRosterWorld.residents.length - 2
      : invalidRosterWorld.residents.length - 1;
    const invalidResident = invalidRosterWorld.residents[invalidIndex];
    if (invalidResident === undefined) throw new Error("atomic roster fixture is incomplete");
    invalidResident.perception = createActorPerceptionState(
      invalidResident.identity.stableId,
      startingTick - 1,
    );
    const invalidRosterBefore = stableStringify(invalidRosterWorld.residents);
    expect(advanceRuntimeResidentCircadian(
      invalidRosterWorld,
      migratedSettlement,
      quietResponse,
    )).toBeNull();
    expect(stableStringify(invalidRosterWorld.residents)).toBe(invalidRosterBefore);
    const preparedRecord = withCurrentEnvelopeFields(migratedRecord, {
      world: serializeWorld(migratedWorld),
      porterResponse: quietResponse,
    });
    migration.destroy();

    guardianPerceptionHarness.observerId = keeper.identity.stableId;
    guardianPerceptionHarness.handlerId = "TEST-NO-KEEPER-NIGHT-SUBJECT";
    const repository = new MemoryRepository(preparedRecord);
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();

    // Loading and saving alone preserves the legacy absence exactly. The
    // first lawful ordinary world tick is the adoption boundary.
    await runtime.save();
    let envelope = savedEnvelope(repository);
    let savedWorld = deserializeWorld(String(envelope.world));
    expect(savedWorld.residents[keeperIndex]?.circadian).toBeUndefined();

    advancePlayerSteps(runtime, 10);
    await runtime.save();
    envelope = savedEnvelope(repository);
    savedWorld = deserializeWorld(String(envelope.world));
    const restingKeeper = savedWorld.residents[keeperIndex];
    if (restingKeeper?.circadian === undefined) {
      throw new Error("runtime did not bind the keeper's first home rest posture");
    }
    const restingTick = savedWorld.meta.completedTick;
    expect(restingTick).toBe(startingTick + 1);
    expect(savedWorld.residents).toHaveLength(42);
    expect(savedWorld.residents.every((resident) => (
      resident.circadian !== undefined
      && resident.circadian.restDestinationArrived
    ))).toBe(true);
    expect(savedWorld.residents.find(({ identity }) => (
      identity.stableId === visitingResident.identity.stableId
    ))).toMatchObject({
      id: visitingResident.id,
      homeSettlementId: visitingResident.homeSettlementId,
      location: {
        kind: "settlement",
        settlementId: visitorRefuge.id,
      },
      circadian: { restDestinationArrived: true },
    });
    expect(savedWorld.residents.map((resident) => ({
      id: resident.id,
      identity: resident.identity,
      homeSettlementId: resident.homeSettlementId,
      relationships: resident.relationships,
    }))).toEqual(residentContinuity);
    expect(new Set(savedWorld.residents.map((resident) => (
      resident.circadian?.restDestinationId
    ))).size).toBe(savedWorld.residents.length);
    expect(restingKeeper.identity).toEqual(keeper.identity);
    expect(restingKeeper.location).toEqual(keeper.location);
    expect(restingKeeper.circadian).toMatchObject({
      policy: { profileId: "day-active", drivers: ["clock"] },
      restDestinationArrived: true,
      posture: { state: "resting", enteredAtTick: restingTick },
    });
    expect(restingTick).toBe(wakeTick - 1);

    // The generic kernel already proves the 21-tick settle transition. Stage
    // its canonical resulting receipt at this same physical/tick authority so
    // this expensive runtime test stays focused on persistence and exact wake.
    const restingRecord = repository.snapshot();
    const asleepWorld = deserializeWorld(String(envelope.world));
    const asleepKeeper = replaceResidentCircadian(restingKeeper, {
      atTick: restingTick,
      circadian: {
        ...restingKeeper.circadian,
        posture: {
          state: "asleep",
          enteredAtTick: Math.max(0, restingTick - 21),
        },
      },
    });
    asleepWorld.residents[keeperIndex] = asleepKeeper;
    assertWorldInvariants(asleepWorld);
    const asleepWorldBytes = serializeWorld(asleepWorld);
    const asleepRecord = withCurrentEnvelopeFields(restingRecord, {
      world: asleepWorldBytes,
    });
    runtime.destroy();

    const asleepRepository = new MemoryRepository(asleepRecord);
    const reloaded = await createTideweftRuntime(asleepRepository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    await reloaded.save();
    expect(savedEnvelope(asleepRepository).world).toBe(asleepWorldBytes);
    expect(wakeTick % WORLD_TICKS_PER_DAY).toBeGreaterThanOrEqual(
      WORLD_DAWN_START_TICK - 30,
    );
    expect(wakeTick % WORLD_TICKS_PER_DAY).toBeLessThanOrEqual(
      WORLD_DAWN_START_TICK + 30,
    );

    advancePlayerSteps(reloaded, 10);
    await reloaded.save();
    const awakeWorld = deserializeWorld(String(savedEnvelope(asleepRepository).world));
    expect(awakeWorld.meta.completedTick).toBe(wakeTick);
    expect(awakeWorld.residents[keeperIndex]?.circadian?.posture).toEqual({
      state: "awake",
      enteredAtTick: wakeTick,
    });
    expect(awakeWorld.residents[keeperIndex]?.identity).toEqual(keeper.identity);
    expect(awakeWorld.residents[keeperIndex]?.location).toEqual(keeper.location);
    reloaded.destroy();
  }, 180_000);

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
    // Stage the flock on one short connected approach outside structural
    // access. The player stands beside the access lane, forcing the narration
    // to earn direct event-time sight rather than omniscient system knowledge.
    const sourceRecord = sourceRepository.snapshot();
    const sourceEnvelope = JSON.parse(sourceRecord.worldJson) as Record<string, unknown>;
    const sourceWorld = deserializeWorld(String(sourceEnvelope.world));
    const sourceView = createWorldView(sourceWorld);
    const sourceStore = deserializeSettlementEcologyState(sourceEnvelope.settlementEcology);
    const sourceRoster = deserializeDogActorRoster(sourceEnvelope.dogActorRoster);
    const sourceBio0 = deserializeBio0Ecology(sourceEnvelope.bio0Ecology);
    const sourceCustody = sourceStore.domesticCustodies.find(({ species }) => (
      species === "domestic-chicken"
    ));
    const sourceGuardian = sourceRoster?.actors[0];
    if (
      sourceCustody === undefined || sourceRoster === null || sourceGuardian === undefined
      || sourceBio0 === null
    ) {
      throw new Error("runtime omitted domestic custody or its independent guardian");
    }
    const displacedGuardianPosition = connectedOpenDogPositionOutside(
      sourceView,
      sourceStore.identity.position,
      20 * WORLD_POSITION_UNITS_PER_TILE,
    );
    const hiddenObserverPosition = connectedOpenDogPositionOutside(
      sourceView,
      sourceStore.identity.position,
      15 * WORLD_POSITION_UNITS_PER_TILE,
    );
    const positionedGuardian = repositionDogActor(sourceGuardian, {
      position: displacedGuardianPosition,
      heading: sourceGuardian.address.heading,
      atTick: sourceWorld.meta.completedTick,
    });
    const positionedRoster = replaceDogActorInRoster(sourceRoster, positionedGuardian);
    if (positionedRoster === null) {
      throw new Error("domestic store fixture rejected its displaced guardian");
    }
    const positionedBio0 = {
      ...sourceBio0,
      dog: repositionDogActor(sourceBio0.dog, {
        position: displacedGuardianPosition,
        heading: sourceBio0.dog.address.heading,
        atTick: sourceBio0.tick,
      }),
    };
    let positionedCore = requireCurrentCoreEcology(sourceEnvelope);
    positionedCore = setCoreEcologyAggregatePatchMaterializedActors(positionedCore, {
      atTick: positionedCore.updatedAtTick,
      actorIds: sourceCustody.memberActorIds,
    });
    const positionedChickens = positionedCore.populations
      .filter(({ species }) => species === "domestic-chicken")
      .flatMap(({ members }) => members)
      .map(({ actor }) => actor)
      .filter(({ identity }) => sourceCustody.memberActorIds.includes(identity.stableId))
      .sort((left, right) => (
        sourceCustody.memberActorIds.indexOf(left.identity.stableId)
        - sourceCustody.memberActorIds.indexOf(right.identity.stableId)
      ));
    if (positionedChickens.length !== sourceCustody.memberActorIds.length) {
      throw new Error("runtime omitted a domestic approach actor");
    }
    const storeTileX = Math.floor(
      sourceStore.identity.position.localX / WORLD_POSITION_UNITS_PER_TILE,
    );
    const storeTileY = Math.floor(
      sourceStore.identity.position.localY / WORLD_POSITION_UNITS_PER_TILE,
    );
    const approachDistanceTiles = 4;
    const approachPositions = ([
      [0, -1], [0, 1], [-1, 0], [1, 0],
    ] as const).flatMap(([stepX, stepY]) => {
      const openApproach = [approachDistanceTiles, approachDistanceTiles - 1]
        .every((distance) => {
        const localX = storeTileX + stepX * distance;
        const localY = storeTileY + stepY * distance;
        if (
          localX < 0 || localX >= WORLD_WIDTH
          || localY < 0 || localY >= WORLD_HEIGHT
        ) return false;
        const tile = sourceView.terrain.tiles[localY * WORLD_WIDTH + localX];
        return tile !== undefined
          && coreWildlifeTraversabilityCell("domestic-chicken", tile).access === "open";
      });
      if (!openApproach) return [];
      const localX = storeTileX + stepX * approachDistanceTiles;
      const localY = storeTileY + stepY * approachDistanceTiles;
      return [{
        stepX,
        stepY,
        position: createWorldPosition(
          sourceStore.identity.position.region,
          localX * WORLD_POSITION_UNITS_PER_TILE
            + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
          localY * WORLD_POSITION_UNITS_PER_TILE
            + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
        accessPosition: createWorldPosition(
          sourceStore.identity.position.region,
          (storeTileX + stepX * (approachDistanceTiles - 1))
            * WORLD_POSITION_UNITS_PER_TILE
            + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
          (storeTileY + stepY * (approachDistanceTiles - 1))
            * WORLD_POSITION_UNITS_PER_TILE
            + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
        ),
      }];
    });
    const approach = approachPositions[0];
    if (approach === undefined) {
      throw new Error("domestic store fixture omitted a short traversable approach");
    }
    const approachPosition = approach.position;
    const accessTileX = storeTileX
      + approach.stepX * (approachDistanceTiles - 1);
    const accessTileY = storeTileY
      + approach.stepY * (approachDistanceTiles - 1);
    const witnessDistanceTiles = 5;
    const witnessPosition = ([
      [-approach.stepY, approach.stepX],
      [approach.stepY, -approach.stepX],
    ] as const).flatMap(([stepX, stepY]) => {
      const clearWitnessLine = Array.from(
        { length: witnessDistanceTiles },
        (_, index) => index + 1,
      ).every((distance) => {
        const localX = accessTileX + stepX * distance;
        const localY = accessTileY + stepY * distance;
        if (
          localX < 0 || localX >= WORLD_WIDTH
          || localY < 0 || localY >= WORLD_HEIGHT
        ) return false;
        const tile = sourceView.terrain.tiles[localY * WORLD_WIDTH + localX];
        return tile !== undefined
          && tile.terrain !== "ridge"
          && tile.waterDepth <= ADRIFT_STAND_DEPTH
          && tile.roughness < 650_000;
      });
      if (!clearWitnessLine) return [];
      return [createWorldPosition(
        sourceStore.identity.position.region,
        (accessTileX + stepX * witnessDistanceTiles)
          * WORLD_POSITION_UNITS_PER_TILE
          + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
        (accessTileY + stepY * witnessDistanceTiles)
          * WORLD_POSITION_UNITS_PER_TILE
          + Math.floor(WORLD_POSITION_UNITS_PER_TILE / 2),
      )];
    })[0];
    if (witnessPosition === undefined) {
      throw new Error("domestic store fixture omitted a clear witness line");
    }
    const storeAccessReachUnits = Math.min(
      sourceCustody.homeStructure.radiusUnits,
      3 * WORLD_POSITION_UNITS_PER_TILE,
    );
    const approachByActorId = new Map<string, WorldPosition>();
    for (const chicken of positionedChickens) {
      const approachToStore = worldPositionDelta(
        approachPosition,
        sourceStore.identity.position,
      );
      expect(Math.hypot(approachToStore.x, approachToStore.y))
        .toBeGreaterThan(storeAccessReachUnits);
      approachByActorId.set(chicken.identity.stableId, approachPosition);
      positionedCore = replaceCoreEcologyAggregatePatchActor(
        positionedCore,
        repositionCoreWildlifeActor(chicken, {
          atTick: positionedCore.updatedAtTick,
          position: approachPosition,
          // Face the familiar feeding station. The player stands well beyond
          // peripheral range on a perpendicular sight line, so witnessing the
          // animal does not manufacture a reciprocal human observation.
          heading: headingFromRadians(
            Math.atan2(-approach.stepY, -approach.stepX),
          ),
        }),
      );
    }
    const stagedRecord = withCurrentEnvelopeFields(
      withCurrentSettlementHomeCore(sourceRecord, positionedCore),
      {
        bio0Ecology: serializeBio0Ecology(positionedBio0),
        dogActorRoster: serializeDogActorRoster(positionedRoster),
      },
    );
    const initialRecord = withPlayerWitnessingWorldPosition(
      stagedRecord,
      witnessPosition,
      approach.accessPosition,
    );
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
    for (const [actorId, approachPosition] of approachByActorId) {
      expect(initialCore.populations
        .flatMap(({ members }) => members)
        .find(({ actor }) => actor.identity.stableId === actorId)
        ?.actor.address.position).toEqual(approachPosition);
    }
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
    const consumingActorApproach = approachByActorId.get(consumingActorId);
    if (consumingActorApproach === undefined) {
      throw new Error("domestic food use actor omitted its staged approach");
    }
    const witnessedCore = requireCurrentCoreEcology(witnessedUse.envelope);
    const consumingActor = witnessedCore.populations
      .flatMap(({ members }) => members)
      .find(({ actor }) => actor.identity.stableId === consumingActorId)?.actor;
    if (consumingActor === undefined) {
      throw new Error("domestic food use actor left its authoritative population");
    }
    const approachTravel = worldPositionDelta(
      consumingActorApproach,
      consumingActor.address.position,
    );
    expect(Math.hypot(approachTravel.x, approachTravel.y)).toBeGreaterThan(0);
    const storeContact = worldPositionDelta(
      consumingActor.address.position,
      witnessedUse.state.identity.position,
    );
    expect(Math.hypot(storeContact.x, storeContact.y)).toBeLessThanOrEqual(
      storeAccessReachUnits,
    );
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

    const securedRepository = new MemoryRepository(stagedRecord);
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

    const hiddenRepository = new MemoryRepository(withPlayerWitnessingWorldPosition(
      stagedRecord,
      hiddenObserverPosition,
      sourceStore.identity.position,
    ));
    const hidden = await createTideweftRuntime(hiddenRepository);
    runtimeEcologyHarness.disableDomesticFoodInvestigation = true;
    expect(hidden.getRenderView().settlements.some(({ foodStore }) => (
      foodStore !== undefined
    ))).toBe(false);
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
  }, 90_000);

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
  }, 45_000);

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
  }, 45_000);
});
