import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { mobileHudCopy } from "../ui/createTideweftUI";
import { createCraftingInventory } from "./crafting";
import {
  LOOSE_CARGO_TILE_UNITS,
  createLooseCargoCarrier,
  createLooseCargoWorld,
  dropLooseCargo,
} from "./looseCargo";
import { TILE_UNITS, createPlayer, loadContractCargo } from "./player";
import { projectGameView } from "./projection";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";

const PORTER = { kind: "player", id: "local-porter" } as const;

function promiseProperty(resource: "food" | "freshWater" | "reed" | "medicine" | "parts") {
  if (resource === "medicine") return "fragile" as const;
  if (resource === "food") return "perishable" as const;
  if (resource === "freshWater" || resource === "parts") return "heavy" as const;
  return "ordinary" as const;
}

function compactObjective(view: ReturnType<typeof projectUIView>): string {
  const objective = view.objective;
  return mobileHudCopy({
    objectiveTitle: objective?.title,
    objectiveRoute: objective?.why,
    objectiveProgress: objective?.progressLabel,
    stamina: view.player.stamina,
    stability: view.player.stability,
    stabilityHint: view.player.stabilityHint,
    bracing: view.player.bracing === true,
    isWater: view.field.isWater,
    terrain: view.field.terrainLabel,
    depth: view.field.depthLabel,
    effort: view.field.effortLabel,
    swept: view.field.swept,
    fieldHint: view.field.hint,
    canScan: view.controls?.canScan,
    interactLabel: view.controls?.interactLabel,
    wayknotLabel: view.controls?.wayknotLabel,
  }).objective;
}

describe("active Promise recovery guidance", () => {
  it.each([
    [3, 0, "3.0 tiles east"],
    [-3, 0, "3.0 tiles west"],
    [0, -3, "3.0 tiles north"],
    [0, 3, "3.0 tiles south"],
    [2, -2, "4.0 tiles north-east"],
    [-2, -2, "4.0 tiles north-west"],
    [2, 2, "4.0 tiles south-east"],
    [-2, 2, "4.0 tiles south-west"],
    [0, 0, "0.0 tiles here"],
  ] as const)("names a loose parcel at offset (%i, %i) as %s", (dx, dy, expected) => {
    const world = createWorldView(createWorld("promise compass guidance"));
    const contract = world.contracts.find(({ status }) => status === "offered");
    if (!contract) throw new Error("missing Promise fixture");
    const player = createPlayer(world);
    player.x = 10 * TILE_UNITS;
    player.y = 10 * TILE_UNITS;
    player.activeContractId = contract.id;
    const carrier = createLooseCargoCarrier(
      PORTER,
      createCraftingInventory(100_000),
      [{
        contractId: contract.id,
        resource: contract.resource,
        quantity: contract.quantity,
        property: promiseProperty(contract.resource),
        condition: 900_000,
      }],
    );
    const dropped = dropLooseCargo(
      createLooseCargoWorld(world.terrain.width, world.terrain.height),
      carrier,
      {
        lotId: `promise:${contract.id}`,
        x: (10 + dx) * LOOSE_CARGO_TILE_UNITS,
        y: (10 + dy) * LOOSE_CARGO_TILE_UNITS,
      },
    );
    if (!dropped.ok) throw new Error(`failed Promise drop fixture: ${dropped.reason}`);
    const session = createSessionState(world.seedText);
    session.tutorial.dismissed = true;

    const objective = projectUIView(world, player, session, {
      looseCargoCarrier: dropped.carrier,
      looseCargoWorld: dropped.world,
    }).objective;
    expect(objective?.id).toBe(`recover-${contract.id}`);
    expect(objective?.description).toContain(`${expected} · resting`);
    expect(objective?.description).toContain("press E within reach on desktop");
    expect(objective?.description).toContain("tap its parcel marker on mobile");
  });

  it("connects active-contract focus to the production render projection without changing identity", () => {
    const world = createWorldView(createWorld("focused Promise presentation"));
    const contract = world.contracts.find(({ status }) => status === "offered");
    if (!contract) throw new Error("missing Promise fixture");
    const player = createPlayer(world);
    player.x = TILE_UNITS;
    player.y = TILE_UNITS;
    const carrier = createLooseCargoCarrier(
      PORTER,
      createCraftingInventory(100_000),
      [{
        contractId: contract.id,
        resource: contract.resource,
        quantity: contract.quantity,
        property: promiseProperty(contract.resource),
        condition: 900_000,
      }],
    );
    const dropped = dropLooseCargo(
      createLooseCargoWorld(world.terrain.width, world.terrain.height),
      carrier,
      {
        lotId: `promise:${contract.id}`,
        x: 50 * LOOSE_CARGO_TILE_UNITS,
        y: LOOSE_CARGO_TILE_UNITS,
      },
    );
    if (!dropped.ok || !dropped.entity) throw new Error(`failed Promise drop fixture: ${dropped.reason}`);

    player.activeContractId = null;
    expect(projectGameView(world, player, { looseCargoWorld: dropped.world }).looseCargo).toEqual([]);
    player.activeContractId = contract.id;
    const projected = projectGameView(world, player, { looseCargoWorld: dropped.world }).looseCargo;
    expect(projected?.map(({ id }) => id)).toEqual([dropped.entity.id]);
    expect(dropped.world.entities.map(({ id }) => id)).toEqual([dropped.entity.id]);

    const session = createSessionState(world.seedText);
    session.tutorial.dismissed = true;
    const recoveryView = projectUIView(world, player, session, {
      looseCargoCarrier: dropped.carrier,
      looseCargoWorld: dropped.world,
    });
    expect(compactObjective(recoveryView)).toMatch(/RECOVER .*49\.0 tiles east · resting/u);
  });

  it("leaves ordinary compact PICK UP and DELIVER objective composition unchanged", () => {
    const world = createWorldView(createWorld("ordinary compact Promise copy"));
    const contract = world.contracts.find(({ status }) => status === "offered");
    if (!contract) throw new Error("missing Promise fixture");
    const player = createPlayer(world);
    const session = createSessionState(world.seedText);
    session.tutorial.dismissed = true;
    session.trackedContractId = contract.id;

    const pickupView = projectUIView(world, player, session);
    const pickupObjective = pickupView.objective;
    expect(compactObjective(pickupView)).toBe([
      pickupObjective?.why,
      pickupObjective?.title,
      pickupObjective?.progressLabel,
    ].join(" · "));
    expect(pickupObjective?.progressLabel).toMatch(/tiles to pickup · then deliver to/u);
    expect(compactObjective(pickupView)).not.toContain(" · resting");

    expect(loadContractCargo(player, contract)).toBe(true);
    const deliveryView = projectUIView(world, player, session);
    const deliveryObjective = deliveryView.objective;
    expect(compactObjective(deliveryView)).toBe([
      deliveryObjective?.why,
      deliveryObjective?.title,
      deliveryObjective?.progressLabel,
    ].join(" · "));
    expect(deliveryObjective?.progressLabel).toMatch(/tiles remaining · \d+% condition/u);
    expect(compactObjective(deliveryView)).not.toContain(" · resting");
  });
});
