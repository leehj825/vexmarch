# Vexmarch — Design Document

App ID: `com.vexmarch.game` · Repo: `leehj825/vexmarch`
Status: design draft, no implementation yet.

A real-time grand strategy game on a 30-node fictional map. Plain (non-module) JavaScript, Canvas 2D for the strategy map, Three.js r128 for the optional city view, no build step, Capacitor for Android. Desktop first, touch supported from the start.

## 1. Pillars

> **Scale (version 6):** the game counts people and soldiers one by one. No node ever holds more than 500 people (`ECON.maxPop`): a capital starts at about 275, a plain town at 150 to 180, and population grows only slowly toward the cap of its specialty and buildings (a gap closes by 0.1% a day, so filling a town takes years). A garrison is 5 to 40 soldiers and a field army 20 to 100. A soldier costs ten times what it used to (infantry 200 gold) and eats and is paid ten times as much, tax and food per head are ten times higher, so the economy runs at the pace it did when the numbers were ten times bigger. Damage is applied as whole soldiers: each step's damage is carried as a fraction and every whole point kills one soldier, picked with the seeded random numbers, so a run still repeats exactly. The 3D city draws one figure for every soldier.

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
Armies are formations of instanced, animated low-poly soldiers (one figure for every soldier: the numbers are small enough to count) plus siege gear. During a siege they animate toward the walls. The visual is cosmetic; the sim decides the outcome whether or not it is watched.

### 9.4 Walk mode (built)
Press **Walk** in the panel of one of your own cities (`js/view3d/walk.js`). WASD/arrows (Shift runs), Q/E or dragging to look, a thumb stick on phones, F/Enter to talk, Esc to leave. You can talk to the officers standing in the city (story role, bio and ties in a campaign, a line by trait, a Gift button) and to townsfolk, and look at buildings. Collisions are circles taken from the city layout; the avatar stays inside the walls. Tested by `tools/ui_walk.js`.

Third-person hero walking a city, like Nightfall and Deepward. **The strategy clock is paused while walking.** It has no effect on the sim: it is an optional way to look around and talk to people. **Joining wars is out of scope for now**; the hero will be a separate system that can attach to the sim later.

## 10. Look, sound, UI

- **Icons first**: panels show icons, meters and numbers; explanations live in hold-to-read tips (`js/ui/icons.js`, `js/ui/tips.js`). Same on all screen sizes.

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

Multiplayer; the hero joining wars; free-form building placement; more than 4 troop types; more than two visible resources; naval combat; a truce system (diplomacy is alliances and merging only; see `docs/DIPLOMACY.md`).

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
- **A city in the way:** an army marching through a city that is not its own (an enemy's or a free one) stops there and lays siege instead of walking past (a toast says so); it stays until the city falls or you give a new order. Your own cities, routed armies and retreating armies pass through. Guard, defend, reinforce and AI orders respect this.
- Not yet: front-width cap on stacking; diplomacy; naval movement for ports.

### Officers and delegation as built (Phase 4)

- **Loyalty** drifts toward a target: 55, +25 Loyal, +5 Brave, -15 Greedy when the treasury is broke or under 100, -10 Schemer, a governor's city prosperity (-10 to +8), a commander's army morale (-8 to +3), -10 once unemployed for 60 days. A gift (100 gold, 30-day cooldown) gives +15. Rout -8, capturing a city +10, approving a proposal +3, declining -1. Below 35 an alert is raised; below 20 an idle officer or governor may defect to the nearest rival. Commanders in the field do not defect.
- **Governors and policies** (city): Manual, Develop, Fortify, Recruit. A governor decides every 14 - 8 x Politics/100 days, saving a gold reserve (x1.6 Cautious, x0.5 Rash). Develop: tax relief when prosperity is low, farms when food runs short, then market, temple, farm, barracks (the order depends on the trait), and a small garrison. Fortify: walls (to Lv2, Lv3 under Fortify), archers, 6% garrison. Recruit: barracks, spears and archers, 10% garrison. Greedy governors squeeze a poor treasury with High tax.
- **Armies' standing orders:** Hold, Defend (guard the station, meet intruders within 300 map units when the odds are good enough for the officer's temperament: Rash 0.8, Brave 0.9, other 1.15, Cautious 1.6), Reinforce (go to your cities that are contested or besieged), Raid (hit weak hostile towns in range; odds 1.0 to 2.2 by temperament; fall back and rest when morale < 35, cut off, starving, or below 40% of peak strength).
- **Proposals** (player only, expire after 20 days, 40-day cooldown per officer): Rash, Brave and Greedy commanders on Hold or Defend ask to attack a weak town nearby; Cautious governors on Manual ask to build a wall when enemies are close.
- **Wandering officers** drift between nodes every 25 to 55 days; one new wanderer appears every 120 days (up to 6 in the world). You see wanderers in your own territory; an idle officer can search (50 gold, 15 days) to reveal others within 330 units. Recruiting costs 100 + 2 x total stats; the odds are 35% + half of your best Politics, and a refusal sends them away. Officers walk between your cities at 70 units a day.
- **Alerts:** every event is turned into a message. Categories that pause the game (changeable, remembered in localStorage): cities attacked or lost, armies cut off/routed/lost, officers defecting, officers asking permission (on by default); battles joined and famine (off).

### AI factions as built (Phase 5)

- **Same rules as the player.** `js/sim/ai.js` only issues commands (`VM.Commands.exec`); a test greps the source to make sure it never edits gold, food, population, garrisons or buildings directly. Difficulty changes how often it thinks (20, 10 or 5 days), how much margin it wants before attacking, how many armies it keeps, and which features it uses (searching for officers, officer abilities, forward depots). It does not get extra income.
- **Each think:** staff (governors for the most populous cities, keeping two officers free as commanders; policies Fortify when threatened, Recruit in its two biggest cities, otherwise Develop), recruit wanderers (and search for more), recruit troops from a budget that leaves 800 gold for its governors, choosing the troop type that counters the mix of nearby enemies and siege engines when its goal city has a wall, form armies leaving 3% behind as garrison, top idle armies up from garrison surplus, post guard armies (Defend) at the most threatened cities, and run the strike force.
- **Strike force:** choose the most valuable hostile city in reach that the combined ready armies beat with margin (value: population, capital, finishing a weak rival; distance penalised), gather at the own city nearest the target, merge the armies, check the odds again when leaving, march, use abilities, fall back to rest when weary or cut off. If nothing is feasible it still picks a goal city and builds toward it. The required odds relax by 10% a year without gains (down to 60%) so no faction sits still forever.
- Not done: alliances and truces, naval moves, scouting fog (the AI sees the whole map).

### Polish as built (Phase 6)

- **Sound:** a small generative score (calm on the map, drums and a minor key when your armies fight or a city of yours is attacked) and synthesized effects; master, music and effects volumes and a mute switch, remembered on the device.
- **Tutorial:** ten steps on a fixed small world (4 factions, the AI asleep until it ends): pause, open the capital, build a farm, recruit, form an army, march on the highlighted village, watch the siege, appoint a governor on Develop, open Officers, open Alerts. Each step can be skipped; completion is remembered; Settings replays it.
- **Languages:** the code is English. A layer watches the page and swaps every text for the Korean table (numbers match as `{0}`, names as `{a}`); English comes back by restoring the originals. `tools/i18n_crawl.js --ko --missing` drives the game through every panel and message and lists what is still untranslated.
- **Ads:** `js/ads.js` shows Google's test banner at the top centre of the Android app while a game is running; set `VX_ADS=real` with your own ids to build a release. The HUD moves down by the banner's height (`body.adLive`).
- **Android:** `npm run android:debug` (or the GitHub workflow) generates the Capacitor project, applies `tools/android_patch.js` (fullscreen, icons, splash, AdMob app id) and builds the debug APK.

### 3D city as built (Phase 7)

- The layout is a pure function of the city state (`VM.CityLayout.build`): tier by capacity (hamlet, town, city, capital) sets the wall radius; one gate and one road for every road on the map, each facing the neighbouring node it leads to (and the view opens looking north, so the 3D city matches the map); wall segments with damage (cracked, then breached near the attackers, a broken gate at 0 hit points); towers from wall level 2; houses are decorative (4 to 48, one per 220 people, never limited by buildings); market stalls (2 per level + 1), barracks (hall, then tents and dummies from level 2), temple (shrine, tower, spire with a glowing gem), depot crates by stock, fields and farmhouses by farm level, scaffolding on the site of whatever is being built, specialty scenery (rocks for passes, ore for iron hills, paddocks, standing stones, water and a pier for ports), garrison on the wall, and armies at the node with siege engines that fire at the wall while besieging.
- **Stable picture:** nothing already standing ever moves. A city's size depends only on its specialty (not its buildings or people); every possible building site is reserved from the start; houses, fields and scenery come from separate fixed random sequences and a growing city just uses more of each list; scenery does not depend on armies. Tests change buildings, people, depots and armies and check that the old positions are unchanged, and the browser test reopens the city repeatedly.
- The renderer is one merged, vertex-coloured mesh for everything static, instanced soldiers, a few animated flags and engines, and cosmetic stone shots. It rebuilds only when the layout's signature changes (checked twice a second).
- **Armies (Phase 8):** each army is drawn with up to 60 soldiers in the mix of its troops (infantry with shields, spearmen, archers, cavalry; siege engines separate), cavalry on the flanks and archers behind. Armies on a road within 140 map units of the city march in or out along that road. A defender and an attacker that are fighting stand in one line, face to face, with sparks between them and arrows flying; fallen soldiers lie behind a line in proportion to the army's losses. The camera opens facing the action.
- **Tactics (version 6):** battles have roles. Infantry and spearmen are the front line: the enemy's blows land on them first. Archers stand behind it and shoot all the time (a small bonus), and are hard to hit while the line holds (a third as likely to be hit; if the line has gone below a quarter of the army they are fully exposed, and enemy cavalry that have swung round behind the line triple their risk). Cavalry work in an eight-day cycle: a charge (twice their strength), a fall back (a fifth), then either a swing round the flank and a strike from behind (an officer who is Rash, Brave or has Command of 55 or more without being Cautious) or a regroup and a second charge; while they are away from the fight they are hard to hit. Siege engines add nothing in a field fight or in defence: they stay behind the line and only break gates and walls. In a walled city the garrison and any of the city's own armies that stay inside fight from the walls: their archers shoot 1.5 times as well from the wall top and are hard to hit, and the whole group is hit at 35% of the normal rate while the gate holds; the attackers chip the gate with their numbers (slowly) or their engines (fast). When the gate falls a `breach` event is raised and everybody fights in the open. An army inside its own besieged walled city is told by its officer, every two days, whether to ride out (when he is clearly stronger than the besiegers, or the gate is failing and the odds are not bad: how much stronger depends on his nature, Rash 0.9x, Brave 1.1x, ordinary 1.6x, Cautious 2.2x) or to hold the walls; the player gives no orders here. In the 3D city the foot stand in lines, archers in the rows behind, cavalry on the wings sweeping out and round; the defenders are archers on the wall and foot behind the gate, and come forward to the breach when it falls. **Food and retreat:** an army that marches out from one of its own cities to attack takes up to thirty days of food along, out of the faction's stock; it retreats only when its food would run out (a cut-off army with four days left) or its morale falls below the limit of its officer (Rash 12, Brave 18, ordinary 28, Cautious 40), not because it has taken losses; a rout still happens at zero morale.
- **3D strategy map:** `js/view3d/terrain.js` builds the ground once per game from the seed and the nodes: a 140x108 height field (about 30,000 triangles in one mesh), mountains round passes and iron hills (a pass is a saddle, so its road runs through), a bay beside each port, up to two lakes in the emptiest places, open sea off the edges, forests as one merged mesh of small cones, roads as ribbons laid on the ground, and the territory colours and borders painted over it as a texture that is redrawn only when a node changes hands. Heights are scenery only; nothing in the sim reads them. The nodes, armies, routes and labels are still the 2D canvas above it, drawn at positions projected through the 3D camera (far ones smaller and behind near ones), so taps and picking use the same projection. The scene is static and drawn only when the camera or territory changes. Controls: drag pans over the ground, wheel or pinch zooms toward the pointer, two fingers twisting turn the map and moving up or down together tilt it, the right mouse button turns and tilts, and the buttons at the right edge turn, tilt and reset north. Settings can switch to the flat map (the same view as before), which is also used when WebGL is missing.
- **Growth (3D):** cities are about 1.5x wider than before (radius 18 / 21 / 24 / 29 for hamlet, town, city, capital), the street from every gate to the keep and a plaza round the keep are kept free, and houses stand at least 3.4 apart. The *stage* of a place follows its people (under 125 people: 1, under 200: 2, under 325: 3, above: 4) and decides how it looks: stage 1 tents and huts; 2 timber houses, a paved plaza and a lumber camp; 3 stone houses mixed in, paved streets, a suburb of seven houses along the roads outside the gates; 4 mostly stone, a monument on the plaza and a suburb of sixteen. Works outside the walls come with the buildings: a windmill at farm level 3, a lumber camp from stage 2, a quarry in iron and pass cities. Everything is reserved from the start (plaza ground, suburb and work sites), so houses never move when a place grows; they only change style, oldest first.
- **Nightfall look:** the walls are Nightfall's brick wall model (one piece a segment, scaled to the wall's height and thickness; towers and gates stay Vexmarch's), the scenery trees are its pine, wells its well with a roof, barracks tents its canvas tents around a campfire (and an archery range at barracks level 3), paddocks ring with its log fence, and a smithy (its blacksmith model) stands in cities, capitals, iron cities and cities with a level 3 barracks. Houses are drawn in its village style: stone footing, plaster in a timber frame, a gabled roof with a ridge beam, a door with a lintel, shuttered lit windows with flower boxes, a chimney with a cap, sometimes a lean-to; in hamlets every third home is a tent. `tools/extract_structs.js` copies the textured models (`js/view3d/struct_models.js`, 334 KB, four textures); `TexMerger` in `city3d.js` merges them per texture, so all of them together are four draw calls. Everything else stays vertex-coloured.
- **Animated crowd:** the soldiers are simple figures (about 20 boxes, no faces or fingers) that play the real animation clips of Nightfall Settlement and Deepward: sword and shield (idle, walk, run, two attacks, block, die, cheer), spear (stab, slash), bow (draw and shoot, die), riders on a jointed horse with a walk and a gallop. `tools/extract_crowd.js` picks the clips from the Nightfall repo (next to this one), resamples them to 10 frames a second and writes `js/view3d/crowd_clips.js`. `js/view3d/crowd.js` bakes every frame into one float texture of skin matrices and the vertex shader skins each box rigidly on its bone, so a kind of soldier is one draw call however many are on screen and the CPU only writes four numbers per soldier a frame. The state of each soldier (idle, walk, run, attack, block, die, cheer) comes from what its army is doing; a clip that does not loop is replayed or held on its last frame (the fallen).
- **Assault and conquest (3D):** an army laying siege attacks in three waves of ten seconds: soldiers run at the wall, fight there with sparks while the garrison thrusts back and shoots from the wall, and fall back; ladders lean on the wall where they attack. With the wall down (or none) they pour in through the breach instead. When the city falls while you watch, the victors run in and cheer with confetti of their colour, the flag changes colour, and the old defenders flee through the far gate.
- Not in these phases: hero walk mode, day and night.

## 15. Open questions

- Fictional world name, factions and officer names.
- Should factions have unique troop bonuses?
- Whether to add diplomacy after the first playable.
- Exact length of a game (target: 45 to 90 minutes a campaign).
