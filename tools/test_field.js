// The field battle layout: when a field view can start, who stands where, reserves, armies leaving and the fallen. Run: node tools/test_field.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }
const T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
function meet(a1 = { infantry: 60, archer: 20 }, a2 = { infantry: 60 }) {                       // two enemy armies that meet on the road between two cities
  const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false;
  const c1 = s.cities.find(c => c.owner === 1), nb = s.map.nodes[c1.id].adj.find(n => s.cities[n].owner !== 1) ?? s.map.nodes[c1.id].adj[0];
  const o1 = s.officers.find(o => o.owner === 1 && o.army === null && o.role !== 'governor'), o2 = s.officers.find(o => o.owner === 2 && o.army === null && o.role !== 'governor');
  const A = VM.Armies.spawn(s, 1, c1.id, T(a1), o1.id), B = VM.Armies.spawn(s, 2, nb, T(a2), o2.id);
  VM.Armies.move(s, A, nb); VM.Armies.move(s, B, c1.id);
  for (let i = 0; i < 400 && !(A.fighting.length); i++) VM.Sim.advance(s, 0.25);
  return { s, A, B };
}

test('a field view starts only while the army is fighting, and describes both sides facing each other', () => {
  const { s, A, B } = meet(); assert(A.fighting.length && B.fighting.length, 'the armies met');
  const an = VM.FieldLayout.start(s, A.id); assert(an && an.ids.includes(A.id) && an.ids.includes(B.id));
  const L = VM.FieldLayout.build(s, an); assert.strictEqual(L.armies.length, 2); assert.strictEqual(L.status, 'fighting');
  const a = L.armies.find(e => e.id === A.id), b = L.armies.find(e => e.id === B.id);
  assert(a.side === 0 && b.side === 1 && a.mode === 'fighting'); assert(a.soldiers > 0 && a.mix.archer > 0);
  assert(Math.hypot(a.x - b.x, a.z - b.z) < 12 && Math.hypot(a.x - b.x, a.z - b.z) > 2, 'the two fronts stand close, facing');
  assert(Math.abs(Math.cos(a.heading - b.heading) + 1) < 1e-6, 'and face opposite ways');
  const idle = VM.Sim.create({ seed: 4, factions: 5 }), q = idle.armies[0] || VM.Armies.spawn(idle, 1, idle.cities.find(c => c.owner === 1).id, T({ infantry: 5 }), idle.officers.find(o => o.owner === 1).id);
  assert.strictEqual(VM.FieldLayout.start(idle, q.id), null, 'no battle, no field view');
});

test('when the fight ends the view goes on: the loser leaves, a destroyed army lies on the field, and the status says it is over', () => {
  const { s, A, B } = meet({ infantry: 200 }, { infantry: 15 }); const an = VM.FieldLayout.start(s, A.id);
  let L = null; for (let i = 0; i < 400; i++) { VM.Sim.advance(s, 0.25); L = VM.FieldLayout.build(s, an); if (L.over) break; }
  assert(L.over && L.status === 'over', 'the fight ended'); assert(L.result.destroyed.length + L.result.routed.length >= 1, 'somebody lost');
  const ghost = L.armies.find(e => e.ghost); if (ghost) assert(ghost.mode === 'fallen' && ghost.fallen > 0 && ghost.soldiers === 0);
  assert(!L.result.destroyed.includes(1) && !L.result.routed.includes(1), 'the strong army was not beaten');
  VM.Sim.advance(s, 5); L = VM.FieldLayout.build(s, an); assert(L.over, 'it stays over; the view is not closed by the layout');
});

test('armies in reserve stand behind the front line', () => {
  const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false; const c = s.cities.find(x => x.owner === 3);
  let used = 0; const mk = (owner, n2) => { const o = s.officers.filter(x => x.army === null && x.role !== 'governor' && !x._u)[0]; o._u = true; o.owner = owner; return VM.Armies.spawn(s, owner, c.id, T({ infantry: n2 }), o.id); };
  const five = [40, 38, 36, 34, 32].map(n2 => mk(3, n2)), foe = mk(4, 300);
  VM.Sim.advance(s, 0.5); assert(five.some(a => a.reserve), 'a reserve exists');
  const an = VM.FieldLayout.start(s, foe.id); const L = VM.FieldLayout.build(s, an);
  const res = L.armies.filter(e => e.mode === 'reserve'), front = L.armies.filter(e => e.mode === 'fighting' && e.side === L.armies.find(r => r.mode === 'reserve').side);
  assert(res.length === 2 && front.length === 3, 'two in reserve, three in front');
  const d = e => Math.hypot(e.x, e.z); assert(res.every(r => front.every(f => d(r) > d(f))), 'the reserve stands further from the line');
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
