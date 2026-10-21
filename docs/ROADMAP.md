# Vexmarch — Roadmap

Principle: prove the strategy layer is fun in 2D before spending on 3D. Each phase ends with something runnable.

## Phase 0 — Project setup (DONE)
- `index.html`, `css/style.css`, `js/` skeleton with plain scripts (no build step).
- `package.json`, Capacitor config with app ID `com.vexmarch.game`.
- `tools/` folder, Node test runner for the sim.
- **Done when:** a blank page loads from `file://` and the Node harness runs.

## Phase 1 — Headless simulation (DONE)
- State object, seeded RNG, fixed-timestep `step(dt)`, command queue.
- 30-node map data with specialties and roads; 5 factions + neutral.
- Economy: gold, food, population growth with prosperity and tax; recruiting.
- Balance script prints economy curves over simulated years.
- Delivered: `npm test` (20 tests) and `npm run balance`. Armies, supply and combat are Phase 3; Phase 1 recruits go into city garrisons.
- **Done when:** 10,000 simulated days run in Node, are deterministic for a seed, and economy curves look sane.

## Phase 2 — Map view and controls (DONE)
- Canvas map: nodes, roads, derived borders, faction colours, pan/zoom (mouse and touch).
- HUD: gold, food, date, pause/1x/2x/4x; node panel (build, tax, recruit).
- Army creation, move orders along roads, supply line display.
- Delivered: title screen with faction picker (and map preview), player marking (gold rings, HUD faction badge), derived territory and borders, army move/halt/disband, supply line display, autosave and Continue. Supply cutting and combat are Phase 3.
- **Done when:** the player can run an economy and march an army on the map.

## Phase 3 — War and logistics (DONE)
- Contact combat, troop type matchups, morale, officer abilities.
- Sieges and walls, contested zones, supply drain and Cut Off.
- Depots and forward bases; reinforcements joining fights.
- Delivered: `js/sim/war.js`, `tools/test_war.js` (23 scripted scenarios) and a rough `tools/war_bot.js` that Phase 5 replaces. Not done: the front-width cap (stacking limit) and auto-pause on alerts (Phase 4).
- **Done when:** a siege and a supply-cut raid both play out correctly in a scripted test scenario.

## Phase 4 — Officers and delegation (DONE)
- Officer stats, traits, loyalty; governor and commander roles.
- Standing orders; wandering officers and search; capture and recruit.
- Alerts feed with auto-pause on urgent events.
- Delivered: `js/sim/officers.js`, `tools/test_officers.js` (24 tests including a 5-year autopilot run), officers roster, alerts feed with per-category auto-pause, proposals. The AI (Phase 5) will use the same policies and orders.
- **Done when:** a player can leave cities on Develop and armies on Defend and the empire runs itself sensibly.

## Phase 5 — AI factions (DONE)
- Rule-based planner using the player's commands; difficulty settings.
- Win/lose flow (conquest; lose with no nodes), new game.
- AI-vs-AI headless runs to check games finish and no faction stalls.
- Delivered: `js/sim/ai.js`, `tools/test_ai.js` (16 tests), `tools/ai_tournament.js`. Over 80 games each against four normal rivals: easy wins 13%, normal 25%, hard 31% (fair share 20%); a hard AI against four easy ones wins 56%. AI-vs-AI games finish in 6 to 14 years (about 40 to 90 minutes at 1x).
- **Done when:** a full campaign can be won or lost against AI.

## Phase 6 — Polish: first playable (DONE, Android build still to be run)
- Deepward-style visuals for the map and UI, synthesised music and sfx.
- Tutorial scenario and tips; settings; saves with Continue/New Game; i18n (English, Korean).
- AdMob top-centre banner with HUD offset; Android build via Capacitor.
- Delivered: generative music and synthesized effects (`js/ui/audio.js`), settings sheet (volumes, language, text size, replay tutorial, delete save), guided tutorial scenario (`js/ui/tutorial.js`), English and Korean (`js/i18n.js`, `js/lang_ko.js`, `tools/i18n_crawl.js --ko --missing` finds untranslated text), vector icons for specialties and a vignette on the map, AdMob top-centre banner with HUD offset (`js/ads.js`; test ids by default, release ids through `VX_ADS=real`), Capacitor project generation and patching (`tools/android_patch.js`), icons and splash (`tools/make_icons.py`), a GitHub workflow that runs the tests and builds the debug APK, and a browser smoke test (`tools/ui_smoke.js`).
- Not verified here: building the APK (the Android SDK is not available in this environment). Run the GitHub workflow, then install on a phone.
- **Done when:** installable on Android and playable start to finish. This is the release candidate for the 2D game.

## Phase 7 — City view (3D) (DONE)
- Three.js r128 scene generated from city state; slot-based buildings, walls, fields, decorative houses by population.
- Transition from the map; one city loaded at a time; low-end Android budget.
- Delivered: `js/view3d/layout.js` (the city as pure data, 10 tests in `tools/test_layout.js`), `js/view3d/city3d.js` (Three.js r128 renderer: the whole static city is one merged vertex-coloured mesh, soldiers are instanced; worst case 16 draw calls and about 18k triangles), a View city button in the city panel and a double tap on a node to enter, Back to map button and Escape to leave, a browser test (`tools/ui_3d.js`, 50 checks on desktop and phone). The sim keeps running in the city view and the picture follows it (building scaffolds, wall damage, sieges, garrison).

## Phase 8 — Armies in 3D (DONE)
- Instanced soldier formations scaled to troop count, siege gear, siege animations driven by sim events. Cosmetic only.

- Delivered: four soldier types with their own silhouettes (shield and sword, long spear, bow and quiver, riders on horses) in the proportions of the army's troops, siege engines, armies marching on the roads into and out of the city (seen from 140 map units away, easing along the road as the sim moves them), armies in battle meeting in one line with defenders facing attackers, arrow volleys, clash sparks, stone shots from engines, and fallen soldiers that follow the army's casualties. Still cosmetic: the sim decides every outcome. 13 layout tests and 62 browser checks (worst case 23 draw calls, about 25k triangles).

## Phase 9 — Walk mode (optional extra)
- Third-person hero walking the city, clock paused while active. No combat and no war participation.

## Phase 10 — Optional flavour
- Optional on-device language-model text for officer messages, with template fallback. May be dropped.

## Later / unscheduled
Diplomacy, joining wars as a hero, extra scenarios and maps, unique faction bonuses.

## Risks
- **3D on Android:** keep draw calls low, instance everything, one city at a time.
- **AI quality:** AI-vs-AI harness from Phase 1 onward.
- **Scope creep:** Phases 7 to 10 start only after the 2D game is fun.
