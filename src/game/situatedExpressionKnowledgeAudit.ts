import { canonicalizeActorObservations } from "../sim/actorPerception";
import { FIXED_POINT, type WorldView } from "../sim/types";
import type { HumanSupplementalListeningReceipt } from "./humanPerception";
import { humanDangerWarningExpressionEventMatchesWorld } from "./humanDangerWarningExpression";
import { residentIntroductionExpressionEventMatchesWorld } from "./residentIntroductionExpression";
import { residentWeatherHoldExpressionEventMatchesWorld } from "./residentWeatherHoldExpression";
import type { SettlementEcologyState } from "./settlementEcology";
import { settlementKeeperStoreResponseExpressionEventMatchesWorld } from "./settlementKeeperStoreResponseExpression";
import { projectSituatedExpression, type SituatedExpressionEvent, type SituatedExpressionMeaning } from "./situatedExpression";
import { canonicalizeSituatedExpressionSemanticFact, situatedExpressionSemanticFactForEvent,
  situatedExpressionSoundClass } from "./situatedExpressionAcoustics";
import { workingPeopleExpressionEventMatchesWorld } from "./workingPeopleExpression";

/** Captured DEV evidence, never a portable attestation or knowledge authority. */
export interface ExpressionKnowledgeSourceCheck {
  readonly eventId: string;
  readonly sourceActorId: string;
  readonly triggerEventId: string;
  readonly checkedAtTick: number;
  readonly owner: string;
  readonly validated: boolean;
}

export const EXPRESSION_KNOWLEDGE_SOURCE_MEANINGS: readonly SituatedExpressionMeaning[] = Object.freeze([
  "keeper-secure-store-response", "resident-introduction", "human-danger-warning", "resident-weather-hold", "porter-heavy-load",
]);

/** Calls existing domain authentication against the actual event-time owners. */
export function checkExpressionKnowledgeSource(
  event: SituatedExpressionEvent,
  world: WorldView,
  settlement: SettlementEcologyState,
): ExpressionKnowledgeSourceCheck | null {
  if (!EXPRESSION_KNOWLEDGE_SOURCE_MEANINGS.includes(event.meaning)) return null;
  let validated = false;
  let owner: string;
  switch (event.meaning) {
    case "keeper-secure-store-response":
      owner = "settlementKeeperStoreResponseExpression";
      validated = settlementKeeperStoreResponseExpressionEventMatchesWorld({ world, settlement }, event);
      break;
    case "resident-introduction":
      owner = "residentIntroductionExpression";
      validated = residentIntroductionExpressionEventMatchesWorld(world, event);
      break;
    case "human-danger-warning": {
      owner = "humanDangerWarningExpression";
      const residents = world.residents.filter(({ identity }) => identity.stableId === event.sourceActorId);
      validated = residents.length === 1 && humanDangerWarningExpressionEventMatchesWorld(
        { world, resident: residents[0]! }, event,
      );
      break;
    }
    case "resident-weather-hold":
      owner = "residentWeatherHoldExpression";
      validated = residentWeatherHoldExpressionEventMatchesWorld(world, event);
      break;
    case "porter-heavy-load":
      owner = "workingPeopleExpression";
      validated = workingPeopleExpressionEventMatchesWorld(world, event);
      break;
    default: return null;
  }
  return Object.freeze({
    eventId: event.eventId, sourceActorId: event.sourceActorId,
    triggerEventId: event.triggerEventId, checkedAtTick: world.completedTick,
    owner, validated,
  });
}

export interface ExpressionKnowledgeListenerAudit {
  readonly receipt: HumanSupplementalListeningReceipt;
  /** Null until the complete authoritative transaction succeeds. */
  readonly retainedBelief: boolean | null;
}

/** Checks captured hearing/meaning limits, not a second acoustic simulation. */
export function expressionKnowledgeListenerIssues(
  event: SituatedExpressionEvent,
  receipt: HumanSupplementalListeningReceipt,
): readonly string[] {
  const issues: string[] = [];
  if (projectSituatedExpression(event) === null
    || receipt.expressionEventId !== event.eventId
    || receipt.sourceActorId !== event.sourceActorId) issues.push("source-event-mismatch");
  const fact = receipt.semanticFact;
  const expectedFact = situatedExpressionSemanticFactForEvent(event);
  if (fact !== null && (canonicalizeSituatedExpressionSemanticFact(fact) === null
    || fact.expressionEventId !== event.eventId || fact.sourceActorId !== event.sourceActorId
    || expectedFact === null || fact.perceivedClass !== expectedFact.perceivedClass
    || fact.minimumHearingConfidence !== expectedFact.minimumHearingConfidence)) {
    issues.push("unsupported-semantic-fact");
  }
  if (receipt.outcome === "source-excluded") {
    if (receipt.observerId !== event.sourceActorId || receipt.contact !== null || receipt.observation !== null) {
      issues.push("invalid-source-exclusion");
    }
    return Object.freeze(issues);
  }
  if (receipt.outcome === "not-heard" || receipt.outcome === "unavailable") {
    if (receipt.contact !== null || receipt.observation !== null) issues.push("unheard-observation");
    return Object.freeze(issues);
  }
  const { contact, observation } = receipt;
  if (receipt.outcome !== "heard" || contact === null || observation === null
    || canonicalizeActorObservations([observation]).length !== 1) {
    issues.push("invalid-hearing-observation");
    return Object.freeze(issues);
  }
  if (receipt.observerId === event.sourceActorId
    || observation.observerId !== receipt.observerId
    || observation.observedAtTick !== receipt.observedAtTick
    || observation.channel !== "hearing" || observation.subjectId !== null
    || observation.identification !== "anonymous") issues.push("listener-identity-leak");
  const confidence = Math.max(0, Math.min(FIXED_POINT, Math.round(contact.certainty * FIXED_POINT)));
  if (!Number.isFinite(contact.certainty) || contact.certainty < 0 || contact.certainty > 1
    || observation.confidence !== confidence) issues.push("hearing-confidence-mismatch");
  if (fact !== null) {
    const expectedClass = confidence >= fact.minimumHearingConfidence ? fact.perceivedClass : "human-vocalization";
    if (observation.perceivedClass !== expectedClass) issues.push("unsupported-understanding");
  } else if (observation.perceivedClass !== situatedExpressionSoundClass(event)) {
    issues.push("unsupported-understanding");
  }
  return Object.freeze(issues);
}
