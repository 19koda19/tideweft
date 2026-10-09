import { describe, expect, it, vi } from "vitest";

import { createActorPerceptionState, stepActorPerception } from "../sim/actorPerception";
import { createWorld, createWorldView } from "../sim/public";
import {
  replaceResidentActivity,
  RESIDENT_TRAVEL_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ACTIVITY_VERSION,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID,
  RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
  type ResidentPhysicalTravelTask,
} from "../sim/residentActivity";
import { canonicalResidentActivityForWorld } from "../sim/residentActivityWorld";
import { residentRestSurfaceObservationId } from "../sim/residentSurfaceKnowledge";
import { residentTravelLocation, residentTravelSegment, residentTravelSegmentPose } from "../sim/residentTravelRoute";
import { MAX_TIDE_LEVEL, tideAtTick } from "../sim/terrain";
import { FIXED_POINT } from "../sim/types";
import { stableStringify } from "../sim/util";
import { WORLD_NIGHT_START_TICK } from "../sim/worldTime";
import {
  collectExistingHumanObservations,
  createPhysicalSoundSample,
  HUMAN_PERCEPTION_MAX_OBSERVATIONS_PER_RESIDENT,
  humanObservationCollectionRejected,
  type HumanSupplementalListeningReceipt,
} from "./humanPerception";
import { headingFromRadians } from "./livingActor";
import { buildOutdoorIlluminationField } from "./outdoorIllumination";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { adoptResidentActivities } from "./residentActivityExecution";

const BASE = createWorld("resident travel ground producer foundation", "standard");

/**
 * Synthetic producer foundations, NOT native acceptance, autonomous travel or
 * complete-save proof. Generated IDs/cardinal routes remain real; transit and
 * the initial body are explicit protocol inputs. Flat ground, weather, clock
 * and one wet endpoint isolate the actual shared sensory admission.
 */
function fixture(options: { readonly legacy?: "v7" | "coarse" | "absent"; readonly night?: boolean; readonly away?: boolean; readonly dry?: boolean } = {}) {
  const state = structuredClone(BASE);
  if (options.night) {
    state.meta.completedTick = WORLD_NIGHT_START_TICK;
    state.tide = tideAtTick(state.meta.completedTick);
    for (const resident of state.residents) resident.perception = createActorPerceptionState(resident.identity.stableId, state.meta.completedTick);
  }
  const tick = state.meta.completedTick;
  state.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: tick + 1_000 };
  for (const tile of state.terrain.tiles) Object.assign(tile, { terrain: "meadow", elevation: MAX_TIDE_LEVEL + 1, roughness: 0, baseTravelCost: 1_000 });
  for (const resident of state.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    resident.condition.exhaustion = 100_000;
  }
  if (options.legacy === "absent") {
    expect(state.residents.every((resident) => !Object.hasOwn(resident, "activity") && !Object.hasOwn(resident, "circadian"))).toBe(true);
  }
  expect(adoptResidentActivities(state)).toBe(true);
  const selected = [...state.residents].sort((left, right) => left.identity.stableId.localeCompare(right.identity.stableId))[0]!;
  if (selected.location.kind !== "settlement") throw new Error("Generated observer must start at a settlement");
  const originId = selected.location.settlementId;
  const route = state.routes.find((candidate) => candidate.fromSettlementId === originId || candidate.toSettlementId === originId)!;
  const destinationId = route.fromSettlementId === originId ? route.toSettlementId : route.fromSettlementId;
  const contract = { ...state.contracts[0]!, originSettlementId: originId, destinationSettlementId: destinationId,
    requesterResidentId: state.settlements.find(({ id }) => id === destinationId)!.residentIds[0]!,
    status: "in-transit" as const, carrierKind: "resident" as const, assignedResidentId: selected.id,
    resource: "food" as const, quantity: 1, cargoQuantity: 1, createdTick: tick - 3,
    playerExclusiveUntilTick: tick - 3, acceptedTick: tick - 2, departedTick: tick - 1,
    arrivalTick: tick + 100, dueTick: tick + 600, completedTick: null, routeId: route.id,
    porterRouteIds: [route.id], porterSettlementIds: [originId, destinationId] };
  state.contracts[0] = contract;
  const stock = state.settlements.find(({ id }) => id === originId)!.inventory;
  expect(stock.food).toBeGreaterThan(0);
  stock.food -= 1;
  const task: ResidentPhysicalTravelTask = { kind: "contract-travel", contractId: contract.id, mode: "physical",
    legIndex: 0, waypointIndex: 1, selectedAtTick: contract.departedTick, lastProgressAtTick: tick,
    nextReassessmentAtTick: tick, phase: "approaching", waitReason: null };
  const segment = residentTravelSegment(state, contract, task)!;
  const pose = residentTravelSegmentPose(segment, 0);
  state.residents = state.residents.map((resident) => replaceResidentActivity(resident, {
    ...resident.activity!, version: options.legacy === "v7" ? RESIDENT_TRAVEL_ACTIVITY_VERSION : RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION,
    ownerId: options.legacy === "v7" ? RESIDENT_TRAVEL_ACTIVITY_OWNER_ID : RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_OWNER_ID,
    inspectionTask: null, pickupTask: null, travelTask: null,
  }));
  const get = () => state.residents.find(({ id }) => id === selected.id)!;
  get().activeContractId = contract.id;
  get().location = residentTravelLocation(segment, task, pose.position)!;
  get().activity = { ...get().activity!, poses: [{ ...pose, heading: options.away
    ? headingFromRadians(Math.atan2(-segment.directionY, -segment.directionX)) : pose.heading }],
    travelTask: options.legacy === "coarse" ? { kind: "contract-travel", contractId: contract.id, mode: "legacy-coarse", adoptedAtTick: tick } : task };
  expect(canonicalResidentActivityForWorld(state, get())).not.toBeNull();
  if (options.legacy === "absent") {
    // Reconstruct the constructor's exact pre-body extension absence. Adoption
    // created both roots; its physical-arrival receipt cannot survive alone
    // beside old settlement-membership semantics. No old receipt is discarded.
    state.residents = state.residents.map(({ activity: _activity, circadian: _circadian, ...resident }) => resident);
  }
  const targetIndex = Math.floor(segment.end.localY / 1_000) * state.terrain.width + Math.floor(segment.end.localX / 1_000);
  if (!options.dry) Object.assign(state.terrain.tiles[targetIndex]!, { terrain: "deep-water", elevation: state.tide.level - 10_000 });
  return { state, get, actorId: selected.identity.stableId, segment, target: segment.end };
}

function publish(current: ReturnType<typeof fixture>, origin = { x: -10, y: -10 }) {
  const economy = createWorldView(current.state);
  const window = createRegionalTerrainWindow(current.state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: current.state.meta.rootSeed }), origin);
  const world = createRegionalWorldView(economy, window,
    projectRegionalCartographyWindow(createRegionalCartography(current.state.meta.rootSeed), window));
  const sound = createPhysicalSoundSample({ id: "travel-ground-impact", sourceId: "OBJECT-TRAVEL-GROUND",
    acousticEventId: "acoustic:travel-ground", position: current.segment.start, soundClass: "physical-thud",
    soundLoudness: FIXED_POINT, soundRangeUnits: 8_000, soundInterrupt: "none" });
  if (!sound) throw new Error("Controlled hearing stimulus must be canonical");
  const input = { world, window, targetTick: current.state.meta.completedTick + 1, playerSamples: [],
    physicalSoundSamples: [sound], soundSamplePhases: [{ sampleId: sound.id, phase: 0 }] };
  return { ...current, world, window, input };
}

function observations(current: ReturnType<typeof publish>) {
  const before = stableStringify(current.input);
  const batches = collectExistingHumanObservations(current.input);
  expect(humanObservationCollectionRejected(batches)).toBe(false);
  expect(stableStringify(current.input)).toBe(before);
  const selected = batches.find(({ observerId }) => observerId === current.actorId);
  expect(selected).toBeDefined();
  return selected!.observations;
}

describe("authenticated next travel-segment qualitative sight", () => {
  it.each([false, true])("adds only one non-threatening dry=%s ground fact at the next endpoint while preserving hearing", (dry) => {
    const current = publish(fixture({ dry }));
    const before = stableStringify(current.state);
    const seen = observations(current);
    const information = seen.filter(({ interrupt }) => interrupt === "information");
    expect(information).toHaveLength(1);
    expect(information[0]).toMatchObject({ id: residentRestSurfaceObservationId(current.actorId, current.target),
      observerId: current.actorId, observedAtTick: current.input.targetTick, channel: "vision",
      perceivedClass: dry ? "dry-ground" : "water-covered-ground", subjectId: null, identification: "classified",
      area: { center: current.target, radiusUnits: 0 }, interrupt: "information" });
    expect(information[0]!.confidence).toBeGreaterThan(0);
    expect(information[0]!.salience).toBeLessThanOrEqual(300_000);
    expect(seen.filter(({ channel }) => channel === "hearing")).toHaveLength(1);
    expect(seen.length).toBeLessThanOrEqual(HUMAN_PERCEPTION_MAX_OBSERVATIONS_PER_RESIDENT);
    const learned = stepActorPerception(current.get().perception, { tick: current.input.targetTick, observations: information });
    expect(learned).toMatchObject({ suspicionPressure: 0, search: null, salientMemory: [] });
    expect(stableStringify(current.state)).toBe(before);
  });

  it.each(["v7", "coarse", "absent"] as const)("does not grant new sight to %s travel", (legacy) => {
    const seen = observations(publish(fixture({ legacy })));
    expect(seen.some(({ interrupt }) => interrupt === "information")).toBe(false);
    expect(seen.some(({ channel }) => channel === "hearing")).toBe(true);
  });

  it.each(["away", "night"] as const)("does not reveal ground under %s sensory conditions", (condition) => {
    const current = publish(fixture({ [condition]: true }));
    if (condition === "night") {
      const index = (Math.floor(current.target.localY / 1_000) - current.window.origin.y) * current.world.terrain.width
        + Math.floor(current.target.localX / 1_000) - current.window.origin.x;
      expect(current.state.settlements.every(({ project }) => project.status !== "complete")).toBe(true);
      expect(buildOutdoorIlluminationField(current.world)?.physicalIllumination[index]).toBeLessThan(200_000);
    }
    const seen = observations(current);
    expect(seen.some(({ interrupt }) => interrupt === "information")).toBe(false);
    expect(seen.some(({ channel }) => channel === "hearing")).toBe(true);
  });

  it("treats an out-of-frame next endpoint as missing sight, not an invalid listener", () => {
    const current = fixture();
    const { directionX: dx, directionY: dy, end } = current.segment;
    const x = Math.floor(end.localX / 1_000);
    const y = Math.floor(end.localY / 1_000);
    const frame = publish(current, { x: dx > 0 ? x - 120 : dx < 0 ? x + 1 : x - 60,
      y: dy > 0 ? y - 120 : dy < 0 ? y + 1 : y - 60 });
    const seen = observations(frame);
    expect(seen.some(({ interrupt }) => interrupt === "information")).toBe(false);
    expect(seen.some(({ channel }) => channel === "hearing")).toBe(true);
  });

  it.each(["contract", "cursor", "route", "custody", "membership"] as const)("rejects an invalid %s reference without partial receipts", (kind) => {
    const current = fixture();
    const resident = current.get();
    const task = resident.activity!.travelTask!;
    if (task.mode !== "physical") throw new Error("Expected synthetic physical task");
    if (kind === "contract") resident.activity = { ...resident.activity!, travelTask: { ...task, contractId: task.contractId + 100_000 } };
    if (kind === "cursor") resident.activity = { ...resident.activity!, travelTask: { ...task, waypointIndex: 100_000 } };
    if (kind === "route") current.state.routes = current.state.routes.filter(({ id }) => id !== current.segment.route.id);
    if (kind === "custody") current.state.contracts[0]!.cargoQuantity = 0;
    if (kind === "membership" && resident.location.kind === "route") resident.location = { ...resident.location, progress: resident.location.progress + 1 };
    const frame = publish(current);
    const receipt = vi.fn<(receipts: readonly HumanSupplementalListeningReceipt[]) => void>();
    const before = stableStringify(frame.input);
    const batches = collectExistingHumanObservations(frame.input, receipt);
    expect(humanObservationCollectionRejected(batches)).toBe(true);
    expect(batches).toEqual([]);
    expect(receipt).not.toHaveBeenCalled();
    expect(stableStringify(frame.input)).toBe(before);
  });
});
