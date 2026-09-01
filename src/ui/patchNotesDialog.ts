import {
  PATCH_NOTE_CATEGORIES,
  PATCH_NOTE_CATEGORY_LABELS,
  TIDEWEFT_PATCH_NOTES,
  type PatchNoteRelease,
  type PatchNotesDocument,
} from "../content/patchNotes";

export const PATCH_NOTES_DIALOG_ID = "tideweft-patch-notes";
export const PATCH_NOTES_SCROLL_REGION_ID = "tideweft-patch-notes-scroll";
export const PATCH_NOTES_MINIMUM_TARGET_CSS_PIXELS = 44;

export type PatchNotesOpenSource = "title" | "quiet-hour" | "tutorial" | "field";

export interface PatchNotesDialogOptions {
  readonly notes?: PatchNotesDocument;
  /** Called before showModal so another native modal can yield without mutating game state. */
  readonly beforeOpen?: (source: PatchNotesOpenSource) => void;
  /** Called before trigger focus is restored, allowing the source modal to reopen first. */
  readonly afterClose?: (source: PatchNotesOpenSource) => void;
  readonly onOpenChange?: (open: boolean) => void;
}

export interface PatchNotesDialogController {
  readonly element: HTMLDialogElement;
  readonly open: (trigger?: HTMLElement | null, source?: PatchNotesOpenSource) => void;
  readonly close: (restoreFocus?: boolean) => void;
  readonly isOpen: () => boolean;
  readonly openSource: () => PatchNotesOpenSource | null;
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

const button = (className: string, text: string, label: string): HTMLButtonElement => {
  const node = element("button", className, text);
  node.type = "button";
  node.setAttribute("aria-label", label);
  return node;
};

const canReceiveFocus = (value: unknown): value is HTMLElement =>
  typeof value === "object"
  && value !== null
  && "focus" in value
  && typeof (value as { focus?: unknown }).focus === "function";

function appendRelease(
  target: HTMLElement,
  release: PatchNoteRelease,
  newest: boolean,
): void {
  const article = element("article", "patch-release");
  article.dataset.version = release.version;
  article.dataset.buildIdentity = release.buildIdentity;
  if (newest) article.dataset.latest = "true";

  const header = element("header", "patch-release__header");
  const headingCopy = element("div", "patch-release__heading-copy");
  const version = element("h3", "patch-release__version", release.version);
  if (newest) version.append(element("span", "patch-release__latest", "NEWEST"));
  const meta = element(
    "p",
    "patch-release__meta",
    `${release.releaseDate} · BUILD ${release.buildIdentity} · RULES ${release.gameplayContractVersion} · TUTORIAL ${release.tutorialVersion}`,
  );
  headingCopy.append(version, meta);
  header.append(headingCopy);
  article.append(header, element("p", "patch-release__summary", release.summary));

  const categories = element("div", "patch-release__categories");
  for (const category of PATCH_NOTE_CATEGORIES) {
    const section = element("section", "patch-category");
    section.dataset.category = category;
    section.append(element("h4", "patch-category__title", PATCH_NOTE_CATEGORY_LABELS[category]));
    const entries = release.categories[category];
    if (entries.length === 0) {
      section.append(element("p", "patch-category__empty", "None recorded for this release."));
    } else {
      const list = element("ul", "patch-category__list");
      for (const entry of entries) list.append(element("li", "patch-category__item", entry));
      section.append(list);
    }
    categories.append(section);
  }
  article.append(categories);
  target.append(article);
}

/**
 * One offline, native modal sourced directly from the canonical release data.
 * It owns presentation only: open, cancel, and close dispatch no game command.
 */
export function createPatchNotesDialog(
  options: PatchNotesDialogOptions = {},
): PatchNotesDialogController {
  const notes = options.notes ?? TIDEWEFT_PATCH_NOTES;
  const dialog = element("dialog", "patch-notes-dialog estuary-dialog");
  dialog.id = PATCH_NOTES_DIALOG_ID;
  dialog.setAttribute("aria-labelledby", "patch-notes-heading");
  dialog.setAttribute("aria-describedby", "patch-notes-subtitle");
  dialog.dataset.pausesWorld = "false";
  dialog.dataset.latestVersion = notes.releases[0]?.version ?? "none";
  dialog.dataset.latestBuild = notes.releases[0]?.buildIdentity ?? "none";

  const content = element("div", "patch-notes-dialog__content");
  const header = element("header", "patch-notes-dialog__header");
  const headingCopy = element("div", "patch-notes-dialog__heading-copy");
  headingCopy.append(element("p", "patch-notes-dialog__eyebrow", "OFFLINE BUILD LEDGER"));
  const heading = element("h2", "patch-notes-dialog__title", "PATCH NOTES");
  heading.id = "patch-notes-heading";
  const subtitle = element(
    "p",
    "patch-notes-dialog__subtitle",
    "What changed, what migrated, and what is honestly not live yet.",
  );
  subtitle.id = "patch-notes-subtitle";
  headingCopy.append(heading, subtitle);
  const closeButton = button(
    "patch-notes-dialog__close",
    "×",
    "Close Patch Notes and return to the previous screen",
  );
  closeButton.dataset.patchAction = "close";
  header.append(headingCopy, closeButton);

  const scroll = element("div", "patch-notes-dialog__scroll");
  scroll.id = PATCH_NOTES_SCROLL_REGION_ID;
  scroll.tabIndex = 0;
  scroll.setAttribute("aria-label", "Patch Notes, newest release first; scroll for earlier releases");
  notes.releases.forEach((release, index) => appendRelease(scroll, release, index === 0));
  content.append(header, scroll);
  dialog.append(content);

  let returnFocus: HTMLElement | null = null;
  let source: PatchNotesOpenSource | null = null;
  let restoreOnClose = true;
  let destroyed = false;

  const open = (
    trigger?: HTMLElement | null,
    requestedSource: PatchNotesOpenSource = "field",
  ): void => {
    if (destroyed) return;
    if (dialog.open) {
      closeButton.focus({ preventScroll: true });
      return;
    }
    const active = document.activeElement;
    returnFocus = trigger ?? (canReceiveFocus(active) ? active : null);
    source = requestedSource;
    dialog.dataset.openSource = requestedSource;
    options.beforeOpen?.(requestedSource);
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute("open", "");
    }
    options.onOpenChange?.(true);
    closeButton.focus({ preventScroll: true });
  };

  const close = (restoreFocus = true): void => {
    restoreOnClose = restoreFocus;
    if (dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
        dialog.dispatchEvent(new Event("close"));
      }
    }
  };

  closeButton.addEventListener("click", () => close());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", () => {
    const closedSource = source;
    const target = returnFocus;
    const shouldRestore = restoreOnClose;
    source = null;
    returnFocus = null;
    restoreOnClose = true;
    delete dialog.dataset.openSource;
    options.onOpenChange?.(false);
    if (closedSource) options.afterClose?.(closedSource);
    if (shouldRestore && target?.isConnected) target.focus({ preventScroll: true });
  });

  return {
    element: dialog,
    open,
    close,
    isOpen: () => dialog.open,
    openSource: () => source,
    destroy: () => {
      destroyed = true;
      source = null;
      returnFocus = null;
      restoreOnClose = false;
      if (dialog.open) dialog.close();
    },
  };
}
