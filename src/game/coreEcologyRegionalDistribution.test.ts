import { describe, expect, it } from "vitest";

import { CORE_WILDLIFE_SPECIES, type CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import { createWorld, createWorldView } from "../sim/public";
import { seedFromText, type RootSeed } from "../sim/rng";
import {
  REGION_COORD_LIMIT,
  createRegionCoord,
  globalTileToRegion,
  type RegionCoord,
} from "../sim/regions";
import { stableStringify } from "../sim/util";
import { TILE_UNITS, createPlayer } from "./player";
import { deriveCoreEcologyRegionalPredatorHabitatAssemblage } from "./coreEcologyHabitat";
import { isCoreEcologyAggregateSpecies } from "./coreEcologyAggregatePolicy";
import {
  CORE_ECOLOGY_REGIONAL_WILD_SPECIES,
  clearCoreEcologyRegionalHabitatCache,
  deriveCoreEcologyRegionalHabitat,
} from "./coreEcologyRegionalHabitat";
import {
  deriveCoreEcologyMaterializationUnits,
  type CoreEcologyRuntimeWindow,
} from "./coreEcologyRuntime";
import { deriveCoreEcologyRegionalResidentSet } from "./regionalEcologyResidents";
import { deriveRegionalEcologyMaterializationPlan } from "./regionalEcologyRuntime";
import { createCoreEcologySettlementHomePatch } from "./coreEcologySettlementHome";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
  regionalFrameOriginAtAddress,
} from "./regionalTravel";
import {
  REGION_WIDTH_UNITS,
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
} from "./worldPosition";

const FRESH_START_SEEDS = Object.freeze(
  Array.from({ length: 32 }, (_, ordinal) => `alpha32-open-country-start-${ordinal}`),
);
const CORPUS_SEED = seedFromText("alpha32-open-country-signed-extreme-corpus");
const LARGE_PREDATORS = new Set<CoreWildlifeSpecies>([
  "black-bear",
  "brown-bear",
  "cougar",
  "gray-wolf",
]);
const SIGNED_EXTREME_AXIS = Object.freeze([
  -REGION_COORD_LIMIT,
  -REGION_COORD_LIMIT + 1,
  -3,
  -1,
  0,
  2,
  REGION_COORD_LIMIT - 1,
  REGION_COORD_LIMIT,
]);

interface InitialFrameMetric {
  readonly seedText: string;
  readonly wildIndividualCandidates: number;
  readonly homeIndividualCandidates: number;
  readonly allCoreIndividualCandidates: number;
  readonly selectedWildIndividuals: number;
  readonly selectedAllCoreIndividuals: number;
  readonly aggregateAnchors: number;
  readonly largePredatorPopulations: number;
}

function anchorFallsInsideWindow(
  anchor: Readonly<{ globalX: number; globalY: number }>,
  window: CoreEcologyRuntimeWindow,
): boolean {
  return anchor.globalX >= window.origin.x
    && anchor.globalX < window.origin.x + window.terrain.width
    && anchor.globalY >= window.origin.y
    && anchor.globalY < window.origin.y + window.terrain.height;
}

function regionsIntersectingInitialFrame(seedText: string): {
  readonly seed: RootSeed;
  readonly regions: readonly RegionCoord[];
  readonly window: CoreEcologyRuntimeWindow;
  readonly homeIndividualCandidates: number;
  readonly homeAggregateAnchors: number;
  readonly settlementHome: ReturnType<typeof createCoreEcologySettlementHomePatch>;
} {
  const world = createWorld(seedText, "standard");
  const economy = createWorldView(world);
  const firstPromise = economy.contracts.find(({ status }) => status === "offered");
  const player = createPlayer(economy, firstPromise?.originSettlementId);
  const startSettlementId = firstPromise?.originSettlementId ?? economy.settlements[0]?.id;
  const porter = economy.residents
    .filter(({ location }) => (
      startSettlementId !== undefined
      && location.kind === "settlement"
      && location.settlementId === startSettlementId
    ))
    .sort((left, right) => (
      left.identity.stableId < right.identity.stableId
        ? -1
        : left.identity.stableId > right.identity.stableId
          ? 1
          : left.id - right.id
    ))[0];
  if (porter === undefined) throw new Error("Fresh world lacks its bootstrap porter");
  const home = economy.settlements.find(({ id }) => id === porter.homeSettlementId)
    ?? economy.settlements[0];
  const homeTile = home === undefined ? undefined : economy.terrain.tiles[home.tileIndex];
  if (home === undefined || homeTile === undefined) {
    throw new Error("Fresh world lacks its settlement-home terrain anchor");
  }
  const originRegion = createRegionCoord(0, 0);
  const halfTile = Math.trunc(WORLD_POSITION_UNITS_PER_TILE / 2);
  const habitat = deriveCoreEcologyRegionalPredatorHabitatAssemblage({
    rootSeed: world.meta.rootSeed,
    originRegion,
    focus: {
      position: createWorldPosition(
        originRegion,
        Math.min(
          REGION_WIDTH_UNITS - 1,
          (homeTile.x + 6) * WORLD_POSITION_UNITS_PER_TILE + halfTile,
        ),
        homeTile.y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
      ),
      radiusTiles: 32,
      excludedTileIndices: economy.settlements.map(({ tileIndex }) => tileIndex).sort((a, b) => a - b),
    },
    domesticAnchor: {
      anchorId: `SETTLEMENT-DOMESTIC-YARD-${home.id}`,
      species: "domestic-chicken",
      position: createWorldPosition(
        originRegion,
        homeTile.x * WORLD_POSITION_UNITS_PER_TILE + halfTile,
        homeTile.y * WORLD_POSITION_UNITS_PER_TILE + halfTile,
      ),
      radiusTiles: 4,
    },
  });
  const settlementHome = createCoreEcologySettlementHomePatch({
    seed: world.meta.rootSeed,
    habitat,
    tick: world.meta.completedTick,
  });
  const homeIndividualCandidates = settlementHome.populations.reduce(
    (sum, population) => sum + population.members.length,
    0,
  );
  const homeAggregateAnchors = settlementHome.aggregatePopulations.reduce(
    (sum, population) => sum + population.anchors.length,
    0,
  );
  const origin = regionalFrameOriginAtAddress({
    region: originRegion,
    localX: Math.floor(player.x / TILE_UNITS),
    localY: Math.floor(player.y / TILE_UNITS),
  });
  const window: CoreEcologyRuntimeWindow = Object.freeze({
    origin,
    terrain: Object.freeze({
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    }),
  });
  const first = globalTileToRegion(window.origin.x, window.origin.y).region;
  const last = globalTileToRegion(
    window.origin.x + window.terrain.width - 1,
    window.origin.y + window.terrain.height - 1,
  ).region;
  const regions: RegionCoord[] = [];
  for (let y = first.y; y <= last.y; y += 1) {
    for (let x = first.x; x <= last.x; x += 1) {
      regions.push(createRegionCoord(x, y));
    }
  }
  return Object.freeze({
    seed: world.meta.rootSeed,
    regions: Object.freeze(regions),
    window,
    homeIndividualCandidates,
    homeAggregateAnchors,
    settlementHome,
  });
}

function initialFrameMetric(seedText: string): InitialFrameMetric {
  const {
    seed,
    regions,
    window,
    homeIndividualCandidates,
    homeAggregateAnchors,
    settlementHome,
  } = regionsIntersectingInitialFrame(seedText);
  const residentSet = deriveCoreEcologyRegionalResidentSet({ seed, regions });
  const runtimeWindow = Object.freeze({
    origin: window.origin,
    terrain: Object.freeze({
      width: window.terrain.width,
      height: window.terrain.height,
    }),
  });
  const units = residentSet.residents.flatMap(({ patch }) => {
    const derived = deriveCoreEcologyMaterializationUnits(patch, runtimeWindow);
    if (derived === null) throw new Error("Regional candidate derivation rejected a canonical patch");
    return derived;
  });
  const plan = deriveRegionalEcologyMaterializationPlan(residentSet.residents, runtimeWindow);
  if (plan === null) throw new Error("Regional materialization rejected the canonical resident set");
  const allCorePlan = deriveRegionalEcologyMaterializationPlan([
    ...residentSet.residents,
    { sourceKey: settlementHome.patchKey, patch: settlementHome },
  ], runtimeWindow);
  if (allCorePlan === null) {
    throw new Error("Regional materialization rejected the canonical settlement-home source");
  }
  const habitats = regions.map((region) => deriveCoreEcologyRegionalHabitat({ seed, region }));
  const wildIndividualCandidates = units.reduce((sum, unit) => sum + unit.actorIds.length, 0);
  return Object.freeze({
    seedText,
    wildIndividualCandidates,
    homeIndividualCandidates,
    allCoreIndividualCandidates: wildIndividualCandidates + homeIndividualCandidates,
    selectedWildIndividuals: plan.reduce((sum, command) => sum + command.actorIds.length, 0),
    selectedAllCoreIndividuals: allCorePlan.reduce(
      (sum, command) => sum + command.actorIds.length,
      0,
    ),
    aggregateAnchors: homeAggregateAnchors + habitats.reduce((sum, habitat) => sum + habitat.populations
      .filter(({ species, populationUnits }) => (
        populationUnits > 0 && isCoreEcologyAggregateSpecies(species)
      ))
      .reduce((anchorSum, population) => anchorSum + population.anchors
        .filter((anchor) => anchorFallsInsideWindow(anchor, window)).length, 0), 0),
    largePredatorPopulations: habitats.reduce((sum, habitat) => sum + habitat.populations
      .filter(({ species, populationUnits }) => (
        populationUnits > 0 && LARGE_PREDATORS.has(species)
      )).length, 0),
  });
}

function nearestRank(values: readonly number[], percentile: number): number {
  if (values.length === 0 || percentile <= 0 || percentile > 1) {
    throw new RangeError("Nearest-rank percentile input is invalid");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentile * sorted.length) - 1]!;
}

function signedExtremeCorpus(): readonly RegionCoord[] {
  return Object.freeze(SIGNED_EXTREME_AXIS.flatMap((y) =>
    SIGNED_EXTREME_AXIS.map((x) => createRegionCoord(x, y))));
}

describe("regional ecology distribution properties", () => {
  it("keeps the fixed fresh-start corpus sparse before the global presentation cap", () => {
    clearCoreEcologyRegionalHabitatCache();
    const metrics = FRESH_START_SEEDS.map(initialFrameMetric);
    const wild = metrics.map(({ wildIndividualCandidates }) => wildIndividualCandidates);
    const aggregates = metrics.map(({ aggregateAnchors }) => aggregateAnchors);
    const predators = metrics.map(({ largePredatorPopulations }) => largePredatorPopulations);
    const allCore = metrics.map(({ allCoreIndividualCandidates }) => allCoreIndividualCandidates);
    const summary = {
      wild: { p50: nearestRank(wild, 0.5), p95: nearestRank(wild, 0.95), max: Math.max(...wild) },
      aggregates: {
        p95: nearestRank(aggregates, 0.95),
        max: Math.max(...aggregates),
      },
      predatorFreeStarts: predators.filter((count) => count === 0).length,
      maximumPredatorPopulations: Math.max(...predators),
      maximumHomeIndividuals: Math.max(...metrics.map(({ homeIndividualCandidates }) => (
        homeIndividualCandidates
      ))),
      maximumAllCoreIndividuals: Math.max(...allCore),
      metrics,
    };

    expect(summary.wild.p50, stableStringify(summary)).toBeLessThanOrEqual(6);
    expect(summary.wild.p95, stableStringify(summary)).toBeLessThanOrEqual(9);
    expect(summary.wild.max, stableStringify(summary)).toBeLessThanOrEqual(10);
    expect(summary.maximumAllCoreIndividuals, stableStringify(summary)).toBeLessThanOrEqual(18);
    expect(metrics.every(({ wildIndividualCandidates, selectedWildIndividuals }) => (
      wildIndividualCandidates === selectedWildIndividuals
    )), stableStringify(summary)).toBe(true);
    expect(metrics.every(({ allCoreIndividualCandidates, selectedAllCoreIndividuals }) => (
      allCoreIndividualCandidates === selectedAllCoreIndividuals
    )), stableStringify(summary)).toBe(true);
    expect(summary.aggregates.p95, stableStringify(summary)).toBeLessThanOrEqual(10);
    expect(summary.aggregates.max, stableStringify(summary)).toBeLessThanOrEqual(12);
    expect(summary.maximumPredatorPopulations, stableStringify(summary)).toBeLessThanOrEqual(1);
    expect(summary.predatorFreeStarts, stableStringify(summary)).toBeGreaterThanOrEqual(16);
  }, 180_000);

  it("keeps the fixed signed/extreme corpus sparse, plural, canonical, and cache independent", () => {
    const regions = signedExtremeCorpus();
    clearCoreEcologyRegionalHabitatCache();
    const forward = regions.map((region) => deriveCoreEcologyRegionalHabitat({
      seed: CORPUS_SEED,
      region,
    }));
    const forwardByRegion = new Map(forward.map((habitat) => [
      `${habitat.region.x}:${habitat.region.y}`,
      stableStringify(habitat),
    ]));

    clearCoreEcologyRegionalHabitatCache();
    const replayByRegion = new Map([...regions].reverse().map((region, ordinal) => {
      const habitat = deriveCoreEcologyRegionalHabitat({
        seed: CORPUS_SEED,
        region,
        speciesOrder: ordinal % 2 === 0
          ? [...CORE_WILDLIFE_SPECIES].reverse()
          : [...CORE_WILDLIFE_SPECIES],
      });
      return [`${region.x}:${region.y}`, stableStringify(habitat)] as const;
    }));
    expect(replayByRegion).toEqual(forwardByRegion);

    const occupied = forward.filter(({ totalPopulationUnits }) => totalPopulationUnits > 0);
    const empty = forward.filter(({ totalPopulationUnits }) => totalPopulationUnits === 0);
    const predatorFree = forward.filter(({ populations }) => !populations.some(
      ({ species, populationUnits }) => populationUnits > 0 && LARGE_PREDATORS.has(species),
    ));
    const emptyAtRepresentationEdge = empty.filter(({ region }) => (
      Math.abs(region.x) === REGION_COORD_LIMIT
      || Math.abs(region.y) === REGION_COORD_LIMIT
    ));
    const presenceBySpecies = new Map(CORE_ECOLOGY_REGIONAL_WILD_SPECIES.map((species) => [
      species,
      forward.filter(({ populations }) => populations.some((population) => (
        population.species === species && population.populationUnits > 0
      ))).length,
    ]));
    const summary = {
      empty: empty.length,
      occupied: occupied.length,
      predatorFree: predatorFree.length,
      emptyAtRepresentationEdge: emptyAtRepresentationEdge.length,
      presenceBySpecies: Object.fromEntries(presenceBySpecies),
    };

    expect(empty.length, stableStringify(summary)).toBeGreaterThanOrEqual(4);
    expect(occupied.length, stableStringify(summary)).toBeGreaterThanOrEqual(16);
    expect(predatorFree.length, stableStringify(summary)).toBeGreaterThanOrEqual(56);
    expect(emptyAtRepresentationEdge.length, stableStringify(summary)).toBeGreaterThan(0);
    expect(emptyAtRepresentationEdge.every(({ region }) => (
      Object.is(region.x, -0) === false
      && Object.is(region.y, -0) === false
    )), stableStringify(summary)).toBe(true);
    expect([...presenceBySpecies.values()].every((count) => count < regions.length),
      stableStringify(summary)).toBe(true);
    expect(empty.every((habitat) => (
      habitat.admittedSpeciesCount === 0
      && habitat.totalPopulationUnits === 0
      && habitat.populations.every(({ populationUnits, anchors }) => (
        populationUnits === 0 && anchors.length === 0
      ))
    )), stableStringify(summary)).toBe(true);
  }, 180_000);
});
