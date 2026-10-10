import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { TideweftSoundscape } from "../audio/soundscape";
import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { createWorld, createWorldView, deserializeWorld, serializeWorld, type WorldState } from "../sim/public";
import * as simulation from "../sim/public";
import { RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION } from "../sim/residentActivity";
import type { WorldView } from "../sim/types";
import { stableStringify } from "../sim/util";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { deserializeBio0Ecology, type Bio0EcologyState } from "./bio0Ecology";
import { livingActorAddressForResident } from "./livingActor";
import { gameSaveEnvelopeIntegrity } from "./physicalCargoState";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView, isImmutableRegionalWorldView, regionalCompatibilityWorldForWorld, regionalWindowForWorld, regionalWorldViewPhysicalPublication } from "./regionalWorldView";
import * as regionalViews from "./regionalWorldView";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createTideweftRuntime, prepareRuntimeResidentActivityPublication, type TideweftRuntime } from "./runtime";
import { CURRENT_GAME_SAVE_VERSION } from "./saveCompatibilityPolicy";

vi.mock("../audio/soundscape", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../audio/soundscape")>()),
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(): void {}
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

class MemoryRepository implements SaveRepository {
  record: SaveRecord | undefined;
  async list() { return []; }
  async load() { return this.record === undefined ? undefined : structuredClone(this.record); }
  async save(record: SaveRecord) { this.record = structuredClone(record); }
  async remove() { this.record = undefined; }
}

let envelope: Record<string, unknown>;

beforeAll(async () => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const repository = new MemoryRepository();
  const runtime = await createTideweftRuntime(repository);
  try {
    runtime.dispatchUI({ type: "new-world", seed: "resident activity executable rest approach", posture: "gale", sessionShape: "wander" });
    await runtime.save();
    if (repository.record === undefined) throw new Error("native publication fixture omitted its save");
    envelope = JSON.parse(repository.record.worldJson) as Record<string, unknown>;
  } finally {
    runtime.destroy();
  }
}, 30_000);

afterAll(() => vi.unstubAllGlobals());

function registeredView(world: WorldState, immutable = true): WorldView {
  const compatibility = createWorldView(world);
  const streaming = createTerrainRegionStreamingState({ rootSeed: world.meta.rootSeed });
  const window = createRegionalTerrainWindow(world.meta.rootSeed, streaming);
  const cartography = projectRegionalCartographyWindow(createRegionalCartography(world.meta.rootSeed), window);
  return createRegionalWorldView(compatibility, window, cartography, { immutable });
}

function fixtureAt(phase = 0) {
  const world = deserializeWorld(String(envelope.world));
  const bio0 = deserializeBio0Ecology(envelope.bio0Ecology);
  if (bio0 === null) throw new Error("native publication fixture omitted its physical porter cargo");
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: world.meta.completedTick + 1_000 };
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 100_000 };
    resident.condition.exhaustion = 100_000;
  }
  const porter = world.residents.find(({ identity }) => identity.stableId === bio0.porterAddress.actorId);
  if (porter === undefined) throw new Error("native publication fixture lost its porter");
  const source = resolveResidentWorldPlacement(world, porter)?.position;
  const target = residentSettlementRestTarget(world, porter);
  if (!source || !target || !residentRestTargetHasDrySupport(world, source) || !residentRestTargetHasDrySupport(world, target)) {
    throw new Error("native porter requires actual dry source and refuge support");
  }
  porter.needs.rest = 900_000;
  porter.condition.exhaustion = 300_000;
  // This exact physical frame is captured before body adoption. Every later
  // mutation below belongs solely to resident rest/body state at the same tick.
  const spatial = registeredView(world);
  expect(adoptResidentActivities(world)).toBe(true);
  expect(prepareResidentRestActivities(world)).toBe(true);
  for (let accepted = 1; accepted <= phase; accepted += 1) {
    expect(advanceResidentRestActivities(world, accepted)).not.toBeNull();
  }
  return { world, bio0, spatial, actorId: porter.identity.stableId, source };
}

function expectOnlyAddressChanged(before: Bio0EcologyState, after: Bio0EcologyState) {
  for (const key of Object.keys(before) as Array<keyof Bio0EcologyState>) {
    if (key !== "porterAddress") expect(stableStringify(after[key]), key).toBe(stableStringify(before[key]));
  }
}

function expectPhysicalPublicationUnchanged(prior: WorldView, next: WorldView) {
  expect(isImmutableRegionalWorldView(next)).toBe(true);
  expect(regionalWindowForWorld(next)).toBe(regionalWindowForWorld(prior));
  expect(regionalWorldViewPhysicalPublication(next)).toBe(regionalWorldViewPhysicalPublication(prior));
  for (const key of Object.keys(prior) as Array<keyof WorldView>) {
    if (key !== "residents") expect(next[key], key).toBe(prior[key]);
  }
  const priorEconomy = regionalCompatibilityWorldForWorld(prior)!;
  const nextEconomy = regionalCompatibilityWorldForWorld(next)!;
  for (const key of Object.keys(priorEconomy) as Array<keyof WorldView>) {
    if (key !== "residents") expect(nextEconomy[key], key).toBe(priorEconomy[key]);
  }
}

// Pure staging/native-root evidence only: no normal runtime body adoption,
// outer-format body persistence, new dog step, or simulated work is introduced.
describe("runtime resident-only physical publication staging", () => {
  it.each([0, 9, 10])("stages the exact accepted phase %i and updates only the native porter address", (phase) => {
    const { world, bio0, spatial, actorId, source } = fixtureAt(phase);
    const priorRoster = world.residents;
    const priorBytes = stableStringify({ world, bio0, spatial });
    const result = prepareRuntimeResidentActivityPublication(world, spatial, bio0, phase);
    expect(result).not.toBeNull();
    if (result === null) throw new Error("native publication staging rejected");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.worldView)).toBe(true);
    expect(Object.isFrozen(result.worldView.residents)).toBe(true);
    expect(result.worldView.residents).not.toBe(world.residents);
    expect(result.economyView.residents).toBe(result.worldView.residents);
    expectPhysicalPublicationUnchanged(spatial, result.worldView);
    const porter = result.economyView.residents.find(({ identity }) => identity.stableId === actorId)!;
    const pose = porter.activity!.poses[phase]!;
    expect(result.bio0Ecology.porterAddress).toEqual(livingActorAddressForResident(result.economyView, porter));
    expect(result.bio0Ecology.porterAddress.position).toEqual(pose.position);
    expect(result.bio0Ecology.porterAddress.heading).toBe(pose.heading);
    if (phase > 0) expect(pose.position).not.toEqual(source);
    expectOnlyAddressChanged(bio0, result.bio0Ecology);
    expect(world.residents).toBe(priorRoster);
    expect(stableStringify({ world, bio0, spatial })).toBe(priorBytes);
  });

  it("supports repeated siblings and detached cold bodies without changing old publications or ecology", () => {
    const { world, bio0, spatial } = fixtureAt(9);
    const first = prepareRuntimeResidentActivityPublication(world, spatial, bio0, 9);
    if (first === null) throw new Error("native publication staging rejected");
    const saved = serializeWorld(world);
    const cold = deserializeWorld(saved);
    const coldResult = prepareRuntimeResidentActivityPublication(cold, spatial, structuredClone(bio0), 9);
    expect(coldResult).not.toBeNull();
    expect(stableStringify(coldResult)).toBe(stableStringify(first));
    const firstBytes = stableStringify(first);
    expect(advanceResidentRestActivities(world, 10)).not.toBeNull();
    const terminal = prepareRuntimeResidentActivityPublication(world, first.worldView, first.bio0Ecology, 10);
    expect(terminal).not.toBeNull();
    if (terminal === null) throw new Error("terminal publication staging rejected");
    expectPhysicalPublicationUnchanged(spatial, terminal.worldView);
    expectOnlyAddressChanged(bio0, terminal.bio0Ecology);
    expect(stableStringify(first)).toBe(firstBytes);
    expect(serializeWorld(cold)).toBe(saved);
  });

  it.each(["absent", "mixed", "partial", "stale", "foreign-actor", "wrong-task", "perception", "circadian", "circadian-absent"] as const)("rejects %s resident state without modifying any input", (kind) => {
    const { world, bio0, spatial } = fixtureAt();
    const last = world.residents.at(-1)!;
    if (kind === "absent") for (const resident of world.residents) delete resident.activity;
    else if (kind === "mixed") delete last.activity;
    else if (kind === "partial") Object.assign(last, { activity: { version: last.activity!.version } });
    else if (kind === "stale") Object.assign(last, { activity: { ...last.activity, tick: world.meta.completedTick - 1 } });
    else if (kind === "foreign-actor") Object.assign(last, { activity: { ...last.activity, actorId: world.residents[0]!.identity.stableId } });
    else if (kind === "perception") last.perception = { ...last.perception, actorId: "H-foreign" };
    else if (kind === "circadian") Object.assign(last, { circadian: { ...last.circadian, restDestinationId: "rest:foreign" } });
    else if (kind === "circadian-absent") delete last.circadian;
    else {
      const porter = world.residents.find(({ identity }) => identity.stableId === bio0.porterAddress.actorId)!;
      const task = porter.activity!.restTask!;
      Object.assign(porter, { activity: { ...porter.activity, restTask: { ...task, target: { ...task.target, localX: task.target.localX + 1_000 } } } });
    }
    const roster = world.residents;
    const bytes = stableStringify({ world, bio0, spatial });
    expect(prepareRuntimeResidentActivityPublication(world, spatial, bio0, 0) === null).toBe(true);
    expect(world.residents).toBe(roster);
    expect(stableStringify({ world, bio0, spatial })).toBe(bytes);
  });

  it("rejects invalid or mismatched accepted phases, including later history at phase zero", () => {
    const { world, bio0, spatial } = fixtureAt(9);
    const bytes = stableStringify({ world, bio0, spatial });
    for (const phase of [-1, -0, 0, 8, 10, 11, 0.5, Number.NaN]) {
      expect(prepareRuntimeResidentActivityPublication(world, spatial, bio0, phase)).toBeNull();
    }
    expect(stableStringify({ world, bio0, spatial })).toBe(bytes);
  });

  it("rejects unregistered, cold-copied, mutable, foreign-seed, seedless and stale-tick physical frames", () => {
    const { world, bio0, spatial } = fixtureAt();
    const foreignWorld = createWorld("another native publication world", world.meta.pressureMode);
    const staleWorld = deserializeWorld(String(envelope.world));
    staleWorld.meta.completedTick += 1;
    const seedlessCompatibility = createWorldView(world);
    delete seedlessCompatibility.rootSeed;
    const window = regionalWindowForWorld(spatial)!;
    const seedless = createRegionalWorldView(seedlessCompatibility, window,
      projectRegionalCartographyWindow(createRegionalCartography(world.meta.rootSeed), window), { immutable: true });
    const rejected = [Object.freeze(createWorldView(world)), Object.freeze(structuredClone(spatial)), registeredView(world, false), registeredView(foreignWorld), registeredView(staleWorld), seedless];
    const bytes = stableStringify({ world, bio0, spatial });
    for (const view of rejected) expect(prepareRuntimeResidentActivityPublication(world, view, bio0, 0)).toBeNull();
    expect(stableStringify({ world, bio0, spatial })).toBe(bytes);
  });

  it("rejects malformed authoritative seed without throwing or publishing a tuple", () => {
    const { world, bio0, spatial } = fixtureAt();
    const roster = world.residents;
    Object.assign(world.meta, { rootSeed: [Number.NaN, 0, 0, 0] });
    expect(prepareRuntimeResidentActivityPublication(world, spatial, bio0, 0)).toBeNull();
    expect(world.residents).toBe(roster);
    expect(bio0.porterAddress).toEqual(deserializeBio0Ecology(envelope.bio0Ecology)?.porterAddress);
  });

  it.each(["address", "actor", "negative-zero-heading", "tick", "food-source", "cargo", "cargo-custody", "dog", "dog-identity"] as const)("rejects corrupt %s BIO0 without repairing it by address overwrite", (kind) => {
    const { world, bio0, spatial } = fixtureAt();
    const corrupt = structuredClone(bio0);
    if (kind === "address") Object.assign(corrupt, { porterAddress: { ...corrupt.porterAddress, position: { ...corrupt.porterAddress.position, localX: corrupt.porterAddress.position.localX + 1_000 } } });
    else if (kind === "actor") Object.assign(corrupt, { porterAddress: { ...corrupt.porterAddress, actorId: "H-foreign" } });
    else if (kind === "negative-zero-heading") Object.assign(corrupt, { porterAddress: { ...corrupt.porterAddress, heading: -0 } });
    else if (kind === "tick") Object.assign(corrupt, { tick: corrupt.tick - 1 });
    else if (kind === "food-source") Object.assign(corrupt, { foodSource: { ...corrupt.foodSource, sourceLotId: "bio0:foreign-source" } });
    else if (kind === "cargo") Object.assign(corrupt, { cargo: null });
    else if (kind === "cargo-custody") Object.assign(corrupt.cargo.containers[0]!, { custodianActorId: "H-foreign" });
    else if (kind === "dog-identity") Object.assign(corrupt.dog.identity, { stableId: "D-foreign" });
    else Object.assign(corrupt, { dog: null });
    const bytes = stableStringify({ world, bio0: corrupt, spatial });
    expect(prepareRuntimeResidentActivityPublication(world, spatial, corrupt, 0)).toBeNull();
    expect(stableStringify({ world, bio0: corrupt, spatial })).toBe(bytes);
  });

  it("rejects hidden, symbolic and accessor BIO0 fields before evaluating any getter or erasing descriptors", () => {
    const { world, bio0, spatial } = fixtureAt();
    const before = stableStringify({ world, bio0, spatial });
    for (const kind of ["hidden", "symbol", "accessor", "address-accessor"] as const) {
      const corrupt = structuredClone(bio0);
      const getter = vi.fn(() => bio0.porterAddress);
      if (kind === "hidden") Object.defineProperty(corrupt, "unrecognized", { value: 1, enumerable: false });
      else if (kind === "symbol") Object.defineProperty(corrupt, Symbol("unrecognized"), { value: 1, enumerable: true });
      else Object.defineProperty(corrupt, kind === "accessor" ? "unrecognized" : "porterAddress", { get: getter, enumerable: true });
      const descriptors = Object.getOwnPropertyDescriptors(corrupt);
      expect(prepareRuntimeResidentActivityPublication(world, spatial, corrupt, 0)).toBeNull();
      expect(getter).not.toHaveBeenCalled();
      expect(Object.getOwnPropertyDescriptors(corrupt)).toEqual(descriptors);
    }
    expect(stableStringify({ world, bio0, spatial })).toBe(before);
  });
});

// Ordinary accepted runtime work, with publication alone counterfactually
// rebuilt through the original full owners. This is not rendered-play or
// performance evidence; every oracle runs outside a timed measurement.
describe("completed runtime publication preserves exact native work", () => {
  it.each(["runtime baseline estuary", "breathing room regional density 8"])(
    "matches an independent full publication after thirty accepted steps: %s",
    async (seed) => {
      const priorRequestFrame = globalThis.requestAnimationFrame;
      const priorCancelFrame = globalThis.cancelAnimationFrame;
      const wallNow = Date.now();
      const wallClock = vi.spyOn(Date, "now").mockReturnValue(wallNow);
      let monotonicNow = 0;
      const monotonicClock = vi.spyOn(performance, "now").mockImplementation(() => {
        monotonicNow += 0.25;
        return monotonicNow;
      });

      const run = async (mode: "sibling" | "full-reference") => {
        monotonicNow = 0;
        let scheduledFrame: ((now: number) => void) | undefined;
        let nextFrameTime = 100;
        vi.stubGlobal("requestAnimationFrame", vi.fn((callback: (now: number) => void) => {
          scheduledFrame = callback;
          return 1;
        }));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());

        const repository = new MemoryRepository();
        const fullInputs = new WeakMap<WorldView, Parameters<typeof createRegionalWorldView>>();
        const originalFullPublication = regionalViews.createRegionalWorldView;
        const originalResidentPublication = regionalViews.replaceRegionalWorldViewResidents;
        const originalStep = simulation.stepWorld;
        let completedWorld: WorldState | undefined;
        let comparisonFailure: unknown;
        const closingTicks: number[] = [];
        const fullPublication = vi.spyOn(regionalViews, "createRegionalWorldView").mockImplementation((...args) => {
          const view = originalFullPublication(...args);
          fullInputs.set(view, args);
          return view;
        });
        const worldStep = vi.spyOn(simulation, "stepWorld").mockImplementation((...args) => {
          completedWorld = originalStep(...args);
          return completedWorld;
        });
        const residentPublication = vi.spyOn(regionalViews, "replaceRegionalWorldViewResidents").mockImplementation((prior, residents) => {
          // Initial adoption and ordinary fine publications are not the final
          // closing publication. Capture the actual engine root, not a save
          // reconstruction or a world assembled from the view under test.
          if (completedWorld === undefined || completedWorld.residents !== residents
            || prior.completedTick !== completedWorld.meta.completedTick
            || !residents.every(({ activity }) => activity?.poses.length === 1)) {
            return originalResidentPublication(prior, residents);
          }
          try {
            const inputs = fullInputs.get(prior);
            if (inputs === undefined) throw new Error("closure lost its exact completed physical publication");
            const priorBytes = stableStringify(prior);
            const sourceBytes = serializeWorld(completedWorld);
            const sibling = originalResidentPublication(prior, residents);
            const reference = originalFullPublication(createWorldView(completedWorld), inputs[1], inputs[2], inputs[3]);
            expect(stableStringify(sibling)).toBe(stableStringify(reference));
            expect(stableStringify(regionalCompatibilityWorldForWorld(sibling)))
              .toBe(stableStringify(regionalCompatibilityWorldForWorld(reference)));
            expectPhysicalPublicationUnchanged(prior, sibling);
            expect(sibling.residents).not.toBe(residents);
            expect(Object.isFrozen(sibling.residents)).toBe(true);
            expect(sibling.residents).toEqual(reference.residents);
            for (const [index, published] of sibling.residents.entries()) {
              const source = residents[index]!;
              expect(published.identity.stableId).toBe(source.identity.stableId);
              expect(published.perception).toEqual(source.perception);
              expect(published.perception).not.toBe(source.perception);
              expect(published.activity).toEqual(source.activity);
              expect(published.activity).not.toBe(source.activity);
              expect(published.circadian).toEqual(source.circadian);
              expect(published.circadian).not.toBe(source.circadian);
              expect(Object.isFrozen(published.activity)).toBe(true);
              expect(Object.isFrozen(published.perception)).toBe(true);
              expect(Object.isFrozen(published.circadian)).toBe(true);
            }
            expect(stableStringify(prior)).toBe(priorBytes);
            expect(serializeWorld(completedWorld)).toBe(sourceBytes);
            closingTicks.push(completedWorld.meta.completedTick);
            return mode === "full-reference" ? reference : sibling;
          } catch (error) {
            comparisonFailure = error;
            throw error;
          }
        });
        const audio = vi.spyOn(TideweftSoundscape.prototype, "play");
        let runtime: TideweftRuntime | undefined;
        try {
          runtime = await createTideweftRuntime(repository);
          runtime.dispatchUI({ type: "new-world", seed, posture: "journey", sessionShape: "wander" });
          expect(runtime.getRenderView().tick).toBe(420);
          expect(runtime.getUIView().saveWarning).toBeUndefined();
          await runtime.save();
          audio.mockClear();
          const publicViews: Array<Readonly<{ render: unknown; ui: unknown }>> = [];
          for (let interval = 1; interval <= 3; interval += 1) {
            runtime.start();
            // The first RAF establishes the clock; the next ten each accept
            // exactly one 100 ms fixed step. No WAIT or synthetic engine loop.
            for (let frame = 0; frame <= 10; frame += 1) {
              const callback = scheduledFrame;
              if (callback === undefined) throw new Error("native publication fixture stopped scheduling ordinary play");
              scheduledFrame = undefined;
              callback(nextFrameTime);
              nextFrameTime += 100;
              if (comparisonFailure !== undefined) throw comparisonFailure;
            }
            runtime.stop();
            expect(runtime.getUIView().announcement?.message).not.toContain("INTEGRITY HALT");
            expect(runtime.getRenderView().tick).toBe(420 + interval);
            publicViews.push(structuredClone({ render: runtime.getRenderView(), ui: runtime.getUIView() }));
          }
          await runtime.save();
          if (repository.record === undefined) throw new Error("native publication fixture omitted its final save");
          const saved = JSON.parse(repository.record.worldJson) as Record<string, unknown>;
          expect(saved.version).toBe(CURRENT_GAME_SAVE_VERSION);
          expect(repository.record.payloadVersion).toBe(CURRENT_GAME_SAVE_VERSION);
          expect(saved.integrity).toBe(gameSaveEnvelopeIntegrity(saved));
          const world = deserializeWorld(String(saved.world));
          expect(serializeWorld(world)).toBe(saved.world);
          expect(world.meta.completedTick).toBe(423);
          expect(world.residents.every(({ activity, perception }) => (
            activity?.version === RESIDENT_TRAVEL_ENVIRONMENT_ACTIVITY_VERSION
            && activity.tick === 423 && activity.poses.length === 1 && perception.tick === 423
          ))).toBe(true);
          expect(saved.perceptionCarry).toMatchObject({ playerStepsSinceWorldTick: 0 });
          expect(closingTicks).toEqual([421, 422, 423]);
          return {
            worldJson: repository.record.worldJson,
            events: world.events,
            publicViews,
            audio: structuredClone(audio.mock.calls),
          };
        } finally {
          runtime?.destroy();
          residentPublication.mockRestore();
          worldStep.mockRestore();
          fullPublication.mockRestore();
          audio.mockRestore();
        }
      };

      try {
        const sibling = await run("sibling");
        const reference = await run("full-reference");
        // No root exclusions: this is identical new-world/input history, not
        // a cold session recap. Authenticate both seals above, then compare
        // the complete current envelope including world/body/events/carry.
        expect(sibling.worldJson).toBe(reference.worldJson);
        expect(sibling.events).toEqual(reference.events);
        expect(sibling.publicViews).toEqual(reference.publicViews);
        expect(sibling.audio).toEqual(reference.audio);
      } finally {
        wallClock.mockRestore();
        monotonicClock.mockRestore();
        vi.stubGlobal("requestAnimationFrame", priorRequestFrame);
        vi.stubGlobal("cancelAnimationFrame", priorCancelFrame);
      }
    },
    120_000,
  );
});
