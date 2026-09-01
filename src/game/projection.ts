import type {
  TerrainClimateView,
  TideHarpView,
  TideweftView,
  TerrainKind as RenderTerrainKind,
  TidePhase,
  WeatherKind as RenderWeatherKind,
} from "../render/types";
import { projectLooseCargoWorld } from "../render/looseCargoPresentation";
import {
  applyWeatherToBiomeClimate,
  classifyBiome,
  deriveBaselineBiomeClimate,
  deriveMagicalWaterInfluence,
  seedFromText,
  type BiomeClimate,
  type BiomeId,
} from "../sim/public";
import {
  FIELD_RESOURCE_LIVING_RESERVE_UNITS,
  canonicalizeFieldResourceState,
  type FieldResourceCatalog,
  type FieldResourceEcologyState,
} from "../sim/fieldResources";
import { FIXED_POINT, STRAND_AUTOMATION_THRESHOLD, type TerrainTileView, type WorldView } from "../sim/types";
import {
  TILE_UNITS,
  activeTideHarpAtPlayer,
  cargoWeight,
  wayknotEffectsAt,
  type PlayerState,
} from "./player";
import { deriveTideHarps, type TideHarp } from "./tideHarps";
import { surfaceCurrentDirection } from "./currentDirection";
import { WAYKNOT_LABELS, WAYKNOT_RADII } from "./wayknots";
import {
  projectPlayerBalance,
  projectTraversalIncident,
  type TraversalFeedbackState,
} from "./traversalFeedback";
import type { LooseCargoWorldState } from "./looseCargo";

const CHOIR_HIGHLIGHT_TICKS = 24;
const MAX_BIOME_CACHE_ENTRIES = 4;
const TERRAIN_IDENTITY_FIELDS = 6;

interface CachedBiomeTile {
  readonly id: BiomeId;
  readonly baseline: BiomeClimate;
}

interface ProjectedBiomeTile {
  readonly id: BiomeId;
  readonly climate: TerrainClimateView;
}

interface BiomeTerrainCache {
  readonly seedText: string;
  readonly seedKey: string;
  readonly width: number;
  readonly height: number;
  readonly numericIdentity: Int32Array;
  readonly terrainIdentity: Uint8Array;
  readonly tiles: readonly CachedBiomeTile[];
}

const biomeTerrainCaches: BiomeTerrainCache[] = [];
const biomeCacheByTerrainArray = new WeakMap<readonly TerrainTileView[], BiomeTerrainCache>();
const liveBiomeCache = new WeakMap<readonly CachedBiomeTile[], {
  readonly weatherKey: string;
  readonly tiles: readonly ProjectedBiomeTile[];
}>();
const terrainKindCode: Readonly<Record<TerrainTileView["terrain"], number>> = {
  "deep-water": 1,
  "tidal-flat": 2,
  marsh: 3,
  meadow: 4,
  ridge: 5,
};

export interface ProjectionOptions {
  selectedSettlementId?: number | null;
  selectedRouteId?: number | null;
  destinationSettlementId?: number | null;
  destinationKind?: "pickup" | "delivery" | "report";
  paused?: boolean;
  recentEventIds?: readonly number[];
  /** Derived, seed-stable ecology catalog. Both fields are required to reveal nodes. */
  fieldResourceCatalog?: FieldResourceCatalog;
  /** Sparse live depletion state paired with fieldResourceCatalog. */
  fieldResourceEcology?: FieldResourceEcologyState;
  /** Persistent footing incident shared by Chart and Relief presentation. */
  traversalFeedback?: TraversalFeedbackState;
  /** Validated loaded-region parcels. Production always supplies this sidecar. */
  looseCargoWorld?: LooseCargoWorldState;
}

export function projectGameView(
  world: WorldView,
  player: PlayerState,
  options: ProjectionOptions = {},
): TideweftView {
  const tileSize = 24;
  const playerX = (player.x / TILE_UNITS) * tileSize;
  const playerY = (player.y / TILE_UNITS) * tileSize;
  const looseCargo = options.looseCargoWorld
    ? projectLooseCargoWorld(options.looseCargoWorld, {
        worldOrigin: { x: 0, y: 0 },
        worldUnitsPerTile: tileSize,
        viewerOwner: { kind: "player", id: "local-porter" },
        player: {
          region: { x: 0, y: 0 },
          position: { x: playerX, y: playerY },
          recoveryReach: tileSize * 2,
        },
      })
    : [];
  const traversalIncident = projectTraversalIncident(options.traversalFeedback?.incident ?? null);
  const currentPlayerTileIndex = Math.floor(player.y / TILE_UNITS) * world.terrain.width
    + Math.floor(player.x / TILE_UNITS);
  const harpGrid = { width: world.terrain.width, height: world.terrain.height };
  const activeWayknotIds = new Set(
    wayknotEffectsAt(player, world, currentPlayerTileIndex)
      .influences
      .map((influence) => influence.id),
  );
  const derivedTideHarps = deriveTideHarps(player.wayknots, harpGrid);
  const activeTideHarpId = activeTideHarpAtPlayer(player, world, derivedTideHarps)?.id ?? null;
  const tideHarps = derivedTideHarps.map((harp) =>
    projectTideHarp(
      harp,
      world.terrain.width,
      tileSize,
      harp.id === activeTideHarpId,
    ));
  const settlementTiles = new Set(world.settlements.map((settlement) => settlement.tileIndex));
  const fieldResources = projectFieldResources(
    world,
    player,
    settlementTiles,
    options.fieldResourceCatalog,
    options.fieldResourceEcology,
    tileSize,
  );
  const biomeCache = stableBiomeTerrain(world);
  const projectedBiomes = weatherAdjustedBiomeTiles(biomeCache.tiles, world.weather);
  const traces = player.currentTrace.length > 1
    ? [
        {
          id: "current-journey",
          kind: (player.mode === "skiff" || player.mode === "wading" || player.mode === "swept" ? "wake" : "foot") as "wake" | "foot",
          points: player.currentTrace.map((index) => tilePoint(index, world.terrain.width, tileSize)),
          intensity: 0.72,
          age: 0,
        },
      ]
    : [];
  const destinationSettlement = options.destinationSettlementId === null || options.destinationSettlementId === undefined
    ? undefined
    : world.settlements.find((settlement) => settlement.id === options.destinationSettlementId);
  const newestChoir = world.choirs.reduce<(typeof world.choirs)[number] | undefined>(
    (latest, choir) => {
      if (!latest || choir.awakenedTick > latest.awakenedTick) return choir;
      if (choir.awakenedTick === latest.awakenedTick && choir.id > latest.id) return choir;
      return latest;
    },
    undefined,
  );

  const latestEvents = world.events.slice(-12).map((event) => {
    const settlementCandidates = event.type === "contract-offered"
      ? [
          event.data.originSettlementId,
          event.data.settlementId,
          event.data.destinationSettlementId,
          event.subjectId,
        ]
      : [
          event.data.destinationSettlementId,
          event.data.settlementId,
          event.data.returnSettlementId,
          event.data.originSettlementId,
          event.subjectId,
        ];
    const eventSettlementId = settlementCandidates.find((value): value is number =>
      typeof value === "number" && world.settlements.some((candidate) => candidate.id === value),
    );
    const settlement = eventSettlementId === undefined
      ? undefined
      : world.settlements.find((candidate) => candidate.id === eventSettlementId);
    const detail = typeof event.data.reason === "string" ? event.data.reason : undefined;
    return {
      id: `event-${event.sequence}`,
      kind: eventKind(event.type),
      label: event.type === "contract-offered" && settlement
        ? `Cargo pickup at ${settlement.name}`
        : eventLabel(event.type),
      progress: Math.max(0, Math.min(1, (world.completedTick - event.tick) / 180)),
      emphasis: event.type === "project-completed" || event.type === "contract-fulfilled"
        ? ("strong" as const)
        : ("normal" as const),
      ...(settlement ? { position: tilePoint(settlement.tileIndex, world.terrain.width, tileSize) } : {}),
      ...(detail ? { detail } : {}),
    };
  });

  return {
    revision: world.completedTick,
    tick: world.completedTick,
    worldName: `The ${titleCase(world.seedText)} Estuary`,
    terrain: {
      columns: world.terrain.width,
      rows: world.terrain.height,
      tileSize,
      origin: { x: 0, y: 0 },
      revision: [
        world.seedText,
        world.completedTick >> 7,
        world.weather.kind,
        world.weather.intensity,
        world.weather.windX,
        world.weather.windY,
      ].join(":"),
      tiles: world.terrain.tiles.map((tile, index) => {
        const biome = projectedBiomes[index];
        return {
          kind: renderTerrain(tile, settlementTiles.has(index)),
          ...(biome ? { biome: biome.id, climate: biome.climate } : {}),
          elevation: tile.elevation / FIXED_POINT,
          moisture: tile.moisture / FIXED_POINT,
          waterDepth: tile.waterDepth / FIXED_POINT,
          depthKnown: (player.depthSoundings[index] ?? 0) / FIXED_POINT,
          discovered: (player.discovered[index] ?? 0) / FIXED_POINT,
          trace: tile.traceStrength / FIXED_POINT,
          shelter: tile.terrain === "ridge" ? 0.25 : tile.terrain === "marsh" ? 0.5 : 0.1,
          blocked: false,
        };
      }),
    },
    tide: {
      phase: tidePhase(world.tide.phase),
      level: world.tide.level / FIXED_POINT,
      progress: tideProgress(world.tide.phase),
      surfaceCurrent: surfaceCurrentDirection(world.tide.direction, world.weather.windY),
      label: `${tidePhase(world.tide.phase)} tide`,
      nextPhaseInSeconds: Math.max(0, 180 - (world.completedTick % 180)),
    },
    weather: {
      kind: renderWeather(world.weather.kind),
      intensity: world.weather.intensity / FIXED_POINT,
      wind: {
        x: world.weather.windX / FIXED_POINT,
        y: world.weather.windY / FIXED_POINT,
      },
      visibility: 1 - (world.weather.intensity / FIXED_POINT) * 0.52,
      label: titleCase(world.weather.kind),
      forecast: `Next front in ${Math.max(0, world.weather.nextChangeTick - world.completedTick)} ticks`,
    },
    settlements: world.settlements.map((settlement) => ({
      id: String(settlement.id),
      name: settlement.name,
      position: tilePoint(settlement.tileIndex, world.terrain.width, tileSize),
      population: settlement.residentIds.length,
      status: settlement.stress > 720_000
        ? ("strained" as const)
        : settlement.stress > 480_000
          ? ("watchful" as const)
          : ("steady" as const),
      glyph: settlementGlyph(settlement.project.kind),
      connection: average(settlement.trust.map((trust) => trust.value)) / FIXED_POINT,
      stress: settlement.stress / FIXED_POINT,
      trust: average(settlement.trust.map((trust) => trust.value)) / FIXED_POINT,
      promiseCount: world.contracts.filter(
        (contract) => contract.originSettlementId === settlement.id && contract.status === "offered",
      ).length,
      lastVerified: settlement.knowledge.length
        ? `${Math.floor(average(settlement.knowledge.map((knowledge) => knowledge.ageTicks)) / 60)}h old`
        : "local",
      discovered: (player.discovered[settlement.tileIndex] ?? 0) > 0,
      selected: options.selectedSettlementId === settlement.id,
      label: settlement.project.status === "complete"
        ? `${settlement.specialization} · ${settlement.project.kind} online`
        : settlement.specialization,
    })),
    player: {
      position: { x: playerX, y: playerY },
      velocity: {
        x: (player.velocityX / TILE_UNITS) * tileSize,
        y: (player.velocityY / TILE_UNITS) * tileSize,
      },
      facing: player.facingMilliRadians / 1_000,
      stamina: player.stamina / FIXED_POINT,
      stability: player.stability / FIXED_POINT,
      scanCharge: player.scanCharge / FIXED_POINT,
      scanProgress: player.scanPulse / FIXED_POINT,
      sweptProgress: player.mode === "swept"
        ? 1 - player.sweepTicksRemaining / Math.max(1, player.sweepTotalTicks)
        : 0,
      cargoLoad: cargoWeight(player),
      cargoCapacity: player.cargoCapacity,
      cargo: [
        ...player.cargo.map((cargo) => ({
          id: `cargo-${cargo.contractId}`,
          label: titleCase(cargo.resource),
          quantity: cargo.quantity,
          property: cargo.property,
          condition: cargo.condition / FIXED_POINT,
        })),
        ...(player.report
          ? [{
              id: `report-${player.report.sourceSettlementId}-${player.report.targetSettlementId}`,
              label: `Signed ${titleCase(player.report.resource)} report`,
              quantity: 1,
              property: "confidential" as const,
              condition: Math.max(
                0,
                player.report.confidence - Math.max(0, world.completedTick - player.report.observedTick) * 450,
              ) / FIXED_POINT,
            }]
          : []),
      ],
      pace: player.pace,
      mode: player.mode,
      active: !options.paused,
      ...(options.traversalFeedback
        ? {
            balanceState: projectPlayerBalance(options.traversalFeedback, {
              swept: player.mode === "swept",
              stability: player.stability,
              stabilityTrend: player.stabilityTrend,
            }),
            ...(traversalIncident
              ? { incident: traversalIncident }
              : {}),
          }
        : {}),
      ...(destinationSettlement
        ? {
            destination: tilePoint(destinationSettlement.tileIndex, world.terrain.width, tileSize),
            destinationLabel: destinationMarkerLabel(options.destinationKind, destinationSettlement.name),
          }
        : {}),
    },
    wayknots: player.wayknots.wayknots.flatMap((wayknot) => {
      if (wayknot.tileIndex === null) return [];
      return [{
        id: String(wayknot.id),
        kind: wayknot.kind,
        label: `${WAYKNOT_LABELS[wayknot.kind]} #${wayknot.id}`,
        position: tilePoint(wayknot.tileIndex, world.terrain.width, tileSize),
        // A zero-tile Reed-mat radius still covers the physical tile beneath
        // it. Half a tile keeps the drawn footprint truthful while the larger
        // Manhattan fields remain readable as soft world-space rings.
        influenceRadius: (WAYKNOT_RADII[wayknot.kind] + 0.5) * tileSize,
        active: activeWayknotIds.has(wayknot.id),
      }];
    }),
    tideHarps,
    fieldResources,
    looseCargo,
    routes: world.routes
      .filter((route) => {
        if (options.selectedRouteId === route.id) return true;
        const from = world.settlements.find((settlement) => settlement.id === route.fromSettlementId);
        const to = world.settlements.find((settlement) => settlement.id === route.toSettlementId);
        return Boolean(
          from
          && to
          && (player.discovered[from.tileIndex] ?? 0) > 0
          && (player.discovered[to.tileIndex] ?? 0) > 0,
        );
      })
      .map((route) => ({
      id: String(route.id),
      kind: route.traceStrength >= STRAND_AUTOMATION_THRESHOLD ? ("strand" as const) : ("footpath" as const),
      points: route.path.map((index) => tilePoint(index, world.terrain.width, tileSize)),
      strength: route.traceStrength / FIXED_POINT,
      condition: route.condition / FIXED_POINT,
      reliability: route.reliability / FIXED_POINT,
      traffic: Math.min(1, route.traffic / 20),
      selected: options.selectedRouteId === route.id,
      })),
    choirs: world.choirs.map((choir) => {
      const age = Math.max(0, world.completedTick - choir.awakenedTick);
      const harborNames = choir.settlementIds.flatMap((settlementId) => {
        const settlement = world.settlements.find((candidate) => candidate.id === settlementId);
        return settlement ? [settlement.name] : [];
      });
      return {
        id: String(choir.id),
        routePaths: choir.routeIds.flatMap((routeId) => {
          const route = world.routes.find((candidate) => candidate.id === routeId);
          return route
            ? [route.path.map((index) => tilePoint(index, world.terrain.width, tileSize))]
            : [];
        }),
        harborPoints: choir.settlementIds.flatMap((settlementId) => {
          const settlement = world.settlements.find((candidate) => candidate.id === settlementId);
          return settlement
            ? [tilePoint(settlement.tileIndex, world.terrain.width, tileSize)]
            : [];
        }),
        age,
        emphasis: newestChoir?.id === choir.id && age < CHOIR_HIGHLIGHT_TICKS
          ? ("strong" as const)
          : ("normal" as const),
        label: harborNames.length > 0
          ? `Tide Choir · ${harborNames.join(" · ")}`
          : "Tide Choir",
      };
    }),
    traces,
    porters: world.residents.flatMap((resident) => {
      const location = resident.location;
      if (location.kind !== "route") return [];
      const route = world.routes.find((candidate) => candidate.id === location.routeId);
      if (!route || route.path.length === 0) return [];
      const progress = location.progress / FIXED_POINT;
      const pathPosition = Math.min(route.path.length - 1, Math.floor(progress * route.path.length));
      const porterTileIndex = route.path[pathPosition] ?? route.path[0] ?? 0;
      if ((player.discovered[porterTileIndex] ?? 0) <= 0) return [];
      return [
        {
          id: String(resident.id),
          name: resident.name,
          position: tilePoint(porterTileIndex, world.terrain.width, tileSize),
          facing: 0,
          state: (resident.intention === "carry" ? "traveling" : "waiting") as "traveling" | "waiting",
          progress,
        },
      ];
    }),
    events: latestEvents,
    camera: {
      center: { x: playerX, y: playerY },
      zoom: 1,
      bounds: {
        minX: 0,
        minY: 0,
        maxX: world.terrain.width * tileSize,
        maxY: world.terrain.height * tileSize,
      },
      followPlayer: true,
      shake: world.weather.kind === "storm" ? world.weather.intensity / FIXED_POINT / 2 : 0,
    },
    ...(options.paused === undefined ? {} : { paused: options.paused }),
  };
}

function projectFieldResources(
  world: WorldView,
  player: PlayerState,
  settlementTiles: ReadonlySet<number>,
  catalog: FieldResourceCatalog | undefined,
  ecology: FieldResourceEcologyState | undefined,
  tileSize: number,
): TideweftView["fieldResources"] {
  if (
    !catalog
    || !ecology
    || catalog.width !== world.terrain.width
    || catalog.height !== world.terrain.height
  ) return [];

  const canonical = canonicalizeFieldResourceState(catalog, ecology);
  const missingByNodeId = new Map(
    canonical.depletion.map((entry) => [entry.nodeId, entry.missingUnits] as const),
  );
  const seenTiles = new Set<number>();
  const visible: Array<TideweftView["fieldResources"][number] & { tileIndex: number }> = [];

  for (const node of catalog.nodes) {
    const tile = world.terrain.tiles[node.tileIndex];
    if (
      !tile
      || tile.index !== node.tileIndex
      || seenTiles.has(node.tileIndex)
      || settlementTiles.has(node.tileIndex)
      || (player.discovered[node.tileIndex] ?? 0) <= 0
      || !Number.isSafeInteger(node.capacityUnits)
      || node.capacityUnits <= FIELD_RESOURCE_LIVING_RESERVE_UNITS
    ) continue;
    seenTiles.add(node.tileIndex);

    const totalStock = node.capacityUnits - (missingByNodeId.get(node.id) ?? 0);
    const harvestableStock = totalStock - FIELD_RESOURCE_LIVING_RESERVE_UNITS;
    // The final living unit is ecology, not inventory. Keeping it out of the
    // view prevents a tappable promise that gathering is required to reject.
    if (harvestableStock <= 0) continue;

    const sounded = (player.depthSoundings[node.tileIndex] ?? 0) > 0;
    visible.push({
      id: node.id,
      material: node.material,
      label: titleCase(node.material),
      position: tilePoint(node.tileIndex, world.terrain.width, tileSize),
      knowledge: sounded ? "sounded" : "charted",
      ...(sounded ? { rarity: node.rarity, stockUnits: harvestableStock } : {}),
      tileIndex: node.tileIndex,
    });
  }

  visible.sort((left, right) => left.tileIndex - right.tileIndex
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return visible.map(({ tileIndex: _tileIndex, ...node }) => node);
}

function stableBiomeTerrain(world: WorldView): BiomeTerrainCache {
  const seed = world.rootSeed ?? seedFromText(world.seedText);
  const seedKey = seed.join(",");
  const identityCached = biomeCacheByTerrainArray.get(world.terrain.tiles);
  if (
    identityCached
    && identityCached.seedKey === seedKey
    && identityCached.width === world.terrain.width
    && identityCached.height === world.terrain.height
  ) return identityCached;

  const cachedIndex = biomeTerrainCaches.findIndex((candidate) =>
    candidate.seedText === world.seedText
      && candidate.seedKey === seedKey
      && candidate.width === world.terrain.width
      && candidate.height === world.terrain.height
      && terrainIdentityMatches(candidate, world.terrain.tiles)
  );
  if (cachedIndex >= 0) {
    const cached = biomeTerrainCaches[cachedIndex];
    if (!cached) throw new Error("Biome terrain cache index became unavailable");
    biomeTerrainCaches.splice(cachedIndex, 1);
    biomeTerrainCaches.push(cached);
    biomeCacheByTerrainArray.set(world.terrain.tiles, cached);
    return cached;
  }

  const numericIdentity = new Int32Array(world.terrain.tiles.length * TERRAIN_IDENTITY_FIELDS);
  const terrainIdentity = new Uint8Array(world.terrain.tiles.length);
  const tiles = world.terrain.tiles.map((tile, index): CachedBiomeTile => {
    writeTerrainIdentity(numericIdentity, terrainIdentity, tile, index);
    const magicalWater = deriveMagicalWaterInfluence(seed, tile);
    const baseline = deriveBaselineBiomeClimate(
      seed,
      tile,
      world.terrain.height,
      magicalWater,
    );
    return {
      id: classifyBiome(tile.terrain, baseline),
      baseline,
    };
  });
  const created: BiomeTerrainCache = {
    seedText: world.seedText,
    seedKey,
    width: world.terrain.width,
    height: world.terrain.height,
    numericIdentity,
    terrainIdentity,
    tiles,
  };
  biomeTerrainCaches.push(created);
  if (biomeTerrainCaches.length > MAX_BIOME_CACHE_ENTRIES) biomeTerrainCaches.shift();
  biomeCacheByTerrainArray.set(world.terrain.tiles, created);
  return created;
}

function weatherAdjustedBiomeTiles(
  baselineTiles: readonly CachedBiomeTile[],
  weather: WorldView["weather"],
): readonly ProjectedBiomeTile[] {
  const weatherKey = [
    weather.kind,
    weather.intensity,
    weather.windX,
    weather.windY,
  ].join(":");
  const cached = liveBiomeCache.get(baselineTiles);
  if (cached?.weatherKey === weatherKey) return cached.tiles;

  const tiles = baselineTiles.map((tile): ProjectedBiomeTile => {
    const climate = applyWeatherToBiomeClimate(tile.baseline, weather);
    return {
      id: tile.id,
      climate: {
        rainfall: climate.rainfall / FIXED_POINT,
        heat: climate.heat / FIXED_POINT,
        salinity: climate.salinity / FIXED_POINT,
        exposure: climate.exposure / FIXED_POINT,
        magicalWater: climate.magicalWater / FIXED_POINT,
      },
    };
  });
  liveBiomeCache.set(baselineTiles, { weatherKey, tiles });
  return tiles;
}

function terrainIdentityMatches(
  cached: BiomeTerrainCache,
  tiles: readonly TerrainTileView[],
): boolean {
  if (tiles.length !== cached.terrainIdentity.length) return false;
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    if (!tile) return false;
    const offset = index * TERRAIN_IDENTITY_FIELDS;
    if (
      cached.numericIdentity[offset] !== tile.index
      || cached.numericIdentity[offset + 1] !== tile.x
      || cached.numericIdentity[offset + 2] !== tile.y
      || cached.numericIdentity[offset + 3] !== tile.elevation
      || cached.numericIdentity[offset + 4] !== tile.moisture
      || cached.numericIdentity[offset + 5] !== tile.roughness
      || cached.terrainIdentity[index] !== terrainKindCode[tile.terrain]
    ) return false;
  }
  return true;
}

function writeTerrainIdentity(
  numericIdentity: Int32Array,
  terrainIdentity: Uint8Array,
  tile: TerrainTileView,
  index: number,
): void {
  const offset = index * TERRAIN_IDENTITY_FIELDS;
  numericIdentity[offset] = tile.index;
  numericIdentity[offset + 1] = tile.x;
  numericIdentity[offset + 2] = tile.y;
  numericIdentity[offset + 3] = tile.elevation;
  numericIdentity[offset + 4] = tile.moisture;
  numericIdentity[offset + 5] = tile.roughness;
  terrainIdentity[index] = terrainKindCode[tile.terrain];
}

function projectTideHarp(
  harp: TideHarp,
  worldWidth: number,
  tileSize: number,
  active: boolean,
): TideHarpView {
  const [reed, anchor, wind] = harp.knots;
  const [reedAnchor, reedWind, anchorWind] = harp.edges;
  const projectEdge = (edge: TideHarp["edges"][number]) => ({
    id: edge.id,
    fromId: String(edge.fromId),
    toId: String(edge.toId),
    from: tilePoint(edge.fromTileIndex, worldWidth, tileSize),
    to: tilePoint(edge.toTileIndex, worldWidth, tileSize),
  });
  return {
    id: harp.id,
    label: harp.label,
    knots: [
      {
        id: String(reed.id),
        kind: reed.kind,
        point: tilePoint(reed.tileIndex, worldWidth, tileSize),
      },
      {
        id: String(anchor.id),
        kind: anchor.kind,
        point: tilePoint(anchor.tileIndex, worldWidth, tileSize),
      },
      {
        id: String(wind.id),
        kind: wind.kind,
        point: tilePoint(wind.tileIndex, worldWidth, tileSize),
      },
    ],
    edges: [projectEdge(reedAnchor), projectEdge(reedWind), projectEdge(anchorWind)],
    center: {
      x: harp.center.x * tileSize,
      y: harp.center.y * tileSize,
    },
    active,
  };
}

function destinationMarkerLabel(
  kind: ProjectionOptions["destinationKind"],
  settlementName: string,
): string {
  switch (kind) {
    case "pickup": return `PICK UP CARGO · ${settlementName}`;
    case "report": return `DELIVER REPORT · ${settlementName}`;
    case "delivery": return `DELIVER CARGO · ${settlementName}`;
    default: return `DESTINATION · ${settlementName}`;
  }
}

function renderTerrain(tile: TerrainTileView, built: boolean): RenderTerrainKind {
  if (built) return "built";
  switch (tile.terrain) {
    case "deep-water":
      return "deep-water";
    case "tidal-flat":
      return tile.waterDepth > 500_000
        ? "channel"
        : tile.waterDepth > 120_000
          ? "shallows"
          : tile.moisture < 560_000 || tile.elevation > 310_000
            ? "sandbar"
            : "mudflat";
    case "marsh":
      return "salt-marsh";
    case "meadow":
      return tile.moisture < 545_000 || tile.roughness > 610_000 ? "scrub" : "meadow";
    case "ridge":
      return "ridge";
  }
}

function renderWeather(kind: WorldView["weather"]["kind"]): RenderWeatherKind {
  switch (kind) {
    case "clear":
      return "clear";
    case "mist":
      return "mist";
    case "rain":
      return "rain";
    case "storm":
      return "squall";
  }
}

function tidePhase(phase: number): TidePhase {
  const normalized = ((phase % 720) + 720) % 720;
  if (normalized < 90 || normalized >= 630) return "low";
  if (normalized < 270) return "flood";
  if (normalized < 450) return "high";
  return "ebb";
}

function tideProgress(phase: number): number {
  const normalized = ((phase % 720) + 720) % 720;
  if (normalized < 90) return (normalized + 90) / 180;
  if (normalized < 270) return (normalized - 90) / 180;
  if (normalized < 450) return (normalized - 270) / 180;
  if (normalized < 630) return (normalized - 450) / 180;
  return (normalized - 630) / 180;
}

function tilePoint(index: number, width: number, tileSize: number): { x: number; y: number } {
  return {
    x: (index % width) * tileSize + tileSize / 2,
    y: Math.floor(index / width) * tileSize + tileSize / 2,
  };
}

function settlementGlyph(
  project: WorldView["settlements"][number]["project"]["kind"],
): "harbor" | "hearth" | "workshop" | "garden" | "relay" {
  switch (project) {
    case "ferry": return "harbor";
    case "cache": return "hearth";
    case "crossing": return "workshop";
    case "clinic": return "garden";
    case "beacon": return "relay";
  }
}

function eventKind(type: WorldView["events"][number]["type"]): "arrival" | "delivery" | "warning" | "repair" | "memory" | "signal" {
  if (type.includes("fulfilled")) return "delivery";
  if (type.includes("route") || type.includes("project")) return "repair";
  if (type.includes("weather") || type.includes("rejected") || type.includes("expired")) return "warning";
  if (type.includes("knowledge")) return "signal";
  if (type.includes("accepted") || type.includes("departed")) return "arrival";
  return "memory";
}

function eventLabel(type: WorldView["events"][number]["type"]): string {
  if (type === "contract-offered") return "Cargo pickup available";
  return titleCase(type.replaceAll("-", " "));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.floor(values.reduce((total, value) => total + value, 0) / values.length);
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
