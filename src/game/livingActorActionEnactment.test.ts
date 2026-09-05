import { describe, expect, it } from "vitest";

import {
  createActorPerceptionState,
  stepActorPerception,
  type ActorPerceptionState,
} from "../sim/actorPerception";
import { globalTileToRegion } from "../sim/regions";
import { FIXED_POINT } from "../sim/types";
import {
  addActorCargoProvision,
  consumeActorCargoProvision,
  createActorCargoContainer,
  createActorCargoState,
  deserializeActorCargoState,
  serializeActorCargoState,
  type ActorCargoState,
} from "./actorCargo";
import { createLivingActorAddress, type LivingActorAddress } from "./livingActor";
import {
  LIVING_ACTOR_ACTION_ENACTMENT_VERSION,
  canonicalizeOfferedProvisionContact,
  enactLivingActorAction,
} from "./livingActorActionEnactment";
import {
  createLivingActorPlayerChoiceAction,
  createLivingActorPlayerChoiceState,
  reduceLivingActorPlayerChoice,
  type LivingActorPlayerChoiceKind,
  type LivingActorPlayerChoiceState,
} from "./livingActorPlayerChoice";
import {
  LIVING_ACTOR_VISUAL_CONTACT_VERSION,
  collectLivingActorVisualContactObservations,
} from "./livingActorVisualContact";
import { proveLooseCargoMultiCarrierConservation } from "./looseCargo";
import { evaluatePerception } from "./perception";
import {
  PORTER_RESPONSE_VERSION,
  createPorterResponseState,
  type PorterResponseInput,
} from "./porterResponse";
import { createWorldPosition, translateWorldPosition } from "./worldPosition";

const PLAYER_ID = "player:enactment/1";
const PORTER_ID = "H-porter-enactment";
const DOG_ID = "D-dog-enactment";
const FOREIGN_ID = "D-foreign-enactment";
const PORTER_PACK = "pack:porter-enactment";
const DOG_PACK = "pack:dog-enactment";
const FOREIGN_PACK = "pack:foreign-enactment";
const FOOD_LOT = "food:enactment";

interface Fixture {
  readonly cargo: ActorCargoState;
  readonly porter: LivingActorAddress;
  readonly dog: LivingActorAddress;
  readonly choiceState: LivingActorPlayerChoiceState;
  readonly requestId: string;
  readonly porterInput: PorterResponseInput;
}

function fixture(
  kind: Extract<LivingActorPlayerChoiceKind, "ask-offer-provision" | "ask-secure-provisions">,
  options: Readonly<{
    hiddenFromPorter?: boolean;
    decisionTick?: number;
    providerClosure?: "open" | "secured";
    forceSecurePolicy?: boolean;
  }> = {},
): Fixture {
  const requestTick = 10;
  const decisionTick = options.decisionTick ?? requestTick;
  const originTile = globalTileToRegion(-36, 18);
  const origin = createWorldPosition(
    originTile.region,
    originTile.localX * 1_000,
    originTile.localY * 1_000,
  );
  const porter = createLivingActorAddress({
    actorId: PORTER_ID,
    species: "human",
    position: translateWorldPosition(origin, 6_500, 3_500),
    persistence: "promoted",
  });
  const dog = createLivingActorAddress({
    actorId: DOG_ID,
    species: "domestic-dog",
    position: translateWorldPosition(origin, 5_500, 3_500),
    persistence: "regional",
  });
  const foreign = createLivingActorAddress({
    actorId: FOREIGN_ID,
    species: "domestic-dog",
    position: translateWorldPosition(origin, 5_000, 3_500),
    persistence: "regional",
  });
  let cargo = createActorCargoState([
    createActorCargoContainer({
      id: DOG_PACK,
      custodianActorId: DOG_ID,
      capacityMilliLoad: 4_000,
      closure: "open",
    }),
    createActorCargoContainer({
      id: FOREIGN_PACK,
      custodianActorId: FOREIGN_ID,
      capacityMilliLoad: 4_000,
      closure: "open",
    }),
    createActorCargoContainer({
      id: PORTER_PACK,
      custodianActorId: PORTER_ID,
      capacityMilliLoad: 12_000,
      closure: options.providerClosure ?? (kind === "ask-offer-provision" ? "secured" : "open"),
    }),
  ]);
  const seeded = addActorCargoProvision(cargo, {
    transactionId: "generation:enactment-food",
    containerId: PORTER_PACK,
    lotId: FOOD_LOT,
    provision: "dried-fish",
    quantity: 2,
    materialState: { condition: 900_000, contamination: 0, decay: 50_000 },
  });
  if (!seeded.ok) throw new Error(`Could not seed action enactment fixture: ${seeded.reason}`);
  cargo = seeded.state;

  const width = 9;
  const height = 7;
  const playerPerception = evaluatePerception({
    columns: width,
    rows: height,
    playerTileIndex: 3 * width + 3,
    facingRadians: 0,
    weatherVisibility: 1,
    cells: Array.from({ length: width * height }, () => ({ elevation: 0, obstruction: 0 })),
  });
  const initialChoiceState = createLivingActorPlayerChoiceState(PLAYER_ID);
  const action = createLivingActorPlayerChoiceAction(initialChoiceState, kind === "ask-offer-provision"
    ? {
      kind,
      issuedAtTick: requestTick,
      custodianActorId: PORTER_ID,
      beneficiaryActorId: DOG_ID,
      containerId: PORTER_PACK,
    }
    : {
      kind,
      issuedAtTick: requestTick,
      custodianActorId: PORTER_ID,
      containerId: PORTER_PACK,
    });
  const choice = reduceLivingActorPlayerChoice(initialChoiceState, action, {
    actors: [dog, foreign, porter],
    cargo,
    observation: {
      window: { origin: { x: -36, y: 18 }, terrain: { width, height } },
      perception: playerPerception,
    },
  });
  if (!choice.ok || choice.event === null) throw new Error(`Could not seed player request: ${choice.reason}`);

  const porterPerception = perceivedDog(
    porter,
    dog,
    decisionTick,
    options.hiddenFromPorter === true,
  );
  const securePolicy = kind === "ask-secure-provisions" || options.forceSecurePolicy === true;
  const porterInput: PorterResponseInput = {
    version: PORTER_RESPONSE_VERSION,
    tick: decisionTick,
    perception: porterPerception,
    cargo,
    packContainerId: PORTER_PACK,
    weather: securePolicy
      ? { rainIntensity: 850_000, coldPressure: 400_000, windPressure: 300_000 }
      : { rainIntensity: 0, coldPressure: 0, windPressure: 0 },
    needs: { food: 0, rest: 0, belonging: 0 },
    disposition: securePolicy
      ? {
        traits: { resolve: 500_000, empathy: 0, curiosity: 0 },
        temperament: ["cautious", "practical"],
      }
      : {
        traits: { resolve: 500_000, empathy: FIXED_POINT, curiosity: 0 },
        temperament: ["protective", "social"],
      },
    accessibility: {
      "secure-food": true,
      reroute: true,
      leave: true,
      "offer-food": true,
      "wait-observe": true,
    },
    current: createPorterResponseState(PORTER_ID),
  };
  return {
    cargo,
    porter,
    dog,
    choiceState: choice.state,
    requestId: action.id,
    porterInput,
  };
}

function perceivedDog(
  porter: LivingActorAddress,
  dog: LivingActorAddress,
  tick: number,
  hidden: boolean,
): ActorPerceptionState {
  const initial = createActorPerceptionState(PORTER_ID);
  const observations = hidden
    ? []
    : collectLivingActorVisualContactObservations({
      version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
      observer: porter,
      tick,
      contacts: [{
        version: LIVING_ACTOR_VISUAL_CONTACT_VERSION,
        evidenceId: `contact:enactment:${tick}`,
        perceivedClass: "domestic-dog",
        subject: dog,
        lineOfSight: "clear",
        confidence: 900_000,
        salience: 860_000,
        identityEligible: true,
      }],
    });
  if (observations === null) throw new Error("Could not seed porter observation");
  const perceived = stepActorPerception(initial, { tick, observations });
  if (perceived === null) throw new Error("Could not seed porter perception");
  return perceived;
}

function enact(
  current: Fixture,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return enactLivingActorAction({
    version: LIVING_ACTOR_ACTION_ENACTMENT_VERSION,
    requestId: current.requestId,
    choiceState: current.choiceState,
    porter: current.porterInput,
    receiverContainerId: current.choiceState.events.at(-1)?.effect.kind === "request-provision-offer"
      ? DOG_PACK
      : null,
    ...overrides,
  });
}

function quantity(state: ActorCargoState, containerId: string): number {
  const container = state.containers.find(({ id }) => id === containerId);
  if (container === undefined) throw new Error(`Missing fixture container ${containerId}`);
  return container.carrier.lots.reduce((sum, lot) =>
    sum + (lot.payload.kind === "provision" ? lot.payload.quantity : 0), 0);
}

describe("species-neutral living actor action enactment", () => {
  it("requires the porter decision before moving exactly one physical provision unit", () => {
    const current = fixture("ask-offer-provision");
    const result = enact(current);

    expect(result).toMatchObject({
      ok: true,
      reason: "applied",
      decision: {
        actorId: PORTER_ID,
        intent: "offer-food",
        subjectId: DOG_ID,
        foodLotId: FOOD_LOT,
      },
      cargoEvent: {
        kind: "provision-transferred",
        sourceContainerId: PORTER_PACK,
        destinationContainerId: DOG_PACK,
        sourceLotId: FOOD_LOT,
        quantity: 1,
      },
      contact: {
        kind: "offered-provision-contact",
        providerActorId: PORTER_ID,
        beneficiaryActorId: DOG_ID,
        providerContainerId: PORTER_PACK,
        receiverContainerId: DOG_PACK,
        sourceLotId: FOOD_LOT,
        quantity: 1,
      },
    });
    if (result.cargo === null || result.contact === null) throw new Error("Offer omitted physical state");
    expect(quantity(result.cargo, PORTER_PACK)).toBe(1);
    expect(quantity(result.cargo, DOG_PACK)).toBe(1);
    expect(result.contact.resultLotId).not.toBe(FOOD_LOT);
    expect(canonicalizeOfferedProvisionContact(result.contact)).toEqual(result.contact);
  });

  it("closes the custodian's real pack only when their policy agrees", () => {
    const current = fixture("ask-secure-provisions");
    const result = enact(current);

    expect(result).toMatchObject({
      ok: true,
      reason: "applied",
      decision: { actorId: PORTER_ID, intent: "secure-food" },
      cargoEvent: {
        kind: "closure-changed",
        actorId: PORTER_ID,
        sourceContainerId: PORTER_PACK,
        destinationContainerId: PORTER_PACK,
      },
      contact: null,
    });
    expect(result.cargo?.containers.find(({ id }) => id === PORTER_PACK)?.closure).toBe("secured");
  });

  it("does not invent consent or animal identity when the porter saw nothing", () => {
    const current = fixture("ask-offer-provision", { hiddenFromPorter: true });
    const result = enact(current);

    expect(result).toMatchObject({
      ok: true,
      reason: "decision-only",
      decision: { intent: "wait-observe", subjectId: null, foodLotId: null },
      cargoEvent: null,
      contact: null,
    });
    expect(result.cargo).toEqual(current.cargo);
    expect(quantity(current.cargo, PORTER_PACK)).toBe(2);
    expect(quantity(current.cargo, DOG_PACK)).toBe(0);
  });

  it("replays the same pending contact without repeating or losing its transfer", () => {
    const current = fixture("ask-offer-provision");
    const first = enact(current);
    if (first.cargo === null || first.porterState === null) throw new Error("First enactment failed");
    const restoredCargo = deserializeActorCargoState(serializeActorCargoState(first.cargo));
    const replay = enact({
      ...current,
      cargo: restoredCargo,
      porterInput: { ...current.porterInput, cargo: restoredCargo, current: first.porterState },
    });

    expect(replay).toMatchObject({
      ok: true,
      reason: "already-applied",
      decision: null,
    });
    expect(replay.contact).toEqual(first.contact);
    expect(replay.cargo).toEqual(restoredCargo);
    expect(replay.cargo?.events).toHaveLength(first.cargo.events.length);
    expect(quantity(first.cargo, DOG_PACK)).toBe(1);
    expect(proveLooseCargoMultiCarrierConservation(
      [],
      current.cargo.containers.map(({ carrier }) => carrier),
      [],
      first.cargo.containers.map(({ carrier }) => carrier),
    ).conserved).toBe(true);
    expect(proveLooseCargoMultiCarrierConservation(
      [],
      first.cargo.containers.map(({ carrier }) => carrier),
      [],
      (replay.cargo ?? first.cargo).containers.map(({ carrier }) => carrier),
    ).conserved).toBe(true);
  });

  it("does not recover a contact after the beneficiary consumes the transferred lot", () => {
    const current = fixture("ask-offer-provision");
    const first = enact(current);
    if (first.cargo === null || first.porterState === null || first.contact === null) {
      throw new Error("First enactment failed");
    }
    const consumed = consumeActorCargoProvision(first.cargo, {
      transactionId: "test:consume-enacted-food",
      containerId: DOG_PACK,
      lotId: first.contact.resultLotId,
      quantity: 1,
    });
    expect(consumed.ok).toBe(true);
    const replay = enact({
      ...current,
      cargo: consumed.state,
      porterInput: { ...current.porterInput, cargo: consumed.state, current: first.porterState },
    });

    expect(replay).toMatchObject({ ok: true, reason: "already-applied", contact: null });
    expect(quantity(consumed.state, DOG_PACK)).toBe(0);
    expect(consumed.state.containers.find(({ id }) => id === DOG_PACK)?.carrier.retiredLotIds)
      .toContain(first.contact.resultLotId);
  });

  it("keeps a late unconsumed transfer physical without emitting a stale-tick contact", () => {
    const current = fixture("ask-offer-provision");
    const first = enact(current);
    if (first.cargo === null || first.porterState === null || first.contact === null) {
      throw new Error("First enactment failed");
    }
    const replay = enact({
      ...current,
      cargo: first.cargo,
      porterInput: {
        ...current.porterInput,
        tick: 23,
        perception: perceivedDog(current.porter, current.dog, 23, false),
        cargo: first.cargo,
        current: first.porterState,
      },
    });

    expect(replay).toMatchObject({ ok: true, reason: "already-applied", contact: null });
    expect(quantity(first.cargo, DOG_PACK)).toBe(1);
    expect(first.cargo.containers.find(({ id }) => id === DOG_PACK)?.carrier.lots[0]?.id)
      .toBe(first.contact.resultLotId);
  });

  it("aligns contact to the next accepted ecology tick and deterministically expires stale requests", () => {
    const nextTick = fixture("ask-offer-provision", { decisionTick: 11 });
    const enacted = enact(nextTick);
    expect(enacted).toMatchObject({
      ok: true,
      reason: "applied",
      decision: { tick: 11 },
      contact: { tick: 11 },
    });

    const expired = fixture("ask-offer-provision", { decisionTick: 23 });
    expect(enact(expired)).toMatchObject({
      ok: false,
      reason: "request-expired",
      cargoEvent: null,
      contact: null,
    });
  });

  it("physically secures food when that is the porter's lawful response to HELP", () => {
    const current = fixture("ask-offer-provision", {
      providerClosure: "open",
      forceSecurePolicy: true,
    });
    const result = enact(current);

    expect(result).toMatchObject({
      ok: true,
      reason: "applied",
      decision: { intent: "secure-food" },
      cargoEvent: { kind: "closure-changed", actorId: PORTER_ID },
      contact: null,
    });
    expect(result.cargo?.containers.find(({ id }) => id === PORTER_PACK)?.closure).toBe("secured");
  });

  it("rejects receiver-custody substitution and caller-authored consent", () => {
    const current = fixture("ask-offer-provision");
    expect(enact(current, { receiverContainerId: FOREIGN_PACK })).toMatchObject({
      ok: false,
      reason: "identity-conflict",
      cargoEvent: null,
      contact: null,
    });
    expect(enactLivingActorAction({
      version: LIVING_ACTOR_ACTION_ENACTMENT_VERSION,
      requestId: current.requestId,
      choiceState: current.choiceState,
      porter: current.porterInput,
      receiverContainerId: DOG_PACK,
      consent: true,
    })).toMatchObject({ ok: false, reason: "invalid-input" });
    expect(quantity(current.cargo, PORTER_PACK)).toBe(2);
  });

  it("distinguishes an unavailable request from malformed authority", () => {
    const current = fixture("ask-offer-provision");
    expect(enact(current, { requestId: "living-choice:missing" })).toMatchObject({
      ok: false,
      reason: "request-not-retained",
    });
  });

  it("rejects tampered contact evidence instead of trusting an adapter", () => {
    const current = fixture("ask-offer-provision");
    const result = enact(current);
    if (result.contact === null) throw new Error("Offer did not emit contact evidence");
    expect(canonicalizeOfferedProvisionContact({
      ...result.contact,
      beneficiaryActorId: FOREIGN_ID,
    })).toBeNull();
    expect(canonicalizeOfferedProvisionContact({
      ...result.contact,
      debug: true,
    })).toBeNull();
  });
});
