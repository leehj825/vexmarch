// Doctrines: offers a year apart, one pick each, bonuses that apply, AI houses pick by themselves, deterministic, saves. Run: node tools/test_doctrine.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }
const ex = (s, f, c) => VM.Commands.exec(s, Object.assign({ faction: f }, c));
const world = () => { const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false; return s; };

test('the player is offered three doctrines after a year, picks one, and the next offer is a year later', () => {
  const s = world(); s.player = 1; VM.Doctrine.step(s); assert(!s.factions[1].doctrine.offer, 'no offer before the first year');
  VM.Sim.advance(s, 366); const off = s.factions[1].doctrine.offer;
  assert(off && off.length === 3 && new Set(off).size === 3, 'three different doctrines: ' + off);
  assert(!ex(s, 1, { type: 'chooseDoctrine', id: 'nope' }).ok, 'only the offered ones');
  assert(ex(s, 1, { type: 'chooseDoctrine', id: off[1] }).ok, 'picked');
  assert(s.factions[1].doctrine.owned.length === 1 && !s.factions[1].doctrine.offer && !ex(s, 1, { type: 'chooseDoctrine', id: off[0] }).ok, 'one pick at a time');
  assert(s.factions[1].doctrine.next > s.time, 'the next one comes later');
});

test('a doctrine gives its bonus to its house only', () => {
  const s = world(); s.factions[2].doctrine = { owned: ['drill'], offer: null, next: Infinity };
  assert(Math.abs(VM.Doctrine.bonus(s, 2, 'army') - 0.08) < 1e-9, 'house 2 has drill'); assert.strictEqual(VM.Doctrine.bonus(s, 3, 'army'), 0);
  const a = VM.Armies.spawn(s, 2, s.cities.find(c => c.owner === 2).id, { infantry: 10, spear: 0, cavalry: 0, archer: 0, siege: 0 }, s.officers.find(o => o.owner === 2 && o.army === null).id);
  const b = VM.Armies.spawn(s, 3, s.cities.find(c => c.owner === 3).id, { infantry: 10, spear: 0, cavalry: 0, archer: 0, siege: 0 }, s.officers.find(o => o.owner === 3 && o.army === null).id);
  const m = VM.War.armyMods(s, a); s.factions[2].doctrine.owned = []; const m0 = VM.War.armyMods(s, a); s.factions[2].doctrine.owned = ['drill'];
  assert(Math.abs(m / m0 - 1.08) < 1e-9, 'the same army is 8% stronger with drill');
});

test('an AI house takes the first offer by itself, and the same seed gives the same choices', () => {
  const run = () => { const s = VM.Sim.create({ seed: 9, factions: 5, aiAll: true }); VM.Sim.advance(s, 1200); return s.factions.filter(f => !f.neutral).map(f => (f.doctrine && f.doctrine.owned.join('+')) || '-'); };
  const a = run(), b = run(); assert.deepStrictEqual(a, b, 'same seed, same doctrines'); assert(a.some(x => x !== '-'), 'AI houses took doctrines: ' + a);
});

test('save and load keep the doctrines and the offer', () => {
  const s = world(); s.player = 1; VM.Sim.advance(s, 370); const off = s.factions[1].doctrine.offer;
  const t = VM.Sim.load(VM.Sim.save(s)); assert.deepStrictEqual(t.factions[1].doctrine.offer, off);
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
