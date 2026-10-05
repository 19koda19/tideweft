import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { globalTileToRegion } from "../sim/regions";
import type { TerrainTileView, WorldView } from "../sim/types";
import { evaluateAudibleContact, type AudibleContactInput } from "./perception";
import { createPhysicalSoundSample, evaluatePhysicalAcousticListener } from "./physicalAcousticPerception";
import { playerEffortExpressionIntent } from "./playerEffortExpression";
import { createRegionalCartography, projectRegionalCartographyWindow } from "./regionalCartography";
import { createTerrainRegionStreamingState } from "./regionStreaming";
import { createRegionalTerrainWindow } from "./regionalTravel";
import { createRegionalWorldView } from "./regionalWorldView";
import { createSituatedExpressionState } from "./situatedExpression";
import {
  appendExpressionDiagnostic, createExpressionDiagnosticState, previewExpressionDiagnosticListening,
} from "./situatedExpressionDiagnostics";
import {
  acousticTerrainSupportForSpecies, deriveTerrainAcousticTransmission, prepareTerrainAudibleContactInput,
  type TerrainAcousticContext,
} from "./terrainAcoustics";
import { createWorldPosition, globalFixedToWorldPosition } from "./worldPosition";

// Synthetic geometry/adapter fixtures, not emitted gameplay, physical metres,
// save compatibility, ordinary travel or terrain-propagation closure evidence.
const SURFACE = 200_000;
const CREST = 520_000;

function grid(): WorldView {
  const world = createWorldView(createWorld("terrain acoustics synthetic geometry", "standard"));
  const template = world.terrain.tiles[0]!;
  return { ...world, terrain: { width: 7, height: 7, tiles: Array.from({ length: 49 }, (_, index) => ({
    ...template, index, x: index % 7, y: Math.floor(index / 7),
    terrain: "meadow", elevation: SURFACE, waterDepth: 0, roughness: 0,
  })) } };
}

function point(x: number, y: number) {
  return createWorldPosition({ x: 0, y: 0 }, x, y);
}

function context(world: WorldView, listenerPosition = point(500, 3_500), sourcePosition = point(4_500, 3_500)):
TerrainAcousticContext {
  return { world, listenerPosition, sourcePosition, listenerSupport: "surface", sourceSupport: "surface" };
}

function tile(world: WorldView, x: number, y: number): TerrainTileView {
  const value = world.terrain.tiles[y * world.terrain.width + x];
  if (value === undefined) throw new Error("Synthetic acoustic path lost its tile");
  return value;
}

describe("bounded surface terrain acoustics", () => {
  it.each([
    [SURFACE, 1], [SURFACE + 64_000, 1], [SURFACE + 64_000 + 128_000, 0.75],
    [CREST, 0.5], [1_000_000, 0.5],
  ])("uses authored normalized clearance/span/cap at crest %i", (elevation, transmission) => {
    const world = grid();
    tile(world, 2, 3).elevation = elevation;
    expect(deriveTerrainAcousticTransmission(context(world))).toEqual({
      transmission, scope: "surface-path", visitedCells: 3,
    });
  });

  it.each([
    { name: "rising endpoint baseline", startSurface: SURFACE, endSurface: 1_000_000 },
    { name: "falling endpoint baseline", startSurface: 1_000_000, endSurface: SURFACE },
  ])("uses the greatest cell excess for a $name in either direction", ({ startSurface, endSurface }) => {
    const world = grid();
    tile(world, 0, 3).elevation = startSurface;
    tile(world, 4, 3).elevation = endSurface;
    tile(world, 2, 3).elevation = 800_000;
    const input = context(world);
    const forward = deriveTerrainAcousticTransmission(input);
    const reverse = deriveTerrainAcousticTransmission({ ...input,
      listenerPosition: input.sourcePosition, sourcePosition: input.listenerPosition,
    });

    // Cell 2 spans t=.375 to .625. Its greatest excess is 300,000
    // at entry for a rising baseline and at exit for a falling baseline.
    expect(forward).toEqual({
      transmission: 0.5390625, scope: "surface-path", visitedCells: 3,
    });
    expect(reverse).toEqual(forward);
  });

  it.each([
    { name: "diagonal corner flank", a: [500, 500], b: [4_500, 4_500], crest: [2, 1] },
    { name: "descending diagonal flank", a: [500, 4_500], b: [4_500, 500], crest: [2, 3] },
    { name: "horizontal cell edge", a: [500, 2_000], b: [4_500, 2_000], crest: [2, 1] },
    { name: "vertical cell edge", a: [2_000, 500], b: [2_000, 4_500], crest: [1, 2] },
  ])("walks the same supercover in both directions: $name", ({ a, b, crest }) => {
    const world = grid();
    tile(world, crest[0]!, crest[1]!).elevation = CREST;
    const forward = deriveTerrainAcousticTransmission(context(world, point(a[0]!, a[1]!), point(b[0]!, b[1]!)));
    const reverse = deriveTerrainAcousticTransmission(context(world, point(b[0]!, b[1]!), point(a[0]!, a[1]!)));
    expect(forward?.transmission).toBe(0.5);
    expect(reverse).toEqual(forward);
  });

  it.each([[4_499, 0.5], [4_500, 0.5], [4_501, 1]])(
    "uses exact subtile crossings, not rounded endpoints, at source y=%i", (y, transmission) => {
      const world = grid();
      tile(world, 2, 1).elevation = CREST;
      const input = context(world, point(500, 500), point(4_500, y));
      expect(deriveTerrainAcousticTransmission(input)?.transmission).toBe(transmission);
      expect(deriveTerrainAcousticTransmission({ ...input,
        listenerPosition: input.sourcePosition, sourcePosition: input.listenerPosition,
      })).toEqual(deriveTerrainAcousticTransmission(input));
    },
  );

  it("does not absorb sound through terrain names, optical roughness, cost or occupied cells", () => {
    const world = grid();
    const before = deriveTerrainAcousticTransmission(context(world));
    Object.assign(tile(world, 2, 3), {
      terrain: "ridge", roughness: 1_000_000, moisture: 1_000_000,
      baseTravelCost: 1_000_000, traceStrength: 1_000_000,
    });
    const occupied = { ...world, settlements: world.settlements.map((settlement) => ({
      ...settlement, tileIndex: 3 * 7 + 2,
    })) };
    expect(deriveTerrainAcousticTransmission(context(occupied))).toEqual(before);
  });

  it("uses elevation plus waterDepth, not a submerged riverbed as endpoint height", () => {
    const world = grid();
    tile(world, 2, 3).elevation = 500_000;
    expect(deriveTerrainAcousticTransmission(context(world))?.transmission).toBeLessThan(1);
    tile(world, 0, 3).waterDepth = 300_000;
    tile(world, 4, 3).waterDepth = 300_000;
    expect(deriveTerrainAcousticTransmission(context(world))?.transmission).toBe(1);
    tile(world, 2, 3).elevation = SURFACE;
    tile(world, 2, 3).waterDepth = 620_000;
    expect(deriveTerrainAcousticTransmission(context(world))?.transmission).toBe(0.5);
  });

  it("keeps same-cell positions clear without inspecting neighboring terrain", () => {
    const world = grid();
    tile(world, 1, 0).elevation = Number.NaN;
    expect(deriveTerrainAcousticTransmission(context(world, point(100, 100), point(900, 900))))
      .toEqual({ transmission: 1, scope: "surface-path", visitedCells: 0 });
  });

  it("marks aerial, amphibious, aquatic and unknown support unmodeled, never grounded by vocabulary", () => {
    for (const species of ["human", "domestic-dog", "marsh-rabbit"]) {
      expect(acousticTerrainSupportForSpecies(species)).toBe("surface");
    }
    for (const species of ["gull", "fish-crow", "american-black-duck", "atlantic-silverside", "unknown", null]) {
      expect(acousticTerrainSupportForSpecies(species)).toBe("unmodeled");
    }
    const world = grid();
    tile(world, 2, 3).elevation = CREST;
    for (const support of ["listenerSupport", "sourceSupport"] as const) {
      expect(deriveTerrainAcousticTransmission({ ...context(world), [support]: "unmodeled" }))
        .toEqual({ transmission: 1, scope: "unmodeled-support", visitedCells: 0 });
    }
  });

  it("reports unavailable geography explicitly rather than certifying a clear inspected path", () => {
    const world = grid();
    expect(deriveTerrainAcousticTransmission(context(world, point(500, 3_500), point(7_500, 3_500))))
      .toEqual({ transmission: 1, scope: "outside-frame", visitedCells: 0 });
    expect(deriveTerrainAcousticTransmission(context(world, point(500, 3_500),
      createWorldPosition({ x: -4, y: 3 }, 500, 500))))
      .toEqual({ transmission: 1, scope: "outside-frame", visitedCells: 0 });
  });

  it("fails malformed available path geometry closed while leaving unrelated cells unscanned", () => {
    for (const patch of [
      { elevation: Number.NaN }, { elevation: -0 }, { elevation: 1_000_001 },
      { waterDepth: -1 }, { waterDepth: 0.5 }, { index: -1 }, { x: 3 }, { y: 4 },
    ]) {
      const world = grid();
      Object.assign(tile(world, 2, 3), patch);
      expect(deriveTerrainAcousticTransmission(context(world))).toBeNull();
    }
    const world = grid();
    tile(world, 6, 6).elevation = Number.NaN;
    expect(deriveTerrainAcousticTransmission(context(world))?.transmission).toBe(1);
    for (const terrain of [
      { ...world.terrain, width: 121 }, { ...world.terrain, height: 0 },
      { ...world.terrain, tiles: [] }, { ...world.terrain, tiles: null },
      { ...world.terrain, tiles: undefined },
    ]) {
      expect(deriveTerrainAcousticTransmission(context({ ...world, terrain } as WorldView))).toBeNull();
    }
  });

  it("preserves inputs and bounds visited work to crossed cells, not field area", () => {
    const world = grid();
    tile(world, 2, 1).elevation = CREST;
    for (const value of world.terrain.tiles) Object.freeze(value);
    Object.freeze(world.terrain.tiles);
    const input = Object.freeze(context(world, point(500, 500), point(6_500, 6_500)));
    const before = JSON.stringify(input);
    const result = deriveTerrainAcousticTransmission(input);
    expect(result?.visitedCells).toBeLessThanOrEqual(3 * (7 + 7) + 4);
    expect(result?.visitedCells).toBeLessThan(49);
    expect(result?.transmission).toBe(0.5);
    expect(Object.isFrozen(result)).toBe(true);
    expect(deriveTerrainAcousticTransmission(input)).toEqual(result);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("uses registered shifted signed-world frames without changing the same physical path", () => {
    const results = [];
    for (const origin of [{ x: -200, y: -160 }, { x: -197, y: -162 }]) {
      const state = createWorld("terrain acoustics registered signed frame", "standard");
      const center = globalTileToRegion(origin.x + 60, origin.y + 60).region;
      const window = createRegionalTerrainWindow(state.meta.rootSeed,
        createTerrainRegionStreamingState({ rootSeed: state.meta.rootSeed, center }), origin);
      const world = createRegionalWorldView(createWorldView(state), window,
        projectRegionalCartographyWindow(createRegionalCartography(state.meta.rootSeed), window));
      for (const value of world.terrain.tiles) { value.elevation = SURFACE; value.waterDepth = 0; }
      tile(world, -178 - origin.x, -140 - origin.y).elevation = CREST;
      const result = deriveTerrainAcousticTransmission(context(world,
        globalFixedToWorldPosition(-179_500, -139_500), globalFixedToWorldPosition(-175_500, -139_500)));
      expect(result).toMatchObject({ scope: "surface-path", transmission: 0.5, visitedCells: 3 });
      results.push(result);
    }
    expect(results[0]).toEqual(results[1]);
  });

  it("prepares one attenuated tuple for anonymous hearing and exact DEV calculation replay", () => {
    const world = grid();
    tile(world, 2, 3).elevation = CREST;
    const path = context(world);
    const input: AudibleContactInput = Object.freeze({
      listener: Object.freeze({ x: 0, y: 0 }), source: Object.freeze({ x: 4_000, y: 0 }),
      baseRange: 10_000, ambientNoise: 0, sourceLoudness: 1, wind: Object.freeze({ x: 0, y: 0 }),
    });
    const prepared = prepareTerrainAudibleContactInput(input, path);
    expect(prepared).toEqual({ ...input, sourceLoudness: 0.5 });
    if (prepared === null) throw new Error("Valid synthetic path was rejected");
    const contact = evaluateAudibleContact(prepared);
    expect(contact).not.toBeNull();
    expect(contact!.certainty).toBeLessThan(evaluateAudibleContact(input)!.certainty);
    expect(evaluateAudibleContact({ ...input, baseRange: 6_000 })).not.toBeNull();
    expect(evaluateAudibleContact({ ...prepared, baseRange: 6_000 })).toBeNull();
    expect(prepareTerrainAudibleContactInput({ ...input, source: { x: 4_001, y: 0 } }, path)).toBeNull();
    const sample = createPhysicalSoundSample({
      id: "synthetic-terrain-call", acousticEventId: "terrain:synthetic-call", sourceId: "terrain:synthetic-source",
      position: path.sourcePosition, soundClass: "animal-call", soundInterrupt: "none",
      soundLoudness: 1_000_000, soundRangeUnits: input.baseRange,
    });
    if (sample === null) throw new Error("Synthetic physical adapter sample was rejected");
    const heard = evaluatePhysicalAcousticListener({
      observationId: "terrain:synthetic-observation", observerId: "terrain:synthetic-listener",
      observerPosition: path.listenerPosition, observedAtTick: 1, sample,
      effectiveRangeUnits: input.baseRange, ambientNoise: input.ambientNoise, wind: input.wind,
    }, { world, sourceSupport: "surface", listenerSupport: "surface" });
    expect(heard).toMatchObject({ kind: "heard", contact, observation: {
      channel: "hearing", perceivedClass: "animal-call", subjectId: null, identification: "anonymous",
    } });
    expect(contact).not.toHaveProperty("sourcePosition");
    expect(contact).not.toHaveProperty("sourceActorId");

    const intent = playerEffortExpressionIntent({ sourceActorId: "player:local", position: path.sourcePosition,
      committedWorldTick: 1, admittedAtPlayerStepPhase: 1, acceptedDistanceUnits: 105,
      resolution: "dry-exhaustion-camp" });
    if (intent === null) throw new Error("Synthetic diagnostic intent was rejected");
    const snapshot = appendExpressionDiagnostic(createExpressionDiagnosticState(true), {
      completedTick: 1, playerStepPhase: 1, intent, priorState: createSituatedExpressionState(),
      reason: "sound-budget", event: null, admission: null, playerReception: null,
      sourceBelief: null, weather: "clear", listeningContext: { input: prepared, contact },
    });
    const before = JSON.stringify(snapshot);
    // DEV replay evaluates the captured prepared tuple, not today's terrain.
    tile(world, 2, 3).elevation = SURFACE;
    const preview = previewExpressionDiagnosticListening(snapshot, 1);
    expect(preview).toMatchObject({ candidateInput: prepared, actualContact: contact, hypotheticalContact: contact });
    expect(snapshot.records[0]?.listeningContext?.input).not.toBe(prepared);
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(input.sourceLoudness).toBe(1);
    expect(prepareTerrainAudibleContactInput(input, path)).toBe(input);
  });
});
