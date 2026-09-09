import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { createRegionCoord, type RegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import {
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  projectCoreEcologyActivity,
  type CoreEcologyActivityProjection,
} from "./coreEcologyActivity";
import {
  isTrustedCoreEcologyActivityAuthority,
  projectCoreEcologyActivityAuthority,
  type CoreEcologyActivityAuthorityV1,
} from "./coreEcologyActivityAuthority";
import {
  type CoreEcologyActivityAffordanceSpecies,
} from "./coreEcologyActivityAffordance";
import { createPristineRegionalEcologyRoot } from "./regionalEcology";
import { createCoreEcologyRegionalResidentPatchForRoot } from "./regionalEcologyResidents";

const SEED = seedFromText("alpha32-activity-authority-table");
const ROOT = createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: 0 });
const REGIONAL_ACTIVITY_SPECIES = Object.freeze([
  "american-black-duck",
  "fish-crow",
  "gull",
  "north-american-river-otter",
  "northern-harrier",
  "snowy-egret",
] as const satisfies readonly CoreEcologyActivityAffordanceSpecies[]);

interface ActivityWitness {
  readonly species: CoreEcologyActivityAffordanceSpecies;
  readonly region: RegionCoord;
  readonly patch: CoreEcologyAggregatePatchState;
  readonly actorId: string;
}

function activityWitnesses(): readonly ActivityWitness[] {
  const fixtures: readonly Readonly<{
    species: CoreEcologyActivityAffordanceSpecies;
    region: RegionCoord;
  }>[] = Object.freeze([
    { species: "american-black-duck", region: createRegionCoord(-3, 3) },
    { species: "fish-crow", region: createRegionCoord(-1, -1) },
    { species: "gull", region: createRegionCoord(-2, -2) },
    { species: "north-american-river-otter", region: createRegionCoord(3, 2) },
    { species: "northern-harrier", region: createRegionCoord(-3, 1) },
    { species: "snowy-egret", region: createRegionCoord(4, -1) },
  ]);
  return Object.freeze(fixtures.map(({ species, region }) => {
    const patch = createCoreEcologyRegionalResidentPatchForRoot({
      seed: SEED,
      root: ROOT,
      region,
    });
    const actorId = patch?.populations
      .find((population) => population.species === species)
      ?.members[0]?.actor.identity.stableId;
    if (patch === null || actorId === undefined) {
      throw new Error(`Activity fixture is absent for ${species}`);
    }
    return Object.freeze({ species, region, patch, actorId });
  }));
}

describe("core ecology transient activity authority", () => {
  it("authenticates all bounded profiles through one regional projection path", () => {
    const results = activityWitnesses().map((witness): Readonly<{
      authority: CoreEcologyActivityAuthorityV1;
      projection: CoreEcologyActivityProjection;
    }> => {
      const materialized = setCoreEcologyAggregatePatchMaterializedActors(witness.patch, {
        atTick: 0,
        actorIds: [witness.actorId],
      });
      const authority = projectCoreEcologyActivityAuthority({
        rootSeed: SEED,
        root: ROOT,
        sourceKind: "regional-habitat",
        patch: materialized,
        actorId: witness.actorId,
      });
      expect(authority).not.toBeNull();
      expect(isTrustedCoreEcologyActivityAuthority(authority)).toBe(true);
      expect(authority).toMatchObject({
        actorId: witness.actorId,
        species: witness.species,
        sourceKey: materialized.patchKey,
        provenance: "regional-habitat",
      });
      const projection = projectCoreEcologyActivity(
        materialized,
        { actorId: witness.actorId, atTick: 0 },
        authority ?? undefined,
      );
      expect(projection).not.toBeNull();
      expect(projection).toMatchObject({
        actorId: witness.actorId,
        species: witness.species,
      });
      return { authority: authority!, projection: projection! };
    });

    expect(results.map(({ projection }) => projection.species).sort()).toEqual(
      [...REGIONAL_ACTIVITY_SPECIES].sort(),
    );
  });

  it("rejects structural clones and mismatched actor custody", () => {
    const witness = activityWitnesses()[0]!;
    const materialized = setCoreEcologyAggregatePatchMaterializedActors(witness.patch, {
      atTick: 0,
      actorIds: [witness.actorId],
    });
    const authority = projectCoreEcologyActivityAuthority({
      rootSeed: SEED,
      root: ROOT,
      sourceKind: "regional-habitat",
      patch: materialized,
      actorId: witness.actorId,
    });
    expect(authority).not.toBeNull();
    const forged = JSON.parse(stableStringify(authority)) as CoreEcologyActivityAuthorityV1;
    expect(isTrustedCoreEcologyActivityAuthority(forged)).toBe(false);
    expect(projectCoreEcologyActivity(
      materialized,
      { actorId: witness.actorId, atTick: 0 },
      forged,
    )).toBeNull();
  });
});
