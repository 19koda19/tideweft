import { describe, expect, it } from "vitest";

import {
  generateDogState,
  type DogCondition,
  type DogIdentity,
  type DogNeeds,
} from "../sim/dogIdentity";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import {
  DOG_FOOD_CONSUMPTION_VERSION,
  DOG_NEEDS_STEP_VERSION,
  applyCommittedDogFoodConsumption,
  canonicalizeDogFoodConsumptionState,
  createDogFoodConsumptionState,
  deserializeDogFoodConsumptionState,
  serializeDogFoodConsumptionState,
  stepDogNeeds,
  type DogFoodConsumptionState,
  type DogNeedsStepSample,
} from "./dogNeeds";
import {
  addActorCargoProvision,
  consumeActorCargoProvision,
  createActorCargoContainer,
  createActorCargoState,
  type ActorCargoMutationResult,
  type ActorCargoState,
} from "./actorCargo";
import { PROVISION_DEFINITIONS, type ProvisionKind } from "./provisions";

const NEEDS: DogNeeds = {
  hunger: 200_000,
  thirst: 200_000,
  rest: 300_000,
  safety: 300_000,
  company: 300_000,
};
const CONDITION: DogCondition = {
  health: FIXED_POINT,
  wetness: 0,
  coldStress: 0,
  heatStress: 0,
  exhaustion: 0,
  injuries: [],
};

const DOG = dogIdentity("dog-food-primary", 4);
const OTHER_DOG = dogIdentity("dog-food-other", 5);

function dogIdentity(label: string, ordinal: number): DogIdentity {
  return generateDogState({
    seed: seedFromText(label),
    originRegion: createRegionCoord(-9_001, 2_147_483),
    originNamespace: "regional",
    habitatClass: "coastal-lowland",
    habitatKey: `food-test/${ordinal}`,
    populationKey: "food-test/dogs",
    populationOrdinal: ordinal,
  }).identity;
}

function cargoState(): ActorCargoState {
  return createActorCargoState([
    createActorCargoContainer({
      id: "pack:dog:primary",
      custodianActorId: DOG.stableId,
      capacityMilliLoad: 20_000,
    }),
    createActorCargoContainer({
      id: "pack:dog:other",
      custodianActorId: OTHER_DOG.stableId,
      capacityMilliLoad: 20_000,
    }),
  ]);
}

function addFood(
  state: ActorCargoState,
  options: {
    actor?: "primary" | "other";
    transaction?: string;
    lot?: string;
    provision?: ProvisionKind;
    quantity?: number;
    condition?: number;
    contamination?: number;
    decay?: number;
  } = {},
): ActorCargoMutationResult {
  const actor = options.actor ?? "primary";
  return addActorCargoProvision(state, {
    transactionId: options.transaction ?? `food:add:${actor}:1`,
    containerId: `pack:dog:${actor}`,
    lotId: options.lot ?? `food:lot:${actor}:1`,
    provision: options.provision ?? "dried-fish",
    quantity: options.quantity ?? 1,
    materialState: {
      condition: options.condition ?? 900_000,
      contamination: options.contamination ?? 50_000,
      decay: options.decay ?? 100_000,
    },
  });
}

function consumeFood(
  state: ActorCargoState,
  options: {
    actor?: "primary" | "other";
    transaction?: string;
    lot?: string;
    quantity?: number;
  } = {},
): ActorCargoMutationResult {
  const actor = options.actor ?? "primary";
  return consumeActorCargoProvision(state, {
    transactionId: options.transaction ?? `food:eat:${actor}:1`,
    containerId: `pack:dog:${actor}`,
    lotId: options.lot ?? `food:lot:${actor}:1`,
    quantity: options.quantity ?? 1,
  });
}

function sample(overrides: Partial<DogNeedsStepSample> = {}): DogNeedsStepSample {
  return {
    version: DOG_NEEDS_STEP_VERSION,
    exertion: 0,
    ambientHeat: 0,
    threatPressure: 0,
    shelter: 0,
    resting: 0,
    socialContact: 0,
    ...overrides,
  };
}

describe("dynamic dog needs", () => {
  it("advances ordinary hunger and thirst without directly damaging health", () => {
    const next = stepDogNeeds(NEEDS, CONDITION, sample());
    expect(next.hunger).toBeGreaterThan(NEEDS.hunger);
    expect(next.thirst).toBeGreaterThan(NEEDS.thirst);
    expect(CONDITION.health).toBe(FIXED_POINT);
    expect(Object.isFrozen(next)).toBe(true);
  });

  it("makes exertion and heat increase the pressures they physically affect", () => {
    const quiet = stepDogNeeds(NEEDS, CONDITION, sample());
    const exerted = stepDogNeeds(NEEDS, CONDITION, sample({
      exertion: FIXED_POINT,
      ambientHeat: FIXED_POINT,
    }));
    expect(exerted.hunger).toBeGreaterThan(quiet.hunger);
    expect(exerted.thirst).toBeGreaterThan(quiet.thirst);
    expect(exerted.rest).toBeGreaterThan(quiet.rest);
  });

  it("allows safe sheltered rest and social contact to relieve matching needs", () => {
    const next = stepDogNeeds(NEEDS, CONDITION, sample({
      shelter: FIXED_POINT,
      resting: FIXED_POINT,
      socialContact: FIXED_POINT,
    }));
    expect(next.rest).toBeLessThan(NEEDS.rest);
    expect(next.safety).toBeLessThan(NEEDS.safety);
    expect(next.company).toBeLessThan(NEEDS.company);
  });

  it("does not treat shelter as safety while an immediate threat remains", () => {
    const next = stepDogNeeds(NEEDS, CONDITION, sample({
      shelter: FIXED_POINT,
      resting: FIXED_POINT,
      threatPressure: FIXED_POINT,
    }));
    expect(next.safety).toBeGreaterThan(NEEDS.safety);
    expect(next.rest).toBeGreaterThanOrEqual(NEEDS.rest);
  });

  it("fails malformed or floating-point inputs closed", () => {
    expect(() => stepDogNeeds(NEEDS, CONDITION, {
      ...sample(),
      exertion: 0.5,
    })).toThrow(/sample/u);
    expect(() => stepDogNeeds({ ...NEEDS, hunger: -0 }, CONDITION, sample()))
      .toThrow(/needs/u);
    expect(() => stepDogNeeds(NEEDS, { ...CONDITION, hidden: true } as DogCondition, sample()))
      .toThrow(/condition/u);
  });
});

describe("physical dog food consumption", () => {
  it("derives hunger relief only from the committed lot, centralized food, quantity, and material state", () => {
    const added = addFood(cargoState(), {
      condition: 900_000,
      contamination: 70_000,
      decay: 100_000,
    });
    const consumed = consumeFood(added.state);
    const hungry = { ...NEEDS, hunger: 900_000 };
    const result = applyCommittedDogFoodConsumption(
      DOG,
      hungry,
      createDogFoodConsumptionState(DOG),
      consumed,
    );

    expect(consumed).toMatchObject({ ok: true, reason: "applied" });
    expect(result).toMatchObject({
      ok: true,
      reason: "applied",
      needs: { hunger: 171_000 },
      nutrition: {
        provision: "dried-fish",
        quantity: 1,
        nutritionPerUnit: PROVISION_DEFINITIONS["dried-fish"].nutrition,
        usableNutritionFactor: 900_000,
        satiety: 729_000,
        contaminationExposure: 70_000,
        materialState: { condition: 900_000, contamination: 70_000, decay: 100_000 },
      },
    });
    expect(result.consumptionState.lastAppliedEventId).toBe(consumed.event?.id);
    expect(hungry.hunger).toBe(900_000);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nutrition)).toBe(true);
  });

  it("saturates multi-unit nutrition and contamination without floating-point or overflow behavior", () => {
    const added = addFood(cargoState(), {
      provision: "fresh-produce",
      quantity: 3,
      condition: FIXED_POINT,
      contamination: 400_000,
      decay: 0,
    });
    const consumed = consumeFood(added.state, { quantity: 3 });
    const result = applyCommittedDogFoodConsumption(
      DOG,
      { ...NEEDS, hunger: FIXED_POINT },
      createDogFoodConsumptionState(DOG),
      consumed,
    );

    expect(result.ok).toBe(true);
    expect(result.needs.hunger).toBe(0);
    expect(result.nutrition?.satiety).toBe(FIXED_POINT);
    expect(result.nutrition?.contaminationExposure).toBe(FIXED_POINT);
  });

  it("accepts an idempotent cargo retry exactly once when physiology has not caught up", () => {
    const added = addFood(cargoState());
    const committed = consumeFood(added.state);
    const retried = consumeFood(committed.state);
    expect(retried).toMatchObject({ ok: true, reason: "already-applied" });

    const caughtUp = applyCommittedDogFoodConsumption(
      DOG,
      { ...NEEDS, hunger: FIXED_POINT },
      createDogFoodConsumptionState(DOG),
      retried,
    );
    expect(caughtUp.ok).toBe(true);

    const replay = applyCommittedDogFoodConsumption(
      DOG,
      caughtUp.needs,
      caughtUp.consumptionState,
      committed,
    );
    expect(replay).toMatchObject({
      ok: false,
      reason: "replayed-consumption",
      needs: caughtUp.needs,
      consumptionState: caughtUp.consumptionState,
      nutrition: null,
    });
  });

  it("rejects a real meal consumed by a different dog and any non-consumption event", () => {
    const otherAdded = addFood(cargoState(), { actor: "other" });
    const otherConsumed = consumeFood(otherAdded.state, { actor: "other" });
    const receipt = createDogFoodConsumptionState(DOG);
    const wrongActor = applyCommittedDogFoodConsumption(DOG, NEEDS, receipt, otherConsumed);
    expect(wrongActor).toMatchObject({ ok: false, reason: "wrong-actor", needs: NEEDS });

    const ownAdded = addFood(cargoState());
    const notConsumed = applyCommittedDogFoodConsumption(DOG, NEEDS, receipt, ownAdded);
    expect(notConsumed).toMatchObject({
      ok: false,
      reason: "not-provision-consumption",
      nutrition: null,
    });
    expect(wrongActor.needs.hunger).toBe(NEEDS.hunger);
    expect(notConsumed.consumptionState).toEqual(receipt);
  });

  it("rejects forged event, material, mutation, hash, negative-zero, and unsupported-provision evidence", () => {
    const added = addFood(cargoState());
    const committed = consumeFood(added.state);
    const receipt = createDogFoodConsumptionState(DOG);
    const reject = (value: unknown, reason = "uncommitted-evidence") => {
      const result = applyCommittedDogFoodConsumption(DOG, NEEDS, receipt, value);
      expect(result).toMatchObject({ ok: false, reason, needs: NEEDS, nutrition: null });
    };

    reject(committed.event);
    reject(consumeFood(cargoState()));
    reject({ ...committed, hidden: true });
    reject({ ...committed, event: { ...committed.event, quantity: -0 } });
    reject({
      ...committed,
      affectedLot: {
        ...committed.affectedLot,
        materialState: { condition: 1, contamination: 0, decay: 0 },
      },
    });

    const negativeZeroState = structuredClone(committed) as any;
    negativeZeroState.state.events[1]!.materialState!.condition = -0;
    negativeZeroState.event = negativeZeroState.state.events[1]!;
    negativeZeroState.affectedLot!.materialState.condition = -0;
    reject(negativeZeroState);

    const forgedHash = structuredClone(committed) as any;
    forgedHash.state.events[1]!.transactionHash = "0000000000000000";
    forgedHash.event = forgedHash.state.events[1]!;
    reject(forgedHash);

    const extraRequestCommit = consumeActorCargoProvision(added.state, {
      transactionId: "food:eat:primary:with-extra",
      containerId: "pack:dog:primary",
      lotId: "food:lot:primary:1",
      quantity: 1,
      hidden: true,
    } as any);
    expect(extraRequestCommit).toMatchObject({ ok: false, reason: "invalid-request" });
    reject(extraRequestCommit);

    const unsupported = structuredClone(committed) as any;
    unsupported.event.provision = "moon-cheese";
    unsupported.state.events[1].provision = "moon-cheese";
    unsupported.affectedLot.payload.provision = "moon-cheese";
    reject(unsupported, "unsupported-provision");
  });

  it("requires chronological consumption for this dog so a later meal cannot skip an unapplied one", () => {
    const added = addFood(cargoState(), { quantity: 2 });
    const first = consumeFood(added.state, { transaction: "food:eat:primary:first" });
    const second = consumeFood(first.state, { transaction: "food:eat:primary:second" });
    const initialReceipt = createDogFoodConsumptionState(DOG);

    const skipped = applyCommittedDogFoodConsumption(DOG, { ...NEEDS, hunger: FIXED_POINT }, initialReceipt, second);
    expect(skipped).toMatchObject({ ok: false, reason: "out-of-order-consumption" });

    const appliedFirst = applyCommittedDogFoodConsumption(
      DOG,
      { ...NEEDS, hunger: FIXED_POINT },
      initialReceipt,
      first,
    );
    expect(appliedFirst.ok).toBe(true);
    const forgedReceipt = canonicalizeDogFoodConsumptionState({
      ...appliedFirst.consumptionState,
      lastAppliedTransactionHash: "0000000000000000",
    });
    expect(applyCommittedDogFoodConsumption(
      DOG,
      appliedFirst.needs,
      forgedReceipt,
      second,
    )).toMatchObject({ ok: false, reason: "uncommitted-evidence" });
    const appliedSecond = applyCommittedDogFoodConsumption(
      DOG,
      appliedFirst.needs,
      appliedFirst.consumptionState,
      second,
    );
    expect(appliedSecond.ok).toBe(true);
    expect(appliedSecond.consumptionState.lastAppliedEventOrdinal)
      .toBe(second.event?.ordinal);
  });

  it("persists one strict versioned receipt and rejects incoherent aliases including negative zero", () => {
    const initial = createDogFoodConsumptionState(DOG);
    const encoded = serializeDogFoodConsumptionState(initial);
    expect(deserializeDogFoodConsumptionState(encoded)).toEqual(initial);
    expect(JSON.parse(encoded)).toMatchObject({
      version: DOG_FOOD_CONSUMPTION_VERSION,
      species: "domestic-dog",
      dogActorId: DOG.stableId,
      lastAppliedEventOrdinal: 0,
    });
    expect(() => canonicalizeDogFoodConsumptionState({
      ...initial,
      lastAppliedEventOrdinal: -0,
    })).toThrow(/invalid/u);
    expect(() => canonicalizeDogFoodConsumptionState({ ...initial, clicked: true }))
      .toThrow(/invalid/u);
    expect(() => applyCommittedDogFoodConsumption(
      OTHER_DOG,
      NEEDS,
      initial,
      null,
    )).toThrow(/another dog/u);
  });
});
