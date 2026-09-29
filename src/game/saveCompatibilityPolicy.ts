import { HAS_OFFICIAL_STABLE_RELEASE } from "../content/patchNotes";

export const OFFICIAL_SAVE_COMPATIBILITY_BASELINE_VERSION = "1.0.0" as const;

/** The one outer `tideweft-session` schema emitted by this source tree. */
export const CURRENT_GAME_SAVE_VERSION = 38 as const;

/**
 * Set to the outer game-save schema shipped by the first official stable
 * release during the 1.0 save-compatibility freeze. Remaining null is correct
 * while the release ledger contains development releases only.
 */
export const FIRST_OFFICIAL_STABLE_GAME_SAVE_VERSION: number | null = null;

export type SaveCompatibilityEra =
  | "pre-1.0-development"
  | "1.0-and-later";

export interface SaveCompatibilityPolicy {
  readonly baselineVersion: typeof OFFICIAL_SAVE_COMPATIBILITY_BASELINE_VERSION;
  readonly era: SaveCompatibilityEra;
  readonly firstOfficialStableGameSaveVersion: number | null;
  readonly strictForwardMigrationRequired: boolean;
}

export interface SaveCompatibilityPolicyInput {
  readonly hasOfficialStableRelease: boolean;
  readonly currentGameSaveVersion: number;
  readonly firstOfficialStableGameSaveVersion: number | null;
}

export type UnsupportedSaveSchemaDisposition =
  | "retired-pre-1.0"
  | "future-schema"
  | "missing-migration"
  | "corrupt";

export interface UnsupportedSaveSchemaInput {
  readonly schemaVersion: number;
  readonly currentGameSaveVersion: number;
  readonly retiredPre1GameSaveVersions: ReadonlySet<number>;
  readonly policy: SaveCompatibilityPolicy;
}

/** Classifies a recognized integer schema that the current reader does not support. */
export function classifyUnsupportedSaveSchema(
  input: UnsupportedSaveSchemaInput,
): UnsupportedSaveSchemaDisposition {
  const {
    schemaVersion,
    currentGameSaveVersion,
    retiredPre1GameSaveVersions,
    policy,
  } = input;
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 0) return "corrupt";
  if (schemaVersion > currentGameSaveVersion) return "future-schema";
  const stableFloor = policy.firstOfficialStableGameSaveVersion;
  if (
    policy.strictForwardMigrationRequired
    && stableFloor !== null
    && schemaVersion >= stableFloor
  ) {
    return "missing-migration";
  }
  return retiredPre1GameSaveVersions.has(schemaVersion)
    ? "retired-pre-1.0"
    : "corrupt";
}

/**
 * Creates the compatibility policy from release authority plus the frozen
 * outer save-schema boundary. Keeping this pure makes release-gate behavior
 * directly testable without mutating the canonical ledger.
 */
export function createSaveCompatibilityPolicy(
  input: SaveCompatibilityPolicyInput,
): SaveCompatibilityPolicy {
  const {
    hasOfficialStableRelease,
    currentGameSaveVersion,
    firstOfficialStableGameSaveVersion,
  } = input;
  if (!Number.isSafeInteger(currentGameSaveVersion) || currentGameSaveVersion < 1) {
    throw new RangeError("The current game-save version must be a positive safe integer.");
  }
  if (
    firstOfficialStableGameSaveVersion !== null
    && (
      !Number.isSafeInteger(firstOfficialStableGameSaveVersion)
      || firstOfficialStableGameSaveVersion < 1
    )
  ) {
    throw new RangeError("The first official stable game-save version must be a positive safe integer.");
  }
  if (hasOfficialStableRelease && firstOfficialStableGameSaveVersion === null) {
    throw new Error(
      "Official stable release detected without a frozen 1.0 game-save schema version.",
    );
  }
  if (!hasOfficialStableRelease && firstOfficialStableGameSaveVersion !== null) {
    throw new Error(
      "Frozen 1.0 game-save schema exists without its official stable release ledger entry.",
    );
  }
  if (
    firstOfficialStableGameSaveVersion !== null
    && firstOfficialStableGameSaveVersion > currentGameSaveVersion
  ) {
    throw new Error(
      "The frozen 1.0 game-save schema cannot be newer than the current writer.",
    );
  }

  return Object.freeze({
    baselineVersion: OFFICIAL_SAVE_COMPATIBILITY_BASELINE_VERSION,
    era: hasOfficialStableRelease ? "1.0-and-later" : "pre-1.0-development",
    firstOfficialStableGameSaveVersion,
    strictForwardMigrationRequired: hasOfficialStableRelease,
  });
}

/**
 * Current repository policy. Adding an official stable release to the
 * append-only ledger without first freezing its save schema fails immediately
 * during module initialization and therefore blocks the release build.
 */
export const SAVE_COMPATIBILITY_POLICY = createSaveCompatibilityPolicy({
  hasOfficialStableRelease: HAS_OFFICIAL_STABLE_RELEASE,
  currentGameSaveVersion: CURRENT_GAME_SAVE_VERSION,
  firstOfficialStableGameSaveVersion: FIRST_OFFICIAL_STABLE_GAME_SAVE_VERSION,
});
