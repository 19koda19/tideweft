import { describe, expect, it } from "vitest";

import { LIVING_ACTOR_SPECIES } from "./livingActor";
import type { LivingActorSpecies } from "./livingSpeciesRegistry";
import {
  LIVING_SPECIES_CAPABILITY_SCALE,
  LIVING_SPECIES_CATALOG,
  LIVING_SPECIES_INTERACTION_TARGET_CLASSES,
  canonicalizeLivingSpeciesCatalog,
  canonicalizeLivingSpeciesModule,
  createLivingSpeciesCatalog,
  livingSpeciesModule,
  type LivingSpeciesModule,
} from "./livingSpeciesCatalog";

function cloneModule(species: LivingActorSpecies): LivingSpeciesModule {
  const module = livingSpeciesModule(species);
  if (module === null) throw new Error(`Missing built-in species module ${species}`);
  return structuredClone(module);
}

function fixedAxis(id: string) {
  return {
    id,
    representation: "fixed-point" as const,
    minimum: 0,
    maximum: LIVING_SPECIES_CAPABILITY_SCALE,
  };
}

describe("Living Weft species module catalog", () => {
  it("registers exactly the implemented identity owners, in stable order", () => {
    expect(LIVING_SPECIES_CATALOG.modules.map(({ speciesId }) => speciesId))
      .toEqual([...LIVING_ACTOR_SPECIES].sort());
    expect(LIVING_SPECIES_CATALOG.modules.map(({ moduleId }) => moduleId)).toEqual([
      "living-species:black-bear:v1",
      "living-species:brown-rat:v1",
      "living-species:deer:v1",
      "living-species:domestic-cat:v1",
      "living-species:domestic-dog:v1",
      "living-species:gull:v1",
      "living-species:human:v1",
      "living-species:marsh-fox:v1",
      "living-species:marsh-rabbit:v1",
    ]);
    expect(Object.isFrozen(LIVING_SPECIES_CATALOG)).toBe(true);
    expect(Object.isFrozen(LIVING_SPECIES_CATALOG.modules[0]?.physiology.conditions)).toBe(true);
    expect(livingSpeciesModule("wolf")).toBeNull();
  });

  it("keeps individual wildlife identity over habitat-derived hybrid population patches", () => {
    for (const species of ["deer", "gull", "black-bear"] as const) {
      const module = livingSpeciesModule(species);
      expect(module).not.toBeNull();
      expect(module?.identity.form).toBe("individual");
      expect(module?.morphology.model).toBe("individual");
      expect(module?.habitat).toMatchObject({
        implementation: "active",
        ownerId: "game:core-ecology-habitat:v1",
        migrationModel: "none",
      });
      expect(module?.population).toMatchObject({
        implementation: "active",
        ownerId: "game:core-ecology:v2",
        strategy: "hybrid-population",
        materialization: "mixed",
        authoritativeUnit: "hybrid",
        dematerialization: "reconcile-hybrid-state",
        coarseSimulation: true,
      });
      expect(module?.population.stateAxes.map(({ id }) => id)).toEqual([
        "habitat-capacity",
        "population-pressure",
        "population-size",
        "population-trend",
      ]);
      expect(module?.population.carryingCapacityInputs).toEqual([
        "climate",
        "cover",
        "eligible-tiles",
        "food",
        "nesting",
        "predator-pressure",
        "suitable-tiles",
        "water",
        "weighted-habitat-area",
      ]);
      expect(module?.activity.offscreenModel).toBe("individual");
      expect(module?.lifeHistory).toMatchObject({
        dynamicAging: false,
        reproduction: "unimplemented",
        mortality: "unimplemented",
      });
      expect(module?.health).toMatchObject({
        injuryAxis: null,
        incapacitation: false,
        causalDeath: false,
        recovery: false,
      });
    }

    expect(livingSpeciesModule("deer")?.habitat.habitatClasses)
      .toEqual(["marsh", "meadow", "ridge"]);
    expect(livingSpeciesModule("gull")?.habitat.habitatClasses)
      .toEqual(["marsh", "meadow", "ridge", "tidal-flat"]);
    expect(livingSpeciesModule("black-bear")?.habitat.habitatClasses)
      .toEqual(["marsh", "meadow", "ridge"]);

    expect(livingSpeciesModule("deer")?.social).toMatchObject({
      implementation: "active",
      groupModel: "group",
      group: {
        status: "active",
        organizationKinds: ["herd"],
        stableIdNamespace: "HERD",
        membership: true,
        informationPropagation: true,
        splitMerge: true,
        separationReunion: true,
      },
    });
    expect(livingSpeciesModule("gull")?.social).toMatchObject({
      implementation: "active",
      groupModel: "group",
      group: {
        status: "active",
        organizationKinds: ["flock"],
        stableIdNamespace: "FLOCK",
        membership: true,
        informationPropagation: true,
        splitMerge: true,
        separationReunion: true,
      },
    });
    expect(livingSpeciesModule("black-bear")?.social).toMatchObject({
      implementation: "foundation",
      groupModel: "solitary",
      group: { status: "unimplemented", representation: "none" },
    });
    expect(livingSpeciesModule("gull")?.morphology.dynamicOverlays)
      .toContain("visible-flock-summary");
    expect(livingSpeciesModule("gull")?.identity.form).not.toBe("hybrid");
    expect(livingSpeciesModule("gull")?.population.authoritativeUnit).toBe("hybrid");
    for (const species of ["deer", "black-bear"] as const) {
      expect(livingSpeciesModule(species)?.locomotion).toMatchObject({
        media: [
          { medium: "land", relativeCapability: LIVING_SPECIES_CAPABILITY_SCALE },
          { medium: "shallow-water", relativeCapability: 650_000 },
        ],
        movementVerbs: ["wade", "walk"],
        terrainAffordances: ["land", "standable-shallow-water"],
      });
    }
    expect(livingSpeciesModule("gull")?.locomotion.media)
      .toEqual([{ medium: "air", relativeCapability: LIVING_SPECIES_CAPABILITY_SCALE }]);
  });

  it("models the landed Settlement Shadows rat aggregate and cat without inherited fallbacks", () => {
    const rat = livingSpeciesModule("brown-rat");
    const cat = livingSpeciesModule("domestic-cat");

    expect(rat).toMatchObject({
      profile: {
        implementation: "active",
        taxonomicClass: "mammal",
        companionEligibility: "never",
      },
      identity: {
        implementation: "active",
        ownerId: "game:core-ecology:v3",
        form: "aggregate",
        stableIdNamespace: "RAT-AREA",
      },
      morphology: { model: "aggregate" },
      spatial: { positionModel: "segmented-area", authoritativeHeading: false },
      population: {
        implementation: "active",
        strategy: "aggregate-field",
        materialization: "threshold",
        maxMaterializedPerRegion: 0,
        authoritativeUnit: "population-patch",
        dematerialization: "reconcile-population-state",
      },
      physiology: { implementation: "foundation" },
      locomotion: {
        implementation: "active",
        decisionModel: "aggregate",
        crossRegion: false,
      },
      activity: {
        implementation: "active",
        decisionModel: "aggregate",
        offscreenModel: "aggregate",
      },
      diet: { implementation: "foundation", mode: "omnivore" },
      social: { implementation: "foundation", groupModel: "variable" },
      sound: {
        implementation: "active",
        ownerId: "audio:soundscape:v1",
        repertoire: ["rat-rustle"],
        communicationSignals: [],
        accessibilityCues: ["direct-observation-caption"],
      },
      cognition: { implementation: "foundation", model: "aggregate" },
      evidence: {
        status: "active",
        ownerId: "game:core-ecology:v3",
        decayOwnerId: "game:core-ecology:v3",
        produces: ["gnaw-mark", "shelter-sign", "tracks"],
      },
      environment: {
        weather: {
          status: "active",
          ownerId: "game:core-ecology-small-world:v2",
          inputs: ["rain-intensity", "terrain-exposure"],
          outputs: ["activity-pressure", "displacement-pressure"],
        },
      },
      about: {
        implementation: "active",
        observableFields: ["evidence-kind", "evidence-scale", "species"],
      },
      persistence: { implementation: "active" },
    });
    expect(rat?.profile.ecologicalClasses).toEqual([
      "forager",
      "omnivore",
      "prey",
      "scavenger",
      "small-prey",
    ]);
    expect(rat?.locomotion).toMatchObject({
      media: [{ medium: "land", relativeCapability: LIVING_SPECIES_CAPABILITY_SCALE }],
      movementVerbs: ["scurry"],
      terrainAffordances: ["land"],
    });
    expect(rat?.social.group).toMatchObject({ status: "unimplemented", representation: "none" });
    expect(rat).toMatchObject({
      interactions: { implementation: "foundation" },
      health: { implementation: "unimplemented", causalDeath: false },
      lifeHistory: {
        implementation: "foundation",
        reproduction: "unimplemented",
        mortality: "unimplemented",
      },
      aftermath: { implementation: "unimplemented", carcassModel: "none" },
    });

    expect(cat).toMatchObject({
      profile: {
        implementation: "active",
        taxonomicClass: "mammal",
        companionEligibility: "never",
      },
      identity: { implementation: "active", form: "individual", stableIdNamespace: "CAT" },
      morphology: { model: "individual" },
      spatial: { positionModel: "segmented-point", authoritativeHeading: true },
      population: {
        implementation: "active",
        strategy: "hybrid-population",
        maxMaterializedPerRegion: 4,
      },
      physiology: { implementation: "active" },
      locomotion: {
        implementation: "active",
        decisionModel: "individual",
        crossRegion: true,
        media: [
          { medium: "land", relativeCapability: LIVING_SPECIES_CAPABILITY_SCALE },
          { medium: "shallow-water", relativeCapability: 300_000 },
        ],
        movementVerbs: ["wade", "walk"],
        terrainAffordances: ["land", "standable-shallow-water"],
      },
      activity: {
        implementation: "active",
        decisionModel: "individual",
        offscreenModel: "individual",
      },
      diet: { implementation: "foundation", mode: "carnivore" },
      social: {
        implementation: "foundation",
        groupModel: "solitary",
        actorToActorRelationships: false,
      },
      sound: {
        implementation: "active",
        ownerId: "audio:soundscape:v1",
        repertoire: ["cat-call"],
        communicationSignals: [],
        accessibilityCues: ["direct-observation-caption"],
      },
      cognition: {
        implementation: "active",
        model: "bounded-learning",
        memoryKinds: ["alarm", "disengagement", "food", "guard", "pursuit", "threat", "weather"],
      },
      evidence: {
        status: "active",
        ownerId: "game:core-wildlife-actor:v1",
        decayOwnerId: "game:core-wildlife-actor:v1",
        produces: ["wet-tracks"],
      },
      environment: {
        weather: {
          status: "active",
          ownerId: "game:core-ecology-perception:v1",
          inputs: ["rain-intensity"],
          outputs: ["stress"],
        },
      },
      about: {
        implementation: "active",
        observableFields: ["appearance", "behavior", "condition", "life-stage", "species"],
      },
      persistence: {
        implementation: "active",
        defaultTier: "regional",
        allowedTiers: ["regional"],
        promotionTriggers: [],
      },
    });
    expect(cat?.profile.ecologicalClasses).toEqual(["forager", "predator", "small-predator"]);
    expect(cat?.interactions.targets.find(({ targetClass }) => targetClass === "same-species"))
      .toMatchObject({
        policy: "available",
        perceptionChannels: ["vision"],
        appraisals: ["food-competition"],
        motivationAxes: ["hunger"],
        verbs: ["guard"],
      });
    expect(cat?.social.group).toMatchObject({ status: "unimplemented", representation: "none" });
    expect(cat).toMatchObject({
      interactions: { implementation: "foundation" },
      health: {
        implementation: "foundation",
        incapacitation: false,
        causalDeath: false,
        recovery: false,
      },
      lifeHistory: {
        implementation: "foundation",
        reproduction: "unimplemented",
        mortality: "unimplemented",
      },
      aftermath: { implementation: "unimplemented", carcassModel: "none" },
    });
  });

  it("declares the active marsh-edge individuals without inventing later mortality systems", () => {
    const rabbit = livingSpeciesModule("marsh-rabbit");
    const fox = livingSpeciesModule("marsh-fox");

    for (const module of [rabbit, fox]) {
      expect(module).toMatchObject({
        profile: {
          implementation: "active",
          ownerId: "sim:core-wildlife-identity:v1",
          taxonomicClass: "mammal",
        },
        identity: {
          implementation: "active",
          ownerId: "sim:core-wildlife-identity:v1",
          form: "individual",
        },
        morphology: {
          implementation: "active",
          ownerId: "sim:core-wildlife-identity:v1",
          model: "individual",
        },
        habitat: {
          implementation: "active",
          ownerId: "game:core-ecology-habitat:v3",
          migrationModel: "none",
        },
        spatial: {
          implementation: "active",
          ownerId: "game:living-actor-address:v1",
          positionModel: "segmented-point",
          signedRegions: true,
          extremeRegions: true,
        },
        population: {
          implementation: "active",
          ownerId: "game:core-ecology:v3",
          strategy: "hybrid-population",
          materialization: "mixed",
          authoritativeUnit: "hybrid",
          dematerialization: "reconcile-hybrid-state",
          coarseSimulation: true,
        },
        physiology: {
          implementation: "active",
          ownerId: "game:core-wildlife-actor:v1",
        },
        locomotion: {
          implementation: "active",
          ownerId: "game:core-wildlife-locomotion-profile:v1",
          decisionModel: "individual",
          crossRegion: true,
        },
        activity: {
          implementation: "active",
          ownerId: "game:core-wildlife-actor:v1",
          decisionModel: "individual",
          offscreenModel: "individual",
          circadian: { status: "unimplemented", ownerId: null },
        },
        social: {
          implementation: "foundation",
          ownerId: "game:core-ecology-perception:v1",
        },
        cognition: {
          implementation: "active",
          ownerId: "game:core-wildlife-actor:v1",
          attentionOwnerId: "sim:actor-perception:v2",
          model: "bounded-learning",
        },
        lifeHistory: {
          implementation: "foundation",
          dynamicAging: false,
          reproduction: "unimplemented",
          mortality: "unimplemented",
        },
        health: {
          implementation: "foundation",
          injuryAxis: null,
          incapacitation: false,
          causalDeath: false,
          recovery: false,
        },
        aftermath: {
          implementation: "unimplemented",
          ownerId: null,
          decayOwnerId: null,
          carcassModel: "none",
          persistentIdentity: false,
          resourceClasses: [],
          evidenceOutputs: [],
        },
        about: {
          implementation: "active",
          ownerId: "game:wildlife-about:v1",
          directObservationRequired: true,
        },
        persistence: {
          implementation: "active",
          ownerId: "game:core-ecology:v3",
          generationMigration: "preserve-materialized-identity",
        },
        inventory: { implementation: "unimplemented", model: "none" },
      });
      expect(module?.physiology.conditions.map(({ id }) => id)).toEqual([
        "exhaustion",
        "health",
        "stress",
      ]);
      expect(module?.cognition.memoryKinds).toEqual([
        "alarm",
        "disengagement",
        "food",
        "guard",
        "movement",
        "pursuit",
        "threat",
      ]);
      expect(module?.environment).toMatchObject({
        fire: { status: "unimplemented", ownerId: null },
        livingCover: { status: "unimplemented", ownerId: null },
        possibility: { status: "unimplemented", ownerId: null },
        terrain: { status: "unimplemented", ownerId: null },
        tide: { status: "unimplemented", ownerId: null },
        water: { status: "unimplemented", ownerId: null },
        weather: { status: "unimplemented", ownerId: null },
      });
    }

    expect(rabbit).toMatchObject({
      profile: {
        ecologicalClasses: ["alarm-source", "forager", "prey", "small-prey"],
      },
      habitat: { habitatClasses: ["marsh", "meadow", "settlement-edge"] },
      identity: { stableIdNamespace: "RABBIT" },
      diet: { mode: "herbivore" },
      foodWeb: {
        consumedBy: ["large-predator", "small-predator"],
        ecologicalEffects: ["alarm-information", "bounded-food-pressure", "small-prey-support"],
      },
      locomotion: {
        media: [
          { medium: "land", relativeCapability: LIVING_SPECIES_CAPABILITY_SCALE },
          { medium: "shallow-water", relativeCapability: 450_000 },
        ],
        movementVerbs: ["hop", "wade"],
      },
      social: { communicationChannels: ["hearing"], groupModel: "variable" },
      sound: {
        implementation: "active",
        ownerId: "audio:soundscape:v1",
        repertoire: ["rabbit-thump"],
        communicationSignals: ["rabbit-thump"],
        accessibilityCues: ["direct-observation-caption"],
      },
      evidence: {
        status: "active",
        ownerId: "game:core-wildlife-actor:v1",
        decayOwnerId: "game:core-wildlife-actor:v1",
        produces: ["paired-tracks"],
        interprets: [],
      },
    });
    expect(rabbit?.interactions.targets.find(({ targetClass }) => targetClass === "smaller-prey"))
      .toBeUndefined();

    expect(fox).toMatchObject({
      profile: {
        ecologicalClasses: ["forager", "omnivore", "predator", "scavenger", "small-predator"],
      },
      habitat: { habitatClasses: ["marsh", "meadow", "ridge", "settlement-edge"] },
      identity: { stableIdNamespace: "FOX" },
      diet: { mode: "omnivore" },
      foodWeb: {
        competesWith: ["domestic-cat", "gull"],
        ecologicalEffects: ["bounded-food-pressure", "small-prey-pressure"],
      },
      locomotion: {
        media: [
          { medium: "land", relativeCapability: LIVING_SPECIES_CAPABILITY_SCALE },
          { medium: "shallow-water", relativeCapability: 600_000 },
        ],
        movementVerbs: ["trot", "wade", "walk"],
      },
      social: { communicationChannels: [], groupModel: "solitary" },
      sound: {
        implementation: "active",
        ownerId: "audio:soundscape:v1",
        repertoire: ["fox-yip"],
        communicationSignals: [],
        accessibilityCues: ["direct-observation-caption"],
      },
      evidence: {
        status: "active",
        ownerId: "game:core-wildlife-actor:v1",
        decayOwnerId: "game:core-wildlife-actor:v1",
        produces: ["canid-pawprints"],
        interprets: [],
      },
    });
    expect(fox?.interactions.targets.find(({ targetClass }) => targetClass === "smaller-prey"))
      .toMatchObject({
        verbs: ["pursue"],
        escalationConstraints: ["bounded-pursuit", "direct-perception-required"],
      });
  });

  it("makes registration order irrelevant while persisted catalog order is canonical", () => {
    const human = cloneModule("human");
    const dog = cloneModule("domestic-dog");
    const forward = createLivingSpeciesCatalog([human, dog]);
    const reverse = createLivingSpeciesCatalog([dog, human]);

    expect(reverse).toEqual(forward);
    expect(canonicalizeLivingSpeciesCatalog(forward)).toEqual(forward);
    expect(canonicalizeLivingSpeciesCatalog({
      version: forward?.version,
      modules: [...(forward?.modules ?? [])].reverse(),
    })).toBeNull();
  });

  it("rejects incomplete modules and unknown or extra shape at every boundary", () => {
    const dog = cloneModule("domestic-dog") as LivingSpeciesModule & Record<string, unknown>;
    const { cognition: _missing, ...withoutCognition } = dog;
    expect(canonicalizeLivingSpeciesModule(withoutCognition)).toBeNull();
    expect(canonicalizeLivingSpeciesModule({ ...dog, flavorText: "friendly" })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      spatial: { ...dog.spatial, hiddenTeleportRadius: 99 },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesCatalog({
      version: LIVING_SPECIES_CATALOG.version,
      modules: LIVING_SPECIES_CATALOG.modules,
      unexpectedMetadata: true,
    })).toBeNull();
  });

  it("rejects duplicate species, module, and persistent-ID namespace collisions", () => {
    const dog = cloneModule("domestic-dog");
    const human = cloneModule("human");
    expect(createLivingSpeciesCatalog([dog, dog])).toBeNull();

    const moduleCollision = {
      ...human,
      speciesId: dog.speciesId,
      moduleId: dog.moduleId,
    };
    expect(createLivingSpeciesCatalog([dog, moduleCollision])).toBeNull();

    const namespaceCollision = {
      ...human,
      identity: { ...human.identity, stableIdNamespace: dog.identity.stableIdNamespace },
    };
    expect(createLivingSpeciesCatalog([dog, namespaceCollision])).toBeNull();

    const groupNamespaceCollision = {
      ...dog,
      social: {
        ...dog.social,
        communicationChannels: ["vision" as const],
        groupModel: "group" as const,
        group: {
          status: "foundation" as const,
          ownerId: "sim:living-group-state:v1",
          representation: "membership" as const,
          organizationKinds: ["pack"],
          stateAxes: [fixedAxis("cohesion")],
          leadershipModel: "emergent" as const,
          coordinationVerbs: ["alarm", "follow"],
          stableIdentity: true,
          stableIdNamespace: human.identity.stableIdNamespace,
          generationVersion: 1,
          membership: true,
          informationPropagation: true,
          splitMerge: false,
          separationReunion: true,
          sharedMemory: true,
        },
      },
    };
    expect(canonicalizeLivingSpeciesModule(groupNamespaceCollision)).not.toBeNull();
    expect(createLivingSpeciesCatalog([human, groupNamespaceCollision])).toBeNull();
  });

  it("binds identity forms and population representations without conflating the two", () => {
    const dog = cloneModule("domestic-dog");
    expect(canonicalizeLivingSpeciesModule(dog)).not.toBeNull();

    const individualWithHybridPopulation = canonicalizeLivingSpeciesModule({
      ...dog,
      population: {
        ...dog.population,
        implementation: "foundation",
        ownerId: "game:test-population:v1",
        strategy: "hybrid-population",
        materialization: "mixed",
        coarseSimulation: true,
        authoritativeUnit: "hybrid",
        dematerialization: "reconcile-hybrid-state",
        stateAxes: [fixedAxis("population-pressure")],
        carryingCapacityInputs: ["habitat-capacity"],
      },
      activity: {
        ...dog.activity,
        offscreenModel: "individual",
      },
    });
    expect(individualWithHybridPopulation).toMatchObject({
      identity: { form: "individual", parentSpeciesIds: [] },
      morphology: { model: "individual" },
      population: { strategy: "hybrid-population", authoritativeUnit: "hybrid" },
    });

    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      identity: { ...dog.identity, form: "aggregate" },
    })).toBeNull();
    const hybrid = canonicalizeLivingSpeciesModule({
      ...dog,
      identity: {
        ...dog.identity,
        form: "hybrid",
        parentSpeciesIds: ["lineage-a", "lineage-b"],
      },
      population: {
        ...dog.population,
        strategy: "hybrid-population",
        materialization: "mixed",
        coarseSimulation: true,
        authoritativeUnit: "hybrid",
        dematerialization: "reconcile-hybrid-state",
        stateAxes: [{
          id: "population-pressure",
          representation: "fixed-point",
          minimum: 0,
          maximum: LIVING_SPECIES_CAPABILITY_SCALE,
        }],
        carryingCapacityInputs: ["habitat-capacity"],
      },
      morphology: { ...dog.morphology, model: "hybrid" },
      habitat: { ...dog.habitat, migrationModel: "hybrid" },
      lifeHistory: { ...dog.lifeHistory, model: "hybrid" },
      spatial: { ...dog.spatial, positionModel: "segmented-hybrid" },
      locomotion: { ...dog.locomotion, decisionModel: "hybrid" },
      activity: {
        ...dog.activity,
        decisionModel: "hybrid",
        offscreenModel: "hybrid",
      },
    });
    expect(hybrid?.identity.form).toBe("hybrid");
    expect(createLivingSpeciesCatalog(hybrid === null ? [] : [hybrid])).toBeNull();
    // Hybrid lineage references must resolve inside a complete catalog.
    expect(canonicalizeLivingSpeciesModule({
      ...hybrid,
      identity: {
        ...hybrid?.identity,
        parentSpeciesIds: ["domestic-dog", "lineage-b"],
      },
    })).toBeNull(); // A species may not list itself as a hybrid parent.

    const human = cloneModule("human");
    const aggregate = canonicalizeLivingSpeciesModule({
      ...human,
      identity: { ...human.identity, form: "aggregate" },
      morphology: { ...human.morphology, model: "aggregate" },
      lifeHistory: { ...human.lifeHistory, model: "aggregate" },
      spatial: { ...human.spatial, positionModel: "segmented-area" },
      population: {
        ...human.population,
        compatibilityScope: false,
        strategy: "aggregate-field",
        materialization: "threshold",
        coarseSimulation: true,
        authoritativeUnit: "population-patch",
        dematerialization: "reconcile-population-state",
        stateAxes: [{
          id: "population-pressure",
          representation: "fixed-point",
          minimum: 0,
          maximum: LIVING_SPECIES_CAPABILITY_SCALE,
        }],
        carryingCapacityInputs: ["habitat-capacity"],
      },
      locomotion: { ...human.locomotion, decisionModel: "aggregate" },
      activity: {
        ...human.activity,
        decisionModel: "aggregate",
        offscreenModel: "aggregate",
      },
    });
    expect(aggregate?.identity.form).toBe("aggregate");

    const sessileAggregate = canonicalizeLivingSpeciesModule({
      ...aggregate,
      locomotion: {
        ...aggregate?.locomotion,
        mode: "sessile",
        crossRegion: false,
        media: [],
        movementVerbs: [],
        terrainAffordances: ["rooted-substrate"],
      },
    });
    expect(sessileAggregate?.locomotion).toMatchObject({ mode: "sessile", media: [] });
  });

  it("represents flying, aquatic, and subterranean movement without species pathing hooks", () => {
    const dog = cloneModule("domestic-dog");
    const flying = canonicalizeLivingSpeciesModule({
      ...dog,
      locomotion: {
        ...dog.locomotion,
        media: [
          { medium: "air", relativeCapability: 900_000 },
          { medium: "land", relativeCapability: 300_000 },
          { medium: "structure", relativeCapability: 600_000 },
        ],
        movementVerbs: ["fly", "glide", "perch"],
        terrainAffordances: ["open-air", "perch", "tree-canopy"],
      },
    });
    const aquatic = canonicalizeLivingSpeciesModule({
      ...dog,
      senses: {
        ...dog.senses,
        channels: [
          dog.senses.channels[0],
          dog.senses.channels[1],
          { channel: "touch", relativeCapability: 940_000, modalities: ["water-pressure"] },
          dog.senses.channels[2],
        ],
      },
      locomotion: {
        ...dog.locomotion,
        media: [
          { medium: "deep-water", relativeCapability: 1_000_000 },
          { medium: "shallow-water", relativeCapability: 700_000 },
        ],
        movementVerbs: ["dive", "swim"],
        terrainAffordances: ["current", "open-water"],
      },
    });
    const subterranean = canonicalizeLivingSpeciesModule({
      ...dog,
      senses: {
        ...dog.senses,
        channels: [
          dog.senses.channels[0],
          dog.senses.channels[1],
          { channel: "touch", relativeCapability: 980_000, modalities: ["substrate-vibration"] },
          dog.senses.channels[2],
        ],
      },
      locomotion: {
        ...dog.locomotion,
        media: [
          { medium: "land", relativeCapability: 300_000 },
          { medium: "subterranean", relativeCapability: 1_000_000 },
        ],
        movementVerbs: ["burrow", "crawl"],
        terrainAffordances: ["loose-soil", "tunnel"],
      },
    });

    expect(flying?.locomotion.movementVerbs).toEqual(["fly", "glide", "perch"]);
    expect(aquatic?.senses.channels.find(({ channel }) => channel === "touch")?.modalities)
      .toEqual(["water-pressure"]);
    expect(subterranean?.locomotion.media.map(({ medium }) => medium))
      .toEqual(["land", "subterranean"]);
  });

  it("represents stable schools and colonies with conserved group state", () => {
    const dog = cloneModule("domestic-dog");
    const school = canonicalizeLivingSpeciesModule({
      ...dog,
      profile: { ...dog.profile, companionEligibility: "never" },
      identity: { ...dog.identity, form: "aggregate" },
      morphology: { ...dog.morphology, model: "aggregate" },
      habitat: { ...dog.habitat, migrationModel: "population" },
      lifeHistory: {
        ...dog.lifeHistory,
        model: "aggregate",
        reproduction: "population-recruitment",
        mortality: "population-turnover",
      },
      spatial: { ...dog.spatial, positionModel: "segmented-area" },
      population: {
        ...dog.population,
        strategy: "aggregate-field",
        materialization: "threshold",
        coarseSimulation: true,
        authoritativeUnit: "group-records",
        dematerialization: "reconcile-group-state",
        stateAxes: [fixedAxis("population-pressure")],
        carryingCapacityInputs: ["food-availability", "habitat-capacity"],
      },
      locomotion: {
        ...dog.locomotion,
        decisionModel: "aggregate",
        media: [{ medium: "deep-water", relativeCapability: 1_000_000 }],
        movementVerbs: ["swim"],
        terrainAffordances: ["current", "open-water"],
      },
      activity: {
        ...dog.activity,
        decisionModel: "aggregate",
        offscreenModel: "aggregate",
      },
      social: {
        ...dog.social,
        actorToActorRelationships: false,
        communicationChannels: ["vision"],
        groupModel: "group",
        relationshipAxes: [],
        group: {
          status: "foundation",
          ownerId: "sim:living-group-state:v1",
          representation: "group-actor",
          organizationKinds: ["school"],
          stateAxes: [fixedAxis("cohesion")],
          leadershipModel: "emergent",
          coordinationVerbs: ["alarm", "align", "regroup"],
          stableIdentity: true,
          stableIdNamespace: "DSG",
          generationVersion: 1,
          membership: true,
          informationPropagation: true,
          splitMerge: true,
          separationReunion: true,
          sharedMemory: true,
        },
      },
      cognition: { ...dog.cognition, model: "aggregate" },
    });
    expect(school?.population).toMatchObject({
      authoritativeUnit: "group-records",
      dematerialization: "reconcile-group-state",
    });
    expect(school?.social.group).toMatchObject({
      stableIdentity: true,
      informationPropagation: true,
      splitMerge: true,
      separationReunion: true,
    });
    if (school === null) throw new Error("School fixture must satisfy the aggregate group contract");

    const sessileColony = canonicalizeLivingSpeciesModule({
      ...school,
      locomotion: {
        ...school.locomotion,
        mode: "sessile",
        crossRegion: false,
        media: [],
        movementVerbs: [],
        terrainAffordances: ["rooted-substrate"],
      },
      cognition: {
        ...school.cognition,
        model: "noncognitive",
        attentionOwnerId: null,
        maxMemories: 0,
        memoryKinds: [],
        knowledgeSources: [],
        inference: false,
      },
      social: {
        ...school.social,
        communicationChannels: [],
        group: {
          ...school.social.group,
          informationPropagation: false,
          sharedMemory: false,
        },
      },
    });
    expect(sessileColony?.locomotion).toMatchObject({ mode: "sessile", movementVerbs: [] });
    expect(sessileColony?.cognition).toMatchObject({ model: "noncognitive", attentionOwnerId: null });
  });

  it("uses broad ecological target affordances and rejects unsupported perception channels", () => {
    const dog = cloneModule("domestic-dog");
    expect(dog.interactions.targets.map(({ targetClass }) => targetClass)).toEqual(["human", "predator"]);
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      interactions: {
        ...dog.interactions,
        targets: dog.interactions.targets.map((target, index) => index === 0
          ? { ...target, perceptionChannels: ["touch"] }
          : target),
      },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      interactions: {
        ...dog.interactions,
        targets: dog.interactions.targets.map((target, index) => index === 0
          ? { ...target, policy: "intentional-no-response", verbs: ["approach"] }
          : target),
      },
    })).toBeNull();

    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      interactions: { ...dog.interactions, implementation: "active" },
    })).toBeNull();

    const currentTargets = new Map(dog.interactions.targets.map((target) => [target.targetClass, target]));
    const closedCoverage = LIVING_SPECIES_INTERACTION_TARGET_CLASSES.map((targetClass) => (
      currentTargets.get(targetClass) ?? {
        targetClass,
        policy: "intentional-no-response" as const,
        perceptionChannels: [],
        appraisals: [],
        motivationAxes: [],
        verbs: [],
        escalationConstraints: [],
        disengagementVerbs: [],
      }
    ));
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      interactions: {
        ...dog.interactions,
        implementation: "active",
        targets: closedCoverage,
      },
    })?.interactions.targets).toHaveLength(LIVING_SPECIES_INTERACTION_TARGET_CLASSES.length);
  });

  it("requires deep ecology contracts rather than accepting decorative bestiary rows", () => {
    const dog = cloneModule("domestic-dog") as LivingSpeciesModule & Record<string, unknown>;
    const { foodWeb: _foodWeb, ...withoutFoodWeb } = dog;
    expect(canonicalizeLivingSpeciesModule(withoutFoodWeb)).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      profile: { ...dog.profile, ecologicalClasses: [] },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      morphology: { ...dog.morphology, model: "aggregate" },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      lifeHistory: { ...dog.lifeHistory, reproduction: "population-recruitment" },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      health: { ...dog.health, vitalityAxis: "secret-health" },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      sound: {
        ...dog.sound,
        implementation: "foundation",
        ownerId: "game:dog-sound:v1",
        repertoire: ["bark"],
        communicationSignals: ["bark"],
      },
    })).toBeNull(); // Audible communication cannot bypass the shared hearing contract.
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      aftermath: {
        ...dog.aftermath,
        implementation: "foundation",
        ownerId: "game:dog-carcass:v1",
        decayOwnerId: "sim:carcass-decay:v1",
        carcassModel: "aggregate",
        persistentIdentity: true,
        resourceClasses: ["carrion"],
        evidenceOutputs: ["carcass-scent"],
      },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      social: {
        ...dog.social,
        territory: {
          ...dog.social.territory,
          model: "individual",
          ownerId: "sim:territory-state:v1",
        },
      },
    })).toBeNull();

    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      social: {
        ...dog.social,
        territory: {
          model: "individual",
          ownerId: "sim:territory-state:v1",
          anchorKinds: ["den", "home-range"],
          stateAxes: [fixedAxis("territorial-pressure")],
          dynamicInputs: ["disturbance", "food", "weather"],
        },
      },
    })?.social.territory.anchorKinds).toEqual(["den", "home-range"]);
  });

  it("enforces bounded fixed-point and safe-integer capability values", () => {
    const dog = cloneModule("domestic-dog");
    const badCapability = {
      ...dog,
      senses: {
        ...dog.senses,
        channels: dog.senses.channels.map((channel, index) => index === 0
          ? { ...channel, relativeCapability: LIVING_SPECIES_CAPABILITY_SCALE + 1 }
          : channel),
      },
    };
    expect(canonicalizeLivingSpeciesModule(badCapability)).toBeNull();

    const fractionalPopulation = {
      ...dog,
      population: { ...dog.population, maxMaterializedPerRegion: 4.5 },
    };
    expect(canonicalizeLivingSpeciesModule(fractionalPopulation)).toBeNull();

    const negativeZeroCadence = {
      ...dog,
      activity: { ...dog.activity, decisionCadenceTicks: -0 },
    };
    expect(canonicalizeLivingSpeciesModule(negativeZeroCadence)).toBeNull();
  });

  it("requires canonical unique ordering inside every set-like capability list", () => {
    const dog = cloneModule("domestic-dog");
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      senses: { ...dog.senses, channels: [...dog.senses.channels].reverse() },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      physiology: {
        ...dog.physiology,
        needs: [...dog.physiology.needs, dog.physiology.needs[0]],
      },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      about: {
        ...dog.about,
        learnedFields: [...dog.about.learnedFields, "species"].sort(),
      },
    })).toBeNull();
  });

  it("requires active systems to have owners and closed systems to claim nothing", () => {
    const dog = cloneModule("domestic-dog");
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      environment: {
        ...dog.environment,
        water: { ...dog.environment.water, ownerId: null },
      },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      environment: {
        ...dog.environment,
        possibility: {
          ...dog.environment.possibility,
          inputs: ["possibility-exposure"],
        },
      },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      evidence: {
        ...dog.evidence,
        produces: ["footprint"],
      },
    })).toBeNull();
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      about: { ...dog.about, implementation: "active", ownerId: null },
    })).toBeNull();
  });

  it("allows environment effects to mutate only declared condition axes", () => {
    const human = cloneModule("human");
    expect(canonicalizeLivingSpeciesModule({
      ...human,
      environment: {
        ...human.environment,
        weather: {
          ...human.environment.weather,
          outputs: ["cold-stress", "secret-morale", "wetness"],
        },
      },
    })).toBeNull();
  });

  it("keeps ABOUT knowledge-honest and communication inside supported senses", () => {
    const dog = cloneModule("domestic-dog");
    expect(dog.about.observableFields).not.toContain("temperament");
    expect(dog.about.learnedFields).toContain("temperament");
    expect(canonicalizeLivingSpeciesModule({
      ...dog,
      social: {
        ...dog.social,
        communicationChannels: ["hearing", "social", "vision"],
      },
    })).toBeNull();
  });

  it("declares current deliberate seams instead of pretending they are implemented", () => {
    for (const module of LIVING_SPECIES_CATALOG.modules) {
      expect(module.spatial).toMatchObject({
        positionModel: module.speciesId === "brown-rat" ? "segmented-area" : "segmented-point",
        signedRegions: true,
        extremeRegions: true,
      });
      expect(module.activity.circadian.status).toBe("unimplemented");
      expect(module.evidence.status).toBe(
        module.speciesId === "brown-rat"
          || module.speciesId === "domestic-cat"
          || module.speciesId === "marsh-rabbit"
          || module.speciesId === "marsh-fox"
          ? "active"
          : "unimplemented",
      );
      expect(module.environment.fire.status).toBe("unimplemented");
      expect(module.environment.livingCover.status).toBe("unimplemented");
      expect(module.environment.possibility.status).toBe("unimplemented");
      expect(module.environment.terrain.status).toBe("unimplemented");
      expect(module.environment.tide.status).toBe("unimplemented");
      expect(module.persistence.generationMigration).toBe("preserve-materialized-identity");
      expect(module.senses.implementation).toBe("foundation");
      expect(module.social.communicationChannels).toEqual(
        module.speciesId === "deer"
          || module.speciesId === "gull"
          || module.speciesId === "marsh-rabbit"
          ? ["hearing"]
          : [],
      );
      expect(module.social.group.status).toBe(
        module.speciesId === "deer" || module.speciesId === "gull"
          ? "active"
          : "unimplemented",
      );
      expect(module.inventory.implementation).toBe("unimplemented");
      expect(module.locomotion.crossRegion).toBe(
        module.speciesId === "domestic-cat"
          || module.speciesId === "marsh-rabbit"
          || module.speciesId === "marsh-fox",
      );
    }
    expect(livingSpeciesModule("brown-rat")?.environment.weather.status).toBe("active");
    expect(livingSpeciesModule("domestic-cat")?.environment.weather.status)
      .toBe("active");
    expect(livingSpeciesModule("human")?.population).toMatchObject({
      implementation: "active",
      compatibilityScope: true,
      maxMaterializedPerRegion: 42,
    });
    expect(livingSpeciesModule("domestic-dog")?.population).toMatchObject({
      implementation: "unimplemented",
      ownerId: null,
      compatibilityScope: false,
    });
    for (const species of ["deer", "gull", "black-bear"] as const) {
      expect(livingSpeciesModule(species)?.population).toMatchObject({
        implementation: "active",
        compatibilityScope: false,
        strategy: "hybrid-population",
        materialization: "mixed",
        coarseSimulation: true,
      });
    }
    expect(livingSpeciesModule("domestic-dog")?.persistence.implementation).toBe("foundation");
  });
});
