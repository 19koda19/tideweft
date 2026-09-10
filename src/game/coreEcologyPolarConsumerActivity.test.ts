import { describe, expect, it } from "vitest";

import { seedFromText } from "../sim/rng";
import { createRegionCoord } from "../sim/regions";
import { setCoreEcologyAggregatePatchMaterializedActors } from "./coreEcology";
import { projectCoreEcologyActivity } from "./coreEcologyActivity";
import {
  deriveCoreEcologyShoreWaterActivityAuthority,
  isTrustedCoreEcologyActivityAuthority,
} from "./coreEcologyActivityAuthority";
import { deriveCoreEcologyPolarConsumerHabitat } from "./coreEcologyPolarConsumerHabitat";
import {
  isTrustedCoreEcologyPolarConsumerActivityAuthority,
  projectCoreEcologyPolarConsumerActivityAuthority,
} from "./coreEcologyPolarConsumerActivity";
import { createCoreEcologyPolarConsumerResidentPatch } from "./regionalPolarConsumerResidents";

export const ALPHA36_POLAR_CONSUMER_ACTIVITY_AUTHORITY_OWNER_INTENT =
  "test:alpha36-polar-consumer-activity-authority:v1" as const;

const SEED = seedFromText("polar habitat fuzz 29");
const REGION = createRegionCoord(-1_653, 664);

function fixture() {
  const habitat = deriveCoreEcologyPolarConsumerHabitat({
    seed: SEED,
    region: REGION,
  });
  const patch = createCoreEcologyPolarConsumerResidentPatch({
    seed: SEED,
    habitat,
    tick: 7,
  });
  const seal = patch.populations.find(({ species }) => species === "harbor-seal")
    ?.members[0]?.actor;
  if (seal === undefined) throw new Error("Polar activity fixture lacks its seal");
  return { habitat, patch, seal };
}

describe(`${ALPHA36_POLAR_CONSUMER_ACTIVITY_AUTHORITY_OWNER_INTENT} shared shore-water authority`, () => {
  it("reuses one bounded amphibious archetype over exact water and haulout anchors", () => {
    const { patch, seal } = fixture();
    const materialized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
      atTick: patch.updatedAtTick,
      actorIds: [seal.identity.stableId],
    });
    const authority = projectCoreEcologyPolarConsumerActivityAuthority({
      rootSeed: SEED,
      patch: materialized,
      actorId: seal.identity.stableId,
    });
    const replay = projectCoreEcologyPolarConsumerActivityAuthority({
      rootSeed: SEED,
      patch: materialized,
      actorId: seal.identity.stableId,
    });
    expect(authority).not.toBeNull();
    expect(replay).toBe(authority);
    expect(isTrustedCoreEcologyPolarConsumerActivityAuthority(authority)).toBe(true);
    expect(authority).toMatchObject({
      sourceKey: patch.patchKey,
      actorId: seal.identity.stableId,
      species: "harbor-seal",
      homeAnchor: { region: REGION },
    });
    expect(authority?.tidalAnchors.map(({ purpose, terrain }) => ({
      purpose,
      terrain,
    }))).toEqual([
      expect.objectContaining({ purpose: "foraging" }),
      expect.objectContaining({ purpose: "haulout" }),
    ]);
  });

  it("fails closed for a bear ID, foreign seed, or copied habitat forgery", () => {
    const { habitat, patch, seal } = fixture();
    const bearId = patch.populations.find(({ species }) => species === "polar-bear")
      ?.members[0]?.actor.identity.stableId ?? "POLARBEAR-ABSENT";
    expect(projectCoreEcologyPolarConsumerActivityAuthority({
      rootSeed: SEED,
      patch,
      actorId: bearId,
    })).toBeNull();
    expect(projectCoreEcologyPolarConsumerActivityAuthority({
      rootSeed: seedFromText("foreign polar activity world"),
      patch,
      actorId: seal.identity.stableId,
    })).toBeNull();
    expect(projectCoreEcologyPolarConsumerActivityAuthority({
      rootSeed: SEED,
      patch: {
        ...patch,
        derivation: {
          kind: patch.derivation.kind,
          habitat: { ...habitat, terrainHash: "0000000000000000" },
        },
      },
      actorId: seal.identity.stableId,
    })).toBeNull();
  });

  it("does not let a generic structural receipt bypass polar-consumer world custody", () => {
    const { patch, seal } = fixture();
    const materialized = setCoreEcologyAggregatePatchMaterializedActors(patch, {
      atTick: patch.updatedAtTick,
      actorIds: [seal.identity.stableId],
    });
    const worldBound = projectCoreEcologyPolarConsumerActivityAuthority({
      rootSeed: SEED,
      patch: materialized,
      actorId: seal.identity.stableId,
    });
    if (worldBound === null) throw new Error("Seal world-bound authority is absent");
    const structural = deriveCoreEcologyShoreWaterActivityAuthority({
      sourceKey: worldBound.sourceKey,
      actorId: worldBound.actorId,
      species: worldBound.species,
      homeAnchor: worldBound.homeAnchor,
      tidalAnchors: worldBound.tidalAnchors,
    });
    expect(structural).not.toBeNull();
    expect(isTrustedCoreEcologyActivityAuthority(structural)).toBe(true);
    expect(isTrustedCoreEcologyPolarConsumerActivityAuthority(structural)).toBe(false);
    expect(projectCoreEcologyActivity(materialized, {
      actorId: seal.identity.stableId,
      atTick: materialized.updatedAtTick,
    }, structural ?? undefined)).toBeNull();
    expect(projectCoreEcologyActivity(materialized, {
      actorId: seal.identity.stableId,
      atTick: materialized.updatedAtTick,
    }, worldBound)).not.toBeNull();
  });
});
