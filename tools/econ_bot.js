// A simple economy-only bot used by the balance script and tests. Not the real AI (that is Phase 5).
// Every few days it keeps food ahead of population, builds, holds a small garrison and sets taxes.
const VM = require('./load');

const PRIORITY = ['farm', 'market', 'temple', 'barracks', 'wall'];

function think(state, fid, opts) {
  opts = opts || {};
  const f = state.factions[fid], tax = opts.tax || null;
  const cities = state.cities.filter(c => c.owner === fid);
  for (const city of cities) {
    if (tax) VM.Commands.exec(state, { type: 'setTax', faction: fid, city: city.id, tax });
    const st = city.stats;
    if (!city.build) {
      const wantFarm = st.foodProd < st.foodCons * 1.15 && city.buildings.farm < 3;
      const order = wantFarm ? ['farm'] : PRIORITY.filter(b => b !== 'wall' || city.buildings.wall < 1);
      for (const type of order) {
        if (city.buildings[type] >= VM.CFG.MAX_BUILD_LEVEL) continue;
        const cost = VM.CFG.BUILD[type].cost[city.buildings[type]];
        if (f.gold >= cost + (opts.reserve || 150)) { VM.Commands.exec(state, { type: 'build', faction: fid, city: city.id, building: type }); break; }
      }
    }
    const want = Math.round(city.pop * VM.CFG.ECON.garrisonRatio);
    const have = VM.Eco.troopsOf(city.garrison);
    if (have < want && f.gold > 200) VM.Commands.exec(state, { type: 'recruit', faction: fid, city: city.id, troop: 'infantry', count: Math.min(want - have, 50) });
  }
}

// Run `days` days with the bot acting every 5 days on every faction listed.
function run(state, days, opts) {
  opts = opts || {};
  const ids = opts.factions || state.factions.filter(f => !f.neutral).map(f => f.id);
  const every = 5 / VM.CFG.STEP_DAYS; let n = 0;
  VM.Sim.advance(state, days, () => { if (++n % every === 0) for (const id of ids) think(state, id, opts); });
}

module.exports = { think, run };
