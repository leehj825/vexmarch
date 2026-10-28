// Fog of war (optional, per game). A faction sees what lies near its own cities and armies and those of its allies. Enemy armies outside that sight cannot be seen,
// and an enemy city out of sight shows what was last seen there. The AI follows the same rules when it picks targets. Territory colours stay common knowledge.
// State: state.fog = { on, day, mem: { faction: { city: { t, owner, troops, pop } } } }, created by setOn(); a game without it has no fog.
var VM = globalThis.VM = globalThis.VM || {};

VM.Fog = (function () {
  const C = () => VM.CFG.FOG;
  const on = state => !!(state.fog && state.fog.on);
  const friend = (state, fid, owner) => owner === fid || VM.Diplo.friendly(state, fid, owner);

  // circles of sight: [x, y, radius] for every city and army of the faction and its ally
  function sources(state, fid) {
    const N = state.map.nodes, out = [];
    for (const c of state.cities) if (c.owner !== 0 && friend(state, fid, c.owner)) out.push([N[c.id].x, N[c.id].y, C().city]);
    for (const a of state.armies) if (a.owner !== 0 && friend(state, fid, a.owner)) { const p = VM.Armies.position(state, a); out.push([p.x, p.y, C().army * (a.troops.cavalry > 0 ? C().cavalry : 1)]); }
    return out;
  }
  const inSight = (src, x, y) => { for (const s of src) { const dx = s[0] - x, dy = s[1] - y; if (dx * dx + dy * dy <= s[2] * s[2]) return true; } return false; };

  // `src` can be passed to ask about many things in one frame
  function seesCity(state, fid, city, src) {
    if (!on(state) || friend(state, fid, city.owner)) return true;
    const n = state.map.nodes[city.id]; return inSight(src || sources(state, fid), n.x, n.y);
  }
  function seesArmy(state, fid, a, src) {
    if (!on(state) || friend(state, fid, a.owner)) return true;
    const p = VM.Armies.position(state, a); return inSight(src || sources(state, fid), p.x, p.y);
  }
  // does the faction know the city at all (has it ever seen it)?
  function known(state, fid, cityId) {
    if (!on(state)) return true;
    const c = state.cities[cityId]; if (friend(state, fid, c.owner)) return true;
    return !!(state.fog.mem[fid] && state.fog.mem[fid][cityId]);
  }
  // what was last seen of a city: { t, owner, troops, pop } or null
  const memory = (state, fid, cityId) => (on(state) && state.fog.mem[fid] && state.fog.mem[fid][cityId]) || null;

  // once a day: write down what each faction sees
  function update(state) {
    if (!on(state)) return;
    const F = state.fog, day = Math.floor(state.time); if (F.day === day) return; F.day = day;
    for (const f of state.factions) {
      if (f.neutral || !f.alive) continue;
      const src = sources(state, f.id), mem = F.mem[f.id] = F.mem[f.id] || {};
      for (const c of state.cities) if (inSight(src, state.map.nodes[c.id].x, state.map.nodes[c.id].y)) mem[c.id] = { t: state.time, owner: c.owner, troops: VM.Eco.troopsOf(c.garrison), pop: c.pop };
    }
  }
  function setOn(state, value) {
    if (!value) { delete state.fog; return; }
    state.fog = { on: true, day: -1, mem: {} }; update(state);
  }

  return { on, sources, seesCity, seesArmy, known, memory, update, setOn };
})();
