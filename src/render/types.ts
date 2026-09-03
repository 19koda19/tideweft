/** Presentation-only contracts consumed by the p5 renderer. */

import type { RendererTelemetrySnapshot } from "./rendererTelemetry";

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export type TerrainKind =
  | "deep-water"
  | "channel"
  | "shallows"
  | "mudflat"
  | "sandbar"
  | "salt-marsh"
  | "meadow"
  | "scrub"
  | "ridge"
  | "built";

export type BiomeId =
  | "tide-channel"
  | "brine-flat"
  | "reed-marsh"
  | "rain-meadow"
  | "sun-meadow"
  | "wind-ridge"
  | "glimmerfen";

/** Live, normalized environmental signals. Biome identity itself stays stable. */
export interface TerrainClimateView {
  readonly rainfall: number;
  readonly heat: number;
  readonly salinity: number;
  readonly exposure: number;
  readonly magicalWater: number;
}

export interface TerrainTileView {
  /** Stable base terrain category. */
  readonly kind: TerrainKind;
  /** Stable place identity derived from the world seed and immutable terrain. */
  readonly biome?: BiomeId;
  /** Current weather-adjusted signals, each bounded to 0..1. */
  readonly climate?: TerrainClimateView;
  /** Normalized height, where 0 is the estuary floor and 1 is high ground. */
  readonly elevation: number;
  readonly moisture?: number;
  /** Normalized physical bed roughness used by shared local water flow. */
  readonly roughness?: number;
  /** Current normalized water depth. If omitted, the renderer derives it from tide/elevation. */
  readonly waterDepth?: number;
  /** Confidence from physical sounding, where 0 is unknown and 1 is freshly measured. */
  readonly depthKnown?: number;
  /** 0 is hidden, 1 is fully charted. */
  readonly discovered?: number;
  /**
   * Broad present-tense terrain perception, independent from durable Chart memory.
   * 0 is outside current perception and 1 is fully legible. Intermediate
   * values are a presentation-only atmospheric falloff inside the authoritative
   * terrain field. This wider field reveals terrain form only;
   * exact actors, items, labels, and actions use currentDetailVisibility.
   * Missing legacy values remain fully visible.
   */
  readonly currentVisibility?: number;
  /**
   * Shorter present-tense detail perception. Exact entities and interactions
   * must fail closed unless this is direct (1) when a perception view exists.
   */
  readonly currentDetailVisibility?: 0 | 0.5 | 1;
  /** Strength of incidental foot/wake traffic through this tile. */
  readonly trace?: number;
  readonly shelter?: number;
  readonly blocked?: boolean;
}

export interface TerrainGridView {
  readonly columns: number;
  readonly rows: number;
  readonly tileSize: number;
  readonly origin: WorldPoint;
  /**
   * Stable signed global tile represented by row 0, column 0. Floating-origin
   * renderers use this for place-bound detail; omitted finite fixtures retain
   * their original local-coordinate behavior.
   */
  readonly worldTileOrigin?: WorldPoint;
  /** Row-major cells: index = row * columns + column. */
  readonly tiles: readonly TerrainTileView[];
  /** Changes whenever static terrain art should be reconsidered. */
  readonly revision: number | string;
}

export type TidePhase = "ebb" | "low" | "flood" | "high";

export interface TideView {
  readonly phase: TidePhase;
  readonly level: number;
  readonly progress: number;
  /**
   * Public surface-flow direction. Components express heading only, never
   * current strength or hidden bathymetry.
   */
  readonly surfaceCurrent?: WorldPoint;
  readonly label?: string;
  readonly nextPhaseInSeconds?: number;
}

export type WeatherKind =
  | "clear"
  | "mist"
  | "drizzle"
  | "rain"
  | "squall"
  | "aurora";

export interface WeatherView {
  readonly kind: WeatherKind;
  readonly intensity: number;
  readonly wind: WorldPoint;
  readonly visibility?: number;
  readonly label?: string;
  readonly forecast?: string;
}

export type SettlementStatus =
  | "steady"
  | "watchful"
  | "strained"
  | "recovering"
  | "evacuating";

export type SettlementGlyph = "harbor" | "hearth" | "workshop" | "garden" | "relay";

export interface SettlementView {
  readonly id: string;
  readonly name: string;
  readonly position: WorldPoint;
  readonly population: number;
  readonly status: SettlementStatus;
  readonly glyph?: SettlementGlyph;
  readonly connection: number;
  readonly stress: number;
  readonly trust?: number;
  readonly promiseCount?: number;
  readonly lastVerified?: string;
  readonly discovered?: boolean;
  /** Current perception grade; a discovered harbor may remain as stale Chart memory at zero. */
  readonly currentVisibility?: 0 | 0.5 | 1;
  readonly selected?: boolean;
  readonly label?: string;
}

export type CargoProperty = "ordinary" | "heavy" | "fragile" | "perishable" | "confidential";

export interface CargoStackView {
  readonly id: string;
  readonly label: string;
  readonly quantity: number;
  readonly property: CargoProperty;
  readonly condition: number;
  readonly color?: string;
}

export type PaceView = "rest" | "steady" | "swift";

export type PlayerBalanceView =
  | "balanced"
  | "swaying"
  | "stumbling"
  | "fallen"
  | "swept"
  | "recovering";

export interface PlayerIncidentView {
  /** Durable actor + traversal-ordinal identity; never a 32-bit visual seed. */
  readonly id: string;
  readonly kind: "stumble" | "fall" | "sweep" | "cargo-impact" | "recovery";
  readonly label: string;
  readonly detail?: string;
  readonly progress: number;
  /** Presentation variation only. This is not the incident's identity. */
  readonly variantSeed: number;
}

/**
 * Current physical ADRIFT facts. This object is absent outside swept mode so
 * legacy render fixtures remain valid. Shore distance is intentionally
 * optional: free steering can invalidate a planned-bank estimate immediately.
 */
export interface AdriftView {
  readonly paddling: boolean;
  readonly catchingBreath: boolean;
  readonly canStand: boolean;
  readonly waterDepth: number;
  readonly currentDirection: WorldPoint;
  readonly shoreDistance?: number;
}

export interface PlayerView {
  readonly position: WorldPoint;
  readonly velocity: WorldPoint;
  readonly facing: number;
  readonly stamina: number;
  readonly stability: number;
  readonly scanCharge: number;
  readonly scanProgress?: number;
  /** Legacy visual phase estimate, capped below 1 while ADRIFT; never a distance or ETA. */
  readonly sweptProgress?: number;
  /** Live controllable-water facts; absent for older views and non-ADRIFT modes. */
  readonly adrift?: AdriftView;
  readonly cargoLoad: number;
  readonly cargoCapacity: number;
  readonly cargo: readonly CargoStackView[];
  readonly pace: PaceView;
  /** True only while the authoritative Shift/touch hold bit is active. */
  readonly bracing?: boolean;
  /** Explicit physical pose; renderers must not communicate this by color alone. */
  readonly balanceState?: PlayerBalanceView;
  readonly incident?: PlayerIncidentView;
  readonly mode: "foot" | "wading" | "skiff" | "swept" | "camp" | "rescued";
  readonly destination?: WorldPoint;
  /** Explicit world-marker copy, such as PICK UP CARGO or DELIVER CARGO. */
  readonly destinationLabel?: string;
  readonly active?: boolean;
}

export type RouteKind = "remembered" | "footpath" | "wake" | "strand" | "crossing";

/** Live route styling is supplied only for contiguous directly observed runs. */
export interface ObservedRouteRunView {
  readonly points: readonly WorldPoint[];
  readonly bounds?: WorldBounds;
  readonly kind: Exclude<RouteKind, "remembered">;
  readonly strength: number;
  readonly condition: number;
  readonly reliability: number;
  readonly traffic?: number;
}

export interface RouteView {
  readonly id: string;
  /** `remembered` is stable geometry only and carries no live route state. */
  readonly kind: RouteKind;
  readonly points: readonly WorldPoint[];
  readonly bounds?: WorldBounds;
  readonly observedRuns?: readonly ObservedRouteRunView[];
  readonly strength: number;
  readonly condition: number;
  readonly reliability: number;
  readonly trust?: number;
  readonly traffic?: number;
  readonly selected?: boolean;
  readonly directional?: boolean;
}

/** A persistent map memory left by an awakened loop of shared routes. */
export interface TideChoirMemoryView {
  readonly id: string;
  /** Every member corridor, in its authoritative route direction. */
  readonly routePaths: readonly (readonly WorldPoint[])[];
  /** Bounds correspond by index with routePaths and permit draw-call culling. */
  readonly routePathBounds?: readonly (WorldBounds | null)[];
  /** Harbors participating in the loop. */
  readonly harborPoints: readonly WorldPoint[];
  /** Whole simulation ticks elapsed since the choir awakened. */
  readonly age: number;
  readonly emphasis: "quiet" | "normal" | "strong";
  readonly label: string;
}

export type WayknotKind = "reed-mat" | "tide-anchor" | "wind-knot";

/** A player-tied field aid with a physical presence in both world views. */
export interface WayknotView {
  readonly id: string;
  readonly label: string;
  readonly kind: WayknotKind;
  readonly position: WorldPoint;
  /** Radius of its field effect in renderer world units. */
  readonly influenceRadius: number;
  readonly active: boolean;
}

export type FieldMaterialView =
  | "bladderkelp"
  | "driftwood"
  | "glimmer-spore"
  | "shellstone"
  | "sunfiber"
  | "hookstone"
  | "cordreed"
  | "pitchmoss"
  | "stormlichen";

export type FieldResourceRarityView = "common" | "secondary" | "rare";

/**
 * A gatherable natural material inside the courier's current exact-detail
 * field. Hidden catalog nodes never enter the renderer contract.
 */
export interface FieldResourceNodeView {
  readonly id: string;
  readonly material: FieldMaterialView;
  readonly label: string;
  /** Exact tile center; navigation is always routed here rather than to the tap edge. */
  readonly position: WorldPoint;
  /** A Loom sounding promotes a discovered silhouette to an identified reading. */
  readonly knowledge: "charted" | "sounded";
  /** Deliberately absent until sounded. */
  readonly rarity?: FieldResourceRarityView;
  /** Exact harvestable stock, excluding the living reserve; absent until sounded. */
  readonly stockUnits?: number;
  /** Current exact-detail grade. Projected resource actors are direct-only. */
  readonly currentVisibility?: 0 | 0.5 | 1;
}

export type LooseCargoContentKindView = "raw-material" | "component" | "gear" | "promise";
export type LooseCargoConditionBandView = "sound" | "worn" | "damaged" | "ruined";
export type LooseCargoMotionView = "resting" | "drifting" | "tumbling" | "snagged" | "boundary-rest";
export type LooseCargoSnagView = "mangrove" | "bramble";

/**
 * One loaded physical parcel, projected from the authoritative fixed-point
 * loose-cargo kernel. A renderer may reorder these views, but must never use
 * the array index or the human-readable label as an interaction identity.
 */
export interface LooseCargoView {
  readonly id: string;
  /** Signed global region address; compatibility-map parcels use 0,0. */
  readonly region: { readonly x: number; readonly y: number };
  /** Exact local point in the same world units as terrain and the courier. */
  readonly position: WorldPoint;
  readonly velocity: WorldPoint;
  readonly contentKind: LooseCargoContentKindView;
  /** Public physical contents only; Promise destinations never enter this view. */
  readonly resourceKind: string;
  readonly resourceLabel: string;
  readonly quantity: number;
  readonly property: CargoProperty;
  readonly condition: number;
  readonly conditionBand: LooseCargoConditionBandView;
  /** Current visible surface water, separate from durable contamination. */
  readonly wetness: number;
  readonly contamination: number;
  readonly decay: number;
  readonly motion: LooseCargoMotionView;
  readonly snaggedBy: LooseCargoSnagView | null;
  readonly impactMark: "none" | "rock" | "boundary" | "other";
  /** Association only; this deliberately contains no destination or reward. */
  readonly promiseContractId?: number;
  readonly recoverable: boolean;
  readonly recovery: "unavailable" | "approach" | "reachable";
}

export interface TideHarpKnotView<K extends WayknotKind = WayknotKind> {
  readonly id: string;
  readonly kind: K;
  readonly point: WorldPoint;
}

export type TideHarpKnotTupleView = readonly [
  TideHarpKnotView<"reed-mat">,
  TideHarpKnotView<"tide-anchor">,
  TideHarpKnotView<"wind-knot">,
];

export interface TideHarpEdgeView {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly from: WorldPoint;
  readonly to: WorldPoint;
}

/** A selected, persistent three-knot instrument projected into world units. */
export interface TideHarpView {
  readonly id: string;
  readonly label: string;
  /** Always Reed mat, Tide anchor, then Wind knot. */
  readonly knots: TideHarpKnotTupleView;
  /** Always Reed↔Anchor, Reed↔Wind, then Anchor↔Wind. */
  readonly edges: readonly [TideHarpEdgeView, TideHarpEdgeView, TideHarpEdgeView];
  readonly center: WorldPoint;
  /** True exactly when the courier's tile center lies inside or on the triangle. */
  readonly active: boolean;
}

export interface TraceView {
  readonly id: string;
  readonly points: readonly WorldPoint[];
  readonly intensity: number;
  readonly age: number;
  readonly kind: "foot" | "wake" | "possibility";
}

export type PorterState =
  | "traveling"
  | "resting"
  | "helping"
  | "waiting"
  | "stranded"
  | "listening"
  | "watching"
  | "alert"
  | "searching";

export interface PorterView {
  readonly id: string;
  readonly name?: string;
  /** Always observable at direct-detail range; never substitutes for a learned name. */
  readonly quickLabel?: string;
  readonly position: WorldPoint;
  readonly facing: number;
  readonly state: PorterState;
  readonly appearance?: {
    readonly heightScale: number;
    readonly build: "slight" | "lean" | "average" | "broad" | "stocky";
    readonly palette: "silt" | "reed" | "tide" | "ember" | "lichen" | "storm";
    readonly wetness: number;
  };
  readonly conditionLabels?: readonly string[];
  /** Restrained, directly observable emotion punctuation; never a raw meter. */
  readonly emotionMark?: ":)" | ":|" | ":S" | ":[" | "=]";
  /** Directly witnessed state speech only; absent actors never emit this view data. */
  readonly speech?: string;
  readonly progress?: number;
  readonly destinationId?: string;
  readonly cargoColor?: string;
  readonly selected?: boolean;
}

export interface ParticleView {
  readonly id: string;
  readonly position: WorldPoint;
  readonly velocity?: WorldPoint;
  readonly radius?: number;
  readonly life: number;
  readonly color?: string;
  readonly kind: "mote" | "splash" | "spark" | "leaf" | "signal";
}

export type WorldEventKind = "arrival" | "delivery" | "warning" | "repair" | "memory" | "signal";

export interface WorldEventView {
  readonly id: string;
  readonly kind: WorldEventKind;
  readonly position?: WorldPoint;
  readonly label: string;
  readonly detail?: string;
  /** 0 at birth, 1 when presentation should end. */
  readonly progress: number;
  readonly emphasis?: "quiet" | "normal" | "strong";
}

export interface CameraView {
  readonly center: WorldPoint;
  readonly zoom: number;
  readonly bounds?: WorldBounds;
  readonly followPlayer?: boolean;
  readonly shake?: number;
}

/** Present-tense disclosure summary; tile grades live beside their terrain cells. */
export interface PerceptionView {
  readonly version: number;
  readonly signature: string;
  readonly valid: boolean;
  readonly visibleTileCount: number;
  readonly directTileCount: number;
  readonly peripheralTileCount: number;
  readonly detailVisibleTileCount?: number;
  readonly detailDirectTileCount?: number;
  readonly detailPeripheralTileCount?: number;
}

export interface TideweftView {
  readonly revision: number | string;
  /** Changes only when floating-origin coordinates are reinterpreted. */
  readonly spatialEpoch?: number | string;
  readonly tick: number;
  readonly worldName?: string;
  readonly terrain: TerrainGridView;
  readonly tide: TideView;
  readonly weather: WeatherView;
  /** Production projections provide this; absent legacy fixtures imply fully visible. */
  readonly perception?: PerceptionView;
  readonly settlements: readonly SettlementView[];
  readonly player: PlayerView;
  readonly routes: readonly RouteView[];
  readonly choirs: readonly TideChoirMemoryView[];
  readonly wayknots: readonly WayknotView[];
  readonly tideHarps: readonly TideHarpView[];
  readonly fieldResources: readonly FieldResourceNodeView[];
  /** Optional during the save-schema migration; production projections supply it. */
  readonly looseCargo?: readonly LooseCargoView[];
  readonly traces: readonly TraceView[];
  readonly porters: readonly PorterView[];
  readonly particles?: readonly ParticleView[];
  readonly events?: readonly WorldEventView[];
  readonly camera: CameraView;
  readonly paused?: boolean;
}

/** Intents emitted by the renderer. The game host validates and translates them. */
export type RendererCommand =
  | { readonly type: "movement"; readonly vector: WorldPoint }
  | { readonly type: "brace"; readonly active: boolean }
  | { readonly type: "move-target"; readonly point: WorldPoint; readonly additive: boolean }
  | {
      readonly type: "resource-target";
      readonly nodeId: string;
      readonly point: WorldPoint;
      /** Touch gathers on arrival; precise-pointer players retain E as the harvest action. */
      readonly gatherOnArrival: boolean;
    }
  | {
      readonly type: "parcel-target";
      /** Exact persistent entity identity; the host resolves its current point. */
      readonly parcelId: string;
      /** Touch may recover on arrival; desktop E recovers only when already in reach. */
      readonly recoverOnArrival: boolean;
    }
  | { readonly type: "scan" }
  | { readonly type: "interact" }
  | { readonly type: "wayknot" }
  | {
      readonly type: "select";
      readonly entity: "settlement" | "porter" | "route" | "world";
      readonly id?: string;
      readonly point?: WorldPoint;
    }
  | { readonly type: "cancel" };

export interface TideweftRendererOptions {
  readonly mount: HTMLElement;
  readonly getView: () => TideweftView | null | undefined;
  readonly dispatch: (command: RendererCommand) => void;
}

export interface TideweftRendererController {
  readonly canvas: () => HTMLCanvasElement | null;
  readonly destroy: () => void;
  readonly resize: () => void;
  readonly focusWorld: (point: WorldPoint, zoom?: number) => void;
  readonly pulseScan: (point?: WorldPoint) => void;
  /** Actual frames produced by this renderer, never simulation-tick estimates. */
  readonly telemetry: () => RendererTelemetrySnapshot;
  /** Optional on leaf renderers; the composed renderer uses it to stop hidden draw loops. */
  readonly isActive?: () => boolean;
  readonly setActive?: (active: boolean) => void;
}
