import gameplayContractManifest from "./gameplayContract.json";

export type GameplayContractId = "challenging-hard";
export type GameplayContractDisplayName = "A CHALLENGING HARD";
export type AccessibilityRulesPolicy = "presentation-input-only";

export interface GameplayContractManifest {
  readonly schemaVersion: 1;
  readonly contractId: GameplayContractId;
  readonly displayName: GameplayContractDisplayName;
  readonly difficultyCount: 1;
  readonly gameplayContractVersion: number;
  readonly minimumTutorialVersion: number;
  readonly patchNotesSchemaVersion: 1;
  readonly accessibilityPolicy: AccessibilityRulesPolicy;
  readonly tutorialSourcePath: string;
  readonly patchNoteSourcePath: string;
  readonly generatedPatchNotesPath: string;
  readonly reviewSurface: readonly string[];
  readonly authoritativeExactPaths: readonly string[];
  readonly authoritativePathPrefixes: readonly string[];
  readonly authoritativeExcludedPaths: readonly string[];
  readonly authoritativeExcludedSuffixes: readonly string[];
}

function assertGameplayContractManifest(value: unknown): asserts value is GameplayContractManifest {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("The gameplay contract manifest must be an object.");
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1
    || candidate.contractId !== "challenging-hard"
    || candidate.displayName !== "A CHALLENGING HARD"
    || candidate.difficultyCount !== 1
    || candidate.accessibilityPolicy !== "presentation-input-only"
    || !Number.isSafeInteger(candidate.gameplayContractVersion)
    || (candidate.gameplayContractVersion as number) < 1
    || !Number.isSafeInteger(candidate.minimumTutorialVersion)
    || (candidate.minimumTutorialVersion as number) < (candidate.gameplayContractVersion as number)
    || candidate.patchNotesSchemaVersion !== 1
  ) {
    throw new TypeError("The gameplay contract identity or version policy is invalid.");
  }

  const stringKeys = [
    "tutorialSourcePath",
    "patchNoteSourcePath",
    "generatedPatchNotesPath",
  ] as const;
  if (stringKeys.some((key) => typeof candidate[key] !== "string" || candidate[key].length === 0)) {
    throw new TypeError("The gameplay contract review paths must be non-empty strings.");
  }

  const listKeys = [
    "reviewSurface",
    "authoritativeExactPaths",
    "authoritativePathPrefixes",
    "authoritativeExcludedPaths",
    "authoritativeExcludedSuffixes",
  ] as const;
  if (listKeys.some((key) => !Array.isArray(candidate[key]) || candidate[key].length === 0)) {
    throw new TypeError("The gameplay contract source and mechanic lists must be non-empty arrays.");
  }
  for (const key of listKeys) {
    if (!(candidate[key] as unknown[]).every((item) => typeof item === "string" && item.length > 0)) {
      throw new TypeError(`The gameplay contract ${key} list must contain only non-empty strings.`);
    }
  }
}

assertGameplayContractManifest(gameplayContractManifest);

/**
 * The one authoritative player-facing ruleset identity. Accessibility may
 * alter presentation and input ergonomics, never simulation or rewards.
 */
export const GAMEPLAY_CONTRACT = Object.freeze(gameplayContractManifest);
export const GAMEPLAY_CONTRACT_ID: GameplayContractId = GAMEPLAY_CONTRACT.contractId;
export const GAMEPLAY_CONTRACT_NAME: GameplayContractDisplayName = GAMEPLAY_CONTRACT.displayName;
export const GAMEPLAY_CONTRACT_VERSION = GAMEPLAY_CONTRACT.gameplayContractVersion;
export const ACCESSIBILITY_RULES_POLICY: AccessibilityRulesPolicy = GAMEPLAY_CONTRACT.accessibilityPolicy;
