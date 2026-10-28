// The field battle as data (no DOM, no Three.js, so it runs in Node tests). start() fixes where a battle is watched from; build() describes what is there now:
// the armies of both sides in front of each other, the reserve behind, armies that march in or away at their real place on the map, and the fallen. The view
// (js/view3d/field3d.js) only draws this. The simulation decides every outcome; this never changes it.
var VM = globalThis.VM = globalThis.VM || {};

VM.FieldLayout = (function () {
  const SCALE = 0.35;              // scene units per map unit (the same as the armies marching to a city)
  const NEAR = 70;                 // map units: armies this close to the battle are part of the picture
  const AWAY = 230;                // map units: an army further than this has left the field
  const FRONT = 2.2, GAP = 4, ROW = 1.5, COLW = 1.3;
  const TYPES = ['infantry', 'spear', 'cavalry', 'archer'];
  const W = () => VM.War;

  const posOf = (state, a) => VM.Armies.position(state, a);
  const sees = (state, a) => !VM.Fog || VM.Fog.seesArmy(state, state.player, a);

  // Where to watch from: the army must be fighting right now, and be seen. Returns null when it is not (a battle that is over has no field view).
  function start(state, armyId) {
    const a = state.armies.find(x => x.id === armyId); if (!a || !a.fighting.length || !sees(state, a)) return null;
    const ids = new Set([a.id]), queue = [a];
    while (queue.length) { const x = queue.pop(); for (const id of x.fighting) { const e = state.armies.find(y => y.id === id); if (e && !ids.has(e.id)) { ids.add(e.id); queue.push(e); } } }
    const mem = state.armies.filter(x => ids.has(x.id)), ps = mem.map(x => posOf(state, x));
    const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    // the line between the two sides: from the viewer's side toward the other
    const mine = mem.filter(x => x === a || VM.Diplo.friendly(state, x.owner, a.owner)), foes = mem.filter(x => !mine.includes(x));
    const mean = list => { const p = list.map(x => posOf(state, x)); return { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length }; };
    let dx = 1, dy = 0; if (mine.length && foes.length) { const m = mean(mine), f = mean(foes); dx = f.x - m.x; dy = f.y - m.y; }
    const len = Math.hypot(dx, dy); if (len < 1e-6) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
    const zone = VM.Armies.zoneOf(a);
    return { x: cx, y: cy, ids: [...ids], owner: a.owner, axis: { x: dx, z: dy }, t0: state.time, seenFight: true, memory: {}, overAt: null, zone };
  }

  const mixOf = (a, soldiers) => {                                   // visible soldiers by type, by the largest remainder (as in the city view)
    const tot = TYPES.reduce((n, k) => n + (a.troops[k] || 0), 0) || 1, out = {}; let left = soldiers; const rem = [];
    TYPES.forEach(k => { const x = (a.troops[k] || 0) / tot * soldiers; out[k] = Math.floor(x); left -= out[k]; rem.push([x - out[k], k]); });
    rem.sort((p, q) => q[0] - p[0]).slice(0, left).forEach(([, k]) => { out[k]++; });
    return out;
  };
  const colsOf = soldiers => Math.max(2, Math.ceil(Math.sqrt(soldiers * 1.6)));
  const rowsOf = soldiers => Math.ceil(soldiers / colsOf(soldiers)) + 1;

  function describe(state, a, side) {
    const foot = VM.Armies.sizeOf(a) - (a.troops.siege || 0), soldiers = foot < 0.5 ? 0 : Math.min(120, Math.round(foot)), o = state.officers[a.officer];
    const mode = a.fighting.length ? 'fighting' : a.reserve ? 'reserve' : (a.at === null || a.path.length) ? 'march' : 'camp';
    return { id: a.id, owner: a.owner, color: state.factions[a.owner].color, side, name: o ? o.name : '', size: Math.round(VM.Armies.sizeOf(a)), soldiers, mix: mixOf(a, soldiers),
      siege: Math.min(6, Math.round(a.troops.siege || 0)), fallen: Math.min(30, Math.round(Math.max(0, (a.peak || VM.Armies.sizeOf(a)) - VM.Armies.sizeOf(a)))), morale: Math.round(a.morale),
      routed: !!a.routed, retreating: a.retreat > 0, mode, cavPh: W().cavPhase(state, a), flank: W().flanker(state, a), engaged: a.fighting.slice(), ghost: false };
  }

  function build(state, anchor) {
    const L = { x: anchor.x, y: anchor.y, axis: anchor.axis, scale: SCALE, armies: [], status: 'fighting', result: null, over: false };
    const cx = anchor.x, cy = anchor.y, live = new Map();
    const tracked = new Set(anchor.ids);
    for (const a of state.armies) {                                      // the armies in the picture: the ones that were in the fight and any that come near
      const p = posOf(state, a), d = Math.hypot(p.x - cx, p.y - cy);
      if (!sees(state, a)) continue;
      if (d <= NEAR || (tracked.has(a.id) && d <= AWAY)) { live.set(a.id, a); tracked.add(a.id); }
    }
    anchor.ids = [...tracked];
    const entries = [...live.values()].sort((x, y) => x.id - y.id).map(a => describe(state, a, VM.Diplo.friendly(state, a.owner, anchor.owner) ? 0 : 1));
    // Formation slots: each side's fighting armies stand side by side in front of the other side, the reserve behind them
    const place = side => {
      const row = entries.filter(e => e.side === side && e.mode === 'fighting'), res = entries.filter(e => e.side === side && e.mode === 'reserve');
      const lay = (list, depth0) => {
        const wid = e => colsOf(e.soldiers) * COLW, total = list.reduce((s, e) => s + wid(e), 0) + GAP * Math.max(0, list.length - 1);
        let lat = -total / 2; for (const e of list) { const w = wid(e); e.lat = lat + w / 2; lat += w + GAP; e.depth0 = depth0; }
      };
      lay(row, FRONT);
      const back = row.reduce((m, e) => Math.max(m, rowsOf(e.soldiers) * ROW), 0);
      lay(res, FRONT + back + 8);
    };
    place(0); place(1);
    const ax = anchor.axis;
    for (const e of entries) {
      const a = live.get(e.id), sgn = e.side === 0 ? -1 : 1;
      if (e.mode === 'fighting' || e.mode === 'reserve') {
        e.x = ax.x * sgn * e.depth0 + (-ax.z) * e.lat; e.z = ax.z * sgn * e.depth0 + ax.x * e.lat;
        e.heading = Math.atan2(-sgn * ax.x, -sgn * ax.z);               // toward the other side
      } else {
        const p = posOf(state, a); e.x = (p.x - cx) * SCALE; e.z = (p.y - cy) * SCALE;
        let hx = 0, hz = 0;
        if (e.routed || e.retreating) { hx = e.x; hz = e.z; if (Math.hypot(hx, hz) < 0.5) { hx = -sgn * ax.x; hz = -sgn * ax.z; } }
        else if (a.edge) { const N = state.map.nodes, f = N[a.edge.from], t = N[a.edge.to]; hx = t.x - f.x; hz = t.y - f.y; }
        else { hx = ax.x * -sgn; hz = ax.z * -sgn; }
        e.heading = Math.atan2(hx, hz);
      }
    }
    // armies that have vanished from the world: destroyed in the fight, lying where they stood
    for (const e of entries) anchor.memory[e.id] = { e, mode: e.mode };
    for (const id of Object.keys(anchor.memory)) {
      if (live.has(+id) || state.armies.some(a => a.id === +id)) continue;
      const m = anchor.memory[id]; if (!m.ghost) { m.ghost = true; m.e = Object.assign({}, m.e, { ghost: true, mode: 'fallen', soldiers: 0, fallen: Math.min(40, m.e.soldiers + m.e.fallen), siege: 0, routed: false }); }
      entries.push(m.e);
    }
    L.armies = entries;
    const fighting = entries.some(e => e.mode === 'fighting');
    if (fighting) { anchor.seenFight = true; anchor.overAt = null; }
    else if (anchor.seenFight && anchor.overAt === null) anchor.overAt = state.time;
    L.over = !fighting && anchor.overAt !== null; L.status = L.over ? 'over' : 'fighting';
    if (L.over) {
      const present = entries.filter(e => !e.ghost && !e.routed && !e.retreating && Math.hypot(e.x, e.z) / SCALE <= NEAR);
      L.result = { holders: [...new Set(present.map(e => e.owner))], routed: entries.filter(e => !e.ghost && (e.routed || e.retreating)).map(e => e.owner), destroyed: entries.filter(e => e.ghost).map(e => e.owner), since: anchor.overAt };
    }
    // the place: the nearest city, the ground it stands on, and the road if the fight is on one
    let best = 0, bd = Infinity; for (const c of state.map.nodes) { const d = Math.hypot(c.x - cx, c.y - cy); if (d < bd) { bd = d; best = c.id; } }
    L.near = best; L.nearName = state.map.nodes[best].name; L.spec = state.cities[best].spec;
    const ed = [...live.values()].find(a => a.edge); L.road = ed ? Math.atan2(state.map.nodes[ed.edge.to].x - state.map.nodes[ed.edge.from].x, state.map.nodes[ed.edge.to].y - state.map.nodes[ed.edge.from].y) : null;
    L.seed = Math.round(cx * 7 + cy * 13) >>> 0;
    L.sig = [L.status].concat(entries.map(e => [e.id, e.soldiers, e.fallen, e.mode, e.routed ? 1 : 0, e.ghost ? 1 : 0, e.siege].join(':'))).join('|');
    return L;
  }

  return { start, build, SCALE, NEAR, AWAY, colsOf, rowsOf };
})();
