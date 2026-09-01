import {
  TIDEWEFT_TUTORIAL_GUIDE,
  tutorialControlById,
  tutorialSectionsForAudience,
  type TutorialAudience,
  type TutorialGuideSection,
  type TutorialSectionId,
} from "./tutorialGuide";

const COMPACT_TUTORIAL_QUERY = "(max-width: 44rem), (max-height: 34rem) and (max-width: 64rem)";

export interface TutorialDialogController {
  readonly element: HTMLDialogElement;
  readonly open: (trigger?: HTMLElement | null) => void;
  readonly close: () => void;
  readonly toggle: (trigger?: HTMLElement | null) => void;
  readonly next: () => void;
  readonly previous: () => void;
  readonly pageId: () => TutorialSectionId;
  readonly destroy: () => void;
}

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

const activeAudience = (): Exclude<TutorialAudience, "all"> => {
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(COMPACT_TUTORIAL_QUERY).matches ? "mobile" : "desktop";
  }
  return window.innerWidth <= 704 ? "mobile" : "desktop";
};

/**
 * Builds one modal field manual shared by desktop and mobile. It owns only
 * presentation state: opening it never mutates, pauses, or saves the world.
 */
export function createTutorialDialog(): TutorialDialogController {
  const dialog = element("dialog", "tutorial-dialog estuary-dialog");
  dialog.id = "tideweft-tutorial";
  dialog.setAttribute("aria-labelledby", "tutorial-dialog-heading");
  dialog.setAttribute("aria-describedby", "tutorial-dialog-subtitle");

  const content = element("div", "tutorial-dialog__content");
  const header = element("header", "tutorial-dialog__header");
  const headingCopy = element("div", "tutorial-dialog__heading-copy");
  const eyebrow = element("p", "tutorial-dialog__eyebrow", "FIELD MANUAL · LIVE RULES");
  const heading = element("h2", "tutorial-dialog__title", TIDEWEFT_TUTORIAL_GUIDE.title);
  heading.id = "tutorial-dialog-heading";
  const subtitle = element("p", "tutorial-dialog__subtitle", TIDEWEFT_TUTORIAL_GUIDE.subtitle);
  subtitle.id = "tutorial-dialog-subtitle";
  headingCopy.append(eyebrow, heading, subtitle);
  const closeButton = button("tutorial-dialog__close", "×", "Close tutorial and return to play");
  closeButton.dataset.tutorialAction = "close";
  header.append(headingCopy, closeButton);

  const layout = element("div", "tutorial-dialog__layout");
  const topicNav = element("nav", "tutorial-dialog__topics");
  topicNav.setAttribute("aria-label", "Tutorial topics");
  const topicList = element("ol", "tutorial-topic-list");
  topicNav.append(topicList);

  const page = element("article", "tutorial-page");
  page.tabIndex = -1;
  const pageMeta = element("p", "tutorial-page__meta");
  pageMeta.setAttribute("aria-live", "polite");
  const pageHeading = element("h3", "tutorial-page__title");
  pageHeading.tabIndex = -1;
  const pageSummary = element("p", "tutorial-page__summary");
  const controlHeading = element("h4", "tutorial-page__section-title", "CONTROLS HERE");
  const controlList = element("dl", "tutorial-control-list");
  const stepHeading = element("h4", "tutorial-page__section-title", "HOW IT WORKS");
  const stepList = element("ol", "tutorial-step-list");
  const calloutList = element("div", "tutorial-callout-list");
  const plannedHeading = element("h4", "tutorial-page__section-title", "PLANNED · NOT ACTIVE YET");
  const plannedList = element("ul", "tutorial-planned-list");
  page.append(
    pageMeta,
    pageHeading,
    pageSummary,
    controlHeading,
    controlList,
    stepHeading,
    stepList,
    calloutList,
    plannedHeading,
    plannedList,
  );
  layout.append(topicNav, page);

  const footer = element("footer", "tutorial-dialog__footer");
  const previousButton = button("tutorial-page-button", "← PREVIOUS", "Previous tutorial page");
  previousButton.dataset.tutorialAction = "previous";
  const footerPosition = element("span", "tutorial-dialog__position", "01 / 13");
  const nextButton = button("tutorial-page-button tutorial-page-button--next", "NEXT →", "Next tutorial page");
  nextButton.dataset.tutorialAction = "next";
  footer.append(previousButton, footerPosition, nextButton);
  content.append(header, layout, footer);
  dialog.append(content);

  let audience = activeAudience();
  let sections = tutorialSectionsForAudience(audience);
  let activeIndex = 0;
  let returnFocus: HTMLElement | null = null;
  let destroyed = false;

  const currentSection = (): TutorialGuideSection =>
    sections[activeIndex] ?? sections[0] ?? TIDEWEFT_TUTORIAL_GUIDE.sections[0]!;

  const renderTopics = (): void => {
    topicList.replaceChildren();
    sections.forEach((section, index) => {
      const item = element("li", "tutorial-topic-list__item");
      const topic = button(
        "tutorial-topic-button",
        "",
        `Open tutorial topic ${index + 1}: ${section.title}`,
      );
      topic.dataset.tutorialTopic = section.id;
      topic.setAttribute("aria-current", index === activeIndex ? "page" : "false");
      topic.append(
        element("span", "tutorial-topic-button__number", section.iconText),
        element("span", "tutorial-topic-button__label", section.shortTitle),
      );
      topic.addEventListener("click", () => setPage(index, true));
      item.append(topic);
      topicList.append(item);
    });
  };

  const renderControls = (section: TutorialGuideSection): void => {
    controlList.replaceChildren();
    for (const id of section.controlIds) {
      const control = tutorialControlById(id);
      if (!control || (control.audience !== "all" && control.audience !== audience)) continue;
      const row = element("div", "tutorial-control");
      const term = element("dt", "tutorial-control__input");
      term.append(element("kbd", "keycap", control.input));
      const definition = element("dd", "tutorial-control__definition");
      definition.append(element("strong", "tutorial-control__action", control.action));
      if (control.detail) definition.append(element("span", "tutorial-control__detail", control.detail));
      row.append(term, definition);
      controlList.append(row);
    }
    const hasControls = controlList.childElementCount > 0;
    controlHeading.hidden = !hasControls;
    controlList.hidden = !hasControls;
  };

  const renderSteps = (section: TutorialGuideSection): void => {
    stepList.replaceChildren();
    section.steps.forEach((step, index) => {
      const item = element("li", "tutorial-step");
      const marker = element("span", "tutorial-step__number", String(index + 1).padStart(2, "0"));
      const copy = element("div", "tutorial-step__copy");
      copy.append(
        element("h5", "tutorial-step__title", step.title),
        element("p", "tutorial-step__body", step.body),
      );
      item.append(marker, copy);
      stepList.append(item);
    });
  };

  const renderCallouts = (section: TutorialGuideSection): void => {
    calloutList.replaceChildren();
    for (const callout of section.callouts) {
      const aside = element("aside", "tutorial-callout");
      aside.dataset.tone = callout.tone;
      aside.append(
        element("strong", "tutorial-callout__title", callout.title),
        element("p", "tutorial-callout__body", callout.body),
      );
      calloutList.append(aside);
    }
    calloutList.hidden = calloutList.childElementCount === 0;
  };

  const renderPlanned = (section: TutorialGuideSection): void => {
    plannedList.replaceChildren();
    if (section.id === "build-boundaries") {
      for (const mechanic of TIDEWEFT_TUTORIAL_GUIDE.plannedMechanics) {
        const item = element("li", "tutorial-planned-item");
        item.append(
          element("strong", "tutorial-planned-item__title", mechanic.title),
          element("span", "tutorial-planned-item__copy", mechanic.clarification),
        );
        plannedList.append(item);
      }
    }
    const visible = plannedList.childElementCount > 0;
    plannedHeading.hidden = !visible;
    plannedList.hidden = !visible;
  };

  const renderPage = (focusHeading = false): void => {
    const section = currentSection();
    dialog.dataset.tutorialAudience = audience;
    dialog.dataset.tutorialPage = section.id;
    pageMeta.textContent = `PAGE ${String(activeIndex + 1).padStart(2, "0")} / ${String(sections.length).padStart(2, "0")} · ${audience === "mobile" ? "TOUCH" : "DESKTOP"}`;
    footerPosition.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(sections.length).padStart(2, "0")}`;
    pageHeading.textContent = section.title;
    pageSummary.textContent = section.summary;
    renderControls(section);
    renderSteps(section);
    renderCallouts(section);
    renderPlanned(section);
    previousButton.disabled = activeIndex === 0;
    nextButton.disabled = activeIndex >= sections.length - 1;
    renderTopics();
    page.scrollTop = 0;
    if (focusHeading) pageHeading.focus({ preventScroll: true });
  };

  function setPage(index: number, focusHeading = false): void {
    activeIndex = Math.max(0, Math.min(sections.length - 1, Math.trunc(index)));
    renderPage(focusHeading);
  }

  const refreshAudience = (): void => {
    const nextAudience = activeAudience();
    if (nextAudience === audience) return;
    const activeId = currentSection().id;
    audience = nextAudience;
    sections = tutorialSectionsForAudience(audience);
    activeIndex = Math.max(0, sections.findIndex((section) => section.id === activeId));
    renderPage(false);
  };

  const open = (trigger?: HTMLElement | null): void => {
    if (destroyed) return;
    returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    refreshAudience();
    renderPage(false);
    if (!dialog.open) dialog.showModal();
    closeButton.focus({ preventScroll: true });
  };

  const close = (): void => {
    if (dialog.open) dialog.close();
  };

  const toggle = (trigger?: HTMLElement | null): void => {
    if (dialog.open) close();
    else open(trigger);
  };

  previousButton.addEventListener("click", () => setPage(activeIndex - 1, true));
  nextButton.addEventListener("click", () => setPage(activeIndex + 1, true));
  closeButton.addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", () => {
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  });
  window.addEventListener("resize", refreshAudience);
  renderPage(false);

  return {
    element: dialog,
    open,
    close,
    toggle,
    next: () => setPage(activeIndex + 1, true),
    previous: () => setPage(activeIndex - 1, true),
    pageId: () => currentSection().id,
    destroy: () => {
      destroyed = true;
      window.removeEventListener("resize", refreshAudience);
      returnFocus = null;
      if (dialog.open) dialog.close();
    },
  };
}
