import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { createWorldView, deserializeWorld, serializeWorld } from "../sim/public";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_MAX_POPULATIONS,
  canonicalizeCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  deserializeOrMigrateCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import { projectCoreEcologyActivity } from "./coreEcologyActivity";
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
  type CoreEcologyRegionalUplandHabitatAssemblage,
  type CoreEcologyTidalWebHabitatAssemblage,
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
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
} from "./worldPosition";
import { livingActorAddressInRegionalWindow } from "./livingActor";
import {
  deserializeSettlementDomesticAnimalRecoveryState,
} from "./settlementDomesticAnimalRecovery";

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
  readonly version: 24;
  readonly world: string;
  readonly player: PlayerState;
  readonly physicalCargo: SerializedPhysicalCargoState;
  readonly bio0Ecology: string;
  readonly coreEcology: string;
  readonly settlementEcology: string;
  readonly dogActorRoster: string;
  readonly settlementWorkingAnimals: string;
  readonly settlementDomesticAnimalRecovery: string;
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

      const durableCore = envelope.coreEcology;
      runtime.destroy();
      scheduledFrame = undefined;
      const resumed = await createTideweftRuntime(repository);
      expect(resumed.getUIView().saveWarning, seed).toBeUndefined();
      await resumed.save();
      expect(requiredEnvelope(repository).coreEcology, seed).toBe(durableCore);
      resumed.destroy();
      scheduledFrame = undefined;
    }
  }, 120_000);

  it("migrates a sealed v20 save into v24 without inventing mortality history", async () => {
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
      settlementDomesticAnimalRecovery: expectedEmptyRecovery,
      version: _currentVersion,
      ...establishedV20Roots
    } = current;
    const v20Base = {
      ...establishedV20Roots,
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

    expect(adoptedRecord.payloadVersion).toBe(24);
    expect(durableAdoptedRoots).toEqual(durableV20Roots);
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
  });

  it("migrates a sealed v21 save into the empty v24 mortality ledger exactly once", async () => {
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
    const { integrity: _integrity, version: _version, ...durableRoots } = current;
    const v21Base = {
      ...durableRoots,
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
    expect(adoptedRecord.payloadVersion).toBe(24);
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

    const durableCore = adopted.coreEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(durableCore);
    resumed.destroy();
  });

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
      settlementEcology: _currentSettlementEcology,
      dogActorRoster: _currentDogActorRoster,
      settlementWorkingAnimals: _currentSettlementWorkingAnimals,
      settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
      ...currentBase
    } = current;
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
    expect(repository.snapshot().payloadVersion).toBe(24);
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
    expect(v13Record.payloadVersion).toBe(24);
    expect(v13Ecology.derivation.kind).toBe("habitat-v11");
    expect(v13Envelope.world).toBe(v10Envelope.world);
    expect(v13Envelope.player).toEqual(v10Envelope.player);
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

    const stableEcology = v13Envelope.coreEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(stableEcology);
    resumed.destroy();
  });

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
    expect(v13Record.payloadVersion).toBe(24);
    expect(v13Ecology.derivation.kind).toBe("habitat-v11");
    expect(v13Envelope.world).toBe(v11Envelope.world);
    expect(v13Envelope.player).toEqual(v11Envelope.player);
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

    const stableEcology = v13Envelope.coreEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(stableEcology);
    resumed.destroy();
  });

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
    expect(v13Record.payloadVersion).toBe(24);
    expect(v13Ecology.derivation.kind).toBe("habitat-v11");
    expect(v13Envelope.world).toBe(v12Envelope.world);
    expect(v13Envelope.player).toEqual(v12Envelope.player);
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

    const stableEcology = v13Envelope.coreEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(stableEcology);
    resumed.destroy();
  });

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
    expect(adoptedRecord.payloadVersion).toBe(24);
    expect(adopted.derivation.kind).toBe("habitat-v11");
    expect(adoptedEnvelope.world).toBe(v13Envelope.world);
    expect(adoptedEnvelope.player).toEqual(v13Envelope.player);
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
    ))).toEqual(currentDuck);

    const stableEcology = adoptedEnvelope.coreEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(stableEcology);
    resumed.destroy();
  });

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
    expect(adoptedRecord.payloadVersion).toBe(24);
    expect(adopted.derivation.kind).toBe("habitat-v11");
    expect(adoptedEnvelope.world).toBe(v14Envelope.world);
    expect(adoptedEnvelope.player).toEqual(v14Envelope.player);
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

    const stableEcology = adoptedEnvelope.coreEcology;
    migrated.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(stableEcology);
    resumed.destroy();
  });

  it("creates a reachable snowy egret and advances its first real runtime tick", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "egret-runtime-audit-1",
      posture: "gale",
      sessionShape: "wander",
    });
    await runtime.save();

    const beforeEnvelope = requiredEnvelope(repository);
    const beforeWorld = deserializeWorld(beforeEnvelope.world);
    const before = requiredCore(beforeEnvelope);
    const beforeEgret = before.populations.find(({ species }) => species === "snowy-egret")
      ?.members[0]?.actor;
    if (beforeEgret === undefined) {
      throw new Error("Reachability fixture omitted its bounded snowy egret");
    }
    expect(beforeWorld.meta.completedTick).toBe(0);
    expect(beforeEgret.updatedAtTick).toBe(0);
    expect(projectCoreEcologyActivity(before, {
      actorId: beforeEgret.identity.stableId,
      atTick: 0,
    })).toMatchObject({
      species: "snowy-egret",
      state: "resting",
      preferredNeutralIntent: "rest",
      motion: { kind: "hold-position" },
    });

    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const afterEnvelope = requiredEnvelope(repository);
    const afterWorld = deserializeWorld(afterEnvelope.world);
    const after = requiredCore(afterEnvelope);
    const afterEgret = after.populations.find(({ species }) => species === "snowy-egret")
      ?.members[0]?.actor;
    if (afterEgret === undefined) throw new Error("Snowy egret vanished on its first tick");
    expect(afterWorld.meta.completedTick).toBe(1);
    expect(after.updatedAtTick).toBe(1);
    expect(afterEgret.identity).toEqual(beforeEgret.identity);
    expect(afterEgret.updatedAtTick).toBe(1);
    expect(afterEgret.address.position).toEqual(beforeEgret.address.position);
    expect(afterEgret.intent.kind).toBe("rest");
    expect(projectCoreEcologyActivity(after, {
      actorId: afterEgret.identity.stableId,
      atTick: 1,
    })).toMatchObject({
      species: "snowy-egret",
      state: "resting",
      preferredNeutralIntent: "rest",
      motion: { kind: "hold-position" },
    });

    const durable = afterEnvelope.coreEcology;
    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(durable);
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
      const {
        integrity: _currentIntegrity,
        settlementEcology: _currentSettlementEcology,
        dogActorRoster: _currentDogActorRoster,
        settlementWorkingAnimals: _currentSettlementWorkingAnimals,
        settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
        ...currentBase
      } = current;
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

  it("quarantines a legacy ecology nested inside a current v24 envelope", async () => {
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

  it("quarantines an Alpha-19 aggregate record masquerading inside a current v24 envelope", async () => {
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
    await repository.save({ ...record, worldJson: JSON.stringify(masquerading) });
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
      settlementEcology: _currentSettlementEcology,
      dogActorRoster: _currentDogActorRoster,
      settlementWorkingAnimals: _currentSettlementWorkingAnimals,
      settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
      ...currentBase
    } = current;
    const masqueradingBase = { ...currentBase, version: 13 as const };
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
    expect(before.version).toBe(24);
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
    // Food memories record lawful perception/intent, not custody. Rain Chorus
    // adds another scavenger which may notice the same parcel before the
    // sorted physical claim resolver awards its single unit to the bear.
    expect(foodMemories.length).toBeGreaterThan(0);
    expect(foodMemories.some(({ actor }) => actor.identity.species === "black-bear"))
      .toBe(true);

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
    const cargo = requiredCargo(envelope);
    const provision = forageProvisions(cargo)[0];
    if (provision === undefined) throw new Error("crow fixture omitted its physical provision");
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
    const prepared = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save({ ...record, worldJson: JSON.stringify(prepared) });
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
    expect(locatePhysicalCargoEntity(beforeContactCargo, provision.id)).not.toBeNull();
    expect(consumptionHistory(beforeContactCargo)).toHaveLength(baselineHistory);
    expect(beforeContactCargo.expectedManifest.totalQuantity).toBe(baselineManifest);
    expect(beforeContactCrow.needs.hunger).toBeGreaterThanOrEqual(hungryCrow.needs.hunger);
    const initialDistance = worldPositionDelta(crowStart, provisionPosition);
    const approachedDistance = worldPositionDelta(
      beforeContactCrow.address.position,
      provisionPosition,
    );
    expect(Math.hypot(approachedDistance.x, approachedDistance.y))
      .toBeLessThan(Math.hypot(initialDistance.x, initialDistance.y));

    let contactEnvelope: CurrentEnvelope | null = null;
    let lastPreContactHunger = beforeContactCrow.needs.hunger;
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

    const durableCore = contactEnvelope.coreEcology;
    const durableCargo = contactEnvelope.physicalCargo;
    const durableCrowFoodMemoryCount = crowFoodMemories.length;
    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    const reloaded = requiredEnvelope(repository);
    expect(reloaded.coreEcology).toBe(durableCore);
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
  });

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
    const cargo = requiredCargo(envelope);
    const provision = forageProvisions(cargo)[0];
    if (provision === undefined) throw new Error("Harrier food-boundary fixture omitted provision");
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
    const prepared = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save({ ...record, worldJson: JSON.stringify(prepared) });
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
  });

  it("executes a displaced crow's authenticated perch return, rest, and reload", async () => {
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
    const calmCrow = replaceCoreWildlifeActorPhysiology(crow, {
      atTick: patch.updatedAtTick,
      needs: { hunger: 0, safety: 0, rest: 0 },
      condition: { health: 1_000_000, exhaustion: 0, stress: 0 },
    });
    const crowStart = translateWorldPosition(
      perch,
      2 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(calmCrow, {
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
    expect(projectCoreEcologyActivity(patch, {
      actorId: crow.identity.stableId,
      atTick: patch.updatedAtTick,
    })).toMatchObject({
      state: "seeking-perch",
      motion: { kind: "target-area", verb: "seek-perch" },
    });
    const prepared = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save({ ...record, worldJson: JSON.stringify(prepared) });
    initial.destroy();
    scheduledFrame = undefined;

    const runtime = await createTideweftRuntime(repository);
    const initialDelta = worldPositionDelta(crowStart, perch);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    let saved = requiredEnvelope(repository);
    let savedCore = requiredCore(saved);
    let savedCrow = coreActors(savedCore).find(
      ({ identity }) => identity.stableId === crow.identity.stableId,
    );
    if (savedCrow === undefined) throw new Error("Crow vanished during perch return");
    let delta = worldPositionDelta(savedCrow.address.position, perch);
    expect(Math.hypot(delta.x, delta.y))
      .toBeLessThan(Math.hypot(initialDelta.x, initialDelta.y));

    for (let step = 0; step < 4; step += 1) {
      const activity = projectCoreEcologyActivity(savedCore, {
        actorId: crow.identity.stableId,
        atTick: savedCore.updatedAtTick,
      });
      if (activity?.state === "perched" && savedCrow.intent.kind === "rest") break;
      advancePlayerSteps(runtime, 10);
      await runtime.save();
      saved = requiredEnvelope(repository);
      savedCore = requiredCore(saved);
      savedCrow = coreActors(savedCore).find(
        ({ identity }) => identity.stableId === crow.identity.stableId,
      );
      if (savedCrow === undefined) throw new Error("Crow vanished before resting at its perch");
    }
    delta = worldPositionDelta(savedCrow.address.position, perch);
    expect(Math.max(Math.abs(delta.x), Math.abs(delta.y))).toBeLessThanOrEqual(
      Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    );
    expect(savedCrow.intent.kind).toBe("rest");
    expect(projectCoreEcologyActivity(savedCore, {
      actorId: crow.identity.stableId,
      atTick: savedCore.updatedAtTick,
    })).toMatchObject({
      state: "perched",
      preferredNeutralIntent: "rest",
      motion: { kind: "hold-position" },
    });

    const durableCore = saved.coreEcology;
    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(durableCore);
    resumed.destroy();
  });

  it("keeps a selected perched crow's runtime ABOUT posture in render parity", async () => {
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
    const patch = requiredCore(envelope);
    const crow = patch.populations.find(({ species }) => species === "fish-crow")
      ?.members[0]?.actor;
    if (crow === undefined) throw new Error("Crow ABOUT fixture omitted its fish crow");
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
    const prepared = resealedEnvelope(envelope, { player });
    await repository.save({ ...record, worldJson: JSON.stringify(prepared) });
    initial.destroy();
    scheduledFrame = undefined;

    const runtime = await createTideweftRuntime(repository);
    const renderCrow = runtime.getRenderView().wildlife?.find(({ actorId }) => (
      actorId === crow.identity.stableId
    ));
    expect(renderCrow).toMatchObject({
      species: "fish-crow",
      behavior: "perch",
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
    expect(selection?.quick.summary).toContain("Perched");
    expect(selection?.about.observed).toContainEqual({
      label: "Visible group",
      value: `About ${renderCrow.groupSize}`,
    });
    expect(selection?.about.observed).toContainEqual({
      label: "Behavior",
      value: "Perched",
    });
    runtime.destroy();
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
      .toContain("SMALL RUSTLE — beside the signs you can see.");
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

  it(`${ALPHA30_BODY_BEARING_SAVE_ADOPTION_OWNER_INTENT} adopts one body-bearing v22 save exactly once`, async () => {
    const {
      runtime,
      repository,
      foxActorId,
      rabbitActorId,
    } = await createFoxEventBoundaryRuntime({ lethalContact: true });
    const before = requiredCore(requiredEnvelope(repository));
    const beforeRabbitPopulation = before.populations.find(
      ({ species }) => species === "marsh-rabbit",
    );
    const beforeRabbit = coreActors(before).find(
      ({ identity }) => identity.stableId === rabbitActorId,
    );
    if (beforeRabbitPopulation === undefined || beforeRabbit === undefined) {
      throw new Error("mortality fixture omitted its living rabbit");
    }
    expect(beforeRabbit.condition.health).toBe(500_000);
    expect(before.mortalityTransactions).toEqual([]);
    expect(before.carcasses).toEqual([]);

    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const afterEnvelope = requiredEnvelope(repository);
    const after = requiredCore(afterEnvelope);
    const afterRabbitPopulation = after.populations.find(
      ({ species }) => species === "marsh-rabbit",
    );
    if (afterRabbitPopulation === undefined) {
      throw new Error("mortality removed the rabbit population record");
    }
    expect(coreActors(after).some(({ identity }) => identity.stableId === rabbitActorId))
      .toBe(false);
    expect(afterRabbitPopulation.baselinePopulationSize)
      .toBe(beforeRabbitPopulation.baselinePopulationSize);
    expect(afterRabbitPopulation.populationSize)
      .toBe(beforeRabbitPopulation.populationSize - 1);
    expect(afterRabbitPopulation.reserveUnits)
      .toBe(beforeRabbitPopulation.reserveUnits + beforeRabbitPopulation.members[0]!.representedUnits - 1);
    expect(after.mortalityTransactions).toHaveLength(1);
    expect(after.mortalityTransactions[0]).toMatchObject({
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
    expect(after.carcasses).toHaveLength(1);
    expect(after.carcasses[0]).toMatchObject({
      sourceActorId: rabbitActorId,
      sourceSpecies: "marsh-rabbit",
      bodySizeUnits: 3,
      originalResourceUnits: 4,
      remainingResourceUnits: 4,
    });

    // The next ordinary cognition/resource tick must use that exact body as a
    // finite physical food source. This is one representative end-to-end
    // composition proof for the shared capability seam, not a species-pair
    // matrix: policy decides who may feed, while the carcass owner conserves
    // the resource and the actor owner receives only the consumed unit.
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const afterFeedingEnvelope = requiredEnvelope(repository);
    const afterFeeding = requiredCore(afterFeedingEnvelope);
    expect(afterFeeding.carcasses[0]).toMatchObject({
      carcassId: after.carcasses[0]!.carcassId,
      originalResourceUnits: 4,
      remainingResourceUnits: 3,
      consumedResourceUnits: 1,
      currentClaimantActorId: foxActorId,
    });
    expect(coreActors(afterFeeding).find(
      ({ identity }) => identity.stableId === foxActorId,
    )?.needs.hunger).toBeLessThan(1_000_000);

    const alpha29Core = domesticPenCoreEcologyFromCurrent(afterFeeding);
    const { integrity: _currentIntegrity, ...alpha29EnvelopeRoots } = afterFeedingEnvelope;
    const alpha29Base = {
      ...alpha29EnvelopeRoots,
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
    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    await resumed.save();
    const adoptedEnvelope = requiredEnvelope(repository);
    const adopted = requiredCore(adoptedEnvelope);
    expect(repository.snapshot().payloadVersion).toBe(24);
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
    const durableCore = adoptedEnvelope.coreEcology;
    resumed.destroy();
    scheduledFrame = undefined;
    const secondResume = await createTideweftRuntime(repository);
    await secondResume.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(durableCore);
    const alreadyAdoptedRecord = repository.snapshot();
    const alreadyAdoptedEnvelope = requiredEnvelope(repository);
    const { integrity: _alreadyAdoptedIntegrity, ...alreadyAdoptedRoots } = alreadyAdoptedEnvelope;
    const replayedV22Base = {
      ...alreadyAdoptedRoots,
      version: 22 as const,
    };
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
  });

  it(`${ALPHA31_BODY_BEARING_SAVE_ADOPTION_OWNER_INTENT} adopts one sealed body-bearing v23 save exactly once`, async () => {
    const {
      runtime,
      repository,
      foxActorId,
      rabbitActorId,
    } = await createFoxEventBoundaryRuntime({ lethalContact: true });

    advancePlayerSteps(runtime, 20);
    await runtime.save();
    const currentEnvelope = requiredEnvelope(repository);
    const current = requiredCore(currentEnvelope);
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
    const { integrity: _currentIntegrity, version: _currentVersion, ...alpha30Roots } =
      currentEnvelope;
    const alpha30Base = {
      ...alpha30Roots,
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
    runtime.destroy();
    scheduledFrame = undefined;

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    await resumed.save();
    const adoptedEnvelope = requiredEnvelope(repository);
    const adopted = requiredCore(adoptedEnvelope);
    expect(repository.snapshot().payloadVersion).toBe(24);
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

    for (const key of Object.keys(alpha30Base).filter((key) => (
      key !== "version" && key !== "coreEcology" && key !== "session"
    ))) {
      expect(stableStringify(adoptedEnvelope[key]), key)
        .toBe(stableStringify(alpha30Base[key as keyof typeof alpha30Base]));
    }

    const durable = adoptedEnvelope.coreEcology;
    resumed.destroy();
    scheduledFrame = undefined;
    const secondResume = await createTideweftRuntime(repository);
    expect(secondResume.getUIView().saveWarning).toBeUndefined();
    await secondResume.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(durable);
    secondResume.destroy();
  });

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

    let envelope = requiredEnvelope(repository);
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

    let patch = requiredCore(envelope);
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
      const nextEnvelope = resealedEnvelope(sourceEnvelope, {
        world: serializeWorld(sourceWorld),
        player,
        coreEcology: serializeCoreEcologyAggregatePatch(sourcePatch),
      });
      const record = repository.snapshot();
      await repository.save({ ...record, worldJson: JSON.stringify(nextEnvelope) });
    };

    patch = setCoreEcologyAggregatePatchMaterializedActors(patch, {
      atTick: patch.updatedAtTick,
      actorIds: [...rabbitGroupIds, ...wolfGroupIds],
    });
    let displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      const isRabbit = actor.identity.stableId === rabbitId;
      const isPackWolf = packWolfIds.has(actor.identity.stableId);
      let positioned = repositionCoreWildlifeActor(actor, {
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
    await saveStage(envelope, world, patch);
    initial.destroy();
    scheduledFrame = undefined;

    // Current unobstructed sight creates pack-member pursuit, but four tiles
    // of separation remain outside the exact mortality contact radius.
    let runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    envelope = requiredEnvelope(repository);
    patch = requiredCore(envelope);
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
    patch = requiredCore(envelope);
    displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      const isRabbit = actor.identity.stableId === rabbitId;
      const isPackWolf = packWolfIds.has(actor.identity.stableId);
      const positioned = repositionCoreWildlifeActor(actor, {
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
    await saveStage(envelope, world, patch);
    runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    envelope = requiredEnvelope(repository);
    patch = requiredCore(envelope);
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
    patch = requiredCore(envelope);
    const contactPackPosition = translateWorldPosition(preyPosition, -direction * 400, 0);
    displacedOrdinal = 0;
    for (const actor of coreActors(patch)) {
      const isRabbit = actor.identity.stableId === rabbitId;
      const isPackWolf = packWolfIds.has(actor.identity.stableId);
      let positioned = repositionCoreWildlifeActor(actor, {
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
    const rabbitUnitsBefore = rabbitPopulation.populationSize;
    await saveStage(envelope, world, patch);
    runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    envelope = requiredEnvelope(repository);
    patch = requiredCore(envelope);
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
    patch = requiredCore(envelope);
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
      let positioned = repositionCoreWildlifeActor(actor, {
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
    await saveStage(envelope, world, patch);
    runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    envelope = requiredEnvelope(repository);
    patch = requiredCore(envelope);
    const fedBody = patch.carcasses.find(({ carcassId }) => carcassId === body.carcassId);
    const fedBoar = coreActors(patch).find(({ identity }) => identity.stableId === boarId);
    expect(patch.mortalityTransactions).toHaveLength(1);
    expect(patch.carcasses).toHaveLength(1);
    expect(fedBody).toMatchObject({
      carcassId: body.carcassId,
      originalResourceUnits: 4,
      remainingResourceUnits: 3,
      consumedResourceUnits: 1,
      currentClaimantActorId: null,
      claimProvenanceId: null,
    });
    expect(fedBoar?.intent.kind).toBe("scavenge");
    expect(fedBoar?.needs.hunger).toBeLessThan(1_000_000);
    const durableCore = envelope.coreEcology;
    runtime.destroy();
    scheduledFrame = undefined;

    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(requiredEnvelope(repository).coreEcology).toBe(durableCore);
    resumed.destroy();
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
    const startTile = compatibilityTileAtPosition(world, otterPosition);
    expect(startTile.waterDepth).toBeGreaterThan(ADRIFT_STAND_DEPTH);

    const prepared = resealedEnvelope(envelope, {
      world: serializeWorld(world),
      coreEcology: serializeCoreEcologyAggregatePatch(patch),
    });
    await repository.save({ ...record, worldJson: JSON.stringify(prepared) });
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
    expect(Math.abs(movement.x) + Math.abs(movement.y)).toBeGreaterThan(0);
    expect(compatibilityTileAtPosition(savedWorld, movedOtter.address.position).waterDepth)
      .toBeGreaterThan(ADRIFT_STAND_DEPTH);
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
  const alarmGroup = patch.groups.groups.find(({ identity, memberOrdinals }) => (
    identity.species === alarmActor.identity.species
    && identity.populationKey === alarmActor.identity.populationKey
    && memberOrdinals.includes(alarmActor.identity.populationOrdinal)
  ));
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
      || actor.identity.stableId === bear.identity.stableId) continue;
    const isAlarmMate = alarmGroupMemberIds.has(actor.identity.stableId);
    patch = replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(actor, {
      atTick: patch.updatedAtTick,
      position: isAlarmMate
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
    }));
    if (isAlarmMate) alarmMateOrdinal += 1;
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
    settlementEcology: _currentSettlementEcology,
    dogActorRoster: _currentDogActorRoster,
    settlementWorkingAnimals: _currentSettlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
    ...currentBase
  } = decoded;
  const v10Base = {
    ...currentBase,
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
    settlementEcology: _currentSettlementEcology,
    dogActorRoster: _currentDogActorRoster,
    settlementWorkingAnimals: _currentSettlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
    ...currentBase
  } = decoded;
  const v11Base = {
    ...currentBase,
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
    settlementEcology: _currentSettlementEcology,
    dogActorRoster: _currentDogActorRoster,
    settlementWorkingAnimals: _currentSettlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
    ...currentBase
  } = decoded;
  const v12Base = {
    ...currentBase,
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
    settlementEcology: _currentSettlementEcology,
    dogActorRoster: _currentDogActorRoster,
    settlementWorkingAnimals: _currentSettlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
    ...currentBase
  } = decoded;
  const v13Base = {
    ...currentBase,
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
    settlementEcology: _currentSettlementEcology,
    dogActorRoster: _currentDogActorRoster,
    settlementWorkingAnimals: _currentSettlementWorkingAnimals,
    settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
    ...currentBase
  } = decoded;
  const v14Base = {
    ...currentBase,
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
  if (value.format !== "tideweft-session" || value.version !== 24) {
    throw new Error("core-ecology runtime fixture did not save a v24 envelope");
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

async function createFoxEventBoundaryRuntime(
  options: Readonly<{ lethalContact?: boolean }> = {},
): Promise<Readonly<{
  runtime: TideweftRuntime;
  repository: MemoryRepository;
  foxActorId: string;
  rabbitActorId: string;
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
  const rabbitPosition = options.lethalContact
    ? translateWorldPosition(foxPosition, direction * 400, 0)
    : worldPositionAtWindowTile(
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
    repository,
    foxActorId: fox.identity.stableId,
    rabbitActorId: rabbit.identity.stableId,
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
  if (state === null) throw new Error("v13 save omitted canonical core ecology");
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
