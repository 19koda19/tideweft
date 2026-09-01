import { describe, expect, it } from "vitest";

import type { TideweftView } from "./types";
import { commandForWorldTap, usesCoarseWorldPointer } from "./worldTap";

const view = {
  settlements: [
    {
      id: "harbor-7",
      position: { x: 144, y: 312 },
      discovered: true,
    },
  ],
  fieldResources: [
    {
      id: "field-v1:reed",
      material: "cordreed",
      label: "Cordreed",
      position: { x: 204, y: 228 },
      knowledge: "charted",
    },
  ],
} as unknown as TideweftView;

describe("world tap intent", () => {
  it("sends coarse settlement taps to the exact harbor center", () => {
    expect(commandForWorldTap(
      view,
      { entity: "settlement", id: "harbor-7" },
      { x: 132.4, y: 305.8 },
      true,
      true,
    )).toEqual({
      type: "move-target",
      point: { x: 144, y: 312 },
      additive: false,
    });
  });

  it("keeps precise desktop settlement selection and ordinary world travel", () => {
    expect(commandForWorldTap(
      view,
      { entity: "settlement", id: "harbor-7" },
      { x: 141, y: 309 },
      false,
    )).toEqual({
      type: "select",
      entity: "settlement",
      id: "harbor-7",
      point: { x: 141, y: 309 },
    });
    expect(commandForWorldTap(view, null, { x: 80, y: 90 }, true, true)).toEqual({
      type: "move-target",
      point: { x: 80, y: 90 },
      additive: true,
    });
  });

  it("routes resource taps to the exact node and only enables touch arrival gathering", () => {
    expect(commandForWorldTap(
      view,
      { entity: "resource", id: "field-v1:reed" },
      { x: 197, y: 220 },
      true,
      true,
    )).toEqual({
      type: "resource-target",
      nodeId: "field-v1:reed",
      point: { x: 204, y: 228 },
      gatherOnArrival: true,
    });
    expect(commandForWorldTap(
      view,
      { entity: "resource", id: "field-v1:reed" },
      { x: 197, y: 220 },
      false,
    )).toEqual({
      type: "resource-target",
      nodeId: "field-v1:reed",
      point: { x: 204, y: 228 },
      gatherOnArrival: false,
    });
  });

  it("cannot target a hidden or stale resource ID", () => {
    expect(commandForWorldTap(
      view,
      { entity: "resource", id: "field-v1:hidden" },
      { x: 400, y: 440 },
      true,
    )).toEqual({
      type: "move-target",
      point: { x: 400, y: 440 },
      additive: false,
    });
  });

  it("treats touch or a coarse primary pointer as coarse", () => {
    expect(usesCoarseWorldPointer("touch", false)).toBe(true);
    expect(usesCoarseWorldPointer("mouse", true)).toBe(true);
    expect(usesCoarseWorldPointer("mouse", false)).toBe(false);
    expect(usesCoarseWorldPointer("pen", false)).toBe(false);
  });
});
