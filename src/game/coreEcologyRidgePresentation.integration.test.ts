import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { createRegionCoord, regionLocalToGlobalTile } from "../sim/regions";
import {
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import { projectCoreEcologyAlpineRidgeActivityAuthority } from "./coreEcologyAlpineRidgeActivity";
import { deriveCoreEcologyAlpineHabitat } from "./coreEcologyAlpineHabitat";
import {
  projectCoreEcologyWildlife,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import {
  deriveCoreEcologyRidgeActivityAuthority,
  type CoreEcologyRidgeActivityAuthorityV1,
} from "./coreEcologyRidgeActivityAuthority";
import { evaluatePerception, type PerceptionCell } from "./perception";
import { createCoreEcologyAlpineResidentPatch } from "./regionalAlpineResidents";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
} from "./worldPosition";
import { projectWildlifePresentation } from "./wildlifePresentation";

export const ALPHA33_ALPINE_PRESENTATION_INVARIANTS_OWNER_INTENT =
  "test:alpha33-alpine-presentation-invariants:v1" as const;

const SEED = seedFromText("alpine resident property");
const REGION = createRegionCoord(-1, 0);
const HOME = createWorldPosition(REGION, 60_500, 60_500);

describe(`${ALPHA33_ALPINE_PRESENTATION_INVARIANTS_OWNER_INTENT} shared ridge activity presentation boundary`, () => {
  it("carries one trusted materialized ridge activity through direct presentation", () => {
    const patch = eaglePatch();
    const actor = patch.populations[0]?.members[0]?.actor;
    if (actor === undefined) throw new Error("Golden-eagle fixture is empty");
    const actorId = actor.identity.stableId;
    const authority = canonicalRidgeAuthority(patch, actorId);
    const window = runtimeWindow();
    const perception = directPerception(window, actor.address.position.localX, actor.address.position.localY);

    expect(projectCoreEcologyWildlife({
      patch,
      window,
      perception,
      tileSize: 16,
    })?.[0]).toMatchObject({
      actorId,
      species: "golden-eagle",
      behavior: "watch",
      behaviorLabel: "Watching",
    });
    const projected = projectCoreEcologyWildlife({
      patch,
      window,
      perception,
      tileSize: 16,
      activityAuthorities: [authority],
    });
    expect(projected).toHaveLength(1);
    expect(projected?.[0]).toMatchObject({
      actorId,
      species: "golden-eagle",
      behavior: "flight",
      behaviorLabel: "Soaring along the ridge",
    });
    expect(projectWildlifePresentation({
      actor,
      observation: { window, perception },
      tileSize: 16,
      activity: { patch, atTick: patch.updatedAtTick, authority },
    })).toMatchObject({
      actorId,
      behavior: "flight",
      behaviorLabel: "Soaring along the ridge",
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /authorityId|sourceKey|homeAnchor|perchAnchor|soarAnchors/iu,
    );
  });

  it("fails closed for copied, foreign-source, and foreign-actor ridge receipts", () => {
    const patch = eaglePatch();
    const actor = patch.populations[0]?.members[0]?.actor;
    if (actor === undefined) throw new Error("Golden-eagle fixture is empty");
    const actorId = actor.identity.stableId;
    const valid = canonicalRidgeAuthority(patch, actorId);
    const copied = structuredClone(valid);
    const generic = ridgeAuthority(patch.patchKey, actorId);
    const wrongSource = ridgeAuthority("ridge-presentation:foreign-source", actorId);
    const wrongActor = ridgeAuthority(patch.patchKey, `${actorId}-foreign`);
    const wrongRegion = ridgeAuthority(
      patch.patchKey,
      actorId,
      createWorldPosition(createRegionCoord(-18, 42), 60_500, 60_500),
    );
    const window = runtimeWindow();
    const perception = directPerception(window, actor.address.position.localX, actor.address.position.localY);

    for (const authority of [copied, generic, wrongSource, wrongActor, wrongRegion]) {
      expect(projectCoreEcologyWildlife({
        patch,
        window,
        perception,
        tileSize: 16,
        activityAuthorities: [authority],
      })).toBeNull();
      expect(projectWildlifePresentation({
        actor,
        observation: { window, perception },
        tileSize: 16,
        activity: { patch, atTick: patch.updatedAtTick, authority },
      })).toBeNull();
    }
  });
});

function eaglePatch(): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyAlpineHabitat({ seed: SEED, region: REGION });
  const patch = createCoreEcologyAlpineResidentPatch({ seed: SEED, habitat, tick: 360 });
  const actorId = patch.populations.find(({ species }) => species === "golden-eagle")
    ?.members[0]?.actor.identity.stableId;
  if (actorId === undefined) throw new Error("Golden-eagle fixture is absent");
  return setCoreEcologyAggregatePatchMaterializedActors(patch, {
    atTick: 360,
    actorIds: [actorId],
  });
}

function canonicalRidgeAuthority(
  patch: CoreEcologyAggregatePatchState,
  actorId: string,
): CoreEcologyRidgeActivityAuthorityV1 {
  const authority = projectCoreEcologyAlpineRidgeActivityAuthority({
    rootSeed: SEED,
    patch,
    actorId,
  });
  if (authority === null) throw new Error("Canonical ridge presentation authority failed");
  return authority;
}

function ridgeAuthority(
  sourceKey: string,
  actorId: string,
  homeAnchor = HOME,
): CoreEcologyRidgeActivityAuthorityV1 {
  const authority = deriveCoreEcologyRidgeActivityAuthority({
    sourceKey,
    actorId,
    homeAnchor,
    candidates: [
      ridgeCandidate(homeAnchor, "ridge-presentation:a", 3, 1, 800_000, 700_000),
      ridgeCandidate(homeAnchor, "ridge-presentation:b", 5, 2, 900_000, 300_000),
      ridgeCandidate(homeAnchor, "ridge-presentation:c", 7, 3, 900_000, 800_000),
    ],
  });
  if (authority === null) throw new Error("Ridge presentation authority fixture failed");
  return authority;
}

function ridgeCandidate(
  homeAnchor: typeof HOME,
  sourceTileKey: string,
  deltaTilesX: number,
  deltaTilesY: number,
  elevation: number,
  roughness: number,
) {
  return {
    sourceTileKey,
    position: translateWorldPosition(
      homeAnchor,
      deltaTilesX * WORLD_POSITION_UNITS_PER_TILE,
      deltaTilesY * WORLD_POSITION_UNITS_PER_TILE,
    ),
    terrain: "ridge" as const,
    elevation,
    roughness,
  };
}

function runtimeWindow(): CoreEcologyRuntimeWindow {
  return Object.freeze({
    origin: regionLocalToGlobalTile(REGION, 0, 0),
    terrain: {
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    },
  });
}

function directPerception(
  window: CoreEcologyRuntimeWindow,
  actorLocalX: number,
  actorLocalY: number,
) {
  const cells: PerceptionCell[] = Array.from(
    { length: REGIONAL_TRAVEL_COLUMNS * REGIONAL_TRAVEL_ROWS },
    () => ({ elevation: 0, obstruction: 0 }),
  );
  return evaluatePerception({
    columns: window.terrain.width,
    rows: window.terrain.height,
    cells,
    playerTileIndex: Math.trunc(actorLocalY / WORLD_POSITION_UNITS_PER_TILE)
      * REGIONAL_TRAVEL_COLUMNS
      + Math.trunc(actorLocalX / WORLD_POSITION_UNITS_PER_TILE),
    facingRadians: 0,
    weatherVisibility: 1,
  });
}
