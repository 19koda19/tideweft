import { describe, expect, it } from "vitest";

import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  SITUATED_EXPRESSION_RECEPTION_CERTAINTY_SCALE,
  SITUATED_EXPRESSION_RECEPTION_VERSION,
  canonicalizeSituatedExpressionReception,
  createHeardUnseenSituatedExpressionReception,
  createHeardVisibleSituatedExpressionReception,
  createSelfSituatedExpressionReception,
  situatedExpressionReceptionAudibleContact,
  situatedExpressionReceptionMatchesActiveEvent,
} from "./situatedExpressionReception";
import type { SituatedExpressionEvent } from "./situatedExpression";

const EVENT = {
  eventId: "situated-expression:test-event",
  sourceActorId: "H-expression-speaker",
} as SituatedExpressionEvent;
const PLAYER_EVENT = {
  eventId: "situated-expression:player-event",
  sourceActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
} as SituatedExpressionEvent;

describe("situated-expression player reception", () => {
  it("creates frozen, compact self-reception evidence at full certainty", () => {
    const receipt = createSelfSituatedExpressionReception(PLAYER_EVENT, 47);

    expect(receipt).toEqual({
      version: SITUATED_EXPRESSION_RECEPTION_VERSION,
      eventId: PLAYER_EVENT.eventId,
      sourceActorId: PLAYER_EVENT.sourceActorId,
      receivedAtTick: 47,
      kind: "self",
      certainty: SITUATED_EXPRESSION_RECEPTION_CERTAINTY_SCALE,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.keys(receipt ?? {})).not.toContain("position");
    expect(Object.keys(receipt ?? {})).not.toContain("text");
  });

  it("requires explicit direct sight for heard-visible exact-word evidence", () => {
    const heard = createHeardVisibleSituatedExpressionReception(
      EVENT,
      48,
      725_000,
      true,
    );
    expect(heard).toEqual({
      version: SITUATED_EXPRESSION_RECEPTION_VERSION,
      eventId: EVENT.eventId,
      sourceActorId: EVENT.sourceActorId,
      receivedAtTick: 48,
      kind: "heard-visible",
      certainty: 725_000,
      directVisualReceipt: true,
    });
    expect(Object.isFrozen(heard)).toBe(true);
    expect(createHeardVisibleSituatedExpressionReception(EVENT, 48, 725_000, false)).toBeNull();
  });

  it("stores only bounded anonymous acoustic bands for an unseen source", () => {
    const contact = {
      bearing: {
        centerRadians: Math.PI / 2,
        uncertaintyRadians: Math.PI / 36,
      },
      distanceBand: { minimum: 3_250, maximum: 9_500 },
      certainty: 0.73,
    };
    const heard = createHeardUnseenSituatedExpressionReception(EVENT, 48, contact);

    expect(heard).toEqual({
      version: SITUATED_EXPRESSION_RECEPTION_VERSION,
      eventId: EVENT.eventId,
      sourceActorId: EVENT.sourceActorId,
      receivedAtTick: 48,
      kind: "heard-unseen",
      certainty: 730_000,
      directVisualReceipt: false,
      bearingCenterMicroradians: 1_570_796,
      bearingUncertaintyMicroradians: 87_266,
      distanceMinimumMicrounits: 3_250_000_000,
      distanceMaximumMicrounits: 9_500_000_000,
    });
    expect(Object.isFrozen(heard)).toBe(true);
    expect(heard).not.toHaveProperty("position");
    expect(heard).not.toHaveProperty("sourcePosition");
    expect(heard).not.toHaveProperty("text");

    const restored = situatedExpressionReceptionAudibleContact(heard);
    expect(restored?.bearing.centerRadians).toBeCloseTo(contact.bearing.centerRadians, 5);
    expect(restored?.bearing.uncertaintyRadians)
      .toBeCloseTo(contact.bearing.uncertaintyRadians, 5);
    expect(restored?.distanceBand).toEqual(contact.distanceBand);
    expect(restored?.certainty).toBe(contact.certainty);
  });

  it("canonicalizes only exact-key, bounded schema variants", () => {
    const valid = {
      version: SITUATED_EXPRESSION_RECEPTION_VERSION,
      eventId: EVENT.eventId,
      sourceActorId: EVENT.sourceActorId,
      receivedAtTick: 49,
      kind: "heard-visible",
      certainty: 1,
      directVisualReceipt: true,
    };
    expect(canonicalizeSituatedExpressionReception(structuredClone(valid))).toEqual(valid);

    expect(canonicalizeSituatedExpressionReception({ ...valid, position: { x: 1, y: 2 } }))
      .toBeNull();
    expect(canonicalizeSituatedExpressionReception({ ...valid, text: "Exact NPC words" }))
      .toBeNull();
    expect(canonicalizeSituatedExpressionReception({ ...valid, kind: "heard-unseen" }))
      .toBeNull();
    expect(canonicalizeSituatedExpressionReception({ ...valid, directVisualReceipt: false }))
      .toBeNull();
    expect(canonicalizeSituatedExpressionReception({ ...valid, certainty: 0 })).toBeNull();
    expect(canonicalizeSituatedExpressionReception({
      ...valid,
      certainty: SITUATED_EXPRESSION_RECEPTION_CERTAINTY_SCALE + 1,
    })).toBeNull();
    expect(canonicalizeSituatedExpressionReception({ ...valid, certainty: 1.5 })).toBeNull();
    expect(canonicalizeSituatedExpressionReception({ ...valid, receivedAtTick: -0 })).toBeNull();
    expect(canonicalizeSituatedExpressionReception({ ...valid, receivedAtTick: Number.MAX_VALUE }))
      .toBeNull();
    expect(canonicalizeSituatedExpressionReception({ ...valid, eventId: " padded " })).toBeNull();
    expect(canonicalizeSituatedExpressionReception({
      ...valid,
      eventId: "x".repeat(181),
    })).toBeNull();

    const self = createSelfSituatedExpressionReception(EVENT, 50);
    expect(canonicalizeSituatedExpressionReception({ ...self, certainty: 999_999 })).toBeNull();
    expect(canonicalizeSituatedExpressionReception({
      ...self,
      directVisualReceipt: true,
    })).toBeNull();
  });

  it("matches only a canonical receipt for the exact active event and source", () => {
    const receipt = createHeardVisibleSituatedExpressionReception(EVENT, 51, 900_000, true);
    expect(situatedExpressionReceptionMatchesActiveEvent(receipt, EVENT)).toBe(true);
    expect(situatedExpressionReceptionMatchesActiveEvent(receipt, null)).toBe(false);
    expect(situatedExpressionReceptionMatchesActiveEvent(receipt, {
      ...EVENT,
      eventId: "situated-expression:other-event",
    })).toBe(false);
    expect(situatedExpressionReceptionMatchesActiveEvent(receipt, {
      ...EVENT,
      sourceActorId: "H-other-speaker",
    })).toBe(false);
    expect(situatedExpressionReceptionMatchesActiveEvent({
      ...receipt,
      directVisualReceipt: false,
    }, EVENT)).toBe(false);
  });

  it("requires self mode for the player and lawful hearing modes for every other source", () => {
    const residentSelf = createSelfSituatedExpressionReception(EVENT, 52);
    const playerSelf = createSelfSituatedExpressionReception(PLAYER_EVENT, 52);
    const residentHeard = createHeardVisibleSituatedExpressionReception(
      EVENT,
      52,
      800_000,
      true,
    );
    const playerHeard = createHeardVisibleSituatedExpressionReception(
      PLAYER_EVENT,
      52,
      800_000,
      true,
    );
    const residentUnseen = createHeardUnseenSituatedExpressionReception(EVENT, 52, {
      bearing: { centerRadians: 0, uncertaintyRadians: Math.PI / 60 },
      distanceBand: { minimum: 1_000, maximum: 4_000 },
      certainty: 0.8,
    });
    const playerUnseen = createHeardUnseenSituatedExpressionReception(PLAYER_EVENT, 52, {
      bearing: { centerRadians: 0, uncertaintyRadians: Math.PI / 60 },
      distanceBand: { minimum: 1_000, maximum: 4_000 },
      certainty: 0.8,
    });

    expect(situatedExpressionReceptionMatchesActiveEvent(playerSelf, PLAYER_EVENT)).toBe(true);
    expect(situatedExpressionReceptionMatchesActiveEvent(playerHeard, PLAYER_EVENT)).toBe(false);
    expect(situatedExpressionReceptionMatchesActiveEvent(playerUnseen, PLAYER_EVENT)).toBe(false);
    expect(situatedExpressionReceptionMatchesActiveEvent(residentHeard, EVENT)).toBe(true);
    expect(situatedExpressionReceptionMatchesActiveEvent(residentUnseen, EVENT)).toBe(true);
    expect(situatedExpressionReceptionMatchesActiveEvent(residentSelf, EVENT)).toBe(false);
  });

  it("fails closed when unseen evidence gains an exact position or malformed bands", () => {
    const valid = createHeardUnseenSituatedExpressionReception(EVENT, 53, {
      bearing: { centerRadians: Math.PI, uncertaintyRadians: Math.PI / 40 },
      distanceBand: { minimum: 2_000, maximum: 8_000 },
      certainty: 0.65,
    });
    if (valid === null) throw new Error("Unseen reception fixture was rejected");

    expect(canonicalizeSituatedExpressionReception({
      ...valid,
      position: { x: 1, y: 2 },
    })).toBeNull();
    expect(canonicalizeSituatedExpressionReception({
      ...valid,
      directVisualReceipt: true,
    })).toBeNull();
    expect(canonicalizeSituatedExpressionReception({
      ...valid,
      bearingUncertaintyMicroradians: 0,
    })).toBeNull();
    expect(canonicalizeSituatedExpressionReception({
      ...valid,
      distanceMinimumMicrounits: valid.distanceMaximumMicrounits + 1,
    })).toBeNull();
  });
});
