import {
  canonicalizeResidentCircadianState,
  projectLivingCircadianClockPreference,
  residentAtSettlementRestDestination,
  residentCircadianUrgentPreference,
  residentCircadianWatchReference,
} from "./livingCircadian";
import { canonicalResidentActivityForWorld, residentRestTargetHasDrySupport } from "./residentActivityWorld";
import { RESIDENT_SERVICE_ACTIVITY_VERSION } from "./residentActivity";
import type { ResidentState, WeatherState, WorldState } from "./types";

/** Higher owners authenticate duties; sim validates binding, not hidden causes. */
export interface ResidentRationDuty {
  readonly actorId: string;
  readonly duty: Readonly<{ kind: "active-duty"; referenceId: string }> | null;
}

export interface PreparedResidentRationUse {
  readonly sourceTick: number;
  readonly targetTick: number;
}

interface Custody {
  readonly world: WorldState;
  readonly residents: WorldState["residents"];
  readonly sources: readonly ResidentState[];
  readonly activities: readonly ResidentState["activity"][];
  readonly duties: ReadonlyMap<string, boolean>;
}

const PREPARED = new WeakMap<PreparedResidentRationUse, Custody>();

/** One exact closing transaction, never a saved entitlement or actor result. */
export function prepareResidentRationUse(
  world: WorldState,
  duties: readonly ResidentRationDuty[],
): PreparedResidentRationUse | null {
  if (!Array.isArray(duties) || duties.length !== world.residents.length
    || Object.getPrototypeOf(duties) !== Array.prototype
    || Reflect.ownKeys(duties).length !== duties.length + 1) return null;
  for (let index = 0; index < duties.length; index += 1) {
    const field = Object.getOwnPropertyDescriptor(duties, index);
    if (field?.enumerable !== true || !Object.hasOwn(field, "value")) return null;
  }
  const dutyByActor = new Map<string, boolean>();
  for (const entry of duties) {
    if (!plainDataRecord(entry, ["actorId", "duty"])
      || !world.residents.some(({ identity }) => identity.stableId === entry.actorId)
      || dutyByActor.has(entry.actorId)) return null;
    const duty = entry.duty;
    if (duty !== null && (!plainDataRecord(duty, ["kind", "referenceId"])
      || duty.kind !== "active-duty" || typeof duty.referenceId !== "string"
      || duty.referenceId.length === 0 || duty.referenceId.length > 256
      || !/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(duty.referenceId))) return null;
    dutyByActor.set(entry.actorId, duty !== null);
  }
  for (const resident of world.residents) {
    const activity = canonicalResidentActivityForWorld(world, resident);
    if (activity === null || activity.poses.length !== 11) return null;
  }
  const prepared = Object.freeze({
    sourceTick: world.meta.completedTick, targetTick: world.meta.completedTick + 1,
  });
  PREPARED.set(prepared, {
    world, residents: world.residents, sources: [...world.residents],
    activities: world.residents.map(({ activity }) => activity), duties: dutyByActor,
  });
  return prepared;
}

function plainDataRecord(value: unknown, keys: readonly string[]): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Reflect.ownKeys(value).length === keys.length && keys.every((key) => {
      const field = Object.getOwnPropertyDescriptor(value, key);
      return field?.enumerable === true && Object.hasOwn(field, "value");
    });
}

/** Consume BEFORE commands/perception replace any source resident slot. */
export function consumeResidentRationUse(
  world: WorldState,
  prepared: PreparedResidentRationUse,
): ReadonlyMap<string, boolean> {
  const custody = PREPARED.get(prepared);
  PREPARED.delete(prepared);
  if (custody === undefined || custody.world !== world || custody.residents !== world.residents
    || custody.sources.length !== world.residents.length
    || custody.sources.some((source, index) => source !== world.residents[index])
    || custody.activities.some((activity, index) => activity !== world.residents[index]?.activity)
    || prepared.sourceTick !== world.meta.completedTick
    || prepared.targetTick !== world.meta.completedTick + 1) {
    throw new RangeError("Resident ration admission is stale, foreign or already consumed");
  }
  return custody.duties;
}

export function revokeResidentRationUse(prepared: PreparedResidentRationUse): void {
  PREPARED.delete(prepared);
}

/** Shared existing priority signals; an eat intention alone is insufficient. */
export function residentRationPriorityEligible(
  resident: ResidentState,
  weather: WeatherState,
  onDuty: boolean,
  tick: number,
): boolean {
  if (resident.location.kind !== "settlement" || resident.activeContractId !== null || onDuty
    || weather.kind === "storm" || resident.perception.tick !== tick
    || residentCircadianWatchReference(resident.perception) !== null) return false;
  const circadian = canonicalizeResidentCircadianState(resident.circadian, {
    residentStableId: resident.identity.stableId, homeSettlementId: resident.homeSettlementId,
    atTick: tick, arrivedAtSettlementRest: residentAtSettlementRestDestination(resident),
  });
  if (circadian === null || resident.perception.beliefs.some((belief) => (
    belief.lastObservedTick === tick && belief.strongInterrupt
    && belief.salience >= circadian.policy.wakeSensitivity
  ))) return false;
  const urgent = residentCircadianUrgentPreference({ needs: resident.needs, exhaustion: resident.condition.exhaustion });
  if (urgent !== null) return urgent.referenceId === "need:food";
  return resident.intention === "eat" && projectLivingCircadianClockPreference(
    resident.identity.stableId, tick, circadian.policy,
  ) === "active";
}

/** Fresh post-command/perception/conditions check at the actual hourly commit. */
export function residentRationUseEligible(
  world: WorldState,
  resident: ResidentState,
  duties: ReadonlyMap<string, boolean> | null,
  tick: number,
): boolean {
  const activity = canonicalResidentActivityForWorld(world, resident, tick);
  if (activity === null || activity.version !== RESIDENT_SERVICE_ACTIVITY_VERSION) return false;
  const task = activity.rationTask;
  const duty = duties?.get(resident.identity.stableId);
  return duty !== undefined && task?.phase === "arrived" && task.selectedAtTick < tick
    && resident.circadian?.posture.state === "awake"
    && residentRestTargetHasDrySupport(world, task.target)
    && residentRationPriorityEligible(resident, world.weather, duty, tick);
}
