import { describe, expect, it } from "vitest";

import { createWorld, createWorldView, stepWorld, type WorldView } from "../sim/public";
import { FIXED_POINT, type SimEvent } from "../sim/types";
import { stableStringify } from "../sim/util";
import {
  livingActorAddressForResident,
  livingActorAddressInRegionalWindow,
} from "./livingActor";
import { ambientNoiseAt } from "./physicalAcousticPerception";
import { evaluateAudibleContact, VISIBILITY_DIRECT } from "./perception";
import { TILE_UNITS, createPlayer, playerTileIndex, type PlayerState } from "./player";
import { projectPerception } from "./projection";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow, type RegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  prepareResidentIntroductionEventTimeReceipt,
  residentIntroductionAdmissionMatchesWorld,
  residentIntroductionReceptionMatchesEventTime,
  restoreResidentIntroductionPresentationLeasesFromCarry,
  resumeResidentIntroductionPresentationPair,
  type ResidentIntroductionAdmissionAuthorityInput,
  type ResidentIntroductionReceptionAuthorityInput,
} from "./residentIntroductionAdmissionAuthority";
import { residentIntroductionExpressionIntent } from "./residentIntroductionExpression";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import {
  createSituatedExpressionState,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionMemory,
  type SituatedExpressionState,
} from "./situatedExpression";
import { canonicalizeSituatedExpressionChannelBank } from "./situatedExpressionChannelBank";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import {
  createResidentIntroductionExpressionAdmissionRecord,
  appendSituatedExpressionAdmissionRecord,
  createSituatedExpressionAdmissionLedger,
  type ResidentIntroductionExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import {
  createHeardVisibleSituatedExpressionReception,
  type SituatedExpressionReception,
} from "./situatedExpressionReception";
import { worldPositionDelta, type WorldPosition } from "./worldPosition";

interface AuthorityFixture extends ResidentIntroductionAdmissionAuthorityInput {
  readonly reception: SituatedExpressionReception;
  readonly memory: SituatedExpressionMemory;
  readonly expressionState: SituatedExpressionState;
  readonly awayFacingMilliRadians: number;
  readonly introducedEvent: SimEvent;
  readonly eventTimePlayer: PlayerState;
}

function authorityInput(
  fixture: AuthorityFixture,
  overrides: Partial<ResidentIntroductionAdmissionAuthorityInput> = {},
): ResidentIntroductionAdmissionAuthorityInput {
  return {
    economyWorld: overrides.economyWorld ?? fixture.economyWorld,
    spatialWorld: overrides.spatialWorld ?? fixture.spatialWorld,
    window: overrides.window ?? fixture.window,
    playerTemplate: overrides.playerTemplate ?? fixture.playerTemplate,
    event: overrides.event ?? fixture.event,
    admission: overrides.admission ?? fixture.admission,
  };
}

function receptionInput(
  fixture: AuthorityFixture,
  overrides: Partial<ResidentIntroductionReceptionAuthorityInput> = {},
): ResidentIntroductionReceptionAuthorityInput {
  return {
    ...authorityInput(fixture, overrides),
    reception: Object.hasOwn(overrides, "reception")
      ? overrides.reception ?? null
      : fixture.reception,
  };
}

function authorityFixture(seed: string): AuthorityFixture {
  const state = createWorld(seed, "standard");
  state.weather = {
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  const resident = state.residents[0];
  if (resident === undefined) throw new Error("Introduction authority fixture needs a resident");
  stepWorld(state, [{
    id: "observe-for-introduction-authority",
    type: "observe-resident",
    residentId: resident.id,
  }]);
  const observedTick = resident.playerKnowledge.firstObservedTick;
  if (observedTick === null) throw new Error("Introduction authority fixture was not observed");
  const commandId = "greet-for-introduction-authority";
  stepWorld(state, [{
    id: commandId,
    type: "greet-resident",
    residentId: resident.id,
    observedTick,
  }]);
  const matches = state.events.filter((candidate) => (
    candidate.type === "resident-introduced"
    && candidate.subjectId === resident.id
    && candidate.data.commandId === commandId
  ));
  const introducedEvent = matches[0];
  if (matches.length !== 1 || introducedEvent === undefined) {
    throw new Error("Introduction authority fixture needs one committed introduction");
  }

  const economyWorld = createWorldView(state);
  const intent = residentIntroductionExpressionIntent({
    world: economyWorld,
    event: introducedEvent,
  });
  if (intent === null) throw new Error("Introduction authority fixture lost its intent");
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const event = reduction.event;
  const memory = reduction.state?.recent[0];
  if (
    !reduction.accepted
    || reduction.state === null
    || event === null
    || memory === undefined
  ) {
    throw new Error(`Introduction authority fixture expression failed: ${reduction.reason}`);
  }

  const stream = createTerrainRegionStreamingState({
    rootSeed: state.meta.rootSeed,
    center: { x: 0, y: 0 },
  });
  const window = createRegionalTerrainWindow(state.meta.rootSeed, stream);
  const spatialWorld = createRegionalWorldView(
    economyWorld,
    window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window),
  );
  const playerTemplate = createPlayer(economyWorld, resident.homeSettlementId);
  playerTemplate.worldWidth = window.terrain.width;
  playerTemplate.worldHeight = window.terrain.height;
  const sourceResident = economyWorld.residents.find(({ id }) => id === resident.id);
  if (sourceResident === undefined) throw new Error("Introduction authority source disappeared");
  const sourceAddress = livingActorAddressForResident(economyWorld, sourceResident);
  const source = sourceAddress === null
    ? null
    : livingActorAddressInRegionalWindow(sourceAddress, window);
  if (source === null) throw new Error("Introduction authority source is outside the window");
  const listener = findListener(spatialWorld, window, playerTemplate, event, source.tileIndex);
  const admission = createResidentIntroductionExpressionAdmissionRecord({
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 0,
    commandId,
    introducedAtTick: introducedEvent.tick,
    homeSettlementId: resident.homeSettlementId,
    listenerPosition: listener.position,
    listenerFacingMilliRadians: listener.facingMilliRadians,
    hearingCertainty: listener.hearingCertainty,
  });
  if (admission === null) throw new Error("Introduction authority admission was rejected");
  const reception = createHeardVisibleSituatedExpressionReception(
    event,
    introducedEvent.tick,
    listener.hearingCertainty,
    true,
  );
  if (reception === null) throw new Error("Introduction authority reception was rejected");
  return {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    event,
    admission,
    reception,
    memory,
    expressionState: reduction.state,
    awayFacingMilliRadians: listener.awayFacingMilliRadians,
    introducedEvent,
    eventTimePlayer: listener.player,
  };
}

function findListener(
  world: WorldView,
  window: RegionalTerrainWindow,
  template: PlayerState,
  event: SituatedExpressionEvent,
  sourceTileIndex: number,
): Readonly<{
  position: WorldPosition;
  facingMilliRadians: number;
  awayFacingMilliRadians: number;
  hearingCertainty: number;
  player: PlayerState;
}> {
  const sourceTileX = sourceTileIndex % window.terrain.width;
  const sourceTileY = Math.floor(sourceTileIndex / window.terrain.width);
  for (const distanceTiles of [1, 2, 3]) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const listener: PlayerState = {
        ...template,
        x: sourceTileX * TILE_UNITS + TILE_UNITS / 2 + dx * distanceTiles * TILE_UNITS,
        y: sourceTileY * TILE_UNITS + TILE_UNITS / 2 + dy * distanceTiles * TILE_UNITS,
      };
      if (
        listener.x < 0
        || listener.y < 0
        || listener.x >= window.terrain.width * TILE_UNITS
        || listener.y >= window.terrain.height * TILE_UNITS
      ) continue;
      const toward = Math.round(Math.atan2(
        sourceTileY * TILE_UNITS + TILE_UNITS / 2 - listener.y,
        sourceTileX * TILE_UNITS + TILE_UNITS / 2 - listener.x,
      ) * 1_000);
      const away = Math.round((toward / 1_000 + Math.PI) * 1_000);
      listener.facingMilliRadians = toward;
      listener.previousX = listener.x;
      listener.previousY = listener.y;
      if (projectPerception(world, listener).detailVisibilityGrades[sourceTileIndex]
        !== VISIBILITY_DIRECT) continue;
      listener.facingMilliRadians = away;
      if (projectPerception(world, listener).detailVisibilityGrades[sourceTileIndex]
        === VISIBILITY_DIRECT) continue;
      listener.facingMilliRadians = toward;
      const position = playerWorldPositionInRegionalWindow(window, listener);
      const masking = ambientNoiseAt(world, playerTileIndex(listener));
      if (position === null || masking === null) continue;
      const delta = worldPositionDelta(position, event.position);
      const acoustics = situatedExpressionAcoustics(event);
      const contact = evaluateAudibleContact({
        listener: { x: 0, y: 0 },
        source: { x: delta.x, y: delta.y },
        baseRange: acoustics.rangeUnits,
        ambientNoise: masking,
        sourceLoudness: acoustics.loudness / FIXED_POINT,
        wind: {
          x: world.weather.windX / FIXED_POINT,
          y: world.weather.windY / FIXED_POINT,
        },
      });
      if (contact === null) continue;
      return Object.freeze({
        position,
        facingMilliRadians: toward,
        awayFacingMilliRadians: away,
        hearingCertainty: Math.max(1, Math.round(contact.certainty * FIXED_POINT)),
        player: Object.freeze({ ...listener }),
      });
    }
  }
  throw new Error("Introduction authority fixture could not find a visible heard listener");
}

function changedAdmission(
  fixture: AuthorityFixture,
  overrides: Partial<ResidentIntroductionExpressionAdmissionRecord>,
): ResidentIntroductionExpressionAdmissionRecord {
  return { ...fixture.admission, ...overrides };
}

describe("resident introduction event-time admission authority", () => {
  it("reauthenticates the exact current introduction and event-time reception", () => {
    const fixture = authorityFixture("resident introduction authority exact");
    expect(prepareResidentIntroductionEventTimeReceipt({
      economyWorld: fixture.economyWorld,
      spatialWorld: fixture.spatialWorld,
      window: fixture.window,
      playerTemplate: fixture.eventTimePlayer,
      event: fixture.event,
      sampleOrdinal: 0,
    })).toEqual({
      admission: fixture.admission,
      reception: fixture.reception,
    });
    expect(residentIntroductionAdmissionMatchesWorld(authorityInput(fixture))).toBe(true);
    expect(residentIntroductionReceptionMatchesEventTime(receptionInput(fixture))).toBe(true);
    expect(resumeResidentIntroductionPresentationPair({
      economyWorld: fixture.economyWorld,
      spatialWorld: fixture.spatialWorld,
      window: fixture.window,
      playerTemplate: fixture.eventTimePlayer,
      memory: fixture.memory,
      admission: fixture.admission,
    })).toMatchObject({
      sourceActorId: fixture.event.sourceActorId,
      event: {
        eventId: fixture.event.eventId,
        audioAcknowledged: true,
      },
      reception: fixture.reception,
    });

    const channels = canonicalizeSituatedExpressionChannelBank({
      version: 1,
      channels: [{
        sourceActorId: fixture.event.sourceActorId,
        state: fixture.expressionState,
        reception: fixture.reception,
      }],
    });
    const admissions = appendSituatedExpressionAdmissionRecord(
      createSituatedExpressionAdmissionLedger(),
      fixture.admission,
    );
    expect(channels).not.toBeNull();
    expect(admissions).not.toBeNull();
    if (channels === null || admissions === null) return;
    expect(restoreResidentIntroductionPresentationLeasesFromCarry({
      economyWorld: fixture.economyWorld,
      spatialWorld: fixture.spatialWorld,
      window: fixture.window,
      playerTemplate: fixture.eventTimePlayer,
      intervalStartPosition: fixture.admission.listenerPosition,
      intervalStartFacingMilliRadians: fixture.admission.listenerFacingMilliRadians,
      channels,
      admissions,
    })).toEqual([expect.objectContaining({
      sourceActorId: fixture.event.sourceActorId,
      event: expect.objectContaining({
        eventId: fixture.event.eventId,
        audioAcknowledged: true,
      }),
    })]);

    const movedTemplate: PlayerState = {
      ...fixture.playerTemplate,
      x: 0,
      y: 0,
      previousX: 0,
      previousY: 0,
      facingMilliRadians: fixture.awayFacingMilliRadians,
    };
    expect(residentIntroductionAdmissionMatchesWorld(authorityInput(fixture, {
      playerTemplate: movedTemplate,
    }))).toBe(true);
  });

  it("rejects forged command, home, tick, event binding, ordinal, and phase", () => {
    const fixture = authorityFixture("resident introduction authority causal tamper");
    const forged = [
      changedAdmission(fixture, { commandId: "greet-forged" }),
      changedAdmission(fixture, { homeSettlementId: fixture.admission.homeSettlementId + 1 }),
      changedAdmission(fixture, { introducedAtTick: fixture.admission.introducedAtTick + 1 }),
      changedAdmission(fixture, { triggerEventId: "sim-event:resident-introduced:0:1" }),
      changedAdmission(fixture, { sampleOrdinal: 8 }),
      changedAdmission(fixture, { admittedAtPlayerStepPhase: 1 }),
    ];
    for (const admission of forged) {
      expect(residentIntroductionAdmissionMatchesWorld(authorityInput(fixture, {
        admission,
      }))).toBe(false);
    }
  });

  it("rejects forged hearing, pose, facing, reception, and mismatched regional authority", () => {
    const fixture = authorityFixture("resident introduction authority sensory tamper");
    expect(residentIntroductionAdmissionMatchesWorld(authorityInput(fixture, {
      admission: changedAdmission(fixture, {
        hearingCertainty: fixture.admission.hearingCertainty! + 1,
      }),
    }))).toBe(false);
    expect(residentIntroductionAdmissionMatchesWorld(authorityInput(fixture, {
      admission: changedAdmission(fixture, {
        listenerFacingMilliRadians: fixture.awayFacingMilliRadians,
      }),
    }))).toBe(false);
    expect(residentIntroductionAdmissionMatchesWorld(authorityInput(fixture, {
      admission: changedAdmission(fixture, {
        listenerPosition: {
          ...fixture.admission.listenerPosition,
          localX: fixture.admission.listenerPosition.localX + 1,
        },
      }),
    }))).toBe(false);
    expect(residentIntroductionReceptionMatchesEventTime(receptionInput(fixture, {
      reception: null,
    }))).toBe(false);

    const foreignState = createWorld("resident introduction authority foreign", "standard");
    const foreignEconomy = createWorldView(foreignState);
    const foreignStream = createTerrainRegionStreamingState({
      rootSeed: foreignState.meta.rootSeed,
      center: { x: 0, y: 0 },
    });
    const foreignWindow = createRegionalTerrainWindow(foreignState.meta.rootSeed, foreignStream);
    const foreignSpatial = createRegionalWorldView(
      foreignEconomy,
      foreignWindow,
      projectRegionalCartographyWindow(
        createRegionalCartography(foreignState.meta.rootSeed),
        foreignWindow,
      ),
    );
    expect(residentIntroductionAdmissionMatchesWorld(authorityInput(fixture, {
      spatialWorld: foreignSpatial,
    }))).toBe(false);
  });

  it("rejects stale resident truth and exposes no identity facts to a third-party override", () => {
    const fixture = authorityFixture("resident introduction authority knowledge boundary");
    const source = fixture.economyWorld.residents.find(({ identity }) => (
      identity.stableId === fixture.admission.sourceActorId
    ));
    const bystander = fixture.economyWorld.residents.find(({ identity }) => (
      identity.stableId !== fixture.admission.sourceActorId
    ));
    if (source === undefined || bystander === undefined) {
      throw new Error("Introduction knowledge fixture needs source and bystander");
    }
    const before = stableStringify(fixture.economyWorld);
    expect(residentIntroductionAdmissionMatchesWorld(authorityInput(fixture))).toBe(true);
    expect(stableStringify(fixture.economyWorld)).toBe(before);
    expect(Object.keys(fixture.reception).sort()).toEqual([
      "certainty",
      "directVisualReceipt",
      "eventId",
      "kind",
      "receivedAtTick",
      "sourceActorId",
      "version",
    ]);
    expect(stableStringify(fixture.reception)).not.toContain(source.name);
    expect(stableStringify(fixture.reception)).not.toContain(source.role);

    const thirdPartyAttempt = {
      ...authorityInput(fixture),
      listenerActorId: bystander.identity.stableId,
    } as unknown as ResidentIntroductionAdmissionAuthorityInput;
    expect(residentIntroductionAdmissionMatchesWorld(thirdPartyAttempt)).toBe(false);

    source.playerKnowledge.facts = ["name"];
    expect(residentIntroductionAdmissionMatchesWorld(authorityInput(fixture))).toBe(false);
  });
});
