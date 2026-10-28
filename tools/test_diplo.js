// Diplomacy (Phase 11): alliances, breaking, merge, AI answers, determinism. Run: node tools/test_diplo.js
const assert = require('assert');
const VM = require('./load');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n      '))); } }
const T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
function world(seed) { const s = VM.Sim.create({ seed: seed || 1 }); s.aiOn = false; s.factions.forEach(f => { if (!f.neutral) { f.gold = 1e6; f.food = 1e6; } }); return s; }
let used = 0;
function officer(s, owner) { const o = s.officers.find(x => x.owner === owner && x.army === null && x.role !== 'governor' && !x._u) || s.officers.find(x => x.owner === 0 && x.army === null && !x._u); o._u = true; o.owner = owner; Object.assign(o, { command: 60, might: 40, intellect: 40, politics: 50 }); return o; }
const army = (s, owner, at, t) => VM.Armies.spawn(s, owner, at, T(t), officer(s, owner).id);
const run = (s, d) => VM.Sim.advance(s, d);
const ex = (s, f, c) => VM.Commands.exec(s, Object.assign({ faction: f }, c));
const ally = (s, a, b) => VM.Diplo.ensure(s) && VM.Diplo.proposeAlliance(s, a, b) && (VM.Diplo.allied(s, a, b) || (VM.Diplo.ensure(s).allies.push({ a, b, since: s.time }), 1));
const capOf = (s, f) => s.factions[f].capital;

test('hostile and friendly: everybody is an enemy until allied', () => {
  const s = world(); VM.Diplo.ensure(s);
  assert(VM.Diplo.hostile(s, 1, 2) && !VM.Diplo.friendly(s, 1, 2) && VM.Diplo.friendly(s, 1, 1) && VM.Diplo.hostile(s, 1, 0));
  VM.Diplo.ensure(s).allies.push({ a: 1, b: 2, since: 0 });
  assert(VM.Diplo.allied(s, 2, 1) && VM.Diplo.friendly(s, 1, 2) && VM.Diplo.hostile(s, 1, 3) && VM.Diplo.allyOf(s, 1) === 2);
});

test('allied armies do not fight each other, enemy armies do', () => {
  const s = world(), x = s.cities.find(c => c.owner === 0 && c.spec !== 'pass'); x.garrison = T({});
  const a = army(s, 1, x.id, { infantry: 40 }), b = army(s, 2, x.id, { infantry: 40 });
  run(s, 1); assert(a.fighting.length && b.fighting.length, 'enemies fight');
  const s2 = world(), x2 = s2.cities.find(c => c.owner === 0 && c.spec !== 'pass'); x2.garrison = T({});
  VM.Diplo.ensure(s2).allies.push({ a: 1, b: 2, since: 0 });
  const a2 = army(s2, 1, x2.id, { infantry: 40 }), b2 = army(s2, 2, x2.id, { infantry: 40 });
  run(s2, 5); assert(!a2.fighting.length && !b2.fighting.length, 'allies do not'); assert(VM.Armies.sizeOf(a2) === 40 && VM.Armies.sizeOf(b2) === 40);
});

test('an allied army stands in a city without a siege, capture or contest; an enemy one does not', () => {
  const s = world(); VM.Diplo.ensure(s).allies.push({ a: 1, b: 2, since: 0 });
  const city = s.cities[capOf(s, 2)]; city.garrison = T({});
  army(s, 1, city.id, { infantry: 80 }); run(s, 12);
  assert.strictEqual(city.owner, 2, 'the ally keeps its city'); assert(!city.besieged && !city.contested);
  const s2 = world(); const c2 = s2.cities[capOf(s2, 2)]; c2.garrison = T({}); c2.wallHp = 0;
  army(s2, 1, c2.id, { infantry: 80 }); run(s2, 12);
  assert.strictEqual(c2.owner, 1, 'an enemy takes it');
});

test('allied armies can march through an ally\'s city and are not halted', () => {
  const s = world(); VM.Diplo.ensure(s).allies.push({ a: 1, b: 2, since: 0 });
  const mid = s.cities[capOf(s, 2)], from = s.cities[capOf(s, 1)];
  const path = VM.Armies.path(s, from.id, mid.id); assert(path.length >= 2, 'path exists');
  for (const n of path) { const c = s.cities[n]; if (c.owner !== 1) { c.owner = 2; c.garrison = T({}); } }
  const a = army(s, 1, from.id, { infantry: 30 }); VM.Armies.move(s, a, mid.id); run(s, 200);
  assert.strictEqual(a.at, mid.id, 'arrived at the ally\'s city'); assert(!s.events.some(e => e.type === 'blocked' && e.army === a.id));
});

test('breaking a pact: trust and opinion fall, officers grumble, cool-down, armies turn hostile', () => {
  const s = world(), D = VM.Diplo; D.ensure(s).allies.push({ a: 1, b: 2, since: 0 });
  const o = s.officers.find(x => x.owner === 1), l0 = o.loyalty; const loy = s.officers.filter(x => x.owner === 1).map(x => x.loyalty);
  assert(ex(s, 1, { type: 'breakAlliance' }).ok); assert(!D.allied(s, 1, 2));
  assert(D.trust(s, 1) <= -30 && D.op(s, 3, 1) <= -29 && D.op(s, 2, 1) <= -59, 'reputation drops');
  assert(s.officers.filter(x => x.owner === 1).every((x, i) => x.loyalty < loy[i]), 'loyalty drops');
  assert(!ex(s, 1, { type: 'breakAlliance' }).ok, 'nothing left to break');
  assert(D.whyNot(s, 1, 2), 'cool-down on a new pact');
  assert(s.events.some(e => e.type === 'allyBroken' && e.by === 1));
});

test('alliance: a human proposal to an AI is answered at once by the score; a refusal sets a cool-down', () => {
  const s = world(), D = VM.Diplo; D.ensure(s);
  const r = ex(s, 1, { type: 'proposeAlliance', to: 2 }); assert(r.ok && r.accepted === false, 'equal strangers say no: ' + JSON.stringify(r));
  assert(!ex(s, 1, { type: 'proposeAlliance', to: 2 }).ok, 'cool-down');
  // a common threat and goodwill changes the answer
  const s2 = world(); D.ensure(s2); for (const c of s2.cities) if (c.owner === 3) c.pop *= 4;
  D.addOp(s2, 2, 1, 40);
  const r2 = ex(s2, 1, { type: 'proposeAlliance', to: 2 }); assert(r2.ok && r2.accepted, 'a threat plus goodwill: ' + JSON.stringify(D.allianceScore(s2, 2, 1)));
  assert(D.allied(s2, 1, 2) && !ex(s2, 1, { type: 'proposeAlliance', to: 4 }).ok, 'only one ally');
});

test('alliance: an oath-breaker is refused', () => {
  const s = world(), D = VM.Diplo; D.ensure(s); D.ensure(s).trust[1] = -60; D.addOp(s, 2, 1, 60); for (const c of s.cities) if (c.owner === 3) c.pop *= 4;
  assert.strictEqual(ex(s, 1, { type: 'proposeAlliance', to: 2 }).accepted, false);
});

test('gifts raise opinion, cost gold and have a cool-down', () => {
  const s = world(), D = VM.Diplo; D.ensure(s); const g0 = s.factions[1].gold;
  assert(ex(s, 1, { type: 'giftFaction', to: 2, gold: 100 }).ok); assert(D.op(s, 2, 1) >= 4 && s.factions[1].gold === g0 - 100);
  assert(!ex(s, 1, { type: 'giftFaction', to: 2, gold: 100 }).ok, 'cool-down'); run(s, 11);
  assert(ex(s, 1, { type: 'giftFaction', to: 2, gold: 300 }).ok);
});

test('opinion settles toward zero; allies drift friendlier; a captured city sours a faction', () => {
  const s = world(), D = VM.Diplo; D.ensure(s); D.addOp(s, 1, 2, 30); run(s, 100); assert(D.op(s, 1, 2) < 30 - 10 && D.op(s, 1, 2) >= 0);
  D.ensure(s).allies.push({ a: 3, b: 4, since: s.time }); run(s, 500); assert(D.op(s, 3, 4) >= 40, 'allies like each other: ' + D.op(s, 3, 4));
  const c = s.cities.find(x => x.owner === 5); D.onCapture(s, c, 6, 5); assert(D.op(s, 5, 6) <= -10);
});

test('merge: needs a big strength gap; transfers cities, armies, officers, gold and food; loses nothing', () => {
  const s = world(), D = VM.Diplo; D.ensure(s);
  assert(D.canMerge(s, 1, 2), 'equals cannot merge');
  for (const c of s.cities) if (c.owner === 2) { c.pop = 20; for (const k in c.garrison) c.garrison[k] = 0; }
  assert.strictEqual(D.canMerge(s, 1, 2), null);
  const cities = s.cities.filter(c => c.owner === 2).length, offs = s.officers.filter(o => o.owner === 2).length;
  const a = army(s, 2, capOf(s, 2), { infantry: 5 }); const gold = s.factions[1].gold + s.factions[2].gold, food = s.factions[1].food + s.factions[2].food;
  const pops = s.cities.filter(c => c.owner === 2).map(c => c.pop);
  D.doMerge(s, 1, 2);
  assert(s.factions[2].alive === false && s.factions[2].merged === 1);
  assert(s.cities.filter(c => c.owner === 1).length >= cities && !s.cities.some(c => c.owner === 2));
  assert.strictEqual(a.owner, 1); assert(s.officers.filter(o => o.owner === 2).length === 0);
  assert(s.officers.filter(o => o.owner === 1).length >= offs); assert(s.factions[1].gold === gold && s.factions[1].food === food);
  assert(s.events.some(e => e.type === 'merged' && e.from === 2 && e.owner === 1));
  assert(D.canMerge(s, 1, 3), 'cool-down after a merge'); assert(!s.over, 'the game goes on');
});

test('merge: the AI answers by survival; a brave leader fights on, a cautious one in trouble yields', () => {
  const mk = trait => { const s = world(), D = VM.Diplo; D.ensure(s);
    for (const c of s.cities) if (c.owner === 2) { c.pop = 20; for (const k in c.garrison) c.garrison[k] = 0; }
    const L = D.leaderOf(s, 2); L.trait = trait; return s; };
  const sb = mk('Brave'), sc = mk('Cautious');
  sc.cities[capOf(sc, 2)].besieged = true;
  const rb = ex(sb, 1, { type: 'proposeMerge', to: 2 }), rc = ex(sc, 1, { type: 'proposeMerge', to: 2 });
  assert(rb.ok && rb.accepted === false, 'brave refuses: ' + JSON.stringify(VM.Diplo.survival(sb, 2, 1)));
  assert(rc.ok && rc.accepted === true, 'cautious in a siege yields: ' + JSON.stringify(VM.Diplo.survival(sc, 2, 1)));
  assert(!ex(sb, 1, { type: 'proposeMerge', to: 2 }).ok, 'cool-down after a refusal');
});

test('merge offers to the player wait for an answer; declining fights on; accepting ends the game', () => {
  const s = world(), D = VM.Diplo; D.ensure(s); s.player = 1;
  for (const c of s.cities) if (c.owner === 1) { c.pop = 20; for (const k in c.garrison) c.garrison[k] = 0; }
  const r = D.proposeMerge(s, 2, 1); assert(r.ok && r.pending);
  const off = D.ensure(s).offers[0]; assert(off && off.kind === 'merge' && off.to === 1);
  assert(ex(s, 1, { type: 'answerOffer', offer: off.id, accept: false }).ok && !D.ensure(s).offers.length && !s.over);
  assert(D.proposeMerge(s, 2, 1).ok === false, 'cool-down after a decline');
  D.ensure(s).cool = {}; D.proposeMerge(s, 2, 1); const o2 = D.ensure(s).offers[0];
  assert(ex(s, 1, { type: 'answerOffer', offer: o2.id, accept: true }).ok);
  assert(s.over && s.over.type === 'merged' && s.over.winner === 2);
});

test('offers lapse after a while', () => {
  const s = world(), D = VM.Diplo; D.ensure(s); s.player = 1; s.aiOn = false;
  D.proposeAlliance(s, 2, 1); assert(D.ensure(s).offers.length === 1); run(s, 25); assert(D.ensure(s).offers.length === 0);
});

test('the AI betrays an ally at the end, not before', () => {
  const s = world(), D = VM.Diplo; D.ensure(s); s.aiOn = true;
  D.ensure(s).allies.push({ a: 1, b: 2, since: 0 }); const f = s.factions[1]; f.ai.dnext = 1e9;
  s.time = 50; D.think(s, f); assert(D.allied(s, 1, 2), 'too young a pact');
  s.time = 120; D.think(s, f); assert(D.allied(s, 1, 2), 'no leader yet');
  for (const c of s.cities) if (c.owner > 2 || c.owner === 0) c.owner = 1;            // the two of them hold everything
  s.cities.filter(c => c.owner === 1).slice(0, 2).forEach(c => { c.owner = 2; });
  const L = D.leaderOf(s, 1); L.trait = 'Rash'; D.think(s, f);
  assert(!D.allied(s, 1, 2), 'with the realm to themselves the pact is broken'); assert(D.trust(s, 1) < 0);
});

test('a loyal leader keeps the pact to the end', () => {
  const s = world(), D = VM.Diplo; D.ensure(s); D.ensure(s).allies.push({ a: 1, b: 2, since: 0 }); s.time = 200;
  for (const c of s.cities) if (c.owner > 2 || c.owner === 0) c.owner = 1; s.cities.filter(c => c.owner === 1).slice(0, 2).forEach(c => { c.owner = 2; });
  D.leaderOf(s, 1).trait = 'Loyal'; D.think(s, s.factions[1]); assert(D.allied(s, 1, 2));
});

test('allies are no targets for the AI and win does not count a shared realm', () => {
  const s = world(), D = VM.Diplo; D.ensure(s).allies.push({ a: 1, b: 2, since: 0 });
  for (const c of s.cities) c.owner = c.owner === 2 ? 2 : 1;
  VM.War.checkOver(s); assert(!s.over, 'allies together do not end the game: someone must betray');
});

test('a player in a campaign: story ties move opinions at the start', () => {
  const s = VM.Story.create({ player: 1 }); s.aiOn = false; VM.Diplo.ensure(s);
  let any = false; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a !== b && VM.Diplo.op(s, a, b) !== 0) any = true;
  assert(any, 'some opinion comes from ties between houses');
});

test('campaign: a proud house never bends the knee; pacts and betrayals reach the chronicle', () => {
  const s = VM.Story.create({ player: 2 }); s.aiOn = false; const D = VM.Diplo; D.ensure(s);
  for (const c of s.cities) if (c.owner === 1) { c.pop = 20; for (const k in c.garrison) c.garrison[k] = 0; }
  s.cities[s.factions[1].capital].besieged = true; D.leaderOf(s, 1).trait = 'Cautious';
  const r = D.proposeMerge(s, 3, 1); assert(r.ok && r.accepted === false, 'Kaldrath refuses: ' + JSON.stringify(D.survival(s, 1, 3)));
  D.proposeAlliance(s, 2, 4); D.ensure(s).allies.length || D.ensure(s).allies.push({ a: 2, b: 4, since: 0 }); VM.Eco.pushEvent(s, { type: 'allied', a: 2, b: 4 }); D.breakAlliance(s, 4);
  VM.Sim.advance(s, 3); assert(s.story.chronicle.some(c => /oath|pact/i.test(c.en || c.text && c.text.en || JSON.stringify(c))), 'the chronicle remembers');
});

test('old saves without diplomacy state load and run', () => {
  const s = world(); delete s.diplo; const t = VM.Sim.load(VM.Sim.save(s)); run(t, 5); assert(t.diplo && Array.isArray(t.diplo.allies));
});

test('determinism with diplomacy on: same seed, same hash', () => {
  const mk = () => { const s = VM.Sim.create({ seed: 7 }); s.aiAll = true; s.aiOn = true; run(s, 400); return VM.Sim.hash(s); };
  assert.strictEqual(mk(), mk());
});

test('AI-vs-AI: diplomacy happens, state stays sane for five years', () => {
  let pacts = 0, merges = 0, breaks = 0;
  for (const seed of [1, 2, 3, 4]) {
    const s = VM.Sim.create({ seed }); s.aiAll = true; s.aiOn = true;
    VM.Sim.advance(s, 1800, st => { for (const e of st.events) { if (e.n > (st._seen || 0)) { if (e.type === 'allied') pacts++; if (e.type === 'merged') merges++; if (e.type === 'allyBroken') breaks++; } } st._seen = st.nextEvent || 0; });
    const d = s.diplo; for (const p of d.allies) assert(s.factions[p.a].alive && s.factions[p.b].alive, 'no pact with the dead');
    const seen = new Set(); for (const p of d.allies) { assert(!seen.has(p.a) && !seen.has(p.b), 'one ally each'); seen.add(p.a); seen.add(p.b); }
    for (const a in d.opinion) for (const b in d.opinion[a]) assert(Number.isFinite(d.opinion[a][b]) && Math.abs(d.opinion[a][b]) <= 100);
    assert(s.cities.every(c => c.owner === 0 || s.factions[c.owner].alive), 'every city has a living owner');
  }
  console.log(`       (pacts ${pacts}, merges ${merges}, breaks ${breaks})`);
});

test('ask for help: an ally sends its idle armies to a threatened city, then goes back to its own orders; no help without a threat', () => {
  const s = world(); VM.Diplo.ensure(s).allies.push({ a: 1, b: 2, since: 0 });
  assert(!ex(s, 1, { type: 'askAid' }).ok, 'nothing threatens us yet');
  const mine = s.cities.find(c => c.owner === 1), helper = army(s, 2, s.cities[capOf(s, 2)].id, { infantry: 60 });
  mine.besieged = true;
  const r = ex(s, 1, { type: 'askAid' }); assert(r.ok && r.sent === 1 && r.city === mine.id, JSON.stringify(r));
  assert(helper.aid && helper.aid.city === mine.id && helper.dest === mine.id, 'the army is on its way');
  assert(!ex(s, 1, { type: 'askAid' }).ok, 'cool-down');
  mine.besieged = false; run(s, 3); assert(helper.aid, 'still helping');
  run(s, VM.CFG.DIPLO.aidDays + 5); assert(!helper.aid && helper.order !== 'hold', 'back to its own orders');
});

test('an AI ally helps a partner under siege on its own', () => {
  const s = world(); s.aiOn = true; VM.Diplo.ensure(s).allies.push({ a: 1, b: 2, since: 0 });
  const mine = s.cities.find(c => c.owner === 1), helper = army(s, 2, s.cities[capOf(s, 2)].id, { infantry: 60 });
  army(s, 3, mine.id, { infantry: 200 }); run(s, 3);
  assert(helper.aid && helper.aid.for === 1, 'sent without being asked');
});

test('marriage: costs a dowry, needs an old pact and good will, stops an AI ally betraying, and breaking it costs double', () => {
  const s = world(); VM.Diplo.ensure(s).allies.push({ a: 1, b: 2, since: 0 }); s.time = 10;
  assert(!ex(s, 1, { type: 'marry' }).ok, 'too young'); s.time = 70; VM.Diplo.addOp(s, 2, 1, 40);
  const g1 = s.factions[1].gold, g2 = s.factions[2].gold; assert(ex(s, 1, { type: 'marry' }).ok, 'wed');
  assert(s.factions[1].gold === g1 - VM.CFG.DIPLO.marryCost && s.factions[2].gold === g2 + VM.CFG.DIPLO.marryCost, 'the dowry'); assert(!ex(s, 1, { type: 'marry' }).ok, 'only once');
  const t1 = VM.Diplo.trust(s, 1); ex(s, 1, { type: 'breakAlliance' }); assert.strictEqual(VM.Diplo.trust(s, 1), t1 + VM.CFG.DIPLO.breakTrust * 2, 'double trust loss');
  const betrays = married => { const u = world(); u.aiOn = true; VM.Diplo.ensure(u).allies.push({ a: 1, b: 2, since: 0, married }); u.time = 200;
    for (const c of u.cities) if (c.owner !== 2) c.owner = 1;                      // the two hold everything: an AI ally ends the pact now
    u.officers.forEach(o => { if (o.owner === 2) o.trait = 'Rash'; }); u.factions[2].ai.dnext = 0; VM.Diplo.think(u, u.factions[2]); return !VM.Diplo.allied(u, 1, 2); };
  assert(betrays(false), 'an unmarried AI ally betrays at the end'); assert(!betrays(true), 'a married AI keeps its word');
});

test('hostages: each side gives an idle officer; they cannot lead or govern; breaking the pact keeps the breaker\'s hostage, ending it otherwise sends them home', () => {
  const s = world(); VM.Diplo.ensure(s).allies.push({ a: 1, b: 2, since: 0 }); s.time = 40; VM.Diplo.addOp(s, 2, 1, 20);
  const r = ex(s, 1, { type: 'exchangeHostages' }); assert(r.ok, JSON.stringify(r));
  const mine = s.officers[r.mine], theirs = s.officers[r.theirs]; assert(mine.role === 'hostage' && mine.hostage === 2 && mine.loc === s.factions[2].capital && theirs.hostage === 1);
  assert(!ex(s, 1, { type: 'exchangeHostages' }).ok, 'one exchange at a time');
  assert(!ex(s, 1, { type: 'setGovernor', city: s.cities.find(c => c.owner === 1).id, officer: mine.id }).ok, 'a hostage does not govern');
  ex(s, 1, { type: 'breakAlliance' });
  assert(theirs.owner === 2 && theirs.role === 'idle' && theirs.hostage === null, 'their hostage goes home');
  assert(mine.owner === 2 && mine.role === 'idle', 'the breaker\'s hostage joins the wronged house');
  const u = world(); VM.Diplo.ensure(u).allies.push({ a: 1, b: 2, since: 0 }); u.time = 40; VM.Diplo.addOp(u, 2, 1, 20);
  const q = ex(u, 1, { type: 'exchangeHostages' }); VM.Diplo.drop(u, 2);
  assert(u.officers[q.mine].owner === 1 && u.officers[q.mine].role === 'idle' && u.officers[q.mine].hostage === null, 'a pact that ends by a house falling frees the hostage');
});

console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
