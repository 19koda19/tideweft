import type { PressureMode, WorldView } from "../sim/types";
import type { JourneyPosture, SessionShape } from "../ui/types";
import { createTutorialState, type TutorialState } from "./tutorial";

export interface SessionBaseline {
  completedTick: number;
  activeRoutes: number;
  resilience: number;
  averageStress: number;
  averageTrust: number;
  projectProgress: number;
  fulfilledContracts: number;
}

export interface SessionOutcomeDelta {
  elapsedTicks: number;
  autonomousDeliveries: number;
  activeRoutes: number;
  resilience: number;
  averageStress: number;
  averageTrust: number;
  projectProgress: number;
}

export interface GameSessionState {
  seed: string;
  pressureMode: PressureMode;
  posture: JourneyPosture;
  sessionShape: SessionShape;
  paused: boolean;
  titleVisible: boolean;
  quietHourVisible: boolean;
  selectedSettlementId: number | null;
  inspectedContractId: number | null;
  trackedContractId: number | null;
  sessionStartedTick: number;
  sessionPlayMilliseconds: number;
  sessionDistanceUnits: number;
  sessionDeliveries: number;
  sessionReportsDelivered: number;
  sessionStrandsWoven: number;
  sessionDiscoveredAtStart: number;
  sessionBaseline: SessionBaseline | null;
  closureOffered: boolean;
  campaignCelebrated: boolean;
  sessionChanges: string[];
  announcement: { id: number; message: string; assertive: boolean } | null;
  nextAnnouncementId: number;
  tutorial: TutorialState;
  hasSave: boolean;
  continueSummary: string;
}

export function pressureForPosture(posture: JourneyPosture): PressureMode {
  switch (posture) {
    case "hearth":
      return "calm";
    case "journey":
      return "standard";
    case "gale":
      return "wild";
  }
}

export function createSessionState(
  seed: string,
  posture: JourneyPosture = "journey",
  sessionShape: SessionShape = "weave",
): GameSessionState {
  return {
    seed,
    pressureMode: pressureForPosture(posture),
    posture,
    sessionShape,
    paused: true,
    titleVisible: true,
    quietHourVisible: false,
    selectedSettlementId: null,
    inspectedContractId: null,
    trackedContractId: null,
    sessionStartedTick: 0,
    sessionPlayMilliseconds: 0,
    sessionDistanceUnits: 0,
    sessionDeliveries: 0,
    sessionReportsDelivered: 0,
    sessionStrandsWoven: 0,
    sessionDiscoveredAtStart: 0,
    sessionBaseline: null,
    closureOffered: false,
    campaignCelebrated: false,
    sessionChanges: [],
    announcement: null,
    nextAnnouncementId: 1,
    tutorial: createTutorialState(),
    hasSave: false,
    continueSummary: "",
  };
}

export function announce(session: GameSessionState, message: string, assertive = false): void {
  session.announcement = {
    id: session.nextAnnouncementId,
    message,
    assertive,
  };
  session.nextAnnouncementId += 1;
}

export function captureSessionBaseline(world: WorldView): SessionBaseline {
  const trustValues = world.settlements.flatMap((settlement) => settlement.trust.map((trust) => trust.value));
  return {
    completedTick: world.completedTick,
    activeRoutes: world.network.activeRouteCount,
    resilience: world.network.resilience,
    averageStress: average(world.settlements.map((settlement) => settlement.stress)),
    averageTrust: average(trustValues),
    projectProgress: world.settlements.reduce((total, settlement) => total + settlement.project.progress, 0),
    fulfilledContracts: world.contracts.filter((contract) => contract.status === "fulfilled").length,
  };
}

export function sessionOutcomeDelta(session: GameSessionState, world: WorldView): SessionOutcomeDelta | null {
  const baseline = session.sessionBaseline;
  if (baseline === null) return null;
  const current = captureSessionBaseline(world);
  const allSessionDeliveries = Math.max(0, current.fulfilledContracts - baseline.fulfilledContracts);
  return {
    elapsedTicks: Math.max(0, world.completedTick - baseline.completedTick),
    autonomousDeliveries: Math.max(0, allSessionDeliveries - session.sessionDeliveries),
    activeRoutes: current.activeRoutes - baseline.activeRoutes,
    resilience: current.resilience - baseline.resilience,
    averageStress: current.averageStress - baseline.averageStress,
    averageTrust: current.averageTrust - baseline.averageTrust,
    projectProgress: current.projectProgress - baseline.projectProgress,
  };
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}
