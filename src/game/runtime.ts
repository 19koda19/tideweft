import type { RendererCommand, TideweftView, WorldPoint } from "../render/types";
import {
  createWorld,
  createWorldView,
  deserializeWorld,
  FIXED_POINT,
  serializeWorld,
  STRAND_AUTOMATION_THRESHOLD,
  stepWorld,
  type ContractState,
  type SimCommand,
  type WorldState,
  type WorldView,
} from "../sim/public";
import { findTilePath, MAX_TIDE_LEVEL } from "../sim/terrain";
import {
  advanceFieldResourceEcology,
  canonicalizeFieldResourceState,
  createFieldResourceEcologyState,
  fieldResourceStockUnits,
  generateFieldResourceCatalog,
  harvestFieldResource,
  type FieldMaterialId,
  type FieldResourceCatalog,
  type FieldResourceEcologyState,
  type FieldResourceNode,
} from "../sim/fieldResources";
import {
  PERPETUAL_SESSION_SHAPE,
  type TideweftUICommand,
  type TideweftUIView,
} from "../ui/types";
import { TideweftSoundscape } from "../audio/soundscape";
import { createSaveRepository, type SaveRecord, type SaveRepository } from "../platform/persistence";
import {
  FIELD_TOOL_LABELS,
  PACK_LOAD_MILLI_PER_UNIT,
  TILE_UNITS,
  activeTideHarpAtPlayer,
  cargoWeight,
  cargoWeightMilli,
  createPlayer,
  cyclePace,
  loadContractCargo,
  playerTileIndex,
  pulseScan,
  restoreSweptPlayer,
  settlementAtPlayer,
  stepPlayer,
  unlockFieldToolAtSettlement,
  unloadContractCargo,
  waterEffortPerStep,
  wayknotContextAt,
  wayknotEffectsAt,
  type FieldToolKind,
  type PlayerControl,
  type PlayerMode,
  type PlayerState,
  type TravelPace,
} from "./player";
import {
  CRAFTING_CONDITION_MAX,
  CRAFTING_RECIPES,
  CRAFTING_STACK_DEFINITIONS,
  createCraftingInventory,
  craft,
  dismantle,
  inventoryLoadMilli,
  quoteWayknotRepairCost,
  repair,
  type CraftingInventory,
  type CraftingStackId,
} from "./crafting";
import type { TideHarp } from "./tideHarps";
import {
  DEFAULT_WAYKNOT_CAPACITY,
  TIDE_ANCHOR_PLACEMENT_DEPTH,
  WAYKNOT_DESCRIPTIONS,
  WAYKNOT_LABELS,
  contextualWayknotKind,
  modifyPathCost,
  normalizeWayknotState,
  toggleContextualWayknot,
  wayknotAtTile,
  type WayknotActionReason,
  type WayknotKind,
  type WayknotPlacementReason,
} from "./wayknots";
import { projectGameView } from "./projection";
import {
  announce,
  captureSessionBaseline,
  createSessionState,
  type GameSessionState,
} from "./sessionTypes";
import { updateTutorial } from "./tutorial";
import { appendSurveyedHarborLeg, assessHarborLeg, type TideChoirCycle } from "./tideChoir";
import { projectUIView } from "./uiProjection";

const FIXED_STEP_MS = 100;
const PLAYER_STEPS_PER_WORLD_TICK = 10;
const MAX_STEPS_PER_FRAME = 6;
const AUTOSAVE_INTERVAL_TICKS = 600;
const AUTOSAVE_SLOT = "autosave";
const RENDER_TILE_SIZE = 24;
const GAME_SAVE_VERSION = 2;
const LEGACY_GAME_SAVE_VERSION = 1;
const FIRST_CRAFTED_GEAR_ID = DEFAULT_WAYKNOT_CAPACITY + 1;
const MAX_SAFE_CARGO_QUANTITY = Math.floor(
  Number.MAX_SAFE_INTEGER / (2 * PACK_LOAD_MILLI_PER_UNIT),
);

const PLAYER_CARGO_RESOURCES: ReadonlySet<ContractState["resource"]> = new Set([
  "food",
  "freshWater",
  "medicine",
  "parts",
  "reed",
]);

const GATHER_STAMINA_COST: Readonly<Record<FieldMaterialId, number>> = {
  bladderkelp: 4_000,
  cordreed: 4_000,
  driftwood: 6_000,
  "glimmer-spore": 4_000,
  hookstone: 8_000,
  pitchmoss: 4_000,
  shellstone: 8_000,
  stormlichen: 6_000,
  sunfiber: 4_000,
};

interface GameSaveEnvelope {
  format: "tideweft-session";
  version: number;
  world: string;
  player: PlayerState;
  session: GameSessionState;
  fieldResources: FieldResourceEcologyState;
}

export interface TideweftRuntime {
  readonly start: () => void;
  readonly stop: () => void;
  readonly destroy: () => void;
  readonly getRenderView: () => TideweftView;
  readonly getUIView: () => TideweftUIView;
  readonly dispatchRenderer: (command: RendererCommand) => void;
  readonly dispatchUI: (command: TideweftUICommand) => void;
  readonly save: () => Promise<void>;
  readonly setFocusHandler: (handler: ((point: WorldPoint, zoom?: number) => void) | undefined) => void;
}

export async function createTideweftRuntime(
  repository: SaveRepository = createSaveRepository(),
): Promise<TideweftRuntime> {
  let world = createWorld("quiet-delta", "standard");
  let worldView = createWorldView(world);
  let fieldResourceCatalog = runtimeFieldResourceCatalog(world);
  let fieldResourceEcology = createFieldResourceEcologyState(world.meta.completedTick);
  const firstPromise = worldView.contracts.find((contract) => contract.status === "offered");
  let player = createPlayer(worldView, firstPromise?.originSettlementId);
  let session = createSessionState(world.meta.seedText);
  let renderView = projectGameView(worldView, player, { paused: true });
  let uiView = projectUIView(worldView, player, session, {
    fieldResourceCatalog,
    fieldResourceEcology,
  });
  const soundscape = new TideweftSoundscape();
  let focusHandler: ((point: WorldPoint, zoom?: number) => void) | undefined;
  let animationFrame = 0;
  let running = false;
  let previousFrame = 0;
  let accumulator = 0;
  let commandSequence = 1;
  let commandQueue: SimCommand[] = [];
  let playerStepsSinceWorldTick = 0;
  let manualControl: PlayerControl = { moveX: 0, moveY: 0, brace: false };
  let autopilotPath: number[] = [];
  let pendingGatherNodeId: string | null = null;
  let pendingAcceptance: { contractId: number; acceptCommandId: string; pickupCommandId: string } | null = null;
  let pendingDelivery: { contractId: number; commandId: string; wasAutomated: boolean } | null = null;
  let pendingReinforcement: {
    routeId: number;
    settlementId: number;
    commandId: string;
    wasAutomated: boolean;
  } | null = null;
  let pendingRenegotiation: { contractId: number; settlementId: number; commandId: string } | null = null;
  let pendingReportDelivery: { commandId: string; targetSettlementId: number } | null = null;
  let pendingChoir: { commandId: string; cycle: TideChoirCycle } | null = null;
  let lastAutosaveTick = 0;
  let lastCargoDamageNoticeMs = Number.NEGATIVE_INFINITY;
  let pendingSave: { sequence: number; record: SaveRecord } | undefined;
  let saveWorkerRunning = false;
  let saveSequence = 0;
  const saveWaiters: Array<{
    sequence: number;
    resolve: () => void;
    reject: (reason: unknown) => void;
  }> = [];

  const loaded = await loadAutosave(repository);
  if (loaded) {
    world = loaded.world;
    worldView = createWorldView(world);
    fieldResourceCatalog = runtimeFieldResourceCatalog(world);
    fieldResourceEcology = canonicalizeFieldResourceState(
      fieldResourceCatalog,
      loaded.fieldResources,
    );
    player = loaded.player;
    player.worldWidth = worldView.terrain.width;
    player.worldHeight = worldView.terrain.height;
    player.x = clamp(player.x, TILE_UNITS / 2, worldView.terrain.width * TILE_UNITS - TILE_UNITS / 2);
    player.y = clamp(player.y, TILE_UNITS / 2, worldView.terrain.height * TILE_UNITS - TILE_UNITS / 2);
    player.previousX = Number.isFinite(player.previousX)
      ? clamp(player.previousX, TILE_UNITS / 2, worldView.terrain.width * TILE_UNITS - TILE_UNITS / 2)
      : player.x;
    player.previousY = Number.isFinite(player.previousY)
      ? clamp(player.previousY, TILE_UNITS / 2, worldView.terrain.height * TILE_UNITS - TILE_UNITS / 2)
      : player.y;
    player.velocityX = Number.isFinite(player.velocityX) ? player.velocityX : 0;
    player.velocityY = Number.isFinite(player.velocityY) ? player.velocityY : 0;
    player.facingMilliRadians = Number.isFinite(player.facingMilliRadians) ? player.facingMilliRadians : 0;
    player.stamina = clamp(player.stamina, 0, FIXED_POINT);
    player.stability = clamp(player.stability, 0, FIXED_POINT);
    player.scanCharge = clamp(player.scanCharge, 0, FIXED_POINT);
    player.scanPulse = Number.isFinite(player.scanPulse) ? clamp(player.scanPulse, 0, FIXED_POINT) : 0;
    player.pace = isTravelPace(player.pace) ? player.pace : "steady";
    player.mode = isPlayerMode(player.mode) ? player.mode : "foot";
    player.report = player.report ?? null;
    player.reportsDelivered = Number.isFinite(player.reportsDelivered) ? Math.max(0, Math.floor(player.reportsDelivered)) : 0;
    player.stabilityTrend = player.stabilityTrend === "falling" || player.stabilityTrend === "recovering"
      ? player.stabilityTrend
      : "steady";
    player.stabilityHint = typeof player.stabilityHint === "string" && player.stabilityHint.trim().length > 0
      ? player.stabilityHint
      : "Stable · hold Shift while moving to brace";
    player.discovered = player.discovered.map((value) => Number.isFinite(value)
      ? clamp(value, 0, FIXED_POINT)
      : 0);
    const validTools: readonly FieldToolKind[] = ["sounding-line", "marsh-stilts", "tide-sail", "storm-kite"];
    player.tools = Array.isArray(player.tools)
      ? [...new Set(player.tools.filter((tool): tool is FieldToolKind => validTools.includes(tool as FieldToolKind)))].sort()
      : ["sounding-line"];
    if (!player.tools.includes("sounding-line")) player.tools.unshift("sounding-line");
    player.wayknots = normalizeWayknotState(player.wayknots, {
      capacity: DEFAULT_WAYKNOT_CAPACITY,
      tileCount: worldView.terrain.tiles.length,
      loadTick: worldView.completedTick,
      contextAt: (tileIndex) => {
        const context = wayknotContextAt(worldView, tileIndex);
        if (!context) return undefined;
        const tile = worldView.terrain.tiles[tileIndex];
        const canReachAnchorDepth = tile !== undefined
          && MAX_TIDE_LEVEL - tile.elevation >= TIDE_ANCHOR_PLACEMENT_DEPTH;
        // Preserve an anchor that could truthfully have been set at peak tide,
        // even if this save resumes during an ebb. High marsh, meadow, and
        // ridge that can never reach placement depth remain authoritative so
        // malformed imported placements return safely to the carried kit.
        return canReachAnchorDepth
          ? { ...context, waterDepth: Math.max(context.waterDepth, TIDE_ANCHOR_PLACEMENT_DEPTH) }
          : context;
      },
    });
    player.depthSoundings = Array.isArray(player.depthSoundings)
      && player.depthSoundings.length === worldView.terrain.tiles.length
      ? player.depthSoundings.map((value) => Number.isFinite(value) ? Math.max(0, Math.min(1_000_000, value)) : 0)
      : Array.from({ length: worldView.terrain.tiles.length }, () => 0);
    player.sweepPath = Array.isArray(player.sweepPath) ? player.sweepPath : [];
    player.sweepTicksRemaining = Number.isFinite(player.sweepTicksRemaining)
      ? Math.max(0, Math.floor(player.sweepTicksRemaining))
      : 0;
    player.sweepTotalTicks = Number.isFinite(player.sweepTotalTicks)
      ? Math.max(player.sweepTicksRemaining, Math.floor(player.sweepTotalTicks))
      : player.sweepTicksRemaining;
    player.sweepSupport = player.sweepSupport === "clinic" || player.sweepSupport === "ferry"
      ? player.sweepSupport
      : null;
    if (player.mode === "swept" && !restoreSweptPlayer(player, worldView)) {
      player.mode = "camp";
      player.stamina = Math.max(player.stamina, 150_000);
      restoreSweptPlayer(player, worldView);
    } else if (player.mode !== "swept") {
      restoreSweptPlayer(player, worldView);
    }
    const loadedHarborId = settlementAtPlayer(player, worldView);
    player.surveyTrace = Array.isArray(player.surveyTrace) && player.surveyTrace.length > 0
      ? player.surveyTrace
      : [playerTileIndex(player)];
    player.surveyedRouteIds = Array.isArray(player.surveyedRouteIds)
      ? [...new Set(player.surveyedRouteIds.filter((id) => worldView.routes.some((route) => route.id === id)))].sort((left, right) => left - right)
      : [];
    player.lastHarborId = player.lastHarborId === null || worldView.settlements.some((settlement) => settlement.id === player.lastHarborId)
      ? player.lastHarborId
      : loadedHarborId;
    player.harborTrail = Array.isArray(player.harborTrail) && player.harborTrail.every((id) => worldView.settlements.some((settlement) => settlement.id === id))
      ? player.harborTrail.slice(-8)
      : player.lastHarborId === null ? [] : [player.lastHarborId];
    session = loaded.session;
    session.paused = true;
    session.titleVisible = true;
    session.quietHourVisible = false;
    session.hasSave = true;
    session.sessionPlayMilliseconds = Number.isFinite(session.sessionPlayMilliseconds)
      ? Math.max(0, session.sessionPlayMilliseconds)
      : 0;
    session.sessionStrandsWoven = Number.isFinite(session.sessionStrandsWoven) ? session.sessionStrandsWoven : 0;
    session.sessionChoirsAwakened = Number.isFinite(session.sessionChoirsAwakened) ? session.sessionChoirsAwakened : 0;
    session.sessionReportsDelivered = Number.isFinite(session.sessionReportsDelivered)
      ? session.sessionReportsDelivered
      : 0;
    session.sessionDiscoveredAtStart = Number.isFinite(session.sessionDiscoveredAtStart)
      ? session.sessionDiscoveredAtStart
      : discoveredCount(player);
    session.sessionBaseline = session.sessionBaseline ?? null;
    session.closureOffered = Boolean(session.closureOffered);
    session.campaignCelebrated = Boolean(session.campaignCelebrated);
    session.continueSummary = continueSummary(worldView, player);
    lastAutosaveTick = world.meta.completedTick;
    refreshViews();
  }

  function refreshViews(): void {
    const activeContract = player.activeContractId === null
      ? undefined
      : worldView.contracts.find((contract) => contract.id === player.activeContractId);
    const trackedContract = session.trackedContractId === null
      ? undefined
      : worldView.contracts.find((contract) => contract.id === session.trackedContractId);
    const objectiveContract = activeContract ?? trackedContract;
    const destinationSettlementId = activeContract
      ? activeContract.destinationSettlementId
      : player.report
        ? player.report.targetSettlementId
      : trackedContract?.status === "offered"
        ? trackedContract.originSettlementId
        : trackedContract?.destinationSettlementId;
    const destinationKind = activeContract
      ? "delivery" as const
      : player.report
        ? "report" as const
        : trackedContract?.status === "offered"
          ? "pickup" as const
          : undefined;
    renderView = projectGameView(worldView, player, {
      selectedSettlementId: session.selectedSettlementId,
      selectedRouteId: objectiveContract?.routeId ?? null,
      destinationSettlementId: destinationSettlementId ?? null,
      ...(destinationKind ? { destinationKind } : {}),
      fieldResourceCatalog,
      fieldResourceEcology,
      paused: session.paused || session.titleVisible || session.quietHourVisible,
    });
    uiView = projectUIView(worldView, player, session, {
      fieldResourceCatalog,
      fieldResourceEcology,
    });
  }

  function commandId(kind: string): string {
    const id = `player-${kind}-${world.meta.completedTick + 1}-${commandSequence}`;
    commandSequence += 1;
    return id;
  }

  function queue(command: SimCommand): void {
    commandQueue.push(command);
  }

  function currentControl(): PlayerControl {
    if (manualControl.moveX || manualControl.moveY || autopilotPath.length === 0) return manualControl;
    const nextIndex = autopilotPath[0];
    if (nextIndex === undefined) return manualControl;
    const tile = worldView.terrain.tiles[nextIndex];
    if (!tile) {
      autopilotPath = [];
      pendingGatherNodeId = null;
      return manualControl;
    }
    const targetX = tile.x * TILE_UNITS + TILE_UNITS / 2;
    const targetY = tile.y * TILE_UNITS + TILE_UNITS / 2;
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    if (Math.abs(dx) < 85 && Math.abs(dy) < 85) {
      autopilotPath.shift();
      return currentControl();
    }
    return {
      moveX: signControl(dx),
      moveY: signControl(dy),
      brace: manualControl.brace,
    };
  }

  function tick(): void {
    if (session.paused || session.titleVisible || session.quietHourVisible) return;
    const beforeX = player.x;
    const beforeY = player.y;
    const result = stepPlayer(player, worldView, currentControl());
    if (result.enteredTile !== null && result.settlementId !== null) {
      recordHarborArrival(result.settlementId);
      const unlockedTool = unlockFieldToolAtSettlement(player, worldView, result.settlementId);
      if (unlockedTool) {
        const harborName = settlementName(worldView, result.settlementId);
        session.sessionChanges.push(`${harborName} entrusted you with ${FIELD_TOOL_LABELS[unlockedTool].toLocaleLowerCase()}.`);
        announce(
          session,
          `${harborName}'s completed civic work adds ${FIELD_TOOL_LABELS[unlockedTool]} to your field kit. ${fieldToolEffect(unlockedTool)}`,
          true,
        );
        soundscape.play("strand", 0.68);
      }
    }
    session.sessionPlayMilliseconds += FIXED_STEP_MS;
    session.sessionDistanceUnits += Math.round(Math.hypot(player.x - beforeX, player.y - beforeY));
    playerStepsSinceWorldTick += 1;
    const worldAdvanced = playerStepsSinceWorldTick >= PLAYER_STEPS_PER_WORLD_TICK;
    if (worldAdvanced) {
      playerStepsSinceWorldTick = 0;
      const elapsedWeather = world.weather;
      world = stepWorld(world, commandQueue);
      commandQueue = [];
      worldView = createWorldView(world);
      fieldResourceEcology = advanceFieldResourceEcology(
        fieldResourceCatalog,
        fieldResourceEcology,
        1,
        elapsedWeather,
      );
    }

    if (pendingGatherNodeId !== null && autopilotPath.length === 0) {
      const node = fieldResourceNode(pendingGatherNodeId);
      if (node && node.tileIndex === playerTileIndex(player)) {
        const requestedNodeId = pendingGatherNodeId;
        pendingGatherNodeId = null;
        gatherFieldResource(requestedNodeId);
      }
    }

    if (result.moved) soundscape.play("step", player.pace === "swift" ? 0.8 : 0.42);
    if (result.becameSwept) {
      autopilotPath = [];
      pendingGatherNodeId = null;
      manualControl = { ...manualControl, moveX: 0, moveY: 0 };
      const collapse = result.sweepCause === "stability"
        ? {
            change: "Deep-water instability became a recoverable sweep; the cargo stayed accountable and weathered once.",
            warning: "STABILITY EMPTY IN DEEP WATER — SWEPT.",
          }
        : {
            change: "Deep-water exhaustion became a recoverable sweep; the cargo stayed accountable and weathered once.",
            warning: "STAMINA EMPTY IN DEEP WATER — SWEPT.",
          };
      const support = result.sweepSupport === "ferry"
        ? " A connected ferry crew has shortened the drift."
        : " The current is carrying you toward the nearest safe bank.";
      session.sessionChanges.push(collapse.change);
      announce(
        session,
        `${collapse.warning} Steering is temporarily lost; cargo stays with you.${support}`,
        true,
      );
      soundscape.play("warning", 0.82);
    } else if (result.exhausted || (result.rescued && !result.washedAshore)) {
      if (result.rescued) {
        session.sessionChanges.push("A completed clinic and established strand turned a field collapse into mutual aid.");
        announce(session, "A clinic crew reached you through the established strand. Nothing was lost; infrastructure changed failure into care.", true);
        soundscape.play("deliver", 0.62);
      } else {
        announce(session, "You made camp. Nothing was lost; rest pace will rebuild your stamina.");
        soundscape.play("rest");
      }
    }
    if (result.washedAshore) {
      const support = result.sweepSupport
        ? `${result.sweepSupport === "clinic" ? "Clinic" : "Ferry"} support brought you in sooner.`
        : "The nearest safe bank caught you.";
      session.sessionChanges.push(`You washed ashore with every cargo item still in your care. ${support}`);
      announce(session, `ASHORE — ${support} Rest has restored enough stamina to continue; cargo quantity was never lost.`, true);
      soundscape.play("rest", 0.9);
    }
    if (!result.becameSwept && result.damagedCargo && session.sessionPlayMilliseconds - lastCargoDamageNoticeMs >= 2_500) {
      lastCargoDamageNoticeMs = session.sessionPlayMilliseconds;
      const property = player.cargo[0]?.property;
      announce(
        session,
        property === "perishable"
          ? "Fresh provisions age gently in transit. Choose an efficient line; completed harbor caches halt the loss while sheltered."
          : property === "fragile"
            ? "The medicine case felt that jolt. Hold Shift to brace while moving: slower, steadier, and fully protected from handling shock."
            : "The load shifted and weathered slightly. Ease the pace or hold Shift to brace it while moving.",
      );
      soundscape.play("warning", 0.32);
    }
    if (worldAdvanced) {
      reconcileContract();
      checkCampaignResolution();
    }
    const tutorialAdvanced = updateTutorial(session.tutorial, player);
    if (tutorialAdvanced) {
      announce(session, tutorialAdvanceMessage(session.tutorial.stage));
      soundscape.play("strand", 0.45);
    }
    soundscape.updateAmbience(
      worldView.tide.level / 1_000_000,
      worldView.weather.intensity / 1_000_000,
      averageRouteStrength(worldView),
    );
    refreshViews();

    if (world.meta.completedTick - lastAutosaveTick >= AUTOSAVE_INTERVAL_TICKS) {
      lastAutosaveTick = world.meta.completedTick;
      void save();
    }
  }

  function reconcileContract(): void {
    if (pendingAcceptance !== null) {
      const accepted = worldView.contracts.find((contract) => contract.id === pendingAcceptance?.contractId);
      const rejected = rejectionFor([pendingAcceptance.acceptCommandId, pendingAcceptance.pickupCommandId]);
      if (accepted?.status === "in-transit" && accepted.carrierKind === "player") {
        pendingAcceptance = null;
      } else if (rejected || !accepted || accepted.carrierKind === "resident" || isTerminal(accepted.status)) {
        const contractId = pendingAcceptance.contractId;
        pendingAcceptance = null;
        releaseLocalCargo(contractId);
        if (accepted?.status === "accepted" && accepted.carrierKind === "player") {
          queue({
            id: commandId("cancel-after-pickup"),
            type: "cancel-contract",
            contractId,
            sourceId: 0,
            sequence: commandSequence,
          });
        }
        announce(
          session,
          rejected
            ? `The harbor could not secure that cargo: ${rejected}. The promise remains recoverable.`
            : "That cargo was claimed before the harbor could secure it. Choose another useful promise.",
          true,
        );
        soundscape.play("warning");
      }
    }

    if (pendingDelivery !== null) {
      const delivered = worldView.contracts.find((contract) => contract.id === pendingDelivery?.contractId);
      if (delivered?.status === "fulfilled") {
        const deliveryWasAutomated = pendingDelivery.wasAutomated;
        const cargo = unloadContractCargo(player, pendingDelivery.contractId);
        pendingDelivery = null;
        if (session.trackedContractId === delivered.id) session.trackedContractId = null;
        session.sessionDeliveries += 1;
        session.tutorial.witnessedChanges += 1;
        const destination = settlementName(worldView, delivered.destinationSettlementId);
        const grade = delivered.deliveryGrade ?? "arrived";
        const requester = worldView.residents.find((resident) => resident.id === delivered.requesterResidentId)?.name;
        const route = worldView.routes.find((candidate) => candidate.id === delivered.routeId);
        const newlyAutomated = !deliveryWasAutomated
          && (route?.traceStrength ?? 0) >= STRAND_AUTOMATION_THRESHOLD;
        const unlockedTool = unlockFieldToolAtSettlement(player, worldView, delivered.destinationSettlementId);
        if (newlyAutomated) session.sessionStrandsWoven += 1;
        const change = `${requester ?? destination} received ${delivered.quantity} ${humanResource(delivered.resource)} at ${destination} (${grade})${newlyAutomated ? "; the route became self-carrying" : ""}.`;
        session.sessionChanges.push(change);
        if (unlockedTool) {
          session.sessionChanges.push(`${destination}'s completed project entrusted you with ${FIELD_TOOL_LABELS[unlockedTool].toLocaleLowerCase()}.`);
        }
        if (session.sessionChanges.length > 32) session.sessionChanges.splice(0, 8);
        announce(
          session,
          `${requester ?? destination} received the promise${cargo ? ` at ${Math.round(cargo.condition / 10_000)}% condition` : ""}. The route and relationship both changed${newlyAutomated ? ", and autonomous porters can now inherit this corridor" : ""}.${unlockedTool ? ` ${destination} adds ${FIELD_TOOL_LABELS[unlockedTool]} to your field kit: ${fieldToolEffect(unlockedTool)}` : ""}`,
          true,
        );
        soundscape.play("deliver", 1);
        return;
      }
      const rejected = rejectionFor([pendingDelivery.commandId]);
      if (rejected || (delivered && delivered.status !== "in-transit")) {
        pendingDelivery = null;
        announce(
          session,
          rejected
            ? `The harbor could not read that route: ${rejected}. Your cargo remains safe; retrace the final approach and try again.`
            : "The delivery could not be recorded. The cargo remains with you so you can recover.",
          true,
        );
        soundscape.play("warning");
      }
    }

    if (pendingRenegotiation !== null) {
      const contract = worldView.contracts.find((candidate) => candidate.id === pendingRenegotiation?.contractId);
      const rejected = rejectionFor([pendingRenegotiation.commandId]);
      if (contract?.status === "cancelled") {
        const harbor = settlementName(worldView, pendingRenegotiation.settlementId);
        releaseLocalCargo(contract.id);
        if (session.trackedContractId === contract.id) session.trackedContractId = null;
        session.sessionChanges.push(`${harbor} accepted a careful cargo handoff; the traveled trace remains charted.`);
        pendingRenegotiation = null;
        announce(session, `${harbor} took responsibility for the cargo. The promise was released without erasing your route knowledge.`, true);
        soundscape.play("rest", 0.8);
      } else if (rejected) {
        pendingRenegotiation = null;
        announce(session, `The harbor could not record that handoff: ${rejected}. Your cargo remains safe.`, true);
        soundscape.play("warning");
      }
    }

    if (player.activeContractId !== null) {
      const active = worldView.contracts.find((contract) => contract.id === player.activeContractId);
      if (!active || active.status === "expired" || active.status === "cancelled") {
        player.cargo = [];
        player.activeContractId = null;
        announce(session, "That promise changed before arrival. Your route knowledge remains, and the harbor will renegotiate.");
      }
    }

    if (pendingReinforcement !== null) {
      const reinforced = worldView.events.find(
        (event) => event.type === "route-reinforced" && event.data.commandId === pendingReinforcement?.commandId,
      );
      const rejected = rejectionFor([pendingReinforcement.commandId]);
      if (reinforced) {
        const route = worldView.routes.find((candidate) => candidate.id === pendingReinforcement?.routeId);
        const origin = worldView.settlements.find((settlement) => settlement.id === route?.fromSettlementId)?.name ?? "one harbor";
        const destination = worldView.settlements.find((settlement) => settlement.id === route?.toSettlementId)?.name ?? "another harbor";
        const newlyAutomated = !pendingReinforcement.wasAutomated
          && (route?.traceStrength ?? 0) >= 32_000;
        session.sessionStrandsWoven += 1;
        session.sessionChanges.push(
          newlyAutomated
            ? `${origin} ↔ ${destination} became a self-carrying strand.`
            : `${origin} ↔ ${destination} was tended for future travelers.`,
        );
        announce(
          session,
          newlyAutomated
            ? `The route between ${origin} and ${destination} can now carry autonomous porters. Your path became shared capacity.`
            : `${origin} and ${destination} now share a stronger, more weatherworthy strand.`,
          true,
        );
        pendingReinforcement = null;
        soundscape.play("deliver", 0.72);
      } else if (rejected) {
        pendingReinforcement = null;
        announce(session, `The strand crew kept the part in stores: ${rejected}.`, true);
        soundscape.play("warning");
      }
    }

    if (pendingReportDelivery !== null) {
      const shared = worldView.events.find(
        (event) => event.type === "knowledge-shared" && event.data.commandId === pendingReportDelivery?.commandId,
      );
      const rejected = rejectionFor([pendingReportDelivery.commandId]);
      if (shared && player.report) {
        const source = settlementName(worldView, player.report.sourceSettlementId);
        const target = settlementName(worldView, player.report.targetSettlementId);
        const age = worldView.completedTick - player.report.observedTick;
        player.report = null;
        player.reportsDelivered += 1;
        session.sessionReportsDelivered += 1;
        session.sessionChanges.push(`${target} received ${source}'s signed report at ${age} minutes old.`);
        pendingReportDelivery = null;
        announce(session, `${target} now has a sourced, current fact from ${source}. Future supply decisions can use it without guessing.`, true);
        soundscape.play("deliver", 0.68);
      } else if (rejected) {
        pendingReportDelivery = null;
        announce(session, `The report stayed in your case: ${rejected}. Its source and age remain intact.`, true);
        soundscape.play("warning");
      }
    }

    if (pendingChoir !== null) {
      const awakened = worldView.events.find(
        (event) => event.type === "tide-choir-awakened" && event.data.commandId === pendingChoir?.commandId,
      );
      const rejected = rejectionFor([pendingChoir.commandId]);
      if (awakened) {
        const harborNames = pendingChoir.cycle.harborIds
          .slice(0, -1)
          .map((id) => settlementName(worldView, id));
        session.sessionChoirsAwakened += 1;
        session.sessionChanges.push(
          `The ${harborNames.join("–")} loop awakened a Tide Choir; its shared routes became more weatherworthy.`,
        );
        pendingChoir = null;
        announce(
          session,
          `The loop closes: ${harborNames.join(" → ")} → ${harborNames[0] ?? "home"}. Lantern-moths answer in harmony, and every route in this unique Tide Choir gains condition and reliability.`,
          true,
        );
        soundscape.play("choir", 1);
      } else if (rejected) {
        pendingChoir = null;
        announce(session, `The harbor phrase could not settle into the network: ${rejected}. The surveyed routes remain remembered.`, true);
        soundscape.play("warning", 0.45);
      }
    }
  }

  function dispatchRenderer(command: RendererCommand): void {
    void soundscape.unlock();
    switch (command.type) {
      case "movement":
        manualControl = {
          moveX: signControl(command.vector.x),
          moveY: signControl(command.vector.y),
          brace: manualControl.brace,
        };
        if (manualControl.moveX || manualControl.moveY) {
          autopilotPath = [];
          pendingGatherNodeId = null;
        }
        break;
      case "brace":
        manualControl = { ...manualControl, brace: command.active };
        break;
      case "move-target":
        pendingGatherNodeId = null;
        setAutopilot(command.point, command.additive);
        break;
      case "resource-target":
        targetFieldResource(command.nodeId, command.gatherOnArrival);
        break;
      case "scan":
        scan();
        break;
      case "interact":
        interact();
        break;
      case "wayknot":
        toggleWayknot();
        break;
      case "pace-step":
        if (player.mode === "swept") {
          announce(session, "The current has the helm until you reach a safe bank; pace returns ashore.", true);
          refreshViews();
          break;
        }
        cyclePace(player, command.delta);
        refreshViews();
        break;
      case "select":
        if (command.entity === "settlement" && command.id) {
          session.selectedSettlementId = Number(command.id);
        } else if (command.entity === "world") {
          session.selectedSettlementId = null;
        }
        refreshViews();
        break;
      case "cancel":
        autopilotPath = [];
        pendingGatherNodeId = null;
        session.selectedSettlementId = null;
        refreshViews();
        break;
    }
  }

  function dispatchUI(command: TideweftUICommand): void {
    void soundscape.unlock();
    switch (command.type) {
      case "resume-world":
        session.titleVisible = false;
        session.paused = false;
        beginSession();
        announce(session, `Welcome back to ${renderView.worldName ?? "the estuary"}. Nothing changed while you were away.`);
        break;
      case "new-world":
        newWorld(command.seed, command.posture);
        break;
      case "scan":
        scan();
        break;
      case "interact":
        interact();
        break;
      case "wayknot":
        toggleWayknot();
        break;
      case "set-pace":
        if (player.mode === "swept") {
          announce(session, "The current has the helm until you reach a safe bank; pace returns ashore.", true);
          break;
        }
        player.pace = command.pace;
        soundscape.play("ui");
        break;
      case "set-session-shape":
        session.sessionShape = command.sessionShape;
        break;
      case "contract":
        handleContractCommand(command.action, Number(command.contractId));
        break;
      case "strand":
        reinforceStrand(Number(command.routeId), Number(command.settlementId));
        break;
      case "report":
        collectReport(Number(command.sourceSettlementId), Number(command.targetSettlementId));
        break;
      case "kit":
        if (command.action === "craft") craftFromKit(command.recipeId);
        if (command.action === "repair") {
          repairFromKit(Number(command.gearId), command.conditionGain);
        }
        if (command.action === "dismantle") dismantleFromKit(Number(command.gearId));
        break;
      case "settlement":
        if (command.action === "close") {
          session.selectedSettlementId = null;
        } else if (command.settlementId) {
          const id = Number(command.settlementId);
          session.selectedSettlementId = id;
          const settlement = worldView.settlements.find((candidate) => candidate.id === id);
          if (settlement) {
            const tile = worldView.terrain.tiles[settlement.tileIndex];
            if (tile) focusHandler?.({ x: (tile.x + 0.5) * RENDER_TILE_SIZE, y: (tile.y + 0.5) * RENDER_TILE_SIZE }, 1.3);
          }
        }
        break;
      case "quiet-hour":
        if (command.action === "open") openQuietHour();
        if (command.action === "continue") {
          session.quietHourVisible = false;
          session.paused = false;
        }
        if (command.action === "finish") {
          session.quietHourVisible = false;
          session.titleVisible = true;
          session.paused = true;
          session.hasSave = true;
          session.continueSummary = continueSummary(worldView, player);
          void save();
        }
        break;
      case "open-title":
        session.paused = true;
        session.titleVisible = true;
        session.hasSave = true;
        session.continueSummary = continueSummary(worldView, player);
        void save();
        break;
    }
    refreshViews();
  }

  function availableCraftingInventory(): CraftingInventory | null {
    const availableMilli = player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT
      - (cargoWeightMilli(player) - inventoryLoadMilli(player.craftingInventory));
    try {
      return createCraftingInventory(
        Math.max(0, availableMilli),
        player.craftingInventory.stacks,
        player.craftingInventory.gear,
      );
    } catch {
      return null;
    }
  }

  function persistCraftingInventory(inventory: CraftingInventory): void {
    player.craftingInventory = createCraftingInventory(
      player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT,
      inventory.stacks,
      inventory.gear,
    );
  }

  function kitActionBlocked(): boolean {
    if (session.titleVisible || session.quietHourVisible || session.paused) return true;
    if (player.mode !== "swept" && player.mode !== "rescued") return false;
    announce(session, "Secure your footing before making or mending field gear.", true);
    soundscape.play("warning", 0.3);
    return true;
  }

  function craftFromKit(recipeId: string): void {
    if (kitActionBlocked()) return;
    const inventory = availableCraftingInventory();
    if (!inventory) {
      announce(session, "The shared pack is over capacity; free space before making anything.", true);
      soundscape.play("warning", 0.35);
      return;
    }
    const recipe = CRAFTING_RECIPES.find((candidate) => candidate.id === recipeId);
    const request = recipe?.output.type === "gear"
      ? { recipeId, gearId: player.nextCraftedGearId }
      : { recipeId };
    const result = craft(inventory, request);
    if (!result.ok || !result.recipe) {
      announce(session, result.message, true);
      soundscape.play("warning", 0.32);
      return;
    }
    persistCraftingInventory(result.inventory);
    if (result.craftedGear) player.nextCraftedGearId += 1;
    const outputLabel = result.recipe.output.type === "gear"
      ? result.craftedGear
        ? `${result.recipe.label.replace(/^Make\s+/u, "")} #${result.craftedGear.id}`
        : result.recipe.label
      : CRAFTING_STACK_DEFINITIONS[result.recipe.output.item].label;
    announce(
      session,
      `${outputLabel} made in KIT · pack ${formatMilliLoad(cargoWeightMilli(player))} / ${formatMilliLoad(player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT)}.`,
      true,
    );
    session.sessionChanges.push(`${outputLabel} was made from gathered field materials.`);
    if (session.sessionChanges.length > 32) session.sessionChanges.splice(0, 8);
    soundscape.play("strand", 0.7);
  }

  function repairFromKit(gearId: number, conditionGain: number): void {
    if (kitActionBlocked()) return;
    const inventory = availableCraftingInventory();
    if (!inventory) {
      announce(session, "The shared pack is over capacity; free space before mending.", true);
      return;
    }
    const coreWayknot = player.wayknots.wayknots.find((wayknot) => wayknot.id === gearId);
    if (coreWayknot) {
      if (coreWayknot.tileIndex !== null) {
        announce(session, `Reclaim ${WAYKNOT_LABELS[coreWayknot.kind]} #${gearId} before mending it.`, true);
        soundscape.play("warning", 0.3);
        return;
      }
      const quote = quoteWayknotRepairCost(coreWayknot.kind, coreWayknot.condition, conditionGain);
      if (!quote || quote.conditionRestored <= 0) {
        announce(session, `${WAYKNOT_LABELS[coreWayknot.kind]} #${gearId} is already pristine.`, true);
        return;
      }
      const missing = quote.ingredients.filter(
        ({ item, quantity }) => inventory.stacks[item] < quantity,
      );
      if (missing.length > 0) {
        announce(
          session,
          `MEND needs ${missing.map(({ item, quantity }) => `${quantity - inventory.stacks[item]} more ${CRAFTING_STACK_DEFINITIONS[item].label}`).join(" + ")}.`,
          true,
        );
        soundscape.play("warning", 0.3);
        return;
      }
      const nextStacks = { ...inventory.stacks } as Record<CraftingStackId, number>;
      for (const ingredient of quote.ingredients) {
        nextStacks[ingredient.item] -= ingredient.quantity;
      }
      persistCraftingInventory(createCraftingInventory(
        inventory.capacityMilliLoad,
        nextStacks,
        inventory.gear,
      ));
      player.wayknots = {
        ...player.wayknots,
        wayknots: player.wayknots.wayknots.map((wayknot) => wayknot.id === gearId
          ? { ...wayknot, condition: quote.conditionAfter }
          : wayknot),
      };
      announce(
        session,
        `${WAYKNOT_LABELS[coreWayknot.kind]} #${gearId} mended to ${Math.round(quote.conditionAfter / 10_000)}% condition. Its stable ID and wear history remain.`,
        true,
      );
      soundscape.play("rest", 0.62);
      return;
    }
    const result = repair(inventory, gearId, conditionGain);
    if (!result.ok || !result.gear || !result.quote) {
      announce(session, result.message, true);
      soundscape.play("warning", 0.3);
      return;
    }
    persistCraftingInventory(result.inventory);
    const label = result.gear.kind === "ladder"
      ? "Field ladder"
      : result.gear.kind.split("-").map(titleCaseWord).join(" ");
    announce(
      session,
      `${label} #${gearId} mended to ${Math.round(result.quote.conditionAfter / 10_000)}% condition.`,
      true,
    );
    soundscape.play("rest", 0.62);
  }

  function dismantleFromKit(gearId: number): void {
    if (kitActionBlocked()) return;
    const inventory = availableCraftingInventory();
    if (!inventory) {
      announce(session, "The shared pack is over capacity; free space before dismantling.", true);
      return;
    }
    const result = dismantle(inventory, gearId);
    if (!result.ok || !result.gear) {
      announce(session, result.message, true);
      soundscape.play("warning", 0.3);
      return;
    }
    persistCraftingInventory(result.inventory);
    announce(
      session,
      result.salvage.length > 0
        ? `${result.gear.kind.split("-").map(titleCaseWord).join(" ")} #${gearId} dismantled. Lossy salvage returned to PACK.`
        : `${result.gear.kind.split("-").map(titleCaseWord).join(" ")} #${gearId} was too worn to return usable parts.`,
      true,
    );
    soundscape.play("rest", 0.5);
  }

  function beginSession(): void {
    session.sessionStartedTick = world.meta.completedTick;
    session.sessionPlayMilliseconds = 0;
    session.sessionDistanceUnits = 0;
    session.sessionDeliveries = 0;
    session.sessionReportsDelivered = 0;
    session.sessionStrandsWoven = 0;
    session.sessionChoirsAwakened = 0;
    session.sessionDiscoveredAtStart = discoveredCount(player);
    session.sessionBaseline = captureSessionBaseline(worldView);
    session.closureOffered = false;
    session.sessionChanges = [];
    lastCargoDamageNoticeMs = Number.NEGATIVE_INFINITY;
  }

  function checkCampaignResolution(): void {
    if (!worldView.network.resolved || session.campaignCelebrated) return;
    session.campaignCelebrated = true;
    session.closureOffered = true;
    session.sessionChanges.push(
      `The regional weave reached ${worldView.network.cycleRank} independent loops with only ${worldView.network.bridgeCount} fragile bridges.`,
    );
    announce(
      session,
      "The estuary can now route essential care around failures without depending on one corridor. You completed the resilient weave; the world remains open for endless tending.",
      true,
    );
    soundscape.play("deliver", 1);
    void save();
  }

  function rejectionFor(commandIds: readonly string[]): string | undefined {
    const commandIdSet = new Set(commandIds);
    for (let index = worldView.events.length - 1; index >= 0; index -= 1) {
      const event = worldView.events[index];
      if (event?.type !== "command-rejected") continue;
      const rejectedId = event.data.commandId;
      if (typeof rejectedId === "string" && commandIdSet.has(rejectedId)) {
        return typeof event.data.reason === "string" ? event.data.reason : "the promise changed";
      }
    }
    return undefined;
  }

  function releaseLocalCargo(contractId: number): void {
    player.cargo = player.cargo.filter((cargo) => cargo.contractId !== contractId);
    if (player.activeContractId === contractId) player.activeContractId = null;
  }

  function newWorld(seed: string, posture: GameSessionState["posture"]): void {
    const normalizedSeed = seed.trim().slice(0, 128) || "quiet-delta";
    session = createSessionState(normalizedSeed, posture, PERPETUAL_SESSION_SHAPE);
    world = createWorld(normalizedSeed, session.pressureMode);
    worldView = createWorldView(world);
    fieldResourceCatalog = runtimeFieldResourceCatalog(world);
    fieldResourceEcology = createFieldResourceEcologyState(world.meta.completedTick);
    const promise = worldView.contracts.find((contract) => contract.status === "offered");
    player = createPlayer(worldView, promise?.originSettlementId);
    session.titleVisible = false;
    session.paused = false;
    beginSession();
    commandQueue = [];
    playerStepsSinceWorldTick = 0;
    autopilotPath = [];
    pendingGatherNodeId = null;
    pendingAcceptance = null;
    pendingDelivery = null;
    pendingReinforcement = null;
    pendingRenegotiation = null;
    pendingReportDelivery = null;
    pendingChoir = null;
    lastAutosaveTick = 0;
    announce(session, "A new estuary settles into one possible shape. Begin by moving, then pulse the Loom.");
    soundscape.play("strand", 0.9);
    refreshViews();
  }

  function setAutopilot(point: WorldPoint, additive: boolean): boolean {
    if (player.mode === "swept") {
      announce(session, "The current has the helm until you reach a safe bank.", true);
      return false;
    }
    const tileX = clamp(Math.floor(point.x / RENDER_TILE_SIZE), 0, world.terrain.width - 1);
    const tileY = clamp(Math.floor(point.y / RENDER_TILE_SIZE), 0, world.terrain.height - 1);
    const destination = tileY * world.terrain.width + tileX;
    // Pointer paths use the same live depth/tool costs as manual travel. Unknown
    // water receives a caution premium, so sounding a channel can materially
    // improve the Loom's route without ever making manual exploration illegal.
    const traversalTerrain = {
      ...world.terrain,
      tiles: world.terrain.tiles.map((tile, index) => {
        const live = worldView.terrain.tiles[index];
        const depth = live?.waterDepth ?? 0;
        const wayknotEffects = wayknotEffectsAt(player, worldView, index);
        const waterCost = waterEffortPerStep(
          player,
          depth,
          wayknotEffects.staminaCostPermille,
        );
        const unknownWaterCost = depth > 40_000 && (player.depthSoundings[index] ?? 0) <= 0 ? 850 : 0;
        const stiltsRelief = player.tools.includes("marsh-stilts")
          && (tile.terrain === "marsh" || tile.terrain === "tidal-flat") ? 130 : 0;
        const unknottedCost = Math.max(
          40,
          tile.baseTravelCost + waterCost + unknownWaterCost - stiltsRelief,
        );
        return {
          ...tile,
          baseTravelCost: Math.max(40, modifyPathCost(unknottedCost, wayknotEffects)),
        };
      }),
    };
    const path = findTilePath(traversalTerrain, playerTileIndex(player), destination);
    if (path.length < 2) {
      announce(session, "The Loom cannot currently resolve a traversable line there.");
      soundscape.play("warning", 0.45);
      return false;
    }
    const next = path.slice(1);
    autopilotPath = additive ? [...autopilotPath, ...next] : next;
    const unknownWater = next.filter(
      (index) => (worldView.terrain.tiles[index]?.waterDepth ?? 0) > 40_000
        && (player.depthSoundings[index] ?? 0) <= 0,
    ).length;
    announce(
      session,
      `Loom path set across ${next.length} terrain marks${unknownWater > 0 ? `, including ${unknownWater} unsounded water marks` : " using sounded depth and your field tools"}.`,
    );
    return true;
  }

  function fieldResourceNode(nodeId: string): FieldResourceNode | undefined {
    return fieldResourceCatalog.nodes.find((node) => node.id === nodeId);
  }

  function targetFieldResource(nodeId: string, gatherOnArrival: boolean): void {
    if (session.paused || session.titleVisible || session.quietHourVisible) return;
    if (player.mode === "swept" || player.mode === "rescued") {
      announce(session, "The current has the helm. Gather after the shore gives your footing back.", true);
      soundscape.play("warning", 0.3);
      refreshViews();
      return;
    }
    const node = fieldResourceNode(nodeId);
    if (!node || (player.discovered[node.tileIndex] ?? 0) <= 0) {
      pendingGatherNodeId = null;
      announce(session, "That field sign is not part of the chart you can currently act on.", true);
      soundscape.play("warning", 0.3);
      refreshViews();
      return;
    }
    if (node.tileIndex === playerTileIndex(player)) {
      pendingGatherNodeId = null;
      if (gatherOnArrival) gatherFieldResource(node.id);
      else announce(session, `${materialLabel(node.material)} is underfoot. Press E to gather one unit.`);
      refreshViews();
      return;
    }
    const point = {
      x: (node.x + 0.5) * RENDER_TILE_SIZE,
      y: (node.y + 0.5) * RENDER_TILE_SIZE,
    };
    pendingGatherNodeId = null;
    if (!setAutopilot(point, false)) {
      refreshViews();
      return;
    }
    pendingGatherNodeId = gatherOnArrival ? node.id : null;
    announce(
      session,
      gatherOnArrival
        ? `${materialLabel(node.material)} marked. You will gather one unit when you reach its exact patch.`
        : `${materialLabel(node.material)} marked. Reach its exact patch and press E to gather.`,
    );
    refreshViews();
  }

  function gatherFieldResource(nodeId: string): boolean {
    const node = fieldResourceNode(nodeId);
    if (!node) {
      announce(session, "That natural patch no longer belongs to this estuary.", true);
      return false;
    }
    const label = materialLabel(node.material);
    if (player.mode === "swept" || player.mode === "rescued") {
      announce(session, `You cannot gather ${label} until you have your footing.`, true);
      return false;
    }
    if (node.tileIndex !== playerTileIndex(player)) {
      announce(session, `Move onto the ${label} patch first. On desktop, press E once it is underfoot.`, true);
      return false;
    }
    if ((player.discovered[node.tileIndex] ?? 0) <= 0) {
      announce(session, "This patch has not entered your chart yet.", true);
      return false;
    }
    const stock = fieldResourceStockUnits(fieldResourceCatalog, fieldResourceEcology, node.id);
    if (stock === null || stock <= 1) {
      announce(session, `${label} is recovering. Its final living unit stays in the landscape.`, true);
      soundscape.play("warning", 0.3);
      return false;
    }
    const capacityMilli = player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT;
    const freeMilli = Math.max(0, capacityMilli - cargoWeightMilli(player));
    if (node.unitLoadMilli > freeMilli) {
      announce(
        session,
        `Pack needs ${formatMilliLoad(node.unitLoadMilli - freeMilli)} more load for one ${label}. Open KIT to make room.`,
        true,
      );
      soundscape.play("warning", 0.35);
      return false;
    }
    const harvested = harvestFieldResource(
      fieldResourceCatalog,
      fieldResourceEcology,
      node.id,
      1,
    );
    if (!harvested.ok || harvested.material === null) {
      announce(
        session,
        harvested.reason === "living-reserve"
          ? `${label} is recovering. Its final living unit stays in the landscape.`
          : `${label} could not be gathered; the patch was left unchanged.`,
        true,
      );
      soundscape.play("warning", 0.3);
      return false;
    }
    const nextStacks = {
      ...player.craftingInventory.stacks,
      [harvested.material]: player.craftingInventory.stacks[harvested.material] + 1,
    };
    player.craftingInventory = createCraftingInventory(
      player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT,
      nextStacks,
      player.craftingInventory.gear,
    );
    fieldResourceEcology = harvested.state;
    const staminaCost = GATHER_STAMINA_COST[harvested.material];
    player.stamina = Math.max(0, player.stamina - staminaCost);
    const remaining = Math.max(1, stock - 1);
    const tile = worldView.terrain.tiles[node.tileIndex];
    const sweepWarning = player.stamina === 0 && (tile?.waterDepth ?? 0) >= 120_000
      ? " STAMINA EMPTY IN DEEP WATER — the current takes control on the next field beat."
      : "";
    announce(
      session,
      `Gathered 1 ${label} · ${resourceStockBand(remaining, node.capacityUnits)} remains · pack ${formatMilliLoad(cargoWeightMilli(player))} / ${formatMilliLoad(capacityMilli)}.${sweepWarning}`,
      sweepWarning.length > 0,
    );
    soundscape.play("strand", 0.42);
    return true;
  }

  function scan(): void {
    if (session.paused || session.titleVisible) return;
    if (player.mode === "swept") {
      announce(session, "The current has the helm until you reach a safe bank. The sounding line is secured during the drift.", true);
      soundscape.play("warning", 0.3);
      refreshViews();
      return;
    }
    const activeTideHarp = activeTideHarpAtPlayer(player, worldView);
    if (pulseScan(player, worldView)) {
      session.tutorial.scansUsed += 1;
      soundscape.play("scan");
      announce(session, tideHarpPulseAnnouncement(activeTideHarp));
      refreshViews();
    } else {
      announce(session, "The Loom is recharging. The current map remains trustworthy.");
      soundscape.play("warning", 0.3);
    }
  }

  function toggleWayknot(): void {
    if (session.paused || session.titleVisible || session.quietHourVisible) return;
    if (player.mode === "swept") {
      announce(session, "The current has the helm. Reclaim or bind a Wayknot after the safe bank catches you.", true);
      soundscape.play("warning", 0.3);
      refreshViews();
      return;
    }
    const tileIndex = playerTileIndex(player);
    const context = wayknotContextAt(worldView, tileIndex);
    if (!context) {
      announce(session, "The field kit cannot read this patch of the estuary.", true);
      return;
    }
    const existing = wayknotAtTile(player.wayknots, tileIndex);
    if (
      !existing
      && context.terrain !== "deep-water"
      && context.waterDepth > 20_000
      && (player.depthSoundings[tileIndex] ?? 0) <= 0
    ) {
      announce(
        session,
        "Sound this flooded ground before binding a Wayknot. Pulse Space first; the recorded depth will tell the field kit which weave is safe.",
        true,
      );
      soundscape.play("warning", 0.35);
      refreshViews();
      return;
    }
    const intendedKind = existing?.kind ?? contextualWayknotKind(context);
    const result = toggleContextualWayknot(player.wayknots, context, worldView.completedTick);
    if (!result.ok || !result.wayknot) {
      announce(
        session,
        wayknotFailureMessage(result.reason, intendedKind, result.placementReason),
        true,
      );
      soundscape.play("warning", 0.35);
      refreshViews();
      return;
    }
    player.wayknots = result.state;
    const label = WAYKNOT_LABELS[result.wayknot.kind];
    if (result.reason === "reclaimed") {
      session.sessionChanges.push(`${label} #${result.wayknot.id} returned to the reusable field kit.`);
      announce(
        session,
        `${label} reclaimed at ${Math.round(result.wayknot.condition / 10_000)}% condition. Moving a field aid wears it; open KIT → MEND to repair this same numbered core piece.`,
      );
      soundscape.play("rest", 0.52);
    } else {
      session.sessionChanges.push(`${label} #${result.wayknot.id} was bound into the traveled landscape.`);
      announce(
        session,
        `${label} bound here at ${Math.round(result.wayknot.condition / 10_000)}% condition. It supplies half strength while setting for 3 world ticks, then full strength. ${WAYKNOT_DESCRIPTIONS[result.wayknot.kind]} Stand on it and press F again to reclaim it.`,
        true,
      );
      soundscape.play("strand", 0.72);
    }
    if (session.sessionChanges.length > 32) session.sessionChanges.splice(0, 8);
    refreshViews();
  }

  function interact(): void {
    if (session.paused || session.titleVisible) return;
    const resource = fieldResourceCatalog.nodes.find(
      (node) => node.tileIndex === playerTileIndex(player)
        && (player.discovered[node.tileIndex] ?? 0) > 0,
    );
    if (resource) {
      gatherFieldResource(resource.id);
      refreshViews();
      return;
    }
    const settlementId = settlementAtPlayer(player, worldView);
    if (settlementId === null) {
      announce(session, "No harbor or strand structure is within reach.");
      return;
    }
    const active = player.activeContractId === null
      ? undefined
      : worldView.contracts.find((contract) => contract.id === player.activeContractId);
    if (active?.destinationSettlementId === settlementId && active.status === "in-transit") {
      deliver(active);
      return;
    }
    if (player.report?.targetSettlementId === settlementId) {
      deliverReport();
      return;
    }
    if (player.activeContractId === null && player.report === null) {
      const localOffers = worldView.contracts
        .filter((contract) => contract.status === "offered" && contract.originSettlementId === settlementId)
        .sort((left, right) => left.dueTick - right.dueTick || left.id - right.id);
      const trackedLocal = localOffers.find((contract) => contract.id === session.trackedContractId);
      if (trackedLocal || localOffers.length === 1) {
        accept(trackedLocal ?? localOffers[0]!);
        return;
      }
      if (localOffers.length > 1) {
        session.selectedSettlementId = settlementId;
        announce(
          session,
          `${localOffers.length} physical cargo promises are waiting here. Choose one in the scrollable Promises list; “Sign info report” is a separate one-document information journey that moves no goods.`,
        );
        soundscape.play("ui");
        refreshViews();
        return;
      }
    }
    session.selectedSettlementId = settlementId;
    const settlement = worldView.settlements.find((candidate) => candidate.id === settlementId);
    announce(session, `${settlement?.name ?? "The harbor"} is ready to be inspected.`);
    soundscape.play("ui");
    refreshViews();
  }

  function handleContractCommand(action: "inspect" | "accept" | "track" | "renegotiate", contractId: number): void {
    const contract = worldView.contracts.find((candidate) => candidate.id === contractId);
    if (!contract) return;
    session.inspectedContractId = contractId;
    if (action === "inspect") {
      session.selectedSettlementId = contract.status === "offered"
        ? contract.originSettlementId
        : contract.destinationSettlementId;
      return;
    }
    if (action === "track") {
      session.trackedContractId = contractId;
      focusContractTarget(contract);
      return;
    }
    if (action === "renegotiate") {
      renegotiate(contract);
      return;
    }
    accept(contract);
  }

  function accept(contract: ContractState): void {
    const here = settlementAtPlayer(player, worldView);
    if (here !== contract.originSettlementId) {
      session.trackedContractId = contract.id;
      announce(session, `Pickup charted at ${settlementName(worldView, contract.originSettlementId)}. The amber marker and highlighted route will stay with you.`);
      focusContractOrigin(contract);
      refreshViews();
      return;
    }
    if (player.activeContractId !== null) {
      announce(session, "Finish or renegotiate the promise already in your pack before taking another.");
      return;
    }
    if (!loadContractCargo(player, contract)) {
      announce(session, "That load does not fit the current pack. Choose a lighter promise.", true);
      soundscape.play("warning");
      return;
    }
    const acceptCommandId = commandId("accept");
    const pickupCommandId = commandId("pickup");
    queue({
      id: acceptCommandId,
      type: "accept-contract",
      contractId: contract.id,
      carrier: "player",
      sourceId: 0,
      sequence: commandSequence,
    });
    queue({
      id: pickupCommandId,
      type: "pickup-contract",
      contractId: contract.id,
      originSettlementId: contract.originSettlementId,
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingAcceptance = { contractId: contract.id, acceptCommandId, pickupCommandId };
    session.tutorial.acceptedPromises += 1;
    session.trackedContractId = contract.id;
    announce(session, `Promise made: bring ${contract.quantity} ${humanResource(contract.resource)} to ${settlementName(worldView, contract.destinationSettlementId)}.`);
    soundscape.play("accept");
    focusContractDestination(contract);
    refreshViews();
  }

  function renegotiate(contract: ContractState): void {
    if (pendingRenegotiation !== null || pendingDelivery !== null) return;
    const here = settlementAtPlayer(player, worldView);
    if (here === null) {
      announce(session, "Reach any harbor to hand the cargo into accountable local care. Your traveled trace will remain.");
      return;
    }
    const handoffCommandId = commandId("handoff");
    queue({
      id: handoffCommandId,
      type: "cancel-contract",
      contractId: contract.id,
      returnSettlementId: here,
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingRenegotiation = { contractId: contract.id, settlementId: here, commandId: handoffCommandId };
    announce(session, `${settlementName(worldView, here)} is receiving an accountable handoff. No cargo or map knowledge will vanish.`);
    soundscape.play("strand", 0.45);
  }

  function deliver(contract: ContractState): void {
    if (pendingDelivery !== null) return;
    const cargo = player.cargo.find((candidate) => candidate.contractId === contract.id);
    if (!cargo) {
      announce(session, "The promise is recorded, but its cargo is not in your pack.", true);
      return;
    }
    const deliverCommandId = commandId("deliver");
    const deliveryRoute = worldView.routes.find((route) => route.id === contract.routeId);
    queue({
      id: deliverCommandId,
      type: "deliver-contract",
      contractId: contract.id,
      destinationSettlementId: contract.destinationSettlementId,
      condition: cargo.condition,
      trace: [...player.currentTrace],
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingDelivery = {
      contractId: contract.id,
      commandId: deliverCommandId,
      wasAutomated: (deliveryRoute?.traceStrength ?? 0) >= STRAND_AUTOMATION_THRESHOLD,
    };
    announce(session, "The harbor is receiving the cargo and reading the route you left behind…");
    soundscape.play("strand", 0.8);
  }

  function focusContractOrigin(contract: ContractState): void {
    focusSettlement(contract.originSettlementId);
  }

  function focusContractDestination(contract: ContractState): void {
    focusSettlement(contract.destinationSettlementId);
  }

  function focusContractTarget(contract: ContractState): void {
    if (contract.status === "offered") focusContractOrigin(contract);
    else focusContractDestination(contract);
  }

  function focusSettlement(settlementId: number): void {
    session.selectedSettlementId = settlementId;
    const settlement = worldView.settlements.find((candidate) => candidate.id === settlementId);
    const tile = settlement ? worldView.terrain.tiles[settlement.tileIndex] : undefined;
    if (tile) focusHandler?.({ x: (tile.x + 0.5) * RENDER_TILE_SIZE, y: (tile.y + 0.5) * RENDER_TILE_SIZE }, 1.25);
  }

  function recordHarborArrival(arrivalHarborId: number): void {
    const fromHarborId = player.lastHarborId;
    const arrival = worldView.settlements.find((settlement) => settlement.id === arrivalHarborId);
    if (!arrival) return;
    if (fromHarborId === null) {
      player.lastHarborId = arrivalHarborId;
      player.harborTrail = [arrivalHarborId];
      player.surveyTrace = [arrival.tileIndex];
      return;
    }
    if (fromHarborId === arrivalHarborId) {
      player.surveyTrace = [arrival.tileIndex];
      return;
    }

    const leg = assessHarborLeg(worldView, fromHarborId, arrivalHarborId, player.surveyTrace);
    const rememberedChoirKeys = worldView.choirs.map(
      (choir) => `tide-choir:${[...choir.routeIds].sort((left, right) => left - right).join("-")}`,
    );
    const phrase = appendSurveyedHarborLeg(worldView, player.harborTrail, leg, rememberedChoirKeys);
    player.lastHarborId = arrivalHarborId;
    player.harborTrail = [...phrase.trail];
    player.surveyTrace = [arrival.tileIndex];

    const fromName = settlementName(worldView, fromHarborId);
    const toName = arrival.name;
    if (!leg.surveyed || leg.routeId === null) {
      announce(
        session,
        `${fromName} → ${toName} was traveled, but only ${Math.round(leg.coverage / 10_000)}% followed that corridor. Exact terrain still remembers you; stay near the visible route for 70% to survey its shared strand.`,
      );
      return;
    }

    if (!player.surveyedRouteIds.includes(leg.routeId)) {
      player.surveyedRouteIds = [...player.surveyedRouteIds, leg.routeId].sort((left, right) => left - right);
      session.sessionChanges.push(`${fromName} ↔ ${toName} was surveyed closely enough for accountable strand work.`);
      announce(
        session,
        `Survey complete: ${fromName} ↔ ${toName} is now safe to strengthen with shared parts. ${Math.round(leg.coverage / 10_000)}% of the corridor was heard.`,
      );
      soundscape.play("strand", 0.58);
    } else if (phrase.reason === "immediate-backtrack") {
      announce(session, `${fromName} ↔ ${toName} remains surveyed. A Tide Choir needs at least three different harbor legs, so a simple out-and-back does not close a song.`);
    }

    if (phrase.choir === null || pendingChoir !== null) return;
    const awakenCommandId = commandId("choir");
    queue({
      id: awakenCommandId,
      type: "awaken-tide-choir",
      routeIds: [...phrase.choir.routeIds],
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingChoir = { commandId: awakenCommandId, cycle: phrase.choir };
    announce(session, `A complete harbor loop is resonating. The estuary is checking whether this Tide Choir has sung before…`);
    soundscape.play("strand", 0.82);
  }

  function reinforceStrand(routeId: number, settlementId: number): void {
    if (session.paused || session.titleVisible || pendingReinforcement !== null) return;
    const here = settlementAtPlayer(player, worldView);
    const settlement = worldView.settlements.find((candidate) => candidate.id === settlementId);
    const route = worldView.routes.find((candidate) => candidate.id === routeId);
    if (!settlement || !route || here !== settlementId) {
      announce(session, "Strand work must begin at the harbor whose shared stores will supply it.");
      soundscape.play("warning", 0.4);
      return;
    }
    if (route.fromSettlementId !== settlementId && route.toSettlementId !== settlementId) {
      announce(session, "That route does not meet this harbor.");
      soundscape.play("warning", 0.4);
      return;
    }
    if (!player.surveyedRouteIds.includes(route.id)) {
      const otherId = route.fromSettlementId === settlementId ? route.toSettlementId : route.fromSettlementId;
      announce(
        session,
        `Survey this corridor first: travel from ${settlement.name} to ${settlementName(worldView, otherId)} along the visible route. Parts only improve paths you have physically learned.`,
      );
      soundscape.play("warning", 0.4);
      return;
    }
    if (settlement.inventory.parts < 1) {
      announce(session, `${settlement.name} needs a parts delivery before this strand can be tended.`);
      soundscape.play("warning", 0.4);
      return;
    }
    const actionCommandId = commandId("reinforce");
    queue({
      id: actionCommandId,
      type: "reinforce-route",
      routeId,
      settlementId,
      parts: 1,
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingReinforcement = {
      routeId,
      settlementId,
      commandId: actionCommandId,
      wasAutomated: route.traceStrength >= STRAND_AUTOMATION_THRESHOLD,
    };
    announce(session, `${settlement.name} is weaving one shared part into the route. The result will belong to every porter.`);
    soundscape.play("strand", 0.55);
  }

  function collectReport(sourceSettlementId: number, targetSettlementId: number): void {
    if (session.paused || session.titleVisible) return;
    const source = worldView.settlements.find((settlement) => settlement.id === sourceSettlementId);
    const target = worldView.settlements.find((settlement) => settlement.id === targetSettlementId);
    if (!source || !target || settlementAtPlayer(player, worldView) !== sourceSettlementId) {
      announce(session, "A signed report must be witnessed at the harbor that produced it.");
      soundscape.play("warning", 0.35);
      return;
    }
    if (player.report !== null) {
      announce(session, "Your document case already holds one accountable report. Deliver or hand it on before taking another.");
      return;
    }
    if (
      cargoWeightMilli(player) + PACK_LOAD_MILLI_PER_UNIT
      > player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT
    ) {
      announce(session, "The pack needs one full load free for the sealed document case. Open KIT to make room.");
      soundscape.play("warning", 0.35);
      return;
    }
    const resource = source.specialization;
    player.report = {
      sourceSettlementId,
      targetSettlementId,
      resource,
      reportedQuantity: source.inventory[resource],
      observedTick: worldView.completedTick,
      confidence: 1_000_000,
    };
    announce(session, `${source.name} signed its ${humanResource(resource)} count for ${target.name}. Carry the truth there and press E to relay it.`);
    soundscape.play("accept", 0.72);
    focusSettlement(targetSettlementId);
    refreshViews();
  }

  function deliverReport(): void {
    const report = player.report;
    if (!report || pendingReportDelivery !== null) return;
    const reportCommandId = commandId("report");
    queue({
      id: reportCommandId,
      type: "share-knowledge",
      fromSettlementId: report.sourceSettlementId,
      toSettlementId: report.targetSettlementId,
      subjectSettlementId: report.sourceSettlementId,
      resource: report.resource,
      reportedQuantity: report.reportedQuantity,
      observedTick: report.observedTick,
      confidence: report.confidence,
      sourceId: 0,
      sequence: commandSequence,
    });
    pendingReportDelivery = { commandId: reportCommandId, targetSettlementId: report.targetSettlementId };
    announce(session, "The harbor is checking the signature, source, age, and count…");
    soundscape.play("strand", 0.5);
  }

  function openQuietHour(): void {
    session.paused = true;
    session.quietHourVisible = true;
    soundscape.play("rest");
    void save();
  }

  async function save(): Promise<void> {
    const needsContractWorldRepair = world.contracts.some(isAcceptedWithoutPickup);
    const worldSnapshot = needsContractWorldRepair ? structuredClone(world) : world;
    const playerSnapshot = structuredClone(player);
    const sessionSnapshot = structuredClone(session);
    repairInterruptedPickups(worldSnapshot, playerSnapshot, sessionSnapshot);
    if (pendingAcceptance !== null && playerSnapshot.activeContractId === pendingAcceptance.contractId) {
      rollbackOptimisticPickup(playerSnapshot, sessionSnapshot, pendingAcceptance.contractId);
    }
    const envelope: GameSaveEnvelope = {
      format: "tideweft-session",
      version: GAME_SAVE_VERSION,
      world: serializeWorld(worldSnapshot),
      player: playerSnapshot,
      session: sessionSnapshot,
      fieldResources: structuredClone(fieldResourceEcology),
    };
    const record: SaveRecord = {
      slotId: AUTOSAVE_SLOT,
      label: renderView.worldName ?? "TIDEWEFT estuary",
      seed: world.meta.seedText,
      updatedAt: Date.now(),
      playTicks: world.meta.completedTick,
      settlementCount: world.settlements.length,
      connectedCount: world.routes.filter((route) => route.traceStrength >= 120_000).length,
      worldJson: JSON.stringify(envelope),
    };
    saveSequence += 1;
    const sequence = saveSequence;
    // While storage is busy, retain the most recent complete snapshot rather
    // than returning the older in-flight write. Every superseded caller waits
    // for the newer snapshot that covers it.
    pendingSave = { sequence, record };
    const completion = new Promise<void>((resolve, reject) => {
      saveWaiters.push({ sequence, resolve, reject });
    });
    startSaveWorker();
    return completion;
  }

  function startSaveWorker(): void {
    if (saveWorkerRunning) return;
    saveWorkerRunning = true;
    void drainSaveQueue().finally(() => {
      saveWorkerRunning = false;
      // A request can arrive after the loop observes an empty queue but before
      // this microtask clears the running flag (notably visibility → pagehide).
      if (pendingSave) startSaveWorker();
    });
  }

  async function drainSaveQueue(): Promise<void> {
    while (pendingSave) {
      const candidate = pendingSave;
      pendingSave = undefined;
      try {
        await repository.save(candidate.record);
        settleSaveWaiters(candidate.sequence, false);
      } catch (error) {
        settleSaveWaiters(candidate.sequence, true, error);
      }
    }
  }

  function settleSaveWaiters(sequence: number, failed: boolean, error?: unknown): void {
    for (let index = saveWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = saveWaiters[index];
      if (!waiter || waiter.sequence > sequence) continue;
      saveWaiters.splice(index, 1);
      if (failed) waiter.reject(error);
      else waiter.resolve();
    }
  }

  function frame(now: number): void {
    if (!running) return;
    if (previousFrame === 0) previousFrame = now;
    accumulator += Math.min(500, Math.max(0, now - previousFrame));
    previousFrame = now;
    let steps = 0;
    while (accumulator >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      tick();
      accumulator -= FIXED_STEP_MS;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
    animationFrame = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running) return;
    running = true;
    previousFrame = 0;
    animationFrame = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(animationFrame);
  }

  function destroy(): void {
    stop();
    soundscape.destroy();
  }

  refreshViews();

  return {
    start,
    stop,
    destroy,
    getRenderView: () => renderView,
    getUIView: () => uiView,
    dispatchRenderer,
    dispatchUI,
    save,
    setFocusHandler: (handler) => {
      focusHandler = handler;
    },
  };
}

async function loadAutosave(
  repository: SaveRepository,
): Promise<{
  world: WorldState;
  player: PlayerState;
  session: GameSessionState;
  fieldResources: FieldResourceEcologyState;
} | undefined> {
  try {
    const record = await repository.load(AUTOSAVE_SLOT);
    if (!record) return undefined;
    const decoded = JSON.parse(record.worldJson) as Partial<GameSaveEnvelope>;
    if (
      decoded.format !== "tideweft-session" ||
      (decoded.version !== LEGACY_GAME_SAVE_VERSION && decoded.version !== GAME_SAVE_VERSION) ||
      typeof decoded.world !== "string" ||
      !decoded.player ||
      !decoded.session
    ) {
      return undefined;
    }
    const world = deserializeWorld(decoded.world);
    normalizePlayerCrafting(decoded.player, decoded.version === LEGACY_GAME_SAVE_VERSION);
    const catalog = runtimeFieldResourceCatalog(world);
    const fieldResources = decoded.version === GAME_SAVE_VERSION
      ? canonicalizeFieldResourceState(catalog, requireFieldResourceState(decoded.fieldResources))
      : createFieldResourceEcologyState(world.meta.completedTick);
    // Alpha player snapshots predate dynamic world dimensions. Pickup repair
    // can reset currentTrace, so dimensions must be authoritative before it
    // asks playerTileIndex to derive that trace origin.
    decoded.player.worldWidth = world.terrain.width;
    decoded.player.worldHeight = world.terrain.height;
    const legacyBaseline = decoded.session.sessionBaseline;
    if (legacyBaseline && !Number.isFinite(legacyBaseline.awakenedChoirs)) {
      legacyBaseline.awakenedChoirs = world.choirs.length;
    }
    const repairedContractIds = repairInterruptedPickups(world, decoded.player, decoded.session);
    if (repairedContractIds.length > 0) {
      decoded.session.sessionChanges = Array.isArray(decoded.session.sessionChanges)
        ? [...decoded.session.sessionChanges, "An interrupted cargo pickup was safely reset before any harbor stock moved."]
        : ["An interrupted cargo pickup was safely reset before any harbor stock moved."];
      decoded.session.trackedContractId = repairedContractIds[0] ?? null;
    }
    validatePlayer(decoded.player, world);
    return {
      world,
      player: decoded.player,
      session: decoded.session,
      fieldResources,
    };
  } catch {
    return undefined;
  }
}

/**
 * Accepting a promise is optimistic in the game layer but atomic in the
 * simulation: origin stock is not debited until accept + pickup run together.
 * A save taken inside that short window therefore persists the authoritative
 * offered contract and rolls back only its uncommitted local pack copy.
 */
function rollbackOptimisticPickup(
  player: PlayerState,
  session: GameSessionState,
  contractId: number,
): void {
  player.cargo = player.cargo.filter((cargo) => cargo.contractId !== contractId);
  if (player.activeContractId === contractId) {
    player.activeContractId = null;
    player.currentTrace = [playerTileIndex(player)];
  }
  session.trackedContractId = contractId;
  session.tutorial.acceptedPromises = Math.max(0, session.tutorial.acceptedPromises - 1);
  if (session.tutorial.stage === "travel" && player.completedJourneys === 0) {
    session.tutorial.stage = "promise";
  }
}

/**
 * Repairs snapshots produced before pending pickups were reconciled at save
 * time. The common offered state only needs its phantom local cargo removed.
 * An accepted-without-pickup state has not moved inventory either, so it can
 * deterministically return to offered without creating or destroying stock.
 */
function repairInterruptedPickups(
  world: WorldState,
  player: PlayerState,
  session: GameSessionState,
): number[] {
  const repairedContractIds: number[] = [];
  const contractId = player.activeContractId;
  if (contractId !== null) {
    const activeContract = world.contracts.find((candidate) => candidate.id === contractId);
    if (activeContract?.status === "offered" && activeContract.cargoQuantity === 0) {
      rollbackOptimisticPickup(player, session, contractId);
      repairedContractIds.push(contractId);
    }
  }

  // A player-accepted contract with no authoritative cargo is never a stable
  // runtime state: the game always submits accept + pickup as one pair. It can
  // remain only when pickup failed and the follow-up release command was lost,
  // or in a legacy save captured between those operations. No inventory moved,
  // so returning it to offered is the unique conservation-preserving repair.
  for (const contract of world.contracts) {
    if (!isAcceptedWithoutPickup(contract)) continue;
    resetContractToOffered(contract);
    rollbackOptimisticPickup(player, session, contract.id);
    if (!repairedContractIds.includes(contract.id)) repairedContractIds.push(contract.id);
  }
  return repairedContractIds.sort((left, right) => left - right);
}

function isAcceptedWithoutPickup(contract: ContractState): boolean {
  return contract.status === "accepted"
    && contract.carrierKind === "player"
    && contract.cargoQuantity === 0;
}

function resetContractToOffered(contract: ContractState): void {
  contract.status = "offered";
  contract.acceptedTick = null;
  contract.departedTick = null;
  contract.arrivalTick = null;
  contract.completedTick = null;
  contract.carrierKind = null;
  contract.assignedResidentId = null;
  contract.porterRouteIds = [];
  contract.porterSettlementIds = [];
  contract.deliveryCondition = null;
  contract.deliveryGrade = null;
  contract.deliveryTraceCost = null;
}

function runtimeFieldResourceCatalog(world: WorldState): FieldResourceCatalog {
  const natural = generateFieldResourceCatalog(world.meta.rootSeed, world.terrain);
  const occupied = new Set(world.settlements.map((settlement) => settlement.tileIndex));
  return {
    ...natural,
    // Harbors remain unambiguous interaction tiles. Their stone, gardens, and
    // workshops are civic space rather than remotely harvestable nature.
    nodes: natural.nodes.filter((node) => !occupied.has(node.tileIndex)),
  };
}

function requireFieldResourceState(value: unknown): FieldResourceEcologyState {
  if (!value || typeof value !== "object") {
    throw new Error("Save is missing field-resource ecology");
  }
  const candidate = value as Partial<FieldResourceEcologyState>;
  if (
    candidate.version !== 1
    || !Number.isSafeInteger(candidate.activeTick)
    || (candidate.activeTick ?? -1) < 0
    || !Array.isArray(candidate.depletion)
  ) {
    throw new Error("Save contains invalid field-resource ecology");
  }
  return candidate as FieldResourceEcologyState;
}

function normalizePlayerCrafting(player: PlayerState, allowMissing: boolean): void {
  if (!Number.isSafeInteger(player.cargoCapacity) || player.cargoCapacity <= 0) {
    throw new Error("Save contains invalid pack capacity");
  }
  const capacityMilli = player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT;
  if (!Number.isSafeInteger(capacityMilli)) {
    throw new Error("Save contains invalid pack capacity");
  }
  requireValidPlayerCargoForLoad(player);
  const snapshot = (player as PlayerState & { craftingInventory?: CraftingInventory }).craftingInventory;
  if (!snapshot) {
    if (!allowMissing) throw new Error("Save is missing crafting inventory");
    player.craftingInventory = createCraftingInventory(capacityMilli);
  } else {
    if (!snapshot.stacks || !Array.isArray(snapshot.gear)) {
      throw new Error("Save contains invalid crafting inventory");
    }
    if (snapshot.gear.some((gear) => {
      const id = gear && typeof gear === "object"
        ? (gear as { readonly id?: unknown }).id
        : undefined;
      return !Number.isSafeInteger(id) || (id as number) < FIRST_CRAFTED_GEAR_ID;
    })) {
      throw new Error("Save contains a crafted gear ID reserved for the inherited Wayknot kit");
    }
    player.craftingInventory = createCraftingInventory(
      capacityMilli,
      snapshot.stacks,
      snapshot.gear,
    );
  }
  if (cargoWeightMilli(player) > capacityMilli) {
    throw new Error("Save contains an over-capacity pack");
  }
  const nextAvailableId = Math.max(
    FIRST_CRAFTED_GEAR_ID,
    ...player.craftingInventory.gear.map((gear) => gear.id + 1),
  );
  player.nextCraftedGearId = Number.isSafeInteger(player.nextCraftedGearId)
    && player.nextCraftedGearId >= nextAvailableId
    ? player.nextCraftedGearId
    : nextAvailableId;
}

/** Validate transport fields before any shared-pack arithmetic can admit NaN. */
function requireValidPlayerCargoForLoad(player: PlayerState): void {
  if (!Array.isArray(player.cargo) || player.cargo.length > 1) {
    throw new Error("Save contains invalid player cargo");
  }
  for (const value of player.cargo as unknown[]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Save contains invalid player cargo");
    }
    const cargo = value as Partial<PlayerState["cargo"][number]>;
    if (
      !Number.isSafeInteger(cargo.contractId)
      || (cargo.contractId ?? 0) <= 0
      || !PLAYER_CARGO_RESOURCES.has(cargo.resource as ContractState["resource"])
      || !Number.isSafeInteger(cargo.quantity)
      || (cargo.quantity ?? 0) <= 0
      || (cargo.quantity ?? 0) > player.cargoCapacity
      || (cargo.quantity ?? 0) > MAX_SAFE_CARGO_QUANTITY
      || !Number.isSafeInteger(cargo.condition)
      || (cargo.condition ?? -1) < 0
      || (cargo.condition ?? FIXED_POINT + 1) > FIXED_POINT
      || cargo.property !== expectedCargoProperty(cargo.resource as ContractState["resource"])
    ) {
      throw new Error("Save contains invalid player cargo");
    }
  }
}

function expectedCargoProperty(
  resource: ContractState["resource"],
): PlayerState["cargo"][number]["property"] {
  switch (resource) {
    case "medicine": return "fragile";
    case "food": return "perishable";
    case "freshWater":
    case "parts": return "heavy";
    case "reed": return "ordinary";
  }
}

function validatePlayer(player: PlayerState, world: WorldState): void {
  for (const value of [player.x, player.y, player.stamina, player.stability, player.scanCharge]) {
    if (!Number.isFinite(value)) throw new Error("Save contains invalid player state");
  }
  if (!Array.isArray(player.discovered) || player.discovered.length !== world.terrain.tiles.length) {
    throw new Error("Save contains an incompatible chart");
  }
  if (!Array.isArray(player.cargo) || !Array.isArray(player.currentTrace)) {
    throw new Error("Save contains invalid player cargo or trace");
  }
  if (!player.craftingInventory || !Number.isSafeInteger(player.nextCraftedGearId)) {
    throw new Error("Save contains invalid crafting state");
  }
  if (player.surveyTrace !== undefined && !Array.isArray(player.surveyTrace)) {
    throw new Error("Save contains an invalid survey trace");
  }
  if (player.surveyedRouteIds !== undefined && !Array.isArray(player.surveyedRouteIds)) {
    throw new Error("Save contains invalid surveyed routes");
  }
  if (player.harborTrail !== undefined && !Array.isArray(player.harborTrail)) {
    throw new Error("Save contains an invalid harbor phrase");
  }
  if (
    player.depthSoundings !== undefined
    && !Array.isArray(player.depthSoundings)
  ) {
    throw new Error("Save contains an invalid depth chart");
  }
  if (player.tools !== undefined && !Array.isArray(player.tools)) {
    throw new Error("Save contains an invalid field kit");
  }
  if (player.sweepPath !== undefined && !Array.isArray(player.sweepPath)) {
    throw new Error("Save contains an invalid sweep path");
  }
  if (player.report !== undefined && player.report !== null) {
    const report = player.report;
    if (
      !Number.isSafeInteger(report.sourceSettlementId)
      || !Number.isSafeInteger(report.targetSettlementId)
      || !Number.isSafeInteger(report.reportedQuantity)
      || !Number.isSafeInteger(report.observedTick)
      || !world.settlements.some((settlement) => settlement.id === report.sourceSettlementId)
      || !world.settlements.some((settlement) => settlement.id === report.targetSettlementId)
    ) {
      throw new Error("Save contains an invalid signed report");
    }
  }
}

function materialLabel(material: FieldMaterialId): string {
  return CRAFTING_STACK_DEFINITIONS[material].label;
}

function titleCaseWord(word: string): string {
  return word.length === 0 ? word : `${word[0]?.toLocaleUpperCase() ?? ""}${word.slice(1)}`;
}

function formatMilliLoad(loadMilli: number): string {
  const value = Math.max(0, Math.trunc(loadMilli)) / PACK_LOAD_MILLI_PER_UNIT;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "");
}

function resourceStockBand(stock: number, capacity: number): string {
  if (stock <= 1) return "recovering";
  const ratio = stock / Math.max(1, capacity);
  if (ratio >= 2 / 3) return "plentiful";
  if (ratio >= 1 / 3) return "some";
  return "recovering";
}

function signControl(value: number): -1 | 0 | 1 {
  if (value > 0.05) return 1;
  if (value < -0.05) return -1;
  return 0;
}

function isTravelPace(value: unknown): value is TravelPace {
  return value === "rest" || value === "steady" || value === "swift";
}

function isPlayerMode(value: unknown): value is PlayerMode {
  return value === "foot"
    || value === "wading"
    || value === "skiff"
    || value === "swept"
    || value === "camp"
    || value === "rescued";
}

function settlementName(world: WorldView, id: number): string {
  return world.settlements.find((settlement) => settlement.id === id)?.name ?? `Settlement ${id}`;
}

function humanResource(resource: ContractState["resource"]): string {
  return resource === "freshWater" ? "fresh water" : resource;
}

export function tideHarpPulseAnnouncement(harp: TideHarp | undefined): string {
  if (!harp) {
    return "The sounding line charts nearby terrain and water depth. Those bathymetry marks will remain on this world.";
  }
  const [reed, anchor, wind] = harp.knots;
  return `${harp.label} answered the Loom. One pulse sounded from your position and from its three knot origins: Reed mat #${reed.id}, Tide anchor #${anchor.id}, and Wind knot #${wind.id}. Each origin recorded nearby terrain and water depth.`;
}

function fieldToolEffect(tool: FieldToolKind): string {
  switch (tool) {
    case "sounding-line":
      return "Loom pulses now reveal nearby water depth.";
    case "marsh-stilts":
      return "Mudflats and reed marsh cost less stamina and no longer drag as heavily.";
    case "tide-sail":
      return "Deep-water travel is faster and uses less stamina.";
    case "storm-kite":
      return "Strong wind harms stability less and any current sweep reaches shore sooner.";
  }
}

function wayknotFailureMessage(
  reason: WayknotActionReason,
  kind: WayknotKind | null,
  placementReason?: WayknotPlacementReason,
): string {
  const label = kind ? WAYKNOT_LABELS[kind] : "Wayknot";
  if (placementReason === "condition-too-low") {
    return `${label} is too frail to bind. Reclaiming and redeploying preserve wear; it needs at least 15% condition before placement.`;
  }
  switch (reason) {
    case "capacity-reached":
      return `Both reusable ${label.toLocaleLowerCase()} pieces are already in the field. Stand on one and press F to reclaim it.`;
    case "occupied":
      return "This tile already holds a harbor or Wayknot. Stand directly on a placed knot and press F to reclaim it.";
    case "unsuitable-terrain":
      return "No field weave fits this ground: reed mats bind mudflat or marsh, Tide anchors bind waist-deep water, and Wind knots bind scrub or ridge.";
    case "invalid-context":
      return "The field kit cannot safely read this terrain patch.";
    case "not-found":
      return "No placed Wayknot is underfoot to reclaim.";
    case "already-carried":
      return `${label} is already carried in the reusable field kit.`;
    case "already-there":
      return `${label} is already bound here.`;
    case "placed":
    case "reclaimed":
    case "redeployed":
      return `${label} is ready.`;
  }
}

function isTerminal(status: ContractState["status"]): boolean {
  return status === "fulfilled" || status === "expired" || status === "cancelled";
}

function averageRouteStrength(world: WorldView): number {
  if (world.routes.length === 0) return 0;
  return world.routes.reduce((sum, route) => sum + route.traceStrength, 0) / world.routes.length / 1_000_000;
}

function discoveredCount(player: PlayerState): number {
  return player.discovered.reduce((count, discovery) => count + (discovery > 0 ? 1 : 0), 0);
}

function continueSummary(world: WorldView, player: PlayerState): string {
  const here = settlementAtPlayer(player, world);
  return `Day ${Math.floor(world.completedTick / 1_440) + 1} · ${here === null ? "between harbors" : settlementName(world, here)} · ${player.completedJourneys} promises kept`;
}

function tutorialAdvanceMessage(stage: GameSessionState["tutorial"]["stage"]): string {
  switch (stage) {
    case "move":
      return "Begin by feeling the terrain underfoot.";
    case "scan":
      return "The estuary remembers your movement. Now pulse the Loom with Space.";
    case "promise":
      return "Nearby ground is charted. Choose one useful promise at this harbor.";
    case "travel":
      return "The cargo is yours. Choose a route; a rough arrival still matters.";
    case "witness":
      return "Promise kept. Read how the material, relationship, and route responded.";
    case "complete":
      return "The first weave is complete. The estuary is now yours to shape.";
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
