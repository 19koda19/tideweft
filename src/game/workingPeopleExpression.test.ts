import { describe, expect, it } from "vitest";

import {
  STRAND_AUTOMATION_THRESHOLD,
  createWorld,
  createWorldView,
  stepWorld,
  type SimEvent,
  type WorldView,
} from "../sim/public";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import {
  acknowledgeSituatedExpression,
  advanceSituatedExpression,
  createSituatedExpressionState,
  reduceSituatedExpression,
  type SituatedExpressionEvent,
  type SituatedExpressionIntent,
  type SituatedExpressionMemory,
  type SituatedExpressionState,
} from "./situatedExpression";
import {
  workingPeopleExpressionEventMatchesWorld,
  workingPeopleExpressionIntent,
  workingPeopleExpressionMemoryMatchesWorld,
} from "./workingPeopleExpression";

interface DepartureFixture {
  readonly world: WorldView;
  readonly event: SimEvent;
  readonly contractId: number;
  readonly residentId: number;
}

function departureFixture(): DepartureFixture {
  const state = createWorld("working people carry what the world entrusts", "standard");
  const contract = state.contracts.find(({ status }) => status === "offered");
  if (!contract) throw new Error("fixture needs an offered Promise");
  const origin = state.settlements.find(({ id }) => id === contract.originSettlementId);
  const resident = state.residents.find((candidate) =>
    candidate.activeContractId === null
    && candidate.location.kind === "settlement"
    && candidate.location.settlementId === contract.originSettlementId
  );
  if (!origin || !resident) throw new Error("fixture needs an origin and resident porter");

  // Keep the simulation's conservation ledger exact while deliberately making
  // this offered Promise exercise the canonical heavy-resource path.
  contract.resource = "parts";
  contract.quantity = 1;
  if (origin.inventory.parts < contract.quantity) {
    const added = contract.quantity - origin.inventory.parts;
    origin.inventory.parts += added;
    state.ledger.initial.parts += added;
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
    id: "working-people-heavy-accept",
    type: "accept-contract",
    carrier: "resident",
    contractId: contract.id,
    residentId: resident.id,
  }]);
  stepWorld(state);

  const event = [...state.events].reverse().find((candidate) =>
    candidate.type === "contract-departed" && candidate.subjectId === contract.id
  );
  if (!event) throw new Error("fixture porter did not commit a departure");
  return {
    world: createWorldView(state),
    event,
    contractId: contract.id,
    residentId: resident.id,
  };
}

function cloned(fixture: DepartureFixture): DepartureFixture {
  const world = structuredClone(fixture.world);
  const event = world.events.find(({ sequence }) => sequence === fixture.event.sequence);
  if (!event) throw new Error("cloned fixture lost its departure event");
  return { ...fixture, world, event };
}

function map(fixture: DepartureFixture) {
  return workingPeopleExpressionIntent({
    world: fixture.world,
    event: fixture.event,
  });
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

describe("Working People situated-expression adapter", () => {
  it("emits deterministic heavy-load intent at the resident's actual departure position", () => {
    const fixture = departureFixture();
    const resident = fixture.world.residents.find(({ id }) => id === fixture.residentId);
    if (!resident) throw new Error("fixture lost its resident");
    const placement = resolveResidentWorldPlacement(fixture.world, resident);
    if (!placement) throw new Error("fixture resident needs a canonical position");

    const first = workingPeopleExpressionIntent({
      world: fixture.world,
      event: structuredClone(fixture.event),
    });
    const second = workingPeopleExpressionIntent({
      world: fixture.world,
      event: structuredClone(fixture.event),
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      sourceActorId: resident.identity.stableId,
      triggerEventId: `sim-event:contract-departed:${fixture.event.sequence}:${fixture.contractId}`,
      position: placement.position,
      meaning: "porter-heavy-load",
      family: "work",
      tone: "strained",
      volume: "spoken",
      knowledgeBasis: "self-handled-heavy-cargo",
    });
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("reauthenticates an evolved persisted event from the exact committed departure", () => {
    const fixture = departureFixture();
    const intent = map(fixture);
    if (intent === null) throw new Error("fixture omitted its heavy-porter intent");
    const accepted = acceptedExpression(intent);

    expect(workingPeopleExpressionEventMatchesWorld(fixture.world, accepted.event)).toBe(true);

    const acknowledged = acknowledgeSituatedExpression(accepted.state);
    if (acknowledged.state === null) throw new Error("fixture event was not acknowledged");
    const advanced = advanceSituatedExpression(acknowledged.state, 3);
    if (advanced === null || advanced.active === null) {
      throw new Error("fixture event expired before authentication");
    }
    expect(advanced.active).toMatchObject({
      remainingSteps: intent.durationSteps - 3,
      audioAcknowledged: true,
    });
    expect(workingPeopleExpressionEventMatchesWorld(fixture.world, advanced.active)).toBe(true);

    const observed = cloned(fixture);
    (observed.event.data as Record<string, unknown>).playerObserved = true;
    const observedIntent = map(observed);
    if (observedIntent === null) throw new Error("observed departure lost its porter intent");
    expect(workingPeopleExpressionEventMatchesWorld(
      observed.world,
      acceptedExpression(observedIntent).event,
    )).toBe(true);

    (observed.event.data as Record<string, unknown>).playerObserved = false;
    expect(map(observed)).toBeNull();
  });

  it("rejects self-consistent forged triggers that do not name the exact departure", () => {
    const fixture = departureFixture();
    const intent = map(fixture);
    if (intent === null) throw new Error("fixture omitted its heavy-porter intent");
    const otherContract = fixture.world.contracts.find(({ id }) => id !== fixture.contractId);
    if (!otherContract) throw new Error("fixture needs a second Promise identity");
    const forgedTriggers = [
      `sim-event:contract-departed:${fixture.event.sequence + 100_000}:${fixture.contractId}`,
      `sim-event:contract-departed:${fixture.event.sequence}:${otherContract.id}`,
      `sim-event:contract-departed:0${fixture.event.sequence}:${fixture.contractId}`,
    ];

    for (const triggerEventId of forgedTriggers) {
      const forged = acceptedExpression({ ...intent, triggerEventId }).event;
      // The generic kernel generated this event and its hash-derived event ID;
      // only the authoritative ledger binding is false.
      expect(workingPeopleExpressionEventMatchesWorld(fixture.world, forged)).toBe(false);
    }
  });

  it("rejects canonical-looking immutable identity and semantic field mismatches", () => {
    const fixture = departureFixture();
    const intent = map(fixture);
    if (intent === null) throw new Error("fixture omitted its heavy-porter intent");
    const authentic = acceptedExpression(intent).event;
    const other = fixture.world.residents.find(({ id }) => id !== fixture.residentId);
    if (!other) throw new Error("fixture needs another resident identity");

    const mismatches: readonly SituatedExpressionEvent[] = [
      { ...authentic, position: { ...authentic.position, localX: authentic.position.localX + 1 } },
      { ...authentic, volume: "murmur" },
      { ...authentic, priority: authentic.priority + 1 },
      { ...authentic, salience: authentic.salience + 1 },
      { ...authentic, durationSteps: authentic.durationSteps + 1 },
      acceptedExpression({ ...intent, sourceActorId: other.identity.stableId }).event,
      acceptedExpression({ ...intent, variantSeed: (intent.variantSeed + 1) >>> 0 }).event,
      acceptedExpression({
        ...intent,
        meaning: "steady-after-stumble",
        family: "footing",
        tone: "restrained",
        knowledgeBasis: "self-felt-stumble",
      }).event,
    ];
    for (const mismatch of mismatches) {
      expect(workingPeopleExpressionEventMatchesWorld(fixture.world, mismatch)).toBe(false);
    }
  });

  it("rejects an otherwise authentic event when current cargo authority disagrees", () => {
    const fixture = cloned(departureFixture());
    const intent = map(fixture);
    if (intent === null) throw new Error("fixture omitted its heavy-porter intent");
    const event = acceptedExpression(intent).event;
    const contract = fixture.world.contracts.find(({ id }) => id === fixture.contractId);
    if (!contract) throw new Error("fixture lost its Promise");
    contract.cargoQuantity = 0;

    expect(workingPeopleExpressionEventMatchesWorld(fixture.world, event)).toBe(false);
  });

  it("reauthenticates exact cooldown memory after the active porter event expires", () => {
    const fixture = departureFixture();
    const intent = map(fixture);
    if (intent === null) throw new Error("fixture omitted its heavy-porter intent");
    const accepted = acceptedExpression(intent);
    const afterActiveExpiry = advanceSituatedExpression(accepted.state, intent.durationSteps);
    const memory = afterActiveExpiry?.recent[0];
    if (afterActiveExpiry === null || afterActiveExpiry.active !== null || memory === undefined) {
      throw new Error("fixture did not retain cooldown memory after active expiry");
    }

    expect(memory).toMatchObject({
      sourceActorId: intent.sourceActorId,
      triggerEventId: intent.triggerEventId,
      meaning: "porter-heavy-load",
      family: "work",
      priority: intent.priority,
      meaningCooldownRemainingSteps: 22,
      familyCooldownRemainingSteps: 2,
    });
    expect(workingPeopleExpressionMemoryMatchesWorld(fixture.world, memory)).toBe(true);
  });

  it("rejects forged porter memory and memory whose current world authority changed", () => {
    const fixture = cloned(departureFixture());
    const intent = map(fixture);
    if (intent === null) throw new Error("fixture omitted its heavy-porter intent");
    const advanced = advanceSituatedExpression(
      acceptedExpression(intent).state,
      intent.durationSteps,
    );
    const memory = advanced?.recent[0];
    if (memory === undefined) throw new Error("fixture omitted its porter cooldown memory");
    const other = fixture.world.residents.find(({ id }) => id !== fixture.residentId);
    if (!other) throw new Error("fixture needs another resident identity");

    const forged: readonly SituatedExpressionMemory[] = [
      {
        ...memory,
        triggerEventId:
          `sim-event:contract-departed:${fixture.event.sequence + 100_000}:${fixture.contractId}`,
      },
      { ...memory, sourceActorId: other.identity.stableId },
      { ...memory, priority: memory.priority + 1 },
      {
        ...memory,
        meaningCooldownRemainingSteps: memory.meaningCooldownRemainingSteps - 1,
      },
    ];
    for (const candidate of forged) {
      expect(workingPeopleExpressionMemoryMatchesWorld(fixture.world, candidate)).toBe(false);
    }

    const contract = fixture.world.contracts.find(({ id }) => id === fixture.contractId);
    if (!contract) throw new Error("fixture lost its Promise");
    contract.cargoQuantity = 0;
    expect(workingPeopleExpressionMemoryMatchesWorld(fixture.world, memory)).toBe(false);
  });

  it("fails closed for a player carrier", () => {
    const fixture = cloned(departureFixture());
    const contract = fixture.world.contracts.find(({ id }) => id === fixture.contractId);
    if (!contract) throw new Error("fixture lost its Promise");
    contract.carrierKind = "player";

    expect(map(fixture)).toBeNull();
  });

  it("fails closed for light or absent physical Promise cargo", () => {
    const light = cloned(departureFixture());
    const lightContract = light.world.contracts.find(({ id }) => id === light.contractId);
    if (!lightContract) throw new Error("fixture lost its light Promise");
    lightContract.resource = "reed";
    expect(map(light)).toBeNull();

    const empty = cloned(departureFixture());
    const emptyContract = empty.world.contracts.find(({ id }) => id === empty.contractId);
    if (!emptyContract) throw new Error("fixture lost its empty Promise");
    emptyContract.cargoQuantity = 0;
    expect(map(empty)).toBeNull();
  });

  it("fails closed when the event names a different resident", () => {
    const fixture = cloned(departureFixture());
    const other = fixture.world.residents.find(({ id }) => id !== fixture.residentId);
    if (!other) throw new Error("fixture needs another resident");
    fixture.event.data.residentId = other.id;

    expect(map(fixture)).toBeNull();
  });

  it("fails closed for the wrong event or an event absent from the committed log", () => {
    const fixture = departureFixture();
    const accepted = fixture.world.events.find((candidate) =>
      candidate.type === "contract-accepted" && candidate.subjectId === fixture.contractId
    );
    if (!accepted) throw new Error("fixture lost its acceptance event");
    expect(workingPeopleExpressionIntent({ world: fixture.world, event: accepted })).toBeNull();

    expect(workingPeopleExpressionIntent({
      world: fixture.world,
      event: { ...fixture.event, sequence: fixture.event.sequence + 100_000 },
    })).toBeNull();
  });

  it("fails closed when current resident custody or route position disagrees", () => {
    const custody = cloned(departureFixture());
    const custodyResident = custody.world.residents.find(({ id }) => id === custody.residentId);
    if (!custodyResident) throw new Error("fixture lost its resident");
    custodyResident.activeContractId = null;
    expect(map(custody)).toBeNull();

    const position = cloned(departureFixture());
    const positionedResident = position.world.residents.find(({ id }) => id === position.residentId);
    if (!positionedResident || positionedResident.location.kind !== "route") {
      throw new Error("fixture resident is not on the departure route");
    }
    positionedResident.location.progress = 1;
    expect(map(position)).toBeNull();
  });
});
