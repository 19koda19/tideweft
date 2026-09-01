import { describe, expect, it } from "vitest";

import {
  STRAND_AUTOMATION_THRESHOLD,
  createWorld,
  createWorldView,
} from "../sim/public";
import {
  captureSessionBaseline,
  createSessionState,
  sessionOutcomeDelta,
} from "./sessionTypes";

describe("session outcome accounting", () => {
  it("separates compounding world follow-through from the player's own deliveries", () => {
    const world = createWorld("quiet hour consequences");
    const session = createSessionState(world.meta.seedText);
    const stressedSettlement = world.settlements[0];
    if (!stressedSettlement) throw new Error("fixture missing settlement");
    stressedSettlement.stress = 400_000;
    session.sessionBaseline = captureSessionBaseline(createWorldView(world));

    const autonomousContract = world.contracts.find((contract) => contract.status === "offered");
    const latentRoute = world.routes.find((route) => route.traceStrength < STRAND_AUTOMATION_THRESHOLD);
    const settlement = world.settlements[0];
    const trust = settlement?.trust[0];
    if (!autonomousContract || !latentRoute || !settlement || !trust) throw new Error("fixture missing");

    autonomousContract.status = "fulfilled";
    latentRoute.traceStrength = STRAND_AUTOMATION_THRESHOLD;
    latentRoute.condition = Math.max(latentRoute.condition, 180_000);
    settlement.stress = Math.max(0, settlement.stress - 40_000);
    trust.value += 20_000;
    settlement.project.progress += 3;

    const outcome = sessionOutcomeDelta(session, createWorldView(world));
    expect(outcome).not.toBeNull();
    expect(outcome?.autonomousDeliveries).toBe(1);
    expect(outcome?.activeRoutes).toBe(1);
    expect(outcome?.resilience).toBeGreaterThan(0);
    expect(outcome?.averageStress).toBeLessThan(0);
    expect(outcome?.averageTrust).toBeGreaterThan(0);
    expect(outcome?.projectProgress).toBe(3);
  });

  it("does not invent comparisons before a session baseline exists", () => {
    const world = createWorldView(createWorld("no false recap"));
    expect(sessionOutcomeDelta(createSessionState(world.seedText), world)).toBeNull();
  });
});
