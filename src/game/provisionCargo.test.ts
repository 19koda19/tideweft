import { describe, expect, it } from "vitest";

import { FIXED_POINT } from "../sim/types";
import { ACTOR_ID_MAX_LENGTH } from "../sim/actorPerception";
import { createCraftingInventory } from "./crafting";
import { PROVISION_DEFINITIONS } from "./provisions";
import {
  addLooseCargoProvision,
  consumeLooseCargoProvisionLot,
  createLooseCargoCarrier,
  createLooseCargoWorld,
  deserializeLooseCargoCarrier,
  dropLooseCargo,
  inspectLooseCargoMultiCarrierConservation,
  looseCargoPayloadLoadMilli,
  looseCargoPayloadProperty,
  pickupLooseCargo,
  projectLooseCargoCarrier,
  provisionFragmentLotId,
  serializeLooseCargoCarrier,
  type LooseCargoCarrierState,
  type LooseCargoOwner,
} from "./looseCargo";

const ACTOR = { kind: "actor", id: "porter:glasswater:17" } as const;
const OTHER_ACTOR = { kind: "actor", id: "dog:glasswater:4" } as const;

function emptyCarrier(
  owner: LooseCargoOwner = ACTOR,
  capacityMilliLoad = 20_000,
): LooseCargoCarrierState {
  return createLooseCargoCarrier(owner, createCraftingInventory(capacityMilliLoad));
}

function provisionCarrier(quantity = 4): LooseCargoCarrierState {
  const added = addLooseCargoProvision(emptyCarrier(), {
    sourceLotId: "provision:generated:17",
    provision: "dried-fish",
    quantity,
    materialState: { condition: 910_000, contamination: 7_000, decay: 22_000 },
  });
  expect(added.ok).toBe(true);
  return added.carrier;
}

describe("ordinary physical provision lots", () => {
  it("defines bounded species-neutral nourishment without a parallel food switch", () => {
    expect(Object.isFrozen(PROVISION_DEFINITIONS)).toBe(true);
    for (const definition of Object.values(PROVISION_DEFINITIONS)) {
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Number.isSafeInteger(definition.nutrition)).toBe(true);
      expect(definition.nutrition).toBeGreaterThan(0);
      expect(definition.nutrition).toBeLessThanOrEqual(FIXED_POINT);
    }
    expect(PROVISION_DEFINITIONS["dried-fish"].nutrition)
      .toBeGreaterThan(PROVISION_DEFINITIONS["fresh-produce"].nutrition);
  });

  it("accepts canonical lossless actor IDs through the shared 192-character envelope", () => {
    const actorId = `dog/region:${"x".repeat(ACTOR_ID_MAX_LENGTH - "dog/region:".length)}`;
    expect(actorId).toHaveLength(ACTOR_ID_MAX_LENGTH);
    expect(emptyCarrier({ kind: "actor", id: actorId }).owner).toEqual({ kind: "actor", id: actorId });
    expect(() => emptyCarrier({ kind: "actor", id: "bad actor id" })).toThrow(/invalid-owner/);
  });

  it("remain separate from crafting and Promise payloads with exact load and material behavior", () => {
    const carrier = provisionCarrier(3);
    const lot = carrier.lots[0];
    expect(lot).toEqual({
      id: "provision:generated:17",
      payload: {
        kind: "provision",
        lotId: "provision:generated:17",
        provision: "dried-fish",
        quantity: 3,
      },
      materialState: { condition: 910_000, contamination: 7_000, decay: 22_000 },
    });
    if (!lot) throw new Error("fixture provision missing");
    expect(looseCargoPayloadLoadMilli(lot.payload)).toBe(1_950);
    expect(looseCargoPayloadProperty(lot.payload)).toBe("perishable");
    const projection = projectLooseCargoCarrier(carrier);
    expect(projection.provisions).toEqual([{
      lotId: "provision:generated:17",
      provision: "dried-fish",
      quantity: 3,
      materialState: { condition: 910_000, contamination: 7_000, decay: 22_000 },
    }]);
    expect(projection.promises).toEqual([]);
    expect(Object.values(projection.craftingInventory.stacks).every((quantity) => quantity === 0)).toBe(true);
  });

  it("preserves a whole lot identity through drop and pickup", () => {
    const beforeWorld = createLooseCargoWorld(8, 8, { x: -81, y: 2_000_000 });
    const beforeCarrier = provisionCarrier(4);
    const dropped = dropLooseCargo(beforeWorld, beforeCarrier, {
      lotId: "provision:generated:17",
      quantity: 4,
      x: 2 * FIXED_POINT,
      y: 3 * FIXED_POINT,
    });
    expect(dropped.ok).toBe(true);
    expect(dropped.entity?.payload).toMatchObject({
      kind: "provision",
      lotId: "provision:generated:17",
      quantity: 4,
    });
    expect(dropped.world.history[0]?.payloadKey)
      .toBe("provision:dried-fish:lot:provision:generated:17");
    expect(dropped.carrier.lots).toEqual([]);
    expect(dropped.carrier.retiredLotIds).not.toContain("provision:generated:17");

    const picked = pickupLooseCargo(dropped.world, dropped.carrier, {
      entityId: dropped.entity?.id ?? "missing",
      x: 2 * FIXED_POINT,
      y: 3 * FIXED_POINT,
      reach: 0,
    });
    expect(picked.ok).toBe(true);
    expect(picked.carrier.lots[0]?.id).toBe("provision:generated:17");
    expect(picked.conservation?.conserved).toBe(true);
  });

  it("gives a deterministic child identity to a partial drop and recovers that exact fragment", () => {
    const world = createLooseCargoWorld(8, 8);
    const carrier = provisionCarrier(4);
    const dropped = dropLooseCargo(world, carrier, {
      lotId: "provision:generated:17",
      quantity: 1,
      x: FIXED_POINT,
      y: FIXED_POINT,
    });
    expect(dropped.ok).toBe(true);
    const entity = dropped.entity;
    if (!entity || entity.payload.kind !== "provision") throw new Error("provision parcel missing");
    const childLotId = provisionFragmentLotId(entity.id);
    expect(entity.payload.lotId).toBe(childLotId);
    expect(dropped.world.history[0]?.payloadKey)
      .toBe(`provision:dried-fish:lot:${childLotId}`);
    expect(dropped.carrier.lots[0]).toMatchObject({
      id: "provision:generated:17",
      payload: { quantity: 3 },
    });

    const picked = pickupLooseCargo(dropped.world, dropped.carrier, {
      entityId: entity.id,
      x: FIXED_POINT,
      y: FIXED_POINT,
      reach: 0,
    });
    expect(picked.ok).toBe(true);
    expect(picked.carrier.lots.map(({ id }) => id)).toEqual([
      childLotId,
      "provision:generated:17",
    ].sort());
    expect(picked.carrier.lots.reduce((total, lot) =>
      total + (lot.payload.kind === "provision" ? lot.payload.quantity : 0), 0)).toBe(4);
    expect(picked.world.history[1]?.payloadKey)
      .toBe(`provision:dried-fish:lot:${childLotId}`);
  });

  it("records exact partial consumption and tombstones only an exhausted lot", () => {
    const carrier = provisionCarrier(4);
    const partial = consumeLooseCargoProvisionLot(carrier, {
      lotId: "provision:generated:17",
      quantity: 1,
    });
    expect(partial.ok).toBe(true);
    expect(partial.removed).toEqual([expect.objectContaining({
      id: "provision:generated:17",
      payload: expect.objectContaining({ quantity: 1 }),
    })]);
    expect(partial.carrier.lots[0]?.payload).toMatchObject({ quantity: 3 });
    expect(partial.carrier.retiredLotIds).toEqual([]);

    const exhausted = consumeLooseCargoProvisionLot(partial.carrier, {
      lotId: "provision:generated:17",
      quantity: 3,
    });
    expect(exhausted.ok).toBe(true);
    expect(exhausted.carrier.lots).toEqual([]);
    expect(exhausted.carrier.retiredLotIds).toEqual(["provision:generated:17"]);
    expect(addLooseCargoProvision(exhausted.carrier, {
      sourceLotId: "provision:generated:17",
      provision: "dried-fish",
      quantity: 4,
    }).reason).toBe("identity-conflict");
  });
});

describe("multi-carrier custody conservation", () => {
  it("is canonical across carrier order and rejects one live lot in two carriers", () => {
    const first = provisionCarrier(2);
    const secondAdded = addLooseCargoProvision(emptyCarrier(OTHER_ACTOR), {
      sourceLotId: "provision:dog:4",
      provision: "trail-ration",
      quantity: 1,
    });
    expect(secondAdded.ok).toBe(true);
    const second = secondAdded.carrier;
    const forward = inspectLooseCargoMultiCarrierConservation([], [first, second]);
    const reverse = inspectLooseCargoMultiCarrierConservation([], [second, first]);
    expect(forward).toEqual(reverse);
    expect(forward.valid).toBe(true);

    const duplicate = {
      ...second,
      revision: second.revision + 1,
      lots: first.lots,
    } satisfies LooseCargoCarrierState;
    expect(inspectLooseCargoMultiCarrierConservation([], [first, duplicate])).toMatchObject({
      valid: false,
      reason: "duplicate-parcel-identity",
    });
  });

  it("rejects stale carried duplication of a provision already represented in the world", () => {
    const world = createLooseCargoWorld(8, 8);
    const carrier = provisionCarrier(2);
    const dropped = dropLooseCargo(world, carrier, {
      lotId: "provision:generated:17",
      quantity: 2,
      x: FIXED_POINT,
      y: FIXED_POINT,
    });
    expect(dropped.ok).toBe(true);
    expect(inspectLooseCargoMultiCarrierConservation([dropped.world], [carrier])).toMatchObject({
      valid: false,
      reason: "duplicate-parcel-identity",
    });
    expect(inspectLooseCargoMultiCarrierConservation([dropped.world], [dropped.carrier]).valid).toBe(true);
  });

  it("treats a consumed lot tombstone as globally terminal across actor carriers", () => {
    const consumed = consumeLooseCargoProvisionLot(provisionCarrier(1), {
      lotId: "provision:generated:17",
      quantity: 1,
    });
    expect(consumed.ok).toBe(true);
    const forgedReappearance = addLooseCargoProvision(emptyCarrier(OTHER_ACTOR), {
      sourceLotId: "provision:generated:17",
      provision: "dried-fish",
      quantity: 1,
    });
    expect(forgedReappearance.ok).toBe(true);
    expect(inspectLooseCargoMultiCarrierConservation(
      [],
      [consumed.carrier, forgedReappearance.carrier],
    )).toMatchObject({
      valid: false,
      reason: "duplicate-parcel-identity",
    });
  });

  it("keeps published v1 player-carrier saves readable and byte-canonical", () => {
    const legacy = createLooseCargoCarrier(
      { kind: "player", id: "local-porter" },
      createCraftingInventory(18_000, { cordreed: 2 }),
    );
    const encoded = serializeLooseCargoCarrier(legacy);
    const decoded = deserializeLooseCargoCarrier(encoded);
    expect(decoded).toEqual(legacy);
    expect(decoded.version).toBe(1);
    expect(projectLooseCargoCarrier(decoded).provisions).toEqual([]);
  });
});
