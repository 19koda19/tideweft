import { describe, expect, it, vi } from "vitest";

import {
  ANIMAL_CALL_TEXT_STORAGE_KEY,
  loadAnimalCallTextMode,
  saveAnimalCallTextMode,
  shouldShowAnimalCallLabel,
  type AnimalCallTextStorage,
} from "./animalCallText";
import type { AcousticTextView, SituatedExpressionView } from "./types";

class MemoryStorage implements AnimalCallTextStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function withGlobalStorage(descriptor: PropertyDescriptor, assertion: () => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { ...descriptor, configurable: true });
  try { assertion(); }
  finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", previous);
  }
}

const call = (overrides: Partial<SituatedExpressionView> = {}): SituatedExpressionView => ({
  acousticKind: "animal-call",
  id: "visible-call",
  sourceActorId: "dog:visible",
  sourceKind: "animal",
  speakerLabel: "A dog",
  text: "WHINE.",
  position: { x: 100, y: 100 },
  progress: 0.25,
  priority: 740_000,
  salience: 650_000,
  tone: "restrained",
  variantSeed: 7,
  ...overrides,
});

describe("animal-call text presentation preference", () => {
  it("defaults to full for absent storage or an absent record", () => {
    expect(loadAnimalCallTextMode(null)).toBe("full");
    expect(loadAnimalCallTextMode(new MemoryStorage())).toBe("full");
    withGlobalStorage({ value: undefined }, () => {
      expect(loadAnimalCallTextMode()).toBe("full");
      expect(saveAnimalCallTextMode("important")).toBe(false);
    });
    expect(saveAnimalCallTextMode("full", null)).toBe(false);
    expect(saveAnimalCallTextMode("important", null)).toBe(false);
  });

  it("loads and saves the exact full or important value under only its own namespace", () => {
    expect(ANIMAL_CALL_TEXT_STORAGE_KEY).toBe("tideweft:animal-call-text:v1");
    const storage = new MemoryStorage();
    storage.setItem("tideweft:view-mode:v1", "relief-3d");
    for (const mode of ["important", "full"] as const) {
      expect(saveAnimalCallTextMode(mode, storage)).toBe(true);
      expect(storage.getItem(ANIMAL_CALL_TEXT_STORAGE_KEY)).toBe(mode);
      expect(loadAnimalCallTextMode(storage)).toBe(mode);
    }
    expect(storage.values).toEqual(new Map([
      ["tideweft:view-mode:v1", "relief-3d"], [ANIMAL_CALL_TEXT_STORAGE_KEY, "full"],
    ]));
    const getItem = vi.fn(() => "important");
    const setItem = vi.fn();
    expect(loadAnimalCallTextMode({ getItem, setItem })).toBe("important");
    expect(getItem.mock.calls).toEqual([[ANIMAL_CALL_TEXT_STORAGE_KEY]]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("uses available browser storage only when no explicit storage is supplied", () => {
    const storage = new MemoryStorage();
    withGlobalStorage({ value: storage }, () => {
      expect(saveAnimalCallTextMode("important")).toBe(true);
      expect(loadAnimalCallTextMode()).toBe("important");
      expect(loadAnimalCallTextMode(null)).toBe("full");
      expect(saveAnimalCallTextMode("full", null)).toBe(false);
      expect(loadAnimalCallTextMode()).toBe("important");
    });
  });

  it("falls back to full rather than parsing or guessing malformed persisted values", () => {
    for (const value of [
      "", "IMPORTANT", " important", "important ", "minimal", "false", '"important"',
      '{"mode":"important"}', null, 0, false, {}, [],
    ]) {
      const storage: AnimalCallTextStorage = {
        getItem: () => value as string | null,
        setItem: vi.fn(),
      };
      expect(loadAnimalCallTextMode(storage)).toBe("full");
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });

  it("swallows denied storage reads and writes without changing the fallback", () => {
    const denied: AnimalCallTextStorage = {
      getItem: vi.fn(() => { throw new Error("read denied"); }),
      setItem: vi.fn(() => { throw new Error("write denied"); }),
    };
    expect(loadAnimalCallTextMode(denied)).toBe("full");
    expect(saveAnimalCallTextMode("important", denied)).toBe(false);
    expect(denied.getItem).toHaveBeenCalledWith(ANIMAL_CALL_TEXT_STORAGE_KEY);
    expect(denied.setItem).toHaveBeenCalledWith(ANIMAL_CALL_TEXT_STORAGE_KEY, "important");
  });

  it("swallows a throwing browser-storage getter and does not read it for explicit storage", () => {
    const read = vi.fn(() => { throw new Error("browser storage unavailable"); });
    withGlobalStorage({ get: read }, () => {
      expect(loadAnimalCallTextMode()).toBe("full");
      expect(saveAnimalCallTextMode("important")).toBe(false);
      expect(read).toHaveBeenCalledTimes(2);
      const storage = new MemoryStorage();
      expect(loadAnimalCallTextMode(storage)).toBe("full");
      expect(saveAnimalCallTextMode("important", storage)).toBe(true);
      expect(loadAnimalCallTextMode(null)).toBe("full");
      expect(saveAnimalCallTextMode("full", null)).toBe(false);
      expect(read).toHaveBeenCalledTimes(2);
    });
  });
});

describe("animal-call world-label filtering", () => {
  it("keeps all current labels in full mode and unknown legacy importance in important mode", () => {
    for (const candidate of [call(), call({ criticalCall: false }), call({ criticalCall: true })]) {
      expect(shouldShowAnimalCallLabel(candidate, "full")).toBe(true);
    }
    expect(shouldShowAnimalCallLabel(call(), "important")).toBe(true);
    expect(shouldShowAnimalCallLabel(call({ criticalCall: true }), "important")).toBe(true);
    expect(shouldShowAnimalCallLabel(call({ criticalCall: false }), "important")).toBe(false);
  });

  it("uses explicit importance rather than misleading wording, tone or numeric rank", () => {
    expect(shouldShowAnimalCallLabel(call({
      criticalCall: false, text: "BARK! DANGER!", tone: "alarmed",
      priority: Number.MAX_SAFE_INTEGER, salience: Number.MAX_SAFE_INTEGER,
    }), "important")).toBe(false);
    expect(shouldShowAnimalCallLabel(call({
      criticalCall: true, text: "whine", tone: "restrained", priority: 0, salience: 0,
    }), "important")).toBe(true);
  });

  it("does not suppress speech, embodied signals or physical labels", () => {
    const candidates: AcousticTextView[] = [
      call({ acousticKind: "speech", sourceKind: "human", criticalCall: false }),
      call({ acousticKind: "embodied-signal", criticalCall: false }),
      {
        acousticKind: "physical", id: "physical-contact", sourceId: "object:visible",
        sourceKind: "object", text: "thud", position: { x: 100, y: 100 }, progress: 0.25,
        priority: 0, salience: 0, tone: "restrained", variantSeed: 7, semanticFamily: "thud",
      },
    ];
    for (const candidate of candidates) {
      expect(shouldShowAnimalCallLabel(candidate, "important")).toBe(true);
      expect(shouldShowAnimalCallLabel(candidate, "full")).toBe(true);
    }
  });

  it("does not mutate frozen candidates or accumulate a new presentation state", () => {
    const candidate = Object.freeze({
      ...call({ criticalCall: false }), position: Object.freeze({ x: 100, y: 100 }),
    });
    const before = structuredClone(candidate);
    expect(shouldShowAnimalCallLabel(candidate, "important")).toBe(false);
    expect(shouldShowAnimalCallLabel(candidate, "full")).toBe(true);
    expect(shouldShowAnimalCallLabel(candidate, "important")).toBe(false);
    expect(candidate).toEqual(before);
  });
});
