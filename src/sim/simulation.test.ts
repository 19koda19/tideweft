import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FIXED_POINT,
  MIN_SETTLEMENT_MANHATTAN_DISTANCE,
  RESOURCE_KINDS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  assertWorldInvariants,
  createWorld,
  createWorldView,
  deserializeWorld,
  hashWorld,
  runTicks,
  serializeWorld,
  stepWorld,
  type ContractState,
  type SimCommand,
  type WorldState,
} from "./public";

function totalsIncludingCargo(world: WorldState) {
  const totals = Object.fromEntries(RESOURCE_KINDS.map((resource) => [resource, 0])) as Record<
    (typeof RESOURCE_KINDS)[number],
    number
  >;
  for (const settlement of world.settlements) {
    for (const resource of RESOURCE_KINDS) totals[resource] += settlement.inventory[resource];
  }
  for (const contract of world.contracts) totals[contract.resource] += contract.cargoQuantity;
  return totals;
}

function requireContract(world: WorldState): ContractState {
  const contract = world.contracts.find((candidate) => candidate.status === "offered");
  if (contract === undefined) throw new Error("test world did not generate a contract");
  return contract;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deterministic headless world", () => {
  it("generates the required tidal vertical-slice state", () => {
    const world = createWorld("first lantern");
    assertWorldInvariants(world);
    expect(world.terrain.width).toBe(WORLD_WIDTH);
    expect(world.terrain.height).toBe(WORLD_HEIGHT);
    expect(world.terrain.tiles).toHaveLength(WORLD_WIDTH * WORLD_HEIGHT);
    expect(world.settlements).toHaveLength(7);
    expect(world.residents).toHaveLength(42);
    expect(new Set(world.residents.map((resident) => resident.name)).size).toBe(42);
    expect(world.routes).toHaveLength(21);
    expect(world.contracts.length).toBeGreaterThanOrEqual(3);
    expect(world.contracts.every((contract) => contract.playerExclusiveUntilTick >= 300)).toBe(true);

    const worldCreated = world.events.find((event) => event.type === "world-created");
    expect(worldCreated?.data).toMatchObject({ width: WORLD_WIDTH, height: WORLD_HEIGHT });

    const view = createWorldView(world);
    expect(view.terrain.tiles.some((tile) => tile.waterDepth > 0)).toBe(true);
    expect(view.settlements.every((settlement) => settlement.knowledge.every((fact) => fact.freshness >= 0))).toBe(true);
  });

  it("produces identical state for identical seeds", () => {
    const first = createWorld("same estuary", "wild");
    const second = createWorld("same estuary", "wild");
    expect(hashWorld(first)).toBe(hashWorld(second));
    runTicks(first, 900);
    runTicks(second, 900);
    expect(hashWorld(first)).toBe(hashWorld(second));
    expect(first.events).toEqual(second.events);
  });

  it("is invariant to deterministic tick batching", () => {
    const singleBatch = createWorld("batch tide");
    const manyBatches = createWorld("batch tide");
    runTicks(singleBatch, 840);
    runTicks(manyBatches, 111);
    runTicks(manyBatches, 289);
    runTicks(manyBatches, 440);
    expect(hashWorld(manyBatches)).toBe(hashWorld(singleBatch));
  });

  it("continues identically across a save and reload boundary", () => {
    const uninterrupted = createWorld("remember the crossing", "calm");
    runTicks(uninterrupted, 377);
    const resumed = deserializeWorld(serializeWorld(uninterrupted));
    expect(hashWorld(resumed)).toBe(hashWorld(uninterrupted));
    runTicks(uninterrupted, 523);
    runTicks(resumed, 523);
    expect(hashWorld(resumed)).toBe(hashWorld(uninterrupted));
    expect(serializeWorld(resumed)).toBe(serializeWorld(uninterrupted));
  });

  it("preserves resource conservation and legal contracts in a long run", () => {
    const world = createWorld("ledger of rain", "wild");
    for (let block = 0; block < 24; block += 1) {
      runTicks(world, 60);
      assertWorldInvariants(world);
    }
    const totals = totalsIncludingCargo(world);
    for (const resource of RESOURCE_KINDS) {
      expect(totals[resource]).toBe(
        world.ledger.initial[resource] + world.ledger.produced[resource] - world.ledger.consumed[resource],
      );
    }
    expect(world.contracts.some((contract) => contract.status === "fulfilled")).toBe(true);
    expect(
      world.contracts.every((contract) =>
        ["offered", "accepted", "in-transit", "fulfilled", "expired", "cancelled"].includes(contract.status),
      ),
    ).toBe(true);
  });

  it("keeps player contracts out of NPC automation and performs atomic graded delivery", () => {
    const world = createWorld("hand-carried promise");
    const contract = requireContract(world);
    const origin = world.settlements.find((settlement) => settlement.id === contract.originSettlementId);
    const destination = world.settlements.find((settlement) => settlement.id === contract.destinationSettlementId);
    const route = world.routes.find((candidate) => candidate.id === contract.routeId);
    if (origin === undefined || destination === undefined || route === undefined) throw new Error("broken test contract");
    const originBefore = origin.inventory[contract.resource];
    const destinationBefore = destination.inventory[contract.resource];

    stepWorld(world, [
      { id: "accept-player", type: "accept-contract", carrier: "player", contractId: contract.id },
    ]);
    expect(contract.status).toBe("accepted");
    expect(contract.carrierKind).toBe("player");
    runTicks(world, 20);
    expect(contract.status).toBe("accepted");

    stepWorld(world, [
      {
        id: "pickup-player",
        type: "pickup-contract",
        contractId: contract.id,
        originSettlementId: origin.id,
      },
    ]);
    expect(contract.status).toBe("in-transit");
    expect(origin.inventory[contract.resource]).toBe(originBefore - contract.quantity);
    expect(contract.cargoQuantity).toBe(contract.quantity);

    runTicks(world, route.baseTravelTicks + 50);
    expect(contract.status).toBe("in-transit");
    const originTile = world.terrain.tiles[origin.tileIndex];
    const destinationTile = world.terrain.tiles[destination.tileIndex];
    if (originTile === undefined || destinationTile === undefined) throw new Error("broken settlement tile");
    const trace = [origin.tileIndex];
    let traceX = originTile.x;
    let traceY = originTile.y;
    while (traceX !== destinationTile.x || traceY !== destinationTile.y) {
      traceX += Math.sign(destinationTile.x - traceX);
      traceY += Math.sign(destinationTile.y - traceY);
      trace.push(traceY * world.terrain.width + traceX);
    }
    stepWorld(world, [
      {
        id: "deliver-player",
        type: "deliver-contract",
        contractId: contract.id,
        destinationSettlementId: destination.id,
        condition: 700_000,
        trace,
      },
    ]);
    expect(contract.status).toBe("fulfilled");
    expect(contract.deliveryGrade).toBe("weathered");
    expect(contract.deliveryTraceCost).toBeGreaterThan(0);
    expect(contract.cargoQuantity).toBe(0);
    expect(destination.inventory[contract.resource]).toBeGreaterThanOrEqual(destinationBefore);
    expect(world.events.at(-1)?.type).toBe("contract-fulfilled");
    assertWorldInvariants(world);
  });

  it("hands a delivery to someone physically present instead of feeding its absent requester", () => {
    const world = createWorld("a promise waits even when its requester travels");
    const contract = requireContract(world);
    const origin = world.settlements.find(({ id }) => id === contract.originSettlementId);
    const destination = world.settlements.find(({ id }) => id === contract.destinationSettlementId);
    const route = world.routes.find(({ id }) => id === contract.routeId);
    const requester = world.residents.find(({ id }) => id === contract.requesterResidentId);
    if (!origin || !destination || !route || !requester) throw new Error("broken requester fixture");
    requester.location = { kind: "route", routeId: route.id, progress: FIXED_POINT / 2 };
    const requesterNeedsBefore = structuredClone(requester.needs);
    const totalsBefore = totalsIncludingCargo(world);

    stepWorld(world, [{
      id: "accept-with-requester-away",
      type: "accept-contract",
      carrier: "player",
      contractId: contract.id,
    }]);
    stepWorld(world, [{
      id: "pickup-with-requester-away",
      type: "pickup-contract",
      contractId: contract.id,
      originSettlementId: origin.id,
    }]);
    const trace = route.fromSettlementId === origin.id ? [...route.path] : [...route.path].reverse();
    stepWorld(world, [{
      id: "deliver-with-requester-away",
      type: "deliver-contract",
      contractId: contract.id,
      destinationSettlementId: destination.id,
      condition: 800_000,
      trace,
    }]);

    const event = [...world.events].reverse().find(
      ({ type, subjectId }) => type === "contract-fulfilled" && subjectId === contract.id,
    );
    const beneficiary = world.residents.find(({ id }) => id === event?.data.beneficiaryResidentId);
    expect(contract.status).toBe("fulfilled");
    expect(beneficiary?.id).not.toBe(requester.id);
    expect(beneficiary?.location).toEqual({ kind: "settlement", settlementId: destination.id });
    expect(requester.needs).toEqual(requesterNeedsBefore);
    expect(totalsIncludingCargo(world)).toEqual(totalsBefore);
    assertWorldInvariants(world);
  });

  it("delivers exact cargo after a regional detour without inventing route credit", () => {
    const world = createWorld("regional detour delivery");
    const contract = requireContract(world);
    const origin = world.settlements.find(({ id }) => id === contract.originSettlementId);
    const destination = world.settlements.find(({ id }) => id === contract.destinationSettlementId);
    const route = world.routes.find(({ id }) => id === contract.routeId);
    if (!origin || !destination || !route) throw new Error("broken regional delivery fixture");
    const traceBefore = route.traceStrength;
    const reliabilityBefore = route.reliability;
    stepWorld(world, [
      { id: "regional-accept", type: "accept-contract", carrier: "player", contractId: contract.id },
      {
        id: "regional-pickup",
        type: "pickup-contract",
        contractId: contract.id,
        originSettlementId: origin.id,
      },
    ]);
    stepWorld(world, [{
      id: "regional-deliver",
      type: "deliver-contract",
      contractId: contract.id,
      destinationSettlementId: destination.id,
      condition: 640_000,
      trace: [],
      routeEvidence: "regional-detour",
    }]);
    expect(contract.status).toBe("fulfilled");
    expect(contract.deliveryTraceCost).toBe(0);
    expect(route.traceStrength).toBe(traceBefore);
    expect(route.reliability).toBe(reliabilityBefore);
    expect(world.events.find((event) => event.type === "contract-fulfilled" && event.subjectId === contract.id)?.data)
      .toMatchObject({ routeEvidence: "regional-detour-no-credit", reinforcedRouteCount: 0 });
    assertWorldInvariants(world);
  });

  it("reserves fresh offers for inspection before autonomous porters may claim them", () => {
    const world = createWorld("a promise held open");
    const initialContractIds = world.contracts.map((contract) => contract.id);
    runTicks(world, 299);
    expect(
      world.contracts
        .filter((contract) => initialContractIds.includes(contract.id))
        .every((contract) => contract.status === "offered"),
    ).toBe(true);
    runTicks(world, 2);
    expect(world.contracts.some((contract) => contract.carrierKind === "resident")).toBe(true);
  });

  it("canonicalizes commands supplied in different arrival orders", () => {
    const first = createWorld("ordered promises");
    const second = createWorld("ordered promises");
    const contractA = requireContract(first);
    const contractB = requireContract(second);
    const commands: SimCommand[] = [
      { id: "z-reject", sequence: 2, type: "cancel-contract", contractId: -10 },
      { id: "a-player", sequence: 1, type: "accept-contract", carrier: "player", contractId: contractA.id },
    ];
    const reversed: SimCommand[] = [
      { id: "a-player", sequence: 1, type: "accept-contract", carrier: "player", contractId: contractB.id },
      { id: "z-reject", sequence: 2, type: "cancel-contract", contractId: -10 },
    ];
    stepWorld(first, commands);
    stepWorld(second, reversed);
    expect(hashWorld(first)).toBe(hashWorld(second));
  });

  it("produces materially different worlds for different seeds", () => {
    const first = createWorld("red moon");
    const second = createWorld("blue moon");
    expect(hashWorld(first)).not.toBe(hashWorld(second));
    expect(first.terrain.tiles.map((tile) => tile.elevation)).not.toEqual(
      second.terrain.tiles.map((tile) => tile.elevation),
    );
  });

  it("keeps every harbor materially separated across a deterministic seed sample", () => {
    for (let seedIndex = 0; seedIndex < 32; seedIndex += 1) {
      const world = createWorld(`wide-estuary-${seedIndex}`);
      for (let leftIndex = 0; leftIndex < world.settlements.length; leftIndex += 1) {
        const left = world.terrain.tiles[world.settlements[leftIndex]?.tileIndex ?? -1];
        if (left === undefined) throw new Error("missing left settlement tile");
        for (let rightIndex = leftIndex + 1; rightIndex < world.settlements.length; rightIndex += 1) {
          const right = world.terrain.tiles[world.settlements[rightIndex]?.tileIndex ?? -1];
          if (right === undefined) throw new Error("missing right settlement tile");
          expect(Math.abs(left.x - right.x) + Math.abs(left.y - right.y)).toBeGreaterThanOrEqual(
            MIN_SETTLEMENT_MANHATTAN_DISTANCE,
          );
        }
      }
    }
  });

  it("always generates starter promises that fit the sixteen-unit pack", () => {
    for (let seedIndex = 0; seedIndex < 64; seedIndex += 1) {
      const world = createWorld(`carryable-opening-${seedIndex}`);
      expect(world.contracts.length).toBeGreaterThan(0);
      for (const contract of world.contracts) {
        const multiplier = contract.resource === "freshWater" || contract.resource === "parts"
          ? 2
          : contract.resource === "medicine"
            ? 1.25
            : 1;
        expect(Math.ceil(contract.quantity * multiplier)).toBeLessThanOrEqual(16);
      }
    }
  });

  it("does not read global randomness or wall clocks", () => {
    vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random is forbidden");
    });
    vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now is forbidden");
    });
    const world = createWorld("clockless world");
    runTicks(world, 75);
    assertWorldInvariants(world);
    expect(world.tide.level).toBeGreaterThanOrEqual(0);
    expect(world.tide.level).toBeLessThanOrEqual(FIXED_POINT);
  });

  it("survives a 10,000 tick headless soak with bounded histories", () => {
    const world = createWorld("long quiet year", "wild");
    runTicks(world, 10_000);
    assertWorldInvariants(world);
    expect(world.events.length).toBeLessThanOrEqual(512);
    expect(
      world.contracts.filter((contract) =>
        contract.status === "fulfilled" || contract.status === "expired" || contract.status === "cancelled",
      ).length,
    ).toBeLessThanOrEqual(256);
  });
});
