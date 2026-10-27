// Save slots: save to a slot and read the label, load it back, refuse an empty, old or finished slot, delete. Uses a stand-in for localStorage. Run: node tools/test_slots.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }
const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
// the slot module is a browser file: load it here like the page does
require('../js/ui/slots.js');

test('a game saves to a slot with a label, and loads back the same', () => {
  const s = VM.Scenario.create('realm', { player: 2 }); VM.Sim.advance(s, 30);
  assert(VM.Slots.save(s, 1).ok); const m = VM.Slots.meta(1); assert.strictEqual(m.house, s.factions[2].name); assert(m.day >= 30 && !m.campaign);
  const r = VM.Slots.load(1); assert(r.ok && VM.Sim.hash(r.state) === VM.Sim.hash(s), 'the same game');
});

test('an empty slot, an out-of-range slot, an old or a finished game are refused', () => {
  assert.strictEqual(VM.Slots.load(2).reason, 'the slot is empty'); assert(!VM.Slots.save(VM.Scenario.create('open', {}), 9).ok);
  const s = VM.Scenario.create('open', {}); s.version = 'old'; mem['vexmarch.slot3'] = VM.Sim.save(s); assert(!VM.Slots.load(3).ok, 'old');
  const f = VM.Scenario.create('open', {}); f.over = { type: 'lose', winner: null, t: 0 }; mem['vexmarch.slot3'] = VM.Sim.save(f); assert.strictEqual(VM.Slots.load(3).reason, 'a finished game');
});

test('the list shows all three slots and delete empties one', () => {
  const l = VM.Slots.list(); assert.strictEqual(l.length, 3); assert(l[0].has && l[0].meta);
  VM.Slots.remove(1); assert(!VM.Slots.list()[0].has && !VM.Slots.meta(1));
});

test('a blocked store does not break the game: saving reports the reason', () => {
  const keep = globalThis.localStorage; globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const s = VM.Scenario.create('open', {}); assert(!VM.Slots.save(s, 2).ok); assert.strictEqual(VM.Slots.load(2).ok, false); assert.deepStrictEqual(VM.Slots.list().map(x => x.has), [false, false, false]);
  globalThis.localStorage = keep;
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
