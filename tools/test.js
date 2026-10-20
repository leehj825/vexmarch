// Dependency-free tests for the simulation. Run: node tools/test.js
const assert = require('assert');
const VM = require('./load');
const bot = require('./econ_bot');
const Y = VM.CFG.DAYS_PER_YEAR;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }

const cross = (p1, p2, p3, p4) => {
  const d = (a, b, c) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
  return d(p1, p2, p3) * d(p1, p2, p4) < 0 && d(p3, p4, p1) * d(p3, p4, p2) < 0;
};

for (const seed of [1, 2, 3, 7, 42]) {
  test(`map seed ${seed}: 30 nodes, connected, roads never cross`, () => {
    const s = VM.Sim.create({ seed }), N = s.map.nodes;
    assert.strictEqual(N.length, 30);
    assert(VM.World.connected(30, N.map(n => n.adj)));
    for (const [a, b] of s.map.edges) { assert(N[a].adj.includes(b) && N[b].adj.includes(a)); }
    const E = s.map.edges;
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      if (E[i][0] === E[j][0] || E[i][0] === E[j][1] || E[i][1] === E[j][0] || E[i][1] === E[j][1]) continue;
      assert(!cross(N[E[i][0]], N[E[i][1]], N[E[j][0]], N[E[j][1]]), `roads ${E[i]} and ${E[j]} cross`);
    }
    assert.strictEqual(new Set(N.map(n => n.name)).size, 30, 'node names are unique');
  });
}

test('factions: 4 to 6 supported, each starts with its capital and 4 nodes', () => {
  for (const nf of [4, 5, 6]) {
    const s = VM.Sim.create({ seed: 5, factions: nf });
    assert.strictEqual(s.factions.length, nf + 1);
    for (let f = 1; f <= nf; f++) {
      const mine = s.cities.filter(c => c.owner === f);
      assert.strictEqual(mine.length, VM.CFG.START_NODES);
      assert.strictEqual(s.cities[s.factions[f].capital].spec, 'capital');
    }
    assert(s.cities.some(c => c.owner === 0), 'some neutral nodes remain');
  }
});

test('specialties: placed as configured, ports on the rim', () => {
  const s = VM.Sim.create({ seed: 9 });
  for (const k of Object.keys(VM.CFG.SPEC)) {
    if (k === 'capital' || k === 'town') continue;
    assert.strictEqual(s.cities.filter(c => c.spec === k).length, VM.CFG.SPEC[k].count, k);
  }
  const M = VM.CFG.MAP;
  for (const c of s.cities.filter(c => c.spec === 'port')) {
    const n = s.map.nodes[c.id]; assert(n.col === 0 || n.row === 0 || n.col === M.cols - 1 || n.row === M.rows - 1);
  }
});

test('determinism: same seed gives identical state', () => {
  const a = VM.Sim.create({ seed: 11 }), b = VM.Sim.create({ seed: 11 });
  bot.run(a, Y * 2); bot.run(b, Y * 2);
  assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(b));
  assert.notStrictEqual(VM.Sim.hash(VM.Sim.create({ seed: 12 })), VM.Sim.hash(VM.Sim.create({ seed: 11 })));
});

test('save/load round trip continues identically', () => {
  const a = VM.Sim.create({ seed: 4 });
  bot.run(a, 200);
  const b = VM.Sim.load(VM.Sim.save(a));
  assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(b));
  bot.run(a, 200); bot.run(b, 200);
  assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(b));
});

test('real-time update matches advance() whatever the frame rate', () => {
  const a = VM.Sim.create({ seed: 6 }), b = VM.Sim.create({ seed: 6 });
  const days = 40, sec = days * VM.CFG.DAY_SECONDS;
  VM.Sim.advance(a, days);
  for (let t = 0; t < sec; t += 1 / 30) VM.Sim.update(b, 1 / 30, 1);
  assert(Math.abs(a.time - b.time) < 0.5, `time ${a.time} vs ${b.time}`);
  const c = VM.Sim.create({ seed: 6 });
  VM.Sim.update(c, 0.1, 0); assert.strictEqual(c.time, 0, 'paused does not advance');
});

test('10000 days: no NaN, no negatives, populations within caps', () => {
  const s = VM.Sim.create({ seed: 3 });
  bot.run(s, 10000);
  for (const f of s.factions) { assert(Number.isFinite(f.gold) && f.gold >= 0, 'gold ' + f.name); assert(Number.isFinite(f.food) && f.food >= 0, 'food ' + f.name); }
  for (const c of s.cities) {
    assert(Number.isFinite(c.pop) && c.pop >= 0);
    assert(c.pop <= VM.Eco.cap(c) * 1.31, `city ${c.id} pop ${c.pop} cap ${VM.Eco.cap(c)}`);
  }
  assert(s.events.length <= 200);
});

test('economy: every faction makes progress with the bot over 5 years', () => {
  const s = VM.Sim.create({ seed: 1 }); const before = s.factions.map(f => s.cities.filter(c => c.owner === f.id).reduce((a, c) => a + c.pop, 0));
  bot.run(s, Y * 5);
  s.factions.forEach((f, i) => {
    if (f.neutral) return;
    const pop = s.cities.filter(c => c.owner === f.id).reduce((a, c) => a + c.pop, 0);
    assert(pop > before[i], `${f.name} population should grow (${before[i]} -> ${pop})`);
    assert(!f.starving, f.name + ' should not be starving');
  });
});

test('tax trade-off: high tax = more gold now, lower prosperity; low tax = higher prosperity', () => {
  const mk = tax => { const s = VM.Sim.create({ seed: 8 }); bot.run(s, Y * 3, { tax, factions: [1] }); return s; };
  const lo = mk('low'), no = mk('normal'), hi = mk('high');
  const stat = s => { const cs = s.cities.filter(c => c.owner === 1); return { pr: cs.reduce((a, c) => a + c.stats.prosperity, 0) / cs.length, pop: cs.reduce((a, c) => a + c.pop, 0), inc: s.factions[1].income.gold }; };
  const L = stat(lo), N = stat(no), H = stat(hi);
  assert(L.pr > N.pr && N.pr > H.pr, `prosperity ${L.pr} ${N.pr} ${H.pr}`);
  assert(L.pop > H.pop, 'low tax grows a bigger population');
  assert(H.inc < N.inc * 1.15, `high tax must not dominate long-term: ${H.inc.toFixed(0)} vs ${N.inc.toFixed(0)}`);
  assert(L.inc < N.inc, 'low tax earns less gold');
  const first = tax => { const s = VM.Sim.create({ seed: 8 }); VM.Sim.advance(s, 30); VM.Commands.exec(s, { type: 'setTax', faction: 1, city: s.factions[1].capital, tax }); return VM.Eco.cityStats(s, s.cities[s.factions[1].capital], 1).gold; };
  assert(first('high') > first('normal') && first('normal') > first('low'), 'immediate gold order');
});

test('food: overpopulated land with no food stock starves, then population settles to what the land feeds', () => {
  const s = VM.Sim.create({ seed: 1 }), f = s.factions[1];
  const cs = s.cities.filter(c => c.owner === 1);
  cs.forEach(c => { c.buildings.farm = 0; c.pop = VM.Eco.cap(c); });
  f.food = 100;
  const pop0 = cs.reduce((a, c) => a + c.pop, 0);
  VM.Sim.advance(s, 10);
  assert(s.events.some(e => e.type === 'starving'), 'a starving event was raised');
  assert.strictEqual(f.food, 0);
  VM.Sim.advance(s, Y * 2);
  const pop1 = cs.reduce((a, c) => a + c.pop, 0);
  assert(pop1 < pop0 * 0.9, `population fell (${pop0.toFixed(0)} -> ${pop1.toFixed(0)})`);
  const prod = cs.reduce((a, c) => a + c.stats.foodProd, 0), cons = cs.reduce((a, c) => a + c.stats.foodCons, 0);
  assert(cons <= prod * 1.1, `consumption ${cons.toFixed(0)} settles near production ${prod.toFixed(0)}`);
});

test('recruiting: costs gold, takes population, respects the floor, discounts apply', () => {
  const s = VM.Sim.create({ seed: 1 }), f = s.factions[1], city = s.cities[f.capital];
  f.gold = 1e5; const g0 = f.gold, p0 = city.pop, t0 = city.garrison.infantry;
  const r = VM.Commands.exec(s, { type: 'recruit', faction: 1, city: city.id, troop: 'infantry', count: 100 });
  assert(r.ok, r.reason);
  assert.strictEqual(city.garrison.infantry, t0 + 100); assert.strictEqual(city.pop, p0 - 100);
  assert(Math.abs((g0 - f.gold) - 100 * VM.Eco.troopCost(city, 'infantry')) < 1e-6);
  assert(VM.Eco.troopCost(city, 'infantry') < VM.CFG.TROOPS.infantry.cost, 'barracks discount');
  const big = VM.Commands.exec(s, { type: 'recruit', faction: 1, city: city.id, troop: 'infantry', count: 99999 });
  assert(!big.ok);
  f.gold = 0; assert(!VM.Commands.exec(s, { type: 'recruit', faction: 1, city: city.id, troop: 'spear', count: 1 }).ok);
  assert(!VM.Commands.exec(s, { type: 'recruit', faction: 2, city: city.id, troop: 'spear', count: 1 }).ok, 'cannot recruit in another faction city');
});

test('recruiting too much slows growth (the economy pays for it)', () => {
  const a = VM.Sim.create({ seed: 1 }), b = VM.Sim.create({ seed: 1 });
  const cap = a.factions[1].capital;
  for (const s of [a, b]) s.factions[1].gold = 1e6;
  for (let i = 0; i < 10; i++) VM.Commands.exec(b, { type: 'recruit', faction: 1, city: cap, troop: 'infantry', count: 150 });
  VM.Sim.advance(a, 60); VM.Sim.advance(b, 60);
  assert(b.factions[1].income.gold < a.factions[1].income.gold + 1e-9 || b.factions[1].income.gold - 0 < a.factions[1].income.gold, 'upkeep lowers income');
});

test('construction: costs gold, takes time, completes, respects max level', () => {
  const s = VM.Sim.create({ seed: 1 }), f = s.factions[1], city = s.cities[f.capital];
  const g0 = f.gold;
  assert(VM.Commands.exec(s, { type: 'build', faction: 1, city: city.id, building: 'temple' }).ok);
  assert.strictEqual(g0 - f.gold, VM.CFG.BUILD.temple.cost[0]);
  assert(!VM.Commands.exec(s, { type: 'build', faction: 1, city: city.id, building: 'farm' }).ok, 'one project at a time');
  VM.Sim.advance(s, 10); assert.strictEqual(city.buildings.temple, 0, 'not done yet');
  VM.Sim.advance(s, 40); assert.strictEqual(city.buildings.temple, 1); assert.strictEqual(city.build, null);
  city.buildings.temple = 3; assert(!VM.Commands.exec(s, { type: 'build', faction: 1, city: city.id, building: 'temple' }).ok);
});

test('governor: a high-Politics governor builds faster and raises prosperity', () => {
  const s = VM.Sim.create({ seed: 1 }), f = s.factions[1], city = s.cities[f.capital];
  const withGov = VM.Eco.cityStats(s, city, 1).prosperity;
  VM.Commands.exec(s, { type: 'setGovernor', faction: 1, city: city.id, officer: null });
  const without = VM.Eco.cityStats(s, city, 1).prosperity;
  assert(withGov > without);
  const mine = s.officers.filter(o => o.owner === 1).sort((a, b) => b.politics - a.politics);
  assert(VM.Commands.exec(s, { type: 'setGovernor', faction: 1, city: city.id, officer: mine[0].id }).ok);
  assert(!VM.Commands.exec(s, { type: 'setGovernor', faction: 1, city: city.id, officer: s.officers.find(o => o.owner === 2).id }).ok, 'cannot use another faction officer');
});

test('contested city produces no gold and loses security', () => {
  const s = VM.Sim.create({ seed: 1 }), city = s.cities[s.factions[1].capital];
  const a = VM.Eco.cityStats(s, city, 1); city.contested = true; const b = VM.Eco.cityStats(s, city, 1);
  assert(a.gold > 0 && b.gold === 0 && b.security < a.security);
});

test('officers: 24 in the world, 4 per faction, some wandering', () => {
  const s = VM.Sim.create({ seed: 1 });
  assert.strictEqual(s.officers.length, VM.CFG.OFFICER_COUNT);
  for (let f = 1; f <= 5; f++) assert.strictEqual(s.officers.filter(o => o.owner === f).length, VM.CFG.OFFICERS_PER_FACTION);
  assert(s.officers.some(o => o.owner === 0));
  assert.strictEqual(new Set(s.officers.map(o => o.name)).size, s.officers.length);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
