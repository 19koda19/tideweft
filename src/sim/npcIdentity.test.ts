import { describe, expect, it } from "vitest";

import {
  FIXED_POINT,
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  assertWorldInvariants,
  createWorld,
  createWorldView,
  deserializeWorld,
  generateResidentDisplayName,
  generateResidentIdentity,
  generateResidentNeeds,
  generateResidentTraits,
  residentRainProtection,
  residentRelationshipTrust,
  runTicks,
  seedFromText,
  serializeWorld,
  stableResidentId,
  stepWorld,
  type ResidentIdentityGenerationInput,
  type WorldState,
} from "./public";
import { hashCanonical } from "./util";
import { REGION_COORD_LIMIT } from "./regions";
import {
  RESIDENT_NAME_DICTIONARY_COUNTS,
  assertResidentNameDictionaries,
} from "./npcIdentity";

function generationInput(
  entityId = 17,
  originRegion = { x: 0, y: 0 },
): ResidentIdentityGenerationInput {
  return {
    seed: seedFromText("identity follows meaning, not allocation"),
    originSettlementId: entityId === 17 ? 31 : entityId,
    originSettlementKey: "ro1:semantic-origin:0:0:settlement:n:4",
    originActorOrdinal: 4,
    role: "navigator",
    originRegion,
  };
}

function priorSim4Save(world: WorldState): string {
  const legacy = structuredClone(world) as unknown as Record<string, unknown>;
  const meta = legacy.meta as Record<string, unknown>;
  meta.saveFormatVersion = 2;
  meta.rulesVersion = "tideweft-sim/4";
  const residents = legacy.residents as Array<Record<string, unknown>>;
  const settlements = legacy.settlements as Array<Record<string, unknown>>;
  for (const settlement of settlements) delete settlement.originKey;
  for (const resident of residents) {
    delete resident.identity;
    delete resident.condition;
    delete resident.playerKnowledge;
    delete resident.memories;
  }
  return JSON.stringify({
    format: "tideweft-world",
    saveFormatVersion: 2,
    rulesVersion: "tideweft-sim/4",
    checksum: hashCanonical(legacy),
    world: legacy,
  });
}

describe("persistent procedural resident identity", () => {
  it("keeps generation-v1 name dictionaries broad, normalized, and collision-free", () => {
    expect(RESIDENT_NAME_DICTIONARY_COUNTS).toEqual({ given: 226, family: 206 });
    expect(RESIDENT_NAME_DICTIONARY_COUNTS.given).toBeGreaterThanOrEqual(160);
    expect(RESIDENT_NAME_DICTIONARY_COUNTS.family).toBeGreaterThanOrEqual(160);
    expect(() => assertResidentNameDictionaries()).not.toThrow();
  });

  it("freezes representative generation-v1 names for deterministic seeds", () => {
    const cases: ResidentIdentityGenerationInput[] = [
      {
        ...generationInput(),
        seed: seedFromText("golden harbor one"),
        originSettlementKey: "ro1:semantic-origin:0:0:settlement:n:0",
        originActorOrdinal: 0,
      },
      {
        ...generationInput(),
        seed: seedFromText("golden harbor two"),
        originSettlementKey: "ro1:semantic-origin:0:0:settlement:n:6",
        originActorOrdinal: 5,
      },
      {
        ...generationInput(),
        seed: seedFromText("golden highland"),
        originSettlementKey: "ro1:remote:n304:p719:settlement:survey",
        originSettlementId: 8_811,
        originActorOrdinal: 23,
        role: "medic",
        originRegion: { x: -304, y: 719 },
      },
      {
        ...generationInput(),
        seed: seedFromText("golden far shore"),
        originSettlementKey: "ro1:remote:p900001:n800002:settlement:harbor",
        originSettlementId: 9_812,
        originActorOrdinal: 81,
        role: "fisher",
        originRegion: { x: 900_001, y: -800_002 },
      },
    ];

    const names = cases.map((input) => generateResidentDisplayName(input));
    expect(names).toEqual([
      "Selam Vargas",
      "Aziz Moreno",
      "Mei Khan",
      "Conor Breaker",
    ]);
    expect(cases.map((input) => generateResidentDisplayName({ ...input }))).toEqual(names);
  });

  it("gives every compatibility resident a unique given name across seeds", () => {
    for (const seedLabel of [
      "forty-two names north",
      "forty-two names south",
      "forty-two names rain",
      "forty-two names calm",
      "forty-two names distant",
      "forty-two names negative",
    ]) {
      const names: string[] = [];
      const givenNames: string[] = [];
      for (let settlementOrdinal = 0; settlementOrdinal < 7; settlementOrdinal += 1) {
        for (let actorOrdinal = 0; actorOrdinal < 6; actorOrdinal += 1) {
          const name = generateResidentDisplayName({
            ...generationInput(),
            seed: seedFromText(seedLabel),
            originSettlementId: 10 + settlementOrdinal,
            originSettlementKey: `ro1:semantic-origin:0:0:settlement:n:${settlementOrdinal}`,
            originActorOrdinal: actorOrdinal,
          });
          names.push(name);
          givenNames.push(name.slice(0, name.lastIndexOf(" ")));
        }
      }
      expect(names).toHaveLength(42);
      expect(new Set(names).size).toBe(42);
      expect(new Set(givenNames).size).toBe(42);
    }
  });

  it("derives display identity from semantic origin rather than allocator order", () => {
    const first = generationInput(17);
    const reallocated = generationInput(999_999);

    expect(generateResidentDisplayName(first)).toBe(generateResidentDisplayName(reallocated));
    expect(stableResidentId(first)).toBe(stableResidentId(reallocated));
    expect(generateResidentIdentity(first)).toMatchObject({
      stableId: generateResidentIdentity(reallocated).stableId,
      appearance: generateResidentIdentity(reallocated).appearance,
      temperament: generateResidentIdentity(reallocated).temperament,
      skills: generateResidentIdentity(reallocated).skills,
    });
    expect(generateResidentTraits(first)).toEqual(generateResidentTraits(reallocated));
    expect(generateResidentNeeds(first)).toEqual(generateResidentNeeds(reallocated));
  });

  it("derives symmetric relationship trust from persistent identities, not allocator IDs or argument order", () => {
    const seed = seedFromText("relationships remember people rather than slots");
    const leftFirst = stableResidentId({ ...generationInput(17), seed, originActorOrdinal: 1 });
    const leftReallocated = stableResidentId({ ...generationInput(900_017), seed, originActorOrdinal: 1 });
    const rightFirst = stableResidentId({ ...generationInput(18), seed, originActorOrdinal: 5 });
    const rightReallocated = stableResidentId({ ...generationInput(900_018), seed, originActorOrdinal: 5 });

    expect(leftReallocated).toBe(leftFirst);
    expect(rightReallocated).toBe(rightFirst);
    expect(residentRelationshipTrust(seed, leftFirst, rightFirst)).toBe(
      residentRelationshipTrust(seed, leftReallocated, rightReallocated),
    );
    expect(residentRelationshipTrust(seed, leftFirst, rightFirst)).toBe(
      residentRelationshipTrust(seed, rightFirst, leftFirst),
    );
  });

  it("assigns generated relationship trust from stable actor pairs even if resident arrays are reordered", () => {
    const world = createWorld("relationship order cannot reroll people", "standard");
    const expected = new Map<string, number>();
    for (const resident of world.residents) {
      for (const relationship of resident.relationships) {
        const related = world.residents.find(({ id }) => id === relationship.residentId);
        if (!related) throw new Error("fixture relationship target is missing");
        expected.set(
          `${resident.identity.stableId}|${related.identity.stableId}`,
          residentRelationshipTrust(
            world.meta.rootSeed,
            resident.identity.stableId,
            related.identity.stableId,
          ),
        );
        expect(relationship.trust).toBe(expected.get(
          `${resident.identity.stableId}|${related.identity.stableId}`,
        ));
      }
    }

    const reorderedResidents = [...world.residents].reverse();
    for (const resident of reorderedResidents) {
      for (const relationship of resident.relationships) {
        const related = reorderedResidents.find(({ id }) => id === relationship.residentId);
        if (!related) throw new Error("reordered fixture relationship target is missing");
        expect(relationship.trust).toBe(expected.get(
          `${resident.identity.stableId}|${related.identity.stableId}`,
        ));
      }
    }
    expect(() => assertWorldInvariants(world)).not.toThrow();
  });

  it("keeps stable IDs deterministic and distinct at negative and extreme coordinates", () => {
    const negative = generationInput(17, { x: -304, y: 719 });
    const extreme = generationInput(17, {
      x: -REGION_COORD_LIMIT,
      y: REGION_COORD_LIMIT,
    });

    expect(stableResidentId(negative)).toBe(stableResidentId({ ...negative }));
    expect(stableResidentId(extreme)).toBe(stableResidentId({ ...extreme }));
    expect(stableResidentId(negative)).not.toBe(stableResidentId(extreme));
    expect(stableResidentId(negative)).toContain("-n8gpjz-");
  });

  it("rejects noncanonical regions and root seeds before identity hashing", () => {
    const input = generationInput();
    expect(() => stableResidentId({ ...input, originRegion: { x: -0, y: 0 } })).toThrow(RangeError);
    expect(() => stableResidentId({
      ...input,
      originRegion: { x: REGION_COORD_LIMIT + 1, y: 0 },
    })).toThrow(RangeError);
    expect(() => stableResidentId({
      ...input,
      seed: [-0, 1, 2, 3],
    })).toThrow(RangeError);
    expect(() => stableResidentId({
      ...input,
      seed: [0x1_0000_0000, 1, 2, 3],
    })).toThrow(RangeError);
  });

  it("generates the same unique compatibility population without rerolling", () => {
    const first = createWorld("the same forty-two people", "standard");
    const second = createWorld("the same forty-two people", "standard");

    expect(first.residents.map(({ name, identity, condition }) => ({ name, identity, condition })))
      .toEqual(second.residents.map(({ name, identity, condition }) => ({ name, identity, condition })));
    expect(new Set(first.residents.map(({ identity }) => identity.stableId)).size).toBe(42);
    expect(first.residents.every(({ identity }) =>
      identity.originRegion.x === 0 && identity.originRegion.y === 0
    )).toBe(true);
    assertWorldInvariants(first);
  });

  it("keeps immutable resident origins stable when a settlement display name changes", () => {
    const world = createWorld("a harbor can be renamed without erasing its people", "standard");
    const resident = world.residents[0];
    const home = world.settlements.find(({ id }) => id === resident?.homeSettlementId);
    if (!resident || !home) throw new Error("fixture needs a resident home");
    const stableId = resident.identity.stableId;
    const originKey = home.originKey;

    home.name = "New Lantern Reach";

    expect(home.originKey).toBe(originKey);
    expect(resident.identity.stableId).toBe(stableId);
    expect(() => assertWorldInvariants(world)).not.toThrow();
    expect(deserializeWorld(serializeWorld(world)).residents[0]?.identity.stableId).toBe(stableId);
  });

  it("keeps identity valid when current population order changes or a person relocates", () => {
    const world = createWorld("a person is not their array position", "standard");
    const resident = world.residents[0];
    const origin = world.settlements.find(({ id }) => id === resident?.homeSettlementId);
    const destination = world.settlements.find(({ id }) => id !== resident?.homeSettlementId);
    const counterpart = world.residents.find(({ homeSettlementId }) => homeSettlementId === destination?.id);
    if (!resident || !origin || !destination || !counterpart) throw new Error("fixture needs two settlements");
    const before = structuredClone(resident.identity);
    const counterpartBefore = structuredClone(counterpart.identity);

    origin.residentIds.reverse();
    expect(() => assertWorldInvariants(world)).not.toThrow();

    origin.residentIds = origin.residentIds.map((id) => id === resident.id ? counterpart.id : id);
    destination.residentIds = destination.residentIds.map((id) => id === counterpart.id ? resident.id : id);
    resident.homeSettlementId = destination.id;
    resident.location = { kind: "settlement", settlementId: destination.id };
    counterpart.homeSettlementId = origin.id;
    counterpart.location = { kind: "settlement", settlementId: origin.id };

    expect(resident.identity).toEqual(before);
    expect(counterpart.identity).toEqual(counterpartBefore);
    expect(() => assertWorldInvariants(world)).not.toThrow();
    expect(deserializeWorld(serializeWorld(world)).residents[0]?.identity).toEqual(before);
  });

  it("generates only curated, non-opposing temperament pairs", () => {
    const incompatible = new Set([
      "bold|cautious",
      "cautious|bold",
      "calm|nervous",
      "nervous|calm",
      "reserved|social",
      "social|reserved",
    ]);
    for (let ordinal = 0; ordinal < 512; ordinal += 1) {
      const identity = generateResidentIdentity({
        ...generationInput(),
        originActorOrdinal: ordinal,
      });
      expect(incompatible.has(identity.temperament.join("|"))).toBe(false);
    }
  });

  it("migrates sim/4 format-2 residents without changing legacy world truth", () => {
    const source = createWorld("old names remain their names", "standard");
    runTicks(source, 7);
    const legacyName = "Mara Legacy-Name";
    const firstResident = source.residents[0];
    if (!firstResident) throw new Error("fixture needs a resident");
    firstResident.name = legacyName;
    const preserved = {
      tick: source.meta.completedTick,
      residents: source.residents.map(({ id, name, role, homeSettlementId, activeContractId, location }) => ({
        id,
        name,
        role,
        homeSettlementId,
        activeContractId,
        location,
      })),
      contracts: structuredClone(source.contracts),
      ledger: structuredClone(source.ledger),
    };

    const migrated = deserializeWorld(priorSim4Save(source));
    expect(migrated.meta).toMatchObject({
      completedTick: preserved.tick,
      saveFormatVersion: SAVE_FORMAT_VERSION,
      rulesVersion: RULES_VERSION,
    });
    expect(migrated.residents.map(({ id, name, role, homeSettlementId, activeContractId, location }) => ({
      id,
      name,
      role,
      homeSettlementId,
      activeContractId,
      location,
    }))).toEqual(preserved.residents);
    expect(migrated.residents[0]?.name).toBe(legacyName);
    expect(migrated.contracts).toEqual(preserved.contracts);
    expect(migrated.ledger).toEqual(preserved.ledger);
    expect(migrated.residents.every(({ identity, memories }) =>
      identity.species === "human" && memories.length === 0
    )).toBe(true);
    assertWorldInvariants(migrated);
    expect(deserializeWorld(serializeWorld(migrated))).toEqual(migrated);
  });

  it("observes and greets without revealing facts early or farming memories", () => {
    const world = createWorld("a greeting becomes history", "standard");
    const resident = world.residents[0];
    if (!resident) throw new Error("fixture needs a resident");

    stepWorld(world, [{ id: "observe-once", type: "observe-resident", residentId: resident.id }]);
    expect(resident.playerKnowledge).toMatchObject({
      level: "recognized",
      firstObservedTick: 1,
      introducedTick: null,
      facts: [],
    });
    expect(resident.memories).toEqual([]);

    stepWorld(world, [{
      id: "greet-once",
      type: "greet-resident",
      residentId: resident.id,
      observedTick: 1,
    }]);
    expect(resident.playerKnowledge).toMatchObject({
      level: "acquainted",
      firstObservedTick: 1,
      introducedTick: 2,
      facts: ["name", "occupation", "home"],
    });
    expect(resident.memories).toHaveLength(1);
    expect(resident.memories[0]).toMatchObject({ kind: "met-player", cause: "PLAYER_GREETING" });

    stepWorld(world, [{
      id: "greet-again",
      type: "greet-resident",
      residentId: resident.id,
      observedTick: 1,
    }]);
    expect(resident.memories).toHaveLength(1);
    expect(world.events.filter(({ type, subjectId }) =>
      type === "resident-introduced" && subjectId === resident.id
    )).toHaveLength(1);
    expect(world.events.find(({ type }) => type === "resident-observed")?.data.commandId)
      .toBe("observe-once");
    expect(world.events.find(({ type }) => type === "resident-introduced")?.data.commandId)
      .toBe("greet-once");
    assertWorldInvariants(world);
  });

  it("rejects greeting without the matching prior observation and rejects leaked recognized facts", () => {
    const world = createWorld("introduction requires witnessed presence", "standard");
    const resident = world.residents[0];
    if (!resident) throw new Error("fixture needs a resident");

    stepWorld(world, [{
      id: "remote-greeting",
      type: "greet-resident",
      residentId: resident.id,
      observedTick: 0,
    }]);
    expect(resident.playerKnowledge.level).toBe("unfamiliar");
    expect(world.events.at(-1)).toMatchObject({
      type: "command-rejected",
      data: { commandId: "remote-greeting", reason: "resident has not been observed" },
    });

    stepWorld(world, [{ id: "observe-for-proof", type: "observe-resident", residentId: resident.id }]);
    stepWorld(world, [{
      id: "stale-observation",
      type: "greet-resident",
      residentId: resident.id,
      observedTick: 999,
    }]);
    expect(resident.playerKnowledge.level).toBe("recognized");
    resident.playerKnowledge.facts = ["name"];
    expect(() => assertWorldInvariants(world)).toThrow(/recognized facts leak identity/u);
  });

  it("uses gear and weather skill to reduce actual route exposure", () => {
    const world = createWorld("rain finds every traveler differently", "standard");
    const route = world.routes[0];
    if (!route) throw new Error("fixture needs a route");
    const ranked = [...world.residents].sort((left, right) =>
      residentRainProtection(left.identity) - residentRainProtection(right.identity)
    );
    const exposed = ranked[0];
    const protectedResident = ranked.at(-1);
    if (!exposed || !protectedResident || exposed.id === protectedResident.id) {
      throw new Error("fixture needs different rain protection profiles");
    }
    expect(residentRainProtection(protectedResident.identity))
      .toBeGreaterThan(residentRainProtection(exposed.identity));
    for (const resident of [exposed, protectedResident]) {
      resident.location = { kind: "route", routeId: route.id, progress: 0 };
      resident.condition.wetness = 0;
      resident.condition.coldStress = 0;
    }
    world.weather = {
      kind: "rain",
      intensity: 650_000,
      windX: 300_000,
      windY: -250_000,
      nextChangeTick: 1_000,
    };

    stepWorld(world);
    expect(protectedResident.condition.wetness).toBeLessThan(exposed.condition.wetness);
    expect(protectedResident.condition.coldStress).toBeLessThan(exposed.condition.coldStress);
    expect(exposed.condition.emotionCause).toBe("WEATHER_EXPOSURE");
  });

  it("pauses a courier in severe weather and advances the real arrival by the exact delay", () => {
    const world = createWorld("the porter waits out the squall", "standard");
    const contract = world.contracts.find(({ status }) => status === "offered");
    if (!contract) throw new Error("fixture needs an offered contract");
    const resident = world.residents.find(({ location }) =>
      location.kind === "settlement" && location.settlementId === contract.originSettlementId
    );
    if (!resident) throw new Error("fixture needs an origin porter");

    stepWorld(world, [{
      id: "porter-accepts",
      type: "accept-contract",
      carrier: "resident",
      contractId: contract.id,
      residentId: resident.id,
    }]);
    stepWorld(world);
    expect(contract.status).toBe("in-transit");
    const originalArrival = contract.arrivalTick;
    const originalProgress = resident.location.kind === "route" ? resident.location.progress : null;
    if (originalArrival === null || originalProgress === null) throw new Error("porter did not depart");
    world.weather = {
      kind: "storm",
      intensity: 950_000,
      windX: 500_000,
      windY: -500_000,
      nextChangeTick: world.meta.completedTick + 1_000,
    };

    stepWorld(world);
    expect(resident.condition.wetness).toBeGreaterThan(0);
    expect(resident.condition.coldStress).toBeGreaterThan(0);
    expect(resident.condition.sheltering).toBe(true);
    const wetnessWhenHolding = resident.condition.wetness;
    const coldStressWhenHolding = resident.condition.coldStress;
    runTicks(world, 3);
    expect(resident.condition).toMatchObject({
      sheltering: true,
      routeDelayTicks: 4,
      emotionCause: "WEATHER_EXPOSURE",
    });
    expect(contract.arrivalTick).toBe(originalArrival + 4);
    expect(resident.location).toMatchObject({ progress: originalProgress });
    expect(resident.condition.wetness).toBeGreaterThan(wetnessWhenHolding);
    expect(resident.condition.coldStress).toBeGreaterThan(coldStressWhenHolding);
    expect(resident.memories.some(({ kind }) => kind === "weather-shelter")).toBe(true);

    world.weather = {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: world.meta.completedTick + 1_000,
    };
    resident.condition.coldStress = 0;
    stepWorld(world);
    expect(resident.condition.sheltering).toBe(false);
    expect(resident.condition.emotionCause).toBe("SHELTER_REACHED");
    expect(contract.arrivalTick).toBe(originalArrival + 4);
    expect(world.events.some(({ type, subjectId }) =>
      type === "resident-resumed" && subjectId === resident.id
    )).toBe(true);

    const remaining = (contract.arrivalTick ?? world.meta.completedTick) - world.meta.completedTick;
    runTicks(world, Math.max(0, remaining));
    expect(contract.status).toBe("fulfilled");
    expect(resident.condition).toMatchObject({
      emotion: "relieved",
      emotionCause: "PROMISE_DELIVERED",
    });
    const destination = world.settlements.find(({ id }) =>
      resident.location.kind === "settlement" && id === resident.location.settlementId
    );
    if (!destination) throw new Error("delivered porter has no physical destination");
    for (const settlement of world.settlements) {
      for (const recipe of settlement.recipes) recipe.nextRunTick = world.meta.completedTick + 1_000;
    }
    const destinationPopulation = world.residents.filter(({ location }) =>
      location.kind === "settlement" && location.settlementId === destination.id
    ).length;
    const expectedRation = Math.max(1, Math.ceil(destinationPopulation / 3));
    const foodBeforeNeedsTick = destination.inventory.food;
    const waterBeforeNeedsTick = destination.inventory.freshWater;
    const residentFoodNeedBefore = resident.needs.food;
    const ticksToNeedsUpdate = 60 - (world.meta.completedTick % 60);
    runTicks(world, ticksToNeedsUpdate);
    expect(resident.needs.food).not.toBe(residentFoodNeedBefore);
    expect(destination.inventory.food).toBe(foodBeforeNeedsTick - expectedRation);
    expect(destination.inventory.freshWater).toBe(waterBeforeNeedsTick - expectedRation);
    assertWorldInvariants(world);
  });

  it("advances travelers' needs without consuming rations from the home they left", () => {
    const world = createWorld("travelers do not eat from a distant cupboard", "standard");
    const home = world.settlements[0];
    const route = world.routes.find((candidate) =>
      candidate.fromSettlementId === home?.id || candidate.toSettlementId === home?.id
    );
    if (!home || !route) throw new Error("fixture needs a settlement route");
    const homeResidentIds = new Set(home.residentIds);
    const travelers = world.residents.filter(({ id }) => homeResidentIds.has(id));
    if (travelers.length !== home.residentIds.length) throw new Error("fixture resident is missing");
    for (const resident of travelers) {
      resident.location = { kind: "route", routeId: route.id, progress: 250_000 };
    }
    for (const settlement of world.settlements) {
      for (const recipe of settlement.recipes) recipe.nextRunTick = 1_000;
    }
    world.weather = {
      kind: "clear",
      intensity: 0,
      windX: 0,
      windY: 0,
      nextChangeTick: 1_000,
    };
    const foodBefore = home.inventory.food;
    const waterBefore = home.inventory.freshWater;
    const foodConsumedBefore = world.ledger.consumed.food;
    const waterConsumedBefore = world.ledger.consumed.freshWater;
    const expectedOtherSettlementRations = world.settlements.reduce((total, settlement) => {
      if (settlement.id === home.id) return total;
      const present = world.residents.filter((resident) =>
        resident.location.kind === "settlement" && resident.location.settlementId === settlement.id
      ).length;
      return total + (present === 0 ? 0 : Math.max(1, Math.ceil(present / 3)));
    }, 0);
    const travelerFoodBefore = travelers.map((resident) => resident.needs.food);

    runTicks(world, 60);

    expect(home.inventory.food).toBe(foodBefore);
    expect(home.inventory.freshWater).toBe(waterBefore);
    for (const [index, resident] of travelers.entries()) {
      expect(resident.needs.food).toBeGreaterThan(travelerFoodBefore[index] ?? FIXED_POINT);
      expect(resident.intention).toBe("work");
    }
    expect(world.ledger.consumed.food - foodConsumedBefore).toBe(expectedOtherSettlementRations);
    expect(world.ledger.consumed.freshWater - waterConsumedBefore).toBe(expectedOtherSettlementRations);
    assertWorldInvariants(world);
  });

  it("makes clear-weather route travel exerting and lets strong dry wind create cold pressure", () => {
    const world = createWorld("dry wind still reaches a walking porter", "standard");
    const resident = world.residents[0];
    const route = world.routes[0];
    if (!resident || !route) throw new Error("fixture needs a resident and route");
    resident.location = { kind: "route", routeId: route.id, progress: 300_000 };
    resident.condition.exhaustion = 100_000;
    resident.condition.coldStress = 0;
    resident.condition.wetness = 0;
    world.weather = {
      kind: "clear",
      intensity: 0,
      windX: 900_000,
      windY: 900_000,
      nextChangeTick: 1_000,
    };

    stepWorld(world);

    expect(resident.condition.exhaustion).toBeGreaterThan(100_000);
    expect(resident.condition.coldStress).toBeGreaterThan(0);
    assertWorldInvariants(world);
  });

  it("deep-copies hidden identity, condition, knowledge, and memory fields into views", () => {
    const world = createWorld("the view cannot rewrite the person", "standard");
    const resident = world.residents[0];
    if (!resident) throw new Error("fixture needs a resident");
    stepWorld(world, [{ id: "observe-for-view", type: "observe-resident", residentId: resident.id }]);
    stepWorld(world, [{
      id: "greet-for-view",
      type: "greet-resident",
      residentId: resident.id,
      observedTick: 1,
    }]);
    const view = createWorldView(world);
    const viewed = view.residents[0];
    if (!viewed) throw new Error("fixture needs a viewed resident");

    viewed.identity.originRegion.x = 99;
    viewed.identity.temperament[0] = "bold";
    viewed.identity.skills[0]!.aptitude = 0;
    viewed.identity.history[0]!.worldDay = 999;
    viewed.condition.wetness = FIXED_POINT;
    viewed.playerKnowledge.facts.length = 0;
    viewed.memories[0]!.tick = 999;

    expect(resident.identity.originRegion.x).toBe(0);
    expect(resident.identity.temperament).not.toEqual(viewed.identity.temperament);
    expect(resident.identity.skills[0]?.aptitude).not.toBe(0);
    expect(resident.identity.history[0]?.worldDay).not.toBe(999);
    expect(resident.condition.wetness).not.toBe(FIXED_POINT);
    expect(resident.playerKnowledge.facts).toEqual(["name", "occupation", "home"]);
    expect(resident.memories[0]?.tick).toBe(2);
  });

  it("fails closed on every authored resident enum family", () => {
    const cases: Array<readonly [string, (resident: WorldState["residents"][number]) => void]> = [
      ["role", (resident) => { (resident as unknown as { role: string }).role = "oracle"; }],
      ["intention", (resident) => { (resident as unknown as { intention: string }).intention = "vanish"; }],
      ["age", (resident) => { (resident.identity as unknown as { age: string }).age = "ancient"; }],
      ["build", (resident) => { (resident.identity as unknown as { build: string }).build = "impossible"; }],
      ["hair", (resident) => { (resident.identity.appearance as unknown as { hair: string }).hair = "ultraviolet"; }],
      ["mark", (resident) => { (resident.identity.appearance as unknown as { mark: string }).mark = "unknown"; }],
      ["palette", (resident) => { (resident.identity.appearance as unknown as { palette: string }).palette = "void"; }],
      ["history", (resident) => {
        (resident.identity.history[0] as unknown as { kind: string }).kind = "invented-history";
      }],
      ["emotion", (resident) => { (resident.condition as unknown as { emotion: string }).emotion = "random"; }],
      ["emotion cause", (resident) => {
        (resident.condition as unknown as { emotionCause: string }).emotionCause = "RANDOM_EVENT";
      }],
    ];

    for (const [label, mutate] of cases) {
      const world = createWorld(`invalid resident ${label}`, "standard");
      const resident = world.residents[0];
      if (!resident || !resident.identity.history[0]) throw new Error("fixture needs resident history");
      mutate(resident);
      expect(() => assertWorldInvariants(world), label).toThrow(/World invariant failed/u);
    }
  });
});
