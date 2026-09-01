import type { PaceView, SettlementStatus, TidePhase, WeatherKind } from "../render/types";
import type {
  ChronicleEntryUIView,
  ContractStatus,
  ContractUIView,
  JourneyPosture,
  SessionShape,
  SettlementInspectorUIView,
  TideweftUIController,
  TideweftUIOptions,
  TideweftUIView,
} from "./types";

interface UIRefs {
  shell: HTMLDivElement;
  worldName: HTMLParagraphElement;
  clockDay: HTMLSpanElement;
  clockTime: HTMLSpanElement;
  tideReadout: HTMLDivElement;
  tideSymbol: HTMLSpanElement;
  tideLabel: HTMLSpanElement;
  tideProgress: HTMLProgressElement;
  tideNext: HTMLSpanElement;
  weatherReadout: HTMLDivElement;
  weatherSymbol: HTMLSpanElement;
  weatherLabel: HTMLSpanElement;
  weatherForecast: HTMLSpanElement;
  location: HTMLParagraphElement;
  stamina: HTMLProgressElement;
  stability: HTMLProgressElement;
  stabilityDetail: HTMLSpanElement;
  scanCharge: HTMLProgressElement;
  cargo: HTMLProgressElement;
  cargoLabel: HTMLSpanElement;
  objectivePanel: HTMLElement;
  objectiveEyebrow: HTMLParagraphElement;
  objectiveTitle: HTMLHeadingElement;
  objectiveDescription: HTMLParagraphElement;
  objectiveProgress: HTMLProgressElement;
  objectiveProgressLabel: HTMLSpanElement;
  objectiveWhy: HTMLParagraphElement;
  fieldReadout: HTMLDivElement;
  fieldTerrain: HTMLSpanElement;
  fieldDepth: HTMLSpanElement;
  fieldEffort: HTMLSpanElement;
  fieldTools: HTMLSpanElement;
  fieldHint: HTMLSpanElement;
  fieldSweep: HTMLProgressElement;
  choirReadout: HTMLDivElement;
  choirLabel: HTMLSpanElement;
  choirProgress: HTMLProgressElement;
  choirHint: HTMLSpanElement;
  contractDetails: HTMLDetailsElement;
  contractSummary: HTMLElement;
  contractCount: HTMLSpanElement;
  contractList: HTMLOListElement;
  inspector: HTMLElement;
  inspectorTitle: HTMLHeadingElement;
  inspectorSubtitle: HTMLParagraphElement;
  inspectorStatus: HTMLSpanElement;
  inspectorPopulation: HTMLSpanElement;
  inspectorVerified: HTMLSpanElement;
  inspectorSummary: HTMLParagraphElement;
  inspectorMetrics: HTMLDListElement;
  inspectorStocks: HTMLUListElement;
  inspectorResidents: HTMLUListElement;
  inspectorConnections: HTMLUListElement;
  inspectorFocus: HTMLButtonElement;
  inspectorClose: HTMLButtonElement;
  chronicleDetails: HTMLDetailsElement;
  chronicleSummary: HTMLElement;
  chronicleCount: HTMLSpanElement;
  chronicleList: HTMLOListElement;
  pauseButton: HTMLButtonElement;
  scanButton: HTMLButtonElement;
  interactButton: HTMLButtonElement;
  quietButton: HTMLButtonElement;
  titleButton: HTMLButtonElement;
  helpButton: HTMLButtonElement;
  paceButtons: Readonly<Record<PaceView, HTMLButtonElement>>;
  titleDialog: HTMLDialogElement;
  titleSubtitle: HTMLParagraphElement;
  continueButton: HTMLButtonElement;
  continueName: HTMLSpanElement;
  continueSummary: HTMLSpanElement;
  newWorldForm: HTMLFormElement;
  seedInput: HTMLInputElement;
  postureInputs: readonly HTMLInputElement[];
  sessionInputs: readonly HTMLInputElement[];
  quietDialog: HTMLDialogElement;
  quietTitle: HTMLHeadingElement;
  quietSummary: HTMLParagraphElement;
  quietDuration: HTMLSpanElement;
  quietDistance: HTMLSpanElement;
  quietDeliveries: HTMLSpanElement;
  quietStrands: HTMLSpanElement;
  quietChanges: HTMLUListElement;
  quietQuote: HTMLQuoteElement;
  quietFinish: HTMLButtonElement;
  quietContinue: HTMLButtonElement;
  helpDialog: HTMLDialogElement;
  helpClose: HTMLButtonElement;
}

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const createButton = (
  className: string,
  label: string,
  accessibleLabel?: string,
): HTMLButtonElement => {
  const button = createElement("button", className, label);
  button.type = "button";
  if (accessibleLabel) button.setAttribute("aria-label", accessibleLabel);
  return button;
};

const appendTextRow = (
  parent: HTMLElement,
  label: string,
  value: string,
  className = "readout-row",
): void => {
  const row = createElement("div", className);
  row.append(createElement("span", `${className}__label`, label));
  row.append(createElement("span", `${className}__value`, value));
  parent.append(row);
};

const makeProgress = (label: string): HTMLProgressElement => {
  const progress = createElement("progress", "weft-progress");
  progress.max = 1;
  progress.value = 0;
  progress.setAttribute("aria-label", label);
  return progress;
};

const clampUnit = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const setProgress = (
  progress: HTMLProgressElement,
  value: number,
  valueText?: string,
): void => {
  progress.value = clampUnit(value);
  progress.setAttribute("aria-valuetext", valueText ?? `${Math.round(clampUnit(value) * 100)} percent`);
};

const syncDialog = (dialog: HTMLDialogElement, visible: boolean): void => {
  if (visible && !dialog.open) {
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute("open", "");
    }
  } else if (!visible && dialog.open) {
    try {
      dialog.close();
    } catch {
      dialog.removeAttribute("open");
    }
  }
};

const weatherSymbol = (kind: WeatherKind): string => {
  switch (kind) {
    case "clear":
      return "◌";
    case "mist":
      return "≋";
    case "drizzle":
      return "╱";
    case "rain":
      return "╱╱";
    case "squall":
      return "⚡";
    case "aurora":
      return "⌁";
  }
};

const tideSymbol = (phase: TidePhase): string => {
  switch (phase) {
    case "ebb":
      return "↘";
    case "low":
      return "⇣";
    case "flood":
      return "↗";
    case "high":
      return "⇡";
  }
};

const statusSymbol = (status: SettlementStatus): string => {
  switch (status) {
    case "steady":
      return "●";
    case "watchful":
      return "◐";
    case "strained":
      return "▲";
    case "recovering":
      return "✦";
    case "evacuating":
      return "◆";
  }
};

const contractAction = (status: ContractStatus): "accept" | "track" | "renegotiate" | null => {
  switch (status) {
    case "available":
      return "accept";
    case "accepted":
      return "track";
    case "tracked":
      return "renegotiate";
    case "completed":
    case "lapsed":
      return null;
  }
};

const defaultContractActionLabel = (status: ContractStatus): string => {
  switch (status) {
    case "available":
      return "Make this promise";
    case "accepted":
      return "Track route";
    case "tracked":
      return "Review promise";
    case "completed":
      return "Completed";
    case "lapsed":
      return "Needs renegotiation";
  }
};

const contractSignature = (contracts: readonly ContractUIView[]): string =>
  contracts
    .map((contract) =>
      [
        contract.id,
        contract.title,
        contract.requester ?? "",
        contract.summary,
        contract.origin,
        contract.destination,
        contract.cargoLabel,
        contract.cargoProperty ?? "",
        contract.mood,
        contract.status,
        contract.selected ? 1 : 0,
        contract.disabled ? 1 : 0,
        contract.masteryHint ?? "",
        contract.consequence ?? "",
        contract.actionLabel ?? "",
      ].join(":"),
    )
    .join("|");

const chronicleSignature = (entries: readonly ChronicleEntryUIView[]): string =>
  entries
    .map((entry) =>
      [entry.id, entry.timeLabel, entry.title, entry.detail, entry.kind, entry.new ? 1 : 0].join(":"),
    )
    .join("|");

const buildShell = (options: TideweftUIOptions): UIRefs => {
  const shell = createElement("div", "ui-layer");

  const topbar = createElement("section", "hud-bar glass-panel");
  topbar.setAttribute("aria-label", "World and journey status");

  const identity = createElement("div", "hud-identity");
  const worldName = createElement("p", "hud-identity__world", "Uncharted estuary");
  const location = createElement("p", "hud-identity__location", "Listening for a shore…");
  identity.append(worldName, location);

  const clock = createElement("div", "clock-readout");
  clock.setAttribute("aria-label", "Estuary time");
  const clockDay = createElement("span", "clock-readout__day", "Day 1");
  const clockTime = createElement("span", "clock-readout__time", "Dawn");
  clock.append(clockDay, clockTime);

  const tideReadout = createElement("div", "condition-readout condition-readout--tide");
  tideReadout.dataset.phase = "low";
  const tideSymbolElement = createElement("span", "condition-readout__symbol", "⇣");
  tideSymbolElement.setAttribute("aria-hidden", "true");
  const tideCopy = createElement("span", "condition-readout__copy");
  const tideLabelElement = createElement("strong", "condition-readout__label", "Low tide");
  const tideNext = createElement("span", "condition-readout__detail", "Turning soon");
  const tideProgress = makeProgress("Tide phase progress");
  tideCopy.append(tideLabelElement, tideNext, tideProgress);
  tideReadout.append(tideSymbolElement, tideCopy);

  const weatherReadout = createElement("div", "condition-readout condition-readout--weather");
  weatherReadout.dataset.weather = "clear";
  const weatherSymbolElement = createElement("span", "condition-readout__symbol", "◌");
  weatherSymbolElement.setAttribute("aria-hidden", "true");
  const weatherCopy = createElement("span", "condition-readout__copy");
  const weatherLabelElement = createElement("strong", "condition-readout__label", "Clear");
  const weatherForecast = createElement("span", "condition-readout__detail", "A quiet horizon");
  weatherCopy.append(weatherLabelElement, weatherForecast);
  weatherReadout.append(weatherSymbolElement, weatherCopy);

  const vitals = createElement("div", "vitals-readout");
  const makeVital = (label: string, modifier: string): [HTMLDivElement, HTMLProgressElement] => {
    const wrapper = createElement("div", `vital vital--${modifier}`);
    const labelElement = createElement("span", "vital__label", label);
    const progress = makeProgress(label);
    wrapper.append(labelElement, progress);
    return [wrapper, progress];
  };
  const [staminaWrapper, stamina] = makeVital("Stamina", "stamina");
  const [stabilityWrapper, stability] = makeVital("Stability", "stability");
  const stabilityDetail = createElement("span", "vital__detail", "Stable · hold Shift to brace");
  stabilityWrapper.append(stabilityDetail);
  const [scanWrapper, scanCharge] = makeVital("Loom", "scan");
  const [cargoWrapper, cargo] = makeVital("Cargo", "cargo");
  const cargoLabel = createElement("span", "vital__value", "0 / 0");
  cargoWrapper.append(cargoLabel);
  vitals.append(staminaWrapper, stabilityWrapper, scanWrapper, cargoWrapper);
  topbar.append(identity, clock, tideReadout, weatherReadout, vitals);

  const objectivePanel = createElement("aside", "objective-panel glass-panel");
  objectivePanel.setAttribute("aria-labelledby", "objective-title");
  const objectiveEyebrow = createElement("p", "panel-eyebrow", "Current thread");
  const objectiveTitle = createElement("h2", "objective-panel__title", "Listen to the estuary");
  objectiveTitle.id = "objective-title";
  const objectiveDescription = createElement(
    "p",
    "objective-panel__description",
    "A useful promise will appear when the world is ready.",
  );
  const objectiveProgress = makeProgress("Objective progress");
  const objectiveProgressLabel = createElement("span", "objective-panel__progress-label", "Not begun");
  const objectiveWhy = createElement("p", "objective-panel__why");
  const fieldReadout = createElement("div", "field-readout");
  fieldReadout.setAttribute("aria-label", "Current terrain, water depth, stamina cost, and field tools");
  const fieldHeader = createElement("span", "field-readout__header");
  fieldHeader.append(createElement("span", "field-readout__symbol", "⌖"));
  const fieldTerrain = createElement("strong", "field-readout__terrain", "Uncharted ground");
  fieldHeader.append(fieldTerrain);
  const fieldMetrics = createElement("span", "field-readout__metrics");
  const fieldDepth = createElement("span", "field-readout__depth", "Depth unsounded");
  const fieldEffort = createElement("span", "field-readout__effort", "Normal stamina use");
  fieldMetrics.append(fieldDepth, fieldEffort);
  const fieldTools = createElement("span", "field-readout__tools", "FIELD KIT · Sounding line");
  const fieldHint = createElement("span", "field-readout__hint", "Pulse Space to sound nearby water.");
  const fieldSweep = makeProgress("Progress toward a safe bank while swept");
  fieldSweep.classList.add("field-readout__sweep");
  fieldSweep.hidden = true;
  fieldReadout.append(fieldHeader, fieldMetrics, fieldTools, fieldHint, fieldSweep);
  const choirReadout = createElement("div", "choir-readout");
  choirReadout.setAttribute("aria-label", "Tide Choir survey progress");
  const choirHeader = createElement("span", "choir-readout__header");
  choirHeader.append(createElement("span", "choir-readout__symbol", "⌁"));
  const choirLabel = createElement("span", "choir-readout__label", "No strands heard yet");
  choirHeader.append(choirLabel);
  const choirProgress = makeProgress("Tide Choir phrase progress");
  const choirHint = createElement("span", "choir-readout__hint", "Travel between harbors along a corridor to survey it.");
  choirReadout.append(choirHeader, choirProgress, choirHint);
  objectivePanel.append(
    objectiveEyebrow,
    objectiveTitle,
    objectiveDescription,
    objectiveProgress,
    objectiveProgressLabel,
    objectiveWhy,
    fieldReadout,
    choirReadout,
  );

  const contractDetails = createElement("details", "contract-rail glass-panel");
  contractDetails.open = true;
  const contractSummary = createElement("summary", "panel-summary");
  contractSummary.append(createElement("span", "panel-summary__title", "Promises"));
  const contractCount = createElement("span", "panel-summary__count", "0");
  contractSummary.append(contractCount);
  const contractList = createElement("ol", "contract-list");
  contractList.tabIndex = 0;
  contractList.setAttribute("aria-label", "Scrollable list of available and active promises");
  const contractGuide = createElement(
    "p",
    "contract-rail__guide",
    "Cargo promises: go to PICK UP, carry the goods, then DELIVER. Stock reports are separate information errands.",
  );
  contractDetails.append(contractSummary, contractGuide, contractList);

  const inspector = createElement("aside", "settlement-inspector glass-panel");
  inspector.setAttribute("aria-labelledby", "settlement-inspector-title");
  inspector.hidden = true;
  const inspectorHeader = createElement("header", "inspector-header");
  const inspectorHeading = createElement("div", "inspector-heading");
  const inspectorSubtitle = createElement("p", "panel-eyebrow", "Settlement");
  const inspectorTitle = createElement("h2", "inspector-title", "No shore selected");
  inspectorTitle.id = "settlement-inspector-title";
  inspectorHeading.append(inspectorSubtitle, inspectorTitle);
  const inspectorClose = createButton("icon-button", "×", "Close settlement inspector");
  inspectorHeader.append(inspectorHeading, inspectorClose);
  const inspectorFacts = createElement("div", "inspector-facts");
  const inspectorStatus = createElement("span", "status-chip", "● Steady");
  const inspectorPopulation = createElement("span", "fact-chip", "0 people");
  const inspectorVerified = createElement("span", "fact-chip fact-chip--age", "Unverified");
  inspectorFacts.append(inspectorStatus, inspectorPopulation, inspectorVerified);
  const inspectorSummary = createElement("p", "inspector-summary");
  const inspectorMetrics = createElement("dl", "metric-grid");
  const inspectorStockHeading = createElement("h3", "inspector-section-title", "Useful stocks");
  const inspectorStocks = createElement("ul", "stock-list");
  const inspectorResidentHeading = createElement("h3", "inspector-section-title", "People to know");
  const inspectorResidents = createElement("ul", "resident-list");
  const inspectorConnectionHeading = createElement("h3", "inspector-section-title", "Connections");
  const inspectorConnections = createElement("ul", "connection-list");
  const inspectorFocus = createButton("text-button text-button--primary", "Focus on map");
  inspector.append(
    inspectorHeader,
    inspectorFacts,
    inspectorSummary,
    inspectorMetrics,
    inspectorStockHeading,
    inspectorStocks,
    inspectorResidentHeading,
    inspectorResidents,
    inspectorConnectionHeading,
    inspectorConnections,
    inspectorFocus,
  );

  const chronicleDetails = createElement("details", "chronicle-panel glass-panel");
  const chronicleSummary = createElement("summary", "panel-summary");
  chronicleSummary.append(createElement("span", "panel-summary__title", "The water remembers"));
  const chronicleCount = createElement("span", "panel-summary__count", "0");
  chronicleSummary.append(chronicleCount);
  const chronicleList = createElement("ol", "chronicle-list");
  chronicleList.setAttribute("aria-label", "Recent world events");
  chronicleDetails.append(chronicleSummary, chronicleList);

  const actionDock = createElement("nav", "action-dock glass-panel");
  actionDock.setAttribute("aria-label", "Journey actions");
  const scanButton = createButton("action-button action-button--scan", "Sound / Scan", "Pulse the Loom to reveal terrain and water depth");
  scanButton.append(createElement("kbd", "keycap", "Space"));
  const interactButton = createButton("action-button action-button--interact", "Interact");
  interactButton.append(createElement("kbd", "keycap", "E"));
  const pauseButton = createButton("action-button pause-button", "Hold tide");
  pauseButton.append(createElement("kbd", "keycap", "P"));

  const paceGroup = createElement("div", "pace-control");
  paceGroup.setAttribute("role", "group");
  paceGroup.setAttribute("aria-label", "Travel pace");
  const paceRest = createButton("pace-button", "Rest");
  const paceSteady = createButton("pace-button", "Steady");
  const paceSwift = createButton("pace-button", "Swift");
  paceGroup.append(paceRest, paceSteady, paceSwift);
  const quietButton = createButton("icon-button icon-button--labeled quiet-button", "Quiet Hour");
  const titleButton = createButton("icon-button", "⌂", "Open title and world menu");
  const helpButton = createButton("icon-button", "?", "Open controls and help");
  actionDock.append(
    scanButton,
    interactButton,
    pauseButton,
    paceGroup,
    quietButton,
    titleButton,
    helpButton,
  );

  const titleDialog = createElement("dialog", "title-dialog estuary-dialog");
  titleDialog.setAttribute("aria-labelledby", "title-dialog-heading");
  const titleBackdrop = createElement("div", "title-dialog__backdrop");
  titleBackdrop.setAttribute("aria-hidden", "true");
  const titleContent = createElement("div", "title-dialog__content");
  const titleKnot = createElement("span", "title-knot");
  titleKnot.setAttribute("aria-hidden", "true");
  const titleEyebrow = createElement("p", "title-dialog__eyebrow", "A living logistics fable");
  const titleHeading = createElement("h1", "title-dialog__heading", "TIDEWEFT");
  titleHeading.id = "title-dialog-heading";
  const titleSubtitle = createElement(
    "p",
    "title-dialog__subtitle",
    "Carry promises across a living estuary. Leave routes that learn to care for themselves.",
  );
  const continueButton = createButton("continue-card", "");
  const continueKicker = createElement("span", "continue-card__kicker", "Return to");
  const continueName = createElement("strong", "continue-card__name", "Your estuary");
  const continueSummary = createElement("span", "continue-card__summary", "No offline loss. The tide waits here.");
  continueButton.append(continueKicker, continueName, continueSummary);

  const newWorldForm = createElement("form", "new-world-form");
  newWorldForm.setAttribute("aria-label", "Begin a new estuary");
  const newWorldHeading = createElement("h2", "new-world-form__heading", "Begin a new estuary");
  const seedLabel = createElement("label", "field-label", "World seed");
  seedLabel.htmlFor = "world-seed";
  const seedInput = createElement("input", "seed-input");
  seedInput.id = "world-seed";
  seedInput.name = "seed";
  seedInput.type = "text";
  seedInput.maxLength = 64;
  seedInput.autocomplete = "off";
  seedInput.spellcheck = false;
  seedInput.placeholder = "Leave blank for a new tide";

  const postureFieldset = createElement("fieldset", "choice-fieldset");
  postureFieldset.append(createElement("legend", "choice-fieldset__legend", "How should the water meet you?"));
  const postureInputs: HTMLInputElement[] = [];
  const postureOptions: ReadonlyArray<[JourneyPosture, string, string]> = [
    ["hearth", "Hearth", "Forgiving currents and recoverable settlement strain."],
    ["journey", "Journey", "The intended rhythm of care, weather, and tradeoffs."],
    ["gale", "Gale", "Tighter forecasts and stronger disruptions."],
  ];
  for (const [value, label, description] of postureOptions) {
    const optionLabel = createElement("label", "choice-card");
    const input = createElement("input");
    input.type = "radio";
    input.name = "posture";
    input.value = value;
    if (value === "journey") input.checked = true;
    postureInputs.push(input);
    const copy = createElement("span", "choice-card__copy");
    copy.append(createElement("strong", "choice-card__label", label));
    copy.append(createElement("span", "choice-card__description", description));
    optionLabel.append(input, copy);
    postureFieldset.append(optionLabel);
  }

  const sessionFieldset = createElement("fieldset", "choice-fieldset choice-fieldset--compact");
  sessionFieldset.append(createElement("legend", "choice-fieldset__legend", "Tonight's shape"));
  const sessionInputs: HTMLInputElement[] = [];
  const sessionOptions: ReadonlyArray<[SessionShape, string, string]> = [
    ["drift", "Drift", "≈ 10 min"],
    ["weave", "Weave", "≈ 25 min"],
    ["wander", "Wander", "Open"],
  ];
  const sessionRow = createElement("div", "segmented-choice");
  for (const [value, label, duration] of sessionOptions) {
    const optionLabel = createElement("label", "segmented-choice__option");
    const input = createElement("input");
    input.type = "radio";
    input.name = "session-shape";
    input.value = value;
    if (value === "weave") input.checked = true;
    sessionInputs.push(input);
    const copy = createElement("span", "segmented-choice__copy");
    copy.append(createElement("strong", "segmented-choice__label", label));
    copy.append(createElement("small", "segmented-choice__detail", duration));
    optionLabel.append(input, copy);
    sessionRow.append(optionLabel);
  }
  sessionFieldset.append(sessionRow);
  const beginButton = createButton("text-button text-button--primary text-button--wide", "Enter the estuary");
  beginButton.type = "submit";
  newWorldForm.append(newWorldHeading, seedLabel, seedInput, postureFieldset, sessionFieldset, beginButton);
  titleContent.append(
    titleKnot,
    titleEyebrow,
    titleHeading,
    titleSubtitle,
    continueButton,
    newWorldForm,
  );
  titleDialog.append(titleBackdrop, titleContent);

  const quietDialog = createElement("dialog", "quiet-dialog estuary-dialog");
  quietDialog.setAttribute("aria-labelledby", "quiet-hour-heading");
  const quietContent = createElement("div", "quiet-dialog__content");
  quietContent.append(createElement("p", "panel-eyebrow", "A place to stop without losing the thread"));
  const quietTitle = createElement("h2", "quiet-dialog__title", "Quiet Hour");
  quietTitle.id = "quiet-hour-heading";
  const quietSummary = createElement("p", "quiet-dialog__summary", "The estuary is ready to remember this session.");
  const quietStats = createElement("dl", "quiet-stats");
  const quietDuration = createElement("span");
  const quietDistance = createElement("span");
  const quietDeliveries = createElement("span");
  const quietStrands = createElement("span");
  const quietStatPairs: ReadonlyArray<[string, HTMLSpanElement]> = [
    ["Time together", quietDuration],
    ["Distance carried", quietDistance],
    ["Promises kept", quietDeliveries],
    ["New strand", quietStrands],
  ];
  for (const [label, value] of quietStatPairs) {
    const wrapper = createElement("div", "quiet-stat");
    wrapper.append(createElement("dt", "quiet-stat__label", label));
    const data = createElement("dd", "quiet-stat__value");
    data.append(value);
    wrapper.append(data);
    quietStats.append(wrapper);
  }
  const quietChangesHeading = createElement("h3", "quiet-dialog__changes-heading", "What changed this session");
  const quietChanges = createElement("ul", "quiet-change-list");
  const quietQuote = createElement("q", "quiet-dialog__quote");
  const quietActions = createElement("div", "dialog-actions");
  const quietContinue = createButton("text-button", "One more tide");
  const quietFinish = createButton("text-button text-button--primary", "Rest here");
  quietActions.append(quietContinue, quietFinish);
  quietContent.append(
    quietTitle,
    quietSummary,
    quietStats,
    quietChangesHeading,
    quietChanges,
    quietQuote,
    quietActions,
  );
  quietDialog.append(quietContent);

  const helpDialog = createElement("dialog", "help-dialog estuary-dialog");
  helpDialog.setAttribute("aria-labelledby", "help-dialog-heading");
  const helpContent = createElement("div", "help-dialog__content");
  const helpHeader = createElement("header", "help-dialog__header");
  const helpHeading = createElement("h2", "help-dialog__title", "Travel gently, travel clearly");
  helpHeading.id = "help-dialog-heading";
  const helpClose = createButton("icon-button", "×", "Close help");
  helpHeader.append(helpHeading, helpClose);
  const helpIntro = createElement(
    "p",
    "help-dialog__intro",
    "TIDEWEFT saves locally and never advances the world while it is closed. Nearly every setback creates a repair or rescue thread.",
  );
  const helpGrid = createElement("dl", "control-grid");
  const controlPairs: ReadonlyArray<[string, string]> = [
    ["WASD / Arrows", "Travel"],
    ["Hold Shift", "Brace while moving"],
    ["Pointer", "Choose a world destination"],
    ["Space", "Sound water depth and reveal nearby terrain"],
    ["E / Enter", "Interact"],
    ["[ / ]", "Change pace"],
    ["P", "Hold or release the tide"],
    ["V", "Switch Chart 2D / Relief 3D"],
    ["Right / Alt drag", "Orbit the Relief 3D camera"],
    ["Escape / right click", "Cancel destination"],
    ["?", "Open this help"],
  ];
  for (const [key, action] of controlPairs) {
    const wrapper = createElement("div", "control-grid__row");
    const term = createElement("dt");
    term.append(createElement("kbd", "keycap", key));
    wrapper.append(term, createElement("dd", "control-grid__action", action));
    helpGrid.append(wrapper);
  }
  const accessibilityNote = createElement(
    "p",
    "help-dialog__note",
    "Important states use words, symbols, and line patterns in addition to color. Reduced-motion preferences are honored automatically.",
  );
  const journeyNote = createElement(
    "p",
    "help-dialog__note",
    "Cargo promises move physical goods from the named PICK UP harbor to the named DELIVER harbor. Signed stock reports are separate one-slot information jobs. Deep water drains more stamina; if it empties, the current sweeps you toward a safe bank while cargo stays with you. Visit completed civic projects to inherit field tools.",
  );
  helpContent.append(helpHeader, helpIntro, helpGrid, journeyNote, accessibilityNote);
  helpDialog.append(helpContent);

  shell.append(
    topbar,
    objectivePanel,
    contractDetails,
    inspector,
    chronicleDetails,
    actionDock,
    titleDialog,
    quietDialog,
    helpDialog,
  );
  options.root.replaceChildren(shell);

  return {
    shell,
    worldName,
    clockDay,
    clockTime,
    tideReadout,
    tideSymbol: tideSymbolElement,
    tideLabel: tideLabelElement,
    tideProgress,
    tideNext,
    weatherReadout,
    weatherSymbol: weatherSymbolElement,
    weatherLabel: weatherLabelElement,
    weatherForecast,
    location,
    stamina,
    stability,
    stabilityDetail,
    scanCharge,
    cargo,
    cargoLabel,
    objectivePanel,
    objectiveEyebrow,
    objectiveTitle,
    objectiveDescription,
    objectiveProgress,
    objectiveProgressLabel,
    objectiveWhy,
    fieldReadout,
    fieldTerrain,
    fieldDepth,
    fieldEffort,
    fieldTools,
    fieldHint,
    fieldSweep,
    choirReadout,
    choirLabel,
    choirProgress,
    choirHint,
    contractDetails,
    contractSummary,
    contractCount,
    contractList,
    inspector,
    inspectorTitle,
    inspectorSubtitle,
    inspectorStatus,
    inspectorPopulation,
    inspectorVerified,
    inspectorSummary,
    inspectorMetrics,
    inspectorStocks,
    inspectorResidents,
    inspectorConnections,
    inspectorFocus,
    inspectorClose,
    chronicleDetails,
    chronicleSummary,
    chronicleCount,
    chronicleList,
    pauseButton,
    scanButton,
    interactButton,
    quietButton,
    titleButton,
    helpButton,
    paceButtons: { rest: paceRest, steady: paceSteady, swift: paceSwift },
    titleDialog,
    titleSubtitle,
    continueButton,
    continueName,
    continueSummary,
    newWorldForm,
    seedInput,
    postureInputs,
    sessionInputs,
    quietDialog,
    quietTitle,
    quietSummary,
    quietDuration,
    quietDistance,
    quietDeliveries,
    quietStrands,
    quietChanges,
    quietQuote,
    quietFinish,
    quietContinue,
    helpDialog,
    helpClose,
  };
};

export function createTideweftUI(options: TideweftUIOptions): TideweftUIController {
  const refs = buildShell(options);
  const announcer = options.announcer ?? document.getElementById("announcer") ?? createElement("div", "visually-hidden");
  if (!announcer.isConnected) {
    announcer.setAttribute("role", "status");
    announcer.setAttribute("aria-live", "polite");
    options.root.append(announcer);
  }

  let latestView: TideweftUIView | null = null;
  let lastRevision = "";
  let lastContracts = "";
  let lastChronicle = "";
  let lastAnnouncement = "";
  let forcedTitle: boolean | null = null;
  let forcedQuietHour: boolean | null = null;
  let titleFormDirty = false;
  let contractPointerActive = false;
  let running = false;
  let frameHandle: number | null = null;

  const releaseContractPointer = (): void => {
    window.setTimeout(() => {
      contractPointerActive = false;
    }, 0);
  };

  const cancelContractPointer = (): void => {
    contractPointerActive = false;
  };

  const announce = (message: string, assertive = false): void => {
    announcer.setAttribute("aria-live", assertive ? "assertive" : "polite");
    announcer.textContent = "";
    window.setTimeout(() => {
      announcer.textContent = message;
    }, 20);
  };

  const renderContracts = (contracts: readonly ContractUIView[]): void => {
    const signature = contractSignature(contracts);
    if (signature === lastContracts) return;
    // Never replace a button between pointer-down and click. Live ETA/progress
    // values are deliberately absent from the structural signature, so cards
    // otherwise update only when their actionable state actually changes.
    if (lastContracts !== "" && contractPointerActive) return;
    lastContracts = signature;
    refs.contractList.replaceChildren();
    refs.contractCount.textContent = String(contracts.length);
    refs.contractSummary.setAttribute(
      "aria-label",
      `${contracts.length} ${contracts.length === 1 ? "promise" : "promises"}`,
    );

    if (contracts.length === 0) {
      const empty = createElement("li", "empty-state");
      empty.append(createElement("strong", "empty-state__title", "No promises waiting"));
      empty.append(createElement("span", "empty-state__copy", "Listen at a settlement or let the tide turn."));
      refs.contractList.append(empty);
      return;
    }

    for (const contract of contracts) {
      const item = createElement("li", "contract-list__item");
      const article = createElement("article", "contract-card");
      article.dataset.mood = contract.mood;
      article.dataset.status = contract.status;
      if (contract.selected) article.dataset.selected = "true";

      const inspectButton = createButton(
        "contract-card__inspect",
        "",
        `Inspect ${contract.title}, from ${contract.origin} to ${contract.destination}`,
      );
      inspectButton.setAttribute("aria-pressed", contract.selected ? "true" : "false");
      const header = createElement("span", "contract-card__header");
      header.append(createElement("span", "contract-card__mood", contract.mood));
      header.append(createElement("span", "contract-card__status", contract.status));
      const title = createElement("strong", "contract-card__title", contract.title);
      const requester = contract.requester
        ? createElement("span", "contract-card__requester", contract.requester)
        : undefined;
      const summary = createElement("span", "contract-card__summary", contract.summary);
      const route = createElement("span", "contract-card__route");
      const pickup = createElement("span", "contract-card__route-stop contract-card__route-stop--pickup");
      pickup.append(createElement("span", "contract-card__route-verb", "PICK UP"));
      pickup.append(createElement("span", "contract-card__origin", contract.origin));
      const delivery = createElement("span", "contract-card__route-stop contract-card__route-stop--delivery");
      delivery.append(createElement("span", "contract-card__route-verb", "DELIVER"));
      delivery.append(createElement("span", "contract-card__destination", contract.destination));
      route.append(pickup);
      route.append(createElement("span", "contract-card__arrow", "→"));
      route.append(delivery);
      const cargo = createElement("span", "contract-card__cargo");
      cargo.append(createElement("span", "contract-card__cargo-symbol", "◇"));
      cargo.append(createElement("span", "contract-card__cargo-label", contract.cargoLabel));
      if (contract.cargoProperty && contract.cargoProperty !== "ordinary") {
        cargo.append(createElement("span", "property-chip", contract.cargoProperty));
      }
      if (contract.eta) cargo.append(createElement("span", "contract-card__eta", contract.eta));
      inspectButton.append(header, title);
      if (requester) inspectButton.append(requester);
      inspectButton.append(summary, route, cargo);
      if (contract.forecast) {
        inspectButton.append(createElement("span", "contract-card__forecast", contract.forecast));
      }
      if (contract.masteryHint) {
        inspectButton.append(createElement("span", "contract-card__mastery", contract.masteryHint));
      }
      inspectButton.addEventListener("click", () => {
        options.dispatch({ type: "contract", action: "inspect", contractId: contract.id });
      });

      article.append(inspectButton);
      if (contract.progress !== undefined) {
        const progress = makeProgress(`${contract.title} progress`);
        setProgress(progress, contract.progress);
        progress.classList.add("contract-card__progress");
        article.append(progress);
      }
      if (contract.consequence) {
        const consequence = createElement("p", "contract-card__consequence", contract.consequence);
        article.append(consequence);
      }

      const action = contractAction(contract.status);
      if (action) {
        const actionButton = createButton(
          "contract-card__action text-button",
          contract.actionLabel ?? defaultContractActionLabel(contract.status),
        );
        actionButton.disabled = Boolean(contract.disabled);
        actionButton.addEventListener("click", () => {
          options.dispatch({ type: "contract", action, contractId: contract.id });
        });
        article.append(actionButton);
      }
      item.append(article);
      refs.contractList.append(item);
    }
  };

  const renderInspector = (settlement: SettlementInspectorUIView | undefined): void => {
    refs.inspector.hidden = !settlement;
    if (!settlement) return;
    refs.inspector.dataset.status = settlement.status;
    refs.inspector.dataset.settlementId = settlement.id;
    refs.inspectorTitle.textContent = settlement.name;
    refs.inspectorSubtitle.textContent = settlement.subtitle ?? "Settlement";
    refs.inspectorStatus.textContent = `${statusSymbol(settlement.status)} ${settlement.statusLabel}`;
    refs.inspectorStatus.dataset.status = settlement.status;
    refs.inspectorPopulation.textContent = `${settlement.population} ${settlement.population === 1 ? "person" : "people"}`;
    refs.inspectorVerified.textContent = settlement.lastVerified;
    refs.inspectorSummary.textContent = settlement.summary;

    refs.inspectorMetrics.replaceChildren();
    for (const metric of settlement.metrics) {
      const wrapper = createElement("div", "metric");
      wrapper.dataset.tone = metric.tone ?? "neutral";
      const term = createElement("dt", "metric__label", metric.label);
      const data = createElement("dd", "metric__value");
      const progress = makeProgress(metric.label);
      progress.dataset.tone = metric.tone ?? "neutral";
      setProgress(progress, metric.value, metric.valueLabel);
      data.append(progress, createElement("span", "metric__value-label", metric.valueLabel));
      wrapper.append(term, data);
      refs.inspectorMetrics.append(wrapper);
    }

    refs.inspectorStocks.replaceChildren();
    for (const stock of settlement.stocks) {
      const item = createElement("li", "stock-item");
      item.dataset.trend = stock.trend;
      if (stock.critical) item.dataset.critical = "true";
      const symbol = stock.trend === "rising" ? "↑" : stock.trend === "falling" ? "↓" : "→";
      const trendLabel = stock.trend === "rising" ? "rising" : stock.trend === "falling" ? "falling" : "steady";
      item.append(createElement("span", "stock-item__name", stock.label));
      item.append(createElement("span", "stock-item__amount", stock.amountLabel));
      const trend = createElement("span", "stock-item__trend", `${symbol} ${trendLabel}`);
      item.append(trend);
      refs.inspectorStocks.append(item);
    }

    refs.inspectorResidents.replaceChildren();
    for (const resident of settlement.residents) {
      const item = createElement("li", "resident-item");
      const initial = resident.name.trim().charAt(0).toLocaleUpperCase() || "·";
      item.append(createElement("span", "resident-item__initial", initial));
      const copy = createElement("span", "resident-item__copy");
      copy.append(createElement("strong", "resident-item__name", resident.name));
      copy.append(createElement("span", "resident-item__role", resident.role));
      item.append(copy);
      if (resident.state) item.append(createElement("span", "resident-item__state", resident.state));
      refs.inspectorResidents.append(item);
    }

    refs.inspectorConnections.replaceChildren();
    for (const connection of settlement.connections) {
      const item = createElement("li", "connection-item");
      if (connection.redundant) item.dataset.redundant = "true";
      if (connection.surveyed) item.dataset.surveyed = "true";
      if (connection.choirMember) item.dataset.choir = "true";
      const copy = createElement("span", "connection-item__copy");
      copy.append(createElement("strong", "connection-item__name", connection.settlementName));
      copy.append(createElement("span", "connection-item__condition", connection.conditionLabel));
      const progress = makeProgress(`Route reliability to ${connection.settlementName}`);
      setProgress(progress, connection.reliability);
      item.append(copy, progress);
      const actions = createElement("span", "connection-item__actions");
      if (connection.routeId && connection.settlementId && connection.actionLabel) {
        const action = createButton(
          "connection-item__action text-button",
          connection.actionLabel,
          `${connection.actionLabel} on the route to ${connection.settlementName}`,
        );
        action.disabled = Boolean(connection.actionDisabled);
        action.addEventListener("click", () => {
          options.dispatch({
            type: "strand",
            action: "reinforce",
            routeId: connection.routeId!,
            settlementId: connection.settlementId!,
          });
        });
        actions.append(action);
      }
      if (connection.actionHint) {
        actions.append(createElement("span", "connection-item__action-hint", connection.actionHint));
      }
      if (connection.settlementId && connection.reportActionLabel) {
        const reportAction = createButton(
          "connection-item__action text-button",
          connection.reportActionLabel,
          `${connection.reportActionLabel} for ${connection.settlementName}`,
        );
        reportAction.disabled = Boolean(connection.reportActionDisabled);
        reportAction.addEventListener("click", () => {
          options.dispatch({
            type: "report",
            action: "collect",
            sourceSettlementId: connection.settlementId!,
            targetSettlementId: connection.id,
          });
        });
        actions.append(reportAction);
      }
      if (connection.reportActionHint) {
        actions.append(createElement("span", "connection-item__action-hint", connection.reportActionHint));
      }
      if (actions.childElementCount > 0) item.append(actions);
      refs.inspectorConnections.append(item);
    }
  };

  const renderChronicle = (entries: readonly ChronicleEntryUIView[]): void => {
    const signature = chronicleSignature(entries);
    if (signature === lastChronicle) return;
    lastChronicle = signature;
    refs.chronicleList.replaceChildren();
    refs.chronicleCount.textContent = String(entries.length);
    refs.chronicleSummary.setAttribute(
      "aria-label",
      `${entries.length} recent ${entries.length === 1 ? "memory" : "memories"}`,
    );
    for (const entry of entries.slice(0, 8)) {
      const item = createElement("li", "chronicle-entry");
      item.dataset.kind = entry.kind;
      if (entry.new) item.dataset.new = "true";
      const time = createElement("time", "chronicle-entry__time", entry.timeLabel);
      const copy = createElement("span", "chronicle-entry__copy");
      copy.append(createElement("strong", "chronicle-entry__title", entry.title));
      copy.append(createElement("span", "chronicle-entry__detail", entry.detail));
      item.append(time, copy);
      refs.chronicleList.append(item);
    }
    if (entries.length === 0) {
      refs.chronicleList.append(
        createElement("li", "empty-state empty-state--compact", "The first memory has not formed yet."),
      );
    }
  };

  const renderQuietHour = (view: TideweftUIView): void => {
    const quiet = view.quietHour;
    if (!quiet) {
      syncDialog(refs.quietDialog, forcedQuietHour ?? false);
      return;
    }
    refs.quietTitle.textContent = quiet.title ?? "Quiet Hour";
    refs.quietSummary.textContent = quiet.summary;
    refs.quietDuration.textContent = quiet.durationLabel;
    refs.quietDistance.textContent = quiet.distanceLabel;
    refs.quietDeliveries.textContent = String(quiet.deliveries);
    refs.quietStrands.textContent = quiet.strandLabel;
    refs.quietChanges.replaceChildren();
    for (const change of quiet.changes) {
      refs.quietChanges.append(createElement("li", "quiet-change-list__item", change));
    }
    refs.quietQuote.textContent = quiet.quote ?? "";
    refs.quietQuote.hidden = !quiet.quote;
    refs.quietFinish.disabled = quiet.canFinish === false;
    syncDialog(refs.quietDialog, forcedQuietHour ?? quiet.visible);
  };

  const update = (providedView?: TideweftUIView | null): void => {
    const view = providedView === undefined ? options.getView() ?? null : providedView;
    latestView = view;
    if (!view) {
      refs.shell.dataset.ready = "false";
      syncDialog(refs.titleDialog, forcedTitle ?? true);
      return;
    }
    refs.shell.dataset.ready = "true";
    const revision = String(view.revision);
    const isNewRevision = revision !== lastRevision;
    if (!isNewRevision) {
      syncDialog(refs.titleDialog, forcedTitle ?? view.title.visible);
      syncDialog(refs.quietDialog, forcedQuietHour ?? view.quietHour?.visible ?? false);
      return;
    }
    lastRevision = revision;

    refs.worldName.textContent = view.worldName;
    refs.location.textContent = view.player.locationLabel ?? `${view.posture} posture · ${view.sessionShape} session`;
    refs.clockDay.textContent = view.clock.dayLabel ?? `Day ${view.clock.day}`;
    refs.clockTime.textContent = view.clock.timeLabel;
    refs.tideReadout.dataset.phase = view.tide.phase;
    refs.tideSymbol.textContent = tideSymbol(view.tide.phase);
    refs.tideLabel.textContent = view.tide.label;
    refs.tideNext.textContent = view.tide.nextLabel ?? "The water is between turns";
    setProgress(refs.tideProgress, view.tide.progress, `${Math.round(clampUnit(view.tide.progress) * 100)} percent through ${view.tide.label}`);
    refs.weatherReadout.dataset.weather = view.weather.kind;
    refs.weatherSymbol.textContent = weatherSymbol(view.weather.kind);
    refs.weatherLabel.textContent = view.weather.label;
    refs.weatherForecast.textContent = view.weather.forecast ?? "No forecast carried";
    refs.weatherReadout.setAttribute(
      "aria-label",
      `${view.weather.label}, intensity ${Math.round(clampUnit(view.weather.intensity) * 100)} percent`,
    );
    setProgress(refs.stamina, view.player.stamina);
    setProgress(refs.stability, view.player.stability);
    refs.stabilityDetail.textContent = view.player.stabilityHint;
    refs.stabilityDetail.dataset.trend = view.player.stabilityTrend;
    setProgress(refs.scanCharge, view.player.scanCharge);
    const cargoRatio = view.player.cargoLoad / Math.max(1, view.player.cargoCapacity);
    setProgress(refs.cargo, cargoRatio, `${view.player.cargoLoad} of ${view.player.cargoCapacity}`);
    refs.cargoLabel.textContent = `${view.player.cargoLoad} / ${view.player.cargoCapacity}`;

    const objective = view.objective;
    refs.objectivePanel.hidden = !objective;
    if (objective) {
      refs.objectivePanel.dataset.completed = objective.completed ? "true" : "false";
      refs.objectiveEyebrow.textContent = objective.eyebrow ?? "Current thread";
      refs.objectiveTitle.textContent = objective.title;
      refs.objectiveDescription.textContent = objective.description;
      setProgress(refs.objectiveProgress, objective.progress, objective.progressLabel);
      refs.objectiveProgressLabel.textContent = objective.progressLabel;
      refs.objectiveWhy.textContent = objective.why ?? "";
      refs.objectiveWhy.hidden = !objective.why;
    }
    refs.choirLabel.textContent = view.choir.label;
    setProgress(refs.choirProgress, view.choir.progress, `${Math.round(view.choir.progress * 100)} percent of a harbor phrase`);
    refs.choirHint.textContent = view.choir.hint;
    refs.choirReadout.dataset.awake = view.choir.awakenedCount > 0 ? "true" : "false";
    refs.fieldTerrain.textContent = view.field.terrainLabel;
    refs.fieldDepth.textContent = view.field.depthLabel;
    refs.fieldDepth.dataset.known = view.field.depthKnown ? "true" : "false";
    refs.fieldEffort.textContent = view.field.effortLabel;
    refs.fieldTools.textContent = `FIELD KIT · ${view.field.toolLabels.join(" · ")}`;
    refs.fieldHint.textContent = view.field.hint;
    refs.fieldReadout.dataset.swept = view.field.swept ? "true" : "false";
    refs.fieldSweep.hidden = !view.field.swept;
    setProgress(refs.fieldSweep, view.field.sweptProgress, `${Math.round(view.field.sweptProgress * 100)} percent toward shore`);

    renderContracts(view.contracts);
    renderInspector(view.selectedSettlement);
    renderChronicle(view.chronicle);

    refs.pauseButton.textContent = view.clock.paused ? "Release tide" : "Hold tide";
    refs.pauseButton.append(createElement("kbd", "keycap", "P"));
    refs.pauseButton.setAttribute("aria-pressed", view.clock.paused ? "true" : "false");
    refs.pauseButton.disabled = view.controls?.canPause === false;
    refs.scanButton.disabled = view.controls?.canScan === false;
    refs.interactButton.disabled = view.controls?.canInteract === false;
    refs.interactButton.textContent = view.controls?.interactLabel ?? "Interact";
    refs.interactButton.append(createElement("kbd", "keycap", "E"));
    refs.interactButton.title = view.controls?.interactHint ?? "Interact with the current harbor";
    refs.quietButton.disabled = view.controls?.canEndSession === false;
    for (const [pace, button] of Object.entries(refs.paceButtons) as Array<[PaceView, HTMLButtonElement]>) {
      button.setAttribute("aria-pressed", pace === view.player.pace ? "true" : "false");
      button.disabled = view.controls?.canChangePace === false;
    }

    if (!titleFormDirty) {
      const postureInput = refs.postureInputs.find((input) => input.value === view.posture);
      const sessionInput = refs.sessionInputs.find((input) => input.value === view.sessionShape);
      if (postureInput) postureInput.checked = true;
      if (sessionInput) sessionInput.checked = true;
      if (view.title.suggestedSeed && document.activeElement !== refs.seedInput) {
        refs.seedInput.placeholder = view.title.suggestedSeed;
      }
    }
    refs.titleSubtitle.textContent =
      view.title.subtitle ??
      "Carry promises across a living estuary. Leave routes that learn to care for themselves.";
    refs.continueButton.hidden = !view.title.hasSave;
    refs.continueName.textContent = view.title.worldName ?? view.worldName;
    refs.continueSummary.textContent =
      view.title.continueSummary ?? "No offline loss. The tide waits exactly where you left it.";
    syncDialog(refs.titleDialog, forcedTitle ?? view.title.visible);
    renderQuietHour(view);

    const mastheadStatus = document.getElementById("connection-status");
    if (mastheadStatus) {
      mastheadStatus.textContent = view.clock.paused
        ? `${view.worldName} · tide held`
        : `${view.worldName} · ${view.tide.label.toLocaleLowerCase()}`;
    }
    if (view.announcement && view.announcement.id !== lastAnnouncement) {
      lastAnnouncement = view.announcement.id;
      announce(view.announcement.message, view.announcement.assertive);
    }
  };

  refs.pauseButton.addEventListener("click", () => options.dispatch({ type: "toggle-pause" }));
  refs.contractList.addEventListener("pointerdown", () => {
    contractPointerActive = true;
  });
  window.addEventListener("pointerup", releaseContractPointer);
  window.addEventListener("pointercancel", cancelContractPointer);
  refs.scanButton.addEventListener("click", () => options.dispatch({ type: "scan" }));
  refs.interactButton.addEventListener("click", () => options.dispatch({ type: "interact" }));
  refs.quietButton.addEventListener("click", () => options.dispatch({ type: "quiet-hour", action: "open" }));
  refs.titleButton.addEventListener("click", () => options.dispatch({ type: "open-title" }));
  refs.helpButton.addEventListener("click", () => syncDialog(refs.helpDialog, true));
  refs.helpClose.addEventListener("click", () => syncDialog(refs.helpDialog, false));
  refs.inspectorClose.addEventListener("click", () => {
    options.dispatch({
      type: "settlement",
      action: "close",
      ...(latestView?.selectedSettlement ? { settlementId: latestView.selectedSettlement.id } : {}),
    });
  });
  refs.inspectorFocus.addEventListener("click", () => {
    const settlementId = latestView?.selectedSettlement?.id;
    if (!settlementId) return;
    options.dispatch({ type: "settlement", action: "focus", settlementId });
  });
  for (const [pace, button] of Object.entries(refs.paceButtons) as Array<[PaceView, HTMLButtonElement]>) {
    button.addEventListener("click", () => options.dispatch({ type: "set-pace", pace }));
  }
  refs.continueButton.addEventListener("click", () => options.dispatch({ type: "resume-world" }));
  refs.newWorldForm.addEventListener("change", () => {
    titleFormDirty = true;
  });
  refs.newWorldForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const posture = refs.postureInputs.find((input) => input.checked)?.value as JourneyPosture | undefined;
    const sessionShape = refs.sessionInputs.find((input) => input.checked)?.value as SessionShape | undefined;
    options.dispatch({
      type: "new-world",
      seed: refs.seedInput.value.trim(),
      posture: posture ?? "journey",
      sessionShape: sessionShape ?? "weave",
    });
  });
  refs.titleDialog.addEventListener("cancel", (event) => {
    if (!latestView?.title.hasSave) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    options.dispatch({ type: "resume-world" });
  });
  refs.quietDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    options.dispatch({ type: "quiet-hour", action: "continue" });
  });
  refs.quietContinue.addEventListener("click", () => {
    options.dispatch({ type: "quiet-hour", action: "continue" });
  });
  refs.quietFinish.addEventListener("click", () => {
    options.dispatch({ type: "quiet-hour", action: "finish" });
  });

  const onGlobalKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return;
    }
    if ((event.key === "?" || (event.key === "/" && event.shiftKey)) && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      syncDialog(refs.helpDialog, true);
    }
  };
  document.addEventListener("keydown", onGlobalKeyDown);

  const frame = (): void => {
    if (!running) return;
    update();
    frameHandle = window.requestAnimationFrame(frame);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    frameHandle = window.requestAnimationFrame(frame);
  };

  const stop = (): void => {
    running = false;
    if (frameHandle !== null) window.cancelAnimationFrame(frameHandle);
    frameHandle = null;
  };

  update();
  if (options.autoStart !== false) start();

  return {
    update,
    start,
    stop,
    announce,
    setTitleVisible: (visible) => {
      forcedTitle = visible;
      syncDialog(refs.titleDialog, visible);
    },
    setQuietHourVisible: (visible) => {
      forcedQuietHour = visible;
      syncDialog(refs.quietDialog, visible);
    },
    openHelp: () => syncDialog(refs.helpDialog, true),
    closeHelp: () => syncDialog(refs.helpDialog, false),
    destroy: () => {
      stop();
      document.removeEventListener("keydown", onGlobalKeyDown);
      window.removeEventListener("pointerup", releaseContractPointer);
      window.removeEventListener("pointercancel", cancelContractPointer);
      syncDialog(refs.helpDialog, false);
      syncDialog(refs.quietDialog, false);
      syncDialog(refs.titleDialog, false);
      options.root.replaceChildren();
    },
  };
}
