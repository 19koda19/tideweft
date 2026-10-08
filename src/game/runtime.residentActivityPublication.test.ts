import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { createWorld, createWorldView, deserializeWorld, serializeWorld, type WorldState } from "../sim/public";
import type { WorldView } from "../sim/types";
import { stableStringify } from "../sim/util";
import { residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { deserializeBio0Ecology, type Bio0EcologyState } from "./bio0Ecology";
import { livingActorAddressForResident } from "./livingActor";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView, isImmutableRegionalWorldView, regionalCompatibilityWorldForWorld, regionalWindowForWorld, regionalWorldViewPhysicalPublication } from "./regionalWorldView";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { createTideweftRuntime, prepareRuntimeResidentActivityPublication } from "./runtime";

vi.mock("../audio/soundscape", () => ({
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
