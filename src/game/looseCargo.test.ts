import { describe, expect, it } from "vitest";

import { evaluateCargoEnvironment, type CargoEnvironmentSample } from "../sim/cargoEnvironment";
import { FIXED_POINT } from "../sim/types";
import { createCraftingInventory } from "./crafting";
import {
  LOOSE_CARGO_MAX_VELOCITY,
  LOOSE_CARGO_MAX_ENTITIES,
  LOOSE_CARGO_RETAINED_HISTORY,
  LOOSE_CARGO_MAX_ORDINAL,
  LOOSE_CARGO_TILE_UNITS,
  addLooseCargoStack,
  consumeLooseCargoStack,
  createLooseCargoExpectedManifest,
  createLooseCargoCarrier,
  createLooseCargoWorld,
  deserializeLooseCargoWorld,
  deserializeLooseCargoCarrier,
  deserializeLooseCargoExpectedManifest,
  dropLooseCargo,
  looseCargoCarrierLoadMilli,
  looseCargoPayloadLoadMilli,
  looseCargoPayloadProperty,
  looseCargoEntityId,
  pickupLooseCargo,
  projectLooseCargoCarrier,
  promiseCargoLoadMilli,
  quoteLooseCargoDrop,
  quoteLooseCargoPickup,
  removeLooseCargoGear,
  removeLooseCargoPromise,
  scatterLooseCargo,
  serializeLooseCargoCarrier,
  serializeLooseCargoExpectedManifest,
  serializeLooseCargoWorld,
  stepLooseCargo,
  setLooseCargoGearCondition,
  setLooseCargoLotMaterialState,
  setLooseCargoPromiseMaterialState,
  setLooseCargoReservedLoad,
  upsertLooseCargoGear,
  upsertLooseCargoPromise,
  validateLooseCargoCarrier,
  validateLooseCargoExpectedManifest,
  validateLooseCargoWorld,
  type LooseCargoCarrierState,
  type LooseCargoDropRequest,
  type LooseCargoEntity,
  type LooseCargoStepSample,
  type LooseCargoWorldState,
} from "./looseCargo";

const PLAYER = { kind: "player", id: "local-porter" } as const;
const OTHER_PLAYER = { kind: "player", id: "visiting-porter" } as const;

const CALM: CargoEnvironmentSample = {
  rain: 0,
  heat: 0,
  cold: 0,
  immersion: 0,
  currentX: 0,
  currentY: 0,
  magicalWaterFlux: 0,
  impact: 0,
};

function carrier(
  capacityMilliLoad = 100_000,
  reservedLoadMilli = 1_000,
): LooseCargoCarrierState {
  return createLooseCargoCarrier(
    PLAYER,
    createCraftingInventory(
      capacityMilliLoad,
      { cordreed: 5, pitchcloth: 2, "stone-fitting": 1 },
      [
        { id: 17, kind: "weather-cape", condition: 780_000 },
        { id: 23, kind: "ladder", condition: 910_000 },
      ],
    ),
    [{
      contractId: 41,
      resource: "medicine",
      quantity: 3,
      property: "fragile",
      condition: 870_000,
      contamination: 12_000,
      decay: 34_000,
    }],
    reservedLoadMilli,
  );
}

function drop(
  world: LooseCargoWorldState,
  pack: LooseCargoCarrierState,
  request: LooseCargoDropRequest,
) {
  const result = dropLooseCargo(world, pack, request);
  expect(result.ok, result.message).toBe(true);
  return result;
}

function entityId(ordinal: number, region = { x: 0, y: 0 }) {
  return looseCargoEntityId(region, ordinal);
}

function sample(
  entity: number | string,
  overrides: Partial<Omit<LooseCargoStepSample, "entityId">> = {},
): LooseCargoStepSample {
  return {
    entityId: typeof entity === "number" ? entityId(entity) : entity,
    environment: CALM,
    waterDepth: 0,
    downhillX: 0,
    downhillY: 0,
    tumbleImpact: 0,
    mangroveSnag: 0,
    brambleSnag: 0,
    ...overrides,
  };
}

describe("loose cargo carrier adapters and exact load", () => {
  it("adapts raw finds, components, gear, Promise cargo, and reserved load without a capacity constant", () => {
    const pack = carrier(100_000, 1_000);

    expect(pack.lots.map(({ id }) => id)).toEqual([
      "crafting-stack:cordreed",
      "crafting-stack:pitchcloth",
      "crafting-stack:stone-fitting",
      "gear:17",
      "gear:23",
      "promise:41",
    ]);
    expect(looseCargoCarrierLoadMilli(pack)).toBe(
      1_000
      + 5 * 600
      + 2 * 600
      + 1 * 2_400
      + 1_300
      + 6_000
      + 3_750,
    );
    expect(pack.capacityMilliLoad).toBe(100_000);
    expect(promiseCargoLoadMilli(3, "fragile")).toBe(3_750);
    expect(promiseCargoLoadMilli(3, "heavy")).toBe(6_000);
    expect(promiseCargoLoadMilli(3, "ordinary")).toBe(3_000);
    expect(promiseCargoLoadMilli(Number.NaN, "heavy")).toBe(0);

    const projected = projectLooseCargoCarrier(pack);
    expect(projected.craftingInventory.stacks).toMatchObject({
      cordreed: 5,
      pitchcloth: 2,
      "stone-fitting": 1,
    });
    expect(projected.craftingInventory.gear).toEqual([
      { id: 17, kind: "weather-cape", condition: 780_000 },
      { id: 23, kind: "ladder", condition: 910_000 },
    ]);
    expect(projected.promises).toEqual([{
      contractId: 41,
      resource: "medicine",
      quantity: 3,
      property: "fragile",
      condition: 870_000,
      contamination: 12_000,
      decay: 34_000,
    }]);
  });

  it("assigns intentional material behavior and exact catalog load to every payload family", () => {
    const pack = carrier();
    const raw = pack.lots.find(({ id }) => id === "crafting-stack:cordreed")?.payload;
    const component = pack.lots.find(({ id }) => id === "crafting-stack:stone-fitting")?.payload;
    const gear = pack.lots.find(({ id }) => id === "gear:23")?.payload;
    const promise = pack.lots.find(({ id }) => id === "promise:41")?.payload;
    if (!raw || !component || !gear || !promise) throw new Error("fixture lots missing");

    expect(looseCargoPayloadProperty(raw)).toBe("ordinary");
    expect(looseCargoPayloadProperty(component)).toBe("heavy");
    expect(looseCargoPayloadProperty(gear)).toBe("heavy");
    expect(looseCargoPayloadProperty(promise)).toBe("fragile");
    expect(looseCargoPayloadLoadMilli(raw)).toBe(3_000);
    expect(looseCargoPayloadLoadMilli(component)).toBe(2_400);
    expect(looseCargoPayloadLoadMilli(gear)).toBe(6_000);
    expect(looseCargoPayloadLoadMilli(promise)).toBe(3_750);
  });

  it("rejects an adapted aggregate pack whose explicit cargo exceeds its caller-supplied capacity", () => {
    expect(() => createLooseCargoCarrier(
      PLAYER,
      createCraftingInventory(5_000),
      [{
        contractId: 2,
        resource: "parts",
        quantity: 3,
        property: "heavy",
        condition: FIXED_POINT,
      }],
    )).toThrow(/over-capacity/);
  });
});

describe("atomic drop and recovery transactions", () => {
  it("quotes and drops an exact partial material quantity without mutating either input", () => {
    const world = createLooseCargoWorld(8, 6);
    const pack = carrier();
    const worldBefore = structuredClone(world);
    const packBefore = structuredClone(pack);
    const request = {
      lotId: "crafting-stack:cordreed",
      quantity: 2,
      x: 2 * LOOSE_CARGO_TILE_UNITS + 125_000,
      y: 3 * LOOSE_CARGO_TILE_UNITS + 250_000,
    };

    const quote = quoteLooseCargoDrop(world, pack, request);
    expect(quote).toMatchObject({
      ok: true,
      direction: "drop",
      reason: "ready",
      worldRevision: 0,
      carrierRevision: 0,
      entityId: entityId(1),
      transferLoadMilli: 1_200,
    });
    expect(quote.carrierLoadBeforeMilli - quote.carrierLoadAfterMilli).toBe(1_200);
    expect(world).toEqual(worldBefore);
    expect(pack).toEqual(packBefore);

    const result = dropLooseCargo(world, pack, request);
    expect(result.ok).toBe(true);
    expect(result.entity).toMatchObject({
      id: entityId(1),
      origin: { region: { x: 0, y: 0 }, ordinal: 1 },
      owner: PLAYER,
      payload: { kind: "stack", item: "cordreed", quantity: 2 },
      materialState: { condition: FIXED_POINT, contamination: 0, decay: 0 },
      x: request.x,
      y: request.y,
      velocityX: 0,
      velocityY: 0,
      motion: "resting",
      snaggedBy: null,
      causalSignature: "manual-release",
      lastEventOrdinal: 1,
    });
    expect(result.world).toMatchObject({ revision: 1, lastEntityOrdinal: 1, lastEventOrdinal: 1 });
    expect(result.carrier.revision).toBe(1);
    expect(result.carrier.lots.find(({ id }) => id === request.lotId)?.payload)
      .toEqual({ kind: "stack", item: "cordreed", quantity: 3 });
    expect(looseCargoCarrierLoadMilli(result.carrier)).toBe(quote.carrierLoadAfterMilli);
    expect(world).toEqual(worldBefore);
    expect(pack).toEqual(packBefore);
  });

  it("merges exact matching stack state and never reuses its world parcel ID", () => {
    const firstDrop = drop(
      createLooseCargoWorld(8, 6),
      carrier(),
      { lotId: "crafting-stack:cordreed", quantity: 2, x: 1_100_000, y: 1_100_000 },
    );
    const quote = quoteLooseCargoPickup(firstDrop.world, firstDrop.carrier, {
      entityId: entityId(1),
      x: 1_000_000,
      y: 1_000_000,
      reach: 250_000,
    });
    expect(quote).toMatchObject({
      ok: true,
      reason: "ready",
      entityId: entityId(1),
      lotId: "crafting-stack:cordreed",
      transferLoadMilli: 1_200,
    });
    const recovered = pickupLooseCargo(firstDrop.world, firstDrop.carrier, {
      entityId: entityId(1),
      x: 1_000_000,
      y: 1_000_000,
      reach: 250_000,
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.world.entities).toEqual([]);
    expect(recovered.world.lastEntityOrdinal).toBe(1);
    expect(recovered.carrier.lots.find(({ id }) => id === "crafting-stack:cordreed")?.payload)
      .toEqual({ kind: "stack", item: "cordreed", quantity: 5 });
    expect(projectLooseCargoCarrier(recovered.carrier).craftingInventory.stacks.cordreed).toBe(5);

    const secondDrop = drop(
      recovered.world,
      recovered.carrier,
      { lotId: "crafting-stack:cordreed", quantity: 2, x: 1_100_000, y: 1_100_000 },
    );
    expect(secondDrop.entity?.id).toBe(entityId(2));
    expect(secondDrop.world.lastEntityOrdinal).toBe(2);
  });

  it("preserves durable gear and Promise identity plus environmental state over a round trip", () => {
    let world = createLooseCargoWorld(8, 6);
    let pack = carrier();
    const gearDrop = drop(world, pack, { lotId: "gear:17", x: 500_000, y: 500_000 });
    world = gearDrop.world;
    pack = gearDrop.carrier;
    const promiseDrop = drop(world, pack, { lotId: "promise:41", x: 600_000, y: 500_000 });

    expect(gearDrop.entity).toMatchObject({
      payload: { kind: "gear", gearId: 17, gearKind: "weather-cape" },
      materialState: { condition: 780_000 },
    });
    expect(promiseDrop.entity).toMatchObject({
      payload: {
        kind: "promise",
        contractId: 41,
        resource: "medicine",
        quantity: 3,
        property: "fragile",
      },
      materialState: { condition: 870_000, contamination: 12_000, decay: 34_000 },
    });

    const recoveredPromise = pickupLooseCargo(promiseDrop.world, promiseDrop.carrier, {
      entityId: entityId(2),
      x: 600_000,
      y: 500_000,
      reach: 0,
    });
    expect(projectLooseCargoCarrier(recoveredPromise.carrier).promises).toEqual([{
      contractId: 41,
      resource: "medicine",
      quantity: 3,
      property: "fragile",
      condition: 870_000,
      contamination: 12_000,
      decay: 34_000,
    }]);
  });

  it("fails every invalid transfer atomically: quantities, whole durables, reach, ownership, and capacity", () => {
    const world = createLooseCargoWorld(8, 6);
    const pack = carrier();
    const invalidDrops: LooseCargoDropRequest[] = [
      { lotId: "crafting-stack:cordreed", quantity: 0, x: 1, y: 1 },
      { lotId: "crafting-stack:cordreed", quantity: 99, x: 1, y: 1 },
      { lotId: "gear:17", quantity: 1, x: 1, y: 1 },
      { lotId: "missing", quantity: 1, x: 1, y: 1 },
      { lotId: "crafting-stack:cordreed", quantity: 1, x: -1, y: 1 },
    ];
    for (const request of invalidDrops) {
      const result = dropLooseCargo(world, pack, request);
      expect(result.ok, result.reason).toBe(false);
      expect(result.world).toEqual(world);
      expect(result.carrier).toEqual(pack);
    }

    const dropped = drop(
      world,
      pack,
      { lotId: "crafting-stack:cordreed", quantity: 2, x: 2_000_000, y: 2_000_000 },
    );
    const far = pickupLooseCargo(dropped.world, dropped.carrier, {
      entityId: entityId(1),
      x: 0,
      y: 0,
      reach: LOOSE_CARGO_TILE_UNITS,
    });
    expect(far.reason).toBe("out-of-reach");
    expect(far.world).toEqual(dropped.world);
    expect(far.carrier).toEqual(dropped.carrier);

    const otherPack = createLooseCargoCarrier(
      OTHER_PLAYER,
      createCraftingInventory(100_000),
    );
    const stolen = pickupLooseCargo(dropped.world, otherPack, {
      entityId: entityId(1),
      x: 2_000_000,
      y: 2_000_000,
      reach: 0,
    });
    expect(stolen.reason).toBe("not-owner");

    const unclaimedWorld: LooseCargoWorldState = {
      ...dropped.world,
      entities: dropped.world.entities.map((entity) => ({ ...entity, owner: { kind: "unclaimed" } })),
    };
    const tinyPack = createLooseCargoCarrier(
      OTHER_PLAYER,
      createCraftingInventory(1_000),
    );
    const tooHeavy = pickupLooseCargo(unclaimedWorld, tinyPack, {
      entityId: entityId(1),
      x: 2_000_000,
      y: 2_000_000,
      reach: 0,
    });
    expect(tooHeavy.reason).toBe("capacity-exceeded");
    expect(tooHeavy.transferLoadMilli).toBe(1_200);
    expect(tooHeavy.world).toEqual(unclaimedWorld);
    expect(tooHeavy.carrier).toEqual(tinyPack);
  });

  it("conserves exact quantity and load across repeated drop/pickup cycles", () => {
    let world = createLooseCargoWorld(4, 4);
    let pack = carrier();
    const baselineLoad = looseCargoCarrierLoadMilli(pack);
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const lot = pack.lots.find(({ payload }) => payload.kind === "stack" && payload.item === "cordreed");
      if (!lot || lot.payload.kind !== "stack") throw new Error("cordreed lot vanished");
      const dropped = drop(world, pack, { lotId: lot.id, quantity: 1, x: 500_000, y: 500_000 });
      expect(looseCargoCarrierLoadMilli(dropped.carrier) + looseCargoPayloadLoadMilli(dropped.entity!.payload))
        .toBe(baselineLoad);
      const recovered = pickupLooseCargo(dropped.world, dropped.carrier, {
        entityId: dropped.entity!.id,
        x: 500_000,
        y: 500_000,
        reach: 0,
      });
      expect(recovered.ok).toBe(true);
      expect(looseCargoCarrierLoadMilli(recovered.carrier)).toBe(baselineLoad);
      expect(projectLooseCargoCarrier(recovered.carrier).craftingInventory.stacks.cordreed).toBe(5);
      world = recovered.world;
      pack = recovered.carrier;
    }
    expect(world.entities).toEqual([]);
    expect(world.lastEntityOrdinal).toBe(12);
  });
});

describe("bounded fixed-step current, slope, impact, and living-cover hooks", () => {
  function oneDroppedEntity(x = 1_500_000, y = 1_500_000) {
    return drop(
      createLooseCargoWorld(4, 4),
      carrier(),
      { lotId: "crafting-stack:cordreed", quantity: 1, x, y },
    ).world;
  }

  it("uses the shared cargo-environment force and damage evaluator for immersed drift", () => {
    const world = oneDroppedEntity();
    const environment: CargoEnvironmentSample = {
      ...CALM,
      immersion: FIXED_POINT,
      currentX: FIXED_POINT,
      magicalWaterFlux: 400_000,
    };
    const result = stepLooseCargo(world, [sample(1, { environment })]);
    const entity = result.state.entities[0];
    if (!entity) throw new Error("entity vanished");
    const shared = evaluateCargoEnvironment({
      property: "ordinary",
      state: world.entities[0]!.materialState,
      environment,
    });

    expect(result.ok).toBe(true);
    expect(entity.x).toBeGreaterThan(world.entities[0]!.x);
    expect(entity.velocityX).toBeGreaterThan(0);
    expect(entity.velocityX).toBeLessThanOrEqual(LOOSE_CARGO_MAX_VELOCITY);
    expect(entity.materialState).toEqual(shared.nextState);
    expect(result.events[0]).toMatchObject({
      moved: true,
      boundaryCollision: false,
      conditionLoss: shared.change.conditionLoss,
    });
    expect(result.events[0]?.causes).toContain("current-drift");
    expect(result.events[0]?.causes).toContain("magic-water");
  });

  it("lets grade move dry cargo and applies caller-resolved tumble through the shared impact channel", () => {
    const world = oneDroppedEntity();
    const result = stepLooseCargo(world, [sample(1, {
      downhillX: -FIXED_POINT,
      downhillY: FIXED_POINT / 2,
      tumbleImpact: 800_000,
    })]);
    const entity = result.state.entities[0];
    if (!entity) throw new Error("entity vanished");
    expect(entity.x).toBeLessThan(world.entities[0]!.x);
    expect(entity.y).toBeGreaterThan(world.entities[0]!.y);
    expect(result.events[0]).toMatchObject({ impactApplied: 800_000, moved: true });
    expect(result.events[0]?.causes).toContain("impact-shock");
    expect(entity.materialState.condition).toBeLessThan(FIXED_POINT);
  });

  it("lets mangroves gently arrest drift while bramble also exposes an impact hook", () => {
    const world = oneDroppedEntity();
    const moving = stepLooseCargo(world, [sample(1, {
      environment: { ...CALM, immersion: FIXED_POINT, currentX: FIXED_POINT },
    })]);
    const mangrove = stepLooseCargo(world, [sample(1, {
      environment: { ...CALM, immersion: FIXED_POINT, currentX: FIXED_POINT },
      mangroveSnag: FIXED_POINT,
    })]);
    const bramble = stepLooseCargo(world, [sample(1, {
      environment: { ...CALM, immersion: FIXED_POINT, currentX: FIXED_POINT },
      brambleSnag: FIXED_POINT,
    })]);

    expect(moving.state.entities[0]?.velocityX).toBeGreaterThan(0);
    expect(mangrove.state.entities[0]?.velocityX).toBe(0);
    expect(mangrove.events[0]).toMatchObject({ moved: false, impactApplied: 0, snags: ["mangrove"] });
    expect(bramble.state.entities[0]?.velocityX).toBe(0);
    expect(bramble.events[0]).toMatchObject({ moved: false, impactApplied: 200_000, snags: ["bramble"] });
    expect(bramble.events[0]?.causes).toContain("impact-shock");
  });

  it("clamps at every world boundary, records collision impact, and never deletes ruined cargo", () => {
    const maximum = 4 * LOOSE_CARGO_TILE_UNITS - 1;
    let world = oneDroppedEntity(maximum - 10, maximum - 10);
    const hostile = sample(1, {
      environment: {
        ...CALM,
        immersion: FIXED_POINT,
        currentX: FIXED_POINT,
        currentY: FIXED_POINT,
        magicalWaterFlux: FIXED_POINT,
      },
      downhillX: FIXED_POINT,
      downhillY: FIXED_POINT,
      tumbleImpact: FIXED_POINT,
    });
    for (let step = 0; step < 2_500; step += 1) {
      const result = stepLooseCargo(world, [hostile]);
      expect(result.ok).toBe(true);
      expect(result.state.entities).toHaveLength(1);
      const entity = result.state.entities[0]!;
      expect(entity.x).toBeGreaterThanOrEqual(0);
      expect(entity.x).toBeLessThanOrEqual(maximum);
      expect(entity.y).toBeGreaterThanOrEqual(0);
      expect(entity.y).toBeLessThanOrEqual(maximum);
      expect(Math.abs(entity.velocityX)).toBeLessThanOrEqual(LOOSE_CARGO_MAX_VELOCITY);
      expect(Math.abs(entity.velocityY)).toBeLessThanOrEqual(LOOSE_CARGO_MAX_VELOCITY);
      world = result.state;
    }
    expect(world.entities[0]).toMatchObject({
      x: maximum,
      y: maximum,
      materialState: { condition: 0 },
    });
    expect(world.lastEntityOrdinal).toBe(1);
  });

  it("is invariant to entity and sample input ordering", () => {
    const first = drop(
      createLooseCargoWorld(5, 5),
      carrier(),
      { lotId: "crafting-stack:cordreed", quantity: 1, x: 1_000_000, y: 1_000_000 },
    );
    const second = drop(
      first.world,
      first.carrier,
      { lotId: "crafting-stack:pitchcloth", quantity: 1, x: 3_000_000, y: 3_000_000 },
    );
    const samples = [
      sample(1, {
        environment: { ...CALM, immersion: 700_000, currentX: 800_000 },
        mangroveSnag: 200_000,
      }),
      sample(2, {
        downhillY: -600_000,
        tumbleImpact: 300_000,
        brambleSnag: 400_000,
      }),
    ];
    const reversedWorld: LooseCargoWorldState = {
      ...second.world,
      entities: [...second.world.entities].reverse(),
    };

    const forward = stepLooseCargo(second.world, samples);
    const reversed = stepLooseCargo(reversedWorld, [...samples].reverse());
    expect(reversed).toEqual(forward);
  });

  it("fails the whole step on duplicate or unknown samples without mutating world state", () => {
    const world = oneDroppedEntity();
    const duplicate = stepLooseCargo(world, [sample(1), sample(1)]);
    expect(duplicate).toEqual({ ok: false, reason: "invalid-sample", state: world, events: [] });
    const unknown = stepLooseCargo(world, [sample(99)]);
    expect(unknown).toEqual({ ok: false, reason: "invalid-sample", state: world, events: [] });
    expect(stepLooseCargo(world, []).state.entities[0]?.materialState.condition).toBe(FIXED_POINT);
  });
});

describe("canonical loose-cargo save validation", () => {
  function twoEntityWorld(): LooseCargoWorldState {
    const first = drop(
      createLooseCargoWorld(6, 5),
      carrier(),
      { lotId: "gear:17", x: 1_000_000, y: 1_000_000 },
    );
    return drop(
      first.world,
      first.carrier,
      { lotId: "promise:41", x: 2_000_000, y: 2_000_000 },
    ).world;
  }

  it("canonicalizes entity order and has a stable validated round-trip", () => {
    const world = twoEntityWorld();
    const reversed = { ...world, entities: [...world.entities].reverse() };
    const validation = validateLooseCargoWorld(reversed);

    expect(validation.valid).toBe(true);
    expect(validation.state?.entities.map(({ id }) => id)).toEqual([entityId(1), entityId(2)]);
    expect(serializeLooseCargoWorld(reversed)).toBe(serializeLooseCargoWorld(world));
    expect(deserializeLooseCargoWorld(serializeLooseCargoWorld(reversed))).toEqual(world);
  });

  it("rejects malformed JSON and all identity, bounds, counter, and Promise-property corruption", () => {
    const world = twoEntityWorld();
    expect(() => deserializeLooseCargoWorld("not json")).toThrow(/not valid JSON/);
    expect(validateLooseCargoWorld(null).reason).toBe("not-an-object");
    expect(validateLooseCargoWorld({ ...world, version: 99 }).reason).toBe("invalid-version");
    expect(validateLooseCargoWorld({ ...world, revision: -1 }).reason).toBe("invalid-revision");
    expect(validateLooseCargoWorld({ ...world, width: 0 }).reason).toBe("invalid-dimensions");
    expect(validateLooseCargoWorld({ ...world, lastEntityOrdinal: 0 }).reason).toBe("invalid-ordinal");
    expect(validateLooseCargoWorld({
      ...world,
      entities: world.entities.map((entity, index) => index === 0 ? { ...entity, x: -1 } : entity),
    }).reason).toBe("invalid-entity");
    expect(validateLooseCargoWorld({
      ...world,
      entities: world.entities.map((entity, index) => index === 0
        ? entity
        : { ...entity, id: world.entities[0]!.id, origin: world.entities[0]!.origin }),
    }).reason).toBe("duplicate-entity-id");
    expect(validateLooseCargoWorld({
      ...world,
      entities: world.entities.map((entity, index) => index === 1 && entity.payload.kind === "promise"
        ? { ...entity, payload: { ...entity.payload, property: "heavy" } }
        : entity),
    }).reason).toBe("invalid-entity");
    expect(validateLooseCargoWorld({
      ...world,
      entities: world.entities.map((entity, index) => index === 1
        ? { ...entity, payload: world.entities[0]!.payload }
        : entity),
    }).reason).toBe("duplicate-durable-identity");
    expect(validateLooseCargoWorld({
      ...world,
      entities: world.entities.map((entity, index) => index === 0
        ? { ...entity, materialState: { ...entity.materialState, condition: Number.NaN } }
        : entity),
    }).reason).toBe("invalid-entity");
  });

  it("validates carrier ordering, load, lot IDs, and durable identities independently", () => {
    const pack = carrier();
    const reversed = { ...pack, lots: [...pack.lots].reverse() };
    const valid = validateLooseCargoCarrier(reversed);
    expect(valid.valid).toBe(true);
    expect(valid.carrier).toEqual(pack);

    expect(validateLooseCargoCarrier({ ...pack, reservedLoadMilli: -1 }).reason)
      .toBe("invalid-capacity");
    expect(validateLooseCargoCarrier({ ...pack, capacityMilliLoad: 1_000 }).reason)
      .toBe("over-capacity");
    expect(validateLooseCargoCarrier({
      ...pack,
      lots: pack.lots.map((lot) => ({ ...lot, id: "same" })),
    }).reason).toBe("duplicate-lot-id");
    const gear = pack.lots.find(({ payload }) => payload.kind === "gear");
    if (!gear) throw new Error("gear fixture missing");
    expect(validateLooseCargoCarrier({
      ...pack,
      lots: [...pack.lots, { ...gear, id: "duplicate-gear-lot" }],
    }).reason).toBe("duplicate-durable-identity");
  });

  it("rejects malformed or oversized simulation samples atomically", () => {
    const dropped = drop(
      createLooseCargoWorld(2, 2),
      carrier(),
      { lotId: "crafting-stack:cordreed", quantity: 1, x: 500_000, y: 500_000 },
    );
    const result = stepLooseCargo(dropped.world, [{
      entityId: entityId(1),
      environment: {
        rain: Number.POSITIVE_INFINITY,
        heat: Number.NaN,
        cold: -50,
        immersion: 9_000_000,
        currentX: -9_000_000,
        currentY: 9_000_000,
        magicalWaterFlux: 9_000_000,
        impact: 9_000_000,
      },
      waterDepth: 9_000_000,
      downhillX: Number.NaN,
      downhillY: Number.POSITIVE_INFINITY,
      tumbleImpact: 9_000_000,
      mangroveSnag: -99,
      brambleSnag: 9_000_000,
    }]);
    expect(result).toEqual({
      ok: false,
      reason: "invalid-sample",
      state: dropped.world,
      events: [],
    });

    const bounded = stepLooseCargo(dropped.world, [sample(1, {
      environment: {
        ...CALM,
        immersion: FIXED_POINT,
        currentX: -FIXED_POINT,
        currentY: FIXED_POINT,
        magicalWaterFlux: FIXED_POINT,
        impact: FIXED_POINT,
      },
      waterDepth: FIXED_POINT,
      downhillX: -FIXED_POINT,
      downhillY: FIXED_POINT,
      tumbleImpact: FIXED_POINT,
      brambleSnag: FIXED_POINT,
    })]);
    expect(bounded.ok).toBe(true);
    expect(validateLooseCargoWorld(bounded.state).valid).toBe(true);
  });
});

describe("fall separation, exact identity, and exploit resistance", () => {
  it("splits one Promise into two stable parcels with exact conservation and distinct motion", () => {
    const world = createLooseCargoWorld(8, 8);
    const pack = carrier();
    const request = {
      lotId: "promise:41",
      x: 2_000_000,
      y: 2_000_000,
      cause: "fall-separation" as const,
      parts: [
        { quantity: 1, velocityX: 120_000, velocityY: 0 },
        { quantity: 2, velocityX: 0, velocityY: 0 },
      ],
    };

    const separated = scatterLooseCargo(world, pack, request);
    expect(separated.ok, separated.message).toBe(true);
    expect(separated.reason).toBe("ready");
    expect(separated.conservation?.conserved).toBe(true);
    expect(separated.entities.map(({ id }) => id)).toEqual([entityId(1), entityId(2)]);
    expect(separated.entities.map(({ payload }) => payload)).toEqual([
      { kind: "promise", contractId: 41, resource: "medicine", quantity: 1, property: "fragile" },
      { kind: "promise", contractId: 41, resource: "medicine", quantity: 2, property: "fragile" },
    ]);
    expect(projectLooseCargoCarrier(separated.carrier).promises).toEqual([]);
    expect(scatterLooseCargo(world, pack, request)).toEqual(separated);
    expect(scatterLooseCargo(separated.world, separated.carrier, request).reason).toBe("lot-not-found");

    const advanced = stepLooseCargo(separated.world, [
      sample(entityId(1), {
        environment: { ...CALM, immersion: 800_000, currentX: 600_000 },
        waterDepth: 800_000,
      }),
      sample(entityId(2)),
    ]);
    expect(advanced.ok).toBe(true);
    expect(advanced.state.entities.map(({ motion }) => motion)).toEqual(["drifting", "resting"]);
  });

  it("splits and merges material stacks without duplication or condition reset", () => {
    const separated = scatterLooseCargo(createLooseCargoWorld(6, 6), carrier(), {
      lotId: "crafting-stack:cordreed",
      x: 1_000_000,
      y: 1_000_000,
      cause: "fall-separation",
      parts: [
        { quantity: 2, velocityX: 0, velocityY: 0 },
        { quantity: 1, velocityX: 0, velocityY: 0 },
      ],
    });
    expect(separated.ok).toBe(true);
    expect(projectLooseCargoCarrier(separated.carrier).craftingInventory.stacks.cordreed).toBe(2);

    const wet = stepLooseCargo(separated.world, [
      sample(entityId(1), {
        environment: { ...CALM, immersion: FIXED_POINT, magicalWaterFlux: FIXED_POINT },
        waterDepth: FIXED_POINT,
      }),
      sample(entityId(2)),
    ]);
    const damagedState = wet.state.entities.find(({ id }) => id === entityId(1))!.materialState;
    expect(damagedState.condition).toBeLessThan(FIXED_POINT);

    const firstPickup = pickupLooseCargo(wet.state, separated.carrier, {
      entityId: entityId(1),
      x: wet.state.entities.find(({ id }) => id === entityId(1))!.x,
      y: wet.state.entities.find(({ id }) => id === entityId(1))!.y,
      reach: 0,
    });
    expect(firstPickup.ok).toBe(true);
    expect(firstPickup.carrier.lots.find(({ id }) => id === `loose:${entityId(1)}`)?.materialState)
      .toEqual(damagedState);
    const redropped = dropLooseCargo(firstPickup.world, firstPickup.carrier, {
      lotId: `loose:${entityId(1)}`,
      quantity: 2,
      x: 1_000_000,
      y: 1_000_000,
    });
    expect(redropped.ok).toBe(true);
    expect(redropped.entity?.materialState).toEqual(damagedState);
    expect(redropped.entity?.id).toBe(entityId(3));

    const secondPickup = pickupLooseCargo(redropped.world, redropped.carrier, {
      entityId: entityId(2),
      x: 1_000_000,
      y: 1_000_000,
      reach: 0,
    });
    expect(secondPickup.ok).toBe(true);
    expect(projectLooseCargoCarrier(secondPickup.carrier).craftingInventory.stacks.cordreed).toBe(3);
  });

  it("uses deterministic impact fallback at the exact 64-parcel loaded cap", () => {
    expect(LOOSE_CARGO_MAX_ENTITIES).toBe(64);
    let world = createLooseCargoWorld(4, 4);
    let pack = createLooseCargoCarrier(
      PLAYER,
      createCraftingInventory(100_000, { cordreed: LOOSE_CARGO_MAX_ENTITIES + 1 }),
    );
    for (let batch = 0; batch < 4; batch += 1) {
      const result = scatterLooseCargo(world, pack, {
        lotId: "crafting-stack:cordreed",
        x: 1_000_000,
        y: 1_000_000,
        cause: "forced-release",
        parts: Array.from({ length: 16 }, () => ({ quantity: 1, velocityX: 0, velocityY: 0 })),
      });
      expect(result.ok).toBe(true);
      world = result.world;
      pack = result.carrier;
    }
    expect(world.entities).toHaveLength(LOOSE_CARGO_MAX_ENTITIES);
    const before = pack.lots.find(({ id }) => id === "crafting-stack:cordreed")!.materialState;
    const fallback = scatterLooseCargo(world, pack, {
      lotId: "crafting-stack:cordreed",
      x: 1_000_000,
      y: 1_000_000,
      cause: "fall-separation",
      parts: [{ quantity: 1, velocityX: LOOSE_CARGO_MAX_VELOCITY, velocityY: 0 }],
    });
    expect(fallback.ok).toBe(true);
    expect(fallback.reason).toBe("fallback-impact");
    expect(fallback.entities).toEqual([]);
    expect(fallback.world.entities).toHaveLength(LOOSE_CARGO_MAX_ENTITIES);
    const after = fallback.carrier.lots.find(({ id }) => id === "crafting-stack:cordreed")!.materialState;
    expect(after.condition).toBeLessThan(before.condition);
    expect(projectLooseCargoCarrier(fallback.carrier).craftingInventory.stacks.cordreed).toBe(1);
  });
});

describe("authoritative carrier mutation boundary", () => {
  it("adds idempotent source lots and consumes exact units in ascending lot-ID order", () => {
    let pack = createLooseCargoCarrier(PLAYER, createCraftingInventory(100_000));
    const b = addLooseCargoStack(pack, {
      sourceLotId: "gather:b",
      item: "cordreed",
      quantity: 2,
      materialState: { condition: 900_000, contamination: 10, decay: 20 },
    });
    expect(b.ok).toBe(true);
    pack = b.carrier;
    const a = addLooseCargoStack(pack, {
      sourceLotId: "gather:a",
      item: "cordreed",
      quantity: 2,
      materialState: { condition: 800_000, contamination: 30, decay: 40 },
    });
    expect(a.ok).toBe(true);
    pack = a.carrier;
    const repeated = addLooseCargoStack(pack, {
      sourceLotId: "gather:a",
      item: "cordreed",
      quantity: 2,
      materialState: { condition: 800_000, contamination: 30, decay: 40 },
    });
    expect(repeated).toMatchObject({ ok: true, reason: "unchanged" });
    expect(repeated.carrier.revision).toBe(pack.revision);
    expect(addLooseCargoStack(pack, {
      sourceLotId: "gather:a",
      item: "cordreed",
      quantity: 3,
    }).reason).toBe("identity-conflict");

    const consumed = consumeLooseCargoStack(pack, { item: "cordreed", quantity: 3 });
    expect(consumed.ok).toBe(true);
    expect(consumed.removed.map(({ id, payload }) => [id, payload.kind === "stack" ? payload.quantity : 0]))
      .toEqual([["gather:a", 2], ["gather:b", 1]]);
    expect(consumed.carrier.lots.find(({ id }) => id === "gather:b")?.payload)
      .toEqual({ kind: "stack", item: "cordreed", quantity: 1 });
    expect(consumed.carrier.retiredLotIds).toContain("gather:a");
    const replayRequest = {
      sourceLotId: "gather:a",
      item: "cordreed" as const,
      quantity: 2,
      materialState: { condition: 800_000, contamination: 30, decay: 40 },
    };
    expect(addLooseCargoStack(consumed.carrier, replayRequest).reason).toBe("identity-conflict");
    const reloaded = deserializeLooseCargoCarrier(serializeLooseCargoCarrier(consumed.carrier));
    expect(addLooseCargoStack(reloaded, replayRequest).reason).toBe("identity-conflict");
    expect(consumeLooseCargoStack(consumed.carrier, { item: "cordreed", quantity: 2 }).reason)
      .toBe("quantity-unavailable");
  });

  it("upserts, wears, and removes one durable identity without duplication", () => {
    let pack = createLooseCargoCarrier(PLAYER, createCraftingInventory(100_000));
    const added = upsertLooseCargoGear(pack, {
      sourceLotId: "craft:gear:900",
      gearId: 900,
      gearKind: "ladder",
      materialState: { condition: FIXED_POINT, contamination: 0, decay: 0 },
    });
    expect(added.ok).toBe(true);
    pack = added.carrier;
    const worn = setLooseCargoGearCondition(pack, 900, 640_000);
    expect(worn.ok).toBe(true);
    expect(worn.carrier.lots[0]?.materialState.condition).toBe(640_000);
    expect(upsertLooseCargoGear(worn.carrier, {
      sourceLotId: "duplicate-source",
      gearId: 900,
      gearKind: "ladder",
      materialState: { condition: FIXED_POINT, contamination: 0, decay: 0 },
    }).reason).toBe("identity-conflict");
    const removed = removeLooseCargoGear(worn.carrier, 900);
    expect(removed.ok).toBe(true);
    expect(removed.removed[0]?.materialState.condition).toBe(640_000);
    expect(removeLooseCargoGear(removed.carrier, 900).reason).toBe("lot-not-found");
  });

  it("updates exact Promise lots and signed-report reserve atomically within capacity", () => {
    let pack = createLooseCargoCarrier(PLAYER, createCraftingInventory(5_000));
    const promise = upsertLooseCargoPromise(pack, {
      sourceLotId: "contract:12:parcel:a",
      contractId: 12,
      resource: "medicine",
      quantity: 2,
      property: "fragile",
      materialState: { condition: 900_000, contamination: 0, decay: 0 },
    });
    expect(promise.ok).toBe(true);
    pack = promise.carrier;
    const weathered = setLooseCargoPromiseMaterialState(pack, "contract:12:parcel:a", {
      condition: 700_000,
      contamination: 40_000,
      decay: 10_000,
    });
    expect(weathered.ok).toBe(true);
    expect(setLooseCargoReservedLoad(weathered.carrier, 3_000).reason).toBe("capacity-exceeded");
    const report = setLooseCargoReservedLoad(weathered.carrier, 1_000);
    expect(report.ok).toBe(true);
    expect(report.carrier.reservedLoadMilli).toBe(1_000);
    const removed = removeLooseCargoPromise(report.carrier, "contract:12:parcel:a");
    expect(removed.ok).toBe(true);
    expect(removed.removed[0]?.materialState).toEqual({
      condition: 700_000,
      contamination: 40_000,
      decay: 10_000,
    });
  });

  it("updates the exact carried stack lot after a fall without flattening its provenance", () => {
    const pack = carrier();
    const before = pack.lots.find(({ id }) => id === "crafting-stack:cordreed");
    if (!before) throw new Error("cordreed fixture missing");
    const impacted = setLooseCargoLotMaterialState(pack, before.id, {
      condition: 612_000,
      contamination: 73_000,
      decay: 9_000,
    });
    expect(impacted.ok).toBe(true);
    expect(impacted.affectedLotId).toBe(before.id);
    expect(impacted.carrier.lots.find(({ id }) => id === before.id)).toEqual({
      ...before,
      materialState: {
        condition: 612_000,
        contamination: 73_000,
        decay: 9_000,
      },
    });
    expect(impacted.carrier.lots.filter(({ id }) => id === before.id)).toHaveLength(1);
    expect(pack.lots.find(({ id }) => id === before.id)?.materialState.condition).toBe(FIXED_POINT);

    const promiseOnly = setLooseCargoPromiseMaterialState(pack, before.id, {
      condition: 500_000,
      contamination: 0,
      decay: 0,
    });
    expect(promiseOnly).toMatchObject({ ok: false, reason: "lot-not-found", carrier: pack });
  });

  it("fails every carrier mutation closed when its revision cursor is saturated", () => {
    const pack = {
      ...createLooseCargoCarrier(PLAYER, createCraftingInventory(100_000)),
      revision: LOOSE_CARGO_MAX_ORDINAL,
    };
    const result = addLooseCargoStack(pack, {
      sourceLotId: "gather:saturated",
      item: "cordreed",
      quantity: 1,
    });
    expect(result.reason).toBe("revision-space-exhausted");
    expect(result.carrier).toEqual(pack);
  });
});

describe("save authority, global addresses, and bounded soak", () => {
  it("round-trips exact carrier lots and detects deletion against the persisted expected manifest", () => {
    const beforeWorld = createLooseCargoWorld(4, 4);
    const beforeCarrier = carrier();
    const expected = createLooseCargoExpectedManifest(beforeWorld, beforeCarrier);
    const dropped = drop(beforeWorld, beforeCarrier, {
      lotId: "crafting-stack:cordreed",
      quantity: 2,
      x: 500_000,
      y: 500_000,
    });

    const carrierText = serializeLooseCargoCarrier(dropped.carrier);
    expect(deserializeLooseCargoCarrier(carrierText)).toEqual(dropped.carrier);
    const expectedText = serializeLooseCargoExpectedManifest(expected);
    const reloadedExpected = deserializeLooseCargoExpectedManifest(expectedText);
    expect(validateLooseCargoExpectedManifest(reloadedExpected, dropped.world, dropped.carrier).reason)
      .toBe("valid");

    const silentlyDeleted = { ...dropped.world, entities: [] };
    expect(validateLooseCargoWorld(silentlyDeleted).valid).toBe(true);
    expect(validateLooseCargoExpectedManifest(reloadedExpected, silentlyDeleted, dropped.carrier).reason)
      .toBe("manifest-mismatch");
    expect(validateLooseCargoExpectedManifest({ ...expected, fingerprint: "tampered" }, dropped.world, dropped.carrier).reason)
      .toBe("invalid-expected");
  });

  it("preserves negative and extremely distant safe region addresses and string identities", () => {
    const region = { x: -Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };
    const world = createLooseCargoWorld(2, 2, region);
    const dropped = drop(world, carrier(), {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: 1,
      y: 1,
    });
    expect(dropped.entity?.id).toBe(entityId(1, region));
    expect(deserializeLooseCargoWorld(serializeLooseCargoWorld(dropped.world))).toEqual(dropped.world);
    expect(validateLooseCargoWorld({ ...world, region: { x: Number.MAX_VALUE, y: 0 } }).reason)
      .toBe("invalid-region");
  });

  it("refuses missing authoritative samples and entity-ordinal saturation without mutation", () => {
    const dropped = drop(createLooseCargoWorld(3, 3), carrier(), {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: 500_000,
      y: 500_000,
    });
    expect(stepLooseCargo(dropped.world, [])).toEqual({
      ok: false,
      reason: "invalid-sample",
      state: dropped.world,
      events: [],
    });

    const saturated = {
      ...createLooseCargoWorld(3, 3),
      lastEntityOrdinal: LOOSE_CARGO_MAX_ORDINAL,
    };
    expect(validateLooseCargoWorld(saturated).valid).toBe(true);
    const refused = dropLooseCargo(saturated, carrier(), {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: 500_000,
      y: 500_000,
    });
    expect(refused.reason).toBe("id-space-exhausted");
    expect(refused.world).toEqual(saturated);
  });

  it("deep-freezes every state admitted to the trusted validation fast path", () => {
    const dropped = drop(createLooseCargoWorld(3, 3), carrier(), {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: 500_000,
      y: 500_000,
    });
    const entity = dropped.world.entities[0]!;
    expect(Object.isFrozen(dropped.world)).toBe(true);
    expect(Object.isFrozen(dropped.world.entities)).toBe(true);
    expect(Object.isFrozen(entity)).toBe(true);
    expect(Object.isFrozen(entity.materialState)).toBe(true);
    expect(() => {
      (entity.materialState as { condition: number }).condition = Number.NaN;
    }).toThrow(TypeError);
    expect(() => {
      (dropped.world.entities as LooseCargoEntity[]).push(entity);
    }).toThrow(TypeError);
    expect(stepLooseCargo(dropped.world, [sample(entity.id)]).ok).toBe(true);
  });

  it("runs 64 moving parcels for ten simulated minutes with bounded causal save evidence", () => {
    let world = createLooseCargoWorld(64, 4);
    let pack = createLooseCargoCarrier(
      PLAYER,
      createCraftingInventory(100_000, { cordreed: LOOSE_CARGO_MAX_ENTITIES }),
    );
    for (let batch = 0; batch < 4; batch += 1) {
      const result = scatterLooseCargo(world, pack, {
        lotId: "crafting-stack:cordreed",
        x: 1_000_000,
        y: 1_000_000 + batch,
        cause: "forced-release",
        parts: Array.from({ length: 16 }, () => ({ quantity: 1, velocityX: 0, velocityY: 0 })),
      });
      expect(result.ok).toBe(true);
      world = result.world;
      pack = result.carrier;
    }
    const samples = world.entities.map((entity) => sample(entity.id, {
      environment: {
        ...CALM,
        immersion: 800_000,
        currentX: 500_000,
        magicalWaterFlux: 100_000,
      },
      waterDepth: 800_000,
    }));
    const started = Date.now();
    for (let tick = 0; tick < 6_000; tick += 1) {
      const result = stepLooseCargo(world, samples);
      expect(result.ok, `tick ${tick}: ${result.reason}`).toBe(true);
      world = result.state;
    }
    const elapsed = Date.now() - started;
    const serialized = serializeLooseCargoWorld(world);
    expect(world.entities).toHaveLength(LOOSE_CARGO_MAX_ENTITIES);
    expect(world.history.length).toBeLessThanOrEqual(LOOSE_CARGO_RETAINED_HISTORY);
    expect(world.historyBaseOrdinal).toBeGreaterThan(0);
    expect(world.historyArchiveHash).not.toBe("0000000000000000");
    expect(serialized.length).toBeLessThan(3_000_000);
    expect(elapsed).toBeLessThan(10_000);
    expect(validateLooseCargoWorld(world).valid).toBe(true);
  }, 20_000);
});
