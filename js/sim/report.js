// Battle reports: a fight is one group of armies that are fighting each other. The group is opened when it starts, its sizes are followed while it lasts,
// and it is closed into a report when nobody in it is fighting any more. Reports are plain data on state.reports (the last 40, saved with the game).
var VM = globalThis.VM = globalThis.VM || {};

VM.Report = (function () {
  const CAP = 40;
  const reps = state => state.reports || (state.reports = []);
  const open = state => state.openBattles || (state.openBattles = []);
  function groups(state) {                                                  // the armies that fight, in groups joined by a fight
    const seen = new Set(), out = [];
    for (const a of state.armies) {
      if (seen.has(a.id) || !a.fighting.length) continue;
      const g = [], q = [a]; seen.add(a.id);
      while (q.length) { const x = q.pop(); g.push(x); for (const id of x.fighting) { const e = state.armies.find(y => y.id === id); if (e && !seen.has(e.id)) { seen.add(e.id); q.push(e); } } }
      out.push(g);
    }
    return out;
  }
  // one day: open new fights, follow the live ones, close the finished ones
  function step(state) {
    const B = open(state), live = groups(state);
    for (const g of live) {
      const ids = g.map(a => a.id).sort((x, y) => x - y), key = ids[0];
      let rec = B.find(r => r.key === key);
      if (!rec) {
        rec = { key, t: state.time, at: VM.Armies.zoneOf(g[0]), army: {} };
        B.push(rec);
      }
      rec.ids = ids; rec.seen = state.time;
      for (const a of g) {
        const o = state.officers[a.officer];
        const cur = rec.army[a.id] || (rec.army[a.id] = { id: a.id, owner: a.owner, officer: o ? o.name : '', start: Math.round(VM.Armies.sizeOf(a)), peak: 0, last: 0, morale0: Math.round(a.morale), routed: false });
        cur.last = Math.round(VM.Armies.sizeOf(a)); cur.routed = cur.routed || !!a.routed;
      }
    }
    for (const rec of B.slice()) {
      const still = rec.ids.filter(id => state.armies.some(a => a.id === id && a.fighting.length));
      if (still.length >= 2 || state.time - rec.seen < 1) continue;          // the fight goes on, or it has just stopped: a routed or broken army may still be caught for a day
      B.splice(B.indexOf(rec), 1);
      for (const id of rec.ids) { const cur = rec.army[id]; if (cur && !state.armies.some(a => a.id === id)) cur.destroyed = true; }
      const sides = Object.values(rec.army);
      if (sides.length < 2) continue;
      const beaten = s => s.destroyed || s.routed || s.last < 0.2 * s.start;     // gone, fled, or down to a fifth of its men
      const alive = sides.filter(s => !beaten(s)), outcome = alive.length === 1 ? 'won' : alive.length === 0 ? 'mutual' : 'broke';
      const winner = outcome === 'won' ? alive[0].owner : null;
      const report = { t: rec.t, end: state.time, at: rec.at, outcome, winner, sides: sides.map(s => ({ owner: s.owner, officer: s.officer, start: s.start, end: s.destroyed ? 0 : s.last, lost: Math.max(0, s.start - (s.destroyed ? 0 : s.last)), destroyed: !!s.destroyed, routed: !!s.routed, morale: s.morale0 })) };
      const R = reps(state); R.push(report); while (R.length > CAP) R.shift();
      VM.Eco.pushEvent(state, { type: 'report', owner: sides[0].owner, report: R.length - 1, winner, at: rec.at, outcome });
    }
  }
  return { step, list: state => reps(state) };
})();
