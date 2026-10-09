import { describe, expect, it } from "vitest";

import {
  assertWorldInvariants,
  createWorld,
  createWorldView,
  serializeWorld,
  stepWorld,
  type ResidentState,
  type WorldState,
} from "../sim/public";
import {
  RESIDENT_PICKUP_ACTIVITY_OWNER_ID,
  RESIDENT_PICKUP_ACTIVITY_VERSION,
  canonicalizeResidentActivity,
} from "../sim/residentActivity";
import { residentAcceptedPickupBinding, residentRestTargetHasDrySupport } from "../sim/residentActivityWorld";
import {
  adoptResidentActivities,
  advanceResidentRestActivities,
  prepareResidentRestActivities,
} from "./residentActivityExecution";
import { VISIBILITY_DIRECT, VISIBILITY_HIDDEN } from "./perception";
import { TILE_UNITS, createPlayer } from "./player";
import {
  observableResidentBodyMoving,
  projectGameView,
  projectPerception,
  projectResidentWorldPosition,
} from "./projection";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import { WORLD_POSITION_UNITS_PER_TILE, worldPositionDelta } from "./worldPosition";

/**
 * Lower-adapter/projection evidence, not full runtime play or visual QA.
 * A native offer is accepted by the engine's automatic courier selection.
 * Controlled weather/needs/exclusivity isolate that choice; capability setup
 * adds no pose, task, pickup result, stock or cargo. The actual action adapter
 * selects pickup and supplies all tested fine-step displacement.
 */
function nativeAcceptedWorld(): WorldState {
  const world = createWorld("runtime baseline estuary", "wild");
  const contract = world.contracts.find(({ id }) => id === 127);
  if (contract === undefined || contract.status !== "offered") {
    throw new Error("Projection fixture needs native estuary offer127");
  }
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0,
    nextChangeTick: world.meta.completedTick + 1_000 };
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const candidate of world.contracts) {
    candidate.playerExclusiveUntilTick = Math.min(candidate.dueTick - 1, world.meta.completedTick + 1_000);
  }
  contract.playerExclusiveUntilTick = world.meta.completedTick;
  stepWorld(world);
  const accepted = world.contracts.find(({ id }) => id === contract.id);
  if (accepted === undefined || accepted.status !== "accepted" || accepted.assignedResidentId === null
    || accepted.cargoQuantity !== 0) throw new Error("Native offer was not automatically accepted without pickup");
  assertWorldInvariants(world);
  return world;
}

const BASE = nativeAcceptedWorld();

function assignedResident(world: WorldState): ResidentState {
  const contract = world.contracts.find(({ id }) => id === 127)!;
  const resident = world.residents.find(({ id }) => id === contract.assignedResidentId);
  if (resident === undefined) throw new Error("Projection fixture lost its actual courier");
  return resident;
}

function fixture() {
  const world = structuredClone(BASE);
  expect(adoptResidentActivities(world)).toBe(true);
  world.residents = world.residents.map((resident) => {
    const activity = canonicalizeResidentActivity({ ...resident.activity,
      version: RESIDENT_PICKUP_ACTIVITY_VERSION, ownerId: RESIDENT_PICKUP_ACTIVITY_OWNER_ID,
      rationTask: resident.activity?.rationTask ?? null,
      materialTask: resident.activity?.materialTask ?? null,
      inspectionTask: resident.activity?.inspectionTask ?? null,
      pickupTask: null,
    }, { actorId: resident.identity.stableId, tick: world.meta.completedTick, phase: 0 });
    if (activity === null) throw new Error("Explicit pickup capability lost the native body");
    return { ...resident, activity };
  });
  expect(prepareResidentRestActivities(world)).toBe(true);
  const resident = assignedResident(world);
  const pickup = residentAcceptedPickupBinding(world, resident);
  const source = resolveResidentWorldPlacement(world, resident)?.position;
  if (pickup === null || source === undefined) throw new Error("Native accepted courier has no pickup approach");
  expect(resident.activity?.pickupTask).toMatchObject({ contractId: pickup.contract.id, phase: "approaching" });
  expect(residentRestTargetHasDrySupport(world, source)).toBe(true);
  expect(residentRestTargetHasDrySupport(world, pickup.target)).toBe(true);
  const delta = worldPositionDelta(source, pickup.target);
  expect(Math.hypot(delta.x, delta.y)).toBe(WORLD_POSITION_UNITS_PER_TILE);
  return { world, actorId: resident.identity.stableId, source, target: pickup.target };
}

function presentation(world: WorldState, actorId: string, hidden = false) {
  const base = createWorldView(world);
  // Open, clear presentation geometry isolates body/status disclosure. It
  // never feeds back into simulation, changes body coordinates or fakes sight
  // grades. Existing visibility suites own terrain/light/occlusion fidelity.
  const view = { ...base, terrain: { ...base.terrain, tiles: base.terrain.tiles.map((tile) => ({
    ...tile, terrain: "meadow" as const, elevation: 0, roughness: 0, waterDepth: 0,
  })) } };
  const current = view.residents.find(({ identity }) => identity.stableId === actorId)!;
  const point = projectResidentWorldPosition(view, current, WORLD_POSITION_UNITS_PER_TILE);
  if (point === null) throw new Error("Projection fixture lost its real body position");
  const player = createPlayer(view);
  player.x = point.position.x - TILE_UNITS;
  player.y = point.position.y;
  player.facingMilliRadians = 0;
  if (hidden) {
    player.x = (point.position.x < view.terrain.width * TILE_UNITS / 2
      ? view.terrain.width - 0.5 : 0.5) * TILE_UNITS;
    player.y = (point.position.y < view.terrain.height * TILE_UNITS / 2
      ? view.terrain.height - 0.5 : 0.5) * TILE_UNITS;
  }
  const perception = projectPerception(view, player);
  const scene = projectGameView(view, player, { perception, selectedResidentId: current.id });
  const porter = scene.porters.find(({ actorId: id }) => id === actorId);
  const about = projectUIView(view, player, createSessionState(view.seedText), {
    perception, selectedResidentId: current.id,
  }).selectedResident;
  return { view, current, point, perception, scene, porter, about };
}

function expectNoPrivatePickup(porter: unknown) {
  expect(JSON.stringify(porter)).not.toMatch(
    /pickup|contractId|pickupTask|selectedAtTick|nextReassessmentAtTick|settlementId|localX|localY/iu,
  );
}

describe("knowledge-honest resident pickup motion projection", () => {
  it("does not describe a stationary current accepted carry commitment as moving or traveling", () => {
    const { world, actorId } = fixture();
    const bytes = serializeWorld(world);
    const { current, point, perception, porter, about } = presentation(world, actorId);
    expect(world.contracts.find(({ id }) => id === 127)).toMatchObject({ status: "accepted", cargoQuantity: 0 });
    expect(current.intention).toBe("carry");
    expect(current.activity?.poses).toHaveLength(1);
    expect(observableResidentBodyMoving(current)).toBe(false);
    expect(perception.detailVisibilityGrades[point.tileIndex]).toBe(VISIBILITY_DIRECT);
    expect(porter).toBeDefined();
    expect(porter?.state).toBe("waiting");
    expect(porter?.quickLabel).toBeDefined();
    expect(porter?.quickLabel).not.toMatch(/moving|traveling|pickup|carrying|promise/iu);
    expectNoPrivatePickup(porter);
    expect(about?.observed).toContainEqual({ label: "Behavior", value: "Waiting nearby" });
    expectNoPrivatePickup(about);
    expect(JSON.stringify(about?.observed)).not.toMatch(/pickup|carrying|promise|contract/iu);
    expect(serializeWorld(world)).toBe(bytes);
  });

  it("shows actual adapter approach displacement as moving without naming the private purpose", () => {
    const { world, actorId, source } = fixture();
    const result = advanceResidentRestActivities(world, 1);
    expect(result?.movedActorIds).toContain(actorId);
    const bytes = serializeWorld(world);
    const { current, point, perception, porter, about } = presentation(world, actorId);
    expect(current.activity?.poses).toHaveLength(2);
    expect(current.activity?.poses.at(-1)?.position).not.toEqual(source);
    expect(current.activity?.pickupTask?.phase).toBe("approaching");
    expect(observableResidentBodyMoving(current)).toBe(true);
    expect(perception.detailVisibilityGrades[point.tileIndex]).toBe(VISIBILITY_DIRECT);
    expect(porter?.state).toBe("traveling");
    expect(porter?.quickLabel).toMatch(/· moving$/u);
    expectNoPrivatePickup(porter);
    expect(about?.observed).toContainEqual({ label: "Behavior", value: "Moving nearby" });
    expectNoPrivatePickup(about);
    expect(JSON.stringify(about?.observed)).not.toMatch(/pickup|carrying|promise|contract/iu);
    expect(serializeWorld(world)).toBe(bytes);
  });

  it("stops showing motion after a real blocked step despite an earlier displacement and retained commitment", () => {
    const { world, actorId } = fixture();
    expect(advanceResidentRestActivities(world, 1)?.movedActorIds).toContain(actorId);
    const pickup = residentAcceptedPickupBinding(world, assignedResident(world))!;
    const origin = world.settlements.find(({ id }) => id === pickup.contract.originSettlementId)!;
    // Controlled physical counterfactual, not an assigned wait task or pose.
    world.terrain.tiles[origin.tileIndex]!.terrain = "deep-water";
    const stopped = advanceResidentRestActivities(world, 2);
    expect(stopped).not.toBeNull();
    expect(stopped?.movedActorIds).not.toContain(actorId);
    const bytes = serializeWorld(world);
    const { current, porter, about } = presentation(world, actorId);
    expect(current.activity?.poses).toHaveLength(3);
    expect(current.activity?.poses[1]?.position).toEqual(current.activity?.poses[2]?.position);
    expect(current.activity?.pickupTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    expect(current.intention).toBe("carry");
    expect(observableResidentBodyMoving(current)).toBe(false);
    expect(porter?.state).toBe("waiting");
    expect(porter?.quickLabel).not.toMatch(/moving|traveling/iu);
    expectNoPrivatePickup(porter);
    expect(about?.observed).toContainEqual({ label: "Behavior", value: "Waiting nearby" });
    expectNoPrivatePickup(about);
    expect(JSON.stringify(about?.observed)).not.toMatch(/pickup|carrying|promise|contract/iu);
    expect(serializeWorld(world)).toBe(bytes);
  });

  it("retains the deliberately coarse legacy carry classification only when the body is genuinely absent", () => {
    const world = structuredClone(BASE);
    const resident = assignedResident(world);
    expect(Object.hasOwn(resident, "activity")).toBe(false);
    expect(resident.intention).toBe("carry");
    const bytes = serializeWorld(world);
    const { current, porter, about } = presentation(world, resident.identity.stableId);
    expect(observableResidentBodyMoving(current)).toBe(false);
    expect(porter).toBeDefined();
    expect(porter?.state).toBe("traveling");
    expect(porter?.quickLabel).not.toMatch(/moving|pickup/iu);
    expectNoPrivatePickup(porter);
    expect(about?.observed).toContainEqual({ label: "Behavior", value: "Carrying a Promise" });
    expectNoPrivatePickup(about);
    expect(serializeWorld(world)).toBe(bytes);
  });

  it("does not reveal an unseen accepted courier or their private task", () => {
    const { world, actorId } = fixture();
    const bytes = serializeWorld(world);
    const { point, perception, porter, about } = presentation(world, actorId, true);
    expect(perception.detailVisibilityGrades[point.tileIndex]).toBe(VISIBILITY_HIDDEN);
    expect(porter).toBeUndefined();
    expect(about).toBeUndefined();
    expect(serializeWorld(world)).toBe(bytes);
  });
});
