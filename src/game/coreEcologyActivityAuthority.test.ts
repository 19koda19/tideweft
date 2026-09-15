import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { createRegionCoord, type RegionCoord } from "../sim/regions";
import { tideAtTick } from "../sim/terrain";
import { stableStringify } from "../sim/util";
import {
  replaceCoreEcologyAggregatePatchActor,
  setCoreEcologyAggregatePatchMaterializedActors,
  type CoreEcologyAggregatePatchState,
} from "./coreEcology";
import {
  projectCoreEcologyActivity,
  type CoreEcologyActivityProjection,
} from "./coreEcologyActivity";
import {
  deriveCoreEcologyShoreWaterActivityAuthority,
  isTrustedCoreEcologyActivityAuthority,
  projectCoreEcologyBreadthActivityAuthority,
  projectCoreEcologyActivityAuthority,
  type CoreEcologyActivityAuthorityV1,
} from "./coreEcologyActivityAuthority";
import {
  type CoreEcologyActivityAffordanceSpecies,
} from "./coreEcologyActivityAffordance";
import {
  CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
  CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID,
  CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_COHORT_ID,
  coreEcologyBreadthCohortDefinition,
  deriveCoreEcologyBreadthHabitat,
} from "./coreEcologyBreadthHabitat";
import {
  CORE_ECOLOGY_ANCHORED_WADER_MAXIMUM_DEPTH,
  CORE_ECOLOGY_ANCHORED_WADER_MINIMUM_DEPTH,
} from "./coreEcologyHabitat";
import { repositionCoreWildlifeActor } from "./coreWildlifeActor";
import { createPristineRegionalEcologyRoot } from "./regionalEcology";
import { createCoreEcologyBreadthResidentPatch } from "./regionalBreadthCohort";
import { createCoreEcologyRegionalResidentPatchForRoot } from "./regionalEcologyResidents";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  translateWorldPosition,
} from "./worldPosition";

export const ALPHA37_ESTUARY_BREADTH_ACTIVITY_AUTHORITY_OWNER_INTENT =
  "test:alpha37-estuary-breadth-activity-authority:v1" as const;
export const ALPHA38_MARSH_CHANNEL_WEB_ACTIVITY_AUTHORITY_OWNER_INTENT =
  "test:alpha38-marsh-channel-web-activity-authority:v1" as const;
export const ALPHA39_SALTMARSH_SMALL_WORLDS_ACTIVITY_AUTHORITY_OWNER_INTENT =
  "test:alpha39-saltmarsh-small-worlds-activity-authority:v1" as const;

const SEED = seedFromText("alpha32-activity-authority-table");
const BREADTH_SEED = seedFromText("alpha37 estuary breadth shared properties");
const ROOT = createPristineRegionalEcologyRoot({ rootSeed: SEED, completedTick: 0 });
const REGIONAL_ACTIVITY_SPECIES = Object.freeze([
  "american-black-duck",
  "fish-crow",
  "gull",
  "marsh-rabbit",
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
    { species: "marsh-rabbit", region: createRegionCoord(-2, -2) },
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
        {
          actorId: witness.actorId,
          atTick: 0,
          weather: { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: 1 },
        },
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

  it("authenticates declarative breadth actors through one cohort-neutral projection path", () => {
    const fixtures = Object.freeze([
      { species: "great-blue-heron", region: createRegionCoord(1_050, 38_043) },
      { species: "common-tern", region: createRegionCoord(-5_179, -89_646) },
      { species: "osprey", region: createRegionCoord(-192_134, -225_672) },
    ] as const satisfies readonly Readonly<{
      species: CoreEcologyActivityAffordanceSpecies;
      region: RegionCoord;
    }>[]);

    for (const fixture of fixtures) {
      const habitat = deriveCoreEcologyBreadthHabitat({
        seed: BREADTH_SEED,
        region: fixture.region,
        cohortId: CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
      });
      const patch = createCoreEcologyBreadthResidentPatch({
        seed: BREADTH_SEED,
        habitat,
      });
      const actorId = patch.populations
        .find(({ species }) => species === fixture.species)
        ?.members[0]?.actor.identity.stableId;
      if (actorId === undefined) {
        throw new Error(`Breadth activity fixture is absent for ${fixture.species}`);
      }
      const materialized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
        atTick: 0,
        actorIds: [actorId],
      });
      const authority = projectCoreEcologyBreadthActivityAuthority({
        rootSeed: BREADTH_SEED,
        patch: materialized,
        actorId,
      });
      expect(authority).toMatchObject({
        actorId,
        species: fixture.species,
        sourceKey: materialized.patchKey,
        provenance: "breadth-habitat",
      });
      expect(authority?.homeAnchorElevation).not.toBeNull();
      expect(isTrustedCoreEcologyActivityAuthority(authority)).toBe(true);
      expect(projectCoreEcologyActivity(
        materialized,
        { actorId, atTick: 0 },
        authority ?? undefined,
      )).toMatchObject({ actorId, species: fixture.species });
    }
  });

  it(`${ALPHA38_MARSH_CHANNEL_WEB_ACTIVITY_AUTHORITY_OWNER_INTENT} projects the addressable cohort through that same authority`, () => {
    const fixtures = Object.freeze([
      { species: "greater-yellowlegs", region: createRegionCoord(91_177, 199_624) },
      { species: "belted-kingfisher", region: createRegionCoord(144_181, 147_353) },
      { species: "double-crested-cormorant", region: createRegionCoord(173_753, 11_507) },
    ] as const satisfies readonly Readonly<{
      species: CoreEcologyActivityAffordanceSpecies;
      region: RegionCoord;
    }>[]);

    const projections = fixtures.map((fixture) => {
      const habitat = deriveCoreEcologyBreadthHabitat({
        seed: BREADTH_SEED,
        region: fixture.region,
        cohortId: CORE_ECOLOGY_MARSH_CHANNEL_WEB_COHORT_ID,
      });
      const patch = createCoreEcologyBreadthResidentPatch({
        seed: BREADTH_SEED,
        habitat,
      });
      const actorId = patch.populations.find(
        ({ species }) => species === fixture.species,
      )?.members[0]?.actor.identity.stableId;
      if (actorId === undefined) {
        throw new Error(`Marsh-channel activity fixture is absent for ${fixture.species}`);
      }
      const materialized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
        atTick: 0,
        actorIds: [actorId],
      });
      const authority = projectCoreEcologyBreadthActivityAuthority({
        rootSeed: BREADTH_SEED,
        patch: materialized,
        actorId,
      });
      expect(authority).toMatchObject({
        actorId,
        species: fixture.species,
        sourceKey: materialized.patchKey,
        provenance: "breadth-habitat",
      });
      expect(isTrustedCoreEcologyActivityAuthority(authority)).toBe(true);
      const projection = projectCoreEcologyActivity(
        materialized,
        { actorId, atTick: 0 },
        authority ?? undefined,
      );
      expect(projection).toMatchObject({ actorId, species: fixture.species });
      return projection?.species;
    });

    expect(projections).toEqual(fixtures.map(({ species }) => species));
  });

  it(`${ALPHA39_SALTMARSH_SMALL_WORLDS_ACTIVITY_AUTHORITY_OWNER_INTENT} projects final actors through the cohort-neutral authority`, () => {
    const region = createRegionCoord(-126_625, -214_398);
    const habitat = deriveCoreEcologyBreadthHabitat({
      seed: BREADTH_SEED,
      region,
      cohortId: CORE_ECOLOGY_SALTMARSH_SMALL_WORLDS_COHORT_ID,
    });
    const patch = createCoreEcologyBreadthResidentPatch({
      seed: BREADTH_SEED,
      habitat,
    });
    const fixtures = Object.freeze([
      "seaside-sparrow",
      "diamondback-terrapin",
    ] as const satisfies readonly CoreEcologyActivityAffordanceSpecies[]);

    for (const species of fixtures) {
      const actorId = patch.populations.find(
        (population) => population.species === species,
      )?.members[0]?.actor.identity.stableId;
      if (actorId === undefined) {
        throw new Error(`Saltmarsh activity fixture is absent for ${species}`);
      }
      const materialized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
        atTick: 0,
        actorIds: [actorId],
      });
      const authority = projectCoreEcologyBreadthActivityAuthority({
        rootSeed: BREADTH_SEED,
        patch: materialized,
        actorId,
      });
      expect(authority).toMatchObject({
        actorId,
        species,
        sourceKey: materialized.patchKey,
        provenance: "breadth-habitat",
      });
      expect(authority?.homeAnchorElevation).not.toBeNull();
      expect(isTrustedCoreEcologyActivityAuthority(authority)).toBe(true);
      expect(projectCoreEcologyActivity(
        materialized,
        { actorId, atTick: 0 },
        authority ?? undefined,
      )).toMatchObject({ actorId, species });
    }
  });

  it("keeps the shared anchored-wader contract honest at every tide/day boundary", () => {
    const region = createRegionCoord(1_050, 38_043);
    const habitat = deriveCoreEcologyBreadthHabitat({
      seed: BREADTH_SEED,
      region,
      cohortId: CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
    });
    const definition = coreEcologyBreadthCohortDefinition(
      CORE_ECOLOGY_ESTUARY_SURFACE_BREAK_COHORT_ID,
    )?.species.find(({ species }) => species === "great-blue-heron");
    const habitatPopulation = habitat.populations.find(
      ({ species }) => species === "great-blue-heron",
    );
    expect(definition?.maximumHighTideDepth)
      .toBe(CORE_ECOLOGY_ANCHORED_WADER_MAXIMUM_DEPTH);
    expect(habitatPopulation?.anchors[0]?.highTideDepth)
      .toBeLessThanOrEqual(CORE_ECOLOGY_ANCHORED_WADER_MAXIMUM_DEPTH);
    const homeElevation = habitatPopulation?.anchors[0]?.elevation;
    if (homeElevation === undefined) throw new Error("Heron habitat anchor is absent");
    const depthBand = (tick: number): "dry" | "wading" | "too-deep" => {
      const depth = Math.max(0, tideAtTick(tick).level - homeElevation);
      return depth < CORE_ECOLOGY_ANCHORED_WADER_MINIMUM_DEPTH
        ? "dry"
        : depth > CORE_ECOLOGY_ANCHORED_WADER_MAXIMUM_DEPTH
          ? "too-deep"
          : "wading";
    };
    const sampledTicks = new Set([0, 1, 359, 360, 361, 719, 720, 721, 1_199, 1_200, 1_201, 1_439]);
    for (let tick = 1; tick < 1_440; tick += 1) {
      if (depthBand(tick) === depthBand(tick - 1)) continue;
      for (const candidate of [tick - 1, tick, tick + 1]) {
        if (candidate >= 0 && candidate < 1_440) sampledTicks.add(candidate);
      }
    }

    for (const tick of [...sampledTicks].sort((left, right) => left - right)) {
      const patch = createCoreEcologyBreadthResidentPatch({
        seed: BREADTH_SEED,
        habitat,
        tick,
      });
      const actorId = patch.populations.find(
        ({ species }) => species === "great-blue-heron",
      )?.members[0]?.actor.identity.stableId;
      if (actorId === undefined) throw new Error("Heron cycle fixture lost its actor");
      const materialized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
        atTick: tick,
        actorIds: [actorId],
      });
      const authority = projectCoreEcologyBreadthActivityAuthority({
        rootSeed: BREADTH_SEED,
        patch: materialized,
        actorId,
      });
      const projection = projectCoreEcologyActivity(
        materialized,
        { actorId, atTick: tick },
        authority ?? undefined,
      );
      if (
        authority === null
        || authority.homeAnchorElevation === null
        || projection === null
      ) {
        throw new Error(`Heron cycle authority failed at tick ${tick}`);
      }
      const depth = Math.max(
        0,
        tideAtTick(tick).level - authority.homeAnchorElevation,
      );
      expect(depth).toBeLessThanOrEqual(CORE_ECOLOGY_ANCHORED_WADER_MAXIMUM_DEPTH);
      if (projection.state === "wading-scan" || projection.state === "wading-search") {
        expect(depth).toBeGreaterThanOrEqual(
          CORE_ECOLOGY_ANCHORED_WADER_MINIMUM_DEPTH,
        );
      }
      if (projection.motion.kind === "hold-position") {
        expect(["resting", "waiting-on-tide", "wading-scan", "wading-search"])
          .toContain(projection.state);
      }
      expect(projectCoreEcologyActivity(
        materialized,
        { actorId, atTick: tick },
        authority,
      )).toEqual(projection);
    }

    for (const tick of [0, 360]) {
      const patch = createCoreEcologyBreadthResidentPatch({
        seed: BREADTH_SEED,
        habitat,
        tick,
      });
      const member = patch.populations.find(
        ({ species }) => species === "great-blue-heron",
      )?.members[0];
      if (member === undefined) throw new Error("Heron displacement fixture lost its actor");
      const materialized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
        atTick: tick,
        actorIds: [member.actor.identity.stableId],
      });
      const authority = projectCoreEcologyBreadthActivityAuthority({
        rootSeed: BREADTH_SEED,
        patch: materialized,
        actorId: member.actor.identity.stableId,
      });
      if (authority === null) throw new Error("Heron displacement authority failed");
      const displaced = replaceCoreEcologyAggregatePatchActor(
        materialized,
        repositionCoreWildlifeActor(member.actor, {
          atTick: tick,
          position: translateWorldPosition(
            member.actor.address.position,
            2 * WORLD_POSITION_UNITS_PER_TILE,
            0,
          ),
          heading: member.actor.address.heading,
        }),
      );
      const displacedProjection = projectCoreEcologyActivity(
        displaced,
        { actorId: member.actor.identity.stableId, atTick: tick },
        authority,
      );
      if (displacedProjection === null) {
        throw new Error(`Heron displacement projection failed at tick ${tick}`);
      }
      expect(displacedProjection).toMatchObject({
        state: "seeking-wading-ground",
        presentationSignal: "tidal-relocation-flight",
        motion: {
          kind: "target-area",
          verb: "seek-wading-ground",
          targetArea: { center: authority.homeAnchor },
        },
      });
    }
  }, 20_000);

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
      {
        actorId: witness.actorId,
        atTick: 0,
        weather: { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: 1 },
      },
      forged,
    )).toBeNull();
  });

  it("brands a species-neutral shore-water receipt without changing otter custody", () => {
    const witness = activityWitnesses().find(({ species }) => (
      species === "north-american-river-otter"
    ));
    if (witness === undefined) throw new Error("Otter authority fixture is absent");
    const materialized = setCoreEcologyAggregatePatchMaterializedActors(witness.patch, {
      atTick: 0,
      actorIds: [witness.actorId],
    });
    const established = projectCoreEcologyActivityAuthority({
      rootSeed: SEED,
      root: ROOT,
      sourceKind: "regional-habitat",
      patch: materialized,
      actorId: witness.actorId,
    });
    if (established === null) throw new Error("Otter authority projection failed");
    const derived = deriveCoreEcologyShoreWaterActivityAuthority({
      sourceKey: established.sourceKey,
      actorId: established.actorId,
      species: established.species,
      homeAnchor: established.homeAnchor,
      tidalAnchors: established.tidalAnchors,
    });
    expect(derived).toEqual(established);
    expect(isTrustedCoreEcologyActivityAuthority(derived)).toBe(true);
    expect(deriveCoreEcologyShoreWaterActivityAuthority({
      sourceKey: established.sourceKey,
      actorId: established.actorId,
      species: established.species,
      homeAnchor: established.homeAnchor,
      tidalAnchors: [established.tidalAnchors[0], established.tidalAnchors[0]],
    })).toBeNull();
  });
});
