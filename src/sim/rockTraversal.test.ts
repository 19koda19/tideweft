import { describe, expect, it } from "vitest";

import {
  createLadderKitState,
  damageLadder,
  deployLadder,
  generateRockField,
  queryRockCrossing,
  reclaimLadder,
  rockObstacleAt,
  validateLadderPlacement,
  type LadderPlacementContext,
  type RockField,
  type RockObstacle,
  type RockTerrain,
} from "./rockTraversal";
import { seedFromText } from "./rng";
import { generateTerrain } from "./terrain";
import { FIXED_POINT, type TerrainKind } from "./types";

function obstacle(overrides: Partial<RockObstacle> = {}): RockObstacle {
  return {
    id: 7,
    formationId: 7,
    tileIndex: 6,
    height: 800_000,
    slope: 200_000,
    severity: "wall",
    walkingBlocked: true,
    highRisk: true,
    fallRiskPermille: 800,
    travelCostPermille: 5_200,
    ...overrides,
  };
}

function syntheticTerrain(
  terrainOverrides: Readonly<Record<number, TerrainKind>> = {},
  roughnessOverrides: Readonly<Record<number, number>> = {},
): RockTerrain {
  const width = 5;
  const height = 3;
  return {
    width,
    height,
    tiles: Array.from({ length: width * height }, (_, index) => ({
      index,
      x: index % width,
      y: Math.floor(index / width),
      elevation: 620_000,
      roughness: roughnessOverrides[index] ?? 90_000,
      terrain: terrainOverrides[index] ?? "meadow",
    })),
  };
}

function syntheticRocks(overrides: Partial<RockObstacle> = {}): RockField {
  const first = obstacle(overrides);
  const second = obstacle({
    id: 8,
    tileIndex: 7,
    height: 600_000,
    slope: 120_000,
    severity: "ledge",
    walkingBlocked: false,
    fallRiskPermille: 500,
    travelCostPermille: 3_000,
    ...overrides,
  });
  return {
    version: 1,
    width: 5,
    height: 3,
    obstacles: [first, second],
    formations: [{
      id: 7,
      obstacleIds: [7, 8],
      tileIndices: [6, 7],
      minX: 1,
      minY: 1,
      maxX: 2,
      maxY: 1,
      peakHeight: Math.max(first.height, second.height),
    }],
  };
}

function syntheticContext(
  overrides: Partial<LadderPlacementContext> = {},
): LadderPlacementContext {
  return {
    terrain: syntheticTerrain(),
    rocks: syntheticRocks(),
    ...overrides,
  };
}

describe("deterministic rock formations", () => {
  it("is identical for a seed even when terrain input order is reversed", () => {
    const seed = seedFromText("the outcrop remembers our boots");
    const terrain = generateTerrain(seed);
    const forward = generateRockField(seed, terrain);
    const reversed = generateRockField(seed, {
      ...terrain,
      tiles: [...terrain.tiles].reverse(),
    });

    expect(reversed).toEqual(forward);
    expect(generateRockField(seed, terrain)).toEqual(forward);
  });

  it("changes its geology with the seed", () => {
    const firstSeed = seedFromText("granite weather");
    const secondSeed = seedFromText("singing basalt");
    const first = generateRockField(firstSeed, generateTerrain(firstSeed));
    const second = generateRockField(secondSeed, generateTerrain(secondSeed));

    expect(second.obstacles.map((rock) => rock.tileIndex))
      .not.toEqual(first.obstacles.map((rock) => rock.tileIndex));
  });

  it("makes sparse coherent outcrops with varied traversal hazards across generated worlds", () => {
    let tileCount = 0;
    let obstacleCount = 0;
    let formationCount = 0;
    const severities = new Set<string>();
    const terrainFamilies = new Set<TerrainKind>();

    for (let seedIndex = 0; seedIndex < 12; seedIndex += 1) {
      const seed = seedFromText(`rock-diversity-${seedIndex}`);
      const terrain = generateTerrain(seed);
      const field = generateRockField(seed, terrain);
      tileCount += terrain.tiles.length;
      obstacleCount += field.obstacles.length;
      formationCount += field.formations.length;
      const byTile = new Map(terrain.tiles.map((tile) => [tile.index, tile]));

      for (const formation of field.formations) {
        expect(formation.obstacleIds.length).toBeGreaterThanOrEqual(2);
        expect(formation.id).toBe(Math.min(...formation.obstacleIds));
      }
      for (const rock of field.obstacles) {
        severities.add(rock.severity);
        const tile = byTile.get(rock.tileIndex);
        if (tile) terrainFamilies.add(tile.terrain);
        expect(Number.isSafeInteger(rock.height)).toBe(true);
        expect(Number.isSafeInteger(rock.slope)).toBe(true);
        expect(rock.height).toBeGreaterThanOrEqual(0);
        expect(rock.height).toBeLessThanOrEqual(FIXED_POINT);
        expect(rock.fallRiskPermille).toBeGreaterThanOrEqual(0);
        expect(rock.fallRiskPermille).toBeLessThanOrEqual(950);
        expect(rock.travelCostPermille).toBeGreaterThanOrEqual(1_000);
        expect(rock.travelCostPermille).toBeLessThanOrEqual(6_000);
      }
    }

    const density = obstacleCount / tileCount;
    expect(obstacleCount).toBeGreaterThan(120);
    expect(formationCount).toBeGreaterThan(20);
    expect(density).toBeGreaterThan(0.002);
    expect(density).toBeLessThan(0.1);
    expect(severities.size, [...severities].sort().join(", ")).toBeGreaterThanOrEqual(3);
    expect(terrainFamilies.size).toBeGreaterThanOrEqual(2);
  });

  it("assigns canonical IDs and exact immutable signals", () => {
    const seed = seedFromText("a known shoulder of stone");
    const terrain = generateTerrain(seed);
    const field = generateRockField(seed, terrain);
    const rock = field.obstacles[0];
    if (!rock) throw new Error("golden world should contain a rock obstacle");

    expect(rock.id).toBe(rock.tileIndex + 1);
    expect(field.formations.find((formation) => formation.id === rock.formationId)?.obstacleIds)
      .toContain(rock.id);
    expect(rock).toMatchInlineSnapshot(`
      {
        "fallRiskPermille": 251,
        "formationId": 59,
        "height": 584276,
        "highRisk": false,
        "id": 59,
        "severity": "scramble",
        "slope": 15036,
        "tileIndex": 58,
        "travelCostPermille": 1915,
        "walkingBlocked": false,
      }
    `);
    expect(rockObstacleAt(field, rock.tileIndex)).toEqual(rock);
  });

  it("fails closed and stays bounded on malformed terrain", () => {
    const seed = seedFromText("broken map margin");
    const malformed = {
      width: 4,
      height: 3,
      tiles: [
        { index: 999, x: 1, y: 1, elevation: Number.POSITIVE_INFINITY,
          roughness: Number.NaN, terrain: "ridge" },
        { index: -4, x: 1, y: 1, elevation: -8, roughness: 80_000, terrain: "meadow" },
        { index: 0, x: -1, y: 0, elevation: 5, roughness: 5, terrain: "ridge" },
        { index: 0, x: 0, y: 0, elevation: 5, roughness: 5, terrain: "lava" },
      ],
    } as unknown as RockTerrain;
    const first = generateRockField(seed, malformed);
    const reversed = generateRockField(seed, {
      ...malformed,
      tiles: [...malformed.tiles].reverse(),
    });

    expect(first).toEqual(reversed);
    expect(first.width).toBe(4);
    expect(first.height).toBe(3);
    expect(first.obstacles).toEqual([]);
    expect(generateRockField(seed, { width: Number.NaN, height: 4, tiles: [] }))
      .toMatchObject({ width: 0, height: 0, obstacles: [], formations: [] });
    expect(generateRockField(seed, { width: 512, height: 512, tiles: [] }))
      .toMatchObject({ width: 512, height: 512, obstacles: [], formations: [] });
  });
});

describe("finite reusable ladder kit", () => {
  it("has bounded stable IDs and different fixed spans", () => {
    expect(createLadderKitState()).toEqual({
      version: 1,
      ladders: [
        { id: 1, maxSpan: 3, condition: FIXED_POINT, deployment: null },
        { id: 2, maxSpan: 4, condition: FIXED_POINT, deployment: null },
      ],
    });
    expect(createLadderKitState(999).ladders.map((ladder) => ladder.id)).toEqual([1, 2, 3, 4]);
    expect(createLadderKitState(-50).ladders).toEqual([]);
  });

  it("validates and deploys a supported cardinal span over one formation", () => {
    const state = createLadderKitState();
    const validation = validateLadderPlacement(
      syntheticContext(),
      state,
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    );

    expect(validation).toEqual({
      ok: true,
      reason: "available",
      ladderId: 1,
      deployment: {
        fromTileIndex: 5,
        toTileIndex: 8,
        orientation: "east-west",
        span: 3,
        pathTileIndices: [5, 6, 7, 8],
        obstacleIds: [7, 8],
        formationId: 7,
        support: 930_000,
      },
    });
    const result = deployLadder(
      syntheticContext(),
      state,
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    );
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("deployed");
    expect(result.state.ladders[0]?.id).toBe(1);
    expect(result.state.ladders[0]?.deployment).toEqual(validation.deployment);
    expect(state.ladders[0]?.deployment).toBeNull();
  });

  it.each([
    [{ ladderId: 99, fromTileIndex: 5, toTileIndex: 8 }, {}, "ladder-not-found"],
    [{ ladderId: 1, fromTileIndex: -1, toTileIndex: 8 }, {}, "invalid-endpoint"],
    [{ ladderId: 1, fromTileIndex: 5, toTileIndex: 2 }, {}, "not-cardinal"],
    [{ ladderId: 1, fromTileIndex: 5, toTileIndex: 6 }, {}, "span-too-short"],
    [{ ladderId: 1, fromTileIndex: 5, toTileIndex: 9 }, {}, "span-too-long"],
    [{ ladderId: 1, fromTileIndex: 5, toTileIndex: 8 }, { occupiedTileIndices: [6] }, "occupied"],
    [{ ladderId: 1, fromTileIndex: 0, toTileIndex: 2 }, {}, "no-rock-crossing"],
  ] as const)("rejects invalid placement with %s as %s", (request, overrides, reason) => {
    expect(validateLadderPlacement(syntheticContext(overrides), createLadderKitState(), request).reason)
      .toBe(reason);
  });

  it("rejects unsupported ends, mixed formations, and overlapping deployments", () => {
    const unsupported = syntheticContext({
      terrain: syntheticTerrain({ 5: "deep-water" }),
    });
    expect(validateLadderPlacement(
      unsupported,
      createLadderKitState(),
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).reason).toBe("unsupported-endpoint");

    const mixed = syntheticContext({
      rocks: syntheticRocks({ formationId: 99 }),
    });
    // Give only the second obstacle a different component ID.
    const mixedRocks: RockField = {
      ...mixed.rocks,
      obstacles: mixed.rocks.obstacles.map((rock, index) => index === 1
        ? { ...rock, formationId: 100 }
        : rock),
    };
    expect(validateLadderPlacement(
      { ...mixed, rocks: mixedRocks },
      createLadderKitState(),
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).reason).toBe("mixed-formation");

    const deployed = deployLadder(
      syntheticContext(),
      createLadderKitState(),
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).state;
    expect(validateLadderPlacement(
      syntheticContext(),
      deployed,
      { ladderId: 2, fromTileIndex: 5, toTileIndex: 8 },
    ).reason).toBe("overlaps-ladder");
  });

  it("only reclaims at an unoccupied endpoint and retains ID and wear", () => {
    const deployed = deployLadder(
      syntheticContext(),
      createLadderKitState(),
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).state;
    const worn = damageLadder(deployed, 1, 175_000).state;

    expect(reclaimLadder(worn, { ladderId: 1, actorTileIndex: 6 }).reason)
      .toBe("not-at-endpoint");
    expect(reclaimLadder(worn, {
      ladderId: 1,
      actorTileIndex: 5,
      crossingOccupied: true,
    }).reason).toBe("crossing-occupied");
    const reclaimed = reclaimLadder(worn, { ladderId: 1, actorTileIndex: 8 });
    expect(reclaimed.ok).toBe(true);
    expect(reclaimed.ladder).toEqual({
      id: 1,
      maxSpan: 3,
      condition: 825_000,
      deployment: null,
    });
    expect(reclaimed.state.ladders.map((ladder) => ladder.id)).toEqual([1, 2]);
  });

  it("rejects malformed wear without mutating state", () => {
    const state = createLadderKitState();
    expect(damageLadder(state, 1, Number.NaN)).toMatchObject({
      ok: false,
      reason: "invalid-damage",
      state,
    });
    expect(damageLadder(state, 1, -1).reason).toBe("invalid-damage");
    expect(damageLadder(state, 99, 10).reason).toBe("ladder-not-found");
    expect(state.ladders[0]?.condition).toBe(FIXED_POINT);
  });

  it("fails closed instead of throwing on malformed action payloads", () => {
    const state = createLadderKitState();
    expect(validateLadderPlacement(
      null as never,
      state,
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).reason).toBe("invalid-endpoint");
    expect(validateLadderPlacement(
      syntheticContext(),
      state,
      null as never,
    ).reason).toBe("ladder-not-found");
    expect(deployLadder(
      syntheticContext(),
      {} as never,
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).reason).toBe("ladder-not-found");
    expect(reclaimLadder(state, null as never).reason).toBe("ladder-not-found");
  });
});

describe("authoritative rock crossing query", () => {
  it("makes a wall passable and deterministically reduces risk/cost on the deployed edge", () => {
    const field = syntheticRocks();
    const deployed = deployLadder(
      syntheticContext({ rocks: field }),
      createLadderKitState(),
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).state;

    expect(queryRockCrossing(field, deployed, 5, 6)).toEqual({
      valid: true,
      fromTileIndex: 5,
      toTileIndex: 6,
      obstacleIds: [7],
      baseWalkingBlocked: true,
      baseHighRisk: true,
      baseFallRiskPermille: 800,
      baseTravelCostPermille: 5_200,
      ladderId: 1,
      ladderSupport: 930_000,
      passable: true,
      highRisk: false,
      fallRiskPermille: 204,
      travelCostPermille: 2_545,
    });
    expect(queryRockCrossing(field, deployed, 6, 5)).toEqual({
      ...queryRockCrossing(field, deployed, 5, 6),
      fromTileIndex: 6,
      toTileIndex: 5,
    });
  });

  it("does not help a sideways approach to the same obstacle", () => {
    const field = syntheticRocks();
    const deployed = deployLadder(
      syntheticContext({ rocks: field }),
      createLadderKitState(),
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).state;
    expect(queryRockCrossing(field, deployed, 1, 6)).toMatchObject({
      valid: true,
      obstacleIds: [7],
      ladderId: null,
      passable: false,
      highRisk: true,
      fallRiskPermille: 800,
      travelCostPermille: 5_200,
    });
  });

  it("loses its benefit when wear drops effective support below the safe threshold", () => {
    const field = syntheticRocks();
    const deployed = deployLadder(
      syntheticContext({ rocks: field }),
      createLadderKitState(),
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).state;
    const worn = damageLadder(deployed, 1, 700_000).state;

    expect(queryRockCrossing(field, worn, 5, 6)).toMatchObject({
      ladderId: null,
      ladderSupport: 300_000,
      passable: false,
      fallRiskPermille: 800,
      travelCostPermille: 5_200,
    });
  });

  it("returns neutral ground and fails closed on invalid movement edges", () => {
    const field = syntheticRocks();
    expect(queryRockCrossing(field, createLadderKitState(), 0, 1)).toMatchObject({
      valid: true,
      obstacleIds: [],
      passable: true,
      fallRiskPermille: 0,
      travelCostPermille: 1_000,
    });
    expect(queryRockCrossing(field, createLadderKitState(), 0, 2)).toMatchObject({
      valid: false,
      passable: false,
    });
    expect(queryRockCrossing(field, {} as never, 5, 6)).toMatchObject({
      valid: true,
      ladderId: null,
      passable: false,
    });
    expect(queryRockCrossing(null as never, createLadderKitState(), 5, 6)).toMatchObject({
      valid: false,
      passable: false,
    });
  });
});
