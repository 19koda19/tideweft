import { describe, expect, it, vi } from "vitest";

import {
  createActorObservation,
  createActorPerceptionState,
  queryActorSearch,
  stepActorPerception,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import {
  LIVING_CIRCADIAN_OWNER_ID,
  LIVING_CIRCADIAN_VERSION,
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  gateResidentCircadianObservations,
  replaceResidentCircadian,
  residentHomeRestDestinationId,
} from "../sim/livingCircadian";
import { createWorld, createWorldView } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { FIXED_POINT, type ResidentState, type WorldState, type WorldView } from "../sim/types";
import {
  HUMAN_HEARING_MAX_RANGE_UNITS,
  HUMAN_PERCEPTION_MAX_RESIDENTS,
  HUMAN_PERCEPTION_MAX_OBSERVATIONS_PER_RESIDENT,
  HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES,
  HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES,
  HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES,
  LOCAL_PLAYER_SUBJECT_ID,
  collectExistingHumanObservations,
  createPhysicalSoundSample,
  createPlayerSenseSample,
  createSupplementalSoundSample,
  createUnadmittedAlarmSoundSample,
  type HumanObservationBatch,
  type HumanPerceptionInput,
  type HumanSupplementalListeningReceipt,
  type PhysicalSoundSample,
  type PlayerSenseSample,
  type SupplementalSoundSample,
  type UnadmittedAlarmSoundSample,
} from "./humanPerception";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { residentPlacementInRegionalWindow, resolveResidentWorldPlacement } from "./residentSpatial";
import { evaluateAudibleContact } from "./perception";
import { ambientNoiseAt } from "./physicalAcousticPerception";
import {
  SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE,
  situatedExpressionAcoustics,
  situatedExpressionSemanticFactForMemory,
  type SituatedExpressionSemanticFact,
} from "./situatedExpressionAcoustics";
import { createWorldPosition, worldPositionDelta, type WorldPosition } from "./worldPosition";

const OBSERVER_X = 24;
const OBSERVER_Y = 24;
const OBSERVER_INDEX = OBSERVER_Y * 96 + OBSERVER_X;

interface Fixture {
  readonly state: WorldState;
  readonly economy: WorldView;
  readonly world: WorldView;
  readonly window: RegionalTerrainWindow;
  readonly resident: ResidentState;
}

describe("existing-human sensory bridge", () => {
  it("uses exact terrain geometry and cover to block a human sight ray", () => {
    const clear = fixture("human sight clear", { facing: "east" });
    const blocked = fixture("human sight blocked", { facing: "east", ridgeAtX: OBSERVER_X + 2 });
    const sample = visualSample("ridge-target", OBSERVER_X + 4, OBSERVER_Y);

    expect(observationsFor(clear, [sample], 1).some(({ channel }) => channel === "vision"))
      .toBe(true);
    expect(observationsFor(blocked, [sample], 1).some(({ channel }) => channel === "vision"))
      .toBe(false);
  });

  describe("caller-authenticated surface sound support", () => {
    it.each(["supplemental", "physical", "unadmitted"] as const)(
      "lowers anonymous %s hearing across a dry ridge without grounding an unspecified source",
      (kind) => {
        const seed = `human surface hearing ${kind}`;
        const clear = fixture(seed, { facing: "west" });
        const blocked = fixture(seed, { facing: "west", ridgeAtX: OBSERVER_X + 2 });
        const id = `surface-${kind}`;
        const options = { soundRangeUnits: 20_000 };
        const suppliedSound = kind === "supplemental"
          ? { supplementalSoundSamples: [supplementalSoundSample(
              id, OBSERVER_X + 4, OBSERVER_Y, "HUMAN-OTHER", options,
            )] }
          : kind === "physical"
            ? { physicalSoundSamples: [physicalSoundSample(
                id, OBSERVER_X + 4, OBSERVER_Y, "OBJECT-CRATE-1", options,
              )] }
            : { unadmittedAlarmSoundSamples: [unadmittedAlarmSoundSample(
                id, OBSERVER_X + 4, OBSERVER_Y, "DEER-1", options,
              )] };
        const inputFor = (current: Fixture, surface: boolean): HumanPerceptionInput => ({
          world: current.world,
          window: current.window,
          targetTick: fixtureTick(current, 1),
          playerSamples: [],
          ...suppliedSound,
          ...(surface ? { surfaceSoundSampleIds: [id] } : {}),
        });
        const heardBy = (current: Fixture, surface: boolean) => batchFor(
          collectExistingHumanObservations(inputFor(current, surface)),
          current.resident.id,
        )?.observations.find(({ id: observationId }) => observationId.endsWith(`-${id}`));
        const before = JSON.stringify(suppliedSound);
        const clearHearing = heardBy(clear, true);
        const blockedHearing = heardBy(blocked, true);

        expect(clearHearing).toMatchObject({
          channel: "hearing", identification: "anonymous", subjectId: null,
        });
        expect(blockedHearing).toMatchObject({
          channel: "hearing", identification: "anonymous", subjectId: null,
        });
        expect(blockedHearing!.confidence).toBeLessThan(clearHearing!.confidence);
        expect(blockedHearing!.area.radiusUnits).toBeGreaterThan(0);
        expect(blockedHearing).not.toHaveProperty("sourceActorId");
        expect(blockedHearing).not.toHaveProperty("sourceId");
        expect(heardBy(blocked, false)).toEqual(heardBy(clear, false));
        expect(JSON.stringify(suppliedSound)).toBe(before);
      },
    );

    it("uses intrinsic player step surface support without caller metadata", () => {
      const clear = fixture("player steps own grounded support", { facing: "west" });
      const blocked = fixture("player steps own grounded support", {
        facing: "west", ridgeAtX: OBSERVER_X + 2,
      });
      const sample = soundSample("grounded-step", OBSERVER_X + 4, OBSERVER_Y, {
        soundRangeUnits: 20_000,
      });
      const clearHearing = observationsFor(clear, [sample], 1)
        .find(({ channel }) => channel === "hearing");
      const blockedHearing = observationsFor(blocked, [sample], 1)
        .find(({ channel }) => channel === "hearing");

      expect(clearHearing).toMatchObject({ channel: "hearing", subjectId: null });
      expect(blockedHearing).toMatchObject({ channel: "hearing", subjectId: null });
      expect(blockedHearing!.confidence).toBeLessThan(clearHearing!.confidence);
    });

    it("rejects malformed, duplicate, unknown, player, and over-cap support IDs before any receipt", () => {
      const current = fixture("surface metadata cannot invent a sample", { facing: "west" });
      const player = soundSample("player-step", OBSERVER_X + 1, OBSERVER_Y);
      const voice = supplementalSoundSample("surface-voice", OBSERVER_X + 2, OBSERVER_Y);
      const physical = physicalSoundSample("surface-impact", OBSERVER_X + 3, OBSERVER_Y, "OBJECT-CRATE-1");
      const alarm = unadmittedAlarmSoundSample("surface-alarm", OBSERVER_X + 4, OBSERVER_Y);
      const input: HumanPerceptionInput = {
        world: current.world,
        window: current.window,
        targetTick: fixtureTick(current, 1),
        playerSamples: [player],
        supplementalSoundSamples: [voice],
        physicalSoundSamples: [physical],
        unadmittedAlarmSoundSamples: [alarm],
      };
      const observer = vi.fn<(receipts: readonly HumanSupplementalListeningReceipt[]) => void>();
      const invalid: readonly unknown[] = [
        undefined, null, {}, voice.id,
        [voice.id, voice.id], ["missing-sound"], [voice.id, "extra-sound"], [player.id],
        [1], ["invalid sound id"], ["x".repeat(49)], new Array(1),
        Array.from({ length: HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES
          + HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES + 1 }, () => voice.id),
      ];
      const before = JSON.stringify(input);
      for (const surfaceSoundSampleIds of invalid) {
        expect(collectExistingHumanObservations({
          ...input, surfaceSoundSampleIds,
        } as unknown as HumanPerceptionInput, observer)).toEqual([]);
      }
      expect(observer).not.toHaveBeenCalled();
      const supported = collectExistingHumanObservations({
        ...input, surfaceSoundSampleIds: [voice.id, physical.id, alarm.id],
      });
      expect(supported.length).toBeGreaterThan(0);
      expect(collectExistingHumanObservations({
        ...input, surfaceSoundSampleIds: [alarm.id, physical.id, voice.id],
      })).toEqual(supported);
      expect(collectExistingHumanObservations({ ...input, surfaceSoundSampleIds: [] }))
        .toEqual(collectExistingHumanObservations(input));
      expect(JSON.stringify(input)).toBe(before);
    });
  });

  it("separates peripheral classification, moving silhouettes, and lit identity", () => {
    const current = fixture("light and movement disclose differently", { facing: "east" });
    const peripheral = observationsFor(current, [
      visualSample("peripheral", OBSERVER_X - 1, OBSERVER_Y),
    ], 1).find(({ channel }) => channel === "vision");
    const darkMovement = observationsFor(current, [
      visualSample("dark-movement", OBSERVER_X + 6, OBSERVER_Y, {
        lightVisibility: 0,
        movementSalience: FIXED_POINT,
      }),
    ], 1).find(({ channel }) => channel === "vision");
    const darkStill = observationsFor(current, [
      visualSample("dark-still", OBSERVER_X + 6, OBSERVER_Y, {
        lightVisibility: 0,
        movementSalience: 0,
      }),
    ], 1).find(({ channel }) => channel === "vision");
    const litStill = observationsFor(current, [
      visualSample("lit-still", OBSERVER_X + 6, OBSERVER_Y, {
        lightVisibility: FIXED_POINT,
        movementSalience: 0,
      }),
    ], 1).find(({ channel }) => channel === "vision");

    expect(peripheral).toMatchObject({ identification: "classified", subjectId: null });
    expect(darkMovement).toMatchObject({ identification: "classified", subjectId: null });
    expect(darkStill).toBeUndefined();
    expect(litStill).toMatchObject({
      identification: "identified",
      subjectId: LOCAL_PLAYER_SUBJECT_ID,
    });
  });

  it("lets rain and nearby turbulent water mask a sound that carries in calm air", () => {
    const calm = fixture("a step carries over dry ground", { facing: "west" });
    const masked = fixture("rain and river swallow a step", {
      facing: "west",
      turbulentWater: true,
      storm: true,
    });
    const step = soundSample("footstep", OBSERVER_X + 6, OBSERVER_Y, {
      soundLoudness: 800_000,
      soundRangeUnits: 20_000,
    });

    expect(observationsFor(calm, [step], 1).some(({ channel }) => channel === "hearing"))
      .toBe(true);
    expect(observationsFor(masked, [step], 1).some(({ channel }) => channel === "hearing"))
      .toBe(false);
  });

  it("keeps heard movement anonymous and represents only a derived uncertainty area", () => {
    const current = fixture("heard but not magically known", { facing: "west" });
    const sample = soundSample("branch-snap", OBSERVER_X + 4, OBSERVER_Y);
    const heard = observationsFor(current, [sample], 1)
      .find(({ channel }) => channel === "hearing");

    expect(heard).toMatchObject({
      channel: "hearing",
      perceivedClass: "movement-sound",
      identification: "anonymous",
      subjectId: null,
    });
    expect(heard?.area.radiusUnits).toBeGreaterThanOrEqual(250);
    expect(heard?.area.center).not.toEqual(sample.position);
  });

  it("closes only authenticated sleeping vision at a settlement refuge while preserving audible contact", () => {
    const legacy = homeFixture("sleeping sight gate", "legacy");
    const awake = homeFixture("sleeping sight gate", "awake");
    const sleeping = homeFixture("sleeping sight gate", "asleep", "foreign");
    const legacyObservations = observationsFor(
      legacy,
      [residentStimulus(legacy, "obvious-and-audible")],
      1,
    );
    const rawAwakeObservations = observationsFor(
      awake,
      [residentStimulus(awake, "obvious-and-audible")],
      1,
    );
    const rawSleepingObservations = observationsFor(
      sleeping,
      [residentStimulus(sleeping, "obvious-and-audible")],
      1,
    );
    const awakeObservations = gateResidentCircadianObservations({
      resident: awake.resident,
      targetTick: fixtureTick(awake, 1),
      observations: rawAwakeObservations,
    });
    const sleepingObservations = gateResidentCircadianObservations({
      resident: sleeping.resident,
      targetTick: fixtureTick(sleeping, 1),
      observations: rawSleepingObservations,
    });
    if (awakeObservations === null || sleepingObservations === null) {
      throw new Error("fixture observations must pass the resident channel gate");
    }

    expect(legacyObservations.some(({ channel }) => channel === "vision")).toBe(true);
    expect(legacyObservations.some(({ channel }) => channel === "hearing")).toBe(true);
    expect(awakeObservations).toEqual(legacyObservations);
    expect(rawSleepingObservations.map(({ channel }) => channel).sort())
      .toEqual(["hearing", "vision"]);
    expect(sleepingObservations.some(({ channel }) => channel === "vision")).toBe(false);
    expect(sleepingObservations).toContainEqual(expect.objectContaining({
      channel: "hearing",
      identification: "anonymous",
      subjectId: null,
    }));

    const lawfulHearing = rawSleepingObservations.find(({ channel }) => (
      channel === "hearing"
    ));
    const lawfulVision = rawSleepingObservations.find(({ channel }) => (
      channel === "vision"
    ));
    if (lawfulHearing === undefined || lawfulVision === undefined) {
      throw new Error("sleeping gate fixture omitted its two sensory channels");
    }
    expect(gateResidentCircadianObservations({
      resident: sleeping.resident,
      targetTick: fixtureTick(sleeping, 1),
      observations: [
        lawfulHearing,
        { ...lawfulVision, observerId: "HUMAN-TAMPERED-VISUAL" },
      ],
    })).toBeNull();

    const malformed = {
      ...awake.resident,
      circadian: {
        ...awake.resident.circadian!,
        restDestinationId: "resident-home:tampered",
      },
    };
    expect(gateResidentCircadianObservations({
      resident: malformed,
      targetTick: fixtureTick(awake, 1),
      observations: awakeObservations,
    })).toBeNull();
  });

  it("is independent of resident and stimulus array order", () => {
    const forward = fixture("sensory order has no authority", { facing: "east" });
    const reverse = fixture("sensory order has no authority", {
      facing: "east",
      reverseResidents: true,
    });
    const samples = [
      visualSample("visible", OBSERVER_X + 4, OBSERVER_Y),
      soundSample("audible", OBSERVER_X + 3, OBSERVER_Y, { sampleOrdinal: 1 }),
    ];
    const first = collectExistingHumanObservations({
      world: forward.world,
      window: forward.window,
      targetTick: fixtureTick(forward, 1),
      playerSamples: samples,
    });
    const second = collectExistingHumanObservations({
      world: reverse.world,
      window: reverse.window,
      targetTick: fixtureTick(reverse, 1),
      playerSamples: [...samples].reverse(),
    });

    expect(second).toEqual(first);
    expect(first.map(({ observerId }) => observerId))
      .toEqual([...first.map(({ observerId }) => observerId)].sort());
  });

  it("uses the latest lawful identified sample as the saved visual point", () => {
    const current = fixture("latest identified point wins", { facing: "east" });
    const early = visualSample("early", OBSERVER_X + 2, OBSERVER_Y, { sampleOrdinal: 0 });
    const late = visualSample("late", OBSERVER_X + 4, OBSERVER_Y, { sampleOrdinal: 1 });
    const forward = observationsFor(current, [early, late], 1)
      .filter(({ channel, subjectId }) => channel === "vision" && subjectId === LOCAL_PLAYER_SUBJECT_ID);
    const reverse = observationsFor(current, [late, early], 1)
      .filter(({ channel, subjectId }) => channel === "vision" && subjectId === LOCAL_PLAYER_SUBJECT_ID);

    expect(forward).toHaveLength(1);
    expect(forward[0]?.area).toEqual({ center: late.position, radiusUnits: 0 });
    expect(reverse).toEqual(forward);
  });

  it("hears a supplemental voice without creating or overriding a visual sighting", () => {
    const current = fixture("voice remains an acoustic fact", { facing: "east" });
    const early = visualSample("physical-early", OBSERVER_X + 2, OBSERVER_Y, {
      sampleOrdinal: 0,
    });
    const late = visualSample("physical-late", OBSERVER_X + 4, OBSERVER_Y, {
      sampleOrdinal: 1,
    });
    const voice = supplementalSoundSample(
      "voice-between-steps",
      OBSERVER_X + 6,
      OBSERVER_Y,
    );

    const observations = observationsFor(current, [early, late], 1, [voice]);
    expect(observations).toContainEqual(expect.objectContaining({
      channel: "hearing",
      perceivedClass: "human-vocalization",
      identification: "anonymous",
      subjectId: null,
    }));
    const identifiedVisuals = observations.filter(({ channel, subjectId }) => (
      channel === "vision" && subjectId === LOCAL_PLAYER_SUBJECT_ID
    ));
    expect(identifiedVisuals).toHaveLength(1);
    expect(identifiedVisuals[0]?.area).toEqual({ center: late.position, radiusUnits: 0 });
    expect(observations.some(({ id }) => id.includes(voice.id) && id.includes("-v-")))
      .toBe(false);

    const voiceOnly = observationsFor(current, [], 2, [
      supplementalSoundSample("voice-only", OBSERVER_X + 3, OBSERVER_Y),
    ]);
    expect(voiceOnly.some(({ channel }) => channel === "hearing")).toBe(true);
    expect(voiceOnly.some(({ channel }) => channel === "vision")).toBe(false);
  });

  it("suppresses a source's own vocalization while another nearby resident hears anonymously", () => {
    const current = fixture("a speaker does not perceive their own voice", { facing: "east" });
    const listener = current.state.residents.find(({ id }) => id !== current.resident.id);
    const route = current.state.routes[0];
    if (!listener || !route) throw new Error("voice fixture needs two residents and a route");
    listener.location = { kind: "route", routeId: route.id, progress: 0 };
    const rebuilt = rebuildWorld(current);
    const voice = supplementalSoundSample(
      "resident-voice",
      OBSERVER_X + 2,
      OBSERVER_Y,
      current.resident.identity.stableId,
    );

    const batches = collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1),
      playerSamples: [],
      supplementalSoundSamples: [voice],
    });
    const sourceObservations = batchFor(batches, current.resident.id)?.observations ?? [];
    const listenerObservations = batchFor(batches, listener.id)?.observations ?? [];

    expect(sourceObservations.some(({ id }) => id.includes(voice.id))).toBe(false);
    expect(listenerObservations).toContainEqual(expect.objectContaining({
      channel: "hearing",
      perceivedClass: "human-vocalization",
      identification: "anonymous",
      subjectId: null,
    }));
    expect(listenerObservations.find(({ id }) => id.includes(voice.id)))
      .not.toHaveProperty("sourceActorId");
  });

  it("lets clear authenticated factual speech teach one anonymous bounded fact", () => {
    const current = fixture("a keeper report can be understood", { facing: "east" });
    const listener = current.state.residents.find(({ id }) => id !== current.resident.id);
    const route = current.state.routes[0];
    if (!listener || !route) throw new Error("semantic voice fixture needs two residents");
    listener.location = { kind: "route", routeId: route.id, progress: 0 };
    const rebuilt = rebuildWorld(current);
    const fact = situatedExpressionSemanticFactForMemory({
      sourceActorId: current.resident.identity.stableId,
      triggerEventId: "settlement-store-closure:test",
      meaning: "keeper-secure-store-response",
      family: "work",
      priority: 600_000,
      meaningCooldownRemainingSteps: 30,
      familyCooldownRemainingSteps: 10,
    });
    if (fact === null) throw new Error("secured-store report must have semantic authority");
    const acoustics = situatedExpressionAcoustics({
      meaning: "keeper-secure-store-response",
      volume: "spoken",
    });
    const voice = supplementalSoundSample(
      "secured-store-report",
      OBSERVER_X + 2,
      OBSERVER_Y,
      current.resident.identity.stableId,
      {
        expressionEventId: fact.expressionEventId,
        soundLoudness: acoustics.loudness,
        soundRangeUnits: acoustics.rangeUnits,
      },
    );

    const batches = collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1),
      playerSamples: [],
      supplementalSoundSamples: [voice],
      supplementalSemanticFacts: [fact],
    });
    const sourceObservations = batchFor(batches, current.resident.id)?.observations ?? [];
    const listenerObservations = batchFor(batches, listener.id)?.observations ?? [];
    const understood = listenerObservations.find(({ id }) => id.includes(voice.id));

    expect(sourceObservations.some(({ id }) => id.includes(voice.id))).toBe(false);
    expect(understood).toMatchObject({
      channel: "hearing",
      perceivedClass: "store-secured-report",
      identification: "anonymous",
      subjectId: null,
      interrupt: "none",
    });
    expect(understood?.confidence)
      .toBeGreaterThanOrEqual(SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE);
    expect(understood?.area.radiusUnits).toBeGreaterThanOrEqual(250);
    expect(understood).not.toHaveProperty("sourceActorId");
    expect(understood).not.toHaveProperty("expressionEventId");

    const forged = { ...fact, sourceActorId: "HUMAN-FORGED-KEEPER" };
    expect(collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1),
      playerSamples: [],
      supplementalSoundSamples: [voice],
      supplementalSemanticFacts: [forged],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1),
      playerSamples: [],
      supplementalSoundSamples: [voice],
      supplementalSemanticFacts: [fact, fact],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1),
      playerSamples: [],
      supplementalSoundSamples: [voice],
      supplementalSemanticFacts: Array.from(
        { length: HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES + 1 },
        () => fact,
      ),
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1),
      playerSamples: [],
      supplementalSoundSamples: [voice],
      supplementalSemanticFacts: [{
        ...fact,
        minimumHearingConfidence:
          SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE - 1,
      }],
    })).toEqual([]);

    const weakVoice = supplementalSoundSample(
      "weak-secured-store-report",
      OBSERVER_X + 4,
      OBSERVER_Y,
      current.resident.identity.stableId,
      {
        expressionEventId: fact.expressionEventId,
        soundLoudness: acoustics.loudness,
        soundRangeUnits: acoustics.rangeUnits,
      },
    );
    const weakBatches = collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 2),
      playerSamples: [],
      supplementalSoundSamples: [weakVoice],
      supplementalSemanticFacts: [fact],
    });
    const weakObservations = batchFor(weakBatches, listener.id)?.observations ?? [];
    expect(weakObservations.find(({ id }) => id.includes(weakVoice.id))).toMatchObject({
      channel: "hearing",
      perceivedClass: "human-vocalization",
      identification: "anonymous",
    });
    expect(weakObservations.find(({ id }) => id.includes(weakVoice.id))?.confidence)
      .toBeLessThan(SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE);
  });

  describe("development supplemental-listening observer", () => {
    it.each([
      { name: "clear", offset: 2, storm: false, turbulentWater: false, outcome: "heard", understood: true },
      { name: "partial", offset: 4, storm: false, turbulentWater: false, outcome: "heard", understood: false },
      { name: "masked", offset: 6, storm: true, turbulentWater: true, outcome: "not-heard", understood: false },
    ] as const)("reports the actual $name keeper calculation without inventing understanding", ({
      name, offset, storm, turbulentWater, outcome, understood,
    }) => {
      const current = keeperListeningFixture(`observed keeper ${name}`, offset, { storm, turbulentWater });
      const before = JSON.stringify([current.input, current.listener.perception]);
      const observer = vi.fn<(receipts: readonly HumanSupplementalListeningReceipt[]) => void>();
      const withoutObserver = collectExistingHumanObservations(current.input);
      const batches = collectExistingHumanObservations(current.input, observer);

      expect(batches).toEqual(withoutObserver);
      expect(observer).toHaveBeenCalledOnce();
      const receipts = observer.mock.calls[0]![0];
      expect(receipts).toHaveLength(batches.length);
      const receipt = receipts.find(({ residentId }) => residentId === current.listener.id);
      const placement = resolveResidentWorldPlacement(current.fixture.economy, current.listener);
      const projected = placement === null ? null : residentPlacementInRegionalWindow(placement, current.fixture.window);
      if (placement === null || projected === null) throw new Error("listening fixture lost its actual listener");
      const delta = worldPositionDelta(placement.position, current.voice.position);
      const masking = ambientNoiseAt(current.fixture.world, projected.tileIndex);
      if (masking === null) throw new Error("listening fixture lost its actual masking");
      const contact = evaluateAudibleContact({
        listener: { x: 0, y: 0 }, source: { x: delta.x, y: delta.y },
        baseRange: current.voice.soundRangeUnits,
        sourceLoudness: current.voice.soundLoudness / FIXED_POINT,
        ambientNoise: masking,
        wind: {
          x: current.fixture.world.weather.windX / FIXED_POINT,
          y: current.fixture.world.weather.windY / FIXED_POINT,
        },
      });
      expect(receipt).toMatchObject({
        expressionEventId: current.voice.expressionEventId,
        sourceActorId: current.voice.sourceActorId,
        sampleId: current.voice.id,
        residentId: current.listener.id,
        observerId: current.listener.identity.stableId,
        observedAtTick: current.input.targetTick,
        outcome,
        contact,
        semanticFact: current.fact,
      });
      const observation = batchFor(batches, current.listener.id)?.observations.find(({ channel }) => channel === "hearing") ?? null;
      expect(receipt?.observation).toEqual(observation);
      if (outcome === "heard") {
        expect(contact).not.toBeNull();
        expect(observation).toMatchObject({
          perceivedClass: understood ? "store-secured-report" : "human-vocalization",
          subjectId: null, identification: "anonymous", channel: "hearing",
        });
        if (understood) expect(observation!.confidence).toBeGreaterThanOrEqual(SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE);
        else expect(observation!.confidence).toBeLessThan(SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE);
        expect(receipt!.contact).not.toBe(contact);
        expect(receipt!.observation).not.toBe(observation);
      } else {
        expect(contact).toBeNull();
        expect(observation).toBeNull();
      }
      expect(receipt!.semanticFact).not.toBe(current.fact);
      expect(JSON.stringify([current.input, current.listener.perception])).toBe(before);
      const sourceReceipt = receipts.find(({ observerId }) => observerId === current.voice.sourceActorId);
      expect(sourceReceipt).toMatchObject({
        expressionEventId: current.voice.expressionEventId,
        sourceActorId: current.voice.sourceActorId,
        sampleId: current.voice.id,
        outcome: "source-excluded", contact: null, observation: null,
      });
      expect(batchFor(batches, current.fixture.resident.id)?.observations).toEqual([]);
    });

    it("returns detached immutable receipts once and isolates observer mutation and failure", () => {
      const current = keeperListeningFixture("listening observer cannot become authority");
      const before = JSON.stringify(current.input);
      const withoutObserver = collectExistingHumanObservations(current.input);
      let retained: readonly HumanSupplementalListeningReceipt[] | undefined;
      let mutationResults: boolean[] = [];
      let allFrozen = false;
      const observer = vi.fn((receipts: readonly HumanSupplementalListeningReceipt[]) => {
        retained = receipts;
        allFrozen = receiptObjects(receipts).every(Object.isFrozen);
        const heard = receipts.find(({ residentId }) => residentId === current.listener.id)!;
        mutationResults = [
          Reflect.set(receipts, "length", 0),
          Reflect.set(heard, "outcome", "not-heard"),
          Reflect.set(heard.contact!, "certainty", 0),
          Reflect.set(heard.semanticFact!, "minimumHearingConfidence", 0),
          Reflect.set(heard.observation!.area.center, "localX", 999),
        ];
        throw new Error("optional receipt sink failed");
      });
      const batches = collectExistingHumanObservations(current.input, observer);

      expect(observer).toHaveBeenCalledOnce();
      expect(retained).toBeDefined();
      expect(allFrozen).toBe(true);
      expect(mutationResults).toEqual([false, false, false, false, false]);
      expect(batches).toEqual(withoutObserver);
      expect(JSON.stringify(current.input)).toBe(before);
      const originalObjects = new Set(receiptObjects([current.input, batches]));
      expect(receiptObjects(retained!).every((value) => !originalObjects.has(value))).toBe(true);
      const repeated = vi.fn<(receipts: readonly HumanSupplementalListeningReceipt[]) => void>();
      expect(collectExistingHumanObservations(current.input, repeated)).toEqual(batches);
      expect(repeated.mock.calls[0]![0]).toEqual(retained);
      expect(repeated.mock.calls[0]![0]).not.toBe(retained);
    });

    it("does not notify when a later eligible listener invalidates the complete batch", () => {
      const current = keeperListeningFixture("no partial listening publication");
      const route = current.fixture.state.routes[0];
      if (route === undefined) throw new Error("listener failure fixture needs an existing route");
      for (const resident of current.fixture.state.residents) resident.location = { kind: "route", routeId: route.id, progress: 0 };
      const eligible = [...current.fixture.state.residents].sort((left, right) => (
        left.identity.stableId < right.identity.stableId ? -1 : left.identity.stableId > right.identity.stableId ? 1 : 0
      )).slice(0, HUMAN_PERCEPTION_MAX_RESIDENTS);
      const later = eligible.at(-1);
      if (later === undefined || eligible.length < 2) throw new Error("listener failure fixture needs ordered residents");
      const control = rebuildWorld(current.fixture);
      const observer = vi.fn<(receipts: readonly HumanSupplementalListeningReceipt[]) => void>();
      const controlInput = { ...current.input, world: control.world, window: control.window };
      const validBatches = collectExistingHumanObservations(controlInput, observer);
      expect(validBatches.length).toBeGreaterThan(1);
      expect(observer).toHaveBeenCalledOnce();
      expect(observer.mock.calls[0]![0].some(({ outcome, observerId }) => (
        outcome === "heard" && observerId !== later.identity.stableId
      ))).toBe(true);

      later.perception = createActorPerceptionState(later.identity.stableId, current.input.targetTick);
      const invalid = rebuildWorld(current.fixture);
      observer.mockClear();
      expect(collectExistingHumanObservations({
        ...current.input, world: invalid.world, window: invalid.window,
      }, observer)).toEqual([]);
      expect(observer).not.toHaveBeenCalled();
    });

    it("does not notify for malformed input, duplicate samples or a forged semantic source", () => {
      const current = keeperListeningFixture("invalid sound is not a diagnostic receipt");
      const observer = vi.fn<(receipts: readonly HumanSupplementalListeningReceipt[]) => void>();
      for (const input of [
        { ...current.input, targetTick: Number.NaN },
        { ...current.input, supplementalSoundSamples: [current.voice, current.voice] },
        { ...current.input, supplementalSemanticFacts: [{ ...current.fact, sourceActorId: "HUMAN-FORGED-KEEPER" }] },
      ]) {
        expect(collectExistingHumanObservations(input, observer)).toEqual([]);
      }
      expect(observer).not.toHaveBeenCalled();
    });

    it("distinguishes unavailable source geometry from an actual zero-volume calculation", () => {
      const current = keeperListeningFixture("unavailable is not unheard");
      const distant = createSupplementalSoundSample({
        ...current.voice,
        position: createWorldPosition(createRegionCoord(-1_000_000, 1_000_000), 500, 500),
      });
      const quiet = createSupplementalSoundSample({ ...current.voice, soundLoudness: 0 });
      if (distant === null || quiet === null) throw new Error("valid listening diagnostic fixtures were rejected");
      for (const [voice, outcome] of [[distant, "unavailable"], [quiet, "not-heard"]] as const) {
        const observer = vi.fn<(receipts: readonly HumanSupplementalListeningReceipt[]) => void>();
        const batches = collectExistingHumanObservations({ ...current.input, supplementalSoundSamples: [voice] }, observer);
        expect(observer).toHaveBeenCalledOnce();
        expect(observer.mock.calls[0]![0].find(({ residentId }) => residentId === current.listener.id)).toMatchObject({
          expressionEventId: voice.expressionEventId, sampleId: voice.id,
          outcome, contact: null, observation: null,
        });
        expect(batchFor(batches, current.listener.id)?.observations).toEqual([]);
      }
    });

    it("does not turn ordinary supplemental hearing into a factual understanding candidate", () => {
      const current = keeperListeningFixture("ordinary voice has no fact decoder");
      const observer = vi.fn<(receipts: readonly HumanSupplementalListeningReceipt[]) => void>();
      const batches = collectExistingHumanObservations({ ...current.input, supplementalSemanticFacts: [] }, observer);
      expect(observer).toHaveBeenCalledOnce();
      const receipt = observer.mock.calls[0]![0].find(({ residentId }) => residentId === current.listener.id);
      expect(receipt).toMatchObject({ outcome: "heard", semanticFact: null });
      expect(receipt?.observation).toEqual(batchFor(batches, current.listener.id)?.observations[0]);
      expect(receipt?.observation?.perceivedClass).toBe("human-vocalization");
    });

    it("bounds synthetic diagnostic occupancy to the existing resident and sound capacities", () => {
      const current = fixture("finite listening receipt occupancy", { facing: "east" });
      const template = current.resident;
      const route = current.state.routes[0];
      if (route === undefined) throw new Error("bounded listening fixture needs an existing route");
      current.state.residents = Array.from({ length: HUMAN_PERCEPTION_MAX_RESIDENTS + 5 }, (_, index) => {
        const stableId = `HUMAN-receipt-cap-${String(index).padStart(3, "0")}`;
        return {
          ...template,
          id: index + 1,
          identity: { ...template.identity, stableId },
          perception: createActorPerceptionState(stableId, current.state.meta.completedTick),
          location: { kind: "route" as const, routeId: route.id, progress: 0 },
        };
      });
      const rebuilt = buildFixture(current.state, current.state.residents[0]!);
      const voices = Array.from({ length: HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES }, (_, index) => (
        supplementalSoundSample(`receipt-cap-${index}`, OBSERVER_X + 2, OBSERVER_Y)
      ));
      const observer = vi.fn<(receipts: readonly HumanSupplementalListeningReceipt[]) => void>();
      const batches = collectExistingHumanObservations({
        world: rebuilt.world, window: rebuilt.window,
        targetTick: fixtureTick(rebuilt, 1), playerSamples: [], supplementalSoundSamples: voices,
      }, observer);
      expect(batches).toHaveLength(HUMAN_PERCEPTION_MAX_RESIDENTS);
      expect(observer).toHaveBeenCalledOnce();
      const receipts = observer.mock.calls[0]![0];
      expect(receipts).toHaveLength(HUMAN_PERCEPTION_MAX_RESIDENTS * HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES);
      expect(new Set(receipts.map(({ observerId }) => observerId)).size).toBe(HUMAN_PERCEPTION_MAX_RESIDENTS);
      expect(receipts.every(({ outcome }) => outcome === "heard")).toBe(true);
      expect(new Set(receipts.map(({ observerId, sampleId }) => `${observerId}/${sampleId}`)).size).toBe(receipts.length);
    });

    it("does not expose the optional receipt observer outside development", () => {
      const current = keeperListeningFixture("production hearing has no inspector");
      const withoutObserver = collectExistingHumanObservations(current.input);
      const observer = vi.fn<(receipts: readonly HumanSupplementalListeningReceipt[]) => void>();
      try {
        vi.stubEnv("DEV", false);
        expect(collectExistingHumanObservations(current.input, observer)).toEqual(withoutObserver);
        expect(observer).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  it("binds semantic facts to their own voice events independent of input order", () => {
    const current = fixture("two keeper reports keep their own authority", { facing: "east" });
    const otherSource = current.state.residents.find(({ id }) => id !== current.resident.id);
    const listener = current.state.residents.find(({ id }) => (
      id !== current.resident.id && id !== otherSource?.id
    ));
    const route = current.state.routes[0];
    if (!otherSource || !listener || !route) {
      throw new Error("ordered semantic voice fixture needs three residents and a route");
    }
    otherSource.location = { kind: "route", routeId: route.id, progress: 0 };
    listener.location = { kind: "route", routeId: route.id, progress: 0 };
    const rebuilt = rebuildWorld(current);
    const firstFact = situatedExpressionSemanticFactForMemory({
      sourceActorId: current.resident.identity.stableId,
      triggerEventId: "settlement-store-closure:ordered-a",
      meaning: "keeper-secure-store-response",
      family: "work",
      priority: 600_000,
      meaningCooldownRemainingSteps: 30,
      familyCooldownRemainingSteps: 10,
    });
    const secondFact = situatedExpressionSemanticFactForMemory({
      sourceActorId: otherSource.identity.stableId,
      triggerEventId: "settlement-store-closure:ordered-b",
      meaning: "keeper-secure-store-response",
      family: "work",
      priority: 600_000,
      meaningCooldownRemainingSteps: 30,
      familyCooldownRemainingSteps: 10,
    });
    if (firstFact === null || secondFact === null) {
      throw new Error("ordered secured-store reports must have semantic authority");
    }
    const acoustics = situatedExpressionAcoustics({
      meaning: "keeper-secure-store-response",
      volume: "spoken",
    });
    const firstVoice = supplementalSoundSample(
      "ordered-secured-store-a",
      OBSERVER_X + 2,
      OBSERVER_Y,
      current.resident.identity.stableId,
      {
        expressionEventId: firstFact.expressionEventId,
        soundLoudness: acoustics.loudness,
        soundRangeUnits: acoustics.rangeUnits,
      },
    );
    const secondVoice = supplementalSoundSample(
      "ordered-secured-store-b",
      OBSERVER_X + 2,
      OBSERVER_Y,
      otherSource.identity.stableId,
      {
        expressionEventId: secondFact.expressionEventId,
        soundLoudness: acoustics.loudness,
        soundRangeUnits: acoustics.rangeUnits,
      },
    );

    const forward = collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1),
      playerSamples: [],
      supplementalSoundSamples: [firstVoice, secondVoice],
      supplementalSemanticFacts: [firstFact, secondFact],
    });
    const reversed = collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1),
      playerSamples: [],
      supplementalSoundSamples: [secondVoice, firstVoice],
      supplementalSemanticFacts: [secondFact, firstFact],
    });

    expect(reversed).toEqual(forward);
    const reports = batchFor(forward, listener.id)?.observations.filter(({ perceivedClass }) => (
      perceivedClass === "store-secured-report"
    )) ?? [];
    expect(reports).toHaveLength(2);
    expect(reports.some(({ id }) => id.includes(firstVoice.id))).toBe(true);
    expect(reports.some(({ id }) => id.includes(secondVoice.id))).toBe(true);
  });

  it("fails closed when a supplemental voice lacks a canonical authenticated source", () => {
    const current = fixture("unauthenticated sound teaches nothing", { facing: "east" });
    const valid = supplementalSoundSample("authenticated-voice", OBSERVER_X + 2, OBSERVER_Y);
    const { sourceActorId: _omitted, ...missingSource } = valid;
    const invalidSource = { ...valid, sourceActorId: "invalid actor id" };

    expect(createSupplementalSoundSample(
      missingSource as unknown as SupplementalSoundSample,
    )).toBeNull();
    expect(createSupplementalSoundSample(invalidSource)).toBeNull();
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [],
      supplementalSoundSamples: [missingSource as unknown as SupplementalSoundSample],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [],
      supplementalSoundSamples: [invalidSource],
    })).toEqual([]);
  });

  it("routes supplemental voices through the shared masking and range evaluator", () => {
    const calm = fixture("a voice carries over calm ground", { facing: "west" });
    const masked = fixture("weather masks the same voice", {
      facing: "west",
      turbulentWater: true,
      storm: true,
    });
    const audible = supplementalSoundSample(
      "carrying-voice",
      OBSERVER_X + 6,
      OBSERVER_Y,
      LOCAL_PLAYER_SUBJECT_ID,
      { soundLoudness: 800_000, soundRangeUnits: 20_000 },
    );
    const shortRange = supplementalSoundSample(
      "short-voice",
      OBSERVER_X + 6,
      OBSERVER_Y,
      LOCAL_PLAYER_SUBJECT_ID,
      { soundRangeUnits: 1_000 },
    );

    expect(observationsFor(calm, [], 1, [audible])
      .some(({ channel }) => channel === "hearing")).toBe(true);
    expect(observationsFor(masked, [], 1, [audible])
      .some(({ channel }) => channel === "hearing")).toBe(false);
    expect(observationsFor(calm, [], 1, [shortRange])
      .some(({ channel }) => channel === "hearing")).toBe(false);
  });

  it("lets a nearby restrained effort murmur carry only when the acoustic world permits it", () => {
    const calm = fixture("nearby effort can be heard", { facing: "west" });
    const masked = fixture("storm water masks nearby effort", {
      facing: "west",
      turbulentWater: true,
      storm: true,
    });
    const effort = supplementalSoundSample(
      "dry-exhaustion-effort",
      OBSERVER_X + 2,
      OBSERVER_Y,
      LOCAL_PLAYER_SUBJECT_ID,
      { soundLoudness: 360_000, soundRangeUnits: 8_000 },
    );

    expect(observationsFor(calm, [], 1, [effort])).toContainEqual(
      expect.objectContaining({
        channel: "hearing",
        perceivedClass: "human-vocalization",
        identification: "anonymous",
        subjectId: null,
      }),
    );
    expect(observationsFor(masked, [], 1, [effort])
      .some(({ id }) => id.includes(effort.id))).toBe(false);
  });

  it("copies a bounded domain alarm without claiming an admitted expression", () => {
    const raw: UnadmittedAlarmSoundSample = {
      id: "unadmitted-domain-alarm",
      acousticEventId: "DEER-1:e:ca:alarm",
      sourceActorId: "DEER-1",
      position: worldPoint(OBSERVER_X + 3, OBSERVER_Y),
      soundClass: "animal-alarm",
      soundInterrupt: "strong",
      soundLoudness: FIXED_POINT,
      soundRangeUnits: HUMAN_HEARING_MAX_RANGE_UNITS,
    };
    const sample = createUnadmittedAlarmSoundSample(raw);

    expect(sample).toEqual(raw);
    expect(sample).not.toBe(raw);
    expect(Object.isFrozen(sample)).toBe(true);
    expect(Object.isFrozen(sample?.position)).toBe(true);
    expect(sample).not.toHaveProperty("expressionEventId");
    expect(createUnadmittedAlarmSoundSample({
      ...raw,
      acousticEventId: "a".repeat(192),
    })).not.toBeNull();
  });

  it("hears an unadmitted domain alarm anonymously with its explicit strong interrupt", () => {
    const current = fixture("alarm hearing does not need an expression", { facing: "west" });
    const alarm = unadmittedAlarmSoundSample("unadmitted-alarm", OBSERVER_X + 4, OBSERVER_Y);
    const before = JSON.stringify(current.state);
    const observations = observationsFor(current, [], 1, [], [], [], [alarm]);
    const heard = observations.find(({ id }) => id.includes(alarm.id));

    expect(heard).toMatchObject({
      channel: "hearing",
      perceivedClass: "animal-alarm",
      identification: "anonymous",
      subjectId: null,
      interrupt: "strong",
    });
    expect(heard?.area.radiusUnits).toBeGreaterThanOrEqual(250);
    expect(heard?.area.center).not.toEqual(alarm.position);
    expect(heard).not.toHaveProperty("sourceActorId");
    expect(heard).not.toHaveProperty("acousticEventId");
    expect(heard).not.toHaveProperty("expressionEventId");
    expect(observations.some(({ channel }) => channel === "vision")).toBe(false);
    expect(JSON.stringify(current.state)).toBe(before);
    expect(observationsFor(current, [], 1)).toEqual([]);
  });

  it("excludes an unadmitted alarm's source while another nearby resident hears", () => {
    const current = fixture("an alarm is not a source's self-observation", { facing: "east" });
    const listener = current.state.residents.find(({ id }) => id !== current.resident.id);
    const route = current.state.routes[0];
    if (!listener || !route) throw new Error("alarm fixture needs two residents and a route");
    listener.location = { kind: "route", routeId: route.id, progress: 0 };
    const rebuilt = rebuildWorld(current);
    const alarm = unadmittedAlarmSoundSample(
      "resident-domain-alarm",
      OBSERVER_X + 2,
      OBSERVER_Y,
      current.resident.identity.stableId,
    );
    const batches = collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1),
      playerSamples: [],
      unadmittedAlarmSoundSamples: [alarm],
    });

    expect(batchFor(batches, current.resident.id)?.observations).toEqual([]);
    expect(batchFor(batches, listener.id)?.observations).toContainEqual(expect.objectContaining({
      channel: "hearing",
      perceivedClass: "animal-alarm",
      identification: "anonymous",
      subjectId: null,
      interrupt: "strong",
    }));
  });

  it("keeps unadmitted alarm hearing subject to masking, range, and the current frame", () => {
    const calm = fixture("a domain alarm carries in calm air", { facing: "west" });
    const masked = fixture("storm water masks a domain alarm", {
      facing: "west",
      turbulentWater: true,
      storm: true,
    });
    const carrying = unadmittedAlarmSoundSample(
      "carrying-domain-alarm", OBSERVER_X + 6, OBSERVER_Y, "DEER-1",
      { soundLoudness: 800_000, soundRangeUnits: 20_000 },
    );
    const short = unadmittedAlarmSoundSample(
      "short-domain-alarm", OBSERVER_X + 6, OBSERVER_Y, "DEER-1",
      { soundRangeUnits: 1_000 },
    );
    const silent = unadmittedAlarmSoundSample(
      "silent-domain-alarm", OBSERVER_X + 2, OBSERVER_Y, "DEER-1",
      { soundLoudness: 0 },
    );
    const outOfFrame = {
      ...carrying,
      position: createWorldPosition(createRegionCoord(-1_000_000, 1_000_000), 500, 500),
    };

    expect(observationsFor(calm, [], 1, [], [], [], [carrying])).toHaveLength(1);
    expect(observationsFor(masked, [], 1, [], [], [], [carrying])).toEqual([]);
    expect(observationsFor(calm, [], 1, [], [], [], [short])).toEqual([]);
    expect(observationsFor(calm, [], 1, [], [], [], [silent])).toEqual([]);
    expect(observationsFor(calm, [], 1, [], [], [], [outOfFrame])).toEqual([]);
  });

  it("orders mixed world hearing deterministically without changing resident or source order", () => {
    const seed = "mixed domain alarm inputs have no ordering authority";
    const forward = fixture(seed, { facing: "west" });
    const reversed = fixture(seed, { facing: "west", reverseResidents: true });
    const alarms = [
      unadmittedAlarmSoundSample("z-domain-alarm", OBSERVER_X + 3, OBSERVER_Y),
      unadmittedAlarmSoundSample("a-domain-alarm", OBSERVER_X + 4, OBSERVER_Y, "DEER-2"),
    ];
    const impacts = [
      physicalSoundSample("z-impact", OBSERVER_X + 2, OBSERVER_Y, "CRATE-1"),
      physicalSoundSample("a-impact", OBSERVER_X + 3, OBSERVER_Y, "CRATE-2"),
    ];

    expect(observationsFor(forward, [], 1, [], impacts, [], alarms)).toHaveLength(4);
    expect(observationsFor(forward, [], 1, [], impacts, [], alarms)).toEqual(
      observationsFor(reversed, [], 1, [], [...impacts].reverse(), [], [...alarms].reverse()),
    );
  });

  it("fails closed for invalid unadmitted alarm shapes instead of repairing their meaning", () => {
    const current = fixture("invalid domain alarms have no sensory meaning", { facing: "east" });
    const valid = unadmittedAlarmSoundSample("valid-domain-alarm", OBSERVER_X + 2, OBSERVER_Y);
    const { acousticEventId: _omitted, ...missingEvent } = valid;
    const malformed: readonly unknown[] = [
      missingEvent,
      { ...valid, acousticEventId: "invalid event id" },
      { ...valid, acousticEventId: "a".repeat(193) },
      { ...valid, sourceActorId: "invalid actor id" },
      { ...valid, sourceActorId: "A".repeat(193) },
      { ...valid, id: "a".repeat(49) },
      { ...valid, soundClass: "animal-call" },
      { ...valid, soundInterrupt: "none" },
      { ...valid, soundLoudness: FIXED_POINT + 1 },
      { ...valid, soundLoudness: 0.5 },
      { ...valid, soundRangeUnits: HUMAN_HEARING_MAX_RANGE_UNITS + 1 },
      { ...valid, soundRangeUnits: -1 },
      { ...valid, position: { ...valid.position, localX: -1 } },
      { ...valid, expressionEventId: "situated-expression:event:not-admitted" },
      { ...valid, [Symbol("hidden")]: true },
      Object.assign(Object.create({ inherited: true }), valid),
      null,
      [],
    ];

    for (const raw of malformed) {
      expect(createUnadmittedAlarmSoundSample(raw as UnadmittedAlarmSoundSample)).toBeNull();
      expect(collectExistingHumanObservations({
        world: current.world,
        window: current.window,
        targetTick: fixtureTick(current, 1),
        playerSamples: [],
        unadmittedAlarmSoundSamples: [raw as UnadmittedAlarmSoundSample],
      })).toEqual([]);
    }
    for (const raw of [undefined, null, {}, "alarm"]) {
      expect(collectExistingHumanObservations({
        world: current.world,
        window: current.window,
        targetTick: fixtureTick(current, 1),
        playerSamples: [],
        unadmittedAlarmSoundSamples: raw,
      } as unknown as Parameters<typeof collectExistingHumanObservations>[0])).toEqual([]);
    }
  });

  it("rejects duplicate alarm identities and collisions across every hearing input", () => {
    const current = fixture("one domain event cannot appear twice", { facing: "east" });
    const alarm = unadmittedAlarmSoundSample("unique-alarm", OBSERVER_X + 2, OBSERVER_Y);
    const impact = physicalSoundSample("unique-impact", OBSERVER_X + 2, OBSERVER_Y, "CRATE-1");
    const player = soundSample("unique-step", OBSERVER_X + 2, OBSERVER_Y);
    const voice = supplementalSoundSample("unique-voice", OBSERVER_X + 2, OBSERVER_Y);

    for (const duplicate of [alarm, { ...alarm, id: "same-domain-event" }]) {
      expect(collectExistingHumanObservations({
        world: current.world,
        window: current.window,
        targetTick: fixtureTick(current, 1),
        playerSamples: [],
        unadmittedAlarmSoundSamples: [alarm, duplicate],
      })).toEqual([]);
    }
    for (const collision of [
      { ...alarm, id: impact.id },
      { ...alarm, id: player.id },
      { ...alarm, id: voice.id },
      { ...alarm, acousticEventId: impact.acousticEventId },
    ]) {
      expect(collectExistingHumanObservations({
        world: current.world,
        window: current.window,
        targetTick: fixtureTick(current, 1),
        playerSamples: [player],
        supplementalSoundSamples: [voice],
        physicalSoundSamples: [impact],
        unadmittedAlarmSoundSamples: [collision],
      })).toEqual([]);
    }
  });

  it("shares eight world-hearing slots without spending or increasing admitted expression capacity", () => {
    const current = fixture("admitted and domain sound budgets stay independent", { facing: "east" });
    const voices = Array.from({ length: HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES },
      (_, index) => supplementalSoundSample(`admitted-${index}`, OBSERVER_X + 2, OBSERVER_Y));
    const alarms = Array.from({ length: HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES },
      (_, index) => unadmittedAlarmSoundSample(`domain-${index}`, OBSERVER_X + 2, OBSERVER_Y));
    const impacts = Array.from({ length: HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES },
      (_, index) => physicalSoundSample(`contact-${index}`, OBSERVER_X + 2, OBSERVER_Y, "CRATE-1"));

    expect(HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES).toBe(8);
    expect(HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES).toBe(8);
    expect(HUMAN_PERCEPTION_MAX_OBSERVATIONS_PER_RESIDENT).toBe(48);
    expect(observationsFor(current, [], 1, voices, [], [], alarms)).toHaveLength(16);
    expect(observationsFor(current, [], 1, voices, impacts.slice(0, 4), [], alarms.slice(0, 4)))
      .toHaveLength(16);
    expect(observationsFor(current, [], 1, [], impacts.slice(0, 5), [], alarms.slice(0, 4)))
      .toEqual([]);
    expect(observationsFor(current, [], 1, [], [], [], [
      ...alarms,
      unadmittedAlarmSoundSample("ninth-domain-alarm", OBSERVER_X + 2, OBSERVER_Y),
    ])).toEqual([]);
  });

  it("hears an authenticated physical-world sound anonymously without inventing sight", () => {
    const current = fixture("physical contact remains an acoustic fact", { facing: "east" });
    const rustle = physicalSoundSample(
      "animal-rustle",
      OBSERVER_X + 4,
      OBSERVER_Y,
      "ANIMAL-DEER-1",
      { soundClass: "physical-rustle" },
    );

    const observations = observationsFor(current, [], 1, [], [rustle]);
    const heard = observations.find(({ id }) => id.includes(rustle.id));

    expect(heard).toMatchObject({
      channel: "hearing",
      perceivedClass: "physical-rustle",
      identification: "anonymous",
      subjectId: null,
    });
    expect(heard?.area.radiusUnits).toBeGreaterThanOrEqual(250);
    expect(heard?.area.center).not.toEqual(rustle.position);
    expect(heard).not.toHaveProperty("sourceActorId");
    expect(heard).not.toHaveProperty("acousticEventId");
    expect(observations.some(({ channel }) => channel === "vision")).toBe(false);
  });

  it("hears a structured aggregate animal call without inventing an actor", () => {
    const current = fixture("an aggregate chorus remains anonymous", { facing: "east" });
    const chorus = physicalSoundSample(
      "aggregate-chorus",
      OBSERVER_X + 4,
      OBSERVER_Y,
      "ecology-aggregate-source:opaque",
      { soundClass: "animal-call" },
    );

    const heard = observationsFor(current, [], 1, [], [chorus])
      .find(({ id }) => id.includes(chorus.id));
    expect(heard).toMatchObject({
      channel: "hearing",
      perceivedClass: "animal-call",
      identification: "anonymous",
      subjectId: null,
    });
    expect(heard).not.toHaveProperty("sourceId");
    expect(heard).not.toHaveProperty("sourceActorId");
    expect(heard).not.toHaveProperty("acousticEventId");
  });

  it("hears a carried-tool crack from the bounded player sample without learning the tool", () => {
    const current = fixture("a broken cleat carries as sound, not inventory knowledge", {
      facing: "east",
    });
    const crack = createPlayerSenseSample({
      id: "player-gear-break",
      sampleOrdinal: 0,
      position: worldPoint(OBSERVER_X + 3, OBSERVER_Y),
      movementSalience: FIXED_POINT,
      lightVisibility: 0,
      soundLoudness: 620_000,
      soundRangeUnits: 16_000,
      soundClass: "physical-crack",
      soundInterrupt: "none",
    });
    if (crack === null) throw new Error("gear-break player sample must be valid");

    const observations = observationsFor(current, [crack], 1);
    const heard = observations.find(({ perceivedClass }) => (
      perceivedClass === "physical-crack"
    ));

    expect(heard).toMatchObject({
      channel: "hearing",
      perceivedClass: "physical-crack",
      identification: "anonymous",
      subjectId: null,
    });
    expect(heard).not.toHaveProperty("sourceActorId");
    expect(heard).not.toHaveProperty("gearId");
  });

  it("suppresses a physical source's own contact while another resident hears it", () => {
    const current = fixture("a body does not separately hear its own contact", { facing: "east" });
    const listener = current.state.residents.find(({ id }) => id !== current.resident.id);
    const route = current.state.routes[0];
    if (!listener || !route) throw new Error("physical sound fixture needs two residents");
    listener.location = { kind: "route", routeId: route.id, progress: 0 };
    const rebuilt = rebuildWorld(current);
    const contact = physicalSoundSample(
      "resident-contact",
      OBSERVER_X + 2,
      OBSERVER_Y,
      current.resident.identity.stableId,
      { soundClass: "physical-thud" },
    );

    const batches = collectExistingHumanObservations({
      world: rebuilt.world,
      window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1),
      playerSamples: [],
      physicalSoundSamples: [contact],
    });
    const sourceObservations = batchFor(batches, current.resident.id)?.observations ?? [];
    const listenerObservations = batchFor(batches, listener.id)?.observations ?? [];

    expect(sourceObservations.some(({ id }) => id.includes(contact.id))).toBe(false);
    expect(listenerObservations).toContainEqual(expect.objectContaining({
      channel: "hearing",
      perceivedClass: "physical-thud",
      identification: "anonymous",
      subjectId: null,
    }));
  });

  it("routes physical sounds through shared masking and range with deterministic order", () => {
    const calm = fixture("physical sounds carry over calm ground", { facing: "west" });
    const masked = fixture("weather masks physical sounds", {
      facing: "west",
      turbulentWater: true,
      storm: true,
    });
    const carrying = physicalSoundSample(
      "carrying-impact",
      OBSERVER_X + 6,
      OBSERVER_Y,
      "OBJECT-CRATE-1",
      {
        soundClass: "physical-thud",
        soundLoudness: 800_000,
        soundRangeUnits: 20_000,
      },
    );
    const nearby = physicalSoundSample(
      "nearby-scrape",
      OBSERVER_X + 3,
      OBSERVER_Y,
      "OBJECT-CRATE-2",
      { soundClass: "physical-scrape" },
    );
    const shortRange = physicalSoundSample(
      "short-impact",
      OBSERVER_X + 6,
      OBSERVER_Y,
      "OBJECT-CRATE-3",
      { soundClass: "physical-thud", soundRangeUnits: 1_000 },
    );

    expect(observationsFor(calm, [], 1, [], [carrying])
      .some(({ channel }) => channel === "hearing")).toBe(true);
    expect(observationsFor(masked, [], 1, [], [carrying])
      .some(({ channel }) => channel === "hearing")).toBe(false);
    expect(observationsFor(calm, [], 1, [], [shortRange])
      .some(({ channel }) => channel === "hearing")).toBe(false);
    expect(observationsFor(calm, [], 1, [], [carrying, nearby]))
      .toEqual(observationsFor(calm, [], 1, [], [nearby, carrying]));
  });

  it("fails closed for malformed or unauthenticated physical sound samples", () => {
    const current = fixture("invalid physical sounds teach nothing", { facing: "east" });
    const valid = physicalSoundSample(
      "valid-impact",
      OBSERVER_X + 2,
      OBSERVER_Y,
      "OBJECT-CRATE-1",
      { soundClass: "physical-thud" },
    );
    const { acousticEventId: _omitted, ...missingEvent } = valid;
    const invalidEvent = { ...valid, acousticEventId: "invalid event id" };
    const expressionDisguisedAsPhysical = {
      ...valid,
      soundClass: "human-vocalization",
    };
    const extraKey = { ...valid, expressionEventId: "situated-expression:event:wrong" };

    for (const malformed of [
      missingEvent,
      invalidEvent,
      expressionDisguisedAsPhysical,
      extraKey,
    ]) {
      expect(createPhysicalSoundSample(
        malformed as unknown as PhysicalSoundSample,
      )).toBeNull();
      expect(collectExistingHumanObservations({
        world: current.world,
        window: current.window,
        targetTick: fixtureTick(current, 1),
        playerSamples: [],
        physicalSoundSamples: [malformed as unknown as PhysicalSoundSample],
      })).toEqual([]);
    }
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [],
      physicalSoundSamples: undefined,
    } as unknown as Parameters<typeof collectExistingHumanObservations>[0])).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [],
      physicalSoundSamples: [valid],
      unexpected: true,
    } as unknown as Parameters<typeof collectExistingHumanObservations>[0])).toEqual([]);
  });

  it("preserves canonical observations across negative moving-frame origins", () => {
    const base = fixture("the sensory frame may rebase", { facing: "east" });
    expect(base.window.origin.x).toBeLessThan(0);
    expect(base.window.origin.y).toBeLessThan(0);
    const shiftedWindow = createRegionalTerrainWindow(
      base.state.meta.rootSeed,
      createTerrainRegionStreamingState({ rootSeed: base.state.meta.rootSeed }),
      { x: base.window.origin.x + 16, y: base.window.origin.y - 16 },
    );
    const shiftedWorld = createRegionalWorldView(
      base.economy,
      shiftedWindow,
      projectRegionalCartographyWindow(
        createRegionalCartography(base.state.meta.rootSeed),
        shiftedWindow,
      ),
    );
    const sample = visualSample("same-world-point", OBSERVER_X + 4, OBSERVER_Y);
    const first = batchFor(collectExistingHumanObservations({
      world: base.world,
      window: base.window,
      targetTick: fixtureTick(base, 1),
      playerSamples: [sample],
    }), base.resident.id)?.observations;
    const second = batchFor(collectExistingHumanObservations({
      world: shiftedWorld,
      window: shiftedWindow,
      targetTick: fixtureTick(base, 1),
      playerSamples: [sample],
    }), base.resident.id)?.observations;

    expect(second).toEqual(first);
    expect(first?.[0]?.area.center).toEqual(sample.position);
  });

  it("faces a saved search probe instead of using the hidden live player point", () => {
    const searching = fixture("a lawful last known place guides search", { facing: "west" });
    const target = worldPoint(OBSERVER_X + 4, OBSERVER_Y);
    searching.resident.perception = searchingState(searching.resident, target);
    expect(queryActorSearch(searching.resident.perception)?.nextProbe).toEqual(target);
    const searchedWorld = rebuildWorld(searching);
    const sample = visualSample("reacquired", OBSERVER_X + 4, OBSERVER_Y);

    const reacquired = observationsFor(searchedWorld, [sample], 3)
      .find(({ channel }) => channel === "vision");

    expect(reacquired).toMatchObject({
      subjectId: LOCAL_PLAYER_SUBJECT_ID,
      identification: "identified",
    });

    const notSearching = fixture("without knowledge the target stays behind", { facing: "west" });
    notSearching.resident.perception = createActorPerceptionState(
      notSearching.resident.identity.stableId,
      2,
    );
    const ordinaryWorld = rebuildWorld(notSearching);
    expect(observationsFor(ordinaryWorld, [sample], 3)
      .some(({ channel }) => channel === "vision")).toBe(false);
  });

  it("keeps attending to a stationary identified player when route-facing points away", () => {
    const current = fixture("saved attention sustains lawful contact", { facing: "west" });
    const target = worldPoint(OBSERVER_X + 4, OBSERVER_Y);
    const startTick = current.resident.perception.tick;
    const priorObservation = createActorObservation({
      id: "prior-attended-player",
      observerId: current.resident.identity.stableId,
      observedAtTick: startTick + 1,
      channel: "vision",
      perceivedClass: "human",
      subjectId: LOCAL_PLAYER_SUBJECT_ID,
      area: { center: target, radiusUnits: 0 },
      confidence: 900_000,
      salience: 900_000,
      identification: "identified",
    });
    if (!priorObservation) throw new Error("prior attention must be valid");
    const priorState = stepActorPerception(
      createActorPerceptionState(current.resident.identity.stableId, startTick),
      { tick: startTick + 1, observations: [priorObservation] },
    );
    if (!priorState) throw new Error("prior attention state must be valid");
    current.resident.perception = priorState;
    const rebuilt = rebuildWorld(current);
    const stationary = visualSample("stationary-player", OBSERVER_X + 4, OBSERVER_Y, {
      movementSalience: 0,
      lightVisibility: FIXED_POINT,
    });

    const contact = observationsFor(rebuilt, [stationary], 2)
      .find(({ channel }) => channel === "vision");

    expect(contact).toMatchObject({
      identification: "identified",
      subjectId: LOCAL_PLAYER_SUBJECT_ID,
    });
  });

  it("fails closed for malformed, duplicate, over-cap, and wrong-window samples", () => {
    const current = fixture("malformed sensation teaches nothing", { facing: "east" });
    const valid = visualSample("valid", OBSERVER_X + 2, OBSERVER_Y);
    const malformed = {
      ...valid,
      movementSalience: 0.5,
    } as PlayerSenseSample;

    expect(createPlayerSenseSample({
      id: "invalid fixed point",
      sampleOrdinal: 0,
      position: valid.position,
      movementSalience: 0,
      lightVisibility: FIXED_POINT,
      soundLoudness: 0,
      soundRangeUnits: 0,
      soundClass: "movement-sound",
      soundInterrupt: "none",
    })).toBeNull();
    const voice = supplementalSoundSample("valid-voice", OBSERVER_X + 2, OBSERVER_Y);
    expect(createSupplementalSoundSample({
      ...voice,
      movementSalience: FIXED_POINT,
    } as unknown as SupplementalSoundSample)).toBeNull();
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [valid, malformed],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [valid, valid],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [valid, { ...valid, id: "same-ordinal" }],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: Array.from(
        { length: HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES + 1 },
        (_, index) => visualSample(`sample-${index}`, OBSERVER_X + 2, OBSERVER_Y, {
          sampleOrdinal: index % HUMAN_PERCEPTION_MAX_PLAYER_SAMPLES,
        }),
      ),
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [valid],
      supplementalSoundSamples: Array.from(
        { length: HUMAN_PERCEPTION_MAX_SUPPLEMENTAL_SOUND_SAMPLES + 1 },
        (_, index) => supplementalSoundSample(
          `voice-${index}`,
          OBSERVER_X + 2,
          OBSERVER_Y,
        ),
      ),
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [valid],
      supplementalSoundSamples: [{ ...voice, id: valid.id }],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [],
      supplementalSoundSamples: [{ ...voice, id: "duplicate-expression-event" }, voice],
    })).toEqual([]);
    const impact = physicalSoundSample(
      "valid-impact",
      OBSERVER_X + 2,
      OBSERVER_Y,
      "OBJECT-CRATE-1",
      { soundClass: "physical-thud" },
    );
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [valid],
      physicalSoundSamples: Array.from(
        { length: HUMAN_PERCEPTION_MAX_PHYSICAL_SOUND_SAMPLES + 1 },
        (_, index) => physicalSoundSample(
          `impact-${index}`,
          OBSERVER_X + 2,
          OBSERVER_Y,
          `OBJECT-CRATE-${index}`,
          { soundClass: "physical-thud" },
        ),
      ),
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [valid],
      physicalSoundSamples: [{ ...impact, id: valid.id }],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [],
      supplementalSoundSamples: [{ ...voice, id: impact.id }],
      physicalSoundSamples: [impact],
    })).toEqual([]);
    expect(collectExistingHumanObservations({
      world: current.world,
      window: current.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [],
      physicalSoundSamples: [{ ...impact, id: "duplicate-acoustic-event" }, impact],
    })).toEqual([]);
    const unrelated = fixture("another registered window", { facing: "east" });
    expect(collectExistingHumanObservations({
      world: current.world,
      window: unrelated.window,
      targetTick: fixtureTick(current, 1),
      playerSamples: [valid],
    })).toEqual([]);
  });

  it("ignores an extreme out-of-frame point without flattening or inventing contact", () => {
    const current = fixture("a distant point is simply absent", { facing: "east" });
    const sample = createSample({
      id: "extreme",
      sampleOrdinal: 0,
      position: createWorldPosition(createRegionCoord(-1_000_000, 1_000_000), 500, 500),
      movementSalience: FIXED_POINT,
      lightVisibility: FIXED_POINT,
      soundLoudness: FIXED_POINT,
      soundRangeUnits: 20_000,
    });

    expect(observationsFor(current, [sample], 1)).toEqual([]);
  });
});

/** Controlled existing-owner inputs, not a player-accessible keeper encounter. */
function keeperListeningFixture(
  seed: string,
  sourceOffset = 2,
  environment: { readonly storm?: boolean; readonly turbulentWater?: boolean } = {},
): {
  readonly fixture: Fixture;
  readonly listener: ResidentState;
  readonly voice: SupplementalSoundSample;
  readonly fact: SituatedExpressionSemanticFact;
  readonly input: HumanPerceptionInput;
} {
  const current = fixture(seed, { facing: "east", ...environment });
  const listener = current.state.residents.find(({ id }) => id !== current.resident.id);
  const route = current.state.routes[0];
  if (listener === undefined || route === undefined) throw new Error("keeper listening fixture needs two current residents");
  listener.location = { kind: "route", routeId: route.id, progress: 0 };
  const rebuilt = rebuildWorld(current);
  const fact = situatedExpressionSemanticFactForMemory({
    sourceActorId: current.resident.identity.stableId,
    triggerEventId: "settlement-store-closure:diagnostic-test",
    meaning: "keeper-secure-store-response", family: "work", priority: 600_000,
    meaningCooldownRemainingSteps: 30, familyCooldownRemainingSteps: 10,
  });
  if (fact === null) throw new Error("keeper listening fixture lost its current semantic mapper");
  const acoustics = situatedExpressionAcoustics({ meaning: "keeper-secure-store-response", volume: "spoken" });
  const voice = supplementalSoundSample("diagnostic-store-report", OBSERVER_X + sourceOffset, OBSERVER_Y,
    current.resident.identity.stableId, {
      expressionEventId: fact.expressionEventId,
      soundLoudness: acoustics.loudness,
      soundRangeUnits: acoustics.rangeUnits,
    });
  return {
    fixture: rebuilt, listener, voice, fact,
    input: {
      world: rebuilt.world, window: rebuilt.window,
      targetTick: fixtureTick(rebuilt, 1), playerSamples: [],
      supplementalSoundSamples: [voice], supplementalSemanticFacts: [fact],
    },
  };
}

function receiptObjects(value: unknown, seen = new Set<object>()): readonly object[] {
  if (value === null || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  const descendants = Object.values(value).flatMap((entry) => receiptObjects(entry, seen));
  return [value, ...descendants];
}

function fixture(
  seed: string,
  options: {
    readonly facing: "east" | "west";
    readonly ridgeAtX?: number;
    readonly turbulentWater?: boolean;
    readonly storm?: boolean;
    readonly reverseResidents?: boolean;
  },
): Fixture {
  const state = createWorld(seed, "standard");
  const resident = state.residents[0];
  const route = state.routes[0];
  if (!resident || !route) throw new Error("fixture needs a resident and route");
  const direction = options.facing === "east" ? 1 : -1;
  route.path = [OBSERVER_INDEX, OBSERVER_INDEX + direction];
  resident.location = { kind: "route", routeId: route.id, progress: 0 };
  state.weather = {
    ...state.weather,
    kind: options.storm ? "storm" : "clear",
    intensity: options.storm ? FIXED_POINT : 0,
    windX: 0,
    windY: 0,
  };
  state.tide = { ...state.tide, level: options.turbulentWater ? FIXED_POINT : 0 };
  for (let y = OBSERVER_Y - 3; y <= OBSERVER_Y + 3; y += 1) {
    for (let x = OBSERVER_X - 2; x <= OBSERVER_X + 8; x += 1) {
      const tile = state.terrain.tiles[y * state.terrain.width + x];
      if (!tile) throw new Error("fixture corridor left terrain");
      tile.terrain = "meadow";
      tile.elevation = 0;
      tile.roughness = 0;
    }
  }
  if (options.ridgeAtX !== undefined) {
    const ridge = state.terrain.tiles[OBSERVER_Y * state.terrain.width + options.ridgeAtX];
    if (!ridge) throw new Error("fixture ridge left terrain");
    ridge.terrain = "ridge";
    ridge.elevation = FIXED_POINT;
  }
  if (options.turbulentWater) {
    for (let y = OBSERVER_Y - 2; y <= OBSERVER_Y + 2; y += 1) {
      for (let x = OBSERVER_X - 2; x <= OBSERVER_X + 2; x += 1) {
        if (x === OBSERVER_X && y === OBSERVER_Y) continue;
        const tile = state.terrain.tiles[y * state.terrain.width + x];
        if (!tile) throw new Error("fixture water left terrain");
        tile.terrain = "deep-water";
        tile.elevation = 0;
        tile.roughness = FIXED_POINT;
      }
    }
  }
  if (options.reverseResidents) state.residents.reverse();
  return buildFixture(state, resident);
}

function homeFixture(
  seed: string,
  posture: "legacy" | "awake" | "asleep",
  refuge: "home" | "foreign" = "home",
): Fixture {
  const state = createWorld(seed, "standard");
  const residentIndex = 0;
  let resident = state.residents[residentIndex];
  if (!resident) throw new Error("home fixture needs a resident");
  const homeSettlementId = resident.homeSettlementId;
  const settlement = refuge === "home"
    ? state.settlements.find(({ id }) => id === homeSettlementId)
    : state.settlements.find(({ id }) => id !== homeSettlementId);
  if (!settlement) throw new Error("home fixture needs its settlement refuge");
  resident.location = { kind: "settlement", settlementId: settlement.id };
  resident.activeContractId = null;
  if (posture !== "legacy") {
    const restDestinationId = residentHomeRestDestinationId(
      resident.identity.stableId,
      resident.homeSettlementId,
    );
    if (restDestinationId === null) throw new Error("home fixture needs a rest destination");
    resident = replaceResidentCircadian(resident, {
      atTick: resident.perception.tick,
      circadian: {
        version: LIVING_CIRCADIAN_VERSION,
        ownerId: LIVING_CIRCADIAN_OWNER_ID,
        policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
        restDestinationId,
        restDestinationArrived: true,
        posture: { state: posture, enteredAtTick: resident.perception.tick },
      },
    });
    state.residents[residentIndex] = resident;
  }
  return buildFixture(state, resident, {
    x: settlement.tileIndex % state.terrain.width,
    y: Math.floor(settlement.tileIndex / state.terrain.width),
  });
}

function buildFixture(
  state: WorldState,
  resident: ResidentState,
  focus: { readonly x: number; readonly y: number } = { x: OBSERVER_X, y: OBSERVER_Y },
): Fixture {
  const economy = createWorldView(state);
  const stream = createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed });
  const window = createRegionalTerrainWindow(
    state.meta.rootSeed,
    stream,
    regionalFrameOriginAtAddress({
      region: createRegionCoord(0, 0),
      localX: focus.x,
      localY: focus.y,
    }),
  );
  const world = createRegionalWorldView(
    economy,
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  return { state, economy, world, window, resident };
}

function rebuildWorld(current: Fixture): Fixture {
  return buildFixture(current.state, current.resident);
}

function observationsFor(
  current: Fixture,
  samples: readonly PlayerSenseSample[],
  targetTick: number,
  supplementalSoundSamples: readonly SupplementalSoundSample[] = [],
  physicalSoundSamples: readonly PhysicalSoundSample[] = [],
  supplementalSemanticFacts: readonly SituatedExpressionSemanticFact[] = [],
  unadmittedAlarmSoundSamples: readonly UnadmittedAlarmSoundSample[] = [],
) {
  return batchFor(collectExistingHumanObservations({
    world: current.world,
    window: current.window,
    targetTick: fixtureTick(current, targetTick),
    playerSamples: samples,
    supplementalSoundSamples,
    supplementalSemanticFacts,
    physicalSoundSamples,
    unadmittedAlarmSoundSamples,
  }), current.resident.id)?.observations ?? [];
}

function fixtureTick(current: Fixture, offset: number): number {
  return current.state.meta.completedTick + offset;
}

function batchFor(
  batches: readonly HumanObservationBatch[],
  residentId: number,
): HumanObservationBatch | undefined {
  return batches.find((batch) => batch.residentId === residentId);
}

function visualSample(
  id: string,
  tileX: number,
  tileY: number,
  overrides: Partial<Pick<PlayerSenseSample,
    "lightVisibility" | "movementSalience" | "sampleOrdinal">> = {},
): PlayerSenseSample {
  return createSample({
    id,
    sampleOrdinal: overrides.sampleOrdinal ?? 0,
    position: worldPoint(tileX, tileY),
    movementSalience: overrides.movementSalience ?? FIXED_POINT,
    lightVisibility: overrides.lightVisibility ?? FIXED_POINT,
    soundLoudness: 0,
    soundRangeUnits: 0,
  });
}

function soundSample(
  id: string,
  tileX: number,
  tileY: number,
  overrides: Partial<Pick<PlayerSenseSample,
    "sampleOrdinal" | "soundLoudness" | "soundRangeUnits">> = {},
): PlayerSenseSample {
  return createSample({
    id,
    sampleOrdinal: overrides.sampleOrdinal ?? 0,
    position: worldPoint(tileX, tileY),
    movementSalience: 0,
    lightVisibility: 0,
    soundLoudness: overrides.soundLoudness ?? FIXED_POINT,
    soundRangeUnits: overrides.soundRangeUnits ?? 12_000,
  });
}

function supplementalSoundSample(
  id: string,
  tileX: number,
  tileY: number,
  sourceActorId: string = LOCAL_PLAYER_SUBJECT_ID,
  overrides: Partial<Pick<SupplementalSoundSample,
    "expressionEventId" | "soundLoudness" | "soundRangeUnits">> = {},
): SupplementalSoundSample {
  const sample = createSupplementalSoundSample({
    expressionEventId: overrides.expressionEventId
      ?? `situated-expression:event:test:${id}`,
    id,
    position: worldPoint(tileX, tileY),
    soundLoudness: overrides.soundLoudness ?? FIXED_POINT,
    soundRangeUnits: overrides.soundRangeUnits ?? 12_000,
    soundClass: "human-vocalization",
    soundInterrupt: "none",
    sourceActorId,
  });
  if (!sample) throw new Error("test supplemental sound must be valid");
  return sample;
}

function unadmittedAlarmSoundSample(
  id: string,
  tileX: number,
  tileY: number,
  sourceActorId = "DEER-1",
  overrides: Partial<Pick<UnadmittedAlarmSoundSample,
    "acousticEventId" | "soundLoudness" | "soundRangeUnits">> = {},
): UnadmittedAlarmSoundSample {
  const sample = createUnadmittedAlarmSoundSample({
    acousticEventId: overrides.acousticEventId ?? `ecology-alarm:test:${id}`,
    id,
    position: worldPoint(tileX, tileY),
    soundLoudness: overrides.soundLoudness ?? FIXED_POINT,
    soundRangeUnits: overrides.soundRangeUnits ?? 12_000,
    soundClass: "animal-alarm",
    soundInterrupt: "strong",
    sourceActorId,
  });
  if (!sample) throw new Error("test domain alarm must be a valid hearing shape");
  return sample;
}

function physicalSoundSample(
  id: string,
  tileX: number,
  tileY: number,
  sourceId: string,
  overrides: Partial<Pick<PhysicalSoundSample,
    "soundClass" | "soundInterrupt" | "soundLoudness" | "soundRangeUnits">> = {},
): PhysicalSoundSample {
  const sample = createPhysicalSoundSample({
    acousticEventId: `acoustic:animal-contact:test:${id}`,
    id,
    position: worldPoint(tileX, tileY),
    soundLoudness: overrides.soundLoudness ?? FIXED_POINT,
    soundRangeUnits: overrides.soundRangeUnits ?? 12_000,
    soundClass: overrides.soundClass ?? "physical-rustle",
    soundInterrupt: overrides.soundInterrupt ?? "none",
    sourceId,
  });
  if (!sample) throw new Error("test physical sound must be valid");
  return sample;
}

function residentStimulus(current: Fixture, id: string): PlayerSenseSample {
  const placement = resolveResidentWorldPlacement(current.economy, current.resident);
  if (placement === null) throw new Error("resident stimulus needs a lawful placement");
  return createSample({
    id,
    sampleOrdinal: 0,
    position: placement.position,
    movementSalience: FIXED_POINT,
    lightVisibility: FIXED_POINT,
    soundLoudness: FIXED_POINT,
    soundRangeUnits: 12_000,
  });
}

function createSample(input: {
  readonly id: string;
  readonly sampleOrdinal: number;
  readonly position: WorldPosition;
  readonly movementSalience: number;
  readonly lightVisibility: number;
  readonly soundLoudness: number;
  readonly soundRangeUnits: number;
}): PlayerSenseSample {
  const sample = createPlayerSenseSample({
    ...input,
    soundClass: "movement-sound",
    soundInterrupt: "none",
  });
  if (!sample) throw new Error("test sample must be valid");
  return sample;
}

function worldPoint(tileX: number, tileY: number) {
  return createWorldPosition(
    createRegionCoord(0, 0),
    tileX * 1_000 + 500,
    tileY * 1_000 + 500,
  );
}

function searchingState(resident: ResidentState, lastKnown: ReturnType<typeof worldPoint>) {
  const startTick = resident.perception.tick;
  const observed = createActorObservation({
    id: "prior-player-sighting",
    observerId: resident.identity.stableId,
    observedAtTick: startTick + 1,
    channel: "vision",
    perceivedClass: "human",
    subjectId: LOCAL_PLAYER_SUBJECT_ID,
    area: { center: lastKnown, radiusUnits: 0 },
    confidence: 900_000,
    salience: 800_000,
    identification: "identified",
  });
  if (!observed) throw new Error("prior sighting must be valid");
  const identified = stepActorPerception(
    createActorPerceptionState(resident.identity.stableId, startTick),
    { tick: startTick + 1, observations: [observed] },
  );
  const searching = stepActorPerception(identified, {
    tick: startTick + 2,
    observations: [],
  });
  if (!searching) throw new Error("search state must be valid");
  return searching as ActorPerceptionState;
}
