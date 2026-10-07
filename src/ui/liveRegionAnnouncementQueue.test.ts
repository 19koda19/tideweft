import { afterEach, describe, expect, it, vi } from "vitest";

import { bindModalLiveRegion, createLiveRegionAnnouncementQueue } from "./createTideweftUI";

class ManualTimers {
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();

  readonly schedule = (callback: () => void): number => {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  };

  readonly cancel = (id: number): void => {
    this.callbacks.delete(id);
  };

  pendingCount(): number {
    return this.callbacks.size;
  }

  runNext(): void {
    const id = [...this.callbacks.keys()].sort((left, right) => left - right)[0];
    if (id === undefined) throw new Error("No scheduled live-region callback");
    const callback = this.callbacks.get(id);
    this.callbacks.delete(id);
    callback?.();
  }
}

class RecordingLiveRegion {
  private copy = "";
  private live = "polite";
  readonly delivered: Array<{ readonly message: string; readonly live: string }> = [];

  setAttribute(name: string, value: string): void {
    if (name === "aria-live") this.live = value;
  }

  get textContent(): string {
    return this.copy;
  }

  set textContent(value: string | null) {
    this.copy = value ?? "";
    if (this.copy.length > 0) {
      this.delivered.push({ message: this.copy, live: this.live });
    }
  }
}

const harness = () => {
  const timers = new ManualTimers();
  const announcer = new RecordingLiveRegion();
  const queue = createLiveRegionAnnouncementQueue({
    announcer,
    schedule: timers.schedule,
    cancel: timers.cancel,
  });
  return { announcer, queue, timers };
};

describe("live-region announcement queue", () => {
  it("delivers a simultaneous situated expression and system announcement once each", () => {
    const { announcer, queue, timers } = harness();

    queue.announce("You: The pack!", true);
    queue.announce("Cargo fell into the east channel.");

    expect(queue.pendingCount()).toBe(2);
    expect(timers.pendingCount()).toBe(1);
    timers.runNext();
    expect(announcer.delivered).toEqual([{
      message: "You: The pack! Cargo fell into the east channel.",
      live: "assertive",
    }]);
    expect(timers.pendingCount()).toBe(1);

    timers.runNext();
    expect(queue.pendingCount()).toBe(0);
    expect(timers.pendingCount()).toBe(0);
  });

  it("bounds pending records and uses only one timer while preserving burst copy", () => {
    const { announcer, queue, timers } = harness();
    const messages = Array.from({ length: 40 }, (_, index) => `[[event-${index}]]`);

    for (const message of messages) {
      queue.announce(message);
      expect(queue.pendingCount()).toBeLessThanOrEqual(16);
      expect(timers.pendingCount()).toBe(1);
    }

    while (timers.pendingCount() > 0) timers.runNext();

    const deliveredCopy = announcer.delivered.map(({ message }) => message).join(" ");
    for (const message of messages) {
      expect(deliveredCopy.split(message)).toHaveLength(2);
    }
    expect(queue.pendingCount()).toBe(0);
  });

  it("cancels its sole timer and rejects later work during teardown", () => {
    const { announcer, queue, timers } = harness();
    queue.announce("You: Wait.");
    expect(timers.pendingCount()).toBe(1);

    queue.destroy();
    queue.destroy();
    queue.announce("This must not be delivered.");

    expect(queue.pendingCount()).toBe(0);
    expect(timers.pendingCount()).toBe(0);
    expect(announcer.delivered).toEqual([]);
  });
});

class ModalHost {
  open = false;
  nativeModal = false;
  readonly focusTarget = {};

  matches(): boolean { return this.nativeModal; }
  contains(node: unknown): boolean { return node === this || node === this.focusTarget; }
  append(node: MountedLiveRegion): void { node.parentElement = this; }
}

class MountedLiveRegion extends RecordingLiveRegion {
  parentElement: ModalHost;
  readonly ownerDocument: { activeElement: unknown } = { activeElement: null };

  constructor(home: ModalHost) { super(); this.parentElement = home; }
}

function modalHarness() {
  let callback: MutationCallback;
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal("MutationObserver", class {
    constructor(next: MutationCallback) { callback = next; }
    observe = observe;
    disconnect = disconnect;
  });
  const home = new ModalHost();
  const title = new ModalHost();
  const manual = new ModalHost();
  const patch = new ModalHost();
  const kit = new ModalHost();
  const announcer = new MountedLiveRegion(home);
  const relay = bindModalLiveRegion(
    announcer as unknown as HTMLElement,
    [title, manual, patch, kit] as unknown as HTMLDialogElement[],
  );
  const timers = new ManualTimers();
  const queue = createLiveRegionAnnouncementQueue({
    announcer, prepareAnnouncer: relay.sync, schedule: timers.schedule, cancel: timers.cancel,
  });
  const transition = (dialog: ModalHost, open: boolean, nativeModal = open): void => {
    const oldValue = dialog.open ? "" : null;
    dialog.open = open;
    dialog.nativeModal = nativeModal;
    callback([{ target: dialog, oldValue }] as unknown as MutationRecord[], {} as MutationObserver);
  };
  return { home, title, manual, patch, kit, announcer, relay, queue, timers, transition, observe, disconnect };
}

describe("modal live-region routing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("clears delivered copy before modal moves and never replays it on close or reopen", () => {
    const h = modalHarness();
    h.queue.announce("One lawful greeting.");
    h.timers.runNext();
    expect(h.announcer.delivered).toHaveLength(1);
    h.transition(h.manual, true);
    expect(h.announcer.parentElement).toBe(h.manual);
    expect(h.announcer.textContent).toBe("");
    h.transition(h.manual, false);
    expect(h.announcer.parentElement).toBe(h.home);
    h.transition(h.manual, true);
    expect(h.announcer.textContent).toBe("");
    h.timers.runNext();
    expect(h.announcer.delivered).toEqual([{ message: "One lawful greeting.", live: "polite" }]);
    expect(h.observe).toHaveBeenCalledTimes(4);
    expect(h.observe.mock.calls.every(([, options]) => options.attributeFilter.length === 1 && options.attributeFilter[0] === "open")).toBe(true);
  });

  it("reprimes a changed host before delivering the original pending batch once", () => {
    const h = modalHarness();
    h.queue.announce("Watch your footing.", true);
    h.queue.announce("Cargo landed nearby.");
    h.transition(h.manual, true);
    h.timers.runNext();
    expect(h.announcer.delivered).toEqual([]);
    expect(h.queue.pendingCount()).toBe(2);
    expect(h.timers.pendingCount()).toBe(1);
    h.transition(h.manual, false);
    // Delivery resolves even a synchronous modal change before its observer.
    h.kit.open = h.kit.nativeModal = true;
    h.timers.runNext();
    expect(h.announcer.parentElement).toBe(h.kit);
    expect(h.announcer.delivered).toEqual([]);
    h.timers.runNext();
    expect(h.announcer.delivered).toEqual([{
      message: "Watch your footing. Cargo landed nearby.", live: "assertive",
    }]);
    expect(h.queue.pendingCount()).toBe(0);
    h.timers.runNext();
    expect(h.timers.pendingCount()).toBe(0);
  });

  it("preserves pending follow-up through a modal close during the holding phase", () => {
    const h = modalHarness();
    h.transition(h.manual, true);
    h.queue.announce("First.");
    h.timers.runNext();
    h.queue.announce("Next.");
    h.transition(h.manual, false);
    expect(h.announcer.textContent).toBe("");
    h.timers.runNext();
    h.timers.runNext();
    expect(h.announcer.parentElement).toBe(h.home);
    expect(h.announcer.delivered.map(({ message }) => message)).toEqual(["First.", "Next."]);
  });

  it("uses native modality, focus and actual reopening order rather than document order", () => {
    const h = modalHarness();
    h.transition(h.title, true);
    h.transition(h.manual, true);
    expect(h.announcer.parentElement).toBe(h.manual);
    h.transition(h.kit, true, false);
    expect(h.announcer.parentElement).toBe(h.manual);
    h.transition(h.manual, false);
    h.transition(h.patch, true);
    expect(h.announcer.parentElement).toBe(h.patch);
    h.transition(h.patch, false);
    h.transition(h.manual, true);
    expect(h.announcer.parentElement).toBe(h.manual);
    h.announcer.ownerDocument.activeElement = h.title.focusTarget;
    h.relay.sync();
    expect(h.announcer.parentElement).toBe(h.title);
    h.announcer.ownerDocument.activeElement = null;
    h.transition(h.manual, false);
    h.transition(h.title, false);
    expect(h.announcer.parentElement).toBe(h.kit);
    h.transition(h.kit, false);
    expect(h.announcer.parentElement).toBe(h.home);
  });

  it("disconnects, restores the endpoint and cancels undelivered work during teardown", () => {
    const h = modalHarness();
    h.transition(h.kit, true);
    h.queue.announce("Pending.");
    h.relay.destroy();
    h.queue.destroy();
    h.relay.destroy();
    expect(h.disconnect).toHaveBeenCalledTimes(1);
    expect(h.announcer.parentElement).toBe(h.home);
    expect(h.announcer.textContent).toBe("");
    expect(h.queue.pendingCount()).toBe(0);
    expect(h.timers.pendingCount()).toBe(0);
    h.transition(h.manual, true);
    expect(h.announcer.parentElement).toBe(h.home);
    expect(h.announcer.delivered).toEqual([]);
  });
});
