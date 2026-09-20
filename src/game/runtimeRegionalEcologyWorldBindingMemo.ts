import type { RootSeed } from "../sim/rng";

export interface RuntimeRegionalEcologyWorldBinding<Habitat extends object> {
  readonly rootSeed: RootSeed;
  readonly completedTick: number;
  readonly settlementHomeHabitat: Habitat;
}

export type RuntimeRegionalEcologyWorldBindingValidator<
  State extends object,
  Habitat extends object,
> = (
  value: unknown,
  binding: RuntimeRegionalEcologyWorldBinding<Habitat>,
) => State | null;

export interface RuntimeRegionalEcologyWorldBindingMemo<
  State extends object,
  Habitat extends object,
> {
  readonly canonicalize: RuntimeRegionalEcologyWorldBindingValidator<State, Habitat>;
  readonly canonicalizeCommittedTransition: (
    previous: State,
    value: unknown,
    binding: RuntimeRegionalEcologyWorldBinding<Habitat>,
  ) => State | null;
}

export interface CreateRuntimeRegionalEcologyWorldBindingMemoInput<
  State extends object,
  Habitat extends object,
> {
  readonly validator: RuntimeRegionalEcologyWorldBindingValidator<State, Habitat>;
  readonly completedTickOf: (state: State) => number;
  readonly isTrustedCommittedTransition: (previous: State, next: unknown) => next is State;
}

interface CachedBinding<Habitat extends object> {
  readonly seed0: number;
  readonly seed1: number;
  readonly seed2: number;
  readonly seed3: number;
  readonly completedTick: number;
  readonly settlementHomeHabitat: Habitat;
}

/**
 * Remembers exact immutable world bindings and admits one newly committed child
 * only through its in-process parent/child receipt. Deserialized values,
 * structural copies, changed bindings, and unreceipted transitions always take
 * the complete validator path.
 */
export function createRuntimeRegionalEcologyWorldBindingMemo<
  State extends object,
  Habitat extends object,
>(
  input: CreateRuntimeRegionalEcologyWorldBindingMemoInput<State, Habitat>,
): RuntimeRegionalEcologyWorldBindingMemo<State, Habitat> {
  const cache = new WeakMap<State, CachedBinding<Habitat>>();

  const remember = (
    state: State,
    binding: RuntimeRegionalEcologyWorldBinding<Habitat>,
  ): State => {
    cache.set(state, cachedBinding(binding));
    return state;
  };

  const canonicalize: RuntimeRegionalEcologyWorldBindingValidator<State, Habitat> = (
    value,
    binding,
  ) => {
    if (
      typeof value === "object"
      && value !== null
      && bindingMatches(cache.get(value as State), binding)
    ) return value as State;
    const canonical = input.validator(value, binding);
    return canonical === null ? null : remember(canonical, binding);
  };

  const canonicalizeCommittedTransition: RuntimeRegionalEcologyWorldBindingMemo<
    State,
    Habitat
  >["canonicalizeCommittedTransition"] = (previous, value, binding) => {
    const previousBinding = cache.get(previous);
    if (
      previousBinding !== undefined
      && input.isTrustedCommittedTransition(previous, value)
      && Object.is(previousBinding.completedTick, input.completedTickOf(previous))
      && Object.is(binding.completedTick, input.completedTickOf(value))
      && binding.completedTick >= previousBinding.completedTick
      && sameSeed(previousBinding, binding.rootSeed)
      && previousBinding.settlementHomeHabitat === binding.settlementHomeHabitat
    ) return remember(value, binding);
    return canonicalize(value, binding);
  };

  return Object.freeze({
    canonicalize,
    canonicalizeCommittedTransition,
  });
}

function cachedBinding<Habitat extends object>(
  binding: RuntimeRegionalEcologyWorldBinding<Habitat>,
): CachedBinding<Habitat> {
  return Object.freeze({
    seed0: binding.rootSeed[0],
    seed1: binding.rootSeed[1],
    seed2: binding.rootSeed[2],
    seed3: binding.rootSeed[3],
    completedTick: binding.completedTick,
    settlementHomeHabitat: binding.settlementHomeHabitat,
  });
}

function bindingMatches<Habitat extends object>(
  cached: CachedBinding<Habitat> | undefined,
  binding: RuntimeRegionalEcologyWorldBinding<Habitat>,
): boolean {
  return cached !== undefined
    && Object.is(cached.completedTick, binding.completedTick)
    && cached.settlementHomeHabitat === binding.settlementHomeHabitat
    && sameSeed(cached, binding.rootSeed);
}

function sameSeed<Habitat extends object>(
  cached: CachedBinding<Habitat>,
  seed: RootSeed,
): boolean {
  return Object.is(cached.seed0, seed[0])
    && Object.is(cached.seed1, seed[1])
    && Object.is(cached.seed2, seed[2])
    && Object.is(cached.seed3, seed[3]);
}
