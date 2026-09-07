import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import type { CoreEcologySettlementShadowsStimulusFrame } from "./coreEcologySmallWorld";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import {
  canonicalizeSettlementEcologyState,
  deserializeSettlementEcologyState,
  serializeSettlementEcologyState,
} from "./settlementEcology";

const settlementShadowsHarness = vi.hoisted(() => ({ exposeOnlyPhysicalFood: false }));

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
      if (!settlementShadowsHarness.exposeOnlyPhysicalFood || args[2] === undefined) {
        return actual.stepCoreEcologySettlementShadows(...args);
      }
      const frame = args[2] as CoreEcologySettlementShadowsStimulusFrame;
      return actual.stepCoreEcologySettlementShadows(args[0], args[1], {
        ...frame,
        stimuli: frame.stimuli.filter(({ sourceKind }) => sourceKind === "exposed-food"),
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
  settlementShadowsHarness.exposeOnlyPhysicalFood = false;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
    expect(record.payloadVersion).toBe(16);
    expect(envelope.version).toBe(16);
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
    const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
    const currentStore = current.settlementEcology;
    const controlRepository = new MemoryRepository(currentRecord);
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
    } = current;
    const v15Base = { ...v15Fields, version: 15 };
    const v15Record: SaveRecord = {
      ...currentRecord,
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
    expect(migratedRecord.payloadVersion).toBe(16);
    expect(migratedEnvelope.version).toBe(16);
    expect(migratedEnvelope.settlementEcology).toBe(currentStore);
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

    const illegalV15Base = { ...current, version: 15 };
    const illegalRepository = new MemoryRepository({
      ...currentRecord,
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

  it("consumes exactly one stored unit after the shared rat-attraction event and never on save replay", async () => {
    settlementShadowsHarness.exposeOnlyPhysicalFood = true;
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
