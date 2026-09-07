import type {
  SettlementFoodStoreClosure,
  SettlementView,
} from "./types";

export interface VisibleSettlementFoodStore {
  readonly id: string;
  readonly closure: SettlementFoodStoreClosure;
  /** A structural cue shared by Chart and Relief: an open leaf is visibly ajar. */
  readonly doorAngle: number;
  /** A secured door is distinguished by geometry as well as color. */
  readonly hasCrossbar: boolean;
}

/**
 * Fail-closed presentation boundary for live settlement-store knowledge.
 * Callers must establish direct current perception; durable settlement memory
 * alone is never enough to reveal closure state.
 */
export const visibleSettlementFoodStore = (
  settlement: SettlementView,
  directlyVisible: boolean,
): VisibleSettlementFoodStore | null => {
  if (!directlyVisible || !settlement.foodStore) return null;
  return {
    id: settlement.foodStore.id,
    closure: settlement.foodStore.closure,
    doorAngle: settlement.foodStore.closure === "open" ? Math.PI * 0.34 : 0,
    hasCrossbar: settlement.foodStore.closure === "secured",
  };
};
