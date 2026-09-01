import patchNotesJson from "./patchNotes.json";

export const PATCH_NOTES_SCHEMA_VERSION = 1 as const;

export const PATCH_NOTE_CATEGORIES = [
  "gameplay",
  "fixes",
  "balancing",
  "interface",
  "saves",
  "knownLimitations",
] as const;

export type PatchNoteCategory = (typeof PATCH_NOTE_CATEGORIES)[number];

export const PATCH_NOTE_CATEGORY_LABELS = {
  gameplay: "GAMEPLAY",
  fixes: "FIXES",
  balancing: "BALANCING",
  interface: "INTERFACE",
  saves: "SAVE CHANGES",
  knownLimitations: "KNOWN LIMITATIONS",
} as const satisfies Readonly<Record<PatchNoteCategory, string>>;

export interface PatchNoteRelease {
  readonly version: string;
  readonly releaseDate: string;
  readonly buildIdentity: string;
  readonly summary: string;
  readonly gameplayContractVersion: number;
  readonly tutorialVersion: number;
  readonly categories: Readonly<Record<PatchNoteCategory, readonly string[]>>;
}

export interface PatchNotesDocument {
  readonly schemaVersion: typeof PATCH_NOTES_SCHEMA_VERSION;
  readonly releases: readonly PatchNoteRelease[];
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const BUILD_IDENTITY_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{2,63}$/u;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainText(value: unknown, path: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || value.length > 500
    || /[<>\r\n]/u.test(value)
  ) {
    throw new Error(`${path} must be one trimmed line of plain text (1-500 characters).`);
  }
}

function positiveContractVersion(value: unknown, path: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${path} must be a positive safe integer.`);
  }
}

interface SemverParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

function semverParts(version: string): SemverParts {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) throw new Error(`Invalid patch-note version: ${version}.`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

/** Positive means `left` has newer SemVer precedence than `right`. */
export function comparePatchNoteVersions(left: string, right: string): number {
  const a = semverParts(left);
  const b = semverParts(right);
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const ai = a.prerelease[index];
    const bi = b.prerelease[index];
    if (ai === undefined || bi === undefined) return ai === undefined ? -1 : 1;
    if (ai === bi) continue;
    const an = /^\d+$/u.test(ai) ? Number(ai) : null;
    const bn = /^\d+$/u.test(bi) ? Number(bi) : null;
    if (an !== null && bn !== null) return an - bn;
    if (an !== null || bn !== null) return an !== null ? -1 : 1;
    return ai.localeCompare(bi, "en");
  }
  return 0;
}

function validIsoDate(date: string): boolean {
  if (!ISO_DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

function validateRelease(value: unknown, index: number): asserts value is PatchNoteRelease {
  const path = `releases[${index}]`;
  if (!record(value)) throw new Error(`${path} must be an object.`);
  const expected = [
    "version",
    "releaseDate",
    "buildIdentity",
    "summary",
    "gameplayContractVersion",
    "tutorialVersion",
    "categories",
  ];
  const actual = Object.keys(value);
  if (actual.length !== expected.length || expected.some((key) => !actual.includes(key))) {
    throw new Error(`${path} must contain exactly the canonical release fields.`);
  }
  plainText(value.version, `${path}.version`);
  if (!SEMVER_PATTERN.test(value.version)) throw new Error(`${path}.version must be valid SemVer.`);
  plainText(value.releaseDate, `${path}.releaseDate`);
  if (!validIsoDate(value.releaseDate)) throw new Error(`${path}.releaseDate must be a real ISO date.`);
  plainText(value.buildIdentity, `${path}.buildIdentity`);
  if (!BUILD_IDENTITY_PATTERN.test(value.buildIdentity)) {
    throw new Error(`${path}.buildIdentity must be a stable 3-64 character identifier.`);
  }
  plainText(value.summary, `${path}.summary`);
  positiveContractVersion(value.gameplayContractVersion, `${path}.gameplayContractVersion`);
  positiveContractVersion(value.tutorialVersion, `${path}.tutorialVersion`);
  if (!record(value.categories)) throw new Error(`${path}.categories must be an object.`);
  const categoryKeys = Object.keys(value.categories);
  if (
    categoryKeys.length !== PATCH_NOTE_CATEGORIES.length
    || PATCH_NOTE_CATEGORIES.some((category) => !categoryKeys.includes(category))
  ) {
    throw new Error(`${path}.categories must contain exactly the six canonical categories.`);
  }
  for (const category of PATCH_NOTE_CATEGORIES) {
    const entries = value.categories[category];
    if (!Array.isArray(entries)) throw new Error(`${path}.categories.${category} must be an array.`);
    entries.forEach((entry, entryIndex) => {
      plainText(entry, `${path}.categories.${category}[${entryIndex}]`);
    });
    if (new Set(entries).size !== entries.length) {
      throw new Error(`${path}.categories.${category} contains a duplicate entry.`);
    }
  }
}

/**
 * Validates untrusted parsed content before either the browser or the
 * CHANGELOG generator consumes it. Release order is deterministic: descending
 * ISO date, then descending SemVer precedence for same-day releases.
 */
export function validatePatchNotesDocument(value: unknown): PatchNotesDocument {
  if (!record(value)) throw new Error("Patch notes must be an object.");
  const topLevelKeys = Object.keys(value);
  if (
    topLevelKeys.length !== 2
    || !topLevelKeys.includes("schemaVersion")
    || !topLevelKeys.includes("releases")
  ) {
    throw new Error("Patch notes must contain exactly schemaVersion and releases.");
  }
  if (value.schemaVersion !== PATCH_NOTES_SCHEMA_VERSION) {
    throw new Error(`Unsupported patch-note schema version: ${String(value.schemaVersion)}.`);
  }
  if (!Array.isArray(value.releases) || value.releases.length === 0) {
    throw new Error("Patch notes must contain at least one release.");
  }
  value.releases.forEach(validateRelease);
  const versions = new Set<string>();
  const builds = new Set<string>();
  for (let index = 0; index < value.releases.length; index += 1) {
    const release = value.releases[index]!;
    if (versions.has(release.version)) throw new Error(`Duplicate release version: ${release.version}.`);
    if (builds.has(release.buildIdentity)) throw new Error(`Duplicate build identity: ${release.buildIdentity}.`);
    versions.add(release.version);
    builds.add(release.buildIdentity);
    const previous = value.releases[index - 1];
    if (!previous) continue;
    if (
      previous.releaseDate < release.releaseDate
      || (
        previous.releaseDate === release.releaseDate
        && comparePatchNoteVersions(previous.version, release.version) < 0
      )
    ) {
      throw new Error("Patch-note releases must be ordered newest first.");
    }
  }
  return value as unknown as PatchNotesDocument;
}

export const TIDEWEFT_PATCH_NOTES = validatePatchNotesDocument(patchNotesJson);
export const LATEST_PATCH_NOTE = TIDEWEFT_PATCH_NOTES.releases[0]!;
