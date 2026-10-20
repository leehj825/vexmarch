// World generation: a jittered-grid road map of 30 nodes, specialties, factions, cities and officers.
// Everything is drawn from the seeded RNG, so one seed always makes the same world.
var VM = globalThis.VM = globalThis.VM || {};

VM.World = (function () {
  const R = VM.RNG;
  const SYL_A = ['Kal', 'Or', 'Tes', 'Mar', 'Wick', 'Thorn', 'Ash', 'Brin', 'Dun', 'Elm', 'Fen', 'Gal', 'Hal', 'Ir', 'Jor', 'Kes', 'Lor', 'Mor', 'Nar', 'Ost', 'Pel', 'Quor', 'Ras', 'Sol', 'Tav', 'Ul', 'Var', 'Wen', 'Yar', 'Zan'];
  const SYL_B = ['dra', 'sol', 'ven', 'row', 'ford', 'mere', 'wick', 'gate', 'holm', 'reach', 'vale', 'stead', 'crest', 'marsh', 'haven', 'fall', 'wood', 'bury', 'port', 'ton'];
  const GIVEN = ['Aren', 'Bryn', 'Cael', 'Dara', 'Eryk', 'Fenn', 'Gwyn', 'Hale', 'Iska', 'Joren', 'Kira', 'Lund', 'Mira', 'Nox', 'Oren', 'Pyra', 'Quill', 'Rhea', 'Sable', 'Tarn', 'Ulric', 'Vesna', 'Wren', 'Yara', 'Zeph'];
  const FAMILY = ['Ashby', 'Blackthorn', 'Crowe', 'Dunmere', 'Ember', 'Fairwind', 'Greaves', 'Holloway', 'Ironside', 'Kestrel', 'Larch', 'Marrow', 'Northcote', 'Oakhart', 'Pike', 'Rook', 'Stormvale', 'Thistle', 'Vance', 'Wolfe'];

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function connected(n, adj) {
    const seen = new Array(n).fill(false); const q = [0]; seen[0] = true; let c = 1;
    while (q.length) { const u = q.pop(); for (const v of adj[u]) if (!seen[v]) { seen[v] = true; c++; q.push(v); } }
    return c === n;
  }

  function bfsDist(adj, src) {
    const d = new Array(adj.length).fill(Infinity); d[src] = 0; const q = [src];
    for (let i = 0; i < q.length; i++) for (const v of adj[q[i]]) if (d[v] === Infinity) { d[v] = d[q[i]] + 1; q.push(v); }
    return d;
  }

  function uniqueName(state, used, parts) {
    for (let k = 0; k < 200; k++) {
      const nm = parts();
      if (!used[nm]) { used[nm] = true; return nm; }
    }
    return parts() + '-' + used.__n++;
  }

  function buildMap(state) {
    const M = VM.CFG.MAP, cols = M.cols, rows = M.rows, n = cols * rows;
    const cw = M.w / cols, ch = M.h / rows, nodes = [];
    const used = { __n: 1 };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      nodes.push({
        id: r * cols + c, col: c, row: r,
        x: Math.round((c + 0.5) * cw + R.range(state, -M.jitter, M.jitter) * cw),
        y: Math.round((r + 0.5) * ch + R.range(state, -M.jitter, M.jitter) * ch),
        name: uniqueName(state, used, () => R.pick(state, SYL_A) + R.pick(state, SYL_B)),
        adj: []
      });
    }
    let edges = [];
    const id = (c, r) => r * cols + c;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) edges.push([id(c, r), id(c + 1, r)]);
      if (r + 1 < rows) edges.push([id(c, r), id(c, r + 1)]);
      if (c + 1 < cols && r + 1 < rows && R.next(state) < M.diagonalP)   // at most one diagonal per cell, so roads never cross
        edges.push(R.next(state) < 0.5 ? [id(c, r), id(c + 1, r + 1)] : [id(c + 1, r), id(c, r + 1)]);
    }
    const adjOf = (list) => { const a = nodes.map(() => []); for (const [u, v] of list) { a[u].push(v); a[v].push(u); } return a; };
    // Thin the roads out, keeping the map connected, so some nodes become chokepoints.
    const order = R.shuffle(state, edges.map((e, i) => i));
    const removed = {};
    for (const i of order) {
      if (R.next(state) >= M.removeP) continue;
      removed[i] = true;
      const rest = edges.filter((e, k) => !removed[k]);
      const adj = adjOf(rest);
      if (!connected(n, adj) || adj.some(a => a.length < 1)) delete removed[i];
    }
    edges = edges.filter((e, k) => !removed[k]);
    const adj = adjOf(edges);
    nodes.forEach((nd, i) => { nd.adj = adj[i].sort((a, b) => a - b); });
    return { w: M.w, h: M.h, nodes, edges: edges.map(([a, b]) => [a, b, Math.round(dist(nodes[a], nodes[b]))]) };
  }

  function placeCapitals(state, map, count) {
    const adj = map.nodes.map(nd => nd.adj), caps = [R.int(state, map.nodes.length)];
    while (caps.length < count) {
      const ds = caps.map(c => bfsDist(adj, c));
      let best = -1, bestD = -1;
      map.nodes.forEach((nd, i) => {
        if (caps.includes(i)) return;
        const d = Math.min(...ds.map(x => x[i]));
        if (d > bestD) { bestD = d; best = i; }
      });
      caps.push(best);
    }
    return caps;
  }

  function assignSpecialties(state, map, capitals) {
    const spec = new Array(map.nodes.length).fill(null);
    capitals.forEach(c => { spec[c] = 'capital'; });
    const free = () => map.nodes.map(nd => nd.id).filter(i => spec[i] === null);
    const isEdge = nd => nd.col === 0 || nd.row === 0 || nd.col === VM.CFG.MAP.cols - 1 || nd.row === VM.CFG.MAP.rows - 1;
    const pool = [];
    for (const key of Object.keys(VM.CFG.SPEC)) for (let k = 0; k < VM.CFG.SPEC[key].count; k++) pool.push(key);
    // Ports go on the rim of the map; everything else is shuffled over what is left.
    for (let k = 0; k < pool.length; k++) if (pool[k] === 'port') {
      const rim = free().filter(i => isEdge(map.nodes[i]));
      if (rim.length) { spec[R.pick(state, rim)] = 'port'; pool[k] = null; }
    }
    const rest = R.shuffle(state, free());
    const others = pool.filter(Boolean);
    rest.forEach((i, k) => { spec[i] = others[k] || 'town'; });
    return spec;
  }

  function claimTerritory(state, map, capitals) {
    const owner = new Array(map.nodes.length).fill(0);
    const taken = capitals.map(c => [c]);
    capitals.forEach((c, i) => { owner[c] = i + 1; });
    const want = VM.CFG.START_NODES;
    for (let round = 0; round < want - 1; round++) {
      capitals.forEach((c, i) => {
        let frontier = [];
        for (const u of taken[i]) for (const v of map.nodes[u].adj) if (owner[v] === 0 && !frontier.includes(v)) frontier.push(v);
        if (!frontier.length) {            // boxed in by neighbours: take the nearest free node instead
          const ds = taken[i].map(u => bfsDist(map.nodes.map(nd => nd.adj), u));
          let best = Infinity;
          map.nodes.forEach(nd => { if (owner[nd.id] === 0) { const d = Math.min(...ds.map(x => x[nd.id])); if (d < best) { best = d; frontier = [nd.id]; } else if (d === best) frontier.push(nd.id); } });
        }
        frontier.sort((a, b) => a - b);
        if (frontier.length) { const v = frontier[R.int(state, frontier.length)]; owner[v] = i + 1; taken[i].push(v); }
      });
    }
    return owner;
  }

  function makeOfficer(state, id, used, owner, loc) {
    if (!used) { used = { __n: 1 }; state.officers.forEach(o => { used[o.name] = true; }); }
    const stat = () => Math.round(R.range(state, 30, 90));
    return {
      id, name: uniqueName(state, used, () => R.pick(state, GIVEN) + ' ' + R.pick(state, FAMILY)),
      command: stat(), might: stat(), politics: stat(), intellect: stat(),
      trait: R.pick(state, VM.CFG.TRAITS), loyalty: 70, owner, loc, role: 'idle', army: null,
      nextMove: 0, revealed: [], searching: null, travel: null, nextProposal: 0, gift: -1e9, warned: false, idleDays: 0
    };
  }

  function create(opts) {
    opts = opts || {};
    const C = VM.CFG, E = C.ECON, seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
    const nf = Math.max(4, Math.min(6, opts.factions || C.FACTION_COUNT));
    const state = { version: C.VERSION, seed, rng: seed, time: 0, acc: 0, player: Math.max(1, Math.min(nf, opts.player || 1)), factionCount: nf, events: [], armies: [], nextArmy: 1, over: null, proposals: [], nextProposal: 1, nextSpawn: C.OFFICERS.spawnEvery };
    state.map = buildMap(state);
    const capitals = placeCapitals(state, state.map, nf);
    const spec = assignSpecialties(state, state.map, capitals);
    const owner = claimTerritory(state, state.map, capitals);

    state.factions = [{ id: 0, name: C.FACTIONS[0].name, color: C.FACTIONS[0].color, neutral: true, gold: 0, food: 0, capital: -1, alive: true, foodSec: 1, starving: false, broke: false, income: { gold: 0, food: 0 } }];
    capitals.forEach((c, i) => state.factions.push({
      id: i + 1, name: C.FACTIONS[i + 1].name, color: C.FACTIONS[i + 1].color, neutral: false,
      gold: C.START_GOLD, food: C.START_FOOD, capital: c, alive: true, foodSec: 1, starving: false, broke: false, income: { gold: 0, food: 0 }
    }));

    state.cities = state.map.nodes.map((nd, i) => {
      const city = {
        id: i, owner: owner[i], spec: spec[i], pop: 0, tax: 'normal', governor: null, devastation: 0, contested: false,
        buildings: { farm: 0, market: 0, barracks: 0, wall: 0, temple: 0 }, build: null,
        garrison: { infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, wallHp: 0, depot: null, besieged: false, warn: false,
        policy: 'manual', nextThink: 0, stats: null
      };
      if (spec[i] === 'capital') { city.buildings.farm = 1; city.buildings.market = 1; city.buildings.barracks = 1; }
      if (spec[i] === 'farmland') city.buildings.farm = 1;
      if (spec[i] === 'market') city.buildings.market = 1;
      city.pop = Math.round(VM.Eco.cap(city) * E.startPopFrac);
      const garrison = city.owner === 0 ? 0.03 : 0.02;
      city.garrison.infantry = Math.round(city.pop * garrison);
      return city;
    });

    // Officers: a few serve each faction (the best Politics one governs the capital); the rest wander.
    const used = { __n: 1 };
    state.officers = [];
    for (let f = 1; f <= nf; f++) {
      const mine = [];
      for (let k = 0; k < C.OFFICERS_PER_FACTION; k++) {
        const o = makeOfficer(state, state.officers.length, used, f, capitals[f - 1]); state.officers.push(o); mine.push(o);
      }
      mine.sort((a, b) => b.politics - a.politics);
      mine[0].role = 'governor'; state.cities[capitals[f - 1]].governor = mine[0].id;
    }
    while (state.officers.length < C.OFFICER_COUNT) {
      const free = state.cities.filter(c => c.owner === 0).map(c => c.id);
      state.officers.push(makeOfficer(state, state.officers.length, used, 0, R.pick(state, free)));
    }
    VM.Eco.refresh(state);
    return state;
  }

  return { create, connected, bfsDist, makeOfficer, uniqueName };
})();
