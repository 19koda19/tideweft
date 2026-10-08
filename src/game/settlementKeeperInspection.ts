import {
  canonicalizeActorObservations,
  createActorObservation,
  type ActorObservation,
} from "../sim/actorPerception";
import { projectLivingCircadianClockPreference, residentCircadianUrgentPreference } from "../sim/livingCircadian";
import { residentActivitySupportsMaterials } from "../sim/residentActivity";
import { canonicalResidentActivityForWorld, residentRestTargetHasDrySupport } from "../sim/residentActivityWorld";
import { residentServicePriorityAvailable } from "../sim/residentRationUse";
import { FIXED_POINT, type ResidentState, type WorldState, type WorldView } from "../sim/types";
import { hashCanonical } from "../sim/util";
import { createLivingActorAddress, headingToRadians, livingActorAddressForResident, livingActorAddressInRegionalWindow } from "./livingActor";
import { buildOutdoorIlluminationField, buildWorldPerceptionCells } from "./outdoorIllumination";
import { evaluateVisualContact } from "./perception";
import type { PorterResponseState } from "./porterResponse";
import { regionalCompatibilityWorldForWorld } from "./regionalWorldView";
import {
  applySettlementKeeperStoreResponse,
  canonicalizeSettlementEcologyState,
  projectSettlementFoodStoreSource,
  proposeSettlementKeeperStoreResponse,
  recordSettlementKeeperKnowledge,
  type SettlementEcologyState,
} from "./settlementEcology";
import { deriveSettlementKeeperCircadianDuty } from "./settlementKeeperCircadian";
import { createWorldPosition, WORLD_POSITION_UNITS_PER_TILE, type WorldPosition } from "./worldPosition";

/** One finite store and its existing keeper; not a second human work scheduler. */
export interface SettlementKeeperStoreSightInput {
  readonly world: WorldView;
  readonly window: Readonly<{ origin: Readonly<{ x: number; y: number }> }>;
  readonly settlement: SettlementEcologyState;
  readonly targetTick: number;
}

/**
 * One real pre-world visual candidate. The lower resident ingress still owns
 * post-command/sleep admission. Absence, occlusion and weak light yield no
 * fact; they never reveal a hidden loss, rat, remaining quantity or UI choice.
 */
export function collectSettlementKeeperStoreObservations(
  input: SettlementKeeperStoreSightInput,
): readonly ActorObservation[] | null {
  const state = canonicalizeSettlementEcologyState(input.settlement);
  const economy = regionalCompatibilityWorldForWorld(input.world) ?? input.world;
  const keeper = state === null ? null : boundKeeper(economy, state);
  if (state === null || keeper === null || input.targetTick !== economy.completedTick + 1) return null;
  // Supported older partial body protocols remain exact until phase-zero
  // adoption. No new autonomous producer is retrofitted into their history.
  if (!residentActivitySupportsMaterials(keeper.activity) || state.closure !== "open") return [];
  const source = projectSettlementFoodStoreSource(state);
  if (source === null || source.source.packagingLeakage === 0) return [];
  const address = livingActorAddressForResident(economy, keeper);
  if (address === null) return null;
  const window = { origin: input.window.origin, terrain: input.world.terrain };
  const observer = livingActorAddressInRegionalWindow(address, window);
  // Projection of a point uses the existing actor spatial-frame adapter only;
  // this is not an additional actor or persisted store body.
  const target = livingActorAddressInRegionalWindow(createLivingActorAddress({
    ...address, position: state.identity.position,
  }), window);
  if (observer === null || target === null) return [];
  const cells = buildWorldPerceptionCells(input.world);
  const light = cells === null ? null : buildOutdoorIlluminationField(input.world, cells);
  const illumination = light?.physicalIllumination[target.tileIndex];
  if (cells === null || illumination === undefined) return null;
  const sight = evaluateVisualContact({
    columns: input.world.terrain.width, rows: input.world.terrain.height, cells,
    observerTileIndex: observer.tileIndex, targetTileIndex: target.tileIndex,
    observerFacingRadians: headingToRadians(address.heading),
    weatherVisibility: Math.max(0, Math.min(1, 1 - input.world.weather.intensity / FIXED_POINT * 0.52)),
    targetMovementSalience: 0, targetLightVisibility: illumination / FIXED_POINT,
  });
  if (sight === null || !sight.identityEligible) return [];
  const confidence = Math.round(sight.confidence * FIXED_POINT);
  const observation = createActorObservation({
    id: `keeper-store-vision:${hashCanonical({
      actorId: address.actorId, position: address.position,
      storeId: state.identity.storeId, tick: input.targetTick,
    })}`,
    observerId: address.actorId, observedAtTick: input.targetTick,
    channel: "vision", perceivedClass: "exposed-food", subjectId: state.identity.foodLotId,
    area: { center: state.identity.position, radiusUnits: 0 },
    confidence, salience: confidence, identification: "identified", interrupt: "none",
  });
  return observation === null ? null : Object.freeze([observation]);
}

export interface SettlementKeeperStoreInspectionInput {
  readonly world: WorldState;
  /** Latest resource/aggregate-resolved physical lot, never the pre-loss root. */
  readonly settlement: SettlementEcologyState;
  readonly porterResponse: PorterResponseState;
  /** Exact pre-world candidates retained only for this fail-closed transaction. */
  readonly observations: readonly ActorObservation[];
}

/**
 * Learn only after actual lower vision admission; secure only at real dry
 * contact with current routine/priority permission. The existing store owner
 * alone commits closure. No task, cargo, audio or new persistence root is made.
 */
export function advanceSettlementKeeperStoreInspection(
  input: SettlementKeeperStoreInspectionInput,
): SettlementEcologyState | null {
  const state = canonicalizeSettlementEcologyState(input.settlement);
  const keeper = state === null ? null : boundKeeper(input.world, state);
  const tick = input.world.meta.completedTick;
  if (state === null || keeper === null || input.observations.length > 1) return null;
  if (input.observations.length === 0 || state.closure !== "open") return state;
  const observations = canonicalizeActorObservations(input.observations);
  const observation = observations[0];
  if (observations.length !== 1 || observation === undefined
    || observation.observerId !== keeper.identity.stableId || observation.observedAtTick !== tick
    || observation.channel !== "vision" || observation.perceivedClass !== "exposed-food"
    || observation.subjectId !== state.identity.foodLotId || observation.identification !== "identified"
    || observation.area.radiusUnits !== 0 || !samePosition(observation.area.center, state.identity.position)) return null;
  const admitted = keeper.perception.beliefs.some((belief) => (
    keeper.perception.tick === tick && belief.sourceObservationId === observation.id
    && belief.lastObservedTick === tick && belief.channel === observation.channel
    && belief.perceivedClass === observation.perceivedClass && belief.subjectId === observation.subjectId
    && belief.identification === observation.identification && belief.confidence === observation.confidence
    && belief.salience === observation.salience && belief.area.radiusUnits === 0
    && samePosition(belief.area.center, observation.area.center) && !belief.strongInterrupt
  ));
  if (!admitted) return state;
  const informed = recordSettlementKeeperKnowledge(state, tick, {
    kind: "direct-observation", risk: "food-exposed", observation,
  });
  if (informed === null) return null;
  const activity = canonicalResidentActivityForWorld(input.world, keeper);
  if (activity === null || !residentActivitySupportsMaterials(activity)) return informed;
  const duty = deriveSettlementKeeperCircadianDuty(keeper, informed, input.porterResponse, tick);
  if (duty === undefined) return null;
  const routine = residentServicePriorityAvailable(keeper, input.world.weather, duty !== null, tick);
  const pose = activity.poses[activity.poses.length - 1];
  if (routine === null || routine.posture.state !== "awake"
    || projectLivingCircadianClockPreference(keeper.identity.stableId, tick, routine.policy) !== "active"
    || residentCircadianUrgentPreference({ needs: keeper.needs, exhaustion: keeper.condition.exhaustion }) !== null
    || keeper.location.kind !== "settlement" || keeper.location.settlementId !== state.identity.settlementId
    || pose === undefined || !samePosition(pose.position, state.identity.position)
    || !residentRestTargetHasDrySupport(input.world, pose.position)) return informed;
  const proposal = proposeSettlementKeeperStoreResponse(informed, tick);
  if (proposal === null) return informed;
  return applySettlementKeeperStoreResponse(informed, proposal)?.state ?? null;
}

/** The authored store identity remains at its actual home settlement center. */
function boundKeeper(world: WorldState | WorldView, state: SettlementEcologyState): ResidentState | null {
  const seed = "meta" in world ? world.meta.rootSeed : world.rootSeed;
  if (seed === undefined || hashCanonical([...seed]) !== state.identity.seedFingerprint) return null;
  const keeper = world.residents.filter(({ identity }) => identity.stableId === state.identity.keeperActorId);
  const home = world.settlements.filter(({ id }) => id === state.identity.settlementId);
  if (keeper.length !== 1 || home.length !== 1 || keeper[0]!.homeSettlementId !== home[0]!.id) return null;
  const tile = world.terrain.tiles[home[0]!.tileIndex];
  if (tile === undefined || !samePosition(state.identity.position, createWorldPosition({ x: 0, y: 0 },
    tile.x * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2,
    tile.y * WORLD_POSITION_UNITS_PER_TILE + WORLD_POSITION_UNITS_PER_TILE / 2))) return null;
  return keeper[0]!;
}

function samePosition(left: WorldPosition, right: WorldPosition): boolean {
  return left.region.x === right.region.x && left.region.y === right.region.y
    && left.localX === right.localX && left.localY === right.localY;
}
