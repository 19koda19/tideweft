import type { AcousticTextView } from "./types";

export type AnimalCallTextMode = "full" | "important";
export const ANIMAL_CALL_TEXT_STORAGE_KEY = "tideweft:animal-call-text:v1";

export interface AnimalCallTextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function resolveStorage(storage: AnimalCallTextStorage | null | undefined): AnimalCallTextStorage | null {
  return storage === undefined ? globalThis.localStorage ?? null : storage;
}

/** Browser preference only: never a world-save field or a hearing override. */
export function loadAnimalCallTextMode(storage?: AnimalCallTextStorage | null): AnimalCallTextMode {
  try {
    return resolveStorage(storage)?.getItem(ANIMAL_CALL_TEXT_STORAGE_KEY) === "important"
      ? "important" : "full";
  } catch {
    return "full";
  }
}

export function saveAnimalCallTextMode(
  mode: AnimalCallTextMode,
  storage?: AnimalCallTextStorage | null,
): boolean {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    target.setItem(ANIMAL_CALL_TEXT_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

/** Unknown legacy/fixture importance stays visible; never guess from glyphs. */
export function shouldShowAnimalCallLabel(candidate: AcousticTextView, mode: AnimalCallTextMode): boolean {
  return mode !== "important" || candidate.acousticKind !== "animal-call"
    || candidate.criticalCall !== false;
}
