import { describe, expect, it } from "vitest";

import { generateRegionTerrain, regionTerrainHash } from "../sim/regionTerrain";
import { seedFromText, type RootSeed } from "../sim/rng";
import { createRegionCoord, stableRegionObjectId, type RegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import { setCoreEcologyAggregatePatchMaterializedActors } from "./coreEcology";
import { projectCoreEcologyActivity } from "./coreEcologyActivity";
import {
  isTrustedCoreEcologyAlpineRidgeActivityAuthority,
  projectCoreEcologyAlpineRidgeActivityAuthority,
} from "./coreEcologyAlpineRidgeActivity";
import { deriveCoreEcologyAlpineHabitat } from "./coreEcologyAlpineHabitat";
import {
  isTrustedCoreEcologyRidgeActivityAuthority,
  type CoreEcologyRidgeActivityAnchor,
  type CoreEcologyRidgeActivityAuthorityV1,
} from "./coreEcologyRidgeActivityAuthority";
import { createCoreEcologyAlpineResidentPatch } from "./regionalAlpineResidents";
import { WORLD_POSITION_UNITS_PER_TILE } from "./worldPosition";

const SEED = seedFromText("alpine resident property");
const REGION = createRegionCoord(-1, 0);
const GOAT_SEED = seedFromText("wave-f alpine origin");
const GOAT_REGION = createRegionCoord(0, -1);
const TILE_CENTER_OFFSET = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);

describe("canonical Alpine ridge activity projection", () => {
  it("world-binds every receipt anchor to canonical ridge terrain and drives day/rest activity", () => {
    const daylight = materializedEaglePatch(SEED, REGION, 360);
    const authority = projectCoreEcologyAlpineRidgeActivityAuthority({
      rootSeed: SEED,
      patch: daylight.patch,
      actorId: daylight.actorId,
    });
    const replay = projectCoreEcologyAlpineRidgeActivityAuthority({
      rootSeed: SEED,
      patch: daylight.patch,
      actorId: daylight.actorId,
    });
    if (authority === null || replay === null) {
      throw new Error("Canonical Alpine ridge authority fixture failed");
    }

    expect(isTrustedCoreEcologyRidgeActivityAuthority(authority)).toBe(true);
    expect(isTrustedCoreEcologyRidgeActivityAuthority(replay)).toBe(true);
    expect(isTrustedCoreEcologyAlpineRidgeActivityAuthority(authority)).toBe(true);
    expect(isTrustedCoreEcologyAlpineRidgeActivityAuthority(replay)).toBe(true);
    expect(stableStringify(replay)).toBe(stableStringify(authority));
    expect(authority).toMatchObject({
      sourceKey: daylight.patch.patchKey,
      actorId: daylight.actorId,
    });

    const eaglePopulation = daylight.habitat.populations.find(({ species }) => (
      species === "golden-eagle"
    ));
    const immutableAnchor = eaglePopulation?.anchors[daylight.populationOrdinal];
    if (immutableAnchor === undefined) throw new Error("Golden-eagle habitat anchor is absent");
    expect(authority.homeAnchor).toEqual({
      region: REGION,
      localX: immutableAnchor.localX * WORLD_POSITION_UNITS_PER_TILE + TILE_CENTER_OFFSET,
      localY: immutableAnchor.localY * WORLD_POSITION_UNITS_PER_TILE + TILE_CENTER_OFFSET,
    });

    const terrain = generateRegionTerrain(SEED, REGION);
    expect(regionTerrainHash(terrain)).toBe(daylight.habitat.terrainHash);
    for (const anchor of [authority.perchAnchor, ...authority.soarAnchors]) {
      expectCanonicalTerrainAnchor(anchor, terrain, SEED, REGION);
    }

    expect(projectCoreEcologyActivity(daylight.patch, {
      actorId: daylight.actorId,
      atTick: 360,
    }, authority)).toMatchObject({
      species: "golden-eagle",
      state: "ridge-soaring",
      presentationSignal: "ridge-soaring-flight",
      motion: {
        kind: "target-area",
        verb: "soar-ridge-loop",
        travelMedium: "air",
      },
    });

    const rest = materializedEaglePatch(SEED, REGION, 1_200);
    const restAuthority = projectCoreEcologyAlpineRidgeActivityAuthority({
      rootSeed: SEED,
      patch: rest.patch,
      actorId: rest.actorId,
    });
    if (restAuthority === null) throw new Error("Rest-window ridge authority fixture failed");
    const restProjection = projectCoreEcologyActivity(rest.patch, {
      actorId: rest.actorId,
      atTick: 1_200,
    }, restAuthority);
    expect(["perched", "seeking-ridge-perch"]).toContain(restProjection?.state);
    expect(restProjection?.perch.anchor).toEqual(restAuthority.perchAnchor.position);
    if (restProjection?.state === "seeking-ridge-perch") {
      expect(restProjection.motion).toMatchObject({
        kind: "target-area",
        verb: "seek-ridge-perch",
        travelMedium: "air",
        targetArea: { center: restAuthority.perchAnchor.position },
      });
    } else {
      expect(restProjection?.motion).toEqual({ kind: "hold-position" });
    }
  });

  it("fails closed for foreign worlds, non-eagles, aggregate pika IDs, and structural forgeries", () => {
    const fixture = materializedEaglePatch(SEED, REGION, 360);
    const authority = projectCoreEcologyAlpineRidgeActivityAuthority({
      rootSeed: SEED,
      patch: fixture.patch,
      actorId: fixture.actorId,
    });
    if (authority === null) throw new Error("Canonical Alpine ridge authority fixture failed");

    expect(projectCoreEcologyAlpineRidgeActivityAuthority({
      rootSeed: seedFromText("foreign Alpine ridge world"),
      patch: fixture.patch,
      actorId: fixture.actorId,
    })).toBeNull();
    expect(projectCoreEcologyAlpineRidgeActivityAuthority({
      rootSeed: SEED,
      patch: fixture.patch,
      actorId: `${fixture.actorId}-unknown`,
    })).toBeNull();

    const pikaAggregateId = fixture.patch.aggregatePopulations.find(({ species }) => (
      species === "american-pika"
    ))?.aggregateId;
    if (pikaAggregateId === undefined) throw new Error("Aggregate pika fixture is absent");
    expect(projectCoreEcologyAlpineRidgeActivityAuthority({
      rootSeed: SEED,
      patch: fixture.patch,
      actorId: pikaAggregateId,
    })).toBeNull();

    const goatHabitat = deriveCoreEcologyAlpineHabitat({
      seed: GOAT_SEED,
      region: GOAT_REGION,
    });
    const goatPatch = createCoreEcologyAlpineResidentPatch({
      seed: GOAT_SEED,
      habitat: goatHabitat,
      tick: 360,
    });
    const goatActorId = goatPatch.populations.find(({ species }) => species === "mountain-goat")
      ?.members[0]?.actor.identity.stableId;
    if (goatActorId === undefined) throw new Error("Mountain-goat fixture is absent");
    expect(projectCoreEcologyAlpineRidgeActivityAuthority({
      rootSeed: GOAT_SEED,
      patch: goatPatch,
      actorId: goatActorId,
    })).toBeNull();

    const forgedPatch = JSON.parse(stableStringify(fixture.patch)) as {
      derivation: { habitat: { terrainHash: string } };
    };
    forgedPatch.derivation.habitat.terrainHash = "0".repeat(32);
    expect(projectCoreEcologyAlpineRidgeActivityAuthority({
      rootSeed: SEED,
      patch: forgedPatch,
      actorId: fixture.actorId,
    })).toBeNull();

    const forgedReceipt = JSON.parse(
      stableStringify(authority),
    ) as CoreEcologyRidgeActivityAuthorityV1;
    expect(isTrustedCoreEcologyRidgeActivityAuthority(forgedReceipt)).toBe(false);
    expect(isTrustedCoreEcologyAlpineRidgeActivityAuthority(forgedReceipt)).toBe(false);
    expect(projectCoreEcologyActivity(fixture.patch, {
      actorId: fixture.actorId,
      atTick: 360,
    }, forgedReceipt)).toBeNull();
  });
});

function materializedEaglePatch(seed: RootSeed, region: RegionCoord, tick: number) {
  const habitat = deriveCoreEcologyAlpineHabitat({ seed, region });
  const coarse = createCoreEcologyAlpineResidentPatch({ seed, habitat, tick });
  const eagle = coarse.populations.find(({ species }) => species === "golden-eagle")
    ?.members[0];
  if (eagle === undefined) throw new Error("Golden-eagle fixture is absent");
  return Object.freeze({
    habitat,
    actorId: eagle.actor.identity.stableId,
    populationOrdinal: eagle.populationOrdinal,
    patch: setCoreEcologyAggregatePatchMaterializedActors(coarse, {
      actorIds: [eagle.actor.identity.stableId],
      atTick: tick,
    }),
  });
}

function expectCanonicalTerrainAnchor(
  anchor: CoreEcologyRidgeActivityAnchor,
  terrain: ReturnType<typeof generateRegionTerrain>,
  seed: RootSeed,
  region: RegionCoord,
): void {
  expect(anchor.position.region).toEqual(region);
  expect(anchor.position.localX % WORLD_POSITION_UNITS_PER_TILE).toBe(TILE_CENTER_OFFSET);
  expect(anchor.position.localY % WORLD_POSITION_UNITS_PER_TILE).toBe(TILE_CENTER_OFFSET);
  const tileX = Math.trunc(anchor.position.localX / WORLD_POSITION_UNITS_PER_TILE);
  const tileY = Math.trunc(anchor.position.localY / WORLD_POSITION_UNITS_PER_TILE);
  const tile = terrain.tiles.find(({ x, y }) => x === tileX && y === tileY);
  if (tile === undefined) throw new Error("Projected ridge anchor omitted canonical terrain");
  expect(tile.terrain).toBe("ridge");
  expect(anchor).toMatchObject({
    sourceTileKey: stableRegionObjectId(seed, region, "terrain-tile", tile.index),
    elevation: tile.elevation,
    roughness: tile.roughness,
  });
}
