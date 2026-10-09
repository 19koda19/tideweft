import { describe, expect, it } from "vitest";

import {
  assertWorldInvariants, createWorld, createWorldView, deserializeWorld, serializeWorld, stepWorld,
  type ResidentPerceptionFrame,
} from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { replaceResidentActivity, type ResidentActivity } from "../sim/residentActivity";
import {
  canonicalResidentActivityForWorld, residentRestTargetHasDrySupport,
  residentSettlementMaterialProject, residentSettlementRationTarget,
} from "../sim/residentActivityWorld";
import { prepareResidentRationUse, revokeResidentRationUse } from "../sim/residentRationUse";
import { prepareResidentTravelAdvance, revokeResidentTravelAdvance } from "../sim/residentTravelAdvance";
import { waterDepthAt } from "../sim/terrain";
import type { WorldState } from "../sim/types";
import { createCoreEcologyAggregatePatch } from "./coreEcology";
import { deriveCoreEcologyHarborEdgeHabitatAssemblage } from "./coreEcologyHabitat";
import { ORDINARY_FOOT_MAX_WATER_DEPTH } from "./footing";
import { createPorterResponseState } from "./porterResponse";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { residentActivitiesMatchPerceptionInterval } from "./residentActivitySaveBoundary";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createSettlementEcologyState } from "./settlementEcology";
import {
  advanceSettlementKeeperStoreInspection, collectSettlementKeeperStoreObservations,
  settlementKeeperInspectionTasksValid,
} from "./settlementKeeperInspection";
import { worldPositionDelta, type WorldPosition } from "./worldPosition";

const BASE = createWorld("resident activity executable rest approach", "wild");
const ACTOR_ID = "H-v1-p0p0-1v5oh60-5-0vrsmbu";
const WINDOW = { origin: { x: -10, y: -10 }, terrain: { width: 120, height: 120 } };
type Service = "ration" | "material" | "inspection";

function residentAt(world: WorldState) {
  const resident = world.residents.find(({ identity }) => identity.stableId === ACTOR_ID);
  if (resident === undefined) throw new Error("Native shallow service resident disappeared");
  return resident;
}

function tileAt(world: WorldState, position: WorldPosition) {
  return world.terrain.tiles[Math.floor(position.localY / 1_000) * world.terrain.width
    + Math.floor(position.localX / 1_000)]!;
}

function serviceTask(world: WorldState, service: Service) {
  const activity = residentAt(world).activity!;
  return service === "ration" ? activity.rationTask
    : service === "material" ? activity.materialTask : activity.inspectionTask;
}

function exactProtocol(activity: ResidentActivity, version: ResidentActivity["version"]) {
  // Protocol foundation, not migration or activation of an old outer save.
  // Preserve the actually selected service and captured body, never its result.
  expect(activity.restTask).toBeNull();
  expect(activity.pickupTask ?? null).toBeNull();
  expect(activity.travelTask ?? null).toBeNull();
  return {
    version, ownerId: `sim:resident-activity:v${version}` as ResidentActivity["ownerId"],
    actorId: activity.actorId, tick: activity.tick, poses: activity.poses, restTask: null,
    ...(version >= 2 ? { rationTask: activity.rationTask ?? null } : {}),
    ...(version >= 3 ? { materialTask: activity.materialTask ?? null } : {}),
    ...(version >= 4 ? { inspectionTask: activity.inspectionTask ?? null } : {}),
    ...(version >= 6 ? { pickupTask: null } : {}),
    ...(version >= 7 ? { travelTask: null } : {}),
  } satisfies ResidentActivity;
}

function advance(world: WorldState, from: number, to: number) {
  for (let phase = from; phase <= to; phase += 1) {
    const before = residentAt(world).activity!.poses.at(-1)!.position;
    const result = advanceResidentRestActivities(world, phase, WINDOW);
    expect(result).not.toBeNull();
    expect(result!.maximumSurfaceCells).toBeLessThanOrEqual(16 * 16);
    const delta = worldPositionDelta(before, residentAt(world).activity!.poses.at(-1)!.position);
    expect(Math.ceil(Math.hypot(delta.x, delta.y))).toBeLessThanOrEqual(105);
  }
}

function closeInterval(world: WorldState, perception?: ResidentPerceptionFrame) {
  const service = prepareResidentRationUse(world,
    world.residents.map(({ identity }) => ({ actorId: identity.stableId, duty: null })));
  const travel = prepareResidentTravelAdvance(world, WINDOW);
  expect(service).not.toBeNull();
  expect(travel).not.toBeNull();
  try { stepWorld(world, [], perception, service!, travel!); }
  finally {
    revokeResidentRationUse(service!);
    revokeResidentTravelAdvance(travel!);
  }
  assertWorldInvariants(world);
}

function controlledSource(service: Service) {
  const world = structuredClone(BASE);
  const chosen = residentAt(world);
  const source = resolveResidentWorldPlacement(world, chosen)!.position;
  const target = residentSettlementRationTarget(world, chosen)!;
  expect(source).toMatchObject({ region: { x: 0, y: 0 }, localX: 89_500, localY: 27_500 });
  expect(target).toMatchObject({ localX: 90_500, localY: 26_500 });
  expect(waterDepthAt(tileAt(world, source), world.tide)).toBe(2_542);
  expect(residentRestTargetHasDrySupport(world, target)).toBe(true);
  expect(chosen.activeContractId).toBeNull();
  // Need/routine fixtures, not untouched autonomous onset. Native terrain,
  // body source, identities, weather, stocks, offers and commitments stay real.
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    resident.condition.exhaustion = 100_000;
  }
  chosen.needs = { food: service === "ration" ? 900_000 : 100_000,
    rest: 100_000, belonging: service === "ration" ? 100_000 : 400_000 };
  if (service !== "ration") {
    // Explicit coarse disposition for this adapter foundation; not evidence
    // that an occupation supplies capability or that a task already succeeded.
    chosen.intention = service === "material" ? "work" : "connect";
  }
  expect(adoptResidentActivities(world)).toBe(true);
  world.residents = world.residents.map((resident) => replaceResidentActivity(resident,
    exactProtocol(resident.activity!, 8)));
  return { world, source, target };
}

function fixture(service: Service = "ration", version: ResidentActivity["version"] = 8) {
  const current = controlledSource(service);
  const { world, target } = current;
  let store: ReturnType<typeof createSettlementEcologyState> | null = null;
  if (service === "material") {
    const site = residentSettlementMaterialProject(world, residentAt(world));
    expect(site).not.toBeNull();
    expect(site!.project.status).toBe("building");
    expect(site!.inventory[site!.project.resource]).toBeGreaterThanOrEqual(1);
  }
  expect(prepareResidentRestActivities(world)).toBe(true);
  if (service === "inspection") {
    // Explicit store/keeper binding FOUNDATION, not the runtime bootstrap's
    // keeper choice. Evidence itself comes from real shared sight and lower
    // admission; no knowledge, task, arrival or closure is assigned.
    const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
      rootSeed: world.meta.rootSeed, originRegion: createRegionCoord(0, 0),
    });
    const aggregatePatch = createCoreEcologyAggregatePatch({
      seed: world.meta.rootSeed, patchKey: "service-shallow-inspection:v1",
      originRegion: createRegionCoord(0, 0), tick: world.meta.completedTick,
      populations: habitat.populations.flatMap((population) => (
        population.representation !== "individual-representatives" || population.populationUnits === 0 ? [] : [{
          species: population.species, populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal, representedUnits: allocation.representedUnits,
            position: allocation.position, materialization: "coarse" as const,
          })),
        }]
      )), derivation: { kind: "habitat-v2", habitat },
    });
    store = createSettlementEcologyState({
      rootSeed: world.meta.rootSeed, settlementId: residentAt(world).homeSettlementId,
      keeperActorId: ACTOR_ID, position: target, aggregatePatch,
    });
    expect(serviceTask(world, service)).toBeNull();
    expect(residentAt(world).activity!.materialTask).toBeNull();
    advance(world, 1, 10);
    expect(residentAt(world).activity!.poses.every(({ position }) => JSON.stringify(position) === JSON.stringify(current.source))).toBe(true);
    const observations = collectSettlementKeeperStoreObservations({
      world: createWorldView(world), window: { origin: { x: 0, y: 0 } }, settlement: store,
      targetTick: world.meta.completedTick + 1,
    });
    expect(observations).toHaveLength(1);
    closeInterval(world, { tick: world.meta.completedTick + 1,
      residents: world.residents.map(({ id, identity }) => ({ residentId: id,
        actorId: identity.stableId, observations: identity.stableId === ACTOR_ID ? observations! : [] })),
    });
    expect(residentAt(world).activity!.poses[0]!.position).toEqual(current.source);
    const informed = advanceSettlementKeeperStoreInspection({
      world, settlement: store, porterResponse: createPorterResponseState(ACTOR_ID, world.meta.completedTick),
      observations: observations!,
    });
    expect(informed?.closure).toBe("open");
    expect(informed?.keeperKnowledge).toContainEqual(expect.objectContaining({
      source: "direct-observation", sourceActorId: ACTOR_ID, evidenceId: observations![0]!.id,
    }));
    store = informed!;
    expect(prepareResidentRestActivities(world, [], store)).toBe(true);
    expect(settlementKeeperInspectionTasksValid(world, store)).toBe(true);
    expect(serviceTask(world, service)).toMatchObject({ sourceEvidenceId: observations![0]!.id });
  }
  expect(serviceTask(world, service)).toMatchObject({
    kind: `settlement-${service}`, target, phase: "approaching",
  });
  // Frozen partial protocols preserve their existing selected task; do not
  // reprepare them and accidentally invoke legitimate phase-zero evolution.
  if (version !== 8) world.residents = world.residents.map((resident) => replaceResidentActivity(resident,
    exactProtocol(resident.activity!, version)));
  expect(world.residents.every((resident) => canonicalResidentActivityForWorld(world, resident) !== null)).toBe(true);
  return { ...current, store };
}

describe("unladen service shallow-source egress", () => {
  it.each(["ration", "material", "inspection"] as const)("moves actual %s approach before the occupied native source dries without committing use", (service) => {
    const { world, source, target, store } = fixture(service);
    const tick = world.meta.completedTick;
    const terrain = JSON.stringify(world.terrain);
    const tide = { ...world.tide };
    const economy = structuredClone({ settlements: world.settlements, ledger: world.ledger,
      contracts: world.contracts, events: world.events });
    const needs = { ...residentAt(world).needs };
    const storeBefore = JSON.stringify(store);
    expect(waterDepthAt(tileAt(world, source), world.tide)).toBeGreaterThan(0);
    advance(world, 1, 1);
    const resident = residentAt(world);
    expect(resident.activity!.poses[0]!.position).toEqual(source);
    expect(resident.activity!.poses[1]!.position).not.toEqual(source);
    expect(resident.activity!.poses[1]!.position).not.toEqual(target);
    expect(serviceTask(world, service)).toMatchObject({ phase: "approaching" });
    if (service !== "inspection") expect(serviceTask(world, service)).toMatchObject({ usedAtTick: null });
    expect(resident.activeContractId).toBeNull();
    expect(resident.activity!.pickupTask).toBeNull();
    expect(resident.activity!.travelTask).toBeNull();
    expect(resident.needs).toEqual(needs);
    expect(resident.circadian?.restDestinationArrived).toBe(false);
    expect(world.meta.completedTick).toBe(tick);
    expect(world.tide).toEqual(tide);
    expect(JSON.stringify(world.terrain)).toBe(terrain);
    expect({ settlements: world.settlements, ledger: world.ledger,
      contracts: world.contracts, events: world.events }).toEqual(economy);
    expect(JSON.stringify(store)).toBe(storeBefore);
    assertWorldInvariants(world);
  });

  it.each([ORDINARY_FOOT_MAX_WATER_DEPTH, ORDINARY_FOOT_MAX_WATER_DEPTH + 1])("uses the existing ordinary-foot bound at source depth%s", (depth) => {
    const { world, source } = fixture();
    // Explicit physical foundation after genuine body/task capture.
    tileAt(world, source).elevation = world.tide.level - depth;
    advance(world, 1, 1);
    if (depth <= ORDINARY_FOOT_MAX_WATER_DEPTH) {
      expect(residentAt(world).activity!.poses[1]!.position).not.toEqual(source);
    } else {
      expect(residentAt(world).activity!.poses[1]!.position).toEqual(source);
      expect(serviceTask(world, "ration")).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    }
    expect(serviceTask(world, "ration")).toMatchObject({ usedAtTick: null, foodUsed: false, waterUsed: false });
    assertWorldInvariants(world);
  });

  it.each(["deep-source", "wet-destination", "wet-neighbors"] as const)("does not grant ration access through %s", (obstruction) => {
    const { world, source, target } = fixture();
    if (obstruction === "deep-source") tileAt(world, source).terrain = "deep-water";
    if (obstruction === "wet-destination") tileAt(world, target).elevation = world.tide.level - 1;
    if (obstruction === "wet-neighbors") {
      const center = tileAt(world, source);
      for (let y = center.y - 1; y <= center.y + 1; y += 1) for (let x = center.x - 1; x <= center.x + 1; x += 1) {
        const tile = world.terrain.tiles[y * world.terrain.width + x]!;
        if (tile.index !== center.index && tile.index !== tileAt(world, target).index) tile.elevation = world.tide.level - 1;
      }
      expect(residentRestTargetHasDrySupport(world, target)).toBe(true);
    }
    advance(world, 1, 4);
    expect(residentAt(world).activity!.poses.every(({ position }) => JSON.stringify(position) === JSON.stringify(source))).toBe(true);
    expect(serviceTask(world, "ration")).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route", usedAtTick: null });
    assertWorldInvariants(world);
  });

  it.each([
    ["ration", 2], ["ration", 7], ["material", 3], ["material", 7], ["inspection", 4], ["inspection", 7],
  ] as const)("retains frozen %s v%s dry-only source behavior", (service, version) => {
    const { world, source, store } = fixture(service, version);
    advance(world, 1, 4);
    expect(residentAt(world).activity!.version).toBe(version);
    expect(residentAt(world).activity!.poses.every(({ position }) => JSON.stringify(position) === JSON.stringify(source))).toBe(true);
    expect(serviceTask(world, service)).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    if (store !== null) expect(settlementKeeperInspectionTasksValid(world, store)).toBe(true);
    assertWorldInvariants(world);
  });

  it.each(["material", "inspection"] as const)("keeps the %s destination dry-only without spending stock or closing a store", (service) => {
    const { world, source, target, store } = fixture(service);
    // Physical foundation, not a claim that the selected native site flooded.
    tileAt(world, target).elevation = world.tide.level - 1;
    const accounting = structuredClone({ settlements: world.settlements, ledger: world.ledger });
    const storeBefore = JSON.stringify(store);
    advance(world, 1, 4);
    expect(residentAt(world).activity!.poses.every(({ position }) => JSON.stringify(position) === JSON.stringify(source))).toBe(true);
    expect(serviceTask(world, service)).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    expect({ settlements: world.settlements, ledger: world.ledger }).toEqual(accounting);
    expect(JSON.stringify(store)).toBe(storeBefore);
    if (store !== null) {
      expect(store.closure).toBe("open");
      expect(store.lastClosureTransactionId).toBeNull();
      expect(settlementKeeperInspectionTasksValid(world, store)).toBe(true);
    }
    assertWorldInvariants(world);
  });

  it.each([4, 9])("continues actual ration phase%s after clone/inner load with exact closing work and no premature debit", (phase) => {
    const { world, source } = fixture();
    advance(world, 1, phase);
    expect(residentAt(world).activity!.poses.at(-1)!.position).not.toEqual(source);
    const bytes = serializeWorld(world);
    const branches = [world, structuredClone(world), deserializeWorld(bytes)];
    for (const branch of branches) {
      expect(serializeWorld(branch)).toBe(bytes);
      expect(residentActivitiesMatchPerceptionInterval(branch.residents, 420, phase)).toBe(true);
      advance(branch, phase + 1, 10);
      closeInterval(branch);
      expect(branch.meta.completedTick).toBe(421);
      expect(serviceTask(branch, "ration")).toMatchObject({ usedAtTick: null, foodUsed: false, waterUsed: false });
    }
    expect(serializeWorld(branches[1]!)).toBe(serializeWorld(world));
    expect(serializeWorld(branches[2]!)).toBe(serializeWorld(world));
  });
});
