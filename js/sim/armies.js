// Armies: formed from a city garrison, led by an officer, marching along roads on the live map.
// Combat and supply cutting arrive in Phase 3; here armies move, cost upkeep and show their supply route.
var VM = globalThis.VM = globalThis.VM || {};

VM.Armies = (function () {
  const cache = new WeakMap();    // map -> road lengths and per-source shortest paths (derived data, never saved)

  function lens(state) {
    let c = cache.get(state.map);
    if (!c) { c = { len: {}, sp: {} }; for (const [a, b, l] of state.map.edges) { c.len[a + '-' + b] = l; c.len[b + '-' + a] = l; } cache.set(state.map, c); }
    return c;
  }
  const roadLen = (state, a, b) => lens(state).len[a + '-' + b];

  function shortest(state, src) {
    const c = lens(state);
    if (c.sp[src]) return c.sp[src];
    const n = state.map.nodes.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
    dist[src] = 0;
    for (let k = 0; k < n; k++) {
      let u = -1; for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity) break;
      done[u] = true;
      for (const v of state.map.nodes[u].adj) { const d = dist[u] + roadLen(state, u, v); if (d < dist[v]) { dist[v] = d; prev[v] = u; } }
    }
    return (c.sp[src] = { dist, prev });
  }

  function path(state, a, b) {
    const { dist, prev } = shortest(state, a);
    if (dist[b] === Infinity) return null;
    const p = [b]; while (p[0] !== a) p.unshift(prev[p[0]]);
    return p;
  }
  const distance = (state, a, b) => shortest(state, a).dist[b];

  function speedOf(army) {
    let s = Infinity;
    for (const k in army.troops) if (army.troops[k] > 0) s = Math.min(s, VM.CFG.TROOPS[k].speed);
    return s === Infinity ? 0 : s;
  }
  const sizeOf = army => army.troops.infantry + army.troops.spear + army.troops.cavalry + army.troops.archer;

  function position(state, army) {
    const N = state.map.nodes;
    if (army.at !== null) return { x: N[army.at].x, y: N[army.at].y };
    const e = army.edge, a = N[e.from], b = N[e.to], t = e.prog / e.len;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function form(state, faction, cityId, officerId) {
    const city = state.cities[cityId], o = state.officers[officerId];
    if (!city || city.owner !== faction) return { ok: false, reason: 'not your city' };
    if (!o || o.owner !== faction) return { ok: false, reason: 'not your officer' };
    if (o.army !== null) return { ok: false, reason: 'officer already leads an army' };
    if (city.governor === o.id) return { ok: false, reason: 'officer is governing; relieve them first' };
    if (o.loc !== cityId) return { ok: false, reason: 'officer is not in this city' };
    if (VM.Eco.troopsOf(city.garrison) <= 0) return { ok: false, reason: 'no troops in the garrison' };
    const army = { id: state.nextArmy++, owner: faction, officer: o.id, troops: Object.assign({}, city.garrison), home: cityId, at: cityId, edge: null, path: [], dest: null };
    for (const k in city.garrison) city.garrison[k] = 0;
    o.army = army.id; o.role = 'commander';
    state.armies.push(army);
    return { ok: true, army: army.id };
  }

  function move(state, army, to) {
    if (!state.cities[to]) return { ok: false, reason: 'no such place' };
    if (army.at !== null) {
      const p = path(state, army.at, to);
      if (!p) return { ok: false, reason: 'no road there' };
      army.path = p.slice(1); army.dest = to;
      return { ok: true };
    }
    const e = army.edge, remain = e.len - e.prog;
    const fwd = remain + distance(state, e.to, to), back = e.prog + distance(state, e.from, to);
    if (back < fwd) army.edge = { from: e.to, to: e.from, prog: e.len - e.prog, len: e.len };   // turn around on the road
    army.path = path(state, army.edge.to, to).slice(1); army.dest = to;
    return { ok: true };
  }

  function stop(state, army) {
    army.path = []; army.dest = army.edge ? army.edge.to : null;
    return { ok: true };
  }

  function disband(state, army) {
    if (army.at === null) return { ok: false, reason: 'army is on the road' };
    const city = state.cities[army.at];
    if (city.owner !== army.owner) return { ok: false, reason: 'only inside your own city' };
    for (const k in army.troops) city.garrison[k] += army.troops[k];
    const o = state.officers[army.officer]; o.army = null; o.role = 'idle'; o.loc = city.id;
    state.armies.splice(state.armies.indexOf(army), 1);
    return { ok: true };
  }

  function step(state, dd) {
    for (const army of state.armies) {
      let left = speedOf(army) * dd, guard = 0;
      while (left > 1e-9 && guard++ < 20) {
        if (army.at !== null) {
          if (!army.path.length) { army.dest = null; break; }
          const next = army.path.shift();
          army.edge = { from: army.at, to: next, prog: 0, len: roadLen(state, army.at, next) }; army.at = null;
        }
        const e = army.edge, take = Math.min(left, e.len - e.prog);
        e.prog += take; left -= take;
        if (e.prog >= e.len - 1e-9) {
          army.at = e.to; army.edge = null; state.officers[army.officer].loc = army.at;
          if (!army.path.length) army.dest = null;
        }
      }
    }
  }

  // Route the army's food would travel from its home city (drawn as the supply line).
  function supplyPath(state, army) {
    const o = army.at !== null ? army.at
      : (distance(state, army.edge.from, army.home) <= distance(state, army.edge.to, army.home) ? army.edge.from : army.edge.to);
    return path(state, o, army.home);
  }

  return { form, move, stop, disband, step, path, distance, position, speedOf, sizeOf, supplyPath, roadLen };
})();
