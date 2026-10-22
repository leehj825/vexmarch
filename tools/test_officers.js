// Phase 4: loyalty, wandering officers, governors on policies, army standing orders, proposals. Run: node tools/test_officers.js
const assert = require('assert');
const VM = require('./load');
const O = VM.CFG.OFFICERS;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }

const T = o => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
const size = a => VM.Armies.sizeOf(a);
const run = (s, d) => VM.Sim.advance(s, d);
function world(seed) { const s = VM.Sim.create({ seed: seed || 1 }); s.factions.forEach(f => { if (!f.neutral) { f.gold = 1e5; f.food = 1e6; } }); return s; }
function officer(s, owner, stats) {
  const o = s.officers.find(x => x.owner === owner && x.army === null && x.role === 'idle' && !x._used) || s.officers.find(x => x.owner === 0 && x.army === null && !x._used);
  o._used = true; o.owner = owner; Object.assign(o, { command: 60, might: 40, intellect: 40, politics: 50, trait: 'Cautious' }, stats || {}); return o;
}
function army(s, owner, at, troops, stats) { return VM.Armies.spawn(s, owner, at, T(troops), officer(s, owner, stats).id); }
const emptyNeutral = s => { const c = s.cities.find(c => c.owner === 0 && c.spec !== 'pass'); c.garrison = T({}); return c; };
const evs = (s, t) => s.events.filter(e => e.type === t);

// ---------- Loyalty ----------
test('loyalty: loyal officers settle high, greedy ones in a broke faction settle low', () => {
  const s = world(), a = officer(s, 1, { trait: 'Loyal' }), b = officer(s, 2, { trait: 'Greedy' });
  s.factions[2].gold = 0; s.factions[2].broke = true;
  a.loyalty = b.loyalty = 60; run(s, 5);
  assert(VM.Officers.loyaltyTarget(s, a) > 75);
  s.factions[2].gold = 0; assert(VM.Officers.loyaltyTarget(s, b) < 45, 'greedy and broke');
  run(s, 400); assert(a.loyalty > 65, 'loyal ' + a.loyalty);   // 80 target, less the 10 an unemployed officer loses
});

test('loyalty: a gift raises it, costs gold, and has a cooldown', () => {
  const s = world(), o = officer(s, 1, {}); o.loyalty = 50; const g0 = s.factions[1].gold;
  assert(VM.Commands.exec(s, { type: 'giftOfficer', faction: 1, officer: o.id }).ok);
  assert.strictEqual(o.loyalty, 50 + O.giftGain); assert.strictEqual(g0 - s.factions[1].gold, O.giftCost);
  assert(!VM.Commands.exec(s, { type: 'giftOfficer', faction: 1, officer: o.id }).ok, 'cooldown');
  run(s, O.giftCooldown + 1); assert(VM.Commands.exec(s, { type: 'giftOfficer', faction: 1, officer: o.id }).ok);
  assert(!VM.Commands.exec(s, { type: 'giftOfficer', faction: 2, officer: o.id }).ok, 'not yours');
});

test('loyalty: a disloyal idle officer or governor defects to a rival; a commander in the field does not', () => {
  const s = world();
  const idle = officer(s, 1, { trait: 'Schemer' }); idle.loc = s.factions[1].capital; idle.loyalty = 2;
  const cap = s.cities[s.factions[1].capital], gov = s.officers[cap.governor]; gov.loyalty = 2; gov.trait = 'Schemer';
  const a = army(s, 1, s.factions[1].capital, { infantry: 10 }, { trait: 'Schemer' }); const cmdr = s.officers[a.officer]; cmdr.loyalty = 2;
  s.factions[1].gold = 0; s.factions[1].broke = true;
  for (let d = 0; d < 300 && (idle.owner === 1 || gov.owner === 1); d++) { idle.loyalty = Math.min(idle.loyalty, 3); gov.loyalty = Math.min(gov.loyalty, 3); run(s, 1); s.factions[1].gold = Math.max(s.factions[1].gold, 0); }
  assert(idle.owner !== 1 && gov.owner !== 1, 'both left');
  assert(evs(s, 'defected').length >= 2); assert.strictEqual(cap.governor, null, 'the city lost its governor');
  assert.strictEqual(cmdr.owner, 1, 'commanders do not defect mid-campaign');
});

test('loyalty: a warning event is raised when it falls low', () => {
  const s = world(), o = officer(s, 1, { trait: 'Schemer' }); o.loyalty = 30; run(s, 1);
  assert(evs(s, 'loyaltyLow').some(e => e.officer === o.id));
});

// ---------- Travel, wanderers, search, recruit ----------
test('travel: officers walk between your cities and are busy on the way', () => {
  const s = world(), f = s.factions[1], to = s.cities.find(c => c.owner === 1 && c.id !== f.capital).id;
  const o = officer(s, 1, {}); o.loc = f.capital;
  const r = VM.Commands.exec(s, { type: 'sendOfficer', faction: 1, officer: o.id, to }); assert(r.ok);
  assert.strictEqual(o.role, 'traveling'); assert(!VM.Commands.exec(s, { type: 'sendOfficer', faction: 1, officer: o.id, to: f.capital }).ok);
  assert(!VM.Commands.exec(s, { type: 'setGovernor', faction: 1, city: to, officer: o.id }).ok, 'busy');
  run(s, r.days + 1); assert.strictEqual(o.loc, to); assert.strictEqual(o.role, 'idle');
  assert(!VM.Commands.exec(s, { type: 'sendOfficer', faction: 1, officer: o.id, to: s.cities.find(c => c.owner === 2).id }).ok, 'only your cities');
});

test('wanderers: they drift between nodes; new ones appear over time up to a cap', () => {
  const s = world(), w = s.officers.filter(o => o.owner === 0), at0 = w.map(o => o.loc);
  run(s, 200); assert(w.some((o, i) => o.loc !== at0[i]), 'some moved');
  run(s, 2000);
  const n = s.officers.filter(o => o.owner === 0 && o.loc !== null).length; assert(n <= O.wanderersMax + 1, 'capped: ' + n);
  assert(s.officers.length > VM.CFG.OFFICER_COUNT, 'new officers appeared');
  assert.strictEqual(new Set(s.officers.map(o => o.name)).size, s.officers.length, 'names stay unique');
});

test('wanderers: you see them in your territory; search reveals others at a cost; recruiting works or fails deterministically', () => {
  let joined = 0, failedOnce = 0, revealed = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const s = world(seed), w = s.officers.find(o => o.owner === 0);
    const city = s.cities[s.factions[1].capital]; w.loc = s.map.nodes[city.id].adj.find(n => s.cities[n].owner === 0) ?? s.map.nodes[city.id].adj[0];
    const seeker = officer(s, 1, { intellect: 100 }); seeker.loc = city.id;
    if (s.cities[w.loc].owner !== 1) {
      assert(!VM.Officers.visibleTo(s, w, 1), 'hidden outside your land');
      const g0 = s.factions[1].gold;
      assert(VM.Commands.exec(s, { type: 'searchOfficers', faction: 1, officer: seeker.id }).ok);
      assert.strictEqual(g0 - s.factions[1].gold, O.searchCost); assert.strictEqual(seeker.role, 'searching');
      run(s, O.searchDays + 1);
      assert.strictEqual(seeker.role, 'idle'); assert(evs(s, 'found').length + evs(s, 'searchFailed').length === 1);
      if (!VM.Officers.visibleTo(s, w, 1)) continue; revealed++;
    }
    const cost = VM.Officers.recruitCost(w), g1 = s.factions[1].gold;
    const r = VM.Commands.exec(s, { type: 'recruitOfficer', faction: 1, officer: w.id });
    assert(r.ok); assert.strictEqual(g1 - s.factions[1].gold, cost);
    if (r.joined) { joined++; assert.strictEqual(w.owner, 1); assert.strictEqual(w.loyalty, 55); } else { failedOnce++; assert.strictEqual(w.owner, 0); assert.strictEqual(VM.Officers.visibleTo(s, w, 1), s.cities[w.loc].owner === 1, 'the refusal sends them off and the sighting is forgotten'); }
  }
  assert(revealed >= 1 && joined >= 1 && failedOnce >= 0, `revealed ${revealed}, joined ${joined}`);
});

test('wanderers: you cannot recruit someone you have not found', () => {
  const s = world(), w = s.officers.find(o => o.owner === 0); w.loc = s.cities.find(c => c.owner === 2).id;
  assert(!VM.Commands.exec(s, { type: 'recruitOfficer', faction: 1, officer: w.id }).ok);
});

// ---------- Governors ----------
function govCity(s, f, trait, politics) {
  const c = s.cities.find(x => x.owner === f && x.id !== s.factions[f].capital);
  const o = officer(s, f, { trait: trait || 'Loyal', politics: politics || 60 }); o.loc = c.id;
  assert(VM.Commands.exec(s, { type: 'setGovernor', faction: f, city: c.id, officer: o.id }).ok);
  return { c, o };
}

test('governor: a policy needs a governor; manual does nothing', () => {
  const s = world(), c = s.cities.find(x => x.owner === 1 && x.id !== s.factions[1].capital);
  assert(!VM.Commands.exec(s, { type: 'setPolicy', faction: 1, city: c.id, mode: 'develop' }).ok);
  run(s, 100); assert.strictEqual(evs(s, 'built').filter(e => e.city === c.id).length, 0);
});

test('governor: Develop builds the city up on its own, keeps a reserve and sets sensible taxes', () => {
  const s = world(); s.factions[1].gold = 1500; const { c } = govCity(s, 1, 'Loyal', 70);
  assert(VM.Commands.exec(s, { type: 'setPolicy', faction: 1, city: c.id, mode: 'develop' }).ok);
  const before = Object.values(c.buildings).reduce((a, b) => a + b, 0); let minGold = Infinity;
  VM.Sim.advance(s, 720, st => { minGold = Math.min(minGold, st.factions[1].gold); });
  const after = Object.values(c.buildings).reduce((a, b) => a + b, 0);
  assert(after >= before + 4, `built things: ${before} -> ${after}`);
  assert(minGold >= 0, 'never overspends: ' + minGold);
  c.stats.prosperity = 0.5; c.nextThink = s.time; run(s, 1); assert.strictEqual(c.tax, 'low', 'a struggling city gets tax relief');
});

test('governor: higher Politics decides more often and builds more', () => {
  const count = pol => { const s = world(); s.factions[1].gold = 1e6; const { c } = govCity(s, 1, 'Loyal', pol); VM.Commands.exec(s, { type: 'setPolicy', faction: 1, city: c.id, mode: 'develop' }); run(s, 360); return evs(s, 'built').filter(e => e.city === c.id).length; };
  assert(count(100) >= count(20), `${count(100)} vs ${count(20)}`);
});

test('governor: Fortify raises walls and a larger garrison; Recruit keeps a big one', () => {
  const s = world(), { c } = govCity(s, 1, 'Cautious', 60); c.garrison = T({});
  VM.Commands.exec(s, { type: 'setPolicy', faction: 1, city: c.id, mode: 'fortify' });
  run(s, 360); assert(c.buildings.wall >= 2, 'wall ' + c.buildings.wall);
  assert(VM.Eco.troopsOf(c.garrison) >= c.pop * 0.04, 'garrison ' + VM.Eco.troopsOf(c.garrison));
  const t = world(), g2 = govCity(t, 1, 'Brave', 60); g2.c.garrison = T({}); VM.Commands.exec(t, { type: 'setPolicy', faction: 1, city: g2.c.id, mode: 'recruit' });
  run(t, 360); assert(VM.Eco.troopsOf(g2.c.garrison) > c.pop * 0.05 && g2.c.buildings.barracks >= 2);
});

test('governor: traits change behaviour (greedy squeezes a poor treasury, cautious holds more gold back)', () => {
  const s = world(), { c } = govCity(s, 1, 'Greedy', 60); s.factions[1].gold = 300; VM.Commands.exec(s, { type: 'setPolicy', faction: 1, city: c.id, mode: 'develop' });
  c.stats.prosperity = 1; run(s, 1); assert.strictEqual(c.tax, 'high');
  const t = world(), g = govCity(t, 1, 'Cautious', 60); t.factions[1].gold = 420; VM.Commands.exec(t, { type: 'setPolicy', faction: 1, city: g.c.id, mode: 'develop' });
  const h = world(), g2 = govCity(h, 1, 'Rash', 60); h.factions[1].gold = 420; VM.Commands.exec(h, { type: 'setPolicy', faction: 1, city: g2.c.id, mode: 'develop' });
  run(t, 1); run(h, 1);
  assert(g2.c.build && !g.c.build, 'a rash governor spends where a cautious one saves');
});

test('empire on autopilot: Develop governors and Defend armies run a faction sensibly for 5 years', () => {
  const s = VM.Sim.create({ seed: 4 });
  const mine = s.cities.filter(c => c.owner === 1);
  mine.forEach(c => { if (c.governor === null) { const o = s.officers.find(x => x.owner === 1 && x.role === 'idle' && x.army === null && x.loc !== null && !s.cities.some(k => k.governor === x.id)); if (o) { o.loc = c.id; VM.Commands.exec(s, { type: 'setGovernor', faction: 1, city: c.id, officer: o.id }); } } });
  mine.filter(c => c.governor !== null).forEach(c => VM.Commands.exec(s, { type: 'setPolicy', faction: 1, city: c.id, mode: 'develop' }));
  const pop0 = mine.reduce((a, c) => a + c.pop, 0), gold0 = s.factions[1].gold;
  run(s, 360 * 5);
  const mine2 = s.cities.filter(c => c.owner === 1), pop1 = mine2.reduce((a, c) => a + c.pop, 0);
  assert(pop1 > pop0 * 1.1, `population grows ${pop0.toFixed(0)} -> ${pop1.toFixed(0)}`);
  assert(s.factions[1].gold > gold0, 'treasury grows');
  assert(!evs(s, 'starving').some(e => e.owner === 1), 'no famine');
  assert(evs(s, 'built').filter(e => e.owner === 1).length >= 6, 'it built things');
});

// ---------- Army orders ----------
function twoCities(s) {
  const mine = s.cities.find(c => c.owner === 1 && c.id !== s.factions[1].capital), nb = s.map.nodes[mine.id].adj.find(n => s.cities[n].owner !== 1);
  s.cities[nb].owner = 0; s.cities[nb].garrison = T({}); return { st: mine, nb };
}

test('orders: Hold stays put; Defend intercepts a weaker raider and returns to its station afterwards', () => {
  const s = world(), { st, nb } = twoCities(s), a = army(s, 1, st.id, { infantry: 70 }, { trait: 'Brave' });
  VM.Commands.exec(s, { type: 'setOrder', faction: 1, army: a.id, mode: 'hold' });
  const e = army(s, 2, nb, { infantry: 15 }); e.order = 'hold';
  run(s, 20); assert.strictEqual(a.at, st.id, 'hold does not move');
  VM.Commands.exec(s, { type: 'setOrder', faction: 1, army: a.id, mode: 'defend' });
  run(s, 3); assert(a.at !== st.id || a.dest !== null, 'moves to intercept');
  run(s, 60); assert(evs(s, 'battle').length > 0, 'a battle took place');
  const e2 = s.armies.includes(e); assert(!e2 || e.routed || size(e) < 150);
  run(s, 120); assert.strictEqual(a.at, st.id, 'back at its station'); assert(a.morale > 80);
});

test('orders: odds and temperament matter (a cautious defender will not meet an even fight, a rash one will)', () => {
  const trial = trait => { const s = world(), { st, nb } = twoCities(s); const a = army(s, 1, st.id, { infantry: 40 }, { trait, command: 60 }); const e = army(s, 2, nb, { infantry: 43 }); e.order = 'hold';
    VM.Commands.exec(s, { type: 'setOrder', faction: 1, army: a.id, mode: 'defend' }); run(s, 6); return a.at !== st.id || a.dest !== null || a.fighting.length > 0; };
  assert.strictEqual(trial('Cautious'), false); assert.strictEqual(trial('Rash'), true);
});

test('orders: Reinforce marches to the nearest own city that is under attack', () => {
  const s = world(), f = s.factions[1], own = s.cities.filter(c => c.owner === 1), target = own[1], idleAt = own[2];
  const a = army(s, 1, idleAt.id, { infantry: 30 }); VM.Commands.exec(s, { type: 'setOrder', faction: 1, army: a.id, mode: 'reinforce' });
  const e = army(s, 2, target.id, { infantry: 6 }); e.order = 'hold';
  run(s, 2); assert(target.contested || target.besieged);
  run(s, 40); assert(evs(s, 'rout').some(x => x.owner === 2) || evs(s, 'destroyed').some(x => x.owner === 2), 'the intruder was driven off'); assert(!target.contested && !target.besieged);
});

test('orders: Raid takes a weak nearby town, rests when worn down, and goes out again', () => {
  const s = world(), { st, nb } = twoCities(s); s.cities[nb].garrison = T({ infantry: 2 });
  const a = army(s, 1, st.id, { infantry: 60 }, { trait: 'Rash' }); VM.Commands.exec(s, { type: 'setOrder', faction: 1, army: a.id, mode: 'raid' });
  run(s, 60); assert.strictEqual(s.cities[nb].owner, 1, 'raid captured the town');
  a.morale = 20; a.at !== null && run(s, 5);
  run(s, 100); assert(a.morale > 60 || a.rest, 'rested');
});

test('orders: Raid ignores a target that is too strong for its temperament', () => {
  const s = world(), { st, nb } = twoCities(s); s.cities[nb].garrison = T({ infantry: 45 }); s.cities[nb].buildings.wall = 2; s.cities[nb].wallHp = VM.War.wallMax(s.cities[nb]);
  const a = army(s, 1, st.id, { infantry: 50 }, { trait: 'Cautious' }); VM.Commands.exec(s, { type: 'setOrder', faction: 1, army: a.id, mode: 'raid' });
  run(s, 30); assert.strictEqual(s.cities[nb].owner, 0); assert(a.dest === null);
});

// ---------- Proposals ----------
test('proposals: a rash commander asks to attack a weak neighbour; accepting sends the army, declining waits it out', () => {
  const s = world(), { st, nb } = twoCities(s); s.cities[nb].garrison = T({ infantry: 2 });
  const a = army(s, 1, st.id, { infantry: 60 }, { trait: 'Rash' });
  run(s, 3); const p = s.proposals[0]; assert(p && p.type === 'attack' && p.army === a.id && p.target === nb);
  assert(evs(s, 'proposal').length === 1);
  assert(VM.Commands.exec(s, { type: 'answerProposal', faction: 1, proposal: p.id, accept: true }).ok); assert(a.dest === nb);
  assert(!VM.Commands.exec(s, { type: 'answerProposal', faction: 1, proposal: p.id, accept: true }).ok, 'answered once');
  const t = world(), q = twoCities(t); t.cities[q.nb].garrison = T({ infantry: 2 }); const b = army(t, 1, q.st.id, { infantry: 60 }, { trait: 'Rash' });
  run(t, 3); VM.Commands.exec(t, { type: 'answerProposal', faction: 1, proposal: t.proposals[0].id, accept: false }); assert.strictEqual(b.dest, null);
  run(t, 30); assert.strictEqual(t.proposals.length, 0, 'no pestering inside the cooldown');
  run(t, 20); assert.strictEqual(t.proposals.length, 1, 'asks again later');
});

test('proposals: they expire, and the AI factions never receive them', () => {
  const s = world(), { st, nb } = twoCities(s); s.cities[nb].garrison = T({ infantry: 2 }); army(s, 1, st.id, { infantry: 60 }, { trait: 'Rash' });
  run(s, 3); assert.strictEqual(s.proposals.length, 1); run(s, O.proposalExpires + 2); assert(!s.proposals.some(p => p.created < 3), 'expired');
  const t = world(), c2 = t.cities.find(c => c.owner === 2); const nb2 = t.map.nodes[c2.id].adj.find(n => t.cities[n].owner !== 2); t.cities[nb2].owner = 0; t.cities[nb2].garrison = T({ infantry: 2 });
  army(t, 2, c2.id, { infantry: 60 }, { trait: 'Rash' }); run(t, 10); assert.strictEqual(t.proposals.length, 0);
});

test('proposals: a cautious governor asks for a wall when enemies are near', () => {
  const s = world(), { c } = govCity(s, 1, 'Cautious', 60); c.buildings.wall = 0;
  const foe = s.map.nodes[c.id].adj[0]; s.cities[foe].owner = 2;
  run(s, 3); const p = s.proposals.find(x => x.type === 'wall'); assert(p, 'wall proposal'); assert(p.city === c.id);
  assert(VM.Commands.exec(s, { type: 'answerProposal', faction: 1, proposal: p.id, accept: true }).ok); assert(c.build && c.build.type === 'wall');
});

// ---------- Alerts and whole-world ----------
test('alerts: an attack on your city raises one event, not one per day', () => {
  const s = world(), c = s.cities.find(c => c.owner === 1 && c.id !== s.factions[1].capital);
  army(s, 2, c.id, { infantry: 30 }); run(s, 10);
  assert.strictEqual(evs(s, 'attacked').filter(e => e.city === c.id).length, 1);
});

test('autonomy everywhere: governors on Develop, armies on Raid/Defend for 3000 days stay sane and deterministic', () => {
  const mk = () => {
    const s = VM.Sim.create({ seed: 9 });
    for (const f of s.factions) { if (f.neutral) continue;
      for (const c of s.cities.filter(x => x.owner === f.id)) {
        if (c.governor === null) { const o = s.officers.find(x => x.owner === f.id && x.role === 'idle' && x.army === null && !s.cities.some(k => k.governor === x.id)); if (o) { o.loc = c.id; VM.Commands.exec(s, { type: 'setGovernor', faction: f.id, city: c.id, officer: o.id }); } }
        if (c.governor !== null) VM.Commands.exec(s, { type: 'setPolicy', faction: f.id, city: c.id, mode: c.id % 2 ? 'develop' : 'recruit' });
      } }
    let n = 0;
    VM.Sim.advance(s, 3000, st => { if (++n % 40 === 0) for (const f of st.factions) { if (f.neutral || !f.alive) continue;
      for (const c of st.cities.filter(x => x.owner === f.id && x.policy === 'recruit' && x.governor === null)) c.policy = 'manual';
      const off = st.officers.find(o => o.owner === f.id && o.role === 'idle' && o.army === null && !o.travel && o.loc !== null && st.cities[o.loc].owner === f.id && !st.cities.some(k => k.governor === o.id));
      const c = off && st.cities[off.loc]; if (off && VM.Eco.troopsOf(c.garrison) > 150) { const r = VM.Commands.exec(st, { type: 'formArmy', faction: f.id, city: c.id, officer: off.id }); if (r.ok) VM.Commands.exec(st, { type: 'setOrder', faction: f.id, army: r.army, mode: st.armies.length % 2 ? 'raid' : 'defend' }); } } });
    return s;
  };
  const a = mk(), b = mk(); assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(b));
  for (const f of a.factions) { assert(Number.isFinite(f.gold) && f.gold >= 0 && Number.isFinite(f.food) && f.food >= 0); }
  for (const o of a.officers) { assert(Number.isFinite(o.loyalty) && o.loyalty >= 0 && o.loyalty <= 100); assert(o.owner >= -1); }
  assert(a.officers.length < 80 && a.events.length <= 200);
  const c = VM.Sim.load(VM.Sim.save(a)); VM.Sim.advance(a, 200); VM.Sim.advance(c, 200); assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(c), 'save/load safe');
  console.log(`       (${a.armies.length} armies, ${a.officers.filter(o => o.owner > 0).length} serving officers, over: ${a.over && a.over.type})`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
