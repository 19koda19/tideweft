import type { WildlifeView } from "./types";
import { isWildlifeVisualSpecies, wildlifeVisualProfile } from "./wildlifeVisualProfile";

/** Shared Chart/Relief suffix for an already knowledge-filtered visible count. */
export function visibleWildlifeGroupSuffix(
  wildlife: Pick<WildlifeView, "species" | "groupSize">,
): string {
  if (!isWildlifeVisualSpecies(wildlife.species)) return "";
  const form = wildlifeVisualProfile(wildlife.species).form;
  if (
    (form !== "shorebird-flock" && form !== "corvid-flock")
    || !Number.isSafeInteger(wildlife.groupSize)
    || (wildlife.groupSize ?? 0) <= 1
  ) return "";
  return ` · ~${Math.min(999, wildlife.groupSize ?? 2)} visible`;
}
