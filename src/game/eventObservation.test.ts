import { describe, expect, it } from "vitest";

import { createWorld, createWorldView } from "../sim/public";
import type { SimEvent } from "../sim/types";
import { eventSettlementLocusIds } from "./eventObservation";

describe("typed event observation loci", () => {
  it("distinguishes a Promise origin event from its destination", () => {
    const world = createWorldView(createWorld("events happen somewhere"));
    const contract = world.contracts[0];
    if (!contract) throw new Error("fixture needs a contract");
    const accepted: SimEvent = {
      tick: 1,
      sequence: 1,
      type: "contract-accepted",
      subjectId: contract.id,
      data: {
        originSettlementId: contract.originSettlementId,
        destinationSettlementId: contract.destinationSettlementId,
      },
    };
    const fulfilled: SimEvent = {
      ...accepted,
      sequence: 2,
      type: "contract-fulfilled",
    };
    expect(eventSettlementLocusIds(accepted, world)).toEqual([contract.originSettlementId]);
    expect(eventSettlementLocusIds(fulfilled, world)).toEqual([contract.destinationSettlementId]);
  });

  it("never guesses that a generic numeric subject is a settlement", () => {
    const world = createWorldView(createWorld("ids are typed not lucky"));
    const settlement = world.settlements[0];
    if (!settlement) throw new Error("fixture needs a settlement");
    const event: SimEvent = {
      tick: 1,
      sequence: 3,
      type: "tide-choir-awakened",
      subjectId: settlement.id,
      data: { routeCount: 1 },
    };
    expect(eventSettlementLocusIds(event, world)).toEqual([]);
  });

  it("places shared knowledge only where it is received", () => {
    const world = createWorldView(createWorld("knowledge has an arrival"));
    const [from, to] = world.settlements;
    if (!from || !to) throw new Error("fixture needs two settlements");
    const event: SimEvent = {
      tick: 1,
      sequence: 4,
      type: "knowledge-shared",
      subjectId: null,
      data: {
        fromSettlementId: from.id,
        toSettlementId: to.id,
        subjectSettlementId: from.id,
      },
    };
    expect(eventSettlementLocusIds(event, world)).toEqual([to.id]);
  });
});
