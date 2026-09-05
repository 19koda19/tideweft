import { describe, expect, it } from "vitest";

import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import { hashCanonical } from "../sim/util";
import {
  BIO0_ECOLOGY_MAX_RETAINED_EVENTS,
  adoptBio0ActorCargoState,
  canonicalizeBio0EcologyState,
  createBio0Ecology,
  deserializeBio0Ecology,
  serializeBio0Ecology,
  stepBio0Ecology,
  type Bio0EcologyState,
  type Bio0EcologyStepInput,
  type Bio0FoodSeed,
  type Bio0OfferedFoodContact,
  type CreateBio0EcologyInput,
} from "./bio0Ecology";
import { DOG_BEHAVIOR_INTENTS, type DogActionAccessibility } from "./dogBehavior";
import { DOG_EXPOSURE_VERSION, type DogExposureSample } from "./dogExposure";
import { createLivingActorAddress } from "./livingActor";
import {
  setActorCargoContainerClosure,
  transferActorCargoProvision,
} from "./actorCargo";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  createWorldPosition,
} from "./worldPosition";

const ACCESS_ALL = Object.freeze(Object.fromEntries(
  DOG_BEHAVIOR_INTENTS.map((intent) => [intent, true]),
)) as DogActionAccessibility;

function food(quantity = 3): Bio0FoodSeed {
  return {
    providerContainerId: "pack:porter:bio0",
    receiverContainerId: "pack:dog:bio0",
    lotId: "provision:bio0:dried-fish",
    provision: "dried-fish",
    quantity,
    providerCapacityMilliLoad: 20_000,
    receiverCapacityMilliLoad: 2_000,
    providerClosure: "open",
    materialState: { condition: 900_000, contamination: 0, decay: 100_000 },
  };
}

function fixtureInput(
  quantity = 3,
  region = createRegionCoord(-17, 42),
  tick = 0,
): CreateBio0EcologyInput {
  const dogPosition = createWorldPosition(region, 20_000, 30_000);
  return {
    dogGeneration: {
      seed: seedFromText("BIO0 ecology fixture"),
      originRegion: region,
      originNamespace: "regional",
      habitatClass: "coastal-lowland",
      habitatKey: "east-channel/north-bank",
      populationKey: "rain-route/dogs-1",
      populationOrdinal: 9,
    },
    dogPosition,
    porterAddress: createLivingActorAddress({
      actorId: "H-v1-porter/existing-17",
      species: "human",
      position: createWorldPosition(region, 21_000, 30_000),
      heading: 500_000,
      persistence: "promoted",
    }),
    food: food(quantity),
    tick,
  };
}

function calmExposure(overrides: Partial<DogExposureSample> = {}): DogExposureSample {
  return {
    version: DOG_EXPOSURE_VERSION,
    rain: 0,
    immersion: 0,
    ambientCold: 0,
    ambientHeat: 0,
    wind: 0,
    shelter: 0,
    exertion: 50_000,
    ...overrides,
  };
}

function stepInput(
  state: Bio0EcologyState,
  foodContact: Bio0OfferedFoodContact | null = null,
  exposure = calmExposure(),
  accessibility: DogActionAccessibility = ACCESS_ALL,
): Bio0EcologyStepInput {
  return {
    tick: state.tick + 1,
    porterAddress: state.porterAddress,
    exposure,
    wind: { x: 0, y: 0 },
    accessibility,
    foodContact,
  };
}

function offerContact(
  state: Bio0EcologyState,
  discriminator = "default",
): Readonly<{ state: Bio0EcologyState; contact: Bio0OfferedFoodContact }> {
  const requestId = `bio0:test:request:${discriminator}`;
  const decisionId = `bio0:test:decision:${discriminator}`;
  const tick = state.tick + 1;
  const transactionId = `living-enact:${hashCanonical({ requestId })}:${tick}:${decisionId}`;
  const transfer = transferActorCargoProvision(state.cargo, {
    transactionId,
    sourceContainerId: state.foodSource.providerContainerId,
    destinationContainerId: state.foodSource.receiverContainerId,
    lotId: state.foodSource.sourceLotId,
    quantity: 1,
  });
  if (
    !transfer.ok
    || transfer.event?.kind !== "provision-transferred"
    || transfer.event.resultLotId === null
    || transfer.event.provision === null
  ) throw new Error(`fixture food offer failed: ${transfer.reason}`);
  const adopted = adoptBio0ActorCargoState(state, transfer.state);
  if (adopted === null) throw new Error("fixture food offer did not preserve BIO0 custody");
  const body = {
    kind: "offered-provision-contact" as const,
    tick,
    requestId,
    decisionId,
    providerActorId: state.porterAddress.actorId,
    beneficiaryActorId: state.dog.identity.stableId,
    providerContainerId: state.foodSource.providerContainerId,
    receiverContainerId: state.foodSource.receiverContainerId,
    sourceLotId: state.foodSource.sourceLotId,
    resultLotId: transfer.event.resultLotId,
    provision: transfer.event.provision,
    quantity: 1 as const,
    transferCargoEventId: transfer.event.id,
  };
  return {
    state: adopted,
    contact: {
      version: 1,
      id: `offered-provision-contact:${hashCanonical(body)}`,
      ...body,
    },
  };
}

function advanceUntilApproach(initial: Bio0EcologyState): Bio0EcologyState {
  let state = initial;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = stepBio0Ecology(state, stepInput(state));
    expect(result.ok, result.reason).toBe(true);
    state = result.state;
    if (state.dog.intent.kind === "approach-food") return state;
  }
  throw new Error("fixture dog never lawfully approached the food scent");
}

function providerLot(state: Bio0EcologyState) {
  return state.cargo.containers
    .find(({ id }) => id === state.foodSource.providerContainerId)
    ?.carrier.lots.find(({ id }) => id === state.foodSource.sourceLotId) ?? null;
}

describe("BIO0 porter, dog, provision, weather, and perception orchestration", () => {
  it("deterministically creates one dog, one existing-human address, and conserved physical custody", () => {
    const first = createBio0Ecology(fixtureInput());
    const second = createBio0Ecology(fixtureInput());

    expect(second).toEqual(first);
    expect(first.dog.address.species).toBe("domestic-dog");
    expect(first.porterAddress).toEqual(fixtureInput().porterAddress);
    expect(first).not.toHaveProperty("porterIdentity");
    expect(first.cargo.containers).toHaveLength(2);
    expect(first.cargo.containers.map(({ custodianActorId }) => custodianActorId).sort()).toEqual([
      first.dog.identity.stableId,
      first.porterAddress.actorId,
    ].sort());
    expect(providerLot(first)?.payload).toMatchObject({
      kind: "provision",
      lotId: first.foodSource.sourceLotId,
      provision: "dried-fish",
      quantity: 3,
    });
    expect(first.cargo.events.map(({ kind }) => kind)).toEqual(["provision-added"]);
    expect(first.foodConsumption.lastAppliedEventOrdinal).toBe(0);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.cargo.containers)).toBe(true);
  });

  it("roundtrips signed extreme segmented coordinates without flattening or rerolling", () => {
    const extreme = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
    const input = fixtureInput(2, extreme, 19);
    const dogPosition = createWorldPosition(
      extreme,
      REGION_WIDTH_UNITS - 2_000,
      REGION_HEIGHT_UNITS - 1,
    );
    const porterPosition = createWorldPosition(
      extreme,
      REGION_WIDTH_UNITS - 1_000,
      REGION_HEIGHT_UNITS - 1,
    );
    const state = createBio0Ecology({
      ...input,
      dogPosition,
      porterAddress: createLivingActorAddress({
        ...input.porterAddress,
        position: porterPosition,
      }),
    });
    const encoded = serializeBio0Ecology(state);
    const decoded = deserializeBio0Ecology(encoded);

    expect(decoded).toEqual(state);
    expect(decoded?.dog.address.position.region).toEqual(extreme);
    expect(decoded?.porterAddress.position.region).toEqual(extreme);
    expect(serializeBio0Ecology(decoded)).toBe(encoded);
    expect(deserializeBio0Ecology(JSON.stringify(state))).toBeNull();
  });

  it("lets classified scent schedule an uncertain approach but never consumes without contact", () => {
    const initial = createBio0Ecology(fixtureInput());
    const approached = advanceUntilApproach(initial);
    const foodBelief = approached.dog.perception.beliefs.find(
      ({ key }) => key === approached.pendingMovement?.beliefKey,
    );

    expect(foodBelief).toMatchObject({ identification: "classified", subjectId: null });
    expect(approached.pendingMovement).toMatchObject({
      kind: "approach-perceived-area",
      dogActorId: approached.dog.identity.stableId,
      beliefKey: foodBelief?.key,
      maximumStepUnits: 1_000,
    });
    expect(approached.pendingMovement?.targetArea).toEqual(foodBelief?.area);
    expect(approached.dog.address.position).toEqual(initial.dog.address.position);
    expect(providerLot(approached)?.payload).toMatchObject({ quantity: 3 });
    expect(approached.cargo.events.map(({ kind }) => kind)).toEqual(["provision-added"]);
    expect(approached.events.some(({ kind }) => kind === "food-approached")).toBe(true);
    expect(approached.dog.address.persistence).toBe("regional");
    expect(approached.dog.promotion).toBeNull();
    expect(approached.dog.playerKnowledge.facts).toEqual([]);
  });

  it("advances coarse physiology and cognition without perceiving, moving, or touching unloaded sources", () => {
    const initial = createBio0Ecology(fixtureInput());
    const cargoBefore = initial.cargo;
    const positionBefore = initial.dog.address.position;
    const result = stepBio0Ecology(initial, {
      ...stepInput(initial, null, calmExposure({
        rain: FIXED_POINT,
        ambientCold: FIXED_POINT,
        wind: FIXED_POINT,
      })),
      simulationMode: "coarse",
    });

    expect(result.ok, result.reason).toBe(true);
    expect(result.state.tick).toBe(initial.tick + 1);
    expect(result.state.dog.updatedAtTick).toBe(initial.tick + 1);
    expect(result.state.dog.perception.tick).toBe(initial.tick + 1);
    expect(result.state.dog.perception.beliefs).toEqual([]);
    expect(result.state.dog.condition.wetness).toBeGreaterThan(initial.dog.condition.wetness);
    expect(result.state.dog.address.position).toEqual(positionBefore);
    expect(result.state.pendingMovement).toBeNull();
    expect(result.state.cargo).toEqual(cargoBefore);
    expect(result.state.dog.address.persistence).toBe("regional");
    expect(result.state.dog.promotion).toBeNull();
    expect(result.state.dog.playerKnowledge.facts).toEqual([]);
    expect(result.event).toMatchObject({
      kind: "ecology-stepped",
      scentObservationId: null,
      movementRequestId: null,
      contactId: null,
    });
  });

  it("cannot accept direct food contact during a coarse step", () => {
    const initial = createBio0Ecology(fixtureInput());
    const offered = offerContact(initial, "coarse");
    const result = stepBio0Ecology(offered.state, {
      ...stepInput(offered.state, offered.contact),
      simulationMode: "coarse",
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid-input",
      state: offered.state,
      event: null,
    });
    expect(result.state).toBe(offered.state);
  });

  it("admits ordinary closure evidence without weakening the exact food lifecycle", () => {
    const initial = createBio0Ecology(fixtureInput());
    const secured = setActorCargoContainerClosure(initial.cargo, {
      transactionId: "bio0:test:secure-pack",
      containerId: initial.foodSource.providerContainerId,
      closure: "secured",
    });
    expect(secured.ok, secured.reason).toBe(true);
    expect(secured.event?.kind).toBe("closure-changed");

    const candidate = canonicalizeBio0EcologyState({
      ...initial,
      cargo: secured.state,
    });
    expect(candidate?.cargo.events.map(({ kind }) => kind)).toEqual([
      "provision-added",
      "closure-changed",
    ]);
    expect(candidate?.cargo.containers.find(
      ({ id }) => id === initial.foodSource.providerContainerId,
    )?.closure).toBe("secured");
  });

  it("admits exactly one conserved offered unit awaiting consumption in dog custody", () => {
    const initial = advanceUntilApproach(createBio0Ecology(fixtureInput(2)));
    const offered = offerContact(initial, "pending-save");
    const candidate = offered.state;
    const receiver = candidate?.cargo.containers.find(
      ({ id }) => id === initial.foodSource.receiverContainerId,
    );
    expect(candidate).not.toBeNull();
    expect(receiver?.carrier.lots).toHaveLength(1);
    expect(receiver?.carrier.lots[0]?.id).toBe(offered.contact.resultLotId);
    expect(receiver?.carrier.retiredLotIds).toEqual([]);
    expect(candidate?.foodConsumption.lastAppliedEventOrdinal).toBe(0);
    const restored = deserializeBio0Ecology(serializeBio0Ecology(candidate));
    expect(restored).toEqual(candidate);
    const restoredProviderLot = providerLot(restored!);
    const providerQuantity = restoredProviderLot?.payload.kind === "provision"
      ? restoredProviderLot.payload.quantity
      : 0;
    const restoredReceiver = restored?.cargo.containers.find(
      ({ id }) => id === initial.foodSource.receiverContainerId,
    );
    const receiverQuantity = restoredReceiver?.carrier.lots.reduce((sum, lot) => (
      sum + (lot.payload.kind === "provision" ? lot.payload.quantity : 0)
    ), 0) ?? 0;
    expect(providerQuantity + receiverQuantity).toBe(2);

    const consumed = stepBio0Ecology(
      restored!,
      stepInput(restored!, offered.contact),
    );
    expect(consumed).toMatchObject({ ok: true, reason: "advanced" });
    expect(providerLot(consumed.state)?.payload).toMatchObject({ quantity: 1 });
    expect(consumed.state.cargo.containers.find(
      ({ id }) => id === initial.foodSource.receiverContainerId,
    )?.carrier).toMatchObject({ lots: [], retiredLotIds: [offered.contact.resultLotId] });
  });

  it("ages saved knowledge while coarse and lawfully reacquires only after returning to full mode", () => {
    const initial = createBio0Ecology(fixtureInput());
    const seen = stepBio0Ecology(initial, {
      ...stepInput(initial),
      simulationMode: "full",
    });
    expect(seen.ok, seen.reason).toBe(true);
    const observed = seen.state.dog.perception.beliefs.find(
      ({ perceivedClass }) => perceivedClass === "food-scent",
    );
    expect(observed).toBeDefined();

    const coarse = stepBio0Ecology(seen.state, {
      ...stepInput(seen.state),
      simulationMode: "coarse",
    });
    expect(coarse.ok, coarse.reason).toBe(true);
    const remembered = coarse.state.dog.perception.beliefs.find(
      ({ perceivedClass }) => perceivedClass === "food-scent",
    );
    expect(remembered?.lastObservedTick).toBe(observed?.lastObservedTick);
    expect(remembered?.confidence).toBeLessThan(observed?.confidence ?? 0);
    expect(coarse.event?.scentObservationId).toBeNull();

    const reacquired = stepBio0Ecology(coarse.state, {
      ...stepInput(coarse.state),
      simulationMode: "full",
    });
    expect(reacquired.ok, reacquired.reason).toBe(true);
    expect(reacquired.state.dog.perception.beliefs.find(
      ({ perceivedClass }) => perceivedClass === "food-scent",
    )?.lastObservedTick).toBe(reacquired.state.tick);

    const replaySeen = stepBio0Ecology(initial, {
      ...stepInput(initial),
      simulationMode: "full",
    });
    const replayCoarse = stepBio0Ecology(replaySeen.state, {
      ...stepInput(replaySeen.state),
      simulationMode: "coarse",
    });
    const replayReacquired = stepBio0Ecology(replayCoarse.state, {
      ...stepInput(replayCoarse.state),
      simulationMode: "full",
    });
    expect(serializeBio0Ecology(replayReacquired.state)).toBe(
      serializeBio0Ecology(reacquired.state),
    );
  });

  it("transfers one exact unit into dog custody before committed dog-owned consumption", () => {
    const approached = advanceUntilApproach(createBio0Ecology(fixtureInput(2)));
    const hungerBefore = approached.dog.needs.hunger;
    const offered = offerContact(approached, "consume-one");
    const result = stepBio0Ecology(
      offered.state,
      stepInput(offered.state, offered.contact),
    );

    expect(result.ok, result.reason).toBe(true);
    expect(result.event?.kind).toBe("food-consumed");
    const state = result.state;
    expect(state.dog.identity.stableId).toBe(approached.dog.identity.stableId);
    expect(providerLot(state)?.payload).toMatchObject({ quantity: 1 });
    const receiver = state.cargo.containers.find(
      ({ id }) => id === state.foodSource.receiverContainerId,
    );
    expect(receiver?.carrier.lots).toEqual([]);
    expect(receiver?.carrier.retiredLotIds).toHaveLength(1);
    expect(state.cargo.events.slice(-2).map(({ kind, actorId }) => ({ kind, actorId }))).toEqual([
      { kind: "provision-transferred", actorId: state.dog.identity.stableId },
      { kind: "provision-consumed", actorId: state.dog.identity.stableId },
    ]);
    expect(state.cargo.events.at(-1)).toMatchObject({
      id: result.event?.consumptionCargoEventId,
      sourceLotId: result.event?.consumedLotId,
      tombstoned: true,
    });
    expect(state.foodConsumption).toMatchObject({
      dogActorId: state.dog.identity.stableId,
      lastAppliedEventId: result.event?.consumptionCargoEventId,
    });
    expect(result.event?.satiety).toBeGreaterThan(0);
    expect(state.dog.needs.hunger).toBeLessThan(hungerBefore);
    expect(state.dog.memories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventId: result.event?.id,
        kind: "human-interaction",
        subjectId: state.porterAddress.actorId,
      }),
      expect.objectContaining({
        eventId: `${result.event?.id}:food`,
        kind: "food",
        subjectId: null,
      }),
    ]));
    expect(result.event).toMatchObject({
      contactId: offered.contact.id,
      requestId: offered.contact.requestId,
      decisionId: offered.contact.decisionId,
      transferCargoEventId: offered.contact.transferCargoEventId,
    });
    expect(state.dog.address.persistence).toBe("promoted");
    expect(state.dog.promotion).toEqual({
      reason: {
        kind: "causal-event",
        eventId: result.event?.id,
        atTick: result.event?.tick,
      },
    });
    expect(state.dog.playerKnowledge.facts).toEqual([
      {
        fact: "human-familiarity",
        source: "interaction",
        evidenceId: `${result.event?.id}:food`,
        learnedAtTick: result.event?.tick,
        confidence: 900_000,
      },
      {
        fact: "recognizable-individual",
        source: "interaction",
        evidenceId: result.event?.id,
        learnedAtTick: result.event?.tick,
        confidence: FIXED_POINT,
      },
      {
        fact: "significant-history",
        source: "interaction",
        evidenceId: result.event?.id,
        learnedAtTick: result.event?.tick,
        confidence: 900_000,
      },
    ]);
    expect(canonicalizeBio0EcologyState({
      ...state,
      dog: {
        ...state.dog,
        address: { ...state.dog.address, persistence: "regional" },
        promotion: null,
        playerKnowledge: { ...state.dog.playerKnowledge, facts: [] },
      },
    })).toBeNull();
    expect(state.pendingMovement).toBeNull();
  });

  it("preserves first-meal knowledge and the same promoted dog across save/reload", () => {
    const approached = advanceUntilApproach(createBio0Ecology(fixtureInput(2)));
    const offered = offerContact(approached, "promotion-reload");
    const eaten = stepBio0Ecology(offered.state, stepInput(offered.state, offered.contact));
    expect(eaten.ok, eaten.reason).toBe(true);

    const restored = deserializeBio0Ecology(serializeBio0Ecology(eaten.state));
    expect(restored).toEqual(eaten.state);
    expect(restored?.dog.identity.stableId).toBe(approached.dog.identity.stableId);
    expect(restored?.dog.address.persistence).toBe("promoted");
    expect(restored?.dog.promotion).toEqual(eaten.state.dog.promotion);
    expect(restored?.dog.playerKnowledge).toEqual(eaten.state.dog.playerKnowledge);
  });

  it("tombstones the same stable lot when its final unit crosses custody and is eaten", () => {
    const approached = advanceUntilApproach(createBio0Ecology(fixtureInput(1)));
    const offered = offerContact(approached, "final-unit");
    const result = stepBio0Ecology(
      offered.state,
      stepInput(offered.state, offered.contact),
    );

    expect(result.ok, result.reason).toBe(true);
    expect(providerLot(result.state)).toBeNull();
    expect(result.event).toMatchObject({
      kind: "food-consumed",
      sourceLotId: approached.foodSource.sourceLotId,
      consumedLotId: approached.foodSource.sourceLotId,
    });
    const receiver = result.state.cargo.containers.find(
      ({ id }) => id === result.state.foodSource.receiverContainerId,
    );
    expect(receiver?.carrier.retiredLotIds).toEqual([approached.foodSource.sourceLotId]);
    expect(canonicalizeBio0EcologyState(result.state)).toEqual(result.state);
  });

  it("uses a fresh same-ID porter address each step for the physical food and scent locus", () => {
    const initial = createBio0Ecology(fixtureInput());
    const movedAddress = createLivingActorAddress({
      ...initial.porterAddress,
      position: createWorldPosition(
        initial.porterAddress.position.region,
        initial.porterAddress.position.localX + 8_000,
        initial.porterAddress.position.localY,
      ),
    }) as Bio0EcologyState["porterAddress"];
    const input = { ...stepInput(initial), porterAddress: movedAddress };
    const result = stepBio0Ecology(initial, input);

    expect(result.ok, result.reason).toBe(true);
    expect(result.state.porterAddress).toEqual(movedAddress);
    expect(result.state.dog.perception.beliefs[0]?.area.center.localX).toBe(24_500);

    const wrongIdentity = createLivingActorAddress({
      ...movedAddress,
      actorId: "H-v1-different-porter",
    }) as Bio0EcologyState["porterAddress"];
    const rejected = stepBio0Ecology(result.state, {
      ...stepInput(result.state),
      porterAddress: wrongIdentity,
    });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid-input", event: null });
    expect(rejected.state).toBe(result.state);
  });

  it("rolls back the entire step when contact or a downstream behavior boundary is invalid", () => {
    const approached = advanceUntilApproach(createBio0Ecology(fixtureInput()));
    const offered = offerContact(approached, "forged");
    const wrongContact = { ...offered.contact, sourceLotId: "provision:forged" };
    const invalidContact = stepBio0Ecology(
      offered.state,
      stepInput(offered.state, wrongContact),
    );

    expect(invalidContact).toMatchObject({ ok: false, reason: "invalid-input", event: null });
    expect(invalidContact.state).toBe(offered.state);

    const noObserve = Object.freeze({ ...ACCESS_ALL, observe: false });
    const rejectedOffer = offerContact(approached, "reject");
    const rejectedBehavior = stepBio0Ecology(
      rejectedOffer.state,
      stepInput(rejectedOffer.state, rejectedOffer.contact, calmExposure(), noObserve),
    );
    expect(rejectedBehavior).toMatchObject({
      ok: false,
      reason: "behavior-step-rejected",
      event: null,
    });
    expect(rejectedBehavior.state).toBe(rejectedOffer.state);
    expect(providerLot(rejectedBehavior.state)?.payload).toMatchObject({ quantity: 2 });
  });

  it("cannot replay a compacted or current contact transaction to farm food effects", () => {
    const approached = advanceUntilApproach(createBio0Ecology(fixtureInput(2)));
    const offered = offerContact(approached, "stable");
    const firstContact = offered.contact;
    const eaten = stepBio0Ecology(offered.state, stepInput(offered.state, firstContact));
    expect(eaten.ok).toBe(true);
    const firstPromotion = eaten.state.dog.promotion;
    const firstKnowledge = eaten.state.dog.playerKnowledge;

    let readyAgain = eaten.state;
    for (let attempt = 0; attempt < 24 && readyAgain.dog.intent.kind !== "approach-food"; attempt += 1) {
      const advanced = stepBio0Ecology(readyAgain, stepInput(readyAgain));
      expect(advanced.ok, advanced.reason).toBe(true);
      readyAgain = advanced.state;
    }
    expect(readyAgain.dog.intent.kind).toBe("approach-food");
    const replay = stepBio0Ecology(
      readyAgain,
      stepInput(readyAgain, firstContact),
    );
    expect(replay).toMatchObject({ ok: false, reason: "invalid-input", event: null });
    expect(replay.state).toBe(readyAgain);
    expect(providerLot(replay.state)?.payload).toMatchObject({ quantity: 1 });
    expect(replay.state.dog.promotion).toEqual(firstPromotion);
    expect(replay.state.dog.playerKnowledge).toEqual(firstKnowledge);
  });

  it("applies dog weather exposure and needs deterministically through their shared kernels", () => {
    const weather = calmExposure({
      rain: FIXED_POINT,
      ambientCold: 900_000,
      wind: 800_000,
      exertion: 300_000,
    });
    let first = createBio0Ecology(fixtureInput());
    let second = createBio0Ecology(fixtureInput());
    const initialNeeds = first.dog.needs;
    for (let index = 0; index < 4; index += 1) {
      const one = stepBio0Ecology(first, stepInput(first, null, weather));
      const two = stepBio0Ecology(second, stepInput(second, null, weather));
      expect(one.ok, one.reason).toBe(true);
      expect(two.ok, two.reason).toBe(true);
      first = one.state;
      second = two.state;
    }

    expect(second).toEqual(first);
    expect(first.dog.condition.wetness).toBeGreaterThan(0);
    expect(first.dog.condition.coldStress).toBeGreaterThan(0);
    expect(first.dog.needs).not.toEqual(initialNeeds);
    expect(first.lastExposure).toEqual(weather);
  });

  it("compacts old event evidence canonically and continues beyond 64 ticks", () => {
    let state = createBio0Ecology({
      ...fixtureInput(),
      food: { ...food(), providerClosure: "secured" },
    });
    for (let index = 0; index < BIO0_ECOLOGY_MAX_RETAINED_EVENTS + 7; index += 1) {
      const result = stepBio0Ecology(state, stepInput(state));
      expect(result.ok, `${index}: ${result.reason}`).toBe(true);
      state = result.state;
    }

    expect(state.revision).toBe(BIO0_ECOLOGY_MAX_RETAINED_EVENTS + 7);
    expect(state.events).toHaveLength(BIO0_ECOLOGY_MAX_RETAINED_EVENTS);
    expect(state.historyBaseOrdinal).toBe(7);
    expect(state.historyArchiveHash).not.toBe("0000000000000000");
    expect(state.events[0]?.ordinal).toBe(8);
    expect(deserializeBio0Ecology(serializeBio0Ecology(state))).toEqual(state);

    const continued = stepBio0Ecology(state, stepInput(state));
    expect(continued.ok, continued.reason).toBe(true);
    expect(continued.state.revision).toBe(BIO0_ECOLOGY_MAX_RETAINED_EVENTS + 8);
  });

  it("fails forged canonical state, event, receipt, extra keys, and negative zero closed", () => {
    let state = advanceUntilApproach(createBio0Ecology(fixtureInput()));
    const offered = offerContact(state, "forgery-fixture");
    const consumed = stepBio0Ecology(offered.state, stepInput(offered.state, offered.contact));
    expect(consumed.ok).toBe(true);
    state = consumed.state;

    expect(canonicalizeBio0EcologyState({ ...state, debug: true })).toBeNull();
    expect(canonicalizeBio0EcologyState({ ...state, revision: -0 })).toBeNull();
    expect(canonicalizeBio0EcologyState({
      ...state,
      foodSource: { ...state.foodSource, debug: true },
    })).toBeNull();
    expect(canonicalizeBio0EcologyState({
      ...state,
      events: state.events.map((event, index) => index === state.events.length - 1
        ? { ...event, debug: true }
        : event),
    })).toBeNull();
    expect(canonicalizeBio0EcologyState({
      ...state,
      foodConsumption: {
        ...state.foodConsumption,
        lastAppliedEventOrdinal: state.foodConsumption.lastAppliedEventOrdinal - 1,
      },
    })).toBeNull();
    expect(canonicalizeBio0EcologyState({
      ...state,
      cargo: { ...state.cargo, events: state.cargo.events.slice(0, -1) },
    })).toBeNull();

    const symbolExtra = { ...state, [Symbol("debug")]: true };
    expect(canonicalizeBio0EcologyState(symbolExtra)).toBeNull();
    const concealedExtra = { ...state };
    Object.defineProperty(concealedExtra, "debug", { value: true, enumerable: false });
    expect(canonicalizeBio0EcologyState(concealedExtra)).toBeNull();
  });
});
