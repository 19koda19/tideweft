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

/**
 * p5 2.3.2's object-form Shader.modify restores a flag captured when its
 * Strands addon loaded, which can undo our later production policy. Keep the
 * public application policy across that operation, including shader failure.
 * Recheck this boundary when upgrading p5; no library source is patched.
 */
export function preserveP5RuntimePolicy<T>(
  target: P5RuntimePolicyTarget,
  operation: () => T,
): T {
  const disabled = target.disableFriendlyErrors;
  try {
    return operation();
  } finally {
    target.disableFriendlyErrors = disabled;
  }
}
