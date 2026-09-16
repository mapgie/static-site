# Ant Farm

A two-colony ant simulation. You seed colonies, drop food, shape the terrain, and
watch two populations forage, breed, fight, and rise or fall on their own moods.
Everything runs client-side in `ant-farm.html` / `ant-farm.css` and the `js/ant-*.js`
modules (constants, state, utils, entities, ui, simulation, render, storage), and the
world autosaves to `localStorage`.

## Colonies

| | Healthy | Poisoned | Nest ring |
|---|---|---|---|
| **Main colony** (your ants) | pale yellow `#fff0b3` | amethyst slate `#7d6f9e` | pale yellow |
| **Rival colony** (the antagonist) | muted jade `#3cb399` | amethyst light `#9f95b5` | jade |

Each colony has one or more **spawn points** (nests). New ants appear at a spawn
point and food is hauled to the nearest one. Each colony is capped at 500 ants. A
fresh farm starts with two default nests — the main colony near the top of the
board and the rival colony near the bottom.

Rival ants hunt and bite main-colony ants; their **Aggression** control sets how
keenly they chase and how often a bite lands. A bite kills instantly. A **hungry**
rival breaks off the hunt to look for food, so rivals must eat and can starve like
any ant. Rivals are also **thieves**: when they aren't hunting they roam for food to
carry back to their own pantry, and a rival that gets inside the main colony's pantry
will **steal from the store** (or eat it if hungry). In World Building Mode the rival
colony builds its own, smaller nest to stash the loot.

**Until a colony has a queen**, its workers do the breeding. Ants breed only when
**both** partners are *in the mood* — each has its own hidden happiness threshold (its
"horniness", jittered per ant), so they don't all become ready at once — they
**encounter** each other nearby, and a probability roll passes. The young start below
that threshold, so they must mature and cheer up before they can breed. Both parents
then rest before mating again, and **overcrowding** trims the odds, so a colony grows
in a paced trickle rather than exploding in waves. Once a **queen** takes over (see
Queens), the workers stop and she lays the eggs instead. A live
readout over the map shows each colony's count and how many were **born** (any
in-colony reproduction — worker mating or queen eggs) versus **spawned** (only ants
you add yourself with the Add-Ant button).

## Food

Drop food by clicking the canvas, or paint it with the **Food** environment tool.
Ants carry loose food back to the nest, where it becomes part of that colony's
**store**. Once delivered, an ant normally eats only from its *own* colony's
stockpile, so one colony's reserves don't prop up the other's mood. The exception is
a **raid**: a rival that gets physically *inside* the enemy pantry — standing right
on the stored food — can eat it. Ants never home in on an enemy store from across
the map or reach it through walls; a raider has to breach and be there.

| Food | Colour | Drops (trips to haul) | Feeds | Effect on the eater |
|---|---|---|---|---|
| Sugar | `#f5f5f5` | 3 | 1 each | Least filling. +15% lifespan. |
| Fruit | `#ff8c00` | 5 | 1 each | More filling. +20% lifespan. Cures a slow. Ripens, then rots into Spoiled. |
| Protein | `#ef9a9a` | 1 (heavy) | 2 | Most filling. +25% lifespan. Cures a slow and adds a burst of speed and mating drive. Slower to carry home. |
| Dead Insect | `#8d6e63` | team of 3 hauls | 10–15 | A carcass is ~80% sugar / 20% protein: each mouthful lands as one or the other. Takes a team of three to move at all. |
| Spoiled | `#3d5afe` | 1 | 1 | Slows the eater and shaves a little lifespan. Rots further into Poison. |
| Poison | `#b040ff` | 1 | 5–10 | Poisons everyone who eats from the drop (see below). |

**Drops and trips.** A dropped piece is a small pile that takes several **trips** to
haul home: an ant lifts one unit and the rest waits for the next carrier, so a
sugar pile needs three trips and a fruit pile five. Protein is a single heavy drop —
one trip — but a delivered protein feeds *two* nestmates. A number on a loose pile
shows how many trips it has left.

Once a colony has built a **pantry**, foragers carry food **to the pantry**. Because a
sealed nest's pantry doorway faces inward, a carrier first heads for the **entry**
(the one outward-facing door), threads in, and its load is stored in the pantry,
packed against what's already there. A carrier that can't find its way in after a
long spell logs its load to the pantry anyway rather than circling forever. Until a
pantry exists, food piles at the nest as before. (An ant that dies mid-haul drops its
load where it falls.)

A **carcass** works the same way: once enough haulers gather, the team drags it to the
nest entrance and it's stored; if the team jams against a wall for too long it lets
go, leaving the carcass to be found again instead of grinding in place.

**Painting.** A dragged brush scatters spaced drops, not a solid line, and each food
has its own spacing: sugar sits closest, fruit wider, protein wider still, and a dead
insect drops only **once per press**. **Brush thickness** also sets each drop's
*size* — a fatter brush drops fatter food.

**Eating extends lifespan**, not just staving off starvation: each meal adds the
percentage above, up to a ceiling of **twice** the ant's base lifespan. The **Food
Decay Rate** slider controls how fast fruit ripens and spoiled food turns to poison.

### Auto food (the living world)

By default the world feeds itself: food rains at random over time, weighted by
rarity — **sugar** often, **fruit** less so, **protein** seldom, and a **dead
insect** as a rare treat (poison and spoiled never fall on their own). Turn it off
with the **Auto food drops** checkbox in the Food panel to hand-feed the colony
yourself.

### Trails, scent, and wandering

Ants forage by **smell, not sight**. Food only pulls an ant when it is very close —
as if each morsel carried a faint scent of its own — and at that range the scent
**trumps** everything. Farther off, a **pheromone trail** wins, so nestmates fall in
line and process over to a find, carrying off the pile trip by trip; with neither
scent nor trail nearby, an ant simply **wanders** — a small random turn each tick, a
drunkard's walk with no goal — until it stumbles onto one. When an ant does find food
and carry it home it lays a trail and marks the spot, keeping it appealing while the
trail fades. (Food within reach is always grabbed.)

Ants also **keep out of each other's way**: a soft separation nudge pushes any two
that get too close apart each tick, so they don't stack up or walk over one another.
The nudge never shoves an ant into a wall, and it leaves parked haulers and ants
mid-dig where they are.

### Pheromones and reactions

There is no event system or messaging: ants coordinate entirely through the shared
**pheromone field** (stigmergy). Every reaction is a scent one ant drops and another
reads back when it passes near. Marks are **typed**:

- **Trail** (yellow) — laid on a food find, as above.
- **Danger** (red) — laid where a colony-mate is **killed by a rival**. It carries
  farther than a food trail.

A main-colony ant that catches a danger scent **reacts before it thinks about food**.
What it does depends on its mood, the colony's size, and whether the nest itself is
threatened:

- **Flee** (the default) — turn and run from the scent, with a jolt of speed.
- **Swarm** — if the danger is laid at the colony's own **nest or queen**, *and* the
  colony is large enough to have crowned a queen (the same `QUEEN_MIN_ANTS`
  threshold) with decent morale, the ants instead **rally home** to defend it rather
  than scattering.

Standing and fighting off an attacker, and walling off a breached entry, are the next
phase (they wait on ant-vs-ant combat and the World Building construction work); for
now *swarm* pulls defenders back to the nest. Rival ants are the aggressors and never
react to danger.

### Stockpiling

The first piece delivered to a nest sets an anchor, and later pieces **pack adjacent
to it**, so a colony's store grows as a tidy pile rather than a scattered ring.

## Hunger and food stores

Each ant has a **fullness** stat, separate from its mood, that drains over time into
hunger. An ant only eats from the store when its fullness drops **below** its own
(jittered) hunger point; while it is well-fed it keeps foraging and leaves the store
alone. Because every ant's threshold is different, a content colony doesn't swarm
returned food all at once — it builds up reserves instead. Eating refills fullness
(and, as noted above, extends lifespan).

**Newborn grace.** For its **first minute** of life, an ant's fullness and happiness
don't drain on their own — only outside harm (poison, an attack) still bites. New
ants get a chance to find their feet instead of being born straight into hunger, and
a wave of newborns doesn't immediately starve.

## Happiness

Every ant carries its **own** happiness, seeded with a jittered starting value and a
hidden *temperament* that makes each ant swing more or less than its neighbours. Each
colony's on-screen bar is the average mood of its living ants **scaled by colony
size**: a lone ant tops out near 50%, the bar can reach 100% only once the colony
approaches its **ideal size** (`POP_CAPACITY`, default 100), and past that point
**overpopulation** eases it back down. So the bar reflects both how content the ants
are and whether the colony is a healthy size — two happy ants read as ~50%, not full.
(The Breakdown panel still shows the raw average mood, so you can see individual
contentment separately.) There are two bars: the main colony's (top) and the rival
colony's (below it).

Happiness **rises** from:

- eating (a bigger lift for protein, fruit, or insect)
- being well-fed (fullness high)
- mating (both parents)
- delivering food to the nest (colony-building)
- **main colony:** a slow background lift the longer the colony goes unattacked
- **rival colony:** a boost for each ant it kills, in place of the survival lift

Happiness **falls** from:

- a constant background decay
- a nearby colony-mate being killed (nearby witnesses take it hardest)
- becoming poisoned (an immediate hit) and staying poisoned (slow ongoing decay)

Rival happiness gains are deliberately **smaller** than the main colony's.

**Sadist mode** piles on extra setbacks that don't apply in normal play: a colony
takes a morale hit when its queen departs, and ants lose happiness while they're wet
(in water) or slowed. These compounding miseries are reserved for the sadist.

## Poison

Poison spreads **only by eating**:

- an ant that eats Poison food becomes poisoned (it no longer dies on the spot), or
- a rival ant that bites an already-poisoned ant catches it.

Poison never appears from the ordinary living world: auto-dropped food can ripen and
spoil, but spoiled food only rots on into poison under **Sadist mode**. And in Sadist
mode, once the main colony is thriving — a sustained queen at high spirits — the
sadist will **rarely seed a poison drop** to spoil the good times. (You can always
drop poison yourself with the Food picker.)

There is no proximity contagion, and there is **no cure**: no meal clears a poisoning
once it takes hold. A poisoned ant decays on every axis — it ages faster, loses
fullness and happiness faster, cannot breed at all — and is drawn in its colony's
amethyst shade. One delivered poison drop feeds 5–10 nestmates, so a single haul can
seed a whole crowd.

## Queens

When a colony's happiness bar climbs high (≥ 75) **and holds there for a sustained
spell** (about eight seconds), a **queen** appears at one of the colony's spawn points;
a brief spike no longer summons her on the spot. She leaves again when the bar drops
(< 40).

**The queen is the colony's egg-layer.** While there's no queen, the **workers**
breed to keep the colony going (mating as above). The moment a queen arrives the
workers **stop breeding** and she takes over: she periodically lays **eggs** — in the
nursery if one is built, otherwise beside her — which hatch into new ants. (In the
classic sandbox, with no nest, she spawns the ant directly.) Queen-laid ants count as
**born**, the same as worker-bred ants; only ants you add by hand count as **spawned**.

**Sadist mode** (a Rival Ant control) changes what drives the rival queen: instead of
tracking the rival colony's own mood, she is summoned by the **main** colony's misery
— she arrives when your ants are suffering and withdraws once they recover. Sadist
mode also switches on the extra happiness setbacks described under Happiness.

## World Building (in progress)

**World Building Mode** (a control card; on by default for now) unlocks a nesting
layer on top of the classic sandbox.

**Digging.** Ants raise **soil** — a slow in-situ action (a few ticks per block)
that turns a spot into a brown block. Soil blocks movement like a wall, but only
soil the colony builds is recognised as a room wall (painted walls can extend
structures ad hoc). Soil can be mined anywhere. **Auto food never lands on soil,
walls, water, or a queen.**

**Auto-built sealed nest.** Once the colony is a handful of ants strong, it digs a
**sealed nest**: a connected tree of rooms, grown from the spawn, where the only
opening to the outside is the **entry**. Rooms are joined by walled **corridors**
with a genuine walkable channel, and each room's ring has a real **doorway gap**
sized to that channel. Ants **can't cross walls or water** — they navigate by
**following walls** to the gaps — so they come and go only through the entry.

**Nursery at the heart.** The **nursery** is planted right on the colony's spawn
point and anchors the nest; the **throne** and an **empty room** (a hub) branch off
it, and the entry and pantry hang off that hub. Empty rooms are the universal
connector nodes that route pathways. The connection rules: an **empty** room joins
anything; an **entry** joins only an empty room; a **pantry** joins another pantry or
an empty room; a **nursery** joins a throne, an empty room, or another nursery; a
**throne** joins a nursery or an empty room. Every room is reachable without crossing
another. Rooms are marked by a **symbol** rather than a word — 🍎 pantry, 🥚 nursery,
👑 throne — while the entry and empty rooms carry no label. Walls are thin soil lines;
a digging ant sits right at its block and jiggles as it works; the number that dig at
once **scales with colony size** (up to ~60%, at least a handful) so a big colony
puts real hands on the nest while the rest keep foraging. Room caps: **1 throne, 3
nurseries, any number of pantries or empty rooms**.

**Burrowing out.** An ant sealed inside a room that can't find a way past the walls
will, after a spell of getting nowhere, **dig a single hole** to escape — a fresh
opening in the wall.

**Nursery-gated growth.** Past a threshold (default **10** ants, tunable under
*Nursery needed > ants*), a colony **can't breed without a built nursery** — an
on-canvas nudge says so when growth stalls. **Tap the nudge to dismiss it** and it
stays quiet for a spell. Below the threshold the colony breeds as usual.

**Eggs.** With a built nursery, a mating lays an **egg** in the nursery instead of a
birth on the spot; the egg hatches into a new ant after a spell.

**Threat response.** If a rival reaches a built room's doorway, the colony treats it
as a **breach** and walls the doorway shut (a barricade, dug at top priority). The
breached room is outlined in red until it's sealed.

**Placing rooms by hand.** The World Building card has **+ Entrance**, **+ Food
store** and **+ Empty room** buttons. Each lets you **drag the new room where you
want it**: it shows red (`overlaps` / `no link`) if it clashes with another room or
has nothing there it's allowed to connect to, per the rules above. **Place here**
commits it and the ants dig it next, wiring a corridor to the nearest room it may
connect to. Empty rooms connect to anything, so they're how you route new pathways.
Once built, a room can't be moved. (Caps still apply.)

**Diggers walk the walls.** An ant builds by walking onto the next wall block,
working it, and laying the soil where it stands — so the wall rises **behind the ant
as it moves along the line**, rather than appearing all at once.

Turning the mode **off** returns the classic sandbox (no rooms, no nursery gate).
Both modes are covered by the test suite (`npm test`).

## Controls

The control panel is a column of **collapsible cards** — click a card's heading to
fold it away; each card remembers whether you left it open.

An **eye toggle** in the top-right corner of the map folds the on-canvas overlay
(the happiness bars and the population readout) away for a clean view, and back;
your choice is remembered.

- **Ant Controls** — add ants, open the spawn-point maintenance view, and set mating
  conditions, lifespan, and speed for the main colony.

  In the **spawn-point maintenance view** the game pauses so you can arrange nests:
  drag a point to move it, click to select, then resize or delete it. **Add Ant
  Point** / **Add Rival Ant Point** drop a new nest, **Randomise Points** scatters a
  fresh random layout (varied counts, sizes and spots) for both colonies, and
  **Delete All Points** clears them (an empty colony falls back to the board
  centre). The same tools are available on the map itself: the target button in the
  canvas corner opens a floating strip of these controls, so points can be edited
  without opening the side menu.
- **Rival Ant Controls** — add rival ants; set their lifespan, speed, breeding,
  aggression, and **Sadist mode**.
- **Food** — pick a food type, see what each does, and set the decay rate.
- **Environment Tools** — paint Food, Water, a grey **Wall** or a brown **Soil wall**,
  or **Bulldoze**; set brush thickness; undo or clear structures. **Walls, soil and
  water all block ants** — an ant that meets one **follows along it** (tracing round an
  obstacle, hugging a wall until it finds a doorway or a scent pulls it off) rather
  than crossing it, and it never crosses water. The **Bulldozer** clears terrain and
  loose food, and it also **breaches nest walls**: knocking out a room's wall reopens
  that stretch, so the colony re-digs it (a hole ants pour through until it's sealed
  again).
- **Danger Zone** — kill a colony, kill everything, or destroy the world.
- **Stats** — live counts and each colony's happiness. Deaths are split into
  **killed** (by a rival) and **died** (hunger, age, or poison), for each colony.
- **Breakdown** — per-colony figures for spotting imbalance: average mood and
  fullness, how many ants are hungry, poisoned, or hauling, each colony's stored
  food, and how long the main colony has gone unattacked.
- **Tuning** — live sliders for the balance numbers (happiness gains and losses,
  fullness, breeding, queen thresholds, and more). Changes apply instantly and are
  saved; **Reset tuning** restores the defaults. Values marked `*` only affect
  newly born ants. Starts folded.
- **Configurations** — save, load, export and compare named setups (see below).

## Configurations

Save a setup to revisit or compare it later. Two kinds:

- **Configuration** — the reproducible parameters: every slider and tuning value,
  plus the colony spawn points. Loading one re-applies those settings and spawn
  points without disturbing the ants and food already on the board — so you can
  re-run the same experiment.
- **Full world** — a complete snapshot: the settings and spawn points *and* the
  current ants, food, and terrain. Loading one restores that exact world.

Each saved entry can be:

- **Loaded** — applied to the running simulation.
- **Exported** — downloaded as a `.antconfig.json` file, and **Imported** back on
  any device (or shared with someone else).
- **Compared** — tick two or more, then **Compare selected** opens a side-by-side
  table of their settings, tuning values, and spawn-point counts (and, for full
  worlds, saved population figures), with the rows that differ highlighted.

Saved configurations persist in the browser separately from the live world, which
(ants, food, terrain, spawn points, and settings) is still autosaved on its own.
