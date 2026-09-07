import type { WildlifeView } from "./types";

const SHOW_VISIBLE_GROUP_COUNT = Object.freeze({
  deer: false,
  gull: true,
  "black-bear": false,
  "domestic-cat": false,
  "marsh-rabbit": false,
  "marsh-fox": false,
  "fish-crow": true,
  "northern-harrier": false,
  "snowy-egret": false,
  "american-black-duck": false,
  "domestic-chicken": false,
  "domestic-goat": false,
  "north-american-river-otter": false,
} satisfies Readonly<Record<WildlifeView["species"], boolean>>);

/** Shared Chart/Relief suffix for an already knowledge-filtered visible count. */
export function visibleWildlifeGroupSuffix(
  wildlife: Pick<WildlifeView, "species" | "groupSize">,
): string {
  if (
    !SHOW_VISIBLE_GROUP_COUNT[wildlife.species]
    || !Number.isSafeInteger(wildlife.groupSize)
    || (wildlife.groupSize ?? 0) <= 1
  ) return "";
  return ` · ~${Math.min(999, wildlife.groupSize ?? 2)} visible`;
}
