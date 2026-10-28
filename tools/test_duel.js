// Generals' duels: only in a fight, one each cool-down, the stronger general likelier to win, effects on morale and loyalty, deterministic. Run: node tools/test_duel.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }
const ex = (s, f, c) => VM.Commands.exec(s, Object.assign({ faction: f }, c));
const T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
function fight(strongOfficer = true) {
  const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false; const x = s.cities.find(c => c.owner === 0 && c.spec !== 'pass'); x.garrison = T({});
  const o1 = s.officers.find(o => o.owner === 1 && o.army === null && o.role !== 'governor'), o2 = s.officers.find(o => o.owner === 2 && o.army === null && o.role !== 'governor');
  o1.command = o1.might = o1.intellect = strongOfficer ? 90 : 20; o2.command = o2.might = o2.intellect = strongOfficer ? 20 : 90;
  const A = VM.Armies.spawn(s, 1, x.id, T({ infantry: 40 }), o1.id), B = VM.Armies.spawn(s, 2, x.id, T({ infantry: 40 }), o2.id);
  VM.Sim.advance(s, 0.25); return { s, A, B, o1, o2 };
}

test('a duel is only possible while your army fights an enemy army; not otherwise', () => {
  const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false; const x = s.cities.find(c => c.owner === 0 && c.spec !== 'pass');
  const o1 = s.officers.find(o => o.owner === 1 && o.army === null), A = VM.Armies.spawn(s, 1, x.id, T({ infantry: 10 }), o1.id);
  const o2 = s.officers.find(o => o.owner === 2 && o.army === null), B = VM.Armies.spawn(s, 2, x.id, T({ infantry: 10 }), o2.id);
  assert(!ex(s, 1, { type: 'duel', army: A.id, target: B.id }).ok, 'no fight yet');
});

test('the stronger general wins most of the time; the loser\'s army loses morale and its general loses loyalty', () => {
  let wins = 0; for (let seed = 1; seed <= 30; seed++) { const { s, A, B, o1, o2 } = fight(true); s.rng = seed * 7919; const r = ex(s, 1, { type: 'duel', army: A.id, target: B.id }); assert(r.ok, JSON.stringify(r)); if (r.won) wins++; }
  assert(wins >= 25, 'the strong general won ' + wins + ' of 30');
  const { s, A, B, o1, o2 } = fight(true); const m1 = A.morale, m2 = B.morale, l2 = o2.loyalty; s.rng = 5; const r = ex(s, 1, { type: 'duel', army: A.id, target: B.id });
  if (r.won) assert(B.morale < m2 && A.morale >= m1 - 0.01 && o2.loyalty < l2, 'the loser is hurt'); else assert(A.morale < m1 && B.morale >= m2 - 0.01, 'the loser is hurt');
});

test('a general duels once in a while: the next duel waits for the cool-down', () => {
  const { s, A, B, o1, o2 } = fight(false); assert(ex(s, 1, { type: 'duel', army: A.id, target: B.id }).ok);
  assert(!ex(s, 1, { type: 'duel', army: A.id, target: B.id }).ok, 'recovering');
  assert(o1.duelReady > s.time && o2.duelReady > s.time, 'both generals rest for the cool-down');
  VM.Sim.advance(s, VM.CFG.DUEL.cool + 1); assert(s.time >= o1.duelReady, 'and are ready after it');
});

test('the same game gives the same duel', () => {
  const run = () => { const { s, A, B } = fight(false); s.rng = 42; ex(s, 1, { type: 'duel', army: A.id, target: B.id }); return VM.Sim.hash(s); };
  assert.strictEqual(run(), run());
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
