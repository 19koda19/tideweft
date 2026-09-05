/**
 * Platform-neutral field-manual content for the full tutorial overlay.
 *
 * This module deliberately contains no DOM or runtime state. Desktop and
 * touch layouts can therefore render the same ordered, tested explanation
 * without teaching different rules. Every ID is a stable presentation key;
 * do not derive saved game state from tutorial page numbers.
 */

export type TutorialAudience = "all" | "desktop" | "mobile";
export type TutorialCalloutTone = "note" | "safety" | "mastery" | "boundary";
export type TutorialMechanicStatus = "live" | "planned";

export const TUTORIAL_SECTION_IDS = [
  "welcome",
  "whats-new",
  "movement",
  "signed-regions",
  "promises",
  "reports",
  "water-and-meters",
  "cargo-care",
  "terrain-and-tools",
  "foraging",
  "pack-and-crafting",
  "wayknots-and-harps",
  "routes-and-settlements",
  "people-and-about",
  "views-and-hud",
  "saves-and-quiet-hour",
  "accessibility",
  "build-boundaries",
] as const;

export type TutorialSectionId = (typeof TUTORIAL_SECTION_IDS)[number];

export const TUTORIAL_CONTROL_IDS = [
  "move-keys",
  "set-destination",
  "brace-key",
  "brace-button",
  "scan-key",
  "scan-button",
  "interact-key",
  "interact-button",
  "gather-key",
  "kit-key",
  "make-key",
  "kit-button",
  "kit-tabs",
  "wayknot-key",
  "wayknot-button",
  "view-key",
  "view-button",
  "relief-orbit",
  "relief-touch-orbit",
  "world-zoom",
  "inspect-person",
  "cancel-destination",
  "promises-sheet",
  "tutorial-key",
  "tutorial-button",
  "quiet-hour",
] as const;

export type TutorialControlId = (typeof TUTORIAL_CONTROL_IDS)[number];

export interface TutorialControl {
  readonly id: TutorialControlId;
  readonly audience: TutorialAudience;
  readonly input: string;
  readonly action: string;
  readonly detail?: string;
}

export interface TutorialStep {
  readonly id: string;
  readonly audience: TutorialAudience;
  readonly title: string;
  readonly body: string;
  readonly controlId?: TutorialControlId;
}

export interface TutorialCallout {
  readonly id: string;
  readonly audience: TutorialAudience;
  readonly tone: TutorialCalloutTone;
  readonly title: string;
  readonly body: string;
}

export interface TutorialAction {
  readonly id: "open-patch-notes";
  readonly label: string;
  readonly description: string;
}

export interface TutorialGuideSection {
  readonly id: TutorialSectionId;
  readonly iconText: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly summary: string;
  readonly keywords: readonly string[];
  readonly controlIds: readonly TutorialControlId[];
  readonly steps: readonly TutorialStep[];
  readonly callouts: readonly TutorialCallout[];
  readonly action?: TutorialAction;
}

export interface PlannedMechanic {
  readonly id: string;
  readonly status: "planned";
  readonly title: string;
  readonly clarification: string;
  readonly keywords: readonly string[];
}

export interface TutorialGuide {
  readonly version: number;
  readonly title: string;
  readonly subtitle: string;
  readonly sections: readonly TutorialGuideSection[];
  readonly controls: readonly TutorialControl[];
  readonly plannedMechanics: readonly PlannedMechanic[];
}

/** The authoritative control legend. It intentionally contains no pause/tide control. */
export const TUTORIAL_CONTROLS = [
  {
    id: "move-keys",
    audience: "desktop",
    input: "WASD / Arrow keys",
    action: "Travel manually",
    detail: "Click the world canvas first. In Relief 3D, directions remain camera-relative.",
  },
  {
    id: "set-destination",
    audience: "all",
    input: "Click / tap open terrain",
    action: "Chart a destination",
    detail: "The route planner uses known depth, field tools, and Wayknot effects. Unknown water receives a caution cost, not an invisible wall.",
  },
  {
    id: "brace-key",
    audience: "desktop",
    input: "Hold Shift while moving",
    action: "Brace the load",
    detail: "Works from the field or HUD; BRACING and a planted mark confirm the held safety state.",
  },
  {
    id: "brace-button",
    audience: "mobile",
    input: "Hold BRACE",
    action: "Brace during touch travel",
    detail: "Keep holding through danger to trade route speed for stability and fragile-cargo protection; release to stop bracing.",
  },
  {
    id: "scan-key",
    audience: "desktop",
    input: "Space",
    action: "Pulse the Loom",
    detail: "Reveals nearby terrain and records water depth while charge is available.",
  },
  {
    id: "scan-button",
    audience: "all",
    input: "SOUND / SCAN",
    action: "Pulse the Loom",
  },
  {
    id: "interact-key",
    audience: "desktop",
    input: "E / Enter",
    action: "Use the contextual harbor action",
  },
  {
    id: "interact-button",
    audience: "all",
    input: "Contextual action button",
    action: "Pick up, deliver, or inspect at the harbor underfoot",
    detail: "Read its live label: the action changes with your location and carried job.",
  },
  {
    id: "gather-key",
    audience: "desktop",
    input: "E over a field find",
    action: "Gather the resource underfoot",
    detail: "The one-unit harvest must fit. A living reserve remains in an ordinary node.",
  },
  {
    id: "kit-key",
    audience: "desktop",
    input: "I",
    action: "Open or close KIT on PACK",
  },
  {
    id: "make-key",
    audience: "desktop",
    input: "C",
    action: "Open KIT directly on MAKE",
  },
  {
    id: "kit-button",
    audience: "all",
    input: "KIT",
    action: "Open the field inventory without pausing the world",
    detail: "On touch it sits beside PROMISES in the compact top strip; on desktop it is in the action dock.",
  },
  {
    id: "kit-tabs",
    audience: "all",
    input: "PACK / MAKE / MEND",
    action: "Read carried load, craft, repair, or dismantle in one surface",
  },
  {
    id: "wayknot-key",
    audience: "desktop",
    input: "F",
    action: "Bind or reclaim the contextual Wayknot",
  },
  {
    id: "wayknot-button",
    audience: "all",
    input: "Wayknot action button",
    action: "Bind, reclaim, or read why the field action is unavailable",
  },
  {
    id: "view-key",
    audience: "desktop",
    input: "V",
    action: "Switch Chart 2D / Relief 3D",
  },
  {
    id: "view-button",
    audience: "all",
    input: "Header view control",
    action: "Switch Chart 2D / Relief 3D",
  },
  {
    id: "relief-orbit",
    audience: "desktop",
    input: "Hold J / L · Right-drag / Alt-drag",
    action: "Spin the Relief 3D map left or right",
    detail: "J and L turn smoothly while held. Releasing either key, leaving the window, or opening a dialog stops keyboard rotation.",
  },
  {
    id: "relief-touch-orbit",
    audience: "mobile",
    input: "Two-finger twist",
    action: "Spin the Relief 3D map",
    detail: "Twist directly over the world. A recognized two-finger gesture is never also treated as a travel tap.",
  },
  {
    id: "world-zoom",
    audience: "desktop",
    input: "Mouse wheel",
    action: "Zoom the active world view",
  },
  {
    id: "inspect-person",
    audience: "all",
    input: "Click / tap a visible person or dog",
    action: "Open their live ABOUT view",
    detail: "ABOUT shows only what is observable or already learned. It does not pause danger or preserve a person or dog after sight is lost.",
  },
  {
    id: "cancel-destination",
    audience: "desktop",
    input: "Escape / right click",
    action: "Cancel the current pointer destination",
  },
  {
    id: "promises-sheet",
    audience: "mobile",
    input: "PROMISES + / PROMISES −",
    action: "Open or close the full-size Promises sheet",
    detail: "The route, safety line, terrain, and contextual actions remain in the compact field strip.",
  },
  {
    id: "tutorial-key",
    audience: "desktop",
    input: "T",
    action: "Open or close this field manual",
  },
  {
    id: "tutorial-button",
    audience: "mobile",
    input: "?",
    action: "Open or close this field manual",
    detail: "The compact question-mark action is titled Open tutorial for assistive technology.",
  },
  {
    id: "quiet-hour",
    audience: "all",
    input: "QUIET HOUR / ☾",
    action: "Save, review the session, and choose whether to continue or return to the title",
  },
] as const satisfies readonly TutorialControl[];

/**
 * Features requested for later simulation phases. Keeping this list beside
 * the live guide makes the boundary explicit: these are not secret rules in
 * the current build and the tutorial must never imply that they are active.
 */
export const TUTORIAL_PLANNED_MECHANICS = [
  {
    id: "planned-regional-settlements",
    status: "planned",
    title: "Distant settlements and living opportunities",
    clarification: "Terrain now continues seamlessly beyond the original harbor country. Its authored harbors, Promise economy, and natural material patches remain local to that known estuary. Generated distant settlements, actors, causal finds, and extension of the living network are planned rather than cloned into empty country.",
    keywords: ["procedural generation", "world seed", "distance", "reseed", "harbor", "settlement"],
  },
  {
    id: "planned-universal-npcs",
    status: "planned",
    title: "Broader people, dogs, and wildlife",
    clarification: "The original harbor country's 42 humans remain the current human population. One independently generated dog is now paired with one existing porter for a small food-and-rain web, with lawful perception, condition, ABOUT, movement, memory, and promotion. Additional dogs, bears, birds, deer, generated distant populations, ownership, companions, full/coarse population ecology, evidence tracking, rumors, groups, physical pursuit, and broad cross-species perception remain planned.",
    keywords: ["npc", "dog", "bear", "bird", "wildlife", "companion", "identity", "about", "perception", "ecology"],
  },
  {
    id: "planned-regional-biomes",
    status: "planned",
    title: "Biome ecology and exposure consequences",
    clarification: "Seven stable visual biomes and bounded local climate signals are live. Full ecology, accumulated rain, heat stress, and exposure do not affect the courier or carried cargo yet.",
    keywords: ["biome", "rain", "weather", "temperature", "heat", "exposure"],
  },
  {
    id: "planned-magic-water-cargo",
    status: "planned",
    title: "Magic-water and weather reactions by cargo material",
    clarification: "Depth, magnitude-scaled current, controllable ADRIFT recovery, and a one-time sweep penalty are live. Rain, heat, immersion, salinity, and magical water do not yet transform specific cargo materials.",
    keywords: ["magic water", "cargo material", "rain", "immersion", "salinity"],
  },
  {
    id: "planned-rocks-and-ladders",
    status: "planned",
    title: "Rock obstacles and ladders",
    clarification: "Rough ridges and terrain travel costs are live. Solid ladder-gated rock formations and climb tools are not implemented yet.",
    keywords: ["rock", "ladder", "climb", "obstacle"],
  },
  {
    id: "planned-staged-gear-bridges",
    status: "planned",
    title: "Remaining crafted-gear and locker effects",
    clarification: "Recipes and durable items are live, but crafted Reed mats, Tide anchors, and Wind knots do not become deployable Wayknots yet. Ladder traversal, Pannier capacity, Rain shroud and Glimmer liner cargo protection, and harbor locker storage are also staged rather than active.",
    keywords: ["crafted wayknot", "pannier", "rain shroud", "glimmer liner", "locker", "gear effect"],
  },
  {
    id: "planned-anywhere-upgrades",
    status: "planned",
    title: "Anywhere upgrade system",
    clarification: "Civic tools and reusable Wayknots are live. There is not yet a trust-money wallet or an anywhere upgrade shop.",
    keywords: ["upgrade", "trust money", "shop", "wallet"],
  },
] as const satisfies readonly PlannedMechanic[];

export const TUTORIAL_GUIDE_SECTIONS = [
  {
    id: "welcome",
    iconText: "01",
    title: "Carry care; teach the land",
    shortTitle: "Premise",
    summary: "TIDEWEFT is a perpetual courier ecology: settlements need real supplies, and the exact paths you travel can become shared infrastructure.",
    keywords: ["premise", "goal", "perpetual", "seed", "porter", "campaign"],
    controlIds: ["tutorial-key", "tutorial-button"],
    steps: [
      {
        id: "welcome-read-world",
        audience: "all",
        title: "Needs cause promises",
        body: "Each estuary uses one world seed to reproduce one continuous world in every direction. The original harbor country preserves its biome pattern and harbor sites; those settlements produce, consume, build civic projects, and experience shortages, so Promise cards come from simulated needs rather than a disconnected quest table.",
      },
      {
        id: "welcome-leave-strands",
        audience: "all",
        title: "Travel becomes capacity",
        body: "A completed cargo journey strengthens trust and the exact corridor you used. Strong strands let resident porters inherit work; resilient loops reduce dependence on one fragile bridge.",
      },
      {
        id: "welcome-no-quota",
        audience: "all",
        title: "The world is open-ended",
        body: "There is no ten- or twenty-five-minute quota. A resilient route weave is a milestone, not an ending; continue tending the same locally saved world for as long as you like.",
      },
    ],
    callouts: [
      {
        id: "welcome-not-score-chase",
        audience: "all",
        tone: "note",
        title: "Read causes, not just meters",
        body: "Stocks, trust, project progress, route condition, weather, and the chronicle explain why the estuary changed.",
      },
    ],
  },
  {
    id: "whats-new",
    iconText: "NEW",
    title: "What's new in this build",
    shortTitle: "What's New",
    summary: "The same offline release ledger is available from the title, Quiet Hour, and here in the field manual. It separates live changes, migrations, and known limitations.",
    keywords: ["what's new", "patch notes", "version", "build", "release", "changes", "migration", "limitations"],
    controlIds: [],
    steps: [
      {
        id: "whats-new-one-source",
        audience: "all",
        title: "Read one canonical ledger",
        body: "Open Patch Notes below for newest-first entries generated from the same structured source as CHANGELOG.md. Each release names its version, date, build identity, A CHALLENGING HARD balance changes, save implications, fixes, interface work, and honest limitations.",
      },
      {
        id: "whats-new-return",
        audience: "all",
        title: "Return to the same page",
        body: "Opening Patch Notes dispatches no simulation or save command. From the active field, the world continues underneath; from the title or Quiet Hour, the existing stopped state is preserved. Close them to return to this exact field-manual page; keyboard and touch use the same release history.",
      },
    ],
    callouts: [
      {
        id: "whats-new-not-roadmap",
        audience: "all",
        tone: "boundary",
        title: "Only shipped behavior belongs here",
        body: "Known limitations may name planned systems, but a patch entry never describes a disconnected kernel or future mechanic as playable.",
      },
    ],
    action: {
      id: "open-patch-notes",
      label: "OPEN PATCH NOTES",
      description: "Open the offline Patch Notes and return to What's New when closed",
    },
  },
  {
    id: "movement",
    iconText: "02",
    title: "Choose a line through the estuary",
    shortTitle: "Movement",
    summary: "Travel directly or chart a destination. Terrain, known water depth, tools, load, pace, and field weaves all affect the route.",
    keywords: ["move", "travel", "tap", "destination", "autopilot", "path", "cancel"],
    controlIds: ["move-keys", "set-destination", "cancel-destination"],
    steps: [
      {
        id: "movement-keyboard",
        audience: "desktop",
        title: "Manual travel",
        body: "Focus the canvas, then use WASD or the arrow keys. Manual input cancels a charted destination. In Relief 3D, directions follow the screen after you orbit the camera.",
        controlId: "move-keys",
      },
      {
        id: "movement-pointer",
        audience: "desktop",
        title: "Chart a destination",
        body: "Click open terrain to ask the Loom for a route. On safe ground, the porter pulls the route's cardinal steps into a steady diagonal heading instead of seesawing between axes; named hazards, impassable edges, and costlier terrain are never cut through by that smoothing. Shift-click appends another leg. Escape or right click clears the route.",
        controlId: "set-destination",
      },
      {
        id: "movement-touch",
        audience: "mobile",
        title: "Tap to travel",
        body: "Tap open terrain in Chart or Relief to set a destination. Tapping a harbor charts to its exact center so pickup and delivery cannot miss. Tapping a visible field resource charts within reach and gathers it automatically on arrival. Safe diagonal legs steer smoothly without skipping a hazardous tile or corner. The porter follows the line until arrival, danger, or a new destination.",
        controlId: "set-destination",
      },
      {
        id: "movement-discovery",
        audience: "all",
        title: "Unknown ground stays unknown",
        body: "Walking reveals nearby terrain permanently. The route planner treats unsounded water cautiously, while a Loom pulse gives it truthful depth information.",
      },
    ],
    callouts: [
      {
        id: "movement-mobile-control",
        audience: "mobile",
        tone: "mastery",
        title: "Short-screen rhythm",
        body: "Keep the Promises sheet folded while traveling so the compact route, safety, terrain, and action lines stay readable above the world.",
      },
    ],
  },
  {
    id: "signed-regions",
    iconText: "∞",
    title: "The world keeps going",
    shortTitle: "Unbroken world",
    summary: "Walk in any direction and the same world continues. There is no map-edge action, transition, or reset for your courier, route, cargo, discoveries, or field kit.",
    keywords: ["world", "distance", "infinite", "continuous", "coordinates", "travel", "return"],
    controlIds: ["move-keys", "set-destination", "world-zoom"],
    steps: [
      {
        id: "regions-cross",
        audience: "all",
        title: "Just keep walking",
        body: "Walk or chart a route toward any visible ground in Chart or Relief. Terrain is prepared ahead while movement, footsteps, weather, water, and the camera continue normally. No prompt, banner, loading screen, or second click marks progress into new country.",
      },
      {
        id: "regions-read-address",
        audience: "all",
        title: "Use one world address and compass",
        body: "The quiet location line reports continuous E and N coordinates. The compass remains world-north, and a remote PICK UP, DELIVER, report, or lost Promise objective keeps its true global distance and bearing instead of pretending the target is nearby.",
      },
      {
        id: "regions-persist",
        audience: "all",
        title: "Distance does not reset things",
        body: "The local save records your exact world position, chart marks, soundings, deployed Wayknots, carried lot identities, and touched parcels. Returning regenerates deterministic terrain and restores durable changes; a collected resource never reappears merely because you traveled far away.",
      },
      {
        id: "regions-promise-detour",
        audience: "all",
        title: "A detour remains an honest delivery",
        body: "You may carry Promise cargo beyond the original route network and return. The physical delivery still counts, but an off-network detour cannot invent route-reinforcement credit for paths that do not exist.",
      },
      {
        id: "regions-current-boundary",
        audience: "all",
        title: "Read the current frontier honestly",
        body: "Procedural terrain, water, weather, footing, Wayknots, carried cargo, loose-parcel drift, and local saves continue beyond the old map extent. Currents and terrain carry the same recoverable object onward without changing its identity, condition, momentum, history, or Promise custody. Generated distant settlements, wildlife, humans, causal wilderness finds, and natural material patches are not live yet; the country beyond the original estuary can therefore be genuinely empty.",
      },
    ],
    callouts: [
      {
        id: "regions-no-copy-loot",
        audience: "all",
        tone: "boundary",
        title: "Infinite ground is not infinite easy loot",
        body: "Traveling into new country does not clone the original estuary's harbors, resources, people, or easy finds. Empty distance is still a distinct deterministic place, not another roll of the starting map.",
      },
      {
        id: "regions-camera-snap",
        audience: "all",
        tone: "note",
        title: "A steady point of view",
        body: "Chart drags, Relief orbit/twist gestures, pointer positions, and an active route remain attached to the same world locations as the nearby view shifts with the journey. Ordinary travel does not snap the camera or cancel the route.",
      },
    ],
  },
  {
    id: "promises",
    iconText: "03",
    title: "Pick up first; deliver second",
    shortTitle: "Promises",
    summary: "A promise card does not teleport cargo into your pack. Follow its named PICK UP harbor, collect the physical load, then carry it to DELIVER.",
    keywords: ["promise", "contract", "quest", "pickup", "pick up", "deliver", "cargo", "accept"],
    controlIds: ["promises-sheet", "interact-key", "interact-button", "set-destination"],
    steps: [
      {
        id: "promises-open-list",
        audience: "desktop",
        title: "Choose in Promises",
        body: "Open the scrollable Promises rail and read PICK UP, DELIVER, load property, route estimate, forecast, and consequence. Select the card you want.",
      },
      {
        id: "promises-open-list-mobile",
        audience: "mobile",
        title: "Open the full Promises sheet",
        body: "Tap PROMISES +, scroll the full-height list, and read the named PICK UP and DELIVER harbors. Tap PROMISES − to return to the world.",
        controlId: "promises-sheet",
      },
      {
        id: "promises-chart-pickup",
        audience: "all",
        title: "Go to PICK UP",
        body: "If you are elsewhere, the card action says “Go to [harbor] for pickup.” It tracks and focuses the amber pickup marker; it does not load cargo yet. Travel onto that harbor mark.",
      },
      {
        id: "promises-collect-cargo",
        audience: "all",
        title: "Collect the physical load",
        body: "At the named origin, choose “Pick up cargo here.” E works immediately when exactly one local cargo promise is waiting; when several are local, choose the intended card in Promises. Your objective changes from PICK UP to DELIVER only after collection succeeds.",
        controlId: "interact-button",
      },
      {
        id: "promises-deliver-cargo",
        audience: "all",
        title: "Go to DELIVER and hand it over",
        body: "Carry the load to the named destination harbor. Stand on its mark and use E / Enter or the “Deliver cargo” action. Every condition grade arrives; better condition produces a better outcome.",
        controlId: "interact-key",
      },
    ],
    callouts: [
      {
        id: "promises-confirmation",
        audience: "all",
        tone: "note",
        title: "How to know it worked",
        body: "Before pickup, the objective says PICK UP and the cargo meter stays empty. After pickup, it says DELIVER, names the destination, and shows cargo condition and pack load.",
      },
      {
        id: "promises-handoff",
        audience: "all",
        tone: "safety",
        title: "A promise can be handed off safely",
        body: "If the route becomes too much, reach any harbor and use the active promise card's handoff action. The cargo enters accountable local care; discovered terrain and traveled knowledge remain.",
      },
    ],
  },
  {
    id: "reports",
    iconText: "04",
    title: "Carry a fact, not a crate",
    shortTitle: "Reports",
    summary: "A signed stock report is a separate one-slot information journey. It records one harbor's current count and preserves its source and observation time.",
    keywords: ["report", "signed report", "stock report", "document", "information", "carry"],
    controlIds: ["interact-key", "interact-button"],
    steps: [
      {
        id: "reports-inspect-source",
        audience: "all",
        title: "Stand at the source harbor",
        body: "Use the contextual Inspect harbor action, then scroll to “Signed reports · information only” beneath Connections. A report must be witnessed where it is produced; remote inspection cannot create one, and its disabled button says why.",
        controlId: "interact-button",
      },
      {
        id: "reports-collect",
        audience: "all",
        title: "Choose a named recipient",
        body: "Each row names one distinct source fact and recipient: “Sign [source]'s current [stock] count → [recipient].” Exact duplicate source-subject-recipient records collapse to one stable action. The case records quantity and in-world observation time, uses one document slot, and moves no supplies; physical cargo jobs live only in Promises.",
      },
      {
        id: "reports-deliver",
        audience: "all",
        title: "Relay it at the destination",
        body: "Travel to the named recipient and press E / Enter or “Deliver report.” The destination receives a sourced, time-stamped fact instead of an unexplained omniscient update.",
        controlId: "interact-key",
      },
    ],
    callouts: [
      {
        id: "reports-one-case",
        audience: "all",
        tone: "note",
        title: "One document case",
        body: "You can carry only one report at a time and need one free pack slot. If cargo and a report share the same destination, one contextual interaction may deliver first; read the button and use it again for the other handoff.",
      },
    ],
  },
  {
    id: "water-and-meters",
    iconText: "05",
    title: "Read the water before it takes your footing",
    shortTitle: "Water & safety",
    summary: "Stamina pays for movement; stability is the current percentage of physical control supported by terrain, speed, water, weather, load, equipment, and BRACE.",
    keywords: ["stamina", "stability", "water", "depth", "scan", "sounding", "current", "swept", "adrift", "paddle", "float", "arrow", "fall", "stumble", "pace"],
    controlIds: ["brace-key", "brace-button", "scan-key", "scan-button"],
    steps: [
      {
        id: "meters-scan-depth",
        audience: "all",
        title: "Sound uncertain water",
        body: "Use Space or SOUND / SCAN. A charged pulse permanently reveals nearby terrain and records bathymetry. The field readout then names the depth band and exact water effort; deeper water drains more stamina while moving.",
        controlId: "scan-button",
      },
      {
        id: "meters-read-current",
        audience: "all",
        title: "Read the moving surface",
        body: "Sparse streamlines, foam, and real water ambience show which way discovered water is moving and whether its surface is calm or rough. Calm reaches occasionally breathe OHM; harder water says WHISSH. A SOUND / SCAN pulse adds analytical arrowheads and records exact bathymetry. Surface character never supplies the exact unsounded depth or water-effort value.",
      },
      {
        id: "meters-stability",
        audience: "all",
        title: "Stability is a live percentage",
        body: "Stability is footing, not stored stamina and not a gauge that keeps draining under unchanged conditions. Each physical contact calculates one current 0–100% balance from actual speed, acceleration and turning, grade, roughness, moisture, water depth and local current, wind, carried load and cargo shift, footwear, fixtures, posture, and BRACE. Repeating the same conditions holds the same percentage. Reaching a safer bank recalculates promptly even when crosswind remains, and the HUD shows the percentage with its strongest causes.",
      },
      {
        id: "meters-derived-pace",
        audience: "all",
        title: "Pace follows the ground",
        body: "Pace has no selector. REST means you are still, exhausted, floating ADRIFT, or physically recovering; STEADY covers ordinary controlled travel and an active paddle stroke; SWIFT appears automatically when gravity carries you downhill. The same deterministic rule applies on keyboard and touch.",
      },
      {
        id: "meters-brace-desktop",
        audience: "desktop",
        title: "Brace through a difficult patch",
        body: "Hold either Shift key while moving to trade speed for a substantially higher supported-stability percentage and fragile-cargo protection. It works when the world, document body, or a HUD control owns focus, except while typing in a field or using a modal. The safety readout says BRACING immediately and both views draw an amber planted-foot marker. Release it after the hazard. BRACE can make a prepared crossing controllable, but it cannot erase an unsupported edge or every severe current.",
        controlId: "brace-key",
      },
      {
        id: "meters-brace-mobile",
        audience: "mobile",
        title: "Hold BRACE through a risky patch",
        body: "Press and keep holding BRACE while a charted touch route crosses rough or wet ground. It feeds the same rule as desktop Shift: travel slows, the supported-stability percentage rises, and fragile cargo gets more protection. The compact safety line keeps the live percentage and cause visible. Release after the hazard; any interrupted touch releases it automatically so it cannot stick.",
        controlId: "brace-button",
      },
      {
        id: "meters-sweep",
        audience: "all",
        title: "Zero in deep water means ADRIFT",
        body: "In current water at or above the deep-water threshold, stamina or stability reaching zero puts you into a floating ADRIFT movement state. The current always moves you. On desktop, use WASD or arrows to paddle across it; on touch, tap toward visible shallow water for a short stroke. Release movement to float and recover stamina. A full pack weakens your stroke, and fighting directly upstream can slow the current but cannot reverse it forever. You rise only after reaching water no deeper than the standable threshold with enough stamina. Scanning and harbor work wait until then. Cargo stays physically accounted for, while a fall can damage one exact lot and separate parcels that continue under their own physics.",
      },
      {
        id: "meters-fall-feedback",
        audience: "all",
        title: "A mishap is visible and physical",
        body: "Hazardous crossings consume a durable traversal ordinal, so reloading cannot reroll the outcome. A stumble or fall briefly changes the courier's color and silhouette, speaks a small OOP, THUD, or WHHSH callout near the courier, and plays the matching simple tone. Falling can hurt cargo or break part of a lot loose; regain your feet before moving again.",
      },
    ],
    callouts: [
      {
        id: "meters-dry-exhaustion",
        audience: "all",
        tone: "safety",
        title: "Dry exhaustion is different",
        body: "Empty stamina on dry or ordinary shallow ground makes camp instead of triggering a current sweep. During ADRIFT, shallow water becomes a recovery place: float until you can stand even if a key is still held. A connected clinic can intercept exhaustion before a sweep; ferry response, Storm kites, Tide sails, and nearby Tide anchors provide bounded help without deleting the physical current.",
      },
    ],
  },
  {
    id: "cargo-care",
    iconText: "06",
    title: "Deliveries are graded, not binary",
    shortTitle: "Cargo care",
    summary: "Load weight changes stamina and speed, while cargo property and condition determine what rough travel costs the delivery.",
    keywords: ["cargo", "condition", "heavy", "fragile", "perishable", "freshness", "damage", "pack", "magic water"],
    controlIds: ["brace-key", "interact-key", "interact-button", "kit-key", "kit-button"],
    steps: [
      {
        id: "cargo-pack-capacity",
        audience: "all",
        title: "Weight is physical",
        body: "Fresh water and parts are heavy and consume extra pack capacity; medicine is fragile; food is perishable; reed is ordinary. A report reserves one additional slot. Promise cards disclose the property before pickup.",
      },
      {
        id: "cargo-stability-condition",
        audience: "all",
        title: "Low stability weathers a load",
        body: "Fragile medicine reacts earliest to rough unbraced handling. Perishable food loses freshness gently while traveling. A stumble or fall damages one deterministic physical lot; a current sweep adds its own one-time impact instead of repeating the same carried-cargo damage on every drift step.",
      },
      {
        id: "cargo-protect",
        audience: "all",
        title: "Choose control over panic",
        body: "Sound water, stop to recover, hold BRACE through supported hazards, and take field-tool or Wayknot-assisted lines. Pace follows the terrain rather than a button. Completed cache harbors improve recovery and shelter perishable food while you are there.",
      },
      {
        id: "cargo-drop-recover",
        audience: "all",
        title: "Dropped cargo remains in the world",
        body: "Open KIT → PACK to DROP an exact stack quantity or a whole Promise or gear lot. The parcel keeps a stable identity, condition, wetness, contamination, and provenance while currents move it, grades tumble it, impacts weather it, and local magic water applies its material reaction. Ordinary far-away parcel bodies leave the renderer's interest radius to protect mobile frame time, but they are not despawned: their exact state stays in the save and they reappear when approached. A dropped active Promise stays recovery-focused, changes the objective to RECOVER CARGO with its direction, distance, and motion, and cannot be delivered or renegotiated until its exact quantity is back in custody.",
      },
      {
        id: "cargo-recover-desktop",
        audience: "desktop",
        title: "Recover a nearby parcel",
        body: "Move within the marked two-tile reach and press E when the contextual action says Recover parcel. A fine-pointer click selects the visible parcel but never recovers it remotely. Recovery preserves the parcel's material state and retires its former carried-lot identity instead of duplicating it.",
        controlId: "interact-key",
      },
      {
        id: "cargo-recover-mobile",
        audience: "mobile",
        title: "Tap the parcel, not a tiny time window",
        body: "Tap a visible loose parcel. The courier charts toward it and recovers it automatically on entering the exact reach, so a harbor inspector cannot steal the tap. Open KIT from the mobile dock to inspect or drop carried lots.",
        controlId: "interact-button",
      },
      {
        id: "cargo-arrival",
        audience: "all",
        title: "Damaged cargo still matters",
        body: "A promise can be delivered at any condition grade. The destination's stock, trust, civic work, route, and chronicle still respond; preserving condition improves the result rather than deciding whether the trip counts at all.",
      },
    ],
    callouts: [
      {
        id: "cargo-physics-boundary",
        audience: "all",
        tone: "boundary",
        title: "One parcel, however far it drifts",
        body: "Loose cargo drops, takes impact, drifts with current, tumbles on grade, and remains the same recoverable object while traveling beyond the old map extent. Identity, condition, momentum, history, Promise custody, save, and reload remain intact. Mangrove and bramble snag callbacks exist only in the simulation kernel until living ecology is connected, so the field manual does not claim those catches yet.",
      },
    ],
  },
  {
    id: "terrain-and-tools",
    iconText: "07",
    title: "Let civic work change the journey",
    shortTitle: "Terrain & tools",
    summary: "Seven seeded biomes give channels, flats, marsh, meadow, ridges, and glimmering water a stable local identity. Completed settlement projects can entrust you with permanent field benefits.",
    keywords: ["terrain", "biome", "channel", "marsh", "mudflat", "ridge", "glimmerfen", "tool", "stilts", "sail", "kite", "clinic", "cache"],
    controlIds: ["scan-key", "scan-button", "set-destination"],
    steps: [
      {
        id: "terrain-read-types",
        audience: "all",
        title: "Read terrain and biome together",
        body: "The field strip names the local biome. Tide channels, brine flats, reed marshes, rain or sun meadow, wind ridges, and rare Glimmerfen use distinct restrained motifs in both views. Existing terrain still governs footing, water effort, and exposure; tide changes live depth, so the same flooded flat can demand a different line later.",
      },
      {
        id: "terrain-sounding-line",
        audience: "all",
        title: "The Sounding line starts with you",
        body: "Every new porter begins with a Sounding line. Its Loom pulse turns unknown water into a measured choice and helps pointer routing price the crossing honestly.",
        controlId: "scan-button",
      },
      {
        id: "terrain-unlock-tools",
        audience: "all",
        title: "Visit completed projects",
        body: "A completed Crossing grants Marsh stilts for flats and marsh; a Ferry grants a Tide sail for deep-water effort; a Beacon grants a Storm kite for gust stability and shorter sweeps. The tool is inherited when you physically visit that harbor.",
      },
      {
        id: "terrain-project-support",
        audience: "all",
        title: "Some projects help without becoming inventory",
        body: "Completed Clinics can rescue through established strands. Completed Caches improve local stamina and stability recovery and shelter perishables. These are network places, not buttons in an upgrade shop.",
      },
    ],
    callouts: [
      {
        id: "terrain-rock-boundary",
        audience: "all",
        tone: "boundary",
        title: "No ladder gate in this build",
        body: "Ridges already have roughness and travel cost, but solid rock obstacles, climbing physics, and ladders are planned for a later terrain phase.",
      },
    ],
  },
  {
    id: "foraging",
    iconText: "08",
    title: "Gather answers from the ground",
    shortTitle: "Foraging",
    summary: "Seeded biome resources are finite but renewable. Harvest whole units into the same capacity used by cargo, and leave each natural node a living reserve.",
    keywords: ["forage", "gather", "resource", "material", "cordreed", "bladderkelp", "driftwood", "pitchmoss", "sunfiber", "hookstone", "shellstone", "stormlichen", "glimmer spore", "regrow"],
    controlIds: ["gather-key", "set-destination", "scan-key", "scan-button"],
    steps: [
      {
        id: "foraging-read-habitats",
        audience: "all",
        title: "Each biome grows a material language",
        body: "Channels favor Bladderkelp and Driftwood; flats Shellstone and Sunfiber; marshes Cordreed and Pitchmoss; meadows Pitchmoss, Sunfiber, and Driftwood; ridges Hookstone and Stormlichen; Glimmerfen Glimmer spores. Rare finds cross those patterns. Written labels and silhouettes carry the information as well as color.",
      },
      {
        id: "foraging-desktop",
        audience: "desktop",
        title: "Stand over the find and press E",
        body: "Move onto a discovered resource node and use E when its contextual action says Gather. The current field action gathers exactly one whole unit. Its stamina cost and exact pack load are checked before anything changes.",
        controlId: "gather-key",
      },
      {
        id: "foraging-mobile",
        audience: "mobile",
        title: "Tap to route and auto-gather",
        body: "Tap a visible resource. The porter charts within gathering reach and gathers automatically on arrival, taking one whole unit, so a tap cannot be stolen by an inspector panel. A rejected harvest stays untouched and names the blocker, such as pack room or a recovering node.",
        controlId: "set-destination",
      },
      {
        id: "foraging-renewal",
        audience: "all",
        title: "Take from growth, never the last life",
        body: "Common, secondary, and rare nodes have seeded capacities. Ordinary harvest always leaves one unharvestable living unit. Missing units regrow only while this world's simulation advances; material-specific weather changes the bounded regrowth rate, and closed worlds gain no offline harvests.",
      },
    ],
    callouts: [
      {
        id: "foraging-no-random-bonus",
        audience: "all",
        tone: "note",
        title: "No timing trick or critical yield",
        body: "A successful gather takes the displayed whole unit. There are no animation bonuses, daily claims, remote harvesting, or hidden random multipliers.",
      },
    ],
  },
  {
    id: "pack-and-crafting",
    iconText: "09",
    title: "Pack, make, and mend in one KIT",
    shortTitle: "KIT",
    summary: "KIT combines entrusted transport, field finds, prepared components, and durable gear under one exact load limit. PACK, MAKE, and MEND are tabs of the same non-pausing surface.",
    keywords: ["kit", "inventory", "pack", "load", "capacity", "locker", "make", "craft", "recipe", "mend", "repair", "condition", "durability", "dismantle"],
    controlIds: ["kit-key", "make-key", "kit-button", "kit-tabs"],
    steps: [
      {
        id: "kit-open",
        audience: "all",
        title: "Open KIT anywhere",
        body: "Use KIT, or I on desktop. C opens directly to MAKE. Opening KIT does not pause: the world, tide, weather, porters, and route continue underneath. KIT and this tutorial close one another so only one field dialog occupies the safe viewport.",
        controlId: "kit-button",
      },
      {
        id: "kit-pack",
        audience: "all",
        title: "PACK reconciles every carried weight",
        body: "COMBINED LOAD is the exact sum of Promise cargo and signed reports under Transport plus carried materials, components, and gear under Finds + gear. Every row shows exact thousandth-load values. This build carries those stacks in PACK; harbor locker storage is staged and is not a hidden remote inventory.",
      },
      {
        id: "kit-make",
        audience: "all",
        title: "MAKE shows the whole transaction",
        body: "Each recipe names every ingredient available and required, the exact result, its use, and its carried load. MAKE is atomic: all inputs and result capacity are checked together. A disabled recipe names its precise first blocker and consumes nothing.",
        controlId: "kit-tabs",
      },
      {
        id: "kit-mend",
        audience: "all",
        title: "MEND keeps identity and condition",
        body: "Crafted gear is durable and keeps a stable identity, location, and condition. Each MEND restores up to 25% condition and scales its shown component cost to the actual missing condition. DISMANTLE is deliberately lossy and shows the salvage before you choose it.",
      },
      {
        id: "kit-live-adaptations",
        audience: "all",
        title: "Four carried adaptations work in the field now",
        body: "Marsh wraps help soft ground, a Float sash helps water, Ridge cleats help rough ridges, and a Weather cape helps exposed travel. Their assistance wears condition per aided tile. Other craftable gear remains durable inventory while its matching traversal or cargo system is staged; MAKE does not claim an effect that is not connected yet.",
      },
    ],
    callouts: [
      {
        id: "kit-capacity-is-shared",
        audience: "all",
        tone: "safety",
        title: "Crafting cannot hide weight",
        body: "Transport and field inventory share one capacity. Components and gear can be lighter or heavier than their ingredients, so MAKE checks the post-craft combined load rather than only counting free slots.",
      },
    ],
  },
  {
    id: "wayknots-and-harps",
    iconText: "10",
    title: "Bind reusable help into the field",
    shortTitle: "Wayknots",
    summary: "The six inherited Reed mats, Tide anchors, and Wind knots alter authoritative travel. Their durable condition matters; thoughtful combinations can form Waychords and three-knot Tide Harps.",
    keywords: ["wayknot", "reed mat", "tide anchor", "wind knot", "waychord", "tide harp", "reclaim", "loom", "durability", "condition"],
    controlIds: ["wayknot-key", "wayknot-button", "scan-key", "scan-button"],
    steps: [
      {
        id: "wayknots-context",
        audience: "all",
        title: "One contextual field action",
        body: "Use F or the Wayknot button. Marsh and tidal flats take a Reed mat; waist-deep water and channels take a Tide anchor; exposed scrub and ridges take a Wind knot. Flooded flats must be sounded first so the game does not reveal hidden depth through the suggested knot.",
        controlId: "wayknot-button",
      },
      {
        id: "wayknots-effects",
        audience: "all",
        title: "Each weave answers one hazard",
        body: "A Reed mat improves soft footing. A Tide anchor lowers nearby water stamina cost and sweep risk. A Wind knot lowers gust-driven stability loss on exposed ground. Pointer routes use these same authoritative effects.",
      },
      {
        id: "wayknots-reclaim",
        audience: "all",
        title: "Reclaim the same durable piece",
        body: "Stand directly on a bound mark and use the same field action to reclaim its numbered core item. Placement spends 8% condition and reclaiming spends 4%; neither duplicates the item nor refreshes condition. A newly placed knot takes a three-tick setting period before giving full service. After reclaiming it, MEND repairs that same stable item.",
        controlId: "wayknot-key",
      },
      {
        id: "wayknots-waychord",
        audience: "all",
        title: "Overlap unlike fields for a Waychord",
        body: "Where different Wayknot influences overlap, their harmony recharges the Loom faster. Hazard reductions stay bounded: only the strongest applicable help is used for each cost.",
      },
      {
        id: "wayknots-tide-harp",
        audience: "all",
        title: "Tune a compact triangle",
        body: "Place one Reed mat, one Tide anchor, and one Wind knot close enough to form a non-collinear triangle. Stand inside the selected triangle for extra Loom recharge; a successful pulse then sounds from you and all three knots.",
        controlId: "scan-button",
      },
    ],
    callouts: [
      {
        id: "wayknots-harp-count",
        audience: "all",
        tone: "mastery",
        title: "The field readout confirms the instrument",
        body: "It names tuned and active Tide Harps, the three numbered components, and the scan benefit. If it still says “Tune one,” move the pieces into a smaller, non-flat triangle.",
      },
      {
        id: "wayknots-crafted-boundary",
        audience: "all",
        tone: "boundary",
        title: "Crafted knot recipes are not deployment slots yet",
        body: "MAKE can produce durable Reed mat, Tide anchor, and Wind knot inventory items, but those crafted copies are not bridged into the F deployment system in this build. Only the six inherited numbered core pieces form active marks, Waychords, and Tide Harps.",
      },
    ],
  },
  {
    id: "routes-and-settlements",
    iconText: "11",
    title: "Turn footsteps into a resilient weave",
    shortTitle: "Living world",
    summary: "Deliveries affect material stocks, people, trust, projects, and routes. Surveyed and tended corridors can support autonomous porters and remembered loops.",
    keywords: ["route", "strand", "survey", "reinforce", "parts", "porter", "settlement", "trust", "project", "tide choir", "weather"],
    controlIds: ["interact-key", "interact-button", "set-destination"],
    steps: [
      {
        id: "routes-delivery-effects",
        audience: "all",
        title: "One promise has several consequences",
        body: "Delivery adds the conserved resource to its destination, changes trust, advances relevant civic work, records the traveled trace, and writes a causal chronicle entry.",
      },
      {
        id: "routes-survey",
        audience: "all",
        title: "Survey before tending",
        body: "Travel from one harbor to a connected neighbor along its visible corridor. The harbor inspector then marks that route Surveyed. This proves which physical path a parts investment will improve.",
      },
      {
        id: "routes-reinforce",
        audience: "all",
        title: "Spend shared parts at the harbor",
        body: "At a surveyed route's endpoint, open Connections and spend one part from that settlement's stores to strengthen or repair it. At full strand strength, autonomous resident porters can inherit promises on the corridor.",
      },
      {
        id: "routes-choir",
        audience: "all",
        title: "Close a harbor loop",
        body: "Survey consecutive corridor legs through three or more harbors and return to the first without repeating the interior. The unique loop awakens a Tide Choir and improves its member routes' condition and reliability.",
      },
      {
        id: "routes-weather",
        audience: "all",
        title: "Weather is already systemic",
        body: "The global front, wind, tide, shortages, route closures, congestion, and porter plans continue to change while you play. Forecast text and the chronicle expose those changes; accumulated heat, exposure, and material reactions are not live yet.",
      },
    ],
    callouts: [
      {
        id: "routes-campaign-open",
        audience: "all",
        tone: "note",
        title: "Resolution is not deletion",
        body: "When every settlement belongs to a sufficiently redundant active network, the campaign recognizes a resilient weave. The same world remains open for deliveries, exploration, reports, repairs, and new routes.",
      },
    ],
  },
  {
    id: "people-and-about",
    iconText: "12",
    title: "Meet people and one dog as individuals",
    shortTitle: "People, dog & ABOUT",
    summary: "The original harbor country's 42 humans and its first independent dog act only on lawful perception, while ABOUT reveals only what you can observe or have learned.",
    keywords: ["person", "resident", "porter", "dog", "food", "scent", "help", "reroute", "npc", "about", "inspect", "greet", "observed", "known", "identity", "emotion", "weather", "vision", "hearing", "attention", "search"],
    controlIds: ["inspect-person"],
    steps: [
      {
        id: "people-select",
        audience: "all",
        title: "Inspect an actor you can actually see",
        body: "Click or tap a directly visible resident, traveling porter, or the single generated dog. ABOUT closes if that actor leaves exact sight; it is a live field observation, not a remote tracker.",
        controlId: "inspect-person",
      },
      {
        id: "people-observed-known",
        audience: "all",
        title: "Observed is not the same as known",
        body: "OBSERVED contains readable physical facts such as approximate height, build, distinguishing marks, visible gear, condition, behavior, and apparent emotion. A stranger's hidden name, work, home, exact internal values, and stable database identity are not exposed by a click.",
      },
      {
        id: "people-greet",
        audience: "all",
        title: "Get close enough to exchange names",
        body: "Before an introduction, move within speaking distance and choose GREET. The simulation keeps running, and you must regain footing before speaking while ADRIFT. A successful greeting remembers that person's name, occupation, and home; repeated greetings do not farm new facts.",
      },
      {
        id: "people-perceive",
        audience: "all",
        title: "People notice what reaches them",
        body: "The original harbor country's humans can see the courier through a forward or close field, but terrain, structures, and weather can block or shorten that contact. Moving openly is easier to notice. Footfalls, splashes, and hard impacts may instead be heard as an anonymous direction: rain and nearby turbulent water mask sound, while wind changes how far and how clearly it travels. A sound does not tell somebody your identity or exact position.",
      },
      {
        id: "people-search",
        audience: "all",
        title: "Breaking sight really matters",
        body: "When somebody clearly sees you and then loses sight, they scan the last area they actually observed. They face saved search points rather than your hidden live position. Fresh lawful sight can reacquire you; otherwise their suspicion fades and they give up deterministically. That committed memory survives save/reload, but this slice does not make them physically pursue or pathfind through a search.",
      },
      {
        id: "dog-perception-condition",
        audience: "all",
        title: "The dog follows evidence, not hidden targets",
        body: "The first dog is a generated independent actor paired with one existing porter for this encounter, not that person's property or your companion. It can move toward an uncertain food-scent belief only when scent from the porter's physical provision pack reaches it; wind, rain, pack closure, terrain, and reachability can change the result. Rain also changes the dog's visible wetness and cold condition. The porter must separately see the dog before considering a response.",
      },
      {
        id: "dog-player-choices",
        audience: "all",
        title: "Ask and adapt; do not command",
        body: "A visible dog's ABOUT view offers ASK FOR HELP, SUGGEST SECURING BELONGINGS, WAIT AND WATCH, ROUTE AROUND THIS SPOT, and LEAVE. The first two are requests to the visible porter, who may choose another lawful response. ROUTE AROUND requires an existing automatic route and genuinely replans that destination around the dog's currently observed position; it is not flavor text or a teleport.",
      },
      {
        id: "dog-meal-memory",
        audience: "all",
        title: "One physical meal can become history",
        body: "If the porter decides to help, exactly one dried-fish unit moves from the porter's pack into dog custody before the dog can eat it. The unit cannot be duplicated by retrying. That accepted meal creates bounded dog memory and promotes this individual for persistence; after save and reload, ABOUT may recognize the same Familiar dog and remember that it accepted food from a porter. Promotion preserves an important actor—it is not ownership, training, naming, affection, or a companion bond.",
      },
      {
        id: "people-weather-emotion",
        audience: "all",
        title: "Weather reaches other travelers too",
        body: "Rain protection, wetness, cold pressure, exhaustion, current work, and unsafe weather can change a person's visible condition and route behavior. Restrained text faces such as :S, :[, :|, =], and :) punctuate readable emotion; posture, speech, and behavior remain the explanation rather than a hidden percentage meter.",
      },
      {
        id: "people-events",
        audience: "all",
        title: "You hear only the part of the world you witnessed",
        body: "Resident introductions and route changes can enter EVENTS when you directly caused or observed them. A distant actor event is not revealed later merely because that person walks into view; the full simulation history remains authoritative without becoming the player's god's-ear feed.",
      },
    ],
    callouts: [
      {
        id: "people-danger-live",
        audience: "all",
        tone: "safety",
        title: "ABOUT never freezes danger",
        body: "The compact, pane-free ABOUT text stays out of the main controls and never pauses travel, weather, currents, or actors. Close it with its button or Escape; if conditions become dangerous, act first.",
      },
      {
        id: "people-slice-boundary",
        audience: "all",
        tone: "boundary",
        title: "This is one small living web",
        body: "The released animal scope is exactly one independent domestic dog connected to one existing porter, one provision pack, current rain, and the five visible choices above. Additional dogs, animal populations, bears, birds, deer, ownership, companions, naming, training, affection, groups, evidence trails, combat, hunting, and the complete biodiversity food web are not live yet.",
      },
    ],
  },
  {
    id: "views-and-hud",
    iconText: "13",
    title: "Two views, one simulation",
    shortTitle: "Views & HUD",
    summary: "Chart 2D and Relief 3D read and command the same world state. Switching presentation cannot fork the simulation or turn momentary sight into permanent map knowledge.",
    keywords: ["chart", "2d", "relief", "3d", "view", "hud", "promises", "mobile", "inspector", "camera", "compass", "north", "twist", "spin", "j", "l"],
    controlIds: ["view-key", "view-button", "relief-orbit", "relief-touch-orbit", "world-zoom", "promises-sheet", "kit-button"],
    steps: [
      {
        id: "views-switch",
        audience: "all",
        title: "Switch without changing the rules",
        body: "Use the header view control to swap Chart 2D and Relief 3D. Chart is the calmer, reduced-motion-friendly map; Relief presents the same terrain as a lit height field. Both use one perception snapshot and show the same authoritative drizzle, rain, squall, and world-space wind direction. In Relief, flooded marsh and meadow keep their earthy ground material beneath a separate blue water sheet. Relief draws weather as a bounded screen-space layer so rain remains legible without filling the 3D world with particles.",
        controlId: "view-button",
      },
      {
        id: "views-perception",
        audience: "all",
        title: "The field shows what you can presently perceive",
        body: "Terrain shape reaches much farther ahead than exact detail: in clear air the broad field reaches toward fifty-two tiles through a 160-degree cone. It stays clear through thirty-four tiles, then eases across an eighteen-tile atmospheric horizon; six-tile close terrain awareness still surrounds the body. People, cargo, resources, exact water detail, names, live status, and actions use a shorter ten-tile, 100-degree field with two-tile close awareness. Substantial cover and structures can conceal those exact details without erasing the larger shoreline or ridge silhouette behind them; terrain elevation and severe weather still shorten both fields. When terrain leaves broad sight, a brief presentation-only impression eases into dim durable Chart memory—or darkness if it was never charted—instead of snapping black. Exact people, parcels, resources, labels, actions, and hit targets disappear immediately. Chart and Relief share the same impression, reduced motion settles it without a delayed fade, and none of it is saved or changes world knowledge.",
      },
      {
        id: "views-events",
        audience: "all",
        title: "Actor sounds and system causes stay separate",
        body: "A stumble, fall, or sweep puts only its small voiced sound above the courier. The floating EVENTS readout carries the complete cause and cargo consequence. It includes events you directly caused or could observe; it is not a god's-ear report of distant settlements.",
      },
      {
        id: "views-coordinates-fps",
        audience: "all",
        title: "Use coordinates and FPS for field reports",
        body: "Desktop and compact phone layouts expose the same facts without panes: terrain and biome, WATER or GROUND and known depth, effort, live stability percentage and cause, continuous E/N world coordinates, and FPS. The FPS value comes from actual active renderer callbacks rather than the simulation clock, making screenshots and performance reports easier to reproduce.",
      },
      {
        id: "views-camera",
        audience: "desktop",
        title: "Read Relief from any angle",
        body: "Hold J to spin the map left or L to spin it right; the turn is smooth and stops on release. Right-drag or Alt-drag also orbits, and the wheel zooms. A fine-pointer mouse adds only a few eased pixels of visual depth: it changes neither the world nor where a click lands. Keyboard travel remains screen-relative after the camera turns. V switches views immediately.",
        controlId: "relief-orbit",
      },
      {
        id: "views-touch-camera",
        audience: "mobile",
        title: "Twist without charting a route",
        body: "In Relief 3D, place two fingers on the world and twist to spin the map. Once the second finger lands, that touch sequence is reserved for the camera, so lifting either finger cannot accidentally set a destination. One-finger taps continue to chart travel normally.",
        controlId: "relief-touch-orbit",
      },
      {
        id: "views-compass",
        audience: "all",
        title: "The north arrow tells the truth",
        body: "The small N compass never changes the world itself. Chart stays north-up; in Relief its arrow turns with camera yaw and always points toward world north, while currents and the courier keep their actual simulation directions.",
      },
      {
        id: "views-weather",
        audience: "all",
        title: "Read rain and wind in either view",
        body: "Drizzle, rain, and squall draw a bounded precipitation field over Chart and Relief. Sparse wind threads show direction and relative strength even under a clear sky; Relief turns those threads with the camera while the compass preserves world north. These marks expose the current global weather honestly, but traveling fronts and complete cold, fire, ecology, cargo, wildlife, and human consequences are not live yet.",
      },
      {
        id: "views-mobile-strip",
        audience: "mobile",
        title: "The compact strip is the travel HUD",
        body: "Its floating overlay keeps the active PICK UP / DELIVER route plus labeled Stamina, Stability, Loom, and Cargo meters directly above the map without a card or edge shelf. The terrain line names the biome, depth, effort, and current risk; the large touch dock below supplies the contextual action, hold-to-BRACE, Scan, and Wayknot controls without keyboard-instruction clutter.",
      },
      {
        id: "views-mobile-sheets",
        audience: "mobile",
        title: "Only one sheet opens at a time",
        body: "PROMISES + opens the scrollable Promises sheet. KIT opens the safe-area PACK / MAKE / MEND dialog beside it, while ? opens this manual. KIT and the tutorial close one another; inspecting a harbor uses a separate full-size sheet, so panes do not stack across a short landscape viewport.",
        controlId: "promises-sheet",
      },
    ],
    callouts: [
      {
        id: "views-webgl-fallback",
        audience: "all",
        tone: "safety",
        title: "Chart is a complete fallback",
        body: "If WebGL is unavailable or its context is lost, the game falls back to playable Chart 2D without changing or discarding world state.",
      },
    ],
  },
  {
    id: "saves-and-quiet-hour",
    iconText: "14",
    title: "Stop safely without ending the world",
    shortTitle: "Saves",
    summary: "The perpetual world autosaves locally and never advances while closed. Quiet Hour is a voluntary recap and stopping surface, not a timer or quota.",
    keywords: ["save", "autosave", "local", "indexeddb", "offline", "quiet hour", "continue", "seed", "pause", "retry", "warning", "capacity"],
    controlIds: ["quiet-hour"],
    steps: [
      {
        id: "saves-local",
        audience: "all",
        title: "The save stays on this device",
        body: "The game maintains one local autosave, using browser storage with a fallback. It saves periodically, when the page hides or closes, when the title opens, and when Quiet Hour begins. Outer save version 7 preserves the partial movement interval introduced by version 5 plus the first living web's dog, porter response, physical provisions, player requests, memory, and promotion. Supported versions 1 through 6 migrate deterministically without inventing a companion or duplicating food.",
      },
      {
        id: "saves-no-offline-time",
        audience: "all",
        title: "Nothing advances behind your back; return is automatic",
        body: "Closing the page or desktop app does not simulate offline time. When a valid local save exists, the next launch enters that same estuary automatically with its exact world position, inventory, seed, and history. Compatible older finite saves keep their original estuary intact inside the continuous world under A CHALLENGING HARD, preserve their contents, and gain the exact 18.000 combined-capacity floor.",
      },
      {
        id: "saves-visible-failure",
        audience: "all",
        title: "Keep the window open when storage needs another try",
        body: "If every local-storage path rejects an ordinary write, LOCAL SAVE NOT STORED remains visible on the field and whichever top-layer surface is active: title, Quiet Hour, KIT, tutorial, or Patch Notes. The current estuary then exists only in this open window. Tideweft retries automatically with bounded backoff, and every retry takes a fresh snapshot so changes made after the failure are included. Only a durable write of the latest requested snapshot clears the persistent warning and announces LOCAL SAVE RESTORED.",
      },
      {
        id: "saves-damaged-or-forked-copy",
        audience: "all",
        title: "A damaged or forked save is never guessed",
        body: "If a local session is unreadable, or two different copies claim the same save version, Tideweft enters neither one. A visible title warning identifies UNREADABLE or CONFLICT, Continue and the ordinary restart phrase stay hidden, and a non-empty seed phrase is required to create a safe higher-version replacement. A blank phrase changes nothing, and the warning stays visible until that replacement is durable. If either configured storage backend cannot be read, Tideweft cannot safely prove which copy—or absence—is authoritative: LOCAL SAVE UNAVAILABLE disables Continue, seed creation, and restart; this window performs no write, and you should reload when both stores are available. If another tab owns a different or newer durable copy, this window likewise blocks writes and asks you to reload instead of retrying over it. In the deliberately extreme case where both replacement counters are already at their largest safe value, the title refuses to wrap them and tells you to clear Tideweft's stored site data before beginning again.",
      },
      {
        id: "saves-hard-restart",
        audience: "all",
        title: "One ruleset; restarting takes two deliberate steps",
        body: "There is no difficulty selector. The first-launch title stays deliberately quiet—TIDEWEFT, Seed phrase, START, and PATCH NOTES—over a deterministic tide field. Its short opening crescendo waits for your first tap or key because browsers do not permit unsolicited sound, and it plays only once for that genuine opening. This manual records the single A CHALLENGING HARD rules contract. To replace a healthy save, open the title through Quiet Hour, type restartrestartrestart exactly in Begin again, then choose Unlock restart. This only unlocks the seed field; it does not touch storage. Touch-keyboard blur and ordinary field refreshes keep that temporary step intact, while closing the title cancels it. START with a non-empty new seed phrase replaces the world once. A wrong phrase or repeated tap changes nothing. A blank seed changes nothing.",
      },
      {
        id: "saves-quiet-hour",
        audience: "all",
        title: "Take Quiet Hour whenever you choose",
        body: "Quiet Hour saves and summarizes time, distance, deliveries, strands, reports, discoveries, and causal changes. Choose “One more tide” to continue or “Rest here” to return to the title.",
        controlId: "quiet-hour",
      },
      {
        id: "saves-no-hold-tide",
        audience: "all",
        title: "The tide cannot be held",
        body: "There is no player power to pause, hold, or release the tide during play. Use Quiet Hour or return to the title when you need a safe stopping point.",
      },
    ],
    callouts: [
      {
        id: "saves-browser-data",
        audience: "all",
        tone: "safety",
        title: "Local means local",
        body: "Clearing this site's browser data can remove the autosave. The current game does not upload worlds to an account or run a cloud backend.",
      },
    ],
  },
  {
    id: "accessibility",
    iconText: "15",
    title: "The estuary should explain itself",
    shortTitle: "Accessibility",
    summary: "Actions, hazards, availability, and progress use words and structure in addition to color, with keyboard, touch, reduced-motion, and assistive announcements supported.",
    keywords: ["accessibility", "keyboard", "touch", "screen reader", "reduced motion", "focus", "tutorial", "color"],
    controlIds: ["tutorial-key", "tutorial-button", "promises-sheet", "kit-button", "view-button"],
    steps: [
      {
        id: "accessibility-open-desktop",
        audience: "desktop",
        title: "Open the manual from anywhere",
        body: "Press T outside a text field to open this tutorial. Use its Previous, Next, topic navigation, and Close controls with pointer or keyboard; focus returns to play when it closes.",
        controlId: "tutorial-key",
      },
      {
        id: "accessibility-open-mobile",
        audience: "mobile",
        title: "Use the dedicated Tutorial control",
        body: "Open the same field manual from the mobile ? button. It uses the safe viewport, scrolls independently, and keeps page controls large enough for touch.",
        controlId: "tutorial-button",
      },
      {
        id: "accessibility-kit-mobile",
        audience: "mobile",
        title: "KIT fits the safe viewport",
        body: "The 44-pixel KIT control sits beside PROMISES. Its tabs and actions remain at least 44 pixels tall, PACK / MAKE / MEND scroll independently beneath a fixed summary, and closing returns focus to the trigger.",
        controlId: "kit-button",
      },
      {
        id: "accessibility-not-color-only",
        audience: "all",
        title: "Important state is not color-only",
        body: "Meters have labels; stability names its trend and cause; actions use native disabled state and explanations; currents use arrows; Wayknots and Harps use names, counts, marks, and line patterns.",
      },
      {
        id: "accessibility-motion",
        audience: "all",
        title: "Reduced motion is honored",
        body: "A reduced-motion preference freezes decorative title animation, wind and rain motion, pointer parallax, and delayed label travel, and starts new users in Chart 2D unless they deliberately chose Relief before. Touch and coarse-pointer play also keeps the camera steady. The view control and truthful static weather marks remain available.",
      },
      {
        id: "accessibility-announcements",
        audience: "all",
        title: "Consequences are announced",
        body: "Live status announcements describe successful pickup, delivery, sounding, field work, weathered cargo, recovery, and rejected actions. EVENTS presents the latest witnessed or player-caused consequence without exposing distant activity, while the durable simulation keeps its full causal history.",
      },
    ],
    callouts: [
      {
        id: "accessibility-focus-canvas",
        audience: "desktop",
        tone: "note",
        title: "Canvas focus for movement",
        body: "Click the world before using travel keys. DOM buttons, Promise cards, dialogs, and scrollable lists remain ordinary focusable controls.",
      },
    ],
  },
  {
    id: "build-boundaries",
    iconText: "16",
    title: "What is live, and what comes next",
    shortTitle: "Build status",
    summary: "The field manual describes only mechanics that affect this build. Requested simulation phases are listed plainly so absence never feels like a secret rule.",
    keywords: ["planned", "roadmap", "biome", "foraging", "crafting", "durability", "weather", "magic water", "cargo physics", "ladder", "upgrade"],
    controlIds: [],
    steps: [
      {
        id: "boundaries-live-weather",
        audience: "all",
        title: "Live now",
        body: "One continuous deterministic world, a bounded moving presentation frame, exact negative coordinates, seamless player and parcel travel beyond the old map extent, seven visual biomes, the original estuary's deterministic field resources, one-unit gathering, exact combined inventory load, component and gear recipes, durable condition, mending and dismantling, authoritative Marsh wraps, Float sash, Ridge cleats and Weather cape effects, persistent Wayknots, tides, global weather, downward screen-space Relief rain, deterministic local river strength and turbulence, ordinary surface streamlines and scan-only analytical arrows, direct terrain-responsive stability percentage, separate broad-terrain and short-detail perception fog, a brief terrain-only visual memory shared by Chart and Relief, transient uncharted sight, dim explored memory, observation-safe EVENTS, cross-layout HUD facts, discovery, depth sounding, player-controlled ADRIFT recovery, promises, reports, routes, projects, and persistent identities, weather condition, restrained emotion cues, greetings, ABOUT inspection, occluded sight, anonymous directional hearing, bounded attention/suspicion, and last-known-area searching for the original harbor country's 42 humans are active. One generated independent dog now adds physical movement, food scent, rain/cold condition, knowledge-honest ABOUT, five player choices, exact one-unit provision transfer, bounded memory, and promotion beside one existing porter. The outer game save uses version 7; embedded simulation snapshots remain perception-aware format 4 and rules 6. Perpetual play remains active.",
      },
      {
        id: "boundaries-planned-ecology",
        audience: "all",
        title: "Broader ecology is planned",
        body: "The seven named biomes and their rainfall, heat, salinity, exposure, and magical-water signals are visible now, and current rain affects the first dog's condition and food-scent web. A full animal roster, distant populations, reproduction, predator-prey chains, companions, courier exposure, and material-specific magical-water reactions remain planned; those systems do not alter a delivery behind the HUD's back.",
      },
      {
        id: "boundaries-planned-physics",
        audience: "all",
        title: "Planned traversal and economy phase",
        body: "Physical loose cargo, terrain-driven stumbles and falls, continuous current drift, grade tumble, impact damage, distance-safe custody, and recovery are live. Ladder-gated formations, living mangrove or bramble catches, the remaining crafted-gear and locker bridges, trust-money rewards, and an anywhere upgrade system are planned and are not currently available actions.",
      },
    ],
    callouts: [
      {
        id: "boundaries-causal-promise",
        audience: "all",
        tone: "boundary",
        title: "If the game changes a meter, it should say why",
        body: "Current penalties are exposed through the HUD, objective, action hint, announcement, or chronicle. Future material and weather systems should follow the same causal rule before they become live.",
      },
    ],
  },
] as const satisfies readonly TutorialGuideSection[];

export const TUTORIAL_CONTENT_VERSION = 21 as const;

export const TIDEWEFT_TUTORIAL_GUIDE: TutorialGuide = {
  version: TUTORIAL_CONTENT_VERSION,
  title: "TIDEWEFT FIELD MANUAL",
  subtitle: "Promises, currents, and the paths that learn",
  sections: TUTORIAL_GUIDE_SECTIONS,
  controls: TUTORIAL_CONTROLS,
  plannedMechanics: TUTORIAL_PLANNED_MECHANICS,
};

/** Exact stable-ID lookup for topic navigation and deep links. */
export function tutorialSectionById(id: string): TutorialGuideSection | undefined {
  return TUTORIAL_GUIDE_SECTIONS.find((section) => section.id === id);
}

/** Exact stable-ID lookup for a rendered control reference. */
export function tutorialControlById(id: string): TutorialControl | undefined {
  return TUTORIAL_CONTROLS.find((control) => control.id === id);
}

/** Controls relevant to one layout, retaining their authoritative order. */
export function tutorialControlsForAudience(
  audience: Exclude<TutorialAudience, "all">,
): readonly TutorialControl[] {
  return TUTORIAL_CONTROLS.filter(
    (control) => control.audience === "all" || control.audience === audience,
  );
}

/**
 * Returns audience-filtered copies while preserving section/page order. A
 * common step is included in both layouts; desktop-only guidance never leaks
 * into the mobile manual and vice versa.
 */
export function tutorialSectionsForAudience(
  audience: Exclude<TutorialAudience, "all">,
): readonly TutorialGuideSection[] {
  return TUTORIAL_GUIDE_SECTIONS.map((section) => ({
    ...section,
    controlIds: section.controlIds.filter((id) => {
      const control = tutorialControlById(id);
      return control?.audience === "all" || control?.audience === audience;
    }),
    steps: section.steps.filter(
      (step) => step.audience === "all" || step.audience === audience,
    ),
    callouts: section.callouts.filter(
      (callout) => callout.audience === "all" || callout.audience === audience,
    ),
  }));
}

/**
 * Small deterministic search used by a topic index or command palette. Empty
 * search returns the full ordered manual; results never reorder between calls.
 */
export function searchTutorialGuide(
  query: string,
  audience?: Exclude<TutorialAudience, "all">,
): readonly TutorialGuideSection[] {
  const sections = audience
    ? tutorialSectionsForAudience(audience)
    : TUTORIAL_GUIDE_SECTIONS;
  const needle = normalizeSearchText(query);
  if (!needle) return sections;
  return sections.filter((section) => normalizeSearchText([
    section.id,
    section.title,
    section.shortTitle,
    section.summary,
    ...section.keywords,
    ...section.steps.flatMap((step) => [step.title, step.body]),
    ...section.callouts.flatMap((callout) => [callout.title, callout.body]),
    ...section.controlIds.flatMap((id) => {
      const control = tutorialControlById(id);
      return control ? [control.input, control.action, control.detail ?? ""] : [];
    }),
  ].join(" ")).includes(needle));
}

/** One-based position for visible page counters; unknown IDs return zero. */
export function tutorialPageNumber(id: string): number {
  const index = TUTORIAL_GUIDE_SECTIONS.findIndex((section) => section.id === id);
  return index < 0 ? 0 : index + 1;
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[-–—_/]+/gu, " ")
    .replace(/\s+/gu, " ");
}
