import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { stableStringify } from "../sim/util";
import { createLivingActorAddress } from "./livingActor";
import {
  createLivingActorGradeTraversalPolicy,
  resolveLivingActorTraversalEdgeCost,
} from "./livingActorGradeTraversal";
import {
  createLivingActorTraversabilitySurface,
  resolveLivingActorLocomotion,
  type LivingActorTraversabilityCell,
} from "./livingActorLocomotion";
import { createWorldPosition, translateWorldPosition } from "./worldPosition";

const POLICY = createLivingActorGradeTraversalPolicy({
  ascent: {
    comfortableGrade: 100_000,
    maximumGrade: 300_000,
    costMultiplierAtMaximum: 2_000_000,
  },
  descent: {
    comfortableGrade: 150_000,
    maximumGrade: 450_000,
    costMultiplierAtMaximum: 1_600_000,
  },
});

describe("species-neutral directed grade traversal", () => {
  it("retains ordinary cost on level/comfortable edges and scales directed grade", () => {
    const level = resolveLivingActorTraversalEdgeCost({
      fromElevation: 400_000,
      toElevation: 400_000,
      horizontalDistanceUnits: 1_000,
      destinationTravelCost: 500,
      policy: POLICY,
    });
    const comfortable = resolveLivingActorTraversalEdgeCost({
      fromElevation: 400_000,
      toElevation: 500_000,
      horizontalDistanceUnits: 1_000,
      destinationTravelCost: 500,
      policy: POLICY,
    });
    const ascent = resolveLivingActorTraversalEdgeCost({
      fromElevation: 400_000,
      toElevation: 600_000,
      horizontalDistanceUnits: 1_000,
      destinationTravelCost: 500,
      policy: POLICY,
    });
    const descent = resolveLivingActorTraversalEdgeCost({
      fromElevation: 600_000,
      toElevation: 400_000,
      horizontalDistanceUnits: 1_000,
      destinationTravelCost: 500,
      policy: POLICY,
    });

    expect(level).toEqual({
      kind: "open",
      direction: "level",
      grade: 0,
      costMultiplier: 1_000_000,
      transitionCost: 500_000,
    });
    expect(comfortable).toMatchObject({
      kind: "open",
      direction: "ascent",
      costMultiplier: 1_000_000,
      transitionCost: 500_000,
    });
    expect(ascent).toMatchObject({
      kind: "open",
      direction: "ascent",
      grade: 200_000,
      costMultiplier: 1_500_000,
      transitionCost: 750_000,
    });
    expect(descent).toMatchObject({ kind: "open", direction: "descent" });
    if (ascent?.kind !== "open" || descent?.kind !== "open") {
      throw new Error("Expected traversable directed edges");
    }
    expect(descent.transitionCost).toBeLessThan(ascent.transitionCost);
  });

  it("normalizes grade by edge length and closes only edges beyond the policy", () => {
    const cardinal = resolveLivingActorTraversalEdgeCost({
      fromElevation: 100_000,
      toElevation: 400_000,
      horizontalDistanceUnits: 1_000,
      destinationTravelCost: 1,
      policy: POLICY,
    });
    const diagonal = resolveLivingActorTraversalEdgeCost({
      fromElevation: 100_000,
      toElevation: 400_000,
      horizontalDistanceUnits: 1_414,
      destinationTravelCost: 1,
      policy: POLICY,
    });
    const cliff = resolveLivingActorTraversalEdgeCost({
      fromElevation: 100_000,
      toElevation: 400_001,
      horizontalDistanceUnits: 1_000,
      destinationTravelCost: 1,
      policy: POLICY,
    });

    expect(cardinal).toMatchObject({ kind: "open", grade: 300_000 });
    expect(diagonal).toMatchObject({ kind: "open", grade: 212_164 });
    expect(cliff).toEqual({
      kind: "blocked",
      direction: "ascent",
      grade: 300_001,
      reason: "grade-limit",
    });
  });

  it("keeps legacy surface shape and path bytes unless grade authority is supplied", () => {
    const region = createRegionCoord(0, 0);
    const origin = createWorldPosition(region, 0, 0);
    const actor = createLivingActorAddress({
      actorId: "H-grade-test:actor",
      species: "human",
      position: translateWorldPosition(origin, 500, 1_500),
      heading: 0,
      persistence: "regional",
    });
    const cells: LivingActorTraversabilityCell[] = Array.from(
      { length: 15 },
      () => ({ access: "open", travelCost: 1 }),
    );
    const legacySurface = createLivingActorTraversabilitySurface({
      forActorId: actor.actorId,
      sampledAtTick: 7,
      origin,
      widthTiles: 5,
      heightTiles: 3,
      cells,
    });
    expect(Object.keys(legacySurface).sort()).toEqual([
      "cells",
      "forActorId",
      "heightTiles",
      "origin",
      "sampledAtTick",
      "version",
      "widthTiles",
    ]);
    expect(stableStringify(legacySurface)).toBe(stableStringify({
      version: 1,
      forActorId: actor.actorId,
      sampledAtTick: 7,
      origin,
      widthTiles: 5,
      heightTiles: 3,
      cells,
    }));
    const input = {
      requestId: "grade-test:route",
      tick: 7,
      actor,
      targetArea: {
        center: translateWorldPosition(origin, 4_500, 1_500),
        radiusUnits: 0,
      },
      maximumStepUnits: 1_000,
    } as const;
    expect(resolveLivingActorLocomotion({ ...input, surface: legacySurface })).toMatchObject({
      kind: "moved",
      chosenNextTileIndex: 6,
    });

    const elevations = [
      0, 0, 0, 0, 0,
      0, 400_000, 400_000, 400_000, 0,
      0, 0, 0, 0, 0,
    ];
    const gradeSurface = createLivingActorTraversabilitySurface({
      forActorId: actor.actorId,
      sampledAtTick: 7,
      origin,
      widthTiles: 5,
      heightTiles: 3,
      cells,
      edgeGradePolicy: POLICY,
      elevations,
    });
    const resolved = resolveLivingActorLocomotion({ ...input, surface: gradeSurface });
    expect(resolved).toMatchObject({ kind: "moved" });
    if (resolved.kind !== "moved") throw new Error("Expected grade-aware detour");
    expect(resolved.chosenNextTileIndex).not.toBe(6);
    expect(Object.isFrozen(gradeSurface.elevations)).toBe(true);
    expect(Object.isFrozen(gradeSurface.edgeGradePolicy)).toBe(true);
  });

  it("rejects partial, malformed, or over-permissive grade metadata", () => {
    expect(() => createLivingActorGradeTraversalPolicy({
      ...POLICY,
      ascent: { ...POLICY.ascent, comfortableGrade: 400_000 },
    })).toThrow("grade traversal policy is invalid");
    expect(resolveLivingActorTraversalEdgeCost({
      fromElevation: 0,
      toElevation: 0,
      horizontalDistanceUnits: 1_000,
      destinationTravelCost: 1,
      policy: { ...POLICY, debug: true },
    })).toBeNull();
    expect(resolveLivingActorTraversalEdgeCost({
      fromElevation: 0,
      toElevation: 0,
      horizontalDistanceUnits: Number.MAX_SAFE_INTEGER,
      destinationTravelCost: 2,
      policy: POLICY,
    })).toBeNull();

    const origin = createWorldPosition(createRegionCoord(0, 0), 0, 0);
    expect(() => createLivingActorTraversabilitySurface({
      forActorId: "H-grade-test:actor",
      sampledAtTick: 0,
      origin,
      widthTiles: 1,
      heightTiles: 1,
      cells: [{ access: "open", travelCost: 1 }],
      elevations: [0],
    })).toThrow("traversability surface is invalid");
  });
});
