import { describe, expect, it } from "vitest";

import { evaluateCargoEnvironment } from "../sim/cargoEnvironment";
import { seedFromText } from "../sim/rng";
import { FIXED_POINT } from "../sim/types";
import { createCraftingInventory } from "./crafting";
import { evaluateFallRiskOnEntry, type FallRiskEvaluation } from "./fallRisk";
import { fallCargoSeparationBand, resolveFallCargo } from "./fallCargo";
import {
  LOOSE_CARGO_MAX_ENTITIES,
  createLooseCargoCarrier,
  createLooseCargoExpectedManifest,
  createLooseCargoWorld,
  deserializeLooseCargoCarrier,
  deserializeLooseCargoExpectedManifest,
  deserializeLooseCargoWorld,
  serializeLooseCargoCarrier,
  serializeLooseCargoExpectedManifest,
  serializeLooseCargoWorld,
  scatterLooseCargo,
  validateLooseCargoExpectedManifest,
} from "./looseCargo";

const OWNER = { kind: "player", id: "local-porter" } as const;

function seriousFall(seedText = "fall cargo exact test"): {
  readonly seed: ReturnType<typeof seedFromText>;
  readonly evaluation: FallRiskEvaluation;
} {
  const seed = seedFromText(seedText);
  const evaluated = evaluateFallRiskOnEntry({
    seed,
    actorId: 0,
    traversalOrdinal: 17,
    entry: { kind: "hazardous-edge", fromTileId: 40, toTileId: 41 },
    hazards: {
      grade: 900_000,
      rock: 950_000,
      current: 650_000,
      depth: 700_000,
      brambleVines: 0,
      elevationDrop: 600_000,
      unsupportedGap: 300_000,
      surfaceSlip: 500_000,
    },
    porter: {
      stability: 0,
      loadRatio: FIXED_POINT,
      pace: "steady",
      wind: 300_000,
      turnPressure: 200_000,
      brace: false,
      footwearGrip: 0,
      fixtureSupport: 0,
    },
  });
  if (!evaluated.fell || !evaluated.consequenceQuote) throw new Error("forced fall fixture failed");
  return {
    seed,
    evaluation: {
      ...evaluated,
      consequenceQuote: { ...evaluated.consequenceQuote, cargoShock: 900_000 },
    },
  };
}

describe("fall cargo resolution", () => {
  it("damages and splits a two-unit Promise into two persistent parcels exactly once", () => {
    const { seed, evaluation } = seriousFall();
    const world = createLooseCargoWorld(8, 8);
    const carrier = createLooseCargoCarrier(
      OWNER,
      createCraftingInventory(18_000),
      [{
        contractId: 81,
        resource: "medicine",
        quantity: 2,
        property: "fragile",
        condition: FIXED_POINT,
      }],
    );
    const expectedManifest = createLooseCargoExpectedManifest(world, carrier);
    const expectedMaterial = evaluateCargoEnvironment({
      property: "fragile",
      state: { condition: FIXED_POINT, contamination: 0, decay: 0 },
      environment: {
        rain: 0,
        heat: 0,
        cold: 0,
        immersion: 0,
        currentX: 0,
        currentY: 0,
        magicalWaterFlux: 0,
        impact: 900_000,
      },
    }).nextState;
    const input = {
      seed,
      actorId: 0,
      evaluation,
      nextTraversalOrdinal: evaluation.usedTraversalOrdinal!,
      world,
      carrier,
      expectedManifest,
      x: 2_500_000,
      y: 3_500_000,
    };

    const first = resolveFallCargo(input);
    const replay = resolveFallCargo(input);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      ok: true,
      outcome: "separated",
      selectedLotId: "promise:81",
      cargoShock: 900_000,
    });
    expect(first.separatedEntityIds).toHaveLength(2);
    expect(first.world.entities.map(({ payload }) => payload)).toEqual([
      { kind: "promise", contractId: 81, resource: "medicine", quantity: 1, property: "fragile" },
      { kind: "promise", contractId: 81, resource: "medicine", quantity: 1, property: "fragile" },
    ]);
    expect(first.world.entities.map(({ materialState }) => materialState))
      .toEqual([expectedMaterial, expectedMaterial]);
    expect(first.carrier.lots).toEqual([]);
    expect(validateLooseCargoExpectedManifest(
      first.expectedManifest,
      first.world,
      first.carrier,
    ).valid).toBe(true);

    const reloadedWorld = deserializeLooseCargoWorld(serializeLooseCargoWorld(first.world));
    const reloadedCarrier = deserializeLooseCargoCarrier(serializeLooseCargoCarrier(first.carrier));
    const reloadedManifest = deserializeLooseCargoExpectedManifest(
      serializeLooseCargoExpectedManifest(first.expectedManifest),
    );
    const repeatedAfterCommit = resolveFallCargo({
      ...input,
      nextTraversalOrdinal: evaluation.nextTraversalOrdinal,
      world: reloadedWorld,
      carrier: reloadedCarrier,
      expectedManifest: reloadedManifest,
    });
    expect(repeatedAfterCommit).toMatchObject({
      ok: false,
      outcome: "rejected",
      reason: "traversal-already-processed",
    });
    expect(repeatedAfterCommit.world.entities).toHaveLength(2);
  });

  it("cannot replay the same fall against a surviving remainder after save/load", () => {
    const { seed, evaluation } = seriousFall("three unit replay remainder");
    const world = createLooseCargoWorld(5, 5);
    const carrier = createLooseCargoCarrier(
      OWNER,
      createCraftingInventory(18_000, { cordreed: 3 }),
    );
    const first = resolveFallCargo({
      seed,
      actorId: 0,
      evaluation,
      nextTraversalOrdinal: evaluation.usedTraversalOrdinal!,
      world,
      carrier,
      expectedManifest: createLooseCargoExpectedManifest(world, carrier),
      x: 1_500_000,
      y: 1_500_000,
    });
    expect(first.outcome).toBe("separated");
    expect(first.carrier.lots[0]?.payload).toEqual({ kind: "stack", item: "cordreed", quantity: 1 });
    const conditionAfterFirst = first.carrier.lots[0]?.materialState.condition;
    const replay = resolveFallCargo({
      seed,
      actorId: 0,
      evaluation,
      nextTraversalOrdinal: evaluation.nextTraversalOrdinal,
      world: deserializeLooseCargoWorld(serializeLooseCargoWorld(first.world)),
      carrier: deserializeLooseCargoCarrier(serializeLooseCargoCarrier(first.carrier)),
      expectedManifest: deserializeLooseCargoExpectedManifest(
        serializeLooseCargoExpectedManifest(first.expectedManifest),
      ),
      x: 1_500_000,
      y: 1_500_000,
    });
    expect(replay).toMatchObject({ ok: false, reason: "traversal-already-processed" });
    expect(replay.world.entities).toHaveLength(2);
    expect(replay.carrier.lots[0]?.materialState.condition).toBe(conditionAfterFirst);
  });

  it("applies stumble impact while keeping the exact selected lot carried", () => {
    const { seed, evaluation: fall } = seriousFall("stumble holds cargo");
    if (!fall.consequenceQuote) throw new Error("fall quote fixture missing");
    const evaluation: FallRiskEvaluation = {
      ...fall,
      outcome: "stumbled",
      fell: false,
      stumbled: true,
      consequenceQuote: {
        ...fall.consequenceQuote,
        severity: "stumble",
        cargoShock: 380_000,
      },
    };
    const world = createLooseCargoWorld(5, 5);
    const carrier = createLooseCargoCarrier(
      OWNER,
      createCraftingInventory(18_000, { cordreed: 3 }),
    );
    const resolved = resolveFallCargo({
      seed,
      actorId: 0,
      evaluation,
      nextTraversalOrdinal: evaluation.usedTraversalOrdinal!,
      world,
      carrier,
      expectedManifest: createLooseCargoExpectedManifest(world, carrier),
      x: 1_500_000,
      y: 1_500_000,
    });
    expect(resolved).toMatchObject({ ok: true, outcome: "impacted-carried", reason: "stumble-impact" });
    expect(resolved.world.entities).toEqual([]);
    expect(resolved.carrier.lots).toHaveLength(1);
    expect(resolved.carrier.lots[0]?.materialState.condition).toBeLessThan(FIXED_POINT);
  });

  it("selects by stable lot identity rather than carrier array order", () => {
    const { seed, evaluation } = seriousFall("lot ordering cannot reroll");
    const world = createLooseCargoWorld(6, 6);
    const canonical = createLooseCargoCarrier(
      OWNER,
      createCraftingInventory(18_000, { cordreed: 2, pitchcloth: 1 }),
    );
    const reversed = { ...canonical, lots: [...canonical.lots].reverse() };
    const common = {
      seed,
      actorId: 0,
      evaluation,
      nextTraversalOrdinal: evaluation.usedTraversalOrdinal!,
      world,
      x: 1_500_000,
      y: 1_500_000,
    };
    const left = resolveFallCargo({
      ...common,
      carrier: canonical,
      expectedManifest: createLooseCargoExpectedManifest(world, canonical),
    });
    const right = resolveFallCargo({
      ...common,
      carrier: reversed,
      expectedManifest: createLooseCargoExpectedManifest(world, reversed),
    });
    expect(right.selectedLotId).toBe(left.selectedLotId);
    expect(right.separatedEntityIds).toEqual(left.separatedEntityIds);
    expect(right.world).toEqual(left.world);
  });

  it("rejects a deleted or altered system before choosing a lot", () => {
    const { seed, evaluation } = seriousFall("manifest blocks missing cargo");
    const world = createLooseCargoWorld(4, 4);
    const carrier = createLooseCargoCarrier(
      OWNER,
      createCraftingInventory(18_000, { cordreed: 1 }),
    );
    const expectedManifest = createLooseCargoExpectedManifest(world, carrier);
    const missing = { ...carrier, lots: [] };
    const resolved = resolveFallCargo({
      seed,
      actorId: 0,
      evaluation,
      nextTraversalOrdinal: evaluation.usedTraversalOrdinal!,
      world,
      carrier: missing,
      expectedManifest,
      x: 500_000,
      y: 500_000,
    });
    expect(resolved).toMatchObject({ ok: false, outcome: "rejected", reason: "manifest-manifest-mismatch" });
    expect(resolved.world).toBe(world);
    expect(resolved.carrier).toBe(missing);
  });

  it("damages but never partially scatters when one or two parcel slots are unavailable", () => {
    const { seed, evaluation } = seriousFall("loaded parcel cap impact");

    const fill = (count: number, includePromise: boolean) => {
      let world = createLooseCargoWorld(4, 4);
      let carrier = createLooseCargoCarrier(
        OWNER,
        createCraftingInventory(200_000, { cordreed: count + (includePromise ? 0 : 1) }),
        includePromise
          ? [{
              contractId: 91,
              resource: "medicine" as const,
              quantity: 2,
              property: "fragile" as const,
              condition: FIXED_POINT,
            }]
          : [],
      );
      let remaining = count;
      while (remaining > 0) {
        const quantity = Math.min(16, remaining);
        const scattered = scatterLooseCargo(world, carrier, {
          lotId: "crafting-stack:cordreed",
          x: 1_500_000,
          y: 1_500_000,
          cause: "forced-release",
          parts: Array.from({ length: quantity }, () => ({
            quantity: 1,
            velocityX: 0,
            velocityY: 0,
          })),
        });
        if (!scattered.ok) throw new Error(scattered.message);
        world = scattered.world;
        carrier = scattered.carrier;
        remaining -= quantity;
      }
      return { world, carrier };
    };

    const full = fill(LOOSE_CARGO_MAX_ENTITIES, false);
    const fullBefore = full.carrier.lots[0]?.materialState.condition;
    const fullResult = resolveFallCargo({
      seed,
      actorId: 0,
      evaluation,
      nextTraversalOrdinal: evaluation.usedTraversalOrdinal!,
      ...full,
      expectedManifest: createLooseCargoExpectedManifest(full.world, full.carrier),
      x: 1_500_000,
      y: 1_500_000,
    });
    expect(fullResult).toMatchObject({
      ok: true,
      outcome: "impacted-carried",
      reason: "loaded-region-cap-held-impact",
    });
    expect(fullResult.world.entities).toHaveLength(LOOSE_CARGO_MAX_ENTITIES);
    expect(fullResult.carrier.lots[0]?.payload).toEqual({ kind: "stack", item: "cordreed", quantity: 1 });
    expect(fullResult.carrier.lots[0]?.materialState.condition).toBeLessThan(fullBefore ?? 0);
    expect(validateLooseCargoExpectedManifest(
      fullResult.expectedManifest,
      fullResult.world,
      fullResult.carrier,
    ).valid).toBe(true);

    const oneSlot = fill(LOOSE_CARGO_MAX_ENTITIES - 1, true);
    const oneSlotResult = resolveFallCargo({
      seed,
      actorId: 0,
      evaluation,
      nextTraversalOrdinal: evaluation.usedTraversalOrdinal!,
      ...oneSlot,
      expectedManifest: createLooseCargoExpectedManifest(oneSlot.world, oneSlot.carrier),
      x: 1_500_000,
      y: 1_500_000,
    });
    expect(oneSlotResult).toMatchObject({
      ok: true,
      outcome: "impacted-carried",
      reason: "loaded-region-cap-held-impact",
      selectedLotId: "promise:91",
    });
    expect(oneSlotResult.world.entities).toHaveLength(LOOSE_CARGO_MAX_ENTITIES - 1);
    expect(oneSlotResult.carrier.lots[0]?.payload).toEqual({
      kind: "promise",
      contractId: 91,
      resource: "medicine",
      quantity: 2,
      property: "fragile",
    });
  });

  it("exposes legible fixed separation bands", () => {
    expect(fallCargoSeparationBand(0)).toBe("held");
    expect(fallCargoSeparationBand(300_000)).toBe("possible");
    expect(fallCargoSeparationBand(600_000)).toBe("likely");
    expect(fallCargoSeparationBand(900_000)).toBe("violent");
  });
});
