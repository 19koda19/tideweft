import { describe, expect, it, vi } from "vitest";

import {
  MAX_ACOUSTIC_TEXT_PLACEMENTS,
  MAX_ACOUSTIC_TEXT_RESERVED_RECTS,
  acousticTextRectsOverlap,
  layoutAcousticText,
  type AcousticTextCandidate,
  type AcousticTextLane,
  type AcousticTextRect,
} from "./acousticTextLayout";

const lanes: readonly AcousticTextLane[] = [
  { id: "below", order: 30, offset: { x: 0, y: 40 } },
  { id: "above", order: 10, offset: { x: 0, y: -40 } },
  { id: "above-right", order: 20, offset: { x: 56, y: -30 } },
];
const viewport = { x: 0, y: 0, width: 240, height: 120 } as const;

const candidate = (
  id: string,
  sourceId: string,
  priority: number,
  salience: number,
  anchor = { x: 120, y: 60 },
  box = { width: 48, height: 16 },
): AcousticTextCandidate => ({ id, sourceId, priority, salience, anchor, box });

const decisions = (result: ReturnType<typeof layoutAcousticText>): unknown => ({
  placements: result.placements.map(({ candidate: placed, laneId, rect }) => ({
    id: placed.id,
    laneId,
    rect,
  })),
  suppressions: result.suppressions.map(({ candidate: suppressed, reason }) => ({
    id: suppressed.id,
    reason,
  })),
});

describe("acoustic text layout", () => {
  it("orders by priority, salience, and stable ID rather than input or lane order", () => {
    const input = [
      candidate("z-low", "source:z", 2, 99),
      candidate("z-equal", "source:z-equal", 8, 4),
      candidate("b-equal", "source:b", 8, 7),
      candidate("a-equal", "source:a", 8, 7),
    ];
    const forward = layoutAcousticText(input, { lanes, viewport, gutter: 4 });
    const reverse = layoutAcousticText([...input].reverse(), {
      lanes: [...lanes].reverse(),
      viewport,
      gutter: 4,
    });

    expect(forward.placements.map(({ candidate: placed }) => placed.id)).toEqual([
      "a-equal",
      "b-equal",
      "z-equal",
    ]);
    expect(forward.suppressions).toMatchObject([
      { candidate: { id: "z-low" }, reason: "overlap" },
    ]);
    expect(decisions(reverse)).toEqual(decisions(forward));
  });

  it("enforces per-source and global caps with explicit suppression reasons", () => {
    const result = layoutAcousticText([
      candidate("a-first", "source:a", 10, 10),
      candidate("a-second", "source:a", 9, 10),
      candidate("b-first", "source:b", 8, 10),
      candidate("c-first", "source:c", 7, 10),
    ], {
      lanes,
      viewport,
      perSourceCap: 1,
      globalCap: 2,
      gutter: 4,
    });

    expect(result.placements.map(({ candidate: placed }) => placed.id)).toEqual([
      "a-first",
      "b-first",
    ]);
    expect(result.suppressions.map(({ candidate: suppressed, reason }) => [
      suppressed.id,
      reason,
    ])).toEqual([
      ["a-second", "per-source-cap"],
      ["c-first", "global-cap"],
    ]);
  });

  it("backfills a lower lawful fact when a higher candidate has no fitting lane", () => {
    const result = layoutAcousticText([
      candidate(
        "important-too-wide",
        "source:one",
        10,
        10,
        { x: 120, y: 60 },
        { width: 241, height: 16 },
      ),
      candidate("routine-fits", "source:one", 1, 1, { x: 120, y: 60 }),
    ], { lanes, viewport, perSourceCap: 1 });

    expect(result.placements).toMatchObject([{ candidate: { id: "routine-fits" } }]);
    expect(result.suppressions.map(({ candidate: suppressed, reason }) => [
      suppressed.id,
      reason,
    ])).toEqual([
      ["important-too-wide", "no-fitting-lane"],
    ]);
  });

  it("does not let far-offscreen candidates consume the global placement budget", () => {
    const centeredLane = { id: "centered", order: 0, offset: { x: 0, y: 0 } } as const;
    const result = layoutAcousticText([
      ...Array.from({ length: 4 }, (_, index) => candidate(
        `offscreen:${index}`,
        `source:offscreen:${index}`,
        100 - index,
        100,
        { x: -500 - index * 100, y: -500 },
      )),
      candidate("onscreen", "source:onscreen", 1, 1, { x: 120, y: 60 }),
    ], { lanes: [centeredLane], viewport, globalCap: 4 });

    expect(result.placements).toMatchObject([{ candidate: { id: "onscreen" } }]);
    expect(result.suppressions.filter(({ reason }) => reason === "no-fitting-lane"))
      .toHaveLength(4);
  });

  it("hard-bounds an oversized requested global cap", () => {
    const manyLanes = Array.from({ length: 8 }, (_, index): AcousticTextLane => ({
      id: `lane:${index}`,
      order: index,
      offset: { x: 0, y: -84 + index * 28 },
    }));
    const result = layoutAcousticText(
      Array.from({ length: 8 }, (_, index) => (
        candidate(
          `candidate:${index}`,
          `source:${index}`,
          20 - index,
          1,
          { x: 120, y: 120 },
        )
      )),
      { lanes: manyLanes, viewport: { x: 0, y: 0, width: 240, height: 240 }, globalCap: 999, gutter: 2 },
    );

    expect(result.placements).toHaveLength(MAX_ACOUSTIC_TEXT_PLACEMENTS);
    expect(result.suppressions).toHaveLength(8 - MAX_ACOUSTIC_TEXT_PLACEMENTS);
    expect(result.suppressions.every(({ reason }) => reason === "global-cap")).toBe(true);
  });

  it("allows only bounded edge settling and rejects far-offscreen or oversized boxes", () => {
    const centeredLane = { id: "centered", order: 0, offset: { x: 0, y: 0 } } as const;
    const result = layoutAcousticText([
      candidate("near-edge", "source:near-edge", 6, 6, { x: 18, y: 40 }),
      candidate("offscreen", "source:offscreen", 5, 5, { x: -200, y: -200 }),
      candidate(
        "too-wide",
        "source:wide",
        4,
        4,
        { x: 120, y: 12 },
        { width: 241, height: 16 },
      ),
    ], { lanes: [centeredLane], viewport, gutter: 4 });

    expect(result.placements).toMatchObject([{
      candidate: { id: "near-edge" },
      laneId: "centered",
      rect: { x: 0, y: 32, width: 48, height: 16 },
    }]);
    expect(result.suppressions).toMatchObject([
      {
        candidate: { id: "offscreen" },
        reason: "no-fitting-lane",
      },
      {
        candidate: { id: "too-wide" },
        reason: "no-fitting-lane",
      },
    ]);
  });

  it("rejects rectangle overlap with a gutter and accepts exact gutter separation", () => {
    const lane = { id: "one", order: 0, offset: { x: 0, y: 0 } } as const;
    const result = layoutAcousticText([
      candidate("first", "source:first", 3, 1, { x: 20, y: 10 }, { width: 40, height: 16 }),
      candidate("blocked", "source:blocked", 2, 1, { x: 61, y: 10 }, { width: 40, height: 16 }),
      candidate("clear", "source:clear", 1, 1, { x: 84, y: 10 }, { width: 40, height: 16 }),
    ], { lanes: [lane], viewport: { x: 0, y: 0, width: 200, height: 20 }, gutter: 4 });

    expect(result.placements.map(({ candidate: placed }) => placed.id)).toEqual(["first", "clear"]);
    expect(result.suppressions).toMatchObject([{
      candidate: { id: "blocked" },
      reason: "overlap",
    }]);
    expect(acousticTextRectsOverlap(
      { x: 0, y: 0, width: 40, height: 16 },
      { x: 44, y: 0, width: 40, height: 16 },
      4,
    )).toBe(false);
  });

  it("preserves exact existing decisions when reservations are omitted or empty", () => {
    const input = [
      candidate("speech", "source:speech", 10, 10),
      candidate("call", "source:call", 8, 7),
      candidate("contact", "source:contact", 2, 2),
    ];
    const existing = layoutAcousticText(input, { lanes, viewport, gutter: 4 });

    expect(existing.placements).toHaveLength(3);
    expect(layoutAcousticText(input, { lanes, viewport, gutter: 4, reservedRects: [] }))
      .toEqual(existing);
  });

  it("relocates a label from reserved feedback to the next clean authored lane", () => {
    const input = [candidate("whine", "source:dog", 10, 10)];
    const feedback = { x: 96, y: 12, width: 48, height: 16 };
    const original = layoutAcousticText(input, { lanes, viewport, gutter: 4 });
    expect(original.placements).toMatchObject([{ laneId: "above", rect: feedback }]);

    const result = layoutAcousticText(input, { lanes, viewport, gutter: 4, reservedRects: [feedback] });
    expect(result.placements).toEqual([{
      candidate: input[0], laneId: "above-right", rect: { x: 152, y: 22, width: 48, height: 16 },
    }]);
    expect(result.suppressions).toEqual([]);
    expect(acousticTextRectsOverlap(result.placements[0]!.rect, feedback, 4)).toBe(false);
    expect(result.placements[0]!.candidate).toBe(input[0]);
    expect(layoutAcousticText(input, { lanes, viewport, gutter: 4, reservedRects: [feedback] }))
      .toEqual(result);
  });

  it.each([
    [3, false],
    [4, true],
  ] as const)("applies the same gutter to feedback with a %s-pixel gap", (gap, fits) => {
    const lane = { id: "one", order: 0, offset: { x: 0, y: 0 } } as const;
    const input = [candidate("call", "source:call", 10, 10, { x: 20, y: 10 }, { width: 40, height: 16 })];
    const result = layoutAcousticText(input, {
      lanes: [lane], viewport: { x: 0, y: 0, width: 200, height: 20 }, gutter: 4,
      reservedRects: [{ x: 40 + gap, y: 2, width: 40, height: 16 }],
    });

    expect(result.placements).toHaveLength(fits ? 1 : 0);
    expect(result.suppressions).toEqual(fits ? [] : [{ candidate: input[0], reason: "overlap" }]);
  });

  it("suppresses rather than drawing when all three bounded lanes are reserved", () => {
    expect(MAX_ACOUSTIC_TEXT_RESERVED_RECTS).toBe(3);
    const input = [
      candidate("speech", "source:speech", 10, 10),
      candidate("call", "source:call", 8, 7),
    ];
    const result = layoutAcousticText(input, {
      lanes, viewport, gutter: 4,
      reservedRects: [
        { x: 96, y: 12, width: 48, height: 16 },
        { x: 152, y: 22, width: 48, height: 16 },
        { x: 96, y: 92, width: 48, height: 16 },
      ],
    });

    expect(result.placements).toEqual([]);
    expect(result.suppressions).toEqual(input.map((item) => ({ candidate: item, reason: "overlap" })));
  });

  it("keeps reservations, candidates and lanes order-independent without changing rank", () => {
    const input = [
      candidate("z-contact", "source:contact", 1, 1),
      candidate("a-speech", "source:speech", 10, 10),
      candidate("b-call", "source:call", 8, 7),
    ];
    const reservedRects = [
      { x: 96, y: 12, width: 48, height: 16 },
      { x: 0, y: 0, width: 40, height: 20 },
      { x: 220, y: 100, width: 10, height: 10 },
    ];
    const result = layoutAcousticText(input, { lanes, viewport, gutter: 4, reservedRects });
    const permuted = layoutAcousticText([...input].reverse(), {
      lanes: [...lanes].reverse(), viewport, gutter: 4, reservedRects: [...reservedRects].reverse(),
    });

    expect(result.placements.map(({ candidate: placed }) => placed.id)).toEqual(["a-speech", "b-call"]);
    expect(result.suppressions).toEqual([{ candidate: input[0], reason: "overlap" }]);
    expect(permuted).toEqual(result);
    for (const placement of result.placements) {
      expect(reservedRects.some((reserved) => acousticTextRectsOverlap(placement.rect, reserved, 4))).toBe(false);
    }
  });

  it("fails closed without placements for malformed, sparse or over-budget reservations", () => {
    const input = [candidate("speech", "source:speech", 10, 10), candidate("call", "source:call", 8, 7)];
    const valid = { x: 0, y: 0, width: 1, height: 1 };
    const malformed: readonly unknown[] = [
      null,
      {},
      [null],
      Array(1),
      [{ ...valid, x: Number.NaN }],
      [{ ...valid, y: Number.POSITIVE_INFINITY }],
      [{ ...valid, width: 0 }],
      [{ ...valid, height: -1 }],
      [{ x: 0, y: 0, width: 1 }],
      [{ ...valid, width: "1" }],
      [valid, { ...valid, height: Number.NaN }],
      [valid, valid, valid, valid],
    ];
    for (const reservedRects of malformed) {
      const result = layoutAcousticText(input, {
        lanes, viewport, gutter: 4, reservedRects: reservedRects as readonly AcousticTextRect[],
      });
      expect(result.placements).toEqual([]);
      expect(result.suppressions).toEqual(input.map((item) => ({ candidate: item, reason: "overlap" })));
    }
  });

  it("does not mutate or retain new state in frozen candidates, reservations or options", () => {
    const input = Object.freeze([Object.freeze({
      ...candidate("whine", "source:dog", 10, 10),
      anchor: Object.freeze({ x: 120, y: 60 }),
      box: Object.freeze({ width: 48, height: 16 }),
    })]);
    const options = Object.freeze({
      lanes: Object.freeze(lanes.map((lane) => Object.freeze({ ...lane, offset: Object.freeze({ ...lane.offset }) }))),
      viewport: Object.freeze({ ...viewport }),
      gutter: 4,
      reservedRects: Object.freeze([Object.freeze({ x: 96, y: 12, width: 48, height: 16 })]),
    });
    const before = structuredClone({ input, options });

    const result = layoutAcousticText(input, options);
    expect(result.placements).toHaveLength(1);
    expect({ input, options }).toEqual(before);
    expect(layoutAcousticText(input, options)).toEqual(result);
  });

  it("uses no RNG, clock, frame state, or retained placement state", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("layout must not read RNG");
    });
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("layout must not read wall time");
    });
    try {
      const input = [
        candidate("second", "source:second", 1, 1),
        candidate("first", "source:first", 1, 1),
      ];
      const first = layoutAcousticText(input, { lanes, viewport, gutter: 4 });
      const second = layoutAcousticText(input, { lanes, viewport, gutter: 4 });
      expect(decisions(second)).toEqual(decisions(first));
    } finally {
      random.mockRestore();
      clock.mockRestore();
    }
  });

  it("fails closed on malformed candidates and duplicate identities", () => {
    const duplicate = candidate("duplicate", "source:a", 2, 2);
    const result = layoutAcousticText([
      duplicate,
      { ...duplicate, sourceId: "source:b" },
      candidate("invalid", "source:invalid", Number.NaN, 1),
    ], { lanes, viewport });

    expect(result.placements).toEqual([]);
    expect(result.suppressions.map(({ candidate: suppressed, reason }) => [
      suppressed.id,
      reason,
    ])).toEqual([
      ["duplicate", "duplicate-id"],
      ["duplicate", "duplicate-id"],
      ["invalid", "invalid-candidate"],
    ]);
  });
});
