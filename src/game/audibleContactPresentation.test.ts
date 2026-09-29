import { describe, expect, it } from "vitest";

import {
  audibleContactDirection,
  audibleContactPan,
} from "./audibleContactPresentation";
import type { AudibleContact } from "./perception";

function contact(
  centerRadians: number,
  uncertaintyRadians: number,
): AudibleContact {
  return {
    bearing: { centerRadians, uncertaintyRadians },
    distanceBand: { minimum: 2_000, maximum: 8_000 },
    certainty: 0.8,
  };
}

describe("audible-contact presentation", () => {
  it("names a cardinal direction only when the full uncertainty band supports it", () => {
    expect(audibleContactDirection(contact(0, Math.PI / 60))).toBe("east");
    expect(audibleContactDirection(contact(Math.PI / 2, Math.PI / 60))).toBe("south");
    expect(audibleContactDirection(contact(Math.PI / 8, Math.PI / 60)))
      .toBe("direction unclear");
    expect(audibleContactDirection(contact(0, Math.PI))).toBe("all around");
  });

  it("weakens stereo placement as anonymous bearing uncertainty grows", () => {
    const narrow = audibleContactPan(contact(0, Math.PI / 90));
    const broad = audibleContactPan(contact(0, (3 * Math.PI) / 4));
    expect(narrow).toBeGreaterThan(0.9);
    expect(broad).toBe(0);
    expect(audibleContactPan(contact(Math.PI, Math.PI / 90))).toBeLessThan(-0.9);
  });
});
