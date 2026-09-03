import { describe, expect, it } from "vitest";

import {
  VISIBILITY_DIRECT,
  VISIBILITY_HIDDEN,
  VISIBILITY_PERIPHERAL,
  calculateAmbientNoise,
  evaluateAudibleContact,
  evaluatePerception,
  evaluateVisualContact,
  type AudibleContactInput,
  type PerceptionCell,
  type PerceptionRangeOverrides,
  type VisualContactInput,
} from "./perception";

function flatCells(count: number): PerceptionCell[] {
  return Array.from({ length: count }, () => ({ elevation: 0, obstruction: 0 }));
}

const DETAIL_RANGES = {
  closePeripheralRange: 2,
  directSightRange: 10,
  forwardConeRadians: Math.PI / 2,
} as const satisfies PerceptionRangeOverrides;

function contactInput(
  columns: number,
  rows: number,
  observerTileIndex: number,
  targetTileIndex: number,
  overrides: Partial<VisualContactInput> = {},
): VisualContactInput {
  return {
    columns,
    rows,
    cells: flatCells(columns * rows),
    observerTileIndex,
    targetTileIndex,
    observerFacingRadians: 0,
    weatherVisibility: 1,
    detailRangeOverrides: DETAIL_RANGES,
    targetMovementSalience: 1,
    targetLightVisibility: 1,
    ...overrides,
  };
}

describe("bounded point visual contacts", () => {
  it("distinguishes forward detail from close peripheral awareness without leaking a target", () => {
    const columns = 9;
    const observer = columns + 4;
    const forward = evaluateVisualContact(contactInput(columns, 3, observer, columns + 8));
    const behind = evaluateVisualContact(contactInput(columns, 3, observer, columns + 2));

    expect(forward).toMatchObject({
      grade: VISIBILITY_DIRECT,
      identityEligible: true,
    });
    expect(behind).toMatchObject({
      grade: VISIBILITY_PERIPHERAL,
      identityEligible: false,
    });
    expect(forward?.confidence).toBeGreaterThan(0);
    expect(forward?.confidence).toBeLessThanOrEqual(1);
    expect(Object.keys(forward ?? {})).toEqual(["grade", "identityEligible", "confidence"]);
    expect(forward).not.toHaveProperty("targetTileIndex");
    expect(forward).not.toHaveProperty("distance");
    expect(forward).not.toHaveProperty("bearing");
    expect(forward).not.toHaveProperty("identity");
  });

  it("uses the same elevation horizon and opaque-cover rules as exact detail sight", () => {
    const mountain = flatCells(5);
    mountain[2] = { elevation: 1, obstruction: 0 };
    expect(evaluateVisualContact(contactInput(5, 1, 0, 4, { cells: mountain }))).toBeNull();

    const cover = flatCells(5);
    cover[2] = { elevation: 0, obstruction: 0.5 };
    expect(evaluateVisualContact(contactInput(5, 1, 0, 4, { cells: cover }))).toBeNull();

    // The target surface itself remains visible even when it can occlude a
    // later target on a separate query.
    expect(evaluateVisualContact(contactInput(5, 1, 0, 2, { cells: cover })))
      .toMatchObject({ grade: VISIBILITY_DIRECT, identityEligible: true });
  });

  it("rejects a ray through two closed diagonal flanks but permits one open flank", () => {
    const cells = flatCells(9);
    cells[1] = { elevation: 0, obstruction: 1 };
    cells[3] = { elevation: 0, obstruction: 1 };
    const closed = contactInput(3, 3, 0, 4, {
      cells,
      observerFacingRadians: Math.PI / 4,
    });

    expect(evaluateVisualContact(closed)).toBeNull();

    const oneOpenFlank = cells.map((cell) => ({ ...cell }));
    oneOpenFlank[3] = { elevation: 0, obstruction: 0 };
    expect(evaluateVisualContact({ ...closed, cells: oneOpenFlank }))
      .toMatchObject({ grade: VISIBILITY_DIRECT });
  });

  it("lets motion disclose a dark silhouette while light governs identity eligibility", () => {
    const stillInDimLight = contactInput(11, 1, 0, 6, {
      targetMovementSalience: 0,
      targetLightVisibility: 0.4,
    });
    const movingInDarkness = {
      ...stillInDimLight,
      targetMovementSalience: 1,
      targetLightVisibility: 0,
    } satisfies VisualContactInput;
    const stillInFullLight = {
      ...stillInDimLight,
      targetMovementSalience: 0,
      targetLightVisibility: 1,
    } satisfies VisualContactInput;

    expect(evaluateVisualContact(stillInDimLight)).toBeNull();
    expect(evaluateVisualContact(movingInDarkness)).toMatchObject({
      grade: VISIBILITY_DIRECT,
      identityEligible: false,
    });
    expect(evaluateVisualContact(stillInFullLight)).toMatchObject({
      grade: VISIBILITY_DIRECT,
      identityEligible: true,
    });
    expect(evaluateVisualContact({
      ...stillInFullLight,
      weatherVisibility: 0.5,
    })).toBeNull();
    expect(evaluateVisualContact({
      ...stillInFullLight,
      targetLightVisibility: 0,
    })).toBeNull();
  });

  it("matches the relevant exact-detail grades from the full visibility snapshot", () => {
    const columns = 9;
    const rows = 3;
    const observer = columns + 4;
    const cells = flatCells(columns * rows);
    cells[columns + 6] = { elevation: 0, obstruction: 1 };
    const terrainRanges = {
      closePeripheralRange: 2,
      directSightRange: 10,
      forwardConeRadians: Math.PI / 2,
    } as const;
    const full = evaluatePerception({
      columns,
      rows,
      cells,
      playerTileIndex: observer,
      facingRadians: 0,
      weatherVisibility: 1,
      rangeOverrides: terrainRanges,
      detailRangeOverrides: terrainRanges,
    });

    for (const target of [columns + 2, columns + 5, columns + 6, columns + 7, 1]) {
      const contact = evaluateVisualContact(contactInput(columns, rows, observer, target, {
        cells,
        detailRangeOverrides: terrainRanges,
      }));
      const fullGrade = full.detailVisibilityGrades[target] ?? VISIBILITY_HIDDEN;
      expect(contact?.grade ?? VISIBILITY_HIDDEN).toBe(fullGrade);
      expect(contact?.identityEligible ?? false).toBe(fullGrade === VISIBILITY_DIRECT);
    }
  });

  it("fails closed for malformed grids, endpoints, ranges, factors, and traversed cells", () => {
    const valid = contactInput(5, 1, 0, 4);
    const malformed: unknown[] = [
      null,
      { ...valid, columns: 0 },
      { ...valid, cells: valid.cells.slice(1) },
      { ...valid, observerTileIndex: -1 },
      { ...valid, targetTileIndex: 5 },
      { ...valid, observerFacingRadians: Number.NaN },
      { ...valid, weatherVisibility: 1.1 },
      { ...valid, targetMovementSalience: -0.1 },
      { ...valid, targetLightVisibility: Number.POSITIVE_INFINITY },
      { ...valid, detailRangeOverrides: { closePeripheralRange: 3, directSightRange: 2 } },
      {
        ...valid,
        cells: valid.cells.map((cell, index) => index === 2
          ? { elevation: Number.NaN, obstruction: 0 }
          : cell),
      },
    ];

    for (const input of malformed) {
      expect(evaluateVisualContact(input as VisualContactInput)).toBeNull();
    }
  });

  it("walks only the requested ray rather than validating or iterating the full grid", () => {
    const columns = 100_000;
    const observerTileIndex = 50_000;
    const cells = flatCells(columns);
    let indexedReads = 0;
    const observedCells = new Proxy(cells, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    const contact = evaluateVisualContact(contactInput(
      columns,
      1,
      observerTileIndex,
      observerTileIndex + 4,
      { cells: observedCells },
    ));

    expect(contact?.grade).toBe(VISIBILITY_DIRECT);
    expect(indexedReads).toBeLessThan(20);
  });
});

describe("deterministic ambient sound masking", () => {
  const audible: AudibleContactInput = {
    listener: { x: 0, y: 0 },
    source: { x: 6, y: 0 },
    baseRange: 10,
    ambientNoise: 0,
    sourceLoudness: 1,
    wind: { x: 0, y: 0 },
  };

  it("combines rain and local turbulent water monotonically within unit bounds", () => {
    const quiet = calculateAmbientNoise({ rainIntensity: 0, localWaterTurbulence: 0 });
    const rain = calculateAmbientNoise({ rainIntensity: 1, localWaterTurbulence: 0 });
    const river = calculateAmbientNoise({ rainIntensity: 0, localWaterTurbulence: 1 });
    const both = calculateAmbientNoise({ rainIntensity: 1, localWaterTurbulence: 1 });

    expect(quiet).toBe(0);
    expect(rain).toBe(0.62);
    expect(river).toBe(0.72);
    expect(both).toBe(0.8936);
    expect(both).toBeGreaterThan(rain ?? 0);
    expect(both).toBeGreaterThan(river ?? 0);
    expect(both).toBeLessThanOrEqual(1);
    expect(calculateAmbientNoise({ rainIntensity: 1, localWaterTurbulence: 1 }))
      .toBe(both);
  });

  it("lets both hard rain and a turbulent nearby river mask an otherwise audible event", () => {
    const rain = calculateAmbientNoise({ rainIntensity: 1, localWaterTurbulence: 0 });
    const river = calculateAmbientNoise({ rainIntensity: 0, localWaterTurbulence: 1 });

    expect(evaluateAudibleContact(audible)).not.toBeNull();
    expect(rain).not.toBeNull();
    expect(river).not.toBeNull();
    expect(evaluateAudibleContact({ ...audible, ambientNoise: rain ?? 1 })).toBeNull();
    expect(evaluateAudibleContact({ ...audible, ambientNoise: river ?? 1 })).toBeNull();
  });

  it("fails closed instead of inventing quiet from malformed environmental channels", () => {
    expect(calculateAmbientNoise({ rainIntensity: -0.1, localWaterTurbulence: 0 }))
      .toBeNull();
    expect(calculateAmbientNoise({ rainIntensity: 0, localWaterTurbulence: Number.NaN }))
      .toBeNull();
    expect(calculateAmbientNoise(null as unknown as {
      rainIntensity: number;
      localWaterTurbulence: number;
    })).toBeNull();
  });
});
