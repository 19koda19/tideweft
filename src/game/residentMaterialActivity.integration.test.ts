import { describe, expect, it } from "vitest";

import {
  assertWorldInvariants,
  createWorld,
  createWorldView,
  deserializeWorld,
  serializeWorld,
  stepWorld,
  type ResidentState,
  type ResourceKind,
  type SettlementState,
  type WorldState,
} from "../sim/public";
import {
  RESIDENT_CIVIC_ACTIVITY_OWNER_ID,
  RESIDENT_CIVIC_ACTIVITY_VERSION,
  RESIDENT_REST_APPROACH_STEP_UNITS,
} from "../sim/residentActivity";
import {
  residentRestTargetHasDrySupport,
  residentSettlementRationTarget,
} from "../sim/residentActivityWorld";
import { selectResidentMaterialUser } from "../sim/residentMaterialUse";
import { prepareResidentRationUse } from "../sim/residentRationUse";
import { tideAtTick } from "../sim/terrain";
import {
  adoptResidentActivities,
  advanceResidentRestActivities,
  prepareResidentRestActivities,
  type ResidentActivityDuty,
} from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createPlayer } from "./player";
import { projectGameView, projectPerception, projectResidentWorldPosition } from "./projection";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import { WORLD_POSITION_UNITS_PER_TILE, worldPositionDelta } from "./worldPosition";

// Production adapter/sim evidence, not outer-session, rendered normal play or
// fabricated construction labor. Native geometry and identity remain intact;
// controlled needs, finite supply and schedules cause actual task selection,
// motion, arrival and use. No successful task, receipt or pose is assigned.
const BASE = createWorld("resident activity executable rest approach", "standard");

function residentAt(world: WorldState, actorId: string): ResidentState {
  const resident = world.residents.find(({ identity }) => identity.stableId === actorId);
  if (resident === undefined) throw new Error("material fixture lost its native resident");
  return resident;
}

function settlementAt(world: WorldState, id: number): SettlementState {
  const settlement = world.settlements.find((candidate) => candidate.id === id);
  if (settlement === undefined) throw new Error("material fixture lost its native settlement");
  return settlement;
}

/** Fixture supply control, not a claim of player acquisition or new production. */
function setControlledSupply(world: WorldState, settlement: SettlementState, resource: ResourceKind, stock: number) {
  world.ledger.initial[resource] += stock - settlement.inventory[resource];
  settlement.inventory[resource] = stock;
}

function materialFixture(stock = 4, workers = 1, remaining?: number) {
  const world = structuredClone(BASE);
  const startTick = world.meta.completedTick;
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: startTick + 1_000 };
  for (const resident of world.residents) {
    // Unrelated people genuinely prefer urgent rest, not fake active duties.
    resident.needs = { food: 100_000, rest: 900_000, belonging: 100_000 };
    resident.condition.exhaustion = 900_000;
  }
  for (const settlement of world.settlements) {
    for (const recipe of settlement.recipes) recipe.nextRunTick = startTick + 1_000;
  }
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = startTick + 1_000;
    contract.dueTick = startTick + 2_000;
  }
  const nativeCandidates = world.residents.filter((resident) => {
    const source = resolveResidentWorldPlacement(world, resident)?.position;
    const target = residentSettlementRationTarget(world, resident);
    if (source === undefined || target === null || resident.location.kind !== "settlement"
      || !residentRestTargetHasDrySupport(world, source)
      || !residentRestTargetHasDrySupport(world, target)) return false;
    // The positive witness keeps the real site dry through three hourly pulses.
    for (let offset = 1; offset <= 180; offset += 1) {
      if (!residentRestTargetHasDrySupport({ ...world, tide: tideAtTick(startTick + offset) }, target)) return false;
    }
    return true;
  });
  const chosen = nativeCandidates.find((resident) => {
    const source = resolveResidentWorldPlacement(world, resident)!.position;
    const target = residentSettlementRationTarget(world, resident)!;
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === WORLD_POSITION_UNITS_PER_TILE
      && nativeCandidates.filter((candidate) => candidate.location.kind === "settlement"
        && resident.location.kind === "settlement"
        && candidate.location.settlementId === resident.location.settlementId).length >= workers;
  });
  if (chosen === undefined || chosen.location.kind !== "settlement") {
    throw new Error("material fixture needs native dry workers and a genuine one-tile approach");
  }
  const settlementId = chosen.location.settlementId;
  const selected = [chosen, ...nativeCandidates.filter((resident) => resident.id !== chosen.id
    && resident.location.kind === "settlement" && resident.location.settlementId === settlementId)]
    .slice(0, workers);
  for (const resident of selected) {
    expect(resident.intention).toBe("work");
    resident.needs = { food: 100_000, rest: 100_000, belonging: 400_000 };
    resident.condition.exhaustion = 100_000;
  }
  const settlement = settlementAt(world, settlementId);
  const resource = settlement.project.resource;
  if (resource === "food" || resource === "freshWater") throw new Error("material fixture needs a native non-ration project");
  setControlledSupply(world, settlement, resource, stock);
  if (remaining !== undefined) settlement.project.progress = settlement.project.target - remaining;
  const actorId = chosen.identity.stableId;
  const workerIds = selected.map(({ identity }) => identity.stableId).sort();
  const source = resolveResidentWorldPlacement(world, chosen)!.position;
  const target = residentSettlementRationTarget(world, chosen)!;
  assertWorldInvariants(world);
  expect(adoptResidentActivities(world)).toBe(true);
  expect(prepareResidentRestActivities(world)).toBe(true);
  expect(world.residents.every(({ activity }) => activity?.version === RESIDENT_CIVIC_ACTIVITY_VERSION
    && activity.ownerId === RESIDENT_CIVIC_ACTIVITY_OWNER_ID)).toBe(true);
  for (const id of workerIds) {
    const activity = residentAt(world, id).activity!;
    expect(activity.materialTask).toMatchObject({
      kind: "settlement-material", settlementId, projectId: settlement.project.id,
      resource, target, phase: stock === 0 ? "waiting" : "approaching", usedAtTick: null,
    });
    expect(activity.restTask).toBeNull();
    expect(activity.rationTask).toBeNull();
  }
  return { world, actorId, workerIds, settlementId, resource, source, target, startTick, pulseTick: startTick + 60 };
}

function accounting(world: WorldState) {
  return structuredClone({
    settlements: world.settlements.map(({ id, inventory, project }) => ({ id, inventory, project })),
    ledger: world.ledger,
  });
}

/** Explicit declared duty inputs here; genuine keeper authentication is runtime-owned. */
function dutiesFor(actorIds: readonly string[]): ResidentActivityDuty[] {
  return actorIds.map((actorId) => ({
    actorId, duty: { kind: "active-duty", referenceId: "test:material-service-interruption" },
  }));
}

function finishInterval(world: WorldState, fromPhase = 1, active: readonly string[] = []) {
  for (let phase = fromPhase; phase <= 10; phase += 1) {
    const result = advanceResidentRestActivities(world, phase);
    expect(result).not.toBeNull();
    expect(result?.maximumSurfaceCells).toBeLessThanOrEqual(16 * 16);
  }
  const activeIds = new Set(active);
  const admission = (world.meta.completedTick + 1) % 60 === 0 ? prepareResidentRationUse(world,
    world.residents.map(({ identity }) => ({
      actorId: identity.stableId,
      duty: activeIds.has(identity.stableId)
        ? { kind: "active-duty" as const, referenceId: "test:material-service-interruption" } : null,
    }))) : undefined;
  if (admission === null) throw new Error("material use lost its actual closing service admission");
  stepWorld(world, [], undefined, admission);
  return admission;
}

function advanceTo(world: WorldState, tick: number, active: readonly string[] = []) {
  while (world.meta.completedTick < tick) {
    expect(prepareResidentRestActivities(world, dutiesFor(active))).toBe(true);
    finishInterval(world, 1, active);
  }
  expect(world.meta.completedTick).toBe(tick);
}

function expectSameWorld(actual: WorldState, expected: WorldState) {
  assertWorldInvariants(actual);
  assertWorldInvariants(expected);
  expect(actual).toEqual(expected);
  expect(actual.events).toEqual(expected.events);
  expect(serializeWorld(actual)).toBe(serializeWorld(expected));
}

describe("resident material approach and finite hourly service", () => {
  it("shows only committed material use inside detail sight without exposing the planned task or hidden target", () => {
    const { world, actorId, target, pulseTick } = materialFixture();
    advanceTo(world, pulseTick - 1);
    const player = createPlayer(createWorldView(world));
    // Projection-only camera control, not actor relocation, player travel or
    // assigned work. The real material task/use comes from the adapter above.
    player.x = target.localX;
    player.y = target.localY;
    const render = () => {
      const view = createWorldView(world);
      const current = view.residents.find(({ identity }) => identity.stableId === actorId)!;
      const perception = projectPerception(view, player);
      const scene = projectGameView(view, player, { selectedResidentId: current.id, perception });
      const ui = projectUIView(view, player, createSessionState(view.seedText), {
        selectedResidentId: current.id, perception,
      });
      return { view, current, perception, scene, ui, porter: scene.porters.find(({ actorId: id }) => id === actorId) };
    };
    const arrivedBytes = serializeWorld(world);
    const arrived = render();
    expect(arrived.current.activity?.materialTask?.phase).toBe("arrived");
    expect(arrived.porter).not.toBeUndefined();
    expect(arrived.porter?.quickLabel).not.toContain("tending");
    expect(arrived.ui.selectedResident?.observed.find(({ label }) => label === "Behavior")?.value).not.toContain("project");
    expect(serializeWorld(world)).toBe(arrivedBytes);
    finishInterval(world);
    const usedBytes = serializeWorld(world);
    const used = render();
    expect(used.current.activity?.materialTask).toMatchObject({ phase: "used", usedAtTick: pulseTick });
    expect(used.porter?.quickLabel).toBe("Unknown resident · tending the project");
    expect(used.ui.selectedResident?.observed).toContainEqual({ label: "Behavior", value: "Tending the project here" });
    expect(used.scene.acousticText).toEqual([]);
    expect(JSON.stringify({ quickLabel: used.porter?.quickLabel, observed: used.ui.selectedResident?.observed }))
      .not.toMatch(/need:|100000|400000|settlement-material|materialTask|projectId|settlementId|selectedAtTick|localX|localY/u);
    expect(serializeWorld(world)).toBe(usedBytes);
    player.x = (world.terrain.width - 0.5) * WORLD_POSITION_UNITS_PER_TILE;
    player.y = (world.terrain.height - 0.5) * WORLD_POSITION_UNITS_PER_TILE;
    const hidden = render();
    const point = projectResidentWorldPosition(hidden.view, hidden.current, WORLD_POSITION_UNITS_PER_TILE)!;
    expect(hidden.perception.detailVisibilityGrades[point.tileIndex]).toBe(0);
    expect(hidden.porter).toBeUndefined();
    expect(hidden.ui.selectedResident).toBeUndefined();
    expect(serializeWorld(world)).toBe(usedBytes);
  });

  it("autonomously approaches without fine-step accounting, then commits one unit instead of timer plus action", () => {
    const { world, actorId, settlementId, resource, source, target, pulseTick } = materialFixture();
    const initialAccounting = accounting(world);
    let previous = source;
    for (let phase = 1; phase <= 10; phase += 1) {
      expect(advanceResidentRestActivities(world, phase)).not.toBeNull();
      const position = residentAt(world, actorId).activity!.poses.at(-1)!.position;
      const delta = worldPositionDelta(previous, position);
      expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(RESIDENT_REST_APPROACH_STEP_UNITS);
      if (phase === 1) expect(position).not.toEqual(source);
      previous = position;
      expect(accounting(world)).toEqual(initialAccounting);
    }
    expect(previous).toEqual(target);
    expect(residentAt(world, actorId).activity?.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null });
    expect(residentAt(world, actorId).circadian?.posture.state).toBe("awake");
    stepWorld(world);
    advanceTo(world, pulseTick - 1);
    expect(accounting(world)).toEqual(initialAccounting);
    for (let phase = 1; phase <= 10; phase += 1) expect(advanceResidentRestActivities(world, phase)).not.toBeNull();
    // The same genuinely arrived cohort without custody admission earns nothing;
    // current bodies cannot fall back to the obsolete automatic timer credit.
    const unadmitted = deserializeWorld(serializeWorld(world));
    stepWorld(unadmitted);
    expect(accounting(unadmitted)).toEqual(initialAccounting);
    const admission = prepareResidentRationUse(world, world.residents.map(({ identity }) => ({ actorId: identity.stableId, duty: null })));
    if (admission === null) throw new Error("real arrived material cohort lacked admission");
    stepWorld(world, [], undefined, admission);
    const settlement = settlementAt(world, settlementId);
    expect(settlement.inventory[resource]).toBe(3);
    expect(settlement.project.progress).toBe(1);
    expect(world.ledger.consumed[resource] - initialAccounting.ledger.consumed[resource]).toBe(1);
    expect(residentAt(world, actorId).activity?.materialTask).toMatchObject({ phase: "used", usedAtTick: pulseTick });
    const bytes = serializeWorld(world);
    expect(() => stepWorld(world, [], undefined, admission)).toThrow(/stale|foreign|already consumed/u);
    expect(serializeWorld(world)).toBe(bytes);
    assertWorldInvariants(world);
  });

  it("waits for finite stock without losing request age, then genuinely approaches after controlled refill", () => {
    const { world, actorId, settlementId, resource, source, startTick, pulseTick } = materialFixture(0);
    const initialAccounting = accounting(world);
    advanceTo(world, pulseTick);
    expect(residentAt(world, actorId).activity?.poses.at(-1)?.position).toEqual(source);
    expect(residentAt(world, actorId).activity?.materialTask).toMatchObject({
      phase: "waiting", waitReason: "no-material", selectedAtTick: startTick, usedAtTick: null,
    });
    expect(accounting(world)).toEqual(initialAccounting);
    setControlledSupply(world, settlementAt(world, settlementId), resource, 1);
    advanceTo(world, pulseTick + 60);
    expect(residentAt(world, actorId).activity?.materialTask).toMatchObject({
      phase: "used", usedAtTick: pulseTick + 60, selectedAtTick: startTick,
    });
    expect(settlementAt(world, settlementId).inventory[resource]).toBe(0);
    expect(settlementAt(world, settlementId).project.progress).toBe(1);
    expect(world.ledger.consumed[resource] - initialAccounting.ledger.consumed[resource]).toBe(1);
    assertWorldInvariants(world);
  });

  it("does not consume a removed source or award automatic progress despite genuine prior arrival", () => {
    const { world, actorId, settlementId, resource, pulseTick } = materialFixture();
    advanceTo(world, pulseTick - 1);
    expect(residentAt(world, actorId).activity?.materialTask?.phase).toBe("arrived");
    const available = deserializeWorld(serializeWorld(world));
    setControlledSupply(world, settlementAt(world, settlementId), resource, 0);
    const consumed = world.ledger.consumed[resource];
    advanceTo(world, pulseTick);
    advanceTo(available, pulseTick);
    expect(settlementAt(world, settlementId).project.progress).toBe(0);
    expect(world.ledger.consumed[resource]).toBe(consumed);
    expect(residentAt(world, actorId).activity?.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-material", usedAtTick: null });
    expect(settlementAt(available, settlementId).project.progress).toBe(1);
    expect(residentAt(available, actorId).activity?.materialTask?.phase).toBe("used");
    assertWorldInvariants(world);
    assertWorldInvariants(available);
  });

  it.each(["food", "rest", "belonging"] as const)("revokes real arrived work for urgent %s before the pulse", (need) => {
    const { world, actorId, settlementId, resource, pulseTick } = materialFixture();
    advanceTo(world, pulseTick - 1);
    expect(residentAt(world, actorId).activity?.materialTask?.phase).toBe("arrived");
    residentAt(world, actorId).needs[need] = 900_000;
    const consumed = world.ledger.consumed[resource];
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(residentAt(world, actorId).activity?.materialTask).toBeNull();
    if (need === "food") expect(residentAt(world, actorId).activity?.rationTask).not.toBeNull();
    if (need === "rest") expect(residentAt(world, actorId).activity?.restTask).not.toBeNull();
    finishInterval(world);
    expect(settlementAt(world, settlementId).project.progress).toBe(0);
    expect(world.ledger.consumed[resource]).toBe(consumed);
    assertWorldInvariants(world);
  });

  it("respects declared higher-owner duty both in reassessment and at closing use", () => {
    const { world, actorId, settlementId, resource, pulseTick } = materialFixture();
    advanceTo(world, pulseTick - 1);
    expect(residentAt(world, actorId).activity?.materialTask?.phase).toBe("arrived");
    const consumed = world.ledger.consumed[resource];
    const closingOnly = deserializeWorld(serializeWorld(world));
    finishInterval(closingOnly, 1, [actorId]);
    expect(settlementAt(closingOnly, settlementId).project.progress).toBe(0);
    expect(closingOnly.ledger.consumed[resource]).toBe(consumed);
    expect(prepareResidentRestActivities(world, dutiesFor([actorId]))).toBe(true);
    expect(residentAt(world, actorId).activity?.materialTask).toBeNull();
    finishInterval(world, 1, [actorId]);
    expect(settlementAt(world, settlementId).project.progress).toBe(0);
    expect(world.ledger.consumed[resource]).toBe(consumed);
    assertWorldInvariants(world);
    assertWorldInvariants(closingOnly);
  });

  it("rechecks new hourly hunger and intention before material use rather than trusting the prior work plan", () => {
    const { world, actorId, settlementId, resource, pulseTick } = materialFixture();
    advanceTo(world, pulseTick - 1);
    residentAt(world, actorId).needs.food = 740_000;
    expect(residentAt(world, actorId).intention).toBe("work");
    expect(prepareResidentRestActivities(world)).toBe(true);
    expect(residentAt(world, actorId).activity?.materialTask?.phase).toBe("arrived");
    const consumed = world.ledger.consumed[resource];
    finishInterval(world);
    expect(residentAt(world, actorId).needs.food).toBe(774_000);
    expect(residentAt(world, actorId).intention).toBe("eat");
    expect(residentAt(world, actorId).activity?.materialTask?.usedAtTick).toBeNull();
    expect(settlementAt(world, settlementId).project.progress).toBe(0);
    expect(world.ledger.consumed[resource]).toBe(consumed);
    assertWorldInvariants(world);
  });

  it("waits at an explicitly high-tide blocked site without fabricating arrival, then retries on native support", () => {
    const { world, actorId, settlementId, resource, source, target, pulseTick } = materialFixture();
    const consumed = world.ledger.consumed[resource];
    // Negative environmental control only, not a naturally occurring tide or
    // changed terrain fixture. Each real fine step sees the wet service site.
    while (world.meta.completedTick < pulseTick) {
      world.tide = { ...tideAtTick(world.meta.completedTick), level: 1_000_000 };
      expect(residentRestTargetHasDrySupport(world, target)).toBe(false);
      expect(prepareResidentRestActivities(world)).toBe(true);
      finishInterval(world);
    }
    expect(residentAt(world, actorId).activity?.poses.at(-1)?.position).toEqual(source);
    expect(residentAt(world, actorId).activity?.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route", usedAtTick: null });
    expect(settlementAt(world, settlementId).project.progress).toBe(0);
    expect(world.ledger.consumed[resource]).toBe(consumed);
    advanceTo(world, pulseTick + 60);
    expect(residentAt(world, actorId).activity?.materialTask?.phase).toBe("used");
    expect(settlementAt(world, settlementId).project.progress).toBe(1);
    assertWorldInvariants(world);
  });

  it.each([4, 9])("continues actual phase %i motion/pending use through exact cold save without replay", (phase) => {
    const { world, actorId, source, pulseTick } = materialFixture();
    if (phase === 9) advanceTo(world, pulseTick - 1);
    for (let current = 1; current <= phase; current += 1) expect(advanceResidentRestActivities(world, current)).not.toBeNull();
    expect(residentAt(world, actorId).activity?.poses).toHaveLength(phase + 1);
    if (phase === 4) {
      expect(residentAt(world, actorId).activity?.materialTask?.phase).toBe("approaching");
      expect(residentAt(world, actorId).activity?.poses.at(-1)?.position).not.toEqual(source);
    } else expect(residentAt(world, actorId).activity?.materialTask?.phase).toBe("arrived");
    const partial = serializeWorld(world);
    const cold = deserializeWorld(partial);
    expect(serializeWorld(cold)).toBe(partial);
    finishInterval(world, phase + 1);
    finishInterval(cold, phase + 1);
    advanceTo(world, pulseTick);
    advanceTo(cold, pulseTick);
    expect(residentAt(world, actorId).activity?.materialTask).toMatchObject({ phase: "used", usedAtTick: pulseTick });
    expectSameWorld(cold, world);
    const accountingAfterUse = accounting(world);
    const usedCold = deserializeWorld(serializeWorld(world));
    advanceTo(world, pulseTick + 1);
    advanceTo(usedCold, pulseTick + 1);
    expect(accounting(world)).toEqual(accountingAfterUse);
    expectSameWorld(usedCold, world);
  });

  it("charges one unit for real contenders and serves older pending requests before a successful worker reselects", () => {
    const { world, workerIds, settlementId, resource, startTick, pulseTick } = materialFixture(4, 3);
    const consumed = world.ledger.consumed[resource];
    advanceTo(world, pulseTick - 1);
    for (const id of workerIds) expect(residentAt(world, id).activity?.materialTask).toMatchObject({ phase: "arrived", selectedAtTick: startTick });
    const actualUsers: string[] = [];
    for (let pulse = 0; pulse < 3; pulse += 1) {
      const tick = pulseTick + pulse * 60;
      advanceTo(world, tick);
      const users = workerIds.filter((id) => residentAt(world, id).activity?.materialTask?.usedAtTick === tick);
      expect(users).toHaveLength(1);
      actualUsers.push(users[0]!);
      expect(settlementAt(world, settlementId).project.progress).toBe(pulse + 1);
      expect(world.ledger.consumed[resource] - consumed).toBe(pulse + 1);
      for (const id of workerIds.slice(pulse + 1)) expect(residentAt(world, id).activity?.materialTask?.selectedAtTick).toBe(startTick);
      if (pulse === 0) {
        const duties = new Map(world.residents.map(({ identity }) => [identity.stableId, false]));
        // Selector-only iteration counterfactual, not a valid reordered world
        // save or an engine execution on a noncanonical resident array.
        const selected = selectResidentMaterialUser(world, settlementId, duties, tick);
        const reversed = selectResidentMaterialUser({ ...world, residents: [...world.residents].reverse() }, settlementId, duties, tick);
        expect(selected?.identity.stableId).toBe(workerIds[1]);
        expect(reversed?.identity.stableId).toBe(selected?.identity.stableId);
        advanceTo(world, tick + 2);
        expect(residentAt(world, workerIds[0]!).activity?.materialTask?.selectedAtTick).toBeGreaterThan(startTick);
      }
    }
    expect(actualUsers).toEqual(workerIds);
    expect(settlementAt(world, settlementId).inventory[resource]).toBe(1);
    assertWorldInvariants(world);
  });

  it("completes the existing project once, retains its current use marker, and never spends another unit after cold load", () => {
    const { world, actorId, settlementId, resource, pulseTick } = materialFixture(2, 1, 1);
    const project = settlementAt(world, settlementId).project;
    const projectId = project.id;
    const consumed = world.ledger.consumed[resource];
    advanceTo(world, pulseTick);
    expect(settlementAt(world, settlementId).project).toMatchObject({ id: projectId, status: "complete", progress: project.target });
    expect(residentAt(world, actorId).activity?.materialTask).toMatchObject({ projectId, phase: "used", usedAtTick: pulseTick });
    const completion = world.events.filter(({ type, subjectId }) => type === "project-completed" && subjectId === projectId);
    expect(completion).toHaveLength(1);
    expect(completion[0]?.tick).toBe(pulseTick);
    const cold = deserializeWorld(serializeWorld(world));
    expectSameWorld(cold, world);
    advanceTo(world, pulseTick + 60);
    advanceTo(cold, pulseTick + 60);
    expectSameWorld(cold, world);
    expect(world.ledger.consumed[resource] - consumed).toBe(1);
    expect(settlementAt(world, settlementId).inventory[resource]).toBe(1);
    expect(world.events.filter(({ type, subjectId }) => type === "project-completed" && subjectId === projectId)).toEqual(completion);
    expect(residentAt(world, actorId).activity?.materialTask).toBeNull();
  });

  it("retains older contenders across intermittent supply rather than favoring a successful worker's retry", () => {
    const { world, workerIds, settlementId, resource, startTick, pulseTick } = materialFixture(1, 3);
    const consumed = world.ledger.consumed[resource];
    advanceTo(world, pulseTick);
    expect(residentAt(world, workerIds[0]!).activity?.materialTask?.usedAtTick).toBe(pulseTick);
    advanceTo(world, pulseTick + 60);
    expect(settlementAt(world, settlementId).project.progress).toBe(1);
    expect(world.ledger.consumed[resource] - consumed).toBe(1);
    for (const id of workerIds.slice(1)) expect(residentAt(world, id).activity?.materialTask).toMatchObject({
      selectedAtTick: startTick, phase: "waiting", waitReason: "no-material", usedAtTick: null,
    });
    expect(residentAt(world, workerIds[0]!).activity?.materialTask?.selectedAtTick).toBeGreaterThan(startTick);
    setControlledSupply(world, settlementAt(world, settlementId), resource, 1);
    advanceTo(world, pulseTick + 120);
    expect(residentAt(world, workerIds[1]!).activity?.materialTask).toMatchObject({
      selectedAtTick: startTick, phase: "used", usedAtTick: pulseTick + 120,
    });
    expect(settlementAt(world, settlementId).project.progress).toBe(2);
    expect(world.ledger.consumed[resource] - consumed).toBe(2);
    advanceTo(world, pulseTick + 180);
    expect(residentAt(world, workerIds[2]!).activity?.materialTask?.selectedAtTick).toBe(startTick);
    setControlledSupply(world, settlementAt(world, settlementId), resource, 1);
    advanceTo(world, pulseTick + 240);
    expect(residentAt(world, workerIds[2]!).activity?.materialTask).toMatchObject({
      selectedAtTick: startTick, phase: "used", usedAtTick: pulseTick + 240,
    });
    expect(settlementAt(world, settlementId).project.progress).toBe(3);
    expect(world.ledger.consumed[resource] - consumed).toBe(3);
    assertWorldInvariants(world);
  });
});
