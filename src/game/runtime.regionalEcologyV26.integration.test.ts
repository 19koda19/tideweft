import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { deserializeWorld } from "../sim/public";
import { stableStringify } from "../sim/util";
import { CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS } from "./coreEcology";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { serializeRegionalEcologyState } from "./regionalEcologyState";
import { restorePlayerRegionalTravel } from "./regionalPlayerTravel";
import {
  deserializeRegionalEcologyStateV2,
  projectRegionalEcologyStateV2ActiveState,
  serializeRegionalEcologyStateV2,
  type RegionalEcologyStateV2,
} from "./regionalEcologyStateV2";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";

export const ALPHA33_ALPINE_RUNTIME_V26_OWNER_INTENT =
  "test:alpha33-alpine-runtime-v26:v1" as const;
export const ALPHA33_ALPINE_PERFORMANCE_OWNER_INTENT =
  "test:alpha33-alpine-performance:v1" as const;

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

interface CurrentEnvelope {
  readonly format: "tideweft-session";
  readonly version: 26;
  readonly world: string;
  readonly player: Parameters<typeof restorePlayerRegionalTravel>[1];
  readonly regionalTravel: string;
  readonly regionalEcology: string;
  readonly integrity: string;
}

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {}

  async list() { return []; }
  async load(slotId: string) {
    return slotId === "autosave" && this.record !== undefined
      ? structuredClone(this.record)
      : undefined;
  }
  async save(record: SaveRecord) { this.record = structuredClone(record); }
  async remove() { this.record = undefined; }

  snapshot(): SaveRecord {
    if (this.record === undefined) throw new Error("v26 runtime fixture has no autosave");
    return structuredClone(this.record);
  }
}

let fixtureRecord: SaveRecord;
let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime = 100;

beforeAll(async () => {
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const repository = new MemoryRepository();
  const runtime = await createTideweftRuntime(repository);
  runtime.dispatchUI({
    type: "new-world",
    seed: "alpine resident property",
    posture: "gale",
    sessionShape: "wander",
  });
  await runtime.save();
  runtime.destroy();
  fixtureRecord = repository.snapshot();
}, 60_000);

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe(`${ALPHA33_ALPINE_RUNTIME_V26_OWNER_INTENT} runtime Wave-F regional ecology v26 boundary`, () => {
  it(`${ALPHA33_ALPINE_PERFORMANCE_OWNER_INTENT} writes one exact composite owner and enforces one global materialization cap`, () => {
    const envelope = requireCurrent(fixtureRecord);
    const state = requireState(envelope);
    expect(Object.hasOwn(envelope, "coreEcology")).toBe(false);
    expect(state.adoption).toBeNull();
    expect(state.base.root.adoption).toBeNull();
    expect(state.alpineActiveResidents.length).toBeGreaterThan(0);

    const world = deserializeWorld(envelope.world);
    const travel = restorePlayerRegionalTravel(
      world.meta.rootSeed,
      envelope.player,
      envelope.regionalTravel,
    );
    if (travel === null) throw new Error("v26 fixture lost its regional window");
    const projection = projectRegionalEcologyStateV2ActiveState(state, {
      origin: travel.window.origin,
      terrain: travel.window.terrain,
    });
    if (projection === null) throw new Error("v26 fixture did not project");
    const sources = [...projection.base.residents, ...projection.alpineResidents];
    const materialized = sources.reduce((count, source) => count + source.patch.populations
      .flatMap(({ members }) => members)
      .filter(({ materialization }) => materialization === "materialized").length, 0);
    expect(materialized).toBeLessThanOrEqual(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS);
    expect(projection.alpineResidents.some(({ patch }) => patch.populations.some((population) => (
      population.species === "golden-eagle"
      && population.members.some(({ materialization }) => materialization === "materialized")
    )))).toBe(true);
    expect(projection.alpineResidents.some(({ patch }) => patch.aggregatePopulations.some((population) => (
      population.species === "american-pika"
      && population.evidence.some(({ kind }) => kind === "haypile" || kind === "talus-sign")
    )))).toBe(true);
    expect(serializeRegionalEcologyStateV2(state)).toBe(envelope.regionalEcology);
  });

  it("authenticates an exact v25 child before wrapping it with raw envelope provenance", async () => {
    const current = requireCurrent(fixtureRecord);
    const currentState = requireState(current);
    const { integrity: _integrity, ...shared } = current as unknown as Readonly<Record<string, unknown>>;
    const v25Base = {
      ...shared,
      version: 25,
      regionalEcology: serializeRegionalEcologyState(currentState.base),
    };
    const v25Integrity = gameSaveEnvelopeIntegrity(v25Base);
    const v25Record: SaveRecord = {
      ...fixtureRecord,
      payloadVersion: 25,
      worldJson: JSON.stringify({ ...v25Base, integrity: v25Integrity }),
    };
    const repository = new MemoryRepository(v25Record);
    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    await runtime.save();
    runtime.destroy();

    const migrated = requireState(requireCurrent(repository.snapshot()));
    expect(migrated.adoption).toMatchObject({
      sourceOuterVersion: 25,
      sourceEnvelopeIntegrity: v25Integrity,
      sourceStateIntegrity: currentState.base.integrity,
    });
    expect(migrated.base).toEqual(currentState.base);
  }, 60_000);

  it(`${ALPHA33_ALPINE_PERFORMANCE_OWNER_INTENT} advances Alpine individual and pika aggregate owners within the runtime budget through one shared tick and reload`, async () => {
    const before = requireState(requireCurrent(fixtureRecord));
    const beforeAlpine = alpineSpecies(before);
    expect(beforeAlpine.has("golden-eagle")).toBe(true);
    expect(beforeAlpine.has("american-pika")).toBe(true);

    const repository = new MemoryRepository(fixtureRecord);
    const runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 10);
    await runtime.save();
    runtime.destroy();
    const afterEnvelope = requireCurrent(repository.snapshot());
    const after = requireState(afterEnvelope);
    expect(after.updatedAtTick).toBe(before.updatedAtTick + 1);
    expect(after.alpineActiveResidents.every(({ patch }) => (
      patch.updatedAtTick === after.updatedAtTick
      && patch.aggregatePopulations.every(({ updatedAtTick }) => (
        updatedAtTick === after.updatedAtTick
      ))
    ))).toBe(true);
    expect(alpineSpecies(after)).toEqual(beforeAlpine);

    const reloaded = await createTideweftRuntime(repository);
    await reloaded.save();
    reloaded.destroy();
    expect(requireCurrent(repository.snapshot()).regionalEcology)
      .toBe(afterEnvelope.regionalEcology);
  }, 60_000);

  it("quarantines an outer-resealed save whose Alpine child was altered", async () => {
    const envelope = requireCurrent(fixtureRecord);
    const parsed = JSON.parse(envelope.regionalEcology) as Record<string, unknown>;
    const alpine = structuredClone(parsed.alpineActiveResidents) as Array<Record<string, unknown>>;
    if (alpine[0] === undefined) throw new Error("v26 tamper fixture needs Alpine state");
    alpine[0] = { ...alpine[0], sourceKey: `${String(alpine[0].sourceKey)}:forged` };
    const { integrity: _integrity, ...shared } = envelope as unknown as Readonly<Record<string, unknown>>;
    const forgedBase = {
      ...shared,
      regionalEcology: stableStringify({ ...parsed, alpineActiveResidents: alpine }),
    };
    const forged: SaveRecord = {
      ...fixtureRecord,
      worldJson: JSON.stringify({
        ...forgedBase,
        integrity: gameSaveEnvelopeIntegrity(forgedBase),
      }),
    };
    const runtime = await createTideweftRuntime(new MemoryRepository(forged));
    expect(runtime.getUIView().saveWarning).toBeDefined();
    runtime.destroy();
  }, 60_000);
});

function advancePlayerSteps(runtime: TideweftRuntime, count: number): void {
  scheduledFrame = undefined;
  nextFrameTime = 100;
  runtime.start();
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame as ((now: number) => void) | undefined;
    if (callback === undefined) throw new Error("v26 runtime stopped scheduling frames");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
  runtime.stop();
}

function requireCurrent(record: SaveRecord): CurrentEnvelope {
  const value = JSON.parse(record.worldJson) as CurrentEnvelope;
  if (
    value.format !== "tideweft-session"
    || value.version !== 26
    || record.payloadVersion !== 26
    || typeof value.regionalEcology !== "string"
  ) throw new Error("runtime fixture did not produce a v26 envelope");
  const { integrity, ...base } = value;
  if (integrity !== gameSaveEnvelopeIntegrity(base as Readonly<Record<string, unknown>>)) {
    throw new Error("v26 envelope integrity did not authenticate");
  }
  return value;
}

function requireState(envelope: CurrentEnvelope): RegionalEcologyStateV2 {
  const state = deserializeRegionalEcologyStateV2(envelope.regionalEcology);
  if (state === null) throw new Error("v26 regional ecology did not deserialize");
  return state;
}

function alpineSpecies(state: RegionalEcologyStateV2): ReadonlySet<string> {
  return new Set(state.alpineActiveResidents.flatMap(({ patch }) => [
    ...patch.populations.map(({ species }) => species),
    ...patch.aggregatePopulations.map(({ species }) => species),
  ]));
}
