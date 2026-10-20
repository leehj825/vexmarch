// A rough war bot for tests and balance runs: it keeps the economy going, forms armies and sends them at the weakest nearby enemy city.
// Phase 5 replaces this with the real AI.
const VM = require('./load');
const eco = require('./econ_bot');

function think(state, fid) {
  const f = state.factions[fid]; if (!f.alive) return;
  eco.think(state, fid);
  const mine = state.cities.filter(c => c.owner === fid);
  for (const c of mine) {                                           // keep recruiting a field force
    const want = Math.min(400, Math.round(c.pop * 0.06)), have = VM.Eco.troopsOf(c.garrison);
    const mix = ['infantry', 'spear', 'archer', 'cavalry'][c.id % 4];
    if (have < want && f.gold > 400) VM.Commands.exec(state, { type: 'recruit', faction: fid, city: c.id, troop: mix, count: Math.min(60, want - have) });
    if (have > 200 && f.gold > 800 && c.buildings.wall >= 1 && !(c.garrison.siege > 5)) VM.Commands.exec(state, { type: 'recruit', faction: fid, city: c.id, troop: 'siege', count: 5 });
    const own = state.armies.filter(a => a.owner === fid).length;
    if (have >= 250 && own < 3) {
      const off = state.officers.find(o => o.owner === fid && o.army === null && o.role !== 'governor' && o.loc === c.id);
      if (off) VM.Commands.exec(state, { type: 'formArmy', faction: fid, city: c.id, officer: off.id });
    }
  }
  for (const a of state.armies.filter(x => x.owner === fid)) {
    if (a.routed || a.fighting.length || a.dest !== null) continue;
    if (VM.War.abilityOf(state.officers[a.officer]) === 'rally' && a.morale < 60) VM.Commands.exec(state, { type: 'ability', faction: fid, army: a.id });
    if (a.at === null) continue;
    let best = -1, bs = Infinity;
    for (const c of state.cities) {
      if (c.owner === fid) continue;
      const d = VM.Armies.distance(state, a.at, c.id); if (d === Infinity) continue;
      const score = d + VM.Eco.troopsOf(c.garrison) * 0.8 + c.wallHp * 0.05;
      if (score < bs) { bs = score; best = c.id; }
    }
    if (best >= 0 && VM.Armies.sizeOf(a) > 200) VM.Commands.exec(state, { type: 'moveArmy', faction: fid, army: a.id, to: best });
    else if (a.at !== null && state.cities[a.at].owner === fid && VM.Armies.sizeOf(a) < 150) VM.Commands.exec(state, { type: 'disbandArmy', faction: fid, army: a.id });
  }
  for (const a of state.armies.filter(x => x.owner === fid && x.fighting.length)) VM.Commands.exec(state, { type: 'ability', faction: fid, army: a.id });
}

function run(state, days) {
  const every = 10 / VM.CFG.STEP_DAYS; let n = 0;
  VM.Sim.advance(state, days, () => { if (++n % every === 0) for (const f of state.factions) if (!f.neutral) think(state, f.id); });
}

module.exports = { think, run };
