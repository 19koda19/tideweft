import { describe, expect, it, vi } from "vitest";

import { createPlayer } from "../game/player";
import { createSessionState } from "../game/sessionTypes";
import { projectUIView, signedReportJobId } from "../game/uiProjection";
import { createWorld, createWorldView } from "../sim/public";
import type { WorldView } from "../sim/types";
import {
  bindTitleRestartFlow,
  signedReportActionsSignature,
} from "./createTideweftUI";

class AuditForm extends EventTarget {
  hidden = false;
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class AuditInput extends EventTarget {
  value = "";
  placeholder = "Leave blank for quiet-delta";
  required = false;
  disabled = false;
  validationMessage = "";
  readonly attributes = new Map<string, string>();
  readonly focus = vi.fn();
  readonly select = vi.fn();
  readonly scrollIntoView = vi.fn();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  setCustomValidity(message: string): void {
    this.validationMessage = message;
  }
}

class AuditButton {
  disabled = false;
}

class AuditStatus {
  hidden = false;
  textContent = "";
}

function restartAuditHarness() {
  const restartForm = new AuditForm();
  const restartInput = new AuditInput();
  const restartButton = new AuditButton();
  const restartStatus = new AuditStatus();
  const newWorldForm = new AuditForm();
  const seedInput = new AuditInput();
  const seedStatus = new AuditStatus();
  const beginButton = new AuditButton();
  const dispatch = vi.fn();
  const title = {
    visible: false,
    hasSave: true,
    worldName: "Existing estuary",
  };
  const flow = bindTitleRestartFlow({
    elements: {
      restartForm: restartForm as unknown as HTMLFormElement,
      restartInput: restartInput as unknown as HTMLInputElement,
      restartButton: restartButton as unknown as HTMLButtonElement,
      restartStatus: restartStatus as unknown as HTMLElement,
      newWorldForm: newWorldForm as unknown as HTMLFormElement,
      seedInput: seedInput as unknown as HTMLInputElement,
      seedStatus: seedStatus as unknown as HTMLElement,
      beginButton: beginButton as unknown as HTMLButtonElement,
    },
    getTitle: () => title,
    dispatch,
    announce: vi.fn(),
  });
  return {
    title,
    flow,
    restartForm,
    restartInput,
    newWorldForm,
    seedInput,
    beginButton,
    dispatch,
  };
}

function reportActions(
  world: WorldView,
  player: ReturnType<typeof createPlayer>,
  session: ReturnType<typeof createSessionState>,
) {
  return projectUIView(world, player, session).selectedSettlement?.connections
    .filter((connection) => connection.settlementId && connection.reportActionLabel) ?? [];
}

describe("0.3.3-alpha.1 restart and signed-report release audit", () => {
  it("keeps restart authority exact, single-submit, retryable, and local to one title opening", () => {
    const audit = restartAuditHarness();
    audit.flow.sync(audit.title, true);

    for (const alias of [
      "RestartRestartRestart",
      " restartrestartrestart",
      "restartrestartrestart ",
      "restartrestart",
    ]) {
      audit.restartInput.value = alias;
      audit.restartInput.dispatchEvent(new Event("input"));
      audit.flow.sync({ ...audit.title }, true);
      audit.restartInput.dispatchEvent(new Event("change"));
      audit.restartForm.dispatchEvent(new Event("submit", { cancelable: true }));
      expect(audit.flow.unlocked).toBe(false);
      expect(audit.dispatch).not.toHaveBeenCalled();
    }

    audit.restartInput.value = "restartrestartrestart";
    audit.restartInput.dispatchEvent(new Event("input"));
    audit.flow.sync({ ...audit.title }, true);
    expect(audit.restartInput.value).toBe("restartrestartrestart");
    audit.restartInput.dispatchEvent(new Event("change"));
    expect(audit.flow.unlocked).toBe(true);

    audit.seedInput.value = "  copper rain  ";
    audit.seedInput.dispatchEvent(new Event("input"));
    audit.flow.sync({ ...audit.title }, true);
    audit.newWorldForm.dispatchEvent(new Event("submit", { cancelable: true }));
    audit.newWorldForm.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(audit.dispatch).toHaveBeenCalledTimes(1);
    expect(audit.dispatch).toHaveBeenLastCalledWith({
      type: "new-world",
      seed: "copper rain",
      posture: "gale",
      sessionShape: "wander",
      restartPhrase: "restartrestartrestart",
    });
    expect(audit.flow.submitting).toBe(true);
    expect(audit.beginButton.disabled).toBe(true);

    // A runtime rejection renders the still-open old title. Only that new
    // render releases the double-submit latch for a deliberate retry.
    audit.flow.sync({ ...audit.title }, true);
    expect(audit.flow.submitting).toBe(false);
    audit.newWorldForm.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(audit.dispatch).toHaveBeenCalledTimes(2);

    audit.flow.sync(audit.title, false);
    audit.flow.sync(audit.title, true);
    expect(audit.flow.unlocked).toBe(false);
    expect(audit.restartInput.value).toBe("");
    expect(audit.seedInput.value).toBe("");
    expect(audit.restartForm.hidden).toBe(false);
    expect(audit.newWorldForm.hidden).toBe(true);
  });

  it("projects one stable, correctly oriented action for every real report job", () => {
    const base = createWorldView(createWorld("hostile signed report audit"));
    const source = base.settlements[0];
    if (!source) throw new Error("missing report source");
    const duplicated: WorldView = {
      ...base,
      settlements: base.settlements.map((settlement) => settlement.id === source.id
        ? {
            ...settlement,
            trust: [...settlement.trust, ...settlement.trust]
              .reverse()
              .map((trust, index) => ({ ...trust, value: trust.value + index % 2 })),
          }
        : settlement),
    };
    const player = createPlayer(duplicated, source.id);
    const session = createSessionState(duplicated.seedText);
    session.tutorial.dismissed = true;
    session.selectedSettlementId = source.id;

    const first = reportActions(duplicated, player, session);
    const second = reportActions(duplicated, player, session);
    const jobIds = first.map((connection) => signedReportJobId(
      Number(connection.settlementId),
      source.id,
      Number(connection.id),
    ));

    expect(first).toEqual(second);
    expect(first).toHaveLength(new Set(source.trust.map(({ settlementId }) => settlementId)).size);
    expect(new Set(jobIds).size).toBe(jobIds.length);
    expect(first.every((connection) => connection.settlementId === String(source.id))).toBe(true);
    expect(first.every((connection) => connection.id !== String(source.id))).toBe(true);
    expect(first.every((connection) => connection.reportActionLabel?.includes(source.name))).toBe(true);
    expect(first.every((connection) => connection.reportActionLabel?.includes(connection.settlementName))).toBe(true);
    expect(signedReportActionsSignature({
      id: String(source.id),
      name: source.name,
      connections: first,
    })).toBe(signedReportActionsSignature({
      id: String(source.id),
      name: source.name,
      connections: second,
    }));

    const remote = duplicated.settlements[1];
    const remoteTile = remote ? duplicated.terrain.tiles[remote.tileIndex] : undefined;
    if (!remoteTile) throw new Error("missing remote report audit tile");
    player.x = remoteTile.x * 1_000 + 500;
    player.y = remoteTile.y * 1_000 + 500;
    const remoteActions = reportActions(duplicated, player, session);
    expect(remoteActions.map((connection) => connection.id)).toEqual(first.map((connection) => connection.id));
    expect(remoteActions.every((connection) => connection.reportActionDisabled)).toBe(true);
    expect(remoteActions.every((connection) => connection.reportActionHint?.includes("remote inspection cannot create")))
      .toBe(true);
  });
});
