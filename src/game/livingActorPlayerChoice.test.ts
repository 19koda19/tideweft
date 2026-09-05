import { describe, expect, it } from "vitest";

import { globalTileToRegion } from "../sim/regions";
import {
  addActorCargoProvision,
  createActorCargoContainer,
  createActorCargoState,
  setActorCargoContainerClosure,
  type ActorCargoState,
} from "./actorCargo";
import { createLivingActorAddress, type LivingActorAddress } from "./livingActor";
import {
  LIVING_ACTOR_PLAYER_CHOICE_MAX_RETAINED_EVENTS,
  canonicalizeLivingActorPlayerChoiceState,
  createLivingActorPlayerChoiceAction,
  createLivingActorPlayerChoiceState,
  reduceLivingActorPlayerChoice,
  type LivingActorPlayerChoiceContext,
  type LivingActorPlayerChoiceState,
} from "./livingActorPlayerChoice";
import { evaluatePerception } from "./perception";
import { createWorldPosition, translateWorldPosition } from "./worldPosition";

const PLAYER_ID = "player:bio0/1";
const PORTER_ID = "H-v1-porter/choice-1";
const DOG_ID = "D-v1-dog/choice-1";
const PORTER_PACK = "pack:porter:choice-1";
const DOG_PACK = "pack:dog:choice-1";

interface Fixture {
  readonly state: LivingActorPlayerChoiceState;
  readonly porter: LivingActorAddress;
  readonly dog: LivingActorAddress;
  readonly context: LivingActorPlayerChoiceContext;
}

function fixture(options: Readonly<{
  providerClosure?: "open" | "secured";
  food?: boolean;
  facingRadians?: number;
  originX?: number;
  originY?: number;
}> = {}): Fixture {
  const width = 9;
  const height = 7;
  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;
  const addressed = globalTileToRegion(originX, originY);
  const origin = createWorldPosition(
    addressed.region,
    addressed.localX * 1_000,
    addressed.localY * 1_000,
  );
  const porter = createLivingActorAddress({
    actorId: PORTER_ID,
    species: "human",
    position: translateWorldPosition(origin, 6_500, 3_500),
    heading: 500_000,
    persistence: "promoted",
  });
  const dog = createLivingActorAddress({
    actorId: DOG_ID,
    species: "domestic-dog",
    position: translateWorldPosition(origin, 5_500, 3_500),
    heading: 500_000,
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
      id: PORTER_PACK,
      custodianActorId: PORTER_ID,
      capacityMilliLoad: 12_000,
      closure: options.providerClosure ?? "open",
    }),
  ]);
  if (options.food !== false) {
    const added = addActorCargoProvision(cargo, {
      transactionId: "generation:choice-food/1",
      containerId: PORTER_PACK,
      lotId: "provision:choice-food/1",
      provision: "dried-fish",
      quantity: 2,
      materialState: { condition: 900_000, contamination: 0, decay: 50_000 },
    });
    if (!added.ok) throw new Error(`Could not seed choice cargo: ${added.reason}`);
    cargo = added.state;
  }
  const perception = evaluatePerception({
    columns: width,
    rows: height,
    playerTileIndex: 3 * width + 3,
    facingRadians: options.facingRadians ?? 0,
    weatherVisibility: 1,
    cells: Array.from({ length: width * height }, () => ({
      elevation: 0,
      obstruction: 0,
    })),
  });
  return {
    state: createLivingActorPlayerChoiceState(PLAYER_ID),
    porter,
    dog,
    context: {
      actors: [dog, porter],
      cargo,
      observation: {
        window: {
          origin: { x: originX, y: originY },
          terrain: { width, height },
        },
        perception,
      },
    },
  };
}

function offerAction(current: LivingActorPlayerChoiceState, tick = 10) {
  return createLivingActorPlayerChoiceAction(current, {
    kind: "ask-offer-provision",
    issuedAtTick: tick,
    custodianActorId: PORTER_ID,
    beneficiaryActorId: DOG_ID,
    containerId: PORTER_PACK,
  });
}

describe("species-neutral living actor player choices", () => {
  it("records an honest provision request without moving, duplicating, or stealing food", () => {
    const first = fixture();
    const second = fixture();
    const action = offerAction(first.state);
    expect(action).toEqual(offerAction(second.state));

    const result = reduceLivingActorPlayerChoice(first.state, action, first.context);
    expect(result).toMatchObject({
      ok: true,
      reason: "applied",
      effect: {
        kind: "request-provision-offer",
        requestId: action.id,
        custodianActorId: PORTER_ID,
        beneficiaryActorId: DOG_ID,
        containerId: PORTER_PACK,
      },
    });
    expect(result.effect).not.toHaveProperty("lotId");
    expect(result.effect).not.toHaveProperty("quantity");
    expect(first.context.cargo).toEqual(second.context.cargo);
    expect(provisionQuantity(first.context.cargo)).toBe(2);
    expect(first.context.cargo.containers.find(({ id }) => id === PORTER_PACK)?.carrier.lots)
      .toHaveLength(1);
    expect(first.context.cargo.containers.find(({ id }) => id === DOG_PACK)?.carrier.lots)
      .toHaveLength(0);

    const replay = reduceLivingActorPlayerChoice(result.state, action, first.context);
    expect(replay).toMatchObject({ ok: true, reason: "already-applied", effect: null });
    expect(replay.state).toEqual(result.state);
  });

  it("asks the real custodian to secure an open provision pack without closing it magically", () => {
    const { state, context } = fixture({ providerClosure: "open" });
    const action = createLivingActorPlayerChoiceAction(state, {
      kind: "ask-secure-provisions",
      issuedAtTick: 12,
      custodianActorId: PORTER_ID,
      containerId: PORTER_PACK,
    });
    const result = reduceLivingActorPlayerChoice(state, action, context);

    expect(result).toMatchObject({
      ok: true,
      reason: "applied",
      effect: {
        kind: "request-secure-provisions",
        custodianActorId: PORTER_ID,
        containerId: PORTER_PACK,
      },
    });
    expect(context.cargo.containers.find(({ id }) => id === PORTER_PACK)?.closure).toBe("open");

    // A later actor-decision integration may accept using the existing physical
    // closure authority and the stable request identity.
    if (result.effect?.kind !== "request-secure-provisions") {
      throw new Error("Expected secure request");
    }
    const accepted = setActorCargoContainerClosure(context.cargo, {
      transactionId: result.effect.requestId,
      containerId: result.effect.containerId,
      closure: "secured",
    });
    expect(accepted).toMatchObject({ ok: true, reason: "applied" });
    expect(accepted.state.containers.find(({ id }) => id === PORTER_PACK)?.closure).toBe("secured");
  });

  it("does not create redundant secure events or imply an empty pack contains food", () => {
    const secured = fixture({ providerClosure: "secured" });
    const secure = createLivingActorPlayerChoiceAction(secured.state, {
      kind: "ask-secure-provisions",
      issuedAtTick: 1,
      custodianActorId: PORTER_ID,
      containerId: PORTER_PACK,
    });
    expect(reduceLivingActorPlayerChoice(secured.state, secure, secured.context)).toMatchObject({
      ok: false,
      reason: "already-satisfied",
      event: null,
    });

    const empty = fixture({ food: false });
    expect(reduceLivingActorPlayerChoice(
      empty.state,
      offerAction(empty.state),
      empty.context,
    )).toMatchObject({ ok: false, reason: "not-plausible", event: null });
  });

  it("supports wait, reroute, and leave as intentions without fabricating outcomes", () => {
    const current = fixture();
    const wait = createLivingActorPlayerChoiceAction(current.state, {
      kind: "wait-observe",
      issuedAtTick: 20,
      focusActorId: DOG_ID,
      durationTicks: 3,
    });
    const waited = reduceLivingActorPlayerChoice(current.state, wait, current.context);
    expect(waited.effect).toEqual({
      kind: "wait-observe",
      focusActorId: DOG_ID,
      untilTick: 23,
    });

    const reroute = createLivingActorPlayerChoiceAction(waited.state, {
      kind: "reroute",
      issuedAtTick: 23,
      focusActorId: DOG_ID,
    });
    const rerouted = reduceLivingActorPlayerChoice(waited.state, reroute, current.context);
    expect(rerouted.effect).toEqual({
      kind: "request-reroute",
      focusActorId: DOG_ID,
      avoidArea: { center: current.dog.position, radiusUnits: 1_000 },
    });

    const leave = createLivingActorPlayerChoiceAction(rerouted.state, {
      kind: "leave",
      issuedAtTick: 23,
      focusActorId: null,
    });
    const left = reduceLivingActorPlayerChoice(rerouted.state, leave, current.context);
    expect(left.effect).toEqual({ kind: "leave-interaction", focusActorId: null });
    expect(left.state.revision).toBe(3);
  });

  it("requires current direct perception rather than a caller-authored visibility claim", () => {
    const hidden = fixture({ facingRadians: Math.PI });
    const action = offerAction(hidden.state);
    expect(reduceLivingActorPlayerChoice(hidden.state, action, hidden.context)).toMatchObject({
      ok: false,
      reason: "not-observed",
    });
    expect(reduceLivingActorPlayerChoice(hidden.state, action, {
      ...hidden.context,
      visible: true,
    })).toMatchObject({ ok: false, reason: "invalid-context" });

    const grades = new Uint8Array(hidden.context.observation.perception.detailVisibilityGrades);
    grades.fill(2);
    const forged = {
      ...hidden.context,
      observation: {
        ...hidden.context.observation,
        perception: {
          ...hidden.context.observation.perception,
          detailVisibilityGrades: grades,
        },
      },
    };
    expect(reduceLivingActorPlayerChoice(hidden.state, action, forged)).toMatchObject({
      ok: false,
      reason: "invalid-context",
    });
  });

  it("rejects wrong custody and never turns a request into physical access", () => {
    const current = fixture();
    const forgedCustody = createLivingActorPlayerChoiceAction(current.state, {
      kind: "ask-offer-provision",
      issuedAtTick: 10,
      custodianActorId: DOG_ID,
      beneficiaryActorId: PORTER_ID,
      containerId: PORTER_PACK,
    });
    const result = reduceLivingActorPlayerChoice(current.state, forgedCustody, current.context);
    expect(result).toMatchObject({ ok: false, reason: "not-plausible", event: null });
    expect(result.state).toEqual(current.state);
    expect(current.context.cargo.containers.find(({ id }) => id === PORTER_PACK)?.custodianActorId)
      .toBe(PORTER_ID);
  });

  it("fails malformed, colliding, and out-of-order actions closed", () => {
    const current = fixture();
    const firstAction = offerAction(current.state);
    const first = reduceLivingActorPlayerChoice(current.state, firstAction, current.context);
    expect(first.ok).toBe(true);
    const secondAction = createLivingActorPlayerChoiceAction(first.state, {
      kind: "leave",
      issuedAtTick: 11,
      focusActorId: null,
    });

    expect(reduceLivingActorPlayerChoice(current.state, secondAction, current.context)).toMatchObject({
      ok: false,
      reason: "out-of-order",
    });
    expect(reduceLivingActorPlayerChoice(first.state, {
      ...firstAction,
      kind: "leave",
    }, current.context)).toMatchObject({ ok: false, reason: "invalid-action" });
    expect(reduceLivingActorPlayerChoice(current.state, {
      ...firstAction,
      debug: true,
    }, current.context)).toMatchObject({ ok: false, reason: "invalid-action" });
  });

  it("retains bounded evidence and makes archived replay a no-effect operation", () => {
    const current = fixture();
    let state = current.state;
    let firstAction: ReturnType<typeof createLivingActorPlayerChoiceAction> | null = null;
    for (let ordinal = 1; ordinal <= LIVING_ACTOR_PLAYER_CHOICE_MAX_RETAINED_EVENTS + 2; ordinal += 1) {
      const action = createLivingActorPlayerChoiceAction(state, {
        kind: "wait-observe",
        issuedAtTick: ordinal,
        focusActorId: null,
        durationTicks: 1,
      });
      firstAction ??= action;
      const result = reduceLivingActorPlayerChoice(state, action, current.context);
      expect(result.ok, result.reason).toBe(true);
      state = result.state;
    }
    expect(state.events).toHaveLength(LIVING_ACTOR_PLAYER_CHOICE_MAX_RETAINED_EVENTS);
    expect(state.historyBaseOrdinal).toBe(2);
    expect(state.historyArchiveHash).not.toBe("0000000000000000");
    expect(canonicalizeLivingActorPlayerChoiceState(state)).toEqual(state);
    if (firstAction === null) throw new Error("Missing archived action");
    expect(reduceLivingActorPlayerChoice(state, firstAction, current.context)).toMatchObject({
      ok: true,
      reason: "already-applied",
      event: null,
      effect: null,
    });
  });

  it("preserves signed distant coordinates in the observed reroute evidence", () => {
    const current = fixture({ originX: -8_000_003, originY: 7_000_009 });
    const action = createLivingActorPlayerChoiceAction(current.state, {
      kind: "reroute",
      issuedAtTick: 99,
      focusActorId: DOG_ID,
    });
    const result = reduceLivingActorPlayerChoice(current.state, action, current.context);
    expect(result.ok, result.reason).toBe(true);
    expect(result.effect).toMatchObject({
      kind: "request-reroute",
      avoidArea: { center: current.dog.position },
    });
  });

  it("rejects noncanonical state rather than repairing replay evidence", () => {
    const current = fixture();
    const malformed = {
      ...current.state,
      revision: -0,
    } as LivingActorPlayerChoiceState;
    expect(reduceLivingActorPlayerChoice(malformed, offerAction(current.state), current.context))
      .toMatchObject({ ok: false, reason: "invalid-state" });
  });
});

function provisionQuantity(state: ActorCargoState): number {
  return state.containers.reduce((total, container) => total + container.carrier.lots.reduce(
    (subtotal, lot) => subtotal + (lot.payload.kind === "provision" ? lot.payload.quantity : 0),
    0,
  ), 0);
}
