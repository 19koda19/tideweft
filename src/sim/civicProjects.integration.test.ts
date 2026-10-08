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
  type ProjectKind,
  type ResourceKind,
  type SettlementState,
  type SimCommand,
  type WorldState,
} from "./public";
import { stableStringify } from "./util";

// Characterize the existing aggregate timer/delivery transactions, not an
// enacted civic task, local worker, material claim or full-runtime journey.
const NATIVE_WORLD = createWorld("first lantern", "standard");
const FIRST_HOUR = WORLD_NEW_GAME_START_TICK + 60;

// Frozen on e616789's unchanged engine, before shared bookkeeping extraction.
// Each triplet covers the complete world, serialized save and ordered events.
const BEFORE_WITNESSES: Readonly<Record<string, readonly [string, string, string]>> = {
  "hourly-finite:60": [
    "54ef70265e6202e8f3d5397cb91f2f23aec82283d9df94c6c299b18e69a81ab4",
    "97e45d5109d97410f1934817a232e34d0dfe14954896a08b086616b3429753d5",
    "7640e9adccbb81fd74aa63ddca037b24c976ca656c0ac596213df1dbaa72f7bd",
  ],
  "hourly-finite:120": [
    "8287d6fb0d0f22e719a7dbedfa983c4ba81fcf8ccff77477a2494df6efb20a5e",
    "3ad371cdb3ff7e7b6b8429e75c92091b5124e58b05c089fc08de5931ab930add",
    "edd667bd131ebfaf45c4c9a318d1d56285554dca460570b959d7d2576d80e8a7",
  ],
  "hourly-shortage:60": [
    "e68d0c8a4eb88cae91524837e68ec72c21fcc5aacd1a242f8589b4cdd20c23a5",
    "8a03af28bf466b102fb4881c91d5d2ab3c96357708d193e12754111b983c8501",
    "7640e9adccbb81fd74aa63ddca037b24c976ca656c0ac596213df1dbaa72f7bd",
  ],
  "completion-beacon:60": [
    "fbed0a614959acba3f3eb4a48c3fe9e482ec97786733e16e5a27dd6a4e8d93ac",
    "aa3be69925ce4fb8a8ece1f452a0aefa5b1a5db91e00eb5c246db133031d6889",
    "acf93a9f90414ec563aab5ab4f2c6defd2e7c0669e87267e076d995bc1119e50",
  ],
  "completion-cache:60": [
    "01783639ef693edc3d41948d0945a301475e3d020831f088db0e0cc329a561c9",
    "29829ff3ec10884376833abae1ca5eeacb9b7a4a31251e13faf06d297fa6d1fa",
    "842382ef2fbdb37ab9c61fe44198993fdd171fe1daeabcd399caced871d8a12d",
  ],
  "completion-crossing:60": [
    "ae37e99efd9d786df53e3780666a8a1a1dfc905665d32156b355fd485ae244c1",
    "238049eae6b71fed99c27fc58491bb00109f4538ff9beb6a00fb09318935737c",
    "814ce92755e4b4538638e8451f5b8feea60506149a6ae7edb5273808b60b24dc",
  ],
  "completion-clinic:60": [
    "64cdfce237a48e7e11c606916730e65e8bdf43fa1ffffcd5301e924da92379d2",
    "c8833aec4b3f6466a175138011f04a067b1a1644e426fc456ab5268bfd18105c",
    "e2626cd4902d05287219b40482b4783abceebbf84e2827c078c94e96c4a4bfc4",
  ],
  "completion-ferry:60": [
    "f2525df896700f113c65f6e903ff73907e3447b5486cbb53f0a7ca2ed71d474a",
    "860d656251edce0e5e594abbfdbd232555953a41880632e74de1461d7ee0ceb6",
    "a1941c95fd24766ad97c56d720224408c9e469663b127d41238debbf50cf3955",
  ],
  "delivery-same-resource:2": [
    "1b4882518c5c62df0cc6caa0f9ef75dbd663856cb9875ecd6262636b4bce50e6",
    "26713211e57f2c4dc7810a6a9d0e12faed55b21e8367518a5d566dd4904cf130",
    "b51f14762e716c4ba0015bafaedefc91b25d2457a1ff70f5b0500a8dea6b36cc",
  ],
  "delivery-zero-condition minimum:2": [
    "cea28b9c49899be01ac7614b522a28264540827328ea081ed52c310e7ae4987b",
    "e3806573b02ede998186c320dc7fb7a5591b4fc2211c3c28734cc00f6790407f",
    "5123e037af6cbe960948969ed9077cf8b65eaf749d20f6011ed03905cd13da96",
  ],
  "delivery-remaining cap:2": [
    "ae3e4c3e2f24adb951568e7a3066da8296397a2f5898a5129c813983cca37505",
    "0a5db62b87afc8e8b92dc624090cee0af74b5a554e8275c83924739e49c165d1",
    "fecdac18de9e9c68dbdb97c36798f7f105b77f92a963a06c1c296bfcf1ecf77f",
  ],
  "delivery-resource mismatch:2": [
    "be84b8ecf0cc92f555ae4616d74e90e0a52417628b774920da685c3d0ed744ea",
    "b47fed7b76fd4c49885ea1990f1e5b48454287e09d7bc80d0d0c34734557305d",
    "d85f149ff1040885e71e9cf1e8db57f0ce257f275924ed4d2233d562a82f2fe9",
  ],
  "delivery-already complete:2": [
    "1a4816bd07311c60eec004dc8c9b57b209e4cb784fa459f88dc6b9fa2901c1e2",
    "ee8224de2b15850b369bdd318c9f34100c66e40133b8fe05442a974182a2c663",
    "d85f149ff1040885e71e9cf1e8db57f0ce257f275924ed4d2233d562a82f2fe9",
  ],
  "hourly-and-delivery:60": [
    "569d602e38b64449d227fa146100612afd9d3a2683c74ab0c484ac76ea8cd231",
    "dcb3640ba1d95745da5abb582c9362ee335dd430f41d5a91d5a3b9950326976d",
    "e1841db5aff3a96b073ca49bf563c672c82c9534ee0740fd8a0cab902516460a",
  ],
  "hourly-and-delivery:120": [
    "df5f519f6f9ffce66d3092253f8e5f6df6de780f15f85b445a3f6cf71029aba3",
    "b1947fef586bcb6c8ff7ef1f82b9ebe49826e7e1869d7ac975d399e93429cdaa",
    "995886da16a37cfc6625cd33e16cd85c40f88345ae79d51085da61093a4e9db2",
  ],
};

function controlledWorld(): WorldState {
  const world = structuredClone(NATIVE_WORLD);
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0,
    nextChangeTick: WORLD_NEW_GAME_START_TICK + 1_000 };
  // Retain native recipes/offers, but hold these unrelated causes beyond the
  // finite witness window rather than inserting successful work or receipts.
  for (const settlement of world.settlements) {
    for (const recipe of settlement.recipes) recipe.nextRunTick = WORLD_NEW_GAME_START_TICK + 1_000;
  }
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = WORLD_NEW_GAME_START_TICK + 1_000;
    contract.dueTick = WORLD_NEW_GAME_START_TICK + 2_000;
  }
  return world;
}

function setInitialStock(world: WorldState, settlement: SettlementState, resource: ResourceKind, quantity: number): void {
  world.ledger.initial[resource] += quantity - settlement.inventory[resource];
  settlement.inventory[resource] = quantity;
}

function isolateMaterial(world: WorldState, resource: ResourceKind): void {
  for (const settlement of world.settlements) setInitialStock(world, settlement, resource, 0);
}

function settlementAt(world: WorldState, id: number): SettlementState {
  const settlement = world.settlements.find((candidate) => candidate.id === id);
  if (settlement === undefined) throw new Error("fixture lost its native settlement");
  return settlement;
}

function completionEvents(world: WorldState, projectId: number) {
  return world.events.filter((event) => event.type === "project-completed" && event.subjectId === projectId);
}

function materialTotal(world: WorldState, resource: ResourceKind): number {
  return world.settlements.reduce((sum, settlement) => sum + settlement.inventory[resource], 0)
    + world.contracts.reduce((sum, contract) => sum + (contract.resource === resource ? contract.cargoQuantity : 0), 0);
}

function characterize(world: WorldState, label: string): void {
  assertWorldInvariants(world);
  const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
  const witness = {
    label, tick: world.meta.completedTick,
    worldSha256: sha256(stableStringify(world)),
    saveSha256: sha256(serializeWorld(world)),
    eventsSha256: sha256(stableStringify(world.events)),
  };
  const before = BEFORE_WITNESSES[label];
  if (before === undefined) throw new Error("Civic project witness lacks an unchanged-engine baseline");
  expect([witness.worldSha256, witness.saveSha256, witness.eventsSha256]).toEqual(before);
  if (process.env.TIDEWEFT_CIVIC_PROJECT_CHARACTERIZATION !== "1") return;
  // Diagnostic output never generates or replaces an expectation. Capture the
  // unchanged BEFORE identities before altering the transaction implementation.
  process.stdout.write(`civic-project-characterization ${JSON.stringify(witness)}\n`);
}

function expectExactWorld(actual: WorldState, expected: WorldState): void {
  assertWorldInvariants(actual);
  assertWorldInvariants(expected);
  expect(stableStringify(actual)).toBe(stableStringify(expected));
  expect(serializeWorld(actual)).toBe(serializeWorld(expected));
  expect(actual.events).toEqual(expected.events);
}

function projectFixture(kind: ProjectKind, stock: number) {
  const world = controlledWorld();
  const settlement = world.settlements.find((candidate) => candidate.project.kind === kind)!;
  if (settlement === undefined) throw new Error("fixture needs a native project kind");
  const resource = settlement.project.resource;
  isolateMaterial(world, resource);
  setInitialStock(world, settlement, resource, stock);
  assertWorldInvariants(world);
  return { world, settlement, resource };
}

function deliveryFixture(destinationStock = 2, remaining?: number) {
  const world = controlledWorld();
  const contract = world.contracts.find((candidate) => candidate.status === "offered")!;
  if (contract === undefined) throw new Error("fixture needs a native offered Promise");
  const origin = settlementAt(world, contract.originSettlementId);
  const destination = settlementAt(world, contract.destinationSettlementId);
  const route = world.routes.find((candidate) => candidate.id === contract.routeId)!;
  if (route === undefined) throw new Error("fixture needs the native delivery route");
  const resource = destination.project.resource;
  if (resource === "food" || resource === "freshWater") throw new Error("fixture needs a non-ration native project material");
  // Controlled terms and finite initial supply precede actual legal custody
  // transitions. Eight units fit every native project-material player limit.
  contract.resource = resource;
  contract.quantity = 8;
  isolateMaterial(world, resource);
  setInitialStock(world, origin, resource, contract.quantity);
  setInitialStock(world, destination, resource, destinationStock);
  if (remaining !== undefined) destination.project.progress = destination.project.target - remaining;
  const acceptAndPickup: readonly SimCommand[] = [
    { id: "civic-accept", type: "accept-contract", contractId: contract.id, carrier: "player" },
    { id: "civic-pickup", type: "pickup-contract", contractId: contract.id, originSettlementId: origin.id },
  ];
  const trace = route.fromSettlementId === origin.id ? [...route.path] : [...route.path].reverse();
  const deliver = (condition: number): SimCommand => ({
    id: "civic-deliver", type: "deliver-contract", contractId: contract.id,
    destinationSettlementId: destination.id, condition, trace,
  });
  assertWorldInvariants(world);
  return { world, contract, origin, destination, resource, acceptAndPickup, deliver };
}

describe("existing civic project material transactions", () => {
  it("consumes one finite unit only at each hourly project update", () => {
    const { world, settlement, resource } = projectFixture("beacon", 2);
    const consumed = world.ledger.consumed[resource];
    runTicks(world, 59);
    expect(settlement.project.progress).toBe(0);
    expect(settlement.inventory[resource]).toBe(2);
    expect(world.ledger.consumed[resource]).toBe(consumed);
    stepWorld(world);
    expect(world.meta.completedTick).toBe(FIRST_HOUR);
    expect(settlement.project.progress).toBe(1);
    expect(settlement.inventory[resource]).toBe(1);
    expect(world.ledger.consumed[resource] - consumed).toBe(1);
    characterize(world, "hourly-finite:60");
    runTicks(world, 60);
    expect(settlement.project.progress).toBe(2);
    expect(settlement.inventory[resource]).toBe(0);
    expect(world.ledger.consumed[resource] - consumed).toBe(2);
    characterize(world, "hourly-finite:120");
  });

  it("does not progress or emit completion when the required material is absent", () => {
    const { world, settlement, resource } = projectFixture("beacon", 0);
    const consumed = world.ledger.consumed[resource];
    runTicks(world, 60);
    expect(settlement.project).toMatchObject({ status: "building", progress: 0 });
    expect(settlement.inventory[resource]).toBe(0);
    expect(world.ledger.consumed[resource]).toBe(consumed);
    expect(completionEvents(world, settlement.project.id)).toEqual([]);
    characterize(world, "hourly-shortage:60");
  });

  it.each(["beacon", "cache", "crossing", "clinic", "ferry"] as const)("commits the exact native %s completion effect once, unlike material shortage", (kind) => {
    const { world, settlement, resource } = projectFixture(kind, 2);
    settlement.project.progress = settlement.project.target - 1;
    const projectId = settlement.project.id;
    for (const route of world.routes) {
      if (route.fromSettlementId === settlement.id || route.toSettlementId === settlement.id) {
        route.condition = 400_000;
        route.reliability = 400_000;
      }
    }
    const control = structuredClone(world);
    setInitialStock(control, settlementAt(control, settlement.id), resource, 0);
    const consumed = world.ledger.consumed[resource];
    runTicks(world, 60);
    runTicks(control, 60);
    expect(settlement.project).toMatchObject({ status: "complete", progress: settlement.project.target });
    expect(settlementAt(control, settlement.id).project.status).toBe("building");
    expect(completionEvents(control, projectId)).toEqual([]);
    expect(settlement.inventory[resource]).toBe(1);
    expect(world.ledger.consumed[resource] - consumed).toBe(1);
    const effects: Record<ProjectKind, string> = {
      beacon: "storm forecast and signal coverage improved",
      cache: "rest and cargo recovery became faster at this harbor",
      crossing: "incident land routes became faster and more weatherworthy",
      clinic: "connected-route rescue and local recovery came online",
      ferry: "porter capacity increased and water crossings became faster",
    };
    const events = completionEvents(world, projectId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tick: FIRST_HOUR, data: { settlementId: settlement.id, kind, effect: effects[kind] } });
    const incidentIds = new Set(world.routes.filter((route) => route.fromSettlementId === settlement.id
      || route.toSettlementId === settlement.id).map(({ id }) => id));
    for (const route of world.routes) {
      const prior = control.routes.find(({ id }) => id === route.id)!;
      if (!incidentIds.has(route.id)) {
        expect(route).toEqual(prior);
        continue;
      }
      expect(route.condition).toBe(prior.condition + (kind === "cache" ? 45_000 : kind === "crossing" ? 150_000 : 0));
      expect(route.reliability).toBe(prior.reliability + (kind === "beacon" ? 90_000 : kind === "ferry" ? 55_000 : 0));
      expect(route.baseTravelTicks).toBe(kind === "crossing" ? Math.max(6, Math.trunc(prior.baseTravelTicks * 82 / 100))
        : kind === "ferry" ? Math.max(6, Math.trunc(prior.baseTravelTicks * 86 / 100)) : prior.baseTravelTicks);
    }
    if (kind === "beacon") {
      for (const knowledge of settlement.knowledge) {
        const prior = settlementAt(control, settlement.id).knowledge.find(({ id }) => id === knowledge.id)!;
        expect(knowledge.confidence).toBe(Math.min(FIXED_POINT, prior.confidence + 120_000));
      }
    } else if (kind === "clinic") {
      expect(settlement.stress).toBe(Math.max(0, settlementAt(control, settlement.id).stress - 220_000));
      for (const id of settlement.residentIds) {
        const resident = world.residents.find((candidate) => candidate.id === id)!;
        const prior = control.residents.find((candidate) => candidate.id === id)!;
        expect(resident.needs.rest).toBe(Math.max(0, prior.needs.rest - 90_000));
        expect(resident.needs.belonging).toBe(Math.max(0, prior.needs.belonging - 70_000));
      }
    }
    characterize(world, `completion-${kind}:60`);
    runTicks(world, 60);
    expect(settlement.inventory[resource]).toBe(1);
    expect(world.ledger.consumed[resource] - consumed).toBe(1);
    expect(completionEvents(world, projectId)).toEqual(events);
    assertWorldInvariants(world);
  });

  it.each([
    { name: "same-resource", condition: FIXED_POINT, remaining: undefined, contribution: 4, complete: false },
    { name: "zero-condition minimum", condition: 0, remaining: undefined, contribution: 1, complete: false },
    { name: "remaining cap", condition: FIXED_POINT, remaining: 3, contribution: 3, complete: true },
    { name: "resource mismatch", condition: FIXED_POINT, remaining: undefined, contribution: 0, complete: false },
    { name: "already complete", condition: FIXED_POINT, remaining: 0, contribution: 0, complete: true },
  ])("deposits real picked-up cargo before the bounded $name contribution", ({ name, condition, remaining, contribution, complete }) => {
    const current = deliveryFixture(2, remaining);
    const { world, contract, origin, destination, resource } = current;
    if (name === "resource mismatch") destination.project.resource = resource === "parts" ? "medicine" : "parts";
    if (name === "already complete") destination.project.status = "complete";
    const initialProgress = destination.project.progress;
    const initialTotal = materialTotal(world, resource);
    const consumed = world.ledger.consumed[resource];
    stepWorld(world, current.acceptAndPickup);
    expect(contract.status).toBe("in-transit");
    expect(origin.inventory[resource]).toBe(0);
    expect(contract.cargoQuantity).toBe(8);
    expect(materialTotal(world, resource)).toBe(initialTotal);
    const command = current.deliver(condition);
    stepWorld(world, [command]);
    expect(contract).toMatchObject({ status: "fulfilled", cargoQuantity: 0, deliveryCondition: condition });
    expect(destination.inventory[resource]).toBe(10 - contribution);
    expect(destination.project.progress).toBe(initialProgress + contribution);
    expect(destination.project.status).toBe(complete ? "complete" : "building");
    expect(world.ledger.consumed[resource] - consumed).toBe(contribution);
    expect(materialTotal(world, resource)).toBe(initialTotal - contribution);
    const fulfilled = world.events.filter((event) => event.type === "contract-fulfilled" && event.subjectId === contract.id);
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]?.data.projectContribution).toBe(contribution);
    const projectEvents = completionEvents(world, destination.project.id);
    expect(projectEvents).toHaveLength(name === "remaining cap" ? 1 : 0);
    if (projectEvents.length > 0) expect(projectEvents[0]!.sequence).toBeLessThan(fulfilled[0]!.sequence);
    characterize(world, `delivery-${name}:2`);
    const restored = deserializeWorld(serializeWorld(world));
    expectExactWorld(restored, world);
    stepWorld(world, [command]);
    stepWorld(restored, [command]);
    expectExactWorld(restored, world);
    expect(destination.inventory[resource]).toBe(10 - contribution);
    expect(world.ledger.consumed[resource] - consumed).toBe(contribution);
    expect(completionEvents(world, destination.project.id)).toEqual(projectEvents);
    expect(world.events.filter((event) => event.type === "contract-fulfilled" && event.subjectId === contract.id)).toEqual(fulfilled);
  });

  it("keeps same-tick delivery and hourly debits distinct across exact batched/cold continuation", () => {
    const current = deliveryFixture(3);
    const { contract, destination, resource } = current;
    const command = current.deliver(FIXED_POINT);
    const commands = new Map<number, readonly SimCommand[]>([
      [WORLD_NEW_GAME_START_TICK + 1, current.acceptAndPickup],
      [FIRST_HOUR, [command]],
    ]);
    const uninterrupted = structuredClone(current.world);
    const segmented = structuredClone(current.world);
    const consumed = current.world.ledger.consumed[resource];
    runTicks(uninterrupted, 60, commands);
    runTicks(segmented, 17, commands);
    runTicks(segmented, 42, commands);
    expect(segmented.contracts.find(({ id }) => id === contract.id)?.status).toBe("in-transit");
    const restored = deserializeWorld(serializeWorld(segmented));
    runTicks(segmented, 1, commands);
    runTicks(restored, 1, commands);
    expectExactWorld(segmented, uninterrupted);
    expectExactWorld(restored, uninterrupted);
    expect(settlementAt(uninterrupted, destination.id).project.progress).toBe(5);
    expect(settlementAt(uninterrupted, destination.id).inventory[resource]).toBe(6);
    expect(uninterrupted.ledger.consumed[resource] - consumed).toBe(5);
    expect(uninterrupted.events.find((event) => event.type === "contract-fulfilled"
      && event.subjectId === contract.id)?.data.projectContribution).toBe(4);
    characterize(uninterrupted, "hourly-and-delivery:60");
    runTicks(uninterrupted, 60, commands);
    runTicks(segmented, 11, commands);
    runTicks(segmented, 49, commands);
    runTicks(restored, 60, commands);
    expectExactWorld(segmented, uninterrupted);
    expectExactWorld(restored, uninterrupted);
    expect(settlementAt(uninterrupted, destination.id).project.progress).toBe(6);
    expect(settlementAt(uninterrupted, destination.id).inventory[resource]).toBe(5);
    expect(uninterrupted.ledger.consumed[resource] - consumed).toBe(6);
    expect(uninterrupted.events.filter((event) => event.type === "contract-fulfilled" && event.subjectId === contract.id)).toHaveLength(1);
    characterize(uninterrupted, "hourly-and-delivery:120");
  });
});
