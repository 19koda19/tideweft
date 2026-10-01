import { describe, expect, it } from "vitest";

import { configureP5RuntimePolicy, preserveP5RuntimePolicy } from "./p5RuntimePolicy";

describe("p5 runtime policy", () => {
  it("disables diagnostic friendly-error validation in production", () => {
    const target = { disableFriendlyErrors: false };

    configureP5RuntimePolicy(target, true);

    expect(target.disableFriendlyErrors).toBe(true);
  });

  it("leaves friendly errors available during development", () => {
    const target = { disableFriendlyErrors: false };

    configureP5RuntimePolicy(target, false);

    expect(target.disableFriendlyErrors).toBe(false);
  });

  it("does not re-enable a host policy that was already disabled", () => {
    const target = { disableFriendlyErrors: true };

    configureP5RuntimePolicy(target, false);

    expect(target.disableFriendlyErrors).toBe(true);
  });

  it.each([false, true])("preserves policy %s when a shader operation changes it", (disabled) => {
    const target = { disableFriendlyErrors: disabled };
    const shader = {};

    expect(preserveP5RuntimePolicy(target, () => {
      target.disableFriendlyErrors = !disabled;
      return shader;
    })).toBe(shader);
    expect(target.disableFriendlyErrors).toBe(disabled);
  });

  it("restores policy while forwarding the original shader failure", () => {
    const target = { disableFriendlyErrors: true };
    const failure = new Error("shader modification failed");

    expect(() => preserveP5RuntimePolicy(target, () => {
      target.disableFriendlyErrors = false;
      throw failure;
    })).toThrow(failure);
    expect(target.disableFriendlyErrors).toBe(true);
  });
});
