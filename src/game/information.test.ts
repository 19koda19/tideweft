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

  it("makes a signed report consume capacity and become a persistent travel objective", () => {
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

    const fullHeavyPromise = { ...offered, resource: "parts" as const, quantity: 8, status: "offered" as const };
    expect(loadContractCargo(player, fullHeavyPromise)).toBe(false);
    const session = createSessionState(world.meta.seedText);
    session.tutorial.dismissed = true;
    const objective = projectUIView(view, player, session).objective;
    expect(objective?.eyebrow).toBe("Information is cargo");
    expect(objective?.title).toContain(target.name);
    expect(objective?.description).toContain(String(player.report.reportedQuantity));

    const initialDocument = projectGameView(view, player).player.cargo.find((cargo) => cargo.property === "confidential");
    runTicks(world, 100);
    const agedDocument = projectGameView(createWorldView(world), player).player.cargo.find(
      (cargo) => cargo.property === "confidential",
    );
    expect(initialDocument?.condition).toBe(1);
    expect(agedDocument?.condition).toBeCloseTo(0.955, 6);
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
