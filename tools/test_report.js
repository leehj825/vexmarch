// Battle reports: one per fight, with start and end sizes, how it ended, kept and saved. Run: node tools/test_report.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }
const T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
function battle(a1, a2) {
  const s = VM.Sim.create({ seed: 4, factions: 5 }); s.aiOn = false; const x = s.cities.find(c => c.owner === 0 && c.spec !== 'pass'); x.garrison = T({});
  const o1 = s.officers.find(o => o.owner === 1 && o.army === null && o.role !== 'governor'), o2 = s.officers.find(o => o.owner === 2 && o.army === null && o.role !== 'governor');
  const A = VM.Armies.spawn(s, 1, x.id, T({ infantry: a1 }), o1.id), B = VM.Armies.spawn(s, 2, x.id, T({ infantry: a2 }), o2.id);
  return { s, A, B };
}

test('a fight that ends gives a report: the winner, the sizes at start and end, the place', () => {
  const { s, A, B } = battle(200, 20); VM.Sim.advance(s, 40);
  const R = VM.Report.list(s); assert.strictEqual(R.length, 1, 'one report: ' + R.length);
  const r = R[0]; assert.strictEqual(r.outcome, 'won'); assert.strictEqual(r.winner, 1);
  const w = r.sides.find(x => x.owner === 1), l = r.sides.find(x => x.owner === 2);
  assert(w.start === 200 && w.end < 200 && w.lost > 0, 'the winner lost some'); assert(l.destroyed || l.routed || l.end < 0.2 * l.start, 'the loser was beaten'); assert(r.at !== undefined && r.end > r.t);
  assert(s.events.some(e => e.type === 'report' && e.report === 0));
});

test('a fight still going has no report yet', () => {
  const { s } = battle(50, 50); VM.Sim.advance(s, 0.5); assert.strictEqual(VM.Report.list(s).length, 0, 'still going');
});

test('reports are kept to the last 40 and saved with the game', () => {
  const { s } = battle(200, 20); VM.Sim.advance(s, 40); assert.strictEqual(VM.Report.list(s).length, 1);
  const t = VM.Sim.load(VM.Sim.save(s)); assert.strictEqual(VM.Report.list(t).length, 1);
  const R = VM.Report.list(s); for (let i = 0; i < 45; i++) R.push({ t: 0, end: 0, at: 0, outcome: 'won', winner: 1, sides: [] });     // 46 kept now
  const x = s.cities.find(c => c.owner === 0 && c.spec !== 'pass'), o1 = s.officers.find(o => o.owner === 1 && o.army === null && o.role !== 'governor'), o2 = s.officers.find(o => o.owner === 2 && o.army === null && o.role !== 'governor');
  VM.Armies.spawn(s, 1, x.id, T({ infantry: 200 }), o1.id); VM.Armies.spawn(s, 2, x.id, T({ infantry: 20 }), o2.id); VM.Sim.advance(s, 40);
  assert.strictEqual(VM.Report.list(s).length, 40, 'trimmed to 40 when a new report is added');
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
