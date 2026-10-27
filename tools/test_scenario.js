// Scenarios: the random map, the fixed realm with no story, the siege of Vexholm: what each starts with, and that a scenario plays on and saves. Run: node tools/test_scenario.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }

test('the open ground is the random map, as before', () => {
  const s = VM.Scenario.create('open', { player: 1, seed: 3, factions: 5 }); assert(!s.story && s.map.nodes.length === 30 && s.factions.filter(f => !f.neutral).length === 5);
});

test('the fixed realm: 30 places, six houses, no story, a plain skirmish on the campaign\'s map', () => {
  const s = VM.Scenario.create('realm', { player: 2 }); assert(!s.story, 'no story'); assert.strictEqual(s.map.nodes.length, 30);
  assert.strictEqual(s.factions.filter(f => !f.neutral).length, 6); assert(s.map.nodes.some(n => n.name === 'Vexholm'));
  assert.strictEqual(s.player, 2);
});

test('the siege: Vexholm is held by another house behind walls, and your army is marching on it', () => {
  const s = VM.Scenario.create('siege', { player: 1 }); const v = s.cities.find(c => s.map.nodes[c.id].name === 'Vexholm');
  assert(v.owner !== 1 && v.owner !== 0 && v.buildings.wall >= 2 && v.wallHp > 0, 'held and walled');
  const mine = s.armies.find(a => a.owner === 1); assert(mine && mine.dest === v.id, 'your army is on its way to Vexholm');
  VM.Sim.advance(s, 3); assert(s.cities[v.id].contested || s.cities[v.id].besieged || s.armies.some(a => a.owner === 1 && a.at === v.id || a.edge && a.edge.to === v.id), 'it arrives and presses the city');
});

test('the siege as house 2 gives Vexholm to another house, so you are never besieging yourself', () => {
  const s = VM.Scenario.create('siege', { player: 2 }); const v = s.cities.find(c => s.map.nodes[c.id].name === 'Vexholm'); assert(v.owner !== 2);
});

test('a scenario plays on, is deterministic and saves', () => {
  const run = () => { const s = VM.Scenario.create('siege', { player: 1 }); s.aiOn = true; VM.Sim.advance(s, 120); return s; };
  const a = run(), b = run(); assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(b));
  const t = VM.Sim.load(VM.Sim.save(a)); assert.strictEqual(VM.Sim.hash(t), VM.Sim.hash(a));
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
