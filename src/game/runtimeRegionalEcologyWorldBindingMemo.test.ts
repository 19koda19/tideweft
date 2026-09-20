import { describe, expect, it, vi } from "vitest";
import type { RootSeed } from "../sim/rng";
import {
  createRuntimeRegionalEcologyWorldBindingMemo,
  type RuntimeRegionalEcologyWorldBinding,
} from "./runtimeRegionalEcologyWorldBindingMemo";

interface FixtureState {
  readonly label: string;
  readonly tick: number;
}

interface FixtureHabitat {
  readonly label: string;
}

function state(label: string, tick: number): FixtureState {
  return Object.freeze({ label, tick });
}

function habitat(label: string): FixtureHabitat {
  return Object.freeze({ label });
}

function seed(a = 1, b = 2, c = 3, d = 4): RootSeed {
  return Object.freeze([a, b, c, d]);
}

function binding(
  settlementHomeHabitat: FixtureHabitat,
  completedTick: number,
  rootSeed: RootSeed = seed(),
): RuntimeRegionalEcologyWorldBinding<FixtureHabitat> {
  return Object.freeze({ rootSeed, completedTick, settlementHomeHabitat });
}

function fixture() {
  const parents = new WeakMap<object, object>();
  const validator = vi.fn((value: unknown) => (
    typeof value === "object" && value !== null && "tick" in value
      ? value as FixtureState
      : null
  ));
  const memo = createRuntimeRegionalEcologyWorldBindingMemo({
    validator,
    completedTickOf: (value: FixtureState) => value.tick,
    isTrustedCommittedTransition: (
      previous: FixtureState,
      next: unknown,
    ): next is FixtureState => (
      typeof next === "object"
      && next !== null
      && parents.get(next) === previous
    ),
  });
  return {
    memo,
    validator,
    commit(previous: FixtureState, label: string, tick: number): FixtureState {
      const next = state(label, tick);
      parents.set(next, previous);
      return next;
    },
  };
}

describe("runtime regional-ecology world-binding memo", () => {
  it("reuses only the exact canonical object under the same tick, seed, and habitat", () => {
    const { memo, validator } = fixture();
    const home = habitat("home");
    const exact = state("exact", 12);

    expect(memo.canonicalize(exact, binding(home, 12))).toBe(exact);
    expect(memo.canonicalize(exact, binding(home, 12, seed()))).toBe(exact);
    expect(validator).toHaveBeenCalledTimes(1);

    const clone = structuredClone(exact);
    expect(memo.canonicalize(clone, binding(home, 12))).toBe(clone);
    expect(validator).toHaveBeenCalledTimes(2);
  });

  it("misses for every seed word, tick, habitat identity, and signed zero", () => {
    const { memo, validator } = fixture();
    const home = habitat("home");
    const exact = state("exact", 12);
    memo.canonicalize(exact, binding(home, 12));

    memo.canonicalize(exact, binding(home, 13));
    memo.canonicalize(exact, binding(habitat("home"), 12));
    memo.canonicalize(exact, binding(home, 12, seed(9, 2, 3, 4)));
    memo.canonicalize(exact, binding(home, 12, seed(1, 9, 3, 4)));
    memo.canonicalize(exact, binding(home, 12, seed(1, 2, 9, 4)));
    memo.canonicalize(exact, binding(home, 12, seed(1, 2, 3, 9)));
    memo.canonicalize(exact, binding(home, 12, seed(-0, 2, 3, 4)));
    memo.canonicalize(exact, binding(home, 12, seed(0, 2, 3, 4)));

    expect(validator).toHaveBeenCalledTimes(9);
  });

  it("does not alias positive and negative zero in the world clock", () => {
    const { memo, validator } = fixture();
    const home = habitat("home");
    const exact = state("zero", 0);

    memo.canonicalize(exact, binding(home, 0));
    memo.canonicalize(exact, binding(home, -0));

    expect(validator).toHaveBeenCalledTimes(2);
  });

  it("does not alias positive and negative zero in any seed word", () => {
    for (let word = 0; word < 4; word += 1) {
      const { memo, validator } = fixture();
      const home = habitat("home");
      const exact = state(`zero-${word}`, 0);
      const positive = [1, 2, 3, 4] as [number, number, number, number];
      const negative = [...positive] as [number, number, number, number];
      positive[word] = 0;
      negative[word] = -0;

      memo.canonicalize(exact, binding(home, 0, seed(...positive)));
      memo.canonicalize(exact, binding(home, 0, seed(...negative)));

      expect(validator).toHaveBeenCalledTimes(2);
    }
  });

  it("admits an exact receipted parent-to-child commit without revalidating it", () => {
    const { memo, validator, commit } = fixture();
    const home = habitat("home");
    const previous = state("previous", 40);
    memo.canonicalize(previous, binding(home, 40));
    const committed = commit(previous, "committed", 41);

    expect(memo.canonicalizeCommittedTransition(
      previous,
      committed,
      binding(home, 41),
    )).toBe(committed);
    expect(memo.canonicalize(committed, binding(home, 41))).toBe(committed);
    expect(validator).toHaveBeenCalledTimes(1);
  });

  it("also admits a receipted same-tick presentation commit", () => {
    const { memo, validator, commit } = fixture();
    const home = habitat("home");
    const previous = state("previous", 40);
    memo.canonicalize(previous, binding(home, 40));
    const committed = commit(previous, "same-tick", 40);

    expect(memo.canonicalizeCommittedTransition(
      previous,
      committed,
      binding(home, 40),
    )).toBe(committed);
    expect(validator).toHaveBeenCalledTimes(1);
  });

  it("fully validates clones, wrong parents, changed bindings, and clock mismatches", () => {
    const home = habitat("home");
    const cases = [
      (previous: FixtureState, committed: FixtureState) => ({
        previous,
        value: JSON.parse(JSON.stringify(committed)) as FixtureState,
        nextBinding: binding(home, 41),
      }),
      (_previous: FixtureState, committed: FixtureState) => ({
        previous: state("wrong-parent", 40),
        value: committed,
        nextBinding: binding(home, 41),
      }),
      (previous: FixtureState, committed: FixtureState) => ({
        previous,
        value: committed,
        nextBinding: binding(habitat("changed"), 41),
      }),
      (previous: FixtureState, committed: FixtureState) => ({
        previous,
        value: committed,
        nextBinding: binding(home, 41, seed(9, 2, 3, 4)),
      }),
      (previous: FixtureState, committed: FixtureState) => ({
        previous,
        value: committed,
        nextBinding: binding(home, 42),
      }),
    ];

    for (const makeCase of cases) {
      const { memo, validator, commit } = fixture();
      const previous = state("previous", 40);
      memo.canonicalize(previous, binding(home, 40));
      const committed = commit(previous, "committed", 41);
      const attempt = makeCase(previous, committed);
      memo.canonicalizeCommittedTransition(
        attempt.previous,
        attempt.value,
        attempt.nextBinding,
      );
      expect(validator).toHaveBeenCalledTimes(2);
    }
  });

  it("fully validates an uncached parent, an unreceipted child, and a rewind", () => {
    const home = habitat("home");
    for (const attempt of [
      "uncached-parent",
      "unreceipted-child",
      "rewind",
    ] as const) {
      const { memo, validator, commit } = fixture();
      const previous = state("previous", 40);
      if (attempt !== "uncached-parent") {
        memo.canonicalize(previous, binding(home, 40));
      }
      const child = attempt === "unreceipted-child"
        ? state("unreceipted", 41)
        : commit(previous, attempt, attempt === "rewind" ? 39 : 41);
      memo.canonicalizeCommittedTransition(
        previous,
        child,
        binding(home, child.tick),
      );
      expect(validator).toHaveBeenCalledTimes(attempt === "uncached-parent" ? 1 : 2);
    }
  });

  it("fully validates a receipt belonging to another cached exact parent", () => {
    const { memo, validator, commit } = fixture();
    const home = habitat("home");
    const actualParent = state("actual", 40);
    const wrongParent = state("wrong", 40);
    memo.canonicalize(actualParent, binding(home, 40));
    memo.canonicalize(wrongParent, binding(home, 40));
    const committed = commit(actualParent, "committed", 41);

    memo.canonicalizeCommittedTransition(wrongParent, committed, binding(home, 41));

    expect(validator).toHaveBeenCalledTimes(3);
  });

  it("caches only the canonical object returned for a loaded value", () => {
    const home = habitat("home");
    const loaded = state("loaded", 7);
    const canonical = state("canonical", 7);
    const validator = vi.fn(() => canonical);
    const memo = createRuntimeRegionalEcologyWorldBindingMemo({
      validator,
      completedTickOf: (value: FixtureState) => value.tick,
      isTrustedCommittedTransition: (_previous, _next): _next is FixtureState => false,
    });

    expect(memo.canonicalize(loaded, binding(home, 7))).toBe(canonical);
    expect(memo.canonicalize(loaded, binding(home, 7))).toBe(canonical);
    expect(memo.canonicalize(canonical, binding(home, 7))).toBe(canonical);
    expect(validator).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejected or throwing validation", () => {
    const home = habitat("home");
    const rejected = state("rejected", 8);
    const rejectingValidator = vi.fn(() => null as FixtureState | null);
    const rejectingMemo = createRuntimeRegionalEcologyWorldBindingMemo({
      validator: rejectingValidator,
      completedTickOf: (value: FixtureState) => value.tick,
      isTrustedCommittedTransition: (_previous, _next): _next is FixtureState => false,
    });
    expect(rejectingMemo.canonicalize(rejected, binding(home, 8))).toBeNull();
    expect(rejectingMemo.canonicalize(rejected, binding(home, 8))).toBeNull();
    expect(rejectingValidator).toHaveBeenCalledTimes(2);

    const accepted = state("accepted", 9);
    const throwingValidator = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error("invalid binding");
      })
      .mockReturnValue(accepted);
    const throwingMemo = createRuntimeRegionalEcologyWorldBindingMemo({
      validator: throwingValidator,
      completedTickOf: (value: FixtureState) => value.tick,
      isTrustedCommittedTransition: (_previous, _next): _next is FixtureState => false,
    });
    expect(() => throwingMemo.canonicalize(accepted, binding(home, 9)))
      .toThrow("invalid binding");
    expect(throwingMemo.canonicalize(accepted, binding(home, 9))).toBe(accepted);
    expect(throwingValidator).toHaveBeenCalledTimes(2);
  });
});
