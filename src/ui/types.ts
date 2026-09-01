import type {
  CargoProperty,
  PaceView,
  SettlementStatus,
  TidePhase,
  WeatherKind,
} from "../render/types";

export type SessionShape = "drift" | "weave" | "wander";
export type JourneyPosture = "hearth" | "journey" | "gale";

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

export interface FieldReadoutUIView {
  readonly terrainLabel: string;
  readonly depthLabel: string;
  readonly depthKnown: boolean;
  readonly effortLabel: string;
  readonly hint: string;
  readonly toolLabels: readonly string[];
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
  readonly worldName?: string;
  readonly continueSummary?: string;
  readonly suggestedSeed?: string;
  readonly subtitle?: string;
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

export interface ControlAvailabilityUIView {
  readonly canPause?: boolean;
  readonly canScan?: boolean;
  readonly canInteract?: boolean;
  readonly interactLabel?: string;
  readonly interactHint?: string;
  readonly canChangePace?: boolean;
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
  readonly controls?: ControlAvailabilityUIView;
}

export type TideweftUICommand =
  | { readonly type: "resume-world" }
  | {
      readonly type: "new-world";
      readonly seed: string;
      readonly posture: JourneyPosture;
      readonly sessionShape: SessionShape;
    }
  | { readonly type: "toggle-pause" }
  | { readonly type: "scan" }
  | { readonly type: "interact" }
  | { readonly type: "set-pace"; readonly pace: PaceView }
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
    };

export interface TideweftUIOptions {
  readonly root: HTMLElement;
  readonly getView: () => TideweftUIView | null | undefined;
  readonly dispatch: (command: TideweftUICommand) => void;
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
}
