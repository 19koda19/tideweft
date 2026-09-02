import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createPlayer } from "./player";
import { projectPerception } from "./projection";

describe("shared projection perception cache", () => {
  it("reuses a stationary snapshot and invalidates on the sensory keys", () => {
    const world = createWorldView(createWorld("still eyes over black water", "standard"));
    const player = createPlayer(world);

    const first = projectPerception(world, player);
    expect(projectPerception(world, player)).toBe(first);

    player.facingMilliRadians += 125;
    const turned = projectPerception(world, player);
    expect(turned).not.toBe(first);
    expect(projectPerception(world, player)).toBe(turned);

    const changedWeather = {
      ...world,
      // Preserve the static terrain array to exercise the sensory result cache
      // rather than rebuilding its obstruction cells.
      weather: {
        ...world.weather,
        intensity: Math.min(1_000_000, world.weather.intensity + 100_000),
      },
    };
    const obscured = projectPerception(changedWeather, player);
    expect(obscured).not.toBe(turned);
    expect(projectPerception(changedWeather, player)).toBe(obscured);
  });
});
