import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  deserializeWorld,
  serializeWorld,
} from "../sim/public";
import { createPlayer } from "./player";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import {
  playerWorldPositionInRegionalWindow,
  resolveResidentWorldPlacement,
} from "./residentSpatial";
import { restorePlayerRegionalTravel } from "./regionalPlayerTravel";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import { createSessionState } from "./sessionTypes";

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

class MemoryRepository implements SaveRepository {
  constructor(private record?: SaveRecord) {}

  async list() {
    return [];
  }

  async load(slotId: string) {
    return slotId === "autosave" && this.record
      ? structuredClone(this.record)
      : undefined;
  }

  async save(record: SaveRecord) {
    this.record = structuredClone(record);
  }

  async remove() {
    this.record = undefined;
  }

  snapshot(): SaveRecord {
    if (!this.record) throw new Error("test repository has no autosave");
    return structuredClone(this.record);
  }

  replace(record: SaveRecord): void {
    this.record = structuredClone(record);
  }
}

interface TestGameSaveEnvelope {
  readonly version: number;
  readonly world: string;
  readonly player: ReturnType<typeof createPlayer>;
  readonly regionalTravel?: string;
  readonly perceptionCarry?: {
    readonly version: number;
    readonly playerStepsSinceWorldTick: number;
    readonly playerSenseSamples: readonly { readonly sampleOrdinal: number }[];
    readonly nextPlayerSenseSampleOrdinal: number;
  };
}

let scheduledFrame: ((now: number) => void) | undefined;

beforeEach(() => {
  scheduledFrame = undefined;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
    scheduledFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runtime existing-human perception path", () => {
  it("turns ordinary player steps into saved human knowledge and a visible watching state", async () => {
    const fixture = perceptionFixture("runtime perception handoff");
    const repository = new MemoryRepository(fixture.record);
    const runtime = await createTideweftRuntime(repository);

    expect(runtime.getRenderView().porters.find(({ id }) => id === fixture.residentId))
      .toMatchObject({ state: "waiting" });

    advancePlayerSteps(runtime, 10);

    const visible = runtime.getRenderView().porters.find(({ id }) => id === fixture.residentId);
    expect(visible).toMatchObject({
      state: "watching",
      quickLabel: expect.stringContaining("watching you"),
      emotionMark: ":|",
    });

    await runtime.save();
    const committedWorld = savedWorld(repository);
    expect(committedWorld.residents).toHaveLength(42);
    expect(committedWorld.residents.every(({ perception }) => perception.tick === 1)).toBe(true);
    const resident = committedWorld.residents.find(
      ({ id }) => String(id) === fixture.residentId,
    );
    expect(resident?.perception).toMatchObject({
      tick: 1,
      suspicion: "identified",
      search: null,
    });
    expect(resident?.perception.beliefs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: "vision",
        subjectId: "player:local",
        identification: "identified",
        sourceObservationId: expect.stringMatching(/^hp-v-1-\d+-p-0-\d+$/u),
      }),
    ]));
    runtime.destroy();
  });

  it("restores committed perception through the ordinary outer save and reload path", async () => {
    const fixture = perceptionFixture("runtime perception reload");
    const repository = new MemoryRepository(fixture.record);
    const first = await createTideweftRuntime(repository);
    advancePlayerSteps(first, 10);
    await first.save();
    const beforeReload = savedResidentPerception(repository, fixture.residentId);
    first.destroy();

    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    expect(resumed.getRenderView().porters.find(({ id }) => id === fixture.residentId))
      .toMatchObject({ state: "watching" });

    await resumed.save();
    expect(savedResidentPerception(repository, fixture.residentId)).toEqual(beforeReload);
    resumed.destroy();
  });

  it("keeps an identified walking player's last-known point at the latest sampled position", async () => {
    const fixture = perceptionFixture("runtime perception latest point");
    const repository = new MemoryRepository(fixture.record);
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
    advancePlayerSteps(runtime, 20);
    runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    await runtime.save();

    const envelope = savedEnvelope(repository);
    const saved = deserializeWorld(envelope.world);
    if (!envelope.regionalTravel) throw new Error("current runtime save omitted regional travel");
    const player = structuredClone(envelope.player);
    const travel = restorePlayerRegionalTravel(saved.meta.rootSeed, player, envelope.regionalTravel);
    if (!travel) throw new Error("current runtime save did not restore its spatial frame");
    const playerPosition = playerWorldPositionInRegionalWindow(travel.window, player);
    if (!playerPosition) throw new Error("saved player did not have a canonical world position");
    const perception = saved.residents.find(({ id }) => String(id) === fixture.residentId)?.perception;
    const playerBelief = perception?.beliefs.find(({ subjectId }) => subjectId === "player:local");

    expect(playerBelief?.lastObservedTick).toBe(2);
    expect(playerBelief?.area).toEqual({ center: playerPosition, radiusUnits: 0 });
    runtime.destroy();
  });

  it("commits the same cognition after a ninth-substep save/reload as uninterrupted play", async () => {
    const referenceFixture = perceptionFixture("runtime perception interrupted interval");
    const interruptedFixture = perceptionFixture("runtime perception interrupted interval");
    const referenceRepository = new MemoryRepository(referenceFixture.record);
    const interruptedRepository = new MemoryRepository(interruptedFixture.record);
    const reference = await createTideweftRuntime(referenceRepository);
    const interrupted = await createTideweftRuntime(interruptedRepository);

    for (const runtime of [reference, interrupted]) {
      runtime.dispatchRenderer({ type: "movement", vector: { x: 1, y: 0 } });
      advancePlayerSteps(runtime, 9);
      runtime.dispatchRenderer({ type: "movement", vector: { x: 0, y: 0 } });
    }
    await interrupted.save();
    const pending = savedEnvelope(interruptedRepository);
    expect(pending).toMatchObject({
      version: 8,
      perceptionCarry: {
        version: 1,
        playerStepsSinceWorldTick: 9,
        nextPlayerSenseSampleOrdinal: 9,
      },
    });
    expect(pending.perceptionCarry?.playerSenseSamples.map(({ sampleOrdinal }) => sampleOrdinal))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    interrupted.destroy();

    advancePlayerSteps(reference, 1);
    await reference.save();
    const uninterruptedPerception = savedResidentPerception(
      referenceRepository,
      referenceFixture.residentId,
    );
    reference.destroy();

    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(interruptedRepository);
    advancePlayerSteps(resumed, 1);
    await resumed.save();
    expect(savedResidentPerception(interruptedRepository, interruptedFixture.residentId))
      .toEqual(uninterruptedPerception);
    expect(savedEnvelope(interruptedRepository).perceptionCarry).toMatchObject({
      playerStepsSinceWorldTick: 0,
      playerSenseSamples: [],
      nextPlayerSenseSampleOrdinal: 0,
    });
    resumed.destroy();
  });

  it("migrates a sealed v4 regional save to an empty v8 perception interval", async () => {
    const fixture = perceptionFixture("runtime perception v4 migration");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();

    const current = repository.snapshot();
    const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
    const {
      integrity: _currentIntegrity,
      perceptionCarry: _currentPerceptionCarry,
      bio0Ecology: _currentBio0Ecology,
      coreEcology: _currentCoreEcology,
      porterResponse: _currentPorterResponse,
      livingActorPlayerChoice: _currentLivingActorPlayerChoice,
      ...currentBase
    } = decoded;
    const v4Base = { ...currentBase, version: 4 };
    repository.replace({
      ...current,
      payloadVersion: 4,
      updatedAt: current.updatedAt + 1,
      worldJson: JSON.stringify({
        ...v4Base,
        integrity: gameSaveEnvelopeIntegrity(v4Base),
      }),
    });

    const migrated = await createTideweftRuntime(repository);
    await migrated.save();
    expect(savedEnvelope(repository)).toMatchObject({
      version: 8,
      perceptionCarry: {
        version: 1,
        playerStepsSinceWorldTick: 0,
        playerSenseSamples: [],
        nextPlayerSenseSampleOrdinal: 0,
      },
    });
    migrated.destroy();
  });

  it.each([
    {
      label: "an extra carry field",
      tamper(envelope: Record<string, unknown>) {
        currentPerceptionCarry(envelope).unexpected = true;
      },
    },
    {
      label: "a discontinuous next ordinal",
      tamper(envelope: Record<string, unknown>) {
        currentPerceptionCarry(envelope).nextPlayerSenseSampleOrdinal = 2;
      },
    },
    {
      label: "a latest sample detached from the saved player",
      tamper(envelope: Record<string, unknown>) {
        const carry = currentPerceptionCarry(envelope);
        const samples = carry.playerSenseSamples;
        if (!Array.isArray(samples)) throw new Error("fixture carry omitted its samples");
        const latest = samples.at(-1);
        if (!latest || typeof latest !== "object" || Array.isArray(latest)) {
          throw new Error("fixture carry omitted its latest sample");
        }
        const position = (latest as Record<string, unknown>).position;
        if (!position || typeof position !== "object" || Array.isArray(position)) {
          throw new Error("fixture sample omitted its position");
        }
        const mutablePosition = position as Record<string, unknown>;
        if (typeof mutablePosition.localX !== "number") {
          throw new Error("fixture sample omitted local X");
        }
        mutablePosition.localX += 1;
      },
    },
  ])("rejects a resealed v8 save with $label", async ({ tamper }) => {
    const fixture = perceptionFixture("runtime perception corrupt carry");
    const repository = new MemoryRepository(fixture.record);
    const setup = await createTideweftRuntime(repository);
    advancePlayerSteps(setup, 3);
    await setup.save();
    setup.destroy();
    resealCurrentEnvelope(repository, tamper);

    scheduledFrame = undefined;
    const rejected = await createTideweftRuntime(repository);
    expect(rejected.getUIView().saveWarning?.message).toBe("LOCAL AUTOSAVE UNREADABLE");
    rejected.destroy();
  });

  it("clears a partial perception interval when an existing world is replaced", async () => {
    const fixture = perceptionFixture("runtime perception replacement reset");
    const repository = new MemoryRepository(fixture.record);
    const runtime = await createTideweftRuntime(repository);
    advancePlayerSteps(runtime, 5);
    await runtime.save();
    expect(savedEnvelope(repository).perceptionCarry).toMatchObject({
      playerStepsSinceWorldTick: 5,
      nextPlayerSenseSampleOrdinal: 5,
    });

    runtime.dispatchUI({
      type: "new-world",
      seed: "runtime perception replacement world",
      posture: "gale",
      sessionShape: "wander",
      restartPhrase: "restartrestartrestart",
    });
    await runtime.save();

    expect(savedWorld(repository).meta.seedText).toBe("runtime perception replacement world");
    expect(savedEnvelope(repository).perceptionCarry).toMatchObject({
      playerStepsSinceWorldTick: 0,
      playerSenseSamples: [],
      nextPlayerSenseSampleOrdinal: 0,
    });
    runtime.destroy();
  });
});

function perceptionFixture(seed: string): {
  readonly record: SaveRecord;
  readonly residentId: string;
} {
  const world = createWorld(seed, "standard");
  const economy = createWorldView(world);
  const resident = world.residents[0];
  if (!resident) throw new Error("fixture world needs one existing human");
  const placement = resolveResidentWorldPlacement(economy, resident);
  if (!placement || placement.position.region.x !== 0 || placement.position.region.y !== 0) {
    throw new Error("fixture resident needs a canonical compatibility placement");
  }

  const player = createPlayer(economy, resident.homeSettlementId);
  const tileIndex = placement.compatibilityTileIndex;
  player.x = placement.position.localX;
  player.y = placement.position.localY;
  player.previousX = player.x;
  player.previousY = player.y;
  player.velocityX = 0;
  player.velocityY = 0;
  player.currentTrace = [tileIndex];
  player.surveyTrace = [tileIndex];
  player.discovered[tileIndex] = FIXED_POINT;

  const session = createSessionState(seed, "hearth");
  session.titleVisible = false;
  session.paused = false;
  session.hasSave = true;
  const envelope = {
    format: "tideweft-session",
    version: 1,
    world: serializeWorld(world),
    player,
    session,
  };
  return {
    residentId: String(resident.id),
    record: {
      slotId: "autosave",
      label: "Runtime perception fixture",
      seed,
      updatedAt: 1,
      playTicks: world.meta.completedTick,
      settlementCount: world.settlements.length,
      connectedCount: 0,
      worldJson: JSON.stringify(envelope),
    },
  };
}

function advancePlayerSteps(runtime: TideweftRuntime, count: number): void {
  runtime.start();
  let now = 100;
  for (let frame = 0; frame <= count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(now);
    now += 100;
  }
  runtime.stop();
}

function savedWorld(repository: MemoryRepository) {
  const envelope = savedEnvelope(repository);
  return deserializeWorld(envelope.world);
}

function savedEnvelope(repository: MemoryRepository): TestGameSaveEnvelope {
  return JSON.parse(repository.snapshot().worldJson) as TestGameSaveEnvelope;
}

function savedResidentPerception(repository: MemoryRepository, residentId: string) {
  const resident = savedWorld(repository).residents.find(({ id }) => String(id) === residentId);
  if (!resident) throw new Error("saved world omitted fixture resident");
  return resident.perception;
}

function currentPerceptionCarry(envelope: Record<string, unknown>): Record<string, unknown> {
  const carry = envelope.perceptionCarry;
  if (!carry || typeof carry !== "object" || Array.isArray(carry)) {
    throw new Error("current fixture omitted its perception carry");
  }
  return carry as Record<string, unknown>;
}

function resealCurrentEnvelope(
  repository: MemoryRepository,
  tamper: (envelope: Record<string, unknown>) => void,
): void {
  const current = repository.snapshot();
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const { integrity: _integrity, ...unsealed } = decoded;
  const envelope = structuredClone(unsealed);
  tamper(envelope);
  repository.replace({
    ...current,
    updatedAt: current.updatedAt + 1,
    worldJson: JSON.stringify({
      ...envelope,
      integrity: gameSaveEnvelopeIntegrity(envelope),
    }),
  });
}
