import { describe, expect, it } from "vitest";

import { createCraftingInventory } from "../game/crafting";
import {
  LOOSE_CARGO_MAX_ENTITIES,
  LOOSE_CARGO_TILE_UNITS,
  createLooseCargoCarrier,
  createLooseCargoWorld,
  deserializeLooseCargoWorld,
  dropLooseCargo,
  scatterLooseCargo,
  serializeLooseCargoWorld,
  type LooseCargoWorldState,
} from "../game/looseCargo";
import {
  EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE,
  LOOSE_CARGO_MOBILE_HIT_DIAMETER_PX,
  beginLooseCargoPointerPress,
  beginLooseCargoTouch,
  cancelLooseCargoPointerPress,
  completeLooseCargoPointerPress,
  endLooseCargoTouch,
  hitTestLooseCargoScreen,
  keyboardLooseCargoRecoveryCommand,
  looseCargoHitRadiusPixels,
  looseCargoRecoveryLabel,
  looseCargoTouchCanDispatch,
  looseCargoVisual,
  moveLooseCargoPointerPress,
  nearestRecoverableLooseCargo,
  projectLooseCargoWorld,
  releaseLooseCargoPointerCaptures,
  resolveLooseCargoPointerRelease,
  safeLooseCargoViews,
} from "./looseCargoPresentation";

import type { LooseCargoView, RendererCommand } from "./types";

const PLAYER = { kind: "player", id: "courier-1" } as const;
const REGION = { x: -9_007_199_254_740_000, y: 9_007_199_254_740_000 } as const;

function droppedWorld(): LooseCargoWorldState {
  const world = createLooseCargoWorld(32, 24, REGION);
  const carrier = createLooseCargoCarrier(
    PLAYER,
    createCraftingInventory(100_000, { cordreed: 4 }),
  );
  const dropped = dropLooseCargo(world, carrier, {
    lotId: "crafting-stack:cordreed",
    quantity: 2,
    x: LOOSE_CARGO_TILE_UNITS * 2,
    y: LOOSE_CARGO_TILE_UNITS * 3,
  });
  expect(dropped.ok).toBe(true);
  return dropped.world;
}

function projected(world = droppedWorld()): readonly LooseCargoView[] {
  return projectLooseCargoWorld(world, {
    worldOrigin: { x: -120, y: 48 },
    worldUnitsPerTile: 24,
    viewerOwner: PLAYER,
    player: {
      region: REGION,
      position: { x: -72, y: 120 },
      recoveryReach: 2,
    },
  });
}

function mutateEntity(
  world: LooseCargoWorldState,
  patch: Record<string, unknown>,
): LooseCargoWorldState {
  const raw = JSON.parse(serializeLooseCargoWorld(world)) as {
    entities: Array<Record<string, unknown>>;
  };
  raw.entities[0] = { ...raw.entities[0], ...patch };
  return deserializeLooseCargoWorld(JSON.stringify(raw));
}

function view(id: string, x: number, overrides: Partial<LooseCargoView> = {}): LooseCargoView {
  return {
    id,
    region: { x: 0, y: 0 },
    position: { x, y: 0 },
    velocity: { x: 0, y: 0 },
    contentKind: "raw-material",
    resourceKind: "cordreed",
    resourceLabel: "Cordreed",
    quantity: 1,
    property: "ordinary",
    condition: 1,
    conditionBand: "sound",
    wetness: 0,
    contamination: 0,
    decay: 0,
    motion: "resting",
    snaggedBy: null,
    impactMark: "none",
    recoverable: true,
    recovery: "approach",
    ...overrides,
  };
}

const screenProject = (parcel: LooseCargoView) => parcel.position;

describe("loose cargo production projection", () => {
  it("keeps stable IDs, exact points, signed distant regions, and JSON round trips", () => {
    const world = deserializeLooseCargoWorld(serializeLooseCargoWorld(droppedWorld()));
    const [parcel] = projected(world);
    expect(parcel).toMatchObject({
      id: `lc:${REGION.x}:${REGION.y}:parcel:1`,
      region: REGION,
      position: { x: -72, y: 120 },
      velocity: { x: 0, y: 0 },
      contentKind: "raw-material",
      resourceKind: "cordreed",
      resourceLabel: "Cordreed",
      quantity: 2,
      conditionBand: "sound",
      recovery: "reachable",
    });
    const [distant] = projectLooseCargoWorld(world, {
      worldOrigin: { x: 8_000_000_000_000, y: -8_000_000_000_000 },
      worldUnitsPerTile: 24,
      viewerOwner: PLAYER,
    });
    expect(distant?.position).toEqual({
      x: 8_000_000_000_048,
      y: -7_999_999_999_928,
    });
  });

  it("projects Promise association without destination or reward data", () => {
    const world = createLooseCargoWorld(8, 8);
    const carrier = createLooseCargoCarrier(
      PLAYER,
      createCraftingInventory(100_000),
      [{
        contractId: 47,
        resource: "medicine",
        quantity: 2,
        property: "fragile",
        condition: 700_000,
        contamination: 250_000,
      }],
    );
    const result = dropLooseCargo(world, carrier, {
      lotId: "promise:47",
      x: LOOSE_CARGO_TILE_UNITS,
      y: LOOSE_CARGO_TILE_UNITS,
    });
    const [parcel] = projectLooseCargoWorld(result.world, {
      worldOrigin: { x: 0, y: 0 },
      worldUnitsPerTile: 24,
      viewerOwner: PLAYER,
    });
    expect(parcel).toMatchObject({
      contentKind: "promise",
      resourceKind: "medicine",
      resourceLabel: "Medicine Promise cargo",
      promiseContractId: 47,
      conditionBand: "worn",
      contamination: 0.25,
    });
    expect(Object.keys(parcel ?? {})).not.toContain("destination");
    expect(Object.keys(parcel ?? {})).not.toContain("reward");
  });

  it("distinguishes water, condition, rock impact, motion, and both snag types", () => {
    const base = droppedWorld();
    const wetRock = mutateEntity(base, {
      materialState: { condition: 220_000, contamination: 760_000, decay: 410_000 },
      velocityX: 80_000,
      velocityY: -20_000,
      motion: "tumbling",
      snaggedBy: null,
      causalSignature: "rock-impact,water-immersion|impact:3",
    });
    const [parcel] = projected(wetRock);
    expect(parcel).toMatchObject({
      conditionBand: "damaged",
      wetness: 1,
      contamination: 0.76,
      decay: 0.41,
      motion: "tumbling",
      impactMark: "rock",
    });
    expect(looseCargoVisual(parcel!).motionMark).toBe("tumble");
    expect(looseCargoVisual(parcel!).conditionMark).toBe("crack");
    expect(looseCargoVisual(parcel!).wetMark).toBe(true);
    expect(looseCargoVisual(parcel!).contaminationMarks).toBe(3);

    for (const snaggedBy of ["mangrove", "bramble"] as const) {
      const snagged = projected(mutateEntity(base, {
        motion: "snagged",
        snaggedBy,
        causalSignature: `${snaggedBy}-snag|impact:0`,
      }))[0]!;
      expect(looseCargoVisual(snagged).motionMark).toBe("caught");
      expect(looseCargoVisual(snagged).snagMark).toBe(snaggedBy === "mangrove" ? "roots" : "thorns");
    }
  });

  it("gives Chart and Relief one identical non-color semantic descriptor", () => {
    const parcel = projected(mutateEntity(droppedWorld(), {
      velocityX: 100_000,
      velocityY: 50_000,
      motion: "drifting",
      causalSignature: "current-drift,water-immersion|impact:0",
    }))[0]!;
    const chartDescriptor = looseCargoVisual(parcel);
    const reliefDescriptor = looseCargoVisual(parcel);
    expect(reliefDescriptor).toEqual(chartDescriptor);
    expect(chartDescriptor).toMatchObject({
      motionMark: "wake",
      wetMark: true,
      conditionMark: "none",
      snagMark: "none",
    });
    expect(Math.hypot(chartDescriptor.wake.x, chartDescriptor.wake.y)).toBeCloseTo(1);
  });

  it("fails closed for malformed worlds, invalid projection scale, duplicate IDs, and nonfinite points", () => {
    expect(projectLooseCargoWorld({ version: 1 }, {
      worldOrigin: { x: 0, y: 0 },
      worldUnitsPerTile: 24,
      viewerOwner: PLAYER,
    })).toEqual([]);
    expect(projectLooseCargoWorld(droppedWorld(), {
      worldOrigin: { x: 0, y: 0 },
      worldUnitsPerTile: Number.NaN,
      viewerOwner: PLAYER,
    })).toEqual([]);
    const valid = view("a", 0);
    expect(safeLooseCargoViews([valid, { ...valid }])).toEqual([]);
    expect(safeLooseCargoViews([{ ...valid, position: { x: Number.NaN, y: 0 } }])).toEqual([]);
    expect(hitTestLooseCargoScreen([valid, { ...valid }], { x: 0, y: 0 }, 22, screenProject)).toBeNull();
  });

  it("honors ownership and exposes a clear recovery affordance", () => {
    const world = createLooseCargoWorld(8, 8);
    const other = createLooseCargoCarrier(
      { kind: "player", id: "porter-else" },
      createCraftingInventory(100_000, { cordreed: 1 }),
    );
    const result = dropLooseCargo(world, other, {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: LOOSE_CARGO_TILE_UNITS,
      y: LOOSE_CARGO_TILE_UNITS,
    });
    expect(result.reason).toBe("ready");
    const parcel = projectLooseCargoWorld(result.world, {
      worldOrigin: { x: 0, y: 0 },
      worldUnitsPerTile: 24,
      viewerOwner: PLAYER,
    })[0]!;
    expect(parcel).toMatchObject({ recoverable: false, recovery: "unavailable" });
    expect(hitTestLooseCargoScreen([parcel], parcel.position, 22, screenProject)).toBeNull();
    expect(looseCargoRecoveryLabel(parcel, true)).toContain("CLAIMED");
  });

  it("keeps keyboard recovery immediate while touch may approach and recover", () => {
    const reachable = view("parcel-a", 0, { recovery: "reachable" });
    expect(keyboardLooseCargoRecoveryCommand(reachable)).toEqual({
      type: "parcel-target",
      parcelId: "parcel-a",
      recoverOnArrival: false,
    });
    expect(keyboardLooseCargoRecoveryCommand(view("parcel-b", 0, { recovery: "approach" })))
      .toBeNull();

    const press = beginLooseCargoPointerPress(
      1, { x: 0, y: 0 }, [reachable], 22, 18, screenProject, "chart-2d",
    );
    expect(resolveLooseCargoPointerRelease(
      press, 1, { x: 0, y: 0 }, [reachable], 22, screenProject, "chart-2d", true,
    )).toEqual({
      consumesWorldTap: true,
      command: { type: "parcel-target", parcelId: "parcel-a", recoverOnArrival: true },
    });
  });

  it("projects the full 64-parcel loaded mobile budget without truncation", () => {
    let world = createLooseCargoWorld(16, 16);
    let carrier = createLooseCargoCarrier(
      PLAYER,
      createCraftingInventory(1_000_000, { cordreed: LOOSE_CARGO_MAX_ENTITIES }),
    );
    for (let index = 0; index < LOOSE_CARGO_MAX_ENTITIES; index += 1) {
      const result = dropLooseCargo(world, carrier, {
        lotId: "crafting-stack:cordreed",
        quantity: 1,
        x: (index % 8) * LOOSE_CARGO_TILE_UNITS,
        y: Math.floor(index / 8) * LOOSE_CARGO_TILE_UNITS,
      });
      expect(result.ok).toBe(true);
      world = result.world;
      carrier = result.carrier;
    }
    const parcels = projectLooseCargoWorld(world, {
      worldOrigin: { x: 0, y: 0 },
      worldUnitsPerTile: 24,
      viewerOwner: PLAYER,
    });
    expect(parcels).toHaveLength(LOOSE_CARGO_MAX_ENTITIES);
    expect(safeLooseCargoViews(parcels)).toHaveLength(LOOSE_CARGO_MAX_ENTITIES);
    expect(safeLooseCargoViews([...parcels, view("overflow", 0)])).toEqual([]);
  });

  it("projects two fall fragments as two exact IDs without quantity loss", () => {
    const world = createLooseCargoWorld(8, 8);
    const carrier = createLooseCargoCarrier(
      PLAYER,
      createCraftingInventory(100_000, { cordreed: 2 }),
    );
    const result = scatterLooseCargo(world, carrier, {
      lotId: "crafting-stack:cordreed",
      x: LOOSE_CARGO_TILE_UNITS,
      y: LOOSE_CARGO_TILE_UNITS,
      cause: "fall-separation",
      parts: [
        { quantity: 1, velocityX: 80_000, velocityY: 0 },
        { quantity: 1, velocityX: 0, velocityY: 0 },
      ],
    });
    const parcels = projectLooseCargoWorld(result.world, {
      worldOrigin: { x: 0, y: 0 },
      worldUnitsPerTile: 24,
      viewerOwner: PLAYER,
    });
    expect(new Set(parcels.map(({ id }) => id)).size).toBe(2);
    expect(parcels.reduce((total, parcel) => total + parcel.quantity, 0)).toBe(2);
    expect(parcels.map(({ motion }) => motion)).toEqual(["tumbling", "resting"]);
  });
});

describe("loose cargo exact-ID targeting", () => {
  it("uses a 44px minimum mobile target without changing the visual body", () => {
    expect(LOOSE_CARGO_MOBILE_HIT_DIAMETER_PX).toBe(44);
    expect(looseCargoHitRadiusPixels(true, 6)).toBe(22);
    expect(looseCargoHitRadiusPixels(false, 6)).toBe(11);
    expect(hitTestLooseCargoScreen([view("parcel", 0)], { x: 21.99, y: 0 }, 22, screenProject)?.parcel.id)
      .toBe("parcel");
    expect(hitTestLooseCargoScreen([view("parcel", 0)], { x: 22.01, y: 0 }, 22, screenProject))
      .toBeNull();
  });

  it("breaks overlaps by stable ID independently of array order", () => {
    const parcels = [view("parcel-b", 0), view("parcel-a", 0)] as const;
    expect(hitTestLooseCargoScreen(parcels, { x: 0, y: 0 }, 22, screenProject)?.parcel.id)
      .toBe("parcel-a");
    expect(hitTestLooseCargoScreen([...parcels].reverse(), { x: 0, y: 0 }, 22, screenProject)?.parcel.id)
      .toBe("parcel-a");
    expect(nearestRecoverableLooseCargo(parcels, { x: 0, y: 0 }, 2)?.id).toBe("parcel-a");
  });

  it("consumes an overlapping harbor/resource world tap as an exact parcel command", () => {
    const parcels = [view("parcel-a", 0)] as const;
    const press = beginLooseCargoPointerPress(17, { x: 0, y: 0 }, parcels, 22, 18, screenProject, "chart-2d");
    const release = resolveLooseCargoPointerRelease(
      press,
      17,
      { x: 0, y: 0 },
      parcels,
      22,
      screenProject,
      "chart-2d",
      true,
    );
    expect(release).toEqual({
      consumesWorldTap: true,
      command: { type: "parcel-target", parcelId: "parcel-a", recoverOnArrival: true },
    });
  });

  it("confirms down-move-up against the same stable ID after reorder", () => {
    const parcels = [view("parcel-b", 30), view("parcel-a", 0)] as const;
    let press = beginLooseCargoPointerPress(7, { x: 0, y: 0 }, parcels, 22, 12, screenProject, "chart-2d");
    press = moveLooseCargoPointerPress(press, 7, { x: 5, y: 0 });
    expect(completeLooseCargoPointerPress(
      press,
      7,
      { x: 5, y: 0 },
      [...parcels].reverse(),
      22,
      screenProject,
      "chart-2d",
    )).toBe("parcel-a");
  });

  it("resolves a moving parcel by stable ID even when it drifts away from a still finger", () => {
    const initial = [view("parcel-a", 0)] as const;
    const press = beginLooseCargoPointerPress(1, { x: 0, y: 0 }, initial, 22, 18, screenProject, "relief-3d");
    const moved = [view("parcel-a", 60, { motion: "drifting", velocity: { x: 2, y: 0 } })] as const;
    expect(completeLooseCargoPointerPress(
      press, 1, { x: 0, y: 0 }, moved, 22, screenProject, "relief-3d",
    )).toBe("parcel-a");
    expect(completeLooseCargoPointerPress(
      press, 1, { x: 100, y: 0 }, moved, 22, screenProject, "relief-3d",
    )).toBeNull();
  });

  it("cancels when the pressed ID disappears, becomes unavailable, or projects invalidly", () => {
    const parcels = [view("parcel-a", 0)] as const;
    const press = beginLooseCargoPointerPress(1, { x: 0, y: 0 }, parcels, 22, 18, screenProject, "chart-2d");
    expect(completeLooseCargoPointerPress(
      press, 1, { x: 0, y: 0 }, [], 22, screenProject, "chart-2d",
    )).toBeNull();
    expect(resolveLooseCargoPointerRelease(
      press, 1, { x: 0, y: 0 }, [], 22, screenProject, "chart-2d", true,
    )).toEqual({ consumesWorldTap: true, command: null });
    expect(completeLooseCargoPointerPress(
      press,
      1,
      { x: 0, y: 0 },
      [view("parcel-a", 0, { recoverable: false, recovery: "unavailable" })],
      22,
      screenProject,
      "chart-2d",
    )).toBeNull();
    expect(completeLooseCargoPointerPress(
      press, 1, { x: 0, y: 0 }, parcels, 22, () => null, "chart-2d",
    )).toBeNull();
  });

  it("clears on pointercancel, lost capture, blur, excess travel, or mode switch", () => {
    const parcels = [view("parcel-a", 0)] as const;
    const press = beginLooseCargoPointerPress(3, { x: 0, y: 0 }, parcels, 22, 12, screenProject, "chart-2d");
    expect(cancelLooseCargoPointerPress(press, 99)).toBe(press);
    expect(cancelLooseCargoPointerPress(press, 3)).toBeNull(); // pointercancel / lost capture
    expect(cancelLooseCargoPointerPress(press)).toBeNull(); // blur / visibility / mode deactivation
    expect(moveLooseCargoPointerPress(press, 3, { x: 30, y: 0 })).toBeNull();
    expect(completeLooseCargoPointerPress(
      press, 3, { x: 0, y: 0 }, parcels, 22, screenProject, "relief-3d",
    )).toBeNull();
  });

  it("never falls back from a hidden or malformed exact target", () => {
    const unavailable = view("parcel-a", 0, { recoverable: false, recovery: "unavailable" });
    expect(beginLooseCargoPointerPress(
      1, { x: 0, y: 0 }, [unavailable], 22, 18, screenProject, "chart-2d",
    )).toBeNull();
    expect(hitTestLooseCargoScreen(
      [view("parcel-a", 0)], { x: 0, y: 0 }, 22, () => ({ x: Number.NaN, y: 0 }),
    )).toBeNull();
  });

  it("keeps rapid repeated taps addressed to the same stable ID", () => {
    const parcels = [view("parcel-a", 0)] as const;
    const first = beginLooseCargoPointerPress(1, { x: 0, y: 0 }, parcels, 22, 18, screenProject, "chart-2d");
    const second = beginLooseCargoPointerPress(2, { x: 0, y: 0 }, [...parcels], 22, 18, screenProject, "chart-2d");
    expect(completeLooseCargoPointerPress(first, 1, { x: 0, y: 0 }, parcels, 22, screenProject, "chart-2d"))
      .toBe("parcel-a");
    expect(completeLooseCargoPointerPress(second, 2, { x: 0, y: 0 }, parcels, 22, screenProject, "chart-2d"))
      .toBe("parcel-a");
  });

  it.each([
    [[1, 2], "first then second"],
    [[2, 1], "second then first"],
  ] as const)("suppresses a two-finger Chart sequence released %s (%s)", (releaseOrder, _description) => {
    let sequence = beginLooseCargoTouch(EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE, 1);
    sequence = beginLooseCargoTouch(sequence, 2);
    expect(sequence.suppressed).toBe(true);
    const dispatched: RendererCommand[] = [];
    for (const pointerId of releaseOrder) {
      if (looseCargoTouchCanDispatch(sequence, pointerId)) {
        dispatched.push(pointerId === 1
          ? { type: "parcel-target", parcelId: "parcel-a", recoverOnArrival: true }
          : { type: "move-target", point: { x: 100, y: 100 }, additive: false });
      }
      sequence = endLooseCargoTouch(sequence, pointerId);
    }
    expect(dispatched).toEqual([]);
    expect(sequence).toBe(EMPTY_LOOSE_CARGO_TOUCH_SEQUENCE);
  });

  it("releases every captured touch before a canvas is hidden or destroyed", () => {
    const released: number[] = [];
    releaseLooseCargoPointerCaptures({
      hasPointerCapture: (pointerId) => {
        if (pointerId === 3) throw new Error("detached before capture query");
        return pointerId === 5 || pointerId === 8;
      },
      releasePointerCapture: (pointerId) => {
        released.push(pointerId);
        if (pointerId === 5) throw new Error("detached during release");
      },
    }, [3, 5, 5, 8, Number.NaN]);
    expect(released).toEqual([5, 8]);
  });
});
