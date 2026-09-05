import { describe, expect, it } from "vitest";

import { FIXED_POINT, createWorld, createWorldView } from "../sim/public";
import { hashCanonical } from "../sim/util";
import { createCraftingInventory } from "./crafting";
import { createPlayer, PACK_LOAD_MILLI_PER_UNIT } from "./player";
import { createSessionState } from "./sessionTypes";
import { projectUIView } from "./uiProjection";
import {
  PHYSICAL_CARGO_MAX_INACTIVE_WORLDS,
  PHYSICAL_CARGO_MAX_SERIALIZED_BYTES,
  PHYSICAL_CARGO_STATE_VERSION,
  adoptPhysicalCargoStateV1,
  commitPhysicalCargoRegionalMutation,
  commitPhysicalCargoState,
  createPhysicalCargoStateFromPlayer,
  gameSaveEnvelopeIntegrity,
  inspectPhysicalCargoPartitionIndex,
  locatePhysicalCargoEntity,
  physicalCargoInactiveWorlds,
  physicalCargoPromiseCustody,
  physicalCargoWorldAt,
  physicalCargoWorlds,
  queryPhysicalCargoPartitions,
  quotePhysicalCargoSource,
  snapshotPhysicalCargoState,
  stepPhysicalCargoAcrossRegions,
  transitionPhysicalCargoRegion,
  validatePhysicalCargoState,
  type PhysicalCargoState,
  type SerializedPhysicalCargoState,
} from "./physicalCargoState";
import {
  LOOSE_CARGO_MAX_ENTITIES,
  LOOSE_CARGO_MAX_HISTORY,
  LOOSE_CARGO_RETAINED_HISTORY,
  addLooseCargoProvision,
  addLooseCargoStack,
  consumeLooseCargoProvisionEntity,
  createLooseCargoCarrier,
  createLooseCargoWorld,
  dropLooseCargo,
  looseCargoEntityId,
  looseCargoEventId,
  looseCargoRegionKey,
  pickupLooseCargo,
  scatterLooseCargo,
  setLooseCargoLotMaterialState,
  stepLooseCargo,
  validateLooseCargoWorld,
} from "./looseCargo";
import { projectLooseCargoCarrierToPlayer } from "./looseCargoRuntime";

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
  changes: Partial<Omit<SerializedPhysicalCargoState, "integrity">> = {},
): PhysicalCargoState {
  const snapshot = snapshotPhysicalCargoState(state);
  const unsealed = {
    version: changes.version ?? snapshot.version,
    lastSourceOrdinal: changes.lastSourceOrdinal ?? snapshot.lastSourceOrdinal,
    activeRegion: changes.activeRegion ?? snapshot.activeRegion,
    activeRegionKey: changes.activeRegionKey ?? snapshot.activeRegionKey,
    looseWorld: changes.looseWorld ?? snapshot.looseWorld,
    inactiveWorlds: changes.inactiveWorlds ?? snapshot.inactiveWorlds,
    carrier: changes.carrier ?? snapshot.carrier,
    expectedManifest: changes.expectedManifest ?? snapshot.expectedManifest,
  };
  const sealPayload = {
    ...unsealed,
    inactiveWorlds: unsealed.inactiveWorlds.map(({ regionKey, integrity }) => ({
      regionKey,
      integrity,
    })),
  };
  return { ...unsealed, integrity: hashCanonical(sealPayload) } as unknown as PhysicalCargoState;
}

function legacyPhysicalCargoV1(state: PhysicalCargoState) {
  const unsealed = {
    version: 1 as const,
    lastSourceOrdinal: state.lastSourceOrdinal,
    looseWorld: state.looseWorld,
    carrier: state.carrier,
    expectedManifest: state.expectedManifest,
  };
  return { ...unsealed, integrity: hashCanonical(unsealed) };
}

function mirrorPhysicalCarrierToPlayer(
  state: PhysicalCargoState,
  player: ReturnType<typeof createPlayer>,
): void {
  const mirror = projectLooseCargoCarrierToPlayer(state.carrier);
  player.craftingInventory = mirror.craftingInventory;
  player.cargo = mirror.cargo.map((cargo) => ({ ...cargo }));
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
    expect(state).toMatchObject({
      version: PHYSICAL_CARGO_STATE_VERSION,
      activeRegion: { x: 0, y: 0 },
      activeRegionKey: "r:0:0",
    });
    expect(physicalCargoInactiveWorlds(state)).toEqual([]);
    expect(validatePhysicalCargoState(
      structuredClone(snapshotPhysicalCargoState(state)),
      player,
      world.terrain.width,
      world.terrain.height,
    )).toMatchObject({ valid: true, reason: "valid" });
    expect(validatePhysicalCargoState(
      structuredClone(resealPhysicalCargoState(state)),
      player,
      world.terrain.width,
      world.terrain.height,
    )).toMatchObject({ valid: true, reason: "valid" });
  });

  it("adopts an exact sealed v1 sidecar only through the explicit migration gate", () => {
    const { world, player } = fixture();
    const current = createPhysicalCargoStateFromPlayer(
      player,
      world.terrain.width,
      world.terrain.height,
    );
    const legacy = legacyPhysicalCargoV1(current);
    expect(validatePhysicalCargoState(
      legacy,
      player,
      world.terrain.width,
      world.terrain.height,
    ).reason).toBe("invalid-state");

    const adopted = adoptPhysicalCargoStateV1(
      structuredClone(legacy),
      player,
      world.terrain.width,
      world.terrain.height,
    );
    expect(adopted).toMatchObject({ valid: true, reason: "valid" });
    expect(adopted.state).toMatchObject({
      version: 2,
      lastSourceOrdinal: legacy.lastSourceOrdinal,
      activeRegion: { x: 0, y: 0 },
      activeRegionKey: "r:0:0",
      carrier: legacy.carrier,
      looseWorld: legacy.looseWorld,
      expectedManifest: legacy.expectedManifest,
    });
    expect(physicalCargoInactiveWorlds(adopted.state!)).toEqual([]);

    const deletedUnsealed = {
      version: 1 as const,
      lastSourceOrdinal: legacy.lastSourceOrdinal,
      looseWorld: legacy.looseWorld,
      carrier: { ...legacy.carrier, lots: legacy.carrier.lots.slice(1) },
      expectedManifest: legacy.expectedManifest,
    };
    const deleted = { ...deletedUnsealed, integrity: hashCanonical(deletedUnsealed) };
    expect(adoptPhysicalCargoStateV1(
      deleted,
      player,
      world.terrain.width,
      world.terrain.height,
    ).reason).toBe("manifest-mismatch");
    expect(adoptPhysicalCargoStateV1(
      { ...legacy, extra: true },
      player,
      world.terrain.width,
      world.terrain.height,
    ).reason).toBe("invalid-state");
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

  it("drops in two regions, revisits exact worlds, and conserves one global manifest", () => {
    const { world, player } = fixture();
    const width = world.terrain.width;
    const height = world.terrain.height;
    const initial = createPhysicalCargoStateFromPlayer(player, width, height);

    const zeroDrop = dropLooseCargo(initial.looseWorld, initial.carrier, {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: 500_000,
      y: 500_000,
    });
    if (!zeroDrop.ok || !zeroDrop.entity) throw new Error(`region-zero drop failed: ${zeroDrop.reason}`);
    const regionZero = commitPhysicalCargoState(initial, {
      looseWorld: zeroDrop.world,
      carrier: zeroDrop.carrier,
    }, { kind: "conserved" });
    const zeroSnapshot = structuredClone(regionZero.looseWorld);

    const eastEmpty = transitionPhysicalCargoRegion(regionZero, { x: 1, y: 0 }, width, height);
    expect(eastEmpty.activeRegionKey).toBe("r:1:0");
    expect(physicalCargoInactiveWorlds(eastEmpty).map(({ regionKey }) => regionKey)).toEqual(["r:0:0"]);
    const eastDrop = dropLooseCargo(eastEmpty.looseWorld, eastEmpty.carrier, {
      lotId: "promise:19",
      x: 750_000,
      y: 500_000,
    });
    if (!eastDrop.ok || !eastDrop.entity) throw new Error(`east-region drop failed: ${eastDrop.reason}`);
    const east = commitPhysicalCargoState(eastEmpty, {
      looseWorld: eastDrop.world,
      carrier: eastDrop.carrier,
    }, { kind: "conserved" });
    const eastSnapshot = structuredClone(east.looseWorld);
    expect(east.expectedManifest).toEqual(initial.expectedManifest);
    expect(zeroDrop.entity.id).toBe("lc:0:0:parcel:1");
    expect(eastDrop.entity.id).toBe("lc:1:0:parcel:1");

    const revisitedZero = transitionPhysicalCargoRegion(east, { x: 0, y: 0 }, width, height);
    expect(revisitedZero.looseWorld).toEqual(zeroSnapshot);
    expect(physicalCargoInactiveWorlds(revisitedZero).map(({ regionKey }) => regionKey)).toEqual(["r:1:0"]);
    const revisitedEast = transitionPhysicalCargoRegion(revisitedZero, { x: 1, y: 0 }, width, height);
    expect(revisitedEast.looseWorld).toEqual(eastSnapshot);
    expect(revisitedEast.expectedManifest).toEqual(initial.expectedManifest);
    expect(transitionPhysicalCargoRegion(revisitedEast, { x: 1, y: 0 }, width, height))
      .toBe(revisitedEast);

    mirrorPhysicalCarrierToPlayer(revisitedEast, player);
    expect(validatePhysicalCargoState(
      JSON.parse(JSON.stringify(snapshotPhysicalCargoState(revisitedEast))),
      player,
      width,
      height,
    )).toMatchObject({ valid: true, reason: "valid" });
  });

  it("supports negative and extremely distant transitions without retaining pristine worlds", () => {
    const { world, player } = fixture();
    const width = world.terrain.width;
    const height = world.terrain.height;
    const initial = createPhysicalCargoStateFromPlayer(player, width, height);
    const negative = transitionPhysicalCargoRegion(initial, { x: -1, y: -7 }, width, height);
    expect(negative).toMatchObject({
      activeRegion: { x: -1, y: -7 },
      activeRegionKey: "r:-1:-7",
    });
    expect(physicalCargoInactiveWorlds(negative)).toEqual([]);
    expect(negative.lastSourceOrdinal).toBe(initial.lastSourceOrdinal);
    expect(negative.carrier).toBe(initial.carrier);
    expect(negative.expectedManifest).toBe(initial.expectedManifest);

    const distantRegion = {
      x: -Number.MAX_SAFE_INTEGER,
      y: Number.MAX_SAFE_INTEGER,
    };
    const distant = transitionPhysicalCargoRegion(negative, distantRegion, width, height);
    expect(distant.activeRegion).toEqual(distantRegion);
    expect(physicalCargoInactiveWorlds(distant)).toEqual([]);
    expect(quotePhysicalCargoSource(distant, "gather", "distant-node").lotId)
      .toMatch(/^pc:-9007199254740991:9007199254740991:source:1:gather:/u);
    const boundedSource = quotePhysicalCargoSource(distant, "x".repeat(96), "distant-node");
    expect(boundedSource.lotId.length).toBeLessThanOrEqual(160);
    const returned = transitionPhysicalCargoRegion(distant, { x: 0, y: 0 }, width, height);
    expect(physicalCargoInactiveWorlds(returned)).toEqual([]);
    expect(returned.looseWorld).toEqual(initial.looseWorld);
    expect(() => transitionPhysicalCargoRegion(returned, { x: -0, y: 0 }, width, height))
      .toThrow(/safe integers/u);
    expect(() => transitionPhysicalCargoRegion(returned, { x: 0, y: 0 }, width + 1, height))
      .toThrow(/dimensions/u);
  });

  it("keeps transition order deterministic, bounded, and reloadable across a signed-region fuzz walk", () => {
    const { world, player } = fixture();
    const width = world.terrain.width;
    const height = world.terrain.height;
    const initial = createPhysicalCargoStateFromPlayer(player, width, height);
    const regions = Array.from({ length: 24 }, (_, index) => ({
      x: index % 2 === 0 ? index + 1 : -(index + 1),
      y: ((index * 17) % 11) - 5,
    }));
    let state = initial;
    for (const region of regions) {
      state = transitionPhysicalCargoRegion(state, region, width, height);
      const stepped = stepLooseCargo(state.looseWorld, []);
      if (!stepped.ok) throw new Error(`regional fuzz step failed: ${stepped.reason}`);
      state = commitPhysicalCargoState(state, {
        looseWorld: stepped.state,
        carrier: state.carrier,
      }, { kind: "conserved" });
      const audit = inspectPhysicalCargoPartitionIndex(state);
      expect(audit.valid).toBe(true);
      expect(audit.height).toBeLessThanOrEqual(
        2 * Math.ceil(Math.log2(audit.size + 1)),
      );
    }
    expect(physicalCargoInactiveWorlds(state)).toHaveLength(regions.length - 1);
    const keys = physicalCargoInactiveWorlds(state).map(({ regionKey }) => regionKey);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
    expect(state.expectedManifest).toEqual(initial.expectedManifest);
    expect(state.carrier).toEqual(initial.carrier);
    expect(state.lastSourceOrdinal).toBe(0);

    for (const region of [...regions].reverse()) {
      state = transitionPhysicalCargoRegion(state, region, width, height);
      expect(inspectPhysicalCargoPartitionIndex(state).valid).toBe(true);
    }
    mirrorPhysicalCarrierToPlayer(state, player);
    const cloned = structuredClone(snapshotPhysicalCargoState(state));
    expect(validatePhysicalCargoState(cloned, player, width, height))
      .toMatchObject({ valid: true, reason: "valid" });
    expect(new TextEncoder().encode(JSON.stringify(cloned)).byteLength)
      .toBeLessThan(PHYSICAL_CARGO_MAX_SERIALIZED_BYTES);
    expect(PHYSICAL_CARGO_MAX_INACTIVE_WORLDS).toBe(131_071);

    const inactive = physicalCargoInactiveWorlds(state)[0];
    if (!inactive) throw new Error("regional capacity fixture has no inactive world");
    const overCapacity = {
      ...snapshotPhysicalCargoState(state),
      inactiveWorlds: Array.from(
        { length: PHYSICAL_CARGO_MAX_INACTIVE_WORLDS + 1 },
        () => inactive,
      ),
    };
    expect(validatePhysicalCargoState(overCapacity, player, width, height).reason)
      .toBe("invalid-inactive-worlds");

    const saturated = resealPhysicalCargoState(state, {
      lastSourceOrdinal: Number.MAX_SAFE_INTEGER,
    });
    expect(() => quotePhysicalCargoSource(saturated, "gather", "no-space"))
      .toThrow(/identity space is exhausted/u);
    const transitioned = transitionPhysicalCargoRegion(
      saturated,
      { x: 77, y: -88 },
      width,
      height,
    );
    expect(transitioned.lastSourceOrdinal).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("queries nine live partitions logarithmically across thousands of inactive histories", () => {
    const { world, player } = fixture();
    const pristine = createPhysicalCargoStateFromPlayer(
      player,
      world.terrain.width,
      world.terrain.height,
    );
    const initial = commitPromiseDrop(pristine);
    mirrorPhysicalCarrierToPlayer(initial, player);
    const inactiveWorlds = Array.from({ length: 2_048 }, (_, index) => {
      const region = { x: index + 1, y: -17 };
      const advanced = stepLooseCargo(
        createLooseCargoWorld(world.terrain.width, world.terrain.height, region),
        [],
      );
      if (!advanced.ok) throw new Error(`large partition fixture failed: ${advanced.reason}`);
      const regionKey = looseCargoRegionKey(region);
      return {
        regionKey,
        world: advanced.state,
        integrity: hashCanonical({ regionKey, world: advanced.state }),
      };
    }).sort((left, right) => left.regionKey < right.regionKey ? -1 : left.regionKey > right.regionKey ? 1 : 0);
    const admitted = validatePhysicalCargoState(
      resealPhysicalCargoState(initial, { inactiveWorlds }),
      player,
      world.terrain.width,
      world.terrain.height,
    );
    if (!admitted.valid || !admitted.state) {
      throw new Error(`large partition fixture was rejected: ${admitted.reason}`);
    }
    const requested = [
      { x: 0, y: 0 },
      { x: 1, y: -17 },
      { x: 7, y: -17 },
      { x: 73, y: -17 },
      { x: 511, y: -17 },
      { x: 1_024, y: -17 },
      { x: 1_777, y: -17 },
      { x: 2_048, y: -17 },
      { x: 99_999, y: -17 },
    ];

    const query = queryPhysicalCargoPartitions(admitted.state, requested);

    expect(query.requestedRegionCount).toBe(9);
    expect(query.worlds.map(({ region }) => looseCargoRegionKey(region))).toEqual([
      "r:0:0",
      "r:1024:-17",
      "r:1777:-17",
      "r:1:-17",
      "r:2048:-17",
      "r:511:-17",
      "r:73:-17",
      "r:7:-17",
    ]);
    const maximumBinaryProbes = (requested.length - 1)
      * (Math.ceil(Math.log2(inactiveWorlds.length)) + 1);
    expect(query.inactiveProbeCount).toBeLessThanOrEqual(maximumBinaryProbes);
    expect(query.inactiveProbeCount).toBeLessThan(inactiveWorlds.length / 10);
    expect(query.worlds[0]).toBe(admitted.state.looseWorld);
    const activeEntity = admitted.state.looseWorld.entities[0];
    if (!activeEntity) throw new Error("large partition fixture has no active parcel");
    const stepped = stepPhysicalCargoAcrossRegions(admitted.state, [{
      region: admitted.state.activeRegion,
      expectedRevision: admitted.state.looseWorld.revision,
      samples: [{
        entityId: activeEntity.id,
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
      }],
    }]);
    expect(stepped.ok).toBe(true);
    // A local 100 ms parcel tick path-copies no inactive node at all, even
    // with thousands of durable histories behind it.
    expect(stepped.state.inactiveWorldIndex).toBe(admitted.state.inactiveWorldIndex);
    expect(stepped.state.expectedManifest).toBe(admitted.state.expectedManifest);
    const audit = inspectPhysicalCargoPartitionIndex(stepped.state);
    expect(audit).toMatchObject({ valid: true, size: 2_048, maximumBalance: 1 });
    expect(audit.height).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(audit.size + 1)));
    const wire = snapshotPhysicalCargoState(stepped.state);
    expect(audit.sidecarSerializedBytes).toBe(
      new TextEncoder().encode(JSON.stringify(wire)).byteLength,
    );

    const transitioned = transitionPhysicalCargoRegion(
      stepped.state,
      { x: 1_024, y: -17 },
      world.terrain.width,
      world.terrain.height,
    );
    const transitionAudit = inspectPhysicalCargoPartitionIndex(transitioned);
    expect(transitionAudit).toMatchObject({ valid: true, size: 2_048, maximumBalance: 1 });
    expect(validatePhysicalCargoState(
      structuredClone(snapshotPhysicalCargoState(transitioned)),
      player,
      world.terrain.width,
      world.terrain.height,
    )).toMatchObject({ valid: true, reason: "valid" });
    expect(() => queryPhysicalCargoPartitions(
      admitted.state!,
      Array.from({ length: 82 }, (_, x) => ({ x, y: 0 })),
    )).toThrow(/bounded live neighborhood/u);
  });

  it("derives global Promise custody from the conserved manifest without visiting partitions", () => {
    const { world, player } = fixture();
    const initial = createPhysicalCargoStateFromPlayer(
      player,
      world.terrain.width,
      world.terrain.height,
    );
    expect(physicalCargoPromiseCustody(initial, 19)).toEqual({
      carriedQuantity: 2,
      looseQuantity: 0,
      condition: 830_000,
    });
    const dropped = commitPromiseDrop(initial);
    const distant = transitionPhysicalCargoRegion(
      dropped,
      { x: 8_000, y: -9_000 },
      world.terrain.width,
      world.terrain.height,
    );
    expect(physicalCargoPromiseCustody(distant, 19)).toEqual({
      carriedQuantity: 0,
      looseQuantity: 2,
      condition: 0,
    });
    expect(() => physicalCargoPromiseCustody(distant, -1)).toThrow(/contract identity/u);
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
    const snapshot = snapshotPhysicalCargoState(state);
    expect(validate({ ...snapshot, lastSourceOrdinal: 2 })).toBe("invalid-integrity");
    expect(validate({ ...snapshot, expectedManifest: { ...snapshot.expectedManifest, fingerprint: "tampered" } }))
      .toBe("invalid-integrity");
    expect(validate({ ...snapshot, carrier: { ...snapshot.carrier, lots: snapshot.carrier.lots.slice(1) } }))
      .toBe("invalid-integrity");
    const wrongMirror = structuredClone(player);
    wrongMirror.cargo[0]!.condition -= 1;
    expect(validate(state, wrongMirror)).toBe("player-mirror-mismatch");
  });

  it("rejects resealed inactive deletion, archive rollback, coordinate swaps, and parcel duplication", () => {
    const { world, player } = fixture();
    const width = world.terrain.width;
    const height = world.terrain.height;
    const initial = createPhysicalCargoStateFromPlayer(player, width, height);
    const dropped = commitPromiseDrop(initial);
    const activeEast = transitionPhysicalCargoRegion(dropped, { x: 1, y: 0 }, width, height);
    const inactive = physicalCargoInactiveWorlds(activeEast)[0];
    const parcel = inactive?.world.entities[0];
    if (!inactive || !parcel) throw new Error("regional tamper fixture is incomplete");
    const reason = (value: unknown) => validatePhysicalCargoState(
      value,
      player,
      width,
      height,
    ).reason;

    expect(reason(resealPhysicalCargoState(activeEast, { inactiveWorlds: [] })))
      .toBe("manifest-mismatch");
    expect(reason(resealPhysicalCargoState(activeEast, {
      inactiveWorlds: [{
        ...inactive,
        world: {
          ...inactive.world,
          historyBaseOrdinal: 1,
          historyArchiveHash: "1111111111111111",
          history: [],
        },
      }],
    }))).toBe("invalid-inactive-worlds");
    expect(reason(resealPhysicalCargoState(activeEast, {
      inactiveWorlds: [{ ...inactive, regionKey: "r:2:0" }],
    }))).toBe("invalid-inactive-worlds");
    expect(reason(resealPhysicalCargoState(activeEast, {
      inactiveWorlds: [{
        ...inactive,
        world: {
          ...inactive.world,
          entities: [{
            ...parcel,
            materialState: {
              ...parcel.materialState,
              condition: Math.min(1_000_000, parcel.materialState.condition + 1),
            },
          }],
        },
      }],
    }))).toBe("invalid-inactive-worlds");

    const duplicatedActiveWorld = {
      ...activeEast.looseWorld,
      revision: 1,
      lastEventOrdinal: parcel.lastEventOrdinal,
      historyBaseOrdinal: parcel.lastEventOrdinal,
      historyArchiveHash: "1111111111111111",
      entities: [parcel],
    };
    expect(validateLooseCargoWorld(duplicatedActiveWorld).valid).toBe(true);
    expect(reason(resealPhysicalCargoState(activeEast, {
      looseWorld: duplicatedActiveWorld,
    }))).toBe("duplicate-identity");
    expect(reason(resealPhysicalCargoState(activeEast, {
      inactiveWorlds: [inactive, inactive],
    }))).toBe("noncanonical-order");
    expect(reason(resealPhysicalCargoState(activeEast, {
      activeRegion: { x: 2, y: 0 },
      activeRegionKey: "r:2:0",
    }))).toBe("invalid-region");
    expect(reason({ ...activeEast, extra: "not canonical" })).toBe("invalid-state");
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
    // This is a deliberately adversarial max-entity/history workload. Keep a
    // strict finite ceiling, but leave enough host variance for shared CI
    // runners executing the complete suite in parallel.
    expect(elapsed).toBeLessThan(8_000);
  }, 10_000);
});

describe("atomic physical cargo seam handoff", () => {
  it("moves one exact parcel into an inactive neighbor and remains valid after reload", () => {
    const { world, player } = fixture();
    const width = world.terrain.width;
    const height = world.terrain.height;
    const initial = createPhysicalCargoStateFromPlayer(player, width, height);
    const dropped = dropLooseCargo(initial.looseWorld, initial.carrier, {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: width * FIXED_POINT - 10_000,
      y: 20 * FIXED_POINT + 500_000,
    });
    if (!dropped.ok || !dropped.entity) throw new Error(`seam drop failed: ${dropped.reason}`);
    const afterDrop = commitPhysicalCargoState(initial, {
      looseWorld: dropped.world,
      carrier: dropped.carrier,
    }, { kind: "conserved" });
    mirrorPhysicalCarrierToPlayer(afterDrop, player);
    const input = [{
      region: { x: 0, y: 0 },
      expectedRevision: afterDrop.looseWorld.revision,
      samples: [{
        entityId: dropped.entity.id,
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
      }],
    }] as const;
    const stepped = stepPhysicalCargoAcrossRegions(afterDrop, input);
    expect(stepped.ok).toBe(true);
    expect(stepped.handoffs).toHaveLength(1);
    expect(stepped.state.looseWorld.entities).toEqual([]);
    const east = physicalCargoWorlds(stepped.state).find(({ region }) =>
      region.x === 1 && region.y === 0);
    expect(east?.entities[0]).toMatchObject({
      id: dropped.entity.id,
      origin: dropped.entity.origin,
      payload: dropped.entity.payload,
      owner: dropped.entity.owner,
      velocityX: expect.any(Number),
    });
    expect(east?.entities[0]?.motion).not.toBe("boundary-rest");
    expect(stepped.state.expectedManifest).toEqual(initial.expectedManifest);
    expect(validatePhysicalCargoState(
      structuredClone(snapshotPhysicalCargoState(stepped.state)),
      player,
      width,
      height,
    )).toMatchObject({ valid: true, reason: "valid" });

    const staleReplay = stepPhysicalCargoAcrossRegions(stepped.state, input);
    expect(staleReplay).toMatchObject({ ok: false, reason: "stale-step" });
    expect(staleReplay.state).toBe(stepped.state);

    const activatedEast = transitionPhysicalCargoRegion(
      stepped.state,
      { x: 1, y: 0 },
      width,
      height,
    );
    expect(activatedEast.looseWorld.entities[0]?.id).toBe(dropped.entity.id);
    expect(activatedEast.expectedManifest).toEqual(initial.expectedManifest);

    const located = locatePhysicalCargoEntity(stepped.state, dropped.entity.id);
    if (!located) throw new Error("adjacent recovery could not locate handoff parcel");
    const recovered = pickupLooseCargo(located.world, stepped.state.carrier, {
      entityId: located.entity.id,
      x: located.entity.x,
      y: located.entity.y,
      reach: 0,
    });
    if (!recovered.ok) throw new Error(`adjacent recovery failed: ${recovered.reason}`);
    const afterRecovery = commitPhysicalCargoRegionalMutation(stepped.state, {
      looseWorld: recovered.world,
      carrier: recovered.carrier,
    }, { kind: "conserved" });
    expect(afterRecovery.activeRegion).toEqual({ x: 0, y: 0 });
    expect(locatePhysicalCargoEntity(afterRecovery, dropped.entity.id)).toBeNull();
    expect(afterRecovery.carrier.lots.some(({ payload }) =>
      payload.kind === "stack" && payload.item === "cordreed")).toBe(true);
    mirrorPhysicalCarrierToPlayer(afterRecovery, player);
    expect(validatePhysicalCargoState(
      structuredClone(snapshotPhysicalCargoState(afterRecovery)),
      player,
      width,
      height,
    )).toMatchObject({ valid: true, reason: "valid" });
  });

  it("commits one inactive-region provision consumption as an exact negative delta", () => {
    const { world, player } = fixture();
    const width = world.terrain.width;
    const height = world.terrain.height;
    const forageRegion = { x: -2, y: 3 } as const;
    const initial = createPhysicalCargoStateFromPlayer(player, width, height);
    const activatedForage = transitionPhysicalCargoRegion(
      initial,
      forageRegion,
      width,
      height,
    );
    const source = quotePhysicalCargoSource(
      activatedForage,
      "wildlife-forage",
      "physical-consumption-fixture",
    );
    const temporaryCarrier = createLooseCargoCarrier(
      { kind: "unclaimed" },
      createCraftingInventory(2 * PACK_LOAD_MILLI_PER_UNIT),
    );
    const provision = addLooseCargoProvision(temporaryCarrier, {
      sourceLotId: source.lotId,
      provision: "dried-fish",
      quantity: 1,
    });
    if (!provision.ok) throw new Error(`provision fixture failed: ${provision.reason}`);
    const dropped = dropLooseCargo(activatedForage.looseWorld, provision.carrier, {
      lotId: source.lotId,
      quantity: 1,
      x: 2 * FIXED_POINT + 250_000,
      y: 4 * FIXED_POINT + 750_000,
    });
    if (!dropped.ok || dropped.entity === null) {
      throw new Error(`provision drop fixture failed: ${dropped.reason}`);
    }
    const forageSeeded = commitPhysicalCargoState(activatedForage, {
      looseWorld: dropped.world,
      carrier: activatedForage.carrier,
      committedSourceOrdinal: source.ordinal,
    }, {
      kind: "delta",
      removed: [],
      added: [dropped.entity.payload],
    });
    const prior = transitionPhysicalCargoRegion(forageSeeded, { x: 0, y: 0 }, width, height);
    const located = locatePhysicalCargoEntity(prior, dropped.entity.id);
    if (located === null) throw new Error("provision fixture was not persisted regionally");
    const request = {
      actorId: "BEAR-v1-physical-consumption-fixture",
      entityId: located.entity.id,
      x: located.entity.x,
      y: located.entity.y,
      reach: 0,
    } as const;
    const consumed = consumeLooseCargoProvisionEntity(located.world, request);
    if (
      !consumed.ok
      || consumed.removedEntity === null
      || consumed.removedPayload === null
      || consumed.event === null
    ) throw new Error(`provision consumption failed: ${consumed.reason}`);
    const removedEntity = consumed.removedEntity;
    const removedPayload = consumed.removedPayload;

    // A physical removal cannot pass through the ordinary conserved path.
    expect(() => commitPhysicalCargoRegionalMutation(prior, {
      looseWorld: consumed.world,
      carrier: prior.carrier,
    }, { kind: "conserved" })).toThrow(/substance changed/u);
    // Nor can an adapter retain the entity while appending only a consume story.
    const smuggledHistory = {
      ...consumed.world,
      entities: [...consumed.world.entities, removedEntity],
    };
    expect(validateLooseCargoWorld(smuggledHistory).valid).toBe(true);
    expect(() => commitPhysicalCargoRegionalMutation(prior, {
      looseWorld: smuggledHistory,
      carrier: prior.carrier,
    }, { kind: "conserved" })).toThrow(/consume history must exactly remove/u);

    const beforeProvision = prior.expectedManifest.entries.find(
      ({ payloadKey }) => payloadKey === "provision:dried-fish",
    );
    if (beforeProvision === undefined) throw new Error("provision manifest entry is missing");
    const committed = commitPhysicalCargoRegionalMutation(prior, {
      looseWorld: consumed.world,
      carrier: prior.carrier,
    }, {
      kind: "delta",
      removed: [removedPayload],
      added: [],
    });

    expect(committed.activeRegion).toEqual({ x: 0, y: 0 });
    expect(locatePhysicalCargoEntity(committed, dropped.entity.id)).toBeNull();
    expect(committed.expectedManifest.entries).toEqual(
      prior.expectedManifest.entries.filter(({ payloadKey }) => payloadKey !== "provision:dried-fish"),
    );
    expect(prior.expectedManifest.totalQuantity - committed.expectedManifest.totalQuantity).toBe(1);
    expect(prior.expectedManifest.totalLoadMilli - committed.expectedManifest.totalLoadMilli)
      .toBe(beforeProvision.loadMilli);
    const committedForageWorld = physicalCargoWorldAt(committed, forageRegion);
    expect(committedForageWorld?.history.filter(({ kind }) => kind === "consume"))
      .toEqual([consumed.event]);

    const restored = validatePhysicalCargoState(
      structuredClone(snapshotPhysicalCargoState(committed)),
      player,
      width,
      height,
    );
    expect(restored).toMatchObject({ valid: true, reason: "valid" });
    if (restored.state === null) throw new Error("consumed provision did not survive reload");
    const restoredState = restored.state;
    expect(locatePhysicalCargoEntity(restoredState, dropped.entity.id)).toBeNull();
    const restoredForageWorld = physicalCargoWorldAt(restoredState, forageRegion);
    if (restoredForageWorld === null) throw new Error("consumption history region was not restored");
    expect(consumeLooseCargoProvisionEntity(restoredForageWorld, request))
      .toMatchObject({ ok: false, reason: "entity-not-found" });
    expect(() => commitPhysicalCargoRegionalMutation(restoredState, {
      looseWorld: restoredForageWorld,
      carrier: restoredState.carrier,
    }, {
      kind: "delta",
      removed: [removedPayload],
      added: [],
    })).toThrow(/substance changed/u);
  });

  it("fails closed when an interrupted representation duplicates or deletes the handoff parcel", () => {
    const { world, player } = fixture();
    const width = world.terrain.width;
    const height = world.terrain.height;
    const initial = createPhysicalCargoStateFromPlayer(player, width, height);
    const dropped = dropLooseCargo(initial.looseWorld, initial.carrier, {
      lotId: "crafting-stack:cordreed",
      quantity: 1,
      x: width * FIXED_POINT - 1,
      y: FIXED_POINT,
    });
    if (!dropped.ok || !dropped.entity) throw new Error(`interruption drop failed: ${dropped.reason}`);
    const afterDrop = commitPhysicalCargoState(initial, {
      looseWorld: dropped.world,
      carrier: dropped.carrier,
    }, { kind: "conserved" });
    mirrorPhysicalCarrierToPlayer(afterDrop, player);
    const stepped = stepPhysicalCargoAcrossRegions(afterDrop, [{
      region: { x: 0, y: 0 },
      expectedRevision: afterDrop.looseWorld.revision,
      samples: [{
        entityId: dropped.entity.id,
        environment: {
          rain: 0,
          heat: 0,
          cold: 0,
          immersion: FIXED_POINT,
          currentX: FIXED_POINT,
          currentY: 0,
          magicalWaterFlux: 0,
          impact: 0,
        },
        waterDepth: FIXED_POINT,
        downhillX: 0,
        downhillY: 0,
        tumbleImpact: 0,
        mangroveSnag: 0,
        brambleSnag: 0,
      }],
    }]);
    if (!stepped.ok) throw new Error(`interruption step failed: ${stepped.reason}`);
    const eastEntry = physicalCargoInactiveWorlds(stepped.state)
      .find(({ regionKey }) => regionKey === "r:1:0");
    const entity = eastEntry?.world.entities[0];
    if (!eastEntry || !entity) throw new Error("handoff destination missing");

    const duplicatedActive = {
      ...stepped.state.looseWorld,
      entities: [entity],
    };
    const duplicate = resealPhysicalCargoState(stepped.state, { looseWorld: duplicatedActive });
    expect(validatePhysicalCargoState(duplicate, player, width, height).reason)
      .toBe("duplicate-identity");

    const deletedWorld = { ...eastEntry.world, entities: [] };
    const deletedEntry = {
      regionKey: eastEntry.regionKey,
      world: deletedWorld,
      integrity: hashCanonical({ regionKey: eastEntry.regionKey, world: deletedWorld }),
    };
    const deleted = resealPhysicalCargoState(stepped.state, {
      inactiveWorlds: physicalCargoInactiveWorlds(stepped.state).map((entry) =>
        entry.regionKey === eastEntry.regionKey ? deletedEntry : entry),
    });
    expect(validatePhysicalCargoState(deleted, player, width, height).reason)
      .toBe("manifest-mismatch");
  });
});
