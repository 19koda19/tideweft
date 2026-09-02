import {
  FIXED_POINT,
  STRAND_AUTOMATION_THRESHOLD,
  WORLD_WIDTH,
  type ContractState,
  type SimEvent,
  type WorldView,
} from "../sim/types";
import { deriveBiomeProfile, deriveMagicalWaterInfluence, type BiomeId } from "../sim/biomes";
import { seedFromText } from "../sim/rng";
import { regionLocalToGlobalTile } from "../sim/regions";
import {
  fieldResourceStockUnits,
  type FieldResourceCatalog,
  type FieldResourceEcologyState,
  type FieldResourceNode,
} from "../sim/fieldResources";
import type {
  ChronicleEntryUIView,
  ContractMood,
  ContractUIView,
  KitUIView,
  SaveWarningUIView,
  SettlementInspectorUIView,
  TideweftUIView,
} from "../ui/types";
import {
  FIELD_TOOL_LABELS,
  PACK_LOAD_MILLI_PER_UNIT,
  TILE_UNITS,
  activeTideHarpAtPlayer,
  cargoWeight,
  cargoWeightMilli,
  playerTileIndex,
  settlementAtPlayer,
  transportLoadMilli,
  tunedTideHarps,
  waterDepthBand,
  waterEffortPerStep,
  wayknotEffectsAt,
  type PlayerState,
} from "./player";
import {
  CRAFTED_GEAR_DEFINITIONS,
  CRAFTING_RECIPES,
  CRAFTING_STACK_DEFINITIONS,
  CRAFTING_STACK_IDS,
  createCraftingInventory,
  inventoryLoadMilli,
  previewCraft,
  previewDismantle,
  previewRepair,
  quoteWayknotRepairCost,
  salvageForGear,
  type CraftingInventory,
  type StackAmount,
} from "./crafting";
import { sessionOutcomeDelta, type GameSessionState } from "./sessionTypes";
import { tutorialObjective } from "./tutorial";
import {
  WAYKNOT_DESCRIPTIONS,
  WAYKNOT_LABELS,
  WAYKNOT_MIN_PLACEMENT_CONDITION,
  contextualWayknotKind,
  deployedWayknotCount,
  validateWayknotPlacement,
  wayknotEffectStrength,
  wayknotAtTile,
} from "./wayknots";
import {
  regionalWayknotContextAt,
  regionalWayknotViewTileIndex,
} from "./regionalWayknots";
import {
  looseCargoPayloadLoadMilli,
  promiseCargoLoadMilli,
  type LooseCargoCarrierState,
  type LooseCargoWorldState,
} from "./looseCargo";
import {
  regionalAddressAt,
  regionalTileIndexInView,
  regionalWorldCenter,
} from "./regionalWorldView";

export interface UIProjectionOptions {
  /** Full compatibility economy used for names, Promises, people, routes, and events. */
  readonly economyWorld?: WorldView;
  readonly fieldResourceCatalog?: FieldResourceCatalog;
  readonly fieldResourceEcology?: FieldResourceEcologyState;
  readonly saveWarning?: SaveWarningUIView;
  readonly requiresSeed?: boolean;
  readonly worldCreationBlocked?: boolean;
  /** Authoritative exact lots; absent only for legacy fixtures and migration UI. */
  readonly looseCargoCarrier?: LooseCargoCarrierState;
  /** Authoritative loaded parcels used for RECOVER objectives and interaction. */
  readonly looseCargoWorld?: LooseCargoWorldState;
  /** Sealed unloaded parcel worlds used only for truthful global custody guidance. */
  readonly inactiveLooseCargoWorlds?: readonly LooseCargoWorldState[];
  /** Authoritative momentary hold state shared by Shift and touch. */
  readonly bracing?: boolean;
}

export function projectUIView(
  world: WorldView,
  player: PlayerState,
  session: GameSessionState,
  options: UIProjectionOptions = {},
): TideweftUIView {
  const economy = options.economyWorld ?? world;
  const selectedSettlement = session.selectedSettlementId === null
    ? undefined
    : economy.settlements.find((settlement) => settlement.id === session.selectedSettlementId);
  const playerSettlementId = settlementAtPlayer(player, world);
  const localOffers = playerSettlementId === null
    ? []
    : economy.contracts.filter(
        (contract) => contract.status === "offered" && contract.originSettlementId === playerSettlementId,
      );
  const activeContract = player.activeContractId === null
    ? undefined
    : economy.contracts.find((contract) => contract.id === player.activeContractId);
  const trackedContract = session.trackedContractId === null
    ? undefined
    : economy.contracts.find((contract) => contract.id === session.trackedContractId);
  const tutorial = tutorialObjective(session.tutorial, player);
  const report = reportObjective(economy, world, player);
  const spatialCenter = regionalWorldCenter(world);
  const minute = world.completedTick % 1_440;
  const day = Math.floor(world.completedTick / 1_440) + 1;
  const hour = Math.floor(minute / 60);
  const minutes = minute % 60;
  const tidePhase = tidePhaseName(world.tide.phase);
  const worldName = `The ${titleCase(world.seedText)} Estuary`;
  const wayknotControl = projectWayknotControl(world, player);
  const localResource = resourceUnderfoot(player, options);
  const nearbyParcel = nearestLooseParcel(player, world, options.looseCargoWorld, 2);
  const activeCustody = activeContract
    ? promiseCustody(
        activeContract,
        player,
        world,
        options.looseCargoCarrier,
        [
          ...(options.looseCargoWorld ? [options.looseCargoWorld] : []),
          ...(options.inactiveLooseCargoWorlds ?? []),
        ],
      )
    : undefined;

  return {
    revision: [
      world.completedTick,
      `${spatialCenter.x},${spatialCenter.y}`,
      player.x,
      player.y,
      player.stamina,
      player.stability,
      player.scanCharge,
      player.wayknots.wayknots.map((wayknot) =>
        `${wayknot.id}@${wayknot.region ? `${wayknot.region.x},${wayknot.region.y}:` : ""}${wayknot.tileIndex ?? "pack"}`
      ).join(","),
      craftingRevision(player),
      player.cargo[0]?.condition ?? FIXED_POINT,
      player.pace,
      options.bracing === true,
      session.selectedSettlementId ?? "none",
      session.trackedContractId ?? "none",
      session.nextAnnouncementId,
      session.titleVisible,
      session.quietHourVisible,
      options.saveWarning?.id ?? "save-ok",
      options.requiresSeed ? "replacement-seed-required" : "ordinary-seed",
      options.worldCreationBlocked ? "world-creation-blocked" : "world-creation-enabled",
      options.looseCargoWorld?.revision ?? "no-loose-world",
      ...(options.inactiveLooseCargoWorlds ?? []).map((cargoWorld) =>
        `${cargoWorld.region.x},${cargoWorld.region.y}:${cargoWorld.revision}`),
    ].join(":"),
    worldName,
    posture: session.posture,
    sessionShape: session.sessionShape,
    clock: {
      day,
      dayLabel: `Day ${day}`,
      timeLabel: `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      paused: session.paused,
    },
    tide: {
      phase: tidePhase,
      label: `${titleCase(tidePhase)} tide`,
      progress: tidePhaseProgress(world.tide.phase),
      nextLabel: world.tide.direction > 0 ? "Water rising" : "Water falling",
    },
    weather: {
      kind: renderWeather(world.weather.kind),
      label: titleCase(world.weather.kind),
      forecast: `Front update in ${Math.max(0, world.weather.nextChangeTick - world.completedTick)}m`,
      intensity: world.weather.intensity / FIXED_POINT,
    },
    player: {
      stamina: player.stamina / FIXED_POINT,
      stability: player.stability / FIXED_POINT,
      stabilityTrend: player.stabilityTrend,
      stabilityHint: player.stabilityHint,
      scanCharge: player.scanCharge / FIXED_POINT,
      cargoLoad: cargoWeight(player),
      cargoCapacity: player.cargoCapacity,
      ...(player.cargo.length > 0
        ? { cargoCondition: Math.min(...player.cargo.map((cargo) => cargo.condition)) / FIXED_POINT }
        : {}),
      pace: player.pace,
      bracing: options.bracing === true,
      ...(playerSettlementId === null
        ? {
            locationLabel: regionalLocationLabel(
              player.mode === "skiff" ? "On the tide" : "Between harbors",
              spatialCenter.x,
              spatialCenter.y,
            ),
          }
        : { locationLabel: settlementName(economy, playerSettlementId) }),
    },
    field: projectFieldReadout(world, player),
    kit: projectKit(world, player, options.looseCargoCarrier),
    choir: projectChoir(economy, player),
    ...(activeContract
      ? { objective: contractObjective(activeContract, economy, world, player, activeCustody) }
      : report
        ? { objective: report }
        : trackedContract?.status === "offered"
          ? { objective: pickupObjective(trackedContract, economy, world, player) }
          : tutorial
            ? { objective: tutorial }
            : { objective: perpetualWorldObjective(session, world) }),
    contracts: economy.contracts
      .filter((contract) => contract.status === "offered" || contract.id === player.activeContractId)
      .sort((left, right) => contractPriority(left, playerSettlementId) - contractPriority(right, playerSettlementId))
      .slice(0, 8)
      .map((contract) => projectContract(
        contract,
        economy,
        world,
        player,
        session,
        contract.id === activeContract?.id ? activeCustody : undefined,
      )),
    ...(selectedSettlement ? { selectedSettlement: projectSettlement(selectedSettlement, economy, playerSettlementId, player) } : {}),
    chronicle: economy.events.slice(-24).reverse().map((event) => projectChronicle(event, economy)),
    title: {
      visible: session.titleVisible,
      hasSave: session.hasSave,
      ...(options.worldCreationBlocked ? { worldCreationBlocked: true } : {}),
      ...(options.requiresSeed ? { requiresSeed: true } : {}),
      worldName,
      ...(session.continueSummary ? { continueSummary: session.continueSummary } : {}),
      suggestedSeed: session.seed,
    },
    ...(session.quietHourVisible
      ? {
          quietHour: {
            visible: true,
            title: "Quiet Hour",
            durationLabel: formatDuration(session.sessionPlayMilliseconds),
            distanceLabel: `${(session.sessionDistanceUnits / 1_000).toFixed(1)} tiles crossed`,
            deliveries: session.sessionDeliveries,
            strandLabel: `${session.sessionStrandsWoven} strands tended · ${session.sessionChoirsAwakened} choirs awakened · ${deployedWayknotCount(player.wayknots)} wayknots bound · ${session.sessionReportsDelivered} reports carried · ${Math.max(0, discoveredTileCount(player) - session.sessionDiscoveredAtStart)} new terrain marks charted`,
            summary: quietSummary(session),
            changes: quietHourChanges(session, economy),
            quote: "A useful path is a promise the land can keep.",
            canFinish: true,
          },
        }
      : {}),
    ...(session.announcement
      ? {
          announcement: {
            id: String(session.announcement.id),
            message: session.announcement.message,
            assertive: session.announcement.assertive,
          },
        }
      : {}),
    ...(options.saveWarning ? { saveWarning: options.saveWarning } : {}),
    controls: {
      canScan: player.mode !== "swept" && player.scanCharge >= 280_000,
      canInteract: player.mode !== "swept"
        && (nearbyParcel !== undefined || localResource !== undefined || playerSettlementId !== null),
      interactLabel: player.mode === "swept"
        ? "Current has helm"
        : nearbyParcel
          ? "Recover parcel"
        : localResource
          ? `Gather ${CRAFTING_STACK_DEFINITIONS[localResource.material].label}`
        : activeContract?.destinationSettlementId === playerSettlementId
        ? "Deliver cargo"
        : player.report?.targetSettlementId === playerSettlementId
          ? "Deliver report"
          : player.activeContractId === null && player.report === null && localOffers.length === 1
            ? "Pick up cargo"
            : "Inspect harbor",
      interactHint: player.mode === "swept"
        ? "Harbor actions return after the safe bank catches you."
        : nearbyParcel
          ? `A physical ${nearbyParcel.payload.kind === "promise" ? "Promise parcel" : "field item"} is within reach. Desktop: press E. Mobile: tap the parcel.`
        : localResource
          ? `One ${CRAFTING_STACK_DEFINITIONS[localResource.material].label} unit is underfoot. Desktop: press E. Mobile: tapping its field mark routes here and gathers automatically.`
        : playerSettlementId === null
        ? "Reach a harbor mark first."
        : localOffers.length === 1
          ? "One local promise is ready here; this collects its physical cargo."
          : localOffers.length > 1
            ? `${localOffers.length} local cargo promises are waiting; open Promises to choose one.`
            : "Open this harbor's people, stores, routes, and reports.",
      canWayknot: !session.paused
        && !session.titleVisible
        && !session.quietHourVisible
        && player.mode !== "swept"
        && wayknotControl.available,
      wayknotLabel: wayknotControl.label,
      wayknotHint: wayknotControl.hint,
      canEndSession: !session.titleVisible,
    },
  };
}

function regionalLocationLabel(base: string, regionX: number, regionY: number): string {
  if (regionX === 0 && regionY === 0) return base;
  const axis = (value: number) => value > 0 ? `+${value}` : String(value);
  return `${base} · R ${axis(regionX)},${axis(regionY)}`;
}

function resourceUnderfoot(
  player: PlayerState,
  options: UIProjectionOptions,
): FieldResourceNode | undefined {
  const catalog = options.fieldResourceCatalog;
  const ecology = options.fieldResourceEcology;
  if (!catalog || !ecology) return undefined;
  const tileIndex = playerTileIndex(player);
  const node = catalog.nodes.find((candidate) => candidate.tileIndex === tileIndex);
  if (!node || (player.discovered[tileIndex] ?? 0) <= 0) return undefined;
  const stock = fieldResourceStockUnits(catalog, ecology, node.id);
  return stock !== null && stock > 1 ? node : undefined;
}

function craftingRevision(player: PlayerState): string {
  const stacks = CRAFTING_STACK_IDS
    .map((id) => `${id}:${player.craftingInventory.stacks[id]}`)
    .join(",");
  const gear = player.craftingInventory.gear
    .map((item) => `${item.id}:${item.kind}:${item.condition}`)
    .join(",");
  return `${stacks}|${gear}|${player.nextCraftedGearId}|${cargoWeightMilli(player)}`;
}

function projectKit(
  world: WorldView,
  player: PlayerState,
  carrier?: LooseCargoCarrierState,
): KitUIView {
  const capacityMilli = player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT;
  const transportMilli = transportLoadMilli(player);
  const inventory = actionableCraftingInventory(player);
  const actionsBlocked = player.mode === "swept" || player.mode === "rescued";
  const dropBlocker = actionsBlocked
    ? "Secure your footing before releasing anything from the PACK."
    : undefined;
  const exactPromiseLots = carrier?.lots.filter((lot) => lot.payload.kind === "promise") ?? [];
  const transportRows: KitUIView["transportRows"] = [
    ...(carrier
      ? exactPromiseLots.map((lot) => {
          if (lot.payload.kind !== "promise") throw new Error("Promise lot projection lost its kind");
          return {
            id: lot.id,
            lotId: lot.id,
            kind: "promise-cargo" as const,
            label: `${lot.payload.quantity} ${titleCase(lot.payload.resource)}`,
            detail: `${titleCase(lot.payload.property)} Promise cargo · exact physical lot`,
            loadMilli: looseCargoPayloadLoadMilli(lot.payload),
            condition: lot.materialState.condition / FIXED_POINT,
            dropQuantity: lot.payload.quantity,
            canDrop: dropBlocker === undefined,
            ...(dropBlocker ? { dropDisabledReason: dropBlocker } : {}),
          };
        })
      : player.cargo.map((cargo) => ({
          id: `cargo-${cargo.contractId}`,
          kind: "promise-cargo" as const,
          label: `${cargo.quantity} ${titleCase(cargo.resource)}`,
          detail: `${titleCase(cargo.property)} Promise cargo`,
          loadMilli: legacyCargoLoadMilli(cargo.quantity, cargo.property),
          condition: cargo.condition / FIXED_POINT,
        }))),
    ...(player.report
      ? [{
          id: `report-${player.report.sourceSettlementId}-${player.report.targetSettlementId}`,
          kind: "signed-report" as const,
          label: `Signed ${titleCase(player.report.resource)} report`,
          detail: "Information only · sealed document case",
          loadMilli: PACK_LOAD_MILLI_PER_UNIT,
        }]
      : []),
  ];
  const stackRows: KitUIView["stackRows"] = carrier
    ? carrier.lots.flatMap((lot) => {
        if (lot.payload.kind !== "stack") return [];
        const definition = CRAFTING_STACK_DEFINITIONS[lot.payload.item];
        return [{
          id: lot.id,
          itemId: lot.payload.item,
          lotId: lot.id,
          tier: definition.tier,
          label: definition.label,
          quantity: lot.payload.quantity,
          unitLoadMilli: definition.loadMilli,
          totalLoadMilli: definition.loadMilli * lot.payload.quantity,
          location: "pack" as const,
          locationLabel: materialStateLabel(lot.materialState),
          canDrop: dropBlocker === undefined,
          ...(dropBlocker ? { dropDisabledReason: dropBlocker } : {}),
        }];
      })
    : CRAFTING_STACK_IDS.flatMap((id) => {
        const quantity = player.craftingInventory.stacks[id];
        if (quantity <= 0) return [];
        const definition = CRAFTING_STACK_DEFINITIONS[id];
        return [{
          id,
          itemId: id,
          tier: definition.tier,
          label: definition.label,
          quantity,
          unitLoadMilli: definition.loadMilli,
          totalLoadMilli: definition.loadMilli * quantity,
          location: "pack" as const,
          locationLabel: "Carried PACK",
        }];
      });
  const craftedGearRows: KitUIView["gearRows"] = player.craftingInventory.gear.map((gear) => {
    const definition = CRAFTED_GEAR_DEFINITIONS[gear.kind];
    const repairPreview = inventory
      ? previewRepair(inventory, gear.id, 250_000)
      : null;
    const dismantlePreview = inventory
      ? previewDismantle(inventory, gear.id)
      : null;
    const actionBlocker = actionsBlocked
      ? "Secure your footing before changing field gear."
      : inventory
        ? undefined
        : "Shared pack is over capacity.";
    const carrierLot = carrier?.lots.find((lot) =>
      lot.payload.kind === "gear" && lot.payload.gearId === gear.id);
    return {
      id: String(gear.id),
      ...(carrierLot ? { lotId: carrierLot.id } : {}),
      kind: gear.kind,
      label: `${definition.label} #${gear.id}`,
      detail: gearPurpose(gear.kind),
      location: "carried" as const,
      locationLabel: "Carried in PACK",
      loadMilli: definition.loadMilli,
      condition: gear.condition / FIXED_POINT,
      conditionLabel: conditionBand(gear.condition),
      repairCostLabel: repairPreview?.quote
        ? stackAmountsLabel(repairPreview.quote.ingredients)
        : gear.condition >= FIXED_POINT
          ? "Already pristine"
          : "Repair quote unavailable",
      salvageLabel: stackAmountsLabel(salvageForGear(gear), "No usable salvage"),
      canRepair: actionBlocker === undefined && repairPreview?.ok === true,
      ...(actionBlocker || !repairPreview?.ok
        ? { repairDisabledReason: actionBlocker ?? repairPreview?.message ?? "Cannot mend this item." }
        : {}),
      canDismantle: actionBlocker === undefined && dismantlePreview?.ok === true,
      ...(actionBlocker || !dismantlePreview?.ok
        ? { dismantleDisabledReason: actionBlocker ?? dismantlePreview?.message ?? "Cannot dismantle this item." }
        : {}),
      canDrop: carrierLot !== undefined && dropBlocker === undefined,
      ...(carrierLot && dropBlocker ? { dropDisabledReason: dropBlocker } : {}),
    };
  });
  const coreWayknotRows: KitUIView["gearRows"] = player.wayknots.wayknots.map((wayknot) => {
    const quote = quoteWayknotRepairCost(wayknot.kind, wayknot.condition, 250_000);
    const missing = quote?.ingredients.filter(
      ({ item, quantity }) => player.craftingInventory.stacks[item] < quantity,
    ) ?? [];
    const deployed = wayknot.region !== null && wayknot.tileIndex !== null;
    const pristine = wayknot.condition >= FIXED_POINT;
    const actionBlocker = actionsBlocked
      ? "Secure your footing before mending a Wayknot."
      : deployed
        ? "Reclaim this Wayknot before mending it."
        : pristine
          ? "Already pristine."
          : missing.length > 0
            ? `Missing ${missing.map(({ item, quantity }) => `${quantity - player.craftingInventory.stacks[item]} ${CRAFTING_STACK_DEFINITIONS[item].label}`).join(" + ")}.`
            : undefined;
    const viewTileIndex = wayknot.region === null || wayknot.tileIndex === null
      ? null
      : regionalWayknotViewTileIndex(world, wayknot.region, wayknot.tileIndex);
    const tile = viewTileIndex === null ? undefined : world.terrain.tiles[viewTileIndex];
    return {
      id: String(wayknot.id),
      kind: wayknot.kind,
      label: `${WAYKNOT_LABELS[wayknot.kind]} #${wayknot.id}`,
      detail: `LIVE INHERITED CORE · ${WAYKNOT_DESCRIPTIONS[wayknot.kind]} Rebinding spends condition and never refreshes it.`,
      location: deployed ? "deployed" as const : "carried" as const,
      locationLabel: deployed
        ? tile && wayknot.region && wayknot.tileIndex !== null
          ? `Deployed in region ${wayknot.region.x},${wayknot.region.y} at ${wayknot.tileIndex % WORLD_WIDTH},${Math.floor(wayknot.tileIndex / WORLD_WIDTH)}`
          : wayknot.region
            ? `Deployed beyond this chart in region ${wayknot.region.x},${wayknot.region.y}`
            : "Deployed in the field"
        : "Core field-kit piece · zero compatibility load",
      loadMilli: 0,
      condition: wayknot.condition / FIXED_POINT,
      conditionLabel: conditionBand(wayknot.condition),
      repairCostLabel: quote
        ? stackAmountsLabel(quote.ingredients, "Already pristine")
        : "Repair quote unavailable",
      salvageLabel: "Core piece cannot be dismantled",
      canRepair: actionBlocker === undefined && (quote?.conditionRestored ?? 0) > 0,
      ...(actionBlocker ? { repairDisabledReason: actionBlocker } : {}),
      canDismantle: false,
      dismantleDisabledReason: "The six inherited core Wayknots keep their stable identities.",
    };
  });
  const gearRows: KitUIView["gearRows"] = [...coreWayknotRows, ...craftedGearRows];
  const recipes: KitUIView["recipes"] = CRAFTING_RECIPES.map((recipe) => {
    const gearId = recipe.output.type === "gear" ? player.nextCraftedGearId : undefined;
    const preview = inventory
      ? previewCraft(inventory, { recipeId: recipe.id, ...(gearId ? { gearId } : {}) })
      : null;
    const ingredients = recipe.inputs.map(({ item, quantity }) => ({
      id: item,
      label: CRAFTING_STACK_DEFINITIONS[item].label,
      required: quantity,
      available: player.craftingInventory.stacks[item],
      sufficient: player.craftingInventory.stacks[item] >= quantity,
    }));
    const resultDefinition = recipe.output.type === "gear"
      ? CRAFTED_GEAR_DEFINITIONS[recipe.output.kind]
      : CRAFTING_STACK_DEFINITIONS[recipe.output.item];
    const actionBlocker = actionsBlocked
      ? "Secure your footing before making field gear."
      : inventory
        ? undefined
        : "Shared pack is over capacity.";
    return {
      id: recipe.id,
      label: recipe.label,
      resultLabel: resultDefinition.label,
      resultDetail: recipe.output.type === "gear"
        ? gearPurpose(recipe.output.kind)
        : componentPurpose(recipe.output.item),
      resultLoadMilli: resultDefinition.loadMilli,
      ingredientCopy: ingredients
        .map((ingredient) => `${ingredient.available}/${ingredient.required} ${ingredient.label}`)
        .join(" · "),
      ingredients,
      canCraft: actionBlocker === undefined && preview?.ok === true,
      ...(actionBlocker || !preview?.ok
        ? { disabledReason: actionBlocker ?? preview?.message ?? "Recipe unavailable." }
        : {}),
    };
  });
  const settlementId = settlementAtPlayer(player, world);
  return {
    revision: `${craftingRevision(player)}|carrier:${carrier?.revision ?? "legacy"}`,
    combinedLoadMilli: cargoWeightMilli(player),
    capacityMilli,
    transportLoadMilli: transportMilli,
    transportRows,
    stackRows,
    gearRows,
    recipes,
    locationLabel: settlementId === null
      ? "Field crafting · PACK only"
      : `${settlementName(world, settlementId)} harbor · PACK only`,
    hint: "Natural finds, components, durable gear, Promise cargo, and reports share one physical pack. MAKE and MEND never pause the estuary. Wraps, sash, cleats, and cape already adapt travel; each staged item says what still awaits its terrain phase.",
  };
}

function materialStateLabel(state: {
  readonly condition: number;
  readonly contamination: number;
  readonly decay: number;
}): string {
  const condition = Math.floor((state.condition * 100) / FIXED_POINT);
  const contamination = Math.floor((state.contamination * 100) / FIXED_POINT);
  const decay = Math.floor((state.decay * 100) / FIXED_POINT);
  const extras = [
    contamination > 0 ? `${contamination}% tainted` : "",
    decay > 0 ? `${decay}% weathered` : "",
  ].filter(Boolean);
  return `Carried PACK · ${condition}% condition${extras.length > 0 ? ` · ${extras.join(" · ")}` : ""}`;
}

function actionableCraftingInventory(player: PlayerState): CraftingInventory | null {
  const availableMilli = player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT - transportLoadMilli(player);
  try {
    return createCraftingInventory(
      Math.max(0, availableMilli),
      player.craftingInventory.stacks,
      player.craftingInventory.gear,
    );
  } catch {
    return null;
  }
}

function legacyCargoLoadMilli(
  quantity: number,
  property: PlayerState["cargo"][number]["property"],
): number {
  return promiseCargoLoadMilli(quantity, property);
}

function conditionBand(condition: number): string {
  const percent = Math.round(Math.max(0, Math.min(FIXED_POINT, condition)) / 10_000);
  const band = condition <= 0
    ? "BROKEN"
    : condition <= 350_000
      ? "FRAIL"
      : condition <= 750_000
        ? "WORN"
        : "SOUND";
  return `${band} · ${percent}%`;
}

function stackAmountsLabel(
  amounts: readonly StackAmount[],
  empty = "No materials",
): string {
  if (amounts.length === 0) return empty;
  return amounts
    .map(({ item, quantity }) => `${quantity} ${CRAFTING_STACK_DEFINITIONS[item].label}`)
    .join(" + ");
}

function componentPurpose(kind: string): string {
  switch (kind) {
    case "braided-cord": return "Prepared binding for frames, wearables, and deployables.";
    case "float-cell": return "Buoyant prepared cell for water adaptations.";
    case "glimmer-seal": return "Magic-water seal for protective cargo layers.";
    case "pitchcloth": return "Weather-shedding prepared cloth.";
    case "stone-fitting": return "Rigid fitting for grip, anchors, and ladders.";
    case "stormweave": return "Wind-reactive weave for exposed terrain.";
    default: return "Prepared component used by durable field adaptations.";
  }
}

function gearPurpose(kind: string): string {
  switch (kind) {
    case "cargo-rain-shroud": return "STAGED · cargo wetting arrives with the exposure simulation.";
    case "float-sash": return "LIVE · reduces stamina spent while moving through water; zero meters still mean sweep.";
    case "glimmer-liner": return "STAGED · magical-water cargo reactions arrive with exposure.";
    case "ladder": return "STAGED · deployment arrives with solid rock formations.";
    case "marsh-wraps": return "LIVE · improves movement and footing across marsh and tidal flats.";
    case "pannier": return "STAGED · capacity bonus awaits explicit over-capacity grace rules.";
    case "reed-mat": return "STAGED CRAFTED SPARE · the six inherited core mats remain the deployable set.";
    case "ridge-cleats": return "LIVE · improves speed and footing on existing ridge terrain.";
    case "tide-anchor": return "STAGED CRAFTED SPARE · the inherited core anchors remain deployable.";
    case "weather-cape": return "LIVE · softens gust-driven stability loss on exposed travel.";
    case "wind-knot": return "STAGED CRAFTED SPARE · the inherited core knots remain deployable.";
    default: return "Durable field adaptation.";
  }
}

function projectFieldReadout(world: WorldView, player: PlayerState) {
  const index = playerTileIndex(player);
  const tile = world.terrain.tiles[index];
  const settlement = world.settlements.find((candidate) => candidate.tileIndex === index);
  const depth = tile?.waterDepth ?? 0;
  const depthKnown = (player.depthSoundings[index] ?? 0) > 0;
  const band = waterDepthBand(depth);
  const effects = wayknotEffectsAt(player, world, index);
  const effort = waterEffortPerStep(player, depth, effects.staminaCostPermille);
  const activeWayknotLabels = [...new Set(
    effects.influences.map((influence) => WAYKNOT_LABELS[influence.kind]),
  )];
  const tideHarps = tunedTideHarps(player, world);
  const activeTideHarp = activeTideHarpAtPlayer(player, world, tideHarps);
  const sweptProgress = sweepProgress(player);
  const biome = tile ? biomeAtPlayer(world, tile) : undefined;
  const biomeLabel = biome ? biomeFieldLabel(biome) : undefined;
  const terrainLabel = settlement
    ? `${settlement.name} harbor · ${biomeLabel ?? "built shore"}`
    : tile
      ? `${biomeLabel ?? "Unclassified"} · ${fieldTerrainLabel(tile)}`
      : "Uncharted ground";
  const depthLabel = depth <= 20_000
    ? "Dry footing"
    : depthKnown
      ? `${(depth / 125_000).toFixed(1)}m sounding · ${band} water`
      : "Water depth unsounded · pulse Space";
  const effortLabel = effort <= 0
    ? tile?.terrain === "marsh" || tile?.terrain === "tidal-flat" ? "Soft ground effort" : "Normal stamina use"
    : effort < 900
      ? "Low water drain"
      : effort < 1_800
        ? "Moderate water drain"
        : effort < 2_700
          ? "High water drain"
          : "Severe water drain";
  const hint = player.mode === "swept"
    ? `Current has the helm · ${Math.round(sweptProgress * 100)}% toward a safe bank. Steering and sounding return ashore; cargo remains physical, and anything separated stays recoverable.`
    : depth > 20_000 && !depthKnown
      ? "Sound this water first (Space). Depth changes stamina use and whether flooded ground takes a Reed mat or Tide anchor."
    : activeTideHarp
      ? `${activeTideHarp.label} is active around you. It adds a bounded +900 Loom charge each tick beyond any Waychord recharge; Space still sounds here and also echoes a radius-6 sounding from all three knot origins.`
    : activeWayknotLabels.length >= 2
      ? `WAYCHORD · ${activeWayknotLabels.join(" + ")} overlap here. Their terrain effects remain distinct, while the harmony recharges the Loom faster.`
      : activeWayknotLabels[0] === WAYKNOT_LABELS["reed-mat"]
        ? "A reusable Reed mat is reducing soft-ground drag and stamina cost here. Stand on its woven mark and press F to reclaim it."
        : activeWayknotLabels[0] === WAYKNOT_LABELS["tide-anchor"]
          ? "A nearby Tide anchor is reducing water stamina cost and weakening any current sweep. Stand on its buoy and press F to reclaim it."
          : activeWayknotLabels[0] === WAYKNOT_LABELS["wind-knot"]
            ? "A nearby Wind knot is softening gust-driven stability loss. Stand at its mast and press F to reclaim it."
            : depth > 20_000
                ? `${titleCase(band)} water costs ${effort.toLocaleString()} extra stamina per movement step${player.tools.includes("tide-sail") ? "; the Tide sail is reducing it" : ""}. Empty stamina or stability in deep water means a recoverable sweep.`
                : tile?.terrain === "marsh" || tile?.terrain === "tidal-flat"
                  ? player.tools.includes("marsh-stilts")
                    ? "Marsh stilts are reducing drag and ground effort here."
                    : "A completed crossing can entrust you with Marsh stilts for soft terrain."
                  : "Complete civic projects, then visit their harbor to inherit practical field tools.";
  return {
    isWater: depth > 20_000,
    terrainLabel,
    depthLabel,
    depthKnown,
    effortLabel,
    hint,
    toolLabels: player.tools.map((tool) => FIELD_TOOL_LABELS[tool]),
    deployedWayknots: deployedWayknotCount(player.wayknots),
    wayknotCapacity: player.wayknots.capacity,
    activeWayknotLabels,
    tideHarps: {
      tunedCount: tideHarps.length,
      activeId: activeTideHarp?.id ?? null,
      activeLabel: activeTideHarp?.label ?? null,
      benefitLabel: "+900 Loom/tick · Space sounds radius 6 from all 3 knots",
    },
    swept: player.mode === "swept",
    sweptProgress,
  };
}

function biomeAtPlayer(
  world: WorldView,
  tile: WorldView["terrain"]["tiles"][number],
): BiomeId {
  const seed = world.rootSeed ?? seedFromText(world.seedText);
  return deriveBiomeProfile({
    seed,
    tile,
    gridHeight: world.terrain.height,
    weather: world.weather,
    magicalWaterInfluence: deriveMagicalWaterInfluence(seed, tile),
  }).id;
}

function biomeFieldLabel(biome: BiomeId): string {
  switch (biome) {
    case "tide-channel": return "Tide channel";
    case "brine-flat": return "Brine flat";
    case "reed-marsh": return "Reed marsh";
    case "rain-meadow": return "Rain meadow";
    case "sun-meadow": return "Sun meadow";
    case "wind-ridge": return "Wind ridge";
    case "glimmerfen": return "Glimmerfen";
  }
}

function projectWayknotControl(world: WorldView, player: PlayerState) {
  const tileIndex = playerTileIndex(player);
  const resolved = regionalWayknotContextAt(world, tileIndex);
  const existing = resolved
    ? wayknotAtTile(player.wayknots, resolved.localTileIndex, resolved.region)
    : null;
  if (existing) {
    const label = WAYKNOT_LABELS[existing.kind];
    const strength = wayknotEffectStrength(existing, world.completedTick);
    const settingTicks = Math.max(0, existing.readyTick - world.completedTick);
    return {
      available: true,
      label: `Reclaim ${label}`,
      hint: `${label} #${existing.id} is directly underfoot at ${Math.round(existing.condition / 10_000)}% condition${strength === 0 ? " · BROKEN" : settingTicks > 0 ? ` · SETTING ${settingTicks}t` : " · READY"}. Press F to reclaim it; reclaiming spends 4% condition and never resets wear.`,
    };
  }
  const context = resolved?.context;
  const needsLocalSounding = context !== undefined
    && context.terrain !== "deep-water"
    && context.waterDepth > 20_000
    && (player.depthSoundings[tileIndex] ?? 0) <= 0;
  if (needsLocalSounding) {
    return {
      available: false,
      label: "Sound water first",
      hint: "Sound this flooded ground with Space before using F. Outside an obvious tidal channel, the field kit waits for a sounding before choosing a Reed mat or Tide anchor.",
    };
  }
  const kind = context ? contextualWayknotKind(context) : null;
  if (!context || !kind) {
    return {
      available: false,
      label: "Bind Wayknot",
      hint: "Find marsh or mudflat for a Reed mat, waist-deep water for a Tide anchor, or exposed scrub/ridge for a Wind knot.",
    };
  }
  const label = WAYKNOT_LABELS[kind];
  const reason = validateWayknotPlacement(
    player.wayknots,
    kind,
    context,
    undefined,
    resolved?.region,
  );
  if (reason !== "available") {
    return {
      available: false,
      label: reason === "condition-too-low"
        ? `${label} too frail`
        : reason === "capacity-reached"
          ? `No ${label} free`
          : "Bind Wayknot",
      hint: reason === "condition-too-low"
        ? `${label} needs at least ${Math.round(WAYKNOT_MIN_PLACEMENT_CONDITION / 10_000)}% condition to bind. Redeploying preserves wear rather than refreshing it.`
        : reason === "capacity-reached"
          ? `Both reusable ${label.toLocaleLowerCase()} pieces are deployed. Stand on one and press F to reclaim it.`
          : "Harbor decking and occupied tiles cannot hold a field weave.",
    };
  }
  const verb = kind === "reed-mat" ? "Lay" : kind === "tide-anchor" ? "Set" : "Tie";
  return {
    available: true,
    label: `${verb} ${label}`,
    hint: `${label} fits this terrain. Press F to bind one reusable piece; stand on it and press F again to reclaim it.`,
  };
}

function sweepProgress(player: PlayerState): number {
  if (player.mode !== "swept") return 0;
  const total = Math.max(1, player.sweepTotalTicks);
  const raw = 1 - player.sweepTicksRemaining / total;
  // Completion is only truthful after stepPlayer reaches a safe bank and
  // leaves swept mode. Rounding or a repaired legacy save must never show
  // 100% while control is still unavailable.
  return Math.max(0, Math.min(0.99, raw));
}

function fieldTerrainLabel(tile: WorldView["terrain"]["tiles"][number]): string {
  switch (tile.terrain) {
    case "deep-water": return "Tidal channel";
    case "tidal-flat": return tile.moisture < 560_000 || tile.elevation > 310_000 ? "Shell sandbar" : "Silt flat";
    case "marsh": return "Reed marsh";
    case "meadow": return tile.moisture < 545_000 || tile.roughness > 610_000 ? "Wind scrub" : "Salt meadow";
    case "ridge": return "Shell ridge";
  }
}

function projectContract(
  contract: ContractState,
  world: WorldView,
  spatialWorld: WorldView,
  player: PlayerState,
  session: GameSessionState,
  custody?: PromiseCustodyProjection,
): ContractUIView {
  const origin = settlementName(world, contract.originSettlementId);
  const destination = settlementName(world, contract.destinationSettlementId);
  const atOrigin = settlementAtPlayer(player, spatialWorld) === contract.originSettlementId;
  const isActive = player.activeContractId === contract.id;
  const cargoProperty = propertyForResource(contract.resource);
  const journey = journeyProgress(contract, world, spatialWorld, player);
  const route = world.routes.find((candidate) => candidate.id === contract.routeId);
  const destinationSettlement = world.settlements.find((settlement) => settlement.id === contract.destinationSettlementId);
  const requester = world.residents.find((resident) => resident.id === contract.requesterResidentId);
  const projectResponds = destinationSettlement?.project.status === "building"
    && destinationSettlement.project.resource === contract.resource;
  return {
    id: String(contract.id),
    title: `${contract.quantity} ${titleCase(contract.resource)} · ${origin} → ${destination}`,
    ...(requester ? { requester: `Requested by ${requester.name} · ${titleCase(requester.role)}` } : {}),
    summary: `${destination} reports a real shortage; ${origin} can spare ${contract.quantity}.`,
    origin,
    destination,
    cargoLabel: `${contract.quantity} ${titleCase(contract.resource)}`,
    cargoProperty,
    mood: moodFor(contract, world),
    status: isActive ? "tracked" : contract.status === "offered" ? "available" : "accepted",
    progress: isActive ? journey.progress : 0,
    eta: contractRouteEstimate(contract, route, world, player, cargoProperty),
    forecast: contractForecast(route, world, player),
    masteryHint: cargoMasteryHint(cargoProperty),
    consequence: projectResponds
      ? `${destination}'s reserve, ${titleCase(destinationSettlement.project.kind)} project, trust, and traveled route will all respond.`
      : `${destination}'s reserve, inter-harbor trust, and the exact route you travel will respond.`,
    selected: session.inspectedContractId === contract.id || session.trackedContractId === contract.id,
    disabled: !isActive && player.activeContractId !== null,
    actionLabel: isActive && (custody?.looseQuantity ?? 0) > 0
      ? `Recover ${custody?.looseQuantity ?? 0} loose first`
      : isActive
      ? settlementAtPlayer(player, spatialWorld) === null
        ? "Handoff at any harbor"
        : "Hand off promise safely"
      : atOrigin
        ? "Pick up cargo here"
        : `Go to ${origin} for pickup`,
  };
}

function contractObjective(
  contract: ContractState,
  world: WorldView,
  spatialWorld: WorldView,
  player: PlayerState,
  custody?: PromiseCustodyProjection,
) {
  const origin = settlementName(world, contract.originSettlementId);
  const destination = settlementName(world, contract.destinationSettlementId);
  const cargo = player.cargo.find((item) => item.contractId === contract.id);
  const journey = journeyProgress(contract, world, spatialWorld, player);
  if (custody && custody.looseQuantity > 0) {
    const motion = custody.nearestLoose?.motion === "snagged"
      ? `snagged by ${custody.nearestLoose.snaggedBy ?? "vegetation"}`
      : custody.nearestLoose?.motion ?? "moving";
    const range = custody.nearestLoose
      ? `${custody.nearestLoose.distance.toFixed(1)} tiles ${custody.nearestLoose.direction} · ${motion}`
      : "marked in the loaded landscape";
    return {
      id: `recover-${contract.id}`,
      eyebrow: "Recover loose Promise cargo",
      title: `RECOVER ${custody.looseQuantity} ${titleCase(contract.resource)} BEFORE DELIVERY`,
      description: `${custody.carriedQuantity} of ${contract.quantity} promised units are secured. The nearest exact parcel is ${range}; press E within reach on desktop or tap its parcel marker on mobile. Water and grade may keep moving it.`,
      progress: Math.max(0, Math.min(1, custody.carriedQuantity / Math.max(1, contract.quantity))),
      progressLabel: `${custody.carriedQuantity} carried · ${custody.looseQuantity} loose · harbor handoff blocked`,
      why: `RECOVER · ${range} · repack every physical unit before ${destination} can sign the receipt.`,
    };
  }
  return {
    id: String(contract.id),
    eyebrow: `Deliver to ${destination}`,
    title: `DELIVER ${contract.quantity} ${titleCase(contract.resource)} → ${destination}`,
    description: cargo
      ? `Pickup complete at ${origin}. The cargo is in your pack at ${Math.round((cargo.condition / FIXED_POINT) * 100)}% condition; reach ${destination}'s harbor mark and press E.`
      : `The promise is recorded, but pickup is not complete. Return to ${origin} and use the harbor action.`,
    progress: cargo ? journey.progress : 0,
    progressLabel: cargo
      ? journey.remaining === null
        ? `Route position unavailable · ${Math.round((cargo.condition / FIXED_POINT) * 100)}% condition`
        : `${journey.remaining.toFixed(1)} tiles remaining · ${Math.round((cargo.condition / FIXED_POINT) * 100)}% condition${journey.direction ? ` · bearing ${journey.direction}` : ""}`
      : "Awaiting pickup",
    why: `PICKUP: ${origin} ✓  ·  DELIVERY: ${destination}. Every condition grade still arrives.`,
  };
}

interface PromiseCustodyProjection {
  readonly carriedQuantity: number;
  readonly looseQuantity: number;
  readonly nearestLoose?: {
    readonly id: string;
    readonly distance: number;
    readonly direction: string;
    readonly motion: LooseCargoWorldState["entities"][number]["motion"];
    readonly snaggedBy: LooseCargoWorldState["entities"][number]["snaggedBy"];
  };
}

function promiseCustody(
  contract: ContractState,
  player: PlayerState,
  spatialWorld: WorldView,
  carrier?: LooseCargoCarrierState,
  looseWorlds: readonly LooseCargoWorldState[] = [],
): PromiseCustodyProjection | undefined {
  if (!carrier || looseWorlds.length === 0) return undefined;
  const carriedQuantity = carrier.lots.reduce((total, lot) =>
    total + (lot.payload.kind === "promise" && lot.payload.contractId === contract.id
      ? lot.payload.quantity
      : 0), 0);
  const loose = looseWorlds.flatMap((cargoWorld) => cargoWorld.entities
    .filter((entity) => entity.payload.kind === "promise" && entity.payload.contractId === contract.id)
    .map((entity) => ({ cargoWorld, entity })));
  const looseQuantity = loose.reduce((total, { entity }) =>
    total + (entity.payload.kind === "promise" ? entity.payload.quantity : 0), 0);
  const nearest = [...loose]
    .map(({ cargoWorld, entity }) => {
      const vector = looseParcelVector(player, spatialWorld, cargoWorld, entity.x, entity.y);
      return {
        id: entity.id,
        distance: vector ? Math.abs(vector.dx) + Math.abs(vector.dy) : Number.POSITIVE_INFINITY,
        direction: vector ? looseParcelDirection(vector.dx, vector.dy) : "beyond the chart",
        motion: entity.motion,
        snaggedBy: entity.snaggedBy,
      };
    })
    .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id))[0];
  return {
    carriedQuantity,
    looseQuantity,
    ...(nearest ? { nearestLoose: nearest } : {}),
  };
}

function nearestLooseParcel(
  player: PlayerState,
  spatialWorld: WorldView,
  looseWorld: LooseCargoWorldState | undefined,
  maximumDistance: number,
): LooseCargoWorldState["entities"][number] | undefined {
  if (!looseWorld) return undefined;
  return [...looseWorld.entities]
    .map((entity) => ({
      entity,
      distance: looseParcelDistance(player, spatialWorld, looseWorld, entity.x, entity.y),
    }))
    .filter(({ distance }) => distance <= maximumDistance)
    .sort((left, right) => left.distance - right.distance
      || left.entity.id.localeCompare(right.entity.id))[0]?.entity;
}

function looseParcelDistance(
  player: PlayerState,
  spatialWorld: WorldView,
  cargoWorld: LooseCargoWorldState,
  x: number,
  y: number,
): number {
  const vector = looseParcelVector(player, spatialWorld, cargoWorld, x, y);
  return vector ? Math.abs(vector.dx) + Math.abs(vector.dy) : Number.POSITIVE_INFINITY;
}

/**
 * Chart coordinates increase east on x and south on y. Classify the parcel
 * into a true eight-way compass sector, while naming an overlapping parcel
 * explicitly so RECOVER guidance never loses its direction word.
 */
function looseParcelDirection(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return "here";
  const angle = Math.atan2(dy, dx);
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return [
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
    "north",
    "north-east",
  ][sector] ?? "here";
}

function looseParcelVector(
  player: PlayerState,
  spatialWorld: WorldView,
  cargoWorld: LooseCargoWorldState,
  x: number,
  y: number,
): { readonly dx: number; readonly dy: number } | null {
  const playerAddress = regionalAddressAt(spatialWorld, playerTileIndex(player));
  if (!playerAddress) return null;
  const playerGlobal = regionLocalToGlobalTile(
    playerAddress.region,
    playerAddress.localX,
    playerAddress.localY,
  );
  const playerTileX = Math.floor(player.x / TILE_UNITS);
  const playerTileY = Math.floor(player.y / TILE_UNITS);
  const playerX = playerGlobal.x + player.x / TILE_UNITS - playerTileX;
  const playerY = playerGlobal.y + player.y / TILE_UNITS - playerTileY;
  const cargoLocalX = Math.floor(x / FIXED_POINT);
  const cargoLocalY = Math.floor(y / FIXED_POINT);
  const cargoGlobal = regionLocalToGlobalTile(
    cargoWorld.region,
    cargoLocalX,
    cargoLocalY,
  );
  return {
    dx: cargoGlobal.x + x / FIXED_POINT - cargoLocalX - playerX,
    dy: cargoGlobal.y + y / FIXED_POINT - cargoLocalY - playerY,
  };
}

function pickupObjective(
  contract: ContractState,
  world: WorldView,
  spatialWorld: WorldView,
  player: PlayerState,
) {
  const origin = world.settlements.find((settlement) => settlement.id === contract.originSettlementId);
  const destination = settlementName(world, contract.destinationSettlementId);
  const originName = origin?.name ?? settlementName(world, contract.originSettlementId);
  const tile = origin ? world.terrain.tiles[origin.tileIndex] : undefined;
  const delta = tile ? compatibilityTileDelta(spatialWorld, player, tile.x, tile.y) : null;
  const remaining = delta ? Math.hypot(delta.dx, delta.dy) : null;
  const route = world.routes.find((candidate) => candidate.id === contract.routeId);
  const total = Math.max(1, route ? route.path.length - 1 : remaining ?? 1);
  const direction = delta ? compassDirection(delta.dx, delta.dy) : "";
  return {
    id: `pickup-${contract.id}`,
    eyebrow: `Pick up at ${originName}`,
    title: `PICK UP ${contract.quantity} ${titleCase(contract.resource)} ← ${originName}`,
    description: `The cargo is waiting at ${originName}; it is not in your pack yet. Follow the amber pickup marker${direction ? ` ${direction}` : ""}, then choose “Pick up cargo here.”`,
    progress: remaining === null ? 0 : Math.max(0, Math.min(1, 1 - remaining / total)),
    progressLabel: remaining === null
      ? `Route position unavailable · then deliver to ${destination}`
      : `${remaining.toFixed(1)} tiles to pickup · then deliver to ${destination}${direction ? ` · pickup bearing ${direction}` : ""}`,
    why: `PICKUP: ${originName}  ·  DELIVERY: ${destination}. The objective changes automatically after collection.`,
  };
}

function projectChoir(world: WorldView, player: PlayerState) {
  const phraseHarbors = player.harborTrail
    .map((id) => world.settlements.find((settlement) => settlement.id === id)?.name)
    .filter((name): name is string => name !== undefined);
  const legCount = Math.max(0, phraseHarbors.length - 1);
  const awakenedCount = world.choirs.length;
  return {
    awakenedCount,
    surveyedCount: player.surveyedRouteIds.length,
    totalRoutes: world.routes.length,
    phraseHarbors,
    progress: Math.min(1, legCount / 3),
    label: awakenedCount === 0
      ? `${player.surveyedRouteIds.length} strands heard`
      : `${awakenedCount} ${awakenedCount === 1 ? "choir" : "choirs"} awake`,
    hint: phraseHarbors.length <= 1
      ? "Travel from this harbor to another along its visible corridor to survey the first note."
      : `Current phrase: ${phraseHarbors.join(" → ")}. Close a simple loop of three or more harbors to wake its choir.`,
  };
}

function reportObjective(world: WorldView, spatialWorld: WorldView, player: PlayerState) {
  const report = player.report;
  if (!report) return undefined;
  const source = world.settlements.find((settlement) => settlement.id === report.sourceSettlementId);
  const target = world.settlements.find((settlement) => settlement.id === report.targetSettlementId);
  const sourceTile = source ? world.terrain.tiles[source.tileIndex] : undefined;
  const targetTile = target ? world.terrain.tiles[target.tileIndex] : undefined;
  if (!source || !target || !sourceTile || !targetTile) return undefined;
  const delta = compatibilityTileDelta(spatialWorld, player, targetTile.x, targetTile.y);
  const remaining = delta ? Math.hypot(delta.dx, delta.dy) : null;
  const direction = delta ? compassDirection(delta.dx, delta.dy) : "";
  const total = Math.max(1, Math.hypot(targetTile.x - sourceTile.x, targetTile.y - sourceTile.y));
  const age = world.completedTick - report.observedTick;
  return {
    id: `report-${source.id}-${target.id}`,
    eyebrow: `Deliver report to ${target.name}`,
    title: `DELIVER VERIFIED ${titleCase(report.resource)} COUNT → ${target.name}`,
    description: `${source.name} recorded ${report.reportedQuantity} ${titleCase(report.resource)}. The document uses one pack slot, is ${age} in-world minutes old, and is delivered at ${target.name}'s harbor with E.`,
    progress: remaining === null ? 0 : Math.max(0, Math.min(1, 1 - remaining / total)),
    progressLabel: remaining === null
      ? `Route position unavailable · ${age}m old`
      : `${remaining.toFixed(1)} tiles remaining · ${age}m old${direction ? ` · bearing ${direction}` : ""}`,
    why: `PICKUP: ${source.name} ✓  ·  DELIVERY: ${target.name}. Arrival replaces guesswork with a named, time-stamped source.`,
  };
}

function journeyProgress(
  contract: ContractState,
  world: WorldView,
  spatialWorld: WorldView,
  player: PlayerState,
): { progress: number; remaining: number | null; direction: string } {
  const origin = world.settlements.find((settlement) => settlement.id === contract.originSettlementId);
  const destination = world.settlements.find((settlement) => settlement.id === contract.destinationSettlementId);
  const originTile = origin ? world.terrain.tiles[origin.tileIndex] : undefined;
  const destinationTile = destination ? world.terrain.tiles[destination.tileIndex] : undefined;
  if (!originTile || !destinationTile) return { progress: 0, remaining: null, direction: "" };
  const delta = compatibilityTileDelta(spatialWorld, player, destinationTile.x, destinationTile.y);
  if (!delta) return { progress: 0, remaining: null, direction: "" };
  const remaining = Math.hypot(delta.dx, delta.dy);
  const total = Math.max(1, Math.hypot(destinationTile.x - originTile.x, destinationTile.y - originTile.y));
  return {
    progress: Math.max(0, Math.min(1, 1 - remaining / total)),
    remaining,
    direction: compassDirection(delta.dx, delta.dy),
  };
}

/** Persistent global delta from the floating player frame to region 0,0. */
function compatibilityTileDelta(
  spatialWorld: WorldView,
  player: PlayerState,
  targetLocalX: number,
  targetLocalY: number,
): { readonly dx: number; readonly dy: number } | null {
  if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) return null;
  const playerTileX = Math.floor(player.x / TILE_UNITS);
  const playerTileY = Math.floor(player.y / TILE_UNITS);
  if (
    !Number.isSafeInteger(playerTileX)
    || !Number.isSafeInteger(playerTileY)
    || playerTileX < 0
    || playerTileX >= spatialWorld.terrain.width
    || playerTileY < 0
    || playerTileY >= spatialWorld.terrain.height
  ) return null;
  const viewTileIndex = playerTileY * spatialWorld.terrain.width + playerTileX;
  const address = regionalAddressAt(spatialWorld, viewTileIndex);
  if (!address) return null;
  const globalTile = regionLocalToGlobalTile(
    address.region,
    address.localX,
    address.localY,
  );
  const offsetX = player.x / TILE_UNITS - playerTileX;
  const offsetY = player.y / TILE_UNITS - playerTileY;
  return {
    dx: targetLocalX + 0.5 - (globalTile.x + offsetX),
    dy: targetLocalY + 0.5 - (globalTile.y + offsetY),
  };
}

function projectSettlement(
  settlement: WorldView["settlements"][number],
  world: WorldView,
  playerSettlementId: number | null,
  player: PlayerState,
): SettlementInspectorUIView {
  const verifiedLocally = playerSettlementId === settlement.id || (player.discovered[settlement.tileIndex] ?? 0) > 0;
  const allResidents = world.residents.filter((resident) => resident.homeSettlementId === settlement.id);
  const knownRequesterIds = new Set(
    world.contracts
      .filter((contract) => contract.destinationSettlementId === settlement.id)
      .map((contract) => contract.requesterResidentId),
  );
  const residents = verifiedLocally
    ? allResidents
    : allResidents.filter((resident) => knownRequesterIds.has(resident.id));
  const connectionTrust = canonicalReportTrust(settlement);
  return {
    id: String(settlement.id),
    name: settlement.name,
    subtitle: `${titleCase(settlement.specialization)} settlement`,
    status: verifiedLocally
      ? settlement.stress > 720_000 ? "strained" : settlement.stress > 480_000 ? "watchful" : "steady"
      : "watchful",
    statusLabel: verifiedLocally
      ? settlement.stress > 720_000 ? "Strained" : settlement.stress > 480_000 ? "Watching the stores" : "Steady"
      : "Unverified report",
    population: residents.length,
    lastVerified: !verifiedLocally
      ? "Unverified — visit or carry a signed report"
      : settlement.knowledge.length
      ? `${Math.floor(average(settlement.knowledge.map((record) => record.ageTicks)) / 60)} hours ago`
      : "Verified locally",
    summary: verifiedLocally
      ? `${settlement.name} specializes in ${titleCase(settlement.specialization)} and is ${Math.round(settlement.project.progress / Math.max(1, settlement.project.target) * 100)}% through its ${titleCase(settlement.project.kind)} project. ${projectFieldGift(settlement.project.kind, settlement.project.status)}`
      : `${settlement.name} is known for ${titleCase(settlement.specialization)}, but its stores and civic work are still based on sourced reports rather than direct observation.`,
    metrics: [
      {
        label: "Pressure",
        value: verifiedLocally ? settlement.stress / FIXED_POINT : 0,
        valueLabel: verifiedLocally ? `${Math.round((settlement.stress / FIXED_POINT) * 100)}%` : "Unknown",
        tone: settlement.stress > 700_000 ? "danger" : settlement.stress > 480_000 ? "warning" : "good",
      },
      {
        label: "Project",
        value: verifiedLocally ? settlement.project.progress / Math.max(1, settlement.project.target) : 0,
        valueLabel: verifiedLocally ? titleCase(settlement.project.kind) : "Unverified",
        tone: "neutral",
      },
    ],
    stocks: Object.entries(settlement.inventory).map(([resource, amount]) => ({
      id: resource,
      label: titleCase(resource),
      amountLabel: verifiedLocally ? String(amount) : "Unverified",
      trend: verifiedLocally && amount < 20 ? ("falling" as const) : verifiedLocally && amount > 80 ? ("rising" as const) : ("steady" as const),
      critical: verifiedLocally && amount < 12,
    })),
    residents: residents.slice(0, 8).map((resident) => ({
      id: String(resident.id),
      name: resident.name,
      role: titleCase(resident.role),
      state: titleCase(resident.intention),
    })),
    connections: connectionTrust.map((trust) => {
      const route = world.routes.find(
        (candidate) =>
          (candidate.fromSettlementId === settlement.id && candidate.toSettlementId === trust.settlementId)
          || (candidate.toSettlementId === settlement.id && candidate.fromSettlementId === trust.settlementId),
      );
      const establishedConnections = world.routes.filter(
        (candidate) =>
          (candidate.fromSettlementId === settlement.id || candidate.toSettlementId === settlement.id)
          && candidate.traceStrength >= STRAND_AUTOMATION_THRESHOLD,
      ).length;
      const isHere = playerSettlementId === settlement.id;
      const partsAvailable = settlement.inventory.parts > 0;
      const reportPackFull = cargoWeightMilli(player) + PACK_LOAD_MILLI_PER_UNIT
        > player.cargoCapacity * PACK_LOAD_MILLI_PER_UNIT;
      const automated = (route?.traceStrength ?? 0) >= STRAND_AUTOMATION_THRESHOLD;
      const surveyed = route !== undefined && player.surveyedRouteIds.includes(route.id);
      const choirMember = route !== undefined && world.choirs.some((choir) => choir.routeIds.includes(route.id));
      const weaveProgress = Math.min(100, Math.round(((route?.traceStrength ?? 0) / STRAND_AUTOMATION_THRESHOLD) * 100));
      const recipientName = settlementName(world, trust.settlementId);
      const subjectName = `${settlement.name}'s current ${titleCase(settlement.specialization)} count`;
      const subjectDestination = `${subjectName} → ${recipientName}`;
      const carriedSubject = player.report === null
        ? null
        : `${settlementName(world, player.report.sourceSettlementId)}'s ${titleCase(player.report.resource)} count for ${settlementName(world, player.report.targetSettlementId)}`;
      return {
        id: String(trust.settlementId),
        ...(route ? { routeId: String(route.id) } : {}),
        settlementId: String(settlement.id),
        settlementName: recipientName,
        conditionLabel: `${choirMember ? "Choir loop · " : surveyed ? "Surveyed · " : "Unsurveyed · "}${automated
          ? "self-carrying strand"
          : `faint trace · ${weaveProgress}% woven`}`,
        reliability: ((route?.reliability ?? trust.value) + (route?.condition ?? trust.value)) / (2 * FIXED_POINT),
        redundant: automated && establishedConnections > 1,
        surveyed,
        choirMember,
        ...(route
          ? {
              actionLabel: !surveyed
                ? "Survey this route first"
                : automated
                  ? "Spend 1 part to repair route"
                  : "Spend 1 part to strengthen route",
              actionHint: !surveyed
                ? `Travel from ${settlement.name} to ${recipientName} along this corridor first. Surveying proves which physical path the work will improve.`
                : automated
                  ? `Uses 1 part from ${settlement.name}'s shared stores. Permanently improves this self-carrying route's strength and weather condition.`
                  : `Uses 1 part from ${settlement.name}'s shared stores. Permanently raises strand strength and condition; at 100% woven, resident porters can carry promises here automatically.`,
              actionDisabled: !isHere || !partsAvailable || !surveyed,
              reportActionLabel: player.report !== null
                ? `Case occupied · ${subjectDestination}`
                : !isHere
                  ? `At ${settlement.name}: sign ${subjectDestination}`
                  : reportPackFull
                    ? `Need 1 document slot · ${subjectDestination}`
                    : `Sign ${subjectDestination}`,
              reportActionHint: player.report !== null
                ? `Your document case already holds ${carriedSubject}. Deliver it before signing ${subjectDestination}.`
                : !isHere
                  ? `Subject: ${subjectName}. Recipient: ${recipientName}. Travel onto ${settlement.name}'s harbor mark first; remote inspection cannot create one.`
                  : reportPackFull
                    ? `Subject: ${subjectName}. Recipient: ${recipientName}. Free 1 load slot before signing; the report moves no cargo or supplies, but its document case must be carried physically.`
                    : `Subject: ${subjectName}. Recipient: ${recipientName}. This uses 1 document slot and moves no cargo or supplies; carry the signed fact there, arrive and press E / Enter or Deliver report.`,
              reportActionDisabled: !isHere || player.report !== null || reportPackFull,
            }
          : {}),
      };
    }),
  };
}

/** Stable identity for one authoritative signed-report job. */
export function signedReportJobId(
  sourceSettlementId: number,
  subjectSettlementId: number,
  recipientSettlementId: number,
): string {
  return `signed-report:${sourceSettlementId}:subject:${subjectSettlementId}:recipient:${recipientSettlementId}`;
}

/**
 * A signed stock count is currently witnessed by and about the selected
 * source settlement. Canonicalizing by the full source/subject/recipient
 * identity prevents duplicate trust input or input reordering from minting
 * duplicate-looking actions. The strongest duplicate trust value is selected
 * deterministically without mutating the simulation view.
 */
function canonicalReportTrust(
  settlement: WorldView["settlements"][number],
): readonly WorldView["settlements"][number]["trust"][number][] {
  const byJobId = new Map<
    string,
    WorldView["settlements"][number]["trust"][number]
  >();
  for (const trust of settlement.trust) {
    const jobId = signedReportJobId(
      settlement.id,
      settlement.id,
      trust.settlementId,
    );
    const prior = byJobId.get(jobId);
    if (!prior || trust.value > prior.value) {
      byJobId.set(jobId, { ...trust });
    }
  }
  return [...byJobId.values()].sort((left, right) =>
    left.settlementId - right.settlementId
  );
}

function projectFieldGift(
  kind: WorldView["settlements"][number]["project"]["kind"],
  status: WorldView["settlements"][number]["project"]["status"],
): string {
  const prefix = status === "complete" ? "Visit to collect its field benefit:" : "When complete, a visit can entrust you with";
  switch (kind) {
    case "crossing": return `${prefix} Marsh stilts for mudflats and reed marsh.`;
    case "ferry": return `${prefix} a Tide sail for faster, less tiring deep water.`;
    case "beacon": return `${prefix} a Storm kite for wind stability and shorter sweeps.`;
    case "clinic": return "Completed clinics can rescue an exhausted courier through an established strand, including before a water sweep begins.";
    case "cache": return "Completed caches improve rest, stability, and perishable shelter at this harbor.";
  }
}

function projectChronicle(event: SimEvent, world: WorldView): ChronicleEntryUIView {
  return {
    id: String(event.sequence),
    timeLabel: `D${Math.floor(event.tick / 1_440) + 1} ${String(Math.floor(event.tick % 1_440 / 60)).padStart(2, "0")}:${String(event.tick % 60).padStart(2, "0")}`,
    title: eventTitle(event.type),
    detail: eventDetail(event, world),
    kind: event.type.includes("weather")
      ? "weather"
      : event.type.includes("route")
        ? "route"
        : event.type.includes("contract") || event.type.includes("project")
          ? "material"
          : event.type.includes("knowledge")
            ? "social"
            : "memory",
    new: world.completedTick - event.tick < 90,
  };
}

function eventTitle(type: SimEvent["type"]): string {
  switch (type) {
    case "world-created": return "The estuary gathers";
    case "contract-offered": return "A useful promise";
    case "contract-accepted": return "Promise accepted";
    case "contract-picked-up": return "Cargo entrusted";
    case "contract-departed": return "A porter departs";
    case "contract-fulfilled": return "Promise kept";
    case "contract-expired": return "Need renegotiated";
    case "contract-cancelled": return "Promise released";
    case "route-reinforced": return "Strand tended";
    case "tide-choir-awakened": return "A Tide Choir wakes";
    case "project-completed": return "Civic work complete";
    case "weather-changed": return "The weather turns";
    case "knowledge-shared": return "Knowledge carried";
    case "command-rejected": return "The world answered clearly";
  }
}

function eventDetail(event: SimEvent, world: WorldView): string {
  const numberData = (key: string): number | undefined => {
    const value = event.data[key];
    return typeof value === "number" ? value : undefined;
  };
  const settlement = (key: string): string => {
    const id = numberData(key);
    return id === undefined ? "a harbor" : settlementName(world, id);
  };
  const contract = event.subjectId === null
    ? undefined
    : world.contracts.find((candidate) => candidate.id === event.subjectId);
  switch (event.type) {
    case "world-created":
      return `${numberData("settlements") ?? world.settlements.length} communities and ${numberData("residents") ?? world.residents.length} named lives begin in one possible arrangement.`;
    case "contract-offered":
      return `${settlement("destinationSettlementId")} needs ${titleCase(String(event.data.resource ?? "supplies"))}; ${settlement("originSettlementId")} can genuinely spare some.`;
    case "contract-accepted":
      return `${event.data.carrier === "player" ? "You" : "A local porter"} agreed to connect ${settlement("originSettlementId")} with ${settlement("destinationSettlementId")}.`;
    case "contract-picked-up":
      return `${numberData("quantity") ?? contract?.quantity ?? 0} ${titleCase(String(event.data.resource ?? contract?.resource ?? "supplies"))} left ${settlement("originSettlementId")} in trusted hands.`;
    case "contract-departed": {
      const residentId = numberData("residentId");
      const porter = world.residents.find((resident) => resident.id === residentId)?.name ?? "A local porter";
      const routeHops = numberData("routeHops") ?? contract?.porterRouteIds.length ?? 1;
      const origin = contract ? settlementName(world, contract.originSettlementId) : "the origin harbor";
      const destination = contract ? settlementName(world, contract.destinationSettlementId) : "the receiving harbor";
      return routeHops > 1
        ? `${porter} set out from ${origin} to ${destination} across a ${routeHops}-strand relay. The network found a connected path where no single strand had to do everything.`
        : `${porter} set out from ${origin} to ${destination} along one self-carrying strand.`;
    }
    case "contract-fulfilled": {
      const beneficiaryId = numberData("beneficiaryResidentId");
      const beneficiary = world.residents.find((resident) => resident.id === beneficiaryId)?.name ?? "People there";
      const destination = settlement("destinationSettlementId");
      const contribution = numberData("projectContribution") ?? 0;
      const grade = titleCase(String(event.data.grade ?? contract?.deliveryGrade ?? "arrived"));
      const routeHops = numberData("routeHops") ?? 1;
      const strandResult = routeHops > 1 ? `all ${routeHops} traveled strands strengthened` : "the traveled strand strengthened";
      return `${beneficiary} received ${numberData("quantity") ?? contract?.quantity ?? 0} ${titleCase(String(event.data.resource ?? contract?.resource ?? "supplies"))} at ${destination}. ${grade} arrival; trust and ${strandResult}${contribution > 0 ? `, with ${contribution} added to the civic project` : ""}.`;
    }
    case "contract-expired":
      return "The need changed before anyone committed. No one was punished; future stores will produce a new promise.";
    case "contract-cancelled":
      return "The cargo stayed accountable and the harbor opened space for a better promise.";
    case "route-reinforced": {
      const traceStrength = numberData("traceStrength") ?? 0;
      const strandResult = traceStrength >= STRAND_AUTOMATION_THRESHOLD
        ? "The strand is self-carrying now, so autonomous porters can inherit it when a promise needs this corridor."
        : `The faint trace is ${Math.round((traceStrength / STRAND_AUTOMATION_THRESHOLD) * 100)}% woven toward self-carrying capacity.`;
      return `${settlement("settlementId")} invested ${numberData("parts") ?? 0} part in a shared route. ${strandResult}`;
    }
    case "tide-choir-awakened": {
      const routeCount = numberData("routeCount") ?? 0;
      const settlementIds = String(event.data.settlementIds ?? "")
        .split(",")
        .map(Number)
        .filter(Number.isInteger);
      const harbors = settlementIds.map((id) => settlementName(world, id));
      const phrase = harbors.length > 0 ? harbors.join(" → ") : "a surveyed harbor loop";
      return `${phrase} closed into a Tide Choir. ${routeCount || "Its"} shared ${routeCount === 1 ? "route was" : "routes were"} strengthened as one remembered circuit.`;
    }
    case "project-completed":
      return `${settlement("settlementId")} completed its ${titleCase(String(event.data.kind ?? "civic"))}: ${String(event.data.effect ?? "the recorded civic work is ready to support future journeys")}.`;
    case "weather-changed":
      return `${titleCase(String(event.data.kind ?? "weather"))} reaches the estuary. Promise cards now price this live front into their route risk.`;
    case "knowledge-shared": {
      const fromId = numberData("fromSettlementId");
      const subjectId = numberData("subjectSettlementId");
      const from = settlement("fromSettlementId");
      const to = settlement("toSettlementId");
      const subject = settlement("subjectSettlementId");
      const resource = titleCase(String(event.data.resource ?? "supplies"));
      const age = numberData("ageTicks") ?? 0;
      return fromId === subjectId
        ? `${from} sent its sourced ${resource} count to ${to}. The report arrived ${age}m old with its origin still attached.`
        : `${from} relayed ${subject}'s sourced ${resource} count to ${to}. Another hop kept the original subject attached instead of turning the fact into an anonymous rumor.`;
    }
    case "command-rejected":
      return `Nothing was silently lost: ${String(event.data.reason ?? "that action no longer fit the world state")}.`;
  }
}

function quietHourChanges(session: GameSessionState, world: WorldView): string[] {
  const changes = session.sessionChanges.slice(-4);
  const delta = sessionOutcomeDelta(session, world);
  if (!delta) return changes;

  if (delta.autonomousDeliveries > 0) {
    changes.push(
      `${delta.autonomousDeliveries} ${delta.autonomousDeliveries === 1 ? "promise arrived" : "promises arrived"} through autonomous strands without you carrying the cargo.`,
    );
  }

  if (delta.awakenedChoirs > 0) {
    changes.push(
      `${delta.awakenedChoirs} new ${delta.awakenedChoirs === 1 ? "Tide Choir was" : "Tide Choirs were"} awakened by closing a surveyed harbor loop.`,
    );
  }

  const resiliencePoints = Math.round(delta.resilience * 100);
  const networkParts: string[] = [];
  if (delta.activeRoutes !== 0) {
    networkParts.push(
      `${Math.abs(delta.activeRoutes)} ${Math.abs(delta.activeRoutes) === 1 ? "self-carrying strand" : "self-carrying strands"} ${delta.activeRoutes > 0 ? "gained" : "lost"}`,
    );
  }
  if (resiliencePoints !== 0) {
    networkParts.push(`regional resilience ${resiliencePoints > 0 ? "rose" : "fell"} ${Math.abs(resiliencePoints)} point${Math.abs(resiliencePoints) === 1 ? "" : "s"}`);
  }
  if (networkParts.length > 0) changes.push(`Network outcome: ${networkParts.join("; ")}.`);

  const stressPoints = Math.round((delta.averageStress / FIXED_POINT) * 100);
  const trustPoints = Math.round((delta.averageTrust / FIXED_POINT) * 100);
  const communityParts: string[] = [];
  if (stressPoints !== 0) {
    communityParts.push(`average harbor pressure ${stressPoints < 0 ? "eased" : "rose"} ${Math.abs(stressPoints)} point${Math.abs(stressPoints) === 1 ? "" : "s"}`);
  }
  if (trustPoints !== 0) {
    communityParts.push(`inter-harbor trust ${trustPoints > 0 ? "rose" : "fell"} ${Math.abs(trustPoints)} point${Math.abs(trustPoints) === 1 ? "" : "s"}`);
  }
  if (communityParts.length > 0) changes.push(`Community outcome: ${communityParts.join("; ")}.`);

  if (delta.projectProgress !== 0) {
    changes.push(
      `Civic projects ${delta.projectProgress > 0 ? "advanced" : "receded"} by ${Math.abs(delta.projectProgress)} material ${Math.abs(delta.projectProgress) === 1 ? "step" : "steps"}.`,
    );
  }
  return changes;
}

function quietSummary(session: GameSessionState): string {
  if (session.campaignCelebrated) {
    return "You completed a resilient regional weave: care can route around broken corridors without depending on your constant presence. Endless tending remains optional.";
  }
  if (session.sessionChoirsAwakened > 0) {
    return `You taught ${session.sessionChoirsAwakened} harbor ${session.sessionChoirsAwakened === 1 ? "loop" : "loops"} to sing as shared infrastructure. The estuary is safely paused.`;
  }
  if (session.sessionDeliveries > 0) {
    return `You kept ${session.sessionDeliveries} ${session.sessionDeliveries === 1 ? "promise" : "promises"}. The estuary is safely paused exactly where you left it.`;
  }
  if (session.sessionReportsDelivered > 0) {
    return `You carried ${session.sessionReportsDelivered} sourced ${session.sessionReportsDelivered === 1 ? "fact" : "facts"} where ${session.sessionReportsDelivered === 1 ? "it" : "they"} could change real planning. The estuary is safely paused.`;
  }
  if (session.sessionDistanceUnits > 0) {
    return "You learned the land and left a trace. Knowledge is progress here; nothing will decay while you are away.";
  }
  return "You checked on the estuary. It will wait without penalty until you want another journey.";
}

function perpetualWorldObjective(session: GameSessionState, world: WorldView) {
  if (session.campaignCelebrated || world.network.resolved) {
    return {
      id: "campaign-resilient-weave",
      eyebrow: "The resilient weave",
      title: "Care can route around the break",
      description: `${world.network.activeRouteCount} self-carrying strands form ${world.network.cycleRank} independent loops; only ${world.network.bridgeCount} fragile bridges remain. The campaign resolution is complete and the estuary stays open.`,
      progress: 1,
      progressLabel: "Regional autonomy achieved",
      why: "The goal was not infinite growth; it was a network able to help without constant player intervention.",
      completed: true,
    };
  }
  const regionalStatus = `${world.network.activeRouteCount} strands · ${world.network.cycleRank}/2 loops · ${Math.round(world.network.resilience * 100)}% resilience`;
  return {
    id: "perpetual-estuary",
    eyebrow: "Perpetual estuary",
    title: "Choose the next useful thread",
    description: "There is no session timer or quota. Chart land, carry promises, share reports, tend routes, or take Quiet Hour whenever you choose; the estuary waits.",
    progress: world.network.resilience,
    progressLabel: regionalStatus,
    why: "The world continues through consequences and relationships, not a countdown or compulsory checklist.",
  };
}

function moodFor(contract: ContractState, world: WorldView): ContractMood {
  const route = world.routes.find((candidate) => candidate.id === contract.routeId);
  if (contract.resource === "medicine") return "social";
  if ((route?.reliability ?? FIXED_POINT) < 480_000) return "daring";
  if (contract.resource === "parts") return "focused";
  return "gentle";
}

function contractPriority(contract: ContractState, playerSettlementId: number | null): number {
  const local = contract.originSettlementId === playerSettlementId ? -1_000_000 : 0;
  return local + contract.dueTick;
}

function propertyForResource(resource: ContractState["resource"]): "ordinary" | "heavy" | "fragile" | "perishable" {
  if (resource === "medicine") return "fragile";
  if (resource === "food") return "perishable";
  if (resource === "parts" || resource === "freshWater") return "heavy";
  return "ordinary";
}

function contractRouteEstimate(
  contract: ContractState,
  route: WorldView["routes"][number] | undefined,
  world: WorldView,
  player: PlayerState,
  cargoProperty: NonNullable<ContractUIView["cargoProperty"]>,
): string {
  const due = formatWorldMoment(contract.dueTick);
  if (!route) return `Route estimate unavailable · due ${due}`;
  const distance = routeDistance(route, world);
  const conditionPenalty = Math.trunc((route.baseTravelTicks * (FIXED_POINT - route.condition)) / (FIXED_POINT * 2));
  const reliabilityPenalty = Math.trunc((route.baseTravelTicks * (FIXED_POINT - route.reliability)) / (FIXED_POINT * 2));
  const weatherPenalty = Math.trunc((route.baseTravelTicks * world.weather.intensity) / (FIXED_POINT * 2));
  const unitWeight = cargoProperty === "heavy" ? 2 : cargoProperty === "fragile" ? 1.25 : 1;
  const loadRatio = Math.min(1, (contract.quantity * unitWeight) / Math.max(1, player.cargoCapacity));
  const burdenMultiplier = 1 / Math.max(0.688, 1 - loadRatio / 3.2);
  const handlingMultiplier = cargoProperty === "fragile" ? 1.12 : 1;
  const estimate = Math.ceil(
    (route.baseTravelTicks + conditionPenalty + reliabilityPenalty + weatherPenalty)
      * burdenMultiplier
      * handlingMultiplier,
  );
  return `${distance.toFixed(1)} tiles · Loom ETA ≈ ${formatMinutes(estimate)} · due ${due}`;
}

function contractForecast(
  route: WorldView["routes"][number] | undefined,
  world: WorldView,
  player: PlayerState,
): string {
  const tide = tideWindowForecast(route, world, player);
  if (!route) return `${tide} · Risk: ${weatherRisk(world)}; route record unavailable.`;
  const weavePercent = Math.min(100, Math.round((route.traceStrength / STRAND_AUTOMATION_THRESHOLD) * 100));
  const strand = route.traceStrength >= STRAND_AUTOMATION_THRESHOLD
    ? "self-carrying strand"
    : `faint strand ${weavePercent}% woven; this direct strand still needs a player`;
  const record = (route.condition + route.reliability) / 2 >= 760_000
    ? "sound route record"
    : (route.condition + route.reliability) / 2 >= 560_000
      ? "mixed route record"
      : "weathered route record";
  return `${tide} · Risk: ${weatherRisk(world)}; ${strand}; ${record}.`;
}

function tideWindowForecast(
  route: WorldView["routes"][number] | undefined,
  world: WorldView,
  player: PlayerState,
): string {
  const phase = tidePhaseName(world.tide.phase);
  const transition = nextTidePhase(world.tide.phase);
  const direction = world.tide.direction > 0 ? "rising" : "falling";
  const timing = `Tide: ${phase}, ${direction}; ${transition.phase} in ${formatMinutes(transition.minutes)}`;
  if (!route) return timing;

  const chartedTiles = route.path
    .filter((tileIndex) => (player.discovered[tileIndex] ?? 0) > 0)
    .map((tileIndex) => world.terrain.tiles[tileIndex])
    .filter((tile): tile is NonNullable<typeof tile> => tile !== undefined);
  const unchartedCount = Math.max(0, route.path.length - chartedTiles.length);
  const groundedChannels = chartedTiles.filter(
    (tile) => tile.terrain === "deep-water" && tile.waterDepth < 240_000,
  ).length;
  const openChannels = chartedTiles.filter(
    (tile) => tile.terrain === "deep-water" && tile.waterDepth >= 240_000,
  ).length;
  const mudflats = chartedTiles.filter((tile) => tile.terrain === "tidal-flat").length;
  const knownHazards: string[] = [];
  if (groundedChannels > 0) {
    knownHazards.push(`${groundedChannels} charted channel ${groundedChannels === 1 ? "mark needs" : "marks need"} deeper water`);
  }
  if (openChannels > 0) {
    knownHazards.push(`${openChannels} charted channel ${openChannels === 1 ? "mark is" : "marks are"} afloat now`);
  }
  if (mudflats > 0) {
    knownHazards.push(`${mudflats} charted mudflat ${mudflats === 1 ? "mark" : "marks"}`);
  }
  if (unchartedCount > 0) {
    knownHazards.push("uncharted ground remains uncertain");
  } else if (knownHazards.length === 0) {
    knownHazards.push("the fully charted route has no water switch");
  }
  return `${timing}. ${knownHazards.join("; ")}`;
}

function nextTidePhase(phase: number): { phase: "low" | "flood" | "high" | "ebb"; minutes: number } {
  const normalized = ((phase % 720) + 720) % 720;
  if (normalized < 90) return { phase: "flood", minutes: 90 - normalized };
  if (normalized < 270) return { phase: "high", minutes: 270 - normalized };
  if (normalized < 450) return { phase: "ebb", minutes: 450 - normalized };
  if (normalized < 630) return { phase: "low", minutes: 630 - normalized };
  return { phase: "flood", minutes: 810 - normalized };
}

function weatherRisk(world: WorldView): string {
  if (world.weather.kind === "clear") return "clear front";
  const strength = world.weather.intensity < 300_000
    ? "light"
    : world.weather.intensity < 620_000
      ? "steady"
      : "severe";
  return `${strength} ${renderWeather(world.weather.kind)}`;
}

function cargoMasteryHint(property: NonNullable<ContractUIView["cargoProperty"]>): string {
  switch (property) {
    case "heavy":
      return "Mastery: heavy cargo uses 2× capacity; a steady line and early rests protect stamina and condition.";
    case "fragile":
      return "Mastery: brace through turns and rough ground; fragile cargo starts taking shock below 48% stability.";
    case "perishable":
      return "Mastery: keep the line direct and use completed caches; freshness declines gently while away from one.";
    case "ordinary":
      return "Mastery: rest before stability reaches its final 9%; weathering lowers the grade, but never erases the promise.";
    case "confidential":
      return "Mastery: signed reports use one capacity and keep their source even across several relay hops.";
  }
}

function routeDistance(route: WorldView["routes"][number], world: WorldView): number {
  let distance = 0;
  for (let index = 1; index < route.path.length; index += 1) {
    const previous = world.terrain.tiles[route.path[index - 1] ?? -1];
    const tile = world.terrain.tiles[route.path[index] ?? -1];
    if (!previous || !tile) continue;
    distance += Math.hypot(tile.x - previous.x, tile.y - previous.y);
  }
  return distance;
}

function formatWorldMoment(tick: number): string {
  const minute = ((tick % 1_440) + 1_440) % 1_440;
  const day = Math.floor(tick / 1_440) + 1;
  return `D${day} ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function formatMinutes(minutes: number): string {
  const rounded = Math.max(1, Math.ceil(minutes));
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function renderWeather(kind: WorldView["weather"]["kind"]): "clear" | "mist" | "rain" | "squall" {
  return kind === "storm" ? "squall" : kind;
}

function tidePhaseName(phase: number): "low" | "flood" | "high" | "ebb" {
  const normalized = ((phase % 720) + 720) % 720;
  if (normalized < 90 || normalized >= 630) return "low";
  if (normalized < 270) return "flood";
  if (normalized < 450) return "high";
  return "ebb";
}

function tidePhaseProgress(phase: number): number {
  const normalized = ((phase % 720) + 720) % 720;
  if (normalized < 90) return (normalized + 90) / 180;
  if (normalized < 270) return (normalized - 90) / 180;
  if (normalized < 450) return (normalized - 270) / 180;
  if (normalized < 630) return (normalized - 450) / 180;
  return (normalized - 630) / 180;
}

function settlementName(world: WorldView, settlementId: number): string {
  return world.settlements.find((settlement) => settlement.id === settlementId)?.name ?? `Settlement ${settlementId}`;
}

function compassDirection(dx: number, dy: number): string {
  if (Math.hypot(dx, dy) < 0.75) return "";
  const horizontal = dx > 0.5 ? "east" : dx < -0.5 ? "west" : "";
  const vertical = dy > 0.5 ? "south" : dy < -0.5 ? "north" : "";
  return horizontal && vertical ? `${vertical}-${horizontal}` : horizontal || vertical;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m played`;
  if (minutes > 0) return `${minutes}m ${seconds}s played`;
  return `${seconds}s played`;
}

function average(values: readonly number[]): number {
  return values.length ? Math.floor(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function discoveredTileCount(player: PlayerState): number {
  return player.discovered.reduce((count, value) => count + (value > 0 ? 1 : 0), 0);
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
