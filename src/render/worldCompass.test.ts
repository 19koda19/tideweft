import { describe, expect, it } from "vitest";

import { createWorldCompass, worldCompassLabel, worldNorthDegrees } from "./worldCompass";

describe("world compass", () => {
  it("keeps Chart north-up and rotates Relief north by camera yaw", () => {
    expect(worldNorthDegrees(0)).toBe(0);
    expect(worldNorthDegrees(Math.PI / 2)).toBeCloseTo(90, 12);
    expect(worldNorthDegrees(-Math.PI / 2)).toBeCloseTo(-90, 12);
    expect(worldNorthDegrees(Math.PI * 5)).toBeCloseTo(180, 12);
  });

  it("provides concise truthful accessible direction text", () => {
    expect(worldCompassLabel("chart-2d", Math.PI / 2)).toBe(
      "World compass. North is straight up in Chart 2D.",
    );
    expect(worldCompassLabel("relief-3d", 0)).toContain("straight up");
    expect(worldCompassLabel("relief-3d", -Math.PI / 4)).toContain("45 degrees left");
    expect(worldCompassLabel("relief-3d", Math.PI / 3)).toContain("60 degrees right");
  });

  it("degrades to an inert controller for non-DOM renderer hosts", () => {
    const compass = createWorldCompass({ dataset: {} } as HTMLElement);
    expect(compass.element).toBeNull();
    expect(() => compass.setHeading("relief-3d", Math.PI / 2)).not.toThrow();
    expect(() => compass.setActive(false)).not.toThrow();
    expect(() => compass.destroy()).not.toThrow();
  });
});
