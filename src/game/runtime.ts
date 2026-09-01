import type { RendererCommand, TideweftView, WorldPoint } from "../render/types";
import {
  createWorld,
  createWorldView,
  deserializeWorld,
  serializeWorld,
  STRAND_AUTOMATION_THRESHOLD,
  stepWorld,
  type ContractState,
  type SimCommand,
  type WorldState,
  type WorldView,
} from "../sim/public";
import { findTilePath } from "../sim/terrain";
import type { TideweftUICommand, TideweftUIView } from "../ui/types";
import { TideweftSoundscape } from "../audio/soundscape";
import { createSaveRepository, type SaveRecord, type SaveRepository } from "../platform/persistence";
import {
  TILE_UNITS,
  cargoWeight,
  createPlayer,
  cyclePace,
  loadContractCargo,
  playerTileIndex,
  pulseScan,
  settlementAtPlayer,
  stepPlayer,
  unloadContractCargo,
  type PlayerControl,
  type PlayerState,
} from "./player";
import { projectGameView } from "./projection";
import {
  announce,
  captureSessionBaseline,
  createSessionState,
  type GameSessionState,
} from "./sessionTypes";
import { updateTutorial } from "./tutorial";
import { projectUIView } from "./uiProjection";

const FIXED_STEP_MS = 100;
const PLAYER_STEPS_PER_WORLD_TICK = 10;
const MAX_STEPS_PER_FRAME = 6;
const AUTOSAVE_INTERVAL_TICKS = 600;
const AUTOSAVE_SLOT = "autosave";
const RENDER_TILE_SIZE = 24;
const GAME_SAVE_VERSION = 1;

interface GameSaveEnvelope {
  format: "tideweft-session";
  version: number;
  world: string;
  player: PlayerState;
  session: GameSessionState;
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
  const firstPromise = worldView.contracts.find((contract) => contract.status === "offered");
  let player = createPlayer(worldView, firstPromise?.originSettlementId);
  let session = createSessionState(world.meta.seedText);
  let renderView = projectGameView(worldView, player, { paused: true });
  let uiView = projectUIView(worldView, player, session);
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
  let lastAutosaveTick = 0;
  let lastCargoDamageNoticeMs = Number.NEGATIVE_INFINITY;
  let saveInFlight: Promise<void> | undefined;

  const loaded = await loadAutosave(repository);
  if (loaded) {
    world = loaded.world;
    worldView = createWorldView(world);
    player = loaded.player;
    player.report = player.report ?? null;
    player.reportsDelivered = Number.isFinite(player.reportsDelivered) ? player.reportsDelivered : 0;
    session = loaded.session;
    session.paused = true;
    session.titleVisible = true;
    session.quietHourVisible = false;
    session.hasSave = true;
    session.sessionPlayMilliseconds = Number.isFinite(session.sessionPlayMilliseconds)
      ? Math.max(0, session.sessionPlayMilliseconds)
      : 0;
    session.sessionStrandsWoven = Number.isFinite(session.sessionStrandsWoven) ? session.sessionStrandsWoven : 0;
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
    renderView = projectGameView(worldView, player, {
      selectedSettlementId: session.selectedSettlementId,
      selectedRouteId: objectiveContract?.routeId ?? null,
      destinationSettlementId: destinationSettlementId ?? null,
      paused: session.paused || session.titleVisible || session.quietHourVisible,
    });
    uiView = projectUIView(worldView, player, session);
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
    session.sessionPlayMilliseconds += FIXED_STEP_MS;
    session.sessionDistanceUnits += Math.round(Math.hypot(player.x - beforeX, player.y - beforeY));
    playerStepsSinceWorldTick += 1;
    const worldAdvanced = playerStepsSinceWorldTick >= PLAYER_STEPS_PER_WORLD_TICK;
    if (worldAdvanced) {
      playerStepsSinceWorldTick = 0;
      world = stepWorld(world, commandQueue);
      commandQueue = [];
      worldView = createWorldView(world);
    }

    if (result.moved) soundscape.play("step", player.pace === "swift" ? 0.8 : 0.42);
    if (result.exhausted) {
      if (result.rescued) {
        session.sessionChanges.push("A completed clinic and established strand turned exhaustion into mutual aid.");
        announce(session, "A clinic crew reached you through the established strand. Nothing was lost; infrastructure changed failure into care.", true);
        soundscape.play("deliver", 0.62);
      } else {
        announce(session, "You made camp. Nothing was lost; rest pace will rebuild your stamina.");
        soundscape.play("rest");
      }
    }
    if (result.damagedCargo && session.sessionPlayMilliseconds - lastCargoDamageNoticeMs >= 2_500) {
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
        if (newlyAutomated) session.sessionStrandsWoven += 1;
        const change = `${requester ?? destination} received ${delivered.quantity} ${humanResource(delivered.resource)} at ${destination} (${grade})${newlyAutomated ? "; the route became self-carrying" : ""}.`;
        session.sessionChanges.push(change);
        if (session.sessionChanges.length > 32) session.sessionChanges.splice(0, 8);
        const closureReady = updateClosureMilestone();
        announce(
          session,
          `${requester ?? destination} received the promise${cargo ? ` at ${Math.round(cargo.condition / 10_000)}% condition` : ""}. The route and relationship both changed${newlyAutomated ? ", and autonomous porters can now inherit this corridor" : ""}.${closureReady ? " Tonight's chosen shape is complete; continue freely or choose Quiet Hour whenever the feeling is right." : ""}`,
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
        const closureReady = updateClosureMilestone();
        announce(
          session,
          newlyAutomated
            ? `The route between ${origin} and ${destination} can now carry autonomous porters. Your path became shared capacity.${closureReady ? " Tonight's chosen shape is complete; Quiet Hour is ready when you are." : ""}`
            : `${origin} and ${destination} now share a stronger, more weatherworthy strand.${closureReady ? " Tonight's chosen shape is complete; Quiet Hour is ready when you are." : ""}`,
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
        if (manualControl.moveX || manualControl.moveY) autopilotPath = [];
        break;
      case "brace":
        manualControl = { ...manualControl, brace: command.active };
        break;
      case "move-target":
        setAutopilot(command.point, command.additive);
        break;
      case "scan":
        scan();
        break;
      case "interact":
        interact();
        break;
      case "toggle-pause":
        togglePause();
        break;
      case "pace-step":
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
        newWorld(command.seed, command.posture, command.sessionShape);
        break;
      case "toggle-pause":
        togglePause();
        break;
      case "scan":
        scan();
        break;
      case "interact":
        interact();
        break;
      case "set-pace":
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

  function beginSession(): void {
    session.sessionStartedTick = world.meta.completedTick;
    session.sessionPlayMilliseconds = 0;
    session.sessionDistanceUnits = 0;
    session.sessionDeliveries = 0;
    session.sessionReportsDelivered = 0;
    session.sessionStrandsWoven = 0;
    session.sessionDiscoveredAtStart = discoveredCount(player);
    session.sessionBaseline = captureSessionBaseline(worldView);
    session.closureOffered = false;
    session.sessionChanges = [];
    lastCargoDamageNoticeMs = Number.NEGATIVE_INFINITY;
  }

  function updateClosureMilestone(): boolean {
    if (session.closureOffered || session.sessionShape === "wander") return false;
    const complete = session.sessionShape === "drift"
      ? session.sessionDeliveries >= 1
      : session.sessionStrandsWoven >= 1 || session.sessionDeliveries >= 2;
    if (!complete) return false;
    session.closureOffered = true;
    session.sessionChanges.push(
      session.sessionShape === "drift"
        ? "The chosen Drift reached one complete, useful promise."
        : "The chosen Weave reached a corridor milestone.",
    );
    return true;
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

  function newWorld(seed: string, posture: GameSessionState["posture"], sessionShape: GameSessionState["sessionShape"]): void {
    const normalizedSeed = seed.trim().slice(0, 128) || "quiet-delta";
    session = createSessionState(normalizedSeed, posture, sessionShape);
    world = createWorld(normalizedSeed, session.pressureMode);
    worldView = createWorldView(world);
    const promise = worldView.contracts.find((contract) => contract.status === "offered");
    player = createPlayer(worldView, promise?.originSettlementId);
    session.titleVisible = false;
    session.paused = false;
    beginSession();
    commandQueue = [];
    playerStepsSinceWorldTick = 0;
    autopilotPath = [];
    pendingAcceptance = null;
    pendingDelivery = null;
    pendingReinforcement = null;
    pendingRenegotiation = null;
    pendingReportDelivery = null;
    lastAutosaveTick = 0;
    announce(session, "A new estuary settles into one possible shape. Begin by moving, then pulse the Loom.");
    soundscape.play("strand", 0.9);
    refreshViews();
  }

  function setAutopilot(point: WorldPoint, additive: boolean): void {
    const tileX = clamp(Math.floor(point.x / RENDER_TILE_SIZE), 0, world.terrain.width - 1);
    const tileY = clamp(Math.floor(point.y / RENDER_TILE_SIZE), 0, world.terrain.height - 1);
    const destination = tileY * world.terrain.width + tileX;
    const path = findTilePath(world.terrain, playerTileIndex(player), destination);
    if (path.length < 2) {
      announce(session, "The Loom cannot currently resolve a traversable line there.");
      soundscape.play("warning", 0.45);
      return;
    }
    const next = path.slice(1);
    autopilotPath = additive ? [...autopilotPath, ...next] : next;
    announce(session, `Loom path set across ${next.length} terrain marks.`);
  }

  function scan(): void {
    if (session.paused || session.titleVisible) return;
    if (pulseScan(player, worldView)) {
      session.tutorial.scansUsed += 1;
      soundscape.play("scan");
      announce(session, "The Loom charts nearby terrain. What you learned will remain on this world.");
      refreshViews();
    } else {
      announce(session, "The Loom is recharging. The current map remains trustworthy.");
      soundscape.play("warning", 0.3);
    }
  }

  function togglePause(): void {
    if (session.titleVisible || session.quietHourVisible) return;
    session.paused = !session.paused;
    announce(session, session.paused ? "The estuary is paused." : "The estuary resumes.");
    soundscape.play("ui");
    refreshViews();
  }

  function interact(): void {
    if (session.paused || session.titleVisible) return;
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
    if (cargoWeight(player) >= player.cargoCapacity) {
      announce(session, "The pack is completely committed. Leave one unit free for the sealed document case.");
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
    if (saveInFlight) return saveInFlight;
    const envelope: GameSaveEnvelope = {
      format: "tideweft-session",
      version: GAME_SAVE_VERSION,
      world: serializeWorld(world),
      player: structuredClone(player),
      session: structuredClone(session),
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
    saveInFlight = repository.save(record).finally(() => {
      saveInFlight = undefined;
    });
    return saveInFlight;
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
): Promise<{ world: WorldState; player: PlayerState; session: GameSessionState } | undefined> {
  try {
    const record = await repository.load(AUTOSAVE_SLOT);
    if (!record) return undefined;
    const decoded = JSON.parse(record.worldJson) as Partial<GameSaveEnvelope>;
    if (
      decoded.format !== "tideweft-session" ||
      decoded.version !== GAME_SAVE_VERSION ||
      typeof decoded.world !== "string" ||
      !decoded.player ||
      !decoded.session
    ) {
      return undefined;
    }
    const world = deserializeWorld(decoded.world);
    validatePlayer(decoded.player, world);
    return {
      world,
      player: decoded.player,
      session: decoded.session,
    };
  } catch {
    return undefined;
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

function signControl(value: number): -1 | 0 | 1 {
  if (value > 0.05) return 1;
  if (value < -0.05) return -1;
  return 0;
}

function settlementName(world: WorldView, id: number): string {
  return world.settlements.find((settlement) => settlement.id === id)?.name ?? `Settlement ${id}`;
}

function humanResource(resource: ContractState["resource"]): string {
  return resource === "freshWater" ? "fresh water" : resource;
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
