import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SaveRecord, SaveRepository } from "../platform/persistence";
import { createTideweftRuntime } from "./runtime";

const soundscapePlay = vi.hoisted(() => vi.fn());
vi.mock("../audio/soundscape", () => ({
  TideweftSoundscape: class {
    async unlock(): Promise<void> {}
    play(...args: unknown[]): void { soundscapePlay(...args); }
    updateAmbience(): void {}
    destroy(): void {}
  },
}));

class MemoryRepository implements SaveRepository {
  async list() { return []; }
  async load(_slotId: string) { return undefined; }
  async save(_record: SaveRecord) {}
  async remove(_slotId: string) {}
}

const FRESH_START_RENDER_SEEDS = Object.freeze([
  "cluster report one",
  "cluster report two",
  "cluster report four",
  "start-density-audit-15",
]);

/**
 * The compatibility settlement is allowed to keep its real home animals near
 * the player. Wild regional residents still have to arrive through habitat and
 * the shared projection instead of treating the new-world camera as a spawn
 * point.
 */
const SETTLEMENT_HOME_SPECIES = new Set<string>([
  "domestic-cat",
  "domestic-chicken",
  "domestic-goat",
]);
const PLAYER_START_APERTURE_TILES = 2;
const MAX_DIRECT_START_ANIMALS = 8;
const MAX_DIRECT_START_SPECIES = 4;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fresh-world wildlife distribution", () => {
  it("keeps the start view sparse while allowing a tight settlement-home flock", async () => {
    for (const seed of FRESH_START_RENDER_SEEDS) {
      const runtime = await createTideweftRuntime(new MemoryRepository());
      try {
        runtime.dispatchUI({
          type: "new-world",
          seed,
          posture: "journey",
          sessionShape: "wander",
        });
        const view = runtime.getRenderView();
        const wildlife = view.wildlife ?? [];
        const distanceFromPlayerInTiles = (animal: (typeof wildlife)[number]): number => (
          Math.hypot(
            animal.position.x - view.player.position.x,
            animal.position.y - view.player.position.y,
          ) / view.terrain.tileSize
        );
        const summary = JSON.stringify({
          seed,
          wildlife: wildlife.map((animal) => ({
            distanceTiles: distanceFromPlayerInTiles(animal),
            species: animal.species,
          })),
        });
        const immediate = wildlife.filter((animal) => (
          distanceFromPlayerInTiles(animal) <= PLAYER_START_APERTURE_TILES
        ));

        expect(wildlife.length, summary).toBeLessThanOrEqual(MAX_DIRECT_START_ANIMALS);
        expect(new Set(wildlife.map(({ species }) => species)).size, summary)
          .toBeLessThanOrEqual(MAX_DIRECT_START_SPECIES);
        expect(immediate.every(({ species }) => SETTLEMENT_HOME_SPECIES.has(species)), summary)
          .toBe(true);
      } finally {
        runtime.destroy();
      }
    }
  }, 60_000);
});
