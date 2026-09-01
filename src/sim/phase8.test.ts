import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  LEGACY_WORLD_HEIGHT,
  LEGACY_WORLD_WIDTH,
  MIN_ROUTE_REINFORCEMENT_COVERAGE,
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  TIDE_CHOIR_CONDITION_BONUS,
  TIDE_CHOIR_RELIABILITY_BONUS,
  assertWorldInvariants,
  calculateRouteTraceCoverage,
  createWorld,
  createWorldView,
  deserializeWorld,
  findTraceReinforcedRoutes,
  hashWorld,
  runTicks,
  serializeWorld,
  stepWorld,
  type ContractState,
  type RouteState,
  type SimCommand,
  type WorldState,
} from "./public";
import { hashCanonical } from "./util";

function routeBetween(world: WorldState, leftId: number, rightId: number): RouteState {
  const low = Math.min(leftId, rightId);
  const high = Math.max(leftId, rightId);
  const route = world.routes.find(
    (candidate) => candidate.fromSettlementId === low && candidate.toSettlementId === high,
  );
  if (route === undefined) throw new Error(`missing route ${leftId}-${rightId}`);
  return route;
}

function orientedRoutePath(world: WorldState, fromId: number, toId: number): number[] {
  const route = routeBetween(world, fromId, toId);
  return route.fromSettlementId === fromId ? [...route.path] : [...route.path].reverse();
}

function joinedRouteTrace(world: WorldState, settlementIds: readonly number[]): number[] {
  const trace: number[] = [];
  for (let index = 1; index < settlementIds.length; index += 1) {
    const fromId = settlementIds[index - 1];
    const toId = settlementIds[index];
    if (fromId === undefined || toId === undefined) throw new Error("missing trace endpoint");
    const leg = orientedRoutePath(world, fromId, toId);
    trace.push(...(trace.length === 0 ? leg : leg.slice(1)));
  }
  return trace;
}

function firstOffer(world: WorldState): ContractState {
  const contract = world.contracts.find((candidate) => candidate.status === "offered");
  if (contract === undefined) throw new Error("test world has no offered contract");
  return contract;
}

function acceptAndPickup(world: WorldState, contract: ContractState): void {
  stepWorld(world, [{
    id: `accept-${contract.id}`,
    type: "accept-contract",
    carrier: "player",
    contractId: contract.id,
  }]);
  stepWorld(world, [{
    id: `pickup-${contract.id}`,
    type: "pickup-contract",
    contractId: contract.id,
    originSettlementId: contract.originSettlementId,
  }]);
  expect(contract.status).toBe("in-transit");
}

function fulfillmentEvent(world: WorldState, contractId: number) {
  return [...world.events].reverse().find(
    (event) => event.type === "contract-fulfilled" && event.subjectId === contractId,
  );
}

function alphaSaveText(world: WorldState): string {
  const legacyWorld = structuredClone(world) as unknown as Record<string, unknown>;
  delete legacyWorld.choirs;
  const meta = legacyWorld.meta as Record<string, unknown>;
  meta.saveFormatVersion = 1;
  meta.rulesVersion = "tideweft-sim/2";
  return JSON.stringify({
    format: "tideweft-world",
    saveFormatVersion: 1,
    rulesVersion: "tideweft-sim/2",
    checksum: hashCanonical(legacyWorld),
    world: legacyWorld,
  });
}

function choirRulesSaveText(world: WorldState): string {
  const priorWorld = structuredClone(world);
  priorWorld.meta.saveFormatVersion = 2;
  priorWorld.meta.rulesVersion = "tideweft-sim/3";
  return JSON.stringify({
    format: "tideweft-world",
    saveFormatVersion: 2,
    rulesVersion: "tideweft-sim/3",
    checksum: hashCanonical(priorWorld),
    world: priorWorld,
  });
}

function legacySizedWorld(world: WorldState): WorldState {
  const legacy = structuredClone(world);
  const template = legacy.terrain.tiles[0];
  if (template === undefined) throw new Error("test world has no terrain template");
  legacy.terrain = {
    width: LEGACY_WORLD_WIDTH,
    height: LEGACY_WORLD_HEIGHT,
    tiles: Array.from({ length: LEGACY_WORLD_WIDTH * LEGACY_WORLD_HEIGHT }, (_, index) => ({
      ...template,
      index,
      x: index % LEGACY_WORLD_WIDTH,
      y: Math.floor(index / LEGACY_WORLD_WIDTH),
      traceStrength: 0,
    })),
  };
  const harborCoordinates = [
    [4, 4],
    [24, 4],
    [44, 4],
    [59, 12],
    [54, 32],
    [32, 42],
    [8, 38],
  ] as const;
  for (let index = 0; index < legacy.settlements.length; index += 1) {
    const settlement = legacy.settlements[index];
    const coordinate = harborCoordinates[index];
    if (settlement === undefined || coordinate === undefined) throw new Error("missing legacy harbor fixture");
    settlement.tileIndex = coordinate[1] * LEGACY_WORLD_WIDTH + coordinate[0];
  }
  for (const route of legacy.routes) {
    const from = legacy.settlements.find((settlement) => settlement.id === route.fromSettlementId);
    const to = legacy.settlements.find((settlement) => settlement.id === route.toSettlementId);
    const fromTile = from === undefined ? undefined : legacy.terrain.tiles[from.tileIndex];
    const toTile = to === undefined ? undefined : legacy.terrain.tiles[to.tileIndex];
    if (fromTile === undefined || toTile === undefined) throw new Error("missing legacy route endpoint");
    const path = [fromTile.index];
    let x = fromTile.x;
    let y = fromTile.y;
    while (x !== toTile.x) {
      x += Math.sign(toTile.x - x);
      path.push(y * LEGACY_WORLD_WIDTH + x);
    }
    while (y !== toTile.y) {
      y += Math.sign(toTile.y - y);
      path.push(y * LEGACY_WORLD_WIDTH + x);
    }
    route.path = path;
    route.baseTravelTicks = Math.max(12, path.length - 1);
  }
  const worldCreated = legacy.events.find((event) => event.type === "world-created");
  if (worldCreated !== undefined) {
    worldCreated.data.width = LEGACY_WORLD_WIDTH;
    worldCreated.data.height = LEGACY_WORLD_HEIGHT;
  }
  return legacy;
}

describe("truthful traced-route coverage", () => {
  it("is endpoint-aware, diagonal-tolerant, contiguous, and safe at row edges", () => {
    const world = createWorld("coverage geometry");
    const width = world.terrain.width;
    const staircase = { path: [width + 1, width + 2, width * 2 + 2, width * 2 + 3, width * 3 + 3] };
    expect(calculateRouteTraceCoverage(world, staircase, [width + 1, width * 2 + 2, width * 3 + 3])).toBe(
      FIXED_POINT,
    );

    const horizontal = { path: Array.from({ length: 11 }, (_, index) => 641 + index) };
    expect(calculateRouteTraceCoverage(world, horizontal, horizontal.path.slice(3, 8))).toBe(0);
    const thresholdTrace = [...horizontal.path.slice(0, 7), horizontal.path.at(-1) ?? 0];
    const belowTrace = [...horizontal.path.slice(0, 6), horizontal.path.at(-1) ?? 0];
    expect(calculateRouteTraceCoverage(world, horizontal, thresholdTrace)).toBe(700_000);
    expect(calculateRouteTraceCoverage(world, horizontal, belowTrace)).toBe(600_000);

    expect(calculateRouteTraceCoverage(world, { path: [width - 2, width - 1] }, [width, width + 1])).toBe(0);
  });

  it("reinforces an exact direct journey and reports authoritative scalar/string coverage", () => {
    const world = createWorld("one honest strand");
    const contract = world.contracts.find((candidate) => {
      const candidateRoute = routeBetween(world, candidate.originSettlementId, candidate.destinationSettlementId);
      const candidateTrace = orientedRoutePath(world, candidate.originSettlementId, candidate.destinationSettlementId);
      return findTraceReinforcedRoutes(world, candidateTrace).some(
        (entry) => entry.routeId === candidateRoute.id && entry.coverage === FIXED_POINT,
      );
    });
    if (contract === undefined) throw new Error("test world has no directly attributable offer");
    const route = routeBetween(world, contract.originSettlementId, contract.destinationSettlementId);
    const trace = orientedRoutePath(world, contract.originSettlementId, contract.destinationSettlementId);
    expect(calculateRouteTraceCoverage(world, route, trace)).toBe(FIXED_POINT);
    expect(findTraceReinforcedRoutes(world, trace)).toEqual([{ routeId: route.id, coverage: FIXED_POINT }]);
    acceptAndPickup(world, contract);
    const beforeStrength = route.traceStrength;
    const beforeReliability = route.reliability;

    stepWorld(world, [{
      id: `deliver-${contract.id}`,
      type: "deliver-contract",
      contractId: contract.id,
      destinationSettlementId: contract.destinationSettlementId,
      condition: 720_000,
      trace,
    }]);

    expect(route.traceStrength).toBeGreaterThan(beforeStrength);
    expect(route.reliability).toBeGreaterThan(beforeReliability);
    const event = fulfillmentEvent(world, contract.id);
    expect(event?.data.primaryRouteCoverage).toBe(FIXED_POINT);
    expect(event?.data.reinforcedRouteCount).toBe(1);
    expect(event?.data.reinforcedRouteIds).toBe(String(route.id));
    assertWorldInvariants(world);
  });

  it("credits genuinely traversed intermediary harbor legs but never the assigned distant shortcut", () => {
    const world = createWorld("the long way sings");
    let chosen:
      | {
          contract: ContractState;
          intermediateId: number;
          trace: number[];
          legRoutes: [RouteState, RouteState];
        }
      | undefined;

    for (const contract of world.contracts) {
      for (const intermediate of world.settlements) {
        if (
          intermediate.id === contract.originSettlementId
          || intermediate.id === contract.destinationSettlementId
        ) continue;
        const trace = joinedRouteTrace(world, [
          contract.originSettlementId,
          intermediate.id,
          contract.destinationSettlementId,
        ]);
        const firstLeg = routeBetween(world, contract.originSettlementId, intermediate.id);
        const secondLeg = routeBetween(world, intermediate.id, contract.destinationSettlementId);
        const reinforced = findTraceReinforcedRoutes(world, trace);
        if (
          reinforced.length === 2
          && reinforced.every((entry) => entry.coverage === FIXED_POINT)
          && reinforced.some((entry) => entry.routeId === firstLeg.id)
          && reinforced.some((entry) => entry.routeId === secondLeg.id)
        ) {
          chosen = { contract, intermediateId: intermediate.id, trace, legRoutes: [firstLeg, secondLeg] };
          break;
        }
      }
      if (chosen !== undefined) break;
    }
    if (chosen === undefined) throw new Error("test seed has no clean two-leg detour");

    const direct = routeBetween(
      world,
      chosen.contract.originSettlementId,
      chosen.contract.destinationSettlementId,
    );
    expect(chosen.legRoutes.map((route) => route.id)).not.toContain(direct.id);
    acceptAndPickup(world, chosen.contract);
    const directBefore = {
      traceStrength: direct.traceStrength,
      reliability: direct.reliability,
      traffic: direct.traffic,
      lastUsedTick: direct.lastUsedTick,
    };
    const legBefore = chosen.legRoutes.map((route) => ({
      traceStrength: route.traceStrength,
      reliability: route.reliability,
    }));

    stepWorld(world, [{
      id: `detour-${chosen.contract.id}`,
      type: "deliver-contract",
      contractId: chosen.contract.id,
      destinationSettlementId: chosen.contract.destinationSettlementId,
      condition: 800_000,
      trace: chosen.trace,
    }]);

    expect({
      traceStrength: direct.traceStrength,
      reliability: direct.reliability,
      traffic: direct.traffic,
      lastUsedTick: direct.lastUsedTick,
    }).toEqual(directBefore);
    for (let index = 0; index < chosen.legRoutes.length; index += 1) {
      expect(chosen.legRoutes[index]?.traceStrength).toBeGreaterThan(legBefore[index]?.traceStrength ?? 0);
      expect(chosen.legRoutes[index]?.reliability).toBeGreaterThan(legBefore[index]?.reliability ?? 0);
    }
    const reinforcedIds = [...chosen.legRoutes].map((route) => route.id).sort((left, right) => left - right);
    const event = fulfillmentEvent(world, chosen.contract.id);
    expect(event?.data.reinforcedRouteCount).toBe(2);
    expect(event?.data.reinforcedRouteIds).toBe(reinforcedIds.join(","));
    assertWorldInvariants(world);
  });

  it("keeps below-threshold detours from changing any route and rejects a missing trace atomically", () => {
    const world = createWorld("no phantom footfall");
    const contract = firstOffer(world);
    const origin = world.settlements.find((settlement) => settlement.id === contract.originSettlementId);
    const destination = world.settlements.find((settlement) => settlement.id === contract.destinationSettlementId);
    if (origin === undefined || destination === undefined) throw new Error("missing contract endpoints");
    const originTile = world.terrain.tiles[origin.tileIndex];
    const destinationTile = world.terrain.tiles[destination.tileIndex];
    if (originTile === undefined || destinationTile === undefined) throw new Error("missing endpoint tiles");
    const detour = (waypoints: readonly { x: number; y: number }[]): number[] => {
      const candidate = [origin.tileIndex];
      let x = originTile.x;
      let y = originTile.y;
      for (const waypoint of [...waypoints, { x: destinationTile.x, y: destinationTile.y }]) {
        while (x !== waypoint.x) {
          x += Math.sign(waypoint.x - x);
          candidate.push(y * world.terrain.width + x);
        }
        while (y !== waypoint.y) {
          y += Math.sign(waypoint.y - y);
          candidate.push(y * world.terrain.width + x);
        }
      }
      return candidate;
    };
    const candidates = [
      detour([{ x: originTile.x, y: 0 }, { x: destinationTile.x, y: 0 }]),
      detour([
        { x: originTile.x, y: world.terrain.height - 1 },
        { x: destinationTile.x, y: world.terrain.height - 1 },
      ]),
      detour([{ x: 0, y: originTile.y }, { x: 0, y: destinationTile.y }]),
      detour([
        { x: world.terrain.width - 1, y: originTile.y },
        { x: world.terrain.width - 1, y: destinationTile.y },
      ]),
    ];
    const trace = candidates.find((candidate) => findTraceReinforcedRoutes(world, candidate).length === 0);
    if (trace === undefined) throw new Error("test world has no below-threshold edge detour");
    expect(findTraceReinforcedRoutes(world, trace)).toEqual([]);
    acceptAndPickup(world, contract);
    const routeSnapshot = world.routes.map((route) => ({
      id: route.id,
      traceStrength: route.traceStrength,
      reliability: route.reliability,
      traffic: route.traffic,
      lastUsedTick: route.lastUsedTick,
    }));

    stepWorld(world, [{
      id: "malformed-missing-trace",
      type: "deliver-contract",
      contractId: contract.id,
      destinationSettlementId: contract.destinationSettlementId,
      condition: 800_000,
    } as unknown as SimCommand]);
    expect(contract.status).toBe("in-transit");
    expect(world.routes.map((route) => ({
      id: route.id,
      traceStrength: route.traceStrength,
      reliability: route.reliability,
      traffic: route.traffic,
      lastUsedTick: route.lastUsedTick,
    }))).toEqual(routeSnapshot);
    expect(world.events.at(-1)?.type).toBe("command-rejected");

    stepWorld(world, [{
      id: `remote-deliver-${contract.id}`,
      type: "deliver-contract",
      contractId: contract.id,
      destinationSettlementId: contract.destinationSettlementId,
      condition: 800_000,
      trace,
    }]);
    const event = fulfillmentEvent(world, contract.id);
    expect(event?.data.reinforcedRouteCount).toBe(0);
    expect(event?.data.reinforcedRouteIds).toBe("");
    expect(world.routes.map((route) => ({
      id: route.id,
      traceStrength: route.traceStrength,
      reliability: route.reliability,
      traffic: route.traffic,
      lastUsedTick: route.lastUsedTick,
    }))).toEqual(routeSnapshot);
    assertWorldInvariants(world);
  });

  it("assigns full coverage to every authoritative NPC porter leg", () => {
    const world = createWorld("porters know their old roads", "calm");
    const contract = firstOffer(world);
    contract.playerExclusiveUntilTick = 0;
    stepWorld(world);
    expect(contract.carrierKind).toBe("resident");
    stepWorld(world);
    expect(contract.status).toBe("in-transit");
    expect(contract.porterRouteIds.length).toBeGreaterThan(0);
    contract.arrivalTick = world.meta.completedTick + 1;
    const routeBefore = new Map(contract.porterRouteIds.map((routeId) => {
      const route = world.routes.find((candidate) => candidate.id === routeId);
      if (route === undefined) throw new Error("missing porter route");
      return [routeId, { traceStrength: route.traceStrength, reliability: route.reliability }] as const;
    }));

    stepWorld(world);
    expect(contract.status).toBe("fulfilled");
    const condition = contract.deliveryCondition;
    if (condition === null) throw new Error("porter delivery lacks condition");
    for (const routeId of contract.porterRouteIds) {
      const route = world.routes.find((candidate) => candidate.id === routeId);
      const before = routeBefore.get(routeId);
      if (route === undefined || before === undefined) throw new Error("missing porter route snapshot");
      expect(route.traceStrength - before.traceStrength).toBe(2_000 + Math.trunc(condition / 220));
      expect(route.reliability - before.reliability).toBe(1_500 + Math.trunc(condition / 300));
    }
    const reinforcedIds = [...new Set(contract.porterRouteIds)].sort((left, right) => left - right);
    const event = fulfillmentEvent(world, contract.id);
    expect(event?.data.reinforcedRouteCount).toBe(reinforcedIds.length);
    expect(event?.data.reinforcedRouteIds).toBe(reinforcedIds.join(","));
    assertWorldInvariants(world);
  });
});

describe("authoritative tide choirs", () => {
  it("canonicalizes and rewards a simple cycle without creating resources or trace", () => {
    const world = createWorld("three bells answer");
    const settlementIds = world.settlements.slice(0, 3).map((settlement) => settlement.id);
    const first = settlementIds[0];
    const second = settlementIds[1];
    const third = settlementIds[2];
    if (first === undefined || second === undefined || third === undefined) throw new Error("missing triangle");
    const routes = [
      routeBetween(world, first, second),
      routeBetween(world, second, third),
      routeBetween(world, third, first),
    ];
    const inventoryBefore = world.settlements.map((settlement) => ({ ...settlement.inventory }));
    const routeBefore = routes.map((route) => ({
      traceStrength: route.traceStrength,
      condition: route.condition,
      reliability: route.reliability,
    }));

    stepWorld(world, [{
      id: "wake-triangle",
      type: "awaken-tide-choir",
      routeIds: [routes[2]?.id ?? 0, routes[0]?.id ?? 0, routes[1]?.id ?? 0],
    }]);

    expect(world.choirs).toHaveLength(1);
    const choir = world.choirs[0];
    const canonicalRouteIds = routes.map((route) => route.id).sort((left, right) => left - right);
    expect(choir?.routeIds).toEqual(canonicalRouteIds);
    expect(choir?.settlementIds).toEqual([...settlementIds].sort((left, right) => left - right));
    expect(choir?.awakenedTick).toBe(1);
    expect(world.settlements.map((settlement) => settlement.inventory)).toEqual(inventoryBefore);
    routes.forEach((route, index) => {
      expect(route.traceStrength).toBe(routeBefore[index]?.traceStrength);
      expect(route.condition).toBe((routeBefore[index]?.condition ?? 0) + TIDE_CHOIR_CONDITION_BONUS);
      expect(route.reliability).toBe((routeBefore[index]?.reliability ?? 0) + TIDE_CHOIR_RELIABILITY_BONUS);
    });
    const event = world.events.at(-1);
    expect(event?.type).toBe("tide-choir-awakened");
    expect(event?.data.routeIds).toBe(canonicalRouteIds.join(","));
    expect(event?.data.routeCount).toBe(3);
    expect(createWorldView(world).choirs[0]).not.toBe(choir);
    expect(createWorldView(world).choirs[0]?.routeIds).not.toBe(choir?.routeIds);
    assertWorldInvariants(world);
  });

  it("rejects paths, duplicate edges, oversized phrases, and repeated cycles without a second reward", () => {
    const world = createWorld("the refrain remembers");
    const ids = world.settlements.map((settlement) => settlement.id);
    const a = ids[0];
    const b = ids[1];
    const c = ids[2];
    const d = ids[3];
    if (a === undefined || b === undefined || c === undefined || d === undefined) throw new Error("missing settlements");
    const ab = routeBetween(world, a, b);
    const bc = routeBetween(world, b, c);
    const ac = routeBetween(world, a, c);
    const cd = routeBetween(world, c, d);

    stepWorld(world, [{ id: "not-a-cycle", type: "awaken-tide-choir", routeIds: [ab.id, bc.id, cd.id] }]);
    stepWorld(world, [{ id: "same-edge-twice", type: "awaken-tide-choir", routeIds: [ab.id, ab.id, ac.id] }]);
    stepWorld(world, [{
      id: "too-many-edges",
      type: "awaken-tide-choir",
      routeIds: [ab.id, bc.id, ac.id, cd.id, ab.id, bc.id, ac.id, cd.id],
    }]);
    expect(world.choirs).toHaveLength(0);

    stepWorld(world, [{ id: "valid-cycle", type: "awaken-tide-choir", routeIds: [ab.id, bc.id, ac.id] }]);
    const afterFirstReward = [ab, bc, ac].map((route) => ({
      condition: route.condition,
      reliability: route.reliability,
    }));
    stepWorld(world, [{ id: "same-cycle-reversed", type: "awaken-tide-choir", routeIds: [ac.id, bc.id, ab.id] }]);
    expect(world.choirs).toHaveLength(1);
    expect([ab, bc, ac].map((route) => ({
      condition: route.condition,
      reliability: route.reliability,
    }))).toEqual(afterFirstReward);
    expect(world.events.at(-1)?.type).toBe("command-rejected");
    expect(world.events.at(-1)?.data.reason).toContain("already awake");
    assertWorldInvariants(world);
  });

  it("accepts a seven-edge simple cycle and is deterministic across command orderings", () => {
    const first = createWorld("seven voices in a ring");
    const second = createWorld("seven voices in a ring");
    const ids = first.settlements.map((settlement) => settlement.id);
    const cycleRouteIds = ids.map((settlementId, index) => {
      const nextId = ids[(index + 1) % ids.length];
      if (nextId === undefined) throw new Error("missing cycle neighbor");
      return routeBetween(first, settlementId, nextId).id;
    });
    stepWorld(first, [{ id: "seven-cycle", type: "awaken-tide-choir", routeIds: cycleRouteIds }]);
    stepWorld(second, [{ id: "seven-cycle", type: "awaken-tide-choir", routeIds: [...cycleRouteIds].reverse() }]);
    expect(first.choirs[0]?.routeIds).toEqual([...cycleRouteIds].sort((left, right) => left - right));
    expect(hashWorld(first)).toBe(hashWorld(second));
    assertWorldInvariants(first);
  });

  it("detects corrupted choir canonicalization and topology through invariants", () => {
    const world = createWorld("a false harmony");
    const ids = world.settlements.slice(0, 3).map((settlement) => settlement.id);
    const a = ids[0];
    const b = ids[1];
    const c = ids[2];
    if (a === undefined || b === undefined || c === undefined) throw new Error("missing triangle");
    stepWorld(world, [{
      id: "valid-before-corruption",
      type: "awaken-tide-choir",
      routeIds: [routeBetween(world, a, b).id, routeBetween(world, b, c).id, routeBetween(world, a, c).id],
    }]);
    const choir = world.choirs[0];
    if (choir === undefined) throw new Error("choir did not awaken");
    choir.routeIds.reverse();
    expect(() => assertWorldInvariants(world)).toThrow(/not canonical/);
  });
});

describe("save migrations", () => {
  it("verifies the legacy checksum before adding empty choirs and updating metadata", () => {
    const original = createWorld("old salt memory");
    runTicks(original, 137);
    const migrated = deserializeWorld(alphaSaveText(original));
    expect(migrated.meta.saveFormatVersion).toBe(SAVE_FORMAT_VERSION);
    expect(migrated.meta.rulesVersion).toBe(RULES_VERSION);
    expect(migrated.choirs).toEqual([]);
    assertWorldInvariants(migrated);

    const resumed = deserializeWorld(serializeWorld(migrated));
    runTicks(migrated, 1_200);
    runTicks(resumed, 1_200);
    expect(hashWorld(resumed)).toBe(hashWorld(migrated));
    assertWorldInvariants(migrated);
  });

  it("preserves a 64x48 tideweft-sim/3 world while advancing only its rules metadata", () => {
    const prior = legacySizedWorld(createWorld("the old, narrow reach"));
    const terrainBefore = structuredClone(prior.terrain);
    const settlementsBefore = structuredClone(prior.settlements);
    const routesBefore = structuredClone(prior.routes);
    const migrated = deserializeWorld(choirRulesSaveText(prior));

    expect(migrated.meta.saveFormatVersion).toBe(SAVE_FORMAT_VERSION);
    expect(migrated.meta.rulesVersion).toBe(RULES_VERSION);
    expect(migrated.terrain).toEqual(terrainBefore);
    expect(migrated.settlements).toEqual(settlementsBefore);
    expect(migrated.routes).toEqual(routesBefore);
    expect(migrated.terrain.width).toBe(LEGACY_WORLD_WIDTH);
    expect(migrated.terrain.height).toBe(LEGACY_WORLD_HEIGHT);
    assertWorldInvariants(migrated);

    const roundTripped = deserializeWorld(serializeWorld(migrated));
    expect(roundTripped.terrain).toEqual(terrainBefore);
    expect(roundTripped.settlements).toEqual(settlementsBefore);
    expect(roundTripped.routes).toEqual(routesBefore);

    runTicks(migrated, 600);
    assertWorldInvariants(migrated);
  });

  it("rejects tampered legacy snapshots and future formats", () => {
    const world = createWorld("sealed in amber");
    const tampered = JSON.parse(alphaSaveText(world)) as {
      world: { settlements: { inventory: { food: number } }[] };
    };
    const settlement = tampered.world.settlements[0];
    if (settlement === undefined) throw new Error("missing legacy settlement");
    settlement.inventory.food += 1;
    expect(() => deserializeWorld(JSON.stringify(tampered))).toThrow(/checksum/);

    const priorRulesTampered = JSON.parse(choirRulesSaveText(legacySizedWorld(world))) as {
      world: { terrain: { tiles: { elevation: number }[] } };
    };
    const firstTile = priorRulesTampered.world.terrain.tiles[0];
    if (firstTile === undefined) throw new Error("missing legacy terrain tile");
    firstTile.elevation += 1;
    expect(() => deserializeWorld(JSON.stringify(priorRulesTampered))).toThrow(/checksum/);

    const future = JSON.parse(serializeWorld(world)) as Record<string, unknown>;
    future.saveFormatVersion = SAVE_FORMAT_VERSION + 1;
    expect(() => deserializeWorld(JSON.stringify(future))).toThrow(/newer than supported/);
  });
});
