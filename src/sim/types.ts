export const WORLD_WIDTH = 96;
export const WORLD_HEIGHT = 72;
export const LEGACY_WORLD_WIDTH = 64;
export const LEGACY_WORLD_HEIGHT = 48;
export const MIN_SETTLEMENT_MANHATTAN_DISTANCE = 14;
export const FIXED_POINT = 1_000_000;
export const STRAND_AUTOMATION_THRESHOLD = 32_000;
export const SAVE_FORMAT_VERSION = 2;
export const RULES_VERSION = "tideweft-sim/4";

export const RESOURCE_KINDS = [
  "food",
  "freshWater",
  "reed",
  "medicine",
  "parts",
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type Inventory = Record<ResourceKind, number>;
export type PressureMode = "calm" | "standard" | "wild";
export type Tick = number;
export type EntityId = number;

export type TerrainKind =
  | "deep-water"
  | "tidal-flat"
  | "marsh"
  | "meadow"
  | "ridge";

export interface TerrainTile {
  index: number;
  x: number;
  y: number;
  elevation: number;
  moisture: number;
  roughness: number;
  terrain: TerrainKind;
  baseTravelCost: number;
  traceStrength: number;
}

export interface TerrainState {
  width: number;
  height: number;
  tiles: TerrainTile[];
}

export interface TideState {
  phase: number;
  level: number;
  direction: -1 | 1;
}

export type WeatherKind = "clear" | "mist" | "rain" | "storm";

export interface WeatherState {
  kind: WeatherKind;
  intensity: number;
  windX: number;
  windY: number;
  nextChangeTick: Tick;
}

export interface ResourceAmount {
  resource: ResourceKind;
  amount: number;
}

export interface Recipe {
  id: EntityId;
  name: string;
  intervalTicks: number;
  nextRunTick: Tick;
  inputs: ResourceAmount[];
  outputs: ResourceAmount[];
}

export type ProjectKind = "beacon" | "cache" | "crossing" | "clinic" | "ferry";
export type ProjectStatus = "building" | "complete";

export interface CivicProject {
  id: EntityId;
  kind: ProjectKind;
  status: ProjectStatus;
  resource: ResourceKind;
  progress: number;
  target: number;
}

export interface SettlementTrust {
  settlementId: EntityId;
  value: number;
}

export interface KnowledgeRecord {
  id: EntityId;
  subjectSettlementId: EntityId;
  resource: ResourceKind;
  reportedQuantity: number;
  ageTicks: number;
  confidence: number;
  verified: boolean;
}

export interface SettlementState {
  id: EntityId;
  name: string;
  tileIndex: number;
  specialization: ResourceKind;
  residentIds: EntityId[];
  inventory: Inventory;
  recipes: Recipe[];
  project: CivicProject;
  trust: SettlementTrust[];
  knowledge: KnowledgeRecord[];
  stress: number;
}

export interface ResidentTraits {
  resolve: number;
  empathy: number;
  curiosity: number;
}

export interface ResidentNeeds {
  food: number;
  rest: number;
  belonging: number;
}

export interface ResidentRelationship {
  residentId: EntityId;
  trust: number;
}

export type ResidentRole =
  | "fisher"
  | "harvester"
  | "medic"
  | "mechanic"
  | "navigator"
  | "steward";

export type ResidentIntention =
  | "rest"
  | "eat"
  | "connect"
  | "work"
  | "carry";

export type ResidentLocation =
  | { kind: "settlement"; settlementId: EntityId }
  | { kind: "route"; routeId: EntityId; progress: number };

export interface ResidentState {
  id: EntityId;
  name: string;
  homeSettlementId: EntityId;
  role: ResidentRole;
  traits: ResidentTraits;
  needs: ResidentNeeds;
  relationships: ResidentRelationship[];
  intention: ResidentIntention;
  location: ResidentLocation;
  activeContractId: EntityId | null;
  nextThinkTick: Tick;
}

export interface RouteState {
  id: EntityId;
  fromSettlementId: EntityId;
  toSettlementId: EntityId;
  path: number[];
  baseTravelTicks: number;
  traceStrength: number;
  condition: number;
  reliability: number;
  traffic: number;
  lastUsedTick: Tick;
}

/**
 * A route cycle that has been deliberately sounded into the shared world.
 * Route and settlement IDs are stored in ascending order so a cycle has one
 * authoritative representation regardless of the order in which it was
 * proposed.
 */
export interface TideChoirState {
  id: EntityId;
  routeIds: EntityId[];
  settlementIds: EntityId[];
  awakenedTick: Tick;
}

export type ContractStatus =
  | "offered"
  | "accepted"
  | "in-transit"
  | "fulfilled"
  | "expired"
  | "cancelled";

export type ContractCarrierKind = "resident" | "player";
export type DeliveryGrade = "pristine" | "weathered" | "improvised" | "rescued";

export interface ContractState {
  id: EntityId;
  requesterResidentId: EntityId;
  originSettlementId: EntityId;
  destinationSettlementId: EntityId;
  resource: ResourceKind;
  quantity: number;
  cargoQuantity: number;
  status: ContractStatus;
  reason: "shortage";
  createdTick: Tick;
  playerExclusiveUntilTick: Tick;
  dueTick: Tick;
  acceptedTick: Tick | null;
  departedTick: Tick | null;
  arrivalTick: Tick | null;
  completedTick: Tick | null;
  carrierKind: ContractCarrierKind | null;
  assignedResidentId: EntityId | null;
  routeId: EntityId;
  porterRouteIds: EntityId[];
  porterSettlementIds: EntityId[];
  deliveryCondition: number | null;
  deliveryGrade: DeliveryGrade | null;
  deliveryTraceCost: number | null;
}

export interface ConservationLedger {
  initial: Inventory;
  produced: Inventory;
  consumed: Inventory;
}

export type SimEventType =
  | "world-created"
  | "command-rejected"
  | "contract-offered"
  | "contract-accepted"
  | "contract-picked-up"
  | "contract-departed"
  | "contract-fulfilled"
  | "contract-expired"
  | "contract-cancelled"
  | "route-reinforced"
  | "tide-choir-awakened"
  | "project-completed"
  | "weather-changed"
  | "knowledge-shared";

export type SimEventDatum = string | number | boolean | null;

export interface SimEvent {
  tick: Tick;
  sequence: number;
  type: SimEventType;
  subjectId: EntityId | null;
  data: Record<string, SimEventDatum>;
}

export interface WorldMeta {
  completedTick: Tick;
  rootSeed: [number, number, number, number];
  seedText: string;
  pressureMode: PressureMode;
  saveFormatVersion: number;
  rulesVersion: string;
  nextEntityId: number;
  nextEventSequence: number;
}

export interface WorldState {
  meta: WorldMeta;
  terrain: TerrainState;
  tide: TideState;
  weather: WeatherState;
  settlements: SettlementState[];
  residents: ResidentState[];
  routes: RouteState[];
  choirs: TideChoirState[];
  contracts: ContractState[];
  ledger: ConservationLedger;
  processedCommandIds: string[];
  events: SimEvent[];
}

export interface CommandBase {
  id: string;
  sourceId?: number;
  sequence?: number;
  targetTick?: Tick;
}

export type AcceptContractCommand =
  | (CommandBase & {
      type: "accept-contract";
      contractId: EntityId;
      carrier: "player";
    })
  | (CommandBase & {
      type: "accept-contract";
      contractId: EntityId;
      carrier: "resident";
      residentId: EntityId;
    });

export interface PickupContractCommand extends CommandBase {
  type: "pickup-contract";
  contractId: EntityId;
  originSettlementId: EntityId;
}

export interface DeliverContractCommand extends CommandBase {
  type: "deliver-contract";
  contractId: EntityId;
  destinationSettlementId: EntityId;
  condition: number;
  trace: readonly number[];
}

export interface CancelContractCommand extends CommandBase {
  type: "cancel-contract";
  contractId: EntityId;
  returnSettlementId?: EntityId;
}

export interface ReinforceRouteCommand extends CommandBase {
  type: "reinforce-route";
  routeId: EntityId;
  settlementId: EntityId;
  parts: number;
}

export interface ShareKnowledgeCommand extends CommandBase {
  type: "share-knowledge";
  fromSettlementId: EntityId;
  toSettlementId: EntityId;
  subjectSettlementId: EntityId;
  resource: ResourceKind;
  reportedQuantity?: number;
  observedTick?: Tick;
  confidence?: number;
}

export interface AwakenTideChoirCommand extends CommandBase {
  type: "awaken-tide-choir";
  routeIds: readonly EntityId[];
}

export type SimCommand =
  | AcceptContractCommand
  | PickupContractCommand
  | DeliverContractCommand
  | CancelContractCommand
  | ReinforceRouteCommand
  | ShareKnowledgeCommand
  | AwakenTideChoirCommand;

export type CommandsByTick =
  | ReadonlyMap<number, readonly SimCommand[]>
  | Readonly<Record<number, readonly SimCommand[]>>;

export interface TerrainTileView extends TerrainTile {
  waterDepth: number;
}

export interface KnowledgeView extends KnowledgeRecord {
  freshness: number;
}

export interface SettlementView
  extends Omit<SettlementState, "inventory" | "recipes" | "trust" | "knowledge" | "residentIds" | "project"> {
  residentIds: readonly EntityId[];
  inventory: Readonly<Inventory>;
  recipes: readonly Recipe[];
  project: Readonly<CivicProject>;
  trust: readonly SettlementTrust[];
  knowledge: readonly KnowledgeView[];
}

export interface WorldView {
  completedTick: Tick;
  seedText: string;
  /** Authoritative persisted seed; optional only for legacy in-memory consumers. */
  rootSeed?: readonly [number, number, number, number];
  pressureMode: PressureMode;
  terrain: {
    width: number;
    height: number;
    tiles: readonly TerrainTileView[];
  };
  tide: Readonly<TideState>;
  weather: Readonly<WeatherState>;
  settlements: readonly SettlementView[];
  residents: readonly ResidentState[];
  routes: readonly RouteState[];
  choirs: readonly TideChoirState[];
  contracts: readonly ContractState[];
  events: readonly SimEvent[];
  totals: Readonly<Inventory>;
  network: Readonly<import("./network").NetworkMetrics>;
}

export interface SaveEnvelope {
  format: "tideweft-world";
  saveFormatVersion: number;
  rulesVersion: string;
  checksum: string;
  world: WorldState;
}
