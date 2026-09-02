import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PATCH_NOTES_DIALOG_ID,
  PATCH_NOTES_MINIMUM_TARGET_CSS_PIXELS,
  PATCH_NOTES_SCROLL_REGION_ID,
  createPatchNotesDialog,
} from "./patchNotesDialog";

type Listener = (event: Event) => void;

class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  className = "";
  id = "";
  textContent = "";
  type = "";
  tabIndex = -1;
  open = false;
  isConnected = true;
  focusCount = 0;
  innerHtmlWrites = 0;
  private readonly listeners = new Map<string, Listener[]>();
  private readonly owner: FakeDocument;

  constructor(tag: string, owner: FakeDocument) {
    this.tagName = tag.toUpperCase();
    this.owner = owner;
  }

  set innerHTML(_value: string) {
    this.innerHtmlWrites += 1;
  }

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "open") this.open = true;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "open") this.open = false;
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return !event.defaultPrevented;
  }

  showModal(): void {
    if (this.open) throw new Error("already open");
    this.open = true;
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  }

  focus(): void {
    this.focusCount += 1;
    this.owner.activeElement = this;
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly created: FakeElement[] = [];

  createElement(tag: string): FakeElement {
    const node = new FakeElement(tag, this);
    this.created.push(node);
    return node;
  }
}

const descendants = (root: FakeElement): FakeElement[] => [
  root,
  ...root.children.flatMap(descendants),
];

let originalDocument: PropertyDescriptor | undefined;
let fakeDocument: FakeDocument;

beforeEach(() => {
  originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  fakeDocument = new FakeDocument();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument,
  });
});
afterEach(() => {
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

describe("Patch Notes dialog", () => {
  it("builds an accessible offline scroll region in canonical newest-first order", () => {
    const controller = createPatchNotesDialog();
    const dialog = controller.element as unknown as FakeElement;
    const nodes = descendants(dialog);
    const scroll = nodes.find((node) => node.id === PATCH_NOTES_SCROLL_REGION_ID);
    const releases = nodes.filter((node) => node.className === "patch-release");

    expect(dialog.id).toBe(PATCH_NOTES_DIALOG_ID);
    expect(dialog.getAttribute("aria-labelledby")).toBe("patch-notes-heading");
    expect(dialog.getAttribute("aria-describedby")).toBe("patch-notes-subtitle");
    expect(dialog.dataset.pausesWorld).toBe("false");
    expect(PATCH_NOTES_MINIMUM_TARGET_CSS_PIXELS).toBe(44);
    expect(scroll?.tabIndex).toBe(0);
    expect(scroll?.getAttribute("aria-label")).toContain("newest release first");
    expect(releases.map((release) => release.dataset.version)).toEqual([
      "0.3.3-alpha.6",
      "0.3.3-alpha.5",
      "0.3.3-alpha.4",
      "0.3.3-alpha.3",
      "0.3.3-alpha.2",
      "0.3.3-alpha.1",
      "0.3.3-alpha.0",
      "0.3.2-alpha.1",
      "0.3.2-alpha.0",
      "0.3.1-alpha.1",
      "0.3.1-alpha.0",
      "0.3.0-alpha.1",
    ]);
    expect(releases[0]?.dataset.latest).toBe("true");
    expect(nodes.filter((node) => node.className === "patch-category"))
      .toHaveLength(releases.length * 6);
    expect(nodes.some((node) => node.textContent.includes("A CHALLENGING HARD"))).toBe(true);
    expect(nodes.every((node) => node.innerHtmlWrites === 0)).toBe(true);
  });

  it("yields and restores the exact source modal and trigger focus on Escape", () => {
    let sourceModalOpen = true;
    const beforeOpen = vi.fn(() => { sourceModalOpen = false; });
    const afterClose = vi.fn(() => { sourceModalOpen = true; });
    const onOpenChange = vi.fn();
    const trigger = fakeDocument.createElement("button");
    const controller = createPatchNotesDialog({ beforeOpen, afterClose, onOpenChange });
    const dialog = controller.element as unknown as FakeElement;

    controller.open(trigger as unknown as HTMLElement, "quiet-hour");
    expect(sourceModalOpen).toBe(false);
    expect(controller.isOpen()).toBe(true);
    expect(controller.openSource()).toBe("quiet-hour");
    expect(dialog.dataset.openSource).toBe("quiet-hour");

    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(sourceModalOpen).toBe(true);
    expect(controller.isOpen()).toBe(false);
    expect(controller.openSource()).toBeNull();
    expect(beforeOpen).toHaveBeenCalledOnce();
    expect(afterClose).toHaveBeenCalledWith("quiet-hour");
    expect(onOpenChange.mock.calls.map(([open]) => open)).toEqual([true, false]);
    expect(trigger.focusCount).toBe(1);
  });

  it("keeps the original return source under rapid repeated opens", () => {
    const beforeOpen = vi.fn();
    const first = fakeDocument.createElement("button");
    const second = fakeDocument.createElement("button");
    const controller = createPatchNotesDialog({ beforeOpen });

    controller.open(first as unknown as HTMLElement, "title");
    controller.open(second as unknown as HTMLElement, "tutorial");
    expect(controller.openSource()).toBe("title");
    expect(beforeOpen).toHaveBeenCalledTimes(1);
    controller.close();
    expect(first.focusCount).toBe(1);
    expect(second.focusCount).toBe(0);
  });

  it("can close without restoring focus during teardown", () => {
    const trigger = fakeDocument.createElement("button");
    const controller = createPatchNotesDialog();
    controller.open(trigger as unknown as HTMLElement, "field");
    controller.close(false);
    expect(trigger.focusCount).toBe(0);
  });
});
