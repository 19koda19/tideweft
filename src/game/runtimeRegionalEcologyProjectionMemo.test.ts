import { describe, expect, it, vi } from "vitest";
import type { CoreEcologyRuntimeWindow } from "./coreEcologyRuntime";
import type {
  RegionalEcologyStateV6,
  RegionalEcologyStateV6ActiveProjection,
} from "./regionalEcologyStateV6";
import { createRuntimeRegionalEcologyProjectionMemo } from "./runtimeRegionalEcologyProjectionMemo";

function state(label: string): RegionalEcologyStateV6 {
  return Object.freeze({ label }) as unknown as RegionalEcologyStateV6;
}

function projection(label: string): RegionalEcologyStateV6ActiveProjection {
  return Object.freeze({ label }) as unknown as RegionalEcologyStateV6ActiveProjection;
}

function window(
  x = -60,
  y = -60,
  width = 120,
  height = 120,
): CoreEcologyRuntimeWindow {
  return Object.freeze({
    origin: Object.freeze({ x, y }),
    terrain: Object.freeze({ width, height }),
  });
}

describe("runtime regional-ecology projection memo", () => {
  it("reuses the exact authenticated projection for one immutable state and equivalent window", () => {
    const expected = projection("same-authority");
    const projector = vi.fn(() => expected);
    const memo = createRuntimeRegionalEcologyProjectionMemo(projector);
    const authority = state("stable");

    expect(memo.project(authority, window())).toBe(expected);
    expect(memo.project(authority, window())).toBe(expected);
    expect(projector).toHaveBeenCalledTimes(1);
  });

  it("invalidates for a new state authority or any signed-window change", () => {
    let ordinal = 0;
    const projector = vi.fn(() => projection(`projection-${ordinal += 1}`));
    const memo = createRuntimeRegionalEcologyProjectionMemo(projector);
    const first = state("first");

    memo.project(first, window());
    memo.project(state("second"), window());
    memo.project(first, window(-59));
    memo.project(first, window(-60, -59));
    memo.project(first, window(-60, -60, 121));
    memo.project(first, window(-60, -60, 120, 121));

    expect(projector).toHaveBeenCalledTimes(6);
  });

  it("does not confuse canonical zero with a forged negative-zero window", () => {
    const projector = vi.fn(() => projection("signed-zero"));
    const memo = createRuntimeRegionalEcologyProjectionMemo(projector);
    const authority = state("signed-zero");

    memo.project(authority, window(0, 0));
    memo.project(authority, window(-0, 0));

    expect(projector).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejected projection or a thrown validation failure", () => {
    const authority = state("retry");
    const expected = projection("accepted");
    const rejectedThenAccepted = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(expected);
    const rejectingMemo = createRuntimeRegionalEcologyProjectionMemo(rejectedThenAccepted);

    expect(rejectingMemo.project(authority, window())).toBeNull();
    expect(rejectingMemo.project(authority, window())).toBe(expected);
    expect(rejectedThenAccepted).toHaveBeenCalledTimes(2);

    const thrownThenAccepted = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error("invalid authority");
      })
      .mockReturnValueOnce(expected);
    const throwingMemo = createRuntimeRegionalEcologyProjectionMemo(thrownThenAccepted);

    expect(() => throwingMemo.project(authority, window())).toThrow("invalid authority");
    expect(throwingMemo.project(authority, window())).toBe(expected);
    expect(thrownThenAccepted).toHaveBeenCalledTimes(2);
  });
});
