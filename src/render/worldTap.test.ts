import { describe, expect, it } from "vitest";

import type { TideweftView } from "./types";
import {
  commandForWorldTap,
  usesCoarseWorldPointer,
  validatePerceivedEntityCommand,
} from "./worldTap";

const view = {
  settlements: [
    {
      id: "harbor-7",
      position: { x: 144, y: 312 },
      discovered: true,
    },
  ],
  fieldResources: [
    {
      id: "field-v1:reed",
      material: "cordreed",
      label: "Cordreed",
      position: { x: 204, y: 228 },
      knowledge: "charted",
    },
  ],
} as unknown as TideweftView;

interface PerceivedViewOptions {
  readonly tileVisibility?: readonly (0 | 0.5 | 1)[];
  readonly settlementVisibility?: 0 | 0.5 | 1;
  readonly resourceVisibility?: 0 | 0.5 | 1;
  readonly destination?: { readonly x: number; readonly y: number };
  readonly parcelRecoverable?: boolean;
  readonly perceptionValid?: boolean;
}

const perceivedView = ({
  tileVisibility = [1, 1, 1, 1],
  settlementVisibility = 1,
  resourceVisibility = 1,
  destination,
  parcelRecoverable = true,
  perceptionValid = true,
}: PerceivedViewOptions = {}): TideweftView => ({
  revision: 1,
  tick: 1,
  spatialEpoch: 1,
  terrain: {
    columns: 4,
    rows: 1,
    tileSize: 10,
    origin: { x: 0, y: 0 },
    revision: 1,
    tiles: Array.from({ length: 4 }, (_, index) => ({
      kind: "meadow" as const,
      elevation: 0.4,
      discovered: 1,
      currentVisibility: tileVisibility[index] ?? 0,
    })),
  },
  tide: { phase: "low", level: 0.2, progress: 0.3 },
  weather: { kind: "clear", intensity: 0, wind: { x: 0, y: 0 } },
  perception: {
    version: 1,
    signature: tileVisibility.join(""),
    valid: perceptionValid,
    visibleTileCount: tileVisibility.filter((value) => value > 0).length,
    directTileCount: tileVisibility.filter((value) => value === 1).length,
    peripheralTileCount: tileVisibility.filter((value) => value === 0.5).length,
  },
  settlements: [{
    id: "harbor-7",
    name: "Harbor Seven",
    position: { x: 5, y: 5 },
    population: 12,
    status: "steady",
    connection: 0.5,
    stress: 0.2,
    discovered: true,
    currentVisibility: settlementVisibility,
  }],
  player: {
    position: { x: 5, y: 5 },
    velocity: { x: 0, y: 0 },
    facing: 0,
    stamina: 1,
    stability: 1,
    scanCharge: 0,
    cargoLoad: 0,
    cargoCapacity: 1,
    cargo: [],
    pace: "steady",
    mode: "foot",
    ...(destination ? { destination } : {}),
  },
  routes: [{
    id: "route-1",
    kind: "footpath",
    points: [{ x: 0, y: 5 }, { x: 40, y: 5 }],
    strength: 0.5,
    condition: 0.5,
    reliability: 0.5,
  }],
  choirs: [],
  wayknots: [],
  tideHarps: [],
  fieldResources: [{
    id: "field-v1:reed",
    material: "cordreed",
    label: "Cordreed",
    position: { x: 15, y: 5 },
    knowledge: "charted",
    currentVisibility: resourceVisibility,
  }],
  looseCargo: [{
    id: "parcel-1",
    region: { x: 0, y: 0 },
    position: { x: 35, y: 5 },
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
    recoverable: parcelRecoverable,
    recovery: "approach",
  }],
  traces: [],
  porters: [{
    id: "porter-1",
    position: { x: 25, y: 5 },
    facing: 0,
    state: "traveling",
  }],
  camera: { center: { x: 20, y: 5 }, zoom: 1 },
});

describe("world tap intent", () => {
  it("sends coarse settlement taps to the exact harbor center", () => {
    expect(commandForWorldTap(
      view,
      { entity: "settlement", id: "harbor-7" },
      { x: 132.4, y: 305.8 },
      true,
      true,
    )).toEqual({
      type: "move-target",
      point: { x: 144, y: 312 },
      additive: false,
    });
  });

  it("keeps precise desktop settlement selection and ordinary world travel", () => {
    expect(commandForWorldTap(
      view,
      { entity: "settlement", id: "harbor-7" },
      { x: 141, y: 309 },
      false,
    )).toEqual({
      type: "select",
      entity: "settlement",
      id: "harbor-7",
      point: { x: 141, y: 309 },
    });
    expect(commandForWorldTap(view, null, { x: 80, y: 90 }, true, true)).toEqual({
      type: "move-target",
      point: { x: 80, y: 90 },
      additive: true,
    });
  });

  it("routes resource taps to the exact node and only enables touch arrival gathering", () => {
    expect(commandForWorldTap(
      view,
      { entity: "resource", id: "field-v1:reed" },
      { x: 197, y: 220 },
      true,
      true,
    )).toEqual({
      type: "resource-target",
      nodeId: "field-v1:reed",
      point: { x: 204, y: 228 },
      gatherOnArrival: true,
    });
    expect(commandForWorldTap(
      view,
      { entity: "resource", id: "field-v1:reed" },
      { x: 197, y: 220 },
      false,
    )).toEqual({
      type: "resource-target",
      nodeId: "field-v1:reed",
      point: { x: 204, y: 228 },
      gatherOnArrival: false,
    });
  });

  it("cannot target a hidden or stale resource ID", () => {
    expect(commandForWorldTap(
      view,
      { entity: "resource", id: "field-v1:hidden" },
      { x: 400, y: 440 },
      true,
    )).toEqual({
      type: "move-target",
      point: { x: 400, y: 440 },
      additive: false,
    });
  });

  it("requires direct release-frame perception for exact resource actions", () => {
    const direct = perceivedView();
    expect(commandForWorldTap(
      direct,
      { entity: "resource", id: "field-v1:reed" },
      { x: 14, y: 5 },
      true,
    )).toEqual({
      type: "resource-target",
      nodeId: "field-v1:reed",
      point: { x: 15, y: 5 },
      gatherOnArrival: true,
    });

    // The press began while direct, but the release-frame snapshot has moved
    // this node into peripheral awareness: the stale ID becomes plain travel.
    const peripheralAtRelease = perceivedView({
      tileVisibility: [1, 0.5, 1, 1],
      resourceVisibility: 0.5,
    });
    expect(commandForWorldTap(
      peripheralAtRelease,
      { entity: "resource", id: "field-v1:reed" },
      { x: 14, y: 5 },
      true,
    )).toEqual({
      type: "move-target",
      point: { x: 14, y: 5 },
      additive: false,
    });
  });

  it("keeps directly perceived settlement and porter selection available", () => {
    const direct = perceivedView();
    expect(commandForWorldTap(
      direct,
      { entity: "settlement", id: "harbor-7" },
      { x: 5, y: 5 },
      false,
    )).toEqual({
      type: "select",
      entity: "settlement",
      id: "harbor-7",
      point: { x: 5, y: 5 },
    });
    expect(commandForWorldTap(
      direct,
      { entity: "porter", id: "porter-1" },
      { x: 25, y: 5 },
      false,
    )).toEqual({
      type: "select",
      entity: "porter",
      id: "porter-1",
      point: { x: 25, y: 5 },
    });
  });

  it("fails closed when an entity claims visibility on an obscured tile", () => {
    const inconsistent = perceivedView({
      tileVisibility: [0, 0, 0.5, 1],
      settlementVisibility: 1,
      resourceVisibility: 1,
    });
    expect(commandForWorldTap(
      inconsistent,
      { entity: "settlement", id: "harbor-7" },
      { x: 5, y: 5 },
      false,
    )).toMatchObject({ type: "move-target" });
    expect(commandForWorldTap(
      inconsistent,
      { entity: "resource", id: "field-v1:reed" },
      { x: 15, y: 5 },
      false,
    )).toMatchObject({ type: "move-target" });
    expect(commandForWorldTap(
      inconsistent,
      { entity: "porter", id: "porter-1" },
      { x: 25, y: 5 },
      false,
    )).toMatchObject({ type: "move-target" });
  });

  it("fails closed when the current perception snapshot is invalid", () => {
    const invalid = perceivedView({ perceptionValid: false });
    expect(commandForWorldTap(
      invalid,
      { entity: "settlement", id: "harbor-7" },
      { x: 5, y: 5 },
      false,
    )).toMatchObject({ type: "move-target" });
    expect(commandForWorldTap(
      invalid,
      { entity: "porter", id: "porter-1" },
      { x: 25, y: 5 },
      false,
    )).toMatchObject({ type: "move-target" });
    expect(validatePerceivedEntityCommand(invalid, {
      type: "parcel-target",
      parcelId: "parcel-1",
      recoverOnArrival: true,
    })).toBeNull();
  });

  it("keeps only coarse movement to an actively tracked hidden destination", () => {
    const hiddenDestination = perceivedView({
      tileVisibility: [0, 1, 1, 1],
      settlementVisibility: 0,
      destination: { x: 5, y: 5 },
    });
    expect(commandForWorldTap(
      hiddenDestination,
      { entity: "settlement", id: "harbor-7" },
      { x: 4, y: 4 },
      true,
    )).toEqual({
      type: "move-target",
      point: { x: 5, y: 5 },
      additive: false,
    });
    expect(commandForWorldTap(
      hiddenDestination,
      { entity: "settlement", id: "harbor-7" },
      { x: 4, y: 4 },
      false,
    )).toEqual({
      type: "move-target",
      point: { x: 4, y: 4 },
      additive: false,
    });
  });

  it("revalidates parcel identity and visibility before dispatch", () => {
    const parcelCommand = {
      type: "parcel-target" as const,
      parcelId: "parcel-1",
      recoverOnArrival: true,
    };
    expect(validatePerceivedEntityCommand(perceivedView(), parcelCommand)).toEqual(parcelCommand);
    expect(validatePerceivedEntityCommand(
      perceivedView({ tileVisibility: [1, 1, 1, 0] }),
      parcelCommand,
    )).toBeNull();
    expect(validatePerceivedEntityCommand(
      perceivedView({ parcelRecoverable: false }),
      parcelCommand,
    )).toBeNull();
    expect(validatePerceivedEntityCommand(
      perceivedView(),
      { ...parcelCommand, parcelId: "stale-parcel" },
    )).toBeNull();
  });

  it("normalizes a direct resource command to its current entity point", () => {
    expect(validatePerceivedEntityCommand(perceivedView(), {
      type: "resource-target",
      nodeId: "field-v1:reed",
      point: { x: 999, y: 999 },
      gatherOnArrival: false,
    })).toEqual({
      type: "resource-target",
      nodeId: "field-v1:reed",
      point: { x: 15, y: 5 },
      gatherOnArrival: false,
    });
  });

  it("treats touch or a coarse primary pointer as coarse", () => {
    expect(usesCoarseWorldPointer("touch", false)).toBe(true);
    expect(usesCoarseWorldPointer("mouse", true)).toBe(true);
    expect(usesCoarseWorldPointer("mouse", false)).toBe(false);
    expect(usesCoarseWorldPointer("pen", false)).toBe(false);
  });
});
