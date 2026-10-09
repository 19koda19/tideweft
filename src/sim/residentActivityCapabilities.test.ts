import { describe, expect, it } from "vitest";

import {
  RESIDENT_ACTIVITY_VERSION,
  RESIDENT_SERVICE_ACTIVITY_VERSION,
  RESIDENT_CIVIC_ACTIVITY_VERSION,
  RESIDENT_INSPECTION_ACTIVITY_VERSION,
  RESIDENT_ENVIRONMENT_ACTIVITY_VERSION,
  RESIDENT_PICKUP_ACTIVITY_VERSION,
  residentActivitySupportsPickup,
  residentActivitySupportsEnvironment,
  residentActivitySupportsInspection,
  residentActivitySupportsRations,
  residentActivitySupportsMaterials,
  type ResidentActivity,
} from "./residentActivity";

type CapabilityInput = Pick<ResidentActivity, "version">;

describe("explicit resident activity protocol capabilities", () => {
  // These version-only probes classify an already identified protocol. They
  // neither authenticate a complete activity shape nor admit world actions.
  it.each([
    ["v1 rest-only", RESIDENT_ACTIVITY_VERSION, false, false, false, false, false],
    ["v2 ration service", RESIDENT_SERVICE_ACTIVITY_VERSION, true, false, false, false, false],
    ["v3 civic material service", RESIDENT_CIVIC_ACTIVITY_VERSION, true, true, false, false, false],
    ["v4 evidence-bound inspection", RESIDENT_INSPECTION_ACTIVITY_VERSION, true, true, true, false, false],
    ["v5 observed-rest environment", RESIDENT_ENVIRONMENT_ACTIVITY_VERSION, true, true, true, true, false],
    ["v6 contract origin pickup", RESIDENT_PICKUP_ACTIVITY_VERSION, true, true, true, true, true],
  ] as const)("classifies %s without dropping earlier capabilities", (_label, version, rations, materials, inspection, environment, pickup) => {
    const input: CapabilityInput = { version };
    expect(residentActivitySupportsRations(input)).toBe(rations);
    expect(residentActivitySupportsMaterials(input)).toBe(materials);
    expect(residentActivitySupportsInspection(input)).toBe(inspection);
    expect(residentActivitySupportsEnvironment(input)).toBe(environment);
    expect(residentActivitySupportsPickup(input)).toBe(pickup);
  });

  it.each([undefined, null])("does not infer capabilities from absent activity %s", (input) => {
    expect(residentActivitySupportsRations(input)).toBe(false);
    expect(residentActivitySupportsMaterials(input)).toBe(false);
    expect(residentActivitySupportsInspection(input)).toBe(false);
    expect(residentActivitySupportsEnvironment(input)).toBe(false);
    expect(residentActivitySupportsPickup(input)).toBe(false);
  });

  it("does not accept unsupported or future versions by numeric ordering", () => {
    const unsupported: readonly unknown[] = [
      -1, -0, 0, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7, 99, Number.MAX_SAFE_INTEGER,
      Number.NaN, Number.POSITIVE_INFINITY, "2", "3", undefined, null,
    ];
    for (const version of unsupported) {
      // Deliberately out-of-contract input exercises conservative version
      // classification, not malformed-record validation or a future schema.
      const input = { version } as CapabilityInput;
      expect(residentActivitySupportsRations(input), String(version)).toBe(false);
      expect(residentActivitySupportsMaterials(input), String(version)).toBe(false);
      expect(residentActivitySupportsInspection(input), String(version)).toBe(false);
      expect(residentActivitySupportsEnvironment(input), String(version)).toBe(false);
      expect(residentActivitySupportsPickup(input), String(version)).toBe(false);
    }
  });

  it("classifies a frozen minimal version input without mutating or validating its shape", () => {
    const input = Object.freeze({ version: RESIDENT_CIVIC_ACTIVITY_VERSION });
    expect(residentActivitySupportsRations(input)).toBe(true);
    expect(residentActivitySupportsMaterials(input)).toBe(true);
    expect(residentActivitySupportsEnvironment(input)).toBe(false);
    expect(input).toEqual({ version: RESIDENT_CIVIC_ACTIVITY_VERSION });
    expect(Object.isFrozen(input)).toBe(true);
    // Full canonical shape, identity, custody and world validation remain
    // separate obligations; the minimal input intentionally lacks those roots.
    expect(Object.keys(input)).toEqual(["version"]);
  });
});
