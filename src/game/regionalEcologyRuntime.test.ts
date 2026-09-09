import { describe, expect, it } from "vitest";

import { globalTileToRegion, createRegionCoord, regionLocalToGlobalTile } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import type { CoreWildlifeSpecies } from "../sim/coreWildlifeIdentity";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  createCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
} from "./coreEcologyGroups";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import {
  deriveRegionalEcologyMaterializationPlan,
  setRegionalEcologyMaterializationForWindow,
  type RegionalEcologyResidentPatch,
} from "./regionalEcologyRuntime";
import {
  REGIONAL_TRAVEL_COLUMNS,
  REGIONAL_TRAVEL_ROWS,
} from "./regionalTravel";
import { createWorldPosition, type WorldPosition } from "./worldPosition";

const SEED = seedFromText("regional ecology global materialization");
const ORIGIN = createRegionCoord(-41, 23);

function runtimeWindow(): CoreEcologyRuntimeWindow {
  return Object.freeze({
    origin: regionLocalToGlobalTile(ORIGIN, 0, 0),
    terrain: Object.freeze({
      width: REGIONAL_TRAVEL_COLUMNS,
      height: REGIONAL_TRAVEL_ROWS,
    }),
  });
}

function position(windowX: number, windowY: number): WorldPosition {
  const origin = regionLocalToGlobalTile(ORIGIN, 0, 0);
  const address = globalTileToRegion(origin.x + windowX, origin.y + windowY);
  return createWorldPosition(
    address.region,
    address.localX * 1_000 + 500,
    address.localY * 1_000 + 500,
  );
}

function population(
  species: CoreWildlifeSpecies,
  populationKey: string,
  positions: readonly WorldPosition[],
): CoreEcologyPopulationInput {
  return Object.freeze({
    species,
    populationKey,
    populationSize: positions.length,
    members: Object.freeze(positions.map((memberPosition, populationOrdinal) => Object.freeze({
      populationOrdinal,
      position: memberPosition,
      materialization: "coarse" as const,
    }))),
  });
}

function resident(
  sourceKey: string,
  species: CoreWildlifeSpecies,
  count: number,
  row: number,
  identityKey = sourceKey,
): RegionalEcologyResidentPatch {
  const values = Array.from({ length: count }, (_, ordinal) =>
    position(48 + (ordinal % 12), row + Math.floor(ordinal / 12)));
  return Object.freeze({
    sourceKey: `regional:${sourceKey}`,
    patch: createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: `regional:${sourceKey}`,
      originRegion: ORIGIN,
      derivation: { kind: "bounded-input-v1" },
      populations: [population(species, `${identityKey}:population`, values)],
    }),
  });
}

function selectedActorIds(
  plan: ReturnType<typeof deriveRegionalEcologyMaterializationPlan>,
): readonly string[] {
  if (plan === null) throw new Error("Expected a regional materialization plan");
  return plan.flatMap(({ actorIds }) => actorIds).sort();
}

describe("regional ecology global materialization", () => {
  it("accepts an honestly empty resident set", () => {
    expect(deriveRegionalEcologyMaterializationPlan([], runtimeWindow())).toEqual([]);
    expect(setRegionalEcologyMaterializationForWindow([], runtimeWindow(), 0)).toEqual([]);
  });

  it("shares one stable cap across sources independent of resident order", () => {
    const residents = [
      resident("source:a", "gull", 20, 50),
      resident("source:b", "marsh-rabbit", 20, 68),
    ] as const;
    const first = deriveRegionalEcologyMaterializationPlan(residents, runtimeWindow());
    const reversed = deriveRegionalEcologyMaterializationPlan(
      [...residents].reverse(),
      runtimeWindow(),
    );

    expect(first).toEqual(reversed);
    expect(selectedActorIds(first)).toHaveLength(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(first?.map(({ sourceKey }) => sourceKey)).toEqual([
      "regional:source:a",
      "regional:source:b",
    ]);
  });

  it("skips a social unit whole when the remaining global budget cannot hold it", () => {
    const grouped = [position(90, 60), position(91, 60), position(92, 60)];
    const input = population("deer", "source:group:population", grouped);
    const group = createCoreEcologyGroup({
      seed: SEED,
      species: "deer",
      originRegion: ORIGIN,
      populationKey: input.populationKey,
      groupOrdinal: 0,
      memberOrdinals: [0, 1, 2],
      anchor: grouped[0]!,
    });
    const patch = createCoreEcologyAggregatePatch({
      seed: SEED,
      patchKey: "regional:group-source",
      originRegion: ORIGIN,
      derivation: { kind: "bounded-input-v1" },
      populations: [input],
      groups: createCoreEcologyGroupSet([group]),
    });
    const far = resident("source:far", "northern-harrier", 1, 100);
    const plan = deriveRegionalEcologyMaterializationPlan([
      resident("source:near-a", "gull", 20, 58),
      resident("source:near-b", "marsh-rabbit", 3, 63),
      { sourceKey: patch.patchKey, patch },
      far,
    ], runtimeWindow());
    const selected = new Set(selectedActorIds(plan));
    const members = patch.populations[0]!.members;

    expect(selected.size).toBe(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect([0, 1, 2].map((ordinal) =>
      selected.has(members[ordinal]!.actor.identity.stableId))).toEqual([false, false, false]);
    const farActor = far.patch.populations[0]!.members[0]!.actor.identity.stableId;
    expect(selected.has(farActor)).toBe(true);
  });

  it("applies every source command atomically and rejects duplicate actor ownership", () => {
    const first = resident("source:a", "gull", 18, 55);
    const second = resident("source:b", "marsh-rabbit", 18, 70);
    const updated = setRegionalEcologyMaterializationForWindow(
      [second, first],
      runtimeWindow(),
      4,
    );
    if (updated === null) throw new Error("Expected atomic regional reconciliation");
    const materialized = updated.flatMap(({ patch }) => patch.populations)
      .flatMap(({ members }) => members)
      .filter(({ materialization }) => materialization === "materialized");

    expect(materialized).toHaveLength(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(updated.map(({ sourceKey }) => sourceKey)).toEqual([
      "regional:source:a",
      "regional:source:b",
    ]);
    expect(updated.every(({ patch }) => patch.updatedAtTick === 4)).toBe(true);

    expect(deriveRegionalEcologyMaterializationPlan([{
      sourceKey: "regional:source:alias",
      patch: first.patch,
    }], runtimeWindow())).toBeNull();

    const duplicatePatch: CoreEcologyAggregatePatchState = resident(
      "source:duplicate",
      "gull",
      18,
      55,
      "source:a",
    ).patch;
    expect(deriveRegionalEcologyMaterializationPlan([
      first,
      { sourceKey: duplicatePatch.patchKey, patch: duplicatePatch },
    ], runtimeWindow())).toBeNull();
  });
});
