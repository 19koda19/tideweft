import { describe, expect, it } from "vitest";
import { CORE_WILDLIFE_SPECIES } from "../sim/coreWildlifeIdentity";
import { LIVING_ACTOR_SPECIES, type LivingActorSpecies } from "./livingSpeciesRegistry";
import {
  coreEcologyCanPursueLivingActor,
  coreEcologyCanResolveMortalityTarget,
  coreEcologyTrophicPerceivedClass,
} from "./coreEcologyTrophic";

describe("core ecology trophic capability resolver", () => {
  it("separates role-driven pursuit from the narrower exact-body mortality contract", () => {
    expect(coreEcologyTrophicPerceivedClass("marsh-fox", "marsh-rabbit"))
      .toBe("live-prey");
    expect(coreEcologyCanPursueLivingActor("domestic-cat", "marsh-rabbit"))
      .toBe(true);
    expect(coreEcologyCanPursueLivingActor("marsh-fox", "deer"))
      .toBe(false);
    expect(coreEcologyTrophicPerceivedClass("marsh-fox", "deer")).toBeNull();
    expect(coreEcologyTrophicPerceivedClass("northern-harrier", "marsh-rabbit"))
      .toBe("live-prey");
    expect(coreEcologyCanPursueLivingActor("northern-harrier", "marsh-rabbit"))
      .toBe(true);
    expect(coreEcologyCanPursueLivingActor("northern-harrier", "southern-leopard-frog"))
      .toBe(false);
    expect(coreEcologyTrophicPerceivedClass(
      "northern-harrier",
      "southern-leopard-frog",
    )).toBeNull();
    expect(coreEcologyTrophicPerceivedClass("gray-wolf", "marsh-rabbit"))
      .toBe("live-prey");
    expect(coreEcologyCanPursueLivingActor("gray-wolf", "marsh-rabbit"))
      .toBe(true);
    expect(coreEcologyCanResolveMortalityTarget("gray-wolf", "marsh-rabbit"))
      .toBe(true);
    for (const subject of ["deer", "elk"] as const) {
      expect(coreEcologyTrophicPerceivedClass("gray-wolf", subject)).toBe("live-prey");
      expect(coreEcologyCanPursueLivingActor("gray-wolf", subject)).toBe(true);
      expect(coreEcologyCanResolveMortalityTarget("gray-wolf", subject)).toBe(false);
    }
    expect(coreEcologyCanResolveMortalityTarget("domestic-cat", "marsh-rabbit"))
      .toBe(false);
  });

  it("makes pressure reciprocal without declaring a lethal outcome", () => {
    expect(coreEcologyTrophicPerceivedClass("marsh-rabbit", "marsh-fox"))
      .toBe("predator");
    expect(coreEcologyTrophicPerceivedClass("marsh-rabbit", "domestic-dog"))
      .toBe("predator");
    expect(coreEcologyTrophicPerceivedClass("marsh-fox", "domestic-dog"))
      .toBe("predator");
    expect(coreEcologyTrophicPerceivedClass("marsh-fox", "black-bear"))
      .toBe("large-predator");
    expect(coreEcologyTrophicPerceivedClass("human", "marsh-fox")).toBeNull();
  });

  it("retains established relationships and supports neutral coexistence", () => {
    expect(coreEcologyTrophicPerceivedClass("deer", "black-bear"))
      .toBe("large-predator");
    expect(coreEcologyTrophicPerceivedClass("black-bear", "deer"))
      .toBe("live-prey");
    expect(coreEcologyCanPursueLivingActor("black-bear", "deer")).toBe(true);
    expect(coreEcologyCanResolveMortalityTarget("black-bear", "deer")).toBe(false);
    expect(coreEcologyTrophicPerceivedClass("domestic-cat", "domestic-dog"))
      .toBe("predator");
    expect(coreEcologyTrophicPerceivedClass("domestic-cat", "domestic-cat"))
      .toBe("food-competitor");
    expect(coreEcologyTrophicPerceivedClass("deer", "domestic-dog")).toBeNull();
    expect(coreEcologyTrophicPerceivedClass("gull", "deer")).toBeNull();
  });

  it("corrects the former size-blind cat and deer classification", () => {
    expect(coreEcologyTrophicPerceivedClass("domestic-cat", "deer")).toBeNull();
    expect(coreEcologyTrophicPerceivedClass("deer", "domestic-cat")).toBeNull();
  });

  it("keeps crow mobbing separate from prey identity and requires observed mobbing for reverse pressure", () => {
    expect(coreEcologyTrophicPerceivedClass("fish-crow", "northern-harrier"))
      .toBe("aerial-predator");
    expect(coreEcologyTrophicPerceivedClass("northern-harrier", "fish-crow"))
      .toBeNull();
    expect(coreEcologyCanPursueLivingActor("northern-harrier", "fish-crow"))
      .toBe(false);
    expect(coreEcologyTrophicPerceivedClass(
      "northern-harrier",
      "fish-crow",
      { subjectActivity: "mobbing" },
    )).toBe("mobbing-pressure");
    expect(coreEcologyTrophicPerceivedClass(
      "marsh-fox",
      "fish-crow",
      { subjectActivity: "mobbing" },
    )).toBeNull();
  });

  it("lets lawful dog and bear pressure interrupt a harrier without inventing harm", () => {
    expect(coreEcologyTrophicPerceivedClass("northern-harrier", "domestic-dog"))
      .toBe("predator");
    expect(coreEcologyTrophicPerceivedClass("northern-harrier", "black-bear"))
      .toBe("large-predator");
  });

  it("recognizes aquatic-foraging pressure through shared capabilities without creating pursuit", () => {
    expect(coreEcologyTrophicPerceivedClass(
      "atlantic-silverside",
      "snowy-egret",
    )).toBe("aquatic-foraging-pressure");
    expect(coreEcologyTrophicPerceivedClass(
      "atlantic-marsh-fiddler-crab",
      "snowy-egret",
    )).toBe("aquatic-foraging-pressure");
    expect(coreEcologyTrophicPerceivedClass(
      "snowy-egret",
      "atlantic-silverside",
    )).toBeNull();
    expect(coreEcologyTrophicPerceivedClass(
      "snowy-egret",
      "atlantic-marsh-fiddler-crab",
    )).toBeNull();
    expect(coreEcologyCanPursueLivingActor("snowy-egret", "atlantic-silverside"))
      .toBe(false);
    expect(coreEcologyCanPursueLivingActor(
      "snowy-egret",
      "atlantic-marsh-fiddler-crab",
    )).toBe(false);

    // A newly admitted amphibious forager plugs into the same broad trophic
    // seam: anonymous aquatic populations perceive pressure, while no direct
    // capture, harm, or species-pair pursuit is invented.
    expect(coreEcologyTrophicPerceivedClass(
      "atlantic-silverside",
      "north-american-river-otter",
    )).toBe("aquatic-foraging-pressure");
    expect(coreEcologyTrophicPerceivedClass(
      "atlantic-marsh-fiddler-crab",
      "north-american-river-otter",
    )).toBe("aquatic-foraging-pressure");
    expect(coreEcologyTrophicPerceivedClass(
      "north-american-river-otter",
      "atlantic-silverside",
    )).toBeNull();
    expect(coreEcologyCanPursueLivingActor(
      "north-american-river-otter",
      "atlantic-silverside",
    )).toBe(false);
  });

  it("is total and deterministic across the declared roster", () => {
    const first = new Map<string, unknown>();
    for (const observer of LIVING_ACTOR_SPECIES) {
      for (const subject of LIVING_ACTOR_SPECIES) {
        const key = `${observer}->${subject}`;
        const value = coreEcologyTrophicPerceivedClass(observer, subject);
        first.set(key, value);
        expect(coreEcologyTrophicPerceivedClass(observer, subject)).toBe(value);
      }
    }
    expect(first.size).toBe(LIVING_ACTOR_SPECIES.length ** 2);
    expect(new Set(CORE_WILDLIFE_SPECIES).size).toBe(CORE_WILDLIFE_SPECIES.length);
  });

  it("does not manufacture a pursuit for non-wildlife observers", () => {
    for (const observer of ["human", "domestic-dog"] as const satisfies readonly LivingActorSpecies[]) {
      for (const subject of LIVING_ACTOR_SPECIES) {
        expect(coreEcologyCanPursueLivingActor(observer, subject)).toBe(false);
      }
    }
  });
});
