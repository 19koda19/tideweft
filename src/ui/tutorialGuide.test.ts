import { describe, expect, it } from "vitest";

import {
  TIDEWEFT_TUTORIAL_GUIDE,
  TUTORIAL_CONTENT_VERSION,
  TUTORIAL_CONTROLS,
  TUTORIAL_CONTROL_IDS,
  TUTORIAL_GUIDE_SECTIONS,
  TUTORIAL_PLANNED_MECHANICS,
  TUTORIAL_SECTION_IDS,
  searchTutorialGuide,
  tutorialControlById,
  tutorialControlsForAudience,
  tutorialPageNumber,
  tutorialSectionById,
  tutorialSectionsForAudience,
} from "./tutorialGuide";

describe("TIDEWEFT field-manual content", () => {
  it("keeps one deterministic, complete page order with globally unique content IDs", () => {
    expect(TUTORIAL_GUIDE_SECTIONS.map((section) => section.id)).toEqual(TUTORIAL_SECTION_IDS);
    expect(TIDEWEFT_TUTORIAL_GUIDE.sections).toBe(TUTORIAL_GUIDE_SECTIONS);
    expect(TUTORIAL_CONTENT_VERSION).toBe(39);
    expect(TIDEWEFT_TUTORIAL_GUIDE.version).toBe(TUTORIAL_CONTENT_VERSION);

    const sectionIds = TUTORIAL_GUIDE_SECTIONS.map((section) => section.id);
    const contentIds = TUTORIAL_GUIDE_SECTIONS.flatMap((section) => [
      ...section.steps.map((step) => step.id),
      ...section.callouts.map((callout) => callout.id),
    ]);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    expect(new Set(contentIds).size).toBe(contentIds.length);
    expect(TUTORIAL_GUIDE_SECTIONS.every((section) =>
      section.title.length > 0
      && section.summary.length > 0
      && section.steps.length > 0
      && section.keywords.length > 0)).toBe(true);

    expect(tutorialPageNumber("welcome")).toBe(1);
    expect(tutorialPageNumber("build-boundaries")).toBe(TUTORIAL_SECTION_IDS.length);
    expect(tutorialPageNumber("missing")).toBe(0);
    expect(tutorialSectionById("promises")?.shortTitle).toBe("Promises");
    expect(tutorialSectionById("missing")).toBeUndefined();
  });

  it("provides a real What's New action linked to the canonical offline notes", () => {
    const whatsNew = tutorialSectionById("whats-new");
    const copy = whatsNew === undefined
      ? ""
      : [
          whatsNew.summary,
          ...whatsNew.steps.map((step) => step.body),
          ...whatsNew.callouts.map((callout) => callout.body),
        ].join(" ");

    expect(whatsNew?.shortTitle).toBe("What's New");
    expect(whatsNew?.action).toEqual({
      id: "open-patch-notes",
      label: "OPEN PATCH NOTES",
      description: expect.stringContaining("offline Patch Notes"),
    });
    expect(copy).toContain("CHANGELOG.md");
    expect(copy).toContain("A CHALLENGING HARD");
    expect(copy).toContain("dispatches no simulation or save command");
    expect(copy).toContain("world continues underneath");
    expect(copy).toContain("adds no animal, habitat, population, or actor");
    expect(copy).toContain("already pursuing a currently identified marsh rabbit");
    expect(copy).toContain("exact body physically reaches that exact rabbit");
    expect(copy).toContain("removes exactly one population unit");
    expect(copy).toContain("abstract reserve");
    expect(copy).toContain("One stable physical carcass");
    expect(copy).toContain("fox or fish crow");
    expect(copy).toContain("current lawful perception");
    expect(copy).toContain("Outer save 22 adopts one sealed version-21 world exactly once");
    expect(copy).toContain("core-ecology patch to version 3 and aggregate record to version 5");
    expect(copy).toContain("without species-by-species or N² pair testing");
    expect(copy).toContain("player, dog, human, other-animal, and group-member mortality");
    expect(copy).toContain("live-time decomposition");
  });

  it("covers every advertised control exactly once and deliberately omits tide holding", () => {
    expect(TUTORIAL_CONTROLS.map((control) => control.id)).toEqual(TUTORIAL_CONTROL_IDS);
    expect(new Set(TUTORIAL_CONTROLS.map((control) => control.id)).size).toBe(TUTORIAL_CONTROLS.length);
    expect(TUTORIAL_CONTROLS.every((control) => control.input.length > 0 && control.action.length > 0)).toBe(true);

    const referencedControls = new Set(
      TUTORIAL_GUIDE_SECTIONS.flatMap((section) => [
        ...section.controlIds,
        ...section.steps.flatMap((step) => "controlId" in step ? [step.controlId] : []),
      ]),
    );
    expect([...TUTORIAL_CONTROL_IDS].every((id) => referencedControls.has(id))).toBe(true);
    expect([...referencedControls].every((id) => tutorialControlById(id) !== undefined)).toBe(true);

    const controlCopy = TUTORIAL_CONTROLS.map((control) => `${control.input} ${control.action}`).join(" ");
    expect(controlCopy).not.toMatch(/hold tide|release tide|\bKeyP\b|^P$/iu);
    expect(tutorialControlById("tutorial-key")).toMatchObject({ input: "T", audience: "desktop" });
    expect(tutorialControlById("tutorial-button")).toMatchObject({
      input: "?",
      audience: "mobile",
      detail: expect.stringContaining("Open tutorial"),
    });
    expect(tutorialControlById("pace-buttons")).toBeUndefined();
    expect(tutorialControlById("pace-keys")).toBeUndefined();
    expect(controlCopy).not.toMatch(/\[\s*\/\s*\]|change pace|select.*pace/iu);
  });

  it("spells out the physical promise pickup and delivery flow without treating tracking as acceptance", () => {
    const promise = tutorialSectionById("promises");
    expect(promise).toBeDefined();
    const copy = [
      promise?.summary,
      ...promise?.steps.flatMap((step) => [step.title, step.body]) ?? [],
      ...promise?.callouts.flatMap((callout) => [callout.title, callout.body]) ?? [],
    ].join(" ");

    expect(copy).toContain("PICK UP");
    expect(copy).toContain("DELIVER");
    expect(copy).toContain("it does not load cargo yet");
    expect(copy).toContain("Pick up cargo here");
    expect(copy).toContain("exactly one local cargo promise");
    expect(copy).toContain("objective changes from PICK UP to DELIVER");
    expect(copy).toContain("cargo meter stays empty");
  });

  it("gives mobile its own complete route, promise, safety, action, and tutorial guidance", () => {
    const mobile = tutorialSectionsForAudience("mobile");
    const mobileCopy = mobile.flatMap((section) => [
      section.title,
      section.summary,
      ...section.steps.flatMap((step) => [step.title, step.body]),
      ...section.callouts.flatMap((callout) => [callout.title, callout.body]),
    ]).join(" ");

    expect(mobile).toHaveLength(TUTORIAL_SECTION_IDS.length);
    expect(mobileCopy).toContain("Tap open terrain");
    expect(mobileCopy).toContain("gathers it automatically on arrival");
    expect(mobileCopy).toContain("PROMISES +");
    expect(mobileCopy).toContain("PACK / MAKE / MEND");
    expect(mobileCopy).toContain("full Promises sheet");
    expect(mobileCopy).toContain("compact safety line");
    expect(mobileCopy).toContain("Press and keep holding BRACE");
    expect(mobileCopy).toContain("interrupted touch releases it automatically");
    expect(mobileCopy).toContain("place two fingers on the world and twist");
    expect(mobileCopy).toContain("cannot accidentally set a destination");
    expect(mobileCopy).toContain("always points toward world north");
    expect(mobileCopy).toContain("dedicated Tutorial control");
    expect(mobileCopy).not.toContain("Shift-click appends");
    expect(mobileCopy).not.toContain("Right-drag or Alt-drag");

    const mobileControls = tutorialControlsForAudience("mobile");
    expect(mobileControls.some((control) => control.id === "set-destination")).toBe(true);
    expect(mobileControls.some((control) => control.id === "promises-sheet")).toBe(true);
    expect(mobileControls.some((control) => control.id === "tutorial-button")).toBe(true);
    expect(mobileControls.some((control) => control.id === "kit-button")).toBe(true);
    expect(mobileControls.some((control) => control.id === "brace-button")).toBe(true);
    expect(mobileControls.some((control) => control.id === "relief-touch-orbit")).toBe(true);
    expect(mobileControls.some((control) => control.id === "relief-orbit")).toBe(false);
    expect(mobileControls.some((control) => control.id === "brace-key")).toBe(false);
  });

  it("teaches smooth desktop orbit and a truthful presentation-only compass", () => {
    const views = tutorialSectionById("views-and-hud");
    const copy = views === undefined
      ? ""
      : [
          views.summary,
          ...views.steps.map((step) => step.body),
          ...views.callouts.map((callout) => callout.body),
        ].join(" ");
    const desktopControls = tutorialControlsForAudience("desktop");

    expect(tutorialControlById("relief-orbit")?.input).toContain("J / L");
    expect(desktopControls.some((control) => control.id === "relief-orbit")).toBe(true);
    expect(desktopControls.some((control) => control.id === "relief-touch-orbit")).toBe(false);
    expect(copy).toContain("Hold J to spin the map left or L to spin it right");
    expect(copy).toContain("Chart stays north-up");
    expect(copy).toContain("always points toward world north");
    expect(copy).toContain("currents and the courier keep their actual simulation directions");
    expect(copy).toContain("few eased pixels of visual depth");
    expect(copy).toContain("changes neither the world nor where a click lands");
    expect(copy).toContain("Drizzle, rain, and squall");
    expect(copy).toContain("Sparse wind threads");
    expect(copy).toContain("traveling fronts");
  });

  it("teaches smoothed pointer travel without promising hazard shortcuts", () => {
    const movement = tutorialSectionById("movement");
    const copy = movement?.steps.flatMap((step) => [step.title, step.body]).join(" ") ?? "";

    expect(copy).toContain("steady diagonal heading");
    expect(copy).toContain("never cut through");
    expect(copy).toContain("without skipping a hazardous tile or corner");
  });

  it("teaches reports, stability causes, depth sounding, currents, sweep recovery, and field systems", () => {
    const reports = tutorialSectionById("reports");
    const water = tutorialSectionById("water-and-meters");
    const tools = tutorialSectionById("terrain-and-tools");
    const knots = tutorialSectionById("wayknots-and-harps");
    const copy = [reports, water, tools, knots].flatMap((section) => section ? [
      section.summary,
      ...section.steps.map((step) => step.body),
      ...section.callouts.map((callout) => callout.body),
    ] : []).join(" ");

    expect(copy).toContain("one-slot information journey");
    expect(copy).toContain("Signed reports · information only");
    expect(copy).toContain("disabled button says why");
    expect(copy).toContain("not stored stamina and not a gauge that keeps draining");
    expect(copy).toContain("Pace has no selector");
    expect(copy).toContain("Sparse streamlines, foam, and real water ambience");
    expect(copy).toContain("stamina or stability reaching zero");
    expect(copy).toContain("durable traversal ordinal");
    expect(copy).toContain("changes the courier's color and silhouette");
    expect(copy).toContain("Marsh stilts");
    expect(copy).toContain("Tide sail");
    expect(copy).toContain("Storm kite");
    expect(copy).toContain("Reed mat");
    expect(copy).toContain("Tide anchor");
    expect(copy).toContain("Wind knot");
    expect(copy).toContain("Tide Harp");
  });

  it("teaches hard-only automatic resume and the guarded restart phrase", () => {
    const saves = tutorialSectionById("saves-and-quiet-hour");
    const copy = saves?.steps.flatMap((step) => [step.title, step.body]).join(" ") ?? "";

    expect(copy).toContain("enters that same estuary automatically");
    expect(copy).toContain("no difficulty selector");
    expect(copy).toContain("A CHALLENGING HARD");
    expect(copy).toContain("18.000 combined-capacity floor");
    expect(copy).toContain("restartrestartrestart");
    expect(copy).toContain("only unlocks the seed field");
    expect(copy).toContain("non-empty new seed phrase");
    expect(copy).toContain("blank seed changes nothing");
    expect(copy).toContain("deterministic tide field");
    expect(copy).toContain("waits for your first tap or key");
    expect(copy).toContain("LOCAL SAVE NOT STORED");
    expect(copy).toContain("title, Quiet Hour, KIT, tutorial, or Patch Notes");
    expect(copy).toContain("bounded backoff");
    expect(copy).toContain("fresh snapshot");
    expect(copy).toContain("LOCAL SAVE RESTORED");
    expect(copy).toContain("UNREADABLE or CONFLICT");
    expect(copy).toContain("enters neither one");
    expect(copy).toContain("non-empty seed phrase is required");
    expect(copy).toContain("different or newer durable copy");
    expect(copy).toContain("blocks writes");
    expect(copy).toContain("clear Tideweft's stored site data");
    expect(copy).toContain("either configured storage backend cannot be read");
    expect(copy).toContain("copy—or absence—is authoritative");
    expect(copy).toContain("disables Continue, seed creation, and restart");
    expect(copy).toContain("performs no write");
    expect(copy).toContain("Outer save version 22");
    expect(copy).toContain("sealed version 21 Missing Goat save migrates exactly once");
    expect(copy).toContain("every earlier population, actor, group, item, Promise, home, relationship");
    expect(copy).toContain("empty ledgers are appended");
    expect(copy).toContain("cannot reroll the injury or death");
    expect(copy).toContain("Existing working-animal and domestic-recovery transitions still recover exactly once");
  });

  it("teaches live gathering, combined inventory, atomic crafting, and durable gear", () => {
    const foraging = tutorialSectionById("foraging");
    const kit = tutorialSectionById("pack-and-crafting");
    expect(foraging).toBeDefined();
    expect(kit).toBeDefined();
    const copy = [foraging, kit].flatMap((section) => section ? [
      section.summary,
      ...section.steps.map((step) => step.body),
      ...section.callouts.map((callout) => callout.body),
    ] : []).join(" ");

    expect(copy).toContain("E when its contextual action says Gather");
    expect(copy).toContain("gathers automatically on arrival, taking one whole unit");
    expect(copy).toContain("unharvestable living unit");
    expect(copy).toContain("no offline harvests");
    expect(copy).toContain("COMBINED LOAD");
    expect(copy).toContain("PACK, MAKE, and MEND");
    expect(copy).toContain("does not pause");
    expect(copy).toContain("up to 25% condition");
    expect(copy).toContain("DISMANTLE is deliberately lossy");
    expect(tutorialControlById("kit-key")).toMatchObject({ input: "I", audience: "desktop" });
    expect(tutorialControlById("make-key")).toMatchObject({ input: "C", audience: "desktop" });
  });

  it("describes one continuous seeded world without exposing storage partitions", () => {
    const tutorialCopy = JSON.stringify(TIDEWEFT_TUTORIAL_GUIDE);
    const welcome = tutorialSectionById("welcome");
    const welcomeCopy = welcome === undefined
      ? ""
      : [welcome.summary, ...welcome.steps.map((step) => step.body)].join(" ");
    const expansion = TUTORIAL_PLANNED_MECHANICS.find(
      (mechanic) => mechanic.id === "planned-regional-settlements",
    );
    const horizons = tutorialSectionById("signed-regions");
    const horizonCopy = horizons === undefined
      ? ""
      : [
          horizons.summary,
          ...horizons.steps.map((step) => step.body),
          ...horizons.callouts.map((callout) => callout.body),
        ].join(" ");

    expect(tutorialCopy).not.toMatch(/\b(?:seven|7)\s+settlements?\b/iu);
    expect(welcomeCopy).toContain("one continuous world in every direction");
    expect(welcomeCopy).toContain("original harbor country");
    expect(horizonCopy).toContain("No prompt, banner, loading screen, or second click");
    expect(horizonCopy).toContain("continuous E and N coordinates");
    expect(horizonCopy).toContain("off-network detour");
    expect(horizonCopy).toContain("same recoverable object");
    expect(horizonCopy).not.toMatch(/\bregion\b|\bchunk\b|\brecenter/u);
    expect(expansion?.clarification).toContain("continues seamlessly");
    expect(expansion?.clarification).toContain("original harbor country");
    expect(expansion?.clarification).toContain("extension of the living network");
    expect(expansion?.clarification).toContain("planned rather than cloned");
  });

  it("marks requested future systems as planned instead of claiming that they affect play", () => {
    expect(TUTORIAL_PLANNED_MECHANICS.every((mechanic) => mechanic.status === "planned")).toBe(true);
    expect(TUTORIAL_PLANNED_MECHANICS.map((mechanic) => mechanic.id)).toEqual([
      "planned-regional-settlements",
      "planned-universal-npcs",
      "planned-regional-biomes",
      "planned-magic-water-cargo",
      "planned-rocks-and-ladders",
      "planned-staged-gear-bridges",
      "planned-anywhere-upgrades",
    ]);
    const plannedCopy = TUTORIAL_PLANNED_MECHANICS
      .map((mechanic) => `${mechanic.title} ${mechanic.clarification}`)
      .join(" ");
    expect(plannedCopy).toContain("Seven stable visual biomes");
    expect(plannedCopy).toContain("One independently generated dog");
    expect(plannedCopy).toContain("one separate settlement-custodied working dog");
    expect(plannedCopy).toContain("bounded habitat-derived local assemblage");
    expect(plannedCopy).toContain("brown-rat population areas");
    expect(plannedCopy).toContain("free-ranging domestic cats");
    expect(plannedCopy).toContain("marsh rabbits");
    expect(plannedCopy).toContain("marsh foxes");
    expect(plannedCopy).toContain("fish crows");
    expect(plannedCopy).toContain("northern harrier");
    expect(plannedCopy).toContain("southern leopard-frog population area");
    expect(plannedCopy).toContain("Atlantic-silverside school aggregate");
    expect(plannedCopy).toContain("Atlantic-marsh-fiddler-crab area aggregate");
    expect(plannedCopy).toContain("at most one snowy egret");
    expect(plannedCopy).toContain("at most one American black duck");
    expect(plannedCopy).toContain("at most one habitat-supported North American river otter");
    expect(plannedCopy).toContain("one stable two-to-three-member domestic chicken flock");
    expect(plannedCopy).toContain("exactly two domestic goats in one separate herd and pen");
    expect(plannedCopy).toContain("Each chicken, goat, and dog remains an individual");
    expect(plannedCopy).toContain("Rats, frogs, silversides, and fiddler crabs");
    expect(plannedCopy).toContain("aggregate populations rather than individual actors");
    expect(plannedCopy).toContain("Additional dogs and wildlife species beyond this bounded roster");
    expect(plannedCopy).toContain("worldwide populations");
    expect(plannedCopy).toContain("only current animal mortality is the narrow direct-contact marsh-fox and individual-marsh-rabbit seam");
    expect(plannedCopy).toContain("player, dog, human, group-member, and other-animal mortality");
    expect(plannedCopy).toContain("a new guardian sound, general scent and evidence tracking");
    expect(plannedCopy).toContain("full bestiary");
    expect(plannedCopy).toContain("do not affect the courier or carried cargo yet");
    expect(plannedCopy).toContain("do not yet transform specific cargo materials");
    expect(plannedCopy).toContain("not implemented yet");
    expect(plannedCopy).toContain("do not become deployable Wayknots yet");
    expect(plannedCopy).toContain("harbor locker storage");
    expect(plannedCopy).toContain("not yet a trust-money wallet");
  });

  it("teaches the bounded wildlife crossing without claiming the full bestiary", () => {
    const people = tutorialSectionById("people-and-about");
    const copy = people === undefined
      ? ""
      : [
          people.summary,
          ...people.steps.flatMap((step) => [step.title, step.body]),
          ...people.callouts.flatMap((callout) => [callout.title, callout.body]),
        ].join(" ");

    expect(tutorialControlById("inspect-person")).toMatchObject({
      input: "Click / tap a visible person, dog, wild animal, or population sign",
      audience: "all",
    });
    expect(copy).toContain("OBSERVED");
    expect(copy).toContain("GREET");
    expect(copy).toContain("name, occupation, and home");
    expect(copy).toContain("never pauses");
    expect(copy).toContain("42 humans");
    expect(copy).toContain("ASK FOR HELP");
    expect(copy).toContain("ROUTE AROUND THIS SPOT");
    expect(copy).toContain("exactly one dried-fish unit");
    expect(copy).toContain("not ownership, training, naming, affection, or a companion bond");
    expect(copy).toContain("deer, gull, black bear, domestic cat, domestic chicken, marsh rabbit, marsh fox, fish crow, northern harrier, snowy egret, American black duck, or North American river otter");
    expect(copy).toContain("A heard animal alarm gives an uncertain direction");
    expect(copy).toContain("WAIT AND WATCH");
    expect(copy).toContain("your previous route and choice history remain unchanged");
    expect(copy).toContain("animal-consumption record");
    expect(copy).toContain("terrain and habitat derive each local population");
    expect(copy).toContain("mixed-resolution model records capacity, population pressure, and trend");
    expect(copy).toContain("bounded set of representatives");
    expect(copy).toContain("genuinely absent instead of being rerolled");
    expect(copy).toContain("deer persist in herds, gulls in flocks, and up to three fish-crow representatives in one CROW-FLOCK");
    expect(copy).toContain("one stable two-to-three-member domestic-chicken flock");
    expect(copy).toContain("exactly two domestic goats in one HERD");
    expect(copy).toContain("every bird and goat retains its own identity inside the group");
    expect(copy).toContain("at most one snowy egret, American black duck, and habitat-supported North American river otter use persistent individual identities");
    expect(copy).toContain("deterministic distance and stable identity select the nearest 24");
    expect(copy).toContain("Brown rats, southern leopard frogs, Atlantic silversides, and Atlantic marsh fiddler crabs remain conserved");
    expect(copy).toContain("Lawfully perceived predators, dogs, people, and other supported animal roles");
    expect(copy).toContain("neutral animal such as a rabbit cannot disturb one merely by being nearby");
    expect(copy).toContain("Exposed loose provisions can attract the rat area");
    expect(copy).toContain("at most one existing population unit moves");
    expect(copy).toContain("does not eat, move, or duplicate that physical parcel");
    expect(copy).toContain("One store at the starting harbor owns a persistent physical fresh-produce lot");
    expect(copy).toContain("not another view of the settlement's abstract food stock");
    expect(copy).toContain("wind, rain, distance, and packaging leakage shape what reaches the existing brown-rat aggregate");
    expect(copy).toContain("matching authenticated attraction event can remove at most one actual produce unit");
    expect(copy).toContain("existing cat's lawfully visible presence can pressure that aggregate through shared perception policy");
    expect(copy).toContain("cat gains no hidden rat knowledge or new investigation behavior");
    expect(copy).toContain("physically near both store and keeper");
    expect(copy).toContain("Closure persists and contains scent");
    expect(copy).toContain("An unseen loss does not appear in EVENTS merely because you return later");
    expect(copy).toContain("Two or three domestic chickens share one stable flock, coop, and settlement-custody relationship");
    expect(copy).toContain("Exactly two domestic goats share a different herd, pen, and custody relationship");
    expect(copy).toContain("ordinary actors using shared senses, attention, terrain movement, and broad ecological roles");
    expect(copy).toContain("One distinct domestic dog has a third custody relationship and kennel");
    expect(copy).toContain("generic working-animal assignment binds that dog and the existing keeper to the protected goat custody, herd, and pen worksite");
    expect(copy).toContain("current caused escape can physically split the herd");
    expect(copy).toContain("regroup only from fresh identified sight of its herd mate");
    expect(copy).toContain("self-preservation still wins");
    expect(copy).toContain("reporting the last known area to the guardian");
    expect(copy).toContain("not prove a find or guarantee recovery");
    expect(copy).toContain("exact goats must physically rejoin");
    expect(copy).toContain("fox is deterred only if it actually perceives the dog");
    expect(copy).toContain("walk into its structural access area, and consume one physical unit through a staged transaction");
    expect(copy).toContain("A secured store cannot become food knowledge or a claim");
    expect(copy).toContain("A goat and the working dog cannot claim that store lot");
    expect(copy).toContain("reach, current need, and stable identity settle one winner");
    expect(copy).toContain("animal event only when you directly cause or witness it");
    expect(copy).toContain("Another visible cat can make it guard that food instead");
    expect(copy).toContain("leave bounded wet pawprints");
    expect(copy).toContain("tracks appear only in current direct-detail sight");
    expect(copy).toContain("are not selectable");
    expect(copy).toContain("Gnaw marks, small tracks, and shelter signs");
    expect(copy).toContain("never reveals an exact count, hidden anchor, pressure value, cause, or individual rat identity");
    expect(copy).toContain("fish-crow double call");
    expect(copy).toContain("shared directional hearing from its actual strongest heard anchor");
    expect(copy).toContain("rain can both stir it and mask the sound");
    expect(copy).toContain("caption remains anonymous");
    expect(copy).toContain("direction unclear or all around");
    expect(copy).toContain("stereo pan is softened by that same uncertainty");
    expect(copy).toContain("northern harrier has no invented cry");
    expect(copy).toContain("Offscreen movement and hidden animal decisions");
    expect(copy).toContain("directly perceives a fox can alarm and flee");
    expect(copy).toContain("hungry marsh fox may pursue only a rabbit it currently identifies");
    expect(copy).toContain("dog or black bear can become the more urgent pressure");
    expect(copy).toContain("exact physical contact between that current pursuer and that exact rabbit");
    expect(copy).toContain("One stable physical carcass remains at the death place");
    expect(copy).toContain("fox or fish crow must lawfully see and physically reach that same body");
    expect(copy).toContain("finding a body later does not tell you who killed it");
    expect(copy).toContain("SMALL ANIMAL or UNKNOWN CANID");
    expect(copy).toContain("approximate visible form, morph, life stage, condition, and current behavior");
    expect(copy).toContain("never reveals a hidden statistic, private target, population pressure, or habitat calculation");
    expect(copy).toContain("movement can leave paired tracks");
    expect(copy).toContain("movement can leave canid pawprints");
    expect(copy).toContain("saved sign stays at that movement site");
    expect(copy).toContain("is not selectable or usable as a remote locator");
    expect(copy).toContain("Rat, frog, silverside, and fiddler-crab sign ABOUT is close-only because a population sign is not an actor");
    expect(copy).toContain("standable shallow water");
    expect(copy).toContain("remaining saved intent to physiology");
    expect(copy).toContain("ages existing perception without adding facts");
    expect(copy).toContain("one indivisible materialization-cap unit");
    expect(copy).toContain("exact group member beyond the current frame receives no local observation or locomotion input");
    expect(copy).toContain("conserves 64–72 units across no more than three saved wetland anchors");
    expect(copy).toContain("Weather alone cannot create, kill, duplicate, or reroll frogs");
    expect(copy).toContain("one conserved non-addressable school aggregate");
    expect(copy).toContain("one conserved non-addressable area aggregate");
    expect(copy).toContain("Fish evacuate a drying anchor into saved wet refuge immediately");
    expect(copy).toContain("Surface dimples, brief school glints, burrow openings, and feeding scrapes");
    expect(copy).toContain("shared vision gives it a current anonymous AQUATIC ACTIVITY observation");
    expect(copy).toContain("only then can shared locomotion carry it toward that observed edge");
    expect(copy).toContain("cannot capture, injure, kill, consume, create a carcass, or implement fishing");
    expect(copy).toContain("two saved dabbling-water destinations, and one dry refuge");
    expect(copy).toContain("FLOATING, WATER SCAN, DABBLING, RESTING, SURFACE SWIMMING, or RELOCATION FLIGHT");
    expect(copy).toContain("Relocation from refuge uses bounded air travel");
    expect(copy).toContain("movement already on water selects surface-water travel through the shared traversability and path resolver");
    expect(copy).toContain("reusable capability-driven ecology seam rather than adding a duck-only detection or pathing system");
    expect(copy).toContain("one saved water-foraging place, and one distinct dry shore haulout");
    expect(copy).toContain("Shared amphibious locomotion—not an otter-only pathfinder");
    expect(copy).toContain("Its broad roles can create nonlethal fish or crab pressure");
    expect(copy).toContain("common physical-item claim resolver can settle one loose-food contest without cloning the item");
    expect(copy).toContain("None of this is a live-prey capture or meal, harmful attack, injury, death, carcass, fishing, call, or track-evidence system");
    expect(copy).toContain("perch/watch, low-quartering, tidal-wader, dabbling-waterfowl, shore-water-forager, and aerial-surface-opportunist profiles");
    expect(copy).toContain("The gull is the aerial surface opportunist");
    expect(copy).toContain("It does not swim, wade, aquatic-forage, capture prey, or inherit another profile's powers");
    expect(copy).toContain("Any immediate lawful threat, escape, alarm, food, guard, pursuit, retreat, or scavenging intent outranks this neutral routine");
    expect(copy).toContain("deterministic low quartering search");
    expect(copy).toContain("only a crow actually mobbing it becomes pressure that can break the pursuit");
    expect(copy).toContain("At rest time, crows seek authenticated habitat perches");
    expect(copy).toContain("danger and immediate needs still take priority");
    expect(copy).toContain("nonlethal player-absent aftermath");
    expect(copy).toContain("no harm or cargo interaction");
    expect(copy).toContain("only harmful animal contact in this build is a current identified marsh fox physically reaching its exact pursued marsh rabbit");
    expect(copy).toContain("Player, dog, human, other-animal, and social-group-member mortality remain absent");
    expect(copy).toContain("Population recovery, live-time decomposition, body drift, dragging, harvesting, carcass scent and insects");
    expect(copy).toContain("complete sound, general scent and evidence tracking");
    expect(copy).toContain("foliage consumption");
    expect(copy).toContain("complete circadian behavior");
    expect(copy).toContain("further species");
    expect(copy).toContain("worldwide populations and storehouses, and the full bestiary");
    expect(copy).toContain("bounded Wave-D flock, herd, working-animal, and missing-livestock recovery slices remain one integration");
    expect(copy).toContain("role, perception, movement, group, aggregate, tide, physical-item, plural-custody, typed-home, working-assignment, recovery, mortality, body, and presentation contracts");
    expect(copy).toContain("does not create storage, livestock, recovery, or animal ecology in every settlement or distant region");
    expect(copy).toContain("guardian search can fail or defer and never proves an animal was found");
    expect(copy).toContain("instead of requiring a species-by-species or N² pair matrix");
    expect(copy).not.toMatch(/exact (?:trust|fear|emotion).*(?:number|percentage)/iu);
  });

  it("teaches the current mortality adoption without rewriting older ecology", () => {
    const saves = tutorialSectionById("saves-and-quiet-hour");
    const copy = saves?.steps.map((step) => step.body).join(" ") ?? "";
    expect(copy).toContain("Outer save version 22 preserves habitat version 9");
    expect(copy).toContain("core-ecology patch version 3");
    expect(copy).toContain("aggregate ecology record version 5");
    expect(copy).toContain("settlement ecology version 4");
    expect(copy).toContain("working-animal state version 2");
    expect(copy).toContain("authoritative mortality, population-reserve, and physical-body ledgers");
    expect(copy).toContain("sealed version 21 Missing Goat save migrates exactly once");
    expect(copy).toContain("empty ledgers are appended");
    expect(copy).toContain("one-unit population consequence");
    expect(copy).toContain("stable carcass");
    expect(copy).toContain("cannot reroll the injury or death");
    expect(copy).toContain("resurrect the retired actor");
    expect(copy).toContain("restore consumed resource");
    expect(copy).toContain("Existing working-animal and domestic-recovery transitions still recover exactly once");
  });

  it("supports stable lookup and deterministic topic search", () => {
    expect(searchTutorialGuide("")).toEqual(TUTORIAL_GUIDE_SECTIONS);
    expect(searchTutorialGuide("  MAGIC   WATER  ").map((section) => section.id)).toEqual([
      "cargo-care",
      "build-boundaries",
    ]);
    expect(searchTutorialGuide("signed report").map((section) => section.id)).toContain("reports");
    expect(searchTutorialGuide("Shift-click", "mobile")).toEqual([]);
    expect(searchTutorialGuide("PROMISES +", "mobile").map((section) => section.id)).toEqual([
      "promises",
      "views-and-hud",
      "accessibility",
    ]);
    expect(searchTutorialGuide("right-drag", "desktop").map((section) => section.id)).toContain("views-and-hud");
  });
});
