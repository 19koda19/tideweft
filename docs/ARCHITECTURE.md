# Architecture decision record

## Decision

TIDEWEFT has one browser-pure game and two launch targets. Vite builds the same HTML, TypeScript, CSS, static manifest, SVG icon, and p5.js renderer for GitHub Pages and for a thin Electron shell. Electron does not host a second rules engine.

```text
keyboard / pointer / touch / DOM commands
              │
              ▼
100 ms player host ── every 10 steps ──> deterministic world tick
              │                               │
              │                               ├── events / chronicle
              │                               ├── active route graph
              │                               └── versioned world snapshot
              ▼
immutable render + UI projections ──> p5 Chart 2D or Relief 3D / accessible DOM / Web Audio

local-first IndexedDB (sticky localStorage fallback)
    └── game-session envelope ──> checksummed simulation envelope
```

## Boundaries

- `src/sim`: authoritative deterministic world, active graph, rules, invariants, views, and serialization. It imports no DOM, p5, Electron, Node, wall clock, or browser persistence.
- `src/game`: fixed-step host, player travel, command scheduling, session flow, save orchestration, onboarding, and presentation projections.
- `src/render`: two swappable p5 instance-mode presentations, cameras, world hit-testing, a pure chunked height-mesh builder, and shared renderer commands. Only the active Chart 2D or Relief 3D canvas loops or accepts input.
- `src/ui`: accessible DOM panels, controls, and a data-driven versioned field manual. It reads a view and emits typed commands; tutorial position and small-screen disclosure/sheet state are local presentation state rather than authoritative or saved state.
- `src/audio`: procedural Web Audio feedback. It unlocks only after player interaction.
- `src/platform`: browser save repositories plus export/import validation.
- `electron`: hardened local protocol, desktop lifecycle, Forge packaging, and production smoke mode. There is no preload or renderer Node API.

## Cross-system inheritance and bounded work

[`SYSTEM_INHERITANCE.md`](SYSTEM_INHERITANCE.md) is the canonical
applicability index for durable cross-system contracts. A substantial new
actor, species, role, item, vehicle, material, place, interaction, or mechanic
must join every applicable existing owner rather than creating a parallel
feature-specific ruleset. The registry identifies the contract and routes to
durable public owner summaries; repository guidance still requires every
applicable canonical domain owner. It does not replace that owner's detail or
implementation evidence. Its directive family list is a current roadmap
snapshot, not a claim that the roadmap ends there.

[`SYSTEM_COMPOSITION.md`](SYSTEM_COMPOSITION.md) is the complementary canonical
producer/consumer registry. It distinguishes documented intent, data, runtime
foundation, live gameplay, and genuinely composed loops; records dead ends and
magic-input bypasses; and assigns unresolved bridges to current canonical and
future execution owners. New architecture must both inherit applicable
contracts and exchange meaningful causes or consequences with the world where
the fiction requires it. Completed directives remain read-only execution
history; composition findings update current canonical truth instead.

Three performance responsibilities remain distinct and cumulative:

- **Early performance / scalability — The Breathing Room** establishes safe
  implementation habits and restores development headroom: fixed-step
  authority independent of rendering, bounded spatial candidates, elimination
  of full-world and hidden N-squared hot paths, deterministic cadence classes,
  explicit cache invalidation, bounded materialization, offscreen UI/render
  cleanup, sparse persistence, and release of unloaded-region resources.
- **Per-directive performance regression** is the permanent lightweight gate:
  every major directive runs representative checks before transition. Healthy
  work continues; a material regression is profiled, repaired at its measured
  owner, and retested. A major new simulation, rendering, actor, physics,
  world, or interaction domain receives a deeper review.
- **Whole-game performance / scale — The Lean World** deepens profiling,
  full/near/coarse/archive fidelity, rendering LOD, streaming, camera and zoom
  discipline, save and memory growth, mobile budgets, and long-session
  stability as the mature world expands. Its final certification profiles the
  actual workload-producing expansions, including Far Settlements; only a
  measured missing scale prerequisite should run before that workload. This is
  a responsibility boundary, not an assertion that no later directive may
  exist.

Future systems inherit these contracts where applicable. Expensive reasoning
should be event-driven or deterministically cadence-bounded when that preserves
the same authority. Candidate work must be spatially bounded; static geometry
and unchanged UI must not be rebuilt every frame; pathfinding and immutable
derived facts may be reused only behind explicit invalidation; distant actors
may retain coarse truth without full local materialization; saves persist
deviations and promoted identity rather than the generated universe. Profiling
evidence should select meaningful optimization work. Cross-system integration
must also remain computationally composed: use bounded event fan-out, spatial
candidates, shared derived-state owners, exact cache invalidation, and bounded
presentation rather than actor-to-actor broadcast, duplicated computation, or
unbounded queues.

Optimization may reduce frequency, presentation detail, animation detail,
particle detail, or distant fidelity. It may not silently alter deterministic
outcomes, knowledge, ownership, ecology, relationships, difficulty, physical
conservation, or save truth. Camera visibility is not simulation activation.
The governing rule is: **reduce work, not truth; simulate what matters now and
preserve what matters later.**

### Alpha 60 Breathing Room boundary

The current **LIVE_VERIFIED** Alpha 60 release completes the early-performance
architecture without creating a second simulation owner. Exact bounded
same-stack receipts may reuse already-authenticated regional-ecology lineage,
canonical encodings, immutable projections, and stable presentation work only
when identity, order, authority, and size all match. Clone, reload, stale,
foreign, partial, oversized, or failed inputs take the complete canonical
validation and serialization path.

Relief terrain submission, passive resource halos, actor/ecology projection,
regional habitat preparation, traversal queries, and stable HUD presentation
avoid repeated unchanged work while retaining the same deterministic outcomes,
physical custody, biodiversity, knowledge, difficulty, and save bytes. Every
packaged scenario binds exact trusted-input, viewport, zoom, and lifecycle
guards. Separate browser, resource, and cold-persistence witnesses bind their
own exact executable and workload evidence. Those diagnostics remain
developer-only and never enter simulation or saves.

Representative dense Relief and browser measurements on the primary
development machine occupy the preferred 45–60 FPS band instead of the former
sustained 4–8 FPS failure state. This is host- and scene-specific evidence, not
universal 60 FPS or low-power certification. A once-per-world-update hitch is
still visible in worst-frame gaps and remains an explicit limitation. Exact
source, executable, and pushed commit
`c78977ba9733dbb17a1f2461a0a94c5dcdfc1fd0` passed the local 312-file / 3,009-
test cumulative gate and packaged closure evidence. CI run `36442886220` and
Pages run `36442886243` succeeded, and the cache-bypassed comparison matched all
5/5 deployed production files in the exact 4,377,380-byte tested web artifact.
The runtime-only packaged ASAR contains 10 entries totalling 4,599,453 bytes.
Outer save v32, simulation v4, `RegionalEcologyStateV6`, wildlife actor v1, and
gameplay contract 51 remain unchanged; Field Manual 70 records this release
boundary. Directive 04_1B **The Breathing Room** is closed, and 04_2 **The
Living Voice** is active. The standing per-directive performance-regression
gate applies to its transition and later gameplay work; Breathing Room remains
completed history and Lean World retains its separate mature-scale role.

### Living Voice: situated-expression foundation

The current unpublished Directive 04_2 source begins with one event-driven
situated-expression owner. A player traversal adapter can submit a committed
stumble, near-fall, important-cargo impact, physical parcel separation, or
causally proven recovery. A separate effort adapter may submit one restrained
self-felt murmur only when an accepted dry-ground movement step commits
positive stamina exactly to zero. Idle and recovery steps, water or rescue,
already-zero stamina, and a same-step traversal incident fail closed. The
accepted event uses the same source-bound channel, acoustic sample, self
receipt, and presentation arbitration as other situated expression. The first
porter-work adapter can submit one
resident porter's committed departure only after the simulation proves that
the same persistent human physically took custody of a heavy Promise load and
entered the contract route. Light cargo, attempted work, and old ledger events
remain silent; a porter line also requires the player to both lawfully hear it
and directly see its source at event time. The kernel applies bounded
salience, priority, interruption, family cooldown, and recent-trigger rules;
silence is an explicit valid result. Authored wording is selected
deterministically from actor ID, causal event ID, presentation seed, and catalog
version. Rendering frequency, wall time, and global RNG cannot select or expire
a line.

#### Audited implementation frontier

The shared schema is deliberately broader than the current set of producers.
In the unpublished candidate, receipt-backed player reactions, the porter
heavy-load departure, keeper response, resident introduction and weather hold,
one human danger warning, three guardian-dog signals, fish-crow and deer calls,
one gull alarm cry, one elk alarm bark, one wild-boar alarm grunt, one domestic-
chicken alarm squawk, one American-black-duck alarm quack, one domestic-goat
alarm bleat, the rabbit thump,
the aggregate frog chorus, and one aggregate brown-rat
physical rustle are live representative paths. One domestic-cat representative
is also live: a freshly committed rain-caused retreat with matching rain
observation and event-owned wet-track evidence may create one restrained,
noninterrupting distress call through the shared Voice path. One marsh-fox
representative is live as well: only a freshly entered ecology-owned pursuit
backed by the fox's current identified live-prey observation, matching resource,
memory, living target, and committed post-locomotion body address may create one
restrained yip. A visible authenticated fox remains source-associated; a heard-
unseen call remains an anonymous animal call and never exposes the prey or the
fox's private pursuit cause.
The former direct-detail resident state-line adapter has been retired. Ongoing
suspicion, posture, observable exposure, contract, and selected-resident state
remain legible through non-acoustic quick labels, emotion marks, condition
labels, and ABOUT; projection cadence or selection can no longer manufacture
an utterance. Hunger remains authoritative but deliberately gains no inferred
utterance or hidden-need UI until an honest observable or expressive owner
exists. A freshly committed gull alarm now enters the authenticated species-
aware Voice path; visible receipt may identify the gull while heard-unseen
presentation remains an anonymous bird call. A freshly committed elk alarm now
uses that same path; visible receipt may identify the elk and its bark, while
heard-unseen presentation remains an anonymous animal call. Elk bugling remains
synthesis foundation only. A freshly committed wild-boar alarm joins that same
source-bound path and reuses the existing grunt synthesis; visible receipt may
identify the boar and its grunt, while unseen hearing remains an anonymous
animal call. Boar squealing and routine social grunts remain foundation-only.
The generated settlement-home flock now supplies one narrow chicken alarm
through those same source, cause, group, memory and committed-locus owners.
Its small-prey policy remains a restrained murmur: loudness420,000,
priority160,000 and interruption `none`. A heard-visible authenticated chicken
may carry `SQUAWK.`; heard-unseen presentation remains an anonymous bird call
(`CALL.`), never chicken identity or threat detail. Humans receive anonymous
`animal-call`, not decoded alarm intent. It does not interrupt WAIT or REST,
and an already sleeping player receives no new quiet-call hearing or playback,
including after current-save reload and cancellation. Clucking, crowing and
routine flock conversation are not live.
One existing regional-habitat American black duck now supplies a narrow alarm
quack through the same authenticated source, observation, memory and committed
locus path. It retains the small-prey murmur policy: loudness420,000,
priority160,000 and interruption `none`. Visible receipt may identify the duck
and carry `QUACK.`; unseen hearing remains anonymous bird `CALL.`, and humans
receive anonymous `animal-call` rather than the private alarm cause. Ordinary
WAIT/REST controls, exact current-save restore, no replay, refused optional
caption admission and next-interval human hearing are tested. The fixture uses
a real generated duck near the existing dog on unchanged terrain, with normal
proximity admission; it is not a traversal or broad duck-repertoire proof.
Optional expression capacity may suppress text but cannot suppress lawful
committed alarm audio, applicable interruption, or the ecology-owned hearing
leg. Refused optional chicken or duck admission still preserves each real alarm's
audio and next-interval anonymous human hearing, without duplicate receipts.
The existing finite settlement-home goat herd now supplies one narrow alarm
bleat through those same authenticated source, group, observation, memory and
committed-locus owners. Its existing strong policy remains loudness1,000,000
and explicit interruption `strong`, rather than inheriting the chicken/duck
murmur. A heard-visible authenticated goat may carry `MAAA!`; heard-unseen
receipt remains an anonymous animal `CALL!`, and human hearing receives
`animal-call`, not the hidden threat or decoded alarm intent. The representative
runtime fixture stages the existing herd and a genuinely generated signed-
region brown bear on unchanged safe terrain. Ordinary perception must supply
the real threat belief; there is no injected alarm or fabricated population.
WAIT/REST interruption, exact current authoritative-state restore without cue
replay, forged-species rejection without overwrite, and threat-removal are
tested. The human-hearing scene additionally stages one existing resident on
an actual generated route near the same conserved herd. Its next-interval
anonymous receipt remains exact even when optional caption admission is refused.
The existing eight-slot physical-hearing seam now re-derives anonymous core
calls from the authenticated ecology event when no admitted expression owns
them; a selected fallback replaces, rather than duplicates, the porter's raw
leg. Rabbit keeps its established physical sample identity, chicken/duck remain
noninterrupting, and the goat's strong flag survives semantic conversion.
Strong core `animal-alarm` events also enter that bounded human-hearing owner
when no admitted expression owns them. A transient
`UnadmittedAlarmSoundSample` retains the actual committed domain event and
source, not a forged expression identity. Existing core propagation first
authenticates the actor/species, alarm intent and memory, event timing and
retained physical locus. Unlike protected Voice expression admission, lawful
hearing does not require a new same-tick threat sighting: core cognition may
alarm from a still-valid remembered threat. The transient carrier shares the
physical budget of eight; admitted supplemental sounds retain their separate
eight-slot budget and each resident retains the 48-observation ceiling.
Priority/event-ID selection is deterministic, selected-only porter deduplication
leaves the player/dog/wildlife core legs intact, and no source identity, cause,
or domain-event identifier enters anonymous listener knowledge. The sample is
not serialized; current domain state re-derives its one pending interval, while
consumed listener beliefs persist without replay. Representative boar optional-
refusal and remembered-threat deer fixtures use controlled legacy-cohort
adoption into current47; they are not fresh-native travel proofs.
This is controlled encounter evidence, not proof of an ordinary travel encounter,
goat-specific sleeping runtime behavior, handling, hunting, broad repertoire,
or new harmful bear behavior. Reload deliberately restarts session recap/UI
metadata; it does not reset authoritative world or acoustic carry state.
All nine current core alarm-source profiles now have shared Voice adapters,
but not every lawful domain alarm qualifies for a fresh Voice expression.
Heard remembered-threat alarms lacking fresh expression authority now adapt
their actual domain event into the shared acoustic presenter, without creating
a fresh Voice admission. Core propagation retains its exact transient
`AudibleContact`; the adapter does not reconstruct direction from an anonymous
observation area or rerun a different acoustic evaluator. One event-ID-ordered
representative of the already-heard unclaimed alarms receives an anonymous
`animal-alarm` vocal event and heard-unseen receipt, even if some source ground
is visible. Its restrained `call` caption can disclose only the heard direction,
never caller, species, threat, or an exact floating anchor. It joins the existing
eight-entry queue and source/repetition cooldown; critical human warnings retain
priority over it. The old `ANIMAL ALARM` session announcement is retired.

Fresh and retained core alarm propagation use the same listener-local
`ambientNoiseAt` owner as other acoustic consumers. Each authenticated
listener's registered terrain tile selects the bounded 5×5 rain/turbulent-water
mask; water beside only a distant caller is not the listener's masking field.
Species sensitivity, wind, source exclusion, event-time locus and anonymous
uncertainty remain independent inputs. Exact contacts stay transient; retained
beliefs preserve their historical confidence rather than being re-heard on
load. A pending next-interval alarm is re-derived from its existing actor
memory/locus and evaluated against the current physical field, including after
interruption. Optional captions cannot bypass this hearing result.

The collapsed player audio remains exactly one existing `wildlife-alarm` cue
at its prior release-order position, volume, variant and undefined pan, released
only after interval closure. Text refusal cannot remove that audio, strong
interruption, or the separate bounded ordinary-human/ecology hearing leg.
The new presentation class is permitted only for animal vocal semantics;
`PhysicalSoundSample` still rejects it because strong unadmitted alarms retain
their separately authenticated hearing carrier. The caption/receipt is ephemeral,
not a new save field or saved expression. A controlled remembered-deer fixture
also produces a real higher-priority human warning: the warning wins with or
without optional alarm text. Late-failure rollback and silent current47/carry14
restore preserve the authoritative roots. This is not ordinary native travel,
literal crowd saturation, a species repertoire expansion, or permission to
relax protected expression freshness.
Future alarm sources still require an explicit source-authenticated adapter.
The narrow gull, elk, boar, chicken, duck, goat, cat, and fox representatives do not
prove broad species repertoires, general hunting communication, or broad animal
Voice.

Tool/material, violence, and vehicle acoustic domains are reusable contract
vocabulary. Synthetic saw, impact, and hull fixtures validate that vocabulary;
they do not establish production actions. General NPC conversation and rumors,
multilingual comprehension, authored visual gesture, broad communicative
silence, most species repertoires, and future work/economy/violence/vessel
expressions remain `SPECIFIED` or `DEFERRED` to their real owners. A catalog
entry, schema field, semantic pool, or passing fixture is never by itself a
live producer.

The first migrated legacy interaction seam consumes the exact committed
starting-store closure. An immediate in-person player report, its retained
evidence, the unique store/keeper identity, and the applied closure transaction
authorize one restrained keeper response through the same expression channel,
vocal sample, audio, caption, and shared world-label path. The recorded
event-time player pose must still reproduce a lawful direct-visible,
conversation-range hearing outcome; a masked response remains world sound
without player presentation. A nearby human who lawfully hears that exact
authenticated line with sufficient confidence receives one anonymous
`store-secured-report` belief at an uncertain heard area; weaker but audible
receipt remains ordinary `human-vocalization`. The listener learns no keeper
identity, exact hidden source, stock quantity, rat detail, or player identity.
This transient meaning candidate is re-derived from the existing committed
expression/admission/sample trajectory, so current save/reload can finish the
pending receipt once without persisting a parallel conversation queue or
replaying audio. Already-secured historical state cannot synthesize retroactive
speech or knowledge.

The ordinary first-greeting seam now follows the same law. One exact retained
`resident-introduced` event, accepted `GREET` command, persistent human body,
home membership, acquaintance tick, fact grant, and `met-player` memory
authorize the response as one transaction. While `GREET` is pending, ordinary
manual and automatic travel are held at the interaction boundary. At the next
world boundary the runtime advances a disposable simulation candidate, derives
direct sight, conversation range, weather-masked hearing, channel capacity,
admission, and sound-sample authority from that candidate's exact event, and
adopts its acquaintance facts only when the complete heard-visible trajectory
can commit. A masked, displaced, or capacity-refused candidate is discarded;
the real world advances without `GREET`, and the resident remains recognized.
The committed introduction also captures its exact event-time route locus or
settlement plus stable presentation ordinal. Retained text therefore remains
at the place where the sound happened even if the resident begins travelling
before its configured lifetime ends. The durable acoustic event carries no name,
occupation, home name, or English sentence; the player-facing line is resolved
from those reauthenticated facts only at projection. Its recorded phase-zero
listener pose must equal the independent perception-carry anchor and replay
direct sight, conversation range, and positive hearing certainty. Nearby
humans receive only anonymous `human-vocalization`, and an already acquainted
resident never gains retroactive introduction speech. The one admitted sound
crosses NPC hearing once; a bounded ephemeral presentation lease may retain its
configured readable lifetime after that hearing interval closes without
replaying audio or cognition. The label itself is not saved. If current-schema
save/load interrupts the lease behind newer same-source speech, runtime
deterministically re-derives only its unexpired, audio-acknowledged presentation
remainder from the authenticated event, semantic memory, admission, and
event-time reception already in perception carry.

The first event-owned resident condition seam consumes one exact committed
`resident-sheltered` transition. One restrained weather-hold utterance is
eligible only while the same persistent human, active resident-carried
in-transit contract, conserved cargo, severe-weather event and
`weather-shelter` memory, and event-time route/progress locus reauthenticate.
The retained event position remains where the hold began if the resident later
moves. Continuing `condition.sheltering` is not a speech trigger. Event-time
hearing may yield a visible receipt, an anonymous heard-unseen receipt, or no
player receipt under masking or sleep; all three preserve the source-bound
world sound and its one bounded nearby-human hearing opportunity. Perception
carry retains the phase-zero listener pose and sleeping bit independently of
later recovery state, so save/load validates the historical receipt without
replaying audio or text.

Expression ownership is now isolated by source actor in a deterministically
ordered bank capped at sixteen retained channels. One source actor's active line
or cooldown cannot suppress another's. The accessible caption surface selects
one highest-priority local cue at a time, while Chart and Relief use the shared
bounded acoustic layout described below: at most four labels globally and one
per source. Adding actor authority therefore does not create an overhead-text
wall. Every projected exact line
also requires a canonical reception receipt, persisted with pending carry:
`self` for the courier, or
`heard-visible` for a non-player source that passed the shared event-time
hearing model and direct visual disclosure. An unseen non-player call may use
`heard-unseen`, which retains only quantized acoustic bearing, uncertainty,
distance bands, and certainty; it carries no exact source position or disclosed
identity. A non-player world expression may also have no player receipt at all.
That absence suppresses only player presentation, never the authoritative
world sound or lawful NPC hearing. A receipt does not contain hidden identity,
prose, or a second position.

Only committed physical facts cross the traversal adapter. A fall cannot call
itself a near-fall, an attempted pickup cannot claim recovery, and cargo speech
cannot reveal contents that the speaker did not just handle or observe. Chart
and Relief project the same short actor-situated callout from a segmented world
position while the accessible DOM projects the same speaker, wording, tone,
and assertiveness. Physical incident cause and consequence remain separate in
the observed EVENTS chronicle instead of being disguised as speech above the
actor. Completed falls and sweeps still publish concise direct system guidance
through the ordinary announcement/live-region path, so separating actor voice
from system text does not make physical danger audio-only.

Each accepted expression emits at most one brief synthetic vocal contour.
Eligible nearby humans may receive it through a separately bounded hearing-only sound
sidecar: it has an authenticated source actor, source position, range,
loudness, and interruption strength but no visual salience or sighting ordinal.
The source actor never anonymously hears their own sample; other humans may hear
an anonymous directional acoustic fact rather than gaining speaker identity.
Speech therefore cannot manufacture or replace a visual observation. The
existing fixed-step player-sense carry remains one base sample per completed
player step.

#### Embodied acoustic event and receipt pipeline

Directive 04_2 establishes the durable acoustic boundary for physical as well
as vocal sound. The domain that commits an action owns why it happened and the
facts it may disclose: traversal owns a slip, cargo owns a load shift, ecology
owns animal behavior, gear owns service wear, and future material, violence,
and vessel domains own their corresponding contacts. Those domains emit or
adapt one source-bound acoustic event with stable identity, event-time segmented
position, semantic action/source family, bounded intensity/reach/duration,
material and surface classes where relevant, and a repetition key. Producer
adapters may use bounded body classes to derive those event semantics without
retaining unnecessary anatomy on the shared event. The acoustic layer propagates
that event through the current environment and derives listener-specific
receipts. Living Voice owns vocal semantics and the restrained optional textual
expression of both vocal and embodied sounds; it does not take over the causal
domains.

World event, listener receipt, and presentation label are separate records.
Exact source identity and position enter a player-facing world anchor only
through authenticated heard-and-visible receipt or the player's authenticated
direct physical contact with the sounding object. Heard-unseen receipt retains
only lawful direction, distance, certainty, and uncertainty bands; it can feed
a vague caption or edge/lane cue but never a hidden actor anchor. Unheard or
fully masked events have no player presentation. Presentation suppression,
coalescing, or accessibility settings cannot erase the event, change NPC
hearing, or alter audio timing. Other actors receive only the acoustic fact
their own perception admitted, so a `thud` behind a wall cannot disclose who
dropped which object.

The current unpublished candidate also brings the ecology-owned southern-
leopard-frog rain chorus through this boundary. On each qualifying 24-tick
cadence, a conserved aggregate whose committed activity is an active
`rain-chorus` derives one anonymous `animal-call` world event—not one event per
frog or per anchor. The largest occupied population anchor is its current
representative, with lowest stable ordinal breaking a tie; stable opaque source
and repetition identities belong to the aggregate while each cadence occurrence
retains distinct event identity. This does not materialize a frog actor, expose
the aggregate ID or hidden count, or turn the representative position into
listener knowledge. Chorus interruption is explicitly `none` even at high
intensity; loudness does not silently promote ambience into an alarm.

That same event becomes one validated shared sound-sample candidate for eligible
nearby humans and full-simulation in-window dogs. Admission remains subject to
the shared eight-sample input budget and ordinary source priority; simultaneous
contact may leave a chorus unoffered rather than exceed the bound. An admitted
sample uses the ordinary physical-acoustic evaluator, listener-local rain/water
masking, wind-shaped range and uncertainty, source exclusion, and species
hearing sensitivity rather than a chorus-only perception rule. A lawful player
receipt releases stereo audio after the authoritative step commits and enters
the shared Living Voice
caption arbitration as a restrained anonymous **chorus** with only the coarse
direction supported by the heard contact. Because an aggregate has no
addressable visible actor, it receives no fabricated Chart/Relief world anchor.
The chorus no longer enters the legacy ecology session announcement or an
independent direct-sound presentation path. Candidate/sample banks remain
bounded; each selected lawful cue retains its audio and listener receipt while
the shared presenter may suppress or arbitrate optional simultaneous text.
Presentation capacity cannot erase the event or already-admitted actor hearing.
Player audio, caption, and their presentation receipt are not serialized and do
not replay on load. The existing next-interval actor-hearing boundary may receive
an admitted cadence sample only by deterministic re-derivation from the current
ecology patch, never by restoring a hidden event or playback queue. A later
cadence likewise produces a new event only from current ecology state.

The same aggregate boundary now consumes one existing brown-rat redistribution
without pretending a visible sign is a visible or audible rat. The committed
population disturbance, its paired destination evidence, and the destination
anchor authenticate one anonymous `animal-contact` / `physical-rustle` event.
Its source and repetition identity are opaque, its exact surface remains
`mixed` because aggregate ecology does not own terrain-contact detail, and its
interruption is explicitly `none`. Ordinary range, wind, listener-local
masking, and species hearing decide receipt. A lawful player receipt is always
heard-unseen and directional, even when physical rat evidence is visible; it
releases the existing restrained rustle synthesis and shared acoustic caption
without a session announcement or exact world anchor. The persisted
disturbance can be re-derived for the next bounded human/dog hearing interval,
while ephemeral player audio/text do not replay after load.

Five representative physical bridges are now live in the local candidate.
Every newly accepted stumble, fall, water slip, or current sweep adapts its
committed incident into one immutable structured acoustic event without parsing
the incident's legacy free-form label. That event's semantic family, intensity,
reach, interrupt strength, and deterministic variant drive the existing audio
cue, the bounded player physical-sound sample heard by eligible nearby NPCs,
and an optional acoustic-text candidate. A committed cargo shock may emit a
second object-contact event bound to the same conserved lot and the traversal
owner's bounded contact-surface classification. When carried ridge cleats spend
their final condition while actually supplying ridge grip, movement returns an
exact stable-gear-ID wear receipt. Runtime cross-checks that receipt against the
conserved physical lot before admitting one `tool-material` break event; the
resulting `crack` shares audio, direct-contact text, and the bounded player
sound sample rather than being inferred from a UI condition bar. Ordinary wear
remains quiet, and the transient label cannot replay after reload. Actual
movement of the existing BIO0 and settlement-working dogs may
emit one body/surface event derived from their before/after positions, terrain,
and bounded body-size/gait semantics; the player receives it only through ordinary
event-time hearing and sight/localization. That same dog-contact event enters a
separate authenticated, eight-record living-actor hearing carry before any
player hearing or text gate. The next world perception frame offers it exactly
once to eligible nearby humans and eligible full-simulation in-window dogs
through one physical acoustic evaluator with ordinary range, listener-local
rain/water masking,
anonymous localization, and source-ID exclusion. Dog listeners additionally
apply their registered species hearing sensitivity; ordinary contact remains a
`physical-*` observation rather than being promoted to an alarm or threat. The
carry survives a current-schema
interruption; its self-consistent movement evidence is cross-checked against
current dog identity, final position, tick, body, terrain, heading, and step
ceiling. Its v1 prior point is carried evidence rather than an independently
retained locomotion receipt, so exact historical-path authentication remains
future work. A regional-frame rebase deterministically retires only contacts
whose source can no longer reach this bounded living-actor bridge. The
optional player label remains transient and cannot replay after reload. The
owning traversal, cargo, gear, and ecology domains keep every physical
consequence.
External audio for these structured embodied-contact events is released only
after the fallible fixed-step transaction commits, so fail-closed rollback
cannot leak and then replay a rejected contact while the event itself retains
its original simulation tick. Ordinary step and ADRIFT paddle playback now
reuse that same tick-local committed-audio queue. Existing volume, default
variant, undefined pan and 360ms paddle throttle remain; undefined pan avoids
creating a stereo-panner node for routine self movement. The ephemeral paddle
throttle is checkpointed and restored on failure, not serialized. Successful
movement releases one cue after interval closure, while rejected steps restore
physical state and release no step/paddle cue. This adds no footstep captions,
new watercraft action, or independent sound framework.

Current fixed-step hearing records accepted physical displacement, not terminal
velocity: sweep entry moves the body before resetting velocity for the next
step. Current47/carry14 saves at phase one and phase nine preserve that sensory
trajectory, physical cargo, incident and interrupted movement state exactly,
without replaying audio. Replay permits zero terminal velocity only when the
exact latest validated movement receipt proves entry from a nonswept mode into
`swept`; that receipt requires the reset rather than optionally accepting the
entry displacement as terminal velocity. Every other latest step retains exact
displacement/velocity equality. An earlier entry, missing receipt or ordinary
mode never exempts a later drift sample. Position, facing, step ceiling, water
contact, ordinal, stamina/mode and causal-authority guards remain binding; no
schema, migration or save retirement changes.

These are representative producers, not false whole-world completion.
Production views suppress both old renderer-created ADRIFT syllables and raw
ambient-water `ohm`/`whissh` whenever the shared `acousticText` projection is
present, including an empty list. Their fallback remains only for legacy views
and tests that omit the field. Continuous water ambience remains a restrained
environmental audio loop driven by local hydrology; it is not a discrete
acoustic attention event. Surface-current strokes, foam, soundings and scan
disclosure remain unchanged. Renderer wall time cannot fabricate new heard
water captions, and this classification creates no splash/contact producer or
watercraft mechanic. Chart and Relief share the same rule under normal and
reduced-motion presentation; Relief removes stale legacy label nodes when a
current projection takes over. Broad addressable non-dog animal
contact, arbitrary object and foliage contact, broader tool/material work, violence, vessel
producers, and coarse/cross-frame physical hearing remain incomplete. A
heard-unseen physical event still receives no exact world anchor or source
identity; its lawful receipt may now feed only a coarse
directional accessible caption.

#### Shared acoustic-text presentation arbitration

One renderer-neutral acoustic presentation candidate family covers speech,
animal calls, human/animal nonverbal sounds, physical contact, object/cargo
impact, and eligible environmental sound. Every candidate is derived from an
authenticated player receipt. The former current-visibility resident
state-speech adapter has been removed rather than promoted: continuing state
stays non-acoustic unless a committed transition authorizes an expression.
The storekeeper's committed closure response, resident introduction, and
resident weather-hold response already use that event-owned path. The presenter—not
producer domains—owns category style, category-specific lifetime,
source/contact anchoring, bounded
deterministic lanes, collision checks, salience/priority, per-source queues,
repetition merging, and suppression. The live bounded physical queue coalesces
the same source plus repetition key; aggregate clustering across different
sources remains future work. The frog aggregate already arrives as one
ecology-clustered source event, so it neither spends one slot per anchor nor asks
the presenter to infer a group from hidden members. Its heard-unseen accessible
caption competes in the same priority/salience slot as other lawful acoustic
cues, while critical speech and warnings outrank that non-interrupting chorus.
Routine steps, continuous wading, and repetitive work normally remain
audio/animation only.

Chart and Relief now consume the same combined active-expression and eligible
physical-acoustic candidate list. Directly visible continuing resident state
uses ordinary non-acoustic actor presentation and spends no acoustic-text slot.
One shared renderer-neutral layout ranks by priority, salience, and stable
identity, admits at most four labels globally and one per source, tries the same
small deterministic source-relative lanes, rejects anchors too far outside the
playable aperture, and suppresses a lower-ranked candidate when no
collision-free lane remains. Neither renderer may jitter around this decision
or restore the old independent incident/speech-label paths. An NPC warning can
therefore remain readable while a player scrape uses another lane or is
suppressed. A placed event-owned resident callout temporarily suppresses that
same stable actor's ordinary quick label and emotion mark; unrelated residents
retain their lawful state, and a layout-suppressed callout does not erase its
source's state. This join uses actor identity rather than screen proximity.
Presentation loss never erases audio or actor hearing.

Field Manual → Accessibility offers **Full / Important** animal world labels.
Full is the default and still obeys hearing, repetition and layout limits.
Important filters only animal-call candidates explicitly marked noncritical by
the existing `situatedExpressionSoundInterrupt` semantic owner after lawful
receipt/source validation. Strong calls and unknown legacy importance remain;
speech and physical/embodied cues are not filtered. Quiet chicken/duck calls do
not become strong warnings merely from alarmed tone or their hidden cause.
This preference changes neither audio, actor hearing, interruption nor the
shared accessible caption/announcement. It uses separate browser-local storage,
not world/save state; denied storage falls back to Full on the next load while
the current session control still works. One native pressed-state button serves
both views and is hidden on other manual pages; UI teardown removes its listener.

The application also supplies at most three measured UI reservations to that
same layout: the shared caption, full EVENTS panel, and journey action dock.
These boxes use mount-relative CSS coordinates; a candidate tries the existing
bounded lanes and yields if none clears the feedback. Invalid, sparse, or
over-budget reservations fail closed for optional world labels, not for the
caption, audio, hearing, or world event. The UI owns a frozen rectangle cache:
new UI publication, caption replacement/removal, window resize, EVENTS toggle,
and bounded mount/feedback/target resize observation invalidate it. Stable
getter reads perform no DOM measurement. Missing ResizeObserver retains
publication/toggle/window invalidation; teardown disconnects its observer and
listeners. No world-object or actor scan supplies these screen-space boxes.

In Relief, optional harbor names and actor quick labels/emotion marks also yield
when their final eased/clamped
conservative text envelope conflicts with a placed acoustic label, then return
when occupancy clears. Only the existing bounded acoustic placements are queried;
no DOM measurement, hearing suppression or new queue is introduced. Essential
destination and ADRIFT guidance are not hidden by this optional-state rule.
The envelope may briefly suppress a nearby noncolliding name; it is not an
arbitrary-font or all-world-label collision guarantee.

The layout envelopes, bounded active physical queue, and fade progress are ephemeral
and neither persist nor replay after load. Chart and Relief share the bounded
world-text arbitration; the accessible caption path consumes the same lawful
self/visible candidate or a coarse directional heard-unseen physical cue where
supported. Ambient-water syllables remain
legacy renderer presentation outside the shared budget; ADRIFT's old syllable
fallback is suppressed in production shared-projection views. The live dog and
cargo representatives do not make broader animal/object/tool/violence/vessel
producers live merely because the common contracts can receive them.

The first animal-signal adapter is deliberately narrow. The existing persistent
settlement guardian dog emits one warning bark only when it newly commits a
guardian `investigate` activity caused by its own lawful, anonymous heard-alarm
belief and matching retained task. The committed activity transaction is the
expression trigger. Handler reports, identified or visual subjects, non-alarm
threats, stale tasks, and continued investigation ticks remain silent. The bark
is an `animal-alarm` acoustic fact at the dog's conserved position, not human
speech and not a player-gated effect; nearby humans may hear its anonymous F0
signal even when the player is distant. Visible presentation resolves only the
authenticated roster dog and its current position. Hidden presentation uses
the uncertain acoustic receipt, and an unheard call has no player callout.

A second narrow signal reuses the same owner: one low defensive growl when the
guardian newly enters a perception-caused `retreat` and the working-animal
authority commits the matching `defer-to-actor` activity with
`actor-intent:retreat`. Admission reauthenticates the exact current threat
belief against the dog intent and work transaction; continued or stale retreat
and mismatched actor/work/perception state remain silent. The growl uses a
restrained spoken-volume contour through the same source-bound `animal-alarm`,
F0 hearing, reception, and caption path. It reveals no threat identity and,
unlike the sharp warning bark, has no strong WAIT or REST/SLEEP interruption
authority.

A third signal consumes the existing weather-to-working-animal chain rather
than inventing ambient dog noise. One soft shelter-request whine is eligible
only when weather exposure freshly commits the dog's `seek-shelter` intent and
the exact same-tick `defer-to-actor` / `actor-intent:seek-shelter` work
transaction. The cognition-owned positive shelter score is retained as the
event-time condition receipt, and the dog must still be physically outside its
assigned kennel; an already sheltered dog cannot manufacture the call. The dog
attempts ordinary physical kennel travel, which may still be blocked by real
terrain. Continued or stale shelter seeking is silent. This call uses the
neutral `animal-call` acoustic class, discloses neither the exact exposure cause
nor a hidden source position, and has no WAIT or REST/SLEEP interruption
authority.

A fourth narrow signal consumes the existing core-wildlife fish-crow alarm
rather than adding a bird-specific timer or second ecology event. Eligibility
requires one materialized fish crow in the bounded active regional projections
whose owning source, stable identity, retained sound position, current tick,
new alarm intent, exact event, attended alarm-causing belief and threshold, and
retained causal memory agree. The presentation sidecar derives from those
same active roots, is sorted and duplicate-checked, and cannot exceed the global
24-materialized-actor cap. Predator identity never leaves ecology authority;
the source observation ID remains only bounded causal admission evidence and
never enters realization or player copy.

The event realizes as `KRAA! KRAA!` with `animal-alarm` semantics, a six-step
duration, and strong interruption. Human range and loudness derive from the
existing fish-crow alarm profile, while `vocalization-fish-crow-alarm` delegates
to the existing `crow-nasal-double-call` synthesis instead of cloning it. Core
alarm propagation remains authoritative for wildlife and dogs. Once the
source-bound Living Voice sample is admitted, it alone owns human hearing and
player playback for that event, and the legacy direct crow cue is suppressed.
Exact visible-source authentication permits an actor-anchored call; heard-unseen
projection has no world callout and exposes only an uncertainty-bounded generic
bird direction.

A fifth narrow signal adapts the existing core-deer alarm through the same
species-aware admission instead of creating a deer-only sound path. The owning
ecology root must prove the materialized actor, exact committed alarm and retained
sound locus, memory, and the same lawful core alarm-belief policy and
threshold that produced the event.
Living Voice realizes that one event as `SNORT!` and
`vocalization-deer-alarm-snort`, owns its single human/player acoustic sample,
and leaves wildlife/dog propagation with core ecology. A heard-visible receipt
may identify and anchor the deer; heard-unseen presentation remains a generic
directional animal sound with no predator identity or hidden source position.
The call uses the shared strong-alarm interruption rule and never restores the
legacy direct player alarm cue beside the admitted sample.

Alarm receipt replay uses that same authenticated V6 ACTIVE materialized source,
not merely a serialized member address or visibility of an empty sound locus.
Hearing still propagates from the committed event position. Visible-source
classification additionally requires the active body's exact position to equal
that locus and the event-time listener's detail sight to admit it, just like
live admission. Otherwise a lawful sound stays heard-unseen with its original
uncertainty. The real completed deer interval demonstrates an active projected
body away from a directly visible retained locus; current47/carry14 roundtrip
preserves its unseen receipt without replay. A structurally valid resealed
visible-receipt forgery fails closed without overwriting the record. Source,
event, memory, materialization, tick, sleep/interruption and masking validation
remain; this adds no scan, reader, schema or event producer. Cat retreat's
existing bounded body/locus tolerance and pursuit's exact body rule are distinct
and unchanged.

A sixth narrow signal adapts the marsh rabbit's existing ecology-owned alarm
as embodied contact rather than pretending that every animal warning is a
carrying vocal call. The exact materialized rabbit, committed alarm, retained
sound locus, memory, and attended threshold-passing belief still authorize
the event. Living Voice may realize that event as one soft `thump` and the
existing `rabbit-thump` synthesis, but human listeners receive anonymous
`physical-thud` knowledge with no interruption strength. A visible, lawfully
heard rabbit may anchor the restrained embodied cue; heard-unseen presentation
retains only the sound and uncertain direction, and a sleeping or otherwise
inaudible listener receives no cue. The rabbit's alarm meaning remains ecology
authority for wildlife and dogs. It does not become human `animal-alarm`
knowledge, a danger-warning trigger, or permission to disclose the predator.

The physical rabbit cue is not conditional on optional expression-text
capacity. If the bounded situated-expression sample/admission budget is full,
the committed ecology event may still release its one direct `rabbit-thump`
audio cue and enter ordinary human hearing as `physical-thud`; it simply gains
no expression channel or caption. When an expression sample is admitted, that
sample owns the same one playback, so saturation and admission cannot duplicate
audio. The serialized names `actorVocalizationSamples` and nested
`vocalization` remain legacy transport names for the shared situated-expression
carrier; consumers use acoustic class and event semantics rather than infer
that every retained sample is a voice. Expression cooldown may coalesce or
suppress repeated visible `thump` text, but it cannot erase a distinct newly
committed physical event from lawful actor hearing or its one player-audio
opportunity.

The elk's existing ecology-owned alarm uses the same source-bound alarm
adapter and core belief threshold, including the owning herd member, exact
committed event, retained memory and final physical locus. It realizes one
six-step shouted `BARK!` / `vocalization-elk-alarm-bark`; range and loudness come
from the existing elk alarm profile and synthesis reuses `elk-alarm-bark`.
Optional admission or caption capacity cannot erase lawful audio. Direct
visible-source authority permits `Elk` and an anchored bark; heard-unseen UI
uses `An animal` / `CALL!` with only coarse direction. An out-of-hearing alarm
still occurs in ecology but produces no player audio or text. Current outer
save v47 / carry v14 reauthenticate the retained source and receipt without
replaying consumed audio; a forged species tuple rejects without overwriting
the record. The additive semantic does not extend historical readers. This
does not authorize a bugle, rut, hunting, or a new herd behavior.

A seventh narrow signal consumes the domestic cat's existing weather
cognition rather than vocalizing every intent transition. The owning regional
ecology root must prove one materialized domestic cat, a freshly committed
same-tick rain-caused retreat, the exact `weather:rain` observation and memory,
and event-owned `wet-tracks` evidence at the physical sound locus. Living Voice
may realize that event once as restrained `MRROW.` / `cat-call` output: a
six-step, murmur-volume `animal-call` with 360,000 loudness, an eight-tile base
range, and no WAIT/REST interruption. A lawfully heard visible source may be
identified and anchored near the authenticated event locus. Heard-unseen
presentation remains an anonymous directional animal call and cannot disclose
the cat's hidden rain motive or exact position; an unheard source produces no
text or audio. This representative does not make ordinary cat transitions,
play, injury, territorial behavior, purring, hissing, or human-directed meows
live.

The first human-to-human warning consumes lawful perception instead of
inventing a dialogue trigger; a strong fish-crow/deer alarm may supply its
hearing cause, while the rabbit's physical thump may not. One linear,
ownership-indexed selector examines
current resident perception and admits at most one deterministic source whose
fresh attended belief is either an identified direct-vision large predator or
an anonymous strong animal alarm. Its shouted warning retains the exact source
observation, resident position, admission, acoustic sample, receipt, and bounded
memory through the ordinary expression trajectory. Other residents may hear
only an anonymous `danger-sound`; that derived class is deliberately ineligible
to trigger another warning, preventing an acoustic recursion cascade.

Because a pending vocalization can become authoritative human knowledge, the
guardian-warning candidate advances the outer save to v35 and the bounded
perception carry to v4. That carry preserves source-bound pending vocal
samples plus every retained per-source channel, reception receipt, audio
acknowledgement, semantic cooldown memory, and a bounded causal-admission
ledger. The ledger binds each exact sound ordinal to the committed event class,
admission phase, and only the minimum causal facts needed to reauthenticate its
meaning. Sound, memory, channel lifetime, and receipt must form one canonical
trajectory; deleting or acoustically rewriting one side rejects the carry.
The defensive-growl candidate advances the outer save to v36 and bounded
perception carry to v5 without changing the bounded carry model. Its growl
admission retains whether SLEEP suppressed player hearing at the event, so a
later sleep start, cancellation, or completion cannot rewrite an already
accepted receipt; any still-active overlapping sleep must agree with that
event-time fact.
The shelter-whine candidate advances the unpublished outer save to v37 and
bounded perception carry to v6. Its admission retains the same event-time sleep
gate, while exact v36/carry-v5 migration accepts authenticated bark/growl state
and rejects whine meaning, knowledge, vocalization, or admission as impossible
historical v36 data.
The fish-crow candidate advances the unpublished outer save to v38 and bounded
perception carry to v7. Its admission binds the regional ecology owner, source
actor, same-tick alarm event, direct source observation, and accepted tick.
Reload re-resolves that owner, the materialized actor at its post-commit final
position, retained event and memory, specialized acoustic tuple, phase-zero
listener pose, waking-before-visibility reception, and strong interruption.
Exact v37/carry-v6 migration accepts authenticated bark/growl/whine state but
rejects fish-crow meaning, vocalization, or admission as impossible historical
v37 data; the earlier semantic fences reject those later crow semantics too.
The human-warning candidate advances the unpublished outer save to v39 while
retaining carry v7. Outer v38 remains a valid fish-crow-era reader, but its
semantic fence rejects human-warning meaning or admission as impossible v38
state. Current v39 checkpoints reauthenticate the warning against the exact
resident belief and event-time player reception; reload neither replays its
acknowledged audio nor recursively admits a second warning.
The dog-contact hearing candidate advances the unpublished outer save to
v40 and bounded perception carry to v8. Exact v39/carry-v7 migration initializes
an empty physical-contact lane rather than inventing a historical sound. A
current v40 checkpoint retains pending committed dog contact across interruption
and reauthenticates its event tick, structured movement/acoustic semantics,
source identity, and final source position against current dog authority before
it may reach the next bounded human/dog perception frame. Human and dog
listeners consume the same authenticated fact; listener-local masking,
species sensitivity, anonymous uncertainty, and self-source exclusion are
derived without adding a serialized listener receipt. The carried prior point
is bounded by the current dog's heading and step authority but does not yet
have a separate
locomotion receipt; off-frame contacts are retired when a regional rebase removes
their only current-frame consumers. Cross-frame/coarse animal hearing remains
future work.
The secured-storekeeper response advances the unpublished outer save to v41 and
bounded perception carry to v9. Exact v40/carry-v8 migration initializes no
reply, never reconstructs speech for an already-secured store, and preserves
the physical closure unchanged. Every current-shape v34-v40 reader applies a
cumulative semantic fence: a resealed historical carry cannot smuggle the v41
keeper meaning, knowledge basis, admission, channel, or sample through the
still-version-1 nested expression schemas. The v41 format encoded the retained
closure transaction, store and keeper identity, source evidence, recorded
listener pose, lawful visibility/range/hearing outcome, sample, receipt, and
bounded memory without replaying acknowledged audio.
The dry-exhaustion effort candidate advances the unpublished writer to outer
v42 and bounded perception carry v10. Its admission binds the committed
player-step phase, exact source position, actual movement distance, and narrow
dry-exhaustion resolution. Independently, every new fixed movement step appends
one generic movement-owned state sample aligned with its sensory sample:
before/after stamina and mode, committed distance, outcome flags, incident kind,
and endpoint water contact. A separate anchor records stamina and mode before
the first real sample. Load chains every later sample's pre-state to that
anchor and its predecessor, then binds the final mode and non-increasing
between-step stamina frontier to the saved player. The only current action
outside a fixed player step that changes stamina is gathering, which can spend
reserve but cannot mint it or change locomotion mode. The expression callback
cannot author or replace that physical trajectory. A dry-exhaustion admission
must additionally continue the exact preceding movement-owned state (or its
exact suffix anchor), so an otherwise lawful downward gathering gap cannot be
used as causal evidence for the murmur. Load also aligns the state
sample with the before/after positions, derived distance, world tiles, and
exact phase-N footstep before it accepts the murmur. Supported v1-v40 intervals
migrate with a contiguous `null` prefix for unavailable historical step state;
their first new current sample receives an exact post-migration anchor. Only
new current steps append real samples, and `null` can never authorize
exhaustion. Later lawful idle recovery may change current stamina while the
still-active utterance remains valid. Current reload preserves pending sound and bounded cooldown without
replaying acknowledged audio. Outer v41 is intentionally retired as an
incompatible pre-1.0 development format rather than migrated: it is recognized,
left untouched, and requires a clean current save. Supported pre-v41 migration
readers remain available. Their semantic fences reject later exhaustion
meaning, family, knowledge basis, admission, channel, and sample.
The preceding 3G resident-introduction candidate advanced the unpublished
writer to outer v43 and bounded perception carry v11. Its admission binds the
exact committed introduction event and command, persistent resident and home, acquaintance
tick, event-time listener pose, conversation-range direct sight, and positive
hearing certainty. The pose and facing must equal the carry's independent
phase-zero anchor. The saved semantic event contains no introduced identity
prose; projection derives the familiar name/occupation/home line only after
reauthenticating current facts. Current reload preserves the semantic event,
admission, memory, and one hearing sample without replaying audio. The label is
ephemeral; if same-source priority hid it, reload derives only its unexpired
audio-acknowledged remainder from those authenticated roots. Outer v42 is
intentionally retired beside v41 as a pre-1.0 development format rather than
receiving another internal migration chain.
The 3H weather-hold candidate advances that boundary to outer v44 and bounded
perception carry v12. It adds the exact event-owned resident shelter trajectory
and retains whether the listener was sleeping at phase zero; v43 is now
intentionally retired beside v41 and v42 under the same pre-1.0 policy.
The preceding species-aware wildlife-alarm candidate advanced the writer to
outer v45 and perception carry v13. Its shared `core-wildlife-alarm` admission
supports fish crow and deer while reauthenticating the exact ecology owner,
actor, event, observation, retained locus and memory, expression channel, and
sound sample.
Supported v38-v40 legacy fish-crow admissions retain their original identified
direct-vision aerial-predator semantic fence; the broader shared alarm-belief
policy belongs only to the species-aware record.
The rabbit embodied-signal candidate advanced the writer to outer v46
and perception carry v14. It extends that admission to marsh rabbit while
binding the rabbit-specific murmur volume, `physical-thud` human sound class,
explicit non-interrupting semantics, and optional embodied-text presentation.
Outer v45 is intentionally retired beside v41-v44 rather than migrated under
the pre-1.0 policy. Current reload reauthenticates the ecology owner, actor,
alarm, causal observation, locus, memory, admission, channel, and sound sample
without replaying acknowledged audio, hearing, interruption, or ephemeral
text. A retained phase-zero sleeping state canonically yields no player receipt
rather than manufacturing a post-load thump.
The current bounded factual-speech candidate advances the writer to outer v47
without changing perception carry v14. Pending keeper speech now has a new
authoritative consequence: sufficiently clear lawful human hearing may create
one anonymous `store-secured-report` belief. Outer v46 is intentionally retired
rather than allowing one schema number to mean two different pending-event
outcomes. Current-v47 reload still reauthenticates the existing closure,
admission, channel, and sample before deriving that transient meaning candidate.
The later domestic-cat rain-distress representative does not change outer v47
or perception carry v14. Current reload reauthenticates the exact regional
owner, cat, rain observation, retreat event, weather memory, wet-track locus,
admission, channel, and acoustic sample. An acknowledged call does not replay
audio or ephemeral text after load, and an incompatible or forged causal tuple
fails closed.
The later marsh-fox pursuit-yip representative likewise changes no save shape.
For an admitted call, current-v47 reload reauthenticates the exact regional
owner, materialized fox, fresh pursuit event, identified live-prey observation,
matching target/resource and pursuit memory, committed body address, admission,
channel, sample, and event-time player receipt. If optional expression capacity
was saturated, no admission, channel, sample, or caption is retained; the same
exact ecology authority may re-derive at most the next bounded anonymous human-
hearing consequence. The target must still be one living materialized actor in
that same ecology root. Load never replays player audio/text or duplicates an
already consumed downstream receipt; a forged or stale causal tuple fails
closed.
The current carry also records the exact segmented player position, facing,
and sleeping state at phase zero. Load replays every retained fixed step
against the movement owner's exact displacement ceiling, movement salience,
facing changes, final velocity (including the receipt-proven sweep-entry reset
above), and final player pose. Player traversal/recovery speech must also
match its separately retained current-interval causal-authority record; effort
must additionally match the independently retained movement-owned step-state
trajectory described above. Porter departure receipts exist only at phase
zero and must reproduce that exact anchored listener pose. A lawfully heard,
strong guardian warning, fish-crow alarm, deer alarm, gull alarm, or elk alarm interrupts WAIT or
REST/SLEEP before source visibility is classified. The rabbit foot-thump has
explicit `none` interruption authority and leaves authentic WAIT/REST active.
Dog reception replays from physical acoustics
and line of sight; the growl's admission-owned event-time sleep gate prevents a
later recovery transition from rewriting whether the player heard it.
A dog outside the current presentation window remains a lawful world source:
inaudibility replays without requiring a local placement, while an audible
off-window call can disclose only the bounded heard-unseen receipt.
An active recovery receipt that began before a re-derived audible strong call is
noncanonical even after the short caption expires; a recovery begun after the
phase-zero call remains lawful, and an unheard call interrupts nothing.
Reload therefore cannot erase hearing, admit suppressed chatter, replay
acknowledged audio, reset cooldowns, change why a line was selected, or reroll
its wording.
Exact v33 player-only carry-v2 saves migrate only uniquely reconstructable
active or already-expired `pv-*` samples into one authenticated player channel
and source-bound `av-*` samples; the missing historical phase-zero pose is
reconstructed once from the retained path and saved player state, unrelated
cooldown memory is discarded, and
v34-only meanings are rejected. Exact v35/carry-v4 saves migrate only through a
strict semantic fence that rejects defensive-growl meaning, knowledge basis,
vocalization, and admission as impossible historical v35 state. Exact
v34/carry-v3 saves preserve their
working-people channels under a strict semantic fence: animal-call meanings,
animal sound classes, uncertain-hearing receipts, and dog admissions are not
valid historical v34 data. Exact v5-v32 perception carries still migrate
through carry v1 to an empty voice bank without changing prior player-recovery
authority. Routine records expire under fixed caps rather than growing with
play time. Every current pending player sound remains bound to the exact saved
physical step position, expression event, admission phase, and retained
traversal/cargo cause. Resident sources must resolve uniquely to the same
persistent human at the saved authoritative world position; their event-time
listener position, facing, hearing certainty, direct visibility, active/recent
expression, committed contract departure, cargo custody, and route state must
all reauthenticate. Guardian sources must resolve to the same roster dog,
assignment, saved position, and event-time player receipt or lawful absence of
one. Warning barks reauthenticate
the perception-caused investigation and retained task observation; defensive
growls reauthenticate the freshly entered perception-caused retreat, matching
`defer-to-actor` transaction, exact current threat belief, and event-time sleep
hearing gate. Supported core-wildlife sources must resolve uniquely through the
retained regional owner to the same materialized actor, final position,
same-tick alarm event, species-valid causal belief, and retained alarm memory;
reception replays from the event-time listener pose, the species acoustic
profile, waking perception, and exact visible-source authority. Ordinary
admitted expression keeps sound capacity atomic: a ninth candidate cannot
create an expression channel, sample or caption. Adapted ecology-owned core
alarms and the marsh-fox call retain their existing physical fallback when that
optional admission is refused. Each real event keeps lawful event-time player
audio and one bounded re-derived human-hearing opportunity without hidden
motive knowledge or duplicate receipt. That hearing remains species-honest:
rabbit is `physical-thud`; chicken, duck and fox are non-interrupting
`animal-call`; goat is a strong anonymous `animal-call`; crow, deer, gull, elk
and boar retain strong anonymous `animal-alarm`. Unadmitted strong alarms use
the transient domain-event carrier described in the audited frontier, not an
invented admitted expression. A quiet chicken call
recorded while the player was asleep canonically retains no player receipt;
current v47/carry14 reload and later cancellation cannot invent one. The new
meaning does not enter historical formats or frozen released catalogs.
Resealed remote,
acoustically altered,
temporally reset, or causally forged expression samples fail before becoming
NPC knowledge.

The source bank is also bounded by the exact perception interval. Save/reload
may preserve an active line, an expired line's pending sound, and its cooldown
until that interval is consumed. The closing presentation may still show the
line once, but all pre-boundary active and cooldown-only state is then retired;
new same-tick source state survives as the next interval's authority. Physical
incidents, cargo custody, and recovery history remain their own durable owners.
Cross-interval player choice has a separate, versioned `playerExpressionRecency`
owner. It nests the unchanged `playerEffortRecency` proof: at most one accepted
exhaustion admission and its narrow movement-owned predecessor/step/position
facts, bound to the world seed. Footing retains at most one latest origin per
current ordinary/serious stumble meaning, two total. Each contains only the
canonical admission, matching causal authority and actual movement-owned step;
one newer footing meaning must not erase the other's still-live meaning lock.
Cargo protection retains its existing precedence rather than being relabeled
footing. Historical pairs obey the priority-qualified family law at their
acceptance frontiers, not merely today's ages.
Age derives from the authoritative world tick and actual physical step ordinal;
the tenth step is the next tick's phase zero, not the old admission's phase-nine
compatibility clamp. The pending exhaustion channel retains its unchanged
36-step semantic cooldown, but the existing effort-history owner now requires
600 accepted player steps before another fresh dry-exhaustion transition may
utter that optional murmur. This separate pre-admission eligibility rule limits
micro-recovery cycling; it does not delay or erase committed sound, change
movement/stamina/camp, generate a timed line, or silence unrelated warnings.
The same one physical-origin receipt survives consumed intervals and current
save/reload, then prunes at the 600-step horizon. Previously forgotten consumed
history is not reconstructed when loading older supported records. The 12/16-step
footing meaning locks remain unchanged. This state contains no
audio, caption or hearing queue and cannot replay an old event. New history
commits only after expression admission and rolls back with a failed tick.
Pending origins must exactly match the current physical/admission carry;
consumed historical depths are not compared to a later tide. Canonical seals
prove consistency, not secret attestation of an arbitrarily rewritten history.
`playerExpressionRecency.test.ts`, `playerEffortRecency.test.ts` and
`runtime.fall.integration.test.ts` own exact
expiry, phase-ten, no-replay, pause/recovery, capacity refusal and fail-closed evidence. Other
source meanings still have interval-local semantic memory; broader sparse
choice and hours-of-play annoyance remain open Voice gates. Physical
exhaustion/camp cycling remains movement-owned, not repaired by this policy.
This slice does not yet claim other work expression where no authoritative
completed-work event exists; it also does not claim complete bark/growl/whine
breadth, broader distress/play, general animal-call networks,
language/relationship realization, or complete Living Voice.

#### Development expression inspection

The unpublished development runtime exposes a default-off
`expressionDiagnostics` observer, implemented by
`src/game/situatedExpressionDiagnostics.ts`. It retains at most 64 detached,
immutable decisions from existing producers: semantic intent, source-local
prior kernel state, exact runtime refusal or acceptance, committed admission,
retained player receipt, catalog realization, current weather and an exact
causal belief only when that producer already holds it. Resident introductions
also supply their authenticated contextual text; catalog fallback wording is
not claimed as the final caption. Missing context remains explicitly null.
Filtered records retain global total/eviction counters, not filter-specific
counts. The observer does not scan the world for hypothetical causes.

Human danger warnings supply the exact canonical belief selected during the
existing authenticated resident pass. Only enabled development inspection
retains it; one optional, failure-isolated notification follows winner selection
without reselecting a source or changing candidate shape/order. The existing
buffer detaches that belief at the decision and discards it on transaction failure.
Anonymous hearing remains anonymous; inspection does not decode an alarm's cause.

Fixed-step records publish only after the existing fallible transaction and
deferred introduction-save preparation succeed; rollback discards provisional
records. Immediate UI transactions retain their existing authority boundary.
Diagnostic failure cannot veto gameplay. These records never enter saves,
hearing, RNG, audio or caption queues, and production builds expose no observer.

For current player traversal and guardian shelter-whine decisions, a record
may also retain the exact already-applied domain input. Traversal captures
`PlayerTraversalExpressionInput`: incident, fall evaluation, physical-cargo
outcome and event-time source position. Shelter whine captures the existing
`GuardianDogShelterWhineExpressionInput`: bounded dog/work roots, completed tick
and positive shelter-intent score. The runtime retains the original mapper
input through admission only when development inspection is enabled; a real
decision copies it into the bounded buffer. Neither path scans for hypothetical
actors or reconstructs its cause from later roots. Other producers retain null
context; unsupported causes without a semantic intent create no record.

`replayProducer(sequence)` selects only the current buffer's retained domain
input, runs the existing traversal or shelter-whine semantic mapper, checks
exact agreement with the recorded intent, and then reruns its source-local kernel.
Missing/unsupported context, evicted records, invalid input, mapper failure or
intent disagreement makes replay unavailable. It neither authenticates nor
repeats the physical transaction, weather exposure, kennel custody or shelter
travel, and cannot submit events, change inputs or overrule the actual runtime
refusal. Its output explicitly excludes recency,
capacity, admission, hearing, presentation and uncaptured social/emotional
state. Later world changes do not rewrite the captured cause. Reset/reload
clears availability, but reset may reuse numeric sequences; select from a new
snapshot rather than treating a number as a permanent external handle.

The keeper's current secure-store response and guardian shelter whine can retain
the exact already-evaluated player listening input and contact when inspection
is enabled. The optional observer receives a detached copy after the existing
contact calculation; it does not repeat a hearing query or mutate the contact
used by admission/audio.
The whine keeps its existing condition/work-owned cause, producer replay and
visible/unseen reception; warning barks, defensive growls and other producers
do not yet capture this tuple. Sleeping or unavailable geometry/masking may
return before calculation, leaving context uncaptured. An absent context means
uncaptured, whereas a captured null contact means that calculation found no
audible contact; neither substitutes for a committed listener receipt.

`previewListening(sequence, overrides)` first verifies the captured baseline
against the existing `evaluateAudibleContact` calculator. It permits only finite
ambient masking in `0..1` and wind components in `-1..1`, and returns the actual
contact/receipt separately from the hypothetical contact. Missing, inconsistent,
invalid, evicted or reset context makes preview unavailable. It cannot change
the environment, apply terrain/structure/foliage transmission, evaluate sleep,
visibility/identification, comprehension or NPC reception, admit an event, or
produce audio/text. The fixed 64-record buffer, failure isolation, rollback,
no-save and production-exclusion rules above also apply. This is a captured
player-contact inspection aid, not a complete sound-ecology lab or evidence that
unavailable environmental propagation is implemented.

`auditKnowledge(query)` inspects captured evidence for current keeper
secure-store replies, resident introductions, human danger warnings and
resident weather holds. At event time it calls each existing domain's
`*ExpressionEventMatchesWorld` validator and retains only a small verdict with
event/source/trigger/tick and owner. The keeper uses the exact committed closure
root, not the prior open store. Other producers retain null source evidence;
neither declared knowledge basis nor realized words establish possession of a
fact. This captured verdict is not a portable attestation and cannot grant
knowledge or validate a later mutable world.

The existing human-perception collector can notify enabled DEV inspection of
its already-evaluated supplemental listening frame. No second hearing query is
run. Receipts distinguish heard, not heard, source-excluded and unavailable
geometry; sources/listeners outside the selected bounded frame remain
uncaptured. Notification follows complete successful collection and supplies a
detached frozen copy; copying/observer failure cannot alter the sensory result.
Each retained decision receives at most the existing 64 selected-human receipts,
within the existing eight-sample frame bound. This is optional evidence, not a
new observation channel, world scan or listener authority.

The report checks event/source agreement, canonical anonymous hearing,
confidence and the existing semantic decoder. Only a keeper's secure-store
report currently supplies `store-secured-report` at confidence450000 or higher.
Below that threshold it remains human vocalization. Introduction, warning and
weather speech do not decode names, hidden causes, destinations or other facts:
their received class is the existing semantic sound class. A matching retained
player receipt is reported separately and does not prove player comprehension.

Audience amendments use the same provisional diagnostic root as decisions.
Only after the entire tick and due introduction-save preparation succeed does
finalization join listener/actor, completed tick and exact observation ID to the
retained anonymous hearing belief. A heard observation may not survive the
existing cognition cap; absence of retention is not evidence of inaudibility.
Before finalization retention is null. A later transaction failure publishes
neither provisional audience nor new source decisions. Query reports are
detached/frozen, have no effect on hearing/audio/captions, and follow the same
64-record eviction, reset/reload, no-save and production-exclusion policy.
Uncaptured provenance/listeners, unsupported semantic transfer and player
comprehension remain explicitly outside this partial factual-audit spine;
the complete knowledge-leak auditor and broader labs remain open.

`reportRepetition()` retains capture-period totals separately from the 64-record
inspection ring. It counts captured decisions and reasons, and groups decisions
with an event and admission by semantic family, source actor and exact supplied
contextual wording (otherwise the catalog realization). This does not revalidate
an admission, deduplicate world events or count committed audio/captions. Each
group retains only its first 64 keys; existing keys continue counting, while
untracked-key occurrences are reported explicitly. Ranked entries are therefore
not a complete top-frequency list when overflow occurs. Reset/new-world/reload
clear these totals; disabling capture preserves prior totals but adds nothing.

The denominator is successful accepted fixed-step time, including quiet steps,
published only after the full transaction and due save preparation succeed.
Paused, disabled and failed steps add no exposure. Rates are per **accepted
simulation minute**, not elapsed wall time or the civil clock; accelerated WAIT
and recovery still count their ordinary accepted steps. Zero exposure or unsafe
counter saturation makes rates unavailable. Preview/replay/audit operations add
no decisions or exposure. Reports are detached/frozen and retain the existing
default-off, no-save, failure-isolation and production-exclusion boundaries.
Uncaptured producers/physical sounds, failed diagnostic copies, settlement
density, profanity classification, annoyance and hours-long exposure remain
outside this partial inspection aid; synthetic counter tests are not gameplay
frequency evidence.

The separate read-only preview reruns only the existing expression kernel from
copied prior state, with explicitly supported semantic overrides. It cannot submit an
event or simulate a domain action, physical recency, capacity, propagation,
listener knowledge, personality, relationships, full emotion, contextual
realization or presentation. A successful hypothetical preview does not
overrule the recorded runtime refusal. This is a partial debugging spine, not
the complete selectable producer-context expression lab. See
[Local development](../README.md#local-development) for access and
`runtime.expressionDiagnostics.test.ts` for current-state/audio/save parity.

### Repository asset and storage law

The tracked repository stays below 1 GB, targets roughly 600 MB, and requires
intervention by 850 MB. Installed dependencies and generated packages are
measured separately. Prefer code-native or procedural geometry, reusable
original assets, deterministic variation, and shared presentation systems over
large near-duplicate binary families. The objective is more meaningful world
per byte, not lower fidelity by default.

## Determinism contract

The same rules version, pressure mode, seed, initial scenario, and canonically ordered commands produce the same completed state hash and events. Rendering frame rate, a save/load boundary, or batched headless stepping cannot change simulation results.

Authoritative simulation state uses integers:

- Terrain coordinates and quantities are integers.
- Trust, condition, confidence, tide, needs, and similar ratios use `0..1_000_000` fixed point.
- IDs are monotonic and never reused inside a world.
- Command and entity conflict resolution has explicit stable ordering.
- `Math.random`, wall-clock reads, locale-dependent ordering, and p5 noise are forbidden in `src/sim`.

Random decisions use a keyed generator derived from the root seed plus domain, tick, entity, purpose, and ordinal. An unrelated new draw therefore does not scramble every later result.

The interactive host advances player motion at 100 ms fixed steps and advances the authoritative world once per ten player steps. There is no manual in-play pause command: ordinary field play advances continuously. Opening the title or Quiet Hour sets the internal paused state, saves, and halts both clocks until the player continues. A capped accumulator prevents a hidden or stalled tab from applying an unbounded catch-up burst.

`src/sim/worldTime.ts` is the single versioned civil-day projection over that
persisted world tick. Version 1 fixes tick zero at Day 1 00:00, one tick as one
displayed minute, and 1,440 ticks per day. Night runs 00:00–06:00, dawn
06:00–07:00, day 07:00–19:00, dusk 19:00–20:00, and night resumes through
midnight. The already-released ecology and resident-needs daylight window
remains exactly 06:00–20:00 while later Turning Day work consumes the finer
phases. HUD, event, continue-summary, wildlife, and resident projections derive
from this contract rather than maintaining their own modulo arithmetic. The
projection also supplies fixed-point open-sky illumination and solar progress;
render readability remains a separate presentation concern. Time has no mutable
clock sidecar, needs no save migration, and cannot depend on frame rate, device
time, timezone, locale, or the loaded signed region. Tide and weather retain
their independent tick-derived rules and are not reset at midnight.

Newly created worlds begin at the same clock's Day 1 07:00 tick rather than
inventing a second scenario clock or rewriting the epoch. Initial tide,
weather deadline, recipes, residents, routes, contracts, and the world-created
event are all born at that timestamp. Existing and imported saves retain their
exact persisted tick, including valid tick-zero midnight worlds; no migration,
offline fast-forward, or phase offset is applied.

Fresh `RegionalEcologyStateV6` breadth roots use an activation-clock baseline:
each append-only cohort derives its pristine resident state from its already-
persisted activation tick, so a 07:00 world does not simulate wildlife through
420 ticks before that world or cohort existed. Released breadth roots and
supported older-save reconstruction/migration retain their established
tick-zero baseline policy exactly. The distinction changes no outer save
version and does not rewrite or reroll an existing ecology history.

`src/sim/outdoorIllumination.ts` owns version-1 fixed-point physical outdoor
light. It combines the shared open-sky signal with current weather
transmission, bounded terrain sky exposure, explicit cover transmission, and
at most sixteen already-spatially-filtered local sources. The game bridge
derives one stable dusk/night lamp from each completed beacon civic project,
addresses it in signed region/local space, and reuses F0's exact elevation,
obstruction, and diagonal-supercover ray for light transmission. A four-entry
bounded field cache keys eased light state, weather, persisted beacon identity,
spatial frame, and immutable terrain geometry rather than renderer frames or a
raw steady-night tick. Internally constructed regional views freeze one
validated geometry snapshot and one bounded lamp index for all perception and
presentation consumers in that world step; caller-owned mutable fixtures are
still rescanned and fail closed. No lamp sidecar or save migration exists.

F0 consumes that row-major physical field per target. Darkness contracts only
the shorter actor/item/label/interaction field through a bounded nonlinear
low-light response; known terrain shape retains its longer weather- and
geometry-limited horizon. The same sealed perception snapshot gates Chart and
Relief detail, so a renderer brightness preference cannot reveal an actor or
change AI knowledge. Chart colors and Relief sky, ambient light, and sunlight
direction ease from the same projected phase without a screen-darkening pane.
The local-light component is projected only onto terrain the player currently
sees, producing bounded Chart and Relief beacon pools without becoming durable
map memory or another disclosure test. Water uses an independently
blue-anchored, unlit Relief material and a cool local-light lift so daylight,
twilight, terrain, fog, camera angle, and nearby lamps cannot composite it into
misleading green/yellow ground color. Independent canopy/interior cover, fire
and carried lantern sources, shadow maps, astronomy, and complete circadian
schedules are not claimed by this first outdoor-light slice.

`src/sim/livingCircadian.ts` owns the version-1 species-neutral persistence,
profile, canonical clock-preference, resident-home binding, and observation-
admission contracts. `src/game/livingCircadian.ts` consumes and re-exports that
lower authority while retaining the higher routine projection and action
logic. Together they project AWAKE, RESTING, ASLEEP, and STARTLED from the one
world clock, a stable identity-derived phase offset, an authenticated rest
destination, lawful current disturbance, and explicit priority inputs. Each
profile also projects a stable bounded next-evaluation hint. That hint does not
skip or schedule general resident/wildlife projection; only the bounded
working-dog neutral-intent adapter currently carries it into the dog's existing
`nextThinkTick` gate. Their four reusable policies are day-active,
night-active, twilight-active, and adaptive-active; orthogonal driver
vocabulary is clock, tide, weather, and opportunity. A policy owns a fixed-
point wake-sensitivity threshold rather than making every nearby observation
an automatic wake event. Rendering, wall time, array order, and region loading
are not routine inputs.

`src/game/coreEcologyCircadianPolicy.ts` owns a frozen declarative binding
registry whose key is the combination of species and existing activity
archetype. Alpha43 **Two Rhythms** began that registry with two clock-driven
rows: fish crow + `perch-watch` + day-active, and North American river otter +
`shore-water-forager` + night-active. Alpha48 added snowy egret +
`tidal-wader` + adaptive clock/tide/opportunity; Alpha49 added marsh rabbit +
`ground-cover-forager` + twilight-active. The internal Alpha50 **Many Rhythms**
milestone, first shipped cumulatively in Alpha53, makes the registry an exact
ordered cover of all seventeen species that currently own an addressable
activity-affordance profile. The
thirteen formerly bounded-day rows reuse day-active policy and their existing
archetypes rather than receiving private schedulers. Duck, otter, yellowlegs,
and terrapin retain tide/depth-responsive actions and destinations without
treating every usable-water sample as a wake signal; only the egret's bounded
tide/opportunity evidence independently composes with clock preference. The
activity profile must still match the authored archetype or lookup fails closed;
selecting an archetype alone never grants a routine.

A fish crow must travel through shared locomotion to its habitat-authenticated
perch before nighttime rest physiology can apply. A river otter follows the
inverse preference through the same generic `livingCircadian` kernel: by day it
physically returns to its authenticated distinct dry haulout before settling or
sleeping, and at night it wakes and travels amphibiously toward authenticated
foraging water. Continuous physical arrival permits RESTING and then ASLEEP
after the settling interval; an urgent need, active commitment, dangerous
weather where supported, or sufficiently salient current lawful disturbance
can keep or return either animal to active behavior. Strong disturbance
produces STARTLED and a bounded recovery hold. No clock edge teleports an
actor, and neither animal receives rest physiology while still travelling.

The compact circadian receipt is embedded in the existing wildlife actor state:
policy, stable rest-destination identity, authenticated-arrival receipt, posture,
and posture-entry tick. Canonicalization reauthenticates the activity-archetype
policy, and a loaded activity projection rederives the habitat destination.
Save/load and full-to-coarse-to-full transitions preserve a committed rest bout;
coarse advancement may carry it only to the first effective active boundary
after any already-known priority override clears and cannot invent another
unobserved bout, movement, perception, or destination.
Alpha42 advanced the outer `GAME_SAVE_VERSION` from 30 to 31 while retaining
the exact nested `RegionalEcologyStateV6` and wildlife actor schema/version 1;
Alpha43 changes none of those envelopes.
The actor's circadian field is optional: the strict version-30 reader preserves
an authenticated V6 ecology child byte-for-byte, invents no posture for an old
actor, and resaves the adopted world as version 31. This is not a second clock
or a nested ecology-schema rewrite.

The current living-species catalog reports each of those seventeen profiles'
broad rhythm and shared cadence from the common routine policy. Every
authenticated historical catalog snapshot keeps its exact prior bytes and hash,
including former bounded-activity `diurnal` declarations: the Alpha32–36 roots
and the Wave-G Estuary Surface Break, Marsh Channel Web, and Alpha39 Saltmarsh
Small Worlds roots are compatibility records, not mutable views of the current
catalog.

This exact-cover claim is deliberately narrower than catalog-wide circadian
adoption. The other 28 core-wildlife profiles have no addressable activity
affordance to which a physical routine can honestly bind; aggregate actors are
not fabricated. In particular, the southern leopard frog retains real
rain-driven aggregate activity and chorus without receiving an invented body,
destination, or sleep posture. The bounded working-dog and food-store-keeper
adapters described below reuse the kernel without widening the wildlife
registry. The independent dog, bonded/player companions, the other 41 humans,
and complete Turning Day closure remain outside Alpha50. Later consumers must
reuse the same kernel and physical authority rather than add species or human
schedulers.

The internal Alpha44 **Ten Minutes** milestone, first shipped cumulatively in
Alpha53, adds one bounded player `WAIT 10 MIN` action owned by
`src/game/runtime.ts`. A wait receipt records the starting
world tick, the existing partial-minute player-step phase, successful steps,
and the fixed total of one hundred. The animation driver admits at most one
ordinary 100-ms player step per presented frame through `runTickFailClosed()`
and the normal `tick()` path; every tenth step advances the authoritative world
minute. Completion therefore advances exactly ten displayed minutes and ends
at the same partial-minute phase without assigning the clock, calling the
headless coarse-time path, or creating a second simulation.

While waiting, player control is neutral but all ordinary player, weather,
tide, cargo, Promise, resident, wildlife, ecology, perception, and traversal
rules continue. Movement, a new destination or deliberate field action,
Escape, current loss, a physical traversal incident, or a lawfully perceived
strong disturbance interrupts only after the current successful transaction
commits. The consequence produced by a final step keeps announcement priority.
WAIT adds no special healing, replenishment, protection, or hazard immunity.
Its visible receipt is deliberately session-local: page hiding, app closure, or
reload ends the action while the existing version-31 envelope preserves every
completed root and the exact partial-minute carry. Reload cannot resume,
replay, skip, or reroll the remainder. Player REST/SLEEP and validated longer
or coarse elapsed-time actions remain later Turning Day work.

The internal Alpha45 **Kennel Night** milestone, first shipped cumulatively in
Alpha53, connects exactly one more production actor to the same
`livingCircadian` authority. The adapter in
`src/game/settlementWorkingDogCircadian.ts` accepts only the existing
settlement-custodied guardian dog, its matching persisted assignment, and that
custody's real kennel. It selects the shared clock-driven day-active policy and
derives one rest-destination identity from both stable dog identity and kennel
identity; an arbitrary structure, another dog, the independent porter-scene
dog, or an incoherent saved receipt fails closed.

Night preference owns only the neutral rest suggestion. The existing movement
owner must carry the dog physically to the kennel, and the dog remains AWAKE
and non-restorative throughout that journey. Authenticated arrival permits
RESTING and, after the shared settling interval, ASLEEP; loss of physical
arrival wakes it. Runtime passes that committed restorative posture into both
needs recovery and shelter-based exhaustion recovery. The kennel's physical
weather shelter still dries and moderates exposure while the dog is awake, but
cover, low-exertion watch, and kennel travel cannot masquerade as restorative
rest. The same identity-derived phase offset determines its active boundary,
where a schedule-owned rest intent returns to neutral observation. Current
lawful danger or sufficiently strong disturbance, dog-owned needs and self-
preservation, and retained investigation or return work continue to override
routine preference. A startled working-animal defer records the dog's actual
current intent rather than inventing a retreat cause. Routine code cannot erase
or fabricate those authorities.

Dog actor schema/version 1 gains only an additive optional circadian receipt
using the existing shared record: policy, stable kennel destination, physical
arrival fact, posture, and posture-entry tick. Legacy records without the field
remain valid, and the runtime reauthenticates any present receipt against the
actual custody and assignment. Load deterministically recovers accepted pending
work transactions first; if that exact-once recovery changes an active
commitment, any already-present routine receipt is reprojected against the
recovered assignment at the same saved tick before play resumes. A legacy
absent receipt remains absent. Outer save version 31, settlement ecology
version 4, and working-animal state version 2 do not change. Chart and Relief
use the authoritative resting pose, while directly visible ABOUT inspection
may label Resting or Asleep; neither exposes the schedule, phase offset, wake
threshold, destination ID, kennel custody graph, or assignment internals. This
is not a human routine, independent-dog routine, bonded/player companion
routine, or player REST/SLEEP.

The internal Alpha46 **The Keeper Sleeps** milestone, first shipped
cumulatively in Alpha53, lowers the persistent circadian contract far enough
for the existing resident simulation to own one human receipt without creating
another human root. A fail-closed adapter in
`src/game/settlementKeeperCircadian.ts` authenticates exactly the resident whose
stable identity already equals the starting-harbor food-store keeper named by
settlement ecology. The resident's existing home-settlement ID is the complete
physical rest anchor for this slice; no house, bed, interior coordinate, shop
hours, or commute is invented.

Neutral night preference can commit RESTING and then ASLEEP only while that
same resident is physically at the home settlement and has no contract. Route
location, accepted work, non-neutral porter response, storm, urgent resident
needs, and qualifying current strong lawful disturbance override rest. The
sim owner admits all human observations only after same-tick commands have
applied: an authenticated sleeping resident at home receives hearing and scent
but no new vision, while a same-tick accepted contract makes ordinary vision
eligible and the stale sleeping posture is reconciled awake. The complete
batch is canonicalized before channel filtering, so filtering cannot launder a
malformed or forged observation. Downstream systems that require current
keeper sight—including domestic-animal recovery—consume the admitted current
perception record rather than the raw pre-gate observation batch.

Resident exhaustion and rest-need recovery now require the bound receipt,
physical home arrival, a Resting or Asleep posture, a current rest preference,
and no qualifying disturbance, storm, or active work. Shelter, idleness,
travel, stale posture at dawn, and low-exertion route presence are not
restorative. Existing explicit drying, cold moderation, clinic/medicine rules,
and every legacy unbound resident retain their prior owners. Contract
advancement reauthenticates a present receipt after location changes, and loss
of home arrival wakes it.

`ResidentState` gains only an additive optional shared circadian receipt.
Legacy absence stays absent through serialization until the exact keeper is
lawfully processed at home; an older keeper encountered away remains unbound.
Outer save version 31, `RegionalEcologyStateV6`, and settlement ecology version
4 do not change. Present state must match stable human identity, home
settlement, current location/contract, cognition tick, destination digest, and
the shared day-active policy. Chart, Relief, quick inspection, and ABOUT may
show current Resting or Asleep posture, but expose no schedule, phase,
destination identity, wake threshold, raw need, or unseen observation. This is
one representative keeper, not every-human home life, a physical interior,
player REST/SLEEP, or Turning Day closure.

The internal Alpha47 **Rest and Rise** milestone, first shipped cumulatively in
Alpha53, adds player recovery without a second clock or a direct time
assignment. On stable dry footing and below full
stamina, `REST 30 MIN` creates a version-1 player time-action receipt for
exactly three hundred ordinary 100-ms player steps. At an exact current
settlement during Dusk or Night, the same control becomes `SLEEP TO DAWN`; it
targets the first authoritative 06:00 boundary after the action begins and is
unavailable during a storm. Neither action is forced by the clock. Existing
stillness owns stamina recovery, while weather, tide, cargo, actors, ecology,
Promises, deadlines, exposure, traversal, and incidents retain their ordinary
owners.

The receipt stores action kind, starting world tick and partial player-step
phase, exact target, total and completed steps, and the settlement anchor that
sleep requires. Each committed step must reconcile that receipt exactly with
the authoritative clock; arbitrary replay, omission, phase loss, foreign
settlement, or invalid footing fails closed. Presentation may batch at most ten
ordinary steps—one displayed world minute—per animation frame and refresh once
after the batch, but each step still passes through the existing
`runTickFailClosed` transaction. Movement or another deliberate field action,
loss of footing or settlement authority, storm, a physical incident, and
qualifying current lawful disturbance can interrupt only after the triggering
step commits.

Sleep suppresses the player's new detail-perception field while preserving
broad terrain awareness. Actor, item, label, and interaction detail therefore
remain absent from both Chart and Relief; visual-only contacts do not wake the
player, while strong lawful hearing or scent and physical consequences still
can. The event
observation cursor advances through sleeping time under that same suppressed
snapshot, preventing an unseen past event from becoming known merely because
the player wakes near its former locus.

Alpha47 advances outer `GAME_SAVE_VERSION` from 31 to 32. `PlayerState` gains
one required nullable `timeAction`; the strict version-31 reader authenticates
the old envelope, inserts `null`, and preserves the existing world and
`RegionalEcologyStateV6` authority. A current in-progress action saves and
reloads at its exact committed step and physical anchor. Page hiding suspends
only presentation acceleration, and title, Quiet Hour, app closure, and reload
add no offline elapsed time. WAIT remains transient and separate. This slice
adds no new fatigue, hunger, thirst, health, shelter, camp, bed, interior, or
dream system, and it does not close Turning Day by itself.

The internal Alpha48 **Tide at the Roost** milestone, first shipped
cumulatively in Alpha53, extends the exact species/activity circadian registry
with snowy egret + `tidal-wader` +
`adaptive-active`. The policy retains the one authoritative clock and accepts
only two additional current driver receipts: an authoritative-environment tide
signal backed by the current saved-anchor depth projection, and a
lawful-observation opportunity signal backed by the egret's current anonymous
aquatic-activity observation. Driver references are derived from authenticated
current facts; they never mint prey, population, knowledge, or a result.
Immediate intent, urgent need, and active commitment retain priority.

The tidal-wader owner passes its saved dry refuge through the same physical
rest adapter used by the earlier representative wildlife. Ordinary aerial
locomotion owns travel, so the egret remains Awake until the body reaches that
exact refuge; only arrival permits Resting and the generic settling interval
permits Asleep. Loss of arrival wakes it. Every wading, waiting, refuge,
observed-opportunity, and immediate-response projection carries the same
optional version-1 routine receipt. Serialization preserves only its policy,
authenticated rest-destination receipt, and posture with its entered tick. The
actor identity remains separately stable, and its phase is deterministically
rederived from identity plus policy rather than serialized in the receipt. The
raw save parser does not prove the live refuge or current body location. Before
behavioral use, the full-detail activity projection
reauthenticates stable actor, policy, tick, location, and destination. Legacy
receipt absence remains valid until a lawful current projection commits it.
During coarse absence the egret conserves only an already committed bounded
rest bout and does not resample tide or opportunity; current environmental
drivers are evaluated after full-detail rematerialization. Outer save v32,
`RegionalEcologyStateV6`, and wildlife actor schema/version 1 remain unchanged.
This is one tide/opportunity binding for one existing actor, not a new
population, teleport path, crepuscular or weather-driven policy, catalog-wide
conversion, harm/mortality extension, or Turning Day closure.

The internal Alpha49 **Twilight at the Marsh Edge** milestone, first shipped
cumulatively in Alpha53, adds the first production crepuscular composition by
binding the existing marsh rabbit to the
shared `ground-cover-forager` activity and `twilight-active` clock policy. The
generic runtime policy declares `circadian-activity`; the activity profile
declares `circadian-routine`; and both cover travel and bounded local activity
declare the `land` medium. Registry validation requires that
capability, scope, and medium to agree, so an unbound species cannot inherit the
schedule and a terrestrial actor cannot fall through to the aerial default.

The rabbit's existing authenticated habitat home anchor is cover and its
physical rest destination; this slice does not infer a burrow or den. During an
individual's stable shifted twilight windows, the shared activity owner may
select a bounded deterministic local ground-foraging destination and route the
same body through ordinary terrain locomotion. This neutral activity creates
and consumes no food and proves no feeding result. Outside the active window,
the same owner physically returns the rabbit toward cover. Travel stays Awake,
arrival permits Resting, and the common settling interval permits Asleep.
Immediate danger and lawful disturbance, urgent needs, and retained active
commitments remain authoritative. A stale neutral REST intent cannot override a
new current active preference.

The optional wildlife circadian receipt and outer save v32 remain unchanged.
Full-detail projection reauthenticates the actor, current location, profile,
and habitat cover before behavioral use. Coarse absence conserves only an
already committed rest bout; it cannot invent a commute, perception, target, or
new decision. The current catalog reports the rabbit's active crepuscular
rhythm and shared activity owner, while the historical compatibility adapter
restores every authenticated prior rabbit record exactly, preserving all
released catalog hashes. Existing exact-contact rabbit injury, death, carcass,
and finite-resource owners are unchanged. This slice adds no actor, population,
density, food, feeding, capture, attack, mortality, weather driver, tide driver,
opportunity driver, catalog-wide schedule, broad coarse-time advancement, or
Turning Day closure.

The internal Alpha50 **Many Rhythms** milestone, first shipped cumulatively in
Alpha53, converts the thirteen remaining addressable activity-profile species
in one registry-driven pass.
Together with the four earlier compositions, the circadian registry now exactly
covers the seventeen entries in the activity-affordance registry. Each profile
declares `circadian-activity` and `circadian-routine`, reuses its existing
authenticated perch, refuge, haulout, wading ground, margin, or habitat anchor,
and reaches that destination through its existing land, water, amphibious, or
air movement owner. Transit remains Awake; only arrival can produce Resting or
Asleep. Current danger, needs, retained commitments, and lawful disturbance
still outrank a neutral routine. Shared registry and projection invariants cover
the breadth; this does not add a species-by-species scheduler or test matrix.

One data-declared American-black-duck composition also exercises the shared
weather driver through authoritative current weather: qualifying rain may keep
the existing duck active outside its ordinary clock window, while storm weather
prefers its authenticated refuge. The same current weather sample is threaded
through production cognition, locomotion, direct presentation, quick inspection,
and ABOUT so visible posture cannot disagree with behavior. Duck, otter,
yellowlegs, and terrapin keep clock-based wake policy while their existing
physical branches continue to respond to usable tide/depth; tide does not wake
them merely because habitat remains usable. Egret remains the actual
clock/tide/opportunity activation composition. Coarse absence preserves a
committed bout but cannot invent a new weather observation or destination. The
non-addressable southern-leopard-frog population remains a separate truthful
aggregate example: rain changes its real activity and chorus, but never
fabricates an individual frog routine.

Alpha50 changes no actor, population, food, harm, mortality, save, regional-
ecology, or wildlife-actor schema. Current catalog rhythm/cadence comes from the
shared profiles while every frozen historical catalog remains byte- and hash-
exact. Its exact-cover boundary is the seventeen current addressable activity
profiles, not all 45 core-wildlife records. At that internal boundary,
people/companion breadth, multi-day/package performance evidence, cumulative
validation, and final Turning Day release verification remained for Alpha53.

The internal Alpha51 **A Day Shared** milestone, first shipped cumulatively in
Alpha53, generalizes the Alpha46 keeper bridge across all 42 current
original-estuary residents without adding a
second human scheduler. `src/game/residentCircadian.ts` validates each human's
stable identity, same-tick perception, needs, condition, location, optional
receipt, and fresh authoritative weather before projecting the existing shared
day-active policy. Home-settlement presence with no active contract is the only
current rest destination. Promise work and route travel remain owned by the
simulation; only the existing keeper wrapper may contribute its separately
authenticated non-neutral porter-response duty. The generic resident
`intention` value is not treated as a work shift because it is also the neutral
low-need fallback.

Current `identified`, `alert`, or `searching` cognition is active watch;
`noticed` or `suspicious` alone does not prevent settling, while a current
strong lawful interruption still uses STARTLED. Routine projection and resident
rest physiology share that exact watch rule, preventing a stale sleeping
receipt from granting one recovery tick before cognition wakes the person.
Storms and urgent needs retain their existing precedence, and dusk never forces
sleep.

The runtime stages replacements for the complete 42-resident roster and commits
only after every eligible projection validates. Loading and saving alone keeps
legacy receipt absence byte-stable. An unbound human adopts on an ordinary tick
only while physically home; a visitor already at a foreign settlement remains
unbound, and a bound visitor wakes with home arrival false. No guest bed,
return commute, house, interior, teleport, or movement owner is invented to hide
that current gap. Existing resident identity, relationships, contracts,
perception, physiology, and presentation remain separately authoritative.

The Alpha45 kennel-bound working dog remains the truthful current
relationship-bearing domestic-animal continuity witness: its stable identity,
custody, caretaker, guardian assignment, kennel journey, needs, sleep, reload,
and dawn wake remain intact. The independent dog has no authenticated rest
place and remains unbound. No bonded player companion exists yet, so Alpha51
does not fabricate or advertise one. Outer save version 32, simulation format
4, Regional Ecology V6, and both dog roots remain unchanged.

The internal Alpha52 **Rest Between Harbors** milestone, first shipped
cumulatively in Alpha53, reinterprets that resident-bound opaque destination as
a reciprocal settlement-network rest
anchor without changing a serialized byte. Home identity authenticates network
membership; `ResidentState.location` plus `activeContractId === null`
authenticates physical arrival at a particular real settlement. One shared
predicate is consumed by the game adapter, simulation replacement, invariants,
view copying, sleeping-vision gate, restorative physiology, presentation, and
post-contract reconciliation. World invariants separately reject nonexistent
settlement locations.

The contract owner remains the only human travel owner. Fulfillment conserves
and deposits cargo, clears the active contract, and leaves the same resident at
the destination. The existing courier selector may later assign that visitor
an actual onward or reverse Promise from the settlement they physically occupy;
there is no scheduler for invisible return, commute, lodging, or teleport.
Accepting work or entering a route makes the same receipt non-arrived and wakes
resting posture.

Outer save v32 and simulation v4 remain unchanged. The new
`residentSettlementRestNetworkId` API returns the exact historical
`resident-home:` digest and retains the former helper as a compatibility alias.
Only invariant/view reading may temporarily admit an Alpha51 foreign receipt
whose arrival bit is false and posture is Awake or STARTLED; it grants no rest
or physiology and the simulation corrects it on the next tick. False-arrival
Resting/Asleep and forged receipt identities remain invalid.

Released `0.3.3-alpha.53 — The Turning Day` is **LIVE_VERIFIED** and closes this
bounded daily-continuity architecture. The final Alpha53 closure slice adds no
second scheduler, simulation clock, or save format beyond the internal
Alpha40–52 milestones first shipped cumulatively in this release. The same
civil clock now has
production-backed closure evidence across day, dusk, night, and dawn; player
WAIT/REST/SLEEP; all 42 current residents; the relationship-bearing settlement
working dog; and all seventeen existing addressable wildlife activity profiles.
Physical destinations and ordinary locomotion remain authoritative, while
work, travel, danger, storms, urgent
needs, watch/search cognition, and lawful strong disturbance outrank neutral
rest.

Closure is proven through shared owners and representative integration rather
than an N-squared species matrix: exact WAIT cadence from the same saved state
under distinct animation-frame rates, real alarm-driven interruption at one
committed tick, a three-day direct production-owner routine harness with daily
serialization and bounded growth, and one representative golden eagle retaining
stable actor identity through source dematerialization/rematerialization. This
harness begins from a runtime-adopted synthetic v1-shaped record; it is neither
an archived v1 fixture nor a whole-runtime/working-dog soak. The packaged
harness holds the Title and Quiet Hour clocks still, performs real REST on
validated footing, and exercises desktop Chart/Relief plus mobile
portrait/landscape Relief controls. Packaged mobile coverage is Relief only;
shared production authority and integration coverage, not a second packaged
mobile Chart matrix, establish view parity. This is a regression and liveness
floor, not universal low-end-device performance certification. The settlement
working dog remains the honest continuity witness and is not a bonded player
companion. The independent dog, physical houses/interiors, and seasons remain
broader work outside this release.

At the Alpha53 release boundary, outer save v32, simulation v4, Regional
Ecology V6, wildlife actor v1, gameplay contract 51, and tutorial/Field Manual
version 63 were current. Exact feature commit `a419f774260292331e8c93ebc65ee3fd5125f7c3`
is preserved beneath validation-only descendants `f6a8816`, `e3fe15d`, and
final executable descendant `da4a75f2eae7c14b2d05f5c89178788d0005aba4`. CI run `35375612294`
passed 290 test files / 2,791 tests, and Pages run `35375612200` succeeded. The
first cache-bypassed exact-live comparison matched all 5/5 production files,
totalling 4,251,968 bytes; the packaged runtime-only ASAR contains 10 entries
totalling 4,472,022 bytes. Directive 04_1A **The Turning Day** is closed and
**LIVE_VERIFIED**. Current **LIVE_VERIFIED** Alpha 60 retains the same save,
simulation, ecology, wildlife-actor, and gameplay-contract versions while
advancing the Field Manual to 70. Exact source, executable, and pushed commit
`c78977ba9733dbb17a1f2461a0a94c5dcdfc1fd0` passed 312 test files / 3,009
tests locally; CI `36442886220` and Pages `36442886243` succeeded; all 5/5
cache-bypassed production files matched the exact 4,377,380-byte tested web
artifact; and its runtime-only ASAR contains 10 entries / 4,599,453 bytes.
Directive 04_1B **The Breathing Room** is closed, and 04_2 **The Living Voice**
is active in the local unpublished candidate.

### Turning Day audited current boundary

The released result is a bounded circadian composition, not a complete daily-
life simulation. `LIVE` means one saved clock; outdoor phase/light shared by
perception and both views; player WAIT/REST/SLEEP through ordinary fixed steps;
neutral settlement-rest physiology for the forty-two current humans; one
kennel-bound settlement working dog; and the seventeen existing addressable
wildlife activity profiles. Human occupation labels do not create shifts,
commutes, shop hours, physical homes or production. The other wildlife
profiles, aggregate animals, independent dog, future companion, camp/bed
sleep, fatigue/health/dream effects, feeding, seasons and hibernation do not
become live merely because the shared vocabulary can represent them.

An occupied settlement is currently an authenticated reciprocal rest refuge.
That is an intentional geometric abstraction, not a claim that a room, bed or
interior exists. Supported pre-Turning-Day residents without the optional
receipt retain their historical clock-only recovery rule until lawful current
adoption; that compatibility exception is not the contract for new actors.
Production cover transmission remains fully open, and only completed-beacon
`settlement-lamp` records currently produce local outdoor light. Accepted
fire, lantern and other-light values are integration vocabulary until a real
owner emits them. Non-clock routine drivers are narrower rather than absent:
the snowy egret consumes authenticated tide/opportunity input, and the American
black duck consumes qualifying rain plus dangerous-storm refuge. Broader
species/driver adoption remains deferred.

`nextEvaluationTick` is a deterministic cadence hint, not a universal runtime
scheduler. The settlement working dog currently carries that hint into its
`nextThinkTick`; neutral resident and wildlife routines still project on every
applicable authoritative tick. Any later cadence optimization must preserve
immediate invalidation by perception, weather, tide, needs and work. Likewise,
`physical-contact` and `authoritative-local-hazard` are reserved disturbance
vocabulary until their physical/health owners emit authenticated facts. The
keeper `presentationIntent` summary and `solarProgress` projection are
diagnostic/reserved values; current presentation consumes persisted posture and
the renderer consumes day-cycle/light authority instead.

The three-day Turning Day budget test remains valuable but is not a whole-game
runtime or archived-save soak. It uses the runtime to adopt and save a
synthetic v1-shaped record, then advances the real resident/ecology owners
directly for 4,320 ticks; the working dog is covered by separate integration
evidence. Future full-runtime or historical-fixture claims need their own
explicit witness.

Turning Day supplies Living Voice with honest clock phase, physical light,
posture and lawful interruption/perception inputs. It does not itself produce
night insect density, meaningful negative-evidence silence, quieter night
masking, time-aware chatter or additional animal calls. Those bridges remain
`SPECIFIED` until environment, ecology or actor owners create real causes.

## Authoritative tick

One world tick:

1. Canonicalizes, validates, deduplicates, and applies queued commands.
2. Advances every resident's bounded perception state from a validated observation frame, or from an empty frame when input fails closed.
3. Advances tide and due weather.
4. Runs due recipes, consumption, resident needs/intentions, and settlement pressure.
5. Applies civic-project materials and permanent effects.
6. Generates shortage contracts from real stock differences.
7. Offers the player a protected choice window before residents may claim work.
8. Plans or replans eligible resident deliveries over the active route graph.
9. Advances porters, resolves arrivals, conserves cargo, and grades deliveries.
10. Reinforces used routes and tile traces, trust, and sourced knowledge.
11. Emits bounded causal events and asserts invariants.

The main thread is sufficient at the current seven-settlement/42-resident scale. The view boundary permits a future Worker move after profiling without introducing a second implementation of the rules.

## World representation

The playable slice uses:

- One segmented continuous world addressed by exact signed storage-region coordinates plus normalized fixed-point local coordinates. The original 96 × 72 seeded Perlin/fBm estuary is embedded unchanged at its established global address, and migrated Alpha 0.1 saves preserve their serialized 64 × 48 terrain there. Outside that authored extent, terrain, water, biome, current, and weather inputs come from call-order-independent global sampling.
- A bounded 120 × 120 spatial frame projects the nearby world for traversal and rendering. It slides by 16 tiles before the player leaves its 52-tile safety band; presentation coordinates, routes, cameras, pointer targets, terrain memory, and projected objects rebase by one exact delta while authoritative world positions do not change. Internal 96 × 72 regions remain persistence and streaming partitions only and never become player geography.
- Seven specialized settlements with five-resource inventories, recipes, stress, inter-settlement trust, sourced knowledge, and one civic project each.
- 42 original-estuary human residents with immutable semantic origin identity, deterministic display identity, roles, traits, needs, relationships, condition, bounded memories, player knowledge, intention, location, optional active contract, and an optional shared home-anchored circadian receipt projected atomically across the current roster.
- Exactly one independently generated domestic dog, paired deterministically with one existing porter for a bounded food-and-rain interaction without making either actor the other's owner or companion.
- Exactly one separate seed-stable settlement working dog in a bounded roster, with its own kennel custody and one generic persisted guardian assignment tied to the existing keeper, two-goat herd, and pen worksite. It does not rewrite the original dog's independent relationship.
- One canonical bounded forty-seven-record living-species catalog containing
  exactly 45 core-wildlife profiles plus the human and domestic-dog foundation
  records. Its first twenty-four records are distributed through deterministic
  signed-region ecology while habitat v11 remains sealed compatibility lineage.
  Released Alpha33 appends mountain goat, American pika, and golden eagle as
  records 25–27 through a sparse Alpine sibling, forming the frozen 27-record
  compatibility prefix. Alpha34–38 survive as non-independent internal
  checkpoints first shipped cumulatively in Alpha39: their polar-shore,
  cold-shore, polar-consumer, and append-only breadth owners contribute Atlantic
  capelin, Arctic fox, harbor seal, polar bear, bay anchovy, Atlantic ghost crab,
  great blue heron, common tern, osprey, Atlantic menhaden, mummichog, grass
  shrimp, blue crab, greater yellowlegs, belted kingfisher, and double-crested
  cormorant as records 28–43. Released Alpha39 preserves that complete sequence
  and appends eastern saltmarsh mosquito, marsh periwinkle, seaside sparrow, and
  diamondback terrapin as records 44–47 through Saltmarsh Small Worlds breadth
  epoch 3.
  Addressable species
  use capped persistent representatives with stable
  seed/region/population/ordinal identities, segmented positions, bounded
  dynamic state, and saved materialized/coarse state. Eligible deer, gulls,
  fish crows, boars, elk, wolves, mountain goats, common terns, greater
  yellowlegs, double-crested cormorants, and seaside sparrows use shared
  herd, flock, sounder, or pack topology; other addressable profiles remain
  solitary, including the diamondback terrapin. Brown rat, southern leopard frog, Atlantic silverside, Atlantic
  marsh fiddler crab, American pika, Atlantic capelin, bay anchovy, and Atlantic
  ghost crab, Atlantic menhaden, mummichog, grass shrimp, blue crab, eastern
  saltmarsh mosquito, and marsh periwinkle remain conserved non-addressable
  aggregates; no fish, crab, shrimp, mosquito, periwinkle, or pika actor is
  synthesized. A separate starting-settlement home owner retains
  bounded rats, chickens, and goats while its domestic cat remains
  habitat-optional. This is signed-region distribution of a bounded current
  catalog at the released 45 core-wildlife-profile boundary, not worldwide
  species breadth, ecological migration behavior, or a complete bestiary.
  Alpha39 remains the historical **LIVE_VERIFIED** Directive 04_1 biodiversity
  closure; current **LIVE_VERIFIED** Alpha60 does not change this catalog, and
  Alpha53 remains the historical daily-continuity release. Alpha34–38 were
  never standalone releases; their exact
  append-only lineage is incorporated into Alpha39. Alpha40–52 likewise remain
  internal cumulative milestones first shipped in Alpha53 rather than
  standalone releases. The
  catalog contains two shared foundation records—human and domestic dog—outside
  the Directive 04_1 core-wildlife target, for exactly 45 core-wildlife profiles
  / 47 total living records.
- One released starting-harbor fresh-produce store, bound to an existing settlement, human keeper, and brown-rat aggregate anchor. Its food is one conserved physical settlement-cargo lot rather than a mirror of abstract settlement stock; its open/secured door, keeper knowledge, and completed or pending exact-loss transaction persist under stable identity.
- Shortage-derived contracts with a named requester, real origin stock, destination need, due tick, carrier, cargo conservation, condition grade, and traveled trace cost.
- A complete set of potential inter-settlement corridors. Only routes above the strand-strength and condition threshold participate in autonomous service.

Presented prose is derived from structured facts. UI copy may explain a cause, but it cannot invent stock, a person, a project contribution, or a route event that the simulation did not record.

### Settlement-generation responsibility boundary

The current world contains the verified bounded settlement network described
above; general infinite settlement generation is not current gameplay. When
that responsibility becomes active, settlements must derive from geography and
world history, keep stable identity and lawful absence, persist sparse
deviations rather than serializing an infinite census, and preserve population,
knowledge, economy, route, history, and coarse-simulation truth through world
streaming. Adding distant settlements must extend this owner rather than place
isolated service menus or unconditional markers into generated regions.

## Original-estuary human identity, perception, and ABOUT boundary

`src/sim/npcIdentity.ts` generates the current human slice from root seed, signed origin region, immutable settlement origin key, immutable actor ordinal, and origin role. A person's stable ID and display identity deliberately exclude the monotonic runtime entity ID and current household-array position. Generation-v1 freezes 226 normalized given names and 206 normalized family names behind deterministic golden tests; later dictionary changes require a new generation version, while already persisted people retain their exact identity. Curated temperament pairs avoid simple contradictions, while occupation-shaped gear and skills, age, height, build, appearance, and one or two background facts provide bounded variation.

The simulation persists four separate layers: immutable identity, dynamic condition, player knowledge, and actor perception. Traveling humans accumulate wetness, cold pressure, and exhaustion from live weather, gear, and relevant skills. Event-caused emotion can delay an assigned route through a weather hold; the hold is not yet physical shelter pathfinding. Entering that hold emits one retained `resident-sheltered` transition that Living Voice may consume, while the continuing shelter condition cannot synthesize later speech. `observe-resident` moves a stranger only to recognized. `greet-resident` requires the exact prior observation tick and records one bounded memory before revealing only name, occupation, and home. Numeric entity IDs and raw need, skill, temperament, emotion, belief, confidence, or search coordinates never enter ordinary ABOUT copy.

`src/sim/actorPerception.ts` owns a deterministic fixed-point cognition kernel. Accepted vision and hearing observations become canonically ordered, decaying beliefs; a capped top-four attention set, bounded suspicion states, at most 24 active beliefs, and at most 16 salient memories prevent an actor from processing unbounded stimuli. Anonymous sound never carries an actor identity or exact source point. Only an identified visual observation can establish the courier's exact last-known area. Losing that sight starts a deterministic, expiring scan around the saved area; a new lawful visual contact reacquires the courier, while expiry returns the person to ordinary activity. The simulation advances every resident exactly once each world tick and prepares every next state before committing any of them, so malformed or partial observation frames cannot selectively teach one actor or half-advance the population.

The live game bridge applies that kernel only to the original harbor country's existing 42 humans observing the local courier. Each fixed player step contributes a bounded position sample with terrain-dependent exposure, movement salience, and—when caused—footfall, splash, or impact sound. Point-to-point visual contact uses the same short detail ranges, forward field, terrain elevation, ridges, dense rough ground, and built obstruction rules that protect player-facing detail; active weather shortens sight. Hearing remains anonymous and directional: rain and turbulent water near the listener create masking pressure, while wind changes reach and uncertainty. A person may face the highest lawful attention area or the next saved search probe, never the courier's hidden live position. Segmented world positions keep the underlying observation and saved-area contracts exact across signed and extreme coordinates, but this release does not generate humans outside the original harbor country.

The game projection places residents on non-deep tiles around their current original-estuary settlement and interpolates assigned porters along their real route. Both positions pass through the same ten-tile exact-detail perception mask before rendering, hit testing, ABOUT, or greeting. Chart and Relief emit the same typed resident command and maintain a minimum 44-pixel selection diameter. ABOUT is a pointer-local, pane-free non-modal DOM region: it never pauses the simulation, disappears when exact sight is lost, and leaves transparent space available to the world canvas. Quick labels, restrained text faces, event-owned short speech, and ABOUT behavior can truthfully say that a visible person is listening, investigating, watching, alert, or searching nearby; they do not reveal the hidden attention key, confidence, or saved search coordinate. Continuing state never fabricates speech. Desktop, touch, Chart, and Relief consume the same projection.

Actor events are stamped at emission time only when their recorded route/settlement locus was directly observable. That persisted observation fact, player-caused commands, and a very small global-event allowlist feed the player chronicle. A porter walking into view later cannot reveal an unwitnessed historical event retroactively. Full causal events remain in authoritative simulation state.

This is not universal perception or a universal NPC architecture. The first porter-dog web, separate settlement working dog, separate starting-settlement home ecology, and signed-region wild-population owners extend the shared boundary through a narrow set of current consumers: one dog's physical food scent, bounded species-neutral external perception participants, individual-wildlife visual contact, explicit anonymous alarm calls, bounded individual decisions, exact physical resource and carcass transactions, one generic working-animal assignment, deer/gull/fish-crow/wild-boar/elk/gray-wolf group topology, the released conserved aggregate populations—including capelin—receiving only declared lawful pressure, role-and-size-aware rabbit/fox/harrier/gray-wolf/cougar/bear pursuit, exact marsh-fox/gray-wolf/cougar contact against an eligible solitary rabbit, and snowy-egret, American-black-duck, North American river-otter, or harbor-seal actors receiving current anonymous aquatic-activity facts through ordinary visual occlusion. A polar bear may pursue a currently visible seal through those same role and cognition rules, but owns no contact or mortality outcome. A fish crow can alarm at a directly perceived aerial predator; only that causally retained, directly visible behavior can become mobbing pressure that interrupts a northern harrier. A working dog may investigate an anonymous alarm area, but a fox is deterred only after lawfully seeing the dog. Current physical evidence is limited to directly observable rat/frog area signs, silverside or capelin surface activity, fiddler-crab burrows or feeding scrapes, rain-response cat pawprints, rabbit paired tracks, and fox or gray-wolf canid pawprints. The Arctic fox reuses the anonymous canid-pawprint evidence form rather than adding a private track system; seals and polar bears add no track-evidence owner. Fish crows, harriers, snowy egrets, American black ducks, river otters, harbor seals, polar bears, wild boars, elk, and the working dog do not create ground-track evidence. The authored boar, elk, and wolf voice profiles remain inaudible, while wolves do create canid pawprints in this release. General scent fields, broad evidence and tracking, social reports and rumors, broad cross-group communication, physical human pursuit/search pathfinding, human-to-human sensing, generated people beyond the original estuary, additional dogs beyond the current two, worldwide species breadth, the full bestiary, wider ownership and social networks, general physical NPC inventory, negotiation, guaranteed deterrence, foliage consumption, complete circadian life, and companion behavior remain later slices.

The preceding inaudible boar/elk/wolf profile statement records the released
ecology boundary. In the current unpublished candidate, the elk's existing
alarm bark now enters shared Living Voice; its bugle and wider repertoire
remain foundation-only. See the [current Voice frontier](#audited-implementation-frontier)
for live producers rather than inferring current audio from that release-era
profile list.

### Living Weft current-truth boundary

Directive 03 is immutable execution history. Its broad charter described the
eventual shared actor fabric; the released closure was the authorized bounded
F0 slice and later Biodiversity/Turning Day extensions, not universal adoption
of every item in that historical Definition of Done. Current humans have stable
identity, condition, needs, bounded memory and perception, knowledge-honest
observe/greet behavior, route/cargo continuity, and selected day/night and
weather responses. The generic actor vocabulary and release-gate reports are
reusable foundations and development evidence, not additional gameplay.

Several persisted human fields intentionally remain only partial. Resident
relationships are symmetric, static, one-axis trust baselines whose broad live
consumer is belonging; they are not an evolving directed social graph. Generic
`eat`, `rest`, `connect`, and `work` intentions select state, while only
`carry` currently has a substantial enacted work loop. Occupation informs
identity and narrow selection; it does not yet produce goods. Some skills affect
weather/courier decisions, while others are profile data. Seed-derived history
is bounded biography, not witnessed causal world history. Apparent travel-kit
tokens support characterization and two weather modifiers, but are not stable
physical NPC inventory, equipped objects, or proof that those props are
rendered. S1 owns evolving social/economic consequences, actor visuals owns
visible equipment, material culture owns physical equipment/repair, and future
occupation owners must attach real work transactions before claiming those
systems live.

### Planned bounded existing-world integration

**PLANNED — not implemented by registration.** The existing-human integration
owner must connect the original settlement and traveler populations to the
applicable shared actor and world contracts. It must not create a second NPC
population, cargo stock, dialogue manager, or story orchestrator. The current
Living Weft boundary above remains unchanged until executable evidence closes
each bridge.

Required adoption has one authoritative human body and a bounded action
lifecycle: causal selection, capability and target validation, finite claims,
ordinary approach, authenticated arrival, domain-owned completion or failure,
claim release, and reassessment. Existing ration use, civic material service,
keeper inspection, and conserved delivery provide real consumers; sourced
professions, broad production, commerce, and addressable porter cargo retain
their separate owners.

Environmental truth and actor knowledge remain distinct. Relevant local
water/route observations or lawful reports may change a task, but loaded terrain
or a remote hazard cannot silently teach an actor. Navigation/body heading,
look direction, recognition, and interaction attention must remain separate;
neutral player recognition cannot indefinitely monopolize work or rest.
Optional expression follows committed results through Living Voice and shared
acoustics.

Closure requires normal-play and deterministic counterfactual proof, coherent
current-schema interruption/reload, conserved stock and custody, accountable
full/coarse transitions, bounded planning and retries, scheduler fairness, and
measured performance. The [inheritance applicability](./SYSTEM_INHERITANCE.md#existing-human-and-world-response-adoption)
and [composition repair registry](./SYSTEM_COMPOSITION.md#high-leverage-composition-repair-registry)
register these obligations without claiming that planned activity is live.

## First porter-dog living web

The game host creates one dog from the root seed, the selected existing porter's immutable origin identity, and stable regional generation inputs. Dog identity, actor address, needs, condition, perception, intent, bounded memory, player knowledge, and persistence tier are distinct from the porter's resident state. Their deterministic pairing is an interaction fixture, not ownership, adoption, or a companion relationship. Full-detail movement and new sensing are limited to the bounded loaded interaction window; promoted state preserves earned history without claiming a full coarse animal population simulation.

The dog receives a classified physical-food scent observation rather than a true food coordinate. Scent strength and uncertainty derive from the porter's conserved dried-fish pack, pack containment, distance, wind, and rain. The dog may take one bounded step toward a perception-derived belief area only across the shared traversability surface; invalid coordinates, deep water, blockers, or an unavailable path fail closed. Rain also updates bounded wetness and cold condition. The porter separately requires lawful, occlusion-tested visual contact with the dog before considering an actor response.

Chart and Relief render and hit-test the same direct-detail dog projection by stable actor ID. The non-pausing ABOUT surface distinguishes UNKNOWN DOG from FAMILIAR DOG and reveals only observed appearance, condition, behavior, and earned history. Losing exact sight removes the marker, target, and actions immediately.

The player-choice reducer exposes exactly five actions: **ASK FOR HELP**, **SUGGEST SECURING BELONGINGS**, **WAIT AND WATCH**, **ROUTE AROUND THIS SPOT**, and **LEAVE**. The first two record bounded requests; they do not command the porter or mutate inventory directly. Porter response, pack closure, any offer, dog consumption, memory, promotion, and custody commit through the same accepted world step. A successful offer moves exactly one dried-fish unit from the porter's container to the dog's container before consumption, and replay cannot mint a second unit. Route-around requires a current automatic route and replaces it with a real path to the same destination that avoids the observed dog area; if no valid detour exists, the old state is retained.

## Settlement working-dog composition

`src/game/dogActorRoster.ts` owns a bounded canonical collection for dog bodies
outside the original BIO0 relationship. Alpha 26 puts exactly one seed-stable
dog in that roster. Its actor state remains the existing `DogActorState` shape:
identity, segmented address, needs, condition, perception, intent, memory,
knowledge, and update tick. The roster creates no identity, infers no owner, and
cannot absorb the original independent dog.

Settlement ecology version 4 extends the typed domestic-home vocabulary from
`coop | pen` to `coop | kennel | pen`. One third custody binds the settlement,
existing keeper, roster dog, and kennel; the chicken and goat relationships
remain distinct. `src/game/settlementWorkingAnimals.ts` separately owns a
generic versioned assignment, not the actor body or livestock group. Its first
record binds the worker, handler, worker custody, protected goat custody and
group, pen worksite, duty area, role, and current or pending exact-once activity.
The role vocabulary currently contains only `guardian`, but the persistence and
arbitration boundary is species-neutral for addressable nonhuman actors.

The work arbiter consumes canonical actor perception and normalized welfare.
It may accept `watch`, `investigate`, `return`, `survival-override`, or
`defer-to-actor`; an investigation copies only an accepted observation ID and
uncertain area, never an emitter, threat identity, exact point, or protected
target. Staging and resolution are transactional, replay is inert, and load
recovers one pending acceptance without repeating perception, choice, or
movement. Ordinary dog cognition remains the self-preservation authority:
retreat, shelter, human avoidance, rest, inaccessible terrain, or urgent
welfare can supersede assignment work. Feeding and drinking actions stay
dormant because this slice has no physical settlement remedy for them.

Alpha 27's additive task lifecycle turns a committed investigation into one
bounded record rather than a second behavior tree. It retains the source
observation, uncertain perceived area, and a deterministic search probe derived
by the shared locomotion owner. Physical arrival at that probe records a
completed result and starts return toward the canonical pen worksite. A narrow
keeper policy may instead request cancellation after the investigating dog
leaves its duty area, but the transition is lawful only when worker and handler
hold fresh reciprocal identified visual beliefs. Arrival at the worksite waits
for a current handler observation before acknowledgement closes the task.

Task opening, suspension, resumption, completion, cancellation, arrival, and
acknowledgement share one exact-once staged transition contract. Actor-owned
intent or normalized welfare may suspend an open task and later resume it;
neither can manufacture a terminal result. The root retains at most one current
task, one pending transition, and one latest closed outcome, bounding both save
growth and replay surface. This is handler-aware relationship state over the
existing actor, cognition, perception, welfare, and locomotion owners—not a
remote command bus, herding system, full schedule, autonomous kennel-life
routine, combat system, mortality system, or guarantee of livestock safety.

`src/game/coreEcologyPerception.ts` now admits bounded external actors through
ordered `{ address, contactScope }` participants and indexes visual candidates
in deterministic local buckets. Core wildlife and opted-in external actors can
therefore perceive each other without a dog field, species-pair detector, or
unbounded scan. Investigation and escape use the shared living-actor
traversability, search-probe, and locomotion owners, including signed segmented
coordinates and fail-closed deep-water barriers. The representative chain is
causal: a rabbit alarm reaches the dog anonymously; work may move the dog toward
that perceived area; the fox retains pursuit until its own lawful contact sees
the dog; only then can shared appraisal redirect it. This is incidental
deterrence, not an attack, guardian aura, or livestock-safety guarantee.

Dog presentation composes an authenticated current work activity without
rewriting actor intent. Chart and Relief consume the same direct-detail dog
projection, while ABOUT can say only `Watching`, `Investigating something
nearby`, or `Returning nearby` at the current tick. It exposes no assignment
graph, alarm source, internal needs, hidden threat, or remote dog marker.

## Bounded domestic-animal recovery composition

Released Alpha 28 adds one versioned
`settlementDomesticAnimalRecovery` owner around the existing goat herd,
keeper, pen, custody, and working dog. An in-frame exact herd split may occur
only when a member is currently fleeing or retreating because of a lawful cause
and the members are separated beyond the shared threshold; distance alone is
insufficient. A separated member may select the shared `regroup` intent only
from current identified sight of its exact group peer, while danger, escape,
shelter, and urgent physiology remain higher priority. Presentation maps that
internal intent to neutral focused movement rather than exposing a hidden
system state.

The recovery owner retains at most one current case, one pending exact-once
transaction, and one latest result. The keeper must lawfully observe the
separation before a case can be noticed. Only an explicit report of the
observed last-known area may recruit the existing working dog into its ordinary
search; recruitment conveys no remote livestock marker and search completion
does not authenticate a find. The same exact goat bodies can rejoin through
shared group topology. Current caretaker sight of all members inside the
canonical pen confirms closure; a retained already-known case may also consume
an authenticated coarse reunion transition without pretending the keeper saw
the off-frame event.

Core-wildlife materialization treats a social group as one indivisible cap
candidate. Every exact member is admitted together or the entire group remains
coarse, preventing partial rendering or partial local cognition. Coarse bodies
retain exact identity and group topology but cannot perceive or move locally;
their group-level transitions remain available to existing authoritative
owners. This is a bounded starting-harbor composition, not herding, a full home
routine or schedule, guaranteed recovery, a player search command, remote map
tracking, attack, injury, mortality, carcasses, new calls or tracks, or
cross-region animal ecology.

## Signed-region ecology root

Release `0.3.3-alpha.32 — Open Country Ledger` is **LIVE_VERIFIED**. It adds no
species. Alpha 31 habitat
versions 1 through 11 remain sealed compatibility authority;
`src/game/coreEcologyRegionalHabitat.ts` derives new wild baselines from the
root seed, canonical signed region and territory identity, terrain, catalog
policy, carrying capacity, food or prey support, and density budgets. A valid
result can be empty. Large-ranging profiles have one stable host region, and
floor-based lattice ownership remains correct at negative and extreme
coordinates. Domestic and settlement-custody actors never enter this wild
derivation.

`src/game/regionalEcology.ts` owns regional root version 1 and separates
immutable lineage from current residence. Pristine regions are derived rather
than serialized; only promoted or migrated identity, changed residents,
bodies, claims, transaction receipts, and other authoritative deviations enter
the durable root. `src/game/coreEcologySettlementHome.ts` derives the bounded
home owner separately: the brown-rat population and anchored chicken and goat
homes remain required, while a free-ranging domestic cat is habitat-optional.
Visiting a region cannot create population truth or inflate save size.

`src/game/regionalEcologyState.ts` projects the bounded hot neighborhood and
submits every resident owner to one global group-atomic stable-distance top-K
capped at 24 actors. The cap is one presentation budget, not one allowance per
region; a social group enters together or remains coarse. Authoritative fresh-
world density and aggregate-anchor counts are measured before materialization,
so the starting-harbor pile cannot be concealed by rendering fewer actors.
An all-coarse resident may catch up to the regional-root clock through the core
patch owner's exact bounded accelerator. Group-free patches and cohesive,
signal-free groups without recurring authorized pressure advance directly.
For a group under recurring player-absent pressure, the accelerator canonically
aligns for at most 64 eight-tick cadences, proves one stable eight-cadence
cycle, bridges older complete cycles while retaining nine complete cycles, and
then canonically replays only the bounded final tail, whose implementation
ceiling is `9 × 8 + 7 = 79` internal replay steps. A materialized or
unsupported state, active cognition, a due intent transition, a live group
signal, or topology that still needs replay fails closed to canonical chunks
of at most 64 ticks. Entrant
derivation and authority validation call the same path; neither acceleration
nor fallback invents a perception, action, target, or local movement.
`src/game/regionalEcologyRuntime.ts` and the runtime coordinator resolve one
root-wide pre-step snapshot, allowing current visual, anonymous tidal-activity,
and alarm perception across owner boundaries without source-order dependence.
The existing exact-contact mortality seam may also cross an owner boundary only
for a currently identified eligible solitary marsh rabbit reached by a marsh
fox, gray wolf, or cougar; the victim owner commits the one retirement and
conserved body.

Outer save version 25 authenticates normalized version 24 exactly once and
records one deterministic group-atomic disposition for compatibility wildlife:
retain, redistribute, or explicit non-death retirement. The transaction
preserves stable actor and population IDs, membership, origins, history,
mortality, physical bodies, items, cargo, Promises, and cross-owner references.
Reload cannot reroll the baseline or disposition. This is distribution of the
current 24-record catalog, not worldwide species breadth, ecological migration
behavior, reproduction, population recovery, general tactical mortality,
complete scent tracking, or the full bestiary.

Exact gameplay commit `29a745edbeda4dba7d2b8b3f4463f42e91a356fa`
passed feature CI `34333446897`, main CI `34338398784`, and Pages
`34338398816`. The complete local gate passed TypeScript, public-boundary and
player-facing-sync checks, 241 test files and 2,274 checks, a five-file
3,551,649-byte served web build, a 10-entry 3,743,257-byte runtime-only
Electron ASAR inspection, desktop/mobile/title smoke, and clean invariant,
save, release-surface, and visual audits. A cache-bypassed live comparison
matched all five production files byte-for-byte.

### Released Alpha33: sparse Alpine sibling

`0.3.3-alpha.33 — Talus and Sky` is **LIVE_VERIFIED**. The production catalog
becomes an append-only twenty-seven-record contract: the
complete twenty-four-record Alpha32 sequence is a frozen prefix, followed by
mountain goat, American pika, and golden eagle. The three additions do not
enter or regenerate habitat 11. `src/game/coreEcologyAlpineHabitat.ts` owns a
separate version-1 sparse Alpine derivation bound to root seed, canonical
signed region, floor-correct territory identity, canonical terrain, ridge and
elevation quality, baseline climate, food or prey support, and density. Empty
Alpine regions are authoritative. Negative and extreme coordinates use the
same derivation and validation path.

Representation remains a policy decision rather than a species shortcut.
Mountain goats are persistent addressable individual actors inside an atomic
`HERD`; American pikas are a conserved non-addressable aggregate over bounded
talus anchors; and a golden eagle is a solitary addressable actor. Pika
haypiles, talus signs, and activity are evidence projections, never decorative
pika bodies or an exact target. The shared locomotion surface gains optional
directed edge-grade authority. Only mountain goat opts in for this slice, so
ascent/descent thresholds and costs compose with ordinary terrain and intent
while every frozen-prefix species retains its Alpha32 surface shape and cost.

Golden-eagle activity reuses the generic activity owner through the
`ridge-soar-perch` affordance. A world-bound projector authenticates the Alpine
resident patch, immutable habitat allocation, canonical terrain hash, home
ridge, and bounded ridge candidates before it can mint transient perch and
soar-loop custody. The renderer does not author flight. Chart and Relief
consume the resulting `perched`, `resting`, or `ridge-soaring-flight` signal;
Relief raises the form, flaps it, and banks it as presentation. There is no
authoritative continuous 3D body trajectory or flight-physics claim.

The only new ecological response is representation-aware and nonlethal. The
existing aggregate-perception adapter accepts a golden eagle only as a current
lawful visual source. Existing terrain line-of-sight and occlusion derive any
pressure on an occupied American-pika anchor. The shared role/capability policy
then permits bounded quiet, suppress, or redistribute output while preserving
the aggregate population equation. Co-presence, hidden state, or an occluding
ridge conveys nothing. The transaction creates no exact pika target, capture,
injury, death, body, or private knowledge.

`src/game/regionalEcologyStateV2.ts` is the composite authority. It retains the
exact canonical `RegionalEcologyStateV1` as `base`, adds one append-only sparse
Alpine root and bounded Alpine hot snapshots, and uses the base active-region
window rather than creating a second camera-owned neighborhood. Projection
submits both children to one stable-distance group-atomic top-K with the
unchanged 24-addressable-actor ceiling. Every selected actor must appear in
the staged output; a whole group is admitted or left coarse. Commit validates
both children and applies their results atomically, so failure cannot advance
one ecology layer alone. A materialized Alpine actor cannot disappear through
a non-authoritative projection; no new Alpine mortality path exists.

Outer save 26 writes this version-2 composite. Fresh v26 worlds wrap a freshly
derived exact version-1 base without an adoption fiction. A normalized v25
envelope is authenticated first, then one deterministic receipt binds its
outer integrity, child integrity, frozen lineage, clock, and newly derived
Alpine root before the wrapper commits. Reload and interruption cannot reroll
the adoption or rewrite legacy actors, populations, groups, mortality, bodies,
items, cargo, Promises, or other cross-root facts.

Performance caches are bounded and non-authoritative. Alpine habitat caches at
most 128 immutable results by seed and region; ridge activity caches at most 64
authenticated authorities by habitat derivation, patch, and actor. A caller-
supplied terrain payload is always authenticated even on a cache hit, and
cache contents are neither serialized nor allowed to change canonical hashes.
The release audit measured six cold regional habitats in about 889 ms,
six cold Alpine habitats in about 273 ms, and 22 repeated habitat requests
collapsing to six derivation misses. Repeated warm runtime projection measured
near 151 ms after a roughly 2.47 s cold start; these are local diagnostic
witnesses, not universal device guarantees or live release evidence.

This first Alpine unit deliberately adds no new mortality, live-prey capture,
exact pika actor or target, reproduction, audible Living Voice, tactical
combat, polar breadth, worldwide ecology, Wave-F completion, or exhaustive
species-pair test matrix.

Exact gameplay commit `2a9ade01329fa731931a1cfe1884f5269ff59bcd`
passed feature CI `34394901344`, main CI `34400426580`, and Pages
`34400426443`. The complete release gate passed TypeScript, public-boundary and
player-facing-sync checks, 252 test files and 2,343 checks, a five-file
3,649,061-byte served web build, inspection of a 10-entry 3,840,669-byte
runtime-only Electron ASAR, desktop/mobile/title smoke, and clean invariant,
save, release-surface, performance, and visual audits. A cache-bypassed
comparison matched all 5/5 live production files byte-for-byte.

### Internal Alpha34 checkpoint: sparse polar-shore sibling

`0.3.3-alpha.34 — Coldwater Glint` is a preserved, non-independent internal
checkpoint first shipped cumulatively in Alpha39. Its species registry and
catalog retain the exact 27-record Alpha33 sequence as a frozen prefix and
append Atlantic capelin as record 28. The new record explicitly selects
aggregate-area representation and cannot enter actor identity, materialization,
individual locomotion, contact harm, or carcass ownership.

`src/game/coreEcologyPolarShoreHabitat.ts` owns a separate version-1 derivation
for rare cold, saline polar shoreline. Root seed, canonical signed region,
canonical terrain multiset, baseline climate, cold/salinity/shore/tidal-edge
signals, a deterministic density gate, and floor-correct two-region territory
identity determine lawful presence or absence. Mathematical territory bounds
are computed before independent coordinate-limit clamping, so every corner and
signed axis-edge member shares one bounded territory and exactly one claimable
host. An admitted habitat contains one capelin school of up to 64 units over at
most four stable saved-depth anchors; no capelin individual is generated.

`src/game/regionalPolarShoreResidents.ts` adapts that habitat into the generic
aggregate patch. `src/game/coreEcologyTidalAggregatePolicy.ts` and the existing
Tide Table owner derive lawful anchor use from saved elevation and current tide,
then apply the same dry-anchor safety and fixed-cadence, at-most-one-unit
redistribution contracts used by established tidal aggregates. Aggregate
population size always equals the sum of anchor units. Tide, density,
disturbance, and activity evidence remain in their existing owners rather than
being duplicated inside the polar adapter. Continuous runtime order—ecology
clock, tide, then small-world policy—and dormant reconciliation are byte-exact
across tide cycles; the proven periodic replay also bounds billion-tick gaps
without iterating raw elapsed time.

`src/game/coreEcologyPerception.ts`, the aggregate stimulus bridge, and the
small-world owner remain the perception/response boundary. Directly visible,
occupied, active, depth-usable capelin anchors produce only anonymous
`aquatic-activity`; the observation contains no aggregate ID, species, anchor
truth, or count. Chart, Relief, quick inspection, and ABOUT project restrained
surface dimples and brief glints from that same evidence. A representative
cross-owner witness places one existing gull near the school: unobstructed
vision can produce bounded nonlethal pressure and move at most one conserved
unit, while a ridge removes both observation and pressure. The result is
source-order/replay stable and creates no individual fish, mortality, carcass,
cargo mutation, or item transaction.

`src/game/regionalPolarShoreEcology.ts` is a sparse deviation root. Pristine or
merely observed baselines are rederived and never consume durable region
records; only real deviations persist under bounded record and byte ceilings.
Active-region selection first derives bounded origin keys and cheaply rejects
absent/non-host habitat, so it neither scans explored history nor reconciles an
unrelated inactive dormant delta. Habitat memoization is bounded and
non-authoritative.

`src/game/regionalEcologyStateV3.ts` retains the exact authenticated
`RegionalEcologyStateV2` base-and-Alpine child and adds the polar-shore root and
bounded hot snapshots as a sibling. Outer save 27 authenticates one sealed
outer-v26 child and adopts it exactly once without rewriting any earlier actor,
group, aggregate, mortality, body, item, cargo, Promise, or world fact. All
base, Alpine, and polar sources enter one insertion-order-independent,
group-atomic top-K capped at 24 addressable actors; capelin use no slot. Commit
validates and advances every child atomically, so a missing, stale, or malformed
polar output cannot partially advance V2.

The checkpoint adds no Arctic fox, polar bear, seal, new seabird, snow or ice
behavior, new mortality, live-prey capture, reproduction, audible Living Voice,
or Wave-F completion. This section records its internal implementation
architecture, not a claim that Alpha34 was independently released, deployed, or
live-verified; the checkpoint is part of the cumulative Alpha39 release.

### Internal Alpha35 checkpoint: one addressable cold-shore actor

`0.3.3-alpha.35` is a preserved, non-independent internal checkpoint at commit
`372eaa9`, first shipped cumulatively in Alpha39; commit `950b2b5` preserves the
preceding Alpha34 checkpoint. Alpha35 retains Alpha34's exact 28-record catalog
as a frozen prefix and appends Arctic fox as record 29.
`src/game/coreEcologyColdShoreHabitat.ts` derives a separate sparse cold-shore
source from authenticated Alpha34 polar-shore truth. A source admits exactly
one solitary addressable fox only when all-tide-dry cold ground is reachable
from a viable, admitted capelin school; unsupported habitat remains empty.

`src/game/regionalColdShoreResidents.ts` converts that admission into the same
persistent individual-actor shape used by established wildlife. Stable
identity, perception, attention, condition, dormant autonomy, terrestrial
locomotion, movement memory, materialization, anonymous canid-track evidence,
knowledge-honest quick inspection/ABOUT, Chart/Relief projection, and rendering
remain shared owners. Declarative actor-address, food-investigation,
shoreline-foraging, ground-evidence, and movement-memory capabilities opt the
fox into those paths; there is no Arctic-fox-specific controller.

The emergence seam remains aggregate and nonlethal. A fox can receive only
current anonymous aquatic activity from an occupied, active, depth-usable
capelin anchor that passes ordinary line of sight. Generic trophic and
aggregate policy may then tighten activity or redistribute at most one existing
unit while conserving the school total. An occluding ridge removes the
observation and the response. The transaction creates no exact fish identity,
target, capture, consumption, injury, death, carcass, item, cargo mutation, or
offscreen player knowledge.

`src/game/regionalColdShoreEcology.ts` persists only real deviations and
rederives pristine baselines. `src/game/regionalEcologyStateV4.ts` wraps the
exact authenticated V3 base/Alpine/polar-shore child beside the cold-shore root
and bounded snapshots. Outer save 28 authenticates and adopts one sealed v27
child exactly once. Every retained and new ecology source enters the same one
insertion-order-independent, group-atomic global top-K capped at 24 addressable
actors; commit validates and advances all children atomically. There is no
per-layer actor budget and no V3 owner relabeling or regeneration on reload.

The checkpoint adds no live-prey capture or consumption, new mortality,
reproduction, audible Living Voice, seal, polar bear, new seabird, snow or ice
behavior, full migration, Wave-F completion, Wave-G breadth, Directive 04_1
completion, or standalone release. Local commit `372eaa9` preserves Alpha35;
it carries no independent push, deployment, Pages result, or LIVE_VERIFIED
claim, while its architecture ships within Alpha39.

### Internal Alpha36 checkpoint: polar-consumer composition

`0.3.3-alpha.36 — Breath Between Tides` is a preserved, non-independent
internal checkpoint at commit `29b7385`, first shipped cumulatively in Alpha39.
It keeps Alpha35's exact 29-record catalog and
`RegionalEcologyStateV4`/outer-v28 state as an authenticated child, then appends
harbor seal and polar bear as records 30 and 31. The separate
`src/game/coreEcologyPolarConsumerHabitat.ts` owner derives one seal only when
the existing polar-shore source supplies admitted capelin, connected cold saline
water, and a distinct dry haulout. A rarer bear candidate is admitted only after
that exact seal candidate exists; unsupported sources remain empty.

Both are ordinary solitary addressable actors. Stable identities, body and coat
variation, perception, attention, condition, amphibious traversability,
materialized/coarse state, sparse dormant persistence, ABOUT, selection, and
Chart/Relief presentation use the existing shared owners. The seal adds a
species-neutral shore-water activity vocabulary over one authenticated
foraging-water/dry-haulout pair; the preserved river-otter verbs remain
byte-stable. The bear receives ordinary role-based live-prey pursuit. Neither
species owns a detector, controller, pathfinder, render allowance, or private
save budget.

The first Wave-G boundary hardening separates species-neutral
`amphibious-route` eligibility from authenticated `shore-water-activity`.
River otter, harbor seal, and polar bear retain the same land/water route
surface and travel costs; only otter and seal own the shore-water schedule and
destination authority. A route capability cannot mint activity anchors, and a
shore-water activity capability is invalid unless its actor also owns the
shared route prerequisites. This is derived policy only: it does not alter the
Alpha36 identity catalog, activity-profile prefix, regional state, or save
schema.

One representative emergence witness composes those declarations. Current
unobstructed sight lets the seal apply bounded nonlethal pressure to the
conserved capelin aggregate and lets the bear pursue the visible seal while the
seal flees. Terrain occlusion removes both chains. The interaction conserves
every aggregate unit and creates no contact, capture, consumption, injury,
death, carcass, item, cargo, player-harm, or dog-harm transaction. Flee motion
continues through the same intent and amphibious traversability rules rather
than a seal-versus-bear script.

`src/game/regionalPolarConsumerEcology.ts` owns sparse deviations and rederives
pristine baselines. `src/game/regionalEcologyStateV5.ts` wraps the exact V4
child beside that root and bounded hot snapshots. Outer save 29 authenticates
and adopts one sealed v28 child exactly once. Base, Alpine, polar-shore,
cold-shore, and polar-consumer sources all enter the same insertion-order-
independent, group-atomic global top-K capped at 24 addressable actors, followed
by one all-or-nothing commit. Signed and extreme coordinates, region-window
exchange, interruption, serialization, and reload cannot reroll or duplicate
either actor.

This checkpoint closes the directive's **bounded Wave-F role coverage**: Alpine
herbivore/prey/raptor plus polar forage, cold fox, cold marine prey, and cold
predator now survive the shared architecture. It does not complete Wave G,
Directive 04_1, worldwide biodiversity, sea ice, snow, reproduction,
recruitment, population recovery, broad migration, complete scent, broad
mortality, or audible Living Voice. Alpha36 was not independently pushed,
deployed, or LIVE_VERIFIED; its architecture ships within Alpha39.

### Internal Alpha37 checkpoint: first Wave-G breadth cohort

`0.3.3-alpha.37 — Estuary Surface Break` is a preserved, non-independent
internal checkpoint first shipped cumulatively in Alpha39. It preserves
Alpha36's exact 31-record catalog and
`RegionalEcologyStateV5`/outer-v29 state as an authenticated child, then appends
bay anchovy, Atlantic ghost crab, great blue heron, common tern, and osprey as
records 32–36. `src/game/coreEcologyBreadthHabitat.ts` and
`src/game/regionalBreadthCohort.ts` admit this cohort only where signed terrain,
salinity, shore distance, carrying capacity, territory, density, regional
quiet, and the exact local bay-anchovy substrate agree. Unsupported country
remains empty.

Bay anchovies and Atlantic ghost crabs are conserved non-addressable
aggregates. Heron and osprey are solitary persistent actors; common terns form
one indivisible two-to-four-member flock. The shared Tide Table keeps anchovy
activity in usable submerged water and exposes ghost-crab activity on suitable
tidal flat without synthesizing exact fish or crabs. Existing identity, group,
aggregate, perception, movement, presentation, and ABOUT owners remain
authoritative.

That checkpoint's activity registry contains eight reusable archetypes across eleven
species. Great blue heron appends the `anchored-wader` profile: it can relocate
by air to its authenticated tide-depth-safe wading ground, then wait, scan, or
search there. Common tern and osprey reuse `aerial-surface-opportunist`, with
air-only travel toward a current lawful anonymous surface opportunity or back
to an authenticated habitat anchor for rest. Immediate lawful danger and other
urgent intent retain priority. These are bounded daylight/rest routines, not
full circadian life or authoritative continuously simulated 3D flight.

One representative emergence witness composes common-tern visual perception,
shared trophic policy, and the conserved anchovy aggregate. Clear current line
of sight permits bounded nonlethal pressure; an intervening ridge removes the
observation and response. Every anchovy unit remains conserved, and no exact
fish target, capture, consumption, injury, mortality, body, item, cargo, player,
or dog transaction is created.

`src/game/regionalEcologyStateV6.ts` wraps the exact V5 child beside one
append-only sparse breadth root. Outer save 30 authenticates and adopts one
sealed outer-v29 Alpha36 child exactly once. Base, Alpine, polar-shore,
cold-shore, polar-consumer, and breadth residents enter the same insertion-
order-independent, group-atomic top-K capped at 24 addressable actors and one
all-or-nothing commit. This opens Wave G toward 45 core-wildlife profiles but
does not by itself complete Wave G or Directive 04_1. Dedicated Wave-G
performance proof, seamless actor-crossing proof, sound, capture, mortality,
reproduction, and continuous 3D flight remain outside this checkpoint. Alpha37
was not an independent release; its architecture ships within Alpha39.

### Internal Alpha38 checkpoint: Marsh Channel Web

`0.3.3-alpha.38 — Marsh Channel Web` is a preserved, non-independent internal
checkpoint first shipped cumulatively in Alpha39. It preserves Alpha37's exact
36-record catalog, epoch-1 activation,
and `RegionalEcologyStateV6`/outer-v30 envelope, then appends Atlantic menhaden,
mummichog, grass shrimp, blue crab, greater yellowlegs, belted kingfisher, and
double-crested cormorant as records 37–43. The existing breadth root activates
the cohort at epoch 2; no new ecology or outer-save wrapper is introduced.

Menhaden, mummichog, grass shrimp, and blue crab are conserved non-addressable
aggregates. Greater yellowlegs form one group-atomic flock of two to four
persistent actors, the belted kingfisher remains solitary, and double-crested
cormorants form one group-atomic flock of two to three. Signed terrain,
salinity, channel and shore structure, water depth, tide, carrying capacity,
territory, density, regional quiet, and exact aggregate substrate decide
admission. Yellowlegs require grass shrimp, kingfishers require mummichog, and
cormorants require menhaden, so unsupported country remains honestly empty.

Shared aggregate and Tide Table policy moves only conserved units among
authenticated anchors. Yellowlegs reuse anchored-wader activity, kingfishers
reuse air-only surface-opportunity and perch behavior, and cormorants use the
shared diving-waterbird profile for lawful surface swimming, diving, resting,
and flight relocation. Immediate danger remains authoritative. Chart, Relief,
quick inspection, and ABOUT share current identity and presentation authority.
This is bounded activity and presentation, not continuously simulated 3D
flight.

One representative emergence witness composes lawful cormorant perception and
the conserved menhaden aggregate. Clear current line of sight can redistribute
one unit nonlethally; an occluding ridge removes the observation and response.
Every unit remains conserved, and the interaction creates no exact prey,
capture, consumption, injury, mortality, body, item, cargo, player, or dog
transaction.

Valid epoch-1 outer-v30 worlds authenticate before appending epoch 2 exactly
once at their saved tick. Their exact Alpha37 activation, resident prefix,
identities, units, and genuine deviations remain intact; repeated load is a
no-op. All ecology sources continue through the same insertion-order-
independent, group-atomic top-K capped at 24 addressable actors and one atomic
commit. Alpha38 reaches 41 of the directive's 45 core-wildlife profiles. At
this checkpoint one final coherent four-profile cohort and the directive
closure gates remained. Dedicated Wave-G performance and seamless
actor-crossing closure evidence arrived with Alpha39; sound,
capture/consumption, new mortality/bodies, reproduction, full circadian life,
and continuous 3D flight remain absent. Alpha38 was not an independent release.

### Historical LIVE_VERIFIED Alpha39: Saltmarsh Small Worlds

`0.3.3-alpha.39 — Saltmarsh Small Worlds` preserves the exact Alpha38
forty-three-record catalog and breadth epochs 1–2, then appends eastern
saltmarsh mosquito, marsh periwinkle, seaside sparrow, and diamondback terrapin
as records 44–47 through the same append-only breadth root at epoch 3. This
produces exactly 45 core-wildlife profiles plus the two separate human and
domestic-dog foundation records. Outer save 30 and `RegionalEcologyStateV6`
remain unchanged.

Mosquitoes and periwinkles are conserved non-addressable aggregates over at
most two authenticated anchors each. Seaside sparrows form one group-atomic
flock of two to four persistent actors and use shared perch-forage activity;
the diamondback terrapin is one solitary persistent reptile using shared
amphibious-margin activity and locomotion. A sparrow source requires the exact
local mosquito substrate, while a terrapin source requires periwinkle.
Terrain, salinity, marsh structure, depth, tide, carrying capacity, stable
territory, density, and regional quiet preserve lawful absence.

Aggregate evidence remains anonymous and cannot be selected as an invented
insect or snail. Current lawful observation can produce bounded nonlethal
terrapin pressure on periwinkle activity; an intervening ridge removes both
the observation and response while conserving every unit. Chart, Relief,
quick inspection, and ABOUT share the same knowledge boundary and persistent
actor identity. These behavior and presentation states do not create bites,
disease, capture, consumption, injury, mortality, a body, an item, cargo, or
continuous 3D flight.

An authenticated outer-v30 epoch-2 state appends epoch 3 exactly once at its
saved tick. Epochs 1 and 2, every prior resident and aggregate identity, and
every genuine deviation remain an exact prefix; reload cannot reroll the
cohort. Every ecology owner still joins one insertion-order-independent,
group-atomic top-K capped at 24 addressable actors and one atomic conservation
commit. Shared performance and seamless-crossing closure coverage plus
representative emergence witnesses validate the reusable architecture rather
than a bespoke species-by-species or N² pair matrix.

Alpha39 remains the historical **LIVE_VERIFIED** cumulative Directive 04_1
biodiversity closure at the chosen 45 core-wildlife / 47 living-record
boundary. It adds no sound/Living Voice,
full circadian behavior, reproduction, migration, new mortality, or broader
capture system. Exact gameplay commit
`40bfeebde94729ffb1034764ffba3e18100ac1fc` is preserved beneath timeout-only
verification descendants `7455fd0` and
`c67f30b10066f60372d2cf84e1e6eacae1cbd31f`; neither changes production code
or artifacts. CI `34905718204` and Pages `34905718214` each passed 275 test
files / 2,633 checks for `c67f30b`, Pages published five files totalling
4,072,920 bytes, and the first cache-bypassed comparison matched all 5/5 live
production files byte-for-byte. Directive 04_1 is closed. At that released
checkpoint, the next authorized directive was 04_1A **The Turning Day**.
Alpha53 has now shipped that bounded architecture as **LIVE_VERIFIED** and
closes 04_1A. Current **LIVE_VERIFIED** Alpha 60 closes Directive 04_1B **The
Breathing Room**; 04_2 **The Living Voice** is active in the local unpublished
candidate.

## Bounded habitat-derived core-wildlife assemblage

Current broad physical predator pressure requires the explicit
`large-predator-pressure` runtime capability as well as the predator role and
non-small-predator declaration. The current unpublished correction declares it
for black bear, brown bear, gray wolf, cougar and polar bear. A predator diet
alone cannot classify golden eagle, heron, osprey or cormorant as a large threat
to a goat, human or dog; ordinary direct sight retains the bird's identity.
Shared aquatic aggregate pressure, small-prey pressure and crow/aerial-predator
relations retain their existing owners. This capability is independent of
live-prey pursuit and the deliberately narrow mortality/body policy: a brown
bear can exert nonlethal pressure without gaining a new attack or body verb.
No species-pair alarm rule, generator change or save-schema change is implied.

Release `0.3.3-alpha.31 — High Country Shadows` is **LIVE_VERIFIED** and extends the
catalog to 24 records by appending cougar and brown bear at the exact existing
deterministic remote temperate-upland/forest-edge source. The release gate gives active owners only
to behavior and presentation that exists: shared placement, groups, direct
perception, actor-owned locomotion, bounded materialization, save/load,
knowledge-honest Chart/Relief/ABOUT, mobile parity, and representative
player-independent behavior. Broad niche, food-web, sensing, and voice rows
remain foundation-only where their complete runtime surfaces do not exist.
Each appended species receives a stable habitat-population record; persistent
actors exist only when carrying capacity supports them, preserving honest
ecological absence.
Species-directed dog interaction is an intentional no-response; ordinary
lawful large-predator perception may still drive a non-harmful dog or porter
reaction through the shared cognition path.

Exact gameplay commit `d124f71c1c8656db68a764d048c9a1e5d14163a7` passed
feature CI `34241221388`, main CI `34243147747`, and Pages `34243147753`.
The complete local gate passed TypeScript, public-boundary and
player-facing-sync checks, 230 test files and 2,197 checks, a five-asset
3,394,874-byte served web build, a 10-entry 3,586,482-byte runtime-only
Electron ASAR inspection, desktop/mobile/title smoke, and clean invariant,
save, release-surface, and visual audits. A cache-bypassed live comparison
matched all five production files byte-for-byte.

For historical continuity, exact Alpha 30 gameplay commit
`56dc4812c7c41b6227bae1b0273701b51076f34a` passed feature CI
`34215120610` and Pages `34216318509`. Verification-only descendant
`65e2ba59929a296139e578adbd03621f91d93fc2` raises the CI and Pages job
ceilings plus one slow integration-test allowance without changing production
code or artifacts; it passed main CI `34221064966` and Pages `34221064916`.
That local gate passed TypeScript, public-boundary and player-facing-sync
checks, 227 test files and 2,177 checks, a five-asset 3,365,373-byte served web
build, a 10-entry 3,556,981-byte runtime-only Electron ASAR inspection,
desktop/mobile/title smoke, and clean invariant, save, release-surface, and
visual audits. Its cache-bypassed live comparison matched all five production
files byte-for-byte.

Habitat analysis version 11 first reproduces the complete canonical version-10
source and population sequence, then evaluates only the cougar and brown-bear
population records at that already-selected source and appends supported
populations. Outer session version 24 likewise authenticates and adopts a
sealed version-23 Beyond the Harbor payload exactly once before adding those
records and any capacity-supported actors. Existing mortality, finite-
body, claim, consumption, group, and allocation history remains exact through
adoption. The core-ecology patch remains version 3 and its aggregate record
remains version 5.

Gray-wolf or cougar role appraisal may produce pursuit pressure through the shared
perception and locomotion owners and may use the existing exact-contact harm
kernel, but it does not widen the eligible target contract: only a solitary,
addressable, currently identified marsh rabbit can enter the current
exact-contact mortality transaction. Grouped elk, grouped deer, and every
other group member fail closed for harm. Brown bear has no live-prey pursuit or
contact in this unit. A wild boar, gray wolf, cougar, or brown bear can lawfully
see, reach, claim, and consume an already-existing body through the same finite-
resource conservation seam, and eligible solitary predators may guard a claim.
Wild boar, elk, and gray wolf have authored voice-pattern data but no audible
runtime call; cougar and brown-bear voice behavior is not implemented. Their
species-directed dog interaction rows are deliberately
unimplemented no-responses. This does not suppress ordinary non-harmful dog or
porter reactions to a lawfully perceived `large-predator`. Tactical pack combat, group mortality, broader animal harm,
ecological migration, worldwide ecology, and the rest of Wave E are outside
this release.

`src/sim/coreWildlifeIdentity.ts` owns generation-v1 profiles for the complete
released 45-profile core-wildlife roster through eastern saltmarsh mosquito,
marsh periwinkle, seaside sparrow, and diamondback terrapin.
Persistent individual identity applies only to addressable species; brown rat,
southern leopard frog, Atlantic silverside, Atlantic marsh fiddler crab, and
American pika explicitly select aggregate representation and cannot enter the
individual actor constructor. Individual identity derives from the root seed,
signed origin region, semantic population key, population ordinal, species,
and generation version—not array order or camera entry. Profiles supply only
bounded roles, affinities, behavior thresholds, morphs, temperament pairs, and
trait ranges that have implemented meaning. Current outcomes remain bounded to
lawful observation, nonlethal pressure or avoidance, movement, group alarm,
authenticated physical-resource claims, the exact
fox/gray-wolf/cougar-to-solitary-rabbit mortality/body gate, and Alpha33's
nonlethal eagle-to-pika activity pressure. `src/game/livingSpeciesRegistry.ts`
preserves the twenty-four-record Alpha32 roster and complete 27-record Alpha33
catalog as frozen compatibility prefixes, then retains the append-only
Alpha34–39 lineage through the released forty-seven-record roster. It owns
representation, addressability, presentation, locomotion, ABOUT nouns, and
relative senses. `src/game/livingSpeciesCatalog.ts` gives that exact
forty-seven-record roster a strict versioned contract without treating
aggregate populations as actors.
Every core-wildlife module declares each broad interaction target class as
supported or an intentional no-response; omissions fail closed. The catalog
does not imply absent health, broad death, full circadian behavior, ecological
migration or reproduction, foliage consumption, or worldwide species breadth.

The internal Alpha34 checkpoint preserves those twenty-seven records as an
exact compatibility prefix and appends Atlantic capelin as record 28. Its
catalog profile selects non-addressable aggregate representation; any
individual identity, actor construction, materialization, locomotion, target,
or carcass path therefore fails closed. This non-independent checkpoint is now
part of the cumulative forty-seven-record Alpha39 release contract.

The internal Alpha35 checkpoint preserves the complete twenty-eight-record
Alpha34 sequence as an exact prefix and appends Arctic fox as record 29. The
new profile selects solitary individual representation and shared address,
perception, attention, terrestrial movement, evidence, ABOUT, and presentation
capabilities. Habitat still controls whether the one-unit population and its
actor exist; the record itself does not spawn a fox. This non-independent
checkpoint is part of the cumulative Alpha39 release contract.

The internal Alpha36 checkpoint preserves that complete
twenty-nine-record sequence and appends harbor seal and polar bear as records
30–31. Both select solitary individual representation and shared address,
perception, attention, amphibious movement, ABOUT, and presentation owners. The
seal additionally selects the reusable shore-water activity archetype; the bear
selects role-based live-prey pursuit but no contact or mortality policy. Habitat
still owns existence: a seal requires exact capelin/water/haulout support and a
bear requires that exact seal candidate. These records are part of the
cumulative Alpha39 release contract.

The internal Alpha37 checkpoint preserves that complete 31-record
sequence and appends bay anchovy, Atlantic ghost crab, great blue heron, common
tern, and osprey as records 32–36. The first two select conserved aggregate
representation. Heron and osprey select solitary individual representation;
terns select one group-atomic flock. All five use the one breadth habitat,
regional, and persistence owner rather than rewriting the Alpha36 layers.
Heron selects `anchored-wader`; tern and osprey reuse
`aerial-surface-opportunist`. These records are part of the cumulative Alpha39
release contract.

The internal Alpha38 checkpoint preserves that exact 36-record
sequence and appends Atlantic menhaden, mummichog, grass shrimp, blue crab,
greater yellowlegs, belted kingfisher, and double-crested cormorant as records
37–43. The first four select conserved aggregate representation; yellowlegs and
cormorants select group-atomic flocks, and the kingfisher remains solitary.
All seven join the same breadth owner at epoch 2. The addressable birds use
shared activity, perception, movement, grouping, ABOUT, and dual-view
presentation, while the aggregates use the shared aggregate and tide owners.
These records are part of the cumulative Alpha39 release contract.

Released Alpha39 preserves that complete 43-record
sequence and appends eastern saltmarsh mosquito, marsh periwinkle, seaside
sparrow, and diamondback terrapin as records 44–47 through breadth epoch 3.
The first two select conserved aggregate representation with at most two
authenticated anchors. Seaside sparrows select one group-atomic flock of two
to four and shared `perch-forage`; the solitary terrapin selects shared
`amphibious-margin-forager`. Sparrow and terrapin admission depends on the
exact local mosquito and periwinkle substrates respectively. These records
complete the forty-seven-record release while preserving the exact 27-record
Alpha33 compatibility prefix.

`src/game/livingSpeciesReleaseGate.ts` authenticates build-owned evidence for
that exact forty-seven-record roster against 30 stable completeness criteria. A
structurally valid caller claim cannot mark itself ready, absent behavior cannot
smuggle an evidence owner, and biologically inapplicable criteria require narrow
ecological proof. Every record may claim only its actual habitat, policy,
activity, perception, movement, aggregate, custody, materialization,
presentation, persistence, mobile, and representative-scenario owners. Separate
bounded reports authenticate prior waves without promoting them to worldwide
ecology, and later appends cannot rewrite the frozen Alpha22 convergence report.
Alpha39 evidence is precise: save/load requires the runtime-v30/V6 owner and
epoch-3 activation; shared activity is active for the sparrow flock and
terrapin; one terrapin-to-periwinkle visible-versus-occluded scenario owns
representative player-independent evidence; and shared Wave-G performance and
seamless actor-crossing owners close those architecture-wide rows without
creating per-species tests. Sound, contact, mortality, bodies, reproduction,
snow/ice, and full scent remain blocked or unimplemented for the new profiles;
deployment remains false only in the immutable build-owned report because a
bundle cannot self-attest publication.
Immutable build-owned
publication fields remain
false because a bundle cannot attest its own post-deployment byte identity.
Shared invariants, deterministic and signed/extreme-coordinate properties,
conservation, and representative scenarios exercise the architecture without a
species-by-species or quadratic animal-pair matrix. This is a fail-closed
build-evidence boundary, not a player statistic or self-authored deployment
claim. Its exact 45-profile core-wildlife / 47-record catalog boundary passed
the cumulative Directive 04_1 release checkpoint in Alpha39.

`src/game/coreEcologyHabitat.ts` preserves the frozen Wave-A analysis for deer, gulls, and black bears, the version-2 harbor-edge extension for brown rats and domestic cats, the version-3 marsh-rabbit and marsh-fox extension, the version-4 fish-crow, northern-harrier, and southern-leopard-frog extension, the version-5 Tide Table extension, version-6 American-black-duck habitat, and version-7 North American river otter habitat. Habitat version 8 preserves the complete version-7 population and anchor record as an exact prefix, then appends one deterministic domestic-yard anchor and one two-to-three-member domestic-chicken population. Habitat version 9 preserves that complete record exactly before appending one separate pen anchor and exactly two domestic-goat individuals in one herd. Habitat version 10 preserves the complete version-9 record exactly, then appends one deterministic remote temperate-upland/forest-edge source and the wild-boar, elk, and gray-wolf population records. Habitat version 11 first synthesizes and canonicalizes that complete version-10 result unchanged, then derives cougar and brown-bear population records at its exact selected remote source; it does not recompute the existing trio's population pressure or trend, and unsupported capacity remains an authoritative zero-unit population with no allocation. Unlike terrain-derived wild habitat, both domestic populations are supported by the existing starting-settlement relationship; the stable world seed, signed origin, settlement focus, and generation version derive their anchors and allocations. The pen remains separated from the yard and every established individual allocation. Each supported addressable population receives bounded individual allocations, all members share the existing individual occupancy plane, and each eligible social population is represented by one stable group while any cougar or brown bear remains solitary. Existing rat, frog, fish, and crab populations retain their aggregate occupancy planes and all tidal metadata remains exact. Inputs are call-order independent and valid at signed extreme region addresses; the runtime rederives the expected habitat on load and rejects a mismatch instead of accepting a reroll.

`src/game/coreEcology.ts` owns the aggregate-capable patch. Alpha 31 retains core patch version 3 and aggregate record version 5 while raising the bounded population-record ceiling from 16 to 18 for the two appended solitary habitat records; the remaining per-patch hard limits stay at 48 exact representative members, 24 materialized actors, four aggregate populations, four anchors per aggregate, 24 retained evidence records, and 16 retained disturbances. The current composite catalog can contain fourteen aggregate profiles across separate authenticated ecology children without any one patch exceeding that bound; Saltmarsh Small Worlds narrows its two additions to at most two anchors each. Each representative declares the population units it represents; canonicalization requires exact conservation. One committed individual death transfers exactly one represented unit into the mortality ledger, retires that actor, and leaves any remaining units as abstract reserve rather than collateral death or replacement actors. Alpha 28's atomic social-group materialization remains: every member enters full detail together or all remain coarse. Current group-member death fails closed. Candidate input order and camera traversal cannot decide who exists. A coarse individual receives no local observation frame and cannot invent a sighting, target, contact, resource claim, movement, or decision.

`src/game/coreEcologyGroups.ts` adds one persistent group record when an eligible deer, gull, fish-crow, domestic-chicken, domestic-goat, wild-boar, elk, gray-wolf, mountain-goat, common-tern, greater-yellowlegs, double-crested-cormorant, or seaside-sparrow population has at least two representatives; the current other addressable profiles remain solitary. Crow, chicken, goat, boar, and wolf groups use stable `CROW-FLOCK`, `CHICKEN-FLOCK`, `GOAT-HERD`, `SOUNDER`, and `PACK` namespaces; grouped birds use `FLOCK`; deer, elk, and mountain goat use `HERD`. All retain the shared membership, cohesion, phase, component-anchor, signal, split/rejoin, and aftermath contracts. Signals reach additional members only on exact coarse cadence rather than setting every hidden target at once. A fully coarse group may still undergo its bounded player-absent, nonlethal, cargo-neutral pressure transition; it remains unavailable as automatic player knowledge. In current detailed simulation, a split additionally requires a caused flee/retreat and exact separation, while distance alone is inert. Cohesion can later produce a saved reunion, and that transition is propagated through coarse stepping for an already-authoritative consumer. Full-to-coarse reconciliation copies lawful member positions into the group anchors; coarse-to-full return reuses the same actor IDs and places members around their saved component anchor without duplication. No authored home-return schedule exists: settlement custody is stable social/home authority, not a second movement controller.

`src/game/coreEcologyPerception.ts` converts current in-window visual contacts into the same classified observation vocabulary used by living actors. Terrain, structures, facing, weather visibility, and static target light affect current visual contact; target movement salience and species-specific visual acuity are still narrow inputs rather than a complete universal sensory field. Its Tide Table bridge selects a currently materialized surface observer only through the generic conjunction of `actor-address`, `surface-opportunity`, and `tidal-activity` runtime capabilities. It can then add a same-tick anonymous `aquatic-activity` visual fact—currently available to gull, snowy egret, American black duck, North American river otter, harbor seal, great blue heron, common tern, and osprey—only when an occupied, active, depth-usable fish or crab anchor passes the same direct line-of-sight test. The fact contains an approximate area but no aggregate identity, species, exact count, or actor ID. This observation capability alone does not grant aquatic locomotion, ecological pressure, capture, or consumption; separate roles and policy decide whether a lawful observation can affect an aggregate. `src/game/coreEcologyTrophic.ts` then resolves only ecologically actionable relations from shared roles, runtime capabilities, and explicit physical size classes. Bears remain large-predator pressure to prey, dogs, humans, and smaller predators; a domestic dog can pressure a rabbit or fox; a fox, cat, northern harrier, cougar, or gray wolf can recognize its eligible prey through the shared broad predator rules. Current waders and aquatic foragers can exert only their declared nonlethal aggregate pressure. A fish crow directly seeing a northern harrier can emit a shared alarm. Only a crow whose retained identified direct-vision alarm still names that aerial predator presents `mobbing-pressure` back to the harrier; mere co-presence does not. That pressure can interrupt a finite nonlethal harrier pursuit without classifying the crow as prey. Other committed alarms propagate through bounded, weather/wind-modified hearing as anonymous approximate areas with no emitter ID/species, hidden target, or internal motive. The active set is tightly capped; broader density still requires spatial buckets instead of all-pairs scanning.

`src/game/coreEcologyAggregatePerception.ts` is the shared runtime bridge from current world truth into the current conserved aggregate species: brown rat, southern leopard frog, Atlantic silverside, Atlantic marsh fiddler crab, American pika, Atlantic capelin, bay anchovy, Atlantic ghost crab, Atlantic menhaden, mummichog, grass shrimp, blue crab, eastern saltmarsh mosquito, and marsh periwinkle. Each materialized visual source enters as one canonical addressable living species; unknown species and non-addressable sources fail closed. Existing terrain/weather occlusion resolves per-anchor contact before `src/game/coreEcologyAggregatePolicy.ts` derives a response from shared runtime capabilities, ecological roles, and trophic size classes rather than a source-species allowlist. Existing examples include predator pressure on earlier small-prey aggregates, eagle pressure on pika, Arctic-fox or harbor-seal pressure on capelin, common-tern pressure on anchovy, cormorant pressure on menhaden, and terrapin pressure on periwinkle. Neutral co-presence produces no stimulus. The capability-selected observation side of the same bounded bridge serves current eligible observers without species-specific prey detectors; only a separately supported role can turn that observation into aggregate pressure. The Alpha39 representative scenario proves one exact positive/negative boundary: a terrapin with clear current sight can pressure an occupied periwinkle anchor, while an intervening ridge removes the observation and response. Both branches conserve the complete periwinkle population and create no exact prey, capture, consumption, injury, mortality, body, item, cargo, or automatic player knowledge. The bridge also derives rat attraction only from currently existing loose provision objects through the shared wind- and rain-shaped scent evaluator, and weather pressure from authoritative rain plus each saved anchor's terrain exposure. It submits a bounded canonical stimulus frame rather than giving any aggregate kernel access to actor lists, player state, weather, or cargo. `src/game/coreEcologySmallWorld.ts` then applies species-owned response rules while retaining canonical `cat` and `dog` aliases in its transient stimulus/event payloads and the v2 shape for pre-existing rat interactions; no serialized event record depends on those aliases. Lawful pressure can quiet or redistribute only an existing eligible unit on the species' fixed cadence, and a tidal fish destination must additionally be usable at the current depth. Identity, total units, and anchor custody remain conserved. These are aggregate population responses, not individual cognition, capture, or feeding.

`src/game/coreWildlifeActor.ts` turns accepted observations, bounded needs/condition, generated temperament, role affinities, runtime capabilities, and action accessibility into alarm, flee, retreat, guard, scavenge, forage, bounded pursue, rest, observe, or disengage. A proposal never mutates another actor or item. Rabbits retain causal alarm and flight; hungry foxes, gray wolves, and cougars retain finite prey pursuit and pressure-based interruption. Only the separate mortality resolver may translate an extant current fox, wolf, or cougar pursuit plus exact eligible-rabbit contact into damage. Brown bear has no live-prey pursuit or contact policy in this unit. Fish-crow alarm/mobbing, nonlethal harrier pursuit, cat food competition, and rain retreat retain their prior bounded rules.

`src/game/coreWildlifeMortality.ts` is the narrow species-neutral harm kernel.
It accepts only a named `predator-contact` event backed by the current exact
attacker and target, current identified direct-vision belief, matching active
pursuit/resource link, and exact physical contact. The current runtime policy
permits a marsh fox, gray wolf, or cougar against an individually represented solitary
marsh rabbit; stale, anonymous, hidden, aggregate, non-pursued, or group-member target candidates
fail closed. It produces injury or death without deciding population or body
state.

`src/game/coreEcologyMortality.ts` owns the exact-once ecological transaction.
A death stores the retired actor, named event, represented-unit accounting,
exactly one removed population unit, any remaining abstract reserve, and the
stable body identity. Replay cannot retire the actor or remove a unit twice.
`src/game/coreWildlifeCarcass.ts` owns one finite physical body per death event:
the stable carcass ID and death position do not reroll, original resource equals
remaining plus consumed plus decayed resource, claims are exclusive, and
feeding consumes one authenticated unit. A depleted record remains as a
finite tombstone rather than spawning new food. The current source connects
ordinary direct vision, shared reach, claim, and feeding for marsh foxes, fish
crows, wild boars, gray wolves, cougars, and brown bears, with guarding
available to eligible solitary-predator policy; it does not
schedule decomposition or support body drift, dragging, harvesting, scent,
insects, or other body-creation paths.

`src/game/wildlifeCarcassPresentation.ts` derives Chart and Relief projections
only from the player's current lawful direct-detail perception. It may expose a
species body or remains when current clarity supports that identification,
otherwise only a generic animal body/remains. It never discloses the attacker,
cause, hidden resource count, claimant, or offscreen history. Direct injury,
death, and feeding announcements use the same event-time observation law;
returning later may reveal the persistent body but never creates retrospective
narration.

`src/game/coreEcologySpeciesRuntimePolicy.ts` composes representation, addressability, locomotion, group organization, aggregate response, food investigation, shared alarm, mobbing, pursuit, activity, evidence, and presentation capabilities without a species-pair behavior table. `src/game/coreEcologyAggregatePolicy.ts` separately owns aggregate namespaces, anchor bounds, activity/evidence vocabulary, rain response, and the shared role/trophic response bridge, so aggregate consumers do not branch on ad hoc species checks. `src/game/coreEcologyTidalTable.ts` owns only the pure target-tick tide/depth projection and its conservation-safe fish redistribution/activity step; it neither regenerates habitat nor owns cargo, consumption, or mortality. Its completed tidal-edge opportunity is recorded in the durable aggregate operation clock even when no unit moves. Released Alpha 22 introduced `src/game/coreEcologyActivityAffordance.ts` with six reusable archetypes. The released Alpha39 registry has eleven archetypes across sixteen participating species: the original `perch-watch`, `low-quartering`, `tidal-wader`, `dabbling-waterfowl`, `shore-water-forager`, and `aerial-surface-opportunist`, plus `ridge-soar-perch`, `anchored-wader`, `diving-waterbird`, `perch-forage`, and `amphibious-margin-forager`. Each profile declares required runtime capabilities, locomotion class, allowed travel media, destination authority, observation affordance, presentation signals, and only a bounded daylight/rest window. Unknown species and incoherent capability/profile combinations fail closed. `src/game/coreEcologyActivity.ts` consumes those profiles through one shared finalizer that rejects any emitted signal, movement medium, destination semantic, perch claim, or observation reference outside the selected profile before it can reach movement or presentation. Immediate lawful alarm, flee/retreat/guard, pursuit/disengagement, and physical-food forage/scavenge intents outrank neutral activity. Existing routines retain their authenticated anchors and movement contracts. Alpha38 lets greater yellowlegs reuse `anchored-wader`, belted kingfishers reuse the air-only surface-opportunity/rest profile, and cormorants use `diving-waterbird` for lawful surface swimming, diving, resting, and flight relocation. Alpha39 adds shared `perch-forage` activity for seaside sparrows and `amphibious-margin-forager` activity for the diamondback terrapin. Transit presentation remains generic until the current state lawfully supports a more specific visible behavior; private cues never become player knowledge. This is not sleep, denning, a nocturnal schedule, capture/feeding resolution, continuously simulated 3D flight, or the complete circadian system.

That boundary remains true of the released Alpha39 activity layer. Internal
Alpha42 layered the generic circadian kernel onto fish-crow `perch-watch`;
internal Alpha43 **Two Rhythms**, first shipped cumulatively in Alpha53,
replaces that implicit perch-only lookup with a declarative species +
activity-archetype registry and adds North American
river otter + `shore-water-forager` + night-active beside fish crow +
`perch-watch` + day-active. The crow physically seeks its authenticated perch
at night. The otter physically seeks its authenticated dry haulout by day,
settles and sleeps only after arrival, then wakes and returns toward its
authenticated foraging water at night. Both use the same routine, movement,
priority, disturbance, persistence, and coarse-continuation laws. An observed
sleeping actor may disclose `Asleep`; private thresholds, policy, and
destinations do not become player knowledge.

The registry qualifies an exact species/archetype pair rather than binding a
whole archetype. Harbor seal therefore keeps its prior unbound
`shore-water-forager` daylight/rest-window behavior, and every other activity
profile keeps its preceding bounded behavior. The current catalog declares the
otter nocturnal while all historical frozen catalog roots remain exact. At the
Alpha43 boundary this was not denning, a catalog-wide routine conversion, a
production crepuscular or tide-driven binding, or the complete circadian
system; humans, dogs, and player REST/SLEEP remained outside it. Alpha44's bounded player WAIT reuses the ordinary
runtime fixed-step path independently of those still-unfinished actor routines.
Alpha45 then adds one separate adapter for the existing settlement-custodied
working dog only: its shared day-active preference can lead it physically to
its authenticated kennel, but travel remains awake, restorative posture begins
only on arrival, and danger, needs, and retained work remain authoritative.
The independent dog, humans, bonded/player companions, and player REST/SLEEP
remain outside that dog adapter. Alpha46 adds a separate lower resident adapter
for the one existing food-store keeper: their actual home settlement gates
Resting/Asleep and recovery, same-tick work and other current priorities wake
them, and the post-command human sensory boundary removes only sleeping vision.
It does not bind the other 41 humans, invent an interior, or add player
REST/SLEEP.

Alpha48 adds exactly one further registry composition: snowy egret +
`tidal-wader` + `adaptive-active`, with declared `clock`, `tide`, and
`opportunity` drivers. The tide signal exists only while the authoritative
current anchor projection supplies a usable depth-safe wading target; the
opportunity signal exists only from a current lawful anonymous aquatic
observation. Either can favor activity, while neutral rest still requires
physical arrival at the egret's existing authenticated dry refuge before the
shared posture may settle or sleep. This is one production tide/opportunity
binding. Its coarse representation conserves an already committed bounded rest
bout without evaluating new tide or opportunity; full-detail rematerialization
reauthenticates the live destination/location and evaluates current drivers.
Alpha49 adds marsh rabbit + `ground-cover-forager` + `twilight-active` as the
first production crepuscular composition. Its clock-only row is admitted by
the truthful `circadian-activity` capability, the profile's
`circadian-routine` scope, and explicit `land` movement. Active
twilight projects only bounded neutral ground activity; rest projects physical
travel to authenticated habitat cover, never an inferred burrow or den. Danger,
lawful disturbance, urgent needs, and retained commitments still outrank that
routine. Coarse absence conserves only an already committed rest bout and does
not invent travel or a new choice. Current catalog truth changes without
rewriting any historical catalog snapshot.

Alpha50 then moves the thirteen remaining entries from the released bounded-day
contract onto the same saved physical routine. The circadian registry and
activity-affordance registry must now have identical ordered species keys, and
the projection firewall rejects a bound actor without the matching routine,
destination, movement medium, and policy. This is the complete current
addressable activity-profile roster—seventeen species—not all 45 wildlife
profiles. Existing activity destinations and locomotion owners stay
authoritative; only arrival permits rest presentation or restorative posture.
One reusable binding-level weather-response declaration lets authoritative
qualifying rain activate the American black duck outside its ordinary clock
window, while storm weather prioritizes the existing refuge. Current weather
travels through runtime decision, movement, and direct inspection rather than
being inferred from pixels. The duck, otter, yellowlegs, and terrapin continue
to choose only physically usable tide/depth-dependent actions and destinations,
but their wake policy remains clock-based; the egret alone has the proven
bounded tide/opportunity wake composition. Aggregate frog rain behavior remains
real but does not masquerade as an individual routine. Validated broad
coarse-time advancement, other animal schedules, and catalog-wide daily life
remain absent.

`src/game/coreWildlifeLocomotionProfile.ts` layers species-shaped cost and gait data over one shared path resolver. The egret travels between an authenticated wading target and refuge through the aerial surface. The duck uses either bounded air or currently traversable `surface-water`. The otter selects the reusable `amphibious` medium: deep nonstandable water uses surface-water cost, while land and standable shallows use the ordinary terrain surface, allowing one actor to travel from dry haulout to water and back without an otter-specific pathfinder. Alpha37's great blue heron uses shared air travel to reach its authenticated wading anchor; common tern and osprey use the same bounded aerial route surface for neutral activity. Alpha38 composes the same media for yellowlegs wading, kingfisher air/perch travel, and cormorant water/air activity. Alpha39 composes ordinary aerial/perch travel for seaside sparrows and the shared amphibious margin route for the diamondback terrapin. Alpha49 makes the already shared ordinary-terrain route explicit as `land` for rabbit cover and neutral ground activity, avoiding an implicit aerial fallback without introducing a rabbit-only pathfinder. Alpha50 keeps every newly bound routine on that species' already-declared movement media and authenticated destination; it creates no new pathfinder. Those projected routes do not establish ecological cross-region actor migration or a continuously simulated 3D flight body. A successful ordinary intent-owned rabbit, fox, or gray-wolf relocation can atomically retain one rate-limited paired-track or canid-pawprint record at the destination; stationary actors and shared circadian-routine-owned travel cannot mint movement signs. The later birds deliberately produce no new persistent track evidence. Every retained individual-wildlife sign keeps immutable source strength while its visible clarity falls deterministically to exact expiry after 180 ticks, identically across full simulation, coarse time, save, and reload. This shared locomotion/evidence path does not itself create attack, injury, mortality, body, or feeding outcomes; current marsh-fox/gray-wolf/cougar contact and finite-body transactions remain separate authoritative owners. Wake evidence, capture, fishing, hunting, foliage consumption, ecological migration/reproduction, nesting, and reward loops remain absent.

When the habitat assemblage contains a bear, the runtime seeds one exact loose dried-fish parcel near it. Visual evidence can make that parcel a food opportunity for an eligible bear, gull, fish crow, or river otter, but only an identified, directly confirmed, accessible whole unit may produce a claim. The cargo owner rechecks exact segmented contact, payload kind, quantity, and current existence before atomically committing one custody path and any lawful ordinary-food consumption. Sorted claims, replay protection, and exact custody ensure a second actor or reload cannot consume another copy. The otter is deliberately only another consumer of this generic seam, not an owner of private loot or cargo rules. A malformed claim, partial stack, consumed item, or out-of-reach seam case leaves both cargo and ecology unchanged. Aggregate attraction never consumes, moves, aliases, or duplicates one. Player-facing narration is emitted only when the event-time actor was directly visible; otherwise authoritative history remains silent to the player.

Chart and Relief project the same direct-detail individual wildlife set and use species plus stable ID for selection. Current addressable wildlife receives distinct color-independent low-cost forms and the ordinary wildlife choices: **WAIT AND WATCH**, **ROUTE AROUND THIS SPOT**, and **LEAVE**. Flocks retain presentation under the same direct-detail gate; each visible representative renders and hit-tests once, and a bounded visible-flock summary never manufactures decorative copies or extra targets. Alpha38 adds shared structural forms and current activity poses for greater yellowlegs, belted kingfisher, and double-crested cormorant in both views. Alpha39 adds the same shared presentation contract for the group-atomic seaside-sparrow flock and solitary diamondback terrapin, plus anonymous mosquito and periwinkle evidence. An aerial, diving, perching, or amphibious-margin pose is presentation of bounded authoritative activity state, not a continuously simulated 3D flight body or feeding outcome. At uncertain clarity, ABOUT remains generic and never exposes a private target, exact trait, aggregate count, or stable ID. Aggregate surface, schooling, burrow, and feeding evidence remains non-addressable; cat/rabbit/fox/wolf tracks remain non-targetable, and the current later additions produce no persistent track evidence. Mouse/touch and Chart/Relief share the same projection, reduced motion preserves the same facts, and loss of sight clears the ephemeral target.

The shared wildlife route-around transaction is available only after the player
has set an automatic destination. It consumes the immutable directly observed
spot committed by the interaction, preserves that destination, and asks the
ordinary path owner for a real detour. It is ecology-owner agnostic, including
wildlife held by non-home regional owners; it never follows a later hidden
animal position. If no detour exists, the prior route and choice ledger remain
unchanged.

`src/audio/soundscape.ts` retains the original fish-crow nasal double-call synthesis and southern-leopard-frog chorus beside the earlier ecology cues. At the Alpha 17 boundary, the direct crow cue played only for a causative alarm transition witnessed at event time. In the current unpublished Living Voice candidate, that alarm instead uses `vocalization-fish-crow-alarm`, which delegates to the same synthesis while shared hearing—not visual witnessing—decides player receipt. The same candidate adapts the existing core-deer alarm through a short synthesized `vocalization-deer-alarm-snort`; it does not invent a second alarm or player-only ecology path. A freshly committed gull alarm now follows that same authenticated ecology event, species-aware admission, hearing, source projection, audio and caption trajectory through `vocalization-gull-alarm-cry`. Visible receipt may identify **Gull** and render **KEE-AH!**; heard-unseen receipt is only an anonymous directional bird call, with no predator identity or exact hidden locus. The frog chorus now follows that common acoustic boundary without inventing an individual: qualifying aggregate activity derives one `animal-call` world event on its cadence at the deterministic representative occupied anchor. A sample admitted to the shared bound can drive anonymous human/dog hearing; a lawful awake player receipt independently releases the existing stereo synthesis after commit and competes for the shared accessible caption as **chorus**. Caption direction and uncertainty-attenuated pan derive from the same heard-bearing band; a co-located or insufficiently resolved contact says `all around` or `direction unclear` rather than inventing a cardinal fact. The aggregate ID, exact coordinates, hidden population, and opaque source identity remain undisclosed, and no actor-anchored Chart/Relief callout is fabricated. A freshly committed marsh-fox pursuit yip now uses that same carrier and delegates to the existing `fox-yip` synthesis only after causal authentication: an unseen receipt is an anonymous **CALL.**, while lawful nearby humans receive only an anonymous animal-call fact. If optional expression admission is saturated, lawful player audio and bounded anonymous human hearing still derive from that same authenticated ecology event without manufacturing a caption or retained Voice record. The migrated crow, gull, frog, and fox events no longer use their former ecology session-announcement/direct-playback bypasses, and reload does not replay ephemeral player audio or text. At the Alpha 17 release, the northern harrier, American black duck, North American river otter, wild boar, elk, gray wolf, cougar, and brown bear had no live audible call. In the current unpublished candidate, narrow elk alarm bark, wild-boar alarm grunt and American-black-duck alarm quack also use shared Voice, as do the generated domestic-chicken alarm squawk and finite-herd domestic-goat alarm bleat. Elk bugling, boar squealing/social grunts, chicken clucking/crowing and routine duck/livestock calls remain foundation-only or deferred. Northern harrier, North American river otter, gray wolf, cougar and brown bear still have no live species-specific Voice call. The [audited implementation frontier](#audited-implementation-frontier) owns the current roster and proof limits. These are redundant presentation cues and never permission to reveal hidden motives or activity outside legitimate sight/hearing.

## First settlement-store ecology composition

Released Alpha 23 adds no species. `src/game/settlementEcology.ts` owns one bounded starting-harbor store record with a stable store ID, the actual existing keeper's actor ID, one nearest saved brown-rat aggregate anchor, an open-or-secured closure, bounded keeper evidence, and the sole physical fresh-produce carrier. That carrier uses ordinary settlement cargo custody and does not alias or subtract from the settlement simulation's abstract food counter. The store source adapter exposes only the physical lot's source strength and door-dependent packaging leakage; the existing aggregate-perception owner still resolves wind, rain, distance, uncertainty, and whether any scent lawfully reaches the rat aggregate.

An open store with a matching scent observation may propose attraction, but the existing Settlement Shadows owner remains responsible for aggregate response and can relocate at most one already-existing rat unit on its ordinary opportunity. Only a matching authenticated relocation event may stage a store-loss transaction. Resolution atomically removes at most one exact physical produce unit for that event, retains the same conserved rat population, rejects an unrelated lot, and treats a replayed committed transaction as inert. An existing domestic cat's lawfully visible presence may separately pressure the rat aggregate through the shared visual/trophic policy; the cat receives no rat-sign cognition, hidden rat fact, private target, or new investigation proposal.

The knowledge kernel admits only an authenticated direct keeper observation or an explicit in-person player report. Alpha 23's playable runtime wires the report path: it is offered only while the player is physically near both the store and its actual keeper, and a remote settlement selection cannot command them. Autonomous keeper observation is not generated in this slice. Applying the response persistently secures the door and reduces later store leakage to zero without deleting the store, remaining food, rats, or cat pressure. Chart and Relief derive the same store mark and closure from this state. Store detail, the keeper action, and any loss narration remain gated by current lawful proximity or event-time observation, so returning later cannot turn unseen history into an EVENTS report.

In the current unpublished Living Voice candidate, that same committed closure
also authorizes one keeper response through shared situated expression and
acoustic perception. It replaces the former session-local resident label and
generic UI cue without changing the settlement transaction owner. Shared
presentation may suppress the label, and local masking may withhold the player
receipt, but neither can undo the physical closure or manufacture later speech.

This slice validates a reusable owner boundary through shared abstraction checks, a bounded signed-coordinate property sweep, exact item and aggregate conservation, deterministic migration/replay, and one representative store-rat-visible-cat composition. Existing shared bounded-fuzz and performance gates remain in the regression suite. It is not an exhaustive species or animal-pair matrix, worldwide settlement ecology, schedules, livestock, rumors, harmful attack, injury, mortality, carcasses, live-prey consumption, the full bestiary, or broader biodiversity completion.

## First domestic-yard flock composition

Alpha 24 extends the same boundary with one stable two-to-three-member domestic
chicken flock at the starting storehouse. `src/game/coreEcologyHabitat.ts` owns
only deterministic placement and individual allocation; the shared wildlife
actor owns needs, attention, memory, and intent; the shared locomotion profile
and terrain solver own movement; and the shared group owner owns flock identity,
membership, alarm propagation, separation, and reunion. No chicken-to-species
detector or pair table is introduced. The catalog exposes broad human, dog,
predator, food, and same-species relations, and explicit no-response rows close
every other target class.

`src/game/settlementEcology.ts` version 2 adds one canonical domestic-custody
record that binds the existing settlement, keeper, stable flock ID, sorted
member IDs, yard home position, and bounded home radius. Custody neither owns
animal cognition nor aliases the physical store inventory. While the door is
open, a custody member may receive a direct identified food opportunity for the
exact produce-lot ID. It still has to select forage through ordinary attention,
move through the shared terrestrial solver, and reach the same three-tile
Euclidean structural-access footprint before a claim can resolve. A secured
door creates neither the opportunity nor a food belief.

Domestic food use is an exact staged transaction carrying store, food lot,
custody relationship, flock member, one-unit quantity, cause event, tick, and
monotonic ordinal. Resolution decrements only that physical lot and lowers only
the consuming actor's hunger after commit; replay is inert and malformed,
out-of-custody, out-of-reach, secured, stale, duplicate, or overdrawn claims fail
without partial mutation. Event presentation uses the current direct-detail
projection: a witnessed bird and meal may enter EVENTS, while the same valid
offscreen transaction remains silent to the player.

Outer session version 17 adopts a sealed version-16 Storehouse Door world once.
The complete habitat-7 population/anchor record and every existing actor, group,
aggregate unit, item, Promise, store/lot identity, closure, keeper fact, and loss
ordinal remain exact before habitat 8, the flock, and custody relationship are
appended. Reload cannot reroll flock size or identity, duplicate the group or
food, replay a meal, or reopen the store. Validation intentionally uses shared
invariants across signed/extreme coordinates, migration and replay attacks,
physical conservation, bounded performance, and one representative visible
yard event. It does not attempt an N² species matrix and does not claim calls,
tracks, attacks, injury, mortality, carcasses, live-prey consumption, eggs,
nesting, reproduction, herding, guardian behavior, schedules, autonomous home
return, cross-region migration, worldwide livestock, full Wave D, or broader
biodiversity completion.

## Derived biome/climate projection

The published `29ea8dc` checkpoint adds a pure `src/sim/biomes.ts` kernel without adding fields to `WorldState` or the fixed authoritative tick. Given the root seed, an existing terrain tile, grid height, optional live weather, and optional magical-water influence, it derives integer fixed-point rainfall, heat, salinity, exposure, and magical-water channels. Smooth keyed regional value noise is call-order independent and combines with the existing Perlin terrain channels; input bounds fail closed without mutation.

Long-lived baseline climate classifies one of seven stable IDs: tide-channel, brine-flat, reed-marsh, rain-meadow, sun-meadow, wind-ridge, or glimmerfen. A passing clear/mist/rain/storm front changes the current climate without renaming that baseline place. Biome coefficients expose bounded rain-retention, heat-load, salt-stress, and magical-resonance signals.

The immutable game projection derives and caches stable biome profiles from seed plus terrain, applies live weather only to the current climate layer, and attaches biome/climate views to projected tiles. `src/render/biomePresentation.ts` maps each discovered biome to one restrained color triplet and a redundant motif shared by Chart and Relief; fully undiscovered cells return no biome presentation. The local field readout names the derived biome. These remain presentation signals, not resources or saved state: courier exposure, cargo condition, ecology, infrastructure, and settlement rules do not consume them yet.

## Physical cargo environment and continuous custody

The pure `src/sim/cargoEnvironment.ts` evaluator preserves the five existing cargo properties—ordinary, heavy, fragile, perishable, and confidential—and resolves bounded resistance, spoilage, impact, current-coupling, and buoyancy traits. Runtime physical parcels consume that deterministic fixed-point result for rain, heat, cold, immersion, signed current, magical-water flux, and impact. They retain bounded condition, contamination, decay, force, motion, and canonically ordered causal evidence through save/reload.

Loose cargo is owned by exactly one persistent regional cargo world under one conserved custody manifest. When motion crosses an internal storage boundary, transfer removes the source and installs the same persistent parcel in the destination as one atomic operation; identity, payload, condition, momentum, event history, and Promise custody do not change. Tombstones and invariant checks reject replay, duplication, deletion, stale ownership, or mismatched Promise quantity. Ordinary presentation culling does not despawn an off-frame parcel, and an active lost Promise remains recovery-focused. Coarse unloaded-world drift and delivery compensation for recovered condition remain later work.

Current physical-item provenance is technical and causal: stable ID, source
lots/material condition, origin region/ordinal, owner/custody, Promise link,
and bounded append-only event history. It is not yet Deep Time's semantic
maker/site/ownership-chain history. A generic validated `RegionManifest`
sidecar reserves generated hashes, sparse modifications, and tombstones, but
its general collect/commit vocabulary has no production caller; current live
sparse owners are narrower field-resource depletion, Wayknots, and regional
physical cargo. Future historical field gear must extend one of those canonical
owners or wire the manifest explicitly, never infer live ruins from reserved
enum vocabulary or add parallel persistence.

Inactive parcel regions live in an immutable, authenticated AVL index whose updates path-copy only the affected branches; fixed-step simulation, rendering, UI, and recovery query only the storage regions intersecting the bounded presentation frame. Each node caches its subtree size, integrity, and exact wire-size contribution, so local motion does not scan or clone the courier's lifetime cargo history. Persistence retains the existing version-2 flat regional array: save snapshots flatten it canonically, while load performs the deliberate full conservation audit and rebuilds a balanced runtime index.

## Derived rock/ladder foundation

`src/sim/rockTraversal.ts` is another pure, deterministic calculation contract. It derives bounded coherent outcrops and stable connected formation IDs from the root seed plus existing terrain, then classifies obstacle severity, walking blockage, fall-risk signal, and travel-cost signal. Its finite reusable ladder kit validates supported cardinal spans, formation continuity, occupancy, overlap, condition, placement, reclaim, and future damage without mutating caller state.

The shared player traversal kernel now accepts optional derived rock and ladder
inputs, and focused tests exercise crossing semantics. The live runtime still
does not generate, pass, persist, project, deploy, or render either input.
Therefore the candidate has no visible solid rock obstacles, no carried or
deployed ladder, and no new fall outcome. Production integration still
requires one shared authoritative crossing query for manual and pointer travel
plus explicit presentation and save migration; tested optional input alone is
not a playable feature.

## Current recovery and discovery-safe cues

The player host treats water depth of **120,000** fixed-point units or greater as deep/current water for involuntary recovery. If stamina or the live physical stability percentage reaches zero there, the result enters the same controllable ADRIFT state. Dry-ground stamina exhaustion still camps, and water below the threshold does not trigger the sweep rule. ADRIFT retains clinic interception and ferry, Storm-kite, and Tide-anchor modifiers; cargo quantity is conserved and any carried cargo is weathered once rather than repeatedly on each recovery step.

One pure fixed-point hydrology function derives local strength and turbulence from authoritative water depth, bed roughness, tide, and weather without random state. Player footing and both renderers consume that same profile. The visible projection treats calm/rough surface character as directly observable information: discovered wet tiles receive bounded streamlines, foam, ambience, and sparse OHM/WHISSH voice within the exact-detail field. It never projects an exact unsounded depth or effort value. SOUND / SCAN alone adds analytical arrowheads and records bathymetry. Reduced motion freezes decorative phase while retaining the same physical heading and coarse surface character.

## Reserved expedition movement, cartography, and field-history architecture

This section allocates future responsibility; it is not a claim about the
current released gait, destination display, contours, or abandoned equipment.
Implementation remains gated by the active directive order.

The movement path is:

```text
raw device input
  -> input intent
  -> gait request
  -> fixed-step authoritative movement
  -> terrain/load/stamina/stability/cargo consequence
  -> Chart and Relief presentation
```

Keyboard double-tap recognition belongs only to input interpretation. It uses
real same-key down/up/down edges inside one centralized configurable window;
repeat events, UI typing, stale focus, pause, and modal transitions cannot
activate it. The second press remains the ordinary held direction. The
resulting `fast gait requested` state is independent of the triggering key,
continues across changing nonzero direction chords, and ends when movement
intent becomes zero. Touch and controller adapters submit the same request
without imitating keyboard gestures.

The player movement owner, not either renderer, resolves attainable pace,
normalized direction, bounded acceleration/deceleration, heading/velocity
separation, full reversals, footing, grade, water drag/current, load, injury,
stamina, stability, brace, and fall consequence on fixed steps. Easy flat
walking has negligible base locomotion drain; environmental and physical
modifiers remain additive causes. Easy-ground sprint starts near the former
ordinary-walk exertion experience, while difficult-ground walking remains
costly and difficult-ground sprint compounds exertion and causal balance risk.

Incident-separated cargo extends the existing conserved loose-cargo record
with saved fixed-step recovery eligibility, preferably an incident provenance
plus `selfPickupLockedUntilStep` or an equivalent canonical deadline. The lock
is a player self-recovery rule, not a new item or ownership state. Identity,
position, velocity, condition, wetness, Promise linkage, custody, and other
actors' lawful claim behavior remain with physical cargo authority. A pickup
quote must reject the originating player while either the deterministic lock
or their physical recovery state remains active; the parcel continues normal
motion throughout. Save/load and regional handoff preserve the same deadline
without wall time or replay.

There is one terrain truth:

```text
world seed + persistent terrain deviations
  -> authoritative elevation
  -> physical slope and normals
  -> movement / Hard Country / hydrology
  -> Relief height mesh and grounding
  -> knowledge-gated Chart contours
```

Relief work begins with an audit of elevation range, interpolation, vertical
scale, normals, directional lighting, camera pitch, LOD, floating origin, and
surface grounding; it does not introduce another terrain generator. Chart
contours use deterministic marching squares or an equivalent seam-owned
extractor over that same elevation field. Configurable contour and index
intervals simplify by zoom. Cross-region samples and ownership rules make a
line continuous at partitions. Extract levels from true authoritative
elevation, then knowledge-mask segment presence/opacity; never contour an
elevation multiplied by discovery confidence, which would fabricate moving
terrain levels. Unknown samples cannot leak through contour
geometry, labels, actor placement, hit testing, or Relief height.

Relief entities, rings, labels, camera targets, and hit surfaces sample the
same knowledge-disclosed physical surface that the terrain mesh actually
draws. A currently perceived but not yet durably charted tile cannot draw one
height while grounding its actor against another. Actor visuals may orient a
body to visible grade later; presentation still cannot alter the slope.

Existing regional cartography is the substrate for the expedition map. It
already saves sparse discovery and soundings by signed region without keeping
rendered pixels. Its future version adds bounded, explicit place knowledge and
target-knowledge records containing source, confidence, approximate geometry,
timestamp, and discovery state. Generated terrain remains derived; saves keep
knowledge marks and promoted location facts. An undiscovered Promise target
projects an irregular area, sector, or corridor whose geometry does not encode
the exact target at its center. A legitimate arrival/discovery transaction
replaces that approximation with one exact stable place reference; later
Promises reuse it. Chart markers never imply a field-view objective arrow.

The future Chart surface must also query and render learned signed-world chunks
at appropriate multi-scale detail outside the active 120 x 120 simulation and
presentation frame. It virtualizes labels and geometry and samples generated
terrain only through saved knowledge; it does not keep every visited region
materialized merely because the player pans the map.

Delivery-scale work must instrument representative seeds before changing
generation. Record straight-line and route-aware mean, median, quartiles,
short-route frequency, and long tail for the ordinary Promise population.
Then adjust settlement-network geography, eligible destination selection, and
route/logistics policy together until the ordinary mean is at least roughly
three times the recorded baseline. Keep clusters, remote sites, empty reaches,
and an explicit onboarding exception; do not obtain the mean from a uniform
grid, one constant alone, or extreme outliers. Distance never becomes an enemy
level ring.

Sparse abandoned traversal gear extends world history plus normal physical
items; it is not a loot spawner. Candidate facts derive from root seed,
signed location, causal context, opportunity saturation, and generator
version. Technical partitions do not grant another roll. A candidate may stay
derived/coarse until materialization or interaction promotes it to stable
physical identity. Thereafter ordinary custody, condition, repair, movement,
theft, loss, save, and regional transfer own that exact object, and a consumed
candidate/tombstone prevents regeneration. Density statistics must demonstrate
rarity, plausible condition breadth, and no correlation that guarantees an
obstacle's solution. Loose gear stays off the permanent map unless legitimately
marked; installed infrastructure retains its separate deployment/reclaim law.

These owners inherit bounded work: contour caches have explicit authority and
invalidation, map saves remain sparse, distribution sampling is offline or
development-only, and distant historical candidates do not require full item
simulation. Reduce frequency and detail where safe; never reduce terrain,
knowledge, identity, or conservation truth.

## Derived Wayknot topology

Tide Harps live at the game/projection boundary, not in authoritative simulation or save state. Given the existing fixed-ID `WayknotState` and `{ width, height }` grid, the pure topology pass:

1. normalizes the fixed six-piece kit without inventing pieces;
2. enumerates every pairwise-connected, non-collinear triangle containing exactly one Reed mat, one Tide anchor, and one Wind knot;
3. sorts canonical R/A/W component tuples;
4. exhaustively selects the maximum number of knot-disjoint candidates;
5. resolves equal counts by minimum total Euclidean perimeter, then lexicographic canonical IDs.

The fixed kit bounds the candidate space, so exact search is smaller and more auditable than a heuristic. A canonical ID such as `tide-harp:r1-a3-w5` survives input order and save/load because its components already have stable identities. A deterministic mapping supplies eight player-facing names: Glass-Ebb, Gullweather, Moon-Reed, Lantern Shoal, Mothcurrent, Brine Lullaby, Quiet Rigging, and Estuary Chime.

Containment is an inclusive integer-cross-product test against tile centers. At a containing tile, gameplay asks only whether at least one selected Harp is active: the extra recharge is one bounded +900 fixed-point units per 100 ms player step, never one bonus per overlap. A successful scan retains the player-centered radius-8 discovery/bathymetry pass and performs three more radius-6 passes centered on the Harp's fixed R/A/W knot tiles. Discovery and exact bathymetry remain separate arrays, so geometry alone cannot reveal hidden depth.

This topology adds no resource, cargo, settlement inventory, clock, random draw, authoritative world field, `PlayerState` field, or save format. Reclaiming or rebinding an existing Wayknot simply changes what will be derived on the next projection or fixed step.

## Active graph and multi-hop logistics

The active route graph is an authoritative subsystem rather than decoration:

- A route becomes eligible for porter automation at the strand threshold and remains unavailable when its condition is too low.
- Stable Dijkstra planning can chain any number of active legs. Tie-breaking uses route IDs.
- Edge cost combines base travel time, condition, reliability, current weather, active resident load, route traffic, and capacity.
- Severe storms can close marginal routes; a completed endpoint beacon lowers the reliability threshold.
- A porter stores both its route-ID sequence and settlement sequence. Its visible location advances leg by leg, and completion reinforces every used leg.
- Capacity rises with strand strength, and a completed endpoint ferry adds another porter slot.

Graph analysis computes active routes, connected components, largest-component coverage, bridges, cycle rank, degree resilience, and a combined resilience score. Campaign resolution requires full service coverage, at least two independent cycles, few remaining bridges, and redundant incident routes for almost every settlement. This makes topology—not raw score—the end condition.

## Civic projects are rule changes

Projects consume their named resource during scheduled simulation updates. Completion emits a causal event and changes authoritative behavior:

| Project | Permanent effect |
| --- | --- |
| Beacon | Raises incident-route reliability and local knowledge confidence; helps marginal active routes remain legible in severe storms; entrusts a visiting courier with a Storm kite |
| Cache | Improves incident-route condition, accelerates player stamina/load-stability recovery, and halts perishable-food decay while sheltered at that harbor |
| Crossing | Raises incident-route condition, reduces their base travel time, and entrusts a visiting courier with Marsh stilts |
| Clinic | Relieves local stress/needs and turns exhaustion on an incident active route into connected rescue |
| Ferry | Raises incident-route reliability, reduces travel time, adds porter capacity, and entrusts a visiting courier with a Tide sail |

Deliveries can contribute directly to a building project when the cargo matches its required resource. The contract UI explains this before acceptance, and the chronicle records completion and effect afterward.

## Carried information

Knowledge is scoped to settlements. Each record names the subject settlement and resource, reported quantity, age, confidence, and whether it is locally verified.

The player can witness one signed count at its source harbor and carry it in a one-slot document case. “Signed” means accountable in-world provenance, not cryptography: the report contains source, target, subject, resource, observed quantity, observation tick, and confidence. Delivery validates those fields, preserves its age, applies transport confidence loss, updates the recipient’s record, and emits `knowledge-shared`.

Remote inspector values therefore distinguish direct knowledge from unverified reports. The player can move information without pretending to own an omniscient dashboard.

The candidate presents these jobs separately from physical Promises. Report controls live in an inspector section labeled information-only and say **Sign info report → [harbor]**; the action signature intentionally excludes live route reliability, stock counters, and clock data. The report subtree refreshes only when report-action structure changes, and a pointer-down guard keeps the exact button alive until click or cancellation. This prevents live simulation refreshes from producing hover flicker or swallowing the click.

## Save contract

### Compatibility lifecycle

The save contract has two compatibility eras, without weakening persistence in
either era:

- **Before official stable 1.0:** every current-schema save must round-trip its
  complete authoritative state, explicit schema and generator versions,
  deterministic outcomes, interruption state, stable identities, custody,
  knowledge, and cross-system consequences without loss, duplication, reroll,
  or silent repair. An obsolete internal development schema may be explicitly
  retired when a safe migration is not worth its cost. The loader must then
  reject it as incompatible and direct development toward a clean save; it may
  not guess at missing fields, partially deserialize it, overwrite it silently,
  or disguise an unexpected load failure as an intentional reset. The generic
  migration, validation, and atomic-commit machinery remains available, and a
  trivial safe migration may still be preferable.
- **Official stable 1.0 and later:** the exact 1.0 schema and world-generator
  versions become the first supported player-save baseline. Every later
  supported schema change must detect, migrate in order, validate, and commit
  deterministically without corrupting the original record on failure. Once an
  official stable release at or above 1.0 exists, this strict obligation is
  latched permanently; a later development, alpha, beta, or release-candidate
  build cannot return the project to development-reset policy.

Official stable means a valid release version at or above `1.0.0` with no
prerelease component. `1.0.0-alpha`, `1.0.0-beta`, and `1.0.0-rc` remain in the
pre-1.0 development era. Release identity is evaluated with semantic-version
rules from the authoritative release ledger, never lexicographic string
comparison or directive numbering. Before declaring official 1.0, the project
must freeze the exact save-schema baseline, generator version, persistence
invariants, representative fixture saves, and migration-failure tests.

`src/content/patchNotes.ts` supplies the ledger-wide official-stable latch, and
`src/game/saveCompatibilityPolicy.ts` binds it to the explicit `1.0.0` baseline
and the first stable outer-schema version. That schema freeze is deliberately
`null` before 1.0; adding an official stable ledger entry without setting it is
a fail-fast release error. Because the latch scans the append-only ledger, a
later prerelease cannot erase an earlier stable commitment.

Product release version, outer save-schema version, embedded subsystem schema
versions, and world-generator version are distinct authorities. A schema bump
does not by itself imply a public compatibility promise, and relaxing obsolete
pre-1.0 compatibility never permits an unversioned current save. Procedural
worlds continue to store their seed, generator version, and sparse authoritative
deviations rather than a giant derived world image. After 1.0, generator
evolution must preserve an existing player's established geography through a
versioned generator or an explicit safe migration.

The outer `SaveRecord` is also a compatibility preamble, not disposable UI
metadata. Future writers must leave an older build enough validated structure
to identify the slot, its monotonic replacement tuple, and `payloadVersion`
before that build attempts to decode `worldJson`. Extra fields may be added,
but a wrapper redesign must retain or bridge this backward-readable version
fence. A repository adapter must surface stored-but-invalid bytes as a read
failure; it may not filter them into an apparently empty slot that an older
writer can overwrite.

There are two nested versions:

1. `tideweft-world` contains the save-format version, rules version, checksum, and canonical `WorldState`. The perception slice uses embedded simulation format 4 and `tideweft-sim/6`; checksum-first migrations from supported format-1 through format-3 worlds add deterministic resident identity, condition, knowledge, memory, and an initially unaware actor-perception state at the already-completed tick before current invariants run.
2. `tideweft-session` contains the serialized world plus player motion/cargo/report/chart/Wayknot state, tutorial state, chosen posture, a legacy-compatible session-shape field, recap history, a sealed pending-perception carry, the first living web's dog ecology, porter response, player-choice state, the canonical core-ecology patch, settlement ecology, the separate dog roster, and settlement-working-animal state. Released Alpha 26 advances the outer session to version 19 and settlement ecology to version 4 while habitat analysis remains version 9 and aggregate ecology remains schema version 4. A sealed version-18 Far Paddock envelope is authenticated before one deterministic dog body, kennel custody, and generic guardian assignment are appended. Every habitat-9 population and anchor, prior actor, group, aggregate unit, item, Promise, evidence record, store fact, world fact, chicken and goat member, flock, herd, coop, pen, keeper, prior custody, and physical food-use transaction remains exact. Version 19 strictly persists both new roots and recovers one pending assignment activity exactly once; reload cannot reroll or duplicate the dog, relationship, assignment, activity ordinal, movement, group, structure, or provision. Versions 1 through 17 continue through their established frozen one-way migrations before this final adoption. Spatial top-K core-wildlife materialization remains a deterministic projection from local distance with stable actor identity breaking ties and does not rewrite authoritative coarse state; the separately bounded dog roster is not a hidden expansion of that habitat population. The sealed regional-travel payload remains version 2 and stores the exact global origin of the 120 × 120 presentation frame; valid version-1 98 × 74 payloads migrate into a player-centered frame without moving the courier or changing chart knowledge. It does not serialize derived Tide Harps, biome profiles, target-tick tidal depths, or the current materialized-detail selection.

Released Alpha 27 advances only the outer session to version 20 and
the working-animal root and assignment records to version 2. A sealed
version-19 Paddock Watch payload is authenticated and adopted by appending empty
task-lifecycle fields without changing the stable assignment identity or any
prior actor, habitat, group, home, custody, item, Promise, evidence, store, or
world fact. Task, transition, and bounded latest-outcome records begin at
version 1. Current records authenticate their worker, handler, source activity
and observation, uncertain area, search probe, worksite, cause, suspension,
outcome, and monotonic ordinals. One saved pending task transition recovers
exactly once without rerunning sight, geometry, movement, handler authority, or
outcome. Habitat 9, settlement ecology 4, aggregate ecology 4, the nineteen
species records, and the dog roster remain unchanged.

Released Alpha 28 advances the outer session to version 21 and
appends an empty version-1 domestic-animal-recovery root to an authenticated
sealed version-20 Watch Returns payload. Every existing species, actor,
population, habitat, group, home, custody, assignment, task, item, Promise,
evidence record, store fact, and world fact remains exact. The new root accepts
at most one current case, one pending transaction, and one latest result, all
bound to exact actor, group, custody, home, incident, report, and monotonic
ordinal identities. Pending recovery commits exactly once. Neither reload nor
migration can reroll a lawful absence observation, last-known area, guardian
recruitment, group reunion, or caretaker confirmation. Habitat 9, settlement
ecology 4, aggregate ecology 4, the nineteen species records, and all existing
actors remain unchanged.

Released Alpha 29 advances the outer session to version 22, the core-ecology
patch to version 3, and its aggregate record to version 5. An authenticated
sealed version-21 Missing Goat payload preserves every existing actor,
population, representative, group, reserve, home, relationship, task, recovery
case, item, Promise, evidence record, store fact, and world fact before empty
mortality and physical-body state is appended once. Current records bind one
retired actor, one-unit population consequence, named damage/death cause,
stable body ID and position, finite original/remaining/consumed/decayed
resource equation, claim, and event ordinals. Reload cannot reroll the result,
resurrect the actor, remove another population unit, duplicate or relocate the
body, restore consumed resource, or create player knowledge of an unseen event.
Habitat 9, settlement ecology 4, working-animal state 2, and the nineteen
species records remain unchanged.

The Alpha 30 Beyond the Harbor release advances the outer session to
version 23 and habitat analysis to version 10 while retaining core-ecology
patch 3 and aggregate record 5. A sealed version-22 payload is authenticated
before the complete version-9 habitat prefix and every existing mortality,
body, actor, population, group, home, relationship, task, item, Promise,
evidence, store, and world fact is retained exactly. The deterministic remote
regional source and its wild-boar, elk, gray-wolf, `SOUNDER`, `HERD`, and
`PACK` records are then appended once. Reload, interruption, signed
coordinates, and full/coarse projection cannot reroll the source, duplicate a
member, rewrite an established group, or alter the adopted body-bearing state.
The exact adoption path is covered by the verified release evidence above.

The Alpha 31 High Country Shadows release advances the outer session to
version 24 and habitat analysis to version 11 while retaining core-ecology
patch 3, aggregate record 5, and the nearest-24 materialization ceiling. A
sealed version-23 payload is authenticated before its complete habitat-10
remote source/population sequence and every actor, group, mortality, body,
claim, meal, home, relationship, task, item, Promise, evidence, store, and
world fact is retained exactly. Cougar and brown-bear population records are
then evaluated at that same source once, and actor records are appended only
for supported populations. Reload, interruption,
signed/extreme coordinates, and full/coarse projection cannot reroll the
source, duplicate an animal, rewrite the version-10 trio, or alter adopted
body-bearing state.

The released Alpha 32 Open Country Ledger advances the outer session
to version 25 and adds regional ecology root version 1 while habitat 11, core-
ecology patch 3, aggregate record 5, and the 24-record catalog remain sealed.
A normalized version-24 payload is authenticated before one deterministic,
group-atomic compatibility disposition retains, redistributes, or explicitly
retires every legacy wildlife unit. Retirement is a persisted non-death
tombstone, not mortality or a fabricated body. Stable actor/population IDs,
membership, origins, history, mortality, bodies, claims, items, cargo,
Promises, and cross-root references remain conserved. Pristine regional
baselines are rederived; durable storage contains only deviations, promoted or
migrated identities, bodies, claims, and transaction receipts. Reload,
interruption, source permutation, and signed/extreme coordinates cannot reroll
either baseline or disposition.

The released Alpha33 Talus and Sky unit advances the outer session to
version 26 and wraps that exact regional-ecology-v1 authority in
`RegionalEcologyStateV2`. The composite adds a version-1 sparse Alpine root and
bounded hot snapshots without changing habitat 11, core patch 3, aggregate
record 5, or any byte of the canonical child. It appends the three Alpine
catalog records only after the frozen twenty-four-record prefix. A sealed v25
envelope is authenticated before one exact adoption receipt binds the source
outer integrity, source child integrity and hash, frozen lineage hash, clock,
and result Alpine-root integrity. Fresh v26 state has no adoption receipt.
Projection and commit are cross-layer atomic and retain the one global
group-atomic 24-actor ceiling. Reload, region unload, interruption, and
signed/extreme coordinates cannot duplicate or reroll an Alpine population,
goat herd, eagle actor/activity, pika aggregate/evidence, or the preserved v25
world. This is released bounded architecture, not a claim of Wave-F or
worldwide-ecology completion.

The internal Alpha34 checkpoint advances its lineage outer session to version
27 and wraps that exact V2 base-and-Alpine child in
`RegionalEcologyStateV3` beside a version-1 sparse polar-shore root and bounded
hot snapshots. An authenticated v26 child is adopted exactly once, retaining
the child's bytes and integrity as compatibility evidence. Projection chooses
one insertion-order-independent, group-atomic top-K across all three layers;
commit validates and advances the exact V2 child and polar sibling as one
transaction. Alpha34 was not independently released; this exact intermediate
schema ships as part of Alpha39's cumulative migration lineage.

The internal Alpha35 checkpoint advances the lineage outer session to version
28. `RegionalEcologyStateV4` retains the exact authenticated V3
base/Alpine/polar-shore child and adds the sparse addressable cold-shore sibling
without rewriting the capelin owner. An authenticated v27 child is adopted
exactly once. Projection applies the one global group-atomic 24-actor cap
across every layer, and commit remains one all-or-nothing cross-layer
transaction. Alpha35 was not independently released; this exact intermediate
schema ships as part of Alpha39's cumulative migration lineage.

The internal Alpha36 checkpoint advances the lineage outer session to version
29. `RegionalEcologyStateV5` retains the exact authenticated V4 child
and adds the sparse polar-consumer sibling without rewriting any established
ecology owner. An authenticated v28 child is adopted exactly once. Projection
and commit keep all five ecology layers inside the same global group-atomic
24-actor allowance and one all-or-nothing transaction. Alpha36 was not
independently released; this exact intermediate schema ships as part of
Alpha39's cumulative migration lineage.

The internal Alpha37 checkpoint advances the lineage outer session to version
30. `RegionalEcologyStateV6` retains the exact authenticated
V5 base/Alpine/polar-shore/cold-shore/polar-consumer child and adds one sparse
append-only breadth root without rewriting any established ecology owner. An
authenticated outer-v29 Alpha36 child is adopted exactly once. Projection and
commit keep all six ecology layers inside the same global group-atomic 24-actor
allowance and one all-or-nothing transaction. Alpha37 was not independently
released; this exact intermediate schema ships as part of Alpha39's cumulative
migration lineage.

The internal Alpha38 checkpoint keeps outer version 30 and
`RegionalEcologyStateV6`. Its authenticated version-1 breadth root advances
from epoch 1 to epoch 2 exactly once at the saved tick, appending Marsh Channel
Web after the exact Estuary Surface Break activation and resident prefix.
Already-current state is a byte-stable no-op, and rewind, future epoch, stale
integrity, or mismatched world binding fails closed. Alpha38 was not
independently released; this exact epoch remains part of Alpha39's cumulative
migration lineage.

Historical released Alpha39 likewise keeps outer version 30 and
`RegionalEcologyStateV6`. Its authenticated breadth root advances from
epoch 2 to epoch 3 exactly once at the saved tick, appending Saltmarsh Small
Worlds after the exact two-cohort prefix. Already-current state is a no-op;
rewind, future epoch, stale integrity, or mismatched world binding still fails
closed. Outer version 30 / `RegionalEcologyStateV6` remains the historical
**LIVE_VERIFIED** Alpha39 biodiversity boundary; versions 27–29 and breadth
epochs 1–2 remain its authenticated internal compatibility lineage.

Alpha40 and Alpha41 kept outer version 30 while deriving civil time and outdoor
illumination from existing authority. Internal Alpha42 advanced the outer
session to version 31, authenticating and preserving the exact outer-v30/V6
child while allowing the additive optional wildlife circadian receipt; Alpha43
through Alpha46 retained that envelope. Internal Alpha47 advanced the outer
session to version 32 by inserting a required nullable player time-action into
an authenticated version-31 session, with `null` proving that migration cannot
invent recovery or elapsed time. Alpha48 through Alpha60 keep outer version 32,
simulation format 4, `RegionalEcologyStateV6`, and wildlife actor schema/version
1 unchanged. Alpha51's optional resident receipts and Alpha52's byte-identical
reciprocal settlement-rest digest add no new root or migration. Alpha40–52 are
internal cumulative milestones first shipped in Alpha53, not standalone
releases. Outer version 32 remains the current **LIVE_VERIFIED** Alpha60 save
boundary.

The current unpublished Directive 04_2 source lineage advances the outer
session through version 49 and the bounded perception carry through version 14;
the current source writer emits outer version 49. The preceding v43/carry-v11
boundary introduced authenticated first-resident speech; v44/carry-v12 added
event-owned resident weather-hold speech and retained the phase-zero listener
sleep state beside pose for exact reception reauthentication. Current
v45/carry-v13 added the species-aware fish-crow/deer alarm admission and deer
semantic trajectory. V46/carry-v14 added the marsh-rabbit embodied
alarm-thump trajectory, its physical human-listener semantics, and explicit
non-interrupting authority. V47 kept carry v14 and added the first
non-warning human-to-human structured fact receipt from the authenticated
secured-store response. Its current species-aware alarm record also admits the
gull; that additive semantic changes no save shape, and reload reauthenticates
it without replaying audio or text. V48 keeps carry v14 and requires the bounded
accepted-effort recency root separately from consumed sounds. Supported v47
initializes it only from already authenticated pending exhaustion evidence;
consumed historical recency initializes empty rather than inventing old events.
V49 keeps carry14 and replaces the standalone effort root with bounded combined
`playerExpressionRecency`: unchanged effort plus two accepted-footing origins.
Supported v48 preserves its validated effort root and adopts footing only from
independently authenticated pending admission/causal/physical-step facts. A
validated legacy null physical-history prefix has no provable footing origin;
consumed older footing likewise initializes empty, without replay or invented
history. Current pending origins must agree exactly with those separate facts.
Missing, extra or contradictory current-v49 authority fails closed without
overwrite; historical formats reject the future combined root. No additional
development format is retired. Outer v41 through v46 are explicitly retired under
the pre-1.0 policy: load recognizes any such
incompatible development record, leaves it untouched, and directs development
to a clean current save rather than attempting partial deserialization.
Supported pre-v41 migration readers remain implemented and tested where
retained, but before official 1.0 that implementation fact is not a permanent
promise to preserve every internal development format. Current-v49 roundtrip
and all conservation, determinism, integrity, and no-overwrite laws remain
mandatory.

The runtime currently writes one `autosave` slot on a 600-world-tick interval,
page visibility loss, page exit, title return, and Quiet Hour. The periodic
interval begins from the authoritative tick present when a world is created,
continued, or deliberately replaced, rather than measuring from civil epoch
tick zero. A fresh 07:00 world and a late resumed world therefore each receive
one complete interval; the lifecycle save triggers remain unchanged. The
runtime loads that slot for the Continue card and never simulates offline time.

The browser repository is local-first: it prefers IndexedDB and mirrors into localStorage. A compact local version fence stores the newest era/generation/timestamp/tick tuple and full-record fingerprint. Cross-store reads reconcile only after both configured stores are readable: known fence rollback produces `NewerSaveUnavailableError`, equal-version differing records produce `ConflictingSaveCopiesError`, and any partial or total read failure remains an unknown-authority error rather than trusting a plausible survivor. Record writes reject older or equal-version-different snapshots with `StaleSaveWriteError`. Overlapping runtime save requests coalesce to the newest complete snapshot behind the in-flight write, and only success for the latest requested sequence in the active era/generation clears persistent failure UI.

A separate versioned localStorage deletion journal is written before best-effort backend cleanup, so an inaccessible stale IndexedDB copy cannot reappear in a later repository instance; only a strictly newer save clears that marker. Deliberate replacement versions order by nonnegative safe-integer era, generation, timestamp, then play tick, allowing a saturated generation to carry into a new era without wrapping. A valid record whose session payload is unreadable, or a pair of different records claiming the same version, enters explicit recovery: neither world is adopted, the title requires a non-empty seed, and the visible six-surface warning remains until the higher-version replacement is durable. A generic repository read failure instead means absence is unproven: runtime creation, resume, lifecycle saves, and manual saves are blocked; the title disables Continue and both world-creation forms; and the player receives a persistent reload instruction. A stale running tab similarly enters a terminal reload-required state and never loops retries against the newer copy. Repository operations clone records, sort summaries deterministically, and isolate malformed data. The platform export/import envelope has a version, 20 MB limit, slot/metadata validation, future-format rejection, and object-URL cleanup. The current UI does not expose those import/export helpers yet.

The published checkpoint makes every new world perpetual and removes the 10/25-minute Drift/Weave title choice. `SessionShape` deliberately remains `drift | weave | wander` in the save/view contract: valid older values load and round-trip unchanged, while runtime objectives and milestone handling ignore them and remain open-ended. New saves use `wander`. Quiet Hour remains a voluntary save/recap boundary, and no server or cloud dependency is introduced.

Unsupported simulation versions fail rather than being guessed into a current world. Explicit checksum-first migrations preserve the prior 64 × 48 world under current Tide Choir rules; no migration silently regenerates terrain from its seed.

## Dual p5 presentation

### Renderer lifecycle and production policy

Chart requests p5 `P2D`; Relief requests `WEBGL`. Both already exist. Chart
caps pixel density at 2 and Relief at 1.5; their requested cadence is 60 Hz.
Only the selected view loops and accepts input. Shared fixed-step simulation
continues under the runtime owner, independently of p5 `draw`. The title
atmosphere is a separate Canvas 2D surface with a 30 Hz ceiling, density cap
1.5 and 3.2-million-pixel backing limit. There are no application-owned
`p5.Graphics`, framebuffers, rendering workers or intermediate effect canvases.
Renderer mode does not prove acceleration or presentation throughput.

Production disables p5's Friendly Error validation through the supported
`disableFriendlyErrors` flag; development keeps the caller's policy. The flag
belongs to the shared p5 constructor, so a Relief shader operation can affect
Chart too. In the pinned p5 version, Strands cleanup after object-form
`Shader.modify` can restore a flag captured before application configuration.
`preserveP5RuntimePolicy` therefore restores the entry value in `finally`
around lazy perception-shader creation, including failure. Rendering arguments,
shader code, return values and ordinary errors remain unchanged. Recheck this
boundary against the exact dependency source when upgrading p5. This is
application integration; no library source or dependency version is modified.

Terrain geometry has an existing 768-entry bound; perception geometry has one
retained entry with quiet-time admission and vertex/byte limits. World,
generator, terrain and perception revisions own invalidation. Context loss and
destruction release GPU resources; quick view switches may retain bounded
presentation resources while stopping the inactive loop. Neither cache may
retain hidden actor knowledge or become simulation authority.

See [the measured integration record](RESEARCH.md#production-p5-policy-experiment--2026-10-01)
for evidence, upgrade constraints and unavailable measurements.

Released Alpha 29 projects the same authoritative physical carcass through Chart and
Relief only while current direct-detail perception permits it. Both views use
the same body ID, world position, species-clarity boundary, and depleted/remains
state. Neither renderer owns body state or may
infer an attacker, cause, claimant, resource count, or offscreen event.

Both renderers consume the same `TideweftView` and emit the same typed `RendererCommand`; neither owns simulation state. The projection carries the 120 × 120 frame's exact global tile origin alongside each selected Harp's canonical ID/label, fixed R/A/W knot tuple, three edges, center, and player-active boolean, the shared surface-current direction, projected roughness, derived per-tile biome/climate views, and knowledge-safe human, dog, individual-wildlife, and aggregate-evidence cues. Chart 2D keeps color-independent terrain/biome motifs and draws bounded streamlines plus foam over perceived water, adding arrowheads only while SOUND / SCAN is active. Relief 3D consumes `buildTerrainMesh()` chunks with seam-safe normals and biome-aware material references, resets persistent emissive state before every ground batch, draws the same flow vocabulary over live water, and projects pointer rays back onto the height field for selection and movement. Its Harps raise three cords from their knot objects to a suspended faceted bell, with stable cord beads and a crown when active. Both renderers give domestic cats, domestic chickens, domestic goats, marsh rabbits, marsh foxes, fish crows, northern harriers, snowy egrets, American black ducks, North American river otters, wild boars, elk, gray wolves, cougars, and brown bears distinct color-independent individual forms. A directly visible chicken uses one compact body, beak, comb, legs, and current heading; visible flock size is coarse context on the selected representative, never decorative clones or a hidden census. Touch hit targets and reduced-motion presentation retain the same knowledge. Brown-rat and frog-area signs, silverside surface dimples or glints, and fiddler-crab burrows or feeding scrapes use aggregate evidence forms; cat/rabbit/fox/wolf tracks remain individual evidence, while chickens, crows, harriers, egrets, ducks, otters, cougars, and brown bears produce no ground track in the live release. Wildlife visuals, labels, generous hit targets, and ABOUT remain gated through the same direct-detail projection. Actor sensing remains simulation-owned and unchanged by renderer choice, camera orbit, reduced-motion presentation, pointer type, or compact layout.

Released Alpha33 extends this same projection contract with
mountain-goat and golden-eagle individual forms plus American-pika haypile and
talus evidence. Selection identity and ABOUT remain bound to the same lawful
detail field; the aggregate never becomes a clickable hidden pika. An
authenticated ridge-soaring eagle is lifted above the sampled terrain and may
flap or bank, while a perched/resting eagle settles at its ridge anchor.
Reduced motion can suppress that decorative movement without changing the
activity fact. These are visual consequences of state-based activity, not an
authoritative continuously simulated 3D flight body.

The internal Alpha34 checkpoint extends only aggregate evidence projection:
directly visible capelin activity may appear as restrained surface dimples and
brief blue glints in either view, and quick inspection or ABOUT may describe
anonymous aquatic activity. The projection never exposes the species, school
identity, anchor, count, or an individual fish, and it disappears with the same
current-detail/occlusion boundary that gates the observing aerial actor.

The internal Alpha35 checkpoint adds one color-independent Arctic-fox form
through the shared wildlife projection and rendering paths. Selection, quick
inspection, and ABOUT remain bound to current direct detail and the same stable
actor ID; Chart and Relief cannot synthesize a body or reveal a hidden forage
target. Shared movement may leave an anonymous canid pawprint at the saved
movement site. No voice or species-private sensory presentation is added.

The internal Alpha36 checkpoint adds distinct color-independent harbor-seal
and polar-bear forms through those same wildlife projection and rendering
paths. Selection, quick inspection, ABOUT, pointer/touch targeting, and reduced
motion retain one shared stable identity and the same direct-detail boundary in
Chart and Relief. The renderer may present current shore-water activity and
generic pursue/flee intent, but it cannot create prey knowledge, contact,
injury, death, a body, or a private simulation outcome.

The internal Alpha37 checkpoint adds restrained aggregate anchovy
surface dimples or blue glints and ghost-crab burrow openings or feeding scrapes
through the existing evidence path. It also adds shared long-necked-wader,
shorebird-flock, and broad-winged-raptor forms for great blue heron, common
tern, and osprey in both Chart and Relief. Heron wading activity and tern/osprey
surface-opportunity or rest activity alter posture and bounded air-travel
presentation only when the authoritative current activity state supports them.
The renderer does not create an exact aggregate animal, hidden prey target,
ecological outcome, or continuously simulated 3D flight body.

The internal Alpha38 checkpoint reuses those same aggregate and
structural projection owners for menhaden, mummichog, grass-shrimp, and
blue-crab signs plus greater-yellowlegs, belted-kingfisher, and cormorant
actors. Current authenticated activity may alter wading, perching, surface-
swimming, diving, resting, or bounded travel posture. Neither renderer invents
an exact aggregate animal, feeding result, hidden target, continuous 3D flight
body, or information outside current lawful perception.

Released Alpha39 extends those shared projection
owners with anonymous mosquito/periwinkle aggregate evidence, a group-atomic
seaside-sparrow flock silhouette, and one low shelled diamondback-terrapin
actor. Current authenticated activity may alter perch, forage, rest, shore, or
surface-water posture. Neither renderer invents an exact aggregate animal,
bite, disease, feeding result, hidden target, continuous 3D flight body, or
information outside current lawful perception.

The composite renderer owns one disposable terrain-perception-memory store shared by Chart and Relief. It retains only a capped `120 × 120` scalar visibility array and eases lost terrain strength to its durable map baseline over 900 milliseconds; eight quantized Relief bands keep rebatching bounded. Clear-air terrain reaches at most 52 tiles, remains fully legible through 34, and uses an 18-tile distance feather; the exact-detail field remains 10 tiles. The buffer never retains projected terrain objects, entity/detail masks, labels, actions, hit targets, or save state. Exact water presentation, actors, parcels, resources, and interaction routing continue to consume the raw current-detail field and fail closed immediately. When the bounded frame slides, its terrain impression rebases by the same exact spatial delta as both cameras and active pointer routes. World/geometry identity changes, clock/tick regression, reload/destruction, and reduced-motion presentation otherwise settle the buffer without changing authoritative perception.

Relief cord roots and bell/label placement sample the discovery-masked surface rather than authoritative hidden elevation. Reduced-motion mode sets decorative bell bob and sway to zero but leaves cords, bell, labels, crown, and active words intact. Geometry memoization keys immutable projected Harp data, keeping these derived strings/cords out of the fixed-step rules.

The composed controller stops and hides the inactive p5 instance, releases held movement/brace input during a switch, retains the shared terrain-only impression across a quick view handoff, and falls back to Chart 2D if WebGL setup fails or its context is lost. A frame shift rebases the active Chart or Relief camera, held pointer target, and queued route in one render command rather than canceling input or snapping to a new center. The explicit view preference and terrain impression are local presentation state and are deliberately outside the authoritative save/checksum.

Explicit camera focus retains the same bounded 1.8-second inspection lease in
Chart and Relief. Reduced motion snaps without easing; it does not expire that
focus before a render frame can show it. The lease returns to the projected
camera target afterward and cannot change actor position or hearing.

The shared world-tap router distinguishes fine from coarse pointers. In the
current compatibility network, whose seven harbors are treated as known,
fine-pointer harbor input retains selection/inspection and coarse-pointer
harbor input emits an exact-center movement target in both Chart and Relief,
so a touch player arrives on the interaction tile before the contextual action
can open the inspector. Ordinary terrain taps keep their existing route
behavior. The reserved expedition-map owner must gate this together with
marker, route-memory, name, distance, bearing, camera-focus, Relief ring/label,
and hit-target channels: approximate knowledge can never route or focus an
exact undiscovered point.

At widths at or below 44rem—or at short landscape sizes no wider than 64rem—CSS removes the duplicate desktop HUD and folds the detailed objective, Promises, and inspector surfaces when the UI shell's disclosure flag is false. The shell starts compact and exposes a native 44-pixel `PROMISES + / PROMISES −` button whose `aria-expanded` state controls only the identified Promises surface. The compact strip is a translucent four-column projection of Stamina, Stability, Loom, and Cargo, with values and native progress semantics, followed by route and immediate safety/terrain cause. It deliberately hides keyboard-instruction copy; the large touch action dock remains reachable. The disclosure opens the existing scrollable Promises DOM as one full safe-area sheet, while settlement interaction opens the inspector as a mutually exclusive sheet. Neither disclosure nor sheet mode enters game saves.

The current CSS layer intentionally narrows the title and field palette to black/charcoal/off-white with small seafoam and gold semantic accents, hairline borders, and minimal blur. This is presentation-only; it does not fork DOM structure or gameplay between web and Electron.

## Versioned field manual

`src/ui/tutorialGuide.ts` is platform-neutral data with stable section/control IDs, audience filters, and explicit live/planned status. Guide versions 26 through 32 preserve the verified Alpha-16 through Alpha-22 lessons, while released version 33 records the Storehouse Door and outer-v15-to-v16 adoption. Released version 34 adds the one stable two-to-three-chicken yard flock, individual/group/custody identities, shared perception and terrestrial movement, broad ecological roles, exact open-store food transaction, secured-store and event-time knowledge boundaries, habitat-8 exact-prefix rule, settlement ecology 2, and outer-v16-to-v17 adoption. Released version 35 adds the separate stable two-goat herd and pen, plural custody, typed homes, shared resource arbitration, exact habitat-v8 and outer-v17 preservation, and outer-v18 adoption. Released version 36 adds the separate working dog and kennel custody, generic persisted guardian assignment, species-neutral perception participants, shared task and escape locomotion, actor-owned self-preservation, direct-detail work activity, conditional fox deterrence, and outer-v18-to-v19 adoption. Released version 37 adds the bounded investigation-to-return task lifecycle, mutual-sight handler cancellation, actor/welfare suspension and resumption, worksite arrival and handler acknowledgement, exact latest-outcome retention, and outer-v19-to-v20 adoption. It explicitly names new species, herding, separated-livestock search or rescue, full schedules, attacks, injury, mortality, carcasses, player commands, guaranteed livestock defense, autonomous kennel life, worldwide ecology, broader settlement-animal simulation, and exhaustive species/pair testing as absent. The player-facing world lesson uses continuous E/N coordinates and states that no edge action, generation prompt, address banner, loading screen, or second click is required.

Released guide version 38 documents the Alpha-28 exact goat split/reunion,
knowledge-honest recovery, atomic group materialization, and version-20-to-21
adoption. Released Alpha 29 advances the guide to version 39 and gameplay
contract to 27 for the exact-contact fox/rabbit harm boundary, one-life/one-body
conservation, finite fox/fish-crow carcass feeding, fox guarding, current-
perception-only aftermath presentation, outer save 22, core patch 3, aggregate
record 5, and exact version-21 adoption. It explicitly withholds every broader
mortality, population-recovery, decomposition/body-movement/scent/insect,
worldwide-ecology, and later-species claim.

Released Alpha 30 advances the guide to version 40 and gameplay contract to
28. It documents the one bounded remote regional source, wild boar, elk, gray
wolf, reusable sounder/herd/pack topology, shared perception and locomotion,
the wolf-pursuit versus solitary-rabbit mortality boundary, finite boar
scavenging, knowledge-honest Chart/Relief/ABOUT parity, habitat version 10,
and exact outer-v22-to-v23 adoption. It explicitly withholds audible upland
voice playback, dog interaction, tactical pack combat, group-member harm,
cougar, additional bear ecotypes, worldwide ecology, full Wave E, and broader
biodiversity completion.

Alpha 31 advances the guide to version 41 and gameplay contract to 29. It
documents the two solitary species appended at the exact Alpha-30 remote
source, shared habitat/population/perception/attention/locomotion/top-K/
presentation/save owners, the narrow cougar-to-currently-identified-solitary-
rabbit contact boundary, brown-bear non-pursuit, and conserved body claiming,
guarding, and consumption. It records exact habitat-v10-prefix and outer-v23-
to-v24 adoption and explicitly withholds groups, track evidence, audible voice,
species-specific dog-directed behavior, player/human/group harm, broader
mortality, ecological migration, worldwide ecology, full Wave E, and broader
biodiversity completion; ordinary lawful large-predator perception remains shared.

Released Alpha 32 advances the guide to version 42 and gameplay
contract to 30. It documents signed-region derivation and lawful absence,
measured pre-cap starting density, separate settlement-home derivation, one
global group-atomic materialization plan, sparse regional persistence, current
cross-owner perception and narrow marsh-fox/gray-wolf/cougar-to-eligible-
solitary-rabbit mortality/body ownership, and exact outer-v24-to-v25
compatibility disposition. It adds no
species and explicitly withholds worldwide species breadth, ecological
migration behavior, reproduction, population recovery, general tactical
mortality, complete scent tracking, the full bestiary, and broader biodiversity
completion.

Released Alpha33 advances the guide to version 43 and gameplay contract to 31
for the bounded Alpine sibling described above. The internal Alpha34 checkpoint
advances its source guide to version 44 and gameplay contract to 32
for the exact twenty-seven-record prefix, appended capelin record, sparse
polar-shore sibling, conserved tidal school, anonymous evidence, representative
visible/occluded aerial-pressure witness, V3/v27 adoption, and explicit
exclusions. Those source versions do not make Alpha34 a standalone public
release; they ship cumulatively in Alpha39.

The internal Alpha35 checkpoint advances its source guide to version 45 and
gameplay contract to 33 for the appended Arctic-fox record, one admitted
cold-shore actor, shared nonlethal visible/occluded capelin pressure, exact
V3-under-V4/outer-v28 persistence, the single global cap, and the explicit
exclusions above. Those source versions do not make Alpha35 a standalone public
release; they ship cumulatively in Alpha39.

The internal Alpha36 checkpoint advances its source guide to version 46 and
gameplay contract to 34 for harbor-seal and polar-bear records 30–31, their
capelin-backed polar-consumer source, shared shore-water and role-based
cognition, exact V4-under-V5/outer-v29 persistence, the unchanged global cap,
and the explicit no-contact/no-mortality boundary. Those source versions close
bounded Wave-F role coverage internally; they do not make Alpha36 a standalone
public release or complete Wave G, and they ship cumulatively in Alpha39.

The internal Alpha37 checkpoint advances its guide to version
47 and gameplay contract to 35 for the exact 31-record Alpha36 prefix, the five
Estuary Surface Break records 32–36, shared bounded neutral activity, one
visible-versus-ridge-occluded common-tern/anchovy witness, V6/outer-v30
persistence, the unchanged global cap, and explicit nonlethal checkpoint
limits. These source versions open Wave G toward 45 core-wildlife profiles;
they do not by themselves complete it, prove dedicated Wave-G performance or
seamless actor crossing, or make Alpha37 a standalone public release. They ship
cumulatively in Alpha39.

The internal Alpha38 checkpoint advances its guide to version
48 and gameplay contract to 36 for the exact 36-record Alpha37 prefix, seven
Marsh Channel Web records 37–43, breadth epoch-2 activation, shared tide,
aggregate, activity, perception, movement, presentation, and ABOUT authority,
one visible-versus-ridge-occluded cormorant/menhaden witness, unchanged
V6/outer-v30 persistence, the unchanged global cap, and explicit nonlethal
checkpoint limits. These source versions reach 41 / 43 and at that point leave
one final four-profile cohort plus dedicated Wave-G performance, seamless
crossing, and directive closure evidence; they do not make Alpha38 a standalone
public release. They ship cumulatively in Alpha39.

Released Alpha39 advances the Field Manual to version 49 and gameplay contract
to 37 for the exact 43-record Alpha38 prefix, four
Saltmarsh Small Worlds records 44–47, breadth epoch-3 activation, shared
aggregate/activity/perception/movement/group/presentation/ABOUT authority, one
visible-versus-ridge-occluded terrapin/periwinkle witness, unchanged
V6/outer-v30 persistence, and shared performance and seamless-crossing closure
owners. These released versions reach the exact 45 / 47 breadth boundary while
preserving explicit nonlethal, no-sound, and no-full-circadian limits. They
passed the cumulative Directive 04_1 release checkpoint in Alpha39.

Internal Alpha40 through Alpha52 advance the Field Manual/tutorial from version
50 through 62 and the gameplay contract from 38 through 50 in the same
one-version-per-milestone order. Those records cover the shared civil clock,
outdoor illumination, generic routine kernel, Two Rhythms, WAIT, the settlement
working dog's kennel continuity, the representative keeper, player REST/SLEEP
and outer-v32 adoption, egret and rabbit composition, the exact seventeen-
profile routine registry, all 42 current humans, and reciprocal settlement
rest. They retain their exact historical scope at each boundary, but none is a
standalone release; all first ship cumulatively in Alpha53.

Released Alpha53 advances the Field Manual/tutorial to version 63 and gameplay
contract to 51. It records the representative golden-eagle direct-owner
serialization/streaming harness, exact frame-cadence and lawful WAIT-interruption
witnesses, and packaged desktop Chart/Relief plus mobile Relief recovery
coverage. It retains outer save v32 and closes Directive 04_1A without claiming
the independent dog as a routine or bonded companion, physical interiors,
seasons, a packaged mobile Chart matrix, or universal low-end-device
certification. Released Alpha60 advances the Field Manual/tutorial to version
70 while retaining gameplay contract 51, outer save v32, simulation v4,
`RegionalEcologyStateV6`, and wildlife actor v1. These are the current
**LIVE_VERIFIED** manual, gameplay, and save boundaries.

`src/ui/tutorialDialog.ts` renders that one source into a native modal. Desktop T and the header control open a two-pane topic/page layout; the mobile ? opens the same content with a horizontal topic strip, independently scrolling page, safe-area sizing, and 44-pixel navigation. Opening the manual does not mutate simulation state or invoke the removed manual pause. The controller restores focus on close, and audience content is recomputed when the viewport changes.

## Electron security

Production loads packaged `dist/` files through a registered standard, secure `app://bundle/` protocol with URL decoding and path-containment checks. Development allows only the exact `http://127.0.0.1:5173` Vite origin.

The BrowserWindow has:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- `webviewTag: false`

The app enables Chromium’s process sandbox, denies permissions and devices, denies new windows/webviews, blocks unexpected navigation, applies a restrictive production CSP, packages in ASAR, and flips the supported Electron fuses. The packaged smoke path checks that renderer Node globals remain absent.

## Web and GitHub Pages

Vite uses `base: './'`, a single HTML entry, relative build assets, and no history-router deep links. `public/manifest.webmanifest` and the code-native SVG icon are copied into `dist/` and referenced relatively, so the build works beneath an arbitrary GitHub project subpath and under `app://bundle/`.

The Pages workflow runs `npm ci`, type-checking, the deterministic suite, and the web build before uploading only `dist/`. Static Pages has local saves only; cloud continuity or genuine cross-player asynchronous strands would require an explicit backend and abuse/privacy design.

Validate emitted files with `npm run build:web` and `npm run smoke:web`, then
run the browser witness against static `dist/` beneath `/tideweft/` using
`npm run profile:browser -- --packaged-baseline <artifact.json>`. The development
server is not production acceptance. There is no service worker, required
backend, history-router rewrite or application worker today. Current browser
compilation targets ES2022; an explicit minimum-browser-version matrix is not
yet established. Report the actual tested browser and untested targets.
The current Pages workflow publishes main pushes; a local optimization commit
does not authorize a push, deployment or exact-live-build claim.

## Platform and distribution responsibility

Web deployment and the hardened packaged Electron runtime are live, while
signed/notarized Mac, Linux, and Windows distribution is not yet a complete
cross-platform release contract. Later packaging must carry the same tested
simulation, save/migration, input, accessibility, security, and local-first
rules; a platform build may not fork gameplay truth. Release claims bind to the
exact tested artifact, and installers, updates, lifecycle handling, and signing
must fail honestly when their platform-specific evidence is absent.

`npm run package:desktop` invokes Forge packaging; its pre-package hook builds
the web artifact. `npm run make:desktop` also creates the configured host
platform/architecture ZIP. ASAR includes only the manifest, Electron main entry
and `dist/`; no preload, application IPC, native game dependency or unpacked
resource path exists. Test the generated executable independently with
`npm run smoke:desktop -- --executable <packaged-executable>` using disposable
data. Compilation, packaging, ZIP creation, launch, installer testing and
signing/notarization are separate outcomes. The current Forge configuration has
no installer, updater or signing/notarization setup. macOS, Linux and Windows
remain product targets; a host-only ZIP pass does not verify the other targets.

Changes to rendering, workers, dependencies or platform integration must
preserve supported production web/GitHub Pages and desktop builds. Profile
before optimizing, validate generated artifacts, record dependency changes in
installation sources and their canonical rationale, and report untested
targets. Use targeted component tests plus critical smoke during edits; perform
both affected artifact checks at an integration checkpoint. Do not lower visual
quality, slow simulation or weaken security to satisfy a timing gate.

## Verification layers

1. RNG vectors and same-seed generation.
2. Generated-world invariants and long-run soak.
3. Replay equivalence across batched stepping.
4. Save/reload continuation and checksum rejection.
5. Economy/cargo conservation and legal contract transitions.
6. Active-graph pathfinding, storms, congestion, topology metrics, and project effects.
7. Player traversal, stamina/stability sweep causes, deterministic recovery, tutorial, signed reports, and platform persistence.
8. Tide Harp candidate/selection/containment determinism, active/inactive recharge and four-origin sounding, cargo/inventory non-mutation, legacy save shape, UI copy, and discovery-safe/reduced-motion render geometry.
9. Derived biome stability/weather transforms/projection/presentation, coarse-pointer harbor routing, field-manual audiences/content, report-action refresh guards, four-vital mobile HUD copy, pure cargo-environment evaluation, and pure rock/ladder derivation/validation.
10. Existing-human visual occlusion and salience, anonymous directional hearing, weather/water masking, wind propagation, bounded attention/suspicion, last-known search/reacquisition/give-up, whole-frame fail-closed input, save migration, and knowledge-safe quick/ABOUT projection.
11. Core-wildlife same-seed identity, version-4 twelve-record profile/registry coherence, explicit all-broad-target catalog rows, habitat hashes and honest absence, exact habitat-v3-prefix preservation under v4, individual and aggregate population-unit conservation, representative/group/materialization/evidence/disturbance caps, array-order independence, direct/peripheral/occluded sight, canonical species-driven aggregate visual sources, fox pressure versus neutral rabbit co-presence, anonymous alarm and group-signal propagation, deer/gull/crow flock continuity, role-and-size-aware trophic decisions, rabbit alarm/flee, finite nonlethal fox/harrier pursuit, causal crow alarm/mobbing interruption, shared terrestrial/aerial locomotion, authenticated perch and low-quartering activity, physical crow food custody, direct rat/frog/cat/rabbit/fox evidence boundaries, visible-event-only individual calls, rain-raised but rain-masked anonymous directional chorus, one structured group event per qualifying cadence, bounded anonymous human/dog hearing, no chorus announcement or load-time player playback, bounded aggregate quieting/redistribution, whole-parcel conservation, negative seam reach, nonlethal cargo-neutral player-absent aftermath, full/coarse/full continuity, exact outer-v11 migration/current-v12 reload, selected-flock ABOUT parity, and knowledge-safe Chart/Relief individual/aggregate inspection with mouse/touch and reduced-motion parity. Shared invariants, representative interaction scenarios, and bounded fuzzing stand in for an exhaustive species-pair matrix.
12. Fifteen-record current-registry coherence; habitat-v5 exact version-4-prefix preservation; stable tidal elevation metadata; target-tick water depth and usable-anchor projection; conserved silverside-school and fiddler-crab-area identities and totals; immediate dry-anchor fish refuge plus fixed-cadence one-unit redistribution; tide-responsive aggregate activity and direct evidence; one persistent snowy-egret identity, dry refuge, lawful anonymous aquatic-activity observation, shared aerial movement, and nonlethal pressure/avoidance; no capture, consumption, cargo mutation, mortality, fake aggregate actors, hidden census, or ecological migration; exact outer-v12-to-v13 adoption; and a bounded Tide Table readiness/performance witness.
13. Sixteen-record source-catalog coherence; habitat-v6 exact habitat-v5-prefix preservation; zero-or-one stable American-black-duck identity with two dabbling-water destinations and one dry refuge; lawful anonymous aquatic-activity observation; only air plus shallow/deep-water catalog movement; explicit `air` or `surface-water` activity projection through ordinary locomotion with no land/walk route; knowledge-honest Chart/Relief/ABOUT; durable schema-v4 completed tide-edge operation clocks after bounded event-tail eviction; exact sealed outer-v13-to-v14 adoption; and bounded representative/performance evidence with flock, nesting, mortality, wake, cross-region ecology, and direct water/tide condition mutation explicitly absent.
14. Seventeen-record source-catalog coherence; habitat-v7 exact habitat-v6 population/anchor-prefix preservation; zero-or-one stable North American river otter identity only with fish/crab/water/shore support; shared amphibious shore-to-water round trip; current anonymous aquatic activity through ordinary LOS; nonlethal fish/crab pressure; one representative generic physical loose-food claim/custody conflict; deterministic local-distance/stable-ID top-K under the unchanged 24-actor cap; knowledge-honest Chart/Relief/ABOUT/touch/reduced-motion presentation; exact sealed outer-v14-to-v15 adoption; and explicit absence of live-prey capture or consumption, harmful attacks, injury, mortality, carcasses, fishing, new sound/evidence, reproduction, migration, worldwide ecology, Wave-C or broader biodiversity completion, and exhaustive species-pair testing.
15. Released Alpha-22 activity-affordance registry/profile coherence across six existing participants; generic actor-address plus surface-opportunity plus tidal-activity selection; terrain-occluded same-tick anonymous aquatic surface observation; gull air-only circling and authenticated habitat-anchor rest; immediate-intent priority; unchanged outer-save-15/habitat-7/aggregate-4 envelopes; exact physical-food and aggregate-unit conservation; knowledge-honest Chart/Relief/ABOUT presentation; abstraction and property checks, bounded interaction-graph fuzzing, performance budgets, and representative scenarios without new species or an N² pair matrix; and fail-closed exclusions for worldwide Wave C, mortality, carcasses, harmful attack, live-prey capture/consumption, fishing, nesting, reproduction, migration, full circadian life, and general scent/sound/evidence.
16. Released Alpha-23 stable store/keeper/lot/rat-anchor identity; physical store stock distinct from abstract settlement food; open/secured source leakage through the existing wind/rain scent owner; authenticated at-most-one-unit loss per matching relocation event; rat-population and physical-item conservation; exact-once pending/commit/replay behavior; visible-cat aggregate pressure without cat rat-sign cognition; a knowledge kernel that authenticates direct keeper observation plus the live in-person player-report path; persistent closure; event-time player-knowledge gating; exact sealed outer-v15-to-v16 adoption with habitat 7 and aggregate 4 unchanged; Chart/Relief parity; shared abstraction checks, a bounded signed-coordinate property sweep, conservation, and a representative store-rat-visible-cat witness while inherited shared fuzz/performance gates remain in regression rather than expanding into exhaustive species or pair tests; and explicit exclusion of new species, worldwide settlement ecology, schedules, livestock, rumors, mortality, carcasses, live-prey consumption, the full bestiary, and broader biodiversity completion.
17. Alpha-24 eighteen-record catalog coherence; habitat-v8 exact habitat-v7 population/anchor-prefix preservation; one stable two-to-three-member domestic-chicken population and `CHICKEN-FLOCK`; canonical settlement/keeper/member/home custody; broad-class direct perception and shared alarm; ordinary terrestrial movement; authenticated open-store exact-one-unit physical consumption with secured and unseen negative branches; event-time knowledge honesty; Chart/Relief/ABOUT/touch/reduced-motion parity; exact sealed outer-v16-to-v17 and settlement-v1-to-v2 adoption; shared signed-coordinate invariants, migration/replay attacks, physical conservation, bounded performance, and one representative visible-yard witness rather than species-by-species or N² pair testing; and explicit absence of calls/tracks, attacks, injury, mortality, carcasses, live-prey consumption, eggs, nesting, reproduction, herding, guardian behavior, complete schedules, autonomous home return, ecological cross-region migration, worldwide livestock, full Wave D, and broader biodiversity completion.
18. Alpha-25 nineteen-record catalog coherence; habitat-v9 exact habitat-v8 prefix preservation; one separate pen and exactly two stable domestic goats in one `GOAT-HERD`; plural canonical custody with typed coop/pen homes and unique member/group/relationship/home/structure authority; goat exclusion from store provisions and unsupported living-foliage browsing; deterministic shared resource contention by physical reach, current need, and stable identity; authenticated individual coat continuity across Chart and Relief; exact sealed outer-v17-to-v18 and settlement-v2-to-v3 adoption; shared signed-coordinate invariants, migration/replay attacks, conservation, bounded performance, and representative runtime composition rather than species-by-species or N² pair tests; and explicit absence of calls/tracks, attacks, injury, mortality, carcasses, reproduction, milk, wool, herding, guardian behavior, complete schedules, autonomous home return, cross-region ecological migration, worldwide livestock, full Wave D, and broader biodiversity completion.
19. Alpha-26 unchanged nineteen-record catalog and habitat-v9 prefix; one separate deterministic working dog in a bounded roster; third domestic custody and typed kennel; generic persisted assignment tied to the existing keeper, goat custody, herd, and pen; lawful anonymous alarm evidence through species-neutral external perception participants; shared investigation, escape, and return locomotion; actor-owned cognition, needs, exposure, and self-preservation; exact-once activity staging/recovery; direct-detail Chart/Relief/ABOUT activity; exact sealed outer-v18-to-v19 and settlement-v3-to-v4 adoption; runtime and regional-continuity proofs; and one representative rabbit-alarm/fox-sees-dog emergence chain. Shared invariants and representative witnesses replace species-by-species or N² coverage, and attacks, injury, death, carcasses, herding, new sound, guaranteed defense, worldwide dogs/livestock, cross-region animal ecology, full Wave D, and broader biodiversity completion remain absent.
20. Alpha-28 caused exact group split versus distance-only non-split; direct-sight regroup with danger/welfare priority; lawful caretaker absence knowledge, explicit last-known-area report, existing-guardian search without find proof, exact-body reunion, current pen confirmation, retained known-case coarse reunion, atomic whole-group materialization, no off-frame local cognition or locomotion, exact-once recovery persistence and outer-v20-to-v21 adoption. Shared invariants, properties, replay/migration checks, bounded performance, and representative emergence cover the seam without a per-species or N² matrix; herding, schedules, guaranteed recovery, remote markers/player search, attacks, injury, mortality, carcasses, calls, tracks, and full cross-region ecology remain absent.
21. Alpha-29 unchanged roster/habitat; current identified fox pursuit plus exact rabbit contact; named injury/death; exact-once actor retirement and one-unit population loss with conserved reserve; one stable finite physical body; lawful fox/fish-crow sight, reach, claim, one-unit feeding, and fox guarding; direct-perception-only Chart/Relief/EVENTS projection; exact outer-v21-to-v22, core-patch-v3, and aggregate-v5 adoption; migration/replay/conservation/signed-world/bounded-performance invariants; and representative mortality/scavenging scenarios rather than per-species or N² coverage. Broader mortality, group-member death, population recovery, live decomposition/body movement/harvest/scent/insects, worldwide ecology, and later Wave-E species remain absent.
22. Alpha-30 twenty-two-record catalog coherence; exact habitat-v9 prefix under habitat v10; one deterministic signed remote source; appended wild-boar, elk, and gray-wolf populations with reusable `SOUNDER`, `HERD`, and `PACK` topology; shared perception, attention, locomotion, materialization, evidence, item-claim, mortality/body, and presentation owners; exact wolf contact against one eligible solitary rabbit; finite boar/wolf carcass participation; exact outer-v22-to-v23 adoption; migration/replay/conservation/signed-extreme/property/performance invariants; and one representative emergence chain rather than per-species or N² coverage. Dog interaction, audible upland calls, tactical pack combat, group-member harm, cougar and additional bear ecotypes, reproduction, ecological migration, worldwide ecology, complete turnover, full Wave E, and broader biodiversity completion remain absent.
23. Alpha-31 twenty-four-record catalog coherence; exact habitat-v10 source/population prefix under habitat v11; solitary cougar and brown-bear habitat-population records evaluated at the existing deterministic signed remote source with actors only for supported capacity; shared perception, attention, locomotion, materialization, item-claim, mortality/body, and presentation owners; exact cougar contact against one currently identified eligible solitary rabbit; brown-bear live-prey non-response; finite cougar/brown-bear carcass participation and guarding; exact outer-v23-to-v24 adoption; replay/conservation/signed-extreme/property/performance invariants; and one representative predator/scavenger chain rather than per-species or N² coverage. Group behavior, tracks, audible calls, species-specific dog-directed behavior, player/human/group harm, broader mortality, reproduction, ecological migration, worldwide ecology, full Wave E, and broader biodiversity completion remain absent; ordinary shared large-predator perception remains live.
24. Released Alpha33 twenty-seven-record frozen-prefix coherence; sparse signed/extreme-coordinate Alpine habitat with lawful absence; stable mountain-goat `HERD`, non-addressable conserved American-pika aggregate, and solitary golden-eagle identity; shared opt-in directed-grade locomotion; world-bound ridge soar/perch authority and state-based knowledge-honest Chart/Relief/ABOUT presentation; current LOS/occlusion-gated nonlethal eagle pressure with pika conservation; one global group-atomic 24-actor cap and atomic cross-layer commit; exact v25-child wrapping and outer-v26 adoption/reload; bounded provenance-safe habitat/ridge caches; and explicit exclusion of new mortality, capture, exact pika targeting, reproduction, audible Living Voice, tactical combat, polar breadth, worldwide ecology, Wave-F completion, and N² testing.
25. Internal Alpha34 checkpoint, first shipped cumulatively in Alpha39: exact twenty-seven-record compatibility prefix plus capelin record 28; sparse cold-saline polar-shore admission with lawful absence and coordinate-limit-safe signed territories; one conserved non-addressable school of up to 64 units over at most four tide-safe anchors; generic tide/activity/evidence policy; anonymous dual-view ABOUT evidence; one visible-versus-occluded cross-owner aerial-pressure witness with no mortality, body, cargo, or item effect; byte-exact runtime/dormant ordering; pristine sparse persistence; active-key work bounded independently of explored history; exact V2 child plus polar sibling under V3/outer-v27 adoption; and one global atomic materialization/conservation commit. It explicitly excludes Arctic fox, polar bear, seal, new seabird, snow/ice behavior, new mortality, capture, reproduction, audible Living Voice, and Wave-F completion, and carries no standalone release or deployment claim.
26. Internal Alpha35 checkpoint, first shipped cumulatively in Alpha39: exact twenty-eight-record Alpha34 prefix plus Arctic-fox record 29; sparse cold-shore admission only over a viable admitted capelin substrate; exactly one solitary addressable actor per admitted source through shared identity, perception, attention, condition, locomotion, dormant autonomy, evidence, ABOUT, and dual-view presentation; current LOS/occlusion-gated generic nonlethal pressure with exact aggregate conservation; pristine sparse persistence; exact V3 child plus cold-shore sibling under V4/outer-v28 adoption; and the same one global group-atomic 24-actor cap and atomic cross-layer commit. It explicitly excludes capture/consumption, new mortality, reproduction, audible Living Voice, seal, polar bear, new seabird, snow/ice behavior, full migration, Wave-F completion, Wave-G breadth, Directive completion, and standalone release/deployment evidence.
27. Internal Alpha36 checkpoint, first shipped cumulatively in Alpha39, plus its first Wave-G boundary hardening: exact twenty-nine-record Alpha35 prefix plus harbor-seal and polar-bear records 30–31; one capelin-backed polar-consumer source with connected cold saline foraging water, a distinct dry haulout, one solitary seal, and a rarer bear only after the exact seal candidate exists; shared amphibious traversability with `amphibious-route` kept orthogonal to authenticated otter/seal `shore-water-activity`; individual cognition, materialization, sparse persistence, knowledge-honest ABOUT, and dual-view presentation; one current-LOS/occlusion-gated representative chain proving conserved seal pressure on capelin plus nonlethal bear pursuit and seal flight; exact V4 child plus polar-consumer sibling under V5/outer-v29 adoption; and the same one global group-atomic 24-actor cap and atomic cross-layer commit. It closes bounded Wave-F role coverage while explicitly excluding contact/capture/consumption, new mortality/bodies, player or dog harm, sea ice/snow, reproduction/recovery, audible Living Voice, Wave-G species breadth, Directive completion, and standalone release/deployment evidence.
28. Internal Alpha37 checkpoint, first shipped cumulatively in Alpha39: exact 31-record Alpha36 prefix plus bay-anchovy, Atlantic-ghost-crab, great-blue-heron, common-tern, and osprey records 32–36; one habitat-gated append-only Estuary Surface Break breadth root with honest regional absence; two conserved non-addressable aggregates, two solitary actors, and one group-atomic tern flock; shared Tide Table, activity, perception, locomotion, ABOUT, and dual-view presentation; an authenticated heron wading anchor plus tern/osprey air-only surface-opportunity/rest behavior subordinate to danger; one clear-versus-ridge-occluded common-tern/anchovy nonlethal pressure witness with exact conservation; exact V5 child plus breadth root under V6/outer-v30 adoption; and the same one global group-atomic 24-actor cap and atomic cross-layer commit. It opens Wave G toward 45 core-wildlife profiles while explicitly excluding sound, capture/consumption, new mortality/bodies, player or dog harm, reproduction/recovery, continuous 3D flight, dedicated Wave-G performance or seamless actor-crossing proof at that checkpoint, Directive completion, and standalone release/deployment evidence.
29. Internal Alpha38 checkpoint, first shipped cumulatively in Alpha39: exact 36-record Alpha37 prefix plus Atlantic-menhaden, mummichog, grass-shrimp, blue-crab, greater-yellowlegs, belted-kingfisher, and double-crested-cormorant records 37–43; append-only breadth epoch 2 with dependency-gated honest absence; four conserved non-addressable aggregates, one solitary kingfisher, and group-atomic yellowlegs/cormorant flocks; shared Tide Table, aggregate, activity, perception, locomotion, ABOUT, and dual-view presentation; one clear-versus-ridge-occluded cormorant/menhaden nonlethal pressure witness with exact conservation; unchanged V6/outer-v30 with deterministic old-epoch activation; and the same global group-atomic 24-actor cap and atomic cross-layer commit. It reaches 41 of 45 core-wildlife profiles while explicitly excluding sound, capture/consumption, new mortality/bodies, player or dog harm, reproduction/recovery, continuously simulated 3D flight, Directive completion at that checkpoint, and standalone release/deployment evidence.
30. Historical released Alpha39 cumulative biodiversity closure: exact 43-record Alpha38 prefix plus eastern-saltmarsh-mosquito, marsh-periwinkle, seaside-sparrow, and diamondback-terrapin records 44–47; append-only breadth epoch 3 with exact substrate dependencies and honest absence; two max-two-anchor conserved non-addressable aggregates, one two-to-four-member group-atomic sparrow flock, and one solitary terrapin; shared aggregate, activity, perception, locomotion, group, ABOUT, and dual-view presentation; one clear-versus-ridge-occluded terrapin/periwinkle nonlethal pressure witness with exact conservation; unchanged V6/outer-v30 with deterministic epoch-2 adoption; and the same global group-atomic 24-actor cap and atomic cross-layer commit. Shared performance and seamless-crossing closure owners cover the architecture without per-species tests. It reaches the released 45 core-wildlife / 47 living-record boundary while explicitly excluding bites/disease, exact insect/snail actors, capture/consumption, new mortality/bodies, sound, reproduction/recovery, full circadian behavior, and continuous 3D flight. Gameplay commit `40bfeebde94729ffb1034764ffba3e18100ac1fc` plus timeout-only descendants `7455fd0` and `c67f30b10066f60372d2cf84e1e6eacae1cbd31f` passed CI `34905718204`, Pages `34905718214`, and a 5/5 exact-live comparison.
The internal Alpha43 routine milestone, **Two Rhythms**, first shipped
cumulatively in Alpha53, retains Alpha42's generic
version-1 living-circadian kernel with four reusable profiles, orthogonal
clock/tide/weather/opportunity driver vocabulary, stable identity-derived phase
plus a bounded not-yet-scheduled evaluation hint, fixed-point wake sensitivity,
priority overrides, and AWAKE/RESTING/ASLEEP/STARTLED state. A frozen
species + activity-archetype registry binds exactly fish crow + `perch-watch` +
day-active and North American river otter + `shore-water-forager` +
night-active. Crow perch and otter dry-haulout arrival are physical prerequisites
for rest; the active otter returns toward authenticated foraging water at night,
strong lawful disturbance may wake either animal, and each compact routine
receipt survives save/load and bounded coarse streaming. Harbor seal shares the
shore-water archetype but remains explicitly unbound on its legacy bounded
daylight/rest path.

Outer save v31, exact outer-v30/V6 adoption, nested V6, and actor
schema/version 1 remain unchanged. The current species catalog now declares the
otter nocturnal, while the frozen Alpha32–36 and three Wave-G historical catalog
roots retain their exact authenticated bytes and hashes. This is two physical
wildlife compositions, not catalog-wide circadian life. Humans, dogs, player
WAIT/REST/SLEEP, production crepuscular or tide-driven bindings, Living Voice,
and Directive 04_1A closure remained absent at that internal milestone.

The internal Alpha45 **Kennel Night** milestone, first shipped cumulatively in
Alpha53, adds a fail-closed adapter for the one settlement-custodied working
dog, its persisted guardian assignment, and its actual kennel. Shared
day-active projection, stable dog-plus-kennel
destination identity, awake physical travel, arrival-gated restorative
posture, weather shelter separated from posture-gated exhaustion recovery,
stable-identity waking, lawful danger/needs/work priority, actual-intent
startled deferral, optional dog-record persistence, post-recovery routine
reprojection, and direct-detail Resting/Asleep presentation are covered without
changing outer save v31, settlement ecology v4, or working-animal state v2.
Humans, the independent dog, bonded/player companions, and player REST/SLEEP
remain excluded from Alpha45. That milestone has no standalone push, CI, Pages,
or live-verification claim.

The internal Alpha46 **The Keeper Sleeps** milestone, first shipped
cumulatively in Alpha53, connects exactly the existing starting-harbor
food-store keeper to the same shared day-active authority. Its
home settlement is an authenticated rest anchor, not an invented house or bed;
route work, contracts, current response, storm, urgent needs, and lawful strong
disturbance retain priority. The lower simulation owns the optional resident
receipt, posture-gated recovery, post-contract reconciliation, and the final
post-command sensory gate: an asleep keeper cannot acquire new vision, while
hearing and scent remain lawful wake channels and same-tick work restores
ordinary visual admission. Direct inspection exposes only Resting/Asleep.
Legacy absence remains byte-stable until a lawful home tick, outer save v31 is
unchanged, and the slice claims no other human schedule, interior, autonomous
commute, or player REST/SLEEP. It has no standalone push, CI, Pages, or live-
verification claim.

The internal Alpha47 **Rest and Rise** milestone, first shipped cumulatively in
Alpha53, closes that player-action gap without claiming broader daily life.
`REST 30 MIN` is available on stable dry footing when stamina is below full;
`SLEEP TO DAWN` replaces it only at a
settlement during Dusk or Night and outside storm weather. Both execute
ordinary authoritative fixed steps, preserve all world consequences, and can
be interrupted at a committed boundary by deliberate action, physical loss of
eligibility, or lawful strong disturbance. Sleep withholds new visual detail
but not terrain awareness, lawful hearing, or physical consequences. Its
version-1 receipt is durable in outer save v32 and resumes at the exact saved
world tick and partial player-step phase with no offline advance. Quiet Hour's
`Save & return` remains a separate zero-time stopping action. Alpha47 has no
standalone push, CI, Pages, or live-verification claim and adds no new
fatigue/needs/health, physical camp, interior, or Turning Day closure by itself.

The internal Alpha48 **Tide at the Roost** milestone, first shipped
cumulatively in Alpha53, adds the exact snowy-egret + `tidal-wader` +
`adaptive-active` registry composition. Current tide and a
current lawful anonymous aquatic-opportunity receipt can activate the routine;
ordinary aerial locomotion still owns movement to its saved dry refuge, and
Resting/Asleep remain arrival- and settling-gated. Priority overrides remain
authoritative, the optional wildlife receipt preserves the same committed
bout by storing policy, the authenticated rest-destination receipt, and posture
with its entered tick. Actor identity remains separately stable and phase is
deterministically rederived from identity plus policy. Outer save v32 plus
`RegionalEcologyStateV6` remain unchanged. Raw
parsing preserves canonical data without authenticating live refuge/location;
full-detail activity does that before behavioral use. Coarse absence does not
resample tide or opportunity and retains only the already committed bounded
rest bout until rematerialization. This adds no actor, population, prey,
teleport, harm, mortality, crepuscular or weather binding, validated broad
coarse-time advancement, catalog conversion, release evidence, or
directive-closure claim.

The internal Alpha49 **Twilight at the Marsh Edge** milestone, first shipped
cumulatively in Alpha53, binds the existing marsh rabbit to
`ground-cover-forager` + `twilight-active` through the generic
registry. `circadian-activity`, `circadian-routine`, and explicit `land` travel
form one validated capability/profile/locomotion contract.
The shared activity owner physically moves the rabbit within a bounded local
area during its shifted twilight windows and toward its authenticated habitat
cover when rest is preferred. Travel remains Awake; Resting and Asleep remain
arrival- and settling-gated. Neutral activity proves no food or feeding, and
cover does not imply a burrow or den. Current danger or lawful disturbance,
urgent needs, and retained commitments retain priority, including over a stale
REST suggestion. Full-detail projection reauthenticates the cover and body;
coarse absence preserves only an already committed rest bout. Current catalog
truth becomes crepuscular without changing any frozen historical catalog hash.
Outer save v32 and `RegionalEcologyStateV6` remain unchanged, as do the existing
exact-contact rabbit mortality and carcass owners. At that internal milestone
this had no standalone release evidence and did not claim a weather-driven
binding, catalog-wide schedules, validated broad coarse time, or directive
closure.

The internal Alpha50 **Many Rhythms** milestone, first shipped cumulatively in
Alpha53, makes the declarative circadian registry an exact cover of all
seventeen current addressable activity profiles. Fourteen use day-active
policy, while the established river otter,
snowy egret, and marsh rabbit retain night-active, adaptive-active, and
twilight-active policies respectively. Every branch now carries the shared
routine receipt through its existing authenticated rest place and movement
owner, including response and ordinary activity states; actual arrival alone
can authorize Resting/Asleep or a visible rest label. Qualifying authoritative
rain activates the American black duck through the generic weather-driver
declaration, while storm prefers its existing refuge, and production
cognition/movement/presentation/ABOUT consume the same current weather sample.
Duck, otter, yellowlegs, and terrapin retain clock-based wake policy while their
physical action/destination branches remain tide/depth-responsive; this avoids
an always-usable-water signal erasing sleep. Egret remains the actual
clock/tide/opportunity wake composition. The dry-margin path no longer labels
an awake active terrapin as resting.

The current catalog derives rhythm and cadence from those shared policies;
explicit compatibility adapters preserve every Alpha32–39 catalog byte and
hash. Southern leopard frogs remain non-addressable conserved aggregates whose
real rain activity and chorus do not create a fictitious individual posture.
Outer save v32, Regional Ecology V6, wildlife actor v1, every population and
stable identity, physical resources, cargo, and existing mortality remain
unchanged. Alpha50 has no standalone release claim. It does not bind the other
28 wildlife profiles, other 41 humans, the independent dog, or a not-yet-
existing player-bonded companion, and at that milestone it did not supply final
multi-day/package proof or close Turning Day.

The internal Alpha51 **A Day Shared** milestone, first shipped cumulatively in
Alpha53, adds one bounded generic resident adapter over the already-optional
human receipt and commits the entire 42-person roster atomically. Home location
authorizes rest; existing route and
Promise state authorizes travel/work; only the keeper wrapper contributes a
validated external duty. Current identified/alert/searching cognition owns
watchfulness, and the simulation's recovery gate consumes the same rule. The
adapter creates no occupational schedule, movement, lodging, or knowledge.
Legacy humans adopt only at home on an ordinary tick, so a foreign visitor stays
without a circadian receipt rather than teleporting or being presented as
Resting/Asleep. Alpha45's relationship-bearing
working dog remains the existing kennel continuity proof. The independent dog
has no valid rest anchor, and no bonded player companion is claimed. Save v32,
simulation v4, resident identity/relationships, and dog roots remain unchanged.

The internal Alpha52 **Rest Between Harbors** milestone, first shipped
cumulatively in Alpha53, closes that explicit visitor gap without adding a save
root or movement owner. A free resident at any physically valid settlement is
at the reciprocal settlement-rest network;
the home-derived opaque ID remains byte-identical while current location owns
the actual refuge. One real outbound Promise can therefore end in foreign rest,
save/reload, and a later real reverse Promise by the same identity with cargo
conserved in both directions. No automatic return, house, guest bed, interior,
or teleport exists. Alpha52 was an internal checkpoint rather than an
independent release.

Released Alpha53 **The Turning Day** is **LIVE_VERIFIED** and adds no new
simulation owner; it supplies the closure witnesses for the shared architecture
accumulated through the non-standalone internal Alpha40–52 milestones.
Production-backed checks cover exact frame-cadence authority, lawfully heard
automatic WAIT interruption, all 42 current humans, all seventeen addressable
wildlife rhythms, three simulated days of real resident and wildlife routine
projection with daily world serialization, restored regional-ecology
continuation, and bounded save growth, plus one
representative golden eagle across dematerialization/rematerialization. The
packaged evidence spans stopped Title/Quiet Hour clocks, a real REST action,
desktop Chart and Relief, and mobile portrait/landscape Relief using shared
production authority; packaged mobile does not claim a separate Chart matrix.
It is deliberately representative, not a full-catalog scripted journey. The
working settlement dog is not a bonded player companion, packaged timing is not
low-end-device certification, and the independent dog, physical interiors, and
seasons remain broader work.

Exact feature commit `a419f774260292331e8c93ebc65ee3fd5125f7c3` is preserved
beneath validation-only descendants `f6a8816`, `e3fe15d`, and final executable
descendant
`da4a75f2eae7c14b2d05f5c89178788d0005aba4`. CI `35375612294` passed 290
test files / 2,791 tests; Pages `35375612200` succeeded; all 5/5 exact live
production files matched the 4,251,968-byte build; and the packaged runtime-only
ASAR contains 10 entries / 4,472,022 bytes. At that historical released
boundary, outer save v32, gameplay contract 51, and tutorial/Field Manual
version 63 were current. Directive 04_1A is closed
and **LIVE_VERIFIED**.

Released Alpha60 **The Breathing Room** is the current **LIVE_VERIFIED**
release. It adds no parallel simulation owner and preserves deterministic
ecology, physical custody, knowledge, difficulty, and save bytes while bounded
exact-match receipts, retained presentation geometry, and stable projections
avoid repeated unchanged work. The exact source, executable, and pushed commit
is `c78977ba9733dbb17a1f2461a0a94c5dcdfc1fd0`; the local cumulative gate passed
312 test files / 3,009 tests; CI `36442886220` and Pages `36442886243`
succeeded; and all 5/5 cache-bypassed deployed production files matched the
4,377,380-byte tested web artifact. The runtime-only ASAR contains 10 entries /
4,599,453 bytes. Outer save v32, simulation v4, `RegionalEcologyStateV6`,
wildlife actor v1, and gameplay contract 51 remain unchanged; Field Manual 70
is current. Host-specific cadence is not universal 60 FPS or low-power
certification, and the periodic world-update hitch remains visible in
worst-frame gaps. Directive 04_1B is closed; 04_2 **The Living Voice** is active
in the local unpublished candidate and is not part of the Alpha60 release.

31. Vite production build under relative paths.
32. Packaged Electron launch, visible title controls, `app://` resource load, preserved-estuary content inside the 120 × 120 moving frame, deterministic R1/A3/W5 Harp placement and remote echo, both Chart/Relief canvas switches, actual Relief bell/cord evidence, desktop plus portrait/landscape mobile probes, Node-global absence, and zero renderer warnings/resource failures.

The Phase 10 gate passes TypeScript, 28 Vitest files / 205 checks, the production and nested-path web gates, that extended packaged smoke, `git diff --check`, and a scoped source secret scan. Exact commit `6f74fe9e016ba566116e2085b05ecf2988213754` is published: CI run `33494152504` and Pages run `33494152310` succeeded, and the live HTML serves the inspected `index-CKlzWR1L.css` and `index-D30XtHH3.js` assets with HTTP 200 responses. The deployment is an untagged preview; `v0.2.0-alpha.1` remains unchanged.

The focused mobile/current hotfix adds unit coverage for both sweep causes, discovery-safe current geometry, shared direction projection, and compact HUD disclosure/copy. Its gate passes TypeScript, 31 test files / 221 checks, production and nested-path web builds, the scoped public-source secret scan, and packaged desktop/mobile smoke with no renderer warnings or resource failures. Exact commit `f8dc8482cbd10df1352f87a3a28bbee4abcf8de2` is live after CI `33503039473` and Pages `33503039480`; the exact inspected assets return HTTP 200.

The perpetual/manual-pause, interface/manual/report, visible-biome, shared Chart/Relief water palette, and pure cargo-environment/rock-ladder work is published at `29ea8dc60f309ebc43bcf8c1b567cfacf2bf8f95`. Focused coverage exercises perpetual defaults plus legacy-value round trips, bounded/call-order-independent climate derivation, projection and discovery-safe biome/water presentation, touch harbor routing, manual audience/content completeness, report refresh guards, mobile HUD copy, inert calm cargo exposure, bounded material responses, canonical causes, deterministic forces, outcrop stability, and ladder validation. The integrated gate passes 40 test files / 311 checks, nested-path web smoke, runtime-only packaged-ASAR inspection, and desktop/mobile packaged smoke; CI `33508654754` and Pages `33508654540` succeeded. Live ladder/fall traversal, physical dropped-cargo simulation, upgrades, and weather/magic-water effects on cargo, ecology, infrastructure, or settlements remain future architecture.

The verified Alpha `0.3.3-alpha.12` gameplay checkpoint is release commit `4784315a77d815533a9370ece3d7daeb1cc8d5bc`, gameplay contract 20, tutorial 22, outer session 8, and embedded simulation format 4 / `tideweft-sim/6`. CI run `33952159605` and Pages run `33952159606` both succeeded for that exact commit. It publishes only the bounded core-wildlife crossing described above; general habitat assemblages, persistent group ecology, evidence, wider species, and player-absent aftermath remain unimplemented.

Source version `0.3.3-alpha.13` adds the strict five-species catalog, routes production alarm-hearing and scent sensitivity through its matching relative capabilities, and authenticates a 30-criterion per-species release report against build-owned evidence. Species-specific visual acuity remains foundation-only. The build deliberately leaves incomplete capabilities blocked, changes no save schema, and adds no living actor or encounter.

Source version `0.3.3-alpha.14` closes the bounded Wave-A habitat/population/group slice described above and advances the outer session to version 9. It still contains exactly the same five production living-actor types. Worldwide habitat populations, broad species expansion, ecological migration/reproduction, injury/death/carcasses, physical evidence/tracking, general scent fields, circadian life, and release-scale ecological fuzz/performance proof remain future work.

Source version `0.3.3-alpha.15` adds the bounded Settlement Shadows I extension described above and advances the outer session to version 10. The production catalog now covers seven species records, but only domestic cats join the exact actor population; brown rats remain one aggregate population area disclosed through direct physical signs. The slice connects lawful visual pressure from cats, dogs, humans, and gulls, narrow loose-provision scent attraction, rain/terrain pressure, conserved density spacing, cat food competition and rain retreat, bounded rat signs and wet cat pawprints, visible-event-only sound, Chart/Relief ABOUT parity, and exact version-9 adoption. It does not claim worldwide ecology, general tracking or scent, attacks, injury/death/carcasses, hunting, reproduction, circadian life, cat ownership, or exhaustive pair-specific behavior.

Source version `0.3.3-alpha.16` adds the bounded Marsh-edge Pursuit extension described above and advances the outer session to version 11. The production catalog now covers nine species records; habitat version 3 appends persistent marsh-rabbit and marsh-fox populations without rewriting the version-2 prefix. The slice connects rabbit alarm/flee, directly perceived and strictly nonlethal fox pursuit, dog/large-predator interruption, finite disengagement, shared terrain locomotion, direct paired tracks and canid pawprints, visible-event-only thumps/yips with anonymous bottom-right captions, color-independent Chart/Relief forms, knowledge-honest ABOUT, and exact version-10 adoption. The role-and-size trophic resolver deliberately removes the former cat/deer predator-prey classification. It does not claim attacks, injury, death, carcasses, live-prey consumption, complete scent/tracking, foliage consumption, circadian behavior, worldwide populations, the full bestiary, or exhaustive pair-specific behavior.

The Alpha-17 Rain Chorus / Shadow Overhead release appends fish crow, northern harrier, and southern leopard frog through habitat version 4 while preserving the exact version-3 prefix. It uses at most three persistent fish-crow representatives in a stable visible flock, at most one solitary harrier, and one non-addressable 64–72-unit frog area over at most three anchors. Shared capability policies drive aerial movement, authenticated crow perching, bounded diurnal harrier quartering, food investigation, group alarm, mobbing, aggregate quieting/redistribution, and knowledge-safe presentation. A crow can physically take one exact loose provision, and a causally alarmed/mobbing crow can make a harrier abandon a finite nonlethal pursuit. Rain raises frog activity while the same ambient rain masks the anonymous directional chorus through ordinary hearing. Outer-save version 12 adopts the extension once from an authenticated version-11 envelope. The release does not add attack, injury, mortality, carcasses, live-prey consumption, bird ground tracks, complete scent, worldwide ecology, the full bestiary, full circadian behavior, or an exhaustive pair matrix. The broader Wave B biodiversity expansion remains active.

Source version `0.3.3-alpha.18 — One Marsh, Many Eyes` is the bounded starting-harbor Wave-B policy and player-facing parity closure release. Aggregate visual input now carries canonical addressable species into the same role/capability/trophic resolver: representative marsh-fox presence can pressure rat and frog aggregates, while neutral marsh-rabbit co-presence does nothing. Every core-wildlife catalog record explicitly declares every broad target class as supported or an intentional no-response. Selected fish-crow and gull ABOUT views reuse the visible group estimate already exposed by projection, and an unlearned chorus remains species-anonymous while its caption and attenuated pan honor the same uncertain heard-bearing contact. Exact feature commit `673fc373b2b6de81f299f4c176681c969ace6915` passed CI run `34027046007` and Pages run `34027046121`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte. The release does not extend ecology beyond the starting-harbor patch and adds no attack, injury, mortality, carcasses, live-prey consumption, complete scent, worldwide populations, full circadian behavior, full bestiary, or N² interaction claim.

Source version `0.3.3-alpha.19 — The Tide Table` is the first bounded Wave-C tidal release in the same starting-harbor patch, using habitat version 5 and outer save version 13. The version-4 habitat population array is an exact prefix; stable appended tidal anchors store baseline elevation, while a pure target-tick Tide Table projection combines that elevation with the authoritative tide to derive water depth, current activity usability, aggregate intensity, and one egret's depth-safe wading choices. Atlantic silversides and Atlantic marsh fiddler crabs remain non-addressable conserved aggregates; current tide or lawful shared pressure can only redistribute existing units among saved anchors. The snowy egret remains one bounded individual and receives an anonymous aquatic-activity fact only through shared current vision of an occupied, active, usable anchor. Its cognition, shared movement, direct evidence, Chart/Relief presentation, close ABOUT, save migration, signed moving-frame continuity, and performance budget are authenticated without asserting ecological cross-region migration. This is the first bounded Wave-C unit, not Wave-C or broader biodiversity completion, and it adds no capture, fishing, attack, injury, mortality, carcass, live-prey consumption, complete scent, worldwide ecology, full circadian behavior, or exhaustive pair matrix. Exact feature commit `7ef802398f4b5ea6d4e6503d436fc7a858ccbe30` passed CI run `34045602263` and Pages run `34045602240`, and the deployed HTML, icon, manifest, JavaScript, and CSS match the tested committed build byte-for-byte.

Source version `0.3.3-alpha.20 — Between Water and Sky` is the **LIVE_VERIFIED** second bounded starting-harbor Wave-C unit. Habitat version 6 preserves the complete version-5 population and tidal-anchor record as an exact prefix, then may append at most one stable persistent American black duck with two saved dabbling-water destinations and one dry refuge. Its current lawful sensory input is only anonymous aquatic activity obtained through shared terrain-occluded vision. Shared activity selects `air` or `surface-water`; the catalog supplies only air plus shallow- and deep-water movement, the ordinary locomotion solver owns both routes, and no land/walk route exists. Tide and water choose habitat, activity, and travel medium without directly mutating duck stress or condition. Chart, Relief, quick inspection, and ABOUT expose only the same direct knowledge-honest individual.

Outer session version 14 adopts an authenticated sealed version-13 record exactly once while preserving every prior actor, group, aggregate, item, Promise, custody record, evidence record, tidal anchor, and world fact. Internal aggregate schema version 4 places a durable completed tide-edge operation marker outside the bounded event tail, so eviction cannot permit a same-tick redistribution reroll. The slice uses shared capability/data owners and representative invariant, deterministic-scenario, bounded-fuzz, and performance evidence rather than a bespoke species-pair test matrix. It adds no flock, nesting, breeding, migration, cross-region ecology, wake, otter-like predator, capture, consumption, attack, injury, mortality, carcass, worldwide ecology, Wave-C completion, or broader biodiversity completion. Exact feature commit `c11e4de0563876839158fb13a69ddfb4dadd6dbe` passed feature CI run `34061008077`, main CI run `34061513043`, and Pages run `34061512986`; the deployed HTML, icon, manifest, JavaScript, and CSS match the tested local build byte-for-byte. This external post-deployment attestation does not retroactively alter the immutable runtime witness described above.

Source version `0.3.3-alpha.21 — The Living Channel` is the **LIVE_VERIFIED** final bounded starting-harbor Wave-C role slice and appends one bounded
North American river otter role through habitat version 7 while preserving the
entire version-6 population and anchor record as an exact prefix. Fish and crab
support plus usable foraging water and a distinct dry haulout determine honest
presence or absence. Shared amphibious locomotion, current anonymous aquatic
observation, broad nonlethal aggregate pressure, the generic physical-item
claim/custody owner, and deterministic nearest-24 spatial materialization are
the architectural additions; Chart, Relief, ABOUT, touch, and reduced motion
project the same knowledge-honest state. Outer save 15 adopts authenticated
version 14 once. Shared invariants, deterministic properties, conservation,
bounded fuzzing, and representative interactions provide confidence without a
species-by-species or N² test matrix. Live-prey capture or consumption, harmful
attack, injury, mortality, carcasses, fishing, new otter sound or persistent
evidence, reproduction, migration, worldwide ecology, complete Wave C, and
broader biodiversity completion remain absent. Exact feature commit
`5514c24619fc6d41b34cbdd6315f4ae8d936f2dc` passed CI run `34067577935` and
Pages run `34067577893`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested committed build byte-for-byte. This external post-deployment
attestation does not alter the immutable build-owned publication witness.

Source version `0.3.3-alpha.22 — Tidal Convergence` is the **LIVE_VERIFIED**
bounded starting-harbor Wave-C integration release. It adds no species and
introduces a versioned shared
activity-affordance owner with six archetypes/profiles for perch watching, low
quartering, tidal wading, dabbling waterfowl, shore-water foraging, and aerial
surface opportunism. The existing gull becomes the proof that current
anonymous aquatic surface observation is selected by generic actor-address,
surface-opportunity, and tidal-activity capabilities rather than by an aquatic-
forager or species allowlist: terrain-occluded sight can send it by air to
circle the observed area, while the existing habitat allocation supplies its
rest anchor. It receives no water locomotion, aquatic-foraging pressure,
aggregate identity, exact count, or private target. Immediate lawful threat,
alarm, pursuit, and physical-food intents retain priority, and Chart, Relief,
and ABOUT project only the same authenticated current state.

Outer session 15, habitat 7, aggregate schema 4, the seventeen-record catalog,
physical-food custody, aggregate-unit conservation, and the nearest-24
materialization ceiling remain unchanged. The immutable build-owned readiness witness
uses abstraction/property/conservation checks, bounded fuzzing, performance
budgets, and representative scenarios instead of species-by-species or N² pair
coverage, while structurally refusing to self-attest publication or live
deployment. External verification establishes that exact feature commit
`4dacd99e95a018314d65a72183b82cba8583774f` passed CI run `34074045801` and
Pages run `34074045818`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested committed build byte-for-byte. This closes only the bounded
starting-harbor Wave-C integration seam; it does
not complete worldwide Wave C or broader biodiversity work and adds no mortality,
carcasses, harmful attacks, live-prey capture or consumption, fishing, nesting,
reproduction, ecological cross-region migration, full circadian life, or
general scent/sound/evidence system.

Source version `0.3.3-alpha.23 — The Storehouse Door` is **LIVE_VERIFIED**. It
adds no species. One
bounded starting-harbor store owns a stable physical fresh-produce lot through
ordinary settlement cargo custody, separate from the settlement's abstract food
stock. While its door is open, existing wind, rain, distance, and packaging
rules shape scent reaching the existing brown-rat aggregate. That aggregate can
relocate an existing unit through its shared policy; only the matching
authenticated event may commit at most one exact physical produce-unit loss.
The rat population remains conserved. An existing domestic cat's lawfully
visible presence can pressure the aggregate through shared perception policy,
but the cat receives no hidden rat knowledge or investigation behavior.

In Alpha 23's playable path, the actual nearby keeper secures the store only
after the player's in-person report. The kernel separately authenticates direct
keeper observation for later autonomous wiring. Closure persists and contains later scent. Chart,
Relief, inspection, and EVENTS remain knowledge-honest: an event the player did
not directly cause or observe is not reported merely because the store returns
to view. Outer save 16 adopts sealed version 15 exactly once while habitat 7 and
aggregate schema 4 remain unchanged. Shared abstraction checks, a bounded
signed-coordinate property sweep, exact item and aggregate conservation,
deterministic migration/replay, and one representative store-rat-visible-cat
composition provide confidence. Existing shared fuzz and performance gates
remain in regression without expanding into exhaustive species or pair testing.
This is not worldwide settlement ecology, schedules, livestock, broad rumors,
mortality, carcasses, live-prey consumption, the full bestiary, or broader
biodiversity completion. Exact feature commit
`245997219eff02e4edcf75331dc7fd4850432efb` passed CI run `34080936761` and
Pages run `34080936748`; the deployed HTML, icon, manifest, JavaScript, and CSS
match the tested local production build byte-for-byte.

Source version `0.3.3-alpha.24 — The Yard Flock` is **LIVE_VERIFIED**. Habitat
version 8 preserves the exact version-7 tidal-web prefix and
appends one deterministic storehouse-yard anchor, two or three stable chicken
actors, and one stable `CHICKEN-FLOCK`. Settlement ecology version 2 binds that
flock to the existing settlement and keeper through one canonical custody
record; it does not own a second cognition, locomotion, group, or inventory
model. The birds reuse direct observation, attention, broad interaction roles,
terrestrial movement, group alarm, top-K materialization, and knowledge-honest
Chart/Relief/ABOUT projection.

An open store exposes its exact physical produce lot as an identified food
opportunity only to an authenticated custody member. The bird must approach
through ordinary movement and enter the shared Euclidean structural-access
area before a staged one-unit transaction can commit. Secured stock produces no
food belief or claim; replay and interruption cannot duplicate or reconsume the
unit; and an offscreen result remains absent from player narration. Outer save
17 adopts sealed version 16 once while preserving every earlier habitat entry,
actor, group, aggregate unit, store/lot identity, closure, loss record, item,
Promise, evidence record, and world fact. Shared invariants, signed-coordinate
properties, conservation, migration/replay attacks, bounded performance, and
one representative visible-yard event provide evidence without an N² pair
matrix. Exact release commit `4067ac4439bb6f624ed88f69eb09cc591b246741`
passed CI run `34093027893` and Pages run `34093027917`; the deployed HTML,
icon, manifest, JavaScript, and CSS match the tested local production build
byte-for-byte. Immutable build-owned publication fields remain false because
runtime code cannot attest its own later deployment. Calls/tracks, attacks, injury,
mortality, carcasses, live-prey consumption, eggs, nesting, reproduction,
herding, guardian behavior, schedules, autonomous home return, ecological
cross-region migration, worldwide livestock, full Wave D, and broader biodiversity
completion remain absent.

Source version `0.3.3-alpha.25 — The Far Paddock` is **LIVE_VERIFIED** and extends that bounded domestic
substrate without creating a goat-specific simulation. Habitat version 9 keeps
the complete version-8 population, tidal-anchor, and domestic-yard record as an
exact prefix, then uses a fixed-budget deterministic habitat lookup to place a
separate pen and exactly two persistent `domestic-goat` actors. The actors form
one stable `HERD` through the same group owner used by other social wildlife;
their catalog profile supplies terrestrial locomotion, direct-observation
attention, broad interaction roles, alarm propagation, materialization, and
knowledge-honest Chart/Relief/ABOUT presentation.

Settlement ecology version 3 replaces the singular domestic relationship root
with a bounded canonical custody collection and a typed `coop | pen` home
structure. Migration preserves the Alpha-24 relationship ID, home ID, former
coop ID, chicken members, and flock byte-for-byte; only the goat relationship,
pen, and herd are appended. Canonicalization rejects reused actor, group,
relationship, home, or structure authority, so one social group cannot belong
to two homes. The single physical settlement carrier and pending transaction
lane remain authoritative.

`coreWildlifeResourceClaimArbitration` is the shared contention boundary after
source-specific capability, ownership, and contact validation. It orders
contenders for each physical resource by exact contact distance, then current
need pressure, then stable actor and event identity. Input or population
iteration order cannot assign custody. The goat profile deliberately lacks the
food-investigation capability and exposed-food diet, so it cannot inherit the
chickens' store opportunity; living-foliage browse remains a later owner. Outer
save 18 adopts sealed version 17 once, retaining every established actor,
group, aggregate unit, item, Promise, store fact, and world fact before the
additive suffix. Evidence remains abstraction-led: shared invariants,
signed-coordinate properties, migration/replay attacks, conservation, bounded
performance, and representative runtime composition—not per-species or N²
pair coverage. Calls, tracks, attacks, injury, mortality, carcasses,
reproduction, milk, wool, schedules, herding, guardian behavior, cross-region
migration, worldwide livestock, full Wave D, and broader biodiversity completion
are still absent from this release. Exact release commit
`29af7793346c0c3977a5ca727b79feb3a50b83bb` passed CI run `34108539228` and
Pages run `34108539255`; five cache-bypassed live artifacts match the tested
local production build byte-for-byte.

Release `0.3.3-alpha.26 — The Paddock Watch` is **LIVE_VERIFIED** at exact
commit `e3aae174d962ec609b9463e40320227237c9fa1f`. CI run `34143286763` and
Pages run `34143286720` succeeded, and five cache-bypassed live artifacts match
the tested local production build byte-for-byte. It retains the
nineteen-record catalog, habitat version 9, aggregate schema 4, and the prior
core-wildlife materialization ceiling. One separate deterministic dog enters a
bounded `DogActorState` roster, settlement ecology version 4 adds its kennel as
a third custody home, and a generic working-animal root ties that dog, the
existing keeper, both dog and goat custody, the goat herd, and the pen worksite
together. Neither the roster nor assignment can absorb or silently assign the
original independent porter-scene dog.

The assignment stores relationship and accepted activity authority rather than
an actor brain. Ordinary dog cognition, needs, condition, exposure, perception,
and intent arbitrate self-preservation first. Species-neutral external
participants enter the bounded visual-contact index; an anonymous alarm retains
only a cognition-owned uncertain area; shared search probes and locomotion own
investigation, escape, and return. A pending work transition commits or recovers
exactly once. Presentation composes only authenticated current work activity
under the same direct-detail Chart/Relief/ABOUT gate.

Outer save 19 adopts sealed version 18 once, preserving every Alpha-25 habitat,
actor, group, aggregate, item, Promise, store, food, custody, and world fact
before the dog roster, kennel custody, and work root are appended. The
representative rabbit-alarm chain redirects a fox only after the fox actually
perceives the dog. It proves incidental deterrence, not an attack, hidden
guardian radius, or successful-defense guarantee. Attacks, injury, death,
carcasses, herding, a new sound system, companion commands, autonomous kennel
return, worldwide dogs or livestock, ecological cross-region animal migration,
full Wave D, and broader biodiversity completion remain absent. Validation uses
shared invariants and representative runtime/emergence chains rather than a
species-by-species or N² matrix.

Release `0.3.3-alpha.27 — The Watch Returns` is **LIVE_VERIFIED**. It
changes no species, population, habitat, settlement home, custody relationship,
or actor owner. Working-animal root and assignment version 2 add one bounded
task over the existing guardian's committed investigation. The task derives a
deterministic shared-locomotion probe from lawful uncertain evidence; physical
probe arrival produces a completed result, while fresh reciprocal worker and
handler sight may authenticate the keeper's narrow outside-duty recall and a
cancelled result. Either outcome returns the dog through ordinary locomotion to
the exact pen worksite, where current handler sight acknowledges and closes it.

Actor intent and welfare may suspend and resume the task without manufacturing
completion. All seven transition kinds use one exact-once transaction seam;
only one current task, one pending transition, and the latest closed outcome
persist. Outer save 20 adopts sealed version 19 once, preserving every prior
identity, relationship, item, Promise, and world fact. This is no remote command
system, herding, livestock search/rescue, complete schedule, autonomous kennel
life, attack, injury, mortality, carcass, new species, worldwide ecology, or
broader settlement-animal simulation. Evidence remains shared-invariant,
property, replay/migration, bounded-performance, runtime-composition, and
representative-emergence based. Exact gameplay commit
`f2c55413c64a8e6b8e3cc1fab06e50252df2399f` and public attestation commit
`6a5bc4352edb39b47ee2216ca01a1506f01419cb` passed final CI
`34160098140` and Pages `34160098112`; all five cache-bypassed deployed
artifacts match the tested production build exactly.

Release `0.3.3-alpha.28 — The Missing Goat` is **LIVE_VERIFIED** and closes one
bounded starting-harbor Wave-D composition without adding a species or rewriting an
actor. A caused current flee/retreat plus exact separation can split the goat
herd; distance alone cannot. Current identified group sight can propose
regroup, but danger and physiology outrank it. The keeper must lawfully notice
the absence before an explicit last-known-area report recruits the existing
guardian's ordinary search. Search does not authenticate a find. The exact
bodies can physically rejoin, and current caretaker sight of all members in
the pen closes the case; an already-known case can retain an authenticated
coarse reunion transition without fabricating sight.

The release makes each social group an indivisible materialization-cap unit,
so all members enter full detail together or remain coarse with no local
perception or locomotion. It adds a bounded version-1 recovery root and exact
outer-v20-to-v21 adoption, gameplay contract 26, and field manual 38. It adds
no herding, complete schedule or home routine, guaranteed recovery, remote
marker or player search command, attack, injury, mortality, carcass, call,
track, or full cross-region ecology. Verification remains shared-invariant,
property, replay/migration, bounded-performance, and representative-emergence
based rather than per-species or N².

Exact gameplay/release/main commit
`60c9bc34ac871425e5319c8369e715751b5d1c44` passed feature CI
`34174876320`, main CI `34175693435`, and Pages `34175693447`. The release gate
passed TypeScript, public-boundary and player-facing-sync checks, 220 test files
and 2,111 checks, a five-asset 3,284,606-byte served web build, a 10-entry
3,476,214-byte runtime-only Electron ASAR inspection, desktop/mobile/title
smoke, and clean invariant, save, and visual audits. Its first cache-bypassed
five-file live comparison matched the tested production build exactly.

Release `0.3.3-alpha.29 — What Remains` is **LIVE_VERIFIED** and changes no species, habitat,
population allocation, home, custody, or actor construction. The runtime
resolves only current identified marsh-fox pursuit plus exact contact with that
exact marsh rabbit. A named damage event may injure or kill; death retires the
actor once, removes one population unit while any remaining represented units
become abstract reserve, and creates one deterministic physical carcass with a
finite conserved resource. Foxes and fish crows use ordinary current vision,
shared reach, exclusive claim, and exact one-unit consumption; a fox may guard
its body claim. Current direct-detail perception alone authorizes Chart/Relief
body projection and direct-event presentation.

Outer save 22, core-ecology patch 3, aggregate record 5, gameplay contract 27,
and Field Manual 39 persist the transaction through exact version-21 adoption.
The slice adds no player/dog/human/other-animal or group-member mortality,
reproduction, recruitment, population recovery, live-time decomposition, body
drift/drag/harvest, carcass scent, insects, worldwide ecology, or later Wave-E
species. Evidence uses shared invariants, deterministic properties,
conservation, replay/migration attacks, bounded performance, and representative
emergent scenarios rather than per-species or N² tests.

Exact gameplay commit `a0f7b571cf6068c41397ad0b8767347b04b24ac1`
passed feature CI `34187159628`, main CI `34187706800`, and Pages
`34187706784`. The complete release gate passed TypeScript, public-boundary and
player-facing-sync checks, 224 test files and 2,143 checks, a five-asset
3,323,332-byte served web build, a 10-entry 3,514,940-byte runtime-only
Electron ASAR inspection, desktop/mobile/title smoke, and clean invariant,
save, release-surface, and visual audits. Its first cache-bypassed five-file
live comparison matched the tested production build exactly.
