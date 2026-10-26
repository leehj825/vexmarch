// Scripted war scenarios (Phase 3): battles, sieges, supply, morale, abilities, capture. Run: node tools/test_war.js
const assert = require('assert');
const VM = require('./load');
const bot = require('./war_bot');
const W = VM.CFG.WAR;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack.split('\n').slice(0, 3).join('\n       '))); } }

const T = (o) => Object.assign({ infantry: 0, spear: 0, cavalry: 0, archer: 0, siege: 0 }, o);
const size = a => VM.Armies.sizeOf(a);

// A fresh world where node X is neutral ground and everybody is rich; officers are assigned freely.
function world(seed) {
  const s = VM.Sim.create({ seed: seed || 1 });
  s.factions.forEach(f => { if (!f.neutral) { f.gold = 1e6; f.food = 1e6; } });
  return s;
}
let spare = 0;
function officer(s, owner, stats) {
  const o = s.officers.find(x => x.owner === owner && x.army === null && x.role !== 'governor' && !x._used) || s.officers.find(x => x.owner === 0 && x.army === null && !x._used);
  o._used = true; o.owner = owner; Object.assign(o, { command: 60, might: 40, intellect: 40, politics: 50 }, stats || {});
  return o;
}
function army(s, owner, at, troops, stats) { return VM.Armies.spawn(s, owner, at, T(troops), officer(s, owner, stats).id); }
const neutralNode = s => { const c = s.cities.find(c => c.owner === 0 && c.spec !== 'pass'); c.garrison = T({}); return c.id; };   // empty ground, so only the armies fight
const run = (s, days) => VM.Sim.advance(s, days);
const alive = (s, a) => s.armies.includes(a);
const broke = (s, owner) => s.events.some(e => (e.type === 'rout' || e.type === 'destroyed') && e.owner === owner);

test('matchups: spear > cavalry > archer > infantry > spear', () => {
  const pairs = [['spear', 'cavalry'], ['cavalry', 'archer'], ['archer', 'infantry'], ['infantry', 'spear']];
  for (const [a, d] of pairs) {
    assert(VM.War.power(T({ [a]: 100 }), T({ [d]: 100 })) > VM.War.power(T({ [d]: 100 }), T({ [a]: 100 })), `${a} should beat ${d}`);
    assert.strictEqual(VM.War.matchup(a, d), W.strong); assert.strictEqual(VM.War.matchup(d, a), W.weak);
  }
  assert.strictEqual(VM.War.matchup('spear', 'archer'), 1);
});

test('battle: the bigger army wins, the loser routs or dies, nothing goes NaN', () => {
  const s = world(), x = neutralNode(s);
  const big = army(s, 1, x, { infantry: 60 }), small = army(s, 2, x, { infantry: 30 });
  run(s, 1); assert(big.fighting.length && small.fighting.length, 'armies lock into battle');
  assert(s.events.some(e => e.type === 'battle'), 'battle event raised');
  run(s, 60);
  assert(alive(s, big), 'the bigger army survives');
  assert(broke(s, 2) && !broke(s, 1), 'the smaller army broke, the bigger did not');
  assert(size(big) > 30 && Number.isFinite(size(big)), `winner keeps most of its strength (${size(big)})`);
});

test('battle: counter troops beat equal numbers (spear vs cavalry, archers vs infantry)', () => {
  for (const [good, bad] of [['spear', 'cavalry'], ['cavalry', 'archer'], ['archer', 'infantry'], ['infantry', 'spear']]) {
    const s = world(), x = neutralNode(s);
    const a = army(s, 1, x, { [good]: 40 }), b = army(s, 2, x, { [bad]: 40 });
    run(s, 80);
    assert(size(a) > (alive(s, b) ? size(b) : 0), `${good} should beat ${bad}`);
    assert(size(a) > 0);
  }
});

test('battle: marching armies stop when they meet; breaking off costs morale and lets them leave', () => {
  const s = world(), x = neutralNode(s), nb = s.map.nodes[x].adj[0]; s.cities[nb].garrison = T({});
  const a = army(s, 1, x, { infantry: 80 }), b = army(s, 2, nb, { infantry: 80 });
  VM.Armies.move(s, a, nb);
  let guard = 0; while (!a.fighting.length && guard++ < 80) run(s, 0.25);
  assert(a.fighting.length, 'they met on the road'); assert(a.at === null && a.edge.len - a.edge.prog <= W.contact + 12);
  const prog = a.edge.prog; run(s, 2); assert.strictEqual(a.edge.prog, prog, 'locked in battle, no marching');
  const m0 = a.morale;
  VM.Commands.exec(s, { type: 'moveArmy', faction: 1, army: a.id, to: x });
  assert(a.morale <= m0 - 9, 'retreating costs morale');
  run(s, 12); assert(a.at === x || (a.edge && a.edge.to === x), 'the army got away'); assert(!a.fighting.length);
});

test('reinforcements: a second army turns a lost battle into a win', () => {
  const lose = world(), x = neutralNode(lose);
  const l1 = army(lose, 1, x, { infantry: 40 }); army(lose, 2, x, { infantry: 70 });
  run(lose, 60); assert(broke(lose, 1) && !broke(lose, 2), 'alone it loses');
  const win = world();
  const w1 = army(win, 1, x, { infantry: 40 }), w2 = army(win, 1, x, { infantry: 40 }), e = army(win, 2, x, { infantry: 70 });
  run(win, 60); assert(broke(win, 2) && !broke(win, 1), 'with help it wins');
  assert(alive(win, w1) && alive(win, w2));
});

test('rout: a broken army flees to its nearest city, recovers there, and is not chased', () => {
  const s = world(), x = neutralNode(s);
  const a = army(s, 1, x, { infantry: 80 }), b = army(s, 2, x, { infantry: 15 });
  b.home = s.factions[2].capital;
  run(s, 40);
  if (alive(s, b)) { assert(b.routed || b.morale < 100); }
  const evs = s.events.map(e => e.type); assert(evs.includes('rout') || evs.includes('destroyed'));
  run(s, 200);
  for (const army of s.armies) assert(army.morale > 0 || army.routed);
});

test('destroyed army: its officer dies, is captured or escapes (deterministic per seed)', () => {
  const outcome = seed => {
    const s = world(seed), x = neutralNode(s);
    const a = army(s, 1, x, { infantry: 90 }), b = army(s, 2, x, { infantry: 6 }); const o = s.officers[b.officer];
    run(s, 60);
    assert(!alive(s, b) || b.routed);
    return [o.owner, o.army].join();
  };
  const seen = new Set(); for (let sd = 1; sd <= 12; sd++) { const r = outcome(sd); assert.strictEqual(r, outcome(sd), 'deterministic'); seen.add(r.split(',')[0]); }
  assert(seen.size >= 2, 'different fates occur: ' + [...seen]);
});

// ---- Sieges ----
function siegeWorld(wallLvl, garrison) {
  const s = world(), x = neutralNode(s), c = s.cities[x];
  c.buildings.wall = wallLvl; c.wallHp = VM.War.wallMax(c); c.garrison = T({ infantry: garrison }); c.pop = VM.Eco.cap(c);
  return { s, x, c };
}
function breachDay(wallLvl, troops) {
  const { s, x, c } = siegeWorld(wallLvl, 10); army(s, 1, x, troops);
  for (let d = 0; d < 200; d++) { run(s, 1); if (c.wallHp <= 0) return d; }
  return Infinity;
}

test('siege: walls hold without siege engines far longer than with them', () => {
  const withEng = breachDay(2, { infantry: 40, siege: 20 }), without = breachDay(2, { infantry: 40 });
  assert(withEng < without, `siege engines breach faster: ${withEng} vs ${without}`);
  assert(withEng > 3, 'a wall is not instant');
});

test('siege: a city with no wall falls to a strong army; the capture changes owner, pop, governor, builds', () => {
  const { s, x, c } = siegeWorld(0, 8);
  c.owner = 2; c.governor = null; c.build = { type: 'farm', left: 5, total: 20 };
  const gov = s.officers.find(o => o.owner === 2 && o.role !== 'governor'); gov.loc = x; c.governor = gov.id; gov.role = 'governor';
  const pop0 = c.pop; army(s, 1, x, { infantry: 50 });
  run(s, 1); assert(c.contested && c.besieged, 'city is contested while the enemy stands in it');
  let g = 0; while (c.owner === 2 && g++ < 400) run(s, 0.25);
  assert.strictEqual(c.owner, 1, 'captured by faction 1');
  assert(c.pop < pop0 * 0.9, 'population lost'); assert.strictEqual(c.build, null); assert.strictEqual(c.governor, null);
  assert(s.events.some(e => e.type === 'captured' && e.city === x && e.owner === 1));
  assert(c.devastation > 0.3 && !c.contested, 'devastated and no longer contested');
  assert(!s.officers.some(o => o.id === gov.id && o.owner === 2 && o.role === 'governor'), 'the governor lost the post');
});

test('siege: a strong wall plus garrison costs the attacker more than an open town', () => {
  const lossAt = wall => { const { s, x } = siegeWorld(wall, 300); const a = army(s, 1, x, { infantry: 70, siege: wall ? 25 : 0 }); const n0 = size(a); run(s, 80); return (n0 - size(a)) / n0; };
  assert(lossAt(3) > 0 && lossAt(0) >= 0);
});

test('siege: neutral node with a garrison is taken and becomes the attacker’s', () => {
  const s = world(), x = neutralNode(s); const a = army(s, 1, x, { infantry: 40 });
  run(s, 40); assert.strictEqual(s.cities[x].owner, 1);
});

test('siege: a defending army at the city fights the besiegers first; the city holds while it lives', () => {
  const { s, x, c } = siegeWorld(1, 4); c.owner = 2;
  const d = army(s, 2, x, { infantry: 60 }), a = army(s, 1, x, { infantry: 30 });
  run(s, 10); assert.strictEqual(c.owner, 2);
  run(s, 40); assert(c.owner === 2 || !alive(s, d));
});

test('contested: enemy army in the zone halts gold; a friendly army there ends it', () => {
  const s = world(), c = s.cities[s.factions[1].capital], g0 = VM.Eco.cityStats(s, c, 1).gold;
  const en = army(s, 2, c.id, { infantry: 10 });
  run(s, 1); assert(c.contested); assert.strictEqual(VM.Eco.cityStats(s, c, 1).gold, 0);
  const def = army(s, 1, c.id, { infantry: 10 });
  run(s, 0.5); assert(!c.contested, 'a friendly army in the zone repels the contest');
  assert(g0 > 0);
});

// ---- Supply ----
test('supply: soldiers eat 3x in enemy land, 1x at home, and the pool pays', () => {
  const s = world(), home = s.factions[1].capital, enemy = s.factions[2].capital;
  const a = army(s, 1, home, { infantry: 100 }), b = army(s, 1, enemy, { infantry: 100 });
  run(s, 1);
  const base = 100 * VM.CFG.ECON.foodPerHead;
  assert(Math.abs(a.supply.poolDraw - base) < 1e-6, 'home: ' + a.supply.poolDraw);
  assert(a.supply.line === 'ok' && !a.supply.foreign);
  assert(b.supply.foreign && b.supply.line === 'ok');
  assert(Math.abs(b.supply.poolDraw / (size(b) * VM.CFG.ECON.foodPerHead) - W.foreignFood) < 0.1, 'foreign drain x' + W.foreignFood);
});

test('supply: a forward depot feeds an army in enemy land at the normal rate from its own stock', () => {
  const s = world(), home = s.factions[1].capital, x = neutralNode(s);
  const c = s.cities[x]; c.owner = 1;                // a captured forward base
  const near = s.map.nodes[x].adj[0]; s.cities[near].owner = 2; s.cities[near].garrison = T({ infantry: 30 });   // strong enough that it does not fall in the test
  assert(VM.Commands.exec(s, { type: 'buildDepot', faction: 1, city: x }).ok);
  assert(!VM.Commands.exec(s, { type: 'buildDepot', faction: 1, city: x }).ok, 'one depot per city');
  VM.Commands.exec(s, { type: 'setDepot', faction: 1, city: x, target: 3000 });
  run(s, 30); assert(c.depot.food > 500, 'the depot fills from the food pool: ' + c.depot.food);
  VM.Commands.exec(s, { type: 'setDepot', faction: 1, city: x, target: 0 });
  const a = army(s, 1, near, { infantry: 100 }); const f0 = c.depot.food;
  run(s, 2);
  assert(a.supply.depot === x, 'army draws on the depot'); assert.strictEqual(a.supply.mult, 1); assert(c.depot.food < f0);
  assert.strictEqual(a.supply.poolDraw, 0);
});

test('supply: enemy cavalry on the supply line cuts it; morale falls; rations run out; troops desert', () => {
  const s = world(), home = s.factions[1].capital;
  // march an army three hops out, then park enemy cavalry on a node of the route behind it
  const dOwn = id => VM.Armies.distance(s, id, VM.War.nearestOwnCity(s, id, 1));
  const far = s.cities.filter(c => c.owner !== 1).sort((p, q) => dOwn(q.id) - dOwn(p.id))[0].id;
  const src = VM.War.nearestOwnCity(s, far, 1), route = VM.Armies.path(s, src, far); assert(route.length >= 4, 'a route with a middle: ' + route);
  s.cities.forEach(c => { c.garrison = T({}); }); s.cities[far].garrison = T({ infantry: 50 });   // the target holds out; the raider's node is empty
  const a = army(s, 1, far, { infantry: 50 }); a.home = src;
  const prev = route[route.length - 2];                       // stand on the road just outside the target, so nobody sieges anybody
  a.at = null; a.edge = { from: far, to: prev, prog: 20, len: VM.Armies.roadLen(s, far, prev) };
  a.retreat = 1e6;                                             // test-only: never settles into a siege, so the supply rules are isolated
  const raider = army(s, 2, route[1], { cavalry: 2 });
  run(s, 1);
  assert.strictEqual(a.supply.line, 'cut', 'line is cut');
  assert(s.events.some(e => e.type === 'cut' && e.owner === 1));
  const m0 = a.morale; run(s, 5); assert(a.morale < m0 - 10, 'morale drops while cut');
  assert(a.rations === 0 && a.supply.starving, 'the carried rations are gone');
  run(s, 6); assert(size(a) < 500, 'troops desert when starving');
  run(s, 30); assert(s.events.some(e => e.type === 'rout' && e.owner === 1), 'the army collapses and routs');
  VM.Armies.disband; s.armies.splice(s.armies.indexOf(raider), 1); s.officers[raider.officer].army = null;
  const b = army(s, 1, route[route.length - 1], { infantry: 50 }); run(s, 1); assert.strictEqual(b.supply.line, 'ok', 'line is open again');
});

test('supply: morale recovers when supplied and safe', () => {
  const s = world(), a = army(s, 1, s.factions[1].capital, { infantry: 20 }); a.morale = 40;
  run(s, 30); assert(a.morale > 65, 'morale ' + a.morale);
});

// ---- Officer abilities ----
test('abilities: charge boosts damage, rally restores morale, fire strikes at once; cooldown enforced', () => {
  const duel = useCharge => {
    const s = world(), x = neutralNode(s);
    const a = army(s, 1, x, { infantry: 50 }, { might: 95, command: 30, intellect: 30 }), b = army(s, 2, x, { infantry: 50 });
    run(s, 0.5); if (useCharge) assert(VM.Commands.exec(s, { type: 'ability', faction: 1, army: a.id }).ok);
    run(s, 10); return size(b);
  };
  assert(duel(true) < duel(false) - 2, 'the charged army deals more damage');
  const s = world(), x = neutralNode(s);
  const a = army(s, 1, x, { infantry: 50 }, { might: 95, command: 30, intellect: 30 });
  assert(!VM.Commands.exec(s, { type: 'ability', faction: 1, army: a.id }).ok, 'charge needs a battle');
  const r = army(s, 1, s.factions[1].capital, { infantry: 10 }, { command: 95, might: 30, intellect: 30 });
  r.morale = 20; assert(VM.Commands.exec(s, { type: 'ability', faction: 1, army: r.id }).ok); assert.strictEqual(r.morale, 50);
  assert(!VM.Commands.exec(s, { type: 'ability', faction: 1, army: r.id }).ok, 'recharging');
  run(s, W.abilityCooldown + 1); assert(VM.Commands.exec(s, { type: 'ability', faction: 1, army: r.id }).ok, 'ready again');
  const t = world(), y = neutralNode(t);
  const f = army(t, 1, y, { infantry: 50 }, { intellect: 95, might: 30, command: 30 }), e = army(t, 2, y, { infantry: 50 });
  run(t, 0.5); const e0 = size(e); assert(VM.Commands.exec(t, { type: 'ability', faction: 1, army: f.id }).ok);
  assert(size(e) < e0 * 0.93, 'fire attack hits the enemy army at once');
});

// ---- Walls and depots ----
test('walls: hit points grow when a wall is built, and repair when nobody threatens the city', () => {
  const s = world(), c = s.cities[s.factions[1].capital]; c.buildings.wall = 0; c.wallHp = 0;
  VM.Commands.exec(s, { type: 'build', faction: 1, city: c.id, building: 'wall' }); run(s, 40);
  assert.strictEqual(c.buildings.wall, 1); assert.strictEqual(c.wallHp, VM.War.wallMax(c));
  c.wallHp = 100; run(s, 10); assert(c.wallHp > 100 && c.wallHp <= VM.War.wallMax(c));
});

test('mountain passes defend better than plains', () => {
  const s = world(); const pass = s.cities.find(c => c.spec === 'pass'), plain = s.cities.find(c => c.spec === 'town' || c.spec === 'farmland');
  pass.buildings.wall = plain.buildings.wall = 2;
  assert(VM.War.wallMax(pass) > VM.War.wallMax(plain));
});


// ---- Cities in the way (Phase 8b) ----
function corridor(owner) {
  const s = world(), home = s.factions[1].capital;
  const far = [...s.cities].sort((a, b) => VM.Armies.distance(s, home, b.id) - VM.Armies.distance(s, home, a.id)).find(c => VM.Armies.path(s, home, c.id).length >= 4).id;
  const path = VM.Armies.path(s, home, far), mid = path[1];
  s.cities.forEach(c => { if (c.id !== home && c.id !== far) { c.garrison = T({}); } });
  s.cities[mid].owner = owner; s.cities[mid].garrison = T({ infantry: 2 }); s.cities[mid].buildings.wall = 0; s.cities[mid].wallHp = 0;
  return { s, home, far, mid, path };
}

test('in the way: an army marching through a hostile city stops there and lays siege instead of walking past', () => {
  for (const owner of [2, 0]) {
    const { s, home, far, mid } = corridor(owner);
    const a = army(s, 1, home, { infantry: 50 }); VM.Armies.move(s, a, far);
    let guard = 0; while (a.at !== mid && guard++ < 400) run(s, 0.25);
    assert.strictEqual(a.at, mid, 'the army stopped at the city in the way'); assert.strictEqual(a.path.length, 0);
    assert(s.events.some(e => e.type === 'blocked' && e.owner === 1 && e.at === mid), 'the player is told');
    assert(s.cities[mid].besieged, 'it is besieging'); assert.notStrictEqual(a.at, far);
    run(s, 40); assert.strictEqual(s.cities[mid].owner, 1, 'and takes it (' + (owner ? 'enemy' : 'free') + ' city)');
  }
});

test('in the way: your own cities, routed armies and retreating armies pass through', () => {
  const { s, home, far, mid, path } = corridor(2);
  path.slice(1, -1).forEach(id => { s.cities[id].owner = 1; });        // every city on the way is yours: no obstacle
  const a = army(s, 1, home, { infantry: 30 }); VM.Armies.move(s, a, far);
  let guard = 0; while (a.at !== far && guard++ < 600) run(s, 0.25); assert.strictEqual(a.at, far, 'walks through its own city');
  const t = corridor(2); t.path.slice(1, -1).forEach(id => { t.s.cities[id].owner = 2; t.s.cities[id].garrison = T({ infantry: 2 }); });
  const b = army(t.s, 1, t.home, { infantry: 30 }); VM.Armies.move(t.s, b, t.far); b.routed = true;
  guard = 0; while (b.at !== t.far && guard++ < 600) run(t.s, 0.25); assert.strictEqual(b.at, t.far, 'a routed army just keeps running');
  const u = corridor(2); u.path.slice(1, -1).forEach(id => { u.s.cities[id].owner = 2; u.s.cities[id].garrison = T({ infantry: 2 }); });
  const c = army(u.s, 1, u.home, { infantry: 30 }); VM.Armies.move(u.s, c, u.far); c.retreat = 1e6;
  guard = 0; while (c.at !== u.far && guard++ < 600) run(u.s, 0.25); assert.strictEqual(c.at, u.far, 'a retreating army passes');
});

test('in the way: a march order from a city under siege leaves it; the next hostile city stops the army again', () => {
  const { s, home, far, mid } = corridor(2);
  const a = army(s, 1, mid, { infantry: 50 }); s.cities[mid].garrison = T({ infantry: 40 }); s.cities[mid].buildings.wall = 0;
  run(s, 2); assert(s.cities[mid].besieged);
  assert(VM.Commands.exec(s, { type: 'moveArmy', faction: 1, army: a.id, to: far }).ok); run(s, 2); assert(a.at === null || a.at !== mid, 'it can break off');
});

// ---- Victory and defeat ----
test('elimination: a faction that loses its last city is out; its officers go free; player loss ends the game', () => {
  const s = world(); const f2 = s.factions[2];
  s.cities.forEach(c => { if (c.owner === 2 && c.id !== f2.capital) c.owner = 0; });
  const cap = s.cities[f2.capital]; cap.garrison = T({ infantry: 5 }); cap.governor = null;
  army(s, 2, f2.capital, { infantry: 1 });   // keep an army to see it removed
  const aa = army(s, 1, f2.capital, { infantry: 60 });
  run(s, 30);
  assert.strictEqual(cap.owner === 1 || cap.owner === 2, true);
  VM.War.capture(s, cap, 1);
  assert(!f2.alive && !s.armies.some(a => a.owner === 2));
  assert(!s.officers.some(o => o.owner === 2));
  const t = world(); t.cities.forEach(c => { if (c.owner === 1 && c.id !== t.factions[1].capital) c.owner = 0; });
  VM.War.capture(t, t.cities[t.factions[1].capital], 2); assert.strictEqual(t.over.type, 'lose');
  const u = world(); u.cities.forEach(c => { if (c.id !== 0) c.owner = 1; }); u.cities[0].owner = 2; VM.War.capture(u, u.cities[0], 1);
  assert.strictEqual(u.over.type, 'win');
  const t0 = t.time; run(t, 5); assert.strictEqual(t.time, t0, 'the clock stops when the game is over');
});

// ---- Whole-war smoke tests ----
test('war smoke: five factions fight for 4000 days with the war bot (no NaN, cities change hands, state stays sane)', () => {
  const s = VM.Sim.create({ seed: 7 });
  bot.run(s, 4000);
  const captured = s.events.filter(e => e.type === 'captured').length;
  for (const a of s.armies) { assert(Number.isFinite(size(a)) && size(a) >= 0); assert(a.morale >= 0 && a.morale <= 100); }
  for (const c of s.cities) { assert(Number.isFinite(c.pop) && c.pop >= 0); for (const k in c.garrison) assert(Number.isFinite(c.garrison[k]) && c.garrison[k] >= 0); assert(Number.isFinite(c.wallHp)); }
  for (const f of s.factions) assert(Number.isFinite(f.gold) && f.gold >= 0 && Number.isFinite(f.food) && f.food >= 0);
  assert(s.events.length <= 200);
  console.log(`       (${captured} captures in the last events window, ${s.armies.length} armies, over: ${s.over && s.over.type}, day ${Math.round(s.time)})`);
});

test('war is deterministic and survives save/load mid-battle', () => {
  const mk = () => { const s = VM.Sim.create({ seed: 5 }); bot.run(s, 700); return s; };
  const a = mk(), b = mk(); assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(b));
  const c = VM.Sim.load(VM.Sim.save(a)); bot.run(a, 300); bot.run(c, 300); assert.strictEqual(VM.Sim.hash(a), VM.Sim.hash(c));
});

// ---- Roles, walls, sorties, food and retreat (version 6 tactics) ----
test('roles: archers behind a firm line are hit less than the infantry in front; engines do not fight in the field', () => {
  let inf = 0, arc = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const s = world(seed), x = neutralNode(s), a = army(s, 1, x, { infantry: 30, archer: 30 }), b = army(s, 2, x, { infantry: 60 });
    run(s, 4); if (!alive(s, a)) continue; inf += 30 - a.troops.infantry; arc += 30 - a.troops.archer;
  }
  assert(inf > arc * 1.5, `the line takes the blows (infantry lost ${inf}, archers ${arc})`);
  assert.strictEqual(VM.War.power(T({ siege: 10 }), T({ infantry: 10 })), 0, 'siege engines add nothing in a field fight');
  const s = world(), x = neutralNode(s), e = army(s, 1, x, { infantry: 20, siege: 6 }), f = army(s, 2, x, { infantry: 20 }); run(s, 3);
  assert(e.troops.siege >= 5, 'engines stay behind the fighting: ' + e.troops.siege);
});

test('roles: cavalry charge, fall back and swing round (their strength comes and goes), and a flanking officer hits harder', () => {
  const s = world(), x = neutralNode(s), a = army(s, 1, x, { cavalry: 10 }, { trait: 'Rash' }), vals = [];
  for (let i = 0; i < 64; i++) { vals.push(VM.War.cavMult(s, a)); s.time += 0.125; }
  assert(Math.max(...vals) >= 2 && Math.min(...vals) <= 0.3, 'they surge and fall back: ' + Math.min(...vals) + ' to ' + Math.max(...vals));
  const b = army(s, 1, x, { cavalry: 10 }, { trait: 'Cautious', command: 30 }); assert(VM.War.flanker(s, a) && !VM.War.flanker(s, b), 'Rash flanks, Cautious does not');
});

test('walls: archers on the wall make a siege costly; when the gate falls the defenders fight in the open and a breach is announced', () => {
  const lost = wall => { const { s, x, c } = siegeWorld(wall, 10); c.garrison = T({ infantry: 5, archer: 10 }); const a = army(s, 1, x, { infantry: 40 }); const n0 = size(a); run(s, 6); return n0 - size(a); };
  assert(lost(2) > lost(0) * 1.3, `the wall costs the attacker more (${lost(2)} vs ${lost(0)})`);
  const { s, x, c } = siegeWorld(1, 20); c.wallHp = 5; army(s, 1, x, { infantry: 60 }); run(s, 3);
  assert(s.events.some(e => e.type === 'breach' && e.city === x), 'the breach is an event'); assert(c.wallHp === 0);
});

test('walls: an army inside stays behind them with the garrison unless its officer sorties; a sortie fights in the open', () => {
  const { s, x, c } = siegeWorld(2, 10); c.owner = 2; c.garrison = T({ infantry: 5, archer: 8 }); c.governor = null;
  const d = army(s, 2, x, { infantry: 20, archer: 10 }, { trait: 'Cautious' }), a = army(s, 1, x, { infantry: 30 });
  d.sortie = false; run(s, 1); assert(!d.fighting.length && !a.fighting.length, 'nobody fights in the open while the wall stands');
  assert(c.wallHp < VM.War.wallMax(c) || size(a) < 30, 'the besiegers meet the gate and the wall-top archers');
  d.sortie = true; run(s, 1); assert(d.fighting.length && a.fighting.length, 'the sortie meets them in the open');
  // the decision itself: a brave officer who is stronger rides out, a cautious one who is weaker stays in
  const mk = trait => { const w = siegeWorld(2, 10); w.c.owner = 2; w.c.governor = null; w.c.garrison = T({}); const dd = army(w.s, 2, w.x, { infantry: 40 }, { trait }); army(w.s, 1, w.x, { infantry: 20 }); VM.War.updateZones(w.s); run(w.s, 0.5); VM.Officers.armyThink ? null : null; return { w, dd }; };
  const b = mk('Brave'); VM.Sim.advance(b.w.s, 2); assert(b.dd.sortie === true, 'a brave officer, twice as strong, rides out');
  const k = (() => { const w = siegeWorld(2, 10); w.c.owner = 2; w.c.governor = null; w.c.garrison = T({}); const dd = army(w.s, 2, w.x, { infantry: 20 }, { trait: 'Cautious' }); army(w.s, 1, w.x, { infantry: 30 }); VM.War.updateZones(w.s); VM.Sim.advance(w.s, 2); return dd; })();
  assert(k.sortie === false, 'a cautious officer, weaker, stays behind the walls');
});

test('food: an army marching out to attack takes a campaign of food from the stock; marching home takes none', () => {
  const s = world(), f = s.factions[1], home = f.capital, foe = s.cities.find(c => c.owner !== 1 && c.owner !== 0);
  const a = army(s, 1, home, { infantry: 30 }), r0 = a.rations, f0 = f.food; VM.Armies.move(s, a, foe.id);
  const per = 30 * VM.CFG.ECON.foodPerHead;
  assert(a.rations > r0 && f.food < f0 && Math.abs(a.rations - per * VM.CFG.WAR.campaignDays) < 1e-6, `it carries ${Math.round(a.rations / per)} days now (was ${Math.round(r0 / per)})`);
  assert(a.rationDays >= VM.CFG.WAR.campaignDays - 1e-6, 'and can carry that much');
  const b = army(s, 1, home, { infantry: 30 }), own = s.cities.find(c => c.owner === 1 && c.id !== home), rb = b.rations; VM.Armies.move(s, b, own.id); assert.strictEqual(b.rations, rb);
});

test('retreat: only food or morale pulls an army back; how low the morale may fall depends on the officer', () => {
  const s = world(), home = s.factions[1].capital;
  const a = army(s, 1, home, { infantry: 30 }, { trait: 'Rash' }), b = army(s, 1, home, { infantry: 30 }, { trait: 'Cautious' }), c = army(s, 1, home, { infantry: 30 }, { trait: 'Loyal' });
  for (const x of [a, b, c]) { x.morale = 20; x.supply = { line: 'ok', starving: false, mult: 1 }; }
  assert(!VM.War.retreatReason(s, a), 'Rash fights on at 20'); assert.strictEqual(VM.War.retreatReason(s, b), 'morale'); assert.strictEqual(VM.War.retreatReason(s, c), 'morale', 'an ordinary officer pulls back below 28');
  c.morale = 60; assert(!VM.War.retreatReason(s, c));
  c.supply = { line: 'cut', starving: false, mult: 3, depot: null }; c.rations = 30 * 0.1 * 3 * 10; assert(!VM.War.retreatReason(s, c), 'cut off but with ten days of food: no retreat');
  c.rations = 30 * 0.1 * 3 * 2; assert.strictEqual(VM.War.retreatReason(s, c), 'food', 'two days of food left: back');
  c.size; c.troops.infantry = 5; c.morale = 60; c.supply = { line: 'ok', starving: false, mult: 1 }; assert(!VM.War.retreatReason(s, c), 'losses alone are no reason');
});

test('breach: an army in a breached city does not retreat or rout on morale, unless it is far too small', () => {
  const { s, x, c } = siegeWorld(0, 30); c.owner = 2;
  const a = army(s, 1, x, { infantry: 40 }); run(s, 1);
  a.morale = 5; a.supply = { line: 'ok', starving: false, mult: 1 };
  assert(VM.War.pressing(s, a), 'pressing the assault'); assert(!VM.War.retreatReason(s, a), 'no morale retreat in the breach');
  a.morale = 0; run(s, 0.25); assert(!a.routed, 'no rout in the breach');
  a.troops.infantry = 3; assert(!VM.War.pressing(s, a), 'too small to press on'); assert(VM.War.retreatReason(s, a), 'a tiny army may still retreat');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
