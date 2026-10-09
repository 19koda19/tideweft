import { describe, expect, it } from "vitest";

import { createActorObservation, createActorPerceptionState, stepActorPerception } from "../sim/actorPerception";
import { createWorld, deserializeWorld, serializeWorld, stepWorld } from "../sim/public";
import { replaceResidentActivity, RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID, RESIDENT_ENVIRONMENT_ACTIVITY_VERSION } from "../sim/residentActivity";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { residentRestSurfaceObservationId } from "../sim/residentSurfaceKnowledge";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { worldPositionDelta } from "./worldPosition";

const BASE = createWorld("resident activity executable rest approach", "standard");

/** Explicit adapter fixtures, not a claim of native sight or task autonomy. */
function fixture(wetTarget = false) {
  const world = structuredClone(BASE);
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: 2_000 };
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = 2_000;
    contract.dueTick = 3_000;
  }
  const chosen = world.residents.find((resident) => {
    const source = resolveResidentWorldPlacement(world, resident)?.position;
    const target = residentSettlementRestTarget(world, resident);
    if (!source || !target || !residentRestTargetHasDrySupport(world, source)
      || !residentRestTargetHasDrySupport(world, target)) return false;
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === 1_000;
  })!;
  chosen.needs.rest = 900_000;
  chosen.condition.exhaustion = 300_000;
  const actorId = chosen.identity.stableId;
  if (wetTarget) {
    const target = residentSettlementRestTarget(world, chosen)!;
    world.terrain.tiles[Math.floor(target.localY / 1_000) * world.terrain.width
      + Math.floor(target.localX / 1_000)]!.elevation = world.tide.level - 10_000;
  }
  expect(adoptResidentActivities(world)).toBe(true);
  expect(prepareResidentRestActivities(world)).toBe(true);
  world.residents = world.residents.map((resident) => replaceResidentActivity(resident, {
    ...resident.activity!, version: RESIDENT_ENVIRONMENT_ACTIVITY_VERSION,
    ownerId: RESIDENT_ENVIRONMENT_ACTIVITY_OWNER_ID, inspectionTask: null,
  }));
  const get = () => world.residents.find((resident) => resident.identity.stableId === actorId)!;
  const target = get().activity!.restTask!.target;
  const see = (surface: "wet" | "dry", foreign = false) => {
    const tick = world.meta.completedTick;
    const observation = createActorObservation({
      id: residentRestSurfaceObservationId(foreign ? "another-actor" : actorId, target),
      observerId: actorId, observedAtTick: tick, channel: "vision", identification: "classified",
      perceivedClass: surface === "wet" ? "water-covered-ground" : "dry-ground",
      subjectId: null, area: { center: target, radiusUnits: 0 }, confidence: 800_000,
      salience: 300_000, interrupt: "information",
    });
    if (!observation) throw new Error("invalid surface fixture");
    const state = stepActorPerception(createActorPerceptionState(actorId, tick - 1), { tick, observations: [observation] });
    if (!state) throw new Error("surface fixture was not admitted");
    get().perception = state;
  };
  const nextTick = () => {
    for (let phase = 1; phase <= 10; phase += 1) expect(advanceResidentRestActivities(world, phase)).not.toBeNull();
    stepWorld(world);
  };
  see("wet");
  expect(prepareResidentRestActivities(world)).toBe(true);
  expect(get().activity?.restTask).toMatchObject({ phase: "waiting", waitReason: "observed-water" });
  return { world, actorId, get, target, see, nextTick };
}

describe("selected-rest observed-water reassessment", () => {
  it.each(["stale", "evicted", "foreign"] as const)("retains the hold on physically dry support with %s knowledge", (kind) => {
    const { world, get, actorId, target, see, nextTick } = fixture();
    const body = get().activity!.poses[0];
    const selectedAtTick = get().activity!.restTask!.selectedAtTick;
    nextTick();
    if (kind === "evicted") get().perception = createActorPerceptionState(actorId, world.meta.completedTick);
    if (kind === "foreign") see("dry", true);
    expect(residentRestTargetHasDrySupport(world, target)).toBe(true);
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(get().activity?.restTask).toMatchObject({ phase: "waiting", waitReason: "observed-water",
      selectedAtTick, nextReassessmentAtTick: world.meta.completedTick + 1 });
    expect(get().activity?.poses).toEqual([body]);
    expect(get().condition.exhaustion).toBe(300_000);
    expect(get().circadian?.restDestinationArrived).toBe(false);
    const bytes = serializeWorld(world);
    expect(serializeWorld(deserializeWorld(bytes))).toBe(bytes);
  });

  it.each([false, true])("fresh dry evidence releases only with independent dry support=%s", (drySupport) => {
    const { world, get, see, nextTick } = fixture(!drySupport);
    nextTick();
    see("dry");
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(get().activity?.restTask).toMatchObject(drySupport
      ? { phase: "approaching", waitReason: null } : { phase: "waiting", waitReason: "observed-water" });
    const result = advanceResidentRestActivities(world, 1);
    expect(result).not.toBeNull();
    expect(result?.movedActorIds.includes(get().identity.stableId)).toBe(drySupport);
    expect(get().condition.exhaustion).toBe(300_000);
  });

  it("a higher storm priority revokes the task without granting arrival or recovery", () => {
    const { world, get } = fixture();
    world.weather = { ...world.weather, kind: "storm", intensity: 1_000_000 };
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(get().activity?.restTask).toBeNull();
    expect(get().circadian?.restDestinationArrived).toBe(false);
    expect(get().condition.exhaustion).toBe(300_000);
  });
});
