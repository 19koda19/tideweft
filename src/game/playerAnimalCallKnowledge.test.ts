import { describe, expect, it } from "vitest";

import {
  animalCallRecognitionForVocalization,
  canonicalizePlayerAnimalCallKnowledge,
  createPlayerAnimalCallKnowledge,
  getPlayerAnimalCallRecognition,
  PLAYER_ANIMAL_CALL_KNOWLEDGE_VERSION,
  rememberPlayerAnimalCall,
  type PlayerAnimalCallKnowledge,
  type SupportedAnimalCallVocalization,
} from "./playerAnimalCallKnowledge";
import type { SituatedExpressionEvent } from "./situatedExpression";

type Call = Pick<SituatedExpressionEvent, "meaning" | "vocalization">;

const CALLS = [
  ["guardian-dog-warning", "dog-warning-bark", "Dog"],
  ["guardian-dog-defensive-growl", "dog-defensive-growl", "Dog"],
  ["guardian-dog-shelter-whine", "dog-shelter-whine", "Dog"],
  ["domestic-cat-rain-distress-call", "domestic-cat-rain-distress", "Cat"],
  ["fish-crow-alarm-call", "fish-crow-alarm", "Fish crow"],
  ["deer-alarm-call", "deer-alarm-snort", "Deer"],
  ["gull-alarm-call", "gull-alarm-cry", "Gull"],
  ["elk-alarm-call", "elk-alarm-bark", "Elk"],
  ["wild-boar-alarm-call", "boar-grunt", "Wild boar"],
  ["domestic-chicken-alarm-call", "chicken-alarm-squawk", "Chicken"],
  ["american-black-duck-alarm-call", "duck-alarm-quack", "Duck"],
  ["domestic-goat-alarm-call", "goat-alarm-bleat", "Goat"],
  ["marsh-fox-pursuit-yip", "marsh-fox-pursuit-yip", "Fox"],
] as const;

const FOX: Call = { meaning: "marsh-fox-pursuit-yip", vocalization: "marsh-fox-pursuit-yip" };
const CROW: Call = { meaning: "fish-crow-alarm-call", vocalization: "fish-crow-alarm" };

function record(vocalization: SupportedAnimalCallVocalization = FOX.vocalization as SupportedAnimalCallVocalization,
  learnedAtTick = 420) {
  return { version: PLAYER_ANIMAL_CALL_KNOWLEDGE_VERSION, calls: [{ vocalization, learnedAtTick }] };
}

describe("player learned animal calls", () => {
  it("starts with no learned calls and does not infer knowledge from a lookup", () => {
    const empty = createPlayerAnimalCallKnowledge();
    expect(empty).toEqual({ version: 1, calls: [] });
    expect(Object.isFrozen(empty)).toBe(true);
    expect(Object.isFrozen(empty.calls)).toBe(true);
    expect(getPlayerAnimalCallRecognition(undefined, FOX)).toBeNull();
    expect(getPlayerAnimalCallRecognition(empty, FOX)).toBeNull();
    expect(animalCallRecognitionForVocalization("marsh-fox-pursuit-yip"))
      .toEqual({ vocalization: "marsh-fox-pursuit-yip", animalLabel: "Fox" });
    expect(empty.calls).toHaveLength(0);
  });

  it.each(CALLS)("learns the existing %s semantic pair without source identity", (meaning, vocalization, animalLabel) => {
    const event = { meaning, vocalization };
    const learned = rememberPlayerAnimalCall(undefined, event, 420);
    expect(learned).toEqual(record(vocalization));
    expect(getPlayerAnimalCallRecognition(learned ?? undefined, event)).toEqual({ vocalization, animalLabel });
    expect(Object.keys(getPlayerAnimalCallRecognition(learned ?? undefined, event)!))
      .toEqual(["vocalization", "animalLabel"]);
    expect(Object.isFrozen(animalCallRecognitionForVocalization(vocalization))).toBe(true);
  });

  it("preserves the first learning tick and all prior calls without mutating the input", () => {
    const original = rememberPlayerAnimalCall(undefined, FOX, 420)!;
    const repeated = rememberPlayerAnimalCall(original, FOX, 430)!;
    expect(repeated).toEqual(original);
    const next = rememberPlayerAnimalCall(repeated, CROW, 440)!;
    expect(next.calls).toEqual([
      { vocalization: "fish-crow-alarm", learnedAtTick: 440 },
      { vocalization: "marsh-fox-pursuit-yip", learnedAtTick: 420 },
    ]);
    expect(original).toEqual(record());
    expect(getPlayerAnimalCallRecognition(next, FOX)?.animalLabel).toBe("Fox");
    expect(getPlayerAnimalCallRecognition(next, CROW)?.animalLabel).toBe("Fish crow");
    expect(rememberPlayerAnimalCall(original, FOX, 419)).toBeNull();
  });

  it("canonicalizes detached sorted bounded copies and roundtrips exactly", () => {
    const raw = {
      version: 1,
      calls: [
        { vocalization: "marsh-fox-pursuit-yip", learnedAtTick: 420 },
        { vocalization: "fish-crow-alarm", learnedAtTick: 421 },
      ],
    };
    const canonical = canonicalizePlayerAnimalCallKnowledge(raw, 421)!;
    expect(canonical.calls.map(({ vocalization }) => vocalization)).toEqual(["fish-crow-alarm", "marsh-fox-pursuit-yip"]);
    expect(canonical).not.toBe(raw);
    expect(canonical.calls[1]).not.toBe(raw.calls[0]);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.calls)).toBe(true);
    expect(canonical.calls.every(Object.isFrozen)).toBe(true);
    raw.calls[0]!.learnedAtTick = 1;
    expect(canonical.calls[1]!.learnedAtTick).toBe(420);
    expect(canonicalizePlayerAnimalCallKnowledge(JSON.parse(JSON.stringify(canonical)), 421)).toEqual(canonical);

    let all = createPlayerAnimalCallKnowledge();
    for (const [meaning, vocalization] of CALLS) {
      all = rememberPlayerAnimalCall(all, { meaning, vocalization }, 421)!;
    }
    expect(all.calls).toHaveLength(13);
    expect(canonicalizePlayerAnimalCallKnowledge(all, 421)).toEqual(all);
  });

  it.each([
    undefined, null, [], {}, { version: 1 }, { calls: [] },
    { version: 2, calls: [] }, { version: "1", calls: [] },
    { version: 1, calls: undefined }, { version: 1, calls: null },
    { version: 1, calls: [], sourceActorId: "hidden" },
    { version: 1, calls: [{ vocalization: "marsh-fox-pursuit-yip" }] },
    { version: 1, calls: [{ learnedAtTick: 420 }] },
    { version: 1, calls: [{ vocalization: "marsh-fox-pursuit-yip", learnedAtTick: 420, sourceActorId: "hidden" }] },
    { version: 1, calls: [{ vocalization: "steady", learnedAtTick: 420 }] },
    { version: 1, calls: [{ vocalization: "marsh-rabbit-alarm-thump", learnedAtTick: 420 }] },
    { version: 1, calls: [{ vocalization: "frog-chorus", learnedAtTick: 420 }] },
    { version: 1, calls: [{ vocalization: "future-fox-call", learnedAtTick: 420 }] },
    { version: 1, calls: [null] },
  ])("rejects malformed or unsupported present records: %j", (value) => {
    expect(canonicalizePlayerAnimalCallKnowledge(value, 420)).toBeNull();
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "420", undefined, null])
  ("rejects invalid learned ticks: %s", (learnedAtTick) => {
    expect(canonicalizePlayerAnimalCallKnowledge({
      version: 1, calls: [{ vocalization: "fish-crow-alarm", learnedAtTick }],
    })).toBeNull();
  });

  it("rejects future observations and invalid completed ticks", () => {
    expect(canonicalizePlayerAnimalCallKnowledge(record(), 419)).toBeNull();
    expect(canonicalizePlayerAnimalCallKnowledge(record(), 420)).not.toBeNull();
    expect(canonicalizePlayerAnimalCallKnowledge(record("fish-crow-alarm", 0), 0)).not.toBeNull();
    for (const tick of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(canonicalizePlayerAnimalCallKnowledge(record(), tick)).toBeNull();
      expect(rememberPlayerAnimalCall(undefined, FOX, tick)).toBeNull();
    }
  });

  it("rejects duplicate, oversized, sparse, decorated and accessor containers", () => {
    const entry = record().calls[0]!;
    expect(canonicalizePlayerAnimalCallKnowledge({ version: 1, calls: [entry, entry] })).toBeNull();
    expect(canonicalizePlayerAnimalCallKnowledge({ version: 1, calls: Array(14).fill(entry) })).toBeNull();
    expect(canonicalizePlayerAnimalCallKnowledge({ version: 1, calls: new Array(1) })).toBeNull();
    const decorated = [entry];
    Object.defineProperty(decorated, "extra", { value: true });
    expect(canonicalizePlayerAnimalCallKnowledge({ version: 1, calls: decorated })).toBeNull();
    const symbolRecord = { ...record(), [Symbol("hidden")]: "secret" };
    expect(canonicalizePlayerAnimalCallKnowledge(symbolRecord)).toBeNull();
    const accessorRecord = Object.defineProperty({ version: 1 }, "calls", {
      enumerable: true, get: () => { throw new Error("must not invoke an accessor"); },
    });
    expect(canonicalizePlayerAnimalCallKnowledge(accessorRecord)).toBeNull();
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, "0", {
      enumerable: true, get: () => { throw new Error("must not invoke an accessor"); },
    });
    expect(canonicalizePlayerAnimalCallKnowledge({ version: 1, calls: accessorArray })).toBeNull();
    expect(canonicalizePlayerAnimalCallKnowledge(Object.create(record()))).toBeNull();
  });

  it("rejects crossed meanings, body signals, human sounds and unknown vocabulary", () => {
    const learned = rememberPlayerAnimalCall(undefined, FOX, 420)!;
    const unsupported: Call[] = [
      { meaning: "fish-crow-alarm-call", vocalization: "marsh-fox-pursuit-yip" },
      { meaning: "guardian-dog-warning", vocalization: "dog-defensive-growl" },
      { meaning: "marsh-rabbit-alarm-thump", vocalization: "marsh-rabbit-alarm-thump" },
      { meaning: "human-danger-warning", vocalization: "alarm" },
      { meaning: "marsh-fox-pursuit-yip", vocalization: "future-fox-call" as SituatedExpressionEvent["vocalization"] },
    ];
    for (const event of unsupported) {
      expect(rememberPlayerAnimalCall(learned, event, 421)).toBeNull();
      expect(getPlayerAnimalCallRecognition(learned, event)).toBeNull();
    }
    expect(animalCallRecognitionForVocalization("future-fox-call" as SupportedAnimalCallVocalization)).toBeNull();
    expect(learned).toEqual(record());
  });

  it("fails closed on malformed existing memory instead of replacing it with new knowledge", () => {
    const malformed = { ...record(), version: 2 } as unknown as PlayerAnimalCallKnowledge;
    expect(rememberPlayerAnimalCall(malformed, CROW, 421)).toBeNull();
    expect(getPlayerAnimalCallRecognition(malformed, FOX)).toBeNull();
    expect(rememberPlayerAnimalCall(null as unknown as PlayerAnimalCallKnowledge, FOX, 421)).toBeNull();
  });
});
