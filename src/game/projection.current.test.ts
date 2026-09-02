import { describe, expect, it } from "vitest";

import { createWorld, createWorldView, FIXED_POINT } from "../sim/public";
import { createPlayer } from "./player";
import { projectGameView } from "./projection";

describe("surface current projection", () => {
  it("projects the simulation's exact flood/ebb and cross-current preference", () => {
    const base = createWorldView(createWorld("visible surface current", "standard"));
    const flood = {
      ...base,
      tide: { ...base.tide, direction: 1 as const },
      weather: { ...base.weather, windY: -240_000 },
    };
    const ebb = {
      ...base,
      tide: { ...base.tide, direction: -1 as const },
      weather: { ...base.weather, windY: 0 },
    };

    expect(projectGameView(flood, createPlayer(flood)).tide.surfaceCurrent)
      .toEqual({ x: -FIXED_POINT, y: -240_000 });
    expect(projectGameView(ebb, createPlayer(ebb)).tide.surfaceCurrent)
      .toEqual({ x: FIXED_POINT, y: 0 });
  });
});
