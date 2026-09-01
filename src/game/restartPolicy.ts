/**
 * Deliberately awkward phrase required before an existing autosave can be
 * replaced. Accepting it is only authorization: the new seed must still be
 * submitted separately before the world changes.
 */
export const RESTART_PHRASE = "restartrestartrestart";

export function acceptsRestartPhrase(value: string): boolean {
  return value === RESTART_PHRASE;
}
