import { describe, expect, it } from "vitest";

import { assertWorldInvariants, createWorld, deserializeWorld, runTicks, serializeWorld, stepWorld } from "../sim/public";
import { replaceResidentActivity, type ResidentActivity } from "../sim/residentActivity";
import { canonicalResidentActivityForWorld, residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { prepareResidentTravelAdvance, revokeResidentTravelAdvance } from "../sim/residentTravelAdvance";
import { waterDepthAt } from "../sim/terrain";
import { FIXED_POINT, type WorldState } from "../sim/types";
import { surfaceCurrentDirection } from "./currentDirection";
import { ORDINARY_FOOT_MAX_WATER_DEPTH, waterContactPressure } from "./footing";
import { PLAYER_FOOT_MAX_WATER_DEPTH } from "./player";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { residentActivitiesMatchPerceptionInterval, residentActivitySaveExtensionsValid } from "./residentActivitySaveBoundary";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { worldPositionDelta, type WorldPosition } from "./worldPosition";
import { deriveWaterFlowProfile } from "./waterFlow";

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

// Native lower-world source opportunity, with explicit current-protocol adapter
// activation. This is not a fresh-runtime or player/rendering witness: the
// preceding25 civil minutes use the existing lower-world coarse authority.
function currentSourceFixture() {
  const world = createWorld("settlement keeper home night continuity", "wild");
  runTicks(world, 25);
  const actorId = "H-v1-p0p0-1d9rhmy-2-1kt45xu";
  const chosen = world.residents.find(({ identity }) => identity.stableId === actorId)!;
  const source = resolveResidentWorldPlacement(world, chosen)!.position;
  const target = residentSettlementRestTarget(world, chosen)!;
  const identity = structuredClone(chosen.identity);
  const needs = { ...chosen.needs };
  const condition = { ...chosen.condition };
  expect(chosen.id).toBe(84);
  expect(chosen.activeContractId).toBeNull();
  expect(chosen.intention).toBe("work");
  expect(world.meta.completedTick).toBe(445);
  expect(source).toMatchObject({ localX: 88_500, localY: 47_500 });
  expect(target).toMatchObject({ localX: 89_500, localY: 47_500 });
  expect(waterDepthAt(tileAt(world, source), world.tide)).toBe(41_474);
  expect(residentRestTargetHasDrySupport(world, target)).toBe(true);
  expect(adoptResidentActivities(world)).toBe(true);
  world.residents = world.residents.map((resident) => replaceResidentActivity(resident, exactProtocol(resident.activity!, 8)));
  expect(prepareResidentRestActivities(world)).toBe(true);
  const current = world.residents.find(({ identity: entry }) => entry.stableId === actorId)!;
  expect(current.identity).toEqual(identity);
  expect(current.needs).toEqual(needs);
  expect(current.condition).toEqual(condition);
  expect(current.activity!.materialTask).toMatchObject({ kind: "settlement-material", phase: "approaching", projectId: 15, resource: "medicine", target });
  expect(world.settlements.find(({ id }) => id === 4)).toMatchObject({ inventory: { medicine: 110 }, project: { progress: 0, target: 36 } });
  assertWorldInvariants(world);
  return { world, source, target, actorId };
}

function sourceResident(fixture: ReturnType<typeof currentSourceFixture>) {
  return fixture.world.residents.find(({ identity }) => identity.stableId === fixture.actorId)!;
}

function sourceCapacity(fixture: ReturnType<typeof currentSourceFixture>) {
  const resident = sourceResident(fixture);
  const skill = resident.identity.skills.find(({ kind }) => kind === "swimming")!.aptitude;
  const reserve = FIXED_POINT - Math.max(resident.needs.rest, resident.condition.exhaustion);
  return Math.floor(ORDINARY_FOOT_MAX_WATER_DEPTH * Math.floor(skill * reserve / FIXED_POINT) / FIXED_POINT);
}

function sourceAdvance(fixture: ReturnType<typeof currentSourceFixture>, from: number, to: number) {
  for (let phase = from; phase <= to; phase += 1) {
    const result = advanceResidentRestActivities(fixture.world, phase, WINDOW);
    expect(result).not.toBeNull();
    expect(result!.maximumSurfaceCells).toBeLessThanOrEqual(16 * 16);
    assertWorldInvariants(fixture.world);
  }
}

describe("current-sensitive occupied-source egress adapter", () => {
  it("uses genuine aptitude and condition to leave native flowing water for a real material service", () => {
    const fixture = currentSourceFixture();
    const { world, source } = fixture;
    const depth = waterDepthAt(tileAt(world, source), world.tide);
    const tile = tileAt(world, source);
    const flow = deriveWaterFlowProfile({ waterDepth: depth, bedRoughness: tile.roughness,
      tideLevel: world.tide.level, weatherIntensity: world.weather.intensity });
    const direction = surfaceCurrentDirection(world.tide.direction, world.weather.windY);
    expect(flow.strength).toBeGreaterThan(0);
    expect(sourceCapacity(fixture)).toBe(8_023);
    const economy = structuredClone({ settlements: world.settlements, contracts: world.contracts, ledger: world.ledger, events: world.events });
    const perception = structuredClone(sourceResident(fixture).perception);
    sourceAdvance(fixture, 1, 1);
    const actor = sourceResident(fixture);
    const movement = worldPositionDelta(source, actor.activity!.poses[1]!.position);
    expect(movement).toEqual({ x: 105, y: 0 });
    expect(waterContactPressure({ moving: true, movement, waterDepth: depth, roughness: tile.roughness,
      surface: "water", current: { x: Math.trunc(direction.x * flow.strength / FIXED_POINT),
        y: Math.trunc(direction.y * flow.strength / FIXED_POINT) } })).toBe(5_199);
    expect(actor.activity!.materialTask).toMatchObject({ phase: "approaching", usedAtTick: null });
    expect(actor.perception).toEqual(perception); // Physical legality is not an exact sounding.
    expect({ settlements: world.settlements, contracts: world.contracts, ledger: world.ledger, events: world.events }).toEqual(economy);
  });

  it.each(["cross-wind", "no-aptitude", "rest-exhausted", "physically-exhausted"] as const)("withholds the same native source displacement for %s", (cause) => {
    const fixture = currentSourceFixture();
    const { world, source } = fixture;
    // Explicit single-cause physical/capability counterfactuals, never an
    // authored task, alternate target, movement result or informed belief.
    if (cause === "cross-wind") world.weather.windY = FIXED_POINT;
    if (cause === "no-aptitude") sourceResident(fixture).identity.skills.find(({ kind }) => kind === "swimming")!.aptitude = 0;
    if (cause === "rest-exhausted") sourceResident(fixture).needs.rest = FIXED_POINT;
    if (cause === "physically-exhausted") sourceResident(fixture).condition.exhaustion = FIXED_POINT;
    const perception = structuredClone(sourceResident(fixture).perception);
    const economy = structuredClone({ settlements: world.settlements, contracts: world.contracts, ledger: world.ledger });
    expect(waterDepthAt(tileAt(world, source), world.tide)).toBe(41_474);
    sourceAdvance(fixture, 1, 4);
    expect(sourceResident(fixture).activity!.poses.every(({ position }) => JSON.stringify(position) === JSON.stringify(source))).toBe(true);
    expect(sourceResident(fixture).activity!.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route", usedAtTick: null });
    expect(sourceResident(fixture).perception).toEqual(perception);
    expect({ settlements: world.settlements, contracts: world.contracts, ledger: world.ledger }).toEqual(economy);
  });

  it.each([0, 1])("checks the independent depth ceiling at capacity plus%s without changing force policy", (extra) => {
    const fixture = currentSourceFixture();
    const { world, source } = fixture;
    // Physical foundation: smooth following contact makes pressure below
    // reserve, isolating the independent bounded-depth admission.
    const tile = tileAt(world, source);
    tile.elevation = world.tide.level - ORDINARY_FOOT_MAX_WATER_DEPTH - sourceCapacity(fixture) - extra;
    tile.roughness = 0;
    sourceAdvance(fixture, 1, 1);
    expect(sourceResident(fixture).activity!.poses[1]!.position).toEqual(extra === 0
      ? { ...source, localX: source.localX + 105 } : source);
  });

  it.each([4, 9])("retains exact current phase%s contact across cold continuation and real dry arrival", (phase) => {
    const fixture = currentSourceFixture();
    sourceAdvance(fixture, 1, phase);
    const bytes = serializeWorld(fixture.world);
    const branches = [fixture.world, structuredClone(fixture.world), deserializeWorld(bytes)];
    for (const world of branches) {
      expect(serializeWorld(world)).toBe(bytes);
      expect(residentActivitiesMatchPerceptionInterval(world.residents, 445, phase)).toBe(true);
      const branch = { ...fixture, world };
      sourceAdvance(branch, phase + 1, 10);
      closeInterval(world);
      expect(sourceResident(branch).activity!.poses[0]!.position).toEqual(fixture.target);
      expect(sourceResident(branch).activity!.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null });
    }
    expect(serializeWorld(branches[1]!)).toBe(serializeWorld(branches[0]!));
    expect(serializeWorld(branches[2]!)).toBe(serializeWorld(branches[0]!));
  });

  it("does not reinterpret retained wet-source work when reserve falls after a cold phase4", () => {
    const fixture = currentSourceFixture();
    sourceAdvance(fixture, 1, 4);
    const bytes = serializeWorld(fixture.world);
    const world = deserializeWorld(bytes);
    expect(serializeWorld(world)).toBe(bytes);
    const branch = { ...fixture, world };
    const retained = structuredClone(sourceResident(branch).activity!.poses);
    sourceResident(branch).condition.exhaustion = FIXED_POINT;
    expect(canonicalResidentActivityForWorld(world, sourceResident(branch))).not.toBeNull();
    sourceAdvance(branch, 5, 5);
    expect(sourceResident(branch).activity!.poses.slice(0, 5)).toEqual(retained);
    expect(sourceResident(branch).activity!.poses[5]).toEqual(retained[4]);
    expect(sourceResident(branch).activity!.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
  });
});
