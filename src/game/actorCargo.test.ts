import { describe, expect, it } from "vitest";

import { ACTOR_ID_MAX_LENGTH } from "../sim/actorPerception";
import { FIXED_POINT } from "../sim/types";
import {
  actorCargoFragmentLotId,
  addActorCargoProvision,
  consumeActorCargoProvision,
  createActorCargoContainer,
  createActorCargoState,
  deserializeActorCargoState,
  inspectActorCargoContainerExposure,
  serializeActorCargoState,
  setActorCargoContainerClosure,
  transferActorCargoProvision,
  validateActorCargoState,
  type ActorCargoState,
} from "./actorCargo";
import { inspectLooseCargoMultiCarrierConservation } from "./looseCargo";

function state(): ActorCargoState {
  return createActorCargoState([
    createActorCargoContainer({
      id: "pack:dog:4",
      custodianActorId: "dog:glasswater:4",
      capacityMilliLoad: 5_000,
      rainProtection: 400_000,
      scentContainment: 300_000,
    }),
    createActorCargoContainer({
      id: "pack:porter:17",
      custodianActorId: "human:glasswater:17",
      capacityMilliLoad: 12_000,
      rainProtection: 800_000,
      scentContainment: 700_000,
    }),
  ]);
}

function withFish(quantity = 4): ActorCargoState {
  const result = addActorCargoProvision(state(), {
    transactionId: "generation:food:17",
    containerId: "pack:porter:17",
    lotId: "provision:food:17",
    provision: "dried-fish",
    quantity,
    materialState: { condition: 900_000, contamination: 0, decay: 100_000 },
  });
  expect(result.ok).toBe(true);
  return result.state;
}

function container(current: ActorCargoState, id: string) {
  const match = current.containers.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`missing fixture container ${id}`);
  return match;
}

describe("actor cargo containers", () => {
  it("accepts the shared slash-compatible 192-character actor identity envelope", () => {
    const actorId = `dog/frontier:${"x".repeat(ACTOR_ID_MAX_LENGTH - "dog/frontier:".length)}`;
    expect(actorId).toHaveLength(ACTOR_ID_MAX_LENGTH);
    expect(createActorCargoContainer({
      id: "pack:frontier-dog",
      custodianActorId: actorId,
      capacityMilliLoad: 1_000,
    }).custodianActorId).toBe(actorId);
    expect(() => createActorCargoContainer({
      id: "pack:invalid-dog",
      custodianActorId: `${actorId}x`,
      capacityMilliLoad: 1_000,
    })).toThrow(/invalid/i);
  });

  it("binds one physical pack to one stable actor and serializes canonical container order", () => {
    const current = state();
    expect(current.containers.map(({ id }) => id)).toEqual(["pack:dog:4", "pack:porter:17"]);
    expect(current.containers.map(({ carrier }) => carrier.owner)).toEqual([
      { kind: "actor", id: "dog:glasswater:4" },
      { kind: "actor", id: "human:glasswater:17" },
    ]);
    const decoded = deserializeActorCargoState(serializeActorCargoState(current));
    expect(decoded).toEqual(current);
    expect(validateActorCargoState(decoded).valid).toBe(true);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.containers)).toBe(true);
    expect(Object.isFrozen(decoded.containers[0]?.carrier.lots)).toBe(true);
  });

  it("fails noncanonical or forged persisted shapes closed", () => {
    const current = withFish(1);
    const extraState = { ...JSON.parse(serializeActorCargoState(current)), hidden: true };
    expect(validateActorCargoState(extraState).valid).toBe(false);

    const extraContainer = JSON.parse(serializeActorCargoState(current));
    extraContainer.containers[0].hidden = true;
    expect(validateActorCargoState(extraContainer).valid).toBe(false);

    const concealedContainer = JSON.parse(serializeActorCargoState(current));
    Object.defineProperty(concealedContainer.containers[0], "hidden", {
      value: true,
      enumerable: false,
    });
    expect(validateActorCargoState(concealedContainer).valid).toBe(false);

    const symbolicEvent = JSON.parse(serializeActorCargoState(current));
    symbolicEvent.events[0][Symbol("hidden")] = true;
    expect(validateActorCargoState(symbolicEvent).valid).toBe(false);

    const extraNestedCarrier = JSON.parse(serializeActorCargoState(current));
    extraNestedCarrier.containers[0].carrier.hidden = true;
    expect(validateActorCargoState(extraNestedCarrier).valid).toBe(false);

    const concealedNestedCarrier = JSON.parse(serializeActorCargoState(current));
    Object.defineProperty(concealedNestedCarrier.containers[0].carrier, "hidden", {
      value: true,
      enumerable: false,
    });
    expect(validateActorCargoState(concealedNestedCarrier).valid).toBe(false);

    const reversed = JSON.parse(serializeActorCargoState(current));
    reversed.containers.reverse();
    expect(validateActorCargoState(reversed)).toMatchObject({
      valid: false,
      reason: "noncanonical-order",
    });

    const negativeZero = JSON.parse(serializeActorCargoState(current));
    negativeZero.revision = -0;
    expect(validateActorCargoState(negativeZero).valid).toBe(false);

    const nestedNegativeZero = JSON.parse(serializeActorCargoState(current));
    nestedNegativeZero.containers[0].carrier.revision = -0;
    expect(validateActorCargoState(nestedNegativeZero).valid).toBe(false);

    const mismatchedRevision = JSON.parse(serializeActorCargoState(current));
    mismatchedRevision.revision += 1;
    expect(validateActorCargoState(mismatchedRevision)).toMatchObject({
      valid: false,
      reason: "invalid-revision",
    });

    const incoherentEvent = JSON.parse(serializeActorCargoState(current));
    incoherentEvent.events[0].kind = "closure-changed";
    expect(validateActorCargoState(incoherentEvent)).toMatchObject({
      valid: false,
      reason: "invalid-event",
    });

    const extraEvent = JSON.parse(serializeActorCargoState(current));
    extraEvent.events[0].hidden = true;
    expect(validateActorCargoState(extraEvent)).toMatchObject({
      valid: false,
      reason: "invalid-event",
    });
  });

  it("rejects extra or missing request keys on every mutation before an event can commit", () => {
    const initial = withFish(2);
    const concealedExtra = {
      transactionId: "request-shape:consume:concealed-extra",
      containerId: "pack:porter:17",
      lotId: "provision:food:17",
      quantity: 1,
    };
    Object.defineProperty(concealedExtra, "hidden", { value: true, enumerable: false });
    const symbolicExtra = {
      transactionId: "request-shape:closure:symbol-extra",
      containerId: "pack:porter:17",
      closure: "open" as const,
      [Symbol("hidden")]: true,
    };
    const invalidResults = [
      addActorCargoProvision(initial, {
        transactionId: "request-shape:add:extra",
        containerId: "pack:dog:4",
        lotId: "provision:shape:add",
        provision: "trail-ration",
        quantity: 1,
        hidden: true,
      } as any),
      addActorCargoProvision(initial, {
        transactionId: "request-shape:add:missing",
        containerId: "pack:dog:4",
        lotId: "provision:shape:add",
        provision: "trail-ration",
      } as any),
      transferActorCargoProvision(initial, {
        transactionId: "request-shape:transfer:extra",
        sourceContainerId: "pack:porter:17",
        destinationContainerId: "pack:dog:4",
        lotId: "provision:food:17",
        quantity: 1,
        hidden: true,
      } as any),
      transferActorCargoProvision(initial, {
        transactionId: "request-shape:transfer:missing",
        sourceContainerId: "pack:porter:17",
        destinationContainerId: "pack:dog:4",
        lotId: "provision:food:17",
      } as any),
      consumeActorCargoProvision(initial, {
        transactionId: "request-shape:consume:extra",
        containerId: "pack:porter:17",
        lotId: "provision:food:17",
        quantity: 1,
        hidden: true,
      } as any),
      consumeActorCargoProvision(initial, {
        transactionId: "request-shape:consume:missing",
        containerId: "pack:porter:17",
        lotId: "provision:food:17",
      } as any),
      consumeActorCargoProvision(initial, concealedExtra),
      setActorCargoContainerClosure(initial, {
        transactionId: "request-shape:closure:extra",
        containerId: "pack:porter:17",
        closure: "open",
        hidden: true,
      } as any),
      setActorCargoContainerClosure(initial, {
        transactionId: "request-shape:closure:missing",
        containerId: "pack:porter:17",
      } as any),
      setActorCargoContainerClosure(initial, symbolicExtra),
    ];

    for (const result of invalidResults) {
      expect(result).toMatchObject({
        ok: false,
        reason: "invalid-request",
        event: null,
        affectedLot: null,
      });
      expect(result.state).toBe(initial);
      expect(result.state.lastEventOrdinal).toBe(initial.lastEventOrdinal);
    }
  });

  it("keeps exact valid add and closure transactions idempotent", () => {
    const initial = state();
    const addRequest = {
      transactionId: "request-shape:add:valid",
      containerId: "pack:dog:4",
      lotId: "provision:shape:valid",
      provision: "trail-ration" as const,
      quantity: 1,
      materialState: { condition: 800_000, contamination: 10_000, decay: 20_000 },
    };
    const added = addActorCargoProvision(initial, addRequest);
    expect(added).toMatchObject({ ok: true, reason: "applied" });
    expect(addActorCargoProvision(added.state, addRequest)).toMatchObject({
      ok: true,
      reason: "already-applied",
      event: added.event,
    });

    const closureRequest = {
      transactionId: "request-shape:closure:valid",
      containerId: "pack:dog:4",
      closure: "open" as const,
    };
    const opened = setActorCargoContainerClosure(added.state, closureRequest);
    expect(opened).toMatchObject({ ok: true, reason: "applied" });
    expect(setActorCargoContainerClosure(opened.state, closureRequest)).toMatchObject({
      ok: true,
      reason: "already-applied",
      event: opened.event,
    });
  });

  it("derives bounded, condition-sensitive weather protection and scent leakage", () => {
    const current = withFish(2);
    const secured = inspectActorCargoContainerExposure(
      container(current, "pack:porter:17"),
      900_000,
    );
    expect(secured.effectiveRainProtection).toBe(800_000);
    expect(secured.rainIngress).toBe(180_000);
    expect(secured.uncontainedProvisionScent).toBeGreaterThan(0);
    expect(secured.provisionScentLeak).toBeLessThan(secured.uncontainedProvisionScent);
    expect(secured.provisionScentLeak).toBeGreaterThanOrEqual(0);
    expect(secured.provisionScentLeak).toBeLessThanOrEqual(FIXED_POINT);

    const opened = setActorCargoContainerClosure(current, {
      transactionId: "open:porter-pack:1",
      containerId: "pack:porter:17",
      closure: "open",
    });
    expect(opened.ok).toBe(true);
    const exposed = inspectActorCargoContainerExposure(
      container(opened.state, "pack:porter:17"),
      900_000,
    );
    expect(exposed.effectiveRainProtection).toBe(0);
    expect(exposed.rainIngress).toBe(900_000);
    expect(exposed.provisionScentLeak).toBe(exposed.uncontainedProvisionScent);
  });
});

describe("atomic actor provision custody", () => {
  it("partially transfers a deterministic child lot without duplicating substance", () => {
    const before = withFish(4);
    const beforeCopy = structuredClone(before);
    const transfer = transferActorCargoProvision(before, {
      transactionId: "offer:fish:dog:1",
      sourceContainerId: "pack:porter:17",
      destinationContainerId: "pack:dog:4",
      lotId: "provision:food:17",
      quantity: 1,
    });
    expect(transfer.ok).toBe(true);
    expect(transfer.conservation?.conserved).toBe(true);
    expect(before).toEqual(beforeCopy);

    const childId = actorCargoFragmentLotId("provision:food:17", "offer:fish:dog:1");
    expect(container(transfer.state, "pack:dog:4").carrier.lots).toEqual([
      expect.objectContaining({ id: childId, payload: expect.objectContaining({ quantity: 1 }) }),
    ]);
    expect(container(transfer.state, "pack:porter:17").carrier.lots).toEqual([
      expect.objectContaining({ id: "provision:food:17", payload: expect.objectContaining({ quantity: 3 }) }),
    ]);
    const forgedChild = JSON.parse(serializeActorCargoState(transfer.state));
    forgedChild.events[1].resultLotId = "provision:forged-child";
    expect(validateActorCargoState(forgedChild)).toMatchObject({
      valid: false,
      reason: "invalid-event",
    });
    expect(inspectLooseCargoMultiCarrierConservation(
      [],
      transfer.state.containers.map(({ carrier }) => carrier),
    ).valid).toBe(true);

    const replay = transferActorCargoProvision(transfer.state, {
      transactionId: "offer:fish:dog:1",
      sourceContainerId: "pack:porter:17",
      destinationContainerId: "pack:dog:4",
      lotId: "provision:food:17",
      quantity: 1,
    });
    expect(replay.ok).toBe(true);
    expect(replay.reason).toBe("already-applied");
    expect(replay.state).toEqual(transfer.state);

    const conflictingReplay = transferActorCargoProvision(transfer.state, {
      transactionId: "offer:fish:dog:1",
      sourceContainerId: "pack:porter:17",
      destinationContainerId: "pack:dog:4",
      lotId: "provision:food:17",
      quantity: 2,
    });
    expect(conflictingReplay.ok).toBe(false);
    expect(conflictingReplay.reason).toBe("identity-conflict");
    expect(conflictingReplay.state).toBe(transfer.state);
  });

  it("preserves the exact lot identity on a whole transfer", () => {
    const transfer = transferActorCargoProvision(withFish(2), {
      transactionId: "handoff:whole:1",
      sourceContainerId: "pack:porter:17",
      destinationContainerId: "pack:dog:4",
      lotId: "provision:food:17",
      quantity: 2,
    });
    expect(transfer.ok).toBe(true);
    expect(container(transfer.state, "pack:porter:17").carrier.lots).toEqual([]);
    expect(container(transfer.state, "pack:dog:4").carrier.lots[0]?.id).toBe("provision:food:17");
    expect(transfer.event).toMatchObject({
      sourceLotId: "provision:food:17",
      resultLotId: "provision:food:17",
      quantity: 2,
    });
  });

  it("fails an over-capacity transfer atomically", () => {
    const initial = createActorCargoState([
      createActorCargoContainer({
        id: "pack:small",
        custodianActorId: "dog:small",
        capacityMilliLoad: 600,
      }),
      createActorCargoContainer({
        id: "pack:source",
        custodianActorId: "human:source",
        capacityMilliLoad: 5_000,
      }),
    ]);
    const added = addActorCargoProvision(initial, {
      transactionId: "add:source:fish",
      containerId: "pack:source",
      lotId: "provision:source:fish",
      provision: "dried-fish",
      quantity: 2,
    });
    expect(added.ok).toBe(true);
    const before = structuredClone(added.state);
    const transfer = transferActorCargoProvision(added.state, {
      transactionId: "too-heavy:1",
      sourceContainerId: "pack:source",
      destinationContainerId: "pack:small",
      lotId: "provision:source:fish",
      quantity: 1,
    });
    expect(transfer.ok).toBe(false);
    expect(transfer.reason).toBe("capacity-exceeded");
    expect(transfer.state).toEqual(before);
    expect(transfer.event).toBeNull();
  });

  it("records partial consumption and an explicit terminal tombstone", () => {
    const initial = withFish(3);
    const partial = consumeActorCargoProvision(initial, {
      transactionId: "eat:porter:1",
      containerId: "pack:porter:17",
      lotId: "provision:food:17",
      quantity: 1,
    });
    expect(partial.ok).toBe(true);
    expect(partial.event).toMatchObject({
      kind: "provision-consumed",
      sourceLotId: "provision:food:17",
      resultLotId: "provision:food:17",
      quantity: 1,
      tombstoned: false,
      materialState: { condition: 900_000, contamination: 0, decay: 100_000 },
    });
    expect(container(partial.state, "pack:porter:17").carrier.lots[0]?.payload)
      .toMatchObject({ quantity: 2 });

    const terminal = consumeActorCargoProvision(partial.state, {
      transactionId: "eat:porter:2",
      containerId: "pack:porter:17",
      lotId: "provision:food:17",
      quantity: 2,
    });
    expect(terminal.ok).toBe(true);
    expect(terminal.event).toMatchObject({
      sourceLotId: "provision:food:17",
      resultLotId: null,
      quantity: 2,
      tombstoned: true,
    });
    expect(container(terminal.state, "pack:porter:17").carrier.retiredLotIds)
      .toContain("provision:food:17");
    expect(deserializeActorCargoState(serializeActorCargoState(terminal.state))).toEqual(terminal.state);

    const missingTombstone = JSON.parse(serializeActorCargoState(terminal.state));
    const porter = missingTombstone.containers.find(({ id }: { id: string }) => id === "pack:porter:17");
    porter.carrier.retiredLotIds = [];
    expect(validateActorCargoState(missingTombstone)).toMatchObject({
      valid: false,
      reason: "invalid-event",
    });
  });
});
