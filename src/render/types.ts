/** Presentation-only contracts consumed by the p5 renderer. */

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

export interface TerrainTileView {
  /** Stable base terrain category. */
  readonly kind: TerrainKind;
  /** Normalized height, where 0 is the estuary floor and 1 is high ground. */
  readonly elevation: number;
  readonly moisture?: number;
  /** Current normalized water depth. If omitted, the renderer derives it from tide/elevation. */
  readonly waterDepth?: number;
  /** 0 is hidden, 1 is fully charted. */
  readonly discovered?: number;
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

export interface PlayerView {
  readonly position: WorldPoint;
  readonly velocity: WorldPoint;
  readonly facing: number;
  readonly stamina: number;
  readonly stability: number;
  readonly scanCharge: number;
  readonly scanProgress?: number;
  readonly cargoLoad: number;
  readonly cargoCapacity: number;
  readonly cargo: readonly CargoStackView[];
  readonly pace: PaceView;
  readonly mode: "foot" | "skiff" | "camp" | "rescued";
  readonly destination?: WorldPoint;
  readonly active?: boolean;
}

export type RouteKind = "footpath" | "wake" | "strand" | "crossing";

export interface RouteView {
  readonly id: string;
  readonly kind: RouteKind;
  readonly points: readonly WorldPoint[];
  readonly strength: number;
  readonly condition: number;
  readonly reliability: number;
  readonly trust?: number;
  readonly traffic?: number;
  readonly selected?: boolean;
  readonly directional?: boolean;
}

export interface TraceView {
  readonly id: string;
  readonly points: readonly WorldPoint[];
  readonly intensity: number;
  readonly age: number;
  readonly kind: "foot" | "wake" | "possibility";
}

export type PorterState = "traveling" | "resting" | "helping" | "waiting" | "stranded";

export interface PorterView {
  readonly id: string;
  readonly name?: string;
  readonly position: WorldPoint;
  readonly facing: number;
  readonly state: PorterState;
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

export interface TideweftView {
  readonly revision: number | string;
  readonly tick: number;
  readonly worldName?: string;
  readonly terrain: TerrainGridView;
  readonly tide: TideView;
  readonly weather: WeatherView;
  readonly settlements: readonly SettlementView[];
  readonly player: PlayerView;
  readonly routes: readonly RouteView[];
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
  | { readonly type: "scan" }
  | { readonly type: "interact" }
  | { readonly type: "toggle-pause" }
  | { readonly type: "pace-step"; readonly delta: -1 | 1 }
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
}
