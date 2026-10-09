import { describe, expect, it } from "vitest";

import { assertWorldInvariants, createWorld, deserializeWorld, serializeWorld, stepWorld } from "../sim/public";
import { replaceResidentActivity, type ResidentActivity } from "../sim/residentActivity";
import { canonicalResidentActivityForWorld, residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { prepareResidentTravelAdvance, revokeResidentTravelAdvance } from "../sim/residentTravelAdvance";
import { waterDepthAt } from "../sim/terrain";
import type { WorldState } from "../sim/types";
import { PLAYER_FOOT_MAX_WATER_DEPTH } from "./player";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { residentActivitiesMatchPerceptionInterval, residentActivitySaveExtensionsValid } from "./residentActivitySaveBoundary";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { worldPositionDelta, type WorldPosition } from "./worldPosition";

const SEED = "resident activity executable rest approach";
const ACTOR_ID = "H-v1-p0p0-1v5oh60-5-0vrsmbu";
const BASE = createWorld(SEED, "wild");
const WINDOW = { origin: { x: -10, y: -10 }, terrain: { width: 120, height: 120 } };

function residentAt(world: WorldState) {
  const resident = world.residents.find(({ identity }) => identity.stableId === ACTOR_ID);
  if (!resident) throw new Error("Native shallow-source resident disappeared");
  return resident;
}

function tileAt(world: WorldState, position: WorldPosition) {
  return world.terrain.tiles[Math.floor(position.localY / 1_000) * world.terrain.width + Math.floor(position.localX / 1_000)]!;
}

function exactProtocol(activity: ResidentActivity, version: ResidentActivity["version"]): ResidentActivity {
  // Codec foundation only, not runtime migration/activation of an old format.
  expect([activity.rationTask, activity.materialTask, activity.inspectionTask, activity.pickupTask, activity.travelTask]
    .every((task) => task == null)).toBe(true);
  return {
    version, ownerId: `sim:resident-activity:v${version}` as ResidentActivity["ownerId"],
    actorId: activity.actorId, tick: activity.tick, poses: activity.poses, restTask: activity.restTask,
    ...(version >= 2 ? { rationTask: null } : {}),
    ...(version >= 3 ? { materialTask: null } : {}),
    ...(version >= 4 ? { inspectionTask: null } : {}),
    ...(version >= 6 ? { pickupTask: null } : {}),
    ...(version >= 7 ? { travelTask: null } : {}),
  };
}

function fixture(version: ResidentActivity["version"] = 8) {
  const world = structuredClone(BASE);
  const chosen = residentAt(world);
  const source = resolveResidentWorldPlacement(world, chosen)!.position;
  const target = residentSettlementRestTarget(world, chosen)!;
  expect(chosen.activeContractId).toBeNull();
  expect(residentRestTargetHasDrySupport(world, target)).toBe(true);
  // Explicit need pressure; native geometry, clock, weather, offers, stocks,
  // identity and assignment remain intact. No task or arrival is authored.
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    resident.condition.exhaustion = 100_000;
  }
  chosen.needs.rest = 900_000;
  chosen.condition.exhaustion = 300_000;
  expect(adoptResidentActivities(world)).toBe(true);
  world.residents = world.residents.map((resident) => replaceResidentActivity(resident, exactProtocol(resident.activity!, 8)));
  expect(prepareResidentRestActivities(world)).toBe(true);
  expect(residentAt(world).activity?.restTask).toMatchObject({ kind: "settlement-rest", origin: "selected", cause: "urgent-rest", phase: "approaching", target });
  // Preserve the actually selected task and anchor in frozen protocol tests;
  // do not reprepare an old phase-zero root and thereby invoke its upgrade.
  if (version !== 8) world.residents = world.residents.map((resident) => replaceResidentActivity(resident, exactProtocol(resident.activity!, version)));
  expect(world.residents.every((resident) => canonicalResidentActivityForWorld(world, resident) !== null)).toBe(true);
  return { world, source, target };
}

function advance(world: WorldState, from: number, to: number): void {
  for (let phase = from; phase <= to; phase += 1) {
    const prior = residentAt(world).activity!.poses.at(-1)!.position;
    const result = advanceResidentRestActivities(world, phase, WINDOW);
    expect(result).not.toBeNull();
    expect(result!.maximumSurfaceCells).toBeLessThanOrEqual(16 * 16);
    const delta = worldPositionDelta(prior, residentAt(world).activity!.poses.at(-1)!.position);
    expect(Math.ceil(Math.hypot(delta.x, delta.y))).toBeLessThanOrEqual(105);
  }
}

function closeInterval(world: WorldState): void {
  const admission = prepareResidentTravelAdvance(world, WINDOW);
  expect(admission).not.toBeNull();
  try { stepWorld(world, [], undefined, undefined, admission!); }
  finally { revokeResidentTravelAdvance(admission!); }
  assertWorldInvariants(world);
}

describe("selected-rest shallow-source egress", () => {
  it("starts from actual native shallows toward a dry refuge before any tide advancement", () => {
    const { world, source, target } = fixture();
    expect(world.meta.completedTick).toBe(420);
    expect(world.tide).toEqual({ phase: 420, level: 505_000, direction: -1 });
    expect(source).toMatchObject({ region: { x: 0, y: 0 }, localX: 89_500, localY: 27_500 });
    expect(target).toMatchObject({ localX: 90_500, localY: 26_500 });
    expect(waterDepthAt(tileAt(world, source), world.tide)).toBe(2_542);
    const terrain = JSON.stringify(world.terrain);
    const tide = { ...world.tide };
    const stocks = world.settlements.map(({ inventory }) => ({ ...inventory }));
    advance(world, 1, 1);
    const moving = residentAt(world);
    expect(moving.activity!.poses[0]!.position).toEqual(source);
    expect(moving.activity!.poses[1]!.position).not.toEqual(source);
    expect(moving.activity!.restTask?.phase).toBe("approaching");
    expect(moving.activeContractId).toBeNull();
    expect(moving.activity!.travelTask).toBeNull();
    expect(moving.circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    expect(moving.condition.exhaustion).toBe(300_000);
    expect(world.meta.completedTick).toBe(420);
    expect(world.tide).toEqual(tide);
    expect(waterDepthAt(tileAt(world, source), world.tide)).toBe(2_542);
    expect(JSON.stringify(world.terrain)).toBe(terrain);
    expect(world.settlements.map(({ inventory }) => inventory)).toEqual(stocks);
    assertWorldInvariants(world);
  });

  it.each([PLAYER_FOOT_MAX_WATER_DEPTH, PLAYER_FOOT_MAX_WATER_DEPTH + 1] as const)("honors the existing ordinary-foot source bound at depth%s", (depth) => {
    const { world, source } = fixture();
    // FOUNDATION terrain contrast after genuine body capture; no body/task
    // is relocated. 55k ADRIFT standability is not ordinary-foot permission.
    tileAt(world, source).elevation = world.tide.level - depth;
    advance(world, 1, 1);
    const resident = residentAt(world);
    if (depth <= PLAYER_FOOT_MAX_WATER_DEPTH) {
      expect(resident.activity!.poses[1]!.position).not.toEqual(source);
      expect(resident.activity!.restTask?.phase).toBe("approaching");
    } else {
      expect(resident.activity!.poses[1]!.position).toEqual(source);
      expect(resident.activity!.restTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
      expect(resident.circadian?.restDestinationArrived).toBe(false);
    }
    assertWorldInvariants(world);
  });

  it.each(["deep-source", "wet-destination", "wet-intermediate"] as const)("does not turn source egress into general wet access for%s", (obstruction) => {
    const { world, source, target } = fixture();
    // Explicit physical counterfactual foundations. Only the occupied source
    // may open; wet neighbors cannot become a route to the dry diagonal refuge.
    if (obstruction === "deep-source") tileAt(world, source).terrain = "deep-water";
    if (obstruction === "wet-destination") tileAt(world, target).elevation = world.tide.level - 1;
    if (obstruction === "wet-intermediate") {
      const sourceTile = tileAt(world, source);
      const targetTile = tileAt(world, target);
      for (let y = sourceTile.y - 1; y <= sourceTile.y + 1; y += 1) {
        for (let x = sourceTile.x - 1; x <= sourceTile.x + 1; x += 1) {
          const tile = world.terrain.tiles[y * world.terrain.width + x]!;
          if (tile.index !== sourceTile.index && tile.index !== targetTile.index) tile.elevation = world.tide.level - 1;
        }
      }
      expect(residentRestTargetHasDrySupport(world, target)).toBe(true);
    }
    advance(world, 1, 4);
    const waiting = residentAt(world);
    expect(waiting.activity!.poses.every(({ position }) => JSON.stringify(position) === JSON.stringify(source))).toBe(true);
    expect(waiting.activity!.restTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route", nextReassessmentAtTick: 421 });
    expect(waiting.condition.exhaustion).toBe(300_000);
    expect(waiting.circadian?.restDestinationArrived).toBe(false);
    assertWorldInvariants(world);
  });

  it.each([1, 2, 3, 4, 5, 6, 7] as const)("preserves frozen v%s shallow-source waiting through accepted fine steps", (version) => {
    const { world, source } = fixture(version);
    advance(world, 1, 4);
    const waiting = residentAt(world);
    expect(waiting.activity!.version).toBe(version);
    expect(waiting.activity!.poses).toHaveLength(5);
    expect(waiting.activity!.poses.every(({ position }) => JSON.stringify(position) === JSON.stringify(source))).toBe(true);
    expect(waiting.activity!.restTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    expect(waiting.circadian?.restDestinationArrived).toBe(false);
    assertWorldInvariants(world);
  });

  it.each([4, 9])("preserves exact inner-world phase%s egress and real closing work after clone/load", (phase) => {
    const { world, source, target } = fixture();
    advance(world, 1, phase);
    expect(residentAt(world).activity!.poses.at(-1)!.position).not.toEqual(source);
    const bytes = serializeWorld(world);
    const branches = [world, structuredClone(world), deserializeWorld(bytes)];
    for (const branch of branches) {
      expect(serializeWorld(branch)).toBe(bytes);
      expect(residentActivitiesMatchPerceptionInterval(branch.residents, 420, phase)).toBe(true);
      expect(residentActivitySaveExtensionsValid(branch, true, true, true, true, true, true, true, true)).toBe(true);
      expect(residentActivitySaveExtensionsValid(branch, true, true, true, true, true, true, true, false)).toBe(false);
      advance(branch, phase + 1, 10);
      closeInterval(branch);
      expect(prepareResidentRestActivities(branch)).toBe(true);
      advance(branch, 1, 10);
      closeInterval(branch);
      const rested = residentAt(branch);
      expect(rested.activity!.poses).toHaveLength(1);
      expect(rested.activity!.poses[0]!.position).toEqual(target);
      expect(rested.activity!.restTask?.phase).toBe("arrived");
      expect(rested.circadian?.restDestinationArrived).toBe(true);
    }
    expect(serializeWorld(branches[1]!)).toBe(serializeWorld(world));
    expect(serializeWorld(branches[2]!)).toBe(serializeWorld(world));
  });
});
