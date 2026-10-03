import { describe, expect, it } from "vitest";

import { MARSH_RABBIT_THUMP_EXPRESSION_PRIORITY } from "../game/coreWildlifeSignalExpression";
import type { AcousticTextView, PlayerBalanceView, SituatedExpressionView } from "./types";
import {
  DEFAULT_ACOUSTIC_TEXT_GUTTER,
  acousticTextRectsOverlap,
  type AcousticTextRect,
} from "./acousticTextLayout";
import {
  acousticTextCalloutSize,
  actorCalloutViewport,
  layoutAcousticTextCallouts,
  placeIncidentCallout,
  playerBalancePresentation,
  selectSituatedExpression,
  situatedExpressionCalloutText,
} from "./playerPresentation";

const STATES: readonly PlayerBalanceView[] = [
  "balanced",
  "swaying",
  "stumbling",
  "fallen",
  "swept",
  "recovering",
];

describe("player balance presentation", () => {
  it("gives every state a unique non-color signature and readable label", () => {
    const styles = STATES.map(playerBalancePresentation);
    expect(new Set(styles.map(({ silhouette, mark }) => `${silhouette}:${mark}`)).size)
      .toBe(STATES.length);
    expect(new Set(styles.map(({ fill }) => fill)).size).toBe(STATES.length);
    expect(new Set(styles.map(({ outline }) => outline)).size).toBe(STATES.length);
    expect(styles.map(({ label }) => label)).toEqual(STATES);
    for (const style of styles) {
      expect(style.fill).toMatch(/^#[0-9a-f]{6}$/iu);
      expect(style.outline).toMatch(/^#[0-9a-f]{6}$/iu);
      expect(style.heightScale).toBeGreaterThan(0);
    }
  });

  it("defaults an older projection to the balanced visual contract", () => {
    expect(playerBalancePresentation(undefined)).toEqual(
      playerBalancePresentation("balanced"),
    );
  });
});

describe("incident callout placement", () => {
  const portrait = {
    width: 320,
    height: 640,
    safeTop: 104,
    safeBottom: 152,
    compact: true,
  } as const;

  it.each([
    ["top-left", { x: 0, y: 0 }],
    ["top-right", { x: 320, y: 0 }],
    ["bottom-left", { x: 0, y: 640 }],
    ["bottom-right", { x: 320, y: 640 }],
  ])("keeps portrait %s labels outside HUD and touch-control gutters", (_name, point) => {
    const placed = placeIncidentCallout(point, 180, portrait);
    expect(placed.x - placed.width / 2).toBeGreaterThanOrEqual(12);
    expect(placed.x + placed.width / 2).toBeLessThanOrEqual(portrait.width - 12);
    expect(placed.y).toBeGreaterThanOrEqual(portrait.safeTop + 12);
    expect(placed.y).toBeLessThanOrEqual(portrait.height - portrait.safeBottom - 12);
  });

  it("reserves the full compact touch dock in the mobile callout aperture", () => {
    const viewport = actorCalloutViewport(320, 640);
    const placed = placeIncidentCallout({ x: 160, y: 620 }, 226, viewport);
    expect(viewport).toMatchObject({ safeTop: 76, safeBottom: 112, compact: true });
    expect(placed.y).toBeGreaterThanOrEqual(viewport.safeTop + 12);
    expect(placed.y).toBeLessThanOrEqual(640 - viewport.safeBottom - 12);
    expect(placed.x - placed.width / 2).toBeGreaterThanOrEqual(12);
    expect(placed.x + placed.width / 2).toBeLessThanOrEqual(308);
  });

  it("prefers the lane above the courier when that lane is available", () => {
    expect(placeIncidentCallout(
      { x: 190, y: 260 },
      140,
      { width: 844, height: 390, safeTop: 52, safeBottom: 88, compact: true },
    )).toMatchObject({ x: 190, y: 202, aboveCourier: true });
  });

  it("uses the safe lane below a courier hidden beneath the compact top HUD", () => {
    expect(placeIncidentCallout(
      { x: 160, y: 72 },
      180,
      portrait,
    )).toMatchObject({
      x: 160,
      y: 116,
      width: 180,
      aboveCourier: false,
    });
  });

  it("keeps short landscape callouts clear of both HUD and action lanes", () => {
    const landscape = {
      width: 844,
      height: 390,
      safeTop: 76,
      safeBottom: 92,
      compact: true,
    } as const;
    for (const point of [
      { x: 0, y: 0 },
      { x: 844, y: 0 },
      { x: 0, y: 390 },
      { x: 844, y: 390 },
      { x: 422, y: 195 },
    ]) {
      const placed = placeIncidentCallout(point, 226, landscape);
      expect(placed.x - placed.width / 2).toBeGreaterThanOrEqual(12);
      expect(placed.x + placed.width / 2).toBeLessThanOrEqual(landscape.width - 12);
      expect(placed.y).toBeGreaterThanOrEqual(landscape.safeTop + 12);
      expect(placed.y).toBeLessThanOrEqual(landscape.height - landscape.safeBottom - 12);
    }
  });

  it("contains malformed presentational coordinates without leaking NaN", () => {
    const placed = placeIncidentCallout(
      { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      Number.NaN,
      portrait,
    );
    expect(Object.values(placed).every((value) =>
      typeof value === "boolean" || Number.isFinite(value))).toBe(true);
    expect(placed.width).toBe(72);
  });
});

describe("situated expression callout budget", () => {
  const expression = (
    id: string,
    priority: number,
    text = id,
  ): SituatedExpressionView => ({
    acousticKind: "speech",
    id,
    sourceActorId: `actor:${id}`,
    sourceKind: "human",
    speakerLabel: "Nearby courier",
    text,
    position: { x: 10, y: 20 },
    progress: 0.25,
    priority,
    salience: 1,
    tone: "restrained",
    variantSeed: 7,
  });

  it("selects one highest-priority expression with stable ID arbitration", () => {
    const candidates = [
      expression("z-last", 4),
      expression("b-equal", 9),
      expression("a-equal", 9, "Shared short copy"),
    ];
    const selected = selectSituatedExpression(candidates);
    expect(selected?.id).toBe("a-equal");
    expect(situatedExpressionCalloutText(selected!)).toBe("Shared short copy");
    expect(candidates.map(({ id }) => id)).toEqual(["z-last", "b-equal", "a-equal"]);
  });

  it("treats malformed priorities as lowest without destabilizing ID order", () => {
    expect(selectSituatedExpression([
      expression("z-invalid", Number.NaN),
      expression("a-invalid", Number.POSITIVE_INFINITY),
      expression("finite", -100),
    ])?.id).toBe("finite");
    expect(selectSituatedExpression([])).toBeUndefined();
  });

  it("keeps even the quietest current speech ahead of a soft rabbit foot-thump", () => {
    const speech = expression("quiet-speech", 180_000, "Easy now.");
    const introduction = expression("resident-introduction", 650_000, "I'm Mara.");
    const thump: SituatedExpressionView = {
      ...expression(
        "rabbit-thump",
        MARSH_RABBIT_THUMP_EXPRESSION_PRIORITY,
        "thump",
      ),
      acousticKind: "embodied-signal",
      sourceActorId: "RABBIT:nearby",
      sourceKind: "animal",
    };

    expect(MARSH_RABBIT_THUMP_EXPRESSION_PRIORITY).toBeLessThan(speech.priority);
    expect(selectSituatedExpression([thump, speech])?.id).toBe(speech.id);
    expect(selectSituatedExpression([thump, introduction])?.id).toBe(introduction.id);
  });
});

describe("acoustic text callout bounds", () => {
  it("retains a one-line envelope for short physical semantics", () => {
    expect(acousticTextCalloutSize("scrape", actorCalloutViewport(844, 390)))
      .toMatchObject({ height: 22 });
  });

  it("reserves multi-line height when longer speech reaches the width cap", () => {
    const copy = "Watch your footing near the flooded boards and keep the medicine case steady.";
    const compact = acousticTextCalloutSize(copy, actorCalloutViewport(390, 700));
    const wide = acousticTextCalloutSize(copy, actorCalloutViewport(1_280, 720));

    expect(compact.width).toBeLessThanOrEqual(226);
    expect(compact.height).toBeGreaterThan(22);
    expect(wide.width).toBeLessThanOrEqual(310);
    expect(wide.height).toBeGreaterThan(22);
  });

  it("counts explicit line breaks even when each line is short", () => {
    expect(acousticTextCalloutSize(
      "First warning.\nSecond warning.",
      actorCalloutViewport(1_280, 720),
    ).height).toBe(35);
  });
});

describe("production-aperture acoustic callout adapter", () => {
  // These are perceived-presentation fixtures, not concurrent runtime causes
  // or a measurement of browser glyphs, hardware, or native mobile gameplay.
  const mixedText = (anchors: readonly { x: number; y: number }[]): AcousticTextView[] => [
    {
      acousticKind: "speech", id: "mixed-warning", sourceActorId: "human:warning",
      sourceKind: "human", speakerLabel: "Nearby courier",
      text: "Watch your footing near the flooded boards and keep the medicine case steady.",
      position: anchors[0]!, progress: 0.1, priority: 900_000, salience: 800_000,
      tone: "alarmed", variantSeed: 1,
    },
    {
      acousticKind: "animal-call", id: "mixed-bark", sourceActorId: "dog:warning",
      sourceKind: "animal", speakerLabel: "Nearby dog", text: "BARK!",
      position: anchors[1]!, progress: 0.2, priority: 760_000, salience: 800_000,
      tone: "alarmed", variantSeed: 2,
    },
    {
      acousticKind: "physical", id: "mixed-slide", sourceId: "player",
      sourceKind: "player", text: "scrape", semanticFamily: "scrape",
      position: anchors[2]!, progress: 0.3, priority: 500_000, salience: 900_000,
      tone: "restrained", variantSeed: 3,
    },
    {
      acousticKind: "physical", id: "mixed-cargo", sourceId: "cargo:parcel",
      sourceKind: "object", text: "thud", semanticFamily: "thud",
      position: anchors[3]!, progress: 0.4, priority: 450_000, salience: 900_000,
      tone: "restrained", variantSeed: 4,
    },
  ];
  const separatedAnchors = (width: number) => width === 390
    ? [{ x: 195, y: 220 }, { x: 195, y: 360 }, { x: 195, y: 500 }, { x: 195, y: 640 }]
    : [{ x: 320, y: 230 }, { x: 880, y: 230 }, { x: 320, y: 490 }, { x: 880, y: 490 }];
  const decisions = (layout: ReturnType<typeof layoutAcousticTextCallouts>) => ({
    placements: layout.placements.map(({ candidate, laneId, rect }) => ({
      id: candidate.id, sourceId: candidate.sourceId, laneId, rect,
    })),
    suppressions: layout.suppressions.map(({ candidate, reason }) => ({ id: candidate.id, reason })),
  });
  const expectSeparatedAperture = (rects: readonly AcousticTextRect[], width: number, height: number) => {
    const aperture = actorCalloutViewport(width, height);
    for (const [index, rect] of rects.entries()) {
      expect(rect.x).toBeGreaterThanOrEqual(12);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width - 12);
      expect(rect.y).toBeGreaterThanOrEqual(aperture.safeTop + 1);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height - aperture.safeBottom - 1);
      for (const other of rects.slice(index + 1)) {
        expect(acousticTextRectsOverlap(rect, other, DEFAULT_ACOUSTIC_TEXT_GUTTER)).toBe(false);
      }
    }
  };

  it.each([[1_280, 720], [390, 844]])(
    "places four mixed current kinds inside the production %sx%s aperture",
    (width, height) => {
      const candidates = mixedText(separatedAnchors(width));
      const viewport = actorCalloutViewport(width, height);
      const forward = layoutAcousticTextCallouts(candidates, viewport, ({ position }) => position);
      const reversed = layoutAcousticTextCallouts([...candidates].reverse(), viewport, ({ position }) => position);

      expect(forward.placements.map(({ candidate }) => candidate.id)).toEqual([
        "mixed-warning", "mixed-bark", "mixed-slide", "mixed-cargo",
      ]);
      expect(forward.suppressions).toEqual([]);
      expect(new Set(forward.placements.map(({ candidate }) => candidate.sourceId)).size).toBe(4);
      expect(forward.placements[0]?.rect.height).toBeGreaterThan(22);
      expectSeparatedAperture(forward.placements.map(({ rect }) => rect), width, height);
      expect(decisions(reversed)).toEqual(decisions(forward));
    },
  );

  it.each([[1_280, 720], [390, 844]])(
    "keeps the warning primary under overlapping mixed load at %sx%s",
    (width, height) => {
      const anchor = { x: width / 2, y: height / 2 };
      const candidates = mixedText([anchor, anchor, anchor, anchor]);
      const warning = candidates[0]!;
      const duplicateSource: AcousticTextView = {
        ...warning, id: "quiet-same-human", text: "Easy now.", priority: 100_000,
      };
      const overloaded = [...candidates, duplicateSource];
      const viewport = actorCalloutViewport(width, height);
      const forward = layoutAcousticTextCallouts(overloaded, viewport, ({ position }) => position);
      const reversed = layoutAcousticTextCallouts([...overloaded].reverse(), viewport, ({ position }) => position);

      expect(forward.placements[0]?.candidate.id).toBe("mixed-warning");
      expect(forward.placements.length).toBeLessThanOrEqual(4);
      expect(forward.suppressions).toContainEqual(expect.objectContaining({
        candidate: expect.objectContaining({ id: "quiet-same-human" }), reason: "per-source-cap",
      }));
      expect(forward.suppressions.some(({ reason }) => reason === "overlap")).toBe(true);
      expect(new Set(forward.placements.map(({ candidate }) => candidate.sourceId)).size)
        .toBe(forward.placements.length);
      expectSeparatedAperture(forward.placements.map(({ rect }) => rect), width, height);
      expect(decisions(reversed)).toEqual(decisions(forward));
    },
  );
});
