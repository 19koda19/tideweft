import { describe, expect, it } from "vitest";

import {
  ACTOR_PERCEPTION_SCALE,
  MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
  createActorObservation,
  type ActorObservation,
} from "../sim/actorPerception";
import { REGION_COORD_LIMIT, createRegionCoord } from "../sim/regions";
import { seedFromText } from "../sim/rng";
import { stableStringify } from "../sim/util";
import {
  CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  replaceCoreWildlifeActorPhysiology,
  type CoreWildlifeActorState,
  type CoreWildlifeFoodOpportunity,
} from "./coreWildlifeActor";
import {
  CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS,
  CORE_ECOLOGY_PATCH_VERSION,
  canonicalizeCoreEcologyPatch,
  coreEcologyActor,
  createCoreEcologyAlarmObservation,
  createCoreEcologyPatch,
  deserializeCoreEcologyPatch,
  migrateLegacyCoreEcologyPatch,
  replaceCoreEcologyActor,
  serializeCoreEcologyPatch,
  setCoreEcologyMaterializedActors,
  stepCoreEcologyPatch,
  type CoreEcologyPatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  createCoreEcologyGroup,
  createCoreEcologyGroupSet,
  stepCoreEcologyGroupCoarse,
} from "./coreEcologyGroups";
import {
  REGION_HEIGHT_UNITS,
  REGION_WIDTH_UNITS,
  createWorldPosition,
} from "./worldPosition";

const ORIGIN = createRegionCoord(-14, 27);
const SEED = seedFromText("bounded player-independent ecology patch");

function population(
  species: "deer" | "gull" | "black-bear",
  ordinals: readonly number[] = [0],
  materialized = true,
): CoreEcologyPopulationInput {
  return {
    species,
    populationKey: `${species}:wave-a`,
    members: ordinals.map((populationOrdinal) => ({
      populationOrdinal,
      position: createWorldPosition(
        ORIGIN,
        10_000 + populationOrdinal * 200,
        20_000 + populationOrdinal * 200,
      ),
      heading: populationOrdinal * 10_000,
      materialization: materialized ? "materialized" as const : "coarse" as const,
    })),
  };
}

function patch(
  populations: readonly CoreEcologyPopulationInput[] = [
    population("deer"),
    population("gull"),
    population("black-bear"),
  ],
): CoreEcologyPatchState {
  return createCoreEcologyPatch({
    seed: SEED,
    patchKey: "east-marsh:wave-a",
    originRegion: ORIGIN,
    populations,
  });
}

function members(state: CoreEcologyPatchState) {
  return state.populations.flatMap(({ members: populationMembers }) => populationMembers);
}

function bySpecies(
  state: CoreEcologyPatchState,
  species: "deer" | "gull" | "black-bear",
): CoreWildlifeActorState {
  const result = members(state).find(({ actor }) => actor.identity.species === species)?.actor;
  if (result === undefined) throw new Error(`Patch fixture has no ${species}`);
  return result;
}

function directObservation(
  actor: CoreWildlifeActorState,
  tick: number,
  id: string,
  perceivedClass: string,
  subjectId: string,
): ActorObservation {
  const result = createActorObservation({
    id,
    observerId: actor.identity.stableId,
    observedAtTick: tick,
    channel: "vision",
    perceivedClass,
    subjectId,
    area: { center: actor.address.position, radiusUnits: 0 },
    confidence: ACTOR_PERCEPTION_SCALE,
    salience: ACTOR_PERCEPTION_SCALE,
    identification: "identified",
  });
  if (result === null) throw new Error("Invalid direct observation fixture");
  return result;
}

function actorStep(
  actor: CoreWildlifeActorState,
  observations: readonly ActorObservation[] = [],
  foodOpportunities: readonly CoreWildlifeFoodOpportunity[] = [],
) {
  return {
    actorId: actor.identity.stableId,
    observations,
    foodOpportunities,
    accessibility: CORE_WILDLIFE_ALL_ACTIONS_ACCESSIBLE,
  };
}

function emptySteps(state: CoreEcologyPatchState) {
  return members(state)
    .filter(({ materialization }) => materialization === "materialized")
    .map(({ actor }) => actorStep(actor));
}

describe("bounded core ecology patch", () => {
  it("materializes deterministic populations independent of input array order", () => {
    const populations = [
      population("black-bear", [1, 0]),
      population("gull", [2, 0, 1]),
      population("deer", [1, 0]),
    ];
    const first = patch(populations);
    const second = patch([...populations].reverse().map((entry) => ({
      ...entry,
      members: [...entry.members].reverse(),
    })));
    expect(second).toEqual(first);
    expect(first.version).toBe(CORE_ECOLOGY_PATCH_VERSION);
    expect(first.populations.map(({ species }) => species)).toEqual([
      "black-bear",
      "deer",
      "gull",
    ]);
    expect(new Set(members(first).map(({ actor }) => actor.identity.stableId)).size)
      .toBe(members(first).length);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.populations)).toBe(true);
  });

  it("roundtrips patch state and rejects cross-population or extra-field aliases", () => {
    const state = patch();
    const encoded = serializeCoreEcologyPatch(state);
    expect(deserializeCoreEcologyPatch(encoded)).toEqual(state);
    expect(serializeCoreEcologyPatch(deserializeCoreEcologyPatch(encoded))).toBe(encoded);
    expect(deserializeCoreEcologyPatch(`\n${encoded}`)).toBeNull();
    expect(canonicalizeCoreEcologyPatch({ ...state, debug: true })).toBeNull();

    const first = state.populations[0]?.members[0];
    const second = state.populations[1]?.members[0];
    if (first === undefined || second === undefined) throw new Error("Patch fixture is incomplete");
    const aliased = {
      ...state,
      populations: state.populations.map((entry, populationIndex) => ({
        ...entry,
        members: entry.members.map((member, memberIndex) => ({
          ...member,
          actor: populationIndex === 0 && memberIndex === 0 ? second.actor : member.actor,
        })),
      })),
    };
    expect(canonicalizeCoreEcologyPatch(aliased)).toBeNull();
  });

  it("retains coarse member identity and dynamic state across bounded materialization changes", () => {
    const state = patch([population("deer", [0, 1], false)]);
    const [first, second] = members(state);
    if (first === undefined || second === undefined) throw new Error("Two deer required");
    const materialized = setCoreEcologyMaterializedActors(state, {
      atTick: 3,
      actorIds: [second.actor.identity.stableId],
    });
    expect(members(materialized).map(({ materialization }) => materialization))
      .toEqual(["coarse", "materialized"]);
    expect(coreEcologyActor(materialized, first.actor.identity.stableId)).toEqual(first.actor);
    expect(coreEcologyActor(materialized, second.actor.identity.stableId)).toEqual(second.actor);
    expect(coreEcologyActor(materialized, "DEER-not-owned")).toBeNull();

    const swapped = setCoreEcologyMaterializedActors(materialized, {
      atTick: 4,
      actorIds: [first.actor.identity.stableId],
    });
    expect(members(swapped).map(({ materialization }) => materialization))
      .toEqual(["materialized", "coarse"]);
    expect(() => setCoreEcologyMaterializedActors(swapped, {
      atTick: 5,
      actorIds: ["DEER-not-owned"],
    })).toThrow(/outside its patch/u);
  });

  it("binds aggregate population size to the exact units represented by active-window actors", () => {
    const deer = population("deer", [0, 1]);
    const state = patch([{
      ...deer,
      populationSize: 4,
      members: deer.members.map((member) => ({ ...member, representedUnits: 2 })),
    }]);
    expect(state.populations[0]).toMatchObject({ populationSize: 4 });
    expect(state.populations[0]?.members.map(({ representedUnits }) => representedUnits))
      .toEqual([2, 2]);

    const inconsistent = {
      ...state,
      populations: state.populations.map((entry) => ({ ...entry, populationSize: 3 })),
    };
    expect(canonicalizeCoreEcologyPatch(inconsistent)).toBeNull();
  });

  it("adopts the exact legacy actors once without accepting legacy text as current state", () => {
    const state = patch([
      population("deer", [0, 1], false),
      population("gull", [0], false),
    ]);
    const legacyText = stableStringify({
      version: 1,
      patchKey: state.patchKey,
      originRegion: state.originRegion,
      updatedAtTick: state.updatedAtTick,
      populations: state.populations.map((entry) => ({
        species: entry.species,
        populationKey: entry.populationKey,
        populationSize: entry.members.length,
        members: entry.members.map(({ populationOrdinal, materialization, actor }) => ({
          populationOrdinal,
          materialization,
          actor,
        })),
      })),
    });

    expect(deserializeCoreEcologyPatch(legacyText)).toBeNull();
    const migrated = migrateLegacyCoreEcologyPatch(legacyText);
    expect(migrated).not.toBeNull();
    expect(migrated?.derivation).toEqual({ kind: "legacy-fixed-v1" });
    expect(migrated?.groups.groups).toEqual([]);
    expect(migrated?.populations.every((entry) => entry.members.every(
      ({ materialization }) => materialization === "coarse",
    ))).toBe(true);
    expect(migrated?.populations.flatMap(({ members: entries }) =>
      entries.map(({ actor }) => actor)))
      .toEqual(state.populations.flatMap(({ members: entries }) =>
        entries.map(({ actor }) => actor)));
    expect(migrated?.populations.every((entry) => entry.members.every(
      ({ representedUnits }) => representedUnits === 1,
    ))).toBe(true);
    expect(migrateLegacyCoreEcologyPatch(`${legacyText} `)).toBeNull();
    expect(deserializeCoreEcologyPatch(serializeCoreEcologyPatch(migrated))).toEqual(migrated);
  });

  it("enforces profile, total, and materialized population budgets", () => {
    expect(() => patch([population("deer", Array.from({ length: 17 }, (_, index) => index))]))
      .toThrow(/deer population exceeds/u);
    expect(CORE_ECOLOGY_MAX_MATERIALIZED_ACTORS).toBe(24);
    expect(() => patch([
      population("gull", Array.from({ length: 24 }, (_, index) => index)),
      population("deer", [0]),
    ])).toThrow(/materialization budget/u);
    expect(() => patch([{
      ...population("black-bear"),
      members: [{
        ...population("black-bear").members[0]!,
        populationOrdinal: -0,
      }],
    }])).toThrow(/member input/u);
  });

  it("preserves exact identities and saves at signed region extremes", () => {
    for (const originRegion of [
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ]) {
      const state = createCoreEcologyPatch({
        seed: SEED,
        patchKey: "extreme:bear-patch",
        originRegion,
        populations: [{
          species: "black-bear",
          populationKey: "black-bear:extreme",
          members: [{
            populationOrdinal: Number.MAX_SAFE_INTEGER,
            position: createWorldPosition(
              originRegion,
              REGION_WIDTH_UNITS - 1,
              REGION_HEIGHT_UNITS - 1,
            ),
            materialization: "materialized",
          }],
        }],
      });
      const bear = bySpecies(state, "black-bear");
      expect(bear.identity.stableId).toMatch(/^BEAR-/u);
      expect(deserializeCoreEcologyPatch(serializeCoreEcologyPatch(state))).toEqual(state);
    }
  });

  it("steps all materialized actors deterministically regardless of input order", () => {
    const state = patch();
    const steps = emptySteps(state);
    const forward = stepCoreEcologyPatch(state, { tick: 1, actorSteps: steps });
    const reverse = stepCoreEcologyPatch(state, { tick: 1, actorSteps: [...steps].reverse() });
    expect(forward).not.toBeNull();
    expect(reverse).toEqual(forward);
    expect(forward?.events.map(({ actorId }) => actorId)).toEqual(
      [...forward!.events.map(({ actorId }) => actorId)].sort(),
    );
    expect(forward?.patch.updatedAtTick).toBe(1);
    expect(state.updatedAtTick).toBe(0);
  });

  it("advances coarse physiology and cognition without granting hidden perception or movement", () => {
    const state = patch([population("deer", [0], false)]);
    const before = bySpecies(state, "deer");
    const result = stepCoreEcologyPatch(state, { tick: 20, actorSteps: [] });
    if (result === null) throw new Error("Valid coarse ecology step failed");
    const after = bySpecies(result.patch, "deer");

    expect(after.updatedAtTick).toBe(20);
    expect(after.perception.tick).toBe(20);
    expect(after.address).toEqual(before.address);
    expect(after.identity).toEqual(before.identity);
    expect(after.perception.beliefs).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.resourceClaims).toEqual([]);
  });

  it("holds active group topology until every member returns to coarse authority", () => {
    const deerPopulation = population("deer", [0, 1, 2, 3]);
    const initialGroup = createCoreEcologyGroup({
      seed: SEED,
      species: "deer",
      originRegion: ORIGIN,
      populationKey: deerPopulation.populationKey,
      groupOrdinal: 0,
      memberOrdinals: [0, 1, 2, 3],
      anchor: createWorldPosition(ORIGIN, 10_000, 20_000),
    });
    const split = stepCoreEcologyGroupCoarse(initialGroup, {
      atTick: 8,
      disturbances: [{
        disturbanceId: "disturbance:active-rejoin",
        atTick: 8,
        causeKind: "habitat-pressure",
        causeReferenceId: "habitat:active-rejoin",
        pressure: 800_000,
        movementHeading: 250_000,
        destinationAnchors: [
          createWorldPosition(ORIGIN, 30_000, 30_000),
          createWorldPosition(ORIGIN, 50_000, 50_000),
        ],
        rendezvousAnchor: createWorldPosition(ORIGIN, 40_000, 40_000),
        playerAbsent: true,
        nonlethal: true,
        cargoInteraction: false,
      }],
    });
    if (split === null) throw new Error("Active group fixture failed to split");
    let active = createCoreEcologyPatch({
      seed: SEED,
      patchKey: "east-marsh:active-rejoin",
      originRegion: ORIGIN,
      tick: 8,
      populations: [deerPopulation],
      groups: createCoreEcologyGroupSet([split.group]),
    });

    for (const tick of [16, 24, 32, 40]) {
      const result = stepCoreEcologyPatch(active, { tick, actorSteps: emptySteps(active) });
      if (result === null) throw new Error(`Active group step ${tick} failed`);
      active = result.patch;
    }
    const held = active.groups.groups[0];
    expect(held).toMatchObject({
      phase: split.group.phase,
      cohesion: split.group.cohesion,
      components: split.group.components,
      lineage: split.group.lineage,
      aftermath: split.group.aftermath,
      updatedAtTick: 40,
      nextCoarseTick: 48,
    });

    let coarse = setCoreEcologyMaterializedActors(active, { atTick: 40, actorIds: [] });
    for (const tick of [48, 56, 64, 72]) {
      const result = stepCoreEcologyPatch(coarse, { tick, actorSteps: [] });
      if (result === null) throw new Error(`Coarse group recovery ${tick} failed`);
      coarse = result.patch;
    }
    expect(coarse.groups.groups[0]).toMatchObject({
      phase: "cohesive",
      updatedAtTick: 72,
      nextCoarseTick: 80,
    });
    expect(coarse.groups.groups[0]?.aftermath).toHaveLength(split.group.aftermath.length + 1);
    expect(coarse.groups.groups[0]?.aftermath.at(-1)).toMatchObject({
      kind: "reunion",
      atTick: 72,
      playerAbsent: true,
    });
  });

  it("propagates a gull alarm lawfully to deer without revealing a source identity", () => {
    const state = patch([population("deer"), population("gull")]);
    const gull = bySpecies(state, "gull");
    const deer = bySpecies(state, "deer");
    const predator = directObservation(
      gull,
      1,
      "obs:gull-predator",
      "large-predator",
      "PREDATOR-near-shore",
    );
    const first = stepCoreEcologyPatch(state, {
      tick: 1,
      actorSteps: [actorStep(deer), actorStep(gull, [predator])],
    });
    if (first === null) throw new Error("Valid first ecology step failed");
    const alarmEvent = first.events.find(({ actorId }) => actorId === gull.identity.stableId);
    expect(alarmEvent?.kind).toBe("alarm");
    if (alarmEvent === undefined) throw new Error("Gull alarm event missing");
    expect(JSON.stringify(alarmEvent)).not.toContain("player");

    const currentDeer = bySpecies(first.patch, "deer");
    const heard = createCoreEcologyAlarmObservation(alarmEvent, {
      observerId: currentDeer.identity.stableId,
      observedAtTick: 2,
      radiusUnits: MIN_ANONYMOUS_HEARING_UNCERTAINTY_UNITS,
      confidence: ACTOR_PERCEPTION_SCALE,
      salience: ACTOR_PERCEPTION_SCALE,
    });
    expect(heard).toMatchObject({
      channel: "hearing",
      perceivedClass: "animal-alarm",
      subjectId: null,
      identification: "anonymous",
    });
    if (heard === null) throw new Error("Alarm observation bridge failed");
    const currentGull = bySpecies(first.patch, "gull");
    const second = stepCoreEcologyPatch(first.patch, {
      tick: 2,
      actorSteps: [actorStep(currentGull), actorStep(currentDeer, [heard])],
    });
    if (second === null) throw new Error("Valid second ecology step failed");
    const deerEvent = second.events.find(({ actorId }) => actorId === currentDeer.identity.stableId);
    expect(deerEvent?.kind).toBe("flee");
    expect(deerEvent?.causeReferenceId).toBe(heard.id);
  });

  it("carries a directly observed alarm through its persistent flock signal", () => {
    const gullPopulation = population("gull", [0, 1]);
    const flock = createCoreEcologyGroup({
      seed: SEED,
      species: "gull",
      originRegion: ORIGIN,
      populationKey: gullPopulation.populationKey,
      groupOrdinal: 0,
      memberOrdinals: [0, 1],
      anchor: gullPopulation.members[0]!.position,
    });
    const state = createCoreEcologyPatch({
      seed: SEED,
      patchKey: "east-marsh:flock-signal",
      originRegion: ORIGIN,
      populations: [gullPopulation],
      groups: createCoreEcologyGroupSet([flock]),
    });
    const firstGull = state.populations[0]!.members[0]!.actor;
    const secondGull = state.populations[0]!.members[1]!.actor;
    const predator = directObservation(
      firstGull,
      1,
      "obs:flock-predator",
      "large-predator",
      "PREDATOR-flock-edge",
    );
    const first = stepCoreEcologyPatch(state, {
      tick: 1,
      actorSteps: [actorStep(firstGull, [predator]), actorStep(secondGull)],
    });
    if (first === null) throw new Error("Flock alarm step failed");
    const alarm = first.events.find(({ actorId, kind }) => (
      actorId === firstGull.identity.stableId && kind === "alarm"
    ));
    if (alarm === undefined) throw new Error("Flock alarm was not emitted");
    const emittedSignal = first.patch.groups.groups[0]?.signals.find(
      ({ causeReferenceId }) => causeReferenceId === alarm.eventId,
    );
    expect(emittedSignal?.reachedMemberOrdinals).toEqual([0]);

    const second = stepCoreEcologyPatch(first.patch, {
      tick: 8,
      actorSteps: emptySteps(first.patch),
    });
    if (second === null) throw new Error("Flock propagation step failed");
    const propagated = second.patch.groups.groups[0]?.signals.find(
      ({ causeReferenceId }) => causeReferenceId === alarm.eventId,
    );
    expect(propagated?.reachedMemberOrdinals).toEqual([0, 1]);
  });

  it("surfaces conflicting physical claims without mutating or resolving the item", () => {
    let state = patch([population("gull"), population("black-bear")]);
    for (const species of ["gull", "black-bear"] as const) {
      const current = bySpecies(state, species);
      state = replaceCoreEcologyActor(state, replaceCoreWildlifeActorPhysiology(current, {
        atTick: 0,
        needs: { ...current.needs, hunger: ACTOR_PERCEPTION_SCALE },
        condition: current.condition,
      }));
    }
    const lot = Object.freeze({ id: "LOT-dried-fish", availableUnits: 1 });
    const actorSteps = (["gull", "black-bear"] as const).map((species) => {
      const current = bySpecies(state, species);
      const seen = directObservation(
        current,
        1,
        `obs:${species}:lot`,
        "exposed-food",
        lot.id,
      );
      return actorStep(current, [seen], [{
        resourceId: lot.id,
        observationId: seen.id,
        foodClass: "exposed-food",
        sourceKind: "physical-item",
        availableUnits: lot.availableUnits,
        nutrition: 850_000,
        effort: 20_000,
        risk: 0,
        competition: 0,
        directlyConfirmed: true,
        accessible: true,
      }]);
    });
    const result = stepCoreEcologyPatch(state, { tick: 1, actorSteps });
    if (result === null) throw new Error("Shared resource ecology step failed");
    expect(result.resourceClaims).toHaveLength(2);
    expect(result.resourceClaims.map(({ resourceId }) => resourceId))
      .toEqual([lot.id, lot.id]);
    expect(result.resourceClaims.map(({ requestedUnits }) => requestedUnits)).toEqual([1, 1]);
    expect(lot.availableUnits).toBe(1);
  });

  it("rejects missing, duplicate, stale, or nonmaterialized step inputs atomically", () => {
    const state = patch([population("deer"), population("gull")]);
    const [first] = emptySteps(state);
    if (first === undefined) throw new Error("Materialized actor required");
    expect(stepCoreEcologyPatch(state, { tick: 1, actorSteps: [first] })).toBeNull();
    expect(stepCoreEcologyPatch(state, { tick: 1, actorSteps: [first, first] })).toBeNull();
    expect(stepCoreEcologyPatch(state, { tick: 0, actorSteps: emptySteps(state) })).toBeNull();

    const coarse = patch([population("deer", [0], false)]);
    expect(stepCoreEcologyPatch(coarse, {
      tick: 1,
      actorSteps: [actorStep(bySpecies(coarse, "deer"))],
    })).toBeNull();
    expect(state.updatedAtTick).toBe(0);
  });
});
