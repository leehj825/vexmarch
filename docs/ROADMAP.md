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

- Delivered: four soldier types with their own silhouettes (shield and sword, long spear, bow and quiver, riders on horses) in the proportions of the army's troops, siege engines, armies marching on the roads into and out of the city (seen from 140 map units away, easing along the road as the sim moves them), armies in battle meeting in one line with defenders facing attackers, arrow volleys, clash sparks, stone shots from engines, and fallen soldiers that follow the army's casualties. Still cosmetic: the sim decides every outcome. Follow-up: armies stop and fight a hostile city on their path instead of passing it; the 3D scene shows a wave-by-wave assault with ladders, defenders fighting back, a breach scene, and a conquest scene when a city falls. 13 layout tests and 62 browser checks (worst case 23 draw calls, about 25k triangles). Later: the soldiers were replaced by simple animated figures that play the clips of Nightfall Settlement and Deepward (see DESIGN, Animated crowd).

## Phase 9 — Walk mode (done)
- Third-person hero walking the city, clock paused while active. No combat and no war participation.
- Delivered: `js/view3d/walk.js`, Walk button in the city panel (own cities), keyboard and thumb-stick controls, officers and townsfolk to talk to, gifts, building descriptions, Korean text, `tools/ui_walk.js` (22 checks).

## Phase 10 — Optional flavour
- Optional on-device language-model text for officer messages, with template fallback. May be dropped.

## Since Phase 9 (done)
Animated crowd, Nightfall-style city look, city growth stages, ÷10 population/soldier rescale (exact soldier counts), smarter army tactics (roles, wall defence, sorties, campaign food, retreats), 3D strategy map with terrain, pause menu, collapsible phone panel, ad-banner freeze fix, Campaign story slice (six houses, 24 officers, 12 beats, endings, chronicle, English and Korean).

## Tips (done)
`js/ui/tips.js`: a hold (touch) or hover (mouse) on anything with `data-tip` shows a short popup; a held press is not also a click. The city and army panels, the Officers and Diplomacy sheets and the top bar now show short labels with dotted underlines and small (i) marks, and the explanations moved into tips (about 50 texts, all in Korean too). `tools/ui_tips.js`: 19 checks. To add one: `VM.Panels.T('Label', 'Explanation')` or `data-tip="..."`.

## Icons and words (done)
After the first icons-only pass the rule became: **icons for numbers you scan** (stats, bars, counts, costs) and **words for what you read or decide** (offers, buttons that do something, headings, statuses, alert sentences). Settings > Interface switches between *Icons only*, *Icons and words* (default) and *Words and labels*; a **Details** button (list icon) in the city, army and officer panels shows a label beside every stat, remembered between sessions. Words are `<span class="w">` and labels `<small class="sl">` and CSS decides what is shown (`html[data-ui]`, `html.det`), so switching needs no redraw.

### Icons
The city and army panels, the Officers, Diplomacy and Alerts sheets and the top bar are made of icons, meters, pips and generated officer portraits instead of words, the same on phone and desktop. Names, numbers and costs stay as text; everything else (labels, descriptions, the reason a button is disabled) is a tip: hold or hover an icon and its name and explanation appear (first line the name, then the text). `js/ui/icons.js` holds the set and helpers (`VM.Icons.t / stat / btn / meter / pips / portrait`, `VM.Icons.MAP` for troops, buildings, policies, orders, traits, roles and event types); `tools/ui_icons.js` checks that every icon exists and every icon button has a tip. Still text: Settings, the title and campaign screens, story pages, the walk-mode buttons and the toasts.

## Next (proposed order) — THE CURRENT TODO LIST
All ten items below are DONE (items 1 to 10); the list is kept as a record of what shipped. Ideas for what to do next are in the section after it. Mark an item DONE here when it ships.
1. **DONE — Fix: a city captured by a bystander.** An army inside a hostile city whose walls are down no longer retreats or routs on morale while it is at least half as strong as what is left to fight (`War.pressing`, `WAR.pressRatio`); food and a too-small army still pull it out. Credit-to-besieger (tracking who did the siege damage) was not done.
2. **DONE — House traits and special victories.** (`Story.bonus`, `StoryData.TRAITS/VICTORIES`: Kaldrath +10% army strength, Orsolyn +15% gold, Tessarune +15% food, Marrowgate +20% garrison defence, Wickfront +8 officer loyalty, Thornreach +20% march speed; each house also wins by holding its own set of places for 60 to 120 days; shown on the house pick screen and at the top of the Chronicle. Campaign only; the AI houses benefit and can win this way too, but do not aim for it.) Each of the six houses gets a gameplay trait and its own victory condition, so the campaign houses play differently.
3. **DONE — Allies help each other.** (`Diplo.sendAid/askAid`: an *Ask for help* button in the Diplomacy sheet sends up to 2 of the ally's idle armies to one of your besieged or contested cities for 40 days, 30-day cool-down; AI allies do it on their own for a partner under threat.) Ask an ally for troops or help; allies join your wars, so a pact is worth more than not being attacked.
4. **DONE — More campaign beats.** (`StoryData.DECISIONS`, `Story.decide/choose`: eight ruler's decisions with two priced choices each — feast, deserters, refugees, an envoy, taxes, a hard winter, a funeral, the herald's title — fired by day or event, one every 40 days at most, in English and Korean; the ruler has an Honor stat (0 to 100, shown in the Chronicle) that moves officers' loyalty by up to 5. Not done: house-specific beats beyond the first twelve.) Original aim: Extend the story past the first 12 beats, with a ruler who has stats and makes choices.
5. **DONE — Fog of war and scouting.** (`js/sim/fog.js`, `CFG.FOG`: optional per game, a *Fog of war* button on the title screen; a house sees 260 map units around its cities and its allies', armies 190 (cavalry x1.4); enemy armies out of sight are not drawn or selectable, enemy cities out of sight are dimmed and show only what was last seen; the AI picks targets only among cities it has seen; `FOG=1 npm run tournament` runs the AI games with it. Territory colours stay common knowledge, and the AI reads a known city's live garrison. Off by default.) Original aim: You see only what your cities and armies see, scouts matter, and the AI follows the same rules.
6. **DONE — Random events.** (`js/sim/hazards.js`, `CFG.HAZARDS`: failed harvest, bounty, plague, bandits (an army in the city drives them off) and unrest in a city with a disloyal governor or high taxes and low security; every owned city is rolled the same way, seeded; a *Random events* button on the title screen, on by default for skirmish and campaign, off in the tutorial and in tests; alerts in English and Korean; `HAZARDS=1 npm run tournament`.) Original aim: Famine, plague, bandits, rebellions in low-loyalty cities and good harvests, through the alerts system.
7. **DONE — Battle forecast.** (`War.forecast`: the panel of an enemy city lists your three nearest armies with Overwhelming / Favourable / Even / Risky / Hopeless and the strength ratio in a tip; counts the garrison, defending armies, wall and relief armies the attacker can see.) Original aim: A tooltip before you attack that shows the likely outcome.
8. **DONE — Front-width cap.** (`WAR.front` and `WAR.siegeFront`, both 3: of the armies of one house in the same fight, or besieging the same city, only the three biggest engage; the rest are in reserve (`army.reserve`: they neither strike nor are struck, and do not move) and step in as the front thins; the army panel says *In reserve*.) Original aim: A limit on how many armies can stack at a front, so chokepoints and sieges matter.
9. **DONE — Idle-army button.** (`Armies.idleOf`, a flag button with a count at the left of the top bar: jumps to the next army that stands in a city with no march and the Hold order.) Original aim: A button to jump to the next army with no orders.
10. **DONE — More diplomacy.** (`Diplo.marry` and `Diplo.exchangeHostages`, buttons on an ally's card in the Diplomacy sheet. A marriage costs a 300 gold dowry, needs a 60-day-old pact and opinion of 30 or more; the married pact is never betrayed by an AI ally, an ask for help sends one more army, and breaking it costs double. Hostages: each side lends its weakest idle officer to the other's capital (they cannot lead or govern); an AI ally does not betray while hostages are held; when a pact is broken the breaker's hostage stays and joins the wronged house, otherwise they go home. Only the player proposes; the AI never starts either.) Original aim: Marriages and hostages.

## Field battle view (done)
Watch a fight that happens on the road, away from any city. `FieldLayout.start` (only while the army is fighting and seen; a finished battle gives nothing) fixes the place; `FieldLayout.build` describes the two sides facing each other, the reserve behind, armies that march in or leave at their real place on the map, and the fallen. `Field3D` draws it with the crowd, volleys and sparks. The view is entered with **Watch battle** in the army panel or by tapping the red cross on the map. Once in, it is never closed by the game: after the fight the loser leaves, a destroyed army lies on the field and the status line says who holds it; only Back to map or Esc leaves. `tools/test_field.js` (3 tests) and `tools/ui_field.js` (32 browser checks). Not done: following an army that leaves the field, siege engines in the field.

## Round two (done, one commit each)
- **Trade routes** (`js/sim/trade.js`): a road between two of your cities, or one of yours and an ally's, through land friendly to both; pays both houses daily; cut when an enemy holds a city on the road; markets allow more routes. Panel: *Trade* section in your city.
- **Doctrines** (`js/sim/doctrine.js`): a yearly choice of one of three lasting bonuses (drill, fortifications, granaries, levies, caravans, mobility). The player's offer pauses the game; AI houses take the first.
- **Vassals and tribute** (`js/sim/diplo.js`): a weaker house can accept vassalage: it keeps its cities and name, pays tribute daily, cannot ally elsewhere, and rebels when it grows much stronger than its lord.
- **Generals' duels** (`js/sim/duel.js`): while your army fights an enemy army, challenge the enemy general; decided at once by stats and trait, with a rival bonus; loser's army loses morale and its general loyalty; a cool-down after each.
- **Battle reports** (`js/sim/report.js`): each fight is recorded with start and end sizes, who held the field and where; the last 40 are kept.
- **House crests and ruler portraits** (`Icons.crest`, `Icons.portrait`): each house has a crest in its colour with its emblem (sword, anchor, sprout, mountain, cross, horse) on the title and campaign screens; the campaign shows its ruler's portrait.
- **Guide to the new systems** (`js/ui/guide.js`): nine short pages (trade, doctrines, vassals, duels, reports and the chronicle, fog, events, the front and field battles, marriage and hostages, scenarios and slots), in English and Korean. *Guide* on the title screen and in the pause menu.
- **Save slots** (`js/ui/slots.js`): three named slots besides the autosave. *Save to a slot* in the pause menu (asks before overwriting); *Saved games* on the title screen to load or delete. A blocked browser store just means no slots.
- **Scenario maps** (`js/sim/scenarios.js`): Open ground (the random map), The fixed realm (the campaign's 30 places, no story), and Siege of Vexholm (the realm with Vexholm walled and held by another house, your army at its gates). Chosen on the title screen.
- **Chronicle as a history book** (`js/ui/story.js`): year headings, a summary of the current year, and battles written as sentences; available in every game from the pause menu.

## Ideas for next (not started, none agreed)
- AI that aims for its house's own victory (Story.victoryView), and AI that proposes marriages, hostages and asks for help against the player.
- House-specific story beats and decisions beyond the first twelve; the ruler choosing a policy at the start (not only reacting).
- Fog of war for the AI's own army checks (it still reads live garrisons of cities it has seen); a scouting order or a watchtower building.
- Forecast shown on the map while an army is selected (hover over an enemy city), not only in the city panel.
- Battle report after each fight (who lost what), and a replay of the last siege.
- Balance pass with all options on (fog, random events, front width): `FOG=1 HAZARDS=1 npm run tournament`, and the human on hard.

Parked (owner decision, not to be started): Android APK verification, phone performance checks, native review of the Korean text.

## Phase 11 — Diplomacy (DONE; spec in `docs/DIPLOMACY.md`)
Two states (enemy, ally), no truce; breaking a pact is always possible and costly (betray at the end); a strong faction can offer terms to a weak one to merge (the player can refuse; the AI accepts for survival). Delivered in this order: (1) state, alliance rules in war and army code, break, tests; (2) alliance proposals and AI answers; (3) merge offers, survival score, game-over by merge; (4) AI initiative and betrayal; (5) UI sheet, alerts, map marks; (6) campaign hooks and Korean; (7) balance and docs.

## Later / unscheduled
Joining wars as a hero, extra scenarios and maps, unique faction bonuses.

## Risks
- **3D on Android:** keep draw calls low, instance everything, one city at a time.
- **AI quality:** AI-vs-AI harness from Phase 1 onward.
- **Scope creep:** Phases 7 to 10 start only after the 2D game is fun.
