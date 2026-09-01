import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import { createPlayer } from "./player";
import {
  createTutorialState,
  tutorialObjective,
  updateTutorial,
} from "./tutorial";

describe("first-journey tutorial", () => {
  it("advances one observable action at a time through the complete reward loop", () => {
    const player = createPlayer(createWorldView(createWorld("tutorial fixture")));
    const tutorial = createTutorialState();

    expect(tutorialObjective(tutorial, player)).toMatchObject({
      id: "tutorial-move",
      progress: 0.25,
    });
    expect(updateTutorial(tutorial, player)).toBe(false);

    player.currentTrace = [1, 2, 3, 4];
    expect(updateTutorial(tutorial, player)).toBe(true);
    expect(tutorial.stage).toBe("scan");
    expect(updateTutorial(tutorial, player)).toBe(false);

    tutorial.scansUsed += 1;
    expect(updateTutorial(tutorial, player)).toBe(true);
    expect(tutorial.stage).toBe("promise");

    tutorial.acceptedPromises += 1;
    player.activeContractId = 99;
    expect(updateTutorial(tutorial, player)).toBe(true);
    expect(tutorial.stage).toBe("travel");
    expect(tutorialObjective(tutorial, player)?.id).toBe("tutorial-travel");

    player.completedJourneys += 1;
    player.activeContractId = null;
    expect(updateTutorial(tutorial, player)).toBe(true);
    expect(tutorial.stage).toBe("witness");

    tutorial.witnessedChanges += 1;
    expect(updateTutorial(tutorial, player)).toBe(true);
    expect(tutorial.stage).toBe("complete");
    expect(tutorialObjective(tutorial, player)).toBeUndefined();
    expect(updateTutorial(tutorial, player)).toBe(false);
  });

  it("offers an alternate active-contract transition and honors dismissal", () => {
    const player = createPlayer(createWorldView(createWorld("tutorial dismissal fixture")));
    const tutorial = createTutorialState();
    tutorial.stage = "promise";
    player.activeContractId = 701;

    expect(updateTutorial(tutorial, player)).toBe(true);
    expect(tutorial.stage).toBe("travel");
    tutorial.dismissed = true;
    expect(tutorialObjective(tutorial, player)).toBeUndefined();
  });
});
