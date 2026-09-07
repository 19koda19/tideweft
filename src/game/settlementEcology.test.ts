import { describe, expect, it } from "vitest";

import { createActorObservation } from "../sim/actorPerception";
import { REGION_COORD_LIMIT, createRegionCoord, type RegionCoord } from "../sim/regions";
import { seedFromText, type RootSeed } from "../sim/rng";
import { createActorScentObservation } from "../sim/scentPerception";
import { FIXED_POINT } from "../sim/types";
import {
  createCoreEcologyAggregatePatch,
  type CoreEcologyAggregatePatchState,
  type CoreEcologyPopulationInput,
} from "./coreEcology";
import {
  deriveCoreEcologyHarborEdgeHabitatAssemblage,
  type CoreEcologyHarborEdgeHabitatAssemblage,
} from "./coreEcologyHabitat";
import {
  CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
  stepCoreEcologySettlementShadows,
  type CoreEcologySettlementShadowsEvent,
  type CoreEcologySettlementShadowsStimulusFrame,
} from "./coreEcologySmallWorld";
import { LOCAL_PLAYER_LIVING_ACTOR_ID } from "./livingSpeciesRegistry";
import {
  SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION,
  SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_PRIOR_VERSION,
  SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
  SETTLEMENT_DOMESTIC_HOME_STRUCTURE_VERSION,
  SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY,
  SETTLEMENT_ECOLOGY_MAX_DOMESTIC_CUSTODIES,
  SETTLEMENT_ECOLOGY_PLURAL_CUSTODY_VERSION,
  SETTLEMENT_ECOLOGY_PRIOR_VERSION,
  SETTLEMENT_ECOLOGY_STOREHOUSE_VERSION,
  SETTLEMENT_ECOLOGY_VERSION,
  applySettlementKeeperStoreResponse,
  canonicalizeSettlementEcologyState,
  createSettlementDomesticAnimalCustody,
  createSettlementEcologyState,
  createSettlementPlayerStoreReport,
  deserializeSettlementEcologyState,
  establishSettlementDomesticAnimalCustody,
  migrateSettlementEcologyState,
  projectSettlementFoodStoreSource,
  proposeSettlementKeeperStoreResponse,
  proposeSettlementRatAttraction,
  recordSettlementKeeperKnowledge,
  recoverPendingSettlementDomesticFoodUse,
  recoverPendingSettlementFoodLoss,
  resolveSettlementDomesticFoodUse,
  resolveSettlementFoodLoss,
  serializeSettlementEcologyState,
  stageSettlementDomesticFoodUse,
  stageSettlementFoodLoss,
  type CreateSettlementDomesticAnimalCustodyInput,
  type SettlementDomesticFoodUseRequest,
  type SettlementEcologyState,
  type SettlementRatAttractionProposal,
} from "./settlementEcology";
import {
  WORLD_POSITION_UNITS_PER_TILE,
  createWorldPosition,
  translateWorldPosition,
  type WorldPosition,
} from "./worldPosition";

const SEED = seedFromText("alpha 23 storehouse door");
const ORIGIN = createRegionCoord(-91, 37);
const KEEPER_ID = "H-v1-alpha23-keeper";
const CAT_ID = "CAT-v1-alpha23-store";
const DOMESTIC_DOG_ID = "D-v1-alpha26-settlement-dog";
const DOMESTIC_MEMBER_IDS = [
  "CHICKEN-v1-alpha24-hen-a",
  "CHICKEN-v1-alpha24-hen-b",
] as const;
const DOMESTIC_GROUP_ID = "CHICKEN-FLOCK-v1-alpha24-coop";

describe("settlement food-store ecology kernel", () => {
  it("derives stable identity and binds the nearest existing rat anchor once", () => {
    const patch = fixturePatch(0);
    const rats = ratPopulation(patch);
    const position = translateWorldPosition(rats.anchors[0]!.position, 17, 23);
    const first = store(patch, position);
    const replay = store(structuredClone(patch), position);

    expect(replay).toEqual(first);
    expect(first.identity.position).toEqual(position);
    expect(first.identity.ratAggregateId).toBe(rats.aggregateId);
    expect(first.identity.storeAnchorOrdinal).toBe(rats.anchors[0]!.anchorOrdinal);
    expect(first.identity.position.region).toEqual(ORIGIN);
    expect(first.carrier.owner).toEqual({ kind: "settlement", id: 19 });
    expect(first.carrier.lots).toEqual([
      expect.objectContaining({
        id: first.identity.foodLotId,
        payload: {
          kind: "provision",
          lotId: first.identity.foodLotId,
          provision: "fresh-produce",
          quantity: SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY,
        },
      }),
    ]);
    expect("quantity" in first).toBe(false);
  });

  it("strictly canonicalizes the one physical lot and round-trips without rebinding", () => {
    const initial = store(fixturePatch());
    const encoded = serializeSettlementEcologyState(initial);
    const restored = deserializeSettlementEcologyState(encoded);
    expect(restored).toEqual(initial);
    expect(serializeSettlementEcologyState(restored)).toBe(encoded);

    const extra = JSON.parse(encoded) as Record<string, unknown>;
    extra.mirroredFoodQuantity = SETTLEMENT_ECOLOGY_INITIAL_FOOD_QUANTITY;
    expect(canonicalizeSettlementEcologyState(extra)).toBeNull();

    const tampered = JSON.parse(encoded) as {
      carrier: { lots: Array<{ payload: { quantity: number } }> };
    };
    tampered.carrier.lots[0]!.payload.quantity -= 1;
    expect(canonicalizeSettlementEcologyState(tampered)).toBeNull();

    const moved = JSON.parse(encoded) as {
      identity: { storeAnchorOrdinal: number };
    };
    moved.identity.storeAnchorOrdinal += 1;
    expect(canonicalizeSettlementEcologyState(moved)).toBeNull();

    const forgedSecured = JSON.parse(encoded) as {
      closure: string;
      lastClosureTransactionId: string | null;
    };
    forgedSecured.closure = "secured";
    forgedSecured.lastClosureTransactionId = "STORE-SECURE-0000000000000000";
    expect(canonicalizeSettlementEcologyState(forgedSecured)).toBeNull();
  });

  it("keeps one deterministic identity through a bounded signed-coordinate property sweep", () => {
    const extremeOrigins = [
      createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT),
      createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT),
    ];

    for (const origin of extremeOrigins) {
      const patch = fixturePatch(0, origin);
      const rats = ratPopulation(patch);
      for (let sample = 0; sample < 12; sample += 1) {
        const anchor = rats.anchors[sample % rats.anchors.length]!;
        const offsetX = (sample * 73 % 701) - 350;
        const offsetY = (sample * 137 % 701) - 350;
        const position = translateWorldPosition(anchor.position, offsetX, offsetY);
        const first = store(patch, position);
        const replay = store(structuredClone(patch), position);
        const restored = deserializeSettlementEcologyState(
          serializeSettlementEcologyState(first),
        );

        expect(replay).toEqual(first);
        expect(restored).toEqual(first);
        expect(first.identity.position).toEqual(position);
        expect(first.identity.position.region).toEqual(origin);
        expect(first.identity.ratAggregateId).toBe(rats.aggregateId);
        expect(rats.anchors.some(({ anchorOrdinal }) => (
          anchorOrdinal === first.identity.storeAnchorOrdinal
        ))).toBe(true);
      }
    }
  });

  it("migrates the exact v1 payload without changing store identity or a pending loss", () => {
    const current = attractionFixture();
    const staged = stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.nextPatch,
      current.event,
    );
    if (staged === null) throw new Error("Could not stage prior ecology fixture");
    const prior = priorSettlementEcologyPayload(staged.state);
    const migrated = migrateSettlementEcologyState(prior);

    expect(prior.version).toBe(SETTLEMENT_ECOLOGY_STOREHOUSE_VERSION);
    expect(migrated).toMatchObject({
      version: SETTLEMENT_ECOLOGY_VERSION,
      identity: staged.state.identity,
      carrier: staged.state.carrier,
      pendingLoss: staged.state.pendingLoss,
      domesticCustodies: [],
      lastResolvedDomesticFoodUseOrdinal: 0,
      lastResolvedDomesticFoodUseTransactionId: null,
      lastResolvedDomesticFoodUseCauseEventId: null,
      lastResolvedDomesticFoodUseCauseEventTick: null,
      lastResolvedDomesticFoodUseMemberActorId: null,
      pendingDomesticFoodUse: null,
    });
    expect(deserializeSettlementEcologyState(JSON.stringify(prior))).toEqual(migrated);
    expect(recoverPendingSettlementFoodLoss(migrated, current.nextPatch)?.applied).toBe(true);

    expect(migrateSettlementEcologyState({ ...prior, domesticCustody: null })).toBeNull();
    expect(migrateSettlementEcologyState({ ...prior, version: 0 })).toBeNull();
  });

  it("migrates an exact v2 custody and pending v1 food transaction without changing identity", () => {
    const initial = store(fixturePatch());
    const withCustody = establishSettlementDomesticAnimalCustody(
      initial,
      domesticCustodyInput(initial),
    );
    if (withCustody === null) throw new Error("Could not establish v2 migration fixture");
    const request = domesticFoodUseRequest(withCustody, 3);
    const staged = stageSettlementDomesticFoodUse(withCustody, request);
    if (staged === null) throw new Error("Could not stage v2 migration fixture");
    const prior = priorSettlementEcologyV2Payload(staged.state);
    const legacyCustody = prior.domesticCustody as Record<string, unknown>;
    const migrated = migrateSettlementEcologyState(prior);
    const custody = migrated?.domesticCustodies[0];

    expect(prior.version).toBe(SETTLEMENT_ECOLOGY_PRIOR_VERSION);
    expect(migrated?.revision).toBe(prior.revision);
    expect(migrated?.identity).toEqual(prior.identity);
    expect(migrated?.carrier).toEqual(prior.carrier);
    expect(migrated?.pendingDomesticFoodUse).toEqual(prior.pendingDomesticFoodUse);
    expect(custody).toMatchObject({
      relationshipId: legacyCustody.relationshipId,
      homeId: legacyCustody.homeId,
      memberActorIds: legacyCustody.memberActorIds,
      memberGroupId: legacyCustody.memberGroupId,
      homeStructure: {
        version: SETTLEMENT_DOMESTIC_HOME_STRUCTURE_VERSION,
        structureId: legacyCustody.coopId,
        kind: "coop",
        position: legacyCustody.homePosition,
        radiusUnits: legacyCustody.homeRadiusUnits,
      },
    });
    expect(custody?.relationshipId).toBe(withCustody.domesticCustodies[0]?.relationshipId);
    expect(custody?.homeId).toBe(withCustody.domesticCustodies[0]?.homeId);
    expect(custody?.homeStructure.structureId)
      .toBe(withCustody.domesticCustodies[0]?.homeStructure.structureId);
    expect(recoverPendingSettlementDomesticFoodUse(migrated)?.applied).toBe(true);
    expect(deserializeSettlementEcologyState(JSON.stringify(prior))).toEqual(migrated);
    expect(migrateSettlementEcologyState({ ...prior, domesticCustodies: [] })).toBeNull();
  });

  it("migrates exact v3 state to v4 once without changing custody, knowledge, or transactions", () => {
    const initial = store(fixturePatch());
    const report = createSettlementPlayerStoreReport(initial, 2);
    const informed = recordSettlementKeeperKnowledge(initial, 2, {
      kind: "player-report",
      report,
    });
    const withCustodies = establishSettlementDomesticAnimalCustody(
      establishSettlementDomesticAnimalCustody(informed, domesticCustodyInput(initial)),
      secondDomesticCustodyInput(initial),
    );
    if (withCustodies === null) throw new Error("Could not establish v3 custody fixture");
    const staged = stageSettlementDomesticFoodUse(
      withCustodies,
      domesticFoodUseRequest(withCustodies, 3),
    );
    if (staged === null) throw new Error("Could not stage v3 transaction fixture");
    const prior = priorSettlementEcologyV3Payload(staged.state);
    const migrated = migrateSettlementEcologyState(prior);
    if (migrated === null) throw new Error("Could not migrate exact v3 fixture");
    const { version: priorVersion, ...priorBody } = prior;
    const { version: migratedVersion, ...migratedBody } = migrated;

    expect(priorVersion).toBe(SETTLEMENT_ECOLOGY_PLURAL_CUSTODY_VERSION);
    expect(migratedVersion).toBe(SETTLEMENT_ECOLOGY_VERSION);
    expect(migratedBody).toEqual(priorBody);
    expect(migrated.domesticCustodies).toEqual(staged.state.domesticCustodies);
    expect(migrated.keeperKnowledge).toEqual(staged.state.keeperKnowledge);
    expect(migrated.carrier).toEqual(staged.state.carrier);
    expect(migrated.pendingDomesticFoodUse).toEqual(staged.state.pendingDomesticFoodUse);
    expect(migrateSettlementEcologyState(migrated)).toEqual(migrated);
    expect(deserializeSettlementEcologyState(JSON.stringify(prior))).toEqual(migrated);
    expect(migrateSettlementEcologyState({ ...prior, futureField: true })).toBeNull();
  });

  it("binds canonical domestic custody without copying actor simulation state", () => {
    const initial = store(fixturePatch());
    const input = domesticCustodyInput(initial);
    const record = createSettlementDomesticAnimalCustody(initial, {
      ...input,
      memberActorIds: [...input.memberActorIds].reverse(),
    });
    const established = establishSettlementDomesticAnimalCustody(initial, {
      ...input,
      memberActorIds: [...input.memberActorIds].reverse(),
    });

    expect(record).toMatchObject({
      version: SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_VERSION,
      custodyOrdinal: 0,
      settlementId: initial.identity.settlementId,
      owner: { kind: "actor", id: KEEPER_ID },
      caretakerActorId: KEEPER_ID,
      species: "domestic-chicken",
      memberActorIds: DOMESTIC_MEMBER_IDS,
      memberGroupId: DOMESTIC_GROUP_ID,
      homeStructure: {
        version: SETTLEMENT_DOMESTIC_HOME_STRUCTURE_VERSION,
        kind: "coop",
        position: input.homeStructure.position,
        radiusUnits: input.homeStructure.radiusUnits,
      },
    });
    expect(record?.relationshipId).toMatch(/^DOMESTIC-REL-[0-9a-f]{16}$/u);
    expect(record?.homeId).toMatch(/^DOMESTIC-HOME-[0-9a-f]{16}$/u);
    expect(record?.homeStructure.structureId).toMatch(/^DOMESTIC-COOP-[0-9a-f]{16}$/u);
    expect({
      relationshipId: record?.relationshipId,
      homeId: record?.homeId,
      structureId: record?.homeStructure.structureId,
    }).toEqual({
      relationshipId: "DOMESTIC-REL-9ce091a8d7588f5d",
      homeId: "DOMESTIC-HOME-9ce091a8d7588f5d",
      structureId: "DOMESTIC-COOP-9ce091a8d7588f5d",
    });
    expect(established?.domesticCustodies).toEqual([record]);
    expect(establishSettlementDomesticAnimalCustody(established, input)).toEqual(established);
    expect(deserializeSettlementEcologyState(
      serializeSettlementEcologyState(established),
    )).toEqual(established);
    expect("needs" in established!.domesticCustodies[0]!).toBe(false);
    expect("actorPosition" in established!.domesticCustodies[0]!).toBe(false);
    expect("movement" in established!.domesticCustodies[0]!).toBe(false);

    const persisted = JSON.parse(serializeSettlementEcologyState(established)) as {
      domesticCustodies: Array<Record<string, unknown> & { memberActorIds: string[] }>;
    };
    persisted.domesticCustodies[0]!.memberActorIds.reverse();
    expect(canonicalizeSettlementEcologyState(persisted)).toBeNull();
    persisted.domesticCustodies[0]!.memberActorIds.reverse();
    persisted.domesticCustodies[0]!.owner = { kind: "settlement", id: 404 };
    expect(canonicalizeSettlementEcologyState(persisted)).toBeNull();

    expect(establishSettlementDomesticAnimalCustody(initial, {
      ...input,
      memberActorIds: [DOMESTIC_MEMBER_IDS[0], DOMESTIC_MEMBER_IDS[0]],
    })).toBeNull();
    expect(establishSettlementDomesticAnimalCustody(initial, {
      ...input,
      memberActorIds: [CAT_ID],
    })).toBeNull();
    expect(establishSettlementDomesticAnimalCustody(initial, {
      ...input,
      memberGroupId: "CROW-FLOCK-v1-forged",
    })).toBeNull();
    expect(establishSettlementDomesticAnimalCustody(initial, {
      ...input,
      memberGroupId: null,
    })).toBeNull();
  });

  it("orders plural generic homes canonically and rejects cross-custody membership", () => {
    const initial = store(fixturePatch());
    const coop = domesticCustodyInput(initial);
    const pen = secondDomesticCustodyInput(initial);
    const coopThenPen = establishSettlementDomesticAnimalCustody(
      establishSettlementDomesticAnimalCustody(initial, coop),
      pen,
    );
    const penThenCoop = establishSettlementDomesticAnimalCustody(
      establishSettlementDomesticAnimalCustody(initial, pen),
      coop,
    );

    expect(coopThenPen).toEqual(penThenCoop);
    expect(coopThenPen?.domesticCustodies.map(({ custodyOrdinal }) => custodyOrdinal))
      .toEqual([0, 1]);
    expect(coopThenPen?.domesticCustodies.map(({ homeStructure }) => homeStructure.kind))
      .toEqual(["coop", "pen"]);
    expect(coopThenPen?.domesticCustodies[0]?.homeStructure.structureId)
      .toMatch(/^DOMESTIC-COOP-[0-9a-f]{16}$/u);
    expect(coopThenPen?.domesticCustodies[1]?.homeStructure.structureId)
      .toMatch(/^DOMESTIC-PEN-[0-9a-f]{16}$/u);
    expect(establishSettlementDomesticAnimalCustody(coopThenPen, {
      ...secondDomesticCustodyInput(initial, 2),
      memberActorIds: [DOMESTIC_MEMBER_IDS[0]],
    })).toBeNull();

    const reordered = JSON.parse(serializeSettlementEcologyState(coopThenPen)) as {
      domesticCustodies: unknown[];
    };
    reordered.domesticCustodies.reverse();
    expect(canonicalizeSettlementEcologyState(reordered)).toBeNull();

    const duplicateMember = JSON.parse(serializeSettlementEcologyState(coopThenPen)) as {
      domesticCustodies: Array<{ memberActorIds: string[] }>;
    };
    duplicateMember.domesticCustodies[1]!.memberActorIds = [DOMESTIC_MEMBER_IDS[0]];
    expect(canonicalizeSettlementEcologyState(duplicateMember)).toBeNull();

    const duplicateGroup = JSON.parse(serializeSettlementEcologyState(coopThenPen)) as {
      domesticCustodies: Array<{ memberGroupId: string | null }>;
    };
    duplicateGroup.domesticCustodies[1]!.memberGroupId =
      duplicateGroup.domesticCustodies[0]!.memberGroupId;
    expect(canonicalizeSettlementEcologyState(duplicateGroup)).toBeNull();

    const duplicateRelationship = JSON.parse(serializeSettlementEcologyState(coopThenPen)) as {
      domesticCustodies: Array<{ relationshipId: string }>;
    };
    duplicateRelationship.domesticCustodies[1]!.relationshipId =
      duplicateRelationship.domesticCustodies[0]!.relationshipId;
    expect(canonicalizeSettlementEcologyState(duplicateRelationship)).toBeNull();

    const duplicateHome = JSON.parse(serializeSettlementEcologyState(coopThenPen)) as {
      domesticCustodies: Array<{ homeId: string }>;
    };
    duplicateHome.domesticCustodies[1]!.homeId =
      duplicateHome.domesticCustodies[0]!.homeId;
    expect(canonicalizeSettlementEcologyState(duplicateHome)).toBeNull();

    const mismatchedHome = JSON.parse(serializeSettlementEcologyState(coopThenPen)) as {
      domesticCustodies: Array<{
        homeStructure: { kind: "coop" | "pen"; structureId: string };
      }>;
    };
    mismatchedHome.domesticCustodies[0]!.homeStructure.kind = "pen";
    expect(canonicalizeSettlementEcologyState(mismatchedHome)).toBeNull();

    const firstNine = establishSettlementDomesticAnimalCustody(initial, {
      ...coop,
      memberActorIds: Array.from({ length: 9 }, (_, index) => (
        `CHICKEN-v1-shared-bound-a-${index}`
      )),
    });
    expect(establishSettlementDomesticAnimalCustody(firstNine, {
      ...pen,
      memberActorIds: Array.from({ length: 8 }, (_, index) => (
        `CHICKEN-v1-shared-bound-b-${index}`
      )),
    })).toBeNull();

    let bounded: SettlementEcologyState | null = initial;
    for (
      let ordinal = 0;
      ordinal < SETTLEMENT_ECOLOGY_MAX_DOMESTIC_CUSTODIES;
      ordinal += 1
    ) {
      bounded = establishSettlementDomesticAnimalCustody(bounded, {
        ...secondDomesticCustodyInput(initial, ordinal),
        memberActorIds: [`CHICKEN-v1-shared-custody-bound-${ordinal}`],
      });
      expect(bounded).not.toBeNull();
    }
    expect(establishSettlementDomesticAnimalCustody(bounded, {
      ...secondDomesticCustodyInput(initial, SETTLEMENT_ECOLOGY_MAX_DOMESTIC_CUSTODIES),
      memberActorIds: [
        `CHICKEN-v1-shared-custody-bound-${SETTLEMENT_ECOLOGY_MAX_DOMESTIC_CUSTODIES}`,
      ],
    })).toBeNull();
  });

  it("binds one individual dog to a deterministic kennel at signed extreme coordinates", () => {
    const initial = store(fixturePatch());
    const extremeHomes = [
      createWorldPosition(createRegionCoord(-REGION_COORD_LIMIT, REGION_COORD_LIMIT), 1, 2),
      createWorldPosition(createRegionCoord(REGION_COORD_LIMIT, -REGION_COORD_LIMIT), 3, 4),
    ];

    for (const homePosition of extremeHomes) {
      const input = dogCustodyInput(initial, homePosition);
      const record = createSettlementDomesticAnimalCustody(initial, input);
      const established = establishSettlementDomesticAnimalCustody(initial, input);

      expect(record).toMatchObject({
        custodyOrdinal: 2,
        settlementId: initial.identity.settlementId,
        owner: { kind: "settlement", id: initial.identity.settlementId },
        caretakerActorId: KEEPER_ID,
        species: "domestic-dog",
        memberActorIds: [DOMESTIC_DOG_ID],
        memberGroupId: null,
        homeStructure: {
          version: SETTLEMENT_DOMESTIC_HOME_STRUCTURE_VERSION,
          kind: "kennel",
          position: homePosition,
          radiusUnits: 3 * WORLD_POSITION_UNITS_PER_TILE,
        },
      });
      expect(record?.homeStructure.structureId)
        .toBe(`DOMESTIC-KENNEL-${record?.relationshipId.slice("DOMESTIC-REL-".length)}`);
      expect(established?.domesticCustodies).toEqual([record]);
      expect(deserializeSettlementEcologyState(
        serializeSettlementEcologyState(established),
      )).toEqual(established);
      expect("guardianRole" in established!.domesticCustodies[0]!).toBe(false);
    }

    expect(establishSettlementDomesticAnimalCustody(initial, {
      ...dogCustodyInput(initial, extremeHomes[0]!),
      memberGroupId: DOMESTIC_GROUP_ID,
    })).toBeNull();
  });

  it("conserves the one physical lot across plural custody, replay, and rat loss", () => {
    const current = attractionFixture();
    const domestic = establishSettlementDomesticAnimalCustody(
      establishSettlementDomesticAnimalCustody(
        current.state,
        domesticCustodyInput(current.state),
      ),
      secondDomesticCustodyInput(current.state),
    );
    if (domestic === null || domestic.domesticCustodies.length !== 2) {
      throw new Error("Could not establish plural domestic custody fixture");
    }
    const request = domesticFoodUseRequest(domestic, 3);
    const quantityBefore = foodQuantity(domestic);
    const staged = stageSettlementDomesticFoodUse(domestic, request);
    expect(staged?.reusedPendingTransaction).toBe(false);
    expect(foodQuantity(staged!.state)).toBe(quantityBefore);
    expect(stageSettlementDomesticFoodUse(
      staged!.state,
      request,
    )?.reusedPendingTransaction).toBe(true);
    expect(stageSettlementFoodLoss(
      staged!.state,
      current.proposal,
      current.nextPatch,
      current.event,
    )).toBeNull();

    const restoredPending = deserializeSettlementEcologyState(
      serializeSettlementEcologyState(staged!.state),
    );
    const fed = recoverPendingSettlementDomesticFoodUse(restoredPending);
    expect(fed?.applied).toBe(true);
    expect(fed?.removed).toEqual([
      expect.objectContaining({
        id: domestic.identity.foodLotId,
        payload: expect.objectContaining({ quantity: 1 }),
      }),
    ]);
    expect(foodQuantity(fed!.state)).toBe(quantityBefore - 1);
    expect(fed!.state).toMatchObject({
      lastResolvedDomesticFoodUseOrdinal: 1,
      lastResolvedDomesticFoodUseTransactionId: staged!.transaction.transactionId,
      lastResolvedDomesticFoodUseCauseEventId: request.causeEventId,
      lastResolvedDomesticFoodUseCauseEventTick: request.causeEventTick,
      lastResolvedDomesticFoodUseMemberActorId: request.memberActorId,
    });
    expect(resolveSettlementDomesticFoodUse(fed!.state, staged!.transaction)).toEqual({
      state: fed!.state,
      applied: false,
      removed: [],
    });

    const secondRequest = domesticFoodUseRequest(fed!.state, 4, 1);
    const secondStage = stageSettlementDomesticFoodUse(fed!.state, secondRequest);
    const secondFed = resolveSettlementDomesticFoodUse(
      secondStage!.state,
      secondStage!.transaction,
    );
    expect(secondFed?.applied).toBe(true);
    expect(foodQuantity(secondFed!.state)).toBe(quantityBefore - 2);

    const ratStage = stageSettlementFoodLoss(
      secondFed!.state,
      current.proposal,
      current.nextPatch,
      current.event,
    );
    const ratLoss = resolveSettlementFoodLoss(ratStage!.state, ratStage!.transaction);
    expect(ratLoss?.applied).toBe(true);
    expect(foodQuantity(ratLoss!.state)).toBe(quantityBefore - 3);
    const removedQuantity = [
      ...fed!.removed,
      ...secondFed!.removed,
      ...ratLoss!.removed,
    ].reduce((sum, lot) => (
      sum + (lot.payload.kind === "provision" ? lot.payload.quantity : 0)
    ), 0);
    expect(foodQuantity(ratLoss!.state) + removedQuantity).toBe(quantityBefore);
    expect(ratLoss!.state.carrier.owner).toEqual({
      kind: "settlement",
      id: domestic.identity.settlementId,
    });
    expect(deserializeSettlementEcologyState(
      serializeSettlementEcologyState(ratLoss!.state),
    )).toEqual(ratLoss!.state);

    expect(stageSettlementDomesticFoodUse(domestic, {
      ...request,
      memberActorId: "CHICKEN-v1-alpha24-not-a-member",
    })).toBeNull();
    expect(stageSettlementDomesticFoodUse(domestic, {
      ...request,
      foodLotId: "STORE-FOOD-wrong-lot",
    })).toBeNull();
    const secured = secureFromPlayerReport(domestic, 4);
    expect(stageSettlementDomesticFoodUse(secured, {
      ...request,
      causeEventId: "domestic-food-use:secured",
      causeEventTick: 5,
    })).toBeNull();
  });

  it("projects open/sealed leakage while shared scent owns wind and rain", () => {
    const initial = store(fixturePatch());
    const open = projectSettlementFoodStoreSource(initial);
    expect(open).toMatchObject({
      closure: "open",
      source: {
        sourceReferenceId: initial.identity.foodLotId,
        packagingLeakage: FIXED_POINT,
      },
    });
    const observer = translateWorldPosition(initial.identity.position, -2_000, 0);
    const scent = (windX: number, rainIntensity: number) => createActorScentObservation({
      id: `scent:${windX}:${rainIntensity}`,
      observerId: CAT_ID,
      observedAtTick: 8,
      perceivedClass: "food-scent",
      observerPosition: observer,
      sourcePosition: open!.source.position,
      baseRangeUnits: 20_000,
      sourceStrength: open!.source.sourceStrength,
      packagingLeakage: open!.source.packagingLeakage,
      wind: { x: windX, y: 0 },
      rainIntensity,
    });
    const downwind = scent(-FIXED_POINT, 0);
    const upwind = scent(FIXED_POINT, 0);
    const rainy = scent(-FIXED_POINT, 300_000);
    expect(downwind).not.toBeNull();
    expect(upwind).not.toBeNull();
    expect(rainy).not.toBeNull();
    expect(downwind!.confidence).toBeGreaterThan(upwind!.confidence);
    expect(rainy!.confidence).toBeLessThan(downwind!.confidence);
    expect(projectSettlementFoodStoreSource(initial)).toEqual(open);

    const secured = secureFromPlayerReport(initial, 8);
    const sealed = projectSettlementFoodStoreSource(secured);
    expect(sealed?.source.sourceStrength).toBe(open?.source.sourceStrength);
    expect(sealed?.source.packagingLeakage).toBe(0);
    expect(createActorScentObservation({
      id: "scent:sealed",
      observerId: CAT_ID,
      observedAtTick: 8,
      perceivedClass: "food-scent",
      observerPosition: observer,
      sourcePosition: sealed!.source.position,
      baseRangeUnits: 20_000,
      sourceStrength: sealed!.source.sourceStrength,
      packagingLeakage: sealed!.source.packagingLeakage,
      wind: { x: -FIXED_POINT, y: 0 },
      rainIntensity: 0,
    })).toBeNull();
  });

  it("lets the keeper act only on direct observation or an explicit player report", () => {
    const initial = store(fixturePatch());
    expect(proposeSettlementKeeperStoreResponse(initial, 12)).toBeNull();

    const wrongObserver = observedFood(CAT_ID, initial.identity, 12);
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "direct-observation",
      risk: "food-exposed",
      observation: wrongObserver,
    })).toBeNull();

    const unrelatedFood = {
      ...observedFood(KEEPER_ID, initial.identity, 12),
      id: "observation:keeper:unrelated-food",
      subjectId: "STORE-FOOD-unrelated",
    };
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "direct-observation",
      risk: "food-exposed",
      observation: unrelatedFood,
    })).toBeNull();

    const scentedSign = createActorObservation({
      id: "observation:keeper:scented-sign",
      observerId: KEEPER_ID,
      observedAtTick: 12,
      channel: "scent",
      perceivedClass: "rat-sign",
      area: { center: initial.identity.position, radiusUnits: 1_000 },
      confidence: 700_000,
      salience: 600_000,
      identification: "classified",
    });
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "direct-observation",
      risk: "rat-activity",
      observation: scentedSign,
    })).toBeNull();

    const direct = observedFood(KEEPER_ID, initial.identity, 12);
    const informed = recordSettlementKeeperKnowledge(initial, 12, {
      kind: "direct-observation",
      risk: "food-exposed",
      observation: direct,
    });
    expect(informed?.keeperKnowledge).toEqual([
      expect.objectContaining({ source: "direct-observation", sourceActorId: KEEPER_ID }),
    ]);
    expect(proposeSettlementKeeperStoreResponse(informed, 12)).not.toBeNull();

    const report = createSettlementPlayerStoreReport(initial, 12);
    expect(createSettlementPlayerStoreReport(initial, 12)).toEqual(report);
    expect(report).toMatchObject({
      reporterActorId: LOCAL_PLAYER_LIVING_ACTOR_ID,
      recipientKeeperActorId: KEEPER_ID,
      storeId: initial.identity.storeId,
      risk: "food-exposed",
    });
    const reported = recordSettlementKeeperKnowledge(initial, 12, {
      kind: "player-report",
      report,
    });
    expect(reported?.keeperKnowledge[0]).toMatchObject({ source: "player-report" });
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "player-report",
      report: { ...report, reportId: "STORE-REPORT-forged" },
    })).toBeNull();
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "player-report",
      report: { ...report, risk: "rat-activity" },
    })).toBeNull();
    expect(recordSettlementKeeperKnowledge(initial, 12, {
      kind: "player-report",
      report: { ...report, confidence: report!.confidence - 1 },
    })).toBeNull();

    const savedReport = JSON.parse(serializeSettlementEcologyState(reported)) as {
      keeperKnowledge: Array<{ risk: string; confidence: number }>;
    };
    savedReport.keeperKnowledge[0]!.risk = "rat-activity";
    expect(canonicalizeSettlementEcologyState(savedReport)).toBeNull();
  });

  it("adapts one conserved rat relocation into one transactional physical loss", () => {
    const current = attractionFixture();
    const ratsBefore = ratPopulation(current.patch);
    const populationBefore = ratsBefore.populationSize;
    const quantityBefore = foodQuantity(current.state);
    expect(current.proposal).toMatchObject({
      maximumRedistributedUnits: 1,
      populationConservation: "required",
      itemConsumption: "none",
      ratAggregateId: current.state.identity.ratAggregateId,
      storeAnchorOrdinal: current.state.identity.storeAnchorOrdinal,
    });
    expect(current.event).toMatchObject({
      displacedUnits: 1,
      mortality: "none",
      cargoInteraction: false,
      itemConsumption: "none",
      toAnchorOrdinal: current.state.identity.storeAnchorOrdinal,
    });
    expect(ratPopulation(current.nextPatch).populationSize).toBe(populationBefore);

    const staged = stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.nextPatch,
      current.event,
    );
    expect(staged?.reusedPendingTransaction).toBe(false);
    expect(foodQuantity(staged!.state)).toBe(quantityBefore);
    expect(stageSettlementFoodLoss(
      staged!.state,
      current.proposal,
      current.nextPatch,
      current.event,
    )?.reusedPendingTransaction).toBe(true);

    const restoredPending = deserializeSettlementEcologyState(
      serializeSettlementEcologyState(staged!.state),
    );
    expect(recoverPendingSettlementFoodLoss(restoredPending, current.patch)).toBeNull();
    const resolved = recoverPendingSettlementFoodLoss(restoredPending, current.nextPatch);
    expect(resolved?.applied).toBe(true);
    expect(resolved?.removed).toEqual([
      expect.objectContaining({
        id: current.state.identity.foodLotId,
        payload: expect.objectContaining({ quantity: 1 }),
      }),
    ]);
    expect(foodQuantity(resolved!.state)).toBe(quantityBefore - 1);
    expect(resolveSettlementFoodLoss(resolved!.state, staged!.transaction)).toEqual({
      state: resolved!.state,
      applied: false,
      removed: [],
    });
    expect(stageSettlementFoodLoss(
      resolved!.state,
      current.proposal,
      current.nextPatch,
      current.event,
    )).toBeNull();
  });

  it("rejects wrong aggregate/anchor causality and any loss from a secured store", () => {
    const current = attractionFixture();
    const wrongAnchor = {
      ...current.event,
      toAnchorOrdinal: current.event.toAnchorOrdinal + 1,
    };
    expect(stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.nextPatch,
      wrongAnchor,
    )).toBeNull();

    const wrongAggregate = {
      ...current.proposal,
      ratAggregateId: `${current.proposal.ratAggregateId}-other`,
    };
    expect(stageSettlementFoodLoss(
      current.state,
      wrongAggregate,
      current.nextPatch,
      current.event,
    )).toBeNull();

    const secured = secureFromPlayerReport(current.state, 0);
    expect(stageSettlementFoodLoss(
      secured,
      current.proposal,
      current.nextPatch,
      current.event,
    )).toBeNull();

    expect(stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.patch,
      current.event,
    )).toBeNull();
    expect(stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.nextPatch,
      { ...current.event, eventId: "settlement-shadows:forged:event" },
    )).toBeNull();
    expect(stageSettlementFoodLoss(
      current.state,
      current.proposal,
      current.nextPatch,
      { ...current.event, forged: true },
    )).toBeNull();
  });
});

function individualInputs(
  habitat: CoreEcologyHarborEdgeHabitatAssemblage,
): readonly CoreEcologyPopulationInput[] {
  return habitat.populations.flatMap((population) => (
    population.representation !== "individual-representatives"
      || population.populationUnits === 0
      ? []
      : [{
          species: population.species,
          populationKey: population.populationKey,
          populationSize: population.populationUnits,
          members: population.allocations.map((allocation) => ({
            populationOrdinal: allocation.allocationOrdinal,
            representedUnits: allocation.representedUnits,
            position: allocation.position,
            materialization: "coarse" as const,
          })),
        }]
  ));
}

function fixturePatch(
  tick = 0,
  origin: RegionCoord = ORIGIN,
  seed: RootSeed = SEED,
): CoreEcologyAggregatePatchState {
  const habitat = deriveCoreEcologyHarborEdgeHabitatAssemblage({
    rootSeed: seed,
    originRegion: origin,
  });
  const patch = createCoreEcologyAggregatePatch({
    seed,
    patchKey: "alpha23:storehouse-test",
    originRegion: origin,
    tick,
    populations: individualInputs(habitat),
    derivation: { kind: "habitat-v2", habitat },
  });
  ratPopulation(patch);
  return patch;
}

function ratPopulation(patch: CoreEcologyAggregatePatchState) {
  const rats = patch.aggregatePopulations.find(({ species }) => species === "brown-rat");
  if (rats === undefined || rats.anchors.length < 2) {
    throw new Error("Storehouse fixture requires two rat anchors");
  }
  return rats;
}

function store(
  patch: CoreEcologyAggregatePatchState,
  position: WorldPosition = createWorldPosition(patch.originRegion, 48_000, 36_000),
): SettlementEcologyState {
  return createSettlementEcologyState({
    rootSeed: SEED,
    settlementId: 19,
    keeperActorId: KEEPER_ID,
    position,
    aggregatePatch: patch,
  });
}

function observedFood(
  observerId: string,
  identity: SettlementEcologyState["identity"],
  atTick: number,
) {
  const observation = createActorObservation({
    id: `observation:${observerId}:${atTick}`,
    observerId,
    observedAtTick: atTick,
    channel: "vision",
    perceivedClass: "exposed-food",
    subjectId: identity.foodLotId,
    area: { center: identity.position, radiusUnits: 0 },
    confidence: 900_000,
    salience: 700_000,
    identification: "identified",
  });
  if (observation === null) throw new Error("Could not create direct store observation");
  return observation;
}

function secureFromPlayerReport(
  initial: SettlementEcologyState,
  atTick: number,
): SettlementEcologyState {
  const report = createSettlementPlayerStoreReport(initial, atTick);
  const informed = recordSettlementKeeperKnowledge(initial, atTick, {
    kind: "player-report",
    report,
  });
  const proposal = proposeSettlementKeeperStoreResponse(informed, atTick);
  const resolution = applySettlementKeeperStoreResponse(informed, proposal);
  if (resolution === null || !resolution.applied) throw new Error("Could not secure store fixture");
  return resolution.state;
}

function foodQuantity(state: SettlementEcologyState): number {
  const lot = state.carrier.lots.find(({ id }) => id === state.identity.foodLotId);
  return lot?.payload.kind === "provision" ? lot.payload.quantity : 0;
}

function priorSettlementEcologyPayload(
  state: SettlementEcologyState,
): Record<string, unknown> & { version: typeof SETTLEMENT_ECOLOGY_STOREHOUSE_VERSION } {
  const value = structuredClone(
    priorSettlementEcologyV2Payload(state),
  ) as unknown as Record<string, unknown>;
  delete value.domesticCustody;
  delete value.lastResolvedDomesticFoodUseOrdinal;
  delete value.lastResolvedDomesticFoodUseTransactionId;
  delete value.lastResolvedDomesticFoodUseCauseEventId;
  delete value.lastResolvedDomesticFoodUseCauseEventTick;
  delete value.lastResolvedDomesticFoodUseMemberActorId;
  delete value.pendingDomesticFoodUse;
  value.version = SETTLEMENT_ECOLOGY_STOREHOUSE_VERSION;
  return value as Record<string, unknown> & {
    version: typeof SETTLEMENT_ECOLOGY_STOREHOUSE_VERSION;
  };
}

function priorSettlementEcologyV2Payload(
  state: SettlementEcologyState,
): Record<string, unknown> & { version: typeof SETTLEMENT_ECOLOGY_PRIOR_VERSION } {
  const value = structuredClone(state) as unknown as Record<string, unknown>;
  const custodies = value.domesticCustodies as Array<Record<string, unknown>>;
  if (custodies.length > 1) throw new Error("v2 fixture supports at most one custody");
  const current = custodies[0];
  delete value.domesticCustodies;
  if (current === undefined) {
    value.domesticCustody = null;
  } else {
    const homeStructure = current.homeStructure as Record<string, unknown>;
    const { homeStructure: _homeStructure, ...legacy } = current;
    value.domesticCustody = {
      ...legacy,
      version: SETTLEMENT_DOMESTIC_ANIMAL_CUSTODY_PRIOR_VERSION,
      coopId: homeStructure.structureId,
      homePosition: homeStructure.position,
      homeRadiusUnits: homeStructure.radiusUnits,
    };
  }
  value.version = SETTLEMENT_ECOLOGY_PRIOR_VERSION;
  return value as Record<string, unknown> & {
    version: typeof SETTLEMENT_ECOLOGY_PRIOR_VERSION;
  };
}

function priorSettlementEcologyV3Payload(
  state: SettlementEcologyState,
): Record<string, unknown> & { version: typeof SETTLEMENT_ECOLOGY_PLURAL_CUSTODY_VERSION } {
  const value = structuredClone(state) as unknown as Record<string, unknown>;
  value.version = SETTLEMENT_ECOLOGY_PLURAL_CUSTODY_VERSION;
  return value as Record<string, unknown> & {
    version: typeof SETTLEMENT_ECOLOGY_PLURAL_CUSTODY_VERSION;
  };
}

function domesticCustodyInput(
  state: SettlementEcologyState,
): CreateSettlementDomesticAnimalCustodyInput {
  return {
    custodyOrdinal: 0,
    owner: { kind: "actor", id: KEEPER_ID },
    caretakerActorId: KEEPER_ID,
    species: "domestic-chicken",
    memberActorIds: DOMESTIC_MEMBER_IDS,
    memberGroupId: DOMESTIC_GROUP_ID,
    homeStructure: {
      kind: "coop",
      position: translateWorldPosition(
        state.identity.position,
        -3 * WORLD_POSITION_UNITS_PER_TILE,
        2 * WORLD_POSITION_UNITS_PER_TILE,
      ),
      radiusUnits: 6 * WORLD_POSITION_UNITS_PER_TILE,
    },
  };
}

function secondDomesticCustodyInput(
  state: SettlementEcologyState,
  custodyOrdinal = 1,
): CreateSettlementDomesticAnimalCustodyInput {
  return {
    custodyOrdinal,
    owner: { kind: "settlement", id: state.identity.settlementId },
    caretakerActorId: KEEPER_ID,
    species: "domestic-chicken",
    memberActorIds: [
      `CHICKEN-v1-shared-pen-${custodyOrdinal}-a`,
      `CHICKEN-v1-shared-pen-${custodyOrdinal}-b`,
    ],
    memberGroupId: `CHICKEN-FLOCK-v1-shared-pen-${custodyOrdinal}`,
    homeStructure: {
      kind: "pen",
      position: translateWorldPosition(
        state.identity.position,
        4 * WORLD_POSITION_UNITS_PER_TILE,
        -2 * WORLD_POSITION_UNITS_PER_TILE,
      ),
      radiusUnits: 8 * WORLD_POSITION_UNITS_PER_TILE,
    },
  };
}

function dogCustodyInput(
  state: SettlementEcologyState,
  homePosition: WorldPosition,
): CreateSettlementDomesticAnimalCustodyInput {
  return {
    custodyOrdinal: 2,
    owner: { kind: "settlement", id: state.identity.settlementId },
    caretakerActorId: KEEPER_ID,
    species: "domestic-dog",
    memberActorIds: [DOMESTIC_DOG_ID],
    memberGroupId: null,
    homeStructure: {
      kind: "kennel",
      position: homePosition,
      radiusUnits: 3 * WORLD_POSITION_UNITS_PER_TILE,
    },
  };
}

function domesticFoodUseRequest(
  state: SettlementEcologyState,
  causeEventTick: number,
  custodyIndex = 0,
): SettlementDomesticFoodUseRequest {
  const custody = state.domesticCustodies[custodyIndex];
  if (custody === undefined) throw new Error("Domestic custody is required");
  return {
    version: SETTLEMENT_DOMESTIC_FOOD_USE_VERSION,
    storeId: state.identity.storeId,
    foodLotId: state.identity.foodLotId,
    relationshipId: custody.relationshipId,
    memberActorId: custody.memberActorIds[0]!,
    requestedQuantity: 1,
    causeEventId: `domestic-food-use:${causeEventTick}`,
    causeEventTick,
  };
}

function attractionFixture(): Readonly<{
  state: SettlementEcologyState;
  patch: CoreEcologyAggregatePatchState;
  nextPatch: CoreEcologyAggregatePatchState;
  frame: CoreEcologySettlementShadowsStimulusFrame;
  proposal: SettlementRatAttractionProposal;
  event: CoreEcologySettlementShadowsEvent;
}> {
  const patch = fixturePatch(0);
  const rats = ratPopulation(patch);
  const donor = rats.anchors.find(({ populationUnits }) => populationUnits > 0);
  const target = rats.anchors.find(({ anchorOrdinal }) => (
    anchorOrdinal !== donor?.anchorOrdinal
  ));
  if (donor === undefined || target === undefined) throw new Error("Rat movement fixture is invalid");
  const state = store(patch, target.position);
  if (state.identity.storeAnchorOrdinal !== target.anchorOrdinal) {
    throw new Error("Store did not bind the intended nearest anchor");
  }
  const frame: CoreEcologySettlementShadowsStimulusFrame = {
    version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
    atTick: patch.updatedAtTick,
    stimuli: [{
      version: CORE_ECOLOGY_SETTLEMENT_SHADOWS_STIMULUS_VERSION,
      stimulusId: "stimulus:store-fresh-produce",
      sourceReferenceId: state.identity.foodLotId,
      sourceKind: "exposed-food",
      response: "attraction",
      targetAggregateId: state.identity.ratAggregateId,
      channels: ["scent"],
      anchorInfluences: [
        { anchorOrdinal: donor.anchorOrdinal, intensity: 0 },
        { anchorOrdinal: target.anchorOrdinal, intensity: FIXED_POINT },
      ],
    }],
  };
  const proposal = proposeSettlementRatAttraction(state, patch, frame);
  if (proposal === null) throw new Error("Store did not authorize rat attraction");
  const stepped = stepCoreEcologySettlementShadows(patch, patch.updatedAtTick, frame);
  const event = stepped?.events.find((candidate) => (
    candidate.stimulusId === proposal.stimulusId
    && candidate.aggregateId === proposal.ratAggregateId
  ));
  if (stepped === null || event === undefined) throw new Error("Rat attraction did not relocate");
  return { state, patch, nextPatch: stepped.patch, frame, proposal, event };
}
