import {
  KIT_REPAIR_CONDITION_GAIN,
  type KitGearUIView,
  type KitRecipeUIView,
  type KitStackUIView,
  type KitTabId,
  type KitUIView,
  type TideweftUICommand,
} from "./types";

export const KIT_DIALOG_ID = "tideweft-kit";
export const KIT_DIALOG_PANEL_ID = "tideweft-kit-panel";
export const KIT_DIALOG_SCROLL_REGION_ID = "tideweft-kit-scroll-region";
export const KIT_MINIMUM_TARGET_CSS_PIXELS = 44;

export const KIT_TABS = [
  { id: "pack", label: "PACK", description: "Carried cargo, finds, components, and durable gear" },
  { id: "make", label: "MAKE", description: "Recipes with exact ingredients and results" },
  { id: "mend", label: "MEND", description: "Repair or dismantle durable field gear" },
] as const satisfies readonly {
  readonly id: KitTabId;
  readonly label: string;
  readonly description: string;
}[];

export interface KitDialogOptions {
  readonly dispatch: (command: TideweftUICommand) => void;
  /** Mirrors native Escape/close state back to every external KIT trigger. */
  readonly onOpenChange?: (open: boolean) => void;
}

export interface KitDialogController {
  readonly element: HTMLDialogElement;
  readonly update: (view?: KitUIView) => void;
  readonly open: (tab?: KitTabId, trigger?: HTMLElement | null) => void;
  readonly close: (restoreFocus?: boolean) => void;
  readonly toggle: (tab?: KitTabId, trigger?: HTMLElement | null) => void;
  readonly setTab: (tab: KitTabId, focus?: boolean) => void;
  readonly activeTab: () => KitTabId;
  readonly isOpen: () => boolean;
  readonly destroy: () => void;
}

interface KitElements {
  readonly dialog: HTMLDialogElement;
  readonly close: HTMLButtonElement;
  readonly loadProgress: HTMLProgressElement;
  readonly loadValue: HTMLElement;
  readonly transportValue: HTMLElement;
  readonly fieldValue: HTMLElement;
  readonly location: HTMLElement;
  readonly hint: HTMLElement;
  readonly tabs: Readonly<Record<KitTabId, HTMLButtonElement>>;
  readonly panel: HTMLElement;
  readonly scroll: HTMLElement;
}

interface KitFocusToken {
  readonly action: string;
  readonly recipeId: string;
  readonly gearId: string;
}

type KitTabArrowKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (className: string, text: string, label?: string): HTMLButtonElement => {
  const node = element("button", className, text);
  node.type = "button";
  if (label) node.setAttribute("aria-label", label);
  return node;
};

const canonicalMilli = (value: number): number =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

const clampUnit = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** Exact three-decimal rendering for integer thousandths of one load unit. */
export function formatKitMilliLoad(value: number): string {
  const milli = canonicalMilli(value);
  const whole = Math.floor(milli / 1_000);
  const fraction = String(milli % 1_000).padStart(3, "0");
  return `${whole}.${fraction} load`;
}

/** Deterministic keyboard movement for the native tablist. */
export function nextKitTab(current: KitTabId, key: KitTabArrowKey): KitTabId {
  const index = KIT_TABS.findIndex((tab) => tab.id === current);
  if (key === "Home") return KIT_TABS[0].id;
  if (key === "End") return KIT_TABS[KIT_TABS.length - 1]!.id;
  const delta = key === "ArrowLeft" ? -1 : 1;
  return KIT_TABS[(index + delta + KIT_TABS.length) % KIT_TABS.length]!.id;
}

/** Only visible/actionable inventory state participates in structural refresh. */
export function kitViewSignature(view: KitUIView | undefined): string {
  if (!view) return "kit-unavailable";
  return JSON.stringify([
    view.revision,
    view.combinedLoadMilli,
    view.capacityMilli,
    view.transportLoadMilli,
    view.locationLabel ?? "",
    view.hint ?? "",
    view.transportRows.map((row) => [
      row.id,
      row.kind,
      row.label,
      row.detail,
      row.loadMilli,
      row.condition ?? null,
    ]),
    view.stackRows.map((row) => [
      row.id,
      row.tier,
      row.label,
      row.quantity,
      row.unitLoadMilli,
      row.totalLoadMilli,
      row.location,
      row.locationLabel ?? "",
    ]),
    view.gearRows.map((row) => [
      row.id,
      row.kind,
      row.label,
      row.detail,
      row.location,
      row.locationLabel,
      row.loadMilli,
      row.condition,
      row.conditionLabel,
      row.repairCostLabel,
      row.salvageLabel,
      row.canRepair ? 1 : 0,
      row.repairDisabledReason ?? "",
      row.canDismantle ? 1 : 0,
      row.dismantleDisabledReason ?? "",
    ]),
    view.recipes.map((recipe) => [
      recipe.id,
      recipe.label,
      recipe.resultLabel,
      recipe.resultDetail,
      recipe.resultLoadMilli,
      recipe.ingredientCopy,
      recipe.canCraft ? 1 : 0,
      recipe.disabledReason ?? "",
      recipe.ingredients.map((ingredient) => [
        ingredient.id,
        ingredient.label,
        ingredient.required,
        ingredient.available,
        ingredient.sufficient ? 1 : 0,
      ]),
    ]),
  ]);
}

function makeShell(): KitElements {
  const dialog = element("dialog", "kit-dialog estuary-dialog");
  dialog.id = KIT_DIALOG_ID;
  dialog.setAttribute("aria-labelledby", "kit-dialog-heading");
  dialog.setAttribute("aria-describedby", "kit-dialog-subtitle");
  dialog.dataset.pausesWorld = "false";

  const content = element("div", "kit-dialog__content");
  const header = element("header", "kit-dialog__header");
  const headingCopy = element("div", "kit-dialog__heading-copy");
  headingCopy.append(
    element("p", "kit-dialog__eyebrow", "FIELD KIT · WORLD CONTINUES"),
  );
  const heading = element("h2", "kit-dialog__title", "KIT");
  heading.id = "kit-dialog-heading";
  const subtitle = element(
    "p",
    "kit-dialog__subtitle",
    "Carry finds, make adaptations, and mend the same durable things without stopping the tide.",
  );
  subtitle.id = "kit-dialog-subtitle";
  headingCopy.append(heading, subtitle);
  const close = button("kit-dialog__close", "×", "Close KIT and return to play");
  close.dataset.kitAction = "close";
  header.append(headingCopy, close);

  const load = element("section", "kit-load");
  load.setAttribute("aria-label", "Exact combined pack load");
  const loadHeader = element("div", "kit-load__header");
  loadHeader.append(element("strong", "kit-load__label", "COMBINED LOAD"));
  const loadValue = element("span", "kit-load__value", "0.000 / 16.000 load");
  loadHeader.append(loadValue);
  const loadProgress = element("progress", "kit-load__progress");
  loadProgress.max = 1;
  loadProgress.value = 0;
  loadProgress.setAttribute("aria-label", "Combined pack load");
  const split = element("dl", "kit-load__split");
  const makeSplit = (label: string): [HTMLElement, HTMLElement] => {
    const pair = element("div", "kit-load__pair");
    pair.append(element("dt", "kit-load__term", label));
    const value = element("dd", "kit-load__number", "0.000 load");
    pair.append(value);
    return [pair, value];
  };
  const [transportPair, transportValue] = makeSplit("Transport");
  const [fieldPair, fieldValue] = makeSplit("Finds + gear");
  split.append(transportPair, fieldPair);
  const location = element("p", "kit-load__location", "Between harbors");
  const hint = element(
    "p",
    "kit-load__hint",
    "KIT is available anywhere. This build uses PACK; harbor lockers are staged.",
  );
  load.append(loadHeader, loadProgress, split, location, hint);

  const tablist = element("div", "kit-tabs");
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "KIT sections");
  const tabs = {} as Record<KitTabId, HTMLButtonElement>;
  for (const tab of KIT_TABS) {
    const tabButton = button(
      "kit-tab",
      tab.label,
      `${tab.label}: ${tab.description}`,
    );
    tabButton.id = `kit-tab-${tab.id}`;
    tabButton.dataset.kitTab = tab.id;
    tabButton.setAttribute("role", "tab");
    tabButton.setAttribute("aria-controls", KIT_DIALOG_PANEL_ID);
    tabButton.setAttribute("aria-selected", tab.id === "pack" ? "true" : "false");
    tabButton.tabIndex = tab.id === "pack" ? 0 : -1;
    tabs[tab.id] = tabButton;
    tablist.append(tabButton);
  }

  const panel = element("section", "kit-panel");
  panel.id = KIT_DIALOG_PANEL_ID;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", tabs.pack.id);
  const scroll = element("div", "kit-panel__scroll");
  scroll.id = KIT_DIALOG_SCROLL_REGION_ID;
  scroll.tabIndex = 0;
  scroll.setAttribute("aria-label", "PACK inventory contents; scroll for more");
  panel.append(scroll);

  content.append(header, load, tablist, panel);
  dialog.append(content);
  return {
    dialog,
    close,
    loadProgress,
    loadValue,
    transportValue,
    fieldValue,
    location,
    hint,
    tabs,
    panel,
    scroll,
  };
}

function emptyState(title: string, copy: string): HTMLElement {
  const empty = element("div", "kit-empty");
  empty.append(
    element("strong", "kit-empty__title", title),
    element("p", "kit-empty__copy", copy),
  );
  return empty;
}

function section(title: string, detail?: string): [HTMLElement, HTMLElement] {
  const wrapper = element("section", "kit-section");
  const heading = element("header", "kit-section__header");
  heading.append(element("h3", "kit-section__title", title));
  if (detail) heading.append(element("span", "kit-section__detail", detail));
  const body = element("div", "kit-section__body");
  wrapper.append(heading, body);
  return [wrapper, body];
}

function renderTransport(view: KitUIView, target: HTMLElement): void {
  const [wrapper, body] = section("Transport", formatKitMilliLoad(view.transportLoadMilli));
  if (view.transportRows.length === 0) {
    body.append(emptyState("No entrusted load", "Promise cargo and signed reports appear here."));
  }
  for (const row of view.transportRows) {
    const item = element("article", "kit-row kit-row--transport");
    item.dataset.kind = row.kind;
    const copy = element("div", "kit-row__copy");
    copy.append(
      element("strong", "kit-row__title", row.label),
      element("span", "kit-row__detail", row.detail),
    );
    const meta = element("div", "kit-row__meta");
    meta.append(element("span", "kit-row__load", formatKitMilliLoad(row.loadMilli)));
    if (row.condition !== undefined) {
      const condition = element("progress", "kit-condition");
      condition.max = 1;
      condition.value = clampUnit(row.condition);
      condition.setAttribute(
        "aria-label",
        `${row.label} condition ${Math.round(clampUnit(row.condition) * 100)} percent`,
      );
      meta.append(condition);
    }
    item.append(copy, meta);
    body.append(item);
  }
  target.append(wrapper);
}

function stackRow(row: KitStackUIView): HTMLElement {
  const item = element("article", "kit-row kit-row--stack");
  item.dataset.tier = row.tier;
  item.dataset.location = row.location;
  const copy = element("div", "kit-row__copy");
  copy.append(
    element("strong", "kit-row__title", `${row.quantity} × ${row.label}`),
    element(
      "span",
      "kit-row__detail",
      `${row.tier === "raw" ? "FIELD FIND" : "PREPARED COMPONENT"} · ${row.locationLabel ?? row.location.toLocaleUpperCase()}`,
    ),
  );
  const meta = element("div", "kit-row__meta");
  meta.append(
    element("span", "kit-row__load", formatKitMilliLoad(row.totalLoadMilli)),
    element("span", "kit-row__unit", `${formatKitMilliLoad(row.unitLoadMilli)} each`),
  );
  item.append(copy, meta);
  return item;
}

function gearSummary(row: KitGearUIView): HTMLElement {
  const item = element("article", "kit-row kit-row--gear");
  item.dataset.condition = row.condition <= 0
    ? "broken"
    : row.condition <= 0.35
      ? "frail"
      : row.condition <= 0.75
        ? "worn"
        : "sound";
  item.dataset.location = row.location;
  const copy = element("div", "kit-row__copy");
  copy.append(
    element("strong", "kit-row__title", row.label),
    element("span", "kit-row__detail", row.detail),
    element("span", "kit-row__location", row.locationLabel),
  );
  const meta = element("div", "kit-row__meta");
  meta.append(
    element("span", "kit-row__condition-label", row.conditionLabel),
    element("span", "kit-row__load", formatKitMilliLoad(row.loadMilli)),
  );
  const condition = element("progress", "kit-condition");
  condition.max = 1;
  condition.value = clampUnit(row.condition);
  condition.setAttribute(
    "aria-label",
    `${row.label}, ${row.conditionLabel}, ${Math.round(clampUnit(row.condition) * 100)} percent condition`,
  );
  meta.append(condition);
  item.append(copy, meta);
  return item;
}

function renderPack(view: KitUIView, target: HTMLElement): void {
  renderTransport(view, target);
  const packStacks = view.stackRows.filter((row) => row.location === "pack");
  const lockerStacks = view.stackRows.filter((row) => row.location === "locker");
  const [finds, findsBody] = section("Finds + components", `${packStacks.length} carried stacks`);
  if (packStacks.length === 0) {
    findsBody.append(emptyState(
      "The field pocket is empty",
      "On desktop, stand over a discovered resource and press E. On touch, tap it to route and gather on arrival.",
    ));
  }
  for (const row of packStacks) findsBody.append(stackRow(row));
  target.append(finds);

  const [gear, gearBody] = section("Durable gear", `${view.gearRows.length} known items`);
  if (view.gearRows.length === 0) {
    gearBody.append(emptyState("No crafted adaptations", "MAKE shows every recipe and its exact blocker."));
  }
  for (const row of view.gearRows) gearBody.append(gearSummary(row));
  target.append(gear);

  if (lockerStacks.length > 0) {
    const [locker, lockerBody] = section("Harbor locker", "LOCAL · NO REMOTE WITHDRAWAL");
    for (const row of lockerStacks) lockerBody.append(stackRow(row));
    target.append(locker);
  }
}

function ingredientList(recipe: KitRecipeUIView): HTMLElement {
  const list = element("ul", "kit-ingredients");
  list.setAttribute("aria-label", `Ingredients for ${recipe.label}`);
  for (const ingredient of recipe.ingredients) {
    const item = element("li", "kit-ingredient");
    item.dataset.sufficient = ingredient.sufficient ? "true" : "false";
    item.append(
      element("span", "kit-ingredient__label", ingredient.label),
      element(
        "span",
        "kit-ingredient__count",
        `${ingredient.available} / ${ingredient.required}`,
      ),
    );
    list.append(item);
  }
  return list;
}

function renderMake(
  view: KitUIView,
  target: HTMLElement,
  dispatch: KitDialogOptions["dispatch"],
): void {
  const [wrapper, body] = section("Make", "ONE RECIPE · ONE ATOMIC RESULT");
  if (view.recipes.length === 0) {
    body.append(emptyState("No recipes projected", "The recipe catalog is still being fitted to this save."));
  }
  for (const recipe of view.recipes) {
    const item = element("article", "kit-recipe");
    item.dataset.recipeId = recipe.id;
    item.dataset.ready = recipe.canCraft ? "true" : "false";
    const copy = element("div", "kit-recipe__copy");
    copy.append(
      element("strong", "kit-recipe__title", recipe.label),
      element("span", "kit-recipe__ingredients-copy", recipe.ingredientCopy),
    );
    const result = element("div", "kit-recipe__result");
    result.append(
      element("span", "kit-recipe__arrow", "→"),
      element("strong", "kit-recipe__result-label", recipe.resultLabel),
      element("span", "kit-recipe__result-detail", recipe.resultDetail),
      element("span", "kit-recipe__load", formatKitMilliLoad(recipe.resultLoadMilli)),
    );
    const action = button(
      "kit-action kit-action--make",
      `MAKE ${recipe.resultLabel.toLocaleUpperCase()}`,
      `Make ${recipe.resultLabel}. ${recipe.ingredientCopy}. Result ${formatKitMilliLoad(recipe.resultLoadMilli)}.`,
    );
    action.dataset.kitAction = "craft";
    action.dataset.recipeId = recipe.id;
    action.disabled = !recipe.canCraft;
    if (!recipe.canCraft) action.title = recipe.disabledReason ?? "Recipe is unavailable.";
    action.addEventListener("click", () => {
      dispatch({ type: "kit", action: "craft", recipeId: recipe.id });
    });
    item.append(copy, ingredientList(recipe), result);
    if (!recipe.canCraft) {
      item.append(element(
        "p",
        "kit-row__reason",
        recipe.disabledReason ?? "Recipe is unavailable for an unexplained reason.",
      ));
    }
    item.append(action);
    body.append(item);
  }
  target.append(wrapper);
}

function gearAction(
  row: KitGearUIView,
  dispatch: KitDialogOptions["dispatch"],
): HTMLElement {
  const item = gearSummary(row);
  item.classList.add("kit-mend-row");
  const repairCopy = element("div", "kit-mend-row__quote");
  repairCopy.append(
    element("span", "kit-mend-row__cost", `MEND · ${row.repairCostLabel}`),
    element("span", "kit-mend-row__salvage", `DISMANTLE · ${row.salvageLabel}`),
  );
  const actions = element("div", "kit-mend-row__actions");
  const repair = button(
    "kit-action kit-action--repair",
    "MEND +25%",
    `Mend ${row.label} by up to 25 percent. ${row.repairCostLabel}.`,
  );
  repair.dataset.kitAction = "repair";
  repair.dataset.gearId = row.id;
  repair.disabled = !row.canRepair;
  if (!row.canRepair) repair.title = row.repairDisabledReason ?? "This item cannot be mended.";
  repair.addEventListener("click", () => {
    dispatch({
      type: "kit",
      action: "repair",
      gearId: row.id,
      conditionGain: KIT_REPAIR_CONDITION_GAIN,
    });
  });
  const dismantle = button(
    "kit-action kit-action--dismantle",
    "DISMANTLE",
    `Dismantle ${row.label}. Recover ${row.salvageLabel}. This is lossy.`,
  );
  dismantle.dataset.kitAction = "dismantle";
  dismantle.dataset.gearId = row.id;
  dismantle.disabled = !row.canDismantle;
  if (!row.canDismantle) {
    dismantle.title = row.dismantleDisabledReason ?? "This item cannot be dismantled.";
  }
  dismantle.addEventListener("click", () => {
    dispatch({ type: "kit", action: "dismantle", gearId: row.id });
  });
  actions.append(repair, dismantle);
  item.append(repairCopy);
  if (!row.canRepair && row.repairDisabledReason) {
    item.append(element("p", "kit-row__reason", row.repairDisabledReason));
  }
  if (!row.canDismantle && row.dismantleDisabledReason) {
    item.append(element("p", "kit-row__reason", row.dismantleDisabledReason));
  }
  item.append(actions);
  return item;
}

function renderMend(
  view: KitUIView,
  target: HTMLElement,
  dispatch: KitDialogOptions["dispatch"],
): void {
  const [wrapper, body] = section("Mend + dismantle", `MEND STEP · ${KIT_REPAIR_CONDITION_GAIN / 10_000}%`);
  if (view.gearRows.length === 0) {
    body.append(emptyState("Nothing durable to mend", "Crafted adaptations retain their stable identity and condition here."));
  }
  for (const row of view.gearRows) body.append(gearAction(row, dispatch));
  target.append(wrapper);
}

/**
 * Creates one non-pausing modal inventory surface. Opening/closing it never
 * dispatches gameplay state; only explicit MAKE, MEND, and DISMANTLE actions do.
 */
export function createKitDialog(options: KitDialogOptions): KitDialogController {
  const refs = makeShell();
  let view: KitUIView | undefined;
  let tab: KitTabId = "pack";
  let signature = "";
  let pointerActive = false;
  let renderPending = false;
  let returnFocus: HTMLElement | null = null;
  let destroyed = false;

  const capturePanelFocus = (): KitFocusToken | "scroll" | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !refs.scroll.contains(active)) return null;
    if (active === refs.scroll) return "scroll";
    return {
      action: active.dataset.kitAction ?? "",
      recipeId: active.dataset.recipeId ?? "",
      gearId: active.dataset.gearId ?? "",
    };
  };

  const restorePanelFocus = (token: KitFocusToken | "scroll" | null): void => {
    if (!token) return;
    if (token === "scroll") {
      refs.scroll.focus({ preventScroll: true });
      return;
    }
    const target = [...refs.scroll.querySelectorAll<HTMLElement>("[data-kit-action]")]
      .find((candidate) =>
        (candidate.dataset.kitAction ?? "") === token.action
        && (candidate.dataset.recipeId ?? "") === token.recipeId
        && (candidate.dataset.gearId ?? "") === token.gearId);
    if (target && (!(target instanceof HTMLButtonElement) || !target.disabled)) {
      target.focus({ preventScroll: true });
      return;
    }
    refs.scroll.focus({ preventScroll: true });
  };

  const renderLoad = (): void => {
    const combined = canonicalMilli(view?.combinedLoadMilli ?? 0);
    const capacity = canonicalMilli(view?.capacityMilli ?? 16_000);
    const transport = canonicalMilli(view?.transportLoadMilli ?? 0);
    const field = Math.max(0, combined - transport);
    const ratio = capacity === 0 ? (combined > 0 ? 1 : 0) : combined / capacity;
    refs.loadProgress.value = clampUnit(ratio);
    refs.loadProgress.setAttribute(
      "aria-valuetext",
      `${formatKitMilliLoad(combined)} of ${formatKitMilliLoad(capacity)} combined capacity`,
    );
    refs.loadValue.textContent = `${formatKitMilliLoad(combined)} / ${formatKitMilliLoad(capacity)}`;
    refs.transportValue.textContent = formatKitMilliLoad(transport);
    refs.fieldValue.textContent = formatKitMilliLoad(field);
    refs.location.textContent = view?.locationLabel ?? "Between harbors";
    refs.hint.textContent = view?.hint
      ?? "KIT stays available anywhere and does not pause the world. Harbor lockers are staged.";
    refs.dialog.dataset.overCapacity = combined > capacity ? "true" : "false";
  };

  const renderPanel = (): void => {
    refs.scroll.replaceChildren();
    refs.scroll.setAttribute(
      "aria-label",
      `${KIT_TABS.find((candidate) => candidate.id === tab)?.label ?? "KIT"} contents; scroll for more`,
    );
    if (!view) {
      refs.scroll.append(emptyState(
        "KIT is being threaded into this world",
        "The panel is live and non-pausing; inventory facts will appear when the save adapter supplies them.",
      ));
      return;
    }
    if (tab === "pack") renderPack(view, refs.scroll);
    else if (tab === "make") renderMake(view, refs.scroll, options.dispatch);
    else renderMend(view, refs.scroll, options.dispatch);
  };

  const render = (resetScroll = false): void => {
    const scrollTop = resetScroll ? 0 : refs.scroll.scrollTop;
    const focusToken = resetScroll ? null : capturePanelFocus();
    signature = `${tab}:${kitViewSignature(view)}`;
    for (const candidate of KIT_TABS) {
      const selected = candidate.id === tab;
      const tabButton = refs.tabs[candidate.id];
      tabButton.setAttribute("aria-selected", selected ? "true" : "false");
      tabButton.tabIndex = selected ? 0 : -1;
    }
    refs.panel.setAttribute("aria-labelledby", refs.tabs[tab].id);
    refs.dialog.dataset.kitTab = tab;
    renderLoad();
    renderPanel();
    restorePanelFocus(focusToken);
    refs.scroll.scrollTop = scrollTop;
    renderPending = false;
  };

  const flushPendingRender = (): void => {
    pointerActive = false;
    if (renderPending) render();
  };
  const schedulePointerRelease = (): void => {
    window.setTimeout(flushPendingRender, 0);
  };
  const cancelPointer = (): void => {
    pointerActive = false;
    if (renderPending) render();
  };

  const setTab = (next: KitTabId, focus = false): void => {
    if (tab !== next) {
      tab = next;
      render(true);
    }
    if (focus) refs.tabs[tab].focus({ preventScroll: true });
  };

  const update = (next?: KitUIView): void => {
    view = next;
    const nextSignature = `${tab}:${kitViewSignature(view)}`;
    if (nextSignature === signature) return;
    if (pointerActive && signature !== "") {
      renderPending = true;
      return;
    }
    render();
  };

  const open = (nextTab: KitTabId = "pack", trigger?: HTMLElement | null): void => {
    if (destroyed) return;
    if (!refs.dialog.open) {
      returnFocus = trigger
        ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
    setTab(nextTab, false);
    if (!refs.dialog.open) {
      try {
        refs.dialog.showModal();
      } catch {
        refs.dialog.setAttribute("open", "");
      }
    }
    options.onOpenChange?.(true);
    refs.tabs[tab].focus({ preventScroll: true });
  };

  const close = (restoreFocus = true): void => {
    if (!refs.dialog.open) return;
    if (!restoreFocus) returnFocus = null;
    try {
      refs.dialog.close();
    } catch {
      refs.dialog.removeAttribute("open");
      options.onOpenChange?.(false);
      const target = returnFocus;
      returnFocus = null;
      if (target?.isConnected) target.focus({ preventScroll: true });
    }
  };

  for (const candidate of KIT_TABS) {
    const tabButton = refs.tabs[candidate.id];
    tabButton.addEventListener("click", () => setTab(candidate.id, false));
    tabButton.addEventListener("keydown", (event) => {
      if (
        event.key !== "ArrowLeft"
        && event.key !== "ArrowRight"
        && event.key !== "Home"
        && event.key !== "End"
      ) return;
      event.preventDefault();
      setTab(nextKitTab(tab, event.key), true);
    });
  }
  refs.close.addEventListener("click", () => close());
  refs.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  refs.dialog.addEventListener("close", () => {
    options.onOpenChange?.(false);
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  });
  refs.scroll.addEventListener("pointerdown", () => {
    pointerActive = true;
  });
  window.addEventListener("pointerup", schedulePointerRelease);
  window.addEventListener("pointercancel", cancelPointer);
  render(true);

  return {
    element: refs.dialog,
    update,
    open,
    close,
    toggle: (nextTab = "pack", trigger) => {
      if (refs.dialog.open) close();
      else open(nextTab, trigger);
    },
    setTab,
    activeTab: () => tab,
    isOpen: () => refs.dialog.open,
    destroy: () => {
      destroyed = true;
      window.removeEventListener("pointerup", schedulePointerRelease);
      window.removeEventListener("pointercancel", cancelPointer);
      returnFocus = null;
      close();
    },
  };
}
