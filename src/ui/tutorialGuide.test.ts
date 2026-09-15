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
    expect(TUTORIAL_CONTENT_VERSION).toBe(60);
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
    expect(whatsNew?.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "whats-new-many-rhythms",
        title: "Many rhythms",
      }),
    ]));
    expect(whatsNew?.action).toEqual({
      id: "open-patch-notes",
      label: "OPEN PATCH NOTES",
      description: expect.stringContaining("offline Patch Notes"),
    });
    expect(copy).toContain("CHANGELOG.md");
    expect(copy).toContain("A CHALLENGING HARD");
    expect(copy).toContain("never advances simulation or starts a save");
    expect(copy).toContain("world continues underneath");
    expect(copy).toContain("opening the notes first cancels that transient action at its committed boundary");
    expect(copy).toContain("Alpha 50 · Many Rhythms is a local unpublished source candidate");
    expect(copy).toContain("exactly covers all seventeen current wildlife activity profiles");
    expect(copy).toContain("Fish crow, northern harrier, American black duck, gull, golden eagle, harbor seal, great blue heron, common tern, osprey, greater yellowlegs, belted kingfisher, double-crested cormorant, seaside sparrow, and diamondback terrapin retain day-active base clocks");
    expect(copy).toContain("North American river otter remains night-active");
    expect(copy).toContain("snowy egret remains adaptive to clock, tide, and current lawful opportunity");
    expect(copy).toContain("marsh rabbit remains twilight-active");
    expect(copy).toContain("American black duck also composes current weather");
    expect(copy).toContain("qualifying ordinary rain may activate it outside its base clock window");
    expect(copy).toContain("dangerous storm drives physical travel to and rest at its authenticated refuge");
    expect(copy).toContain("duck, river otter, greater yellowlegs, and diamondback terrapin keep clock-based wake policy");
    expect(copy).toContain("action and destination projections remain tide- and depth-responsive only where dabbling water, foraging water, wading ground, or wet margin is physically usable");
    expect(copy).toContain("Tide does not independently wake them");
    expect(copy).toContain("dry terrapin margin remains an awake tide wait rather than falsely presenting rest");
    expect(copy).toContain("thirteen formerly bounded day-window profiles");
    expect(copy).toContain("circadian-activity capability");
    expect(copy).toContain("circadian-routine scope");
    expect(copy).toContain("All twelve reusable activity archetypes");
    expect(copy).toContain("existing authenticated perch, refuge, habitat anchor, wading ground, haulout, or cover");
    expect(copy).toContain("already-declared air, amphibious, surface-water-capable, or land locomotion");
    expect(copy).toContain("Transit remains Awake");
    expect(copy).toContain("physical arrival alone permits Resting");
    expect(copy).toContain("shared settling interval alone permits Asleep");
    expect(copy).toContain("STARTLED response, current danger, lawful disturbance, urgent needs, and retained commitments still win");
    expect(copy).toContain("No profile receives a private scheduler, detector, pathfinder, or teleport");
    expect(copy).toContain("routine travel mints no unsupported track evidence, food, feeding result, target, knowledge, or choice");
    expect(copy).toContain("Direct inspection may show only a lawfully observed current activity or posture");
    expect(copy).toContain("Southern leopard frog separately remains a real non-addressable rain-responsive aggregate");
    expect(copy).toContain("rain can raise its lawful activity and chorus while masking hearing");
    expect(copy).toContain("no individual frog actor, destination, posture, or circadian binding is fabricated");
    expect(copy).toContain("No species, actor, population unit, habitat allocation, encounter density, item, cargo, attack, mortality path, or reward is added");
    expect(copy).toContain("Outer save version 32, RegionalEcologyStateV6, and wildlife actor schema/version 1 remain unchanged");
    expect(copy).toContain("current catalog derives rhythm and cadence from the shared binding registry");
    expect(copy).toContain("frozen Alpha 32 through Alpha 39 catalogs retain their exact historical bytes and hashes");
    expect(copy).toContain("existing optional wildlife circadian receipt remains unchanged");
    expect(copy).toContain("legacy absence remains valid");
    expect(copy).toContain("full detail reauthenticates current body and destination before use");
    expect(copy).toContain("coarse absence may conserve only an already committed bounded rest bout without inventing travel or decisions");
    expect(copy).toContain("exact seventeen-profile boundary is not all forty-five wildlife profiles");
    expect(copy).toContain("complete driver coverage");
    expect(copy).toContain("validated broad coarse-time advancement");
    expect(copy).toContain("complete autonomous animal life");
    expect(copy).toContain("Turning Day closure");
    expect(copy).toContain("has not been pushed, published, deployed, run through remote CI or Pages, or LIVE_VERIFIED");
    expect(copy).toContain("Alpha 39 remains the latest verified public release");
  });

  it("describes shared outdoor light without claiming unfinished Turning Day systems", () => {
    const views = tutorialSectionById("views-and-hud");
    const copy = views?.steps.map((step) => `${step.title} ${step.body}`).join(" ") ?? "";
    const boundaries = tutorialSectionById("build-boundaries");
    const liveBoundary = boundaries?.steps.find((step) => step.id === "boundaries-live-weather");
    expect(copy).toContain("One clock carries first light into night");
    expect(copy).toContain("every 1,440 ticks begins a new day");
    expect(copy).toContain(
      "completed beacon projects light nearby unobstructed ground and blue water after dusk",
    );
    expect(copy).toContain("WAIT 10 MIN, REST 30 MIN, and settlement SLEEP TO DAWN all advance this same clock");
    expect(copy).toContain("settlement working dog and food-store keeper retain their shared-clock routines");
    expect(copy).toContain("All seventeen current wildlife activity profiles now use the same arrival-gated routine contract");
    expect(copy).toContain("fourteen retain day-active base clocks");
    expect(copy).toContain("North American river otter is night-active");
    expect(copy).toContain("snowy egret is adaptive to clock, tide, and lawful opportunity");
    expect(copy).toContain("marsh rabbit is twilight-active");
    expect(copy).toContain("Qualifying ordinary rain can activate American black duck outside its base clock window");
    expect(copy).toContain("dangerous storm drives it toward authenticated refuge and rest");
    expect(copy).toContain("duck, otter, greater yellowlegs, and diamondback terrapin keep clock-based wake policy");
    expect(copy).toContain("tide does not independently wake them");
    expect(copy).toContain("Southern leopard frog separately remains a weather-responsive aggregate");
    expect(copy).toContain(
      "Wildlife outside those seventeen profiles, remaining humans, the independent dog, bonded/player companions, broader driver coverage, and validated broad coarse-time advancement remain later",
    );
    expect(liveBoundary?.title).toBe("Present in this source candidate");
    expect(liveBoundary?.body).toContain("Alpha 39 Saltmarsh Small Worlds is the released LIVE_VERIFIED biodiversity checkpoint");
    expect(liveBoundary?.body).toContain("All seventeen current declared wildlife activity profiles share the arrival-gated living-circadian routine contract");
    expect(liveBoundary?.body).toContain("fourteen retain day-active base clocks");
    expect(liveBoundary?.body).toContain("North American river otter is night-active");
    expect(liveBoundary?.body).toContain("snowy egret is adaptive to clock, tide, and lawful opportunity");
    expect(liveBoundary?.body).toContain("marsh rabbit is twilight-active");
    expect(liveBoundary?.body).toContain("Qualifying rain can activate the American black duck beyond its base clock window");
    expect(liveBoundary?.body).toContain("dangerous storm drives authenticated refuge and rest");
    expect(liveBoundary?.body).toContain("Duck, otter, greater yellowlegs, and terrapin keep clock-based wake policy");
    expect(liveBoundary?.body).toContain("actions and destinations remain tide- and depth-responsive where physically usable");
    expect(liveBoundary?.body).toContain("Each of the seventeen bound wildlife profiles may use the existing optional wildlife circadian receipt");
    expect(liveBoundary?.body).toContain("Raw parsing preserves canonical receipt data without proving current location or refuge");
    expect(liveBoundary?.body).toContain("Coarse absence conserves an already committed bounded rest bout without inventing travel or decisions");
    expect(liveBoundary?.body).toContain("current catalog derives rhythm and cadence from the binding registry while exact Alpha 32 through Alpha 39 historical catalogs remain unchanged");
    expect(liveBoundary?.body).toContain("Alpha 50 Many Rhythms remains a local unpublished source candidate");
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
    expect(tutorialControlById("wait-button")).toMatchObject({
      input: "WAIT 10 MIN",
      audience: "all",
      action: expect.stringContaining("exactly ten displayed minutes"),
      detail: expect.stringContaining("committed step"),
    });
    expect(tutorialControlById("recovery-button")).toMatchObject({
      input: "REST 30 MIN / SLEEP TO DAWN",
      audience: "all",
      action: expect.stringContaining("ordinary elapsed world time"),
      detail: expect.stringContaining("Cancel or Wake"),
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
    expect(mobileCopy).toContain("WAIT 10 MIN");
    expect(mobileCopy).toContain("SLEEP TO DAWN");
    expect(mobileCopy).toContain("dedicated Tutorial control");
    expect(mobileCopy).not.toContain("Shift-click appends");
    expect(mobileCopy).not.toContain("Right-drag or Alt-drag");

    const mobileControls = tutorialControlsForAudience("mobile");
    expect(mobileControls.some((control) => control.id === "set-destination")).toBe(true);
    expect(mobileControls.some((control) => control.id === "promises-sheet")).toBe(true);
    expect(mobileControls.some((control) => control.id === "tutorial-button")).toBe(true);
    expect(mobileControls.some((control) => control.id === "kit-button")).toBe(true);
    expect(mobileControls.some((control) => control.id === "brace-button")).toBe(true);
    expect(mobileControls.some((control) => control.id === "wait-button")).toBe(true);
    expect(mobileControls.some((control) => control.id === "recovery-button")).toBe(true);
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
    expect(copy).toContain("REST on the pace readout");
    expect(copy).toContain("rather than starting the separate REST 30 MIN recovery action");
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
    expect(copy).toContain("Outer save version 32");
    expect(copy).toContain("RegionalEcologyStateV6");
    expect(copy).toContain("sealed outer-version-29 Alpha-36 save is authenticated and adopted exactly once into version 30");
    expect(copy).toContain("exact RegionalEcologyStateV5 Alpha-36 child");
    expect(copy).toContain("complete RegionalEcologyStateV5 child and original outer integrity remain the adoption witness");
    expect(copy).toContain("without rewriting, renumbering, redistributing, retiring, or relabeling any base, Alpine, polar-shore, cold-shore, or polar-consumer wildlife");
    expect(copy).toContain("All six ecology layers enter one deterministic group-atomic materialization and conservation commit capped at 24 addressable actors");
    expect(copy).toContain("cannot reroll a regional, Alpine, polar-shore, cold-shore, polar-consumer, or breadth lineage");
    expect(copy).toContain("Pristine signed-region, Alpine, polar-shore, cold-shore, polar-consumer, and breadth baselines are rederived instead of saved");
    expect(copy).toContain("Alpha-35 adoption, Alpha-36 adoption, working-animal transition, and domestic recovery remain exact and cannot replay");
  });

  it("distinguishes bounded WAIT, durable recovery, and zero-time Quiet Hour", () => {
    const saves = tutorialSectionById("saves-and-quiet-hour");
    const waitStep = saves?.steps.find((step) => step.id === "saves-wait-ten-minutes");
    const recoveryStep = saves?.steps.find((step) => step.id === "saves-rest-and-sleep");
    const boundaries = tutorialSectionById("build-boundaries");
    const liveBoundary = boundaries?.steps.find((step) => step.id === "boundaries-live-weather");
    const plannedBoundary = boundaries?.steps.find((step) => step.id === "boundaries-planned-ecology");

    expect(saves).toMatchObject({
      title: "Wait, recover, or stop without holding the world",
      shortTitle: "Time & saves",
    });
    expect(saves?.controlIds).toContain("wait-button");
    expect(saves?.controlIds).toContain("recovery-button");
    expect(waitStep).toMatchObject({
      audience: "all",
      controlId: "wait-button",
    });
    expect(waitStep?.body).toContain("advance exactly ten displayed minutes");
    expect(waitStep?.body).toContain("stop any current charted route or pending arrival action");
    expect(waitStep?.body).toContain("same authoritative world simulation and fixed-step rules as ordinary play");
    expect(waitStep?.body).toContain("Weather, tides, cargo, actors, Promises, deadlines, and every applicable hazard continue");
    expect(waitStep?.body).toContain("no special healing or replenishment");
    expect(waitStep?.body).toContain("button shows Cancel · plus the remaining minutes");
    expect(waitStep?.body).toContain("current sweep, physical mishap, or lawfully perceived strong disturbance");
    expect(waitStep?.body).toContain("Cancellation or disturbance takes effect at a committed fixed-step boundary");
    expect(waitStep?.body).toContain("every completed step, elapsed minute, and consequence remains part of the world");
    expect(waitStep?.body).toContain("Leaving the foreground ends the transient wait and saves completed state");
    expect(waitStep?.body).toContain("loading returns explicit control instead of resuming it");
    expect(waitStep?.body).toContain("WAIT is neither recovery nor pause");
    expect(waitStep?.body).toContain("title and Quiet Hour stop simulation");
    expect(waitStep?.body).toContain("REST and SLEEP use the separate recovery control");
    expect(waitStep?.body).toContain("actor ABOUT choice's WAIT AND WATCH");
    expect(waitStep?.body).toContain("only stops the current automatic route briefly");
    expect(recoveryStep).toMatchObject({
      audience: "all",
      controlId: "recovery-button",
    });
    expect(recoveryStep?.body).toContain("stable dry footing with stamina below full");
    expect(recoveryStep?.body).toContain("exactly three hundred ordinary fixed steps");
    expect(recoveryStep?.body).toContain("first 06:00 dawn after it begins");
    expect(recoveryStep?.body).toContain("storm blocks or interrupts sleep");
    expect(recoveryStep?.body).toContain("never forces it");
    expect(recoveryStep?.body).toContain("Cancel or Wake");
    expect(recoveryStep?.body).toContain("physical incident, or qualifying current lawful disturbance");
    expect(recoveryStep?.body).toContain("broad terrain remains readable but exact actors, items, labels, interactions, and unseen events do not become player knowledge");
    expect(recoveryStep?.body).toContain("in-progress REST or SLEEP is saved in outer version 32");
    expect(recoveryStep?.body).toContain("resumes after reload");
    expect(recoveryStep?.body).toContain("hidden or closed app advances nothing");
    expect(saves?.steps.find((step) => step.id === "saves-quiet-hour")?.body).toContain(
      "Save & return",
    );
    expect(saves?.steps.find((step) => step.id === "saves-quiet-hour")?.body).toContain(
      "does not perform REST or SLEEP and advances no world time",
    );
    expect(liveBoundary?.body).toContain("a bounded ten-displayed-minute player WAIT");
    expect(liveBoundary?.body).toContain("thirty-minute REST");
    expect(liveBoundary?.body).toContain("settlement-anchored SLEEP TO DAWN");
    expect(plannedBoundary?.body).not.toContain("player sleep/wait");
    expect(plannedBoundary?.body).not.toContain("player WAIT");
    expect(plannedBoundary?.body).not.toContain("player REST and SLEEP");
    expect(plannedBoundary?.body).toContain("validated broad coarse-time advancement");
    expect(plannedBoundary?.body).toContain("parity/performance proof");
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
    expect(expansion?.clarification).toContain("Generated distant settlements, humans, dogs, Promise economies, causal finds");
    expect(expansion?.clarification).toContain("extension of living-network services");
    expect(expansion?.clarification).toContain("planned rather than cloned");
    expect(expansion?.clarification).toContain("Bounded signed-region wildlife already appears only where authenticated habitat supports it");
    expect(expansion?.clarification).toContain("does not imply seamless actor migration between regions");
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
    expect(plannedCopy).toContain("independent porter-scene dog");
    expect(plannedCopy).toContain("settlement working dog");
    expect(plannedCopy).toContain("bounded domestic groups");
    expect(plannedCopy).toContain("current forty-seven-record catalog contains exactly forty-five core-wildlife profiles plus the separate human and domestic-dog foundations");
    expect(plannedCopy).toContain("conserved eastern-saltmarsh-mosquito and marsh-periwinkle aggregates");
    expect(plannedCopy).toContain("one group-atomic seaside-sparrow flock");
    expect(plannedCopy).toContain("one solitary diamondback terrapin");
    expect(plannedCopy).toContain("Sparrow admission depends on the local mosquito substrate and terrapin admission on periwinkle");
    expect(plannedCopy).toContain("regional quiet preserve honest absence");
    expect(plannedCopy).toContain("Worldwide ecology");
    expect(plannedCopy).toContain("The only current animal mortality remains exact contact by a marsh fox, gray wolf, or cougar");
    expect(plannedCopy).toContain("final cohort adds no bites, disease, capture, consumption, mortality, body, player harm, dog harm, or human harm");
    expect(plannedCopy).toContain("general scent and evidence tracking");
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
    expect(copy).toContain("deer, gull, black bear, domestic cat, marsh rabbit, marsh fox, fish crow, northern harrier, snowy egret, American black duck, North American river otter, wild boar, elk, gray wolf, cougar, brown bear");
    expect(copy).toContain("great blue heron, common tern, osprey, greater yellowlegs, belted kingfisher, double-crested cormorant");
    expect(copy).toContain("Atlantic-ghost-crab sign, Atlantic-menhaden school sign, mummichog sign, grass-shrimp sign, or blue-crab sign");
    expect(copy).toContain("A heard animal alarm gives an uncertain direction");
    expect(copy).toContain("WAIT AND WATCH");
    expect(copy).toContain("your previous route and choice history remain unchanged");
    expect(copy).toContain("animal-consumption record");
    expect(copy).toContain("terrain and habitat derive each local population");
    expect(copy).toContain("mixed-resolution model records capacity, population pressure, and trend");
    expect(copy).toContain("bounded set of representatives");
    expect(copy).toContain("genuinely absent instead of being rerolled");
    expect(copy).toContain("deer, elk, and mountain goats persist in herds; gulls, fish crows, common terns, greater yellowlegs, double-crested cormorants, and seaside sparrows in flocks; wild boar in sounders; and gray wolves in packs");
    expect(copy).toContain("one stable two-to-three-member domestic-chicken flock");
    expect(copy).toContain("exactly two domestic goats in one herd");
    expect(copy).toContain("these are homes and relationships, not wild habitat populations");
    expect(copy).toContain("Snowy egrets, American black ducks, and habitat-supported North American river otters also use persistent individual identities");
    expect(copy).toContain("One global group-atomic plan selects the nearest 24 eligible individuals across every active base, Alpine, polar-shore, cold-shore, polar-consumer, and breadth ecology owner");
    expect(copy).toContain("Alpha-30/31's one remote source remains only as sealed compatibility history");
    expect(copy).toContain("Eligible boar form a SOUNDER, elk a HERD, and wolves a PACK, while cougar and brown bear remain solitary");
    expect(copy).toContain("currently identified solitary addressable marsh rabbit can enter today's exact-contact mortality transaction");
    expect(copy).toContain("Grouped elk, grouped deer, and every other social-group member cannot be injured or killed");
    expect(copy).toContain("Brown bear has no live-prey pursuit or harmful contact");
    expect(copy).toContain("boar, wolf, cougar, or brown bear may scavenge an existing body only after seeing it, reaching it, and winning the conserved physical claim");
    expect(copy).toContain("Brown rats, southern leopard frogs, Atlantic silversides, Atlantic marsh fiddler crabs, American pikas, Atlantic capelin, bay anchovies, Atlantic ghost crabs, Atlantic menhaden, mummichog, grass shrimp, blue crabs, eastern saltmarsh mosquitoes, and marsh periwinkles remain conserved");
    expect(copy).toContain("separate sparse Alpine ecology layer leaves the exact signed-region base untouched");
    expect(copy).toContain("Mountain goats form one persistent group-atomic HERD");
    expect(copy).toContain("grade-aware ridge footing");
    expect(copy).toContain("solitary golden eagle uses the shared aerial activity owner");
    expect(copy).toContain("authenticated ridge soaring and perching lines");
    expect(copy).toContain("American pikas remain one conserved non-addressable talus aggregate");
    expect(copy).toContain("visible only through nearby haypiles or talus signs");
    expect(copy).toContain("currently visible eagle can create role-based predator pressure");
    expect(copy).toContain("an occluding ridge prevents that knowledge and response");
    expect(copy).toContain("captures no pika, selects no exact pika target, creates no body, and causes no injury or death");
    expect(copy).toContain("separate sparse addressable cold-shore sibling leaves the exact polar-shore forage owner untouched");
    expect(copy).toContain("one solitary Arctic fox only where viable cold dry ground and the exact already-admitted Atlantic-capelin substrate coincide");
    expect(copy).toContain("shared identity, senses, attention, condition, locomotion, dormant, and evidence rules");
    expect(copy).toContain("lawfully perceives a domestic dog, generic pressure can make it flee or retreat");
    expect(copy).toContain("no fox-specific dog detector or invisible protection radius");
    expect(copy).toContain("currently sees anonymous capelin activity");
    expect(copy).toContain("occluding landform removes both observation and response");
    expect(copy).toContain("No exact fish exists to be targeted, caught, or consumed");
    expect(copy).toContain("Chart, Relief, quick inspection, and ABOUT reveal only current lawful actor or small-canid evidence detail");
    expect(copy).toContain("separate sparse polar-consumer sibling depends on the exact existing capelin-backed cold saline shore");
    expect(copy).toContain("authoritative foraging water and a distinct dry haulout");
    expect(copy).toContain("rarer solitary polar bear is eligible only after that exact seal candidate exists");
    expect(copy).toContain("seal apply conserved nonlethal pressure to capelin");
    expect(copy).toContain("bear pursue while the seal flees");
    expect(copy).toContain("occluding landform removes both actors' knowledge and response");
    expect(copy).toContain("not capture, kill, consumption, injury, mortality, a body, or a resource");
    expect(copy).toContain("append-only breadth owner admits its first five-profile cohort");
    expect(copy).toContain("Bay anchovies occupy up to four authenticated schooling-water anchors as one conserved aggregate");
    expect(copy).toContain("Atlantic ghost crabs occupy up to four suitable tidal-flat anchors as another");
    expect(copy).toContain("Current Tide Table depth makes submerged anchovy activity and exposed-flat ghost-crab signs available");
    expect(copy).toContain("Great blue heron and osprey remain solitary persistent actors");
    expect(copy).toContain("common terns form one indivisible flock of two to four");
    expect(copy).toContain("all three bird populations require the exact local anchovy substrate");
    expect(copy).toContain("regional-quiet gate can leave suitable-looking regions empty");
    expect(copy).toContain("this cohort is not camera- or start-centered");
    expect(copy).toContain("heron uses one authenticated tide-depth-safe wading ground");
    expect(copy).toContain("terns and ospreys reuse air-only surface-opportunity and rest behavior");
    expect(copy).toContain("Breadth epoch 2 appends Atlantic menhaden, mummichog, grass shrimp, blue crab, greater yellowlegs, belted kingfisher, and double-crested cormorant");
    expect(copy).toContain("Yellowlegs form one two-to-four-member group-atomic flock");
    expect(copy).toContain("kingfisher is solitary");
    expect(copy).toContain("cormorants form one two-to-three-member group-atomic flock");
    expect(copy).toContain("Yellowlegs require the exact local grass-shrimp substrate");
    expect(copy).toContain("One clear cormorant can create bounded nonlethal pressure on menhaden");
    expect(copy).toContain("a ridge removes the observation and response");
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
    expect(copy).toContain("That one settlement-custodied working dog uses the shared day-active circadian policy");
    expect(copy).toContain("travels physically through ordinary terrain movement to the actual kennel in its custody");
    expect(copy).toContain("stays awake without restorative physiology until arrival");
    expect(copy).toContain("At the kennel it can become Resting and then Asleep");
    expect(copy).toContain("wakes at its stable-ID active boundary");
    expect(copy).toContain("urgent needs and self-preservation, and retained investigation or return work still outrank the neutral routine");
    expect(copy).toContain("directly visible ABOUT inspection may say Resting or Asleep");
    expect(copy).toContain("never reveals schedule timing, phase offset, wake threshold, stable identity, destination ID, custody, or assignment internals");
    expect(copy).toContain("That Alpha45 dog adapter itself does not change the independent porter-scene dog or create a bonded/player companion, human schedule, player REST, or player SLEEP");
    expect(copy).toContain("existing starting-harbor food-store keeper uses the same day-active routine architecture");
    expect(copy).toContain("authoritative settlement as a bounded home-rest anchor");
    expect(copy).toContain("Resting and then Asleep only while that exact resident is physically at home and free of a Promise contract");
    expect(copy).toContain("non-neutral porter response, storm, urgent needs, and qualifying current strong sensory evidence outrank rest");
    expect(copy).toContain("An asleep keeper gains no new visual observations");
    expect(copy).toContain("shared hearing and scent can still provide lawful wake evidence");
    expect(copy).toContain("Exhaustion and rest need recover only from the authenticated home posture");
    expect(copy).toContain("creates no house, bed, interior path, shop hours, autonomous commute, every-human routine, or player REST/SLEEP action");
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
    expect(copy).toContain("fox, fish crow, wild boar, gray wolf, cougar, or brown bear must lawfully see and physically reach that same body");
    expect(copy).toContain("finding a body later does not tell you who killed it");
    expect(copy).toContain("SMALL ANIMAL, UNKNOWN CANID, UNKNOWN SMALL CANID, UNKNOWN LARGE CAT, AQUATIC MAMMAL, or LARGE BEAR");
    expect(copy).toContain("approximate visible form, morph, life stage, condition, and current behavior");
    expect(copy).toContain("never reveals a hidden statistic, private target, population pressure, or habitat calculation");
    expect(copy).toContain("movement can leave paired tracks");
    expect(copy).toContain("movement can leave canid pawprints");
    expect(copy).toContain("saved sign stays at that movement site");
    expect(copy).toContain("is not selectable or usable as a remote locator");
    expect(copy).toContain("Aggregate signs, including mosquito and periwinkle evidence, are close-only because a population sign is not an actor");
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
    expect(copy).toContain("shared adaptive-active routine combines the one civil clock with current authoritative tide");
    expect(copy).toContain("current anonymous AQUATIC ACTIVITY learned through shared vision");
    expect(copy).toContain("usable wading edge or lawful opportunity can favor activity");
    expect(copy).toContain("physically returns to refuge, becomes Resting only after arrival");
    expect(copy).toContain("Immediate danger, urgent needs, and retained commitments still win");
    expect(copy).toContain("cannot capture, injure, kill, consume, create a carcass, or implement fishing");
    expect(copy).toContain("stable individual twilight-active clock and shared ground-cover-forager activity");
    expect(copy).toContain("bounded deterministic local foraging area on explicit land paths");
    expect(copy).toContain("physically seeks its authenticated habitat cover");
    expect(copy).toContain("not proof of food, feeding, a burrow, or a den");
    expect(copy).toContain("coarse simulation cannot invent a commute or new decision");
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
    expect(copy).toContain("current registry to twelve reusable archetypes serving seventeen species");
    expect(copy).toContain("Golden eagle retains ridge-soar/perch");
    expect(copy).toContain("harbor seal reuses authenticated shore-water foraging");
    expect(copy).toContain("great blue heron and greater yellowlegs use anchored-wader behavior");
    expect(copy).toContain("gull, common tern, osprey, and belted kingfisher share aerial-surface-opportunist behavior");
    expect(copy).toContain("double-crested cormorant uses diving-waterbird behavior");
    expect(copy).toContain("seaside sparrow uses perch-forage");
    expect(copy).toContain("diamondback terrapin uses amphibious-margin-forager");
    expect(copy).toContain("marsh rabbit uses ground-cover-forager");
    expect(copy).toContain("rabbit declares a circadian routine and explicit land movement");
    expect(copy).toContain("grant no exact aggregate target, capture, consumption, or implied food");
    expect(copy).toContain("Any immediate lawful threat, escape, alarm, food, guard, pursuit, retreat, or scavenging intent outranks neutral activity");
    expect(copy).toContain("not catalog-wide daily life or continuously simulated 3D movement");
    expect(copy).toContain("deterministic low quartering search");
    expect(copy).toContain("only a crow actually mobbing it becomes pressure that can break the pursuit");
    expect(copy).toContain("At rest time, crows seek authenticated habitat perches");
    expect(copy).toContain("danger and immediate needs still take priority");
    expect(copy).toContain("nonlethal player-absent aftermath");
    expect(copy).toContain("no harm or cargo interaction");
    expect(copy).toContain("Alpha-30/31's one remote source remains only as sealed compatibility history");
    expect(copy).toContain("Wild boar, elk, gray wolf, cougar, and brown bear");
    expect(copy).toContain("only a currently identified solitary addressable marsh rabbit can enter today's exact-contact mortality transaction");
    expect(copy).toContain("Grouped elk, grouped deer, and every other social-group member cannot be injured or killed");
    expect(copy).toContain("Brown bear has no live-prey pursuit or harmful contact");
    expect(copy).toContain("current forty-seven-record catalog contains exactly forty-five core-wildlife profiles plus separate human and domestic-dog foundation records");
    expect(copy).toContain("Saltmarsh Small Worlds is append-only epoch 3");
    expect(copy).toContain("Mosquitoes and periwinkles are conserved non-addressable aggregates over at most two anchors");
    expect(copy).toContain("Seaside sparrows are one group-atomic flock of two to four");
    expect(copy).toContain("diamondback terrapin is solitary");
    expect(copy).toContain("One global group-atomic plan remains capped at 24 addressable actors");
    expect(copy).toContain("rarer solitary polar bear is eligible only after that exact seal candidate exists");
    expect(copy).toContain("lawfully perceives a domestic dog, generic pressure can make it flee or retreat");
    expect(copy).toContain("no live-prey pursuit or harmful contact");
    expect(copy).toContain("Shared invariants, conservation, performance, seamless-crossing checks, and representative emergent scenarios");
    expect(copy).toContain("replace a species-by-species or N² pair matrix");
    expect(copy).toContain("final cohort adds no bites, disease, exact insect or snail actors, capture, consumption, injury, mortality, body, sound, reproduction, complete circadian life, or continuous 3D flight");
    expect(copy).not.toMatch(/exact (?:trust|fear|emotion).*(?:number|percentage)/iu);
  });

  it("teaches the v6 breadth wrapper without rewriting the exact v5 ecology", () => {
    const saves = tutorialSectionById("saves-and-quiet-hour");
    const copy = saves?.steps.map((step) => step.body).join(" ") ?? "";
    expect(copy).toContain("Outer save version 32 is current while RegionalEcologyStateV6 remains the unchanged nested ecology authority");
    expect(copy).toContain("Version 32 adds only the nullable player time-action receipt");
    expect(copy).toContain("exact RegionalEcologyStateV5 Alpha-36 child");
    expect(copy).toContain("complete V5 base, Alpine, polar-shore, cold-shore, and polar-consumer lineage");
    expect(copy).toContain("every exact earlier Open Country Ledger and Coldwater Glint adoption");
    expect(copy).toContain("core-ecology patch version 3");
    expect(copy).toContain("aggregate ecology record version 5");
    expect(copy).toContain("settlement ecology version 4");
    expect(copy).toContain("working-animal state version 2");
    expect(copy).toContain("Habitat version 11 remains sealed compatibility authority");
    expect(copy).toContain("separate version-1 sparse breadth root owns append-only cohort activations and genuine resident deviations for Estuary Surface Break at epoch 1, Marsh Channel Web at epoch 2, and Saltmarsh Small Worlds at epoch 3");
    expect(copy).toContain("exact V5 child still owns capelin, Arctic fox, harbor seal, and polar bear");
    expect(copy).toContain("sealed outer-version-29 Alpha-36 save is authenticated and adopted exactly once into version 30");
    expect(copy).toContain("complete RegionalEcologyStateV5 child and original outer integrity remain the adoption witness");
    expect(copy).toContain("without rewriting, renumbering, redistributing, retiring, or relabeling any base, Alpine, polar-shore, cold-shore, or polar-consumer wildlife");
    expect(copy).toContain("All six ecology layers enter one deterministic group-atomic materialization and conservation commit capped at 24 addressable actors");
    expect(copy).toContain("valid outer-v30 epoch-2 save authenticates before appending epoch 3 exactly once at its saved tick");
    expect(copy).toContain("complete epoch-1 and epoch-2 activations, residents, identities, aggregates, and deviations remain an exact prefix");
    expect(copy).toContain("repeated load is a no-op rather than another activation");
    expect(copy).toContain("cannot reroll a regional, Alpine, polar-shore, cold-shore, polar-consumer, or breadth lineage");
    expect(copy).toContain("Pristine signed-region, Alpine, polar-shore, cold-shore, polar-consumer, and breadth baselines are rederived instead of saved");
    expect(copy).toContain("rewrite an existing injury or death");
    expect(copy).toContain("restore consumed resource");
    expect(copy).toContain("only actual deviations, promoted or migrated identities, bodies, claims, and transaction receipts consume regional storage");
    expect(copy).toContain("existing Open Country Ledger disposition, Alpine adoption, Coldwater Glint adoption, Alpha-35 adoption, Alpha-36 adoption, working-animal transition, and domestic recovery remain exact and cannot replay");
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
    expect(searchTutorialGuide("WAIT 10 MIN", "mobile").map((section) => section.id)).toContain("saves-and-quiet-hour");
  });
});
