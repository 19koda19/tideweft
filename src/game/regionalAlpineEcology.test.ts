import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  replaceCoreEcologyAggregatePatchActor,
} from "./coreEcology";
import { deriveCoreEcologyAlpineHabitat } from "./coreEcologyAlpineHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import {
  createCoreEcologyGroupSet,
  reconcileCoreEcologyGroupAnchors,
} from "./coreEcologyGroups";
import {
  REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES,
  REGIONAL_ALPINE_ECOLOGY_OWNER_ID,
  advanceRegionalAlpineEcologyRoot,
  canonicalRegionalAlpineEcologyRootForWorld,
  canonicalizeRegionalAlpineEcologyRoot,
  createPristineRegionalAlpineEcologyRoot,
  createRegionalAlpineEcologyRegionDelta,
  deserializeRegionalAlpineEcologyRoot,
  putRegionalAlpineEcologyResidentDeviation,
  regionalAlpineEcologyResidentPatchForRegion,
  regionalAlpineEcologyResidentsForActiveRegions,
  serializeRegionalAlpineEcologyRoot,
} from "./regionalAlpineEcology";
import { createCoreEcologyAlpineResidentPatch } from "./regionalAlpineResidents";
import { createWorldPosition } from "./worldPosition";

const SEED = seedFromText("alpine resident property");
const ORIGIN = createRegionCoord(-1, 0);
const EMPTY = createRegionCoord(3, -4);
const DESTINATION = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
const GOAT_SEED = seedFromText("wave-f alpine origin");
const GOAT_ORIGIN = createRegionCoord(0, -1);
const STALE_RESIDENCE = createRegionCoord(123, -456);

function pristinePatch(tick = 0) {
  const habitat = deriveCoreEcologyAlpineHabitat({ seed: SEED, region: ORIGIN });
  return createCoreEcologyAlpineResidentPatch({ seed: SEED, habitat, tick });
}

function movedPatch() {
  const patch = pristinePatch();
  const eagle = patch.populations.find(({ species }) => species === "golden-eagle")
    ?.members[0]?.actor;
  if (eagle === undefined) throw new Error("Golden-eagle deviation fixture is absent");
  return replaceCoreEcologyAggregatePatchActor(patch, repositionCoreWildlifeActor(eagle, {
    atTick: 0,
    position: createWorldPosition(DESTINATION, 1_000, 2_000),
    heading: 875_000,
  }));
}

describe("Wave-F sparse Regional Alpine ecology lineage", () => {
  it("keeps pristine and merely visited regions rederivable instead of storing them", () => {
    const root = createPristineRegionalAlpineEcologyRoot({ rootSeed: SEED, completedTick: 0 });
    expect(root).toMatchObject({
      ownerId: REGIONAL_ALPINE_ECOLOGY_OWNER_ID,
      updatedAtTick: 0,
      revision: 0,
      lastEventOrdinal: 0,
      regions: [],
    });
    expect(Object.hasOwn(root, "adoption")).toBe(false);
    expect(regionalAlpineEcologyResidentPatchForRegion(root, SEED, EMPTY)).toBeNull();
    expect(root.regions).toEqual([]);

    const occupied = regionalAlpineEcologyResidentPatchForRegion(root, SEED, ORIGIN);
    expect(occupied).not.toBeNull();
    expect(root.regions).toEqual([]);
    expect(stableStringify(occupied)).toBe(stableStringify(pristinePatch()));

    const serialized = serializeRegionalAlpineEcologyRoot(root);
    expect(new TextEncoder().encode(serialized).byteLength)
      .toBeLessThan(REGIONAL_ALPINE_ECOLOGY_MAX_SERIALIZED_BYTES);
    expect(deserializeRegionalAlpineEcologyRoot(serialized)).toEqual(root);
    expect(canonicalRegionalAlpineEcologyRootForWorld(root, {
      rootSeed: SEED,
      completedTick: 0,
    })).toBe(root);
  });

  it("stores only a coarse deviation, catches it up, and selects its owner by current residence", () => {
    const moved = movedPatch();
    const sourceKey = moved.patchKey;
    let root = putRegionalAlpineEcologyResidentDeviation(
      createPristineRegionalAlpineEcologyRoot({ rootSeed: SEED, completedTick: 0 }),
      { rootSeed: SEED, patch: moved },
    );
    expect(root.regions).toHaveLength(1);
    expect(root.regions[0]?.residentPatch.updatedAtTick).toBe(0);
    expect(root.regions[0]?.residentPatch.populations.flatMap(({ members }) => members)
      .every(({ materialization }) => materialization === "coarse")).toBe(true);

    root = advanceRegionalAlpineEcologyRoot(root, 73);
    expect(root.regions[0]?.residentPatch.updatedAtTick).toBe(0);
    const active = regionalAlpineEcologyResidentsForActiveRegions(root, SEED, [DESTINATION]);
    const crossedOwner = active?.find((resident) => resident.sourceKey === sourceKey);
    expect(crossedOwner?.kind).toBe("regional-alpine-v1");
    expect(crossedOwner?.patch.updatedAtTick).toBe(73);
    expect(crossedOwner?.patch.originRegion).toEqual(ORIGIN);
    expect(crossedOwner?.patch.populations.find(({ species }) => species === "golden-eagle")
      ?.members[0]?.actor.address.position.region).toEqual(DESTINATION);
    expect(regionalAlpineEcologyResidentPatchForRegion(root, SEED, ORIGIN)?.updatedAtTick)
      .toBe(73);

    const replay = regionalAlpineEcologyResidentsForActiveRegions(
      deserializeRegionalAlpineEcologyRoot(serializeRegionalAlpineEcologyRoot(root)),
      SEED,
      [DESTINATION, DESTINATION],
    );
    expect(stableStringify(replay)).toBe(stableStringify(active));

    root = putRegionalAlpineEcologyResidentDeviation(root, {
      rootSeed: SEED,
      patch: pristinePatch(73),
    });
    expect(root.regions).toEqual([]);
    expect(root.revision).toBe(2);
    expect(root.lastEventOrdinal).toBe(2);
    expect(canonicalRegionalAlpineEcologyRootForWorld(root, {
      rootSeed: SEED,
      completedTick: 73,
    })).toBe(root);
  });

  it("selects cross-region owners from caught-up rather than stale group residence", () => {
    const habitat = deriveCoreEcologyAlpineHabitat({ seed: GOAT_SEED, region: GOAT_ORIGIN });
    const pristine = createCoreEcologyAlpineResidentPatch({ seed: GOAT_SEED, habitat, tick: 0 });
    const group = pristine.groups.groups[0];
    if (group === undefined) throw new Error("Mountain-goat group fixture is absent");
    const externalPosition = createWorldPosition(STALE_RESIDENCE, 1_000, 2_000);
    const reconciled = reconcileCoreEcologyGroupAnchors(group, {
      atTick: 0,
      componentAnchors: group.components.map(({ componentId }) => ({
        componentId,
        anchor: externalPosition,
      })),
      rendezvousAnchor: externalPosition,
    });
    if (reconciled === null) throw new Error("Mountain-goat group fixture failed to reconcile");
    const deviated = canonicalizeCoreEcologyAggregatePatch({
      ...pristine,
      groups: createCoreEcologyGroupSet([reconciled]),
    });
    if (deviated === null) throw new Error("Mountain-goat residence deviation is invalid");
    let root = putRegionalAlpineEcologyResidentDeviation(
      createPristineRegionalAlpineEcologyRoot({ rootSeed: GOAT_SEED, completedTick: 0 }),
      { rootSeed: GOAT_SEED, patch: deviated },
    );
    root = advanceRegionalAlpineEcologyRoot(root, 56);

    expect(regionalAlpineEcologyResidentsForActiveRegions(
      root,
      GOAT_SEED,
      [STALE_RESIDENCE],
    )).toEqual([]);
    expect(regionalAlpineEcologyResidentsForActiveRegions(
      root,
      GOAT_SEED,
      [GOAT_ORIGIN],
    )?.find(({ sourceKey }) => sourceKey === deviated.patchKey)?.patch.updatedAtTick).toBe(56);
  });

  it("rejects pristine deltas, foreign authority, excess hot regions, and v24-style adoption fields", () => {
    const patch = pristinePatch();
    const habitat = deriveCoreEcologyAlpineHabitat({ seed: SEED, region: ORIGIN });
    expect(() => createRegionalAlpineEcologyRegionDelta({
      rootSeed: SEED,
      region: ORIGIN,
      baselineHash: habitat.derivationHash,
      revision: 1,
      eventOrdinal: 1,
      residentPatch: patch,
    })).toThrow(/does not persist pristine baselines/u);

    const root = createPristineRegionalAlpineEcologyRoot({ rootSeed: SEED, completedTick: 0 });
    expect(canonicalRegionalAlpineEcologyRootForWorld(root, {
      rootSeed: seedFromText("foreign Alpine sparse root"),
      completedTick: 0,
    })).toBeNull();
    expect(canonicalizeRegionalAlpineEcologyRoot({ ...root, adoption: { version: 24 } }))
      .toBeNull();
    expect(regionalAlpineEcologyResidentsForActiveRegions(root, SEED, Array.from(
      { length: 10 },
      (_, index) => createRegionCoord(index, -index),
    ))).toBeNull();
  });
});
