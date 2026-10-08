import { projectLivingCircadianClockPreference, residentCircadianUrgentPreference } from "./livingCircadian";
import { residentActivitySupportsMaterials } from "./residentActivity";
import {
  canonicalResidentActivityForWorld,
  residentRestTargetHasDrySupport,
  residentSettlementMaterialProject,
} from "./residentActivityWorld";
import { residentServicePriorityAvailable } from "./residentRationUse";
import type { ResidentState, WeatherState, WorldState } from "./types";
import { compareText } from "./util";

/** Material work is ordinary work, never a fabricated profession or duty. */
export function residentMaterialPriorityEligible(
  resident: ResidentState, weather: WeatherState, onDuty: boolean, tick: number,
): boolean {
  const circadian = residentServicePriorityAvailable(resident, weather, onDuty, tick);
  return circadian !== null && resident.intention === "work"
    && residentCircadianUrgentPreference({ needs: resident.needs, exhaustion: resident.condition.exhaustion }) === null
    && projectLivingCircadianClockPreference(resident.identity.stableId, tick, circadian.policy) === "active";
}

/** One exact arrived source-qualified pending action, rechecked at commit. */
export function residentMaterialUseEligible(
  world: WorldState, resident: ResidentState, duties: ReadonlyMap<string, boolean> | null, tick: number,
): boolean {
  const activity = canonicalResidentActivityForWorld(world, resident, tick);
  const task = activity?.materialTask;
  const duty = duties?.get(resident.identity.stableId);
  const settlement = residentSettlementMaterialProject(world, resident);
  return residentActivitySupportsMaterials(activity) && duty !== undefined
    && task?.phase === "arrived" && task.selectedAtTick < tick
    && settlement?.project.status === "building" && settlement.inventory[task.resource] >= 1
    && resident.circadian?.posture.state === "awake" && residentRestTargetHasDrySupport(world, task.target)
    && residentMaterialPriorityEligible(resident, world.weather, duty, tick);
}

/**
 * Oldest pending request wins, with stable identity only breaking equal ages.
 * Used actors reselect later; shortages/retries never reset a pending age.
 * A continuously eligible request waits behind at most N-1 successful uses
 * for this project, even with intermittent supply or new arriving workers.
 */
export function selectResidentMaterialUser(
  world: WorldState, settlementId: number, duties: ReadonlyMap<string, boolean> | null, tick: number,
): ResidentState | null {
  let selected: ResidentState | null = null;
  for (const resident of world.residents) {
    if (resident.location.kind !== "settlement" || resident.location.settlementId !== settlementId
      || !residentMaterialUseEligible(world, resident, duties, tick)) continue;
    const task = resident.activity!.materialTask!;
    const previous = selected?.activity?.materialTask;
    if (previous === undefined || previous === null || task.selectedAtTick < previous.selectedAtTick
      || (task.selectedAtTick === previous.selectedAtTick
        && compareText(resident.identity.stableId, selected!.identity.stableId) < 0)) selected = resident;
  }
  return selected;
}
