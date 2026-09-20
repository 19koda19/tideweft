import type { RootSeed } from "../sim/rng";
import type { CoreEcologyActivityAuthorityReceipt } from "./coreEcologyActivity";
import type { RegionalEcologyRootV1 } from "./regionalEcology";
import type { RegionalEcologyStateV6ActiveProjection } from "./regionalEcologyStateV6";

export type RuntimeCoreEcologyActivityAuthorityBundle = ReadonlyMap<
  string,
  ReadonlyMap<string, CoreEcologyActivityAuthorityReceipt>
>;

export interface RuntimeCoreEcologyActivityAuthorityMemoInput {
  readonly projection: RegionalEcologyStateV6ActiveProjection;
  readonly root: RegionalEcologyRootV1;
  readonly rootSeed: RootSeed;
  readonly alpineSeedFingerprint: string;
}

export type RuntimeCoreEcologyActivityAuthorityBundleProjector = (
  input: RuntimeCoreEcologyActivityAuthorityMemoInput,
) => RuntimeCoreEcologyActivityAuthorityBundle | null;

export interface RuntimeCoreEcologyActivityAuthorityMemo {
  readonly project: RuntimeCoreEcologyActivityAuthorityBundleProjector;
}

/**
 * Reuses one complete bundle of branded activity receipts only while every
 * immutable authority input remains exact. This runtime-local single entry is
 * deliberately absent from save state and cannot retain prior world windows.
 */
export function createRuntimeCoreEcologyActivityAuthorityMemo(
  projector: RuntimeCoreEcologyActivityAuthorityBundleProjector,
): RuntimeCoreEcologyActivityAuthorityMemo {
  let projectionAuthority: RegionalEcologyStateV6ActiveProjection | null = null;
  let rootAuthority: RegionalEcologyRootV1 | null = null;
  let seed0 = 0;
  let seed1 = 0;
  let seed2 = 0;
  let seed3 = 0;
  let alpineSeedFingerprint = "";
  let bundle: RuntimeCoreEcologyActivityAuthorityBundle | null = null;

  return Object.freeze({
    project: (
      input: RuntimeCoreEcologyActivityAuthorityMemoInput,
    ): RuntimeCoreEcologyActivityAuthorityBundle | null => {
      if (
        bundle !== null
        && projectionAuthority === input.projection
        && rootAuthority === input.root
        && Object.is(seed0, input.rootSeed[0])
        && Object.is(seed1, input.rootSeed[1])
        && Object.is(seed2, input.rootSeed[2])
        && Object.is(seed3, input.rootSeed[3])
        && alpineSeedFingerprint === input.alpineSeedFingerprint
      ) return bundle;

      const next = projector(input);
      if (next !== null) {
        projectionAuthority = input.projection;
        rootAuthority = input.root;
        seed0 = input.rootSeed[0];
        seed1 = input.rootSeed[1];
        seed2 = input.rootSeed[2];
        seed3 = input.rootSeed[3];
        alpineSeedFingerprint = input.alpineSeedFingerprint;
        bundle = next;
      }
      return next;
    },
  });
}
