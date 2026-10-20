# Vexmarch

A real-time grand strategy game: 30 nodes, 4 to 6 factions, officers who run your cities, and supply lines that decide wars. Plain JavaScript (no build step, no modules) so it opens from `file://`; Capacitor wraps it for Android (`com.vexmarch.game`).

See `docs/DESIGN.md` and `docs/ROADMAP.md`. **Status: Phases 0 to 4 done** (setup, simulation, map view, war and logistics, officers and delegation). The AI factions are next.

## Run

Open `index.html` in a browser. Pick a faction on the title screen. Click a node to manage it (tax, governor, buildings, recruiting, form an army); click an army, then a node, to march. Drag to pan, wheel or pinch to zoom, right-click a node to order a march, Space pauses, 1/2/3 set speed, Esc deselects.

## Test and balance (Node 18+, no dependencies)

```
npm test              # tools/test.js (map, determinism, saves, economy, commands, armies) tools/test_war.js (battles, sieges, supply) and tools/test_officers.js (loyalty, governors, orders, proposals)
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
| `js/sim/tick.js` | Fixed-timestep clock, save/load, hash |
| `js/ui/map.js` | Canvas map: territory, roads, nodes, armies, pan/zoom/tap input |
| `js/ui/panels.js` | HUD bar, node and army panels, toasts |
| `js/ui/alerts.js` | Event messages, the feed and auto-pause |
| `js/ui/sheets.js` | Officers roster and alerts sheets |
| `js/ui/title.js` | Title screen and faction picker |
| `js/main.js` | Boot, shared UI state, main loop, autosave |
| `tools/` | `test.js`, `balance.js`, `econ_bot.js` (economy-only bot), `make_www.js` |

The simulation never touches the DOM, so the same files run in Node and in the browser.
