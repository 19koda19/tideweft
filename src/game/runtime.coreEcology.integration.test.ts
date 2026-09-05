import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { createWorldView, deserializeWorld, serializeWorld } from "../sim/public";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  CORE_ECOLOGY_HARBOR_EDGE_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES,
  CORE_ECOLOGY_HARBOR_EDGE_HABITAT_VERSION,
  canonicalizeCoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import { deserializeBio0Ecology } from "./bio0Ecology";
import {
  canonicalizeCoreWildlifeActorState,
  createCoreWildlifeActorState,
  repositionCoreWildlifeActor,
  replaceCoreWildlifeActorPhysiology,
  type CoreWildlifeActorState,
} from "./coreWildlifeActor";
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
import { restorePlayerRegionalTravel } from "./regionalPlayerTravel";
import type { RegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import { ADRIFT_STAND_DEPTH } from "./adrift";
import {
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
} from "./worldPosition";

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

interface CurrentEnvelope {
  readonly format: "tideweft-session";
  readonly version: 11;
  readonly world: string;
  readonly player: PlayerState;
  readonly physicalCargo: SerializedPhysicalCargoState;
  readonly bio0Ecology: string;
  readonly coreEcology: string;
  readonly regionalTravel: string;
  readonly integrity: string;
  readonly [key: string]: unknown;
}

class MemoryRepository implements SaveRepository {
  private record: SaveRecord | undefined;

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
    const legacy = publishedV8CoreEcologyFixture(current);
    const { integrity: _currentIntegrity, ...currentBase } = current;
    const v8Base = { ...currentBase, version: 8 as const, coreEcology: legacy.text };
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
    expect(repository.snapshot().payloadVersion).toBe(11);
    expect(adoptedCore.derivation.kind).toBe("legacy-fixed-v1-with-habitat-v3");
    expect(adoptedCore.groups.groups).toEqual([]);
    const retainedPopulations = adoptedCore.populations.filter(({ species }) => (
      species === "deer" || species === "gull" || species === "black-bear"
    ));
    expect(retainedPopulations.flatMap(({ members }) => members.map(({ actor }) => actor)))
      .toEqual(legacy.actors);
    expect(retainedPopulations.every((population) => (
      population.populationSize === population.members.length
      && population.members.every(({ representedUnits }) => representedUnits === 1)
    ))).toBe(true);
    expect(adoptedCore.populations.filter(({ species }) => species === "domestic-cat"))
      .toHaveLength(1);
    expect(adoptedCore.aggregatePopulations.filter(({ species }) => species === "brown-rat"))
      .toHaveLength(1);
    expect(new Set(coreActors(adoptedCore).map(({ identity }) => identity.stableId)).size)
      .toBe(coreActors(adoptedCore).length);
    expect(adopted.physicalCargo).toEqual(current.physicalCargo);

    const adoptedText = adopted.coreEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(adoptedText);
    resumed.destroy();
  });

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
    const v10Ecology = deserializeCoreEcologyAggregatePatch(v10Envelope.coreEcology);
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
    const v11Record = repository.snapshot();
    const v11Envelope = requiredEnvelope(repository);
    const v11Ecology = requiredCore(v11Envelope);
    expect(v11Record.payloadVersion).toBe(11);
    expect(v11Ecology.derivation.kind).toBe("habitat-v3");
    expect(v11Envelope.world).toBe(v10Envelope.world);
    expect(v11Envelope.player).toEqual(v10Envelope.player);
    expect(v11Envelope.physicalCargo).toEqual(v10Envelope.physicalCargo);
    expect(v11Envelope.promiseJourney).toEqual(v10Envelope.promiseJourney);
    expect(v11Envelope.bio0Ecology).toBe(v10Envelope.bio0Ecology);
    expect(v11Ecology.groups).toEqual(v10Ecology.groups);
    expect(v11Ecology.aggregatePopulations).toEqual(v10Ecology.aggregatePopulations);
    for (const oldPopulation of v10Ecology.populations) {
      expect(v11Ecology.populations.find(({ species, populationKey }) => (
        species === oldPopulation.species && populationKey === oldPopulation.populationKey
      ))).toEqual(oldPopulation);
    }
    if (
      v11Ecology.derivation.kind !== "habitat-v3"
      || v10Ecology.derivation.kind !== "habitat-v2"
    ) throw new Error("migration did not retain canonical habitat derivations");
    expect(v11Ecology.derivation.habitat.populations.slice(
      0,
      CORE_ECOLOGY_HARBOR_EDGE_HABITAT_SPECIES.length,
    )).toEqual(v10Ecology.derivation.habitat.populations);

    const stableEcology = v11Envelope.coreEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(stableEcology);
    resumed.destroy();
  });

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
      const { integrity: _currentIntegrity, ...currentBase } = current;
      const v8Base = { ...currentBase, version: 8 as const, coreEcology: legacy.text };
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
  });

  it("quarantines a legacy ecology nested inside a current v11 envelope", async () => {
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
    await repository.save({ ...record, worldJson: JSON.stringify(masquerading) });
    initial.destroy();
    scheduledFrame = undefined;

    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().title.hasSave).toBe(false);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  });

  it("renders lawful wildlife and persists one reaction plus one physical meal across reload", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "wildlife alarm crossing",
      posture: "gale",
      sessionShape: "wander",
    });

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
    const beforeCargo = requiredCargo(before);
    const seededProvisions = forageProvisions(beforeCargo);
    expect(before.version).toBe(11);
    expect(beforeWorld.meta.completedTick).toBe(0);
    expect(beforeCore.updatedAtTick).toBe(0);
    expect(seededProvisions).toHaveLength(1);
    expect(consumptionHistory(beforeCargo)).toEqual([]);
    expect(beforeCargo.expectedManifest.totalQuantity).toBe(1);

    advancePlayerSteps(runtime, 30);
    await runtime.save();
    const after = requiredEnvelope(repository);
    const afterWorld = deserializeWorld(after.world);
    const afterCore = requiredCore(after);
    const afterCargo = requiredCargo(after);
    expect(afterWorld.meta.completedTick).toBe(3);
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
    expect(foodMemories).toHaveLength(1);
    expect(foodMemories[0]?.actor.identity.species).toBe("black-bear");

    const durableCore = after.coreEcology;
    const durableCargo = after.physicalCargo;
    runtime.destroy();
    scheduledFrame = undefined;

    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    const reloaded = requiredEnvelope(repository);
    expect(reloaded.coreEcology).toBe(durableCore);
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
  });

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
    const evidence = view.aggregateWildlifeEvidence?.[0];
    if (evidence === undefined) throw new Error("Settlement-shadows fixture has no visible sign");
    if (evidence.species !== "brown-rat" || evidence.representation !== "population-evidence") {
      throw new Error("Settlement-shadows fixture first sign is not selectable rat evidence");
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

  it("sounds and captions rat displacement only when its new sign is directly perceived", async () => {
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

    advancePlayerSteps(runtime, 80);

    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rat-rustle")).toHaveLength(1);
    expect(runtime.getUIView().announcement?.message)
      .toBe("SMALL RUSTLE — beside the signs you can see.");
    runtime.destroy();
  });

  it("plays and captions only event-time alarm hearing, including an unseen caller", async () => {
    const { runtime, alarmActorId } = await createAlarmRuntime(-8);
    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === alarmActorId))
      .toBe(false);
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toHaveLength(1);
    expect(runtime.getUIView().announcement?.message).toBe("ANIMAL ALARM — source unclear.");
    runtime.destroy();
  });

  it("does not turn direct visual alarm knowledge into out-of-range audio", async () => {
    const { runtime, alarmActorId } = await createAlarmRuntime(10);
    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === alarmActorId))
      .toBe(true);
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "wildlife-alarm")).toEqual([]);
    expect(runtime.getUIView().announcement?.message).not.toBe("ANIMAL ALARM — source unclear.");
    runtime.destroy();
  });

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
      direction * 6 * WORLD_POSITION_UNITS_PER_TILE,
      -2 * WORLD_POSITION_UNITS_PER_TILE,
    );
    const foxPosition = translateWorldPosition(
      playerPosition,
      direction * 6 * WORLD_POSITION_UNITS_PER_TILE,
      2 * WORLD_POSITION_UNITS_PER_TILE,
    );

    let patch = requiredCore(envelope);
    const rabbit = patch.populations
      .find(({ species }) => species === "marsh-rabbit")?.members[0]?.actor;
    const fox = patch.populations
      .find(({ species }) => species === "marsh-fox")?.members[0]?.actor;
    if (rabbit === undefined || fox === undefined) {
      throw new Error("marsh-edge cue fixture omitted its rabbit/fox web");
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
    const nextEnvelope = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      player,
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save({ ...record, worldJson: JSON.stringify(nextEnvelope) });
    initial.destroy();
    scheduledFrame = undefined;

    const runtime = await createTideweftRuntime(repository);
    soundscapePlay.mockClear();
    advancePlayerSteps(runtime, 10);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump"))
      .toHaveLength(1);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip"))
      .toHaveLength(1);
    expect(runtime.getUIView().announcement?.message)
      .toBe("[soft thump nearby] [brief yip nearby]");

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

    const durableCore = after.coreEcology;
    runtime.destroy();
    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(durableCore);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "rabbit-thump"))
      .toHaveLength(0);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip"))
      .toHaveLength(0);
    resumed.destroy();
  });

  it("retains a fox pursuit cue witnessed at its event locus when the fox moves out of view", async () => {
    const { runtime, foxActorId } = await createFoxEventBoundaryRuntime();
    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === foxActorId))
      .toBe(true);
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    expect(runtime.getRenderView().wildlife?.some(({ actorId }) => actorId === foxActorId))
      .toBe(false);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "fox-yip"))
      .toHaveLength(1);
    runtime.destroy();
  });

  it("routes a selected flee target away from a closed frame edge", async () => {
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
    const world = deserializeWorld(envelope.world);
    makeWorldDryAndClear(world);
    const player = structuredClone(envelope.player);
    const regional = restorePlayerRegionalTravel(world.meta.rootSeed, player, envelope.regionalTravel);
    if (regional === null) throw new Error("escape fixture could not restore its regional frame");
    const regionalWorld = createRegionalWorldView(
      createWorldView(world),
      regional.window,
      { discovered: player.discovered, depthSoundings: player.depthSoundings },
    );
    const escapeTile = findOpenLeftEdgeEscapeTile(regionalWorld);
    const deerPosition = worldPositionAtWindowTile(regional.window, escapeTile.index);
    const alarmPosition = worldPositionAtWindowTile(regional.window, escapeTile.index + 1);
    let patch = requiredCore(envelope);
    const deer = patch.populations.find(({ species }) => species === "deer")?.members[0]?.actor;
    const gull = patch.populations.find(({ species }) => species === "gull")?.members[0]?.actor;
    if (deer === undefined || gull === undefined) throw new Error("escape fixture lost actors");
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(deer, {
      atTick: patch.updatedAtTick,
      position: deerPosition,
      heading: 0,
    }));
    const alarmGull = canonicalizeCoreWildlifeActorState({
      ...repositionCoreWildlifeActor(gull, {
        atTick: patch.updatedAtTick,
        position: alarmPosition,
        heading: 500_000,
      }),
      intent: {
        kind: "alarm",
        cause: { kind: "condition", referenceId: "condition:fixture-alarm" },
        focusObservationId: null,
        resourceReference: null,
        enteredAtTick: patch.updatedAtTick,
        expiresAtTick: patch.updatedAtTick + 1,
      },
    });
    if (alarmGull === null) throw new Error("escape fixture alarm state was not canonical");
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
    const nextEnvelope = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      player,
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save({ ...record, worldJson: JSON.stringify(nextEnvelope) });
    initial.destroy();
    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);

    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const movedDeer = coreActors(requiredCore(requiredEnvelope(repository)))
      .find(({ identity }) => identity.stableId === deer.identity.stableId);
    if (movedDeer === undefined) throw new Error("escaped deer was not persisted");
    const movement = worldPositionDelta(deerPosition, movedDeer.address.position);
    expect(movedDeer.intent.kind).toBe("flee");
    expect(movement.x).toBe(0);
    expect(movement.y).toBeLessThan(0);
    runtime.destroy();
  });

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
    const startTile = compatibilityTileAtPosition(world, deer.address.position);
    expect(startTile.waterDepth).toBeGreaterThan(0);
    expect(startTile.waterDepth).toBeLessThanOrEqual(ADRIFT_STAND_DEPTH);

    const nextEnvelope = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save({ ...record, worldJson: JSON.stringify(nextEnvelope) });
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
  });

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
    const originalProvision = forageProvisions(cargo)[0];
    if (originalProvision === undefined) throw new Error("seam fixture lost seeded provision");
    const originalLocation = locatePhysicalCargoEntity(cargo, originalProvision.id);
    if (originalLocation === null) throw new Error("seam fixture could not locate seeded provision");
    const removed = consumeLooseCargoProvisionEntity(originalLocation.world, {
      actorId: bear.identity.stableId,
      entityId: originalProvision.id,
      x: originalProvision.x,
      y: originalProvision.y,
      reach: 0,
    });
    if (!removed.ok || removed.removedPayload === null) {
      throw new Error(`seam fixture removal failed: ${removed.reason}`);
    }
    cargo = commitPhysicalCargoRegionalMutation(cargo, {
      looseWorld: removed.world,
      carrier: cargo.carrier,
    }, {
      kind: "delta",
      removed: [removed.removedPayload],
      added: [],
    });
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
    const nextEnvelope = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      player,
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
      physicalCargo: snapshotPhysicalCargoState(cargo),
    });
    await repository.save({ ...record, worldJson: JSON.stringify(nextEnvelope) });
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
    expect(consumptionHistory(afterCargo)).toHaveLength(1);
    const exactActorX = (
      (BigInt(movedBear.address.position.region.x) - BigInt(seam.right.region.x))
        * BigInt(REGION_WIDTH_UNITS)
      + BigInt(movedBear.address.position.localX)
    ) * BigInt(LOOSE_CARGO_TILE_UNITS / WORLD_POSITION_UNITS_PER_TILE);
    expect(BigInt(cargoX) - exactActorX).toBe(750_999n);
    runtime.destroy();
  });
});

async function createAlarmRuntime(offsetTiles: -8 | 10): Promise<{
  runtime: TideweftRuntime;
  alarmActorId: string;
}> {
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
  const world = deserializeWorld(envelope.world);
  makeWorldDryAndClear(world);
  const player = structuredClone(envelope.player);
  player.facingMilliRadians = 0;
  const regional = restorePlayerRegionalTravel(world.meta.rootSeed, player, envelope.regionalTravel);
  if (regional === null) throw new Error("alarm fixture could not restore its regional frame");
  const playerPosition = playerWorldPositionInRegionalWindow(regional.window, player);
  if (playerPosition === null) throw new Error("alarm fixture could not locate its player");
  let patch = requiredCore(envelope);
  const alarmActor = patch.populations.find(({ species }) => species === "deer")?.members[0]?.actor;
  const bear = patch.populations.find(({ species }) => species === "black-bear")?.members[0]?.actor;
  if (alarmActor === undefined || bear === undefined) {
    throw new Error("alarm fixture lost its deer or bear");
  }
  const alarmPosition = translateWorldPosition(
    playerPosition,
    offsetTiles * WORLD_POSITION_UNITS_PER_TILE,
    0,
  );
  const bearPosition = translateWorldPosition(
    alarmPosition,
    (offsetTiles < 0 ? 1 : -1) * WORLD_POSITION_UNITS_PER_TILE,
    0,
  );
  patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(alarmActor, {
    atTick: patch.updatedAtTick,
    position: alarmPosition,
    heading: offsetTiles < 0 ? 0 : 500_000,
  }));
  patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(bear, {
    atTick: patch.updatedAtTick,
    position: bearPosition,
    heading: offsetTiles < 0 ? 500_000 : 0,
  }));
  for (const actor of coreActors(patch)) {
    if (actor.identity.stableId === alarmActor.identity.stableId
      || actor.identity.stableId === bear.identity.stableId) continue;
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
      atTick: patch.updatedAtTick,
      position: translateWorldPosition(
        playerPosition,
        (80 + actor.identity.populationOrdinal * 2) * WORLD_POSITION_UNITS_PER_TILE,
        20 * WORLD_POSITION_UNITS_PER_TILE,
      ),
      heading: actor.address.heading,
    }));
  }
  const nextEnvelope = resealedEnvelope(envelope, {
    world: serializeWorld(world),
    player,
    coreEcology: serializeCoreEcologyAggregatePatch(patch),
  });
  await repository.save({ ...record, worldJson: JSON.stringify(nextEnvelope) });
  initial.destroy();
  scheduledFrame = undefined;
  const runtime = await createTideweftRuntime(repository);
  return { runtime, alarmActorId: alarmActor.identity.stableId };
}

function harborEdgeV10Record(current: SaveRecord): SaveRecord {
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const envelope = decoded as unknown as CurrentEnvelope;
  let ecology = requiredCore(envelope);
  if (ecology.derivation.kind !== "habitat-v3") {
    throw new Error("fresh migration source omitted marsh-edge habitat v3");
  }
  const habitat = ecology.derivation.habitat;
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
    species !== "marsh-rabbit" && species !== "marsh-fox"
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
      species !== "marsh-rabbit" && species !== "marsh-fox"
    )),
  });
  if (v10Ecology === null) {
    throw new Error("fixture could not reconstruct the canonical v10 ecology state");
  }
  const { integrity: _integrity, ...currentBase } = decoded;
  const v10Base = {
    ...currentBase,
    version: 10,
    coreEcology: serializeCoreEcologyAggregatePatch(v10Ecology),
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

function requiredEnvelope(repository: MemoryRepository): CurrentEnvelope {
  const value = JSON.parse(repository.snapshot().worldJson) as CurrentEnvelope;
  if (value.format !== "tideweft-session" || value.version !== 11) {
    throw new Error("core-ecology runtime fixture did not save a v11 envelope");
  }
  return value;
}

function resealedEnvelope(
  envelope: CurrentEnvelope,
  changes: Partial<Pick<CurrentEnvelope, "coreEcology" | "physicalCargo" | "player" | "world">>,
): CurrentEnvelope {
  const unsealed = { ...envelope, ...changes, integrity: "" };
  return Object.freeze({
    ...unsealed,
    integrity: gameSaveEnvelopeIntegrity(unsealed),
  });
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

function makeWorldTraceableAndClear(world: ReturnType<typeof deserializeWorld>): void {
  makeWorldDryAndClear(world);
  for (const tile of world.terrain.tiles) tile.moisture = 900_000;
}

async function createFoxEventBoundaryRuntime(): Promise<Readonly<{
  runtime: TideweftRuntime;
  foxActorId: string;
}>> {
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
  makeWorldDryAndClear(world);
  const player = structuredClone(envelope.player);
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
  const foxOffset = 10;
  const rabbitOffset = 12;
  const foxPosition = worldPositionAtWindowTile(
    regional.window,
    playerIndex + direction * foxOffset,
  );
  const rabbitPosition = worldPositionAtWindowTile(
    regional.window,
    playerIndex + direction * rabbitOffset,
  );

  let patch = requiredCore(envelope);
  const rabbit = patch.populations
    .find(({ species }) => species === "marsh-rabbit")?.members[0]?.actor;
  const fox = patch.populations
    .find(({ species }) => species === "marsh-fox")?.members[0]?.actor;
  if (rabbit === undefined || fox === undefined) {
    throw new Error("fox event-locus fixture omitted its rabbit/fox web");
  }
  patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(rabbit, {
    atTick: patch.updatedAtTick,
    position: rabbitPosition,
    heading: direction > 0 ? 500_000 : 0,
  }));
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
        -direction * (20 + displacedOrdinal) * WORLD_POSITION_UNITS_PER_TILE,
        (displacedOrdinal % 5 - 2) * WORLD_POSITION_UNITS_PER_TILE,
      ),
      heading: actor.address.heading,
    }));
    displacedOrdinal += 1;
  }
  const nextEnvelope = resealedEnvelope(envelope, {
    world: serializeWorld(world),
    player,
    coreEcology: serializeCoreEcologyAggregatePatch(patch),
  });
  await repository.save({ ...record, worldJson: JSON.stringify(nextEnvelope) });
  initial.destroy();
  scheduledFrame = undefined;
  return Object.freeze({
    runtime: await createTideweftRuntime(repository),
    foxActorId: fox.identity.stableId,
  });
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

function findOpenLeftEdgeEscapeTile(
  world: ReturnType<typeof createRegionalWorldView>,
): { readonly index: number } {
  const width = world.terrain.width;
  for (let y = 5; y < world.terrain.height - 1; y += 1) {
    const indexes = [
      y * width,
      y * width + 1,
      (y - 1) * width,
      (y - 2) * width,
      (y - 3) * width,
      (y - 4) * width,
    ];
    if (indexes.every((index) => {
      const tile = world.terrain.tiles[index];
      return tile !== undefined
        && tile.terrain !== "deep-water"
        && tile.waterDepth <= ADRIFT_STAND_DEPTH;
    })) return Object.freeze({ index: y * width });
  }
  throw new Error("escape fixture could not find an open left-edge route");
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
  const state = deserializeCoreEcologyAggregatePatch(envelope.coreEcology);
  if (state === null) throw new Error("v11 save omitted canonical core ecology");
  return state;
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
  const current = requiredCore(envelope);
  if (current.derivation.kind !== "habitat-v3") {
    throw new Error("fresh marsh-edge fixture has no v3 habitat derivation");
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

function coreActors(state: CoreEcologyAggregatePatchState): readonly CoreWildlifeActorState[] {
  return state.populations.flatMap(({ members }) => members.map(({ actor }) => actor));
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

function advancePlayerSteps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
}
