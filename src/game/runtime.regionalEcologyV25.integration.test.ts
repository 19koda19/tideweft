import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { createWorldView, deserializeWorld } from "../sim/public";
import { regionKey, regionLocalToGlobalTile } from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { hashCanonical, stableStringify } from "../sim/util";
import {
  coreEcologyAggregatePatchActor,
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  projectCoreEcologyActivity,
  projectCoreEcologyDayPhase,
} from "./coreEcologyActivity";
import type { CoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  type CoreEcologyGroupState,
} from "./coreEcologyGroups";
import {
  coreEcologySpeciesCanOwnActorAddress,
  coreEcologySpeciesHasRuntimeCapability,
  coreEcologySpeciesRuntimePolicy,
} from "./coreEcologySpeciesRuntimePolicy";
import { adoptCoreEcologySettlementHomeFromV24 } from "./coreEcologySettlementHome";
import { setCoreEcologyMaterializationForWindow } from "./coreEcologyRuntime";
import { stepCoreEcologyTidalTable } from "./coreEcologyTidalTable";
import {
  replaceCoreWildlifeActorPhysiology,
  repositionCoreWildlifeActor,
} from "./coreWildlifeActor";
import { createCraftingInventory } from "./crafting";
import {
  LOOSE_CARGO_TILE_UNITS,
  addLooseCargoProvision,
  createLooseCargoCarrier,
  dropLooseCargo,
} from "./looseCargo";
import type { PlayerState } from "./player";
import {
  commitPhysicalCargoRegionalMutation,
  createPhysicalCargoStateFromPlayer,
  gameSaveEnvelopeIntegrity,
  quotePhysicalCargoSource,
  snapshotPhysicalCargoState,
  transitionPhysicalCargoRegion,
  type SerializedPhysicalCargoState,
} from "./physicalCargoState";
import { PROVISION_DEFINITIONS } from "./provisions";
import {
  putRegionalEcologyResidentDeviation,
  regionalEcologyResidentDeviation,
} from "./regionalEcology";
import { deriveCoreEcologyRegionalResidentSet } from "./regionalEcologyResidents";
import {
  createRegionalEcologyState,
  regionalEcologyActiveResidentPatches,
  type RegionalEcologyResidentSnapshotV1,
  type RegionalEcologyStateV1,
} from "./regionalEcologyState";
import {
  createRegionalEcologyStateV2,
  deserializeRegionalEcologyStateV2,
  serializeRegionalEcologyStateV2,
  type RegionalEcologyStateV2,
} from "./regionalEcologyStateV2";
import { setRegionalEcologyMaterializationForWindow } from "./regionalEcologyRuntime";
import { restorePlayerRegionalTravel } from "./regionalPlayerTravel";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import {
  createRegionalWorldView,
  regionalAddressAt,
} from "./regionalWorldView";
import { coreWildlifeTraversabilityCell } from "./coreWildlifeLocomotionProfile";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

interface V26Envelope {
  readonly format: "tideweft-session";
  readonly version: 26;
  readonly world: string;
  readonly player: PlayerState;
  readonly physicalCargo: SerializedPhysicalCargoState;
  readonly regionalTravel: string;
  readonly regionalEcology: string;
  readonly integrity: string;
}

interface V24Envelope {
  readonly format: "tideweft-session";
  readonly version: 24;
  readonly world: string;
  readonly player: PlayerState;
  readonly physicalCargo: SerializedPhysicalCargoState;
  readonly coreEcology: string;
  readonly integrity: string;
}

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {}

  async list() { return []; }
  async load(slotId: string) {
    return slotId === "autosave" && this.record !== undefined
      ? structuredClone(this.record)
      : undefined;
  }
  async save(record: SaveRecord) { this.record = structuredClone(record); }
  async remove() { this.record = undefined; }

  snapshot(): SaveRecord {
    if (this.record === undefined) throw new Error("regional-v26 fixture has no autosave");
    return structuredClone(this.record);
  }

  replace(record: SaveRecord): void {
    this.record = structuredClone(record);
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runtime Alpha-32 regional ecology save boundary", () => {
  it("writes one sparse v26 regional owner without the retired whole-world field", async () => {
    const repository = await createFreshSave("alpha32 runtime sparse regional owner");
    const envelope = requireV26(repository.snapshot());
    const state = requireRegionalState(envelope);
    const world = deserializeWorld(envelope.world);
    expect(Object.hasOwn(envelope, "regionalEcology")).toBe(true);
    expect(Object.hasOwn(envelope, "coreEcology")).toBe(false);
    expect(state.root.adoption).toBeNull();
    expect(state.root.legacyCohort).toBeNull();
    expect(state.activeResidents.every(({ kind }) => kind === "regional-habitat")).toBe(true);

    const expected = deriveCoreEcologyRegionalResidentSet({
      seed: world.meta.rootSeed,
      regions: state.activeRegions,
      tick: world.meta.completedTick,
    });
    expect(state.activeResidents.map(({ sourceKey }) => sourceKey))
      .toEqual(expected.residents.map(({ sourceKey }) => sourceKey));

    const originKeys = new Set<string>();
    for (const resident of state.activeResidents) {
      const baseline = expected.residents.find(({ sourceKey }) => (
        sourceKey === resident.sourceKey
      ));
      expect(baseline, resident.sourceKey).toBeDefined();
      expect(stableStringify(resident.patch), resident.sourceKey)
        .toBe(stableStringify(baseline?.patch));
      if (baseline === undefined) continue;

      const representedUnits = resident.patch.populations.reduce(
        (sum, population) => sum + population.populationSize,
        0,
      ) + resident.patch.aggregatePopulations.reduce(
        (sum, population) => sum + population.populationSize,
        0,
      );
      expect(representedUnits, resident.sourceKey).toBe(baseline.habitat.totalPopulationUnits);
      expect(resident.patch.populations.flatMap(({ members }) => members).every((member) => (
        member.materialization === "coarse"
        && member.actor.identity.originRegion.x === resident.region.x
        && member.actor.identity.originRegion.y === resident.region.y
        && member.actor.address.position.region.x === resident.region.x
        && member.actor.address.position.region.y === resident.region.y
      )), resident.sourceKey).toBe(true);
      originKeys.add(`${resident.region.x},${resident.region.y}`);
    }

    expect(originKeys.size).toBe(state.activeResidents.length);
    expect(uniqueActorIds(state).size).toBe(actorContinuity(state).length);
  });

  it("round-trips exact regional identity and physiology without regenerating residents", async () => {
    const repository = await createFreshSave("alpha32 runtime regional reload continuity");
    const firstEnvelope = requireV26(repository.snapshot());
    const firstState = requireRegionalState(firstEnvelope);
    const firstContinuity = actorContinuity(firstState);
    expect(firstContinuity.length).toBeGreaterThan(0);

    const reloaded = await createTideweftRuntime(repository);
    await reloaded.save();
    reloaded.destroy();

    const secondEnvelope = requireV26(repository.snapshot());
    const secondState = requireRegionalState(secondEnvelope);
    expect(secondEnvelope.regionalEcology).toBe(firstEnvelope.regionalEcology);
    expect(serializeRegionalEcologyStateV2(requireRegionalStateV2(secondEnvelope)))
      .toBe(firstEnvelope.regionalEcology);
    expect(actorContinuity(secondState)).toEqual(firstContinuity);
  });

  it("adopts one exact v24 owner once and cannot reroll its receipt on reload", async () => {
    const repository = await createFreshSave("alpha32 exact v24 one-way adoption");
    const fresh = requireV26(repository.snapshot());
    const sourcePatch = createV24SourcePatch(fresh);
    const freshState = requireRegionalState(fresh);
    const freshWorld = deserializeWorld(fresh.world);
    if (freshState.settlementHome.patch.derivation.kind !== "settlement-home-v1") {
      throw new Error("v26 fixture omitted its settlement-home habitat");
    }
    expect(adoptCoreEcologySettlementHomeFromV24({
      seed: freshWorld.meta.rootSeed,
      habitat: freshState.settlementHome.patch.derivation.habitat,
      completedTick: freshWorld.meta.completedTick,
      sourcePatch,
    })).not.toBeNull();
    const v24 = downgradeToV24(repository.snapshot(), fresh, sourcePatch);
    repository.replace(v24.record);

    const migratedRuntime = await createTideweftRuntime(repository);
    await migratedRuntime.save();
    migratedRuntime.destroy();

    const firstEnvelope = requireV26(repository.snapshot());
    const firstState = requireRegionalState(firstEnvelope);
    const receipt = firstState.root.adoption;
    expect(Object.hasOwn(firstEnvelope, "coreEcology")).toBe(false);
    expect(receipt).not.toBeNull();
    expect(receipt?.sourceOuterVersion).toBe(24);
    expect(receipt?.sourceEnvelopeIntegrity).toBe(v24.envelope.integrity);
    expect(receipt?.sourceCoreEcologyHash).toBe(hashCanonical(sourcePatch));
    expect(firstState.root.legacyCohort?.sourcePatchHash).toBe(hashCanonical(sourcePatch));
    expect(firstState.root.legacyCohort?.sourcePatch).toEqual(sourcePatch);
    expect(adoptionAccountingUnits(firstState)).toEqual(sourceAuthorityUnits(sourcePatch));

    const durableState = firstEnvelope.regionalEcology;
    const durableReceipt = stableStringify(receipt);
    const reloadedRuntime = await createTideweftRuntime(repository);
    await reloadedRuntime.save();
    reloadedRuntime.destroy();

    const secondEnvelope = requireV26(repository.snapshot());
    const secondState = requireRegionalState(secondEnvelope);
    expect(secondEnvelope.regionalEcology).toBe(durableState);
    expect(stableStringify(secondState.root.adoption)).toBe(durableReceipt);
    expect(secondState.root.legacyCohort?.sourcePatch).toEqual(sourcePatch);
    expect(Object.hasOwn(secondEnvelope, "coreEcology")).toBe(false);
  }, 30_000);

  it("materializes independently of source order and round-trips one neutral world tick", async () => {
    const repository = await createFreshSave("alpha32 runtime order and neutral tick");
    const beforeEnvelope = requireV26(repository.snapshot());
    const beforeState = requireRegionalState(beforeEnvelope);
    const beforeWorld = deserializeWorld(beforeEnvelope.world);
    const travel = restorePlayerRegionalTravel(
      beforeWorld.meta.rootSeed,
      beforeEnvelope.player,
      beforeEnvelope.regionalTravel,
    );
    if (travel === null) throw new Error("v26 order fixture lost its regional frame");
    const sources = regionalEcologyActiveResidentPatches(beforeState);
    if (sources === null) throw new Error("v26 order fixture lost its active root owners");
    const window = {
      origin: travel.window.origin,
      terrain: {
        width: travel.window.terrain.width,
        height: travel.window.terrain.height,
      },
    };
    const forward = setRegionalEcologyMaterializationForWindow(
      sources,
      window,
      beforeState.updatedAtTick,
    );
    const reverse = setRegionalEcologyMaterializationForWindow(
      [...sources].reverse(),
      window,
      beforeState.updatedAtTick,
    );
    expect(forward).not.toBeNull();
    expect(reverse).toEqual(forward);

    const runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    runtime.destroy();

    const afterEnvelope = requireV26(repository.snapshot());
    const afterState = requireRegionalState(afterEnvelope);
    const afterWorld = deserializeWorld(afterEnvelope.world);
    expect(afterWorld.meta.completedTick).toBe(beforeWorld.meta.completedTick + 1);
    expect(afterState.updatedAtTick).toBe(afterWorld.meta.completedTick);
    const durableRegionalEcology = afterEnvelope.regionalEcology;

    const reloaded = await createTideweftRuntime(repository);
    await reloaded.save();
    reloaded.destroy();
    expect(requireV26(repository.snapshot()).regionalEcology).toBe(durableRegionalEcology);
  }, 30_000);

  it("conserves one cross-owner predator death and rejects duplicated body authority", async () => {
    const repository = await createFreshSave("alpha32 runtime sparse regional owner");
    const staged = stageCrossOwnerPredatorContact(repository);
    expect(staged.attackerSourceKey).not.toBe(staged.victimSourceKey);

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    runtime.destroy();

    const afterEnvelope = requireV26(repository.snapshot());
    const afterState = requireRegionalState(afterEnvelope);
    const attacker = regionalSource(afterState, staged.attackerSourceKey);
    const victim = regionalSource(afterState, staged.victimSourceKey);
    expect(attacker.patch.carcasses).toHaveLength(0);
    expect(attacker.patch.mortalityTransactions).toHaveLength(0);
    expect(populationUnits(victim.patch, "marsh-rabbit"))
      .toBe(staged.victimPopulationUnits - 1);
    expect(victim.patch.mortalityTransactions).toHaveLength(1);
    expect(victim.patch.carcasses).toHaveLength(1);
    expect(victim.patch.mortalityTransactions[0]?.event).toMatchObject({
      attackerId: staged.attackerId,
      victimId: staged.victimId,
    });
    expect(victim.patch.carcasses[0]).toMatchObject({
      sourceActorId: staged.victimId,
    });
    expect(victim.patch.carcasses[0]?.remainingResourceUnits).toBeGreaterThan(0);
    expect(allPhysicalActorIds(afterState).filter((id) => id === staged.victimId))
      .toHaveLength(1);

    const duplicate = duplicateRegionalSource(victim);
    const forgedState = forgeRegionalStateWithDuplicate(afterState, duplicate);
    const forgedEnvelope = resealV26(afterEnvelope, {
      regionalEcology: stableStringify(forgeRegionalStateV2WithBase(
        requireRegionalStateV2(afterEnvelope),
        forgedState,
      )),
    });
    repository.replace({
      ...repository.snapshot(),
      worldJson: JSON.stringify(forgedEnvelope),
    });
    expect(duplicate.patch.populations.flatMap(({ members }) => members)
      .some(({ actor }) => actor.identity.stableId === staged.victimId)).toBe(false);
    expect(duplicate.patch.mortalityTransactions[0]?.retiredActor.identity.stableId)
      .toBe(staged.victimId);
    expect(duplicate.patch.carcasses[0]?.carcassId)
      .toBe(victim.patch.carcasses[0]?.carcassId);

    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning).toBeDefined();
    rejected.destroy();
  }, 30_000);
});

async function createFreshSave(seed: string): Promise<MemoryRepository> {
  const repository = new MemoryRepository();
  const runtime = await createTideweftRuntime(repository);
  runtime.dispatchUI({
    type: "new-world",
    seed,
    posture: "gale",
    sessionShape: "wander",
  });
  await runtime.save();
  runtime.destroy();
  return repository;
}

function advancePlayerSteps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  // The first frame establishes the clock. Every later 100 ms frame is one
  // authoritative fixed player step; ten steps complete one neutral world tick.
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (callback === undefined) throw new Error("regional-v26 runtime stopped scheduling frames");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
}

function stageCrossOwnerPredatorContact(repository: MemoryRepository): Readonly<{
  attackerId: string;
  attackerSourceKey: string;
  victimId: string;
  victimSourceKey: string;
  victimPopulationUnits: number;
}> {
  const record = repository.snapshot();
  const envelope = requireV26(record);
  const stateV2 = requireRegionalStateV2(envelope);
  const state = requireRegionalState(envelope);
  const world = deserializeWorld(envelope.world);
  const foxSource = state.activeResidents.find(({ patch }) => (
    patch.populations.some(({ species, members }) => (
      species === "marsh-fox" && members.length > 0
    ))
  ));
  const rabbitSource = state.activeResidents.find(({ sourceKey, patch }) => (
    sourceKey !== foxSource?.sourceKey
    && patch.populations.some(({ species, members }) => (
      species === "marsh-rabbit" && members.length > 0
    ))
  ));
  const fox = foxSource?.patch.populations.find(({ species }) => (
    species === "marsh-fox"
  ))?.members[0]?.actor;
  const rabbit = rabbitSource?.patch.populations.find(({ species }) => (
    species === "marsh-rabbit"
  ))?.members[0]?.actor;
  if (foxSource === undefined || rabbitSource === undefined || fox === undefined || rabbit === undefined) {
    throw new Error("regional-v26 seed omitted its distinct fox/rabbit owners");
  }

  const position = crossOwnerContactPosition(envelope, state);
  const positionedFox = replaceCoreWildlifeActorPhysiology(
    repositionCoreWildlifeActor(fox, {
      atTick: state.updatedAtTick,
      position,
      heading: 0,
    }),
    {
      atTick: state.updatedAtTick,
      needs: { ...fox.needs, hunger: FIXED_POINT },
      condition: fox.condition,
    },
  );
  const positionedRabbit = replaceCoreWildlifeActorPhysiology(
    repositionCoreWildlifeActor(rabbit, {
      atTick: state.updatedAtTick,
      position,
      heading: Math.trunc(FIXED_POINT / 2),
    }),
    {
      atTick: state.updatedAtTick,
      needs: rabbit.needs,
      condition: { ...rabbit.condition, health: 1 },
    },
  );
  const stagedFoxPatch = replaceCoreEcologyAggregatePatchActor(
    foxSource.patch,
    positionedFox,
  );
  const stagedRabbitPatch = replaceCoreEcologyAggregatePatchActor(
    rabbitSource.patch,
    positionedRabbit,
  );
  let root = putRegionalEcologyResidentDeviation(state.root, {
    rootSeed: world.meta.rootSeed,
    patch: stagedFoxPatch,
  });
  root = putRegionalEcologyResidentDeviation(root, {
    rootSeed: world.meta.rootSeed,
    patch: stagedRabbitPatch,
  });
  const activeResidents = state.activeResidents.map((resident) => {
    if (resident.kind === "settlement-home") {
      throw new Error("regional-v26 active resident impersonated settlement home");
    }
    if (resident.sourceKey !== foxSource.sourceKey && resident.sourceKey !== rabbitSource.sourceKey) {
      return { kind: resident.kind, sourceKey: resident.sourceKey, patch: resident.patch };
    }
    const deviation = regionalEcologyResidentDeviation(
      root,
      world.meta.rootSeed,
      resident.region,
    );
    if (deviation === null) throw new Error("regional-v26 contact deviation was not durable");
    return { kind: resident.kind, sourceKey: resident.sourceKey, patch: deviation };
  });
  const stagedState = createRegionalEcologyState({
    root,
    settlementHome: {
      sourceKey: state.settlementHome.sourceKey,
      patch: state.settlementHome.patch,
    },
    activeRegions: state.activeRegions,
    activeResidents,
  });
  const travel = restorePlayerRegionalTravel(
    world.meta.rootSeed,
    envelope.player,
    envelope.regionalTravel,
  );
  if (travel === null) throw new Error("regional-v26 contact fixture lost its regional frame");
  const materialized = setRegionalEcologyMaterializationForWindow(
    stagedState.activeResidents.map(({ sourceKey, patch }) => ({ sourceKey, patch })),
    {
      origin: travel.window.origin,
      terrain: {
        width: travel.window.terrain.width,
        height: travel.window.terrain.height,
      },
    },
    state.updatedAtTick,
  );
  const activeIds = new Set(materialized?.flatMap(({ patch }) => (
    patch.populations.flatMap(({ members }) => members.flatMap(({ actor, materialization }) => (
      materialization === "materialized" ? [actor.identity.stableId] : []
    )))
  )) ?? []);
  if (!activeIds.has(fox.identity.stableId) || !activeIds.has(rabbit.identity.stableId)) {
    throw new Error("regional-v26 contact actors missed global materialization");
  }

  repository.replace({
    ...record,
    worldJson: JSON.stringify(resealV26(envelope, {
      regionalEcology: serializeRegionalEcologyStateV2(createRegionalEcologyStateV2({
        base: stagedState,
        alpineRoot: stateV2.alpineRoot,
        alpineActiveResidents: stateV2.alpineActiveResidents.map(({ sourceKey, patch }) => ({
          sourceKey,
          patch,
        })),
        adoption: stateV2.adoption,
      })),
    })),
  });
  return Object.freeze({
    attackerId: fox.identity.stableId,
    attackerSourceKey: foxSource.sourceKey,
    victimId: rabbit.identity.stableId,
    victimSourceKey: rabbitSource.sourceKey,
    victimPopulationUnits: populationUnits(rabbitSource.patch, "marsh-rabbit"),
  });
}

function crossOwnerContactPosition(
  envelope: V26Envelope,
  state: RegionalEcologyStateV1,
): WorldPosition {
  const world = deserializeWorld(envelope.world);
  const player = structuredClone(envelope.player);
  const travel = restorePlayerRegionalTravel(
    world.meta.rootSeed,
    player,
    envelope.regionalTravel,
  );
  if (travel === null) throw new Error("regional-v26 contact fixture lost regional travel");
  const view = createRegionalWorldView(createWorldView(world), travel.window, {
    discovered: player.discovered,
    depthSoundings: player.depthSoundings,
  });
  const activeKeys = new Set(state.activeRegions.map(regionKey));
  const centerX = Math.trunc(view.terrain.width / 2);
  const centerY = Math.trunc(view.terrain.height / 2);
  const candidates = view.terrain.tiles.map((tile, index) => ({
    index,
    tile,
    distance: (tile.x - centerX) ** 2 + (tile.y - centerY) ** 2,
  })).sort((left, right) => left.distance - right.distance || left.index - right.index);
  for (const { index, tile, distance } of candidates) {
    const address = regionalAddressAt(view, index);
    if (
      // External settlement actors occupy the frame center. Keep this
      // representative wildlife contact beyond their ten-tile detail range.
      distance < 144
      || address === null
      || !activeKeys.has(regionKey(address.region))
      || coreWildlifeTraversabilityCell("marsh-fox", tile).access !== "open"
      || coreWildlifeTraversabilityCell("marsh-rabbit", tile).access !== "open"
    ) continue;
    return createWorldPosition(
      address.region,
      address.localX * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
      address.localY * WORLD_POSITION_UNITS_PER_TILE
        + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    );
  }
  throw new Error("regional-v26 contact fixture found no shared traversable tile");
}

function regionalSource(
  state: RegionalEcologyStateV1,
  sourceKey: string,
): RegionalEcologyResidentSnapshotV1 {
  const source = state.activeResidents.find(
    ({ sourceKey: candidate }) => candidate === sourceKey,
  );
  if (source === undefined) throw new Error(`regional-v26 source ${sourceKey} was lost`);
  return source;
}

function populationUnits(patch: CoreEcologyAggregatePatchState, species: string): number {
  return patch.populations
    .filter((population) => population.species === species)
    .reduce((sum, population) => sum + population.populationSize, 0);
}

function allPhysicalActorIds(state: RegionalEcologyStateV1): readonly string[] {
  return [state.settlementHome, ...state.activeResidents].flatMap(({ patch }) => [
    ...patch.populations.flatMap(({ members }) => (
      members.map(({ actor }) => actor.identity.stableId)
    )),
    ...patch.mortalityTransactions.map(({ retiredActor }) => retiredActor.identity.stableId),
  ]);
}

function duplicateRegionalSource(
  source: RegionalEcologyResidentSnapshotV1,
): RegionalEcologyResidentSnapshotV1 {
  const sourceKey = `${source.sourceKey}:duplicate-physical-owner`;
  const patch = canonicalizeCoreEcologyAggregatePatch({
    ...source.patch,
    patchKey: sourceKey,
  });
  if (patch === null) throw new Error("regional-v26 duplicate fixture was not structural");
  const base = {
    version: source.version,
    kind: source.kind,
    sourceKey,
    region: source.region,
    patchHash: hashCanonical(patch),
    lineageHash: source.lineageHash,
    patch,
  };
  return Object.freeze({ ...base, integrity: hashCanonical(base) });
}

function forgeRegionalStateWithDuplicate(
  state: RegionalEcologyStateV1,
  duplicate: RegionalEcologyResidentSnapshotV1,
): Readonly<Record<string, unknown>> {
  const { integrity: _integrity, ...prior } = state;
  const base = {
    ...prior,
    activeResidents: [...state.activeResidents, duplicate].sort((left, right) => (
      left.sourceKey < right.sourceKey ? -1 : left.sourceKey > right.sourceKey ? 1 : 0
    )),
  };
  return Object.freeze({ ...base, integrity: hashCanonical(base) });
}

function forgeRegionalStateV2WithBase(
  state: RegionalEcologyStateV2,
  base: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const { integrity: _integrity, ...prior } = state;
  const next = { ...prior, base };
  return Object.freeze({ ...next, integrity: hashCanonical(next) });
}

function resealV26(
  envelope: V26Envelope,
  changes: Readonly<Partial<Pick<V26Envelope, "regionalEcology">>>,
): V26Envelope {
  const { integrity: _integrity, ...prior } = envelope;
  const base = { ...prior, ...changes };
  return Object.freeze({
    ...base,
    integrity: gameSaveEnvelopeIntegrity(base as Readonly<Record<string, unknown>>),
  });
}

function requireV26(record: SaveRecord): V26Envelope {
  const value = JSON.parse(record.worldJson) as V26Envelope;
  if (
    value.format !== "tideweft-session"
    || value.version !== 26
    || record.payloadVersion !== 26
    || typeof value.world !== "string"
    || typeof value.regionalEcology !== "string"
  ) throw new Error("fixture did not produce the v26 regional ecology envelope");
  const { integrity, ...unsealed } = value;
  if (integrity !== gameSaveEnvelopeIntegrity(unsealed as Readonly<Record<string, unknown>>)) {
    throw new Error("v26 outer envelope failed its integrity seal");
  }
  return value;
}

function requireRegionalStateV2(envelope: V26Envelope): RegionalEcologyStateV2 {
  const state = deserializeRegionalEcologyStateV2(envelope.regionalEcology);
  if (state === null) throw new Error("v26 regional ecology state did not deserialize");
  return state;
}

function requireRegionalState(envelope: V26Envelope): RegionalEcologyStateV1 {
  return requireRegionalStateV2(envelope).base;
}

function actorContinuity(state: RegionalEcologyStateV1) {
  return [state.settlementHome, ...state.activeResidents].flatMap((resident) => (
    resident.patch.populations.flatMap(({ members }) => members.map(({ actor }) => ({
      sourceKey: resident.sourceKey,
      identity: actor.identity,
      address: actor.address,
      needs: actor.needs,
      condition: actor.condition,
      updatedAtTick: actor.updatedAtTick,
    })))
  )).sort((left, right) => (
    left.identity.stableId < right.identity.stableId
      ? -1
      : left.identity.stableId > right.identity.stableId ? 1 : 0
  ));
}

function uniqueActorIds(state: RegionalEcologyStateV1): Set<string> {
  return new Set(actorContinuity(state).map(({ identity }) => identity.stableId));
}

function createV24SourcePatch(envelope: V26Envelope): CoreEcologyAggregatePatchState {
  const state = requireRegionalState(envelope);
  const home = state.settlementHome.patch;
  if (home.derivation.kind !== "settlement-home-v1") {
    throw new Error("v26 fixture omitted its settlement-home derivation");
  }
  const habitat = home.derivation.habitat;
  const world = deserializeWorld(envelope.world);
  let patch = createCoreEcologyAggregatePatch({
    seed: world.meta.rootSeed,
    patchKey: "wave-a/alarm-crossing",
    originRegion: habitat.originRegion,
    tick: world.meta.completedTick,
    derivation: { kind: "habitat-v11", habitat },
    groups: v24Groups(world.meta.rootSeed, habitat, world.meta.completedTick),
    populations: v24IndividualPopulations(habitat),
  });
  const regionOrigin = regionLocalToGlobalTile(habitat.originRegion, 0, 0);
  const materialized = setCoreEcologyMaterializationForWindow(patch, {
    origin: {
      x: regionOrigin.x - Math.trunc((REGIONAL_TRAVEL_COLUMNS - WORLD_WIDTH) / 2),
      y: regionOrigin.y - Math.trunc((REGIONAL_TRAVEL_ROWS - WORLD_HEIGHT) / 2),
    },
    terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS },
  }, world.meta.completedTick);
  if (materialized === null) throw new Error("v24 fixture materialization was rejected");
  patch = materialized;

  const bear = patch.populations.find(({ species }) => species === "black-bear")?.members[0]?.actor;
  if (bear !== undefined) {
    patch = replaceCoreEcologyAggregatePatchActor(patch, replaceCoreWildlifeActorPhysiology(
      bear,
      {
        atTick: world.meta.completedTick,
        needs: { ...bear.needs, hunger: Math.max(680_000, bear.needs.hunger) },
        condition: bear.condition,
      },
    ));
  }
  const tidal = stepCoreEcologyTidalTable(patch, { atTick: world.meta.completedTick });
  if (tidal === null) throw new Error("v24 fixture tidal initialization was rejected");
  patch = initializeV24Egret(tidal.patch, tidal.projection, world.meta.completedTick);
  patch = initializeV24ActivityActor(patch, "american-black-duck", world.meta.completedTick);
  return initializeV24ActivityActor(
    patch,
    "north-american-river-otter",
    world.meta.completedTick,
  );
}

function v24Groups(
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

function v24IndividualPopulations(
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

function initializeV24Egret(
  patch: CoreEcologyAggregatePatchState,
  projection: NonNullable<ReturnType<typeof stepCoreEcologyTidalTable>>["projection"],
  tick: number,
): CoreEcologyAggregatePatchState {
  if (projection.snowyEgret === null) return patch;
  const actor = coreEcologyAggregatePatchActor(patch, projection.snowyEgret.actorId);
  const day = projectCoreEcologyDayPhase(tick);
  if (actor === null || day === null || actor.identity.species !== "snowy-egret") {
    throw new Error("v24 fixture egret initialization was rejected");
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

function initializeV24ActivityActor(
  patch: CoreEcologyAggregatePatchState,
  species: "american-black-duck" | "north-american-river-otter",
  tick: number,
): CoreEcologyAggregatePatchState {
  const member = patch.populations.find((population) => population.species === species)?.members[0];
  if (member === undefined || member.materialization !== "materialized") return patch;
  const activity = projectCoreEcologyActivity(patch, {
    actorId: member.actor.identity.stableId,
    atTick: tick,
  });
  if (activity === null) throw new Error(`v24 fixture ${species} activity was rejected`);
  if (activity.motion.kind !== "target-area") return patch;
  return replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(member.actor, {
    atTick: tick,
    position: activity.motion.targetArea.center,
    heading: member.actor.address.heading,
  }));
}

function downgradeToV24(
  record: SaveRecord,
  envelope: V26Envelope,
  sourcePatch: CoreEcologyAggregatePatchState,
): { readonly record: SaveRecord; readonly envelope: V24Envelope } {
  const {
    integrity: _v26Integrity,
    regionalEcology: _regionalEcology,
    ...shared
  } = envelope;
  const base: Omit<V24Envelope, "integrity"> = {
    ...shared,
    format: "tideweft-session",
    version: 24,
    world: envelope.world,
    physicalCargo: createV24PhysicalCargo(envelope.player, sourcePatch),
    coreEcology: serializeCoreEcologyAggregatePatch(sourcePatch),
  };
  const legacy: V24Envelope = {
    ...base,
    integrity: gameSaveEnvelopeIntegrity(base as Readonly<Record<string, unknown>>),
  };
  return {
    envelope: legacy,
    record: {
      ...record,
      payloadVersion: 24,
      worldJson: JSON.stringify(legacy),
    },
  };
}

function createV24PhysicalCargo(
  player: PlayerState,
  ecology: CoreEcologyAggregatePatchState,
): SerializedPhysicalCargoState {
  let state = createPhysicalCargoStateFromPlayer(player, WORLD_WIDTH, WORLD_HEIGHT);
  const bear = ecology.populations
    .find(({ species }) => species === "black-bear")
    ?.members[0]?.actor;
  if (bear === undefined) return snapshotPhysicalCargoState(state);
  const target = transitionPhysicalCargoRegion(
    state,
    bear.address.position.region,
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
  const source = quotePhysicalCargoSource(
    target,
    "wildlife-forage",
    `wave-a:${hashCanonical([
      "wave-a/alarm-crossing",
      bear.identity.stableId,
      "dried-fish",
    ])}`,
  );
  const temporary = createLooseCargoCarrier(
    { kind: "unclaimed" },
    createCraftingInventory(PROVISION_DEFINITIONS["dried-fish"].loadMilli),
  );
  const provision = addLooseCargoProvision(temporary, {
    sourceLotId: source.lotId,
    provision: "dried-fish",
    quantity: 1,
    materialState: { condition: FIXED_POINT, contamination: 0, decay: 0 },
  });
  if (!provision.ok) throw new Error(`v24 forage creation failed: ${provision.reason}`);
  const dropped = dropLooseCargo(target.looseWorld, provision.carrier, {
    lotId: source.lotId,
    quantity: 1,
    x: bear.address.position.localX
      * (LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE),
    y: bear.address.position.localY
      * (LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE),
  });
  if (!dropped.ok || dropped.entity === null) {
    throw new Error(`v24 forage placement failed: ${dropped.reason}`);
  }
  state = commitPhysicalCargoRegionalMutation(state, {
    looseWorld: dropped.world,
    carrier: state.carrier,
    committedSourceOrdinal: source.ordinal,
  }, {
    kind: "delta",
    removed: [],
    added: [dropped.entity.payload],
  });
  return snapshotPhysicalCargoState(state);
}

function sourceAuthorityUnits(patch: CoreEcologyAggregatePatchState) {
  return patch.populations.map((population) => ({
    key: `${population.species}:${population.populationKey}`,
    units: population.populationSize,
  })).concat(patch.aggregatePopulations.map((population) => ({
    key: `${population.species}:${population.populationKey}`,
    units: population.populationSize,
  }))).sort((left, right) => left.key.localeCompare(right.key));
}

function adoptionAccountingUnits(state: RegionalEcologyStateV1) {
  const receipt = state.root.adoption;
  return [
    ...(receipt?.populationAccounting ?? []).map((population) => ({
      key: `${population.species}:${population.populationKey}`,
      units: population.sourcePopulationSize,
    })),
    ...(receipt?.aggregateDispositions ?? []).map((population) => ({
      key: `${population.species}:${population.populationKey}`,
      units: population.sourcePopulationSize,
    })),
  ].sort((left, right) => left.key.localeCompare(right.key));
}
