import { describe, expect, it } from "vitest";
import { CORE_WILDLIFE_SPECIES } from "../sim/coreWildlifeIdentity";
import { LIVING_ACTOR_SPECIES, type LivingActorSpecies } from "./livingSpeciesRegistry";
import {
  coreEcologyCanPursueLivingActor,
  coreEcologyTrophicPerceivedClass,
} from "./coreEcologyTrophic";

describe("core ecology trophic capability resolver", () => {
  it("lets small predators recognize small prey without making deer fox prey", () => {
    expect(coreEcologyTrophicPerceivedClass("marsh-fox", "marsh-rabbit"))
      .toBe("live-prey");
    expect(coreEcologyCanPursueLivingActor("domestic-cat", "marsh-rabbit"))
      .toBe(true);
    expect(coreEcologyCanPursueLivingActor("marsh-fox", "deer"))
      .toBe(false);
    expect(coreEcologyTrophicPerceivedClass("marsh-fox", "deer")).toBeNull();
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
