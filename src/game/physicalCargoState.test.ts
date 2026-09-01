import { describe, expect, it } from "vitest";

import { FIXED_POINT, createWorld, createWorldView } from "../sim/public";
import { hashCanonical } from "../sim/util";
import { createCraftingInventory } from "./crafting";
import { createPlayer, PACK_LOAD_MILLI_PER_UNIT } from "./player";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import {
  commitPhysicalCargoState,
  createPhysicalCargoStateFromPlayer,
  gameSaveEnvelopeIntegrity,
  quotePhysicalCargoSource,
  validatePhysicalCargoState,
  type PhysicalCargoState,
} from "./physicalCargoState";
import {
  LOOSE_CARGO_MAX_ENTITIES,
  LOOSE_CARGO_MAX_HISTORY,
  LOOSE_CARGO_RETAINED_HISTORY,
  addLooseCargoStack,
  dropLooseCargo,
  looseCargoEntityId,
  looseCargoEventId,
  pickupLooseCargo,
  scatterLooseCargo,
  setLooseCargoLotMaterialState,
  stepLooseCargo,
} from "./looseCargo";

function fixture() {
  const world = createWorldView(createWorld("physical cargo save fixture", "wild"));
  const player = createPlayer(world);
  player.craftingInventory = createCraftingInventory(
    player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT,
    { cordreed: 2 },
    [{ id: 7, kind: "reed-mat", condition: 720_000 }],
  );
  player.cargo = [{
    contractId: 19,
    resource: "medicine",
    quantity: 2,
    condition: 830_000,
    property: "fragile",
  }];
  player.activeContractId = 19;
  return { world, player };
}

function resealPhysicalCargoState(
  state: PhysicalCargoState,
  changes: Partial<Omit<PhysicalCargoState, "integrity">> = {},
): PhysicalCargoState {
  const unsealed = {
    version: changes.version ?? state.version,
    lastSourceOrdinal: changes.lastSourceOrdinal ?? state.lastSourceOrdinal,
    looseWorld: changes.looseWorld ?? state.looseWorld,
    carrier: changes.carrier ?? state.carrier,
    expectedManifest: changes.expectedManifest ?? state.expectedManifest,
  };
  return { ...unsealed, integrity: hashCanonical(unsealed) };
}

function commitPromiseDrop(state: PhysicalCargoState): PhysicalCargoState {
  const dropped = dropLooseCargo(state.looseWorld, state.carrier, {
    lotId: "promise:19",
    x: 500_000,
    y: 500_000,
  });
  if (!dropped.ok) throw new Error(`promise drop fixture failed: ${dropped.reason}`);
  return commitPhysicalCargoState(state, {
    looseWorld: dropped.world,
    carrier: dropped.carrier,
  }, { kind: "conserved" });
}

describe("physical cargo save state", () => {
  it("migrates legacy aggregate inventory exactly once and validates its mirror", () => {
    const { world, player } = fixture();
    const state = createPhysicalCargoStateFromPlayer(
      player,
      world.terrain.width,
      world.terrain.height,
    );
    expect(state.carrier.lots.map(({ id }) => id)).toEqual([
      "crafting-stack:cordreed",
      "gear:7",
      "promise:19",
    ]);
    expect(validatePhysicalCargoState(
      structuredClone(state),
      player,
      world.terrain.width,
      world.terrain.height,
    )).toMatchObject({ valid: true, reason: "valid" });
  });

  it("deep-freezes every sidecar admitted to the trusted commit fast path", () => {
    const { world, player } = fixture();
    const state = createPhysicalCargoStateFromPlayer(
      player,
      world.terrain.width,
      world.terrain.height,
    );
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.carrier)).toBe(true);
    expect(Object.isFrozen(state.carrier.lots)).toBe(true);
    expect(Object.isFrozen(state.expectedManifest)).toBe(true);
    expect(() => {
      (state.carrier.lots as unknown[]).push({});
    }).toThrow(TypeError);
    expect(() => commitPhysicalCargoState(state, {
      looseWorld: state.looseWorld,
      carrier: state.carrier,
    }, { kind: "conserved" })).not.toThrow();
  });

  it("adopts a legacy maximum history tail and archives it on the next step", () => {
    const { world, player } = fixture();
    const initial = createPhysicalCargoStateFromPlayer(
      player,
      world.terrain.width,
      world.terrain.height,
    );
    const legacyHistory = Array.from({ length: LOOSE_CARGO_MAX_HISTORY }, (_, index) => {
      const ordinal = index + 1;
      return {
        id: looseCargoEventId({ x: 0, y: 0 }, ordinal),
        ordinal,
        step: ordinal,
        kind: "environment" as const,
        entityIds: [looseCargoEntityId({ x: 0, y: 0 }, 1)],
        payloadKey: "legacy-physical-evidence",
        quantity: 1,
        from: null,
        to: null,
        causes: ["parcel-settled" as const],
        conditionLoss: 0,
        contaminationGain: 0,
        decayGain: 0,
      };
    });
    const legacy = resealPhysicalCargoState(initial, {
      looseWorld: {
        ...initial.looseWorld,
        lastEventOrdinal: legacyHistory.length,
        history: legacyHistory,
      },
    });
    const advanced = stepLooseCargo(legacy.looseWorld, []);
    if (!advanced.ok) throw new Error(`legacy-tail step failed: ${advanced.reason}`);
    const compacted = commitPhysicalCargoState(legacy, {
      looseWorld: advanced.state,
      carrier: legacy.carrier,
    }, { kind: "conserved" });

    expect(compacted.looseWorld.history).toHaveLength(LOOSE_CARGO_RETAINED_HISTORY);
    expect(compacted.looseWorld.historyBaseOrdinal)
      .toBe(LOOSE_CARGO_MAX_HISTORY - LOOSE_CARGO_RETAINED_HISTORY);
    expect(compacted.looseWorld.historyArchiveHash).not.toBe("0000000000000000");
    expect(compacted.looseWorld.lastEventOrdinal).toBe(LOOSE_CARGO_MAX_HISTORY);
  });

  it("rejects integrity, manifest, deletion, owner, and legacy-mirror tampering", () => {
    const { world, player } = fixture();
    const state = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const validate = (value: unknown, mirror = player) => validatePhysicalCargoState(
      value,
      mirror,
      world.terrain.width,
      world.terrain.height,
    ).reason;
    expect(validate({ ...state, lastSourceOrdinal: 2 })).toBe("invalid-integrity");
    expect(validate({ ...state, expectedManifest: { ...state.expectedManifest, fingerprint: "tampered" } }))
      .toBe("invalid-integrity");
    expect(validate({ ...state, carrier: { ...state.carrier, lots: state.carrier.lots.slice(1) } }))
      .toBe("invalid-integrity");
    const wrongMirror = structuredClone(player);
    wrongMirror.cargo[0]!.condition -= 1;
    expect(validate(state, wrongMirror)).toBe("player-mirror-mismatch");
  });

  it("keeps a quoted source ordinal unspent until the matching mutation commits", () => {
    const { world, player } = fixture();
    const state = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const first = quotePhysicalCargoSource(state, "gather", "node:cordreed:44");
    const repeat = quotePhysicalCargoSource(state, "gather", "node:cordreed:44");
    expect(repeat).toEqual(first);
    expect(first.lotId).toMatch(/^pc:0:0:source:1:gather:/);
    expect(() => quotePhysicalCargoSource(state, "bad label!", "node:1")).toThrow(RangeError);
    const fieldNode = quotePhysicalCargoSource(
      state,
      "gather",
      "field-v1:seed:12,-44:cordreed",
    );
    expect(fieldNode.ordinal).toBe(first.ordinal);
    expect(fieldNode.lotId).toMatch(/^pc:0:0:source:1:gather:[0-9a-f]+$/u);
    expect(quotePhysicalCargoSource(
      state,
      "gather",
      "  FIELD-v1:seed:12,-44:cordreed  ",
    )).toEqual(fieldNode);
    expect(() => quotePhysicalCargoSource(state, "gather", "field\nnode"))
      .toThrow(/control characters/u);
    expect(() => quotePhysicalCargoSource(state, "gather", "x".repeat(97)))
      .toThrow(/bounded text/u);

    const dropped = dropLooseCargo(state.looseWorld, state.carrier, {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: 500_000,
      y: 500_000,
    });
    expect(dropped.ok).toBe(true);
    const committed = commitPhysicalCargoState(state, {
      looseWorld: dropped.world,
      carrier: dropped.carrier,
      committedSourceOrdinal: first.ordinal,
    }, { kind: "conserved" });
    expect(committed.lastSourceOrdinal).toBe(1);
    expect(quotePhysicalCargoSource(committed, "gather", "node:cordreed:45").ordinal).toBe(2);
    expect(validatePhysicalCargoState(
      committed,
      { ...player, craftingInventory: createCraftingInventory(
        player.craftingInventory.capacityMilliLoad,
        { cordreed: 1 },
        player.craftingInventory.gear,
      ) },
      world.terrain.width,
      world.terrain.height,
    ).reason).toBe("valid");
  });

  it("refuses to bless deletion, a tampered prior seal, or an undeclared source", () => {
    const { world, player } = fixture();
    const state = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    expect(() => commitPhysicalCargoState(state, {
      looseWorld: state.looseWorld,
      carrier: { ...state.carrier, lots: state.carrier.lots.slice(1) },
    }, { kind: "conserved" })).toThrow(/invalid|substance|revision/u);
    expect(() => commitPhysicalCargoState({ ...state, integrity: "tampered" }, {
      looseWorld: state.looseWorld,
      carrier: state.carrier,
    }, { kind: "conserved" })).toThrow(/invalid physical cargo sidecar/u);
    expect(() => commitPhysicalCargoState(state, {
      looseWorld: state.looseWorld,
      carrier: { ...state.carrier, reservedLoadMilli: state.carrier.reservedLoadMilli + 1_000 },
    }, { kind: "conserved" })).toThrow(/reserved load/u);
  });

  it("commits a forward drop, damaging drift step, and pickup without losing substance or evidence", () => {
    const { world, player } = fixture();
    const initial = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const afterDrop = commitPromiseDrop(initial);
    const droppedEntity = afterDrop.looseWorld.entities[0];
    if (!droppedEntity) throw new Error("forward fixture has no dropped entity");
    const stepped = stepLooseCargo(afterDrop.looseWorld, [{
      entityId: droppedEntity.id,
      environment: {
        rain: 900_000,
        heat: 300_000,
        cold: 0,
        immersion: 800_000,
        currentX: 650_000,
        currentY: 0,
        magicalWaterFlux: 500_000,
        impact: 500_000,
      },
      waterDepth: 800_000,
      downhillX: 250_000,
      downhillY: 0,
      tumbleImpact: 600_000,
      mangroveSnag: 0,
      brambleSnag: 0,
    }]);
    expect(stepped.ok).toBe(true);
    const afterStep = commitPhysicalCargoState(afterDrop, {
      looseWorld: stepped.state,
      carrier: afterDrop.carrier,
    }, { kind: "conserved" });
    const weathered = afterStep.looseWorld.entities[0];
    if (!weathered) throw new Error("forward fixture lost its weathered entity");
    expect(weathered.materialState.condition).toBeLessThan(830_000);
    const picked = pickupLooseCargo(afterStep.looseWorld, afterStep.carrier, {
      entityId: weathered.id,
      x: weathered.x,
      y: weathered.y,
      reach: 0,
    });
    expect(picked.ok).toBe(true);
    const afterPickup = commitPhysicalCargoState(afterStep, {
      looseWorld: picked.world,
      carrier: picked.carrier,
    }, { kind: "conserved" });

    expect(afterPickup.looseWorld.entities).toEqual([]);
    expect(afterPickup.looseWorld.completedSteps).toBe(1);
    expect(afterPickup.looseWorld.history.map(({ kind }) => kind)).toEqual([
      "drop",
      "environment",
      "pickup",
    ]);
    expect(afterPickup.carrier.retiredLotIds).toContain("promise:19");
    expect(afterPickup.expectedManifest).toEqual(initial.expectedManifest);
    expect(afterPickup.carrier.lots.find(({ payload }) => payload.kind === "promise")?.materialState)
      .toEqual(weathered.materialState);
  });

  it("rejects replay of an older independently valid same-substance snapshot", () => {
    const { world, player } = fixture();
    const initial = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const current = commitPromiseDrop(initial);
    expect(() => commitPhysicalCargoState(current, {
      looseWorld: initial.looseWorld,
      carrier: initial.carrier,
    }, { kind: "conserved" })).toThrow(/cannot roll backward/u);
  });

  it("rejects conserved material healing, decontamination, and decay rollback", () => {
    const { world, player } = fixture();
    const initial = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const damaged = setLooseCargoLotMaterialState(initial.carrier, "promise:19", {
      condition: 700_000,
      contamination: 40_000,
      decay: 30_000,
    });
    expect(damaged.ok).toBe(true);
    const current = commitPhysicalCargoState(initial, {
      looseWorld: initial.looseWorld,
      carrier: damaged.carrier,
    }, { kind: "conserved" });
    const candidate = (materialState: { condition: number; contamination: number; decay: number }) => ({
      ...current.carrier,
      revision: current.carrier.revision + 1,
      lots: current.carrier.lots.map((lot) => lot.id === "promise:19"
        ? { ...lot, materialState }
        : lot),
    });
    expect(() => commitPhysicalCargoState(current, {
      looseWorld: current.looseWorld,
      carrier: candidate({ condition: 700_001, contamination: 40_000, decay: 30_000 }),
    }, { kind: "conserved" })).toThrow(/condition cannot be rolled back/u);
    expect(() => commitPhysicalCargoState(current, {
      looseWorld: current.looseWorld,
      carrier: candidate({ condition: 700_001, contamination: 40_000, decay: 30_000 }),
    }, { kind: "delta", removed: [], added: [] })).toThrow(/condition cannot be rolled back/u);
    expect(() => commitPhysicalCargoState(current, {
      looseWorld: current.looseWorld,
      carrier: candidate({ condition: 700_000, contamination: 39_999, decay: 30_000 }),
    }, { kind: "conserved" })).toThrow(/contamination cannot be rolled back/u);
    expect(() => commitPhysicalCargoState(current, {
      looseWorld: current.looseWorld,
      carrier: candidate({ condition: 700_000, contamination: 40_000, decay: 29_999 }),
    }, { kind: "conserved" })).toThrow(/decay cannot be rolled back/u);
  });

  it("rejects deleting retired source identities even when substance is unchanged", () => {
    const { world, player } = fixture();
    const initial = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const dropped = dropLooseCargo(initial.looseWorld, initial.carrier, {
      lotId: "crafting-stack:cordreed",
      quantity: 2,
      x: 500_000,
      y: 500_000,
    });
    if (!dropped.ok) throw new Error(`retirement fixture failed: ${dropped.reason}`);
    const current = commitPhysicalCargoState(initial, {
      looseWorld: dropped.world,
      carrier: dropped.carrier,
    }, { kind: "conserved" });
    expect(current.carrier.retiredLotIds).toContain("crafting-stack:cordreed");
    expect(() => commitPhysicalCargoState(current, {
      looseWorld: current.looseWorld,
      carrier: {
        ...current.carrier,
        revision: current.carrier.revision + 1,
        retiredLotIds: [],
      },
    }, { kind: "conserved" })).toThrow(/retired identities cannot be deleted/u);
  });

  it("rejects history-prefix rewrites and archive hash rollback", () => {
    const { world, player } = fixture();
    const initial = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const current = commitPromiseDrop(initial);
    const firstRecord = current.looseWorld.history[0];
    if (!firstRecord) throw new Error("history fixture has no drop record");
    expect(() => commitPhysicalCargoState(current, {
      looseWorld: {
        ...current.looseWorld,
        revision: current.looseWorld.revision + 1,
        history: [{ ...firstRecord, causes: ["forced-release"] }],
      },
      carrier: current.carrier,
    }, { kind: "conserved" })).toThrow(/immutable prefix/u);

    const archived = resealPhysicalCargoState(current, {
      looseWorld: {
        ...current.looseWorld,
        historyBaseOrdinal: 1,
        historyArchiveHash: "1111111111111111",
        history: [],
      },
    });
    expect(() => commitPhysicalCargoState(archived, {
      looseWorld: {
        ...archived.looseWorld,
        revision: archived.looseWorld.revision + 1,
        historyArchiveHash: "2222222222222222",
      },
      carrier: archived.carrier,
    }, { kind: "conserved" })).toThrow(/archive cannot roll back or fork/u);
    expect(() => commitPhysicalCargoState(archived, {
      looseWorld: {
        ...current.looseWorld,
        revision: archived.looseWorld.revision + 1,
      },
      carrier: archived.carrier,
    }, { kind: "conserved" })).toThrow(/history base ordinal cannot roll backward/u);
  });

  it("rejects each world and carrier cursor rollback while allowing an explicit forward delta", () => {
    const { world, player } = fixture();
    const initial = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const afterDrop = commitPromiseDrop(initial);
    const entity = afterDrop.looseWorld.entities[0];
    if (!entity) throw new Error("cursor fixture has no entity");
    const stepped = stepLooseCargo(afterDrop.looseWorld, [{
      entityId: entity.id,
      environment: {
        rain: 0,
        heat: 0,
        cold: 0,
        immersion: 0,
        currentX: 0,
        currentY: 0,
        magicalWaterFlux: 0,
        impact: 0,
      },
      waterDepth: 0,
      downhillX: 0,
      downhillY: 0,
      tumbleImpact: 0,
      mangroveSnag: 0,
      brambleSnag: 0,
    }]);
    if (!stepped.ok) throw new Error(`cursor step failed: ${stepped.reason}`);
    const current = commitPhysicalCargoState(afterDrop, {
      looseWorld: stepped.state,
      carrier: afterDrop.carrier,
    }, { kind: "conserved" });
    expect(() => commitPhysicalCargoState(current, {
      looseWorld: { ...current.looseWorld, revision: current.looseWorld.revision - 1 },
      carrier: current.carrier,
    }, { kind: "conserved" })).toThrow(/revision cannot roll backward/u);
    expect(() => commitPhysicalCargoState(current, {
      looseWorld: { ...current.looseWorld, completedSteps: current.looseWorld.completedSteps - 1 },
      carrier: current.carrier,
    }, { kind: "conserved" })).toThrow(/completed steps cannot roll backward/u);
    expect(() => commitPhysicalCargoState(current, {
      looseWorld: current.looseWorld,
      carrier: { ...current.carrier, revision: current.carrier.revision - 1 },
    }, { kind: "conserved" })).toThrow(/carrier revision cannot roll backward/u);

    const picked = pickupLooseCargo(current.looseWorld, current.carrier, {
      entityId: entity.id,
      x: entity.x,
      y: entity.y,
      reach: FIXED_POINT,
    });
    if (!picked.ok) throw new Error(`cursor pickup failed: ${picked.reason}`);
    const afterPickup = commitPhysicalCargoState(current, {
      looseWorld: picked.world,
      carrier: picked.carrier,
    }, { kind: "conserved" });
    expect(() => commitPhysicalCargoState(afterPickup, {
      looseWorld: {
        ...afterPickup.looseWorld,
        revision: afterPickup.looseWorld.revision + 1,
        lastEntityOrdinal: afterPickup.looseWorld.lastEntityOrdinal - 1,
      },
      carrier: afterPickup.carrier,
    }, { kind: "conserved" })).toThrow(/entity ordinal cannot roll backward/u);
    expect(() => commitPhysicalCargoState(afterPickup, {
      looseWorld: {
        ...afterPickup.looseWorld,
        revision: afterPickup.looseWorld.revision + 1,
        lastEventOrdinal: afterPickup.looseWorld.lastEventOrdinal - 1,
        history: afterPickup.looseWorld.history.slice(0, -1),
      },
      carrier: afterPickup.carrier,
    }, { kind: "conserved" })).toThrow(/event ordinal cannot roll backward/u);

    const addition = addLooseCargoStack(afterPickup.carrier, {
      sourceLotId: "gather:forward-delta",
      item: "cordreed",
      quantity: 1,
    });
    if (!addition.ok) throw new Error(`delta fixture failed: ${addition.reason}`);
    const quote = quotePhysicalCargoSource(afterPickup, "gather", "node:forward-delta");
    const delta = commitPhysicalCargoState(afterPickup, {
      looseWorld: afterPickup.looseWorld,
      carrier: addition.carrier,
      committedSourceOrdinal: quote.ordinal,
    }, {
      kind: "delta",
      removed: [],
      added: [{ kind: "stack", item: "cordreed", quantity: 1 }],
    });
    expect(delta.lastSourceOrdinal).toBe(quote.ordinal);
    expect(delta.carrier.lots.find(({ id }) => id === "gather:forward-delta")?.payload)
      .toEqual({ kind: "stack", item: "cordreed", quantity: 1 });
    expect(() => commitPhysicalCargoState(delta, {
      looseWorld: delta.looseWorld,
      carrier: delta.carrier,
      committedSourceOrdinal: delta.lastSourceOrdinal - 1,
    }, { kind: "conserved" })).toThrow(/source ordinals must commit monotonically/u);
  });

  it("rejects renaming a live carrier lot to erase its replay tombstone duty", () => {
    const { world, player } = fixture();
    const initial = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const source = initial.carrier.lots.find(({ id }) => id === "crafting-stack:cordreed");
    if (!source) throw new Error("rename fixture is missing cordreed");
    expect(() => commitPhysicalCargoState(initial, {
      looseWorld: initial.looseWorld,
      carrier: {
        ...initial.carrier,
        revision: initial.carrier.revision + 1,
        lots: initial.carrier.lots.map((lot) => lot.id === source.id
          ? { ...lot, id: "renamed:cordreed" }
          : lot),
      },
    }, { kind: "conserved" })).toThrow(/removed lot identities must remain retired/u);
  });

  it("rejects parcel resurrection, unevidenced kinematic rewrites, and no-op source spending", () => {
    const { world, player } = fixture();
    const initial = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const afterDrop = commitPromiseDrop(initial);
    const droppedEntity = afterDrop.looseWorld.entities[0];
    if (!droppedEntity) throw new Error("rewrite fixture has no dropped entity");

    const stepped = stepLooseCargo(afterDrop.looseWorld, [{
      entityId: droppedEntity.id,
      environment: {
        rain: 0,
        heat: 0,
        cold: 0,
        immersion: 0,
        currentX: 0,
        currentY: 0,
        magicalWaterFlux: 0,
        impact: 0,
      },
      waterDepth: 0,
      downhillX: FIXED_POINT,
      downhillY: 0,
      tumbleImpact: 0,
      mangroveSnag: 0,
      brambleSnag: 0,
    }]);
    if (!stepped.ok) throw new Error(`rewrite step failed: ${stepped.reason}`);
    const afterStep = commitPhysicalCargoState(afterDrop, {
      looseWorld: stepped.state,
      carrier: afterDrop.carrier,
    }, { kind: "conserved" });
    const movedEntity = afterStep.looseWorld.entities[0];
    if (!movedEntity) throw new Error("rewrite fixture lost its moved entity");
    expect(movedEntity.x).not.toBe(droppedEntity.x);
    expect(() => commitPhysicalCargoState(afterStep, {
      looseWorld: {
        ...afterStep.looseWorld,
        revision: afterStep.looseWorld.revision + 1,
        entities: [{
          ...movedEntity,
          x: droppedEntity.x,
          y: droppedEntity.y,
          velocityX: droppedEntity.velocityX,
          velocityY: droppedEntity.velocityY,
          motion: droppedEntity.motion,
        }],
      },
      carrier: afterStep.carrier,
    }, { kind: "conserved" })).toThrow(/without an environment step/u);

    const picked = pickupLooseCargo(afterDrop.looseWorld, afterDrop.carrier, {
      entityId: droppedEntity.id,
      x: droppedEntity.x,
      y: droppedEntity.y,
      reach: 0,
    });
    if (!picked.ok) throw new Error(`resurrection pickup failed: ${picked.reason}`);
    const afterPickup = commitPhysicalCargoState(afterDrop, {
      looseWorld: picked.world,
      carrier: picked.carrier,
    }, { kind: "conserved" });
    const recovered = afterPickup.carrier.lots.find((lot) => lot.payload.kind === "promise");
    if (!recovered) throw new Error("resurrection fixture has no recovered Promise lot");
    expect(() => commitPhysicalCargoState(afterPickup, {
      looseWorld: {
        ...afterPickup.looseWorld,
        revision: afterPickup.looseWorld.revision + 1,
        entities: [droppedEntity],
      },
      carrier: {
        ...afterPickup.carrier,
        revision: afterPickup.carrier.revision + 1,
        lots: afterPickup.carrier.lots.filter((lot) => lot.id !== recovered.id),
        retiredLotIds: [...afterPickup.carrier.retiredLotIds, recovered.id].sort(),
      },
    }, { kind: "conserved" })).toThrow(/resurrect an allocated parcel identity/u);

    const source = quotePhysicalCargoSource(afterPickup, "gather", "node:no-op");
    expect(() => commitPhysicalCargoState(afterPickup, {
      looseWorld: afterPickup.looseWorld,
      carrier: afterPickup.carrier,
      committedSourceOrdinal: source.ordinal,
    }, { kind: "conserved" })).toThrow(/without a physical mutation/u);
  });

  it("hashes every outer envelope field except the seal itself", () => {
    const envelope = { format: "tideweft-session", version: 3, world: "one", player: { x: 1 } };
    const integrity = gameSaveEnvelopeIntegrity(envelope);
    expect(gameSaveEnvelopeIntegrity({ ...envelope, integrity })).toBe(integrity);
    expect(gameSaveEnvelopeIntegrity({ ...envelope, world: "two", integrity })).not.toBe(integrity);
    expect(gameSaveEnvelopeIntegrity({ ...envelope, player: { x: 2 }, integrity })).not.toBe(integrity);
  });

  it("projects exact stable lots into mobile-safe KIT drop actions", () => {
    const { world, player } = fixture();
    const physical = createPhysicalCargoStateFromPlayer(player, world.terrain.width, world.terrain.height);
    const kit = projectUIView(
      world,
      player,
      createSessionState(world.seedText, "gale"),
      { looseCargoCarrier: physical.carrier },
    ).kit;
    expect(kit?.transportRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ lotId: "promise:19", dropQuantity: 2, canDrop: true }),
    ]));
    expect(kit?.stackRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ lotId: "crafting-stack:cordreed", quantity: 2, canDrop: true }),
    ]));
    expect(kit?.gearRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ lotId: "gear:7", canDrop: true }),
    ]));
  });

  it("keeps the sealed production path responsive at the 64-parcel cap", () => {
    const { world, player } = fixture();
    player.cargoCapacity = LOOSE_CARGO_MAX_ENTITIES;
    player.craftingInventory = createCraftingInventory(
      LOOSE_CARGO_MAX_ENTITIES * PACK_LOAD_MILLI_PER_UNIT,
      { cordreed: LOOSE_CARGO_MAX_ENTITIES },
    );
    player.cargo = [];
    player.report = null;
    let physical = createPhysicalCargoStateFromPlayer(
      player,
      world.terrain.width,
      world.terrain.height,
    );
    for (let batch = 0; batch < 4; batch += 1) {
      const scattered = scatterLooseCargo(physical.looseWorld, physical.carrier, {
        lotId: "crafting-stack:cordreed",
        x: 1_000_000,
        y: 1_000_000 + batch,
        cause: "forced-release",
        parts: Array.from({ length: 16 }, () => ({
          quantity: 1,
          velocityX: 0,
          velocityY: 0,
        })),
      });
      if (!scattered.ok) throw new Error(`sealed stress scatter failed: ${scattered.reason}`);
      physical = commitPhysicalCargoState(physical, {
        looseWorld: scattered.world,
        carrier: scattered.carrier,
      }, { kind: "conserved" });
    }
    const samples = physical.looseWorld.entities.map((entity) => ({
      entityId: entity.id,
      environment: {
        rain: 300_000,
        heat: 0,
        cold: 0,
        immersion: 800_000,
        currentX: 500_000,
        currentY: 0,
        magicalWaterFlux: 100_000,
        impact: 0,
      },
      waterDepth: 800_000,
      downhillX: 0,
      downhillY: 0,
      tumbleImpact: 0,
      mangroveSnag: 0,
      brambleSnag: 0,
    }));

    const started = performance.now();
    for (let step = 0; step < 160; step += 1) {
      const advanced = stepLooseCargo(physical.looseWorld, samples);
      if (!advanced.ok) throw new Error(`sealed stress step ${step} failed: ${advanced.reason}`);
      physical = commitPhysicalCargoState(physical, {
        looseWorld: advanced.state,
        carrier: physical.carrier,
      }, { kind: "conserved" });
    }
    const elapsed = performance.now() - started;
    // Mirror the now-empty physical pack as production does before validating
    // a save envelope; every parcel itself remains present and recoverable.
    player.craftingInventory = createCraftingInventory(
      LOOSE_CARGO_MAX_ENTITIES * PACK_LOAD_MILLI_PER_UNIT,
    );
    expect(physical.looseWorld.entities).toHaveLength(LOOSE_CARGO_MAX_ENTITIES);
    expect(physical.looseWorld.history).toHaveLength(LOOSE_CARGO_RETAINED_HISTORY);
    expect(physical.looseWorld.historyBaseOrdinal).toBeGreaterThan(0);
    expect(validatePhysicalCargoState(
      physical,
      player,
      world.terrain.width,
      world.terrain.height,
    ).valid).toBe(true);
    expect(elapsed).toBeLessThan(5_000);
  }, 10_000);
});
