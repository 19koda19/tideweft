import { describe, expect, it } from "vitest";

import { createLiveRegionAnnouncementQueue } from "./createTideweftUI";

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
