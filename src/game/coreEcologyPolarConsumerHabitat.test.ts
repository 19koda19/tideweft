import { describe, expect, it } from "vitest";

import { generateRegionTerrain } from "../sim/regionTerrain";
import { seedFromText } from "../sim/rng";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { MAX_TIDE_LEVEL } from "../sim/terrain";
import { stableStringify } from "../sim/util";
import {
  CORE_ECOLOGY_POLAR_CONSUMER_BEAR_DENSITY_THRESHOLD,
  CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
  CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_OWNER_ID,
  canonicalCoreEcologyPolarConsumerHabitatForWorld,
  canonicalizeCoreEcologyPolarConsumerHabitat,
  clearCoreEcologyPolarConsumerHabitatCache,
  deriveCoreEcologyPolarConsumerHabitat,
  deriveCoreEcologyPolarConsumerTerritory,
  type CoreEcologyPolarConsumerHabitat,
} from "./coreEcologyPolarConsumerHabitat";
import { deriveCoreEcologyPolarShoreHabitat } from "./coreEcologyPolarShoreHabitat";

export const ALPHA36_POLAR_CONSUMER_HABITAT_SHARED_INVARIANTS_OWNER_INTENT =
  "test:alpha36-polar-consumer-habitat-shared-invariants:v1" as const;

const OCCUPIED_SEED = seedFromText("polar habitat fuzz 29");
const OCCUPIED_REGION = createRegionCoord(-1653, 664);

function representativeCorpus() {
  const fixed = [
    { seed: OCCUPIED_SEED, region: OCCUPIED_REGION },
    {
      seed: seedFromText("polar consumer origin"),
      region: createRegionCoord(0, 0),
    },
    {
      seed: seedFromText("polar consumer positive edge"),
      region: createRegionCoord(REGION_COORD_LIMIT, REGION_COORD_LIMIT),
    },
    {
      seed: seedFromText("polar consumer negative edge"),
      region: createRegionCoord(-REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    },
  ];
  return Object.freeze([
    ...fixed,
    ...Array.from({ length: 48 }, (_, ordinal) => ({
      seed: seedFromText(`alpha36 polar consumer fixture ${ordinal}`),
      region: createRegionCoord(
        -1653 + (ordinal % 8),
        664 + Math.trunc(ordinal / 8),
      ),
    })),
  ]);
}

describe(`${ALPHA36_POLAR_CONSUMER_HABITAT_SHARED_INVARIANTS_OWNER_INTENT} habitat`, () => {
  it("replays canonical terrain and exposes the fixed two-species dependency order", () => {
    clearCoreEcologyPolarConsumerHabitatCache();
    const terrain = generateRegionTerrain(OCCUPIED_SEED, OCCUPIED_REGION);
    const first = deriveCoreEcologyPolarConsumerHabitat({
      seed: OCCUPIED_SEED,
      region: OCCUPIED_REGION,
    });
    const replay = deriveCoreEcologyPolarConsumerHabitat({
      seed: OCCUPIED_SEED,
      region: OCCUPIED_REGION,
      terrain: { ...terrain, tiles: [...terrain.tiles].reverse() },
    });
    expect(replay).toBe(first);
    expect(first).toMatchObject({
      ownerId: CORE_ECOLOGY_POLAR_CONSUMER_HABITAT_OWNER_ID,
      derivationKind: CORE_ECOLOGY_POLAR_CONSUMER_DERIVATION_KIND,
      evaluatedSpeciesCount: 2,
    });
    expect(first.populations.map(({ species }) => species)).toEqual([
      "harbor-seal",
      "polar-bear",
    ]);
    expect(canonicalizeCoreEcologyPolarConsumerHabitat(first)).toBe(first);
    expect(
      canonicalCoreEcologyPolarConsumerHabitatForWorld(
        first,
        OCCUPIED_SEED,
        OCCUPIED_REGION,
      ),
    ).toBe(first);
  });

  it("admits a seal only from exact capelin, water, and dry-haulout evidence, then applies the rarer bear gate", () => {
    const cases = representativeCorpus().map(({ seed, region }) => ({
      seed,
      region,
      polar: deriveCoreEcologyPolarShoreHabitat({ seed, region }),
      habitat: deriveCoreEcologyPolarConsumerHabitat({ seed, region }),
    }));
    expect(
      cases.some(({ habitat }) => habitat.totalPopulationUnits === 0),
    ).toBe(true);
    expect(
      cases.some(
        ({ habitat }) => habitat.populations[0]!.populationUnits === 1,
      ),
      stableStringify(
        cases.map(({ habitat }) => ({
          region: habitat.region,
          substrate: habitat.forageSubstrate.viable,
          reasons: habitat.populations.map(
            ({ admissionReason }) => admissionReason,
          ),
        })),
      ),
    ).toBe(true);
    expect(
      cases.some(
        ({ habitat }) => habitat.populations[1]!.populationUnits === 1,
      ),
      stableStringify(
        cases
          .filter(
            ({ habitat }) => habitat.populations[0]!.populationUnits === 1,
          )
          .map(({ habitat }) => ({
            region: habitat.region,
            bear: habitat.populations[1],
          })),
      ),
    ).toBe(true);

    for (const { habitat, polar, seed, region } of cases) {
      const seal = habitat.populations[0]!;
      const bear = habitat.populations[1]!;
      expect(seal.populationUnits).toBeLessThanOrEqual(1);
      expect(bear.populationUnits).toBeLessThanOrEqual(1);
      expect(habitat.totalPopulationUnits).toBe(
        seal.populationUnits + bear.populationUnits,
      );
      expect(habitat.forageSubstrate).toMatchObject({
        polarShoreSourceStableId: polar.sourceStableId,
        polarShoreHabitatHash: polar.derivationHash,
        capelinPopulationStableId: polar.populations[0]!.stableId,
        capelinPopulationKey: polar.populations[0]!.populationKey,
        capelinPopulationUnits: polar.populations[0]!.populationUnits,
      });
      if (seal.populationUnits === 1) {
        expect(polar.populations[0]!.admissionReason).toBe("admitted");
        expect(seal.anchors.map(({ purpose }) => purpose)).toEqual([
          "foraging-water",
          "dry-haulout",
        ]);
        const [water, haulout] = seal.anchors;
        expect(water!.medium).toBe("surface-water");
        expect(water!.sourceAnchorStableId).not.toBeNull();
        expect(haulout!.medium).toBe("land");
        expect(haulout!.elevation).toBeGreaterThanOrEqual(MAX_TIDE_LEVEL);
        expect([water!.globalX, water!.globalY]).not.toEqual([
          haulout!.globalX,
          haulout!.globalY,
        ]);
      } else {
        expect(seal.anchors).toEqual([]);
      }
      expect(bear.sealSupportStableId).toBe(seal.stableId);
      expect(bear.sealSupportPopulationKey).toBe(seal.populationKey);
      expect(bear.sealSupportUnits).toBe(seal.populationUnits);
      if (bear.populationUnits === 1) {
        expect(seal.populationUnits).toBe(1);
        expect(
          deriveCoreEcologyPolarConsumerTerritory(seed, region).regionIsHost,
        ).toBe(true);
        expect(bear.densityRoll).toBeLessThan(
          CORE_ECOLOGY_POLAR_CONSUMER_BEAR_DENSITY_THRESHOLD,
        );
        expect(bear.anchors).toHaveLength(1);
        expect(bear.anchors[0]).toMatchObject({
          purpose: "bear-land",
          medium: "land",
        });
      } else {
        expect(bear.anchors).toEqual([]);
      }
      expect(stableStringify(habitat)).not.toMatch(
        /targetActor|capture|consumption|reproduction|voice|snow|ice/u,
      );
    }
  });

  it("replays signed extremes and rejects foreign or forged authority", () => {
    const seed = seedFromText("alpha36 signed polar consumers");
    for (const region of [
      createRegionCoord(REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(-REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ]) {
      const first = deriveCoreEcologyPolarConsumerHabitat({ seed, region });
      clearCoreEcologyPolarConsumerHabitatCache();
      const replay = deriveCoreEcologyPolarConsumerHabitat({ seed, region });
      expect(stableStringify(replay)).toBe(stableStringify(first));
      expect(
        canonicalCoreEcologyPolarConsumerHabitatForWorld(replay, seed, region),
      ).toBe(replay);
    }
    const habitat = deriveCoreEcologyPolarConsumerHabitat({
      seed: OCCUPIED_SEED,
      region: OCCUPIED_REGION,
    });
    expect(
      canonicalCoreEcologyPolarConsumerHabitatForWorld(
        habitat,
        seedFromText("foreign polar-consumer world"),
        OCCUPIED_REGION,
      ),
    ).toBeNull();
    const forged: CoreEcologyPolarConsumerHabitat = {
      ...habitat,
      totalPopulationUnits: habitat.totalPopulationUnits === 0 ? 1 : 0,
    };
    expect(canonicalizeCoreEcologyPolarConsumerHabitat(forged)).toBeNull();
  });
});
