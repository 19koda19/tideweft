import { describe, expect, it } from "vitest";

import {
  TIDEWEFT_TUTORIAL_GUIDE,
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
    expect(TIDEWEFT_TUTORIAL_GUIDE.version).toBe(3);

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
    expect(mobileCopy).toContain("Let movement stop or cancel the destination");
    expect(mobileCopy).toContain("dedicated Tutorial control");
    expect(mobileCopy).not.toContain("Shift-click appends");
    expect(mobileCopy).not.toContain("Right-drag or Alt-drag");

    const mobileControls = tutorialControlsForAudience("mobile");
    expect(mobileControls.some((control) => control.id === "set-destination")).toBe(true);
    expect(mobileControls.some((control) => control.id === "promises-sheet")).toBe(true);
    expect(mobileControls.some((control) => control.id === "tutorial-button")).toBe(true);
    expect(mobileControls.some((control) => control.id === "kit-button")).toBe(true);
    expect(mobileControls.some((control) => control.id === "brace-key")).toBe(false);
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
    expect(copy).toContain("Unbraced travel lowers stability");
    expect(copy).toContain("Sparse arrows");
    expect(copy).toContain("stamina or stability reaching zero");
    expect(copy).toContain("Marsh stilts");
    expect(copy).toContain("Tide sail");
    expect(copy).toContain("Storm kite");
    expect(copy).toContain("Reed mat");
    expect(copy).toContain("Tide anchor");
    expect(copy).toContain("Wind knot");
    expect(copy).toContain("Tide Harp");
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

  it("describes finite seeded generation without hard-coding a settlement count", () => {
    const tutorialCopy = JSON.stringify(TIDEWEFT_TUTORIAL_GUIDE);
    const welcome = tutorialSectionById("welcome");
    const welcomeCopy = welcome === undefined
      ? ""
      : [welcome.summary, ...welcome.steps.map((step) => step.body)].join(" ");
    const expansion = TUTORIAL_PLANNED_MECHANICS.find(
      (mechanic) => mechanic.id === "planned-world-expansion",
    );

    expect(tutorialCopy).not.toMatch(/\b(?:seven|7)\s+settlements?\b/iu);
    expect(welcomeCopy).toContain("Each finite estuary is procedurally generated from its world seed");
    expect(welcomeCopy).toContain("terrain, biome pattern, and harbor sites");
    expect(expansion?.clarification).toContain("one finite seed-generated map");
    expect(expansion?.clarification).toContain("starting a new game with another seed regenerates");
    expect(expansion?.clarification).toContain("dynamically extending a running settlement network");
    expect(expansion?.clarification).toContain("not live in this build");
  });

  it("marks requested future systems as planned instead of claiming that they affect play", () => {
    expect(TUTORIAL_PLANNED_MECHANICS.every((mechanic) => mechanic.status === "planned")).toBe(true);
    expect(TUTORIAL_PLANNED_MECHANICS.map((mechanic) => mechanic.id)).toEqual([
      "planned-world-expansion",
      "planned-regional-biomes",
      "planned-magic-water-cargo",
      "planned-loose-cargo-physics",
      "planned-rocks-and-ladders",
      "planned-staged-gear-bridges",
      "planned-anywhere-upgrades",
    ]);
    const plannedCopy = TUTORIAL_PLANNED_MECHANICS
      .map((mechanic) => `${mechanic.title} ${mechanic.clarification}`)
      .join(" ");
    expect(plannedCopy).toContain("Seven stable visual biomes");
    expect(plannedCopy).toContain("do not affect the courier or cargo yet");
    expect(plannedCopy).toContain("do not yet transform specific cargo materials");
    expect(plannedCopy).toContain("cannot fall down rocks or drift away");
    expect(plannedCopy).toContain("not implemented yet");
    expect(plannedCopy).toContain("do not become deployable Wayknots yet");
    expect(plannedCopy).toContain("harbor locker storage");
    expect(plannedCopy).toContain("not yet a trust-money wallet");
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
