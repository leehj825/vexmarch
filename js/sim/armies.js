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

  function speedOf(army, state) {
    let s = Infinity;
    for (const k in army.troops) if (army.troops[k] > 0) s = Math.min(s, VM.CFG.TROOPS[k].speed);
    return s === Infinity ? 0 : s * (1 + VM.Story.bonus(state, army.owner, 'speed'));
  }
  const sizeOf = army => { let n = 0; for (const k in army.troops) n += army.troops[k]; return n; };

  function position(state, army) {
    const N = state.map.nodes;
    if (army.at !== null) return { x: N[army.at].x, y: N[army.at].y };
    const e = army.edge, a = N[e.from], b = N[e.to], t = e.prog / e.len;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // The node whose territory the army stands in (the nearer end of the road when it is between nodes).
  function zoneOf(army) { return army.at !== null ? army.at : (army.edge.prog < army.edge.len / 2 ? army.edge.from : army.edge.to); }

  // Puts a new army on the map (used by form() and by scripted scenarios).
  function spawn(state, faction, at, troops, officerId) {
    const o = state.officers[officerId];
    const army = { id: state.nextArmy++, owner: faction, officer: o.id, troops, home: at, at, edge: null, path: [], dest: null,
      morale: 100, rations: 0, fighting: [], routed: false, retreat: 0, buff: null, abilityReady: 0, supply: null,
      order: 'hold', station: null, nextThink: 0, rest: false, peak: 0 };
    army.rationDays = VM.CFG.WAR.rationDays; army.rations = sizeOf(army) * VM.CFG.ECON.foodPerHead * army.rationDays; army.peak = sizeOf(army);
    o.army = army.id; o.role = 'commander'; o.loc = at;
    state.armies.push(army);
    return army;
  }

  // Takes `count` whole soldiers out of a garrison, each kind in proportion to what is there (the rounding leftovers come from the largest kinds); returns what was taken.
  function takeFrom(g, count) {
    const have = VM.Eco.troopsOf(g), out = {}; let want = Math.min(count, Math.floor(have + 1e-9));
    if (want <= 0) return out;
    for (const k in g) { out[k] = Math.min(Math.floor(g[k] + 1e-9), Math.floor(g[k] * want / have + 1e-9)); g[k] -= out[k]; want -= out[k]; }
    for (const k of Object.keys(g).sort((p, q) => g[q] - g[p])) { if (want <= 0) break; const n = Math.min(want, Math.floor(g[k] + 1e-9)); g[k] -= n; out[k] += n; want -= n; }
    return out;
  }

  function form(state, faction, cityId, officerId, keep, pick) {
    const city = state.cities[cityId], o = state.officers[officerId];
    if (!city || city.owner !== faction) return { ok: false, reason: 'not your city' };
    if (!o || o.owner !== faction) return { ok: false, reason: 'not your officer' };
    if (o.army !== null) return { ok: false, reason: 'officer already leads an army' };
    if (city.governor === o.id) return { ok: false, reason: 'officer is governing; relieve them first' };
    if (o.loc !== cityId) return { ok: false, reason: 'officer is not in this city' };
    if (VM.Eco.troopsOf(city.garrison) <= 0) return { ok: false, reason: 'no troops in the garrison' };
    const troops = {};
    if (pick) {                                                         // the player chose how many of each kind to take
      let n = 0;
      for (const k in pick) {
        if (!VM.CFG.TROOPS[k]) return { ok: false, reason: 'unknown troop' };
        const c = Math.floor(+pick[k] || 0); if (c < 0) return { ok: false, reason: 'bad count' };
        if (c > Math.floor(city.garrison[k] + 1e-9)) return { ok: false, reason: 'not that many in the garrison' };
        troops[k] = c; n += c;
      }
      if (n <= 0) return { ok: false, reason: 'choose some troops' };
      for (const k in VM.CFG.TROOPS) { troops[k] = troops[k] || 0; city.garrison[k] = Math.max(0, city.garrison[k] - troops[k]); }
    } else {
      const have = VM.Eco.troopsOf(city.garrison), left = Math.max(0, Math.min(have - 1, Math.ceil(keep || 0))), take = (have - left) / have;
      if (take <= 0) return { ok: false, reason: 'no troops to spare' };
      Object.assign(troops, takeFrom(city.garrison, have - left));
    }
    const army = spawn(state, faction, cityId, troops, o.id);
    return { ok: true, army: army.id };
  }

  // An army marching out from one of its own cities to attack takes extra food along, up to a campaign's worth, out of the faction's stock
  function provision(state, a, to) {
    if (a.at === null || state.cities[a.at].owner !== a.owner || VM.Diplo.friendly(state, a.owner, state.cities[to].owner)) return;
    const W = VM.CFG.WAR, E = VM.CFG.ECON, f = state.factions[a.owner], per = sizeOf(a) * E.foodPerHead, want = per * W.campaignDays - a.rations;
    const take = Math.min(want, Math.max(0, f.food * 0.5)); if (take <= 0) return;
    f.food -= take; a.rations += take; a.rationDays = Math.max(a.rationDays || W.rationDays, a.rations / per);
  }

  function move(state, army, to) {
    if (!state.cities[to]) return { ok: false, reason: 'no such place' };
    if (army.at !== null && !army.routed) provision(state, army, to);
    if (army.routed) return { ok: false, reason: 'the army is routed and fleeing' };
    if (army.fighting.length) { army.morale = Math.max(1, army.morale - 10); army.fighting = []; army.retreat = 2; }   // breaking off a battle costs morale
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
    if (army.fighting.length) return { ok: false, reason: 'army is in battle' };
    const city = state.cities[army.at];
    if (city.owner !== army.owner) return { ok: false, reason: 'only inside your own city' };
    for (const k in army.troops) city.garrison[k] += army.troops[k];
    const o = state.officers[army.officer]; o.army = null; o.role = 'idle'; o.loc = city.id;
    state.armies.splice(state.armies.indexOf(army), 1);
    return { ok: true };
  }

  // Moves troops of one kind between an army standing in its own city and that city's garrison (count > 0 into the army, count < 0 back to the garrison).
  function transfer(state, a, type, count) {
    if (!VM.CFG.TROOPS[type]) return { ok: false, reason: 'unknown troop' };
    if (a.at === null) return { ok: false, reason: 'the army must be in a city' };
    const city = state.cities[a.at];
    if (city.owner !== a.owner) return { ok: false, reason: 'only inside your own city' };
    if (a.fighting.length || a.routed) return { ok: false, reason: 'not while in battle or routed' };
    const size = sizeOf(a), want = Math.trunc(count || 0);
    if (!want) return { ok: false, reason: 'bad count' };
    if (want > 0) {
      const n = Math.min(want, Math.floor(city.garrison[type] + 1e-9)); if (n < 1) return { ok: false, reason: 'none of that kind in the garrison' };
      city.garrison[type] -= n; a.troops[type] = (a.troops[type] || 0) + n;
      a.morale = (a.morale * size + 100 * n) / (size + n);
      a.rations = Math.min((size + n) * VM.CFG.ECON.foodPerHead * (a.rationDays || VM.CFG.WAR.rationDays), a.rations + n * VM.CFG.ECON.foodPerHead * (a.rationDays || VM.CFG.WAR.rationDays));
      a.peak = Math.max(a.peak, size + n);
      return { ok: true, moved: n };
    }
    const n = Math.min(-want, Math.floor((a.troops[type] || 0) + 1e-9)); if (n < 1) return { ok: false, reason: 'none of that kind in the army' };
    if (size - n < 1) return { ok: false, reason: 'the army would be empty: disband it instead' };
    a.troops[type] -= n; city.garrison[type] += n;
    a.rations *= (size - n) / size; a.peak = Math.max(1, a.peak * (size - n) / size);
    return { ok: true, moved: -n };
  }

  // Folds the garrison's spare troops (everything above `keep`) into an army standing in one of its own cities.
  function reinforce(state, a, keep) {
    if (a.at === null) return { ok: false, reason: 'the army must be in a city' };
    const city = state.cities[a.at];
    if (city.owner !== a.owner) return { ok: false, reason: 'only inside your own city' };
    if (a.fighting.length || a.routed) return { ok: false, reason: 'not while in battle or routed' };
    const have = VM.Eco.troopsOf(city.garrison), take = Math.floor(have - Math.max(0, Math.ceil(keep || 0)) + 1e-9);
    if (take < 1) return { ok: false, reason: 'no spare troops' };
    const n0 = sizeOf(a), got = takeFrom(city.garrison, take); for (const k in got) a.troops[k] = (a.troops[k] || 0) + got[k];
    a.morale = (a.morale * n0 + 100 * take) / (n0 + take);
    a.rations = Math.min(sizeOf(a) * VM.CFG.ECON.foodPerHead * (a.rationDays || VM.CFG.WAR.rationDays), a.rations + take * VM.CFG.ECON.foodPerHead * (a.rationDays || VM.CFG.WAR.rationDays));
    a.peak = Math.max(a.peak, sizeOf(a));
    return { ok: true, added: take };
  }

  // Two armies of one faction standing in the same node become one; the better commander leads.
  function merge(state, a, b) {
    if (a === b || a.owner !== b.owner) return { ok: false, reason: 'armies must belong to you' };
    if (a.at === null || a.at !== b.at) return { ok: false, reason: 'armies must be in the same place' };
    if (a.fighting.length || b.fighting.length || a.routed || b.routed) return { ok: false, reason: 'not while in battle or routed' };
    const na = sizeOf(a), nb = sizeOf(b), oa = state.officers[a.officer], ob = state.officers[b.officer];
    for (const k in b.troops) a.troops[k] = (a.troops[k] || 0) + b.troops[k];
    a.morale = (a.morale * na + b.morale * nb) / (na + nb);
    a.rationDays = Math.max(a.rationDays || 0, b.rationDays || 0); a.rations = Math.min(a.rations + b.rations, sizeOf(a) * VM.CFG.ECON.foodPerHead * a.rationDays);
    a.peak = Math.max(a.peak, sizeOf(a));
    if (ob.command > oa.command) { oa.army = null; oa.role = 'idle'; oa.loc = a.at; ob.army = a.id; a.officer = ob.id; } else { ob.army = null; ob.role = 'idle'; ob.loc = a.at; }
    state.armies.splice(state.armies.indexOf(b), 1);
    return { ok: true };
  }

  // An army on its way through a city of another faction (or a free one) stops and lays siege to it. Routed or retreating armies are only running home.
  const blockedBy = (state, army) => !army.routed && army.retreat <= 0 && VM.Diplo.hostile(state, army.owner, state.cities[army.at].owner);

  function step(state, dd) {
    for (const army of state.armies) {
      if (army.fighting.length) continue;                 // locked in battle
      let left = speedOf(army, state) * dd * (army.routed ? VM.CFG.WAR.routSpeed : 1), guard = 0;
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
          else if (blockedBy(state, army)) {                  // a city that is not yours stands in the way: it has to be fought, not walked past
            army.path = []; army.dest = null;
            VM.Eco.pushEvent(state, { type: 'blocked', owner: army.owner, army: army.id, at: army.at, city: army.at });
          }
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

  return { form, spawn, merge, reinforce, transfer, move, stop, disband, step, zoneOf, path, distance, position, speedOf, sizeOf, supplyPath, roadLen };
})();
