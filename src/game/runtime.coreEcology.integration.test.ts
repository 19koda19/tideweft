import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  actorCalloutViewport,
  layoutAcousticTextCallouts,
} from "../render/playerPresentation";
import { acousticTextRectsOverlap } from "../render/acousticTextLayout";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  ACTOR_PERCEPTION_SCALE,
  createActorObservation,
  createActorPerceptionState,
  type ActorObservation,
} from "../sim/actorPerception";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import {
  WORLD_NEW_GAME_START_TICK,
  assertWorldInvariants,
  createWorldView,
  deserializeWorld,
  replaceResidentCircadian,
  serializeWorld,
} from "../sim/public";
import { regionLocalToGlobalTile } from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { compareText, hashCanonical, stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_MAX_POPULATIONS,
  coreEcologyAlarmSignalProfile,
  applyCoreEcologyWildlifeMortality,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  deserializeOrMigrateCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  replaceCoreEcologyAggregatePatchCarcass,
  setCoreEcologyAggregatePatchMaterializedActors,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  projectCoreEcologyActivity,
  projectCoreEcologyDayPhase,
  stepCoreEcologyActivityMotion,
  type CoreEcologyActivityProjection,
} from "./coreEcologyActivity";
import {
  projectCoreEcologyActivityAuthority,
  type CoreEcologyActivityAuthorityV1,
} from "./coreEcologyActivityAuthority";
import { coreEcologyCircadianPolicyForSpecies } from "./coreEcologyCircadianPolicy";
import {
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES,
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_VERSION,
  CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES,
  CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION,
  CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES,
  CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION,
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES,
  CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION,
  CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_SPECIES,
  CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_SPECIES,
  CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_VERSION,
  CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES,
  CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_VERSION,
  CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES,
  CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION,
  canonicalizeCoreEcologyDomesticPenHabitatAssemblage,
  canonicalizeCoreEcologyTidalTableHabitatAssemblage,
  canonicalizeCoreEcologyHarborEdgeHabitatAssemblage,
  canonicalizeCoreEcologyMarshEdgeHabitatAssemblage,
  canonicalizeCoreEcologyRainChorusHabitatAssemblage,
  canonicalizeCoreEcologyRegionalUplandHabitatAssemblage,
  canonicalizeCoreEcologyTidalWebHabitatAssemblage,
  canonicalizeCoreEcologyWaterfowlHabitatAssemblage,
  type CoreEcologyDomesticPenHabitatAssemblage,
  type CoreEcologyRegionalPredatorHabitatAssemblage,
  type CoreEcologyRegionalUplandHabitatAssemblage,
  type CoreEcologyTidalWebHabitatAssemblage,
} from "./coreEcologyHabitat";
import { deserializeBio0Ecology } from "./bio0Ecology";
import * as expressionTrajectory from "./situatedExpressionTrajectory";
import { createHeardVisibleSituatedExpressionReception } from "./situatedExpressionReception";
import { projectPerception } from "./projection";
import { isWildlifeWorldPositionDirectlyObserved } from "./wildlifePresentation";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  reconcileCoreEcologyGroupAnchors,
  reconcileCoreEcologyGroupMaterialized,
  type CoreEcologyGroupState,
} from "./coreEcologyGroups";
import { setCoreEcologyMaterializationForWindow } from "./coreEcologyRuntime";
import { CORE_ECOLOGY_DOMESTIC_SPECIES } from "./coreEcologyRegionalHabitat";
import * as coreEcologyPerception from "./coreEcologyPerception";
import { evaluateAudibleContact, type AudibleContact } from "./perception";
import { ambientNoiseAt, type PhysicalSoundSample } from "./physicalAcousticPerception";
import { livingActorSenseProfile } from "./livingActorSenses";
import { traversalIncidentAcousticEvent, type WorldAcousticEvent } from "./worldAcoustics";
import type { TraversalFeedbackState } from "./traversalFeedback";
import type { WorldAcousticPresentationReception } from "./worldAcousticPresentation";
import * as acousticPresentationQueue from "./worldAcousticPresentationQueue";
import { adoptCoreEcologySettlementHomeFromV24 } from "./coreEcologySettlementHome";
import {
  coreEcologySpeciesCanOwnActorAddress,
  coreEcologySpeciesHasRuntimeCapability,
  coreEcologySpeciesPredatorContact,
  coreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import { coreWildlifeMaximumStepUnits } from "./coreWildlifeLocomotionProfile";
import { stepCoreEcologyTidalTable } from "./coreEcologyTidalTable";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  CORE_WILDLIFE_ROUTINE_REST_REFERENCE_ID,
  canonicalizeCoreWildlifeActorState,
  commitCoreWildlifeAlarmEventLocus,
  createCoreWildlifeActorState,
  repositionCoreWildlifeActor,
  replaceCoreWildlifeActorPhysiology,
  stepCoreWildlifeActor,
  type CoreWildlifeActorState,
  type CoreWildlifeCausalEvent,
} from "./coreWildlifeActor";
import { repositionDogActor, replaceDogActorPhysiology, replaceDogActorCircadian } from "./dogActor";
import {
  deserializeDogActorRoster,
  replaceDogActorInRoster,
  serializeDogActorRoster,
} from "./dogActorRoster";
import {
  claimCoreWildlifeCarcass,
  consumeCoreWildlifeCarcass,
} from "./coreWildlifeCarcass";
import { resolveCoreWildlifePredatorContact } from "./coreWildlifeMortality";
import {
  commitPhysicalCargoRegionalMutation,
  gameSaveEnvelopeIntegrity,
  locatePhysicalCargoEntity,
  physicalCargoWorlds,
  quotePhysicalCargoSource,
  snapshotPhysicalCargoState,
  transitionPhysicalCargoRegion,
  validatePhysicalCargoState,
  type PhysicalCargoState,
  type SerializedPhysicalCargoState,
} from "./physicalCargoState";
import {
  LOCAL_PLAYER_SUBJECT_ID,
  type PlayerSenseSample,
  type SupplementalSoundSample,
} from "./humanPerception";
import * as humanPerception from "./humanPerception";
import type { PlayerState } from "./player";
import {
  LOOSE_CARGO_TILE_UNITS,
  addLooseCargoProvision,
  consumeLooseCargoProvisionEntity,
  createLooseCargoCarrier,
  dropLooseCargo,
} from "./looseCargo";
import { createCraftingInventory } from "./crafting";
import { PROVISION_DEFINITIONS } from "./provisions";
import {
  capturePlayerRegionalTravel,
  restorePlayerRegionalTravel,
  serializePlayerRegionalTravel,
} from "./regionalPlayerTravel";
import {
  adoptRegionalEcologyFromV24,
} from "./regionalEcology";
import {
  projectRegionalEcologyLegacyCohort,
} from "./regionalEcologyLegacyCohort";
import {
  createRegionalEcologyState,
  deserializeRegionalEcologyState,
  projectRegionalEcologyActiveState,
  regionalEcologyRegionalResidentsForActiveRegions,
  serializeRegionalEcologyState,
  type RegionalEcologyStateV1,
} from "./regionalEcologyState";
import {
  createRegionalEcologyStateV2,
  deserializeRegionalEcologyStateV2,
  serializeRegionalEcologyStateV2,
  type RegionalEcologyStateV2,
} from "./regionalEcologyStateV2";
import {
  createRegionalEcologyStateV3,
  deserializeRegionalEcologyStateV3,
  serializeRegionalEcologyStateV3,
  type RegionalEcologyStateV3,
} from "./regionalEcologyStateV3";
import {
  createRegionalEcologyStateV4,
  deserializeRegionalEcologyStateV4,
  serializeRegionalEcologyStateV4,
  type RegionalEcologyStateV4,
} from "./regionalEcologyStateV4";
import {
  createRegionalEcologyStateV5,
  deserializeRegionalEcologyStateV5,
  serializeRegionalEcologyStateV5,
  type RegionalEcologyStateV5,
} from "./regionalEcologyStateV5";
import {
  commitRegionalEcologyStateV6ActiveProjection,
  createRegionalEcologyStateV6,
  deserializeRegionalEcologyStateV6,
  projectRegionalEcologyStateV6ActiveState,
  serializeRegionalEcologyStateV6,
  type RegionalEcologyStateV6,
  type RegionalEcologyStateV6ActiveProjection,
} from "./regionalEcologyStateV6";
import * as regionalEcologyStateV6 from "./regionalEcologyStateV6";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  REGIONAL_TRAVEL_SAFE_MIN_X,
  REGIONAL_TRAVEL_SAFE_MIN_Y,
  REGIONAL_TRAVEL_SAFE_MAX_Y,
  REGIONAL_TRAVEL_SHIFT_TILES,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  playerWorldPositionInRegionalWindow,
  resolveResidentWorldPlacement,
} from "./residentSpatial";
import { ADRIFT_STAND_DEPTH } from "./adrift";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  isWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
} from "./worldPosition";
import { headingFromRadians, livingActorAddressInRegionalWindow } from "./livingActor";
import { canonicalizeLivingActorPlayerChoiceState } from "./livingActorPlayerChoice";
import type {
  CoreWildlifeAlarmExpressionAdmissionRecord,
  CoreWildlifePursuitCallExpressionAdmissionRecord,
  CoreWildlifeWeatherDistressExpressionAdmissionRecord,
  SituatedExpressionAdmissionLedger,
} from "./situatedExpressionAdmissionLedger";
import type { SituatedExpressionChannelBank } from "./situatedExpressionChannelBank";
import * as situatedExpressionChannels from "./situatedExpressionChannelBank";
import * as humanDangerWarnings from "./humanDangerWarningExpression";
import * as expressionDiagnostics from "./situatedExpressionDiagnostics";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import { situatedExpressionEventIdForTrigger } from "./situatedExpression";
import {
  deserializeSettlementDomesticAnimalRecoveryState,
} from "./settlementDomesticAnimalRecovery";
import { deserializeSettlementEcologyState } from "./settlementEcology";
import { projectSettlementWorkingDogCircadian } from "./settlementWorkingDogCircadian";
import {
  deserializeSettlementWorkingAnimalState,
  settlementGuardianAlarmInvestigation,
} from "./settlementWorkingAnimals";

const soundscapePlay = vi.hoisted(() => vi.fn());
vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

import { createTideweftRuntime, type TideweftRuntime } from "./runtime";

export const PHYSICAL_PROVISION_CONSERVATION_OWNER_INTENT =
  "test:runtime-core-ecology-physical-provision-conservation:v1" as const;
export const ALPHA30_BODY_BEARING_SAVE_ADOPTION_OWNER_INTENT =
  "test:alpha30-body-bearing-save-adoption:v1" as const;
export const ALPHA31_BODY_BEARING_SAVE_ADOPTION_OWNER_INTENT =
  "test:alpha31-body-bearing-save-adoption:v1" as const;
export const ALPHA30_RUNTIME_MORTALITY_EMERGENCE_OWNER_INTENT =
  "test:alpha30-runtime-mortality-emergence:v1" as const;
export const ALPHA30_NEW_WORLD_STRESS_OWNER_INTENT =
  "test:alpha30-new-world-stress:v1" as const;

interface CurrentEnvelope {
  readonly format: "tideweft-session";
  readonly version: 50;
  readonly world: string;
  readonly player: PlayerState;
  readonly physicalCargo: SerializedPhysicalCargoState;
  readonly perceptionCarry: CurrentPerceptionCarry;
  readonly bio0Ecology: string;
  readonly regionalEcology: string;
  /** Historical fixtures only; current v50 envelopes never carry this field. */
  readonly coreEcology?: string;
  readonly settlementEcology: string;
  readonly dogActorRoster: string;
  readonly settlementWorkingAnimals: string;
  readonly settlementDomesticAnimalRecovery: string;
  readonly regionalTravel: string;
  readonly traversalFeedback: TraversalFeedbackState;
  readonly integrity: string;
  readonly [key: string]: unknown;
}

interface CurrentPerceptionCarry {
  readonly version: 14;
  readonly intervalStartPosition: unknown;
  readonly intervalStartFacingMilliRadians: number;
  readonly intervalStartWasSleeping: boolean;
  readonly playerStepsSinceWorldTick: number;
  readonly playerSenseSamples: readonly unknown[];
  readonly playerStepStateAnchor: unknown;
  readonly playerStepStateSamples: readonly unknown[];
  readonly actorVocalizationSamples: readonly SupplementalSoundSample[];
  readonly animalContactAcousticCarry: unknown;
  readonly situatedExpressionChannels: SituatedExpressionChannelBank;
  readonly situatedExpressionAdmissions: SituatedExpressionAdmissionLedger;
  readonly situatedExpressionCausalAuthority: unknown;
  readonly nextPlayerSenseSampleOrdinal: number;
}

function requiredRegionalActivityProjection(
  envelope: CurrentEnvelope,
  actorId: string,
): CoreEcologyActivityProjection {
  const regional = requiredRegionalEcology(envelope);
  const world = deserializeWorld(envelope.world);
  const travel = restorePlayerRegionalTravel(
    world.meta.rootSeed,
    envelope.player,
    envelope.regionalTravel,
  );
  if (travel === null) throw new Error("activity fixture lost its signed player frame");
  const active = projectRegionalEcologyActiveState(regional, {
    origin: travel.window.origin,
    terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
  });
  if (active === null) throw new Error("activity fixture lost its active ecology projection");
  const sources = active.residents;
  const owners = sources.filter(({ patch }) => coreActors(patch).some(({ identity }) => (
    identity.stableId === actorId
  )));
  if (owners.length !== 1) {
    throw new Error(`activity fixture expected one regional owner for ${actorId}`);
  }
  const source = owners[0]!;
  const authority = source.kind === "settlement-home"
    ? undefined
    : projectCoreEcologyActivityAuthority({
        rootSeed: world.meta.rootSeed,
        root: regional.root,
        sourceKind: source.kind,
        patch: source.patch,
        actorId,
      }) ?? undefined;
  if (source.kind !== "settlement-home" && authority === undefined) {
    throw new Error(`activity fixture lost transient authority for ${actorId}`);
  }
  const projection = projectCoreEcologyActivity(source.patch, {
    actorId,
    atTick: source.patch.updatedAtTick,
    weather: createWorldView(world).weather,
  }, authority);
  if (projection === null) {
    throw new Error(`activity fixture could not project ${actorId}`);
  }
  return projection;
}

class MemoryRepository implements SaveRepository {
  private record: SaveRecord | undefined;

  constructor(record?: SaveRecord) {
    this.record = record === undefined ? undefined : structuredClone(record);
  }

  async list() { return []; }
  async load(slotId: string) {
    return slotId === "autosave" && this.record
      ? structuredClone(this.record)
      : undefined;
  }
  async save(record: SaveRecord) { this.record = structuredClone(record); }
  async remove() { this.record = undefined; }

  snapshot(): SaveRecord {
    if (!this.record) throw new Error("core-ecology runtime fixture has no autosave");
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
  soundscapePlay.mockClear();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runtime core-ecology vertical slice", () => {
  it(`${ALPHA30_NEW_WORLD_STRESS_OWNER_INTENT} creates and round-trips one bounded deterministic seed sample`, async () => {
    const seedSample = Object.freeze([
      "alpha30 new world stress zero",
      "alpha30 new world stress signed seam",
      "alpha30 new world stress upland one",
      "alpha30 new world stress upland two",
      "alpha30 new world stress groups",
      "alpha30 new world stress materialization",
      "alpha30 new world stress save adoption",
      "alpha30 new world stress deterministic replay",
      "alpha30 new world stress long 0123456789 abcdefghijklmnopqrstuvwxyz",
      "alpha30 new world stress unicode ñ λ 潮",
    ] as const);
    let witnessedBearFreeSeed = false;

    for (const seed of seedSample) {
      const repository = new MemoryRepository();
      const runtime = await createTideweftRuntime(repository);
      expect(() => runtime.dispatchUI({
        type: "new-world",
        seed,
        posture: "gale",
        sessionShape: "wander",
      }), seed).not.toThrow();
      await runtime.save();
      const envelope = requiredEnvelope(repository);
      const core = requiredCore(envelope);
      const regional = requiredRegionalEcology(envelope);
      const livingBlackBears = regionalCoreActors(regional).filter(({ identity, condition }) => (
        identity.species === "black-bear" && condition.health > 0
      ));
      const seededForage = forageProvisions(requiredCargo(envelope));
      expect(seededForage, seed).toHaveLength(livingBlackBears.length > 0 ? 1 : 0);
      expect(requiredCargo(envelope).activeRegion, seed).toEqual(
        restorePlayerRegionalTravel(
          deserializeWorld(envelope.world).meta.rootSeed,
          envelope.player,
          envelope.regionalTravel,
        )?.stream.center,
      );
      witnessedBearFreeSeed ||= livingBlackBears.length === 0;
      expect(core.derivation.kind, seed).toBe("habitat-v11");
      if (core.derivation.kind !== "habitat-v11") {
        throw new Error(`${seed}: new world omitted habitat v11`);
      }
      expect(core.populations.length, seed).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_POPULATIONS);
      expect(core.populations.flatMap(({ members }) => members).filter(({ materialization }) => (
        materialization === "materialized"
      )).length, seed).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);

      const regionalPopulations = core.populations.filter(({ species }) => (
        species === "wild-boar" || species === "elk" || species === "gray-wolf"
      ));
      expect(core.derivation.habitat.populations.slice(-5).map(({ species }) => species), seed)
        .toEqual(["wild-boar", "elk", "gray-wolf", "cougar", "brown-bear"]);
      expect(regionalPopulations.map(({ species }) => species).sort(), seed)
        .toEqual(core.derivation.habitat.populations.slice(-5, -2)
          .filter(({ populationUnits }) => populationUnits > 0)
          .map(({ species }) => species)
          .sort());
      for (const population of regionalPopulations) {
        expect(population.members.every(({ materialization }) => (
          materialization === "coarse"
        )), seed).toBe(true);
        const group = core.groups.groups.find(({ identity }) => (
          identity.species === population.species
          && identity.populationKey === population.populationKey
        ));
        if (population.members.length < 2) {
          expect(group, seed).toBeUndefined();
        } else {
          expect(group?.memberOrdinals, seed)
            .toEqual(population.members.map(({ populationOrdinal }) => populationOrdinal));
        }
      }

      const durableRegionalEcology = envelope.regionalEcology;
      runtime.destroy();
      scheduledFrame = undefined;
      const resumed = await createTideweftRuntime(repository);
      expect(resumed.getUIView().saveWarning, seed).toBeUndefined();
      await resumed.save();
      expect(requiredEnvelope(repository).regionalEcology, seed)
        .toBe(durableRegionalEcology);
      resumed.destroy();
      scheduledFrame = undefined;
    }
    expect(witnessedBearFreeSeed).toBe(true);
  }, process.env.CI === "true" ? 120_000 : 60_000);

  it("uses production-shaped external protection for a synthetic v24 adoption", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "v24 production protection fixture",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();
    const envelope = requiredEnvelope(repository);
    const source = requiredCore(envelope);
    const sourceActorIds = coreEcologyActorIds(source);
    const wildActors = coreActors(source).filter(({ identity }) => (
      !CORE_ECOLOGY_DOMESTIC_SPECIES.includes(identity.species)
    ));
    expect(wildActors.length).toBeGreaterThan(0);
    expect(wildActors.every(({ address }) => address.persistence === "regional")).toBe(true);

    const expectedProtectedActorIds = productionV24ProtectedActorIds(envelope, source);
    const adopted = requiredRegionalEcology(resealedEnvelope(envelope, {
      coreEcology: serializeCoreEcologyAggregatePatch(source),
    }));
    expect(adopted.root.adoption?.protectedActorIds).toEqual(expectedProtectedActorIds);
    expect(expectedProtectedActorIds.length).toBeLessThan(sourceActorIds.length);
    expect(wildActors.some(({ identity }) => (
      !expectedProtectedActorIds.includes(identity.stableId)
    ))).toBe(true);
    runtime.destroy();
  }, 45_000);

  it("migrates a sealed v20 save through v24 and the current wrapper without inventing mortality history", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "alpha twenty eight domestic recovery migration",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const currentRecord = repository.snapshot();
    const current = requiredEnvelope(repository);
    const {
      integrity: _currentIntegrity,
      playerExpressionRecency: _currentPlayerExpressionRecency,
      settlementDomesticAnimalRecovery: expectedEmptyRecovery,
      regionalEcology: _currentRegionalEcology,
      version: _currentVersion,
      ...establishedV20Roots
    } = current;
    const v20Base = {
      ...establishedV20Roots,
      player: legacyPlayerWithoutTimeAction(current.player),
      perceptionCarry: legacyPerceptionCarry(current.perceptionCarry),
      version: 20 as const,
      coreEcology: serializePublishedAggregateV4(
        domesticPenCoreEcologyFromCurrent(requiredCore(current)),
      ),
    };
    await repository.save({
      ...currentRecord,
      payloadVersion: 20,
      updatedAt: currentRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v20Base,
        integrity: gameSaveEnvelopeIntegrity(v20Base),
      }),
    });
    initial.destroy();
    scheduledFrame = undefined;

    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const adoptedRecord = repository.snapshot();
    const adopted = requiredEnvelope(repository);
    const recovery = deserializeSettlementDomesticAnimalRecoveryState(
      adopted.settlementDomesticAnimalRecovery,
    );
    const {
      integrity: _adoptedIntegrity,
      playerExpressionRecency: _adoptedPlayerExpressionRecency,
      regionalEcology: _adoptedRegionalEcology,
      settlementDomesticAnimalRecovery: _adoptedRecovery,
      version: _adoptedVersion,
      ...adoptedEstablishedRoots
    } = adopted;
    const {
      session: _priorSessionPresentation,
      ...durableV20Roots
    } = establishedV20Roots;
    const {
      session: _resumedSessionPresentation,
      ...durableAdoptedRoots
    } = adoptedEstablishedRoots;

    expect(adoptedRecord.payloadVersion).toBe(50);
    expect(durableAdoptedRoots).toEqual(durableV20Roots);
    expect(adopted.playerExpressionRecency).toEqual(current.playerExpressionRecency);
    expect(adopted.settlementDomesticAnimalRecovery).toBe(expectedEmptyRecovery);
    expect(recovery).toMatchObject({
      revision: 0,
      lastCaseOrdinal: 0,
      lastResolvedTransitionOrdinal: 0,
      lastResolvedTransitionId: null,
      currentCase: null,
      latestClosedOutcome: null,
      pendingTransition: null,
    });
    expect(requiredCore(adopted)).toMatchObject({
      nextMortalityOrdinal: 0,
      mortalityTransactions: [],
      carcasses: [],
    });
    migrated.destroy();
  }, 30_000);

  it("migrates a sealed v21 save through the empty v24 mortality ledger exactly once", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "alpha twenty nine mortality migration",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const currentRecord = repository.snapshot();
    const current = requiredEnvelope(repository);
    const currentCore = domesticPenCoreEcologyFromCurrent(requiredCore(current));
    const {
      integrity: _integrity,
      playerExpressionRecency: _futurePlayerExpressionRecency,
      regionalEcology: _regionalEcology,
      version: _version,
      ...durableRoots
    } = current;
    const v21Base = {
      ...durableRoots,
      player: legacyPlayerWithoutTimeAction(current.player),
      perceptionCarry: legacyPerceptionCarry(current.perceptionCarry),
      version: 21 as const,
      coreEcology: serializePublishedAggregateV4(currentCore),
    };
    await repository.save({
      ...currentRecord,
      payloadVersion: 21,
      updatedAt: currentRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v21Base,
        integrity: gameSaveEnvelopeIntegrity(v21Base),
      }),
    });
    initial.destroy();
    scheduledFrame = undefined;

    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const adoptedRecord = repository.snapshot();
    const adopted = requiredEnvelope(repository);
    const adoptedCore = requiredCore(adopted);
    expect(adoptedRecord.payloadVersion).toBe(50);
    expect(adoptedCore).toMatchObject({
      nextMortalityOrdinal: 0,
      mortalityTransactions: [],
      carcasses: [],
    });
    const adoptedPopulationSummaries = adoptedCore.populations.map((population) => ({
      species: population.species,
      populationKey: population.populationKey,
      baselinePopulationSize: population.baselinePopulationSize,
      populationSize: population.populationSize,
      reserveUnits: population.reserveUnits,
    }));
    expect(adoptedPopulationSummaries.filter(({ species }) => (
      species !== "wild-boar"
      && species !== "elk"
      && species !== "gray-wolf"
      && species !== "cougar"
      && species !== "brown-bear"
    ))).toEqual(currentCore.populations.map((population) => ({
      species: population.species,
      populationKey: population.populationKey,
      baselinePopulationSize: population.populationSize,
      populationSize: population.populationSize,
      reserveUnits: 0,
    })));
    const adoptedRegionalSpecies = adoptedPopulationSummaries
      .filter(({ species }) => (
        species === "wild-boar"
        || species === "elk"
        || species === "gray-wolf"
        || species === "cougar"
        || species === "brown-bear"
      ))
      .map(({ species }) => species)
      .sort();
    expect(adoptedCore.derivation.kind).toBe("habitat-v11");
    expect(adoptedRegionalSpecies).toEqual(
      adoptedCore.derivation.kind === "habitat-v11"
        ? adoptedCore.derivation.habitat.populations
            .filter(({ species, populationUnits }) => (
              populationUnits > 0
              && (
                species === "wild-boar"
                || species === "elk"
                || species === "gray-wolf"
                || species === "cougar"
                || species === "brown-bear"
              )
            ))
            .map(({ species }) => species)
            .sort()
        : [],
    );

    const durableRegionalEcology = adopted.regionalEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(durableRegionalEcology);
    resumed.destroy();
  }, 45_000);

  it("migrates the sealed v8 ecology exactly once without rerolling actors or cargo", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "alpha thirteen ecology migration",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const currentRecord = repository.snapshot();
    const current = requiredEnvelope(repository);
    const currentCore = requiredCore(current);
    const legacy = publishedV8CoreEcologyFixture(current);
    const {
      integrity: _currentIntegrity,
      playerExpressionRecency: _currentPlayerExpressionRecency,
      settlementEcology: _currentSettlementEcology,
      dogActorRoster: _currentDogActorRoster,
      settlementWorkingAnimals: _currentSettlementWorkingAnimals,
      settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
      regionalEcology: _currentRegionalEcology,
      ...currentBase
    } = current;
    const v8Base = {
      ...currentBase,
      player: legacyPlayerWithoutTimeAction(current.player),
      perceptionCarry: legacyPerceptionCarry(current.perceptionCarry),
      version: 8 as const,
      coreEcology: legacy.text,
    };
    await repository.save({
      ...currentRecord,
      payloadVersion: 8,
      updatedAt: currentRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v8Base,
        integrity: gameSaveEnvelopeIntegrity(v8Base),
      }),
    });
    initial.destroy();
    scheduledFrame = undefined;

    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const adopted = requiredEnvelope(repository);
    const adoptedCore = requiredCore(adopted);
    expect(repository.snapshot().payloadVersion).toBe(50);
    expect(adoptedCore.derivation.kind).toBe("legacy-fixed-v1-with-habitat-v11");
    expect(adoptedCore.groups.groups).toEqual(currentCore.groups.groups.filter(
      ({ identity }) => (
        identity.species === "fish-crow"
        || identity.species === "domestic-chicken"
        || identity.species === "domestic-goat"
        || identity.species === "wild-boar"
        || identity.species === "elk"
        || identity.species === "gray-wolf"
      ),
    ));
    const retainedPopulations = adoptedCore.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    expect(retainedPopulations.flatMap(({ members }) => members.map(({ actor }) => actor)))
      .toEqual(legacy.actors);
    expect(retainedPopulations.every((population) => (
      population.populationSize === population.members.length
      && population.members.every(({ representedUnits }) => representedUnits === 1)
    ))).toBe(true);
    for (const species of [
      "domestic-cat",
      "marsh-rabbit",
      "marsh-fox",
      "fish-crow",
      "northern-harrier",
      "snowy-egret",
      "american-black-duck",
      "north-american-river-otter",
      "domestic-chicken",
      "domestic-goat",
      "wild-boar",
      "elk",
      "gray-wolf",
    ] as const) {
      const adoptedPopulation = adoptedCore.populations.find(
        (population) => population.species === species,
      );
      const currentPopulation = currentCore.populations.find(
        (population) => population.species === species,
      );
      expect(adoptedPopulation?.populationSize).toBe(currentPopulation?.populationSize);
      expect(adoptedPopulation?.members.map(({ actor }) => actor.identity))
        .toEqual(currentPopulation?.members.map(({ actor }) => actor.identity));
    }
    const adoptedGoats = adoptedCore.populations.filter(
      ({ species }) => species === "domestic-goat",
    );
    const adoptedHerds = adoptedCore.groups.groups.filter(
      ({ identity }) => identity.species === "domestic-goat",
    );
    expect(adoptedGoats).toHaveLength(1);
    expect(adoptedGoats[0]).toMatchObject({ populationSize: 2 });
    expect(adoptedGoats[0]?.members).toHaveLength(2);
    expect(adoptedHerds).toHaveLength(1);
    expect(adoptedHerds[0]?.identity).toMatchObject({
      organization: "herd",
      stableId: expect.stringMatching(/^HERD-v1-/u),
    });
    for (const species of [
      "brown-rat",
      "southern-leopard-frog",
      "atlantic-silverside",
      "atlantic-marsh-fiddler-crab",
    ] as const) {
      expect(adoptedCore.aggregatePopulations.find(
        (population) => population.species === species,
      )).toEqual(currentCore.aggregatePopulations.find(
        (population) => population.species === species,
      ));
    }
    expect(new Set(coreActors(adoptedCore).map(({ identity }) => identity.stableId)).size)
      .toBe(coreActors(adoptedCore).length);
    expect(adopted.physicalCargo).toEqual(current.physicalCargo);

    const adoptedText = adopted.regionalEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(adoptedText);
    resumed.destroy();
  }, 45_000);

  it("migrates a sealed v10 habitat once while preserving every established state root", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "alpha fifteen marsh edge persistence",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const currentRecord = repository.snapshot();
    const v10Record = harborEdgeV10Record(currentRecord);
    const v10Envelope = JSON.parse(v10Record.worldJson) as CurrentEnvelope;
    const v10Ecology = deserializeOrMigrateCoreEcologyAggregatePatch(v10Envelope.coreEcology);
    if (v10Ecology === null || v10Ecology.derivation.kind !== "habitat-v2") {
      throw new Error("v10 fixture omitted its authenticated harbor-edge ecology");
    }
    expect(v10Ecology.populations.some(({ species }) => (
      species === "marsh-rabbit" || species === "marsh-fox"
    ))).toBe(false);
    expect(v10Ecology.aggregatePopulations[0]?.evidence.length).toBeGreaterThan(0);
    await repository.save(v10Record);
    initial.destroy();
    scheduledFrame = undefined;

    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const v13Record = repository.snapshot();
    const v13Envelope = requiredEnvelope(repository);
    const v13Ecology = requiredCore(v13Envelope);
    expect(v13Record.payloadVersion).toBe(50);
    expect(v13Ecology.derivation.kind).toBe("habitat-v11");
    expect(v13Envelope.world).toBe(v10Envelope.world);
    expect(v13Envelope.player).toEqual(currentPlayerFromLegacy(v10Envelope.player));
    expect(v13Envelope.physicalCargo).toEqual(v10Envelope.physicalCargo);
    expect(v13Envelope.promiseJourney).toEqual(v10Envelope.promiseJourney);
    expect(v13Envelope.bio0Ecology).toBe(v10Envelope.bio0Ecology);
    for (const oldGroup of v10Ecology.groups.groups) {
      expect(v13Ecology.groups.groups.find(
        ({ identity }) => identity.stableId === oldGroup.identity.stableId,
      )).toEqual(oldGroup);
    }
    for (const oldAggregate of v10Ecology.aggregatePopulations) {
      expect(v13Ecology.aggregatePopulations.find(
        ({ aggregateId }) => aggregateId === oldAggregate.aggregateId,
      )).toEqual(oldAggregate);
    }
    for (const oldPopulation of v10Ecology.populations) {
      expect(v13Ecology.populations.find(({ species, populationKey }) => (
        species === oldPopulation.species && populationKey === oldPopulation.populationKey
      ))).toEqual(oldPopulation);
    }
    if (
      v13Ecology.derivation.kind !== "habitat-v11"
      || v10Ecology.derivation.kind !== "habitat-v2"
    ) throw new Error("migration did not retain canonical habitat derivations");
    expect(v13Ecology.derivation.habitat.populations.slice(
      0,
      CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length,
    )).toEqual(v10Ecology.derivation.habitat.populations);

    const stableEcology = v13Envelope.regionalEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(stableEcology);
    resumed.destroy();
  }, 45_000);

  it("migrates a sealed v11 habitat by preserving Alpha-16 state and appending Rain Chorus once", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "rain-chorus-runtime-2",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const currentRecord = repository.snapshot();
    const currentEnvelope = requiredEnvelope(repository);
    const currentEcology = requiredCore(currentEnvelope);
    if (currentEcology.derivation.kind !== "habitat-v11") {
      throw new Error("current fixture omitted its regional-upland habitat");
    }
    const v11Record = marshEdgeV11Record(currentRecord);
    const v11Envelope = JSON.parse(v11Record.worldJson) as CurrentEnvelope;
    const v11Ecology = deserializeOrMigrateCoreEcologyAggregatePatch(v11Envelope.coreEcology);
    if (v11Ecology === null || v11Ecology.derivation.kind !== "habitat-v3") {
      throw new Error("v11 fixture omitted its authenticated marsh-edge ecology");
    }
    expect(v11Ecology.populations.some(({ species }) => (
      species === "fish-crow" || species === "northern-harrier"
    ))).toBe(false);
    expect(v11Ecology.groups.groups.some(
      ({ identity }) => identity.species === "fish-crow",
    )).toBe(false);
    expect(v11Ecology.aggregatePopulations.some(
      ({ species }) => species === "southern-leopard-frog",
    )).toBe(false);
    await repository.save(v11Record);
    initial.destroy();
    scheduledFrame = undefined;

    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const v13Record = repository.snapshot();
    const v13Envelope = requiredEnvelope(repository);
    const v13Ecology = requiredCore(v13Envelope);
    expect(v13Record.payloadVersion).toBe(50);
    expect(v13Ecology.derivation.kind).toBe("habitat-v11");
    expect(v13Envelope.world).toBe(v11Envelope.world);
    expect(v13Envelope.player).toEqual(currentPlayerFromLegacy(v11Envelope.player));
    expect(v13Envelope.physicalCargo).toEqual(v11Envelope.physicalCargo);
    expect(v13Envelope.promiseJourney).toEqual(v11Envelope.promiseJourney);
    expect(v13Envelope.bio0Ecology).toBe(v11Envelope.bio0Ecology);
    for (const oldPopulation of v11Ecology.populations) {
      expect(stableStringify(v13Ecology.populations.find(({ species, populationKey }) => (
        species === oldPopulation.species && populationKey === oldPopulation.populationKey
      )))).toBe(stableStringify(oldPopulation));
    }
    for (const oldGroup of v11Ecology.groups.groups) {
      expect(stableStringify(v13Ecology.groups.groups.find(
        ({ identity }) => identity.stableId === oldGroup.identity.stableId,
      ))).toBe(stableStringify(oldGroup));
    }
    for (const oldAggregate of v11Ecology.aggregatePopulations) {
      expect(stableStringify(v13Ecology.aggregatePopulations.find(
        ({ aggregateId }) => aggregateId === oldAggregate.aggregateId,
      ))).toBe(stableStringify(oldAggregate));
    }
    if (v13Ecology.derivation.kind !== "habitat-v11") {
      throw new Error("v11 migration did not reach the current regional-upland derivation");
    }
    expect(v13Ecology.derivation.habitat.populations.slice(
      0,
      CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES.length,
    )).toEqual(v11Ecology.derivation.habitat.populations);
    for (const species of ["fish-crow", "northern-harrier"] as const) {
      const migratedPopulation = v13Ecology.populations.find(
        (population) => population.species === species,
      );
      const currentPopulation = currentEcology.populations.find(
        (population) => population.species === species,
      );
      expect(migratedPopulation?.populationSize).toBe(currentPopulation?.populationSize);
      expect(migratedPopulation?.members.map(({ actor }) => actor.identity))
        .toEqual(currentPopulation?.members.map(({ actor }) => actor.identity));
    }
    expect(stableStringify(v13Ecology.aggregatePopulations.find(
      ({ species }) => species === "southern-leopard-frog",
    ))).toBe(stableStringify(currentEcology.aggregatePopulations.find(
      ({ species }) => species === "southern-leopard-frog",
    )));
    expect(v13Ecology.groups.groups.filter(
      ({ identity }) => identity.species === "fish-crow",
    )).toEqual(currentEcology.groups.groups.filter(
      ({ identity }) => identity.species === "fish-crow",
    ));

    const stableEcology = v13Envelope.regionalEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(stableEcology);
    resumed.destroy();
  }, 45_000);

  it("migrates a sealed v12 habitat by preserving every Rain Chorus state root and appending tidal ecology once", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "alpha nineteen tidal table migration",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const currentRecord = repository.snapshot();
    const currentEnvelope = requiredEnvelope(repository);
    const currentEcology = requiredCore(currentEnvelope);
    if (currentEcology.derivation.kind !== "habitat-v11") {
      throw new Error("current fixture omitted its regional-upland habitat");
    }
    const v12Record = rainChorusV12Record(currentRecord);
    const v12Envelope = JSON.parse(v12Record.worldJson) as unknown as CurrentEnvelope;
    const v12Ecology = deserializeOrMigrateCoreEcologyAggregatePatch(v12Envelope.coreEcology);
    if (v12Ecology === null || v12Ecology.derivation.kind !== "habitat-v4") {
      throw new Error("v12 fixture omitted its authenticated Rain Chorus ecology");
    }
    expect(v12Ecology.populations.some(({ species }) => species === "snowy-egret"))
      .toBe(false);
    expect(v12Ecology.aggregatePopulations.some(({ species }) => (
      species === "atlantic-silverside"
      || species === "atlantic-marsh-fiddler-crab"
    ))).toBe(false);
    await repository.save(v12Record);
    initial.destroy();
    scheduledFrame = undefined;

    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const v13Record = repository.snapshot();
    const v13Envelope = requiredEnvelope(repository);
    const v13Ecology = requiredCore(v13Envelope);
    expect(v13Record.payloadVersion).toBe(50);
    expect(v13Ecology.derivation.kind).toBe("habitat-v11");
    expect(v13Envelope.world).toBe(v12Envelope.world);
    expect(v13Envelope.player).toEqual(currentPlayerFromLegacy(v12Envelope.player));
    expect(v13Envelope.physicalCargo).toEqual(v12Envelope.physicalCargo);
    expect(v13Envelope.promiseJourney).toEqual(v12Envelope.promiseJourney);
    expect(v13Envelope.bio0Ecology).toBe(v12Envelope.bio0Ecology);
    for (const oldPopulation of v12Ecology.populations) {
      expect(v13Ecology.populations.find(({ species, populationKey }) => (
        species === oldPopulation.species && populationKey === oldPopulation.populationKey
      ))).toEqual(oldPopulation);
    }
    for (const oldGroup of v12Ecology.groups.groups) {
      expect(v13Ecology.groups.groups.find(
        ({ identity }) => identity.stableId === oldGroup.identity.stableId,
      )).toEqual(oldGroup);
    }
    for (const oldAggregate of v12Ecology.aggregatePopulations) {
      expect(v13Ecology.aggregatePopulations.find(
        ({ aggregateId }) => aggregateId === oldAggregate.aggregateId,
      )).toEqual(oldAggregate);
    }
    if (v13Ecology.derivation.kind !== "habitat-v11") {
      throw new Error("v12 migration did not reach the current regional-upland derivation");
    }
    expect(v13Ecology.derivation.habitat.populations.slice(
      0,
      CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES.length,
    )).toEqual(v12Ecology.derivation.habitat.populations);
    for (const species of [
      "atlantic-silverside",
      "atlantic-marsh-fiddler-crab",
    ] as const) {
      expect(v13Ecology.aggregatePopulations.find(
        (population) => population.species === species,
      )).toEqual(currentEcology.aggregatePopulations.find(
        (population) => population.species === species,
      ));
    }

    const stableEcology = v13Envelope.regionalEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(stableEcology);
    resumed.destroy();
  }, 45_000);

  it("adopts a sealed v13 Tide Table once and appends one stable waterfowl actor", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "duck-runtime-0",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const currentRecord = repository.snapshot();
    const currentEnvelope = requiredEnvelope(repository);
    const currentEcology = requiredCore(currentEnvelope);
    const currentDuck = currentEcology.populations.find(({ species }) => (
      species === "american-black-duck"
    ));
    if (currentDuck === undefined || currentEcology.derivation.kind !== "habitat-v11") {
      throw new Error("current migration fixture omitted its bounded duck");
    }
    const v13Record = tidalTableV13Record(currentRecord);
    const v13Envelope = JSON.parse(v13Record.worldJson) as unknown as CurrentEnvelope;
    const v13Ecology = deserializeOrMigrateCoreEcologyAggregatePatch(v13Envelope.coreEcology);
    if (v13Ecology === null || v13Ecology.derivation.kind !== "habitat-v5") {
      throw new Error("v13 fixture omitted its authenticated Tide Table ecology");
    }
    expect(v13Ecology.populations.some(({ species }) => (
      species === "american-black-duck"
    ))).toBe(false);
    await repository.save(v13Record);
    initial.destroy();
    scheduledFrame = undefined;

    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const adoptedRecord = repository.snapshot();
    const adoptedEnvelope = requiredEnvelope(repository);
    const adopted = requiredCore(adoptedEnvelope);
    expect(adoptedRecord.payloadVersion).toBe(50);
    expect(adopted.derivation.kind).toBe("habitat-v11");
    expect(adoptedEnvelope.world).toBe(v13Envelope.world);
    expect(adoptedEnvelope.player).toEqual(currentPlayerFromLegacy(v13Envelope.player));
    expect(adoptedEnvelope.physicalCargo).toEqual(v13Envelope.physicalCargo);
    for (const oldPopulation of v13Ecology.populations) {
      expect(adopted.populations.find(({ species, populationKey }) => (
        species === oldPopulation.species && populationKey === oldPopulation.populationKey
      ))).toEqual(oldPopulation);
    }
    for (const oldAggregate of v13Ecology.aggregatePopulations) {
      expect(adopted.aggregatePopulations.find(({ aggregateId }) => (
        aggregateId === oldAggregate.aggregateId
      ))).toEqual(oldAggregate);
    }
    expect(adopted.populations.find(({ species }) => (
      species === "american-black-duck"
    ))).toEqual({
      ...currentDuck,
      members: currentDuck.members.map((member) => ({
        ...member,
        actor: {
          ...member.actor,
          address: { ...member.actor.address, persistence: "regional" },
        },
      })),
    });

    const stableEcology = adoptedEnvelope.regionalEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(stableEcology);
    resumed.destroy();
  }, 45_000);

  it("adopts a sealed v14 habitat once without rerolling its established ecology", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "otter habitat 0",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const currentRecord = repository.snapshot();
    const v14Record = waterfowlV14Record(currentRecord);
    const v14Envelope = JSON.parse(v14Record.worldJson) as unknown as CurrentEnvelope;
    const v14Ecology = deserializeOrMigrateCoreEcologyAggregatePatch(v14Envelope.coreEcology);
    if (v14Ecology === null || v14Ecology.derivation.kind !== "habitat-v6") {
      throw new Error("v14 fixture omitted its authenticated waterfowl ecology");
    }
    expect(v14Ecology.populations.some(
      ({ species }) => species === "north-american-river-otter",
    )).toBe(false);
    expect(v14Ecology.groups.groups.some(
      ({ identity }) => identity.species === "domestic-chicken",
    )).toBe(false);
    await repository.save(v14Record);
    initial.destroy();
    scheduledFrame = undefined;

    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const adoptedRecord = repository.snapshot();
    const adoptedEnvelope = requiredEnvelope(repository);
    const adopted = requiredCore(adoptedEnvelope);
    expect(adoptedRecord.payloadVersion).toBe(50);
    expect(adopted.derivation.kind).toBe("habitat-v11");
    expect(adoptedEnvelope.world).toBe(v14Envelope.world);
    expect(adoptedEnvelope.player).toEqual(currentPlayerFromLegacy(v14Envelope.player));
    expect(adoptedEnvelope.physicalCargo).toEqual(v14Envelope.physicalCargo);
    for (const established of v14Ecology.groups.groups) {
      expect(adopted.groups.groups.find(
        ({ identity }) => identity.stableId === established.identity.stableId,
      )).toEqual(established);
    }
    expect(adopted.aggregatePopulations).toEqual(v14Ecology.aggregatePopulations);
    for (const established of v14Ecology.populations) {
      expect(adopted.populations.find(({ species, populationKey }) => (
        species === established.species && populationKey === established.populationKey
      ))).toEqual(established);
    }
    if (adopted.derivation.kind !== "habitat-v11") {
      throw new Error("v14 migration did not reach regional-upland habitat v10");
    }
    const otterHabitat = adopted.derivation.habitat.populations.find(
      ({ species }) => species === "north-american-river-otter",
    );
    expect(adopted.populations.some(
      ({ species }) => species === "north-american-river-otter",
    )).toBe((otterHabitat?.populationUnits ?? 0) > 0);
    const chickenPopulations = adopted.populations.filter(
      ({ species }) => species === "domestic-chicken",
    );
    const chickenGroups = adopted.groups.groups.filter(
      ({ identity }) => identity.species === "domestic-chicken",
    );
    expect(chickenPopulations).toHaveLength(1);
    expect(chickenGroups).toHaveLength(1);
    const chickenPopulation = chickenPopulations[0];
    const chickenGroup = chickenGroups[0];
    expect(chickenPopulation?.members.length).toBeGreaterThanOrEqual(2);
    expect(chickenPopulation?.members.length).toBeLessThanOrEqual(3);
    expect(chickenGroup?.memberOrdinals).toEqual(
      chickenPopulation?.members.map(({ populationOrdinal }) => populationOrdinal).sort(),
    );
    const goatPopulations = adopted.populations.filter(
      ({ species }) => species === "domestic-goat",
    );
    const goatHerds = adopted.groups.groups.filter(
      ({ identity }) => identity.species === "domestic-goat",
    );
    expect(goatPopulations).toHaveLength(1);
    expect(goatPopulations[0]).toMatchObject({ populationSize: 2 });
    expect(goatPopulations[0]?.members).toHaveLength(2);
    expect(goatHerds).toHaveLength(1);
    expect(goatHerds[0]?.identity).toMatchObject({
      organization: "herd",
      stableId: expect.stringMatching(/^HERD-v1-/u),
    });
    expect(goatHerds[0]?.memberOrdinals).toEqual(
      goatPopulations[0]?.members.map(({ populationOrdinal }) => populationOrdinal).sort(),
    );

    const stableEcology = adoptedEnvelope.regionalEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(stableEcology);
    resumed.destroy();
  }, 45_000);

  it("creates a reachable snowy egret and advances its first regional runtime tick", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "egret-runtime-audit-1",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const freshEnvelope = requiredEnvelope(repository);
    const sourcePatch = requiredCore(freshEnvelope);
    const sourceEgret = coreActors(sourcePatch).find(({ identity }) => (
      identity.species === "snowy-egret"
    ));
    if (sourceEgret === undefined) {
      throw new Error("Reachability fixture omitted its bounded snowy egret");
    }
    const adoptedEnvelope = resealedEnvelope(freshEnvelope, {
      coreEcology: serializeCoreEcologyAggregatePatch(promoteFixtureActors(
        sourcePatch,
        [sourceEgret.identity.stableId],
      )),
    });
    await repository.save(recordWithEnvelope(record, adoptedEnvelope));
    initial.destroy();
    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);
    await runtime.save();

    const beforeEnvelope = requiredEnvelope(repository);
    const beforeWorld = deserializeWorld(beforeEnvelope.world);
    const before = requiredCore(beforeEnvelope);
    const beforeEgret = coreActors(before).find(({ identity }) => (
      identity.stableId === sourceEgret.identity.stableId
    ));
    if (beforeEgret === undefined) {
      throw new Error("Reachability fixture omitted its bounded snowy egret");
    }
    expect(beforeWorld.meta.completedTick).toBe(WORLD_NEW_GAME_START_TICK);
    expect(beforeEgret.updatedAtTick).toBe(beforeWorld.meta.completedTick);
    expect(requiredRegionalActivityProjection(
      beforeEnvelope,
      beforeEgret.identity.stableId,
    )).toMatchObject({
      species: "snowy-egret",
      state: "resting",
      preferredNeutralIntent: "rest",
      routine: {
        profileId: "adaptive-active",
        clockPreference: "rest",
        effectivePreference: "rest",
        activatingDriver: null,
        restDestinationArrived: true,
        posture: { state: "resting" },
        action: "settle-at-rest-destination",
      },
      motion: { kind: "hold-position" },
    });

    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const afterEnvelope = requiredEnvelope(repository);
    const afterWorld = deserializeWorld(afterEnvelope.world);
    const after = requiredCore(afterEnvelope);
    const afterEgret = coreActors(after).find(({ identity }) => (
      identity.stableId === beforeEgret.identity.stableId
    ));
    if (afterEgret === undefined) throw new Error("Snowy egret vanished on its first tick");
    expect(afterWorld.meta.completedTick).toBe(beforeWorld.meta.completedTick + 1);
    expect(after.updatedAtTick).toBe(afterWorld.meta.completedTick);
    expect(afterEgret.identity).toEqual(beforeEgret.identity);
    expect(afterEgret.updatedAtTick).toBe(afterWorld.meta.completedTick);
    expect(afterEgret.address.position).toEqual(beforeEgret.address.position);
    expect(afterEgret.intent).toMatchObject({
      kind: "rest",
      cause: { kind: "condition", referenceId: "activity:rest-window" },
      focusObservationId: null,
    });
    expect(requiredRegionalActivityProjection(
      afterEnvelope,
      afterEgret.identity.stableId,
    )).toMatchObject({
      species: "snowy-egret",
      state: "resting",
      preferredNeutralIntent: "rest",
      routine: {
        profileId: "adaptive-active",
        clockPreference: "rest",
        effectivePreference: "rest",
        activatingDriver: null,
        restDestinationArrived: true,
        posture: { state: "resting" },
        action: "settle-at-rest-destination",
      },
      motion: { kind: "hold-position" },
    });
    expect(afterEgret.perception.beliefs.length).toBeGreaterThan(0);
    expect(afterEgret.perception.beliefs.every(({ lastObservedTick }) => (
      lastObservedTick === afterWorld.meta.completedTick
    ))).toBe(true);
    expect(afterEgret.perception.beliefs.some(({ identification, subjectId }) => (
      identification === "identified" && subjectId !== null
    ))).toBe(true);
    expect(afterEgret.memories).toEqual([]);

    const durable = afterEnvelope.regionalEcology;
    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(durable);
    resumed.destroy();
  }, 45_000);

  it("quarantines legacy v8 ecology with missing or invented population topology", async () => {
    for (const variant of ["missing-gull", "invented-gull-key"] as const) {
      const repository = new MemoryRepository();
      const initial = await createTideweftRuntime(repository);
      initial.dispatchUI({
        type: "new-world",
        seed: `invalid alpha thirteen topology ${variant}`,
        posture: "gale",
        sessionShape: "wander",
      });
      await initial.save();
      const currentRecord = repository.snapshot();
      const current = requiredEnvelope(repository);
      const legacy = publishedV8CoreEcologyFixture(current, variant);
      const {
        integrity: _currentIntegrity,
        playerExpressionRecency: _currentPlayerExpressionRecency,
        settlementEcology: _currentSettlementEcology,
        dogActorRoster: _currentDogActorRoster,
        settlementWorkingAnimals: _currentSettlementWorkingAnimals,
        settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
        regionalEcology: _currentRegionalEcology,
        ...currentBase
      } = current;
      const v8Base = {
        ...currentBase,
        player: legacyPlayerWithoutTimeAction(current.player),
        perceptionCarry: legacyPerceptionCarry(current.perceptionCarry),
        version: 8 as const,
        coreEcology: legacy.text,
      };
      await repository.save({
        ...currentRecord,
        payloadVersion: 8,
        updatedAt: currentRecord.updatedAt + 1,
        worldJson: JSON.stringify({
          ...v8Base,
          integrity: gameSaveEnvelopeIntegrity(v8Base),
        }),
      });
      initial.destroy();
      scheduledFrame = undefined;

      const rejected = await createTideweftRuntime(repository);
      expect(rejected.getUIView().title.hasSave).toBe(false);
      expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
      rejected.destroy();
      scheduledFrame = undefined;
    }
  }, 45_000);

  it("quarantines a legacy ecology nested inside a sealed v24 envelope", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "legacy ecology cannot masquerade as current",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const current = requiredEnvelope(repository);
    const masquerading = resealedEnvelope(current, {
      coreEcology: publishedV8CoreEcologyFixture(current).text,
    });
    await repository.save({
      ...record,
      payloadVersion: 24,
      worldJson: JSON.stringify(masquerading),
    });
    initial.destroy();
    scheduledFrame = undefined;

    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().title.hasSave).toBe(false);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  });

  it("quarantines an Alpha-19 aggregate record masquerading inside a sealed v24 envelope", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "aggregate version fence cannot masquerade as current",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const current = requiredEnvelope(repository);
    const masquerading = resealedEnvelope(current, {
      coreEcology: serializePublishedAggregateV3(requiredCore(current)),
    });
    await repository.save({
      ...record,
      payloadVersion: 24,
      worldJson: JSON.stringify(masquerading),
    });
    initial.destroy();
    scheduledFrame = undefined;

    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().title.hasSave).toBe(false);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  });

  it("quarantines a current aggregate record masquerading inside a sealed v13 envelope", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "current aggregate cannot masquerade as alpha nineteen",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const current = requiredEnvelope(repository);
    const {
      integrity: _integrity,
      playerExpressionRecency: _futurePlayerExpressionRecency,
      settlementEcology: _currentSettlementEcology,
      dogActorRoster: _currentDogActorRoster,
      settlementWorkingAnimals: _currentSettlementWorkingAnimals,
      settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
      regionalEcology: _currentRegionalEcology,
      ...currentBase
    } = current;
    const masqueradingBase = {
      ...currentBase,
      player: legacyPlayerWithoutTimeAction(current.player),
      perceptionCarry: legacyPerceptionCarry(current.perceptionCarry),
      version: 13 as const,
      coreEcology: serializeCoreEcologyAggregatePatch(requiredCore(current)),
    };
    await repository.save({
      ...record,
      payloadVersion: 13,
      updatedAt: record.updatedAt + 1,
      worldJson: JSON.stringify({
        ...masqueradingBase,
        integrity: gameSaveEnvelopeIntegrity(masqueradingBase),
      }),
    });
    initial.destroy();
    scheduledFrame = undefined;

    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().title.hasSave).toBe(false);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  });

  it("renders lawful wildlife and persists one reaction plus one physical meal across reload", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "wildlife alarm crossing",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    let v24Patch = requiredCore(envelope);
    const bear = v24Patch.populations.find(({ species }) => species === "black-bear")
      ?.members[0]?.actor;
    const deer = v24Patch.populations.find(({ species }) => species === "deer")
      ?.members[0]?.actor;
    if (bear === undefined || deer === undefined) {
      throw new Error("published v24 fixture omitted its black bear or deer");
    }
    v24Patch = promoteFixtureActors(v24Patch, [
      bear.identity.stableId,
      deer.identity.stableId,
    ]);
    const seeded = addFixtureForageProvision(
      requiredCargo(envelope),
      bear.address.position,
      `wave-a:${hashCanonical([
        "wave-a/alarm-crossing",
        bear.identity.stableId,
        "dried-fish",
      ])}`,
    );
    const adopted = resealedEnvelope(envelope, {
      coreEcology: serializeCoreEcologyAggregatePatch(v24Patch),
      physicalCargo: snapshotPhysicalCargoState(seeded.state),
    });
    await repository.save(recordWithEnvelope(record, adopted));
    initial.destroy();
    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);

    const visibleWildlife = runtime.getRenderView().wildlife ?? [];
    expect(visibleWildlife.length).toBeGreaterThan(0);
    const visible = visibleWildlife[0];
    if (!visible) throw new Error("fresh Wave-A wildlife was not directly perceived");
    expect(visible.quickLabel).not.toContain(visible.actorId);
    runtime.dispatchRenderer({
      type: "select",
      entity: "living-actor",
      species: visible.species,
      id: visible.actorId,
      point: visible.position,
    });
    expect(runtime.getRenderView().wildlife?.find(({ actorId }) => actorId === visible.actorId))
      .toMatchObject({ selected: true });
    expect(runtime.getUIView().selectedLivingActor).toMatchObject({
      target: { species: visible.species, actorId: visible.actorId },
      quick: { target: { species: visible.species, actorId: visible.actorId } },
      about: {
        target: { species: visible.species, actorId: visible.actorId },
        known: [],
      },
    });
    expect(runtime.getUIView().selectedLivingActor?.about.identityLine)
      .not.toContain(visible.actorId);

    await runtime.save();
    const before = requiredEnvelope(repository);
    const beforeWorld = deserializeWorld(before.world);
    const beforeCore = requiredCore(before);
    expect(regionalCoreActors(requiredRegionalEcology(before)).filter(
      ({ identity, condition }) => identity.species === "black-bear" && condition.health > 0,
    ).map(({ identity }) => identity.stableId)).not.toEqual([]);
    const beforeCargo = requiredCargo(before);
    const seededProvisions = forageProvisions(beforeCargo);
    expect(before.version).toBe(50);
    expect(beforeWorld.meta.completedTick).toBe(WORLD_NEW_GAME_START_TICK);
    expect(beforeCore.updatedAtTick).toBe(beforeWorld.meta.completedTick);
    expect(seededProvisions).toHaveLength(1);
    expect(consumptionHistory(beforeCargo)).toEqual([]);
    expect(beforeCargo.expectedManifest.totalQuantity).toBe(1);

    advancePlayerSteps(runtime, 30);
    await runtime.save();
    const after = requiredEnvelope(repository);
    const afterWorld = deserializeWorld(after.world);
    const afterCore = requiredCore(after);
    const afterCargo = requiredCargo(after);
    expect(afterWorld.meta.completedTick).toBe(beforeWorld.meta.completedTick + 3);
    expect(afterCore.updatedAtTick).toBe(afterWorld.meta.completedTick);

    const reaction = requiredCrossSpeciesReaction(afterCore);
    expect(reaction.actor.identity.species).toBe("black-bear");
    expect(reaction.subject.identity.species).toBe("deer");
    expect(reaction.memory.kind).toBe("pursuit");
    expect(reaction.memory.referenceId).toBe(reaction.subject.identity.stableId);
    expect(reaction.memory.observationId).toBe(reaction.evidenceObservationId);

    expect(forageProvisions(afterCargo)).toEqual([]);
    expect(afterCargo.expectedManifest.totalQuantity)
      .toBe(beforeCargo.expectedManifest.totalQuantity - 1);
    const consumed = consumptionHistory(afterCargo);
    expect(consumed).toHaveLength(1);
    expect(consumed[0]).toMatchObject({
      entityIds: [seededProvisions[0]!.id],
      quantity: 1,
      causes: ["animal-consumption"],
    });
    const foodMemories = coreActors(afterCore).flatMap((actor) => actor.memories
      .filter(({ kind, referenceId }) => (
        kind === "food" && referenceId === seededProvisions[0]!.id
      ))
      .map((memory) => ({ actor, memory })));
    // Food memories record lawful perception/intent, not custody. Rain Chorus
    // adds another scavenger which may notice the same parcel before the
    // sorted physical claim resolver awards its single unit to the bear.
    expect(foodMemories.length).toBeGreaterThan(0);
    expect(foodMemories.some(({ actor }) => actor.identity.species === "black-bear"))
      .toBe(true);

    const durableCore = after.regionalEcology;
    const durableCargo = after.physicalCargo;
    runtime.destroy();
    scheduledFrame = undefined;

    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    const reloaded = requiredEnvelope(repository);
    expect(reloaded.regionalEcology).toBe(durableCore);
    expect(reloaded.physicalCargo).toEqual(durableCargo);
    const reloadedCargo = requiredCargo(reloaded);
    expect(forageProvisions(reloadedCargo)).toEqual([]);
    expect(consumptionHistory(reloadedCargo)).toHaveLength(1);

    advancePlayerSteps(resumed, 10);
    await resumed.save();
    const replayed = requiredEnvelope(repository);
    const replayedCargo = requiredCargo(replayed);
    expect(forageProvisions(replayedCargo)).toEqual([]);
    expect(consumptionHistory(replayedCargo)).toHaveLength(1);
    expect(replayedCargo.expectedManifest.totalQuantity).toBe(0);
    resumed.destroy();
  }, 120_000);

  it("routes around directly observed wildlife owned outside the settlement-home ecology", async () => {
    const { runtime, repository, alarmActorId } = await createAlarmRuntime(-4);
    runtime.dispatchUI({ type: "resume-world" });
    const before = requiredEnvelope(repository);
    const regionalBefore = requiredRegionalEcology(before);
    const ownerBefore = requiredRegionalCoreOwner(before, alarmActorId);
    expect(ownerBefore.patchKey).not.toBe(regionalBefore.settlementHome.patch.patchKey);
    expect(regionalBefore.activeResidents.some(({ patch }) => (
      patch.patchKey === ownerBefore.patchKey
    ))).toBe(true);

    const wildlife = runtime.getRenderView().wildlife?.find(({ actorId }) => (
      actorId === alarmActorId
    ));
    if (wildlife === undefined) {
      throw new Error("Regional reroute fixture could not directly observe its deer");
    }
    runtime.dispatchRenderer({
      type: "select",
      entity: "living-actor",
      species: wildlife.species,
      id: wildlife.actorId,
      point: wildlife.position,
    });
    expect(runtime.getUIView().selectedLivingActor?.interactions?.find(({ id }) => (
      id === "reroute"
    ))).toMatchObject({ id: "reroute", disabled: true });

    const start = runtime.getRenderView().player.position;
    const tileSize = runtime.getRenderView().terrain.tileSize;
    const direction = Math.sign(wildlife.position.x - start.x);
    if (direction === 0) throw new Error("Regional reroute fixture placed deer over player");
    const destination = {
      x: start.x + direction * 6 * tileSize,
      y: start.y,
    };
    runtime.dispatchRenderer({ type: "move-target", point: destination, additive: false });
    // Route planning changes the contextual choice. Re-selection mirrors the
    // next player-facing projection instead of inspecting stale cached UI.
    runtime.dispatchRenderer({
      type: "select",
      entity: "living-actor",
      species: wildlife.species,
      id: wildlife.actorId,
      point: wildlife.position,
    });
    expect(runtime.getUIView().selectedLivingActor?.interactions?.find(({ id }) => (
      id === "reroute"
    ))?.disabled).not.toBe(true);
    runtime.dispatchUI({
      type: "living-actor",
      action: "interact",
      interaction: "reroute",
      target: { species: wildlife.species, actorId: wildlife.actorId },
    });
    expect(runtime.getUIView().announcement?.message).toBe(
      "The Loom bends the current route around the actor's observed position.",
    );
    await runtime.save();

    const saved = requiredEnvelope(repository);
    const actorAtChoice = requiredCoreActor(
      requiredRegionalCoreOwner(saved, alarmActorId),
      alarmActorId,
    );
    const choices = canonicalizeLivingActorPlayerChoiceState(saved.livingActorPlayerChoice);
    if (choices === null) throw new Error("Regional reroute fixture lost its choice ledger");
    const reroutes = choices.events.filter(({ kind, effect }) => (
      kind === "reroute"
      && effect.kind === "request-reroute"
      && effect.focusActorId === alarmActorId
    ));
    expect(reroutes).toHaveLength(1);
    expect(reroutes[0]).toMatchObject({
      kind: "reroute",
      effect: {
        kind: "request-reroute",
        focusActorId: alarmActorId,
        avoidArea: {
          radiusUnits: WORLD_POSITION_UNITS_PER_TILE,
        },
      },
    });
    const rerouteEffect = reroutes[0]?.effect;
    if (rerouteEffect?.kind !== "request-reroute") {
      throw new Error("Regional reroute fixture lost its committed effect");
    }
    // The current bounded activity projection may sit between persisted world
    // ticks. Its observed locus must nevertheless remain on the same animal's
    // physical tile, rather than being synthesized from the settlement owner.
    const observedDelta = worldPositionDelta(
      actorAtChoice.address.position,
      rerouteEffect.avoidArea.center,
    );
    expect(Math.hypot(observedDelta.x, observedDelta.y))
      .toBeLessThan(WORLD_POSITION_UNITS_PER_TILE / 2);

    const visited = [start];
    runtime.start();
    for (let frame = 0; frame < 160; frame += 1) {
      const callback = scheduledFrame;
      if (!callback) throw new Error("Regional reroute stopped scheduling frames");
      scheduledFrame = undefined;
      callback(nextFrameTime);
      nextFrameTime += 100;
      const position = runtime.getRenderView().player.position;
      visited.push(position);
      if (
        Math.trunc(position.x / tileSize) === Math.trunc(destination.x / tileSize)
        && Math.trunc(position.y / tileSize) === Math.trunc(destination.y / tileSize)
      ) break;
    }
    runtime.stop();
    const arrived = runtime.getRenderView().player.position;
    expect({
      x: Math.trunc(arrived.x / tileSize),
      y: Math.trunc(arrived.y / tileSize),
    }).toEqual({
      x: Math.trunc(destination.x / tileSize),
      y: Math.trunc(destination.y / tileSize),
    });
    expect(visited.some(({ y }) => (
      Math.abs(y - start.y) >= tileSize / 2
    ))).toBe(true);
    expect(visited.some((position) => {
      const centerX = Math.trunc(position.x / tileSize) * tileSize + tileSize / 2;
      const centerY = Math.trunc(position.y / tileSize) * tileSize + tileSize / 2;
      return Math.hypot(
        centerX - wildlife.position.x,
        centerY - wildlife.position.y,
      ) <= tileSize;
    })).toBe(false);
    await runtime.save();
    const durableChoices = stableStringify(
      canonicalizeLivingActorPlayerChoiceState(
        requiredEnvelope(repository).livingActorPlayerChoice,
      ),
    );
    runtime.destroy();
    scheduledFrame = undefined;

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    await resumed.save();
    const reloaded = requiredEnvelope(repository);
    expect(stableStringify(
      canonicalizeLivingActorPlayerChoiceState(reloaded.livingActorPlayerChoice),
    )).toBe(durableChoices);
    const reloadedChoices = canonicalizeLivingActorPlayerChoiceState(
      reloaded.livingActorPlayerChoice,
    );
    expect(reloadedChoices?.events.filter(({ kind, effect }) => (
      kind === "reroute"
      && effect.kind === "request-reroute"
      && effect.focusActorId === alarmActorId
    ))).toHaveLength(1);
    expect(requiredRegionalCoreOwner(reloaded, alarmActorId).patchKey).toBe(
      ownerBefore.patchKey,
    );
    expect(regionalCoreActors(requiredRegionalEcology(reloaded)).filter(({ identity }) => (
      identity.stableId === alarmActorId
    ))).toHaveLength(1);
    resumed.destroy();
  }, 120_000);

  it(`${PHYSICAL_PROVISION_CONSERVATION_OWNER_INTENT} lets one fish crow physically reach and consume one persistent provision exactly once`, async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "rain-chorus-runtime-2",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    let patch = requiredCore(envelope);
    const crow = patch.populations.find(
      ({ species }) => species === "fish-crow",
    )?.members[0]?.actor;
    if (crow === undefined) throw new Error("Rain Chorus fixture omitted its fish crow");
    let cargo = requiredCargo(envelope);
    const seeded = addFixtureForageProvision(
      cargo,
      crow.address.position,
      "crow-provision",
    );
    cargo = seeded.state;
    const provision = seeded.entity;
    const located = locatePhysicalCargoEntity(cargo, provision.id);
    if (located === null) throw new Error("crow fixture could not locate its physical provision");
    const looseUnitsPerWorldUnit = LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE;
    const provisionPosition = createWorldPosition(
      located.world.region,
      Math.trunc(provision.x / looseUnitsPerWorldUnit),
      Math.trunc(provision.y / looseUnitsPerWorldUnit),
    );
    const crowStart = translateWorldPosition(
      provisionPosition,
      -2 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    const hungryCrow = replaceCoreWildlifeActorPhysiology(crow, {
      atTick: patch.updatedAtTick,
      needs: { ...crow.needs, hunger: 900_000 },
      condition: crow.condition,
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(hungryCrow, {
      atTick: patch.updatedAtTick,
      position: crowStart,
      heading: 0,
    }));
    const crowGroup = patch.groups.groups.find(({ identity, memberOrdinals }) => (
      identity.species === crow.identity.species
      && identity.populationKey === crow.identity.populationKey
      && memberOrdinals.includes(crow.identity.populationOrdinal)
    ));
    const crowGroupMemberIds = new Set(patch.populations
      .find(({ species, populationKey }) => (
        species === crow.identity.species
        && populationKey === crow.identity.populationKey
      ))?.members
      .filter(({ populationOrdinal }) => crowGroup?.memberOrdinals.includes(populationOrdinal))
      .map(({ actor }) => actor.identity.stableId) ?? []);
    let crowMateOrdinal = 0;
    for (const actor of coreActors(patch)) {
      if (actor.identity.stableId === crow.identity.stableId) continue;
      const isCrowMate = crowGroupMemberIds.has(actor.identity.stableId);
      const fixtureActor = isCrowMate
        ? replaceCoreWildlifeActorPhysiology(actor, {
            atTick: patch.updatedAtTick,
            needs: { ...actor.needs, hunger: 0 },
            condition: actor.condition,
          })
        : actor;
      patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(fixtureActor, {
        atTick: patch.updatedAtTick,
        position: isCrowMate
          ? translateWorldPosition(
              crowStart,
              (crowMateOrdinal + 1) * Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 4),
              Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
            )
          : translateWorldPosition(
              provisionPosition,
              (80 + actor.identity.populationOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
              20 * WORLD_POSITION_UNITS_PER_TILE,
            ),
        heading: actor.address.heading,
      }));
      if (isCrowMate) crowMateOrdinal += 1;
    }
    patch = reconcileFixtureGroupAnchors(patch);
    const prepared = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
      physicalCargo: snapshotPhysicalCargoState(cargo),
    });
    await repository.save(recordWithEnvelope(record, prepared));
    initial.destroy();
    scheduledFrame = undefined;

    const runtime = await createTideweftRuntime(repository);
    const baselineManifest = cargo.expectedManifest.totalQuantity;
    const baselineHistory = consumptionHistory(cargo).length;
    expect(baselineManifest).toBe(1);
    expect(baselineHistory).toBe(0);

    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const beforeContactEnvelope = requiredEnvelope(repository);
    const beforeContactCargo = requiredCargo(beforeContactEnvelope);
    const beforeContactCrow = coreActors(requiredCore(beforeContactEnvelope)).find(
      ({ identity }) => identity.stableId === crow.identity.stableId,
    );
    if (beforeContactCrow === undefined) throw new Error("crow vanished before physical contact");
    let contactEnvelope: CurrentEnvelope | null = null;
    let lastPreContactHunger = beforeContactCrow.needs.hunger;
    // The first 760-unit aerial step cannot close a 2,000-unit gap to the
    // exact 750-unit contact boundary. Prove that cognition/movement occurs
    // before the physical owner is allowed to consume the one persistent lot.
    expect(locatePhysicalCargoEntity(beforeContactCargo, provision.id)).not.toBeNull();
    expect(consumptionHistory(beforeContactCargo)).toHaveLength(baselineHistory);
    expect(beforeContactCargo.expectedManifest.totalQuantity).toBe(baselineManifest);
    expect(beforeContactCrow.needs.hunger).toBeGreaterThanOrEqual(hungryCrow.needs.hunger);
    const initialDistance = worldPositionDelta(crowStart, provisionPosition);
    const approachedDistance = worldPositionDelta(
      beforeContactCrow.address.position,
      provisionPosition,
    );
    const approachedMagnitude = Math.hypot(approachedDistance.x, approachedDistance.y);
    expect(approachedMagnitude).toBeLessThan(
      Math.hypot(initialDistance.x, initialDistance.y),
    );
    expect(approachedMagnitude).toBeGreaterThan(750);
    for (let tick = 0; tick < 4 && contactEnvelope === null; tick += 1) {
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const candidate = requiredEnvelope(repository);
      const candidateCargo = requiredCargo(candidate);
      const candidateCrow = coreActors(requiredCore(candidate)).find(
        ({ identity }) => identity.stableId === crow.identity.stableId,
      );
      if (candidateCrow === undefined) throw new Error("crow vanished during its food approach");
      if (locatePhysicalCargoEntity(candidateCargo, provision.id) === null) {
        expect(candidateCrow.needs.hunger).toBeLessThan(lastPreContactHunger);
        contactEnvelope = candidate;
      } else {
        expect(candidateCrow.needs.hunger).toBeGreaterThanOrEqual(lastPreContactHunger);
        expect(consumptionHistory(candidateCargo)).toHaveLength(baselineHistory);
        expect(candidateCargo.expectedManifest.totalQuantity).toBe(baselineManifest);
        lastPreContactHunger = candidateCrow.needs.hunger;
      }
    }
    if (contactEnvelope === null) throw new Error("fish crow never reached the physical provision");
    const consumedCargo = requiredCargo(contactEnvelope);
    const consumedCore = requiredCore(contactEnvelope);
    expect(forageProvisions(consumedCargo)).toEqual([]);
    expect(consumedCargo.expectedManifest.totalQuantity).toBe(baselineManifest - 1);
    expect(consumptionHistory(consumedCargo)).toHaveLength(baselineHistory + 1);
    expect(consumptionHistory(consumedCargo).at(-1)).toMatchObject({
      entityIds: [provision.id],
      quantity: 1,
      causes: ["animal-consumption"],
    });
    const crowFoodMemories = coreActors(consumedCore).flatMap((actor) => actor.memories
      .filter(({ kind, referenceId }) => kind === "food" && referenceId === provision.id)
      .map((memory) => ({ actor, memory })));
    expect(crowFoodMemories.length).toBeGreaterThan(0);
    expect(crowFoodMemories.every(
      ({ actor }) => actor.identity.stableId === crow.identity.stableId,
    )).toBe(true);

    const durableCore = contactEnvelope.regionalEcology;
    const durableCargo = contactEnvelope.physicalCargo;
    const durableCrowFoodMemoryCount = crowFoodMemories.length;
    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    const reloaded = requiredEnvelope(repository);
    expect(reloaded.regionalEcology).toBe(durableCore);
    expect(reloaded.physicalCargo).toEqual(durableCargo);

    advancePlayerSteps(resumed, 10);
    await resumed.save();
    const replayed = requiredEnvelope(repository);
    const replayedCargo = requiredCargo(replayed);
    const replayedCrowMemories = coreActors(requiredCore(replayed)).flatMap((actor) => (
      actor.memories.filter(({ kind, referenceId }) => (
        kind === "food" && referenceId === provision.id
      ))
    ));
    expect(locatePhysicalCargoEntity(replayedCargo, provision.id)).toBeNull();
    expect(forageProvisions(replayedCargo)).toEqual([]);
    expect(replayedCargo.expectedManifest.totalQuantity).toBe(baselineManifest - 1);
    expect(consumptionHistory(replayedCargo)).toHaveLength(baselineHistory + 1);
    expect(replayedCrowMemories).toHaveLength(durableCrowFoodMemoryCount);
    resumed.destroy();
  }, 90_000);

  it("does not let a hungry northern harrier inspect or consume a loose provision", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "rain-chorus-runtime-2",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    let patch = requiredCore(envelope);
    const harrier = patch.populations.find(({ species }) => species === "northern-harrier")
      ?.members[0]?.actor;
    if (harrier === undefined) throw new Error("Harrier food-boundary fixture omitted its actor");
    let cargo = requiredCargo(envelope);
    const seeded = addFixtureForageProvision(
      cargo,
      harrier.address.position,
      "harrier-provision",
    );
    cargo = seeded.state;
    const provision = seeded.entity;
    const located = locatePhysicalCargoEntity(cargo, provision.id);
    if (located === null) throw new Error("Harrier food-boundary fixture lost provision custody");
    const provisionPosition = createWorldPosition(
      located.world.region,
      Math.trunc(provision.x / (LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE)),
      Math.trunc(provision.y / (LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE)),
    );
    const hungryHarrier = replaceCoreWildlifeActorPhysiology(harrier, {
      atTick: patch.updatedAtTick,
      needs: { ...harrier.needs, hunger: 1_000_000 },
      condition: harrier.condition,
    });
    patch = replaceCoreEcologyAggregatePatchActor(
      patch,
      repositionCoreWildlifeActor(hungryHarrier, {
        atTick: patch.updatedAtTick,
        position: provisionPosition,
        heading: harrier.address.heading,
      }),
    );
    let displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      if (actor.identity.stableId === harrier.identity.stableId) continue;
      patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
        atTick: patch.updatedAtTick,
        position: translateWorldPosition(
          provisionPosition,
          (80 + displacedOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
          20 * WORLD_POSITION_UNITS_PER_TILE,
        ),
        heading: actor.address.heading,
      }));
      displacedOrdinal += 1;
    }
    patch = promoteFixtureActors(patch, [harrier.identity.stableId]);
    const prepared = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
      physicalCargo: snapshotPhysicalCargoState(cargo),
    });
    await repository.save(recordWithEnvelope(record, prepared));
    initial.destroy();
    scheduledFrame = undefined;

    const runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const saved = requiredEnvelope(repository);
    const savedCargo = requiredCargo(saved);
    const savedHarrier = coreActors(requiredCore(saved)).find(
      ({ identity }) => identity.stableId === harrier.identity.stableId,
    );
    if (savedHarrier === undefined) throw new Error("Harrier vanished at food boundary");
    expect(locatePhysicalCargoEntity(savedCargo, provision.id)).not.toBeNull();
    expect(savedCargo.expectedManifest.totalQuantity).toBe(cargo.expectedManifest.totalQuantity);
    expect(consumptionHistory(savedCargo)).toEqual(consumptionHistory(cargo));
    expect(savedHarrier.memories.some(({ kind, referenceId }) => (
      kind === "food" && referenceId === provision.id
    ))).toBe(false);
    expect(savedHarrier.needs.hunger).toBeGreaterThanOrEqual(hungryHarrier.needs.hunger);
    runtime.destroy();
  }, 45_000);

  it("preserves a displaced crow while v25 delegates legacy activity authority", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "rain-chorus-runtime-2",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    let patch = requiredCore(envelope);
    const crow = patch.populations.find(({ species }) => species === "fish-crow")
      ?.members[0]?.actor;
    if (crow === undefined) throw new Error("Perch runtime fixture omitted its fish crow");
    const perch = crow.address.position;
    const restPressuredCrow = replaceCoreWildlifeActorPhysiology(crow, {
      atTick: patch.updatedAtTick,
      needs: { hunger: 0, safety: 0, rest: 900_000 },
      condition: { health: 1_000_000, exhaustion: 0, stress: 0 },
    });
    // Preserve the persisted-rest/perch movement scenario explicitly now that
    // fresh worlds begin in the active 07:00 window instead of at midnight.
    const restingCrow = withFixtureRestIntent(restPressuredCrow);
    const crowStart = translateWorldPosition(
      perch,
      2 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(restingCrow, {
      atTick: patch.updatedAtTick,
      position: crowStart,
      heading: crow.address.heading,
    }));
    const crowGroup = patch.groups.groups.find(({ identity, memberOrdinals }) => (
      identity.species === crow.identity.species
      && identity.populationKey === crow.identity.populationKey
      && memberOrdinals.includes(crow.identity.populationOrdinal)
    ));
    const crowGroupMemberIds = new Set(patch.populations
      .find(({ species, populationKey }) => (
        species === crow.identity.species
        && populationKey === crow.identity.populationKey
      ))?.members
      .filter(({ populationOrdinal }) => crowGroup?.memberOrdinals.includes(populationOrdinal))
      .map(({ actor }) => actor.identity.stableId) ?? []);
    let crowMateOrdinal = 0;
    let displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      if (actor.identity.stableId === crow.identity.stableId) continue;
      const isCrowMate = crowGroupMemberIds.has(actor.identity.stableId);
      patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
        atTick: patch.updatedAtTick,
        position: isCrowMate
          ? translateWorldPosition(
              crowStart,
              (crowMateOrdinal + 1) * Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 4),
              Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
            )
          : translateWorldPosition(
              perch,
              (80 + displacedOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
              20 * WORLD_POSITION_UNITS_PER_TILE,
            ),
        heading: actor.address.heading,
      }));
      if (isCrowMate) crowMateOrdinal += 1;
      else displacedOrdinal += 1;
    }
    patch = reconcileFixtureGroupAnchors(patch);
    expect(projectCoreEcologyActivity(patch, {
      actorId: crow.identity.stableId,
      atTick: patch.updatedAtTick,
    })).toMatchObject({
      state: "seeking-perch",
      routine: { action: "travel-to-rest-destination" },
      motion: { kind: "target-area", verb: "seek-perch" },
    });
    const prepared = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save(recordWithEnvelope(record, prepared));
    initial.destroy();
    scheduledFrame = undefined;

    const runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const saved = requiredEnvelope(repository);
    const savedCore = requiredCore(saved);
    const savedCrow = coreActors(savedCore).find(
      ({ identity }) => identity.stableId === crow.identity.stableId,
    );
    if (savedCrow === undefined) throw new Error("Crow vanished after v25 adoption");
    const startingPerchDistance = worldPositionDelta(crowStart, perch);
    const currentPerchDistance = worldPositionDelta(savedCrow.address.position, perch);
    expect(Math.hypot(currentPerchDistance.x, currentPerchDistance.y)).toBeLessThan(
      Math.hypot(startingPerchDistance.x, startingPerchDistance.y),
    );
    expect(savedCrow.intent).toMatchObject({
      kind: "observe",
      focusObservationId: null,
    });
    expect(savedCrow.circadian).toMatchObject({
      restDestinationArrived: false,
      posture: { state: "awake" },
    });
    expect(coreActors(savedCore)
      .filter(({ identity }) => (
        coreEcologyCircadianPolicyForSpecies(identity.species) === null
      ))
      .every((actor) => !Object.hasOwn(actor, "circadian"))).toBe(true);
    expect(savedCrow.needs.rest).toBeGreaterThanOrEqual(restPressuredCrow.needs.rest);
    expect(projectCoreEcologyActivity(savedCore, {
      actorId: crow.identity.stableId,
      atTick: savedCore.updatedAtTick,
    })).toBeNull();
    expect(requiredRegionalActivityProjection(saved, crow.identity.stableId)).toMatchObject({
      species: "fish-crow",
      state: "seeking-perch",
      preferredNeutralIntent: "observe",
      routine: { action: "travel-to-rest-destination" },
      motion: { kind: "target-area", verb: "seek-perch" },
    });
    expect(savedCrow.perception.beliefs.length).toBeGreaterThan(0);
    expect(savedCrow.perception.beliefs.every(({ lastObservedTick }) => (
      lastObservedTick === savedCore.updatedAtTick
    ))).toBe(true);
    expect(savedCrow.perception.beliefs.some(({ identification, subjectId }) => (
      identification === "identified" && subjectId !== null
    ))).toBe(true);
    expect(savedCrow.memories).toEqual([]);

    const durableCore = saved.regionalEcology;
    const durableCircadian = stableStringify(savedCrow.circadian);
    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    const resumedEnvelope = requiredEnvelope(repository);
    expect(resumedEnvelope.regionalEcology).toBe(durableCore);
    const resumedCrow = coreActors(requiredCore(resumedEnvelope)).find(
      ({ identity }) => identity.stableId === crow.identity.stableId,
    );
    expect(stableStringify(resumedCrow?.circadian)).toBe(durableCircadian);
    resumed.destroy();
  }, 45_000);

  it("composes one regional rabbit's crepuscular cognition with physical land movement", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "alpha49 rabbit circadian runtime",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    let patch = requiredCore(envelope);
    const rabbit = patch.populations.find(({ species }) => species === "marsh-rabbit")
      ?.members[0]?.actor;
    if (rabbit === undefined) throw new Error("Rabbit runtime fixture omitted its rabbit");
    const firstActivity = projectCoreEcologyActivity(patch, {
      actorId: rabbit.identity.stableId,
      atTick: patch.updatedAtTick,
    });
    if (firstActivity?.motion.kind !== "target-area") {
      throw new Error("Rabbit runtime fixture omitted its physical forage target");
    }
    expect(firstActivity).toMatchObject({
      species: "marsh-rabbit",
      state: "seeking-ground-foraging-area",
      preferredNeutralIntent: "observe",
      routine: {
        clockPreference: "active",
        effectivePreference: "active",
        action: "remain-active",
      },
      motion: {
        kind: "target-area",
        verb: "forage-ground-local",
        travelMedium: "land",
      },
    });
    const forageTarget = firstActivity.motion.targetArea.center;
    const rabbitStart = translateWorldPosition(
      forageTarget,
      12 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    const staleRestingRabbit = withFixtureRestIntent(repositionCoreWildlifeActor(rabbit, {
      atTick: patch.updatedAtTick,
      position: rabbitStart,
      heading: rabbit.address.heading,
    }));
    patch = replaceCoreEcologyAggregatePatchActor(patch, staleRestingRabbit);

    const rabbitGroup = patch.groups.groups.find(({ identity, memberOrdinals }) => (
      identity.species === rabbit.identity.species
      && identity.populationKey === rabbit.identity.populationKey
      && memberOrdinals.includes(rabbit.identity.populationOrdinal)
    ));
    const rabbitGroupMemberIds = new Set(patch.populations
      .find(({ species, populationKey }) => (
        species === rabbit.identity.species
        && populationKey === rabbit.identity.populationKey
      ))?.members
      .filter(({ populationOrdinal }) => rabbitGroup?.memberOrdinals.includes(populationOrdinal))
      .map(({ actor }) => actor.identity.stableId) ?? []);
    let rabbitMateOrdinal = 0;
    let displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      if (actor.identity.stableId === rabbit.identity.stableId) continue;
      const isRabbitMate = rabbitGroupMemberIds.has(actor.identity.stableId);
      patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
        atTick: patch.updatedAtTick,
        position: isRabbitMate
          ? translateWorldPosition(
              rabbitStart,
              (rabbitMateOrdinal + 1) * Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 4),
              Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
            )
          : translateWorldPosition(
              forageTarget,
              (80 + displacedOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
              20 * WORLD_POSITION_UNITS_PER_TILE,
            ),
        heading: actor.address.heading,
      }));
      if (isRabbitMate) rabbitMateOrdinal += 1;
      else displacedOrdinal += 1;
    }
    patch = reconcileFixtureGroupAnchors(patch);
    patch = promoteFixtureActors(patch, rabbitGroupMemberIds.size === 0
      ? [rabbit.identity.stableId]
      : [...rabbitGroupMemberIds]);
    const stagedActivity = projectCoreEcologyActivity(patch, {
      actorId: rabbit.identity.stableId,
      atTick: patch.updatedAtTick,
    });
    expect(stagedActivity).toMatchObject({
      state: "seeking-ground-foraging-area",
      motion: {
        kind: "target-area",
        verb: "forage-ground-local",
        travelMedium: "land",
      },
    });
    const prepared = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save(recordWithEnvelope(record, prepared));
    initial.destroy();
    scheduledFrame = undefined;

    const runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const saved = requiredEnvelope(repository);
    const savedRabbit = regionalCoreActors(requiredRegionalEcology(saved)).find(({ identity }) => (
      identity.stableId === rabbit.identity.stableId
    ));
    if (savedRabbit === undefined) throw new Error("Rabbit vanished after regional activity step");
    const startingDistance = worldPositionDelta(rabbitStart, forageTarget);
    const currentDistance = worldPositionDelta(savedRabbit.address.position, forageTarget);
    expect(Math.hypot(currentDistance.x, currentDistance.y)).toBeLessThan(
      Math.hypot(startingDistance.x, startingDistance.y),
    );
    expect(savedRabbit.address.position).not.toEqual(rabbitStart);
    expect(savedRabbit.intent).toMatchObject({
      kind: "observe",
      focusObservationId: null,
    });
    expect(savedRabbit.circadian).toMatchObject({
      policy: { profileId: "twilight-active" },
      restDestinationArrived: false,
      posture: { state: "awake" },
    });
    expect(requiredRegionalActivityProjection(saved, rabbit.identity.stableId)).toMatchObject({
      species: "marsh-rabbit",
      state: "seeking-ground-foraging-area",
      preferredNeutralIntent: "observe",
      routine: {
        profileId: "twilight-active",
        clockPreference: "active",
        effectivePreference: "active",
        action: "remain-active",
        restDestinationArrived: false,
      },
      motion: {
        kind: "target-area",
        verb: "forage-ground-local",
        travelMedium: "land",
      },
    });
    runtime.destroy();
  }, 45_000);

  it.each([
    [false, "wait"],
    [true, "wait"],
    [false, "rest"],
  ] as const)("carries a current regional duck alarm through quiet Voice without replay (optional refusal=%s, action=%s)", async (refused, action) => {
    const actualReduction = situatedExpressionChannels.reduceSituatedExpressionChannelBank;
    if (refused) vi.spyOn(situatedExpressionChannels, "reduceSituatedExpressionChannelBank")
      .mockImplementation((bankValue, intent, reception) => {
        if (typeof intent === "object" && intent !== null && "meaning" in intent
          && intent.meaning === "american-black-duck-alarm-call") {
          return {
            accepted: false, reason: "channel-capacity-reached", event: null,
            bank: situatedExpressionChannels.canonicalizeSituatedExpressionChannelBank(bankValue),
          };
        }
        return actualReduction(bankValue, intent, reception);
      });
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "duck-runtime-0",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    const travel = restorePlayerRegionalTravel(
      world.meta.rootSeed,
      envelope.player,
      envelope.regionalTravel,
    );
    if (travel === null) throw new Error("Duck Voice fixture lost its current frame");
    const regional = requiredRegionalEcologyV6(envelope);
    const active = projectRegionalEcologyStateV6ActiveState(regional, {
      origin: travel.window.origin,
      terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
    });
    if (active === null) throw new Error("Duck Voice fixture lost its current projection");
    const source = active.base.base.base.base.base.residents.find(({ kind, patch }) => (
      kind === "regional-habitat"
      && patch.populations.some(({ species }) => species === "american-black-duck")
    ));
    if (source === undefined) {
      throw new Error(`Duck Voice fixture omitted an actual source: ${stableStringify(
        active.base.base.base.base.base.residents.map(({ kind, patch }) => ({
          kind, region: patch.originRegion, species: patch.populations.map(({ species }) => species),
        })),
      )}`);
    }
    if (source.kind !== "regional-habitat") throw new Error("Duck fixture requires its current owner");
    expect(regional.base.base.base.base.base.root.legacyCohort).toBeNull();
    const duck = source.patch.populations.find(({ species }) => (
      species === "american-black-duck"
    ))?.members[0]?.actor;
    if (duck === undefined) throw new Error("Duck fixture omitted its actual body");
    const activityAuthority = projectCoreEcologyActivityAuthority({
      rootSeed: world.meta.rootSeed,
      root: regional.base.base.base.base.base.root,
      sourceKind: source.kind,
      patch: source.patch,
      actorId: duck.identity.stableId,
    });
    expect(activityAuthority).toMatchObject({
      species: "american-black-duck", provenance: "regional-habitat",
    });
    expect(activityAuthority?.tidalAnchors.some(({ species, purpose }) => (
      species === "american-black-duck" && purpose === "refuge"
    ))).toBe(true);
    world.weather.kind = "clear";
    world.weather.intensity = 0;
    world.weather.windX = 0;
    world.weather.windY = 0;
    world.weather.nextChangeTick = world.meta.completedTick + 100_000;
    const player = structuredClone(envelope.player);
    player.stamina = 800_000;
    player.facingMilliRadians = 0;
    const playerPosition = playerWorldPositionInRegionalWindow(travel.window, player);
    if (playerPosition === null) throw new Error("Duck fixture lost its player position");
    const spatial = createRegionalWorldView(createWorldView(world), travel.window, {
      discovered: player.discovered,
      depthSoundings: player.depthSoundings,
    });
    const playerTile = spatial.terrain.tiles[
      Math.floor(player.y / WORLD_POSITION_UNITS_PER_TILE) * REGIONAL_TRAVEL_COLUMNS
        + Math.floor(player.x / WORLD_POSITION_UNITS_PER_TILE)
    ];
    expect(playerTile?.waterDepth).toBeLessThanOrEqual(ADRIFT_STAND_DEPTH);
    const duckPosition = translateWorldPosition(playerPosition, 200, 0);
    const patch = replaceCoreEcologyAggregatePatchActor(source.patch, repositionCoreWildlifeActor(
      duck,
      { atTick: source.patch.updatedAtTick, position: duckPosition, heading: 0 },
    ));
    const independentDog = deserializeBio0Ecology(envelope.bio0Ecology)?.dog;
    if (independentDog === undefined) throw new Error("Duck fixture lost its existing independent dog");
    const staged = resealedCurrentEnvelopeWithCorePatch(envelope, patch, {
      world: serializeWorld(world),
      player,
      perceptionCarry: {
        ...envelope.perceptionCarry,
        intervalStartPosition: playerPosition,
        intervalStartFacingMilliRadians: player.facingMilliRadians,
      },
    });
    const stagedProjection = projectRegionalEcologyStateV6ActiveState(
      requiredRegionalEcologyV6(staged),
      {
        origin: travel.window.origin,
        terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
      },
    );
    const hotSource = stagedProjection?.base.base.base.base.base.residents.find(({ sourceKey }) => (
      sourceKey === source.patch.patchKey
    ));
    if (hotSource === undefined) throw new Error("Duck fixture lost its normally projected source");
    expect(requiredCoreMember(hotSource.patch, duck.identity.stableId).materialization)
      .toBe("materialized");
    await repository.save(recordWithEnvelope(record, staged));
    initial.destroy();
    scheduledFrame = undefined;
    if (!refused && action === "wait") {
      // Removing the fixture's physical encounter leaves this same finite
      // duck at its original habitat-owned address. No observation/event is
      // injected in either branch: normal current runtime admission decides
      // whether the actual source can perceive the existing dog.
      const withoutEncounter = resealedCurrentEnvelopeWithCorePatch(envelope, source.patch, {
        world: serializeWorld(world),
        player,
        perceptionCarry: staged.perceptionCarry,
      });
      const controlRepository = new MemoryRepository(recordWithEnvelope(record, withoutEncounter));
      const control = await createTideweftRuntime(controlRepository);
      expect(control.getUIView().saveWarning).toBeUndefined();
      soundscapePlay.mockClear();
      advancePlayerSteps(control, 10);
      await control.save();
      const controlEnvelope = requiredEnvelope(controlRepository);
      const controlDuck = requiredCoreActor(
        requiredRegionalCoreOwner(controlEnvelope, duck.identity.stableId),
        duck.identity.stableId,
      );
      expect(controlDuck.intent.kind).not.toBe("alarm");
      expect(controlEnvelope.perceptionCarry.situatedExpressionAdmissions.records.some((candidate) => (
        candidate.kind === "core-wildlife-alarm" && candidate.sourceActorId === duck.identity.stableId
      ))).toBe(false);
      control.destroy();
      scheduledFrame = undefined;
    }
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    soundscapePlay.mockClear();
    runtime.dispatchUI(action === "rest"
      ? { type: "recover", action: "begin" }
      : { type: "wait", action: "begin" });
    advanceWaitFrames(runtime, action === "rest" ? 1 : 10);
    await runtime.save();
    const saved = requiredEnvelope(repository);
    const committedOwner = requiredRegionalCoreOwner(saved, duck.identity.stableId);
    const committedDuck = requiredCoreActor(committedOwner, duck.identity.stableId);
    // The active projector admits the nearby actor above. The durable owner
    // deliberately normalizes representation back to coarse on storage while
    // retaining identity, condition, cognition, and committed event history.
    expect(requiredCoreMember(committedOwner, duck.identity.stableId).materialization)
      .toBe("coarse");
    expect(committedDuck.identity).toEqual(duck.identity);
    expect(committedDuck.intent.kind, stableStringify({
      intent: committedDuck.intent, perception: committedDuck.perception, calls: soundscapePlay.mock.calls,
    })).toBe("alarm");
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-duck-alarm-quack"))
      .toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    if (action === "rest") expect(runtime.getUIView().controls).toMatchObject({
      recoveryActive: true, recoveryKind: "rest",
    });
    else expect(runtime.getUIView().controls?.waitActive).toBe(true);
    if (refused) {
      expect(saved.perceptionCarry.situatedExpressionAdmissions.records.some((candidate) => (
        candidate.kind === "core-wildlife-alarm" && candidate.sourceSpecies === "american-black-duck"
      ))).toBe(false);
      expect(saved.perceptionCarry.situatedExpressionChannels.channels.some(({ sourceActorId }) => (
        sourceActorId === duck.identity.stableId
      ))).toBe(false);
      expect(runtime.getRenderView().expressions?.some(({ sourceActorId }) => (
        sourceActorId === duck.identity.stableId
      ))).toBe(false);
      runtime.destroy();
      scheduledFrame = undefined;
      soundscapePlay.mockClear();
      const resumed = await createTideweftRuntime(repository);
      expect(resumed.getUIView().saveWarning).toBeUndefined();
      expect(soundscapePlay.mock.calls.filter(([cue]) => (
        cue === "vocalization-duck-alarm-quack" || cue === "wildlife-alarm"
      ))).toEqual([]);
      resumed.dispatchUI({ type: "wait", action: "cancel" });
      advancePlayerSteps(resumed, 10);
      await resumed.save();
      const propagated = deserializeWorld(requiredEnvelope(repository).world);
      const sourceEvent = committedDuck.memories.find(({ kind, atTick }) => (
        kind === "alarm" && atTick === world.meta.completedTick + 1
      ));
      if (sourceEvent === undefined) throw new Error("Duck fixture lost its retained source event");
      // Refused optional captions now use the same bounded anonymous physical
      // carrier as other core calls, rather than a porter-only raw alarm leg.
      // Keep exact event-derived receipt IDs and the unchanged count/meaning.
      const fallbackSampleId = `cap-${hashCanonical({
        domain: "core-wildlife-alarm-physical:v1",
        eventId: sourceEvent.eventId,
        sourceActorId: committedDuck.identity.stableId,
        species: committedDuck.identity.species,
      })}`;
      const hearing = propagated.residents.flatMap((resident) => {
        const observationId = `hp-h-${propagated.meta.completedTick}-${resident.id}-${fallbackSampleId}`;
        const matches = resident.perception.beliefs.filter(({ sourceObservationId }) => (
          sourceObservationId === observationId
        ));
        expect(matches.length).toBeLessThanOrEqual(1);
        return matches;
      });
      expect(hearing.length).toBeGreaterThanOrEqual(1);
      for (const belief of hearing) expect(belief).toMatchObject({
        perceivedClass: "animal-call", identification: "anonymous", subjectId: null,
        strongInterrupt: false,
      });
      resumed.destroy();
      return;
    }
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "American black duck",
      text: "QUACK.",
      presentationKind: "animal-call",
      animalCallKind: "duck-call",
      assertive: false,
    });
    const admissions = saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (candidate): candidate is CoreWildlifeAlarmExpressionAdmissionRecord => (
        candidate.kind === "core-wildlife-alarm"
          && candidate.sourceSpecies === "american-black-duck"
      ),
    );
    expect(admissions).toHaveLength(1);
    const admission = admissions[0];
    if (admission === undefined) throw new Error("Duck fixture lost its admitted event");
    expect(admission).toMatchObject({
      sourceActorId: duck.identity.stableId,
      sourceOwnerKey: source.patch.patchKey,
      acceptedAtTick: world.meta.completedTick + 1,
    });
    expect(committedDuck.intent).toMatchObject({
      kind: "alarm",
      cause: { kind: "perception", referenceId: admission.sourceObservationId },
    });
    const threatBelief = committedDuck.perception.beliefs.find(({ sourceObservationId }) => (
      sourceObservationId === admission.sourceObservationId
    ));
    expect(threatBelief).toMatchObject({
      perceivedClass: "predator", subjectId: independentDog.identity.stableId,
    });
    const acousticSample = saved.perceptionCarry.actorVocalizationSamples[admission.sampleOrdinal];
    expect(acousticSample).toMatchObject({
      sourceActorId: duck.identity.stableId,
      expressionEventId: admission.eventId,
      soundClass: "animal-call",
      soundInterrupt: "none",
      soundLoudness: 420_000,
    });
    if (acousticSample === undefined) throw new Error("Duck fixture lost its committed sound leg");
    expect(saved.version).toBe(50);
    expect(saved.perceptionCarry.version).toBe(14);
    expect(requiredRegionalEcologyV6(saved).base.base.base.base.base.root.legacyCohort)
      .toBeNull();
    const durableCarry = stableStringify(saved.perceptionCarry);
    runtime.destroy();
    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay.mock.calls.filter(([cue]) => (
      cue === "vocalization-duck-alarm-quack" || cue === "wildlife-alarm"
    ))).toEqual([]);
    await resumed.save();
    const restored = requiredEnvelope(repository);
    expect(stableStringify(restored.perceptionCarry)).toBe(durableCarry);
    expect(restored.world).toBe(saved.world);
    expect(restored.regionalEcology).toBe(saved.regionalEcology);
    expect(restored.physicalCargo).toEqual(saved.physicalCargo);
    expect(restored.dogActorRoster).toBe(saved.dogActorRoster);
    resumed.dispatchUI(action === "rest"
      ? { type: "recover", action: "cancel" }
      : { type: "wait", action: "cancel" });
    advancePlayerSteps(resumed, 10);
    await resumed.save();
    const propagated = deserializeWorld(requiredEnvelope(repository).world);
    const hearing = propagated.residents.flatMap((resident) => {
      const observationId = `hp-h-${propagated.meta.completedTick}-${resident.id}-${acousticSample.id}`;
      const matches = resident.perception.beliefs.filter(({ sourceObservationId }) => (
        sourceObservationId === observationId
      ));
      expect(matches.length).toBeLessThanOrEqual(1);
      return matches;
    });
    expect(hearing.length).toBeGreaterThanOrEqual(1);
    for (const belief of hearing) expect(belief).toMatchObject({
      perceivedClass: "animal-call", identification: "anonymous", subjectId: null,
      strongInterrupt: false,
    });
    resumed.destroy();
    scheduledFrame = undefined;

    const wrongSpecies: CurrentPerceptionCarry = {
      ...saved.perceptionCarry,
      situatedExpressionAdmissions: {
        ...saved.perceptionCarry.situatedExpressionAdmissions,
        records: saved.perceptionCarry.situatedExpressionAdmissions.records.map((candidate) => (
          candidate.kind === "core-wildlife-alarm" && candidate.eventId === admission.eventId
            ? { ...candidate, sourceSpecies: "domestic-chicken" as const }
            : candidate
        )),
      },
    };
    const rejectedRepository = new MemoryRepository(recordWithEnvelope(
      repository.snapshot(),
      resealedCurrentEnvelopeWithCorePatch(saved, requiredRegionalCoreOwner(saved, duck.identity.stableId), {
        perceptionCarry: wrongSpecies,
      }),
    ));
    const untouchedRecord = stableStringify(rejectedRepository.snapshot());
    const rejected = await createTideweftRuntime(rejectedRepository);
    expect(rejected.getUIView().title.hasSave).toBe(false);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    await expect(rejected.save()).rejects.toThrow(
      "Choose a seed before replacing the unreadable or conflicting local autosave.",
    );
    expect(stableStringify(rejectedRepository.snapshot())).toBe(untouchedRecord);
    rejected.destroy();
  }, 45_000);

  it("feeds authoritative storm weather into one regional duck refuge routine", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "duck-runtime-0",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    world.weather.kind = "storm";
    world.weather.intensity = 800_000;
    world.weather.windX = 300_000;
    world.weather.windY = -200_000;
    world.weather.nextChangeTick = world.meta.completedTick + 100_000;

    let patch = requiredCore(envelope);
    const sourceDuck = patch.populations.find(({ species }) => (
      species === "american-black-duck"
    ))?.members[0]?.actor;
    if (sourceDuck === undefined || patch.derivation.kind !== "habitat-v11") {
      throw new Error("Storm routine fixture omitted its authenticated duck habitat");
    }
    const refuge = patch.derivation.habitat.tidalAnchors.find((anchor) => (
      anchor.species === "american-black-duck" && anchor.purpose === "refuge"
    ));
    if (refuge === undefined) throw new Error("Storm routine fixture omitted duck refuge");
    const duckStart = translateWorldPosition(
      refuge.position,
      12 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(
      sourceDuck,
      {
        atTick: patch.updatedAtTick,
        position: duckStart,
        heading: sourceDuck.address.heading,
      },
    ));
    let displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      if (actor.identity.stableId === sourceDuck.identity.stableId) continue;
      patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
        atTick: patch.updatedAtTick,
        position: translateWorldPosition(
          refuge.position,
          (80 + displacedOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
          20 * WORLD_POSITION_UNITS_PER_TILE,
        ),
        heading: actor.address.heading,
      }));
      displacedOrdinal += 1;
    }
    patch = reconcileFixtureGroupAnchors(patch);
    patch = promoteFixtureActors(patch, [sourceDuck.identity.stableId]);
    expect(projectCoreEcologyActivity(patch, {
      actorId: sourceDuck.identity.stableId,
      atTick: patch.updatedAtTick,
      weather: createWorldView(world).weather,
    })).toMatchObject({
      state: "seeking-tidal-refuge",
      routine: {
        effectivePreference: "rest",
        transitionCause: "priority-override",
        causeReferenceId: expect.stringMatching(/^weather:storm-refuge:/u),
      },
      motion: {
        kind: "target-area",
        verb: "seek-waterfowl-refuge",
        travelMedium: "air",
      },
    });

    await repository.save(recordWithEnvelope(record, resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    })));
    initial.destroy();
    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();

    const saved = requiredEnvelope(repository);
    const savedDuck = regionalCoreActors(requiredRegionalEcology(saved)).find(({ identity }) => (
      identity.stableId === sourceDuck.identity.stableId
    ));
    if (savedDuck === undefined) throw new Error("Storm routine lost its regional duck");
    const startDelta = worldPositionDelta(duckStart, refuge.position);
    const savedDelta = worldPositionDelta(savedDuck.address.position, refuge.position);
    expect(Math.hypot(savedDelta.x, savedDelta.y)).toBeLessThan(
      Math.hypot(startDelta.x, startDelta.y),
    );
    expect(savedDuck.circadian).toMatchObject({
      policy: { profileId: "day-active", drivers: ["clock", "weather"] },
      restDestinationArrived: false,
      posture: { state: "awake" },
    });
    expect(requiredRegionalActivityProjection(saved, sourceDuck.identity.stableId)).toMatchObject({
      species: "american-black-duck",
      state: "seeking-tidal-refuge",
      routine: {
        effectivePreference: "rest",
        transitionCause: "priority-override",
        causeReferenceId: expect.stringMatching(/^weather:storm-refuge:/u),
      },
      motion: { kind: "target-area", verb: "seek-waterfowl-refuge", travelMedium: "air" },
    });
    runtime.destroy();
  }, 45_000);

  it("keeps an off-frame materialized crow posture-consistent after leaving its perch", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "rain-chorus-runtime-2",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    const travel = restorePlayerRegionalTravel(
      world.meta.rootSeed,
      envelope.player,
      envelope.regionalTravel,
    );
    if (travel === null) throw new Error("Off-frame crow fixture lost its regional frame");
    const regional = deserializeRegionalEcologyStateV6(envelope.regionalEcology);
    if (regional === null) {
      throw new Error("Off-frame crow fixture did not begin from current regional ecology v6");
    }
    const ecologyWindow = {
      origin: travel.window.origin,
      terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
    };
    const active = projectRegionalEcologyStateV6ActiveState(regional, ecologyWindow);
    if (active === null) {
      throw new Error("Off-frame crow fixture could not project current regional ecology v6");
    }
    const activeBase = active.base.base.base.base.base;
    const crowSource = activeBase.residents.find(({ kind, patch }) => (
      (kind === "legacy-cohort" || kind === "regional-habitat")
      && patch.groups.groups.some(({ identity, memberOrdinals }) => (
        identity.species === "fish-crow" && memberOrdinals.length >= 2
      ))
    ));
    if (crowSource === undefined) {
      throw new Error("Off-frame crow fixture omitted its projected fish-crow flock source");
    }
    if (crowSource.kind !== "legacy-cohort" && crowSource.kind !== "regional-habitat") {
      throw new Error("Off-frame crow fixture selected an unsupported source owner");
    }
    const crowSourceKind = crowSource.kind;
    let patch = crowSource.patch;
    const crowPopulation = patch.populations.find(({ species }) => species === "fish-crow");
    const sourceCrowGroup = patch.groups.groups.find(({ identity }) => (
      identity.species === "fish-crow"
      && identity.populationKey === crowPopulation?.populationKey
    ));
    const selectedOrdinal = sourceCrowGroup?.memberOrdinals.at(-1);
    const crowMember = crowPopulation?.members.find(({ populationOrdinal }) => (
      populationOrdinal === selectedOrdinal
    ));
    if (
      crowPopulation === undefined
      || sourceCrowGroup === undefined
      || selectedOrdinal === undefined
      || crowMember === undefined
    ) {
      throw new Error("Off-frame crow fixture omitted its fish crow");
    }
    const crowMateOrdinal = sourceCrowGroup.memberOrdinals.find((ordinal) => (
      ordinal !== selectedOrdinal
    ));
    const crowMate = crowPopulation.members.find(({ populationOrdinal }) => (
      populationOrdinal === crowMateOrdinal
    ));
    if (crowMate === undefined) {
      throw new Error("Off-frame crow fixture omitted its atomic flock mate");
    }
    if (
      sourceCrowGroup.phase !== "cohesive"
      || sourceCrowGroup.memberOrdinals.some((ordinal) => (
        crowPopulation.members.find(({ populationOrdinal }) => populationOrdinal === ordinal)
          ?.materialization !== "materialized"
      ))
    ) {
      throw new Error("Off-frame crow fixture did not project one atomic materialized flock");
    }
    const activityAuthority = projectCoreEcologyActivityAuthority({
      rootSeed: world.meta.rootSeed,
      root: regional.base.base.base.base.base.root,
      sourceKind: crowSourceKind,
      patch,
      actorId: crowMember.actor.identity.stableId,
    });
    if (activityAuthority === null) {
      throw new Error("Off-frame crow fixture lost its transient perch authority");
    }
    const selectedActivity = projectCoreEcologyActivity(patch, {
      actorId: crowMember.actor.identity.stableId,
      atTick: patch.updatedAtTick,
    }, activityAuthority);
    const selectedPerch = selectedActivity?.perch.anchor;
    if (selectedPerch === null || selectedPerch === undefined) {
      throw new Error("Off-frame crow fixture omitted its selected crow perch");
    }
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(
      crowMember.actor,
      {
        atTick: patch.updatedAtTick,
        position: selectedPerch,
        heading: crowMember.actor.address.heading,
      },
    ));
    const restingCrow = replaceCoreWildlifeActorPhysiology(
      requiredCoreActor(patch, crowMember.actor.identity.stableId),
      {
      atTick: patch.updatedAtTick,
      needs: { hunger: 0, safety: 0, rest: 900_000 },
      condition: { health: 1_000_000, exhaustion: 400_000, stress: 0 },
      },
    );
    patch = replaceCoreEcologyAggregatePatchActor(patch, restingCrow);
    const asleepEnteredAtTick = Math.max(0, patch.updatedAtTick - 64);
    const routineRestingCrow = canonicalizeCoreWildlifeActorState({
      ...requiredCoreActor(patch, restingCrow.identity.stableId),
      intent: {
        kind: "rest",
        cause: {
          kind: "condition",
          referenceId: CORE_WILDLIFE_ROUTINE_REST_REFERENCE_ID,
        },
        focusObservationId: null,
        resourceReference: null,
        enteredAtTick: asleepEnteredAtTick,
        expiresAtTick: patch.updatedAtTick + 5,
      },
    });
    if (routineRestingCrow === null) {
      throw new Error("Off-frame crow fixture could not stage its routine rest");
    }
    patch = replaceCoreEcologyAggregatePatchActor(patch, routineRestingCrow);
    const committedRoutine = stepCoreEcologyActivityMotion(patch, {
      actorId: routineRestingCrow.identity.stableId,
      atTick: patch.updatedAtTick,
      maximumStepUnits: 1,
    }, activityAuthority);
    if (
      committedRoutine === null
      || committedRoutine.resolution !== "held"
      || committedRoutine.patch.populations.flatMap(({ members }) => members)
        .find(({ actor }) => actor.identity.stableId === routineRestingCrow.identity.stableId)
        ?.actor.circadian?.posture.state !== "asleep"
    ) {
      throw new Error("Off-frame crow fixture did not commit asleep at its perch");
    }
    patch = committedRoutine.patch;
    const committedCrow = requiredCoreActor(patch, restingCrow.identity.stableId);
    const restDestinationId = committedCrow.circadian?.restDestinationId;
    if (restDestinationId === undefined) {
      throw new Error("Off-frame crow fixture did not commit its rest destination");
    }
    const frameWidth = REGIONAL_TRAVEL_COLUMNS * WORLD_POSITION_UNITS_PER_TILE;
    const frameHeight = REGIONAL_TRAVEL_ROWS * WORLD_POSITION_UNITS_PER_TILE;
    const committedPlacement = livingActorAddressInRegionalWindow(
      committedCrow.address,
      travel.window,
    );
    const committedTile = regionLocalToGlobalTile(
      committedCrow.address.position.region,
      Math.trunc(committedCrow.address.position.localX / WORLD_POSITION_UNITS_PER_TILE),
      Math.trunc(committedCrow.address.position.localY / WORLD_POSITION_UNITS_PER_TILE),
    );
    const frameMaxX = travel.window.origin.x + REGIONAL_TRAVEL_COLUMNS - 1;
    const frameMaxY = travel.window.origin.y + REGIONAL_TRAVEL_ROWS - 1;
    const offFrameDisplacement = committedPlacement === null
      ? committedTile.x < travel.window.origin.x
        ? { x: -WORLD_POSITION_UNITS_PER_TILE, y: 0 }
        : committedTile.x > frameMaxX
          ? { x: WORLD_POSITION_UNITS_PER_TILE, y: 0 }
          : committedTile.y < travel.window.origin.y
            ? { x: 0, y: -WORLD_POSITION_UNITS_PER_TILE }
            : committedTile.y > frameMaxY
              ? { x: 0, y: WORLD_POSITION_UNITS_PER_TILE }
              : undefined
      : [
          { x: -committedPlacement.point.x - 1, y: 0 },
          { x: frameWidth - committedPlacement.point.x, y: 0 },
          { x: 0, y: -committedPlacement.point.y - 1 },
          { x: 0, y: frameHeight - committedPlacement.point.y },
        ].sort((left, right) => (
          Math.abs(left.x) + Math.abs(left.y) - Math.abs(right.x) - Math.abs(right.y)
        ))[0];
    if (offFrameDisplacement === undefined) {
      throw new Error("Off-frame crow fixture could not choose a frame boundary");
    }
    const offFramePosition = translateWorldPosition(
      committedCrow.address.position,
      offFrameDisplacement.x,
      offFrameDisplacement.y,
    );
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(
      committedCrow,
      {
        atTick: patch.updatedAtTick,
        position: offFramePosition,
        heading: committedCrow.address.heading,
      },
    ));
    const split = reconcileCoreEcologyGroupMaterialized(sourceCrowGroup, {
      atTick: patch.updatedAtTick,
      memberPositions: sourceCrowGroup.memberOrdinals.map((populationOrdinal) => {
        const sourceMember = crowPopulation.members.find((candidate) => (
          candidate.populationOrdinal === populationOrdinal
        ));
        if (sourceMember === undefined) {
          throw new Error("Off-frame crow fixture lost a flock member");
        }
        const member = requiredCoreMember(patch, sourceMember.actor.identity.stableId);
        return { memberOrdinal: populationOrdinal, position: member.actor.address.position };
      }),
      splitDistanceUnits: WORLD_POSITION_UNITS_PER_TILE,
      rejoinDistanceUnits: WORLD_POSITION_UNITS_PER_TILE,
      currentEscapeCause: {
        eventId: "fixture:off-frame-crow-split",
        causeReferenceId: "fixture:off-frame-crow-departure",
        memberOrdinal: selectedOrdinal,
      },
    });
    if (split === null || split.events[0]?.kind !== "group-split") {
      throw new Error("Off-frame crow fixture could not split its materialized flock");
    }
    const splitPatch = canonicalizeCoreEcologyAggregatePatch({
      ...patch,
      groups: createCoreEcologyGroupSet(patch.groups.groups.map((group) => (
        group.identity.stableId === sourceCrowGroup.identity.stableId
          ? split.group
          : group
      ))),
    });
    if (splitPatch === null) {
      throw new Error("Off-frame crow fixture produced a non-canonical split flock");
    }
    patch = splitPatch;
    const splitGroup = patch.groups.groups.find(({ identity }) => (
      identity.stableId === sourceCrowGroup.identity.stableId
    ));
    const targetComponent = splitGroup?.components.find(({ memberOrdinals }) => (
      memberOrdinals.includes(selectedOrdinal)
    ));
    const localComponent = splitGroup?.components.find(({ memberOrdinals }) => (
      !memberOrdinals.includes(selectedOrdinal)
    ));
    if (splitGroup === undefined || targetComponent === undefined || localComponent === undefined) {
      throw new Error("Off-frame crow fixture lost its split flock components");
    }
    expect(livingActorAddressInRegionalWindow(
      requiredCoreActor(patch, committedCrow.identity.stableId).address,
      travel.window,
    )).toBeNull();
    expect(livingActorAddressInRegionalWindow(
      {
        ...requiredCoreActor(patch, committedCrow.identity.stableId).address,
        position: targetComponent.anchor,
      },
      travel.window,
    )).toBeNull();
    expect(livingActorAddressInRegionalWindow(
      {
        ...requiredCoreActor(patch, crowMate.actor.identity.stableId).address,
        position: localComponent.anchor,
      },
      travel.window,
    )).not.toBeNull();
    expect(requiredCoreMember(patch, committedCrow.identity.stableId).materialization)
      .toBe("materialized");
    expect(splitGroup.memberOrdinals.every((populationOrdinal) => (
      crowPopulation.members.some((member) => (
        member.populationOrdinal === populationOrdinal
        && requiredCoreMember(patch, member.actor.identity.stableId).materialization
          === "materialized"
      ))
    ))).toBe(true);

    const baseInput = {
      base: {
        base: {
          base: {
            base: {
              root: regional.base.base.base.base.base.root,
              rootSeed: world.meta.rootSeed,
              settlementHome: activeBase.residents.some(({ sourceKey }) => (
                sourceKey === regional.base.base.base.base.base.settlementHome.sourceKey
              ))
                ? null
                : {
                    sourceKey: regional.base.base.base.base.base.settlementHome.sourceKey,
                    patch: regional.base.base.base.base.base.settlementHome.patch,
                  },
              residents: activeBase.residents.map(({ sourceKey, patch: sourcePatch }) => ({
                sourceKey,
                patch: sourceKey === crowSource.sourceKey ? patch : sourcePatch,
              })),
            },
            alpineResidents: active.base.base.base.base.alpineResidents.map(
              ({ sourceKey, patch: sourcePatch }) => ({ sourceKey, patch: sourcePatch }),
            ),
          },
          polarShoreResidents: active.base.base.base.polarShoreResidents.map(
            ({ sourceKey, patch: sourcePatch }) => ({ sourceKey, patch: sourcePatch }),
          ),
        },
        coldShoreResidents: active.base.base.coldShoreResidents.map(
          ({ sourceKey, patch: sourcePatch }) => ({ sourceKey, patch: sourcePatch }),
        ),
      },
      polarConsumerResidents: active.base.polarConsumerResidents.map(
        ({ sourceKey, patch: sourcePatch }) => ({ sourceKey, patch: sourcePatch }),
      ),
    };
    const committedRegional = commitRegionalEcologyStateV6ActiveProjection(
      regional,
      active,
      {
        base: baseInput,
        breadthResidents: active.breadthResidents.map(
          ({ sourceKey, patch: sourcePatch }) => ({ sourceKey, patch: sourcePatch }),
        ),
      },
    );
    if (committedRegional === null) {
      throw new Error("Current regional ecology v6 rejected the split flock transaction");
    }
    const committedSource = committedRegional.base.base.base.base.base.activeResidents.find(
      ({ sourceKey }) => sourceKey === crowSource.sourceKey,
    );
    const savedCommittedCrow = committedSource === undefined
      ? undefined
      : requiredCoreActor(committedSource.patch, committedCrow.identity.stableId);
    expect(savedCommittedCrow?.circadian).toMatchObject({
      restDestinationId,
      restDestinationArrived: true,
      posture: { state: "asleep" },
    });

    const { integrity: _priorIntegrity, ...priorEnvelope } = envelope;
    const preparedBase = {
      ...priorEnvelope,
      world: serializeWorld(world),
      regionalEcology: serializeRegionalEcologyStateV6(committedRegional),
    };
    const prepared = Object.freeze({
      ...preparedBase,
      integrity: gameSaveEnvelopeIntegrity(preparedBase),
    }) as CurrentEnvelope;
    await repository.save(recordWithEnvelope(record, prepared));
    scheduledFrame = undefined;

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    await runtime.save();
    const loaded = requiredEnvelope(repository);
    const loadedWorld = deserializeWorld(loaded.world);
    const loadedTravel = restorePlayerRegionalTravel(
      loadedWorld.meta.rootSeed,
      loaded.player,
      loaded.regionalTravel,
    );
    const loadedRegional = deserializeRegionalEcologyStateV6(loaded.regionalEcology);
    const loadedProjection = loadedRegional === null || loadedTravel === null
      ? null
      : projectRegionalEcologyStateV6ActiveState(loadedRegional, {
          origin: loadedTravel.window.origin,
          terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
        });
    const loadedSource = loadedProjection?.base.base.base.base.base.residents.find(
      ({ sourceKey }) => sourceKey === crowSource.sourceKey,
    );
    const loadedCrowMember = loadedSource === undefined
      ? undefined
      : requiredCoreMember(loadedSource.patch, committedCrow.identity.stableId);
    if (
      loadedRegional === null
      || loadedTravel === null
      || loadedProjection === null
      || loadedSource === undefined
      || loadedCrowMember === undefined
    ) throw new Error("Reloaded off-frame crow lost its current v6 projection");
    const loadedActivityAuthority = projectCoreEcologyActivityAuthority({
      rootSeed: loadedWorld.meta.rootSeed,
      root: loadedRegional.base.base.base.base.base.root,
      sourceKind: crowSourceKind,
      patch: loadedSource.patch,
      actorId: committedCrow.identity.stableId,
    });
    const loadedActivity = projectCoreEcologyActivity(loadedSource.patch, {
      actorId: committedCrow.identity.stableId,
      atTick: loadedSource.patch.updatedAtTick,
    }, loadedActivityAuthority ?? undefined);
    expect(loadedCrowMember.materialization).toBe("materialized");
    expect(livingActorAddressInRegionalWindow(
      loadedCrowMember.actor.address,
      loadedTravel.window,
    )).toBeNull();
    expect(loadedCrowMember.actor.circadian).toMatchObject({
      restDestinationId,
      restDestinationArrived: true,
      posture: { state: "asleep" },
    });
    expect(loadedActivity).toMatchObject({
      state: "seeking-perch",
      routine: {
        restDestinationId,
        restDestinationArrived: false,
        posture: { state: "awake" },
        action: "travel-to-rest-destination",
      },
    });

    const beforeTick = loadedRegional.updatedAtTick;
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const saved = requiredEnvelope(repository);
    const savedWorld = deserializeWorld(saved.world);
    const savedTravel = restorePlayerRegionalTravel(
      savedWorld.meta.rootSeed,
      saved.player,
      saved.regionalTravel,
    );
    const savedRegional = deserializeRegionalEcologyStateV6(saved.regionalEcology);
    const savedProjection = savedRegional === null || savedTravel === null
      ? null
      : projectRegionalEcologyStateV6ActiveState(savedRegional, {
          origin: savedTravel.window.origin,
          terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
        });
    const savedSource = savedProjection?.base.base.base.base.base.residents.find(
      ({ sourceKey }) => sourceKey === crowSource.sourceKey,
    );
    const savedCrowMember = savedSource === undefined
      ? undefined
      : requiredCoreMember(savedSource.patch, committedCrow.identity.stableId);
    if (
      savedRegional === null
      || savedTravel === null
      || savedProjection === null
      || savedSource === undefined
      || savedCrowMember === undefined
    ) throw new Error("Stepped off-frame crow lost its current v6 projection");
    const savedCrow = savedCrowMember.actor;
    expect(savedRegional.updatedAtTick).toBe(beforeTick + 1);
    expect(savedCrowMember.materialization).toBe("materialized");
    expect(livingActorAddressInRegionalWindow(savedCrow.address, savedTravel.window)).toBeNull();
    expect(savedCrow.intent).toMatchObject({
      kind: "observe",
      focusObservationId: null,
      resourceReference: null,
    });
    expect(savedCrow.circadian).toMatchObject({
      restDestinationId,
      restDestinationArrived: false,
      posture: { state: "awake", enteredAtTick: savedRegional.updatedAtTick },
    });
    expect(savedCrow.perception.beliefs).toEqual([]);
    const savedActivityAuthority = projectCoreEcologyActivityAuthority({
      rootSeed: savedWorld.meta.rootSeed,
      root: savedRegional.base.base.base.base.base.root,
      sourceKind: crowSourceKind,
      patch: savedSource.patch,
      actorId: committedCrow.identity.stableId,
    });
    const savedActivity = projectCoreEcologyActivity(savedSource.patch, {
      actorId: committedCrow.identity.stableId,
      atTick: savedSource.patch.updatedAtTick,
    }, savedActivityAuthority ?? undefined);
    expect(savedActivity).toMatchObject({
      state: "seeking-perch",
      routine: {
        restDestinationId,
        restDestinationArrived: false,
        posture: { state: "awake" },
        action: "travel-to-rest-destination",
      },
    });

    const durableRegional = saved.regionalEcology;
    const durableCircadian = stableStringify(savedCrow.circadian);
    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    const resumedEnvelope = requiredEnvelope(repository);
    expect(resumedEnvelope.regionalEcology).toBe(durableRegional);
    const resumedRegional = deserializeRegionalEcologyStateV6(resumedEnvelope.regionalEcology);
    const resumedWorld = deserializeWorld(resumedEnvelope.world);
    const resumedTravel = restorePlayerRegionalTravel(
      resumedWorld.meta.rootSeed,
      resumedEnvelope.player,
      resumedEnvelope.regionalTravel,
    );
    const resumedProjection = resumedRegional === null || resumedTravel === null
      ? null
      : projectRegionalEcologyStateV6ActiveState(resumedRegional, {
          origin: resumedTravel.window.origin,
          terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
        });
    const resumedSource = resumedProjection?.base.base.base.base.base.residents.find(
      ({ sourceKey }) => sourceKey === crowSource.sourceKey,
    );
    const resumedCrowMember = resumedSource === undefined
      ? undefined
      : requiredCoreMember(resumedSource.patch, committedCrow.identity.stableId);
    expect(resumedCrowMember?.materialization).toBe("materialized");
    expect(resumedTravel === null || resumedCrowMember === undefined
      ? null
      : livingActorAddressInRegionalWindow(resumedCrowMember.actor.address, resumedTravel.window))
      .toBeNull();
    expect(stableStringify(resumedCrowMember?.actor.circadian)).toBe(durableCircadian);
    expect(resumedCrowMember?.actor.intent).toMatchObject({
      kind: "observe",
      focusObservationId: null,
      resourceReference: null,
    });
    expect(resumedCrowMember?.actor.perception.beliefs).toEqual([]);
    resumed.destroy();
  }, 45_000);

  it("preserves a crow startle sidecar through deferred retreat locomotion", async () => {
    const fixture = await createCommittedCrowAlarmRuntime("asleep", 900_000);
    const before = fixture.beforeCrow;
    advancePlayerSteps(fixture.runtime, 10);
    await fixture.runtime.save();
    const saved = requiredEnvelope(fixture.repository);
    const savedCore = requiredCore(saved);
    const savedCrow = requiredCoreActor(savedCore, fixture.crowActorId);
    const movement = worldPositionDelta(before.address.position, savedCrow.address.position);
    expect(savedCore.updatedAtTick).toBe(fixture.beforeTick + 1);
    expect(savedCrow.intent.kind).toBe("retreat");
    expect(Math.abs(movement.x) + Math.abs(movement.y)).toBeGreaterThan(0);
    expect(savedCrow.circadian).toMatchObject({
      restDestinationId: fixture.restDestinationId,
      restDestinationArrived: false,
      posture: { state: "startled", enteredAtTick: savedCore.updatedAtTick },
    });
    expect(requiredRegionalActivityProjection(saved, fixture.crowActorId)).toMatchObject({
      state: "responding",
      motion: { kind: "defer-to-intent" },
      routine: {
        restDestinationId: fixture.restDestinationId,
        restDestinationArrived: false,
        posture: { state: "startled", enteredAtTick: savedCore.updatedAtTick },
        action: "respond-to-disturbance",
        transitionCause: "disturbance",
      },
    });

    const durableRegional = saved.regionalEcology;
    const durableCircadian = stableStringify(savedCrow.circadian);
    fixture.runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(fixture.repository);
    await resumed.save();
    const resumedEnvelope = requiredEnvelope(fixture.repository);
    const resumedCrow = requiredCoreActor(requiredCore(resumedEnvelope), fixture.crowActorId);
    expect(resumedEnvelope.regionalEcology).toBe(durableRegional);
    expect(resumedCrow.address.position).toEqual(savedCrow.address.position);
    expect(stableStringify(resumedCrow.circadian)).toBe(durableCircadian);
    resumed.destroy();
  }, 45_000);

  it("does not restore crow physiology on the strong-alarm tick that ends routine rest", async () => {
    const fixture = await createCommittedCrowAlarmRuntime("resting", 0);
    const before = fixture.beforeCrow;
    advancePlayerSteps(fixture.runtime, 10);
    await fixture.runtime.save();
    const saved = requiredEnvelope(fixture.repository);
    const savedCore = requiredCore(saved);
    const savedCrow = requiredCoreActor(savedCore, fixture.crowActorId);
    const movement = worldPositionDelta(before.address.position, savedCrow.address.position);
    expect(savedCore.updatedAtTick).toBe(fixture.beforeTick + 1);
    expect(Math.hypot(movement.x, movement.y)).toBeLessThanOrEqual(
      coreWildlifeMaximumStepUnits("fish-crow", "observe"),
    );
    expect(savedCrow.intent).toMatchObject({
      kind: "observe",
      focusObservationId: null,
    });
    expect(savedCrow.needs.rest).toBeGreaterThan(before.needs.rest);
    expect(savedCrow.condition.exhaustion).toBeGreaterThan(before.condition.exhaustion);
    expect(savedCrow.circadian).toMatchObject({
      restDestinationId: fixture.restDestinationId,
      restDestinationArrived: true,
      posture: { state: "startled", enteredAtTick: savedCore.updatedAtTick },
    });
    expect(requiredRegionalActivityProjection(saved, fixture.crowActorId)).toMatchObject({
      state: "responding",
      motion: { kind: "defer-to-intent" },
      routine: {
        restDestinationId: fixture.restDestinationId,
        restDestinationArrived: true,
        posture: { state: "startled", enteredAtTick: savedCore.updatedAtTick },
        action: "respond-to-disturbance",
      },
    });
    fixture.runtime.destroy();
  }, 45_000);

  it("keeps a selected crow's reauthenticated active posture in render parity", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "rain-chorus-runtime-2",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    const player = structuredClone(envelope.player);
    const regional = restorePlayerRegionalTravel(world.meta.rootSeed, player, envelope.regionalTravel);
    if (regional === null) throw new Error("Crow ABOUT fixture lost its regional frame");
    let patch = requiredCore(envelope);
    const sourceCrow = patch.populations.find(({ species }) => species === "fish-crow")
      ?.members[0]?.actor;
    if (sourceCrow === undefined) throw new Error("Crow ABOUT fixture omitted its fish crow");
    const crow = withFixtureRestIntent(sourceCrow);
    patch = replaceCoreEcologyAggregatePatchActor(patch, crow);
    expect(projectCoreEcologyActivity(patch, {
      actorId: crow.identity.stableId,
      atTick: patch.updatedAtTick,
      weather: createWorldView(world).weather,
    })).toMatchObject({ state: "active-watch", preferredNeutralIntent: "observe" });
    const placement = livingActorAddressInRegionalWindow(crow.address, regional.window);
    if (placement === null) throw new Error("Crow ABOUT fixture placed its crow outside the frame");
    const crowTileX = Math.trunc(placement.point.x / WORLD_POSITION_UNITS_PER_TILE);
    const crowTileY = Math.trunc(placement.point.y / WORLD_POSITION_UNITS_PER_TILE);
    const playerTileX = crowTileX > 0 ? crowTileX - 1 : crowTileX + 1;
    const playerTileIndex = crowTileY * regional.window.terrain.width + playerTileX;
    player.x = playerTileX * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    player.y = crowTileY * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
    player.previousX = player.x;
    player.previousY = player.y;
    player.velocityX = 0;
    player.velocityY = 0;
    player.facingMilliRadians = playerTileX < crowTileX
      ? 0
      : Math.round(Math.PI * 1_000);
    player.currentTrace = [playerTileIndex];
    player.surveyTrace = [playerTileIndex];
    const prepared = resealedEnvelope(envelope, {
      player,
      coreEcology: serializeCoreEcologyAggregatePatch(promoteFixtureActors(
        patch,
        [crow.identity.stableId],
      )),
    });
    await repository.save(recordWithEnvelope(record, prepared));
    initial.destroy();
    scheduledFrame = undefined;

    const runtime = await createTideweftRuntime(repository);
    const renderCrow = runtime.getRenderView().wildlife?.find(({ actorId }) => (
      actorId === crow.identity.stableId
    ));
    expect(renderCrow).toMatchObject({
      species: "fish-crow",
      behavior: "watch",
    });
    if (renderCrow === undefined) throw new Error("Crow ABOUT fixture could not see its crow");
    if (renderCrow.groupSize === undefined) {
      throw new Error("Crow ABOUT fixture requires more than one visible flock representative");
    }
    runtime.dispatchRenderer({
      type: "select",
      entity: "living-actor",
      species: "fish-crow",
      id: renderCrow.actorId,
      point: renderCrow.position,
    });
    const selection = runtime.getUIView().selectedLivingActor;
    expect(selection?.quick.summary).toContain(`About ${renderCrow.groupSize} visible`);
    expect(selection?.quick.summary).toContain("Watching");
    expect(selection?.about.observed).toContainEqual({
      label: "Visible group",
      value: `About ${renderCrow.groupSize}`,
    });
    expect(selection?.about.observed).toContainEqual({
      label: "Behavior",
      value: "Watching",
    });
    runtime.destroy();
  }, 30_000);

  it("renders and inspects brown-rat signs without synthesizing a rat actor", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "settlement shadows",
      posture: "gale",
      sessionShape: "wander",
    });

    const view = runtime.getRenderView();
    const evidence = view.aggregateWildlifeEvidence?.find(({ species }) => (
      species === "brown-rat"
    ));
    if (evidence === undefined || evidence.representation !== "population-evidence") {
      throw new Error("Settlement-shadows fixture has no selectable rat evidence");
    }
    expect(evidence).toMatchObject({
      version: 1,
      species: "brown-rat",
      representation: "population-evidence",
      selected: false,
    });
    expect(view.wildlife?.some(({ actorId, species }) => (
      species === ("brown-rat" as never) || actorId.startsWith("RAT-")
    ))).toBe(false);

    runtime.dispatchRenderer({
      type: "select",
      entity: "aggregate-wildlife-evidence",
      species: evidence.species,
      aggregateId: evidence.aggregateId,
      evidenceId: evidence.evidenceId,
      point: evidence.position,
    });

    expect(runtime.getRenderView().aggregateWildlifeEvidence?.find(({ evidenceId }) => (
      evidenceId === evidence.evidenceId
    ))).toMatchObject({ selected: true });
    expect(runtime.getUIView().selectedLivingActor).toBeUndefined();
    expect(runtime.getUIView().selectedWildlifeEvidence).toMatchObject({
      target: {
        species: "brown-rat",
        aggregateId: evidence.aggregateId,
        evidenceId: evidence.evidenceId,
      },
      quick: {
        target: { evidenceId: evidence.evidenceId },
      },
      about: {
        target: { evidenceId: evidence.evidenceId },
        known: [],
      },
    });

    runtime.dispatchUI({
      type: "aggregate-wildlife-evidence",
      action: "close",
      target: {
        species: "brown-rat",
        aggregateId: evidence.aggregateId,
        evidenceId: evidence.evidenceId,
      },
    });
    expect(runtime.getUIView().selectedWildlifeEvidence).toBeUndefined();
    expect(runtime.getRenderView().aggregateWildlifeEvidence?.find(({ evidenceId }) => (
      evidenceId === evidence.evidenceId
    ))).toMatchObject({ selected: false });
    runtime.destroy();
  });

  it("routes rat displacement through shared hearing, audio, and acoustic presentation", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "settlement shadows",
      posture: "gale",
      sessionShape: "wander",
    });
    expect(runtime.getRenderView().aggregateWildlifeEvidence?.length).toBeGreaterThan(0);
    soundscapePlay.mockClear();
    let sharedRustleCaption:
      ReturnType<TideweftRuntime["getUIView"]>["expressionCaption"];
    let legacyRatAnnouncement = false;

    advancePlayerSteps(runtime, 80, () => {
      const view = runtime.getUIView();
      if (view.expressionCaption?.physicalSoundKind === "rustle") {
        sharedRustleCaption = view.expressionCaption;
      }
      if (view.announcement?.message.includes("beside the signs you can see")) {
        legacyRatAnnouncement = true;
      }
    });

    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rat-rustle")).toHaveLength(1);
    expect(sharedRustleCaption).toMatchObject({
      speakerLabel: "Sound",
      text: "rustle",
      presentationKind: "physical",
      physicalSoundKind: "rustle",
      assertive: false,
    });
    expect(JSON.stringify(sharedRustleCaption)).not.toMatch(
      /rat|aggregate|evidence|sourceId/iu,
    );
    expect(legacyRatAnnouncement).toBe(false);
    runtime.destroy();
  }, 45_000);

  it.each([[false, 1], [true, 1], [false, 2]] as const)("keeps a genuine cat rain call independent of optional captions and transactional (reject=%s, catOffsetTiles=%s)", async (reject, catOffsetTiles) => {
    // Preserve the existing prepared physical fixture before any rainy step.
    // Optional capacity changes only presentation admission, not its source.
    const prepared = await createCatWeatherRuntime("rain-distress", catOffsetTiles);
    const preparedRecord = prepared.repository.snapshot();
    const catActorId = prepared.catActorId;
    const lawfullyHeard = catOffsetTiles === 1;
    let admittedAudio: unknown[][] = [];
    try {
      soundscapePlay.mockClear();
      advancePlayerSteps(prepared.runtime, 10);
      admittedAudio = soundscapePlay.mock.calls.filter(([cue]) => cue === "cat-call")
        .map((args) => [...args]);
      expect(admittedAudio).toHaveLength(lawfullyHeard ? 1 : 0);
      if (lawfullyHeard) {
        expect(prepared.runtime.getUIView().expressionCaption?.animalCallKind).toBe("cat-call");
      } else {
        // The same real weather retreat occurs two tiles away, beyond its
        // quiet rain-masked range. Sight alone does not make a sound heard.
        expect(prepared.runtime.getUIView().expressionCaption?.animalCallKind).not.toBe("cat-call");
      }
    } finally {
      prepared.runtime.destroy();
      scheduledFrame = undefined;
    }
    vi.resetModules();
    vi.doMock("./humanPerception", async (importOriginal) => ({
      ...await importOriginal<typeof import("./humanPerception")>(),
      HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES: 0,
    }));
    let runtime: TideweftRuntime | null = null;
    try {
      const runtimeModule = await import("./runtime");
      const weatherExpression = await import("./coreWildlifeWeatherDistressExpression");
      const channels = await import("./situatedExpressionChannelBank");
      const repository = new MemoryRepository(preparedRecord);
      runtime = await runtimeModule.createTideweftRuntime(repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      advancePlayerSteps(runtime, 9);
      await runtime.save();
      const beforeRecord = repository.snapshot();
      const before = requiredEnvelope(repository);
      const nextTick = deserializeWorld(before.world).meta.completedTick + 1;
      expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);

      const intentFor = weatherExpression.coreWildlifeWeatherDistressExpressionIntent;
      const sourceEventIds = new Set<string>();
      vi.spyOn(weatherExpression, "coreWildlifeWeatherDistressExpressionIntent")
        .mockImplementation((input) => {
          const intent = intentFor(input);
          if (intent !== null && input.actor.identity.stableId === catActorId
            && input.event.atTick === nextTick) sourceEventIds.add(input.event.eventId);
          return intent;
        });
      const close = channels.closeSituatedExpressionChannelBankInterval;
      let closureCalls = 0;
      let closureCommitted = false;
      let audioInsideClosure = false;
      const releaseCommitStates: boolean[] = [];
      const catAudio = () => soundscapePlay.mock.calls.filter(([cue]) => cue === "cat-call");
      soundscapePlay.mockReset();
      soundscapePlay.mockImplementation((cue: string) => {
        if (cue === "cat-call") releaseCommitStates.push(closureCommitted);
      });
      vi.spyOn(channels, "closeSituatedExpressionChannelBankInterval")
        .mockImplementation((...args) => {
          closureCalls += 1;
          audioInsideClosure ||= catAudio().length > 0;
          if (reject) return null;
          const closed = close(...args);
          closureCommitted = closed !== null;
          return closed;
        });
      advancePlayerSteps(runtime, 1);
      await Promise.resolve();
      expect(sourceEventIds.size).toBe(1);
      expect(closureCalls).toBe(1);
      expect(audioInsideClosure).toBe(false);
      expect(catAudio()).toEqual(reject ? [] : admittedAudio);
      expect(releaseCommitStates).toEqual(reject || !lawfullyHeard ? [] : [true]);
      expect(runtime.getUIView().expressionCaption?.animalCallKind).not.toBe("cat-call");
      if (reject) {
        expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
        expect(repository.snapshot()).toEqual(beforeRecord);
      }
      await runtime.save();
      const after = requiredEnvelope(repository);
      expect(after.perceptionCarry.actorVocalizationSamples).toEqual([]);
      expect(after.perceptionCarry.situatedExpressionAdmissions.records.filter(
        (record) => record.kind === "core-wildlife-weather-distress",
      )).toEqual([]);
      expect(after.perceptionCarry.situatedExpressionChannels.channels.some(
        ({ sourceActorId }) => sourceActorId === catActorId,
      )).toBe(false);
      if (reject) {
        const { session: _beforeSession, integrity: _beforeIntegrity, ...beforeRoots } = before;
        const { session: _afterSession, integrity: _afterIntegrity, ...afterRoots } = after;
        expect(afterRoots).toEqual(beforeRoots);
        const { paused: _beforePaused, announcement: _beforeAnnouncement, nextAnnouncementId: _beforeAnnouncementId, ...beforeSession } = before.session as Record<string, unknown>;
        const { paused: _afterPaused, announcement: _afterAnnouncement, nextAnnouncementId: _afterAnnouncementId, ...afterSession } = after.session as Record<string, unknown>;
        expect(afterSession).toEqual(beforeSession);
      } else {
        const cat = requiredCoreActor(requiredRegionalCoreOwner(after, catActorId), catActorId);
        expect(cat.intent.kind).toBe("retreat");
        expect(cat.memories.filter(({ eventId }) => sourceEventIds.has(eventId))).toMatchObject([{
          kind: "weather",
          referenceId: "weather:rain",
          atTick: nextTick,
          environmentalEvidence: { kind: "wet-tracks", createdAtTick: nextTick },
        }]);
      }
      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      soundscapePlay.mockReset();
      runtime = await runtimeModule.createTideweftRuntime(repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(catAudio()).toEqual([]);
      await runtime.save();
      const restored = requiredEnvelope(repository);
      expect(restored.regionalEcology).toBe(after.regionalEcology);
      expect(restored.physicalCargo).toEqual(after.physicalCargo);
      expect(restored.perceptionCarry).toEqual(after.perceptionCarry);
      if (!reject) {
        // A consumed call remains consumed through the next real interval,
        // not merely while construction is idle. Rejected work is different:
        // its still-uncommitted rainy transition may legitimately happen later.
        soundscapePlay.mockClear();
        advancePlayerSteps(runtime, 10);
        expect(catAudio()).toEqual([]);
        await runtime.save();
        const continued = requiredEnvelope(repository);
        expect(deserializeWorld(continued.world).meta.completedTick).toBe(nextTick + 1);
        const cat = requiredCoreActor(requiredRegionalCoreOwner(continued, catActorId), catActorId);
        expect(cat.memories.filter(({ eventId }) => sourceEventIds.has(eventId))).toHaveLength(1);
      }
    } finally {
      runtime?.destroy();
      soundscapePlay.mockReset();
      vi.doUnmock("./humanPerception");
      vi.resetModules();
    }
  }, 45_000);

  it.each([[false, false, 500], [true, false, 500], [true, true, 500], [true, false, 2_000]] as const)("carries one genuine cat rain call to a real human independently of optional captions (refuse=%s, reject=%s, distance=%s)", async (refuse, reject, listenerDistance) => {
    // Stage only initial physical placement of one generated free resident
    // on a real generated route. Cognition, rain, sound and hearing are real.
    const prepared = await createCatWeatherRuntime("rain-distress", 1, listenerDistance);
    const preparedRecord = prepared.repository.snapshot();
    const { catActorId, listenerActorId } = prepared;
    prepared.runtime.destroy();
    scheduledFrame = undefined;
    if (listenerActorId === null) throw new Error("Cat hearing fixture omitted its real resident");
    vi.resetModules();
    const heardFrames: Array<{ tick: number; observations: ActorObservation[];
      positions: ReturnType<typeof createWorldPosition>[];
      samples: readonly (SupplementalSoundSample | PhysicalSoundSample)[];
      surfaceSampleIds: readonly string[] }> = [];
    const carrierCounts: number[] = [];
    const physicalCounts: number[] = [];
    vi.doMock("./humanPerception", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./humanPerception")>();
      return {
        ...actual,
        HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES: refuse
          ? 0 : actual.HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES,
        collectExistingHumanObservations: (
          input: Parameters<typeof actual.collectExistingHumanObservations>[0],
        ) => {
          const batches = actual.collectExistingHumanObservations(input);
          const catSamples = [
            ...(input.supplementalSoundSamples ?? []).filter(({ sourceActorId }) => sourceActorId === catActorId),
            ...(input.physicalSoundSamples ?? []).filter(({ sourceId }) => sourceId === catActorId),
          ];
          if (catSamples.length > 0) {
            carrierCounts.push(catSamples.length);
            physicalCounts.push((input.physicalSoundSamples?.length ?? 0)
              + (input.unadmittedAlarmSoundSamples?.length ?? 0));
            heardFrames.push({
              tick: input.targetTick,
              positions: catSamples.map(({ position }) => position),
              samples: structuredClone(catSamples),
              surfaceSampleIds: (input.surfaceSoundSampleIds ?? []).filter((id) => (
                catSamples.some((sample) => sample.id === id)
              )),
              observations: batches.flatMap(({ observerId, observations }) => (
                observerId === listenerActorId ? observations.filter((observation) => (
                  observation.channel === "hearing"
                  && catSamples.some(({ id }) => observation.id.endsWith(`-${id}`))
                )) : []
              )),
            });
          }
          return batches;
        },
      };
    });
    let runtime: TideweftRuntime | null = null;
    try {
      const runtimeModule = await import("./runtime");
      const channels = await import("./situatedExpressionChannelBank");
      const repository = new MemoryRepository(preparedRecord);
      runtime = await runtimeModule.createTideweftRuntime(repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const pending = requiredEnvelope(repository);
      const sourceTick = deserializeWorld(pending.world).meta.completedTick;
      const cat = requiredCoreActor(requiredRegionalCoreOwner(pending, catActorId), catActorId);
      const freshMemories = cat.memories.filter(({ kind, referenceId, atTick }) => (
        kind === "weather" && referenceId === "weather:rain" && atTick === sourceTick
      ));
      expect(freshMemories).toHaveLength(1);
      expect(cat.intent.kind).toBe("retreat");
      const rainLocus = freshMemories[0]?.environmentalEvidence?.position;
      expect(rainLocus).toBeDefined();
      expect(cat.address.position).not.toEqual(rainLocus);
      expect(pending.perceptionCarry.situatedExpressionAdmissions.records.filter(
        ({ kind }) => kind === "core-wildlife-weather-distress",
      )).toHaveLength(refuse ? 0 : 1);
      if (refuse) expect(pending.perceptionCarry.actorVocalizationSamples).toEqual([]);
      const pendingCatSamples = pending.perceptionCarry.actorVocalizationSamples.filter(
        ({ sourceActorId }) => sourceActorId === catActorId,
      );
      expect(pendingCatSamples).toHaveLength(refuse ? 0 : 1);
      const catAcoustics = situatedExpressionAcoustics({
        meaning: "domestic-cat-rain-distress-call", volume: "murmur",
      });
      const expectExactCatCarrier = () => {
        expect(heardFrames).toHaveLength(1);
        const frame = heardFrames[0];
        if (frame === undefined) throw new Error("Cat call never reached the real collector");
        expect(frame.samples).toHaveLength(1);
        expect(frame.surfaceSampleIds).toEqual(frame.samples.map(({ id }) => id));
        expect(frame.samples).toMatchObject([{
          position: rainLocus,
          soundClass: "animal-call",
          soundInterrupt: "none",
          soundLoudness: catAcoustics.loudness,
          soundRangeUnits: catAcoustics.rangeUnits,
        }]);
        if (!refuse) expect(frame.samples).toEqual(pendingCatSamples);
        else expect(frame.samples).toMatchObject([{ sourceId: catActorId }]);
      };
      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      soundscapePlay.mockClear();
      runtime = await runtimeModule.createTideweftRuntime(repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "cat-call")).toEqual([]);
      advancePlayerSteps(runtime, 9);
      await runtime.save();
      const beforeReceipt = requiredEnvelope(repository);
      const beforeReceiptRecord = repository.snapshot();
      expect(beforeReceipt.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
      if (reject) vi.spyOn(channels, "closeSituatedExpressionChannelBankInterval").mockReturnValue(null);
      advancePlayerSteps(runtime, 1);
      await Promise.resolve();
      if (reject) {
        expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
        expect(repository.snapshot()).toEqual(beforeReceiptRecord);
        expect(carrierCounts).toEqual([1]);
        expect(heardFrames[0]?.observations).toHaveLength(1);
        expect(heardFrames[0]?.positions).toEqual([rainLocus]);
        expectExactCatCarrier();
        // A real pre-step observation existed, but a failed transaction must
        // not commit it into anybody's belief or any authoritative root.
        await runtime.save();
        const rejected = requiredEnvelope(repository);
        const { session: _beforeSession, integrity: _beforeIntegrity, ...beforeRoots } = beforeReceipt;
        const { session: _rejectedSession, integrity: _rejectedIntegrity, ...rejectedRoots } = rejected;
        expect(rejectedRoots).toEqual(beforeRoots);
        const { paused: _beforePaused, announcement: _beforeAnnouncement, nextAnnouncementId: _beforeAnnouncementId, ...beforeSession } = beforeReceipt.session as Record<string, unknown>;
        const { paused: _rejectedPaused, announcement: _rejectedAnnouncement, nextAnnouncementId: _rejectedAnnouncementId, ...rejectedSession } = rejected.session as Record<string, unknown>;
        expect(rejectedSession).toEqual(beforeSession);
        expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "cat-call")).toEqual([]);
        return;
      }
      await runtime.save();
      const propagated = requiredEnvelope(repository);
      const world = deserializeWorld(propagated.world);
      expect(world.meta.completedTick).toBe(sourceTick + 1);
      expect(carrierCounts).toEqual([1]);
      expect(physicalCounts.every((count) => count <= 8)).toBe(true);
      expect(heardFrames).toHaveLength(1);
      expectExactCatCarrier();
      const frame = heardFrames[0];
      expect(frame?.tick).toBe(sourceTick + 1);
      expect(frame?.positions).toEqual([rainLocus]);
      const lawfullyHeard = listenerDistance === 500;
      expect(frame?.observations).toHaveLength(lawfullyHeard ? 1 : 0);
      const observation = frame?.observations[0];
      if (lawfullyHeard && observation === undefined) throw new Error("Real cat call did not reach the real human");
      if (observation !== undefined) {
        expect(observation).toMatchObject({
          observerId: listenerActorId, channel: "hearing", perceivedClass: "animal-call",
          identification: "anonymous", subjectId: null, interrupt: "none",
        });
        expect(observation.area.radiusUnits).toBeGreaterThan(0);
        expect(observation.area.center).not.toEqual(freshMemories[0]?.environmentalEvidence?.position);
      }
      const listener = world.residents.find(({ identity }) => identity.stableId === listenerActorId);
      if (observation !== undefined) {
        expect(listener?.perception.beliefs.filter(({ sourceObservationId }) => sourceObservationId === observation.id))
          .toMatchObject([{ perceivedClass: "animal-call", identification: "anonymous", subjectId: null,
            firstObservedTick: sourceTick + 1, lastObservedTick: sourceTick + 1, strongInterrupt: false }]);
      } else {
        expect(listener?.perception.beliefs.filter(({ channel, perceivedClass, lastObservedTick }) => (
          channel === "hearing" && perceivedClass === "animal-call" && lastObservedTick === sourceTick + 1
        ))).toEqual([]);
      }
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "cat-call")).toEqual([]);
      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      runtime = await runtimeModule.createTideweftRuntime(repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      expect(carrierCounts).toEqual([1]);
      const continued = deserializeWorld(requiredEnvelope(repository).world);
      expect(continued.meta.completedTick).toBe(sourceTick + 2);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "cat-call")).toEqual([]);
      if (observation !== undefined) expect(continued.residents.find(({ identity }) => identity.stableId === listenerActorId)
        ?.perception.beliefs.find(({ sourceObservationId }) => sourceObservationId === observation.id)
        ?.lastObservedTick).toBe(sourceTick + 1);
    } finally {
      runtime?.destroy();
      scheduledFrame = undefined;
      vi.doUnmock("./humanPerception");
      vi.resetModules();
    }
  }, 60_000);

  it("voices one fresh rain-caused cat retreat through shared authority and reloads without replay", async () => {
    const { runtime, repository, catActorId } = await createCatWeatherRuntime("rain-distress");
    soundscapePlay.mockClear();
    let sharedCatCaption:
      ReturnType<TideweftRuntime["getUIView"]>["expressionCaption"];
    let legacyCatAnnouncement = false;

    advancePlayerSteps(runtime, 10, () => {
      const view = runtime.getUIView();
      if (view.expressionCaption?.animalCallKind === "cat-call") {
        sharedCatCaption = view.expressionCaption;
      }
      if (view.announcement?.message === "CAT CALL — nearby and in view.") {
        legacyCatAnnouncement = true;
      }
    });

    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "cat-call")).toHaveLength(1);
    expect(sharedCatCaption).toMatchObject({
      speakerLabel: "Domestic cat",
      text: "MRROW.",
      presentationKind: "animal-call",
      animalCallKind: "cat-call",
      assertive: false,
    });
    expect(legacyCatAnnouncement).toBe(false);

    await runtime.save();
    const saved = requiredEnvelope(repository);
    const savedWorld = deserializeWorld(saved.world);
    const savedCore = requiredRegionalCoreOwner(saved, catActorId);
    const savedCat = requiredCoreActor(savedCore, catActorId);
    const admissions = saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (record): record is CoreWildlifeWeatherDistressExpressionAdmissionRecord => (
        record.kind === "core-wildlife-weather-distress"
      ),
    );
    expect(admissions).toHaveLength(1);
    const admission = admissions[0];
    if (admission === undefined) throw new Error("Cat weather voice fixture omitted admission");
    expect(admission).toMatchObject({
      kind: "core-wildlife-weather-distress",
      sourceActorId: catActorId,
      sourceOwnerKey: savedCore.patchKey,
      admittedAtPlayerStepPhase: 0,
      acceptedAtTick: savedWorld.meta.completedTick,
    });
    const rainMemory = savedCat.memories.find(({ eventId }) => (
      eventId === admission.triggerEventId
    ));
    expect(rainMemory).toMatchObject({
      kind: "weather",
      referenceId: "weather:rain",
      observationId: admission.sourceObservationId,
      atTick: admission.acceptedAtTick,
      environmentalEvidence: {
        kind: "wet-tracks",
        createdAtTick: admission.acceptedAtTick,
        itemConsumption: "none",
        disclosure: "direct-observation-required",
      },
    });
    if (rainMemory?.environmentalEvidence === undefined) {
      throw new Error("Cat weather voice fixture omitted its wet-track event locus");
    }
    expect(saved.perceptionCarry.actorVocalizationSamples.filter((candidate) => (
      candidate.sourceActorId === catActorId
      && candidate.expressionEventId === admission.eventId
    ))).toHaveLength(1);
    const sample = saved.perceptionCarry.actorVocalizationSamples[admission.sampleOrdinal];
    const acoustics = situatedExpressionAcoustics({
      meaning: "domestic-cat-rain-distress-call",
      volume: "murmur",
    });
    expect(sample).toMatchObject({
      expressionEventId: admission.eventId,
      sourceActorId: catActorId,
      position: rainMemory.environmentalEvidence.position,
      soundClass: "animal-call",
      soundInterrupt: "none",
      soundLoudness: acoustics.loudness,
      soundRangeUnits: acoustics.rangeUnits,
    });
    expect(savedCat).toMatchObject({
      updatedAtTick: admission.acceptedAtTick,
      intent: {
        kind: "retreat",
        cause: { kind: "perception", referenceId: admission.sourceObservationId },
        focusObservationId: admission.sourceObservationId,
      },
    });
    const channel = saved.perceptionCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === catActorId,
    );
    expect(channel?.state.active).toMatchObject({
      eventId: admission.eventId,
      triggerEventId: admission.triggerEventId,
      position: rainMemory.environmentalEvidence.position,
      meaning: "domestic-cat-rain-distress-call",
      family: "animal-signal",
      tone: "restrained",
      volume: "murmur",
      knowledgeBasis: "self-weather-distress",
      vocalization: "domestic-cat-rain-distress",
      priority: 300_000,
      durationSteps: 6,
      audioAcknowledged: true,
    });
    expect(channel?.reception).toMatchObject({
      eventId: admission.eventId,
      sourceActorId: catActorId,
      receivedAtTick: admission.acceptedAtTick,
      kind: "heard-visible",
      directVisualReceipt: true,
    });
    const durableCarry = stableStringify(saved.perceptionCarry);
    runtime.destroy();

    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(resumed.getUIView().expressionCaption?.animalCallKind).not.toBe("cat-call");
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "cat-call")).toEqual([]);
    await resumed.save();
    expect(stableStringify(requiredEnvelope(repository).perceptionCarry)).toBe(durableCarry);
    resumed.destroy();
    scheduledFrame = undefined;

    const ordinary = await createCatWeatherRuntime("non-rain-control");
    soundscapePlay.mockClear();
    legacyCatAnnouncement = false;
    advancePlayerSteps(ordinary.runtime, 10, () => {
      if (ordinary.runtime.getUIView().announcement?.message
        === "CAT CALL — nearby and in view.") legacyCatAnnouncement = true;
    });
    await ordinary.runtime.save();
    const ordinaryCat = requiredCoreActor(
      requiredRegionalCoreOwner(requiredEnvelope(ordinary.repository), ordinary.catActorId),
      ordinary.catActorId,
    );
    expect(["retreat", "rest"]).toContain(ordinaryCat.intent.kind);
    expect(ordinaryCat.intent.kind).not.toBe("observe");
    expect(ordinaryCat.memories.some(({ kind, referenceId }) => (
      kind === "weather" && referenceId === "weather:rain"
    ))).toBe(false);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "cat-call")).toEqual([]);
    expect(ordinary.runtime.getUIView().expressionCaption?.animalCallKind).not.toBe("cat-call");
    expect(legacyCatAnnouncement).toBe(false);
    ordinary.runtime.destroy();
  }, 120_000);

  it("restores one real admitted cat rain call after a signed-window rebase without replay", async () => {
    const projectionModule = await import("./regionalEcologyStateV6");
    // The runtime memo retains its projector at construction, so observe the
    // actual projected body before creating this controlled existing actor.
    const projectionSpy = vi.spyOn(projectionModule, "projectRegionalEcologyStateV6ActiveState");
    const runtimeModule = await import("./runtime");
    const humanModule = await import("./humanPerception");
    const fixture = await createCatWeatherRuntime("rain-distress", 1, false, {
      initialWestRebaseBoundary: true,
      createRuntime: runtimeModule.createTideweftRuntime,
    });
    let runtime = fixture.runtime;
    const sources = (projection: RegionalEcologyStateV6ActiveProjection) => [
      ...projection.base.base.base.base.base.residents,
      ...projection.base.base.base.base.alpineResidents,
      ...projection.base.base.base.polarShoreResidents,
      ...projection.base.base.coldShoreResidents,
      ...projection.base.polarConsumerResidents,
      ...projection.breadthResidents,
    ];
    try {
      await runtime.save();
      const before = requiredEnvelope(fixture.repository);
      const world = deserializeWorld(before.world);
      const travel = restorePlayerRegionalTravel(world.meta.rootSeed, before.player, before.regionalTravel);
      if (travel === null) throw new Error("Cat rebase fixture lost its actual initial frame");
      const initialProjection = projectionModule.projectRegionalEcologyStateV6ActiveState(requiredRegionalEcologyV6(before), {
        origin: travel.window.origin, terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
      });
      if (initialProjection === null) throw new Error("Cat rebase fixture lost its actual initial projection");
      const initialOwners = sources(initialProjection).filter(({ patch }) => patch.populations.some(({ members }) => (
        members.some(({ actor }) => actor.identity.stableId === fixture.catActorId)
      )));
      expect(initialOwners).toHaveLength(1);
      const sourceOwnerKey = initialOwners[0]!.sourceKey;
      const sourceMembers = initialOwners[0]!.patch.populations.flatMap(({ members }) => members)
        .filter(({ actor }) => actor.identity.stableId === fixture.catActorId);
      expect(sourceMembers).toHaveLength(1);
      expect(sourceMembers[0]!.materialization).toBe("materialized");
      const initialSpatial = createRegionalWorldView(createWorldView(world), travel.window, {
        discovered: before.player.discovered, depthSoundings: before.player.depthSoundings,
      });
      const initialCatPosition = sourceMembers[0]!.actor.address.position;
      const catWindowY = initialCatPosition.region.y * WORLD_HEIGHT
        + Math.floor(initialCatPosition.localY / WORLD_POSITION_UNITS_PER_TILE) - travel.window.origin.y;
      const sourceTile = initialSpatial.terrain.tiles[
        catWindowY * REGIONAL_TRAVEL_COLUMNS + 105
      ];
      expect(sourceTile).toBeDefined();
      expect(sourceTile!.terrain).not.toBe("deep-water");
      expect(sourceTile!.waterDepth).toBeLessThanOrEqual(ADRIFT_STAND_DEPTH);
      soundscapePlay.mockClear();
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const pending = requiredEnvelope(fixture.repository);
      const tick = deserializeWorld(pending.world).meta.completedTick;
      const admission = pending.perceptionCarry.situatedExpressionAdmissions.records.find((record) => (
        record.kind === "core-wildlife-weather-distress" && record.sourceActorId === fixture.catActorId
      ));
      if (admission?.kind !== "core-wildlife-weather-distress") throw new Error("Real edge cat never earned rain-call admission");
      expect(admission).toMatchObject({ sourceOwnerKey, acceptedAtTick: tick, admittedAtPlayerStepPhase: 0 });
      const cat = requiredCoreActor(requiredRegionalCoreOwner(pending, fixture.catActorId), fixture.catActorId);
      const memory = cat.memories.find(({ eventId }) => eventId === admission.triggerEventId);
      expect(memory).toMatchObject({ kind: "weather", referenceId: "weather:rain", observationId: admission.sourceObservationId, atTick: tick });
      expect(cat.intent).toMatchObject({ kind: "retreat", enteredAtTick: tick, focusObservationId: admission.sourceObservationId });
      const sample = pending.perceptionCarry.actorVocalizationSamples[admission.sampleOrdinal];
      if (sample === undefined) throw new Error("Actual edge cat admission lost its original sound");
      expect(sample.position).toEqual(memory?.environmentalEvidence?.position);
      const originBefore = travel.window.origin;
      const originAfter = { x: originBefore.x - REGIONAL_TRAVEL_SHIFT_TILES, y: originBefore.y };
      projectionSpy.mockClear();
      runtime.dispatchRenderer({ type: "movement", vector: { x: -1, y: 0 } });
      let movementSteps = 0;
      while (movementSteps < 9 && runtime.getRenderView().terrain.worldTileOrigin?.x === originBefore.x) {
        advancePlayerSteps(runtime, 1);
        movementSteps += 1;
      }
      runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
      expect(runtime.getRenderView().terrain.worldTileOrigin).toEqual(originAfter);
      expect(movementSteps).toBeGreaterThan(0);
      expect(movementSteps).toBeLessThan(10);
      const actualProjection = projectionSpy.mock.calls.flatMap(([, window], index) => {
        const result = projectionSpy.mock.results[index];
        return window.origin.x === originAfter.x && window.origin.y === originAfter.y
          && result?.type === "return" && result.value !== null ? [result.value] : [];
      }).at(-1);
      if (actualProjection === undefined) throw new Error("Real movement never projected the rebased cat");
      expect(actualProjection.atTick).toBe(tick);
      const actualOwners = sources(actualProjection).filter(({ sourceKey }) => sourceKey === sourceOwnerKey);
      expect(actualOwners).toHaveLength(1);
      const actualMembers = actualOwners[0]!.patch.populations.flatMap(({ members }) => members)
        .filter(({ actor }) => actor.identity.stableId === fixture.catActorId);
      expect(actualMembers).toHaveLength(1);
      expect(actualMembers[0]!.materialization).toBe("coarse");
      expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
      await runtime.save();
      const rebased = requiredEnvelope(fixture.repository);
      expect(rebased.perceptionCarry.playerStepsSinceWorldTick).toBe(movementSteps);
      expect(rebased.perceptionCarry.actorVocalizationSamples).toContainEqual(sample);
      const record = fixture.repository.snapshot();
      runtime.destroy(); scheduledFrame = undefined; soundscapePlay.mockClear();
      const repository = new MemoryRepository(record);
      runtime = await runtimeModule.createTideweftRuntime(repository);
      expect(repository.snapshot()).toEqual(record);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(runtime.getUIView().title.hasSave).toBe(true);
      expect(soundscapePlay).not.toHaveBeenCalled();
      await runtime.save();
      const restored = requiredEnvelope(repository);
      expect(restored.perceptionCarry).toEqual(rebased.perceptionCarry);
      expect(restored.world).toBe(rebased.world);
      expect(restored.regionalEcology).toBe(rebased.regionalEcology);
      const perceptionSpy = vi.spyOn(humanModule, "collectExistingHumanObservations");
      advancePlayerSteps(runtime, 10 - movementSteps);
      expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
      const frames = perceptionSpy.mock.calls.filter(([input]) => input.supplementalSoundSamples?.some(({ id }) => id === sample.id));
      expect(frames).toHaveLength(1);
      expect(frames[0]![0].targetTick).toBe(tick + 1);
      expect(frames[0]![0].supplementalSoundSamples?.filter(({ id }) => id === sample.id)).toEqual([sample]);
      expect(frames[0]![0].surfaceSoundSampleIds).not.toContain(sample.id);
      advancePlayerSteps(runtime, 10);
      expect(perceptionSpy.mock.calls.filter(([input]) => input.supplementalSoundSamples?.some(({ id }) => id === sample.id))).toHaveLength(1);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "cat-call")).toEqual([]);
    } finally { runtime.destroy(); projectionSpy.mockRestore(); }
  }, 90_000);

  it("admits one source-bound deer snort through shared audio/caption authority and reloads without replay", async () => {
    const { runtime, repository, alarmActorId } = await createAlarmRuntime(-8);
    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === alarmActorId))
      .toBe(false);
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-deer-alarm-snort",
    )).toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "An animal",
      text: "SNORT!",
      presentationKind: "animal-call",
      animalCallKind: "animal-call",
      assertive: true,
    });
    expect(runtime.getUIView().announcement?.message)
      .not.toBe("ANIMAL ALARM — source unclear.");

    await runtime.save();
    const saved = requiredEnvelope(repository);
    const savedWorld = deserializeWorld(saved.world);
    const savedCore = requiredCore(saved);
    const savedDeer = requiredCoreActor(savedCore, alarmActorId);
    const admissions = saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (record): record is CoreWildlifeAlarmExpressionAdmissionRecord => (
        record.kind === "core-wildlife-alarm"
        && record.sourceSpecies === "deer"
      ),
    );
    expect(admissions).toHaveLength(1);
    const admission = admissions[0];
    if (admission === undefined) throw new Error("Deer voice fixture omitted its admission");
    expect(admission).toMatchObject({
      kind: "core-wildlife-alarm",
      sourceSpecies: "deer",
      sourceActorId: alarmActorId,
      sourceOwnerKey: savedCore.patchKey,
      admittedAtPlayerStepPhase: 0,
      acceptedAtTick: savedWorld.meta.completedTick,
    });
    const sample = saved.perceptionCarry.actorVocalizationSamples[admission.sampleOrdinal];
    if (sample === undefined) throw new Error("Deer voice fixture omitted its sound sample");
    const deerAcoustics = situatedExpressionAcoustics({
      meaning: "deer-alarm-call",
      volume: "shout",
    });
    expect(sample).toMatchObject({
      expressionEventId: admission.eventId,
      sourceActorId: alarmActorId,
      position: savedDeer.address.position,
      soundClass: "animal-alarm",
      soundInterrupt: "strong",
      soundLoudness: deerAcoustics.loudness,
      soundRangeUnits: deerAcoustics.rangeUnits,
    });
    expect(savedDeer).toMatchObject({
      updatedAtTick: admission.acceptedAtTick,
      intent: {
        kind: "alarm",
        cause: { kind: "perception", referenceId: admission.sourceObservationId },
        focusObservationId: admission.sourceObservationId,
      },
    });
    expect(savedDeer.memories).toContainEqual(expect.objectContaining({
      eventId: admission.triggerEventId,
      kind: "alarm",
      observationId: admission.sourceObservationId,
      atTick: admission.acceptedAtTick,
      eventPosition: savedDeer.address.position,
    }));
    const channel = saved.perceptionCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === alarmActorId,
    );
    expect(channel?.state.active).toMatchObject({
      eventId: admission.eventId,
      triggerEventId: admission.triggerEventId,
      position: savedDeer.address.position,
      meaning: "deer-alarm-call",
      family: "animal-signal",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-perceived-threat",
      vocalization: "deer-alarm-snort",
      priority: 760_000,
      durationSteps: 6,
      audioAcknowledged: true,
    });
    expect(channel?.reception).toMatchObject({
      eventId: admission.eventId,
      sourceActorId: alarmActorId,
      receivedAtTick: admission.acceptedAtTick,
      kind: "heard-unseen",
      directVisualReceipt: false,
    });
    const durableCarry = stableStringify(saved.perceptionCarry);
    runtime.destroy();

    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-deer-alarm-snort",
    )).toEqual([]);
    await resumed.save();
    expect(stableStringify(requiredEnvelope(repository).perceptionCarry)).toBe(durableCarry);
    resumed.destroy();
    scheduledFrame = undefined;
  }, 120_000);

  it("interrupts WAIT at the committed boundary of a lawfully heard strong alarm", async () => {
    const { runtime, repository } = await createAlarmRuntime(-8);
    const before = requiredEnvelope(repository);
    const beforeTick = deserializeWorld(before.world).meta.completedTick;
    soundscapePlay.mockClear();

    runtime.dispatchUI({ type: "wait", action: "begin" });
    expect(runtime.getUIView().controls?.waitActive).toBe(true);
    advanceWaitFrames(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-deer-alarm-snort",
    ))
      .toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "An animal",
      text: "SNORT!",
      presentationKind: "animal-call",
      animalCallKind: "animal-call",
      assertive: true,
    });
    expect(runtime.getUIView().controls).toMatchObject({
      waitActive: false,
      waitLabel: "Wait 10 min",
    });
    await runtime.save();
    const after = requiredEnvelope(repository);
    expect(deserializeWorld(after.world).meta.completedTick).toBe(beforeTick + 1);
    expect((after.perceptionCarry as { playerStepsSinceWorldTick?: unknown })
      .playerStepsSinceWorldTick).toBe(0);
    expect((after.session as { sessionChanges?: readonly string[] }).sessionChanges)
      .not.toContainEqual(expect.stringContaining("Waited ten minutes"));
    expect(Object.hasOwn(after, "pendingPlayerWait")).toBe(false);
    runtime.destroy();
  }, 45_000);

  it("anchors an in-range deer snort only when the source is directly visible", async () => {
    const { runtime, alarmActorId } = await createAlarmRuntime(-4);
    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === alarmActorId))
      .toBe(true);
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-deer-alarm-snort",
    )).toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "Deer",
      text: "SNORT!",
      presentationKind: "animal-call",
      animalCallKind: "deer-call",
      assertive: true,
    });
    runtime.destroy();
  }, 45_000);

  it("does not turn direct visual alarm knowledge into out-of-range audio", async () => {
    const { runtime, alarmActorId } = await createAlarmRuntime(9);
    const presentations = vi.spyOn(acousticPresentationQueue, "admitWorldAcousticPresentation");
    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === alarmActorId))
      .toBe(true);
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-deer-alarm-snort",
    )).toEqual([]);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(runtime.getUIView().expressionCaption?.text).not.toBe("SNORT!");
    expect(presentations.mock.calls.filter(([, event]) => (
      event.sourceId === alarmActorId && event.soundClass === "animal-alarm"
    ))).toEqual([]);
    runtime.destroy();
  }, 45_000);

  it("admits one soft marsh-rabbit thump without interrupting WAIT and round-trips without replay", async () => {
    const { runtime, repository, alarmActorId } = await createAlarmRuntime(
      -4,
      "marsh-rabbit",
    );
    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === alarmActorId))
      .toBe(true);
    soundscapePlay.mockClear();

    runtime.dispatchUI({ type: "wait", action: "begin" });
    expect(runtime.getUIView().controls?.waitActive).toBe(true);
    advanceWaitFrames(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump"))
      .toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-marsh-rabbit-alarm-thump",
    )).toEqual([]);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "Marsh rabbit",
      text: "thump",
      presentationKind: "embodied-signal",
      assertive: false,
    });
    expect(Object.hasOwn(
      runtime.getUIView().expressionCaption ?? {},
      "animalCallKind",
    )).toBe(false);
    expect(runtime.getUIView().announcement?.message)
      .not.toBe("ANIMAL ALARM — source unclear.");
    expect(runtime.getUIView().controls).toMatchObject({
      waitActive: true,
      waitLabel: "Cancel · 9 min",
    });

    await runtime.save();
    const validRecord = repository.snapshot();
    const saved = requiredEnvelope(repository);
    const savedWorld = deserializeWorld(saved.world);
    const savedCore = requiredCore(saved);
    const savedRabbit = requiredCoreActor(savedCore, alarmActorId);
    const admissions = saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (record): record is CoreWildlifeAlarmExpressionAdmissionRecord => (
        record.kind === "core-wildlife-alarm"
        && record.sourceSpecies === "marsh-rabbit"
      ),
    );
    expect(admissions).toHaveLength(1);
    const admission = admissions[0];
    if (admission === undefined) throw new Error("Rabbit voice fixture omitted its admission");
    expect(admission).toMatchObject({
      kind: "core-wildlife-alarm",
      sourceSpecies: "marsh-rabbit",
      sourceActorId: alarmActorId,
      sourceOwnerKey: savedCore.patchKey,
      admittedAtPlayerStepPhase: 0,
      acceptedAtTick: savedWorld.meta.completedTick,
    });
    const sample = saved.perceptionCarry.actorVocalizationSamples[admission.sampleOrdinal];
    if (sample === undefined) throw new Error("Rabbit voice fixture omitted its sound sample");
    const rabbitAcoustics = situatedExpressionAcoustics({
      meaning: "marsh-rabbit-alarm-thump",
      volume: "murmur",
    });
    expect(rabbitAcoustics).toEqual({ loudness: 420_000, rangeUnits: 9_100 });
    expect(sample).toMatchObject({
      expressionEventId: admission.eventId,
      sourceActorId: alarmActorId,
      position: savedRabbit.address.position,
      soundClass: "physical-thud",
      soundInterrupt: "none",
      soundLoudness: rabbitAcoustics.loudness,
      soundRangeUnits: rabbitAcoustics.rangeUnits,
    });
    expect(savedRabbit).toMatchObject({
      updatedAtTick: admission.acceptedAtTick,
      intent: {
        kind: "alarm",
        cause: { kind: "perception", referenceId: admission.sourceObservationId },
        focusObservationId: admission.sourceObservationId,
      },
    });
    expect(savedRabbit.memories).toContainEqual(expect.objectContaining({
      eventId: admission.triggerEventId,
      kind: "alarm",
      observationId: admission.sourceObservationId,
      atTick: admission.acceptedAtTick,
      eventPosition: savedRabbit.address.position,
    }));
    const channel = saved.perceptionCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === alarmActorId,
    );
    expect(channel?.state.active).toMatchObject({
      eventId: admission.eventId,
      triggerEventId: admission.triggerEventId,
      position: savedRabbit.address.position,
      meaning: "marsh-rabbit-alarm-thump",
      family: "animal-signal",
      tone: "alarmed",
      volume: "murmur",
      knowledgeBasis: "self-perceived-threat",
      vocalization: "marsh-rabbit-alarm-thump",
      priority: 160_000,
      durationSteps: 6,
      audioAcknowledged: true,
    });
    expect(channel?.reception).toMatchObject({
      eventId: admission.eventId,
      sourceActorId: alarmActorId,
      receivedAtTick: admission.acceptedAtTick,
      kind: "heard-visible",
      directVisualReceipt: true,
    });
    const durableCarry = stableStringify(saved.perceptionCarry);
    runtime.destroy();
    scheduledFrame = undefined;

    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump")).toEqual([]);
    expect(resumed.getUIView().expressionCaption).toBeUndefined();
    await resumed.save();
    expect(stableStringify(requiredEnvelope(repository).perceptionCarry)).toBe(durableCarry);
    advancePlayerSteps(resumed, 10);
    // Reload did not replay the tick-T event. The ecology actor lawfully
    // commits a distinct tick-(T+1) thump for a changed threat observation;
    // its physical audio remains real even while expression cooldown keeps
    // the optional text suppressed.
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump"))
      .toHaveLength(1);
    expect(resumed.getUIView().expressionCaption?.text).not.toBe("thump");
    await resumed.save();
    const propagatedAdmittedEnvelope = requiredEnvelope(repository);
    const propagatedAdmittedWorld = deserializeWorld(propagatedAdmittedEnvelope.world);
    const propagatedRabbit = requiredCoreActor(
      requiredCore(propagatedAdmittedEnvelope),
      alarmActorId,
    );
    expect(propagatedRabbit.memories.some((memory) => (
      memory.kind === "alarm"
      && memory.atTick === propagatedAdmittedWorld.meta.completedTick
      && memory.eventId !== admission.triggerEventId
    ))).toBe(true);
    const admittedHumanThuds = propagatedAdmittedWorld.residents.flatMap((resident) => {
      const physicalThuds = resident.perception.beliefs.filter((belief) => (
        belief.channel === "hearing"
        && belief.lastObservedTick === propagatedAdmittedWorld.meta.completedTick
        && belief.perceivedClass === "physical-thud"
      ));
      expect(physicalThuds.length).toBeLessThanOrEqual(1);
      expect(physicalThuds.every(({ sourceObservationId }) => (
        sourceObservationId.includes("-av-")
        && !sourceObservationId.includes("-rth-")
      ))).toBe(true);
      expect(resident.perception.beliefs.some((belief) => (
        belief.channel === "hearing"
        && belief.lastObservedTick === propagatedAdmittedWorld.meta.completedTick
        && belief.perceivedClass === "animal-alarm"
      ))).toBe(false);
      return physicalThuds;
    });
    expect(admittedHumanThuds.length).toBeGreaterThanOrEqual(2);
    resumed.destroy();
    scheduledFrame = undefined;

    const sleepingCarry: CurrentPerceptionCarry = {
      ...saved.perceptionCarry,
      intervalStartWasSleeping: true,
      situatedExpressionChannels: {
        ...saved.perceptionCarry.situatedExpressionChannels,
        channels: saved.perceptionCarry.situatedExpressionChannels.channels.map(
          (candidate) => candidate.sourceActorId === alarmActorId
            ? { ...candidate, reception: null }
            : candidate,
        ),
      },
    };
    const sleepingRepository = new MemoryRepository(recordWithEnvelope(
      validRecord,
      resealedEnvelope(saved, { perceptionCarry: sleepingCarry }),
    ));
    soundscapePlay.mockClear();
    const sleepingReload = await createTideweftRuntime(sleepingRepository);
    expect(sleepingReload.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump")).toEqual([]);
    expect(sleepingReload.getUIView().expressionCaption).toBeUndefined();
    await sleepingReload.save();
    const sleepingRoundTrip = requiredEnvelope(sleepingRepository);
    expect(sleepingRoundTrip.perceptionCarry.intervalStartWasSleeping).toBe(true);
    expect(sleepingRoundTrip.perceptionCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === alarmActorId,
    )?.reception).toBeNull();
    sleepingReload.destroy();
    scheduledFrame = undefined;

    const wrongSpeciesCarry: CurrentPerceptionCarry = {
      ...saved.perceptionCarry,
      situatedExpressionAdmissions: {
        ...saved.perceptionCarry.situatedExpressionAdmissions,
        records: saved.perceptionCarry.situatedExpressionAdmissions.records.map(
          (candidate) => candidate.kind === "core-wildlife-alarm"
            && candidate.eventId === admission.eventId
            ? { ...candidate, sourceSpecies: "deer" as const }
            : candidate,
        ),
      },
    };
    const tamperedRepository = new MemoryRepository(recordWithEnvelope(
      validRecord,
      resealedEnvelope(saved, { perceptionCarry: wrongSpeciesCarry }),
    ));
    const rejected = await createTideweftRuntime(tamperedRepository);
    expect(rejected.getUIView().title.hasSave).toBe(false);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
    scheduledFrame = undefined;
  }, 120_000);

  it("keeps a heard rabbit thump physical and singular when expression capacity is saturated", async () => {
    vi.resetModules();
    const fallbackHumanObserverFrames: string[][] = [];
    const fallbackPhysicalSampleCounts: number[] = [];
    vi.doMock("./humanPerception", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./humanPerception")>();
      return {
        ...actual,
        // A zero-sized test budget is already full before the rabbit candidate.
        // Production retains its ordinary bounded capacity.
        HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES: 0,
        collectExistingHumanObservations: (
          input: Parameters<typeof actual.collectExistingHumanObservations>[0],
        ) => {
          const batches = actual.collectExistingHumanObservations(input);
          const rabbitPhysicalSamples = (input.physicalSoundSamples ?? []).filter((sample) => (
            sample.soundClass === "physical-thud"
            && sample.acousticEventId.startsWith("rabbit-thump:v1:")
          ));
          if (rabbitPhysicalSamples.length > 0) {
            fallbackPhysicalSampleCounts.push(input.physicalSoundSamples?.length ?? 0);
            fallbackHumanObserverFrames.push(batches.flatMap((batch) => (
              batch.observations.some((observation) => (
                observation.channel === "hearing"
                && observation.perceivedClass === "physical-thud"
              ))
                ? [batch.observerId]
                : []
            )).sort());
          }
          return batches;
        },
      };
    });
    let runtime: TideweftRuntime | null = null;
    try {
      const saturatedRuntimeModule = await import("./runtime");
      const fixture = await createAlarmRuntime(
        -4,
        "marsh-rabbit",
        saturatedRuntimeModule.createTideweftRuntime,
      );
      runtime = fixture.runtime;
      soundscapePlay.mockClear();

      advancePlayerSteps(runtime, 10);

      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump"))
        .toHaveLength(1);
      expect(soundscapePlay.mock.calls.filter(([cue]) => (
        cue === "wildlife-alarm"
        || cue === "vocalization-marsh-rabbit-alarm-thump"
      ))).toEqual([]);
      expect(runtime.getUIView().expressionCaption?.text).not.toBe("thump");

      await runtime.save();
      const saved = requiredEnvelope(fixture.repository);
      const savedWorld = deserializeWorld(saved.world);
      const savedRabbit = requiredCoreActor(requiredCore(saved), fixture.alarmActorId);
      const rabbitAlarmMemory = savedRabbit.memories.find((memory) => (
        memory.kind === "alarm"
        && memory.atTick === savedWorld.meta.completedTick
        && memory.eventPosition !== undefined
      ));
      if (rabbitAlarmMemory?.eventPosition === undefined) {
        throw new Error("Saturated rabbit fixture lost its retained event locus");
      }
      expect(saved.perceptionCarry.actorVocalizationSamples).toEqual([]);
      expect(saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
        (record) => record.kind === "core-wildlife-alarm"
          && record.sourceSpecies === "marsh-rabbit",
      )).toEqual([]);
      expect(saved.perceptionCarry.situatedExpressionChannels.channels.some(
        ({ sourceActorId }) => sourceActorId === fixture.alarmActorId,
      )).toBe(false);

      // The T alarm is retained by ecology, not an ephemeral caption. Reload
      // before T+1 must neither replay player presentation nor erase the later
      // bounded resident-hearing consequence.
      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      soundscapePlay.mockClear();
      runtime = await saturatedRuntimeModule.createTideweftRuntime(fixture.repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(runtime.getUIView().expressionCaption).toBeUndefined();
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump")).toEqual([]);

      advancePlayerSteps(runtime, 10);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump"))
        .toHaveLength(1);
      expect(runtime.getUIView().expressionCaption?.text).not.toBe("thump");
      await runtime.save();
      const propagatedEnvelope = requiredEnvelope(fixture.repository);
      const propagatedWorld = deserializeWorld(propagatedEnvelope.world);
      const propagatedRabbit = requiredCoreActor(
        requiredCore(propagatedEnvelope),
        fixture.alarmActorId,
      );
      expect(propagatedRabbit.memories.some((memory) => (
        memory.kind === "alarm"
        && memory.atTick === propagatedWorld.meta.completedTick
        && memory.eventId !== rabbitAlarmMemory.eventId
      ))).toBe(true);
      const freshHumanHearingByResident = propagatedWorld.residents.flatMap((resident) => {
        const matching = resident.perception.beliefs.filter((belief) => (
          belief.channel === "hearing"
          && belief.lastObservedTick === propagatedWorld.meta.completedTick
          && (belief.perceivedClass === "physical-thud"
            || belief.perceivedClass === "animal-alarm")
        ));
        expect(matching.filter(({ perceivedClass }) => (
          perceivedClass === "physical-thud"
        ))).toHaveLength(matching.length > 0 ? 1 : 0);
        expect(matching.filter(({ perceivedClass }) => (
          perceivedClass === "animal-alarm"
        ))).toEqual([]);
        expect(matching.every(({ identification, subjectId }) => (
          identification === "anonymous" && subjectId === null
        ))).toBe(true);
        return matching.length > 0 ? [resident.identity.stableId] : [];
      }).sort();
      expect(fallbackHumanObserverFrames).toHaveLength(1);
      expect(fallbackHumanObserverFrames[0]?.length).toBeGreaterThanOrEqual(2);
      expect(freshHumanHearingByResident).toEqual(fallbackHumanObserverFrames[0]);
      expect(fallbackPhysicalSampleCounts).toHaveLength(1);
      expect(fallbackPhysicalSampleCounts[0]).toBeLessThanOrEqual(8);
    } finally {
      runtime?.destroy();
      scheduledFrame = undefined;
      vi.doUnmock("./humanPerception");
      vi.resetModules();
    }
  }, 120_000);

  it("keeps an authentic REST active through a non-interrupting rabbit thump", async () => {
    const { runtime } = await createAlarmRuntime(-4, "marsh-rabbit");
    expect(runtime.getUIView().controls).toMatchObject({
      canRecover: true,
      recoveryActive: false,
      recoveryKind: "rest",
    });
    runtime.dispatchUI({ type: "recover", action: "begin" });
    expect(runtime.getUIView().controls).toMatchObject({
      recoveryActive: true,
      recoveryKind: "rest",
    });
    expect(runtime.getRenderView().player.recoveryKind).toBe("rest");
    soundscapePlay.mockClear();

    // Active recovery consumes one bounded ten-step fixed simulation batch.
    advanceWaitFrames(runtime, 1);

    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump"))
      .toHaveLength(1);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      text: "thump",
      presentationKind: "embodied-signal",
      assertive: false,
    });
    expect(runtime.getUIView().controls).toMatchObject({
      recoveryActive: true,
      recoveryKind: "rest",
    });
    expect(runtime.getRenderView().player.recoveryKind).toBe("rest");
    runtime.destroy();
    scheduledFrame = undefined;
  }, 45_000);

  it("routes an authentic gull alarm through shared Voice without legacy fallback or reload replay", async () => {
    const { runtime, repository, alarmActorId } = await createAlarmRuntime(-8, "gull");
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-gull-alarm-cry",
    ))
      .toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm"))
      .toEqual([]);
    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-deer-alarm-snort"
        || cue === "vocalization-fish-crow-alarm",
    )).toEqual([]);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "A bird",
      text: "CALL! CALL!",
      presentationKind: "animal-call",
      animalCallKind: "bird-call",
      assertive: true,
    });
    expect(runtime.getUIView().announcement?.message ?? "")
      .not.toContain("ANIMAL ALARM — source unclear.");

    await runtime.save();
    const saved = requiredEnvelope(repository);
    const gullAdmissions = saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (record): record is CoreWildlifeAlarmExpressionAdmissionRecord => (
        record.kind === "core-wildlife-alarm"
        && record.sourceSpecies === "gull"
      ),
    );
    expect(gullAdmissions).toHaveLength(1);
    expect(gullAdmissions[0]).toMatchObject({
      sourceActorId: alarmActorId,
      sourceSpecies: "gull",
      acceptedAtTick: deserializeWorld(saved.world).meta.completedTick,
    });
    const durableCarry = stableStringify(saved.perceptionCarry);

    runtime.destroy();
    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-gull-alarm-cry" || cue === "wildlife-alarm",
    )).toEqual([]);
    await resumed.save();
    expect(stableStringify(requiredEnvelope(repository).perceptionCarry))
      .toBe(durableCarry);
    resumed.destroy();
    scheduledFrame = undefined;
  }, 45_000);

  it.each(["elk", "wild-boar"] as const)("routes an authentic %s group alarm through shared Voice, interrupts WAIT, and reloads without replay", async (species) => {
    const { runtime, repository, alarmActorId } = await createAlarmRuntime(-8, species);
    const cue = species === "elk" ? "vocalization-elk-alarm-bark" : "vocalization-boar-grunt";
    const beforeTick = deserializeWorld(requiredEnvelope(repository).world).meta.completedTick;
    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === alarmActorId))
      .toBe(false);
    soundscapePlay.mockClear();
    runtime.dispatchUI({ type: "wait", action: "begin" });
    expect(runtime.getUIView().controls?.waitActive).toBe(true);
    advanceWaitFrames(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(([playedCue]) => playedCue === cue))
      .toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm"))
      .toEqual([]);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "An animal",
      text: "CALL!",
      presentationKind: "animal-call",
      animalCallKind: "animal-call",
      assertive: true,
    });
    expect(runtime.getUIView().announcement?.message ?? "")
      .not.toContain("ANIMAL ALARM — source unclear.");

    await runtime.save();
    const saved = requiredEnvelope(repository);
    expect(runtime.getUIView().controls?.waitActive).toBe(false);
    expect(deserializeWorld(saved.world).meta.completedTick).toBe(beforeTick + 1);
    expect(Object.hasOwn(saved, "pendingPlayerWait")).toBe(false);
    const core = requiredRegionalCoreOwner(saved, alarmActorId);
    const source = requiredCoreActor(core, alarmActorId);
    const admissions = saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (record): record is CoreWildlifeAlarmExpressionAdmissionRecord => (
        record.kind === "core-wildlife-alarm" && record.sourceSpecies === species
      ),
    );
    expect(admissions).toHaveLength(1);
    const admission = admissions[0];
    if (admission === undefined) throw new Error(`${species} fixture omitted its admission`);
    expect(admission).toMatchObject({
      sourceActorId: alarmActorId,
      sourceOwnerKey: core.patchKey,
      acceptedAtTick: deserializeWorld(saved.world).meta.completedTick,
    });
    expect(source.intent).toMatchObject({
      kind: "alarm",
      cause: { kind: "perception", referenceId: admission.sourceObservationId },
    });
    expect(saved.perceptionCarry.actorVocalizationSamples[admission.sampleOrdinal])
      .toMatchObject({
        sourceActorId: alarmActorId,
        expressionEventId: admission.eventId,
        soundClass: "animal-alarm",
        soundInterrupt: "strong",
      });
    const durableCarry = stableStringify(saved.perceptionCarry);
    runtime.destroy();
    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay.mock.calls.filter(([playedCue]) => (
      playedCue === cue || playedCue === "wildlife-alarm"
    ))).toEqual([]);
    await resumed.save();
    expect(stableStringify(requiredEnvelope(repository).perceptionCarry)).toBe(durableCarry);
    resumed.destroy();
    scheduledFrame = undefined;

    const wrongSpeciesCarry: CurrentPerceptionCarry = {
      ...saved.perceptionCarry,
      situatedExpressionAdmissions: {
        ...saved.perceptionCarry.situatedExpressionAdmissions,
        records: saved.perceptionCarry.situatedExpressionAdmissions.records.map((candidate) => (
          candidate.kind === "core-wildlife-alarm"
            && candidate.eventId === admission.eventId
            ? { ...candidate, sourceSpecies: "deer" as const }
            : candidate
        )),
      },
    };
    const tamperedRepository = new MemoryRepository(recordWithEnvelope(
      repository.snapshot(),
      resealedEnvelope(saved, { perceptionCarry: wrongSpeciesCarry }),
    ));
    const tamperedRecord = stableStringify(tamperedRepository.snapshot());
    const rejected = await createTideweftRuntime(tamperedRepository);
    expect(rejected.getUIView().title.hasSave).toBe(false);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    await expect(rejected.save()).rejects.toThrow(
      "Choose a seed before replacing the unreadable or conflicting local autosave.",
    );
    expect(stableStringify(tamperedRepository.snapshot())).toBe(tamperedRecord);
    rejected.destroy();
    scheduledFrame = undefined;
  }, 45_000);

  it.each(["elk", "wild-boar"] as const)("anchors an authentic %s call only with direct visible-source authority", async (species) => {
    const { runtime, alarmActorId } = await createAlarmRuntime(-4, species);
    const cue = species === "elk" ? "vocalization-elk-alarm-bark" : "vocalization-boar-grunt";
    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === alarmActorId))
      .toBe(true);
    soundscapePlay.mockClear();
    advancePlayerSteps(runtime, 10);
    expect(soundscapePlay.mock.calls.filter(([playedCue]) => playedCue === cue))
      .toHaveLength(1);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: species === "elk" ? "Elk" : "Wild boar",
      text: species === "elk" ? "BARK!" : "GRUNT!",
      animalCallKind: species === "elk" ? "elk-call" : "boar-call",
    });
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm"))
      .toEqual([]);
    runtime.destroy();
  }, 45_000);

  it.each(["elk", "wild-boar"] as const)("keeps an authentic out-of-hearing %s alarm in the world without player audio or text", async (species) => {
    const { runtime, repository, alarmActorId } = await createAlarmRuntime(-12, species);
    const presentations = vi.spyOn(acousticPresentationQueue, "admitWorldAcousticPresentation");
    const cue = species === "elk" ? "vocalization-elk-alarm-bark" : "vocalization-boar-grunt";
    soundscapePlay.mockClear();
    advancePlayerSteps(runtime, 10);
    expect(soundscapePlay.mock.calls.filter(([playedCue]) => (
      playedCue === cue || playedCue === "wildlife-alarm"
    ))).toEqual([]);
    expect(runtime.getUIView().expressionCaption?.animalCallKind)
      .not.toBe(species === "elk" ? "elk-call" : "boar-call");
    expect(runtime.getRenderView().expressions?.some(({ sourceActorId }) => (
      sourceActorId === alarmActorId
    ))).toBe(false);
    expect(presentations.mock.calls.filter(([, event]) => (
      event.sourceId === alarmActorId && event.soundClass === "animal-alarm"
    ))).toEqual([]);
    await runtime.save();
    const saved = requiredEnvelope(repository);
    const source = requiredCoreActor(requiredRegionalCoreOwner(saved, alarmActorId), alarmActorId);
    expect(source.intent.kind).toBe("alarm");
    runtime.destroy();
  }, 45_000);

  it("keeps a lawful boar grunt audible and interrupting when optional expression capacity is saturated", async () => {
    vi.resetModules();
    const fallbackHearingFrames: Array<{
      targetTick: number;
      jointSampleCount: number;
      samples: readonly import("./humanPerception").UnadmittedAlarmSoundSample[];
      receipts: Array<{ observerId: string; observationIds: string[] }>;
    }> = [];
    vi.doMock("./humanPerception", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./humanPerception")>();
      return {
        ...actual,
        HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES: 0,
        collectExistingHumanObservations: (
          input: Parameters<typeof actual.collectExistingHumanObservations>[0],
        ) => {
          const batches = actual.collectExistingHumanObservations(input);
          const samples = input.unadmittedAlarmSoundSamples ?? [];
          if (samples.length > 0) {
            fallbackHearingFrames.push({
              targetTick: input.targetTick,
              jointSampleCount: (input.physicalSoundSamples?.length ?? 0) + samples.length,
              samples,
              receipts: batches.flatMap((batch) => {
                const observationIds = batch.observations.filter((observation) => (
                  observation.channel === "hearing" && observation.perceivedClass === "animal-alarm"
                )).map(({ id }) => id);
                return observationIds.length > 0 ? [{ observerId: batch.observerId, observationIds }] : [];
              }),
            });
          }
          return batches;
        },
      };
    });
    let runtime: TideweftRuntime | null = null;
    try {
      const saturatedRuntimeModule = await import("./runtime");
      const fixture = await createAlarmRuntime(
        -4,
        "wild-boar",
        saturatedRuntimeModule.createTideweftRuntime,
      );
      runtime = fixture.runtime;
      soundscapePlay.mockClear();
      runtime.dispatchUI({ type: "wait", action: "begin" });
      expect(runtime.getUIView().controls?.waitActive).toBe(true);
      advanceWaitFrames(runtime, 10);

      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-boar-grunt"))
        .toHaveLength(1);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm"))
        .toEqual([]);
      expect(runtime.getUIView().controls?.waitActive).toBe(false);
      expect(runtime.getUIView().expressionCaption?.animalCallKind).not.toBe("boar-call");
      await runtime.save();
      const saved = requiredEnvelope(fixture.repository);
      const source = requiredCoreActor(
        requiredRegionalCoreOwner(saved, fixture.alarmActorId),
        fixture.alarmActorId,
      );
      expect(source.intent.kind).toBe("alarm");
      expect(saved.perceptionCarry.actorVocalizationSamples).toEqual([]);
      expect(saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
        (record) => record.kind === "core-wildlife-alarm" && record.sourceSpecies === "wild-boar",
      )).toEqual([]);
      expect(saved.perceptionCarry.situatedExpressionChannels.channels.some(
        ({ sourceActorId }) => sourceActorId === fixture.alarmActorId,
      )).toBe(false);
      // createAlarmRuntime adopts protected legacy cohort bodies into the
      // current50 roots; it is an honest controlled current-consumer fixture,
      // not a fresh-native population or ordinary-travel encounter claim.
      const sourceWorld = deserializeWorld(saved.world);
      const alarmMemory = source.memories.find(({ kind, atTick, eventPosition }) => (
        kind === "alarm" && atTick === sourceWorld.meta.completedTick && eventPosition !== undefined
      ));
      if (alarmMemory?.eventPosition === undefined) throw new Error("Boar fixture lost its committed event locus");
      const porterActorId = deserializeBio0Ecology(saved.bio0Ecology)?.porterAddress.actorId;
      const sourceView = createWorldView(sourceWorld);
      const ordinaryListener = sourceWorld.residents.find((resident) => {
        if (resident.identity.stableId === porterActorId) return false;
        const placement = resolveResidentWorldPlacement(sourceView, resident);
        if (placement === null) return false;
        const delta = worldPositionDelta(placement.position, alarmMemory.eventPosition!);
        return Math.hypot(delta.x, delta.y) < 7_000;
      });
      if (ordinaryListener === undefined) throw new Error("Boar fixture lacks a real nearby non-porter resident");
      const targetTick = sourceWorld.meta.completedTick + 1;
      const alarmHash = hashCanonical({
        domain: "core-wildlife-alarm-hearing:v1", eventId: alarmMemory.eventId,
        sourceActorId: fixture.alarmActorId, species: source.identity.species,
      });
      const sampleId = `caa-${alarmHash}`;
      const ordinaryObservationId = `hp-h-${targetTick}-${ordinaryListener.id}-${sampleId}`;
      const porter = sourceWorld.residents.find(({ identity }) => identity.stableId === porterActorId);
      if (porter === undefined) throw new Error("Boar fixture lost its existing porter resident");
      const porterObservationId = `hp-h-${targetTick}-${porter.id}-${sampleId}`;

      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      soundscapePlay.mockClear();
      runtime = await saturatedRuntimeModule.createTideweftRuntime(fixture.repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(runtime.getUIView().expressionCaption).toBeUndefined();
      expect(soundscapePlay.mock.calls.filter(([cue]) => (
        cue === "vocalization-boar-grunt" || cue === "wildlife-alarm"
      ))).toEqual([]);

      // Ecology retains the committed alarm for bounded T+1 hearing even
      // when optional Voice admission is full. Reload is not a replay trigger.
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const propagated = deserializeWorld(requiredEnvelope(fixture.repository).world);
      expect(propagated.meta.completedTick, runtime.getUIView().announcement?.message).toBe(targetTick);
      const ordinaryHearing = propagated.residents.find(({ identity }) => (
        identity.stableId === ordinaryListener.identity.stableId
      ))?.perception.beliefs.filter(({ channel, lastObservedTick, perceivedClass }) => (
        channel === "hearing" && lastObservedTick === targetTick && perceivedClass === "animal-alarm"
      )) ?? [];
      expect(ordinaryHearing).toHaveLength(1);
      expect(ordinaryHearing[0]).toMatchObject({
        sourceObservationId: ordinaryObservationId, channel: "hearing", perceivedClass: "animal-alarm",
        subjectId: null, identification: "anonymous", firstObservedTick: targetTick,
        lastObservedTick: targetTick, strongInterrupt: true,
      });
      expect(fallbackHearingFrames).toHaveLength(1);
      const fallbackFrame = fallbackHearingFrames[0];
      expect(fallbackFrame?.targetTick).toBe(targetTick);
      expect(fallbackFrame?.jointSampleCount).toBeLessThanOrEqual(8);
      expect(fallbackFrame?.samples).toHaveLength(1);
      expect(fallbackFrame?.samples[0]).toMatchObject({
        id: sampleId, acousticEventId: alarmMemory.eventId,
        sourceActorId: fixture.alarmActorId, position: alarmMemory.eventPosition,
        soundClass: "animal-alarm", soundInterrupt: "strong",
      });
      expect(fallbackFrame?.samples[0]).not.toHaveProperty("expressionEventId");
      expect(fallbackFrame?.receipts).toContainEqual({
        observerId: ordinaryListener.identity.stableId, observationIds: [ordinaryObservationId],
      });
      expect(fallbackFrame?.receipts).toContainEqual({
        observerId: porter.identity.stableId, observationIds: [porterObservationId],
      });
      const porterHearing = propagated.residents.find(({ identity }) => (
        identity.stableId === porter.identity.stableId
      ))?.perception.beliefs.filter(({ channel, lastObservedTick, perceivedClass }) => (
        channel === "hearing" && lastObservedTick === targetTick && perceivedClass === "animal-alarm"
      )) ?? [];
      // Only the selected shared sample replaces this event's raw porter leg;
      // the porter and the ordinary resident receive the same acoustic fact.
      expect(porterHearing).toHaveLength(1);
      expect(porterHearing[0]).toMatchObject({
        sourceObservationId: porterObservationId, channel: "hearing", perceivedClass: "animal-alarm",
        subjectId: null, identification: "anonymous", strongInterrupt: true,
      });
      expect(porterHearing[0]?.sourceObservationId).not.toBe(`alarm:${hashCanonical([
        alarmMemory.eventId, porter.identity.stableId, targetTick,
      ])}`);
      expect(soundscapePlay.mock.calls.filter(([cue]) => (
        cue === "vocalization-boar-grunt" || cue === "wildlife-alarm"
      ))).toEqual([]);
      const humanAlarmBeliefs = propagated.residents.flatMap((resident) => {
        const matching = resident.perception.beliefs.filter((belief) => (
          belief.channel === "hearing"
          && belief.lastObservedTick === propagated.meta.completedTick
          && belief.perceivedClass === "animal-alarm"
        ));
        expect(matching.length).toBeLessThanOrEqual(1);
        expect(matching.every(({ identification, subjectId }) => (
          identification === "anonymous" && subjectId === null
        ))).toBe(true);
        return matching;
      });
      expect(humanAlarmBeliefs.length).toBeGreaterThanOrEqual(1);
      const propagatedEnvelope = requiredEnvelope(fixture.repository);
      expect(propagatedEnvelope.perceptionCarry).not.toHaveProperty("unadmittedAlarmSoundSamples");
      const hearingStateBeforeReload = propagated.residents.map(({ identity, perception }) => ({
        actorId: identity.stableId, perception,
      }));
      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      soundscapePlay.mockClear();
      runtime = await saturatedRuntimeModule.createTideweftRuntime(fixture.repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(soundscapePlay.mock.calls.filter(([cue]) => (
        cue === "vocalization-boar-grunt" || cue === "wildlife-alarm"
      ))).toEqual([]);
      await runtime.save();
      const restored = deserializeWorld(requiredEnvelope(fixture.repository).world);
      expect(restored.residents.map(({ identity, perception }) => ({
        actorId: identity.stableId, perception,
      }))).toEqual(hearingStateBeforeReload);
      // Consumed T+1 hearing persists; loading neither runs another sensory
      // interval nor carries the transient refused-expression stimulus forward.
      expect(fallbackHearingFrames).toHaveLength(1);
    } finally {
      runtime?.destroy();
      scheduledFrame = undefined;
      vi.doUnmock("./humanPerception");
      vi.resetModules();
    }
  }, 120_000);

  it("restores pending alarm hearing with real listener-local water masking without replaying audio", async () => {
    const propagateAlarm = coreEcologyPerception.propagateCoreEcologyAlarmObservationBatches;
    let sourceId: string | null = null;
    const contacts: Array<{
      eventId: string;
      observedAtTick: number;
      sourceAtTick: number;
      masking: number;
      actual: AudibleContact | null;
      expected: AudibleContact | null;
      observations: readonly ActorObservation[];
    }> = [];
    vi.spyOn(coreEcologyPerception, "propagateCoreEcologyAlarmObservationBatches")
      .mockImplementation((...args) => {
        const batches = propagateAlarm(...args);
        const event = args[0] as CoreWildlifeCausalEvent;
        if (event.actorId !== sourceId || batches === null) return batches;
        const input = args[1] as coreEcologyPerception.CoreEcologyPerceptionFrameInput;
        const listener = input.participants?.find(({ address }) => (
          address.actorId === LOCAL_PLAYER_SUBJECT_ID
        ))?.address;
        const placement = listener === undefined ? null
          : livingActorAddressInRegionalWindow(listener, input.window);
        const actual = batches.find(({ observerId }) => observerId === LOCAL_PLAYER_SUBJECT_ID);
        if (listener === undefined || placement === null || actual === undefined) {
          throw new Error("Water-mask witness lost its registered real player listener");
        }
        const masking = ambientNoiseAt(input.world, placement.tileIndex);
        if (masking === null) throw new Error("Water-mask witness lost valid physical water");
        const source = worldPositionDelta(listener.position, event.position);
        const hearing = livingActorSenseProfile(listener.species).hearingSensitivity;
        const emission = coreEcologyAlarmSignalProfile(event.species);
        contacts.push(structuredClone({
          eventId: event.eventId,
          observedAtTick: input.tick,
          sourceAtTick: event.atTick,
          masking,
          actual: actual.audibleContact,
          expected: evaluateAudibleContact({
            listener: { x: 0, y: 0 }, source,
            baseRange: Math.floor(coreEcologyPerception.CORE_ECOLOGY_ALARM_MAX_RANGE_UNITS
              * hearing / ACTOR_PERCEPTION_SCALE),
            ambientNoise: masking,
            sourceLoudness: emission.sourceLoudness / FIXED_POINT,
            wind: { x: input.world.weather.windX / FIXED_POINT,
              y: input.world.weather.windY / FIXED_POINT },
          }),
          observations: actual.observations,
        }));
        return batches;
      });
    // Extend the existing controlled legacy-cohort/current50 fixture only with
    // one physical water tile beside the stationary courier. The actor's real
    // perception/cognition still commits the alarm; no sound is injected.
    const fixture = await createAlarmRuntime(-4, "deer", createTideweftRuntime, true);
    const { runtime, repository, alarmActorId } = fixture;
    sourceId = alarmActorId;
    let resumed: TideweftRuntime | undefined;
    try {
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const checkpointRecord = repository.snapshot();
      const checkpoint = requiredEnvelope(repository);
      const checkpointTick = deserializeWorld(checkpoint.world).meta.completedTick;
      const fresh = contacts.filter(({ sourceAtTick, observedAtTick }) => (
        sourceAtTick === checkpointTick && observedAtTick === checkpointTick
      ));
      expect(fresh).toHaveLength(1);
      expect(fresh[0]!.masking).toBeGreaterThan(0);
      expect(fresh[0]!.actual).toEqual(fresh[0]!.expected);
      const source = requiredCoreActor(requiredRegionalCoreOwner(checkpoint, alarmActorId), alarmActorId);
      expect(source.memories).toContainEqual(expect.objectContaining({
        eventId: fresh[0]!.eventId, kind: "alarm", atTick: checkpointTick,
      }));
      const authoritativeRoots = (envelope: CurrentEnvelope) => {
        // Session publication and its enclosing seal are not authoritative
        // world roots. Every other saved field, including travel, is compared.
        const { session: _session, integrity: _seal, ...roots } = envelope;
        return roots;
      };
      contacts.length = 0;
      soundscapePlay.mockClear();
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const uninterrupted = requiredEnvelope(repository);
      const hotContacts = structuredClone(contacts);
      expect(deserializeWorld(uninterrupted.world).meta.completedTick).toBe(checkpointTick + 1);
      expect(hotContacts).toHaveLength(1);
      expect(hotContacts[0]).toMatchObject({
        eventId: fresh[0]!.eventId, sourceAtTick: checkpointTick, observedAtTick: checkpointTick + 1,
      });
      expect(hotContacts[0]!.masking).toBeGreaterThan(0);
      expect(hotContacts[0]!.actual).toEqual(hotContacts[0]!.expected);
      const hotAudio = structuredClone(soundscapePlay.mock.calls);
      runtime.destroy();
      scheduledFrame = undefined;
      contacts.length = 0;
      soundscapePlay.mockClear();
      const reloadedRepository = new MemoryRepository(checkpointRecord);
      resumed = await createTideweftRuntime(reloadedRepository);
      expect(resumed.getUIView().saveWarning).toBeUndefined();
      expect(soundscapePlay.mock.calls).toEqual([]);
      await resumed.save();
      expect(authoritativeRoots(requiredEnvelope(reloadedRepository)))
        .toEqual(authoritativeRoots(checkpoint));
      advancePlayerSteps(resumed, 10);
      await resumed.save();
      expect(contacts).toEqual(hotContacts);
      expect(soundscapePlay.mock.calls).toEqual(hotAudio);
      expect(authoritativeRoots(requiredEnvelope(reloadedRepository)))
        .toEqual(authoritativeRoots(uninterrupted));
    } finally {
      runtime.destroy();
      resumed?.destroy();
      scheduledFrame = undefined;
    }
  }, 120_000);

  it("preserves ordinary hearing of a fresh deer alarm from a genuinely remembered threat", async () => {
    const collectVisual = coreEcologyPerception.collectCoreEcologyVisualObservationBatches;
    const admitPresentation = acousticPresentationQueue.admitWorldAcousticPresentation;
    const refusedPresentations: WorldAcousticEvent[] = [];
    let obscuredSourceId: string | null = null;
    vi.spyOn(acousticPresentationQueue, "admitWorldAcousticPresentation")
      .mockImplementation((active, event, reception) => {
        if (event.sourceId === obscuredSourceId && event.soundClass === "animal-alarm") {
          refusedPresentations.push(event);
          return active;
        }
        return admitPresentation(active, event, reception);
      });
    vi.spyOn(coreEcologyPerception, "collectCoreEcologyVisualObservationBatches")
      .mockImplementation((input) => {
        const batches = collectVisual(input);
        if (batches === null || obscuredSourceId === null) return batches;
        // Remove only new visual receipts for this source after its real first
        // sighting. No threat, event, memory, or observation is manufactured.
        return Object.freeze(batches.map((batch) => batch.observerId !== obscuredSourceId
          ? batch
          : Object.freeze({
              ...batch,
              observations: Object.freeze(batch.observations.filter(({ channel }) => channel !== "vision")),
            })));
      });
    const fixture = await createAlarmRuntime(-4, "deer");
    let runtime = fixture.runtime;
    const { repository, alarmActorId } = fixture;
    try {
      // This is the existing controlled legacy-cohort adoption/current50
      // consumer fixture, not a new native population or travel encounter.
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const firstEnvelope = requiredEnvelope(repository);
      const firstWorld = deserializeWorld(firstEnvelope.world);
      const firstSource = requiredCoreActor(requiredRegionalCoreOwner(firstEnvelope, alarmActorId), alarmActorId);
      const firstAlarm = firstSource.memories.find(({ kind, atTick, eventPosition }) => (
        kind === "alarm" && atTick === firstWorld.meta.completedTick && eventPosition !== undefined
      ));
      if (firstAlarm === undefined || firstAlarm.observationId === null) {
        throw new Error("Remembered deer fixture lost its real initial alarm and sighting");
      }
      const firstThreat = firstSource.perception.beliefs.find(({ sourceObservationId }) => (
        sourceObservationId === firstAlarm.observationId
      ));
      expect(firstThreat).toMatchObject({ channel: "vision", lastObservedTick: firstWorld.meta.completedTick });
      obscuredSourceId = alarmActorId;

      // Core cognition's four-tick alarm cooldown is inclusive: the first
      // lawful repeat is T+5, after the existing threat belief has aged.
      soundscapePlay.mockClear();
      advancePlayerSteps(runtime, 50);
      await runtime.save();
      const repeatedEnvelope = requiredEnvelope(repository);
      const repeatedWorld = deserializeWorld(repeatedEnvelope.world);
      expect(repeatedWorld.meta.completedTick, runtime.getUIView().announcement?.message)
        .toBe(firstWorld.meta.completedTick + 5);
      const repeatedSource = requiredCoreActor(
        requiredRegionalCoreOwner(repeatedEnvelope, alarmActorId), alarmActorId,
      );
      const repeatedAlarm = repeatedSource.memories.find(({ kind, atTick, eventPosition }) => (
        kind === "alarm" && atTick === repeatedWorld.meta.completedTick && eventPosition !== undefined
      ));
      if (repeatedAlarm?.eventPosition === undefined) {
        throw new Error("Existing deer cognition did not emit its remembered-threat repeat");
      }
      expect(repeatedAlarm.eventId).not.toBe(firstAlarm.eventId);
      expect(repeatedAlarm.observationId).toBe(firstAlarm.observationId);
      // Optional text refusal is independent of the real acoustic event and
      // next-interval hearing. Refuse only this source's authentic carrier,
      // never a fabricated crowd, observation, event or expression admission.
      const refusedRepeat = refusedPresentations.filter(({ triggerEventId }) => (
        triggerEventId === repeatedAlarm.eventId
      ));
      expect(refusedRepeat).toHaveLength(1);
      expect(refusedRepeat[0]).toMatchObject({
        sourceId: alarmActorId, occurredAtTick: repeatedWorld.meta.completedTick,
        soundClass: "animal-alarm", interrupt: "strong",
      });
      expect(runtime.getUIView().expressionCaption?.id).not.toBe(refusedRepeat[0]?.eventId);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm"))
        .toEqual([["wildlife-alarm", 0.44, 0, undefined]]);
      expect(repeatedSource.perception.beliefs.find(({ sourceObservationId }) => (
        sourceObservationId === firstAlarm.observationId
      ))?.lastObservedTick).toBe(firstWorld.meta.completedTick);
      expect(repeatedSource.intent.kind).toBe("alarm");
      const repeatedView = createWorldView(repeatedWorld);
      const porterId = deserializeBio0Ecology(repeatedEnvelope.bio0Ecology)?.porterAddress.actorId;
      const listener = repeatedWorld.residents.find(({ activeContractId, identity }) => (
        activeContractId === null && identity.stableId !== porterId
      ));
      if (listener === undefined) throw new Error("Remembered deer fixture lacks an existing free ordinary resident");
      // The deer fled away from the residents' original points. Preserve one
      // actual person's identity/knowledge and stage only their current route
      // location on a real generated segment, as the existing goat fixture
      // does. This is controlled placement, not an ordinary travel claim.
      let routePlacement: { routeId: number; progress: number; distance: number } | undefined;
      for (const route of repeatedWorld.routes) {
        if (route.path.length < 2) continue;
        for (const [offset, tileIndex] of route.path.entries()) {
          const tile = repeatedView.terrain.tiles[tileIndex];
          if (tile === undefined) continue;
          const point = createWorldPosition(
            { x: 0, y: 0 },
            Math.round((tile.x + 0.5) * WORLD_POSITION_UNITS_PER_TILE),
            Math.round((tile.y + 0.5) * WORLD_POSITION_UNITS_PER_TILE),
          );
          const delta = worldPositionDelta(point, repeatedAlarm.eventPosition);
          const distance = Math.hypot(delta.x, delta.y);
          if (routePlacement === undefined || distance < routePlacement.distance) routePlacement = {
            routeId: route.id, progress: Math.round(offset * FIXED_POINT / (route.path.length - 1)), distance,
          };
        }
      }
      if (routePlacement === undefined || routePlacement.distance >= 7_000) {
        throw new Error("Remembered deer fixture lacks a real nearby route segment");
      }
      listener.location = { kind: "route", routeId: routePlacement.routeId, progress: routePlacement.progress };
      if (listener.circadian !== undefined) {
        // Use the same destination-loss reconciliation as simulation contract
        // advance: route placement cannot retain a settlement-arrival receipt.
        const current = listener.circadian;
        repeatedWorld.residents[repeatedWorld.residents.indexOf(listener)] = replaceResidentCircadian(listener, {
          atTick: repeatedWorld.meta.completedTick,
          circadian: {
            ...current,
            restDestinationArrived: false,
            posture: current.posture.state === "resting" || current.posture.state === "asleep"
              ? { state: "awake", enteredAtTick: repeatedWorld.meta.completedTick }
              : current.posture,
          },
        });
      }
      assertWorldInvariants(repeatedWorld);
      const listenerPlacement = resolveResidentWorldPlacement(createWorldView(repeatedWorld), listener);
      if (listenerPlacement === null) throw new Error("Remembered deer listener lost its actual route placement");
      const listenerDelta = worldPositionDelta(listenerPlacement.position, repeatedAlarm.eventPosition);
      expect(Math.hypot(listenerDelta.x, listenerDelta.y)).toBeLessThan(7_000);
      const stagedEnvelope = resealedCurrentEnvelopeWithCorePatch(
        repeatedEnvelope, requiredRegionalCoreOwner(repeatedEnvelope, alarmActorId),
        { world: serializeWorld(repeatedWorld) },
      );
      expect(requiredCoreActor(requiredRegionalCoreOwner(stagedEnvelope, alarmActorId), alarmActorId))
        .toEqual(repeatedSource);
      runtime.destroy();
      scheduledFrame = undefined;
      await repository.save(recordWithEnvelope(repository.snapshot(), stagedEnvelope));
      runtime = await createTideweftRuntime(repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      const hearingTick = repeatedWorld.meta.completedTick + 1;

      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const heardWorld = deserializeWorld(requiredEnvelope(repository).world);
      expect(heardWorld.meta.completedTick, runtime.getUIView().announcement?.message).toBe(hearingTick);
      const hearingId = `hp-h-${hearingTick}-${listener.id}-caa-${hashCanonical({
        domain: "core-wildlife-alarm-hearing:v1", eventId: repeatedAlarm.eventId,
        sourceActorId: alarmActorId, species: "deer",
      })}`;
      const freshHearing = heardWorld.residents.find(({ identity }) => (
        identity.stableId === listener.identity.stableId
      ))?.perception.beliefs.filter(({ channel, lastObservedTick, perceivedClass }) => (
        channel === "hearing" && lastObservedTick === hearingTick && perceivedClass === "animal-alarm"
      )) ?? [];
      expect(freshHearing).toHaveLength(1);
      expect(freshHearing[0]).toMatchObject({
        sourceObservationId: hearingId, channel: "hearing", perceivedClass: "animal-alarm",
        subjectId: null, identification: "anonymous", strongInterrupt: true,
      });
    } finally {
      runtime.destroy();
      scheduledFrame = undefined;
    }
  }, 120_000);

  it.each([[false, false], [true, false], [false, true]] as const)("releases a real remembered-threat player alarm only after successful closure (failure=%s, caption refusal=%s)", async (failClosure, refuseCaption) => {
    const fixture = await createRememberedDeerPlayerAlarmRuntime();
    const { runtime, repository, alarmActorId, firstObservedTick, threatObservationId, playerAlarmReceipts } = fixture;
    const targetTick = firstObservedTick + 5;
    const admittedPresentations: Array<{
      event: WorldAcousticEvent;
      reception: WorldAcousticPresentationReception;
      retained: boolean;
    }> = [];
    const admitPresentation = acousticPresentationQueue.admitWorldAcousticPresentation;
    vi.spyOn(acousticPresentationQueue, "admitWorldAcousticPresentation")
      .mockImplementation((active, event, reception) => {
        const target = event.sourceId === alarmActorId && event.occurredAtTick === targetTick
          && event.soundClass === "animal-alarm";
        // Refuse only this optional caption. The actual domain event, acoustic
        // contact, hearing, interruption and committed audio remain untouched.
        const next = target && refuseCaption ? active : admitPresentation(active, event, reception);
        if (target) admittedPresentations.push({
          event, reception, retained: next.some(({ event: retained }) => retained.eventId === event.eventId),
        });
        return next;
      });
    try {
      // The fixture is at T+4/phase nine without another save or player
      // relocation. Only the last step asks cognition to emit its real T+5
      // repeat; the prior valid persisted first-alarm checkpoint stays intact.
      const baselineRecord = repository.snapshot();
      const baseline = requiredEnvelope(repository);
      const priorRender = runtime.getRenderView();
      const priorPlayer = structuredClone(priorRender.player);
      expect(deserializeWorld(baseline.world).meta.completedTick).toBe(firstObservedTick);
      expect(priorRender.tick).toBe(firstObservedTick + 4);
      const priorSource = requiredCoreActor(requiredRegionalCoreOwner(baseline, alarmActorId), alarmActorId);
      expect(priorSource.perception.beliefs.find(({ sourceObservationId }) => (
        sourceObservationId === threatObservationId
      ))?.lastObservedTick).toBe(firstObservedTick);
      if (failClosure) vi.spyOn(situatedExpressionChannels, "closeSituatedExpressionChannelBankInterval")
        .mockReturnValueOnce(null);
      soundscapePlay.mockClear();
      playerAlarmReceipts.length = 0;

      advancePlayerSteps(runtime, 1);
      await Promise.resolve();

      const dueReceipts = playerAlarmReceipts.filter(({ event }) => event.atTick === targetTick);
      expect(dueReceipts).toHaveLength(1);
      expect(dueReceipts[0]?.event).toMatchObject({
        kind: "alarm", actorId: alarmActorId, species: "deer", observationId: threatObservationId,
      });
      expect(dueReceipts[0]?.observations).toHaveLength(1);
      expect(dueReceipts[0]?.observations[0]).toMatchObject({
        observerId: LOCAL_PLAYER_SUBJECT_ID, observedAtTick: targetTick,
        channel: "hearing", perceivedClass: "animal-alarm", subjectId: null,
        identification: "anonymous", interrupt: "strong",
      });
      const audibleContact = dueReceipts[0]?.audibleContact;
      if (audibleContact === null || audibleContact === undefined) {
        throw new Error("Real remembered alarm lost its native anonymous hearing contact");
      }
      expect(admittedPresentations).toHaveLength(1);
      const presentation = admittedPresentations[0]!;
      expect(presentation.event).toMatchObject({
        triggerEventId: dueReceipts[0]?.event.eventId, sourceId: alarmActorId,
        domain: "actor-vocalization", sourceCategory: "animal", action: "vocalize",
        semanticFamily: "vocalization", soundClass: "animal-alarm", interrupt: "strong",
        occurredAtTick: targetTick, priority: 720_000, durationSteps: 6,
        accessibilityRelevance: "urgent",
      });
      expect(presentation.reception).toMatchObject({
        kind: "heard-unseen", directVisualReceipt: false, contact: audibleContact,
      });
      expect(presentation.reception).not.toHaveProperty("position");
      expect(presentation.reception).not.toHaveProperty("sourcePosition");
      expect(presentation.retained).toBe(!refuseCaption);
      expect(runtime.getRenderView().acousticText?.some(({ id }) => (
        id === presentation.event.eventId
      ))).not.toBe(true);
      const playerCues = soundscapePlay.mock.calls.filter(([cue]) => (
        cue === "wildlife-alarm" || cue === "vocalization-deer-alarm-snort"
      ));
      if (failClosure) {
        expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
        expect(playerCues).toEqual([]);
        expect(repository.snapshot()).toEqual(baselineRecord);
        expect(runtime.getRenderView().tick).toBe(priorRender.tick);
        const { active: _priorActive, ...priorPhysicalPlayer } = priorPlayer;
        const { active, ...restoredPhysicalPlayer } = runtime.getRenderView().player;
        expect(active).toBe(false);
        expect(restoredPhysicalPlayer).toEqual(priorPhysicalPlayer);
        expect(runtime.getUIView().expressionCaption?.id).not.toBe(presentation.event.eventId);
      } else {
        expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
        expect(playerCues).toEqual([["wildlife-alarm", 0.44, 0, undefined]]);
        expect(runtime.getUIView().announcement?.message).not.toContain("ANIMAL ALARM");
        const caption = runtime.getUIView().expressionCaption;
        // This real scene also produces an actual human warning. Its greater
        // priority wins the shared caption slot with or without optional alarm
        // text; never suppress that warning or inflate the alarm to force a win.
        expect(caption).toMatchObject({
          speakerLabel: "Someone", text: "Heads up!", presentationKind: "speech",
          directionLabel: "east", assertive: true,
        });
        expect(caption?.id).not.toBe(presentation.event.eventId);
        await runtime.save();
        const completed = requiredEnvelope(repository);
        expect(deserializeWorld(completed.world).meta.completedTick).toBe(targetTick);
        const warning = completed.perceptionCarry.situatedExpressionChannels.channels
          .find(({ state }) => state.active?.eventId === caption?.id)?.state.active;
        expect(warning?.meaning).toBe("human-danger-warning");
        expect(warning?.priority).toBeGreaterThan(presentation.event.priority);
        const source = requiredCoreActor(requiredRegionalCoreOwner(completed, alarmActorId), alarmActorId);
        expect(source.memories).toContainEqual(expect.objectContaining({
          kind: "alarm", atTick: targetTick, observationId: threatObservationId,
          eventId: dueReceipts[0]?.event.eventId, eventPosition: dueReceipts[0]?.event.position,
        }));
        expect(source.perception.beliefs.find(({ sourceObservationId }) => (
          sourceObservationId === threatObservationId
        ))?.lastObservedTick).toBe(firstObservedTick);
        // This anonymous shared carrier is ephemeral presentation, not another
        // saved Voice admission. Its real domain alarm and hearing still persist.
        expect(JSON.stringify(completed)).not.toContain(presentation.event.eventId);
        runtime.destroy();
        scheduledFrame = undefined;
        soundscapePlay.mockClear();
        const resumed = await createTideweftRuntime(repository);
        try {
          expect(resumed.getUIView().saveWarning).toBeUndefined();
          expect(resumed.getUIView().expressionCaption?.id).not.toBe(presentation.event.eventId);
          expect(resumed.getRenderView().acousticText?.some(({ id }) => (
            id === presentation.event.eventId
          ))).not.toBe(true);
          expect(soundscapePlay.mock.calls).toEqual([]);
          await resumed.save();
          const restored = requiredEnvelope(repository);
          expect(restored.world).toBe(completed.world);
          expect(restored.regionalEcology).toBe(completed.regionalEcology);
          expect(restored.player).toEqual(completed.player);
          expect(restored.physicalCargo).toEqual(completed.physicalCargo);
          expect(restored.perceptionCarry).toEqual(completed.perceptionCarry);
          expect(soundscapePlay.mock.calls).toEqual([]);
        } finally {
          resumed.destroy();
          scheduledFrame = undefined;
        }
      }
    } finally {
      runtime.destroy();
      scheduledFrame = undefined;
    }
  }, 120_000);

  it("saves a real completed remembered-threat interval at phase zero", async () => {
    const { runtime, repository, alarmActorId, firstObservedTick } = await createRememberedDeerPlayerAlarmRuntime(40);
    try {
      expect(runtime.getRenderView().tick).toBe(firstObservedTick + 4);
      expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
      const trajectory = vi.spyOn(expressionTrajectory, "canonicalizeSituatedExpressionTrajectory");
      const priorRecord = repository.snapshot();
      let saveError: unknown;
      try { await runtime.save(); } catch (error) { saveError = error; }
      const actualTrajectory = trajectory.mock.results.at(-1)?.value;
      expect(trajectory.mock.calls.at(-1)?.[2]).toBe(0);
      expect(actualTrajectory).not.toBeNull();
      // The obscured source retains its old real threat. A different existing
      // herd member genuinely sees the bear and emits the new T+4 alarm.
      const admission = actualTrajectory?.admissionLedger.records[0];
      expect(actualTrajectory?.admissionLedger.records).toHaveLength(1);
      expect(admission?.sourceActorId).not.toBe(alarmActorId);
      expect(admission).toMatchObject({ kind: "core-wildlife-alarm", acceptedAtTick: firstObservedTick + 4 });
      if (saveError !== undefined) expect(repository.snapshot()).toEqual(priorRecord);
      expect(saveError).toBeUndefined();
      const completed = requiredEnvelope(repository);
      expect(deserializeWorld(completed.world).meta.completedTick).toBe(firstObservedTick + 4);
      expect(completed.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
      expect(completed.perceptionCarry.playerSenseSamples).toEqual([]);
      expect(completed.perceptionCarry.situatedExpressionChannels).toEqual(actualTrajectory?.bank);
      expect(completed.perceptionCarry.situatedExpressionAdmissions).toEqual(actualTrajectory?.admissionLedger);
      expect(completed.perceptionCarry.actorVocalizationSamples).toEqual(actualTrajectory?.supplementalSoundSamples);
      const channel = completed.perceptionCarry.situatedExpressionChannels.channels.find(({ sourceActorId }) => (
        sourceActorId === admission?.sourceActorId
      ));
      const event = channel?.state.active;
      if (channel?.reception?.kind !== "heard-unseen" || event === null || event === undefined) {
        throw new Error("Completed deer interval lost its authentic unseen active call");
      }
      const world = deserializeWorld(completed.world);
      const travel = restorePlayerRegionalTravel(world.meta.rootSeed, completed.player, completed.regionalTravel);
      if (travel === null) throw new Error("Completed deer interval lost its current regional listener frame");
      const active = projectRegionalEcologyStateV6ActiveState(requiredRegionalEcologyV6(completed), {
        origin: travel.window.origin,
        terrain: { width: travel.window.terrain.width, height: travel.window.terrain.height },
      });
      const sourceOwner = active?.base.base.base.base.base.residents.find(({ sourceKey }) => (
        sourceKey === (admission?.kind === "core-wildlife-alarm" ? admission.sourceOwnerKey : null)
      ));
      if (sourceOwner === undefined) throw new Error("Completed deer interval lost its authenticated active source");
      const source = requiredCoreActor(sourceOwner.patch, event.sourceActorId);
      expect(source.address.position).not.toEqual(event.position);
      const spatial = createRegionalWorldView(createWorldView(world), travel.window, {
        discovered: completed.player.discovered, depthSoundings: completed.player.depthSoundings,
      }, { immutable: true });
      // The old acoustic locus is directly visible, but the actual source
      // body is elsewhere. That empty visible point cannot identify the call.
      expect(isWildlifeWorldPositionDirectlyObserved(event.position, {
        window: { origin: travel.window.origin, terrain: {
          width: travel.window.terrain.width, height: travel.window.terrain.height,
        } },
        perception: projectPerception(spatial, completed.player),
      })).toBe(true);
      runtime.destroy();
      scheduledFrame = undefined;
      soundscapePlay.mockClear();
      const resumed = await createTideweftRuntime(repository);
      try {
        expect(resumed.getUIView().saveWarning).toBeUndefined();
        expect(soundscapePlay.mock.calls).toEqual([]);
        await resumed.save();
        expect(requiredEnvelope(repository).perceptionCarry).toEqual(completed.perceptionCarry);
        expect(soundscapePlay.mock.calls).toEqual([]);
      } finally {
        resumed.destroy();
        scheduledFrame = undefined;
      }

      const forgedVisible = createHeardVisibleSituatedExpressionReception(
        event, world.meta.completedTick, channel.reception.certainty, true,
      );
      if (forgedVisible === null) throw new Error("Visible-receipt counterfactual must have valid public receipt shape");
      const forgedCarry: CurrentPerceptionCarry = {
        ...completed.perceptionCarry,
        situatedExpressionChannels: {
          ...completed.perceptionCarry.situatedExpressionChannels,
          channels: completed.perceptionCarry.situatedExpressionChannels.channels.map((candidate) => (
            candidate.sourceActorId === event.sourceActorId ? { ...candidate, reception: forgedVisible } : candidate
          )),
        },
      };
      const forgedRepository = new MemoryRepository(recordWithEnvelope(
        repository.snapshot(), resealedEnvelope(completed, { perceptionCarry: forgedCarry }),
      ));
      const forgedRecord = forgedRepository.snapshot();
      soundscapePlay.mockClear();
      const rejected = await createTideweftRuntime(forgedRepository);
      try {
        expect(rejected.getUIView().title.hasSave).toBe(false);
        expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
        expect(soundscapePlay.mock.calls).toEqual([]);
        await expect(rejected.save()).rejects.toThrow(
          "Choose a seed before replacing the unreadable or conflicting local autosave.",
        );
        expect(forgedRepository.snapshot()).toEqual(forgedRecord);
      } finally {
        rejected.destroy();
        scheduledFrame = undefined;
      }
    } finally {
      runtime.destroy();
      scheduledFrame = undefined;
    }
  }, 120_000);

  it("composes real warning, guardian bark, fall and acquired cargo without suppressing NPC hearing", async () => {
    const { runtime, repository, crowActorId, guardianActorId, promiseLot } = await createFishCrowAlarmRuntime(
      "guardian-work",
    );
    const observations = vi.spyOn(humanPerception, "collectExistingHumanObservations");
    try {
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const first = requiredEnvelope(repository);
      const firstRoster = deserializeDogActorRoster(first.dogActorRoster);
      const firstGuardian = firstRoster?.actors.find(({ identity }) => (
        identity.stableId === guardianActorId
      ));
      expect(firstGuardian?.intent.kind).toBe("observe");
      const crowAdmissions = first.perceptionCarry.situatedExpressionAdmissions.records.filter(
        (record) => record.kind === "core-wildlife-alarm"
          && record.sourceSpecies === "fish-crow" && record.sourceActorId === crowActorId,
      );
      expect(crowAdmissions).toHaveLength(1);
      const crowAdmission = crowAdmissions[0];
      if (crowAdmission === undefined || promiseLot === null) throw new Error("Mixed scene lost its real sources");
      const crowSample = first.perceptionCarry.actorVocalizationSamples[crowAdmission.sampleOrdinal];
      expect(crowSample).toMatchObject({
        expressionEventId: crowAdmission.eventId, sourceActorId: crowActorId,
        soundClass: "animal-alarm", soundInterrupt: "strong",
        position: requiredCoreActor(requiredCore(first), crowActorId).address.position,
      });

      soundscapePlay.mockClear();
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const second = requiredEnvelope(repository);
      const roster = deserializeDogActorRoster(second.dogActorRoster);
      const guardian = roster?.actors.find(({ identity }) => (
        identity.stableId === guardianActorId
      ));
      const work = deserializeSettlementWorkingAnimalState(second.settlementWorkingAnimals);
      const assignment = work?.assignments.find(({ workerActorId }) => (
        workerActorId === guardianActorId
      ));
      if (guardian === undefined || assignment === undefined || work === null) {
        throw new Error("Moderate alarm fixture lost its real guardian work");
      }
      const investigation = settlementGuardianAlarmInvestigation(
        work,
        guardian.perception,
        guardianActorId,
        assignment.currentActivity.transactionId,
        deserializeWorld(second.world).meta.completedTick,
      );
      expect(investigation, stableStringify({
        intent: guardian.intent,
        circadian: guardian.circadian,
        activity: assignment.currentActivity,
        beliefs: guardian.perception.beliefs,
      })).not.toBeNull();
      const warningTick = deserializeWorld(second.world).meta.completedTick;
      const guardianObservationId = `alarm:${hashCanonical([
        crowAdmission.triggerEventId, guardianActorId, warningTick,
      ])}`;
      expect(investigation?.belief).toMatchObject({
        sourceObservationId: guardianObservationId, channel: "hearing",
        perceivedClass: "animal-alarm", subjectId: null, identification: "anonymous",
        area: { center: crowSample?.position },
      });
      expect(investigation?.belief.salience).toBeGreaterThanOrEqual(180_000);
      expect(investigation?.belief.salience).toBeLessThan(450_000);
      const barkAdmissions = second.perceptionCarry.situatedExpressionAdmissions.records.filter(
        ({ kind }) => kind === "guardian-dog-warning",
      );
      const warningAdmissions = second.perceptionCarry.situatedExpressionAdmissions.records.filter(
        ({ kind }) => kind === "human-danger-warning",
      );
      expect(barkAdmissions).toHaveLength(1);
      expect(warningAdmissions).toHaveLength(1);
      const bark = barkAdmissions[0];
      const warning = warningAdmissions[0];
      if (bark === undefined || warning === undefined) throw new Error("Mixed scene lost its actual voices");
      expect(bark).toMatchObject({
        sourceActorId: guardianActorId, triggerEventId: assignment.currentActivity.transactionId,
        sourceObservationId: guardianObservationId, acceptedAtTick: warningTick,
      });
      expect(second.perceptionCarry.actorVocalizationSamples[bark.sampleOrdinal]).toMatchObject({
        expressionEventId: bark.eventId, sourceActorId: guardianActorId,
        position: guardian.address.position, soundClass: "animal-alarm", soundInterrupt: "strong",
      });
      const warningSpeaker = deserializeWorld(second.world).residents.find(({ identity }) => (
        identity.stableId === warning.sourceActorId
      ));
      if (warningSpeaker === undefined || crowSample === undefined) throw new Error("Mixed warning lost its lawful speaker");
      const humanCrowReceipt = `hp-h-${warningTick}-${warningSpeaker.id}-${crowSample.id}`;
      expect(warning).toMatchObject({ sourceObservationId: humanCrowReceipt, acceptedAtTick: warningTick });
      expect(warningSpeaker.perception.beliefs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sourceObservationId: humanCrowReceipt, channel: "hearing",
          perceivedClass: "animal-alarm", subjectId: null, identification: "anonymous", strongInterrupt: true,
        }),
      ]));
      expect(second.perceptionCarry.actorVocalizationSamples[warning.sampleOrdinal]).toMatchObject({
        expressionEventId: warning.eventId, sourceActorId: warning.sourceActorId,
        soundClass: "danger-sound", soundInterrupt: "strong",
      });
      const warningChannel = second.perceptionCarry.situatedExpressionChannels.channels.find(
        ({ sourceActorId }) => sourceActorId === warning.sourceActorId,
      );
      expect(warningChannel?.reception).toMatchObject({
        kind: "heard-unseen", eventId: warning.eventId, directVisualReceipt: false,
      });
      expect(runtime.getUIView().expressionCaption?.id).toBe(warning.eventId);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-alarm"))
        .toHaveLength(1);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-dog-warning-bark"))
        .toHaveLength(1);

      runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: -1 } });
      advancePlayerSteps(runtime, 1);
      runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
      const mixed = runtime.getRenderView();
      expect(mixed.player.incident?.kind).toBe("fall");
      expect(mixed.acousticText).toEqual(expect.arrayContaining([
        expect.objectContaining({ acousticKind: "speech", sourceActorId: "player:local" }),
        expect.objectContaining({ acousticKind: "animal-call", id: bark.eventId, sourceActorId: guardianActorId }),
        expect.objectContaining({ acousticKind: "physical", sourceId: "player:local", semanticFamily: "thud" }),
        expect.objectContaining({
          acousticKind: "physical", sourceKind: "object", sourceId: `cargo-lot:${promiseLot.id}`,
          semanticFamily: "thud",
        }),
      ]));
      // Hearing a warning does not authorize an exact hidden-source anchor.
      // The higher-priority cargo line may replace its optional caption, but
      // the committed warning and its pending hearing sample remain intact.
      expect(mixed.acousticText?.some(({ id }) => id === warning.eventId)).toBe(false);
      await runtime.save();
      const fallen = requiredEnvelope(repository);
      expect(fallen.perceptionCarry.actorVocalizationSamples[warning.sampleOrdinal])
        .toEqual(second.perceptionCarry.actorVocalizationSamples[warning.sampleOrdinal]);
      const retainedWarning = fallen.perceptionCarry.situatedExpressionChannels.channels.find(
        ({ sourceActorId }) => sourceActorId === warning.sourceActorId,
      );
      expect(retainedWarning?.state.active).toMatchObject({
        eventId: warning.eventId, audioAcknowledged: true,
      });
      expect(retainedWarning?.reception).toEqual(warningChannel?.reception);
      const cargoSpeech = mixed.acousticText?.find((item) => (
        item.acousticKind === "speech" && item.sourceActorId === "player:local"
      ));
      if (cargoSpeech === undefined) throw new Error("Mixed scene lost its actual cargo reaction");
      expect(runtime.getUIView().expressionCaption?.id).toBe(cargoSpeech.id);
      expect(cargoSpeech.id).not.toBe(warning.eventId);
      expect(fallen.perceptionCarry.playerStepStateSamples[0]).toMatchObject({
        traversalIncidentKind: "fall", becameSwept: false, rescued: false,
        startingWaterDepth: 0, endingWaterDepth: 0,
      });
      const travel = restorePlayerRegionalTravel(deserializeWorld(fallen.world).meta.rootSeed,
        fallen.player, fallen.regionalTravel);
      const incident = fallen.traversalFeedback.incident;
      const incidentPosition = travel === null || incident === null ? null
        : playerWorldPositionInRegionalWindow(travel.window, {
            ...fallen.player, x: incident.position.x, y: incident.position.y,
          });
      if (incident === null || incidentPosition === null) throw new Error("Mixed scene lost its physical body impact");
      expect(incident.cue).toBe("impact");
      const bodyEvent = traversalIncidentAcousticEvent({
        incident, sourceId: "player:local", sourcePosition: incidentPosition, occurredAtTick: warningTick,
      });
      if (bodyEvent === null) throw new Error("Mixed body impact lost its committed semantics");
      expect(soundscapePlay.mock.calls.filter(([cue, volume, variantSeed, pan]) => (
        cue === "impact" && volume === bodyEvent.intensity / FIXED_POINT
          && variantSeed === bodyEvent.presentationVariantSeed && pan === 0
      ))).toHaveLength(1);
      expect(mixed.acousticText).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: bodyEvent.eventId, acousticKind: "physical", sourceId: "player:local" }),
      ]));
      const impactSample = fallen.perceptionCarry.playerSenseSamples[0] as PlayerSenseSample;
      expect(impactSample).toMatchObject({
        position: bodyEvent.sourcePosition, soundClass: bodyEvent.soundClass,
        soundLoudness: bodyEvent.intensity, soundRangeUnits: bodyEvent.rangeUnits,
        soundInterrupt: bodyEvent.interrupt,
      });
      const remaining = fallen.physicalCargo.carrier.lots.filter(({ payload }) => (
        payload.kind === "promise" && payload.contractId === promiseLot.contractId
      )).reduce((sum, { payload }) => sum + (payload.kind === "promise" ? payload.quantity : 0), 0);
      const dropped = fallen.physicalCargo.looseWorld.entities.filter(({ payload }) => (
        payload.kind === "promise" && payload.contractId === promiseLot.contractId
      )).reduce((sum, { payload }) => sum + (payload.kind === "promise" ? payload.quantity : 0), 0);
      expect(dropped).toBeGreaterThan(0);
      expect(remaining + dropped).toBe(promiseLot.quantity);
      for (const [width, height] of [[1_280, 720], [390, 844]] as const) {
        const viewport = actorCalloutViewport(width, height);
        const anchor = (item: NonNullable<typeof mixed.acousticText>[number]) => ({
          x: width / 2 + (item.position.x - mixed.player.position.x) * 0.05,
          y: height / 2 + (item.position.y - mixed.player.position.y) * 0.05,
        });
        const layout = layoutAcousticTextCallouts(mixed.acousticText ?? [], viewport, anchor);
        expect(layout.placements.length).toBeGreaterThan(0);
        expect(layout.placements.length).toBeLessThanOrEqual(4);
        expect(new Set(layout.placements.map(({ candidate }) => candidate.sourceId)).size)
          .toBe(layout.placements.length);
        expect(layout.placements.some(({ candidate }) => candidate.id === bark.eventId)).toBe(true);
        expect(layout.placements.some(({ candidate }) => candidate.acousticText.acousticKind === "speech"))
          .toBe(true);
        expect(layout.suppressions).toEqual(expect.arrayContaining([
          expect.objectContaining({
            candidate: expect.objectContaining({ id: bodyEvent.eventId, sourceId: "player:local" }),
            reason: "per-source-cap",
          }),
        ]));
        for (let index = 0; index < layout.placements.length; index += 1) {
          for (const other of layout.placements.slice(index + 1)) {
            expect(acousticTextRectsOverlap(layout.placements[index]!.rect, other.rect)).toBe(false);
          }
        }
        expect(layoutAcousticTextCallouts([...(mixed.acousticText ?? [])].reverse(), viewport, anchor))
          .toEqual(layout);
      }

      advancePlayerSteps(runtime, 9);
      await runtime.save();
      const heard = requiredEnvelope(repository);
      const receiptTick = warningTick + 1;
      expect(deserializeWorld(heard.world).meta.completedTick).toBe(receiptTick);
      const impactCalls = observations.mock.calls.filter(([input]) => input.targetTick === receiptTick
        && input.playerSamples.some(({ id }) => id === impactSample.id));
      expect(impactCalls).toHaveLength(1);
      const impactCall = impactCalls[0];
      if (impactCall === undefined) throw new Error("Mixed scene lost its actual impact hearing input");
      const impactResult = observations.mock.results[observations.mock.calls.indexOf(impactCall)];
      if (impactResult?.type !== "return") throw new Error("Actual human hearing did not complete");
      const batches = impactResult.value as ReturnType<typeof humanPerception.collectExistingHumanObservations>;
      const impactObservations = batches.flatMap(({ observerId, residentId, observations: receipt }) => (
        receipt.filter(({ id }) => (
          id === `hp-h-${receiptTick}-${residentId}-${impactSample.id}`
        )).map((observation) => ({ observerId, observation }))
      ));
      expect(impactObservations.length, stableStringify({
        sample: impactSample,
        surfaceSoundSampleIds: impactCall[0].surfaceSoundSampleIds,
        batches: batches.map(({ observerId, observations: receipt }) => ({
          observerId,
          hearingCount: receipt.filter(({ channel }) => channel === "hearing").length,
        })),
      })).toBeGreaterThan(0);
      for (const { observation } of impactObservations) {
        expect(observation).toMatchObject({
          channel: "hearing", perceivedClass: "physical-thud", subjectId: null, identification: "anonymous",
        });
      }
      const heardWorld = deserializeWorld(heard.world);
      expect(impactObservations.some(({ observerId, observation }) => (
        heardWorld.residents.find(({ identity }) => identity.stableId === observerId)
          ?.perception.beliefs.some(({ sourceObservationId }) => sourceObservationId === observation.id)
      ))).toBe(true);
      // Only the strongest current player contact enters this bridge. This
      // proves the suppressed body thud, not separate NPC receipts for cargo.
      runtime.destroy();
      scheduledFrame = undefined;
      soundscapePlay.mockClear();
      const restored = await createTideweftRuntime(repository);
      try {
        expect(restored.getUIView().saveWarning).toBeUndefined();
        expect(soundscapePlay.mock.calls).toEqual([]);
        const oldIds = new Set((mixed.acousticText ?? []).map(({ id }) => id));
        expect(restored.getRenderView().acousticText?.some(({ id }) => oldIds.has(id))).not.toBe(true);
        await restored.save();
        const reloaded = requiredEnvelope(repository);
        for (const key of ["world", "player", "physicalCargo", "regionalEcology", "dogActorRoster",
          "settlementWorkingAnimals", "settlementEcology", "perceptionCarry", "regionalTravel", "promiseJourney"] as const) {
          expect(reloaded[key], key).toEqual(heard[key]);
        }
      } finally {
        restored.destroy();
        scheduledFrame = undefined;
      }
    } finally {
      runtime.destroy();
      scheduledFrame = undefined;
    }
  }, 120_000);

  it("inspects the exact human-warning belief without changing alarm work, saves or rollback", async () => {
    const fixture = await createFishCrowAlarmRuntime();
    const startingRecord = fixture.repository.snapshot();
    fixture.runtime.destroy();
    scheduledFrame = undefined;

    async function run(enabled: boolean) {
      const repository = new MemoryRepository(startingRecord);
      const runtime = await createTideweftRuntime(repository);
      try {
        const inspector = runtime.expressionDiagnostics!;
        expect(inspector.getSnapshot()).toMatchObject({ enabled: false, records: [] });
        inspector.setEnabled(enabled);
        soundscapePlay.mockClear();
        advancePlayerSteps(runtime, 20);
        await runtime.save();
        const saved = requiredEnvelope(repository);
        const world = deserializeWorld(saved.world);
        const warning = saved.perceptionCarry.situatedExpressionAdmissions.records.find(
          (record) => record.kind === "human-danger-warning",
        );
        if (warning?.kind !== "human-danger-warning") throw new Error("Real alarm omitted its human warning");
        const source = world.residents.find(({ identity }) => identity.stableId === warning.sourceActorId);
        const belief = source?.perception.beliefs.find(({ sourceObservationId }) => (
          sourceObservationId === warning.sourceObservationId
        ));
        if (belief === undefined) throw new Error("Real human warning lost its exact belief");
        expect(belief).toMatchObject({ channel: "hearing", perceivedClass: "animal-alarm",
          subjectId: null, identification: "anonymous", strongInterrupt: true,
          lastObservedTick: world.meta.completedTick });
        const decisions = inspector.getSnapshot({ meaning: "human-danger-warning" }).records;
        if (enabled) {
          expect(decisions).toHaveLength(1);
          const decision = decisions[0]!;
          expect(decision).toMatchObject({ reason: "accepted", admission: warning,
            intent: { sourceActorId: source!.identity.stableId,
              knowledgeBasis: "self-heard-anonymous-alarm" } });
          expect(decision.sourceBelief).toEqual(belief);
          expect(decision.sourceBelief).not.toBe(belief);
          expect(Object.isFrozen(decision.sourceBelief)).toBe(true);
          expect(Object.isFrozen(decision.sourceBelief!.area.center.region)).toBe(true);
          expect(Reflect.set(decision.sourceBelief!, "subjectId", fixture.crowActorId)).toBe(false);
          const anonymous = stableStringify(decision.sourceBelief);
          for (const hidden of [fixture.crowActorId, "fish-crow", "northern-harrier"]) {
            expect(anonymous).not.toContain(hidden);
          }
          // Human causes are inspectable, not an invented producer replay.
          expect(decision.producerContext).toBeNull();
          expect(inspector.replayProducer(decision.sequence)).toBeNull();
          await runtime.save();
          expect(requiredEnvelope(repository)).toEqual(saved);
        } else {
          expect(decisions).toEqual([]);
          expect(inspector.getSnapshot().records).toEqual([]);
        }
        return { saved, audio: structuredClone(soundscapePlay.mock.calls), record: repository.snapshot() };
      } finally {
        runtime.destroy();
        scheduledFrame = undefined;
      }
    }

    const enabled = await run(true);
    const disabled = await run(false);
    expect(enabled.saved).toEqual(disabled.saved);
    expect(enabled.audio).toEqual(disabled.audio);
    expect(enabled.audio.filter(([cue]) => cue === "vocalization-alarm")).toHaveLength(1);
    const audioBeforeReload = structuredClone(soundscapePlay.mock.calls);
    const restored = await createTideweftRuntime(new MemoryRepository(enabled.record));
    try {
      expect(restored.getUIView().saveWarning).toBeUndefined();
      expect(restored.expressionDiagnostics!.getSnapshot()).toMatchObject({ enabled: false, records: [] });
      expect(soundscapePlay.mock.calls).toEqual(audioBeforeReload);
    } finally { restored.destroy(); scheduledFrame = undefined; }

    // Exercise the same registry reset as the preceding capacity fixtures.
    // This runtime and its spies must retain their shared static module graph;
    // fresh dynamic imports would silently inspect a different module instance.
    vi.resetModules();
    const failedRepository = new MemoryRepository(startingRecord);
    const failed = await createTideweftRuntime(failedRepository);
    try {
      const inspector = failed.expressionDiagnostics!;
      inspector.setEnabled(true);
      advancePlayerSteps(failed, 19);
      await failed.save();
      const beforeRecord = failedRepository.snapshot();
      const before = requiredEnvelope(failedRepository);
      expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
      const beforeDiagnostics = inspector.getSnapshot();
      const closure = vi.spyOn(situatedExpressionChannels, "closeSituatedExpressionChannelBankInterval")
        .mockReturnValue(null);
      const selected = vi.spyOn(humanDangerWarnings, "selectHumanDangerWarningExpression");
      const append = vi.spyOn(expressionDiagnostics, "appendExpressionDiagnostic");
      soundscapePlay.mockClear();
      try {
        advancePlayerSteps(failed, 1);
        expect(selected.mock.results.some(({ type, value }) => type === "return"
          && value?.intent.meaning === "human-danger-warning")).toBe(true);
        expect(append.mock.calls.some(([, input]) => input.intent.meaning === "human-danger-warning"
          && input.reason === "accepted" && input.admission?.kind === "human-danger-warning"
          && input.sourceBelief?.sourceObservationId === input.admission.sourceObservationId)).toBe(true);
        expect(closure).toHaveBeenCalled();
        expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
        expect(failedRepository.snapshot()).toEqual(beforeRecord);
        expect(inspector.getSnapshot()).toEqual(beforeDiagnostics);
        expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-alarm")).toEqual([]);
        await failed.save();
        const rolledBack = requiredEnvelope(failedRepository);
        for (const key of ["world", "player", "regionalTravel", "regionalEcology", "physicalCargo",
          "dogActorRoster", "settlementWorkingAnimals", "settlementEcology", "perceptionCarry",
          "fieldResources", "playerExpressionRecency", "promiseJourney"] as const) {
          expect(rolledBack[key], key).toEqual(before[key]);
        }
      } finally { closure.mockRestore(); selected.mockRestore(); append.mockRestore(); }
    } finally { failed.destroy(); scheduledFrame = undefined; }
  }, 120_000);

  it("admits one fish-crow alarm, propagates it at T+1 without duplicating human hearing, and rejects tampering", async () => {
    const observations = vi.spyOn(humanPerception, "collectExistingHumanObservations");
    const {
      runtime,
      repository,
      crowActorId,
      deerActorId,
      guardianActorId,
      initialCrowPosition,
    } = await createFishCrowAlarmRuntime();
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-fish-crow-alarm",
    )).toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "crow-nasal-double-call",
    )).toEqual([]);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "Fish crow",
      text: "KRAA! KRAA!",
      presentationKind: "animal-call",
      animalCallKind: "fish-crow-call",
      assertive: true,
    });

    await runtime.save();
    const validFishRecord = repository.snapshot();
    const saved = requiredEnvelope(repository);
    const savedWorld = deserializeWorld(saved.world);
    const savedCore = requiredCore(saved);
    const savedCrow = coreActors(savedCore).find(({ identity }) => (
      identity.stableId === crowActorId
    ));
    if (savedCrow === undefined) throw new Error("Fish-crow voice fixture lost its source actor");
    const fishAdmissions = saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (record): record is CoreWildlifeAlarmExpressionAdmissionRecord => (
        record.kind === "core-wildlife-alarm"
        && record.sourceSpecies === "fish-crow"
      ),
    );
    expect(fishAdmissions).toHaveLength(1);
    const admission = fishAdmissions[0];
    if (admission === undefined) throw new Error("Fish-crow voice fixture omitted its admission");
    expect(admission).toMatchObject({
      kind: "core-wildlife-alarm",
      sourceSpecies: "fish-crow",
      sourceActorId: crowActorId,
      sourceOwnerKey: savedCore.patchKey,
      admittedAtPlayerStepPhase: 0,
      acceptedAtTick: savedWorld.meta.completedTick,
    });
    expect(Object.hasOwn(admission, "listenerWasSleepingAtAdmission")).toBe(false);

    const sample = saved.perceptionCarry.actorVocalizationSamples[admission.sampleOrdinal];
    if (sample === undefined) throw new Error("Fish-crow voice fixture omitted its sound sample");
    const fishCrowAcoustics = situatedExpressionAcoustics({
      meaning: "fish-crow-alarm-call",
      volume: "shout",
    });
    expect(sample).toMatchObject({
      expressionEventId: admission.eventId,
      sourceActorId: crowActorId,
      position: savedCrow.address.position,
      soundClass: "animal-alarm",
      soundInterrupt: "strong",
      soundLoudness: fishCrowAcoustics.loudness,
      soundRangeUnits: fishCrowAcoustics.rangeUnits,
    });
    expect(sample.position).not.toEqual(initialCrowPosition);
    expect(savedCrow).toMatchObject({
      updatedAtTick: admission.acceptedAtTick,
      intent: {
        kind: "alarm",
        cause: { kind: "perception", referenceId: admission.sourceObservationId },
        focusObservationId: admission.sourceObservationId,
      },
    });
    expect(savedCrow.memories).toContainEqual(expect.objectContaining({
      eventId: admission.triggerEventId,
      kind: "alarm",
      observationId: admission.sourceObservationId,
      atTick: admission.acceptedAtTick,
    }));

    const channel = saved.perceptionCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === crowActorId,
    );
    expect(channel?.state.active).toMatchObject({
      eventId: admission.eventId,
      triggerEventId: admission.triggerEventId,
      position: savedCrow.address.position,
      meaning: "fish-crow-alarm-call",
      family: "animal-signal",
      tone: "alarmed",
      volume: "shout",
      knowledgeBasis: "self-perceived-threat",
      vocalization: "fish-crow-alarm",
      priority: 760_000,
      durationSteps: 6,
      audioAcknowledged: true,
    });
    expect(channel?.reception).toMatchObject({
      eventId: admission.eventId,
      sourceActorId: crowActorId,
      receivedAtTick: admission.acceptedAtTick,
      kind: "heard-visible",
      directVisualReceipt: true,
    });

    const legacyV38RecordFor = (envelope: CurrentEnvelope): SaveRecord => {
      const carry = envelope.perceptionCarry;
      const legacyRecords = carry.situatedExpressionAdmissions.records.map((candidate) => {
        if (
          candidate.kind !== "core-wildlife-alarm"
          || candidate.sourceSpecies !== "fish-crow"
        ) return candidate;
        const { sourceSpecies: _futureSourceSpecies, ...legacy } = candidate;
        return { ...legacy, kind: "core-wildlife-fish-crow-alarm" as const };
      });
      const {
        animalContactAcousticCarry: _futureAnimalContactCarry,
        intervalStartWasSleeping: _futureIntervalStartWasSleeping,
        playerStepStateAnchor: _futurePlayerStepStateAnchor,
        playerStepStateSamples: _futurePlayerStepStateSamples,
        ...v7Carry
      } = carry;
      const { integrity: _futureIntegrity, playerExpressionRecency: _futurePlayerExpressionRecency, ...v38Envelope } = envelope;
      const v38Base = {
        ...v38Envelope,
        version: 38,
        perceptionCarry: {
          ...v7Carry,
          version: 7,
          situatedExpressionAdmissions: {
            ...carry.situatedExpressionAdmissions,
            records: legacyRecords,
          },
        },
      };
      return {
        ...validFishRecord,
        payloadVersion: 38,
        updatedAt: validFishRecord.updatedAt + 1,
        worldJson: JSON.stringify({
          ...v38Base,
          integrity: gameSaveEnvelopeIntegrity(v38Base),
        }),
      };
    };

    // The obsolete v38 Voice checkpoint is recognized without partial load,
    // replay or overwrite; genuine current alarm/reload proofs remain below.
    await expectRetiredVoiceSaveUntouched(legacyV38RecordFor(saved));

    // Current alarms lawfully accept a broader shared threat vocabulary. That
    // does not reactivate a retired v38 record, even with a valid outer seal.
    const broadenedCrow = canonicalizeCoreWildlifeActorState({
      ...savedCrow,
      perception: {
        ...savedCrow.perception,
        beliefs: savedCrow.perception.beliefs.map((belief) => (
          belief.sourceObservationId === admission.sourceObservationId
            ? { ...belief, perceivedClass: "large-predator" }
            : belief
        )),
      },
    });
    if (broadenedCrow === null) {
      throw new Error("Fish-crow legacy semantic-fence fixture became malformed");
    }
    const broadenedEnvelope = resealedCurrentEnvelopeWithCorePatch(
      saved,
      replaceCoreEcologyAggregatePatchActor(savedCore, broadenedCrow),
    );
    const smuggledV38Record = legacyV38RecordFor(broadenedEnvelope);
    await expectRetiredVoiceSaveUntouched(smuggledV38Record);

    // Retirement cannot hide current causal species authentication. The old
    // fish-crow-specific kind remains a valid authenticated alias, so changing
    // only the required species on a current tuple tests a genuine forgery.
    const wrongSpeciesCarry = {
      ...saved.perceptionCarry,
      situatedExpressionAdmissions: {
        ...saved.perceptionCarry.situatedExpressionAdmissions,
        records: saved.perceptionCarry.situatedExpressionAdmissions.records.map((candidate) => {
          if (candidate.kind !== "core-wildlife-alarm"
            || candidate.sourceSpecies !== "fish-crow") return candidate;
          return { ...candidate, sourceSpecies: "deer" };
        }),
      },
    } as unknown as CurrentPerceptionCarry;
    const wrongSpeciesRecord = recordWithEnvelope(validFishRecord, resealedEnvelope(saved, {
      perceptionCarry: wrongSpeciesCarry,
    }));
    const wrongSpeciesRepository = new MemoryRepository(wrongSpeciesRecord);
    const rejectedWrongSpecies = await createTideweftRuntime(wrongSpeciesRepository);
    expect(rejectedWrongSpecies.getUIView().saveWarning?.message)
      .toBe("LOCAL AUTOSAVE UNREADABLE");
    expect(wrongSpeciesRepository.snapshot()).toEqual(wrongSpeciesRecord);
    rejectedWrongSpecies.destroy();
    scheduledFrame = undefined;

    // Core ecology consumes the retained T alarm on T+1. Wildlife and the
    // working guardian receive one anonymous final-address fact, while the
    // already-admitted Living Voice sample remains the sole player hearing.
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const propagated = requiredEnvelope(repository);
    const propagatedWorld = deserializeWorld(propagated.world);
    expect(propagatedWorld.meta.completedTick).toBe(admission.acceptedAtTick + 1);
    const propagatedCore = requiredCore(propagated);
    const propagatedDeer = requiredCoreActor(propagatedCore, deerActorId);
    const propagatedRoster = deserializeDogActorRoster(propagated.dogActorRoster);
    const propagatedWork = deserializeSettlementWorkingAnimalState(
      propagated.settlementWorkingAnimals,
    );
    const propagatedGuardian = propagatedRoster?.actors.find(({ identity }) => (
      identity.stableId === guardianActorId
    ));
    const propagatedAssignment = propagatedWork?.assignments.find(({ workerActorId }) => (
      workerActorId === guardianActorId
    ));
    if (propagatedGuardian === undefined || propagatedAssignment === undefined) {
      throw new Error("Fish-crow composition fixture lost its guardian work consumer");
    }
    const deerAlarmObservationId = `alarm:${hashCanonical([
      admission.triggerEventId,
      deerActorId,
      propagatedWorld.meta.completedTick,
    ])}`;
    const guardianAlarmObservationId = `alarm:${hashCanonical([
      admission.triggerEventId,
      guardianActorId,
      propagatedWorld.meta.completedTick,
    ])}`;
    const deerAlarmBelief = propagatedDeer.perception.beliefs.find((belief) => (
      belief.sourceObservationId === deerAlarmObservationId
    ));
    const guardianAlarmBelief = propagatedGuardian.perception.beliefs.find((belief) => (
      belief.sourceObservationId === guardianAlarmObservationId
    ));
    if (deerAlarmBelief === undefined || guardianAlarmBelief === undefined) {
      throw new Error("Fish-crow composition fixture lost an anonymous alarm belief");
    }
    for (const [consumer, belief] of [
      ["deer", deerAlarmBelief],
      ["guardian", guardianAlarmBelief],
    ] as const) {
      expect(belief, consumer).toMatchObject({
        channel: "hearing",
        perceivedClass: "animal-alarm",
        subjectId: null,
        area: { center: savedCrow.address.position },
        identification: "anonymous",
        firstObservedTick: propagatedWorld.meta.completedTick,
        lastObservedTick: propagatedWorld.meta.completedTick,
        strongInterrupt: true,
      });
      expect(belief.sourceObservationId, consumer).toMatch(/^alarm:/u);
      const anonymousBelief = stableStringify(belief);
      expect(anonymousBelief, consumer).not.toContain(crowActorId);
      expect(anonymousBelief, consumer).not.toContain("fish-crow");
      expect(anonymousBelief, consumer).not.toContain(admission.triggerEventId);
    }
    expect(propagatedDeer.intent).toMatchObject({
      kind: "flee",
      cause: { kind: "perception", referenceId: deerAlarmBelief.sourceObservationId },
      focusObservationId: deerAlarmBelief.sourceObservationId,
    });
    expect(propagatedDeer.memories).toContainEqual(expect.objectContaining({
      kind: "threat",
      referenceId: deerAlarmBelief.sourceObservationId,
      observationId: deerAlarmBelief.sourceObservationId,
      atTick: propagatedWorld.meta.completedTick,
    }));
    const guardianInvestigation = settlementGuardianAlarmInvestigation(
      propagatedWork,
      propagatedGuardian.perception,
      guardianActorId,
      propagatedAssignment.currentActivity.transactionId,
      propagatedWorld.meta.completedTick,
    );
    if (guardianInvestigation === null) {
      expect(propagatedGuardian.intent).toMatchObject({
        kind: "retreat",
        cause: { kind: "perception", referenceId: guardianAlarmBelief.key },
      });
      expect(propagatedAssignment.currentActivity).toMatchObject({
        acceptedAtTick: propagatedWorld.meta.completedTick,
        activity: "defer-to-actor",
        cause: { kind: "actor-disposition", referenceId: "actor-intent:retreat" },
        perceivedArea: null,
      });
      expect(propagatedAssignment.currentTask).toBeNull();
    } else {
      expect(guardianInvestigation.belief.sourceObservationId)
        .toBe(guardianAlarmBelief.sourceObservationId);
      expect(guardianInvestigation.activity.perceivedArea?.center)
        .toEqual(savedCrow.address.position);
    }

    const porter = propagatedWorld.residents.find(({ identity }) => (
      identity.stableId === propagatedAssignment.handlerActorId
    ));
    if (porter === undefined) {
      throw new Error("Fish-crow composition fixture lost its human handler consumer");
    }
    const freshPorterAlarmBeliefs = porter.perception.beliefs.filter((belief) => (
      belief.perceivedClass === "animal-alarm"
      && belief.lastObservedTick === propagatedWorld.meta.completedTick
    ));
    expect(freshPorterAlarmBeliefs).toHaveLength(1);
    expect(freshPorterAlarmBeliefs[0]).toMatchObject({
      channel: "hearing",
      subjectId: null,
      identification: "anonymous",
      strongInterrupt: true,
    });
    expect(freshPorterAlarmBeliefs[0]?.sourceObservationId).toMatch(/^hp-h-/u);
    expect(porter.perception.attentionKeys).toContain(freshPorterAlarmBeliefs[0]?.key);
    const humanWarnings = propagated.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (record) => record.kind === "human-danger-warning",
    );
    expect(humanWarnings).toHaveLength(1);
    expect(humanWarnings[0]).toMatchObject({
      sourceActorId: porter.identity.stableId,
      sourceObservationId: freshPorterAlarmBeliefs[0]?.sourceObservationId,
      admittedAtPlayerStepPhase: 0,
      acceptedAtTick: propagatedWorld.meta.completedTick,
    });
    const warningAdmission = humanWarnings[0];
    if (warningAdmission?.kind !== "human-danger-warning") {
      throw new Error("Actual alarm omitted its committed human warning");
    }
    const warningSample = propagated.perceptionCarry.actorVocalizationSamples[warningAdmission.sampleOrdinal];
    if (warningSample === undefined) throw new Error("Actual warning omitted its sound sample");
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-alarm"))
      .toHaveLength(1);
    const activeWarningCheckpoint = repository.snapshot();
    expect(porter.perception.beliefs.filter(({ sourceObservationId, lastObservedTick }) => (
      lastObservedTick === propagatedWorld.meta.completedTick
      && sourceObservationId.startsWith("alarm:")
    ))).toEqual([]);
    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-fish-crow-alarm",
    )).toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "crow-nasal-double-call"))
      .toEqual([]);
    expect(propagated.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (record): record is CoreWildlifeAlarmExpressionAdmissionRecord => (
        record.kind === "core-wildlife-alarm"
        && record.sourceSpecies === "fish-crow"
      ),
    )).toEqual([]);
    expect(propagated.perceptionCarry.actorVocalizationSamples.filter(
      ({ expressionEventId }) => expressionEventId === admission.eventId,
    )).toEqual([]);

    // The warning's one authoritative sound sample enters the next human
    // perception interval. Other residents may learn only an anonymous
    // danger-sound fact, and that receipt cannot recursively create warnings.
    observations.mockClear();
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const warned = requiredEnvelope(repository);
    const warnedWorld = deserializeWorld(warned.world);
    const warningIntervals = observations.mock.calls.map(([input]) => input).filter((input) => (
      input.supplementalSoundSamples?.some(({ expressionEventId }) => expressionEventId === warningAdmission.eventId)
    ));
    expect(warningIntervals).toHaveLength(1);
    expect(warningIntervals[0]?.supplementalSoundSamples).toContainEqual(warningSample);
    expect(warningIntervals[0]?.surfaceSoundSampleIds).toContain(warningSample.id);
    const warningSource = warnedWorld.residents.find(({ identity }) => identity.stableId === warningSample.sourceActorId);
    expect(warningSource).toBeDefined();
    expect(warningSource?.perception.beliefs.some(({ sourceObservationId }) => (
      sourceObservationId.endsWith(`-${warningSample.id}`)
    ))).toBe(false);
    const warningConsumers = warnedWorld.residents.filter((resident) => (
      resident.identity.stableId !== porter.identity.stableId
      && resident.perception.beliefs.some((belief) => (
        belief.perceivedClass === "danger-sound"
        && belief.channel === "hearing"
        && belief.subjectId === null
        && belief.identification === "anonymous"
        && belief.lastObservedTick === warnedWorld.meta.completedTick
        && belief.sourceObservationId.endsWith(`-${warningSample.id}`)
      ))
    ));
    expect(warningConsumers.length).toBeGreaterThan(0);
    expect(warned.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (record) => record.kind === "human-danger-warning",
    )).toEqual([]);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-alarm"))
      .toHaveLength(1);

    const durableRegionalEcology = warned.regionalEcology;
    const durableCarry = stableStringify(warned.perceptionCarry);
    runtime.destroy();
    scheduledFrame = undefined;

    // A current-schema checkpoint with an acknowledged, still-active warning
    // must authenticate on load without replaying its audio or inventing a
    // second admission.
    soundscapePlay.mockClear();
    const warningCheckpointRepository = new MemoryRepository(activeWarningCheckpoint);
    const resumedWarning = await createTideweftRuntime(warningCheckpointRepository);
    expect(resumedWarning.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-alarm"))
      .toEqual([]);
    await resumedWarning.save();
    expect(stableStringify(requiredEnvelope(warningCheckpointRepository).perceptionCarry))
      .toBe(stableStringify(propagated.perceptionCarry));
    observations.mockClear();
    advancePlayerSteps(resumedWarning, 10);
    await resumedWarning.save();
    const restoredWarning = requiredEnvelope(warningCheckpointRepository);
    // Both paths process the same accepted steps from the same exact pending
    // checkpoint. Restoring cannot change world knowledge or the sound bank.
    expect(restoredWarning.world).toBe(warned.world);
    expect(restoredWarning.perceptionCarry).toEqual(warned.perceptionCarry);
    const restoredIntervals = observations.mock.calls.map(([input]) => input).filter((input) => (
      input.supplementalSoundSamples?.some(({ expressionEventId }) => expressionEventId === warningAdmission.eventId)
    ));
    expect(restoredIntervals).toHaveLength(1);
    expect(restoredIntervals[0]?.surfaceSoundSampleIds).toContain(warningSample.id);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-alarm")).toEqual([]);
    observations.mockClear();
    advancePlayerSteps(resumedWarning, 10);
    expect(observations.mock.calls.some(([input]) => input.supplementalSoundSamples?.some(
      ({ expressionEventId }) => expressionEventId === warningAdmission.eventId,
    ))).toBe(false);
    resumedWarning.destroy();
    scheduledFrame = undefined;

    // A checksummed human-warning downgrade remains recognized as the retired
    // development format, not partially interpreted as a current interval.
    const warningV39 = JSON.parse(activeWarningCheckpoint.worldJson) as Record<string, unknown>;
    const { integrity: _warningIntegrity, playerExpressionRecency: _warningPlayerExpressionRecency, ...warningBase } = warningV39;
    const warningCarry = warningV39.perceptionCarry as Readonly<Record<string, unknown>>;
    const {
      animalContactAcousticCarry: _futureAnimalContactCarry,
      intervalStartWasSleeping: _futureIntervalStartWasSleeping,
      playerStepStateAnchor: _futurePlayerStepStateAnchor,
      playerStepStateSamples: _futurePlayerStepStateSamples,
      ...warningV7Carry
    } = warningCarry;
    const warningV38Base = {
      ...warningBase,
      version: 38,
      perceptionCarry: { ...warningV7Carry, version: 7 },
    };
    const warningV38Record: SaveRecord = {
      ...activeWarningCheckpoint,
      payloadVersion: 38,
      updatedAt: activeWarningCheckpoint.updatedAt + 1,
      worldJson: JSON.stringify({
        ...warningV38Base,
        integrity: gameSaveEnvelopeIntegrity(warningV38Base),
      }),
    };
    await expectRetiredVoiceSaveUntouched(warningV38Record);

    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-fish-crow-alarm",
    )).toEqual([]);
    await resumed.save();
    const reloaded = requiredEnvelope(repository);
    expect(reloaded.regionalEcology).toBe(durableRegionalEcology);
    expect(stableStringify(reloaded.perceptionCarry)).toBe(durableCarry);
    resumed.destroy();
    scheduledFrame = undefined;

    const validRecord = validFishRecord;
    const validEnvelope = saved;
    const tamperedSampleCarry: CurrentPerceptionCarry = {
      ...validEnvelope.perceptionCarry,
      actorVocalizationSamples: validEnvelope.perceptionCarry.actorVocalizationSamples.map(
        (candidate, ordinal) => ordinal === admission.sampleOrdinal
          ? {
              ...candidate,
              position: translateWorldPosition(candidate.position, 1, 0),
            }
          : candidate,
      ),
    };
    const tamperedAdmissionCarry: CurrentPerceptionCarry = {
      ...validEnvelope.perceptionCarry,
      situatedExpressionAdmissions: {
        ...validEnvelope.perceptionCarry.situatedExpressionAdmissions,
        records: validEnvelope.perceptionCarry.situatedExpressionAdmissions.records.map(
          (candidate) => candidate.kind === "core-wildlife-alarm"
            && candidate.sourceSpecies === "fish-crow"
            && candidate.eventId === admission.eventId
            ? {
                ...candidate,
                sourceObservationId: `${candidate.sourceObservationId}:tampered`,
              }
            : candidate,
        ),
      },
    };
    for (const [label, perceptionCarry] of [
      ["sample final address", tamperedSampleCarry],
      ["admission observation authority", tamperedAdmissionCarry],
    ] as const) {
      await repository.save(recordWithEnvelope(validRecord, resealedEnvelope(validEnvelope, {
        perceptionCarry,
      })));
      const rejected = await createTideweftRuntime(repository);
      expect(rejected.getUIView().title.hasSave, label).toBe(false);
      expect(rejected.getUIView().saveWarning?.message, label)
        .toBe("LOCAL AUTOSAVE UNREADABLE");
      rejected.destroy();
      scheduledFrame = undefined;
    }

    const validRegional = requiredRegionalEcologyV6(validEnvelope);
    const validTravel = restorePlayerRegionalTravel(
      savedWorld.meta.rootSeed,
      validEnvelope.player,
      validEnvelope.regionalTravel,
    );
    if (validTravel === null) {
      throw new Error("Fish-crow memory tamper fixture lost its regional frame");
    }
    const validActive = projectRegionalEcologyStateV6ActiveState(validRegional, {
      origin: validTravel.window.origin,
      terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
    });
    if (validActive === null) {
      throw new Error("Fish-crow memory tamper fixture lost its active projection");
    }
    const validActiveBase = validActive.base.base.base.base.base;
    const sourceResident = validActiveBase.residents.find(({ sourceKey, patch }) => (
      sourceKey === admission.sourceOwnerKey
      && coreActors(patch).some(({ identity }) => identity.stableId === crowActorId)
    ));
    if (sourceResident === undefined) {
      throw new Error("Fish-crow memory tamper fixture lost its durable active source");
    }
    const sourceCrow = requiredCoreActor(sourceResident.patch, crowActorId);
    const sourceAlarmMemory = sourceCrow.memories.find(({ eventId }) => (
      eventId === admission.triggerEventId
    ));
    if (sourceAlarmMemory?.eventPosition === undefined) {
      throw new Error("Fish-crow memory tamper fixture omitted its retained event locus");
    }
    const commitRegionalWithSourceCrow = (
      replacementCrow: CoreWildlifeActorState,
    ): RegionalEcologyStateV6 | null => {
      const replacementPatch = replaceCoreEcologyAggregatePatchActor(
        sourceResident.patch,
        replacementCrow,
      );
      const replacementBase = {
        base: {
          base: {
            base: {
              base: {
                root: validRegional.base.base.base.base.base.root,
                rootSeed: savedWorld.meta.rootSeed,
                settlementHome: validActiveBase.residents.some(({ sourceKey }) => (
                  sourceKey === validRegional.base.base.base.base.base.settlementHome.sourceKey
                ))
                  ? null
                  : {
                      sourceKey:
                        validRegional.base.base.base.base.base.settlementHome.sourceKey,
                      patch: validRegional.base.base.base.base.base.settlementHome.patch,
                    },
                residents: validActiveBase.residents.map(({ sourceKey, patch }) => ({
                  sourceKey,
                  patch: sourceKey === sourceResident.sourceKey
                    ? replacementPatch
                    : patch,
                })),
              },
              alpineResidents: validActive.base.base.base.base.alpineResidents.map(
                ({ sourceKey, patch }) => ({ sourceKey, patch }),
              ),
            },
            polarShoreResidents: validActive.base.base.base.polarShoreResidents.map(
              ({ sourceKey, patch }) => ({ sourceKey, patch }),
            ),
          },
          coldShoreResidents: validActive.base.base.coldShoreResidents.map(
            ({ sourceKey, patch }) => ({ sourceKey, patch }),
          ),
        },
        polarConsumerResidents: validActive.base.polarConsumerResidents.map(
          ({ sourceKey, patch }) => ({ sourceKey, patch }),
        ),
      };
      return commitRegionalEcologyStateV6ActiveProjection(
        validRegional,
        validActive,
        {
          base: replacementBase,
          breadthResidents: validActive.breadthResidents.map(
            ({ sourceKey, patch }) => ({ sourceKey, patch }),
          ),
        },
      );
    };
    const tamperedEventPosition = translateWorldPosition(
      sourceAlarmMemory.eventPosition,
      1,
      0,
    );
    const tamperedSourceCrow = canonicalizeCoreWildlifeActorState({
      ...sourceCrow,
      memories: sourceCrow.memories.map((memory) => (
        memory.eventId === admission.triggerEventId
          ? { ...memory, eventPosition: tamperedEventPosition }
          : memory
      )),
    });
    if (tamperedSourceCrow === null) {
      throw new Error("Fish-crow memory tamper fixture could not encode its nested mutation");
    }
    const tamperedRegional = commitRegionalWithSourceCrow(tamperedSourceCrow);
    if (tamperedRegional === null) {
      throw new Error("Fish-crow memory tamper fixture could not commit canonical regional v6");
    }
    const storedTamperedSource = tamperedRegional.base.base.base.base.base.activeResidents.find(
      ({ sourceKey }) => sourceKey === sourceResident.sourceKey,
    );
    if (storedTamperedSource === undefined) {
      throw new Error("Fish-crow memory tamper fixture did not store its active source");
    }
    const storedTamperedCrow = requiredCoreActor(storedTamperedSource.patch, crowActorId);
    expect(storedTamperedCrow.address.position).toEqual(sourceCrow.address.position);
    expect(storedTamperedCrow.memories.find(({ eventId }) => (
      eventId === admission.triggerEventId
    ))?.eventPosition).toEqual(tamperedEventPosition);
    const { integrity: _validRegionalIntegrity, ...validRegionalEnvelopeFields } = validEnvelope;
    const tamperedRegionalEnvelopeBase = {
      ...validRegionalEnvelopeFields,
      regionalEcology: serializeRegionalEcologyStateV6(tamperedRegional),
    };
    const tamperedRegionalEnvelope = {
      ...tamperedRegionalEnvelopeBase,
      integrity: gameSaveEnvelopeIntegrity(tamperedRegionalEnvelopeBase),
    } as CurrentEnvelope;
    await repository.save(recordWithEnvelope(validRecord, tamperedRegionalEnvelope));
    const rejectedRegionalMemory = await createTideweftRuntime(repository);
    expect(rejectedRegionalMemory.getUIView().title.hasSave).toBe(false);
    expect(rejectedRegionalMemory.getUIView().saveWarning?.message)
      .toBe("LOCAL AUTOSAVE UNREADABLE");
    rejectedRegionalMemory.destroy();
    scheduledFrame = undefined;

    const missingLocusSourceCrow = canonicalizeCoreWildlifeActorState({
      ...sourceCrow,
      memories: sourceCrow.memories.map((memory) => {
        if (memory.eventId !== admission.triggerEventId) return memory;
        return {
          eventId: memory.eventId,
          kind: memory.kind,
          referenceId: memory.referenceId,
          observationId: memory.observationId,
          atTick: memory.atTick,
          ...(memory.environmentalEvidence === undefined
            ? {}
            : { environmentalEvidence: memory.environmentalEvidence }),
        };
      }),
    });
    if (missingLocusSourceCrow === null) {
      throw new Error("Fish-crow deletion fixture could not encode its legacy memory shape");
    }
    const missingLocusRegional = commitRegionalWithSourceCrow(missingLocusSourceCrow);
    if (missingLocusRegional === null) {
      throw new Error("Fish-crow deletion fixture could not commit canonical regional v6");
    }
    const serializedMissingLocusRegional = serializeRegionalEcologyStateV6(
      missingLocusRegional,
    );
    const missingLocusStoredSource = missingLocusRegional.base.base.base.base.base.activeResidents
      .find(({ sourceKey }) => sourceKey === sourceResident.sourceKey);
    if (missingLocusStoredSource === undefined) {
      throw new Error("Fish-crow deletion fixture did not store its active source");
    }
    expect(requiredCoreActor(missingLocusStoredSource.patch, crowActorId).memories.find(
      ({ eventId }) => eventId === admission.triggerEventId,
    )?.eventPosition).toBeUndefined();

    // Strip the fish-crow presentation interval so rejection below can only
    // come from current-v50 ecology custody, not admission/sample reauth.
    const ecologyOnlyCarry: CurrentPerceptionCarry = {
      ...validEnvelope.perceptionCarry,
      actorVocalizationSamples: [],
      situatedExpressionChannels: { version: 1, channels: [] },
      situatedExpressionAdmissions: { version: 1, records: [] },
      situatedExpressionCausalAuthority: { version: 1, records: [] },
    };
    const missingLocusEnvelopeBase = {
      ...validRegionalEnvelopeFields,
      regionalEcology: serializedMissingLocusRegional,
      perceptionCarry: ecologyOnlyCarry,
    };
    const missingLocusEnvelope = {
      ...missingLocusEnvelopeBase,
      integrity: gameSaveEnvelopeIntegrity(missingLocusEnvelopeBase),
    } as CurrentEnvelope;
    await repository.save(recordWithEnvelope(validRecord, missingLocusEnvelope));
    const rejectedMissingLocus = await createTideweftRuntime(repository);
    expect(rejectedMissingLocus.getUIView().title.hasSave).toBe(false);
    expect(rejectedMissingLocus.getUIView().saveWarning?.message)
      .toBe("LOCAL AUTOSAVE UNREADABLE");
    rejectedMissingLocus.destroy();
    scheduledFrame = undefined;

    // The same authenticated no-locus V6 shape is legitimate under released
    // outer v32/carry-v1. It adopts the durable stored body address once, saves
    // as v50 with an empty Voice bank, and never
    // replays a Living Voice cue on either migration load or current reload.
    expect(serializedMissingLocusRegional).not.toContain('"eventPosition":');
    const { integrity: _missingLocusIntegrity, playerExpressionRecency: _missingLocusPlayerExpressionRecency, ...missingLocusFields } = missingLocusEnvelope;
    const legacyV32Base = {
      ...missingLocusFields,
      version: 32,
      // Released v32 already owns recovery/timeAction; only Voice is absent.
      player: structuredClone(missingLocusEnvelope.player),
      perceptionCarry: legacyPerceptionCarry(ecologyOnlyCarry),
    };
    await repository.save({
      ...validRecord,
      payloadVersion: 32,
      updatedAt: validRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...legacyV32Base,
        integrity: gameSaveEnvelopeIntegrity(legacyV32Base),
      }),
    });
    soundscapePlay.mockClear();
    const migratedV32Locus = await createTideweftRuntime(repository);
    expect(migratedV32Locus.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay).not.toHaveBeenCalled();
    await migratedV32Locus.save();
    expect(soundscapePlay).not.toHaveBeenCalled();
    const upgradedLocusRecord = repository.snapshot();
    const upgradedLocusEnvelope = requiredEnvelope(repository);
    expect(upgradedLocusRecord.payloadVersion).toBe(50);
    expect(upgradedLocusEnvelope.perceptionCarry).toMatchObject({
      version: 14,
      actorVocalizationSamples: [],
      situatedExpressionChannels: { version: 1, channels: [] },
      situatedExpressionAdmissions: { version: 1, records: [] },
      situatedExpressionCausalAuthority: { version: 1, records: [] },
    });
    const upgradedLocusCrow = requiredCoreActor(
      requiredCore(upgradedLocusEnvelope),
      crowActorId,
    );
    expect(upgradedLocusCrow.memories.find(({ eventId }) => (
      eventId === admission.triggerEventId
    ))?.eventPosition).toEqual(sourceCrow.address.position);
    const durableUpgradedRegional = upgradedLocusEnvelope.regionalEcology;
    migratedV32Locus.destroy();
    scheduledFrame = undefined;

    soundscapePlay.mockClear();
    const reloadedUpgradedLocus = await createTideweftRuntime(repository);
    expect(reloadedUpgradedLocus.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay).not.toHaveBeenCalled();
    await reloadedUpgradedLocus.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(durableUpgradedRegional);
    expect(soundscapePlay).not.toHaveBeenCalled();
    reloadedUpgradedLocus.destroy();
    scheduledFrame = undefined;

    // Resealing a current fish-crow interval under obsolete v37 labels does
    // not bypass retirement or permit partial interpretation.
    const { integrity: _validIntegrity, playerExpressionRecency: _validPlayerExpressionRecency, ...validFields } = validEnvelope;
    const {
      animalContactAcousticCarry: _currentAnimalContactCarryForSemanticFence,
      intervalStartWasSleeping: _currentIntervalStartWasSleepingForSemanticFence,
      playerStepStateAnchor: _currentPlayerStepStateAnchorForSemanticFence,
      playerStepStateSamples: _currentPlayerStepStateSamplesForSemanticFence,
      ...v7ValidPerceptionCarry
    } = validEnvelope.perceptionCarry;
    const mislabeledV37Base = {
      ...validFields,
      version: 37,
      perceptionCarry: { ...v7ValidPerceptionCarry, version: 6 },
    };
    const mislabeledV37Record: SaveRecord = {
      ...validRecord,
      payloadVersion: 37,
      updatedAt: validRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...mislabeledV37Base,
        integrity: gameSaveEnvelopeIntegrity(mislabeledV37Base),
      }),
    };
    await expectRetiredVoiceSaveUntouched(mislabeledV37Record);
  }, 120_000);

  it("does not let an earlier inaudible fish-crow alarm suppress a later audible flockmate", async () => {
    const {
      runtime,
      repository,
      candidateCrowActorIds,
    } = await createFishCrowAlarmRuntime("candidate-order");
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-fish-crow-alarm",
    )).toHaveLength(1);
    await runtime.save();
    const saved = requiredEnvelope(repository);
    const admissions = saved.perceptionCarry.situatedExpressionAdmissions.records
      .filter((record): record is CoreWildlifeAlarmExpressionAdmissionRecord => (
        record.kind === "core-wildlife-alarm"
        && record.sourceSpecies === "fish-crow"
      ))
      .sort((left, right) => left.triggerEventId.localeCompare(right.triggerEventId));
    expect(admissions).toHaveLength(2);
    const earlier = admissions[0];
    const later = admissions[1];
    if (earlier === undefined || later === undefined) {
      throw new Error("Fish-crow candidate-order fixture omitted an admission");
    }
    expect(candidateCrowActorIds).toEqual([
      earlier.sourceActorId,
      later.sourceActorId,
    ]);
    expect(earlier).toMatchObject({
      kind: "core-wildlife-alarm",
      sourceSpecies: "fish-crow",
    });
    expect(later).toMatchObject({
      kind: "core-wildlife-alarm",
      sourceSpecies: "fish-crow",
    });
    expect(earlier.sampleOrdinal).toBeLessThan(later.sampleOrdinal);
    const listenerPosition = saved.perceptionCarry.intervalStartPosition;
    const earlierSample = saved.perceptionCarry.actorVocalizationSamples[earlier.sampleOrdinal];
    const laterSample = saved.perceptionCarry.actorVocalizationSamples[later.sampleOrdinal];
    if (
      !isWorldPosition(listenerPosition)
      || earlierSample === undefined
      || laterSample === undefined
    ) throw new Error("Fish-crow candidate-order fixture lost its event-time acoustics");
    const fishCrowRange = situatedExpressionAcoustics({
      meaning: "fish-crow-alarm-call",
      volume: "shout",
    }).rangeUnits;
    const earlierDelta = worldPositionDelta(listenerPosition, earlierSample.position);
    const laterDelta = worldPositionDelta(listenerPosition, laterSample.position);
    expect(Math.hypot(earlierDelta.x, earlierDelta.y)).toBeGreaterThan(fishCrowRange);
    expect(Math.hypot(laterDelta.x, laterDelta.y)).toBeLessThanOrEqual(fishCrowRange);

    const earlierChannel = saved.perceptionCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === earlier.sourceActorId,
    );
    const laterChannel = saved.perceptionCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === later.sourceActorId,
    );
    expect(earlierChannel?.reception).toBeNull();
    expect(laterChannel?.reception).toMatchObject({
      eventId: later.eventId,
      sourceActorId: later.sourceActorId,
      kind: expect.stringMatching(/^heard-/u),
    });
    expect(earlierChannel?.state.active).toMatchObject({ eventId: earlier.eventId });
    expect(laterChannel?.state.active).toMatchObject({
      eventId: later.eventId,
      audioAcknowledged: true,
    });
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "Fish crow",
      text: "KRAA! KRAA!",
    });
    runtime.destroy();
  }, 60_000);

  it("persists a witnessed marsh-edge cue and only movement-backed fox signs across reload", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "marsh-edge-runtime-cue-1",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    makeWorldTraceableAndClear(world);
    const player = structuredClone(envelope.player);
    const regional = restorePlayerRegionalTravel(world.meta.rootSeed, player, envelope.regionalTravel);
    if (regional === null) throw new Error("marsh-edge cue fixture could not restore its frame");
    const playerPosition = playerWorldPositionInRegionalWindow(regional.window, player);
    if (playerPosition === null) throw new Error("marsh-edge cue fixture lost its player");
    const direction: -1 | 1 = playerPosition.localX < REGION_WIDTH_UNITS / 2 ? 1 : -1;
    player.facingMilliRadians = direction > 0 ? 0 : Math.round(Math.PI * 1_000);
    const rabbitPosition = translateWorldPosition(
      playerPosition,
      direction * 2 * WORLD_POSITION_UNITS_PER_TILE,
      -2 * WORLD_POSITION_UNITS_PER_TILE,
    );
    const foxPosition = translateWorldPosition(
      playerPosition,
      direction * 6 * WORLD_POSITION_UNITS_PER_TILE,
      2 * WORLD_POSITION_UNITS_PER_TILE,
    );

    const sourcePatch = requiredCore(envelope);
    const sourceRabbit = sourcePatch.populations
      .find(({ species }) => species === "marsh-rabbit")?.members[0]?.actor;
    const sourceFox = sourcePatch.populations
      .find(({ species }) => species === "marsh-fox")?.members[0]?.actor;
    if (sourceRabbit === undefined || sourceFox === undefined) {
      throw new Error("marsh-edge cue fixture omitted its rabbit/fox web");
    }
    const adoptedEnvelope = resealedEnvelope(envelope, {
      coreEcology: serializeCoreEcologyAggregatePatch(promoteFixtureActors(sourcePatch, [
        sourceRabbit.identity.stableId,
        sourceFox.identity.stableId,
      ])),
    });
    let patch = requiredActiveLegacyCore(adoptedEnvelope);
    patch = setCoreEcologyAggregatePatchMaterializedActors(patch, {
      atTick: patch.updatedAtTick,
      actorIds: [sourceRabbit.identity.stableId, sourceFox.identity.stableId],
    });
    const rabbit = coreActors(patch).find(({ identity }) => (
      identity.stableId === sourceRabbit.identity.stableId
    ));
    const fox = coreActors(patch).find(({ identity }) => (
      identity.stableId === sourceFox.identity.stableId
    ));
    if (rabbit === undefined || fox === undefined) {
      throw new Error("v25 adoption lost the promoted marsh-edge cue actors");
    }
    const positionedRabbit = repositionCoreWildlifeActor(rabbit, {
      atTick: patch.updatedAtTick,
      position: rabbitPosition,
      heading: 250_000,
    });
    const positionedFox = replaceCoreWildlifeActorPhysiology(
      repositionCoreWildlifeActor(fox, {
        atTick: patch.updatedAtTick,
        position: foxPosition,
        heading: 750_000,
      }),
      {
        atTick: patch.updatedAtTick,
        needs: { ...fox.needs, hunger: 1_000_000 },
        condition: fox.condition,
      },
    );
    patch = replaceCoreEcologyAggregatePatchActor(patch, positionedRabbit);
    patch = replaceCoreEcologyAggregatePatchActor(patch, positionedFox);
    let displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      if (
        actor.identity.stableId === rabbit.identity.stableId
        || actor.identity.stableId === fox.identity.stableId
      ) continue;
      patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
        atTick: patch.updatedAtTick,
        position: translateWorldPosition(
          playerPosition,
          -direction * (20 + displacedOrdinal) * WORLD_POSITION_UNITS_PER_TILE,
          (displacedOrdinal % 5 - 2) * WORLD_POSITION_UNITS_PER_TILE,
        ),
        heading: actor.address.heading,
      }));
      displacedOrdinal += 1;
    }
    const nextEnvelope = resealedEnvelope(adoptedEnvelope, {
      world: serializeWorld(world),
      player,
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save(recordWithEnvelope(record, nextEnvelope));
    initial.destroy();
    scheduledFrame = undefined;

    const runtime = await createTideweftRuntime(repository);
    soundscapePlay.mockClear();
    advancePlayerSteps(runtime, 10);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump"))
      .toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-marsh-rabbit-alarm-thump",
    )).toHaveLength(0);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip"))
      .toHaveLength(1);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "Marsh fox",
      text: "YIP.",
      presentationKind: "animal-call",
      animalCallKind: "marsh-fox-call",
      assertive: false,
    });
    expect(runtime.getUIView().announcement?.message).not.toContain("soft thump");
    expect(runtime.getUIView().announcement?.message).not.toContain("brief yip nearby");

    await runtime.save();
    const after = requiredEnvelope(repository);
    const afterCore = requiredCore(after);
    const savedRabbit = coreActors(afterCore)
      .find(({ identity }) => identity.stableId === rabbit.identity.stableId);
    const savedFox = coreActors(afterCore)
      .find(({ identity }) => identity.stableId === fox.identity.stableId);
    if (savedRabbit === undefined || savedFox === undefined) {
      throw new Error("marsh-edge actors did not persist after their event");
    }
    expect(savedRabbit.intent.kind).toBe("alarm");
    expect(savedRabbit.address.position).toEqual(rabbitPosition);
    expect(savedRabbit.memories.some(({ kind }) => kind === "movement")).toBe(false);
    expect(savedFox.intent.kind).toBe("pursue");
    expect(worldPositionDelta(foxPosition, savedFox.address.position)).not.toEqual({ x: 0, y: 0 });
    const movementEvidence = savedFox.memories.find(({ kind }) => kind === "movement")
      ?.environmentalEvidence;
    expect(movementEvidence).toMatchObject({
      kind: "canid-pawprints",
      position: savedFox.address.position,
      itemConsumption: "none",
      disclosure: "direct-observation-required",
    });

    const durableCore = after.regionalEcology;
    runtime.destroy();
    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(durableCore);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump"))
      .toHaveLength(0);
    expect(soundscapePlay.mock.calls.filter(
      ([cue]) => cue === "vocalization-marsh-rabbit-alarm-thump",
    )).toHaveLength(0);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip"))
      .toHaveLength(0);
    resumed.destroy();
  }, 45_000);

  it("routes a fresh fox pursuit yip through shared hearing and reloads without replay", async () => {
    const { runtime, repository, foxActorId, rabbitActorId } =
      await createFoxEventBoundaryRuntime();
    const perceptionSpy = vi.spyOn(humanPerception, "collectExistingHumanObservations");
    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === foxActorId))
      .toBe(true);
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === foxActorId))
      .toBe(false);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip"))
      .toHaveLength(1);
    expect(runtime.getUIView().expressionCaption).toMatchObject({
      speakerLabel: "An animal",
      text: "CALL.",
      presentationKind: "animal-call",
      animalCallKind: "animal-call",
      assertive: false,
    });
    expect(runtime.getUIView().announcement?.message).not.toContain("brief yip nearby");

    await runtime.save();
    const saved = requiredEnvelope(repository);
    const savedWorld = deserializeWorld(saved.world);
    const savedCore = requiredRegionalCoreOwner(saved, foxActorId);
    const savedFox = requiredCoreActor(savedCore, foxActorId);
    const admissions = saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
      (record): record is CoreWildlifePursuitCallExpressionAdmissionRecord => (
        record.kind === "core-wildlife-pursuit-call"
      ),
    );
    expect(admissions).toHaveLength(1);
    const admission = admissions[0];
    if (admission === undefined) throw new Error("Fox pursuit voice fixture omitted admission");
    expect(admission).toMatchObject({
      kind: "core-wildlife-pursuit-call",
      sourceActorId: foxActorId,
      sourceOwnerKey: savedCore.patchKey,
      targetActorId: rabbitActorId,
      admittedAtPlayerStepPhase: 0,
      acceptedAtTick: savedWorld.meta.completedTick,
    });
    expect(savedFox).toMatchObject({
      updatedAtTick: admission.acceptedAtTick,
      intent: {
        kind: "pursue",
        cause: { kind: "perception", referenceId: admission.sourceObservationId },
        focusObservationId: admission.sourceObservationId,
        resourceReference: {
          resourceId: rabbitActorId,
          observationId: admission.sourceObservationId,
          foodClass: "live-prey",
          sourceKind: "living-actor",
        },
      },
    });
    expect(savedFox.memories.filter(({ eventId }) => (
      eventId === admission.triggerEventId
    ))).toEqual([expect.objectContaining({
      kind: "pursuit",
      referenceId: rabbitActorId,
      observationId: admission.sourceObservationId,
      atTick: admission.acceptedAtTick,
    })]);
    const sample = saved.perceptionCarry.actorVocalizationSamples[admission.sampleOrdinal];
    if (sample === undefined) throw new Error("Fox pursuit voice fixture omitted its sample");
    const acoustics = situatedExpressionAcoustics({
      meaning: "marsh-fox-pursuit-yip",
      volume: "spoken",
    });
    expect(sample).toMatchObject({
      expressionEventId: admission.eventId,
      sourceActorId: foxActorId,
      position: savedFox.address.position,
      soundClass: "animal-call",
      soundInterrupt: "none",
      soundLoudness: acoustics.loudness,
      soundRangeUnits: acoustics.rangeUnits,
    });
    const channel = saved.perceptionCarry.situatedExpressionChannels.channels.find(
      ({ sourceActorId }) => sourceActorId === foxActorId,
    );
    expect(channel?.state.active).toMatchObject({
      eventId: admission.eventId,
      triggerEventId: admission.triggerEventId,
      position: savedFox.address.position,
      meaning: "marsh-fox-pursuit-yip",
      family: "animal-signal",
      tone: "restrained",
      volume: "spoken",
      knowledgeBasis: "self-perceived-prey",
      vocalization: "marsh-fox-pursuit-yip",
      priority: 340_000,
      durationSteps: 6,
      audioAcknowledged: true,
    });
    expect(channel?.reception).toMatchObject({
      eventId: admission.eventId,
      sourceActorId: foxActorId,
      receivedAtTick: admission.acceptedAtTick,
      kind: "heard-unseen",
    });
    const durableCarry = stableStringify(saved.perceptionCarry);
    runtime.destroy();

    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    // Other real animal events may retain their own unexpired presentation.
    // Reload must not resurrect this consumed heard-unseen fox call.
    expect(resumed.getUIView().expressionCaption?.id).not.toBe(admission.eventId);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip")).toEqual([]);
    await resumed.save();
    expect(stableStringify(requiredEnvelope(repository).perceptionCarry)).toBe(durableCarry);

    advancePlayerSteps(resumed, 10);
    await resumed.save();
    const propagated = requiredEnvelope(repository);
    const propagatedWorld = deserializeWorld(propagated.world);
    const foxIntervals = perceptionSpy.mock.calls.flatMap(([input], ordinal) => (
      input.supplementalSoundSamples?.some(({ id }) => id === sample.id)
        ? [{ input, ordinal }] : []
    ));
    expect(foxIntervals).toHaveLength(1);
    const foxInterval = foxIntervals[0];
    if (foxInterval === undefined) throw new Error("Fox yip omitted its human-hearing interval");
    expect(foxInterval.input.surfaceSoundSampleIds).toContain(sample.id);
    expect(foxInterval.input.supplementalSoundSamples?.filter(({ id }) => id === sample.id))
      .toEqual([sample]);
    const foxBatches: ReturnType<typeof humanPerception.collectExistingHumanObservations> =
      perceptionSpy.mock.results[foxInterval.ordinal]!.value;
    const foxObservations = foxBatches.flatMap(({ observations }) => (
      observations.filter(({ id }) => id.endsWith(`-${sample.id}`))
    ));
    expect(foxObservations.length).toBeGreaterThan(0);
    expect(foxObservations.every((observation) => (
      observation.channel === "hearing"
      && observation.perceivedClass === "animal-call"
      && observation.interrupt === "none"
      && observation.identification === "anonymous"
      && observation.subjectId === null
      && observation.area.radiusUnits > 0
    ))).toBe(true);
    const humanCallBeliefs = propagatedWorld.residents.flatMap((resident) => {
      const matching = resident.perception.beliefs.filter((belief) => (
        belief.channel === "hearing"
        && belief.lastObservedTick === propagatedWorld.meta.completedTick
        && belief.perceivedClass === "animal-call"
      ));
      expect(new Set(matching.map(({ sourceObservationId }) => sourceObservationId)).size)
        .toBe(matching.length);
      const foxReceipts = matching.filter(({ sourceObservationId }) => (
        sourceObservationId === `hp-h-${propagatedWorld.meta.completedTick}-${resident.id}-${sample.id}`
      ));
      expect(foxReceipts.length).toBeLessThanOrEqual(1);
      expect(matching.every(({ identification, subjectId, sourceObservationId }) => (
        identification === "anonymous"
        && subjectId === null
        && sourceObservationId.includes("-av-")
      ))).toBe(true);
      return foxReceipts;
    });
    expect(humanCallBeliefs.length).toBeGreaterThanOrEqual(2);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip")).toEqual([]);
    advancePlayerSteps(resumed, 10);
    expect(perceptionSpy.mock.calls.filter(([input]) => (
      input.supplementalSoundSamples?.some(({ id }) => id === sample.id)
    ))).toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip")).toEqual([]);
    resumed.destroy();
  }, 45_000);

  it("consumes one real pending fox call after a warm signed-window rebase without halting or replay", async () => {
    const projectionSpy = vi.spyOn(regionalEcologyStateV6, "projectRegionalEcologyStateV6ActiveState");
    const fixture = await createFoxEventBoundaryRuntime({ initialWestRebaseBoundary: true });
    const { runtime, repository } = fixture;
    const sourceActorId = fixture.foxActorId;
    const preyActorId = fixture.rabbitActorId;
    const cue = "fox-yip";
    const perceptionSpy = vi.spyOn(humanPerception, "collectExistingHumanObservations");
    const projectedSources = (projection: RegionalEcologyStateV6ActiveProjection) => [
      ...projection.base.base.base.base.base.residents,
      ...projection.base.base.base.base.alpineResidents,
      ...projection.base.base.base.polarShoreResidents,
      ...projection.base.base.coldShoreResidents,
      ...projection.base.polarConsumerResidents,
      ...projection.breadthResidents,
    ];
    try {
      // Perceived-prey pursuit is produced by the ordinary
      // world step. No call, sample, admission or result is injected.
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const pending = requiredEnvelope(repository);
      const world = deserializeWorld(pending.world);
      const travel = restorePlayerRegionalTravel(world.meta.rootSeed, pending.player, pending.regionalTravel);
      if (travel === null) throw new Error("Warm vocal rebase lost its initial signed frame");
      const admission = pending.perceptionCarry.situatedExpressionAdmissions.records.find(({ kind, sourceActorId: id }) => (
        id === sourceActorId && kind === "core-wildlife-pursuit-call"
      ));
      if (admission?.kind !== "core-wildlife-pursuit-call") {
        throw new Error("Warm vocal rebase never earned its actual admitted cause");
      }
      expect(admission.targetActorId).toBe(preyActorId);
      expect(admission.acceptedAtTick).toBe(world.meta.completedTick);
      expect(admission.admittedAtPlayerStepPhase).toBe(0);
      const sample = pending.perceptionCarry.actorVocalizationSamples[admission.sampleOrdinal];
      if (sample === undefined) throw new Error("Warm vocal rebase omitted its real sound");
      expect(sample.sourceActorId).toBe(sourceActorId);
      const beforeProjection = projectRegionalEcologyStateV6ActiveState(requiredRegionalEcologyV6(pending), {
        origin: travel.window.origin,
        terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
      });
      if (beforeProjection === null) throw new Error("Warm vocal rebase lost its real starting projection");
      const beforeOwner = projectedSources(beforeProjection).find(({ sourceKey }) => sourceKey === admission.sourceOwnerKey);
      const beforeSourceMembers = beforeOwner?.patch.populations.flatMap(({ members }) => members.filter(({ actor }) => (
        actor.identity.stableId === sourceActorId
      ))) ?? [];
      expect(beforeSourceMembers).toHaveLength(1);
      expect(beforeSourceMembers[0]?.materialization).toBe("materialized");
      expect(beforeSourceMembers[0]?.actor.address.position).toEqual(sample.position);
      expect(projectedSources(beforeProjection).flatMap(({ patch }) => patch.populations.flatMap(({ members }) => (
        members.filter(({ actor }) => actor.identity.stableId === preyActorId)
      )))).toMatchObject([{ materialization: "materialized" }]);
      const audioBeforeRebase = soundscapePlay.mock.calls.filter(([kind]) => kind === cue).length;
      const originBefore = travel.window.origin;
      const expectedOriginAfter = { x: originBefore.x - REGIONAL_TRAVEL_SHIFT_TILES, y: originBefore.y };
      const plannedProjection = projectRegionalEcologyStateV6ActiveState(requiredRegionalEcologyV6(pending), {
        origin: expectedOriginAfter,
        terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
      });
      if (plannedProjection === null) throw new Error("Warm edge fixture could not preflight its real projection");
      expect(projectedSources(plannedProjection).flatMap(({ patch }) => patch.populations.flatMap(({ members }) => (
        members.filter(({ actor }) => actor.identity.stableId === sourceActorId || actor.identity.stableId === preyActorId)
      ))).some(({ materialization }) => materialization === "coarse")).toBe(true);
      expect(Math.floor(pending.player.x / WORLD_POSITION_UNITS_PER_TILE)).toBe(REGIONAL_TRAVEL_SAFE_MIN_X);
      projectionSpy.mockClear();
      perceptionSpy.mockClear();
      runtime.dispatchRenderer({ type: "movement", vector: { x: -1, y: 0 } });
      let movementSteps = 0;
      while (movementSteps < 9 && runtime.getRenderView().terrain.worldTileOrigin?.x === originBefore.x) {
        advancePlayerSteps(runtime, 1);
        movementSteps += 1;
      }
      runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
      const originAfter = runtime.getRenderView().terrain.worldTileOrigin;
      expect(originAfter).toEqual(expectedOriginAfter);
      expect(movementSteps).toBeLessThan(10);
      expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
      const afterProjection = projectionSpy.mock.calls.flatMap(([, windowValue], index) => {
        const window = windowValue as { readonly origin: Readonly<{ x: number; y: number }> };
        const result = projectionSpy.mock.results[index];
        return window.origin.x === originAfter?.x && window.origin.y === originAfter?.y
          && result?.type === "return" && result.value !== null
          ? [result.value] : [];
      }).at(-1);
      if (afterProjection === undefined) throw new Error("Warm movement never projected its actual rebased ecology");
      expect(afterProjection.atTick).toBe(world.meta.completedTick);
      const afterSources = projectedSources(afterProjection);
      const afterOwner = afterSources.find(({ sourceKey }) => sourceKey === admission.sourceOwnerKey);
      const afterSourceMembers = afterOwner?.patch.populations.flatMap(({ members }) => members.filter(({ actor }) => (
        actor.identity.stableId === sourceActorId
      ))) ?? [];
      const afterPreyMembers = afterSources.flatMap(({ patch }) => patch.populations.flatMap(({ members }) => (
        members.filter(({ actor }) => actor.identity.stableId === preyActorId)
      )));
      // This must exercise a genuine representation transition, not merely a
      // new origin that leaves the exact original authority available.
      expect(afterOwner === undefined
        || afterSourceMembers.some(({ materialization }) => materialization === "coarse")
        || afterPreyMembers.some(({ materialization }) => materialization === "coarse"))
        .toBe(true);
      const originalFrameCorner = worldPositionAtWindowTile(travel.window, 0);
      const sampleDelta = worldPositionDelta(originalFrameCorner, sample.position);
      const sampleOutsideAfterRebase = sampleDelta.x
        + REGIONAL_TRAVEL_SHIFT_TILES * WORLD_POSITION_UNITS_PER_TILE
        >= REGIONAL_TRAVEL_COLUMNS * WORLD_POSITION_UNITS_PER_TILE;
      // A fox can remain inside while its exact prey loses materialization.
      // This is unavailable pursuit authority, not positive heard evidence.
      expect(sampleOutsideAfterRebase || afterOwner === undefined
        || afterSourceMembers.some(({ materialization }) => materialization === "coarse")
        || afterPreyMembers.some(({ materialization }) => materialization === "coarse")).toBe(true);
      expect(perceptionSpy.mock.calls.some(([input]) => input.supplementalSoundSamples?.some(({ id }) => id === sample.id)))
        .toBe(false);

      // Stay warm until the ordinary T+1 boundary. Strict pending cold-load
      // authority is a distinct contract, not bypassed by this witness.
      advancePlayerSteps(runtime, 10 - movementSteps);
      expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
      const receiptIntervals = perceptionSpy.mock.calls.flatMap(([input], index) => (
        input.supplementalSoundSamples?.some(({ id }) => id === sample.id) ? [{ input, index }] : []
      ));
      expect(receiptIntervals).toHaveLength(1);
      const receiptInterval = receiptIntervals[0];
      if (receiptInterval === undefined) throw new Error("Warm rebased call never reached its human audience");
      expect(receiptInterval.input.targetTick).toBe(world.meta.completedTick + 1);
      expect(receiptInterval.input.supplementalSoundSamples?.filter(({ id }) => id === sample.id)).toEqual([sample]);
      expect(receiptInterval.input.surfaceSoundSampleIds).not.toContain(sample.id);
      const batches: ReturnType<typeof humanPerception.collectExistingHumanObservations> =
        perceptionSpy.mock.results[receiptInterval.index]!.value;
      const observations = batches.flatMap(({ observations }) => (
        observations.filter(({ id }) => id.endsWith(`-${sample.id}`))
      ));
      // A source outside the inspected frame is not a positive-hearing
      // witness. Any lawful receipt must remain anonymous; the existing six
      // nearby cases separately cover positive, masked and rejected hearing.
      expect(observations.every(({ channel, perceivedClass, subjectId, identification, interrupt, area }) => (
        channel === "hearing" && perceivedClass === "animal-call" && subjectId === null
        && identification === "anonymous" && interrupt === "none" && area.radiusUnits > 0
      ))).toBe(true);
      expect(soundscapePlay.mock.calls.filter(([kind]) => kind === cue)).toHaveLength(audioBeforeRebase);
      await runtime.save();
      const consumed = requiredEnvelope(repository);
      expect(deserializeWorld(consumed.world).meta.completedTick).toBe(world.meta.completedTick + 1);
      expect(consumed.perceptionCarry.actorVocalizationSamples.some(({ id }) => id === sample.id)).toBe(false);
      advancePlayerSteps(runtime, 10);
      expect(perceptionSpy.mock.calls.filter(([input]) => input.supplementalSoundSamples?.some(({ id }) => id === sample.id)))
        .toHaveLength(1);
      expect(soundscapePlay.mock.calls.filter(([kind]) => kind === cue)).toHaveLength(audioBeforeRebase);
    } finally { runtime.destroy(); }
  }, 60_000);

  it("keeps one real caption-refused fox call through a warm signed-window rebase without replay", async () => {
    vi.resetModules();
    const frames: Array<Readonly<{
      targetTick: number;
      samples: readonly PhysicalSoundSample[];
      surfaceSoundSampleIds: readonly string[];
      observations: readonly ActorObservation[];
    }>> = [];
    vi.doMock("./humanPerception", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./humanPerception")>();
      return {
        ...actual, HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES: 0,
        collectExistingHumanObservations: (input: Parameters<typeof actual.collectExistingHumanObservations>[0]) => {
          const batches = actual.collectExistingHumanObservations(input);
          frames.push({
            targetTick: input.targetTick, samples: structuredClone(input.physicalSoundSamples ?? []),
            surfaceSoundSampleIds: [...(input.surfaceSoundSampleIds ?? [])],
            observations: batches.flatMap(({ observations }) => observations),
          });
          return batches;
        },
      };
    });
    let runtime: TideweftRuntime | null = null;
    let projectionSpy: MockInstance<typeof projectRegionalEcologyStateV6ActiveState> | null = null;
    try {
      const projectionModule = await import("./regionalEcologyStateV6");
      projectionSpy = vi.spyOn(projectionModule, "projectRegionalEcologyStateV6ActiveState");
      const runtimeModule = await import("./runtime");
      const fixture = await createFoxEventBoundaryRuntime({
        initialWestRebaseBoundary: true, createRuntime: runtimeModule.createTideweftRuntime,
      });
      runtime = fixture.runtime;
      runtime.expressionDiagnostics!.setEnabled(true);
      soundscapePlay.mockClear();
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      const pending = requiredEnvelope(fixture.repository);
      const tick = deserializeWorld(pending.world).meta.completedTick;
      const fox = requiredCoreActor(requiredRegionalCoreOwner(pending, fixture.foxActorId), fixture.foxActorId);
      const decisions = runtime.expressionDiagnostics!.getSnapshot({ sourceActorId: fixture.foxActorId }).records;
      const refused = decisions.filter(({ reason, intent }) => reason === "sound-budget"
        && intent.meaning === "marsh-fox-pursuit-yip");
      expect(refused).toHaveLength(1);
      const decision = refused[0]!;
      expect(decision.completedTick).toBe(tick);
      expect(decision.event).toBeNull();
      expect(decision.admission).toBeNull();
      expect(decision.intent).toMatchObject({ sourceActorId: fixture.foxActorId, position: fox.address.position, volume: "spoken" });
      expect(fox.intent).toMatchObject({
        kind: "pursue", enteredAtTick: tick,
        resourceReference: { resourceId: fixture.rabbitActorId, foodClass: "live-prey", sourceKind: "living-actor" },
      });
      expect(fox.memories.filter(({ eventId }) => eventId === decision.intent.triggerEventId)).toEqual([
        expect.objectContaining({ kind: "pursuit", referenceId: fixture.rabbitActorId, observationId: fox.intent.focusObservationId, atTick: tick }),
      ]);
      expect(pending.perceptionCarry.actorVocalizationSamples).toEqual([]);
      expect(pending.perceptionCarry.situatedExpressionAdmissions.records).toEqual([]);
      expect(pending.perceptionCarry.situatedExpressionChannels.channels).toEqual([]);
      const expressionEventId = situatedExpressionEventIdForTrigger(fixture.foxActorId, decision.intent.triggerEventId);
      if (expressionEventId === null) throw new Error("Actual refused pursuit lost its canonical event identity");
      const eventHash = hashCanonical({ domain: "marsh-fox-pursuit-call:v1", eventId: expressionEventId, sourceActorId: fixture.foxActorId });
      const acoustics = situatedExpressionAcoustics(decision.intent);
      const originalSample: PhysicalSoundSample = {
        id: `fpc-${eventHash}`, acousticEventId: `fox-pursuit-call:v1:${eventHash}`,
        sourceId: fixture.foxActorId, position: decision.intent.position,
        soundLoudness: acoustics.loudness, soundRangeUnits: acoustics.rangeUnits,
        soundClass: "animal-call", soundInterrupt: "none",
      };
      const audioCount = soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip").length;
      const rebased = await rebaseRealPendingFoxWest(fixture, projectionModule, projectionSpy);
      expect(rebased.rebased.perceptionCarry.actorVocalizationSamples).toEqual([]);
      expect(frames.some(({ samples }) => samples.some(({ id }) => id === originalSample.id))).toBe(false);
      advancePlayerSteps(runtime, 10 - rebased.movementSteps);
      expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
      const receipts = frames.filter(({ samples }) => samples.some(({ id }) => id === originalSample.id));
      expect(receipts).toHaveLength(1);
      expect(receipts[0]!.targetTick).toBe(tick + 1);
      expect(receipts[0]!.samples.filter(({ id }) => id === originalSample.id)).toEqual([originalSample]);
      expect(receipts[0]!.surfaceSoundSampleIds).not.toContain(originalSample.id);
      // This real edge source need not be heard. A lawful receipt reveals no
      // prey, intent or source identity, and never becomes a positive-hearing claim.
      expect(receipts[0]!.observations.filter(({ id }) => id.endsWith(`-${originalSample.id}`)).every((observation) => (
        observation.channel === "hearing" && observation.perceivedClass === "animal-call"
        && observation.identification === "anonymous" && observation.subjectId === null
        && observation.interrupt === "none" && observation.area.radiusUnits > 0
      ))).toBe(true);
      advancePlayerSteps(runtime, 10);
      expect(frames.filter(({ samples }) => samples.some(({ id }) => id === originalSample.id))).toHaveLength(1);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip")).toHaveLength(audioCount);
    } finally {
      runtime?.destroy(); scheduledFrame = undefined;
      projectionSpy?.mockRestore();
      vi.doUnmock("./humanPerception"); vi.resetModules();
    }
  }, 90_000);

  it("restores one real admitted fox pending save after a signed-window rebase without replay", async () => {
    const projectionModule = await import("./regionalEcologyStateV6");
    const projectionSpy = vi.spyOn(projectionModule, "projectRegionalEcologyStateV6ActiveState");
    const runtimeModule = await import("./runtime");
    const humanModule = await import("./humanPerception");
    const fixture = await createFoxEventBoundaryRuntime({
      initialWestRebaseBoundary: true, createRuntime: runtimeModule.createTideweftRuntime,
    });
    let runtime = fixture.runtime;
    try {
      soundscapePlay.mockClear();
      advancePlayerSteps(runtime, 10);
      const rebased = await rebaseRealPendingFoxWest(fixture, projectionModule, projectionSpy);
      const admission = rebased.pending.perceptionCarry.situatedExpressionAdmissions.records.find((record) => (
        record.kind === "core-wildlife-pursuit-call" && record.sourceActorId === fixture.foxActorId
      ));
      if (admission?.kind !== "core-wildlife-pursuit-call") throw new Error("Actual rebased pursuit supplied no admitted call");
      const sample = rebased.pending.perceptionCarry.actorVocalizationSamples[admission.sampleOrdinal];
      if (sample === undefined) throw new Error("Actual admitted pursuit lost its original sample");
      const rabbitAdmission = rebased.pending.perceptionCarry.situatedExpressionAdmissions.records.find((record) => (
        record.kind === "core-wildlife-alarm" && record.sourceActorId === fixture.rabbitActorId
      ));
      if (rabbitAdmission?.kind !== "core-wildlife-alarm") throw new Error("Actual rebased rabbit supplied no admitted alarm");
      const rabbitSample = rebased.pending.perceptionCarry.actorVocalizationSamples[rabbitAdmission.sampleOrdinal];
      if (rabbitSample === undefined) throw new Error("Actual admitted rabbit alarm lost its original sample");
      const tick = deserializeWorld(rebased.pending.world).meta.completedTick;
      expect(admission).toMatchObject({ sourceOwnerKey: rebased.sourceOwnerKey, targetActorId: fixture.rabbitActorId, acceptedAtTick: tick, admittedAtPlayerStepPhase: 0 });
      expect(rebased.rebased.perceptionCarry.actorVocalizationSamples).toContainEqual(sample);
      runtime.destroy(); scheduledFrame = undefined; soundscapePlay.mockClear();
      const repository = new MemoryRepository(rebased.record);
      runtime = await runtimeModule.createTideweftRuntime(repository);
      expect(repository.snapshot()).toEqual(rebased.record);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(runtime.getUIView().title.hasSave).toBe(true);
      expect(soundscapePlay).not.toHaveBeenCalled();
      await runtime.save();
      const restored = requiredEnvelope(repository);
      expect(restored.perceptionCarry).toEqual(rebased.rebased.perceptionCarry);
      expect(restored.world).toBe(rebased.rebased.world);
      expect(restored.regionalEcology).toBe(rebased.rebased.regionalEcology);
      expect(requiredCoreActor(requiredRegionalCoreOwner(restored, fixture.foxActorId), fixture.foxActorId))
        .toEqual(requiredCoreActor(requiredRegionalCoreOwner(rebased.rebased, fixture.foxActorId), fixture.foxActorId));
      const perceptionSpy = vi.spyOn(humanModule, "collectExistingHumanObservations");
      advancePlayerSteps(runtime, 10 - rebased.movementSteps);
      expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
      const frames = perceptionSpy.mock.calls.map(([input]) => input).filter(({ supplementalSoundSamples }) => (
        supplementalSoundSamples?.some(({ id }) => id === sample.id)
      ));
      expect(frames).toHaveLength(1);
      expect(frames[0]!.targetTick).toBe(tick + 1);
      expect(frames[0]!.supplementalSoundSamples?.filter(({ id }) => id === sample.id)).toEqual([sample]);
      expect(frames[0]!.surfaceSoundSampleIds).not.toContain(sample.id);
      const rabbitFrames = perceptionSpy.mock.calls.filter(([input]) => (
        input.supplementalSoundSamples?.some(({ id }) => id === rabbitSample.id)
      ));
      expect(rabbitFrames).toHaveLength(1);
      expect(rabbitFrames[0]![0].targetTick).toBe(tick + 1);
      expect(rabbitFrames[0]![0].supplementalSoundSamples?.filter(({ id }) => id === rabbitSample.id)).toEqual([rabbitSample]);
      await runtime.save();
      expect(requiredEnvelope(repository).perceptionCarry.actorVocalizationSamples.some(({ id }) => id === sample.id)).toBe(false);
      advancePlayerSteps(runtime, 10);
      expect(perceptionSpy.mock.calls.filter(([input]) => input.supplementalSoundSamples?.some(({ id }) => id === sample.id))).toHaveLength(1);
      expect(perceptionSpy.mock.calls.filter(([input]) => input.supplementalSoundSamples?.some(({ id }) => id === rabbitSample.id))).toHaveLength(1);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip")).toEqual([]);
    } finally { runtime.destroy(); projectionSpy.mockRestore(); }
  }, 90_000);

  it("keeps a lawful fox yip audible when optional expression capacity is saturated", async () => {
    vi.resetModules();
    const fallbackHumanObserverFrames: string[][] = [];
    const fallbackPhysicalSampleCounts: number[] = [];
    const fallbackFoxSampleIds: string[] = [];
    const fallbackFoxSamples: PhysicalSoundSample[] = [];
    vi.doMock("./humanPerception", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./humanPerception")>();
      return {
        ...actual,
        HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES: 0,
        collectExistingHumanObservations: (
          input: Parameters<typeof actual.collectExistingHumanObservations>[0],
        ) => {
          const batches = actual.collectExistingHumanObservations(input);
          const foxPhysicalSamples = (input.physicalSoundSamples ?? []).filter((sample) => (
            sample.soundClass === "animal-call"
            && sample.acousticEventId.startsWith("fox-pursuit-call:v1:")
          ));
          if (foxPhysicalSamples.length > 0) {
            expect(foxPhysicalSamples).toHaveLength(1);
            expect(input.surfaceSoundSampleIds).toContain(foxPhysicalSamples[0]?.id);
            fallbackFoxSamples.push(...structuredClone(foxPhysicalSamples));
            fallbackFoxSampleIds.push(...foxPhysicalSamples.map(({ id }) => id));
            fallbackPhysicalSampleCounts.push(input.physicalSoundSamples?.length ?? 0);
            fallbackHumanObserverFrames.push(batches.flatMap((batch) => (
              batch.observations.some((observation) => (
                observation.channel === "hearing"
                && observation.perceivedClass === "animal-call"
                && foxPhysicalSamples.some(({ id }) => observation.id.endsWith(`-${id}`))
              ))
                ? [batch.observerId]
                : []
            )).sort());
            const heard = batches.flatMap(({ observations }) => observations.filter((observation) => (
              foxPhysicalSamples.some(({ id }) => observation.id.endsWith(`-${id}`))
            )));
            expect(heard.length).toBeGreaterThan(0);
            expect(heard.every((observation) => (
              observation.channel === "hearing"
              && observation.perceivedClass === "animal-call"
              && observation.interrupt === "none"
              && observation.identification === "anonymous"
              && observation.subjectId === null
              && observation.area.radiusUnits > 0
            ))).toBe(true);
          }
          return batches;
        },
      };
    });
    let runtime: TideweftRuntime | null = null;
    try {
      const saturatedRuntimeModule = await import("./runtime");
      const fixture = await createFoxEventBoundaryRuntime({
        createRuntime: saturatedRuntimeModule.createTideweftRuntime,
      });
      runtime = fixture.runtime;
      soundscapePlay.mockClear();

      advancePlayerSteps(runtime, 10);

      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip"))
        .toHaveLength(1);
      expect(runtime.getUIView().expressionCaption).toBeUndefined();
      await runtime.save();
      const saved = requiredEnvelope(fixture.repository);
      const savedFox = requiredCoreActor(
        requiredRegionalCoreOwner(saved, fixture.foxActorId), fixture.foxActorId,
      );
      expect(saved.perceptionCarry.actorVocalizationSamples).toEqual([]);
      expect(saved.perceptionCarry.situatedExpressionAdmissions.records.filter(
        (record) => record.kind === "core-wildlife-pursuit-call",
      )).toEqual([]);
      expect(saved.perceptionCarry.situatedExpressionChannels.channels.some(
        ({ sourceActorId }) => sourceActorId === fixture.foxActorId,
      )).toBe(false);

      runtime.destroy();
      runtime = null;
      scheduledFrame = undefined;
      soundscapePlay.mockClear();
      runtime = await saturatedRuntimeModule.createTideweftRuntime(fixture.repository);
      expect(runtime.getUIView().saveWarning).toBeUndefined();
      expect(runtime.getUIView().expressionCaption).toBeUndefined();
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip")).toEqual([]);

      advancePlayerSteps(runtime, 10);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip")).toEqual([]);
      await runtime.save();
      const propagated = requiredEnvelope(fixture.repository);
      const propagatedWorld = deserializeWorld(propagated.world);
      const freshHumanHearingByResident = propagatedWorld.residents.flatMap((resident) => {
        const matching = resident.perception.beliefs.filter((belief) => (
          belief.channel === "hearing"
          && belief.lastObservedTick === propagatedWorld.meta.completedTick
          && belief.perceivedClass === "animal-call"
        ));
        // Chicken and fox calls can coexist. Conservation is one receipt per
        // physical event, not one animal-call belief for the entire world.
        expect(new Set(matching.map(({ sourceObservationId }) => sourceObservationId)).size)
          .toBe(matching.length);
        const foxReceipts = matching.filter(({ sourceObservationId }) => (
          fallbackFoxSampleIds.some((id) => sourceObservationId.endsWith(`-${id}`))
        ));
        expect(foxReceipts.length).toBeLessThanOrEqual(1);
        expect(matching.every(({ identification, subjectId }) => (
          identification === "anonymous" && subjectId === null
        ))).toBe(true);
        return foxReceipts.length > 0 ? [resident.identity.stableId] : [];
      }).sort();
      expect(fallbackHumanObserverFrames).toHaveLength(1);
      expect(fallbackHumanObserverFrames[0]?.length).toBeGreaterThanOrEqual(2);
      expect(freshHumanHearingByResident).toEqual(fallbackHumanObserverFrames[0]);
      expect(fallbackPhysicalSampleCounts).toHaveLength(1);
      expect(fallbackFoxSampleIds).toHaveLength(1);
      expect(fallbackPhysicalSampleCounts[0]).toBeLessThanOrEqual(8);
      const foxAcoustics = situatedExpressionAcoustics({ meaning: "marsh-fox-pursuit-yip", volume: "spoken" });
      expect(fallbackFoxSamples).toMatchObject([{
        sourceId: fixture.foxActorId,
        position: savedFox.address.position,
        soundClass: "animal-call",
        soundInterrupt: "none",
        soundLoudness: foxAcoustics.loudness,
        soundRangeUnits: foxAcoustics.rangeUnits,
      }]);
      advancePlayerSteps(runtime, 10);
      expect(fallbackFoxSamples).toHaveLength(1);
      expect(fallbackHumanObserverFrames).toHaveLength(1);
      expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip")).toEqual([]);
    } finally {
      runtime?.destroy();
      scheduledFrame = undefined;
      vi.doUnmock("./humanPerception");
      vi.resetModules();
    }
  }, 120_000);

  it(`${ALPHA30_BODY_BEARING_SAVE_ADOPTION_OWNER_INTENT} adopts one body-bearing v22 save exactly once`, async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "alpha29 historical body adoption",
      posture: "gale",
      sessionShape: "wander",
    });
    advancePlayerSteps(initial, 20);
    await initial.save();
    const currentEnvelope = requiredEnvelope(repository);
    const fixture = historicalBodyBearingV24Fixture(currentEnvelope);
    const {
      patch: historicalV24Core,
      beforeRabbitPopulation,
      foxActorId,
      rabbitActorId,
    } = fixture;
    const afterRabbitPopulation = historicalV24Core.populations.find(
      ({ species }) => species === "marsh-rabbit",
    );
    if (afterRabbitPopulation === undefined) {
      throw new Error("mortality removed the rabbit population record");
    }
    expect(coreActors(historicalV24Core).some(({ identity }) => (
      identity.stableId === rabbitActorId
    )))
      .toBe(false);
    expect(afterRabbitPopulation.baselinePopulationSize)
      .toBe(beforeRabbitPopulation.baselinePopulationSize);
    expect(afterRabbitPopulation.populationSize)
      .toBe(beforeRabbitPopulation.populationSize - 1);
    expect(afterRabbitPopulation.reserveUnits)
      .toBe(beforeRabbitPopulation.reserveUnits + beforeRabbitPopulation.members[0]!.representedUnits - 1);
    expect(historicalV24Core.mortalityTransactions).toHaveLength(1);
    expect(historicalV24Core.mortalityTransactions[0]).toMatchObject({
      mortalityOrdinal: 0,
      removedPopulationUnits: 1,
      event: {
        attackerId: foxActorId,
        victimId: rabbitActorId,
        cause: "predator-contact",
        outcome: "death",
        healthAfter: 0,
      },
      retiredActor: {
        identity: { stableId: rabbitActorId },
        condition: { health: 0 },
      },
    });
    expect(historicalV24Core.carcasses).toHaveLength(1);
    expect(historicalV24Core.carcasses[0]).toMatchObject({
      sourceActorId: rabbitActorId,
      sourceSpecies: "marsh-rabbit",
      bodySizeUnits: 3,
      originalResourceUnits: 4,
      remainingResourceUnits: 3,
      consumedResourceUnits: 1,
      currentClaimantActorId: foxActorId,
    });
    expect(coreActors(historicalV24Core).find(
      ({ identity }) => identity.stableId === foxActorId,
    )?.needs.hunger).toBeLessThan(1_000_000);

    const alpha29Core = domesticPenCoreEcologyFromCurrent(historicalV24Core);
    const {
      integrity: _currentIntegrity,
      playerExpressionRecency: _currentPlayerExpressionRecency,
      regionalEcology: _currentRegionalEcology,
      ...alpha29EnvelopeRoots
    } = currentEnvelope;
    const alpha29Base = {
      ...alpha29EnvelopeRoots,
      player: legacyPlayerWithoutTimeAction(currentEnvelope.player),
      perceptionCarry: legacyPerceptionCarry(currentEnvelope.perceptionCarry),
      version: 22 as const,
      coreEcology: serializeCoreEcologyAggregatePatch(alpha29Core),
    };
    const alpha29Record = repository.snapshot();
    await repository.save({
      ...alpha29Record,
      payloadVersion: 22,
      updatedAt: alpha29Record.updatedAt + 1,
      worldJson: JSON.stringify({
        ...alpha29Base,
        integrity: gameSaveEnvelopeIntegrity(alpha29Base),
      }),
    });
    initial.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    await resumed.save();
    const adoptedEnvelope = requiredEnvelope(repository);
    const adopted = requiredCore(adoptedEnvelope);
    expect(repository.snapshot().payloadVersion).toBe(50);
    expect(adopted.derivation.kind).toBe("habitat-v11");
    expect(adopted.nextMortalityOrdinal).toBe(alpha29Core.nextMortalityOrdinal);
    expect(stableStringify(adopted.mortalityTransactions))
      .toBe(stableStringify(alpha29Core.mortalityTransactions));
    expect(stableStringify(adopted.carcasses)).toBe(stableStringify(alpha29Core.carcasses));
    expect(stableStringify(adopted.aggregatePopulations))
      .toBe(stableStringify(alpha29Core.aggregatePopulations));
    for (const oldPopulation of alpha29Core.populations) {
      expect(stableStringify(adopted.populations.find(({ species, populationKey }) => (
        species === oldPopulation.species && populationKey === oldPopulation.populationKey
      )))).toBe(stableStringify(oldPopulation));
    }
    for (const oldGroup of alpha29Core.groups.groups) {
      expect(stableStringify(adopted.groups.groups.find(
        ({ identity }) => identity.stableId === oldGroup.identity.stableId,
      ))).toBe(stableStringify(oldGroup));
    }
    expect(adopted.populations.filter(({ species }) => (
      species === "wild-boar" || species === "elk" || species === "gray-wolf"
    )).map(({ species }) => species).sort()).toEqual(["elk", "gray-wolf", "wild-boar"]);
    expect(adopted.mortalityTransactions).toHaveLength(1);
    expect(adopted.carcasses).toHaveLength(1);
    expect(coreActors(adopted).some(({ identity }) => identity.stableId === rabbitActorId))
      .toBe(false);
    expectHistoricalBodyAdoption(adoptedEnvelope, alpha29Core, foxActorId, rabbitActorId);
    const durableCore = adoptedEnvelope.regionalEcology;
    resumed.destroy();
    scheduledFrame = undefined;
    const secondResume = await createTideweftRuntime(repository);
    await secondResume.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(durableCore);
    const alreadyAdoptedRecord = repository.snapshot();
    const alreadyAdoptedEnvelope = requiredEnvelope(repository);
    const {
      integrity: _alreadyAdoptedIntegrity,
      playerExpressionRecency: _alreadyAdoptedPlayerExpressionRecency,
      regionalEcology: _alreadyAdoptedRegionalEcology,
      ...alreadyAdoptedRoots
    } = alreadyAdoptedEnvelope;
    const replayedV24Core = requiredRegionalEcology(alreadyAdoptedEnvelope)
      .root.legacyCohort?.sourcePatch;
    if (replayedV24Core === undefined) {
      throw new Error("replay fixture omitted its authenticated v24 source");
    }
    expect(replayedV24Core.derivation.kind).toBe("habitat-v11");
    const replayedV22Base = {
      ...alreadyAdoptedRoots,
      player: legacyPlayerWithoutTimeAction(alreadyAdoptedEnvelope.player),
      perceptionCarry: legacyPerceptionCarry(alreadyAdoptedEnvelope.perceptionCarry),
      version: 22 as const,
      coreEcology: serializeCoreEcologyAggregatePatch(replayedV24Core),
    };
    expect(deserializeCoreEcologyAggregatePatch(replayedV22Base.coreEcology)).not.toBeNull();
    await repository.save({
      ...alreadyAdoptedRecord,
      payloadVersion: 22,
      updatedAt: alreadyAdoptedRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...replayedV22Base,
        integrity: gameSaveEnvelopeIntegrity(replayedV22Base),
      }),
    });
    secondResume.destroy();
    scheduledFrame = undefined;
    const rejectedReplay = await createTideweftRuntime(repository);
    expect(rejectedReplay.getUIView().saveWarning?.message)
      .toBe("LOCAL AUTOSAVE UNREADABLE");
    rejectedReplay.destroy();
  }, 45_000);

  it(`${ALPHA31_BODY_BEARING_SAVE_ADOPTION_OWNER_INTENT} adopts one sealed body-bearing v23 save exactly once`, async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "alpha29 historical body adoption",
      posture: "gale",
      sessionShape: "wander",
    });
    advancePlayerSteps(initial, 20);
    await initial.save();
    const currentEnvelope = requiredEnvelope(repository);
    const {
      patch: current,
      foxActorId,
      rabbitActorId,
    } = historicalBodyBearingV24Fixture(currentEnvelope);
    expect(current.mortalityTransactions).toHaveLength(1);
    expect(current.carcasses).toHaveLength(1);
    expect(current.carcasses[0]).toMatchObject({
      sourceActorId: rabbitActorId,
      remainingResourceUnits: 3,
      consumedResourceUnits: 1,
      currentClaimantActorId: foxActorId,
    });

    const alpha30Core = regionalUplandCoreEcologyFromCurrent(current);
    if (alpha30Core.derivation.kind !== "habitat-v10") {
      throw new Error("Alpha-31 adoption fixture did not reconstruct frozen habitat v10");
    }
    const {
      integrity: _currentIntegrity,
      playerExpressionRecency: _currentPlayerExpressionRecency,
      regionalEcology: _currentRegionalEcology,
      version: _currentVersion,
      ...alpha30Roots
    } = currentEnvelope;
    const alpha30Base = {
      ...alpha30Roots,
      player: legacyPlayerWithoutTimeAction(currentEnvelope.player),
      perceptionCarry: legacyPerceptionCarry(currentEnvelope.perceptionCarry),
      version: 23 as const,
      coreEcology: serializeCoreEcologyAggregatePatch(alpha30Core),
    };
    const alpha30Record = repository.snapshot();
    await repository.save({
      ...alpha30Record,
      payloadVersion: 23,
      updatedAt: alpha30Record.updatedAt + 1,
      worldJson: JSON.stringify({
        ...alpha30Base,
        integrity: gameSaveEnvelopeIntegrity(alpha30Base),
      }),
    });
    initial.destroy();
    scheduledFrame = undefined;

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    await resumed.save();
    const adoptedEnvelope = requiredEnvelope(repository);
    const adopted = requiredCore(adoptedEnvelope);
    expect(repository.snapshot().payloadVersion).toBe(50);
    expect(adopted.derivation.kind).toBe("habitat-v11");
    expect(adopted.nextMortalityOrdinal).toBe(alpha30Core.nextMortalityOrdinal);
    expect(stableStringify(adopted.mortalityTransactions))
      .toBe(stableStringify(alpha30Core.mortalityTransactions));
    expect(stableStringify(adopted.carcasses)).toBe(stableStringify(alpha30Core.carcasses));
    expect(stableStringify(adopted.aggregatePopulations))
      .toBe(stableStringify(alpha30Core.aggregatePopulations));
    expect(stableStringify(adopted.groups)).toBe(stableStringify(alpha30Core.groups));
    for (const established of alpha30Core.populations) {
      expect(stableStringify(adopted.populations.find(({ species, populationKey }) => (
        species === established.species && populationKey === established.populationKey
      )))).toBe(stableStringify(established));
    }
    const establishedPopulationKeys = new Set(alpha30Core.populations.map(
      ({ populationKey }) => populationKey,
    ));
    const extensionPopulations = adopted.populations.filter(
      ({ populationKey }) => !establishedPopulationKeys.has(populationKey),
    );
    expect(extensionPopulations.map(({ species }) => species).sort()).toEqual(
      adopted.derivation.kind === "habitat-v11"
        ? adopted.derivation.habitat.populations.slice(-2)
            .filter(({ populationUnits }) => populationUnits > 0)
            .map(({ species }) => species)
            .sort()
        : [],
    );
    expect(extensionPopulations.every(({ species, members }) => (
      (species === "cougar" || species === "brown-bear")
      && members.every(({ materialization }) => materialization === "coarse")
    ))).toBe(true);
    expect(adopted.groups.groups.some(({ identity }) => (
      identity.species === "cougar" || identity.species === "brown-bear"
    ))).toBe(false);
    expectHistoricalBodyAdoption(adoptedEnvelope, alpha30Core, foxActorId, rabbitActorId);
    expect(stableStringify(adoptedEnvelope.player))
      .toBe(stableStringify({ ...alpha30Base.player, timeAction: null }));
    expect(stableStringify(adoptedEnvelope.perceptionCarry))
      .toBe(stableStringify({
        ...alpha30Base.perceptionCarry,
        version: 14,
        intervalStartPosition: currentEnvelope.perceptionCarry.intervalStartPosition,
        intervalStartFacingMilliRadians:
          currentEnvelope.perceptionCarry.intervalStartFacingMilliRadians,
        intervalStartWasSleeping:
          currentEnvelope.perceptionCarry.intervalStartWasSleeping,
        playerStepStateSamples: Array.from(
          { length: Number(alpha30Base.perceptionCarry.playerStepsSinceWorldTick) },
          () => null,
        ),
        playerStepStateAnchor: {
          version: 1,
          sampleOrdinal: Number(alpha30Base.perceptionCarry.playerStepsSinceWorldTick),
          stamina: alpha30Base.player.stamina,
          mode: alpha30Base.player.mode,
        },
        actorVocalizationSamples: [],
        animalContactAcousticCarry: { version: 1, records: [] },
        situatedExpressionAdmissions: { version: 1, records: [] },
        situatedExpressionCausalAuthority: { version: 1, records: [] },
        situatedExpressionChannels: { version: 1, channels: [] },
      }));

    for (const key of Object.keys(alpha30Base).filter((key) => (
      key !== "version"
      && key !== "coreEcology"
      && key !== "session"
      && key !== "player"
      && key !== "perceptionCarry"
    ))) {
      expect(stableStringify(adoptedEnvelope[key]), key)
        .toBe(stableStringify(alpha30Base[key as keyof typeof alpha30Base]));
    }

    const durable = adoptedEnvelope.regionalEcology;
    resumed.destroy();
    scheduledFrame = undefined;
    const secondResume = await createTideweftRuntime(repository);
    expect(secondResume.getUIView().saveWarning).toBeUndefined();
    await secondResume.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(durable);
    secondResume.destroy();
  }, 45_000);

  it(`${ALPHA30_RUNTIME_MORTALITY_EMERGENCE_OWNER_INTENT} composes current sight, pack pursuit, one exact death, and finite boar scavenging`, async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "alpha30 wolf runtime composition",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();

    let envelope = await adoptUntouchedFixtureCoreAsCurrent(
      repository,
      initial,
      requiredEnvelope(repository),
      (source) => {
        const rabbitPopulation = source.populations.find(
          ({ species }) => species === "marsh-rabbit",
        );
        const wolfPopulation = source.populations.find(
          ({ species }) => species === "gray-wolf",
        );
        const boarPopulation = source.populations.find(
          ({ species }) => species === "wild-boar",
        );
        const rabbitOrdinal = rabbitPopulation?.members[0]?.populationOrdinal;
        const boarOrdinal = boarPopulation?.members[0]?.populationOrdinal;
        const rabbitGroup = source.groups.groups.find(({ identity, memberOrdinals }) => (
          identity.species === "marsh-rabbit"
          && identity.populationKey === rabbitPopulation?.populationKey
          && memberOrdinals.includes(rabbitOrdinal ?? -1)
        ));
        const wolfGroup = source.groups.groups.find(({ identity, memberOrdinals }) => (
          identity.species === "gray-wolf"
          && identity.populationKey === wolfPopulation?.populationKey
          && memberOrdinals.length >= 2
        ));
        const boarGroup = source.groups.groups.find(({ identity, memberOrdinals }) => (
          identity.species === "wild-boar"
          && identity.populationKey === boarPopulation?.populationKey
          && memberOrdinals.includes(boarOrdinal ?? -1)
        ));
        if (
          rabbitPopulation === undefined
          || wolfPopulation === undefined
          || boarPopulation === undefined
          || rabbitOrdinal === undefined
          || boarOrdinal === undefined
          || wolfGroup === undefined
          || boarGroup === undefined
        ) throw new Error("Alpha30 adoption fixture omitted its exact groups");
        return [
          ...rabbitPopulation.members.filter(({ populationOrdinal }) => (
            rabbitGroup?.memberOrdinals.includes(populationOrdinal)
              ?? populationOrdinal === rabbitOrdinal
          )),
          ...wolfPopulation.members.filter(({ populationOrdinal }) => (
            wolfGroup.memberOrdinals.includes(populationOrdinal)
          )),
          ...boarPopulation.members.filter(({ populationOrdinal }) => (
            boarGroup.memberOrdinals.includes(populationOrdinal)
          )),
        ].map(({ actor }) => actor.identity.stableId);
      },
    );
    let world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    const player = structuredClone(envelope.player);
    const regional = restorePlayerRegionalTravel(
      world.meta.rootSeed,
      player,
      envelope.regionalTravel,
    );
    if (regional === null) throw new Error("Alpha30 runtime fixture could not restore its frame");
    const playerPosition = playerWorldPositionInRegionalWindow(regional.window, player);
    if (playerPosition === null || playerPosition.region.x !== 0 || playerPosition.region.y !== 0) {
      throw new Error("Alpha30 runtime fixture could not locate its compatibility-region player");
    }
    const direction: -1 | 1 = playerPosition.localX < REGION_WIDTH_UNITS / 2 ? 1 : -1;
    const preyPosition = translateWorldPosition(
      playerPosition,
      direction * 20 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    const openPackPosition = translateWorldPosition(
      preyPosition,
      -direction * 4 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    const towardPrey = direction > 0 ? 0 : 500_000;

    let patch = requiredActiveLegacyCore(envelope);
    const rabbitPopulation = patch.populations.find(({ species }) => species === "marsh-rabbit");
    const wolfPopulation = patch.populations.find(({ species }) => species === "gray-wolf");
    const boarPopulation = patch.populations.find(({ species }) => species === "wild-boar");
    const wolfGroup = patch.groups.groups.find(({ identity, memberOrdinals }) => (
      identity.species === "gray-wolf"
      && identity.populationKey === wolfPopulation?.populationKey
      && memberOrdinals.length >= 2
    ));
    const rabbitGroup = patch.groups.groups.find(({ identity, memberOrdinals }) => (
      identity.species === "marsh-rabbit"
      && identity.populationKey === rabbitPopulation?.populationKey
      && memberOrdinals.includes(rabbitPopulation?.members[0]?.populationOrdinal ?? -1)
    ));
    const boarGroup = patch.groups.groups.find(({ identity, memberOrdinals }) => (
      identity.species === "wild-boar"
      && identity.populationKey === boarPopulation?.populationKey
      && memberOrdinals.includes(boarPopulation?.members[0]?.populationOrdinal ?? -1)
    ));
    const rabbit = rabbitPopulation?.members[0]?.actor;
    const boar = boarPopulation?.members[0]?.actor;
    const packWolves = wolfPopulation?.members.filter(({ populationOrdinal }) => (
      wolfGroup?.memberOrdinals.includes(populationOrdinal)
    )).map(({ actor }) => actor) ?? [];
    if (
      rabbitPopulation === undefined
      || wolfPopulation === undefined
      || boarPopulation === undefined
      || rabbit === undefined
      || boar === undefined
      || wolfGroup === undefined
      || boarGroup === undefined
      || packWolves.length < 2
    ) throw new Error("Alpha30 runtime fixture omitted its rabbit, pack, or sounder actors");
    const rabbitId = rabbit.identity.stableId;
    const boarId = boar.identity.stableId;
    const packWolfIds = new Set(packWolves.map(({ identity }) => identity.stableId));
    const memberIdsForGroup = (
      population: NonNullable<typeof rabbitPopulation>,
      memberOrdinals: readonly number[],
    ) => population.members.filter(({ populationOrdinal }) => (
      memberOrdinals.includes(populationOrdinal)
    )).map(({ actor }) => actor.identity.stableId);
    const rabbitGroupIds = rabbitGroup === undefined
      ? [rabbitId]
      : memberIdsForGroup(rabbitPopulation, rabbitGroup.memberOrdinals);
    const wolfGroupIds = memberIdsForGroup(wolfPopulation, wolfGroup.memberOrdinals);
    const boarGroupIds = memberIdsForGroup(boarPopulation, boarGroup.memberOrdinals);
    const remotePosition = (ordinal: number) => translateWorldPosition(
      playerPosition,
      -direction * (20 + ordinal % 7) * WORLD_POSITION_UNITS_PER_TILE,
      (12 + ordinal % 5) * WORLD_POSITION_UNITS_PER_TILE,
    );
    const saveStage = async (
      sourceEnvelope: CurrentEnvelope,
      sourceWorld: ReturnType<typeof deserializeWorld>,
      sourcePatch: CoreEcologyAggregatePatchState,
    ): Promise<void> => {
      const nextEnvelope = resealedCurrentEnvelopeWithCorePatch(
        sourceEnvelope,
        sourcePatch,
        {
          world: serializeWorld(sourceWorld),
          player,
          // This fixture deliberately rewrites the ecology source between
          // stages. Drop its derived voice trajectory in the same synthetic
          // transaction so a prior rabbit thump is not left bound to an actor
          // locus the fixture just replaced.
          perceptionCarry: {
            ...sourceEnvelope.perceptionCarry,
            actorVocalizationSamples: [],
            situatedExpressionAdmissions: { version: 1, records: [] },
            situatedExpressionCausalAuthority: { version: 1, records: [] },
            situatedExpressionChannels: { version: 1, channels: [] },
          },
        },
      );
      const record = repository.snapshot();
      await repository.save(recordWithEnvelope(record, nextEnvelope));
    };

    patch = promoteFixtureActors(patch, [...new Set([
      ...rabbitGroupIds,
      ...wolfGroupIds,
      ...boarGroupIds,
    ])]);
    patch = setCoreEcologyAggregatePatchMaterializedActors(patch, {
      atTick: patch.updatedAtTick,
      actorIds: [...rabbitGroupIds, ...wolfGroupIds],
    });
    let displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      const isRabbit = actor.identity.stableId === rabbitId;
      const isPackWolf = packWolfIds.has(actor.identity.stableId);
      let positioned = repositionFixtureActorAndCurrentAlarmLocus(actor, {
        atTick: patch.updatedAtTick,
        position: isRabbit
          ? preyPosition
          : isPackWolf
            ? openPackPosition
            : remotePosition(displacedOrdinal++),
        heading: isPackWolf ? towardPrey : actor.address.heading,
      });
      if (isRabbit) {
        positioned = replaceCoreWildlifeActorPhysiology(positioned, {
          atTick: patch.updatedAtTick,
          needs: positioned.needs,
          condition: { ...positioned.condition, health: 600_000 },
        });
      } else if (isPackWolf) {
        positioned = replaceCoreWildlifeActorPhysiology(positioned, {
          atTick: patch.updatedAtTick,
          needs: { ...positioned.needs, hunger: 1_000_000 },
          condition: positioned.condition,
        });
      }
      patch = replaceCoreEcologyAggregatePatchActor(patch, positioned);
    }
    patch = reconcileFixtureGroupAnchors(patch);
    await saveStage(envelope, world, patch);
    // Current unobstructed sight creates pack-member pursuit, but four tiles
    // of separation remain outside the exact mortality contact radius.
    let runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    envelope = requiredEnvelope(repository);
    patch = requiredActiveLegacyCore(envelope);
    expect(patch.mortalityTransactions).toEqual([]);
    expect(packWolves.map(({ identity }) => (
      coreActors(patch).find(({ identity: saved }) => saved.stableId === identity.stableId)
        ?.intent.kind
    ))).toEqual(packWolves.map(() => "pursue"));
    runtime.destroy();
    scheduledFrame = undefined;

    // The same remembered target is placed behind a ridge. Runtime perception
    // supplies no current live-prey opportunity, so stale knowledge cannot
    // continue pursuit or authorize contact.
    world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    const occlusionTileX = Math.min(
      Math.max(Math.trunc(playerPosition.localX / WORLD_POSITION_UNITS_PER_TILE), 1),
      WORLD_WIDTH - 2,
    );
    const occlusionTileY = Math.min(
      Math.max(Math.trunc(playerPosition.localY / WORLD_POSITION_UNITS_PER_TILE), 1),
      WORLD_HEIGHT - 2,
    );
    const occludedPackPosition = createWorldPosition(
      playerPosition.region,
      occlusionTileX * WORLD_POSITION_UNITS_PER_TILE + 900,
      occlusionTileY * WORLD_POSITION_UNITS_PER_TILE + 900,
    );
    const occludedPreyPosition = createWorldPosition(
      playerPosition.region,
      (occlusionTileX + 1) * WORLD_POSITION_UNITS_PER_TILE + 100,
      (occlusionTileY + 1) * WORLD_POSITION_UNITS_PER_TILE + 100,
    );
    for (const flankPosition of [
      createWorldPosition(
        playerPosition.region,
        (occlusionTileX + 1) * WORLD_POSITION_UNITS_PER_TILE + 500,
        occlusionTileY * WORLD_POSITION_UNITS_PER_TILE + 500,
      ),
      createWorldPosition(
        playerPosition.region,
        occlusionTileX * WORLD_POSITION_UNITS_PER_TILE + 500,
        (occlusionTileY + 1) * WORLD_POSITION_UNITS_PER_TILE + 500,
      ),
    ]) {
      const flank = compatibilityTileAtPosition(world, flankPosition);
      flank.terrain = "ridge";
      flank.elevation = 1_000_000;
    }
    const occludedDelta = worldPositionDelta(occludedPackPosition, occludedPreyPosition);
    expect(Math.hypot(occludedDelta.x, occludedDelta.y)).toBeLessThanOrEqual(650);
    patch = requiredActiveLegacyCore(envelope);
    displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      const isRabbit = actor.identity.stableId === rabbitId;
      const isPackWolf = packWolfIds.has(actor.identity.stableId);
      const positioned = repositionFixtureActorAndCurrentAlarmLocus(actor, {
        atTick: patch.updatedAtTick,
        position: isRabbit
          ? occludedPreyPosition
          : isPackWolf
            ? occludedPackPosition
            : remotePosition(displacedOrdinal++),
        heading: isPackWolf ? 125_000 : actor.address.heading,
      });
      patch = replaceCoreEcologyAggregatePatchActor(patch, positioned);
    }
    patch = reconcileFixtureGroupAnchors(patch);
    await saveStage(envelope, world, patch);
    runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    envelope = requiredEnvelope(repository);
    patch = requiredActiveLegacyCore(envelope);
    expect(patch.mortalityTransactions).toEqual([]);
    // The old target may remain in memory, but the current occluded perception
    // is absent. Even at exact physical contact it neither sustains pursuit nor
    // authorizes harm.
    expect([...packWolfIds].map((wolfId) => (
      coreActors(patch).find(({ identity }) => identity.stableId === wolfId)?.intent.kind
    ))).not.toContain("pursue");
    expect(coreActors(patch).some(({ identity }) => identity.stableId === rabbitId)).toBe(true);
    runtime.destroy();
    scheduledFrame = undefined;

    // Restore current sight and put every member of the same authored pack in
    // exact range. Stable attacker ordering plus immediate target re-lookup
    // must retire the solitary rabbit exactly once.
    world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    patch = requiredActiveLegacyCore(envelope);
    const contactPackPosition = translateWorldPosition(preyPosition, -direction * 400, 0);
    displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      const isRabbit = actor.identity.stableId === rabbitId;
      const isPackWolf = packWolfIds.has(actor.identity.stableId);
      let positioned = repositionFixtureActorAndCurrentAlarmLocus(actor, {
        atTick: patch.updatedAtTick,
        position: isRabbit
          ? preyPosition
          : isPackWolf
            ? contactPackPosition
            : remotePosition(displacedOrdinal++),
        heading: isPackWolf ? towardPrey : actor.address.heading,
      });
      if (isRabbit) {
        positioned = replaceCoreWildlifeActorPhysiology(positioned, {
          atTick: patch.updatedAtTick,
          needs: positioned.needs,
          condition: { ...positioned.condition, health: 600_000 },
        });
      } else if (isPackWolf) {
        positioned = replaceCoreWildlifeActorPhysiology(positioned, {
          atTick: patch.updatedAtTick,
          needs: { ...positioned.needs, hunger: 1_000_000 },
          condition: positioned.condition,
        });
      }
      patch = replaceCoreEcologyAggregatePatchActor(patch, positioned);
    }
    patch = reconcileFixtureGroupAnchors(patch);
    const rabbitUnitsBefore = rabbitPopulation.populationSize;
    await saveStage(envelope, world, patch);
    runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    envelope = requiredEnvelope(repository);
    patch = requiredActiveLegacyCore(envelope);
    const death = patch.mortalityTransactions.at(-1);
    const body = patch.carcasses.at(-1);
    expect(patch.mortalityTransactions).toHaveLength(1);
    expect(patch.carcasses).toHaveLength(1);
    expect(death?.event).toMatchObject({
      victimId: rabbitId,
      outcome: "death",
      cause: "predator-contact",
    });
    expect(packWolfIds.has(death?.event.attackerId ?? "")).toBe(true);
    expect(wolfGroup.memberOrdinals).toContain(
      coreActors(patch).find(({ identity }) => identity.stableId === death?.event.attackerId)
        ?.identity.populationOrdinal,
    );
    expect(coreActors(patch).some(({ identity }) => identity.stableId === rabbitId)).toBe(false);
    expect(patch.populations.find(({ species }) => species === "marsh-rabbit")?.populationSize)
      .toBe(rabbitUnitsBefore - 1);
    expect(body).toMatchObject({
      sourceActorId: rabbitId,
      sourceSpecies: "marsh-rabbit",
      originalResourceUnits: 4,
      remainingResourceUnits: 4,
      consumedResourceUnits: 0,
      currentClaimantActorId: null,
    });
    if (body === undefined) throw new Error("Alpha30 runtime fixture omitted its exact rabbit body");
    runtime.destroy();
    scheduledFrame = undefined;

    // A sounder member sees and reaches that same body through ordinary
    // runtime composition. Its non-guarding policy consumes one finite unit
    // and releases custody instead of cloning, retaining, or rerolling it.
    world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    patch = requiredActiveLegacyCore(envelope);
    patch = setCoreEcologyAggregatePatchMaterializedActors(patch, {
      atTick: patch.updatedAtTick,
      actorIds: [...boarGroupIds, ...wolfGroupIds],
    });
    const scavengingRemotePosition = (ordinal: number) => createWorldPosition(
      body.deathPosition.region,
      body.deathPosition.localX < REGION_WIDTH_UNITS / 2
        ? REGION_WIDTH_UNITS - 2_000 - ordinal * 40
        : 2_000 + ordinal * 40,
      body.deathPosition.localY < REGION_HEIGHT_UNITS / 2
        ? REGION_HEIGHT_UNITS - 2_000 - ordinal * 40
        : 2_000 + ordinal * 40,
    );
    const scavengingWolfPosition = (ordinal: number) => createWorldPosition(
      body.deathPosition.region,
      body.deathPosition.localX < REGION_WIDTH_UNITS / 2
        ? 2_000 + ordinal * 40
        : REGION_WIDTH_UNITS - 2_000 - ordinal * 40,
      body.deathPosition.localY < REGION_HEIGHT_UNITS / 2
        ? 2_000 + ordinal * 40
        : REGION_HEIGHT_UNITS - 2_000 - ordinal * 40,
    );
    displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      const isBoar = actor.identity.stableId === boarId;
      const isPackWolf = packWolfIds.has(actor.identity.stableId);
      let positioned = repositionFixtureActorAndCurrentAlarmLocus(actor, {
        atTick: patch.updatedAtTick,
        position: isBoar
          ? translateWorldPosition(body.deathPosition, -direction * 200, 0)
          : isPackWolf
            ? scavengingWolfPosition(displacedOrdinal++)
            : scavengingRemotePosition(displacedOrdinal++),
        heading: isBoar ? towardPrey : actor.address.heading,
      });
      if (isBoar) {
        positioned = replaceCoreWildlifeActorPhysiology(positioned, {
          atTick: patch.updatedAtTick,
          needs: { ...positioned.needs, hunger: 1_000_000 },
          condition: positioned.condition,
        });
      }
      patch = replaceCoreEcologyAggregatePatchActor(patch, positioned);
    }
    patch = reconcileFixtureGroupAnchors(patch);
    await saveStage(envelope, world, patch);
    runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    envelope = requiredEnvelope(repository);
    patch = requiredActiveLegacyCore(envelope);
    const fedBody = patch.carcasses.find(({ carcassId }) => carcassId === body.carcassId);
    const fedBoar = coreActors(patch).find(({ identity }) => identity.stableId === boarId);
    expect(patch.mortalityTransactions).toHaveLength(1);
    expect(patch.carcasses).toHaveLength(1);
    expect(fedBody).toMatchObject({
      carcassId: body.carcassId,
      originalResourceUnits: 4,
      currentClaimantActorId: null,
      claimProvenanceId: null,
    });
    if (fedBody === undefined) throw new Error("scavenging fixture lost its conserved body");
    expect(fedBody.consumedResourceUnits).toBeGreaterThan(0);
    expect(fedBody.consumedResourceUnits).toBeLessThanOrEqual(fedBody.originalResourceUnits);
    expect(fedBody.remainingResourceUnits)
      .toBe(fedBody.originalResourceUnits - fedBody.consumedResourceUnits);
    expect(fedBoar?.intent.kind).toBe("scavenge");
    expect(fedBoar?.needs.hunger).toBeLessThan(1_000_000);
    const durableCore = envelope.regionalEcology;
    runtime.destroy();
    scheduledFrame = undefined;

    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).regionalEcology).toBe(durableCore);
    resumed.destroy();
  }, process.env.CI === "true" ? 150_000 : 75_000);

  it("routes a selected flee target around a closed local escape edge", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "wildlife alarm crossing",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const envelope = await adoptUntouchedFixtureCoreAsCurrent(
      repository,
      initial,
      requiredEnvelope(repository),
      (source) => [
        source.populations.find(({ species }) => species === "deer")
          ?.members[0]?.actor.identity.stableId,
        source.populations.find(({ species }) => species === "gull")
          ?.members[0]?.actor.identity.stableId,
      ].filter((actorId): actorId is string => actorId !== undefined),
    );
    const record = repository.snapshot();
    const world = deserializeWorld(envelope.world);
    world.weather.kind = "clear";
    world.weather.intensity = 0;
    world.weather.windX = 0;
    world.weather.windY = 0;
    world.weather.nextChangeTick = world.meta.completedTick + 100_000;
    const player = structuredClone(envelope.player);
    const regional = restorePlayerRegionalTravel(world.meta.rootSeed, player, envelope.regionalTravel);
    if (regional === null) throw new Error("escape fixture could not restore its regional frame");
    const regionalWorld = createRegionalWorldView(
      createWorldView(world),
      regional.window,
      { discovered: player.discovered, depthSoundings: player.depthSoundings },
    );
    const escapeTile = findNearestBlockedEscapeTile(regionalWorld);
    const deerPosition = worldPositionAtWindowTile(regional.window, escapeTile.index);
    const alarmPosition = worldPositionAtWindowTile(
      regional.window,
      escapeTile.index + escapeTile.alarmDirection,
    );
    const sourcePatch = requiredActiveLegacyCore(envelope);
    const sourceDeer = sourcePatch.populations.find(
      ({ species }) => species === "deer",
    )?.members[0]?.actor;
    const sourceGull = sourcePatch.populations.find(
      ({ species }) => species === "gull",
    )?.members[0]?.actor;
    if (sourceDeer === undefined || sourceGull === undefined) {
      throw new Error("escape fixture lost actors");
    }
    let patch = promoteFixtureActors(sourcePatch, [
      sourceDeer.identity.stableId,
      sourceGull.identity.stableId,
    ]);
    const deer = coreActors(patch).find(({ identity }) => (
      identity.stableId === sourceDeer.identity.stableId
    ));
    const gull = coreActors(patch).find(({ identity }) => (
      identity.stableId === sourceGull.identity.stableId
    ));
    if (deer === undefined || gull === undefined) {
      throw new Error("v25 adoption lost the promoted escape fixture actors");
    }
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(deer, {
      atTick: patch.updatedAtTick,
      position: deerPosition,
      heading: 0,
    }));
    const alarmGull = createFixtureCommittedAlarmActor(gull, {
      atTick: patch.updatedAtTick,
      position: alarmPosition,
      heading: 500_000,
      threatId: "threat:fixture-blocked-escape",
    });
    patch = replaceCoreEcologyAggregatePatchActor(patch, alarmGull);
    for (const actor of coreActors(patch)) {
      if (actor.identity.stableId === deer.identity.stableId
        || actor.identity.stableId === gull.identity.stableId) continue;
      patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
        atTick: patch.updatedAtTick,
        position: translateWorldPosition(deerPosition, 100 * WORLD_POSITION_UNITS_PER_TILE, 0),
        heading: actor.address.heading,
      }));
    }
    patch = reconcileFixtureGroupAnchors(patch);
    const nextEnvelope = resealedCurrentEnvelopeWithCorePatch(envelope, patch, {
      world: serializeWorld(world),
      player,
    });
    const stagedPatch = requiredActiveLegacyCore(nextEnvelope);
    const stagedDeer = coreActors(stagedPatch).find(({ identity }) => (
      identity.stableId === deer.identity.stableId
    ));
    const stagedGull = coreActors(stagedPatch).find(({ identity }) => (
      identity.stableId === gull.identity.stableId
    ));
    expect(stagedDeer?.address.position).toEqual(deerPosition);
    expect(stagedGull?.address.position).toEqual(alarmPosition);
    if (stagedDeer === undefined) throw new Error("escape fixture lost its staged deer");
    const stagedDeerPosition = stagedDeer.address.position;
    await repository.save(recordWithEnvelope(record, nextEnvelope));
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();

    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const movedDeer = coreActors(requiredCore(requiredEnvelope(repository)))
      .find(({ identity }) => identity.stableId === deer.identity.stableId);
    if (movedDeer === undefined) throw new Error("escaped deer was not persisted");
    const movement = worldPositionDelta(stagedDeerPosition, movedDeer.address.position);
    const beforeAlarmDelta = worldPositionDelta(alarmPosition, stagedDeerPosition);
    const afterAlarmDelta = worldPositionDelta(alarmPosition, movedDeer.address.position);
    const beforeAlarmDistanceSquared = BigInt(beforeAlarmDelta.x) * BigInt(beforeAlarmDelta.x)
      + BigInt(beforeAlarmDelta.y) * BigInt(beforeAlarmDelta.y);
    const afterAlarmDistanceSquared = BigInt(afterAlarmDelta.x) * BigInt(afterAlarmDelta.x)
      + BigInt(afterAlarmDelta.y) * BigInt(afterAlarmDelta.y);
    expect(movedDeer.intent.kind).toBe("flee");
    expect(afterAlarmDistanceSquared).toBeGreaterThan(beforeAlarmDistanceSquared);
    expect(Math.abs(movement.y)).toBeGreaterThan(0);
    runtime.destroy();
  }, 45_000);

  it("lets a threatened deer move from standable shallow water through shared locomotion", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "wildlife shallow channel crossing",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    makeWorldShallowAndClear(world);
    let patch = requiredCore(envelope);
    const deer = patch.populations.find(({ species }) => species === "deer")?.members[0]?.actor;
    const bear = patch.populations
      .find(({ species }) => species === "black-bear")?.members[0]?.actor;
    if (deer === undefined || bear === undefined) {
      throw new Error("shallow-channel fixture lost its deer or bear");
    }
    if (deer.address.position.region.x !== 0 || deer.address.position.region.y !== 0) {
      throw new Error("shallow-channel fixture left the compatibility region");
    }
    const threatDirection = deer.address.position.localX < REGION_WIDTH_UNITS / 2 ? 1 : -1;
    const bearPosition = translateWorldPosition(
      deer.address.position,
      threatDirection * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(bear, {
      atTick: patch.updatedAtTick,
      position: bearPosition,
      heading: threatDirection > 0 ? 500_000 : 0,
    }));
    for (const actor of coreActors(patch)) {
      if (
        actor.identity.stableId === deer.identity.stableId
        || actor.identity.stableId === bear.identity.stableId
      ) continue;
      patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
        atTick: patch.updatedAtTick,
        position: translateWorldPosition(
          deer.address.position,
          0,
          (30 + actor.identity.populationOrdinal) * WORLD_POSITION_UNITS_PER_TILE,
        ),
        heading: actor.address.heading,
      }));
    }
    patch = promoteFixtureActors(patch, [
      deer.identity.stableId,
      bear.identity.stableId,
    ]);
    const startTile = compatibilityTileAtPosition(world, deer.address.position);
    expect(startTile.waterDepth).toBeGreaterThan(0);
    expect(startTile.waterDepth).toBeLessThanOrEqual(ADRIFT_STAND_DEPTH);

    const nextEnvelope = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save(recordWithEnvelope(record, nextEnvelope));
    initial.destroy();
    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);

    advancePlayerSteps(runtime, 30);
    await runtime.save();
    const savedEnvelope = requiredEnvelope(repository);
    const savedWorld = deserializeWorld(savedEnvelope.world);
    const movedDeer = coreActors(requiredCore(savedEnvelope))
      .find(({ identity }) => identity.stableId === deer.identity.stableId);
    if (movedDeer === undefined) throw new Error("shallow-channel deer was not persisted");
    const movement = worldPositionDelta(deer.address.position, movedDeer.address.position);
    const endTile = compatibilityTileAtPosition(savedWorld, movedDeer.address.position);
    expect(["flee", "retreat"]).toContain(movedDeer.intent.kind);
    expect(Math.abs(movement.x) + Math.abs(movement.y)).toBeGreaterThan(0);
    expect(endTile.waterDepth).toBeGreaterThan(0);
    expect(endTile.waterDepth).toBeLessThanOrEqual(ADRIFT_STAND_DEPTH);
    runtime.destroy();
  }, 45_000);

  it("routes a responding shore-water actor through deep water with the shared resolver", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "otter habitat 0",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    let patch = requiredCore(envelope);
    const otterMember = patch.populations.find(
      ({ species }) => species === "north-american-river-otter",
    )?.members[0];
    const otter = otterMember?.actor;
    const bear = patch.populations.find(
      ({ species }) => species === "black-bear",
    )?.members[0]?.actor;
    if (otter === undefined || bear === undefined) {
      throw new Error("shore-water fixture lost its otter or threat");
    }
    expect(otterMember?.materialization).toBe("materialized");
    if (patch.derivation.kind !== "habitat-v11") {
      throw new Error("shore-water fixture omitted its authenticated habitat");
    }
    const otterPosition = findDeepWaterRoutePosition(world);
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(otter, {
      atTick: patch.updatedAtTick,
      position: otterPosition,
      heading: 0,
    }));
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(bear, {
      atTick: patch.updatedAtTick,
      position: translateWorldPosition(otterPosition, WORLD_POSITION_UNITS_PER_TILE, 0),
      heading: 500_000,
    }));
    patch = promoteFixtureActors(patch, [
      otter.identity.stableId,
      bear.identity.stableId,
    ]);
    const startTile = compatibilityTileAtPosition(world, otterPosition);
    expect(startTile.waterDepth).toBeGreaterThan(ADRIFT_STAND_DEPTH);

    const prepared = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save(recordWithEnvelope(record, prepared));
    initial.destroy();
    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);
    if (runtime.getUIView().saveWarning !== undefined) {
      throw new Error(`shore-water fixture rejected: ${stableStringify(runtime.getUIView().saveWarning)}`);
    }

    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const savedEnvelope = requiredEnvelope(repository);
    const savedWorld = deserializeWorld(savedEnvelope.world);
    const movedOtter = coreActors(requiredCore(savedEnvelope)).find(
      ({ identity }) => identity.stableId === otter.identity.stableId,
    );
    if (movedOtter === undefined) throw new Error("shore-water actor was not persisted");
    const movement = worldPositionDelta(otterPosition, movedOtter.address.position);
    expect(["flee", "retreat"]).toContain(movedOtter.intent.kind);
    expect(movedOtter.circadian).toMatchObject({
      policy: { profileId: "night-active", drivers: ["clock"] },
      restDestinationArrived: false,
      posture: {
        state: "awake",
        enteredAtTick: savedWorld.meta.completedTick,
      },
    });
    expect(Math.abs(movement.x) + Math.abs(movement.y)).toBeGreaterThan(0);
    expect(compatibilityTileAtPosition(savedWorld, movedOtter.address.position).waterDepth)
      .toBeGreaterThan(ADRIFT_STAND_DEPTH);
    const durableRoutine = stableStringify(movedOtter.circadian);
    runtime.destroy();
    scheduledFrame = undefined;
    const reloaded = await createTideweftRuntime(repository);
    const reloadedOtter = coreActors(requiredCore(requiredEnvelope(repository))).find(
      ({ identity }) => identity.stableId === otter.identity.stableId,
    );
    expect(stableStringify(reloadedOtter?.circadian)).toBe(durableRoutine);
    reloaded.destroy();
  }, 45_000);

  it("denies a floored negative-seam food claim outside exact loose-unit reach", async () => {
    const repository = new MemoryRepository();
    const initial = await createTideweftRuntime(repository);
    initial.dispatchUI({
      type: "new-world",
      seed: "exact negative seam wildlife meal",
      posture: "gale",
      sessionShape: "wander",
    });
    await initial.save();
    const record = repository.snapshot();
    const envelope = requiredEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    const player = structuredClone(envelope.player);
    const regional = restorePlayerRegionalTravel(world.meta.rootSeed, player, envelope.regionalTravel);
    if (regional === null) throw new Error("seam fixture could not restore its regional frame");
    const regionalWorld = createRegionalWorldView(
      createWorldView(world),
      regional.window,
      { discovered: player.discovered, depthSoundings: player.depthSoundings },
    );
    const seam = findOpenHorizontalRegionSeam(regionalWorld, regional.window);
    const actorStart = createWorldPosition(
      seam.left.region,
      REGION_WIDTH_UNITS - 751,
      seam.left.localY * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    );
    const cargoX = 749_999;
    const cargoY = seam.right.localY * LOOSE_CARGO_TILE_UNITS
      + LOOSE_CARGO_TILE_UNITS / 2;

    let patch = requiredCore(envelope);
    const bear = patch.populations.find(({ species }) => species === "black-bear")?.members[0]?.actor;
    if (bear === undefined) throw new Error("seam fixture lost its bear");
    let cargo = requiredCargo(envelope);
    const baselineConsumptionHistory = consumptionHistory(cargo);
    const source = quotePhysicalCargoSource(
      cargo,
      "wildlife-seam-test",
      `negative-seam:${bear.identity.stableId}`,
    );
    const temporary = createLooseCargoCarrier(
      { kind: "unclaimed" },
      createCraftingInventory(PROVISION_DEFINITIONS["dried-fish"].loadMilli),
    );
    const provision = addLooseCargoProvision(temporary, {
      sourceLotId: source.lotId,
      provision: "dried-fish",
      quantity: 1,
      materialState: { condition: 1_000_000, contamination: 0, decay: 0 },
    });
    if (!provision.ok) throw new Error(`seam fixture provision failed: ${provision.reason}`);
    const targetCargo = transitionPhysicalCargoRegion(
      cargo,
      seam.right.region,
      WORLD_WIDTH,
      WORLD_HEIGHT,
    );
    const dropped = dropLooseCargo(targetCargo.looseWorld, provision.carrier, {
      lotId: source.lotId,
      quantity: 1,
      x: cargoX,
      y: cargoY,
    });
    if (!dropped.ok || dropped.entity === null) {
      throw new Error(`seam fixture drop failed: ${dropped.reason}`);
    }
    cargo = commitPhysicalCargoRegionalMutation(cargo, {
      looseWorld: dropped.world,
      carrier: cargo.carrier,
      committedSourceOrdinal: source.ordinal,
    }, {
      kind: "delta",
      removed: [],
      added: [dropped.entity.payload],
    });

    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(bear, {
      atTick: patch.updatedAtTick,
      position: actorStart,
      heading: 0,
    }));
    for (const actor of coreActors(patch)) {
      if (actor.identity.stableId === bear.identity.stableId) continue;
      patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
        atTick: patch.updatedAtTick,
        position: translateWorldPosition(actorStart, 100 * WORLD_POSITION_UNITS_PER_TILE, 0),
        heading: actor.address.heading,
      }));
    }
    patch = promoteFixtureActors(patch, [bear.identity.stableId]);
    const nextEnvelope = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      player,
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
      physicalCargo: snapshotPhysicalCargoState(cargo),
    });
    await repository.save(recordWithEnvelope(record, nextEnvelope));
    initial.destroy();
    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);

    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const afterEnvelope = requiredEnvelope(repository);
    const afterCargo = requiredCargo(afterEnvelope);
    const afterCore = requiredCore(afterEnvelope);
    const movedBear = coreActors(afterCore)
      .find(({ identity }) => identity.stableId === bear.identity.stableId);
    if (movedBear === undefined) throw new Error("seam fixture lost its moved bear");
    expect(movedBear.intent.kind).toBe("scavenge");
    expect(movedBear.needs.hunger).toBeGreaterThanOrEqual(bear.needs.hunger);
    expect(locatePhysicalCargoEntity(afterCargo, dropped.entity.id)).not.toBeNull();
    expect(consumptionHistory(afterCargo)).toEqual(baselineConsumptionHistory);
    const exactActorX = (
      (BigInt(movedBear.address.position.region.x) - BigInt(seam.right.region.x))
        * BigInt(REGION_WIDTH_UNITS)
      + BigInt(movedBear.address.position.localX)
    ) * BigInt(LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE);
    expect(BigInt(cargoX) - exactActorX).toBe(750_999n);
    runtime.destroy();
  }, 45_000);
});

async function createCatWeatherRuntime(
  mode: "rain-distress" | "non-rain-control",
  catOffsetTiles: 1 | 2 = 1,
  stageNearbyHuman: false | 500 | 2_000 = false,
  options: Readonly<{
    initialWestRebaseBoundary?: boolean;
    createRuntime?: typeof createTideweftRuntime;
  }> = {},
): Promise<Readonly<{
  runtime: TideweftRuntime;
  repository: MemoryRepository;
  catActorId: string;
  listenerActorId: string | null;
}>> {
  const createRuntime = options.createRuntime ?? createTideweftRuntime;
  const repository = new MemoryRepository();
  const initial = await createRuntime(repository);
  initial.dispatchUI({
    type: "new-world",
    seed: "settlement shadows",
    posture: "gale",
    sessionShape: "wander",
  });
  await initial.save();
  const fresh = requiredEnvelope(repository);
  const sourceCatId = requiredCore(fresh).populations.find(
    ({ species }) => species === "domestic-cat",
  )?.members[0]?.actor.identity.stableId;
  if (sourceCatId === undefined) throw new Error("Cat weather fixture omitted its source");
  const envelope = await adoptUntouchedFixtureCoreAsCurrent(
    repository,
    initial,
    fresh,
    () => [sourceCatId],
  );
  const record = repository.snapshot();
  const world = deserializeWorld(envelope.world);
  makeWorldDryAndClear(world);
  world.weather.kind = mode === "rain-distress" ? "rain" : "clear";
  world.weather.intensity = mode === "rain-distress" ? 1_000_000 : 0;
  world.weather.windX = 0;
  world.weather.windY = 0;
  world.weather.nextChangeTick = world.meta.completedTick + 100_000;
  const player = structuredClone(envelope.player);
  player.facingMilliRadians = 0;
  if (options.initialWestRebaseBoundary) {
    player.x = REGIONAL_TRAVEL_SAFE_MIN_X * WORLD_POSITION_UNITS_PER_TILE + 1;
    player.previousX = player.x;
    player.velocityX = 0;
    player.velocityY = 0;
    const index = Math.floor(player.y / WORLD_POSITION_UNITS_PER_TILE)
      * REGIONAL_TRAVEL_COLUMNS + REGIONAL_TRAVEL_SAFE_MIN_X;
    player.currentTrace = [index];
    player.surveyTrace = [index];
  }
  const regional = restorePlayerRegionalTravel(world.meta.rootSeed, player, envelope.regionalTravel);
  if (regional === null) throw new Error("Cat weather fixture could not restore its frame");
  const playerPosition = playerWorldPositionInRegionalWindow(regional.window, player);
  if (playerPosition === null) throw new Error("Cat weather fixture could not locate its player");
  let catPosition = translateWorldPosition(playerPosition, catOffsetTiles * WORLD_POSITION_UNITS_PER_TILE, 0);
  if (options.initialWestRebaseBoundary) {
    const spatial = createRegionalWorldView(createWorldView(world), regional.window, {
      discovered: player.discovered, depthSoundings: player.depthSoundings,
    });
    const playerRow = Math.floor(player.y / WORLD_POSITION_UNITS_PER_TILE);
    const dry = (index: number): boolean => {
      const tile = spatial.terrain.tiles[index];
      return tile !== undefined && tile.terrain !== "deep-water" && tile.waterDepth <= ADRIFT_STAND_DEPTH;
    };
    // Select actual generated standable ground in one bounded edge band, not
    // an artificial dry cell or forced accessible action on flooded terrain.
    const candidates = Array.from({ length: REGIONAL_TRAVEL_SAFE_MAX_Y - REGIONAL_TRAVEL_SAFE_MIN_Y + 1 }, (_, offset) => (
      (REGIONAL_TRAVEL_SAFE_MIN_Y + offset) * REGIONAL_TRAVEL_COLUMNS + 105
    )).filter((index) => dry(index)
      && [index - 1, index + 1, index - REGIONAL_TRAVEL_COLUMNS, index + REGIONAL_TRAVEL_COLUMNS].some(dry))
      .sort((left, right) => Math.abs(Math.floor(left / REGIONAL_TRAVEL_COLUMNS) - playerRow)
        - Math.abs(Math.floor(right / REGIONAL_TRAVEL_COLUMNS) - playerRow) || left - right);
    const catIndex = candidates[0];
    if (catIndex === undefined) throw new Error("Cat rebase fixture has no real standable edge cell");
    catPosition = worldPositionAtWindowTile(regional.window, catIndex);
  }
  let catHeading = 0;
  let listenerActorId: string | null = null;
  if (stageNearbyHuman) {
    const porterId = deserializeBio0Ecology(envelope.bio0Ecology)?.porterAddress.actorId;
    const listener = world.residents.find(({ identity, activeContractId }) => (
      activeContractId === null && identity.stableId !== porterId
    ));
    if (listener === undefined) throw new Error("Cat hearing fixture lacks an actual free resident");
    const view = createWorldView(world);
    let routePlacement: { routeId: number; progress: number; distance: number } | undefined;
    for (const route of world.routes) {
      if (route.path.length < 2) continue;
      for (const [offset, index] of route.path.entries()) {
        const tile = view.terrain.tiles[index];
        if (tile === undefined) continue;
        const point = createWorldPosition({ x: 0, y: 0 },
          (tile.x + 0.5) * WORLD_POSITION_UNITS_PER_TILE,
          (tile.y + 0.5) * WORLD_POSITION_UNITS_PER_TILE);
        const delta = worldPositionDelta(point, catPosition);
        const distance = Math.hypot(delta.x, delta.y);
        if (routePlacement === undefined || distance < routePlacement.distance) routePlacement = {
          routeId: route.id, progress: Math.round(offset * FIXED_POINT / (route.path.length - 1)), distance,
        };
      }
    }
    if (routePlacement === undefined) throw new Error("Cat hearing fixture lacks a generated route");
    listener.location = { kind: "route", routeId: routePlacement.routeId, progress: routePlacement.progress };
    if (listener.circadian !== undefined) {
      const current = listener.circadian;
      world.residents[world.residents.indexOf(listener)] = replaceResidentCircadian(listener, {
        atTick: world.meta.completedTick,
        circadian: { ...current, restDestinationArrived: false,
          posture: current.posture.state === "resting" || current.posture.state === "asleep"
            ? { state: "awake", enteredAtTick: world.meta.completedTick } : current.posture },
      });
    }
    const placement = resolveResidentWorldPlacement(createWorldView(world), listener);
    if (placement === null) throw new Error("Cat hearing fixture could not resolve its real route placement");
    catPosition = translateWorldPosition(placement.position, stageNearbyHuman, 0);
    const away = worldPositionDelta(playerPosition, catPosition);
    catHeading = headingFromRadians(Math.atan2(away.y, away.x));
    listenerActorId = listener.identity.stableId;
    assertWorldInvariants(world);
  }

  let patch = requiredRegionalCoreOwner(envelope, sourceCatId);
  patch = setCoreEcologyAggregatePatchMaterializedActors(patch, {
    atTick: patch.updatedAtTick,
    actorIds: [sourceCatId],
  });
  const sourceCat = requiredCoreActor(patch, sourceCatId);
  const positionedCat = repositionCoreWildlifeActor(sourceCat, {
    atTick: patch.updatedAtTick,
    // The player sees the cat ahead; the cat faces away so the player cannot
    // supplant rain as this fixture's causal observation.
    position: catPosition,
    heading: catHeading,
  });
  const { circadian: _circadian, ...catWithoutCircadian } = positionedCat;
  const preparedCat = canonicalizeCoreWildlifeActorState({
    ...catWithoutCircadian,
    needs: {
      hunger: 0,
      safety: 0,
      rest: mode === "non-rain-control" ? 1_000_000 : 0,
    },
    condition: { health: 1_000_000, exhaustion: 0, stress: 0 },
    perception: createActorPerceptionState(sourceCatId, patch.updatedAtTick),
    intent: {
      kind: "observe",
      cause: { kind: "condition", referenceId: "condition:fixture-neutral" },
      focusObservationId: null,
      resourceReference: null,
      enteredAtTick: patch.updatedAtTick,
      expiresAtTick: null,
    },
    memories: [],
  });
  if (preparedCat === null) throw new Error("Cat weather fixture could not reset its source");
  patch = replaceCoreEcologyAggregatePatchActor(patch, preparedCat);
  let displacedCatOrdinal = 0;
  for (const actor of coreActors(patch)) {
    if (
      (!options.initialWestRebaseBoundary && actor.identity.species !== "domestic-cat")
      || actor.identity.stableId === sourceCatId
    ) continue;
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
      atTick: patch.updatedAtTick,
      position: translateWorldPosition(
        playerPosition,
        (options.initialWestRebaseBoundary ? -1 : 1)
          * (100 + displacedCatOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
        20 * WORLD_POSITION_UNITS_PER_TILE,
      ),
      heading: actor.address.heading,
    }));
    displacedCatOrdinal += 1;
  }
  patch = reconcileFixtureGroupAnchors(patch);
  let prepared = resealedCurrentEnvelopeWithCorePatch(envelope, patch, {
    world: serializeWorld(world),
    player,
    ...(options.initialWestRebaseBoundary ? {
      perceptionCarry: {
        ...envelope.perceptionCarry,
        intervalStartPosition: playerPosition,
        intervalStartFacingMilliRadians: player.facingMilliRadians,
      },
    } : {}),
  });
  for (const source of [
    requiredRegionalEcology(envelope).settlementHome,
    ...requiredRegionalEcology(envelope).activeResidents,
  ]) {
    if (source.patch.patchKey === patch.patchKey) continue;
    const materializedNonCats = source.patch.populations.flatMap(({ species, members }) => (
      members.flatMap(({ actor, materialization }) => (
        materialization === "materialized" && species !== "domestic-cat"
          ? [actor.identity.stableId]
          : []
      ))
    ));
    const hasMaterializedCat = source.patch.populations.some(({ species, members }) => (
      species === "domestic-cat"
      && members.some(({ materialization }) => materialization === "materialized")
    ));
    if (!hasMaterializedCat) continue;
    prepared = resealedCurrentEnvelopeWithCorePatch(
      prepared,
      setCoreEcologyAggregatePatchMaterializedActors(source.patch, {
        atTick: source.patch.updatedAtTick,
        actorIds: materializedNonCats,
      }),
    );
  }
  await repository.save(recordWithEnvelope(record, prepared));
  scheduledFrame = undefined;
  const runtime = await createRuntime(repository);
  if (runtime.getUIView().saveWarning !== undefined) {
    throw new Error(`Cat weather fixture rejected: ${stableStringify(
      runtime.getUIView().saveWarning,
    )}`);
  }
  return Object.freeze({ runtime, repository, catActorId: sourceCatId, listenerActorId });
}

async function createAlarmRuntime(
  offsetTiles: -12 | -8 | -4 | 9,
  sourceSpecies: "deer" | "marsh-rabbit" | "gull" | "elk" | "wild-boar" = "deer",
  runtimeFactory: (repository: SaveRepository) => Promise<TideweftRuntime> =
    createTideweftRuntime,
  listenerAdjacentWater = false,
): Promise<{
  runtime: TideweftRuntime;
  repository: MemoryRepository;
  alarmActorId: string;
}> {
  const repository = new MemoryRepository();
  const initial = await runtimeFactory(repository);
  initial.dispatchUI({
    type: "new-world",
    seed: sourceSpecies === "marsh-rabbit"
      ? "marsh-edge-runtime-cue-1"
      : "wildlife alarm crossing",
    posture: "gale",
    sessionShape: "wander",
  });
  await initial.save();
  const record = repository.snapshot();
  const envelope = requiredEnvelope(repository);
  const world = deserializeWorld(envelope.world);
  makeWorldDryAndClear(world);
  const player = structuredClone(envelope.player);
  if (sourceSpecies === "marsh-rabbit") player.stamina = 800_000;
  player.facingMilliRadians = offsetTiles === -4
    ? Math.round(Math.PI * 1_000)
    : 0;
  const regional = restorePlayerRegionalTravel(world.meta.rootSeed, player, envelope.regionalTravel);
  if (regional === null) throw new Error("alarm fixture could not restore its regional frame");
  const playerPosition = playerWorldPositionInRegionalWindow(regional.window, player);
  if (playerPosition === null) throw new Error("alarm fixture could not locate its player");
  if (listenerAdjacentWater) {
    if (playerPosition.region.x !== 0 || playerPosition.region.y !== 0) {
      throw new Error("Water-mask fixture needs the actual compatibility terrain owner");
    }
    const x = Math.floor(playerPosition.localX / WORLD_POSITION_UNITS_PER_TILE);
    const y = Math.floor(playerPosition.localY / WORLD_POSITION_UNITS_PER_TILE) + 1;
    const tile = world.terrain.tiles[y * world.terrain.width + x];
    if (tile === undefined || tile.x !== x || tile.y !== y) {
      throw new Error("Water-mask fixture left the physical terrain owner");
    }
    tile.elevation = 0;
    tile.roughness = FIXED_POINT;
    tile.terrain = "deep-water";
  }
  const rabbitDirection: -1 | 1 = playerPosition.localX < REGION_WIDTH_UNITS / 2 ? 1 : -1;
  if (sourceSpecies === "marsh-rabbit") {
    player.facingMilliRadians = rabbitDirection > 0 ? 0 : Math.round(Math.PI * 1_000);
  }
  const sourcePatch = requiredCore(envelope);
  const sourceAlarmActor = sourcePatch.populations
    .find(({ species }) => species === sourceSpecies)?.members[0]?.actor;
  const threatSpecies = sourceSpecies === "marsh-rabbit" ? "marsh-fox" : "black-bear";
  const sourceThreat = sourcePatch.populations
    .find(({ species }) => species === threatSpecies)?.members[0]?.actor;
  if (sourceAlarmActor === undefined || sourceThreat === undefined) {
    throw new Error(`alarm fixture lost its ${sourceSpecies} or ${threatSpecies}`);
  }
  const adoptedEnvelope = resealedEnvelope(envelope, {
    coreEcology: serializeCoreEcologyAggregatePatch(promoteFixtureActors(sourcePatch, [
      sourceAlarmActor.identity.stableId,
      sourceThreat.identity.stableId,
    ])),
  });
  let patch = requiredActiveLegacyCore(adoptedEnvelope);
  patch = setCoreEcologyAggregatePatchMaterializedActors(patch, {
    atTick: patch.updatedAtTick,
    actorIds: [
      sourceAlarmActor.identity.stableId,
      sourceThreat.identity.stableId,
    ],
  });
  const alarmActor = coreActors(patch).find(({ identity }) => (
    identity.stableId === sourceAlarmActor.identity.stableId
  ));
  const threat = coreActors(patch).find(({ identity }) => (
    identity.stableId === sourceThreat.identity.stableId
  ));
  if (alarmActor === undefined || threat === undefined) {
    throw new Error("v25 adoption lost the promoted alarm fixture actors");
  }
  const alarmPosition = translateWorldPosition(
    playerPosition,
    (sourceSpecies === "marsh-rabbit" ? rabbitDirection * 2 : offsetTiles)
      * WORLD_POSITION_UNITS_PER_TILE,
    sourceSpecies === "marsh-rabbit" ? -2 * WORLD_POSITION_UNITS_PER_TILE : 0,
  );
  const threatPosition = translateWorldPosition(
    sourceSpecies === "marsh-rabbit" ? playerPosition : alarmPosition,
    sourceSpecies === "marsh-rabbit"
      ? rabbitDirection * 2 * WORLD_POSITION_UNITS_PER_TILE
      : (offsetTiles < 0 ? 1 : -1) * WORLD_POSITION_UNITS_PER_TILE,
    sourceSpecies === "marsh-rabbit" ? 2 * WORLD_POSITION_UNITS_PER_TILE : 0,
  );
  patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(alarmActor, {
    atTick: patch.updatedAtTick,
    position: alarmPosition,
    heading: sourceSpecies === "marsh-rabbit"
      ? 250_000
      : offsetTiles < 0 ? 0 : 500_000,
  }));
  const positionedThreat = repositionCoreWildlifeActor(threat, {
    atTick: patch.updatedAtTick,
    position: threatPosition,
    heading: sourceSpecies === "marsh-rabbit"
      ? 750_000
      : offsetTiles < 0 ? 500_000 : 0,
  });
  patch = replaceCoreEcologyAggregatePatchActor(
    patch,
    sourceSpecies === "marsh-rabbit"
      ? replaceCoreWildlifeActorPhysiology(positionedThreat, {
          atTick: patch.updatedAtTick,
          needs: { ...positionedThreat.needs, hunger: 1_000_000 },
          condition: positionedThreat.condition,
        })
      : positionedThreat,
  );
  const alarmGroup = patch.groups.groups.find(({ identity, memberOrdinals }) => (
    identity.species === alarmActor.identity.species
    && identity.populationKey === alarmActor.identity.populationKey
    && memberOrdinals.includes(alarmActor.identity.populationOrdinal)
  ));
  if (sourceSpecies === "elk" || sourceSpecies === "wild-boar") {
    if (alarmGroup === undefined
      || alarmGroup.identity.organization !== (sourceSpecies === "elk" ? "herd" : "sounder")
      || alarmGroup.memberOrdinals.length < 2) {
      throw new Error(`${sourceSpecies} fixture lost its genuine social group`);
    }
  }
  const alarmGroupMemberIds = new Set(patch.populations
    .find(({ species, populationKey }) => (
      species === alarmActor.identity.species
      && populationKey === alarmActor.identity.populationKey
    ))?.members
    .filter(({ populationOrdinal }) => alarmGroup?.memberOrdinals.includes(populationOrdinal))
    .map(({ actor }) => actor.identity.stableId) ?? []);
  let alarmMateOrdinal = 0;
  for (const actor of coreActors(patch)) {
    if (actor.identity.stableId === alarmActor.identity.stableId
      || actor.identity.stableId === threat.identity.stableId) continue;
    const isAlarmMate = alarmGroupMemberIds.has(actor.identity.stableId);
    const moved = repositionCoreWildlifeActor(actor, {
      atTick: patch.updatedAtTick,
      position: sourceSpecies === "marsh-rabbit"
        ? translateWorldPosition(
            playerPosition,
            -rabbitDirection * (20 + actor.identity.populationOrdinal)
              * WORLD_POSITION_UNITS_PER_TILE,
            (actor.identity.populationOrdinal % 5 - 2) * WORLD_POSITION_UNITS_PER_TILE,
          )
        : isAlarmMate
        ? translateWorldPosition(
            alarmPosition,
            0,
            (14 + alarmMateOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
          )
        : translateWorldPosition(
            playerPosition,
            (80 + actor.identity.populationOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
            20 * WORLD_POSITION_UNITS_PER_TILE,
          ),
      heading: actor.address.heading,
    });
    const preparedActor = actor.identity.species !== alarmActor.identity.species
      ? moved
      : canonicalizeCoreWildlifeActorState({
          ...moved,
          // This fixture owns one alarm source. Other canonical herd members
          // retain a lawful recent alarm memory so the nearby bear cannot mint
          // an unrelated second Living Voice admission in the same interval.
          memories: [...moved.memories, {
            eventId: `${moved.identity.stableId}:fixture-recent-alarm`,
            kind: "alarm",
            referenceId: threat.identity.stableId,
            observationId: null,
            atTick: patch.updatedAtTick,
          }],
        });
    if (preparedActor === null) {
      throw new Error("Alarm fixture could not retain group-mate cooldown");
    }
    patch = replaceCoreEcologyAggregatePatchActor(patch, preparedActor);
    if (isAlarmMate) alarmMateOrdinal += 1;
  }
  patch = reconcileFixtureGroupAnchors(patch);
  const nextEnvelope = resealedEnvelope(adoptedEnvelope, {
    world: serializeWorld(world),
    player,
    coreEcology: serializeCoreEcologyAggregatePatch(patch),
  });
  await repository.save(recordWithEnvelope(record, nextEnvelope));
  initial.destroy();
  scheduledFrame = undefined;
  const runtime = await runtimeFactory(repository);
  if (sourceSpecies !== "marsh-rabbit") await runtime.save();
  return { runtime, repository, alarmActorId: alarmActor.identity.stableId };
}

async function createRememberedDeerPlayerAlarmRuntime(stepsAfterFirstAlarm: 40 | 49 = 49): Promise<{
  runtime: TideweftRuntime;
  repository: MemoryRepository;
  alarmActorId: string;
  firstObservedTick: number;
  threatObservationId: string;
  playerAlarmReceipts: Array<{ event: CoreWildlifeCausalEvent; observations: readonly ActorObservation[]; audibleContact: AudibleContact | null }>;
}> {
  const collectVisual = coreEcologyPerception.collectCoreEcologyVisualObservationBatches;
  const propagateAlarm = coreEcologyPerception.propagateCoreEcologyAlarmObservationBatches;
  let sourceId: string | null = null;
  const playerAlarmReceipts: Array<{ event: CoreWildlifeCausalEvent; observations: readonly ActorObservation[]; audibleContact: AudibleContact | null }> = [];
  vi.spyOn(coreEcologyPerception, "collectCoreEcologyVisualObservationBatches").mockImplementation((input) => {
    const batches = collectVisual(input);
    if (batches === null || sourceId === null) return batches;
    return Object.freeze(batches.map((batch) => batch.observerId !== sourceId
      ? batch
      : Object.freeze({ ...batch, observations: Object.freeze(batch.observations.filter(({ channel }) => channel !== "vision")) })));
  });
  vi.spyOn(coreEcologyPerception, "propagateCoreEcologyAlarmObservationBatches").mockImplementation((...args) => {
    const batches = propagateAlarm(...args);
    if (batches !== null) {
      const event = args[0] as CoreWildlifeCausalEvent;
      const playerBatch = batches.find(({ observerId }) => observerId === LOCAL_PLAYER_SUBJECT_ID);
      if (event.actorId === sourceId && playerBatch !== undefined && playerBatch.observations.length > 0) {
        playerAlarmReceipts.push({ event, observations: playerBatch.observations, audibleContact: playerBatch.audibleContact });
      }
    }
    return batches;
  });
  // Existing controlled legacy-cohort adoption/current50 fixture; no new
  // species population, alarm event, or direct perception is manufactured.
  const fixture = await createAlarmRuntime(-4, "deer");
  const runtime = fixture.runtime;
  const { repository, alarmActorId } = fixture;
  try {
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const first = requiredEnvelope(repository);
    const firstObservedTick = deserializeWorld(first.world).meta.completedTick;
    const firstSource = requiredCoreActor(requiredRegionalCoreOwner(first, alarmActorId), alarmActorId);
    const firstAlarm = firstSource.memories.find(({ kind, atTick, observationId }) => (
      kind === "alarm" && atTick === firstObservedTick && observationId !== null
    ));
    if (firstAlarm?.observationId === undefined || firstAlarm.observationId === null) {
      throw new Error("Player alarm fixture lost its real first sighting/alarm");
    }
    const threatObservationId = firstAlarm.observationId;
    sourceId = alarmActorId;
    advancePlayerSteps(runtime, stepsAfterFirstAlarm);
    expect(runtime.getRenderView().tick).toBe(firstObservedTick + 4);
    return { runtime, repository, alarmActorId, firstObservedTick, threatObservationId, playerAlarmReceipts };
  } catch (error) {
    runtime.destroy();
    scheduledFrame = undefined;
    throw error;
  }
}

async function createFishCrowAlarmRuntime(
  mode: "single-source" | "candidate-order" | "guardian-work" = "single-source",
): Promise<Readonly<{
  runtime: TideweftRuntime;
  repository: MemoryRepository;
  crowActorId: string;
  candidateCrowActorIds: readonly [string, string];
  deerActorId: string;
  guardianActorId: string;
  initialCrowPosition: CoreWildlifeActorState["address"]["position"];
  promiseLot: Readonly<{ id: string; contractId: number; quantity: number }> | null;
}>> {
  const repository = new MemoryRepository();
  let initial = await createTideweftRuntime(repository);
  initial.dispatchUI({
    type: "new-world",
    seed: "rain-chorus-runtime-2",
    posture: "gale",
    sessionShape: "wander",
  });
  if (mode === "guardian-work") {
    await initial.save();
    await adoptUntouchedFixtureCoreAsCurrent(repository, initial, requiredEnvelope(repository), (source) => (
      coreActors(source).filter(({ identity }) => (
        identity.species === "fish-crow" || identity.species === "northern-harrier" || identity.species === "deer"
      )).map(({ identity }) => identity.stableId)
    ));
    initial = await createTideweftRuntime(repository);
    const offer = initial.getUIView().contracts.find(({ actionLabel }) => actionLabel === "Pick up cargo here");
    if (offer === undefined) throw new Error("Mixed alarm scene has no real Promise offer");
    initial.dispatchUI({ type: "contract", action: "accept", contractId: offer.id });
    advancePlayerSteps(initial, 10);
  }
  await initial.save();
  const record = repository.snapshot();
  const envelope = requiredEnvelope(repository);
  const world = deserializeWorld(envelope.world);
  makeWorldDryAndClear(world);
  const player = structuredClone(envelope.player);
  player.facingMilliRadians = 0;
  const regional = restorePlayerRegionalTravel(world.meta.rootSeed, player, envelope.regionalTravel);
  if (regional === null) throw new Error("Fish-crow voice fixture could not restore its frame");

  if (mode === "guardian-work") {
    // Adopt while pristine, acquire through the real Promise action, then
    // stage only a quiet current-schema interval. Never strip pickup history
    // by translating its live carry back through a historical fixture.
    expect(envelope.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(envelope.perceptionCarry.actorVocalizationSamples).toEqual([]);
    expect(envelope.perceptionCarry.situatedExpressionAdmissions.records).toEqual([]);
    expect(envelope.perceptionCarry.animalContactAcousticCarry).toMatchObject({ records: [] });
  }
  const sourcePatch = mode === "guardian-work" ? requiredActiveLegacyCore(envelope) : requiredCore(envelope);
  const sourceCrowPopulation = sourcePatch.populations.find(
    ({ species }) => species === "fish-crow",
  );
  const orderedSourceCrows = [...(sourceCrowPopulation?.members ?? [])]
    .map(({ actor }) => actor)
    .sort((left, right) => left.identity.stableId.localeCompare(right.identity.stableId));
  const sourceCrow = orderedSourceCrows[0];
  const laterCandidateCrow = orderedSourceCrows[1];
  const sourceHarrier = sourcePatch.populations.find(
    ({ species }) => species === "northern-harrier",
  )?.members[0]?.actor;
  const sourceDeer = sourcePatch.populations.find(({ species }) => species === "deer")
    ?.members[0]?.actor;
  const sourceRoster = deserializeDogActorRoster(envelope.dogActorRoster);
  const sourceGuardian = sourceRoster?.actors[0];
  const sourceWork = deserializeSettlementWorkingAnimalState(
    envelope.settlementWorkingAnimals,
  );
  const sourceAssignment = sourceWork?.assignments.find(({ workerActorId }) => (
    workerActorId === sourceGuardian?.identity.stableId
  ));
  if (
    sourceCrowPopulation === undefined
    || sourceCrow === undefined
    || laterCandidateCrow === undefined
    || sourceHarrier === undefined
    || sourceDeer === undefined
    || sourceRoster === null
    || sourceGuardian === undefined
    || sourceAssignment === undefined
  ) {
    throw new Error("Fish-crow voice fixture omitted its source or alarm consumers");
  }
  const adoptedEnvelope = mode === "guardian-work" ? envelope : resealedEnvelope(envelope, {
    coreEcology: serializeCoreEcologyAggregatePatch(promoteFixtureActors(sourcePatch, [
      ...sourceCrowPopulation.members.map(({ actor }) => actor.identity.stableId),
      sourceHarrier.identity.stableId,
      sourceDeer.identity.stableId,
    ])),
  });
  let patch = requiredActiveLegacyCore(adoptedEnvelope);
  const crow = coreActors(patch).find(({ identity }) => (
    identity.stableId === sourceCrow.identity.stableId
  ));
  const harrier = coreActors(patch).find(({ identity }) => (
    identity.stableId === sourceHarrier.identity.stableId
  ));
  const deer = coreActors(patch).find(({ identity }) => (
    identity.stableId === sourceDeer.identity.stableId
  ));
  if (crow === undefined || harrier === undefined || deer === undefined) {
    throw new Error("Fish-crow voice fixture lost its promoted actors during adoption");
  }

  // Keep the anonymous call inside the guardian's authenticated work area so
  // the same belief can be consumed by both dog autonomy and guardian work.
  const crowPosition = translateWorldPosition(
    sourceAssignment.dutyArea.center,
    0,
    6 * WORLD_POSITION_UNITS_PER_TILE,
  );
  let intendedPlayerPosition = mode === "guardian-work"
    ? translateWorldPosition(sourceAssignment.dutyArea.center,
        // The real landing must stay within a generated resident's hearing
        // reach even with this fixture's deliberately intervening cliff.
        // Preserve the fall pair and source intensity, not a clear-air bypass.
        -WORLD_POSITION_UNITS_PER_TILE, 3 * WORLD_POSITION_UNITS_PER_TILE)
    : mode === "single-source"
    ? translateWorldPosition(crowPosition, -4 * WORLD_POSITION_UNITS_PER_TILE, 0)
    // The deterministic post-commit flock loci are 120 units apart. This
    // listener point straddles the clear-air fish-crow hearing boundary.
    : translateWorldPosition(
        crowPosition,
        situatedExpressionAcoustics({
          meaning: "fish-crow-alarm-call",
          volume: "shout",
        }).rangeUnits - 183,
        0,
      );
  if (mode === "guardian-work") {
    intendedPlayerPosition = translateWorldPosition(intendedPlayerPosition,
      999 - intendedPlayerPosition.localX % WORLD_POSITION_UNITS_PER_TILE,
      201 - intendedPlayerPosition.localY % WORLD_POSITION_UNITS_PER_TILE,
    );
    if (intendedPlayerPosition.region.x !== 0 || intendedPlayerPosition.region.y !== 0) {
      throw new Error("Mixed alarm contact left the compatibility terrain fixture");
    }
    const x = Math.floor(intendedPlayerPosition.localX / WORLD_POSITION_UNITS_PER_TILE);
    const y = Math.floor(intendedPlayerPosition.localY / WORLD_POSITION_UNITS_PER_TILE);
    const start = world.terrain.tiles[y * world.terrain.width + x];
    const ridge = world.terrain.tiles[y * world.terrain.width + x + 1];
    if (start === undefined || ridge === undefined) throw new Error("Mixed alarm scene lost its finite contact pair");
    start.elevation = FIXED_POINT;
    ridge.elevation = 600_000;
    ridge.roughness = FIXED_POINT;
    ridge.terrain = "ridge";
    player.stamina = 300_000;
    player.stability = 0;
  }
  const playerPlacement = livingActorAddressInRegionalWindow({
    ...sourceGuardian.address,
    position: intendedPlayerPosition,
  }, regional.window);
  if (playerPlacement === null) {
    throw new Error("Fish-crow voice fixture could not place its player near guardian work");
  }
  player.x = playerPlacement.point.x;
  player.y = playerPlacement.point.y;
  player.previousX = player.x;
  player.previousY = player.y;
  player.facingMilliRadians = mode !== "candidate-order"
    ? mode === "guardian-work" ? -Math.round(Math.PI * 500) : 0
    : Math.round(Math.PI * 1_000);
  const playerPosition = playerWorldPositionInRegionalWindow(regional.window, player);
  if (playerPosition === null || stableStringify(playerPosition) !== stableStringify(
    intendedPlayerPosition,
  )) throw new Error("Fish-crow voice fixture lost its player");
  const harrierPosition = translateWorldPosition(
    crowPosition,
    WORLD_POSITION_UNITS_PER_TILE,
    0,
  );
  const deerPosition = translateWorldPosition(
    crowPosition,
    0,
    -6 * WORLD_POSITION_UNITS_PER_TILE,
  );
  // A moderate, actually heard alarm can invite work. A nearer strong alarm
  // must still startle this dog and defer to its own safety, not force a bark.
  const guardianPosition = mode === "guardian-work"
    ? translateWorldPosition(sourceAssignment.dutyArea.center, 0, -4 * WORLD_POSITION_UNITS_PER_TILE)
    : sourceGuardian.address.position;
  const readyCrow = replaceCoreWildlifeActorPhysiology(crow, {
    atTick: patch.updatedAtTick,
    needs: { hunger: 0, safety: 0, rest: 0 },
    condition: crow.condition,
  });
  const satiatedHarrier = replaceCoreWildlifeActorPhysiology(harrier, {
    atTick: patch.updatedAtTick,
    needs: { ...harrier.needs, hunger: 0 },
    condition: harrier.condition,
  });
  const readyDeer = replaceCoreWildlifeActorPhysiology(deer, {
    atTick: patch.updatedAtTick,
    needs: { hunger: 0, safety: 0, rest: 0 },
    condition: deer.condition,
  });
  patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(readyCrow, {
    atTick: patch.updatedAtTick,
    position: crowPosition,
    heading: 0,
  }));
  patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(satiatedHarrier, {
    atTick: patch.updatedAtTick,
    position: harrierPosition,
    heading: 500_000,
  }));
  patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(readyDeer, {
    atTick: patch.updatedAtTick,
    position: deerPosition,
    heading: 500_000,
  }));
  const readyGuardian = mode === "guardian-work"
    ? replaceDogActorPhysiology(sourceGuardian, {
        atTick: patch.updatedAtTick,
        needs: { hunger: 0, thirst: 0, safety: 0, rest: 0, company: 0 },
        condition: sourceGuardian.condition,
        humanFamiliarity: sourceGuardian.humanFamiliarity,
      })
    : sourceGuardian;
  let positionedGuardian = repositionDogActor(readyGuardian, {
    atTick: patch.updatedAtTick,
    position: guardianPosition,
    heading: 750_000,
  });
  if (mode === "guardian-work") {
    const settlement = deserializeSettlementEcologyState(envelope.settlementEcology);
    const custody = settlement.domesticCustodies.find(({ relationshipId }) => (
      relationshipId === sourceAssignment.workerCustodyRelationshipId
    ));
    if (custody === undefined) throw new Error("Mixed alarm scene lost real guardian home custody");
    const delta = worldPositionDelta(guardianPosition, custody.homeStructure.position);
    const circadian = projectSettlementWorkingDogCircadian({
      dog: positionedGuardian,
      custody,
      assignment: sourceAssignment,
      atTick: patch.updatedAtTick,
      kennelArrived: Math.hypot(delta.x, delta.y) <= custody.homeStructure.radiusUnits,
    });
    if (circadian === null) throw new Error("Mixed alarm scene could not reproject its actual guardian pose");
    positionedGuardian = replaceDogActorCircadian(positionedGuardian, {
      atTick: patch.updatedAtTick, circadian: circadian.receipt,
    });
  }
  const positionedRoster = replaceDogActorInRoster(sourceRoster, positionedGuardian);
  if (positionedRoster === null) {
    throw new Error("Fish-crow voice fixture rejected its guardian position");
  }

  const crowGroup = patch.groups.groups.find(({ identity, memberOrdinals }) => (
    identity.species === crow.identity.species
    && identity.populationKey === crow.identity.populationKey
    && memberOrdinals.includes(crow.identity.populationOrdinal)
  ));
  const crowGroupMemberIds = new Set(patch.populations
    .find(({ species, populationKey }) => (
      species === crow.identity.species
      && populationKey === crow.identity.populationKey
    ))?.members
    .filter(({ populationOrdinal }) => crowGroup?.memberOrdinals.includes(populationOrdinal))
    .map(({ actor }) => actor.identity.stableId) ?? []);
  let crowMateOrdinal = 0;
  let displacedOrdinal = 0;
  for (const actor of coreActors(patch)) {
    if (
      actor.identity.stableId === crow.identity.stableId
      || actor.identity.stableId === harrier.identity.stableId
      || actor.identity.stableId === deer.identity.stableId
    ) continue;
    const isCrowMate = crowGroupMemberIds.has(actor.identity.stableId);
    const moved = repositionCoreWildlifeActor(actor, {
      atTick: patch.updatedAtTick,
      position: isCrowMate
        ? translateWorldPosition(
            crowPosition,
            0,
            (40 + crowMateOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
          )
        : translateWorldPosition(
            playerPosition,
            (80 + displacedOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
            20 * WORLD_POSITION_UNITS_PER_TILE,
          ),
      heading: actor.address.heading,
    });
    const needsCrowCooldown = actor.identity.species === "fish-crow"
      && (
        mode !== "candidate-order"
        || actor.identity.stableId !== laterCandidateCrow.identity.stableId
      );
    const preparedActor = !needsCrowCooldown
      ? moved
      : canonicalizeCoreWildlifeActorState({
          ...moved,
          // The flock is materialized atomically around its authenticated
          // component anchor on load. Give crows outside this mode's candidate
          // set a lawful recent alarm cooldown so proximity cannot invent
          // additional independently admitted calls.
          memories: [...moved.memories, {
            eventId: `${moved.identity.stableId}:fixture-recent-alarm`,
            kind: "alarm",
            referenceId: harrier.identity.stableId,
            observationId: null,
            atTick: patch.updatedAtTick,
          }],
        });
    if (preparedActor === null) {
      throw new Error("Fish-crow voice fixture could not retain flockmate cooldown");
    }
    patch = replaceCoreEcologyAggregatePatchActor(patch, preparedActor);
    if (isCrowMate) crowMateOrdinal += 1;
    else displacedOrdinal += 1;
  }
  patch = reconcileFixtureGroupAnchors(patch);
  const positionedEnvelope = mode === "guardian-work"
    ? {
        ...adoptedEnvelope,
        regionalTravel: serializePlayerRegionalTravel(capturePlayerRegionalTravel(regional, player)),
        promiseJourney: {
          version: 1, contractId: player.activeContractId,
          detoured: true, compatibilityTrace: [],
        },
      }
    : adoptedEnvelope;
  const prepared = mode === "guardian-work"
    ? resealedCurrentEnvelopeWithCorePatch(positionedEnvelope, patch, {
        world: serializeWorld(world), player,
        dogActorRoster: serializeDogActorRoster(positionedRoster),
        perceptionCarry: {
          ...envelope.perceptionCarry,
          intervalStartPosition: playerPosition,
          intervalStartFacingMilliRadians: player.facingMilliRadians,
          playerStepStateAnchor: { version: 1, sampleOrdinal: 0, stamina: player.stamina, mode: player.mode },
        },
      })
    : resealedEnvelope(positionedEnvelope, {
        world: serializeWorld(world), player,
        coreEcology: serializeCoreEcologyAggregatePatch(patch),
        dogActorRoster: serializeDogActorRoster(positionedRoster),
      });
  await repository.save(recordWithEnvelope(record, prepared));
  initial.destroy();
  scheduledFrame = undefined;

  const runtime = await createTideweftRuntime(repository);
  if (runtime.getUIView().saveWarning !== undefined) {
    throw new Error(`Fish-crow voice fixture was rejected: ${stableStringify(
      runtime.getUIView().saveWarning,
    )}`);
  }
  await runtime.save();
  const stagedCrows = coreActors(requiredActiveLegacyCore(requiredEnvelope(repository)))
    .filter(({ identity }) => identity.species === "fish-crow");
  const uncappedStagedCrowIds = stagedCrows
    .filter(({ identity }) => (
      identity.stableId !== crow.identity.stableId
      && (
        mode !== "candidate-order"
        || identity.stableId !== laterCandidateCrow.identity.stableId
      )
    ))
    .filter(({ memories }) => !memories.some((memory) => (
      memory.kind === "alarm"
      && memory.referenceId === harrier.identity.stableId
      && memory.atTick === patch.updatedAtTick
    )))
    .map(({ identity }) => identity.stableId);
  if (uncappedStagedCrowIds.length > 0) {
    throw new Error(`Fish-crow voice fixture lost flockmate cooldown: ${stableStringify(
      uncappedStagedCrowIds,
    )}`);
  }
  return Object.freeze({
    runtime,
    repository,
    crowActorId: crow.identity.stableId,
    candidateCrowActorIds: Object.freeze([
      crow.identity.stableId,
      laterCandidateCrow.identity.stableId,
    ] as const),
    deerActorId: deer.identity.stableId,
    guardianActorId: sourceGuardian.identity.stableId,
    initialCrowPosition: crowPosition,
    promiseLot: (() => {
      const lot = envelope.physicalCargo.carrier.lots.find(({ payload }) => (
        payload.kind === "promise" && payload.contractId === envelope.player.activeContractId
      ));
      return lot?.payload.kind === "promise"
        ? Object.freeze({ id: lot.id, contractId: lot.payload.contractId, quantity: lot.payload.quantity })
        : null;
    })(),
  });
}

function regionalUplandHabitatFromCurrentEcology(
  ecology: CoreEcologyAggregatePatchState,
): CoreEcologyRegionalUplandHabitatAssemblage {
  if (
    ecology.derivation.kind === "habitat-v10"
    || ecology.derivation.kind === "legacy-fixed-v1-with-habitat-v10"
  ) return ecology.derivation.habitat;
  if (
    ecology.derivation.kind !== "habitat-v11"
    && ecology.derivation.kind !== "legacy-fixed-v1-with-habitat-v11"
  ) throw new Error("fresh migration source omitted regional-predator habitat v11");
  const habitat = ecology.derivation.habitat;
  const upland = canonicalizeCoreEcologyRegionalUplandHabitatAssemblage({
    generationVersion: CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_VERSION,
    originRegion: habitat.originRegion,
    regionId: habitat.regionId,
    terrainHash: habitat.terrainHash,
    selection: habitat.selection,
    evaluatedTiles: habitat.evaluatedTiles,
    speciesEvaluations:
      habitat.speciesEvaluations - habitat.regionalHabitat.evaluatedTiles * 2,
    maximumAllocationBudget: CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_MAX_ALLOCATIONS,
    populations: habitat.populations.slice(0, CORE_ECOLOGY_REGIONAL_UPLAND_HABITAT_SPECIES.length),
    tidalAnchors: habitat.tidalAnchors,
    domesticAnchor: habitat.domesticAnchor,
    domesticPenAnchor: habitat.domesticPenAnchor,
    regionalHabitat: habitat.regionalHabitat,
  });
  if (upland === null) {
    throw new Error("regional-predator habitat did not preserve its exact frozen v10 prefix");
  }
  return upland;
}

function domesticPenHabitatFromCurrentEcology(
  ecology: CoreEcologyAggregatePatchState,
): CoreEcologyDomesticPenHabitatAssemblage {
  if (
    ecology.derivation.kind === "habitat-v9"
    || ecology.derivation.kind === "legacy-fixed-v1-with-habitat-v9"
  ) return ecology.derivation.habitat;
  const habitat = regionalUplandHabitatFromCurrentEcology(ecology);
  const domesticPen = canonicalizeCoreEcologyDomesticPenHabitatAssemblage({
    generationVersion: CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_VERSION,
    originRegion: habitat.originRegion,
    regionId: habitat.regionId,
    terrainHash: habitat.terrainHash,
    selection: habitat.selection,
    evaluatedTiles: habitat.evaluatedTiles,
    speciesEvaluations:
      habitat.evaluatedTiles * CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_MAX_ALLOCATIONS,
    populations: habitat.populations.slice(
      0,
      CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_SPECIES.length,
    ),
    tidalAnchors: habitat.tidalAnchors,
    domesticAnchor: habitat.domesticAnchor,
    domesticPenAnchor: habitat.domesticPenAnchor,
  });
  if (domesticPen === null) {
    throw new Error("regional-upland habitat did not preserve its exact frozen v9 prefix");
  }
  return domesticPen;
}

function domesticPenCoreEcologyFromCurrent(
  ecology: CoreEcologyAggregatePatchState,
): CoreEcologyAggregatePatchState {
  if (
    ecology.derivation.kind === "habitat-v9"
    || ecology.derivation.kind === "legacy-fixed-v1-with-habitat-v9"
  ) return ecology;
  const regionalUpland = regionalUplandCoreEcologyFromCurrent(ecology);
  const regionalSpecies = new Set<CoreWildlifeSpecies>([
    "wild-boar",
    "elk",
    "gray-wolf",
  ]);
  const domesticPen = canonicalizeCoreEcologyAggregatePatch({
    ...regionalUpland,
    derivation: {
      kind: regionalUpland.derivation.kind === "legacy-fixed-v1-with-habitat-v10"
        ? "legacy-fixed-v1-with-habitat-v9"
        : "habitat-v9",
      habitat: domesticPenHabitatFromCurrentEcology(regionalUpland),
    },
    populations: regionalUpland.populations.filter(({ species }) => !regionalSpecies.has(species)),
    groups: {
      ...regionalUpland.groups,
      groups: regionalUpland.groups.groups.filter(({ identity }) => (
        !regionalSpecies.has(identity.species)
      )),
    },
  });
  if (domesticPen === null) {
    throw new Error("current ecology could not reconstruct the canonical v9 prefix");
  }
  return domesticPen;
}

function regionalUplandCoreEcologyFromCurrent(
  ecology: CoreEcologyAggregatePatchState,
): CoreEcologyAggregatePatchState {
  if (
    ecology.derivation.kind === "habitat-v10"
    || ecology.derivation.kind === "legacy-fixed-v1-with-habitat-v10"
  ) return ecology;
  if (
    ecology.derivation.kind !== "habitat-v11"
    && ecology.derivation.kind !== "legacy-fixed-v1-with-habitat-v11"
  ) throw new Error("current ecology has no regional-predator derivation");
  const predatorSpecies = new Set<CoreWildlifeSpecies>(
    CORE_ECOLOGY_REGIONAL_PREDATOR_HABITAT_SPECIES.slice(-2),
  );
  const upland = canonicalizeCoreEcologyAggregatePatch({
    ...ecology,
    derivation: {
      kind: ecology.derivation.kind === "legacy-fixed-v1-with-habitat-v11"
        ? "legacy-fixed-v1-with-habitat-v10"
        : "habitat-v10",
      habitat: regionalUplandHabitatFromCurrentEcology(ecology),
    },
    populations: ecology.populations.filter(({ species }) => !predatorSpecies.has(species)),
  });
  if (upland === null) {
    throw new Error("current ecology could not reconstruct the canonical v10 prefix");
  }
  return upland;
}

function tidalWebHabitatFromCurrentEcology(
  ecology: CoreEcologyAggregatePatchState,
): CoreEcologyTidalWebHabitatAssemblage {
  const habitat = domesticPenHabitatFromCurrentEcology(ecology);
  const tidalWeb = canonicalizeCoreEcologyTidalWebHabitatAssemblage({
    generationVersion: CORE_ECOLOGY_TIDAL_WEB_HABITAT_VERSION,
    originRegion: habitat.originRegion,
    regionId: habitat.regionId,
    terrainHash: habitat.terrainHash,
    selection: habitat.selection,
    evaluatedTiles: habitat.evaluatedTiles,
    speciesEvaluations:
      habitat.evaluatedTiles * CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_TIDAL_WEB_HABITAT_MAX_ALLOCATIONS,
    populations: habitat.populations.slice(
      0,
      CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES.length,
    ),
    tidalAnchors: habitat.tidalAnchors,
  });
  if (tidalWeb === null) {
    throw new Error("domestic-pen habitat did not preserve its exact frozen v7 prefix");
  }
  return tidalWeb;
}

function harborEdgeV10Record(current: SaveRecord): SaveRecord {
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const envelope = decoded as unknown as CurrentEnvelope;
  let ecology = domesticPenCoreEcologyFromCurrent(requiredCore(envelope));
  const habitat = tidalWebHabitatFromCurrentEcology(ecology);
  const harborEdgeHabitat = canonicalizeCoreEcologyHarborEdgeHabitatAssemblage({
    generationVersion: CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION,
    originRegion: habitat.originRegion,
    regionId: habitat.regionId,
    terrainHash: habitat.terrainHash,
    selection: habitat.selection,
    evaluatedTiles: habitat.evaluatedTiles,
    speciesEvaluations:
      habitat.evaluatedTiles * CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS,
    populations: habitat.populations.slice(
      0,
      CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length,
    ),
  });
  if (harborEdgeHabitat === null) {
    throw new Error("marsh-edge habitat did not preserve its frozen v2 prefix");
  }
  const establishedActor = ecology.populations.find(({ species }) => (
    CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.includes(
      species as (typeof CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES)[number],
    )
  ))?.members[0]?.actor;
  if (establishedActor === undefined) {
    throw new Error("v10 migration fixture omitted every established actor");
  }
  ecology = replaceCoreEcologyAggregatePatchActor(
    ecology,
    replaceCoreWildlifeActorPhysiology(establishedActor, {
      atTick: ecology.updatedAtTick,
      needs: { ...establishedActor.needs, hunger: 987_654 },
      condition: {
        ...establishedActor.condition,
        health: 876_543,
        stress: 234_567,
      },
    }),
  );
  const v10Ecology = canonicalizeCoreEcologyAggregatePatch({
    ...ecology,
    derivation: { kind: "habitat-v2", habitat: harborEdgeHabitat },
    populations: ecology.populations.filter(({ species }) => (
      CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.includes(
        species as (typeof CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES)[number],
      )
    )),
    groups: {
      ...ecology.groups,
      groups: ecology.groups.groups.filter(({ identity }) => (
        identity.species !== "fish-crow"
        && identity.species !== "domestic-chicken"
        && identity.species !== "domestic-goat"
      )),
    },
    aggregatePopulations: ecology.aggregatePopulations.filter(
      ({ species }) => species === "brown-rat",
    ),
  });
  if (v10Ecology === null) {
    throw new Error("fixture could not reconstruct the canonical v10 ecology state");
  }
  const {
    integrity: _integrity,
    playerExpressionRecency: _futurePlayerExpressionRecency,
    settlementEcology: _currentSettlementEcology,
    dogActorRoster: _currentDogActorRoster,
    settlementWorkingAnimals: _currentSettlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
    regionalEcology: _currentRegionalEcology,
    ...currentBase
  } = decoded;
  const v10Base = {
    ...currentBase,
    player: legacyPlayerWithoutTimeAction(envelope.player),
    perceptionCarry: legacyPerceptionCarry(envelope.perceptionCarry),
    version: 10,
    coreEcology: serializePublishedAggregateV3(v10Ecology),
  };
  return {
    ...current,
    payloadVersion: 10,
    updatedAt: current.updatedAt + 1,
    worldJson: JSON.stringify({
      ...v10Base,
      integrity: gameSaveEnvelopeIntegrity(v10Base),
    }),
  };
}

function marshEdgeV11Record(current: SaveRecord): SaveRecord {
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const envelope = decoded as unknown as CurrentEnvelope;
  const ecology = domesticPenCoreEcologyFromCurrent(requiredCore(envelope));
  if (
    ecology.derivation.kind !== "habitat-v9"
    && ecology.derivation.kind !== "legacy-fixed-v1-with-habitat-v9"
  ) throw new Error("fresh migration source omitted domestic-pen habitat v9");
  const habitat = tidalWebHabitatFromCurrentEcology(ecology);
  const { tidalAnchors: _tidalAnchors, ...preTidalHabitat } = habitat;
  const marshEdgeHabitat = canonicalizeCoreEcologyMarshEdgeHabitatAssemblage({
    ...preTidalHabitat,
    generationVersion: CORE_ECOLOGY_MARSH_EDGE_HABITAT_VERSION,
    speciesEvaluations:
      habitat.evaluatedTiles * CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_MARSH_EDGE_HABITAT_MAX_ALLOCATIONS,
    populations: habitat.populations.slice(
      0,
      CORE_ECOLOGY_MARSH_EDGE_HABITAT_SPECIES.length,
    ),
  });
  if (marshEdgeHabitat === null) {
    throw new Error("rain-chorus habitat did not preserve its frozen v3 prefix");
  }
  const v11Ecology = canonicalizeCoreEcologyAggregatePatch({
    ...ecology,
    derivation: ecology.derivation.kind === "legacy-fixed-v1-with-habitat-v9"
      ? { kind: "legacy-fixed-v1-with-habitat-v3", habitat: marshEdgeHabitat }
      : { kind: "habitat-v3", habitat: marshEdgeHabitat },
    populations: ecology.populations.filter(({ species }) => (
      species !== "fish-crow"
      && species !== "northern-harrier"
      && species !== "snowy-egret"
      && species !== "american-black-duck"
      && species !== "north-american-river-otter"
      && species !== "domestic-chicken"
      && species !== "domestic-goat"
    )),
    groups: {
      ...ecology.groups,
      groups: ecology.groups.groups.filter(
        ({ identity }) => (
          identity.species !== "fish-crow"
          && identity.species !== "domestic-chicken"
          && identity.species !== "domestic-goat"
        ),
      ),
    },
    aggregatePopulations: ecology.aggregatePopulations.filter(
      ({ species }) => species === "brown-rat",
    ),
  });
  if (v11Ecology === null) {
    throw new Error("fixture could not reconstruct the canonical v11 ecology state");
  }
  const {
    integrity: _integrity,
    playerExpressionRecency: _futurePlayerExpressionRecency,
    settlementEcology: _currentSettlementEcology,
    dogActorRoster: _currentDogActorRoster,
    settlementWorkingAnimals: _currentSettlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
    regionalEcology: _currentRegionalEcology,
    ...currentBase
  } = decoded;
  const v11Base = {
    ...currentBase,
    player: legacyPlayerWithoutTimeAction(envelope.player),
    perceptionCarry: legacyPerceptionCarry(envelope.perceptionCarry),
    version: 11,
    coreEcology: serializePublishedAggregateV3(v11Ecology),
  };
  return {
    ...current,
    payloadVersion: 11,
    updatedAt: current.updatedAt + 1,
    worldJson: JSON.stringify({
      ...v11Base,
      integrity: gameSaveEnvelopeIntegrity(v11Base),
    }),
  };
}

function rainChorusV12Record(current: SaveRecord): SaveRecord {
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const envelope = decoded as unknown as CurrentEnvelope;
  const ecology = domesticPenCoreEcologyFromCurrent(requiredCore(envelope));
  if (
    ecology.derivation.kind !== "habitat-v9"
    && ecology.derivation.kind !== "legacy-fixed-v1-with-habitat-v9"
  ) throw new Error("fresh migration source omitted domestic-pen habitat v9");
  const habitat = tidalWebHabitatFromCurrentEcology(ecology);
  const { tidalAnchors: _tidalAnchors, ...rainChorusPrefix } = habitat;
  const rainChorusHabitat = canonicalizeCoreEcologyRainChorusHabitatAssemblage({
    ...rainChorusPrefix,
    generationVersion: CORE_ECOLOGY_RAIN_CHORUS_HABITAT_VERSION,
    speciesEvaluations:
      habitat.evaluatedTiles * CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_RAIN_CHORUS_HABITAT_MAX_ALLOCATIONS,
    populations: habitat.populations.slice(
      0,
      CORE_ECOLOGY_RAIN_CHORUS_HABITAT_SPECIES.length,
    ),
  });
  if (rainChorusHabitat === null) {
    throw new Error("tidal-table habitat did not preserve its frozen v4 prefix");
  }
  const v12Ecology = canonicalizeCoreEcologyAggregatePatch({
    ...ecology,
    derivation: ecology.derivation.kind === "legacy-fixed-v1-with-habitat-v9"
      ? { kind: "legacy-fixed-v1-with-habitat-v4", habitat: rainChorusHabitat }
      : { kind: "habitat-v4", habitat: rainChorusHabitat },
    populations: ecology.populations.filter(({ species }) => (
      species !== "snowy-egret"
      && species !== "american-black-duck"
      && species !== "north-american-river-otter"
      && species !== "domestic-chicken"
      && species !== "domestic-goat"
    )),
    groups: {
      ...ecology.groups,
      groups: ecology.groups.groups.filter(
        ({ identity }) => (
          identity.species !== "domestic-chicken"
          && identity.species !== "domestic-goat"
        ),
      ),
    },
    aggregatePopulations: ecology.aggregatePopulations.filter(({ species }) => (
      species !== "atlantic-silverside"
      && species !== "atlantic-marsh-fiddler-crab"
    )),
  });
  if (v12Ecology === null) {
    throw new Error("fixture could not reconstruct the canonical v12 ecology state");
  }
  const {
    integrity: _integrity,
    playerExpressionRecency: _futurePlayerExpressionRecency,
    settlementEcology: _currentSettlementEcology,
    dogActorRoster: _currentDogActorRoster,
    settlementWorkingAnimals: _currentSettlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
    regionalEcology: _currentRegionalEcology,
    ...currentBase
  } = decoded;
  const v12Base = {
    ...currentBase,
    player: legacyPlayerWithoutTimeAction(envelope.player),
    perceptionCarry: legacyPerceptionCarry(envelope.perceptionCarry),
    version: 12,
    coreEcology: serializePublishedAggregateV3(v12Ecology),
  };
  return {
    ...current,
    payloadVersion: 12,
    updatedAt: current.updatedAt + 1,
    worldJson: JSON.stringify({
      ...v12Base,
      integrity: gameSaveEnvelopeIntegrity(v12Base),
    }),
  };
}

function tidalTableV13Record(current: SaveRecord): SaveRecord {
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const envelope = decoded as unknown as CurrentEnvelope;
  const ecology = domesticPenCoreEcologyFromCurrent(requiredCore(envelope));
  if (
    ecology.derivation.kind !== "habitat-v9"
    && ecology.derivation.kind !== "legacy-fixed-v1-with-habitat-v9"
  ) throw new Error("fresh migration source omitted domestic-pen habitat v9");
  const habitat = tidalWebHabitatFromCurrentEcology(ecology);
  const tidalTableHabitat = canonicalizeCoreEcologyTidalTableHabitatAssemblage({
    ...habitat,
    generationVersion: CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION,
    speciesEvaluations:
      habitat.evaluatedTiles * CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS,
    populations: habitat.populations.slice(
      0,
      CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES.length,
    ),
    tidalAnchors: habitat.tidalAnchors.filter(({ species }) => (
      species !== "american-black-duck"
      && species !== "north-american-river-otter"
    )),
  });
  if (tidalTableHabitat === null) {
    throw new Error("waterfowl habitat did not preserve its frozen v5 prefix");
  }
  const v13Ecology = canonicalizeCoreEcologyAggregatePatch({
    ...ecology,
    derivation: ecology.derivation.kind === "legacy-fixed-v1-with-habitat-v9"
      ? { kind: "legacy-fixed-v1-with-habitat-v5", habitat: tidalTableHabitat }
      : { kind: "habitat-v5", habitat: tidalTableHabitat },
    populations: ecology.populations.filter(({ species }) => (
      species !== "american-black-duck"
      && species !== "north-american-river-otter"
      && species !== "domestic-chicken"
      && species !== "domestic-goat"
    )),
    groups: {
      ...ecology.groups,
      groups: ecology.groups.groups.filter(
        ({ identity }) => (
          identity.species !== "domestic-chicken"
          && identity.species !== "domestic-goat"
        ),
      ),
    },
  });
  if (v13Ecology === null) {
    throw new Error("fixture could not reconstruct canonical v13 ecology state");
  }
  const {
    integrity: _integrity,
    playerExpressionRecency: _futurePlayerExpressionRecency,
    settlementEcology: _currentSettlementEcology,
    dogActorRoster: _currentDogActorRoster,
    settlementWorkingAnimals: _currentSettlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
    regionalEcology: _currentRegionalEcology,
    ...currentBase
  } = decoded;
  const v13Base = {
    ...currentBase,
    player: legacyPlayerWithoutTimeAction(envelope.player),
    perceptionCarry: legacyPerceptionCarry(envelope.perceptionCarry),
    version: 13,
    coreEcology: serializePublishedAggregateV3(v13Ecology),
  };
  return {
    ...current,
    payloadVersion: 13,
    updatedAt: current.updatedAt + 1,
    worldJson: JSON.stringify({
      ...v13Base,
      integrity: gameSaveEnvelopeIntegrity(v13Base),
    }),
  };
}

function waterfowlV14Record(current: SaveRecord): SaveRecord {
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const envelope = decoded as unknown as CurrentEnvelope;
  const ecology = domesticPenCoreEcologyFromCurrent(requiredCore(envelope));
  if (
    ecology.derivation.kind !== "habitat-v9"
    && ecology.derivation.kind !== "legacy-fixed-v1-with-habitat-v9"
  ) throw new Error("fresh migration source omitted domestic-pen habitat v9");
  const habitat = tidalWebHabitatFromCurrentEcology(ecology);
  const waterfowlHabitat = canonicalizeCoreEcologyWaterfowlHabitatAssemblage({
    ...habitat,
    generationVersion: CORE_ECOLOGY_WATERFOWL_HABITAT_VERSION,
    speciesEvaluations:
      habitat.evaluatedTiles * CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES.length,
    maximumAllocationBudget: CORE_ECOLOGY_WATERFOWL_HABITAT_MAX_ALLOCATIONS,
    populations: habitat.populations.slice(
      0,
      CORE_ECOLOGY_WATERFOWL_HABITAT_SPECIES.length,
    ),
    tidalAnchors: habitat.tidalAnchors.filter(
      ({ species }) => species !== "north-american-river-otter",
    ),
  });
  if (waterfowlHabitat === null) {
    throw new Error("tidal-web habitat did not preserve its frozen v6 prefix");
  }
  const v14Ecology = canonicalizeCoreEcologyAggregatePatch({
    ...ecology,
    derivation: ecology.derivation.kind === "legacy-fixed-v1-with-habitat-v9"
      ? { kind: "legacy-fixed-v1-with-habitat-v6", habitat: waterfowlHabitat }
      : { kind: "habitat-v6", habitat: waterfowlHabitat },
    populations: ecology.populations.filter(
      ({ species }) => (
        species !== "north-american-river-otter"
        && species !== "domestic-chicken"
        && species !== "domestic-goat"
      ),
    ),
    groups: {
      ...ecology.groups,
      groups: ecology.groups.groups.filter(
        ({ identity }) => (
          identity.species !== "domestic-chicken"
          && identity.species !== "domestic-goat"
        ),
      ),
    },
  });
  if (v14Ecology === null) {
    throw new Error("fixture could not reconstruct canonical v14 ecology state");
  }
  const {
    integrity: _integrity,
    playerExpressionRecency: _futurePlayerExpressionRecency,
    settlementEcology: _currentSettlementEcology,
    dogActorRoster: _currentDogActorRoster,
    settlementWorkingAnimals: _currentSettlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
    regionalEcology: _currentRegionalEcology,
    ...currentBase
  } = decoded;
  const v14Base = {
    ...currentBase,
    player: legacyPlayerWithoutTimeAction(envelope.player),
    perceptionCarry: legacyPerceptionCarry(envelope.perceptionCarry),
    version: 14,
    coreEcology: serializePublishedAggregateV4(v14Ecology),
  };
  return {
    ...current,
    payloadVersion: 14,
    updatedAt: current.updatedAt + 1,
    worldJson: JSON.stringify({
      ...v14Base,
      integrity: gameSaveEnvelopeIntegrity(v14Base),
    }),
  };
}

function serializePublishedAggregateV3(
  ecology: CoreEcologyAggregatePatchState,
): string {
  const {
    carcasses: _carcasses,
    mortalityTransactions: _mortalityTransactions,
    nextMortalityOrdinal: _nextMortalityOrdinal,
    ...legacyRoot
  } = ecology;
  return stableStringify({
    ...legacyRoot,
    version: 3,
    populations: ecology.populations.map((population) => {
      const {
        baselinePopulationSize: _baselinePopulationSize,
        reserveUnits: _reserveUnits,
        ...legacy
      } = population;
      return legacy;
    }),
    aggregatePopulations: ecology.aggregatePopulations.map((population) => {
      const { lastTidalRedistributionTick: _omitted, ...legacy } = population;
      return legacy;
    }),
  });
}

function serializePublishedAggregateV4(
  ecology: CoreEcologyAggregatePatchState,
): string {
  const {
    carcasses: _carcasses,
    mortalityTransactions: _mortalityTransactions,
    nextMortalityOrdinal: _nextMortalityOrdinal,
    ...legacyRoot
  } = ecology;
  return stableStringify({
    ...legacyRoot,
    version: 4,
    populations: ecology.populations.map((population) => {
      const {
        baselinePopulationSize: _baselinePopulationSize,
        reserveUnits: _reserveUnits,
        ...legacy
      } = population;
      return legacy;
    }),
  });
}

function requiredEnvelope(repository: MemoryRepository): CurrentEnvelope {
  const value = JSON.parse(repository.snapshot().worldJson) as CurrentEnvelope;
  if (
    value.format !== "tideweft-session"
    || value.version !== 50
    || typeof value.regionalEcology !== "string"
  ) {
    throw new Error("core-ecology runtime fixture did not save a v50 envelope");
  }
  return value;
}

function resealedEnvelope(
  envelope: CurrentEnvelope,
  changes: Partial<Pick<
    CurrentEnvelope,
    | "coreEcology"
    | "dogActorRoster"
    | "perceptionCarry"
    | "physicalCargo"
    | "player"
    | "world"
  >>,
): CurrentEnvelope {
  const { integrity: _integrity, ...prior } = envelope;
  if (changes.coreEcology !== undefined) {
    const decodedSourcePatch = deserializeCoreEcologyAggregatePatch(changes.coreEcology);
    const sourcePatch = decodedSourcePatch === null
      ? null
      : stripFixtureAlarmEventPositionsForV24(decodedSourcePatch);
    const legacyCoreEcology = sourcePatch === null
      ? changes.coreEcology
      : serializeCoreEcologyAggregatePatch(sourcePatch);
    const { regionalEcology: _regionalEcology, playerExpressionRecency: _legacyPlayerExpressionRecency, ...legacyPrior } = prior;
    const legacyBase = {
      ...legacyPrior,
      ...changes,
      player: legacyPlayerWithoutTimeAction(changes.player ?? envelope.player),
      perceptionCarry: legacyPerceptionCarry(envelope.perceptionCarry),
      version: 24 as const,
      coreEcology: legacyCoreEcology,
    };
    const sourceEnvelopeIntegrity = gameSaveEnvelopeIntegrity(legacyBase);
    if (sourcePatch !== null) {
      const existingRegional = requiredRegionalEcology(envelope);
      if (sourcePatch.derivation.kind === "legacy-cohort-v1") {
        const priorLegacy = existingRegional.activeResidents.find(
          ({ kind }) => kind === "legacy-cohort",
        );
        if (priorLegacy === undefined || priorLegacy.sourceKey !== sourcePatch.patchKey) {
          throw new Error("v25 test fixture lost its legacy-cohort owner");
        }
        const regionalEcology = createRegionalEcologyState({
          root: existingRegional.root,
          settlementHome: {
            sourceKey: existingRegional.settlementHome.sourceKey,
            patch: existingRegional.settlementHome.patch,
          },
          activeRegions: existingRegional.activeRegions,
          activeResidents: existingRegional.activeResidents.map((resident) => {
            if (resident.kind !== "legacy-cohort" && resident.kind !== "regional-habitat") {
              throw new Error("v25 test fixture found a non-resident active source");
            }
            return {
              kind: resident.kind,
              sourceKey: resident.sourceKey,
              patch: resident.kind === "legacy-cohort" ? sourcePatch : resident.patch,
            };
          }),
        });
        const { coreEcology: _legacyCoreEcology, ...v25Changes } = changes;
        const { coreEcology: _priorCoreEcology, playerExpressionRecency: _v25PlayerExpressionRecency, ...v25Prior } = prior;
        const v25Base = {
          ...v25Prior,
          ...v25Changes,
          player: legacyPlayerWithoutTimeAction(changes.player ?? envelope.player),
          perceptionCarry: legacyPerceptionCarry(envelope.perceptionCarry),
          version: 25 as const,
          regionalEcology: serializeRegionalEcologyState(regionalEcology),
        };
        return Object.freeze({
          ...v25Base,
          integrity: gameSaveEnvelopeIntegrity(v25Base),
        }) as unknown as CurrentEnvelope;
      }
      const habitat = existingRegional.settlementHome.patch.derivation.kind === "settlement-home-v1"
        ? existingRegional.settlementHome.patch.derivation.habitat
        : null;
      if (habitat === null) throw new Error("v25 test fixture lost settlement-home habitat");
      const world = deserializeWorld(changes.world ?? envelope.world);
      const root = adoptRegionalEcologyFromV24({
        rootSeed: world.meta.rootSeed,
        completedTick: world.meta.completedTick,
        sourceEnvelopeIntegrity,
        legacyPatch: sourcePatch,
        protectedActorIds: productionV24ProtectedActorIds(envelope, sourcePatch),
        protectedAggregateIds: sourcePatch.aggregatePopulations
          .filter(({ species }) => species === "brown-rat")
          .map(({ aggregateId }) => aggregateId),
      });
      const home = adoptCoreEcologySettlementHomeFromV24({
        seed: world.meta.rootSeed,
        habitat,
        completedTick: world.meta.completedTick,
        sourcePatch,
      });
      const legacy = projectRegionalEcologyLegacyCohort({
        rootSeed: world.meta.rootSeed,
        root,
      });
      const regionalResidents = regionalEcologyRegionalResidentsForActiveRegions(
        root,
        world.meta.rootSeed,
        existingRegional.activeRegions,
      );
      if (home === null || legacy === null || regionalResidents === null) {
        throw new Error("v25 test fixture could not adopt its exact v24 ecology");
      }
      const regionalEcology = createRegionalEcologyState({
        root,
        settlementHome: { sourceKey: home.patchKey, patch: home },
        activeRegions: existingRegional.activeRegions,
        activeResidents: [
          ...regionalResidents,
          { kind: "legacy-cohort", sourceKey: legacy.patchKey, patch: legacy },
        ],
      });
      const { coreEcology: _legacyCoreEcology, ...v25Changes } = changes;
      const { coreEcology: _priorCoreEcology, playerExpressionRecency: _v25PlayerExpressionRecency, ...v25Prior } = prior;
      const v25Base = {
        ...v25Prior,
        ...v25Changes,
        player: legacyPlayerWithoutTimeAction(changes.player ?? envelope.player),
        perceptionCarry: legacyPerceptionCarry(envelope.perceptionCarry),
        version: 25 as const,
        regionalEcology: serializeRegionalEcologyState(regionalEcology),
      };
      return Object.freeze({
        ...v25Base,
        integrity: gameSaveEnvelopeIntegrity(v25Base),
      }) as unknown as CurrentEnvelope;
    }
    return Object.freeze({
      ...legacyBase,
      integrity: sourceEnvelopeIntegrity,
    }) as unknown as CurrentEnvelope;
  }
  const unsealed = { ...prior, ...changes };
  return Object.freeze({
    ...unsealed,
    integrity: gameSaveEnvelopeIntegrity(unsealed),
  });
}

/**
 * `resealedEnvelope` turns a current aggregate patch into a synthetic v24
 * migration input. Alarm-event loci first became durable in v38, so the
 * historical source must omit them before its envelope integrity and v25
 * adoption authority are derived.
 */
function stripFixtureAlarmEventPositionsForV24(
  source: CoreEcologyAggregatePatchState,
): CoreEcologyAggregatePatchState {
  let patch = source;
  for (const actor of coreActors(source)) {
    if (!actor.memories.some(({ eventPosition }) => eventPosition !== undefined)) continue;
    const legacyActor = canonicalizeCoreWildlifeActorState({
      ...actor,
      memories: actor.memories.map((memory) => {
        const { eventPosition: _eventPosition, ...legacyMemory } = memory;
        return legacyMemory;
      }),
    });
    if (legacyActor === null) {
      throw new Error("v24 fixture could not remove future alarm-event loci");
    }
    patch = replaceCoreEcologyAggregatePatchActor(patch, legacyActor);
  }
  return patch;
}

/**
 * Gives an untouched compatibility cohort its real durable owner before a
 * gameplay fixture mutates it. Historical migration runs exactly once; every
 * later edit targets the resulting current v50 active resident.
 */
async function adoptUntouchedFixtureCoreAsCurrent(
  repository: MemoryRepository,
  initial: TideweftRuntime,
  envelope: CurrentEnvelope,
  protectedActorIdsFor: (
    source: CoreEcologyAggregatePatchState,
  ) => readonly string[],
): Promise<CurrentEnvelope> {
  const untouched = requiredCore(envelope);
  const protectedActorIds = protectedActorIdsFor(untouched);
  if (protectedActorIds.length === 0) {
    throw new Error("fixture adoption requires at least one exact protected actor");
  }
  const sourcePatch = promoteFixtureActors(untouched, protectedActorIds);
  const historical = resealedEnvelope(envelope, {
    coreEcology: serializeCoreEcologyAggregatePatch(sourcePatch),
  });
  await repository.save(recordWithEnvelope(repository.snapshot(), historical));
  initial.destroy();
  scheduledFrame = undefined;

  const migration = await createTideweftRuntime(repository);
  try {
    if (migration.getUIView().saveWarning !== undefined) {
      throw new Error(`untouched fixture adoption was rejected: ${stableStringify(
        migration.getUIView().saveWarning,
      )}`);
    }
    await migration.save();
    return requiredEnvelope(repository);
  } finally {
    migration.destroy();
    scheduledFrame = undefined;
  }
}

/**
 * Replaces one current hot-source patch without laundering it through a
 * historical envelope. Every sparse root and unrelated resident remains the
 * exact durable child already owned by the save.
 */
function resealedCurrentEnvelopeWithCorePatch(
  envelope: CurrentEnvelope,
  replacementPatch: CoreEcologyAggregatePatchState,
  changes: Partial<Pick<
    CurrentEnvelope,
    | "dogActorRoster"
    | "perceptionCarry"
    | "physicalCargo"
    | "player"
    | "world"
  >> = {},
): CurrentEnvelope {
  if ((envelope as Readonly<{ version: number }>).version !== 50) {
    throw new Error("current ecology fixture requires a v50 envelope");
  }
  const state = requiredRegionalEcologyV6(envelope);
  const v5 = state.base;
  const v4 = v5.base;
  const v3 = v4.base;
  const v2 = v3.base;
  const v1 = v2.base;
  let replacementCount = 0;
  const replacementFor = (
    sourceKey: string,
    patch: CoreEcologyAggregatePatchState,
  ): CoreEcologyAggregatePatchState => {
    if (sourceKey !== replacementPatch.patchKey) return patch;
    replacementCount += 1;
    return replacementPatch;
  };
  const nextV1 = createRegionalEcologyState({
    root: v1.root,
    settlementHome: {
      sourceKey: v1.settlementHome.sourceKey,
      patch: replacementFor(v1.settlementHome.sourceKey, v1.settlementHome.patch),
    },
    activeRegions: v1.activeRegions,
    activeResidents: v1.activeResidents.map((resident) => {
      if (resident.kind !== "legacy-cohort" && resident.kind !== "regional-habitat") {
        throw new Error("current ecology fixture found an invalid active base resident");
      }
      return {
        kind: resident.kind,
        sourceKey: resident.sourceKey,
        patch: replacementFor(resident.sourceKey, resident.patch),
      };
    }),
  });
  const nextV2 = createRegionalEcologyStateV2({
    base: nextV1,
    alpineRoot: v2.alpineRoot,
    alpineActiveResidents: v2.alpineActiveResidents.map((resident) => ({
      sourceKey: resident.sourceKey,
      patch: replacementFor(resident.sourceKey, resident.patch),
    })),
    adoption: v2.adoption,
  });
  const nextV3 = createRegionalEcologyStateV3({
    base: nextV2,
    polarShoreRoot: v3.polarShoreRoot,
    polarShoreActiveResidents: v3.polarShoreActiveResidents.map((resident) => ({
      sourceKey: resident.sourceKey,
      patch: replacementFor(resident.sourceKey, resident.patch),
    })),
    adoption: v3.adoption,
  });
  const nextV4 = createRegionalEcologyStateV4({
    base: nextV3,
    coldShoreRoot: v4.coldShoreRoot,
    coldShoreActiveResidents: v4.coldShoreActiveResidents.map((resident) => ({
      sourceKey: resident.sourceKey,
      patch: replacementFor(resident.sourceKey, resident.patch),
    })),
    adoption: v4.adoption,
  });
  const nextV5 = createRegionalEcologyStateV5({
    base: nextV4,
    polarConsumerRoot: v5.polarConsumerRoot,
    polarConsumerActiveResidents: v5.polarConsumerActiveResidents.map((resident) => ({
      sourceKey: resident.sourceKey,
      patch: replacementFor(resident.sourceKey, resident.patch),
    })),
    adoption: v5.adoption,
  });
  const nextV6 = createRegionalEcologyStateV6({
    base: nextV5,
    breadthRoot: state.breadthRoot,
    breadthActiveResidents: state.breadthActiveResidents.map((resident) => ({
      sourceKey: resident.sourceKey,
      patch: replacementFor(resident.sourceKey, resident.patch),
    })),
    adoption: state.adoption,
  });
  if (replacementCount !== 1) {
    throw new Error(`current ecology fixture found ${replacementCount} owners for ${replacementPatch.patchKey}`);
  }
  const { integrity: _integrity, ...prior } = envelope;
  const unsealed = {
    ...prior,
    ...changes,
    regionalEcology: serializeRegionalEcologyStateV6(nextV6),
  };
  return Object.freeze({
    ...unsealed,
    integrity: gameSaveEnvelopeIntegrity(unsealed),
  });
}

/** Produces the same authenticated alarm state that a live actor step commits. */
function createFixtureCommittedAlarmActor(
  source: CoreWildlifeActorState,
  input: Readonly<{
    atTick: number;
    position: CoreWildlifeActorState["address"]["position"];
    heading: number;
    threatId: string;
  }>,
): CoreWildlifeActorState {
  if (input.atTick < 1) throw new Error("fixture alarm requires one prior actor tick");
  const { circadian: _circadian, ...withoutCircadian } = source;
  const prior = canonicalizeCoreWildlifeActorState({
    ...withoutCircadian,
    updatedAtTick: input.atTick - 1,
    perception: createActorPerceptionState(source.identity.stableId, input.atTick - 1),
    intent: {
      kind: "observe",
      cause: { kind: "condition", referenceId: "condition:neutral-watch" },
      focusObservationId: null,
      resourceReference: null,
      enteredAtTick: input.atTick - 1,
      expiresAtTick: null,
    },
    memories: [],
  });
  if (prior === null) throw new Error("fixture alarm prior actor was rejected");
  const observation = createActorObservation({
    id: `obs:fixture-alarm:${hashCanonical([
      prior.identity.stableId,
      input.threatId,
      input.atTick,
    ])}`,
    observerId: prior.identity.stableId,
    observedAtTick: input.atTick,
    channel: "vision",
    perceivedClass: "threat",
    subjectId: input.threatId,
    area: { center: input.position, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: ACTOR_PERCEPTION_SCALE,
    identification: "identified",
  });
  if (observation === null) throw new Error("fixture alarm observation was rejected");
  const stepped = stepCoreWildlifeActor(prior, {
    tick: input.atTick,
    observations: [observation],
    foodOpportunities: [],
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (stepped === null || stepped.decision.intent !== "alarm") {
    throw new Error(`fixture alarm source chose ${stepped?.decision.intent ?? "no action"}`);
  }
  const positioned = repositionCoreWildlifeActor(stepped.actor, {
    atTick: input.atTick,
    position: input.position,
    heading: input.heading,
  });
  return commitCoreWildlifeAlarmEventLocus(positioned, stepped.event);
}

/**
 * Relocates an entire synthetic fixture snapshot, including a fresh alarm's
 * already-committed physical locus. Production movement never rewrites an
 * earlier call; this helper is only for arranging a same-tick test world
 * before that world is admitted by the current-save trust boundary.
 */
function repositionFixtureActorAndCurrentAlarmLocus(
  source: CoreWildlifeActorState,
  move: Readonly<{
    atTick: number;
    position: CoreWildlifeActorState["address"]["position"];
    heading: number;
  }>,
): CoreWildlifeActorState {
  const moved = repositionCoreWildlifeActor(source, move);
  if (
    source.updatedAtTick !== move.atTick
    || source.intent.kind !== "alarm"
    || source.intent.enteredAtTick !== move.atTick
  ) return moved;
  const eventId = `${source.identity.stableId}:e:${move.atTick.toString(36)}:alarm`;
  const matching = source.memories.filter((memory) => memory.eventId === eventId);
  if (matching.length !== 1 || matching[0]?.eventPosition === undefined) {
    throw new Error("fixture cannot relocate an unauthenticated current alarm");
  }
  const relocated = canonicalizeCoreWildlifeActorState({
    ...moved,
    memories: moved.memories.map((memory) => memory.eventId === eventId
      ? { ...memory, eventPosition: move.position }
      : memory),
  });
  if (relocated === null) {
    throw new Error("fixture could not relocate its current alarm locus");
  }
  return relocated;
}

function legacyPlayerWithoutTimeAction(player: PlayerState): PlayerState {
  const { timeAction: _futureTimeAction, ...legacyPlayer } = player;
  return legacyPlayer as PlayerState;
}

function legacyPerceptionCarry(
  carry: unknown,
): Readonly<Record<string, unknown>> {
  if (carry === null || typeof carry !== "object" || Array.isArray(carry)) {
    throw new Error("fixture omitted its perception carry");
  }
  const record = carry as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record).sort();
  const legacyKeys = [
    "nextPlayerSenseSampleOrdinal",
    "playerSenseSamples",
    "playerStepsSinceWorldTick",
    "version",
  ];
  if (record.version === 1) {
    if (stableStringify(keys) !== stableStringify(legacyKeys)) {
      throw new Error("historical fixture contains a non-canonical v1 perception carry");
    }
    return Object.freeze({ ...record });
  }
  const currentKeys = [
    "actorVocalizationSamples",
    "intervalStartFacingMilliRadians",
    "intervalStartPosition",
    "nextPlayerSenseSampleOrdinal",
    "playerSenseSamples",
    "playerStepsSinceWorldTick",
    "situatedExpressionAdmissions",
    "situatedExpressionCausalAuthority",
    "situatedExpressionChannels",
    "version",
  ];
  const currentContactKeys = [...currentKeys, "animalContactAcousticCarry"].sort();
  const currentStepStateKeys = [
    ...currentContactKeys,
    "playerStepStateAnchor",
    "playerStepStateSamples",
  ].sort();
  const latestStepStateKeys = [
    ...currentStepStateKeys,
    "intervalStartWasSleeping",
  ].sort();
  if (
    (record.version !== 4
      && record.version !== 5
      && record.version !== 6
      && record.version !== 7
      && record.version !== 8
      && record.version !== 9
      && record.version !== 10
      && record.version !== 11
      && record.version !== 12
      && record.version !== 13
      && record.version !== 14)
    || stableStringify(keys) !== stableStringify(
      record.version === 12 || record.version === 13 || record.version === 14
        ? latestStepStateKeys
        : record.version === 10 || record.version === 11
          ? currentStepStateKeys
        : record.version === 8 || record.version === 9
          ? currentContactKeys
          : currentKeys,
    )
  ) {
    throw new Error("current fixture omitted the canonical perception carry");
  }
  const {
    actorVocalizationSamples: _actorVocalizationSamples,
    animalContactAcousticCarry: _animalContactAcousticCarry,
    intervalStartFacingMilliRadians: _intervalStartFacingMilliRadians,
    intervalStartPosition: _intervalStartPosition,
    intervalStartWasSleeping: _intervalStartWasSleeping,
    playerStepStateAnchor: _playerStepStateAnchor,
    playerStepStateSamples: _playerStepStateSamples,
    situatedExpressionAdmissions: _situatedExpressionAdmissions,
    situatedExpressionCausalAuthority: _situatedExpressionCausalAuthority,
    situatedExpressionChannels: _situatedExpressionChannels,
    ...legacy
  } = record;
  return Object.freeze({ ...legacy, version: 1 });
}

function currentPlayerFromLegacy(player: PlayerState): PlayerState {
  return { ...player, timeAction: null };
}

function coreEcologyActorIds(patch: CoreEcologyAggregatePatchState): readonly string[] {
  return patch.populations.flatMap(({ members }) => (
    members.map(({ actor }) => actor.identity.stableId)
  ));
}

function promoteFixtureActors(
  source: CoreEcologyAggregatePatchState,
  actorIds: readonly string[],
): CoreEcologyAggregatePatchState {
  let patch = source;
  for (const actorId of actorIds) {
    const actor = coreActors(patch).find(({ identity }) => identity.stableId === actorId);
    if (actor === undefined) throw new Error(`fixture cannot promote absent actor ${actorId}`);
    const promoted = canonicalizeCoreWildlifeActorState({
      ...actor,
      address: { ...actor.address, persistence: "promoted" },
    });
    if (promoted === null) throw new Error(`fixture could not promote actor ${actorId}`);
    patch = replaceCoreEcologyAggregatePatchActor(patch, promoted);
  }
  return patch;
}

/** Mirrors the external references protected by the production v24-to-v25 adapter. */
function productionV24ProtectedActorIds(
  envelope: CurrentEnvelope,
  patch: CoreEcologyAggregatePatchState,
): readonly string[] {
  const choices = canonicalizeLivingActorPlayerChoiceState(envelope.livingActorPlayerChoice);
  if (choices === null) throw new Error("v24 test fixture lost canonical player-choice history");
  const sourceActorIds = new Set(coreEcologyActorIds(patch));
  const choiceActorIds = choices.events.flatMap(({ effect }) => {
    switch (effect.kind) {
      case "request-provision-offer":
        return [effect.custodianActorId, effect.beneficiaryActorId];
      case "request-secure-provisions":
        return [effect.custodianActorId];
      case "wait-observe":
      case "leave-interaction":
        return effect.focusActorId === null ? [] : [effect.focusActorId];
      case "request-reroute":
        return [effect.focusActorId];
    }
  });
  return Object.freeze([...new Set([
    ...choiceActorIds,
    ...patch.populations.flatMap(({ species, members }) => (
      CORE_ECOLOGY_DOMESTIC_SPECIES.includes(species)
        ? members.map(({ actor }) => actor.identity.stableId)
        : members.flatMap(({ actor }) => (
            actor.address.persistence === "promoted"
              ? [actor.identity.stableId]
              : []
          ))
    )),
  ])].filter((actorId) => sourceActorIds.has(actorId)).sort(compareText));
}

/**
 * Fixture-only ownership repair after tests deliberately reposition an entire
 * v24 cohort. Regional admission is group-atomic, so member coordinates and
 * the persisted component anchors must describe the same physical topology.
 */
function reconcileFixtureGroupAnchors(
  patch: CoreEcologyAggregatePatchState,
): CoreEcologyAggregatePatchState {
  const populations = new Map(patch.populations.map((population) => (
    [`${population.species}\u0000${population.populationKey}`, population] as const
  )));
  const groups = patch.groups.groups.map((group) => {
    const population = populations.get(
      `${group.identity.species}\u0000${group.identity.populationKey}`,
    );
    if (population === undefined) throw new Error("fixture group lost its population owner");
    const byOrdinal = new Map(population.members.map((member) => (
      [member.populationOrdinal, member.actor.address.position] as const
    )));
    const componentAnchors = group.components.map((component) => {
      const anchor = byOrdinal.get(component.memberOrdinals[0]!);
      if (anchor === undefined) throw new Error("fixture group lost a component member");
      return { componentId: component.componentId, anchor };
    });
    const reconciled = reconcileCoreEcologyGroupAnchors(group, {
      atTick: patch.updatedAtTick,
      componentAnchors,
      rendezvousAnchor: componentAnchors[0]!.anchor,
    });
    if (reconciled === null) throw new Error("fixture group anchors could not be reconciled");
    return reconciled;
  });
  const candidate = canonicalizeCoreEcologyAggregatePatch({
    ...patch,
    groups: createCoreEcologyGroupSet(groups),
  });
  if (candidate === null) throw new Error("fixture group reconciliation broke ecology ownership");
  return candidate;
}

function recordWithEnvelope(
  record: SaveRecord,
  envelope: CurrentEnvelope,
): SaveRecord {
  return {
    ...record,
    payloadVersion: envelope.version,
    worldJson: JSON.stringify(envelope),
  };
}

function makeWorldDryAndClear(world: ReturnType<typeof deserializeWorld>): void {
  for (const tile of world.terrain.tiles) {
    tile.elevation = 900_000;
    tile.moisture = 100_000;
    tile.roughness = 0;
    tile.terrain = "meadow";
    tile.baseTravelCost = 100;
  }
  world.weather.kind = "clear";
  world.weather.intensity = 0;
  world.weather.windX = 0;
  world.weather.windY = 0;
  world.weather.nextChangeTick = world.meta.completedTick + 100_000;
}

function withFixtureRestIntent(actor: CoreWildlifeActorState): CoreWildlifeActorState {
  const resting = canonicalizeCoreWildlifeActorState({
    ...actor,
    intent: {
      kind: "rest",
      cause: { kind: "condition", referenceId: "condition:fixture-rest" },
      focusObservationId: null,
      resourceReference: null,
      enteredAtTick: actor.updatedAtTick,
      expiresAtTick: actor.updatedAtTick + 5,
    },
  });
  if (resting === null) throw new Error("Fixture rest intent was not canonical");
  return resting;
}

function requiredCoreMember(
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): CoreEcologyAggregatePatchState["populations"][number]["members"][number] {
  const member = patch.populations.flatMap(({ members }) => members)
    .find(({ actor }) => actor.identity.stableId === actorId);
  if (member === undefined) throw new Error(`Fixture lost core actor ${actorId}`);
  return member;
}

function requiredCoreActor(
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): CoreWildlifeActorState {
  return requiredCoreMember(patch, actorId).actor;
}

function commitFixtureCrowRoutinePosture(
  source: CoreEcologyAggregatePatchState,
  actorId: string,
  posture: "resting" | "asleep",
  authority: CoreEcologyActivityAuthorityV1,
): CoreEcologyAggregatePatchState {
  const actor = requiredCoreActor(source, actorId);
  const enteredAtTick = posture === "asleep"
    ? Math.max(0, source.updatedAtTick - 64)
    : source.updatedAtTick;
  const resting = canonicalizeCoreWildlifeActorState({
    ...actor,
    intent: {
      kind: "rest",
      cause: {
        kind: "condition",
        referenceId: CORE_WILDLIFE_ROUTINE_REST_REFERENCE_ID,
      },
      focusObservationId: null,
      resourceReference: null,
      enteredAtTick,
      expiresAtTick: source.updatedAtTick + 5,
    },
  });
  if (resting === null) throw new Error("Crow routine-rest fixture was not canonical");
  const patch = replaceCoreEcologyAggregatePatchActor(source, resting);
  const committed = stepCoreEcologyActivityMotion(patch, {
    actorId,
    atTick: patch.updatedAtTick,
    maximumStepUnits: 1,
  }, authority);
  if (committed === null || committed.resolution !== "held") {
    throw new Error(`Crow routine-rest fixture resolved ${committed?.resolution ?? "null"}`);
  }
  const committedActor = requiredCoreActor(committed.patch, actorId);
  if (
    committedActor.circadian?.restDestinationArrived !== true
    || committedActor.circadian.posture.state !== posture
  ) throw new Error(`Crow routine-rest fixture did not commit ${posture}`);
  return committed.patch;
}

async function createCommittedCrowAlarmRuntime(
  posture: "resting" | "asleep",
  safety: number,
): Promise<Readonly<{
  runtime: TideweftRuntime;
  repository: MemoryRepository;
  crowActorId: string;
  restDestinationId: string;
  beforeTick: number;
  beforeCrow: CoreWildlifeActorState;
}>> {
  const repository = new MemoryRepository();
  const initial = await createTideweftRuntime(repository);
  initial.dispatchUI({
    type: "new-world",
    seed: "rain-chorus-runtime-2",
    posture: "gale",
    sessionShape: "wander",
  });
  await initial.save();
  const envelope = await adoptUntouchedFixtureCoreAsCurrent(
    repository,
    initial,
    requiredEnvelope(repository),
    (source) => [
      source.populations.find(({ species }) => species === "fish-crow")
        ?.members[0]?.actor.identity.stableId,
      source.populations.find(({ species }) => species === "gull")
        ?.members[0]?.actor.identity.stableId,
    ].filter((actorId): actorId is string => actorId !== undefined),
  );
  const record = repository.snapshot();
  const world = deserializeWorld(envelope.world);
  makeWorldDryAndClear(world);
  let patch = requiredActiveLegacyCore(envelope);
  const crowPopulation = patch.populations.find(({ species }) => species === "fish-crow");
  const initialCrowMember = crowPopulation?.members[0];
  const initialGull = patch.populations.find(({ species }) => species === "gull")
    ?.members[0]?.actor;
  const crowGroup = patch.groups.groups.find(({ identity, memberOrdinals }) => (
    identity.species === "fish-crow"
    && identity.populationKey === crowPopulation?.populationKey
    && memberOrdinals.includes(initialCrowMember?.populationOrdinal ?? -1)
  ));
  if (
    crowPopulation === undefined
    || initialCrowMember === undefined
    || initialGull === undefined
    || crowGroup === undefined
  ) {
    throw new Error("Crow wake fixture omitted its crow or alarm gull");
  }
  const crowGroupActorIds = crowPopulation.members.filter(({ populationOrdinal }) => (
    crowGroup.memberOrdinals.includes(populationOrdinal)
  )).map(({ actor }) => actor.identity.stableId);
  const alreadyMaterializedActorIds = patch.populations.flatMap(({ members }) => (
    members.filter(({ materialization }) => materialization === "materialized")
      .map(({ actor }) => actor.identity.stableId)
  ));
  patch = setCoreEcologyAggregatePatchMaterializedActors(patch, {
    atTick: patch.updatedAtTick,
    actorIds: [...new Set([...alreadyMaterializedActorIds, ...crowGroupActorIds])],
  });
  const sourceCrow = requiredCoreActor(patch, initialCrowMember.actor.identity.stableId);
  const sourceGull = requiredCoreActor(patch, initialGull.identity.stableId);
  const restPressuredCrow = replaceCoreWildlifeActorPhysiology(sourceCrow, {
    atTick: patch.updatedAtTick,
    needs: { hunger: 0, safety, rest: 900_000 },
    condition: { health: 1_000_000, exhaustion: 400_000, stress: 0 },
  });
  patch = replaceCoreEcologyAggregatePatchActor(patch, restPressuredCrow);
  const activityAuthority = projectCoreEcologyActivityAuthority({
    rootSeed: world.meta.rootSeed,
    root: requiredRegionalEcology(envelope).root,
    sourceKind: "legacy-cohort",
    patch,
    actorId: sourceCrow.identity.stableId,
  });
  if (activityAuthority === null) {
    throw new Error("Crow wake fixture lost its migrated perch authority");
  }
  const currentActivity = projectCoreEcologyActivity(patch, {
    actorId: sourceCrow.identity.stableId,
    atTick: patch.updatedAtTick,
  }, activityAuthority);
  const perch = currentActivity?.perch.anchor;
  if (perch === null || perch === undefined) {
    throw new Error(`Crow wake fixture lost its authenticated perch: ${stableStringify(
      currentActivity,
    )}`);
  }
  patch = replaceCoreEcologyAggregatePatchActor(
    patch,
    repositionCoreWildlifeActor(requiredCoreActor(
      patch,
      sourceCrow.identity.stableId,
    ), {
      atTick: patch.updatedAtTick,
      position: perch,
      heading: sourceCrow.address.heading,
    }),
  );
  patch = commitFixtureCrowRoutinePosture(
    patch,
    sourceCrow.identity.stableId,
    posture,
    activityAuthority,
  );
  const committedCrow = requiredCoreActor(patch, sourceCrow.identity.stableId);
  const restDestinationId = committedCrow.circadian?.restDestinationId;
  if (restDestinationId === undefined) {
    throw new Error("Crow wake fixture did not commit its rest destination");
  }
  const alarmGull = createFixtureCommittedAlarmActor(sourceGull, {
    atTick: patch.updatedAtTick,
    position: translateWorldPosition(
      committedCrow.address.position,
      WORLD_POSITION_UNITS_PER_TILE,
      0,
    ),
    heading: 500_000,
    threatId: "threat:fixture-crow-wake",
  });
  patch = replaceCoreEcologyAggregatePatchActor(patch, alarmGull);
  let displacedOrdinal = 0;
  for (const actor of coreActors(patch)) {
    if (
      actor.identity.stableId === committedCrow.identity.stableId
      || actor.identity.stableId === alarmGull.identity.stableId
    ) continue;
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
      atTick: patch.updatedAtTick,
      position: translateWorldPosition(
        committedCrow.address.position,
        (80 + displacedOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
        20 * WORLD_POSITION_UNITS_PER_TILE,
      ),
      heading: actor.address.heading,
    }));
    displacedOrdinal += 1;
  }
  patch = reconcileFixtureGroupAnchors(patch);
  patch = promoteFixtureActors(patch, [
    committedCrow.identity.stableId,
    alarmGull.identity.stableId,
  ]);
  const prepared = resealedCurrentEnvelopeWithCorePatch(envelope, patch, {
    world: serializeWorld(world),
  });
  await repository.save(recordWithEnvelope(record, prepared));

  const runtime = await createTideweftRuntime(repository);
  if (runtime.getUIView().saveWarning !== undefined) {
    throw new Error(`Crow wake fixture was rejected: ${stableStringify(
      runtime.getUIView().saveWarning,
    )}`);
  }
  await runtime.save();
  const adopted = requiredEnvelope(repository);
  const adoptedWorld = deserializeWorld(adopted.world);
  const adoptedTravel = restorePlayerRegionalTravel(
    adoptedWorld.meta.rootSeed,
    adopted.player,
    adopted.regionalTravel,
  );
  const adoptedPatch = requiredActiveLegacyCore(adopted);
  const beforeCrow = requiredCoreActor(adoptedPatch, committedCrow.identity.stableId);
  if (
    adoptedTravel === null
    || livingActorAddressInRegionalWindow(beforeCrow.address, adoptedTravel.window) === null
    || beforeCrow.circadian?.posture.state !== posture
    || beforeCrow.circadian.restDestinationId !== restDestinationId
  ) {
    runtime.destroy();
    throw new Error("Crow wake fixture lost its local committed routine posture");
  }
  return Object.freeze({
    runtime,
    repository,
    crowActorId: committedCrow.identity.stableId,
    restDestinationId,
    beforeTick: adoptedPatch.updatedAtTick,
    beforeCrow,
  });
}

function makeWorldTraceableAndClear(world: ReturnType<typeof deserializeWorld>): void {
  makeWorldDryAndClear(world);
  for (const tile of world.terrain.tiles) tile.moisture = 900_000;
}

async function createFoxEventBoundaryRuntime(
  options: Readonly<{
    lethalContact?: boolean;
    createRuntime?: typeof createTideweftRuntime;
    initialWestRebaseBoundary?: boolean;
  }> = {},
): Promise<Readonly<{
  runtime: TideweftRuntime;
  repository: MemoryRepository;
  foxActorId: string;
  rabbitActorId: string;
}>> {
  const createRuntime = options.createRuntime ?? createTideweftRuntime;
  const repository = new MemoryRepository();
  const initial = await createRuntime(repository);
  initial.dispatchUI({
    type: "new-world",
    seed: "marsh-edge-runtime-cue-1",
    posture: "gale",
    sessionShape: "wander",
  });
  await initial.save();
  const record = repository.snapshot();
  const envelope = requiredEnvelope(repository);
  const world = deserializeWorld(envelope.world);
  makeWorldDryAndClear(world);
  const player = structuredClone(envelope.player);
  if (options.initialWestRebaseBoundary) {
    player.x = REGIONAL_TRAVEL_SAFE_MIN_X * WORLD_POSITION_UNITS_PER_TILE + 1;
    player.previousX = player.x;
    player.velocityX = 0;
    player.velocityY = 0;
    const index = Math.floor(player.y / WORLD_POSITION_UNITS_PER_TILE)
      * REGIONAL_TRAVEL_COLUMNS + REGIONAL_TRAVEL_SAFE_MIN_X;
    player.currentTrace = [index];
    player.surveyTrace = [index];
  }
  const regional = restorePlayerRegionalTravel(world.meta.rootSeed, player, envelope.regionalTravel);
  if (regional === null) throw new Error("fox event-locus fixture lost its regional frame");
  const playerPosition = playerWorldPositionInRegionalWindow(regional.window, player);
  if (playerPosition === null) throw new Error("fox event-locus fixture lost its player");
  const playerGlobalX = playerPosition.region.x * WORLD_WIDTH
    + Math.floor(playerPosition.localX / WORLD_POSITION_UNITS_PER_TILE);
  const playerGlobalY = playerPosition.region.y * WORLD_HEIGHT
    + Math.floor(playerPosition.localY / WORLD_POSITION_UNITS_PER_TILE);
  const playerWindowX = playerGlobalX - regional.window.origin.x;
  const playerWindowY = playerGlobalY - regional.window.origin.y;
  const width = regional.window.terrain.width;
  const direction: -1 | 1 = playerWindowX + 13 < width ? 1 : -1;
  player.facingMilliRadians = direction > 0 ? 0 : Math.round(Math.PI * 1_000);
  const playerIndex = playerWindowY * width + playerWindowX;
  const foxOffset = options.initialWestRebaseBoundary ? 103 - playerWindowX : 9;
  const rabbitOffset = options.initialWestRebaseBoundary ? 107 - playerWindowX : 12;
  const foxPosition = worldPositionAtWindowTile(
    regional.window,
    playerIndex + direction * foxOffset,
  );
  const rabbitPosition = options.lethalContact
    ? translateWorldPosition(foxPosition, direction * 400, 0)
    : worldPositionAtWindowTile(
        regional.window,
        playerIndex + direction * rabbitOffset,
      );

  const sourcePatch = requiredCore(envelope);
  const sourceRabbit = sourcePatch.populations
    .find(({ species }) => species === "marsh-rabbit")?.members[0]?.actor;
  const sourceFox = sourcePatch.populations
    .find(({ species }) => species === "marsh-fox")?.members[0]?.actor;
  if (sourceRabbit === undefined || sourceFox === undefined) {
    throw new Error("fox event-locus fixture omitted its rabbit/fox web");
  }
  const adoptedEnvelope = resealedEnvelope(envelope, {
    coreEcology: serializeCoreEcologyAggregatePatch(promoteFixtureActors(sourcePatch, [
      sourceRabbit.identity.stableId,
      sourceFox.identity.stableId,
    ])),
  });
  let patch = requiredActiveLegacyCore(adoptedEnvelope);
  const rabbit = coreActors(patch).find(({ identity }) => (
    identity.stableId === sourceRabbit.identity.stableId
  ));
  const fox = coreActors(patch).find(({ identity }) => (
    identity.stableId === sourceFox.identity.stableId
  ));
  if (rabbit === undefined || fox === undefined) {
    throw new Error("v25 adoption lost the promoted rabbit/fox fixture actors");
  }
  const positionedRabbit = repositionCoreWildlifeActor(rabbit, {
    atTick: patch.updatedAtTick,
    position: rabbitPosition,
    heading: direction > 0 ? 500_000 : 0,
  });
  patch = replaceCoreEcologyAggregatePatchActor(
    patch,
    options.lethalContact
      ? replaceCoreWildlifeActorPhysiology(positionedRabbit, {
          atTick: patch.updatedAtTick,
          needs: positionedRabbit.needs,
          condition: { ...positionedRabbit.condition, health: 500_000 },
        })
      : positionedRabbit,
  );
  const positionedFox = replaceCoreWildlifeActorPhysiology(
    repositionCoreWildlifeActor(fox, {
      atTick: patch.updatedAtTick,
      position: foxPosition,
      heading: direction > 0 ? 0 : 500_000,
    }),
    {
      atTick: patch.updatedAtTick,
      needs: { ...fox.needs, hunger: 1_000_000 },
      condition: fox.condition,
    },
  );
  patch = replaceCoreEcologyAggregatePatchActor(patch, positionedFox);
  let displacedOrdinal = 0;
  for (const actor of coreActors(patch)) {
    if (
      actor.identity.stableId === rabbit.identity.stableId
      || actor.identity.stableId === fox.identity.stableId
    ) continue;
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
      atTick: patch.updatedAtTick,
      position: translateWorldPosition(
        playerPosition,
        -direction * ((options.initialWestRebaseBoundary ? 100 : 20) + displacedOrdinal) * WORLD_POSITION_UNITS_PER_TILE,
        (displacedOrdinal % 5 - 2) * WORLD_POSITION_UNITS_PER_TILE,
      ),
      heading: actor.address.heading,
    }));
    displacedOrdinal += 1;
  }
  patch = reconcileFixtureGroupAnchors(patch);
  const nextEnvelope = resealedEnvelope(adoptedEnvelope, {
    world: serializeWorld(world),
    player,
    coreEcology: serializeCoreEcologyAggregatePatch(patch),
  });
  await repository.save(recordWithEnvelope(record, nextEnvelope));
  initial.destroy();
  scheduledFrame = undefined;
  const runtime = await createRuntime(repository);
  expect(runtime.getUIView().saveWarning).toBeUndefined();
  await runtime.save();
  return Object.freeze({
    runtime,
    repository,
    foxActorId: fox.identity.stableId,
    rabbitActorId: rabbit.identity.stableId,
  });
}

/** Move the existing pending fox/prey boundary through a real westward frame change. */
async function rebaseRealPendingFoxWest(
  fixture: Awaited<ReturnType<typeof createFoxEventBoundaryRuntime>>,
  projectionModule: typeof import("./regionalEcologyStateV6"),
  projectionSpy: MockInstance<typeof projectRegionalEcologyStateV6ActiveState>,
) {
  const { runtime, repository, foxActorId, rabbitActorId } = fixture;
  await runtime.save();
  const pending = requiredEnvelope(repository);
  const world = deserializeWorld(pending.world);
  const travel = restorePlayerRegionalTravel(world.meta.rootSeed, pending.player, pending.regionalTravel);
  if (travel === null) throw new Error("Pending fox fixture lost its exact starting frame");
  const sources = (projection: RegionalEcologyStateV6ActiveProjection) => [
    ...projection.base.base.base.base.base.residents,
    ...projection.base.base.base.base.alpineResidents,
    ...projection.base.base.base.polarShoreResidents,
    ...projection.base.base.coldShoreResidents,
    ...projection.base.polarConsumerResidents,
    ...projection.breadthResidents,
  ];
  const before = projectionModule.projectRegionalEcologyStateV6ActiveState(requiredRegionalEcologyV6(pending), {
    origin: travel.window.origin, terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
  });
  if (before === null) throw new Error("Pending fox fixture lost its actual starting projection");
  const owners = sources(before).filter(({ patch }) => patch.populations.some(({ members }) => (
    members.some(({ actor }) => actor.identity.stableId === foxActorId)
  )));
  expect(owners).toHaveLength(1);
  const owner = owners[0]!;
  const beforeSource = owner.patch.populations.flatMap(({ members }) => members)
    .filter(({ actor }) => actor.identity.stableId === foxActorId);
  const beforePrey = owner.patch.populations.flatMap(({ members }) => members)
    .filter(({ actor }) => actor.identity.stableId === rabbitActorId);
  expect(beforeSource).toHaveLength(1);
  expect(beforeSource[0]?.materialization).toBe("materialized");
  expect(beforePrey).toHaveLength(1);
  expect(beforePrey[0]?.materialization).toBe("materialized");
  const originBefore = travel.window.origin;
  const expectedOriginAfter = { x: originBefore.x - REGIONAL_TRAVEL_SHIFT_TILES, y: originBefore.y };
  const planned = projectionModule.projectRegionalEcologyStateV6ActiveState(requiredRegionalEcologyV6(pending), {
    origin: expectedOriginAfter, terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
  });
  if (planned === null) throw new Error("Pending fox fixture could not preflight its actual west frame");
  expect(sources(planned).flatMap(({ patch }) => patch.populations.flatMap(({ members }) => members))
    .some(({ actor, materialization }) => (
      (actor.identity.stableId === foxActorId || actor.identity.stableId === rabbitActorId)
      && materialization === "coarse"
    ))).toBe(true);
  expect(Math.floor(pending.player.x / WORLD_POSITION_UNITS_PER_TILE)).toBe(REGIONAL_TRAVEL_SAFE_MIN_X);
  projectionSpy.mockClear();
  runtime.dispatchRenderer({ type: "movement", vector: { x: -1, y: 0 } });
  let movementSteps = 0;
  while (movementSteps < 9 && runtime.getRenderView().terrain.worldTileOrigin?.x === originBefore.x) {
    advancePlayerSteps(runtime, 1);
    movementSteps += 1;
  }
  runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
  expect(runtime.getRenderView().terrain.worldTileOrigin).toEqual(expectedOriginAfter);
  expect(movementSteps).toBeGreaterThan(0);
  expect(movementSteps).toBeLessThan(10);
  expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
  const after = projectionSpy.mock.calls.flatMap(([, window], index) => {
    const result = projectionSpy.mock.results[index];
    return window.origin.x === expectedOriginAfter.x && window.origin.y === expectedOriginAfter.y
      && result?.type === "return" && result.value !== null ? [result.value] : [];
  }).at(-1);
  if (after === undefined) throw new Error("Actual movement never projected the rebased fox ecology");
  expect(after.atTick).toBe(world.meta.completedTick);
  const afterOwner = sources(after).find(({ sourceKey }) => sourceKey === owner.sourceKey);
  const afterMembers = afterOwner?.patch.populations.flatMap(({ members }) => members) ?? [];
  const unavailable = afterOwner === undefined || afterMembers.some(({ actor, materialization }) => (
    (actor.identity.stableId === foxActorId || actor.identity.stableId === rabbitActorId)
    && materialization === "coarse"
  ));
  expect(unavailable).toBe(true);
  await runtime.save();
  const rebased = requiredEnvelope(repository);
  expect(deserializeWorld(rebased.world).meta.completedTick).toBe(world.meta.completedTick);
  expect(rebased.perceptionCarry.playerStepsSinceWorldTick).toBe(movementSteps);
  return { pending, rebased, record: repository.snapshot(), movementSteps, sourceOwnerKey: owner.sourceKey };
}

function makeWorldShallowAndClear(world: ReturnType<typeof deserializeWorld>): void {
  for (const tile of world.terrain.tiles) {
    tile.elevation = world.tide.level - 20_000;
    tile.moisture = 900_000;
    tile.roughness = 0;
    tile.terrain = "tidal-flat";
    tile.baseTravelCost = 110;
  }
  world.weather.kind = "clear";
  world.weather.intensity = 0;
  world.weather.windX = 0;
  world.weather.windY = 0;
  world.weather.nextChangeTick = world.meta.completedTick + 100_000;
}

function compatibilityTileAtPosition(
  world: ReturnType<typeof deserializeWorld>,
  position: CoreWildlifeActorState["address"]["position"],
) {
  if (position.region.x !== 0 || position.region.y !== 0) {
    throw new Error("fixture position left the compatibility region");
  }
  const tileX = Math.trunc(position.localX / WORLD_POSITION_UNITS_PER_TILE);
  const tileY = Math.trunc(position.localY / WORLD_POSITION_UNITS_PER_TILE);
  const tile = createWorldView(world).terrain.tiles[tileY * WORLD_WIDTH + tileX];
  if (tile === undefined) throw new Error("fixture position has no compatibility tile");
  return tile;
}

function findDeepWaterRoutePosition(
  world: ReturnType<typeof deserializeWorld>,
): CoreWildlifeActorState["address"]["position"] {
  const view = createWorldView(world);
  for (let y = 1; y < WORLD_HEIGHT - 1; y += 1) {
    for (let x = 1; x < WORLD_WIDTH - 1; x += 1) {
      const neighborhood = [
        (y - 1) * WORLD_WIDTH + x - 1,
        (y - 1) * WORLD_WIDTH + x,
        (y - 1) * WORLD_WIDTH + x + 1,
        y * WORLD_WIDTH + x - 1,
        y * WORLD_WIDTH + x,
        y * WORLD_WIDTH + x + 1,
        (y + 1) * WORLD_WIDTH + x - 1,
        (y + 1) * WORLD_WIDTH + x,
        (y + 1) * WORLD_WIDTH + x + 1,
      ];
      if (neighborhood.every((index) => (
        (view.terrain.tiles[index]?.waterDepth ?? 0) > ADRIFT_STAND_DEPTH
      ))) {
        return createWorldPosition(
          { x: 0, y: 0 },
          x * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
          y * WORLD_POSITION_UNITS_PER_TILE + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
        );
      }
    }
  }
  throw new Error("shore-water fixture found no connected deep-water route");
}

function findNearestBlockedEscapeTile(
  world: ReturnType<typeof createRegionalWorldView>,
): { readonly index: number; readonly alarmDirection: -1 | 1 } {
  const width = world.terrain.width;
  const height = world.terrain.height;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const candidates: Array<{
    readonly index: number;
    readonly alarmDirection: -1 | 1;
    readonly distanceSquared: number;
  }> = [];
  const standable = (index: number): boolean => {
    const tile = world.terrain.tiles[index];
    return tile !== undefined
      && tile.terrain !== "deep-water"
      && tile.waterDepth <= ADRIFT_STAND_DEPTH;
  };
  const blocked = (index: number): boolean => {
    const tile = world.terrain.tiles[index];
    return tile !== undefined
      && (tile.terrain === "deep-water" || tile.waterDepth > ADRIFT_STAND_DEPTH);
  };
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const index = y * width + x;
      if (!standable(index) || !standable(index - width) || !standable(index + width)) continue;
      for (const alarmDirection of [-1, 1] as const) {
        if (!standable(index + alarmDirection)) continue;
        if (!blocked(index - alarmDirection)) continue;
        candidates.push({
          index,
          alarmDirection,
          distanceSquared: (x - centerX) ** 2 + (y - centerY) ** 2,
        });
      }
    }
  }
  candidates.sort((left, right) => left.distanceSquared - right.distanceSquared
    || left.index - right.index
    || left.alarmDirection - right.alarmDirection);
  const selected = candidates[0];
  if (selected === undefined) {
    throw new Error("escape fixture could not find a nearby blocked shoreline edge");
  }
  return Object.freeze({
    index: selected.index,
    alarmDirection: selected.alarmDirection,
  });
}

function worldPositionAtWindowTile(
  window: RegionalTerrainWindow,
  index: number,
): CoreWildlifeActorState["address"]["position"] {
  const address = window.addresses[index];
  if (address === undefined) throw new Error("fixture window address is absent");
  return createWorldPosition(
    address.region,
    address.localX * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    address.localY * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
  );
}

function findOpenHorizontalRegionSeam(
  world: ReturnType<typeof createRegionalWorldView>,
  window: RegionalTerrainWindow,
): Readonly<{
  left: RegionalTerrainWindow["addresses"][number];
  right: RegionalTerrainWindow["addresses"][number];
}> {
  const width = world.terrain.width;
  for (let y = 1; y < world.terrain.height - 1; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const leftIndex = y * width + x - 1;
      const rightIndex = leftIndex + 1;
      const left = window.addresses[leftIndex];
      const right = window.addresses[rightIndex];
      const leftTile = world.terrain.tiles[leftIndex];
      const rightTile = world.terrain.tiles[rightIndex];
      if (
        left === undefined
        || right === undefined
        || leftTile === undefined
        || rightTile === undefined
        || left.region.x + 1 !== right.region.x
        || left.region.y !== right.region.y
        || left.localX !== WORLD_WIDTH - 1
        || right.localX !== 0
        || leftTile.terrain === "deep-water"
        || rightTile.terrain === "deep-water"
        || leftTile.waterDepth > ADRIFT_STAND_DEPTH
        || rightTile.waterDepth > ADRIFT_STAND_DEPTH
      ) continue;
      return Object.freeze({ left, right });
    }
  }
  throw new Error("seam fixture could not find an open horizontal region boundary");
}

function requiredCore(envelope: CurrentEnvelope): CoreEcologyAggregatePatchState {
  const regional = requiredRegionalEcology(envelope);
  const legacy = regional.activeResidents.find(({ kind }) => kind === "legacy-cohort");
  if (regional.root.legacyCohort !== null) {
    if (legacy === undefined) throw new Error("v25 adoption lost its active legacy cohort");
    return legacy.patch.updatedAtTick > regional.root.legacyCohort.sourcePatch.updatedAtTick
      ? legacy.patch
      : regional.root.legacyCohort.sourcePatch;
  }
  return createExactV24CoreFromFreshV25(envelope, regional);
}

function requiredActiveLegacyCore(envelope: CurrentEnvelope): CoreEcologyAggregatePatchState {
  const legacy = requiredRegionalEcology(envelope).activeResidents.find(
    ({ kind }) => kind === "legacy-cohort",
  );
  if (legacy === undefined) throw new Error("v25 fixture omitted its active legacy cohort");
  return legacy.patch;
}

function requiredRegionalEcology(envelope: CurrentEnvelope): RegionalEcologyStateV1 {
  const version = (envelope as unknown as Readonly<{ version: number }>).version;
  if (
    version === 50
    || version === 48
    || version === 47
    || version === 45
    || version === 40
    || version === 39
    || version === 38
    || version === 37
    || version === 33
    || version === 32
    || version === 31
    || version === 30
  ) {
    return requiredRegionalEcologyV6(envelope).base.base.base.base.base;
  }
  if (version === 29) return requiredRegionalEcologyV5(envelope).base.base.base.base;
  if (version === 28) return requiredRegionalEcologyV4(envelope).base.base.base;
  if (version === 27) return requiredRegionalEcologyV3(envelope).base.base;
  if (version === 26) return requiredRegionalEcologyV2(envelope).base;
  if (version !== 25) throw new Error("fixture envelope has no regional ecology generation");
  const state = deserializeRegionalEcologyState(envelope.regionalEcology);
  if (
    state === null
    || serializeRegionalEcologyState(state) !== envelope.regionalEcology
  ) throw new Error("v25 save omitted canonical regional ecology");
  return state;
}

function requiredRegionalEcologyV6(envelope: CurrentEnvelope): RegionalEcologyStateV6 {
  const state = deserializeRegionalEcologyStateV6(envelope.regionalEcology);
  if (
    state === null
    || serializeRegionalEcologyStateV6(state) !== envelope.regionalEcology
  ) throw new Error("v30 save omitted canonical regional ecology");
  return state;
}

function requiredRegionalEcologyV5(envelope: CurrentEnvelope): RegionalEcologyStateV5 {
  const state = deserializeRegionalEcologyStateV5(envelope.regionalEcology);
  if (
    state === null
    || serializeRegionalEcologyStateV5(state) !== envelope.regionalEcology
  ) throw new Error("v29 save omitted canonical regional ecology");
  return state;
}

function requiredRegionalEcologyV4(envelope: CurrentEnvelope): RegionalEcologyStateV4 {
  const state = deserializeRegionalEcologyStateV4(envelope.regionalEcology);
  if (
    state === null
    || serializeRegionalEcologyStateV4(state) !== envelope.regionalEcology
  ) throw new Error("v28 save omitted canonical regional ecology");
  return state;
}

function requiredRegionalEcologyV3(envelope: CurrentEnvelope): RegionalEcologyStateV3 {
  const state = deserializeRegionalEcologyStateV3(envelope.regionalEcology);
  if (
    state === null
    || serializeRegionalEcologyStateV3(state) !== envelope.regionalEcology
  ) throw new Error("v27 save omitted canonical regional ecology");
  return state;
}

function requiredRegionalEcologyV2(envelope: CurrentEnvelope): RegionalEcologyStateV2 {
  const state = deserializeRegionalEcologyStateV2(envelope.regionalEcology);
  if (
    state === null
    || serializeRegionalEcologyStateV2(state) !== envelope.regionalEcology
  ) throw new Error("v26 save omitted canonical regional ecology");
  return state;
}

function expectHistoricalBodyAdoption(
  envelope: CurrentEnvelope,
  historical: CoreEcologyAggregatePatchState,
  foxActorId: string,
  rabbitActorId: string,
): void {
  const regional = requiredRegionalEcology(envelope);
  const legacy = regional.activeResidents.find(({ kind }) => kind === "legacy-cohort");
  const bodyId = historical.carcasses[0]?.carcassId;
  if (legacy === undefined || bodyId === undefined) {
    throw new Error("historical body adoption omitted its active legacy owner");
  }
  expect(stableStringify(legacy.patch.mortalityTransactions))
    .toBe(stableStringify(historical.mortalityTransactions));
  expect(stableStringify(legacy.patch.carcasses)).toBe(stableStringify(historical.carcasses));
  expect([regional.settlementHome, ...regional.activeResidents].filter(({ patch }) => (
    patch.carcasses.some(({ carcassId }) => carcassId === bodyId)
  )).map(({ kind }) => kind)).toEqual(["legacy-cohort"]);
  expect(regionalCoreActors(regional).filter(({ identity }) => (
    identity.stableId === foxActorId
  ))).toHaveLength(1);
  expect(regionalCoreActors(regional).some(({ identity }) => (
    identity.stableId === rabbitActorId
  ))).toBe(false);
  expect(regional.root.legacyCohort?.retirements.some(({ actorId }) => (
    actorId === foxActorId || actorId === rabbitActorId
  ))).toBe(false);
}

/** Builds historical body state before v25 adoption, so no retired v25 actor is resurrected. */
function historicalBodyBearingV24Fixture(
  envelope: CurrentEnvelope,
): Readonly<{
  patch: CoreEcologyAggregatePatchState;
  beforeRabbitPopulation: CoreEcologyAggregatePatchState["populations"][number];
  foxActorId: string;
  rabbitActorId: string;
}> {
  const world = deserializeWorld(envelope.world);
  if (world.meta.completedTick < 2) {
    throw new Error("historical body fixture requires two elapsed world ticks");
  }
  let patch = createExactV24CoreFromFreshV25(
    envelope,
    requiredRegionalEcology(envelope),
    world.meta.completedTick - 2,
  );
  const initialRabbit = patch.populations.find(({ species }) => species === "marsh-rabbit")
    ?.members[0]?.actor;
  const initialFox = patch.populations.find(({ species }) => species === "marsh-fox")
    ?.members[0]?.actor;
  if (initialRabbit === undefined || initialFox === undefined) {
    throw new Error("historical body fixture omitted its rabbit or fox");
  }
  patch = setCoreEcologyAggregatePatchMaterializedActors(patch, {
    atTick: patch.updatedAtTick,
    actorIds: [initialRabbit.identity.stableId, initialFox.identity.stableId],
  });
  const rabbit = coreActors(patch).find(({ identity }) => (
    identity.stableId === initialRabbit.identity.stableId
  ));
  const fox = coreActors(patch).find(({ identity }) => (
    identity.stableId === initialFox.identity.stableId
  ));
  const regional = restorePlayerRegionalTravel(
    deserializeWorld(envelope.world).meta.rootSeed,
    envelope.player,
    envelope.regionalTravel,
  );
  const contactOrigin = regional === null
    ? null
    : playerWorldPositionInRegionalWindow(regional.window, envelope.player);
  if (rabbit === undefined || fox === undefined || contactOrigin === null) {
    throw new Error("historical body fixture could not stage exact contact");
  }
  const atTick = patch.updatedAtTick + 1;
  const foxPosition = translateWorldPosition(
    contactOrigin,
    8 * WORLD_POSITION_UNITS_PER_TILE,
    0,
  );
  const rabbitPosition = translateWorldPosition(foxPosition, 200, 0);
  const positionedRabbit = replaceCoreWildlifeActorPhysiology(
    repositionCoreWildlifeActor(rabbit, {
      atTick,
      position: rabbitPosition,
      heading: 500_000,
    }),
    {
      atTick,
      needs: rabbit.needs,
      condition: { ...rabbit.condition, health: 500_000 },
    },
  );
  const positionedFox = replaceCoreWildlifeActorPhysiology(
    repositionCoreWildlifeActor(fox, {
      atTick: fox.updatedAtTick,
      position: foxPosition,
      heading: 0,
    }),
    {
      atTick: fox.updatedAtTick,
      needs: { ...fox.needs, hunger: ACTOR_PERCEPTION_SCALE },
      condition: fox.condition,
    },
  );
  const observation = createActorObservation({
    id: `obs:historical-body:${atTick}`,
    observerId: positionedFox.identity.stableId,
    observedAtTick: atTick,
    channel: "vision",
    perceivedClass: "live-prey",
    subjectId: positionedRabbit.identity.stableId,
    area: { center: rabbitPosition, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 900_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("historical body observation was rejected");
  const pursuit = stepCoreWildlifeActor(positionedFox, {
    tick: atTick,
    observations: [observation],
    foodOpportunities: [{
      resourceId: positionedRabbit.identity.stableId,
      observationId: observation.id,
      foodClass: "live-prey",
      sourceKind: "living-actor",
      availableUnits: 1,
      nutrition: 900_000,
      effort: 10_000,
      risk: 0,
      competition: 0,
      directlyConfirmed: true,
      accessible: true,
    }],
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (pursuit === null || pursuit.decision.intent !== "pursue") {
    throw new Error(`historical body fox chose ${pursuit?.decision.intent ?? "no action"}`);
  }
  patch = replaceCoreEcologyAggregatePatchActor(patch, positionedRabbit);
  patch = replaceCoreEcologyAggregatePatchActor(patch, pursuit.actor);
  const beforeRabbitPopulation = patch.populations.find(
    ({ species }) => species === "marsh-rabbit",
  );
  const contact = coreEcologySpeciesPredatorContact("marsh-fox");
  if (beforeRabbitPopulation === undefined || contact === null) {
    throw new Error("historical body fixture lost its mortality policy");
  }
  const result = resolveCoreWildlifePredatorContact({
    attacker: pursuit.actor,
    target: positionedRabbit,
    atTick,
    contactRadiusUnits: contact.reachUnits,
    damageUnits: contact.damageUnits,
    cause: contact.cause,
  });
  const death = result === null ? null : applyCoreEcologyWildlifeMortality(patch, {
    result,
    temperature: 500_000,
  });
  if (death === null || death.transaction === null || death.carcass === null) {
    throw new Error("historical body mortality transaction was rejected");
  }
  const bodyTick = atTick + 1;
  const bodyObservation = createActorObservation({
    id: `obs:historical-body-carrion:${bodyTick}`,
    observerId: pursuit.actor.identity.stableId,
    observedAtTick: bodyTick,
    channel: "vision",
    perceivedClass: "carrion",
    subjectId: death.carcass.carcassId,
    area: { center: death.carcass.deathPosition, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: 900_000,
    identification: "identified",
  });
  if (bodyObservation === null) throw new Error("historical body sight was rejected");
  const scavenging = stepCoreWildlifeActor(pursuit.actor, {
    tick: bodyTick,
    observations: [bodyObservation],
    foodOpportunities: [{
      resourceId: death.carcass.carcassId,
      observationId: bodyObservation.id,
      foodClass: "carrion",
      sourceKind: "physical-carcass",
      availableUnits: death.carcass.remainingResourceUnits,
      nutrition: 900_000,
      effort: 100_000,
      risk: 120_000,
      competition: 0,
      directlyConfirmed: true,
      accessible: true,
    }],
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  });
  if (
    scavenging === null
    || scavenging.decision.intent !== "scavenge"
    || scavenging.resourceClaims[0] === undefined
  ) throw new Error("historical body fox did not claim its observed carcass");
  const claim = scavenging.resourceClaims[0];
  const claimed = claimCoreWildlifeCarcass(death.carcass, {
    actorId: scavenging.actor.identity.stableId,
    provenanceId: claim.eventId,
    atTick: bodyTick,
  });
  const consumed = claimed === null ? null : consumeCoreWildlifeCarcass(claimed, {
    actorId: scavenging.actor.identity.stableId,
    units: claim.requestedUnits,
    atTick: bodyTick,
  });
  const bodyPatch = consumed === null
    ? null
    : replaceCoreEcologyAggregatePatchCarcass(
        replaceCoreEcologyAggregatePatchActor(death.patch, scavenging.actor),
        consumed,
      );
  if (bodyPatch === null) throw new Error("historical body consumption was rejected");
  const fedFox = replaceCoreWildlifeActorPhysiology(scavenging.actor, {
    atTick: bodyTick,
    condition: scavenging.actor.condition,
    needs: {
      ...scavenging.actor.needs,
      hunger: Math.max(0, scavenging.actor.needs.hunger - 360_000),
    },
  });
  return Object.freeze({
    patch: replaceCoreEcologyAggregatePatchActor(bodyPatch, fedFox),
    beforeRabbitPopulation,
    foxActorId: scavenging.actor.identity.stableId,
    rabbitActorId: positionedRabbit.identity.stableId,
  });
}

/**
 * Frozen tests still need an exact historical v24 owner to exercise the
 * published v8-v24 adapters. Fresh v25 worlds no longer serialize that owner,
 * so the fixture reconstructs it from the settlement home's authenticated
 * frozen v11 habitat using the same public kernels and initialization policy.
 */
function createExactV24CoreFromFreshV25(
  envelope: CurrentEnvelope,
  regional: RegionalEcologyStateV1,
  fixtureTick?: number,
): CoreEcologyAggregatePatchState {
  const home = regional.settlementHome.patch;
  if (home.derivation.kind !== "settlement-home-v1") {
    throw new Error("fresh v25 state omitted its frozen settlement-home habitat");
  }
  const habitat = home.derivation.habitat;
  const world = deserializeWorld(envelope.world);
  const completedTick = fixtureTick ?? world.meta.completedTick;
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
  patch = initializeExactV24Egret(
    tidal.patch,
    tidal.projection,
    completedTick,
  );
  patch = initializeExactV24ActivityActor(
    patch,
    "american-black-duck",
    completedTick,
  );
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

type PublishedV8FixtureVariant = "exact" | "invented-gull-key" | "missing-gull";

interface PublishedV8PopulationDefinition {
  readonly species: CoreWildlifeSpecies;
  readonly populationKey: string;
  readonly members: readonly Readonly<{
    ordinal: number;
    tileOffsetX: number;
    tileOffsetY: number;
    heading: number;
  }>[];
}

function publishedV8CoreEcologyFixture(
  envelope: CurrentEnvelope,
  variant: PublishedV8FixtureVariant = "exact",
): Readonly<{ text: string; actors: readonly CoreWildlifeActorState[] }> {
  const world = deserializeWorld(envelope.world);
  const current = domesticPenCoreEcologyFromCurrent(requiredCore(envelope));
  if (current.derivation.kind !== "habitat-v9") {
    throw new Error("fresh domestic-pen fixture has no v9 habitat derivation");
  }
  const bio0 = deserializeBio0Ecology(envelope.bio0Ecology);
  if (bio0 === null) throw new Error("fresh fixture has no canonical Alpha-13 BIO0 state");
  const origin = bio0.porterAddress.position;
  const gullKey = variant === "invented-gull-key"
    ? "wave-a/invented-gull"
    : "wave-a/gull-flock";
  const definitions: readonly PublishedV8PopulationDefinition[] = [
    {
      species: "black-bear",
      populationKey: "wave-a/black-bear",
      members: [{ ordinal: 0, tileOffsetX: 9, tileOffsetY: 2, heading: 500_000 }],
    },
    {
      species: "deer",
      populationKey: "wave-a/deer-herd",
      members: [
        { ordinal: 0, tileOffsetX: 5, tileOffsetY: 2, heading: 625_000 },
        { ordinal: 1, tileOffsetX: 6, tileOffsetY: 3, heading: 590_000 },
      ],
    },
    {
      species: "gull",
      populationKey: gullKey,
      members: [
        { ordinal: 0, tileOffsetX: 2, tileOffsetY: -2, heading: 110_000 },
        { ordinal: 1, tileOffsetX: 3, tileOffsetY: -1, heading: 180_000 },
        { ordinal: 2, tileOffsetX: 4, tileOffsetY: -2, heading: 250_000 },
      ],
    },
  ];
  const included = definitions.filter(({ species }) => (
    variant !== "missing-gull" || species !== "gull"
  ));
  const populations = included.map((definition) => {
    const members = definition.members.map((entry) => {
      const baseline = createCoreWildlifeActorState({
        seed: world.meta.rootSeed,
        species: definition.species,
        originRegion: origin.region,
        populationKey: definition.populationKey,
        populationOrdinal: entry.ordinal,
        position: translateWorldPosition(
          origin,
          entry.tileOffsetX * WORLD_POSITION_UNITS_PER_TILE,
          entry.tileOffsetY * WORLD_POSITION_UNITS_PER_TILE,
        ),
        heading: entry.heading,
        tick: world.meta.completedTick,
      });
      const actor = definition.species === "black-bear"
        ? replaceCoreWildlifeActorPhysiology(baseline, {
            atTick: world.meta.completedTick,
            needs: { ...baseline.needs, hunger: Math.max(680_000, baseline.needs.hunger) },
            condition: baseline.condition,
          })
        : baseline;
      return {
        populationOrdinal: entry.ordinal,
        materialization: "materialized" as const,
        actor,
      };
    });
    return {
      species: definition.species,
      populationKey: definition.populationKey,
      populationSize: members.length,
      members,
    };
  });
  const actors = populations.flatMap(({ members }) => members.map(({ actor }) => actor));
  const text = stableStringify({
    version: 1,
    patchKey: "wave-a/alarm-crossing",
    originRegion: origin.region,
    updatedAtTick: world.meta.completedTick,
    populations,
  });
  return Object.freeze({ text, actors: Object.freeze(actors) });
}

function requiredCargo(envelope: CurrentEnvelope): PhysicalCargoState {
  const validation = validatePhysicalCargoState(
    envelope.physicalCargo,
    envelope.player,
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
  if (!validation.valid || validation.state === null) {
    throw new Error(`v8 save omitted canonical physical cargo: ${validation.reason}`);
  }
  return validation.state;
}

function addFixtureForageProvision(
  state: PhysicalCargoState,
  position: CoreWildlifeActorState["address"]["position"],
  sourceEventId: string,
) {
  const source = quotePhysicalCargoSource(state, "wildlife-fixture", sourceEventId);
  const carrier = createLooseCargoCarrier(
    { kind: "unclaimed" },
    createCraftingInventory(PROVISION_DEFINITIONS["dried-fish"].loadMilli),
  );
  const provision = addLooseCargoProvision(carrier, {
    sourceLotId: source.lotId,
    provision: "dried-fish",
    quantity: 1,
    materialState: { condition: 1_000_000, contamination: 0, decay: 0 },
  });
  if (!provision.ok) throw new Error(`fixture provision failed: ${provision.reason}`);
  const owner = transitionPhysicalCargoRegion(
    state,
    position.region,
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
  const looseUnitsPerWorldUnit = LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE;
  const dropped = dropLooseCargo(owner.looseWorld, provision.carrier, {
    lotId: source.lotId,
    quantity: 1,
    x: position.localX * looseUnitsPerWorldUnit,
    y: position.localY * looseUnitsPerWorldUnit,
  });
  if (!dropped.ok || dropped.entity === null) {
    throw new Error(`fixture provision drop failed: ${dropped.reason}`);
  }
  return Object.freeze({
    state: commitPhysicalCargoRegionalMutation(state, {
      looseWorld: dropped.world,
      carrier: state.carrier,
      committedSourceOrdinal: source.ordinal,
    }, {
      kind: "delta",
      removed: [],
      added: [dropped.entity.payload],
    }),
    entity: dropped.entity,
  });
}

function coreActors(state: CoreEcologyAggregatePatchState): readonly CoreWildlifeActorState[] {
  return state.populations.flatMap(({ members }) => members.map(({ actor }) => actor));
}

function requiredRegionalCoreOwner(
  envelope: CurrentEnvelope,
  actorId: string,
): CoreEcologyAggregatePatchState {
  const regional = requiredRegionalEcology(envelope);
  const owners = [regional.settlementHome, ...regional.activeResidents].filter(({ patch }) => (
    coreActors(patch).some(({ identity }) => identity.stableId === actorId)
  ));
  if (owners.length !== 1 || owners[0] === undefined) {
    throw new Error(`Fixture expected one active regional owner for ${actorId}`);
  }
  return owners[0].patch;
}

function regionalCoreActors(state: RegionalEcologyStateV1): readonly CoreWildlifeActorState[] {
  const byId = new Map<string, CoreWildlifeActorState>();
  for (const source of [state.settlementHome, ...state.activeResidents]) {
    for (const actor of coreActors(source.patch)) {
      if (byId.has(actor.identity.stableId)) {
        throw new Error(`regional fixture duplicated actor ${actor.identity.stableId}`);
      }
      byId.set(actor.identity.stableId, actor);
    }
  }
  return Object.freeze([...byId.values()].sort((left, right) => (
    left.identity.stableId < right.identity.stableId
      ? -1
      : left.identity.stableId > right.identity.stableId
        ? 1
        : 0
  )));
}

function requiredCrossSpeciesReaction(state: CoreEcologyAggregatePatchState) {
  const actors = coreActors(state);
  const byId = new Map(actors.map((actor) => [actor.identity.stableId, actor] as const));
  for (const actor of actors) {
    for (const memory of [...actor.memories].reverse()) {
      if (!["alarm", "threat", "pursuit"].includes(memory.kind)) continue;
      const belief = actor.perception.beliefs.find(({ sourceObservationId }) => (
        sourceObservationId === memory.observationId
      ));
      const salient = actor.perception.salientMemory.find(({ observationId }) => (
        observationId === memory.observationId
      ));
      const subjectId = byId.has(memory.referenceId)
        ? memory.referenceId
        : belief?.subjectId ?? salient?.subjectId ?? null;
      const subject = subjectId === null ? undefined : byId.get(subjectId);
      if (subject && subject.identity.species !== actor.identity.species) {
        return {
          actor,
          subject,
          memory,
          evidenceObservationId: belief?.sourceObservationId ?? salient?.observationId ?? null,
        };
      }
    }
  }
  throw new Error(`saved core ecology omitted a lawful cross-species reaction: ${JSON.stringify(
    actors.map((actor) => ({
      species: actor.identity.species,
      intent: actor.intent.kind,
      memories: actor.memories.map(({ kind }) => kind),
    })),
  )}`);
}

function forageProvisions(state: PhysicalCargoState) {
  return physicalCargoWorlds(state).flatMap(({ entities }) => entities.filter(({ payload }) => (
    payload.kind === "provision" && payload.provision === "dried-fish"
  )));
}

function consumptionHistory(state: PhysicalCargoState) {
  return physicalCargoWorlds(state).flatMap(({ history }) => history.filter(({ kind }) => (
    kind === "consume"
  )));
}

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

/** WAIT advances on its first presentation frame and accepts one fixed step per frame. */
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
