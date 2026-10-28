// Random events: effects on a city, expiry, bandits leaving when an army stands in the city, determinism, old saves. Run: node tools/test_hazards.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }
const T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
const world = seed => { const s = VM.Sim.create({ seed: seed || 3, factions: 5 }); s.aiOn = false; return s; };

test('off by default: no roll is spent and nothing happens', () => {
  const a = world(), b = world(); VM.Hazards.setOn(b, false); VM.Sim.advance(a, 400); VM.Sim.advance(b, 400);
  assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(b)); assert(!a.events.some(e => e.type === 'hazard'));
});

test('effects: a blight halves the food, a bounty raises it, plague kills people, bandits cut gold, and they run out', () => {
  const s = world(), c = s.cities.find(x => x.owner === 1); VM.Eco.refresh(s);
  const food0 = c.stats.foodProd, gold0 = c.stats.gold;
  c.mods = [{ kind: 'blight', food: VM.CFG.HAZARDS.blightFood, until: s.time + 10 }]; VM.Eco.refresh(s);
  assert(Math.abs(c.stats.foodProd - food0 * 0.5) < 1e-6, 'half the food');
  c.mods = [{ kind: 'bounty', food: 1.4, until: s.time + 10 }, { kind: 'bandits', gold: 0.6, until: s.time + 10 }]; VM.Eco.refresh(s);
  assert(c.stats.foodProd > food0 && Math.abs(c.stats.gold - gold0 * 0.6) < 1e-6);
  VM.Hazards.setOn(s, true); VM.Sim.advance(s, 11); assert(!(c.mods || []).some(e => e.until <= s.time), 'expired effects are gone');
});

test('bandits leave when an army of the owner stands in the city', () => {
  const s = world(), c = s.cities.find(x => x.owner === 1); VM.Hazards.setOn(s, true);
  c.mods = [{ kind: 'bandits', gold: 0.6, until: s.time + 100 }];
  const o = s.officers.find(x => x.owner === 1 && x.army === null && x.role !== 'governor'); VM.Armies.spawn(s, 1, c.id, T({ infantry: 20 }), o.id);
  VM.Sim.advance(s, 1); assert(!c.mods.some(e => e.kind === 'bandits'));
});

test('over some years every kind of event happens, only to owned cities, and the same seed gives the same game', () => {
  const run = () => { const s = world(5); VM.Hazards.setOn(s, true); VM.Sim.advance(s, 365 * 4); return s; };
  const a = run(), b = run(); assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(b), 'deterministic');
  const kinds = new Set(a.events.filter(e => e.type === 'hazard').map(e => e.kind)); assert(kinds.size >= 3, 'kinds seen: ' + [...kinds]);
  assert(a.events.filter(e => e.type === 'hazard').every(e => e.owner !== 0), 'free places are left alone');
});

test('unrest hits a city with a disloyal governor and costs garrison', () => {
  const s = world(), c = s.cities.find(x => x.owner === 1); VM.Hazards.setOn(s, true);
  c.garrison = T({ infantry: 100 }); const g = s.officers.find(x => x.owner === 1); c.governor = g.id; g.loyalty = 10;
  let hit = null; for (let i = 0; i < 400 && !hit; i++) { VM.Sim.advance(s, 1); hit = s.events.find(e => e.type === 'hazard' && e.kind === 'unrest' && e.city === c.id); g.loyalty = 10; }
  assert(hit && c.garrison.infantry < 100 && c.devastation > 0, 'unrest happened');
});

test('save and load keep the setting and the effects', () => {
  const s = world(); VM.Hazards.setOn(s, true); const c = s.cities.find(x => x.owner === 1); c.mods = [{ kind: 'blight', food: 0.5, until: 50 }];
  const t = VM.Sim.load(VM.Sim.save(s)); assert(VM.Hazards.on(t) && t.cities[c.id].mods.length === 1);
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
