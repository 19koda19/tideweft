import { afterEach, describe, expect, it, vi } from "vitest";

import { createAcousticTextReservationReader } from "./acousticTextReservations";

type Box = { x: number; y: number; width: number; height: number };

function mockWindow() {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    const entries = listeners.get(type) ?? new Set();
    entries.add(listener);
    listeners.set(type, entries);
  });
  const removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    listeners.get(type)?.delete(listener);
  });
  return {
    addEventListener,
    removeEventListener,
    emit(type: string) {
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === "function") listener({ type } as Event);
        else listener.handleEvent({ type } as Event);
      }
    },
  };
}

function mockElement(box: Box, windowTarget = mockWindow()) {
  const getBoundingClientRect = vi.fn(() => box);
  const node = {
    hidden: false,
    getBoundingClientRect,
    ownerDocument: { defaultView: windowTarget },
  } as unknown as HTMLElement;
  return { node, box, getBoundingClientRect, windowTarget };
}

function mockResizeObserver() {
  const instances: MockResizeObserver[] = [];
  class MockResizeObserver {
    readonly targets = new Set<Element>();
    readonly observe = vi.fn((target: Element) => { this.targets.add(target); });
    readonly disconnect = vi.fn(() => { this.targets.clear(); });

    constructor(private readonly callback: ResizeObserverCallback) {
      instances.push(this);
    }

    emit(target: Element): void {
      if (!this.targets.has(target)) return;
      this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
  }
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  return instances;
}

function fixture() {
  const mount = mockElement({ x: 30, y: 40, width: 800, height: 600 });
  const container = mockElement({ x: 0, y: 0, width: 860, height: 700 }, mount.windowTarget);
  const targets = [
    mockElement({ x: 50, y: 90, width: 110, height: 20 }, mount.windowTarget),
    mockElement({ x: 80, y: 150, width: 130, height: 30 }, mount.windowTarget),
    mockElement({ x: 40, y: 550, width: 700, height: 40 }, mount.windowTarget),
  ];
  return { mount, container, targets };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("acoustic feedback reservations", () => {
  it("measures mount-relative boxes once and reuses them until manually invalidated", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { mount, container, targets } = fixture();
    const reader = createAcousticTextReservationReader(
      mount.node, targets.map(({ node }) => node), container.node,
    );
    const first = reader.get();
    expect(first).toEqual([
      { x: 20, y: 50, width: 110, height: 20 },
      { x: 50, y: 110, width: 130, height: 30 },
      { x: 10, y: 510, width: 700, height: 40 },
    ]);
    for (let index = 0; index < 8; index += 1) expect(reader.get()).toBe(first);
    expect(mount.getBoundingClientRect).toHaveBeenCalledTimes(1);
    for (const target of targets) expect(target.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(container.getBoundingClientRect).not.toHaveBeenCalled();

    mount.box.x = 35;
    targets[0]!.box.y = 100;
    expect(reader.get()).toBe(first);
    reader.invalidate();
    const refreshed = reader.get();
    expect(refreshed).not.toBe(first);
    expect(refreshed[0]).toEqual({ x: 15, y: 60, width: 110, height: 20 });
    expect(reader.get()).toBe(refreshed);
    expect(mount.getBoundingClientRect).toHaveBeenCalledTimes(2);
    for (const target of targets) expect(target.getBoundingClientRect).toHaveBeenCalledTimes(2);
    reader.destroy();
  });

  it("ignores hidden and zero-area feedback without measuring hidden targets", () => {
    const { mount, container, targets } = fixture();
    targets[0]!.node.hidden = true;
    targets[1]!.box.width = 0;
    targets[2]!.box.height = 0;
    const reader = createAcousticTextReservationReader(
      mount.node, targets.map(({ node }) => node), container.node,
    );
    expect(reader.get()).toEqual([]);
    expect(targets[0]!.getBoundingClientRect).not.toHaveBeenCalled();
    expect(targets[1]!.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(targets[2]!.getBoundingClientRect).toHaveBeenCalledTimes(1);
    reader.destroy();
  });

  it("observes the fixed targets, feedback container and mount and invalidates on their resize", () => {
    const instances = mockResizeObserver();
    const { mount, container, targets } = fixture();
    const reader = createAcousticTextReservationReader(
      mount.node, targets.map(({ node }) => node), container.node,
    );
    expect(instances).toHaveLength(1);
    const observer = instances[0]!;
    const observed = [mount.node, container.node, ...targets.map(({ node }) => node)];
    expect(observer.observe.mock.calls.map(([target]) => target)).toEqual(observed);
    reader.get();
    for (const [index, target] of observed.entries()) {
      const previous = reader.get();
      observer.emit(target);
      expect(reader.get()).not.toBe(previous);
      expect(mount.getBoundingClientRect).toHaveBeenCalledTimes(index + 2);
    }
    const beforeWindowResize = reader.get();
    mount.windowTarget.emit("resize");
    expect(reader.get()).not.toBe(beforeWindowResize);
    expect(mount.getBoundingClientRect).toHaveBeenCalledTimes(7);
    expect(mount.windowTarget.addEventListener).toHaveBeenCalledWith("resize", reader.invalidate);
    reader.destroy();
  });

  it("supports publication invalidation and window resize when ResizeObserver is absent", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { mount, container, targets } = fixture();
    const reader = createAcousticTextReservationReader(mount.node, [targets[0]!.node], container.node);
    const first = reader.get();
    targets[0]!.node.hidden = true;
    expect(reader.get()).toBe(first);
    reader.invalidate();
    expect(reader.get()).toEqual([]);
    targets[0]!.node.hidden = false;
    targets[0]!.box.width = 150;
    reader.invalidate();
    const published = reader.get();
    expect(published[0]?.width).toBe(150);
    expect(reader.get()).toBe(published);
    mount.box.y = 50;
    mount.windowTarget.emit("resize");
    expect(reader.get()[0]?.y).toBe(40);
    expect(mount.getBoundingClientRect).toHaveBeenCalledTimes(4);
    expect(targets[0]!.getBoundingClientRect).toHaveBeenCalledTimes(3);
    reader.destroy();
  });

  it("returns detached frozen boxes without changing measured input objects", () => {
    const { mount, container, targets } = fixture();
    const original = targets.map(({ box }) => ({ ...box }));
    const reader = createAcousticTextReservationReader(
      mount.node, targets.map(({ node }) => node), container.node,
    );
    const boxes = reader.get();
    expect(Object.isFrozen(reader)).toBe(true);
    expect(Object.isFrozen(boxes)).toBe(true);
    for (const box of boxes) expect(Object.isFrozen(box)).toBe(true);
    expect(targets.map(({ box }) => box)).toEqual(original);
    targets[0]!.box.width = 999;
    expect(boxes[0]?.width).toBe(110);
    expect(() => { (boxes[0] as Box).width = 1; }).toThrow(TypeError);
    expect(() => { (boxes as Box[]).push({ x: 0, y: 0, width: 1, height: 1 }); }).toThrow(TypeError);
    expect(targets[0]!.box.width).toBe(999);
    reader.destroy();
  });

  it("disconnects observers and removes its resize listener and stays empty after destruction", () => {
    const instances = mockResizeObserver();
    const { mount, container, targets } = fixture();
    const reader = createAcousticTextReservationReader(mount.node, [targets[0]!.node], container.node);
    expect(reader.get()).toHaveLength(1);
    reader.destroy();
    expect(instances[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(mount.windowTarget.removeEventListener).toHaveBeenCalledWith("resize", reader.invalidate);
    reader.invalidate();
    mount.windowTarget.emit("resize");
    instances[0]!.emit(targets[0]!.node);
    const empty = reader.get();
    expect(empty).toEqual([]);
    expect(Object.isFrozen(empty)).toBe(true);
    expect(reader.get()).toBe(empty);
    expect(mount.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(targets[0]!.getBoundingClientRect).toHaveBeenCalledTimes(1);
  });

  it("has no measurements or observers without an optional acoustic mount", () => {
    const instances = mockResizeObserver();
    const { container, targets } = fixture();
    const reader = createAcousticTextReservationReader(undefined, [targets[0]!.node], container.node);
    expect(reader.get()).toEqual([]);
    reader.invalidate();
    expect(reader.get()).toEqual([]);
    expect(instances).toHaveLength(0);
    expect(targets[0]!.getBoundingClientRect).not.toHaveBeenCalled();
    expect(container.windowTarget.addEventListener).not.toHaveBeenCalled();
    reader.destroy();
  });

  it("rejects more than three targets before creating measurement subscriptions", () => {
    const instances = mockResizeObserver();
    const { mount, container, targets } = fixture();
    expect(() => createAcousticTextReservationReader(
      mount.node, [...targets.map(({ node }) => node), container.node], container.node,
    )).toThrow(/fixed budget/u);
    expect(instances).toHaveLength(0);
    expect(mount.windowTarget.addEventListener).not.toHaveBeenCalled();
    expect(mount.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it("captures its bounded target list so caller mutation cannot replace or grow it", () => {
    const instances = mockResizeObserver();
    const { mount, container, targets } = fixture();
    const supplied = targets.map(({ node }) => node);
    const extra = mockElement({ x: 90, y: 95, width: 50, height: 10 }, mount.windowTarget);
    const reader = createAcousticTextReservationReader(mount.node, supplied, container.node);
    supplied[0] = extra.node;
    supplied.push(container.node, extra.node);
    const boxes = reader.get();
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toEqual({ x: 20, y: 50, width: 110, height: 20 });
    expect(instances[0]!.targets.has(extra.node)).toBe(false);
    expect(extra.getBoundingClientRect).not.toHaveBeenCalled();
    expect(container.getBoundingClientRect).not.toHaveBeenCalled();
    reader.invalidate();
    expect(reader.get()).toHaveLength(3);
    reader.destroy();
  });
});
