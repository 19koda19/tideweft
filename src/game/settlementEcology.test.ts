import { describe, expect, it } from "vitest";

import { createActorObservation } from "../sim/actorPerception";
import { REGION_COORD_LIMIT, createRegionCoord, type RegionCoord } from "../sim/regions";
import { seedFromText, type RootSeed } from "../sim/rng";
import { createActorScentObservation } from "../sim/scentPerception";
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
import {
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
  stepCoreEcologySettlementShadows,
  type CoreEcologySettlementShadowsEvent,
  type CoreEcologySettlementShadowsStimulusFrame,
} from "./coreEcologySmallWorld";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY,
  applySettlementKeeperStoreResponse,
  canonicalizeSettlementEcologyState,
  createSettlementEcologyState,
  createSettlementPlayerStoreReport,
  deserializeSettlementEcologyState,
  projectSettlementFoodStoreSource,
  proposeSettlementKeeperStoreResponse,
  proposeSettlementRatAttraction,
  recordSettlementKeeperKnowledge,
  recoverPendingSettlementFoodLoss,
  resolveSettlementFoodLoss,
  serializeSettlementEcologyState,
  stageSettlementFoodLoss,
  type SettlementEcologyState,
  type SettlementRatAttractionProposal,
} from "./settlementEcology";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  type WorldPosition,
} from "./worldPosition";

const SEED = seedFromText("alpha 23 storehouse door");
const ORIGIN = createRegionCoord(-91, 37);
const KEEPER_ID = "H-v1-alpha23-keeper";
const CAT_ID = "CAT-v1-alpha23-store";

describe("settlement food-store ecology kernel", () => {
  it("derives stable identity and binds the nearest existing rat anchor once", () => {
    const patch = fixturePatch(0);
    const rats = ratPopulation(patch);
    const position = translateWorldPosition(rats.anchors[0]!.position, 17, 23);
    const first = store(patch, position);
    const replay = store(structuredClone(patch), position);

    expect(replay).toEqual(first);
    expect(first.identity.position).toEqual(position);
    expect(first.identity.ratAggregateId).toBe(rats.aggregateId);
    expect(first.identity.storeAnchorOrdinal).toBe(rats.anchors[0]!.anchorOrdinal);
    expect(first.identity.position.region).toEqual(ORIGIN);
    expect(first.carrier.owner).toEqual({ kind: "settlement", id: 19 });
    expect(first.carrier.lots).toEqual([
      expect.objectContaining({
        id: first.identity.foodLotId,
        payload: {
          kind: "provision",
          lotId: first.identity.foodLotId,
          provision: "fresh-produce",
          quantity: SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY,
        },
      }),
    ]);
    expect("quantity" in first).toBe(false);
  });

  it("strictly canonicalizes the one physical lot and round-trips without rebinding", () => {
    const initial = store(fixturePatch());
    const encoded = serializeSettlementEcologyState(initial);
    const restored = deserializeSettlementEcologyState(encoded);
    expect(restored).toEqual(initial);
    expect(serializeSettlementEcologyState(restored)).toBe(encoded);

    const extra = JSON.parse(encoded) as Record<string, unknown>;
    extra.mirroredFoodQuantity = SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY;
    expect(canonicalizeSettlementEcologyState(extra)).toBeNull();

    const tampered = JSON.parse(encoded) as {
      carrier: { lots: Array<{ payload: { quantity: number } }> };
    };
    tampered.carrier.lots[0]!.payload.quantity -= 1;
    expect(canonicalizeSettlementEcologyState(tampered)).toBeNull();

    const moved = JSON.parse(encoded) as {
      identity: { storeAnchorOrdinal: number };
    };
    moved.identity.storeAnchorOrdinal += 1;
    expect(canonicalizeSettlementEcologyState(moved)).toBeNull();

    const forgedSecured = JSON.parse(encoded) as {
      closure: string;
      lastClosureTransactionId: string | null;
    };
    forgedSecured.closure = "secured";
    forgedSecured.lastClosureTransactionId = "STORE-SECURE-0000000000000000";
    expect(canonicalizeSettlementEcologyState(forgedSecured)).toBeNull();
  });

  it("keeps one deterministic identity through a bounded signed-coordinate property sweep", () => {
    const extremeOrigins = [
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ];

    for (const origin of extremeOrigins) {
      const patch = fixturePatch(0, origin);
      const rats = ratPopulation(patch);
      for (let sample = 0; sample < 12; sample += 1) {
        const anchor = rats.anchors[sample % rats.anchors.length]!;
        const offsetX = (sample * 73 % 701) - 350;
        const offsetY = (sample * 137 % 701) - 350;
        const position = translateWorldPosition(anchor.position, offsetX, offsetY);
        const first = store(patch, position);
        const replay = store(structuredClone(patch), position);
        const restored = deserializeSettlementEcologyState(
          serializeSettlementEcologyState(first),
        );

        expect(replay).toEqual(first);
        expect(restored).toEqual(first);
        expect(first.identity.position).toEqual(position);
        expect(first.identity.position.region).toEqual(origin);
        expect(first.identity.ratAggregateId).toBe(rats.aggregateId);
        expect(rats.anchors.some(({ anchorOrdinal }) => (
          anchorOrdinal === first.identity.storeAnchorOrdinal
        ))).toBe(true);
      }
    }
  });

  it("projects open/sealed leakage while shared scent owns wind and rain", () => {
    const initial = store(fixturePatch());
    const open = projectSettlementFoodStoreSource(initial);
    expect(open).toMatchObject({
      closure: "open",
      source: {
        sourceReferenceId: initial.identity.foodLotId,
        packagingLeakage: FIXED_POINT,
      },
    });
    const observer = translateWorldPosition(initial.identity.position, -2_000, 0);
    const scent = (windX: number, rainIntensity: number) => createActorScentObservation({
      id: `scent:${windX}:${rainIntensity}`,
      observerId: CAT_ID,
      observedAtTick: 8,
      perceivedClass: "food-scent",
      observerPosition: observer,
      sourcePosition: open!.source.position,
      baseRangeUnits: 20_000,
      sourceStrength: open!.source.sourceStrength,
      packagingLeakage: open!.source.packagingLeakage,
      wind: { x: windX, y: 0 },
      rainIntensity,
    });
    const downwind = scent(-FIXED_POINT, 0);
    const upwind = scent(FIXED_POINT, 0);
    const rainy = scent(-FIXED_POINT, 300_000);
    expect(downwind).not.toBeNull();
    expect(upwind).not.toBeNull();
    expect(rainy).not.toBeNull();
    expect(downwind!.confidence).toBeGreaterThan(upwind!.confidence);
    expect(rainy!.confidence).toBeLessThan(downwind!.confidence);
    expect(projectSettlementFoodStoreSource(initial)).toEqual(open);

    const secured = secureFromPlayerReport(initial, 8);
    const sealed = projectSettlementFoodStoreSource(secured);
    expect(sealed?.source.sourceStrength).toBe(open?.source.sourceStrength);
    expect(sealed?.source.packagingLeakage).toBe(0);
    expect(createActorScentObservation({
      id: "scent:sealed",
      observerId: CAT_ID,
      observedAtTick: 8,
      perceivedClass: "food-scent",
      observerPosition: observer,
      sourcePosition: sealed!.source.position,
      baseRangeUnits: 20_000,
      sourceStrength: sealed!.source.sourceStrength,
      packagingLeakage: sealed!.source.packagingLeakage,
      wind: { x: -FIXED_POINT, y: 0 },
      rainIntensity: 0,
    })).toBeNull();
  });

  it("lets the keeper act only on direct observation or an explicit player report", () => {
    const initial = store(fixturePatch());
    expect(proposeSettlementKeeperStoreResponse(initial, 12)).toBeNull();

    const wrongObserver = observedFood(CAT_ID, initial.identity, 12);
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "direct-observation",
      risk: "food-exposed",
      observation: wrongObserver,
    })).toBeNull();

    const unrelatedFood = {
      ...observedFood(KEEPER_ID, initial.identity, 12),
      id: "observation:keeper:unrelated-food",
      subjectId: "STORE-FOOD-unrelated",
    };
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "direct-observation",
      risk: "food-exposed",
      observation: unrelatedFood,
    })).toBeNull();

    const scentedSign = createActorObservation({
      id: "observation:keeper:scented-sign",
      observerId: KEEPER_ID,
      observedAtTick: 12,
      channel: "scent",
      perceivedClass: "rat-sign",
      area: { center: initial.identity.position, radiusUnits: 1_000 },
      confidence: 700_000,
      salience: 600_000,
      identification: "classified",
    });
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "direct-observation",
      risk: "rat-activity",
      observation: scentedSign,
    })).toBeNull();

    const direct = observedFood(KEEPER_ID, initial.identity, 12);
    const informed = recordSettlementKeeperKnowledge(initial, 12, {
      kind: "direct-observation",
      risk: "food-exposed",
      observation: direct,
    });
    expect(informed?.keeperKnowledge).toEqual([
      expect.objectContaining({ source: "direct-observation", sourceActorId: KEEPER_ID }),
    ]);
    expect(proposeSettlementKeeperStoreResponse(informed, 12)).not.toBeNull();

    const report = createSettlementPlayerStoreReport(initial, 12);
    expect(createSettlementPlayerStoreReport(initial, 12)).toEqual(report);
    expect(report).toMatchObject({
      reporterActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      recipientKeeperActorId: KEEPER_ID,
      storeId: initial.identity.storeId,
      risk: "food-exposed",
    });
    const reported = recordSettlementKeeperKnowledge(initial, 12, {
      kind: "player-report",
      report,
    });
    expect(reported?.keeperKnowledge[0]).toMatchObject({ source: "player-report" });
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "player-report",
      report: { ...report, reportId: "STORE-REPORT-forged" },
    })).toBeNull();
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "player-report",
      report: { ...report, risk: "rat-activity" },
    })).toBeNull();
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "player-report",
      report: { ...report, confidence: report!.confidence - 1 },
    })).toBeNull();

    const savedReport = JSON.parse(serializeSettlementEcologyState(reported)) as {
      keeperKnowledge: Array<{ risk: string; confidence: number }>;
    };
    savedReport.keeperKnowledge[0]!.risk = "rat-activity";
    expect(canonicalizeSettlementEcologyState(savedReport)).toBeNull();
  });

  it("adapts one conserved rat relocation into one transactional physical loss", () => {
    const current = attractionFixture();
    const ratsBefore = ratPopulation(current.patch);
    const populationBefore = ratsBefore.populationSize;
    const quantityBefore = foodQuantity(current.state);
    expect(current.proposal).toMatchObject({
      maximumRedistributedUnits: 1,
      populationConservation: "required",
      itemConsumption: "none",
      ratAggregateId: current.state.identity.ratAggregateId,
      storeAnchorOrdinal: current.state.identity.storeAnchorOrdinal,
    });
    expect(current.event).toMatchObject({
      displacedUnits: 1,
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
      toAnchorOrdinal: current.state.identity.storeAnchorOrdinal,
    });
    expect(ratPopulation(current.nextPatch).populationSize).toBe(populationBefore);

    const staged = stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.nextPatch,
      current.event,
    );
    expect(staged?.reusedPendingTransaction).toBe(false);
    expect(foodQuantity(staged!.state)).toBe(quantityBefore);
    expect(stageSettlementFoodLoss(
      staged!.state,
      current.proposal,
      current.nextPatch,
      current.event,
    )?.reusedPendingTransaction).toBe(true);

    const restoredPending = deserializeSettlementEcologyState(
      serializeSettlementEcologyState(staged!.state),
    );
    expect(recoverPendingSettlementFoodLoss(restoredPending, current.patch)).toBeNull();
    const resolved = recoverPendingSettlementFoodLoss(restoredPending, current.nextPatch);
    expect(resolved?.applied).toBe(true);
    expect(resolved?.removed).toEqual([
      expect.objectContaining({
        id: current.state.identity.foodLotId,
        payload: expect.objectContaining({ quantity: 1 }),
      }),
    ]);
    expect(foodQuantity(resolved!.state)).toBe(quantityBefore - 1);
    expect(resolveSettlementFoodLoss(resolved!.state, staged!.transaction)).toEqual({
      state: resolved!.state,
      applied: false,
      removed: [],
    });
    expect(stageSettlementFoodLoss(
      resolved!.state,
      current.proposal,
      current.nextPatch,
      current.event,
    )).toBeNull();
  });

  it("rejects wrong aggregate/anchor causality and any loss from a secured store", () => {
    const current = attractionFixture();
    const wrongAnchor = {
      ...current.event,
      toAnchorOrdinal: current.event.toAnchorOrdinal + 1,
    };
    expect(stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.nextPatch,
      wrongAnchor,
    )).toBeNull();

    const wrongAggregate = {
      ...current.proposal,
      ratAggregateId: `${current.proposal.ratAggregateId}-other`,
    };
    expect(stageSettlementFoodLoss(
      current.state,
      wrongAggregate,
      current.nextPatch,
      current.event,
    )).toBeNull();

    const secured = secureFromPlayerReport(current.state, 0);
    expect(stageSettlementFoodLoss(
      secured,
      current.proposal,
      current.nextPatch,
      current.event,
    )).toBeNull();

    expect(stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.patch,
      current.event,
    )).toBeNull();
    expect(stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.nextPatch,
      { ...current.event, eventId: "settlement-shadows:forged:event" },
    )).toBeNull();
    expect(stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.nextPatch,
      { ...current.event, forged: true },
    )).toBeNull();
  });
});

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

function fixturePatch(
  tick = 0,
  origin: RegionCoord = ORIGIN,
  seed: RootSeed = SEED,
): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: seed,
    originRegion: origin,
  });
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: "alpha23:storehouse-test",
    originRegion: origin,
    tick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v2", habitat },
  });
  ratPopulation(patch);
  return patch;
}

function ratPopulation(patch: CoreEcologyAggregatePatchState) {
  const rats = patch.aggregatePopulations.find(({ species }) => species === "brown-rat");
  if (rats === undefined || rats.anchors.length < 2) {
    throw new Error("Storehouse fixture requires two rat anchors");
  }
  return rats;
}

function store(
  patch: CoreEcologyAggregatePatchState,
  position: WorldPosition = createWorldPosition(patch.originRegion, 48_000, 36_000),
): SettlementEcologyState {
  return createSettlementEcologyState({
    rootSeed: SEED,
    settlementId: 19,
    keeperActorId: KEEPER_ID,
    position,
    aggregatePatch: patch,
  });
}

function observedFood(
  observerId: string,
  identity: SettlementEcologyState["identity"],
  atTick: number,
) {
  const observation = createActorObservation({
    id: `observation:${observerId}:${atTick}`,
    observerId,
    observedAtTick: atTick,
    channel: "vision",
    perceivedClass: "exposed-food",
    subjectId: identity.foodLotId,
    area: { center: identity.position, radiusUnits: 0 },
    confidence: 900_000,
    salience: 700_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("Could not create direct store observation");
  return observation;
}

function secureFromPlayerReport(
  initial: SettlementEcologyState,
  atTick: number,
): SettlementEcologyState {
  const report = createSettlementPlayerStoreReport(initial, atTick);
  const informed = recordSettlementKeeperKnowledge(initial, atTick, {
    kind: "player-report",
    report,
  });
  const proposal = proposeSettlementKeeperStoreResponse(informed, atTick);
  const resolution = applySettlementKeeperStoreResponse(informed, proposal);
  if (resolution === null || !resolution.applied) throw new Error("Could not secure store fixture");
  return resolution.state;
}

function foodQuantity(state: SettlementEcologyState): number {
  const lot = state.carrier.lots.find(({ id }) => id === state.identity.foodLotId);
  return lot?.payload.kind === "provision" ? lot.payload.quantity : 0;
}

function attractionFixture(): Readonly<{
  state: SettlementEcologyState;
  patch: CoreEcologyAggregatePatchState;
  nextPatch: CoreEcologyAggregatePatchState;
  frame: CoreEcologySettlementShadowsStimulusFrame;
  proposal: SettlementRatAttractionProposal;
  event: CoreEcologySettlementShadowsEvent;
}> {
  const patch = fixturePatch(0);
  const rats = ratPopulation(patch);
  const donor = rats.anchors.find(({ populationUnits }) => populationUnits > 0);
  const target = rats.anchors.find(({ anchorOrdinal }) => (
    anchorOrdinal !== donor?.anchorOrdinal
  ));
  if (donor === undefined || target === undefined) throw new Error("Rat movement fixture is invalid");
  const state = store(patch, target.position);
  if (state.identity.storeAnchorOrdinal !== target.anchorOrdinal) {
    throw new Error("Store did not bind the intended nearest anchor");
  }
  const frame: CoreEcologySettlementShadowsStimulusFrame = {
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    atTick: patch.updatedAtTick,
    stimuli: [{
      version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
      stimulusId: "stimulus:store-fresh-produce",
      sourceReferenceId: state.identity.foodLotId,
      sourceKind: "exposed-food",
      response: "attraction",
      targetAggregateId: state.identity.ratAggregateId,
      channels: ["scent"],
      anchorInfluences: [
        { anchorOrdinal: donor.anchorOrdinal, intensity: 0 },
        { anchorOrdinal: target.anchorOrdinal, intensity: FIXED_POINT },
      ],
    }],
  };
  const proposal = proposeSettlementRatAttraction(state, patch, frame);
  if (proposal === null) throw new Error("Store did not authorize rat attraction");
  const stepped = stepCoreEcologySettlementShadows(patch, patch.updatedAtTick, frame);
  const event = stepped?.events.find((candidate) => (
    candidate.stimulusId === proposal.stimulusId
    && candidate.aggregateId === proposal.ratAggregateId
  ));
  if (stepped === null || event === undefined) throw new Error("Rat attraction did not relocate");
  return { state, patch, nextPatch: stepped.patch, frame, proposal, event };
}
