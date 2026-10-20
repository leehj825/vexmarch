# Vexmarch — Design Document

App ID: `com.vexmarch.game` · Repo: `leehj825/vexmarch`
Status: design draft, no implementation yet.

A real-time grand strategy game on a 30-node fictional map. Plain (non-module) JavaScript, Canvas 2D for the strategy map, Three.js r128 for the optional city view, no build step, Capacitor for Android. Desktop first, touch supported from the start.

## 1. Pillars

1. **Real time with active pause.** Time flows continuously; the player can pause and still issue orders.
2. **Delegate, don't micromanage.** Officers run cities and armies from standing orders; the player steers.
3. **One simulation, several views.** The sim owns all truth. Map, city and walk-around views only render it.
4. **Logistics paces the game.** Armies are tied to food; deep invasions need forward bases.
5. **Cute and small.** A compact, readable, low-poly look in the colour style of Deepward. Everything built in code, no asset files.

## 2. Architecture

```
sim/        pure logic, no DOM, no Three.js, runs in Node
  state.js    the single serialisable state object
  tick.js     fixed-timestep step(dt)
  economy.js  gold, food, population
  cities.js   buildings, specialties, growth
  armies.js   movement, supply, combat
  officers.js stats, traits, loyalty, orders
  ai.js       rule-based planner issuing the same commands as the player
  commands.js the only way to change state from outside
data/       config.js (all balance numbers), map.js, officers.js, names
view2d/     canvas map renderer, input, HUD
view3d/     city scene, walk mode (later)
audio.js    synthesised WebAudio music + sfx
ads.js      AdMob banner (ported from Nightfall)
tools/      balance + AI-vs-AI harness (Node)
```

Rules:
- `sim/` never imports from `view*`. A save is `JSON.stringify(state)`.
- Views send **commands** and read **state**. Orders and AI use the same command set.
- Fixed timestep (e.g. 1 in-game day = 2 real seconds at 1x). Speeds: pause, 1x, 2x, 4x.
- Seeded RNG in the sim, so runs are reproducible and testable.
- Scripts are plain (non-module) so the game also opens from `file://`, as in Nightfall and Deepward.

## 3. World

- **30 nodes** connected by roads (a planar graph, 2 to 5 links per node). A node is a city, fortress/pass, or port.
- **4 to 6 factions**: the player plus 3 to 5 AI, plus neutral/rebel nodes at the start.
- Borders are derived from node ownership (Voronoi-style regions around nodes), not painted by hand.
- **Contested**: an enemy army in a node's zone with no friendly army present halts that node's income until repelled.
- **Chokepoints**: pass nodes with strong defence that block the road between regions.
- **Specialties** (one per node, gives the map identity and something to fight over):

| Specialty | Effect (tunable in `config.js`) |
| --- | --- |
| Farmland | Food production up |
| Market town | Gold income up |
| Mountain pass | Defence bonus, blocks paths, low growth |
| Port | Gold up, extra route links by sea |
| Iron hills | Cheaper, stronger troops recruited here |
| Horse plains | Cavalry recruited here are better |
| Holy site | Loyalty and growth up |
| Capital | Larger population cap, officers gather |

## 4. Economy: gold and food only

Only two resources are shown to the player. Building materials are bought from gold behind the scenes: a build costs gold and the player never sees wood or stone.

- **Gold**: income per node from population (tax) and buildings, minus army upkeep and officer salaries.
- **Food**: produced by farms and farmland, eaten by population and armies. Shortage causes unrest, then starvation, and starving armies lose morale.
- Income arrives continuously each tick, not on a monthly turn.

### Population and growth

Population is the engine of a city: it is tax base and recruit pool. Population grows or shrinks every day toward a **target level** set by how well the city is ruled.

```
target  = cap(city size, specialty, farms, buildings) * prosperity
growth  = (target - pop) * rate     (shrinks if target < pop)
```

**Prosperity (0 to 1.2)** is built from:
- **Food security**: surplus raises it; shortage drops it fast.
- **Security**: no enemy in the zone, a garrison present, no recent siege.
- **Tax rate**: a per-city slider (Low / Normal / High). High gives more gold now, lowers prosperity and loyalty over time.
- **Governor skill**: the assigned officer's Politics stat.
- **Buildings**: markets, farms, temples, walls add to prosperity or cap.
- **Devastation**: a debuff after a siege or raid that fades over days.
- **Specialty**: farmland and holy sites help; mountain passes hurt.

Houses are decorative only: they appear in the 3D city to match population but never limit it.

### Recruiting

Troops are bought with **gold**, drawn from **population** in that city. Recruiting reduces population, so over-recruiting stalls growth and the economy. A city also keeps a minimum population before it allows recruits.

## 5. Armies, combat, logistics

- An army = officer + troop counts by type. It marches along roads on the live map.
- **Troop types** (rock-paper-scissors): Infantry, Spearmen/Pikes, Cavalry, Archers. **Siege** is a separate class that matters only against walled nodes.
- **Combat** is seamless on the map. Armies in contact lose strength per second from troops x officer stat x terrain x morale x type matchup. Officer abilities are cooldown bursts the player can trigger. Nearby friendly armies can join. A front-width cap stops infinite stacking.
- **Supply**: an army traces a supply line along the road graph to its home city or a depot. In friendly territory it eats a base amount of food; in enemy territory the drain is much higher. A fast unit standing on any node of the line cuts it, giving a "Cut Off" morale penalty.
- **Depots/forward bases**: stock food at a node to push deeper.
- **Sieges**: walls and gate have health. Siege units damage walls; defenders can sortie.

## 6. Officers

- ~20 to 30 in the world; a faction starts with 4 to 6.
- Stats: Command, Might, Politics, Intellect, plus a **trait** (Rash, Cautious, Loyal, Greedy...) that biases autonomous behaviour.
- **Roles**: city governor (builds and manages automatically from stats), army commander (carries abilities), or idle.
- **Standing orders** for armies and cities: Defend, Raid, Escort, Hold, Develop. This is how the player delegates.
- **Acquiring officers**: wandering officers appear in nodes and can be recruited; others can be found by sending an officer to search a city; captured enemy officers can be recruited or released.
- **Loyalty**: a number that drops with low pay, losses and neglect; at low loyalty an officer may defect or rebel.
- **Alerts**: a prioritised event feed. Only urgent events (city attacked, supply cut, officer defecting) may auto-pause.

## 7. Factions, victory, defeat

- **Win**: take all nodes (conquest).
- **Lose**: lose all your nodes. No grace period. The player can start a new game at any time; failed runs are cheap.
- AI factions are eliminated when they hold no nodes.

## 8. AI

- Rule-based planner that uses the same commands as the player. No resource cheating; difficulty changes aggression and reaction time only.
- Evaluates targets by (value, defence, distance, supply), keeps a reserve at home, and responds to threats.
- AI-vs-AI games run headless in Node to tune balance and catch stalls.

## 9. Views

### 9.1 Strategy map (Phase 1)
Canvas 2D, pan and zoom, parchment style. Nodes, borders, roads, army banners, supply lines (dotted, red when cut). Side panels for node, army and officer. Speed controls at the top.

### 9.2 City view (later)
Entering a node transitions to a small 3D scene (iris/fade first, continuous zoom if worthwhile). The scene is **generated from state**: buildings by slot, wall level, fields, decorative houses scaled to population, damage after sieges. Fixed slot layouts per city size; no free-placement building.

### 9.3 Armies in 3D (later)
Armies are formations of instanced low-poly soldiers (about 1 visible soldier per 10 troops) plus siege gear. During a siege they animate toward the walls. The visual is cosmetic; the sim decides the outcome whether or not it is watched.

### 9.4 Walk mode (optional extra, much later)
Third-person hero walking a city, like Nightfall and Deepward. **The strategy clock is paused while walking.** It has no effect on the sim: it is an optional way to look around and talk to people. **Joining wars is out of scope for now**; the hero will be a separate system that can attach to the sim later.

## 10. Look, sound, UI

- **Style**: a cuter, smaller version of Deepward. Same dark ink background (`#07060a`), warm cream text (`#eee6d6`), gold accents (`#f2d27a` to `#c9963a`), red and green bars as in Deepward's HUD. Low-poly, code-built models, soft outlines.
- **Audio**: synthesised WebAudio music and sfx, as in the other games. Calm map theme, tension layer in wars.
- **Tutorial**: a short guided first scenario (small starting region), tips overlays like Deepward's tutorial, replayable from settings.
- **Localisation**: `i18n.js` pattern from Deepward, English first, Korean second.
- **Saves**: localStorage auto-save, Continue / New Game on the title screen, versioned save format.
- **Touch**: tap to select, drag to pan, pinch to zoom, long-press for context. Large hit areas.

## 11. Ads (Android)

- Port Nightfall's `ads.js` (AdMob via `@capacitor-community/admob`). Test banner unless a real-mode flag is set.
- Banner: standard `BANNER` size (320x50), `TOP_CENTER`. It is a centred strip, so it does **not** take the full top width.
- Layout: the HUD keeps its resource and speed bars at the left and right of the banner, or sits just beneath it. When the banner is live, add a body class (like Nightfall's `adLive`) that shifts the HUD down by the banner height. Hidden on the title screen.
- The web build shows a placeholder strip of the same size so layout is the same.

## 12. Language-model use

None is required, and the game must fully work without one. Optional, last-phase flavour only: officer messages rewritten from structured sim events (for example `{type:'bandits', city:'Xiaopei'}`) into the officer's voice, cached, with template text as the default. The model never changes simulation outcomes. This is the only planned use and it can be dropped.

## 13. Out of scope (for now)

Multiplayer; the hero joining wars; free-form building placement; more than 4 troop types; more than two visible resources; naval combat; a Diplomacy system (maybe later: alliances and truces).

## 14. Implementation notes (as built in Phase 1)

- The map is **generated from the seed** (jittered 6x5 grid, roads thinned but kept connected, never crossing), not hand-authored. Names come from syllables. Same seed, same world.
- Buildings are **levels per type** (farm, market, barracks, wall, temple, max level 3, one project at a time per city). The 3D slot layout in Phase 7 will be derived from these levels.
- Food is a faction-wide pool; each city's prosperity uses the faction's food security (runway of 30 days = fully secure). Neutral cities feed themselves.
- Tax: Low (+0.15 prosperity, x0.6 gold), Normal, High (-0.35 prosperity, x1.5 gold). Population adjusts slowly, so High tax is a short-term cash boost that shrinks the recruit pool; the balance script shows the long-run gold gain is small (about +15%) for about 25% fewer people. Loyalty effects arrive with officers and loyalty in Phase 4.
- Faction names are placeholders.

### War rules as built (Phase 3)

- **Troops:** infantry, spearmen, cavalry, archers (spear > cavalry > archer > infantry > spear, x1.4 / x0.7) plus **siege engines** (x0.25 in the field, 4 wall hit points per day each, other soldiers chip 0.15).
- **Battle:** armies within 16 map units lock in battle and stop marching. Each side's casualties per day = 3.5% x the enemy's effective strength (troop mix matchup x officer Command x morale x home ground). Morale drops 8 per day at even odds (0.3x to 3x by the odds); at 0 the army **routs** to its nearest city, is not chased, and recovers there. Moving out of a battle costs 10 morale. Several armies can fight one enemy; damage is split between contacts.
- **Siege:** an army standing still in a hostile or neutral city attacks its garrison. While the wall holds the garrison hits at x1.5 and takes only 35% damage. A garrison at 1 or fewer with no defending army at the node means the city falls: owner changes, 15% of the people are lost, devastation, buildings kept, construction cancelled, governor released, depot lost. Mountain passes give x1.5 wall and defence.
- **Contested:** an enemy army in a city's zone with none of its own halts that city's gold and cuts its security.
- **Officers of a defeated army:** 30% die, 35% are captured and join the victor (loyalty 40), 35% escape home. A faction with no nodes is eliminated; you lose when you hold none and win when you hold all 30.
- **Supply:** each army traces a road route to the nearest uncontested city of its own. **Enemy armies on that route cut it.** Soldiers eat 3x in enemy or neutral land. A cut army lives on its carried rations (12 days), loses 3 morale a day while cut and 8 a day plus 2% desertion once the rations are gone. A **forward depot** (300 gold, stocked from the food pool at 40 a day up to a target) feeds armies within 230 map units at the normal rate, even deep in enemy land and even when the line is cut.
- **Abilities (40-day cooldown):** by the officer's best stat: Might = Charge (+60% damage for 6 days), Intellect = Fire attack (6 to 14% of the enemy's troops and 15 morale, or the garrison and wall), Command = Rally (+30 morale).
- Not yet: front-width cap on stacking; diplomacy; naval movement for ports.

## 15. Open questions

- Fictional world name, factions and officer names.
- Should factions have unique troop bonuses?
- Whether to add diplomacy after the first playable.
- Exact length of a game (target: 45 to 90 minutes a campaign).
