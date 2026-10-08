import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  WORLD_NEW_GAME_START_TICK,
  assertWorldInvariants,
  createWorld,
  deserializeWorld,
  runTicks,
  serializeWorld,
  stepWorld,
  type WorldState,
} from "./public";
import { stableStringify } from "./util";

// Captured on 1025fe2's unchanged engine before the arithmetic extraction.
// These cover every native world/save/event field, not only ration counters.
const BEFORE_WITNESSES: Readonly<Record<string, {
  worldSha256: string; saveSha256: string; eventsSha256: string;
}>> = {
  "untouched-native:60": {
    worldSha256: "1af18f75d8618823ed492bdeed4ef95a61ce74687d10a9fd57b7f0adf47708f8",
    saveSha256: "4bd7f0a852f2d9f9f67baad01c915d0ac9649cf1632c00329fe2b44a6ed5f043",
    eventsSha256: "d79296441b1cc3969793d53a38d095f26c95c0d9631ba6bc3cea97dbc0fc6ed9",
  },
  "untouched-native:120": {
    worldSha256: "f095dcb1affbcccf803c56d78a7f35a000cc79cba1440c6315168c8887518826",
    saveSha256: "41ec1c7e2c76b7e53974bc9435618eb4224c8a89100c254164ba0948bfa28204",
    eventsSha256: "a69346b3b76a91c10f0e9834a54a401c6edeaf3f8e0a0302f2f438b4e9ff799b",
  },
  "controlled-mixed-presence:60": {
    worldSha256: "26b5c1c21014a6f240c14c457337ea82fc2e6fe970852d985d5dc01634b6a722",
    saveSha256: "d6a4b7f88012bdf45bbd7e77a59b7298b9298acdafa0216015c3d0ce76291bc8",
    eventsSha256: "41aafb3317c1204d8e5843b28d5ebea4163a2eef092f0dfed81721305b376be4",
  },
  "controlled-mixed-presence:120": {
    worldSha256: "9d29e6f602f59dab27a4066a5ad84957b464faa5f67480acc8e65cdfed74d8e7",
    saveSha256: "c3f9b8aeda8c766f84167eeb1809f5d786c4f6a19c52ac1eddf94adc4943748e",
    eventsSha256: "c811f3faaa82013b9849f9928d09352cfd10a122b1d17443edbdea253ae35f61",
  },
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function captureWitness(world: WorldState, fixture: string, acceptedWorldSteps: number): void {
  assertWorldInvariants(world);
  const witness = {
    fixture,
    acceptedWorldSteps,
    tick: world.meta.completedTick,
    worldSha256: sha256(stableStringify(world)),
    saveSha256: sha256(serializeWorld(world)),
    eventsSha256: sha256(stableStringify(world.events)),
  };
  const before = BEFORE_WITNESSES[`${fixture}:${acceptedWorldSteps}`];
  if (before === undefined) throw new Error("Ration witness has no characterized baseline");
  expect(witness).toEqual({
    fixture, acceptedWorldSteps, tick: WORLD_NEW_GAME_START_TICK + acceptedWorldSteps, ...before,
  });
  // Opt-in diagnostics do not update the characterized assertions.
  if (process.env.TIDEWEFT_RATION_CHARACTERIZATION === "1") {
    process.stdout.write(`resident-ration-characterization ${JSON.stringify(witness)}\n`);
  }
}

function expectExactWorld(actual: WorldState, expected: WorldState): void {
  assertWorldInvariants(actual);
  assertWorldInvariants(expected);
  expect(stableStringify(actual)).toBe(stableStringify(expected));
  expect(serializeWorld(actual)).toBe(serializeWorld(expected));
  expect(actual.events).toEqual(expected.events);
}

describe("existing hourly resident ration accounting", () => {
  it("preserves untouched native state, saves and events after 60 and 120 accepted world steps", () => {
    const uninterrupted = createWorld("first lantern", "standard");
    const segmented = createWorld("first lantern", "standard");
    expect(uninterrupted.meta.completedTick).toBe(WORLD_NEW_GAME_START_TICK);
    expectExactWorld(segmented, uninterrupted);

    runTicks(uninterrupted, 60);
    runTicks(segmented, 17);
    runTicks(segmented, 43);
    expect(uninterrupted.meta.completedTick).toBe(WORLD_NEW_GAME_START_TICK + 60);
    expectExactWorld(segmented, uninterrupted);
    captureWitness(uninterrupted, "untouched-native", 60);
    const resumed = deserializeWorld(serializeWorld(uninterrupted));

    runTicks(uninterrupted, 60);
    runTicks(segmented, 11);
    runTicks(segmented, 49);
    runTicks(resumed, 60);
    expect(uninterrupted.meta.completedTick).toBe(WORLD_NEW_GAME_START_TICK + 120);
    expectExactWorld(segmented, uninterrupted);
    expectExactWorld(resumed, uninterrupted);
    captureWitness(uninterrupted, "untouched-native", 120);
  });

  it("produces before serving the actual mixed present cohort and never serves route travelers remotely", () => {
    const world = createWorld("first lantern", "standard");
    const source = world.settlements[0];
    const visitorHome = world.settlements[1];
    const recipe = source?.recipes[0];
    if (source === undefined || visitorHome === undefined || recipe === undefined) {
      throw new Error("fixture needs the native food source and a second settlement");
    }
    expect(source.specialization).toBe("food");
    expect(recipe.outputs).toEqual([{ resource: "food", amount: 8 }]);
    expect(recipe.inputs).toEqual([]);
    expect(recipe.nextRunTick).toBe(WORLD_NEW_GAME_START_TICK + 60);
    const route = world.routes.find(({ fromSettlementId, toSettlementId }) => (
      fromSettlementId === source.id && toSettlementId === visitorHome.id
    ));
    const traveler = world.residents.find(({ id }) => id === source.residentIds[0]);
    const visitor = world.residents.find(({ id }) => id === visitorHome.residentIds[0]);
    if (route === undefined || traveler === undefined || visitor === undefined) {
      throw new Error("fixture needs native residents and their existing route");
    }

    // Explicit controlled initial conditions, not successful travel/service
    // injection: change only macro presence, pressure and finite stock. No
    // body, task, arrival, service receipt or personal inventory is authored.
    world.contracts = [];
    world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0,
      nextChangeTick: WORLD_NEW_GAME_START_TICK + 1_000 };
    for (const settlement of world.settlements) {
      for (const otherRecipe of settlement.recipes) {
        if (otherRecipe !== recipe) otherRecipe.nextRunTick = WORLD_NEW_GAME_START_TICK + 1_000;
      }
    }
    traveler.location = { kind: "route", routeId: route.id, progress: FIXED_POINT / 4 };
    traveler.needs.food = 300_000;
    visitor.location = { kind: "settlement", settlementId: source.id };
    visitor.needs.food = 999_000;
    world.ledger.initial.food -= source.inventory.food + visitorHome.inventory.food;
    world.ledger.initial.freshWater -= source.inventory.freshWater;
    source.inventory.food = 0;
    source.inventory.freshWater = 0;
    visitorHome.inventory.food = 0;
    assertWorldInvariants(world);

    runTicks(world, 59);
    const before = structuredClone(world);
    const foodConsumedBefore = world.ledger.consumed.food;
    const waterConsumedBefore = world.ledger.consumed.freshWater;
    const foodProducedBefore = world.ledger.produced.food;
    let expectedFoodConsumed = 0;
    let expectedWaterConsumed = 0;
    for (const settlement of before.settlements) {
      const present = before.residents.filter(({ location }) => (
        location.kind === "settlement" && location.settlementId === settlement.id
      ));
      const ration = Math.ceil(present.length / 3);
      const availableFood = settlement.inventory.food + (settlement.id === source.id ? 8 : 0);
      if (ration > 0 && availableFood >= ration) expectedFoodConsumed += ration;
      if (ration > 0 && settlement.inventory.freshWater >= ration) expectedWaterConsumed += ration;
    }
    stepWorld(world);

    const presentAtSource = world.residents.filter(({ location }) => (
      location.kind === "settlement" && location.settlementId === source.id
    ));
    expect(presentAtSource).toHaveLength(6);
    expect(presentAtSource.some(({ id }) => id === visitor.id)).toBe(true);
    expect(presentAtSource.some(({ id }) => id === traveler.id)).toBe(false);
    expect(visitor.homeSettlementId).toBe(visitorHome.id);
    expect(source.inventory.food).toBe(6);
    expect(source.inventory.freshWater).toBe(0);
    expect(visitorHome.inventory.food).toBe(0);
    expect(world.ledger.produced.food - foodProducedBefore).toBe(8);
    expect(world.ledger.consumed.food - foodConsumedBefore).toBe(expectedFoodConsumed);
    expect(world.ledger.consumed.freshWater - waterConsumedBefore).toBe(expectedWaterConsumed);

    for (const resident of world.residents) {
      const prior = before.residents.find(({ id }) => id === resident.id);
      if (prior === undefined) throw new Error("hourly update lost a native resident");
      const priorLocation = prior.location;
      const settlement = priorLocation.kind === "settlement"
        ? before.settlements.find(({ id }) => id === priorLocation.settlementId)
        : undefined;
      const presentCount = settlement === undefined ? 0 : before.residents.filter(({ location }) => (
        location.kind === "settlement" && location.settlementId === settlement.id
      )).length;
      const ration = Math.ceil(presentCount / 3);
      const foodAvailable = settlement === undefined ? 0
        : settlement.inventory.food + (settlement.id === source.id ? 8 : 0);
      const foodRelief = ration > 0 && foodAvailable >= ration ? 68_000 : 0;
      const waterRelief = settlement !== undefined && ration > 0
        && settlement.inventory.freshWater >= ration ? 8_000 : 0;
      expect(resident.needs.food).toBe(Math.max(0, Math.min(FIXED_POINT,
        prior.needs.food + 34_000 - foodRelief - waterRelief)));
    }
    expect(world.residents.find(({ id }) => id === visitor.id)?.needs.food).toBe(965_000);
    expect(world.residents.find(({ id }) => id === traveler.id)?.needs.food).toBe(334_000);
    captureWitness(world, "controlled-mixed-presence", 60);
    const resumed = deserializeWorld(serializeWorld(world));
    runTicks(world, 60);
    runTicks(resumed, 60);
    expect(source.inventory.food).toBe(12);
    expectExactWorld(resumed, world);
    captureWitness(world, "controlled-mixed-presence", 120);
  });
});
