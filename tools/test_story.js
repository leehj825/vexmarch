// The campaign story: the fixed map, the cast, the texts in both languages, the beats and the ties. Run: node tools/test_story.js
const assert = require('assert');
const VM = require('./load');
const D = VM.StoryData;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }

test('the fixed map: 30 places, connected, roads never cross, every house is one connected piece, 6 neutral places', () => {
  const s = VM.Story.create({ player: 1 }), N = s.map.nodes, E = s.map.edges;
  assert.strictEqual(N.length, 30); assert(VM.World.connected(30, N.map(n => n.adj)), 'connected'); assert(N.every(n => n.adj.length >= 2), 'no dead ends');
  const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) { const [a, b] = E[i], [c, d] = E[j]; if (a === c || a === d || b === c || b === d) continue; assert(!(ccw(N[a], N[c], N[d]) !== ccw(N[b], N[c], N[d]) && ccw(N[a], N[b], N[c]) !== ccw(N[a], N[b], N[d])), `roads ${N[a].name}-${N[b].name} and ${N[c].name}-${N[d].name} cross`); }
  for (let h = 1; h <= 6; h++) {
    const mine = s.cities.filter(c => c.owner === h).map(c => c.id); assert.strictEqual(mine.length, 4, 'four places each');
    const seen = new Set([mine[0]]), q = [mine[0]]; while (q.length) { const u = q.pop(); for (const v of N[u].adj) if (mine.includes(v) && !seen.has(v)) { seen.add(v); q.push(v); } }
    assert.strictEqual(seen.size, 4, `house ${h} is in one piece`); assert(s.cities[s.factions[h].capital].spec === 'capital' && s.cities[s.factions[h].capital].owner === h);
  }
  assert.strictEqual(s.cities.filter(c => c.owner === 0).length, 6); assert.strictEqual(new Set(N.map(n => n.name)).size, 30, 'unique names');
  const vex = s.cities.find((c, i) => N[i].name === 'Vexholm'); assert(vex.owner === 0 && vex.buildings.wall === 3, 'Vexholm is neutral and walled');
});

test('the cast: 24 officers, four per house, unique, with a bio and a Korean name; ties point at real people', () => {
  const s = VM.Story.create({ player: 2 }); assert.strictEqual(s.officers.length, 24);
  for (let h = 1; h <= 6; h++) { assert.strictEqual(s.officers.filter(o => o.owner === h).length, 4); assert(s.cities[s.factions[h].capital].governor !== null); assert(s.officers.some(o => o.owner === h && o.role === 'governor' && o.loc === s.factions[h].capital)); }
  assert.strictEqual(new Set(s.officers.map(o => o.key)).size, 24);
  const keys = new Set(D.OFFICERS.map(o => o.key).concat(['ordan', 'brannoch', 'dagna', 'sevrin', 'edric']));
  for (const o of D.OFFICERS) { assert(o.bio.en && o.bio.ko && o.ko && VM.CFG.TRAITS.includes(o.trait), o.name); assert(o.stats.every(v => v >= 20 && v <= 95)); }
  for (const t of D.TIES) { assert(keys.has(t[1]) && keys.has(t[2]), 'tie ' + t.join()); }
});

test('every text exists in English and Korean', () => {
  const both = (t, where) => assert(t && typeof t.en === 'string' && t.en.length > 3 && typeof t.ko === 'string' && t.ko.length > 1, where);
  D.HISTORY.intro.forEach((t, i) => both(t, 'intro ' + i)); D.HISTORY.timeline.forEach((t, i) => both(t[1], 'timeline ' + i));
  D.FACTIONS.forEach(f => ['ruler', 'title', 'creed', 'wound', 'danger'].forEach(k => both(f[k], f.key + '.' + k)));
  for (let h = 1; h <= 6; h++) { both(D.OPENINGS[h], 'opening ' + h); both(D.ENDINGS[h], 'ending ' + h); }
  for (const k in D.BEATS) { both(D.BEATS[k].title, k); both(D.BEATS[k].text, k); assert(D.BEATS[k].text.en.split(/\s+/).length <= 80, k + ' is under 80 words'); }
  both(D.DEFEAT, 'defeat'); D.PLACES.forEach(p => assert(p.ko, p.name)); both(D.OFFICERS[0].role, 'role');
  const a = /\{(\w+)\}/g, same = t => { const f = x => (x.match(a) || []).sort().join(); return f(t.en) === f(t.ko); };
  for (const k in D.BEATS) assert(same(D.BEATS[k].text) && same(D.BEATS[k].title), k + ' has the same blanks in both languages');
});

test('a campaign runs for years, is deterministic, and survives save and load; the story opens with history and the house\'s own scene', () => {
  const mk = () => { const s = VM.Story.create({ player: 3 }); s.aiOn = true; return s; };
  const a = mk(), b = mk(); VM.Sim.advance(a, 720); VM.Sim.advance(b, 360); const c = VM.Sim.load(VM.Sim.save(b)); VM.Sim.advance(c, 360);
  assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(c)); assert.strictEqual(a.story.queue[0].id, 'history'); assert.strictEqual(a.story.queue[1].id, 'opening');
  assert(a.story.chronicle.length > 3 && a.story.chronicle.every(e => e.en && e.ko), 'a chronicle in both languages');
});

test('beats fire once, from the state of the game', () => {
  const s = VM.Story.create({ player: 1 }); VM.Sim.advance(s, 1); const fired = () => Object.keys(s.story.fired);
  assert(!fired().includes('letter')); VM.Sim.advance(s, 95); assert(fired().includes('letter'), 'Cael writes to Ysolde at day 90'); VM.Sim.advance(s, 10); assert(fired().includes('ledger'));
  const n = s.story.queue.filter(q => q.id === 'letter').length; VM.Sim.advance(s, 30); assert.strictEqual(s.story.queue.filter(q => q.id === 'letter').length, n, 'only once');
  const t = VM.Story.create({ player: 1 }); VM.Sim.advance(t, 1);
  const sera = t.officers.find(o => o.key === 'sera'), tomas = t.officers.find(o => o.key === 'tomas');
  const mk = (o, at) => VM.Armies.spawn(t, o.owner, at, { infantry: 10, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o.id), x = t.map.nodes.findIndex(n => n.name === 'Brackwater');
  const a = mk(sera, x), b = mk(tomas, x); VM.Sim.advance(t, 1); assert(a.fighting.includes(b.id)); VM.Sim.advance(t, 1); assert(t.story.fired.siblings_clash, 'Sera and Tomas meet in a fight');
  t.officers.find(o => o.key === 'varek').owner = -1; const u = VM.Story.create({ player: 1 }); u.officers.find(o => o.key === 'isaure').owner = -1; VM.Sim.advance(u, 120); assert(!u.story.fired.ledger, 'no debt beat if the creditor is gone');
});

test('the dead are remembered: a death raises a beat and a chronicle line, and grieving kin lose heart', () => {
  const s = VM.Story.create({ player: 1 }); VM.Sim.advance(s, 1);
  const sera = s.officers.find(o => o.key === 'sera'), tomas = s.officers.find(o => o.key === 'tomas'), l0 = tomas.loyalty;
  sera.owner = -1; sera.loc = null; VM.Eco.pushEvent(s, { type: 'officerDied', officer: sera.id, owner: 1 }); VM.Sim.advance(s, 1);
  assert(s.story.fired.first_death, 'a beat'); assert(s.story.queue.some(q => q.id === 'first_death' && q.title.en.includes('Sera Halde') && q.title.ko.includes('세라 할데')), 'with her name in both languages');
  assert(s.story.chronicle.some(c => /Sera Halde died/.test(c.en)), 'a chronicle line'); assert(tomas.loyalty < l0, 'her brother grieves');
});

test('ties: rivals fight 10% harder, a debt to a rival house weighs on loyalty, a friend among the captors makes joining likelier', () => {
  const s = VM.Story.create({ player: 1 }), plain = VM.World.create({ seed: 1, factions: 6 });
  const halric = s.officers.find(o => o.key === 'halric'), teodor = s.officers.find(o => o.key === 'teodor'), cael = s.officers.find(o => o.key === 'cael');
  const A = VM.Armies.spawn(s, 1, 0, { infantry: 5, spear: 0, cavalry: 0, archer: 0, siege: 0 }, halric.id), B = VM.Armies.spawn(s, 2, 0, { infantry: 5, spear: 0, cavalry: 0, archer: 0, siege: 0 }, teodor.id);
  assert.strictEqual(VM.Story.rivalMult(s, A, B), 1.1); const C = VM.Armies.spawn(s, 1, 0, { infantry: 5, spear: 0, cavalry: 0, archer: 0, siege: 0 }, cael.id); assert.strictEqual(VM.Story.rivalMult(s, C, B), 1);
  assert.strictEqual(VM.Story.rivalMult(plain, { officer: 0 }, { officer: 1 }), 1, 'no effect outside the campaign');
  const varek = s.officers.find(o => o.key === 'varek'); assert.strictEqual(VM.Story.loyaltyMod(s, varek), -10); assert.strictEqual(VM.Story.loyaltyMod(s, halric), 10, 'sworn to the ruler');
  assert.strictEqual(VM.Story.tieBonus(s, cael, 3), 0.2, 'Ysolde is among the Tessarune'); assert.strictEqual(VM.Story.tieBonus(s, cael, 6), 0);
});

test('the end: holding every place raises the house\'s own ending; losing everything raises the defeat', () => {
  const s = VM.Story.create({ player: 4 }); VM.Sim.advance(s, 1);
  s.over = { type: 'win', winner: 4, t: s.time }; VM.Sim.advance(s, 0.25); s.story.lastDay = -1; VM.Story.step(s);
  const e = s.story.queue.find(q => q.ending); assert(e && e.ending === 'win' && e.title.en === 'The Gate Compact' && e.text.ko.length > 20);
  const t = VM.Story.create({ player: 4 }); VM.Sim.advance(t, 1); t.over = { type: 'lose', winner: null, t: t.time }; t.story.lastDay = -1; VM.Story.step(t); assert(t.story.queue.some(q => q.ending === 'lose'));
});

test('house gifts: each house has one, only in the campaign; a house wins by its own aim after holding it long enough', () => {
  const s = VM.Story.create({ player: 6 }), plain = VM.World.create({ seed: 3, factions: 4, player: 1 });
  for (let h = 1; h <= 6; h++) { assert(D.TRAITS[h] && D.VICTORIES[h] && D.TRAITS[h].text.ko && D.VICTORIES[h].text.ko, 'gift and aim for house ' + h); }
  assert.strictEqual(VM.Story.bonus(s, 6, 'speed'), 0.2); assert.strictEqual(VM.Story.bonus(s, 1, 'speed'), 0); assert.strictEqual(VM.Story.bonus(plain, 1, 'army'), 0);
  const vex = D.PLACES.findIndex(p => p.name === 'Vexholm'), horse = D.PLACES.map((p, i) => p.spec === 'horse' ? i : -1).filter(i => i >= 0);
  assert(!VM.Story.victoryView(s, 6).met, 'not met at the start');
  for (const i of horse.concat(vex)) s.cities[i].owner = 6;
  assert(VM.Story.victoryView(s, 6).met, 'met once the places are held');
  for (let d = 0; d < 70 && !s.over; d++) { s.time += 1; s.story.lastDay = -1; VM.Story.step(s); }
  assert(s.over && s.over.special && s.over.type === 'win' && s.over.winner === 6, 'won by the aim after 60 days');
  const t = VM.Story.create({ player: 1 }); for (const i of horse.concat(vex)) t.cities[i].owner = 6;
  for (let d = 0; d < 70 && !t.over; d++) { t.time += 1; t.story.lastDay = -1; VM.Story.step(t); }
  assert(t.over && t.over.type === 'lose' && t.over.winner === 6, 'a rival can win that way too');
});

test('decisions: they come by day and by event, one at a time, with a price; honor moves officer loyalty', () => {
  const s = VM.Story.create({ player: 1 }); s.story.queue.length = 0; s.story.fired.history = 1;
  for (const k in D.DECISIONS) { const B = D.DECISIONS[k]; assert(B.choices.length === 2 && B.title.ko && B.text.ko, k); B.choices.forEach(c => assert(c.label.ko && c.result.ko && c.fx, k)); }
  s.time = 121; s.story.lastDay = -1; VM.Story.step(s);
  const it = s.story.queue.find(q => q.choices); assert(it && it.id === 'festival', 'the feast at day 120');
  const gold = s.factions[1].gold, loy = s.officers.find(o => o.owner === 1).loyalty;
  const r = VM.Commands.exec(s, { type: 'storyChoice', faction: 1, choice: 0 }); assert(r.ok && r.result.en);
  assert(s.factions[1].gold === gold - 200 && s.officers.find(o => o.owner === 1).loyalty === loy + 4 && VM.Story.honorOf(s.story) === 54, 'the price is paid');
  assert(!VM.Commands.exec(s, { type: 'storyChoice', faction: 1, choice: 1 }).ok, 'one choice only');
  s.story.queue.length = 0; s.time = 161; s.story.lastDay = -1; VM.Story.step(s); assert(!s.story.queue.some(q => q.choices), 'not before 40 days have passed');
  s.story.queue.length = 0; s.time = 201; s.story.lastDay = -1; VM.Story.step(s); assert(s.story.queue.some(q => q.id === 'deserters'));
  s.story.honor = 100; const o = s.officers.find(o => o.owner === 1 && o.key); assert(VM.Story.loyaltyMod(s, o) >= 5, 'a high honor steadies the officers');
  const t = VM.Sim.load(VM.Sim.save(s)); assert(t.story.queue.some(q => q.id === 'deserters'), 'saved with the game');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
