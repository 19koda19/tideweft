import { describe, expect, it } from "vitest";

import {
  adriftPresentation,
  type AdriftPresentationInput,
} from "./adriftPresentation";

function input(changes: Partial<AdriftPresentationInput> = {}): AdriftPresentationInput {
  return {
    modeActive: true,
    paddling: false,
    catchingBreath: false,
    canStand: false,
    stamina: 0.7,
    velocity: { x: 0.3, y: 0.1 },
    currentDirection: { x: 1, y: 0 },
    ...changes,
  };
}

describe("shared ADRIFT presentation", () => {
  it("has no presentation outside the authoritative movement mode", () => {
    expect(adriftPresentation(input({ modeActive: false }))).toBeUndefined();
  });

  it.each([
    ["floating", {}, "ADRIFT", "float"],
    ["paddling", { paddling: true }, "PADDLING", "stroke"],
    ["catching-breath", { catchingBreath: true }, "CATCHING BREATH", "float"],
    ["reaching", { shoreProgress: 0.84, shoreDistance: 2 }, "SHORE WITHIN REACH", "reach"],
    ["ready-to-rise", { canStand: true }, "SHALLOW · READY TO RISE", "rise"],
  ] as const)("makes the %s state readable without relying on color", (
    state,
    changes,
    label,
    pose,
  ) => {
    const presentation = adriftPresentation(input(changes));
    expect(presentation).toMatchObject({ state, label, pose });
    expect(presentation?.instruction.length).toBeGreaterThan(0);
    expect(presentation?.instruction.length).toBeLessThanOrEqual(32);
    expect(presentation?.bodyColor).toMatch(/^#[0-9a-f]{6}$/iu);
    expect(presentation?.edgeColor).toMatch(/^#[0-9a-f]{6}$/iu);
  });

  it("gives safety-critical states precedence over active strokes", () => {
    expect(adriftPresentation(input({
      paddling: true,
      catchingBreath: true,
      canStand: false,
    }))?.state).toBe("catching-breath");
    expect(adriftPresentation(input({
      paddling: true,
      catchingBreath: true,
      canStand: true,
    }))?.state).toBe("ready-to-rise");
  });

  it("selects charming motion syllables deterministically without randomness", () => {
    const paddling = input({ paddling: true, velocity: { x: 0.8, y: -0.2 } });
    const floating = input({ velocity: { x: 0.4, y: 0.2 } });
    const rising = input({ canStand: true, stamina: 0.4, velocity: { x: 0, y: 0 } });

    expect(adriftPresentation(paddling)?.soundSyllable).toBe("WHHSH");
    expect(adriftPresentation(floating)?.soundSyllable).toBe("OHM");
    expect(adriftPresentation(rising)?.soundSyllable).toBe("HUP");
    expect(adriftPresentation(paddling)).toEqual(adriftPresentation(paddling));
    expect(adriftPresentation(input({ velocity: { x: 0, y: 0 } }))?.soundSyllable)
      .toBeUndefined();
  });

  it("uses current-relative motion to make effort legible", () => {
    const withCurrent = adriftPresentation(input({
      paddling: true,
      velocity: { x: 1, y: 0 },
      currentDirection: { x: 1, y: 0 },
    }));
    const againstCurrent = adriftPresentation(input({
      paddling: true,
      velocity: { x: -1, y: 0 },
      currentDirection: { x: 1, y: 0 },
    }));
    expect(againstCurrent?.leanIntensity).toBeGreaterThan(withCurrent?.leanIntensity ?? 1);
    expect(againstCurrent?.wakeIntensity).toBe(withCurrent?.wakeIntensity);
  });

  it("clamps malformed and extreme signals into finite render-safe bounds", () => {
    const presentation = adriftPresentation(input({
      stamina: Number.NaN,
      velocity: { x: Number.POSITIVE_INFINITY, y: Number.NEGATIVE_INFINITY },
      currentDirection: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      shoreProgress: Number.POSITIVE_INFINITY,
      shoreDistance: Number.NEGATIVE_INFINITY,
      paddling: true,
    }));
    expect(presentation).toBeDefined();
    for (const value of [
      presentation?.bobIntensity,
      presentation?.leanIntensity,
      presentation?.wakeIntensity,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("does not invent shore progress, distance, or timing when no estimate is supplied", () => {
    const presentation = adriftPresentation(input({
      velocity: { x: 0.42, y: -0.18 },
    }));

    expect(presentation).toMatchObject({
      state: "floating",
      label: "ADRIFT",
      instruction: "STEER ACROSS THE CURRENT",
    });
    expect(`${presentation?.label} ${presentation?.instruction}`)
      .not.toMatch(/\beta\b|\b\d+(?:\.\d+)?\s*(?:%|m|km|s|min)\b|percent/iu);
  });

  it("never announces arrival while ADRIFT remains authoritative", () => {
    for (const changes of [
      {},
      { paddling: true },
      { catchingBreath: true },
      { shoreProgress: 1, shoreDistance: 0 },
      { canStand: true, shoreProgress: 1, shoreDistance: 0 },
    ]) {
      const presentation = adriftPresentation(input(changes));
      expect(`${presentation?.label} ${presentation?.instruction}`)
        .not.toMatch(/ashore|arrived|safe bank caught|\beta\b|\d+(?:\.\d+)?\s*%|percent/iu);
    }
  });
});
