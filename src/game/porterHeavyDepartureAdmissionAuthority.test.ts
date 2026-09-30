import { describe, expect, it } from "vitest";

import {
  STRAND_AUTOMATION_THRESHOLD,
  createWorld,
  createWorldView,
  stepWorld,
} from "../sim/public";
import { FIXED_POINT, type SimEvent } from "../sim/types";
import { ambientNoiseAt } from "./physicalAcousticPerception";
import {
  livingActorAddressForResident,
  livingActorAddressInRegionalWindow,
} from "./livingActor";
import { evaluateAudibleContact, VISIBILITY_DIRECT } from "./perception";
import { TILE_UNITS, createPlayer, playerTileIndex, type PlayerState } from "./player";
import {
  porterHeavyDepartureAdmissionMatchesEventTimePerception,
  type PorterHeavyDepartureAdmissionAuthorityInput,
} from "./porterHeavyDepartureAdmissionAuthority";
import { projectPerception } from "./projection";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import {
  createSituatedExpressionState,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
} from "./situatedExpression";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import {
  createPorterHeavyDepartureExpressionAdmissionRecord,
  type PorterHeavyDepartureExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import { worldPositionDelta } from "./worldPosition";
import { workingPeopleExpressionIntent } from "./workingPeopleExpression";

interface AuthorityFixture extends PorterHeavyDepartureAdmissionAuthorityInput {
  readonly awayFacingMilliRadians: number;
}

function authorityInput(
  fixture: AuthorityFixture,
  overrides: Partial<PorterHeavyDepartureAdmissionAuthorityInput> = {},
): PorterHeavyDepartureAdmissionAuthorityInput {
  return {
    economyWorld: overrides.economyWorld ?? fixture.economyWorld,
    spatialWorld: overrides.spatialWorld ?? fixture.spatialWorld,
    window: overrides.window ?? fixture.window,
    playerTemplate: overrides.playerTemplate ?? fixture.playerTemplate,
    event: overrides.event ?? fixture.event,
    admission: overrides.admission ?? fixture.admission,
    completedTick: overrides.completedTick ?? fixture.completedTick,
  };
}

function authorityFixture(seed: string): AuthorityFixture {
  const state = createWorld(seed, "standard");
  const contract = state.contracts.find(({ status }) => status === "offered");
  if (contract === undefined) throw new Error("Authority fixture needs an offered Promise");
  const origin = state.settlements.find(({ id }) => id === contract.originSettlementId);
  const resident = state.residents.find((candidate) =>
    candidate.activeContractId === null
    && candidate.location.kind === "settlement"
    && candidate.location.settlementId === contract.originSettlementId
  );
  if (origin === undefined || resident === undefined) {
    throw new Error("Authority fixture needs an origin and available porter");
  }
  contract.resource = "parts";
  contract.quantity = 1;
  if (origin.inventory.parts < 1) {
    origin.inventory.parts += 1;
    state.ledger.initial.parts += 1;
  }
  state.weather = {
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  for (const route of state.routes) {
    route.traceStrength = Math.max(route.traceStrength, STRAND_AUTOMATION_THRESHOLD);
    route.condition = Math.max(route.condition, 180_000);
  }
  stepWorld(state, [{
    id: `authority-accept:${contract.id}`,
    type: "accept-contract",
    carrier: "resident",
    contractId: contract.id,
    residentId: resident.id,
  }]);
  stepWorld(state, []);
  const departures = state.events.filter((candidate) =>
    candidate.type === "contract-departed"
    && candidate.subjectId === contract.id
    && candidate.data.residentId === resident.id
  );
  if (departures.length !== 1) {
    throw new Error(`Authority fixture expected one departure, received ${departures.length}`);
  }
  const departure = departures[0] as SimEvent;
  const economyWorld = createWorldView(state);
  const intent = workingPeopleExpressionIntent({ world: economyWorld, event: departure });
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  const event = reduced.event;
  if (!reduced.accepted || event === null) {
    throw new Error(`Authority fixture expression was rejected: ${reduced.reason}`);
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
  const playerTemplate = createPlayer(economyWorld, origin.id);
  playerTemplate.worldWidth = window.terrain.width;
  playerTemplate.worldHeight = window.terrain.height;

  const sourceAddress = livingActorAddressForResident(economyWorld, resident);
  const source = sourceAddress === null
    ? null
    : livingActorAddressInRegionalWindow(sourceAddress, window);
  if (source === null) throw new Error("Authority fixture porter is outside regional window");

  const candidate = findEventTimeListener(spatialWorld, window, playerTemplate, event, source.tileIndex);
  const admission = createPorterHeavyDepartureExpressionAdmissionRecord({
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 0,
    receivedAtTick: state.meta.completedTick,
    listenerPosition: candidate.position,
    listenerFacingMilliRadians: candidate.facingMilliRadians,
    hearingCertainty: candidate.hearingCertainty,
  });
  if (admission === null) throw new Error("Authority fixture admission was rejected");
  return {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    event,
    admission,
    completedTick: state.meta.completedTick,
    awayFacingMilliRadians: candidate.awayFacingMilliRadians,
  };
}

function findEventTimeListener(
  world: AuthorityFixture["spatialWorld"],
  window: AuthorityFixture["window"],
  template: PlayerState,
  event: SituatedExpressionEvent,
  sourceTileIndex: number,
): Readonly<{
  position: PorterHeavyDepartureExpressionAdmissionRecord["listenerPosition"];
  facingMilliRadians: number;
  awayFacingMilliRadians: number;
  hearingCertainty: number;
}> {
  for (const distanceTiles of [7, 9, 11, 13, 15]) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const listener: PlayerState = {
        ...template,
        x: 0,
        y: 0,
      };
      // Compatibility region 0,0 is offset inside the floating frame. Lift
      // the source through its exact frame placement before testing candidates.
      const sourceTileX = sourceTileIndex % window.terrain.width;
      const sourceTileY = Math.floor(sourceTileIndex / window.terrain.width);
      listener.x = sourceTileX * TILE_UNITS + TILE_UNITS / 2
        + dx * distanceTiles * TILE_UNITS;
      listener.y = sourceTileY * TILE_UNITS + TILE_UNITS / 2
        + dy * distanceTiles * TILE_UNITS;
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
      const acoustics = situatedExpressionAcoustics(event.volume);
      const heard = evaluateAudibleContact({
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
      if (heard === null) continue;
      return Object.freeze({
        position,
        facingMilliRadians: toward,
        awayFacingMilliRadians: away,
        hearingCertainty: Math.max(1, Math.round(heard.certainty * FIXED_POINT)),
      });
    }
  }
  throw new Error("Authority fixture could not find a heard, direct, facing-sensitive listener");
}

describe("porter heavy-departure event-time admission authority", () => {
  it("reauthenticates the exact event-time hearing and direct visibility decision", () => {
    const fixture = authorityFixture("porter event-time authority exact");
    expect(porterHeavyDepartureAdmissionMatchesEventTimePerception(
      authorityInput(fixture),
    )).toBe(true);
  });

  it("rejects forged certainty, facing, listener position, tick, and event binding", () => {
    const fixture = authorityFixture("porter event-time authority tamper");
    expect(porterHeavyDepartureAdmissionMatchesEventTimePerception(authorityInput(fixture, {
      admission: { ...fixture.admission, hearingCertainty: fixture.admission.hearingCertainty + 1 },
    }))).toBe(false);
    expect(porterHeavyDepartureAdmissionMatchesEventTimePerception(authorityInput(fixture, {
      admission: {
        ...fixture.admission,
        listenerFacingMilliRadians: fixture.awayFacingMilliRadians,
      },
    }))).toBe(false);
    expect(porterHeavyDepartureAdmissionMatchesEventTimePerception(authorityInput(fixture, {
      admission: {
        ...fixture.admission,
        listenerPosition: {
          region: { x: 4, y: 4 },
          localX: 0,
          localY: 0,
        },
      },
    }))).toBe(false);
    expect(porterHeavyDepartureAdmissionMatchesEventTimePerception(authorityInput(fixture, {
      completedTick: fixture.completedTick + 1,
    }))).toBe(false);

    const otherAdmission = createPorterHeavyDepartureExpressionAdmissionRecord({
      sourceActorId: "H-unrelated-porter",
      triggerEventId: fixture.event.triggerEventId,
      sampleOrdinal: fixture.admission.sampleOrdinal,
      admittedAtPlayerStepPhase: fixture.admission.admittedAtPlayerStepPhase,
      receivedAtTick: fixture.admission.receivedAtTick,
      listenerPosition: fixture.admission.listenerPosition,
      listenerFacingMilliRadians: fixture.admission.listenerFacingMilliRadians,
      hearingCertainty: fixture.admission.hearingCertainty,
    });
    if (otherAdmission === null) throw new Error("Expected canonical unrelated admission");
    expect(porterHeavyDepartureAdmissionMatchesEventTimePerception(authorityInput(fixture, {
      admission: otherAdmission,
    }))).toBe(false);
  });

  it("rejects a regional view/window pair that did not produce the receipt", () => {
    const fixture = authorityFixture("porter event-time authority view binding");
    const foreignState = createWorld("porter foreign regional view", "standard");
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
    expect(porterHeavyDepartureAdmissionMatchesEventTimePerception(authorityInput(fixture, {
      spatialWorld: foreignWorld,
    }))).toBe(false);
  });
});
