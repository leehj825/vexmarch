// The 3D city as data. VM.CityLayout.build(state, cityId) turns a city's state into a description of what to show: walls and their damage,
// houses (decorative: their number follows the population, never the buildings), fields, market stalls, barracks, temple, depot, garrison,
// and armies in or around the city. It is pure (no THREE, no DOM), so it can be tested in Node; js/view3d/city3d.js turns it into meshes.
// Scene axes: the keep is at the origin, x east and z south (the same directions as the map's x and y). Angles are atan2(z, x).
var VM = globalThis.VM = globalThis.VM || {};

VM.CityLayout = (function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const RADIUS = { hamlet: 18, town: 21, city: 24, capital: 29 };
  const WALL_SEGMENTS = 32;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const norm = a => { a %= TAU; return a < 0 ? a + TAU : a; };
  const angDiff = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return Math.min(d, TAU - d); };
  const bearing = (state, from, to) => { const A = state.map.nodes[from], B = state.map.nodes[to]; return Math.atan2(B.y - A.y, B.x - A.x); };
  const pol = (r, a) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r });

  // The size of a place depends only on what it is (its specialty), never on its buildings or people, so the picture does not jump as the game goes on.
  const baseCapOf = city => VM.CFG.ECON.baseCap * VM.CFG.SPEC[city.spec].cap;
  function tierOf(city) { const c = baseCapOf(city); return city.spec === 'capital' ? 'capital' : (c >= 6000 ? 'city' : (c >= 4800 ? 'town' : 'hamlet')); }

  // How far a place has grown, from its people: 1 a village of tents and huts, 2 a town of timber houses around a plaza, 3 a city with stone houses and
  // a suburb along the roads, 4 a great city with a monument and a wide suburb.
  const stageOf = city => city.pop < 2500 ? 1 : city.pop < 4000 ? 2 : city.pop < 6500 ? 3 : 4;

  // One gate and one road for every road on the map, each facing the neighbouring node it leads to, so the city agrees with the map.
  function gatesOf(state, id) {
    return state.map.nodes[id].adj.map(n => ({ toward: n, angle: bearing(state, id, n) })).sort((a, b) => a.angle - b.angle);
  }

  function build(state, id) {
    const city = state.cities[id], node = state.map.nodes[id], E = VM.Eco, W = VM.War;
    const tier = tierOf(city), R = RADIUS[tier], base = state.seed * 131 + id * 977 + 17, rH = rng(base), rF = rng(base + 101), rX = rng(base + 202);   // separate streams: houses, fields and scenery never disturb each other
    const owner = state.factions[city.owner], gates = gatesOf(state, id), main = gates[0].angle;
    const L = {
      id, name: node.name, spec: city.spec, tier, radius: R, owner: city.owner, color: owner.color, besieged: !!city.besieged, contested: !!city.contested,
      gates, roads: gates.map(g => ({ angle: g.angle, toward: g.toward })), mainGate: main
    };

    // Armies at this node, and armies marching on the roads into or out of it
    const armies = [], ROAD = 140, SCALE = 0.35;
    const mixOf = (a, soldiers) => {                               // visible soldiers by type, by the largest remainder
      const keys = ['infantry', 'spear', 'cavalry', 'archer'], tot = keys.reduce((n, k) => n + (a.troops[k] || 0), 0) || 1, out = {};
      let left = soldiers; const rem = [];
      keys.forEach(k => { const x = (a.troops[k] || 0) / tot * soldiers; out[k] = Math.floor(x); left -= out[k]; rem.push([x - out[k], k]); });
      rem.sort((p, q) => q[0] - p[0]).slice(0, left).forEach(([, k]) => { out[k]++; });
      return out;
    };
    for (const a of state.armies) {
      const atNode = a.at === id, onRoad = !atNode && a.edge && (a.edge.to === id || a.edge.from === id);
      if (!atNode && !onRoad) continue;
      const hostile = a.owner !== city.owner, size = VM.Armies.sizeOf(a);
      let ang = main, d, moving = null;
      if (atNode) {
        if (hostile) {
          const home = W.nearestOwnCity(state, id, a.owner, id), path = home >= 0 ? VM.Armies.path(state, id, home) : null;
          if (path && path.length > 1) ang = bearing(state, id, path[1]);
        } else {
          const home = a.home !== id ? a.home : -1, path = home >= 0 ? VM.Armies.path(state, id, home) : null;
          if (path && path.length > 1) ang = bearing(state, id, path[1]);
        }
        d = hostile ? R + 17 : R + 10;
      } else {
        const e = a.edge, incoming = e.to === id, remaining = incoming ? e.len - e.prog : e.prog;
        if (remaining > ROAD) continue;
        ang = bearing(state, id, incoming ? e.from : e.to); moving = incoming ? 'in' : 'out';
        d = R + 14 + remaining * SCALE;
      }
      const foot = size - (a.troops.siege || 0), soldiers = foot < 1 ? 0 : clamp(Math.round(foot / 12), 3, 60);
      armies.push({ id: a.id, owner: a.owner, color: state.factions[a.owner].color, hostile, angle: ang, d, size, soldiers, mix: mixOf(a, soldiers), siege: Math.min(6, Math.round(a.troops.siege || 0)),
        fallen: Math.min(24, Math.round(Math.max(0, (a.peak || size) - size) / 15)), moving,
        mode: a.fighting.length ? 'fighting' : (moving ? 'march' : (hostile && W.sieging(a) ? 'besieging' : 'camp')), routed: a.routed, engaged: a.fighting.slice() });
    }
    // Armies in battle meet: a defender fighting an attacker stands in the attacker's line, facing it
    for (const A of armies) if (A.mode === 'fighting' && !A.hostile) {
      const foe = armies.find(x => x.hostile && x.mode === 'fighting' && (A.engaged.includes(x.id) || x.engaged.includes(A.id)));
      if (foe) { A.angle = foe.angle; A.d = foe.d - 2.2; A.clash = true; foe.clash = true; }          // the front lines face each other; each army's ranks stand behind its front line
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
    // Armies laying siege assault the city: with the wall standing they storm it with ladders; with no wall or a breached one they pour in
    for (const A of armies) { A.assault = A.hostile && A.mode === 'besieging'; A.breach = A.assault && (wlvl === 0 || city.wallHp <= 0); }
    L.assault = armies.some(a => a.assault); L.owner = city.owner; L.ownerName = owner.name;

    // Fixed sites for the buildings that have levels
    const sites = {
      market: { angle: main, r: R * 0.62 },
      barracks: { angle: main + Math.PI, r: R * 0.55 },
      temple: { angle: main + Math.PI / 2, r: R * 0.55 },
      depot: { angle: main - 0.5, r: R * 0.82 },
      smith: { angle: main - Math.PI / 2, r: R * 0.55 }
    };
    for (const k in sites) Object.assign(sites[k], pol(sites[k].r, sites[k].angle));
    const obstacles = [{ x: 0, z: 0, r: 6.5 }];                                    // the keep
    const take = (x, z, r) => obstacles.push({ x, z, r });

    // Every possible building site is reserved from the start (whatever the current levels), so nothing already standing ever has to move
    const mlvl = city.buildings.market, palette = ['#e0483a', '#5aa0d8', '#f2d27a', '#8fbf4a', '#a070c8', '#e08a3a'];
    const allStalls = [];
    for (let i = 0; i < 7; i++) {                                                  // seven stalls at most (market level 3)
      const a = main + (i - 3) * 0.18, r = R * (0.48 + (i % 2) * 0.16), p = pol(r, a);
      allStalls.push({ x: p.x, z: p.z, rot: a, color: palette[i % palette.length] }); take(p.x, p.z, 1.3);
    }
    L.stalls = allStalls.slice(0, Math.min(8, mlvl * 2 + 1));
    const blvl = city.buildings.barracks;
    L.barracks = { level: blvl, x: sites.barracks.x, z: sites.barracks.z, rot: sites.barracks.angle, tents: [], dummies: [] };
    take(sites.barracks.x, sites.barracks.z, 3.6);
    for (let i = 0; i < 3; i++) { const p = pol(R * 0.72, sites.barracks.angle + (i - 1) * 0.32); if (blvl >= 2) L.barracks.tents.push({ x: p.x, z: p.z, rot: p.x }); take(p.x, p.z, 1.8); }
    for (let i = 0; i < 2; i++) { const p = pol(R * 0.38, sites.barracks.angle + (i - 0.5) * 0.4); if (blvl >= 2) L.barracks.dummies.push({ x: p.x, z: p.z }); take(p.x, p.z, 1); }
    L.temple = { level: city.buildings.temple, x: sites.temple.x, z: sites.temple.z, rot: sites.temple.angle };
    take(sites.temple.x, sites.temple.z, 2.6);
    L.depot = city.depot ? { x: sites.depot.x, z: sites.depot.z, crates: clamp(Math.ceil(city.depot.food / 400), 1, 8) } : null;
    take(sites.depot.x, sites.depot.z, 2);
    L.smith = { on: city.spec === 'iron' || blvl >= 3 || tier === 'city' || tier === 'capital', x: sites.smith.x, z: sites.smith.z, rot: sites.smith.angle };      // a smithy where iron is worked or the army is strong
    take(sites.smith.x, sites.smith.z, tier === "hamlet" ? 2.2 : 3.2);

    // Houses: decorative, as many as the people need. The candidate spots come from a fixed sequence and only the first `wanted` are used, so a growing town
    // adds houses without moving the old ones.
    if (city.spec === 'port') { const a = main + Math.PI * 0.9; L.water = { angle: a, r: R + 38, radius: 26 }; }
    const dry = a => !L.water || angDiff(a, L.water.angle) > 0.85;
    const stage = stageOf(city), wanted = clamp(Math.round(city.pop / 220), 4, 48), spots = [], dirs = gates.map(g => ({ x: Math.cos(g.angle), z: Math.sin(g.angle) }));
    L.stage = stage; L.paved = stage >= 3;
    const onRoad = (p, half) => dirs.some(d => { const t = p.x * d.x + p.z * d.z; return t > -2 && Math.abs(p.x * d.z - p.z * d.x) < half; });            // inside the strip of street that runs from a gate to the keep
    // The plaza round the keep, with a well and, in a great city, a monument; the sites of the works outside the walls and the suburb along the roads are reserved too
    const wp = pol(R * 0.56 + 2, main - 0.55); L.well = { x: wp.x, z: wp.z }; take(wp.x, wp.z, 1.6);
    L.plaza = stage >= 2 ? { r: 9 + stage } : null;
    if (stage >= 4) { const mp = pol(R * 0.56 + 2, main + 0.55); L.monument = { x: mp.x, z: mp.z }; take(mp.x, mp.z, 1.8); } else L.monument = null;
    const freeAngle = a => { for (let k = 0; k < 24; k++) { if (!gates.some(g => angDiff(g.angle, a) < 0.42)) return a; a += 0.3; } return a; };
    L.works = [];
    const work = (kind, a, r, size) => { const aa = freeAngle(a), p = pol(r, aa); take(p.x, p.z, size); return { kind, x: p.x, z: p.z, rot: aa }; };
    const wk = { windmill: work('windmill', main + 2.0, R + 12, 5), lumber: work('lumber', main + 3.7, R + 11, 5), quarry: work('quarry', main + 5.0, R + 12, 5) };
    if (city.buildings.farm >= 3) L.works.push(wk.windmill);
    if (stage >= 2) L.works.push(wk.lumber);
    if (city.spec === 'iron' || city.spec === 'pass') L.works.push(wk.quarry);
    const sub = [];                                                                // the suburb: houses either side of each road, just outside the gate
    for (let k = 0; k < 7; k++) gates.forEach((g, gi) => {
      const side = (k + gi) % 2 ? 1 : -1, t = R + 4.5 + Math.floor(k / 2) * 4.2, lat = side * (4.4 + (k % 3) * 0.7), d = dirs[gi], p = { x: d.x * t - d.z * lat, z: d.z * t + d.x * lat };
      if (!dry(Math.atan2(p.z, p.x))) return;
      sub.push({ x: p.x, z: p.z, rot: Math.atan2(d.z, d.x) + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (k % 2 ? 0.12 : -0.1), w: 1.8 + (k % 3) * 0.25, d: 1.8 + ((k + 1) % 3) * 0.25, h: 1.2 + (k % 2) * 0.4, roof: (k + gi) % 3, chimney: k % 3 === 0 });
    });
    for (const q of sub) take(q.x, q.z, 2.4);
    L.suburb = sub.slice(0, stage >= 4 ? 16 : stage >= 3 ? 7 : 0);
    for (let tries = 0; tries < 2500 && spots.length < 48; tries++) {
      const a = rH() * TAU, rr = 8.5 + Math.sqrt(rH()) * (R - 11), p = pol(rr, a);
      const rot = a + (rH() - 0.5) * 0.6, w = 1.6 + rH() * 0.8, d = 1.6 + rH() * 0.8, h = 1.1 + rH() * 0.7, roof = Math.floor(rH() * 3), chimney = rH() < 0.4;
      if (onRoad(p, 3.4) && rr > 4) continue;                                       // keep the street from each gate clear
      if (rr < 13) continue;                                                        // the plaza's ground is kept free from the start, whatever its stage
      if (obstacles.some(o => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 1.5)) continue;
      if (spots.some(h2 => Math.hypot(h2.x - p.x, h2.z - p.z) < 3.4)) continue;
      spots.push({ x: p.x, z: p.z, rot, w, d, h, roof, chimney });
    }
    // The look of each home follows the stage of the place: tents and huts, then timber, then stone (older homes first, so a growing town changes house by house)
    const styleOf = (i, st) => st <= 1 ? (i % 3 === 0 ? 1 : 0) : st === 2 ? (i % 5 === 0 ? 0 : 1) : st === 3 ? (i % 2 ? 2 : 1) : (i % 4 === 3 ? 1 : 2);
    spots.forEach((h, i) => { h.style = styleOf(i, stage); });
    L.suburb.forEach((h, i) => { h.style = stage >= 4 ? 2 : 1; });
    L.houses = spots.slice(0, wanted);
    L.housesWanted = wanted;


    // Fields and farmhouses outside the walls: a fixed list of spots, the first few used as the farms grow
    const flvl = city.buildings.farm, nf = Math.min(14, flvl * 3 + (city.spec === 'farmland' ? 3 : 0) + 1), fspots = [];
    for (let tries = 0; tries < 600 && fspots.length < 14; tries++) {
      const a = rF() * TAU, rr = R + 7 + rF() * 16, p = pol(rr, a), crop = rF() < 0.5 ? 0 : 1;
      if (gates.some(g => angDiff(g.angle, a) < 0.3) || !dry(a)) continue;
      if (fspots.some(f => Math.hypot(f.x - p.x, f.z - p.z) < 8) || obstacles.some(o => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 5)) continue;
      fspots.push({ x: p.x, z: p.z, rot: a + Math.PI / 2, w: 7, d: 5, crop });
    }
    L.fields = fspots.slice(0, nf); L.farmhouses = [];
    for (let i = 0; i < Math.min(L.fields.length, Math.ceil(flvl / 2)); i++) { const f = L.fields[i], p = pol(Math.hypot(f.x, f.z) + 5, Math.atan2(f.z, f.x)); L.farmhouses.push({ x: p.x, z: p.z, rot: Math.atan2(f.z, f.x) }); }

    // Terrain features that say what the place is known for
    L.features = [];
    const free = angle => !gates.some(g => angDiff(g.angle, angle) < 0.45) && dry(angle);
    const ring = (kind, n, rMin, rMax, size) => { for (let t = 0, c = 0; t < 200 && c < n; t++) { const a = rX() * TAU, rd = rX(), rot = rX() * TAU, sz = rX(); if (!free(a)) continue; const p = pol(rMin + rd * (rMax - rMin), a); if (kind === 'tree' && obstacles.some(o => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 2)) continue; L.features.push({ kind, x: p.x, z: p.z, rot, size: size * (0.7 + sz * 0.6) }); c++; } };
    if (city.spec === 'pass') ring('rock', 11, R + 6, R + 28, 5);
    if (city.spec === 'iron') { ring('rock', 6, R + 8, R + 26, 3.5); ring('ore', 5, R + 6, R + 20, 1.4); }
    if (city.spec === 'horse') ring('paddock', 3, R + 8, R + 20, 6);
    if (city.spec === 'holy') ring('stones', 1, 7, 8, 3);
    if (city.spec === 'market') ring('banner', 4, R * 0.3, R * 0.7, 1);
    ring('tree', 16, R + 5, R + 34, 2.2);

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
    L.sigStatic = [id, city.owner, tier, wlvl, Math.round(hpFrac * 8), seg.map(s => s.damage).join(''), L.houses.length, L.fields.length, L.stalls.length, blvl, L.temple.level, L.depot ? L.depot.crates : 0, L.smith.on ? 1 : 0, stage, L.suburb.length, L.works.map(w => w.kind[0]).join(''),
      L.construction ? L.construction.type + Math.floor(L.construction.progress * 5) : '-', city.besieged ? 1 : 0].join('/');
    L.sigArmies = [L.garrison.visible, L.assault ? 1 : 0, armies.map(a => [a.id, a.soldiers, Object.values(a.mix).join(','), a.siege, a.mode, a.fallen, Math.round(a.angle * 10), a.breach ? 1 : 0].join(':')).join('|')].join('/');
    L.sig = L.sigStatic + '#' + L.sigArmies;
    return L;
  }

  return { build, tierOf, stageOf, RADIUS, bearing, angDiff, rng, WALL_SEGMENTS };
})();
