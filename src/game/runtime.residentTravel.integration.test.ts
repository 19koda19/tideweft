import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { findAutonomousRoutePlan, routeIsActive } from "../sim/network";
import {
  assertWorldInvariants,
  deserializeWorld,
  FIXED_POINT,
  serializeWorld,
  type ContractState,
  type ResidentState,
  type WorldState,
} from "../sim/public";
import * as simulation from "../sim/public";
import * as rationPulse from "../sim/residentRations";
import * as materialUse from "../sim/residentMaterialUse";
import { pressureMultiplier } from "../sim/world";
import {
  RESIDENT_REST_APPROACH_STEP_UNITS,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  residentActivitySupportsRations,
} from "../sim/residentActivity";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { residentTravelStepUnits } from "../sim/residentTravelAdvance";
import {
  residentTravelBodyIsLocal,
  residentTravelInteractionFrame,
  residentTravelSegment,
  residentTravelSegmentOffset,
  residentTravelSegmentPose,
} from "../sim/residentTravelRoute";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { TERRAIN_DRAG_PERMILLE } from "./footing";
import { REGIONAL_TRAVEL_COLUMNS, REGIONAL_TRAVEL_ROWS } from "./regionalTravel";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { CURRENT_GAME_SAVE_VERSION } from "./saveCompatibilityPolicy";
import * as situatedExpressionChannelBank from "./situatedExpressionChannelBank";
import * as weatherHoldExpression from "./residentWeatherHoldExpression";
import type { SituatedExpressionAdmissionLedger } from "./situatedExpressionAdmissionLedger";
import {
  createWorldPosition,
  worldPositionDelta,
  worldPositionToGlobalFixed,
  type WorldPosition,
} from "./worldPosition";

const soundscapePlay = vi.hoisted(() => vi.fn());
vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

interface Envelope extends Record<string, unknown> {
  format: "tideweft-session";
  version: number;
  world: string;
  regionalTravel: string;
  perceptionCarry: { playerStepsSinceWorldTick: number };
  integrity: string;
}

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {
    this.record = record === undefined ? undefined : structuredClone(record);
  }
  async list() { return []; }
  async load(slotId: string) {
    return slotId === "autosave" && this.record !== undefined ? structuredClone(this.record) : undefined;
  }
  async save(record: SaveRecord) { this.record = structuredClone(record); }
  async remove() { this.record = undefined; }
  snapshot(): SaveRecord {
    if (this.record === undefined) throw new Error("native travel fixture has no committed save");
    return structuredClone(this.record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime = 100;
const runtimes = new Set<TideweftRuntime>();

beforeEach(() => {
  scheduledFrame = undefined;
  nextFrameTime = 100;
  soundscapePlay.mockClear();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open(repository: MemoryRepository): Promise<TideweftRuntime> {
  const runtime = await createTideweftRuntime(repository);
  runtimes.add(runtime);
  expect(runtime.getUIView().saveWarning).toBeUndefined();
  return runtime;
}

function close(runtime: TideweftRuntime): void {
  runtime.destroy();
  runtimes.delete(runtime);
  scheduledFrame = undefined;
}

/** Establish the RAF clock, then process exactly count ordinary fixed steps. */
function advance(runtime: TideweftRuntime, count: number, expectSuccess = true): void {
  runtime.start();
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (callback === undefined) throw new Error("traveler runtime stopped scheduling ordinary play");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
  if (expectSuccess) {
    expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
    expect(runtime.getUIView().saveWarning).toBeUndefined();
  } else {
    expect(runtime.getUIView().saveWarning).toMatchObject({
      id: "runtime-integrity-halt",
      message: "SIMULATION PAUSED SAFELY",
      tone: "danger",
    });
  }
}

function decode(record: SaveRecord): Envelope {
  const envelope = JSON.parse(record.worldJson) as Envelope;
  expect(envelope.format).toBe("tideweft-session");
  expect(envelope.version).toBe(CURRENT_GAME_SAVE_VERSION);
  expect(record.payloadVersion).toBe(CURRENT_GAME_SAVE_VERSION);
  expect(envelope.integrity).toBe(gameSaveEnvelopeIntegrity(envelope));
  return envelope;
}

function authoritativeRoots(envelope: Envelope): unknown {
  // Only session recap/presentation restart. World, event history, bodies,
  // perception, custody, ecology, player and every other saved root must agree.
  const { integrity: _integrity, session: _session, ...roots } = envelope;
  return roots;
}

function recordWith(record: SaveRecord, envelope: Envelope): SaveRecord {
  envelope.integrity = gameSaveEnvelopeIntegrity(envelope);
  return { ...record, payloadVersion: envelope.version, worldJson: JSON.stringify(envelope) };
}

function contract(world: WorldState, id: number): ContractState {
  const result = world.contracts.find((candidate) => candidate.id === id);
  if (result === undefined) throw new Error("native traveler contract disappeared");
  return result;
}

function actor(world: WorldState, actorId: string): ResidentState {
  const result = world.residents.find(({ identity }) => identity.stableId === actorId);
  if (result === undefined) throw new Error("native traveler identity disappeared");
  return result;
}

function routeDistance(world: WorldState, commitment: ContractState, human: ResidentState): number {
  const task = human.activity?.travelTask;
  if (task?.mode !== "physical") throw new Error("new traveler lost its explicit physical cursor");
  const segment = residentTravelSegment(world, commitment, task);
  const pose = human.activity!.poses.at(-1)!;
  const offset = segment === null ? null : residentTravelSegmentOffset(segment, pose.position);
  if (offset === null) throw new Error("native traveler body is not on its own exact route edge");
  const earlierLegs = commitment.porterRouteIds.slice(0, task.legIndex).reduce((total, id) => {
    const route = world.routes.find((candidate) => candidate.id === id);
    if (route === undefined) throw new Error("native itinerary lost a prior route");
    return total + (route.path.length - 1) * 1_000;
  }, 0);
  return earlierLegs + (task.waypointIndex - 1) * 1_000 + offset;
}

function boundedFineWork(human: ResidentState): number {
  const poses = human.activity!.poses;
  let distance = 0;
  for (let index = 1; index < poses.length; index += 1) {
    const delta = worldPositionDelta(poses[index - 1]!.position, poses[index]!.position);
    const units = Math.ceil(Math.hypot(delta.x, delta.y));
    expect(units).toBeLessThanOrEqual(RESIDENT_REST_APPROACH_STEP_UNITS);
    distance += units;
  }
  return distance;
}

/** Native cardinal center-to-center edges touch only their two actual tiles. */
function localTravelStepBound(world: WorldState, path: readonly number[], cargoAllowance: number): number {
  const sourceSpeed = (tileIndex: number): number => {
    const tile = world.terrain.tiles[tileIndex];
    if (tile === undefined) throw new Error("Native travel bound lost a real route tile");
    const speed = Math.floor(cargoAllowance * TERRAIN_DRAG_PERMILLE[tile.terrain] / 1_000);
    expect(speed).toBeGreaterThan(0);
    return speed;
  };
  return path.slice(1).reduce((steps, tileIndex, index) => steps
    + Math.ceil(1_000 / Math.min(sourceSpeed(path[index]!), sourceSpeed(tileIndex))), 0);
}

/**
 * Continue the native held record produced by ordinary travel below. Forecasts,
 * needs, routes, custody and bodies stay untouched. The first paid edge, not a
 * resumed event or ETA alone, is the bounded completion witness. This remains
 * headless runtime evidence, not physical shelter or a full four-leg delivery.
 */
async function continueNativeStormHold(record: SaveRecord): Promise<void> {
  const start = decode(record);
  const startWorld = deserializeWorld(start.world);
  const commitment = contract(startWorld, 127);
  const human = startWorld.residents.find(({ id }) => id === commitment.assignedResidentId)!;
  const actorId = human.identity.stableId;
  const firstForecast = startWorld.weather.nextChangeTick;
  // Existing keyed forecasts780/960 remain storms. The first naturally
  // clear forecast is1140; do not force the weather merely to obtain motion.
  const q = firstForecast + 2 * 180;
  expect(startWorld.meta.completedTick).toBe(724);
  expect(start.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
  expect(commitment).toMatchObject({ status: "in-transit", quantity: 8, cargoQuantity: 8,
    acceptedTick: 720, departedTick: 721, dueTick: 1_140 });
  expect(human.condition.sheltering).toBe(true);
  expect(human.activity?.travelTask).toMatchObject({ mode: "physical", phase: "waiting", waitReason: "weather-hold" });
  expect(routeDistance(startWorld, commitment, human)).toBe(0);
  expect(firstForecast).toBe(780);
  expect(q).toBe(1_140);
  const repository = new MemoryRepository(record);
  const runtime = await open(repository);
  await runtime.save();
  expect(authoritativeRoots(decode(repository.snapshot()))).toEqual(authoritativeRoots(start));
  const actualFrame = () => {
    const terrain = runtime.getRenderView().terrain;
    const origin = terrain.worldTileOrigin!;
    const frame = residentTravelInteractionFrame({ origin,
      terrain: { width: terrain.columns, height: terrain.rows } });
    if (frame === null) throw new Error("Current actual player window disappeared");
    return frame;
  };
  const outside = (world: WorldState) => commitment.porterRouteIds.every((id) => {
    const route = world.routes.find((candidate) => candidate.id === id)!;
    return route.path.every((index) => {
      const tile = world.terrain.tiles[index]!;
      return !residentTravelBodyIsLocal(actualFrame(),
        createWorldPosition({ x: 0, y: 0 }, tile.x * 1_000 + 500, tile.y * 1_000 + 500));
    });
  });
  expect(outside(startWorld)).toBe(true);
  const endTick = q + 45; // Max condition decay plus phase-zero preparation and closing work.
  const observationLimit = endTick - startWorld.meta.completedTick;
  const observations: {
    tick: number;
    weather: WorldState["weather"];
    condition: ResidentState["condition"];
    task: NonNullable<ResidentState["activity"]>["travelTask"];
    body: ReturnType<typeof worldPositionToGlobalFixed>;
    distance: number;
    paidUnits: number;
    allowance: number;
    events: WorldState["events"];
  }[] = [];
  let primary = true;
  let terminalDistance = 0;
  let resumedAtTick: number | null = null;
  const originalStep = simulation.stepWorld;
  const step = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
    const before = args[0];
    const beforeContract = contract(before, commitment.id);
    const beforeHuman = actor(before, actorId);
    const beforeDistance = routeDistance(before, beforeContract, beforeHuman);
    const result = originalStep(...args);
    if (primary) {
      if (observations.length >= observationLimit) throw new Error("Native continuation exceeded finite bound");
      const nextContract = contract(result, commitment.id);
      const nextHuman = actor(result, actorId);
      const distance = routeDistance(result, nextContract, nextHuman);
      const paidUnits = distance - beforeDistance;
      const allowance = residentTravelStepUnits(nextHuman.activity!, nextContract)! * 10;
      expect(paidUnits).toBeGreaterThanOrEqual(0);
      expect(paidUnits).toBeLessThanOrEqual(allowance);
      expect(nextContract).toMatchObject({ status: "in-transit", quantity: 8, cargoQuantity: 8,
        assignedResidentId: human.id, acceptedTick: 720, departedTick: 721, dueTick: 1_140 });
      expect(nextHuman.activeContractId).toBe(commitment.id);
      expect(outside(result)).toBe(true);
      const newEvents = result.events.filter(({ tick }) => tick === result.meta.completedTick);
      expect(newEvents.filter(({ type, subjectId }) =>
        (type === "contract-departed" || type === "contract-fulfilled") && subjectId === commitment.id)).toHaveLength(0);
      const resume = newEvents.filter(({ type, subjectId }) => type === "resident-resumed" && subjectId === human.id);
      if (resume.length > 0) {
        expect(resume).toHaveLength(1);
        expect(resumedAtTick).toBeNull();
        expect(resume[0]!.data).toMatchObject({ contractId: commitment.id });
        resumedAtTick = result.meta.completedTick;
      }
      if (result.meta.completedTick < q) {
        if (result.meta.completedTick < firstForecast) expect(result.weather).toEqual(startWorld.weather);
        else expect(result.weather.kind).toBe("storm");
        expect(nextHuman.condition.sheltering).toBe(true);
        expect(distance).toBe(0);
        expect(nextContract.arrivalTick).toBe(commitment.arrivalTick! + result.meta.completedTick - 724);
        expect(nextHuman.condition.routeDelayTicks).toBe(human.condition.routeDelayTicks + result.meta.completedTick - 724);
      }
      observations.push({ tick: result.meta.completedTick, weather: { ...result.weather },
        condition: { ...nextHuman.condition }, task: nextHuman.activity!.travelTask,
        body: worldPositionToGlobalFixed(nextHuman.activity!.poses.at(-1)!.position),
        distance, paidUnits, allowance,
        events: newEvents.filter(({ type, subjectId }) => type === "weather-changed"
          || subjectId === human.id || subjectId === commitment.id) });
      terminalDistance = distance;
      assertWorldInvariants(result);
    }
    return result;
  });
  const prefixSteps = (q - 724) * 10 - 1;
  advance(runtime, prefixSteps);
  await runtime.save();
  const prefixRecord = repository.snapshot();
  const prefix = decode(prefixRecord);
  const prefixWorld = deserializeWorld(prefix.world);
  expect(prefixWorld.meta.completedTick).toBe(q - 1);
  expect(prefix.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
  expect(actor(prefixWorld, actorId).condition.sheltering).toBe(true);
  expect(routeDistance(prefixWorld, contract(prefixWorld, commitment.id), actor(prefixWorld, actorId))).toBe(0);
  advance(runtime, 1);
  let closingSteps = 1;
  while (terminalDistance === 0 && runtime.getRenderView().tick < endTick) {
    advance(runtime, 10);
    closingSteps += 10;
  }
  await runtime.save();
  const terminalRecord = repository.snapshot();
  const terminal = decode(terminalRecord);
  const terminalWorld = deserializeWorld(terminal.world);
  const terminalHuman = actor(terminalWorld, actorId);
  const terminalContract = contract(terminalWorld, commitment.id);
  // A changed forecast is not recovery: both later storms retain the hold,
  // and real clear weather still waits for the existing cold threshold.
  expect(observations.filter(({ tick }) => [firstForecast, firstForecast + 180, q].includes(tick)))
    .toMatchObject([
      { tick: 780, weather: { kind: "storm", intensity: 341_013 }, distance: 0,
        condition: { sheltering: true } },
      { tick: 960, weather: { kind: "storm", intensity: 232_906 }, distance: 0,
        condition: { sheltering: true } },
      { tick: 1_140, weather: { kind: "clear", intensity: 122_375 }, distance: 0,
        condition: { sheltering: true, coldStress: 575_345 } },
    ]);
  expect(observations.find(({ tick }) => tick === q + 15)).toMatchObject({
    distance: 0, condition: { sheltering: true, coldStress: 335_345 },
    task: { phase: "waiting", waitReason: "weather-hold" },
  });
  expect(observations.find(({ tick }) => tick === q + 16)).toMatchObject({
    distance: 0, condition: { sheltering: false, coldStress: 319_345 },
    task: { phase: "waiting", waitReason: "weather-hold" },
  });
  expect(resumedAtTick).toBe(q + 16);
  expect(terminalWorld.meta.completedTick).toBe(q + 17);
  expect(terminalDistance).toBe(residentTravelStepUnits(terminalHuman.activity!, terminalContract)! * 10);
  expect(worldPositionDelta(human.activity!.poses.at(-1)!.position,
    terminalHuman.activity!.poses.at(-1)!.position)).toEqual({ x: 890, y: 0 });
  expect(terminalHuman.condition.sheltering).toBe(false);
  expect(terminalDistance).toBeGreaterThan(0);
  expect(terminalDistance).toBeLessThanOrEqual(residentTravelStepUnits(terminalHuman.activity!, terminalContract)! * 10);
  expect(terminalWorld.meta.completedTick).toBeGreaterThanOrEqual(q);
  expect(terminalWorld.meta.completedTick).toBeLessThanOrEqual(endTick);
  expect(terminalHuman.activity!.poses.at(-1)).not.toEqual(human.activity!.poses.at(-1));
  expect(terminalHuman.activity!.travelTask).toMatchObject({ mode: "physical", phase: "approaching", waitReason: null });
  expect(terminalContract).toMatchObject({ status: "in-transit", cargoQuantity: 8, quantity: 8, assignedResidentId: human.id });
  assertWorldInvariants(terminalWorld);
  close(runtime);
  primary = false;
  soundscapePlay.mockClear();
  const coldRepository = new MemoryRepository(prefixRecord);
  const cold = await open(coldRepository);
  await cold.save();
  expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(prefix));
  expect(soundscapePlay).not.toHaveBeenCalled();
  advance(cold, closingSteps);
  await cold.save();
  expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(terminal));
  close(cold);
  step.mockRestore();
}

/**
 * Native seed/offer/stock/routes and ordinary automatic selection. Only this
 * offer's exclusivity, quiet weather and declared need pressure are controlled.
 * Belonging urgency prevents unrelated service centering before acceptance;
 * the actual accepted Promise supplies its existing priority afterward.
 * No body, task, winner, terrain, route, stock, cargo or arrival is assigned.
 * The standard-pressure survey is only a candidate: runtime's actual wild
 * world must independently contain this offer and demonstrate the whole loop.
 */
async function nativeFixture(keepGeneratedNeeds = false) {
  const bootstrapRepository = new MemoryRepository();
  const bootstrap = await open(bootstrapRepository);
  bootstrap.dispatchUI({ type: "new-world", seed: "breathing room regional density 8",
    posture: "gale", sessionShape: "wander" });
  await bootstrap.save();
  const originalRecord = bootstrapRepository.snapshot();
  const envelope = decode(originalRecord);
  const world = deserializeWorld(envelope.world);
  expect(world.meta).toMatchObject({ seedText: "breathing room regional density 8", pressureMode: "wild", completedTick: 420 });
  expect(world.residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
  const commitment = world.contracts.find((candidate) => candidate.status === "offered"
    && candidate.originSettlementId === 6 && candidate.destinationSettlementId === 7 && candidate.resource === "food");
  if (commitment === undefined) throw new Error("Actual runtime wild seed has no native 6→7 food offer; do not fabricate one");
  expect(commitment).toMatchObject({ id: 133, quantity: 14, cargoQuantity: 0,
    carrierKind: null, assignedResidentId: null, acceptedTick: null, departedTick: null });
  // Predict only the future quantity already promised by this real offer;
  // the runtime must still perform its own pickup and derive actual work.
  const travelStepUnits = residentTravelStepUnits({ version: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION },
    { resource: commitment.resource, cargoQuantity: commitment.quantity });
  expect(travelStepUnits).toBe(91);
  const origin = world.settlements.find(({ id }) => id === commitment.originSettlementId)!;
  const destination = world.settlements.find(({ id }) => id === commitment.destinationSettlementId)!;
  const route = world.routes.find(({ id }) => id === commitment.routeId)!;
  expect(route).toMatchObject({ id: 126, fromSettlementId: 6, toSettlementId: 7 });
  expect(route.path).toHaveLength(64);
  const destinationTile = world.terrain.tiles[destination.tileIndex]!;
  const destinationPosition = createWorldPosition({ x: 0, y: 0 }, destinationTile.x * 1_000 + 500, destinationTile.y * 1_000 + 500);
  const savedTravel = JSON.parse(envelope.regionalTravel) as { origin: { x: number; y: number } };
  expect(savedTravel.origin).toEqual({ x: 18, y: -1 });
  expect(bootstrap.getRenderView().terrain).toMatchObject({ columns: REGIONAL_TRAVEL_COLUMNS,
    rows: REGIONAL_TRAVEL_ROWS, worldTileOrigin: savedTravel.origin });
  const frame = residentTravelInteractionFrame({ origin: savedTravel.origin,
    terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS } });
  if (frame === null) throw new Error("native runtime has no current physical interaction frame");
  expect(residentTravelBodyIsLocal(frame, destinationPosition)).toBe(false);
  const sources = new Map(world.residents.filter((human) => human.location.kind === "settlement"
    && human.location.settlementId === origin.id).map((human) => {
    const source = resolveResidentWorldPlacement(world, human)?.position;
    const target = residentSettlementRestTarget(world, human);
    if (source === undefined || target === null) throw new Error("native origin resident lost its source geometry");
    return [human.id, { actorId: human.identity.stableId, source, target }] as const;
  }));
  const native = { terrain: structuredClone(world.terrain), routes: structuredClone(world.routes),
    stocks: world.settlements.map(({ id, inventory }) => ({ id, inventory: structuredClone(inventory) })),
    ledger: structuredClone(world.ledger), needs: world.residents.map(({ id, needs }) => ({ id, needs: { ...needs } })) };
  const sourceStock = origin.inventory.food;
  expect(sourceStock).toBeGreaterThanOrEqual(commitment.quantity);
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: 1_420 };
  if (!keepGeneratedNeeds) {
    for (const human of world.residents) human.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
  } else expect(world.residents.map(({ id, needs }) => ({ id, needs }))).toEqual(native.needs);
  commitment.playerExclusiveUntilTick = world.meta.completedTick;
  expect(world.terrain).toEqual(native.terrain);
  expect(world.routes).toEqual(native.routes);
  expect(world.settlements.map(({ id, inventory }) => ({ id, inventory }))).toEqual(native.stocks);
  expect(world.ledger).toEqual(native.ledger);
  assertWorldInvariants(world);
  envelope.world = serializeWorld(world);
  envelope.integrity = gameSaveEnvelopeIntegrity(envelope);
  const prepared = { ...originalRecord, payloadVersion: envelope.version, worldJson: JSON.stringify(envelope) };
  close(bootstrap);
  const repository = new MemoryRepository(prepared);
  const runtime = await open(repository);
  return { runtime, repository, contractId: commitment.id, originId: origin.id, destinationId: destination.id,
    quantity: commitment.quantity, travelStepUnits: travelStepUnits!, sourceStock, sources, destinationPosition, frame,
    totalDistance: (route.path.length - 1) * 1_000, initialTick: world.meta.completedTick };
}

describe("ordinary runtime conserved resident travel", () => {
  it("contrasts a real physical pickup under clear and storm weather through the next service pulse", async () => {
    // Common fixture controls remain declared. Let production select, approach
    // and pick up before the fork; never assign a courier, task or success.
    const fixture = await nativeFixture(true);
    const { runtime, repository } = fixture;
    let picked: SaveRecord | undefined;
    for (let interval = 0; interval < 5; interval += 1) {
      advance(runtime, 10);
      await runtime.save();
      const record = repository.snapshot();
      const world = deserializeWorld(decode(record).world);
      if (contract(world, fixture.contractId).status === "in-transit") {
        picked = record;
        break;
      }
    }
    if (picked === undefined) throw new Error("Native preflight has no real pickup; do not author one");
    close(runtime);
    const initial = decode(picked);
    const initialWorld = deserializeWorld(initial.world);
    const commitment = contract(initialWorld, fixture.contractId);
    const courier = initialWorld.residents.find(({ id }) => id === commitment.assignedResidentId);
    if (courier === undefined) throw new Error("Actual pickup has no existing courier");
    expect(courier.activity?.travelTask).toMatchObject({ mode: "physical", phase: "approaching" });
    expect(commitment).toMatchObject({ cargoQuantity: fixture.quantity, resource: "food" });
    expect(initial.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    const pulseTick = Math.ceil((initialWorld.meta.completedTick + 1) / 60) * 60;
    const results: {
      weather: "clear" | "storm";
      earlyDistance: number;
      world: WorldState;
      foodUsed: number;
      waterUsed: number;
      materialUsers: string[];
      shelterEvents: number;
      expressionTriggers: string[];
      admittedHoldReceipts: string[];
      onsetHoldReceipts: string[];
    }[] = [];
    for (const weather of ["clear", "storm"] as const) {
      const envelope = structuredClone(initial);
      const source = deserializeWorld(envelope.world);
      source.weather = weather === "clear" ? { ...initialWorld.weather } : {
        kind: "storm", intensity: 950_000, windX: 500_000, windY: -500_000,
        nextChangeTick: initialWorld.weather.nextChangeTick,
      };
      expect({ ...source, weather: initialWorld.weather }).toEqual(initialWorld);
      envelope.world = serializeWorld(source);
      const branchRepository = new MemoryRepository(recordWith(picked, envelope));
      const branch = await open(branchRepository);
      const pulses: { input: rationPulse.ResidentRationPulseInput; output: rationPulse.ResidentRationsResult }[] = [];
      const materialUsers: string[] = [];
      const materialContributions: { settlementId: number; resource: string; progress: number }[] = [];
      const expressionTriggers = new Set<string>();
      let closing = false;
      let beforePulse: WorldState | undefined;
      let afterPulse: WorldState | undefined;
      const originalPulse = rationPulse.calculateResidentRationPulse;
      const pulseObserver = vi.spyOn(rationPulse, "calculateResidentRationPulse").mockImplementation((input) => {
        const output = originalPulse(input);
        if (closing) pulses.push({ input: structuredClone(input), output: structuredClone(output) });
        return output;
      });
      const originalMaterial = materialUse.selectResidentMaterialUser;
      const materialObserver = vi.spyOn(materialUse, "selectResidentMaterialUser").mockImplementation((...args) => {
        const selected = originalMaterial(...args);
        if (closing && selected !== null) {
          const site = args[0].settlements.find(({ id }) => id === args[1])!;
          expect(selected.activity?.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null,
            settlementId: site.id, projectId: site.project.id, resource: site.project.resource });
          expect(selected.activity?.poses.at(-1)?.position).toEqual(selected.activity!.materialTask!.target);
          materialUsers.push(selected.identity.stableId);
          materialContributions.push({ settlementId: site.id, resource: site.project.resource, progress: site.project.progress });
        }
        return selected;
      });
      const originalHold = weatherHoldExpression.residentWeatherHoldExpressionIntent;
      const holdObserver = vi.spyOn(weatherHoldExpression, "residentWeatherHoldExpressionIntent").mockImplementation((input) => {
        const intent = originalHold(input);
        if (intent?.sourceActorId === courier.identity.stableId) {
          expect(input.event).toMatchObject({ type: "resident-sheltered", subjectId: courier.id,
            data: { contractId: commitment.id, weather: "storm" } });
          expressionTriggers.add(intent.triggerEventId);
        }
        return intent;
      });
      const originalStep = simulation.stepWorld;
      const stepObserver = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
        closing = args[0].meta.completedTick + 1 === pulseTick;
        if (closing) beforePulse = structuredClone(args[0]);
        try {
          const output = originalStep(...args);
          if (closing) afterPulse = structuredClone(output);
          return output;
        } finally { closing = false; }
      });
      try {
        // Capture the pending onset at its first closure, before the next
        // interval consumes it. Empty receipts after20 steps aren't rejection.
        advance(branch, 10);
        await branch.save();
        const onsetCarry = decode(branchRepository.snapshot()).perceptionCarry as Envelope["perceptionCarry"] & {
          situatedExpressionAdmissions: SituatedExpressionAdmissionLedger;
        };
        const onsetHoldReceipts = onsetCarry.situatedExpressionAdmissions.records.filter((receipt) =>
          receipt.kind === "resident-weather-hold" && receipt.sourceActorId === courier.identity.stableId)
          .map(({ eventId }) => eventId);
        advance(branch, 10);
        await branch.save();
        const early = deserializeWorld(decode(branchRepository.snapshot()).world);
        const earlyCourier = actor(early, courier.identity.stableId);
        const earlyCommitment = contract(early, fixture.contractId);
        const earlyDistance = routeDistance(early, earlyCommitment, earlyCourier);
        expect(earlyCommitment).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity,
          assignedResidentId: courier.id, departedTick: commitment.departedTick });
        expect(earlyCourier.activity?.travelTask?.mode).toBe("physical");
        const earlyCarry = decode(branchRepository.snapshot()).perceptionCarry as Envelope["perceptionCarry"] & {
          situatedExpressionAdmissions: SituatedExpressionAdmissionLedger;
        };
        const admittedHoldReceipts = earlyCarry.situatedExpressionAdmissions.records.filter((receipt) =>
          receipt.kind === "resident-weather-hold" && receipt.sourceActorId === courier.identity.stableId)
          .map(({ eventId }) => eventId);
        advance(branch, (pulseTick - early.meta.completedTick) * 10);
        await branch.save();
        const world = deserializeWorld(decode(branchRepository.snapshot()).world);
        assertWorldInvariants(world);
        expect(world.meta.completedTick).toBe(pulseTick);
        if (beforePulse === undefined || afterPulse === undefined) throw new Error("No actual hourly world transaction");
        // These actual branches have no later transfer or project completion.
        // That fact makes the closing result a valid pulse accounting witness;
        // it is not a generic claim about the engine's downstream ordering.
        expect(afterPulse.events.filter(({ sequence, type }) => sequence >= beforePulse!.meta.nextEventSequence
          && (type === "contract-departed" || type === "contract-fulfilled" || type === "project-completed"))).toHaveLength(0);
        expect(pulses).toHaveLength(world.settlements.length);
        const growth = Math.trunc(34_000 * pressureMultiplier(world.meta.pressureMode) / FIXED_POINT);
        for (const [index, pulse] of pulses.entries()) {
          const { input, output } = pulse;
          const budget = Math.ceil(input.foodNeeds.length / 3);
          let usedGroups = 0;
          for (let start = 0; start < input.uses.length; start += 3) {
            if (input.uses.slice(start, start + 3).some(Boolean)) usedGroups += 1;
          }
          const foodAvailable = budget > 0 && input.foodStock >= budget;
          const waterAvailable = budget > 0 && input.freshWaterStock >= budget;
          expect(input.hungerGrowth).toBe(growth);
          expect(output).toEqual({
            foodConsumed: foodAvailable ? usedGroups : 0,
            freshWaterConsumed: waterAvailable ? usedGroups : 0,
            nextFoodNeeds: input.foodNeeds.map((need, member) => Math.max(0, Math.min(FIXED_POINT,
              need + growth - (input.uses[member] && foodAvailable ? 68_000 : 0)
              - (input.uses[member] && waterAvailable ? 8_000 : 0)))),
          });
          const settlement = afterPulse.settlements[index]!;
          const cohort = afterPulse.residents.filter((human) => human.location.kind === "settlement"
            && human.location.settlementId === settlement.id).sort((a, b) =>
              a.identity.stableId < b.identity.stableId ? -1 : a.identity.stableId > b.identity.stableId ? 1 : 0);
          expect(cohort.map(({ needs }) => needs.food)).toEqual(output.nextFoodNeeds);
          expect(settlement.inventory.food).toBe(input.foodStock - output.foodConsumed);
          expect(settlement.inventory.freshWater).toBe(input.freshWaterStock - output.freshWaterConsumed);
        }
        for (const id of materialUsers) expect(actor(afterPulse, id).activity?.materialTask)
          .toMatchObject({ phase: "used", usedAtTick: pulseTick });
        const expectedStocks = beforePulse.settlements.map(({ inventory }) => ({ ...inventory }));
        const expectedConsumed = { ...beforePulse.ledger.consumed };
        const expectedProduced = { ...beforePulse.ledger.produced };
        for (const [index, site] of beforePulse.settlements.entries()) {
          const stock = expectedStocks[index]!;
          for (const recipe of site.recipes) {
            if (recipe.nextRunTick > pulseTick || recipe.inputs.some(({ resource, amount }) => stock[resource] < amount)) continue;
            for (const { resource, amount } of recipe.inputs) { stock[resource] -= amount; expectedConsumed[resource] += amount; }
            for (const { resource, amount } of recipe.outputs) { stock[resource] += amount; expectedProduced[resource] += amount; }
          }
          const pulse = pulses[index]!;
          stock.food -= pulse.output.foodConsumed;
          stock.freshWater -= pulse.output.freshWaterConsumed;
          expectedConsumed.food += pulse.output.foodConsumed;
          expectedConsumed.freshWater += pulse.output.freshWaterConsumed;
          const contribution = materialContributions.find(({ settlementId }) => settlementId === site.id);
          if (contribution !== undefined) {
            expect(contribution.resource).toBe(site.project.resource);
            stock[site.project.resource] -= 1;
            expectedConsumed[site.project.resource] += 1;
            expect(afterPulse.settlements[index]!.project.progress).toBe(contribution.progress + 1);
          } else expect(afterPulse.settlements[index]!.project.progress).toBe(site.project.progress);
        }
        expect(afterPulse.settlements.map(({ inventory }) => inventory)).toEqual(expectedStocks);
        expect(afterPulse.ledger.consumed).toEqual(expectedConsumed);
        expect(afterPulse.ledger.produced).toEqual(expectedProduced);
        results.push({ weather, earlyDistance, world,
          foodUsed: pulses.reduce((sum, { output }) => sum + output.foodConsumed, 0),
          waterUsed: pulses.reduce((sum, { output }) => sum + output.freshWaterConsumed, 0),
          materialUsers, expressionTriggers: [...expressionTriggers], admittedHoldReceipts, onsetHoldReceipts,
          shelterEvents: world.events.filter(({ type, subjectId, tick }) =>
            type === "resident-sheltered" && subjectId === courier.id && tick > initialWorld.meta.completedTick).length });
      } finally {
        stepObserver.mockRestore();
        holdObserver.mockRestore();
        materialObserver.mockRestore();
        pulseObserver.mockRestore();
        close(branch);
      }
    }
    console.info("Native weather/service preflight", JSON.stringify(results.map(({ world, ...result }) => ({
      ...result, tick: world.meta.completedTick, commitment: contract(world, fixture.contractId),
      courier: actor(world, courier.identity.stableId).activity,
    }))));
    const clear = results[0]!;
    const storm = results[1]!;
    expect(clear.earlyDistance).toBeGreaterThan(storm.earlyDistance);
    expect(storm.shelterEvents).toBeGreaterThan(0);
    expect(clear.shelterEvents).toBe(0);
    expect(clear.expressionTriggers).toHaveLength(0);
    expect(storm.expressionTriggers).toHaveLength(1);
    expect(clear.onsetHoldReceipts).toHaveLength(0);
    expect(storm.onsetHoldReceipts).toHaveLength(1);
    expect(storm.admittedHoldReceipts).toHaveLength(0);
    expect(clear.foodUsed + clear.waterUsed + clear.materialUsers.length).toBeGreaterThan(0);
    expect(storm.foodUsed + storm.waterUsed + storm.materialUsers.length).toBe(0);
    for (const { world } of results) expect(contract(world, fixture.contractId)).toMatchObject({
      status: "in-transit", cargoQuantity: fixture.quantity, quantity: fixture.quantity,
      assignedResidentId: courier.id, carrierKind: "resident", departedTick: commitment.departedTick,
    });
    expect(actor(storm.world, courier.identity.stableId).activity?.travelTask)
      .toMatchObject({ mode: "physical", phase: "waiting", waitReason: "weather-hold" });
    // This preflight does not infer wet contact, downstream handoff, ordinary
    // player audibility, downstream handoff or whole mixed-row closure.
  }, 240_000);

  it("releases a native food courier into actual ration use with generated needs and equal cold continuation", async () => {
    // Weather/exclusivity retain the original fixture's declared controls;
    // generated needs, body, tasks, terrain, stocks and results are not assigned.
    const fixture = await nativeFixture(true);
    const { runtime, repository } = fixture;
    const originalStep = simulation.stepWorld;
    let actorId: string | null = null;
    let completedTick: number | null = null;
    let primary = true;
    let closingInput: WorldState | undefined;
    let closingOutput: WorldState | undefined;
    let observingRations = false;
    const pulses: rationPulse.ResidentRationPulseInput[] = [];
    const originalRationPulse = rationPulse.calculateResidentRationPulse;
    const rationObserver = vi.spyOn(rationPulse, "calculateResidentRationPulse").mockImplementation((input) => {
      if (observingRations) pulses.push(structuredClone(input));
      return originalRationPulse(input);
    });
    const departures = new Set<number>();
    const fulfillments = new Set<number>();
    const checkpoints = new Map<number, ResidentState>();
    const step = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      if (primary && args[0].meta.completedTick === 719) closingInput = structuredClone(args[0]);
      observingRations = primary && args[0].meta.completedTick === 719;
      let result: WorldState;
      try {
        result = originalStep(...args);
      } finally {
        observingRations = false;
      }
      if (!primary) return result;
      if (result.meta.completedTick === 720) closingOutput = structuredClone(result);
      const commitment = contract(result, fixture.contractId);
      if (commitment.assignedResidentId !== null) {
        const human = result.residents.find(({ id }) => id === commitment.assignedResidentId)!;
        actorId = human.identity.stableId;
        if (commitment.status === "fulfilled" && completedTick === null) completedTick = result.meta.completedTick;
        if ([497, 540, 541, 660, 661].includes(result.meta.completedTick)) {
          checkpoints.set(result.meta.completedTick, structuredClone(human));
        }
      }
      for (const event of result.events) {
        if (event.subjectId !== fixture.contractId) continue;
        if (event.type === "contract-departed") departures.add(event.sequence);
        if (event.type === "contract-fulfilled") fulfillments.add(event.sequence);
      }
      assertWorldInvariants(result);
      return result;
    });
    for (let interval = 0; interval < 180 && completedTick === null; interval += 1) advance(runtime, 10);
    expect(completedTick).toBe(496);
    if (actorId === null) throw new Error("Native delivery did not retain its actual courier");
    advance(runtime, 10);
    await runtime.save();
    const releasedRecord = repository.snapshot();
    const released = decode(releasedRecord);
    const assertReleased = (world: WorldState): void => {
      expect(contract(world, fixture.contractId)).toMatchObject({ status: "fulfilled", cargoQuantity: 0,
        completedTick, assignedResidentId: actor(world, actorId!).id });
      const human = actor(world, actorId!);
      expect(human.activeContractId).toBeNull();
      expect(human.location).toEqual({ kind: "settlement", settlementId: fixture.destinationId });
      expect(human.activity?.travelTask).toBeNull();
      expect(human.activity?.pickupTask).toBeNull();
      expect(human.activity?.poses.at(-1)?.position).toEqual(fixture.destinationPosition);
      assertWorldInvariants(world);
    };
    expect(deserializeWorld(released.world).meta.completedTick).toBe(497);
    assertReleased(deserializeWorld(released.world));
    expect(checkpoints.get(497)?.activity?.materialTask).toMatchObject({ phase: "arrived",
      projectId: 21, selectedAtTick: 496, usedAtTick: null });

    // Four observed hourly pulses are a finite seed-specific bound, not
    // assigned eligibility. Ordinary reassessment must remain free to abandon
    // the pending civic action before any contribution, then seek a ration.
    advance(runtime, (719 - 497) * 10 + 9);
    await runtime.save();
    const pendingRecord = repository.snapshot();
    const pending = decode(pendingRecord);
    expect(deserializeWorld(pending.world).meta.completedTick).toBe(719);
    expect(pending.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    assertReleased(deserializeWorld(pending.world));
    expect(checkpoints.get(540)).toMatchObject({ intention: "rest",
      activity: { materialTask: { phase: "arrived", usedAtTick: null } } });
    expect(checkpoints.get(541)?.activity?.materialTask).toBeNull();
    expect(checkpoints.get(660)).toMatchObject({ intention: "eat", needs: { food: 484_963, rest: 483_659 } });
    expect(checkpoints.get(661)?.activity?.rationTask).toMatchObject({ phase: "arrived",
      settlementId: fixture.destinationId, target: fixture.destinationPosition, selectedAtTick: 660,
      usedAtTick: null, foodUsed: false, waterUsed: false });
    advance(runtime, 1);
    await runtime.save();
    const usedRecord = repository.snapshot();
    const used = decode(usedRecord);
    const usedWorld = deserializeWorld(used.world);
    expect(usedWorld.meta.completedTick).toBe(720);
    expect(used.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    assertReleased(usedWorld);
    const user = actor(usedWorld, actorId);
    expect(user.activity?.rationTask).toMatchObject({ phase: "used", usedAtTick: 720,
      selectedAtTick: 660, target: fixture.destinationPosition, foodUsed: true, waterUsed: true });
    expect(user.needs.food).toBe(453_163);
    expect(closingInput).toBeDefined();
    expect(closingOutput).toBeDefined();
    const source = closingInput!;
    const committed = closingOutput!;
    expect(source.meta.completedTick).toBe(719);
    expect(committed.meta.completedTick).toBe(720);
    const priorUser = actor(source, actorId);
    expect(priorUser.activity?.rationTask).toMatchObject({ phase: "arrived", usedAtTick: null,
      foodUsed: false, waterUsed: false, selectedAtTick: 660, target: fixture.destinationPosition });
    expect(priorUser.activity?.poses.at(-1)?.position).toEqual(fixture.destinationPosition);
    expect(residentRestTargetHasDrySupport(committed, fixture.destinationPosition)).toBe(true);

    // The delivered food joins the existing aggregate pool, not a personal
    // parcel or independently identified meal. Keep every scheduled recipe
    // and other consumer enabled; independently account the complete cohort.
    const consumed = { food: 0, freshWater: 0 };
    const produced = { food: 0, freshWater: 0 };
    const growth = Math.trunc(34_000 * pressureMultiplier(source.meta.pressureMode) / FIXED_POINT);
    expect(pulses).toHaveLength(source.settlements.length);
    expect(committed.events.filter((event) => event.tick === 720 && event.type === "contract-fulfilled"
      && (event.data.resource === "food" || event.data.resource === "freshWater"))).toEqual([]);
    for (const [siteIndex, site] of source.settlements.entries()) {
      const next = committed.settlements.find(({ id }) => id === site.id)!;
      const stock = { ...site.inventory };
      for (const recipe of site.recipes) {
        if (recipe.nextRunTick > 720) continue;
        if (recipe.inputs.every(({ resource, amount }) => stock[resource] >= amount)) {
          for (const { resource, amount } of recipe.inputs) {
            stock[resource] -= amount;
            if (resource === "food" || resource === "freshWater") consumed[resource] += amount;
          }
          for (const { resource, amount } of recipe.outputs) {
            stock[resource] += amount;
            if (resource === "food" || resource === "freshWater") produced[resource] += amount;
          }
        }
        expect(next.recipes.find(({ id }) => id === recipe.id)?.nextRunTick)
          .toBe(recipe.nextRunTick + recipe.intervalTicks);
      }
      const present = source.residents.filter(({ location }) => location.kind === "settlement"
        && location.settlementId === site.id).sort((left, right) => left.identity.stableId < right.identity.stableId
          ? -1 : left.identity.stableId > right.identity.stableId ? 1 : 0);
      // Observe the real closing admission without replacing its calculation.
      // Later acceptance may lawfully clear another user's transient marker;
      // counting only surviving output labels would miss its committed debit.
      const pulse = pulses[siteIndex]!;
      expect(pulse).toMatchObject({ foodStock: stock.food, freshWaterStock: stock.freshWater, hungerGrowth: growth });
      expect(pulse.foodNeeds).toEqual(present.map(({ needs }) => needs.food));
      expect(pulse.uses).toHaveLength(present.length);
      const users = new Set(present.filter((_human, index) => pulse.uses[index])
        .map(({ identity }) => identity.stableId));
      const budget = Math.ceil(present.length / 3);
      const food = budget > 0 && stock.food >= budget;
      const water = budget > 0 && stock.freshWater >= budget;
      let groups = 0;
      for (let start = 0; start < present.length; start += 3) {
        if (present.slice(start, start + 3).some(({ identity }) => users.has(identity.stableId))) groups += 1;
      }
      const foodDebit = food ? groups : 0;
      const waterDebit = water ? groups : 0;
      consumed.food += foodDebit;
      consumed.freshWater += waterDebit;
      for (const prior of present) {
        const nextHuman = actor(committed, prior.identity.stableId);
        const relief = users.has(prior.identity.stableId) ? (food ? 68_000 : 0) + (water ? 8_000 : 0) : 0;
        expect(nextHuman.needs.food).toBe(Math.max(0, Math.min(FIXED_POINT, prior.needs.food + growth - relief)));
        if (relief > 0) {
          expect(prior.activity?.rationTask).toMatchObject({ phase: "arrived", usedAtTick: null,
            settlementId: site.id, foodUsed: false, waterUsed: false });
          expect(prior.activity!.rationTask!.selectedAtTick).toBeLessThan(720);
          expect(prior.activity?.poses.at(-1)?.position).toEqual(prior.activity!.rationTask!.target);
          if (nextHuman.activity?.rationTask === null) {
            expect(nextHuman.activeContractId).not.toBeNull();
            expect(contract(committed, nextHuman.activeContractId!)).toMatchObject({ status: "accepted", acceptedTick: 720 });
          } else expect(nextHuman.activity?.rationTask).toMatchObject({ phase: "used", usedAtTick: 720,
            foodUsed: food, waterUsed: water });
        }
      }
      expect(["food", "freshWater"]).not.toContain(site.project.resource);
      if (site.id === fixture.destinationId) {
        expect(users.has(actorId)).toBe(true);
        expect(foodDebit).toBeGreaterThan(0);
        expect(waterDebit).toBeGreaterThan(0);
        const transfers = committed.events.filter((event) => event.tick === 720
          && (event.type === "contract-departed" || event.type === "contract-fulfilled"))
          .map(({ subjectId }) => {
            if (subjectId === null) throw new Error("Native contract transfer lacks its conserved owner");
            return contract(committed, subjectId);
          })
          .filter((entry) => (entry.originSettlementId === site.id || entry.destinationSettlementId === site.id)
            && (entry.resource === "food" || entry.resource === "freshWater"));
        expect(transfers).toEqual([]);
        expect(next.inventory.food).toBe(stock.food - foodDebit);
        expect(next.inventory.freshWater).toBe(stock.freshWater - waterDebit);
      }
    }
    for (const resource of ["food", "freshWater"] as const) {
      expect(committed.ledger.consumed[resource] - source.ledger.consumed[resource]).toBe(consumed[resource]);
      expect(committed.ledger.produced[resource] - source.ledger.produced[resource]).toBe(produced[resource]);
    }
    expect(usedWorld.ledger).toEqual(committed.ledger);
    expect(usedWorld.settlements).toEqual(committed.settlements);
    expect(departures.size).toBe(1);
    expect(fulfillments.size).toBe(1);

    advance(runtime, 10);
    await runtime.save();
    const continued = decode(repository.snapshot());
    expect(deserializeWorld(continued.world).meta.completedTick).toBe(721);
    assertReleased(deserializeWorld(continued.world));
    expect(actor(deserializeWorld(continued.world), actorId).activity?.rationTask).toBeNull();
    expect(departures.size).toBe(1);
    expect(fulfillments.size).toBe(1);
    close(runtime);
    primary = false;

    // Same accepted work from a detached post-release save must reach the
    // complete phase9 roots, then the same committed consumer and next state.
    const releasedRepository = new MemoryRepository(releasedRecord);
    const coldReleased = await open(releasedRepository);
    await coldReleased.save();
    expect(authoritativeRoots(decode(releasedRepository.snapshot()))).toEqual(authoritativeRoots(released));
    advance(coldReleased, (719 - 497) * 10 + 9);
    await coldReleased.save();
    expect(authoritativeRoots(decode(releasedRepository.snapshot()))).toEqual(authoritativeRoots(pending));
    advance(coldReleased, 1);
    await coldReleased.save();
    expect(authoritativeRoots(decode(releasedRepository.snapshot()))).toEqual(authoritativeRoots(used));
    advance(coldReleased, 10);
    await coldReleased.save();
    expect(authoritativeRoots(decode(releasedRepository.snapshot()))).toEqual(authoritativeRoots(continued));
    close(coldReleased);

    for (const [record, before, count, after] of [
      [pendingRecord, pending, 1, used], [usedRecord, used, 10, continued],
    ] as const) {
      soundscapePlay.mockClear();
      const coldRepository = new MemoryRepository(record);
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(before));
      expect(soundscapePlay).not.toHaveBeenCalled();
      advance(cold, count);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(after));
      close(cold);
    }
    step.mockRestore();
    rationObserver.mockRestore();
  }, 480_000);

  it("automatically picks up a native offer, walks its local route, continues outside the window and hands off once with equal cold work", async () => {
    const fixture = await nativeFixture();
    const { runtime, repository } = fixture;
    const originalStep = simulation.stepWorld;
    const departures = new Set<number>();
    const fulfillments = new Set<number>();
    const primaryTrace: { tick: number; distance: number; local: boolean; macroUnits: number }[] = [];
    let actorId: string | null = null;
    let primary = true;
    let attemptingMacroRollback = false;
    let attemptedMacroRollback = false;
    const observed: { completedTick: number | null; lastStatus: ContractState["status"] } = {
      completedTick: null, lastStatus: "offered",
    };
    const step = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const world = args[0];
      const before = contract(world, fixture.contractId);
      const beforeStatus = before.status;
      const beforeCargo = before.cargoQuantity;
      const beforeOriginStock = world.settlements.find(({ id }) => id === fixture.originId)!.inventory.food;
      const beforeDestinationStock = world.settlements.find(({ id }) => id === fixture.destinationId)!.inventory.food;
      const beforeTrust = world.settlements.find(({ id }) => id === fixture.originId)!.trust
        .find(({ settlementId }) => settlementId === fixture.destinationId)!.value;
      const beforeHuman = actorId === null ? undefined : actor(world, actorId);
      const beforeDistance = beforeStatus === "in-transit" && beforeHuman !== undefined
        ? routeDistance(world, before, beforeHuman) : null;
      const fineUnits = beforeDistance === null ? 0 : boundedFineWork(beforeHuman!);
      const result = originalStep(...args);
      const after = contract(result, fixture.contractId);
      if (attemptingMacroRollback) {
        expect(beforeStatus).toBe("in-transit");
        expect(after.status).toBe("in-transit");
        expect(beforeDistance).not.toBeNull();
        expect(routeDistance(result, after, actor(result, actorId!))).toBeGreaterThan(beforeDistance!);
        attemptedMacroRollback = true;
      }
      if (!primary) return result;
      observed.lastStatus = after.status;
      for (const event of result.events) {
        if (event.subjectId !== fixture.contractId) continue;
        if (event.type === "contract-departed") departures.add(event.sequence);
        if (event.type === "contract-fulfilled") fulfillments.add(event.sequence);
      }
      if (beforeStatus === "accepted" && after.status === "in-transit") {
        expect(after.cargoQuantity).toBe(fixture.quantity);
        expect(result.settlements.find(({ id }) => id === fixture.originId)!.inventory.food)
          .toBe(beforeOriginStock - fixture.quantity);
      }
      if (after.status === "in-transit" || (beforeStatus === "in-transit" && after.status === "fulfilled")) {
        if (actorId === null) throw new Error("native departure has no actual observed automatic winner");
        const human = actor(result, actorId);
        const pose = human.activity!.poses.at(-1)!;
        const distance = after.status === "fulfilled" ? fixture.totalDistance : routeDistance(result, after, human);
        const macroUnits = beforeDistance === null ? 0 : distance - beforeDistance;
        expect(macroUnits).toBeGreaterThanOrEqual(0);
        expect(macroUnits + fineUnits).toBeLessThanOrEqual(10 * RESIDENT_REST_APPROACH_STEP_UNITS);
        expect(macroUnits + fineUnits).toBeLessThanOrEqual(10 * fixture.travelStepUnits);
        if (after.status === "in-transit") expect(human.activity?.travelTask?.mode).toBe("physical");
        const previous = primaryTrace.at(-1);
        if (previous !== undefined) {
          expect(distance).toBeGreaterThanOrEqual(previous.distance);
          expect(distance - previous.distance).toBeLessThanOrEqual(10 * RESIDENT_REST_APPROACH_STEP_UNITS);
          expect(distance - previous.distance).toBeLessThanOrEqual(10 * fixture.travelStepUnits);
        }
        primaryTrace.push({ tick: result.meta.completedTick, distance,
          local: residentTravelBodyIsLocal(fixture.frame, pose.position), macroUnits });
        if (after.status === "fulfilled") {
          observed.completedTick = result.meta.completedTick;
          expect(beforeCargo).toBe(fixture.quantity);
          expect(after.cargoQuantity).toBe(0);
          expect(result.settlements.find(({ id }) => id === fixture.destinationId)!.inventory.food)
            .toBe(beforeDestinationStock + fixture.quantity);
          expect(result.settlements.find(({ id }) => id === fixture.originId)!.trust
            .find(({ settlementId }) => settlementId === fixture.destinationId)!.value).toBeGreaterThan(beforeTrust);
          expect(after.deliveryTraceCost).toBeGreaterThan(0);
          expect(human.activeContractId).toBeNull();
          expect(human.location).toEqual({ kind: "settlement", settlementId: fixture.destinationId });
          expect(human.activity?.travelTask).toBeNull();
          expect(pose.position).toEqual(fixture.destinationPosition);
        }
      }
      assertWorldInvariants(result);
      return result;
    });

    advance(runtime, 10);
    await runtime.save();
    const accepted = decode(repository.snapshot());
    const acceptedWorld = deserializeWorld(accepted.world);
    const acceptedContract = contract(acceptedWorld, fixture.contractId);
    expect(acceptedContract).toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null,
      carrierKind: "resident", acceptedTick: fixture.initialTick + 1 });
    const source = acceptedContract.assignedResidentId === null ? undefined : fixture.sources.get(acceptedContract.assignedResidentId);
    if (source === undefined) throw new Error("actual automatic winner is not an existing native origin resident");
    actorId = source.actorId;
    const acceptedHuman = actor(acceptedWorld, actorId);
    expect(acceptedHuman.activity?.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
    expect(acceptedHuman.activity?.poses[0]?.position).toEqual(source.source);
    expect(acceptedHuman.activity?.pickupTask).toMatchObject({ contractId: fixture.contractId, phase: "approaching", target: source.target });
    expect(acceptedHuman.activity?.travelTask).toBeNull();
    expect(worldPositionDelta(source.source, source.target)).not.toEqual({ x: 0, y: 0 });
    expect(residentRestTargetHasDrySupport(acceptedWorld, source.source)).toBe(true);
    expect(residentRestTargetHasDrySupport(acceptedWorld, source.target)).toBe(true);
    expect(acceptedWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory.food).toBe(fixture.sourceStock);
    expect(departures.size).toBe(0);

    let picked: Envelope | null = null;
    for (let interval = 0; interval < 4; interval += 1) {
      advance(runtime, 10);
      await runtime.save();
      const candidate = decode(repository.snapshot());
      const candidateWorld = deserializeWorld(candidate.world);
      if (contract(candidateWorld, fixture.contractId).status === "in-transit") {
        picked = candidate;
        break;
      }
      expect(contract(candidateWorld, fixture.contractId)).toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
      expect(candidateWorld.settlements.find(({ id }) => id === fixture.originId)!.inventory.food).toBe(fixture.sourceStock);
    }
    if (picked === null) throw new Error("native automatic winner did not genuinely reach and pick up its source within four intervals");
    const pickedWorld = deserializeWorld(picked.world);
    const pickedContract = contract(pickedWorld, fixture.contractId);
    const pickedHuman = actor(pickedWorld, actorId);
    expect(pickedContract).toMatchObject({ cargoQuantity: fixture.quantity,
      porterRouteIds: [126], porterSettlementIds: [6, 7] });
    expect(pickedHuman.activity?.poses[0]?.position).toEqual(source.target);
    expect(pickedHuman.activity?.pickupTask).toBeNull();
    expect(pickedHuman.activity?.travelTask).toMatchObject({ mode: "physical", kind: "contract-travel",
      contractId: fixture.contractId, legIndex: 0, waypointIndex: 1, phase: "approaching" });
    expect(routeDistance(pickedWorld, pickedContract, pickedHuman)).toBe(0);
    expect(departures.size).toBe(1);
    expect(fulfillments.size).toBe(0);

    const coldRecords = new Map<number, SaveRecord>();
    const partials = new Map<number, Envelope>();
    for (const [phase, steps] of [[4, 4], [9, 5]] as const) {
      advance(runtime, steps);
      await runtime.save();
      const record = repository.snapshot();
      const middle = decode(record);
      const world = deserializeWorld(middle.world);
      const human = actor(world, actorId);
      expect(middle.perceptionCarry.playerStepsSinceWorldTick).toBe(phase);
      expect(world.meta.completedTick).toBe(pickedWorld.meta.completedTick);
      expect(human.activity?.poses).toHaveLength(phase + 1);
      expect(human.activity?.poses[0]?.position).toEqual(source.target);
      expect(human.activity?.poses.at(-1)?.position).not.toEqual(source.target);
      expect(human.activity?.travelTask).toMatchObject({ mode: "physical", legIndex: 0, waypointIndex: 1 });
      expect(routeDistance(world, contract(world, fixture.contractId), human)).toBeGreaterThan(0);
      expect(boundedFineWork(human)).toBeLessThanOrEqual(phase * RESIDENT_REST_APPROACH_STEP_UNITS);
      expect(contract(world, fixture.contractId)).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity });
      coldRecords.set(phase, record);
      partials.set(phase, middle);
    }

    let macroRecord: SaveRecord | null = null;
    let macroReference: Envelope | null = null;
    advance(runtime, 1);
    const route = pickedWorld.routes.find(({ id }) => id === pickedContract.porterRouteIds[0])!;
    const geometricIntervals = Math.ceil(localTravelStepBound(pickedWorld, route.path, fixture.travelStepUnits) / 10) + 2;
    const finalLimit = pickedWorld.meta.completedTick + Math.max(120, geometricIntervals);
    while (observed.lastStatus !== "fulfilled" && runtime.getRenderView().tick < finalLimit) {
      if (macroRecord === null && primaryTrace.at(-1)?.local === false) {
        // Retain a real off-window phase9 prefix before its next macro commit.
        // Neither a task/body nor a successful transport result is injected.
        advance(runtime, 9);
        await runtime.save();
        macroRecord = repository.snapshot();
        expect(decode(macroRecord).perceptionCarry.playerStepsSinceWorldTick).toBe(9);
        advance(runtime, 1);
        await runtime.save();
        macroReference = decode(repository.snapshot());
      } else advance(runtime, 10);
    }
    if (observed.completedTick === null) throw new Error(`Native journey did not hand off by tick${finalLimit}; retained status is ${observed.lastStatus}`);
    const completedTick = observed.completedTick;
    expect(completedTick).toBeGreaterThan(pickedContract.arrivalTick!);
    expect(primaryTrace.some(({ tick, distance }) => tick >= pickedContract.arrivalTick! && distance < fixture.totalDistance)).toBe(true);
    expect(primaryTrace.some(({ local, distance }) => local && distance > 0)).toBe(true);
    expect(primaryTrace.some(({ local, macroUnits }) => !local && macroUnits > 0)).toBe(true);
    expect(primaryTrace.at(-1)?.distance).toBe(fixture.totalDistance);
    expect(departures.size).toBe(1);
    expect(fulfillments.size).toBe(1);
    advance(runtime, 10);
    await runtime.save();
    const terminal = decode(repository.snapshot());
    const terminalWorld = deserializeWorld(terminal.world);
    expect(terminalWorld.meta.completedTick).toBe(completedTick + 1);
    expect(contract(terminalWorld, fixture.contractId)).toMatchObject({ status: "fulfilled", cargoQuantity: 0, completedTick });
    expect(actor(terminalWorld, actorId).activeContractId).toBeNull();
    expect(actor(terminalWorld, actorId).activity?.travelTask).toBeNull();
    expect(actor(terminalWorld, actorId).activity?.poses[0]?.position).toEqual(fixture.destinationPosition);
    expect(JSON.parse(terminal.regionalTravel).origin).toEqual(JSON.parse(picked.regionalTravel).origin);
    expect(runtime.getRenderView().terrain).toMatchObject({ columns: REGIONAL_TRAVEL_COLUMNS,
      rows: REGIONAL_TRAVEL_ROWS });
    expect(departures.size).toBe(1);
    expect(fulfillments.size).toBe(1);
    assertWorldInvariants(terminalWorld);
    close(runtime);
    primary = false;

    // Economical exact-work chain: cold phase4 joins the exact phase9 roots;
    // that detached phase9 then reaches the same complete terminal roots.
    const phase4Repository = new MemoryRepository(coldRecords.get(4)!);
    const phase4 = await open(phase4Repository);
    await phase4.save();
    expect(authoritativeRoots(decode(phase4Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(4)!));
    advance(phase4, 5);
    await phase4.save();
    expect(authoritativeRoots(decode(phase4Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(9)!));
    close(phase4);

    const phase9Repository = new MemoryRepository(coldRecords.get(9)!);
    const phase9 = await open(phase9Repository);
    await phase9.save();
    expect(authoritativeRoots(decode(phase9Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(9)!));
    const remainingSteps = (terminalWorld.meta.completedTick - pickedWorld.meta.completedTick) * 10 - 9;
    advance(phase9, remainingSteps);
    await phase9.save();
    expect(authoritativeRoots(decode(phase9Repository.snapshot()))).toEqual(authoritativeRoots(terminal));
    close(phase9);

    if (macroRecord === null || macroReference === null) throw new Error("Native route never supplied its actual macro rollback boundary");
    const macroBefore = decode(macroRecord);
    const failedRepository = new MemoryRepository(macroRecord);
    const failed = await open(failedRepository);
    await failed.save();
    expect(authoritativeRoots(decode(failedRepository.snapshot()))).toEqual(authoritativeRoots(macroBefore));
    const closure = vi.spyOn(situatedExpressionChannelBank, "closeSituatedExpressionChannelBankInterval")
      .mockReturnValueOnce(null);
    soundscapePlay.mockClear();
    attemptingMacroRollback = true;
    advance(failed, 1, false);
    attemptingMacroRollback = false;
    expect(attemptedMacroRollback).toBe(true);
    expect(closure).toHaveBeenCalled();
    expect(failed.getUIView().announcement?.message).toContain("INTEGRITY HALT");
    expect(soundscapePlay.mock.calls).toEqual([["warning", 1]]);
    await failed.save();
    const rollbackRecord = failedRepository.snapshot();
    expect(authoritativeRoots(decode(rollbackRecord))).toEqual(authoritativeRoots(macroBefore));
    closure.mockRestore();
    close(failed);

    // Failed candidate custody is not reusable. Cold recovery must obtain a
    // fresh closing admission and equal the independently accepted reference.
    const retryRepository = new MemoryRepository(rollbackRecord);
    const retry = await open(retryRepository);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(macroBefore));
    advance(retry, 1);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(macroReference));
    step.mockRestore();
  }, 180_000);

  it("holds the same native cargo and body past ETA, reenters through ordinary player motion and retries with equal cold work", async () => {
    const fixture = await nativeFixture();
    const { runtime, repository } = fixture;
    advance(runtime, 10);
    await runtime.save();
    const accepted = deserializeWorld(decode(repository.snapshot()).world);
    const acceptedContract = contract(accepted, fixture.contractId);
    expect(acceptedContract).toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
    if (acceptedContract.assignedResidentId === null) throw new Error("Native acceptance did not choose a courier");
    const residentId = acceptedContract.assignedResidentId;
    const source = fixture.sources.get(residentId);
    if (source === undefined) throw new Error("Automatic winner is not a native source resident");
    // Follow the production selector's native winner, not the earlier route
    // survey's candidate; no resident assignment is controlled by this test.
    const actorId = source.actorId;
    const originalStep = simulation.stepWorld;
    const observed = { offWindow: false };
    const step = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const result = originalStep(...args);
      const commitment = contract(result, fixture.contractId);
      const human = actor(result, actorId);
      if (commitment.status === "in-transit"
        && !residentTravelBodyIsLocal(fixture.frame, human.activity!.poses.at(-1)!.position)) {
        observed.offWindow = true;
      }
      return result;
    });
    // Follow the native prefix before controlling only route availability.
    // The original test above separately owns uninterrupted macro rollback.
    for (let interval = 0; interval < 120 && !observed.offWindow; interval += 1) advance(runtime, 10);
    expect(observed.offWindow).toBe(true);
    await runtime.save();
    const offWindowRecord = repository.snapshot();
    const offWindowEnvelope = decode(offWindowRecord);
    const offWindow = deserializeWorld(offWindowEnvelope.world);
    expect(offWindowEnvelope.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    const traveling = contract(offWindow, fixture.contractId);
    const nativeHuman = actor(offWindow, actorId);
    expect(traveling).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity,
      carrierKind: "resident", assignedResidentId: residentId, porterRouteIds: [126] });
    expect(nativeHuman.activity?.travelTask).toMatchObject({ mode: "physical", phase: "approaching" });
    const heldPose = nativeHuman.activity!.poses[0]!;
    const originalBody = structuredClone(nativeHuman.activity);
    const heldLocation = structuredClone(nativeHuman.location);
    const heldDistance = routeDistance(offWindow, traveling, nativeHuman);
    const heldTask = nativeHuman.activity!.travelTask;
    if (heldTask?.mode !== "physical") throw new Error("Native journey has no physical cursor");
    expect(residentTravelBodyIsLocal(fixture.frame, heldPose.position)).toBe(false);
    expect(heldDistance).toBeGreaterThan(0);
    const nativeRoute = offWindow.routes.find(({ id }) => id === 126)!;
    expect(routeIsActive(nativeRoute)).toBe(true);
    const originalTrace = nativeRoute.traceStrength;
    close(runtime);
    step.mockRestore();

    // Explicit environment-availability input, not a player repair operation.
    // Keep native path, terrain, stock, identity, custody, body and task intact.
    nativeRoute.traceStrength = 0;
    expect(routeIsActive(nativeRoute)).toBe(false);
    expect(actor(offWindow, actorId).activity).toEqual(originalBody);
    assertWorldInvariants(offWindow);
    offWindowEnvelope.world = serializeWorld(offWindow);
    const blockedInput = recordWith(offWindowRecord, offWindowEnvelope);
    const blockedRepository = new MemoryRepository(blockedInput);
    const blocked = await open(blockedRepository);
    await blocked.save();
    expect(authoritativeRoots(decode(blockedRepository.snapshot()))).toEqual(authoritativeRoots(offWindowEnvelope));

    const expectHeld = (world: WorldState): void => {
      const commitment = contract(world, fixture.contractId);
      const human = actor(world, actorId);
      expect(commitment).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity,
        carrierKind: "resident", assignedResidentId: residentId, departedTick: traveling.departedTick,
        arrivalTick: traveling.arrivalTick, completedTick: null });
      expect(human.activeContractId).toBe(fixture.contractId);
      expect(human.identity.stableId).toBe(actorId);
      expect(human.activity?.poses.length).toBeGreaterThan(0);
      for (const pose of human.activity!.poses) expect(pose).toEqual(heldPose);
      expect(human.location).toEqual(heldLocation);
      expect(routeDistance(world, commitment, human)).toBe(heldDistance);
      expect(human.activity?.travelTask).toMatchObject({ mode: "physical", contractId: fixture.contractId,
        legIndex: heldTask.legIndex, waypointIndex: heldTask.waypointIndex,
        selectedAtTick: heldTask.selectedAtTick, lastProgressAtTick: heldTask.lastProgressAtTick,
        phase: "waiting", waitReason: "no-active-route" });
      expect(world.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === fixture.contractId)).toHaveLength(1);
      expect(world.events.filter(({ type, subjectId }) => type === "contract-fulfilled" && subjectId === fixture.contractId)).toHaveLength(0);
      assertWorldInvariants(world);
    };

    advance(blocked, 10);
    await blocked.save();
    const held = deserializeWorld(decode(blockedRepository.snapshot()).world);
    expectHeld(held);
    expect(held.meta.completedTick).toBeGreaterThan(traveling.arrivalTick!);
    const startView = blocked.getRenderView();
    const startOrigin = startView.terrain.worldTileOrigin;
    if (startOrigin === undefined) throw new Error("Native player has no regional frame");
    const initialPlayerX = startOrigin.x + startView.player.position.x / startView.terrain.tileSize;
    const initialPlayerY = startOrigin.y + startView.player.position.y / startView.terrain.tileSize;
    expect(startOrigin).toEqual({ x: 18, y: -1 });
    expect(Math.floor(initialPlayerX)).toBe(78);
    expect(Math.floor(initialPlayerY)).toBe(59);
    blocked.dispatchRenderer({ type: "movement", vector: { x: -1, y: 0 } });
    let movingSteps = 0;
    while (blocked.getRenderView().terrain.worldTileOrigin?.x === 18 && movingSteps < 200) {
      advance(blocked, 1);
      movingSteps += 1;
    }
    blocked.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    expect(movingSteps).toBeGreaterThan(0);
    expect(movingSteps).toBeLessThan(200);
    const movedView = blocked.getRenderView();
    const movedOrigin = movedView.terrain.worldTileOrigin;
    expect(movedOrigin).toEqual({ x: 2, y: -1 });
    expect(movedView.terrain).toMatchObject({ columns: 120, rows: 120 });
    expect(movedOrigin!.x + movedView.player.position.x / movedView.terrain.tileSize).toBeLessThan(70);
    expect(movedOrigin!.y + movedView.player.position.y / movedView.terrain.tileSize).toBe(initialPlayerY);
    await blocked.save();
    const rebased = decode(blockedRepository.snapshot());
    expectHeld(deserializeWorld(rebased.world));
    expect(JSON.parse(rebased.regionalTravel).origin).toEqual(movedOrigin);
    const actualFrame = residentTravelInteractionFrame({ origin: movedOrigin!,
      terrain: { width: movedView.terrain.columns, height: movedView.terrain.rows } });
    if (actualFrame === null) throw new Error("Ordinary player motion did not supply a physical frame");
    expect(residentTravelBodyIsLocal(actualFrame, heldPose.position)).toBe(true);
    // Physical admission is not direct sight; the test grants no observation,
    // actor identification or player knowledge for this distant traveler.
    const remaining = (10 - rebased.perceptionCarry.playerStepsSinceWorldTick) % 10;
    if (remaining > 0) advance(blocked, remaining);
    await blocked.save();
    const readyRecord = blockedRepository.snapshot();
    const ready = decode(readyRecord);
    const readyWorld = deserializeWorld(ready.world);
    expect(ready.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expectHeld(readyWorld);
    expect(readyWorld.routes.find(({ id }) => id === 126)?.traceStrength).toBe(0);
    close(blocked);

    // Restore only the saved native availability, never the task, body, clock,
    // successful work or an imagined physical repair receipt.
    const readyBody = structuredClone(actor(readyWorld, actorId).activity);
    readyWorld.routes.find(({ id }) => id === 126)!.traceStrength = originalTrace;
    expect(routeIsActive(readyWorld.routes.find(({ id }) => id === 126)!)).toBe(true);
    expect(actor(readyWorld, actorId).activity).toEqual(readyBody);
    assertWorldInvariants(readyWorld);
    ready.world = serializeWorld(readyWorld);
    const retryRepository = new MemoryRepository(recordWith(readyRecord, ready));
    const retry = await open(retryRepository);
    await retry.save();
    expect(authoritativeRoots(decode(retryRepository.snapshot()))).toEqual(authoritativeRoots(ready));
    advance(retry, 9);
    await retry.save();
    const duePrefix = decode(retryRepository.snapshot());
    expect(duePrefix.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expectHeld(deserializeWorld(duePrefix.world));
    advance(retry, 1);
    await retry.save();
    const reassessed = deserializeWorld(decode(retryRepository.snapshot()).world);
    expect(reassessed.meta.completedTick).toBe(readyWorld.meta.completedTick + 1);
    const reassessedHuman = actor(reassessed, actorId);
    expect(reassessedHuman.activity?.poses[0]).toEqual(heldPose);
    expect(reassessedHuman.location).toEqual(heldLocation);
    expect(reassessedHuman.activity?.travelTask).toMatchObject({ mode: "physical", phase: "approaching",
      waitReason: null, selectedAtTick: heldTask.selectedAtTick,
      legIndex: heldTask.legIndex, waypointIndex: heldTask.waypointIndex });
    expect(contract(reassessed, fixture.contractId).cargoQuantity).toBe(fixture.quantity);

    const coldRecords = new Map<number, SaveRecord>();
    const partials = new Map<number, Envelope>();
    for (const [phase, count] of [[4, 4], [9, 5]] as const) {
      advance(retry, count);
      await retry.save();
      const record = retryRepository.snapshot();
      const envelope = decode(record);
      const world = deserializeWorld(envelope.world);
      const human = actor(world, actorId);
      expect(envelope.perceptionCarry.playerStepsSinceWorldTick).toBe(phase);
      expect(human.activity?.poses).toHaveLength(phase + 1);
      expect(human.activity?.poses[0]).toEqual(heldPose);
      expect(human.activity?.poses.at(-1)?.position).not.toEqual(heldPose.position);
      expect(residentTravelBodyIsLocal(actualFrame, human.activity!.poses.at(-1)!.position)).toBe(true);
      expect(boundedFineWork(human)).toBeGreaterThan(0);
      expect(routeDistance(world, contract(world, fixture.contractId), human)).toBeGreaterThan(heldDistance);
      expect(routeDistance(world, contract(world, fixture.contractId), human) - heldDistance)
        .toBeLessThanOrEqual(phase * RESIDENT_REST_APPROACH_STEP_UNITS);
      expect(human.activity?.travelTask).toMatchObject({ mode: "physical", selectedAtTick: heldTask.selectedAtTick });
      expect(contract(world, fixture.contractId)).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity });
      expect(world.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === fixture.contractId)).toHaveLength(1);
      expect(world.events.filter(({ type, subjectId }) => type === "contract-fulfilled" && subjectId === fixture.contractId)).toHaveLength(0);
      assertWorldInvariants(world);
      coldRecords.set(phase, record);
      partials.set(phase, envelope);
    }
    const completed: { tick: number | null; fulfillmentSequences: Set<number> } = {
      tick: null, fulfillmentSequences: new Set(),
    };
    const resumedTrace: { tick: number; distance: number; local: boolean }[] = [];
    let lastDistance = heldDistance;
    // Observe the genuine consumer without retaining mutable pre-call aliases,
    // changing admission custody, or assigning motion/arrival/stock results.
    const arrivalStep = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const world = args[0];
      const before = contract(world, fixture.contractId);
      const beforeStatus = before.status;
      const beforeCargo = before.cargoQuantity;
      const beforeHuman = actor(world, actorId);
      const beforeDistance = beforeStatus === "in-transit" ? routeDistance(world, before, beforeHuman) : null;
      const fineUnits = beforeDistance === null ? 0 : boundedFineWork(beforeHuman);
      const receiver = world.settlements.find(({ id }) => id === fixture.destinationId)!;
      const beforeFood = receiver.inventory.food;
      const noFoodRecipe = receiver.recipes.every(({ inputs, outputs }) =>
        [...inputs, ...outputs].every(({ resource }) => resource !== "food"));
      const noFoodProject = receiver.project.resource !== "food";
      const noArrivedRations = world.residents.filter((human) => human.location.kind === "settlement"
        && human.location.settlementId === receiver.id).every((human) =>
        residentActivitySupportsRations(human.activity) && human.activity?.rationTask?.phase !== "arrived");
      const firstNewSequence = world.meta.nextEventSequence;
      const result = originalStep(...args);
      const after = contract(result, fixture.contractId);
      const freshEvents = result.events.filter(({ sequence }) => sequence >= firstNewSequence);
      for (const event of freshEvents) if (event.type === "contract-fulfilled"
        && event.subjectId === fixture.contractId) completed.fulfillmentSequences.add(event.sequence);
      if (beforeStatus === "in-transit") {
        const human = actor(result, actorId);
        expect(after).toMatchObject({ carrierKind: "resident", assignedResidentId: residentId,
          porterRouteIds: [126], porterSettlementIds: [fixture.originId, fixture.destinationId] });
        expect(human.identity.stableId).toBe(actorId);
        const distance = after.status === "fulfilled" ? fixture.totalDistance : routeDistance(result, after, human);
        expect(distance).toBeGreaterThanOrEqual(lastDistance);
        expect(distance - lastDistance).toBeLessThanOrEqual(10 * RESIDENT_REST_APPROACH_STEP_UNITS);
        expect(distance - beforeDistance! + fineUnits).toBeLessThanOrEqual(10 * RESIDENT_REST_APPROACH_STEP_UNITS);
        expect(distance - beforeDistance! + fineUnits).toBeLessThanOrEqual(10 * fixture.travelStepUnits);
        resumedTrace.push({ tick: result.meta.completedTick, distance,
          local: residentTravelBodyIsLocal(actualFrame, human.activity!.poses.at(-1)!.position) });
        lastDistance = distance;
        if (after.status === "fulfilled") {
          expect(completed.tick).toBeNull();
          completed.tick = result.meta.completedTick;
          expect(completed.tick).toBeGreaterThan(traveling.arrivalTick!);
          expect(beforeCargo).toBe(fixture.quantity);
          expect(after.cargoQuantity).toBe(0);
          const fulfillment = freshEvents.filter(({ type, subjectId }) =>
            type === "contract-fulfilled" && subjectId === fixture.contractId);
          expect(fulfillment).toHaveLength(1);
          expect(fulfillment[0]!.data).toMatchObject({ quantity: fixture.quantity, resource: "food",
            residentId, originSettlementId: fixture.originId, destinationSettlementId: fixture.destinationId,
            projectContribution: 0, routeEvidence: "resident-route" });
          // Destination-specific conservation, not a global-ledger shortcut.
          // Check real consumers; do not disable them to manufacture equality.
          expect(noFoodRecipe).toBe(true);
          expect(noFoodProject).toBe(true);
          if (result.meta.completedTick % 60 === 0) expect(noArrivedRations).toBe(true);
          const otherTransfers = freshEvents.filter((event) => {
            if (event.subjectId === fixture.contractId
              || (event.type !== "contract-departed" && event.type !== "contract-fulfilled")) return false;
            const other = result.contracts.find(({ id }) => id === event.subjectId);
            return other?.resource === "food" && (event.type === "contract-departed"
              ? other.originSettlementId === fixture.destinationId
              : other.destinationSettlementId === fixture.destinationId);
          });
          expect(otherTransfers).toHaveLength(0);
          expect(result.settlements.find(({ id }) => id === fixture.destinationId)!.inventory.food)
            .toBe(beforeFood + beforeCargo);
          expect(after.deliveryTraceCost).toBeGreaterThan(0);
          expect(human.activeContractId).toBeNull();
          expect(human.location).toEqual({ kind: "settlement", settlementId: fixture.destinationId });
          expect(human.activity?.travelTask).toBeNull();
          expect(human.activity?.poses.at(-1)?.position).toEqual(fixture.destinationPosition);
        } else {
          expect(after).toMatchObject({ status: "in-transit", cargoQuantity: fixture.quantity });
          expect(human.activity?.travelTask).toMatchObject({ mode: "physical", contractId: fixture.contractId,
            selectedAtTick: heldTask.selectedAtTick });
        }
      }
      assertWorldInvariants(result);
      return result;
    });
    advance(retry, 1);
    await retry.save();
    const reference = decode(retryRepository.snapshot());
    const referenceWorld = deserializeWorld(reference.world);
    expect(reference.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    const remainingTask = actor(referenceWorld, actorId).activity?.travelTask;
    if (remainingTask?.mode !== "physical") throw new Error("Resumed journey lost its physical cursor");
    // A step stops at each waypoint, discarding unused allowance. Distance /
    // interval budget alone undercounts work; actual source terrain can further
    // reduce each local step. Bound the remaining native edges conservatively,
    // without assigning terrain or slowing the unchanged macro owner.
    const intervalLimit = Math.ceil(localTravelStepBound(referenceWorld,
      nativeRoute.path.slice(remainingTask.waypointIndex - 1), fixture.travelStepUnits) / 10) + 2;
    for (let interval = 0; interval < intervalLimit && completed.tick === null; interval += 1) advance(retry, 10);
    if (completed.tick === null) throw new Error(`Resumed native journey did not hand off within ${intervalLimit} bounded intervals`);
    expect(resumedTrace.some(({ local, distance }) => local && distance > heldDistance)).toBe(true);
    expect(resumedTrace.at(-1)?.distance).toBe(fixture.totalDistance);
    expect(completed.fulfillmentSequences.size).toBe(1);
    advance(retry, 10);
    await retry.save();
    const terminal = decode(retryRepository.snapshot());
    const terminalWorld = deserializeWorld(terminal.world);
    expect(terminalWorld.meta.completedTick).toBe(completed.tick + 1);
    expect(terminal.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(contract(terminalWorld, fixture.contractId)).toMatchObject({ status: "fulfilled", cargoQuantity: 0,
      completedTick: completed.tick, assignedResidentId: residentId });
    expect(completed.fulfillmentSequences.size).toBe(1);
    expect(JSON.parse(terminal.regionalTravel).origin).toEqual(movedOrigin);
    // Completion above owns exact release/location. This subsequent ordinary
    // interval may legitimately select other work or change needs/stock.
    assertWorldInvariants(terminalWorld);
    arrivalStep.mockRestore();
    close(retry);

    const phase4Repository = new MemoryRepository(coldRecords.get(4)!);
    const phase4 = await open(phase4Repository);
    await phase4.save();
    expect(authoritativeRoots(decode(phase4Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(4)!));
    advance(phase4, 5);
    await phase4.save();
    expect(authoritativeRoots(decode(phase4Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(9)!));
    close(phase4);
    const phase9Repository = new MemoryRepository(coldRecords.get(9)!);
    const phase9 = await open(phase9Repository);
    await phase9.save();
    expect(authoritativeRoots(decode(phase9Repository.snapshot()))).toEqual(authoritativeRoots(partials.get(9)!));
    advance(phase9, 1);
    await phase9.save();
    expect(authoritativeRoots(decode(phase9Repository.snapshot()))).toEqual(authoritativeRoots(reference));
    const phase9Tick = deserializeWorld(partials.get(9)!.world).meta.completedTick;
    const remainingSteps = 10 * (terminalWorld.meta.completedTick - phase9Tick)
      + terminal.perceptionCarry.playerStepsSinceWorldTick - partials.get(9)!.perceptionCarry.playerStepsSinceWorldTick;
    expect(remainingSteps).toBeGreaterThan(1);
    advance(phase9, remainingSteps - 1); // The reference step above is already consumed.
    await phase9.save();
    expect(authoritativeRoots(decode(phase9Repository.snapshot()))).toEqual(authoritativeRoots(terminal));
  }, 180_000);

  it("physically completes one native reverse medicine journey with conserved handoff and equal phase4/9 cold work", async () => {
    // The survey supplies only a candidate. Independently authenticate the
    // actual runtime's wild world, without changing route, stock or residency.
    const bootstrapRepository = new MemoryRepository();
    const bootstrap = await open(bootstrapRepository);
    bootstrap.dispatchUI({ type: "new-world", seed: "breathing room regional density 9",
      posture: "gale", sessionShape: "wander" });
    await bootstrap.save();
    const initialRecord = bootstrapRepository.snapshot();
    const envelope = decode(initialRecord);
    const world = deserializeWorld(envelope.world);
    expect(world.meta).toMatchObject({ seedText: "breathing room regional density 9", pressureMode: "wild", completedTick: 420 });
    expect(world.residents.every((human) => !Object.hasOwn(human, "activity"))).toBe(true);
    const offered = world.contracts.find(({ id, status }) => id === 129 && status === "offered");
    if (offered === undefined) throw new Error("Actual wild runtime has no native medicine offer129; do not fabricate one");
    expect(offered).toMatchObject({ originSettlementId: 4, destinationSettlementId: 3, resource: "medicine",
      quantity: 12, cargoQuantity: 0, carrierKind: null, assignedResidentId: null,
      acceptedTick: null, departedTick: null, playerExclusiveUntilTick: 720, dueTick: 1_140 });
    const origin = world.settlements.find(({ id }) => id === offered.originSettlementId)!;
    const destination = world.settlements.find(({ id }) => id === offered.destinationSettlementId)!;
    expect(destination.recipes).toHaveLength(1);
    expect(destination.recipes[0]).toMatchObject({ inputs: [], outputs: [{ resource: "reed", amount: 7 }] });
    expect(destination.project.resource).toBe("parts");
    const nativeRoute = world.routes.find(({ id }) => id === offered.routeId)!;
    expect(nativeRoute).toMatchObject({ id: 117, fromSettlementId: 3, toSettlementId: 4 });
    expect(nativeRoute.path).toHaveLength(76);
    expect(nativeRoute.path[0]).toBe(destination.tileIndex);
    expect(nativeRoute.path.at(-1)).toBe(origin.tileIndex);
    const center = (tileIndex: number): WorldPosition => {
      const tile = world.terrain.tiles[tileIndex]!;
      return createWorldPosition({ x: 0, y: 0 }, tile.x * 1_000 + 500, tile.y * 1_000 + 500);
    };
    expect(world.terrain.tiles[origin.tileIndex]).toMatchObject({ x: 22, y: 51 });
    expect(world.terrain.tiles[destination.tileIndex]).toMatchObject({ x: 92, y: 46 });
    const sourceTarget = center(origin.tileIndex);
    const destinationPosition = center(destination.tileIndex);
    const savedOrigin = JSON.parse(envelope.regionalTravel).origin as { x: number; y: number };
    expect(savedOrigin).toEqual({ x: -38, y: -9 });
    expect(bootstrap.getRenderView().terrain).toMatchObject({ columns: REGIONAL_TRAVEL_COLUMNS,
      rows: REGIONAL_TRAVEL_ROWS, worldTileOrigin: savedOrigin });
    const frame = residentTravelInteractionFrame({ origin: savedOrigin,
      terrain: { width: REGIONAL_TRAVEL_COLUMNS, height: REGIONAL_TRAVEL_ROWS } });
    if (frame === null) throw new Error("Native reverse world has no actual interaction frame");
    expect(residentTravelBodyIsLocal(frame, sourceTarget)).toBe(true);
    expect(residentTravelBodyIsLocal(frame, destinationPosition)).toBe(false);
    expect(findAutonomousRoutePlan(world, origin.id, destination.id))
      .toMatchObject({ routeIds: [117], settlementIds: [4, 3] });
    const sources = new Map(world.residents.filter((human) => human.location.kind === "settlement"
      && human.location.settlementId === origin.id).map((human) => {
      const source = resolveResidentWorldPlacement(world, human)?.position;
      if (source === undefined) throw new Error("Native reverse candidate has no original source pose");
      return [human.id, { actorId: human.identity.stableId, source }] as const;
    }));
    const native = { terrain: structuredClone(world.terrain), routes: structuredClone(world.routes),
      settlements: structuredClone(world.settlements), ledger: structuredClone(world.ledger),
      contracts: structuredClone(world.contracts) };
    const initialStock = origin.inventory.medicine;
    expect(initialStock).toBeGreaterThanOrEqual(offered.quantity);
    // Same declared causes as the forward witness: belonging urgency prevents
    // unrelated pre-acceptance service motion, not the real accepted priority.
    world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: 1_420 };
    for (const human of world.residents) human.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    offered.playerExclusiveUntilTick = world.meta.completedTick;
    expect(world.terrain).toEqual(native.terrain);
    expect(world.routes).toEqual(native.routes);
    expect(world.settlements).toEqual(native.settlements);
    expect(world.ledger).toEqual(native.ledger);
    expect(world.contracts).toEqual(native.contracts.map((candidate) => candidate.id === offered.id
      ? { ...candidate, playerExclusiveUntilTick: world.meta.completedTick } : candidate));
    expect(findAutonomousRoutePlan(world, origin.id, destination.id))
      .toMatchObject({ routeIds: [117], settlementIds: [4, 3] });
    assertWorldInvariants(world);
    envelope.world = serializeWorld(world);
    close(bootstrap);
    const repository = new MemoryRepository(recordWith(initialRecord, envelope));
    const runtime = await open(repository);
    const stepUnits = residentTravelStepUnits({ version: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION },
      { resource: offered.resource, cargoQuantity: offered.quantity });
    expect(stepUnits).toBe(90);
    const totalDistance = (nativeRoute.path.length - 1) * 1_000;
    const departures = new Set<number>();
    const fulfillments = new Set<number>();
    const trace: { distance: number; local: boolean; macroUnits: number; progress: number | null }[] = [];
    const observed: { status: ContractState["status"]; completedTick: number | null } = { status: "offered", completedTick: null };
    let actorId: string | null = null;
    let primary = true;
    const originalStep = simulation.stepWorld;
    const step = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      if (!primary) return originalStep(...args);
      const beforeWorld = args[0];
      const before = contract(beforeWorld, offered.id);
      const beforeStatus = before.status;
      const beforeCargo = before.cargoQuantity;
      const beforeOriginStock = beforeWorld.settlements.find(({ id }) => id === origin.id)!.inventory.medicine;
      const receiver = beforeWorld.settlements.find(({ id }) => id === destination.id)!;
      const beforeDestinationStock = receiver.inventory.medicine;
      const noMedicineRecipe = receiver.recipes.every(({ inputs, outputs }) =>
        [...inputs, ...outputs].every(({ resource }) => resource !== "medicine"));
      const noMedicineProject = receiver.project.resource !== "medicine";
      const beforeHuman = actorId === null ? undefined : actor(beforeWorld, actorId);
      const beforeDistance = beforeStatus === "in-transit" && beforeHuman !== undefined
        ? routeDistance(beforeWorld, before, beforeHuman) : null;
      const fineUnits = beforeDistance === null ? 0 : boundedFineWork(beforeHuman!);
      if (beforeDistance !== null) for (let index = 1; index < beforeHuman!.activity!.poses.length; index += 1) {
        const poses = beforeHuman!.activity!.poses;
        const delta = worldPositionDelta(poses[index - 1]!.position, poses[index]!.position);
        expect(Math.ceil(Math.hypot(delta.x, delta.y))).toBeLessThanOrEqual(stepUnits!);
      }
      const firstNewSequence = beforeWorld.meta.nextEventSequence;
      const result = originalStep(...args);
      const after = contract(result, offered.id);
      observed.status = after.status;
      const freshEvents = result.events.filter(({ sequence }) => sequence >= firstNewSequence);
      for (const event of freshEvents) if (event.subjectId === offered.id) {
        if (event.type === "contract-departed") departures.add(event.sequence);
        if (event.type === "contract-fulfilled") fulfillments.add(event.sequence);
      }
      if (beforeStatus === "accepted" && after.status === "in-transit") {
        expect(after.cargoQuantity).toBe(offered.quantity);
        expect(result.settlements.find(({ id }) => id === origin.id)!.inventory.medicine)
          .toBe(beforeOriginStock - offered.quantity);
      }
      if (after.status === "in-transit" || (beforeStatus === "in-transit" && after.status === "fulfilled")) {
        if (actorId === null) throw new Error("Reverse departure has no actual automatic winner");
        const human = actor(result, actorId);
        const distance = after.status === "fulfilled" ? totalDistance : routeDistance(result, after, human);
        const macroUnits = beforeDistance === null ? 0 : distance - beforeDistance;
        expect(macroUnits).toBeGreaterThanOrEqual(0);
        expect(macroUnits + fineUnits).toBeLessThanOrEqual(10 * stepUnits!);
        const previous = trace.at(-1);
        if (previous !== undefined) {
          expect(distance).toBeGreaterThanOrEqual(previous.distance);
          expect(distance - previous.distance).toBeLessThanOrEqual(10 * stepUnits!);
        }
        const progress = human.location.kind === "route" ? human.location.progress : null;
        trace.push({ distance, local: residentTravelBodyIsLocal(frame, human.activity!.poses.at(-1)!.position),
          macroUnits, progress });
        if (after.status === "in-transit") {
          expect(after).toMatchObject({ cargoQuantity: offered.quantity, porterRouteIds: [117], porterSettlementIds: [4, 3] });
          expect(human.activity?.travelTask).toMatchObject({ mode: "physical", contractId: offered.id });
          const task = human.activity?.travelTask;
          if (task?.mode !== "physical") throw new Error("Native reverse journey lost its physical cursor");
          const segment = residentTravelSegment(result, after, task);
          expect(segment?.reversed).toBe(true);
          expect(human.location).toMatchObject({ kind: "route", routeId: 117 });
          if (previous?.progress !== null && previous?.progress !== undefined) expect(progress!).toBeLessThanOrEqual(previous.progress);
        } else {
          expect(observed.completedTick).toBeNull();
          observed.completedTick = result.meta.completedTick;
          expect(beforeCargo).toBe(offered.quantity);
          expect(after.cargoQuantity).toBe(0);
          const fulfillment = freshEvents.filter(({ type, subjectId }) => type === "contract-fulfilled" && subjectId === offered.id);
          expect(fulfillment).toHaveLength(1);
          expect(fulfillment[0]!.data).toMatchObject({ quantity: 12, resource: "medicine", residentId: human.id,
            originSettlementId: 4, destinationSettlementId: 3, projectContribution: 0, routeEvidence: "resident-route" });
          // Actual receiver is reed-producing/parts-building; hourly rations
          // consume only food/water. Never disable a consumer for this equality.
          expect(noMedicineRecipe).toBe(true);
          expect(noMedicineProject).toBe(true);
          expect(freshEvents.filter((event) => {
            if (event.subjectId === offered.id || (event.type !== "contract-departed" && event.type !== "contract-fulfilled")) return false;
            const other = result.contracts.find(({ id }) => id === event.subjectId);
            return other?.resource === "medicine" && (event.type === "contract-departed"
              ? other.originSettlementId === destination.id : other.destinationSettlementId === destination.id);
          })).toHaveLength(0);
          expect(result.settlements.find(({ id }) => id === destination.id)!.inventory.medicine)
            .toBe(beforeDestinationStock + beforeCargo);
          expect(human.activeContractId).toBeNull();
          expect(human.location).toEqual({ kind: "settlement", settlementId: destination.id });
          expect(human.activity?.travelTask).toBeNull();
          expect(human.activity?.poses.at(-1)?.position).toEqual(destinationPosition);
        }
      }
      assertWorldInvariants(result);
      return result;
    });

    advance(runtime, 10);
    await runtime.save();
    const acceptedWorld = deserializeWorld(decode(repository.snapshot()).world);
    const accepted = contract(acceptedWorld, offered.id);
    expect(accepted).toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null,
      carrierKind: "resident", acceptedTick: 421 });
    const source = accepted.assignedResidentId === null ? undefined : sources.get(accepted.assignedResidentId);
    if (source === undefined) throw new Error("Actual reverse winner is not a native origin resident");
    actorId = source.actorId;
    const selectedHuman = actor(acceptedWorld, actorId);
    expect(selectedHuman.activity?.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
    expect(selectedHuman.activity?.poses[0]?.position).toEqual(source.source);
    expect(selectedHuman.activity?.pickupTask).toMatchObject({ contractId: offered.id, phase: "approaching", target: sourceTarget });
    expect(worldPositionDelta(source.source, sourceTarget)).not.toEqual({ x: 0, y: 0 });
    expect(residentRestTargetHasDrySupport(acceptedWorld, source.source)).toBe(true);
    expect(residentRestTargetHasDrySupport(acceptedWorld, sourceTarget)).toBe(true);
    expect(acceptedWorld.settlements.find(({ id }) => id === origin.id)!.inventory.medicine).toBe(initialStock);
    expect(departures.size).toBe(0);
    let picked: Envelope | null = null;
    for (let interval = 0; interval < 4; interval += 1) {
      advance(runtime, 10);
      await runtime.save();
      const candidate = decode(repository.snapshot());
      const candidateWorld = deserializeWorld(candidate.world);
      if (contract(candidateWorld, offered.id).status === "in-transit") { picked = candidate; break; }
      expect(contract(candidateWorld, offered.id)).toMatchObject({ status: "accepted", cargoQuantity: 0, departedTick: null });
      expect(candidateWorld.settlements.find(({ id }) => id === origin.id)!.inventory.medicine).toBe(initialStock);
    }
    if (picked === null) throw new Error("Native reverse winner did not actually approach and pick up within four intervals");
    const pickedWorld = deserializeWorld(picked.world);
    const pickedContract = contract(pickedWorld, offered.id);
    const pickedHuman = actor(pickedWorld, actorId);
    expect(pickedHuman.activity?.poses[0]?.position).toEqual(sourceTarget);
    expect(pickedHuman.activity?.pickupTask).toBeNull();
    expect(pickedHuman.activity?.travelTask).toMatchObject({ mode: "physical", legIndex: 0, waypointIndex: 1, phase: "approaching" });
    expect(pickedContract).toMatchObject({ cargoQuantity: 12, porterRouteIds: [117], porterSettlementIds: [4, 3] });
    expect(routeDistance(pickedWorld, pickedContract, pickedHuman)).toBe(0);
    const pickedTask = pickedHuman.activity?.travelTask;
    if (pickedTask?.mode !== "physical") throw new Error("Actual reverse pickup lacks a physical cursor");
    const firstEdge = residentTravelSegment(pickedWorld, pickedContract, pickedTask);
    if (firstEdge === null) throw new Error("Actual reverse pickup has no exact first directed edge");
    expect(firstEdge.reversed).toBe(true);
    expect(firstEdge.start).toEqual(center(nativeRoute.path.at(-1)!));
    expect(firstEdge.end).toEqual(center(nativeRoute.path.at(-2)!));
    expect(departures.size).toBe(1);
    const coldRecords = new Map<number, SaveRecord>();
    const partials = new Map<number, Envelope>();
    for (const [phase, count] of [[4, 4], [9, 5]] as const) {
      advance(runtime, count);
      await runtime.save();
      const record = repository.snapshot();
      const partial = decode(record);
      const partialWorld = deserializeWorld(partial.world);
      const human = actor(partialWorld, actorId);
      expect(partial.perceptionCarry.playerStepsSinceWorldTick).toBe(phase);
      expect(partialWorld.meta.completedTick).toBe(pickedWorld.meta.completedTick);
      expect(human.activity?.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
      expect(human.activity?.poses).toHaveLength(phase + 1);
      // Cargo90 is the ceiling, not bare-ground speed. Derive each source
      // contact from unchanged native geography; later steps can cross the
      // tile boundary halfway through this first directed edge.
      let expectedOffset = 0;
      for (let index = 1; index <= phase; index += 1) {
        const previous = residentTravelSegmentPose(firstEdge, expectedOffset);
        const global = worldPositionToGlobalFixed(previous.position);
        const sourceX = Math.floor(global.x / 1_000);
        const sourceY = Math.floor(global.y / 1_000);
        const tile = partialWorld.terrain.tiles[sourceY * partialWorld.terrain.width + sourceX];
        if (tile === undefined) throw new Error("Actual reverse contact lost its native terrain tile");
        expect(tile).toMatchObject({ x: sourceX, y: sourceY });
        expectedOffset += Math.floor(stepUnits! * TERRAIN_DRAG_PERMILLE[tile.terrain] / 1_000);
        expect(human.activity?.poses[index]).toEqual(residentTravelSegmentPose(firstEdge, expectedOffset));
      }
      expect(routeDistance(partialWorld, contract(partialWorld, offered.id), human)).toBe(expectedOffset);
      expect(boundedFineWork(human)).toBe(expectedOffset);
      expect(expectedOffset).toBeLessThanOrEqual(phase * stepUnits!);
      expect(contract(partialWorld, offered.id)).toMatchObject({ status: "in-transit", cargoQuantity: 12,
        assignedResidentId: selectedHuman.id });
      coldRecords.set(phase, record);
      partials.set(phase, partial);
    }
    advance(runtime, 1);
    const geometricIntervals = Math.ceil(localTravelStepBound(pickedWorld, nativeRoute.path, stepUnits!) / 10) + 2;
    const finalLimit = pickedWorld.meta.completedTick + Math.max(120, geometricIntervals);
    while (observed.status !== "fulfilled" && runtime.getRenderView().tick < finalLimit) advance(runtime, 10);
    if (observed.completedTick === null) throw new Error("Native reverse journey did not hand off within its bounded ordinary-work witness");
    expect(observed.completedTick).toBeGreaterThan(pickedContract.arrivalTick!);
    expect(trace.some(({ local, distance }) => local && distance > 0)).toBe(true);
    expect(trace.some(({ local, macroUnits }) => !local && macroUnits > 0)).toBe(true);
    expect(trace.at(-1)?.distance).toBe(totalDistance);
    expect(departures.size).toBe(1);
    expect(fulfillments.size).toBe(1);
    advance(runtime, 10); // Exactly one real following interval, not a new assigned job.
    await runtime.save();
    const terminal = decode(repository.snapshot());
    const terminalWorld = deserializeWorld(terminal.world);
    expect(terminalWorld.meta.completedTick).toBe(observed.completedTick + 1);
    expect(terminal.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(contract(terminalWorld, offered.id)).toMatchObject({ status: "fulfilled", cargoQuantity: 0,
      completedTick: observed.completedTick, assignedResidentId: selectedHuman.id });
    expect(departures.size).toBe(1);
    expect(fulfillments.size).toBe(1);
    assertWorldInvariants(terminalWorld);
    close(runtime);
    primary = false;
    for (const phase of [4, 9] as const) {
      const coldRepository = new MemoryRepository(coldRecords.get(phase)!);
      const cold = await open(coldRepository);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(partials.get(phase)!));
      if (phase === 4) {
        advance(cold, 5);
        await cold.save();
        expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(partials.get(9)!));
        // Exact phase4→phase9 join plus the detached phase9 suffix below proves
        // the same whole continuation without running that suffix twice.
        close(cold);
        continue;
      }
      const remainingSteps = 10 * (terminalWorld.meta.completedTick - pickedWorld.meta.completedTick) - 9;
      expect(remainingSteps).toBeGreaterThan(0);
      advance(cold, remainingSteps);
      await cold.save();
      expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(terminal));
      close(cold);
    }
    step.mockRestore();
  }, 180_000);

  it("retains native multi-leg storm cargo outside the window and resumes after actual recovery with equal cold work", async () => {
    // The native opportunity is storm-held, not a completed coarse journey.
    // Every initial need, weather, stock, deadline and physical source stays
    // native. Only ordinary renderer movement and accepted RAF steps are used.
    const repository = new MemoryRepository();
    const runtime = await open(repository);
    runtime.dispatchUI({ type: "new-world", seed: "runtime baseline estuary",
      posture: "gale", sessionShape: "wander" });
    await runtime.save();
    const initial = decode(repository.snapshot());
    const initialWorld = deserializeWorld(initial.world);
    expect(initialWorld.meta).toMatchObject({ seedText: "runtime baseline estuary", pressureMode: "wild", completedTick: 420 });
    expect(initial.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    const offered = contract(initialWorld, 127);
    expect(offered).toMatchObject({ status: "offered", originSettlementId: 5, destinationSettlementId: 1,
      resource: "parts", quantity: 8, cargoQuantity: 0, playerExclusiveUntilTick: 720, dueTick: 1_140,
      carrierKind: null, assignedResidentId: null, acceptedTick: null, departedTick: null });
    const initialPlan = findAutonomousRoutePlan(initialWorld, offered.originSettlementId, offered.destinationSettlementId);
    if (initialPlan === undefined) throw new Error("Native estuary127 has no initial lawful itinerary");
    expect(initialPlan.routeIds).toEqual([121, 117, 112, 106]);
    expect(initialPlan.settlementIds).toEqual([5, 4, 3, 2, 1]);
    const positions = (world: WorldState, routeIds: readonly number[]): WorldPosition[] => routeIds.flatMap((id) => {
      const route = world.routes.find((candidate) => candidate.id === id);
      if (route === undefined) throw new Error("Native feasibility itinerary lost an actual route");
      return route.path.map((tileIndex) => {
        const tile = world.terrain.tiles[tileIndex];
        if (tile === undefined) throw new Error("Native feasibility itinerary lost an actual tile");
        return createWorldPosition({ x: 0, y: 0 }, tile.x * 1_000 + 500, tile.y * 1_000 + 500);
      });
    });
    const nativePositions = positions(initialWorld, initialPlan.routeIds);
    expect(nativePositions.length).toBeGreaterThan(0);
    const currentFrame = () => {
      const view = runtime.getRenderView();
      const origin = view.terrain.worldTileOrigin;
      if (origin === undefined) throw new Error("Native feasibility player has no real regional frame");
      expect(view.terrain).toMatchObject({ columns: REGIONAL_TRAVEL_COLUMNS, rows: REGIONAL_TRAVEL_ROWS });
      const frame = residentTravelInteractionFrame({ origin,
        terrain: { width: view.terrain.columns, height: view.terrain.rows } });
      if (frame === null) throw new Error("Native feasibility player has no actual interaction window");
      return frame;
    };
    const playerSummary = () => {
      const view = runtime.getRenderView();
      const origin = view.terrain.worldTileOrigin!;
      return { tick: view.tick, origin: { ...origin }, x: origin.x + view.player.position.x / view.terrain.tileSize,
        y: origin.y + view.player.position.y / view.terrain.tileSize,
        stamina: view.player.stamina, mode: view.player.mode };
    };
    const excludes = (routePositions = nativePositions) => {
      const frame = currentFrame();
      return routePositions.every((position) => !residentTravelBodyIsLocal(frame, position));
    };
    const initialFrame = currentFrame();
    expect(nativePositions.every((position) => residentTravelBodyIsLocal(initialFrame, position))).toBe(true);
    const startingPlayer = playerSummary();
    const summary = (world: WorldState) => {
      const commitment = contract(world, offered.id);
      const human = world.residents.find(({ id }) => id === commitment.assignedResidentId);
      const pose = human?.activity?.poses.at(-1);
      const task = human?.activity?.pickupTask ?? human?.activity?.travelTask;
      return { tick: world.meta.completedTick, status: commitment.status, quantity: commitment.quantity,
        cargo: commitment.cargoQuantity, acceptedTick: commitment.acceptedTick, departedTick: commitment.departedTick,
        arrivalTick: commitment.arrivalTick, delayTicks: human?.condition.routeDelayTicks ?? null,
        residentId: human?.id ?? null, actorId: human?.identity.stableId ?? null,
        body: pose === undefined ? null : { ...worldPositionToGlobalFixed(pose.position), heading: pose.heading },
        task: task == null ? null : task.kind === "contract-travel" && task.mode === "legacy-coarse"
          ? { kind: task.kind, mode: task.mode } : { kind: task.kind, phase: task.phase, waitReason: task.waitReason },
        sourceStock: world.settlements.find(({ id }) => id === offered.originSettlementId)!.inventory.parts,
        routeIds: [...commitment.porterRouteIds], weather: world.weather.kind, intensity: world.weather.intensity };
    };
    const observations: ReturnType<typeof summary>[] = [];
    const macroEvidence: { tick: number; units: number }[] = [];
    const pickupEvidence: { tick: number; beforeStock: number; afterStock: number;
      departedLots: { contractId: number; quantity: number }[] }[] = [];
    let primary = true;
    const originalStep = simulation.stepWorld;
    const step = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
      const world = args[0];
      const before = contract(world, offered.id);
      const beforeStatus = before.status;
      const source = world.settlements.find(({ id }) => id === offered.originSettlementId)!;
      const beforeStock = source.inventory.parts;
      const beforeLots = beforeStatus === "accepted" ? world.contracts.filter((candidate) =>
        candidate.originSettlementId === offered.originSettlementId && candidate.resource === "parts")
        .map(({ id, status, cargoQuantity }) => ({ id, status, cargoQuantity })) : [];
      const duePartsRecipes = beforeStatus === "accepted" ? source.recipes.filter((recipe) =>
        recipe.nextRunTick <= world.meta.completedTick + 1
        && [...recipe.inputs, ...recipe.outputs].some(({ resource }) => resource === "parts")).length : 0;
      const beforeHuman = world.residents.find(({ id }) => id === before.assignedResidentId);
      const beforeDistance = primary && before.status === "in-transit" && beforeHuman?.activity?.travelTask?.mode === "physical"
        ? routeDistance(world, before, beforeHuman) : null;
      const result = originalStep(...args);
      if (primary) {
        // At most300 advances to exclusivity plus four diagnostic intervals.
        if (observations.length >= 304) throw new Error("Native feasibility exceeded its bounded observation count");
        observations.push(summary(result));
        const after = contract(result, offered.id);
        const afterHuman = result.residents.find(({ id }) => id === after.assignedResidentId);
        if (beforeStatus === "accepted" && after.status === "in-transit") {
          // Characterize this actual non-hourly transfer. Do not disable or
          // ignore another stock-changing producer to obtain the equation.
          expect(result.meta.completedTick % 60).not.toBe(0);
          expect(duePartsRecipes).toBe(0);
          expect(result.contracts.filter((candidate) => candidate.destinationSettlementId === offered.originSettlementId
            && candidate.resource === "parts" && candidate.completedTick === result.meta.completedTick
            && candidate.status === "fulfilled")).toHaveLength(0);
          for (const lot of result.contracts.filter((candidate) => candidate.originSettlementId === offered.originSettlementId
            && candidate.resource === "parts" && candidate.departedTick === result.meta.completedTick)) {
            expect(beforeLots.find(({ id }) => id === lot.id)).toMatchObject({ status: "accepted", cargoQuantity: 0 });
            expect(lot).toMatchObject({ status: "in-transit", cargoQuantity: lot.quantity });
            expect(result.events.filter(({ tick, type, subjectId }) => tick === result.meta.completedTick
              && type === "contract-departed" && subjectId === lot.id)).toHaveLength(1);
          }
          pickupEvidence.push({ tick: result.meta.completedTick, beforeStock,
            afterStock: result.settlements.find(({ id }) => id === offered.originSettlementId)!.inventory.parts,
            departedLots: result.contracts.filter((candidate) => candidate.originSettlementId === offered.originSettlementId
              && candidate.resource === "parts" && candidate.departedTick === result.meta.completedTick)
              .map(({ id, quantity }) => ({ contractId: id, quantity })) });
        }
        if (beforeDistance !== null && after.status === "in-transit" && afterHuman !== undefined) {
          const macroUnits = routeDistance(result, after, afterHuman) - beforeDistance;
          expect(macroUnits).toBeGreaterThanOrEqual(0);
          expect(macroUnits).toBeLessThanOrEqual(residentTravelStepUnits(afterHuman.activity!, after)! * 10);
          if (macroUnits > 0) macroEvidence.push({ tick: result.meta.completedTick, units: macroUnits });
        }
      }
      return result;
    });
    let acceptedSteps = 0;
    const take = (count: number) => { advance(runtime, count); acceptedSteps += count; };
    const prefixLimit = (offered.playerExclusiveUntilTick - initialWorld.meta.completedTick) * 10 - 1;
    expect(prefixLimit).toBe(2_999);
    let resting = false;
    runtime.dispatchRenderer({ type: "movement", vector: { x: -1, y: 0 } });
    while (acceptedSteps < prefixLimit && !excludes()) {
      const stamina = runtime.getRenderView().player.stamina;
      if (!resting && stamina <= 0.12) {
        resting = true;
        runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
      } else if (resting && stamina >= 0.9) {
        resting = false;
        runtime.dispatchRenderer({ type: "movement", vector: { x: -1, y: 0 } });
      }
      take(Math.min(10, prefixLimit - acceptedSteps));
    }
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    const movementSteps = acceptedSteps;
    const exitPlayer = playerSummary();
    const diagnostic = () => JSON.stringify({ acceptedSteps, movementSteps, startingPlayer, exitPlayer,
      currentPlayer: playerSummary(), observations: observations.slice(-8), macroEvidence, pickupEvidence });
    expect(excludes(), diagnostic()).toBe(true);
    expect(exitPlayer.x).toBeLessThan(startingPlayer.x);
    expect(movementSteps).toBeGreaterThan(0);
    take(prefixLimit - acceptedSteps);
    await runtime.save();
    const prefixRecord = repository.snapshot();
    const prefix = decode(prefixRecord);
    const prefixWorld = deserializeWorld(prefix.world);
    expect(prefixWorld.meta.completedTick).toBe(719);
    expect(prefix.perceptionCarry.playerStepsSinceWorldTick).toBe(9);
    expect(contract(prefixWorld, offered.id)).toMatchObject({ status: "offered", quantity: 8, cargoQuantity: 0,
      playerExclusiveUntilTick: 720, dueTick: 1_140, assignedResidentId: null, acceptedTick: null, departedTick: null });
    expect(excludes(), diagnostic()).toBe(true);
    expect(JSON.parse(prefix.regionalTravel).origin).toEqual(runtime.getRenderView().terrain.worldTileOrigin);
    take(1);
    await runtime.save();
    const accepted = decode(repository.snapshot());
    const acceptedWorld = deserializeWorld(accepted.world);
    const acceptedContract = contract(acceptedWorld, offered.id);
    expect(acceptedWorld.meta.completedTick).toBe(720);
    expect(accepted.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(acceptedContract, diagnostic()).toMatchObject({ status: "accepted", carrierKind: "resident",
      acceptedTick: 720, departedTick: null, cargoQuantity: 0, quantity: 8,
      playerExclusiveUntilTick: 720, dueTick: 1_140 });
    expect(acceptedContract.assignedResidentId, diagnostic()).not.toBeNull();
    const selected = acceptedWorld.residents.find(({ id }) => id === acceptedContract.assignedResidentId)!;
    expect(selected.activeContractId).toBe(offered.id);
    expect(selected.activity?.version).toBe(RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION);
    expect(selected.activity?.pickupTask).toMatchObject({ kind: "contract-pickup", contractId: offered.id,
      settlementId: offered.originSettlementId, selectedAtTick: 720 });
    expect(acceptedContract.porterRouteIds.length).toBeGreaterThanOrEqual(2);
    expect(excludes(positions(acceptedWorld, acceptedContract.porterRouteIds)), diagnostic()).toBe(true);
    const acceptance = summary(acceptedWorld);
    assertWorldInvariants(acceptedWorld);

    primary = false;
    const coldRepository = new MemoryRepository(recordWith(prefixRecord, structuredClone(prefix)));
    const cold = await open(coldRepository);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(prefix));
    advance(cold, 1);
    await cold.save();
    expect(authoritativeRoots(decode(coldRepository.snapshot()))).toEqual(authoritativeRoots(accepted));
    close(cold);
    primary = true;
    take(40); // Four real intervals preserve the native weather hold, not forced progress.
    await runtime.save();
    const terminal = decode(repository.snapshot());
    const terminalWorld = deserializeWorld(terminal.world);
    const traveling = contract(terminalWorld, offered.id);
    expect(terminalWorld.meta.completedTick).toBe(724);
    expect(terminal.perceptionCarry.playerStepsSinceWorldTick).toBe(0);
    expect(traveling, diagnostic()).toMatchObject({ status: "in-transit", quantity: 8, cargoQuantity: 8,
      carrierKind: "resident", assignedResidentId: selected.id, playerExclusiveUntilTick: 720, dueTick: 1_140 });
    const held = actor(terminalWorld, selected.identity.stableId);
    expect(held.activeContractId).toBe(offered.id);
    expect(held.condition.sheltering).toBe(true);
    expect(held.condition.routeDelayTicks).toBe(3);
    expect(held.activity?.travelTask).toMatchObject({ mode: "physical", contractId: offered.id,
      legIndex: 0, waypointIndex: 1, phase: "waiting", waitReason: "weather-hold" });
    expect(held.activity?.poses.at(-1)).toEqual(selected.activity?.poses.at(-1));
    expect(routeDistance(terminalWorld, traveling, held)).toBe(0);
    expect(terminalWorld.weather).toMatchObject({ kind: "storm", intensity: 955_160 });
    expect(pickupEvidence, diagnostic()).toHaveLength(1);
    const pickup = pickupEvidence[0]!;
    expect(pickup.tick).toBe(721);
    expect(pickup.departedLots).toContainEqual({ contractId: offered.id, quantity: offered.quantity });
    // Other native couriers may debit this same stock. Attribute the entire
    // transfer rather than pretending this courier was the only participant.
    expect(pickup.beforeStock - pickup.afterStock).toBe(pickup.departedLots.reduce((total, lot) => total + lot.quantity, 0));
    expect(terminalWorld.events.filter(({ type, subjectId }) => type === "contract-departed" && subjectId === offered.id)).toHaveLength(1);
    expect(terminalWorld.events.filter(({ type, subjectId }) => type === "contract-fulfilled" && subjectId === offered.id)).toHaveLength(0);
    expect(macroEvidence, diagnostic()).toHaveLength(0);
    const departure = observations.find(({ tick }) => tick === 721)!;
    expect(departure).toMatchObject({ status: "in-transit", cargo: 8, delayTicks: 0,
      body: acceptance.body, task: { kind: "contract-travel", phase: "approaching", waitReason: null } });
    expect(terminalWorld.events.filter(({ type, subjectId }) => type === "resident-sheltered" && subjectId === selected.id))
      .toMatchObject([{ tick: 722, data: { contractId: offered.id } }]);
    for (const observation of observations.filter(({ tick }) => tick >= 722)) {
      expect(observation).toMatchObject({ status: "in-transit", cargo: 8, departedTick: 721,
        delayTicks: observation.tick - 721, arrivalTick: departure.arrivalTick! + observation.tick - 721,
        body: acceptance.body, task: { kind: "contract-travel", phase: "waiting", waitReason: "weather-hold" } });
    }
    assertWorldInvariants(terminalWorld);
    close(runtime);
    primary = false;
    const heldRepository = new MemoryRepository(prefixRecord);
    const coldHeld = await open(heldRepository);
    advance(coldHeld, 41); // Same phase9 prefix, acceptance, pickup and all four intervals.
    await coldHeld.save();
    expect(authoritativeRoots(decode(heldRepository.snapshot()))).toEqual(authoritativeRoots(terminal));
    close(coldHeld);
    step.mockRestore();
    await continueNativeStormHold(repository.snapshot());
  }, 600_000);
});
