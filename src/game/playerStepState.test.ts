import { describe, expect, it } from "vitest";

import {
  PLAYER_MAX_DRY_FIXED_STEP_STAMINA_SPEND,
  PLAYER_MOVEMENT_STAMINA_GATE,
} from "./player";
import {
  canonicalizePlayerStepStateAnchor,
  canonicalizePlayerStepStateSample,
  createPlayerStepStateAnchor,
  createPlayerStepStateSample,
  playerStepStateHasExactPredecessor,
  playerStepStateProvesDryExhaustion,
} from "./playerStepState";

function dryExhaustion(
  staminaBefore = PLAYER_MOVEMENT_STAMINA_GATE + 500,
) {
  return createPlayerStepStateSample({
    sampleOrdinal: 2,
    staminaBefore,
    staminaAfter: 0,
    modeBefore: "foot",
    modeAfter: "camp",
    acceptedDistanceUnits: 105,
    moved: true,
    exhausted: true,
    rescued: false,
    becameSwept: false,
    traversalIncidentKind: null,
    startingWaterDepth: 0,
    endingWaterDepth: 0,
  });
}

describe("player fixed-step state authority", () => {
  it("canonicalizes one exact pre-trajectory stamina and mode anchor", () => {
    const anchor = createPlayerStepStateAnchor(3, 14_400, "foot");
    expect(anchor).toEqual({
      version: 1,
      sampleOrdinal: 3,
      stamina: 14_400,
      mode: "foot",
    });
    expect(Object.isFrozen(anchor)).toBe(true);
    expect(canonicalizePlayerStepStateAnchor({ ...anchor, stamina: -1 })).toBeNull();
    expect(canonicalizePlayerStepStateAnchor({ ...anchor, inferred: true })).toBeNull();
  });

  it("canonicalizes and freezes one generic movement-owned state sample", () => {
    const sample = dryExhaustion();
    expect(sample).toMatchObject({
      version: 1,
      sampleOrdinal: 2,
      staminaBefore: 12_500,
      staminaAfter: 0,
      modeAfter: "camp",
      moved: true,
      exhausted: true,
      traversalIncidentKind: null,
    });
    expect(Object.isFrozen(sample)).toBe(true);
    expect(playerStepStateProvesDryExhaustion(sample)).toBe(true);
  });

  it("requires exhaustion evidence to continue the exact movement-owned frontier", () => {
    const sample = dryExhaustion();
    if (sample === null) throw new Error("fixture lost dry exhaustion sample");
    const exactPrevious = createPlayerStepStateSample({
      ...sample,
      sampleOrdinal: 1,
      staminaBefore: 18_000,
      staminaAfter: sample.staminaBefore,
      modeAfter: sample.modeBefore,
      exhausted: false,
    });
    const exactAnchor = createPlayerStepStateAnchor(
      sample.sampleOrdinal,
      sample.staminaBefore,
      sample.modeBefore,
    );
    const gapAnchor = createPlayerStepStateAnchor(
      sample.sampleOrdinal,
      sample.staminaBefore + 5_500,
      sample.modeBefore,
    );

    expect(playerStepStateHasExactPredecessor(sample, exactPrevious)).toBe(true);
    expect(playerStepStateHasExactPredecessor(sample, exactAnchor)).toBe(true);
    expect(playerStepStateHasExactPredecessor(sample, gapAnchor)).toBe(false);
    expect(playerStepStateHasExactPredecessor(sample, null)).toBe(false);
  });

  it("rejects malformed geometry flags and extra best-effort state", () => {
    const sample = dryExhaustion();
    if (sample === null) throw new Error("fixture lost dry exhaustion sample");
    expect(canonicalizePlayerStepStateSample({
      ...sample,
      moved: false,
    })).toBeNull();
    expect(canonicalizePlayerStepStateSample({
      ...sample,
      guessedCause: "tired",
    })).toBeNull();
  });

  it("cannot relabel an ordinary or physically impossible step as dry exhaustion", () => {
    expect(playerStepStateProvesDryExhaustion(null)).toBe(false);
    const ordinary = createPlayerStepStateSample({
      sampleOrdinal: 0,
      staminaBefore: 1_000_000,
      staminaAfter: 999_500,
      modeBefore: "foot",
      modeAfter: "foot",
      acceptedDistanceUnits: 105,
      moved: true,
      exhausted: false,
      rescued: false,
      becameSwept: false,
      traversalIncidentKind: null,
      startingWaterDepth: 0,
      endingWaterDepth: 0,
    });
    expect(playerStepStateProvesDryExhaustion(ordinary)).toBe(false);

    const impossible = dryExhaustion(
      PLAYER_MOVEMENT_STAMINA_GATE + PLAYER_MAX_DRY_FIXED_STEP_STAMINA_SPEND + 1,
    );
    expect(impossible).not.toBeNull();
    expect(playerStepStateProvesDryExhaustion(impossible)).toBe(false);

    const wrongDomain = dryExhaustion();
    expect(wrongDomain).not.toBeNull();
    expect(playerStepStateProvesDryExhaustion(
      wrongDomain === null ? null : { ...wrongDomain, modeBefore: "skiff" },
    )).toBe(false);
  });
});
