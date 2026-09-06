import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { getCoreWildlifeProfile } from "../sim/coreWildlifeIdentity";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  type RegionCoord,
} from "../sim/regions";
import { FIXED_POINT, WORLD_HEIGHT, WORLD_WIDTH } from "../sim/types";
import { MAX_TIDE_LEVEL, MIN_TIDE_LEVEL, tideAtTick } from "../sim/terrain";
import { stableStringify } from "../sim/util";
import {
  canonicalizeCoreEcologyAggregatePatch,
  createCoreEcologyAggregatePatch,
  deserializeCoreEcologyAggregatePatch,
  displaceCoreEcologyAggregatePopulation,
  serializeCoreEcologyAggregatePatch,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS,
  CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES,
  CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION,
  CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH,
  CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH,
  canonicalizeCoreEcologyTidalTableHabitatAssemblage,
  coreEcologyHabitatSpeciesBounds,
  deriveCoreEcologyRainChorusHabitatAssemblage,
  deriveCoreEcologyTidalTableHabitatAssemblage,
  type CoreEcologyTidalTableHabitatAssemblage,
} from "./coreEcologyHabitat";
import { coreEcologySpeciesRuntimePolicy } from "./coreEcologySpeciesRuntimePolicy";
import { stepCoreEcologySmallWorld } from "./coreEcologySmallWorld";
import {
  projectCoreEcologyTidalTable,
  stepCoreEcologyTidalTable,
} from "./coreEcologyTidalTable";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

const SEED = seedFromText("tidal-triad-1");

function focusAt(region: RegionCoord) {
  return createWorldPosition(
    region,
    Math.trunc(WORLD_WIDTH / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
    Math.trunc(WORLD_HEIGHT / 2) * WORLD_POSITION_UNITS_PER_TILE
      + Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2),
  );
}

function individualInputs(
  habitat: CoreEcologyTidalTableHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "coarse" as const,
          })),
        }]
  ));
}

function tidalFixture(tick: number) {
  const originRegion = createRegionCoord(0, 0);
  const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
    rootSeed: SEED,
    originRegion,
    focus: { position: focusAt(originRegion), radiusTiles: 32 },
  });
  const patch = createCoreEcologyAggregatePatch({
    seed: SEED,
    patchKey: "tidal-table:live-tide",
    originRegion,
    tick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v5", habitat },
  });
  return { habitat, originRegion, patch };
}

describe("tidal-table habitat v5", () => {
  it("keeps habitat allocation and population caps aligned with identity and runtime owners", () => {
    for (const species of [
      "atlantic-silverside",
      "atlantic-marsh-fiddler-crab",
      "snowy-egret",
    ] as const) {
      const habitat = coreEcologyHabitatSpeciesBounds(species);
      const identity = getCoreWildlifeProfile(species);
      const runtime = coreEcologySpeciesRuntimePolicy(species);
      expect(habitat).not.toBeNull();
      expect(runtime).not.toBeNull();
      expect(habitat?.maximumPopulation).toBe(identity.maximumPatchPopulation);
      expect(runtime?.presentationModel).toBe(
        habitat?.representation === "group-actor"
          ? "aggregate-school"
          : habitat?.representation === "aggregate-area"
            ? "aggregate-activity"
            : "individual",
      );
      expect(habitat?.maximumAllocations).toBe(
        runtime?.aggregate?.maximumAnchors ?? runtime?.maximumMaterializedActors,
      );
    }
  });

  it("appends the aquatic triad after an exact rain-chorus v4 prefix", () => {
    const originRegion = createRegionCoord(0, 0);
    const input = {
      rootSeed: SEED,
      originRegion,
      focus: { position: focusAt(originRegion), radiusTiles: 32 },
    } as const;
    const v4 = deriveCoreEcologyRainChorusHabitatAssemblage(input);
    const v5 = deriveCoreEcologyTidalTableHabitatAssemblage(input);

    expect(v5.generationVersion).toBe(CORE_ECOLOGY_TIDAL_TABLE_HABITAT_VERSION);
    expect(v5.populations.map(({ species }) => species))
      .toEqual(CORE_ECOLOGY_TIDAL_TABLE_HABITAT_SPECIES);
    expect(stableStringify(v5.populations.slice(0, v4.populations.length)))
      .toBe(stableStringify(v4.populations));
    expect(v5.maximumAllocationBudget)
      .toBe(CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS);
    expect(v5.populations.reduce(
      (total, population) => total + population.allocations.length,
      0,
    )).toBeLessThanOrEqual(CORE_ECOLOGY_TIDAL_TABLE_HABITAT_MAX_ALLOCATIONS);

    const silverside = v5.populations[10];
    const fiddler = v5.populations[11];
    const egret = v5.populations[12];
    expect(silverside).toMatchObject({
      species: "atlantic-silverside",
      representation: "group-actor",
      activitySignal: { kind: "schooling", activePeriod: "tide-responsive" },
    });
    expect(silverside?.populationUnits).toBeGreaterThanOrEqual(24);
    expect(silverside?.allocations.every(({ terrain }) => (
      terrain === "deep-water" || terrain === "tidal-flat"
    ))).toBe(true);
    expect(fiddler).toMatchObject({
      species: "atlantic-marsh-fiddler-crab",
      representation: "aggregate-area",
      activitySignal: { kind: "burrow-foraging", activePeriod: "tide-responsive" },
    });
    expect(fiddler?.populationUnits).toBeGreaterThanOrEqual(32);
    expect(fiddler?.allocations.every(({ terrain }) => (
      terrain === "tidal-flat" || terrain === "marsh"
    ))).toBe(true);
    expect(egret).toMatchObject({
      species: "snowy-egret",
      representation: "individual-representatives",
      activitySignal: { kind: "wading-search", activePeriod: "tide-responsive" },
    });
    expect(egret?.populationUnits).toBeLessThanOrEqual(1);
    expect(egret?.allocations.every(({ terrain }) => (
      terrain === "tidal-flat" || terrain === "marsh" || terrain === "meadow"
    ))).toBe(true);

    for (const population of [silverside, fiddler, egret]) {
      expect(population?.allocations.reduce(
        (total, allocation) => total + allocation.representedUnits,
        0,
      )).toBe(population?.populationUnits);
    }
    expect(canonicalizeCoreEcologyTidalTableHabitatAssemblage(v5)).toEqual(v5);
  });

  it("keeps baseline identity independent from live tide and strict on input shape", () => {
    const originRegion = createRegionCoord(71, -29);
    const input = {
      rootSeed: SEED,
      originRegion,
      focus: { position: focusAt(originRegion), radiusTiles: 24 },
    } as const;
    const first = deriveCoreEcologyTidalTableHabitatAssemblage(input);
    const replay = deriveCoreEcologyTidalTableHabitatAssemblage(input);

    expect(replay).toEqual(first);
    expect(() => deriveCoreEcologyTidalTableHabitatAssemblage({
      ...input,
      tide: { direction: "rising", level: 500_000, phase: 20 },
    } as Parameters<typeof deriveCoreEcologyTidalTableHabitatAssemblage>[0]))
      .toThrow(TypeError);
  });

  it("conserves fish schools and crab areas without fabricating member actors", () => {
    const originRegion = createRegionCoord(0, 0);
    const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
      rootSeed: SEED,
      originRegion,
      focus: { position: focusAt(originRegion), radiusTiles: 32 },
    });
    const patch = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "tidal-table:aggregate-school-and-area",
      originRegion,
      populations: individualInputs(habitat),
      derivation: { kind: "habitat-v5", habitat },
    });
    const silverside = patch.aggregatePopulations.find(({ species }) => (
      species === "atlantic-silverside"
    ));
    const fiddler = patch.aggregatePopulations.find(({ species }) => (
      species === "atlantic-marsh-fiddler-crab"
    ));

    expect(patch.populations.some(({ species }) => species === "atlantic-silverside"))
      .toBe(false);
    expect(patch.populations.some(({ species }) => species === "atlantic-marsh-fiddler-crab"))
      .toBe(false);
    expect(patch.populations.some(({ species }) => species === "snowy-egret"))
      .toBe(true);
    expect(silverside).toMatchObject({
      representation: "group-actor",
      activitySignal: { kind: "schooling-glint", activePeriod: "tide-responsive" },
    });
    expect(silverside?.aggregateId).toMatch(/^SILVERSIDE-SCHOOL-v1-/u);
    expect(silverside?.anchors.reduce(
      (total, anchor) => total + anchor.populationUnits,
      0,
    )).toBe(silverside?.populationSize);
    expect(silverside?.evidence.every(({ kind }) => kind === "surface-dimple"))
      .toBe(true);
    expect(fiddler).toMatchObject({
      representation: "aggregate-area",
      activitySignal: { kind: "burrow-foraging", activePeriod: "tide-responsive" },
    });
    expect(fiddler?.aggregateId).toMatch(/^FIDDLER-AREA-v1-/u);
    expect(fiddler?.anchors.reduce(
      (total, anchor) => total + anchor.populationUnits,
      0,
    )).toBe(fiddler?.populationSize);
    expect(fiddler?.evidence.every(({ kind }) => (
      kind === "burrow-opening" || kind === "feeding-scrape"
    ))).toBe(true);
    expect(canonicalizeCoreEcologyAggregatePatch(patch)).toEqual(patch);

    const text = serializeCoreEcologyAggregatePatch(patch);
    expect(deserializeCoreEcologyAggregatePatch(text)).toEqual(patch);
    expect(deserializeCoreEcologyAggregatePatch(text) === null
      ? null
      : serializeCoreEcologyAggregatePatch(deserializeCoreEcologyAggregatePatch(text)))
      .toBe(text);
  });

  it("remains canonical and repeatable at both signed region extremes", () => {
    for (const originRegion of [
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    ]) {
      const input = {
        rootSeed: SEED,
        originRegion,
        focus: { position: focusAt(originRegion), radiusTiles: 12 },
      } as const;
      const habitat = deriveCoreEcologyTidalTableHabitatAssemblage(input);
      expect(deriveCoreEcologyTidalTableHabitatAssemblage(input)).toEqual(habitat);
      expect(canonicalizeCoreEcologyTidalTableHabitatAssemblage(habitat)).toEqual(habitat);
      for (const allocation of habitat.populations.flatMap(({ allocations }) => allocations)) {
        expect(Number.isSafeInteger(allocation.globalTile.x)).toBe(true);
        expect(Number.isSafeInteger(allocation.globalTile.y)).toBe(true);
        expect(Object.is(allocation.globalTile.x, -0)).toBe(false);
        expect(Object.is(allocation.globalTile.y, -0)).toBe(false);
      }
    }
  });

  it("rejects changed species meaning instead of accepting a corrupted record", () => {
    const originRegion = createRegionCoord(3, -5);
    const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
      rootSeed: SEED,
      originRegion,
      focus: { position: focusAt(originRegion), radiusTiles: 32 },
    });
    const corrupted = structuredClone(habitat);
    const silverside = corrupted.populations[10];
    if (silverside === undefined) throw new Error("missing silverside fixture");
    (silverside as unknown as { representation: string }).representation = "individual-representatives";

    expect(canonicalizeCoreEcologyTidalTableHabitatAssemblage(corrupted)).toBeNull();
  });

  it("authenticates every egret wading band and rejects an impossible saved destination", () => {
    const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
      rootSeed: SEED,
      originRegion: createRegionCoord(0, 0),
      focus: { position: focusAt(createRegionCoord(0, 0)), radiusTiles: 32 },
    });
    const wading = habitat.tidalAnchors.filter(({ species, purpose }) => (
      species === "snowy-egret" && purpose === "wading"
    ));
    const refuge = habitat.tidalAnchors.find(({ species, purpose }) => (
      species === "snowy-egret" && purpose === "refuge"
    ));
    expect(wading).toHaveLength(4);
    expect(wading.every(({ elevation }) => (
      elevation >= MIN_TIDE_LEVEL - CORE_ECOLOGY_SNOWY_EGRET_MAXIMUM_WADING_DEPTH
      && elevation <= MAX_TIDE_LEVEL - CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH
    ))).toBe(true);
    expect(refuge?.elevation).toBeGreaterThanOrEqual(MAX_TIDE_LEVEL);

    const corrupted = structuredClone(habitat);
    const changed = corrupted.tidalAnchors.find(({ species, purpose }) => (
      species === "snowy-egret" && purpose === "wading"
    ));
    if (changed === undefined) throw new Error("missing wading-anchor corruption fixture");
    (changed as { elevation: number }).elevation =
      MAX_TIDE_LEVEL - CORE_ECOLOGY_SNOWY_EGRET_MINIMUM_WADING_DEPTH + 1;
    (changed as { terrain: string }).terrain = "meadow";
    expect(canonicalizeCoreEcologyTidalTableHabitatAssemblage(corrupted)).toBeNull();
  });
});

describe("live tidal-table ecology", () => {
  it("immediately evacuates an exposed school edge into an authenticated wet refuge", () => {
    const { patch } = tidalFixture(0);
    const beforeFish = patch.aggregatePopulations.find(({ species }) => (
      species === "atlantic-silverside"
    ));
    const projection = projectCoreEcologyTidalTable(patch, 0);
    if (beforeFish === undefined || projection === null) throw new Error("missing tide fixture");
    const exposed = projection.anchorDepths.find(({ aggregateId, activityUsable }) => (
      aggregateId === beforeFish.aggregateId && !activityUsable
    ));
    if (exposed === undefined) throw new Error("fixture lacks an exposed school edge");
    const exposedUnits = beforeFish.anchors[exposed.anchorOrdinal]?.populationUnits ?? 0;
    expect(exposedUnits).toBeGreaterThan(0);

    const result = stepCoreEcologyTidalTable(patch, { atTick: 0 });
    if (result === null) throw new Error("live tide rejected canonical fixture");
    const afterFish = result.patch.aggregatePopulations.find(({ species }) => (
      species === "atlantic-silverside"
    ));

    expect(result).toMatchObject({
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
    });
    expect(result.redistributions).toContainEqual(expect.objectContaining({
      causeKind: "tide-pressure",
      fromAnchorOrdinal: exposed.anchorOrdinal,
      displacedUnits: exposedUnits,
      nonlethal: true,
      cargoInteraction: false,
      itemConsumption: "none",
    }));
    expect(afterFish?.aggregateId).toBe(beforeFish.aggregateId);
    expect(afterFish?.populationSize).toBe(beforeFish.populationSize);
    expect(afterFish?.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
      .toBe(beforeFish.populationSize);
    expect(afterFish?.anchors[exposed.anchorOrdinal]?.populationUnits).toBe(0);
    expect(afterFish?.anchors.map(({ position }) => position))
      .toEqual(beforeFish.anchors.map(({ position }) => position));
    expect(result.patch.populations.some(({ species }) => (
      species === "atlantic-silverside"
        || species === "atlantic-marsh-fiddler-crab"
    ))).toBe(false);
  });

  it("never lets same-tick small-world pressure move a school into a dry anchor", () => {
    const { patch } = tidalFixture(0);
    const projection = projectCoreEcologyTidalTable(patch, 0);
    const school = patch.aggregatePopulations.find(({ species }) => (
      species === "atlantic-silverside"
    ));
    if (projection === null || school === undefined) throw new Error("missing school fixture");
    const depths = projection.anchorDepths.filter(({ aggregateId }) => (
      aggregateId === school.aggregateId
    ));
    const dry = depths.find(({ activityUsable }) => !activityUsable);
    if (dry === undefined) throw new Error("fixture lacks a dry school edge");

    // The dry edge is the only lower-pressure destination in this otherwise
    // valid frame. The shared small-world owner must decline that attractive
    // move instead of treating a saved anchor as currently swimmable.
    const result = stepCoreEcologySmallWorld(patch, 0, {
      version: 1,
      atTick: 0,
      stimuli: [{
        version: 1,
        stimulusId: "test:dry-edge-pressure",
        sourceReferenceId: school.aggregateId,
        sourceKind: "same-species",
        response: "pressure",
        targetAggregateId: school.aggregateId,
        channels: ["touch"],
        anchorInfluences: school.anchors.map(({ anchorOrdinal }) => ({
          anchorOrdinal,
          intensity: anchorOrdinal === dry.anchorOrdinal ? 0 : FIXED_POINT,
        })),
      }],
    });
    if (result === null) throw new Error("small-world tide guard rejected a valid frame");
    const lawful = new Set(depths.filter(({ activityUsable }) => activityUsable)
      .map(({ anchorOrdinal }) => anchorOrdinal));
    expect(result.events.filter(({ targetSpecies }) => (
      targetSpecies === "atlantic-silverside"
    )).every(({ toAnchorOrdinal }) => lawful.has(toAnchorOrdinal))).toBe(true);
    expect(result.events.some(({ targetSpecies, toAnchorOrdinal }) => (
      targetSpecies === "atlantic-silverside"
      && toAnchorOrdinal === dry.anchorOrdinal
    ))).toBe(false);
  });

  it("is input-order independent and survives an exact serialization round trip", () => {
    const { patch } = tidalFixture(360);
    const forward = stepCoreEcologyTidalTable(patch, { atTick: 360 });
    const repeated = stepCoreEcologyTidalTable(patch, { atTick: 360 });
    expect(forward).toEqual(repeated);
    if (forward === null) throw new Error("missing canonical tidal step");
    const text = serializeCoreEcologyAggregatePatch(forward.patch);
    expect(deserializeCoreEcologyAggregatePatch(text)).toEqual(forward.patch);
    const replayed = stepCoreEcologyTidalTable(forward.patch, {
      atTick: 360,
    });
    expect(replayed).not.toBeNull();
    expect(replayed?.patch).toEqual(forward.patch);
    expect(replayed?.redistributions).toEqual([]);
  });

  it("returns the projection of its committed patch and replays that state exactly", () => {
    const { patch } = tidalFixture(4);
    const result = stepCoreEcologyTidalTable(patch, { atTick: 4 });
    if (result === null) throw new Error("missing committed tidal step");
    expect(result.redistributions.length).toBeGreaterThan(0);
    expect(result.projection).toEqual(
      projectCoreEcologyTidalTable(result.patch, 4),
    );

    const replayed = stepCoreEcologyTidalTable(result.patch, { atTick: 4 });
    if (replayed === null) throw new Error("committed tidal step did not replay");
    expect(replayed.patch).toEqual(result.patch);
    expect(replayed.projection).toEqual(result.projection);
    expect(replayed.redistributions).toEqual([]);
    expect(replayed).toMatchObject({
      mortality: result.mortality,
      cargoInteraction: result.cargoInteraction,
      itemConsumption: result.itemConsumption,
    });
  });

  it("makes schooling strongest in deeper rising water and crab foraging strongest on an ebbing flat", () => {
    const low = tidalFixture(1);
    const high = tidalFixture(360);
    const lowResult = stepCoreEcologyTidalTable(low.patch, { atTick: 1 });
    const highResult = stepCoreEcologyTidalTable(high.patch, { atTick: 360 });
    if (lowResult === null || highResult === null) {
      throw new Error("canonical activity fixture was rejected");
    }
    const intensity = (
      result: typeof lowResult,
      species: "atlantic-silverside" | "atlantic-marsh-fiddler-crab",
    ) => result.patch.aggregatePopulations.find((population) => (
      population.species === species
    ))?.activitySignal.intensity ?? -1;

    expect(intensity(highResult, "atlantic-silverside"))
      .toBeGreaterThan(intensity(lowResult, "atlantic-silverside"));
    expect(intensity(lowResult, "atlantic-marsh-fiddler-crab"))
      .toBeGreaterThan(intensity(highResult, "atlantic-marsh-fiddler-crab"));
    expect(intensity(highResult, "atlantic-marsh-fiddler-crab")).toBe(0);
  });

  it("derives depth itself and rejects stale clocks or caller-forged depth", () => {
    const { patch } = tidalFixture(4);
    expect(stepCoreEcologyTidalTable(patch, { atTick: 3 })).toBeNull();
    expect(stepCoreEcologyTidalTable(patch, {
      atTick: 4,
      anchorDepths: [{ waterDepth: 1_000_000 }],
    })).toBeNull();
    expect(stepCoreEcologyTidalTable(patch, {})).toBeNull();
    expect(projectCoreEcologyTidalTable(patch, 4)?.anchorDepths.every((depth) => (
      depth.waterDepth === Math.max(0, tideAtTick(4).level - depth.elevation)
    ))).toBe(true);
  });

  it("always gives every generated school a low-tide refuge without requiring every edge to stay wet", () => {
    const originRegion = createRegionCoord(0, 0);
    let schoolCount = 0;
    for (let ordinal = 0; ordinal < 24; ordinal += 1) {
      const habitat = deriveCoreEcologyTidalTableHabitatAssemblage({
        rootSeed: seedFromText(`tidal-refuge-audit-${ordinal}`),
        originRegion,
        focus: { position: focusAt(originRegion), radiusTiles: 32 },
      });
      const school = habitat.populations.find(({ species }) => (
        species === "atlantic-silverside"
      ));
      if (school?.populationUnits === 0) continue;
      schoolCount += 1;
      const anchors = habitat.tidalAnchors.filter(({ species }) => (
        species === "atlantic-silverside"
      ));
      expect(anchors.some(({ elevation }) => (
        tideAtTick(0).level - elevation >= 20_000
      ))).toBe(true);
      expect(canonicalizeCoreEcologyTidalTableHabitatAssemblage(habitat)).toEqual(habitat);
    }
    expect(schoolCount).toBeGreaterThan(0);
  });

  it("continues gradual redistribution from another occupied edge when the extreme source is empty", () => {
    const { patch } = tidalFixture(360);
    const projection = projectCoreEcologyTidalTable(patch, 360);
    const school = patch.aggregatePopulations.find(({ species }) => (
      species === "atlantic-silverside"
    ));
    if (projection === null || school === undefined) throw new Error("missing school fixture");
    const depths = projection.anchorDepths.filter(({ aggregateId }) => (
      aggregateId === school.aggregateId
    )).sort((left, right) => left.waterDepth - right.waterDepth);
    const emptied = depths[0];
    const receiver = depths[1];
    if (emptied === undefined || receiver === undefined) throw new Error("missing school edges");
    const units = school.anchors[emptied.anchorOrdinal]?.populationUnits ?? 0;
    const primed = displaceCoreEcologyAggregatePopulation(patch, {
      aggregateId: school.aggregateId,
      atTick: 360,
      causeKind: "weather-pressure",
      causeReferenceId: "test:empty-shallow-edge",
      fromAnchorOrdinal: emptied.anchorOrdinal,
      toAnchorOrdinal: receiver.anchorOrdinal,
      populationUnits: units,
      pressure: 100_000,
    });
    if (primed === null) throw new Error("could not prime empty source");
    const result = stepCoreEcologyTidalTable(primed.patch, { atTick: 360 });
    expect(result).not.toBeNull();
    expect(result?.redistributions).toContainEqual(expect.objectContaining({
      causeReferenceId: expect.stringContaining(":edge"),
      displacedUnits: 1,
    }));
    expect(result?.patch.aggregatePopulations.find(({ aggregateId }) => (
      aggregateId === school.aggregateId
    ))?.anchors.reduce((sum, anchor) => sum + anchor.populationUnits, 0))
      .toBe(school.populationSize);
  });

  it("projects both an exposed feeding edge and a dry egret refuge from the same saved habitat", () => {
    const high = tidalFixture(360);
    const highProjection = projectCoreEcologyTidalTable(high.patch, 360);
    if (highProjection?.snowyEgret === null || highProjection?.snowyEgret === undefined) {
      throw new Error("missing snowy egret tide projection");
    }
    expect(highProjection.snowyEgret.wadingTarget).toMatchObject({
      purpose: "wading",
      waterDepth: expect.any(Number),
    });
    expect(highProjection.snowyEgret.wadingTarget?.waterDepth).toBeGreaterThanOrEqual(8_000);
    expect(highProjection.snowyEgret.wadingTarget?.waterDepth).toBeLessThanOrEqual(78_000);
    expect(highProjection.snowyEgret.refugeTarget).toMatchObject({
      purpose: "refuge",
      waterDepth: 0,
    });
  });

  it("rejects tide pressure for legacy neutral aggregates, including forged saved history", () => {
    const { patch } = tidalFixture(4);
    const rat = patch.aggregatePopulations.find(({ species }) => species === "brown-rat");
    if (rat === undefined || rat.anchors.length < 2) throw new Error("missing rat fixture");
    const weather = displaceCoreEcologyAggregatePopulation(patch, {
      aggregateId: rat.aggregateId,
      atTick: 4,
      causeKind: "weather-pressure",
      causeReferenceId: "weather:v1:rain",
      fromAnchorOrdinal: rat.anchors[0]!.anchorOrdinal,
      toAnchorOrdinal: rat.anchors[1]!.anchorOrdinal,
      populationUnits: 1,
      pressure: 250_000,
    });
    expect(displaceCoreEcologyAggregatePopulation(patch, {
      aggregateId: rat.aggregateId,
      atTick: 4,
      causeKind: "tide-pressure",
      causeReferenceId: "tide:v1:4:rising",
      fromAnchorOrdinal: rat.anchors[0]!.anchorOrdinal,
      toAnchorOrdinal: rat.anchors[1]!.anchorOrdinal,
      populationUnits: 1,
      pressure: 250_000,
    })).toBeNull();
    if (weather === null) throw new Error("weather control disturbance failed");
    const forged = structuredClone(weather.patch);
    const forgedRat = forged.aggregatePopulations.find(({ species }) => species === "brown-rat");
    const disturbance = forgedRat?.disturbances.at(-1);
    const evidence = forgedRat?.evidence.find(({ evidenceId }) => (
      evidenceId.endsWith(`:${disturbance?.disturbanceOrdinal.toString(36)}`)
    ));
    if (disturbance === undefined || evidence === undefined) {
      throw new Error("missing forged-history fixture");
    }
    (disturbance as { causeKind: string }).causeKind = "tide-pressure";
    (disturbance as { causeReferenceId: string }).causeReferenceId = "tide:v1:4:rising";
    (evidence as { causeKind: string }).causeKind = "tide-pressure";
    (evidence as { causeReferenceId: string }).causeReferenceId = "tide:v1:4:rising";
    expect(canonicalizeCoreEcologyAggregatePatch(forged)).toBeNull();
  });
});
