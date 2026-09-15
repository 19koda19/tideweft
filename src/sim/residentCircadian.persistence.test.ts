import { describe, expect, it } from "vitest";

import {
  RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
  canonicalizeLivingCircadianPersistentState,
  livingCircadianPhaseOffsetTicks,
  projectLivingCircadianClockPreference,
  replaceResidentCircadian,
  residentCircadianUrgentPreference,
  residentHomeRestDestinationId,
  type LivingCircadianPersistentState,
} from "./livingCircadian";
import {
  assertWorldInvariants,
  createWorld,
  createWorldView,
  deserializeWorld,
  serializeWorld,
  stepWorld,
} from "./public";
import type { ResidentState, WorldState } from "./types";
import { WORLD_DAWN_START_TICK } from "./worldTime";

function firstResident(world: WorldState): ResidentState {
  const resident = world.residents[0];
  if (resident === undefined) throw new Error("Circadian fixture has no resident");
  return resident;
}

function receipt(
  resident: ResidentState,
  posture: LivingCircadianPersistentState["posture"] = {
    state: "resting",
    enteredAtTick: resident.perception.tick,
  },
  restDestinationArrived = true,
): LivingCircadianPersistentState {
  const restDestinationId = residentHomeRestDestinationId(
    resident.identity.stableId,
    resident.homeSettlementId,
  );
  if (restDestinationId === null) throw new Error("Resident destination fixture failed");
  return {
    version: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.version,
    ownerId: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.ownerId,
    policy: RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
    restDestinationId,
    restDestinationArrived,
    posture,
  };
}

describe("resident circadian persistence seam", () => {
  it("accepts and byte-preserves legacy worlds with no optional receipt", () => {
    const world = createWorld("resident circadian legacy");
    const legacyText = serializeWorld(world);

    expect(world.residents.every((resident) => !Object.hasOwn(resident, "circadian"))).toBe(true);
    expect(serializeWorld(deserializeWorld(legacyText))).toBe(legacyText);
    expect(JSON.stringify(createWorldView(world))).not.toContain('"circadian"');
  });

  it("persists a bound receipt and projects a deep canonical view copy", () => {
    const world = createWorld("resident circadian persistence");
    const original = firstResident(world);
    const circadian = receipt(original);
    world.residents[0] = replaceResidentCircadian(original, {
      atTick: world.meta.completedTick,
      circadian,
    });

    assertWorldInvariants(world);
    stepWorld(world);
    expect(firstResident(world).circadian).toEqual(circadian);
    assertWorldInvariants(world);
    const encoded = serializeWorld(world);
    const restored = deserializeWorld(encoded);
    expect(serializeWorld(restored)).toBe(encoded);
    expect(firstResident(restored).circadian).toEqual(circadian);

    const viewCircadian = createWorldView(restored).residents[0]?.circadian;
    expect(viewCircadian).toEqual(circadian);
    expect(viewCircadian).not.toBe(firstResident(restored).circadian);
    expect(viewCircadian?.policy).not.toBe(firstResident(restored).circadian?.policy);
    expect(viewCircadian?.posture).not.toBe(firstResident(restored).circadian?.posture);
  });

  it("rejects malformed, explicit-undefined, unbound, and future-dated receipts", () => {
    const world = createWorld("resident circadian rejection");
    const resident = firstResident(world);
    const circadian = receipt(resident);

    expect(canonicalizeLivingCircadianPersistentState({
      ...circadian,
      unexpected: true,
    })).toBeNull();

    const explicitUndefined = createWorld("resident circadian explicit undefined");
    Object.assign(firstResident(explicitUndefined), { circadian: undefined });
    expect(() => assertWorldInvariants(explicitUndefined)).toThrow(/circadian state/u);

    const wrongDestination = createWorld("resident circadian wrong destination");
    firstResident(wrongDestination).circadian = {
      ...receipt(firstResident(wrongDestination)),
      restDestinationId: "resident-home:forged",
    };
    expect(() => assertWorldInvariants(wrongDestination)).toThrow(/circadian state/u);
    expect(() => createWorldView(wrongDestination)).toThrow(/circadian state/u);

    const wrongPolicy = createWorld("resident circadian wrong policy");
    firstResident(wrongPolicy).circadian = {
      ...receipt(firstResident(wrongPolicy)),
      policy: { ...RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY, profileId: "night-active" },
    };
    expect(() => assertWorldInvariants(wrongPolicy)).toThrow(/circadian state/u);

    const future = createWorld("resident circadian future tick");
    const futureResident = firstResident(future);
    futureResident.circadian = receipt(futureResident, {
      state: "awake",
      enteredAtTick: future.meta.completedTick + 1,
    });
    expect(() => assertWorldInvariants(future)).toThrow(/circadian state/u);
  });

  it("replaces only at the resident cognition tick and can repair stale arrival", () => {
    const world = createWorld("resident circadian same tick");
    const resident = firstResident(world);
    const adopted = replaceResidentCircadian(resident, {
      atTick: resident.perception.tick,
      circadian: receipt(resident),
    });

    expect(adopted).not.toBe(resident);
    expect(adopted.circadian).toEqual(receipt(resident));
    expect(resident).not.toHaveProperty("circadian");
    expect(() => replaceResidentCircadian(adopted, {
      atTick: resident.perception.tick + 1,
      circadian: receipt(resident),
    })).toThrow(/current tick/u);
    expect(() => replaceResidentCircadian(adopted, {
      atTick: -0,
      circadian: receipt(resident),
    })).toThrow(/current tick/u);
    expect(() => replaceResidentCircadian(adopted, {
      atTick: resident.perception.tick,
      circadian: receipt(resident, {
        state: "awake",
        enteredAtTick: resident.perception.tick + 1,
      }),
    })).toThrow(/future-dated/u);

    const assigned = { ...adopted, activeContractId: 999 };
    const reconciled = replaceResidentCircadian(assigned, {
      atTick: assigned.perception.tick,
      circadian: receipt(assigned, {
        state: "awake",
        enteredAtTick: assigned.perception.tick,
      }, false),
    });
    expect(reconciled.circadian?.restDestinationArrived).toBe(false);
  });

  it("derives an opaque destination from both stable human and home settlement", () => {
    const world = createWorld("resident circadian destination");
    const resident = firstResident(world);
    const destination = residentHomeRestDestinationId(
      resident.identity.stableId,
      resident.homeSettlementId,
    );

    expect(destination).toMatch(/^resident-home:[0-9a-f]{16}$/u);
    expect(residentHomeRestDestinationId(
      resident.identity.stableId,
      resident.homeSettlementId,
    )).toBe(destination);
    expect(residentHomeRestDestinationId(
      `${resident.identity.stableId}-other`,
      resident.homeSettlementId,
    )).not.toBe(destination);
    expect(residentHomeRestDestinationId(
      resident.identity.stableId,
      resident.homeSettlementId + 1,
    )).not.toBe(destination);
    expect(residentHomeRestDestinationId(resident.identity.stableId, -0)).toBeNull();
  });

  it("shares the exact stable-phase clock boundary with the game projector", () => {
    const resident = firstResident(createWorld("resident circadian clock boundary"));
    const offset = livingCircadianPhaseOffsetTicks(
      resident.identity.stableId,
      RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY.profileId,
    );
    if (offset === null) throw new Error("Resident phase fixture failed");
    const firstActiveTick = WORLD_DAWN_START_TICK + offset;

    expect(projectLivingCircadianClockPreference(
      resident.identity.stableId,
      firstActiveTick - 1,
      RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
    )).toBe("rest");
    expect(projectLivingCircadianClockPreference(
      resident.identity.stableId,
      firstActiveTick,
      RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
    )).toBe("active");
    expect(projectLivingCircadianClockPreference(
      resident.identity.stableId,
      -0,
      RESIDENT_DAY_ACTIVE_CIRCADIAN_POLICY,
    )).toBeNull();
  });

  it("shares urgent resident preference thresholds and deterministic tie order", () => {
    expect(residentCircadianUrgentPreference({
      needs: { food: 800_000, rest: 800_000, belonging: 800_000 },
      exhaustion: 0,
    })).toEqual({ referenceId: "need:food", preference: "active" });
    expect(residentCircadianUrgentPreference({
      needs: { food: 800_000, rest: 900_000, belonging: 800_000 },
      exhaustion: 0,
    })).toEqual({ referenceId: "need:rest", preference: "rest" });
    expect(residentCircadianUrgentPreference({
      needs: { food: 0, rest: 0, belonging: 0 },
      exhaustion: 900_000,
    })).toEqual({ referenceId: "condition:exhaustion", preference: "rest" });
    expect(residentCircadianUrgentPreference({
      needs: { food: 759_999, rest: 749_999, belonging: 759_999 },
      exhaustion: 719_999,
    })).toBeNull();
  });
});
