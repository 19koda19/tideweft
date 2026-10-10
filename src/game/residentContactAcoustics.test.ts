import { describe, expect, it } from "vitest";

import { headingFromRadians } from "./livingActor";
import { evaluatePhysicalAcousticListener } from "./physicalAcousticPerception";
import { deriveResidentContactAcoustics, RESIDENT_CONTACT_ACOUSTIC_MAX_SOURCES } from "./residentContactAcoustics";
import { adoptResidentActivities, advanceResidentRestActivities, prepareResidentRestActivities } from "./residentActivityExecution";
import { resolveResidentWorldPlacement } from "./residentSpatial";
import { realizeWorldAcousticText } from "./worldAcousticPresentation";
import { acousticMaterialForTerrainContact } from "./worldAcoustics";
import { createWorldPosition, translateWorldPosition, worldPositionDelta, type WorldPosition } from "./worldPosition";
import { assertWorldInvariants, createWorld, deserializeWorld, runTicks, serializeWorld, stepWorld } from "../sim/public";
import { replaceResidentActivity, type ResidentActivity } from "../sim/residentActivity";
import { canonicalResidentActivityForWorld, residentRestTargetHasDrySupport, residentSettlementRestTarget } from "../sim/residentActivityWorld";
import { prepareResidentTravelAdvance, revokeResidentTravelAdvance } from "../sim/residentTravelAdvance";
import { MAX_TIDE_LEVEL, waterDepthAt } from "../sim/terrain";
import type { WorldState } from "../sim/types";

const BASE = createWorld("resident activity executable rest approach", "standard");
const WINDOW = { origin: { x: -10, y: -10 }, terrain: { width: 120, height: 120 } };

/** Adapter/prefix foundations, not normal runtime activation or audible play. */
function freshWorld(): WorldState {
  const world = structuredClone(BASE);
  world.weather = { kind: "clear", intensity: 0, windX: 0, windY: 0, nextChangeTick: world.meta.completedTick + 1_000 };
  for (const resident of world.residents) {
    resident.needs = { food: 100_000, rest: 100_000, belonging: 900_000 };
    resident.condition.exhaustion = 100_000;
  }
  for (const contract of world.contracts) {
    contract.playerExclusiveUntilTick = world.meta.completedTick + 1_000;
    contract.dueTick = world.meta.completedTick + 2_000;
  }
  return world;
}

function protocol(activity: ResidentActivity, version: ResidentActivity["version"]): ResidentActivity {
  // Explicit exact cold-protocol setup only; no runtime upgrade is inferred.
  return {
    version, ownerId: `sim:resident-activity:v${version}` as ResidentActivity["ownerId"],
    actorId: activity.actorId, tick: activity.tick, poses: activity.poses, restTask: activity.restTask,
    ...(version >= 2 ? { rationTask: null } : {}),
    ...(version >= 3 ? { materialTask: null } : {}),
    ...(version >= 4 ? { inspectionTask: null } : {}),
    ...(version >= 6 ? { pickupTask: null } : {}),
    ...(version >= 7 ? { travelTask: null } : {}),
  };
}

function currentBodies(world: WorldState): void {
  expect(adoptResidentActivities(world)).toBe(true);
  world.residents = world.residents.map((resident) => replaceResidentActivity(resident, protocol(resident.activity!, 8)));
}

function residentAt(world: WorldState, actorId: string) {
  return world.residents.find(({ identity }) => identity.stableId === actorId)!;
}

function tileAt(world: WorldState, position: WorldPosition) {
  return world.terrain.tiles[Math.floor(position.localY / 1_000) * world.terrain.width + Math.floor(position.localX / 1_000)]!;
}

function realApproach() {
  const world = freshWorld();
  const resident = world.residents.find((candidate) => {
    const source = resolveResidentWorldPlacement(world, candidate)?.position;
    const target = residentSettlementRestTarget(world, candidate);
    if (!source || !target || !residentRestTargetHasDrySupport(world, source)
      || !residentRestTargetHasDrySupport(world, target)) return false;
    const delta = worldPositionDelta(source, target);
    return Math.abs(delta.x) + Math.abs(delta.y) === 1_000;
  });
  if (!resident) throw new Error("Native fixture has no one-tile dry rest approach");
  resident.needs.rest = 900_000;
  resident.condition.exhaustion = 300_000;
  const actorId = resident.identity.stableId;
  const source = resolveResidentWorldPlacement(world, resident)!.position;
  currentBodies(world);
  expect(prepareResidentRestActivities(world)).toBe(true);
  expect(residentAt(world, actorId).activity!.restTask?.phase).toBe("approaching");
  return { world, actorId, source };
}

function advance(world: WorldState, from: number, to: number): void {
  for (let phase = from; phase <= to; phase += 1) expect(advanceResidentRestActivities(world, phase, WINDOW)).not.toBeNull();
}

/** Synthetic accepted-prefix codec fixture: no task, movement or admission claim. */
function prefix(phase = 9, moverCount = 1, version: ResidentActivity["version"] = 8) {
  const world = freshWorld();
  currentBodies(world);
  const anchor = world.residents[0]!.activity!.poses[0]!.position;
  const start = createWorldPosition(anchor.region, Math.floor(anchor.localX / 1_000) * 1_000 + 950, anchor.localY);
  const movers = world.residents.slice(0, moverCount).map(({ identity }) => identity.stableId);
  for (const offset of [0, 105, 1_050]) Object.assign(tileAt(world, translateWorldPosition(start, offset, 0)), {
    terrain: "meadow", elevation: MAX_TIDE_LEVEL + 1,
  });
  world.residents = world.residents.map((resident) => {
    const moving = movers.includes(resident.identity.stableId);
    const origin = moving ? { position: start, heading: headingFromRadians(0) } : resident.activity!.poses[0]!;
    return replaceResidentActivity(resident, {
      ...protocol(resident.activity!, version), restTask: null,
      poses: Array.from({ length: phase + 1 }, (_, accepted) => moving
        ? { position: translateWorldPosition(start, accepted * 105, 0), heading: headingFromRadians(0) }
        : origin),
    });
  });
  expect(world.residents.every((resident) => canonicalResidentActivityForWorld(world, resident) !== null)).toBe(true);
  return { world, actorId: movers[0]!, movers, start };
}

describe("resident committed dry-contact acoustic producer", () => {
  it("derives one frozen physical cause from genuine rest motion, not from task intention", () => {
    const { world, actorId, source } = realApproach();
    expect(deriveResidentContactAcoustics(world, WINDOW, 0)).toEqual([]);
    advance(world, 1, 4);
    expect(deriveResidentContactAcoustics(world, WINDOW, 4)).toEqual([]);
    advance(world, 5, 5);
    const before = serializeWorld(world);
    const facts = deriveResidentContactAcoustics(world, WINDOW, 5)!;
    expect(facts).toHaveLength(1);
    const fact = facts[0]!;
    const entered = residentAt(world, actorId).activity!.poses[5]!.position;
    expect(entered).not.toEqual(source);
    expect(tileAt(world, entered).index).not.toBe(tileAt(world, source).index);
    expect(fact).toMatchObject({ phase: 5, event: {
      domain: "traversal", sourceId: actorId, sourceCategory: "human", sourcePosition: entered,
      occurredAtTick: world.meta.completedTick, sourceMaterial: "body", interrupt: "none",
      surfaceMaterial: acousticMaterialForTerrainContact({ terrain: tileAt(world, entered).terrain, waterDepth: 0 }),
      textualEligibility: "audio-only", accessibilityRelevance: "routine",
    } });
    expect(fact.sample).toMatchObject({ sourceId: actorId, acousticEventId: fact.event.eventId,
      position: entered, soundClass: fact.event.soundClass, soundLoudness: fact.event.intensity, soundRangeUnits: 6_000 });
    expect([facts, fact, fact.event, fact.sample, fact.event.sourcePosition, fact.sample.position].every(Object.isFrozen)).toBe(true);
    expect(serializeWorld(world)).toBe(before);
    advance(world, 6, 10);
    expect(residentAt(world, actorId).activity!.restTask?.phase).toBe("arrived");
    expect(deriveResidentContactAcoustics(world, WINDOW, 10)).toEqual(facts);
    assertWorldInvariants(world);
  });

  it("keeps detached phase4/9 derivation exact and consumes the prefix at the real world boundary", () => {
    const { world } = realApproach();
    advance(world, 1, 4);
    const phase4 = serializeWorld(world);
    const cold = deserializeWorld(phase4);
    expect(deriveResidentContactAcoustics(cold, WINDOW, 4)).toEqual(deriveResidentContactAcoustics(world, WINDOW, 4));
    expect(serializeWorld(cold)).toBe(phase4);
    advance(world, 5, 9);
    advance(cold, 5, 9);
    expect(serializeWorld(cold)).toBe(serializeWorld(world));
    const phase9 = serializeWorld(world);
    const loaded = deserializeWorld(phase9);
    expect(deriveResidentContactAcoustics(loaded, WINDOW, 9)).toEqual(deriveResidentContactAcoustics(world, WINDOW, 9));
    expect(serializeWorld(loaded)).toBe(phase9);
    advance(world, 10, 10);
    const admission = prepareResidentTravelAdvance(world, WINDOW);
    expect(admission).not.toBeNull();
    try { stepWorld(world, [], undefined, undefined, admission!); }
    finally { revokeResidentTravelAdvance(admission!); }
    expect(world.residents.every(({ activity }) => activity?.poses.length === 1)).toBe(true);
    expect(deriveResidentContactAcoustics(world, WINDOW, 0)).toEqual([]);
    assertWorldInvariants(world);
  });

  it("does not turn stationary, same-cell or blocked real motion into foot contacts", () => {
    const { world, actorId, source } = realApproach();
    tileAt(world, source).terrain = "deep-water";
    advance(world, 1, 9);
    expect(residentAt(world, actorId).activity!.poses.at(-1)!.position).toEqual(source);
    expect(deriveResidentContactAcoustics(world, WINDOW, 9)).toEqual([]);
    const sameCell = prefix(4, 0).world;
    const first = sameCell.residents[0]!;
    const origin = first.activity!.poses[0]!.position;
    sameCell.residents[0] = replaceResidentActivity(first, { ...first.activity!, poses: Array.from({ length: 5 }, (_, phase) => ({
      position: translateWorldPosition(origin, phase * 25, 0), heading: headingFromRadians(0),
    })) });
    expect(deriveResidentContactAcoustics(sameCell, WINDOW, 4)).toEqual([]);
    const absent = freshWorld();
    const bytes = serializeWorld(absent);
    expect(deriveResidentContactAcoustics(absent, WINDOW, 9)).toEqual([]);
    expect(serializeWorld(absent)).toBe(bytes);
  });

  it.each([1, 2, 3, 4, 5, 6, 7] as const)("leaves frozen v%s accepted prefixes silent", (version) => {
    const { world } = prefix(9, 1, version);
    expect(deriveResidentContactAcoustics(world, WINDOW, 9)).toEqual([]);
  });

  it("does not manufacture fine contact from authentic coarse carried journeys", () => {
    const world = runTicks(structuredClone(BASE), 659);
    expect(world.residents.some(({ location }) => location.kind === "route")).toBe(true);
    expect(adoptResidentActivities(world)).toBe(true);
    world.residents = world.residents.map((resident) => replaceResidentActivity(resident, {
      ...protocol(resident.activity!, 8),
      travelTask: resident.location.kind === "route" ? {
        kind: "contract-travel", contractId: resident.activeContractId!, mode: "legacy-coarse", adoptedAtTick: world.meta.completedTick,
      } : null,
      poses: Array.from({ length: 10 }, () => resident.activity!.poses[0]!),
    }));
    expect(world.residents.every((resident) => canonicalResidentActivityForWorld(world, resident) !== null)).toBe(true);
    expect(deriveResidentContactAcoustics(world, WINDOW, 9)).toEqual([]);
    assertWorldInvariants(world);
  });

  it.each(["wet", "deep-water", "malformed-tile", "remote", "outside-window"] as const)("does not invent a local dry cause for %s support", (kind) => {
    const { world, actorId } = prefix(1);
    const resident = residentAt(world, actorId);
    const tile = tileAt(world, resident.activity!.poses[1]!.position);
    if (kind === "wet") tile.elevation = world.tide.level - 1;
    if (kind === "deep-water") tile.terrain = "deep-water";
    if (kind === "malformed-tile") tile.index += 1;
    if (kind === "remote") world.residents[world.residents.indexOf(resident)] = replaceResidentActivity(resident, {
      ...resident.activity!, poses: resident.activity!.poses.map((pose) => ({ ...pose,
        position: createWorldPosition({ x: 1, y: 0 }, pose.position.localX, pose.position.localY),
      })),
    });
    const window = kind === "outside-window" ? { ...WINDOW, origin: { x: 100, y: 100 } } : WINDOW;
    expect(deriveResidentContactAcoustics(world, window, 1)).toEqual([]);
  });

  it("fails closed on mismatched phase, body identity/tick, malformed prefix or a mixed cohort", () => {
    const { world } = prefix(4);
    for (const phase of [-1, -0, 1.5, 3, 5, 11, Number.NaN]) expect(deriveResidentContactAcoustics(world, WINDOW, phase)).toBeNull();
    expect(deriveResidentContactAcoustics(world, { ...WINDOW, terrain: { width: 0, height: 120 } }, 4)).toBeNull();
    for (const contrast of ["tick", "actor", "heading", "missing", "duplicate"] as const) {
      const malformed = structuredClone(world);
      const first = malformed.residents[0]!;
      if (contrast === "tick") first.activity = { ...first.activity!, tick: first.activity!.tick + 1 };
      if (contrast === "actor") first.activity = { ...first.activity!, actorId: malformed.residents[1]!.identity.stableId };
      if (contrast === "heading") first.activity = { ...first.activity!, poses: first.activity!.poses.map((pose) => ({ ...pose, heading: -0 })) };
      if (contrast === "missing") delete first.activity;
      if (contrast === "duplicate") malformed.residents[1] = first;
      expect(deriveResidentContactAcoustics(malformed, WINDOW, 4), contrast).toBeNull();
    }
  });

  it("selects at most eight sources in stable identity order without mutating or fabricating overflow", () => {
    const { world, movers } = prefix(10, 10);
    const bytes = serializeWorld(world);
    const facts = deriveResidentContactAcoustics(world, WINDOW, 10)!;
    expect(facts).toHaveLength(8);
    expect(facts.map(({ event }) => event.sourceId)).toEqual([...movers].sort().slice(0, 8));
    expect(facts.every(({ phase }) => phase === 1)).toBe(true);
    const reverse = structuredClone(world);
    reverse.residents.reverse();
    expect(deriveResidentContactAcoustics(reverse, WINDOW, 10)).toEqual(facts);
    expect(serializeWorld(world)).toBe(bytes);
    const overflow = structuredClone(world);
    while (overflow.residents.length <= RESIDENT_CONTACT_ACOUSTIC_MAX_SOURCES) overflow.residents.push(overflow.residents[0]!);
    expect(deriveResidentContactAcoustics(overflow, WINDOW, 10)).toBeNull();
  });

  it("keeps an early higher-ID cause admitted when lower-ID contacts occur later", () => {
    // Arranged accepted-prefix foundation, not an autonomous crowd fixture.
    const { world, movers, start } = prefix(3, 9);
    const firstId = [...movers].sort().at(-1)!;
    world.residents = world.residents.map((resident) => !movers.includes(resident.identity.stableId) ? resident
      : replaceResidentActivity(resident, { ...resident.activity!, poses: Array.from({ length: 4 }, (_, phase) => ({
        position: translateWorldPosition(start, Math.max(0, phase - (resident.identity.stableId === firstId ? 0 : 1)) * 105, 0),
        heading: headingFromRadians(0),
      })) }));
    const early = structuredClone(world);
    early.residents = early.residents.map((resident) => replaceResidentActivity(resident, {
      ...resident.activity!, poses: resident.activity!.poses.slice(0, 2),
    }));
    const first = deriveResidentContactAcoustics(early, WINDOW, 1)!;
    expect(first).toHaveLength(1);
    expect(first[0]!.event.sourceId).toBe(firstId);
    const closedPrefix = deriveResidentContactAcoustics(world, WINDOW, 3)!;
    expect(closedPrefix).toHaveLength(8);
    expect(closedPrefix[0]).toEqual(first[0]);
    expect(closedPrefix.slice(1).map(({ event }) => event.sourceId))
      .toEqual(movers.filter((id) => id !== firstId).sort().slice(0, 7));
    expect(closedPrefix.slice(1).every(({ phase }) => phase === 2)).toBe(true);
  });

  it("does not select a later replacement contact when the first cause leaves the interaction frame", () => {
    // A shifted physical-window foundation: two real prefix cell crossings,
    // but only the second crossing would fit this later frame.
    const { world, start } = prefix(10);
    const admitted = deriveResidentContactAcoustics(world, WINDOW, 10)!;
    expect(admitted).toHaveLength(1);
    expect(admitted[0]!.phase).toBe(1);
    const rebased = { ...WINDOW, origin: { x: Math.floor(start.localX / 1_000) + 1, y: 0 } };
    expect(deriveResidentContactAcoustics(world, rebased, 10)).toEqual([]);
    expect(deriveResidentContactAcoustics(structuredClone(world), rebased, 10)).toEqual([]);
    expect(deriveResidentContactAcoustics(world, WINDOW, 10)).toEqual(admitted);
  });

  it.each([
    ["meadow", "soil", "foot-contact", "thud"], ["marsh", "foliage", "brush", "rustle"],
    ["ridge", "stone", "foot-contact", "scrape"], ["tidal-flat", "sand", "foot-contact", "thud"],
  ] as const)("uses the shared %s contact material without a species-specific sound map", (terrain, material, action, family) => {
    const { world, actorId } = prefix(1);
    tileAt(world, residentAt(world, actorId).activity!.poses[1]!.position).terrain = terrain;
    expect(deriveResidentContactAcoustics(world, WINDOW, 1)?.[0]?.event).toMatchObject({ surfaceMaterial: material, action, semanticFamily: family });
  });

  it("binds deterministic event/sample identity to the actual material and world seed", () => {
    const { world, actorId } = prefix(1);
    const original = deriveResidentContactAcoustics(world, WINDOW, 1)![0]!;
    expect(deriveResidentContactAcoustics(structuredClone(world), WINDOW, 1)).toEqual([original]);
    const changedMaterial = structuredClone(world);
    tileAt(changedMaterial, residentAt(changedMaterial, actorId).activity!.poses[1]!.position).terrain = "ridge";
    const stone = deriveResidentContactAcoustics(changedMaterial, WINDOW, 1)![0]!;
    // Pure identity contrast, not permission to change signed generation inputs.
    const changedSeed = structuredClone(world);
    changedSeed.meta.rootSeed[0] = (changedSeed.meta.rootSeed[0] + 1) >>> 0;
    const seeded = deriveResidentContactAcoustics(changedSeed, WINDOW, 1)![0]!;
    expect(stone.event.eventId).not.toBe(original.event.eventId);
    expect(seeded.event.eventId).not.toBe(original.event.eventId);
    expect(stone.sample.acousticEventId).toBe(stone.event.eventId);
    expect(seeded.sample.acousticEventId).toBe(seeded.event.eventId);
  });

  it("permits anonymous physical hearing while routine text stays suppressed", () => {
    const { world } = prefix(1);
    const fact = deriveResidentContactAcoustics(world, WINDOW, 1)![0]!;
    const hearing = evaluatePhysicalAcousticListener({ observationId: "resident-contact-hearing", observerId: "independent-listener",
      observerPosition: translateWorldPosition(fact.sample.position, -500, 0), observedAtTick: world.meta.completedTick + 1,
      sample: fact.sample, effectiveRangeUnits: fact.sample.soundRangeUnits, ambientNoise: 0, wind: { x: 0, y: 0 } });
    expect(hearing?.kind).toBe("heard");
    if (hearing?.kind !== "heard") throw new Error("Physical hearing fixture did not receive its nearby contact");
    expect(hearing.observation).toMatchObject({ channel: "hearing", identification: "anonymous", subjectId: null });
    expect(hearing.observation.area.radiusUnits).toBeGreaterThan(0);
    expect(Object.hasOwn(hearing.observation, "sourceId")).toBe(false);
    expect(Object.hasOwn(hearing.observation, "acousticEventId")).toBe(false);
    expect(realizeWorldAcousticText(fact.event, fact.event.durationSteps)).toBeNull();
    expect(deriveResidentContactAcoustics(world, WINDOW, 1)).toEqual([fact]);
  });
});

const WET_CONTACT_ACTOR = "H-v1-p0p0-1d9rhmy-2-1kt45xu";

/** Generated geometry/selection, with explicit lower-owner v8 activation only. */
function generatedWetApproach() {
  const world = runTicks(createWorld("settlement keeper home night continuity", "wild"), 25);
  const human = residentAt(world, WET_CONTACT_ACTOR);
  const source = resolveResidentWorldPlacement(world, human)!.position;
  const target = residentSettlementRestTarget(world, human)!;
  expect(world.meta.completedTick).toBe(445);
  expect(human).toMatchObject({ id: 84, activeContractId: null, intention: "work" });
  expect(source).toMatchObject({ localX: 88_500, localY: 47_500 });
  expect(target).toMatchObject({ localX: 89_500, localY: 47_500 });
  expect(waterDepthAt(tileAt(world, source), world.tide)).toBe(41_474);
  expect(residentRestTargetHasDrySupport(world, target)).toBe(true);
  // No need, skill, weather, terrain, task, pose or successful motion is
  // authored. This is an adapter foundation, not runtime activation/playback.
  currentBodies(world);
  expect(prepareResidentRestActivities(world)).toBe(true);
  expect(residentAt(world, WET_CONTACT_ACTOR).activity!.materialTask).toMatchObject({
    kind: "settlement-material", projectId: 15, resource: "medicine", phase: "approaching", target,
  });
  assertWorldInvariants(world);
  return { world, actorId: WET_CONTACT_ACTOR, source, target };
}

function ownContactFacts(world: WorldState, phase: number, actorId: string) {
  const facts = deriveResidentContactAcoustics(world, WINDOW, phase);
  expect(facts).not.toBeNull();
  return facts!.filter(({ event }) => event.sourceId === actorId);
}

/** Arranged accepted-prefix/terrain codec foundation, never autonomous motion. */
function wetPrefix(offsets: readonly (readonly [number, number])[], version: ResidentActivity["version"] = 8) {
  const { world, actorId } = prefix(offsets.length - 1, 1, version);
  const cell = { x: 20, y: 20 };
  for (let y = cell.y - 1; y <= cell.y + 2; y += 1) {
    for (let x = cell.x - 1; x <= cell.x + 2; x += 1) {
      Object.assign(world.terrain.tiles[y * world.terrain.width + x]!, {
        terrain: "meadow", elevation: MAX_TIDE_LEVEL + 1,
      });
    }
  }
  const sourceTile = world.terrain.tiles[cell.y * world.terrain.width + cell.x]!;
  Object.assign(sourceTile, { terrain: "marsh", elevation: world.tide.level - 1_000 });
  let heading = headingFromRadians(0);
  const poses = offsets.map(([x, y], phase) => {
    const prior = offsets[phase - 1];
    if (prior !== undefined && (x !== prior[0] || y !== prior[1])) heading = headingFromRadians(Math.atan2(y - prior[1], x - prior[0]));
    return { position: createWorldPosition({ x: 0, y: 0 }, cell.x * 1_000 + x, cell.y * 1_000 + y), heading };
  });
  world.residents = world.residents.map((resident) => resident.identity.stableId === actorId
    ? replaceResidentActivity(resident, { ...resident.activity!, poses }) : resident);
  expect(world.residents.every((resident) => canonicalResidentActivityForWorld(world, resident) !== null)).toBe(true);
  return { world, actorId, sourceTile, poses, cell };
}

describe("resident occupied-source wet-contact acoustic foundations", () => {
  it("derives one before-anchored slosh from real generated tick445 motion and retains it after dry arrival", () => {
    const { world, actorId, source, target } = generatedWetApproach();
    expect(ownContactFacts(world, 0, actorId)).toEqual([]);
    advance(world, 1, 1);
    const moved = residentAt(world, actorId).activity!.poses[1]!.position;
    expect(worldPositionDelta(source, moved)).toEqual({ x: 105, y: 0 });
    expect(tileAt(world, source).index).toBe(tileAt(world, moved).index);
    // The shared dog classification remains unchanged below its 60k threshold.
    expect(acousticMaterialForTerrainContact({ terrain: tileAt(world, source).terrain,
      waterDepth: waterDepthAt(tileAt(world, source), world.tide) })).not.toBe("water");
    const bytes = serializeWorld(world);
    const facts = ownContactFacts(world, 1, actorId);
    expect(facts).toHaveLength(1);
    const fact = facts[0]!;
    expect(fact).toMatchObject({ phase: 1, event: {
      domain: "traversal", sourceId: actorId, sourceCategory: "human", sourcePosition: source,
      occurredAtTick: 445, sourceMaterial: "body", surfaceMaterial: "water", action: "foot-contact",
      semanticFamily: "slosh", soundClass: "physical-slosh", intensity: 280_000, interrupt: "none",
      rangeUnits: 6_000, textualEligibility: "audio-only", accessibilityRelevance: "routine",
    } });
    expect(fact.sample).toMatchObject({ sourceId: actorId, acousticEventId: fact.event.eventId,
      position: source, soundClass: "physical-slosh", soundInterrupt: "none", soundLoudness: 280_000,
      soundRangeUnits: 6_000 });
    expect([fact, fact.event, fact.sample, fact.event.sourcePosition, fact.sample.position].every(Object.isFrozen)).toBe(true);
    expect(serializeWorld(world)).toBe(bytes);
    for (let phase = 2; phase <= 10; phase += 1) {
      advance(world, phase, phase);
      expect(ownContactFacts(world, phase, actorId)).toEqual(facts);
      if (phase === 4) expect(tileAt(world, residentAt(world, actorId).activity!.poses[4]!.position).index)
        .toBe(tileAt(world, source).index);
      if (phase === 5) expect(residentRestTargetHasDrySupport(world, residentAt(world, actorId).activity!.poses[5]!.position)).toBe(true);
    }
    expect(residentAt(world, actorId).activity!.poses[10]!.position).toEqual(target);
    expect(residentAt(world, actorId).activity!.materialTask?.phase).toBe("arrived");
    assertWorldInvariants(world);
  });

  it("keeps wet phase4/9 clone and inner-save causes exact until real closure consumes the prefix", () => {
    const { world, actorId } = generatedWetApproach();
    advance(world, 1, 4);
    const phase4 = serializeWorld(world);
    const clone = structuredClone(world);
    const cold = deserializeWorld(phase4);
    const facts = ownContactFacts(world, 4, actorId);
    expect(facts).toHaveLength(1);
    for (const branch of [clone, cold]) {
      expect(serializeWorld(branch)).toBe(phase4);
      expect(ownContactFacts(branch, 4, actorId)).toEqual(facts);
    }
    for (const branch of [world, clone, cold]) advance(branch, 5, 9);
    const phase9 = serializeWorld(world);
    expect(serializeWorld(clone)).toBe(phase9);
    expect(serializeWorld(cold)).toBe(phase9);
    const cold9 = deserializeWorld(phase9);
    expect(ownContactFacts(cold9, 9, actorId)).toEqual(facts);
    expect(serializeWorld(cold9)).toBe(phase9);
    for (const branch of [world, cold9]) {
      advance(branch, 10, 10);
      expect(ownContactFacts(branch, 10, actorId)).toEqual(facts);
      const admission = prepareResidentTravelAdvance(branch, WINDOW);
      expect(admission).not.toBeNull();
      try { stepWorld(branch, [], undefined, undefined, admission!); }
      finally { revokeResidentTravelAdvance(admission!); }
      expect(branch.residents.every(({ activity }) => activity?.poses.length === 1)).toBe(true);
      expect(deriveResidentContactAcoustics(branch, WINDOW, 0)).toEqual([]);
      assertWorldInvariants(branch);
    }
    expect(serializeWorld(cold9)).toBe(serializeWorld(world));
    // This proves pending/consumed derivation, not actual audio playback.
  });

  it("does not sound a genuine wet-source attempt rejected by actual reserve", () => {
    const { world, actorId, source } = generatedWetApproach();
    residentAt(world, actorId).condition.exhaustion = 1_000_000; // Cause-only physical counterfactual.
    advance(world, 1, 1);
    expect(residentAt(world, actorId).activity!.poses[1]!.position).toEqual(source);
    expect(residentAt(world, actorId).activity!.materialTask).toMatchObject({ phase: "waiting", waitReason: "no-traversable-route" });
    expect(ownContactFacts(world, 1, actorId)).toEqual([]);
  });

  it("retains accepted wet contact when a later reserve loss stops new movement", () => {
    const { world, actorId } = generatedWetApproach();
    advance(world, 1, 4);
    const facts = ownContactFacts(world, 4, actorId);
    expect(facts).toHaveLength(1);
    const lastPose = residentAt(world, actorId).activity!.poses[4]!;
    residentAt(world, actorId).condition.exhaustion = 1_000_000; // Later physical cause, not a result assignment.
    advance(world, 5, 5);
    expect(residentAt(world, actorId).activity!.poses[5]).toEqual(lastPose);
    expect(residentAt(world, actorId).activity!.materialTask?.phase).toBe("waiting");
    expect(ownContactFacts(world, 5, actorId)).toEqual(facts);
  });

  it.each([
    ["stationary", [500, 500], [500, 500], false],
    ["lower-x outward", [0, 500], [-10, 500], false],
    ["lower-y outward", [500, 0], [500, -10], false],
    ["corner outward diagonal", [0, 0], [-10, 10], false],
    ["lower edge parallel", [0, 500], [0, 510], true],
    ["lower edge inward", [0, 500], [10, 500], true],
    ["one wet unit before dry exit", [1, 500], [-9, 500], true],
    ["interior diagonal dry exit", [1, 1], [-9, -9], true],
    ["upper edge owned by dry neighbor", [1_000, 500], [990, 500], false],
  ] as const)("requires positive half-open source contact for %s", (_name, before, after, audible) => {
    const { world, actorId, poses } = wetPrefix([before, after]);
    const facts = ownContactFacts(world, 1, actorId);
    expect(facts).toHaveLength(audible ? 1 : 0);
    if (audible) expect(facts[0]!).toMatchObject({ phase: 1, event: {
      sourcePosition: poses[0]!.position, surfaceMaterial: "water", semanticFamily: "slosh",
    } });
  });

  it("never treats invalid/deep/remote support or another wet cell as an occupied-source contact", () => {
    for (const contrast of ["wet-destination", "deep-source", "deep-destination", "malformed-source", "malformed-destination", "remote"] as const) {
      const { world, actorId, sourceTile, poses } = wetPrefix([[950, 500], [1_055, 500]]);
      const destination = tileAt(world, poses[1]!.position);
      if (contrast === "wet-destination") destination.elevation = world.tide.level - 1_000;
      if (contrast === "deep-source") sourceTile.terrain = "deep-water";
      if (contrast === "deep-destination") destination.terrain = "deep-water";
      if (contrast === "malformed-source") sourceTile.index += 1;
      if (contrast === "malformed-destination") destination.index += 1;
      if (contrast === "remote") world.residents = world.residents.map((resident) => resident.identity.stableId === actorId
        ? replaceResidentActivity(resident, { ...resident.activity!, poses: resident.activity!.poses.map((pose) => ({
          ...pose, position: createWorldPosition({ x: 1, y: 0 }, pose.position.localX, pose.position.localY),
        })) }) : resident);
      expect(ownContactFacts(world, 1, actorId), contrast).toEqual([]);
    }
    for (const version of [1, 2, 3, 4, 5, 6, 7] as const) {
      const { world, actorId } = wetPrefix([[500, 500], [510, 500]], version);
      expect(ownContactFacts(world, 1, actorId), `frozen v${version}`).toEqual([]);
    }
  });

  it("keeps both accepted endpoints in frame and never replaces an excluded wet cause with later dry entry", () => {
    const { world, actorId, poses, cell } = wetPrefix(Array.from({ length: 11 }, (_, phase) => [950 + phase * 105, 500] as const));
    const original = ownContactFacts(world, 10, actorId);
    expect(original).toHaveLength(1);
    expect(original[0]!.phase).toBe(1);
    expect(original[0]!.event.sourcePosition).toEqual(poses[0]!.position);
    const beforeOnly = { origin: { x: cell.x, y: cell.y }, terrain: { width: 1, height: 1 } };
    expect(Math.floor(poses[0]!.position.localX / 1_000)).toBe(cell.x);
    expect(Math.floor(poses[1]!.position.localX / 1_000)).toBe(cell.x + 1);
    expect(deriveResidentContactAcoustics(world, beforeOnly, 10)).toEqual([]);
    const rebased = { ...WINDOW, origin: { x: cell.x + 1, y: cell.y } };
    // The phase10 dry entry fits the later frame; the first wet pair does not.
    expect(Math.floor(poses[9]!.position.localX / 1_000)).toBe(cell.x + 1);
    expect(Math.floor(poses[10]!.position.localX / 1_000)).toBe(cell.x + 2);
    expect(deriveResidentContactAcoustics(world, rebased, 10)).toEqual([]);
    expect(deriveResidentContactAcoustics(structuredClone(world), rebased, 10)).toEqual([]);
    expect(ownContactFacts(world, 10, actorId)).toEqual(original);
  });

  it("preserves early wet admission against later lower-ID dry overflow", () => {
    const { world, movers, start } = prefix(3, 9);
    const wetId = [...movers].sort().at(-1)!;
    const startX = Math.floor(start.localX / 1_000);
    const wetStart = createWorldPosition(start.region, (startX < 48 ? startX + 10 : startX - 10) * 1_000 + 500, start.localY);
    Object.assign(tileAt(world, wetStart), { terrain: "marsh", elevation: world.tide.level - 1_000 });
    world.residents = world.residents.map((resident) => !movers.includes(resident.identity.stableId) ? resident
      : replaceResidentActivity(resident, { ...resident.activity!, poses: Array.from({ length: 4 }, (_, phase) => ({
        position: resident.identity.stableId === wetId ? translateWorldPosition(wetStart, phase * 25, 0)
          : translateWorldPosition(start, Math.max(0, phase - 1) * 105, 0),
        heading: headingFromRadians(0),
      })) }));
    const early = structuredClone(world);
    early.residents = early.residents.map((resident) => replaceResidentActivity(resident, {
      ...resident.activity!, poses: resident.activity!.poses.slice(0, 2),
    }));
    const first = deriveResidentContactAcoustics(early, WINDOW, 1)!;
    expect(first).toHaveLength(1);
    expect(first[0]!.event).toMatchObject({ sourceId: wetId, surfaceMaterial: "water", semanticFamily: "slosh" });
    const complete = deriveResidentContactAcoustics(world, WINDOW, 3)!;
    expect(complete).toHaveLength(8);
    expect(complete[0]).toEqual(first[0]);
    expect(complete.slice(1).map(({ event }) => event.sourceId)).toEqual(movers.filter((id) => id !== wetId).sort().slice(0, 7));
    expect(complete.slice(1).every(({ phase, event }) => phase === 2 && event.surfaceMaterial !== "water")).toBe(true);
    const reverse = structuredClone(world);
    reverse.residents.reverse();
    expect(deriveResidentContactAcoustics(reverse, WINDOW, 3)).toEqual(complete);
  });

  it("exposes wet contact only as anonymous hearing, excluding self and complete masking without text", () => {
    const { world, actorId } = wetPrefix([[500, 500], [510, 500]]);
    const fact = ownContactFacts(world, 1, actorId)[0]!;
    const input = { observationId: "resident-wet-contact-hearing", observerId: "independent-listener",
      observerPosition: translateWorldPosition(fact.sample.position, 500, 0), observedAtTick: world.meta.completedTick + 1,
      sample: fact.sample, effectiveRangeUnits: fact.sample.soundRangeUnits, ambientNoise: 0, wind: { x: 0, y: 0 } };
    const heard = evaluatePhysicalAcousticListener(input);
    expect(heard?.kind).toBe("heard");
    if (heard?.kind !== "heard") throw new Error("Nearby wet-contact foundation received no real acoustic receipt");
    expect(heard.observation).toMatchObject({ channel: "hearing", perceivedClass: "physical-slosh", subjectId: null, identification: "anonymous" });
    expect(heard.observation.area.radiusUnits).toBeGreaterThan(0);
    expect(heard.observation.area.center).not.toEqual(fact.event.sourcePosition);
    expect(Object.hasOwn(heard.observation, "sourceId")).toBe(false);
    expect(Object.hasOwn(heard.observation, "acousticEventId")).toBe(false);
    expect(evaluatePhysicalAcousticListener({ ...input, observerId: actorId })).toEqual({ kind: "not-heard" });
    expect(evaluatePhysicalAcousticListener({ ...input, ambientNoise: 1 })).toEqual({ kind: "not-heard" });
    expect(realizeWorldAcousticText(fact.event, fact.event.durationSteps)).toBeNull();
    expect(ownContactFacts(world, 1, actorId)).toEqual([fact]);
  });
});
