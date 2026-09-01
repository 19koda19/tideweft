import "./styles.css";

import {
  GAMEPLAY_CONTRACT_ID,
  GAMEPLAY_CONTRACT_NAME,
  GAMEPLAY_CONTRACT_VERSION,
} from "./content/gameplayContract";
import { LATEST_PATCH_NOTE } from "./content/patchNotes";
import { createTideweftRuntime } from "./game/runtime";
import { createTideweftRenderer } from "./render/renderer";
import type { RendererCommand } from "./render/types";
import {
  resolveInitialViewMode,
  saveViewMode,
  viewModeButtonState,
  type ViewMode,
} from "./render/viewMode";
import { createTideweftUI } from "./ui";
import { createBraceSourceController } from "./ui/braceSources";
import { bindDesktopBraceHold } from "./ui/desktopBrace";

async function boot(): Promise<void> {
  const canvasMount = document.querySelector<HTMLElement>("#p5-mount");
  const uiRoot = document.querySelector<HTMLElement>("#game-ui");
  const announcer = document.querySelector<HTMLElement>("#announcer");
  const status = document.querySelector<HTMLElement>("#connection-status");
  const viewToggle = document.querySelector<HTMLButtonElement>("#view-mode-toggle");
  if (!canvasMount || !uiRoot) throw new Error("TIDEWEFT could not find its application mount points.");

  status?.setAttribute("data-state", "loading");
  if (status) status.textContent = "The estuary is taking shape";

  const runtime = await createTideweftRuntime();
  const syncViewToggle = (mode: ViewMode, reliefAvailable: boolean): void => {
    if (!viewToggle) return;
    const state = viewModeButtonState(mode, reliefAvailable);
    viewToggle.dataset.viewMode = state.mode;
    viewToggle.setAttribute("aria-pressed", String(state.ariaPressed));
    viewToggle.setAttribute("aria-disabled", String(!reliefAvailable));
    viewToggle.disabled = !reliefAvailable;
    viewToggle.setAttribute(
      "aria-label",
      `Current view: ${state.currentLabel}. ${state.nextAction}.`,
    );
    viewToggle.title = `${state.currentLabel} · ${state.nextAction}`;
    const current = viewToggle.querySelector<HTMLElement>("[data-view-mode-current]");
    const next = viewToggle.querySelector<HTMLElement>("[data-view-mode-next]");
    if (current) current.textContent = state.currentLabel;
    if (next) next.textContent = state.nextAction;
  };

  const braceSources = createBraceSourceController((active) => {
    runtime.dispatchRenderer({ type: "brace", active });
  });
  const dispatchRenderer = (command: RendererCommand): void => {
    if (command.type === "brace") {
      braceSources.set("renderer", command.active);
      return;
    }
    runtime.dispatchRenderer(command);
  };
  const renderer = createTideweftRenderer({
    mount: canvasMount,
    getView: runtime.getRenderView,
    dispatch: dispatchRenderer,
    onModeChange: syncViewToggle,
    onReliefUnavailable: (reason) => {
      console.warn(`Relief view unavailable: ${reason}`);
    },
  });
  const initialViewMode = resolveInitialViewMode({
    webglAvailable: renderer.reliefSupported(),
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  renderer.setMode(initialViewMode);

  const switchViewMode = (): void => {
    const mode = renderer.toggleMode();
    saveViewMode(mode);
    requestAnimationFrame(() => renderer.canvas()?.focus({ preventScroll: true }));
  };
  const onViewToggle = (): void => switchViewMode();
  const onViewShortcut = (event: KeyboardEvent): void => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || (target instanceof HTMLElement && target.isContentEditable);
    if (event.code !== "KeyV" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || editing) return;
    event.preventDefault();
    switchViewMode();
  };
  viewToggle?.addEventListener("click", onViewToggle);
  window.addEventListener("keydown", onViewShortcut);
  const desktopBrace = bindDesktopBraceHold({
    windowTarget: window,
    documentTarget: document,
    onBraceChange: (active) => braceSources.set("desktop-global", active),
    canActivate: () => {
      const view = runtime.getUIView();
      return !view.title.visible
        && view.quietHour?.visible !== true
        && document.querySelector("dialog[open]") === null;
    },
  });
  const ui = createTideweftUI({
    root: uiRoot,
    getView: runtime.getUIView,
    setBrace: (active) => braceSources.set("touch", active),
    dispatch: (command) => {
      runtime.dispatchUI(command);
      const returnsToPlay = command.type === "resume-world"
        || command.type === "new-world"
        || (command.type === "quiet-hour" && command.action === "continue");
      if (returnsToPlay) {
        requestAnimationFrame(() => renderer.canvas()?.focus({ preventScroll: true }));
      }
    },
    ...(announcer ? { announcer } : {}),
  });
  runtime.setFocusHandler(renderer.focusWorld);
  runtime.start();

  status?.setAttribute("data-state", "ready");
  if (status) status.textContent = "The estuary is listening";

  const shutdown = (): void => {
    void runtime.save().catch(() => undefined);
    // Leaf renderers release held movement/brace state through the runtime.
    // Tear them down before closing audio so that release cannot reopen an
    // AudioContext during pagehide.
    renderer.destroy();
    desktopBrace.destroy();
    ui.destroy();
    braceSources.destroy();
    runtime.destroy();
    viewToggle?.removeEventListener("click", onViewToggle);
    window.removeEventListener("keydown", onViewShortcut);
  };
  window.addEventListener("pagehide", shutdown, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void runtime.save().catch(() => undefined);
  });

  Object.assign(window, {
    __TIDEWEFT__: {
      runtime,
      renderer,
      ui,
      get viewMode() {
        return renderer.mode();
      },
      version: LATEST_PATCH_NOTE.version,
      buildIdentity: LATEST_PATCH_NOTE.buildIdentity,
      gameplayContract: {
        id: GAMEPLAY_CONTRACT_ID,
        name: GAMEPLAY_CONTRACT_NAME,
        version: GAMEPLAY_CONTRACT_VERSION,
      },
    },
  });
}

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const status = document.querySelector<HTMLElement>("#connection-status");
  if (status) {
    status.textContent = `The estuary could not open: ${message}`;
    status.setAttribute("data-state", "error");
  }
  console.error(error);
});
