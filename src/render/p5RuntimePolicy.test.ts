import { describe, expect, it } from "vitest";

import { configureP5RuntimePolicy } from "./p5RuntimePolicy";

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
});
