import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { createWorld, deserializeWorld, serializeWorld } from "../sim/public";
import { RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID, RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION } from "../sim/residentActivity";
import { canonicalResidentActivityForWorld } from "../sim/residentActivityWorld";
import { waterDepthAt } from "../sim/terrain";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { CURRENT_GAME_SAVE_VERSION } from "./saveCompatibilityPolicy";
import * as canonicalUtil from "../sim/util";
import * as coreEcology from "./coreEcology";
import * as projectionOwner from "./projection";
import * as perceptionOwner from "./perception";
import * as breadthHabitatOwner from "./coreEcologyBreadthHabitat";
import * as breadthEcologyOwner from "./regionalBreadthEcology";
import type { CoreEcologyAggregatePatchState } from "./coreEcology";
import { CORE_ECOLOGY_BREADTH_DERIVATION_KIND, CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID } from "./coreEcologyBreadthHabitat";
import { deserializeBio0Ecology } from "./bio0Ecology";
import { LIVING_ACTOR_ADDRESS_VERSION } from "./livingActor";
import { ORDINARY_FOOT_MAX_WATER_DEPTH } from "./footing";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createPlayerAnimalCallKnowledge } from "./playerAnimalCallKnowledge";
import { createPlayerExpressionRecencyState } from "./playerExpressionRecency";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import {
  deserializeSettlementEcologyState,
  projectSettlementKeeperStoreClosureAuthority,
} from "./settlementEcology";
import { worldPositionDelta } from "./worldPosition";

vi.setConfig({ testTimeout: 120_000 });

const TELEMETRY_WORLD_SEED = "breathing room—é🌊 runtime telemetry";
const WORLD_ADVANCE_PHASE_KEYS = [
  "failClosedCheckpoint",
  "observedAftermath",
  "regionalEcologyActors",
  "regionalEcologyAggregateCommit",
  "worldAndLocalActors",
] as const;

vi.mock("../audio/soundscape", () => ({
  spatialPanForBearing: () => 0,
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

class MemoryRepository implements SaveRepository {
  private record: SaveRecord | undefined;

  async list() {
    return [];
  }

  async load(slotId: string): Promise<SaveRecord | undefined> {
    return slotId === "autosave" && this.record !== undefined
      ? structuredClone(this.record)
      : undefined;
  }

  async save(record: SaveRecord): Promise<void> {
    this.record = structuredClone(record);
  }

  async remove(): Promise<void> {
    this.record = undefined;
  }

  snapshot(): SaveRecord {
    if (this.record === undefined) throw new Error("telemetry fixture has no autosave");
    return structuredClone(this.record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;

beforeEach(() => {
  scheduledFrame = undefined;
  let monotonicNow = 0;
  vi.spyOn(performance, "now").mockImplementation(() => {
    monotonicNow += 0.25;
    return monotonicNow;
  });
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function advancePlayerSteps(
  runtime: TideweftRuntime,
  count: number,
  observeFrame?: (frame: number, phase: "before" | "after") => void,
): void {
  runtime.start();
  let now = 100;
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (callback === undefined) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    observeFrame?.(frame, "before");
    callback(now);
    observeFrame?.(frame, "after");
    now += 100;
  }
  runtime.stop();
}

function beginFreshWorld(runtime: TideweftRuntime, seed: string): void {
  runtime.dispatchUI({
    type: "new-world",
    seed,
    posture: "journey",
    sessionShape: "wander",
  });
}

function takeScheduledFrame(message: string): (now: number) => void {
  const callback = scheduledFrame as ((now: number) => void) | undefined;
  if (callback === undefined) throw new Error(message);
  scheduledFrame = undefined;
  return callback;
}

/** Exact current bodies and source binding; never reversed into a legacy oracle. */
function assertStationaryCivicWorld(envelope: Record<string, unknown>, seed: string): void {
  const current = deserializeWorld(envelope.world as string);
  const initial = createWorld(seed, "standard");
  const store = deserializeSettlementEcologyState(envelope.settlementEcology);
  const bio0 = deserializeBio0Ecology(envelope.bio0Ecology);
  const keeper = current.residents.find(({ identity }) => identity.stableId === store.identity.keeperActorId);
  if (keeper === undefined || bio0 === null || keeper.activity === undefined) {
    throw new Error("Stationary characterization lost its native keeper/body/BIO0 binding");
  }
  expect(current.meta.completedTick).toBe(initial.meta.completedTick + 3);
  expect(current.residents).toHaveLength(42);
  expect(initial.residents).toHaveLength(42);
  const bodyDigest = createHash("sha256").update(canonicalUtil.stableStringify(
    current.residents.map(({ activity }) => activity),
  )).digest("hex");
  const bodyDigests: Readonly<Record<string, string>> = {
    "runtime baseline estuary": "1e4f6676254535bc2b66643e304999e14091fd4cffb386d1c0e8614e3e4d366f",
    "breathing room regional density 8": "07e06dbd7ed58890651ebe0aea1d946cee906e261ccd47166ff83d02e1e79f48",
  };
  if (process.env.TIDEWEFT_WORLD_ADVANCE_DIAGNOSTICS === "1") process.stdout.write(`resident-inspection-characterization ${JSON.stringify({
    seed, bodyDigest, keeperId: keeper.identity.stableId, activity: keeper.activity,
    store: {
      closure: store.closure, keeperKnowledge: store.keeperKnowledge,
      lastClosureTransactionId: store.lastClosureTransactionId,
      lastResolvedLossOrdinal: store.lastResolvedLossOrdinal,
      lastResolvedDomesticFoodUseOrdinal: store.lastResolvedDomesticFoodUseOrdinal,
      lots: store.carrier.lots,
    },
  })}\n`);
  for (const [index, resident] of current.residents.entries()) {
    const original = initial.residents[index]!;
    expect(resident.identity.stableId).toBe(original.identity.stableId);
    const source = resolveResidentWorldPlacement(initial, original);
    if (source === null) throw new Error("Stationary baseline lost its original resident placement");
    const activity = canonicalResidentActivityForWorld(current, resident);
    // Current work selection is now enacted. This three-minute fixture still
    // cannot consume project material before its first actual hourly pulse.
    expect(activity).toMatchObject({
      version: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
      ownerId: RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID,
      actorId: original.identity.stableId,
      tick: current.meta.completedTick,
      restTask: null,
      rationTask: null,
      inspectionTask: null,
      pickupTask: null,
      travelTask: null,
    });
    expect(Object.hasOwn(activity!, "inspectionTask")).toBe(true);
    expect(activity?.poses).toHaveLength(1);
    const pose = activity!.poses[0]!;
    // Reassessment can clear a task without teleporting its body back to the
    // old ordinal source. The full cohort hash protects that exact trace too.
    const delta = worldPositionDelta(source.position, pose.position);
    expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(30 * 105);
    if (activity?.materialTask !== null) expect(activity?.materialTask?.usedAtTick).toBeNull();
    expect(resident.circadian).toMatchObject({
      restDestinationArrived: false,
      posture: { state: "awake", enteredAtTick: initial.meta.completedTick },
    });
    // Current bodies bind awake before the first world tick. The old unbound
    // first tick granted exactly 2,500 legacy exhaustion relief before routine
    // adoption. Awake membership no longer proves restorative arrival.
    expect(resident.condition.exhaustion).toBe(original.condition.exhaustion);
    if (seed === "runtime baseline estuary" && [64, 74, 82, 83].includes(resident.id)) {
      // Initial standard/hard pressure shares seed geometry and placement;
      // these untouched runtime actors actually start in foot-shallow water.
      const sourceTile = initial.terrain.tiles[source.compatibilityTileIndex]!;
      const sourceDepth = waterDepthAt(sourceTile, initial.tide);
      expect(sourceTile.terrain).not.toBe("deep-water");
      expect(sourceDepth).toBeGreaterThan(0);
      expect(sourceDepth).toBeLessThanOrEqual(ORDINARY_FOOT_MAX_WATER_DEPTH);
      expect(activity?.materialTask).toMatchObject({ phase: "arrived", usedAtTick: null });
      expect(pose.position).toEqual(activity!.materialTask!.target);
      const arrived = resolveResidentWorldPlacement(current, resident);
      expect(arrived).not.toBeNull();
      // Resident64's target is wet at420 and only dries at421. The current
      // arrival is dry; no initial-dry target or premature hourly use is claimed.
      expect(waterDepthAt(current.terrain.tiles[arrived!.compatibilityTileIndex]!, current.tide)).toBe(0);
    }
  }
  expect(bio0.porterAddress).toEqual({
    version: LIVING_ACTOR_ADDRESS_VERSION,
    actorId: keeper.identity.stableId, species: "human", persistence: "promoted",
    position: keeper.activity.poses[0]!.position, heading: keeper.activity.poses[0]!.heading,
  });
  // Both ordinary stationary seeds already reach the store through civic work.
  // Their existing in-place closure remains legal; this is not proof of the
  // dedicated inspection approach covered by its separate runtime fixtures.
  expect(store).toMatchObject({
    closure: "secured", lastResolvedLossOrdinal: 0, lastResolvedDomesticFoodUseOrdinal: 1,
    pendingLoss: null, pendingDomesticFoodUse: null,
  });
  expect(store.carrier.lots).toEqual([{
    id: store.identity.foodLotId,
    payload: { kind: "provision", lotId: store.identity.foodLotId, provision: "fresh-produce", quantity: 7 },
    materialState: { condition: 1_000_000, contamination: 0, decay: 0 },
  }]);
  expect(store.keeperKnowledge).toHaveLength(1);
  const evidence = store.keeperKnowledge[0]!;
  expect(evidence).toMatchObject({
    risk: "food-exposed", source: "direct-observation", sourceActorId: keeper.identity.stableId,
    learnedAtTick: initial.meta.completedTick + 1,
  });
  expect(projectSettlementKeeperStoreClosureAuthority(store)).toMatchObject({
    transactionId: store.lastClosureTransactionId, sourceEvidenceId: evidence.evidenceId,
    keeperActorId: keeper.identity.stableId, storeId: store.identity.storeId,
    source: "direct-observation", sourceActorId: keeper.identity.stableId,
    sourceEvidenceAtTick: evidence.learnedAtTick,
  });
  // Keep an exact full-cohort oracle after the meaningful behavior assertions.
  expect(bodyDigest).toBe(bodyDigests[seed]);
}

/** Retained real contact hearing is knowledge, not disposable diagnostics. */
function assertResidentContactHearing(envelope: Record<string, unknown>, seed: string): void {
  const world = deserializeWorld(envelope.world as string);
  const listeners = world.residents.map((resident) => ({
    resident,
    // This production sample namespace belongs to accepted resident surface
    // contact, not speech, player movement, or identified visual observation.
    beliefs: resident.perception.beliefs.filter(({ sourceObservationId }) => (
      sourceObservationId.includes("-prc-")
    )),
  })).filter(({ beliefs }) => beliefs.length > 0);
  expect(listeners.flatMap(({ beliefs }) => beliefs)).toHaveLength(
    seed === "runtime baseline estuary" ? 50 : 0,
  );
  expect(listeners.map(({ resident }) => resident.id)).toEqual(
    seed === "runtime baseline estuary"
      ? [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 82, 83, 84, 85, 86, 87]
      : [],
  );
  const contacts = listeners.flatMap(({ beliefs }) => beliefs);
  expect(contacts.filter(({ perceivedClass }) => perceivedClass === "physical-thud"))
    .toHaveLength(seed === "runtime baseline estuary" ? 34 : 0);
  expect(contacts.filter(({ perceivedClass }) => perceivedClass === "physical-slosh"))
    .toHaveLength(seed === "runtime baseline estuary" ? 16 : 0);
  for (const { resident, beliefs } of listeners) {
    for (const belief of beliefs) {
      expect(belief).toMatchObject({
        channel: "hearing",
        identification: "anonymous", subjectId: null, strongInterrupt: false,
      });
      expect(["physical-thud", "physical-slosh"]).toContain(belief.perceivedClass);
      expect(belief.sourceObservationId).toMatch(new RegExp(
        `^hp-h-(421|422|423)-${resident.id}-prc-[0-9a-f]{16}$`,
      ));
      expect(belief.firstObservedTick).toBeGreaterThan(world.meta.completedTick - 3);
      expect(belief.lastObservedTick).toBeLessThanOrEqual(world.meta.completedTick);
      expect(belief.area.radiusUnits).toBeGreaterThan(0);
    }
  }
}

async function assertEqualUninstrumentedWork(seed: string, worldJson: string): Promise<void> {
  const repository = new MemoryRepository();
  const runtime = await createTideweftRuntime(repository);
  try {
    beginFreshWorld(runtime, seed);
    expect(runtime.getPerformanceTelemetry().fixedStep.enabled).toBe(false);
    expect(runtime.getPerformanceTelemetry().worldAdvanceStep.enabled).toBe(false);
    advancePlayerSteps(runtime, 30);
    await runtime.save();
    expect(repository.snapshot().worldJson).toBe(worldJson);
  } finally {
    runtime.destroy();
  }
}

describe("runtime performance telemetry", () => {
  it.each(["runtime baseline estuary", "breathing room regional density 8"])(
    "characterizes equal accepted work and repeated habitat encodes: %s",
    async (seed) => {
      const repository = new MemoryRepository();
      const runtime = await createTideweftRuntime(repository);
      try {
        beginFreshWorld(runtime, seed);
        runtime.setPerformanceTelemetryEnabled(true);
        runtime.resetPerformanceTelemetry();
        const originalEncoder = canonicalUtil.stableStringify;
        const originalHasher = canonicalUtil.hashCanonical;
        const breadthAdvances: Array<{
          frame: number; accepted: boolean; outputChildren: readonly object[];
          parents: Array<{
            kind: "lineage-shaped-hash" | "complete-patch-encoding";
            child: object; patchKey: string; completePatchCodeUnits: number;
          }>;
        }> = [];
        let activeBreadthAdvance: (typeof breadthAdvances)[number] | null = null;
        const recordBreadthParent = (
          value: unknown,
          kind: "lineage-shaped-hash" | "complete-patch-encoding",
          result: string,
        ) => {
          if (activeBreadthAdvance === null || typeof value !== "object" || value === null) return;
          const parent = value as Record<string, unknown>;
          const expectedKeys = kind === "lineage-shaped-hash"
            ? ["actorIds", "aggregates", "derivation", "groups", "originRegion", "patchKey", "populations"]
            : ["aggregatePopulations", "carcasses", "derivation", "groups", "mortalityTransactions",
              "nextMortalityOrdinal", "originRegion", "patchKey", "populations", "updatedAtTick", "version"];
          const keys = Object.keys(parent).sort();
          const child = parent.derivation;
          if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])
            || typeof parent.patchKey !== "string" || typeof child !== "object" || child === null
            || !("kind" in child) || child.kind !== CORE_ECOLOGY_BREADTH_DERIVATION_KIND
            || !Object.isFrozen(child)) return;
          activeBreadthAdvance.parents.push({
            kind, child, patchKey: parent.patchKey,
            completePatchCodeUnits: kind === "complete-patch-encoding" ? result.length : 0,
          });
        };
        const originalBreadthAdvance = breadthEcologyOwner.advanceRegionalBreadthEcologyActiveResidentsFromReceipt;
        const breadthAdvancer = vi.spyOn(breadthEcologyOwner, "advanceRegionalBreadthEcologyActiveResidentsFromReceipt")
          .mockImplementation((...args) => {
            const prior = activeBreadthAdvance;
            const observation: (typeof breadthAdvances)[number] = {
              frame: currentFrame, accepted: false, outputChildren: [], parents: [],
            };
            activeBreadthAdvance = observation;
            try {
              const result = originalBreadthAdvance(...args);
              observation.accepted = result !== null;
              observation.outputChildren = result?.residents.map(({ patch }) => patch.derivation) ?? [];
              breadthAdvances.push(observation);
              return result;
            } finally {
              activeBreadthAdvance = prior;
            }
          });
        const hasher = vi.spyOn(canonicalUtil, "hashCanonical").mockImplementation((value) => {
          // The saved original performs its real lexical encoding exactly once.
          // Observe the parent argument, not an invented recursive child call.
          const result = originalHasher(value);
          recordBreadthParent(value, "lineage-shaped-hash", result);
          return result;
        });
        const inputs = new Map<object, number>();
        let encodedCodeUnits = 0;
        let durableSignalEncodes = 0;
        let durableSignalCodeUnits = 0;
        let durableDerivationCodeUnits = 0;
        const durableHabitats = new Map<object, number>();
        const worldBindings: Array<{ frame: number; inputs: object[]; codeUnits: number; accepted: boolean }> = [];
        let activeWorldBinding: (typeof worldBindings)[number] | null = null;
        const originalWorldBinding = breadthHabitatOwner.canonicalCoreEcologyBreadthHabitatForWorld;
        const worldBinder = vi.spyOn(breadthHabitatOwner, "canonicalCoreEcologyBreadthHabitatForWorld")
          .mockImplementation((...args) => {
            const prior = activeWorldBinding;
            const observation = { frame: currentFrame, inputs: [] as object[], codeUnits: 0, accepted: false };
            activeWorldBinding = observation;
            try {
              const result = originalWorldBinding(...args);
              observation.accepted = result !== null;
              worldBindings.push(observation);
              return result;
            } finally {
              activeWorldBinding = prior;
            }
          });
        const originalMaterializer = coreEcology.setCoreEcologyAggregatePatchMaterializedActors;
        const inputIds = new WeakMap<object, number>();
        const materializationCalls: Array<{
          frame: number; inputId: number; patchKey: string; patchTick: number;
          requestedTick: number; memberCount: number; aggregateCount: number;
          groupCount: number; dueGroups: number; laggingAggregates: number;
          sameClock: boolean; emptyIds: boolean; allCoarse: boolean;
          eligible: boolean; byteEqual: boolean | null; sameObject: boolean;
        }> = [];
        const frameBuckets = new Map<number, "zero-step" | "accepted-nonadvancing" | "advancing-correlated">();
        let currentFrame = -1;
        const perceptionCellArrayIds = new WeakMap<object, number>();
        let nextPerceptionCellArrayId = 0;
        const perceptionCalls: Array<{
          frame: number; cellArrayId: number; columns: number; rows: number;
          valid: boolean; hypotCalls: number; detailVisibleNonplayer: number;
          signature: string; resultDigest: string;
        }> = [];
        const originalPerception = perceptionOwner.evaluatePerception;
        const originalHypot = Math.hypot;
        const perceptionEvaluator = vi.spyOn(perceptionOwner, "evaluatePerception")
          .mockImplementation((input) => {
            let hypotCalls = 0;
            // Count arithmetic only within this original-once pure evaluator.
            // Do not retain argument arrays or claim private-ray call counts.
            Math.hypot = (...values) => {
              hypotCalls += 1;
              return originalHypot(...values);
            };
            let result: perceptionOwner.PerceptionResult;
            try {
              result = originalPerception(input);
            } finally {
              Math.hypot = originalHypot;
            }
            let cellArrayId = perceptionCellArrayIds.get(input.cells);
            if (cellArrayId === undefined) {
              cellArrayId = nextPerceptionCellArrayId++;
              perceptionCellArrayIds.set(input.cells, cellArrayId);
            }
            perceptionCalls.push({
              frame: currentFrame, cellArrayId, columns: input.columns, rows: input.rows,
              valid: result.valid, hypotCalls,
              detailVisibleNonplayer: result.detailVisibleTileIndices.filter((index) => (
                index !== result.playerTileIndex
              )).length,
              signature: result.signature,
              // Complete disclosed arrays, partitions and signature. Use the
              // saved encoder outside the observed encoding families.
              resultDigest: createHash("sha256").update(originalEncoder(result)).digest("hex"),
            });
            return result;
          });
        let nextInputId = 0;
        let beforeFixedSteps = 0;
        let beforeAdvances = 0;
        const originalProject = projectionOwner.projectGameView;
        const seenTerrain = new WeakSet<object>([runtime.getRenderView().terrain.tiles]);
        const terrainProjections: Array<{ frame: number; newArray: boolean; cells: number }> = [];
        const projector = vi.spyOn(projectionOwner, "projectGameView").mockImplementation((...args) => {
          const result = originalProject(...args);
          const newArray = !seenTerrain.has(result.terrain.tiles);
          seenTerrain.add(result.terrain.tiles);
          terrainProjections.push({ frame: currentFrame, newArray, cells: result.terrain.tiles.length });
          return result;
        });
        const materializer = vi.spyOn(coreEcology, "setCoreEcologyAggregatePatchMaterializedActors")
          .mockImplementation((value, input) => {
            // The native owner validates and executes exactly once. These
            // observations neither replace its result nor authenticate input.
            const result = originalMaterializer(value, input);
            const patch = value as CoreEcologyAggregatePatchState;
            let inputId = inputIds.get(patch);
            if (inputId === undefined) {
              inputId = nextInputId++;
              inputIds.set(patch, inputId);
            }
            const sameClock = input.atTick === patch.updatedAtTick;
            const emptyIds = input.actorIds.length === 0;
            const allCoarse = patch.populations.every(({ members }) => (
              members.every(({ materialization }) => materialization === "coarse")
            ));
            const dueGroups = patch.groups.groups.filter(({ nextCoarseTick }) => (
              nextCoarseTick <= input.atTick
            )).length;
            const laggingAggregates = patch.aggregatePopulations.filter(({ updatedAtTick }) => (
              updatedAtTick !== input.atTick
            )).length;
            materializationCalls.push({
              frame: currentFrame, inputId, patchKey: patch.patchKey,
              patchTick: patch.updatedAtTick, requestedTick: input.atTick,
              memberCount: patch.populations.reduce((sum, { members }) => sum + members.length, 0),
              aggregateCount: patch.aggregatePopulations.length, groupCount: patch.groups.groups.length,
              dueGroups, laggingAggregates, sameClock, emptyIds, allCoarse,
              eligible: sameClock && emptyIds && allCoarse && dueGroups === 0 && laggingAggregates === 0,
              // Bypass the encoder spy so diagnostic reads do not inflate the
              // existing real habitat/durable-signal encoding census.
              byteEqual: sameClock && emptyIds && allCoarse
                ? originalEncoder(patch) === originalEncoder(result) : null,
              sameObject: result === patch,
            });
            return result;
          });
        const encoder = vi.spyOn(canonicalUtil, "stableStringify").mockImplementation((value) => {
          const encoded = originalEncoder(value);
          recordBreadthParent(value, "complete-patch-encoding", encoded);
          if (typeof value === "object" && value !== null && "ownerId" in value
            && value.ownerId === CORE_ECOLOGY_BREADTH_HABITAT_OWNER_ID) {
            inputs.set(value, (inputs.get(value) ?? 0) + 1);
            encodedCodeUnits += encoded.length;
            // Observe the two complete habitat encodings inside THIS actual
            // exported binding call, not adjacent global encoder invocations.
            // Cold no-hash validation inputs are not the final comparison.
            if (activeWorldBinding !== null && "derivationHash" in value) {
              activeWorldBinding.inputs.push(value);
              activeWorldBinding.codeUnits += encoded.length;
            }
          }
          if (typeof value === "object" && value !== null && "patchKey" in value
            && "derivation" in value && "groups" in value && Array.isArray(value.groups)) {
            durableSignalEncodes += 1;
            durableSignalCodeUnits += encoded.length;
            const derivation = value.derivation as Readonly<Record<string, unknown>> | null;
            durableDerivationCodeUnits += originalEncoder(derivation).length;
            if (derivation !== null && typeof derivation.habitat === "object"
              && derivation.habitat !== null) {
              durableHabitats.set(derivation.habitat, (durableHabitats.get(derivation.habitat) ?? 0) + 1);
            }
          }
          return encoded;
        });
        try {
          advancePlayerSteps(runtime, 30, (frame, phase) => {
            const counts = runtime.getPerformanceTelemetry();
            if (phase === "before") {
              currentFrame = frame;
              beforeFixedSteps = counts.fixedStep.totalCount;
              beforeAdvances = counts.worldAdvanceStep.totalCount;
            } else {
              frameBuckets.set(frame, counts.worldAdvanceStep.totalCount > beforeAdvances
                ? "advancing-correlated"
                : counts.fixedStep.totalCount > beforeFixedSteps ? "accepted-nonadvancing" : "zero-step");
              currentFrame = -1;
            }
          });
        } finally {
          encoder.mockRestore();
          materializer.mockRestore();
          projector.mockRestore();
          worldBinder.mockRestore();
          hasher.mockRestore();
          breadthAdvancer.mockRestore();
          perceptionEvaluator.mockRestore();
        }
        const telemetry = runtime.getPerformanceTelemetry();
        expect(telemetry.fixedStep.totalCount).toBe(30);
        expect(telemetry.worldAdvanceStep.totalCount).toBe(3);
        await runtime.save();
        const worldJson = repository.snapshot().worldJson;
        // Complete current-save equality precedes characterization: diagnostics
        // cannot change any world, custody, knowledge, session or integrity byte.
        await assertEqualUninstrumentedWork(seed, worldJson);
        const digest = createHash("sha256").update(worldJson).digest("hex");
        expect(Math.hypot).toBe(originalHypot);
        expect(perceptionCalls.length).toBeGreaterThan(0);
        expect(perceptionCalls.every(({ frame, valid, columns, rows }) => (
          frameBuckets.has(frame) && valid && columns === 120 && rows === 120
        ))).toBe(true);
        expect(perceptionCalls.every(({ hypotCalls, detailVisibleNonplayer }) => (
          hypotCalls > 0 && detailVisibleNonplayer > 0
        ))).toBe(true);
        expect(nextPerceptionCellArrayId).toBe(3);
        expect(perceptionCalls.map(({ frame, cellArrayId }) => [frame, cellArrayId]))
          .toEqual([[10, 0], [20, 1], [30, 2]]);
        for (const call of perceptionCalls) {
          expect(call).toMatchObject(seed === "runtime baseline estuary" ? {
            hypotCalls: 323_681, detailVisibleNonplayer: 1791,
            signature: "perception-v3:c3552d11",
            resultDigest: "3ad52fdaabf936e5c964be4dc03a12482196759fa8d13af630b542e0fcc97eac",
          } : {
            hypotCalls: 255_320, detailVisibleNonplayer: 1176,
            signature: "perception-v3:baaf234e",
            resultDigest: "c37a956207c4221541e02cae0bcbebfb53de8e238d0e64d4b868d128e0ddcfe5",
          });
        }
        // Posthoc child sizing is outside every observer and the world steps.
        // Keep all matching parents, including durable-batch work; this scope
        // does not identify individual private callers or measure CPU time.
        const breadthParentCensus = breadthAdvances.map((observation) => {
          const children = [...new Set(observation.parents.map(({ child }) => child))];
          return {
            frame: observation.frame, accepted: observation.accepted,
            children: children.map((child) => {
              const parents = observation.parents.filter((parent) => parent.child === child);
              return {
                patchKeys: [...new Set(parents.map(({ patchKey }) => patchKey))].sort(),
                childCodeUnits: originalEncoder(child).length,
                frozenHabitat: "habitat" in child && Object.isFrozen(child.habitat),
                outputChild: observation.outputChildren.includes(child),
                lineageParents: parents.filter(({ kind }) => kind === "lineage-shaped-hash").length,
                completePatchParents: parents.filter(({ kind }) => kind === "complete-patch-encoding").length,
                completePatchCodeUnits: parents.filter(({ kind }) => kind === "complete-patch-encoding")
                  .reduce((sum, { completePatchCodeUnits }) => sum + completePatchCodeUnits, 0),
              };
            }),
          };
        });
        expect(breadthParentCensus.map(({ frame }) => frame)).toEqual([10, 20, 30]);
        expect(breadthParentCensus.every(({ frame }) => frameBuckets.has(frame))).toBe(true);
        for (const { accepted, children } of breadthParentCensus) {
          expect(accepted).toBe(true);
          expect(children.every(({ patchKeys, frozenHabitat }) => patchKeys.length === 1 && frozenHabitat)).toBe(true);
          // Density8 also includes two durable-batch children and extra parent
          // encodes. Preserve those occurrences instead of selecting one pair.
          const counts = children.map(({ outputChild, lineageParents, completePatchParents }) => (
            `${outputChild}:${lineageParents}:${completePatchParents}`
          )).sort();
          expect(counts).toEqual((seed === "runtime baseline estuary"
            ? Array<string>(15).fill("true:1:1")
            : ["false:0:1", "false:0:1", ...Array<string>(8).fill("true:1:1"), "true:2:2", "true:2:2"]
          ).sort());
        }
        expect(worldBindings.length).toBeGreaterThan(0);
        expect(worldBindings.every(({ frame, accepted }) => frameBuckets.has(frame) && accepted)).toBe(true);
        // Retain the exact native pairs characterized before the discarded
        // identity shortcut; both full encodings remain on this boundary.
        expect(worldBindings.every(({ inputs }) => inputs.length === 2 && inputs[0] === inputs[1])).toBe(true);
        expect(materializationCalls.length).toBeGreaterThan(0);
        expect(materializationCalls.every(({ frame }) => frameBuckets.has(frame))).toBe(true);
        expect(terrainProjections.length).toBeGreaterThan(0);
        expect(terrainProjections.every(({ frame }) => frameBuckets.has(frame))).toBe(true);
        expect(terrainProjections.every(({ cells }) => cells === 14_400)).toBe(true);
        expect(terrainProjections).toHaveLength(30);
        expect(terrainProjections.filter(({ newArray }) => newArray)).toHaveLength(3);
        expect(terrainProjections.filter(({ newArray }) => newArray)
          .every(({ frame }) => frameBuckets.get(frame) === "advancing-correlated")).toBe(true);
        expect(materializationCalls.filter(({ eligible }) => eligible).length).toBeGreaterThan(0);
        expect(materializationCalls.filter(({ eligible }) => eligible)
          .every(({ byteEqual }) => byteEqual === true)).toBe(true);
        const repeatedInputs = new Map<string, number>();
        const sourceCounts = new Map<string, {
          calls: number; eligible: number; eligibleBytesEqual: number; sameObjects: number;
          memberCount: number; aggregateCount: number; groupCount: number;
        }>();
        for (const call of materializationCalls) {
          const repetitionKey = `${call.inputId}:${call.requestedTick}`;
          repeatedInputs.set(repetitionKey, (repeatedInputs.get(repetitionKey) ?? 0) + 1);
          const counts = sourceCounts.get(call.patchKey) ?? {
            calls: 0, eligible: 0, eligibleBytesEqual: 0, sameObjects: 0,
            memberCount: call.memberCount, aggregateCount: call.aggregateCount, groupCount: call.groupCount,
          };
          counts.calls += 1;
          counts.eligible += Number(call.eligible);
          counts.eligibleBytesEqual += Number(call.eligible && call.byteEqual);
          counts.sameObjects += Number(call.sameObject);
          sourceCounts.set(call.patchKey, counts);
        }
        if (process.env.TIDEWEFT_WORLD_ADVANCE_DIAGNOSTICS === "1") process.stdout.write(`world-advance-characterization ${JSON.stringify({
          seed, acceptedSteps: 30, advances: 3, saveBytes: Buffer.byteLength(worldJson), digest,
          habitatEncodes: [...inputs.values()].reduce((sum, count) => sum + count, 0),
          uniqueHabitatInputs: inputs.size, encodedCodeUnits,
          perInputEncodes: [...inputs.values()].sort((left, right) => left - right),
          durableSignalEncodes, durableSignalCodeUnits, durableDerivationCodeUnits,
          uniqueDurableHabitats: durableHabitats.size,
          perDurableHabitatEncodes: [...durableHabitats.values()].sort((left, right) => left - right),
          breadthParents: {
            scope: "original-once exported advance; exact-shape parent encoder arguments sharing a frozen derivation; all occurrences retained; not recursive child-call/private-caller/CPU counts",
            advances: breadthParentCensus,
          },
          perceptionEvaluation: {
            scope: "original-once evaluator inside31callbacks; complete result digests and scoped Math.hypot calls; not private-ray counts, CPU timing or removable cost; current detail-visible nonplayer cells prove a lower bound on twice-successful terrain/detail ray paths",
            uniqueCellArrays: nextPerceptionCellArrayId,
            calls: perceptionCalls.map((call) => ({ ...call, bucket: frameBuckets.get(call.frame) })),
          },
          worldBinding: {
            scope: "original-once exported habitat world-binding calls inside31callbacks; setup/save excluded; not a timed profile",
            calls: worldBindings.length,
            sameObjectPairs: worldBindings.filter(({ inputs }) => inputs.length === 2 && inputs[0] === inputs[1]).length,
            completeHabitatEncodes: worldBindings.reduce((sum, { inputs }) => sum + inputs.length, 0),
            encodedCodeUnits: worldBindings.reduce((sum, { codeUnits }) => sum + codeUnits, 0),
          },
          terrainProjection: {
            scope: "successful original-once projections; first-seen arrays exclude setup/save; not CPU or heap allocation counts",
            calls: terrainProjections.length,
            newArrays: terrainProjections.filter(({ newArray }) => newArray).length,
            newCells: terrainProjections.reduce((sum, { newArray, cells }) => sum + (newArray ? cells : 0), 0),
            byCallback: ["zero-step", "accepted-nonadvancing", "advancing-correlated"].map((bucket) => ({
              bucket, calls: terrainProjections.filter(({ frame }) => frameBuckets.get(frame) === bucket).length,
              newArrays: terrainProjections.filter(({ frame, newArray }) => newArray && frameBuckets.get(frame) === bucket).length,
            })),
          },
          materialization: {
            scope: "successful native setter calls inside 31 callbacks; setup/save excluded; not a timed profile",
            calls: materializationCalls.length, uniqueInputs: nextInputId,
            perExactInputAndTickCalls: [...repeatedInputs.values()].sort((left, right) => left - right),
            eligible: materializationCalls.filter(({ eligible }) => eligible).length,
            sameClockEmptyCoarseButDue: materializationCalls.filter((call) => (
              call.sameClock && call.emptyIds && call.allCoarse && !call.eligible
            )).length,
            byCallback: ["zero-step", "accepted-nonadvancing", "advancing-correlated"].map((bucket) => ({
              bucket, calls: materializationCalls.filter(({ frame }) => frameBuckets.get(frame) === bucket).length,
              eligible: materializationCalls.filter(({ frame, eligible }) => eligible && frameBuckets.get(frame) === bucket).length,
            })),
            sources: [...sourceCounts].sort(([left], [right]) => left.localeCompare(right)),
          },
        })}\n`);
        const envelope = JSON.parse(worldJson) as Record<string, unknown>;
        expect(envelope.version).toBe(CURRENT_GAME_SAVE_VERSION);
        expect(envelope.playerExpressionRecency).toEqual(createPlayerExpressionRecencyState(
          deserializeWorld(envelope.world as string).meta.rootSeed,
        ));
        const player = envelope.player as Record<string, unknown>;
        expect(player.animalCallKnowledge).toEqual(createPlayerAnimalCallKnowledge());
        expect(Object.hasOwn(envelope, "playerEffortRecency")).toBe(false);
        expect(envelope.integrity).toBe(gameSaveEnvelopeIntegrity(envelope));
        // Civic work deliberately adds real motion and its lawful observation
        // consequences. The historical 6215116/outer47 hashes remain evidence
        // of that older executable state (Research), not a current equality
        // promise. Independent real d85/v5 and candidate/v6 captures additionally
        // establish only protocol/null-pickup metadata changes in these scenarios
        // (Research): no synthetic downgrade/reseal replaces current truth.
        // Independent fd19430/v6 and current/v7 captures likewise differ only
        // in version, owner, nullable travel metadata and enclosing checksums;
        // the stationary work has no accepted journey to change behavior.
        // Freeze the entire current save, including all meaningful consequences.
        assertStationaryCivicWorld(envelope, seed);
        // Committed dry contact adds anonymous hearing; occupied shallow-source
        // service egress changes real poses and therefore the heard causes.
        // Independent exact-checkpoint captures explain both changes (Research).
        // Neither knowledge nor bodies are stripped to restore an older hash.
        // Occupied-source water now supplies earlier before-anchored slosh.
        // The unchanged earliest-eight budget admits those real causes before
        // later dry contacts; a retained thirty-step capture differs only in
        // anonymous physical perception and its enclosing checksum/integrity.
        // Full bodies, other knowledge, economy/custody and dense bytes match.
        assertResidentContactHearing(envelope, seed);
        if (seed === "runtime baseline estuary") {
          const session = envelope.session as Record<string, unknown>;
          expect(session.announcement).toEqual({
            id: 2,
            message: "Domestic chicken eats one produce unit from the open store. The physical stock is reduced.",
            assertive: false,
          });
          expect(session.nextAnnouncementId).toBe(3);
        } else {
          const observedWorld = deserializeWorld(envelope.world as string);
          const newlyObserved = observedWorld.events.find(({ sequence }) => sequence === 7);
          expect(newlyObserved).toEqual({
            data: {
              destinationSettlementId: 6,
              originSettlementId: 3,
              playerObserved: true,
              quantity: 14,
              resource: "reed",
            },
            sequence: 7,
            subjectId: 132,
            tick: 420,
            type: "contract-offered",
          });
        }
        const baselineDigests: Readonly<Record<string, string>> = {
          "runtime baseline estuary": "922d9c808e418f350cf9ad7f97a4544b8663080e0f328fc9eeea94b9d870ec56",
          "breathing room regional density 8": "a7b713dd04b7e96e637c441c313ef6bc4b124715ff2ebf4fd39301c5dbbe2944",
        };
        expect(createHash("sha256").update(worldJson).digest("hex")).toBe(baselineDigests[seed]);
      } finally {
        runtime.destroy();
      }

    },
  );

  it("starts a replacement world on a fresh fixed-step phase", async () => {
    const runtime = await createTideweftRuntime(new MemoryRepository());
    runtime.start();
    takeScheduledFrame("runtime did not schedule its title frame")(100);
    takeScheduledFrame("runtime lost its title frame loop")(175);

    beginFreshWorld(runtime, "fresh fixed step phase");
    runtime.setPerformanceTelemetryEnabled(true);
    takeScheduledFrame("new world lost its scheduled frame")(200);
    expect(runtime.getPerformanceTelemetry().fixedStep.count).toBe(0);
    expect(runtime.getPerformanceTelemetry().fixedStep.totalCount).toBe(0);

    takeScheduledFrame("new world lost its second frame")(300);
    expect(runtime.getPerformanceTelemetry().fixedStep.count).toBe(1);
    expect(runtime.getPerformanceTelemetry().fixedStep.totalCount).toBe(1);
    runtime.destroy();
  });

  it("records bounded stage timings and live actor counts without entering save authority", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    beginFreshWorld(runtime, TELEMETRY_WORLD_SEED);

    const before = runtime.getPerformanceTelemetry();
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.counts)).toBe(true);
    expect(Object.isFrozen(before.resources)).toBe(true);
    expect(Object.isFrozen(before.resources.regions)).toBe(true);
    expect(Object.isFrozen(before.resources.caches)).toBe(true);
    expect(Object.isFrozen(before.resources.pending)).toBe(true);
    expect(Object.isFrozen(before.resources.limits)).toBe(true);
    expect(Object.isFrozen(before.resources.limits.regions)).toBe(true);
    expect(Object.isFrozen(before.resources.limits.caches)).toBe(true);
    expect(Object.isFrozen(before.resources.limits.pending)).toBe(true);
    expect(Object.isFrozen(before.fixedStep)).toBe(true);
    expect(Object.isFrozen(before.worldAdvancePhases)).toBe(true);
    expect(Object.keys(before.worldAdvancePhases).sort()).toEqual(WORLD_ADVANCE_PHASE_KEYS);
    for (const phase of Object.values(before.worldAdvancePhases)) {
      expect(Object.isFrozen(phase)).toBe(true);
      expect(phase.enabled).toBe(false);
      expect(phase.count).toBe(0);
      expect(phase.totalCount).toBe(0);
    }
    expect(before.fixedStep.enabled).toBe(false);
    expect(before.worldAdvanceStep.enabled).toBe(false);
    expect(before.viewProjection.enabled).toBe(false);
    expect(before.audioProjection.enabled).toBe(false);
    expect(before.saveSnapshot.enabled).toBe(false);
    expect(before.lastSerializedSaveBytes).toBe(0);
    expect(Object.keys(before.resources).sort()).toEqual([
      "caches",
      "limits",
      "pending",
      "regions",
    ]);
    expect(Object.keys(before.resources.regions).sort()).toEqual([
      "activeEcologyRegions",
      "chartedRegionRecords",
      "durableEcologyRegionRecords",
      "durableTerrainRegionRecords",
      "inactiveCargoRegionWorlds",
      "loadedTerrainRegions",
    ]);
    expect(Object.keys(before.resources.caches).sort()).toEqual([
      "activityAuthorityReceipts",
      "alpineHabitats",
      "alpineRidgeAuthorities",
      "breadthHabitats",
      "breadthPreparationSlots",
      "coldShoreHabitats",
      "outdoorIlluminationFields",
      "polarConsumerAuthorities",
      "polarConsumerHabitats",
      "polarShoreHabitats",
      "regionTerrainValues",
      "regionalHabitats",
      "registeredTerrainGeneratorRegions",
      "registeredTerrainGeneratorSeeds",
      "runtimeCompatibilityHabitats",
    ]);
    expect(Object.keys(before.resources.pending).sort()).toEqual([
      "activeSaveWorkers",
      "queuedCommands",
      "queuedSaveSnapshots",
      "registeredTerrainPrefetchJobs",
      "runtimeTerrainPrefetchJobs",
      "saveWaiters",
    ]);
    expect(Object.keys(before.resources.limits.regions).sort())
      .toEqual(Object.keys(before.resources.regions).sort());
    expect(Object.keys(before.resources.limits.caches).sort())
      .toEqual(Object.keys(before.resources.caches).sort());
    expect(Object.keys(before.resources.limits.pending).sort()).toEqual([
      "activeSaveWorkers",
      "queuedSaveSnapshots",
      "runtimeTerrainPrefetchJobs",
    ]);
    for (const count of [
      ...Object.values(before.resources.regions),
      ...Object.values(before.resources.caches),
      ...Object.values(before.resources.pending),
      ...Object.values(before.resources.limits.regions),
      ...Object.values(before.resources.limits.caches),
      ...Object.values(before.resources.limits.pending),
    ]) {
      expect(Number.isSafeInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    for (const name of Object.keys(before.resources.regions) as Array<
      keyof typeof before.resources.regions
    >) {
      expect(before.resources.regions[name])
        .toBeLessThanOrEqual(before.resources.limits.regions[name]);
    }
    for (const name of Object.keys(before.resources.caches) as Array<
      keyof typeof before.resources.caches
    >) {
      expect(before.resources.caches[name])
        .toBeLessThanOrEqual(before.resources.limits.caches[name]);
    }
    expect(before.resources.pending.runtimeTerrainPrefetchJobs)
      .toBeLessThanOrEqual(before.resources.limits.pending.runtimeTerrainPrefetchJobs);
    expect(before.resources.pending.queuedSaveSnapshots)
      .toBeLessThanOrEqual(before.resources.limits.pending.queuedSaveSnapshots);
    expect(before.resources.pending.activeSaveWorkers)
      .toBeLessThanOrEqual(before.resources.limits.pending.activeSaveWorkers);
    expect(before.resources.limits.regions.loadedTerrainRegions).toBe(5);
    expect(before.resources.limits.regions.activeEcologyRegions).toBe(9);
    expect(before.resources.limits.regions.chartedRegionRecords).toBe(131_072);
    expect(before.resources.limits.regions.inactiveCargoRegionWorlds).toBe(131_071);
    expect(before.resources.limits.caches.regionTerrainValues).toBe(9);
    expect(before.resources.limits.caches.registeredTerrainGeneratorSeeds).toBe(2);
    expect(before.resources.limits.caches.registeredTerrainGeneratorRegions).toBe(24);
    expect(before.resources.limits.caches.outdoorIlluminationFields).toBe(4);
    expect(before.resources.limits.caches.regionalHabitats).toBe(128);
    expect(before.resources.limits.caches.runtimeCompatibilityHabitats).toBe(264);
    expect(before.resources.limits.caches.alpineRidgeAuthorities).toBe(64);
    expect(before.resources.limits.caches.polarConsumerAuthorities).toBe(64);
    expect(before.resources.limits.caches.activityAuthorityReceipts).toBe(128);
    expect(before.resources.limits.caches.breadthPreparationSlots).toBe(1);
    expect(before.resources.limits.pending.runtimeTerrainPrefetchJobs).toBe(9);
    expect(before.counts).toEqual({
      actorsTotal: 0,
      actorsMaterialized: 0,
      actorsVisible: 0,
      humans: 0,
      humansVisible: 0,
      dogs: 0,
      dogsVisible: 0,
      wildlifeActorRecords: 0,
      wildlifePopulationUnits: 0,
      wildlifeAggregatePopulationUnits: 0,
      wildlifeMaterialized: 0,
      wildlifeVisible: 0,
    });

    const enabled = runtime.setPerformanceTelemetryEnabled(true);
    expect(enabled.fixedStep.enabled).toBe(true);
    expect(enabled.worldAdvanceStep.enabled).toBe(true);
    for (const phase of Object.values(enabled.worldAdvancePhases)) {
      expect(phase.enabled).toBe(true);
    }
    expect(enabled.viewProjection.enabled).toBe(true);
    expect(enabled.audioProjection.enabled).toBe(true);
    expect(enabled.saveSnapshot.enabled).toBe(true);

    advancePlayerSteps(runtime, 10);
    const afterSteps = runtime.getPerformanceTelemetry();
    expect(afterSteps.fixedStep.count - before.fixedStep.count).toBe(10);
    expect(afterSteps.fixedStep.totalCount - before.fixedStep.totalCount).toBe(10);
    expect(afterSteps.worldAdvanceStep.count - before.worldAdvanceStep.count).toBe(1);
    expect(afterSteps.worldAdvanceStep.totalCount - before.worldAdvanceStep.totalCount).toBe(1);
    for (const phase of Object.values(afterSteps.worldAdvancePhases)) {
      expect(phase.count).toBe(afterSteps.worldAdvanceStep.count);
      expect(phase.totalCount).toBe(afterSteps.worldAdvanceStep.totalCount);
      expect(phase.meanMs).toBeGreaterThan(0);
    }
    const attributedWorldAdvanceMeanMs = Object.values(afterSteps.worldAdvancePhases)
      .reduce((total, phase) => total + phase.meanMs, 0);
    expect(attributedWorldAdvanceMeanMs).toBeLessThanOrEqual(
      afterSteps.worldAdvanceStep.meanMs,
    );
    expect(afterSteps.viewProjection.count - before.viewProjection.count).toBe(10);
    expect(afterSteps.viewProjection.totalCount - before.viewProjection.totalCount).toBe(10);
    expect(afterSteps.audioProjection.count - before.audioProjection.count).toBe(10);
    expect(afterSteps.audioProjection.totalCount - before.audioProjection.totalCount).toBe(10);
    expect(afterSteps.fixedStep.meanMs).toBeGreaterThan(0);
    expect(afterSteps.worldAdvanceStep.maxMs).toBeGreaterThan(0);
    expect(afterSteps.viewProjection.p99Ms).toBeGreaterThan(0);
    expect(afterSteps.audioProjection.p99Ms).toBeGreaterThan(0);
    expect(afterSteps.counts.humans).toBeGreaterThan(0);
    expect(afterSteps.counts.dogs).toBeGreaterThan(0);
    expect(afterSteps.counts.wildlifeActorRecords).toBeGreaterThanOrEqual(
      afterSteps.counts.wildlifeMaterialized,
    );
    expect(afterSteps.counts.wildlifePopulationUnits).toBeGreaterThanOrEqual(
      afterSteps.counts.wildlifeActorRecords,
    );
    expect(afterSteps.counts.wildlifeMaterialized).toBeGreaterThanOrEqual(
      afterSteps.counts.wildlifeVisible,
    );
    expect(afterSteps.counts.actorsTotal).toBe(
      afterSteps.counts.humans
      + afterSteps.counts.dogs
      + afterSteps.counts.wildlifeActorRecords,
    );
    expect(afterSteps.counts.actorsMaterialized).toBe(
      afterSteps.counts.humans
      + afterSteps.counts.dogs
      + afterSteps.counts.wildlifeMaterialized,
    );
    expect(afterSteps.counts.actorsVisible).toBe(
      afterSteps.counts.humansVisible
      + afterSteps.counts.dogsVisible
      + afterSteps.counts.wildlifeVisible,
    );

    runtime.dispatchUI({ type: "settlement", action: "close" });
    const afterCommandProjection = runtime.getPerformanceTelemetry();
    expect(afterCommandProjection.viewProjection.count).toBe(
      afterSteps.viewProjection.count + 1,
    );
    expect(afterCommandProjection.viewProjection.totalCount).toBe(
      afterSteps.viewProjection.totalCount + 1,
    );
    expect(afterCommandProjection.audioProjection.count).toBe(
      afterSteps.audioProjection.count,
    );
    expect(afterCommandProjection.audioProjection.totalCount).toBe(
      afterSteps.audioProjection.totalCount,
    );

    const savesBefore = afterCommandProjection.saveSnapshot.count;
    await runtime.save();
    const afterSave = runtime.getPerformanceTelemetry();
    const saved = repository.snapshot();
    const envelope = JSON.parse(saved.worldJson) as Readonly<Record<string, unknown>>;
    expect(afterSave.saveSnapshot.count - savesBefore).toBe(1);
    expect(afterSave.saveSnapshot.totalCount).toBe(
      afterCommandProjection.saveSnapshot.totalCount + 1,
    );
    expect(afterSave.lastSerializedSaveBytes).toBe(
      new TextEncoder().encode(saved.worldJson).byteLength,
    );
    expect(envelope).not.toHaveProperty("performanceTelemetry");
    expect(envelope).not.toHaveProperty("telemetry");
    expect(envelope).not.toHaveProperty("resources");
    expect(saved.worldJson).not.toContain('"lastSerializedSaveBytes"');

    const reset = runtime.resetPerformanceTelemetry();
    expect(Object.isFrozen(reset)).toBe(true);
    expect(reset.fixedStep.count).toBe(0);
    expect(reset.fixedStep.totalCount).toBe(0);
    expect(reset.fixedStep.enabled).toBe(true);
    expect(reset.worldAdvanceStep.count).toBe(0);
    expect(reset.worldAdvanceStep.totalCount).toBe(0);
    for (const phase of Object.values(reset.worldAdvancePhases)) {
      expect(phase.enabled).toBe(true);
      expect(phase.count).toBe(0);
      expect(phase.totalCount).toBe(0);
    }
    expect(reset.viewProjection.count).toBe(0);
    expect(reset.viewProjection.totalCount).toBe(0);
    expect(reset.audioProjection.count).toBe(0);
    expect(reset.audioProjection.totalCount).toBe(0);
    expect(reset.saveSnapshot.count).toBe(0);
    expect(reset.saveSnapshot.totalCount).toBe(0);
    expect(reset.counts).toEqual(afterSave.counts);
    expect(reset.resources).toEqual(afterSave.resources);
    expect(reset.lastSerializedSaveBytes).toBe(0);
    await runtime.save();
    expect(repository.snapshot().worldJson).toBe(saved.worldJson);
    runtime.destroy();

    const controlRepository = new MemoryRepository();
    const control = await createTideweftRuntime(controlRepository);
    beginFreshWorld(control, TELEMETRY_WORLD_SEED);
    advancePlayerSteps(control, 10);
    await control.save();
    expect(controlRepository.snapshot().worldJson).toBe(saved.worldJson);
    control.destroy();
  });
});
