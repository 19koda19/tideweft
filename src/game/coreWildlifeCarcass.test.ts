import { describe, expect, it } from "vitest";

import { ACTOR_PERCEPTION_SCALE } from "../sim/actorPerception";
import {
  generateCoreWildlifeIdentity,
  type CoreWildlifeSpecies,
} from "../sim/coreWildlifeIdentity";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { hashCanonical } from "../sim/util";
import {
  advanceCoreWildlifeCarcassDecay,
  canonicalizeCoreWildlifeCarcass,
  claimCoreWildlifeCarcass,
  consumeCoreWildlifeCarcass,
  CORE_WILDLIFE_CARCASS_MAX_BODY_SIZE_UNITS,
  CORE_WILDLIFE_CARCASS_MAX_RESOURCE_UNITS,
  createCoreWildlifeCarcass,
  deserializeCoreWildlifeCarcass,
  releaseCoreWildlifeCarcass,
  serializeCoreWildlifeCarcass,
  stableCoreWildlifeCarcassId,
  type CoreWildlifeCarcass,
  type CreateCoreWildlifeCarcassInput,
} from "./coreWildlifeCarcass";
import {
  CORE_WILDLIFE_MORTALITY_VERSION,
  type CoreWildlifeMortalityEvent,
} from "./coreWildlifeMortality";
import { createWorldPosition, REGION_WIDTH_UNITS } from "./worldPosition";

const REGION = createRegionCoord(-31, 18);
const DEATH_TICK = 7;
const ATTACKER_POSITION = createWorldPosition(REGION, 12_000, 9_000);
const VICTIM_POSITION = createWorldPosition(REGION, 12_300, 9_000);
const ROOT_SEED = seedFromText("alpha29 one life one body carcass");

function actorId(species: CoreWildlifeSpecies, ordinal: number): string {
  return generateCoreWildlifeIdentity({
    seed: ROOT_SEED,
    species,
    originRegion: REGION,
    populationKey: `carcass-${species}`,
    populationOrdinal: ordinal,
  }).stableId;
}

const FOX_ID = actorId("marsh-fox", 0);
const RABBIT_ID = actorId("marsh-rabbit", 0);
const BEAR_ID = actorId("black-bear", 0);

function mortalityEvent(
  overrides: Readonly<Record<string, unknown>> = {},
): CoreWildlifeMortalityEvent {
  const body = {
    version: CORE_WILDLIFE_MORTALITY_VERSION,
    atTick: DEATH_TICK,
    cause: "predator-contact" as const,
    causeReferenceId: "obs:carcass:death:7",
    observationId: "obs:carcass:death:7",
    attackerId: FOX_ID,
    victimId: RABBIT_ID,
    attackerPosition: ATTACKER_POSITION,
    victimPosition: VICTIM_POSITION,
    contactRadiusUnits: 400,
    contactDistanceSquaredUnits: 90_000,
    damageUnits: 600_000,
    healthBefore: 600_000,
    healthAfter: 0,
    outcome: "death" as const,
    ...overrides,
  };
  return {
    ...body,
    eventId: `wildlife-harm:${hashCanonical(body)}`,
  } as CoreWildlifeMortalityEvent;
}

function creation(
  overrides: Readonly<Record<string, unknown>> = {},
): CreateCoreWildlifeCarcassInput {
  return {
    mortalityEvent: mortalityEvent(),
    sourceSpecies: "marsh-rabbit",
    bodySizeUnits: 420_000,
    resourceUnits: 10,
    temperature: 700_000,
    ...overrides,
  } as CreateCoreWildlifeCarcassInput;
}

function fresh(
  overrides: Readonly<Record<string, unknown>> = {},
): CoreWildlifeCarcass {
  const carcass = createCoreWildlifeCarcass(creation(overrides));
  if (carcass === null) throw new Error("Invalid representative carcass fixture");
  return carcass;
}

function claimed(
  carcass = fresh(),
  actor = FOX_ID,
  atTick = DEATH_TICK + 1,
): CoreWildlifeCarcass {
  const next = claimCoreWildlifeCarcass(carcass, {
    actorId: actor,
    provenanceId: `claim:carcass:${atTick}`,
    atTick,
  });
  if (next === null) throw new Error("Representative carcass claim failed");
  return next;
}

function resourceTotal(carcass: CoreWildlifeCarcass): number {
  return carcass.remainingResourceUnits
    + carcass.consumedResourceUnits
    + carcass.decayedResourceUnits;
}

describe("species-neutral physical wildlife carcasses", () => {
  it("canonicalizes, serializes, and deeply freezes one exact death body", () => {
    const carcass = fresh();
    const restored = canonicalizeCoreWildlifeCarcass(structuredClone(carcass));
    const encoded = serializeCoreWildlifeCarcass(carcass);

    expect(restored).toEqual(carcass);
    expect(deserializeCoreWildlifeCarcass(encoded)).toEqual(carcass);
    expect(serializeCoreWildlifeCarcass(deserializeCoreWildlifeCarcass(encoded))).toBe(encoded);
    expect(deserializeCoreWildlifeCarcass(` ${encoded}`)).toBeNull();
    expect(deserializeCoreWildlifeCarcass("{not-json")).toBeNull();
    expect(carcass).toMatchObject({
      sourceMortalityEventId: mortalityEvent().eventId,
      sourceActorId: RABBIT_ID,
      sourceSpecies: "marsh-rabbit",
      deathPosition: VICTIM_POSITION,
      deathAtTick: DEATH_TICK,
      bodySizeUnits: 420_000,
      originalResourceUnits: 10,
      remainingResourceUnits: 10,
      consumedResourceUnits: 0,
      decayedResourceUnits: 0,
      condition: {
        temperature: 700_000,
        decay: 0,
        updatedAtTick: DEATH_TICK,
      },
      currentClaimantActorId: null,
      claimProvenanceId: null,
      claimedAtTick: null,
      retiredAtTick: null,
      disclosure: "direct-observation-required",
    });
    expect(resourceTotal(carcass)).toBe(carcass.originalResourceUnits);
    expect(Object.isFrozen(carcass)).toBe(true);
    expect(Object.isFrozen(carcass.condition)).toBe(true);
    expect(Object.isFrozen(carcass.deathPosition)).toBe(true);
    expect(Object.isFrozen(carcass.deathPosition.region)).toBe(true);
    expect(Object.isFrozen(restored)).toBe(true);
  });

  it("derives identity only from the exact mortality event and source body", () => {
    const first = fresh();
    const replay = fresh({
      bodySizeUnits: 600_000,
      resourceUnits: 3,
      temperature: 100_000,
    });
    const laterEvent = mortalityEvent({ atTick: DEATH_TICK + 1 });
    const later = fresh({ mortalityEvent: laterEvent });

    expect(first.carcassId).toBe(replay.carcassId);
    expect(first.carcassId).toBe(stableCoreWildlifeCarcassId(
      first.sourceMortalityEventId,
      first.sourceActorId,
    ));
    expect(first.carcassId).toMatch(/^wildlife-carcass:[0-9a-f]{16}$/u);
    expect(later.carcassId).not.toBe(first.carcassId);
    expect(createCoreWildlifeCarcass(creation({
      mortalityEvent: mortalityEvent({
        damageUnits: 300_000,
        healthAfter: 300_000,
        outcome: "injured",
      }),
    }))).toBeNull();
  });

  it("permits consumption only by the exact current claimant", () => {
    const initial = fresh({ resourceUnits: 6 });
    const held = claimed(initial);

    expect(consumeCoreWildlifeCarcass(held, {
      actorId: BEAR_ID,
      units: 1,
      atTick: 9,
    })).toBeNull();
    expect(consumeCoreWildlifeCarcass(held, {
      actorId: FOX_ID,
      units: 7,
      atTick: 9,
    })).toBeNull();
    expect(consumeCoreWildlifeCarcass(held, {
      actorId: FOX_ID,
      units: 0,
      atTick: 9,
    })).toBeNull();

    const partlyConsumed = consumeCoreWildlifeCarcass(held, {
      actorId: FOX_ID,
      units: 2,
      atTick: 9,
    });
    expect(partlyConsumed).toMatchObject({
      originalResourceUnits: 6,
      remainingResourceUnits: 4,
      consumedResourceUnits: 2,
      decayedResourceUnits: 0,
      currentClaimantActorId: FOX_ID,
    });
    expect(initial.remainingResourceUnits).toBe(6);
    if (partlyConsumed === null) throw new Error("Expected bounded consumption");

    const exhausted = consumeCoreWildlifeCarcass(partlyConsumed, {
      actorId: FOX_ID,
      units: 4,
      atTick: 10,
    });
    expect(exhausted).toMatchObject({
      carcassId: initial.carcassId,
      remainingResourceUnits: 0,
      consumedResourceUnits: 6,
      decayedResourceUnits: 0,
      currentClaimantActorId: null,
      retiredAtTick: 10,
    });
    expect(canonicalizeCoreWildlifeCarcass(structuredClone(exhausted))).toEqual(exhausted);
    expect(claimCoreWildlifeCarcass(exhausted, {
      actorId: BEAR_ID,
      provenanceId: "claim:retired",
      atTick: 11,
    })).toBeNull();
  });

  it("keeps contention exclusive until the current claimant releases", () => {
    const initial = fresh();
    const foxRequest = {
      actorId: FOX_ID,
      provenanceId: "claim:fox:carcass",
      atTick: 8,
    } as const;
    const foxClaim = claimCoreWildlifeCarcass(initial, foxRequest);
    expect(foxClaim).toMatchObject({
      currentClaimantActorId: FOX_ID,
      claimProvenanceId: foxRequest.provenanceId,
      claimedAtTick: 8,
    });
    expect(claimCoreWildlifeCarcass(foxClaim, foxRequest)).toEqual(foxClaim);
    expect(claimCoreWildlifeCarcass(foxClaim, {
      actorId: BEAR_ID,
      provenanceId: "claim:bear:competing",
      atTick: 8,
    })).toBeNull();
    expect(releaseCoreWildlifeCarcass(foxClaim, {
      actorId: BEAR_ID,
      atTick: 9,
    })).toBeNull();

    const released = releaseCoreWildlifeCarcass(foxClaim, {
      actorId: FOX_ID,
      atTick: 9,
    });
    expect(released).toMatchObject({
      currentClaimantActorId: null,
      claimProvenanceId: null,
      claimedAtTick: null,
      updatedAtTick: 9,
    });
    const bearClaim = claimCoreWildlifeCarcass(released, {
      actorId: BEAR_ID,
      provenanceId: "claim:bear:after-release",
      atTick: 9,
    });
    expect(bearClaim?.currentClaimantActorId).toBe(BEAR_ID);
    expect(initial.currentClaimantActorId).toBeNull();
  });

  it("advances deterministic decay without save-cadence drift or resource growth", () => {
    const initial = fresh({ resourceUnits: 10 });
    const oneStep = advanceCoreWildlifeCarcassDecay(initial, {
      atTick: 12,
      temperature: 800_000,
      decayUnitsPerTick: 100_000,
    });
    const early = advanceCoreWildlifeCarcassDecay(initial, {
      atTick: 9,
      temperature: 800_000,
      decayUnitsPerTick: 100_000,
    });
    const splitStep = advanceCoreWildlifeCarcassDecay(early, {
      atTick: 12,
      temperature: 800_000,
      decayUnitsPerTick: 100_000,
    });

    expect(oneStep).toEqual(splitStep);
    expect(oneStep).toMatchObject({
      originalResourceUnits: 10,
      remainingResourceUnits: 5,
      consumedResourceUnits: 0,
      decayedResourceUnits: 5,
      condition: {
        temperature: 800_000,
        decay: 500_000,
        updatedAtTick: 12,
      },
    });
    if (oneStep === null) throw new Error("Expected deterministic decay");
    expect(resourceTotal(oneStep)).toBe(10);
    expect(advanceCoreWildlifeCarcassDecay(oneStep, {
      atTick: 12,
      temperature: 800_000,
      decayUnitsPerTick: 100_000,
    })).toEqual(oneStep);

    const retired = advanceCoreWildlifeCarcassDecay(oneStep, {
      atTick: 17,
      temperature: ACTOR_PERCEPTION_SCALE,
      decayUnitsPerTick: 100_000,
    });
    expect(retired).toMatchObject({
      carcassId: initial.carcassId,
      remainingResourceUnits: 0,
      consumedResourceUnits: 0,
      decayedResourceUnits: 10,
      retiredAtTick: 17,
      condition: { decay: ACTOR_PERCEPTION_SCALE },
    });
    expect(resourceTotal(retired!)).toBe(10);
  });

  it("conserves consumed, decayed, and remaining units through composition", () => {
    const initial = claimed(fresh({ resourceUnits: 10 }));
    const consumed = consumeCoreWildlifeCarcass(initial, {
      actorId: FOX_ID,
      units: 3,
      atTick: 8,
    });
    const decayed = advanceCoreWildlifeCarcassDecay(consumed, {
      atTick: 12,
      temperature: 900_000,
      decayUnitsPerTick: 100_000,
    });
    expect(decayed).toMatchObject({
      remainingResourceUnits: 5,
      consumedResourceUnits: 3,
      decayedResourceUnits: 2,
    });
    expect(resourceTotal(decayed!)).toBe(10);
    expect(canonicalizeCoreWildlifeCarcass({
      ...decayed,
      remainingResourceUnits: 6,
    })).toBeNull();
    expect(canonicalizeCoreWildlifeCarcass({
      ...decayed,
      condition: { ...decayed!.condition, decay: 0 },
    })).toBeNull();
    expect(canonicalizeCoreWildlifeCarcass({
      ...decayed,
      originalResourceUnits: 11,
    })).toBeNull();
  });

  it("rejects malformed identities, coordinates, bounds, and unordered ticks", () => {
    expect(createCoreWildlifeCarcass(null)).toBeNull();
    expect(createCoreWildlifeCarcass({ ...creation(), debug: true })).toBeNull();
    expect(createCoreWildlifeCarcass(creation({ sourceSpecies: "marsh-fox" }))).toBeNull();
    expect(createCoreWildlifeCarcass(creation({ bodySizeUnits: 0 }))).toBeNull();
    expect(createCoreWildlifeCarcass(creation({
      bodySizeUnits: CORE_WILDLIFE_CARCASS_MAX_BODY_SIZE_UNITS + 1,
    }))).toBeNull();
    expect(createCoreWildlifeCarcass(creation({ resourceUnits: 0 }))).toBeNull();
    expect(createCoreWildlifeCarcass(creation({
      resourceUnits: CORE_WILDLIFE_CARCASS_MAX_RESOURCE_UNITS + 1,
    }))).toBeNull();
    expect(createCoreWildlifeCarcass(creation({ temperature: -0 }))).toBeNull();
    expect(createCoreWildlifeCarcass(creation({ temperature: -1 }))).toBeNull();
    expect(createCoreWildlifeCarcass(creation({
      mortalityEvent: { ...mortalityEvent(), debug: true },
    }))).toBeNull();
    expect(createCoreWildlifeCarcass(creation({
      mortalityEvent: mortalityEvent({ atTick: -0 }),
    }))).toBeNull();
    expect(createCoreWildlifeCarcass(creation({
      mortalityEvent: mortalityEvent({ victimId: "bad actor id" }),
    }))).toBeNull();
    expect(createCoreWildlifeCarcass(creation({
      mortalityEvent: mortalityEvent({
        victimPosition: {
          region: REGION,
          localX: REGION_WIDTH_UNITS,
          localY: 9_000,
        },
      }),
    }))).toBeNull();

    const initial = fresh();
    expect(canonicalizeCoreWildlifeCarcass({ ...initial, debug: true })).toBeNull();
    expect(canonicalizeCoreWildlifeCarcass({
      ...initial,
      deathPosition: { ...initial.deathPosition, localX: -1 },
    })).toBeNull();
    expect(canonicalizeCoreWildlifeCarcass({
      ...initial,
      condition: { ...initial.condition, hidden: true },
    })).toBeNull();
    expect(canonicalizeCoreWildlifeCarcass({
      ...initial,
      updatedAtTick: -0,
    })).toBeNull();
    expect(claimCoreWildlifeCarcass(initial, {
      actorId: "bad actor id",
      provenanceId: "claim:bad",
      atTick: 8,
    })).toBeNull();
    expect(claimCoreWildlifeCarcass(initial, {
      actorId: FOX_ID,
      provenanceId: "bad provenance id",
      atTick: 8,
    })).toBeNull();
    expect(claimCoreWildlifeCarcass(initial, {
      actorId: FOX_ID,
      provenanceId: "claim:stale",
      atTick: DEATH_TICK - 1,
    })).toBeNull();

    const held = claimed(initial);
    expect(releaseCoreWildlifeCarcass(held, {
      actorId: FOX_ID,
      atTick: DEATH_TICK,
    })).toBeNull();
    expect(advanceCoreWildlifeCarcassDecay(held, {
      atTick: DEATH_TICK,
      temperature: 500_000,
      decayUnitsPerTick: 1,
    })).toBeNull();
    expect(advanceCoreWildlifeCarcassDecay(held, {
      atTick: 9,
      temperature: 500_000,
      decayUnitsPerTick: ACTOR_PERCEPTION_SCALE + 1,
    })).toBeNull();
  });
});
