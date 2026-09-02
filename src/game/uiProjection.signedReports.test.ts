import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import type { WorldView } from "../sim/types";
import { signedReportActionsSignature } from "../ui/createTideweftUI";
import { createPlayer, type PlayerState } from "./player";
import { createSessionState, type GameSessionState } from "./sessionTypes";
import { projectUIView, signedReportJobId } from "./uiProjection";

interface ReportFixture {
  readonly economy: WorldView;
  readonly source: WorldView["settlements"][number];
  readonly player: PlayerState;
  readonly session: GameSessionState;
}

function reportFixture(seed = "one clear signed report per journey"): ReportFixture {
  const economy = createWorldView(createWorld(seed));
  const source = economy.settlements[0];
  if (!source) throw new Error("missing signed-report source fixture");
  const player = createPlayer(economy, source.id);
  const session = createSessionState(economy.seedText);
  session.tutorial.dismissed = true;
  session.selectedSettlementId = source.id;
  return { economy, source, player, session };
}

function reportConnections(
  economy: WorldView,
  player: PlayerState,
  session: GameSessionState,
) {
  return projectUIView(economy, player, session).selectedSettlement?.connections
    .filter((connection) => connection.settlementId && connection.reportActionLabel) ?? [];
}

function projectedJobIds(
  sourceId: number,
  connections: ReturnType<typeof reportConnections>,
): readonly string[] {
  return connections.map((connection) => signedReportJobId(
    Number(connection.settlementId),
    sourceId,
    Number(connection.id),
  ));
}

describe("signed-report menu projection", () => {
  it("is repeatable and independent of authoritative trust/fact array order", () => {
    const { economy, source, player, session } = reportFixture();
    const beforeSource = structuredClone(source);
    const first = reportConnections(economy, player, session);
    const repeated = reportConnections(economy, player, session);
    const reordered: WorldView = {
      ...economy,
      settlements: economy.settlements.map((settlement) => settlement.id === source.id
        ? {
            ...settlement,
            trust: [...settlement.trust].reverse(),
            knowledge: [...settlement.knowledge].reverse(),
          }
        : settlement),
    };
    const afterReorder = reportConnections(reordered, player, session);

    expect(repeated).toEqual(first);
    expect(afterReorder).toEqual(first);
    expect(signedReportActionsSignature({
      id: String(source.id),
      name: source.name,
      connections: afterReorder,
    })).toBe(signedReportActionsSignature({
      id: String(source.id),
      name: source.name,
      connections: first,
    }));
    expect(projectedJobIds(source.id, repeated)).toEqual(projectedJobIds(source.id, first));
    expect(new Set(projectedJobIds(source.id, first)).size).toBe(first.length);
    expect(source).toEqual(beforeSource);
  });

  it("collapses exact duplicate input to one source-subject-recipient job", () => {
    const { economy, source, player, session } = reportFixture("duplicate report facts stay singular");
    const baseline = reportConnections(economy, player, session);
    const candidate = baseline[0];
    if (!candidate) throw new Error("missing signed-report connection fixture");
    const duplicateTrust = source.trust.find(({ settlementId }) =>
      settlementId === Number(candidate.id));
    if (!duplicateTrust) throw new Error("missing trust record for report fixture");
    const duplicated: WorldView = {
      ...economy,
      settlements: economy.settlements.map((settlement) => settlement.id === source.id
        ? { ...settlement, trust: [...settlement.trust, { ...duplicateTrust }] }
        : settlement),
    };
    const beforeProjection = structuredClone(duplicated);
    const projected = reportConnections(duplicated, player, session);

    expect(projected).toEqual(baseline);
    expect(projected.filter(({ id }) => id === candidate.id)).toHaveLength(1);
    expect(new Set(projectedJobIds(source.id, projected)).size).toBe(projected.length);
    expect(duplicated).toEqual(beforeProjection);
  });

  it("gives the same recipient different stable jobs and clear copy for different subjects", () => {
    const economy = createWorldView(createWorld("subjects stay attached to signed counts"));
    const candidates = economy.settlements.flatMap((source) => {
      const player = createPlayer(economy, source.id);
      const session = createSessionState(economy.seedText);
      session.tutorial.dismissed = true;
      session.selectedSettlementId = source.id;
      return reportConnections(economy, player, session).map((connection) => ({
        source,
        connection,
      }));
    });
    const pair = candidates.flatMap((left, leftIndex) =>
      candidates.slice(leftIndex + 1).flatMap((right) =>
        left.connection.id === right.connection.id
        && left.source.id !== right.source.id
        && left.source.specialization !== right.source.specialization
          ? [[left, right] as const]
          : []
      )
    )[0];
    if (!pair) throw new Error("missing two report subjects for one recipient");
    const [left, right] = pair;
    const recipient = economy.settlements.find(({ id }) => id === Number(left.connection.id));
    if (!recipient) throw new Error("missing shared report recipient");

    const leftId = signedReportJobId(left.source.id, left.source.id, recipient.id);
    const rightId = signedReportJobId(right.source.id, right.source.id, recipient.id);
    expect(leftId).not.toBe(rightId);
    expect(left.connection.reportActionLabel).toContain(left.source.name);
    expect(right.connection.reportActionLabel).toContain(right.source.name);
    expect(left.connection.reportActionLabel).toContain(recipient.name);
    expect(right.connection.reportActionLabel).toContain(recipient.name);
    expect(left.connection.reportActionLabel).not.toBe(right.connection.reportActionLabel);
    expect(left.connection.reportActionHint).toContain(`Subject: ${left.source.name}'s`);
    expect(right.connection.reportActionHint).toContain(`Subject: ${right.source.name}'s`);
    expect(left.connection.reportActionHint).toContain(`Recipient: ${recipient.name}`);
    expect(right.connection.reportActionHint).toContain(`Recipient: ${recipient.name}`);
  });

  it("keeps projected IDs singular and disables every signing path while one report is carried", () => {
    const { economy, source, player, session } = reportFixture("one document cannot become two");
    const available = reportConnections(economy, player, session);
    const selected = available[0];
    if (!selected) throw new Error("missing report action fixture");
    player.report = {
      sourceSettlementId: source.id,
      targetSettlementId: Number(selected.id),
      resource: source.specialization,
      reportedQuantity: source.inventory[source.specialization],
      observedTick: economy.completedTick,
      confidence: 1_000_000,
    };

    const occupied = reportConnections(economy, player, session);
    const refreshed = reportConnections(economy, player, session);
    const ids = projectedJobIds(source.id, occupied);
    expect(refreshed).toEqual(occupied);
    expect(ids).toEqual(projectedJobIds(source.id, available));
    expect(new Set(ids).size).toBe(ids.length);
    expect(occupied.filter(({ id }) => id === selected.id)).toHaveLength(1);
    expect(occupied.every(({ reportActionDisabled }) => reportActionDisabled)).toBe(true);
    expect(occupied.every(({ reportActionLabel }) => reportActionLabel?.startsWith("Case occupied · ")))
      .toBe(true);
    expect(new Set(occupied.map(({ reportActionLabel }) => reportActionLabel)).size)
      .toBe(occupied.length);
  });
});
