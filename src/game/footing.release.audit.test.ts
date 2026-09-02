import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import { evaluateFooting, type FootingInput } from "./footing";

const BASE: FootingInput = {
  stability: FIXED_POINT,
  moving: true,
  speed: 640_000,
  surface: "firm",
  elevationDelta: 0,
  roughness: 0,
  moisture: 0,
  waterDepth: 0,
  movement: { x: FIXED_POINT, y: 0 },
  current: { x: 0, y: 0 },
  wind: { x: 0, y: 0 },
  weatherIntensity: 0,
  turnPressure: 0,
  loadRatio: 0,
  cargoShift: 0,
  pace: "steady",
  brace: false,
  footwearGrip: 0,
  fixtureSupport: 0,
  reliableGround: false,
  unsupportedEdge: 0,
};

describe("release audit: direct Stability v2", () => {
  it("does not drain again when the physical crossing state is unchanged", () => {
    const crossing = {
      ...BASE,
      surface: "water" as const,
      waterDepth: 520_000,
      roughness: 700_000,
      current: { x: 0, y: 535_000 },
      wind: { x: 0, y: 300_000 },
      weatherIntensity: 400_000,
    };
    const first = evaluateFooting(crossing);
    const replay = evaluateFooting({ ...crossing, stability: first.stabilityAfter });
    expect(replay.stabilityAfter).toBe(first.stabilityAfter);
    expect(replay.stabilityTarget).toBe(first.stabilityTarget);
    expect(replay.delta).toBe(0);
  });

  it("makes Shift-compatible bracing a meaningful current response", () => {
    const crossing = {
      ...BASE,
      surface: "water" as const,
      waterDepth: 600_000,
      roughness: 800_000,
      current: { x: 0, y: 650_000 },
    };
    const bare = evaluateFooting(crossing);
    const braced = evaluateFooting({ ...crossing, speed: 400_000, brace: true });
    expect(braced.stabilityTarget).toBeGreaterThan(bare.stabilityTarget + 250_000);
    expect(braced.mitigation.brace).toBeGreaterThan(0);
  });

  it("ignores stale meter history after reaching a supported windblown bank", () => {
    const bank = evaluateFooting({
      ...BASE,
      stability: 0,
      moving: false,
      speed: 0,
      pace: "rest",
      surface: "soft",
      wind: { x: FIXED_POINT, y: FIXED_POINT },
      weatherIntensity: FIXED_POINT,
      brace: true,
    });
    expect(bank.stabilityAfter).toBe(bank.stabilityTarget);
    expect(bank.stabilityAfter).toBeGreaterThan(700_000);
    expect(bank.trend).toBe("recovering");
  });

  it("keeps unsupported edges dangerous without time-based depletion", () => {
    const edge = evaluateFooting({ ...BASE, unsupportedEdge: FIXED_POINT, brace: true });
    const repeated = evaluateFooting({
      ...BASE,
      stability: edge.stabilityAfter,
      unsupportedEdge: FIXED_POINT,
      brace: true,
    });
    expect(edge.hazardPressure).toBe(FIXED_POINT);
    expect(edge.stabilityTarget).toBeLessThan(FIXED_POINT);
    expect(repeated.stabilityAfter).toBe(edge.stabilityAfter);
    expect(repeated.delta).toBe(0);
  });
});
