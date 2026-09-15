import { describe, expect, it } from "vitest";

import patchNotesJson from "./patchNotes.json";
import {
  LATEST_PATCH_NOTE,
  PATCH_NOTE_CATEGORIES,
  PATCH_NOTES_SCHEMA_VERSION,
  TIDEWEFT_PATCH_NOTES,
  comparePatchNoteVersions,
  validatePatchNotesDocument,
} from "./patchNotes";

const copy = (): unknown => JSON.parse(JSON.stringify(patchNotesJson));
const allCategoryCopy = (category: (typeof PATCH_NOTE_CATEGORIES)[number]): string =>
  TIDEWEFT_PATCH_NOTES.releases.flatMap((release) => release.categories[category]).join(" ");

describe("canonical offline patch notes", () => {
  it("validates the one canonical source with all six ordered categories", () => {
    expect(TIDEWEFT_PATCH_NOTES.schemaVersion).toBe(PATCH_NOTES_SCHEMA_VERSION);
    expect(Object.keys(LATEST_PATCH_NOTE.categories)).toEqual(PATCH_NOTE_CATEGORIES);
    expect(LATEST_PATCH_NOTE).toMatchObject({
      version: "0.3.3-alpha.49",
      releaseDate: "2026-09-15",
      buildIdentity: "0.3.3-alpha.49",
      gameplayContractVersion: 47,
      tutorialVersion: 59,
    });
    expect(PATCH_NOTE_CATEGORIES.every(
      (category) => LATEST_PATCH_NOTE.categories[category].length > 0,
    )).toBe(true);
  });

  it("uses SemVer precedence to reject newest-first mistakes on the same date", () => {
    expect(comparePatchNoteVersions("0.3.1-alpha.0", "0.3.0-alpha.1")).toBeGreaterThan(0);
    const document = copy() as { releases: unknown[] };
    document.releases.reverse();
    expect(() => validatePatchNotesDocument(document)).toThrow(/newest first/u);
  });

  it("rejects duplicate versions, builds, missing categories, and malformed contracts", () => {
    const extraRoot = copy() as any;
    extraRoot.unreviewedRelease = true;
    expect(() => validatePatchNotesDocument(extraRoot)).toThrow(/exactly schemaVersion and releases/u);

    const duplicate = copy() as any;
    duplicate.releases[1].version = duplicate.releases[0].version;
    expect(() => validatePatchNotesDocument(duplicate)).toThrow(/Duplicate release version/u);

    const duplicateBuild = copy() as any;
    duplicateBuild.releases[1].buildIdentity = duplicateBuild.releases[0].buildIdentity;
    expect(() => validatePatchNotesDocument(duplicateBuild)).toThrow(/Duplicate build identity/u);

    const missingCategory = copy() as any;
    delete missingCategory.releases[0].categories.fixes;
    expect(() => validatePatchNotesDocument(missingCategory)).toThrow(/six canonical categories/u);

    const badContract = copy() as any;
    badContract.releases[0].tutorialVersion = 0;
    expect(() => validatePatchNotesDocument(badContract)).toThrow(/positive safe integer/u);
  });

  it("rejects raw markup and multiline injection before any renderer sees it", () => {
    const html = copy() as any;
    html.releases[0].summary = "<img src=x onerror=alert(1)>";
    expect(() => validatePatchNotesDocument(html)).toThrow(/plain text/u);

    const markdown = copy() as any;
    markdown.releases[0].categories.fixes[0] = "safe\n# injected heading";
    expect(() => validatePatchNotesDocument(markdown)).toThrow(/plain text/u);
  });

  it("scopes Alpha-49 Twilight at the Marsh Edge and retains the earlier Turning Day slices", () => {
    const currentCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => LATEST_PATCH_NOTE.categories[category])
      .join(" ");
    const currentLimitations = LATEST_PATCH_NOTE.categories.knownLimitations.join(" ");
    const alpha47Release = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.47",
    );
    const alpha47Copy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => alpha47Release?.categories[category] ?? [])
      .join(" ");
    const alpha47Limitations = alpha47Release?.categories.knownLimitations.join(" ") ?? "";
    const alpha46Release = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.46",
    );
    const alpha46Copy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => alpha46Release?.categories[category] ?? [])
      .join(" ");
    const alpha46Limitations = alpha46Release?.categories.knownLimitations.join(" ") ?? "";
    const alpha45Release = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.45",
    );
    const alpha45Copy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => alpha45Release?.categories[category] ?? [])
      .join(" ");
    const alpha45Limitations = alpha45Release?.categories.knownLimitations.join(" ") ?? "";
    const alpha44Release = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.44",
    );
    const alpha44Copy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => alpha44Release?.categories[category] ?? [])
      .join(" ");
    const alpha44Limitations = alpha44Release?.categories.knownLimitations.join(" ") ?? "";
    const alpha43Release = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.43",
    );
    const alpha43Copy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => alpha43Release?.categories[category] ?? [])
      .join(" ");
    const alpha43Limitations = alpha43Release?.categories.knownLimitations.join(" ") ?? "";
    const alpha42Release = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.42",
    );
    const alpha42Copy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => alpha42Release?.categories[category] ?? [])
      .join(" ");
    const alpha42Limitations = alpha42Release?.categories.knownLimitations.join(" ") ?? "";
    const alpha41Release = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.41",
    );
    const alpha41Copy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => alpha41Release?.categories[category] ?? [])
      .join(" ");
    const alpha40Release = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.40",
    );
    const alpha40Copy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => alpha40Release?.categories[category] ?? [])
      .join(" ");
    const alpha39Release = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.39",
    );
    const alpha39Copy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => alpha39Release?.categories[category] ?? [])
      .join(" ");
    const marshRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.38",
    );
    const marshCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => marshRelease?.categories[category] ?? [])
      .join(" ");
    const estuaryRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.37",
    );
    const estuaryCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => estuaryRelease?.categories[category] ?? [])
      .join(" ");
    const breathRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.36",
    );
    const breathCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => breathRelease?.categories[category] ?? [])
      .join(" ");
    const foxRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.35",
    );
    const foxCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => foxRelease?.categories[category] ?? [])
      .join(" ");
    const coldwaterRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.34",
    );
    const coldwaterCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => coldwaterRelease?.categories[category] ?? [])
      .join(" ");
    const talusRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.33",
    );
    const talusCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => talusRelease?.categories[category] ?? [])
      .join(" ");
    const openCountryRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.32",
    );
    const openCountryCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => openCountryRelease?.categories[category] ?? [])
      .join(" ");
    const highCountryRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.31",
    );
    const highCountryCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => highCountryRelease?.categories[category] ?? [])
      .join(" ");
    const beyondHarborRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.30",
    );
    const beyondHarborCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => beyondHarborRelease?.categories[category] ?? [])
      .join(" ");
    const whatRemainsRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.29",
    );
    const whatRemainsCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => whatRemainsRelease?.categories[category] ?? [])
      .join(" ");
    const missingGoatRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.28",
    );
    const missingGoatCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => missingGoatRelease?.categories[category] ?? [])
      .join(" ");
    const watchReturnsRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.27",
    );
    const watchReturnsCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => watchReturnsRelease?.categories[category] ?? [])
      .join(" ");
    const paddockWatchRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.26",
    );
    const paddockWatchCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => paddockWatchRelease?.categories[category] ?? [])
      .join(" ");
    const farPaddockRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.25",
    );
    const farPaddockCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => farPaddockRelease?.categories[category] ?? [])
      .join(" ");
    const yardRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.24",
    );
    const yardCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => yardRelease?.categories[category] ?? [])
      .join(" ");
    const storehouseRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.23",
    );
    const storehouseCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => storehouseRelease?.categories[category] ?? [])
      .join(" ");
    const convergenceRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.22",
    );
    const convergenceCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => convergenceRelease?.categories[category] ?? [])
      .join(" ");
    const closureRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.18",
    );
    const livingChannelRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.21",
    );
    const livingChannelCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => livingChannelRelease?.categories[category] ?? [])
      .join(" ");
    const tidalRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.19",
    );
    const tidalCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => tidalRelease?.categories[category] ?? [])
      .join(" ");
    const closureCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => closureRelease?.categories[category] ?? [])
      .join(" ");
    const rainRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.17",
    );
    const rainCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => rainRelease?.categories[category] ?? [])
      .join(" ");
    const settlementRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.15",
    );
    const settlementCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => settlementRelease?.categories[category] ?? [])
      .join(" ");
    const habitatRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.14",
    );
    const habitatCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => habitatRelease?.categories[category] ?? [])
      .join(" ");
    const wildlifeRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.12",
    );
    const contractRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.13",
    );
    const wildlifeCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => wildlifeRelease?.categories[category] ?? [])
      .join(" ");
    const horizonRelease = TIDEWEFT_PATCH_NOTES.releases.find(
      ({ version }) => version === "0.3.3-alpha.0",
    );
    const horizonCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => horizonRelease?.categories[category] ?? [])
      .join(" ");
    const limitations = allCategoryCopy("knownLimitations");
    expect(LATEST_PATCH_NOTE.summary).toContain("Twilight at the Marsh Edge");
    expect(currentCopy).toContain("existing marsh rabbit");
    expect(currentCopy).toContain("twilight-active policy");
    expect(currentCopy).toContain("one saved civil clock");
    expect(currentCopy).toContain("stable identity-derived variation");
    expect(currentCopy).toContain("shared terrain pathing surface");
    expect(currentCopy).toContain("authenticated habitat rest site");
    expect(currentCopy).toContain("Travel remains Awake");
    expect(currentCopy).toContain("Resting requires physical arrival");
    expect(currentCopy).toContain("Asleep requires the common settling interval");
    expect(currentCopy).toContain("Immediate danger, lawful disturbance, urgent needs, and retained commitments");
    expect(currentCopy).toContain("does not create food, consume a resource, guarantee safety, or resolve feeding");
    expect(currentCopy).toContain("circadian-activity capability");
    expect(currentCopy).toContain("circadian-routine activity scope");
    expect(currentCopy).toContain("explicit land travel");
    expect(currentCopy).toContain("adds no rabbit, species, population unit");
    expect(currentCopy).toContain("adds no attack, injury, death, carcass, consumption, reproduction");
    expect(currentCopy).toContain("currently observable ground activity, relocation, Resting, or Asleep posture");
    expect(currentCopy).toContain("Outer save version 32 and RegionalEcologyStateV6 remain unchanged");
    expect(currentCopy).toContain("optional version-1 wildlife circadian receipt");
    expect(currentCopy).toContain("Stable actor identity remains separately owned");
    expect(currentCopy).toContain("phase is rederived from identity plus policy");
    expect(currentCopy).toContain("Full detail reauthenticates those facts");
    expect(currentCopy).toContain("coarse absence may conserve only an already committed bounded rest bout");
    expect(currentCopy).toContain("invents no commute, forage route, observation, or new decision");
    expect(currentCopy).toContain("Legacy rabbit actors without a receipt remain valid");
    expect(currentCopy).toContain("Released historical species-catalog snapshots preserve their exact earlier unbound activity declarations");
    expect(currentLimitations).toContain("not a new species, population expansion, weather-driven routine");
    expect(currentLimitations).toContain("broader coarse-time validation");
    expect(currentLimitations).toContain("Turning Day closure remain unfinished");
    expect(alpha47Release?.summary).toContain("Rest and Rise");
    expect(alpha47Copy).toContain("REST 30 MIN");
    expect(alpha47Copy).toContain("exactly three hundred ordinary player steps");
    expect(alpha47Copy).toContain("SLEEP TO DAWN");
    expect(alpha47Copy).toContain("first authoritative 06:00 boundary");
    expect(alpha47Copy).toContain("Outer save version 32 adds one nullable version-1 player time-action receipt");
    expect(alpha47Copy).toContain("never applies closed-app or background elapsed time");
    expect(alpha47Limitations).toContain("no new fatigue, hunger, thirst, player health, injury, shelter, camp, bed, house, interior, dream");
    expect(alpha46Release?.summary).toContain("The Keeper Sleeps");
    expect(alpha46Copy).toContain("Exactly one existing human");
    expect(alpha46Copy).toContain("stable food-store keeper");
    expect(alpha46Copy).toContain("same version-1 day-active living-circadian policy");
    expect(alpha46Copy).toContain("No second clock, human scheduler, duplicate resident, house, bed, or invented interior");
    expect(alpha46Copy).toContain("authoritative home settlement");
    expect(alpha46Copy).toContain("Resting and then Asleep");
    expect(alpha46Copy).toContain("stable identity-derived boundary");
    expect(alpha46Copy).toContain("non-neutral porter response");
    expect(alpha46Copy).toContain("authoritative post-command resident perception boundary suppresses new visual observations");
    expect(alpha46Copy).toContain("hearing and scent can still carry lawful wake evidence");
    expect(alpha46Copy).toContain("accepting work on that same tick permits ordinary vision");
    expect(alpha46Copy).toContain("exhaustion and rest-need recovery only while their canonical body is actually at its authenticated home settlement");
    expect(alpha46Copy).toContain("Merely being sheltered, idle, travelling, or carrying a stale sleep receipt grants no restorative physiology");
    expect(alpha46Copy).toContain("one stale healing tick at dawn");
    expect(alpha46Copy).toContain("directly observable keeper as Resting or Asleep");
    expect(alpha46Copy).toContain("An asleep resident does not produce ordinary state speech");
    expect(alpha46Copy).toContain("Outer save version 31, RegionalEcologyStateV6, settlement ecology version 4");
    expect(alpha46Copy).toContain("Resident state gains one additive optional shared circadian receipt");
    expect(alpha46Copy).toContain("Legacy residents without that property remain valid");
    expect(alpha46Copy).toContain("legacy keeper encountered away remains unbound until a real home tick");
    expect(alpha46Limitations).toContain("exactly one existing food-store keeper");
    expect(alpha46Limitations).toContain("not a physical house, bed, interior routine");
    expect(alpha46Limitations).toContain("player REST and SLEEP");
    expect(currentLimitations).toContain("Alpha 39 remains the latest verified public release");
    expect(currentLimitations).toContain("not been pushed, published, deployed");
    expect(currentLimitations).toContain("LIVE_VERIFIED");
    expect(currentCopy).not.toMatch(/player sleep is live|all human schedules are live|all dogs|grants free healing/iu);
    expect(alpha45Release?.summary).toContain("Kennel Night");
    expect(alpha45Copy).toContain("Exactly one existing starting-harbor settlement-custodied working dog");
    expect(alpha45Copy).toContain("shared living-circadian kernel");
    expect(alpha45Copy).toContain("clock-driven day-active policy");
    expect(alpha45Copy).toContain("actual kennel already authenticated by its settlement custody");
    expect(alpha45Copy).toContain("stays awake and receives no restorative physiology while travelling");
    expect(alpha45Copy).toContain("only physical arrival permits Resting and then Asleep");
    expect(alpha45Copy).toContain("wakes at its stable-ID active boundary");
    expect(alpha45Copy).toContain("retained investigation or return work");
    expect(alpha45Copy).toContain("kennel keeps its physical weather shelter while the dog is awake");
    expect(alpha45Copy).toContain("Shelter alone, low-exertion watch, and travel toward the kennel now reduce neither exhaustion nor rest need");
    expect(alpha45Copy).toContain("both recovery paths require the committed restorative posture after authenticated kennel arrival");
    expect(alpha45Copy).toContain("working-animal deferral now records its actual current intent instead of substituting a retreat cause");
    expect(alpha45Copy).toContain("directly visible ABOUT inspection can label the current posture Resting or Asleep");
    expect(alpha45Copy).toContain("hidden schedule, phase offset, wake threshold");
    expect(alpha45Copy).toContain("Outer save version 31, RegionalEcologyStateV6, settlement ecology version 4, and working-animal state version 2 remain unchanged");
    expect(alpha45Copy).toContain("Dog actor schema/version 1 gains an additive optional shared circadian receipt");
    expect(alpha45Copy).toContain("Legacy dog actor records without the optional field remain valid and byte-stable");
    expect(alpha45Copy).toContain("recovers accepted pending working-animal transactions exactly once before play resumes");
    expect(alpha45Copy).toContain("already-present routine receipt is reprojected against the recovered assignment at the same saved tick");
    expect(alpha45Copy).toContain("legacy absent receipt remains absent rather than being invented");
    expect(alpha45Limitations).toContain("exactly one existing settlement-custodied working dog's kennel routine");
    expect(alpha45Limitations).toContain("not a routine for the independent porter-scene dog, all dogs, humans");
    expect(alpha45Limitations).toContain("bonded/player companion routines");
    expect(alpha45Limitations).toContain("player REST and SLEEP");
    expect(alpha44Release?.summary).toContain("Ten Minutes");
    expect(alpha44Copy).toContain("exactly one hundred ordinary player fixed steps");
    expect(alpha44Copy).toContain("ten displayed minutes");
    expect(alpha44Copy).toContain("one successful fixed step per presented frame");
    expect(alpha44Copy).toContain("final fixed step keeps announcement priority");
    expect(alpha44Copy).toContain("shared Journey action dock on desktop and touch");
    expect(alpha44Copy).toContain("Outer save version 31 remains unchanged");
    expect(alpha44Copy).toContain("intentionally session-local");
    expect(alpha44Limitations).toContain("not player REST or SLEEP");
    expect(alpha44Limitations).toContain("Human and companion routines");
    expect(alpha43Release?.summary).toContain("Two Rhythms");
    expect(alpha43Copy).toContain("declarative species-to-activity registry");
    expect(alpha43Copy).toContain("day-active fish crow");
    expect(alpha43Copy).toContain("night-active North American river otter");
    expect(alpha43Copy).toContain("authenticated foraging water");
    expect(alpha43Copy).toContain("authenticated dry haulout");
    expect(alpha43Copy).toContain("shared amphibious route");
    expect(alpha43Copy).toContain("rest physiology in transit");
    expect(alpha43Copy).toContain("Historical actors still receive no invented routine state");
    expect(alpha43Copy).toContain("Harbor seal behavior is unchanged");
    expect(alpha43Copy).toContain("forty-seven records total");
    expect(alpha43Copy).toContain("Outer save version 31, RegionalEcologyStateV6, and core wildlife actor schema/version 1 remain unchanged");
    expect(alpha43Copy).toContain("frozen 24-, 27-, 28-, 29-, 31-, 36-, 43-, and 47-record Alpha 32 through Alpha 39 catalog snapshots retain their exact bytes and hashes");
    expect(alpha43Copy).toContain("Only the current forty-seven-record catalog declares the otter nocturnal");
    expect(alpha43Limitations).toContain("not catalog-wide circadian or sleep coverage");
    expect(alpha43Limitations).toContain("Player WAIT, REST, and SLEEP actions");
    expect(alpha43Limitations).toContain("human schedules");
    expect(alpha43Limitations).toContain("companion-dog settling and waking");
    expect(alpha42Release?.summary).toContain("First Roost");
    expect(alpha42Copy).toContain("A versioned species-neutral living-routine kernel");
    expect(alpha42Copy).toContain("existing fish-crow perch-watch behavior");
    expect(alpha42Copy).toContain("physically travels to its authenticated habitat perch");
    expect(alpha42Copy).toContain("Routine posture is AWAKE, RESTING, ASLEEP, or STARTLED");
    expect(alpha42Copy).toContain("REST physiology is now inaccessible");
    expect(alpha42Copy).toContain("asleep wake threshold");
    expect(alpha42Copy).toContain("bounded coarse absence");
    expect(alpha42Copy).toContain("A CHALLENGING HARD remains the only ruleset");
    expect(alpha42Copy).toContain("The outer session envelope advances to version 31");
    expect(alpha42Copy).toContain("Core wildlife actor version 1 gains an additive optional circadian sidecar");
    expect(alpha42Limitations).toContain("one representative fish-crow/perch-watch vertical slice");
    expect(alpha42Limitations).toContain("Player WAIT, REST, and SLEEP actions");
    expect(alpha41Release?.summary).toContain("First Light");
    expect(alpha41Copy).toContain("Outdoor illumination is now one deterministic fixed-point world condition");
    expect(alpha41Copy).toContain("Darkness now contracts exact actor, item, label, and interaction recognition");
    expect(alpha41Copy).toContain("completed beacon civic project");
    expect(alpha41Copy).toContain("Chart 2D and Relief 3D");
    expect(alpha41Copy).toContain("Fresh worlds begin at Day 1 07:00");
    expect(alpha41Copy).toContain("Relief water remains an unlit blue-anchored material");
    expect(alpha41Copy).toContain("Outer save version 30 remains unchanged");
    expect(alpha40Release?.summary).toContain("One Clock");
    expect(alpha40Copy).toContain("One versioned civil-day contract");
    expect(alpha40Copy).toContain("one displayed minute");
    expect(alpha40Copy).toContain("each 1,440-tick day");
    expect(alpha40Copy).toContain("06:00 through 20:00 behavior exactly");
    expect(alpha40Copy).toContain("HUD time, event timestamps, continue summaries");
    expect(alpha40Copy).toContain("adds no offline elapsed time");
    expect(alpha39Copy).not.toMatch(/wildlife encounters are live|procedural ladder-gated outcrops are live/iu);
    expect(alpha39Release?.summary).toContain("Saltmarsh Small Worlds");
    expect(alpha39Copy).toContain("Eastern saltmarsh mosquito, marsh periwinkle, seaside sparrow, and diamondback terrapin append as records 44 through 47");
    expect(alpha39Copy).toContain("exactly forty-five core-wildlife profiles plus the separate human and domestic-dog foundation records");
    expect(alpha39Copy).toContain("Mosquitoes and periwinkles remain conserved non-addressable aggregates with at most two authenticated anchors each");
    expect(alpha39Copy).toContain("Seaside sparrows form one group-atomic flock of two to four persistent members");
    expect(alpha39Copy).toContain("diamondback terrapin is one solitary persistent reptile");
    expect(alpha39Copy).toContain("seaside sparrows require the admitted mosquito aggregate");
    expect(alpha39Copy).toContain("terrapin requires the admitted periwinkle aggregate");
    expect(alpha39Copy).toContain("advances append-only to epoch 3 without changing outer save version 30 or RegionalEcologyStateV6");
    expect(alpha39Copy).toContain("adopted once at the saved tick");
    expect(alpha39Copy).toContain("reuses shared aggregate, activity, perception, locomotion, group, knowledge, and presentation owners");
    expect(alpha39Copy).toContain("clear-versus-ridge-occluded terrapin and periwinkle interaction");
    expect(alpha39Copy).toContain("without padding this directive or requiring bespoke tests for every species and pair");
    expect(alpha39Copy).toContain("group-atomic cap of twenty-four actors");
    expect(alpha39Copy).toContain("Chart 2D and Relief 3D");
    expect(alpha39Copy).toContain("Quick inspection and ABOUT");
    expect(alpha39Copy).toContain("Outer save version 30 and RegionalEcologyStateV6 remain unchanged");
    expect(alpha39Copy).toContain("forty-seven records");
    expect(marshRelease?.summary).toContain("Marsh Channel Web");
    expect(marshCopy).toContain("Atlantic menhaden, mummichog, grass shrimp, blue crab, greater yellowlegs, belted kingfisher, and double-crested cormorant append as records 37 through 43");
    expect(marshCopy).toContain("Menhaden, mummichog, grass shrimp, and blue crab remain conserved non-addressable aggregates");
    expect(marshCopy).toContain("Greater yellowlegs form one group-atomic flock of two to four persistent members");
    expect(marshCopy).toContain("kingfisher is solitary");
    expect(marshCopy).toContain("cormorants form one group-atomic flock of two to three persistent members");
    expect(marshCopy).toContain("Yellowlegs require grass shrimp, kingfishers require mummichog, and cormorants require menhaden");
    expect(marshCopy).toContain("activated through epoch 2 without adding a new regional-ecology or outer-save wrapper");
    expect(marshCopy).toContain("append the exact Marsh Channel Web cohort once at their saved tick");
    expect(marshCopy).toContain("All four new aggregates reuse shared bounded aggregate and Tide Table policy");
    expect(marshCopy).toContain("Yellowlegs reuse anchored wading");
    expect(marshCopy).toContain("kingfishers reuse air-only surface-opportunity and perch behavior");
    expect(marshCopy).toContain("cormorants use a shared diving-waterbird routine");
    expect(marshCopy).toContain("Immediate danger still wins");
    expect(estuaryCopy).toContain("Bay anchovy, Atlantic ghost crab, great blue heron, common tern, and osprey append as records 32 through 36");
    expect(estuaryCopy).toContain("one conserved non-addressable school of up to forty-eight units");
    expect(estuaryCopy).toContain("one conserved non-addressable shore aggregate of up to twenty-four units");
    expect(estuaryCopy).toContain("Great blue heron and osprey are solitary persistent individuals");
    expect(estuaryCopy).toContain("common terns form one group-atomic flock of two to four persistent members");
    expect(estuaryCopy).toContain("regional quiet, and prey support decide whether each profile exists");
    expect(estuaryCopy).toContain("require the exact local bay-anchovy substrate");
    expect(estuaryCopy).toContain("shared Tide Table authority");
    expect(estuaryCopy).toContain("Amphibious route eligibility is now independent from shore-water activity");
    expect(estuaryCopy).toContain("append-only by cohort epoch");
    expect(breathCopy).toContain("Harbor seal is appended as record 30 and polar bear as record 31");
    expect(breathCopy).toContain("one authenticated foraging-water and dry-haulout pair");
    expect(breathCopy).toContain("polar-bear pursuit with harbor-seal flight");
    expect(foxCopy).toContain("catalog advances to twenty-nine records");
    expect(foxCopy).toContain("One solitary addressable Arctic fox");
    expect(foxCopy).toContain("exact already-admitted Coldwater Glint capelin forage substrate");
    expect(foxCopy).toContain("lawfully perceived domestic dog can become generic pressure");
    expect(foxCopy).toContain("currently visible fox can apply generic nonlethal pressure to the conserved capelin aggregate");
    expect(coldwaterCopy).toContain("catalog advances to twenty-eight records");
    expect(coldwaterCopy).toContain("non-addressable Atlantic-capelin school");
    expect(coldwaterCopy).toContain("policy-driven tidal aggregate owner");
    expect(coldwaterCopy).toContain("existing aerial surface observer");
    expect(coldwaterCopy).toContain("Occlusion prevents the observation and response");
    expect(coldwaterCopy).toContain("no exact fish, capture, injury, death, body, item, or cargo effect");
    expect(coldwaterCopy).toContain("inactive regional records are not scanned every frame");
    expect(coldwaterCopy).toContain("independently clamped territory bounds");
    expect(coldwaterCopy).toContain("visible-versus-occluded aerial-observer chain");
    expect(talusCopy).toContain("catalog advances to twenty-seven records");
    expect(talusCopy).toContain("mountain-goat HERD");
    expect(talusCopy).toContain("non-addressable American-pika talus aggregate");
    expect(talusCopy).toContain("one solitary golden eagle");
    expect(talusCopy).toContain("shared grade-aware terrestrial locomotion");
    expect(talusCopy).toContain("authenticated ridge soaring and perching lines");
    expect(talusCopy).toContain("currently visible golden eagle");
    expect(talusCopy).toContain("Terrain occlusion prevents that observation and response");
    expect(talusCopy).toContain("no exact pika is selected, captured, injured, killed, or turned into a body");
    expect(talusCopy).toContain("one insertion-order-independent, group-atomic stable-distance top-K plan capped at twenty-four actors");
    expect(talusCopy).toContain("exact Open Country Ledger regional-habitat prefix");
    expect(talusCopy).toContain("separate append-safe sparse layer");
    expect(talusCopy).toContain("representative visible-versus-occluded eagle-and-pika chain");
    expect(openCountryCopy).toContain("deterministic signed-region habitat");
    expect(openCountryCopy).toContain("carrying capacity, food or prey support, territory, and density budgets");
    expect(openCountryCopy).toContain("honestly empty");
    expect(openCountryCopy).toContain("one global group-atomic stable-distance top-K plan capped at twenty-four actors");
    expect(openCountryCopy).toContain("Fixed pre-materialization density gates");
    expect(openCountryCopy).toContain("free-ranging domestic cat is now habitat-optional");
    expect(highCountryCopy).toContain("Cougar and brown bear");
    expect(highCountryCopy).toContain("twenty-four-record catalog");
    expect(highCountryCopy).toContain("same habitat, population, perception, attention, locomotion, bounded materialization, and presentation owners");
    expect(highCountryCopy).toContain("currently identified solitary addressable marsh rabbit");
    expect(highCountryCopy).toContain("A brown bear has no live-prey pursuit or harmful contact");
    expect(highCountryCopy).toContain("see, reach, claim, guard, and consume from an already-existing finite physical body");
    expect(highCountryCopy).toContain("representative predator-and-scavenger chain exercise the reusable scaffold instead of bespoke tests for every species or an N-squared animal-pair matrix");
    expect(beyondHarborCopy).toContain("wild boar, elk, and gray wolf");
    expect(beyondHarborCopy).toContain("SOUNDER, HERD, and PACK");
    expect(beyondHarborCopy).toContain("shared direct perception, attention, actor-owned locomotion");
    expect(beyondHarborCopy).toContain("only a solitary addressable marsh rabbit");
    expect(beyondHarborCopy).toContain("grouped elk, deer, and every other group member cannot be harmed");
    expect(beyondHarborCopy).toContain("currently perceiving it, reaching it through ordinary movement, and winning its physical claim");
    expect(beyondHarborCopy).toContain("representative emergent chains replace bespoke tests for every species or an N-squared animal-pair matrix");
    expect(whatRemainsCopy).toContain("currently identified marsh rabbit");
    expect(whatRemainsCopy).toContain("exact body physically reaches that exact rabbit");
    expect(whatRemainsCopy).toContain("removes exactly one unit from its population");
    expect(whatRemainsCopy).toContain("abstract reserve");
    expect(whatRemainsCopy).toContain("one stable physical carcass with a finite conserved resource");
    expect(whatRemainsCopy).toContain("marsh fox or fish crow");
    expect(whatRemainsCopy).toContain("current lawful perception boundary");
    expect(whatRemainsCopy).toContain("representative fox-and-scavenger scenarios replace an N-squared species-pair matrix");
    expect(missingGoatCopy).toContain("current caused flee or retreat");
    expect(missingGoatCopy).toContain("Distance alone cannot manufacture a split");
    expect(missingGoatCopy).toContain("physical group reunion and current keeper sight");
    expect(missingGoatCopy).toContain("indivisible materialization-cap units");
    expect(watchReturnsCopy).toContain("one bounded work task for the existing settlement guardian dog");
    expect(watchReturnsCopy).toContain("deterministic shared-locomotion search probe");
    expect(watchReturnsCopy).toContain("physically back toward the existing pen worksite");
    expect(watchReturnsCopy).toContain("keeper's lawful acknowledgement");
    expect(watchReturnsCopy).toContain("fresh reciprocal identified sight");
    expect(paddockWatchCopy).toContain("exactly one additional seed-stable domestic dog");
    expect(paddockWatchCopy).toContain("distinct from the original independent porter-scene dog");
    expect(paddockWatchCopy).toContain("generic persisted settlement-working-animal owner");
    expect(paddockWatchCopy).toContain("ordinary dog cognition, needs, weather exposure, condition, perception, and locomotion");
    expect(paddockWatchCopy).toContain("ordered species-neutral participant boundary");
    expect(paddockWatchCopy).toContain("rabbit's anonymous alarm can recruit the dog");
    expect(paddockWatchCopy).toContain("fox changes course only after it actually gains lawful sight");
    expect(paddockWatchCopy).toContain("actor with bounded senses, exposure, needs, route access, and self-preservation");
    expect(paddockWatchCopy).toContain("representative runtime and emergence chains replace species-by-species fixtures or an N-squared interaction matrix");
    expect(farPaddockCopy).toContain("exactly two individually identified domestic goats");
    expect(farPaddockCopy).toContain("existing wildlife actor, direct perception, attention, terrestrial locomotion, broad ecological-role, and group-alarm owners");
    expect(farPaddockCopy).toContain("several canonical domestic custody relationships and typed coop or pen homes");
    expect(farPaddockCopy).toContain("physical reach, current need, and stable actor identity");
    expect(farPaddockCopy).toContain("replace a bespoke test suite for every animal or an N-squared pair matrix");
    expect(yardCopy).toContain("one deterministic flock of two or three individual domestic chickens");
    expect(yardCopy).toContain("shared wildlife actor, direct perception, attention, terrestrial locomotion, and group contracts");
    expect(yardCopy).toContain("consume one authenticated unit per resolved event");
    expect(yardCopy).toContain("Securing the door removes that opportunity");
    expect(yardCopy).toContain("hidden activity remains world truth without becoming player narration");
    expect(yardCopy).toContain("replace a bespoke suite for every species or an animal-pair matrix");
    expect(alpha39Release?.categories.saves.join(" ")).toContain("Outer save version 30 and RegionalEcologyStateV6 remain unchanged");
    expect(alpha39Release?.categories.saves.join(" ")).toContain("version-1 sparse breadth root");
    expect(alpha39Release?.categories.saves.join(" ")).toContain("released living catalog contains forty-seven records");
    expect(alpha39Release?.categories.saves.join(" ")).toContain("valid outer-v30 epoch-2 state authenticates before deterministic epoch-3 activation");
    expect(alpha39Release?.categories.saves.join(" ")).toContain("complete earlier activation, resident, identity, aggregate, saved-tick, and genuine-deviation prefix remains exact");
    expect(alpha39Release?.categories.saves.join(" ")).toContain("Every ecology owner remains inside one atomic projection and conservation commit");
    expect(alpha39Release?.categories.saves.join(" ")).toContain("split the sparrow flock");
    expect(alpha39Release?.categories.knownLimitations.join(" ")).toContain("LIVE_VERIFIED cumulative Directive 04_1 release");
    expect(alpha39Release?.categories.knownLimitations.join(" ")).toContain("closes the chosen 45 / 47 breadth boundary");
    expect(alpha39Release?.categories.knownLimitations.join(" ")).toContain("no mosquito bite or disease, exact insect or snail actor");
    expect(alpha39Release?.categories.knownLimitations.join(" ")).toContain("capture, live-prey consumption, fishing, harvesting, new injury, mortality or body path");
    expect(alpha39Release?.categories.knownLimitations.join(" ")).toContain("no audible Living Voice, full circadian behavior, continuous 3D flight");
    expect(alpha39Release?.categories.knownLimitations.join(" ")).toContain("Cumulative CI, Pages deployment, and exact five-file live verification passed");
    expect(breathRelease?.categories.saves.join(" ")).toContain("outer session advances to version 29");
    expect(breathRelease?.categories.saves.join(" ")).toContain("regional ecology advances to root version 5");
    expect(breathRelease?.categories.knownLimitations.join(" ")).toContain("bounded Wave-F role coverage, not Wave G, Directive 04_1");
    expect(foxRelease?.categories.saves.join(" ")).toContain("outer session advances to version 28");
    expect(foxRelease?.categories.saves.join(" ")).toContain("regional ecology advances to root version 4");
    expect(foxRelease?.categories.saves.join(" ")).toContain("production catalog contains twenty-nine records");
    expect(coldwaterRelease?.categories.saves.join(" ")).toContain("outer session advances to version 27");
    expect(coldwaterRelease?.categories.saves.join(" ")).toContain("regional ecology advances to root version 3");
    expect(coldwaterRelease?.categories.saves.join(" ")).toContain("exact authenticated version-2 composite");
    expect(coldwaterRelease?.categories.saves.join(" ")).toContain("version-1 sparse polar-shore root");
    expect(coldwaterRelease?.categories.saves.join(" ")).toContain("production catalog contains twenty-eight records");
    expect(coldwaterRelease?.categories.saves.join(" ")).toContain("sealed outer-version-26 Talus and Sky save is authenticated and adopted exactly once");
    expect(coldwaterRelease?.categories.saves.join(" ")).toContain("receipt binds its original outer integrity and complete version-2 lineage");
    expect(coldwaterRelease?.categories.saves.join(" ")).toContain("All three ecology layers share one atomic projection and conservation commit");
    expect(coldwaterRelease?.categories.knownLimitations.join(" ")).toContain("unpublished local candidate");
    expect(coldwaterRelease?.categories.knownLimitations.join(" ")).toContain("not complete Wave F, worldwide polar ecology, biodiversity breadth");
    expect(coldwaterRelease?.categories.knownLimitations.join(" ")).toContain("adds no Arctic fox, polar bear, seal, new seabird");
    expect(talusRelease?.categories.saves.join(" ")).toContain("outer session advances to version 26");
    expect(talusRelease?.categories.saves.join(" ")).toContain("regional ecology advances to root version 2");
    expect(talusRelease?.categories.saves.join(" ")).toContain("exact authenticated version-1 Open Country Ledger child");
    expect(talusRelease?.categories.saves.join(" ")).toContain("separate sparse Alpine child");
    expect(talusRelease?.categories.saves.join(" ")).toContain("production catalog contains twenty-seven records");
    expect(talusRelease?.categories.saves.join(" ")).toContain("normalized sealed version-25 Open Country Ledger save is authenticated and adopted exactly once");
    expect(talusRelease?.categories.saves.join(" ")).toContain("receipt binds its original outer integrity and complete base lineage");
    expect(talusRelease?.categories.saves.join(" ")).toContain("Both ecology children share one atomic projection and conservation commit");
    expect(talusRelease?.categories.knownLimitations.join(" ")).toContain("not polar ecology, complete Wave F, worldwide species breadth");
    expect(talusRelease?.categories.knownLimitations.join(" ")).toContain("adds no animal mortality, live-prey capture, exact pika target, reproduction");
    expect(talusRelease?.categories.knownLimitations.join(" ")).toContain("earlier exact marsh-fox, gray-wolf, or cougar contact");
    expect(openCountryRelease?.categories.saves.join(" ")).toContain("outer session advances to version 25");
    expect(openCountryRelease?.categories.saves.join(" ")).toContain("regional ecology root version 1");
    expect(openCountryRelease?.categories.saves.join(" ")).toContain("catalog remains at twenty-four records with no new species");
    expect(highCountryRelease?.categories.saves.join(" ")).toContain("outer session advances to version 24");
    expect(highCountryRelease?.categories.saves.join(" ")).toContain("habitat analysis advances to version 11");
    expect(highCountryRelease?.categories.saves.join(" ")).toContain("catalog now contains twenty-four records");
    expect(highCountryRelease?.categories.saves.join(" ")).toContain("sealed version-23 Beyond the Harbor save is authenticated and adopted exactly once");
    expect(highCountryRelease?.categories.saves.join(" ")).toContain("complete habitat-version-10 source and population sequence");
    expect(highCountryRelease?.categories.knownLimitations.join(" ")).toContain("Brown bear has no live-prey pursuit or contact");
    expect(highCountryRelease?.categories.knownLimitations.join(" ")).toContain("no player, dog, human, social-group-member, or broader-animal harm");
    expect(highCountryRelease?.categories.knownLimitations.join(" ")).toContain("no social group, persistent track evidence, audible voice, species-specific dog-directed behavior");
    expect(highCountryRelease?.categories.knownLimitations.join(" ")).toContain("shared large-predator perception path");
    expect(beyondHarborRelease?.categories.saves.join(" ")).toContain("outer session advances to version 23");
    expect(beyondHarborRelease?.categories.saves.join(" ")).toContain("habitat analysis advances to version 10");
    expect(beyondHarborRelease?.categories.saves.join(" ")).toContain("catalog now contains twenty-two records");
    expect(whatRemainsRelease?.categories.saves.join(" ")).toContain("outer session advances to version 22");
    expect(whatRemainsRelease?.categories.saves.join(" ")).toContain("Habitat analysis remains version 9");
    expect(whatRemainsRelease?.categories.saves.join(" ")).toContain("core-ecology patch advances to version 3");
    expect(whatRemainsRelease?.categories.saves.join(" ")).toContain("aggregate record advances to version 5");
    expect(whatRemainsRelease?.categories.saves.join(" ")).toContain("sealed version-21 Missing Goat save migrates exactly once");
    expect(whatRemainsRelease?.categories.saves.join(" ")).toContain("empty authoritative mortality, population-reserve, and physical-body ledger");
    expect(whatRemainsRelease?.categories.knownLimitations.join(" ")).toContain("adds no species, habitat, population, settlement relationship, home, or actor");
    expect(whatRemainsRelease?.categories.knownLimitations.join(" ")).toContain("Only direct marsh-fox contact can injure or kill an individual marsh rabbit");
    expect(whatRemainsRelease?.categories.knownLimitations.join(" ")).toContain("Player, dog, human, other-animal, and social-group-member mortality remain absent");
    expect(whatRemainsRelease?.categories.knownLimitations.join(" ")).toContain("Reproduction, recruitment, population recovery, live-time decomposition, body drift, dragging, harvesting, carcass scent, insects");
    expect(watchReturnsRelease?.categories.saves.join(" ")).toContain("outer session advances to version 20");
    expect(watchReturnsRelease?.categories.saves.join(" ")).toContain("sealed version-19 Paddock Watch save migrates exactly once");
    expect(paddockWatchRelease?.categories.saves.join(" ")).toContain("outer session advances to version 19");
    expect(paddockWatchRelease?.categories.saves.join(" ")).toContain("settlement ecology advances to version 4");
    expect(paddockWatchRelease?.categories.saves.join(" ")).toContain("sealed version-18 Far Paddock save migrates exactly once");
    expect(paddockWatchRelease?.categories.knownLimitations.join(" ")).toContain("exactly one bounded starting-harbor working dog");
    expect(paddockWatchRelease?.categories.knownLimitations.join(" ")).toContain("not a worldwide dog population");
    expect(paddockWatchRelease?.categories.knownLimitations.join(" ")).toContain("does not attack, injure, kill, herd, breed, rescue livestock");
    expect(paddockWatchRelease?.categories.knownLimitations.join(" ")).toContain("Fox deterrence is incidental and perception-driven");
    expect(paddockWatchRelease?.categories.knownLimitations.join(" ")).toContain("no invisible protection radius");
    expect(farPaddockRelease?.categories.saves.join(" ")).toContain("outer session advances to version 18");
    expect(farPaddockRelease?.categories.saves.join(" ")).toContain("habitat analysis advances to version 9");
    expect(farPaddockRelease?.categories.saves.join(" ")).toContain("settlement ecology advances to version 3");
    expect(farPaddockRelease?.categories.knownLimitations.join(" ")).toContain("one bounded starting-harbor goat herd");
    expect(farPaddockRelease?.categories.knownLimitations.join(" ")).toContain("Guardian and herding behavior");
    expect(storehouseCopy).toContain("persistent physical fresh-produce lot");
    expect(storehouseCopy).toContain("not a second view of the settlement's abstract food economy");
    expect(storehouseCopy).toContain("existing scent owner");
    expect(storehouseCopy).toContain("wind, rain, distance, and packaging leakage");
    expect(storehouseCopy).toContain("at most one physical produce-unit loss");
    expect(storehouseCopy).toContain("existing cat's lawfully visible presence");
    expect(storehouseCopy).toContain("gains no hidden rat knowledge or investigation");
    expect(storehouseCopy).toContain("only the player's in-person report");
    expect(storehouseCopy).toContain("A secured door persists and contains scent");
    expect(storehouseCopy).toContain("directly caused or could observe");
    expect(storehouseCopy).toContain("Remote selection cannot issue the request");
    expect(storehouseCopy).toContain("no exhaustive species-by-species or animal-pair matrix is required");
    expect(storehouseRelease?.categories.saves.join(" ")).toContain("outer session advances to version 16");
    expect(storehouseRelease?.categories.saves.join(" ")).toContain("habitat analysis remains version 7");
    expect(storehouseRelease?.categories.saves.join(" ")).toContain("sealed version-15 Tidal Convergence save migrates exactly once");
    expect(storehouseRelease?.categories.saves.join(" ")).toContain("neither subtracts from nor adds to the settlement's abstract food stock");
    expect(storehouseRelease?.categories.knownLimitations.join(" ")).toContain("one bounded starting-harbor storehouse fixture");
    expect(storehouseRelease?.categories.knownLimitations.join(" ")).toContain("not worldwide settlement storage");
    expect(storehouseRelease?.categories.knownLimitations.join(" ")).toContain("No new species is added");
    expect(storehouseRelease?.categories.knownLimitations.join(" ")).toContain("harmful attack, injury, mortality, carcass, live-prey capture or consumption, fishing, reproduction, ecological migration");
    expect(storehouseRelease?.categories.knownLimitations.join(" ")).toContain("General scent fields, complete sound and evidence tracking, rumors, broad keeper schedules");
    expect(convergenceCopy).toContain("versioned activity-affordance registry");
    expect(convergenceCopy).toContain("perch/watch, low quartering, tidal wading, dabbling waterfowl, shore-water foraging, and aerial surface opportunity");
    expect(convergenceCopy).toContain("No new species or population is added");
    expect(convergenceCopy).toContain("current anonymous tidal surface activity");
    expect(convergenceCopy).toContain("shared terrain-occluded vision");
    expect(convergenceCopy).toContain("ordinary bounded air travel");
    expect(convergenceCopy).toContain("Immediate lawful threat, escape, alarm, food, guard, pursuit, retreat, and scavenging intents");
    expect(convergenceCopy).toContain("does not require a bespoke test for every species or an N-squared matrix of animal pairs");
    expect(convergenceRelease?.categories.saves.join(" ")).toContain("outer session remains version 15");
    expect(convergenceRelease?.categories.saves.join(" ")).toContain("No new save migration");
    expect(convergenceRelease?.categories.saves.join(" ")).toContain("not serialized as a second source of truth");
    expect(convergenceRelease?.categories.knownLimitations.join(" ")).toContain("closes only the bounded starting-harbor Wave-C integration seam");
    expect(convergenceRelease?.categories.knownLimitations.join(" ")).toContain("not worldwide ecology");
    expect(convergenceRelease?.categories.knownLimitations.join(" ")).toContain("full bestiary");
    expect(convergenceRelease?.categories.knownLimitations.join(" ")).toContain("harmful attack, injury, mortality, carcass, live-prey capture or consumption, fishing, reproduction, migration");
    expect(convergenceRelease?.categories.knownLimitations.join(" ")).toContain("Complete sound propagation, general scent fields, broad persistent evidence and tracking");
    expect(livingChannelCopy).toContain("North American river otter");
    expect(livingChannelCopy).toContain("version-6 population and anchor record as its exact prefix");
    expect(livingChannelCopy).toContain("silverside school, fiddler-crab area");
    expect(livingChannelCopy).toContain("anonymous aquatic-activity observation");
    expect(livingChannelCopy).toContain("shared locomotion and path resolver");
    expect(livingChannelCopy).toContain("nonlethal pressure");
    expect(livingChannelCopy).toContain("physical-item claim boundary");
    expect(livingChannelCopy).toContain("nearest 24");
    expect(livingChannelCopy).toContain("does not require a bespoke test for every species or every possible animal pair");
    expect(livingChannelRelease?.categories.saves.join(" ")).toContain("outer session advances to version 15");
    expect(livingChannelRelease?.categories.saves.join(" "))
      .toContain("sealed version-14 Between Water and Sky save migrates exactly once");
    expect(livingChannelRelease?.categories.saves.join(" "))
      .toContain("Every earlier population, habitat anchor, actor, group, aggregate unit");
    expect(livingChannelRelease?.categories.knownLimitations.join(" ")).toContain("final bounded starting-harbor Wave-C role slice");
    expect(livingChannelRelease?.categories.knownLimitations.join(" ")).toContain("not completion of Wave C");
    expect(livingChannelRelease?.categories.knownLimitations.join(" ")).toContain("worldwide ecology");
    expect(livingChannelRelease?.categories.knownLimitations.join(" ")).toContain("cannot capture or consume live prey");
    expect(livingChannelRelease?.categories.knownLimitations.join(" ")).toContain("harmful attack, injury, mortality, carcass, fishing, reproduction, migration");
    expect(livingChannelRelease?.categories.knownLimitations.join(" ")).toContain("No otter-specific call");
    expect(livingChannelRelease?.categories.knownLimitations.join(" ")).toContain("complete sound propagation");
    expect(livingChannelRelease?.categories.knownLimitations.join(" ")).toContain("new persistent track or evidence type");
    expect(tidalCopy).toContain("Atlantic-silverside school aggregate");
    expect(tidalCopy).toContain("Atlantic-marsh-fiddler-crab area aggregate");
    expect(tidalCopy).toContain("persistent snowy-egret representative");
    expect(tidalCopy).toContain("current anonymous aquatic-activity observation");
    expect(tidalCopy).toContain("nonlethal pressure and conserved avoidance");
    expect(tidalCopy).toContain("Surface dimples, brief school glints, burrow openings, and feeding scrapes");
    expect(tidalCopy).toContain("does not claim an exhaustive animal-by-animal interaction matrix");
    expect(closureCopy).toContain("canonical living species");
    expect(closureCopy).toContain("marsh fox");
    expect(closureCopy).toContain("brown-rat and southern-leopard-frog population areas");
    expect(closureCopy).toContain("neutral marsh rabbit creates no disturbance");
    expect(closureCopy).toContain("available interaction or an intentional non-response");
    expect(closureCopy).toContain("without claiming worldwide ecology");
    expect(closureCopy).toContain("visible flock estimate");
    expect(closureCopy).toContain("anonymous nearby or distant chorus");
    expect(closureRelease?.categories.saves.join(" ")).toContain("outer session remains version 12");
    expect(closureRelease?.categories.saves.join(" "))
      .toContain("No schema migration or rewrite of existing records is required");
    expect(closureRelease?.categories.saves.join(" "))
      .toContain("persist through the existing version-4 aggregate fields");
    expect(rainCopy).toContain("Habitat version 4");
    expect(rainCopy).toContain("preserves every version-3 population byte-for-byte as its exact prefix");
    expect(rainCopy).toContain("fish-crow, northern-harrier, and southern leopard-frog populations");
    expect(rainCopy).toContain("persistent individual representatives");
    expect(rainCopy).toContain("frog population units");
    expect(rainCopy).toContain("without manufacturing individual frog actors");
    expect(rainCopy).toContain("CROW-FLOCK");
    expect(rainCopy).toContain("physically reach and consume exactly one loose provision");
    expect(rainCopy).toContain("directly identifying an aerial predator");
    expect(rainCopy).toContain("neutral co-presence alone cannot fabricate that response");
    expect(rainCopy).toContain("deterministic low quartering search");
    expect(rainCopy).toContain("Immediate hunger, perceived threats, and other lawful needs retain priority");
    expect(rainCopy).toContain("more active in rain");
    expect(rainCopy).toContain("one bounded chorus from its strongest currently heard anchor");
    expect(rainCopy).toContain("versioned species runtime policy");
    expect(rainCopy).toContain("Shared invariants, capability contracts, bounded fuzzing");
    expect(rainRelease?.categories.saves.join(" ")).toContain("advances to version 12");
    expect(rainRelease?.categories.saves.join(" ")).toContain("sealed version-11 save migrates exactly once");
    expect(rainRelease?.categories.knownLimitations.join(" ")).toContain("harrier has no authored vocal cue yet");
    expect(settlementCopy).toContain("brown rats and domestic cats");
    expect(settlementCopy).toContain("population-area aggregate with no individual rat actors");
    expect(settlementCopy).toContain("free-ranging domestic cats");
    expect(settlementCopy).toContain("cats, dogs, people, or gulls");
    expect(settlementCopy).toContain("Exposed loose physical provisions");
    expect(settlementCopy).toContain("at most one rat population unit redistributes");
    expect(settlementCopy).toContain("never creates or kills a rat actor");
    expect(settlementCopy).toContain("consumes or moves the attracting provision");
    expect(settlementCopy).toContain("gnaw marks, small tracks, or shelter signs");
    expect(settlementCopy).toContain("guarded food");
    expect(settlementCopy).toContain("persistent wet pawprints");
    expect(settlementCopy).toContain("substantially crowded anchor");
    expect(settlementCopy).toContain("non-targetable environmental evidence");
    expect(settlementCopy).toContain("Rat rustles and domestic-cat calls");
    expect(settlementCopy).toContain("outcome classes, deterministic representative encounters, and bounded fuzzing");
    expect(habitatCopy).toContain("derived deterministically from the local terrain");
    expect(habitatCopy).toContain("honestly absent");
    expect(habitatCopy).toContain("represented population units");
    expect(habitatCopy).toContain("persistent herds");
    expect(habitatCopy).toContain("persistent flocks");
    expect(habitatCopy).toContain("Black bears remain solitary");
    expect(habitatCopy).toContain("nonlethal habitat-pressure displacement");
    expect(habitatCopy).toContain("shared invariants and representative deer, gull, and bear outcomes");
    expect(habitatCopy).toContain("Novel combinations remain free to emerge");
    expect(contractRelease?.categories.gameplay.join(" ")).toContain(
      "Humans, domestic dogs, deer, gulls, and black bears",
    );
    expect(contractRelease?.categories.gameplay.join(" ")).toContain(
      "share one validated versioned species catalog",
    );
    expect(wildlifeCopy).toContain("one deterministic local population patch");
    expect(wildlifeCopy).toContain("deer, gulls, and a black bear");
    expect(wildlifeCopy).toContain("shared sight and alarm observations");
    expect(wildlifeCopy).toContain("a heard alarm remains an anonymous direction");
    expect(wildlifeCopy).toContain("secure exposed food, reroute, leave, or wait");
    expect(wildlifeCopy).toContain("consume the crossing's exposed one-unit dried-fish parcel");
    expect(wildlifeCopy).toContain("WAIT AND WATCH");
    expect(wildlifeCopy).toContain("leaves the prior route intact");
    expect(wildlifeCopy).toContain("same stable actors cross between full and coarse representation");
    expect(currentCopy).not.toMatch(/complete universal perception|\blethal pursuit|worldwide populations are live/iu);
    expect(wildlifeRelease?.categories.knownLimitations.join(" ")).toContain("not a full bestiary");
    expect(wildlifeRelease?.categories.knownLimitations.join(" ")).toContain("do not attack, receive injuries, die, or leave carcasses");
    expect(allCategoryCopy("gameplay")).toContain("Stability now resolves directly");
    expect(allCategoryCopy("interface")).toContain("same pane-free field facts");
    expect(allCategoryCopy("fixes")).toContain("WebGL emissive material state");
    expect(allCategoryCopy("fixes")).toContain("separately cached sensory height field");
    expect(allCategoryCopy("interface")).toContain("continuous E/N world address");
    expect(allCategoryCopy("interface")).toContain("screen-space weather pass");
    expect(horizonCopy).toContain("cross regional horizons");
    expect(horizonCopy).toContain("Bounded five-region streaming");
    expect(limitations).toContain("not live");
    expect(limitations).toContain("infinite streaming");
    expect(limitations).toContain("complete distinct systemic language");
  });

  it("states the non-pausing field behavior without claiming a hidden time stop", () => {
    const saveCopy = allCategoryCopy("saves");
    expect(saveCopy).toContain("dispatches no simulation or save command");
    expect(saveCopy).toContain("world continues underneath");
    expect(saveCopy).not.toContain("never advances the simulation");
  });

  it("documents persistent save failure, bounded fresh retries, and recovery", () => {
    const fixes = allCategoryCopy("fixes");
    const saves = allCategoryCopy("saves");
    expect(fixes).toContain("LOCAL SAVE NOT STORED");
    expect(fixes).toContain("Quiet Hour, KIT, tutorial, and Patch Notes");
    expect(saves).toContain("bounded backoff");
    expect(saves).toContain("fresh snapshot");
    expect(saves).toContain("changes made after the failure are included");
    expect(saves).toContain("LOCAL SAVE RESTORED");
    expect(fixes).toContain("never chosen silently");
    expect(fixes).toContain("non-empty replacement seed");
    expect(fixes).toContain("stops retrying");
    expect(fixes).toContain("either configured browser-storage backend cannot be read");
    expect(fixes).toContain("unverifiable surviving copy");
    expect(fixes).toContain("LOCAL SAVE UNAVAILABLE");
    expect(fixes).toContain("disables Continue, seed creation, and restart");
    expect(saves).toContain("version and fingerprint fences");
    expect(saves).toContain("newer durable version");
    expect(saves).toContain("only the latest requested snapshot");
    expect(saves).toContain("clear this game's stored site data");
    expect(saves).toContain("partial or total backend read failure");
    expect(saves).toContain("performs no automatic retry or write");
    expect(saves).toContain("if either store cannot be read, no copy is adopted");
    expect(allCategoryCopy("knownLimitations")).toContain("largest safe integer");
  });
});
