import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import {
  canonicalLivingActorAddresses,
  createLivingActorAddress,
  headingFromRadians,
  headingToRadians,
  isLivingActorAddress,
  livingActorAddressForResident,
  livingActorAddressInRegionalWindow,
  livingActorDisplacement,
} from "./livingActor";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  createWorldPosition,
} from "./worldPosition";

describe("shared living actor address boundary", () => {
  it("stores canonical signed and extreme segmented positions without global floats", () => {
    const address = createLivingActorAddress({
      actorId: "D-v1-extreme-1",
      species: "domestic-dog",
      position: createWorldPosition(
        createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
        REGION_WIDTH_UNITS - 1,
        REGION_HEIGHT_UNITS - 1,
      ),
      heading: 999_999,
      persistence: "regional",
    });

    expect(isLivingActorAddress(address)).toBe(true);
    expect(address.position.region).toEqual({ x: -REGION_COORD_LIMIT, y: REGION_COORD_LIMIT });
    expect(Object.isFrozen(address)).toBe(true);
    expect(Object.isFrozen(address.position)).toBe(true);
    expect(isLivingActorAddress({ ...address, debug: true })).toBe(false);
    expect(isLivingActorAddress({ ...address, heading: -0 })).toBe(false);
  });

  it("adapts an existing human by stable identity without creating resident 43", () => {
    const state = createWorld("shared actor boundary", "standard");
    const view = createWorldView(state);
    const resident = view.residents[0];
    if (!resident) throw new Error("fixture needs a resident");

    const address = livingActorAddressForResident(view, resident);
    expect(address).not.toBeNull();
    expect(address?.actorId).toBe(resident.identity.stableId);
    expect(address?.species).toBe("human");
    expect(address?.persistence).toBe("promoted");
    expect(view.residents).toHaveLength(42);

    const impostor = structuredClone(resident);
    impostor.identity.stableId = `${resident.identity.stableId}-alias`;
    expect(livingActorAddressForResident(view, impostor)).toBeNull();
  });

  it("sorts active actors by stable ID and rejects duplicates and oversized sets", () => {
    const at = createWorldPosition(createRegionCoord(0, 0), 100, 200);
    const dog = createLivingActorAddress({
      actorId: "D-v1-b",
      species: "domestic-dog",
      position: at,
      persistence: "regional",
    });
    const human = createLivingActorAddress({
      actorId: "H-v1-a",
      species: "human",
      position: at,
      persistence: "promoted",
    });

    expect(canonicalLivingActorAddresses([dog, human]).map(({ actorId }) => actorId))
      .toEqual(["D-v1-b", "H-v1-a"]);
    expect(() => canonicalLivingActorAddresses([dog, { ...dog, species: "human" }]))
      .toThrow(/Invalid living actor address/u);
    expect(() => canonicalLivingActorAddresses([dog], 0)).toThrow(/bounded active budget/u);
  });

  it("projects only addresses inside the bounded regional terrain window", () => {
    const window = {
      origin: { x: -8 * 96, y: 12 * 72 },
      terrain: { width: 12, height: 10 },
    } as const;
    const inside = createLivingActorAddress({
      actorId: "D-v1-window",
      species: "domestic-dog",
      position: createWorldPosition(createRegionCoord(-8, 12), 2_500, 3_500),
      heading: 250_000,
      persistence: "regional",
    });
    const outside = createLivingActorAddress({
      ...inside,
      actorId: "D-v1-away",
      position: createWorldPosition(createRegionCoord(-7, 12), 2_500, 3_500),
    });

    expect(livingActorAddressInRegionalWindow(inside, window)).toMatchObject({
      actorId: "D-v1-window",
      species: "domestic-dog",
      point: { x: 2_500, y: 3_500 },
      tileIndex: 38,
      heading: 250_000,
    });
    expect(livingActorAddressInRegionalWindow(outside, window)).toBeNull();
  });

  it("uses exact local displacement and fails closed beyond safe flattening", () => {
    const left = createLivingActorAddress({
      actorId: "D-v1-left",
      species: "domestic-dog",
      position: createWorldPosition(createRegionCoord(-1, 0), REGION_WIDTH_UNITS - 10, 500),
      persistence: "regional",
    });
    const right = createLivingActorAddress({
      actorId: "H-v1-right",
      species: "human",
      position: createWorldPosition(createRegionCoord(0, 0), 20, 450),
      persistence: "promoted",
    });
    expect(livingActorDisplacement(left, right)).toEqual({ x: 30, y: -50 });

    const far = createLivingActorAddress({
      ...right,
      actorId: "H-v1-far",
      position: createWorldPosition(createRegionCoord(REGION_COORD_LIMIT, 0), 20, 450),
    });
    expect(livingActorDisplacement(left, far)).toBeNull();
  });

  it("roundtrips bounded fixed-point headings", () => {
    expect(headingFromRadians(0)).toBe(0);
    expect(headingFromRadians(Math.PI / 2)).toBe(250_000);
    expect(headingFromRadians(-Math.PI / 2)).toBe(750_000);
    expect(headingToRadians(500_000)).toBeCloseTo(Math.PI);
    expect(() => headingToRadians(1_000_000)).toThrow(/invalid/u);
  });
});
