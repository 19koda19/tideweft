import { describe, expect, it } from "vitest";

import { ACTOR_PERCEPTION_SCALE, createActorObservation } from "../sim/actorPerception";
import { createWorld, createWorldView } from "../sim/public";
import { residentActivityPoseAtPhase } from "../sim/residentActivity";
import { MAX_TIDE_LEVEL } from "../sim/terrain";
import type { ResidentState, WorldView } from "../sim/types";
import { compareText, stableStringify } from "../sim/util";
import {
  propagateCoreEcologyAlarmObservationBatches,
  type CoreEcologyPerceptionFrameInput,
} from "./coreEcologyPerception";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  createCoreWildlifeActorState,
  stepCoreWildlifeActor,
} from "./coreWildlifeActor";
import { livingActorAddressForResident, type LivingActorAddress } from "./livingActor";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { residentPhaseZeroHearingAddress } from "./runtime";
import { translateWorldPosition } from "./worldPosition";

// Direct body/retained-alarm foundation evidence. These fixtures use the real
// rest and wildlife decision owners, not normal runtime adoption or outer-save
// support. The controlled predator observation is not a player encounter claim.
const BASE = createWorld("resident phase-zero alarm hearing", "standard");

function fixture(moving = true) {
  const state = structuredClone(BASE);
  state.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: state.meta.completedTick + 1_000 };
  for (const tile of state.terrain.tiles) {
    Object.assign(tile, { terrain: "meadow", elevation: MAX_TIDE_LEVEL + 1, roughness: 0, baseTravelCost: 1_000 });
  }
  for (const resident of state.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  const settlement = state.settlements.find(({ id, tileIndex }) => {
    const x = tileIndex % state.terrain.width;
    const y = Math.floor(tileIndex / state.terrain.width);
    return x >= 8 && y >= 8 && x + 8 < state.terrain.width && y + 8 < state.terrain.height
      && state.residents.filter((resident) => resident.homeSettlementId === id).length >= 5;
  });
  if (settlement === undefined) throw new Error("fixture needs a native settlement and five residents");
  const residents = state.residents.filter(({ homeSettlementId }) => homeSettlementId === settlement.id)
    .sort((left, right) => compareText(left.identity.stableId, right.identity.stableId) || left.id - right.id);
  const selected = residents[4]!;
  const actorId = selected.identity.stableId;
  const center = { x: settlement.tileIndex % state.terrain.width, y: Math.floor(settlement.tileIndex / state.terrain.width) };
  let alarm: ReturnType<typeof stepCoreWildlifeActor> = null;
  if (moving) {
    selected.needs.rest = 900_000;
    expect(adoptResidentActivities(state)).toBe(true);
    // Capture the native placement before a blocked corner forces a real turn.
    state.terrain.tiles[center.y * state.terrain.width + center.x + 1]!.terrain = "deep-water";
    expect(prepareResidentRestActivities(state)).toBe(true);
    const sourceResident = state.residents.find(({ identity }) => identity.stableId === actorId)!;
    const initial = residentActivityPoseAtPhase(sourceResident.activity, { actorId, tick: state.meta.completedTick }, 0);
    if (initial === null) throw new Error("fixture lost the phase-zero body");
    const caller = createCoreWildlifeActorState({
      seed: state.meta.rootSeed,
      species: "gull",
      originRegion: initial.position.region,
      populationKey: "resident-alarm-locus:gull",
      populationOrdinal: 0,
      position: translateWorldPosition(initial.position, 4_000, 0),
      tick: state.meta.completedTick - 1,
    });
    const observation = createActorObservation({
      id: `obs:${caller.identity.stableId}:controlled-predator`,
      observerId: caller.identity.stableId,
      observedAtTick: state.meta.completedTick,
      channel: "vision",
      perceivedClass: "large-predator",
      subjectId: `THREAT-${caller.identity.stableId}`,
      area: { center: caller.address.position, radiusUnits: 0 },
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
      identification: "identified",
    });
    if (observation === null) throw new Error("fixture predator evidence was rejected");
    alarm = stepCoreWildlifeActor(caller, {
      tick: state.meta.completedTick,
      observations: [observation],
      foodOpportunities: [],
      accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
    });
    if (alarm === null || alarm.event.kind !== "alarm") throw new Error("actual wildlife decision did not alarm");
    for (let phase = 1; phase <= 10; phase += 1) {
      expect(advanceResidentRestActivities(state, phase)).not.toBeNull();
    }
  }
  const economy = createWorldView(state);
  const window = createRegionalTerrainWindow(state.meta.rootSeed,
    createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed }),
    { x: center.x - 60, y: center.y - 60 });
  const world = createRegionalWorldView(economy, window,
    projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window), { immutable: true });
  const resident = economy.residents.find(({ identity }) => identity.stableId === actorId)!;
  const currentAddress = livingActorAddressForResident(economy, resident);
  if (currentAddress === null) throw new Error("fixture lost its current canonical human address");
  return { state, economy, world, window, resident, currentAddress, alarm };
}

describe("retained runtime resident alarm locus", () => {
  it("uses the actual phase-zero position and exact heading without changing its later body", () => {
    const current = fixture();
    const before = stableStringify(current);
    const expected = current.resident.activity!.poses[0]!;
    const retained = residentPhaseZeroHearingAddress(current.economy, current.currentAddress);
    expect(retained).not.toBeNull();
    expect(retained).toMatchObject({ position: expected.position, heading: expected.heading });
    expect(retained?.position).not.toEqual(current.currentAddress.position);
    expect(retained?.heading).not.toBe(current.currentAddress.heading);
    expect(Object.isFrozen(retained)).toBe(true);
    expect(Object.isFrozen(retained?.position.region)).toBe(true);
    for (const key of ["actorId", "species", "persistence", "version"] as const) {
      expect(retained?.[key]).toBe(current.currentAddress[key]);
    }
    expect(stableStringify(current)).toBe(before);
  });

  it("propagates the real retained alarm anonymously from the earlier listener pose without optional Voice inputs", () => {
    const current = fixture();
    const alarm = current.alarm;
    if (alarm === null) throw new Error("fixture omitted its committed alarm");
    const retained = residentPhaseZeroHearingAddress(current.economy, current.currentAddress);
    if (retained === null) throw new Error("fixture lost its retained listener");
    const frame: CoreEcologyPerceptionFrameInput = {
      actors: [alarm.actor],
      participants: [{ address: current.currentAddress, contactScope: "core-only" }],
      world: current.world,
      window: current.window,
      tick: current.economy.completedTick + 1,
    };
    const before = stableStringify({ current, frame });
    const earlier = propagateCoreEcologyAlarmObservationBatches(alarm.event, {
      ...frame, participants: [{ address: retained, contactScope: "core-only" }],
    })?.find(({ observerId }) => observerId === retained.actorId);
    const later = propagateCoreEcologyAlarmObservationBatches(alarm.event, frame)
      ?.find(({ observerId }) => observerId === retained.actorId);
    expect(earlier?.observations).toHaveLength(1);
    expect(later?.observations).toHaveLength(1);
    expect(earlier?.audibleContact).not.toBeNull();
    expect(later?.audibleContact).not.toBeNull();
    expect(earlier?.audibleContact).not.toEqual(later?.audibleContact);
    expect(earlier?.observations[0]).toMatchObject({
      observerId: retained.actorId,
      observedAtTick: frame.tick,
      channel: "hearing",
      perceivedClass: "animal-alarm",
      subjectId: null,
      identification: "anonymous",
    });
    for (const key of ["sourceActorId", "sourceId", "species", "expressionEventId", "acousticEventId"]) {
      expect(earlier?.observations[0]).not.toHaveProperty(key);
    }
    expect(stableStringify({ current, frame })).toBe(before);
  });

  it("preserves genuine legacy absence with the exact original address reference", () => {
    const current = fixture(false);
    const before = stableStringify(current);
    expect(Object.hasOwn(current.resident, "activity")).toBe(false);
    expect(residentPhaseZeroHearingAddress(current.economy, current.currentAddress)).toBe(current.currentAddress);
    expect(stableStringify(current)).toBe(before);
  });

  it.each(["empty-history", "partial", "stale-body", "foreign-body", "perception-tick", "perception-owner"] as const)(
    "rejects %s instead of using a current or invented body pose",
    (kind) => {
      const current = fixture();
      const resident = current.resident;
      if (kind === "empty-history") Object.assign(resident, { activity: { ...resident.activity, poses: [] } });
      else if (kind === "partial") Object.assign(resident, { activity: { version: resident.activity!.version } });
      else if (kind === "stale-body") Object.assign(resident, { activity: { ...resident.activity, tick: current.economy.completedTick - 1 } });
      else if (kind === "foreign-body") Object.assign(resident, { activity: { ...resident.activity, actorId: current.economy.residents.find(({ id }) => id !== resident.id)!.identity.stableId } });
      else if (kind === "perception-tick") resident.perception = { ...resident.perception, tick: current.economy.completedTick - 1 };
      else resident.perception = { ...resident.perception, actorId: "H-foreign" };
      const before = JSON.stringify(current);
      expect(residentPhaseZeroHearingAddress(current.economy, current.currentAddress)).toBeNull();
      expect(JSON.stringify(current)).toBe(before);
    },
  );

  it.each(["missing", "duplicate", "stale-address", "invalid-heading", "nonfinite-tick"] as const)(
    "rejects %s identity/address input without repairing it",
    (kind) => {
      const current = fixture();
      let economy: WorldView = current.economy;
      let address: LivingActorAddress = current.currentAddress;
      if (kind === "missing") economy = { ...economy, residents: economy.residents.filter(({ id }) => id !== current.resident.id) };
      else if (kind === "duplicate") economy = { ...economy, residents: [...economy.residents, current.resident] };
      else if (kind === "stale-address") address = { ...address, position: current.resident.activity!.poses[0]!.position };
      else if (kind === "invalid-heading") address = { ...address, heading: -0 };
      else economy = { ...economy, completedTick: Number.NaN };
      const before = JSON.stringify({ economy, address, current });
      expect(residentPhaseZeroHearingAddress(economy, address)).toBeNull();
      expect(JSON.stringify({ economy, address, current })).toBe(before);
    },
  );

  it("rejects malformed outer inputs without throwing", () => {
    const current = fixture(false);
    expect(residentPhaseZeroHearingAddress(current.economy, null as unknown as LivingActorAddress)).toBeNull();
    expect(residentPhaseZeroHearingAddress({ ...current.economy, residents: [null] as unknown as ResidentState[] }, current.currentAddress)).toBeNull();
    expect(residentPhaseZeroHearingAddress(null as unknown as WorldView, current.currentAddress)).toBeNull();
  });
});
