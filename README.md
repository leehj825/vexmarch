# Vexmarch

A real-time grand strategy game: 30 nodes, 4 to 6 factions, officers who run your cities, and supply lines that decide wars. Plain JavaScript (no build step, no modules) so it opens from `file://`; Capacitor wraps it for Android (`com.vexmarch.game`).

See `docs/DESIGN.md` and `docs/ROADMAP.md`. **Status: Phases 0 to 9 and 11 (diplomacy) done** (the 2D game is complete: economy, war, officers, AI rivals, tutorial, English and Korean, sound, Android wrapper). The 3D city view (View city in the city panel, or double-tap a node) shows buildings, walls, soldiers of every kind and armies marching and fighting outside the gates; Walk mode (the Walk button in your own city) lets you stroll the streets, talk to officers and townsfolk and give gifts while the clock is paused. The strategy map is 3D with terrain, and there is a Campaign mode with a story (`docs/STORY.md`) beside the random Skirmish. See `ANDROID.md` for the phone build.

## Run

Open `index.html` in a browser. Press Tutorial on the title screen for a guided first game, or pick a faction and a rival AI level (Easy, Normal, Hard) and press Start. Click a node to manage it (tax, governor, buildings, recruiting, form an army); click an army, then a node, to march. Drag to pan, wheel or pinch to zoom, right-click a node to order a march, Space pauses, 1/2/3 set speed, Esc deselects.

## Test and balance (Node 18+, no dependencies)

```
npm test              # tools/test_diplo.js (alliances, betrayal, merge offers), tools/test.js (map, determinism, saves, economy, commands, armies) tools/test_war.js (battles, sieges, supply) and tools/test_officers.js (loyalty, governors, orders, proposals)
npm run tournament   # AI-vs-AI games: node tools/ai_tournament.js [seeds] [years] [levels]
npm run ui:test       # browser smoke test (needs Playwright: PLAYWRIGHT=/path/to/playwright)
npm run ui:test3d     # browser test of the 3D city view (needs Playwright)
# more browser tests: tools/ui_map3d.js, ui_story.js, ui_walk.js, ui_diplo.js, ui_tips.js, ui_icons.js, ui_ads.js (run with node, PLAYWRIGHT=...)
npm run i18n:check    # lists texts still in English when the game runs in Korean
npm run balance       # node tools/balance.js [seed] [years]: yearly economy tables for low/normal/high tax
```

## Layout

| Path | What it holds |
| --- | --- |
| `index.html`, `css/style.css` | Page and styles (Deepward palette) |
| `js/data/config.js` | `VM.CFG`: every balance number |
| `js/sim/rng.js` | Seeded RNG; its state is saved in the game state |
| `js/sim/world.js` | Map, specialties, factions, cities and officers generation |
| `js/sim/economy.js` | Gold, food, population growth, construction |
| `js/sim/commands.js` | `VM.Commands.exec(state, cmd)`: build, setTax, recruit, setGovernor |
| `js/sim/armies.js` | Armies: form, march along roads, disband, supply route |
| `js/sim/war.js` | Battles, sieges, supply and cut-off, morale, abilities, capture, elimination, depots |
| `js/sim/officers.js` | Loyalty, wanderers, governors' policies, armies' standing orders, proposals |
| `js/sim/fog.js` | Optional fog of war: what a house sees, what it remembers |
| `js/sim/ai.js` | AI factions: staffing, recruiting, armies, strike force |
| `js/sim/tick.js` | Fixed-timestep clock, save/load, hash |
| `js/ui/map.js` | Canvas map: territory, roads, nodes, armies, pan/zoom/tap input |
| `js/ui/panels.js` | HUD bar, node and army panels, toasts |
| `js/ui/alerts.js` | Event messages, the feed and auto-pause |
| `js/ui/sheets.js` | Officers roster and alerts sheets |
| `js/ui/audio.js` | WebAudio music and effects |
| `js/ui/tutorial.js` | Guided first scenario |
| `js/i18n.js`, `js/lang_ko.js` | Language layer and the Korean table |
| `js/ads.js`, `js/ads_env.js` | AdMob banner (Android) and its settings |
| `js/view3d/layout.js`, `js/view3d/city3d.js` | The 3D city: layout as data, Three.js renderer |
| `js/data/story.js`, `js/sim/story.js`, `js/ui/story.js` | The campaign: history, houses, fixed map, officers and their ties, beats, endings (English and Korean), and the story pages (`docs/STORY.md`) |
| `js/sim/diplo.js`, `js/ui/diplo.js` | Diplomacy: alliances, breaking pacts, merge offers to weak factions (`docs/DIPLOMACY.md`) |
| `js/ui/icons.js` | The icon set (about 90 inline SVG line icons), icon/stat/meter/pip/portrait helpers and name maps; every panel is built from these (`tools/ui_icons.js`) |
| `js/ui/tips.js` | Hold-to-read tips: any element with `data-tip` shows a short explanation while touched (or hovered); the wordy panel text lives in tips (`tools/ui_tips.js`) |
| `js/view3d/walk.js` | Walk mode: avatar, collisions, officers and townsfolk to talk to (`tools/ui_walk.js`) |
| `js/view3d/terrain.js` | The 3D ground under the strategy map (height field, water, forests, roads, territory texture, camera, projection) |
| `js/view3d/struct_models.js` | Nightfall's textured building models (wall, tent, well, smithy, range, tree, fence, campfire; `tools/extract_structs.js`) |
| `js/view3d/crowd.js`, `js/view3d/crowd_clips.js` | The animated soldiers: simple figures skinned in the shader from a texture of baked clips (`tools/extract_crowd.js` rebuilds the data from Nightfall Settlement) |
| `vendor/three.min.js` | Three.js r128 (MIT) |
| `js/ui/title.js` | Title screen and faction picker |
| `js/main.js` | Boot, shared UI state, main loop, autosave |
| `tools/` | `test.js`, `balance.js`, `econ_bot.js` (economy-only bot), `make_www.js` |

The simulation never touches the DOM, so the same files run in Node and in the browser.
