// Fog of war: what a faction sees, memory of cities, the AI limited to what it knows. Run: node tools/test_fog.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }
const T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);

test('without fog everything is seen; with fog a far enemy army is not, a near one is', () => {
  const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false;
  const far = s.cities.filter(c => c.owner > 1).sort((a, b) => Math.hypot(s.map.nodes[b.id].x - s.map.nodes[s.factions[1].capital].x, s.map.nodes[b.id].y - s.map.nodes[s.factions[1].capital].y) - Math.hypot(s.map.nodes[a.id].x - s.map.nodes[s.factions[1].capital].x, s.map.nodes[a.id].y - s.map.nodes[s.factions[1].capital].y))[0];
  const o = s.officers.find(x => x.owner === far.owner && x.army === null), a = VM.Armies.spawn(s, far.owner, far.id, T({ infantry: 30 }), o.id);
  assert(VM.Fog.seesArmy(s, 1, a) && VM.Fog.seesCity(s, 1, far), 'no fog: all is seen');
  VM.Fog.setOn(s, true);
  assert(!VM.Fog.seesArmy(s, 1, a) && !VM.Fog.seesCity(s, 1, far), 'a faraway army and city are hidden'); assert(VM.Fog.seesArmy(s, far.owner, a), 'its own side sees it');
  const mine = s.cities.find(c => c.owner === 1), near = s.cities.find(c => c.owner !== 1 && Math.hypot(s.map.nodes[c.id].x - s.map.nodes[mine.id].x, s.map.nodes[c.id].y - s.map.nodes[mine.id].y) < VM.CFG.FOG.city);
  if (near) { assert(VM.Fog.seesCity(s, 1, near), 'a city next door is seen'); assert(VM.Fog.memory(s, 1, near.id), 'and remembered'); }
  assert(VM.Fog.memory(s, 1, far.id) === null && !VM.Fog.known(s, 1, far.id), 'the far city was never seen');
  VM.Fog.setOn(s, false); assert(!s.fog && VM.Fog.seesArmy(s, 1, a));
});

test('an army marching out lets its faction see more, and the memory keeps the last sighting', () => {
  const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false; VM.Fog.setOn(s, true);
  const f1 = s.cities.find(c => c.owner === 1), before = Object.keys(s.fog.mem[1]).length, tgt = s.cities.filter(c => c.owner > 1 && !VM.Fog.seesCity(s, 1, c))[0];
  const o = s.officers.find(x => x.owner === 1 && x.army === null && x.role !== 'governor'); const a = VM.Armies.spawn(s, 1, f1.id, T({ cavalry: 20 }), o.id);
  VM.Armies.move(s, a, tgt.id); VM.Sim.advance(s, 25);
  assert(Object.keys(s.fog.mem[1]).length > before, 'the army saw more places on its way');
});

test('save and load keep fog; games with fog are deterministic; the AI still plays and finishes', () => {
  const run = () => { const s = VM.Sim.create({ seed: 7, aiAll: true, factions: 5 }); VM.Fog.setOn(s, true); VM.Sim.advance(s, 600); return s; };
  const a = run(), b = run(); assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(b), 'same seed, same hash');
  const c = VM.Sim.load(VM.Sim.save(a)); assert(VM.Fog.on(c) && Object.keys(c.fog.mem).length > 0);
  assert(a.cities.some(c => c.owner !== 0) && a.time >= 600 - 1, 'the game ran');
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
