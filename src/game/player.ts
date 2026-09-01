import {
  FIXED_POINT,
  STRAND_AUTOMATION_THRESHOLD,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type ContractState,
  type WorldView,
} from "../sim/types";

export const TILE_UNITS = 1_000;

export type TravelPace = "rest" | "steady" | "swift";

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
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  facingMilliRadians: number;
  stamina: number;
  stability: number;
  scanCharge: number;
  scanPulse: number;
  pace: TravelPace;
  mode: "foot" | "skiff" | "camp" | "rescued";
  cargoCapacity: number;
  cargo: PlayerCargo[];
  report: PlayerReport | null;
  activeContractId: number | null;
  discovered: number[];
  currentTrace: number[];
  completedJourneys: number;
  rescues: number;
  reportsDelivered: number;
}

export interface PlayerControl {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  brace: boolean;
}

export interface PlayerStepResult {
  moved: boolean;
  enteredTile: number | null;
  damagedCargo: boolean;
  exhausted: boolean;
  rescued: boolean;
  settlementId: number | null;
}

const PACE_SPEED: Record<TravelPace, number> = {
  rest: 0,
  steady: 105,
  swift: 164,
};

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
  const discovered = Array.from({ length: WORLD_WIDTH * WORLD_HEIGHT }, () => 0);
  const player: PlayerState = {
    x: tile.x * TILE_UNITS + TILE_UNITS / 2,
    y: tile.y * TILE_UNITS + TILE_UNITS / 2,
    previousX: tile.x * TILE_UNITS + TILE_UNITS / 2,
    previousY: tile.y * TILE_UNITS + TILE_UNITS / 2,
    velocityX: 0,
    velocityY: 0,
    facingMilliRadians: 0,
    stamina: FIXED_POINT,
    stability: FIXED_POINT,
    scanCharge: FIXED_POINT,
    scanPulse: 0,
    pace: "steady",
    mode: "foot",
    cargoCapacity: 16,
    cargo: [],
    report: null,
    activeContractId: null,
    discovered,
    currentTrace: [start.tileIndex],
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
): PlayerStepResult {
  const priorVelocityX = player.velocityX;
  const priorVelocityY = player.velocityY;
  player.previousX = player.x;
  player.previousY = player.y;
  player.scanPulse = Math.max(0, player.scanPulse - 24_000);
  player.scanCharge = Math.min(FIXED_POINT, player.scanCharge + 900);

  const priorTileIndex = playerTileIndex(player);
  const priorTile = world.terrain.tiles[priorTileIndex];
  if (!priorTile) throw new Error("Player is outside the terrain grid.");

  const hasInput = control.moveX !== 0 || control.moveY !== 0;
  const harbor = world.settlements.find((settlement) => settlement.tileIndex === priorTileIndex);
  const completedProject = harbor?.project.status === "complete" ? harbor.project.kind : undefined;
  const bracing = control.brace || player.pace === "rest" || !hasInput;
  const cargoLoad = cargoWeight(player);
  const loadRatio = Math.min(FIXED_POINT, Math.floor((cargoLoad * FIXED_POINT) / player.cargoCapacity));
  const waterDepth = priorTile.waterDepth;
  player.mode = waterDepth > 360_000 ? "skiff" : "foot";

  let velocityX = 0;
  let velocityY = 0;
  if (hasInput && player.stamina > 12_000) {
    const diagonal = control.moveX !== 0 && control.moveY !== 0;
    const baseSpeed = PACE_SPEED[player.pace];
    const terrainDrag = TERRAIN_DRAG[priorTile.terrain];
    const waterFit = player.mode === "skiff"
      ? Math.max(480, Math.min(1_050, 760 + Math.floor(waterDepth / 4_000)))
      : Math.max(430, 1_000 - Math.floor(waterDepth / 2_500));
    const burden = 1_000 - Math.floor(loadRatio / 3_200);
    const braceFit = control.brace ? 620 : 1_000;
    const speed = Math.max(
      24,
      Math.floor((baseSpeed * terrainDrag * waterFit * burden * braceFit) / 1_000_000_000_000),
    );
    const diagonalScale = diagonal ? 707 : 1_000;
    velocityX = Math.floor((control.moveX * speed * diagonalScale) / 1_000);
    velocityY = Math.floor((control.moveY * speed * diagonalScale) / 1_000);
  }

  const nextX = clamp(player.x + velocityX, TILE_UNITS / 2, WORLD_WIDTH * TILE_UNITS - TILE_UNITS / 2);
  const nextY = clamp(player.y + velocityY, TILE_UNITS / 2, WORLD_HEIGHT * TILE_UNITS - TILE_UNITS / 2);
  const destinationTile = world.terrain.tiles[tileIndexAt(nextX, nextY)];
  const impassable = !destinationTile || (destinationTile.terrain === "deep-water" && destinationTile.waterDepth < 240_000);
  if (!impassable) {
    player.x = nextX;
    player.y = nextY;
  } else {
    velocityX = 0;
    velocityY = 0;
  }

  player.velocityX = velocityX;
  player.velocityY = velocityY;
  if (velocityX || velocityY) {
    player.facingMilliRadians = approximateAngleMilliRadians(velocityX, velocityY);
    const paceDrain = player.pace === "swift" ? 4_300 : 1_550;
    const terrainDrain = Math.max(0, 1_000 - TERRAIN_DRAG[priorTile.terrain]);
    player.stamina = Math.max(
      0,
      player.stamina - paceDrain - Math.floor(loadRatio / 700) - terrainDrain * 3,
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

  const turnStress = Math.abs(velocityX - priorVelocityX) + Math.abs(velocityY - priorVelocityY);
  const weatherStress = Math.floor((world.weather.intensity * (Math.abs(world.weather.windX) + Math.abs(world.weather.windY))) / 2_000_000);
  const surfaceStress = Math.floor((priorTile.roughness * (velocityX || velocityY ? 1 : 0)) / 290);
  if (bracing) {
    const cacheStability = completedProject === "cache" ? 8_000 : 0;
    const braceRecovery = hasInput ? 4_200 : 13_000;
    player.stability = Math.min(FIXED_POINT, player.stability + braceRecovery + cacheStability);
  } else {
    const paceStress = player.pace === "swift" ? 3_600 : 700;
    player.stability = Math.max(
      0,
      player.stability - paceStress - surfaceStress - weatherStress - turnStress * 20,
    );
  }

  let damagedCargo = false;
  for (const cargo of player.cargo) {
    const conditionBefore = cargo.condition;

    // Food rewards an efficient line and makes completed caches strategically
    // meaningful. Decay is gentle enough that every arrival remains useful.
    if (cargo.property === "perishable" && completedProject !== "cache") {
      const freshnessLoss = hasInput
        ? player.pace === "swift" ? 190 : control.brace ? 58 : 96
        : 24;
      cargo.condition = Math.max(0, cargo.condition - freshnessLoss);
    }

    // Fragile medicine begins reacting to rough handling much earlier than
    // ordinary cargo. Holding brace while moving trades speed for protection.
    if (!bracing) {
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
        cargo.condition = Math.max(0, cargo.condition - Math.floor((baseShock * shockMultiplier) / 1_000));
      }
    }

    if (cargo.condition < conditionBefore) damagedCargo = true;
  }

  const currentTileIndex = playerTileIndex(player);
  let enteredTile: number | null = null;
  if (currentTileIndex !== priorTileIndex) {
    enteredTile = currentTileIndex;
    if (player.currentTrace[player.currentTrace.length - 1] !== currentTileIndex) {
      const earlierVisit = player.currentTrace.lastIndexOf(currentTileIndex);
      if (earlierVisit >= 0) {
        // Erase loops while preserving the authoritative journey origin and a
        // fully adjacent path. This keeps even long wandering deliveries valid.
        player.currentTrace.splice(earlierVisit + 1);
      } else {
        player.currentTrace.push(currentTileIndex);
      }
    }
    discoverAround(player, world, 2);
  }

  const exhausted = player.stamina === 0;
  let rescued = false;
  if (exhausted) {
    const rescueRoute = world.routes.find(
      (route) =>
        route.traceStrength >= STRAND_AUTOMATION_THRESHOLD
        && route.path.includes(currentTileIndex)
        && world.settlements.some(
          (settlement) =>
            (settlement.id === route.fromSettlementId || settlement.id === route.toSettlementId)
            && settlement.project.kind === "clinic"
            && settlement.project.status === "complete",
        ),
    );
    rescued = rescueRoute !== undefined;
    player.mode = rescued ? "rescued" : "camp";
    player.pace = "rest";
    if (rescued) {
      player.stamina = 160_000;
      player.stability = Math.max(player.stability, 420_000);
      player.rescues += 1;
    }
  }

  return {
    moved: player.x !== player.previousX || player.y !== player.previousY,
    enteredTile,
    damagedCargo,
    exhausted,
    rescued,
    settlementId: settlementAtPlayer(player, world),
  };
}

export function pulseScan(player: PlayerState, world: WorldView): boolean {
  if (player.scanCharge < 280_000) return false;
  player.scanCharge -= 280_000;
  player.scanPulse = FIXED_POINT;
  discoverAround(player, world, 8);
  return true;
}

export function cyclePace(player: PlayerState, delta: -1 | 1): void {
  const paces: TravelPace[] = ["rest", "steady", "swift"];
  const index = paces.indexOf(player.pace);
  player.pace = paces[clamp(index + delta, 0, paces.length - 1)] ?? "steady";
}

export function cargoWeight(player: PlayerState): number {
  return player.cargo.reduce((total, cargo) => {
    const multiplier = cargo.property === "heavy" ? 2 : cargo.property === "fragile" ? 1.25 : 1;
    return total + Math.ceil(cargo.quantity * multiplier);
  }, player.report === null ? 0 : 1);
}

export function loadContractCargo(player: PlayerState, contract: ContractState): boolean {
  if (player.activeContractId !== null || contract.status !== "offered") return false;
  const property = cargoProperty(contract.resource);
  const multiplier = property === "heavy" ? 2 : property === "fragile" ? 1.25 : 1;
  if (Math.ceil(contract.quantity * multiplier) + (player.report === null ? 0 : 1) > player.cargoCapacity) return false;
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
  return tileIndexAt(player.x, player.y);
}

export function discoverAround(player: PlayerState, world: WorldView, radius: number): void {
  const centerX = Math.floor(player.x / TILE_UNITS);
  const centerY = Math.floor(player.y / TILE_UNITS);
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

function tileIndexAt(x: number, y: number): number {
  const tileX = clamp(Math.floor(x / TILE_UNITS), 0, WORLD_WIDTH - 1);
  const tileY = clamp(Math.floor(y / TILE_UNITS), 0, WORLD_HEIGHT - 1);
  return tileY * WORLD_WIDTH + tileX;
}

function approximateAngleMilliRadians(x: number, y: number): number {
  return Math.round(Math.atan2(y, x) * 1_000);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
