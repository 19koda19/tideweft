import { describe, expect, it } from "vitest";

import {
  STRAND_AUTOMATION_THRESHOLD,
  createWorld,
  createWorldView,
} from "../sim/public";
import { PERPETUAL_SESSION_SHAPE, type SessionShape } from "../ui/types";
import { createPlayer } from "./player";
import {
  captureSessionBaseline,
  createSessionState,
  sessionOutcomeDelta,
} from "./sessionTypes";
import { projectUIView } from "./uiProjection";

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

describe("perpetual-world session compatibility", () => {
  it("defaults every newly created session to the perpetual Wander value", () => {
    const session = createSessionState("open horizon");

    expect(PERPETUAL_SESSION_SHAPE).toBe("wander");
    expect(session.sessionShape).toBe(PERPETUAL_SESSION_SHAPE);
    expect(session.closureOffered).toBe(false);
  });

  it.each<SessionShape>(["drift", "weave", "wander"])(
    "loads the legacy %s value while projecting the same open-ended objective",
    (legacyShape) => {
      const world = createWorldView(createWorld(`legacy ${legacyShape} session`));
      const player = createPlayer(world);
      const session = createSessionState(world.seedText, "journey", legacyShape);
      session.tutorial.dismissed = true;
      session.closureOffered = legacyShape !== "wander";
      session.sessionDeliveries = 12;
      session.sessionStrandsWoven = 4;

      const view = projectUIView(world, player, session);

      expect(view.sessionShape).toBe(legacyShape);
      expect(view.objective).toMatchObject({
        id: "perpetual-estuary",
        eyebrow: "Perpetual estuary",
        title: "Choose the next useful thread",
      });
      expect(view.objective?.description).toContain("no session timer or quota");
      expect(view.objective?.description).toContain("Quiet Hour whenever you choose");
      expect(view.objective?.completed).not.toBe(true);
    },
  );
});
