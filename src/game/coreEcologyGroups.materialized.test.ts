import { describe, expect, it } from "vitest";

import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  createCoreEcologyGroup,
  reconcileCoreEcologyGroupMaterialized,
  type CoreEcologyGroupMaterializedEscapeCause,
  type CoreEcologyGroupMaterializedMemberPosition,
  type CoreEcologyGroupState,
} from "./coreEcologyGroups";
import {
  REGION_WIDTH_UNITS,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

const SEED = seedFromText("materialized group topology");
const ORIGIN = createRegionCoord(-17, -29);
const SPLIT_DISTANCE_UNITS = 5_000;
const REJOIN_DISTANCE_UNITS = 1_000;
const ESCAPE_CAUSE: CoreEcologyGroupMaterializedEscapeCause = Object.freeze({
  eventId: "escape:event:17",
  causeReferenceId: "alarm:pen-gate",
  memberOrdinal: 0,
});

function position(
  localX: number,
  localY = 20_000,
  region = ORIGIN,
): WorldPosition {
  return createWorldPosition(region, localX, localY);
}

function group(anchor = position(10_000)): CoreEcologyGroupState {
  return createCoreEcologyGroup({
    seed: SEED,
    species: "deer",
    originRegion: ORIGIN,
    populationKey: "materialized/herd",
    groupOrdinal: 0,
    memberOrdinals: [0, 1, 2, 3],
    anchor,
  });
}

function members(
  values: Readonly<Record<number, WorldPosition>>,
  order: readonly number[] = [0, 1, 2, 3],
): readonly CoreEcologyGroupMaterializedMemberPosition[] {
  return order.map((memberOrdinal) => ({
    memberOrdinal,
    position: values[memberOrdinal]!,
  }));
}

function reconcile(
  state: CoreEcologyGroupState,
  memberPositions: readonly CoreEcologyGroupMaterializedMemberPosition[],
  atTick: number,
  currentEscapeCause?: CoreEcologyGroupMaterializedEscapeCause,
) {
  return reconcileCoreEcologyGroupMaterialized(state, {
    atTick,
    memberPositions,
    splitDistanceUnits: SPLIT_DISTANCE_UNITS,
    rejoinDistanceUnits: REJOIN_DISTANCE_UNITS,
    ...(currentEscapeCause === undefined ? {} : { currentEscapeCause }),
  });
}

describe("materialized core ecology group topology", () => {
  it("partitions by physical position deterministically and conserves every member", () => {
    const currentPositions = {
      0: position(10_000),
      1: position(10_400),
      2: position(30_000),
      3: position(30_400),
    };
    const forward = reconcile(
      group(),
      members(currentPositions),
      1,
      ESCAPE_CAUSE,
    );
    const permuted = reconcile(
      group(),
      members(currentPositions, [3, 1, 0, 2]),
      1,
      ESCAPE_CAUSE,
    );

    expect(forward).not.toBeNull();
    expect(permuted).toEqual(forward);
    expect(forward?.group.phase).toBe("separated");
    expect(forward?.group.components.map(({ memberOrdinals }) => memberOrdinals)).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(forward?.group.components.flatMap(({ memberOrdinals }) => memberOrdinals)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(new Set(
      forward?.group.components.flatMap(({ memberOrdinals }) => memberOrdinals),
    ).size).toBe(4);
    expect(forward?.events).toHaveLength(1);
    expect(forward?.events[0]).toMatchObject({
      kind: "group-split",
      causeReferenceId: ESCAPE_CAUSE.causeReferenceId,
      memberOrdinals: [0, 1, 2, 3],
    });
    expect(forward?.group.aftermath).toEqual([]);
  });

  it("does not split without both a current cause and physical threshold crossing", () => {
    const farApart = members({
      0: position(10_000),
      1: position(10_200),
      2: position(30_000),
      3: position(30_200),
    });
    const closeTogether = members({
      0: position(10_000),
      1: position(10_200),
      2: position(10_400),
      3: position(10_600),
    });

    const noCause = reconcile(group(), farApart, 1);
    const noDistance = reconcile(group(), closeTogether, 1, ESCAPE_CAUSE);

    expect(noCause?.group.phase).toBe("cohesive");
    expect(noCause?.group.components).toHaveLength(1);
    expect(noCause?.events).toEqual([]);
    expect(noDistance?.group.phase).toBe("cohesive");
    expect(noDistance?.group.components).toHaveLength(1);
    expect(noDistance?.events).toEqual([]);
  });

  it("reconciles separated anchors but cannot merge before physical reunion", () => {
    const split = reconcile(group(), members({
      0: position(10_000),
      1: position(10_200),
      2: position(30_000),
      3: position(30_200),
    }), 1, ESCAPE_CAUSE);
    expect(split).not.toBeNull();

    const approaching = reconcile(split!.group, members({
      0: position(15_000),
      1: position(15_200),
      2: position(19_000),
      3: position(19_200),
    }), 2);

    expect(approaching?.group.phase).toBe("rejoining");
    expect(approaching?.group.components).toHaveLength(2);
    expect(approaching?.group.components.map(({ anchor }) => anchor.localX)).toEqual([
      15_000,
      19_000,
    ]);
    expect(approaching?.group.lineage.map(({ kind }) => kind)).toEqual(["origin", "split"]);
    expect(approaching?.events).toEqual([]);
    expect(approaching?.group.aftermath).toEqual([]);
  });

  it("physically rejoins the same conserved members and lineage", () => {
    const split = reconcile(group(), members({
      0: position(10_000),
      1: position(10_200),
      2: position(30_000),
      3: position(30_200),
    }), 1, ESCAPE_CAUSE);
    const reunited = reconcile(split!.group, members({
      0: position(20_000),
      1: position(20_200),
      2: position(20_400),
      3: position(20_600),
    }), 2);

    expect(reunited?.group.phase).toBe("cohesive");
    expect(reunited?.group.components).toHaveLength(1);
    expect(reunited?.group.components[0]?.memberOrdinals).toEqual([0, 1, 2, 3]);
    expect(reunited?.group.lineage.map(({ kind }) => kind)).toEqual([
      "origin", "split", "rejoin",
    ]);
    expect(reunited?.events).toHaveLength(1);
    expect(reunited?.events[0]?.kind).toBe("group-rejoined");
    expect(reunited?.group.aftermath).toEqual([]);
  });

  it("uses exact signed world distance across a negative-region seam", () => {
    const leftRegion = createRegionCoord(-2, -11);
    const rightRegion = createRegionCoord(-1, -11);
    const split = reconcile(group(position(REGION_WIDTH_UNITS - 400, 12_000, leftRegion)), members({
      0: position(REGION_WIDTH_UNITS - 12_000, 12_000, leftRegion),
      1: position(REGION_WIDTH_UNITS - 11_800, 12_000, leftRegion),
      2: position(10_000, 12_000, rightRegion),
      3: position(10_200, 12_000, rightRegion),
    }), 1, ESCAPE_CAUSE);
    expect(split?.group.phase).toBe("separated");

    const reunited = reconcile(split!.group, members({
      0: position(REGION_WIDTH_UNITS - 400, 12_000, leftRegion),
      1: position(REGION_WIDTH_UNITS - 300, 12_000, leftRegion),
      2: position(100, 12_000, rightRegion),
      3: position(200, 12_000, rightRegion),
    }), 2);

    expect(reunited?.group.phase).toBe("cohesive");
    expect(reunited?.events[0]?.kind).toBe("group-rejoined");
    expect(reunited?.group.components[0]?.anchor.region.x).toBe(-2);
  });

  it("fails malformed membership, causes, thresholds, positions, and extra fields closed", () => {
    const validMembers = members({
      0: position(10_000),
      1: position(10_200),
      2: position(30_000),
      3: position(30_200),
    });
    const validInput = {
      atTick: 1,
      memberPositions: validMembers,
      splitDistanceUnits: SPLIT_DISTANCE_UNITS,
      rejoinDistanceUnits: REJOIN_DISTANCE_UNITS,
      currentEscapeCause: ESCAPE_CAUSE,
    };

    expect(reconcileCoreEcologyGroupMaterialized(group(), {
      ...validInput,
      memberPositions: validMembers.slice(0, 3),
    })).toBeNull();
    expect(reconcileCoreEcologyGroupMaterialized(group(), {
      ...validInput,
      memberPositions: [validMembers[0]!, validMembers[0]!, validMembers[2]!, validMembers[3]!],
    })).toBeNull();
    expect(reconcileCoreEcologyGroupMaterialized(group(), {
      ...validInput,
      rejoinDistanceUnits: SPLIT_DISTANCE_UNITS + 1,
    })).toBeNull();
    expect(reconcileCoreEcologyGroupMaterialized(group(), {
      ...validInput,
      currentEscapeCause: { ...ESCAPE_CAUSE, memberOrdinal: 99 },
    })).toBeNull();
    expect(reconcileCoreEcologyGroupMaterialized(group(), {
      ...validInput,
      memberPositions: [
        { memberOrdinal: 0, position: { ...position(10_000), localX: -1 } },
        ...validMembers.slice(1),
      ],
    })).toBeNull();
    expect(reconcileCoreEcologyGroupMaterialized(group(), {
      ...validInput,
      unexpected: true,
    } as never)).toBeNull();
  });
});
