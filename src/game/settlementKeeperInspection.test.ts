import { describe, expect, it } from "vitest";

import { createActorPerceptionState, type ActorObservation } from "../sim/actorPerception";
import { createWorld, createWorldView, stepWorld } from "../sim/public";
import { createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import {
  RESIDENT_SERVICE_ACTIVITY_OWNER_ID,
  RESIDENT_SERVICE_ACTIVITY_VERSION,
} from "../sim/residentActivity";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { MAX_TIDE_LEVEL, tideAtTick } from "../sim/terrain";
import { FIXED_POINT, type ResidentState, type WorldState } from "../sim/types";
import { stableStringify } from "../sim/util";
import { WORLD_NIGHT_START_TICK } from "../sim/worldTime";
import { createCoreEcologyAggregatePatch } from "./coreEcology";
import { deriveCoreEcologyHarborEdgeHabitatAssemblage } from "./coreEcologyHabitat";
import { createPorterResponseState } from "./porterResponse";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import {
  createSettlementEcologyState,
  deserializeSettlementEcologyState,
  serializeSettlementEcologyState,
  type SettlementEcologyState,
} from "./settlementEcology";
import {
  advanceSettlementKeeperStoreInspection,
  collectSettlementKeeperStoreObservations,
} from "./settlementKeeperInspection";
import { translateWorldPosition, WORLD_POSITION_UNITS_PER_TILE, worldPositionDelta, type WorldPosition } from "./worldPosition";

const BASE = createWorld("resident activity executable rest approach", "standard");
const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
  rootSeed: BASE.meta.rootSeed, originRegion: createRegionCoord(0, 0),
});
const PATCH = createCoreEcologyAggregatePatch({
  seed: BASE.meta.rootSeed, patchKey: "keeper-inspection-contract:v1", originRegion: createRegionCoord(0, 0),
  tick: BASE.meta.completedTick,
  populations: habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives" || population.populationUnits === 0
      ? []
      : [{
          species: population.species, populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal, representedUnits: allocation.representedUnits,
            position: allocation.position, materialization: "coarse" as const,
          })),
        }]
  )),
  derivation: { kind: "habitat-v2", habitat },
});

function keeperAt(world: WorldState, actorId: string): ResidentState {
  const resident = world.residents.find(({ identity }) => identity.stableId === actorId);
  if (resident === undefined) throw new Error("Keeper fixture lost its native human");
  return resident;
}

/** Controlled needs/weather/commitments; no authored body, task or arrival. */
function nativeFixture(rest = false) {
  const world = structuredClone(BASE);
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: world.meta.completedTick + 1_000 };
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 300_000 };
    resident.condition.exhaustion = 100_000;
    resident.intention = "work";
  }
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = world.meta.completedTick + 1_000;
    contract.dueTick = world.meta.completedTick + 2_000;
  }
  const chosen = world.residents.find((resident) => {
    const source = resolveResidentWorldPlacement(world, resident)?.position;
    const target = residentSettlementRestTarget(world, resident);
    const settlement = world.settlements.find(({ id }) => id === resident.homeSettlementId);
    if (source === undefined || target === null || settlement === undefined
      || !residentRestTargetHasDrySupport(world, source) || !residentRestTargetHasDrySupport(world, target)
      || settlement.project.status !== "building" || settlement.inventory[settlement.project.resource] < 1) return false;
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === WORLD_POSITION_UNITS_PER_TILE;
  });
  if (chosen === undefined) throw new Error("Native seed lacks the existing one-tile dry service approach");
  if (rest) chosen.needs.rest = 900_000;
  const actorId = chosen.identity.stableId;
  const target = residentSettlementRestTarget(world, chosen)!;
  const source = resolveResidentWorldPlacement(world, chosen)!.position;
  const store = createSettlementEcologyState({
    rootSeed: world.meta.rootSeed, settlementId: chosen.homeSettlementId,
    keeperActorId: actorId, position: target, aggregatePatch: PATCH,
  });
  expect(adoptResidentActivities(world)).toBe(true);
  expect(prepareResidentRestActivities(world)).toBe(true);
  return { world, actorId, target, source, store };
}

function sight(world: WorldState, store: SettlementEcologyState, origin = { x: 0, y: 0 }) {
  return collectSettlementKeeperStoreObservations({
    world: createWorldView(world), window: { origin }, settlement: store,
    targetTick: world.meta.completedTick + 1,
  });
}

/** Real adapter arrival and complete lower-world sensory admission, not runtime autonomy proof. */
function admittedFixture(rest = false) {
  const current = nativeFixture(rest);
  for (let phase = 1; phase <= 10; phase += 1) expect(advanceResidentRestActivities(current.world, phase)).not.toBeNull();
  expect(keeperAt(current.world, current.actorId).activity?.poses.at(-1)?.position).toEqual(current.target);
  const observations = sight(current.world, current.store);
  expect(observations).toHaveLength(1);
  stepWorld(current.world, [], {
    tick: current.world.meta.completedTick + 1,
    residents: current.world.residents.map(({ id, identity }) => ({
      residentId: id, actorId: identity.stableId,
      observations: identity.stableId === current.actorId ? observations! : [],
    })),
  });
  expect(keeperAt(current.world, current.actorId).perception.beliefs.some(({ sourceObservationId }) => (
    sourceObservationId === observations![0]!.id
  ))).toBe(true);
  return { ...current, observations: observations!, response: createPorterResponseState(current.actorId, current.world.meta.completedTick) };
}

function inspect(current: ReturnType<typeof admittedFixture>, observations = current.observations, store = current.store) {
  return advanceSettlementKeeperStoreInspection({
    world: current.world, settlement: store, porterResponse: current.response, observations,
  });
}

/** Authored pose/flat-terrain optical contract fixtures; never native movement or autonomy evidence. */
function opticalFixture() {
  const current = nativeFixture();
  for (const tile of current.world.terrain.tiles) {
    tile.terrain = "meadow";
    tile.elevation = MAX_TIDE_LEVEL + 1;
  }
  const direction = current.target.localX >= 6 * WORLD_POSITION_UNITS_PER_TILE ? -1 : 1;
  const position = translateWorldPosition(current.target, direction * 4 * WORLD_POSITION_UNITS_PER_TILE, 0);
  setContractPose(current.world, current.actorId, position, direction === -1 ? 0 : FIXED_POINT / 2);
  return { ...current, direction };
}

function setContractPose(world: WorldState, actorId: string, position: WorldPosition, heading: number) {
  const keeper = keeperAt(world, actorId);
  keeper.activity = {
    ...keeper.activity!, poses: [{ position, heading }], restTask: null, rationTask: null, materialTask: null,
  };
}

describe("keeper inspection optical contract", () => {
  it("produces one source-linked fact without stock quantity or rat truth and does not mutate its inputs", () => {
    const current = opticalFixture();
    const before = stableStringify(current.world);
    const observations = sight(current.world, current.store);
    expect(observations).toHaveLength(1);
    expect(observations![0]).toMatchObject({
      observerId: current.actorId, channel: "vision", perceivedClass: "exposed-food",
      subjectId: current.store.identity.foodLotId, identification: "identified", interrupt: "none",
      area: { center: current.target, radiusUnits: 0 }, observedAtTick: current.world.meta.completedTick + 1,
    });
    expect(observations![0]).not.toHaveProperty("quantity");
    expect(stableStringify(current.world)).toBe(before);
    expect(sight(current.world, current.store)).toEqual(observations);
  });

  it.each(["facing", "range", "ridge", "dark", "remote"] as const)("withholds source detail under actual shared %s rejection", (reason) => {
    const current = opticalFixture();
    expect(sight(current.world, current.store)).toHaveLength(1);
    let origin = { x: 0, y: 0 };
    if (reason === "facing") {
      const pose = keeperAt(current.world, current.actorId).activity!.poses[0]!;
      setContractPose(current.world, current.actorId, pose.position, current.direction === -1 ? FIXED_POINT / 2 : 0);
    } else if (reason === "range") {
      const position = translateWorldPosition(current.target, current.direction * 24 * WORLD_POSITION_UNITS_PER_TILE, 0);
      setContractPose(current.world, current.actorId, position, current.direction === -1 ? 0 : FIXED_POINT / 2);
    } else if (reason === "ridge") {
      const middle = translateWorldPosition(current.target, current.direction * 2 * WORLD_POSITION_UNITS_PER_TILE, 0);
      const tile = current.world.terrain.tiles[Math.floor(middle.localY / WORLD_POSITION_UNITS_PER_TILE) * current.world.terrain.width
        + Math.floor(middle.localX / WORLD_POSITION_UNITS_PER_TILE)]!;
      tile.terrain = "ridge";
      tile.elevation = FIXED_POINT;
    } else if (reason === "dark") {
      const tick = WORLD_NIGHT_START_TICK + 120;
      current.world.meta.completedTick = tick;
      current.world.tide = tideAtTick(tick);
      current.world.weather.nextChangeTick = tick + 1_000;
      for (const resident of current.world.residents) {
        resident.perception = createActorPerceptionState(resident.identity.stableId, tick);
        resident.activity = { ...resident.activity!, tick, restTask: null, rationTask: null, materialTask: null };
      }
    } else origin = { x: 1_000, y: 1_000 };
    expect(sight(current.world, current.store, origin)).toEqual([]);
  });

  it("does not retrofit this producer into the deliberately supported v2 body protocol", () => {
    const current = opticalFixture();
    for (const resident of current.world.residents) {
      const { materialTask: _material, ...activity } = resident.activity!;
      resident.activity = { ...activity, version: RESIDENT_SERVICE_ACTIVITY_VERSION, ownerId: RESIDENT_SERVICE_ACTIVITY_OWNER_ID };
    }
    expect(sight(current.world, current.store)).toEqual([]);
  });

  it.each(["seed", "site", "keeper-home"] as const)("rejects a canonical store with the wrong %s binding", (binding) => {
    const current = admittedFixture();
    const other = current.world.residents.find(({ homeSettlementId }) => (
      homeSettlementId !== keeperAt(current.world, current.actorId).homeSettlementId
    ))!;
    const store = createSettlementEcologyState({
      rootSeed: binding === "seed" ? seedFromText("foreign physical store") : current.world.meta.rootSeed,
      settlementId: current.store.identity.settlementId,
      keeperActorId: binding === "keeper-home" ? other.identity.stableId : current.actorId,
      position: binding === "site" ? translateWorldPosition(current.target, WORLD_POSITION_UNITS_PER_TILE, 0) : current.target,
      aggregatePatch: PATCH,
    });
    expect(sight(current.world, store)).toBeNull();
    expect(inspect(current, current.observations, store)).toBeNull();
  });
});

describe("keeper inspection admitted-action boundary", () => {
  it("uses real native service motion and lower admission to secure exactly the existing store without cargo or economy changes", () => {
    const current = admittedFixture();
    expect(current.source).not.toEqual(current.target);
    expect(keeperAt(current.world, current.actorId).activity?.materialTask?.phase).toBe("arrived");
    const worldBefore = stableStringify(current.world);
    const secured = inspect(current);
    expect(secured).toMatchObject({ closure: "secured", keeperKnowledge: [{
      evidenceId: current.observations[0]!.id, source: "direct-observation", risk: "food-exposed",
      sourceActorId: current.actorId, learnedAtTick: current.world.meta.completedTick,
    }] });
    expect(secured?.lastClosureTransactionId).not.toBeNull();
    expect(secured?.carrier).toEqual(current.store.carrier);
    expect(stableStringify(current.world)).toBe(worldBefore);
    expect(inspect(current, current.observations, secured!)).toEqual(secured);
    expect(deserializeSettlementEcologyState(serializeSettlementEcologyState(secured))).toEqual(secured);
  });

  it.each(["stale", "observer", "lot", "area", "class"] as const)("rejects a %s candidate instead of laundering it as keeper evidence", (reason) => {
    const current = admittedFixture();
    const original = current.observations[0]!;
    const change: Partial<ActorObservation> = reason === "stale" ? { observedAtTick: original.observedAtTick - 1 }
      : reason === "observer" ? { observerId: current.world.residents.find(({ identity }) => identity.stableId !== current.actorId)!.identity.stableId }
      : reason === "lot" ? { subjectId: "STORE-FOOD-unrelated" }
      : reason === "area" ? { area: { center: translateWorldPosition(current.target, 1, 0), radiusUnits: 0 } }
      : { perceivedClass: "rat-sign" };
    const observation = { ...original, ...change };
    expect(inspect(current, [observation])).toBeNull();
  });

  it.each(["absent", "changed-id", "changed-confidence"] as const)("leaves an unadmitted %s candidate unchanged", (reason) => {
    const current = admittedFixture();
    let observations: readonly ActorObservation[] = current.observations;
    if (reason === "absent") keeperAt(current.world, current.actorId).perception = createActorPerceptionState(current.actorId, current.world.meta.completedTick);
    else observations = [{ ...current.observations[0]!,
      ...(reason === "changed-id" ? { id: "keeper-store-vision:unadmitted" } : { confidence: current.observations[0]!.confidence - 1 }),
    }];
    expect(inspect(current, observations)).toEqual(current.store);
    expect(inspect(current, [])).toEqual(current.store);
  });

  it.each(["wet", "away", "contract", "urgent", "duty", "resting"] as const)("retains legitimate knowledge but denies closure while %s", (reason) => {
    const current = admittedFixture(reason === "resting");
    const keeper = keeperAt(current.world, current.actorId);
    if (reason === "wet") {
      const tile = current.world.terrain.tiles[Math.floor(current.target.localY / WORLD_POSITION_UNITS_PER_TILE) * current.world.terrain.width
        + Math.floor(current.target.localX / WORLD_POSITION_UNITS_PER_TILE)]!;
      tile.elevation = current.world.tide.level - 1;
    } else if (reason === "away") setContractPose(current.world, current.actorId, translateWorldPosition(current.target, 1, 0), 0);
    else if (reason === "contract") keeper.activeContractId = current.world.contracts[0]!.id;
    else if (reason === "urgent") keeper.needs.food = 900_000;
    else if (reason === "duty") current.response = { ...current.response, intent: "secure-food", lastDecisionId: "keeper-inspection:active-duty" };
    else if (reason === "resting") {
      expect(keeper.circadian?.posture.state).toBe("resting");
      // Preserve the genuinely arrived body/posture, but remove its original
      // need pressure so this isolates awake permission from urgent priority.
      keeper.needs.rest = 100_000;
    }
    // These are controlled action-boundary counterfactuals, not demonstrations
    // that the normal runtime generated a contract/duty or changed geography.
    const informed = inspect(current);
    expect(informed?.closure).toBe("open");
    expect(informed?.keeperKnowledge).toHaveLength(1);
    expect(informed?.keeperKnowledge[0]?.source).toBe("direct-observation");
    expect(informed?.carrier).toEqual(current.store.carrier);
    expect(informed?.lastClosureTransactionId).toBeNull();
  });
});
