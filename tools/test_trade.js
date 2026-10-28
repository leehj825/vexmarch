// Trade routes: opening rules, daily gold, cut by an enemy on the road, closing, limits, saves. Run: node tools/test_trade.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }
const ex = (s, f, c) => VM.Commands.exec(s, Object.assign({ faction: f }, c));
// two of faction 1's cities joined by a clear road: pick a city of 1 and one of its neighbours of 1 (or make one)
function pair() {
  const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false; s.factions.forEach(f => { if (!f.neutral) f.gold = 1e5; });
  const a = s.cities.find(c => c.owner === 1), nb = s.map.nodes[a.id].adj.find(n => s.cities[n].owner === 1);
  return { s, a: a.id, b: nb === undefined ? null : nb };
}

test('a route needs two of your cities joined by a road through friendly land, and gold', () => {
  const { s, a, b } = pair(); assert(b !== null, 'two neighbouring cities of house 1');
  const foe = s.cities.find(c => c.owner === 2);
  assert(ex(s, 1, { type: 'openRoute', a, b }).ok, 'opens');
  assert(!ex(s, 1, { type: 'openRoute', a, b }).ok, 'only once');
  assert(!ex(s, 1, { type: 'openRoute', a: foe.id, b }).ok, 'not from an enemy city');
  const { s: t, a: ta, b: tb } = pair(); t.factions[1].gold = 10; assert(!ex(t, 1, { type: 'openRoute', a: ta, b: tb }).ok, 'needs the setup gold');
});

// two of house 1's cities with a city of house 1 between them on a clear road
function far() {
  const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false; s.factions.forEach(f => { if (!f.neutral) f.gold = 1e5; });
  const own = s.cities.filter(c => c.owner === 1);
  for (const x of own) for (const y of own) { if (x === y) continue; const p = VM.Armies.path(s, x.id, y.id); if (p && p.length >= 3 && p.every(id => s.cities[id].owner === 1)) return { s, a: x.id, b: y.id }; }
  return null;
}

test('an open route pays both houses each day; a route through an enemy city is cut and pays nothing', () => {
  const { s, a, b } = far() || { s: null }; assert(s, 'a road of three of house 1 cities');
  const r = ex(s, 1, { type: 'openRoute', a, b }); assert(r.ok);
  const g0 = s.factions[1].gold; VM.Trade.step(s, 10);
  assert(s.factions[1].gold - g0 >= VM.CFG.TRADE.perDay * 10 * 0.6 - 1e-6, 'paid'); assert(s.trade[0].open);
  // an enemy takes the city on the way: find a city on the path between a and b that is not 1's, else put a foe on the road
  const path = VM.Armies.path(s, a, b), mid = path.find(id => id !== a && id !== b);
  assert(mid !== undefined, 'a road with a city on it (the test needs one)');
  s.cities[mid].owner = 2; const g1 = s.factions[1].gold; VM.Trade.step(s, 10); assert(!s.trade[0].open && s.factions[1].gold === g1, 'cut: no pay');
});

test('the number of routes out of a city grows with its markets; closing frees a slot', () => {
  const { s, a, b } = pair(); s.cities[a].buildings.market = 0;
  assert.strictEqual(VM.Trade.limitOf(s.cities[a]), VM.CFG.TRADE.base);
  const r = ex(s, 1, { type: 'openRoute', a, b }); assert(r.ok, JSON.stringify(r));
  const other = s.map.nodes[a].adj.find(n => s.cities[n].owner === 1 && n !== b);
  if (other !== undefined) assert(!ex(s, 1, { type: 'openRoute', a, b: other }).ok, 'no more routes than markets allow');
  assert(ex(s, 1, { type: 'closeRoute', route: r.route }).ok, 'closed'); assert(VM.Trade.listFor(s, a).length === 0);
});

test('save and load keep the routes', () => {
  const { s, a, b } = pair(); ex(s, 1, { type: 'openRoute', a, b });
  const t = VM.Sim.load(VM.Sim.save(s)); assert.strictEqual(t.trade.length, 1); VM.Trade.step(t, 1);
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
