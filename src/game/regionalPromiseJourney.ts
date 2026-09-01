import type { ContractState, WorldView } from "../sim/types";
import { playerTileIndex, type PlayerState } from "./player";
import { regionalAddressAt } from "./regionalWorldView";

export const REGIONAL_PROMISE_JOURNEY_VERSION = 1 as const;

export interface RegionalPromiseJourneyState {
  readonly version: typeof REGIONAL_PROMISE_JOURNEY_VERSION;
  readonly contractId: number | null;
  /** Once true, this Promise can deliver but can never claim a finite-map route trace. */
  readonly detoured: boolean;
  /** Loop-erased indices in the authoritative compatibility economy terrain. */
  readonly compatibilityTrace: readonly number[];
}

export function createRegionalPromiseJourney(): RegionalPromiseJourneyState {
  return seal({ contractId: null, detoured: false, compatibilityTrace: [] });
}

export function beginRegionalPromiseJourney(
  contract: ContractState,
  economy: WorldView,
): RegionalPromiseJourneyState {
  const originTileIndex = contractOriginTile(contract, economy);
  if (originTileIndex < 0) throw new RangeError("Promise origin is absent from the compatibility economy");
  return seal({
    contractId: contract.id,
    detoured: false,
    compatibilityTrace: [originTileIndex],
  });
}

/** Adopt the old finite journey without ever converting an invalid trace into credit. */
export function migrateRegionalPromiseJourney(
  player: PlayerState,
  economy: WorldView,
): RegionalPromiseJourneyState {
  if (player.activeContractId === null) return createRegionalPromiseJourney();
  const contract = economy.contracts.find(({ id }) => id === player.activeContractId);
  if (!contract || !validCompatibilityTrace(player.currentTrace, contract, economy, false)) {
    return detouredJourney(player.activeContractId);
  }
  return seal({
    contractId: contract.id,
    detoured: false,
    compatibilityTrace: player.currentTrace,
  });
}

export function restoreRegionalPromiseJourney(
  value: unknown,
  player: PlayerState,
  economy: WorldView,
  spatial: WorldView,
): RegionalPromiseJourneyState | null {
  if (!plainRecord(value) || !exactKeys(value, [
    "compatibilityTrace", "contractId", "detoured", "version",
  ])) return null;
  if (
    value.version !== REGIONAL_PROMISE_JOURNEY_VERSION
    || (value.contractId !== null && (!Number.isSafeInteger(value.contractId) || (value.contractId as number) <= 0))
    || typeof value.detoured !== "boolean"
    || !Array.isArray(value.compatibilityTrace)
  ) return null;
  const contractId = value.contractId as number | null;
  if (contractId !== player.activeContractId) return null;
  if (contractId === null) {
    return value.detoured === false && value.compatibilityTrace.length === 0
      ? createRegionalPromiseJourney()
      : null;
  }
  const contract = economy.contracts.find(({ id }) => id === contractId);
  if (!contract) return null;
  if (value.detoured) {
    return value.compatibilityTrace.length === 0 ? detouredJourney(contractId) : null;
  }
  if (!validCompatibilityTrace(value.compatibilityTrace, contract, economy, false)) return null;
  const current = currentCompatibilityTile(player, economy, spatial);
  if (current === null || value.compatibilityTrace.at(-1) !== current) return null;
  return seal({
    contractId,
    detoured: false,
    compatibilityTrace: value.compatibilityTrace as readonly number[],
  });
}

/** Record one accepted player position before or after a floating-origin recenter. */
export function advanceRegionalPromiseJourney(
  state: RegionalPromiseJourneyState,
  player: PlayerState,
  economy: WorldView,
  spatial: WorldView,
): RegionalPromiseJourneyState {
  if (player.activeContractId === null) return createRegionalPromiseJourney();
  if (state.contractId !== player.activeContractId) return detouredJourney(player.activeContractId);
  if (state.detoured) return state;
  const tileIndex = currentCompatibilityTile(player, economy, spatial);
  if (tileIndex === null) return detouredJourney(player.activeContractId);
  const trace = [...state.compatibilityTrace];
  const priorIndex = trace.lastIndexOf(tileIndex);
  if (priorIndex >= 0) trace.splice(priorIndex + 1);
  else trace.push(tileIndex);
  return seal({ contractId: state.contractId, detoured: false, compatibilityTrace: trace });
}

export function clearRegionalPromiseJourney(): RegionalPromiseJourneyState {
  return createRegionalPromiseJourney();
}

export function regionalPromiseDeliveryEvidence(
  state: RegionalPromiseJourneyState,
  contract: ContractState,
  economy: WorldView,
): {
  readonly routeEvidence: "compatibility-trace" | "regional-detour";
  readonly trace: readonly number[];
} {
  if (state.contractId !== contract.id || state.detoured) {
    return { routeEvidence: "regional-detour", trace: [] };
  }
  return validCompatibilityTrace(state.compatibilityTrace, contract, economy, true)
    ? { routeEvidence: "compatibility-trace", trace: state.compatibilityTrace }
    : { routeEvidence: "regional-detour", trace: [] };
}

function currentCompatibilityTile(
  player: PlayerState,
  economy: WorldView,
  spatial: WorldView,
): number | null {
  const address = regionalAddressAt(spatial, playerTileIndex(player));
  if (
    !address
    || address.region.x !== 0
    || address.region.y !== 0
    || address.localX >= economy.terrain.width
    || address.localY >= economy.terrain.height
  ) return null;
  return address.localY * economy.terrain.width + address.localX;
}

function validCompatibilityTrace(
  trace: readonly unknown[],
  contract: ContractState,
  economy: WorldView,
  requireDestination: boolean,
): trace is readonly number[] {
  if (
    trace.length === 0
    || trace.length > economy.terrain.tiles.length * 2
    || trace[0] !== contractOriginTile(contract, economy)
  ) return false;
  if (requireDestination && trace.at(-1) !== contractDestinationTile(contract, economy)) return false;
  for (let index = 0; index < trace.length; index += 1) {
    const tileIndex = trace[index];
    if (!Number.isSafeInteger(tileIndex) || !economy.terrain.tiles[tileIndex as number]) return false;
    if (index === 0) continue;
    const previous = economy.terrain.tiles[trace[index - 1] as number];
    const current = economy.terrain.tiles[tileIndex as number];
    if (!previous || !current || Math.max(
      Math.abs(previous.x - current.x),
      Math.abs(previous.y - current.y),
    ) !== 1) return false;
  }
  return true;
}

function contractOriginTile(contract: ContractState, economy: WorldView): number {
  return economy.settlements.find(({ id }) => id === contract.originSettlementId)?.tileIndex ?? -1;
}

function contractDestinationTile(contract: ContractState, economy: WorldView): number {
  return economy.settlements.find(({ id }) => id === contract.destinationSettlementId)?.tileIndex ?? -1;
}

function detouredJourney(contractId: number): RegionalPromiseJourneyState {
  return seal({ contractId, detoured: true, compatibilityTrace: [] });
}

function seal(
  value: Omit<RegionalPromiseJourneyState, "version">,
): RegionalPromiseJourneyState {
  return Object.freeze({
    version: REGIONAL_PROMISE_JOURNEY_VERSION,
    contractId: value.contractId,
    detoured: value.detoured,
    compatibilityTrace: Object.freeze([...value.compatibilityTrace]),
  });
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}
