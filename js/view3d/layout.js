// The 3D city as data. VM.CityLayout.build(state, cityId) turns a city's state into a description of what to show: walls and their damage,
// houses (decorative: their number follows the population, never the buildings), fields, market stalls, barracks, temple, depot, garrison,
// and armies in or around the city. It is pure (no THREE, no DOM), so it can be tested in Node; js/view3d/city3d.js turns it into meshes.
// Scene axes: the keep is at the origin, x east and z south (the same directions as the map's x and y). Angles are atan2(z, x).
var VM = globalThis.VM = globalThis.VM || {};

VM.CityLayout = (function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const RADIUS = { hamlet: 11, town: 13, city: 15, capital: 18 };
  const WALL_SEGMENTS = 32;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const norm = a => { a %= TAU; return a < 0 ? a + TAU : a; };
  const angDiff = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return Math.min(d, TAU - d); };
  const bearing = (state, from, to) => { const A = state.map.nodes[from], B = state.map.nodes[to]; return Math.atan2(B.y - A.y, B.x - A.x); };
  const pol = (r, a) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r });

  function tierOf(city, cap) { return city.spec === 'capital' ? 'capital' : (cap >= 8000 ? 'city' : (cap >= 5200 ? 'town' : 'hamlet')); }

  // Up to three gates, one toward each of the most spread-out roads.
  function gatesOf(state, id) {
    const adj = state.map.nodes[id].adj.map(n => ({ toward: n, angle: bearing(state, id, n) }));
    if (adj.length <= 3) return adj.sort((a, b) => a.angle - b.angle);
    const pick = [adj.reduce((a, b) => (b.toward < a.toward ? b : a), adj[0])];
    while (pick.length < 3) {
      let best = null, bd = -1;
      for (const g of adj) { if (pick.includes(g)) continue; const d = Math.min(...pick.map(p => angDiff(p.angle, g.angle))); if (d > bd) { bd = d; best = g; } }
      pick.push(best);
    }
    return pick.sort((a, b) => a.angle - b.angle);
  }

  function build(state, id) {
    const city = state.cities[id], node = state.map.nodes[id], E = VM.Eco, W = VM.War;
    const cap = E.cap(city), tier = tierOf(city, cap), R = RADIUS[tier], r0 = rng(state.seed * 131 + id * 977 + 17);
    const owner = state.factions[city.owner], gates = gatesOf(state, id), main = gates[0].angle;
    const L = {
      id, name: node.name, spec: city.spec, tier, radius: R, owner: city.owner, color: owner.color, besieged: !!city.besieged, contested: !!city.contested,
      gates, roads: gates.map(g => ({ angle: g.angle, toward: g.toward })), mainGate: main
    };

    // Armies at this node, and which way hostile ones came from
    const armies = [];
    for (const a of state.armies) {
      if (a.at !== id) continue;
      const hostile = a.owner !== city.owner, size = VM.Armies.sizeOf(a);
      let ang = main;
      if (hostile) {
        const home = W.nearestOwnCity(state, id, a.owner, id), path = home >= 0 ? VM.Armies.path(state, id, home) : null;
        if (path && path.length > 1) ang = bearing(state, id, path[1]);
      } else {
        const home = a.home !== id ? a.home : -1, path = home >= 0 ? VM.Armies.path(state, id, home) : null;
        if (path && path.length > 1) ang = bearing(state, id, path[1]);
      }
      armies.push({ id: a.id, owner: a.owner, color: state.factions[a.owner].color, hostile, angle: ang, size, soldiers: clamp(Math.round(size / 12), 3, 60), siege: Math.min(6, Math.round(a.troops.siege || 0)),
        mode: a.fighting.length ? 'fighting' : (hostile && W.sieging(a) ? 'besieging' : 'camp'), routed: a.routed });
    }
    L.armies = armies;
    const attackers = armies.filter(a => a.hostile).map(a => a.angle);

    // Wall
    const wlvl = city.buildings.wall, wmax = W.wallMax(city), hpFrac = wmax > 0 ? clamp(city.wallHp / wmax, 0, 1) : 1;
    const N = WALL_SEGMENTS, seg = [];
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) * TAU / N, gate = gates.some(g => angDiff(g.angle, a) < TAU / N * 1.1);
      seg.push({ angle: a, gate, damage: 0 });
    }
    if (wlvl > 0) {
      const order = seg.filter(s => !s.gate).sort((p, q) => {
        const ref = attackers.length ? attackers : gates.map(g => g.angle);
        return Math.min(...ref.map(a => angDiff(a, p.angle))) - Math.min(...ref.map(a => angDiff(a, q.angle))) || p.angle - q.angle;
      });
      const hurt = Math.round((1 - hpFrac) * order.length * 0.6), breach = city.wallHp <= 0 && city.besieged ? 4 : 0;
      order.forEach((s, i) => { if (i < breach) s.damage = 2; else if (i < hurt) s.damage = 1; });
    }
    L.wall = { level: wlvl, radius: R, hpFrac, segments: seg,
      towers: wlvl >= 2 ? seg.map((s, i) => i % 4 === 0 ? s.angle : null).filter(a => a !== null).concat(gates.flatMap(g => [g.angle - TAU / N * 1.6, g.angle + TAU / N * 1.6])) : gates.flatMap(g => [g.angle - TAU / N * 1.6, g.angle + TAU / N * 1.6]) };
    if (wlvl === 0) L.wall.towers = [];

    // Fixed sites for the buildings that have levels
    const sites = {
      market: { angle: main, r: R * 0.62 },
      barracks: { angle: main + Math.PI, r: R * 0.55 },
      temple: { angle: main + Math.PI / 2, r: R * 0.55 },
      depot: { angle: main - 0.5, r: R * 0.82 }
    };
    for (const k in sites) Object.assign(sites[k], pol(sites[k].r, sites[k].angle));
    const obstacles = [{ x: 0, z: 0, r: 6.5 }];                                    // the keep
    const take = (x, z, r) => obstacles.push({ x, z, r });

    // Market stalls
    const mlvl = city.buildings.market, palette = ['#e0483a', '#5aa0d8', '#f2d27a', '#8fbf4a', '#a070c8', '#e08a3a'];
    L.stalls = [];
    for (let i = 0; i < Math.min(8, mlvl * 2 + 1); i++) {
      const a = main + (i - 3) * 0.18, r = R * (0.48 + (i % 2) * 0.16), p = pol(r, a);
      L.stalls.push({ x: p.x, z: p.z, rot: a, color: palette[i % palette.length] }); take(p.x, p.z, 1.6);
    }
    // Barracks: a hall, tents and dummies as it grows
    const blvl = city.buildings.barracks;
    L.barracks = { level: blvl, x: sites.barracks.x, z: sites.barracks.z, rot: sites.barracks.angle, tents: [], dummies: [] };
    if (blvl >= 1) take(sites.barracks.x, sites.barracks.z, 3.6);
    for (let i = 0; i < (blvl >= 2 ? 3 : 0); i++) { const p = pol(R * 0.72, sites.barracks.angle + (i - 1) * 0.32); L.barracks.tents.push({ x: p.x, z: p.z, rot: p.x }); take(p.x, p.z, 1.8); }
    for (let i = 0; i < (blvl >= 2 ? 2 : 0); i++) { const p = pol(R * 0.38, sites.barracks.angle + (i - 0.5) * 0.4); L.barracks.dummies.push({ x: p.x, z: p.z }); take(p.x, p.z, 1); }
    // Temple
    L.temple = { level: city.buildings.temple, x: sites.temple.x, z: sites.temple.z, rot: sites.temple.angle };
    if (L.temple.level >= 1) take(sites.temple.x, sites.temple.z, 2.6);
    // Depot
    L.depot = city.depot ? { x: sites.depot.x, z: sites.depot.z, crates: clamp(Math.ceil(city.depot.food / 400), 1, 8) } : null;
    if (L.depot) take(sites.depot.x, sites.depot.z, 2);

    // Houses: decorative, as many as the people need, packed where nothing else stands
    const wanted = clamp(Math.round(city.pop / 220), 4, 48);
    L.houses = [];
    for (let tries = 0; tries < 900 && L.houses.length < wanted; tries++) {
      const a = r0() * TAU, rr = 7.5 + Math.sqrt(r0()) * (R - 9.5), p = pol(rr, a);
      if (gates.some(g => angDiff(g.angle, a) < 0.2 && rr > 5)) continue;           // leave the road into each gate clear
      if (obstacles.some(o => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 1.6)) continue;
      if (L.houses.some(h => Math.hypot(h.x - p.x, h.z - p.z) < 2.9)) continue;
      L.houses.push({ x: p.x, z: p.z, rot: a + (r0() - 0.5) * 0.6, w: 1.6 + r0() * 0.8, d: 1.6 + r0() * 0.8, h: 1.1 + r0() * 0.7, roof: Math.floor(r0() * 3), chimney: r0() < 0.4 });
    }
    L.housesWanted = wanted;

    if (city.spec === 'port') { const a = main + Math.PI * 0.9; L.water = { angle: a, r: R + 38, radius: 26 }; }
    const dry = a => !L.water || angDiff(a, L.water.angle) > 0.85;

    // Fields and farmhouses outside the walls
    const flvl = city.buildings.farm, nf = Math.min(14, flvl * 3 + (city.spec === 'farmland' ? 3 : 0) + 1);
    L.fields = []; L.farmhouses = [];
    for (let tries = 0; tries < 400 && L.fields.length < nf; tries++) {
      const a = r0() * TAU, rr = R + 7 + r0() * 16, p = pol(rr, a);
      if (gates.some(g => angDiff(g.angle, a) < 0.3) || !dry(a)) continue;
      if (attackers.some(t => angDiff(t, a) < 0.55)) continue;
      if (L.fields.some(f => Math.hypot(f.x - p.x, f.z - p.z) < 8)) continue;
      L.fields.push({ x: p.x, z: p.z, rot: a + Math.PI / 2, w: 7, d: 5, crop: r0() < 0.5 ? 0 : 1 });
    }
    for (let i = 0; i < Math.min(L.fields.length, Math.ceil(flvl / 2)); i++) { const f = L.fields[i], p = pol(Math.hypot(f.x, f.z) + 5, Math.atan2(f.z, f.x)); L.farmhouses.push({ x: p.x, z: p.z, rot: Math.atan2(f.z, f.x) }); }

    // Terrain features that say what the place is known for
    L.features = [];
    const free = angle => !gates.some(g => angDiff(g.angle, angle) < 0.45) && !attackers.some(t => angDiff(t, angle) < 0.6) && dry(angle);
    const ring = (kind, n, rMin, rMax, size) => { for (let t = 0, c = 0; t < 200 && c < n; t++) { const a = r0() * TAU; if (!free(a)) continue; const p = pol(rMin + r0() * (rMax - rMin), a); L.features.push({ kind, x: p.x, z: p.z, rot: r0() * TAU, size: size * (0.7 + r0() * 0.6) }); c++; } };
    if (city.spec === 'pass') ring('rock', 11, R + 6, R + 28, 5);
    if (city.spec === 'iron') { ring('rock', 6, R + 8, R + 26, 3.5); ring('ore', 5, R + 6, R + 20, 1.4); }
    if (city.spec === 'horse') ring('paddock', 3, R + 8, R + 20, 6);
    if (city.spec === 'holy') ring('stones', 1, 7, 8, 3);
    if (city.spec === 'market') ring('banner', 4, R * 0.3, R * 0.7, 1);
    ring('tree', 16, R + 5, R + 34, 2.2);
    if (tier === 'hamlet' || tier === 'town') L.features.push({ kind: 'well', x: 3.2, z: 3.2, rot: 0, size: 1 });

    // Scaffolding where something is being built
    L.construction = null;
    if (city.build) {
      const t = city.build.type, prog = 1 - city.build.left / Math.max(1, city.build.total);
      const at = t === 'market' ? sites.market : t === 'barracks' ? sites.barracks : t === 'temple' ? sites.temple : t === 'farm' && L.fields[0] ? L.fields[0] : t === 'wall' ? pol(R, main + Math.PI * 0.5) : sites.depot;
      L.construction = { type: t, x: at.x, z: at.z, progress: clamp(prog, 0, 1) };
    }

    // Garrison on the wall (or around the keep without one)
    const gtotal = E.troopsOf(city.garrison);
    L.garrison = { total: gtotal, visible: clamp(Math.round(gtotal / 14), gtotal > 0 ? 1 : 0, 36), onWall: wlvl > 0 };
    L.sig = [id, city.owner, tier, wlvl, Math.round(hpFrac * 8), seg.map(s => s.damage).join(''), L.houses.length, L.fields.length, L.stalls.length, blvl, L.temple.level, L.depot ? L.depot.crates : 0,
      L.construction ? L.construction.type + Math.floor(L.construction.progress * 5) : '-', L.garrison.visible, armies.map(a => [a.id, a.soldiers, a.siege, a.mode, Math.round(a.angle * 10)].join(':')).join('|'), city.besieged ? 1 : 0].join('/');
    return L;
  }

  return { build, tierOf, RADIUS, bearing, angDiff, rng, WALL_SEGMENTS };
})();
