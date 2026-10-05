import type { AnimalCallTextMode } from "../render/animalCallText";

export interface AnimalCallTextControlOptions {
  readonly getMode: () => AnimalCallTextMode;
  readonly setMode: (mode: AnimalCallTextMode) => void;
}

/** One native toggle; it has no runtime command, save, or audio receiver. */
export function bindAnimalCallTextControl(button: HTMLButtonElement, options: AnimalCallTextControlOptions): {
  readonly destroy: () => void;
} {
  const update = (): void => {
    const important = options.getMode() === "important";
    button.textContent = important ? "ANIMAL LABELS · IMPORTANT" : "ANIMAL LABELS · FULL";
    button.setAttribute("aria-label", "Reduce noncritical animal call labels");
    button.setAttribute("aria-pressed", String(important));
  };
  const onClick = (): void => {
    options.setMode(options.getMode() === "important" ? "full" : "important");
    update();
  };
  update();
  button.addEventListener("click", onClick);
  return Object.freeze({ destroy: () => button.removeEventListener("click", onClick) });
}
