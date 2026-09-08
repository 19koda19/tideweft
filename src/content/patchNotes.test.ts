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
      version: "0.3.3-alpha.30",
      buildIdentity: "0.3.3-alpha.30",
      gameplayContractVersion: 28,
      tutorialVersion: 40,
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

  it("scopes Beyond the Harbor and retains the earlier habitat releases", () => {
    const activeCopy = PATCH_NOTE_CATEGORIES
      .filter((category) => category !== "knownLimitations")
      .flatMap((category) => LATEST_PATCH_NOTE.categories[category])
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
    expect(activeCopy).not.toMatch(/wildlife encounters are live|procedural ladder-gated outcrops are live/iu);
    expect(activeCopy).toContain("wild boar, elk, and gray wolf");
    expect(activeCopy).toContain("SOUNDER, HERD, and PACK");
    expect(activeCopy).toContain("shared direct perception, attention, actor-owned locomotion");
    expect(activeCopy).toContain("only a solitary addressable marsh rabbit");
    expect(activeCopy).toContain("grouped elk, deer, and every other group member cannot be harmed");
    expect(activeCopy).toContain("currently perceiving it, reaching it through ordinary movement, and winning its physical claim");
    expect(activeCopy).toContain("representative emergent chains replace bespoke tests for every species or an N-squared animal-pair matrix");
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
    expect(LATEST_PATCH_NOTE.categories.saves.join(" ")).toContain("outer session advances to version 23");
    expect(LATEST_PATCH_NOTE.categories.saves.join(" ")).toContain("habitat analysis advances to version 10");
    expect(LATEST_PATCH_NOTE.categories.saves.join(" ")).toContain("core-ecology patch remains version 3");
    expect(LATEST_PATCH_NOTE.categories.saves.join(" ")).toContain("aggregate record remains version 5");
    expect(LATEST_PATCH_NOTE.categories.saves.join(" ")).toContain("catalog now contains twenty-two records");
    expect(LATEST_PATCH_NOTE.categories.saves.join(" ")).toContain("sealed version-22 What Remains save is authenticated and adopted exactly once");
    expect(LATEST_PATCH_NOTE.categories.saves.join(" ")).toContain("complete habitat-version-9 record, mortality/body state");
    expect(LATEST_PATCH_NOTE.categories.knownLimitations.join(" ")).toContain("not worldwide ecology");
    expect(LATEST_PATCH_NOTE.categories.knownLimitations.join(" ")).toContain("no tactical pack combat or group-member mortality");
    expect(LATEST_PATCH_NOTE.categories.knownLimitations.join(" ")).toContain("Dog interaction with the three new species is an intentional no-response and remains unimplemented");
    expect(LATEST_PATCH_NOTE.categories.knownLimitations.join(" ")).toContain("voice patterns are foundation-only and are not audible in play");
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
    expect(convergenceRelease?.categories.knownLimitations.join(" ")).toContain("complete 75-to-150-profile bestiary");
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
