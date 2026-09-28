import { hashCanonical } from "../sim/util";

export const REGIONAL_ECOLOGY_ACTIVE_PROJECTION_INTEGRITY_SCHEME =
  "game:regional-ecology-active-projection-integrity:v1" as const;

interface RegionalEcologyProjectedResidentWithPatch {
  readonly patch: unknown;
  readonly projectedPatchHash: string;
}

export interface RegionalEcologyActiveProjectionIntegrityInput<
  TResident extends RegionalEcologyProjectedResidentWithPatch,
> {
  readonly version: number;
  readonly ownerId: string;
  readonly stateIntegrity: string;
  readonly atTick: number;
  readonly childIntegrity: string | null;
  readonly residents: readonly TResident[];
}

/**
 * Authenticate one transient active-projection layer without re-hashing its
 * canonical resident patches. Each projectedPatchHash already authenticates
 * the corresponding full patch; this envelope authenticates that hash and
 * every other resident metadata field in its existing canonical order.
 */
export function hashRegionalEcologyActiveProjectionIntegrity<
  TResident extends RegionalEcologyProjectedResidentWithPatch,
>(input: RegionalEcologyActiveProjectionIntegrityInput<TResident>): string {
  const residents = input.residents.map(({ patch: _patch, ...metadata }) => metadata);
  return hashCanonical({
    scheme: REGIONAL_ECOLOGY_ACTIVE_PROJECTION_INTEGRITY_SCHEME,
    version: input.version,
    ownerId: input.ownerId,
    stateIntegrity: input.stateIntegrity,
    atTick: input.atTick,
    childIntegrity: input.childIntegrity,
    residents,
  });
}
