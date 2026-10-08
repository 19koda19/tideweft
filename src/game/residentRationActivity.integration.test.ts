import { describe, expect, it } from "vitest";

import {
  assertWorldInvariants,
  createWorld,
  createWorldView,
  deserializeWorld,
  serializeWorld,
  stepWorld,
  type ResidentState,
  type WorldState,
} from "../sim/public";
import { RESIDENT_REST_APPROACH_STEP_UNITS } from "../sim/residentActivity";
import {
  residentRestTargetHasDrySupport,
  residentSettlementRationTarget,
} from "../sim/residentActivityWorld";
import { prepareResidentRationUse, type ResidentRationDuty } from "../sim/residentRationUse";
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

// Direct production adapter/sim integration, not outer-session or browser
// evidence. Need/weather/schedule conditions are controlled; native geometry,
// identity, service selection, motion, arrival and use are not injected.
const BASE = createWorld("resident activity executable rest approach", "standard");

function residentAt(world: WorldState, actorId: string): ResidentState {
  const resident = world.residents.find(({ identity }) => identity.stableId === actorId);
  if (resident === undefined) throw new Error("ration fixture lost its native resident");
  return resident;
}

function rationFixture(shortage = false) {
  const world = structuredClone(BASE);
  const startTick = world.meta.completedTick;
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: startTick + 1_000 };
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const settlement of world.settlements) {
    for (const recipe of settlement.recipes) recipe.nextRunTick = startTick + 1_000;
  }
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = startTick + 1_000;
    contract.dueTick = startTick + 2_000;
  }
  const chosen = world.residents.find((resident) => {
    const source = resolveResidentWorldPlacement(world, resident)?.position;
    const target = residentSettlementRationTarget(world, resident);
    if (source === undefined || target === null
      || !residentRestTargetHasDrySupport(world, source)
      || !residentRestTargetHasDrySupport(world, target)) return false;
    // Select real native support through the pulse's ordinary tide evolution;
    // do not turn water into dry land merely to make the action succeed.
    for (let offset = 1; offset <= 60; offset += 1) {
      if (!residentRestTargetHasDrySupport({ ...world, tide: tideAtTick(startTick + offset) }, target)) return false;
    }
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === WORLD_POSITION_UNITS_PER_TILE;
  });
  if (chosen === undefined || chosen.location.kind !== "settlement") {
    throw new Error("ration fixture needs a native one-tile dry service approach");
  }
  const settlementId = chosen.location.settlementId;
  const settlement = world.settlements.find(({ id }) => id === settlementId);
  if (settlement === undefined) throw new Error("ration fixture lost its settlement");
  chosen.needs.food = 900_000;
  if (shortage) {
    const count = world.residents.filter(({ location }) => (
      location.kind === "settlement" && location.settlementId === settlementId
    )).length;
    const stock = Math.ceil(count / 3) - 1;
    world.ledger.initial.food += stock - settlement.inventory.food;
    world.ledger.initial.freshWater += stock - settlement.inventory.freshWater;
    settlement.inventory.food = stock;
    settlement.inventory.freshWater = stock;
  }
  const actorId = chosen.identity.stableId;
  const target = residentSettlementRationTarget(world, chosen)!;
  const source = resolveResidentWorldPlacement(world, chosen)!.position;
  assertWorldInvariants(world);
  expect(adoptResidentActivities(world)).toBe(true);
  expect(prepareResidentRestActivities(world)).toBe(true);
  expect(residentAt(world, actorId).activity?.rationTask).toMatchObject({ phase: "approaching", usedAtTick: null });
  expect(residentAt(world, actorId).activity?.restTask).toBeNull();
  return { world, actorId, settlementId, source, target, pulseTick: startTick + 60 };
}

function stockAndConsumption(world: WorldState) {
  // Civic projects keep their separate material debits at the same boundary;
  // this counterfactual isolates food/water, not unrelated project resources.
  return structuredClone({
    stocks: world.settlements.map(({ id, inventory }) => ({
      id, inventory: { food: inventory.food, freshWater: inventory.freshWater },
    })),
    ledger: {
      initial: { food: world.ledger.initial.food, freshWater: world.ledger.initial.freshWater },
      produced: { food: world.ledger.produced.food, freshWater: world.ledger.produced.freshWater },
      consumed: { food: world.ledger.consumed.food, freshWater: world.ledger.consumed.freshWater },
    },
  });
}

/** Explicit neutral duty facts for this adapter fixture, not keeper-runtime proof. */
function closingDuties(world: WorldState, active: readonly ResidentActivityDuty[] = []): ResidentRationDuty[] {
  const byActor = new Map(active.map(({ actorId, duty }) => [actorId, duty]));
  expect(world.residents).toHaveLength(42);
  return world.residents.map(({ identity }) => ({
    actorId: identity.stableId,
    duty: byActor.get(identity.stableId) ?? null,
  }));
}

function finishInterval(world: WorldState, fromPhase = 1, duties: readonly ResidentActivityDuty[] = []) {
  for (let phase = fromPhase; phase <= 10; phase += 1) {
    const result = advanceResidentRestActivities(world, phase);
    expect(result).not.toBeNull();
    expect(result?.maximumSurfaceCells).toBeLessThanOrEqual(16 * 16);
  }
  const admission = (world.meta.completedTick + 1) % 60 === 0
    ? prepareResidentRationUse(world, closingDuties(world, duties)) : undefined;
  if (admission === null) throw new Error("real closing interval could not prepare ration admission");
  stepWorld(world, [], undefined, admission);
  return admission;
}

function advanceTo(world: WorldState, tick: number) {
  while (world.meta.completedTick < tick) {
    expect(prepareResidentRestActivities(world)).toBe(true);
    finishInterval(world);
  }
  expect(world.meta.completedTick).toBe(tick);
}

describe("resident ration approach and hourly use", () => {
  it("shows only current committed use inside actual detail sight without disclosing hunger or a private destination", () => {
    const { world, actorId, target, pulseTick } = rationFixture();
    advanceTo(world, pulseTick - 1);
    const player = createPlayer(createWorldView(world));
    // Projection-only camera fixture: view the real service body, never move
    // it or assign use. Native runtime coverage retains the normal spawn.
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
    const arrived = render();
    expect(arrived.current.activity?.rationTask?.phase).toBe("arrived");
    expect(arrived.porter?.quickLabel).not.toContain("ration");
    expect(arrived.ui.selectedResident?.observed.find(({ label }) => label === "Behavior")?.value).not.toContain("ration");
    finishInterval(world);
    const bytes = serializeWorld(world);
    const used = render();
    expect(used.porter?.quickLabel).toBe("Unknown resident · taking a ration");
    expect(used.ui.selectedResident?.observed).toContainEqual({ label: "Behavior", value: "Taking a ration here" });
    expect(used.scene.acousticText).toEqual([]);
    expect(JSON.stringify({ quickLabel: used.porter?.quickLabel, observed: used.ui.selectedResident?.observed }))
      .not.toMatch(/need:food|900000|settlement-ration|rationTask|selectedAtTick|localX|localY/u);
    expect(serializeWorld(world)).toBe(bytes);
    player.x = (world.terrain.width - 0.5) * 1_000;
    player.y = (world.terrain.height - 0.5) * 1_000;
    const hidden = render();
    const point = projectResidentWorldPosition(hidden.view, hidden.current, 1_000)!;
    expect(hidden.perception.detailVisibilityGrades[point.tileIndex]).toBe(0);
    expect(hidden.porter).toBeUndefined();
    expect(hidden.ui.selectedResident).toBeUndefined();
    expect(serializeWorld(world)).toBe(bytes);
  });

  it("approaches and arrives through shared motion without fine-step stock or need changes, then uses exactly one shared group", () => {
    const { world, actorId, settlementId, source, target, pulseTick } = rationFixture();
    const initialAccounting = stockAndConsumption(world);
    const initialAllStocks = structuredClone(world.settlements.map(({ inventory }) => inventory));
    const initialAllLedger = structuredClone(world.ledger);
    let previous = source;
    for (let phase = 1; phase <= 10; phase += 1) {
      const result = advanceResidentRestActivities(world, phase);
      expect(result).not.toBeNull();
      const position = residentAt(world, actorId).activity!.poses.at(-1)!.position;
      const delta = worldPositionDelta(previous, position);
      expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(RESIDENT_REST_APPROACH_STEP_UNITS);
      if (phase === 1) expect(position).not.toEqual(source);
      previous = position;
      expect(residentAt(world, actorId).needs.food).toBe(900_000);
      expect(stockAndConsumption(world)).toEqual(initialAccounting);
      expect(world.settlements.map(({ inventory }) => inventory)).toEqual(initialAllStocks);
      expect(world.ledger).toEqual(initialAllLedger);
    }
    expect(previous).toEqual(target);
    expect(residentAt(world, actorId).activity?.rationTask?.phase).toBe("arrived");
    expect(residentAt(world, actorId).circadian).toMatchObject({ restDestinationArrived: false, posture: { state: "awake" } });
    stepWorld(world);
    advanceTo(world, pulseTick - 1);
    expect(stockAndConsumption(world)).toEqual(initialAccounting);
    expect(residentAt(world, actorId).needs.food).toBe(900_000);

    const admission = finishInterval(world);
    if (admission === undefined) throw new Error("hourly use lacked its actual admission");
    const sourceStock = initialAccounting.stocks.find(({ id }) => id === settlementId)!.inventory;
    const currentStock = world.settlements.find(({ id }) => id === settlementId)!.inventory;
    expect(currentStock.food).toBe(sourceStock.food - 1);
    expect(currentStock.freshWater).toBe(sourceStock.freshWater - 1);
    expect(world.ledger.consumed.food - initialAccounting.ledger.consumed.food).toBe(1);
    expect(world.ledger.consumed.freshWater - initialAccounting.ledger.consumed.freshWater).toBe(1);
    expect(residentAt(world, actorId).needs.food).toBe(858_000);
    expect(residentAt(world, actorId).activity?.rationTask).toMatchObject({
      phase: "used", usedAtTick: pulseTick, foodUsed: true, waterUsed: true,
    });
    const usedSave = serializeWorld(world);
    expect(() => stepWorld(world, [], undefined, admission)).toThrow(/stale|foreign|already consumed/u);
    expect(serializeWorld(world)).toBe(usedSave);

    const resumed = deserializeWorld(usedSave);
    const usedAccounting = stockAndConsumption(world);
    finishInterval(world);
    finishInterval(resumed);
    expect(stockAndConsumption(world)).toEqual(usedAccounting);
    expect(residentAt(world, actorId).needs.food).toBe(858_000);
    expect(serializeWorld(resumed)).toBe(serializeWorld(world));
    assertWorldInvariants(world);
  });

  it("does not create stock or relief when the full-cohort budget is unavailable despite real arrival", () => {
    const { world, actorId, pulseTick } = rationFixture(true);
    const initialAccounting = stockAndConsumption(world);
    advanceTo(world, pulseTick);
    expect(residentAt(world, actorId).activity?.rationTask).toMatchObject({ phase: "arrived", usedAtTick: null });
    expect(residentAt(world, actorId).needs.food).toBe(934_000);
    expect(stockAndConsumption(world)).toEqual(initialAccounting);
    assertWorldInvariants(world);
  });

  it("revokes a real arrived ration task when a controlled higher-owner duty takes priority before the pulse", () => {
    const { world, actorId, pulseTick } = rationFixture();
    const initialAccounting = stockAndConsumption(world);
    advanceTo(world, pulseTick - 1);
    expect(residentAt(world, actorId).activity?.rationTask?.phase).toBe("arrived");
    const duties: ResidentActivityDuty[] = [{
      actorId, duty: { kind: "active-duty", referenceId: "test:current-service-interruption" },
    }];
    expect(prepareResidentRestActivities(world, duties)).toBe(true);
    expect(residentAt(world, actorId).activity?.rationTask).toBeNull();
    expect(residentAt(world, actorId).activity?.restTask).toBeNull();
    finishInterval(world, 1, duties);
    expect(residentAt(world, actorId).needs.food).toBe(934_000);
    expect(stockAndConsumption(world)).toEqual(initialAccounting);
    assertWorldInvariants(world);
  });

  it("continues an actual phase-four approach through cold load to exactly the same pulse, state, events and save", () => {
    const { world, actorId, source, pulseTick } = rationFixture();
    for (let phase = 1; phase <= 4; phase += 1) {
      expect(advanceResidentRestActivities(world, phase)).not.toBeNull();
    }
    expect(residentAt(world, actorId).activity?.rationTask?.phase).toBe("approaching");
    expect(residentAt(world, actorId).activity?.poses).toHaveLength(5);
    expect(residentAt(world, actorId).activity?.poses.at(-1)?.position).not.toEqual(source);
    const partialSave = serializeWorld(world);
    const resumed = deserializeWorld(partialSave);
    expect(serializeWorld(resumed)).toBe(partialSave);
    finishInterval(world, 5);
    finishInterval(resumed, 5);
    advanceTo(world, pulseTick);
    advanceTo(resumed, pulseTick);
    expect(residentAt(world, actorId).activity?.rationTask?.phase).toBe("used");
    expect(residentAt(world, actorId).needs.food).toBe(858_000);
    expect(world.events).toEqual(resumed.events);
    expect(serializeWorld(resumed)).toBe(serializeWorld(world));
    assertWorldInvariants(world);
    assertWorldInvariants(resumed);
  });
});
