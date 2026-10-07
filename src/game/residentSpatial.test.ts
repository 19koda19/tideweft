import { describe, expect, it } from "vitest";

import { findAutonomousRoutePlan } from "../sim/network";
import { createWorld, createWorldView, stepWorld } from "../sim/public";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  regionLocalToGlobalTile,
} from "../sim/regions";
import { FIXED_POINT, type WorldView } from "../sim/types";
import { createPlayer, TILE_UNITS } from "./player";
import { projectResidentRoutePosition, projectResidentWorldPosition } from "./projection";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  createRegionalTerrainWindow,
  regionalFrameOriginAtAddress,
  type RegionalTerrainWindow,
} from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import {
  playerWorldPositionInRegionalWindow,
  residentPlacementInRegionalWindow,
  resolveResidentRouteWorldPlacement,
  resolveResidentWorldPlacement,
  resolveResidentWorldPlacementAtEventLocation,
  type ResidentWorldPlacement,
} from "./residentSpatial";
import { createWorldPosition } from "./worldPosition";

describe("authoritative compatibility-resident spatial identity", () => {
  it("assigns crowded settlement slots by stable identity rather than array order", () => {
    const state = createWorld("people hold one place", "standard");
    const settlement = state.settlements[0];
    if (!settlement) throw new Error("fixture needs a settlement");
    for (const resident of state.residents) {
      resident.location = { kind: "settlement", settlementId: settlement.id };
    }
    const economy = createWorldView(state);
    const expected = new Map(economy.residents.map((resident) => [
      resident.identity.stableId,
      resolveResidentWorldPlacement(economy, resident),
    ]));

    expect([...expected.values()].every((placement) => placement !== null)).toBe(true);
    expect(new Set([...expected.values()].map((placement) =>
      placement === null
        ? "missing"
        : `${placement.position.region.x}:${placement.position.region.y}:${placement.position.localX}:${placement.position.localY}`
    )).size).toBe(economy.residents.length);

    const reordered: WorldView = { ...economy, residents: [...economy.residents].reverse() };
    for (const resident of reordered.residents) {
      expect(resolveResidentWorldPlacement(reordered, resident))
        .toEqual(expected.get(resident.identity.stableId));
    }
  });

  it("interpolates a route between tile centers with fixed sub-tile precision", () => {
    const state = createWorld("one porter between two stones", "standard");
    const route = state.routes.find((candidate) => candidate.path.some((tileIndex, offset) => {
      const nextIndex = candidate.path[offset + 1];
      if (nextIndex === undefined) return false;
      const tile = state.terrain.tiles[tileIndex];
      const next = state.terrain.tiles[nextIndex];
      return Boolean(tile && next && (tile.x !== next.x || tile.y !== next.y));
    }));
    const resident = state.residents[0];
    if (!route || !resident) throw new Error("fixture needs a resident route");
    const pairOffset = route.path.findIndex((tileIndex, offset) => {
      const nextIndex = route.path[offset + 1];
      if (nextIndex === undefined) return false;
      const tile = state.terrain.tiles[tileIndex];
      const next = state.terrain.tiles[nextIndex];
      return Boolean(tile && next && (tile.x !== next.x || tile.y !== next.y));
    });
    const fromIndex = route.path[pairOffset];
    const toIndex = route.path[pairOffset + 1];
    if (fromIndex === undefined || toIndex === undefined) throw new Error("fixture lost route pair");
    route.path = [fromIndex, toIndex];
    resident.location = { kind: "route", routeId: route.id, progress: FIXED_POINT / 4 };
    const economy = createWorldView(state);
    const from = economy.terrain.tiles[fromIndex];
    const to = economy.terrain.tiles[toIndex];
    if (!from || !to) throw new Error("fixture lost route tiles");

    const placement = resolveResidentRouteWorldPlacement(economy, resident);

    expect(placement).not.toBeNull();
    if (!placement) throw new Error("fixture porter needs a canonical route position");
    expect(placement.position).toEqual(createWorldPosition(
      { x: 0, y: 0 },
      from.x * TILE_UNITS + TILE_UNITS / 2 + (to.x - from.x) * TILE_UNITS / 4,
      from.y * TILE_UNITS + TILE_UNITS / 2 + (to.y - from.y) * TILE_UNITS / 4,
    ));
    expect(placement).toMatchObject({
      compatibilityTileIndex: fromIndex,
      progress: 0.25,
    });
    expect(projectResidentRoutePosition(economy, resident, TILE_UNITS)?.position)
      .toEqual({ x: placement.position.localX, y: placement.position.localY });

    resident.location = { kind: "route", routeId: route.id, progress: FIXED_POINT * 3 / 4 };
    expect(resolveResidentRouteWorldPlacement(createWorldView(state), resident))
      .toMatchObject({ compatibilityTileIndex: toIndex, progress: 0.75 });
  });

  it.each(["forward", "reverse"] as const)("faces actual porter displacement on a %s itinerary", (direction) => {
    const reverse = direction === "reverse";
    const { state, resident } = travellingResident(reverse);
    const departed = resolveResidentRouteWorldPlacement(createWorldView(state), resident);
    if (!departed || resident.location.kind !== "route") throw new Error("fixture needs a departure");
    const initialProgress = resident.location.progress;

    stepWorld(state);
    const moving = resolveResidentRouteWorldPlacement(createWorldView(state), resident);
    if (!moving || resident.location.kind !== "route") throw new Error("fixture needs a moving porter");
    const dx = moving.position.localX - departed.position.localX;
    const dy = moving.position.localY - departed.position.localY;

    expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
    expect(Math.cos(moving.facing) * dx + Math.sin(moving.facing) * dy).toBeGreaterThan(0);
    if (reverse) expect(resident.location.progress).toBeLessThan(initialProgress);
    else expect(resident.location.progress).toBeGreaterThan(initialProgress);
  });

  it.each(["forward", "reverse"] as const)("uses the %s itinerary tangent at interior bends and both endpoints", (direction) => {
    const reverse = direction === "reverse";
    const { state, resident, route } = travellingResident(reverse);
    // A bounded geometry fixture isolates segment selection; the resident's
    // assignment and leg direction came from real acceptance and departure.
    const a = 10 * state.terrain.width + 10;
    const b = a + 1;
    const c = b + state.terrain.width;
    route.path = [a, b, c];
    const expected = reverse
      ? [Math.PI, Math.PI, Math.PI, -Math.PI / 2, -Math.PI / 2]
      : [0, 0, Math.PI / 2, Math.PI / 2, Math.PI / 2];

    for (const [index, progress] of [0, 250_000, 500_000, 750_000, FIXED_POINT].entries()) {
      resident.location = { kind: "route", routeId: route.id, progress };
      const placement = resolveResidentRouteWorldPlacement(createWorldView(state), resident);
      if (!placement) throw new Error("fixture needs a spatially valid route");
      expect(placement.facing).toBeCloseTo(expected[index] ?? NaN, 12);
      // Direction changes heading, never the canonical stored-path arithmetic.
      expect(placement.position).toEqual(createWorldPosition(
        { x: 0, y: 0 },
        10 * TILE_UNITS + TILE_UNITS / 2 + Math.min(progress * 2, FIXED_POINT) / FIXED_POINT * TILE_UNITS,
        10 * TILE_UNITS + TILE_UNITS / 2 + Math.max(0, progress * 2 - FIXED_POINT) / FIXED_POINT * TILE_UNITS,
      ));
      expect(placement.progress).toBe(progress / FIXED_POINT);
    }
  });

  it("does not borrow a current reverse itinerary for a historical route-event locus", () => {
    const { state, resident, route } = travellingResident(true);
    const a = 10 * state.terrain.width + 10;
    route.path = [a, a + 1, a + 1 + state.terrain.width];
    resident.location = { kind: "route", routeId: route.id, progress: FIXED_POINT / 2 };
    const economy = createWorldView(state);
    const current = resolveResidentRouteWorldPlacement(economy, resident);
    const historical = resolveResidentWorldPlacementAtEventLocation(
      economy,
      resident,
      { kind: "route", routeId: route.id, progress: FIXED_POINT / 2 },
      null,
    );

    expect(current?.facing).toBeCloseTo(Math.PI, 12);
    expect(historical?.facing).toBeCloseTo(Math.PI / 2, 12);
    expect(historical?.position).toEqual(current?.position);
    expect(historical?.occupiedTile).toEqual(current?.occupiedTile);
    expect(historical?.progress).toBe(current?.progress);
  });

  it("does not infer reverse travel from a disconnected or foreign assignment", () => {
    const { state, resident, route, contract } = travellingResident(true);
    const a = 10 * state.terrain.width + 10;
    route.path = [a, a + 1];
    resident.location = { kind: "route", routeId: route.id, progress: FIXED_POINT / 4 };
    const assignedResidentId = contract.assignedResidentId;
    contract.assignedResidentId = state.residents.find(({ id }) => id !== resident.id)?.id ?? null;
    expect(resolveResidentRouteWorldPlacement(createWorldView(state), resident)?.facing).toBe(0);

    contract.assignedResidentId = assignedResidentId;
    const leg = contract.porterRouteIds.indexOf(route.id);
    contract.porterSettlementIds[leg + 1] = contract.porterSettlementIds[leg] ?? 0;
    expect(resolveResidentRouteWorldPlacement(createWorldView(state), resident)?.facing).toBe(0);
  });

  it("fails closed instead of treating a non-contiguous path as a regional route", () => {
    const state = createWorld("a route cannot become a teleport", "standard");
    const resident = state.residents[0];
    const route = state.routes[0];
    if (!resident || !route) throw new Error("fixture needs a resident route");
    route.path = [0, state.terrain.width * 2 + 2];
    resident.location = { kind: "route", routeId: route.id, progress: FIXED_POINT / 2 };

    expect(resolveResidentRouteWorldPlacement(createWorldView(state), resident)).toBeNull();
  });

  it("keeps one canonical resident point across moving-frame rebases", () => {
    const state = createWorld("the frame moves but the porter does not", "standard");
    const economy = createWorldView(state);
    const resident = economy.residents[0];
    if (!resident) throw new Error("fixture needs a resident");
    const canonical = resolveResidentWorldPlacement(economy, resident);
    if (!canonical) throw new Error("fixture resident needs a canonical position");
    const localX = Math.floor(canonical.position.localX / TILE_UNITS);
    const localY = Math.floor(canonical.position.localY / TILE_UNITS);
    const stream = createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed });
    const firstOrigin = regionalFrameOriginAtAddress({
      region: canonical.position.region,
      localX,
      localY,
    });
    const secondOrigin = { x: firstOrigin.x + 16, y: firstOrigin.y - 16 };
    const firstWindow = createRegionalTerrainWindow(state.meta.rootSeed, stream, firstOrigin);
    const secondWindow = createRegionalTerrainWindow(state.meta.rootSeed, stream, secondOrigin);
    const chart = createRegionalCartography(state.meta.rootSeed);
    const first = createRegionalWorldView(
      economy,
      firstWindow,
      projectRegionalCartographyWindow(chart, firstWindow),
    );
    const second = createRegionalWorldView(
      economy,
      secondWindow,
      projectRegionalCartographyWindow(chart, secondWindow),
    );

    const firstProjection = projectResidentWorldPosition(first, resident, TILE_UNITS);
    const secondProjection = projectResidentWorldPosition(second, resident, TILE_UNITS);

    expect(firstProjection).not.toBeNull();
    expect(secondProjection).not.toBeNull();
    if (!firstProjection || !secondProjection) throw new Error("resident left a containing frame");
    expect(firstProjection.position.x - secondProjection.position.x).toBe(16 * TILE_UNITS);
    expect(firstProjection.position.y - secondProjection.position.y).toBe(-16 * TILE_UNITS);
    expect(resolveResidentWorldPlacement(economy, resident)).toEqual(canonical);
  });

  it("projects signed extreme segmented points exactly and returns null outside", () => {
    for (const axis of [REGION_COORD_LIMIT - 2, -REGION_COORD_LIMIT + 2]) {
      const region = createRegionCoord(axis, -axis);
      const origin = regionLocalToGlobalTile(region, 3, 5);
      const window = minimalWindow(origin);
      const position = createWorldPosition(region, 3 * TILE_UNITS + 321, 5 * TILE_UNITS + 777);
      const placement: ResidentWorldPlacement = {
        position,
        occupiedTile: createWorldPosition(region, 3 * TILE_UNITS + 500, 5 * TILE_UNITS + 500),
        compatibilityTileIndex: 0,
        facing: 0,
        progress: 0,
      };

      expect(residentPlacementInRegionalWindow(placement, window)).toMatchObject({
        tileIndex: 0,
        position: { x: 321, y: 777 },
      });
      const distantEconomy = createWorldView(createWorld(`distant ${axis}`, "standard"));
      const distantResident = distantEconomy.residents[0];
      if (!distantResident) throw new Error("fixture needs a compatibility resident");
      const distant = resolveResidentWorldPlacement(distantEconomy, distantResident);
      if (!distant) throw new Error("fixture needs a compatibility resident");
      expect(residentPlacementInRegionalWindow(distant, window)).toBeNull();
    }
  });

  it("derives the same player world point before and after a frame rebase", () => {
    const state = createWorld("the courier has one address", "standard");
    const economy = createWorldView(state);
    const player = createPlayer(economy);
    const region = createRegionCoord(-1_000_000, 1_000_000);
    const firstOrigin = regionLocalToGlobalTile(region, 0, 0);
    const firstWindow = minimalWindow(firstOrigin);
    const secondWindow = minimalWindow({ x: firstOrigin.x + 16, y: firstOrigin.y - 16 });
    player.worldWidth = REGIONAL_TRAVEL_COLUMNS;
    player.worldHeight = REGIONAL_TRAVEL_ROWS;
    player.x = 30 * TILE_UNITS + 123;
    player.y = 40 * TILE_UNITS + 456;
    const before = playerWorldPositionInRegionalWindow(firstWindow, player);
    player.x -= 16 * TILE_UNITS;
    player.y += 16 * TILE_UNITS;

    expect(playerWorldPositionInRegionalWindow(secondWindow, player)).toEqual(before);
  });
});

function travellingResident(reverse: boolean) {
  const state = createWorld("first lantern", "standard");
  state.weather = {
    kind: "clear",
    intensity: 0,
    windX: 0,
    windY: 0,
    nextChangeTick: state.meta.completedTick + 1_000,
  };
  const contract = state.contracts.find((candidate) => {
    const plan = findAutonomousRoutePlan(state, candidate.originSettlementId, candidate.destinationSettlementId);
    const route = state.routes.find(({ id }) => id === plan?.routeIds[0]);
    return candidate.status === "offered"
      && route !== undefined
      && (route.fromSettlementId !== candidate.originSettlementId) === reverse;
  });
  const resident = state.residents.find((candidate) => candidate.location.kind === "settlement"
    && candidate.location.settlementId === contract?.originSettlementId
    && candidate.activeContractId === null);
  if (!contract || !resident) throw new Error(`fixture needs a real ${reverse ? "reverse" : "forward"} Promise`);
  stepWorld(state, [{
    id: `spatial-accept-${reverse}`,
    type: "accept-contract",
    carrier: "resident",
    contractId: contract.id,
    residentId: resident.id,
  }]);
  expect(contract.status).toBe("accepted");
  stepWorld(state);
  expect(contract.status).toBe("in-transit");
  expect(contract.cargoQuantity).toBe(contract.quantity);
  const route = state.routes.find(({ id }) => resident.location.kind === "route"
    && id === resident.location.routeId);
  if (!route) throw new Error("fixture needs the departed itinerary leg");
  return { state, resident, route, contract };
}

function minimalWindow(
  origin: { readonly x: number; readonly y: number },
): Pick<RegionalTerrainWindow, "origin" | "terrain"> {
  return {
    origin,
    terrain: {
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
      tiles: [],
    },
  };
}
