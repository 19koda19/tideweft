import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createPlayer } from "./player";
import { projectGameView } from "./projection";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";

describe("shared world time projections", () => {
  it.each([
    [0, 1, "00:00 · Night", "night"],
    [360, 1, "06:00 · Dawn", "dawn"],
    [420, 1, "07:00 · Day", "day"],
    [1_140, 1, "19:00 · Dusk", "dusk"],
    [1_200, 1, "20:00 · Night", "night"],
    [1_440, 2, "00:00 · Night", "night"],
  ] as const)(
    "gives UI and both renderers one phase at tick %i",
    (tick, day, label, phase) => {
      const baseline = createWorldView(createWorld("turning day projection"));
      const world = { ...baseline, completedTick: tick };
      const player = createPlayer(world);
      const ui = projectUIView(world, player, createSessionState(world.seedText));
      const render = projectGameView(world, player);

      expect(ui.clock).toMatchObject({ day, timeLabel: label, phase });
      expect(render.worldTime).toMatchObject({ dayNumber: day, phase });
      expect(render.worldTime?.dayTick).toBe(tick % 1_440);
    },
  );
});
