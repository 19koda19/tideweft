import { describe, expect, it } from "vitest";

import {
  createLadderKitState,
  damageLadder,
  deployLadder,
  generateRockField,
  queryRockCrossing,
  querySweptRockCrossing,
  reclaimLadder,
  rockObstacleAt,
  validateLadderPlacement,
  type LadderKitState,
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

function rockFieldWith(...obstacles: readonly RockObstacle[]): RockField {
  return {
    version: 1,
    width: 5,
    height: 3,
    obstacles,
    formations: [],
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

function cardinalComponents(
  tileIndices: readonly number[],
  width: number,
): number[][] {
  const remaining = new Set(tileIndices);
  const components: number[][] = [];
  for (const start of [...remaining].sort((left, right) => left - right)) {
    if (!remaining.delete(start)) continue;
    const component = [start];
    const frontier = [start];
    for (let cursor = 0; cursor < frontier.length; cursor += 1) {
      const tileIndex = frontier[cursor];
      if (tileIndex === undefined) continue;
      const x = tileIndex % width;
      const neighbors = [
        tileIndex - width,
        tileIndex + width,
        ...(x > 0 ? [tileIndex - 1] : []),
        ...(x + 1 < width ? [tileIndex + 1] : []),
      ];
      for (const neighbor of neighbors) {
        if (!remaining.delete(neighbor)) continue;
        frontier.push(neighbor);
        component.push(neighbor);
      }
    }
    components.push(component.sort((left, right) => left - right));
  }
  return components.sort((left, right) => (left[0] ?? 0) - (right[0] ?? 0));
}

function validLadderRequest(
  terrain: RockTerrain,
  rocks: RockField,
): { ladderId: number; fromTileIndex: number; toTileIndex: number } | null {
  const state = createLadderKitState();
  for (const rock of rocks.obstacles) {
    const x = rock.tileIndex % rocks.width;
    const y = Math.floor(rock.tileIndex / rocks.width);
    const requests = [
      ...(x > 0 && x + 1 < rocks.width
        ? [{ ladderId: 1, fromTileIndex: rock.tileIndex - 1, toTileIndex: rock.tileIndex + 1 }]
        : []),
      ...(y > 0 && y + 1 < rocks.height
        ? [{ ladderId: 1, fromTileIndex: rock.tileIndex - rocks.width,
            toTileIndex: rock.tileIndex + rocks.width }]
        : []),
    ];
    for (const request of requests) {
      if (validateLadderPlacement({ terrain, rocks }, state, request).ok) return request;
    }
  }
  return null;
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

  it("canonicalizes protected sets without removing unprotected geology", () => {
    const seed = seedFromText("harbor stones stay beyond the bollards");
    const terrain = generateTerrain(seed);
    const base = generateRockField(seed, terrain);
    const protectedTiles = base.obstacles.slice(0, 4).map((rock) => rock.tileIndex);
    const firstProtected = protectedTiles[0];
    const secondProtected = protectedTiles[1];
    const thirdProtected = protectedTiles[2];
    const fourthProtected = protectedTiles[3];
    if (firstProtected === undefined
      || secondProtected === undefined
      || thirdProtected === undefined
      || fourthProtected === undefined) {
      throw new Error("test world should contain four protectable rocks");
    }
    const noisy: number[] = [
      thirdProtected,
      Number.NaN,
      firstProtected,
      thirdProtected,
      -1,
      terrain.width * terrain.height,
      fourthProtected,
      1.25,
      secondProtected,
    ];
    const forward = generateRockField(seed, terrain, {
      protectedTileIndices: noisy,
    });
    const reversed = generateRockField(seed, terrain, {
      protectedTileIndices: [...noisy].reverse(),
    });
    const protectedSet = new Set(protectedTiles);

    expect(reversed).toEqual(forward);
    expect(generateRockField(seed, terrain, {
      protectedTileIndices: [...protectedTiles, ...protectedTiles],
    })).toEqual(forward);
    expect(forward.obstacles.map((rock) => rock.tileIndex)).toEqual(
      base.obstacles
        .map((rock) => rock.tileIndex)
        .filter((tileIndex) => !protectedSet.has(tileIndex)),
    );
    for (const tileIndex of protectedTiles) {
      expect(rockObstacleAt(forward, tileIndex)).toBeNull();
    }
    expect(generateRockField(seed, terrain, {
      protectedTileIndices: [-1, Number.NaN, 1.5, terrain.width * terrain.height],
    })).toEqual(base);
    expect(generateRockField(seed, terrain, {
      protectedTileIndices: "forged" as never,
    })).toEqual(base);
  });

  it("rebuilds split formations from preserved neighbors with stable lowest IDs", () => {
    let fixture: {
      seed: ReturnType<typeof seedFromText>;
      terrain: ReturnType<typeof generateTerrain>;
      field: RockField;
      protectedTileIndex: number;
      originalTileIndices: readonly number[];
      expectedComponents: readonly number[][];
    } | null = null;
    for (let seedIndex = 0; seedIndex < 32 && fixture === null; seedIndex += 1) {
      const seed = seedFromText(`protected-articulation-${seedIndex}`);
      const terrain = generateTerrain(seed);
      const field = generateRockField(seed, terrain);
      for (const formation of field.formations) {
        if (formation.tileIndices.length < 3) continue;
        for (const protectedTileIndex of formation.tileIndices) {
          const remaining = formation.tileIndices.filter(
            (tileIndex) => tileIndex !== protectedTileIndex,
          );
          const components = cardinalComponents(remaining, field.width);
          if (components.length < 2) continue;
          fixture = {
            seed,
            terrain,
            field,
            protectedTileIndex,
            originalTileIndices: formation.tileIndices,
            expectedComponents: components,
          };
          break;
        }
        if (fixture !== null) break;
      }
    }
    if (fixture === null) throw new Error("deterministic sample should contain an articulation rock");

    const carved = generateRockField(fixture.seed, fixture.terrain, {
      protectedTileIndices: [fixture.protectedTileIndex],
    });
    const originalSet = new Set(fixture.originalTileIndices);
    const rebuilt = carved.formations
      .filter((formation) => formation.tileIndices.some((tileIndex) => originalSet.has(tileIndex)))
      .map((formation) => [...formation.tileIndices]);

    expect(rockObstacleAt(carved, fixture.protectedTileIndex)).toBeNull();
    expect(carved.obstacles.map((rock) => rock.tileIndex)).toEqual(
      fixture.field.obstacles
        .map((rock) => rock.tileIndex)
        .filter((tileIndex) => tileIndex !== fixture?.protectedTileIndex),
    );
    expect(rebuilt).toEqual(fixture.expectedComponents);
    for (const formation of carved.formations) {
      expect(formation.id).toBe(Math.min(...formation.obstacleIds));
      for (const obstacleId of formation.obstacleIds) {
        expect(carved.obstacles.find((rock) => rock.id === obstacleId)?.formationId)
          .toBe(formation.id);
      }
    }
  });

  it("keeps a protected harbor, spawn aperture, and established route physically open", () => {
    const seed = seedFromText("the harbor road is older than the cliff");
    const terrain = generateTerrain(seed);
    const base = generateRockField(seed, terrain);
    const harborRock = base.obstacles[0];
    if (harborRock === undefined) throw new Error("test world should contain harbor-side rock");
    const harborRow = Math.floor(harborRock.tileIndex / base.width);
    const route = Array.from(
      { length: base.width },
      (_, column) => harborRow * base.width + column,
    );
    const harborColumn = harborRock.tileIndex % base.width;
    const spawnAperture = [-1, 0, 1].flatMap((deltaY) =>
      [-1, 0, 1].flatMap((deltaX) => {
        const x = harborColumn + deltaX;
        const y = harborRow + deltaY;
        return x >= 0 && x < base.width && y >= 0 && y < base.height
          ? [y * base.width + x]
          : [];
      }));
    const protectedTiles = [...route, harborRock.tileIndex, ...spawnAperture];
    const protectedSet = new Set(protectedTiles);
    const carved = generateRockField(seed, terrain, { protectedTileIndices: protectedTiles });
    const kit = createLadderKitState(0);

    expect(base.obstacles.some((rock) => protectedSet.has(rock.tileIndex))).toBe(true);
    expect(carved.obstacles.map((rock) => rock.tileIndex)).toEqual(
      base.obstacles
        .map((rock) => rock.tileIndex)
        .filter((tileIndex) => !protectedSet.has(tileIndex)),
    );
    for (const tileIndex of protectedSet) {
      expect(rockObstacleAt(carved, tileIndex)).toBeNull();
    }
    for (let index = 1; index < route.length; index += 1) {
      const fromTileIndex = route[index - 1];
      const toTileIndex = route[index];
      if (fromTileIndex === undefined || toTileIndex === undefined) continue;
      const playerQuery = queryRockCrossing(carved, kit, fromTileIndex, toTileIndex);
      const porterQuery = queryRockCrossing(carved, kit, fromTileIndex, toTileIndex);
      expect(playerQuery).toEqual(porterQuery);
      expect(playerQuery).toMatchObject({
        valid: true,
        obstacleIds: [],
        passable: true,
        fallRiskPermille: 0,
        travelCostPermille: 1_000,
      });
    }
  });

  it("keeps ladder validation authoritative after geology is filtered", () => {
    let fixture: {
      seed: ReturnType<typeof seedFromText>;
      terrain: ReturnType<typeof generateTerrain>;
      field: RockField;
      request: NonNullable<ReturnType<typeof validLadderRequest>>;
    } | null = null;
    for (let seedIndex = 0; seedIndex < 16 && fixture === null; seedIndex += 1) {
      const seed = seedFromText(`protected-ladder-${seedIndex}`);
      const terrain = generateTerrain(seed);
      const field = generateRockField(seed, terrain);
      const request = validLadderRequest(terrain, field);
      if (request !== null) fixture = { seed, terrain, field, request };
    }
    if (fixture === null) throw new Error("deterministic sample should contain a ladder crossing");
    const initial = validateLadderPlacement(
      { terrain: fixture.terrain, rocks: fixture.field },
      createLadderKitState(),
      fixture.request,
    );
    if (!initial.ok || initial.deployment === null) {
      throw new Error("fixture ladder should validate before protection");
    }
    const unrelated = fixture.field.obstacles.find(
      (rock) => rock.formationId !== initial.deployment?.formationId,
    );
    if (unrelated === undefined) throw new Error("fixture should contain unrelated geology");
    const unrelatedCarve = generateRockField(fixture.seed, fixture.terrain, {
      protectedTileIndices: [unrelated.tileIndex],
    });
    expect(rockObstacleAt(unrelatedCarve, unrelated.tileIndex)).toBeNull();
    expect(validateLadderPlacement(
      { terrain: fixture.terrain, rocks: unrelatedCarve },
      createLadderKitState(),
      fixture.request,
    )).toMatchObject({ ok: true, reason: "available" });

    const protectedTileIndices = initial.deployment.obstacleIds.map((id) => id - 1);
    const carved = generateRockField(fixture.seed, fixture.terrain, { protectedTileIndices });
    const after = validateLadderPlacement(
      { terrain: fixture.terrain, rocks: carved },
      createLadderKitState(),
      fixture.request,
    );

    expect(after).toMatchObject({ ok: false, reason: "no-rock-crossing" });
    for (const tileIndex of protectedTileIndices) {
      expect(rockObstacleAt(carved, tileIndex)).toBeNull();
    }
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

  it("accepts positive crafted gear IDs outside the starter kit's item-count bound", () => {
    const state: LadderKitState = {
      version: 1,
      ladders: [{
        id: 7,
        maxSpan: 99,
        condition: FIXED_POINT,
        deployment: null,
      }],
    };
    const validation = validateLadderPlacement(
      syntheticContext(),
      state,
      { ladderId: 7, fromTileIndex: 5, toTileIndex: 8 },
    );
    const deployed = deployLadder(
      syntheticContext(),
      state,
      { ladderId: 7, fromTileIndex: 5, toTileIndex: 8 },
    );

    expect(validation).toMatchObject({ ok: true, ladderId: 7 });
    expect(deployed).toMatchObject({
      ok: true,
      ladder: { id: 7, maxSpan: 3, condition: FIXED_POINT },
    });
    expect(deployed.state.ladders.map((ladder) => ladder.id)).toEqual([7]);
  });

  it("keeps environmental support separate from condition as an intact ladder wears", () => {
    const state: LadderKitState = {
      version: 1,
      ladders: [{
        id: 7,
        maxSpan: 3,
        condition: 250_000,
        deployment: null,
      }],
    };
    const deployed = deployLadder(
      syntheticContext(),
      state,
      { ladderId: 7, fromTileIndex: 5, toTileIndex: 8 },
    );
    expect(deployed).toMatchObject({
      ok: true,
      ladder: {
        id: 7,
        condition: 250_000,
        deployment: { support: 930_000 },
      },
    });

    // The existing service quote spends 60k on placement. Applying that wear
    // must make this crossing dangerous, not make the physical ladder vanish.
    const afterPlacementWear = damageLadder(deployed.state, 7, 60_000).state;
    expect(queryRockCrossing(syntheticRocks(), afterPlacementWear, 5, 6)).toMatchObject({
      ladderId: 7,
      ladderSupport: 176_700,
      passable: true,
      highRisk: true,
      fallRiskPermille: 687,
      travelCostPermille: 4_696,
    });
    expect(afterPlacementWear.ladders[0]?.deployment?.support).toBe(930_000);

    const broken = damageLadder(afterPlacementWear, 7, 190_000).state;
    expect(queryRockCrossing(syntheticRocks(), broken, 5, 6)).toMatchObject({
      ladderId: null,
      ladderSupport: 0,
      passable: false,
    });
  });

  it("gates setup condition and environmental support independently", () => {
    const wornState: LadderKitState = {
      version: 1,
      ladders: [{ id: 7, maxSpan: 3, condition: 249_999, deployment: null }],
    };
    expect(validateLadderPlacement(
      syntheticContext(),
      wornState,
      { ladderId: 7, fromTileIndex: 5, toTileIndex: 8 },
    ).reason).toBe("condition-too-low");

    const softEnds = syntheticContext({
      terrain: syntheticTerrain({ 5: "tidal-flat", 8: "tidal-flat" }),
    });
    expect(validateLadderPlacement(
      softEnds,
      createLadderKitState(),
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).reason).toBe("support-too-low");
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

  it("retains a risky physical crossing while worn and loses it only when fully broken", () => {
    const field = syntheticRocks();
    const deployed = deployLadder(
      syntheticContext({ rocks: field }),
      createLadderKitState(),
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).state;
    const worn = damageLadder(deployed, 1, 700_000).state;

    expect(queryRockCrossing(field, worn, 5, 6)).toMatchObject({
      ladderId: 1,
      ladderSupport: 279_000,
      passable: true,
      highRisk: true,
      fallRiskPermille: 621,
      travelCostPermille: 4_406,
    });
  });

  it("rejects malformed, forged, and fully broken saved deployments as traversal aids", () => {
    const field = syntheticRocks();
    const deployed = deployLadder(
      syntheticContext({ rocks: field }),
      createLadderKitState(),
      { ladderId: 1, fromTileIndex: 5, toTileIndex: 8 },
    ).state;
    const original = deployed.ladders[0];
    const deployment = original?.deployment;
    if (original === undefined || deployment === null || deployment === undefined) {
      throw new Error("test deployment should exist");
    }
    const stateWith = (
      ladder: LadderKitState["ladders"][number],
    ): LadderKitState => ({ version: 1, ladders: [ladder] });
    const malformedCondition = stateWith({ ...original, condition: Number.NaN });
    const malformedSupport = stateWith({
      ...original,
      deployment: { ...deployment, support: 930_000.5 },
    });
    const forgedPath = stateWith({
      ...original,
      deployment: { ...deployment, pathTileIndices: [5, 6, 12, 8] },
    });
    const forgedObstacles = stateWith({
      ...original,
      deployment: { ...deployment, obstacleIds: [7, 999] },
    });
    const broken = stateWith({ ...original, condition: 0 });

    for (const state of [
      malformedCondition,
      malformedSupport,
      forgedPath,
      forgedObstacles,
      broken,
    ]) {
      expect(queryRockCrossing(field, state, 5, 6)).toMatchObject({
        ladderId: null,
        ladderSupport: 0,
        passable: false,
        highRisk: true,
        fallRiskPermille: 800,
      });
    }
  });

  it("turns malformed rock records into an explicit blocking obstacle", () => {
    const malformed = {
      version: 1,
      width: 5,
      height: 3,
      obstacles: [{ tileIndex: 1, walkingBlocked: false }],
      formations: [],
    } as unknown as RockField;

    expect(queryRockCrossing(malformed, createLadderKitState(0), 0, 1)).toEqual({
      valid: true,
      fromTileIndex: 0,
      toTileIndex: 1,
      obstacleIds: [-2],
      baseWalkingBlocked: true,
      baseHighRisk: true,
      baseFallRiskPermille: 950,
      baseTravelCostPermille: 6_000,
      ladderId: null,
      ladderSupport: 0,
      passable: false,
      highRisk: true,
      fallRiskPermille: 950,
      travelCostPermille: 6_000,
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

describe("swept rock-edge traversal", () => {
  const emptyField = rockFieldWith();
  const noLadders = createLadderKitState(0);

  const edgeTrace = (result: ReturnType<typeof querySweptRockCrossing>) =>
    result.edges.map((edge) => ({
      axis: edge.axis,
      from: edge.effect.fromTileIndex,
      to: edge.effect.toTileIndex,
      passable: edge.effect.passable,
    }));

  it("resolves an exact diagonal corner X-before-Y and stops at the first blocked edge", () => {
    const xWall = obstacle({ id: 2, formationId: 2, tileIndex: 1 });
    const result = querySweptRockCrossing(
      rockFieldWith(xWall),
      noLadders,
      {
        from: { x: 500, y: 500 },
        to: { x: 1_500, y: 1_500 },
        tileUnits: 1_000,
      },
    );

    expect(result).toMatchObject({
      valid: true,
      fromTileIndex: 0,
      requestedTileIndex: 6,
      reachedTileIndex: 0,
      passable: false,
      blockedEdgeOrdinal: 0,
    });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      ordinal: 0,
      axis: "x",
      crossingTimeNumerator: 500,
      crossingTimeDenominator: 1_000,
      committed: false,
      effect: { fromTileIndex: 0, toTileIndex: 1, passable: false },
    });
  });

  it("orders non-tied diagonal boundaries by exact segment time", () => {
    const xFirst = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 750, y: 250 },
      to: { x: 1_250, y: 1_250 },
      tileUnits: 1_000,
    });
    const yFirst = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 250, y: 750 },
      to: { x: 1_250, y: 1_250 },
      tileUnits: 1_000,
    });

    expect(xFirst.edges.map((edge) => edge.axis)).toEqual(["x", "y"]);
    expect(xFirst.edges.map((edge) => [
      edge.effect.fromTileIndex,
      edge.effect.toTileIndex,
    ])).toEqual([[0, 1], [1, 6]]);
    expect(yFirst.edges.map((edge) => edge.axis)).toEqual(["y", "x"]);
    expect(yFirst.edges.map((edge) => [
      edge.effect.fromTileIndex,
      edge.effect.toTileIndex,
    ])).toEqual([[0, 5], [5, 6]]);
    expect(xFirst).toMatchObject({ passable: true, reachedTileIndex: 6 });
    expect(yFirst).toMatchObject({ passable: true, reachedTileIndex: 6 });
  });

  it("cannot bypass a wall on the first Y edge of a diagonal segment", () => {
    const yWall = obstacle({ id: 6, formationId: 6, tileIndex: 5 });
    const result = querySweptRockCrossing(
      rockFieldWith(yWall),
      noLadders,
      {
        from: { x: 250, y: 750 },
        to: { x: 1_250, y: 1_250 },
        tileUnits: 1_000,
      },
    );

    expect(result).toMatchObject({
      passable: false,
      reachedTileIndex: 0,
      blockedEdgeOrdinal: 0,
    });
    expect(result.edges.map((edge) => edge.axis)).toEqual(["y"]);
    expect(result.edges[0]?.effect).toMatchObject({
      fromTileIndex: 0,
      toTileIndex: 5,
      obstacleIds: [6],
      passable: false,
    });
  });

  it("commits the first corner edge but not a blocked second edge", () => {
    const result = querySweptRockCrossing(
      syntheticRocks(),
      noLadders,
      {
        from: { x: 500, y: 500 },
        to: { x: 1_500, y: 1_500 },
        tileUnits: 1_000,
      },
    );

    expect(result).toMatchObject({
      passable: false,
      reachedTileIndex: 1,
      blockedEdgeOrdinal: 1,
    });
    expect(result.edges.map((edge) => ({
      axis: edge.axis,
      from: edge.effect.fromTileIndex,
      to: edge.effect.toTileIndex,
      committed: edge.committed,
    }))).toEqual([
      { axis: "x", from: 0, to: 1, committed: true },
      { axis: "y", from: 1, to: 6, committed: false },
    ]);
  });

  it("enumerates every cardinal edge of a high-speed segment exactly once", () => {
    const result = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 500, y: 500 },
      to: { x: 4_500, y: 2_500 },
      tileUnits: 1_000,
    });

    expect(result).toMatchObject({
      valid: true,
      requestedTileIndex: 14,
      reachedTileIndex: 14,
      passable: true,
      blockedEdgeOrdinal: null,
    });
    expect(result.edges.map((edge) => edge.axis)).toEqual(["x", "y", "x", "x", "y", "x"]);
    expect(result.edges.map((edge) => [
      edge.effect.fromTileIndex,
      edge.effect.toTileIndex,
    ])).toEqual([[0, 1], [1, 6], [6, 7], [7, 8], [8, 13], [13, 14]]);
    expect(result.edges.every((edge) => edge.committed)).toBe(true);
    expect(new Set(result.edges.map((edge) =>
      `${edge.effect.fromTileIndex}>${edge.effect.toTileIndex}`)).size)
      .toBe(result.edges.length);
  });

  it("is partition-invariant for cardinal and diagonal movement", () => {
    const cardinal = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 500, y: 500 },
      to: { x: 4_500, y: 500 },
      tileUnits: 1_000,
    });
    const cardinalLeft = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 500, y: 500 },
      to: { x: 2_000, y: 500 },
      tileUnits: 1_000,
    });
    const cardinalRight = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 2_000, y: 500 },
      to: { x: 4_500, y: 500 },
      tileUnits: 1_000,
    });
    expect([...edgeTrace(cardinalLeft), ...edgeTrace(cardinalRight)])
      .toEqual(edgeTrace(cardinal));

    const diagonal = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 500, y: 500 },
      to: { x: 4_500, y: 2_500 },
      tileUnits: 1_000,
    });
    const diagonalLeft = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 500, y: 500 },
      to: { x: 2_500, y: 1_500 },
      tileUnits: 1_000,
    });
    const diagonalRight = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 2_500, y: 1_500 },
      to: { x: 4_500, y: 2_500 },
      tileUnits: 1_000,
    });
    expect([...edgeTrace(diagonalLeft), ...edgeTrace(diagonalRight)])
      .toEqual(edgeTrace(diagonal));
    expect(new Set(diagonal.edges.map((edge) =>
      `${edge.effect.fromTileIndex}>${edge.effect.toTileIndex}`)).size)
      .toBe(diagonal.edges.length);
  });

  it("matches the direct cardinal contract for every committed swept edge", () => {
    const field = rockFieldWith(obstacle({
      id: 13,
      formationId: 13,
      tileIndex: 12,
      severity: "ledge",
      walkingBlocked: false,
      fallRiskPermille: 430,
      travelCostPermille: 2_850,
    }));
    const result = querySweptRockCrossing(field, noLadders, {
      from: { x: 500, y: 500 },
      to: { x: 4_500, y: 2_500 },
      tileUnits: 1_000,
    });

    for (const edge of result.edges) {
      expect(edge.effect).toEqual(queryRockCrossing(
        field,
        noLadders,
        edge.effect.fromTileIndex,
        edge.effect.toTileIndex,
      ));
    }
  });

  it("matches the cardinal query and fails closed on malformed segments", () => {
    const field = syntheticRocks();
    const direct = queryRockCrossing(field, noLadders, 5, 6);
    const swept = querySweptRockCrossing(field, noLadders, {
      from: { x: 500, y: 1_500 },
      to: { x: 1_500, y: 1_500 },
      tileUnits: 1_000,
    });
    expect(swept.edges[0]?.effect).toEqual(direct);
    expect(swept).toMatchObject({
      valid: true,
      reachedTileIndex: 5,
      passable: false,
    });

    expect(querySweptRockCrossing(field, noLadders, {
      from: { x: -1, y: 1_500 },
      to: { x: 1_500, y: 1_500 },
      tileUnits: 1_000,
    })).toEqual({
      valid: false,
      fromTileIndex: null,
      requestedTileIndex: null,
      reachedTileIndex: null,
      passable: false,
      blockedEdgeOrdinal: null,
      edges: [],
    });

    for (const malformed of [
      { from: null, to: { x: 1, y: 1 }, tileUnits: 1_000 },
      { from: { x: 1, y: 1 }, to: null, tileUnits: 1_000 },
      { from: { x: Number.NaN, y: 1 }, to: { x: 2, y: 2 }, tileUnits: 1_000 },
      { from: { x: 1, y: 1 }, to: { x: 2, y: 2 }, tileUnits: 1.5 },
      { from: { x: 1, y: 1 }, to: { x: 2, y: 2 }, tileUnits: Number.MAX_SAFE_INTEGER },
    ]) {
      expect(querySweptRockCrossing(field, noLadders, malformed as never))
        .toMatchObject({ valid: false, passable: false, edges: [] });
    }
  });

  it("uses exact rational ordering with very large safe local coordinates", () => {
    const tileUnits = Math.floor(Number.MAX_SAFE_INTEGER / 5);
    const result = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: tileUnits - 1, y: Math.floor(tileUnits / 2) },
      to: { x: tileUnits * 5 - 1, y: Math.floor(tileUnits / 2) },
      tileUnits,
    });

    expect(result).toMatchObject({
      valid: true,
      fromTileIndex: 0,
      requestedTileIndex: 4,
      reachedTileIndex: 4,
      passable: true,
    });
    expect(result.edges).toHaveLength(4);
    expect(result.edges.map((edge) => [
      edge.effect.fromTileIndex,
      edge.effect.toTileIndex,
    ])).toEqual([[0, 1], [1, 2], [2, 3], [3, 4]]);
    expect(result.edges.every((edge) => Number.isSafeInteger(edge.crossingTimeNumerator)))
      .toBe(true);
  });

  it("traces reverse movement and treats an in-tile segment as an empty legal quote", () => {
    const reverse = querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 4_500, y: 2_500 },
      to: { x: 500, y: 500 },
      tileUnits: 1_000,
    });
    expect(reverse.edges.map((edge) => edge.axis)).toEqual(["x", "y", "x", "x", "y", "x"]);
    expect(reverse.edges.map((edge) => [
      edge.effect.fromTileIndex,
      edge.effect.toTileIndex,
    ])).toEqual([[14, 13], [13, 8], [8, 7], [7, 6], [6, 1], [1, 0]]);
    expect(reverse).toMatchObject({
      fromTileIndex: 14,
      requestedTileIndex: 0,
      reachedTileIndex: 0,
      passable: true,
    });

    expect(querySweptRockCrossing(emptyField, noLadders, {
      from: { x: 101, y: 202 },
      to: { x: 999, y: 998 },
      tileUnits: 1_000,
    })).toMatchObject({
      valid: true,
      fromTileIndex: 0,
      requestedTileIndex: 0,
      reachedTileIndex: 0,
      passable: true,
      edges: [],
    });
  });
});
