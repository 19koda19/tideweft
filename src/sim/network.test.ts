import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  STRAND_AUTOMATION_THRESHOLD,
  calculateNetworkMetrics,
  createWorld,
  findAutonomousRoutePlan,
  routeCapacity,
  runTicks,
} from "./public";

function routeBetween(world: ReturnType<typeof createWorld>, leftId: number, rightId: number) {
  const low = Math.min(leftId, rightId);
  const high = Math.max(leftId, rightId);
  const route = world.routes.find(
    (candidate) => candidate.fromSettlementId === low && candidate.toSettlementId === high,
  );
  if (!route) throw new Error(`missing route ${leftId}-${rightId}`);
  return route;
}

describe("active strand topology", () => {
  it("begins as a connected but brittle porter chain with real multi-hop plans", () => {
    const world = createWorld("quiet-delta");
    const first = world.settlements[0];
    const last = world.settlements.at(-1);
    if (!first || !last) throw new Error("missing settlements");

    const metrics = calculateNetworkMetrics(world);
    expect(metrics.activeRouteCount).toBe(6);
    expect(metrics.connectedSettlementCount).toBe(7);
    expect(metrics.cycleRank).toBe(0);
    expect(metrics.bridgeCount).toBe(6);
    expect(metrics.resolved).toBe(false);

    const plan = findAutonomousRoutePlan(world, first.id, last.id);
    expect(plan?.routeIds).toHaveLength(6);
    expect(plan?.settlementIds).toEqual(world.settlements.map((settlement) => settlement.id));
    expect(plan?.travelTicks).toBeGreaterThan(0);
  });

  it("turns player-weft chords into shortcuts, loops, and a reachable resilient finale", () => {
    const world = createWorld("quiet-delta");
    const ids = world.settlements.map((settlement) => settlement.id);
    const first = ids[0];
    const middle = ids[3];
    const last = ids[6];
    if (first === undefined || middle === undefined || last === undefined) throw new Error("missing settlement IDs");

    const closingChord = routeBetween(world, first, last);
    closingChord.traceStrength = STRAND_AUTOMATION_THRESHOLD;
    const loopMetrics = calculateNetworkMetrics(world);
    expect(loopMetrics.cycleRank).toBe(1);
    expect(loopMetrics.bridgeCount).toBe(0);
    expect(loopMetrics.resilientSettlementCount).toBe(7);
    expect(findAutonomousRoutePlan(world, first, last)?.routeIds).toEqual([closingChord.id]);

    routeBetween(world, first, middle).traceStrength = STRAND_AUTOMATION_THRESHOLD;
    const resilient = calculateNetworkMetrics(world);
    expect(resilient.cycleRank).toBe(2);
    expect(resilient.bridgeCount).toBe(0);
    expect(resilient.resolved).toBe(true);
  });

  it("reroutes around a storm-closed weak strand when a redundant loop exists", () => {
    const world = createWorld("storm detour", "wild");
    const ids = world.settlements.map((settlement) => settlement.id);
    const first = ids[0];
    const second = ids[1];
    const third = ids[2];
    if (first === undefined || second === undefined || third === undefined) throw new Error("missing settlement IDs");
    const direct = routeBetween(world, first, second);
    const bypass = routeBetween(world, first, third);
    const returnLeg = routeBetween(world, second, third);
    bypass.traceStrength = STRAND_AUTOMATION_THRESHOLD;
    bypass.reliability = 900_000;
    bypass.condition = 900_000;
    returnLeg.reliability = 900_000;
    returnLeg.condition = 900_000;
    direct.reliability = 620_000;
    direct.condition = 700_000;
    world.weather = {
      kind: "storm",
      intensity: 800_000,
      windX: 300_000,
      windY: -250_000,
      nextChangeTick: world.meta.completedTick + 180,
    };

    const plan = findAutonomousRoutePlan(world, first, second);
    expect(plan?.routeIds).not.toContain(direct.id);
    expect(plan?.routeIds).toContain(bypass.id);
    expect(plan?.routeIds.length).toBeGreaterThan(1);
  });

  it("gives completed ferries and mature strands tangible shared capacity", () => {
    const world = createWorld("ferry capacity");
    const route = world.routes[0];
    if (!route) throw new Error("missing route");
    route.traceStrength = 510_000;
    expect(routeCapacity(world, route)).toBe(3);
    const endpoint = world.settlements.find((settlement) => settlement.id === route.fromSettlementId);
    if (!endpoint) throw new Error("missing endpoint");
    endpoint.project.kind = "ferry";
    endpoint.project.status = "complete";
    endpoint.project.progress = endpoint.project.target;
    expect(routeCapacity(world, route)).toBe(4);
    expect(route.reliability).toBeLessThanOrEqual(FIXED_POINT);
  });

  it("lets a completed beacon keep a marginal route legible in a severe storm", () => {
    const world = createWorld("beacon through rain", "wild");
    const first = world.settlements[0];
    const second = world.settlements[1];
    if (!first || !second) throw new Error("missing settlements");
    const route = routeBetween(world, first.id, second.id);
    route.reliability = 600_000;
    route.condition = 700_000;
    world.weather = {
      kind: "storm",
      intensity: 820_000,
      windX: 250_000,
      windY: 250_000,
      nextChangeTick: world.meta.completedTick + 180,
    };
    expect(findAutonomousRoutePlan(world, first.id, second.id)).toBeUndefined();
    first.project.kind = "beacon";
    first.project.status = "complete";
    first.project.progress = first.project.target;
    expect(findAutonomousRoutePlan(world, first.id, second.id)?.routeIds).toEqual([route.id]);
  });

  it("applies a completed crossing to authoritative travel time and event causality", () => {
    const world = createWorld("crossing becomes real");
    const crossing = world.settlements.find((settlement) => settlement.project.kind === "crossing");
    if (!crossing) throw new Error("missing crossing project");
    const incident = world.routes.find(
      (route) => route.fromSettlementId === crossing.id || route.toSettlementId === crossing.id,
    );
    if (!incident) throw new Error("missing incident route");
    const beforeTicks = incident.baseTravelTicks;
    crossing.project.progress = crossing.project.target - 1;
    crossing.inventory[crossing.project.resource] = Math.max(1, crossing.inventory[crossing.project.resource]);
    runTicks(world, 60);
    expect(crossing.project.status).toBe("complete");
    expect(incident.baseTravelTicks).toBeLessThan(beforeTicks);
    const event = world.events.find(
      (candidate) => candidate.type === "project-completed" && candidate.subjectId === crossing.project.id,
    );
    expect(event?.data.effect).toContain("faster");
  });
});
