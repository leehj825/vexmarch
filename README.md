# Vexmarch

A real-time grand strategy game: 30 nodes, 4 to 6 factions, officers who run your cities, and supply lines that decide wars. Plain JavaScript (no build step, no modules) so it opens from `file://`; Capacitor wraps it for Android (`com.vexmarch.game`).

See `docs/DESIGN.md` and `docs/ROADMAP.md`. **Status: Phase 0 and Phase 1 done** (project setup and the headless simulation). The map view is a placeholder.

## Run

Open `index.html` in a browser. Click a node to inspect it; pause and speed buttons are at the top right.

## Test and balance (Node 18+, no dependencies)

```
npm test              # node tools/test.js: map, determinism, saves, economy, commands
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
| `js/sim/tick.js` | Fixed-timestep clock, save/load, hash |
| `js/main.js` | Browser boot and placeholder map |
| `tools/` | `test.js`, `balance.js`, `econ_bot.js` (economy-only bot), `make_www.js` |

The simulation never touches the DOM, so the same files run in Node and in the browser.
