import { describe, expect, it, vi } from "vitest";

import {
  TITLE_ATMOSPHERE_MAX_BACKING_PIXELS,
  TITLE_ATMOSPHERE_MAX_PARTICLES,
  bindTitleAtmosphere,
  sampleTitleCurl,
  titleBackingScale,
  titleOpeningBloom,
  titleParticleBudget,
} from "./titleAtmosphere";

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

class FakeWindow extends EventTarget {
  innerWidth = 844;
  innerHeight = 390;
  devicePixelRatio = 3;
}

class FakeMediaQuery extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }

  setMatches(matches: boolean): void {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
  };

  getContext(): CanvasRenderingContext2D {
    return this.context as unknown as CanvasRenderingContext2D;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeHost {
  readonly dataset: Record<string, string> = {};
}

function atmosphereHarness(reducedMotion = false) {
  const documentTarget = new FakeDocument();
  const windowTarget = new FakeWindow();
  const reducedMotionQuery = new FakeMediaQuery(reducedMotion);
  const canvas = new FakeCanvas();
  const host = new FakeHost();
  const playCrescendo = vi.fn();
  const frames = new Map<number, FrameRequestCallback>();
  let frameSequence = 0;
  let clock = 100;
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    frameSequence += 1;
    frames.set(frameSequence, callback);
    return frameSequence;
  });
  const cancelFrame = vi.fn((handle: number) => {
    frames.delete(handle);
  });
  const controller = bindTitleAtmosphere({
    canvas: canvas as unknown as HTMLCanvasElement,
    host: host as unknown as HTMLElement,
    playCrescendo,
    documentTarget: documentTarget as unknown as Document,
    windowTarget: windowTarget as unknown as Window,
    reducedMotionQuery: reducedMotionQuery as unknown as MediaQueryList,
    now: () => clock,
    requestFrame,
    cancelFrame,
  });
  return {
    controller,
    documentTarget,
    windowTarget,
    reducedMotionQuery,
    canvas,
    host,
    playCrescendo,
    requestFrame,
    cancelFrame,
    frames,
    advance(milliseconds: number) {
      clock += milliseconds;
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, callback] of pending) callback(clock);
    },
  };
}

describe("deterministic title tide field", () => {
  it("keeps curl, bloom, particle, and backing-store work deterministic and bounded", () => {
    expect(sampleTitleCurl(0.25, 0.75, 12, 44))
      .toEqual(sampleTitleCurl(0.25, 0.75, 12, 44));
    expect(sampleTitleCurl(0.26, 0.75, 12, 44))
      .not.toEqual(sampleTitleCurl(0.25, 0.75, 12, 44));
    expect(
      Object.values(sampleTitleCurl(Number.NaN, Number.POSITIVE_INFINITY, Number.NaN))
        .every(Number.isFinite),
    ).toBe(true);

    expect(titleParticleBudget(1, 1)).toBeGreaterThan(0);
    expect(titleParticleBudget(100_000, 100_000)).toBe(TITLE_ATMOSPHERE_MAX_PARTICLES);
    expect(titleParticleBudget(360, 800)).toBeLessThanOrEqual(TITLE_ATMOSPHERE_MAX_PARTICLES);

    const scale = titleBackingScale(7_680, 4_320, 4);
    expect(scale).toBeLessThan(1);
    expect(7_680 * 4_320 * scale * scale)
      .toBeLessThanOrEqual(TITLE_ATMOSPHERE_MAX_BACKING_PIXELS + 0.001);

    expect(titleOpeningBloom(0)).toBeGreaterThan(0);
    expect(titleOpeningBloom(700)).toBeGreaterThan(titleOpeningBloom(0));
    expect(titleOpeningBloom(20_000)).toBeCloseTo(0.78);
    expect(titleOpeningBloom(700, true)).toBe(0.72);
  });
});

describe("title atmosphere lifecycle", () => {
  it("opens once, ignores revision spam, pauses while obscured, and cleanly reopens", () => {
    const state = atmosphereHarness();
    expect(state.controller.snapshot()).toMatchObject({
      presented: false,
      running: false,
      openingOrdinal: 0,
      audioArmed: false,
    });

    state.controller.sync(true, true);
    expect(state.controller.snapshot()).toMatchObject({
      presented: true,
      unobscured: true,
      running: true,
      openingOrdinal: 1,
      audioArmed: true,
    });
    expect(state.controller.snapshot().particleCount)
      .toBeLessThanOrEqual(TITLE_ATMOSPHERE_MAX_PARTICLES);
    const requestsAfterOpen = state.requestFrame.mock.calls.length;

    state.controller.sync(true, true);
    state.controller.sync(true, true);
    expect(state.controller.snapshot().openingOrdinal).toBe(1);
    expect(state.requestFrame.mock.calls.length).toBe(requestsAfterOpen);
    state.advance(40);
    expect(state.canvas.context.stroke).toHaveBeenCalled();

    state.controller.sync(true, false);
    expect(state.controller.snapshot()).toMatchObject({
      presented: true,
      unobscured: false,
      running: false,
      openingOrdinal: 1,
      audioArmed: true,
    });
    state.controller.sync(true, true);
    expect(state.controller.snapshot().openingOrdinal).toBe(1);
    expect(state.controller.snapshot().running).toBe(true);

    state.controller.sync(false);
    expect(state.controller.snapshot()).toMatchObject({
      presented: false,
      running: false,
      audioArmed: false,
    });
    state.controller.sync(true, true);
    expect(state.controller.snapshot().openingOrdinal).toBe(2);
    expect(state.host.dataset.titleOpening).toBe("2");
  });

  it("waits for one lawful gesture per opening and never rearms on view refresh", () => {
    const state = atmosphereHarness();
    state.controller.sync(true, true);
    state.documentTarget.dispatchEvent(new Event("input"));
    expect(state.playCrescendo).not.toHaveBeenCalled();

    state.documentTarget.dispatchEvent(new Event("pointerdown"));
    state.documentTarget.dispatchEvent(new Event("pointerdown"));
    expect(state.playCrescendo).toHaveBeenCalledOnce();
    expect(state.playCrescendo).toHaveBeenLastCalledWith(1);
    expect(state.controller.snapshot().audioArmed).toBe(false);

    state.controller.sync(true, true);
    state.documentTarget.dispatchEvent(new Event("pointerdown"));
    expect(state.playCrescendo).toHaveBeenCalledOnce();

    state.controller.sync(false);
    state.controller.sync(true, true);
    state.documentTarget.dispatchEvent(new Event("pointerdown"));
    expect(state.playCrescendo).toHaveBeenCalledTimes(2);
    expect(state.playCrescendo).toHaveBeenLastCalledWith(2);
  });

  it("suspends for document hiding and reduced motion without consuming the audio arm", () => {
    const state = atmosphereHarness(true);
    state.controller.sync(true, true);
    expect(state.controller.snapshot()).toMatchObject({
      running: false,
      reducedMotion: true,
      audioArmed: true,
    });
    expect(state.requestFrame).not.toHaveBeenCalled();
    expect(state.canvas.context.fill).toHaveBeenCalled();

    state.documentTarget.visibilityState = "hidden";
    state.documentTarget.dispatchEvent(new Event("visibilitychange"));
    state.documentTarget.dispatchEvent(new Event("pointerdown"));
    expect(state.playCrescendo).not.toHaveBeenCalled();

    state.reducedMotionQuery.setMatches(false);
    expect(state.controller.snapshot().running).toBe(false);
    state.documentTarget.visibilityState = "visible";
    state.documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(state.controller.snapshot().running).toBe(true);
    state.documentTarget.dispatchEvent(new Event("pointerdown"));
    expect(state.playCrescendo).toHaveBeenCalledOnce();

    state.reducedMotionQuery.setMatches(true);
    expect(state.controller.snapshot().running).toBe(false);
  });

  it("caps high-DPI resize work and removes every listener/frame on destroy", () => {
    const state = atmosphereHarness();
    state.controller.sync(true, true);
    state.windowTarget.innerWidth = 7_680;
    state.windowTarget.innerHeight = 4_320;
    state.windowTarget.devicePixelRatio = 4;
    state.windowTarget.dispatchEvent(new Event("resize"));
    expect(state.canvas.width * state.canvas.height)
      .toBeLessThanOrEqual(TITLE_ATMOSPHERE_MAX_BACKING_PIXELS + 5_000);
    expect(state.canvas.style.width).toBe("7680px");
    expect(state.canvas.attributes.get("aria-hidden")).toBe("true");
    expect(state.canvas.attributes.get("role")).toBe("presentation");

    state.controller.destroy();
    expect(state.controller.snapshot()).toMatchObject({
      destroyed: true,
      running: false,
      audioArmed: false,
    });
    const resizeCalls = state.canvas.context.setTransform.mock.calls.length;
    state.windowTarget.dispatchEvent(new Event("resize"));
    state.documentTarget.dispatchEvent(new Event("pointerdown"));
    state.documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(state.canvas.context.setTransform).toHaveBeenCalledTimes(resizeCalls);
    expect(state.playCrescendo).not.toHaveBeenCalled();
    expect(state.host.dataset.titleAtmosphere).toBe("destroyed");
  });
});
