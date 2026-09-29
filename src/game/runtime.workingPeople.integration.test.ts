import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  STRAND_AUTOMATION_THRESHOLD,
  createWorld,
  createWorldView,
  deserializeWorld,
  serializeWorld,
  stepWorld,
  type ResourceKind,
} from "../sim/public";
import * as humanPerception from "./humanPerception";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createPlayer } from "./player";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { createSessionState } from "./sessionTypes";
import type {
  PorterHeavyDepartureExpressionAdmissionRecord,
  SituatedExpressionAdmissionLedger,
} from "./situatedExpressionAdmissionLedger";
import type { SituatedExpressionChannelBank } from "./situatedExpressionChannelBank";
import type { SituatedExpressionCausalAuthorityLedger } from "./situatedExpressionCausalAuthority";
import { workingPeopleExpressionEventMatchesWorld } from "./workingPeopleExpression";
import { REGION_WIDTH_UNITS, type WorldPosition } from "./worldPosition";

const soundscapePlay = vi.hoisted(() => vi.fn());
vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
    updateAmbience(): void {}
    destroy(): void {}
  },
  spatialPanForBearing: () => 0,
}));

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {
    this.record = record ? structuredClone(record) : undefined;
  }

  async list() {
    return [];
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    return slotId === "autosave" && this.record
      ? structuredClone(this.record)
      : undefined;
  }

  async save(record: SaveRecord): Promise<void> {
    this.record = structuredClone(record);
  }

  async remove(): Promise<void> {
    this.record = undefined;
  }

  replace(record: SaveRecord): void {
    this.record = structuredClone(record);
  }

  snapshot(): SaveRecord {
    if (!this.record) throw new Error("Working People fixture has no autosave");
    return structuredClone(this.record);
  }
}

interface CurrentEnvelope {
  readonly world: string;
  readonly perceptionCarry: {
    readonly intervalStartPosition: WorldPosition;
    readonly intervalStartFacingMilliRadians: number;
    readonly actorVocalizationSamples: readonly humanPerception.SupplementalSoundSample[];
    readonly situatedExpressionAdmissions: SituatedExpressionAdmissionLedger;
    readonly situatedExpressionCausalAuthority: SituatedExpressionCausalAuthorityLedger;
    readonly situatedExpressionChannels: SituatedExpressionChannelBank;
  };
}

interface WorkingPeopleFixture {
  readonly actorId: string;
  readonly contractId: number;
  readonly hiddenName: string;
  readonly record: SaveRecord;
  readonly residentId: number;
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

function advancePlayerSteps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  // The first frame establishes the clock; each later 100 ms frame advances
  // one fixed player step. Ten fixed steps commit one human-perception interval.
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
}

function strainedCueCount(): number {
  return soundscapePlay.mock.calls.filter(([cue]) => cue === "vocalization-strained").length;
}

function decodeCurrent(repository: MemoryRepository): CurrentEnvelope {
  return JSON.parse(repository.snapshot().worldJson) as CurrentEnvelope;
}

function resealCurrentRecord(
  record: SaveRecord,
  decoded: Record<string, unknown>,
): SaveRecord {
  const { integrity: _integrity, ...base } = decoded;
  return {
    ...record,
    updatedAt: record.updatedAt + 1,
    worldJson: JSON.stringify({
      ...base,
      integrity: gameSaveEnvelopeIntegrity(base),
    }),
  };
}

/**
 * The fixture deliberately saves after acceptance but before departure. The
 * integration contract is that only the runtime's newly committed departure
 * may produce speech; loading the older acceptance event is never a trigger.
 */
function workingPeopleFixture(
  seed: string,
  options: Readonly<{ heavy: boolean; nearPlayer: boolean }>,
): WorkingPeopleFixture {
  const world = createWorld(seed, "standard");
  const contract = world.contracts.find(({ status }) => status === "offered");
  if (!contract) throw new Error("fixture needs an offered Promise");
  const origin = world.settlements.find(({ id }) => id === contract.originSettlementId);
  const resident = world.residents.find((candidate) =>
    candidate.activeContractId === null
    && candidate.location.kind === "settlement"
    && candidate.location.settlementId === contract.originSettlementId
  );
  if (!origin || !resident) throw new Error("fixture needs an origin porter");

  const resource: ResourceKind = options.heavy ? "parts" : "reed";
  contract.resource = resource;
  contract.quantity = 1;
  if (origin.inventory[resource] < contract.quantity) {
    const added = contract.quantity - origin.inventory[resource];
    origin.inventory[resource] += added;
    world.ledger.initial[resource] += added;
  }
  world.weather = {
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
    nextChangeTick: world.meta.completedTick + 1_000,
  };
  for (const route of world.routes) {
    route.traceStrength = Math.max(route.traceStrength, STRAND_AUTOMATION_THRESHOLD);
    route.condition = Math.max(route.condition, 180_000);
  }
  resident.playerKnowledge = {
    level: "unfamiliar",
    firstObservedTick: null,
    introducedTick: null,
    facts: [],
  };

  stepWorld(world, [{
    id: `working-people-accept-${options.heavy ? "heavy" : "light"}`,
    type: "accept-contract",
    carrier: "resident",
    contractId: contract.id,
    residentId: resident.id,
  }]);
  if (contract.status !== "accepted" || resident.activeContractId !== contract.id) {
    throw new Error("fixture resident did not accept the Promise");
  }

  const view = createWorldView(world);
  const playerSettlement = options.nearPlayer
    ? origin
    : [...world.settlements].sort((left, right) => {
        const originX = origin.tileIndex % world.terrain.width;
        const originY = Math.floor(origin.tileIndex / world.terrain.width);
        const leftX = left.tileIndex % world.terrain.width;
        const leftY = Math.floor(left.tileIndex / world.terrain.width);
        const rightX = right.tileIndex % world.terrain.width;
        const rightY = Math.floor(right.tileIndex / world.terrain.width);
        const leftDistance = (leftX - originX) ** 2 + (leftY - originY) ** 2;
        const rightDistance = (rightX - originX) ** 2 + (rightY - originY) ** 2;
        return rightDistance - leftDistance;
      })[0];
  if (!playerSettlement) throw new Error("fixture needs a player settlement");
  if (!options.nearPlayer) {
    const originX = origin.tileIndex % world.terrain.width;
    const originY = Math.floor(origin.tileIndex / world.terrain.width);
    const playerX = playerSettlement.tileIndex % world.terrain.width;
    const playerY = Math.floor(playerSettlement.tileIndex / world.terrain.width);
    if (Math.hypot(playerX - originX, playerY - originY) <= 24) {
      throw new Error("fixture could not place the player outside local departure range");
    }
  }
  const player = createPlayer(view, playerSettlement.id);
  const session = createSessionState(seed, "hearth");
  session.titleVisible = false;
  session.paused = false;
  session.hasSave = true;
  const { timeAction: _futureTimeAction, ...legacyPlayer } = player;
  const envelope = {
    format: "tideweft-session",
    version: 1,
    world: serializeWorld(world),
    player: legacyPlayer,
    session,
  };

  return {
    actorId: resident.identity.stableId,
    contractId: contract.id,
    hiddenName: resident.name,
    residentId: resident.id,
    record: {
      slotId: "autosave",
      label: "Working People runtime fixture",
      seed,
      updatedAt: 1,
      playTicks: world.meta.completedTick,
      settlementCount: world.settlements.length,
      connectedCount: 0,
      worldJson: JSON.stringify(envelope),
    },
  };
}

describe("runtime Working People heavy-porter expression", () => {
  it("presents, persists, and perceives one nearby heavy departure without replaying audio", async () => {
    const fixture = workingPeopleFixture("runtime heavy porter voice", {
      heavy: true,
      nearPlayer: true,
    });
    const repository = new MemoryRepository(fixture.record);
    const perceptionSpy = vi.spyOn(humanPerception, "collectExistingHumanObservations");
    const runtime = await createTideweftRuntime(repository);
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);

    const expressions = runtime.getRenderView().expressions ?? [];
    expect(expressions).toHaveLength(1);
    expect(expressions[0]).toMatchObject({
      sourceActorId: fixture.actorId,
      sourceKind: "human",
      speakerLabel: "Unknown porter",
      tone: "strained",
    });
    expect(expressions[0]?.speakerLabel).not.toBe(fixture.hiddenName);
    expect(runtime.getUIView().expressionCaption).toEqual(expect.objectContaining({
      id: expressions[0]?.id,
      speakerLabel: "Unknown porter",
      tone: "strained",
    }));
    expect(strainedCueCount()).toBe(1);

    await runtime.save();
    const committed = decodeCurrent(repository);
    const committedWorld = deserializeWorld(committed.world);
    const departures = committedWorld.events.filter((event) =>
      event.type === "contract-departed" && event.subjectId === fixture.contractId
    );
    expect(departures).toHaveLength(1);
    expect(departures[0]?.data.residentId).toBe(fixture.residentId);
    const residentChannel = committed.perceptionCarry.situatedExpressionChannels.channels
      .find(({ sourceActorId }) => sourceActorId === fixture.actorId);
    expect(residentChannel?.state.active).toMatchObject({
      sourceActorId: fixture.actorId,
      meaning: "porter-heavy-load",
      tone: "strained",
      audioAcknowledged: true,
    });
    if (residentChannel?.state.active === undefined || residentChannel.state.active === null) {
      throw new Error("saved heavy porter channel lost its active event");
    }
    expect(workingPeopleExpressionEventMatchesWorld(
      createWorldView(committedWorld),
      residentChannel.state.active,
    )).toBe(true);
    expect(residentChannel?.reception).toMatchObject({
      kind: "heard-visible",
      eventId: residentChannel?.state.active?.eventId,
      sourceActorId: fixture.actorId,
      directVisualReceipt: true,
    });
    const admission = committed.perceptionCarry.situatedExpressionAdmissions.records[0];
    expect(committed.perceptionCarry.situatedExpressionAdmissions.records).toHaveLength(1);
    expect(Object.keys(admission ?? {}).sort()).toEqual([
      "admittedAtPlayerStepPhase",
      "eventId",
      "hearingCertainty",
      "kind",
      "listenerFacingMilliRadians",
      "listenerPosition",
      "receivedAtTick",
      "sampleOrdinal",
      "sourceActorId",
      "triggerEventId",
      "version",
    ]);
    expect(admission).toEqual({
      version: 1,
      eventId: residentChannel.state.active.eventId,
      sourceActorId: fixture.actorId,
      triggerEventId: residentChannel.state.active.triggerEventId,
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      kind: "porter-heavy-departure",
      receivedAtTick: committedWorld.meta.completedTick,
      listenerPosition: expect.objectContaining({
        region: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        localX: expect.any(Number),
        localY: expect.any(Number),
      }),
      listenerFacingMilliRadians: expect.any(Number),
      hearingCertainty: residentChannel.reception?.certainty,
    });
    if (admission?.kind !== "porter-heavy-departure") {
      throw new Error("saved heavy porter channel lost its phase-zero admission");
    }
    expect(committed.perceptionCarry.intervalStartPosition).toEqual(admission.listenerPosition);
    expect(committed.perceptionCarry.intervalStartFacingMilliRadians)
      .toBe(admission.listenerFacingMilliRadians);
    expect(committed.perceptionCarry.situatedExpressionCausalAuthority)
      .toEqual({ version: 1, records: [] });
    expect(committed.perceptionCarry.actorVocalizationSamples).toEqual([
      expect.objectContaining({
        expressionEventId: residentChannel?.state.active?.eventId,
        sourceActorId: fixture.actorId,
        soundClass: "human-vocalization",
        soundInterrupt: "none",
      }),
    ]);
    const sample = committed.perceptionCarry.actorVocalizationSamples[0];
    if (!sample) throw new Error("heavy porter expression omitted its perception sample");
    runtime.destroy();

    const cueCountBeforeReload = strainedCueCount();
    perceptionSpy.mockClear();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    expect(strainedCueCount()).toBe(cueCountBeforeReload);
    expect(resumed.getUIView().expressionCaption).toEqual(expect.objectContaining({
      speakerLabel: "Unknown porter",
      tone: "strained",
    }));

    advancePlayerSteps(resumed, 10);
    const matchingIntervals = perceptionSpy.mock.calls
      .map(([input]) => input.supplementalSoundSamples ?? [])
      .filter((samples) => samples.some(({ id }) => id === sample.id));
    expect(matchingIntervals).toHaveLength(1);
    expect(matchingIntervals[0]?.filter(({ id }) => id === sample.id)).toEqual([
      expect.objectContaining({
        sourceActorId: fixture.actorId,
        soundClass: "human-vocalization",
      }),
    ]);
    expect(strainedCueCount()).toBe(cueCountBeforeReload);
    resumed.destroy();
  });

  it("preserves an expired pending porter receipt across reload, consumes it once, then closes its interval", async () => {
    const fixture = workingPeopleFixture("runtime expired porter voice receipt", {
      heavy: true,
      nearPlayer: true,
    });
    const repository = new MemoryRepository(fixture.record);
    const runtime = await createTideweftRuntime(repository);
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);
    advancePlayerSteps(runtime, 8);
    await runtime.save();
    const expired = decodeCurrent(repository);
    const channel = expired.perceptionCarry.situatedExpressionChannels.channels
      .find(({ sourceActorId }) => sourceActorId === fixture.actorId);
    expect(channel?.state.active).toBeNull();
    expect(channel?.state.recent).toHaveLength(1);
    expect(expired.perceptionCarry.actorVocalizationSamples).toHaveLength(1);
    const pendingSample = expired.perceptionCarry.actorVocalizationSamples[0];
    if (!pendingSample) throw new Error("expired porter receipt lost its pending sound sample");
    const cueCountBeforeReload = strainedCueCount();
    runtime.destroy();

    const perceptionSpy = vi.spyOn(humanPerception, "collectExistingHumanObservations");
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    expect(resumed.getRenderView().expressions ?? []).toEqual([]);
    expect(strainedCueCount()).toBe(cueCountBeforeReload);

    advancePlayerSteps(resumed, 2);
    const matchingIntervals = perceptionSpy.mock.calls
      .map(([input]) => input.supplementalSoundSamples ?? [])
      .filter((samples) => samples.some(({ id }) => id === pendingSample.id));
    expect(matchingIntervals).toHaveLength(1);
    expect(strainedCueCount()).toBe(cueCountBeforeReload);
    await resumed.save();
    expect(decodeCurrent(repository).perceptionCarry).toMatchObject({
      actorVocalizationSamples: [],
      situatedExpressionChannels: { version: 1, channels: [] },
    });
    resumed.destroy();
  });

  it("rejects a self-consistent checksum whose expired porter cooldown was forged", async () => {
    const fixture = workingPeopleFixture("runtime forged porter cooldown", {
      heavy: true,
      nearPlayer: true,
    });
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 10);
    advancePlayerSteps(setup, 8);
    await setup.save();
    setup.destroy();

    const record = repository.snapshot();
    const decoded = JSON.parse(record.worldJson) as Record<string, unknown>;
    const carry = decoded.perceptionCarry as {
      situatedExpressionChannels: {
        channels: Array<{
          sourceActorId: string;
          state: { recent: Array<{ priority: number }> };
        }>;
      };
    };
    const channel = carry.situatedExpressionChannels.channels
      .find(({ sourceActorId }) => sourceActorId === fixture.actorId);
    const memory = channel?.state.recent[0];
    if (!memory) throw new Error("porter tamper fixture omitted its expired memory");
    memory.priority += 1;
    const { integrity: _integrity, ...base } = decoded;
    repository.replace({
      ...record,
      updatedAt: record.updatedAt + 1,
      worldJson: JSON.stringify({
        ...base,
        integrity: gameSaveEnvelopeIntegrity(base),
      }),
    });

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  });

  it.each([
    { label: "light Promise cargo", heavy: false, nearPlayer: true },
    { label: "a distant unobserved departure", heavy: true, nearPlayer: false },
  ])("stays silent for $label", async ({ label, heavy, nearPlayer }) => {
    const fixture = workingPeopleFixture(`runtime Working People negative ${label}`, {
      heavy,
      nearPlayer,
    });
    const repository = new MemoryRepository(fixture.record);
    const runtime = await createTideweftRuntime(repository);
    soundscapePlay.mockClear();

    advancePlayerSteps(runtime, 10);
    await runtime.save();

    const committed = decodeCurrent(repository);
    const committedWorld = deserializeWorld(committed.world);
    expect(committedWorld.events.some((event) =>
      event.type === "contract-departed" && event.subjectId === fixture.contractId
    )).toBe(true);
    expect(runtime.getRenderView().expressions ?? []).toEqual([]);
    expect(runtime.getUIView().expressionCaption).toBeUndefined();
    expect(strainedCueCount()).toBe(0);
    expect(committed.perceptionCarry.actorVocalizationSamples).toEqual([]);
    expect(committed.perceptionCarry.situatedExpressionChannels.channels.some(
      ({ sourceActorId }) => sourceActorId === fixture.actorId,
    )).toBe(false);
    runtime.destroy();
  });

  it.each([
    {
      label: "the sole admitted expression sample deleted while its channel remains",
      tamper(samples: humanPerception.SupplementalSoundSample[]) {
        samples.splice(0, 1);
      },
    },
    {
      label: "acoustics inconsistent with the exact expression event",
      tamper(samples: humanPerception.SupplementalSoundSample[]) {
        const first = samples[0];
        if (!first) throw new Error("tamper fixture omitted its voice sample");
        samples[0] = { ...first, soundRangeUnits: first.soundRangeUnits + 1_000 };
      },
    },
    {
      label: "a duplicate expression-event sample",
      tamper(samples: humanPerception.SupplementalSoundSample[], completedTick: number) {
        const first = samples[0];
        if (!first) throw new Error("tamper fixture omitted its voice sample");
        samples.push({ ...first, id: `av-${completedTick}-1` });
      },
    },
  ])("rejects a resealed current carry with $label", async ({ tamper }) => {
    const fixture = workingPeopleFixture("runtime heavy porter voice tamper", {
      heavy: true,
      nearPlayer: true,
    });
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 10);
    await setup.save();
    setup.destroy();

    const record = repository.snapshot();
    const decoded = JSON.parse(record.worldJson) as Record<string, unknown>;
    const carry = decoded.perceptionCarry as {
      actorVocalizationSamples: humanPerception.SupplementalSoundSample[];
    };
    const completedTick = deserializeWorld(String(decoded.world)).meta.completedTick;
    tamper(carry.actorVocalizationSamples, completedTick);
    repository.replace(resealCurrentRecord(record, decoded));

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  });

  it("rejects resealed porter admissions with forged event-time sensory evidence", async () => {
    const fixture = workingPeopleFixture("runtime porter admission sensory tamper", {
      heavy: true,
      nearPlayer: true,
    });
    const baselineRepository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(baselineRepository);
    advancePlayerSteps(setup, 10);
    await setup.save();
    setup.destroy();
    const baselineRecord = baselineRepository.snapshot();

    const tampers = [
      {
        label: "nonzero porter admission phase",
        apply(admission: MutablePorterAdmission) {
          admission.admittedAtPlayerStepPhase = 1;
        },
      },
      {
        label: "listener facing",
        apply(admission: MutablePorterAdmission) {
          admission.listenerFacingMilliRadians += 0.5;
        },
      },
      {
        label: "listener position",
        apply(admission: MutablePorterAdmission) {
          admission.listenerPosition.localX = admission.listenerPosition.localX
            < REGION_WIDTH_UNITS / 2
            ? admission.listenerPosition.localX + 10 * 1_000
            : admission.listenerPosition.localX - 10 * 1_000;
        },
      },
      {
        label: "hearing certainty",
        apply(admission: MutablePorterAdmission) {
          admission.hearingCertainty = admission.hearingCertainty < 1_000_000
            ? admission.hearingCertainty + 1
            : admission.hearingCertainty - 1;
        },
      },
      {
        label: "receipt tick",
        apply(admission: MutablePorterAdmission) {
          admission.receivedAtTick = admission.receivedAtTick > 0
            ? admission.receivedAtTick - 1
            : 1;
        },
      },
    ] as const;

    for (const tamper of tampers) {
      const decoded = JSON.parse(baselineRecord.worldJson) as Record<string, unknown>;
      const carry = decoded.perceptionCarry as {
        situatedExpressionAdmissions: { records: MutablePorterAdmission[] };
      };
      const admission = carry.situatedExpressionAdmissions.records.find(
        ({ kind }) => kind === "porter-heavy-departure",
      );
      if (admission === undefined) {
        throw new Error(`porter ${tamper.label} tamper fixture omitted its admission`);
      }
      tamper.apply(admission);
      const repository = new MemoryRepository(resealCurrentRecord(baselineRecord, decoded));
      scheduledFrame = undefined;
      const rejected = await createTideweftRuntime(repository);
      expect(rejected.getUIView().saveWarning?.message, tamper.label)
        .toBe("LOCAL AUTOSAVE UNREADABLE");
      rejected.destroy();
    }
  });

  it("rejects a coherently rewritten phase-zero porter listener pose and interval anchor", async () => {
    const fixture = workingPeopleFixture("runtime porter coherent listener pose tamper", {
      heavy: true,
      nearPlayer: true,
    });
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 10);
    await setup.save();
    setup.destroy();

    const record = repository.snapshot();
    const decoded = JSON.parse(record.worldJson) as Record<string, unknown>;
    const carry = decoded.perceptionCarry as {
      intervalStartPosition: { localX: number };
      intervalStartFacingMilliRadians: number;
      situatedExpressionAdmissions: { records: MutablePorterAdmission[] };
    };
    const admission = carry.situatedExpressionAdmissions.records.find(
      ({ kind }) => kind === "porter-heavy-departure",
    );
    if (admission === undefined || admission.admittedAtPlayerStepPhase !== 0) {
      throw new Error("coherent porter pose fixture omitted its phase-zero admission");
    }
    const relocatedX = admission.listenerPosition.localX < REGION_WIDTH_UNITS / 2
      ? admission.listenerPosition.localX + 10_000
      : admission.listenerPosition.localX - 10_000;
    const rewrittenFacing = admission.listenerFacingMilliRadians + 1;
    admission.listenerPosition.localX = relocatedX;
    admission.listenerFacingMilliRadians = rewrittenFacing;
    carry.intervalStartPosition.localX = relocatedX;
    carry.intervalStartFacingMilliRadians = rewrittenFacing;
    repository.replace(resealCurrentRecord(record, decoded));

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  });
});

type MutablePorterAdmission = {
  -readonly [Key in keyof PorterHeavyDepartureExpressionAdmissionRecord]:
    PorterHeavyDepartureExpressionAdmissionRecord[Key] extends Readonly<{
      region: infer Region;
      localX: infer LocalX;
      localY: infer LocalY;
    }>
      ? {
          region: Region;
          localX: LocalX;
          localY: LocalY;
        }
      : PorterHeavyDepartureExpressionAdmissionRecord[Key];
};
