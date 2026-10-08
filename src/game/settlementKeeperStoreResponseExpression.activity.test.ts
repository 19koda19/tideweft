import { describe, expect, it } from "vitest";

import {
  assertWorldInvariants, createWorld, createWorldView, deserializeWorld, serializeWorld,
} from "../sim/public";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { FIXED_POINT, type WorldState } from "../sim/types";
import { createCoreEcologyAggregatePatch, type CoreEcologyPopulationInput } from "./coreEcology";
import { deriveCoreEcologyHarborEdgeHabitatAssemblage } from "./coreEcologyHabitat";
import { livingActorAddressForResident, livingActorAddressInRegionalWindow } from "./livingActor";
import { ambientNoiseAt } from "./physicalAcousticPerception";
import { evaluateAudibleContact, VISIBILITY_DIRECT } from "./perception";
import { createPlayer, playerTileIndex } from "./player";
import { projectPerception } from "./projection";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities,
} from "./residentActivityExecution";
import { playerWorldPositionInRegionalWindow, resolveResidentWorldPlacement } from "./residentSpatial";
import {
  applySettlementKeeperStoreResponse, createSettlementEcologyState, createSettlementPlayerStoreReport,
  deserializeSettlementEcologyState, proposeSettlementKeeperStoreResponse, recordSettlementKeeperKnowledge,
  serializeSettlementEcologyState,
} from "./settlementEcology";
import {
  settlementKeeperStoreResponseAdmissionMatchesWorld,
  settlementKeeperStoreResponseReceptionMatchesEventTime,
} from "./settlementKeeperStoreResponseAdmissionAuthority";
import {
  settlementKeeperStoreResponseExpressionEventForTrigger,
  settlementKeeperStoreResponseExpressionEventMatchesWorld,
  settlementKeeperStoreResponseExpressionIntent,
  settlementKeeperStoreResponseExpressionMemoryMatchesWorld,
  settlementKeeperStoreResponseExpressionSourceAddress,
  type SettlementKeeperStoreResponseExpressionInput,
} from "./settlementKeeperStoreResponseExpression";
import { createSituatedExpressionState, reduceSituatedExpression } from "./situatedExpression";
import { situatedExpressionAcoustics } from "./situatedExpressionAcoustics";
import { createSettlementKeeperStoreResponseExpressionAdmissionRecord } from "./situatedExpressionAdmissionLedger";
import { createHeardVisibleSituatedExpressionReception } from "./situatedExpressionReception";
import { WORLD_POSITION_UNITS_PER_TILE, worldPositionDelta } from "./worldPosition";

// Real report/knowledge/proposal/application and native body/rest owners. The
// report kernel does not authorize runtime contact, and this fixture does not
// claim normal-game adoption or a physical keeper-work implementation.
const BASE = createWorld("resident activity executable rest approach", "standard");

function keeperAt(state: WorldState, id: number) {
  const keeper = state.residents.find((resident) => resident.id === id);
  if (keeper === undefined) throw new Error("fixture lost its native keeper");
  return keeper;
}

function fixture(sourcePhase = 3, adopt = true) {
  const state = structuredClone(BASE);
  state.weather = {
    kind: "clear", intensity: 0, windX: 0, windY: 0,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  for (const resident of state.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const contract of state.contracts) {
    contract.playerExclusiveUntilTick = state.meta.completedTick + 1_000;
    contract.dueTick = state.meta.completedTick + 2_000;
  }
  const chosen = state.residents.find((resident) => {
    const source = resolveResidentWorldPlacement(state, resident)?.position;
    const target = residentSettlementRestTarget(state, resident);
    if (!source || !target || !residentRestTargetHasDrySupport(state, source)
      || !residentRestTargetHasDrySupport(state, target)) return false;
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === WORLD_POSITION_UNITS_PER_TILE;
  });
  if (chosen === undefined) throw new Error("fixture needs a native one-tile dry rest approach");
  const id = chosen.id;
  const initialPosition = resolveResidentWorldPlacement(state, chosen)!.position;
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: state.meta.rootSeed, originRegion: initialPosition.region,
  });
  const populations: readonly CoreEcologyPopulationInput[] = habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives" || population.populationUnits === 0
      ? [] : [{
        species: population.species, populationKey: population.populationKey,
        populationSize: population.populationUnits,
        members: population.allocations.map((allocation) => ({
          populationOrdinal: allocation.allocationOrdinal, representedUnits: allocation.representedUnits,
          position: allocation.position, materialization: "coarse" as const,
        })),
      }]
  ));
  const open = createSettlementEcologyState({
    rootSeed: state.meta.rootSeed, settlementId: chosen.homeSettlementId,
    keeperActorId: chosen.identity.stableId, position: initialPosition,
    aggregatePatch: createCoreEcologyAggregatePatch({
      seed: state.meta.rootSeed, patchKey: "keeper-body-source:fixture",
      originRegion: initialPosition.region, tick: state.meta.completedTick, populations,
      derivation: { kind: "habitat-v2", habitat },
    }),
  });
  if (adopt) {
    chosen.needs.rest = 900_000;
    chosen.condition.exhaustion = 300_000;
    expect(adoptResidentActivities(state)).toBe(true);
    expect(prepareResidentRestActivities(state)).toBe(true);
    for (let phase = 1; phase <= sourcePhase; phase += 1) {
      expect(advanceResidentRestActivities(state, phase)?.movedActorIds).toContain(chosen.identity.stableId);
    }
  }
  const report = createSettlementPlayerStoreReport(open, state.meta.completedTick);
  if (report === null) throw new Error("fixture could not create its explicit player report");
  const informed = recordSettlementKeeperKnowledge(open, state.meta.completedTick, { kind: "player-report", report });
  if (informed === null) throw new Error("fixture could not record the actual report");
  const proposal = proposeSettlementKeeperStoreResponse(informed, state.meta.completedTick);
  if (proposal === null) throw new Error("fixture could not propose its closure");
  const applied = applySettlementKeeperStoreResponse(informed, proposal);
  if (applied === null || !applied.applied) throw new Error("fixture could not apply its closure");
  const input = { world: createWorldView(state), settlement: applied.state, sourcePhase };
  const intent = settlementKeeperStoreResponseExpressionIntent(input);
  if (intent === null) throw new Error("actual closure did not derive keeper speech");
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduction.accepted || reduction.event === null || reduction.state === null) throw new Error("keeper speech was not accepted");
  return { state, id, open, secured: applied.state, sourcePhase, proposal, report, input, intent,
    expression: reduction.event, memory: reduction.state.recent[0]! };
}

function assertRejected(input: SettlementKeeperStoreResponseExpressionInput, value: ReturnType<typeof fixture>) {
  expect(settlementKeeperStoreResponseExpressionSourceAddress(input)).toBeNull();
  expect(settlementKeeperStoreResponseExpressionIntent(input)).toBeNull();
  expect(settlementKeeperStoreResponseExpressionEventForTrigger(input, value.intent.triggerEventId)).toBeNull();
  expect(settlementKeeperStoreResponseExpressionEventMatchesWorld(input, value.expression)).toBe(false);
  expect(settlementKeeperStoreResponseExpressionMemoryMatchesWorld(input, value.memory)).toBe(false);
}

describe("keeper store-response retained body source", () => {
  it.each([0, 3, 9])("retains phase%s position and heading after subsequent actual approach movement", (sourcePhase) => {
    const current = fixture(sourcePhase);
    const pose = keeperAt(current.state, current.id).activity!.poses[sourcePhase]!;
    expect(current.intent.position).toEqual(pose.position);
    expect(settlementKeeperStoreResponseExpressionSourceAddress(current.input)).toMatchObject({
      actorId: current.intent.sourceActorId, position: pose.position, heading: pose.heading,
    });
    for (let phase = sourcePhase + 1; phase <= 10; phase += 1) {
      expect(advanceResidentRestActivities(current.state, phase)?.movedActorIds).toContain(current.intent.sourceActorId);
    }
    const world = createWorldView(current.state);
    const input = { ...current.input, world };
    expect(settlementKeeperStoreResponseExpressionSourceAddress(input)?.position).toEqual(pose.position);
    expect(settlementKeeperStoreResponseExpressionSourceAddress(input)?.heading).toBe(pose.heading);
    const live = { world, settlement: current.secured };
    expect(settlementKeeperStoreResponseExpressionSourceAddress(live)?.position).not.toEqual(pose.position);
    expect(settlementKeeperStoreResponseExpressionEventMatchesWorld(live, current.expression)).toBe(false);
    expect(settlementKeeperStoreResponseExpressionEventForTrigger(input, current.intent.triggerEventId)).toEqual(current.expression);
    expect(settlementKeeperStoreResponseExpressionEventMatchesWorld(input, current.expression)).toBe(true);
    expect(settlementKeeperStoreResponseExpressionMemoryMatchesWorld(input, current.memory)).toBe(true);
    assertWorldInvariants(current.state);
  });

  it("preserves exact detached inner world and settlement bytes with source/event/memory rederivation", () => {
    const current = fixture(9);
    expect(advanceResidentRestActivities(current.state, 10)).not.toBeNull();
    const worldBytes = serializeWorld(current.state);
    const settlementBytes = serializeSettlementEcologyState(current.secured);
    const state = deserializeWorld(worldBytes);
    const settlement = deserializeSettlementEcologyState(settlementBytes);
    expect(serializeWorld(state)).toBe(worldBytes);
    expect(serializeSettlementEcologyState(settlement)).toBe(settlementBytes);
    expect(keeperAt(state, current.id).activity).not.toBe(keeperAt(current.state, current.id).activity);
    const input = { world: createWorldView(state), settlement, sourcePhase: current.sourcePhase };
    expect(settlementKeeperStoreResponseExpressionSourceAddress(input))
      .toEqual(settlementKeeperStoreResponseExpressionSourceAddress(current.input));
    expect(settlementKeeperStoreResponseExpressionIntent(input)).toEqual(current.intent);
    expect(settlementKeeperStoreResponseExpressionEventForTrigger(input, current.intent.triggerEventId)).toEqual(current.expression);
    expect(settlementKeeperStoreResponseExpressionEventMatchesWorld(input, current.expression)).toBe(true);
    expect(settlementKeeperStoreResponseExpressionMemoryMatchesWorld(input, current.memory)).toBe(true);
    expect(state.events).toEqual(current.state.events);
    assertWorldInvariants(state);
  });

  it("rejects explicitly invalid phases rather than using the live source", () => {
    const current = fixture();
    for (const sourcePhase of [undefined, null, -1, -0, 0.5, 10, Number.NaN, Infinity, "3", true]) {
      const input = { ...current.input, sourcePhase } as unknown as SettlementKeeperStoreResponseExpressionInput;
      assertRejected(input, current);
    }
  });

  it("rejects missing retained phases, stale ticks and malformed explicit bodies without legacy fallback", () => {
    const current = fixture(9);
    const malformedActivities: readonly unknown[] = [
      null, undefined, {},
      { ...keeperAt(current.state, current.id).activity, poses: keeperAt(current.state, current.id).activity!.poses.slice(0, 9) },
      { ...keeperAt(current.state, current.id).activity, tick: current.state.meta.completedTick + 1 },
      { ...keeperAt(current.state, current.id).activity, version: 2 },
      { ...keeperAt(current.state, current.id).activity, actorId: current.state.residents.find(({ id }) => id !== current.id)!.identity.stableId },
    ];
    for (const activity of malformedActivities) {
      const world = structuredClone(current.input.world);
      const keeper = world.residents.find(({ id }) => id === current.id)!;
      Object.assign(keeper, { activity });
      assertRejected({ ...current.input, world }, current);
    }
  });

  it("keeps the applied closure, exact evidence and human keeper identity required", () => {
    const current = fixture();
    assertRejected({ ...current.input, settlement: current.open }, current);
    const wrongTransaction = { ...current.secured, lastClosureTransactionId: "STORE-SECURE-forged" };
    const noEvidence = { ...current.secured, keeperKnowledge: [] };
    for (const settlement of [wrongTransaction, noEvidence]) assertRejected({ ...current.input, settlement }, current);
    for (const alter of [
      (world: typeof current.input.world) => { world.residents.find(({ id }) => id === current.id)!.identity.stableId = "dog:forged-keeper"; },
      (world: typeof current.input.world) => {
        const keeper = world.residents.find(({ id }) => id === current.id)!;
        keeper.perception = { ...keeper.perception, actorId: "H-foreign" };
      },
      (world: typeof current.input.world) => { world.residents.find(({ id }) => id === current.id)!.homeSettlementId += 1_000; },
    ]) {
      const world = structuredClone(current.input.world);
      alter(world);
      assertRejected({ ...current.input, world }, current);
    }
    assertRejected({ ...current.input, world: { ...current.input.world, completedTick: current.input.world.completedTick + 1 } }, current);
  });

  it("preserves the old live-address derivation for genuinely absent legacy bodies", () => {
    const current = fixture(3, false);
    const live = { world: current.input.world, settlement: current.secured };
    expect(current.input.world.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    const keeper = current.input.world.residents.find(({ id }) => id === current.id)!;
    expect(settlementKeeperStoreResponseExpressionSourceAddress(current.input))
      .toEqual(livingActorAddressForResident(current.input.world, keeper));
    expect(settlementKeeperStoreResponseExpressionIntent(current.input)).toEqual(settlementKeeperStoreResponseExpressionIntent(live));
    expect(settlementKeeperStoreResponseExpressionEventForTrigger(live, current.intent.triggerEventId)).toEqual(current.expression);
    const worldBytes = serializeWorld(current.state);
    const restored = deserializeWorld(worldBytes);
    expect(serializeWorld(restored)).toBe(worldBytes);
    expect(restored.residents.every((resident) => !Object.hasOwn(resident, "activity"))).toBe(true);
    expect(settlementKeeperStoreResponseExpressionIntent({ ...live, world: createWorldView(restored) })).toEqual(current.intent);
  });

  it("reauthenticates actual nonzero-phase hearing and direct sight after later body movement", () => {
    const current = fixture(9);
    expect(advanceResidentRestActivities(current.state, 10)).not.toBeNull();
    const world = createWorldView(current.state);
    const sourceAddress = settlementKeeperStoreResponseExpressionSourceAddress({ ...current.input, world })!;
    const window = createRegionalTerrainWindow(current.state.meta.rootSeed,
      createTerrainRegionStreamingState({ rootSeed: current.state.meta.rootSeed }));
    const spatialWorld = createRegionalWorldView(world, window,
      projectRegionalCartographyWindow(createRegionalCartography(current.state.meta.rootSeed), window));
    const source = livingActorAddressInRegionalWindow(sourceAddress, window)!;
    const keeper = keeperAt(current.state, current.id);
    const player = createPlayer(world, keeper.homeSettlementId);
    Object.assign(player, {
      x: source.point.x, y: source.point.y, previousX: source.point.x, previousY: source.point.y,
      worldWidth: window.terrain.width, worldHeight: window.terrain.height,
    });
    const listenerPosition = playerWorldPositionInRegionalWindow(window, player)!;
    const directlyVisible = projectPerception(spatialWorld, player).detailVisibilityGrades[source.tileIndex] === VISIBILITY_DIRECT;
    expect(directlyVisible).toBe(true);
    const delta = worldPositionDelta(listenerPosition, current.expression.position);
    const acoustics = situatedExpressionAcoustics(current.expression);
    const masking = ambientNoiseAt(spatialWorld, playerTileIndex(player))!;
    const contact = evaluateAudibleContact({
      listener: { x: 0, y: 0 }, source: { x: delta.x, y: delta.y },
      baseRange: acoustics.rangeUnits, ambientNoise: masking,
      sourceLoudness: acoustics.loudness / FIXED_POINT,
      wind: { x: spatialWorld.weather.windX / FIXED_POINT, y: spatialWorld.weather.windY / FIXED_POINT },
    });
    expect(contact).not.toBeNull();
    const certainty = Math.max(1, Math.round(contact!.certainty * FIXED_POINT));
    const admission = createSettlementKeeperStoreResponseExpressionAdmissionRecord({
      sourceActorId: current.expression.sourceActorId, triggerEventId: current.expression.triggerEventId,
      sampleOrdinal: 0, admittedAtPlayerStepPhase: current.sourcePhase,
      storeId: current.proposal.storeId, closureTransactionId: current.proposal.transactionId,
      sourceEvidenceId: current.report.reportId, respondedAtTick: world.completedTick,
      listenerPosition, listenerFacingMilliRadians: player.facingMilliRadians, hearingCertainty: certainty,
    });
    expect(admission).not.toBeNull();
    const reception = createHeardVisibleSituatedExpressionReception(current.expression, world.completedTick, certainty, directlyVisible);
    expect(reception).not.toBeNull();
    const input = { economyWorld: world, spatialWorld, window, playerTemplate: player,
      settlement: current.secured, event: current.expression, admission: admission! };
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld(input)).toBe(true);
    expect(settlementKeeperStoreResponseReceptionMatchesEventTime({ ...input, reception })).toBe(true);
    expect(settlementKeeperStoreResponseAdmissionMatchesWorld({ ...input,
      admission: { ...admission!, admittedAtPlayerStepPhase: 3 } })).toBe(false);
  });
});
