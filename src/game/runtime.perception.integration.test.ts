import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  deserializeWorld,
  serializeWorld,
} from "../sim/public";
import { createPlayer } from "./player";
import { createSupplementalSoundSample } from "./humanPerception";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import {
  playerWorldPositionInRegionalWindow,
  resolveResidentWorldPlacement,
} from "./residentSpatial";
import { restorePlayerRegionalTravel } from "./regionalPlayerTravel";
import {
  SITUATED_EXPRESSION_VERSION,
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  createSituatedExpressionState,
  reduceSituatedExpression,
} from "./situatedExpression";
import {
  acknowledgeSituatedExpressionChannelBank,
  createSituatedExpressionChannelBank,
  reduceSituatedExpressionChannelBank,
} from "./situatedExpressionChannelBank";
import {
  appendSituatedExpressionAdmissionRecord,
  createGuardianDogWarningExpressionAdmissionRecord,
  createSituatedExpressionAdmissionLedger,
} from "./situatedExpressionAdmissionLedger";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { createSessionState } from "./sessionTypes";
import { WORLD_POSITION_UNITS_PER_TILE, type WorldPosition } from "./worldPosition";

const soundscapePlay = vi.hoisted(() => vi.fn());

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
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
    if (!this.record) throw new Error("test repository has no autosave");
    return structuredClone(this.record);
  }

  replace(record: SaveRecord): void {
    this.record = structuredClone(record);
  }
}

interface TestGameSaveEnvelope {
  readonly version: number;
  readonly world: string;
  readonly player: ReturnType<typeof createPlayer>;
  readonly regionalTravel?: string;
  readonly settlementEcology?: string;
  readonly perceptionCarry?: {
    readonly version: number;
    readonly intervalStartPosition?: WorldPosition;
    readonly intervalStartFacingMilliRadians?: number;
    readonly playerStepsSinceWorldTick: number;
    readonly playerSenseSamples: readonly { readonly sampleOrdinal: number }[];
    readonly playerStepStateSamples?: readonly ({
      readonly sampleOrdinal: number;
      readonly staminaAfter: number;
      readonly modeAfter: string;
    } | null)[];
    readonly actorVocalizationSamples?: readonly unknown[];
    readonly situatedExpressionAdmissions?: unknown;
    readonly situatedExpressionCausalAuthority?: unknown;
    readonly situatedExpressionChannels?: unknown;
    /** Legacy v33 / perception-carry-v2 fields. */
    readonly playerVocalizationSamples?: readonly unknown[];
    readonly situatedExpression?: unknown;
    readonly nextPlayerSenseSampleOrdinal: number;
  };
}

let scheduledFrame: ((now: number) => void) | undefined;

beforeEach(() => {
  scheduledFrame = undefined;
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

describe("runtime existing-human perception path", () => {
  it("turns ordinary player steps into saved human knowledge and a visible watching state", async () => {
    const fixture = perceptionFixture("runtime perception handoff");
    const repository = new MemoryRepository(fixture.record);
    const runtime = await createTideweftRuntime(repository);

    expect(runtime.getRenderView().porters.find(({ id }) => id === fixture.residentId))
      .toMatchObject({ state: "waiting" });

    advancePlayerSteps(runtime, 10);

    const visible = runtime.getRenderView().porters.find(({ id }) => id === fixture.residentId);
    expect(visible).toMatchObject({
      state: "watching",
      quickLabel: expect.stringContaining("watching you"),
      emotionMark: ":|",
    });

    await runtime.save();
    const committedWorld = savedWorld(repository);
    const committedTick = committedWorld.meta.completedTick;
    expect(committedWorld.residents).toHaveLength(42);
    expect(committedWorld.residents.every(({ perception }) => (
      perception.tick === committedTick
    ))).toBe(true);
    const resident = committedWorld.residents.find(
      ({ id }) => String(id) === fixture.residentId,
    );
    expect(resident?.perception).toMatchObject({
      tick: committedTick,
      suspicion: "identified",
      search: null,
    });
    expect(resident?.perception.beliefs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: "vision",
        subjectId: "player:local",
        identification: "identified",
        sourceObservationId: expect.stringMatching(
          new RegExp(`^hp-v-${committedTick}-\\d+-p-${committedTick - 1}-\\d+$`, "u"),
        ),
      }),
    ]));
    runtime.destroy();
  }, 30_000);

  it("restores committed perception through the ordinary outer save and reload path", async () => {
    const fixture = perceptionFixture("runtime perception reload");
    const repository = new MemoryRepository(fixture.record);
    const first = await createTideweftRuntime(repository);
    advancePlayerSteps(first, 10);
    await first.save();
    const beforeReload = savedResidentPerception(repository, fixture.residentId);
    first.destroy();

    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getRenderView().porters.find(({ id }) => id === fixture.residentId))
      .toMatchObject({ state: "watching" });

    await resumed.save();
    expect(savedResidentPerception(repository, fixture.residentId)).toEqual(beforeReload);
    resumed.destroy();
  }, 30_000);

  it("loads the shape-compatible v38 fish-crow schema forward and rewrites v42", async () => {
    const fixture = perceptionFixture("runtime perception v38 forward read");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();

    const current = repository.snapshot();
    const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
    expect(decoded.version).toBe(42);
    const currentCarry = currentPerceptionCarry(decoded);
    const {
      animalContactAcousticCarry: _futureAnimalContactCarry,
      playerStepStateAnchor: _futurePlayerStepStateAnchor,
      playerStepStateSamples: _futurePlayerStepStateSamples,
      ...v7Carry
    } = currentCarry;
    const { integrity: _currentIntegrity, ...currentBase } = decoded;
    const v38Base = {
      ...currentBase,
      version: 38,
      perceptionCarry: { ...v7Carry, version: 7 },
    };
    repository.replace({
      ...current,
      payloadVersion: 38,
      updatedAt: current.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v38Base,
        integrity: gameSaveEnvelopeIntegrity(v38Base),
      }),
    });

    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    await resumed.save();
    expect(repository.snapshot().payloadVersion).toBe(42);
    expect(savedEnvelope(repository).version).toBe(42);
    resumed.destroy();
  }, 30_000);

  it("loads the exact v39 human-warning carry with an empty physical-contact lane", async () => {
    const fixture = perceptionFixture("runtime perception v39 contact-carry migration");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();

    const current = repository.snapshot();
    const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
    const {
      animalContactAcousticCarry: _futureAnimalContactCarry,
      playerStepStateAnchor: _futurePlayerStepStateAnchor,
      playerStepStateSamples: _futurePlayerStepStateSamples,
      ...v7Carry
    } = currentPerceptionCarry(decoded);
    const { integrity: _integrity, ...currentBase } = decoded;
    const v39Base = {
      ...currentBase,
      version: 39,
      perceptionCarry: { ...v7Carry, version: 7 },
    };
    repository.replace({
      ...current,
      payloadVersion: 39,
      updatedAt: current.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v39Base,
        integrity: gameSaveEnvelopeIntegrity(v39Base),
      }),
    });

    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getUIView().saveWarning).toBeUndefined();
    await resumed.save();
    expect(repository.snapshot().payloadVersion).toBe(42);
    expect(savedEnvelope(repository)).toMatchObject({
      version: 42,
      perceptionCarry: {
        version: 10,
        animalContactAcousticCarry: { version: 1, records: [] },
      },
    });
    resumed.destroy();
  }, 30_000);

  it("keeps an identified walking player's last-known point at the latest sampled position", async () => {
    const fixture = perceptionFixture("runtime perception latest point");
    const repository = new MemoryRepository(fixture.record);
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(runtime, 20);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await runtime.save();

    const envelope = savedEnvelope(repository);
    const saved = deserializeWorld(envelope.world);
    if (!envelope.regionalTravel) throw new Error("current runtime save omitted regional travel");
    const player = structuredClone(envelope.player);
    const travel = restorePlayerRegionalTravel(saved.meta.rootSeed, player, envelope.regionalTravel);
    if (!travel) throw new Error("current runtime save did not restore its spatial frame");
    const playerPosition = playerWorldPositionInRegionalWindow(travel.window, player);
    if (!playerPosition) throw new Error("saved player did not have a canonical world position");
    const perception = saved.residents.find(({ id }) => String(id) === fixture.residentId)?.perception;
    const playerBelief = perception?.beliefs.find(({ subjectId }) => subjectId === "player:local");

    expect(playerBelief?.lastObservedTick).toBe(saved.meta.completedTick);
    expect(playerBelief?.area).toEqual({ center: playerPosition, radiusUnits: 0 });
    runtime.destroy();
  }, 30_000);

  it("commits the same cognition after a ninth-substep save/reload as uninterrupted play", async () => {
    const referenceFixture = perceptionFixture("runtime perception interrupted interval");
    const interruptedFixture = perceptionFixture("runtime perception interrupted interval");
    const referenceRepository = new MemoryRepository(referenceFixture.record);
    const interruptedRepository = new MemoryRepository(interruptedFixture.record);
    const reference = await createTideweftRuntime(referenceRepository);
    const interrupted = await createTideweftRuntime(interruptedRepository);

    for (const runtime of [reference, interrupted]) {
      runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
      advancePlayerSteps(runtime, 9);
      runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    }
    await interrupted.save();
    const pending = savedEnvelope(interruptedRepository);
    expect(pending).toMatchObject({
      version: 42,
      perceptionCarry: {
        version: 10,
        intervalStartPosition: expect.any(Object),
        intervalStartFacingMilliRadians: expect.any(Number),
        playerStepsSinceWorldTick: 9,
        nextPlayerSenseSampleOrdinal: 9,
        actorVocalizationSamples: [],
        situatedExpressionAdmissions: { version: 1, records: [] },
        situatedExpressionCausalAuthority: { version: 1, records: [] },
        situatedExpressionChannels: {
          version: 1,
          channels: [],
        },
      },
    });
    expect(pending.perceptionCarry?.playerSenseSamples.map(({ sampleOrdinal }) => sampleOrdinal))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pending.perceptionCarry?.playerStepStateSamples?.map((sample) => (
      sample?.sampleOrdinal ?? null
    ))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pending.perceptionCarry?.playerStepStateSamples?.at(-1)).toMatchObject({
      staminaAfter: pending.player.stamina,
      modeAfter: pending.player.mode,
    });
    interrupted.destroy();

    advancePlayerSteps(reference, 1);
    await reference.save();
    const uninterruptedPerception = savedResidentPerception(
      referenceRepository,
      referenceFixture.residentId,
    );
    reference.destroy();

    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(interruptedRepository);
    advancePlayerSteps(resumed, 1);
    await resumed.save();
    expect(savedResidentPerception(interruptedRepository, interruptedFixture.residentId))
      .toEqual(uninterruptedPerception);
    expect(savedEnvelope(interruptedRepository).perceptionCarry).toMatchObject({
      playerStepsSinceWorldTick: 0,
      playerSenseSamples: [],
      playerStepStateSamples: [],
      nextPlayerSenseSampleOrdinal: 0,
    });
    resumed.destroy();
  }, 90_000);

  it("migrates the exact sealed v32 perception carry without erasing v32 player recovery authority", async () => {
    const fixture = perceptionFixture("runtime perception v32 voice migration");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 3);
    await setup.save();
    setup.destroy();

    const current = repository.snapshot();
    const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
    const currentCarry = currentPerceptionCarry(decoded);
    const {
      actorVocalizationSamples: _futureVocalizations,
      animalContactAcousticCarry: _futureAnimalContactCarry,
      intervalStartFacingMilliRadians: _futureIntervalStartFacing,
      intervalStartPosition: _futureIntervalStartPosition,
      playerStepStateAnchor: _futurePlayerStepStateAnchor,
      playerStepStateSamples: _futurePlayerStepStateSamples,
      situatedExpressionAdmissions: _futureAdmissions,
      situatedExpressionCausalAuthority: _futureCausalAuthority,
      situatedExpressionChannels: _futureExpressionChannels,
      ...v1Carry
    } = currentCarry;
    const { integrity: _currentIntegrity, ...currentBase } = decoded;
    const v32Base = {
      ...currentBase,
      version: 32,
      perceptionCarry: { ...v1Carry, version: 1 },
    };
    repository.replace({
      ...current,
      payloadVersion: 32,
      updatedAt: current.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v32Base,
        integrity: gameSaveEnvelopeIntegrity(v32Base),
      }),
    });

    scheduledFrame = undefined;
    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    expect(savedEnvelope(repository)).toMatchObject({
      version: 42,
      player: { timeAction: null },
      perceptionCarry: {
        version: 10,
        intervalStartPosition: expect.any(Object),
        intervalStartFacingMilliRadians: expect.any(Number),
        playerStepsSinceWorldTick: 3,
        playerStepStateSamples: [null, null, null],
        nextPlayerSenseSampleOrdinal: 3,
        actorVocalizationSamples: [],
        situatedExpressionAdmissions: {
          version: 1,
          records: [],
        },
        situatedExpressionCausalAuthority: { version: 1, records: [] },
        situatedExpressionChannels: {
          version: 1,
          channels: [],
        },
      },
    });
    migrated.destroy();
  }, 60_000);

  it("migrates the exact sealed v33 perception-carry-v2 schema to current v42", async () => {
    const fixture = perceptionFixture("runtime perception v33 carry migration");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 3);
    await setup.save();
    setup.destroy();

    const legacy = replaceWithLegacyV33Envelope(repository);

    scheduledFrame = undefined;
    soundscapePlay.mockClear();
    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay).not.toHaveBeenCalled();
    await migrated.save();
    expect(savedEnvelope(repository)).toMatchObject({
      version: 42,
      perceptionCarry: {
        version: 10,
        intervalStartPosition: expect.any(Object),
        intervalStartFacingMilliRadians: 0,
        playerStepsSinceWorldTick: 3,
        playerStepStateSamples: [null, null, null],
        nextPlayerSenseSampleOrdinal: 3,
        actorVocalizationSamples: [{
          expressionEventId: legacy.eventId,
          id: `av-${legacy.completedTick}-0`,
          sourceActorId: "player:local",
          soundClass: "human-vocalization",
        }],
        situatedExpressionAdmissions: {
          version: 1,
          records: [{
            kind: "legacy-v33-player",
            eventId: legacy.eventId,
            sourceActorId: "player:local",
            triggerEventId: "player:0:traversal:0",
            sampleOrdinal: 0,
            admittedAtPlayerStepPhase: 0,
          }],
        },
        situatedExpressionCausalAuthority: { version: 1, records: [] },
        situatedExpressionChannels: {
          version: 1,
          channels: [{
            sourceActorId: "player:local",
            reception: {
              eventId: legacy.eventId,
              sourceActorId: "player:local",
              receivedAtTick: legacy.completedTick,
              kind: "self",
              certainty: 1_000_000,
            },
            state: {
              active: {
                eventId: legacy.eventId,
                sourceActorId: "player:local",
                audioAcknowledged: true,
              },
            },
          }],
        },
      },
    });
    migrated.destroy();
  }, 60_000);

  it("migrates the exact sealed v34 carry-v3 schema to v42 without replay", async () => {
    const fixture = perceptionFixture("runtime perception v34 carry migration");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 3);
    await setup.save();
    setup.destroy();

    const current = repository.snapshot();
    const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
    const {
      animalContactAcousticCarry: _futureAnimalContactCarry,
      playerStepStateAnchor: _futurePlayerStepStateAnchor,
      playerStepStateSamples: _futurePlayerStepStateSamples,
      ...v3Carry
    } = currentPerceptionCarry(decoded);
    const { integrity: _integrity, ...currentBase } = decoded;
    const v34Base = {
      ...currentBase,
      version: 34,
      perceptionCarry: { ...v3Carry, version: 3 },
    };
    repository.replace({
      ...current,
      payloadVersion: 34,
      updatedAt: current.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v34Base,
        integrity: gameSaveEnvelopeIntegrity(v34Base),
      }),
    });

    soundscapePlay.mockClear();
    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    expect(soundscapePlay).not.toHaveBeenCalled();
    await migrated.save();
    expect(savedEnvelope(repository)).toMatchObject({
      version: 42,
      perceptionCarry: {
        version: 10,
        playerStepsSinceWorldTick: 3,
        playerStepStateSamples: [null, null, null],
        nextPlayerSenseSampleOrdinal: 3,
      },
    });
    migrated.destroy();
  }, 60_000);

  it("rejects an unowned historical sleep-suppression bit in a resealed v39 carry", async () => {
    const fixture = perceptionFixture("runtime perception rejects sleep-bit authority");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();

    resealCurrentEnvelope(repository, (envelope) => {
      currentPerceptionCarry(envelope).intervalStartDetailPerceptionSuppressed = true;
    });

    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  }, 60_000);

  it("rejects dog-call semantics smuggled through a resealed v34 carry-v3", async () => {
    const fixture = perceptionFixture("runtime perception v34 dog semantic fence");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();

    const current = repository.snapshot();
    const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
    const carry = currentPerceptionCarry(decoded);
    const position = carry.intervalStartPosition as WorldPosition;
    const completedTick = deserializeWorld(String(decoded.world)).meta.completedTick;
    const triggerEventId = "dog:v34-smuggle:activity";
    const reduced = reduceSituatedExpressionChannelBank(
      createSituatedExpressionChannelBank(),
      {
        version: SITUATED_EXPRESSION_VERSION,
        sourceActorId: "dog:v34-smuggle",
        triggerEventId,
        position,
        meaning: "guardian-dog-warning",
        family: "animal-signal",
        tone: "alarmed",
        volume: "shout",
        knowledgeBasis: "self-heard-anonymous-alarm",
        priority: 760_000,
        salience: 520_000,
        variantSeed: 34,
        durationSteps: 6,
      },
      null,
    );
    const acknowledged = acknowledgeSituatedExpressionChannelBank(reduced.bank);
    const event = reduced.event;
    const admission = createGuardianDogWarningExpressionAdmissionRecord({
      sourceActorId: "dog:v34-smuggle",
      triggerEventId,
      sampleOrdinal: 0,
      admittedAtPlayerStepPhase: 0,
      assignmentId: "assignment:v34-smuggle",
      activityTransactionId: triggerEventId,
      sourceObservationId: "observation:v34-smuggle",
      acceptedAtTick: completedTick,
    });
    const admissions = admission === null
      ? null
      : appendSituatedExpressionAdmissionRecord(
          createSituatedExpressionAdmissionLedger(),
          admission,
        );
    const acoustics = situatedExpressionAcoustics("shout");
    const sample = event === null ? null : createSupplementalSoundSample({
      expressionEventId: event.eventId,
      id: `av-${completedTick}-0`,
      position,
      soundLoudness: acoustics.loudness,
      soundRangeUnits: acoustics.rangeUnits,
      soundClass: "animal-alarm",
      soundInterrupt: "strong",
      sourceActorId: event.sourceActorId,
    });
    if (acknowledged.bank === null || event === null || admissions === null || sample === null) {
      throw new Error("v34 semantic-fence fixture could not build a canonical dog trajectory");
    }
    const {
      animalContactAcousticCarry: _futureAnimalContactCarry,
      playerStepStateAnchor: _futurePlayerStepStateAnchor,
      playerStepStateSamples: _futurePlayerStepStateSamples,
      ...v3Carry
    } = carry;
    const { integrity: _integrity, ...currentBase } = decoded;
    const v34Base = {
      ...currentBase,
      version: 34,
      perceptionCarry: {
        ...v3Carry,
        version: 3,
        actorVocalizationSamples: [sample],
        situatedExpressionAdmissions: admissions,
        situatedExpressionChannels: acknowledged.bank,
      },
    };
    repository.replace({
      ...current,
      payloadVersion: 34,
      updatedAt: current.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v34Base,
        integrity: gameSaveEnvelopeIntegrity(v34Base),
      }),
    });

    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  }, 60_000);

  it("rejects a coherently relocated earlier expression trajectory beyond one player step", async () => {
    const fixture = perceptionFixture("runtime perception relocated expression trajectory");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 3);
    await setup.save();
    setup.destroy();

    replaceWithLegacyV33Envelope(repository);
    scheduledFrame = undefined;
    const migrated = await createTideweftRuntime(repository);
    expect(migrated.getUIView().saveWarning).toBeUndefined();
    await migrated.save();
    migrated.destroy();

    resealCurrentEnvelope(repository, (envelope) => {
      const carry = currentPerceptionCarry(envelope);
      const samples = carry.playerSenseSamples;
      const sounds = carry.actorVocalizationSamples;
      const channels = (carry.situatedExpressionChannels as {
        channels?: Array<{
          sourceActorId?: unknown;
          state?: { active?: { position?: { localX?: unknown } } | null };
        }>;
      } | undefined)?.channels;
      if (!Array.isArray(samples) || !Array.isArray(sounds) || !Array.isArray(channels)) {
        throw new Error("relocated trajectory fixture omitted current expression authorities");
      }
      const firstSample = samples[0] as {
        position?: { localX?: unknown };
      } | undefined;
      const sound = sounds[0] as {
        position?: { localX?: unknown };
      } | undefined;
      const active = channels.find(({ sourceActorId }) => sourceActorId === "player:local")
        ?.state?.active;
      if (
        typeof firstSample?.position?.localX !== "number"
        || typeof sound?.position?.localX !== "number"
        || typeof active?.position?.localX !== "number"
      ) throw new Error("relocated trajectory fixture omitted its bound positions");
      const displacement = 5 * WORLD_POSITION_UNITS_PER_TILE;
      firstSample.position.localX += displacement;
      sound.position.localX += displacement;
      active.position.localX += displacement;
    });

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  }, 90_000);

  it("rejects a resealed v33 envelope whose old v2 carry has a future field", async () => {
    const fixture = perceptionFixture("runtime perception v33 carry rejection");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 3);
    await setup.save();
    setup.destroy();

    replaceWithLegacyV33Envelope(repository, (carry) => {
      carry.situatedExpressionChannels = { version: 1, channels: [] };
    });

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  }, 60_000);

  it("rejects v34-only porter semantics smuggled through a resealed v33 carry", async () => {
    const fixture = perceptionFixture("runtime perception v33 semantic fence");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 3);
    await setup.save();
    setup.destroy();

    replaceWithLegacyV33Envelope(repository, (carry) => {
      const legacyState = carry.situatedExpression as {
        readonly active?: { readonly position?: WorldPosition } | null;
      };
      const position = legacyState.active?.position;
      if (!position) throw new Error("v33 semantic-fence fixture omitted its active position");
      const future = reduceSituatedExpression(createSituatedExpressionState(), {
        version: SITUATED_EXPRESSION_VERSION,
        sourceActorId: "player:local",
        triggerEventId: "test:v33-future-porter-expression",
        position,
        meaning: "porter-heavy-load",
        family: "work",
        tone: "strained",
        volume: "spoken",
        knowledgeBasis: "self-handled-heavy-cargo",
        priority: 240_000,
        salience: 420_000,
        variantSeed: 34,
        durationSteps: 8,
      });
      if (!future.accepted || future.state === null) {
        throw new Error("v33 semantic-fence fixture could not create future expression state");
      }
      carry.playerVocalizationSamples = [];
      carry.situatedExpression = future.state;
    });

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  }, 60_000);

  it("migrates a sealed v4 regional save to an empty current perception interval", async () => {
    const fixture = perceptionFixture("runtime perception v4 migration");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();

    const current = repository.snapshot();
    const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
    const {
      integrity: _currentIntegrity,
      perceptionCarry: _currentPerceptionCarry,
      regionalEcology: _currentRegionalEcology,
      bio0Ecology: _currentBio0Ecology,
      coreEcology: _currentCoreEcology,
      settlementEcology: _currentSettlementEcology,
      dogActorRoster: _currentDogActorRoster,
      settlementWorkingAnimals: _currentSettlementWorkingAnimals,
      settlementDomesticAnimalRecovery: _currentSettlementDomesticAnimalRecovery,
      porterResponse: _currentPorterResponse,
      livingActorPlayerChoice: _currentLivingActorPlayerChoice,
      ...currentBase
    } = decoded;
    const {
      timeAction: _futureTimeAction,
      ...legacyPlayer
    } = decoded.player as Record<string, unknown>;
    const v4Base = { ...currentBase, player: legacyPlayer, version: 4 };
    repository.replace({
      ...current,
      payloadVersion: 4,
      updatedAt: current.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v4Base,
        integrity: gameSaveEnvelopeIntegrity(v4Base),
      }),
    });

    const migrated = await createTideweftRuntime(repository);
    await migrated.save();
    expect(savedEnvelope(repository)).toMatchObject({
      version: 42,
      perceptionCarry: {
        version: 10,
        intervalStartPosition: expect.any(Object),
        intervalStartFacingMilliRadians: expect.any(Number),
        playerStepsSinceWorldTick: 0,
        playerSenseSamples: [],
        playerStepStateSamples: [],
        actorVocalizationSamples: [],
        situatedExpressionAdmissions: { version: 1, records: [] },
        situatedExpressionCausalAuthority: { version: 1, records: [] },
        situatedExpressionChannels: {
          version: 1,
          channels: [],
        },
        nextPlayerSenseSampleOrdinal: 0,
      },
    });
    migrated.destroy();
  }, 60_000);

  it.each([
    {
      label: "an extra carry field",
      tamper(envelope: Record<string, unknown>) {
        currentPerceptionCarry(envelope).unexpected = true;
      },
    },
    {
      label: "a discontinuous next ordinal",
      tamper(envelope: Record<string, unknown>) {
        currentPerceptionCarry(envelope).nextPlayerSenseSampleOrdinal = 2;
      },
    },
    {
      label: "a missing current step-state trajectory",
      tamper(envelope: Record<string, unknown>) {
        delete currentPerceptionCarry(envelope).playerStepStateSamples;
      },
    },
    {
      label: "a missing current step-state anchor",
      tamper(envelope: Record<string, unknown>) {
        delete currentPerceptionCarry(envelope).playerStepStateAnchor;
      },
    },
    {
      label: "a step-state anchor detached from its current prefix",
      tamper(envelope: Record<string, unknown>) {
        const anchor = currentPerceptionCarry(envelope).playerStepStateAnchor;
        if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) {
          throw new Error("fixture carry omitted its step-state anchor");
        }
        (anchor as Record<string, unknown>).sampleOrdinal = 2;
      },
    },
    {
      label: "a shortened current step-state trajectory",
      tamper(envelope: Record<string, unknown>) {
        const samples = currentPerceptionCarry(envelope).playerStepStateSamples;
        if (!Array.isArray(samples)) throw new Error("fixture carry omitted step state");
        samples.pop();
      },
    },
    {
      label: "a non-prefix unavailable step-state hole",
      tamper(envelope: Record<string, unknown>) {
        const samples = currentPerceptionCarry(envelope).playerStepStateSamples;
        if (!Array.isArray(samples) || samples.length < 3) {
          throw new Error("fixture carry omitted enough step state");
        }
        samples[1] = null;
      },
    },
    {
      label: "a step-state ordinal detached from its sensory sample",
      tamper(envelope: Record<string, unknown>) {
        const samples = currentPerceptionCarry(envelope).playerStepStateSamples;
        const first = Array.isArray(samples) ? samples[0] : null;
        if (!first || typeof first !== "object" || Array.isArray(first)) {
          throw new Error("fixture carry omitted its first step state");
        }
        (first as Record<string, unknown>).sampleOrdinal = 2;
      },
    },
    {
      label: "a latest sample detached from the saved player",
      tamper(envelope: Record<string, unknown>) {
        const carry = currentPerceptionCarry(envelope);
        const samples = carry.playerSenseSamples;
        if (!Array.isArray(samples)) throw new Error("fixture carry omitted its samples");
        const latest = samples.at(-1);
        if (!latest || typeof latest !== "object" || Array.isArray(latest)) {
          throw new Error("fixture carry omitted its latest sample");
        }
        const position = (latest as Record<string, unknown>).position;
        if (!position || typeof position !== "object" || Array.isArray(position)) {
          throw new Error("fixture sample omitted its position");
        }
        const mutablePosition = position as Record<string, unknown>;
        if (typeof mutablePosition.localX !== "number") {
          throw new Error("fixture sample omitted local X");
        }
        mutablePosition.localX += 1;
      },
    },
    {
      label: "a vocalization without an expression-event authority binding",
      tamper(envelope: Record<string, unknown>) {
        const carry = currentPerceptionCarry(envelope);
        const samples = carry.playerSenseSamples;
        if (!Array.isArray(samples)) throw new Error("fixture carry omitted its samples");
        const first = samples[0];
        if (!first || typeof first !== "object" || Array.isArray(first)) {
          throw new Error("fixture carry omitted its first sample");
        }
        const position = (first as Record<string, unknown>).position;
        if (!position || typeof position !== "object" || Array.isArray(position)) {
          throw new Error("fixture sample omitted its position");
        }
        const samplePosition = position as Record<string, unknown>;
        if (
          typeof samplePosition.localX !== "number"
          || typeof samplePosition.localY !== "number"
          || !samplePosition.region
        ) throw new Error("fixture sample omitted its canonical position");
        const remoteLocalX = samplePosition.localX >= 5 * WORLD_POSITION_UNITS_PER_TILE
          ? samplePosition.localX - 5 * WORLD_POSITION_UNITS_PER_TILE
          : samplePosition.localX + 5 * WORLD_POSITION_UNITS_PER_TILE;
        const worldText = envelope.world;
        if (typeof worldText !== "string") throw new Error("fixture omitted its world");
        const completedTick = deserializeWorld(worldText).meta.completedTick;
        carry.actorVocalizationSamples = [{
          id: `av-${completedTick}-0`,
          position: {
            region: structuredClone(samplePosition.region),
            localX: remoteLocalX,
            localY: samplePosition.localY,
          },
          soundLoudness: 620_000,
          soundRangeUnits: 18 * WORLD_POSITION_UNITS_PER_TILE,
          soundClass: "human-vocalization",
          soundInterrupt: "none",
          sourceActorId: "player:local",
        }];
      },
    },
  ])("rejects a resealed current save with $label", async ({ tamper }) => {
    const fixture = perceptionFixture("runtime perception corrupt carry");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 3);
    await setup.save();
    setup.destroy();
    resealCurrentEnvelope(repository, tamper);

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  }, process.env.CI === "true" ? 90_000 : 30_000);

  it("clears a partial perception interval when an existing world is replaced", async () => {
    const fixture = perceptionFixture("runtime perception replacement reset");
    const repository = new MemoryRepository(fixture.record);
    const runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 5);
    await runtime.save();
    expect(savedEnvelope(repository).perceptionCarry).toMatchObject({
      playerStepsSinceWorldTick: 5,
      nextPlayerSenseSampleOrdinal: 5,
    });

    runtime.dispatchUI({
      type: "new-world",
      seed: "runtime perception replacement world",
      posture: "gale",
      sessionShape: "wander",
      restartPhrase: "restartrestartrestart",
    });
    await runtime.save();

    expect(savedWorld(repository).meta.seedText).toBe("runtime perception replacement world");
    expect(savedEnvelope(repository).perceptionCarry).toMatchObject({
      playerStepsSinceWorldTick: 0,
      playerSenseSamples: [],
      playerStepStateSamples: [],
      nextPlayerSenseSampleOrdinal: 0,
    });
    runtime.destroy();
  }, 60_000);
});

function perceptionFixture(seed: string): {
  readonly record: SaveRecord;
  readonly residentId: string;
} {
  const world = createWorld(seed, "standard");
  const economy = createWorldView(world);
  const resident = world.residents[0];
  if (!resident) throw new Error("fixture world needs one existing human");
  const placement = resolveResidentWorldPlacement(economy, resident);
  if (!placement || placement.position.region.x !== 0 || placement.position.region.y !== 0) {
    throw new Error("fixture resident needs a canonical compatibility placement");
  }

  const player = createPlayer(economy, resident.homeSettlementId);
  const tileIndex = placement.compatibilityTileIndex;
  player.x = placement.position.localX;
  player.y = placement.position.localY;
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.currentTrace = [tileIndex];
  player.surveyTrace = [tileIndex];
  player.discovered[tileIndex] = FIXED_POINT;

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
    residentId: String(resident.id),
    record: {
      slotId: "autosave",
      label: "Runtime perception fixture",
      seed,
      updatedAt: 1,
      playTicks: world.meta.completedTick,
      settlementCount: world.settlements.length,
      connectedCount: 0,
      worldJson: JSON.stringify(envelope),
    },
  };
}

function advancePlayerSteps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  let now = 100;
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(now);
    now += 100;
  }
  runtime.stop();
}

function savedWorld(repository: MemoryRepository) {
  const envelope = savedEnvelope(repository);
  return deserializeWorld(envelope.world);
}

function savedEnvelope(repository: MemoryRepository): TestGameSaveEnvelope {
  return JSON.parse(repository.snapshot().worldJson) as TestGameSaveEnvelope;
}

function savedResidentPerception(repository: MemoryRepository, residentId: string) {
  const resident = savedWorld(repository).residents.find(({ id }) => String(id) === residentId);
  if (!resident) throw new Error("saved world omitted fixture resident");
  return resident.perception;
}

function currentPerceptionCarry(envelope: Record<string, unknown>): Record<string, unknown> {
  const carry = envelope.perceptionCarry;
  if (!carry || typeof carry !== "object" || Array.isArray(carry)) {
    throw new Error("current fixture omitted its perception carry");
  }
  return carry as Record<string, unknown>;
}

function resealCurrentEnvelope(
  repository: MemoryRepository,
  tamper: (envelope: Record<string, unknown>) => void,
): void {
  const current = repository.snapshot();
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const { integrity: _integrity, ...unsealed } = decoded;
  const envelope = structuredClone(unsealed);
  tamper(envelope);
  repository.replace({
    ...current,
    updatedAt: current.updatedAt + 1,
    worldJson: JSON.stringify({
      ...envelope,
      integrity: gameSaveEnvelopeIntegrity(envelope),
    }),
  });
}

function replaceWithLegacyV33Envelope(
  repository: MemoryRepository,
  tamperCarry?: (carry: Record<string, unknown>) => void,
): { readonly completedTick: number; readonly eventId: string } {
  const current = repository.snapshot();
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const currentCarry = currentPerceptionCarry(decoded);
  const {
    actorVocalizationSamples: _currentVocalizations,
    animalContactAcousticCarry: _currentAnimalContactCarry,
    intervalStartFacingMilliRadians: _currentIntervalStartFacing,
    intervalStartPosition: _currentIntervalStartPosition,
    playerStepStateAnchor: _currentPlayerStepStateAnchor,
    playerStepStateSamples: _currentPlayerStepStateSamples,
    situatedExpressionAdmissions: _currentAdmissions,
    situatedExpressionCausalAuthority: _currentCausalAuthority,
    situatedExpressionChannels: _currentChannels,
    ...sharedCarry
  } = currentCarry;
  const rawSamples = currentCarry.playerSenseSamples;
  if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
    throw new Error("v33 migration fixture requires one carried player sample");
  }
  const firstSample = rawSamples[0];
  if (!firstSample || typeof firstSample !== "object" || Array.isArray(firstSample)) {
    throw new Error("v33 migration fixture has a malformed player sample");
  }
  const position = (firstSample as Record<string, unknown>).position as WorldPosition;
  const completedTick = deserializeWorld(String(decoded.world)).meta.completedTick;
  const triggerEventId = "player:0:traversal:0";
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), {
    version: SITUATED_EXPRESSION_VERSION,
    sourceActorId: "player:local",
    triggerEventId,
    position,
    meaning: "steady-after-stumble",
    family: "footing",
    tone: "restrained",
    volume: "murmur",
    knowledgeBasis: "self-felt-stumble",
    priority: 180_000,
    salience: 260_000,
    variantSeed: 33,
    durationSteps: 7,
  });
  if (!reduced.accepted || reduced.state === null || reduced.event === null) {
    throw new Error("v33 migration fixture could not create its player expression");
  }
  const acknowledged = acknowledgeSituatedExpression(reduced.state);
  if (acknowledged.reason !== "acknowledged" || acknowledged.state === null) {
    throw new Error("v33 migration fixture could not acknowledge its player expression");
  }
  const agedState = advanceSituatedExpression(acknowledged.state, 3);
  if (agedState === null) {
    throw new Error("v33 migration fixture could not age its player expression");
  }
  const legacyCarry: Record<string, unknown> = {
    ...sharedCarry,
    version: 2,
    playerVocalizationSamples: [{
      id: `pv-${completedTick}-0`,
      position,
      soundLoudness: 360_000,
      soundRangeUnits: 8 * WORLD_POSITION_UNITS_PER_TILE,
      soundClass: "human-vocalization",
      soundInterrupt: "none",
    }],
    situatedExpression: agedState,
  };
  tamperCarry?.(legacyCarry);
  const { integrity: _integrity, ...currentBase } = decoded;
  const legacyBase = {
    ...currentBase,
    version: 33,
    traversalFeedback: {
      version: 1,
      completedSteps: 3,
      nextTraversalOrdinal: 1,
      incident: {
        id: triggerEventId,
        actorId: 0,
        traversalOrdinal: 0,
        kind: "stumble",
        primaryCause: "loose-rock",
        label: "oop · loose rock",
        detail: "Brace or choose a sounder line.",
        position: { x: 0, y: 0 },
        remainingSteps: 7,
        totalSteps: 10,
        variantSeed: 33,
        cue: "stumble",
      },
      lastAudibleIncidentId: triggerEventId,
    },
    perceptionCarry: legacyCarry,
  };
  repository.replace({
    ...current,
    payloadVersion: 33,
    updatedAt: current.updatedAt + 1,
    worldJson: JSON.stringify({
      ...legacyBase,
      integrity: gameSaveEnvelopeIntegrity(legacyBase),
    }),
  });
  return { completedTick, eventId: reduced.event.eventId };
}
