export interface P5RuntimePolicyTarget {
  disableFriendlyErrors: boolean;
}

/**
 * p5's Friendly Error System validates every public drawing call before still
 * forwarding the original arguments to the renderer. That is useful while
 * authoring, but the repeated schema parsing is pure diagnostic work in a
 * production frame. Keep it available in development and remove only that
 * observer from optimized builds; p5 rendering and ordinary thrown errors
 * remain authoritative.
 */
export function configureP5RuntimePolicy(
  target: P5RuntimePolicyTarget,
  production: boolean,
): void {
  if (production) target.disableFriendlyErrors = true;
}
