// Vassals and tribute: the offer, tribute each day, the lord's protection, the rebellion of a strong vassal, the queue for the player, saves. Run: node tools/test_vassal.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }
const ex = (s, f, c) => VM.Commands.exec(s, Object.assign({ faction: f }, c));
// house 1 is strong; house 2 keeps only its capital, its ruler is cautious (a cautious house bends more easily)
function world() {
  const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false; s.factions.forEach(f => { if (!f.neutral) f.gold = 500; });
  for (const c of s.cities) if (c.owner === 2 && c.id !== s.factions[2].capital) c.owner = 1;
  for (const o of s.officers) if (o.owner === 2) o.trait = 'Cautious';
  return s;
}

test('a weak house accepts vassalage; it keeps its cities and pays tribute to its lord each day', () => {
  const s = world(); const r = ex(s, 1, { type: 'proposeVassal', to: 2 });
  assert(r.ok && r.accepted, JSON.stringify(r)); assert.strictEqual(VM.Diplo.vassalOf(s, 2), 1); assert.deepStrictEqual(VM.Diplo.vassalsOf(s, 1), [2]);
  const g1 = s.factions[1].gold, g2 = s.factions[2].gold; VM.Diplo.step(s, 10);
  assert(s.factions[1].gold > g1 && s.factions[2].gold < g2, 'tribute moves gold to the lord');
  assert(s.cities.some(c => c.owner === 2), 'it keeps its city'); assert(s.factions[2].alive, 'and its name');
});

test('a vassal is protected by its lord: no AI lord breaks the pact, and the vassal cannot ally elsewhere', () => {
  const s = world(); VM.Diplo.ensure(s).allies.push({ a: 1, b: 2, since: 0, vassal: true });
  assert(!ex(s, 2, { type: 'proposeAlliance', to: 3 }).ok, 'it has a lord');
  s.time = 500; s.aiOn = true; s.factions[1].ai.dnext = 0; VM.Diplo.think(s, s.factions[1]);
  assert(VM.Diplo.allied(s, 1, 2), 'the AI lord keeps the vassal');
});

test('a vassal that has grown much stronger rebels; a young one does not', () => {
  const s = world(); VM.Diplo.ensure(s).allies.push({ a: 1, b: 2, since: 0, vassal: true });
  s.time = 10; VM.Diplo.step(s, 1); assert(VM.Diplo.allied(s, 1, 2), 'too young to rebel');
  s.time = 300; s.cities.forEach(c => { if (c.owner === 1 && c.id !== s.factions[1].capital) c.owner = 0; });   // the lord shrinks to its capital
  const v = s.cities.find(c => c.owner === 2 && c.id !== s.factions[2].capital) || s.cities[s.factions[2].capital];
  s.factions[1].capital; for (let i = 0; i < 3; i++) VM.Armies.spawn(s, 2, v.id, { infantry: 400, spear: 0, cavalry: 0, archer: 0, siege: 0 }, s.officers.find(o => o.owner === 2 && o.army === null).id);
  VM.Diplo.step(s, 1); assert(!VM.Diplo.allied(s, 1, 2) && s.events.some(e => e.type === 'rebel'), 'it rebels');
});

test('an offer to the player waits in the queue; accepting it makes a vassal', () => {
  const s = world(); s.aiOn = true; s.player = 2; s.aiAll = false;
  const r = ex(s, 1, { type: 'proposeVassal', to: 2 }); assert(r.ok && r.pending, JSON.stringify(r));
  const o = VM.Diplo.ensure(s).offers.find(x => x.kind === 'vassal'); assert(o, 'an offer');
  assert(ex(s, 2, { type: 'answerOffer', offer: o.id, accept: true }).ok); assert.strictEqual(VM.Diplo.vassalOf(s, 2), 1);
});

test('save and load keep vassals', () => {
  const s = world(); VM.Diplo.ensure(s).allies.push({ a: 1, b: 2, since: 0, vassal: true });
  const t = VM.Sim.load(VM.Sim.save(s)); assert.strictEqual(VM.Diplo.vassalOf(t, 2), 1);
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
