import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { createWorld, createWorldView, type WorldView } from "../sim/public";
import { FIXED_POINT } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import { ambientNoiseAt } from "./physicalAcousticPerception";
import {
  livingActorAddressForResident,
  livingActorAddressInRegionalWindow,
} from "./livingActor";
import { evaluateAudibleContact, VISIBILITY_DIRECT } from "./perception";
import { TILE_UNITS, createPlayer, playerTileIndex, type PlayerState } from "./player";
import { projectPerception, RESIDENT_CONVERSATION_RANGE_TILES } from "./projection";
import {
  createRegionalCartography,
  projectRegionalCartographyWindow,
} from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow, type RegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import {
  settlementKeeperStoreResponseAdmissionMatchesWorld,
  settlementKeeperStoreResponseReceptionMatchesEventTime,
  type SettlementKeeperStoreResponseAdmissionAuthorityInput,
  type SettlementKeeperStoreResponseReceptionAuthorityInput,
} from "./settlementKeeperStoreResponseAdmissionAuthority";
import {
  settlementKeeperStoreResponseExpressionIntent,
} from "./settlementKeeperStoreResponseExpression";
import {
  applySettlementKeeperStoreResponse,
  createSettlementEcologyState,
  createSettlementPlayerStoreReport,
  proposeSettlementKeeperStoreResponse,
  recordSettlementKeeperKnowledge,
  type SettlementEcologyState,
} from "./settlementEcology";
import {
  createSituatedExpressionState,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
} from "./situatedExpression";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import {
  createSettlementKeeperStoreResponseExpressionAdmissionRecord,
  type SettlementKeeperStoreResponseExpressionAdmissionRecord,
} from "./situatedExpressionAdmissionLedger";
import {
  createHeardVisibleSituatedExpressionReception,
  type SituatedExpressionReception,
} from "./situatedExpressionReception";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

interface AuthorityFixture extends SettlementKeeperStoreResponseAdmissionAuthorityInput {
  readonly reception: SituatedExpressionReception | null;
  readonly awayFacingMilliRadians: number;
  readonly outOfRangePosition: WorldPosition;
  readonly outOfRangeFacingMilliRadians: number;
  readonly openSettlement: SettlementEcologyState;
}

function authorityInput(
  fixture: AuthorityFixture,
  overrides: Partial<SettlementKeeperStoreResponseAdmissionAuthorityInput> = {},
): SettlementKeeperStoreResponseAdmissionAuthorityInput {
  return {
    economyWorld: overrides.economyWorld ?? fixture.economyWorld,
    spatialWorld: overrides.spatialWorld ?? fixture.spatialWorld,
    window: overrides.window ?? fixture.window,
    playerTemplate: overrides.playerTemplate ?? fixture.playerTemplate,
    settlement: overrides.settlement ?? fixture.settlement,
    event: overrides.event ?? fixture.event,
    admission: overrides.admission ?? fixture.admission,
  };
}

function receptionInput(
  fixture: AuthorityFixture,
  overrides: Partial<SettlementKeeperStoreResponseReceptionAuthorityInput> = {},
): SettlementKeeperStoreResponseReceptionAuthorityInput {
  return {
    ...authorityInput(fixture, overrides),
    reception: Object.hasOwn(overrides, "reception")
      ? overrides.reception ?? null
      : fixture.reception,
  };
}

function canonicalAdmission(
  fixture: AuthorityFixture,
  overrides: Partial<Parameters<
    typeof createSettlementKeeperStoreResponseExpressionAdmissionRecord
  >[0]> = {},
): SettlementKeeperStoreResponseExpressionAdmissionRecord {
  const admission = createSettlementKeeperStoreResponseExpressionAdmissionRecord({
    sourceActorId: fixture.admission.sourceActorId,
    triggerEventId: fixture.admission.triggerEventId,
    sampleOrdinal: fixture.admission.sampleOrdinal,
    admittedAtPlayerStepPhase: fixture.admission.admittedAtPlayerStepPhase,
    storeId: fixture.admission.storeId,
    closureTransactionId: fixture.admission.closureTransactionId,
    sourceEvidenceId: fixture.admission.sourceEvidenceId,
    respondedAtTick: fixture.admission.respondedAtTick,
    listenerPosition: fixture.admission.listenerPosition,
    listenerFacingMilliRadians: fixture.admission.listenerFacingMilliRadians,
    hearingCertainty: fixture.admission.hearingCertainty,
    ...overrides,
  });
  if (admission === null) throw new Error("Expected canonical keeper-response admission");
  return admission;
}

function authorityFixture(seed: string, receipt: "heard" | "masked"): AuthorityFixture {
  const state = createWorld(seed, "standard");
  const keeperState = state.residents.find((resident) => (
    state.settlements.some(({ id }) => id === resident.homeSettlementId)
  ));
  if (keeperState === undefined) throw new Error("Authority fixture needs a settlement keeper");
  if (receipt === "masked") {
    // Keep the keeper visible while making the local acoustic substrate a
    // worst-case turbulent shoreline. Combined with the committed storm this
    // masks spoken voice at the edge of the three-tile conversation gate.
    const settlement = state.settlements.find(({ id }) => id === keeperState.homeSettlementId);
    if (settlement === undefined) throw new Error("Authority fixture lost its settlement");
    const sourceX = settlement.tileIndex % state.terrain.width;
    const sourceY = Math.floor(settlement.tileIndex / state.terrain.width);
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]] as const) {
      const tile = state.terrain.tiles[(sourceY + dy) * state.terrain.width + sourceX + dx];
      if (tile === undefined) continue;
      tile.elevation = 0;
      tile.roughness = FIXED_POINT;
    }
    state.tide.level = FIXED_POINT;
  }
  state.weather = {
    kind: receipt === "masked" ? "storm" : "clear",
    intensity: receipt === "masked" ? FIXED_POINT : 0,
    windX: 0,
    windY: receipt === "masked" ? FIXED_POINT : 0,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  const economyWorld = createWorldView(state);
  const keeper = economyWorld.residents.find(({ identity }) => (
    identity.stableId === keeperState.identity.stableId
  ));
  if (keeper === undefined) throw new Error("Authority fixture needs a settlement keeper");
  const sourceAddress = livingActorAddressForResident(economyWorld, keeper);
  if (sourceAddress === null) throw new Error("Authority fixture keeper needs a position");
  const openSettlement = createSettlementEcologyState({
    rootSeed: state.meta.rootSeed,
    settlementId: keeper.homeSettlementId,
    keeperActorId: keeper.identity.stableId,
    position: sourceAddress.position,
    aggregatePatch: aggregatePatch(state.meta.rootSeed, sourceAddress.position.region),
  });
  const report = createSettlementPlayerStoreReport(openSettlement, economyWorld.completedTick);
  if (report === null) throw new Error("Authority fixture could not create a player report");
  const informed = recordSettlementKeeperKnowledge(openSettlement, economyWorld.completedTick, {
    kind: "player-report",
    report,
  });
  if (informed === null) throw new Error("Authority fixture could not retain the report");
  const proposal = proposeSettlementKeeperStoreResponse(informed, economyWorld.completedTick);
  if (proposal === null) throw new Error("Authority fixture could not propose closure");
  const resolution = applySettlementKeeperStoreResponse(informed, proposal);
  if (resolution === null || !resolution.applied) {
    throw new Error("Authority fixture could not apply closure");
  }
  const intent = settlementKeeperStoreResponseExpressionIntent({
    world: economyWorld,
    settlement: resolution.state,
  });
  if (intent === null) throw new Error("Authority fixture omitted its keeper response");
  const reduced = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduced.accepted || reduced.event === null) {
    throw new Error(`Authority fixture expression was rejected: ${reduced.reason}`);
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
  const playerTemplate = createPlayer(economyWorld, keeper.homeSettlementId);
  playerTemplate.worldWidth = window.terrain.width;
  playerTemplate.worldHeight = window.terrain.height;
  const source = livingActorAddressInRegionalWindow(sourceAddress, window);
  if (source === null) throw new Error("Authority fixture keeper is outside regional window");
  const listener = findListener(
    spatialWorld,
    window,
    playerTemplate,
    event,
    source.tileIndex,
    receipt,
  );
  const outOfRange = receipt === "heard"
    ? findOutOfRangeListener(
        spatialWorld,
        window,
        playerTemplate,
        event,
        source.tileIndex,
      )
    : {
        position: listener.position,
        facingMilliRadians: listener.facingMilliRadians,
      };
  const admission = createSettlementKeeperStoreResponseExpressionAdmissionRecord({
    sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId,
    sampleOrdinal: 0,
    admittedAtPlayerStepPhase: 0,
    storeId: proposal.storeId,
    closureTransactionId: proposal.transactionId,
    sourceEvidenceId: report.reportId,
    respondedAtTick: economyWorld.completedTick,
    listenerPosition: listener.position,
    listenerFacingMilliRadians: listener.facingMilliRadians,
    hearingCertainty: listener.hearingCertainty,
  });
  if (admission === null) throw new Error("Authority fixture admission was rejected");
  const reception = listener.hearingCertainty === null
    ? null
    : createHeardVisibleSituatedExpressionReception(
        event,
        economyWorld.completedTick,
        listener.hearingCertainty,
        true,
      );
  if (listener.hearingCertainty !== null && reception === null) {
    throw new Error("Authority fixture reception was rejected");
  }
  return {
    economyWorld,
    spatialWorld,
    window,
    playerTemplate,
    settlement: resolution.state,
    event,
    admission,
    reception,
    awayFacingMilliRadians: listener.awayFacingMilliRadians,
    outOfRangePosition: outOfRange.position,
    outOfRangeFacingMilliRadians: outOfRange.facingMilliRadians,
    openSettlement,
  };
}

function findListener(
  world: WorldView,
  window: RegionalTerrainWindow,
  template: PlayerState,
  event: SituatedExpressionEvent,
  sourceTileIndex: number,
  receipt: "heard" | "masked",
): Readonly<{
  position: WorldPosition;
  facingMilliRadians: number;
  awayFacingMilliRadians: number;
  hearingCertainty: number | null;
}> {
  for (const distanceTiles of [1, 2, 2.25, 2.5, 2.75, 3]) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const candidate = listenerCandidate(
        world,
        window,
        template,
        event,
        sourceTileIndex,
        distanceTiles,
        dx,
        dy,
        receipt === "heard",
      );
      if (candidate === null) continue;
      if ((candidate.hearingCertainty === null) === (receipt === "masked")) return candidate;
    }
  }
  throw new Error(`Authority fixture could not find a direct ${receipt} listener`);
}

function findOutOfRangeListener(
  world: WorldView,
  window: RegionalTerrainWindow,
  template: PlayerState,
  event: SituatedExpressionEvent,
  sourceTileIndex: number,
): Readonly<{ position: WorldPosition; facingMilliRadians: number }> {
  for (const distanceTiles of [4, 5, 6, 7]) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const candidate = listenerCandidate(
        world,
        window,
        template,
        event,
        sourceTileIndex,
        distanceTiles,
        dx,
        dy,
      );
      if (candidate !== null) {
        const delta = worldPositionDelta(candidate.position, event.position);
        const limit = RESIDENT_CONVERSATION_RANGE_TILES * WORLD_POSITION_UNITS_PER_TILE;
        if (delta.x * delta.x + delta.y * delta.y > limit * limit) return candidate;
      }
    }
  }
  throw new Error("Authority fixture could not find a direct out-of-range listener");
}

function listenerCandidate(
  world: WorldView,
  window: RegionalTerrainWindow,
  template: PlayerState,
  event: SituatedExpressionEvent,
  sourceTileIndex: number,
  distanceTiles: number,
  dx: number,
  dy: number,
  requireCloseCircleVisibility = false,
): Readonly<{
  position: WorldPosition;
  facingMilliRadians: number;
  awayFacingMilliRadians: number;
  hearingCertainty: number | null;
}> | null {
  const sourceTileX = sourceTileIndex % window.terrain.width;
  const sourceTileY = Math.floor(sourceTileIndex / window.terrain.width);
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
  ) return null;
  const toward = Math.round(Math.atan2(
    sourceTileY * TILE_UNITS + TILE_UNITS / 2 - listener.y,
    sourceTileX * TILE_UNITS + TILE_UNITS / 2 - listener.x,
  ) * 1_000);
  const away = Math.round((toward / 1_000 + Math.PI) * 1_000);
  listener.facingMilliRadians = toward;
  listener.previousX = listener.x;
  listener.previousY = listener.y;
  if (projectPerception(world, listener).detailVisibilityGrades[sourceTileIndex]
    !== VISIBILITY_DIRECT) return null;
  listener.facingMilliRadians = away;
  // The clear nearby player circle now grants direct sight in every direction,
  // without removing the separate hearing or conversation-distance gates.
  if (
    requireCloseCircleVisibility
    && projectPerception(world, listener).detailVisibilityGrades[sourceTileIndex]
      !== VISIBILITY_DIRECT
  ) return null;
  listener.facingMilliRadians = toward;
  const position = playerWorldPositionInRegionalWindow(window, listener);
  const masking = ambientNoiseAt(world, playerTileIndex(listener));
  if (position === null || masking === null) return null;
  const delta = worldPositionDelta(position, event.position);
  const acoustics = situatedExpressionAcoustics(event);
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
  return Object.freeze({
    position,
    facingMilliRadians: toward,
    awayFacingMilliRadians: away,
    hearingCertainty: heard === null
      ? null
      : Math.max(1, Math.round(heard.certainty * FIXED_POINT)),
  });
}

describe("settlement keeper store-response event-time admission authority", () => {
  it("reauthenticates exact heard-visible and honestly masked receptions", () => {
    const heard = authorityFixture("keeper response authority heard", "heard");
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(heard))).toBe(true);
    expect(settlementKeeperStoreResponseReceptionMatchesEventTime(receptionInput(heard))).toBe(true);
    const awayAdmission = canonicalAdmission(heard, {
      listenerFacingMilliRadians: heard.awayFacingMilliRadians,
    });
    // A finite turn inside the clear close circle is equivalent lawful contact;
    // independent runtime carry-heading authentication is not this module's job.
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(heard, {
      admission: awayAdmission,
    }))).toBe(true);
    expect(settlementKeeperStoreResponseReceptionMatchesEventTime(receptionInput(heard, {
      admission: awayAdmission,
    }))).toBe(true);
    const movedPlayerTemplate: PlayerState = {
      ...heard.playerTemplate,
      x: 0,
      y: 0,
      previousX: 0,
      previousY: 0,
      facingMilliRadians: heard.awayFacingMilliRadians,
    };
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(heard, {
      playerTemplate: movedPlayerTemplate,
    }))).toBe(true);
    expect(settlementKeeperStoreResponseReceptionMatchesEventTime(receptionInput(heard, {
      playerTemplate: movedPlayerTemplate,
    }))).toBe(true);

    const masked = authorityFixture("keeper response authority masked", "masked");
    expect(masked.admission.hearingCertainty).toBeNull();
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(masked))).toBe(true);
    expect(settlementKeeperStoreResponseReceptionMatchesEventTime(receptionInput(masked))).toBe(true);
    const forgedHeardReception = createHeardVisibleSituatedExpressionReception(
      masked.event,
      masked.admission.respondedAtTick,
      1,
      true,
    );
    if (forgedHeardReception === null) throw new Error("Expected forged heard reception fixture");
    expect(settlementKeeperStoreResponseReceptionMatchesEventTime(receptionInput(masked, {
      reception: forgedHeardReception,
    }))).toBe(false);
  });

  it("rejects forged reception, hearing certainty, invalid facing, and position", () => {
    const fixture = authorityFixture("keeper response authority tamper", "heard");
    expect(settlementKeeperStoreResponseReceptionMatchesEventTime(receptionInput(fixture, {
      reception: null,
    }))).toBe(false);
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(fixture, {
      admission: { ...fixture.admission, hearingCertainty: fixture.admission.hearingCertainty! + 1 },
    }))).toBe(false);
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(fixture, {
      admission: {
        ...fixture.admission,
        listenerFacingMilliRadians: Number.NaN,
      },
    }))).toBe(false);
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(fixture, {
      admission: {
        ...fixture.admission,
        listenerPosition: {
          ...fixture.admission.listenerPosition,
          localX: fixture.admission.listenerPosition.localX + 1,
        },
      },
    }))).toBe(false);
  });

  it("rejects an out-of-range receipt and a mismatched regional world/window", () => {
    const fixture = authorityFixture("keeper response authority spatial binding", "heard");
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(fixture, {
      admission: {
        ...fixture.admission,
        listenerPosition: fixture.outOfRangePosition,
        listenerFacingMilliRadians: fixture.outOfRangeFacingMilliRadians,
      },
    }))).toBe(false);

    const foreignState = createWorld("keeper response foreign regional world", "standard");
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
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(fixture, {
      spatialWorld: foreignWorld,
    }))).toBe(false);
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(fixture, {
      window: foreignWindow,
    }))).toBe(false);
  });

  it("rejects stale closure, forged transaction evidence, and forged source authority", () => {
    const fixture = authorityFixture("keeper response authority source binding", "heard");
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(fixture, {
      settlement: fixture.openSettlement,
    }))).toBe(false);

    const forgedAdmissions = [
      canonicalAdmission(fixture, {
        respondedAtTick: fixture.admission.respondedAtTick + 1,
      }),
      canonicalAdmission(fixture, {
        storeId: "STORE-forged",
      }),
      canonicalAdmission(fixture, {
        triggerEventId: "STORE-SECURE-forged",
        closureTransactionId: "STORE-SECURE-forged",
      }),
      canonicalAdmission(fixture, {
        sourceEvidenceId: "STORE-REPORT-forged",
      }),
      canonicalAdmission(fixture, {
        sourceActorId: "H-forged-keeper",
      }),
    ];
    for (const admission of forgedAdmissions) {
      expect(settlementKeeperStoreResponseAdmissionMatchesWorld(authorityInput(fixture, {
        admission,
      }))).toBe(false);
    }
  });
});

function aggregatePatch(
  seed: Parameters<typeof deriveCoreEcologyHarborEdgeHabitatAssemblage>[0]["rootSeed"],
  originRegion: ReturnType<typeof createRegionCoord>,
): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: seed,
    originRegion,
  });
  return createCoreEcologyAggregatePatch({
    seed,
    patchKey: "keeper-store-response-authority:fixture",
    originRegion,
    tick: 0,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v2", habitat },
  });
}

function individualInputs(
  habitat: CoreEcologyHarborEdgeHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "coarse" as const,
          })),
        }]
  ));
}
