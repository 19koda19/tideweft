import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { assertWorldInvariants, createWorldView, deserializeWorld, serializeWorld, type WorldState } from "../sim/public";
import { residentRestTargetHasDrySupport } from "../sim/residentActivityWorld";
import { queryResidentAttentionState } from "../sim/residentAttention";
import { tideAtTick } from "../sim/terrain";
import type { PlayerState } from "./player";
import { deserializeBio0Ecology } from "./bio0Ecology";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { restorePlayerRegionalTravel, capturePlayerRegionalTravel, serializePlayerRegionalTravel } from "./regionalPlayerTravel";
import { regionLocalToWindowTile } from "./regionalTravel";
import { resolveResidentWorldPlacement, playerWorldPositionInRegionalWindow } from "./residentSpatial";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { CURRENT_GAME_SAVE_VERSION } from "./saveCompatibilityPolicy";
import {
  deserializeSettlementEcologyState, serializeSettlementEcologyState,
  stageSettlementDomesticFoodUse, resolveSettlementDomesticFoodUse,
  SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
} from "./settlementEcology";
import * as keeperInspection from "./settlementKeeperInspection";
import * as expressionChannels from "./situatedExpressionChannelBank";
import { WORLD_POSITION_UNITS_PER_TILE, worldPositionDelta, type WorldPosition } from "./worldPosition";

const soundscapePlay = vi.hoisted(() => vi.fn());
vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

interface Envelope extends Record<string, unknown> {
  format: "tideweft-session";
  version: number;
  world: string;
  player: PlayerState;
  regionalTravel: string;
  settlementEcology: string;
  bio0Ecology: string;
  perceptionCarry: {
    version: number;
    playerStepsSinceWorldTick: number;
    intervalStartPosition: WorldPosition;
    intervalStartFacingMilliRadians: number;
    actorVocalizationSamples: readonly { sourceActorId: string }[];
    situatedExpressionAdmissions: { records: readonly { kind: string }[] };
  };
  integrity: string;
}

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {
    this.record = record === undefined ? undefined : structuredClone(record);
  }
  async list() { return []; }
  async load(id: string) { return id === "autosave" ? structuredClone(this.record) : undefined; }
  async save(record: SaveRecord) { this.record = structuredClone(record); }
  async remove() { this.record = undefined; }
  snapshot(): SaveRecord {
    if (this.record === undefined) throw new Error("Keeper fixture has no current save");
    return structuredClone(this.record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime = 100;
const runtimes = new Set<TideweftRuntime>();
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
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open(repository: MemoryRepository): Promise<TideweftRuntime> {
  const runtime = await createTideweftRuntime(repository);
  runtimes.add(runtime);
  expect(runtime.getUIView().saveWarning).toBeUndefined();
  return runtime;
}
function close(runtime: TideweftRuntime): void {
  runtime.destroy();
  runtimes.delete(runtime);
  scheduledFrame = undefined;
}
function advance(runtime: TideweftRuntime, steps: number, expectedFailure = false): void {
  runtime.start();
  // One ordinary clock-establishing RAF, followed by exactly the accepted steps.
  for (let frame = 0; frame <= steps; frame += 1) {
    const callback = scheduledFrame;
    if (callback === undefined) throw new Error("Keeper runtime stopped scheduling ordinary play");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
  if (!expectedFailure) expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
}
function decode(record: SaveRecord): Envelope {
  const result = JSON.parse(record.worldJson) as Envelope;
  expect(record.payloadVersion).toBe(CURRENT_GAME_SAVE_VERSION);
  expect(result.version).toBe(CURRENT_GAME_SAVE_VERSION);
  expect(result.integrity).toBe(gameSaveEnvelopeIntegrity(result));
  return result;
}
function recordWith(record: SaveRecord, envelope: Envelope): SaveRecord {
  envelope.integrity = gameSaveEnvelopeIntegrity(envelope);
  return { ...record, payloadVersion: envelope.version, worldJson: JSON.stringify(envelope) };
}
function roots(envelope: Envelope): unknown {
  // Reload starts a session recap; all world/physical/perception roots remain exact.
  const { session: _session, integrity: _integrity, ...authoritative } = envelope;
  return authoritative;
}
function keeper(world: WorldState, actorId: string) {
  const result = world.residents.find(({ identity }) => identity.stableId === actorId);
  if (result === undefined) throw new Error("Native keeper disappeared");
  return result;
}

/**
 * Native bootstrap retains real store, identity, BIO0, custody and terrain.
 * Only pressure/weather/offer/recipe and optional initial supply are controlled. No successful
 * body, task, intention, sight receipt, arrival or closure is assigned.
 */
async function fixture(mode: "work" | "rest" = "work", initialMaterialShortage = false) {
  for (const seed of ["resident activity executable rest approach", "a", "settlement keeper home night continuity"]) {
    const repository = new MemoryRepository();
    const setup = await open(repository);
    setup.dispatchUI({ type: "new-world", seed, posture: "gale", sessionShape: "wander" });
    await setup.save();
    const record = repository.snapshot();
    const envelope = decode(record);
    const world = deserializeWorld(envelope.world);
    const store = deserializeSettlementEcologyState(envelope.settlementEcology);
    const human = keeper(world, store.identity.keeperActorId);
    const source = resolveResidentWorldPlacement(world, human)?.position;
    const target = store.identity.position;
    const dry = source !== undefined && residentRestTargetHasDrySupport(world, source)
      && Array.from({ length: 9 }, (_, offset) => residentRestTargetHasDrySupport(
        { ...world, tide: tideAtTick(world.meta.completedTick + offset) }, target,
      )).every(Boolean);
    if (!dry || source === undefined || human.activeContractId !== null) {
      close(setup);
      continue;
    }
    expect(world.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    const delta = worldPositionDelta(source, target);
    expect(Math.abs(delta.x) + Math.abs(delta.y)).toBe(WORLD_POSITION_UNITS_PER_TILE);
    world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: world.meta.completedTick + 1_000 };
    for (const resident of world.residents) {
      // Genuine unrelated belonging priority prevents incidental civic motion.
      resident.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
      resident.condition.exhaustion = 100_000;
    }
    human.needs = { food: 100_000, rest: mode === "rest" ? 900_000 : 100_000, belonging: mode === "rest" ? 100_000 : 400_000 };
    human.condition.exhaustion = mode === "rest" ? 300_000 : 100_000;
    for (const contract of world.contracts) {
      contract.playerExclusiveUntilTick = world.meta.completedTick + 1_000;
      contract.dueTick = world.meta.completedTick + 2_000;
    }
    for (const settlement of world.settlements) {
      for (const recipe of settlement.recipes) recipe.nextRunTick = world.meta.completedTick + 1_000;
    }
    if (initialMaterialShortage) {
      const home = world.settlements.find(({ id }) => id === store.identity.settlementId);
      if (home === undefined || home.project.status !== "building"
        || home.project.resource === "food" || home.project.resource === "freshWater") {
        throw new Error("Keeper shortage fixture requires an existing non-ration project");
      }
      // Declared initial aggregate supply, not a consumption action. The
      // independent finite physical store lot and every resident remain native.
      world.ledger.initial[home.project.resource] -= home.inventory[home.project.resource];
      home.inventory[home.project.resource] = 0;
    }
    assertWorldInvariants(world);
    envelope.world = serializeWorld(world);
    const prepared = recordWith(record, envelope);
    close(setup);
    return { record: prepared, actorId: human.identity.stableId, source, target, tick: world.meta.completedTick };
  }
  throw new Error("Three native seeds lack a dry keeper approach; no geometry or arrival was invented");
}

/** Real finite setup transactions, not a claim of ordinary animal feeding. */
function exhaustStoreFood(store: ReturnType<typeof deserializeSettlementEcologyState>, tick: number) {
  const custody = store.domesticCustodies.find(({ species }) => species === "domestic-chicken");
  if (custody === undefined) throw new Error("Native store lacks its authenticated domestic custody");
  for (let use = 0; use < 8; use += 1) {
    const staged = stageSettlementDomesticFoodUse(store, {
      version: SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
      storeId: store.identity.storeId, foodLotId: store.identity.foodLotId,
      relationshipId: custody.relationshipId, memberActorId: custody.memberActorIds[0]!,
      requestedQuantity: 1, causeEventId: `keeper-source-absence:setup:${use}`,
      causeEventTick: tick - 7 + use,
    });
    if (staged === null) throw new Error("Finite setup use could not be staged");
    const resolved = resolveSettlementDomesticFoodUse(staged.state, staged.transaction);
    if (resolved === null || !resolved.applied) throw new Error("Finite setup use could not consume its real unit");
    store = resolved.state;
  }
  expect(store.carrier.lots).toEqual([]);
  expect(store.carrier.retiredLotIds).toEqual([store.identity.foodLotId]);
  expect(store.lastResolvedDomesticFoodUseOrdinal).toBe(8);
  return store;
}

/** Find the native closing interval, retaining its actual unconsumed phase9. */
async function closingFixture() {
  const base = await fixture();
  const repository = new MemoryRepository(base.record);
  const runtime = await open(repository);
  for (let interval = 0; interval < 8; interval += 1) {
    advance(runtime, 9);
    await runtime.save();
    const beforeRecord = repository.snapshot();
    const before = decode(beforeRecord);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(deserializeSettlementEcologyState(before.settlementEcology).closure).toBe("open");
    advance(runtime, 1);
    await runtime.save();
    const after = decode(repository.snapshot());
    if (deserializeSettlementEcologyState(after.settlementEcology).closure === "secured") {
      close(runtime);
      return { ...base, beforeRecord, before, after };
    }
  }
  close(runtime);
  throw new Error("Native keeper did not secure its observed store within eight ordinary intervals");
}

describe("ordinary autonomous keeper inspection", () => {
  it.each([true, false])("admits native store evidence independently of unavailable civic material (finite food=%s)", async (foodAvailable) => {
    const base = await fixture("work", true);
    const envelope = decode(base.record);
    const originalStore = deserializeSettlementEcologyState(envelope.settlementEcology);
    const initialStore = foodAvailable ? originalStore : exhaustStoreFood(originalStore, base.tick);
    envelope.settlementEcology = serializeSettlementEcologyState(initialStore);
    const repository = new MemoryRepository(recordWith(base.record, envelope));
    const runtime = await open(repository);

    // First interval precedes any admitted store knowledge. Its actual material
    // shortage must prevent incidental delivery movement or synthetic arrival.
    advance(runtime, 9);
    await runtime.save();
    const before = decode(repository.snapshot());
    const beforeWorld = deserializeWorld(before.world);
    const beforeKeeper = keeper(beforeWorld, base.actorId);
    expect(before.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(beforeWorld.meta.completedTick).toBe(base.tick);
    expect(beforeKeeper.intention).toBe("work");
    expect(beforeKeeper.activity?.restTask).toBeNull();
    expect(beforeKeeper.activity?.rationTask).toBeNull();
    expect(beforeKeeper.activity?.materialTask).toMatchObject({
      phase: "waiting", waitReason: "no-material", target: base.target,
    });
    expect(beforeKeeper.activity?.poses).toHaveLength(10);
    expect(beforeKeeper.activity?.poses.map(({ position }) => position))
      .toEqual(Array.from({ length: 10 }, () => base.source));
    expect(deserializeSettlementEcologyState(before.settlementEcology).keeperKnowledge).toEqual([]);

    advance(runtime, 1);
    await runtime.save();
    const after = decode(repository.snapshot());
    const afterWorld = deserializeWorld(after.world);
    const afterKeeper = keeper(afterWorld, base.actorId);
    const afterStore = deserializeSettlementEcologyState(after.settlementEcology);
    expect(afterWorld.meta.completedTick).toBe(base.tick + 1);
    expect(after.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(afterKeeper.activity?.poses).toHaveLength(1);
    expect(afterKeeper.activity?.poses[0]?.position).toEqual(base.source);
    expect(afterStore.closure).toBe("open");
    expect(afterStore.lastClosureTransactionId).toBeNull();
    const home = afterWorld.settlements.find(({ id }) => id === originalStore.identity.settlementId);
    if (home === undefined) throw new Error("Keeper evidence fixture lost its real settlement");
    expect(home.inventory[home.project.resource]).toBe(0);
    if (foodAvailable) {
      expect(afterStore.keeperKnowledge).toHaveLength(1);
      const knowledge = afterStore.keeperKnowledge[0]!;
      expect(knowledge).toMatchObject({
        source: "direct-observation", sourceActorId: base.actorId,
        learnedAtTick: base.tick + 1,
      });
      expect(afterKeeper.perception.beliefs.find(({ sourceObservationId }) => sourceObservationId === knowledge.evidenceId))
        .toMatchObject({
          channel: "vision", perceivedClass: "exposed-food", identification: "identified",
          subjectId: originalStore.identity.foodLotId, lastObservedTick: base.tick + 1,
        });
    } else {
      expect(afterStore).toEqual(initialStore);
      expect(afterKeeper.perception.beliefs.some(({ subjectId }) => subjectId === initialStore.identity.foodLotId)).toBe(false);
    }
    assertWorldInvariants(beforeWorld);
    assertWorldInvariants(afterWorld);
    // This verifies the producer/knowledge precondition, not dedicated
    // inspection movement, source acquisition or rendered normal-play proof.
  }, 60_000);

  it("uses a real existing material approach and direct sight to secure the unchanged physical store silently", async () => {
    const base = await fixture();
    const initialBio0 = deserializeBio0Ecology(decode(base.record).bio0Ecology);
    if (initialBio0 === null) throw new Error("Native keeper lost its independent dog");
    expect(initialBio0.dog.address.position).toEqual(base.target);
    const repository = new MemoryRepository(base.record);
    const runtime = await open(repository);
    const original = keeperInspection.advanceSettlementKeeperStoreInspection;
    let committed = false;
    const trace: unknown[] = [];
    const inspection = vi.spyOn(keeperInspection, "advanceSettlementKeeperStoreInspection").mockImplementation((input) => {
      const result = original(input);
      const current = keeper(input.world, base.actorId);
      trace.push(structuredClone({ tick: input.world.meta.completedTick, observations: input.observations,
        attention: queryResidentAttentionState(current.perception),
        focus: current.perception.beliefs.find(({ key }) => key === current.perception.attentionKeys[0]),
        intention: current.intention, needs: current.needs, condition: current.condition,
        circadian: current.circadian, activity: current.activity, response: input.porterResponse.intent,
        result: result?.closure }));
      if (result?.closure === "secured" && input.settlement.closure === "open") {
        const human = keeper(input.world, base.actorId);
        expect(human.activity?.poses).toHaveLength(1);
        expect(human.activity?.poses[0]?.position).toEqual(base.target);
        expect(human.activity?.materialTask).toMatchObject({ kind: "settlement-material", phase: "arrived" });
        expect(human.circadian?.posture.state).toBe("awake");
        const dogBelief = human.perception.beliefs.find(({ subjectId }) => subjectId === initialBio0.dog.identity.stableId);
        expect(dogBelief).toMatchObject({ perceivedClass: "domestic-dog", identification: "identified", lastObservedTick: input.world.meta.completedTick });
        expect(["glance", "none"]).toContain(queryResidentAttentionState(human.perception));
        expect(input.porterResponse.intent).toBe("wait-observe");
        expect(input.observations).toHaveLength(1);
        expect(result.carrier).toEqual(input.settlement.carrier);
        expect(result.domesticCustodies).toEqual(input.settlement.domesticCustodies);
        expect(result.keeperKnowledge.at(-1)).toMatchObject({
          source: "direct-observation", sourceActorId: base.actorId,
          evidenceId: input.observations[0]!.id, learnedAtTick: input.world.meta.completedTick,
        });
        expect(human.perception.beliefs.find(({ sourceObservationId }) => sourceObservationId === input.observations[0]!.id))
          .toMatchObject({ perceivedClass: "exposed-food", subjectId: result.identity.foodLotId, identification: "identified" });
        committed = true;
      }
      return result;
    });
    soundscapePlay.mockClear();
    for (let interval = 0; interval < 8 && !committed; interval += 1) advance(runtime, 10);
    expect(committed, JSON.stringify(trace)).toBe(true);
    expect(inspection).toHaveBeenCalled();
    await runtime.save();
    const envelope = decode(repository.snapshot());
    const store = deserializeSettlementEcologyState(envelope.settlementEcology);
    expect(store.closure).toBe("secured");
    expect(deserializeBio0Ecology(envelope.bio0Ecology)?.dog.identity).toEqual(initialBio0.dog.identity);
    expect(store.identity).toEqual(deserializeSettlementEcologyState(decode(base.record).settlementEcology).identity);
    expect(store.keeperKnowledge.every(({ source }) => source === "direct-observation")).toBe(true);
    expect(envelope.perceptionCarry.situatedExpressionAdmissions.records.some(({ kind }) => kind === "settlement-keeper-store-response")).toBe(false);
    expect(runtime.getRenderView().acousticText?.some(({ text }) => text === "Storehouse door's barred.")).not.toBe(true);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-steady")).toHaveLength(0);
    assertWorldInvariants(deserializeWorld(envelope.world));
    // Ordinary recognition can briefly attract attention without becoming
    // work duty. Two real civil ticks later, the same known dog is retained,
    // not deleted to permit the routine.
    advance(runtime, 20);
    await runtime.save();
    const continued = decode(repository.snapshot());
    const continuedKeeper = keeper(deserializeWorld(continued.world), base.actorId);
    const retainedDog = continuedKeeper.perception.beliefs.find(({ subjectId }) => subjectId === initialBio0.dog.identity.stableId);
    expect(retainedDog).toMatchObject({ perceivedClass: "domestic-dog", identification: "identified" });
    expect(continuedKeeper.perception.tick - retainedDog!.firstObservedTick).toBeGreaterThanOrEqual(2);
    expect(queryResidentAttentionState(continuedKeeper.perception)).toBe("none");
    expect(continued.settlementEcology).toBe(envelope.settlementEcology);
  }, 60_000);

  it("delays securing during genuine urgent rest, then acts after the cause is cleared", async () => {
    const base = await fixture("rest");
    const repository = new MemoryRepository(base.record);
    const runtime = await open(repository);
    advance(runtime, 20);
    await runtime.save();
    const restingRecord = repository.snapshot();
    const resting = decode(restingRecord);
    const world = deserializeWorld(resting.world);
    const human = keeper(world, base.actorId);
    expect(human.activity?.poses[0]?.position).toEqual(base.target);
    expect(human.activity?.restTask?.phase).toBe("arrived");
    expect(human.circadian?.posture.state).toBe("resting");
    expect(deserializeSettlementEcologyState(resting.settlementEcology).closure).toBe("open");
    close(runtime);
    // Change only the pressure cause; current body/task/routine history stays native.
    human.needs = { food: 100_000, rest: 100_000, belonging: 400_000 };
    human.condition.exhaustion = 100_000;
    resting.world = serializeWorld(world);
    const resumedRepository = new MemoryRepository(recordWith(restingRecord, resting));
    const resumed = await open(resumedRepository);
    advance(resumed, 20);
    await resumed.save();
    const after = decode(resumedRepository.snapshot());
    expect(deserializeSettlementEcologyState(after.settlementEcology).closure).toBe("secured");
    expect(keeper(deserializeWorld(after.world), base.actorId).circadian?.posture.state).toBe("awake");
  }, 60_000);

  it("does not use legal store selection or a distant player as inspection evidence", async () => {
    const staged = await closingFixture();
    const referenceStore = deserializeSettlementEcologyState(staged.after.settlementEcology);
    // Select the actual visible store, but never dispatch its Warn interaction.
    const selectionRepository = new MemoryRepository(staged.beforeRecord);
    const selected = await open(selectionRepository);
    const visibleStore = selected.getRenderView().settlements.find(({ id }) => Number(id) === referenceStore.identity.settlementId);
    if (visibleStore === undefined) throw new Error("Native keeper fixture has no visible store to select");
    selected.dispatchRenderer({ type: "select", entity: "settlement", id: visibleStore.id, point: visibleStore.position });
    advance(selected, 1);
    await selected.save();
    expect(deserializeSettlementEcologyState(decode(selectionRepository.snapshot()).settlementEcology)).toEqual(referenceStore);
    close(selected);

    // Move only the synthetic player camera/start input at a genuine phase0.
    // Regional sidecar and interval anchor are rebuilt by their existing owners.
    const base = await fixture();
    const envelope = decode(base.record);
    const world = deserializeWorld(envelope.world);
    const travel = restorePlayerRegionalTravel(world.meta.rootSeed, envelope.player, envelope.regionalTravel);
    if (travel === null) throw new Error("Keeper fixture lost its native regional travel");
    const view = createWorldView(world);
    const farSettlement = world.settlements.filter(({ tileIndex }) => {
      const tile = world.terrain.tiles[tileIndex]!;
      return regionLocalToWindowTile(travel.window, base.target.region, tile.x, tile.y) !== null;
    }).sort((left, right) => {
      const leftTile = world.terrain.tiles[left.tileIndex]!;
      const rightTile = world.terrain.tiles[right.tileIndex]!;
      return Math.hypot(rightTile.x * WORLD_POSITION_UNITS_PER_TILE - base.target.localX, rightTile.y * WORLD_POSITION_UNITS_PER_TILE - base.target.localY)
        - Math.hypot(leftTile.x * WORLD_POSITION_UNITS_PER_TILE - base.target.localX, leftTile.y * WORLD_POSITION_UNITS_PER_TILE - base.target.localY);
    })[0];
    if (farSettlement === undefined) throw new Error("Native keeper has no settlement inside its current regional window");
    const tile = view.terrain.tiles[farSettlement.tileIndex]!;
    const dx = tile.x * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2 - base.target.localX;
    const dy = tile.y * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2 - base.target.localY;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(20 * WORLD_POSITION_UNITS_PER_TILE);
    // Locate the physical compatibility tile inside the existing signed window.
    const framePoint = regionLocalToWindowTile(travel.window, base.target.region, tile.x, tile.y);
    if (framePoint === null) throw new Error("Distant keeper fixture has no real point inside its signed window");
    envelope.player.x = (framePoint.x + 0.5) * WORLD_POSITION_UNITS_PER_TILE;
    envelope.player.y = (framePoint.y + 0.5) * WORLD_POSITION_UNITS_PER_TILE;
    envelope.player.previousX = envelope.player.x;
    envelope.player.previousY = envelope.player.y;
    envelope.player.velocityX = 0;
    envelope.player.velocityY = 0;
    envelope.regionalTravel = serializePlayerRegionalTravel(capturePlayerRegionalTravel(travel, envelope.player));
    const position = playerWorldPositionInRegionalWindow(travel.window, envelope.player);
    if (position === null) throw new Error("Distant keeper fixture left its signed window");
    envelope.perceptionCarry.intervalStartPosition = position;
    envelope.perceptionCarry.intervalStartFacingMilliRadians = envelope.player.facingMilliRadians;
    const awayRepository = new MemoryRepository(recordWith(base.record, envelope));
    const away = await open(awayRepository);
    for (let interval = 0; interval < 8; interval += 1) {
      advance(away, 10);
      await away.save();
      const store = deserializeSettlementEcologyState(decode(awayRepository.snapshot()).settlementEcology);
      if (store.closure === "secured") {
        expect(store.keeperKnowledge.every(({ source, sourceActorId }) => source === "direct-observation" && sourceActorId === base.actorId)).toBe(true);
        expect(away.getRenderView().settlements.some(({ foodStore }) => foodStore?.id === store.identity.storeId)).toBe(false);
        return;
      }
    }
    throw new Error("Distant player prevented autonomous inspection");
  }, 60_000);

  it("preserves an actually exhausted finite source as empty without inventing sight or closure", async () => {
    const base = await fixture();
    const envelope = decode(base.record);
    const store = exhaustStoreFood(deserializeSettlementEcologyState(envelope.settlementEcology), base.tick);
    envelope.settlementEcology = serializeSettlementEcologyState(store);
    const repository = new MemoryRepository(recordWith(base.record, envelope));
    const runtime = await open(repository);
    advance(runtime, 30);
    await runtime.save();
    const after = deserializeSettlementEcologyState(decode(repository.snapshot()).settlementEcology);
    expect(after).toEqual(store);
    expect(after.keeperKnowledge).toEqual([]);
    expect(after.lastClosureTransactionId).toBeNull();
  }, 60_000);

  it("cold restores the exact phase9 body/evidence interval, closes once, and never replays silent work as speech", async () => {
    const staged = await closingFixture();
    const repository = new MemoryRepository(staged.beforeRecord);
    const runtime = await open(repository);
    await runtime.save();
    expect(roots(decode(repository.snapshot()))).toEqual(roots(staged.before));
    soundscapePlay.mockClear();
    advance(runtime, 1);
    await runtime.save();
    const afterRecord = repository.snapshot();
    const after = decode(afterRecord);
    expect(roots(after)).toEqual(roots(staged.after));
    close(runtime);
    const replayRepository = new MemoryRepository(afterRecord);
    const replay = await open(replayRepository);
    await replay.save();
    expect(roots(decode(replayRepository.snapshot()))).toEqual(roots(after));
    advance(replay, 10);
    await replay.save();
    expect(decode(replayRepository.snapshot()).settlementEcology).toBe(after.settlementEcology);
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-steady")).toHaveLength(0);
  }, 60_000);

  it("rolls real inspection, closure and all saved roots back when later interval closure fails", async () => {
    const staged = await closingFixture();
    const repository = new MemoryRepository(staged.beforeRecord);
    const runtime = await open(repository);
    const original = keeperInspection.advanceSettlementKeeperStoreInspection;
    let attempted = false;
    vi.spyOn(keeperInspection, "advanceSettlementKeeperStoreInspection").mockImplementation((input) => {
      const result = original(input);
      expect(input.settlement.closure).toBe("open");
      expect(result?.closure).toBe("secured");
      attempted = true;
      return result;
    });
    vi.spyOn(expressionChannels, "closeSituatedExpressionChannelBankInterval").mockReturnValueOnce(null);
    soundscapePlay.mockClear();
    advance(runtime, 1, true);
    expect(attempted).toBe(true);
    expect(runtime.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    await runtime.save();
    expect(roots(decode(repository.snapshot()))).toEqual(roots(staged.before));
    expect(soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-steady")).toHaveLength(0);
  }, 60_000);
});
