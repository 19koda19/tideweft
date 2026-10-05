import { describe, expect, it } from "vitest";

import { createActorObservation } from "../sim/actorPerception";
import { createWorld, createWorldView, stepWorld, type WorldView } from "../sim/public";
import { seedFromText } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import { createCoreEcologyAggregatePatch, type CoreEcologyPopulationInput } from "./coreEcology";
import { deriveCoreEcologyHarborEdgeHabitatAssemblage } from "./coreEcologyHabitat";
import { humanDangerWarningExpressionCandidate } from "./humanDangerWarningExpression";
import type { HumanSupplementalListeningReceipt } from "./humanPerception";
import { residentIntroductionExpressionIntent } from "./residentIntroductionExpression";
import { residentWeatherHoldExpressionIntent } from "./residentWeatherHoldExpression";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import {
  applySettlementKeeperStoreResponse, createSettlementEcologyState,
  createSettlementPlayerStoreReport, proposeSettlementKeeperStoreResponse,
  recordSettlementKeeperKnowledge,
} from "./settlementEcology";
import { settlementKeeperStoreResponseExpressionIntent } from "./settlementKeeperStoreResponseExpression";
import {
  createSituatedExpressionState, reduceSituatedExpression,
  type SituatedExpressionEvent, type SituatedExpressionIntent,
} from "./situatedExpression";
import {
  SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE,
  situatedExpressionSemanticFactForEvent, situatedExpressionSoundClass,
} from "./situatedExpressionAcoustics";
import { checkExpressionKnowledgeSource, expressionKnowledgeListenerIssues } from "./situatedExpressionKnowledgeAudit";

function acceptedEvent(intent: SituatedExpressionIntent | null): SituatedExpressionEvent {
  if (intent === null) throw new Error("knowledge fixture omitted its existing producer intent");
  const reduction = reduceSituatedExpression(createSituatedExpressionState(), intent);
  if (!reduction.accepted || reduction.event === null) throw new Error("knowledge fixture expression was refused");
  return reduction.event;
}

// Same generated habitat and committed report/closure constructors as the
// keeper-expression owner; no expression or secured-store root is fabricated.
function keeperFixture() {
  const world = createWorldView(createWorld("keeper store response expression", "standard"));
  const keeper = world.residents.find((resident) => world.settlements.some(({ id }) => id === resident.homeSettlementId));
  const position = keeper === undefined ? null : resolveResidentWorldPlacement(world, keeper)?.position;
  if (keeper === undefined || position === null || position === undefined) throw new Error("knowledge fixture needs a placed keeper");
  const rootSeed = seedFromText("keeper store response authority fixture");
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({ rootSeed, originRegion: position.region });
  const populations: readonly CoreEcologyPopulationInput[] = habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives" || population.populationUnits === 0 ? [] : [{
      species: population.species, populationKey: population.populationKey, populationSize: population.populationUnits,
      members: population.allocations.map((allocation) => ({
        populationOrdinal: allocation.allocationOrdinal, representedUnits: allocation.representedUnits,
        position: allocation.position, materialization: "coarse" as const,
      })),
    }]
  ));
  const patch = createCoreEcologyAggregatePatch({ seed: rootSeed, patchKey: "keeper-store-response:fixture",
    originRegion: position.region, tick: 0, populations, derivation: { kind: "habitat-v2", habitat } });
  const open = createSettlementEcologyState({ rootSeed, settlementId: keeper.homeSettlementId,
    keeperActorId: keeper.identity.stableId, position, aggregatePatch: patch });
  const report = createSettlementPlayerStoreReport(open, world.completedTick);
  const informed = report === null ? null : recordSettlementKeeperKnowledge(open, world.completedTick, { kind: "player-report", report });
  const proposal = informed === null ? null : proposeSettlementKeeperStoreResponse(informed, world.completedTick);
  const resolution = informed === null || proposal === null ? null : applySettlementKeeperStoreResponse(informed, proposal);
  if (resolution === null || !resolution.applied) throw new Error("knowledge fixture did not commit store closure");
  return { world, open, settlement: resolution.state,
    event: acceptedEvent(settlementKeeperStoreResponseExpressionIntent({ world, settlement: resolution.state })) };
}

function introductionFixture() {
  const state = createWorld("a spoken introduction belongs to the world", "standard");
  const resident = state.residents[0];
  if (resident === undefined) throw new Error("knowledge fixture needs an introducing resident");
  stepWorld(state, [{ id: "observe-before-introduction", type: "observe-resident", residentId: resident.id }]);
  const observedTick = resident.playerKnowledge.firstObservedTick;
  if (observedTick === null) throw new Error("knowledge fixture did not observe resident");
  stepWorld(state, [{ id: "commit-resident-introduction", type: "greet-resident", residentId: resident.id, observedTick }]);
  const world = createWorldView(state);
  const cause = [...world.events].reverse().find((event) => event.type === "resident-introduced" && event.subjectId === resident.id);
  if (cause === undefined) throw new Error("knowledge fixture did not commit introduction");
  return { world, event: acceptedEvent(residentIntroductionExpressionIntent({ world, event: cause })) };
}

function warningFixture() {
  const state = createWorld("human warning animal-alarm", "standard");
  const resident = state.residents[0];
  if (resident === undefined) throw new Error("knowledge fixture needs a warning resident");
  const tick = state.meta.completedTick + 1;
  const observation = createActorObservation({
    id: `human-warning:${resident.id}:${tick}:animal-alarm`, observerId: resident.identity.stableId,
    observedAtTick: tick, channel: "hearing", perceivedClass: "animal-alarm", subjectId: null,
    area: { center: { region: { x: 0, y: 0 }, localX: 12_500, localY: 18_500 }, radiusUnits: 2_500 },
    confidence: 920_000, salience: 960_000, identification: "anonymous", interrupt: "strong",
  });
  if (observation === null) throw new Error("knowledge fixture rejected canonical alarm observation");
  stepWorld(state, [], { tick, residents: state.residents.map((candidate) => ({
    residentId: candidate.id, actorId: candidate.identity.stableId,
    observations: candidate.id === resident.id ? [observation] : [],
  })) });
  const world = createWorldView(state);
  const advanced = world.residents.find(({ id }) => id === resident.id);
  if (advanced === undefined) throw new Error("knowledge fixture lost warning resident");
  return { world, event: acceptedEvent(humanDangerWarningExpressionCandidate({ world, resident: advanced })?.intent ?? null) };
}

function weatherHoldFixture() {
  const state = createWorld("a resident names the weather hold", "standard");
  const contract = state.contracts.find(({ status }) => status === "offered");
  const resident = contract === undefined ? undefined : state.residents.find(({ activeContractId, location }) => (
    activeContractId === null && location.kind === "settlement" && location.settlementId === contract.originSettlementId
  ));
  if (contract === undefined || resident === undefined) throw new Error("knowledge fixture needs an available resident Promise");
  state.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: state.meta.completedTick + 1_000 };
  stepWorld(state, [{ id: "resident-weather-hold-accept", type: "accept-contract", carrier: "resident", contractId: contract.id, residentId: resident.id }]);
  stepWorld(state);
  if (contract.status !== "in-transit" || resident.location.kind !== "route") throw new Error("knowledge fixture did not depart");
  state.weather = { kind: "storm", intensity: 950_000, windX: 500_000, windY: -500_000, nextChangeTick: state.meta.completedTick + 1_000 };
  stepWorld(state);
  const world = createWorldView(state);
  const cause = [...world.events].reverse().find((event) => event.type === "resident-sheltered" && event.subjectId === resident.id);
  if (cause === undefined || !resident.condition.sheltering) throw new Error("knowledge fixture did not commit weather hold");
  return { world, event: acceptedEvent(residentWeatherHoldExpressionIntent({ world, event: cause })) };
}

describe("event-time expression knowledge source checks", () => {
  it("authenticates the committed keeper closure but not the prior open root, without changing inputs", () => {
    const fixture = keeperFixture();
    const before = JSON.stringify(fixture);
    const checked = checkExpressionKnowledgeSource(fixture.event, fixture.world, fixture.settlement);
    expect(checked).toEqual({ eventId: fixture.event.eventId, sourceActorId: fixture.event.sourceActorId,
      triggerEventId: fixture.event.triggerEventId, checkedAtTick: fixture.world.completedTick,
      owner: "settlementKeeperStoreResponseExpression", validated: true });
    expect(Object.isFrozen(checked)).toBe(true);
    expect(checkExpressionKnowledgeSource(fixture.event, fixture.world, fixture.open)?.validated).toBe(false);
    for (const event of [
      { ...fixture.event, eventId: "se-forged" },
      { ...fixture.event, sourceActorId: "RES-forged" },
      { ...fixture.event, triggerEventId: `${fixture.event.triggerEventId}:forged` },
      { ...fixture.event, knowledgeBasis: "self-perceived-threat" as const },
    ]) expect(checkExpressionKnowledgeSource(event, fixture.world, fixture.settlement)?.validated).toBe(false);
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it.each([
    { name: "committed introduction", fixture: introductionFixture, owner: "residentIntroductionExpression" },
    { name: "fresh anonymous warning belief", fixture: warningFixture, owner: "humanDangerWarningExpression" },
    { name: "committed weather hold", fixture: weatherHoldFixture, owner: "residentWeatherHoldExpression" },
  ])("checks $name through its existing owner and rejects unretained facts", ({ fixture: createFixture, owner }) => {
    const fixture = createFixture();
    const settlement = keeperFixture().settlement;
    const before = JSON.stringify([fixture, settlement]);
    expect(checkExpressionKnowledgeSource(fixture.event, fixture.world, settlement)).toMatchObject({ owner, validated: true });
    for (const event of [{ ...fixture.event, sourceActorId: "RES-forged" },
      { ...fixture.event, triggerEventId: `${fixture.event.triggerEventId}:forged` }]) {
      expect(checkExpressionKnowledgeSource(event, fixture.world, settlement)?.validated).toBe(false);
    }
    const withoutFacts: WorldView = { ...fixture.world,
      events: fixture.world.events.filter((event) => event.subjectId !== fixture.world.residents.find(({ identity }) => identity.stableId === fixture.event.sourceActorId)?.id),
      residents: fixture.world.residents.map((resident) => resident.identity.stableId === fixture.event.sourceActorId
        ? { ...resident, perception: { ...resident.perception, beliefs: [], attentionKeys: [] }, memories: [] }
        : resident),
    };
    expect(checkExpressionKnowledgeSource(fixture.event, withoutFacts, settlement)?.validated).toBe(false);
    expect(JSON.stringify([fixture, settlement])).toBe(before);
  });

  it("leaves nonfactual and unsupported producer kinds uncaptured instead of certifying them", () => {
    const fixture = keeperFixture();
    for (const meaning of ["steady-after-stumble", "guardian-dog-shelter-whine", "future-unknown"] as const) {
      expect(checkExpressionKnowledgeSource({ ...fixture.event, meaning } as SituatedExpressionEvent,
        fixture.world, fixture.settlement)).toBeNull();
    }
  });
});

// Synthetic receipt-shape fixtures only: these do not establish acoustic
// hearing, comprehension, a retained belief, or ordinary/native gameplay.
function syntheticReceipt(event: SituatedExpressionEvent, confidence: number = SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE,
  perceivedClass = "store-secured-report"): HumanSupplementalListeningReceipt {
  const observerId = "RES-synthetic-listener";
  const observation = createActorObservation({
    id: "synthetic-hearing-check", observerId, observedAtTick: 10, channel: "hearing", perceivedClass,
    subjectId: null, area: { center: event.position, radiusUnits: 2_500 }, confidence,
    salience: confidence, identification: "anonymous", interrupt: "none",
  });
  if (observation === null) throw new Error("synthetic listener fixture rejected its canonical observation");
  return { expressionEventId: event.eventId, sourceActorId: event.sourceActorId, sampleId: "synthetic-voice",
    residentId: 1, observerId, observedAtTick: 10, outcome: "heard",
    contact: { certainty: confidence / FIXED_POINT, bearing: { centerRadians: 0, uncertaintyRadians: 0.4 }, distanceBand: { minimum: 1, maximum: 3 } },
    semanticFact: situatedExpressionSemanticFactForEvent(event), observation };
}

describe("synthetic expression knowledge listener consistency checks", () => {
  it.each([SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE, SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE - 1])(
    "keeps anonymous understanding at its exact threshold (%s) without mutating the receipt", (confidence) => {
      const { event } = keeperFixture();
      const understood = confidence >= SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE;
      const receipt = syntheticReceipt(event, confidence, understood ? "store-secured-report" : "human-vocalization");
      const before = JSON.stringify([event, receipt]);
      const issues = expressionKnowledgeListenerIssues(event, receipt);
      expect(issues).toEqual([]);
      expect(Object.isFrozen(issues)).toBe(true);
      expect(JSON.stringify([event, receipt])).toBe(before);
      expect(expressionKnowledgeListenerIssues(event, structuredClone(receipt))).toEqual(issues);
      expect(receipt.observation).toMatchObject({ subjectId: null, identification: "anonymous" });
    },
  );

  it("flags mismatched source/event, forged semantic facts and understanding beyond the captured confidence", () => {
    const { event } = keeperFixture();
    const receipt = syntheticReceipt(event);
    for (const changed of [{ ...receipt, expressionEventId: "se-forged" }, { ...receipt, sourceActorId: "RES-forged" }]) {
      expect(expressionKnowledgeListenerIssues(event, changed)).toContain("source-event-mismatch");
    }
    expect(expressionKnowledgeListenerIssues(event, { ...receipt, semanticFact: {
      ...receipt.semanticFact!, minimumHearingConfidence: 0,
    } })).toContain("unsupported-semantic-fact");
    expect(expressionKnowledgeListenerIssues(event, syntheticReceipt(event,
      SITUATED_EXPRESSION_SEMANTIC_FACT_MIN_CONFIDENCE - 1))).toContain("unsupported-understanding");
    expect(expressionKnowledgeListenerIssues(event, { ...receipt, semanticFact: null })).toContain("unsupported-understanding");
  });

  it("does not accept decoded threat identity from a warning with no factual decoder", () => {
    const { event } = warningFixture();
    const ordinary = syntheticReceipt(event, 700_000, situatedExpressionSoundClass(event));
    expect(ordinary.semanticFact).toBeNull();
    expect(expressionKnowledgeListenerIssues(event, ordinary)).toEqual([]);
    expect(expressionKnowledgeListenerIssues(event, syntheticReceipt(event, 700_000, "large-predator")))
      .toContain("unsupported-understanding");
  });

  it("rejects synthetic revealed identity, conflicting observer/tick and contact confidence", () => {
    const { event } = keeperFixture();
    const receipt = syntheticReceipt(event);
    const identified = createActorObservation({ ...receipt.observation!, channel: "vision", subjectId: event.sourceActorId,
      identification: "identified", area: { center: event.position, radiusUnits: 0 } });
    if (identified === null) throw new Error("synthetic identity test needs canonical visual observation");
    for (const changed of [{ ...receipt, observation: identified }, { ...receipt, observerId: "RES-wrong-listener" },
      { ...receipt, observedAtTick: receipt.observedAtTick + 1 }, { ...receipt, observerId: event.sourceActorId }]) {
      expect(expressionKnowledgeListenerIssues(event, changed)).toContain("listener-identity-leak");
    }
    expect(expressionKnowledgeListenerIssues(event, { ...receipt, contact: { ...receipt.contact!, certainty: 0.1 } }))
      .toContain("hearing-confidence-mismatch");
    expect(expressionKnowledgeListenerIssues(event, { ...receipt, observation: null })).toContain("invalid-hearing-observation");
  });

  it.each(["source-excluded", "not-heard", "unavailable"] as const)("keeps %s distinct from a heard observation", (outcome) => {
    const { event } = keeperFixture();
    const heard = syntheticReceipt(event);
    const receipt: HumanSupplementalListeningReceipt = { ...heard, outcome, contact: null, observation: null,
      observerId: outcome === "source-excluded" ? event.sourceActorId : heard.observerId };
    const before = JSON.stringify(receipt);
    expect(expressionKnowledgeListenerIssues(event, receipt)).toEqual([]);
    expect(expressionKnowledgeListenerIssues(event, { ...receipt, contact: heard.contact, observation: heard.observation }))
      .toContain(outcome === "source-excluded" ? "invalid-source-exclusion" : "unheard-observation");
    if (outcome === "source-excluded") {
      expect(expressionKnowledgeListenerIssues(event, { ...receipt, observerId: heard.observerId })).toContain("invalid-source-exclusion");
    }
    expect(JSON.stringify(receipt)).toBe(before);
  });
});
