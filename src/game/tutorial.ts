import type { ObjectiveUIView } from "../ui/types";
import type { PlayerState } from "./player";

export type TutorialStage =
  | "move"
  | "scan"
  | "promise"
  | "travel"
  | "witness"
  | "complete";

export interface TutorialState {
  stage: TutorialStage;
  scansUsed: number;
  acceptedPromises: number;
  witnessedChanges: number;
  dismissed: boolean;
}

export function createTutorialState(): TutorialState {
  return {
    stage: "move",
    scansUsed: 0,
    acceptedPromises: 0,
    witnessedChanges: 0,
    dismissed: false,
  };
}

export function updateTutorial(tutorial: TutorialState, player: PlayerState): boolean {
  const before = tutorial.stage;
  switch (tutorial.stage) {
    case "move":
      if (player.currentTrace.length >= 4) tutorial.stage = "scan";
      break;
    case "scan":
      if (tutorial.scansUsed > 0) tutorial.stage = "promise";
      break;
    case "promise":
      if (tutorial.acceptedPromises > 0 || player.activeContractId !== null) tutorial.stage = "travel";
      break;
    case "travel":
      if (player.completedJourneys > 0) tutorial.stage = "witness";
      break;
    case "witness":
      if (tutorial.witnessedChanges > 0) tutorial.stage = "complete";
      break;
    case "complete":
      break;
  }
  return before !== tutorial.stage;
}

export function tutorialObjective(tutorial: TutorialState, player: PlayerState): ObjectiveUIView | undefined {
  if (tutorial.dismissed || tutorial.stage === "complete") return undefined;
  switch (tutorial.stage) {
    case "move":
      return {
        id: "tutorial-move",
        eyebrow: "First steps",
        title: "Feel the estuary underfoot",
        description: "Use WASD or the arrow keys. The pale wake behind you is not decoration—the world remembers useful travel.",
        progress: Math.min(1, player.currentTrace.length / 4),
        progressLabel: `${Math.min(4, player.currentTrace.length)} / 4 terrain marks`,
        why: "Movement should feel understandable before the world asks anything of you.",
      };
    case "scan":
      return {
        id: "tutorial-scan",
        eyebrow: "The Loom",
        title: "Pulse the possible paths",
        description: "Press Space or the Scan button. A pulse charts nearby ground and reveals what the tide is about to change.",
        progress: tutorial.scansUsed > 0 ? 1 : 0,
        progressLabel: tutorial.scansUsed > 0 ? "Estuary read" : "Scan ready",
        why: "A scan spends charge, but knowledge and discovery are permanent progress.",
      };
    case "promise":
      return {
        id: "tutorial-promise",
        eyebrow: "Choose freely",
        title: "Carry one useful promise",
        description: "Open an available promise at your current harbor. Its consequence is shown before you commit; there is no mystery payout.",
        progress: player.activeContractId === null ? 0 : 1,
        progressLabel: player.activeContractId === null ? "Choose a promise" : "Cargo secured",
        why: "Settlements request cargo because their simulated stocks or projects actually need it.",
      };
    case "travel":
      return {
        id: "tutorial-travel",
        eyebrow: "Keep the cargo",
        title: "Reach the named destination",
        description: "Pace follows terrain and current automatically. Hold Shift—or BRACE on touch—through supported hazards: falls can damage or separate physical cargo, but visible parcels remain recoverable and weathered deliveries still matter.",
        progress: player.cargo[0]?.condition ? player.cargo[0].condition / 1_000_000 : 0,
        progressLabel: `${Math.round(((player.cargo[0]?.condition ?? 0) / 1_000_000) * 100)}% cargo condition`,
        why: "Arrival is graded, not binary. Recovery and improvisation are part of the story.",
      };
    case "witness":
      return {
        id: "tutorial-witness",
        eyebrow: "The world answers",
        title: "Witness what the promise changed",
        description: "Inspect the arrival, project, trust, and route response. The chronicle records causes, not random flavor text.",
        progress: tutorial.witnessedChanges > 0 ? 1 : 0,
        progressLabel: tutorial.witnessedChanges > 0 ? "Consequence understood" : "Read the new chronicle entry",
        why: "Each delivery guarantees a material, social, and sensory consequence.",
      };
  }
}
