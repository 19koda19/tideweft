import { describe, expect, it } from "vitest";

import { isOfficialStableReleaseVersion } from "../content/patchNotes";
import {
  CURRENT_GAME_SAVE_VERSION,
  FIRST_OFFICIAL_STABLE_GAME_SAVE_VERSION,
  OFFICIAL_SAVE_COMPATIBILITY_BASELINE_VERSION,
  SAVE_COMPATIBILITY_POLICY,
  classifyUnsupportedSaveSchema,
  createSaveCompatibilityPolicy,
} from "./saveCompatibilityPolicy";

describe("save compatibility policy", () => {
  it("keeps the current repository in the pre-1.0 development era", () => {
    expect(OFFICIAL_SAVE_COMPATIBILITY_BASELINE_VERSION).toBe("1.0.0");
    expect(CURRENT_GAME_SAVE_VERSION).toBe(47);
    expect(FIRST_OFFICIAL_STABLE_GAME_SAVE_VERSION).toBeNull();
    expect(SAVE_COMPATIBILITY_POLICY).toEqual({
      baselineVersion: "1.0.0",
      era: "pre-1.0-development",
      firstOfficialStableGameSaveVersion: null,
      strictForwardMigrationRequired: false,
    });
  });

  it("requires a frozen outer save schema as soon as official 1.0 exists", () => {
    expect(createSaveCompatibilityPolicy({
      hasOfficialStableRelease: ["1.0.0-rc.1"].some(isOfficialStableReleaseVersion),
      currentGameSaveVersion: 38,
      firstOfficialStableGameSaveVersion: null,
    }).era).toBe("pre-1.0-development");
    expect(() => createSaveCompatibilityPolicy({
      hasOfficialStableRelease: ["1.0.0"].some(isOfficialStableReleaseVersion),
      currentGameSaveVersion: 38,
      firstOfficialStableGameSaveVersion: null,
    })).toThrow(/without a frozen 1\.0 game-save schema version/u);
    expect(createSaveCompatibilityPolicy({
      hasOfficialStableRelease: ["1.0.0"].some(isOfficialStableReleaseVersion),
      currentGameSaveVersion: 38,
      firstOfficialStableGameSaveVersion: 38,
    })).toEqual({
      baselineVersion: "1.0.0",
      era: "1.0-and-later",
      firstOfficialStableGameSaveVersion: 38,
      strictForwardMigrationRequired: true,
    });
  });

  it("never returns to development policy after a historical stable release", () => {
    const ledgerVersions = ["1.1.0-alpha.1", "1.0.0", "0.3.3-alpha.60"];
    const policy = createSaveCompatibilityPolicy({
      hasOfficialStableRelease: ledgerVersions.some(isOfficialStableReleaseVersion),
      currentGameSaveVersion: 39,
      firstOfficialStableGameSaveVersion: 38,
    });
    expect(policy.era).toBe("1.0-and-later");
    expect(policy.strictForwardMigrationRequired).toBe(true);
  });

  it("requires a migration for an unsupported schema at the frozen 1.0 floor", () => {
    const strictPolicy = createSaveCompatibilityPolicy({
      hasOfficialStableRelease: true,
      currentGameSaveVersion: 39,
      firstOfficialStableGameSaveVersion: 38,
    });
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 38,
      currentGameSaveVersion: 39,
      retiredPre1GameSaveVersions: new Set([0]),
      policy: strictPolicy,
    })).toBe("missing-migration");
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 40,
      currentGameSaveVersion: 39,
      retiredPre1GameSaveVersions: new Set([0]),
      policy: strictPolicy,
    })).toBe("future-schema");
  });

  it("resets only explicitly retired development schemas", () => {
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 0,
      currentGameSaveVersion: CURRENT_GAME_SAVE_VERSION,
      retiredPre1GameSaveVersions: new Set([0]),
      policy: SAVE_COMPATIBILITY_POLICY,
    })).toBe("retired-pre-1.0");
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 0,
      currentGameSaveVersion: CURRENT_GAME_SAVE_VERSION,
      retiredPre1GameSaveVersions: new Set(),
      policy: SAVE_COMPATIBILITY_POLICY,
    })).toBe("corrupt");
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 41,
      currentGameSaveVersion: CURRENT_GAME_SAVE_VERSION,
      retiredPre1GameSaveVersions: new Set([0, 41, 42]),
      policy: SAVE_COMPATIBILITY_POLICY,
    })).toBe("retired-pre-1.0");
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 42,
      currentGameSaveVersion: CURRENT_GAME_SAVE_VERSION,
      retiredPre1GameSaveVersions: new Set([0, 41, 42, 43]),
      policy: SAVE_COMPATIBILITY_POLICY,
    })).toBe("retired-pre-1.0");
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 43,
      currentGameSaveVersion: CURRENT_GAME_SAVE_VERSION,
      retiredPre1GameSaveVersions: new Set([0, 41, 42, 43, 44]),
      policy: SAVE_COMPATIBILITY_POLICY,
    })).toBe("retired-pre-1.0");
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 44,
      currentGameSaveVersion: CURRENT_GAME_SAVE_VERSION,
      retiredPre1GameSaveVersions: new Set([0, 41, 42, 43, 44]),
      policy: SAVE_COMPATIBILITY_POLICY,
    })).toBe("retired-pre-1.0");
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 45,
      currentGameSaveVersion: CURRENT_GAME_SAVE_VERSION,
      retiredPre1GameSaveVersions: new Set([0, 41, 42, 43, 44, 45]),
      policy: SAVE_COMPATIBILITY_POLICY,
    })).toBe("retired-pre-1.0");
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 46,
      currentGameSaveVersion: CURRENT_GAME_SAVE_VERSION,
      retiredPre1GameSaveVersions: new Set([0, 41, 42, 43, 44, 45, 46]),
      policy: SAVE_COMPATIBILITY_POLICY,
    })).toBe("retired-pre-1.0");
    expect(classifyUnsupportedSaveSchema({
      schemaVersion: 42,
      currentGameSaveVersion: CURRENT_GAME_SAVE_VERSION,
      retiredPre1GameSaveVersions: new Set([0, 41]),
      policy: SAVE_COMPATIBILITY_POLICY,
    })).toBe("corrupt");
  });

  it("rejects invalid frozen schema boundaries", () => {
    for (const version of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createSaveCompatibilityPolicy({
        hasOfficialStableRelease: false,
        currentGameSaveVersion: 38,
        firstOfficialStableGameSaveVersion: version,
      })).toThrow(/positive safe integer/u);
    }
  });

  it("fails closed if either side of the permanent stable freeze is missing", () => {
    expect(() => createSaveCompatibilityPolicy({
      hasOfficialStableRelease: false,
      currentGameSaveVersion: 38,
      firstOfficialStableGameSaveVersion: 38,
    })).toThrow(/without its official stable release ledger entry/u);
    expect(() => createSaveCompatibilityPolicy({
      hasOfficialStableRelease: true,
      currentGameSaveVersion: 38,
      firstOfficialStableGameSaveVersion: 39,
    })).toThrow(/cannot be newer than the current writer/u);
    expect(() => createSaveCompatibilityPolicy({
      hasOfficialStableRelease: false,
      currentGameSaveVersion: 0,
      firstOfficialStableGameSaveVersion: null,
    })).toThrow(/current game-save version must be a positive safe integer/u);
  });
});
