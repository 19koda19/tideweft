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
      version: "0.3.3-alpha.22",
      buildIdentity: "0.3.3-alpha.22",
      gameplayContractVersion: 20,
      tutorialVersion: 32,
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

  it("scopes Tidal Convergence and retains the earlier habitat releases", () => {
    const activeCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => LATEST_PATCH_NOTE.categories[category])
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
    expect(activeCopy).not.toMatch(/wildlife encounters are live|procedural ladder-gated outcrops are live/iu);
    expect(activeCopy).toContain("versioned activity-affordance registry");
    expect(activeCopy).toContain("perch/watch, low quartering, tidal wading, dabbling waterfowl, shore-water foraging, and aerial surface opportunity");
    expect(activeCopy).toContain("No new species or population is added");
    expect(activeCopy).toContain("current anonymous tidal surface activity");
    expect(activeCopy).toContain("shared terrain-occluded vision");
    expect(activeCopy).toContain("ordinary bounded air travel");
    expect(activeCopy).toContain("Immediate lawful threat, escape, alarm, food, guard, pursuit, retreat, and scavenging intents");
    expect(activeCopy).toContain("does not require a bespoke test for every species or an N-squared matrix of animal pairs");
    expect(LATEST_PATCH_NOTE.categories.saves.join(" ")).toContain("outer session remains version 15");
    expect(LATEST_PATCH_NOTE.categories.saves.join(" ")).toContain("No new save migration");
    expect(LATEST_PATCH_NOTE.categories.saves.join(" ")).toContain("not serialized as a second source of truth");
    expect(LATEST_PATCH_NOTE.categories.knownLimitations.join(" ")).toContain("closes only the bounded starting-harbor Wave-C integration seam");
    expect(LATEST_PATCH_NOTE.categories.knownLimitations.join(" ")).toContain("not worldwide ecology");
    expect(LATEST_PATCH_NOTE.categories.knownLimitations.join(" ")).toContain("complete 75-to-150-profile bestiary");
    expect(LATEST_PATCH_NOTE.categories.knownLimitations.join(" ")).toContain("harmful attack, injury, mortality, carcass, live-prey capture or consumption, fishing, reproduction, migration");
    expect(LATEST_PATCH_NOTE.categories.knownLimitations.join(" ")).toContain("Complete sound propagation, general scent fields, broad persistent evidence and tracking");
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
    expect(activeCopy).not.toMatch(/complete universal perception|\blethal pursuit|worldwide populations are live/iu);
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
