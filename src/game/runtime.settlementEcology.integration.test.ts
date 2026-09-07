import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  deserializeCoreEcologyAggregatePatch,
  serializeCoreEcologyAggregatePatch,
} from "./coreEcology";
import {
  CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_VERSION,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_SPECIES,
  CORE_ECOLOGY_DOMESTIC_YARD_HABITAT_VERSION,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_SPECIES,
  CORE_ECOLOGY_TIDAL_WEB_HABITAT_VERSION,
} from "./coreEcologyHabitat";
import type { CoreEcologySettlementShadowsStimulusFrame } from "./coreEcologySmallWorld";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import {
  canonicalizeSettlementEcologyState,
  deserializeSettlementEcologyState,
  serializeSettlementEcologyState,
} from "./settlementEcology";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  type WorldPosition,
} from "./worldPosition";

const settlementShadowsHarness = vi.hoisted(() => ({
  excludePhysicalFood: false,
  exposeOnlyPhysicalFood: false,
}));
const runtimeEcologyHarness = vi.hoisted(() => ({
  disableDomesticFoodInvestigation: false,
}));

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
  return {
    ...actual,
    // This one integration seam isolates the existing physical-food channel
    // from stronger lawful co-located pressure. Production winner arbitration
    // remains untouched and is covered by the shared small-world kernel tests.
    stepCoreEcologySettlementShadows: (
      ...args: Parameters<typeof actual.stepCoreEcologySettlementShadows>
    ) => {
      if (
        !settlementShadowsHarness.exposeOnlyPhysicalFood
        && !settlementShadowsHarness.excludePhysicalFood
        || args[2] === undefined
      ) {
        return actual.stepCoreEcologySettlementShadows(...args);
      }
      const frame = args[2] as CoreEcologySettlementShadowsStimulusFrame;
      return actual.stepCoreEcologySettlementShadows(args[0], args[1], {
        ...frame,
        stimuli: frame.stimuli.filter(({ sourceKind }) => (
          settlementShadowsHarness.exposeOnlyPhysicalFood
            ? sourceKind === "exposed-food"
            : sourceKind !== "exposed-food"
        )),
      });
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
  runtimeEcologyHarness.disableDomesticFoodInvestigation = false;
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

function requireCoreEcology(encoded: unknown) {
  const state = deserializeCoreEcologyAggregatePatch(encoded);
  if (state === null) throw new Error("runtime fixture omitted canonical core ecology");
  return state;
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
  core: ReturnType<typeof requireCoreEcology>,
  store: ReturnType<typeof deserializeSettlementEcologyState>,
  expected: readonly ExpectedDomesticRepresentative[],
): void {
  expect(store.domesticCustodies).toHaveLength(expected.length);
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
  prior.revision -= 2;
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
    revision: current.revision - 1,
    domesticCustody: {
      ...custodyFields,
      version: 1,
      coopId: structure.structureId,
      homePosition: structure.position,
      homeRadiusUnits: structure.radiusUnits,
    },
  });
}

function downgradeCoreEcologyToTidalWeb(encoded: unknown): string {
  const current = requireCoreEcology(encoded);
  if (
    current.derivation.kind !== "habitat-v9"
    && current.derivation.kind !== "legacy-fixed-v1-with-habitat-v9"
  ) throw new Error("current fixture did not use the domestic-pen habitat");
  const {
    domesticAnchor: _domesticAnchor,
    domesticPenAnchor: _domesticPenAnchor,
    ...habitatFields
  } = current.derivation.habitat;
  const populations = habitatFields.populations.filter(({ species }) => (
    species !== "domestic-chicken" && species !== "domestic-goat"
  ));
  return serializeCoreEcologyAggregatePatch({
    ...current,
    derivation: {
      kind: current.derivation.kind === "habitat-v9"
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
      )),
    },
    populations: current.populations.filter(({ species }) => (
      species !== "domestic-chicken" && species !== "domestic-goat"
    )),
  });
}

function downgradeCoreEcologyToDomesticYard(encoded: unknown): string {
  const current = requireCoreEcology(encoded);
  if (
    current.derivation.kind !== "habitat-v9"
    && current.derivation.kind !== "legacy-fixed-v1-with-habitat-v9"
  ) throw new Error("current fixture did not use the domestic-pen habitat");
  const { domesticPenAnchor: _domesticPenAnchor, ...habitatFields } =
    current.derivation.habitat;
  const populations = habitatFields.populations.filter(({ species }) => (
    species !== "domestic-goat"
  ));
  return serializeCoreEcologyAggregatePatch({
    ...current,
    derivation: {
      kind: current.derivation.kind === "habitat-v9"
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
      )),
    },
    populations: current.populations.filter(({ species }) => (
      species !== "domestic-goat"
    )),
  });
}

function asStorehouseV16Record(currentRecord: SaveRecord): SaveRecord {
  const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
  if (current.version !== 18) throw new Error("fixture is not a current save");
  const { integrity: _integrity, ...currentFields } = current;
  const priorBase = {
    ...currentFields,
    version: 16,
    coreEcology: downgradeCoreEcologyToTidalWeb(current.coreEcology),
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
  if (current.version !== 18) throw new Error("fixture is not a current save");
  const { integrity: _integrity, ...currentFields } = current;
  const priorBase = {
    ...currentFields,
    version: 17,
    coreEcology: downgradeCoreEcologyToDomesticYard(current.coreEcology),
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
  const core = lastEnvelope === undefined ? undefined : requireCoreEcology(lastEnvelope.coreEcology);
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
    expect(record.payloadVersion).toBe(18);
    expect(envelope.version).toBe(18);
    expect(Object.keys(envelope).sort()).toEqual([
      "bio0Ecology",
      "coreEcology",
      "fieldResources",
      "format",
      "integrity",
      "livingActorPlayerChoice",
      "perceptionCarry",
      "physicalCargo",
      "player",
      "porterResponse",
      "promiseJourney",
      "regionalTravel",
      "session",
      "settlementEcology",
      "traversalFeedback",
      "version",
      "world",
    ]);
    const state = deserializeSettlementEcologyState(envelope.settlementEcology);
    const core = requireCoreEcology(envelope.coreEcology);
    if (
      core.derivation.kind !== "habitat-v9"
      && core.derivation.kind !== "legacy-fixed-v1-with-habitat-v9"
    ) throw new Error("current save omitted its v9 domestic habitat");
    expect(core.derivation.habitat.generationVersion)
      .toBe(CORE_ECOLOGY_DOMESTIC_PEN_HABITAT_VERSION);
    expect(state.version).toBe(3);
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
    expect(migratedRecord.payloadVersion).toBe(18);
    expect(migratedEnvelope.version).toBe(18);
    expect(migratedEnvelope.settlementEcology).toBe(controlEnvelope.settlementEcology);
    for (const field of [
      "world",
      "player",
      "session",
      "fieldResources",
      "traversalFeedback",
      "physicalCargo",
      "regionalTravel",
      "promiseJourney",
      "perceptionCarry",
      "bio0Ecology",
      "coreEcology",
      "porterResponse",
      "livingActorPlayerChoice",
    ]) {
      expect(migratedEnvelope[field], field).toEqual(controlEnvelope[field]);
    }
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

  it("migrates an exact v16 store and appends both authenticated domestic custodies once", async () => {
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
    const priorCore = requireCoreEcology(v16Envelope.coreEcology);
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
    const migratedCore = requireCoreEcology(migratedEnvelope.coreEcology);
    expect(migratedRecord.payloadVersion).toBe(18);
    expect(migratedEnvelope.version).toBe(18);
    expect(migratedStore.version).toBe(3);
    for (const field of PRIOR_SETTLEMENT_ECOLOGY_FIELDS) {
      expect(migratedStoreRecord[field], field).toEqual(priorStore[field]);
    }
    expect(migratedStore.revision).toBe((priorStore.revision as number) + 2);
    expect(migratedStore.identity).toEqual(priorStore.identity);
    expect(migratedStore.carrier).toEqual(priorStore.carrier);
    expect(migratedStore.closure).toBe("secured");
    expect(migratedStore.keeperKnowledge).toHaveLength(1);

    if (
      migratedCore.derivation.kind !== "habitat-v9"
      && migratedCore.derivation.kind !== "legacy-fixed-v1-with-habitat-v9"
    ) throw new Error("v16 migration omitted its authenticated domestic append");
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
    expect(migratedCore.populations.filter(({ species }) => (
      species !== "domestic-chicken" && species !== "domestic-goat"
    ))).toEqual(priorCore.populations);
    expect(migratedCore.groups.groups.filter(({ identity }) => (
      identity.species !== "domestic-chicken"
      && identity.species !== "domestic-goat"
    ))).toEqual(priorCore.groups.groups);
    expect(migratedCore.aggregatePopulations).toEqual(priorCore.aggregatePopulations);
    if (
      priorCore.derivation.kind !== "habitat-v7"
      && priorCore.derivation.kind !== "legacy-fixed-v1-with-habitat-v7"
    ) throw new Error("v16 fixture lost its tidal-web derivation");
    expect(migratedCore.derivation.habitat.populations.slice(
      0,
      priorCore.derivation.habitat.populations.length,
    )).toEqual(priorCore.derivation.habitat.populations);
    expect(migratedCore.derivation.habitat.tidalAnchors)
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

    const committedCore = migratedEnvelope.coreEcology;
    const committedStore = migratedEnvelope.settlementEcology;
    migrated.destroy();
    const reloaded = await createTideweftRuntime(migratedRepository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    await reloaded.save();
    const replayEnvelope = savedEnvelope(migratedRepository);
    expect(replayEnvelope.coreEcology).toBe(committedCore);
    expect(replayEnvelope.settlementEcology).toBe(committedStore);
    const replayCore = requireCoreEcology(replayEnvelope.coreEcology);
    const replayStore = deserializeSettlementEcologyState(replayEnvelope.settlementEcology);
    expect(replayCore).toEqual(migratedCore);
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
    const priorCore = requireCoreEcology(v17Envelope.coreEcology);
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
    const migratedCore = requireCoreEcology(migratedEnvelope.coreEcology);
    if (
      migratedCore.derivation.kind !== "habitat-v9"
      && migratedCore.derivation.kind !== "legacy-fixed-v1-with-habitat-v9"
    ) throw new Error("v17 migration omitted the plural domestic habitat");
    expect(migratedRecord.payloadVersion).toBe(18);
    expect(migratedEnvelope.version).toBe(18);
    expect(migratedStore.version).toBe(3);
    expect(migratedStore.revision).toBe((priorStore.revision as number) + 1);
    expect(migratedStore.identity).toEqual(priorStore.identity);
    expect(migratedStore.carrier).toEqual(priorStore.carrier);

    expect(migratedCore.populations).toHaveLength(priorCore.populations.length + 1);
    expect(migratedCore.groups.groups).toHaveLength(priorCore.groups.groups.length + 1);
    expect(migratedCore.populations.filter(({ species }) => (
      species !== "domestic-goat"
    ))).toEqual(priorCore.populations);
    expect(migratedCore.groups.groups.filter(({ identity }) => (
      identity.species !== "domestic-goat"
    ))).toEqual(priorCore.groups.groups);
    expect(migratedCore.aggregatePopulations).toEqual(priorCore.aggregatePopulations);
    expect(migratedCore.derivation.habitat.populations.slice(
      0,
      priorCore.derivation.habitat.populations.length,
    )).toEqual(priorCore.derivation.habitat.populations);
    expect(migratedCore.derivation.habitat.tidalAnchors)
      .toEqual(priorCore.derivation.habitat.tidalAnchors);
    expect(migratedCore.derivation.habitat.domesticAnchor)
      .toEqual(priorCore.derivation.habitat.domesticAnchor);

    const migratedChickenPopulation = migratedCore.populations.find(({ species }) => (
      species === "domestic-chicken"
    ));
    const migratedChickenGroup = migratedCore.groups.groups.find(({ identity }) => (
      identity.species === "domestic-chicken"
    ));
    const migratedChickenCustody = migratedStore.domesticCustodies.find(({ species }) => (
      species === "domestic-chicken"
    ));
    if (
      migratedChickenPopulation === undefined
      || migratedChickenGroup === undefined
      || migratedChickenCustody === undefined
    ) throw new Error("v17 migration rewrote its chicken authority");
    expect(JSON.stringify(migratedChickenPopulation))
      .toBe(JSON.stringify(priorChickenPopulation));
    expect(JSON.stringify(migratedChickenGroup)).toBe(JSON.stringify(priorChickenGroup));
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

    const committedCore = migratedEnvelope.coreEcology;
    const committedStore = migratedEnvelope.settlementEcology;
    migrated.destroy();
    const reloaded = await createTideweftRuntime(migratedRepository);
    expect(reloaded.getUIView().saveWarning).toBeUndefined();
    await reloaded.save();
    const replayEnvelope = savedEnvelope(migratedRepository);
    expect(replayEnvelope.coreEcology).toBe(committedCore);
    expect(replayEnvelope.settlementEcology).toBe(committedStore);
    reloaded.destroy();
  });

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
    const initialCore = requireCoreEcology(initialEnvelope.coreEcology);
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
    const witnessedCore = requireCoreEcology(witnessedUse.envelope.coreEcology);
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
    const securedCore = requireCoreEcology(securedEnvelope.coreEcology);
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
  }, 30_000);

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
