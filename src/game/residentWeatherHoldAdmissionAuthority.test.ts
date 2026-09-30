import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  stepWorld,
  type SimEvent,
  type WorldView,
} from "../sim/public";
import { globalTileToRegion } from "../sim/regions";
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
  prepareResidentWeatherHoldEventTimeReceipt,
  residentWeatherHoldAdmissionMatchesWorld,
  residentWeatherHoldReceptionMatchesEventTime,
  type PreparedResidentWeatherHoldEventTimeReceipt,
  type ResidentWeatherHoldAdmissionAuthorityInput,
  type ResidentWeatherHoldReceptionAuthorityInput,
} from "./residentWeatherHoldAdmissionAuthority";
import { residentWeatherHoldExpressionIntent } from "./residentWeatherHoldExpression";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import {
  createSituatedExpressionState,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
} from "./situatedExpression";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createSpatialFrame,
  createWorldPosition,
  worldPositionDelta,
  worldPositionToSpatialFrame,
} from "./worldPosition";

type ReceiptMode = "heard-visible" | "heard-unseen" | "none";

interface AuthorityFixture extends ResidentWeatherHoldAdmissionAuthorityInput {
  readonly reception: PreparedResidentWeatherHoldEventTimeReceipt["reception"];
  readonly residentId: number;
  readonly trigger: SimEvent;
}

function authorityInput(
  fixture: AuthorityFixture,
  overrides: Partial<ResidentWeatherHoldAdmissionAuthorityInput> = {},
): ResidentWeatherHoldAdmissionAuthorityInput {
  return {
    economyWorld: overrides.economyWorld ?? fixture.economyWorld,
    spatialWorld: overrides.spatialWorld ?? fixture.spatialWorld,
    window: overrides.window ?? fixture.window,
    playerTemplate: overrides.playerTemplate ?? fixture.playerTemplate,
    listenerWasSleepingAtIntervalStart:
      overrides.listenerWasSleepingAtIntervalStart
      ?? fixture.listenerWasSleepingAtIntervalStart,
    event: overrides.event ?? fixture.event,
    admission: overrides.admission ?? fixture.admission,
  };
}

function receptionInput(
  fixture: AuthorityFixture,
  overrides: Partial<ResidentWeatherHoldReceptionAuthorityInput> = {},
): ResidentWeatherHoldReceptionAuthorityInput {
  return {
    ...authorityInput(fixture, overrides),
    reception: Object.hasOwn(overrides, "reception")
      ? overrides.reception ?? null
      : fixture.reception,
  };
}

function authorityFixture(seed: string, mode: ReceiptMode): AuthorityFixture {
  const state = createWorld(seed, "standard");
  const contract = state.contracts.find(({ status }) => status === "offered");
  if (contract === undefined) throw new Error("Weather-hold authority fixture needs a Promise");
  const resident = state.residents.find(({ activeContractId, location }) => (
    activeContractId === null
    && location.kind === "settlement"
    && location.settlementId === contract.originSettlementId
  ));
  if (resident === undefined) {
    throw new Error("Weather-hold authority fixture needs an origin resident");
  }
  state.weather = {
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  stepWorld(state, [{
    id: `weather-hold-authority-accept:${contract.id}`,
    type: "accept-contract",
    carrier: "resident",
    contractId: contract.id,
    residentId: resident.id,
  }]);
  stepWorld(state);
  if (contract.status !== "in-transit" || resident.location.kind !== "route") {
    throw new Error("Weather-hold authority resident did not depart");
  }
  state.weather = {
    kind: "storm",
    intensity: 950_000,
    windX: 500_000,
    windY: -500_000,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  stepWorld(state);
  const triggers = state.events.filter((candidate) => (
    candidate.type === "resident-sheltered" && candidate.subjectId === resident.id
  ));
  const trigger = triggers[0];
  if (triggers.length !== 1 || trigger === undefined) {
    throw new Error("Weather-hold authority fixture needs one shelter event");
  }
  const economyWorld = createWorldView(state);
  const intent = residentWeatherHoldExpressionIntent({ world: economyWorld, event: trigger });
  if (intent === null) throw new Error("Weather-hold authority fixture lost its intent");
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.event === null) {
    throw new Error(`Weather-hold authority expression failed: ${reduced.reason}`);
  }
  const event = reduced.event;

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
  const playerTemplate = createPlayer(economyWorld, contract.originSettlementId);
  playerTemplate.worldWidth = window.terrain.width;
  playerTemplate.worldHeight = window.terrain.height;
  const listener = findListener(spatialWorld, window, playerTemplate, event, mode);
  playerTemplate.x = listener.x;
  playerTemplate.y = listener.y;
  playerTemplate.previousX = listener.x;
  playerTemplate.previousY = listener.y;
  playerTemplate.facingMilliRadians = listener.facingMilliRadians;
  const prepared = prepareResidentWeatherHoldEventTimeReceipt({
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    listenerWasSleepingAtIntervalStart: false,
    event,
    sampleOrdinal: 0,
  });
  if (prepared === null) throw new Error("Weather-hold authority rejected its fixture");
  if ((prepared.reception?.kind ?? null) !== (mode === "none" ? null : mode)) {
    throw new Error(`Weather-hold fixture expected ${mode}`);
  }
  return {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    listenerWasSleepingAtIntervalStart: false,
    event,
    admission: prepared.admission,
    reception: prepared.reception,
    residentId: resident.id,
    trigger,
  };
}

function findListener(
  world: WorldView,
  window: RegionalTerrainWindow,
  template: PlayerState,
  event: SituatedExpressionEvent,
  mode: ReceiptMode,
): Readonly<{ x: number; y: number; facingMilliRadians: number }> {
  const source = pointInWindow(window, event.position);
  if (source === null) throw new Error("Weather-hold source is outside the regional window");
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ] as const;
  for (let distanceTiles = 1; distanceTiles <= 36; distanceTiles += 1) {
    for (const [dx, dy] of directions) {
      const candidate: PlayerState = {
        ...template,
        x: Math.round(source.x + dx * distanceTiles * TILE_UNITS),
        y: Math.round(source.y + dy * distanceTiles * TILE_UNITS),
      };
      if (
        candidate.x < 0
        || candidate.y < 0
        || candidate.x >= window.terrain.width * TILE_UNITS
        || candidate.y >= window.terrain.height * TILE_UNITS
      ) continue;
      const toward = Math.round(Math.atan2(
        source.y - candidate.y,
        source.x - candidate.x,
      ) * 1_000);
      candidate.facingMilliRadians = mode === "heard-unseen"
        ? Math.round((toward / 1_000 + Math.PI) * 1_000)
        : toward;
      candidate.previousX = candidate.x;
      candidate.previousY = candidate.y;
      const position = playerWorldPositionInRegionalWindow(window, candidate);
      const masking = ambientNoiseAt(world, playerTileIndex(candidate));
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
      const unmaskedContact = evaluateAudibleContact({
        listener: { x: 0, y: 0 },
        source: { x: delta.x, y: delta.y },
        baseRange: acoustics.rangeUnits,
        ambientNoise: 0,
        sourceLoudness: acoustics.loudness / FIXED_POINT,
        wind: {
          x: world.weather.windX / FIXED_POINT,
          y: world.weather.windY / FIXED_POINT,
        },
      });
      const sourceTileX = Math.floor(source.x / TILE_UNITS);
      const sourceTileY = Math.floor(source.y / TILE_UNITS);
      const sourceTileIndex = sourceTileY * window.terrain.width + sourceTileX;
      const directlyVisible = projectPerception(world, candidate)
        .detailVisibilityGrades[sourceTileIndex] === VISIBILITY_DIRECT;
      if (
        (mode === "heard-visible" && contact !== null && directlyVisible)
        || (mode === "heard-unseen" && contact !== null && !directlyVisible)
        || (mode === "none" && contact === null && unmaskedContact !== null)
      ) {
        return Object.freeze({
          x: candidate.x,
          y: candidate.y,
          facingMilliRadians: candidate.facingMilliRadians,
        });
      }
    }
  }
  throw new Error(`Weather-hold fixture could not find a ${mode} listener`);
}

function pointInWindow(
  window: RegionalTerrainWindow,
  position: SituatedExpressionEvent["position"],
): Readonly<{ x: number; y: number }> | null {
  const originAddress = globalTileToRegion(window.origin.x, window.origin.y);
  const frame = createSpatialFrame(
    createWorldPosition(
      originAddress.region,
      originAddress.localX * WORLD_POSITION_UNITS_PER_TILE,
      originAddress.localY * WORLD_POSITION_UNITS_PER_TILE,
    ),
    window.terrain.width * WORLD_POSITION_UNITS_PER_TILE,
    window.terrain.height * WORLD_POSITION_UNITS_PER_TILE,
  );
  return worldPositionToSpatialFrame(frame, position);
}

describe("resident weather-hold event-time admission authority", () => {
  it("admits and reauthenticates directly visible, weather-audible speech", () => {
    const fixture = authorityFixture("weather hold visible receipt", "heard-visible");
    expect(fixture.admission).toMatchObject({
      kind: "resident-weather-hold",
      shelteredAtTick: fixture.economyWorld.completedTick,
      eventRouteId: fixture.trigger.data.eventRouteId,
      eventRouteProgress: fixture.trigger.data.eventRouteProgress,
      listenerWasSleepingAtAdmission: false,
      receptionKind: "heard-visible",
      hearingCertainty: expect.any(Number),
    });
    expect(fixture.reception).toMatchObject({
      kind: "heard-visible",
      directVisualReceipt: true,
    });
    expect(residentWeatherHoldAdmissionMatchesWorld(authorityInput(fixture))).toBe(true);
    expect(residentWeatherHoldReceptionMatchesEventTime(receptionInput(fixture))).toBe(true);
  });

  it("keeps a heard-unseen receipt anonymous and rejects forged sensory detail", () => {
    const fixture = authorityFixture("weather hold unseen receipt", "heard-unseen");
    expect(fixture.reception).toMatchObject({
      kind: "heard-unseen",
      directVisualReceipt: false,
      bearingCenterMicroradians: expect.any(Number),
      distanceMinimumMicrounits: expect.any(Number),
    });
    expect(Object.keys(fixture.reception ?? {})).not.toContain("position");
    expect(Object.keys(fixture.reception ?? {})).not.toContain("text");
    expect(Object.values(fixture.reception ?? {})).not.toContain(
      fixture.economyWorld.residents.find(({ id }) => id === fixture.residentId)?.name,
    );
    expect(residentWeatherHoldReceptionMatchesEventTime(receptionInput(fixture, {
      reception: fixture.reception?.kind === "heard-unseen"
        ? {
            ...fixture.reception,
            bearingCenterMicroradians: fixture.reception.bearingCenterMicroradians + 1,
          }
        : null,
    }))).toBe(false);
    expect(residentWeatherHoldAdmissionMatchesWorld(authorityInput(fixture, {
      admission: {
        ...fixture.admission,
        receptionKind: "heard-visible",
      },
    }))).toBe(false);
  });

  it("lawfully admits weather-masked or sleeping speech without a player receipt", () => {
    const masked = authorityFixture("weather hold masked receipt", "none");
    expect(masked.admission).toMatchObject({
      receptionKind: null,
      hearingCertainty: null,
      listenerWasSleepingAtAdmission: false,
    });
    expect(masked.reception).toBeNull();
    expect(residentWeatherHoldAdmissionMatchesWorld(authorityInput(masked))).toBe(true);
    expect(residentWeatherHoldReceptionMatchesEventTime(receptionInput(masked))).toBe(true);

    const awake = authorityFixture("weather hold sleeping receipt", "heard-visible");
    const sleepingPlayer: PlayerState = {
      ...awake.playerTemplate,
      timeAction: {
        version: 1,
        kind: "sleep",
        startedAtWorldTick: awake.economyWorld.completedTick,
        startedAtPlayerStepPhase: 0,
        targetWorldTick: awake.economyWorld.completedTick + 1,
        totalSteps: 1,
        completedSteps: 0,
        anchorSettlementId: 1,
      },
    };
    const sleeping = prepareResidentWeatherHoldEventTimeReceipt({
      economyWorld: awake.economyWorld,
      spatialWorld: awake.spatialWorld,
      window: awake.window,
      playerTemplate: sleepingPlayer,
      listenerWasSleepingAtIntervalStart: true,
      event: awake.event,
      sampleOrdinal: 0,
    });
    expect(sleeping).not.toBeNull();
    expect(sleeping).toMatchObject({
      admission: {
        listenerWasSleepingAtAdmission: true,
        receptionKind: null,
        hearingCertainty: null,
      },
      reception: null,
    });
    if (sleeping === null) throw new Error("Sleeping weather-hold receipt was rejected");
    const sleepingAuthority = {
      economyWorld: awake.economyWorld,
      spatialWorld: awake.spatialWorld,
      window: awake.window,
      playerTemplate: sleepingPlayer,
      listenerWasSleepingAtIntervalStart: true,
      event: awake.event,
      admission: sleeping.admission,
    } as const;
    expect(residentWeatherHoldAdmissionMatchesWorld(sleepingAuthority)).toBe(true);
    expect(residentWeatherHoldReceptionMatchesEventTime({
      ...sleepingAuthority,
      reception: null,
    })).toBe(true);
    // Completing the event-time sleep later in the same bounded interval does
    // not invalidate an honest current-schema save.
    expect(residentWeatherHoldAdmissionMatchesWorld({
      ...sleepingAuthority,
      playerTemplate: awake.playerTemplate,
    })).toBe(true);

    const contradictoryRest: PlayerState = {
      ...awake.playerTemplate,
      timeAction: {
        version: 1,
        kind: "rest",
        startedAtWorldTick: Math.max(0, awake.economyWorld.completedTick - 1),
        startedAtPlayerStepPhase: 0,
        targetWorldTick: awake.economyWorld.completedTick + 1,
        totalSteps: 20,
        completedSteps: 10,
        anchorSettlementId: 1,
      },
    };
    expect(residentWeatherHoldAdmissionMatchesWorld({
      ...sleepingAuthority,
      playerTemplate: contradictoryRest,
    })).toBe(false);
  });

  it("binds exact current-tick authority while retaining the event route locus after movement", () => {
    const fixture = authorityFixture("weather hold event route locus", "heard-visible");
    const resident = fixture.economyWorld.residents.find(({ id }) => id === fixture.residentId);
    if (resident === undefined || resident.location.kind !== "route") {
      throw new Error("Weather-hold route-locus fixture lost its resident");
    }
    const eventPosition = structuredClone(fixture.event.position);
    resident.condition.sheltering = false;
    resident.location.progress = Math.min(FIXED_POINT, resident.location.progress + 25_000);

    expect(residentWeatherHoldAdmissionMatchesWorld(authorityInput(fixture))).toBe(true);
    expect(fixture.event.position).toEqual(eventPosition);
    expect(fixture.admission.eventRouteProgress).toBe(fixture.trigger.data.eventRouteProgress);

    expect(residentWeatherHoldAdmissionMatchesWorld(authorityInput(fixture, {
      admission: {
        ...fixture.admission,
        eventRouteProgress: fixture.admission.eventRouteProgress === FIXED_POINT
          ? fixture.admission.eventRouteProgress - 1
          : fixture.admission.eventRouteProgress + 1,
      },
    }))).toBe(false);
    expect(residentWeatherHoldAdmissionMatchesWorld(authorityInput(fixture, {
      admission: {
        ...fixture.admission,
        hearingCertainty: (fixture.admission.hearingCertainty ?? 0) + 1,
      },
    }))).toBe(false);
    expect(residentWeatherHoldAdmissionMatchesWorld(authorityInput(fixture, {
      admission: {
        ...fixture.admission,
        listenerWasSleepingAtAdmission: true,
        receptionKind: null,
        hearingCertainty: null,
      },
      listenerWasSleepingAtIntervalStart: false,
    }))).toBe(false);
  });

  it("rejects a foreign regional world/window and a stale world tick", () => {
    const fixture = authorityFixture("weather hold world binding", "heard-unseen");
    const foreignState = createWorld("weather hold foreign world", "standard");
    const foreignEconomy = createWorldView(foreignState);
    const foreignStream = createTerrainRegionStreamingState({
      rootSeed: foreignState.meta.rootSeed,
      center: { x: 0, y: 0 },
    });
    const foreignWindow = createRegionalTerrainWindow(foreignState.meta.rootSeed, foreignStream);
    const foreignWorld = createRegionalWorldView(
      foreignEconomy,
      foreignWindow,
      projectRegionalCartographyWindow(
        createRegionalCartography(foreignState.meta.rootSeed),
        foreignWindow,
      ),
    );
    expect(residentWeatherHoldAdmissionMatchesWorld(authorityInput(fixture, {
      spatialWorld: foreignWorld,
    }))).toBe(false);

    const stale = structuredClone(fixture.economyWorld);
    stale.completedTick += 1;
    expect(residentWeatherHoldAdmissionMatchesWorld(authorityInput(fixture, {
      economyWorld: stale,
    }))).toBe(false);
  });
});
