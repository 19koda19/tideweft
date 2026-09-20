import { describe, expect, it, vi } from "vitest";
import type { RootSeed } from "../sim/rng";
import type { RegionalEcologyRootV1 } from "./regionalEcology";
import type { RegionalEcologyStateV6ActiveProjection } from "./regionalEcologyStateV6";
import {
  createRuntimeCoreEcologyActivityAuthorityMemo,
  type RuntimeCoreEcologyActivityAuthorityBundle,
  type RuntimeCoreEcologyActivityAuthorityMemoInput,
} from "./runtimeCoreEcologyActivityAuthorityMemo";

function projection(label: string): RegionalEcologyStateV6ActiveProjection {
  return Object.freeze({ label }) as unknown as RegionalEcologyStateV6ActiveProjection;
}

function root(label: string): RegionalEcologyRootV1 {
  return Object.freeze({ label }) as unknown as RegionalEcologyRootV1;
}

function seed(a = 1, b = 2, c = 3, d = 4): RootSeed {
  return Object.freeze([a, b, c, d]);
}

function bundle(label: string): RuntimeCoreEcologyActivityAuthorityBundle {
  return new Map([[label, new Map()]]);
}

function input(
  activeProjection: RegionalEcologyStateV6ActiveProjection,
  activeRoot: RegionalEcologyRootV1,
  rootSeed: RootSeed = seed(),
  alpineSeedFingerprint = "alpine-a",
): RuntimeCoreEcologyActivityAuthorityMemoInput {
  return Object.freeze({
    projection: activeProjection,
    root: activeRoot,
    rootSeed,
    alpineSeedFingerprint,
  });
}

describe("runtime core-ecology activity-authority memo", () => {
  it("reuses one complete receipt bundle for exact immutable authority inputs", () => {
    const expected = bundle("exact");
    const projector = vi.fn(() => expected);
    const memo = createRuntimeCoreEcologyActivityAuthorityMemo(projector);
    const activeProjection = projection("projection-a");
    const activeRoot = root("root-a");

    expect(memo.project(input(activeProjection, activeRoot))).toBe(expected);
    expect(memo.project(input(activeProjection, activeRoot, seed()))).toBe(expected);
    expect(projector).toHaveBeenCalledTimes(1);
  });

  it("invalidates on projection, root, seed-word, or alpine-fingerprint changes", () => {
    let ordinal = 0;
    const projector = vi.fn(() => bundle(`bundle-${ordinal += 1}`));
    const memo = createRuntimeCoreEcologyActivityAuthorityMemo(projector);
    const activeProjection = projection("projection-a");
    const activeRoot = root("root-a");

    memo.project(input(activeProjection, activeRoot));
    memo.project(input(projection("projection-b"), activeRoot));
    memo.project(input(activeProjection, root("root-b")));
    memo.project(input(activeProjection, activeRoot, seed(9, 2, 3, 4)));
    memo.project(input(activeProjection, activeRoot, seed(1, 9, 3, 4)));
    memo.project(input(activeProjection, activeRoot, seed(1, 2, 9, 4)));
    memo.project(input(activeProjection, activeRoot, seed(1, 2, 3, 9)));
    memo.project(input(activeProjection, activeRoot, seed(), "alpine-b"));

    expect(projector).toHaveBeenCalledTimes(8);
  });

  it("keeps only one entry and recomputes when an older authority returns", () => {
    let ordinal = 0;
    const projector = vi.fn(() => bundle(`bundle-${ordinal += 1}`));
    const memo = createRuntimeCoreEcologyActivityAuthorityMemo(projector);
    const firstProjection = projection("projection-a");
    const secondProjection = projection("projection-b");
    const activeRoot = root("root-a");

    const first = memo.project(input(firstProjection, activeRoot));
    memo.project(input(secondProjection, activeRoot));
    const replay = memo.project(input(firstProjection, activeRoot));

    expect(replay).not.toBe(first);
    expect(projector).toHaveBeenCalledTimes(3);
  });

  it("does not alias positive and negative zero in a seed word", () => {
    const projector = vi.fn(() => bundle("signed-zero"));
    const memo = createRuntimeCoreEcologyActivityAuthorityMemo(projector);
    const activeProjection = projection("projection-a");
    const activeRoot = root("root-a");

    memo.project(input(activeProjection, activeRoot, seed(0, 2, 3, 4)));
    memo.project(input(activeProjection, activeRoot, seed(-0, 2, 3, 4)));

    expect(projector).toHaveBeenCalledTimes(2);
  });

  it("never caches an incomplete or throwing bundle", () => {
    const activeProjection = projection("projection-a");
    const activeRoot = root("root-a");
    const expected = bundle("accepted");
    const rejectedThenAccepted = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(expected);
    const rejectingMemo = createRuntimeCoreEcologyActivityAuthorityMemo(
      rejectedThenAccepted,
    );

    expect(rejectingMemo.project(input(activeProjection, activeRoot))).toBeNull();
    expect(rejectingMemo.project(input(activeProjection, activeRoot))).toBe(expected);
    expect(rejectedThenAccepted).toHaveBeenCalledTimes(2);

    const thrownThenAccepted = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error("invalid authority");
      })
      .mockReturnValueOnce(expected);
    const throwingMemo = createRuntimeCoreEcologyActivityAuthorityMemo(
      thrownThenAccepted,
    );

    expect(() => throwingMemo.project(input(activeProjection, activeRoot)))
      .toThrow("invalid authority");
    expect(throwingMemo.project(input(activeProjection, activeRoot))).toBe(expected);
    expect(thrownThenAccepted).toHaveBeenCalledTimes(2);
  });
});
