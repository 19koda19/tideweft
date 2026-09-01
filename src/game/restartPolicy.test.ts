import { describe, expect, it } from "vitest";

import { acceptsRestartPhrase, RESTART_PHRASE } from "./restartPolicy";

describe("saved-world restart gate", () => {
  it("accepts only the complete case-sensitive phrase", () => {
    expect(acceptsRestartPhrase(RESTART_PHRASE)).toBe(true);
    expect(acceptsRestartPhrase(`  ${RESTART_PHRASE}\n`)).toBe(false);
    expect(acceptsRestartPhrase("restartrestart")).toBe(false);
    expect(acceptsRestartPhrase("RestartRestartRestart")).toBe(false);
    expect(acceptsRestartPhrase(`${RESTART_PHRASE}!`)).toBe(false);
    expect(acceptsRestartPhrase("")).toBe(false);
  });
});
