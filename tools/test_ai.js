// Phase 5: AI factions, merging armies, difficulty, whole campaigns. Run: node tools/test_ai.js
const assert = require('assert');
const fs = require('fs');
const VM = require('./load');
const Y = VM.CFG.DAYS_PER_YEAR;
let passed = 0, failed = 0;
function test(name, fn) { const t = Date.now(); try { fn(); passed++; console.log('  ok   ' + name + (Date.now() - t > 3000 ? `  (${((Date.now() - t) / 1000).toFixed(1)}s)` : '')); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }

const T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
const size = a => VM.Armies.sizeOf(a);
const run = (s, d) => VM.Sim.advance(s, d);
const nodesOf = (s, f) => s.cities.filter(c => c.owner === f).length;
function officer(s, owner, stats) {
  const o = s.officers.find(x => x.owner === owner && x.army === null && x.role === 'idle' && !x._used) || s.officers.find(x => x.owner === 0 && x.army === null && !x._used);
  o._used = true; o.owner = owner; Object.assign(o, { command: 60, might: 40, intellect: 40, politics: 50, trait: 'Cautious' }, stats || {}); return o;
}
const army = (s, owner, at, troops, stats) => VM.Armies.spawn(s, owner, at, T(troops), officer(s, owner, stats).id);

// ---------- Merge, reinforce, keep ----------
test('merge: two armies in one place become one; the better commander leads; the other officer is freed', () => {
  const s = VM.Sim.create({ seed: 1 }), at = s.factions[1].capital;
  const a = army(s, 1, at, { infantry: 30 }, { command: 40 }), b = army(s, 1, at, { archer: 20, siege: 5 }, { command: 90 }); a.morale = 60; b.morale = 100;
  const oa = s.officers[a.officer], ob = s.officers[b.officer];
  assert(VM.Commands.exec(s, { type: 'mergeArmies', faction: 1, army: a.id, with: b.id }).ok);
  assert.strictEqual(s.armies.length, 1); assert.strictEqual(size(a), 55); assert.strictEqual(a.officer, ob.id);
  assert.strictEqual(oa.army, null); assert.strictEqual(oa.role, 'idle'); assert.strictEqual(oa.loc, at);
  assert(a.morale > 60 && a.morale < 100, 'morale is the weighted mean');
  const c = army(s, 1, at, { infantry: 1 }), d = army(s, 2, at, { infantry: 1 });
  assert(!VM.Commands.exec(s, { type: 'mergeArmies', faction: 1, army: c.id, with: d.id }).ok, 'not an enemy army');
  const e = army(s, 1, s.cities.find(x => x.owner === 1 && x.id !== at).id, { infantry: 1 });
  assert(!VM.Commands.exec(s, { type: 'mergeArmies', faction: 1, army: c.id, with: e.id }).ok, 'not in different places');
});

test('form with keep leaves a garrison behind; reinforce tops an army up from it', () => {
  const s = VM.Sim.create({ seed: 1 }), f = s.factions[1], c = s.cities[f.capital]; f.gold = 1e5;
  VM.Commands.exec(s, { type: 'recruit', faction: 1, city: c.id, troop: 'spear', count: 40 });
  const have = VM.Eco.troopsOf(c.garrison), o = officer(s, 1, {}); o.loc = c.id;
  const r = VM.Commands.exec(s, { type: 'formArmy', faction: 1, city: c.id, officer: o.id, keep: 10 });
  assert(r.ok); assert(Math.abs(VM.Eco.troopsOf(c.garrison) - 10) < 1e-6, 'kept 10'); assert(Math.abs(size(s.armies[0]) - (have - 10)) < 1e-6);
  VM.Commands.exec(s, { type: 'recruit', faction: 1, city: c.id, troop: 'archer', count: 20 });
  const n0 = size(s.armies[0]), rr = VM.Commands.exec(s, { type: 'reinforceArmy', faction: 1, army: s.armies[0].id, keep: 10 });
  assert(rr.ok && Math.abs(size(s.armies[0]) - n0 - 20) < 1e-6 && s.armies[0].troops.archer > 0);
  assert(!VM.Commands.exec(s, { type: 'reinforceArmy', faction: 1, army: s.armies[0].id, keep: 1e9 }).ok, 'nothing spare');
});

// ---------- Rules ----------
test('fair play: the AI changes the world only through commands (no direct edits of gold, food, population or garrisons)', () => {
  const src = fs.readFileSync(__dirname + '/../js/sim/ai.js', 'utf8').replace(/\/\/.*$/gm, '');
  for (const bad of [/\.gold\s*[-+*\/]?=[^=]/, /\.food\s*[-+*\/]?=[^=]/, /\.pop\s*[-+*\/]?=[^=]/, /garrison(\.\w+|\[[^\]]+\])\s*[-+*\/]?=[^=]/, /\.buildings(\.\w+|\[[^\]]+\])\s*[-+*\/]?=[^=>]/, /\.wallHp\s*[-+*\/]?=[^=]/])
    assert(!bad.test(src), 'ai.js must not match ' + bad);
});

test('AI is off unless enabled, and never plays the human faction', () => {
  const off = VM.Sim.create({ seed: 2 }); run(off, 400); assert.strictEqual(off.factions[2].ai.thinks, 0);
  const on = VM.Sim.create({ seed: 2, ai: true }); run(on, 400);
  assert(on.factions[2].ai.thinks > 10); assert.strictEqual(on.factions[1].ai.thinks, 0, 'player faction is left alone');
  const all = VM.Sim.create({ seed: 2, aiAll: true }); run(all, 100); assert(all.factions[1].ai.thinks > 3);
});

test('difficulty: harder AIs think more often', () => {
  const thinks = level => { const s = VM.Sim.create({ seed: 3, ai: true, difficulty: level }); run(s, 300); return s.factions[2].ai.thinks; };
  const e = thinks('easy'), n = thinks('normal'), h = thinks('hard');
  assert(e < n && n < h, `${e} < ${n} < ${h}`);
});

// ---------- Behaviour ----------
test('staffing: AI cities get governors and policies; a threatened city moves to Fortify', () => {
  const s = VM.Sim.create({ seed: 5, ai: true }); run(s, 60);
  const mine = s.cities.filter(c => c.owner === 2);
  assert(mine.some(c => c.governor !== null && c.policy !== 'manual'), 'governors with policies');
  const c = mine.find(x => x.governor !== null && x.policy !== 'fortify');
  if (c) { const foe = s.map.nodes[c.id].adj[0]; s.cities[foe].owner = 3; run(s, 12); assert.strictEqual(c.policy, 'fortify'); }
});

test('expansion: the AI factions claim the neutral nodes within a few years', () => {
  const s = VM.Sim.create({ seed: 8, ai: true }); const n0 = [2, 3, 4, 5].map(f => nodesOf(s, f)), neutral0 = s.cities.filter(c => c.owner === 0).length; run(s, Y * 4);
  const gained = [2, 3, 4, 5].reduce((a, f, i) => a + Math.max(0, nodesOf(s, f) - n0[i]), 0);
  assert(gained >= 3, `AI factions gained ${gained} nodes in 4 years`);
  assert(s.cities.filter(c => c.owner === 0).length < neutral0, 'fewer neutral nodes left');
});

test('defence: a small human raid on an AI city does not walk in', () => {
  let held = 0;
  for (const seed of [1, 2, 3]) {
    const s = VM.Sim.create({ seed, ai: true, difficulty: 'normal' }); run(s, Y * 2);
    const c = s.cities.find(x => x.owner === 2 && x.spec !== 'capital') || s.cities.find(x => x.owner === 2);
    const nb = s.map.nodes[c.id].adj[0], raider = army(s, 1, nb, { infantry: 20 }); VM.Armies.move(s, raider, c.id);
    run(s, 80); if (s.cities[c.id].owner === 2) held++;
  }
  assert(held >= 2, `the AI held ${held}/3`);
});

test('the AI recruits wanderers and spends on troops instead of hoarding', () => {
  const s = VM.Sim.create({ seed: 4, ai: true }); run(s, Y * 6);
  for (const f of s.factions.filter(x => !x.neutral && x.id !== 1 && x.alive)) assert(f.gold < 60000, `${f.name} is not hoarding (${Math.round(f.gold)})`);
  assert(s.officers.length > VM.CFG.OFFICER_COUNT, 'new officers appeared');
});

// ---------- Whole campaigns ----------
const campaign = (seed, levels, years) => {
  const s = VM.Sim.create({ seed, aiAll: true, factions: levels.length });
  s.factions.forEach((f, i) => { if (!f.neutral) f.ai.level = levels[i - 1]; });
  for (let y = 0; y < years && !s.over; y++) run(s, Y);
  return s;
};

test('campaigns finish: AI-vs-AI games always end with one faction holding all 30 nodes', () => {
  const durations = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = campaign(seed, ['normal', 'normal', 'normal', 'normal', 'normal'], 30);
    assert(s.over, `seed ${seed} did not finish`); assert(s.over.winner > 0 && s.cities.every(c => c.owner === s.over.winner));
    for (const f of s.factions) { assert(Number.isFinite(f.gold) && f.gold >= 0 && Number.isFinite(f.food) && f.food >= 0); }
    durations.push(Math.round(s.time / Y * 10) / 10);
  }
  console.log(`       (years to finish: ${durations.join(', ')})`);
  assert(Math.max(...durations) <= 20, 'no endless games');
});

test('campaigns finish with four factions and with six', () => {
  for (const n of [4, 6]) { const s = campaign(7, Array(n).fill('normal'), 30); assert(s.over, `${n} factions did not finish`); }
});

test('no stalls: every living AI faction keeps acting (armies formed, battles or captures) in every 5-year window', () => {
  const s = VM.Sim.create({ seed: 11, aiAll: true }); let lastWin = new Set();
  for (let w = 0; w < 4 && !s.over; w++) {
    const start = s.events.length ? s.events[s.events.length - 1].n : 0, nArm = new Set();
    VM.Sim.advance(s, Y * 2.5, st => st.armies.forEach(a => nArm.add(a.owner)));
    for (const f of s.factions.filter(x => !x.neutral && x.alive && !s.over)) assert(nArm.has(f.id) || nodesOf(s, f.id) <= 1, `${f.name} fielded no army in window ${w}`);
  }
});

test('the human side can win: a hard player-faction beats easy rivals most of the time (win flow, over.type = win)', () => {
  let wins = 0; const N = 8;
  for (let seed = 1; seed <= N; seed++) {
    const s = campaign(seed, ['hard', 'easy', 'easy', 'easy', 'easy'], 30);
    if (s.over && s.over.type === 'win' && s.over.winner === 1) wins++;
  }
  assert(wins >= N * 0.6, `hard won ${wins}/${N}`);
});

test('the human side can lose: a passive player is conquered or at least loses ground to normal AIs', () => {
  let lost = 0, ground = 0; const N = 6;
  for (let seed = 1; seed <= N; seed++) {
    const s = VM.Sim.create({ seed, ai: true, difficulty: 'normal' }); const start = nodesOf(s, 1);
    for (let y = 0; y < 25 && !s.over; y++) run(s, Y);
    if (s.over && s.over.type === 'lose') lost++;
    if (nodesOf(s, 1) < start) ground++;
  }
  console.log(`       (passive player: defeated ${lost}/${N}, lost territory ${ground}/${N})`);
  assert(ground >= 4, 'the AI attacks a passive neighbour');
});

test('difficulty matters: over many games hard holds more land than easy', () => {
  const nodes = { easy: 0, normal: 0, hard: 0 }, base = ['easy', 'normal', 'hard', 'normal', 'hard'];
  for (let seed = 1; seed <= 12; seed++) {
    const levels = base.map((_, i) => base[(i + seed) % 5]); const s = campaign(seed, levels, 12);
    s.factions.filter(f => !f.neutral).forEach((f, i) => { nodes[levels[i]] += nodesOf(s, f.id); });
  }
  console.log('       (land held after 12 years, 12 games: ' + JSON.stringify(nodes) + ')');
  assert(nodes.hard / 2 > nodes.easy, 'hard beats easy');
});

test('AI games are deterministic and survive save/load', () => {
  const a = campaign(9, Array(5).fill('normal'), 4), b = campaign(9, Array(5).fill('normal'), 4);
  assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(b));
  const c = VM.Sim.load(VM.Sim.save(a)); run(a, 300); run(c, 300); assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(c));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
