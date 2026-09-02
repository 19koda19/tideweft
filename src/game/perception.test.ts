import { describe, expect, it } from "vitest";

import {
  DEFAULT_DETAIL_PERCEPTION_RANGES,
  DEFAULT_PERCEPTION_RANGES,
  PERCEPTION_VERSION,
  VISIBILITY_DIRECT,
  VISIBILITY_HIDDEN,
  VISIBILITY_PERIPHERAL,
  evaluateAudibleContact,
  evaluatePerception,
  type AudibleContactInput,
  type PerceptionCell,
  type PerceptionInput,
  type PerceptionRangeOverrides,
} from "./perception";

function flatCells(count: number): PerceptionCell[] {
  return Array.from({ length: count }, () => ({ elevation: 0, obstruction: 0 }));
}

interface SightOverrides {
  readonly cells?: readonly PerceptionCell[];
  readonly facingRadians?: number;
  readonly weatherVisibility?: number;
  readonly rangeOverrides?: PerceptionRangeOverrides;
  readonly detailRangeOverrides?: PerceptionRangeOverrides;
}

function sightInput(
  columns: number,
  rows: number,
  playerTileIndex: number,
  overrides: SightOverrides = {},
): PerceptionInput {
  return {
    columns,
    rows,
    cells: overrides.cells ?? flatCells(columns * rows),
    playerTileIndex,
    facingRadians: overrides.facingRadians ?? 0,
    weatherVisibility: overrides.weatherVisibility ?? 1,
    rangeOverrides: overrides.rangeOverrides ?? {
      closePeripheralRange: 2,
      directSightRange: 8,
      forwardConeRadians: Math.PI / 2,
    },
    ...(overrides.detailRangeOverrides
      ? { detailRangeOverrides: overrides.detailRangeOverrides }
      : {}),
  };
}

describe("deterministic visual perception", () => {
  it("handles the one-cell boundary and reports exact stable index partitions", () => {
    const result = evaluatePerception(sightInput(1, 1, 0, {
      cells: [{ elevation: 1, obstruction: 1 }],
      weatherVisibility: 0,
      rangeOverrides: {
        closePeripheralRange: 0,
        directSightRange: 0,
        forwardConeRadians: 0,
      },
    }));

    expect(result).toMatchObject({
      version: PERCEPTION_VERSION,
      valid: true,
      playerTileIndex: 0,
      visibleTileIndices: [0],
      directTileIndices: [0],
      peripheralTileIndices: [],
      detailVisibleTileIndices: [0],
      detailDirectTileIndices: [0],
      detailPeripheralTileIndices: [],
    });
    expect(result.visibilityGrades).toBeInstanceOf(Uint8Array);
    expect([...result.visibilityGrades]).toEqual([VISIBILITY_DIRECT]);
    expect(result.terrainVisibilityStrengths).toBeInstanceOf(Uint8Array);
    expect([...result.terrainVisibilityStrengths]).toEqual([255]);
    expect([...result.detailVisibilityGrades]).toEqual([VISIBILITY_DIRECT]);
    expect(result.signature).toMatch(/^perception-v2:[0-9a-f]{8}$/);
  });

  it("reveals broad terrain shape ahead while keeping distant detail undisclosed", () => {
    const result = evaluatePerception({
      columns: 31,
      rows: 1,
      cells: flatCells(31),
      playerTileIndex: 15,
      facingRadians: 0,
      weatherVisibility: 1,
    });

    expect(DEFAULT_PERCEPTION_RANGES.directSightRange)
      .toBeGreaterThan(DEFAULT_DETAIL_PERCEPTION_RANGES.directSightRange);
    expect(DEFAULT_PERCEPTION_RANGES.forwardConeRadians)
      .toBeGreaterThan(DEFAULT_DETAIL_PERCEPTION_RANGES.forwardConeRadians);
    expect(result.visibilityGrades[29]).toBe(VISIBILITY_PERIPHERAL);
    expect(result.detailVisibilityGrades[29]).toBe(VISIBILITY_HIDDEN);
    expect(result.detailVisibilityGrades[22]).toBe(VISIBILITY_DIRECT);
    expect(result.visibilityGrades[12]).toBe(VISIBILITY_PERIPHERAL);
    expect(result.detailVisibilityGrades[12]).toBe(VISIBILITY_HIDDEN);
    expect(result.detailVisibilityGrades[13]).toBe(VISIBILITY_PERIPHERAL);
    expect(result.visibleTileIndices.length).toBeGreaterThan(result.detailVisibleTileIndices.length);
    expect(result.detailVisibleTileIndices.every(
      (index) => result.visibilityGrades[index] !== VISIBILITY_HIDDEN,
    )).toBe(true);
  });

  it("feathers the authored terrain horizon without extending exact detail", () => {
    const result = evaluatePerception({
      columns: 45,
      rows: 1,
      cells: flatCells(45),
      playerTileIndex: 22,
      facingRadians: 0,
      weatherVisibility: 1,
    });

    expect(result.visibilityGrades[34]).toBe(VISIBILITY_DIRECT); // 12 tiles
    expect(result.visibilityGrades[35]).toBe(VISIBILITY_PERIPHERAL);
    expect(result.visibilityGrades[41]).toBe(VISIBILITY_PERIPHERAL); // 19 tiles
    expect(result.visibilityGrades[42]).toBe(VISIBILITY_HIDDEN); // zero-strength edge
    expect(result.visibilityGrades[43]).toBe(VISIBILITY_HIDDEN);
    expect(result.terrainVisibilityStrengths[34]).toBe(255);
    expect(result.terrainVisibilityStrengths[35]).toBeGreaterThan(
      result.terrainVisibilityStrengths[38] ?? 0,
    );
    expect(result.terrainVisibilityStrengths[38]).toBeGreaterThan(
      result.terrainVisibilityStrengths[40] ?? 0,
    );
    expect(result.terrainVisibilityStrengths[40]).toBeGreaterThan(
      result.terrainVisibilityStrengths[41] ?? 0,
    );
    expect(result.terrainVisibilityStrengths[41]).toBeGreaterThan(0);
    expect(result.terrainVisibilityStrengths[42]).toBe(0);
    expect(result.terrainVisibilityStrengths[43]).toBe(0);
    expect(result.detailVisibilityGrades[30]).toBe(VISIBILITY_DIRECT);
    expect(result.detailVisibilityGrades[31]).toBe(VISIBILITY_HIDDEN);
  });

  it("eases terrain strength across the forward angle without revealing detail", () => {
    const columns = 45;
    const playerX = 22;
    const playerY = 22;
    const indexAt = (x: number, y: number): number => y * columns + x;
    const result = evaluatePerception({
      columns,
      rows: 45,
      cells: flatCells(columns * 45),
      playerTileIndex: indexAt(playerX, playerY),
      facingRadians: 0,
      weatherVisibility: 1,
    });
    const center = indexAt(playerX + 10, playerY);
    const innerFeather = indexAt(playerX + 5, playerY + 10);
    const outerFeather = indexAt(playerX + 3, playerY + 9);
    const outside = indexAt(playerX + 2, playerY + 10);

    expect(result.terrainVisibilityStrengths[center]).toBe(255);
    expect(result.terrainVisibilityStrengths[innerFeather]).toBeLessThan(255);
    expect(result.terrainVisibilityStrengths[innerFeather]).toBeGreaterThan(
      result.terrainVisibilityStrengths[outerFeather] ?? 0,
    );
    expect(result.terrainVisibilityStrengths[outerFeather]).toBeGreaterThan(0);
    expect(result.terrainVisibilityStrengths[outside]).toBe(0);
    expect(result.detailVisibilityGrades[center]).toBe(VISIBILITY_HIDDEN);
    expect(result.detailVisibilityGrades[innerFeather]).toBe(VISIBILITY_HIDDEN);
    expect(result.detailVisibilityGrades[outerFeather]).toBe(VISIBILITY_HIDDEN);
  });

  it("eases the visible side of an occlusion frontier without disclosing behind it", () => {
    const cells = flatCells(45);
    cells[30] = { elevation: 0, obstruction: 1 };
    const result = evaluatePerception({
      columns: 45,
      rows: 1,
      cells,
      playerTileIndex: 22,
      facingRadians: 0,
      weatherVisibility: 1,
    });

    expect(result.terrainVisibilityStrengths[27]).toBe(255);
    expect(result.terrainVisibilityStrengths[28]).toBeGreaterThan(
      result.terrainVisibilityStrengths[29] ?? 0,
    );
    expect(result.terrainVisibilityStrengths[29]).toBeGreaterThan(
      result.terrainVisibilityStrengths[30] ?? 0,
    );
    expect(result.terrainVisibilityStrengths[30]).toBeGreaterThan(0);
    expect(result.terrainVisibilityStrengths[31]).toBe(0);
    expect(result.visibilityGrades[30]).not.toBe(VISIBILITY_HIDDEN);
    expect(result.visibilityGrades[31]).toBe(VISIBILITY_HIDDEN);
  });

  it("lets the authored angular boundary reach true darkness", () => {
    const columns = 15;
    const rows = 15;
    const playerX = 7;
    const playerY = 7;
    const target = playerY * columns + playerX + 6;
    const input = {
      columns,
      rows,
      cells: flatCells(columns * rows),
      playerTileIndex: playerY * columns + playerX,
      weatherVisibility: 1,
    } as const;
    const boundary = evaluatePerception({
      ...input,
      facingRadians: -(DEFAULT_PERCEPTION_RANGES.forwardConeRadians / 2),
    });
    const justInside = evaluatePerception({
      ...input,
      facingRadians: -(DEFAULT_PERCEPTION_RANGES.forwardConeRadians / 2) + 0.05,
    });

    expect(boundary.terrainVisibilityStrengths[target]).toBe(0);
    expect(boundary.visibilityGrades[target]).toBe(VISIBILITY_HIDDEN);
    expect(boundary.detailVisibilityGrades[target]).toBe(VISIBILITY_HIDDEN);
    expect(justInside.terrainVisibilityStrengths[target]).toBeGreaterThan(0);
    expect(justInside.visibilityGrades[target]).toBe(VISIBILITY_PERIPHERAL);
  });

  it("keeps close peripheral awareness 360 degrees while extending direct sight forward", () => {
    const result = evaluatePerception(sightInput(7, 3, 10, {
      facingRadians: 0,
      rangeOverrides: {
        closePeripheralRange: 1.5,
        directSightRange: 3,
        forwardConeRadians: Math.PI / 2,
      },
    }));

    // The porter faces east from (3, 1). East extends to the grid boundary.
    expect(result.directTileIndices).toEqual([4, 5, 10, 11, 12, 13, 18, 19]);
    // Close north, west, and south tiles remain anonymously perceptible.
    expect(result.peripheralTileIndices).toEqual([2, 3, 9, 16, 17]);
    expect(result.visibleTileIndices).toEqual([
      2, 3, 4, 5, 9, 10, 11, 12, 13, 16, 17, 18, 19,
    ]);
    expect(result.visibilityGrades[8]).toBe(VISIBILITY_HIDDEN);
    expect(result.visibilityGrades[9]).toBe(VISIBILITY_PERIPHERAL);
    expect(result.visibilityGrades[13]).toBe(VISIBILITY_DIRECT);
  });

  it("rotates the forward cone with finite wrapped and negative facings", () => {
    const east = evaluatePerception(sightInput(7, 1, 3, {
      facingRadians: 0,
      rangeOverrides: {
        closePeripheralRange: 1,
        directSightRange: 3,
        forwardConeRadians: Math.PI / 3,
      },
    }));
    const west = evaluatePerception(sightInput(7, 1, 3, {
      facingRadians: -Math.PI,
      rangeOverrides: {
        closePeripheralRange: 1,
        directSightRange: 3,
        forwardConeRadians: Math.PI / 3,
      },
    }));
    const wrappedEast = evaluatePerception(sightInput(7, 1, 3, {
      facingRadians: 12 * Math.PI,
      rangeOverrides: {
        closePeripheralRange: 1,
        directSightRange: 3,
        forwardConeRadians: Math.PI / 3,
      },
    }));

    expect(east.directTileIndices).toEqual([3, 4, 5, 6]);
    expect(east.peripheralTileIndices).toEqual([2]);
    expect(west.directTileIndices).toEqual([0, 1, 2, 3]);
    expect(west.peripheralTileIndices).toEqual([4]);
    expect(wrappedEast).toEqual(east);
    expect(west.signature).not.toBe(east.signature);
    expect([...wrappedEast.detailVisibilityGrades]).toEqual([...east.detailVisibilityGrades]);
    expect([...west.detailVisibilityGrades]).not.toEqual([...east.detailVisibilityGrades]);
  });

  it("shrinks both awareness radii with weather and closes at zero visibility", () => {
    const overrides = {
      closePeripheralRange: 2,
      directSightRange: 4,
      forwardConeRadians: Math.PI / 2,
    } as const;
    const clear = evaluatePerception(sightInput(9, 1, 4, {
      weatherVisibility: 1,
      rangeOverrides: overrides,
    }));
    const poor = evaluatePerception(sightInput(9, 1, 4, {
      weatherVisibility: 0.5,
      rangeOverrides: overrides,
    }));
    const blind = evaluatePerception(sightInput(9, 1, 4, {
      weatherVisibility: 0,
      rangeOverrides: overrides,
    }));

    expect(clear.visibleTileIndices).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(poor.visibleTileIndices).toEqual([3, 4, 5, 6]);
    expect(blind.visibleTileIndices).toEqual([4]);
    expect(clear.detailVisibleTileIndices).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(poor.detailVisibleTileIndices).toEqual([3, 4, 5, 6]);
    expect(blind.detailVisibleTileIndices).toEqual([4]);
    expect(clear.terrainVisibilityStrengths.filter((strength) => strength > 0).length)
      .toBe(clear.visibleTileIndices.length);
    expect(poor.terrainVisibilityStrengths.filter((strength) => strength > 0).length)
      .toBe(poor.visibleTileIndices.length);
    expect([...blind.terrainVisibilityStrengths]).toEqual([0, 0, 0, 0, 255, 0, 0, 0, 0]);
    expect(clear.visibleTileIndices.length).toBeGreaterThan(poor.visibleTileIndices.length);
    expect(poor.visibleTileIndices.length).toBeGreaterThan(blind.visibleTileIndices.length);
  });

  it("shows an obstructing tile but deterministically hides every tile behind it", () => {
    const cells = flatCells(6);
    cells[2] = { elevation: 0, obstruction: 0.5 };
    const result = evaluatePerception(sightInput(6, 1, 0, {
      cells,
      rangeOverrides: {
        closePeripheralRange: 0,
        directSightRange: 5,
        forwardConeRadians: Math.PI / 2,
      },
    }));

    expect([...result.visibilityGrades]).toEqual([2, 2, 2, 0, 0, 0]);
    expect(result.visibleTileIndices).toEqual([0, 1, 2]);
    expect(result.visibleTileIndices).not.toContain(3);
    expect(result.terrainVisibilityStrengths[3]).toBe(0);
    expect([...result.detailVisibilityGrades]).toEqual([2, 2, 2, 0, 0, 0]);
  });

  it("uses intermediate elevation as a Bresenham terrain horizon", () => {
    const cells = flatCells(5);
    cells[2] = { elevation: 0.5, obstruction: 0 };
    const result = evaluatePerception(sightInput(5, 1, 0, {
      cells,
      rangeOverrides: {
        closePeripheralRange: 0,
        directSightRange: 4,
        forwardConeRadians: Math.PI / 2,
      },
    }));

    expect(result.valid).toBe(true);
    expect(result.visibleTileIndices).toEqual([0, 1, 2]);
    expect([...result.visibilityGrades]).toEqual([2, 2, 2, 0, 0]);
  });

  it("fails the whole snapshot closed for malformed dimensions, cells, player, angles, or ranges", () => {
    const malformed: PerceptionInput[] = [
      { ...sightInput(2, 1, 0), columns: -2 },
      { ...sightInput(2, 1, 0), rows: 0 },
      { ...sightInput(2, 1, 0), cells: [{ elevation: 0, obstruction: 0 }] },
      {
        ...sightInput(2, 1, 0),
        cells: [{ elevation: Number.NaN, obstruction: 0 }, { elevation: 0, obstruction: 0 }],
      },
      {
        ...sightInput(2, 1, 0),
        cells: [{ elevation: 0, obstruction: -0.01 }, { elevation: 0, obstruction: 0 }],
      },
      { ...sightInput(2, 1, 0), playerTileIndex: 2 },
      { ...sightInput(2, 1, 0), facingRadians: Number.NaN },
      { ...sightInput(2, 1, 0), weatherVisibility: Number.POSITIVE_INFINITY },
      {
        ...sightInput(2, 1, 0),
        rangeOverrides: { closePeripheralRange: -1 },
      },
      {
        ...sightInput(2, 1, 0),
        rangeOverrides: { closePeripheralRange: 2, directSightRange: 1 },
      },
      {
        ...sightInput(4, 1, 0),
        detailRangeOverrides: { closePeripheralRange: -1 },
      },
      {
        ...sightInput(4, 1, 0),
        detailRangeOverrides: { closePeripheralRange: 1, directSightRange: 9 },
      },
      {
        ...sightInput(4, 1, 0),
        detailRangeOverrides: { forwardConeRadians: Math.PI },
      },
    ];

    for (const input of malformed) {
      const result = evaluatePerception(input);
      expect(result.valid).toBe(false);
      expect([...result.visibilityGrades].every((grade) => grade === VISIBILITY_HIDDEN)).toBe(true);
      expect(result.visibleTileIndices).toEqual([]);
      expect(result.directTileIndices).toEqual([]);
      expect(result.peripheralTileIndices).toEqual([]);
      expect([...result.terrainVisibilityStrengths].every((strength) => strength === 0)).toBe(true);
      expect([...result.detailVisibilityGrades].every(
        (grade) => grade === VISIBILITY_HIDDEN,
      )).toBe(true);
      expect(result.detailVisibleTileIndices).toEqual([]);
      expect(result.detailDirectTileIndices).toEqual([]);
      expect(result.detailPeripheralTileIndices).toEqual([]);
    }
  });

  it("does not encode occluded cell values in the disclosed result signature", () => {
    const firstCells = flatCells(5);
    firstCells[1] = { elevation: 0, obstruction: 1 };
    const changedHiddenCells = firstCells.map((cell) => ({ ...cell }));
    changedHiddenCells[3] = { elevation: 1, obstruction: 1 };
    changedHiddenCells[4] = { elevation: 0.75, obstruction: 0.9 };
    const ranges = {
      closePeripheralRange: 0,
      directSightRange: 4,
      forwardConeRadians: Math.PI / 2,
    } as const;

    const first = evaluatePerception(sightInput(5, 1, 0, {
      cells: firstCells,
      rangeOverrides: ranges,
    }));
    const changed = evaluatePerception(sightInput(5, 1, 0, {
      cells: changedHiddenCells,
      rangeOverrides: ranges,
    }));

    expect(changed.visibilityGrades).toEqual(first.visibilityGrades);
    expect(changed.detailVisibilityGrades).toEqual(first.detailVisibilityGrades);
    expect(changed.visibleTileIndices).toEqual(first.visibleTileIndices);
    expect(changed.signature).toBe(first.signature);
    expect(JSON.stringify(first)).not.toContain("elevation");
    expect(JSON.stringify(first)).not.toContain("obstruction");
  });

  it("includes disclosed detail grades in the deterministic signature", () => {
    const terrainRanges = {
      closePeripheralRange: 2,
      directSightRange: 6,
      forwardConeRadians: Math.PI,
    } as const;
    const narrow = evaluatePerception(sightInput(7, 1, 0, {
      rangeOverrides: terrainRanges,
      detailRangeOverrides: {
        closePeripheralRange: 1,
        directSightRange: 2,
        forwardConeRadians: Math.PI / 2,
      },
    }));
    const broad = evaluatePerception(sightInput(7, 1, 0, {
      rangeOverrides: terrainRanges,
      detailRangeOverrides: {
        closePeripheralRange: 1,
        directSightRange: 4,
        forwardConeRadians: Math.PI / 2,
      },
    }));

    expect(broad.visibilityGrades).toEqual(narrow.visibilityGrades);
    expect(broad.detailVisibilityGrades).not.toEqual(narrow.detailVisibilityGrades);
    expect(broad.signature).not.toBe(narrow.signature);
  });

  it("includes eased terrain strengths in the deterministic signature", () => {
    const noCloseField = evaluatePerception(sightInput(5, 1, 0, {
      rangeOverrides: {
        closePeripheralRange: 0,
        directSightRange: 4,
        forwardConeRadians: Math.PI / 2,
      },
    }));
    const broadCloseField = evaluatePerception(sightInput(5, 1, 0, {
      rangeOverrides: {
        closePeripheralRange: 2,
        directSightRange: 4,
        forwardConeRadians: Math.PI / 2,
      },
    }));

    expect(broadCloseField.visibilityGrades).toEqual(noCloseField.visibilityGrades);
    expect(broadCloseField.detailVisibilityGrades).toEqual(noCloseField.detailVisibilityGrades);
    expect(broadCloseField.terrainVisibilityStrengths)
      .not.toEqual(noCloseField.terrainVisibilityStrengths);
    expect(broadCloseField.signature).not.toBe(noCloseField.signature);
  });

  it("is replay-stable, sorted, and does not mutate its input", () => {
    const input = sightInput(5, 3, 7, {
      facingRadians: -0.35,
      weatherVisibility: 0.72,
    });
    const before = JSON.stringify(input);
    const first = evaluatePerception(input);

    for (let iteration = 0; iteration < 20; iteration += 1) {
      expect(evaluatePerception(input)).toEqual(first);
    }
    expect(JSON.stringify(input)).toBe(before);
    expect(first.visibleTileIndices).toEqual([...first.visibleTileIndices].sort((a, b) => a - b));
    expect(new Set(first.visibilityGrades)).toEqual(new Set([0, 1, 2]));
  });
});

const BASE_SOUND: AudibleContactInput = {
  listener: { x: -10, y: -5 },
  source: { x: -4, y: -5 },
  baseRange: 10,
  ambientNoise: 0,
  sourceLoudness: 1,
  wind: { x: 0, y: 0 },
};

describe("anonymous directional audible contacts", () => {
  it("accepts negative world coordinates and returns only uncertain contact data", () => {
    const contact = evaluateAudibleContact(BASE_SOUND);

    expect(contact).not.toBeNull();
    expect(contact?.bearing.centerRadians).toBe(0);
    expect(contact?.bearing.uncertaintyRadians).toBeGreaterThan(0);
    expect(contact?.distanceBand.minimum).toBeLessThan(6);
    expect(contact?.distanceBand.maximum).toBeGreaterThan(6);
    expect(contact?.certainty).toBeGreaterThan(0);
    expect(contact?.certainty).toBeLessThan(1);
    expect(Object.keys(contact ?? {})).toEqual(["bearing", "distanceBand", "certainty"]);
    expect(contact).not.toHaveProperty("source");
    expect(contact).not.toHaveProperty("sourceTileIndex");
    expect(contact).not.toHaveProperty("identity");
    expect(contact).not.toHaveProperty("exactDistance");
  });

  it("returns null outside effective range and at fully masked or silent boundaries", () => {
    expect(evaluateAudibleContact({ ...BASE_SOUND, baseRange: 5 })).toBeNull();
    expect(evaluateAudibleContact({ ...BASE_SOUND, ambientNoise: 1 })).toBeNull();
    expect(evaluateAudibleContact({ ...BASE_SOUND, sourceLoudness: 0 })).toBeNull();
  });

  it("uses wind direction from source to listener when deciding the range boundary", () => {
    const distant: AudibleContactInput = {
      listener: { x: 0, y: 0 },
      source: { x: 9, y: 0 },
      baseRange: 8,
      ambientNoise: 0,
      sourceLoudness: 1,
      wind: { x: 0, y: 0 },
    };

    expect(evaluateAudibleContact(distant)).toBeNull();
    expect(evaluateAudibleContact({ ...distant, wind: { x: -1, y: 0 } })).not.toBeNull();
    expect(evaluateAudibleContact({ ...distant, wind: { x: 1, y: 0 } })).toBeNull();
  });

  it("fails closed for negative scalar ranges and all non-finite channels", () => {
    expect(evaluateAudibleContact({ ...BASE_SOUND, baseRange: -1 })).toBeNull();
    expect(evaluateAudibleContact({ ...BASE_SOUND, ambientNoise: -0.1 })).toBeNull();
    expect(evaluateAudibleContact({ ...BASE_SOUND, sourceLoudness: Number.NaN })).toBeNull();
    expect(evaluateAudibleContact({
      ...BASE_SOUND,
      listener: { x: Number.NEGATIVE_INFINITY, y: 0 },
    })).toBeNull();
    expect(evaluateAudibleContact({
      ...BASE_SOUND,
      wind: { x: Number.NaN, y: 0 },
    })).toBeNull();
  });

  it("returns exactly the same anonymous band for identical input", () => {
    const crosswind = {
      ...BASE_SOUND,
      ambientNoise: 0.2,
      sourceLoudness: 0.9,
      wind: { x: 0, y: -0.6 },
    } satisfies AudibleContactInput;
    const first = evaluateAudibleContact(crosswind);

    expect(first).not.toBeNull();
    for (let iteration = 0; iteration < 20; iteration += 1) {
      expect(evaluateAudibleContact(crosswind)).toEqual(first);
    }
  });
});
