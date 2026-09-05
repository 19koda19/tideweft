import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  deserializeWorld,
  serializeWorld,
} from "../sim/public";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createPlayer } from "./player";
import { createSessionState } from "./sessionTypes";
import { ADRIFT_STAND_DEPTH } from "./adrift";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  isWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
} from "./worldPosition";

const bio0StepControl = vi.hoisted(() => ({
  reject: false,
  accessibility: [] as Array<Record<string, boolean>>,
}));
const porterResponseControl = vi.hoisted(() => ({
  reject: false,
  decisions: [] as unknown[],
}));

vi.mock("./bio0Ecology", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./bio0Ecology")>();
  return {
    ...actual,
    stepBio0Ecology(
      state: Parameters<typeof actual.stepBio0Ecology>[0],
      input: Parameters<typeof actual.stepBio0Ecology>[1],
    ): ReturnType<typeof actual.stepBio0Ecology> {
      bio0StepControl.accessibility.push({ ...input.accessibility });
      if (bio0StepControl.reject) {
        return { ok: false, reason: "invariant-failed", state, event: null };
      }
      return actual.stepBio0Ecology(state, input);
    },
  };
});

vi.mock("./porterResponse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./porterResponse")>();
  return {
    ...actual,
    decidePorterResponse(value: unknown): ReturnType<typeof actual.decidePorterResponse> {
      if (porterResponseControl.reject) return null;
      const decision = actual.decidePorterResponse(value);
      if (decision !== null) porterResponseControl.decisions.push(structuredClone(decision));
      return decision;
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

import {
  canonicalizeBio0EcologyState,
  deserializeBio0Ecology,
  serializeBio0Ecology,
} from "./bio0Ecology";
import { deserializeCoreEcologyPatch } from "./coreEcology";
import { repositionDogActor, replaceDogActorPhysiology } from "./dogActor";
import { LOCAL_PLAYER_SUBJECT_ID } from "./humanPerception";
import { headingToRadians, livingActorAddressForResident } from "./livingActor";
import { canonicalizeLivingActorPlayerChoiceState } from "./livingActorPlayerChoice";
import {
  canonicalizePorterResponseState,
  type PorterResponseDecision,
} from "./porterResponse";
import { restorePlayerRegionalTravel } from "./regionalPlayerTravel";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";

interface CurrentEnvelope {
  readonly format: "tideweft-session";
  readonly version: number;
  readonly world: string;
  readonly bio0Ecology: string;
  readonly coreEcology: string;
  readonly porterResponse: unknown;
  readonly livingActorPlayerChoice: unknown;
  readonly player: ReturnType<typeof createPlayer>;
  readonly regionalTravel: string;
  readonly perceptionCarry: {
    readonly playerStepsSinceWorldTick: number;
  };
  readonly integrity: string;
  readonly [key: string]: unknown;
}

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
    if (!this.record) throw new Error("BIO0 runtime fixture has no autosave");
    return structuredClone(this.record);
  }

  replace(record: SaveRecord): void {
    this.record = structuredClone(record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime = 100;

beforeEach(() => {
  bio0StepControl.reject = false;
  bio0StepControl.accessibility.length = 0;
  porterResponseControl.reject = false;
  porterResponseControl.decisions.length = 0;
  scheduledFrame = undefined;
  nextFrameTime = 100;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  bio0StepControl.reject = false;
  bio0StepControl.accessibility.length = 0;
  porterResponseControl.reject = false;
  porterResponseControl.decisions.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runtime BIO0 ecology persistence", () => {
  it("deterministically creates one resident-bound dog and exact provision lot, then reloads without duplication", async () => {
    const seed = "bio0 deterministic runtime migration";
    const firstRepository = new MemoryRepository(legacyRecord(seed));
    const secondRepository = new MemoryRepository(legacyRecord(seed));
    const first = await createTideweftRuntime(firstRepository);
    const second = await createTideweftRuntime(secondRepository);

    await first.save();
    await second.save();
    const firstEnvelope = currentEnvelope(firstRepository);
    const secondEnvelope = currentEnvelope(secondRepository);
    expect(firstEnvelope.version).toBe(8);
    expect(firstRepository.snapshot().payloadVersion).toBe(8);
    expect(secondEnvelope.bio0Ecology).toBe(firstEnvelope.bio0Ecology);
    expect(secondEnvelope.coreEcology).toBe(firstEnvelope.coreEcology);

    const world = deserializeWorld(firstEnvelope.world);
    const ecology = requiredBio0(firstEnvelope);
    const startingSettlementId = world.contracts.find(({ status }) => status === "offered")
      ?.originSettlementId ?? world.settlements[0]?.id;
    const canonicalResident = world.residents.filter((resident) => (
      resident.location.kind === "settlement"
      && resident.location.settlementId === startingSettlementId
    )).sort((left, right) => (
      left.identity.stableId < right.identity.stableId ? -1 : 1
    ))[0];
    if (!canonicalResident) throw new Error("BIO0 fixture world omitted compatibility residents");
    expect(ecology.porterAddress.actorId).toBe(canonicalResident.identity.stableId);
    expect(ecology.dog.identity.stableId).not.toBe(ecology.porterAddress.actorId);
    expect(isWorldPosition(ecology.porterAddress.position)).toBe(true);
    expect(isWorldPosition(ecology.dog.address.position)).toBe(true);
    const porterFacing = headingToRadians(ecology.porterAddress.heading);
    expect(worldPositionDelta(ecology.porterAddress.position, ecology.dog.address.position))
      .toEqual({
        x: Math.round(Math.cos(porterFacing) * WORLD_POSITION_UNITS_PER_TILE),
        y: Math.round(Math.sin(porterFacing) * WORLD_POSITION_UNITS_PER_TILE),
      });
    expect(ecology.cargo.containers).toHaveLength(2);
    const provider = ecology.cargo.containers.find(
      ({ id }) => id === ecology.foodSource.providerContainerId,
    );
    const receiver = ecology.cargo.containers.find(
      ({ id }) => id === ecology.foodSource.receiverContainerId,
    );
    expect(provider).toMatchObject({
      custodianActorId: ecology.porterAddress.actorId,
      closure: "open",
    });
    expect(provider?.carrier.lots).toEqual([{
      id: ecology.foodSource.sourceLotId,
      payload: {
        kind: "provision",
        lotId: ecology.foodSource.sourceLotId,
        provision: "dried-fish",
        quantity: 4,
      },
      materialState: { condition: FIXED_POINT, contamination: 0, decay: 0 },
    }]);
    expect(receiver).toMatchObject({
      custodianActorId: ecology.dog.identity.stableId,
      carrier: { lots: [] },
    });
    expect(requiredPorterResponse(firstEnvelope)).toMatchObject({
      actorId: ecology.porterAddress.actorId,
      tick: 0,
      intent: "wait-observe",
    });
    expect(requiredLivingActorPlayerChoice(firstEnvelope)).toMatchObject({
      playerId: LOCAL_PLAYER_SUBJECT_ID,
      revision: 0,
      events: [],
    });

    first.destroy();
    second.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(firstRepository);
    await resumed.save();
    expect(currentEnvelope(firstRepository).bio0Ecology).toBe(firstEnvelope.bio0Ecology);
    expect(currentEnvelope(firstRepository).coreEcology).toBe(firstEnvelope.coreEcology);
    resumed.destroy();
  });

  it("places the fresh-start encounter in the first offered Promise neighborhood", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({
      type: "new-world",
      seed: "quiet-delta",
      posture: "gale",
      sessionShape: "wander",
    });
    const projectedDog = runtime.getRenderView().dogs?.[0];
    expect(projectedDog).toBeDefined();
    await runtime.save();
    const envelope = currentEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    const ecology = requiredBio0(envelope);
    const originSettlementId = world.contracts.find(({ status }) => status === "offered")
      ?.originSettlementId;
    const porter = world.residents.find(
      ({ identity }) => identity.stableId === ecology.porterAddress.actorId,
    );
    expect(originSettlementId).toBeDefined();
    expect(porter?.location).toEqual({
      kind: "settlement",
      settlementId: originSettlementId,
    });
    expect(projectedDog?.actorId).toBe(ecology.dog.identity.stableId);
    runtime.destroy();
  });

  it("migrates a sealed v5 save once while preserving its pending perception interval", async () => {
    const seed = "bio0 sealed v5 migration";
    const repository = new MemoryRepository(legacyRecord(seed));
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 7);
    await setup.save();
    setup.destroy();

    const currentRecord = repository.snapshot();
    const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
    const expectedBio0 = current.bio0Ecology;
    const expectedPorterResponse = current.porterResponse;
    const expectedPlayerChoice = current.livingActorPlayerChoice;
    const {
      bio0Ecology: _bio0Ecology,
      coreEcology: _coreEcology,
      porterResponse: _porterResponse,
      livingActorPlayerChoice: _livingActorPlayerChoice,
      integrity: _integrity,
      ...priorBase
    } = current;
    const v5Base = { ...priorBase, version: 5 };
    repository.replace({
      ...currentRecord,
      payloadVersion: 5,
      updatedAt: currentRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v5Base,
        integrity: gameSaveEnvelopeIntegrity(v5Base),
      }),
    });

    scheduledFrame = undefined;
    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const migratedEnvelope = currentEnvelope(repository);
    expect(migratedEnvelope.version).toBe(8);
    expect(migratedEnvelope.perceptionCarry.playerStepsSinceWorldTick).toBe(7);
    expect(migratedEnvelope.bio0Ecology).toBe(expectedBio0);
    expect(migratedEnvelope.porterResponse).toEqual(expectedPorterResponse);
    expect(migratedEnvelope.livingActorPlayerChoice).toEqual(expectedPlayerChoice);
    migrated.destroy();
  });

  it("migrates a sealed v6 BIO0 save by adding one deterministic porter response root", async () => {
    const repository = new MemoryRepository(legacyRecord("bio0 sealed v6 response migration"));
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();

    const currentRecord = repository.snapshot();
    const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
    const expectedBio0 = current.bio0Ecology;
    const expectedPorterResponse = current.porterResponse;
    const expectedPlayerChoice = current.livingActorPlayerChoice;
    const {
      coreEcology: _coreEcology,
      porterResponse: _porterResponse,
      livingActorPlayerChoice: _livingActorPlayerChoice,
      integrity: _integrity,
      ...priorBase
    } = current;
    const v6Base = { ...priorBase, version: 6 };
    repository.replace({
      ...currentRecord,
      payloadVersion: 6,
      updatedAt: currentRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v6Base,
        integrity: gameSaveEnvelopeIntegrity(v6Base),
      }),
    });

    scheduledFrame = undefined;
    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    const envelope = currentEnvelope(repository);
    expect(envelope.version).toBe(8);
    expect(envelope.bio0Ecology).toBe(expectedBio0);
    expect(envelope.porterResponse).toEqual(expectedPorterResponse);
    expect(envelope.livingActorPlayerChoice).toEqual(expectedPlayerChoice);
    migrated.destroy();
  });

  it("migrates a sealed v7 save to one deterministic core ecology root and preserves it", async () => {
    const seed = "core ecology sealed v7 migration";
    const setupRepository = new MemoryRepository(legacyRecord(seed));
    const setup = await createTideweftRuntime(setupRepository);
    await setup.save();
    setup.destroy();

    const currentRecord = setupRepository.snapshot();
    const current = JSON.parse(currentRecord.worldJson) as Record<string, unknown>;
    const {
      coreEcology: _coreEcology,
      integrity: _integrity,
      ...priorBase
    } = current;
    const v7Base = { ...priorBase, version: 7 };
    const v7Record: SaveRecord = {
      ...currentRecord,
      payloadVersion: 7,
      updatedAt: currentRecord.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v7Base,
        integrity: gameSaveEnvelopeIntegrity(v7Base),
      }),
    };
    expect(JSON.parse(v7Record.worldJson)).not.toHaveProperty("coreEcology");

    const firstRepository = new MemoryRepository(v7Record);
    const secondRepository = new MemoryRepository(v7Record);
    const first = await createTideweftRuntime(firstRepository);
    const second = await createTideweftRuntime(secondRepository);
    expect(first.getUIView().saveWarning).toBeUndefined();
    expect(second.getUIView().saveWarning).toBeUndefined();
    await first.save();
    await second.save();

    const firstEnvelope = currentEnvelope(firstRepository);
    const secondEnvelope = currentEnvelope(secondRepository);
    expect(firstEnvelope.version).toBe(8);
    expect(firstRepository.snapshot().payloadVersion).toBe(8);
    expect(secondEnvelope.coreEcology).toBe(firstEnvelope.coreEcology);
    const ecology = requiredCoreEcology(firstEnvelope);
    expect(ecology.populations.map(({ species }) => species).sort()).toEqual([
      "black-bear",
      "deer",
      "gull",
    ]);
    const actorIds = ecology.populations.flatMap(({ members }) =>
      members.map(({ actor }) => actor.identity.stableId)
    );
    expect(actorIds.length).toBeGreaterThan(0);
    expect(new Set(actorIds).size).toBe(actorIds.length);

    first.destroy();
    second.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(firstRepository);
    await resumed.save();
    expect(currentEnvelope(firstRepository).coreEcology).toBe(firstEnvelope.coreEcology);
    resumed.destroy();
  });

  it("steps exactly once per completed world tick using the prior completed weather and fresh porter address", async () => {
    const seed = "bio0 prior completed storm";
    const record = legacyRecord(seed, {
      kind: "storm",
      intensity: 720_000,
      windX: 200_000,
      windY: -100_000,
      nextChangeTick: 1,
    });
    const repository = new MemoryRepository(record);
    const runtime = await createTideweftRuntime(repository);

    advancePlayerSteps(runtime, 10);
    await runtime.save();
    const envelope = currentEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    const ecology = requiredBio0(envelope);
    expect(world.meta.completedTick).toBe(1);
    expect(ecology).toMatchObject({
      createdAtTick: 0,
      tick: 1,
      revision: 1,
      lastExposure: {
        rain: 900_000,
        wind: 150_000,
        ambientCold: 525_000,
      },
      lastWind: { x: 200_000, y: -100_000 },
    });
    const porter = world.residents.find(
      ({ identity }) => identity.stableId === ecology.porterAddress.actorId,
    );
    if (!porter) throw new Error("saved BIO0 porter no longer exists in the world");
    expect(ecology.porterAddress).toEqual(
      livingActorAddressForResident(createWorldView(world), porter),
    );
    runtime.destroy();
  });

  it("moves the saved dog toward its uncertain food-scent center by bounded traversable steps", async () => {
    const repository = new MemoryRepository(legacyRecord("bio0 runtime scent locomotion"));
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();
    const fixture = prepareLocomotionFixture(repository, false);

    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);
    let prior = fixture.ecology;
    let movement: Readonly<{ before: typeof prior; after: typeof prior }> | null = null;
    runtime.start();
    advanceScheduledFrames(1);
    for (let attempt = 0; attempt < 20 && movement === null; attempt += 1) {
      advanceScheduledFrames(10);
      await runtime.save();
      const next = requiredBio0(currentEnvelope(repository));
      const delta = worldPositionDelta(prior.dog.address.position, next.dog.address.position);
      if (delta.x !== 0 || delta.y !== 0) movement = { before: prior, after: next };
      prior = next;
    }
    runtime.stop();

    expect(movement).not.toBeNull();
    if (movement === null) throw new Error("hungry BIO0 dog never followed its scent belief");
    const request = movement.after.pendingMovement;
    expect(request).not.toBeNull();
    if (request === null) throw new Error("BIO0 movement lost its cognition request");
    expect(request.issuedAtTick).toBe(movement.after.tick);
    const step = worldPositionDelta(
      movement.before.dog.address.position,
      movement.after.dog.address.position,
    );
    expect(Math.hypot(step.x, step.y)).toBeGreaterThan(0);
    expect(Math.hypot(step.x, step.y)).toBeLessThanOrEqual(request.maximumStepUnits);
    const beforeTarget = worldPositionDelta(
      movement.before.dog.address.position,
      request.targetArea.center,
    );
    const afterTarget = worldPositionDelta(
      movement.after.dog.address.position,
      request.targetArea.center,
    );
    expect(Math.hypot(beforeTarget.x, beforeTarget.y)).toBeLessThanOrEqual(
      request.targetArea.radiusUnits,
    );
    expect(Math.hypot(afterTarget.x, afterTarget.y)).toBeLessThan(
      Math.hypot(beforeTarget.x, beforeTarget.y),
    );

    const savedWorld = deserializeWorld(currentEnvelope(repository).world);
    const dogTile = createWorldView(savedWorld).terrain.tiles[
      compatibilityTileIndex(savedWorld.terrain.width, movement.after.dog.address.position)
    ];
    expect(dogTile?.terrain).not.toBe("deep-water");
    expect(dogTile?.waterDepth ?? Number.MAX_SAFE_INTEGER).toBeLessThanOrEqual(
      ADRIFT_STAND_DEPTH,
    );

    const savedEcology = currentEnvelope(repository).bio0Ecology;
    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    await resumed.save();
    expect(currentEnvelope(repository).bio0Ecology).toBe(savedEcology);
    resumed.destroy();
  });

  it("closes scent approach when the saved traversability surface has a deep-water barrier", async () => {
    const repository = new MemoryRepository(legacyRecord("bio0 runtime deep barrier"));
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();
    const fixture = prepareLocomotionFixture(repository, true);

    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);
    let latestEcology = fixture.ecology;
    let observedClosedApproach = false;
    runtime.start();
    advanceScheduledFrames(1);
    for (let attempt = 0; attempt < 24 && !observedClosedApproach; attempt += 1) {
      advanceScheduledFrames(10);
      await runtime.save();
      const ecology = requiredBio0(currentEnvelope(repository));
      latestEcology = ecology;
      expect(ecology.dog.address.position).toEqual(fixture.ecology.dog.address.position);
      const latestAccessibility = bio0StepControl.accessibility.at(-1);
      observedClosedApproach = latestAccessibility?.["approach-food"] === false
        && ecology.dog.perception.beliefs.some(
          ({ perceivedClass }) => perceivedClass === "food-scent",
        );
    }
    runtime.stop();

    expect(observedClosedApproach).toBe(true);
    expect(latestEcology.pendingMovement).toBeNull();
    expect(bio0StepControl.accessibility.at(-1)).toMatchObject({
      eat: false,
      "approach-food": false,
      observe: true,
    });
    const savedWorld = deserializeWorld(currentEnvelope(repository).world);
    for (const tileIndex of fixture.barrierTileIndices) {
      expect(savedWorld.terrain.tiles[tileIndex]?.terrain).toBe("deep-water");
    }
    runtime.destroy();
  });

  it("keeps an unseen off-window dog out of porter cognition and response availability", async () => {
    const repository = new MemoryRepository(legacyRecord("bio0 unseen porter response"));
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();
    const fixture = preparePorterResponseFixture(repository, false);

    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);
    runtime.start();
    advanceScheduledFrames(1);
    for (let tick = 0; tick < 8; tick += 1) advanceScheduledFrames(10);
    runtime.stop();
    await runtime.save();

    const envelope = currentEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    const ecology = requiredBio0(envelope);
    const porter = world.residents.find(
      ({ identity }) => identity.stableId === fixture.porterActorId,
    );
    if (!porter) throw new Error("unseen BIO0 fixture lost its chosen porter");
    expect(ecology.dog.address.position).toEqual(fixture.dogPosition);
    expect(porter.perception.beliefs.some((belief) => (
      belief.subjectId === fixture.dogActorId
      || belief.perceivedClass === "domestic-dog"
      || belief.perceivedClass === "animal-silhouette"
    ))).toBe(false);
    expect(requiredPorterResponse(envelope)).toMatchObject({
      actorId: fixture.porterActorId,
      intent: "wait-observe",
      lastOfferedSubjectId: null,
      lastOfferedAtTick: null,
    });

    const decisions = porterResponseControl.decisions as PorterResponseDecision[];
    expect(decisions.length).toBeGreaterThan(0);
    for (const decision of decisions) {
      expect(decision.subjectId).not.toBe(fixture.dogActorId);
      expect(decision.scores).toEqual(expect.arrayContaining([
        expect.objectContaining({ intent: "secure-food", accessible: false }),
        expect.objectContaining({ intent: "reroute", accessible: false }),
        expect.objectContaining({ intent: "leave", accessible: false }),
        expect.objectContaining({ intent: "offer-food", accessible: false }),
        expect.objectContaining({ intent: "wait-observe", accessible: true }),
      ]));
    }
    runtime.destroy();
  });

  it("lets clear shared LOS produce a contextual offer policy without enacting the food transfer", async () => {
    const repository = new MemoryRepository(legacyRecord("bio0 visible porter response"));
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();
    const fixture = preparePorterResponseFixture(repository, true);

    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);
    runtime.start();
    advanceScheduledFrames(1);
    let offered = false;
    for (let attempt = 0; attempt < 12 && !offered; attempt += 1) {
      advanceScheduledFrames(10);
      await runtime.save();
      offered = requiredPorterResponse(currentEnvelope(repository)).lastOfferedSubjectId
        === fixture.dogActorId;
    }
    runtime.stop();

    expect(offered).toBe(true);
    const envelope = currentEnvelope(repository);
    const world = deserializeWorld(envelope.world);
    const ecology = requiredBio0(envelope);
    const porter = world.residents.find(
      ({ identity }) => identity.stableId === fixture.porterActorId,
    );
    if (!porter) throw new Error("visible BIO0 fixture lost its chosen porter");
    const dogBelief = porter.perception.beliefs.find((belief) => (
      belief.channel === "vision"
      && belief.perceivedClass === "domestic-dog"
      && belief.subjectId === fixture.dogActorId
    ));
    expect(dogBelief).toMatchObject({
      identification: "identified",
      subjectId: fixture.dogActorId,
    });

    const offerDecision = (porterResponseControl.decisions as PorterResponseDecision[])
      .find((decision) => (
        decision.intent === "offer-food" && decision.subjectId === fixture.dogActorId
      ));
    expect(offerDecision).toMatchObject({
      actorId: fixture.porterActorId,
      intent: "offer-food",
      subjectId: fixture.dogActorId,
      foodLotId: fixture.sourceLotId,
      cause: { kind: "perception", referenceId: dogBelief?.key },
    });
    expect(offerDecision?.scores).toEqual(expect.arrayContaining([
      expect.objectContaining({ intent: "offer-food", accessible: true }),
    ]));
    expect(requiredPorterResponse(envelope)).toMatchObject({
      actorId: fixture.porterActorId,
      intent: "offer-food",
      lastOfferedSubjectId: fixture.dogActorId,
    });

    const provider = ecology.cargo.containers.find(
      ({ id }) => id === ecology.foodSource.providerContainerId,
    );
    expect(provider).toMatchObject({
      closure: "open",
      carrier: {
        lots: [{
          id: fixture.sourceLotId,
          payload: { kind: "provision", quantity: 4 },
        }],
      },
    });
    runtime.destroy();
  });

  it("projects the saved dog into both renderers' shared view and opens knowledge-honest ABOUT by stable ID", async () => {
    const repository = new MemoryRepository(legacyRecord("bio0 live dog projection"));
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();

    resealCurrent(repository, (decoded) => {
      const envelope = decoded as unknown as CurrentEnvelope;
      const world = deserializeWorld(envelope.world);
      const travel = restorePlayerRegionalTravel(
        world.meta.rootSeed,
        envelope.player,
        envelope.regionalTravel,
      );
      if (!travel) throw new Error("BIO0 projection fixture could not restore regional travel");
      const playerPosition = playerWorldPositionInRegionalWindow(travel.window, envelope.player);
      if (!playerPosition) throw new Error("BIO0 projection fixture could not locate player");
      const ecology = requiredBio0(envelope);
      const dog = repositionDogActor(ecology.dog, {
        position: playerPosition,
        heading: ecology.dog.address.heading,
        atTick: ecology.tick,
      });
      const moved = canonicalizeBio0EcologyState({ ...ecology, dog });
      if (!moved) throw new Error("BIO0 projection fixture produced an invalid ecology state");
      decoded.bio0Ecology = serializeBio0Ecology(moved);
    });

    scheduledFrame = undefined;
    const runtime = await createTideweftRuntime(repository);
    const dog = runtime.getRenderView().dogs?.[0];
    expect(dog).toMatchObject({ quickLabel: "Unknown dog", selected: false });
    if (!dog) throw new Error("directly visible saved dog was not projected");

    runtime.dispatchRenderer({
      type: "select",
      entity: "living-actor",
      species: "domestic-dog",
      id: dog.actorId,
      point: dog.position,
    });
    expect(runtime.getRenderView().dogs?.[0]).toMatchObject({
      actorId: dog.actorId,
      selected: true,
    });
    expect(runtime.getUIView().selectedLivingActor).toMatchObject({
      target: { species: "domestic-dog", actorId: dog.actorId },
      quick: { heading: "UNKNOWN DOG" },
      about: {
        heading: "UNKNOWN DOG",
        knowledgeLabel: "Unfamiliar",
        known: [],
      },
    });

    runtime.dispatchUI({
      type: "living-actor",
      action: "close",
      target: { species: "domestic-dog", actorId: dog.actorId },
    });
    expect(runtime.getUIView().selectedLivingActor).toBeUndefined();
    expect(runtime.getRenderView().dogs?.[0]?.selected).toBe(false);
    runtime.destroy();
  });

  it.each([
    {
      label: "missing core ecology root",
      tamper(envelope: Record<string, unknown>) {
        delete envelope.coreEcology;
      },
    },
    {
      label: "extra core ecology alias",
      tamper(envelope: Record<string, unknown>) {
        envelope.coreEcologyAlias = envelope.coreEcology;
      },
    },
    {
      label: "noncanonical core ecology serialization",
      tamper(envelope: Record<string, unknown>) {
        envelope.coreEcology = `${String(envelope.coreEcology)} `;
      },
    },
    {
      label: "missing BIO0 root",
      tamper(envelope: Record<string, unknown>) {
        delete envelope.bio0Ecology;
      },
    },
    {
      label: "extra BIO0 alias",
      tamper(envelope: Record<string, unknown>) {
        envelope.bio0EcologyAlias = envelope.bio0Ecology;
      },
    },
    {
      label: "noncanonical BIO0 serialization",
      tamper(envelope: Record<string, unknown>) {
        envelope.bio0Ecology = `${String(envelope.bio0Ecology)} `;
      },
    },
    {
      label: "missing porter response root",
      tamper(envelope: Record<string, unknown>) {
        delete envelope.porterResponse;
      },
    },
    {
      label: "extra porter response alias",
      tamper(envelope: Record<string, unknown>) {
        envelope.porterResponseAlias = envelope.porterResponse;
      },
    },
    {
      label: "noncanonical porter response",
      tamper(envelope: Record<string, unknown>) {
        envelope.porterResponse = {
          ...(envelope.porterResponse as Record<string, unknown>),
          hiddenDogDistance: 1,
        };
      },
    },
    {
      label: "missing player choice root",
      tamper(envelope: Record<string, unknown>) {
        delete envelope.livingActorPlayerChoice;
      },
    },
    {
      label: "extra player choice alias",
      tamper(envelope: Record<string, unknown>) {
        envelope.livingActorPlayerChoiceAlias = envelope.livingActorPlayerChoice;
      },
    },
    {
      label: "noncanonical player choice",
      tamper(envelope: Record<string, unknown>) {
        envelope.livingActorPlayerChoice = {
          ...(envelope.livingActorPlayerChoice as Record<string, unknown>),
          hiddenSelection: true,
        };
      },
    },
  ])("rejects a resealed v8 envelope with $label", async ({ tamper }) => {
    const repository = new MemoryRepository(legacyRecord("bio0 exact envelope keys"));
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();
    resealCurrent(repository, tamper);

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  });

  it("rolls the world and BIO0 roots back together when the ecology step rejects", async () => {
    const repository = new MemoryRepository(legacyRecord("bio0 fail closed runtime tick"));
    const runtime = await createTideweftRuntime(repository);
    await runtime.save();
    const before = currentEnvelope(repository);

    bio0StepControl.reject = true;
    advancePlayerSteps(runtime, 10);
    expect(runtime.getUIView().saveWarning).toMatchObject({
      message: "SIMULATION PAUSED SAFELY",
    });
    await runtime.save();
    const after = currentEnvelope(repository);
    expect(deserializeWorld(after.world).meta.completedTick).toBe(0);
    expect(after.bio0Ecology).toBe(before.bio0Ecology);
    expect(after.livingActorPlayerChoice).toEqual(before.livingActorPlayerChoice);
    expect(after.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    runtime.destroy();
  });

  it("rolls the world, ecology, and response roots back together when porter policy rejects", async () => {
    const repository = new MemoryRepository(legacyRecord("bio0 porter response rollback"));
    const runtime = await createTideweftRuntime(repository);
    await runtime.save();
    const before = currentEnvelope(repository);

    porterResponseControl.reject = true;
    advancePlayerSteps(runtime, 10);
    expect(runtime.getUIView().saveWarning).toMatchObject({
      message: "SIMULATION PAUSED SAFELY",
    });
    await runtime.save();
    const after = currentEnvelope(repository);
    expect(deserializeWorld(after.world).meta.completedTick).toBe(0);
    expect(after.bio0Ecology).toBe(before.bio0Ecology);
    expect(after.porterResponse).toEqual(before.porterResponse);
    expect(after.livingActorPlayerChoice).toEqual(before.livingActorPlayerChoice);
    expect(after.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    runtime.destroy();
  });
});

function legacyRecord(
  seed: string,
  weather?: ReturnType<typeof createWorld>["weather"],
): SaveRecord {
  const world = createWorld(seed, "wild");
  if (weather) world.weather = weather;
  const view = createWorldView(world);
  const player = createPlayer(view);
  const session = createSessionState(seed, "gale");
  session.titleVisible = false;
  session.paused = false;
  session.hasSave = true;
  const envelope = {
    format: "tideweft-session",
    version: 1,
    world: serializeWorld(world),
    player,
    session,
  };
  return {
    slotId: "autosave",
    label: "BIO0 runtime fixture",
    seed,
    updatedAt: 1,
    playTicks: world.meta.completedTick,
    settlementCount: world.settlements.length,
    connectedCount: 0,
    worldJson: JSON.stringify(envelope),
  };
}

function prepareLocomotionFixture(
  repository: MemoryRepository,
  deepBarrier: boolean,
): Readonly<{
  ecology: ReturnType<typeof requiredBio0>;
  barrierTileIndices: readonly number[];
}> {
  let prepared: {
    ecology: ReturnType<typeof requiredBio0>;
    barrierTileIndices: readonly number[];
  } | null = null;
  resealCurrent(repository, (decoded) => {
    const envelope = decoded as unknown as CurrentEnvelope;
    const world = deserializeWorld(envelope.world);
    for (const tile of world.terrain.tiles) {
      tile.terrain = "meadow";
      tile.elevation = FIXED_POINT;
    }
    world.weather = {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: world.meta.completedTick + 1_000,
    };

    const ecology = requiredBio0(envelope);
    const porterTileX = Math.floor(
      ecology.porterAddress.position.localX / WORLD_POSITION_UNITS_PER_TILE,
    );
    const direction: -1 | 1 = world.terrain.width - porterTileX > 9 ? 1 : -1;
    const dogPosition = translateWorldPosition(
      ecology.porterAddress.position,
      direction * 8 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    if (dogPosition.region.x !== 0 || dogPosition.region.y !== 0) {
      throw new Error("BIO0 locomotion fixture crossed the compatibility boundary");
    }
    const positionedDog = repositionDogActor(ecology.dog, {
      position: dogPosition,
      heading: ecology.dog.address.heading,
      atTick: ecology.tick,
    });
    const hungryDog = replaceDogActorPhysiology(positionedDog, {
      needs: {
        hunger: FIXED_POINT,
        thirst: 0,
        rest: 0,
        safety: 0,
        company: 0,
      },
      condition: positionedDog.condition,
      humanFamiliarity: positionedDog.humanFamiliarity,
      atTick: ecology.tick,
    });
    const moved = canonicalizeBio0EcologyState({ ...ecology, dog: hungryDog });
    if (!moved) throw new Error("BIO0 locomotion fixture produced invalid dog state");

    const dogTileX = Math.floor(dogPosition.localX / WORLD_POSITION_UNITS_PER_TILE);
    const dogTileY = Math.floor(dogPosition.localY / WORLD_POSITION_UNITS_PER_TILE);
    const barrierTileIndices: number[] = [];
    if (deepBarrier) {
      // A finite wall in one compatibility region is correctly routeable
      // around once the runtime uses its seamless regional view. Surround the
      // actor locally instead so the fixture represents a genuinely closed
      // ground route without pretending the infinite world ends at this save.
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const x = dogTileX + offsetX;
          const y = dogTileY + offsetY;
          const tileIndex = y * world.terrain.width + x;
          const tile = x >= 0 && x < world.terrain.width
            && y >= 0 && y < world.terrain.height
            ? world.terrain.tiles[tileIndex]
            : undefined;
          if (!tile) throw new Error("BIO0 deep barrier left compatibility terrain");
          tile.terrain = "deep-water";
          barrierTileIndices.push(tileIndex);
        }
      }
    }
    decoded.world = serializeWorld(world);
    decoded.bio0Ecology = serializeBio0Ecology(moved);
    prepared = { ecology: moved, barrierTileIndices };
  });
  if (prepared === null) throw new Error("BIO0 locomotion fixture was not prepared");
  return prepared;
}

function preparePorterResponseFixture(
  repository: MemoryRepository,
  visible: boolean,
): Readonly<{
  dogActorId: string;
  dogPosition: ReturnType<typeof requiredBio0>["dog"]["address"]["position"];
  porterActorId: string;
  sourceLotId: string;
}> {
  let prepared: {
    dogActorId: string;
    dogPosition: ReturnType<typeof requiredBio0>["dog"]["address"]["position"];
    porterActorId: string;
    sourceLotId: string;
  } | null = null;
  resealCurrent(repository, (decoded) => {
    const envelope = decoded as unknown as CurrentEnvelope;
    const world = deserializeWorld(envelope.world);
    const ecology = requiredBio0(envelope);
    const porter = world.residents.find(
      ({ identity }) => identity.stableId === ecology.porterAddress.actorId,
    );
    if (!porter) throw new Error("BIO0 response fixture lost its chosen porter");

    let dogPosition = translateWorldPosition(
      ecology.dog.address.position,
      world.terrain.width * WORLD_POSITION_UNITS_PER_TILE * 8,
      0,
    );
    let porterAddress = ecology.porterAddress;
    if (visible) {
      const settlement = world.settlements[0];
      if (!settlement) throw new Error("BIO0 response fixture world has no settlement");
      porter.location = { kind: "settlement", settlementId: settlement.id };
      porter.intention = "rest";
      porter.nextThinkTick = world.meta.completedTick + 1_000;
      porter.traits = { resolve: 500_000, empathy: FIXED_POINT, curiosity: 0 };
      porter.needs = { food: 0, rest: 0, belonging: 0 };
      porter.identity.temperament = ["protective", "social"];
      world.weather = {
        kind: "clear",
        intensity: 0,
        windX: 0,
        windY: 0,
        nextChangeTick: world.meta.completedTick + 1_000,
      };
      const resolved = livingActorAddressForResident(createWorldView(world), porter);
      if (resolved?.species !== "human") {
        throw new Error("BIO0 response fixture could not place its chosen porter");
      }
      porterAddress = resolved as typeof porterAddress;
      const facing = headingToRadians(porterAddress.heading);
      dogPosition = translateWorldPosition(
        porterAddress.position,
        Math.round(Math.cos(facing) * WORLD_POSITION_UNITS_PER_TILE),
        Math.round(Math.sin(facing) * WORLD_POSITION_UNITS_PER_TILE),
      );
      const travel = restorePlayerRegionalTravel(
        world.meta.rootSeed,
        envelope.player,
        envelope.regionalTravel,
      );
      const playerPosition = travel === null
        ? null
        : playerWorldPositionInRegionalWindow(travel.window, envelope.player);
      if (playerPosition === null) {
        throw new Error("BIO0 response fixture could not locate its player");
      }
      const playerToPorter = worldPositionDelta(playerPosition, porterAddress.position);
      envelope.player.facingMilliRadians = Math.round(
        Math.atan2(playerToPorter.y, playerToPorter.x) * 1_000,
      );
    }

    const positionedDog = repositionDogActor(ecology.dog, {
      position: dogPosition,
      heading: ecology.dog.address.heading,
      atTick: ecology.tick,
    });
    const settledDog = visible
      ? replaceDogActorPhysiology(positionedDog, {
          needs: { hunger: FIXED_POINT, thirst: 0, rest: 0, safety: 0, company: 0 },
          condition: positionedDog.condition,
          humanFamiliarity: positionedDog.humanFamiliarity,
          atTick: ecology.tick,
        })
      : positionedDog;
    const moved = canonicalizeBio0EcologyState({
      ...ecology,
      dog: settledDog,
      porterAddress,
    });
    if (!moved) throw new Error("BIO0 response fixture produced invalid ecology state");
    decoded.world = serializeWorld(world);
    decoded.bio0Ecology = serializeBio0Ecology(moved);
    prepared = {
      dogActorId: moved.dog.identity.stableId,
      dogPosition: moved.dog.address.position,
      porterActorId: moved.porterAddress.actorId,
      sourceLotId: moved.foodSource.sourceLotId,
    };
  });
  if (prepared === null) throw new Error("BIO0 response fixture was not prepared");
  return prepared;
}

function compatibilityTileIndex(
  width: number,
  position: ReturnType<typeof requiredBio0>["dog"]["address"]["position"],
): number {
  if (position.region.x !== 0 || position.region.y !== 0) {
    throw new Error("Expected a compatibility-region BIO0 position");
  }
  return Math.floor(position.localY / WORLD_POSITION_UNITS_PER_TILE) * width
    + Math.floor(position.localX / WORLD_POSITION_UNITS_PER_TILE);
}

function advanceScheduledFrames(count: number): void {
  for (let frame = 0; frame < count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
}

function advancePlayerSteps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  advanceScheduledFrames(count + 1);
  runtime.stop();
}

function currentEnvelope(repository: MemoryRepository): CurrentEnvelope {
  return JSON.parse(repository.snapshot().worldJson) as CurrentEnvelope;
}

function requiredBio0(envelope: CurrentEnvelope) {
  const state = deserializeBio0Ecology(envelope.bio0Ecology);
  if (!state) throw new Error("current runtime save omitted canonical BIO0 ecology");
  return state;
}

function requiredCoreEcology(envelope: CurrentEnvelope) {
  const state = deserializeCoreEcologyPatch(envelope.coreEcology);
  if (!state) throw new Error("current runtime save omitted canonical core ecology");
  return state;
}

function requiredPorterResponse(envelope: CurrentEnvelope) {
  const state = canonicalizePorterResponseState(envelope.porterResponse);
  if (!state) throw new Error("current runtime save omitted canonical porter response");
  return state;
}

function requiredLivingActorPlayerChoice(envelope: CurrentEnvelope) {
  const state = canonicalizeLivingActorPlayerChoiceState(envelope.livingActorPlayerChoice);
  if (!state) throw new Error("current runtime save omitted canonical player choice state");
  return state;
}

function resealCurrent(
  repository: MemoryRepository,
  tamper: (envelope: Record<string, unknown>) => void,
): void {
  const current = repository.snapshot();
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const { integrity: _integrity, ...base } = decoded;
  const tampered = structuredClone(base);
  tamper(tampered);
  repository.replace({
    ...current,
    updatedAt: current.updatedAt + 1,
    worldJson: JSON.stringify({
      ...tampered,
      integrity: gameSaveEnvelopeIntegrity(tampered),
    }),
  });
}
