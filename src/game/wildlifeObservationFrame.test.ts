import { describe, expect, it } from "vitest";

import {
  VISIBILITY_DIRECT,
  evaluatePerception,
  type PerceptionResult,
} from "./perception";
import {
  createWildlifeObservationFrame,
  isWildlifeObservationFrame,
  releaseWildlifeObservationFrame,
  type WildlifeObservationFrameInput,
} from "./wildlifeObservationFrame";

const COLUMNS = 3;
const ROWS = 2;
const PLAYER_TILE_INDEX = 1;

function observation(): WildlifeObservationFrameInput {
  return {
    window: {
      origin: { x: -2, y: 3 },
      terrain: { width: COLUMNS, height: ROWS },
    },
    perception: evaluatePerception({
      columns: COLUMNS,
      rows: ROWS,
      cells: Array.from(
        { length: COLUMNS * ROWS },
        () => ({ elevation: 0, obstruction: 0 }),
      ),
      playerTileIndex: PLAYER_TILE_INDEX,
      facingRadians: 0,
      weatherVisibility: 1,
    }),
  };
}

describe("wildlife observation frame", () => {
  it("creates one frozen authentic frame and rejects a structural counterfeit", () => {
    const input = observation();
    const frame = createWildlifeObservationFrame(input);

    expect(frame).not.toBeNull();
    expect(frame).toMatchObject({
      version: 1,
      playerTileIndex: PLAYER_TILE_INDEX,
      window: input.window,
    });
    expect(frame?.detailVisibilityGradeAt(PLAYER_TILE_INDEX)).toBe(VISIBILITY_DIRECT);
    expect(frame?.terrainVisibilityStrengthAt(PLAYER_TILE_INDEX)).toBe(255);
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame?.window)).toBe(true);
    expect(Object.isFrozen(frame?.window.origin)).toBe(true);
    expect(Object.isFrozen(frame?.window.terrain)).toBe(true);
    expect(Object.isFrozen(frame?.playerPoint)).toBe(true);
    expect(Object.isFrozen(frame?.frameOrigin)).toBe(true);
    expect(isWildlifeObservationFrame(frame)).toBe(true);

    const counterfeit = Object.freeze({ ...frame });
    expect(counterfeit).toEqual(frame);
    expect(isWildlifeObservationFrame(counterfeit)).toBe(false);
  });

  it("retains its authenticated scalar snapshot after caller-owned masks mutate", () => {
    const input = observation();
    const frame = createWildlifeObservationFrame(input);
    if (frame === null) throw new Error("Valid observation frame fixture was rejected");
    const detail = frame.detailVisibilityGradeAt(PLAYER_TILE_INDEX);
    const strength = frame.terrainVisibilityStrengthAt(PLAYER_TILE_INDEX);

    input.perception.visibilityGrades[PLAYER_TILE_INDEX] = 0;
    input.perception.terrainVisibilityStrengths[PLAYER_TILE_INDEX] = 0;
    input.perception.detailVisibilityGrades[PLAYER_TILE_INDEX] = 0;

    expect(frame.detailVisibilityGradeAt(PLAYER_TILE_INDEX)).toBe(detail);
    expect(frame.terrainVisibilityStrengthAt(PLAYER_TILE_INDEX)).toBe(strength);
    expect(isWildlifeObservationFrame(frame)).toBe(true);
  });

  it.each([
    "visibilityGrades",
    "terrainVisibilityStrengths",
    "detailVisibilityGrades",
  ] as const)("rejects a %s mutation made before authentication", (field) => {
    const input = observation();
    const mask = input.perception[field];
    mask[PLAYER_TILE_INDEX] = mask[PLAYER_TILE_INDEX] === 0
      ? 1
      : mask[PLAYER_TILE_INDEX]! - 1;

    expect(createWildlifeObservationFrame(input)).toBeNull();
  });

  it.each([
    ["an extra authority claim", (input: WildlifeObservationFrameInput): unknown => ({
      ...input,
      visible: true,
    })],
    ["same-sized transposed dimensions", (input: WildlifeObservationFrameInput): unknown => ({
      ...input,
      window: {
        ...input.window,
        terrain: { width: ROWS, height: COLUMNS },
      },
    })],
    ["an out-of-bounds player tile", (input: WildlifeObservationFrameInput): unknown => ({
      ...input,
      perception: {
        ...input.perception,
        playerTileIndex: COLUMNS * ROWS,
      } satisfies PerceptionResult,
    })],
    ["a negative-zero window coordinate", (input: WildlifeObservationFrameInput): unknown => ({
      ...input,
      window: {
        ...input.window,
        origin: { ...input.window.origin, x: -0 },
      },
    })],
  ] as const)("rejects %s", (_label, mutate) => {
    expect(createWildlifeObservationFrame(mutate(observation()))).toBeNull();
  });

  it("admits only canonical in-bounds scalar indices", () => {
    const frame = createWildlifeObservationFrame(observation());
    if (frame === null) throw new Error("Valid observation frame fixture was rejected");

    expect(frame.detailVisibilityGradeAt(0)).toEqual(expect.any(Number));
    expect(frame.terrainVisibilityStrengthAt(0)).toEqual(expect.any(Number));
    for (const invalid of [-1, -0, 0.5, COLUMNS * ROWS, Number.NaN]) {
      expect(frame.detailVisibilityGradeAt(invalid)).toBeUndefined();
      expect(frame.terrainVisibilityStrengthAt(invalid)).toBeUndefined();
    }
  });

  it("invalidates an authentic frame when its synchronous batch releases it", () => {
    const frame = createWildlifeObservationFrame(observation());
    if (frame === null) throw new Error("Valid observation frame fixture was rejected");
    expect(isWildlifeObservationFrame(frame)).toBe(true);

    releaseWildlifeObservationFrame(frame);

    expect(isWildlifeObservationFrame(frame)).toBe(false);
    expect(frame.detailVisibilityGradeAt(PLAYER_TILE_INDEX)).toBeUndefined();
    expect(frame.terrainVisibilityStrengthAt(PLAYER_TILE_INDEX)).toBeUndefined();
    expect(() => releaseWildlifeObservationFrame(frame)).not.toThrow();
  });
});
