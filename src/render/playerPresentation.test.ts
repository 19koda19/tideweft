import { describe, expect, it } from "vitest";

import type { PlayerBalanceView } from "./types";
import {
  placeIncidentCallout,
  playerBalancePresentation,
} from "./playerPresentation";

const STATES: readonly PlayerBalanceView[] = [
  "balanced",
  "swaying",
  "stumbling",
  "fallen",
  "swept",
  "recovering",
];

describe("player balance presentation", () => {
  it("gives every state a unique non-color signature and readable label", () => {
    const styles = STATES.map(playerBalancePresentation);
    expect(new Set(styles.map(({ silhouette, mark }) => `${silhouette}:${mark}`)).size)
      .toBe(STATES.length);
    expect(new Set(styles.map(({ fill }) => fill)).size).toBe(STATES.length);
    expect(new Set(styles.map(({ outline }) => outline)).size).toBe(STATES.length);
    expect(styles.map(({ label }) => label)).toEqual(STATES);
    for (const style of styles) {
      expect(style.fill).toMatch(/^#[0-9a-f]{6}$/iu);
      expect(style.outline).toMatch(/^#[0-9a-f]{6}$/iu);
      expect(style.heightScale).toBeGreaterThan(0);
    }
  });

  it("defaults an older projection to the balanced visual contract", () => {
    expect(playerBalancePresentation(undefined)).toEqual(
      playerBalancePresentation("balanced"),
    );
  });
});

describe("incident callout placement", () => {
  const portrait = {
    width: 320,
    height: 640,
    safeTop: 104,
    safeBottom: 152,
    compact: true,
  } as const;

  it.each([
    ["top-left", { x: 0, y: 0 }],
    ["top-right", { x: 320, y: 0 }],
    ["bottom-left", { x: 0, y: 640 }],
    ["bottom-right", { x: 320, y: 640 }],
  ])("keeps portrait %s labels outside HUD and touch-control gutters", (_name, point) => {
    const placed = placeIncidentCallout(point, 180, portrait);
    expect(placed.x - placed.width / 2).toBeGreaterThanOrEqual(12);
    expect(placed.x + placed.width / 2).toBeLessThanOrEqual(portrait.width - 12);
    expect(placed.y).toBeGreaterThanOrEqual(portrait.safeTop + 12);
    expect(placed.y).toBeLessThanOrEqual(portrait.height - portrait.safeBottom - 12);
  });

  it("prefers the lane above the courier when that lane is available", () => {
    expect(placeIncidentCallout(
      { x: 190, y: 260 },
      140,
      { width: 844, height: 390, safeTop: 52, safeBottom: 88, compact: true },
    )).toMatchObject({ x: 190, y: 202, aboveCourier: true });
  });

  it("uses the safe lane below a courier hidden beneath the compact top HUD", () => {
    expect(placeIncidentCallout(
      { x: 160, y: 72 },
      180,
      portrait,
    )).toMatchObject({
      x: 160,
      y: 116,
      width: 180,
      aboveCourier: false,
    });
  });

  it("keeps short landscape callouts clear of both HUD and action lanes", () => {
    const landscape = {
      width: 844,
      height: 390,
      safeTop: 76,
      safeBottom: 92,
      compact: true,
    } as const;
    for (const point of [
      { x: 0, y: 0 },
      { x: 844, y: 0 },
      { x: 0, y: 390 },
      { x: 844, y: 390 },
      { x: 422, y: 195 },
    ]) {
      const placed = placeIncidentCallout(point, 226, landscape);
      expect(placed.x - placed.width / 2).toBeGreaterThanOrEqual(12);
      expect(placed.x + placed.width / 2).toBeLessThanOrEqual(landscape.width - 12);
      expect(placed.y).toBeGreaterThanOrEqual(landscape.safeTop + 12);
      expect(placed.y).toBeLessThanOrEqual(landscape.height - landscape.safeBottom - 12);
    }
  });

  it("contains malformed presentational coordinates without leaking NaN", () => {
    const placed = placeIncidentCallout(
      { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      Number.NaN,
      portrait,
    );
    expect(Object.values(placed).every((value) =>
      typeof value === "boolean" || Number.isFinite(value))).toBe(true);
    expect(placed.width).toBe(72);
  });
});
