import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import {
  FIXED_POINT,
  createWorldView,
  deserializeWorld,
  serializeWorld,
} from "../sim/public";

const soundscapeControl = vi.hoisted(() => ({
  plays: [] as Array<{ cue: string; gain: number | undefined }>,
}));

vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(cue: string, gain?: number): void {
      soundscapeControl.plays.push({ cue, gain });
    }
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

import {
  canonicalizeBio0EcologyState,
  deserializeBio0Ecology,
  serializeBio0Ecology,
} from "./bio0Ecology";
import { repositionDogActor, replaceDogActorPhysiology } from "./dogActor";
import {
  headingToRadians,
  livingActorAddressForResident,
  livingActorAddressInRegionalWindow,
} from "./livingActor";
import { canonicalizeLivingActorPlayerChoiceState } from "./livingActorPlayerChoice";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { restorePlayerRegionalTravel } from "./regionalPlayerTravel";
import { playerWorldPositionInRegionalWindow } from "./residentSpatial";
import { createTideweftRuntime, type TideweftRuntime } from "./runtime";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  translateWorldPosition,
  worldPositionDelta,
} from "./worldPosition";

class MemoryRepository implements SaveRepository {
  private record: SaveRecord | undefined;

  async list() { return []; }
  async load(slotId: string) {
    return slotId === "autosave" && this.record
      ? structuredClone(this.record)
      : undefined;
  }
  async save(record: SaveRecord) { this.record = structuredClone(record); }
  async remove() { this.record = undefined; }

  snapshot(): SaveRecord {
    if (!this.record) throw new Error("release audit has no autosave");
    return structuredClone(this.record);
  }

  replace(record: SaveRecord): void {
    this.record = structuredClone(record);
  }
}

let scheduledFrame: ((now: number) => void) | undefined;
let nextFrameTime = 100;

beforeEach(() => {
  scheduledFrame = undefined;
  nextFrameTime = 100;
  soundscapeControl.plays.length = 0;
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

describe("BIO0 release-level player loop", () => {
  it("makes a fresh encounter actionable and preserves one exact meal aftermath on reload", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });

    const initialDog = runtime.getRenderView().dogs?.[0];
    expect(initialDog).toMatchObject({ quickLabel: "Unknown dog", selected: false });
    if (!initialDog) throw new Error("fresh BIO0 dog is not directly visible");
    selectDog(runtime, initialDog);
    expect(runtime.getUIView().selectedLivingActor?.interactions?.map(({ id }) => id)).toEqual([
      "help",
      "secure-food",
      "wait",
      "reroute",
      "leave",
    ]);

    runtime.dispatchUI({
      type: "living-actor",
      action: "interact",
      interaction: "help",
      target: { species: "domestic-dog", actorId: initialDog.actorId },
    });
    runtime.start();
    advanceFrames(1);

    let ecology = await savedEcology(runtime, repository);
    for (let tick = 0; tick < 12 && !ecology.events.some(({ kind }) => kind === "food-consumed"); tick += 1) {
      advanceFrames(10);
      ecology = await savedEcology(runtime, repository);
    }
    runtime.stop();

    const meals = ecology.events.filter(({ kind }) => kind === "food-consumed");
    expect(meals).toHaveLength(1);
    expect(runtime.getUIView().announcement?.message).toBe(
      "The porter offers one provision. The dog accepts it, and the food leaves the pack.",
    );
    expect(soundscapeControl.plays.filter(({ cue }) => cue === "accept")).toEqual([
      { cue: "accept", gain: 0.38 },
    ]);
    expect(ecology.dog.identity.stableId).toBe(initialDog.actorId);
    expect(ecology.dog.address.persistence).toBe("promoted");
    expect(ecology.dog.memories).toHaveLength(2);
    expect(ecology.dog.playerKnowledge.facts.map(({ fact }) => fact)).toEqual([
      "human-familiarity",
      "recognizable-individual",
      "significant-history",
    ]);
    const provider = ecology.cargo.containers.find(
      ({ id }) => id === ecology.foodSource.providerContainerId,
    );
    const receiver = ecology.cargo.containers.find(
      ({ id }) => id === ecology.foodSource.receiverContainerId,
    );
    expect(provider?.carrier.lots[0]?.payload).toMatchObject({ quantity: 3 });
    expect(receiver?.carrier.lots).toEqual([]);
    expect(receiver?.carrier.retiredLotIds).toHaveLength(1);

    runtime.destroy();
    scheduledFrame = undefined;
    const resumed = await createTideweftRuntime(repository);
    const resumedDog = resumed.getRenderView().dogs?.[0];
    expect(resumedDog).toMatchObject({
      actorId: initialDog.actorId,
      quickLabel: "Familiar dog",
    });
    if (!resumedDog) throw new Error("promoted dog did not return to direct perception");
    selectDog(resumed, resumedDog);
    expect(resumed.getUIView().selectedLivingActor).toMatchObject({
      target: { species: "domestic-dog", actorId: initialDog.actorId },
      quick: { heading: "FAMILIAR DOG" },
      about: {
        heading: "FAMILIAR DOG",
        knowledgeLabel: "Known individual",
        known: expect.arrayContaining([{
          label: "Known history",
          value: "Accepted food from a porter",
        }]),
      },
    });
    await resumed.save();
    const reloadedEcology = requiredEcology(repository);
    expect(reloadedEcology.cargo).toEqual(ecology.cargo);
    expect(reloadedEcology.dog.memories).toEqual(ecology.dog.memories);
    resumed.destroy();
  });

  it("lets SECURE FOOD close the exact pack without inventing a meal", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const dog = requiredVisibleDog(runtime);
    selectDog(runtime, dog);

    runtime.dispatchUI({
      type: "living-actor",
      action: "interact",
      interaction: "secure-food",
      target: { species: "domestic-dog", actorId: dog.actorId },
    });
    runtime.start();
    advanceFrames(1);

    let ecology = await savedEcology(runtime, repository);
    for (let tick = 0; tick < 12; tick += 1) {
      const provider = ecology.cargo.containers.find(
        ({ id }) => id === ecology.foodSource.providerContainerId,
      );
      if (provider?.closure === "secured") break;
      advanceFrames(10);
      ecology = await savedEcology(runtime, repository);
    }
    runtime.stop();

    const provider = ecology.cargo.containers.find(
      ({ id }) => id === ecology.foodSource.providerContainerId,
    );
    expect(provider).toMatchObject({
      closure: "secured",
      carrier: { lots: [{ payload: { kind: "provision", quantity: 4 } }] },
    });
    expect(ecology.events.some(({ kind }) => kind === "food-consumed")).toBe(false);
    expect(requiredChoices(repository).events.at(-1)).toMatchObject({
      kind: "ask-secure-provisions",
      effect: {
        kind: "request-secure-provisions",
        containerId: ecology.foodSource.providerContainerId,
      },
    });
    runtime.destroy();
  });

  it("persists an unwitnessed requested meal without narrating or sounding it", async () => {
    const repository = new MemoryRepository();
    const setup = await createTideweftRuntime(repository);
    setup.dispatchUI({ type: "resume-world" });
    const visibleDog = requiredVisibleDog(setup);
    selectDog(setup, visibleDog);
    setup.dispatchUI({
      type: "living-actor",
      action: "interact",
      interaction: "help",
      target: { species: "domestic-dog", actorId: visibleDog.actorId },
    });
    await setup.save();
    setup.destroy();
    prepareUnwitnessedMealFixture(repository);

    const runtime = await createTideweftRuntime(repository);
    expect(runtime.getRenderView().dogs ?? []).toEqual([]);
    const priorAnnouncement = runtime.getUIView().announcement?.message;
    soundscapeControl.plays.length = 0;
    runtime.start();
    advanceFrames(1);
    let ecology = await savedEcology(runtime, repository);
    for (let tick = 0; tick < 12 && !ecology.events.some(({ kind }) => kind === "food-consumed"); tick += 1) {
      advanceFrames(10);
      ecology = await savedEcology(runtime, repository);
    }
    runtime.stop();

    expect(ecology.events.filter(({ kind }) => kind === "food-consumed")).toHaveLength(1);
    const currentAnnouncement = runtime.getUIView().announcement?.message;
    expect(currentAnnouncement).not.toBe(
      "The porter offers one provision. The dog accepts it, and the food leaves the pack.",
    );
    // Habitat-derived wildlife may lawfully produce an unrelated, audible
    // alarm during this interval. This assertion owns only the unwitnessed
    // meal: it must not suppress or masquerade as other perceived events.
    if (currentAnnouncement !== priorAnnouncement) {
      const expectedCue = currentAnnouncement === "ANIMAL ALARM — source unclear."
        ? "wildlife-alarm"
        : currentAnnouncement === "[soft thump nearby]"
          ? "rabbit-thump"
          : undefined;
      expect(expectedCue).toBeDefined();
      expect(soundscapeControl.plays.some(({ cue }) => cue === expectedCue)).toBe(true);
    }
    expect(soundscapeControl.plays.some(({ cue }) => cue === "accept")).toBe(false);
    runtime.destroy();
  });

  it("makes WAIT stop a live Loom route and persist its bounded observation choice", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const dog = requiredVisibleDog(runtime);
    selectDog(runtime, dog);
    const before = runtime.getRenderView().player.position;
    const terrain = runtime.getRenderView().terrain;
    const direction = before.x < (terrain.columns * terrain.tileSize) / 2 ? 1 : -1;
    runtime.dispatchRenderer({
      type: "move-target",
      point: { x: before.x + direction * 6 * 24, y: before.y },
      additive: false,
    });

    runtime.dispatchUI({
      type: "living-actor",
      action: "interact",
      interaction: "wait",
      target: { species: "domestic-dog", actorId: dog.actorId },
    });
    runtime.start();
    advanceFrames(25);
    runtime.stop();
    await runtime.save();

    expect(runtime.getRenderView().player.position).toEqual(before);
    expect(requiredChoices(repository).events.at(-1)).toMatchObject({
      tick: 0,
      kind: "wait-observe",
      effect: {
        kind: "wait-observe",
        focusActorId: dog.actorId,
        untilTick: 3,
      },
    });
    runtime.destroy();
  });

  it("makes LEAVE close the encounter and rejects a stale follow-up target", async () => {
    const repository = new MemoryRepository();
    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const dog = requiredVisibleDog(runtime);
    selectDog(runtime, dog);

    runtime.dispatchUI({
      type: "living-actor",
      action: "interact",
      interaction: "leave",
      target: { species: "domestic-dog", actorId: dog.actorId },
    });
    await runtime.save();
    const afterLeave = requiredChoices(repository);
    const cargoAfterLeave = requiredEcology(repository).cargo;
    expect(runtime.getUIView().selectedLivingActor).toBeUndefined();
    expect(runtime.getRenderView().dogs?.[0]?.selected).toBe(false);
    expect(afterLeave.events.at(-1)).toMatchObject({
      kind: "leave",
      effect: { kind: "leave-interaction", focusActorId: dog.actorId },
    });

    runtime.dispatchUI({
      type: "living-actor",
      action: "interact",
      interaction: "help",
      target: { species: "domestic-dog", actorId: dog.actorId },
    });
    await runtime.save();
    expect(requiredChoices(repository)).toEqual(afterLeave);
    expect(requiredEcology(repository).cargo).toEqual(cargoAfterLeave);
    runtime.destroy();
  });

  it("routes to the same destination while avoiding the actor's observed tile area", async () => {
    const repository = new MemoryRepository();
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();
    const fixture = prepareStraightRerouteFixture(repository);

    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const dog = requiredVisibleDog(runtime);
    const start = runtime.getRenderView().player.position;
    expect(dog.position.x - start.x).toBe(fixture.direction * 4 * 24);
    expect(dog.position.y).toBe(start.y);
    selectDog(runtime, dog);
    const destination = {
      // Keep the assertion inside one bounded presentation frame; seamless
      // frame rebasing is covered separately by the regional runtime suite.
      x: start.x + fixture.direction * 6 * 24,
      y: start.y,
    };
    runtime.dispatchRenderer({ type: "move-target", point: destination, additive: false });
    runtime.dispatchUI({
      type: "living-actor",
      action: "interact",
      interaction: "reroute",
      target: { species: "domestic-dog", actorId: dog.actorId },
    });
    await runtime.save();

    const reroute = requiredChoices(repository).events.at(-1);
    expect(reroute).toMatchObject({
      kind: "reroute",
      effect: {
        kind: "request-reroute",
        focusActorId: dog.actorId,
        avoidArea: {
          center: fixture.dogPosition,
          radiusUnits: WORLD_POSITION_UNITS_PER_TILE,
        },
      },
    });
    expect(runtime.getUIView().announcement?.message).toBe(
      "The Loom bends the current route around the actor's observed position.",
    );

    const visited = [start];
    runtime.start();
    advanceFrames(1);
    for (let frame = 0; frame < 160; frame += 1) {
      advanceFrames(1);
      const position = runtime.getRenderView().player.position;
      visited.push(position);
      if (sameRenderTile(position, destination)) break;
    }
    runtime.stop();

    expect(renderTileCoordinates(runtime.getRenderView().player.position)).toEqual(
      renderTileCoordinates(destination),
    );
    expect(runtime.getUIView().saveWarning).toBeUndefined();
    expect(visited.some((position) => Math.abs(position.y - start.y) >= 12)).toBe(true);
    expect(visited.some((position) => {
      const center = renderTileCenter(position);
      return Math.hypot(center.x - dog.position.x, center.y - dog.position.y) <= 24;
    })).toBe(false);
    runtime.destroy();
  });

  it("rejects an impossible reroute without replacing the prior route or choice ledger", async () => {
    const repository = new MemoryRepository();
    const setup = await createTideweftRuntime(repository);
    await setup.save();
    setup.destroy();
    prepareStraightRerouteFixture(repository);

    const runtime = await createTideweftRuntime(repository);
    runtime.dispatchUI({ type: "resume-world" });
    const dog = requiredVisibleDog(runtime);
    selectDog(runtime, dog);
    runtime.dispatchRenderer({
      type: "move-target",
      point: dog.position,
      additive: false,
    });
    const before = requiredChoices(repository);
    runtime.dispatchUI({
      type: "living-actor",
      action: "interact",
      interaction: "reroute",
      target: { species: "domestic-dog", actorId: dog.actorId },
    });
    await runtime.save();

    expect(requiredChoices(repository)).toEqual(before);
    expect(runtime.getUIView().announcement?.message).toBe(
      "The Loom cannot preserve that destination while avoiding the observed spot.",
    );
    runtime.start();
    advanceFrames(1);
    for (let frame = 0; frame < 100; frame += 1) {
      advanceFrames(1);
      if (sameRenderTile(runtime.getRenderView().player.position, dog.position)) break;
    }
    runtime.stop();
    expect(sameRenderTile(runtime.getRenderView().player.position, dog.position)).toBe(true);
    runtime.destroy();
  });
});

function selectDog(
  runtime: TideweftRuntime,
  dog: NonNullable<ReturnType<TideweftRuntime["getRenderView"]>["dogs"]>[number],
): void {
  runtime.dispatchRenderer({
    type: "select",
    entity: "living-actor",
    species: "domestic-dog",
    id: dog.actorId,
    point: dog.position,
  });
}

function requiredVisibleDog(runtime: TideweftRuntime) {
  const dog = runtime.getRenderView().dogs?.[0];
  if (!dog) throw new Error("fresh BIO0 dog is not directly visible");
  return dog;
}

function advanceFrames(count: number): void {
  for (let frame = 0; frame < count; frame += 1) {
    const callback = scheduledFrame;
    if (!callback) throw new Error("runtime did not schedule its next frame");
    scheduledFrame = undefined;
    callback(nextFrameTime);
    nextFrameTime += 100;
  }
}

async function savedEcology(runtime: TideweftRuntime, repository: MemoryRepository) {
  await runtime.save();
  return requiredEcology(repository);
}

function requiredEcology(repository: MemoryRepository) {
  const envelope = JSON.parse(repository.snapshot().worldJson) as { bio0Ecology?: unknown };
  const ecology = deserializeBio0Ecology(envelope.bio0Ecology);
  if (!ecology) throw new Error("release audit save omitted BIO0 ecology");
  return ecology;
}

function requiredChoices(repository: MemoryRepository) {
  const envelope = JSON.parse(repository.snapshot().worldJson) as {
    livingActorPlayerChoice?: unknown;
  };
  const choices = canonicalizeLivingActorPlayerChoiceState(envelope.livingActorPlayerChoice);
  if (!choices) throw new Error("release audit save omitted living-actor player choices");
  return choices;
}

function prepareStraightRerouteFixture(
  repository: MemoryRepository,
): Readonly<{
  direction: -1 | 1;
  dogPosition: ReturnType<typeof requiredEcology>["dog"]["address"]["position"];
}> {
  let prepared: {
    direction: -1 | 1;
    dogPosition: ReturnType<typeof requiredEcology>["dog"]["address"]["position"];
  } | null = null;
  resealCurrent(repository, (decoded) => {
    const envelope = decoded as unknown as {
      world: string;
      player: Parameters<typeof restorePlayerRegionalTravel>[1];
      regionalTravel: string;
      bio0Ecology: string;
    };
    const world = deserializeWorld(envelope.world);
    for (const tile of world.terrain.tiles) {
      tile.terrain = "meadow";
      tile.elevation = FIXED_POINT;
    }
    world.weather = {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: world.meta.completedTick + 1_000,
    };
    const travel = restorePlayerRegionalTravel(
      world.meta.rootSeed,
      envelope.player,
      envelope.regionalTravel,
    );
    if (!travel) throw new Error("reroute fixture could not restore regional travel");
    const playerPosition = playerWorldPositionInRegionalWindow(travel.window, envelope.player);
    if (!playerPosition) throw new Error("reroute fixture could not locate its player");
    const roomRight = world.terrain.width * WORLD_POSITION_UNITS_PER_TILE - playerPosition.localX;
    const direction: -1 | 1 = roomRight > 12 * WORLD_POSITION_UNITS_PER_TILE ? 1 : -1;
    envelope.player.facingMilliRadians = direction === 1 ? 0 : Math.round(Math.PI * 1_000);
    const dogPosition = translateWorldPosition(
      playerPosition,
      direction * 4 * WORLD_POSITION_UNITS_PER_TILE,
      0,
    );
    const ecology = deserializeBio0Ecology(envelope.bio0Ecology);
    if (!ecology) throw new Error("reroute fixture lost BIO0 ecology");
    const dog = repositionDogActor(ecology.dog, {
      position: dogPosition,
      heading: ecology.dog.address.heading,
      atTick: ecology.tick,
    });
    const moved = canonicalizeBio0EcologyState({ ...ecology, dog });
    if (!moved) throw new Error("reroute fixture produced invalid BIO0 ecology");
    decoded.world = serializeWorld(world);
    decoded.bio0Ecology = serializeBio0Ecology(moved);
    prepared = { direction, dogPosition };
  });
  if (prepared === null) throw new Error("reroute fixture was not prepared");
  return prepared;
}

function prepareUnwitnessedMealFixture(repository: MemoryRepository): void {
  resealCurrent(repository, (decoded) => {
    const envelope = decoded as unknown as {
      world: string;
      player: Parameters<typeof restorePlayerRegionalTravel>[1];
      regionalTravel: string;
      bio0Ecology: string;
    };
    const world = deserializeWorld(envelope.world);
    for (const tile of world.terrain.tiles) {
      tile.terrain = "meadow";
      tile.elevation = FIXED_POINT;
    }
    world.weather = {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: world.meta.completedTick + 1_000,
    };
    const travel = restorePlayerRegionalTravel(
      world.meta.rootSeed,
      envelope.player,
      envelope.regionalTravel,
    );
    if (!travel) throw new Error("unwitnessed meal fixture could not restore travel");
    const playerPosition = playerWorldPositionInRegionalWindow(travel.window, envelope.player);
    if (!playerPosition) throw new Error("unwitnessed meal fixture could not locate player");
    const ecology = deserializeBio0Ecology(envelope.bio0Ecology);
    if (!ecology) throw new Error("unwitnessed meal fixture lost BIO0 ecology");
    const porter = world.residents.find(
      ({ identity }) => identity.stableId === ecology.porterAddress.actorId,
    );
    if (!porter) throw new Error("unwitnessed meal fixture lost its porter");

    let selected: ReturnType<typeof livingActorAddressForResident> = null;
    let selectedSettlementId: number | null = null;
    let selectedDistance = -1;
    for (const settlement of world.settlements) {
      porter.location = { kind: "settlement", settlementId: settlement.id };
      const address = livingActorAddressForResident(createWorldView(world), porter);
      if (address?.species !== "human") continue;
      const placement = livingActorAddressInRegionalWindow(address, travel.window);
      if (!placement) continue;
      const delta = worldPositionDelta(playerPosition, address.position);
      const distance = Math.hypot(delta.x, delta.y);
      if (distance > selectedDistance) {
        selected = address;
        selectedSettlementId = settlement.id;
        selectedDistance = distance;
      }
    }
    if (
      selected?.species !== "human"
      || selectedSettlementId === null
      || selectedDistance <= 20 * WORLD_POSITION_UNITS_PER_TILE
    ) {
      throw new Error("unwitnessed meal fixture found no distant loaded settlement");
    }
    porter.location = { kind: "settlement", settlementId: selectedSettlementId };
    porter.intention = "rest";
    porter.nextThinkTick = world.meta.completedTick + 1_000;
    porter.traits = { resolve: 500_000, empathy: FIXED_POINT, curiosity: 0 };
    porter.needs = { food: 0, rest: 0, belonging: 0 };
    porter.identity.temperament = ["protective", "social"];
    const facing = headingToRadians(selected.heading);
    const dogPosition = translateWorldPosition(
      selected.position,
      Math.round(Math.cos(facing) * WORLD_POSITION_UNITS_PER_TILE),
      Math.round(Math.sin(facing) * WORLD_POSITION_UNITS_PER_TILE),
    );
    const positionedDog = repositionDogActor(ecology.dog, {
      position: dogPosition,
      heading: ecology.dog.address.heading,
      atTick: ecology.tick,
    });
    const hungryDog = replaceDogActorPhysiology(positionedDog, {
      needs: { hunger: FIXED_POINT, thirst: 0, rest: 0, safety: 0, company: 0 },
      condition: positionedDog.condition,
      humanFamiliarity: positionedDog.humanFamiliarity,
      atTick: ecology.tick,
    });
    const moved = canonicalizeBio0EcologyState({
      ...ecology,
      dog: hungryDog,
      porterAddress: selected,
    });
    if (!moved) throw new Error("unwitnessed meal fixture produced invalid BIO0 ecology");
    decoded.world = serializeWorld(world);
    decoded.bio0Ecology = serializeBio0Ecology(moved);
  });
}

function resealCurrent(
  repository: MemoryRepository,
  mutate: (envelope: Record<string, unknown>) => void,
): void {
  const current = repository.snapshot();
  const decoded = JSON.parse(current.worldJson) as Record<string, unknown>;
  const { integrity: _integrity, ...base } = decoded;
  const next = structuredClone(base);
  mutate(next);
  repository.replace({
    ...current,
    updatedAt: current.updatedAt + 1,
    worldJson: JSON.stringify({
      ...next,
      integrity: gameSaveEnvelopeIntegrity(next),
    }),
  });
}

function sameRenderTile(
  left: Readonly<{ x: number; y: number }>,
  right: Readonly<{ x: number; y: number }>,
): boolean {
  return Math.floor(left.x / 24) === Math.floor(right.x / 24)
    && Math.floor(left.y / 24) === Math.floor(right.y / 24);
}

function renderTileCenter(position: Readonly<{ x: number; y: number }>) {
  return {
    x: (Math.floor(position.x / 24) + 0.5) * 24,
    y: (Math.floor(position.y / 24) + 0.5) * 24,
  };
}

function renderTileCoordinates(position: Readonly<{ x: number; y: number }>) {
  return {
    x: Math.floor(position.x / 24),
    y: Math.floor(position.y / 24),
  };
}
