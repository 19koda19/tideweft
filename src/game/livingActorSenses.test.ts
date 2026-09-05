import { describe, expect, it } from "vitest";

import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import { createRegionCoord } from "../sim/regions";
import {
  collectLivingActorScentObservations,
  livingActorSenseProfile,
  type LivingActorScentFrameInput,
  type LivingActorScentStimulus,
} from "./livingActorSenses";
import { createLivingActorAddress } from "./livingActor";
import { LIVING_SPECIES_CATALOG } from "./livingSpeciesCatalog";
import type { LivingActorSpecies } from "./livingSpeciesRegistry";
import { createWorldPosition } from "./worldPosition";

function address(species: "human" | "domestic-dog", localX = 10_000) {
  return createLivingActorAddress({
    actorId: species === "human" ? "H-v1-sensor" : "D-R-v1-sensor/path",
    species,
    position: createWorldPosition(createRegionCoord(0, 0), localX, 10_000),
    persistence: species === "human" ? "promoted" : "regional",
  });
}

function frame(
  species: "human" | "domestic-dog",
  overrides: Partial<LivingActorScentFrameInput> = {},
): LivingActorScentFrameInput {
  return {
    observer: address(species),
    tick: 19,
    wind: { x: 0, y: 0 },
    rainIntensity: 0,
    stimuli: [{
      stimulusId: "pack:porter-1/food",
      perceivedClass: "food-scent",
      position: createWorldPosition(createRegionCoord(0, 0), 28_000, 10_000),
      sourceStrength: ACTOR_PERCEPTION_SCALE,
      packagingLeakage: ACTOR_PERCEPTION_SCALE,
    }],
    ...overrides,
  };
}

describe("shared living actor sensory profiles", () => {
  it("fails closed for a runtime species outside the implemented catalog", () => {
    expect(() => livingActorSenseProfile("otter" as never)).toThrow(/Unsupported sensory species/u);
  });

  it("uses one evaluator with species data instead of pair-specific detection", () => {
    const human = collectLivingActorScentObservations(frame("human"));
    const dog = collectLivingActorScentObservations(frame("domestic-dog"));

    expect(human).toEqual([]);
    expect(dog).toHaveLength(1);
    expect(livingActorSenseProfile("domestic-dog").scentSensitivity)
      .toBeGreaterThan(livingActorSenseProfile("human").scentSensitivity);
    expect(livingActorSenseProfile("black-bear").scentBaseRangeUnits)
      .toBeGreaterThan(livingActorSenseProfile("domestic-dog").scentBaseRangeUnits);
    expect(livingActorSenseProfile("gull").visionAcuity)
      .toBeGreaterThan(livingActorSenseProfile("human").visionAcuity);
  });

  it("derives every production sensory profile from the versioned species catalog", () => {
    expect(LIVING_SPECIES_CATALOG.modules.map(({ speciesId }) => speciesId)).toEqual([
      "black-bear",
      "brown-rat",
      "deer",
      "domestic-cat",
      "domestic-dog",
      "gull",
      "human",
      "marsh-fox",
      "marsh-rabbit",
    ]);
    for (const module of LIVING_SPECIES_CATALOG.modules) {
      const profile = livingActorSenseProfile(module.speciesId as LivingActorSpecies);
      expect(profile.visionAcuity).toBe(
        module.senses.channels.find(({ channel }) => channel === "vision")?.relativeCapability,
      );
      expect(profile.hearingSensitivity).toBe(
        module.senses.channels.find(({ channel }) => channel === "hearing")?.relativeCapability,
      );
      expect(profile.scentSensitivity).toBe(
        module.senses.channels.find(({ channel }) => channel === "scent")?.relativeCapability,
      );
    }
  });

  it("emits an opaque classified area and never the physical stimulus identity", () => {
    const source = frame("domestic-dog");
    const observation = collectLivingActorScentObservations(source)?.[0];

    expect(observation).toMatchObject({
      channel: "scent",
      observerId: source.observer.actorId,
      subjectId: null,
      perceivedClass: "food-scent",
      identification: "classified",
    });
    expect(observation?.id).not.toContain("porter-1");
    expect(observation?.area.center).not.toEqual(source.stimuli[0]?.position);
    expect(observation).not.toHaveProperty("stimulusId");
  });

  it("is independent of stimulus order and rejects duplicate source aliases", () => {
    const second = {
      stimulusId: "pack:porter-2/food",
      perceivedClass: "food-scent",
      position: createWorldPosition(createRegionCoord(0, 0), 25_000, 12_000),
      sourceStrength: 900_000,
      packagingLeakage: 900_000,
    } as const;
    const first = frame("domestic-dog");
    const stimuli = [...first.stimuli, second];
    const forward = collectLivingActorScentObservations({ ...first, stimuli });
    const reverse = collectLivingActorScentObservations({ ...first, stimuli: [...stimuli].reverse() });
    expect(reverse).toEqual(forward);
    expect(collectLivingActorScentObservations({ ...first, stimuli: [second, second] })).toBeNull();
  });

  it("lets real rain, wind, containment, and distance suppress contact", () => {
    const baseline = frame("domestic-dog");
    expect(collectLivingActorScentObservations(baseline)).toHaveLength(1);
    expect(collectLivingActorScentObservations({ ...baseline, rainIntensity: ACTOR_PERCEPTION_SCALE }))
      .toEqual([]);
    expect(collectLivingActorScentObservations({
      ...baseline,
      stimuli: baseline.stimuli.map((stimulus) => ({ ...stimulus, packagingLeakage: 0 })),
    })).toEqual([]);
    expect(collectLivingActorScentObservations({
      ...baseline,
      stimuli: baseline.stimuli.map((stimulus) => ({
        ...stimulus,
        position: createWorldPosition(createRegionCoord(1, 0), 20_000, 10_000),
      })),
    })).toEqual([]);
  });

  it("fails a malformed or oversized frame closed instead of accepting a subset", () => {
    const valid = frame("domestic-dog");
    expect(collectLivingActorScentObservations({
      ...valid,
      stimuli: [{
        ...valid.stimuli[0]!,
        hiddenItemId: "food-lot",
      } as unknown as LivingActorScentStimulus],
    })).toBeNull();
    expect(collectLivingActorScentObservations({
      ...valid,
      stimuli: Array.from({ length: 129 }, (_, index) => ({
        ...valid.stimuli[0]!,
        stimulusId: `food:${index}`,
      })),
    })).toBeNull();
  });
});
