# Vexmarch

A real-time grand strategy game: 30 nodes, 4 to 6 factions, officers who run your cities, and supply lines that decide wars. Plain JavaScript (no build step, no modules) so it opens from `file://`; Capacitor wraps it for Android (`com.vexmarch.game`).

See `docs/DESIGN.md` and `docs/ROADMAP.md`. **Status: Phases 0 to 8 done** (the 2D game is complete: economy, war, officers, AI rivals, tutorial, English and Korean, sound, Android wrapper). The 3D city view (View city in the city panel, or double-tap a node) shows buildings, walls, soldiers of every kind and armies marching and fighting outside the gates; walk mode (Phase 9) is next. See `ANDROID.md` for the phone build.

## Run

Open `index.html` in a browser. Press Tutorial on the title screen for a guided first game, or pick a faction and a rival AI level (Easy, Normal, Hard) and press Start. Click a node to manage it (tax, governor, buildings, recruiting, form an army); click an army, then a node, to march. Drag to pan, wheel or pinch to zoom, right-click a node to order a march, Space pauses, 1/2/3 set speed, Esc deselects.

## Test and balance (Node 18+, no dependencies)

```
npm test              # tools/test.js (map, determinism, saves, economy, commands, armies) tools/test_war.js (battles, sieges, supply) and tools/test_officers.js (loyalty, governors, orders, proposals)
npm run tournament   # AI-vs-AI games: node tools/ai_tournament.js [seeds] [years] [levels]
npm run ui:test       # browser smoke test (needs Playwright: PLAYWRIGHT=/path/to/playwright)
npm run ui:test3d     # browser test of the 3D city view (needs Playwright)
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
| `js/view3d/terrain.js` | The 3D ground under the strategy map (height field, water, forests, roads, territory texture, camera, projection) |
| `js/view3d/struct_models.js` | Nightfall's textured building models (wall, tent, well, smithy, range, tree, fence, campfire; `tools/extract_structs.js`) |
| `js/view3d/crowd.js`, `js/view3d/crowd_clips.js` | The animated soldiers: simple figures skinned in the shader from a texture of baked clips (`tools/extract_crowd.js` rebuilds the data from Nightfall Settlement) |
| `vendor/three.min.js` | Three.js r128 (MIT) |
| `js/ui/title.js` | Title screen and faction picker |
| `js/main.js` | Boot, shared UI state, main loop, autosave |
| `tools/` | `test.js`, `balance.js`, `econ_bot.js` (economy-only bot), `make_www.js` |

The simulation never touches the DOM, so the same files run in Node and in the browser.
