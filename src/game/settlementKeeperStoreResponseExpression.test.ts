import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { seedFromText, type RootSeed } from "../sim/rng";
import {
  createWorld,
  createWorldView,
  type WorldView,
} from "../sim/public";
import {
  createCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import {
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  createSituatedExpressionState,
  projectSituatedExpression,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionMemory,
  type SituatedExpressionState,
} from "./situatedExpression";
import {
  SETTLEMENT_ECOLOGY_PLAYER_REPORT_CONFIDENCE,
  applySettlementKeeperStoreResponse,
  createSettlementEcologyState,
  createSettlementPlayerStoreReport,
  projectSettlementKeeperStoreClosureAuthority,
  proposeSettlementKeeperStoreResponse,
  recordSettlementKeeperKnowledge,
  type SettlementEcologyState,
  type SettlementKeeperStoreResponseProposal,
} from "./settlementEcology";
import {
  SETTLEMENT_KEEPER_STORE_RESPONSE_DURATION_STEPS,
  SETTLEMENT_KEEPER_STORE_RESPONSE_PRIORITY,
  SETTLEMENT_KEEPER_STORE_RESPONSE_SALIENCE,
  settlementKeeperStoreResponseExpressionEventForTrigger,
  settlementKeeperStoreResponseExpressionEventMatchesWorld,
  settlementKeeperStoreResponseExpressionIntent,
  settlementKeeperStoreResponseExpressionMemoryMatchesWorld,
} from "./settlementKeeperStoreResponseExpression";

const ROOT_SEED = seedFromText("keeper store response authority fixture");

interface StoreResponseFixture {
  readonly world: WorldView;
  readonly open: SettlementEcologyState;
  readonly secured: SettlementEcologyState;
  readonly proposal: SettlementKeeperStoreResponseProposal;
  readonly reportId: string;
  readonly keeperActorId: string;
}

function fixture(): StoreResponseFixture {
  const state = createWorld("keeper store response expression", "standard");
  const world = createWorldView(state);
  const keeper = world.residents.find((resident) => (
    world.settlements.some(({ id }) => id === resident.homeSettlementId)
  ));
  if (keeper === undefined) throw new Error("fixture needs a settlement keeper");
  const placement = resolveResidentWorldPlacement(world, keeper);
  if (placement === null) throw new Error("fixture keeper needs a world position");
  const patch = aggregatePatch(ROOT_SEED, placement.position.region);
  const open = createSettlementEcologyState({
    rootSeed: ROOT_SEED,
    settlementId: keeper.homeSettlementId,
    keeperActorId: keeper.identity.stableId,
    position: placement.position,
    aggregatePatch: patch,
  });
  const report = createSettlementPlayerStoreReport(open, world.completedTick);
  if (report === null) throw new Error("fixture could not create player report");
  const informed = recordSettlementKeeperKnowledge(open, world.completedTick, {
    kind: "player-report",
    report,
  });
  if (informed === null) throw new Error("fixture could not retain player report");
  const proposal = proposeSettlementKeeperStoreResponse(informed, world.completedTick);
  if (proposal === null) throw new Error("fixture could not propose store closure");
  const resolution = applySettlementKeeperStoreResponse(informed, proposal);
  if (resolution === null || !resolution.applied) {
    throw new Error("fixture could not apply store closure");
  }
  return {
    world,
    open,
    secured: resolution.state,
    proposal,
    reportId: report.reportId,
    keeperActorId: keeper.identity.stableId,
  };
}

function input(value: StoreResponseFixture) {
  return { world: value.world, settlement: value.secured } as const;
}

function acceptedExpression(
  intent: SituatedExpressionIntent,
): Readonly<{ event: SituatedExpressionEvent; state: SituatedExpressionState }> {
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduction.accepted || reduction.event === null || reduction.state === null) {
    throw new Error(`fixture expression was not accepted: ${reduction.reason}`);
  }
  return { event: reduction.event, state: reduction.state };
}

describe("settlement keeper store-closure authority", () => {
  it("projects the unique retained transaction and its exact source evidence", () => {
    const value = fixture();

    expect(projectSettlementKeeperStoreClosureAuthority(value.open)).toBeNull();
    const authority = projectSettlementKeeperStoreClosureAuthority(value.secured);
    expect(authority).toEqual({
      transactionId: value.proposal.transactionId,
      keeperActorId: value.keeperActorId,
      storeId: value.proposal.storeId,
      sourceEvidenceId: value.reportId,
      source: "player-report",
      sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      sourceEvidenceAtTick: value.world.completedTick,
      sourceRisk: "food-exposed",
      sourceConfidence: SETTLEMENT_ECOLOGY_PLAYER_REPORT_CONFIDENCE,
    });
    expect(Object.isFrozen(authority)).toBe(true);
    expect(projectSettlementKeeperStoreClosureAuthority(
      structuredClone(value.secured),
    )).toEqual(authority);
  });

  it("fails closed for malformed or transaction-inconsistent roots", () => {
    const value = fixture();
    const malformed = structuredClone(value.secured) as SettlementEcologyState & {
      forged?: boolean;
    };
    malformed.forged = true;
    expect(projectSettlementKeeperStoreClosureAuthority(malformed)).toBeNull();

    const wrongTransaction = structuredClone(value.secured) as {
      lastClosureTransactionId: string | null;
    };
    wrongTransaction.lastClosureTransactionId = "STORE-SECURE-forged";
    expect(projectSettlementKeeperStoreClosureAuthority(wrongTransaction)).toBeNull();

    const missingEvidence = structuredClone(value.secured) as unknown as {
      keeperKnowledge: unknown[];
    };
    missingEvidence.keeperKnowledge = [];
    expect(projectSettlementKeeperStoreClosureAuthority(missingEvidence)).toBeNull();
  });
});

describe("settlement keeper store-response expression authority", () => {
  it("derives one deterministic fixed semantic line from the applied transaction", () => {
    const value = fixture();
    const first = settlementKeeperStoreResponseExpressionIntent(input(value));
    const second = settlementKeeperStoreResponseExpressionIntent({
      world: structuredClone(value.world),
      settlement: structuredClone(value.secured),
    });
    const keeper = value.world.residents.find(({ identity }) => (
      identity.stableId === value.keeperActorId
    ));
    if (keeper === undefined) throw new Error("fixture lost its keeper");
    const placement = resolveResidentWorldPlacement(value.world, keeper);
    if (placement === null) throw new Error("fixture keeper lost its position");

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      sourceActorId: value.keeperActorId,
      triggerEventId: value.proposal.transactionId,
      position: placement.position,
      meaning: "keeper-secure-store-response",
      family: "work",
      tone: "restrained",
      volume: "spoken",
      knowledgeBasis: "self-committed-store-closure",
      priority: SETTLEMENT_KEEPER_STORE_RESPONSE_PRIORITY,
      salience: SETTLEMENT_KEEPER_STORE_RESPONSE_SALIENCE,
      durationSteps: SETTLEMENT_KEEPER_STORE_RESPONSE_DURATION_STEPS,
    });
    expect(Object.isFrozen(first)).toBe(true);
    if (first === null) throw new Error("fixture omitted its keeper response");
    const accepted = acceptedExpression(first);
    expect(projectSituatedExpression(accepted.event)?.text).toBe(
      "Storehouse door's barred.",
    );
  });

  it("reauthenticates evolved event and cooldown state from the same closure", () => {
    const value = fixture();
    const intent = settlementKeeperStoreResponseExpressionIntent(input(value));
    if (intent === null) throw new Error("fixture omitted its keeper response");
    const accepted = acceptedExpression(intent);

    expect(settlementKeeperStoreResponseExpressionEventForTrigger(
      input(value),
      intent.triggerEventId,
    )).toEqual(accepted.event);
    expect(settlementKeeperStoreResponseExpressionEventMatchesWorld(
      input(value),
      accepted.event,
    )).toBe(true);

    const acknowledged = acknowledgeSituatedExpression(accepted.state);
    if (acknowledged.state === null) throw new Error("fixture event was not acknowledged");
    const advanced = advanceSituatedExpression(acknowledged.state, 3);
    if (advanced === null || advanced.active === null || advanced.recent[0] === undefined) {
      throw new Error("fixture response expired before authentication");
    }
    expect(settlementKeeperStoreResponseExpressionEventMatchesWorld(
      input(value),
      advanced.active,
    )).toBe(true);
    expect(settlementKeeperStoreResponseExpressionMemoryMatchesWorld(
      input(value),
      advanced.recent[0],
    )).toBe(true);
  });

  it("rejects stale roots and forged event or memory authority", () => {
    const value = fixture();
    const intent = settlementKeeperStoreResponseExpressionIntent(input(value));
    if (intent === null) throw new Error("fixture omitted its keeper response");
    const accepted = acceptedExpression(intent);
    const memory = accepted.state.recent[0];
    if (memory === undefined) throw new Error("fixture omitted cooldown memory");

    const staleWorld = {
      ...value.world,
      completedTick: value.world.completedTick + 1,
    } as WorldView;
    expect(settlementKeeperStoreResponseExpressionIntent({
      world: staleWorld,
      settlement: value.secured,
    })).toBeNull();
    expect(settlementKeeperStoreResponseExpressionEventMatchesWorld({
      world: staleWorld,
      settlement: value.secured,
    }, accepted.event)).toBe(false);

    const forgedTrigger = acceptedExpression({
      ...intent,
      triggerEventId: `${intent.triggerEventId}:forged`,
    }).event;
    const mismatches: readonly SituatedExpressionEvent[] = [
      forgedTrigger,
      { ...accepted.event, priority: accepted.event.priority + 1 },
      {
        ...accepted.event,
        position: {
          ...accepted.event.position,
          localX: accepted.event.position.localX + 1,
        },
      },
    ];
    for (const mismatch of mismatches) {
      expect(settlementKeeperStoreResponseExpressionEventMatchesWorld(
        input(value),
        mismatch,
      )).toBe(false);
    }

    const forgedMemory: SituatedExpressionMemory = {
      ...memory,
      priority: memory.priority + 1,
    };
    expect(settlementKeeperStoreResponseExpressionMemoryMatchesWorld(
      input(value),
      forgedMemory,
    )).toBe(false);
    expect(settlementKeeperStoreResponseExpressionEventForTrigger(
      input(value),
      `${intent.triggerEventId}:forged`,
    )).toBeNull();
  });
});

function aggregatePatch(
  seed: RootSeed,
  originRegion: ReturnType<typeof createRegionCoord>,
): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: seed,
    originRegion,
  });
  return createCoreEcologyAggregatePatch({
    seed,
    patchKey: "keeper-store-response:fixture",
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
