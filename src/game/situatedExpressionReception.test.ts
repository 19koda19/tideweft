import { describe, expect, it } from "vitest";

import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  SITUATED_EXPRESSION_RECEPTION_CERTAINTY_SCALE,
  SITUATED_EXPRESSION_RECEPTION_VERSION,
  canonicalizeSituatedExpressionReception,
  createHeardVisibleSituatedExpressionReception,
  createSelfSituatedExpressionReception,
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

  it("requires self mode for the player and heard-visible mode for every other source", () => {
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

    expect(situatedExpressionReceptionMatchesActiveEvent(playerSelf, PLAYER_EVENT)).toBe(true);
    expect(situatedExpressionReceptionMatchesActiveEvent(playerHeard, PLAYER_EVENT)).toBe(false);
    expect(situatedExpressionReceptionMatchesActiveEvent(residentHeard, EVENT)).toBe(true);
    expect(situatedExpressionReceptionMatchesActiveEvent(residentSelf, EVENT)).toBe(false);
  });
});
