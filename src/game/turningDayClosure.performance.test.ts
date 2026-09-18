import { cpuUsage } from "node:process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAVE_WORLD_JSON_MAX_CHARACTERS,
  type SaveRecord,
  type SaveRepository,
} from "../platform/persistence";
import {
  LIVING_CIRCADIAN_OWNER_ID,
  LIVING_CIRCADIAN_VERSION,
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  WORLD_NEW_GAME_START_TICK,
  WORLD_TICKS_PER_DAY,
  assertWorldInvariants,
  createWorld,
  createWorldView,
  deserializeWorld,
  replaceResidentCircadian,
  residentAtSettlementRestDestination,
  residentSettlementRestNetworkId,
  runTicks,
  serializeWorld,
  stepWorld,
  type WorldState,
} from "../sim/public";
import {
  CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES,
  advanceCoreEcologyDormantAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
  setCoreEcologyAggregatePatchMaterializedActors,
  stepCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  coreEcologyActivityTravelMedium,
  projectCoreEcologyActivity,
  stepCoreEcologyActivityMotion,
  type CoreEcologyActivityAuthorityReceipt,
  type CoreEcologyActivityProjection,
} from "./coreEcologyActivity";
import {
  projectCoreEcologyActivityAuthority,
  projectCoreEcologyBreadthActivityAuthority,
} from "./coreEcologyActivityAuthority";
import { projectCoreEcologyAlpineRidgeActivityAuthority } from "./coreEcologyAlpineRidgeActivity";
import { CORE_ECOLOGY_CIRCADIAN_BINDINGS } from "./coreEcologyCircadianPolicy";
import { projectCoreEcologyPolarConsumerActivityAuthority } from "./coreEcologyPolarConsumerActivity";
import { CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE } from "./coreWildlifeActor";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createPlayer } from "./player";
import { advanceRegionalEcologyRoot } from "./regionalEcology";
import {
  REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES,
  bindRegionalEcologyStateV6ActiveProjection,
  commitRegionalEcologyStateV6ActiveProjection,
  deserializeRegionalEcologyStateV6,
  regionalEcologyStateV6ActiveSourcePatches,
  regionalEcologyStateV6SourceOwnership,
  serializeRegionalEcologyStateV6,
  type CommitRegionalEcologyStateV6ActiveProjectionInput,
  type RegionalEcologyStateV6,
  type RegionalEcologyStateV6ActiveProjection,
  type RegionalEcologyStateV6SourceOwnership,
} from "./regionalEcologyStateV6";
import { planResidentCircadian } from "./residentCircadian";
import { createTideweftRuntime } from "./runtime";
import { createSessionState } from "./sessionTypes";

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

beforeEach(() => {
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

export const TURNING_DAY_MULTI_DAY_BUDGET_OWNER_INTENT =
  "test:turning-day-multi-day-budget:v2" as const;

const SOAK_DAYS = 3;
const SOAK_TICKS = SOAK_DAYS * WORLD_TICKS_PER_DAY;
const PRODUCTION_FIXTURE_TICK = WORLD_NEW_GAME_START_TICK;
const ROUTINE_ACTOR_STEP_UNITS = 1_000;
// Deliberately generous machine-class ceilings catch unbounded work and save
// histories; packaged desktop/mobile smoke remains the frame-rate authority.
// Measure consumed process CPU rather than wall time, and retain the stricter
// local ceiling while allowing the empirically slower shared CI runner its own
// bounded ceiling. Both execute the identical fixed 4,320-tick workload.
const SOAK_CPU_BUDGET_MS = process.env.CI === "true" ? 45_000 : 30_000;
const WORLD_SAVE_BUDGET_BYTES = 4 * 1_024 * 1_024;
const WORLD_SAVE_GROWTH_BUDGET_BYTES = 512 * 1_024;
const ROUTINE_RECEIPT_SAVE_BUDGET_BYTES = 64 * 1_024;
const ROUTINE_RECEIPT_GROWTH_BUDGET_BYTES = 1_024;
const ROUTINE_SOURCE_SAVE_GROWTH_BUDGET_BYTES = 128 * 1_024;
const REGIONAL_ECOLOGY_SAVE_GROWTH_BUDGET_BYTES = 512 * 1_024;
const UTF8_ENCODER = new TextEncoder();

interface CurrentGameSaveEnvelope extends Readonly<Record<string, unknown>> {
  readonly format: "tideweft-session";
  readonly version: 32;
  readonly world: string;
  readonly regionalEcology: string;
  readonly integrity: string;
}

interface ProductionRoutineSource {
  readonly sourceKey: string;
  readonly sourceKind: RegionalEcologyStateV6SourceOwnership["kind"];
  readonly actorId: string;
  readonly species: CoreEcologyActivityProjection["species"];
  readonly authority: CoreEcologyActivityAuthorityReceipt | undefined;
  readonly patch: CoreEcologyAggregatePatchState;
}

interface ProductionRoutineStep {
  readonly patch: CoreEcologyAggregatePatchState;
  readonly before: CoreEcologyActivityProjection;
  readonly after: CoreEcologyActivityProjection;
  readonly resolution: "arrived" | "blocked" | "deferred" | "held" | "moved";
}

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {
    this.record = record === undefined ? undefined : structuredClone(record);
  }

  async list() {
    return [];
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    return slotId === "autosave" && this.record !== undefined
      ? structuredClone(this.record)
      : undefined;
  }

  async save(record: SaveRecord): Promise<void> {
    this.record = structuredClone(record);
  }

  async remove(): Promise<void> {
    this.record = undefined;
  }

  snapshot(): SaveRecord {
    if (this.record === undefined) throw new Error("Turning Day fixture has no autosave");
    return structuredClone(this.record);
  }
}

describe("Turning Day bounded multi-day closure budget", () => {
  it(`${TURNING_DAY_MULTI_DAY_BUDGET_OWNER_INTENT} keeps production routines and saves bounded`, async () => {
    const fixtureStartedAt = performance.now();
    const currentRecord = await createCurrentProductionRecord();
    const envelope = decodeCurrentEnvelope(currentRecord);
    const productionV6 = deserializeRegionalEcologyStateV6(envelope.regionalEcology);
    if (productionV6 === null) throw new Error("Current V32 save lost its V6 ecology root");
    expect(serializeRegionalEcologyStateV6(productionV6)).toBe(envelope.regionalEcology);
    expect(productionV6.updatedAtTick).toBe(PRODUCTION_FIXTURE_TICK);
    const productionWorld = deserializeWorld(envelope.world);
    const productionRoutine = selectProductionRoutineSource(
      productionV6,
      productionWorld.meta.rootSeed,
    );
    const initialRoutineSourceBytes = serializedBytes(
      serializeCoreEcologyAggregatePatch(productionRoutine.patch),
    );
    const fixtureSetupMs = performance.now() - fixtureStartedAt;

    const world = bindResidentRoutines(productionWorld);
    const soakStartTick = world.meta.completedTick;
    let regionalState = productionV6;
    let routinePatch = productionRoutine.patch;
    let routineAuthority = productionRoutine.authority;
    let regionalProjection = bindProductionRegionalProjection(
      regionalState,
      productionRoutine.sourceKey,
      routinePatch,
    );
    const initialWorldBytes = serializedBytes(serializeWorld(world));
    const initialRegionalEcologyBytes = serializedBytes(envelope.regionalEcology);
    const dailyWorldBytes: number[] = [];
    const dailyResidentRoutineBytes: number[] = [];
    const dailyRoutineSourceBytes: number[] = [];
    const dailyRegionalEcologyBytes: number[] = [];
    const awakeDayIndexes = new Set<number>();
    const asleepDayIndexes = new Set<number>();
    let residentProjectionCount = 0;
    let routineProjectionCount = 0;
    let physicalActivityMoves = 0;
    let physicalReturnMoves = 0;
    let settledTicks = 0;

    const startedAt = performance.now();
    const cpuStartedAt = cpuUsage();
    for (let ordinal = 1; ordinal <= SOAK_TICKS; ordinal += 1) {
      stepWorld(world);
      advanceEveryResidentRoutine(world);
      residentProjectionCount += world.residents.length;

      const routineStep = advanceProductionRoutine(
        routinePatch,
        productionRoutine.actorId,
        world.meta.completedTick,
        routineAuthority,
      );
      routinePatch = routineStep.patch;
      routineProjectionCount += 1;
      const beforeRoutine = routineStep.before.routine;
      const afterRoutine = routineStep.after.routine;
      if (beforeRoutine === null || afterRoutine === null) {
        throw new Error("Production activity owner dropped its circadian routine");
      }
      const dayIndex = Math.floor(world.meta.completedTick / WORLD_TICKS_PER_DAY);
      if (afterRoutine.posture.state === "awake") awakeDayIndexes.add(dayIndex);
      if (afterRoutine.posture.state === "asleep") asleepDayIndexes.add(dayIndex);
      if (afterRoutine.posture.state === "resting") settledTicks += 1;
      if (routineStep.resolution === "moved") {
        if (beforeRoutine.action === "travel-to-rest-destination") {
          physicalReturnMoves += 1;
        } else if (beforeRoutine.effectivePreference === "active") {
          physicalActivityMoves += 1;
        }
      }

      if (ordinal % WORLD_TICKS_PER_DAY !== 0) continue;
      const serializedWorld = serializeWorld(world);
      const restoredWorld = deserializeWorld(serializedWorld);
      expect(serializeWorld(restoredWorld)).toBe(serializedWorld);
      dailyWorldBytes.push(serializedBytes(serializedWorld));
      dailyResidentRoutineBytes.push(serializedBytes(JSON.stringify(
        world.residents.map(({ identity, circadian }) => ({
          subjectId: identity.stableId,
          circadian,
        })),
      )));

      // V6 persists regional sources all-coarse. Exercise that exact boundary
      // each day, then rematerialize the same stable actor for the next cycle.
      const storedPatch = setCoreEcologyAggregatePatchMaterializedActors(routinePatch, {
        atTick: world.meta.completedTick,
        actorIds: [],
      });
      const serializedPatch = serializeCoreEcologyAggregatePatch(storedPatch);
      const restoredPatch = deserializeCoreEcologyAggregatePatch(serializedPatch);
      if (restoredPatch === null) throw new Error("Production routine source did not reload");
      dailyRoutineSourceBytes.push(serializedBytes(serializedPatch));

      const committedRegional = commitProductionRegionalDay({
        state: regionalState,
        projection: regionalProjection,
        rootSeed: world.meta.rootSeed,
        selectedSourceKey: productionRoutine.sourceKey,
        selectedPatch: routinePatch,
        atTick: world.meta.completedTick,
      });
      const serializedRegional = serializeRegionalEcologyStateV6(committedRegional);
      const restoredRegional = deserializeRegionalEcologyStateV6(serializedRegional);
      if (
        restoredRegional === null
        || serializeRegionalEcologyStateV6(restoredRegional) !== serializedRegional
      ) throw new Error("Committed V6 regional ecology did not round-trip exactly");
      dailyRegionalEcologyBytes.push(serializedBytes(serializedRegional));
      regionalState = restoredRegional;
      const restoredSource = regionalEcologyStateV6ActiveSourcePatches(regionalState)
        ?.find(({ sourceKey }) => sourceKey === productionRoutine.sourceKey)?.patch;
      if (restoredSource === undefined) {
        throw new Error("Committed V6 regional ecology lost its routine source");
      }
      routinePatch = setCoreEcologyAggregatePatchMaterializedActors(restoredSource, {
        atTick: world.meta.completedTick,
        actorIds: [productionRoutine.actorId],
      });
      const restoredAuthority = productionRoutineAuthority(
        regionalState,
        world.meta.rootSeed,
        productionRoutine.sourceKind,
        routinePatch,
        productionRoutine.actorId,
      );
      if (restoredAuthority === null) {
        throw new Error("Production routine source lost its breadth activity authority");
      }
      routineAuthority = restoredAuthority;
      regionalProjection = bindProductionRegionalProjection(
        regionalState,
        productionRoutine.sourceKey,
        routinePatch,
      );
      expect(actorFor(routinePatch, productionRoutine.actorId).identity.stableId)
        .toBe(productionRoutine.actorId);
    }
    const elapsedMs = performance.now() - startedAt;
    const elapsedCpu = cpuUsage(cpuStartedAt);
    const elapsedCpuMs = (elapsedCpu.user + elapsedCpu.system) / 1_000;

    assertWorldInvariants(world);
    expect(currentRecord.payloadVersion).toBe(32);
    expect(envelope.version).toBe(32);
    expect(currentRecord.worldJson.length).toBeLessThan(SAVE_WORLD_JSON_MAX_CHARACTERS);
    expect(serializedBytes(envelope.regionalEcology))
      .toBeLessThan(REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES);
    expect(CORE_ECOLOGY_CIRCADIAN_BINDINGS).toHaveLength(17);
    expect(CORE_ECOLOGY_CIRCADIAN_BINDINGS.some(({ speciesId }) => (
      speciesId === productionRoutine.species
    ))).toBe(true);
    expect(world.meta.completedTick).toBe(soakStartTick + SOAK_TICKS);
    expect(world.residents).toHaveLength(42);
    expect(world.residents.every(({ circadian }) => circadian !== undefined)).toBe(true);
    expect(residentProjectionCount).toBe(SOAK_TICKS * 42);
    expect(routineProjectionCount).toBe(SOAK_TICKS);
    expect(physicalActivityMoves).toBeGreaterThan(0);
    expect(physicalReturnMoves).toBeGreaterThan(0);
    expect(settledTicks).toBeGreaterThan(0);
    expect(awakeDayIndexes.size).toBeGreaterThanOrEqual(SOAK_DAYS);
    expect(asleepDayIndexes.size).toBeGreaterThanOrEqual(SOAK_DAYS);
    expect(actorFor(routinePatch, productionRoutine.actorId).circadian).toMatchObject({
      ownerId: LIVING_CIRCADIAN_OWNER_ID,
      policy: { profileId: "day-active" },
    });
    expect(dailyWorldBytes).toHaveLength(SOAK_DAYS);
    expect(dailyResidentRoutineBytes).toHaveLength(SOAK_DAYS);
    expect(dailyRoutineSourceBytes).toHaveLength(SOAK_DAYS);
    expect(dailyRegionalEcologyBytes).toHaveLength(SOAK_DAYS);
    const worldSaveBytes = [initialWorldBytes, ...dailyWorldBytes];
    const routineSourceSaveBytes = [initialRoutineSourceBytes, ...dailyRoutineSourceBytes];
    const regionalEcologySaveBytes = [
      initialRegionalEcologyBytes,
      ...dailyRegionalEcologyBytes,
    ];
    expect(Math.max(...worldSaveBytes)).toBeLessThan(WORLD_SAVE_BUDGET_BYTES);
    expect(byteRange(worldSaveBytes)).toBeLessThan(WORLD_SAVE_GROWTH_BUDGET_BYTES);
    expect(Math.max(...dailyResidentRoutineBytes))
      .toBeLessThan(ROUTINE_RECEIPT_SAVE_BUDGET_BYTES);
    expect(byteRange(dailyResidentRoutineBytes))
      .toBeLessThan(ROUTINE_RECEIPT_GROWTH_BUDGET_BYTES);
    expect(Math.max(...routineSourceSaveBytes))
      .toBeLessThan(CORE_ECOLOGY_PATCH_MAX_SERIALIZED_BYTES);
    expect(byteRange(routineSourceSaveBytes))
      .toBeLessThan(ROUTINE_SOURCE_SAVE_GROWTH_BUDGET_BYTES);
    expect(Math.max(...regionalEcologySaveBytes))
      .toBeLessThan(REGIONAL_ECOLOGY_STATE_V6_MAX_SERIALIZED_BYTES);
    expect(byteRange(regionalEcologySaveBytes))
      .toBeLessThan(REGIONAL_ECOLOGY_SAVE_GROWTH_BUDGET_BYTES);

    console.info("[turning-day-multi-day-budget]", JSON.stringify({
      ownerId: TURNING_DAY_MULTI_DAY_BUDGET_OWNER_INTENT,
      days: SOAK_DAYS,
      ticks: SOAK_TICKS,
      v32EnvelopeBytes: serializedBytes(currentRecord.worldJson),
      v6EcologyBytes: serializedBytes(envelope.regionalEcology),
      v6SourceKey: productionRoutine.sourceKey,
      v6SourceKind: productionRoutine.sourceKind,
      routineActorId: productionRoutine.actorId,
      routineSpecies: productionRoutine.species,
      residentProjectionCount,
      routineProjectionCount,
      physicalActivityMoves,
      physicalReturnMoves,
      settledTicks,
      awakeDayIndexes: [...awakeDayIndexes].sort((left, right) => left - right),
      asleepDayIndexes: [...asleepDayIndexes].sort((left, right) => left - right),
      initialWorldBytes,
      dailyWorldBytes,
      worldSaveGrowthBytes: byteRange(worldSaveBytes),
      dailyResidentRoutineBytes,
      initialRoutineSourceBytes,
      dailyRoutineSourceBytes,
      routineSourceSaveGrowthBytes: byteRange(routineSourceSaveBytes),
      initialRegionalEcologyBytes,
      dailyRegionalEcologyBytes,
      regionalEcologySaveGrowthBytes: byteRange(regionalEcologySaveBytes),
      fixtureSetupMs: rounded(fixtureSetupMs),
      elapsedMs: rounded(elapsedMs),
      elapsedCpuMs: rounded(elapsedCpuMs),
      cpuBudgetMs: SOAK_CPU_BUDGET_MS,
    }));
    expect(elapsedCpuMs).toBeLessThan(SOAK_CPU_BUDGET_MS);
  }, 90_000);
});

async function createCurrentProductionRecord(): Promise<SaveRecord> {
  const repository = new MemoryRepository(legacyRecordAtProductionTick());
  const runtime = await createTideweftRuntime(repository);
  await runtime.save();
  const record = repository.snapshot();
  runtime.destroy();
  return record;
}

function legacyRecordAtProductionTick(): SaveRecord {
  const seed = "rain chorus bounded diurnal activity owner";
  const world = createWorld(seed, "wild");
  runTicks(world, PRODUCTION_FIXTURE_TICK - world.meta.completedTick);
  assertWorldInvariants(world);
  const fullPlayer = createPlayer(createWorldView(world));
  const { timeAction: _futureTimeAction, ...legacyPlayer } = fullPlayer;
  const session = createSessionState(seed, "gale", "wander");
  session.paused = false;
  session.titleVisible = false;
  return {
    slotId: "autosave",
    label: "Turning Day production performance",
    seed,
    updatedAt: 1,
    playTicks: world.meta.completedTick,
    settlementCount: world.settlements.length,
    connectedCount: world.routes.filter(({ traceStrength }) => traceStrength >= 120_000).length,
    worldJson: JSON.stringify({
      format: "tideweft-session",
      version: 1,
      world: serializeWorld(world),
      player: legacyPlayer,
      session,
    }),
  };
}

function decodeCurrentEnvelope(record: SaveRecord): CurrentGameSaveEnvelope {
  const envelope = JSON.parse(record.worldJson) as CurrentGameSaveEnvelope;
  expect(envelope.format).toBe("tideweft-session");
  expect(envelope.version).toBe(32);
  expect(typeof envelope.world).toBe("string");
  expect(typeof envelope.regionalEcology).toBe("string");
  const { integrity, ...unsealed } = envelope;
  expect(integrity).toBe(gameSaveEnvelopeIntegrity(unsealed));
  return envelope;
}

function bindProductionRegionalProjection(
  state: RegionalEcologyStateV6,
  selectedSourceKey: string,
  selectedPatch: CoreEcologyAggregatePatchState,
): RegionalEcologyStateV6ActiveProjection {
  const sources = regionalEcologyStateV6ActiveSourcePatches(state);
  if (sources === null) throw new Error("Current V6 ecology lost its active sources");
  const rebound = sources.map((source) => (
    source.sourceKey === selectedSourceKey
      ? { sourceKey: source.sourceKey, patch: selectedPatch }
      : source
  ));
  const projection = bindRegionalEcologyStateV6ActiveProjection(state, rebound);
  if (projection === null) {
    throw new Error("Current V6 ecology rejected its representative physical projection");
  }
  return projection;
}

function commitProductionRegionalDay(input: Readonly<{
  state: RegionalEcologyStateV6;
  projection: RegionalEcologyStateV6ActiveProjection;
  rootSeed: WorldState["meta"]["rootSeed"];
  selectedSourceKey: string;
  selectedPatch: CoreEcologyAggregatePatchState;
  atTick: number;
}>): RegionalEcologyStateV6 {
  const patchFor = (
    source: Readonly<{ sourceKey: string; patch: CoreEcologyAggregatePatchState }>,
  ): Readonly<{ sourceKey: string; patch: CoreEcologyAggregatePatchState }> => {
    if (source.sourceKey === input.selectedSourceKey) {
      if (input.selectedPatch.updatedAtTick !== input.atTick) {
        throw new Error("Selected physical routine did not reach the daily V6 clock");
      }
      return Object.freeze({ sourceKey: source.sourceKey, patch: input.selectedPatch });
    }
    const patch = advanceProductionCoarsePatch(source.patch, input.atTick);
    return Object.freeze({ sourceKey: source.sourceKey, patch });
  };
  const v1State = input.state.base.base.base.base.base;
  const v1Projection = input.projection.base.base.base.base.base;
  const homeIsProjected = v1Projection.residents.some(({ sourceKey }) => (
    sourceKey === v1State.settlementHome.sourceKey
  ));
  const settlementHome = homeIsProjected
    ? null
    : Object.freeze({
        sourceKey: v1State.settlementHome.sourceKey,
        patch: advanceProductionCoarsePatch(
          v1State.settlementHome.patch,
          input.atTick,
        ),
      });
  const commitInput: CommitRegionalEcologyStateV6ActiveProjectionInput = {
    base: {
      base: {
        base: {
          base: {
            base: {
              root: advanceRegionalEcologyRoot(v1State.root, input.atTick),
              rootSeed: input.rootSeed,
              settlementHome,
              residents: v1Projection.residents.map(patchFor),
            },
            alpineResidents: input.projection.base.base.base.base.alpineResidents
              .map(patchFor),
          },
          polarShoreResidents: input.projection.base.base.base.polarShoreResidents
            .map(patchFor),
        },
        coldShoreResidents: input.projection.base.base.coldShoreResidents
          .map(patchFor),
      },
      polarConsumerResidents: input.projection.base.polarConsumerResidents
        .map(patchFor),
    },
    breadthResidents: input.projection.breadthResidents.map(patchFor),
  };
  const committed = commitRegionalEcologyStateV6ActiveProjection(
    input.state,
    input.projection,
    commitInput,
  );
  if (committed === null) {
    throw new Error("Production V6 composite rejected its bounded daily commit");
  }
  return committed;
}

function advanceProductionCoarsePatch(
  initial: CoreEcologyAggregatePatchState,
  atTick: number,
): CoreEcologyAggregatePatchState {
  const accelerated = advanceCoreEcologyDormantAggregatePatch(initial, { atTick });
  if (accelerated !== null) return accelerated;
  let patch = initial;
  while (patch.updatedAtTick < atTick) {
    const stepped = stepCoreEcologyAggregatePatch(patch, {
      tick: patch.updatedAtTick + 1,
      actorSteps: [],
    });
    if (stepped === null) {
      throw new Error(`Nonselected V6 source was not dormant at ${patch.updatedAtTick}`);
    }
    patch = stepped.patch;
  }
  return patch;
}

function selectProductionRoutineSource(
  state: RegionalEcologyStateV6,
  rootSeed: WorldState["meta"]["rootSeed"],
): ProductionRoutineSource {
  const sources = regionalEcologyStateV6ActiveSourcePatches(state);
  const ownership = regionalEcologyStateV6SourceOwnership(state, true);
  if (sources === null || ownership === null) {
    throw new Error("Current V6 ecology lost its active source ownership");
  }
  const kindBySource = new Map(ownership.map(({ sourceKey, kind }) => [sourceKey, kind]));
  const boundSpecies = new Set(
    CORE_ECOLOGY_CIRCADIAN_BINDINGS.map(({ speciesId }) => speciesId),
  );
  for (const { sourceKey, patch } of sources) {
    const sourceKind = kindBySource.get(sourceKey);
    if (sourceKind === undefined) continue;
    for (const { species, members } of patch.populations) {
      if (!boundSpecies.has(species)) continue;
      for (const { actor } of members) {
        let materialized: CoreEcologyAggregatePatchState;
        try {
          materialized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
            atTick: state.updatedAtTick,
            actorIds: [actor.identity.stableId],
          });
        } catch {
          continue;
        }
        const authority = productionRoutineAuthority(
          state,
          rootSeed,
          sourceKind,
          materialized,
          actor.identity.stableId,
        );
        if (authority === null) continue;
        const activity = projectCoreEcologyActivity(materialized, {
          actorId: actor.identity.stableId,
          atTick: state.updatedAtTick,
        }, authority);
        if (
          activity !== null
          && activity.routine !== null
          && activity.motion.kind === "target-area"
          && coreEcologyActivityTravelMedium(activity.motion) === "air"
        ) {
          return Object.freeze({
            sourceKey,
            sourceKind,
            actorId: actor.identity.stableId,
            species: activity.species,
            authority,
            patch: materialized,
          });
        }
      }
    }
  }
  const activeSpecies = [...new Set(sources.flatMap(({ patch }) => (
    patch.populations.map(({ species }) => species)
  )))].sort();
  throw new Error(
    `Current V6 sources have no physical aerial circadian journey: ${activeSpecies.join(",")}`,
  );
}

function productionRoutineAuthority(
  state: RegionalEcologyStateV6,
  rootSeed: WorldState["meta"]["rootSeed"],
  sourceKind: RegionalEcologyStateV6SourceOwnership["kind"],
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): CoreEcologyActivityAuthorityReceipt | null | undefined {
  if (sourceKind === "regional-breadth-v1") {
    return projectCoreEcologyBreadthActivityAuthority({ rootSeed, patch, actorId });
  }
  if (sourceKind === "regional-alpine") {
    return projectCoreEcologyAlpineRidgeActivityAuthority({ rootSeed, patch, actorId });
  }
  if (sourceKind === "regional-polar-consumer-v1") {
    return projectCoreEcologyPolarConsumerActivityAuthority({ rootSeed, patch, actorId });
  }
  if (sourceKind === "regional-habitat" || sourceKind === "legacy-cohort") {
    return projectCoreEcologyActivityAuthority({
      rootSeed,
      root: state.base.base.base.base.base.root,
      sourceKind,
      patch,
      actorId,
    });
  }
  return undefined;
}

function advanceProductionRoutine(
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
  atTick: number,
  authority: CoreEcologyActivityAuthorityReceipt | undefined,
): ProductionRoutineStep {
  const before = projectCoreEcologyActivity(patch, { actorId, atTick }, authority);
  if (before === null || before.routine === null) {
    throw new Error(`Production routine did not project at tick ${atTick}`);
  }
  const stepped = stepCoreEcologyAggregatePatch(patch, {
    tick: atTick,
    actorSteps: [{
      actorId,
      observations: [],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
      minimumPerceptionWakeSalience: before.routine.wakeSensitivity,
      ...(before.preferredNeutralIntent === null
        ? {}
        : { neutralActivityPreference: before.preferredNeutralIntent }),
    }],
  });
  if (stepped === null) throw new Error(`Production routine cognition failed at ${atTick}`);
  const motion = stepCoreEcologyActivityMotion(stepped.patch, {
    actorId,
    atTick,
    maximumStepUnits: ROUTINE_ACTOR_STEP_UNITS,
  }, authority);
  if (motion === null) throw new Error(`Production routine motion failed at ${atTick}`);
  const after = projectCoreEcologyActivity(motion.patch, { actorId, atTick }, authority);
  if (after === null || after.routine === null) {
    throw new Error(`Production routine did not survive motion at ${atTick}`);
  }
  return Object.freeze({
    patch: motion.patch,
    before,
    after,
    resolution: motion.resolution,
  });
}

function actorFor(patch: CoreEcologyAggregatePatchState, actorId: string) {
  const actor = patch.populations.flatMap(({ members }) => members)
    .find(({ actor: candidate }) => candidate.identity.stableId === actorId)?.actor;
  if (actor === undefined) throw new Error(`Production routine lost actor ${actorId}`);
  return actor;
}

function bindResidentRoutines(world: WorldState): WorldState {
  world.residents = world.residents.map((resident) => {
    const destinationId = residentSettlementRestNetworkId(
      resident.identity.stableId,
      resident.homeSettlementId,
    );
    if (destinationId === null || !residentAtSettlementRestDestination(resident)) {
      throw new Error("production resident lacks a physical settlement-rest binding");
    }
    return replaceResidentCircadian(resident, {
      atTick: world.meta.completedTick,
      circadian: {
        version: LIVING_CIRCADIAN_VERSION,
        ownerId: LIVING_CIRCADIAN_OWNER_ID,
        policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
        restDestinationId: destinationId,
        restDestinationArrived: true,
        posture: { state: "awake", enteredAtTick: world.meta.completedTick },
      },
    });
  });
  assertWorldInvariants(world);
  return world;
}

function advanceEveryResidentRoutine(world: WorldState): void {
  const replacements = world.residents.map((resident) => {
    const plan = planResidentCircadian({
      resident,
      duty: null,
      weather: world.weather,
      atTick: world.meta.completedTick,
    });
    if (plan === null) throw new Error(`resident routine failed for ${resident.id}`);
    if (plan.kind === "unbound-deferred") return resident;
    return replaceResidentCircadian(resident, {
      atTick: world.meta.completedTick,
      circadian: plan.projection.receipt,
    });
  });
  if (replacements.length !== world.residents.length) {
    throw new Error("resident routine replacement lost population breadth");
  }
  world.residents = replacements;
}

function serializedBytes(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function byteRange(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
