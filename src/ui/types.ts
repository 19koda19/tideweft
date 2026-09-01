import type {
  CargoProperty,
  PaceView,
  SettlementStatus,
  TidePhase,
  WeatherKind,
} from "../render/types";

export type SessionShape = "drift" | "weave" | "wander";
/**
 * New worlds are perpetual. The broader SessionShape union remains in the
 * save/view contract so Drift and Weave snapshots from earlier alphas load
 * without a format migration.
 */
export const PERPETUAL_SESSION_SHAPE: SessionShape = "wander";
export type JourneyPosture = "hearth" | "journey" | "gale";

export const KIT_REPAIR_CONDITION_GAIN = 250_000 as const;
export type KitTabId = "pack" | "make" | "mend";
export type KitStackTier = "raw" | "component";
export type KitStackLocation = "pack" | "locker";
export type KitGearLocation = "carried" | "equipped" | "locker" | "deployed";

/** Physical Promise/report load shown separately inside the combined pack. */
export interface KitTransportRowUIView {
  readonly id: string;
  /** Stable authoritative carrier-lot identity. Absent rows are not droppable. */
  readonly lotId?: string;
  readonly kind: "promise-cargo" | "signed-report";
  readonly label: string;
  readonly detail: string;
  readonly loadMilli: number;
  /** Normalized 0..1 condition for physical cargo; absent for information. */
  readonly condition?: number;
  /** Exact quantity released by the whole-row DROP action. */
  readonly dropQuantity?: number;
  readonly canDrop?: boolean;
  readonly dropDisabledReason?: string;
}

/** One exact material/component stack in the carried pack or local locker. */
export interface KitStackUIView {
  readonly id: string;
  /** Stable material/component kind shared by split physical lots. */
  readonly itemId: string;
  /** Stable authoritative carrier-lot identity. Absent aggregate rows are not droppable. */
  readonly lotId?: string;
  readonly tier: KitStackTier;
  readonly label: string;
  readonly quantity: number;
  readonly unitLoadMilli: number;
  readonly totalLoadMilli: number;
  readonly location: KitStackLocation;
  readonly locationLabel?: string;
  readonly canDrop?: boolean;
  readonly dropDisabledReason?: string;
}

/** One durable, stable-ID field item. Condition is normalized to 0..1. */
export interface KitGearUIView {
  readonly id: string;
  /** Stable authoritative carrier-lot identity. Absent compatibility gear cannot be dropped. */
  readonly lotId?: string;
  readonly kind: string;
  readonly label: string;
  readonly detail: string;
  readonly location: KitGearLocation;
  readonly locationLabel: string;
  readonly loadMilli: number;
  readonly condition: number;
  readonly conditionLabel: string;
  readonly repairCostLabel: string;
  readonly salvageLabel: string;
  readonly canRepair: boolean;
  readonly repairDisabledReason?: string;
  readonly canDismantle: boolean;
  readonly dismantleDisabledReason?: string;
  readonly canDrop?: boolean;
  readonly dropDisabledReason?: string;
}

export interface KitRecipeIngredientUIView {
  readonly id: string;
  readonly label: string;
  readonly required: number;
  readonly available: number;
  readonly sufficient: boolean;
}

/** A complete recipe preview; disabled rows always explain the first blocker. */
export interface KitRecipeUIView {
  readonly id: string;
  readonly label: string;
  readonly resultLabel: string;
  readonly resultDetail: string;
  readonly resultLoadMilli: number;
  readonly ingredientCopy: string;
  readonly ingredients: readonly KitRecipeIngredientUIView[];
  readonly canCraft: boolean;
  readonly disabledReason?: string;
}

/**
 * Presentation-only field inventory. All load values are exact integer
 * thousandths; `combinedLoadMilli` includes transport plus stacks and gear.
 */
export interface KitUIView {
  readonly revision: number | string;
  readonly combinedLoadMilli: number;
  readonly capacityMilli: number;
  readonly transportLoadMilli: number;
  readonly transportRows: readonly KitTransportRowUIView[];
  readonly stackRows: readonly KitStackUIView[];
  readonly gearRows: readonly KitGearUIView[];
  readonly recipes: readonly KitRecipeUIView[];
  readonly locationLabel?: string;
  readonly hint?: string;
}

export interface ClockUIView {
  readonly day: number;
  readonly timeLabel: string;
  readonly dayLabel?: string;
  readonly paused: boolean;
}

export interface TideUIView {
  readonly phase: TidePhase;
  readonly label: string;
  readonly progress: number;
  readonly nextLabel?: string;
}

export interface WeatherUIView {
  readonly kind: WeatherKind;
  readonly label: string;
  readonly forecast?: string;
  readonly intensity: number;
}

export interface PlayerUIView {
  readonly stamina: number;
  readonly stability: number;
  readonly stabilityTrend: "recovering" | "steady" | "falling";
  readonly stabilityHint: string;
  readonly scanCharge: number;
  readonly cargoLoad: number;
  readonly cargoCapacity: number;
  /** Lowest carried cargo condition, or absent when the pack has no physical cargo. */
  readonly cargoCondition?: number;
  readonly pace: PaceView;
  readonly locationLabel?: string;
}

export interface ObjectiveUIView {
  readonly id: string;
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly progress: number;
  readonly progressLabel: string;
  readonly why?: string;
  readonly completed?: boolean;
}

export type ContractMood = "gentle" | "focused" | "daring" | "social";
export type ContractStatus = "available" | "accepted" | "tracked" | "completed" | "lapsed";

export interface ContractUIView {
  readonly id: string;
  readonly title: string;
  readonly requester?: string;
  readonly summary: string;
  readonly origin: string;
  readonly destination: string;
  readonly cargoLabel: string;
  readonly cargoProperty?: CargoProperty;
  readonly mood: ContractMood;
  readonly status: ContractStatus;
  readonly progress?: number;
  readonly eta?: string;
  readonly forecast?: string;
  readonly masteryHint?: string;
  readonly consequence?: string;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly actionLabel?: string;
}

export interface MetricUIView {
  readonly label: string;
  readonly value: number;
  readonly valueLabel: string;
  readonly tone?: "good" | "neutral" | "warning" | "danger";
}

export interface StockUIView {
  readonly id: string;
  readonly label: string;
  readonly amountLabel: string;
  readonly trend: "rising" | "steady" | "falling";
  readonly critical?: boolean;
}

export interface ResidentSummaryUIView {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly state?: string;
}

export interface ConnectionUIView {
  readonly id: string;
  readonly routeId?: string;
  readonly settlementId?: string;
  readonly settlementName: string;
  readonly conditionLabel: string;
  readonly reliability: number;
  readonly redundant?: boolean;
  readonly surveyed?: boolean;
  readonly choirMember?: boolean;
  readonly actionLabel?: string;
  readonly actionHint?: string;
  readonly actionDisabled?: boolean;
  readonly reportActionLabel?: string;
  readonly reportActionHint?: string;
  readonly reportActionDisabled?: boolean;
}

export interface TideChoirUIView {
  readonly awakenedCount: number;
  readonly surveyedCount: number;
  readonly totalRoutes: number;
  readonly phraseHarbors: readonly string[];
  readonly progress: number;
  readonly label: string;
  readonly hint: string;
}

export interface TideHarpFieldUIView {
  readonly tunedCount: number;
  readonly activeId: string | null;
  readonly activeLabel: string | null;
  readonly benefitLabel: string;
}

export interface FieldReadoutUIView {
  readonly isWater: boolean;
  readonly terrainLabel: string;
  readonly depthLabel: string;
  readonly depthKnown: boolean;
  readonly effortLabel: string;
  readonly hint: string;
  readonly toolLabels: readonly string[];
  readonly deployedWayknots: number;
  readonly wayknotCapacity: number;
  readonly activeWayknotLabels: readonly string[];
  readonly tideHarps: TideHarpFieldUIView;
  readonly swept: boolean;
  readonly sweptProgress: number;
}

export interface SettlementInspectorUIView {
  readonly id: string;
  readonly name: string;
  readonly subtitle?: string;
  readonly status: SettlementStatus;
  readonly statusLabel: string;
  readonly population: number;
  readonly lastVerified: string;
  readonly summary: string;
  readonly metrics: readonly MetricUIView[];
  readonly stocks: readonly StockUIView[];
  readonly residents: readonly ResidentSummaryUIView[];
  readonly connections: readonly ConnectionUIView[];
}

export interface ChronicleEntryUIView {
  readonly id: string;
  readonly timeLabel: string;
  readonly title: string;
  readonly detail: string;
  readonly kind: "material" | "social" | "route" | "weather" | "memory";
  readonly new?: boolean;
}

export interface TitleOverlayUIView {
  readonly visible: boolean;
  readonly hasSave: boolean;
  /** Storage state is unknown or superseded, so no world may be created. */
  readonly worldCreationBlocked?: boolean;
  /**
   * Recovery mode for an unreadable or conflicting autosave. The ordinary
   * restart phrase stays hidden, but a deliberate non-empty replacement seed
   * is mandatory so pressing Enter can never choose the default seed.
   */
  readonly requiresSeed?: boolean;
  readonly worldName?: string;
  readonly continueSummary?: string;
  readonly suggestedSeed?: string;
}

export interface QuietHourUIView {
  readonly visible: boolean;
  readonly title?: string;
  readonly durationLabel: string;
  readonly distanceLabel: string;
  readonly deliveries: number;
  readonly strandLabel: string;
  readonly summary: string;
  readonly changes: readonly string[];
  readonly quote?: string;
  readonly canFinish?: boolean;
}

export interface AnnouncementUIView {
  readonly id: string;
  readonly message: string;
  readonly assertive?: boolean;
}

/** Persistent storage health is separate from transient gameplay announcements. */
export interface SaveWarningUIView {
  readonly id: string;
  readonly message: string;
  readonly detail?: string;
  readonly tone?: "warning" | "danger";
}

export interface ControlAvailabilityUIView {
  readonly canScan?: boolean;
  readonly canInteract?: boolean;
  readonly interactLabel?: string;
  readonly interactHint?: string;
  readonly canWayknot?: boolean;
  readonly wayknotLabel?: string;
  readonly wayknotHint?: string;
  readonly canEndSession?: boolean;
}

export interface TideweftUIView {
  readonly revision: number | string;
  readonly worldName: string;
  readonly posture: JourneyPosture;
  readonly sessionShape: SessionShape;
  readonly clock: ClockUIView;
  readonly tide: TideUIView;
  readonly weather: WeatherUIView;
  readonly player: PlayerUIView;
  readonly field: FieldReadoutUIView;
  readonly choir: TideChoirUIView;
  readonly objective?: ObjectiveUIView;
  readonly contracts: readonly ContractUIView[];
  readonly selectedSettlement?: SettlementInspectorUIView;
  readonly chronicle: readonly ChronicleEntryUIView[];
  readonly title: TitleOverlayUIView;
  readonly quietHour?: QuietHourUIView;
  readonly announcement?: AnnouncementUIView;
  readonly saveWarning?: SaveWarningUIView;
  readonly controls?: ControlAvailabilityUIView;
  /** Additive while the gathering runtime migrates; absent renders an empty KIT. */
  readonly kit?: KitUIView;
}

export type TideweftUICommand =
  | { readonly type: "resume-world" }
  | {
      readonly type: "new-world";
      readonly seed: string;
      readonly posture: JourneyPosture;
      /** Retained on the command wire for older hosts; current runtimes use Wander. */
      readonly sessionShape: SessionShape;
      /** Required by the runtime only when replacing an existing autosave. */
      readonly restartPhrase?: string;
    }
  | { readonly type: "scan" }
  | { readonly type: "interact" }
  | { readonly type: "wayknot" }
  | { readonly type: "set-session-shape"; readonly sessionShape: SessionShape }
  | {
      readonly type: "contract";
      readonly action: "inspect" | "accept" | "track" | "renegotiate";
      readonly contractId: string;
    }
  | {
      readonly type: "settlement";
      readonly action: "focus" | "close";
      readonly settlementId?: string;
    }
  | { readonly type: "quiet-hour"; readonly action: "open" | "continue" | "finish" }
  | { readonly type: "open-title" }
  | {
      readonly type: "strand";
      readonly action: "reinforce";
      readonly routeId: string;
      readonly settlementId: string;
    }
  | {
      readonly type: "report";
      readonly action: "collect";
      readonly sourceSettlementId: string;
      readonly targetSettlementId: string;
    }
  | {
      readonly type: "kit";
      readonly action: "craft";
      readonly recipeId: string;
    }
  | {
      readonly type: "kit";
      readonly action: "repair";
      readonly gearId: string;
      readonly conditionGain: typeof KIT_REPAIR_CONDITION_GAIN;
    }
  | {
      readonly type: "kit";
      readonly action: "dismantle";
      readonly gearId: string;
    }
  | {
      readonly type: "kit";
      readonly action: "drop";
      /** Exact stable carried-lot identity; presentation labels are never authoritative. */
      readonly lotId: string;
      /** Positive integer quantity. Durable gear always uses one. */
      readonly quantity: number;
    };

export interface TideweftUIOptions {
  readonly root: HTMLElement;
  readonly getView: () => TideweftUIView | null | undefined;
  readonly dispatch: (command: TideweftUICommand) => void;
  /** Feeds the touch hold control into the same brace bit as desktop Shift. */
  readonly setBrace: (active: boolean) => void;
  readonly announcer?: HTMLElement;
  /** Defaults to true. When false, the host calls update itself. */
  readonly autoStart?: boolean;
}

export interface TideweftUIController {
  readonly update: (view?: TideweftUIView | null) => void;
  readonly start: () => void;
  readonly stop: () => void;
  readonly destroy: () => void;
  readonly announce: (message: string, assertive?: boolean) => void;
  readonly setTitleVisible: (visible: boolean) => void;
  readonly setQuietHourVisible: (visible: boolean) => void;
  readonly openHelp: () => void;
  readonly closeHelp: () => void;
  readonly openPatchNotes: () => void;
  readonly closePatchNotes: () => void;
  readonly openKit: (tab?: KitTabId) => void;
  readonly closeKit: () => void;
}
