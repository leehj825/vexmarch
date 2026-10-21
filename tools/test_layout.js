// Phase 7: the 3D city layout (pure data). Run: node tools/test_layout.js
const assert = require('assert');
const VM = require('./load');
const CL = VM.CityLayout;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }
const T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
const world = seed => { const s = VM.Sim.create({ seed: seed || 3 }); s.factions.forEach(f => { if (!f.neutral) { f.gold = 1e5; f.food = 1e6; } }); return s; };
const own = s => s.cities.find(c => c.owner === 1 && c.id !== s.factions[1].capital);

test('layout is deterministic and JSON-safe', () => {
  const s = world(), id = s.factions[1].capital;
  const a = CL.build(s, id), b = CL.build(s, id);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); assert.strictEqual(a.sig, b.sig);
  assert.strictEqual(JSON.stringify(JSON.parse(JSON.stringify(a))), JSON.stringify(a));
  assert.notStrictEqual(CL.build(s, own(s).id).sig, a.sig);
});

test('every city of every seed lays out without overlaps or NaN', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = world(seed);
    for (const c of s.cities) {
      const L = CL.build(s, c.id), all = [].concat(L.houses, L.stalls, L.fields, L.features);
      for (const o of all) assert(Number.isFinite(o.x) && Number.isFinite(o.z), `${seed}/${c.id} finite`);
      for (let i = 0; i < L.houses.length; i++) for (let j = i + 1; j < L.houses.length; j++) assert(Math.hypot(L.houses[i].x - L.houses[j].x, L.houses[i].z - L.houses[j].z) >= 2.6 - 1e-9, 'houses do not overlap');
      for (const h of L.houses) assert(Math.hypot(h.x, h.z) < L.radius, 'houses inside the walls');
      assert.strictEqual(L.gates.length, s.map.nodes[c.id].adj.length, 'one gate per road on the map');
      assert(L.housesWanted >= 4 && L.houses.length >= Math.min(L.housesWanted, 7), `houses ${L.houses.length}/${L.housesWanted}`);
    }
  }
});

test('size: capitals are bigger than towns; the tier follows capacity', () => {
  const s = world(); const cap = s.cities[s.factions[1].capital];
  assert.strictEqual(CL.build(s, cap.id).tier, 'capital'); assert(CL.build(s, cap.id).radius > CL.RADIUS.hamlet);
  const small = s.cities.find(c => c.spec === 'pass'); assert.strictEqual(CL.build(s, small.id).tier, 'hamlet');
});

test('houses follow the population only, never the buildings', () => {
  const s = world(), c = own(s), n0 = CL.build(s, c.id).houses.length, w0 = CL.build(s, c.id).housesWanted;
  c.buildings.farm = c.buildings.market = c.buildings.barracks = c.buildings.temple = 3; c.buildings.wall = 3;
  const L = CL.build(s, c.id); assert.strictEqual(L.housesWanted, w0, 'wanted count unchanged by buildings');
  c.pop *= 2; assert(CL.build(s, c.id).housesWanted > w0, 'more people, more houses');
  c.pop = 100; assert.strictEqual(CL.build(s, c.id).housesWanted, 4, 'a floor of four');
  c.pop = 1e6; assert.strictEqual(CL.build(s, c.id).housesWanted, 48, 'a cap of 48');
});

test('buildings: each level adds something to look at, and zero shows nothing', () => {
  const s = world(), c = own(s); c.buildings = { farm: 0, market: 0, barracks: 0, wall: 0, temple: 0 }; c.spec = 'town';
  const base = CL.build(s, c.id);
  assert.strictEqual(base.wall.level, 0); assert(base.wall.towers.length === 0 || base.wall.level > 0 || base.wall.towers.length <= 6);
  assert.strictEqual(base.barracks.level, 0); assert.strictEqual(base.temple.level, 0);
  let prev = { stalls: base.stalls.length, fields: base.fields.length };
  for (let l = 1; l <= 3; l++) {
    c.buildings.market = l; c.buildings.farm = l; c.buildings.barracks = l; c.buildings.temple = l; c.buildings.wall = l;
    const L = CL.build(s, c.id);
    assert(L.stalls.length > prev.stalls, 'stalls grow'); assert(L.fields.length >= prev.fields, 'fields grow');
    assert.strictEqual(L.wall.level, l); assert.strictEqual(L.barracks.level, l); assert.strictEqual(L.temple.level, l);
    prev = { stalls: L.stalls.length, fields: L.fields.length };
  }
  c.buildings.barracks = 1; assert.strictEqual(CL.build(s, c.id).barracks.tents.length, 0); c.buildings.barracks = 2; assert(CL.build(s, c.id).barracks.tents.length > 0, 'tents from level 2');
  c.buildings.wall = 3; assert(CL.build(s, c.id).wall.towers.length > CL.build(s, c.id).gates.length * 2 - 1, 'towers along a level-3 wall');
});

test('wall damage follows the hit points and starts nearest the attackers; a broken wall has a breach', () => {
  const s = world(), c = s.cities.find(x => x.owner === 0 && x.spec !== 'pass'); c.garrison = T({});
  c.buildings.wall = 3; c.wallHp = VM.War.wallMax(c);
  const intact = CL.build(s, c.id); assert(intact.wall.segments.every(g => g.damage === 0));
  const foe = s.factions[2].capital, att = VM.Armies.spawn(s, 2, c.id, T({ infantry: 300, siege: 6 }), s.officers.find(o => o.owner === 2 && o.role === 'idle').id);
  c.owner = 1; VM.War.updateZones(s);
  const dmg = f => { c.wallHp = VM.War.wallMax(c) * f; return CL.build(s, c.id).wall.segments.filter(g => g.damage > 0).length; };
  const d75 = dmg(0.75), d40 = dmg(0.4), d10 = dmg(0.1); assert(d75 <= d40 && d40 <= d10 && d10 > d75, `${d75} <= ${d40} <= ${d10}`);
  c.wallHp = 0; const broken = CL.build(s, c.id); assert(broken.wall.segments.filter(g => g.damage === 2).length >= 3, 'a breach');
  const L = CL.build(s, c.id), hit = L.wall.segments.filter(g => g.damage > 0).map(g => CL.angDiff(g.angle, L.armies[0].angle)), safe = L.wall.segments.filter(g => g.damage === 0 && !g.gate).map(g => CL.angDiff(g.angle, L.armies[0].angle));
  assert(Math.max(...hit) <= Math.min(...safe) + 1e-9, 'the damaged stretch faces the attackers');
});

test('armies at the node appear with soldiers, siege engines and a mode; hostile ones come from their own side', () => {
  const s = world(), id = s.factions[1].capital, a = VM.Armies.spawn(s, 1, id, T({ infantry: 600 }), s.officers.find(o => o.owner === 1 && o.role === 'idle').id);
  const e = VM.Armies.spawn(s, 2, id, T({ infantry: 240, siege: 4 }), s.officers.find(o => o.owner === 2 && o.role === 'idle').id);
  VM.War.updateZones(s); const L = CL.build(s, id);
  assert.strictEqual(L.armies.length, 2);
  const mine = L.armies.find(x => x.id === a.id), foe = L.armies.find(x => x.id === e.id);
  assert.strictEqual(mine.hostile, false); assert.strictEqual(foe.hostile, true); assert.strictEqual(foe.siege, 4);
  assert(mine.soldiers === 50 && foe.soldiers === 20, `soldiers ${mine.soldiers}/${foe.soldiers}`);
  assert(['camp', 'besieging', 'fighting'].includes(foe.mode)); assert(L.besieged);
  const road = s.map.nodes[id].adj.map(n => CL.bearing(s, id, n)); assert(road.some(r => CL.angDiff(r, foe.angle) < 1e-9), 'comes along a road');
});

test('construction shows scaffolding that matches the project and its progress', () => {
  const s = world(), c = own(s); VM.Commands.exec(s, { type: 'build', faction: 1, city: c.id, building: 'temple' });
  let L = CL.build(s, c.id); assert(L.construction && L.construction.type === 'temple' && L.construction.progress === 0);
  VM.Sim.advance(s, 15); L = CL.build(s, c.id); assert(L.construction.progress > 0.2 && L.construction.progress < 1);
  VM.Sim.advance(s, 60); L = CL.build(s, c.id); assert.strictEqual(L.construction, null); assert.strictEqual(L.temple.level, 1);
});

test('depot, garrison and specialty features', () => {
  const s = world(), c = own(s); c.depot = { food: 1200, target: 2000 }; c.garrison = T({ infantry: 280 });
  const L = CL.build(s, c.id); assert.strictEqual(L.depot.crates, 3); assert.strictEqual(L.garrison.visible, 20);
  const port = s.cities.find(x => x.spec === 'port'); assert(CL.build(s, port.id).water, 'ports have water');
  const pass = s.cities.find(x => x.spec === 'pass'); assert(CL.build(s, pass.id).features.some(f => f.kind === 'rock'), 'passes have rocks');
  const holy = s.cities.find(x => x.spec === 'holy'); assert(CL.build(s, holy.id).features.some(f => f.kind === 'stones'));
});

test('the signature changes when the picture should, and not otherwise', () => {
  const s = world(), c = own(s), a = CL.build(s, c.id).sig; assert.strictEqual(CL.build(s, c.id).sig, a);
  VM.Sim.advance(s, 0.5); c.pop += 1; assert.strictEqual(CL.build(s, c.id).sig, a, 'one more person changes nothing');
  c.buildings.farm++; assert.notStrictEqual(CL.build(s, c.id).sig, a);
});


test('armies on the road: they appear when near, approach along the road they are on, and leave the picture when far', () => {
  const s = world(), id = s.factions[1].capital, nb = s.map.nodes[id].adj[0], foe = s.officers.find(o => o.owner === 2 && o.role === 'idle');
  const a = VM.Armies.spawn(s, 2, nb, T({ infantry: 300 }), foe.id); a.order = 'hold';
  VM.Armies.move(s, a, id);
  VM.Sim.advance(s, 1); assert(a.at === null && a.edge.to === id);
  const len = a.edge.len, far = CL.build(s, id);
  if (len - a.edge.prog > 140) assert.strictEqual(far.armies.length, 0, 'too far to see'); else assert.strictEqual(far.armies.length, 1, 'close enough to see');
  a.edge.prog = len - 120; const mid = CL.build(s, id).armies[0];
  assert(mid && mid.moving === 'in' && mid.mode === 'march' && mid.hostile, 'marching in');
  assert(CL.angDiff(mid.angle, CL.bearing(s, id, nb)) < 1e-9, 'comes along its own road');
  a.edge.prog = len - 40; const near = CL.build(s, id).armies[0]; assert(near.d < mid.d, 'closer to the walls');
  a.edge.prog = len - 1; assert(CL.build(s, id).armies[0].d < near.d);
  const leaving = VM.Armies.spawn(s, 1, id, T({ infantry: 100 }), s.officers.find(o => o.owner === 1 && o.role === 'idle').id); VM.Armies.move(s, leaving, nb);
  VM.Sim.advance(s, 2); const out = CL.build(s, id).armies.find(x => x.id === leaving.id); assert(out && out.moving === 'out' && !out.hostile, 'leaving');
});

test('soldier mix follows the troops and always adds up; fallen follow the casualties', () => {
  const s = world(), id = s.factions[1].capital;
  const a = VM.Armies.spawn(s, 1, id, T({ infantry: 300, spear: 120, cavalry: 60, archer: 120 }), s.officers.find(o => o.owner === 1 && o.role === 'idle').id);
  let m = CL.build(s, id).armies[0]; assert.strictEqual(m.soldiers, 50);
  assert.strictEqual(m.mix.infantry + m.mix.spear + m.mix.cavalry + m.mix.archer, m.soldiers, 'the mix adds up');
  assert(m.mix.infantry > m.mix.spear && m.mix.spear === m.mix.archer && m.mix.cavalry < m.mix.spear, JSON.stringify(m.mix));
  for (const k of ['infantry', 'spear', 'cavalry', 'archer']) a.troops[k] = Math.round(a.troops[k] * 0.4);
  m = CL.build(s, id).armies[0]; assert(m.fallen >= 6 && m.fallen <= 24, 'fallen ' + m.fallen);
  assert.strictEqual(m.mix.infantry + m.mix.spear + m.mix.cavalry + m.mix.archer, m.soldiers);
  a.troops = T({ siege: 5 }); assert.strictEqual(CL.build(s, id).armies[0].mix.infantry + CL.build(s, id).armies[0].mix.archer, CL.build(s, id).armies[0].soldiers, 'only siege engines left: soldiers still add up');
});

test('armies in battle meet in one line, defender facing attacker; the signatures split static from armies', () => {
  const s = world(), id = s.factions[1].capital;
  const d = VM.Armies.spawn(s, 1, id, T({ infantry: 400 }), s.officers.find(o => o.owner === 1 && o.role === 'idle').id);
  const e = VM.Armies.spawn(s, 2, id, T({ infantry: 400 }), s.officers.find(o => o.owner === 2 && o.role === 'idle').id);
  const before = CL.build(s, id); VM.Sim.advance(s, 0.5);
  const L = CL.build(s, id), A = L.armies.find(x => x.id === d.id), B = L.armies.find(x => x.id === e.id);
  assert(A.mode === 'fighting' && B.mode === 'fighting' && A.clash && B.clash);
  assert(CL.angDiff(A.angle, B.angle) < 1e-9 && A.d < B.d && B.d - A.d < 8, 'one line');
  assert.strictEqual(before.sigStatic.split('/').slice(0, 5).join('/'), L.sigStatic.split('/').slice(0, 5).join('/'));
  assert.notStrictEqual(before.sigArmies, L.sigArmies);
});


test('the picture is stable: buildings, people, depots and armies never move what is already standing', () => {
  const s = world(7), id = own(s).id, c = s.cities[id];
  c.buildings = { farm: 0, market: 0, barracks: 0, wall: 0, temple: 0 }; c.depot = null; c.pop = 3000;
  const snap = () => CL.build(s, id), a = snap();
  const same = (x, y, n) => { for (let i = 0; i < n; i++) assert(x[i].x === y[i].x && x[i].z === y[i].z && x[i].rot === y[i].rot, 'item ' + i + ' moved'); };
  for (const step of [() => { c.buildings.farm = 1; }, () => { c.buildings.market = 3; c.buildings.barracks = 3; }, () => { c.buildings.temple = 2; c.buildings.wall = 3; }, () => { c.depot = { food: 900, target: 1000 }; }, () => { c.pop = 4500; }, () => { c.pop = 6000; c.buildings.farm = 3; },
    () => { VM.Armies.spawn(s, 2, id, T({ infantry: 400 }), s.officers.find(o => o.owner === 2 && o.role === 'idle').id); VM.War.updateZones(s); }, () => { c.wallHp = 0; }]) {
    step(); const b = snap();
    assert.strictEqual(b.tier, a.tier); assert.strictEqual(b.radius, a.radius);
    same(a.houses, b.houses, Math.min(a.houses.length, b.houses.length));
    same(a.fields, b.fields, Math.min(a.fields.length, b.fields.length));
    assert.strictEqual(JSON.stringify(a.features), JSON.stringify(b.features), 'scenery stays put');
    assert.strictEqual(JSON.stringify(a.gates), JSON.stringify(b.gates));
  }
  const grown = snap(); same(a.houses, grown.houses, a.houses.length); assert(grown.houses.length > a.houses.length, 'but the town does grow');
  assert(grown.fields.length > a.fields.length && grown.farmhouses.length > a.farmhouses.length, 'and the fields too');
});

test('the same city looks the same after a save and load, and on opening it again', () => {
  const s = world(7), id = own(s).id, before = JSON.stringify(CL.build(s, id));
  const t = VM.Sim.load(VM.Sim.save(s)); assert.strictEqual(JSON.stringify(CL.build(t, id)), before);
  assert.strictEqual(JSON.stringify(CL.build(s, id)), before, 'building it twice gives the same picture');
});


test('the roads of the city are the roads of the map: one per neighbour, facing it', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = world(seed);
    for (const n of s.map.nodes) {
      const L = CL.build(s, n.id);
      assert.strictEqual(L.roads.length, n.adj.length, `node ${n.id} of seed ${seed}`);
      for (const nb of n.adj) assert(L.roads.some(r => r.toward === nb && CL.angDiff(r.angle, CL.bearing(s, n.id, nb)) < 1e-9), 'a road toward ' + nb);
      assert.strictEqual(L.wall.segments.filter(g => g.gate).length >= n.adj.length, true, 'a gate in the wall for each road');
    }
  }
});


test('a besieging army assaults: ladders while the wall stands, a breach when it is down or missing', () => {
  const s = world(), c = s.cities.find(x => x.owner === 0 && x.spec !== 'pass'); c.garrison = T({ infantry: 100 }); c.buildings.wall = 2; c.wallHp = VM.War.wallMax(c);
  const e = VM.Armies.spawn(s, 2, c.id, T({ infantry: 400, siege: 3 }), s.officers.find(o => o.owner === 2 && o.role === 'idle').id); e.order = 'hold';
  VM.War.updateZones(s); let L = CL.build(s, c.id), A = L.armies[0];
  assert(A.assault && !A.breach && L.assault, 'storming a standing wall'); assert.strictEqual(L.owner, 0);
  c.wallHp = 0; L = CL.build(s, c.id); assert(L.armies[0].breach, 'a broken wall is a breach');
  c.wallHp = VM.War.wallMax(c); c.buildings.wall = 0; c.wallHp = 0; L = CL.build(s, c.id); assert(L.armies[0].breach, 'no wall at all: they walk in');
  c.owner = 1; const f = VM.Armies.spawn(s, 1, c.id, T({ infantry: 100 }), s.officers.find(o => o.owner === 1 && o.role === 'idle').id);
  assert(!CL.build(s, c.id).armies.find(x => x.id === f.id).assault, 'only hostile besiegers assault');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
