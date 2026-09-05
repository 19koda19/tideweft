import { describe, expect, it } from "vitest";

import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS,
  CORE_ECOLOGY_GROUP_MAX_SIGNALS,
  CORE_ECOLOGY_GROUP_REJOIN_COMPLETE_COHESION,
  canonicalizeCoreEcologyGroup,
  canonicalizeCoreEcologyGroupSet,
  coreEcologyGroupComponentForMember,
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  deserializeCoreEcologyGroupSet,
  emitCoreEcologyGroupSignal,
  reconcileCoreEcologyGroupAnchors,
  serializeCoreEcologyGroupSet,
  stableCoreEcologyGroupId,
  stepCoreEcologyGroupCoarse,
  stepCoreEcologyGroupSignalCadence,
  type CoreEcologyGroupState,
  type CoreEcologyPlayerAbsentDisturbance,
} from "./coreEcologyGroups";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  createWorldPosition,
  type WorldPosition,
} from "./worldPosition";

const SEED = seedFromText("stable group ecology tests");
const ORIGIN = createRegionCoord(-17, 29);

function position(
  localX: number,
  localY: number,
  region = ORIGIN,
): WorldPosition {
  return createWorldPosition(region, localX, localY);
}

function deerGroup(overrides: Partial<{
  readonly memberOrdinals: readonly number[];
  readonly anchor: WorldPosition;
  readonly tick: number;
}> = {}): CoreEcologyGroupState {
  return createCoreEcologyGroup({
    seed: SEED,
    species: "deer",
    originRegion: ORIGIN,
    populationKey: "deer:wave-a",
    groupOrdinal: 0,
    memberOrdinals: overrides.memberOrdinals ?? [0, 1, 2, 3],
    anchor: overrides.anchor ?? position(12_000, 18_000),
    ...(overrides.tick === undefined ? {} : { tick: overrides.tick }),
  });
}

function disturbance(
  atTick: number,
  overrides: Partial<CoreEcologyPlayerAbsentDisturbance> = {},
): CoreEcologyPlayerAbsentDisturbance {
  return {
    disturbanceId: "disturbance:test",
    atTick,
    causeKind: "habitat-pressure",
    causeReferenceId: "habitat:test",
    pressure: 800_000,
    movementHeading: 250_000,
    destinationAnchors: [position(30_000, 40_000), position(50_000, 60_000)],
    rendezvousAnchor: position(40_000, 50_000),
    playerAbsent: true,
    nonlethal: true,
    cargoInteraction: false,
    ...overrides,
  };
}

describe("core ecology social groups", () => {
  it("creates stable order-independent deer herds and gull flocks while bears stay solitary", () => {
    const deer = deerGroup({ memberOrdinals: [7, 2, 5] });
    const reordered = deerGroup({ memberOrdinals: [5, 7, 2] });
    const gull = createCoreEcologyGroup({
      seed: SEED,
      species: "gull",
      originRegion: ORIGIN,
      populationKey: "gull:wave-a",
      groupOrdinal: 3,
      memberOrdinals: [4, 1, 9],
      anchor: position(70_000, 8_000),
    });

    expect(deer).toEqual(reordered);
    expect(deer.memberOrdinals).toEqual([2, 5, 7]);
    expect(deer.identity.organization).toBe("herd");
    expect(deer.identity.stableId).toMatch(/^HERD-v1-/u);
    expect(gull.identity.organization).toBe("flock");
    expect(gull.identity.stableId).toMatch(/^FLOCK-v1-/u);
    expect(Object.isFrozen(deer.components[0]?.memberOrdinals)).toBe(true);

    expect(() => createCoreEcologyGroup({
      seed: SEED,
      species: "black-bear",
      originRegion: ORIGIN,
      populationKey: "black-bear:wave-a",
      groupOrdinal: 0,
      memberOrdinals: [0, 1],
      anchor: position(1, 1),
    })).toThrow(/solitary/u);
    expect(() => stableCoreEcologyGroupId({
      seed: SEED,
      species: "black-bear",
      originRegion: ORIGIN,
      populationKey: "black-bear:wave-a",
      groupOrdinal: 0,
    })).toThrow(/social deer and gull/u);
    for (const solitarySpecies of ["brown-rat", "domestic-cat"] as const) {
      expect(() => createCoreEcologyGroup({
        seed: SEED,
        species: solitarySpecies,
        originRegion: ORIGIN,
        populationKey: `${solitarySpecies}:wave-b`,
        groupOrdinal: 0,
        memberOrdinals: [0, 1],
        anchor: position(1, 1),
      })).toThrow(/not group-eligible/u);
      expect(() => stableCoreEcologyGroupId({
        seed: SEED,
        species: solitarySpecies,
        originRegion: ORIGIN,
        populationKey: `${solitarySpecies}:wave-b`,
        groupOrdinal: 0,
      })).toThrow(/group-eligible/u);
    }
  });

  it("round-trips canonical group sets at signed world-position limits", () => {
    const edgeRegion = createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT);
    const edge = position(REGION_WIDTH_UNITS - 1, REGION_HEIGHT_UNITS - 1, edgeRegion);
    const deer = deerGroup({ anchor: edge });
    const gull = createCoreEcologyGroup({
      seed: SEED,
      species: "gull",
      originRegion: edgeRegion,
      populationKey: "gull:edge",
      groupOrdinal: Number.MAX_SAFE_INTEGER,
      memberOrdinals: [0, 1],
      anchor: edge,
    });
    const forward = createCoreEcologyGroupSet([deer, gull]);
    const reverse = createCoreEcologyGroupSet([gull, deer]);

    expect(forward).toEqual(reverse);
    expect(forward).not.toBeNull();
    const encoded = serializeCoreEcologyGroupSet(forward);
    expect(deserializeCoreEcologyGroupSet(encoded)).toEqual(forward);
    expect(deserializeCoreEcologyGroupSet(` ${encoded}`)).toBeNull();
    expect(gull.identity.stableId).toContain("-n");
    expect(gull.identity.stableId).toContain(".p");
    expect(createCoreEcologyGroupSet()).toEqual({ version: 1, groups: [] });
  });

  it("propagates signals once per connected component on exact coarse cadence", () => {
    const initial = deerGroup();
    const signaled = emitCoreEcologyGroupSignal(initial, {
      atTick: 3,
      kind: "alarm",
      causeReferenceId: "alarm:direct-source",
      sourceMemberOrdinal: 0,
      pressure: 700_000,
      movementHeading: 500_000,
    });
    expect(signaled).not.toBeNull();
    if (signaled === null) throw new Error("Signal fixture failed");

    expect(stepCoreEcologyGroupCoarse(signaled, {
      atTick: 9,
      disturbances: [],
    })).toBeNull();
    expect(emitCoreEcologyGroupSignal(signaled, {
      atTick: signaled.nextCoarseTick,
      kind: "movement",
      causeReferenceId: "movement:late",
      sourceMemberOrdinal: 0,
      pressure: 1,
      movementHeading: 0,
    })).toBeNull();

    const first = stepCoreEcologyGroupCoarse(signaled, {
      atTick: CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS,
      disturbances: [],
    });
    expect(first?.group.signals[0]?.reachedMemberOrdinals).toEqual([0, 1]);
    expect(first?.events).toEqual([
      expect.objectContaining({
        atTick: 8,
        kind: "signal-propagated",
        memberOrdinals: [1],
        nonlethal: true,
      }),
    ]);
    if (first === null) throw new Error("First coarse step failed");
    const second = stepCoreEcologyGroupCoarse(first.group, {
      atTick: 2 * CORE_ECOLOGY_GROUP_COARSE_CADENCE_TICKS,
      disturbances: [],
    });
    expect(second?.group.signals[0]?.reachedMemberOrdinals).toEqual([0, 1, 2]);
    expect(second?.events[0]?.eventId).not.toBe(first.events[0]?.eventId);
  });

  it("advances active signal cadence without spending coarse topology authority", () => {
    const split = stepCoreEcologyGroupCoarse(deerGroup(), {
      atTick: 8,
      disturbances: [disturbance(8)],
    });
    if (split === null) throw new Error("Active signal-only fixture failed to split");
    const signaled = emitCoreEcologyGroupSignal(split.group, {
      atTick: 9,
      kind: "alarm",
      causeReferenceId: "alarm:active-component",
      sourceMemberOrdinal: 0,
      pressure: 500_000,
      movementHeading: 750_000,
      lifetimeCadences: 1,
    });
    if (signaled === null) throw new Error("Active signal-only fixture failed to emit");
    const exhaustedTopology = canonicalizeCoreEcologyGroup({
      ...signaled,
      phase: "rejoining",
      cohesion: CORE_ECOLOGY_GROUP_REJOIN_COMPLETE_COHESION,
      nextComponentOrdinal: Number.MAX_SAFE_INTEGER,
      nextLineageOrdinal: Number.MAX_SAFE_INTEGER,
      nextAftermathOrdinal: Number.MAX_SAFE_INTEGER,
    });
    if (exhaustedTopology === null) throw new Error("Active signal-only fixture is invalid");

    let current = exhaustedTopology;
    const first = stepCoreEcologyGroupSignalCadence(current, { atTick: 16 });
    if (first === null) throw new Error("Active signal-only cadence was rejected");
    expect(first.events.map(({ kind }) => kind)).toEqual(["signal-propagated"]);
    current = first.group;
    for (const atTick of [24, 32, 40]) {
      const result = stepCoreEcologyGroupSignalCadence(current, { atTick });
      if (result === null) throw new Error(`Active signal-only cadence ${atTick} was rejected`);
      expect(result.events.every(({ kind }) => kind === "signal-propagated")).toBe(true);
      current = result.group;
    }

    expect(current).toMatchObject({
      phase: exhaustedTopology.phase,
      cohesion: exhaustedTopology.cohesion,
      components: exhaustedTopology.components,
      rendezvousAnchor: exhaustedTopology.rendezvousAnchor,
      lineage: exhaustedTopology.lineage,
      aftermath: exhaustedTopology.aftermath,
      nextComponentOrdinal: Number.MAX_SAFE_INTEGER,
      nextLineageOrdinal: Number.MAX_SAFE_INTEGER,
      nextAftermathOrdinal: Number.MAX_SAFE_INTEGER,
      updatedAtTick: 40,
      nextCoarseTick: 48,
      signals: [],
    });
  });

  it("splits, isolates propagation, rejoins with lineage, and records safe aftermath", () => {
    const split = stepCoreEcologyGroupCoarse(deerGroup(), {
      atTick: 8,
      disturbances: [disturbance(8)],
    });
    expect(split).not.toBeNull();
    if (split === null) throw new Error("Split fixture failed");

    expect(split.group.phase).toBe("separated");
    expect(split.group.components.map(({ memberOrdinals }) => memberOrdinals)).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(split.group.lineage.at(-1)).toEqual(expect.objectContaining({
      kind: "split",
      parentComponentIds: [deerGroup().components[0]?.componentId],
      childComponentIds: split.group.components.map(({ componentId }) => componentId),
    }));
    expect(split.group.aftermath[0]).toEqual(expect.objectContaining({
      kind: "separation",
      playerAbsent: true,
      harm: "none",
      cargoInteraction: false,
      disclosure: "direct-observation-required",
    }));
    expect(split.events[0]).toEqual(expect.objectContaining({
      kind: "group-split",
      nonlethal: true,
    }));

    const signaled = emitCoreEcologyGroupSignal(split.group, {
      atTick: 9,
      kind: "alarm",
      causeReferenceId: "alarm:component-zero",
      sourceMemberOrdinal: 0,
      pressure: 500_000,
      movementHeading: 750_000,
    });
    if (signaled === null) throw new Error("Separated signal fixture failed");
    const propagated = stepCoreEcologyGroupCoarse(signaled, {
      atTick: 16,
      disturbances: [],
    });
    expect(propagated?.group.signals[0]?.reachedMemberOrdinals).toEqual([0, 2]);
    expect(propagated?.events[0]?.memberOrdinals).toEqual([2]);
    expect(coreEcologyGroupComponentForMember(propagated?.group, 3)?.memberOrdinals).toEqual([1, 3]);

    let current = propagated?.group;
    for (const atTick of [24, 32, 40]) {
      const result = stepCoreEcologyGroupCoarse(current, { atTick, disturbances: [] });
      if (result === null) throw new Error(`Recovery step ${atTick} failed`);
      current = result.group;
    }
    expect(current?.phase).toBe("cohesive");
    expect(current?.components).toHaveLength(1);
    expect(current?.components[0]?.memberOrdinals).toEqual([0, 1, 2, 3]);
    expect(current?.lineage.at(-1)?.kind).toBe("rejoin");
    expect(current?.aftermath.at(-1)).toEqual(expect.objectContaining({
      kind: "reunion",
      harm: "none",
      cargoInteraction: false,
    }));
  });

  it("selects player-absent disturbances deterministically and rejects hidden effects", () => {
    const weaker = disturbance(8, {
      disturbanceId: "disturbance:z-weaker",
      pressure: 100_000,
      destinationAnchors: [position(1_000, 2_000)],
      rendezvousAnchor: position(1_000, 2_000),
    });
    const stronger = disturbance(8, {
      disturbanceId: "disturbance:a-stronger",
      pressure: 200_000,
      destinationAnchors: [position(3_000, 4_000)],
      rendezvousAnchor: position(3_000, 4_000),
    });
    const forward = stepCoreEcologyGroupCoarse(deerGroup(), {
      atTick: 8,
      disturbances: [weaker, stronger],
    });
    const reverse = stepCoreEcologyGroupCoarse(deerGroup(), {
      atTick: 8,
      disturbances: [stronger, weaker],
    });
    expect(forward).toEqual(reverse);
    expect(forward?.group.aftermath[0]?.incidentId).toBe("disturbance:a-stronger");
    expect(forward?.group.components[0]?.anchor).toEqual(position(3_000, 4_000));

    expect(stepCoreEcologyGroupCoarse(deerGroup(), {
      atTick: 8,
      disturbances: [{
        ...stronger,
        cargoInteraction: true,
      } as unknown as CoreEcologyPlayerAbsentDisturbance],
    })).toBeNull();
    expect(stepCoreEcologyGroupCoarse(deerGroup(), {
      atTick: 8,
      disturbances: [{
        ...stronger,
        targetActorId: "hidden-target",
      } as unknown as CoreEcologyPlayerAbsentDisturbance],
    })).toBeNull();
    expect(canonicalizeCoreEcologyGroup({
      ...deerGroup(),
      observations: ["hidden-observation"],
    })).toBeNull();
  });

  it("reconciles exact component anchors without changing membership or cadence", () => {
    const split = stepCoreEcologyGroupCoarse(deerGroup(), {
      atTick: 8,
      disturbances: [disturbance(8)],
    });
    if (split === null) throw new Error("Anchor reconciliation fixture failed");
    const firstAnchor = position(11_000, 13_000);
    const secondAnchor = position(61_000, 63_000);
    const rendezvousAnchor = position(41_000, 43_000);
    const forward = reconcileCoreEcologyGroupAnchors(split.group, {
      atTick: 9,
      componentAnchors: [
        { componentId: split.group.components[0]!.componentId, anchor: firstAnchor },
        { componentId: split.group.components[1]!.componentId, anchor: secondAnchor },
      ],
      rendezvousAnchor,
    });
    const reverse = reconcileCoreEcologyGroupAnchors(split.group, {
      atTick: 9,
      componentAnchors: [
        { componentId: split.group.components[1]!.componentId, anchor: secondAnchor },
        { componentId: split.group.components[0]!.componentId, anchor: firstAnchor },
      ],
      rendezvousAnchor,
    });

    expect(forward).toEqual(reverse);
    expect(forward).toEqual(expect.objectContaining({
      revision: split.group.revision + 1,
      updatedAtTick: 9,
      nextCoarseTick: split.group.nextCoarseTick,
      memberOrdinals: split.group.memberOrdinals,
      rendezvousAnchor,
    }));
    expect(forward?.components.map(({ anchor }) => anchor)).toEqual([firstAnchor, secondAnchor]);
    expect(reconcileCoreEcologyGroupAnchors(split.group, {
      atTick: split.group.nextCoarseTick,
      componentAnchors: split.group.components,
    })).toBeNull();
    expect(reconcileCoreEcologyGroupAnchors(split.group, {
      atTick: 9,
      componentAnchors: [{
        componentId: split.group.components[0]!.componentId,
        anchor: firstAnchor,
      }],
    })).toBeNull();
  });

  it("fails closed on overlap, tampering, and bounded-signal overflow", () => {
    const first = deerGroup();
    const overlap = createCoreEcologyGroup({
      seed: SEED,
      species: "deer",
      originRegion: ORIGIN,
      populationKey: "deer:wave-a",
      groupOrdinal: 1,
      memberOrdinals: [3, 4],
      anchor: position(20_000, 20_000),
    });
    expect(canonicalizeCoreEcologyGroupSet({
      version: 1,
      groups: [first, overlap],
    })).toBeNull();

    const split = stepCoreEcologyGroupCoarse(first, {
      atTick: 8,
      disturbances: [disturbance(8)],
    });
    if (split === null) throw new Error("Tamper fixture failed");
    const tampered = JSON.parse(JSON.stringify(split.group)) as Record<string, unknown>;
    const aftermath = tampered.aftermath as Array<Record<string, unknown>>;
    if (aftermath[0] === undefined) throw new Error("Missing aftermath fixture");
    aftermath[0].cargoInteraction = true;
    expect(canonicalizeCoreEcologyGroup(tampered)).toBeNull();

    let signaled: CoreEcologyGroupState | null = deerGroup();
    for (let index = 0; index < CORE_ECOLOGY_GROUP_MAX_SIGNALS; index += 1) {
      signaled = emitCoreEcologyGroupSignal(signaled, {
        atTick: 0,
        kind: "movement",
        causeReferenceId: `movement:${index}`,
        sourceMemberOrdinal: index % 4,
        pressure: 1,
        movementHeading: index,
      });
      expect(signaled).not.toBeNull();
    }
    expect(emitCoreEcologyGroupSignal(signaled, {
      atTick: 0,
      kind: "movement",
      causeReferenceId: "movement:overflow",
      sourceMemberOrdinal: 0,
      pressure: 1,
      movementHeading: 0,
    })).toBeNull();
  });
});
