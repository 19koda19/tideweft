import "./styles.css";

import { createTideweftRuntime } from "./game/runtime";
import { createTideweftRenderer } from "./render/p5Sketch";
import { createTideweftUI } from "./ui";

async function boot(): Promise<void> {
  const canvasMount = document.querySelector<HTMLElement>("#p5-mount");
  const uiRoot = document.querySelector<HTMLElement>("#game-ui");
  const announcer = document.querySelector<HTMLElement>("#announcer");
  const status = document.querySelector<HTMLElement>("#connection-status");
  if (!canvasMount || !uiRoot) throw new Error("TIDEWEFT could not find its application mount points.");

  status?.setAttribute("data-state", "loading");
  if (status) status.textContent = "The estuary is taking shape";

  const runtime = await createTideweftRuntime();
  const renderer = createTideweftRenderer({
    mount: canvasMount,
    getView: runtime.getRenderView,
    dispatch: runtime.dispatchRenderer,
  });
  const ui = createTideweftUI({
    root: uiRoot,
    getView: runtime.getUIView,
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
    void runtime.save();
    runtime.destroy();
    renderer.destroy();
    ui.destroy();
  };
  window.addEventListener("pagehide", shutdown, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void runtime.save();
  });

  Object.assign(window, {
    __TIDEWEFT__: {
      runtime,
      renderer,
      ui,
      version: "0.1.0",
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
