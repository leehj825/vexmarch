// Officers as autonomous agents: loyalty, wandering officers (search and recruit), governors who run a city from a policy,
// army commanders who follow a standing order, and proposals the player can accept or decline.
var VM = globalThis.VM = globalThis.VM || {};

VM.Officers = (function () {
  const O = () => VM.CFG.OFFICERS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ev = (state, e) => VM.Eco.pushEvent(state, e);
  const total = VM.War ? VM.War.total : t => { let n = 0; for (const k in t) n += t[k]; return n; };

  const hops = (state, a, b) => VM.Armies.distance(state, a, b);
  const exec = (state, owner, cmd) => { cmd.faction = owner; return VM.Commands.exec(state, cmd); };

  function nearestOwn(state, from, owner, skip) { return VM.War.nearestOwnCity(state, from, owner, skip === undefined ? -1 : skip); }
  const originOf = a => a.at !== null ? a.at : a.edge.from;

  // ---------------- Loyalty ----------------
  function loyaltyTarget(state, o) {
    const C = O(), f = state.factions[o.owner]; let t = C.loyaltyBase;
    if (o.trait === 'Loyal') t += C.traitLoyal;
    if (o.trait === 'Brave') t += 5;
    if (o.trait === 'Greedy' && (f.broke || f.gold < 100)) t += C.traitGreedyBroke;
    if (o.trait === 'Schemer') t += C.traitSchemer;
    if (o.role === 'governor') { const c = state.cities.find(x => x.governor === o.id); if (c && c.stats) t += clamp((c.stats.prosperity - 0.8) * 20, -10, 8); }
    if (o.role === 'commander') { const a = state.armies.find(x => x.id === o.army); if (a) t += a.morale > 70 ? 3 : (a.morale < 30 ? -8 : 0); }
    if (o.role === 'idle' && o.idleDays > C.idleAfter) t += C.idlePenalty;
    if (VM.Story && state.story) t += VM.Story.loyaltyMod(state, o);
    return t;
  }

  function bump(state, id, delta) { const o = state.officers[id]; if (o && o.owner > 0) o.loyalty = clamp(o.loyalty + delta, 0, 100); }

  function defect(state, o) {
    const from = o.owner, c = state.cities.find(x => x.governor === o.id);
    if (c) { c.governor = null; }
    o.role = 'idle'; o.idleDays = 0;
    let best = -1, bd = Infinity;
    for (const x of state.cities) { if (x.owner === 0 || x.owner === from) continue; const d = hops(state, o.loc, x.id); if (d < bd) { bd = d; best = x.id; } }
    if (best >= 0) { o.owner = state.cities[best].owner; o.loc = best; o.loyalty = 50; } else { o.owner = 0; o.loyalty = 50; }
    o.warned = false;
    ev(state, { type: 'defected', owner: from, to: o.owner, officer: o.id, city: o.loc });
  }

  function loyaltyStep(state, dd) {
    const C = O();
    for (const o of state.officers) {
      if (o.owner <= 0) continue;
      if (o.role === 'idle') o.idleDays += dd; else o.idleDays = 0;
      o.loyalty = clamp(o.loyalty + (loyaltyTarget(state, o) - o.loyalty) * C.loyaltyDrift * dd, 0, 100);
      if (o.loyalty < C.warnBelow && !o.warned) { o.warned = true; ev(state, { type: 'loyaltyLow', owner: o.owner, officer: o.id }); }
      if (o.loyalty >= C.warnBelow + 10) o.warned = false;
      if (o.loyalty < C.defectBelow && o.role !== 'commander' && o.role !== 'traveling') {
        if (VM.RNG.next(state) < (C.defectBelow - o.loyalty) / C.defectBelow * C.defectRate * dd) defect(state, o);
      }
    }
  }

  // ---------------- Travel ----------------
  function travelStep(state) {
    for (const o of state.officers) {
      if (!o.travel) continue;
      if (state.time >= o.travel.arrive) { o.loc = o.travel.to; o.travel = null; o.role = 'idle'; ev(state, { type: 'arrived', owner: o.owner, officer: o.id, city: o.loc }); }
    }
  }

  // ---------------- Wanderers ----------------
  function wandererStep(state) {
    const C = O();
    for (const o of state.officers) {
      if (o.owner !== 0 || o.loc === null) continue;
      if (state.time < o.nextMove) continue;
      if (o.nextMove === 0) { o.nextMove = state.time + C.wanderMin + VM.RNG.next(state) * (C.wanderMax - C.wanderMin); continue; }
      const adj = state.map.nodes[o.loc].adj; o.loc = adj[VM.RNG.int(state, adj.length)];
      o.nextMove = state.time + C.wanderMin + VM.RNG.next(state) * (C.wanderMax - C.wanderMin);
      const owner = state.cities[o.loc].owner;
      if (owner > 0) ev(state, { type: 'wanderer', owner, officer: o.id, city: o.loc });
    }
    if (state.time >= state.nextSpawn) {
      state.nextSpawn += C.spawnEvery;
      const wand = state.officers.filter(o => o.owner === 0 && o.loc !== null).length;
      if (wand < C.wanderersMax) state.officers.push(VM.World.makeOfficer(state, state.officers.length, null, 0, VM.RNG.int(state, state.cities.length)));
    }
  }

  const visibleTo = (state, w, faction) => w.owner === 0 && w.loc !== null && (state.cities[w.loc].owner === faction || w.revealed.includes(faction));
  const wanderersFor = (state, faction) => state.officers.filter(w => visibleTo(state, w, faction));
  const recruitCost = w => O().recruitBase + O().recruitPerStat * (w.command + w.might + w.politics + w.intellect);

  function searchStep(state) {
    const C = O();
    for (const o of state.officers) {
      if (!o.searching || state.time < o.searching.until) continue;
      const city = o.searching.city, f = o.owner; o.searching = null; o.role = 'idle';
      const cands = state.officers.filter(w => w.owner === 0 && w.loc !== null && !w.revealed.includes(f) && hops(state, city, w.loc) <= C.searchRange);
      cands.sort((a, b) => hops(state, city, a.loc) - hops(state, city, b.loc) || a.id - b.id);
      if (cands.length && VM.RNG.next(state) < 0.5 + 0.4 * o.intellect / 100) { cands[0].revealed.push(f); ev(state, { type: 'found', owner: f, officer: cands[0].id, city: cands[0].loc }); }
      else ev(state, { type: 'searchFailed', owner: f, officer: o.id, city });
    }
  }

  // ---------------- Commands (validated; used by the player, the UI and the AI) ----------------
  const fail = reason => ({ ok: false, reason });

  function sendOfficer(state, f, id, to) {
    const o = state.officers[id], c = state.cities[to];
    if (!o || o.owner !== f) return fail('not your officer');
    if (!c || c.owner !== f) return fail('destination is not your city');
    if (o.role !== 'idle' || o.army !== null || o.travel || o.searching) return fail('officer is busy');
    if (o.loc === to) return fail('already there');
    const d = hops(state, o.loc, to); if (d === Infinity) return fail('no road there');
    o.role = 'traveling'; o.travel = { to, arrive: state.time + d / O().speed };
    return { ok: true, days: Math.ceil(d / O().speed) };
  }

  function search(state, f, id) {
    const o = state.officers[id];
    if (!o || o.owner !== f) return fail('not your officer');
    if (o.role !== 'idle' || o.army !== null || o.travel || o.searching) return fail('officer is busy');
    if (state.cities[o.loc].owner !== f) return fail('must be in your city');
    if (state.factions[f].gold < O().searchCost) return fail('not enough gold');
    state.factions[f].gold -= O().searchCost;
    o.role = 'searching'; o.searching = { city: o.loc, until: state.time + O().searchDays };
    return { ok: true };
  }

  function recruit(state, f, wid) {
    const w = state.officers[wid];
    if (!w || !visibleTo(state, w, f)) return fail('no such wanderer');
    const fac = state.factions[f], cost = recruitCost(w);
    if (fac.gold < cost) return fail('not enough gold');
    const pols = state.officers.filter(o => o.owner === f && (o.role === 'idle' || o.role === 'governor')).map(o => o.politics);
    if (!pols.length) return fail('you have no officer to make the offer');
    fac.gold -= cost;
    const p = clamp(0.35 + 0.5 * Math.max(...pols) / 100, 0, 0.9);
    if (VM.RNG.next(state) < p) {
      w.owner = f; w.loyalty = 55; w.role = 'idle'; w.revealed = []; w.idleDays = 0; w.loc = state.cities[w.loc].owner === f ? w.loc : nearestOwn(state, w.loc, f);
      ev(state, { type: 'recruited', owner: f, officer: w.id, city: w.loc });
      return { ok: true, joined: true, cost };
    }
    const adj = state.map.nodes[w.loc].adj; w.loc = adj[VM.RNG.int(state, adj.length)]; w.revealed = [];
    return { ok: true, joined: false, cost };
  }

  function gift(state, f, id) {
    const o = state.officers[id], fac = state.factions[f];
    if (!o || o.owner !== f) return fail('not your officer');
    if (state.time - o.gift < O().giftCooldown) return fail('they were rewarded recently');
    if (fac.gold < O().giftCost) return fail('not enough gold');
    fac.gold -= O().giftCost; o.gift = state.time; o.loyalty = clamp(o.loyalty + O().giftGain, 0, 100);
    return { ok: true };
  }

  const POLICIES = ['manual', 'develop', 'fortify', 'recruit'], ORDERS = ['hold', 'defend', 'reinforce', 'raid'];

  function setPolicy(state, f, cityId, mode) {
    const c = state.cities[cityId];
    if (!c || c.owner !== f) return fail('not your city');
    if (!POLICIES.includes(mode)) return fail('unknown policy');
    if (mode !== 'manual' && c.governor === null) return fail('assign a governor first');
    c.policy = mode; c.nextThink = state.time; return { ok: true };
  }

  function setOrder(state, f, armyId, mode) {
    const a = state.armies.find(x => x.id === armyId);
    if (!a || a.owner !== f) return fail('not your army');
    if (!ORDERS.includes(mode)) return fail('unknown order');
    a.order = mode; a.nextThink = state.time; a.rest = false;
    if (mode === 'defend' || mode === 'hold') a.station = a.at !== null && state.cities[a.at].owner === f ? a.at : nearestOwn(state, originOf(a), f);
    a.peak = Math.max(a.peak || 0, VM.Armies.sizeOf(a));
    return { ok: true };
  }

  // ---------------- Governors ----------------
  function threatened(state, c) {
    for (const a of state.armies) if (VM.Diplo.hostile(state, a.owner, c.owner) && hops(state, VM.Armies.zoneOf(a), c.id) <= O().sense) return true;
    for (const x of state.cities) if (VM.Diplo.hostile(state, x.owner, c.owner) && x.owner !== 0 && hops(state, x.id, c.id) <= O().sense) return true;
    return false;
  }

  function buildOrder(state, c, gov, mode) {
    const t = gov.trait, st = c.stats;
    let order = ['market', 'temple', 'farm', 'barracks'];
    if (t === 'Schemer') order = ['market', 'temple', 'farm', 'barracks'];
    if (t === 'Brave' || t === 'Rash') order = ['barracks', 'farm', 'market', 'temple'];
    if (t === 'Loyal') order = ['temple', 'market', 'farm', 'barracks'];
    if (mode === 'fortify' || (t === 'Cautious' && threatened(state, c))) order = ['wall'].concat(order);
    if (mode === 'recruit') order = ['barracks'].concat(order);
    if (st.foodProd < st.foodCons * 1.1 && c.buildings.farm < VM.CFG.MAX_BUILD_LEVEL) order = ['farm'].concat(order);
    return order;
  }

  function governorThink(state, c, modeOverride) {
    const C = O(), gov = c.governor !== null ? state.officers[c.governor] : { trait: 'none' }, f = state.factions[c.owner];
    const reserve = C.reserve * (gov.trait === 'Cautious' ? 1.6 : (gov.trait === 'Rash' ? 0.5 : 1)), st = c.stats, mode = modeOverride || c.policy;
    // Taxes: relieve a struggling city; a greedy governor squeezes a poor treasury.
    let tax = 'normal';
    if (st.prosperity < 0.65 || f.foodSec < 0.6) tax = 'low';
    else if (gov.trait === 'Greedy' && f.gold < reserve * 2) tax = 'high';
    if (c.tax !== tax) exec(state, c.owner, { type: 'setTax', city: c.id, tax });
    // Construction
    if (!c.build) {
      for (const type of buildOrder(state, c, gov, mode)) {
        const lvl = c.buildings[type]; if (lvl >= VM.CFG.MAX_BUILD_LEVEL) continue;
        if (type === 'wall' && lvl >= (mode === 'fortify' ? 3 : 2)) continue;
        if (f.gold >= VM.CFG.BUILD[type].cost[lvl] + reserve) { exec(state, c.owner, { type: 'build', city: c.id, building: type }); break; }
      }
    }
    // Garrison
    const want = Math.round(c.pop * C.garrisonTarget[mode === 'manual' ? 'develop' : mode]), have = total(c.garrison);
    if (have < want && f.gold > reserve * 1.5) {
      const kind = mode === 'recruit' && c.buildings.barracks ? (VM.RNG.next(state) < 0.5 ? 'spear' : 'archer') : (mode === 'fortify' ? 'archer' : 'infantry');
      exec(state, c.owner, { type: 'recruit', city: c.id, troop: kind, count: Math.min(C.recruitBatch, Math.round(want - have)) });
    }
  }

  function governorStep(state) {
    const C = O();
    for (const c of state.cities) {
      if (c.policy === 'manual' || c.owner === 0) continue;
      if (c.governor === null) { c.policy = 'manual'; continue; }
      if (state.time < c.nextThink) continue;
      const gov = state.officers[c.governor];
      c.nextThink = state.time + C.thinkBase - C.thinkPol * gov.politics / 100;
      governorThink(state, c);
    }
  }

  // ---------------- Army commanders ----------------
  const oddsFor = (table, trait) => table[trait] !== undefined ? table[trait] : table.other;

  function strengthRatio(state, a, e) {
    const mine = VM.War.power(a.troops, e.troops) * VM.War.armyMods(state, a);
    const theirs = Math.max(1, VM.War.power(e.troops, a.troops) * VM.War.armyMods(state, e));
    return mine / theirs;
  }

  function siegeRatio(state, a, c) {
    const g = c.garrison, mine = VM.War.power(a.troops, g) * VM.War.armyMods(state, a);
    const theirs = Math.max(1, VM.War.power(g, a.troops) * VM.War.garrisonMods(state, c)) + (c.wallHp > 0 ? c.wallHp * ((a.troops.siege || 0) > 0 ? 0.02 : 0.08) : 0);
    return mine / theirs;
  }

  function goto(state, a, node) {
    if (a.dest === node || (a.at === node && !a.path.length)) return;
    VM.Armies.move(state, a, node);
  }

  // An officer inside his own walled city under siege chooses between holding the walls with the garrison and riding out to fight the besiegers in the open:
  // out if he is clearly the stronger, or if the gate is about to fall; behind the walls otherwise. How sure he must be depends on his nature.
  function decideSortie(state, a, city) {
    const foes = state.armies.filter(e => VM.Diplo.hostile(state, e.owner, a.owner) && e.at === city.id && !e.routed && VM.War.sieging(e));
    if (!foes.length || city.wallHp <= 0) { a.sortie = false; return; }
    const o = state.officers[a.officer], foe = { troops: {} };
    for (const e of foes) for (const k in e.troops) foe.troops[k] = (foe.troops[k] || 0) + e.troops[k];
    const ratio = VM.War.power(a.troops, foe.troops) * VM.War.armyMods(state, a) / Math.max(1, VM.War.power(foe.troops, a.troops) * foes.reduce((m, e) => Math.max(m, VM.War.armyMods(state, e)), 1));
    const need = oddsFor(O().sortieOdds, o.trait), failing = city.wallHp < 0.35 * VM.War.wallMax(city) && foe.troops.siege > 0;
    a.sortie = ratio >= need || (failing && ratio >= need * 0.7);
  }

  function armyThink(state, a) {
    const C = O(), o = state.officers[a.officer];
    a.peak = Math.max(a.peak || 0, VM.Armies.sizeOf(a));
    if (a.routed || a.fighting.length) return;
    const s = a.supply, here = a.at !== null ? state.cities[a.at] : null;
    if (here && here.owner === a.owner) decideSortie(state, a, here);
    if (a.order === 'hold') return;
    if (VM.Diplo.aiding(state, a) && a.at === a.aid.city) return;           // sent to help an ally: it stays
    const weary = !!VM.War.retreatReason(state, a);                    // the food would run out, or the men have lost heart (how far they are pushed depends on the officer)
    if (!weary && !a.rest && here && VM.Diplo.hostile(state, here.owner, a.owner) && VM.War.sieging(a)) return;     // a hostile city in the way is being fought: stay until it falls
    if (weary || a.rest) {                                            // fall back and recover
      a.rest = a.morale < 85 || !!(s && s.line !== 'ok');
      if (a.dest !== null && state.cities[a.dest].owner === a.owner) return;       // already on its way to a friendly city
      const home = nearestOwn(state, originOf(a), a.owner);
      if (home >= 0 && !(here && here.id === home)) goto(state, a, home);
      return;
    }
    if (a.order === 'defend') {
      const st = a.station === null || a.station === undefined || state.cities[a.station].owner !== a.owner ? nearestOwn(state, originOf(a), a.owner) : a.station;
      a.station = st; if (st < 0) return;
      let threat = null, td = Infinity;
      for (const e of state.armies) {
        if (VM.Diplo.friendly(state, e.owner, a.owner) || e.routed) continue;
        const d = hops(state, st, VM.Armies.zoneOf(e)); if (d <= C.sense && d < td) { td = d; threat = e; }
      }
      if (threat && strengthRatio(state, a, threat) >= oddsFor(C.odds, o.trait)) goto(state, a, VM.Armies.zoneOf(threat));
      else if (!(here && here.id === st)) goto(state, a, st);
      return;
    }
    if (a.order === 'reinforce') {
      let best = -1, bd = Infinity;
      const quiet = !state.cities.some(c => c.owner === a.owner && (c.contested || c.besieged));
      if (quiet && a.dest !== null && state.cities[a.dest].owner === a.owner) return;
      for (const c of state.cities) if (c.owner === a.owner && (c.contested || c.besieged)) { const d = hops(state, originOf(a), c.id); if (d < bd) { bd = d; best = c.id; } }
      if (best < 0) best = nearestOwn(state, originOf(a), a.owner);
      if (best >= 0) goto(state, a, best);
      return;
    }
    if (a.order === 'raid') {
      if (here && VM.Diplo.hostile(state, here.owner, a.owner) && VM.War.sieging(a)) return;       // already laying siege
      if (a.dest !== null) return;
      let best = -1, bs = Infinity;
      for (const c of state.cities) {
        if (VM.Diplo.friendly(state, c.owner, a.owner)) continue;
        const d = hops(state, originOf(a), c.id); if (d > C.sense * 1.6) continue;
        if (siegeRatio(state, a, c) < oddsFor(C.raidOdds, o.trait)) continue;
        if (d < bs) { bs = d; best = c.id; }
      }
      if (best >= 0) goto(state, a, best);
      else { const home = nearestOwn(state, originOf(a), a.owner); if (home >= 0 && !(here && here.id === home)) goto(state, a, home); }
    }
  }

  function armyStep(state) {
    const C = O();
    for (const a of state.armies.slice()) {
      if (state.time < (a.nextThink || 0)) continue;
      a.nextThink = state.time + C.armyThink;
      armyThink(state, a);
    }
  }

  // ---------------- Proposals (only for the player's faction; the AI decides for itself) ----------------
  function propose(state, p) {
    p.id = state.nextProposal++; p.created = state.time; p.expires = state.time + O().proposalExpires;
    state.proposals.push(p); ev(state, { type: 'proposal', owner: state.player, proposal: p.id });
  }

  function proposalStep(state) {
    const C = O(), me = state.player;
    state.proposals = state.proposals.filter(p => p.expires > state.time);
    if (state.proposals.length >= C.proposalMax) return;
    for (const a of state.armies) {
      if (a.owner !== me || a.routed || a.fighting.length || (a.order !== 'hold' && a.order !== 'defend') || a.dest !== null) continue;
      const o = state.officers[a.officer];
      if (!['Rash', 'Brave', 'Greedy'].includes(o.trait) || state.time < o.nextProposal || a.at === null) continue;
      if (state.proposals.some(p => p.army === a.id)) continue;
      let best = null, bd = Infinity;
      for (const c of state.cities) {
        if (VM.Diplo.friendly(state, c.owner, me)) continue;
        const d = hops(state, a.at, c.id); if (d > C.sense * 1.1 || d >= bd) continue;
        if (siegeRatio(state, a, c) >= (o.trait === 'Rash' ? 1.2 : 1.6)) { bd = d; best = c.id; }
      }
      if (best !== null) { o.nextProposal = state.time + C.proposalEvery; propose(state, { type: 'attack', officer: o.id, army: a.id, target: best }); }
    }
    for (const c of state.cities) {
      if (c.owner !== me || c.governor === null || c.policy !== 'manual' || c.build || c.buildings.wall >= 2) continue;
      const g = state.officers[c.governor];
      if (g.trait !== 'Cautious' || state.time < g.nextProposal || !threatened(state, c)) continue;
      const cost = VM.CFG.BUILD.wall.cost[c.buildings.wall];
      if (state.factions[me].gold < cost + C.reserve || state.proposals.some(p => p.city === c.id)) continue;
      g.nextProposal = state.time + C.proposalEvery; propose(state, { type: 'wall', officer: g.id, city: c.id, cost });
    }
  }

  function answer(state, f, id, accept) {
    const i = state.proposals.findIndex(p => p.id === id);
    if (i < 0) return fail('that proposal is no longer open');
    const p = state.proposals[i]; state.proposals.splice(i, 1);
    if (!accept) { bump(state, p.officer, -1); return { ok: true }; }
    bump(state, p.officer, 3);
    if (p.type === 'attack') {
      const a = state.armies.find(x => x.id === p.army); if (!a) return fail('the army is gone');
      return VM.Armies.move(state, a, p.target);
    }
    if (p.type === 'wall') return VM.Commands.exec(state, { type: 'build', faction: f, city: p.city, building: 'wall' });
    return fail('unknown proposal');
  }

  function step(state, dd) {
    loyaltyStep(state, dd);
    travelStep(state);
    searchStep(state);
    wandererStep(state);
    governorStep(state);
    armyStep(state);
    proposalStep(state);
  }

  return { step, bump, manage: governorThink, threatened, sendOfficer, search, recruit, gift, setPolicy, setOrder, answer, wanderersFor, visibleTo, recruitCost, loyaltyTarget, POLICIES, ORDERS };
})();
