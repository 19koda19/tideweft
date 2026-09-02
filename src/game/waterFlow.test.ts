import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import { WATER_FLOW_VERSION, deriveWaterFlowProfile } from "./waterFlow";

describe("shared water flow profile", () => {
  it("keeps dry footing silent and motionless", () => {
    expect(deriveWaterFlowProfile({
      waterDepth: 0,
      bedRoughness: FIXED_POINT,
      tideLevel: FIXED_POINT,
      weatherIntensity: FIXED_POINT,
    })).toEqual({ version: WATER_FLOW_VERSION, strength: 0, turbulence: 0, voice: "silent" });
  });

  it("moves monotonically from calm ohm to rough whissh", () => {
    const calm = deriveWaterFlowProfile({
      waterDepth: 90_000,
      bedRoughness: 20_000,
      tideLevel: 0,
      weatherIntensity: 0,
    });
    const rough = deriveWaterFlowProfile({
      waterDepth: 900_000,
      bedRoughness: 950_000,
      tideLevel: 900_000,
      weatherIntensity: 900_000,
    });
    expect(calm.voice).toBe("ohm");
    expect(rough.voice).toBe("whissh");
    expect(rough.strength).toBeGreaterThan(calm.strength);
    expect(rough.turbulence).toBeGreaterThan(calm.turbulence);
  });
});
