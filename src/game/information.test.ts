import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  createWorld,
  createWorldView,
  runTicks,
  stepWorld,
} from "../sim/public";
import { cargoWeight, createPlayer, discoverAround, loadContractCargo } from "./player";
import { projectGameView } from "./projection";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";

describe("information as physical, sourced progress", () => {
  it("hides authoritative remote stores until the player actually verifies the harbor", () => {
    const world = createWorld("fog has meaning");
    const view = createWorldView(world);
    const local = view.settlements[0];
    const remote = view.settlements.at(-1);
    if (!local || !remote) throw new Error("missing settlements");
    const player = createPlayer(view, local.id);
    const session = createSessionState(world.meta.seedText);
    session.selectedSettlementId = remote.id;

    const uncertain = projectUIView(view, player, session).selectedSettlement;
    expect(uncertain?.lastVerified).toContain("Unverified");
    expect(uncertain?.stocks.every((stock) => stock.amountLabel === "Unverified")).toBe(true);
    expect(uncertain?.metrics.every((metric) => metric.valueLabel === "Unknown" || metric.valueLabel === "Unverified")).toBe(true);

    const remoteTile = view.terrain.tiles[remote.tileIndex];
    if (!remoteTile) throw new Error("missing remote tile");
    player.x = remoteTile.x * 1_000 + 500;
    player.y = remoteTile.y * 1_000 + 500;
    discoverAround(player, view, 2);
    const verified = projectUIView(view, player, session).selectedSettlement;
    expect(verified?.lastVerified).not.toContain("Unverified —");
    expect(verified?.stocks.some((stock) => /^\d+$/.test(stock.amountLabel))).toBe(true);
  });

  it("makes a signed report consume capacity and become a distinct, destination-specific objective", () => {
    const world = createWorld("signed counts");
    const view = createWorldView(world);
    const source = view.settlements[0];
    const target = view.settlements[1];
    const offered = view.contracts.find((contract) => contract.status === "offered");
    if (!source || !target || !offered) throw new Error("missing report fixture");
    const player = createPlayer(view, source.id);
    player.report = {
      sourceSettlementId: source.id,
      targetSettlementId: target.id,
      resource: source.specialization,
      reportedQuantity: source.inventory[source.specialization],
      observedTick: view.completedTick,
      confidence: FIXED_POINT,
    };
    expect(cargoWeight(player)).toBe(1);

    const fullHeavyPromise = { ...offered, resource: "parts" as const, quantity: 9, status: "offered" as const };
    expect(loadContractCargo(player, fullHeavyPromise)).toBe(false);
    const session = createSessionState(world.meta.seedText);
    session.tutorial.dismissed = true;
    const objective = projectUIView(view, player, session).objective;
    expect(objective?.id).toBe(`report-${source.id}-${target.id}`);
    expect(objective?.eyebrow).toBe(`Deliver report to ${target.name}`);
    expect(objective?.title).toContain("DELIVER VERIFIED");
    expect(objective?.title).toContain(`COUNT → ${target.name}`);
    expect(objective?.description).toContain(`${source.name} recorded ${player.report.reportedQuantity}`);
    expect(objective?.description).toContain("uses one pack slot");
    expect(objective?.description).toContain(`${target.name}'s harbor with E`);
    expect(objective?.why).toContain(`PICKUP: ${source.name} ✓`);
    expect(objective?.why).toContain(`DELIVERY: ${target.name}`);

    const targetTile = view.terrain.tiles[target.tileIndex];
    if (!targetTile) throw new Error("missing target tile");
    player.x = targetTile.x * 1_000 + 500;
    player.y = targetTile.y * 1_000 + 500;
    const targetView = projectUIView(view, player, session);
    expect(targetView.controls?.interactLabel).toBe("Deliver report");
    expect(targetView.objective?.title).toContain(target.name);

    const initialDocument = projectGameView(view, player).player.cargo.find((cargo) => cargo.property === "confidential");
    runTicks(world, 100);
    const agedDocument = projectGameView(createWorldView(world), player).player.cargo.find(
      (cargo) => cargo.property === "confidential",
    );
    expect(initialDocument?.condition).toBe(1);
    expect(agedDocument?.condition).toBeCloseTo(0.955, 6);
  });

  it("names both pickup and delivery harbors before physical cargo is collected", () => {
    const world = createWorld("two named stops");
    const view = createWorldView(world);
    const offered = view.contracts.find((contract) => contract.status === "offered");
    if (!offered) throw new Error("missing offered contract");
    const origin = view.settlements.find((settlement) => settlement.id === offered.originSettlementId);
    const destination = view.settlements.find((settlement) => settlement.id === offered.destinationSettlementId);
    if (!origin || !destination) throw new Error("missing contract harbors");
    const player = createPlayer(view);
    const session = createSessionState(world.meta.seedText);
    session.tutorial.dismissed = true;
    session.trackedContractId = offered.id;

    const projected = projectUIView(view, player, session);
    expect(projected.objective?.id).toBe(`pickup-${offered.id}`);
    expect(projected.objective?.eyebrow).toBe(`Pick up at ${origin.name}`);
    expect(projected.objective?.title).toContain(`← ${origin.name}`);
    expect(projected.objective?.description).toContain("it is not in your pack yet");
    expect(projected.objective?.progressLabel).toContain(`then deliver to ${destination.name}`);
    expect(projected.objective?.why).toContain(`PICKUP: ${origin.name}`);
    expect(projected.objective?.why).toContain(`DELIVERY: ${destination.name}`);
  });

  it("makes a local cargo offer directly collectible and changes to delivery state after pickup", () => {
    const world = createWorld("cargo waiting on the dock");
    const view = createWorldView(world);
    const offered = view.contracts.find((contract) => contract.status === "offered");
    if (!offered) throw new Error("missing offered contract");
    const origin = view.settlements.find((settlement) => settlement.id === offered.originSettlementId);
    const destination = view.settlements.find((settlement) => settlement.id === offered.destinationSettlementId);
    if (!origin || !destination) throw new Error("missing contract harbors");
    const player = createPlayer(view, origin.id);
    const session = createSessionState(world.meta.seedText);
    session.tutorial.dismissed = true;
    session.trackedContractId = offered.id;

    const before = projectUIView(view, player, session);
    const card = before.contracts.find((contract) => contract.id === String(offered.id));
    expect(card?.actionLabel).toBe("Pick up cargo here");
    expect(card?.disabled).toBe(false);
    expect(before.controls?.interactLabel).toBe("Pick up cargo");
    expect(before.objective?.title).toContain("PICK UP");
    expect(projectGameView(view, player, {
      destinationSettlementId: origin.id,
      destinationKind: "pickup",
    }).player.destinationLabel).toBe(`PICK UP CARGO · ${origin.name}`);

    expect(loadContractCargo(player, offered)).toBe(true);
    const after = projectUIView(view, player, session);
    expect(after.objective?.title).toContain(`DELIVER ${offered.quantity}`);
    expect(after.objective?.title).toContain(destination.name);
    expect(after.objective?.description).toContain("cargo is in your pack");
    expect(projectGameView(view, player, {
      destinationSettlementId: destination.id,
      destinationKind: "delivery",
    }).player.destinationLabel).toBe(`DELIVER CARGO · ${destination.name}`);
  });

  it("locks swept controls and never presents drift as complete before shore", () => {
    const world = createWorld("the current has the helm");
    const view = createWorldView(world);
    const harbor = view.settlements[0];
    if (!harbor) throw new Error("missing harbor");
    const player = createPlayer(view, harbor.id);
    const session = createSessionState(world.meta.seedText);
    session.titleVisible = false;
    session.paused = false;
    player.mode = "swept";
    player.pace = "rest";
    player.sweepTicksRemaining = 0;
    player.sweepTotalTicks = 1;
    player.sweepPath = [Math.min(view.terrain.tiles.length - 1, harbor.tileIndex + 1)];

    const projected = projectUIView(view, player, session);
    expect(projected.controls?.canScan).toBe(false);
    expect(projected.controls?.canInteract).toBe(false);
    expect(projected.field.swept).toBe(true);
    expect(projected.field.sweptProgress).toBeLessThan(1);
    expect(projected.field.hint).toContain("Current has the helm");
    expect(projected.field.hint).toContain("Steering and sounding return ashore");
    expect(projected.field.hint).not.toContain("Pace");
  });

  it("explains that stock reports are documents and route tending requires a surveyed path", () => {
    const world = createWorld("honest harbor controls");
    const view = createWorldView(world);
    const harbor = view.settlements[0];
    if (!harbor) throw new Error("missing harbor");
    const player = createPlayer(view, harbor.id);
    const session = createSessionState(world.meta.seedText);
    session.tutorial.dismissed = true;
    session.selectedSettlementId = harbor.id;

    const before = projectUIView(view, player, session).selectedSettlement?.connections[0];
    if (!before?.routeId) throw new Error("missing route connection");
    expect(before.actionLabel).toBe("Survey this route first");
    expect(before.actionDisabled).toBe(true);
    expect(before.actionHint).toContain("Travel from");
    expect(before.actionHint).toContain("Surveying proves which physical path");
    expect(before.reportActionLabel).toMatch(/^Sign info report → /);
    expect(before.reportActionHint).toContain("current");
    expect(before.reportActionHint).toContain("uses 1 document slot");
    expect(before.reportActionHint).toContain("moves no cargo or supplies");
    expect(before.reportActionHint).toContain("arrive and press E");

    const remoteHarbor = view.settlements.find((settlement) => String(settlement.id) === before.id);
    const sourceTile = view.terrain.tiles[harbor.tileIndex];
    const remoteTile = remoteHarbor ? view.terrain.tiles[remoteHarbor.tileIndex] : undefined;
    if (!sourceTile || !remoteTile) throw new Error("missing report guidance tiles");
    player.x = remoteTile.x * 1_000 + 500;
    player.y = remoteTile.y * 1_000 + 500;
    const remoteReport = projectUIView(view, player, session).selectedSettlement?.connections[0];
    expect(remoteReport?.reportActionDisabled).toBe(true);
    expect(remoteReport?.reportActionLabel).toBe(`Reach ${harbor.name} to sign`);
    expect(remoteReport?.reportActionHint).toContain(`Travel onto ${harbor.name}'s harbor mark first`);
    expect(remoteReport?.reportActionHint).toContain("remote inspection cannot create one");

    player.x = sourceTile.x * 1_000 + 500;
    player.y = sourceTile.y * 1_000 + 500;
    player.cargo = [{
      contractId: -1,
      resource: "reed",
      quantity: player.cargoCapacity,
      condition: FIXED_POINT,
      property: "ordinary",
    }];
    const fullReport = projectUIView(view, player, session).selectedSettlement?.connections[0];
    expect(fullReport?.reportActionDisabled).toBe(true);
    expect(fullReport?.reportActionLabel).toBe("Need 1 document slot");
    expect(fullReport?.reportActionHint).toContain("Free 1 load slot");
    expect(fullReport?.reportActionHint).toContain("document case must be carried physically");
    player.cargo = [];

    player.surveyedRouteIds.push(Number(before.routeId));
    const after = projectUIView(view, player, session).selectedSettlement?.connections
      .find((connection) => connection.routeId === before.routeId);
    expect(after?.surveyed).toBe(true);
    expect(after?.actionLabel).toMatch(/^Spend 1 part to (strengthen|repair) route$/);
    expect(after?.actionHint).toContain("Uses 1 part");
  });

  it("delivers self-sourced knowledge with age, confidence, and an auditable event", () => {
    const world = createWorld("truth crosses water");
    const source = world.settlements[0];
    const target = world.settlements[1];
    if (!source || !target) throw new Error("missing settlements");
    const existing = target.knowledge.find(
      (record) => record.subjectSettlementId === source.id && record.resource === source.specialization,
    );
    if (!existing) throw new Error("missing initial knowledge");
    existing.reportedQuantity = 0;
    existing.confidence = 10_000;
    existing.ageTicks = 999;

    stepWorld(world, [{
      id: "signed-report",
      type: "share-knowledge",
      fromSettlementId: source.id,
      toSettlementId: target.id,
      subjectSettlementId: source.id,
      resource: source.specialization,
      reportedQuantity: source.inventory[source.specialization],
      observedTick: world.meta.completedTick,
      confidence: 920_000,
    }]);

    expect(existing.reportedQuantity).toBe(source.inventory[source.specialization]);
    expect(existing.ageTicks).toBe(2);
    expect(existing.confidence).toBeGreaterThan(890_000);
    expect(world.events.at(-1)?.type).toBe("knowledge-shared");
    expect(world.events.at(-1)?.data.commandId).toBe("signed-report");
    expect(world.events.at(-1)?.data.ageTicks).toBe(1);
    expect(world.events.at(-1)?.data.confidence).toBe(894_550);
  });

  it("keeps the displayed tide phases aligned with the 720-minute water triangle", () => {
    const world = createWorld("readable tide");
    const player = createPlayer(createWorldView(world));
    const session = createSessionState(world.meta.seedText);
    const phaseAt = (tick: number) => {
      runTicks(world, tick - world.meta.completedTick);
      return projectUIView(createWorldView(world), player, session).tide.phase;
    };
    expect(phaseAt(0)).toBe("low");
    expect(phaseAt(90)).toBe("flood");
    expect(phaseAt(270)).toBe("high");
    expect(phaseAt(450)).toBe("ebb");
    expect(phaseAt(630)).toBe("low");
  });
});
