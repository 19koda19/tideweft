import type { SimEvent, WorldView } from "../sim/types";

/**
 * Returns only the settlement where an event physically became observable.
 * Related Promise endpoints are not interchangeable: seeing the destination
 * cannot reveal a departure at the origin, and numeric subject IDs are never
 * guessed to be settlement IDs.
 */
export function eventSettlementLocusIds(
  event: SimEvent,
  world: WorldView,
): readonly number[] {
  const contract = event.subjectId === null
    ? undefined
    : world.contracts.find((candidate) => candidate.id === event.subjectId);
  const numberData = (key: string): number | undefined => {
    const value = event.data[key];
    return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
  };
  const first = (...values: readonly (number | undefined)[]): readonly number[] => {
    const value = values.find((candidate): candidate is number => candidate !== undefined);
    return value === undefined ? [] : [value];
  };

  switch (event.type) {
    case "contract-offered":
    case "contract-accepted":
    case "contract-picked-up":
    case "contract-departed":
      return first(numberData("originSettlementId"), contract?.originSettlementId);
    case "contract-fulfilled":
    case "contract-expired":
      return first(numberData("destinationSettlementId"), contract?.destinationSettlementId);
    case "contract-cancelled":
      return first(numberData("returnSettlementId"));
    case "route-reinforced":
    case "project-completed":
      return first(numberData("settlementId"));
    case "knowledge-shared":
      return first(numberData("toSettlementId"));
    case "world-created":
    case "weather-changed":
    case "tide-choir-awakened":
    case "resident-observed":
    case "resident-introduced":
    case "resident-sheltered":
    case "resident-resumed":
    case "command-rejected":
      return [];
  }
}
