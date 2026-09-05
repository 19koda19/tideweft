import { describe, expect, it } from "vitest";

import type { ObservedArea } from "../sim/actorPerception";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import {
  LIVING_ACTOR_LOCOMOTION_VERSION,
  MAX_LIVING_ACTOR_LOCOMOTION_STEP_UNITS,
  createLivingActorTraversabilitySurface,
  deriveLivingActorSearchProbe,
  resolveLivingActorLocomotion,
  type LivingActorLocomotionInput,
  type LivingActorTraversalAccess,
  type LivingActorTraversabilityCell,
} from "./livingActorLocomotion";
import { createLivingActorAddress } from "./livingActor";
import {
  createWorldPosition,
  translateWorldPosition,
  worldPositionDelta,
  type WorldPosition,
} from "./worldPosition";

const TICK = 41;
const DOG_ID = "D-R-v1-locomotion/dog-1";

function traversalCell(
  access: LivingActorTraversalAccess = "open",
  travelCost = access === "open" ? 1 : 0,
): LivingActorTraversabilityCell {
  return { access, travelCost };
}

function actorAt(position: WorldPosition) {
  return createLivingActorAddress({
    actorId: DOG_ID,
    species: "domestic-dog",
    position,
    heading: 0,
    persistence: "regional",
  });
}

function area(center: WorldPosition, radiusUnits = 0): ObservedArea {
  return Object.freeze({ center, radiusUnits });
}

function fixture(
  options: Readonly<{
    width?: number;
    height?: number;
    origin?: WorldPosition;
    actorPoint?: Readonly<{ x: number; y: number }>;
    targetPoint?: Readonly<{ x: number; y: number }>;
    radiusUnits?: number;
    maximumStepUnits?: number;
    cells?: readonly LivingActorTraversabilityCell[];
  }> = {},
): LivingActorLocomotionInput {
  const width = options.width ?? 6;
  const height = options.height ?? 6;
  const origin = options.origin
    ?? createWorldPosition(createRegionCoord(0, 0), 0, 0);
  const actorPoint = options.actorPoint ?? { x: 500, y: 2_500 };
  const targetPoint = options.targetPoint ?? { x: 4_500, y: 2_500 };
  const actor = actorAt(translateWorldPosition(origin, actorPoint.x, actorPoint.y));
  return {
    requestId: "locomotion:request/41",
    tick: TICK,
    actor,
    targetArea: area(
      translateWorldPosition(origin, targetPoint.x, targetPoint.y),
      options.radiusUnits ?? 0,
    ),
    maximumStepUnits: options.maximumStepUnits ?? 1_000,
    surface: createLivingActorTraversabilitySurface({
      forActorId: actor.actorId,
      sampledAtTick: TICK,
      origin,
      widthTiles: width,
      heightTiles: height,
      cells: options.cells ?? Array.from(
        { length: width * height },
        () => traversalCell(),
      ),
    }),
  };
}

describe("species-neutral living actor locomotion", () => {
  it("takes a straight bounded step without changing stable identity", () => {
    const input = fixture();
    const result = resolveLivingActorLocomotion(input);

    expect(result).toMatchObject({
      version: LIVING_ACTOR_LOCOMOTION_VERSION,
      kind: "moved",
      requestId: input.requestId,
      tick: TICK,
      distanceUnits: 1_000,
      chosenNextTileIndex: 13,
      reachedObservedArea: false,
    });
    if (result.kind !== "moved") throw new Error("Expected movement");
    expect(result.actor.actorId).toBe(input.actor.actorId);
    expect(result.actor.species).toBe(input.actor.species);
    expect(result.actor.persistence).toBe(input.actor.persistence);
    expect(worldPositionDelta(input.actor.position, result.actor.position)).toEqual({
      x: 1_000,
      y: 0,
    });
    expect(result.trajectory).toEqual([input.actor.position, result.actor.position]);
  });

  it("takes a diagonal step without exceeding the supplied distance budget", () => {
    const input = fixture({
      actorPoint: { x: 500, y: 500 },
      targetPoint: { x: 4_500, y: 4_500 },
      maximumStepUnits: 777,
    });
    const result = resolveLivingActorLocomotion(input);

    expect(result.kind).toBe("moved");
    if (result.kind !== "moved") throw new Error("Expected movement");
    const delta = worldPositionDelta(input.actor.position, result.actor.position);
    expect(delta.x).toBeGreaterThan(0);
    expect(delta.y).toBeGreaterThan(0);
    expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(777);
    expect(result.distanceUnits).toBeLessThanOrEqual(777);
    expect(result.actor.heading).toBe(125_000);
  });

  it("detours around a closed cell and never cuts diagonally through its corner", () => {
    const cells = Array.from({ length: 15 }, () => traversalCell());
    cells[6] = traversalCell("blocked");
    const input = fixture({
      width: 5,
      height: 3,
      actorPoint: { x: 500, y: 1_500 },
      targetPoint: { x: 4_500, y: 1_500 },
      cells,
    });
    const result = resolveLivingActorLocomotion(input);

    expect(result).toMatchObject({
      kind: "moved",
      chosenNextTileIndex: 0,
    });
    if (result.kind !== "moved") throw new Error("Expected movement");
    expect(worldPositionDelta(input.actor.position, result.actor.position)).toEqual({
      x: 0,
      y: -1_000,
    });
    expect(result.trajectory).toEqual([input.actor.position, result.actor.position]);
  });

  it("reports no route through complete blocked or deep-water barriers", () => {
    for (const barrier of ["blocked", "deep-water"] as const) {
      const cells = Array.from({ length: 15 }, () => traversalCell());
      for (const index of [1, 6, 11]) cells[index] = traversalCell(barrier);
      const result = resolveLivingActorLocomotion(fixture({
        width: 5,
        height: 3,
        actorPoint: { x: 500, y: 1_500 },
        targetPoint: { x: 4_500, y: 1_500 },
        cells,
      }));
      expect(result).toMatchObject({ kind: "no-move", reason: "no-traversable-route" });
    }
  });

  it("will not originate ground motion from a blocked or deep-water cell", () => {
    for (const [access, reason] of [
      ["blocked", "actor-on-blocked-tile"],
      ["deep-water", "actor-in-deep-water"],
    ] as const) {
      const cells = Array.from({ length: 36 }, () => traversalCell());
      cells[12] = traversalCell(access);
      expect(resolveLivingActorLocomotion(fixture({ cells }))).toMatchObject({
        kind: "no-move",
        reason,
      });
    }
  });

  it("does not move after reaching the perceived uncertainty area", () => {
    const input = fixture({
      actorPoint: { x: 2_500, y: 2_500 },
      targetPoint: { x: 3_500, y: 2_500 },
      radiusUnits: 1_000,
    });
    const result = resolveLivingActorLocomotion(input);

    expect(result).toMatchObject({
      kind: "no-move",
      reason: "already-within-observed-area",
      actor: input.actor,
      targetArea: input.targetArea,
    });
  });

  it("uses an explicit cognition-owned probe to search inside an uncertainty area", () => {
    const input = fixture({
      actorPoint: { x: 500, y: 2_500 },
      targetPoint: { x: 2_500, y: 2_500 },
      radiusUnits: 2_500,
    });
    expect(resolveLivingActorLocomotion(input)).toMatchObject({
      kind: "no-move",
      reason: "already-within-observed-area",
    });

    const searchProbe = deriveLivingActorSearchProbe({
      requestId: input.requestId,
      beliefKey: "contact:scent:food/41",
      probeOrdinal: 0,
      sourceArea: input.targetArea,
    });
    expect(searchProbe).not.toBeNull();
    if (searchProbe === null) throw new Error("Expected a search probe");
    expect(searchProbe.sourceArea).toEqual(input.targetArea);
    expect(searchProbe.probeArea).toEqual({
      center: input.targetArea.center,
      radiusUnits: 0,
    });

    const result = resolveLivingActorLocomotion({ ...input, searchProbe });
    expect(result).toMatchObject({
      kind: "moved",
      targetArea: input.targetArea,
      searchProbe,
      reachedObservedArea: true,
      reachedSearchProbe: false,
    });
    if (result.kind !== "moved") throw new Error("Expected probe movement");
    expect(worldPositionDelta(input.actor.position, result.actor.position)).toEqual({
      x: 1_000,
      y: 0,
    });
  });

  it("derives later probes deterministically inside saved cognition without source truth", () => {
    const sourceArea = area(
      createWorldPosition(createRegionCoord(-4, 7), 12_000, 18_000),
      8_000,
    );
    const input = {
      requestId: "locomotion:search/remote",
      beliefKey: "contact:scent:provision/remote",
      probeOrdinal: 7,
      sourceArea,
    };
    const first = deriveLivingActorSearchProbe(input);
    const second = deriveLivingActorSearchProbe(input);
    expect(first).toEqual(second);
    expect(first?.sourceArea).toEqual(sourceArea);
    expect(first?.probeArea.radiusUnits).toBe(0);
    expect(first?.probeArea.center).not.toEqual(sourceArea.center);
    if (first === null) throw new Error("Expected a later search probe");
    const delta = worldPositionDelta(sourceArea.center, first.probeArea.center);
    expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(sourceArea.radiusUnits);
    expect(first).not.toHaveProperty("sourcePosition");
    expect(deriveLivingActorSearchProbe({
      ...input,
      sourcePosition: createWorldPosition(createRegionCoord(0, 0), 0, 0),
    })).toBeNull();
  });

  it("rejects a forged or mismatched probe instead of laundering hidden truth", () => {
    const input = fixture({
      actorPoint: { x: 500, y: 2_500 },
      targetPoint: { x: 2_500, y: 2_500 },
      radiusUnits: 2_500,
    });
    const searchProbe = deriveLivingActorSearchProbe({
      requestId: input.requestId,
      beliefKey: "contact:scent:food/41",
      probeOrdinal: 0,
      sourceArea: input.targetArea,
    });
    if (searchProbe === null) throw new Error("Expected a search probe");
    for (const forged of [
      { ...searchProbe, id: "living-probe:0000000000000000" },
      { ...searchProbe, sourceArea: { ...searchProbe.sourceArea, radiusUnits: 2_499 } },
      { ...searchProbe, probeArea: area(
        translateWorldPosition(searchProbe.probeArea.center, 1_000, 0),
      ) },
    ]) {
      expect(resolveLivingActorLocomotion({ ...input, searchProbe: forged })).toMatchObject({
        kind: "no-move",
        reason: "invalid-input",
      });
    }
  });

  it("crosses an internal storage-region seam with exact segmented coordinates", () => {
    const origin = createWorldPosition(createRegionCoord(-2, -3), 94_000, 10_000);
    const input = fixture({
      width: 4,
      height: 3,
      origin,
      actorPoint: { x: 1_500, y: 1_500 },
      targetPoint: { x: 3_500, y: 1_500 },
    });
    const result = resolveLivingActorLocomotion(input);

    expect(result.kind).toBe("moved");
    if (result.kind !== "moved") throw new Error("Expected movement");
    expect(result.actor.position).toEqual(createWorldPosition(
      createRegionCoord(-1, -3),
      500,
      11_500,
    ));
    expect(worldPositionDelta(input.actor.position, result.actor.position)).toEqual({
      x: 1_000,
      y: 0,
    });
  });

  it("preserves exact motion at the extreme signed region envelope", () => {
    for (const regionX of [-REGION_COORD_LIMIT, REGION_COORD_LIMIT]) {
      const origin = createWorldPosition(createRegionCoord(regionX, 0), 0, 0);
      const input = fixture({
        width: 4,
        height: 2,
        origin,
        actorPoint: { x: 500, y: 500 },
        targetPoint: { x: 3_500, y: 500 },
      });
      const first = resolveLivingActorLocomotion(input);
      const second = resolveLivingActorLocomotion(input);
      expect(first).toEqual(second);
      expect(first.kind).toBe("moved");
      if (first.kind !== "moved") throw new Error("Expected movement");
      expect(first.actor.position.region.x).toBe(regionX);
      expect(first.actor.position.localX).toBe(1_500);
    }
  });

  it("fails closed when the actor or perceived center lies outside the supplied window", () => {
    const input = fixture({ width: 4, height: 4 });
    const targetOutside = {
      ...input,
      targetArea: area(translateWorldPosition(input.surface.origin, 4_500, 1_500)),
    };
    expect(resolveLivingActorLocomotion(targetOutside)).toMatchObject({
      kind: "no-move",
      reason: "target-outside-surface",
    });

    const actorOutside = actorAt(translateWorldPosition(input.surface.origin, -500, 1_500));
    const actorSurface = createLivingActorTraversabilitySurface({
      forActorId: actorOutside.actorId,
      sampledAtTick: TICK,
      origin: input.surface.origin,
      widthTiles: 4,
      heightTiles: 4,
      cells: input.surface.cells,
    });
    expect(resolveLivingActorLocomotion({
      ...input,
      actor: actorOutside,
      surface: actorSurface,
    })).toMatchObject({ kind: "no-move", reason: "actor-outside-surface" });
  });

  it("moves toward the observed area even when unseen source truth would point elsewhere", () => {
    const input = fixture({
      actorPoint: { x: 2_500, y: 2_500 },
      targetPoint: { x: 4_500, y: 2_500 },
    });
    // A hypothetical physical source at x=500 would be west. It is deliberately
    // absent from the contract, so the accepted perceived area moves us east.
    const result = resolveLivingActorLocomotion(input);
    expect(result.kind).toBe("moved");
    if (result.kind !== "moved") throw new Error("Expected movement");
    expect(worldPositionDelta(input.actor.position, result.actor.position).x).toBeGreaterThan(0);

    expect(resolveLivingActorLocomotion({
      ...input,
      sourcePosition: translateWorldPosition(input.surface.origin, 500, 2_500),
    })).toEqual({
      version: LIVING_ACTOR_LOCOMOTION_VERSION,
      kind: "no-move",
      requestId: null,
      tick: null,
      actor: null,
      targetArea: null,
      reason: "invalid-input",
    });
  });

  it("rejects malformed, stale, aliased, oversized, or zero-budget input safely", () => {
    const input = fixture();
    const invalid = [
      { ...input, tick: TICK + 1 },
      { ...input, actor: { ...input.actor, actorId: "D-wrong" } },
      { ...input, targetArea: { ...input.targetArea, exactSourceId: "food-lot" } },
      { ...input, maximumStepUnits: MAX_LIVING_ACTOR_LOCOMOTION_STEP_UNITS + 1 },
      { ...input, surface: { ...input.surface, cells: input.surface.cells.slice(1) } },
      { ...input, surface: { ...input.surface, debug: true } },
    ];
    for (const candidate of invalid) {
      expect(resolveLivingActorLocomotion(candidate)).toMatchObject({
        kind: "no-move",
        reason: "invalid-input",
        actor: null,
      });
    }
    expect(resolveLivingActorLocomotion({ ...input, maximumStepUnits: 0 })).toMatchObject({
      kind: "no-move",
      reason: "maximum-step-zero",
      actor: input.actor,
    });
  });

  it("is immutable and deterministic for byte-equivalent authoritative input", () => {
    const input = fixture({
      targetPoint: { x: 5_500, y: 4_500 },
      radiusUnits: 600,
    });
    const first = resolveLivingActorLocomotion(input);
    const second = resolveLivingActorLocomotion(input);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    if (first.kind === "moved") {
      expect(Object.isFrozen(first.actor)).toBe(true);
      expect(Object.isFrozen(first.actor.position)).toBe(true);
      expect(Object.isFrozen(first.targetArea)).toBe(true);
      expect(Object.isFrozen(first.trajectory)).toBe(true);
    }
  });

  it("records each lawful segment when one fast step follows a detour", () => {
    const cells = Array.from({ length: 15 }, () => traversalCell());
    cells[6] = traversalCell("blocked");
    const input = fixture({
      width: 5,
      height: 3,
      actorPoint: { x: 500, y: 1_500 },
      targetPoint: { x: 4_500, y: 1_500 },
      maximumStepUnits: 5_000,
      cells,
    });
    const result = resolveLivingActorLocomotion(input);

    expect(result.kind).toBe("moved");
    if (result.kind !== "moved") throw new Error("Expected movement");
    expect(result.trajectory.length).toBeGreaterThan(2);
    expect(result.trajectory[0]).toEqual(input.actor.position);
    expect(result.trajectory.at(-1)).toEqual(result.actor.position);
    expect(result.distanceUnits).toBeLessThanOrEqual(input.maximumStepUnits);
    const traversedTiles = result.trajectory.map((position) => {
      const relative = worldPositionDelta(input.surface.origin, position);
      return Math.floor(relative.y / 1_000) * input.surface.widthTiles
        + Math.floor(relative.x / 1_000);
    });
    expect(traversedTiles).not.toContain(6);
  });
});
