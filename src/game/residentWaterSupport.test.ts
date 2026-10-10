import { describe, expect, it } from "vitest";

import { assertWorldInvariants, createWorld, createWorldView, deserializeWorld, runTicks, serializeWorld, stepWorld } from "../sim/public";
import { replaceResidentActivity } from "../sim/residentActivity";
import { canonicalResidentActivityForWorld, residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { prepareResidentTravelAdvance, revokeResidentTravelAdvance } from "../sim/residentTravelAdvance";
import { waterDepthAt } from "../sim/terrain";
import { FIXED_POINT } from "../sim/types";
import { stableStringify } from "../sim/util";
import { surfaceCurrentDirection } from "./currentDirection";
import { fixtureSupportMitigation, ORDINARY_FOOT_MAX_WATER_DEPTH, waterContactPressure } from "./footing";
import { wayknotContextAt } from "./player";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { deriveWaterFlowProfile } from "./waterFlow";
import { createWayknotState, normalizeWayknotState, placeWayknot, queryWayknotEffects, reclaimWayknot, wayknotFootingSupport, type WayknotState } from "./wayknots";
import { worldPositionDelta } from "./worldPosition";

const SEED = "settlement keeper home night continuity";
const ACTOR = "H-v1-p0p0-1d9rhmy-2-1kt45xu";
const WINDOW = { origin: { x: -10, y: -10 }, terrain: { width: 120, height: 120 } };
const BASE = createWorld(SEED, "wild");
runTicks(BASE, 25);
const PLACEMENT_BASE = createWorld(SEED, "wild");
runTicks(PLACEMENT_BASE, 22);

// FOUNDATION ONLY: generated cause, identity, source and real selected service;
// explicit lower-owner v8 activation, arranged lawful kernel placement and one
// wind counterfactual. Ordinary player cannot reach this site before445.
function fixture(unsafe = true) {
  const world = structuredClone(BASE);
  const chosen = world.residents.find(({ identity }) => identity.stableId === ACTOR)!;
  const source = resolveResidentWorldPlacement(world, chosen)!.position;
  const target = residentSettlementRestTarget(world, chosen)!;
  expect(chosen).toMatchObject({ id: 84, activeContractId: null, intention: "work" });
  expect(source).toMatchObject({ localX: 88_500, localY: 47_500 });
  expect(target).toMatchObject({ localX: 89_500, localY: 47_500 });
  expect(residentRestTargetHasDrySupport(world, target)).toBe(true);
  expect(adoptResidentActivities(world)).toBe(true);
  world.residents = world.residents.map((resident) => {
    const activity = resident.activity!;
    expect([activity.rationTask, activity.materialTask, activity.inspectionTask, activity.pickupTask, activity.travelTask]
      .every((task) => task == null)).toBe(true);
    return replaceResidentActivity(resident, {
      ...activity, version: 8, ownerId: "sim:resident-activity:v8",
      rationTask: null, materialTask: null, inspectionTask: null, pickupTask: null, travelTask: null,
    });
  });
  expect(prepareResidentRestActivities(world)).toBe(true);
  const resident = () => world.residents.find(({ identity }) => identity.stableId === ACTOR)!;
  expect(resident().activity!.materialTask).toMatchObject({ kind: "settlement-material", phase: "approaching", projectId: 15, resource: "medicine", target });
  const skill = resident().identity.skills.find(({ kind }) => kind === "swimming")!.aptitude;
  const reserve = FIXED_POINT - Math.max(resident().needs.rest, resident().condition.exhaustion);
  const capacity = Math.floor(ORDINARY_FOOT_MAX_WATER_DEPTH * Math.floor(skill * reserve / FIXED_POINT) / FIXED_POINT);
  expect(capacity).toBe(8_023);
  const tile = world.terrain.tiles[47 * world.terrain.width + 88]!;
  const depth = waterDepthAt(tile, world.tide);
  expect(depth).toBe(41_474);
  const flow = deriveWaterFlowProfile({ waterDepth: depth, bedRoughness: tile.roughness,
    tideLevel: world.tide.level, weatherIntensity: world.weather.intensity });
  const pressureAt = (windY: number) => {
    const direction = surfaceCurrentDirection(world.tide.direction, windY);
    return waterContactPressure({ moving: true, movement: { x: 105, y: 0 }, waterDepth: depth,
      roughness: tile.roughness, surface: "water", current: {
        x: Math.trunc(direction.x * flow.strength / FIXED_POINT),
        y: Math.trunc(direction.y * flow.strength / FIXED_POINT),
      } });
  };
  if (unsafe) {
    // Find the first integer transverse wind whose unchanged local contact
    // exceeds reserve. This bounded search changes no task, body or outcome.
    let low = 0;
    let high = FIXED_POINT;
    expect(pressureAt(low)).toBeLessThanOrEqual(capacity);
    expect(pressureAt(high)).toBeGreaterThan(capacity);
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (pressureAt(middle) > capacity) high = middle;
      else low = middle + 1;
    }
    world.weather.windY = low;
    expect(low).toBe(433_430);
    expect(pressureAt(low)).toBeGreaterThan(capacity);
    expect(pressureAt(low - 1)).toBeLessThanOrEqual(capacity);
  }
  assertWorldInvariants(world);
  return { world, source, target, resident, capacity, pressure: pressureAt(world.weather.windY) };
}

function anchor(setting = false): WayknotState {
  const world = setting ? BASE : PLACEMENT_BASE;
  const context = wayknotContextAt(createWorldView(world), 45 * world.terrain.width + 88)!;
  expect(context.occupied).toBe(false);
  expect(context.terrain === "deep-water" || context.waterDepth >= 120_000).toBe(true);
  const placed = placeWayknot(createWayknotState(), "tide-anchor", context, world.meta.completedTick);
  expect(placed.ok).toBe(true);
  expect(placed.wayknot).toMatchObject({ id: 3, condition: 920_000, readyTick: setting ? 448 : 445 });
  return placed.state;
}

function piece(state: WayknotState, id = 3) { return state.wayknots.find((entry) => entry.id === id)!; }

function advance(f: ReturnType<typeof fixture>, phase: number, state: WayknotState): WayknotState {
  const result = advanceResidentRestActivities(f.world, phase, WINDOW, state);
  expect(result).not.toBeNull();
  expect(result!.maximumSurfaceCells).toBeLessThanOrEqual(16 * 16);
  expect(result!.wayknots).toBeDefined();
  assertWorldInvariants(f.world);
  return result!.wayknots!;
}

function close(world: ReturnType<typeof createWorld>) {
  const admission = prepareResidentTravelAdvance(world, WINDOW);
  expect(admission).not.toBeNull();
  try { stepWorld(world, [], undefined, undefined, admission!); }
  finally { revokeResidentTravelAdvance(admission!); }
  assertWorldInvariants(world);
}

describe("sourced resident water-support foundations", () => {
  it("retains the same physical wait when the caller supplies no aid root", () => {
    const f = fixture();
    const result = advanceResidentRestActivities(f.world, 1, WINDOW);
    expect(result).not.toBeNull();
    expect(result!.wayknots).toBeUndefined();
    expect(f.resident().activity!.poses[1]!.position).toEqual(f.source);
    expect(f.resident().activity!.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    assertWorldInvariants(f.world);
  });

  it.each([false, true])("changes real service waiting to motion with setting=%s and no premature stock use", (setting) => {
    const f = fixture();
    const state = anchor(setting);
    const effects = queryWayknotEffects(state, { tileIndex: 47 * f.world.terrain.width + 88,
      terrain: f.world.terrain.tiles[47 * f.world.terrain.width + 88]!.terrain,
      waterDepth: 41_474, windExposed: false }, f.world.terrain, 445);
    expect(effects.influences).toMatchObject([{ id: 3, kind: "tide-anchor", distance: 2 }]);
    expect(Math.trunc(f.pressure * (FIXED_POINT - fixtureSupportMitigation(wayknotFootingSupport(effects))) / FIXED_POINT))
      .toBeLessThanOrEqual(f.capacity);
    const bare = fixture();
    const carried = createWayknotState();
    expect(advance(bare, 1, carried)).toBe(carried);
    expect(bare.resident().activity!.poses[1]!.position).toEqual(bare.source);
    expect(bare.resident().activity!.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    const roots = stableStringify({ settlements: f.world.settlements, contracts: f.world.contracts, ledger: f.world.ledger, events: f.world.events });
    const knowledge = structuredClone(f.resident().perception);
    const input = stableStringify(state);
    const result = advance(f, 1, state);
    expect(worldPositionDelta(f.source, f.resident().activity!.poses[1]!.position)).toEqual({ x: 105, y: 0 });
    expect(piece(result).condition).toBe(920_000 - (setting ? 840 : 1_680));
    expect(piece(result).serviceWearRemainder).toBe(0);
    expect(stableStringify(state)).toBe(input);
    expect(f.resident().perception).toEqual(knowledge);
    expect(stableStringify({ settlements: f.world.settlements, contracts: f.world.contracts, ledger: f.world.ledger, events: f.world.events })).toBe(roots);
    expect(f.resident().activity!.materialTask).toMatchObject({ phase: "approaching", usedAtTick: null });
  });

  it.each(["carried", "broken", "foreign", "out-of-range"] as const)("withholds support without spending the %s cause", (cause) => {
    const f = fixture();
    let state = anchor();
    if (cause === "carried") state = reclaimWayknot(state, 3).state;
    else state = normalizeWayknotState({ ...state, wayknots: state.wayknots.map((entry) => entry.id !== 3 ? entry : {
      ...entry, ...(cause === "broken" ? { condition: 0 } : cause === "foreign" ? { region: { x: 1, y: 0 } }
        : { tileIndex: 44 * f.world.terrain.width + 88 }),
    }) });
    const input = stableStringify(state);
    expect(advance(f, 1, state)).toBe(state);
    expect(f.resident().activity!.poses[1]!.position).toEqual(f.source);
    expect(f.resident().activity!.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    expect(stableStringify(state)).toBe(input);
  });

  it("does not spend support for already bare-safe new work", () => {
    const f = fixture(false);
    const state = anchor();
    expect(f.pressure).toBeLessThanOrEqual(f.capacity);
    expect(advance(f, 1, state)).toBe(state);
    expect(worldPositionDelta(f.source, f.resident().activity!.poses[1]!.position)).toEqual({ x: 105, y: 0 });
  });

  it("uses the broken successor on the next contact without rewriting the helped prefix", () => {
    const f = fixture();
    const placed = anchor();
    // Explicit nearly-spent physical condition, not new stock or a new aid.
    const state = normalizeWayknotState({ ...placed, wayknots: placed.wayknots.map((entry) => entry.id !== 3
      ? entry : { ...entry, condition: 1 }) });
    const broken = advance(f, 1, state);
    expect(piece(broken).condition).toBe(0);
    const retained = structuredClone(f.resident().activity!.poses);
    expect(advance(f, 2, broken)).toBe(broken);
    expect(f.resident().activity!.poses.slice(0, 2)).toEqual(retained);
    expect(f.resident().activity!.poses[2]).toEqual(retained[1]);
    expect(f.resident().activity!.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    expect(piece(state).condition).toBe(1);
  });

  it.each([false, true])("prices only105×4+80 source units, with setup applied once (%s)", (setting) => {
    const f = fixture();
    let state = anchor(setting);
    for (let phase = 1; phase <= 10; phase += 1) {
      state = advance(f, phase, state);
      const work = Math.min(500, phase * 105);
      expect(piece(state).condition).toBe(920_000 - work * (setting ? 8 : 16));
      expect(piece(state).serviceWearRemainder).toBe(0);
    }
    expect(f.resident().activity!.poses[5]!.position.localX).toBe(89_025);
    expect(f.resident().activity!.poses[10]!.position).toEqual(f.target);
    expect(f.resident().activity!.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null });
  });

  it.each([4, 9])("preserves complete world+aid phase%s cold work and closing authority", (phase) => {
    const f = fixture();
    // Retained fractional wear foundation; new integer source-work services
    // must preserve it, not manufacture an old assistance history.
    const placed = anchor();
    let state = normalizeWayknotState({ ...placed, wayknots: placed.wayknots.map((entry) => entry.id !== 3
      ? entry : { ...entry, serviceWearRemainder: 123_456 }) });
    for (let step = 1; step <= phase; step += 1) state = advance(f, step, state);
    const bytes = serializeWorld(f.world);
    const aidBytes = stableStringify(state);
    const branches = [{ world: f.world, state }, { world: structuredClone(f.world), state: structuredClone(state) },
      { world: deserializeWorld(bytes), state: normalizeWayknotState(JSON.parse(aidBytes)) }];
    for (const branch of branches) {
      expect(serializeWorld(branch.world)).toBe(bytes);
      expect(stableStringify(branch.state)).toBe(aidBytes);
      const cut = { ...f, world: branch.world, resident: () => branch.world.residents.find(({ identity }) => identity.stableId === ACTOR)! };
      for (let step = phase + 1; step <= 10; step += 1) branch.state = advance(cut, step, branch.state);
      close(branch.world);
      expect(cut.resident().activity!.poses[0]!.position).toEqual(f.target);
      expect(cut.resident().activity!.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null });
      expect(piece(branch.state).condition).toBe(912_000);
      expect(piece(branch.state).serviceWearRemainder).toBe(123_456);
    }
    for (const branch of branches.slice(1)) {
      expect(serializeWorld(branch.world)).toBe(serializeWorld(branches[0]!.world));
      expect(stableStringify(branch.state)).toBe(stableStringify(branches[0]!.state));
    }
  });

  it("retains consumed prefixes after cold reclaim, without stale support or replayed wear", () => {
    const f = fixture();
    let state = anchor();
    for (let phase = 1; phase <= 4; phase += 1) state = advance(f, phase, state);
    const world = deserializeWorld(serializeWorld(f.world));
    const retained = structuredClone(world.residents.find(({ identity }) => identity.stableId === ACTOR)!.activity!.poses);
    const reclaimed = reclaimWayknot(state, 3);
    expect(reclaimed.ok).toBe(true);
    const cut = { ...f, world, resident: () => world.residents.find(({ identity }) => identity.stableId === ACTOR)! };
    expect(canonicalResidentActivityForWorld(world, cut.resident())).not.toBeNull();
    expect(advance(cut, 5, reclaimed.state)).toBe(reclaimed.state);
    expect(cut.resident().activity!.poses.slice(0, 5)).toEqual(retained);
    expect(cut.resident().activity!.poses[5]).toEqual(retained[4]);
    expect(cut.resident().activity!.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
  });

  it("cannot replace the independent capability/depth ceiling with fixture support", () => {
    const f = fixture();
    let state = anchor();
    for (let phase = 1; phase <= 4; phase += 1) state = advance(f, phase, state);
    const retained = structuredClone(f.resident().activity!.poses);
    f.resident().condition.exhaustion = FIXED_POINT;
    expect(canonicalResidentActivityForWorld(f.world, f.resident())).not.toBeNull();
    expect(advance(f, 5, state)).toBe(state);
    expect(f.resident().activity!.poses.slice(0, 5)).toEqual(retained);
    expect(f.resident().activity!.poses[5]).toEqual(retained[4]);
    expect(f.resident().activity!.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
  });

  it("publishes no earlier aided work or input-aid change when a later body fails validation", () => {
    const f = fixture();
    const state = anchor();
    const later = f.world.residents.at(-1)!;
    expect(f.world.residents.indexOf(f.resident())).toBeLessThan(f.world.residents.length - 1);
    later.activity = { ...later.activity!, tick: 446 };
    const worldBytes = stableStringify(f.world);
    const aidBytes = stableStringify(state);
    const roster = f.world.residents;
    expect(advanceResidentRestActivities(f.world, 1, WINDOW, state)).toBeNull();
    expect(f.world.residents).toBe(roster);
    expect(stableStringify(f.world)).toBe(worldBytes);
    expect(stableStringify(state)).toBe(aidBytes);
  });

  it.each([false, true])("uses one strongest/lowest-ID cause independent of aid input order (tie=%s)", (tie) => {
    const outcomes: string[] = [];
    for (const reverse of [false, true]) {
      const f = fixture();
      const first = anchor();
      // Explicit synthetic aid-address foundation only. This proves overlap
      // arbitration, not placement at these two sites in the native world.
      let state = normalizeWayknotState({ ...first, wayknots: first.wayknots.map((entry) => entry.id !== 4 ? entry : {
        ...entry, region: { x: 0, y: 0 }, tileIndex: (tie ? 49 : 46) * f.world.terrain.width + 88,
        readyTick: tie ? 445 : 448,
      }) });
      if (reverse) state = { ...state, wayknots: [...state.wayknots].reverse() };
      const before3 = piece(state).condition;
      const before4 = piece(state, 4).condition;
      const result = advance(f, 1, state);
      expect(piece(result).condition).toBe(before3 - (tie ? 1_680 : 0));
      expect(piece(result, 4).condition).toBe(before4 - (tie ? 0 : 840));
      expect(worldPositionDelta(f.source, f.resident().activity!.poses[1]!.position)).toEqual({ x: 105, y: 0 });
      outcomes.push(stableStringify({ world: f.world, aids: [...result.wayknots].sort((left, right) => left.id - right.id) }));
    }
    expect(outcomes[1]).toBe(outcomes[0]);
  });
});
