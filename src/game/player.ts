import {
  FIXED_POINT,
  STRAND_AUTOMATION_THRESHOLD,
  type ContractState,
  type ProjectKind,
  type TerrainTileView,
  type WorldView,
} from "../sim/types";
import {
  WAYKNOT_PERMILLE,
  applyWayknotPermille,
  createWayknotState,
  isWindExposedTile,
  queryWayknotEffects,
  tideHarpEffectStrength,
  type WayknotEffects,
  type WayknotState,
  type WayknotTileContext,
} from "./wayknots";
import {
  deriveTideHarps,
  tideHarpContainsTileCenter,
  type TideHarp,
} from "./tideHarps";
import { surfaceCurrentDirection } from "./currentDirection";
import {
  createCraftingInventory,
  inventoryLoadMilli,
  type CraftingInventory,
} from "./crafting";
import {
  applyGearServiceWear,
  queryCarriedGearEffects,
  type GearBenefitId,
  type GearEffectContext,
} from "./gearEffects";
import { evaluateFooting, type FootingEvaluation, type FootingSurface } from "./footing";
import {
  evaluateFallRiskOnEntry,
  type FallConsequenceQuote,
  type FallRiskEvaluation,
} from "./fallRisk";
import {
  acceptFallFeedback,
  advanceTraversalFeedback,
  traversalControlLocked,
  type TraversalFeedbackState,
  type TraversalIncident,
} from "./traversalFeedback";
import type { RootSeed } from "../sim/rng";
import {
  querySweptRockCrossing,
  type LadderKitState,
  type RockCrossingEffect,
  type RockField,
} from "../sim/rockTraversal";
import { promiseCargoLoadMilli } from "./looseCargo";

export const TILE_UNITS = 1_000;
export const TIDE_HARP_SCAN_RECHARGE = 900;
export const PACK_LOAD_MILLI_PER_UNIT = 1_000;
/** New and migrated porters always receive this much shared transport + kit space. */
export const BASE_CARGO_CAPACITY = 18;

export type TravelPace = "rest" | "steady" | "swift";
export type StabilityTrend = "recovering" | "steady" | "falling";
export type PlayerMode = "foot" | "wading" | "skiff" | "swept" | "camp" | "rescued";
export type FieldToolKind = "sounding-line" | "marsh-stilts" | "tide-sail" | "storm-kite";
export type SweepSupport = "clinic" | "ferry" | null;

export const FIELD_TOOL_LABELS: Readonly<Record<FieldToolKind, string>> = {
  "sounding-line": "Sounding line",
  "marsh-stilts": "Marsh stilts",
  "tide-sail": "Tide sail",
  "storm-kite": "Storm kite",
};

const TOOL_FOR_PROJECT: Readonly<Partial<Record<ProjectKind, FieldToolKind>>> = {
  crossing: "marsh-stilts",
  ferry: "tide-sail",
  beacon: "storm-kite",
};

const SWEEP_DEPTH_THRESHOLD = 120_000;
const SAFE_BANK_DEPTH = 55_000;

export interface PlayerCargo {
  contractId: number;
  resource: ContractState["resource"];
  quantity: number;
  condition: number;
  property: "ordinary" | "heavy" | "fragile" | "perishable" | "confidential";
}

export interface PlayerReport {
  sourceSettlementId: number;
  targetSettlementId: number;
  resource: ContractState["resource"];
  reportedQuantity: number;
  observedTick: number;
  confidence: number;
}

export interface PlayerState {
  worldWidth: number;
  worldHeight: number;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  facingMilliRadians: number;
  stamina: number;
  stability: number;
  stabilityTrend: StabilityTrend;
  stabilityHint: string;
  scanCharge: number;
  scanPulse: number;
  /** Bathymetry learned by Loom pulses; ordinary visual discovery does not reveal exact depth. */
  depthSoundings: number[];
  pace: TravelPace;
  mode: PlayerMode;
  tools: FieldToolKind[];
  /** Reusable, reclaimable terrain aids carried or bound into the estuary. */
  wayknots: WayknotState;
  sweepTicksRemaining: number;
  sweepTotalTicks: number;
  /** Adjacent tiles still to be crossed by an involuntary current drift. */
  sweepPath: number[];
  sweepSupport: SweepSupport;
  cargoCapacity: number;
  cargo: PlayerCargo[];
  report: PlayerReport | null;
  /** Raw finds, prepared components, and carried durable adaptations. */
  craftingInventory: CraftingInventory;
  /** Stable IDs are monotonic and never reused, including after dismantling. */
  nextCraftedGearId: number;
  activeContractId: number | null;
  discovered: number[];
  currentTrace: number[];
  /** Loop-erased path since the last harbor arrival, used for truthful route surveying. */
  surveyTrace: number[];
  /** Stable route IDs the player has genuinely traversed between both endpoint harbors. */
  surveyedRouteIds: number[];
  /** Consecutive harbor arrivals connected by surveyed legs; may close one simple loop. */
  harborTrail: number[];
  lastHarborId: number | null;
  completedJourneys: number;
  rescues: number;
  reportsDelivered: number;
}

export interface PlayerControl {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  brace: boolean;
}

/** Runtime-owned deterministic address and persistent feedback ledger. */
export interface PlayerTraversalContext {
  readonly seed: RootSeed;
  readonly actorId: number;
  readonly feedback: TraversalFeedbackState;
  readonly rocks?: RockField;
  readonly ladders?: LadderKitState;
  /** Runtime exact-lot integration applies the quoted cargo shock atomically. */
  readonly deferFallCargoConsequence?: boolean;
}

export interface PlayerStepResult {
  moved: boolean;
  enteredTile: number | null;
  damagedCargo: boolean;
  exhausted: boolean;
  rescued: boolean;
  becameSwept: boolean;
  swept: boolean;
  washedAshore: boolean;
  /** Present only on the fixed step where control is first lost to the current. */
  sweepCause: "stamina" | "stability" | null;
  sweepSupport: SweepSupport;
  settlementId: number | null;
  /** Present when the runtime supplied the persistent traversal sidecar. */
  traversalFeedback: TraversalFeedbackState | null;
  /** Present only on the fixed step that accepted a new stumble or fall. */
  traversalIncident: TraversalIncident | null;
  /** Authoritative entry result, including held crossings that consumed an ordinal. */
  fallEvaluation: FallRiskEvaluation | null;
  /** Canonical cardinal-edge order; diagonals may contain two accepted evaluations. */
  fallEvaluations: readonly FallRiskEvaluation[];
  /** Footing is evaluated every ordinary fixed step, independently of stamina. */
  footing: FootingEvaluation | null;
  /** Accepted contact order, used to prove that support never leaks across a corner. */
  footingEvaluations: readonly FootingEvaluation[];
  /** Raw non-fall handling/weather pressure for exact-lot runtime application. */
  cargoConditionPressures?: readonly {
    readonly contractId: number;
    readonly conditionLoss: number;
  }[];
}

const PACE_SPEED: Record<TravelPace, number> = {
  rest: 0,
  steady: 105,
  swift: 164,
};

const PACE_STAMINA_DRAIN: Readonly<Record<Exclude<TravelPace, "rest">, number>> = {
  // At ten fixed steps per second, an empty porter on ordinary meadow can
  // walk for a little over two minutes. Terrain and water add their own
  // authoritative costs below rather than being hidden inside this baseline.
  steady: 500,
  swift: 4_300,
};

/** Maximum extra per-step effort from a pack at or beyond its rated capacity. */
const FULL_LOAD_STAMINA_DRAIN = 2_200;

const TERRAIN_DRAG: Record<WorldView["terrain"]["tiles"][number]["terrain"], number> = {
  "deep-water": 720,
  "tidal-flat": 610,
  marsh: 690,
  meadow: 930,
  ridge: 570,
};

export function createPlayer(world: WorldView, startSettlementId?: number): PlayerState {
  const start = world.settlements.find((settlement) => settlement.id === startSettlementId) ?? world.settlements[0];
  if (!start) throw new Error("Cannot create a player in a world without a settlement.");
  const tile = world.terrain.tiles[start.tileIndex];
  if (!tile) throw new Error("Starting settlement references an invalid tile.");
  const discovered = Array.from({ length: world.terrain.width * world.terrain.height }, () => 0);
  const player: PlayerState = {
    worldWidth: world.terrain.width,
    worldHeight: world.terrain.height,
    x: tile.x * TILE_UNITS + TILE_UNITS / 2,
    y: tile.y * TILE_UNITS + TILE_UNITS / 2,
    previousX: tile.x * TILE_UNITS + TILE_UNITS / 2,
    previousY: tile.y * TILE_UNITS + TILE_UNITS / 2,
    velocityX: 0,
    velocityY: 0,
    facingMilliRadians: 0,
    stamina: FIXED_POINT,
    stability: FIXED_POINT,
    stabilityTrend: "steady",
    stabilityHint: "Stable · hold Shift while moving to brace",
    scanCharge: FIXED_POINT,
    scanPulse: 0,
    depthSoundings: Array.from({ length: world.terrain.width * world.terrain.height }, () => 0),
    pace: "steady",
    mode: "foot",
    tools: ["sounding-line"],
    wayknots: createWayknotState(),
    sweepTicksRemaining: 0,
    sweepTotalTicks: 0,
    sweepPath: [],
    sweepSupport: null,
    cargoCapacity: BASE_CARGO_CAPACITY,
    cargo: [],
    report: null,
    craftingInventory: createCraftingInventory(BASE_CARGO_CAPACITY * PACK_LOAD_MILLI_PER_UNIT),
    nextCraftedGearId: 7,
    activeContractId: null,
    discovered,
    currentTrace: [start.tileIndex],
    surveyTrace: [start.tileIndex],
    surveyedRouteIds: [],
    harborTrail: [start.id],
    lastHarborId: start.id,
    completedJourneys: 0,
    rescues: 0,
    reportsDelivered: 0,
  };
  discoverAround(player, world, 5);
  return player;
}

export function stepPlayer(
  player: PlayerState,
  world: WorldView,
  control: PlayerControl,
  traversal?: PlayerTraversalContext,
): PlayerStepResult {
  let traversalFeedback = traversal
    ? advanceTraversalFeedback(traversal.feedback)
    : null;
  let traversalIncident: TraversalIncident | null = null;
  let fallEvaluation: FallRiskEvaluation | null = null;
  const fallEvaluations: FallRiskEvaluation[] = [];
  let footing: FootingEvaluation | null = null;
  const footingEvaluations: FootingEvaluation[] = [];
  const priorVelocityX = player.velocityX;
  const priorVelocityY = player.velocityY;
  // A loaded or live player who has already lost all stability in the current
  // cannot cancel that failure by releasing input and receiving the ordinary
  // stillness recovery later in this same fixed step.
  const staminaDepletedAtStepStart = player.stamina === 0;
  const stabilityDepletedAtStepStart = player.stability === 0;
  player.previousX = player.x;
  player.previousY = player.y;
  player.scanPulse = Math.max(0, player.scanPulse - 24_000);
  player.scanCharge = Math.min(FIXED_POINT, player.scanCharge + 900);

  const priorTileIndex = playerTileIndex(player);
  const priorTile = world.terrain.tiles[priorTileIndex];
  if (!priorTile) throw new Error("Player is outside the terrain grid.");
  const priorWayknotEffects = wayknotEffectsAt(player, world, priorTileIndex);
  const activeWayknotKinds = new Set(priorWayknotEffects.influences.map((influence) => influence.kind));
  if (activeWayknotKinds.size >= 2) {
    // Different field weaves resonate at terrain boundaries. The bonus is
    // deliberately small: a Waychord rewards thoughtful placement without
    // turning the fixed kit into another progression currency.
    player.scanCharge = Math.min(FIXED_POINT, player.scanCharge + 600);
  }
  const tideHarpRecharge = tideHarpScanRechargeAtPlayer(player, world);
  if (tideHarpRecharge > 0) {
    // A player can stand inside overlapping selected triangles. Their field
    // resonance is deliberately boolean so topology never becomes an
    // unbounded recharge multiplier or another progression currency.
    player.scanCharge = Math.min(FIXED_POINT, player.scanCharge + tideHarpRecharge);
  }

  // The adjacent bank path, not an estimate, is authoritative. A sweep may
  // begin between tile centers and need one more interpolation step than its
  // display budget predicts; never return control until the path is complete.
  if (player.mode === "swept") {
    return {
      ...stepSweptPlayer(player, world, priorTileIndex),
      traversalFeedback,
      traversalIncident,
      fallEvaluation,
      fallEvaluations,
      footing,
      footingEvaluations,
    };
  }

  const recoveryLocked = traversalFeedback !== null
    && traversalControlLocked(traversalFeedback);
  const effectiveControl: PlayerControl = recoveryLocked
    ? { moveX: 0, moveY: 0, brace: control.brace }
    : control;
  const hasInput = effectiveControl.moveX !== 0 || effectiveControl.moveY !== 0;
  const harbor = world.settlements.find((settlement) => settlement.tileIndex === priorTileIndex);
  const completedProject = harbor?.project.status === "complete" ? harbor.project.kind : undefined;
  player.pace = deriveContextualPace(player, world, priorTileIndex, effectiveControl);
  const bracing = effectiveControl.brace || !hasInput;
  const loadRatio = Math.min(
    FIXED_POINT,
    Math.floor(
      (cargoWeightMilli(player) * FIXED_POINT)
      / Math.max(PACK_LOAD_MILLI_PER_UNIT, player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT),
    ),
  );
  const waterDepth = priorTile.waterDepth;
  player.mode = waterDepth > 360_000 ? "skiff" : waterDepth > 35_000 ? "wading" : "foot";
  const onMarshGround = priorTile.terrain === "marsh" || priorTile.terrain === "tidal-flat";
  const onRidgeGround = priorTile.terrain === "ridge";
  const carriedGearEffects = queryCarriedGearEffects(player.craftingInventory, {
    marsh: onMarshGround,
    wet: waterDepth > 40_000,
    rock: onRidgeGround,
    exposure: world.weather.intensity > 0,
    gust: world.weather.windX !== 0 || world.weather.windY !== 0,
  });

  let velocityX = 0;
  let velocityY = 0;
  if (hasInput && player.stamina > 12_000) {
    const diagonal = effectiveControl.moveX !== 0 && effectiveControl.moveY !== 0;
    const baseSpeed = PACE_SPEED[player.pace];
    const hasStilts = hasFieldTool(player, "marsh-stilts")
      && (priorTile.terrain === "marsh" || priorTile.terrain === "tidal-flat");
    const hasSail = hasFieldTool(player, "tide-sail") && waterDepth > 180_000;
    const wayknotFooting = WAYKNOT_PERMILLE - priorWayknotEffects.movementCostPermille;
    const unadaptedTerrainDrag = Math.min(
      1_050,
      TERRAIN_DRAG[priorTile.terrain] + (hasStilts ? 235 : 0) + wayknotFooting,
    );
    const gearTerrainCostPermille = onMarshGround
      ? carriedGearEffects.marshMovementCostPermille
      : onRidgeGround
        ? carriedGearEffects.rockTravelCostPermille
        : 1_000;
    const terrainDrag = unadaptedTerrainDrag >= 1_000
      ? unadaptedTerrainDrag
      : 1_000 - Math.floor(((1_000 - unadaptedTerrainDrag) * gearTerrainCostPermille) / 1_000);
    const waterFit = player.mode === "skiff"
      ? Math.max(480, Math.min(1_120, 760 + Math.floor(waterDepth / 4_000) + (hasSail ? 160 : 0)))
      : Math.max(430, 1_000 - Math.floor(waterDepth / 2_500));
    const burden = 1_000 - Math.floor(loadRatio / 3_200);
    const braceFit = effectiveControl.brace ? 620 : 1_000;
    const speed = Math.max(
      24,
      Math.floor((baseSpeed * terrainDrag * waterFit * burden * braceFit) / 1_000_000_000_000),
    );
    const diagonalScale = diagonal ? 707 : 1_000;
    velocityX = Math.floor((effectiveControl.moveX * speed * diagonalScale) / 1_000);
    velocityY = Math.floor((effectiveControl.moveY * speed * diagonalScale) / 1_000);
  }

  const nextX = clamp(player.x + velocityX, TILE_UNITS / 2, world.terrain.width * TILE_UNITS - TILE_UNITS / 2);
  const nextY = clamp(player.y + velocityY, TILE_UNITS / 2, world.terrain.height * TILE_UNITS - TILE_UNITS / 2);
  const proposedTileIndex = tileIndexAt(nextX, nextY, world.terrain.width, world.terrain.height);
  const destinationTile = world.terrain.tiles[proposedTileIndex];
  const rockSweep = traversal?.rocks && traversal.ladders
    ? querySweptRockCrossing(traversal.rocks, traversal.ladders, {
        from: { x: player.x, y: player.y },
        to: { x: nextX, y: nextY },
        tileUnits: TILE_UNITS,
      })
    : null;
  const turnPressure = traversalTurnPressure(
    priorVelocityX,
    priorVelocityY,
    velocityX,
    velocityY,
  );
  const fallbackEdges = cardinalFallbackEdges(
    priorTileIndex,
    proposedTileIndex,
    world.terrain.width,
  );
  const cardinalEdges = rockSweep
    ? rockSweep.edges.map((edge) => ({
        committed: edge.committed,
        effect: edge.effect,
        fromTileIndex: edge.effect.fromTileIndex,
        toTileIndex: edge.effect.toTileIndex,
      }))
    : fallbackEdges;
  let acceptedTileIndex = priorTileIndex;
  let acceptedRockTravelCostPermille = 1_000;
  let acceptedWaterDrain = 0;
  let acceptedWeatherExposure = false;
  const stabilityBeforeFooting = player.stability;
  let workingStability = player.stability;
  let entryRejected = destinationTile === undefined
    || (rockSweep !== null && !rockSweep.valid);
  const contactFor = (
    edgeOrigin: TerrainTileView,
    edgeDestination: TerrainTileView,
    effect: RockCrossingEffect | null,
    edgeTurnPressure: number,
  ) => {
    const touchesMarsh = edgeOrigin.terrain === "marsh"
      || edgeOrigin.terrain === "tidal-flat"
      || edgeDestination.terrain === "marsh"
      || edgeDestination.terrain === "tidal-flat";
    const touchesRock = edgeOrigin.terrain === "ridge"
      || edgeDestination.terrain === "ridge"
      || (effect?.obstacleIds.length ?? 0) > 0;
    const contactDepth = Math.max(edgeOrigin.waterDepth, edgeDestination.waterDepth);
    const gear = queryCarriedGearEffects(player.craftingInventory, {
      marsh: touchesMarsh,
      wet: contactDepth > 40_000,
      rock: touchesRock,
      exposure: world.weather.intensity > 0,
      gust: world.weather.windX !== 0 || world.weather.windY !== 0,
    });
    const originWayknots = wayknotEffectsAt(player, world, edgeOrigin.index);
    const destinationWayknots = wayknotEffectsAt(player, world, edgeDestination.index);
    const current = footingCurrentVector(
      world,
      contactDepth,
      gear.currentForcePermille,
      hasFieldTool(player, "tide-sail"),
    );
    const wind = footingWindVector(
      world,
      gear.gustStabilityLossPermille,
      hasFieldTool(player, "storm-kite"),
      Math.min(originWayknots.stabilityLossPermille, destinationWayknots.stabilityLossPermille),
    );
    const fixture = Math.max(
      effect?.ladderSupport ?? 0,
      footingFixtureSupport(world, edgeDestination.index, destinationWayknots),
    );
    const footwear = footingFootwearGrip(
      gear.marshStabilityLossPermille,
      gear.fallRiskPermille,
      edgeOrigin.terrain,
      edgeDestination.terrain,
    );
    const rockPressure = (effect?.fallRiskPermille ?? 0) * 1_000;
    const evaluation = evaluateFooting({
      stability: workingStability,
      moving: velocityX !== 0 || velocityY !== 0,
      surface: footingSurfaceFor(edgeOrigin, edgeDestination, rockPressure > 0),
      elevationDelta: clamp(edgeDestination.elevation - edgeOrigin.elevation, -FIXED_POINT, FIXED_POINT),
      roughness: Math.max(edgeOrigin.roughness, edgeDestination.roughness, rockPressure),
      moisture: Math.max(edgeOrigin.moisture, edgeDestination.moisture),
      waterDepth: contactDepth,
      movement: normalizedFootingVector(velocityX, velocityY),
      current,
      wind,
      weatherIntensity: world.weather.intensity,
      turnPressure: edgeTurnPressure,
      loadRatio,
      cargoShift: 0,
      pace: player.pace,
      brace: bracing,
      footwearGrip: footwear,
      fixtureSupport: fixture,
      reliableGround: world.settlements.some((settlement) =>
        settlement.tileIndex === edgeOrigin.index || settlement.tileIndex === edgeDestination.index),
      recoveryBonus: completedProject === "cache" ? 3_000 : 0,
      unsupportedEdge: effect?.baseWalkingBlocked
        ? effect.baseFallRiskPermille * 1_000
        : 0,
    });
    return {
      evaluation,
      current,
      wind,
      fixture,
      footwear,
      destinationWayknots,
      contactDepth,
    };
  };

  if (!entryRejected && cardinalEdges.length === 0) {
    const contact = contactFor(priorTile, priorTile, null, turnPressure);
    footing = contact.evaluation;
    footingEvaluations.push(contact.evaluation);
    workingStability = contact.evaluation.stabilityAfter;
    acceptedWaterDrain = waterEffortPerStep(
      player,
      contact.contactDepth,
      contact.destinationWayknots.staminaCostPermille,
    );
    acceptedWeatherExposure = footingWindMagnitude(contact.wind) > 0;
    // A porter whose footing reaches zero while already standing in a serious
    // current has crossed a physical loss-of-control boundary even though no
    // tile boundary was crossed. Resolve that transition once, before the
    // existing sweep state takes control, so it receives the same durable
    // incident identity and exactly-once feedback as an entry fall.
    if (
      traversal
      && traversalFeedback
      && contact.contactDepth >= SWEEP_DEPTH_THRESHOLD
      && (stabilityDepletedAtStepStart || workingStability === 0)
    ) {
      const hazards = fallHazardsForEntry(priorTile, priorTile, contact.current, null);
      fallEvaluation = evaluateFallRiskOnEntry({
        seed: traversal.seed,
        actorId: traversal.actorId,
        traversalOrdinal: traversalFeedback.nextTraversalOrdinal,
        entry: {
          kind: "hazardous-tile",
          fromTileId: priorTile.index,
          toTileId: priorTile.index,
        },
        hazards,
        porter: {
          stability: workingStability,
          loadRatio,
          pace: player.pace,
          wind: footingWindMagnitude(contact.wind),
          turnPressure,
          brace: bracing,
          footwearGrip: contact.footwear,
          fixtureSupport: contact.fixture,
        },
      });
      if (fallEvaluation.valid && fallEvaluation.evaluated) {
        const accepted = acceptFallFeedback(
          traversalFeedback,
          fallEvaluation,
          traversal.actorId,
          { x: player.x, y: player.y },
        );
        if (accepted.ok) {
          fallEvaluations.push(fallEvaluation);
          traversalFeedback = accepted.state;
          traversalIncident = accepted.incident;
        }
      }
    }
  }

  for (let edgeIndex = 0; edgeIndex < cardinalEdges.length; edgeIndex += 1) {
    const edge = cardinalEdges[edgeIndex];
    if (!edge) continue;
    if (entryRejected || !edge.committed) break;
    const edgeOrigin = world.terrain.tiles[edge.fromTileIndex];
    const edgeDestination = world.terrain.tiles[edge.toTileIndex];
    if (!edgeOrigin || !edgeDestination) {
      entryRejected = true;
      break;
    }
    const contact = contactFor(
      edgeOrigin,
      edgeDestination,
      edge.effect,
      edgeIndex === 0 ? turnPressure : 0,
    );
    if (
      traversal
      && traversalFeedback
      && hazardousTraversalEntry(edgeOrigin, edgeDestination, world, edge.effect)
    ) {
      const hazards = fallHazardsForEntry(
        edgeOrigin,
        edgeDestination,
        contact.current,
        edge.effect,
      );
      fallEvaluation = evaluateFallRiskOnEntry({
        seed: traversal.seed,
        actorId: traversal.actorId,
        traversalOrdinal: traversalFeedback.nextTraversalOrdinal,
        entry: {
          kind: edge.effect?.obstacleIds.length
            || hazards.elevationDrop > 0
            || hazards.grade >= 180_000
            ? "hazardous-edge"
            : "hazardous-tile",
          fromTileId: edge.fromTileIndex,
          toTileId: edge.toTileIndex,
        },
        hazards,
        porter: {
          stability: contact.evaluation.stabilityAfter,
          loadRatio,
          pace: player.pace,
          wind: footingWindMagnitude(contact.wind),
          turnPressure: edgeIndex === 0 ? turnPressure : 0,
          brace: bracing,
          footwearGrip: contact.footwear,
          fixtureSupport: contact.fixture,
        },
      });
      if (!fallEvaluation.valid || !fallEvaluation.evaluated) {
        entryRejected = true;
        break;
      }
      const accepted = acceptFallFeedback(
        traversalFeedback,
        fallEvaluation,
        traversal.actorId,
        positionWithinTile(nextX, nextY, edgeDestination),
      );
      if (!accepted.ok) {
        entryRejected = true;
        break;
      }
      fallEvaluations.push(fallEvaluation);
      traversalFeedback = accepted.state;
      traversalIncident = accepted.incident;
    }
    footing = contact.evaluation;
    footingEvaluations.push(contact.evaluation);
    workingStability = contact.evaluation.stabilityAfter;
    acceptedTileIndex = edge.toTileIndex;
    acceptedRockTravelCostPermille = Math.max(
      acceptedRockTravelCostPermille,
      edge.effect?.travelCostPermille ?? 1_000,
    );
    acceptedWaterDrain += waterEffortPerStep(
      player,
      contact.contactDepth,
      contact.destinationWayknots.staminaCostPermille,
    );
    acceptedWeatherExposure ||= footingWindMagnitude(contact.wind) > 0;
    // A physical mishap ends this fixed movement transaction. A diagonal's
    // later cardinal edge is neither entered nor assigned another ordinal.
    if (fallEvaluation?.fell || fallEvaluation?.stumbled) break;
  }

  const stoppedBeforeRequested = proposedTileIndex !== priorTileIndex
    && acceptedTileIndex !== proposedTileIndex;
  const movedWithinPriorTile = proposedTileIndex === priorTileIndex && !entryRejected;
  const committedAnyEntry = acceptedTileIndex !== priorTileIndex;
  if (movedWithinPriorTile || committedAnyEntry) {
    const committedPoint = stoppedBeforeRequested
      ? positionWithinTile(
          nextX,
          nextY,
          world.terrain.tiles[acceptedTileIndex] ?? priorTile,
        )
      : { x: nextX, y: nextY };
    player.x = committedPoint.x;
    player.y = committedPoint.y;
    player.stability = workingStability;
    velocityX = player.x - player.previousX;
    velocityY = player.y - player.previousY;
  } else {
    velocityX = 0;
    velocityY = 0;
    footing = null;
    player.stabilityTrend = "steady";
    player.stabilityHint = fallEvaluation?.ordinalExhausted
      ? "Footing ledger exhausted · this hazardous edge is safely blocked"
      : "Hazardous edge rejected · footing state was not changed";
  }

  player.velocityX = velocityX;
  player.velocityY = velocityY;
  if (velocityX || velocityY) {
    player.facingMilliRadians = approximateAngleMilliRadians(velocityX, velocityY);
    const paceDrain = PACE_STAMINA_DRAIN[player.pace === "swift" ? "swift" : "steady"];
    const burdenDrain = burdenEffortPerStep(loadRatio);
    const rawTerrainDrain = Math.max(
      0,
      1_000 - TERRAIN_DRAG[priorTile.terrain]
        - (hasFieldTool(player, "marsh-stilts")
          && (priorTile.terrain === "marsh" || priorTile.terrain === "tidal-flat") ? 210 : 0),
    );
    const terrainDrain = applyWayknotPermille(
      rawTerrainDrain,
      priorWayknotEffects.staminaCostPermille,
    );
    const rockDrain = Math.max(0, acceptedRockTravelCostPermille - 1_000) * 3;
    player.stamina = Math.max(
      0,
      player.stamina - paceDrain - burdenDrain - terrainDrain * 3 - acceptedWaterDrain - rockDrain,
    );
    // The movement gate below this threshold prevents another step. Collapse
    // the remaining sliver of stamina into the explicit exhausted state so a
    // player cannot get trapped in a move/recover oscillation that never camps.
    if (player.stamina <= 12_000) player.stamina = 0;
  } else {
    const projectRecovery = completedProject === "cache" ? 6_000 : completedProject === "clinic" ? 3_000 : 0;
    const recovery = (bracing ? 7_200 : 2_400) + projectRecovery;
    player.stamina = Math.min(FIXED_POINT, player.stamina + recovery);
  }

  const stabilityDelta = footing ? player.stability - stabilityBeforeFooting : 0;
  if (footing && stabilityDelta > 0) {
    player.stabilityTrend = "recovering";
    player.stabilityHint = completedProject === "cache"
      ? "Recovering on dependable cache decking"
      : effectiveControl.brace && hasInput
        ? "Recovering while braced · Shift trades speed for control"
        : "Recovering while still or on sound footing";
  } else if (footing && stabilityDelta < 0) {
    const causes = footing.causes.map(({ label }) => label);
    player.stabilityTrend = "falling";
    player.stabilityHint = `Footing falling: ${causes.join(" + ")} · BRACE or find support`;
  } else if (footing) {
    player.stabilityTrend = "steady";
    player.stabilityHint = footing.causes.length > 0
      ? `Holding through ${footing.causes.map(({ label }) => label).join(" + ")}`
      : "Stable on sound footing";
  }

  let damagedCargo = applyTraversalConsequence(
    player,
    fallEvaluation?.consequenceQuote ?? null,
    traversal?.deferFallCargoConsequence !== true,
  );
  if (traversalIncident) {
    player.stabilityTrend = fallEvaluation?.fell ? "falling" : "steady";
    player.stabilityHint = traversalIncident.label;
  }
  const cargoConditionPressures: Array<{ contractId: number; conditionLoss: number }> = [];
  for (const cargo of player.cargo) {
    const conditionBefore = cargo.condition;
    let conditionPressure = 0;

    // Food rewards an efficient line and makes completed caches strategically
    // meaningful. Decay is gentle enough that every arrival remains useful.
    if (cargo.property === "perishable" && completedProject !== "cache") {
      const freshnessLoss = hasInput
        ? player.pace === "swift" ? 190 : effectiveControl.brace ? 58 : 96
        : 24;
      conditionPressure += freshnessLoss;
      cargo.condition = Math.max(0, cargo.condition - freshnessLoss);
    }

    // Fragile medicine begins reacting to rough handling much earlier than
    // ordinary cargo. Holding brace while moving trades speed for protection.
    if (!bracing && traversalIncident === null) {
      const shockThreshold = cargo.property === "fragile" ? 480_000 : cargo.property === "perishable" ? 150_000 : 90_000;
      if (player.stability < shockThreshold) {
        const baseShock = 120 + Math.floor((shockThreshold - player.stability) / 180);
        const shockMultiplier = cargo.property === "fragile"
          ? 2_200
          : cargo.property === "heavy"
            ? 700
            : cargo.property === "perishable"
              ? 1_150
              : 1_000;
        const handlingLoss = Math.floor((baseShock * shockMultiplier) / 1_000);
        conditionPressure += handlingLoss;
        cargo.condition = Math.max(0, cargo.condition - handlingLoss);
      }
    }

    if (cargo.condition < conditionBefore) damagedCargo = true;
    if (conditionPressure > 0) {
      cargoConditionPressures.push({ contractId: cargo.contractId, conditionLoss: conditionPressure });
    }
  }

  const currentTileIndex = playerTileIndex(player);
  let enteredTile: number | null = null;
  if (currentTileIndex !== priorTileIndex) {
    enteredTile = currentTileIndex;
    // Erase loops while preserving each trace origin and a fully adjacent path.
    // The promise trace begins at pickup; the survey trace begins at the most
    // recently visited harbor and therefore remains useful between contracts.
    appendLoopErasedTile(player.currentTrace, currentTileIndex);
    appendLoopErasedTile(player.surveyTrace, currentTileIndex);
    discoverAround(player, world, 2);
    const entered = world.terrain.tiles[currentTileIndex];
    if (entered) {
      if (entered.terrain === "marsh" || entered.terrain === "tidal-flat") {
        serviceCarriedGear(player, { marsh: true }, "marsh-footing");
      }
      if (Math.max(waterDepth, entered.waterDepth) > 40_000) {
        serviceCarriedGear(player, { wet: true }, "wet-buoyancy");
      }
      if (entered.terrain === "ridge") {
        serviceCarriedGear(player, { rock: true }, "ridge-grip");
      }
      if (acceptedWeatherExposure) {
        serviceCarriedGear(
          player,
          { exposure: true, gust: world.weather.windX !== 0 || world.weather.windY !== 0 },
          "weather-shelter",
        );
      }
    }
  }

  const currentTile = world.terrain.tiles[currentTileIndex];
  const inSweepWater = (currentTile?.waterDepth ?? 0) >= SWEEP_DEPTH_THRESHOLD;
  // Exhaustion caused by an interaction such as gathering is authoritative
  // before idle recovery. Releasing input in deep water must never cancel the
  // current taking control on the next fixed step.
  const exhausted = player.stamina === 0 || (inSweepWater && staminaDepletedAtStepStart);
  const destabilizedInCurrent = inSweepWater
    && (stabilityDepletedAtStepStart || player.stability === 0);
  let rescued = false;
  let becameSwept = false;
  let sweepCause: PlayerStepResult["sweepCause"] = null;
  let sweepSupport: SweepSupport = null;
  if (exhausted || destabilizedInCurrent) {
    sweepSupport = sweepSupportAtTile(world, currentTileIndex);
    if (inSweepWater && sweepSupport !== "clinic") {
      // The presentation estimate and live drift must begin with the same
      // infrastructure support. Previously the first estimate was calculated
      // before ferry support reached player state, so its ETA was pessimistic.
      player.sweepSupport = sweepSupport;
      player.sweepPath = findSweepPath(world, currentTileIndex);
      player.sweepTotalTicks = estimateSweepTicks(player, world, player.sweepPath);
      player.sweepTicksRemaining = player.sweepTotalTicks;
      player.mode = "swept";
      player.pace = "rest";
      player.velocityX = 0;
      player.velocityY = 0;
      player.stabilityTrend = "falling";
      player.stabilityHint = `Swept by ${world.tide.direction > 0 ? "flood" : "ebb"} current · the shore will catch you`;
      becameSwept = true;
      // If both meters fail on the same fixed step, stability is the more
      // specific explanation for losing footing in water; stamina remains
      // truthfully exposed through `exhausted` on the same result.
      sweepCause = destabilizedInCurrent ? "stability" : "stamina";
      if (sweepCause === "stability") player.stability = 0;
      if (sweepCause === "stamina") player.stamina = 0;
      // A sweep is a setback, not deletion. Weather cargo once at the moment
      // control is lost, then preserve quantity and trace every drift tile.
      for (const cargo of player.cargo) {
        cargo.condition = Math.max(0, cargo.condition - 35_000);
        const pressure = cargoConditionPressures.find((entry) => entry.contractId === cargo.contractId);
        if (pressure) pressure.conditionLoss += 35_000;
        else cargoConditionPressures.push({ contractId: cargo.contractId, conditionLoss: 35_000 });
      }
      damagedCargo = damagedCargo || player.cargo.length > 0;
      player.surveyTrace = [currentTileIndex];
      player.harborTrail = [];
      player.lastHarborId = null;
    } else {
      rescued = sweepSupport === "clinic";
      player.mode = rescued ? "rescued" : "camp";
      player.pace = "rest";
      if (rescued) {
        player.stamina = 160_000;
        player.stability = Math.max(player.stability, 420_000);
        player.rescues += 1;
      }
    }
  }

  return {
    moved: player.x !== player.previousX || player.y !== player.previousY,
    enteredTile,
    damagedCargo,
    exhausted,
    rescued,
    becameSwept,
    swept: becameSwept,
    washedAshore: false,
    sweepCause,
    sweepSupport,
    settlementId: settlementAtPlayer(player, world),
    traversalFeedback,
    traversalIncident,
    fallEvaluation,
    fallEvaluations,
    footing,
    footingEvaluations,
    cargoConditionPressures,
  };
}

function deriveContextualPace(
  player: PlayerState,
  world: WorldView,
  priorTileIndex: number,
  control: PlayerControl,
): TravelPace {
  if ((control.moveX === 0 && control.moveY === 0) || player.stamina <= 12_000) return "rest";
  const prior = world.terrain.tiles[priorTileIndex];
  if (!prior) return "steady";
  const targetX = clamp(prior.x + control.moveX, 0, world.terrain.width - 1);
  const targetY = clamp(prior.y + control.moveY, 0, world.terrain.height - 1);
  const target = world.terrain.tiles[targetY * world.terrain.width + targetX];
  const downhill = target !== undefined && target.elevation <= prior.elevation - 90_000;
  const current = surfaceCurrentDirection(world.tide.direction, world.weather.windY);
  const currentAssist = Math.max(prior.waterDepth, target?.waterDepth ?? 0) >= SWEEP_DEPTH_THRESHOLD
    && control.moveX * current.x + control.moveY * current.y > 0;
  return downhill || currentAssist ? "swift" : "steady";
}

function normalizedFootingVector(x: number, y: number): { readonly x: number; readonly y: number } {
  const magnitude = Math.max(Math.abs(x), Math.abs(y));
  if (magnitude <= 0 || !Number.isFinite(magnitude)) return { x: 0, y: 0 };
  return {
    x: clamp(Math.trunc((x * FIXED_POINT) / magnitude), -FIXED_POINT, FIXED_POINT),
    y: clamp(Math.trunc((y * FIXED_POINT) / magnitude), -FIXED_POINT, FIXED_POINT),
  };
}

function traversalTurnPressure(
  priorX: number,
  priorY: number,
  nextX: number,
  nextY: number,
): number {
  if ((priorX === 0 && priorY === 0) || (nextX === 0 && nextY === 0)) return 0;
  const prior = normalizedFootingVector(priorX, priorY);
  const next = normalizedFootingVector(nextX, nextY);
  const dot = Math.trunc((prior.x * next.x + prior.y * next.y) / FIXED_POINT);
  return clamp(Math.trunc((FIXED_POINT - clamp(dot, -FIXED_POINT, FIXED_POINT)) / 2), 0, FIXED_POINT);
}

function footingCurrentVector(
  world: WorldView,
  waterDepth: number,
  gearPermille: number,
  hasTideSail: boolean,
): { readonly x: number; readonly y: number } {
  if (waterDepth <= 35_000) return { x: 0, y: 0 };
  const direction = surfaceCurrentDirection(world.tide.direction, world.weather.windY);
  const base = clamp(260_000 + Math.trunc(world.tide.level * 0.55), 0, FIXED_POINT);
  const sailPermille = hasTideSail && waterDepth > 180_000 ? 600 : 1_000;
  const magnitude = Math.trunc(
    (base * clamp(gearPermille, 0, 1_000) * sailPermille) / 1_000_000,
  );
  return { x: direction.x * magnitude, y: direction.y * magnitude };
}

function footingWindVector(
  world: WorldView,
  gearPermille: number,
  hasStormKite: boolean,
  wayknotPermille: number,
): { readonly x: number; readonly y: number } {
  const toolPermille = hasStormKite ? 450 : 1_000;
  const combinedPermille = Math.trunc(
    (clamp(gearPermille, 0, 1_000) * clamp(wayknotPermille, 0, 1_000) * toolPermille)
      / 1_000_000,
  );
  return {
    // Weather vectors describe the front's mean motion. Exposed footing feels
    // peak gust force, so use a bounded 2x impulse here. This keeps ordinary
    // breezes beneath firm-ground tolerance while making a live storm and its
    // weather-cape mitigation mechanically observable.
    x: clamp(Math.trunc((world.weather.windX * combinedPermille * 2) / 1_000), -FIXED_POINT, FIXED_POINT),
    y: clamp(Math.trunc((world.weather.windY * combinedPermille * 2) / 1_000), -FIXED_POINT, FIXED_POINT),
  };
}

function footingWindMagnitude(vector: { readonly x: number; readonly y: number }): number {
  return clamp(Math.max(Math.abs(vector.x), Math.abs(vector.y)), 0, FIXED_POINT);
}

function footingFixtureSupport(
  world: WorldView,
  tileIndex: number,
  effects: WayknotEffects,
): number {
  let support = world.settlements.some((settlement) => settlement.tileIndex === tileIndex)
    ? 850_000
    : 0;
  for (const influence of effects.influences) {
    if (influence.kind === "reed-mat" && influence.distance === 0) {
      support = Math.max(support, Math.trunc(influence.effectStrength * 0.58));
    }
    if (influence.kind === "tide-anchor") {
      support = Math.max(support, (1_000 - influence.sweepRiskPermille) * 1_000);
    }
  }
  return clamp(support, 0, FIXED_POINT);
}

function footingFootwearGrip(
  marshPermille: number,
  rockPermille: number,
  origin: TerrainTileView["terrain"],
  destination: TerrainTileView["terrain"],
): number {
  const touchesSoft = origin === "marsh" || origin === "tidal-flat"
    || destination === "marsh" || destination === "tidal-flat";
  const touchesRock = origin === "ridge" || destination === "ridge";
  return clamp(Math.max(
    touchesSoft ? (1_000 - marshPermille) * 1_000 : 0,
    touchesRock ? (1_000 - rockPermille) * 1_000 : 0,
  ), 0, FIXED_POINT);
}

function footingSurfaceFor(
  origin: TerrainTileView,
  destination: TerrainTileView | undefined,
  crossesRock: boolean,
): FootingSurface {
  const wettest = Math.max(origin.waterDepth, destination?.waterDepth ?? 0);
  if (wettest > 35_000) return "water";
  if (crossesRock || origin.terrain === "ridge" || destination?.terrain === "ridge") return "rock";
  if (
    origin.terrain === "marsh"
    || origin.terrain === "tidal-flat"
    || destination?.terrain === "marsh"
    || destination?.terrain === "tidal-flat"
  ) return "soft";
  return "firm";
}

function hazardousTraversalEntry(
  origin: TerrainTileView,
  destination: TerrainTileView,
  world: WorldView,
  rock: RockCrossingEffect | null,
): boolean {
  const grade = Math.abs(destination.elevation - origin.elevation);
  const depth = Math.max(origin.waterDepth, destination.waterDepth);
  const roughness = Math.max(origin.roughness, destination.roughness);
  const wind = Math.max(Math.abs(world.weather.windX), Math.abs(world.weather.windY));
  return depth > SAFE_BANK_DEPTH
    || (rock?.highRisk ?? false)
    || (rock?.fallRiskPermille ?? 0) > 0
    || origin.terrain === "ridge"
    || destination.terrain === "ridge"
    || grade >= 180_000
    || roughness >= 650_000
    || Math.trunc((wind * world.weather.intensity) / FIXED_POINT) >= 400_000;
}

function fallHazardsForEntry(
  origin: TerrainTileView,
  destination: TerrainTileView,
  current: { readonly x: number; readonly y: number },
  rockEffect: RockCrossingEffect | null,
): {
  readonly grade: number;
  readonly rock: number;
  readonly current: number;
  readonly depth: number;
  readonly brambleVines: number;
  readonly elevationDrop: number;
  readonly unsupportedGap: number;
  readonly surfaceSlip: number;
} {
  const delta = destination.elevation - origin.elevation;
  const depth = clamp(Math.max(origin.waterDepth, destination.waterDepth), 0, FIXED_POINT);
  const rock = Math.max(
    rockEffect?.fallRiskPermille ? rockEffect.fallRiskPermille * 1_000 : 0,
    origin.terrain === "ridge" || destination.terrain === "ridge"
      ? Math.max(650_000, origin.roughness, destination.roughness)
      : 0,
  );
  const softness = destination.terrain === "marsh" || destination.terrain === "tidal-flat"
    ? destination.moisture
    : 0;
  return {
    grade: clamp(Math.abs(delta), 0, FIXED_POINT),
    rock: clamp(rock, 0, FIXED_POINT),
    current: depth > 35_000 ? footingWindMagnitude(current) : 0,
    depth,
    brambleVines: 0,
    elevationDrop: clamp(Math.max(0, -delta), 0, FIXED_POINT),
    unsupportedGap: 0,
    surfaceSlip: clamp(Math.max(softness, Math.trunc(depth * 0.45)), 0, FIXED_POINT),
  };
}

function positionWithinTile(
  x: number,
  y: number,
  tile: TerrainTileView,
): { readonly x: number; readonly y: number } {
  return {
    x: clamp(x, tile.x * TILE_UNITS, (tile.x + 1) * TILE_UNITS - 1),
    y: clamp(y, tile.y * TILE_UNITS, (tile.y + 1) * TILE_UNITS - 1),
  };
}

function cardinalFallbackEdges(
  fromTileIndex: number,
  toTileIndex: number,
  width: number,
): readonly {
  readonly committed: true;
  readonly effect: null;
  readonly fromTileIndex: number;
  readonly toTileIndex: number;
}[] {
  if (fromTileIndex === toTileIndex) return [];
  const fromX = fromTileIndex % width;
  const fromY = Math.floor(fromTileIndex / width);
  const toX = toTileIndex % width;
  const toY = Math.floor(toTileIndex / width);
  const edges: Array<{
    readonly committed: true;
    readonly effect: null;
    readonly fromTileIndex: number;
    readonly toTileIndex: number;
  }> = [];
  let currentX = fromX;
  let currentY = fromY;
  while (currentX !== toX) {
    const nextX = currentX + Math.sign(toX - currentX);
    edges.push({
      committed: true,
      effect: null,
      fromTileIndex: currentY * width + currentX,
      toTileIndex: currentY * width + nextX,
    });
    currentX = nextX;
  }
  while (currentY !== toY) {
    const nextY = currentY + Math.sign(toY - currentY);
    edges.push({
      committed: true,
      effect: null,
      fromTileIndex: currentY * width + currentX,
      toTileIndex: nextY * width + currentX,
    });
    currentY = nextY;
  }
  return edges;
}

function applyTraversalConsequence(
  player: PlayerState,
  quote: FallConsequenceQuote | null,
  damageCargo = true,
): boolean {
  if (!quote) return false;
  player.stamina = Math.max(0, player.stamina - quote.staminaShock);
  player.stability = Math.max(0, player.stability - quote.stabilityShock);
  if (!damageCargo) return false;
  let damaged = false;
  for (const cargo of player.cargo) {
    const resistancePermille = cargo.property === "heavy"
      ? 420
      : cargo.property === "fragile"
        ? 1_000
        : cargo.property === "perishable"
          ? 800
          : 620;
    const conditionLoss = Math.max(1, Math.trunc((quote.cargoShock * resistancePermille) / 1_000));
    const before = cargo.condition;
    cargo.condition = Math.max(0, cargo.condition - conditionLoss);
    damaged ||= cargo.condition < before;
  }
  return damaged;
}

/**
 * Extra stamina spent each 100ms movement step by the shared pack load.
 *
 * A quadratic curve keeps small forage finds comfortable, while making the
 * upper half of the pack progressively consequential. Callers supply the
 * fixed-point ratio so this remains independent from terrain and water.
 */
export function burdenEffortPerStep(loadRatio: number): number {
  const ratio = clamp(Number.isFinite(loadRatio) ? loadRatio : 0, 0, FIXED_POINT);
  return Math.floor(
    (ratio * ratio * FULL_LOAD_STAMINA_DRAIN)
    / (FIXED_POINT * FIXED_POINT),
  );
}

export function pulseScan(player: PlayerState, world: WorldView): boolean {
  if (!hasFieldTool(player, "sounding-line") || player.mode === "swept" || player.scanCharge < 280_000) return false;
  const activeTideHarp = activeTideHarpAtPlayer(player, world);
  player.scanCharge -= 280_000;
  player.scanPulse = FIXED_POINT;
  discoverAround(player, world, 8);
  soundDepthAround(player, world, 8);
  if (activeTideHarp) {
    for (const knot of activeTideHarp.knots) {
      discoverAroundTile(player, world, knot.tileIndex, 6);
      soundDepthAroundTile(player, world, knot.tileIndex, 6);
    }
  }
  return true;
}

/**
 * Rebuilds a safe, adjacent drift after loading a save. Sweep paths are
 * derived state: trusting arbitrary saved indices could make the porter cut
 * across the map or report a completed recovery while still in deep water.
 */
export function restoreSweptPlayer(player: PlayerState, world: WorldView): boolean {
  if (player.mode !== "swept") {
    player.sweepPath = [];
    player.sweepTicksRemaining = 0;
    player.sweepTotalTicks = 0;
    player.sweepSupport = null;
    return false;
  }
  const startIndex = playerTileIndex(player);
  const startTile = world.terrain.tiles[startIndex];
  if (!startTile || startTile.waterDepth <= SAFE_BANK_DEPTH) return false;
  player.sweepSupport = sweepSupportAtTile(world, startIndex);
  const path = findSweepPath(world, startIndex);
  if (path.length === 0) return false;
  player.sweepPath = path;
  player.pace = "rest";
  player.velocityX = 0;
  player.velocityY = 0;
  player.sweepTotalTicks = estimateSweepTicks(player, world, path);
  player.sweepTicksRemaining = player.sweepTotalTicks;
  return true;
}

export function hasFieldTool(player: PlayerState, tool: FieldToolKind): boolean {
  return player.tools.includes(tool);
}

/** Awards a civic field tool only when the player visits the completed project. */
export function unlockFieldToolAtSettlement(
  player: PlayerState,
  world: WorldView,
  settlementId: number,
): FieldToolKind | null {
  const settlement = world.settlements.find((candidate) => candidate.id === settlementId);
  if (!settlement || settlement.project.status !== "complete") return null;
  const tool = TOOL_FOR_PROJECT[settlement.project.kind];
  if (!tool || hasFieldTool(player, tool)) return null;
  player.tools = [...player.tools, tool].sort();
  return tool;
}

export type WaterDepthBand = "dry" | "ankle" | "waist" | "deep" | "channel";

export function waterDepthBand(depth: number): WaterDepthBand {
  if (depth <= 20_000) return "dry";
  if (depth <= 120_000) return "ankle";
  if (depth <= 260_000) return "waist";
  if (depth <= 440_000) return "deep";
  return "channel";
}

/**
 * Extra stamina spent each 100ms movement step; monotone in sounded depth.
 * The optional multiplier lets live movement, the HUD, and pointer routing use
 * the same nearby Tide-anchor influence without coupling this pure curve to a
 * particular world projection.
 */
export function waterEffortPerStep(
  player: PlayerState,
  depth: number,
  wayknotStaminaPermille = WAYKNOT_PERMILLE,
): number {
  if (depth <= 40_000) return 0;
  const raw = Math.min(3_000, Math.floor((depth - 40_000) / 160));
  const toolAdjusted = hasFieldTool(player, "tide-sail") && depth > 180_000
    ? Math.floor(raw * 0.48)
    : raw;
  const wayknotAdjusted = applyWayknotPermille(toolAdjusted, wayknotStaminaPermille);
  const gearAdjusted = queryCarriedGearEffects(player.craftingInventory, { wet: true });
  return Math.floor((wayknotAdjusted * gearAdjusted.wetStaminaCostPermille) / 1_000);
}

function serviceCarriedGear(
  player: PlayerState,
  context: GearEffectContext,
  benefit: GearBenefitId,
): void {
  const result = applyGearServiceWear(player.craftingInventory, context, benefit);
  if (result.ok) player.craftingInventory = result.inventory;
}

/** Authoritative terrain context shared by placement, movement, and routing. */
export function wayknotContextAt(
  world: WorldView,
  tileIndex: number,
): WayknotTileContext | undefined {
  const tile = world.terrain.tiles[tileIndex];
  if (!tile) return undefined;
  return {
    tileIndex,
    terrain: tile.terrain,
    waterDepth: tile.waterDepth,
    windExposed: isWindExposedTile(tile),
    occupied: world.settlements.some((settlement) => settlement.tileIndex === tileIndex),
  };
}

/** Exact local influence used by both fixed-step travel and A* path costs. */
export function wayknotEffectsAt(
  player: PlayerState,
  world: WorldView,
  tileIndex: number,
): WayknotEffects {
  const context = wayknotContextAt(world, tileIndex);
  if (!context) {
    return queryWayknotEffects(
      player.wayknots,
      {
        tileIndex: -1,
        terrain: "meadow",
        waterDepth: 0,
        windExposed: false,
      },
      { width: world.terrain.width, height: world.terrain.height },
      world.completedTick,
    );
  }
  return queryWayknotEffects(
    player.wayknots,
    context,
    { width: world.terrain.width, height: world.terrain.height },
    world.completedTick,
  );
}

/** Selected Tide Harps are topology derived from the fixed Wayknot kit. */
export function tunedTideHarps(
  player: PlayerState,
  world: WorldView,
): readonly TideHarp[] {
  return deriveTideHarps(player.wayknots, world.terrain);
}

/**
 * At most one deterministic Harp supplies gameplay benefits at a position.
 * Selected Harps can geometrically overlap, so canonical ID order prevents
 * deployment input order from changing which three sounding origins answer.
 */
export function activeTideHarpAtPlayer(
  player: PlayerState,
  world: WorldView,
  harps: readonly TideHarp[] = tunedTideHarps(player, world),
): TideHarp | undefined {
  const tileIndex = playerTileIndex(player);
  return [...harps]
    .sort((left, right) => left.id.localeCompare(right.id))
    .find((harp) =>
      tideHarpEffectStrength(player.wayknots, harp.knots, world.completedTick) === FIXED_POINT
      && tideHarpContainsTileCenter(harp, tileIndex, world.terrain)
    );
}

/** One or many containing triangles still provide exactly one bounded bonus. */
export function tideHarpScanRechargeAtPlayer(
  player: PlayerState,
  world: WorldView,
  harps: readonly TideHarp[] = tunedTideHarps(player, world),
): 0 | typeof TIDE_HARP_SCAN_RECHARGE {
  return activeTideHarpAtPlayer(player, world, harps)
    ? TIDE_HARP_SCAN_RECHARGE
    : 0;
}

export function cargoWeight(player: PlayerState): number {
  return Math.ceil(cargoWeightMilli(player) / PACK_LOAD_MILLI_PER_UNIT);
}

/** Promise cargo and a signed report retain their legacy whole-load accounting. */
export function transportLoadMilli(player: Pick<PlayerState, "cargo" | "report">): number {
  const cargoLoad = player.cargo.reduce(
    (total, cargo) => total + promiseCargoLoadMilli(cargo.quantity, cargo.property),
    0,
  );
  return cargoLoad + (player.report ? PACK_LOAD_MILLI_PER_UNIT : 0);
}

/** Exact shared load used by gathering, crafting, Promise pickup, and the HUD. */
export function cargoWeightMilli(
  player: Pick<PlayerState, "cargo" | "report" | "craftingInventory">,
): number {
  return transportLoadMilli(player) + inventoryLoadMilli(player.craftingInventory);
}

export function loadContractCargo(player: PlayerState, contract: ContractState): boolean {
  if (player.activeContractId !== null || contract.status !== "offered") return false;
  const property = cargoProperty(contract.resource);
  const promisedLoadMilli = promiseCargoLoadMilli(contract.quantity, property);
  const capacityMilli = player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT;
  if (cargoWeightMilli(player) + promisedLoadMilli > capacityMilli) return false;
  player.cargo = [
    {
      contractId: contract.id,
      resource: contract.resource,
      quantity: contract.quantity,
      condition: FIXED_POINT,
      property,
    },
  ];
  player.activeContractId = contract.id;
  player.currentTrace = [playerTileIndex(player)];
  return true;
}

export function unloadContractCargo(player: PlayerState, contractId: number): PlayerCargo | undefined {
  const cargo = player.cargo.find((candidate) => candidate.contractId === contractId);
  if (!cargo) return undefined;
  player.cargo = player.cargo.filter((candidate) => candidate.contractId !== contractId);
  if (player.activeContractId === contractId) player.activeContractId = null;
  player.completedJourneys += 1;
  return cargo;
}

export function settlementAtPlayer(player: PlayerState, world: WorldView): number | null {
  const tileIndex = playerTileIndex(player);
  const settlement = world.settlements.find((candidate) => candidate.tileIndex === tileIndex);
  return settlement?.id ?? null;
}

export function playerTileIndex(player: PlayerState): number {
  return tileIndexAt(player.x, player.y, player.worldWidth, player.worldHeight);
}

export function discoverAround(player: PlayerState, world: WorldView, radius: number): void {
  discoverAroundTile(player, world, playerTileIndex(player), radius);
}

function discoverAroundTile(
  player: PlayerState,
  world: WorldView,
  centerTileIndex: number,
  radius: number,
): void {
  const center = world.terrain.tiles[centerTileIndex];
  if (!center) return;
  const centerX = center.x;
  const centerY = center.y;
  for (let y = Math.max(0, centerY - radius); y <= Math.min(world.terrain.height - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(world.terrain.width - 1, centerX + radius); x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy > radius * radius) continue;
      const index = y * world.terrain.width + x;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      player.discovered[index] = Math.max(player.discovered[index] ?? 0, FIXED_POINT - distance * 72_000);
    }
  }
}

function soundDepthAround(player: PlayerState, world: WorldView, radius: number): void {
  soundDepthAroundTile(player, world, playerTileIndex(player), radius);
}

function soundDepthAroundTile(
  player: PlayerState,
  world: WorldView,
  centerTileIndex: number,
  radius: number,
): void {
  const center = world.terrain.tiles[centerTileIndex];
  if (!center) return;
  const centerX = center.x;
  const centerY = center.y;
  for (let y = Math.max(0, centerY - radius); y <= Math.min(world.terrain.height - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(world.terrain.width - 1, centerX + radius); x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy > radius * radius) continue;
      const index = y * world.terrain.width + x;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      player.depthSoundings[index] = Math.max(
        player.depthSoundings[index] ?? 0,
        FIXED_POINT - distance * 68_000,
      );
    }
  }
}

function stepSweptPlayer(
  player: PlayerState,
  world: WorldView,
  priorTileIndex: number,
): Omit<
  PlayerStepResult,
  | "traversalFeedback"
  | "traversalIncident"
  | "fallEvaluation"
  | "fallEvaluations"
  | "footing"
  | "footingEvaluations"
> {
  const targetIndex = player.sweepPath[0];
  const target = targetIndex === undefined ? undefined : world.terrain.tiles[targetIndex];
  const support = player.sweepSupport;
  let enteredTile: number | null = null;

  if (target) {
    const targetX = target.x * TILE_UNITS + TILE_UNITS / 2;
    const targetY = target.y * TILE_UNITS + TILE_UNITS / 2;
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const speed = Math.min(distance, sweepStepSpeed(player, world));
    player.velocityX = Math.round((dx / distance) * speed);
    player.velocityY = Math.round((dy / distance) * speed);
    player.x = clamp(
      player.x + player.velocityX,
      TILE_UNITS / 2,
      world.terrain.width * TILE_UNITS - TILE_UNITS / 2,
    );
    player.y = clamp(
      player.y + player.velocityY,
      TILE_UNITS / 2,
      world.terrain.height * TILE_UNITS - TILE_UNITS / 2,
    );
    player.facingMilliRadians = approximateAngleMilliRadians(player.velocityX, player.velocityY);

    if (distance <= speed) {
      player.x = targetX;
      player.y = targetY;
      player.sweepPath.shift();
    }
  } else {
    player.velocityX = 0;
    player.velocityY = 0;
  }

  player.sweepTicksRemaining = Math.max(0, player.sweepTicksRemaining - 1);
  player.stability = Math.max(0, player.stability - 1_200);
  player.stabilityTrend = "falling";
  player.stabilityHint = `Swept by ${world.tide.direction > 0 ? "flood" : "ebb"} current${support ? ` · ${support} response inbound` : " · following the nearest safe bank"}`;

  const currentTileIndex = playerTileIndex(player);
  if (currentTileIndex !== priorTileIndex) {
    enteredTile = currentTileIndex;
    appendLoopErasedTile(player.currentTrace, currentTileIndex);
    // Involuntary drift never earns survey or Tide Choir credit.
    player.surveyTrace = [currentTileIndex];
    discoverAround(player, world, 2);
  }

  const currentTile = world.terrain.tiles[currentTileIndex];
  const reachedBank = player.sweepPath.length === 0
    && (currentTile?.waterDepth ?? FIXED_POINT) <= SAFE_BANK_DEPTH;
  if (!reachedBank && player.sweepPath.length === 0) {
    // Tide is live while the courier drifts. A bank that was safe when the
    // sweep began may flood before arrival, so an exhausted course must be
    // replanned from the actual current tile rather than declared ashore.
    const replanned = findSweepPath(world, currentTileIndex);
    if (replanned.length > 0) {
      const additionalTicks = estimateSweepTicks(player, world, replanned);
      player.sweepPath = replanned;
      player.sweepTicksRemaining = additionalTicks;
      player.sweepTotalTicks = Math.max(
        player.sweepTicksRemaining,
        player.sweepTotalTicks + additionalTicks,
      );
      player.stabilityHint = "The first bank flooded · current replotted toward the next safe shore";
    } else {
      // This should be vanishingly rare on generated worlds, but remaining in
      // the recoverable state is safer and more truthful than restoring control
      // in deep water. The next fixed step tries again against the live tide.
      player.sweepTicksRemaining = 1;
      player.sweepTotalTicks = Math.max(2, player.sweepTotalTicks);
      player.stabilityHint = "No bank is currently dry enough · holding with the tide until a safe shore opens";
    }
  }
  // The estimate is presentation state; the adjacent path remains
  // authoritative. Never let the HUD reach 100% while drift is still active.
  if (!reachedBank && player.sweepPath.length > 0) {
    player.sweepTicksRemaining = Math.max(1, player.sweepTicksRemaining);
  }
  if (reachedBank) {
    const rescued = support !== null;
    player.mode = rescued ? "rescued" : "camp";
    // The porter is still physically recovering on the bank. The first later
    // accepted movement step derives steady (or force-driven swift) itself.
    player.pace = "rest";
    player.stamina = rescued ? 240_000 : 150_000;
    player.stability = Math.max(player.stability, rescued ? 460_000 : 320_000);
    player.stabilityTrend = "recovering";
    player.stabilityHint = rescued
      ? `Recovered by ${support} response · cargo remained with you`
      : "Washed onto a safe bank · steady footing has returned";
    player.sweepTicksRemaining = 0;
    player.sweepTotalTicks = 0;
    player.sweepPath = [];
    player.sweepSupport = null;
    player.surveyTrace = [currentTileIndex];
    const harborId = settlementAtPlayer(player, world);
    player.lastHarborId = harborId;
    player.harborTrail = harborId === null ? [] : [harborId];
    if (rescued) player.rescues += 1;
    return {
      moved: player.x !== player.previousX || player.y !== player.previousY,
      enteredTile,
      damagedCargo: false,
      exhausted: false,
      rescued,
      becameSwept: false,
      swept: false,
      washedAshore: true,
      sweepCause: null,
      sweepSupport: support,
      settlementId: harborId,
    };
  }

  return {
    moved: player.x !== player.previousX || player.y !== player.previousY,
    enteredTile,
    damagedCargo: false,
    exhausted: false,
    rescued: false,
    becameSwept: false,
    swept: true,
    washedAshore: false,
    sweepCause: null,
    sweepSupport: support,
    settlementId: null,
  };
}

function sweepStepSpeed(player: PlayerState, world: WorldView): number {
  return sweepStepSpeedAtTile(player, world, playerTileIndex(player));
}

function sweepStepSpeedAtTile(
  player: PlayerState,
  world: WorldView,
  tileIndex: number,
): number {
  const infrastructure = player.sweepSupport === "ferry" ? 80 : 0;
  const kite = hasFieldTool(player, "storm-kite") ? 55 : 0;
  const currentEffects = wayknotEffectsAt(player, world, tileIndex);
  const anchorPull = Math.floor((WAYKNOT_PERMILLE - currentEffects.sweepRiskPermille) * 0.3);
  return 180 + infrastructure + kite + anchorPull;
}

function estimateSweepTicks(player: PlayerState, world: WorldView, path: readonly number[]): number {
  let x = player.x;
  let y = player.y;
  let ticks = 0;
  for (const index of path) {
    const tile = world.terrain.tiles[index];
    if (!tile) continue;
    const targetX = tile.x * TILE_UNITS + TILE_UNITS / 2;
    const targetY = tile.y * TILE_UNITS + TILE_UNITS / 2;
    // Mirror the live 100 ms drift rather than applying the starting tile's
    // Tide-anchor pull to the whole route. A segment can cross an influence
    // boundary before reaching its next tile center, so sample the simulated
    // position each step just as stepSweptPlayer does.
    while (true) {
      const dx = targetX - x;
      const dy = targetY - y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const currentTileIndex = tileIndexAt(
        x,
        y,
        world.terrain.width,
        world.terrain.height,
      );
      const speed = Math.min(
        distance,
        Math.max(1, sweepStepSpeedAtTile(player, world, currentTileIndex)),
      );
      x = clamp(
        x + Math.round((dx / distance) * speed),
        TILE_UNITS / 2,
        world.terrain.width * TILE_UNITS - TILE_UNITS / 2,
      );
      y = clamp(
        y + Math.round((dy / distance) * speed),
        TILE_UNITS / 2,
        world.terrain.height * TILE_UNITS - TILE_UNITS / 2,
      );
      ticks += 1;
      if (distance <= speed) {
        x = targetX;
        y = targetY;
        break;
      }
    }
  }
  return Math.max(1, ticks);
}

function sweepSupportAtTile(world: WorldView, tileIndex: number): SweepSupport {
  let ferry = false;
  for (const route of world.routes) {
    if (route.traceStrength < STRAND_AUTOMATION_THRESHOLD || !route.path.includes(tileIndex)) continue;
    for (const settlementId of [route.fromSettlementId, route.toSettlementId]) {
      const project = world.settlements.find((settlement) => settlement.id === settlementId)?.project;
      if (project?.status !== "complete") continue;
      if (project.kind === "clinic") return "clinic";
      if (project.kind === "ferry") ferry = true;
    }
  }
  return ferry ? "ferry" : null;
}

/** Deterministic adjacent BFS to the nearest currently safe bank. */
function findSweepPath(world: WorldView, startIndex: number): number[] {
  const count = world.terrain.tiles.length;
  const previous = new Int32Array(count);
  previous.fill(-1);
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIndex;
  visited[startIndex] = 1;
  let bankIndex = -1;

  while (head < tail) {
    const index = queue[head];
    head += 1;
    if (index === undefined) continue;
    const tile = world.terrain.tiles[index];
    if (!tile) continue;
    if (index !== startIndex && tile.waterDepth <= SAFE_BANK_DEPTH && tile.terrain !== "deep-water") {
      bankIndex = index;
      break;
    }
    for (const neighbor of sweepNeighbors(world, index)) {
      if (visited[neighbor] === 1) continue;
      visited[neighbor] = 1;
      previous[neighbor] = index;
      queue[tail++] = neighbor;
    }
  }

  if (bankIndex < 0) return [];
  const reversed: number[] = [];
  let cursor = bankIndex;
  while (cursor !== startIndex && cursor >= 0) {
    reversed.push(cursor);
    cursor = previous[cursor] ?? -1;
  }
  reversed.reverse();
  return reversed;
}

function sweepNeighbors(world: WorldView, index: number): number[] {
  const tile = world.terrain.tiles[index];
  if (!tile) return [];
  const candidates: number[] = [];
  if (tile.x > 0) candidates.push(index - 1);
  if (tile.x + 1 < world.terrain.width) candidates.push(index + 1);
  if (tile.y > 0) candidates.push(index - world.terrain.width);
  if (tile.y + 1 < world.terrain.height) candidates.push(index + world.terrain.width);
  const desired = surfaceCurrentDirection(world.tide.direction, world.weather.windY);
  return candidates.sort((leftIndex, rightIndex) => {
    const left = world.terrain.tiles[leftIndex];
    const right = world.terrain.tiles[rightIndex];
    if (!left || !right) return leftIndex - rightIndex;
    const leftCurrent = (left.x - tile.x) * desired.x + (left.y - tile.y) * desired.y;
    const rightCurrent = (right.x - tile.x) * desired.x + (right.y - tile.y) * desired.y;
    return rightCurrent - leftCurrent || left.waterDepth - right.waterDepth || leftIndex - rightIndex;
  });
}

function cargoProperty(resource: ContractState["resource"]): PlayerCargo["property"] {
  switch (resource) {
    case "medicine":
      return "fragile";
    case "food":
      return "perishable";
    case "freshWater":
    case "parts":
      return "heavy";
    case "reed":
      return "ordinary";
  }
}

function appendLoopErasedTile(trace: number[], tileIndex: number): void {
  if (trace[trace.length - 1] === tileIndex) return;
  const earlierVisit = trace.lastIndexOf(tileIndex);
  if (earlierVisit >= 0) trace.splice(earlierVisit + 1);
  else trace.push(tileIndex);
}

function tileIndexAt(x: number, y: number, width: number, height: number): number {
  const tileX = clamp(Math.floor(x / TILE_UNITS), 0, width - 1);
  const tileY = clamp(Math.floor(y / TILE_UNITS), 0, height - 1);
  return tileY * width + tileX;
}

function approximateAngleMilliRadians(x: number, y: number): number {
  return Math.round(Math.atan2(y, x) * 1_000);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
