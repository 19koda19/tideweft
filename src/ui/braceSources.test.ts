import { describe, expect, it, vi } from "vitest";

import { createBraceSourceController } from "./braceSources";

describe("brace input source aggregation", () => {
  it("does not let a desktop release cancel a held touch brace", () => {
    const onBraceChange = vi.fn();
    const controller = createBraceSourceController(onBraceChange);

    controller.set("touch", true);
    controller.set("desktop-global", true);
    controller.set("desktop-global", false);
    expect(controller.active()).toBe(true);
    expect(onBraceChange.mock.calls).toEqual([[true]]);

    controller.set("touch", false);
    expect(controller.active()).toBe(false);
    expect(onBraceChange.mock.calls).toEqual([[true], [false]]);
  });

  it("does not let a touch release cancel a held desktop brace", () => {
    const onBraceChange = vi.fn();
    const controller = createBraceSourceController(onBraceChange);

    controller.set("desktop-global", true);
    controller.set("touch", true);
    controller.set("touch", false);
    expect(controller.active()).toBe(true);
    expect(onBraceChange.mock.calls).toEqual([[true]]);

    controller.set("desktop-global", false);
    expect(onBraceChange.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps renderer focus hand-offs and repeated writes idempotent", () => {
    const onBraceChange = vi.fn();
    const controller = createBraceSourceController(onBraceChange);

    controller.set("desktop-global", true);
    controller.set("desktop-global", true);
    controller.set("renderer", true);
    controller.set("desktop-global", false);
    controller.set("desktop-global", false);
    expect(controller.active()).toBe(true);
    expect(onBraceChange.mock.calls).toEqual([[true]]);

    controller.set("renderer", false);
    expect(onBraceChange.mock.calls).toEqual([[true], [false]]);
  });

  it("releases once on destroy and ignores late input", () => {
    const onBraceChange = vi.fn();
    const controller = createBraceSourceController(onBraceChange);

    controller.set("touch", true);
    controller.set("renderer", true);
    controller.destroy();
    controller.destroy();
    controller.set("desktop-global", true);

    expect(controller.active()).toBe(false);
    expect(onBraceChange.mock.calls).toEqual([[true], [false]]);
  });

  it("destroys cleanly when no source is held", () => {
    const onBraceChange = vi.fn();
    const controller = createBraceSourceController(onBraceChange);
    controller.destroy();
    expect(onBraceChange).not.toHaveBeenCalled();
  });
});
