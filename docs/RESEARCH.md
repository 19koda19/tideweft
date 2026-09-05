# Research ledger

This file records evidence that changes the design. It is not an attempt to summarize every article about games; it captures the sources and constraints that can be turned into mechanics or verification.

## What makes play rewarding and restorative

### Psychological needs beat a pile of prizes

Ryan, Rigby, and Przybylski's studies associate in-game autonomy, competence, and relatedness with enjoyment and willingness to return. Their later model reports that intuitive control mastery is necessary for reaching those experiences but is not sufficient by itself. Design implication: movement must feel clear, then the world must offer meaningful choice, learnable mastery, and human consequence.

- [The Motivational Pull of Video Games](https://doi.org/10.1007/s11031-006-9051-8)
- [A Motivational Model of Video Game Engagement](https://selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf)

### Restorative games must avoid competence frustration

Tyack, Wyeth, and Johnson found improved competence, affect, and vitality during play after a frustrating task, while in-game need frustration predicted worse post-play affect. Follow-up work found that small decisions and autonomy can contribute to restoration, while competence frustration remains particularly harmful. Design implication: use graded outcomes, recovery routes, clear feedback, and player-selected pressure rather than surprise punishment or erased progress.

- [Restorative Play: Videogames Improve Player Wellbeing After a Need-Frustrating Event](https://doi.org/10.1145/3313831.3376332)
- [“The Small Decisions Are What Makes it Interesting”](https://doi.org/10.1145/3474709)

### Feedback should reveal causality, not replace the activity

Research on “juicy” game feedback points toward legible action–outcome bindings and graded success as important preconditions for competence-supporting moment-to-moment play. Self-determination research also distinguishes informational competence feedback from controlling rewards. Design implication: particles, sound, route illumination, and settlement reactions should explain what the player caused; rewards should unlock expressive decisions rather than command repetition.

- [How Does Juicy Game Feedback Motivate?](https://people.csail.mit.edu/dkao/pdf/3613904.3642656.pdf)
- [Self-Determination Theory and the Facilitation of Intrinsic Motivation](https://selfdeterminationtheory.org/SDT/documents/1991_DeciVallerandPelletierRyan_EP.pdf)

### Challenge should be legible and multidimensional

Studies of game flow support skill–challenge balance, but the evidence is more nuanced than “harder is better.” TIDEWEFT now has one official world ruleset—**A CHALLENGING HARD**—rather than selectable pressure modes or hidden adjustment. Player agency comes from preparation, route choice, recovery, and accessibility settings for input and presentation; those settings never change rewards, hazard probabilities, enemies, loot, or world rules.

- [Skill–challenge balance, expertise, flow, and urge to continue](https://pmc.ncbi.nlm.nih.gov/articles/PMC8943660/)

### Perpetual play needs a voluntary stopping ritual, not a forced session arc

Post-work play research identifies detachment, relaxation, mastery, and control as useful experiences; a diary study links evening-game mastery with next-morning vigor. Research on disengaging from games also reports that players value retained progress, closure, and agency over when they leave. Earlier prototypes exposed Drift, Weave, and Wander session shapes, but that direction is superseded: the live design is one perpetual world and one ruleset. **Quiet Hour** is the voluntary save-and-recap ritual; it stops local simulation without advancing time offline, imposing a timer, or declaring a quota.

- [Digital Games as a Context for Recovery from Work Strain](https://orca.cardiff.ac.uk/id/eprint/131795/)
- [Evening Gaming, Recovery, and Next-Morning Vigor](https://doi.org/10.1111/apps.12519)
- [Disengagement From Games](https://arxiv.org/abs/2406.00189)

Large-scale telemetry research has found little evidence that hours played alone cause changes in well-being; player motivation and the fit between play and life matter more. Design implication: success is a satisfying chosen session, not maximum session duration.

- [Oxford Internet Institute — play time and well-being](https://www.oii.ox.ac.uk/major-new-study-finds-little-evidence-for-causal-connection-between-well-being-and-video-game-playing/)

## Initial synthesis: the honest reward stack

| Horizon | Objective | Interesting action | Reward that changes play |
| --- | --- | --- | --- |
| 1–10 seconds | Read terrain and keep momentum | steer, scan, brace, choose a line | responsive motion, stable cargo, revealed information |
| 1–5 minutes | Reach a landmark or solve a local hazard | reroute, rest, build, share supplies | safer trace, discovery, cache, named rescue |
| 10–25 minutes | Complete a promise | choose cargo and route, adapt to weather | visible project progress, trust, route strand, new option |
| 1–3 sessions | Stabilize a corridor | sequence complementary deliveries and infrastructure | autonomous porter traffic, settlement specialization, mutual aid |
| campaign | Weave a resilient archipelago | shape network topology and relationships | communities solve problems without the player; unique chronicle |

The stack intentionally excludes paid/randomized rewards, daily streaks, expiring chores, offline decay, and empty numerical inflation.

## Technical research

### One renderer, two launch targets

The current official guidance supports a browser-first architecture. p5.js 2.x can be installed as an npm module and instantiated on a specific mount element. Vite can emit relative asset paths with `base: './'`, allowing the same artifact to work below a GitHub repository subpath and under a standard Electron custom scheme. Browser and desktop must therefore share the exact renderer; Node/Electron imports are prohibited from game and simulation code.

- [p5.js releases](https://github.com/processing/p5.js/releases)
- [p5 constructor / instance mode](https://p5js.org/reference/p5/p5/)
- [Vite public base path](https://vite.dev/guide/build#public-base-path)
- [Vite static deployment to GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)

### Electron is a privilege boundary

Electron recommends context isolation, process sandboxing, no renderer Node integration, restrictive content policy, current framework versions, bounded navigation/window creation, and narrow validated IPC. It also recommends a custom protocol over `file://`. TIDEWEFT initially exposes no preload API: its local game bundle runs with ordinary browser capabilities, and its save data lives in web storage under a standard secure `app://` scheme.

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron process sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol/)
- [Electron packaging guidance](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)

### Deployment is build-gated

GitHub Pages is a static host. A Pages workflow must build before upload and needs explicit Pages/id-token permissions. Cloud saves or real asynchronous multiplayer would require a separate future backend; personal traces and seed-based share URLs remain honest static-site features.

- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

### Version resolution note

The initial exact stack is p5.js 2.3.2, Electron 44.1.0, Vite 8.2.2, TypeScript 7.0.2, Vitest 4.1.11, and Electron Forge 7.11.2. Research initially found Vitest 4.1.10, but npm's current optional-peer graph failed under npm 10 while 4.1.11 resolved cleanly. Forge 7.11.2 declares the 1.x Electron fuses API, so the project pins compatible `@electron/fuses` 1.8.0 rather than forcing the current 2.x API through a peer conflict.

## Simulation-design findings

### Mixed-resolution ecology must preserve absence, identity, and causal limits

The Alpha 14 Wave-A implementation establishes a bounded scaling pattern for later biodiversity work. Habitat capacity, aggregate population units, pressure, and trend are authoritative facts separate from the small number of exact actors used to represent them nearby. A valid habitat can support no local member of a species; quiet ecology must not be treated as a generation failure. Deer and gull representatives retain stable herd/flock state across full and coarse simulation, while unloaded individuals age physiology and already-committed intent without inventing perception, movement, food claims, or harm. Bounded player-absent group displacement can occur only from persisted habitat pressure and validated anchors, remains nonlethal and cargo-neutral, and does not become player knowledge automatically.

Design implication: future worldwide populations should expand this aggregate/representative boundary rather than multiplying full actors. Broader species, reproduction, ecological migration, carcasses, circadian behavior, scent fields, and physical evidence still require their own authoritative owners and performance proof; the local experiment does not stand in for them.

- Dwarf Fortress demonstrates that legible remembered events, relationships, loyalties, and consequences across sites can create depth without those details being the player's direct job. [Bay 12 development roadmap](https://bay12games.com/dwarves/dev.html)
- Factorio's transport design shows why constrained logistics and topology create problems worth solving, and why automating a genuinely solved route prevents the core loop becoming chores. [Factorio Friday Facts 224](https://www.factorio.com/blog/post/fff-224)
- The strand idea is strongest when assistance is embedded in ordinary terrain use. The official Death Stranding guide frames this as a gentle connection through infrastructure left for others. TIDEWEFT applies the principle to simulated communities and the player's own previous traces, without pretending NPC contributions are real people. [Kojima Productions beginner's guide](https://www.kojimaproductions.jp/index.php/en/death-stranding-directors-cut-beginners-guide)
- Weak ties can bridge otherwise separated groups. In game terms, a small connection between culturally or economically different settlements may create more new knowledge and resilience than repeatedly maximizing one hub. [Stanford — The Strength of Weak Ties](https://inequality.stanford.edu/publications/media/details/strength-weak-ties-0)

The resulting design treats network topology as the authored fortress: hubs provide efficiency, loops provide resilience, and every specialization creates a dependency that the player can understand and reshape.
