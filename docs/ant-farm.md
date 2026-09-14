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
point and food is hauled to the nearest one. Each colony is capped at 500 ants.

Rival ants hunt and bite main-colony ants; their **Aggression** control sets how
keenly they chase and how often a bite lands. A bite kills instantly. A **hungry**
rival breaks off the hunt to look for food, so rivals must eat and can starve like
any ant.

Ants breed when a mate is nearby. **Overcrowding** — many colony-mates packed close
— makes them a little less inclined to, so a dense clump grows more slowly.

## Food

Drop food by clicking the canvas, or paint it with the **Food** environment tool.
Ants carry loose food back to the nest, where it becomes part of the colony's
**store**. Once delivered, only *another* ant may eat it.

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

### Trails

When an ant finds food and carries it home it lays a **trail** and marks the find
itself, so the spot stays appealing while the trail fades. Nestmates that cross the
trail fall in line and process over to the food, carrying off the rest of the pile
trip by trip until it is gone or the trail dies away.

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
colony's on-screen bar is the **average** mood of its living ants. There are two
bars: the main colony's (top) and the rival colony's (below it).

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

There is no proximity contagion, and there is **no cure**: no meal clears a poisoning
once it takes hold. A poisoned ant decays on every axis — it ages faster, loses
fullness and happiness faster, cannot breed at all — and is drawn in its colony's
amethyst shade. One delivered poison drop feeds 5–10 nestmates, so a single haul can
seed a whole crowd.

## Queens

When a colony's happiness bar climbs high (≥ 75) **and holds there for a sustained
spell** (about eight seconds), a **queen** appears at one of the colony's spawn points
and periodically spawns extra ants; a brief spike no longer summons her on the spot.
She leaves again when the bar drops (< 40).

**Sadist mode** (a Rival Ant control) changes what drives the rival queen: instead of
tracking the rival colony's own mood, she is summoned by the **main** colony's misery
— she arrives when your ants are suffering and withdraws once they recover. Sadist
mode also switches on the extra happiness setbacks described under Happiness.

## Controls

The control panel is a column of **collapsible cards** — click a card's heading to
fold it away; each card remembers whether you left it open.

- **Ant Controls** — add ants, open the spawn-point maintenance view, and set mating
  conditions, lifespan, and speed for the main colony.
- **Rival Ant Controls** — add rival ants; set their lifespan, speed, breeding,
  aggression, and **Sadist mode**.
- **Food** — pick a food type, see what each does, and set the decay rate.
- **Environment Tools** — paint Food, Water, or Walls, or Bulldoze; set brush
  thickness; undo or clear structures. Walls block ants; water slows and repels them.
- **Danger Zone** — kill a colony, kill everything, or destroy the world.
- **Stats** — live counts and each colony's happiness.
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
