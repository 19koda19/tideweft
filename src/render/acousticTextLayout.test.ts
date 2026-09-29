import { describe, expect, it, vi } from "vitest";

import {
  MAX_ACOUSTIC_TEXT_PLACEMENTS,
  acousticTextRectsOverlap,
  layoutAcousticText,
  type AcousticTextCandidate,
  type AcousticTextLane,
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
