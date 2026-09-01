# TIDEWEFT gathering, crafting, and field adaptation contract

## Status and boundary

This document began as the implementation contract for the gathering and crafting expansion. It is deliberately more exact than a feature wish list: identifiers, units, state ownership, migration behavior, anti-exploit rules, and exit tests were specified before the runtime began depending on them. The rollout ledger near the end now distinguishes what has crossed into authoritative play from the remaining contracts.

The current source candidate contains deterministic gatherable resource nodes, a shared material/transport pack, recipes, durable condition, repairs, dismantling, and the anywhere PACK / MAKE / MEND KIT surface. Four wearable adaptations already affect authoritative travel: Marsh wraps, Float sash, Ridge cleats, and Weather cape. The six inherited Wayknots now retain wear across reclaim and redeployment, spend condition on those actions, and require a short setting period. Harbor lockers, crafted-Wayknot deployment, playable ladders and rock walls, Pannier capacity, cargo shroud/liner effects, and assisted-use Wayknot wear remain staged. Those boundaries are stated explicitly in KIT and the field manual rather than implied to be hidden mechanics.

Existing live systems remain authoritative while this work lands:

- physical Promises move conserved settlement stock;
- signed reports move information only and use one document slot;
- the shared cargo-and-KIT capacity is 18 legacy load units (`18_000` milli-load);
- the player begins with six stable-ID Wayknots—R1, R2, A3, A4, W5, and W6;
- Tide Harps are derived from valid one-of-each Wayknot triangles;
- weather, seven biome identities, sounded depth, currents, local saves, and perpetual world ticks already exist.

Crafting extends those systems. It does not create a second currency, replace settlement cargo, add loot boxes, run an offline clock, or require a server.

## Design promise

The intended loop is:

```text
enter a legible hazard
        ↓
notice a native material by shape, motion, and sound
        ↓
choose whether its gathering risk and pack load are worth carrying
        ↓
make or mend a specific adaptation
        ↓
cross that terrain with greater agency
        ↓
leave, retrieve, repair, or store the same physical object
```

Terrain supplies both the problem and part of its answer. A reed marsh can provide cordreed for marsh wraps; a tide channel can provide bladderkelp for a float sash; a wind ridge can provide stormlichen for weather gear; rocky reaches provide fittings for cleats and ladders. The useful recipe usually crosses at least two biomes, so the player reads the whole estuary rather than farming one optimal patch.

Gathering is a spatial and carrying decision, not a clicker loop. The most useful precedent is resource play in which terrain form, extraction, and route planning are one system rather than separate menus: System Era's [Astroneer terrain-system presentation](https://media.gdcvault.com/gdcsummer2020/presentations/Biddlecom-Aaron-MiningYourOwnDesign.pdf) and the procedural-resource discussions in Factorio's official [resource-generation notes](https://www.factorio.com/blog/post/fff-258) and [biome/resource update](https://www.factorio.com/blog/post/fff-386) are useful technical references. TIDEWEFT remains its own small, deterministic care-and-delivery simulation.

## Resource ecology

### Canonical materials

Material IDs are lowercase literals and never localized. Counts are non-negative safe integers. One unit has the following carried load; `1 legacy load = 1,000 milli-load`.

| Material ID | Field name | Milli-load | Character |
| --- | --- | ---: | --- |
| `cordreed` | Cordreed | 600 | Tough wet fiber; bends without snapping |
| `pitchmoss` | Pitchmoss | 800 | Clinging sealant; sheds ordinary rain |
| `bladderkelp` | Bladderkelp | 700 | Buoyant cells that soften water forces |
| `driftwood` | Driftwood | 1,800 | Light rigid stock for frames and rungs |
| `sunfiber` | Sunfiber | 500 | Dry binding fiber that takes tension well |
| `hookstone` | Hookstone | 1,300 | Rough stone that bites into ridges |
| `shellstone` | Shellstone | 1,600 | Hard, workable plate for fittings |
| `stormlichen` | Stormlichen | 450 | Wind-reactive webbing that spreads gust load |
| `glimmer-spore` | Glimmer spore | 250 | Rare sealing culture altered by magical water |

The exact milli-load values are balance constants, but the unit and integer-only rule are permanent. Cargo, reports, materials, components, and carried adaptations all use the same load calculation. UI may display `4.6 load`, but state stores `4_600`.

### Biome association

Each derived biome has a common, secondary, and rare material. This table is data, not renderer-only flavor.

| Biome | Common material A | Common material B | Rare material | Readable field hazard |
| --- | --- | --- | --- | --- |
| Tide Channel | Bladderkelp | Driftwood | Glimmer-spore | Depth, stamina drain, and current |
| Brine Flat | Shellstone | Sunfiber | Hookstone | Tidal exposure, glare, and unstable crust |
| Reed Marsh | Cordreed | Pitchmoss | Bladderkelp | Drag, hidden channels, and poor footing |
| Rain Meadow | Pitchmoss | Driftwood | Stormlichen | Rain exposure and cargo wetting |
| Sun Meadow | Sunfiber | Driftwood | Shellstone | Heat exposure and open carrying distance |
| Wind Ridge | Hookstone | Stormlichen | Sunfiber | Gusts, rock falls, and stability loss |
| Glimmerfen | Glimmer-spore | Pitchmoss | Bladderkelp | Magical-water contamination and deceptive footing |

Biome identity comes from the existing seed-and-terrain biome profile. A separate mutually exclusive keyed roll gives a tile a common node at `150_000` per million, a secondary node at `70_000` per million, a rare node at `25_000` per million, or no node. Node identity never depends on live weather, harbor distance, discovery, or iteration history. Resource presentation must use silhouette, texture, animation, and a written local label in addition to color.

### Deterministic node generation

Resource layout is derived, not serialized in full.

- `FIELD_RESOURCE_CATALOG_VERSION = 1` is part of every node-generation key.
- Candidate randomness uses the world root seed, coordinate address, and named presence/capacity purpose constants. Material then follows from the stable biome and selected rarity. It must not consume or perturb the simulation's sequential RNG.
- A node ID is the canonical string `field-v1:<seedHex>:<x>,<y>:<materialId>`. There is at most one natural node on a tile.
- Derived node output is sorted by tile index, then canonical node ID. Input tile order and unrelated keyed-random calls cannot change it.
- Capacity, including one unharvestable living reserve, is keyed in the inclusive range 5–9 for common nodes, 4–7 for secondary nodes, and 2–4 for rare nodes. `stock = 1` is the resting depleted state, so learned ecology never disappears and no material can be harvested to extinction.
- A normal gather command requests a positive whole-unit quantity and succeeds completely or not at all. The first runtime slice defaults that quantity to one.
- The renderer receives nodes only for discovered tiles. Ordinary discovery can reveal material type and a broad `plentiful / some / recovering` band. A Loom sounding, or standing on the node, reveals exact stock, one-unit load, gathering effort, and current local hazard. Projection must never inspect hidden authoritative depth or biome values to expose a node cue.

These rules follow the repository's existing seeded-world discipline and the general reproducibility guidance collected in [Procedural Content Generation in Games](https://www.pcgbook.com/): generate stable structure from explicit keys, then persist only player-caused differences.

### Bootstrap and reachability

No seed may require an adaptation whose ingredients are trapped behind that same adaptation.

Every proposed harbor is checked against the derived catalog within a Manhattan radius of 14. The evaluator accepts sources only in the bootstrap-safe Brine Flat, Reed Marsh, Rain Meadow, and Sun Meadow biomes, and requires:

- one renewable fiber source: Cordreed or Sunfiber; and
- one renewable rigid source: Driftwood, Hookstone, or Shellstone.

New-world harbor placement must call this evaluator and reject or deterministically move an unsafe proposal; it must not rewrite the natural catalog to make the check pass. A stored legacy world's harbors cannot be regenerated, so integration may place a visible, one-time `strandfall` starter cache at an unsafe harbor. That fallback is saved explicit state, contains only ordinary fiber/rigid material IDs, and cannot respawn.

The starting harbor additionally needs a non-ladder route to both guaranteed sources. World validation rejects a generated layout if every exit, every bootstrap source, or every offered promise origin is ladder-gated. A ladder may make a route shorter or safer; it cannot be the only way to obtain the first ladder.

### Depletion and regeneration

Only sparse deviations from derived full stock are saved:

```ts
interface FieldResourceDepletion {
  nodeId: string;
  missingUnits: number;
  regenerationProgressFixed: number;
}

interface FieldResourceEcologyState {
  version: 1;
  activeTick: number;
  depletion: FieldResourceDepletion[];
}
```

`missingUnits` is clamped to `0..capacity - 1`; `regenerationProgressFixed` is clamped to `0..999_999`. A full node has no saved depletion entry. Duplicate corrupt entries resolve conservatively to the greatest depletion, then the least accumulated progress, independent of input order.

| Node rarity | Base fixed-point growth per active tick | Ticks per unit at a neutral 1.0× response |
| --- | ---: | ---: |
| Common | 15,000 | about 67 |
| Secondary | 10,000 | 100 |
| Rare | 4,000 | 250 |

Each active ecology tick multiplies that base by the current material-specific weather response, clamped to `600..1_600` permille. Callers segment an advance at weather changes, and equal-weather advances are partition invariant. Every complete `1_000_000` fixed-point growth restores one missing unit; surplus progress remains. Once the node is full, its sparse entry disappears. The runtime advances `activeTick` only alongside authoritative world simulation. Closing and reopening the game advances neither clock.

Regrowth is deterministic replenishment, not a real-time appointment. There are no daily claims, streaks, push notifications, offline accumulation, or permanent world exhaustion. Weather makes ecology interact with the living world without changing native material identity or producing a random bonus roll.

### Gathering transaction

A gather command is legal only while the player is on the node tile, is not swept or rescued, has room for the whole requested quantity, and harvesting it would leave the node's one living unit. It is queued for the next fixed player step. Base stamina cost per gathered unit is `4_000` for Cordreed, Pitchmoss, Bladderkelp, Sunfiber, and Glimmer-spore; `6_000` for Driftwood and Stormlichen; and `8_000` for Hookstone and Shellstone. The same fixed step still resolves the tile's current, footing, weather, and cargo pressure. The transaction atomically:

1. validates node ID, tile, discovery, stock, and capacity against current state;
2. spends the displayed fixed stamina cost and applies any already-legible terrain exposure;
3. removes the requested node units;
4. adds the same quantity of that material to the pack; and
5. announces material, remaining node band, pack load, and any handling consequence.

There is no partial unit, remote harvesting, animation-timing bonus, or random critical yield. A rejected command changes nothing and names one exact cause such as `Move onto Cordreed`, `Pack needs 250 more load`, or `Cordreed is recovering`.

## One physical pack

### Milli-load accounting

The v2 pack has a base capacity of `18_000` milli-load. Older Alpha v2 records carrying the former `16_000` capacity migrate to this floor without losing valid contents. Existing legacy values convert exactly:

- legacy cargo weight `n` becomes `n × 1_000` milli-load;
- the signed report/document slot consumes `1_000` milli-load;
- every raw material uses the table above;
- every crafted component and adaptation uses the explicit milli-load in the canonical crafting catalog.

Processing can shed water, loose bark, stone dust, and offcuts, so a recipe's output load need not equal its ingredients' carried load. That reduction is explicit recipe data and can never depend on inventory order. Deployed objects are no longer physically in the pack; reclaiming one requires enough free load for that exact item. The six migrated starter Wayknots remain dedicated field-kit pieces and do not suddenly consume promise capacity. This compatibility exception is explicit and cannot be used by newly crafted items.

`packLoadMilli` is a pure sum over cargo, report, material stacks, component stacks, and carried/equipped adaptation instances. It must always be less than or equal to `packCapacityMilli`. The HUD continues to show a compact Cargo vital; KIT exposes the exact breakdown.

### Harbor material lockers

Every harbor owns a local locker keyed by settlement ID. A locker can hold raw materials, components, and undeployed adaptations with non-negative integer counts or stable item IDs. It does not hold active Promise cargo or a signed report.

- Depositing and withdrawing require the player to stand at that harbor's exact interaction tile.
- A locker cannot be read or spent remotely. The KIT may name known remote contents as an aged local record, using the same truthfulness discipline as settlement knowledge.
- Crafting at a harbor may draw from the pack and that harbor's locker in a stable order chosen before confirmation; field crafting draws from the pack only.
- Withdrawal is atomic and capacity checked. Deposit never changes trust, settlement inventory, project parts, or the conserved Promise ledger.
- Lockers are a carrying-pressure release valve, not a global bank or teleport network.

## Recipe graph

Recipes form a directed acyclic graph:

```text
biome materials → prepared components → field adaptations
                                     ↘ repair inputs
```

Recipe IDs, input maps, output IDs, output counts, and load are canonical data. A recipe command sorts inputs by material/component ID, verifies the whole transaction, consumes all inputs once, and creates the output once. Components retain an exact recursively expanded raw-material cost even when processing changes their load. Failure leaves state byte-for-byte equivalent. Crafting has no chance roll and never consumes settlement goods, Promise cargo, trust, or shared route parts.

### Prepared components

| Recipe ID | Output | Inputs | Output load |
| --- | --- | --- | ---: |
| `component/braided-cord` | 1 Braided cord | 2 Cordreed + 1 Sunfiber | 900 |
| `component/pitchcloth` | 1 Pitchcloth | 1 Pitchmoss + 1 Sunfiber | 600 |
| `component/stone-fitting` | 1 Stone fitting | 2 Hookstone + 1 Shellstone | 2,400 |
| `component/float-cell` | 1 Float cell | 2 Bladderkelp + 1 Cordreed | 1,400 |
| `component/stormweave` | 1 Stormweave | 1 Stormlichen + 1 Sunfiber | 400 |
| `component/glimmer-seal` | 1 Glimmer seal | 1 Glimmer-spore + 1 Pitchmoss + 1 Shellstone | 1,150 |

Components stack by ID and are not individually conditioned. Their explicit output load accounts for preparation waste; their recursive raw cost remains exact for catalog validation and salvage checks.

### Adaptations

Adaptation instances have stable monotonically allocated IDs, `condition` in `0..1_000_000`, and one location: carried, equipped, locker, or deployed. Load is derived from the canonical gear kind rather than trusted from a saved item. An item cannot occupy two locations, and an allocated ID is never reused.

| Recipe ID | Adaptation | Inputs | Initial load | Specific benefit |
| --- | --- | --- | ---: | --- |
| `gear/marsh-wraps` | Marsh wraps | 1 Braided cord + 1 Pitchcloth | 1,000 | Reduces marsh/tidal-flat effort and low-stability slips |
| `gear/float-sash` | Float sash | 1 Braided cord + 2 Float cells | 1,500 | Reduces deep-water stamina cost and current force; never prevents zero-meter sweep |
| `gear/ridge-cleats` | Ridge cleats | 1 Braided cord + 2 Stone fittings | 2,200 | Reduces rock travel cost and fall chance on passable outcrops |
| `gear/weather-cape` | Weather cape | 2 Pitchcloth + 2 Stormweaves | 1,300 | Reduces rain, cold-front, and gust exposure to the porter |
| `gear/cargo-rain-shroud` | Cargo rain shroud | 1 Glimmer seal + 2 Pitchcloth | 1,100 | Reduces ordinary and magical-water wetting of carried cargo |
| `gear/glimmer-liner` | Glimmer liner | 2 Glimmer seals + 1 Pitchcloth | 900 | Reduces magical-water contamination; it does not block impact damage |
| `gear/ladder` | Field ladder | 2 Braided cords + 3 Driftwood + 1 Stone fitting | 6,000 | Bridges one supported cardinal span of 2–4 edges across one rock formation |
| `gear/pannier` | Trail pannier | 2 Braided cords + 2 Driftwood + 1 Pitchcloth | 3,200 | Adds 6,000 pack capacity while equipped; its own load still counts |
| `gear/reed-mat` | Reed mat | 2 Braided cords + 1 Driftwood + 1 Pitchcloth | 5,200 | Supplies the existing mat effect on marsh and tidal flats |
| `gear/tide-anchor` | Tide anchor | 1 Bladderkelp + 1 Braided cord + 2 Stone fittings | 5,000 | Supplies the existing anchor effect around sounded deep water |
| `gear/wind-knot` | Wind knot | 1 Braided cord + 2 Stormweaves | 350 | Supplies the existing knot effect on exposed ground |

Only one item per wearable slot can apply: feet, water, body, cargo-wrap, cargo-liner, and pack. Ladders and crafted Wayknots are deployables. Benefits combine through named bounded channels, not by multiplying duplicate copies. The UI shows the baseline hazard, each applied aid, and the final cost or risk before the player commits when that forecast is available.

The first runtime integration uses these target modifiers; `1_000` permille is neutral and smaller cost/risk multipliers are beneficial:

| Adaptation | Initial authoritative modifier |
| --- | --- |
| Marsh wraps | Marsh/flat movement cost ×800; footing stability loss ×700 |
| Float sash | Wet-tile stamina cost ×800; current force ×850 while either meter remains above zero |
| Ridge cleats | Passable-rock travel cost ×750; fall risk ×600; walls remain blocked |
| Weather cape | Porter exposure gain ×650; gust stability loss ×750 |
| Cargo rain shroud | Rain and ordinary-water cargo wetting pressure ×500 |
| Glimmer liner | Magical-water contamination pressure ×400 |
| Trail pannier | +6,000 milli-load capacity while sound and equipped |

The float sash never suppresses the existing rule that zero stamina or zero stability in deep/current water yields control to the current. When several aids target one channel, the strongest valid modifier wins; duplicate gear cannot multiply it toward zero.

This structure follows a useful economy lesson described by CD Projekt Red: recipes should make low-tier materials remain relevant rather than turning them into permanent trash ([crafting and the Witcher 3 economy](https://www.gamedeveloper.com/design/how-cd-projekt-red-made-crafting-work-with-i-witcher-3-i-s-dynamic-economy)). TIDEWEFT applies that lesson through repairs and cross-biome components, without vendor prices or rarity-colored loot.

### Condition, use, and repairs

Condition is visible as a number and text band: sound `750_001..1_000_000`, worn `350_001..750_000`, frail `1..350_000`, broken `0`. An adaptation loses condition only when its named benefit actually changes a resolved cost, exposure, force, or fall risk. Merely walking while equipped causes no wear.

The four live traversal wearables already resolve their gameplay effects and service wear through runtime-owned data. Staged shroud, liner, and pannier integrations must use the same rule: one qualifying tile-entry event selects the strongest eligible instance per benefit channel, breaking ties by lowest stable item ID. The initial service cadence is:

- Marsh wraps: `8_000` per aided marsh/flat entry.
- Float sash: `10_000` per aided wet-tile entry.
- Ridge cleats: `12_000` per aided rock entry.
- Weather cape: `6_000` per weather-exposed tile entry.
- Rain shroud or Glimmer liner: `8_000` when it prevents positive cargo pressure on a fixed step, at most once per entered tile.
- Pannier: `5_000` only when carried load exceeds the unequipped base capacity during a tile entry.

Each event adds the same amount to monotonic `serviceWear` and subtracts it from condition, clamped at zero. A zero-service quote spends zero condition. Resolution uses the item's pre-event condition, then applies wear; an item that reaches zero becomes broken after that resolved event. Positive condition supplies the full named benefit—there is no hidden durability multiplier—except during an explicit setup period.

Broken live wearables supply no hazard benefit. **Future pannier contract:** if a pannier breaks while its capacity is needed, the pack must enter an explicit saved over-capacity grace state: the existing load remains carried, movement and Promise delivery remain legal, but gathering, withdrawing, crafting into the pack, or equipping more load is blocked until repair, dismantling, or a harbor deposit restores ordinary capacity. Nothing may be silently deleted or teleported.

A repair command requests a positive fixed-point condition gain. The real restoration is `min(requestedGain, 1_000_000 - currentCondition)`. For every full-repair ingredient with quantity `q`, the exact quote consumes `ceil(q × realRestoration / 1_000_000)`. An oversized request therefore cannot overcharge past the actual deficit. Full-repair ingredient vectors are:

| Item family | Repair input |
| --- | --- |
| Marsh wraps | 1 Cordreed + 1 Pitchmoss |
| Float sash | 2 Bladderkelp + 1 Cordreed |
| Ridge cleats | 2 Hookstone + 1 Braided cord |
| Weather cape | 2 Stormlichen + 1 Pitchmoss |
| Cargo rain shroud | 2 Pitchcloth + 1 Glimmer-spore |
| Glimmer liner | 2 Glimmer-spore + 1 Pitchmoss |
| Field ladder | 2 Driftwood + 1 Braided cord |
| Trail pannier | 1 Driftwood + 2 Cordreed |
| Reed mat | 2 Cordreed + 1 Pitchmoss |
| Tide anchor | 2 Shellstone + 1 Braided cord |
| Wind knot | 2 Stormlichen + 1 Cordreed |

Repair is available from anywhere through KIT when the inputs are in the pack, the player is not swept, and the target is carried or equipped. A deployed aid must be reclaimed before mending. The preview shows real restoration and the exact proportional quote; failure consumes nothing.

### Lossy dismantling

Dismantling is the recovery valve for an unwanted adaptation, not a duplication path. At pristine condition it returns the following fixed salvage; each returned quantity becomes `floor(fullQuantity × condition / 1_000_000)`, and zero results disappear:

| Adaptation | Pristine salvage |
| --- | --- |
| Cargo rain shroud | 1 Pitchcloth |
| Float sash | 1 Float cell |
| Glimmer liner | 1 Glimmer seal |
| Field ladder | 1 Braided cord + 1 Driftwood |
| Marsh wraps | 1 Pitchcloth |
| Trail pannier | 1 Braided cord + 1 Driftwood |
| Reed mat | 1 Braided cord + 1 Driftwood |
| Ridge cleats | 1 Stone fitting |
| Tide anchor | 1 Braided cord + 1 Stone fitting |
| Weather cape | 1 Pitchcloth + 1 Stormweave |
| Wind knot | 1 Stormweave |

Catalog validation expands both construction and salvage through the component DAG and requires pristine salvage to be positive, componentwise no greater, and strictly smaller somewhere than construction cost. Dismantling is atomic and can be blocked when the recovered parts are bulkier than the folded item and the pack lacks room.

## Wayknots, ladders, and anti-redeploy rules

### Wayknot v2 identity

Save v2 preserves the six current IDs, kinds, and placements. Each Wayknot gains:

```ts
interface WayknotV2 {
  id: number;
  kind: "reed-mat" | "tide-anchor" | "wind-knot";
  tileIndex: number | null;
  condition: number;
  readyTick: number | null;
  serviceWear: number;
}
```

Kinds of the six migrated core pieces remain determined by stable ID; malformed input cannot turn R1 into an anchor. A newly crafted piece receives a new positive stable adaptation ID and its recipe's fixed kind. At most six Wayknots may be deployed at once in the initial integration, so crafting spares does not create an unbounded field.

Placement subtracts `80_000` condition. Reclaim subtracts `40_000`, preserves ID and all remaining condition, returns no stamina, stability, Loom, material, cargo condition, or world tick, and cannot trigger a fresh tutorial reward. A piece needs at least `150_000` condition before placement.

Placement sets `readyTick = currentTick + 3`. Before that tick the field displays `SETTING` and supplies 50% of its ordinary benefit; at and after that tick it supplies the full benefit. Reclaiming and placing again creates a new three-tick setting period. A broken deployed knot remains visible and reclaimable but supplies no effect.

Wayknot service wear is charged only to the lowest-ID knot whose effect actually wins a channel on a qualifying entered tile:

- Reed mat: `12_000` when it reduces flat/marsh movement or stability cost.
- Tide anchor: `16_000` when it reduces water stamina, current force, or sweep distance.
- Wind knot: `10_000` when it reduces exposed-ground gust or stability cost.

A successful Harp pulse that reveals at least one tile outside the ordinary player radius counts as one assisted service for each of its three member knots, using the per-kind wear above. Passive Harp recharge does not cause constant wear. A Harp is inactive if any member is carried, broken, or still setting; selection remains exact, knot-disjoint, and deterministic. Existing six-piece saves therefore derive their old Harps unchanged, while later crafted pieces may join selection only after the selector and its complexity bound are explicitly upgraded and tested.

Repairs use the proportional MEND rules and the full-repair vectors above. Newly crafted Wayknots count their catalog milli-load while carried; only the six migrated core pieces receive the compatibility load exception.

These rules close the current reclaim/redeploy loophole: moving an aid costs condition, delays full effect, and preserves rather than resets its history.

### Ladder lifecycle

A crafted ladder is one stable adaptation instance; it is never replaced by a generic count. Its existing derived rock placement validation remains authoritative: one cardinal span of 2–4 edges, supported safe endpoints, one rock formation, no occupied crossing, and no overlap with another ladder.

- A ladder needs at least `250_000` condition to place.
- Placement subtracts `60_000`, sets `readyTick = currentTick + 3`, and displays 50% support while setting. That partial support remains below the crossing threshold, so the ladder is not yet passable.
- Reclaim is allowed only from either supported endpoint and only when no player, resident, or loose cargo occupies its path. It subtracts `30_000` and requires `6_000` free milli-load in the pack.
- One completed crossing is one assisted service and subtracts `18_000` condition. Multiple actors or loose cargo each count as one resolved service. Wear is charged after a crossing resolves, never per animation frame or animation sample.
- The crossing uses pre-event condition. If post-crossing condition reaches zero, the ladder visibly breaks after the traveler reaches the far edge. A previously broken ladder is impassable, remains in the world, and can be reclaimed from an endpoint for repair.
- Reclaiming preserves condition, service wear, and stable ID; it restores no meters and refunds no ingredients. Redeployment pays placement wear and repeats setup.

The player can always inspect a ladder's endpoints, span, setting time, condition, and reclaim blocker without stepping onto it. Pointer pathing treats an unset or broken ladder as unavailable and prices a valid ladder with the same crossing cost as manual movement.

## KIT interface

KIT is the single inventory, make, equip, store, and mend surface. It is available anywhere, but opening it does not pause world time or bypass location rules.

### Mobile

The compact action dock uses the slot freed by the hidden Title button for a 44 × 44 minimum **KIT** control. The visible Quiet Hour moon remains. KIT participates in one surface coordinator with `promises`, `inspector`, and `tutorial`: opening one closes the others, releases held movement, and never leaves an invisible layer intercepting world taps.

The mobile surface is a safe-area sheet below the four-vital strip and above the touch dock. It has one independently scrolling content region and three sticky, touch-sized tabs:

- **PACK** — active Promise/report, load breakdown, raw materials, components, equipped gear, carried gear, and the current harbor locker when centered on a harbor;
- **MAKE** — stable-key recipe rows with output, purpose, inputs owned/needed, output load, and one exact disabled reason;
- **MEND** — worn items ordered by condition then stable ID, showing current condition, restored amount, repair inputs, and location blockers.

The close control, tabs, recipe actions, equip actions, and locker transfers meet the 44 CSS-pixel target. Focus stays inside the open sheet, returns to KIT on close, and status announcements use the existing live region. The design follows the W3C guidance for [enhanced target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced) and the [modal dialog interaction pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), while preserving TIDEWEFT's non-pausing field behavior.

### Desktop

Desktop **I** toggles KIT on its last-used tab. **C** opens KIT directly to MAKE. Escape closes it and restores focus. The header may expose a text KIT control, but the travel HUD does not gain permanent recipe instructions. Keyboard and pointer operate the same stable DOM rows; live world revisions update values without replacing a pressed button beneath the pointer.

### Command truthfulness

KIT actions are commands, not direct DOM mutations. Every row has a stable recipe or item ID. Disabled copy distinguishes at least:

- missing named input and quantity;
- insufficient pack space;
- item already equipped or deployed;
- wrong harbor for a locker operation;
- player swept or in recovery;
- item at full condition;
- deployed item must be reclaimed;
- ladder path occupied; and
- save/version data rejected.

The field manual gains gathering, load, KIT, recipes, wear, repair, lockers, and ladder topics in the same release that makes each mechanic playable.

## Save envelope v2

This expansion increments the outer `tideweft-session` envelope from version 1 to version 2. The checksummed simulation-world string remains independently versioned. The **live** version 2 fields add canonical ecology deltas and active tick, material/component stacks, adaptation instances and locations, the next stable adaptation ID, and Wayknot v2 condition/setup state. Settlement lockers, ladder state, and over-capacity grace remain future schema contracts; they are not fields in the current v2 runtime and will require an explicit later version/migration before they can be called live. The initial recipe catalog is known from the start, so it needs no unlock or discovery state.

The v1 → v2 migration is explicit and idempotent:

1. Deserialize and validate the existing world before deriving any resource node.
2. Preserve seed, terrain dimensions—including stored 64 × 48 Alpha terrain—world tick, contracts, stocks, routes, residents, choirs, player position, cargo/report, discoveries, soundings, traces, tools, tutorial, session shape, and recap state.
3. Convert every existing cargo/report load by exactly `× 1_000`, establish the `18_000` capacity floor, and reject rather than truncate any unsafe numeric value.
4. Start raw materials, components, and adaptations empty; initialize the shared next adaptation ID after the six preserved core Wayknot IDs. No ladder or harbor-locker field is materialized by live v2, and the foundation-only ladder fixture grants no migrated item.
5. Start ecology with `activeTick = world.completedTick` and an empty sparse-depletion array, which means full seed-derived nodes without simulating past growth.
6. Preserve Wayknot IDs, kinds, and valid placements. Set each migrated piece to condition `1_000_000`, service wear `0`, and, when deployed, `readyTick = completedTick` so an old functioning layout resumes fully set. Carried pieces use `readyTick = null`.
7. Recompute Tide Harps from migrated active Wayknots; do not serialize Harps.
8. Write version 2 only after the migrated state passes all invariants. Future or malformed versions fail safely and leave the stored record untouched.

Loading a save does not run growth, finish setup, repair gear, or alter weather. Those changes require later authoritative world ticks. Save normalization sorts maps/stacks/items canonically, drops no valid unique item, rejects duplicate locations, and never manufactures inputs to repair an over-capacity record.

## Authoritative invariants

The implementation is not complete until all of these hold:

1. Same seed, resource version, and terrain produce byte-equivalent node definitions regardless of traversal or collection order.
2. Hidden tiles reveal neither resource presence nor rare-material identity through Chart, Relief, pointer costs, accessibility text, or batch counts.
3. Every new seed passes harbor bootstrap and no-self-lock reachability checks.
4. Node stock, stack counts, component counts, locker counts, capacity, condition, and service wear are bounded non-negative integers.
5. Every successful craft consumes its declared inputs once, creates its declared output once, retains one exact recursive raw-cost vector, and uses its explicit catalog load. Failed transactions conserve all inputs and outputs.
6. Promise cargo and settlement inventory remain in their existing conserved ledger. Gathering, lockers, repairs, and salvage cannot mint, spend, or disguise them; pristine salvage is strictly lossy against construction after recursive raw expansion.
7. One adaptation ID has exactly one location. One Wayknot ID has its canonical kind. No two deployed aids occupy an illegal shared space.
8. Wear is caused only by a resolved benefit or an explicit placement/reclaim action, never by frame rate, menu time, renderer choice, save/load, or merely being equipped.
9. Reclaim preserves identity and damage and restores no stamina, stability, Loom, cargo condition, materials, trust, or time.
10. Broken or setting aids cannot silently participate in pointer routing, automatic movement, Waychords, or Tide Harps.
11. Regeneration uses completed world ticks only. Reloading the same tick is state-equivalent; closing the game produces no ecology change.
12. Pack load never exceeds effective capacity after an ordinary command. Exceptional pannier breakage enters one explicit over-capacity recovery state without deleting Promise cargo.
13. Chart 2D, Relief 3D, desktop UI, and mobile UI project the same public counts, conditions, node IDs, and disabled reasons.
14. No crafting rule depends on `Math.random`, wall-clock time, network access, deep learning, screen size, or render frame rate.

## Rollout and verification

The feature ships in reversible slices. Each slice updates this document, README/build ledger, the T/? field manual, focused tests, production build, Electron smoke, and a GitHub Pages checkpoint before the next slice changes authoritative state.

### Slice A — Derived ecology

- Add material/resource types, keyed node generation, bootstrap validation, sparse deltas, public projection, and restrained Chart/Relief presentations.
- Keep gathering disabled until hidden-information and save tests pass.
- Exit: multi-seed determinism and bootstrap soak, order-independence, discovery masking, bounded batch counts, and no change to replay RNG vectors.

### Slice B — Pack, gathering, lockers, and KIT

- Land save-envelope v2 migration, milli-load accounting, raw material stacks, atomic gathering, harbor lockers, and PACK/MAKE/MEND shell.
- MAKE may initially show components as `coming next`; it must not display enabled controls that dispatch nowhere.
- Exit: v1 migration fixtures, reload equivalence, no-offline-growth tests, capacity/conservation properties, 360 × 640 and short-landscape sheet smoke, keyboard/focus checks, and a complete tutorial update.

### Slice C — Components and wearable adaptations

- Enable the recipe DAG, stable adaptation IDs, equip slots, condition, benefit-qualified wear, proportional repairs, lossy dismantling, and causal cargo/terrain readouts.
- Exit: atomic recipe property tests, permutation invariance, exact load projection and raw-cost ancestry, lossy-salvage proofs, duplicate-benefit tie breaking, wear/no-wear matrices, repair caps, and long-run soak without negative stock or condition.

### Slice D — Wayknot v2 and ladders

- Migrate the six stable Wayknots, add setup/wear/repair, connect the rock field to movement and routing, render ladders in both views, and support physical reclaim blockers.
- Exit: anti-redeploy regression tests, old Harp fixtures preserved after migration, setting/broken Harp exclusion, ladder reachability and fall matrices, loose-cargo occupancy checks, pointer/manual cost parity, and save/reload during setup.

### Slice E — Weather, magical water, and loose cargo

- Connect the existing pure cargo-environment evaluator to carried and dropped cargo, exposure, current drift, impact, condition-based delivery grades, and the established repair economy.
- Exit: cargo conservation across drop/drift/recovery/delivery, deterministic current trajectories, contamination/decay bounds, no hidden depth leak, recovery accessibility, and trust/reward changes explained before delivery.

Every slice must be enjoyable and internally honest on its own. If a later system is not active, UI calls it planned rather than hinting that an inert button already protects the player.
