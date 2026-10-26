// AI factions. A rule-based planner that plays by the same rules as the player: every action is a command
// (VM.Commands.exec), it never touches gold, food or population directly, and difficulty only changes how often it thinks,
// how bold it is and how big a force it keeps. Run in the simulation, so headless AI-vs-AI games work in Node.
var VM = globalThis.VM = globalThis.VM || {};

VM.AI = (function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const total = t => { let n = 0; for (const k in t) n += t[k]; return n; };
  const COUNTER = { cavalry: 'spear', archer: 'cavalry', infantry: 'archer', spear: 'infantry' };   // the type that beats the key
  const levelOf = (state, f) => VM.CFG.AI[f.ai.level || state.difficulty] || VM.CFG.AI.normal;
  const exec = (state, f, cmd) => { cmd.faction = f.id; return VM.Commands.exec(state, cmd); };
  const dist = (state, a, b) => VM.Armies.distance(state, a, b);
  const originOf = a => a.at !== null ? a.at : a.edge.from;
  const mineOf = (state, f) => state.cities.filter(c => c.owner === f.id);
  const armiesOf = (state, f) => state.armies.filter(a => a.owner === f.id);
  const idleOfficers = (state, f) => state.officers.filter(o => o.owner === f.id && o.role === 'idle' && o.army === null && !o.travel && !o.searching && o.loc !== null);

  function nearestOwn(state, f, node) { return VM.War.nearestOwnCity(state, node, f.id, -1); }

  // Total strength of a faction's field armies and garrisons.
  function strengthOf(state, id) {
    let n = 0; for (const a of state.armies) if (a.owner === id) n += VM.Armies.sizeOf(a);
    for (const c of state.cities) if (c.owner === id) n += total(c.garrison);
    return n;
  }

  function threatScore(state, c) {
    let t = 0;
    for (const a of state.armies) if (VM.Diplo.hostile(state, a.owner, c.owner) && !a.routed && dist(state, VM.Armies.zoneOf(a), c.id) <= VM.CFG.OFFICERS.sense) t += VM.Armies.sizeOf(a);
    return t + (c.contested || c.besieged ? 500 : 0);
  }

  // ---------------- Officers and cities ----------------
  function staff(state, f, D) {
    const mine = mineOf(state, f);
    let idle = idleOfficers(state, f).filter(o => state.cities[o.loc].owner === f.id);
    const ungoverned = mine.filter(c => c.governor === null).sort((a, b) => b.pop - a.pop);
    for (const c of ungoverned) {                                      // keep two officers free to lead armies
      if (idle.length <= 2) break;
      idle.sort((a, b) => b.politics - a.politics);
      const o = idle.shift(); exec(state, f, { type: 'setGovernor', city: c.id, officer: o.id });
    }
    const military = mine.filter(c => c.governor !== null).sort((a, b) => b.pop - a.pop).slice(0, 2);
    for (const c of mine) {
      if (c.governor === null) { VM.Officers.manage(state, c, VM.Officers.threatened(state, c) ? 'fortify' : 'develop'); continue; }
      const want = VM.Officers.threatened(state, c) ? 'fortify' : (military.includes(c) ? 'recruit' : 'develop');
      if (c.policy !== want) exec(state, f, { type: 'setPolicy', city: c.id, mode: want });
    }
  }

  function recruitOfficers(state, f, D) {
    const m = f.ai, reserve = 600;
    const w = VM.Officers.wanderersFor(state, f.id).sort((a, b) => (b.command + b.might + b.politics + b.intellect) - (a.command + a.might + a.politics + a.intellect));
    if (w.length && f.gold > reserve + VM.Officers.recruitCost(w[0])) exec(state, f, { type: 'recruitOfficer', officer: w[0].id });
    else if (D.search && m.thinks % 3 === 0 && f.gold > reserve * 2) {
      const o = idleOfficers(state, f).find(x => state.cities[x.loc].owner === f.id);
      if (o) exec(state, f, { type: 'searchOfficers', officer: o.id });
    }
  }

  // ---------------- Recruiting ----------------
  function wantedType(state, f, c) {
    const w = { infantry: 0, spear: 0, cavalry: 0, archer: 0 };
    for (const a of state.armies) if (VM.Diplo.hostile(state, a.owner, f.id) && dist(state, VM.Armies.zoneOf(a), c.id) <= 700) for (const k in w) w[k] += (COUNTER[k] ? 0 : 0) + (a.troops[k] || 0);
    for (const x of state.cities) if (VM.Diplo.hostile(state, x.owner, f.id) && x.owner !== 0 && dist(state, x.id, c.id) <= 500) for (const k in w) w[k] += (x.garrison[k] || 0) * 0.5;
    const need = { infantry: 0.2, spear: 0.2, cavalry: 0.2, archer: 0.2 }, sum = w.infantry + w.spear + w.cavalry + w.archer;
    if (sum > 0) for (const k in w) need[COUNTER[k]] += w[k] / sum;
    const have = {}; let hs = 1; for (const k in w) { have[k] = c.garrison[k] || 0; hs += have[k]; }
    let best = 'infantry', bs = -Infinity;
    for (const k in need) { const s = need[k] - have[k] / hs; if (s > bs) { bs = s; best = k; } }
    return best;
  }

  function recruitTroops(state, f, D) {
    const mine = mineOf(state, f), pop = mine.reduce((a, c) => a + c.pop, 0);
    let have = strengthOf(state, f.id);
    const built = mine.reduce((a, c) => a + Object.values(c.buildings).reduce((x, y) => x + y, 0), 0) / Math.max(1, mine.length);
    let budget = Math.max(0, f.gold - VM.CFG.AI_RESERVE) * D.spend * (built < 4 ? 0.4 : 1);      // build the economy first
    const military = mine.slice().sort((a, b) => b.pop - a.pop).slice(0, 3);
    const plan = f.ai.plan, goal = plan ? plan.target : f.ai.goal, tgt = goal !== null && goal !== undefined ? state.cities[goal] : null;
    const share = D.mil * (1 + Math.min(2, Math.max(0, f.gold - 3000) / 5000));
    for (const c of military) {
      if (have >= pop * share || budget < 150) break;
      let type = wantedType(state, f, c);
      const siegeHave = (c.garrison.siege || 0) + armiesOf(state, f).reduce((a, x) => a + (x.troops.siege || 0), 0);
      if (tgt && tgt.wallHp > 400 && siegeHave < (tgt.wallHp >= 1500 ? 12 : 6) && D.armiesMax >= 3) type = 'siege';
      const count = type === 'siege' ? 4 : Math.min(8, Math.floor(budget / Math.max(1, VM.Eco.troopCost(c, type))));
      if (count < 1) continue;
      const r = exec(state, f, { type: 'recruit', city: c.id, troop: type, count });
      if (r.ok) { budget -= r.cost; have += count; }
    }
  }

  // ---------------- Armies ----------------
  function formArmies(state, f, D) {
    const mine = mineOf(state, f), my = armiesOf(state, f), cap = D.armiesMax + Math.floor(mine.length / 8);
    if (my.length >= cap) return;
    for (const c of mine.sort((a, b) => total(b.garrison) - total(a.garrison))) {
      if (my.length >= cap) break;
      const keep = Math.max(3, c.pop * VM.CFG.AI_KEEP);
      if (total(c.garrison) - keep < 13) continue;
      let off = idleOfficers(state, f).filter(o => o.loc === c.id && c.governor !== o.id).sort((a, b) => b.command - a.command)[0];
      if (!off) {                                                      // bring a free officer here for next time
        const far = idleOfficers(state, f).filter(o => c.governor !== o.id && state.cities[o.loc].owner === f.id).sort((a, b) => b.command - a.command)[0];
        if (far) exec(state, f, { type: 'sendOfficer', officer: far.id, to: c.id });
        continue;
      }
      const r = exec(state, f, { type: 'formArmy', city: c.id, officer: off.id, keep });
      if (r.ok) {
        const a = state.armies.find(x => x.id === r.army); my.push(a);
        a.ai = my.filter(x => x.ai === 'guard').length < D.guards ? 'guard' : 'strike';
        a.order = 'hold';
      }
    }
  }

  // Idle armies sitting in a city absorb its spare troops, so forces grow with the economy.
  function topUp(state, f) {
    for (const a of armiesOf(state, f)) {
      if (a.at === null || a.rest || a.fighting.length || a.routed || state.cities[a.at].owner !== f.id) continue;
      const c = state.cities[a.at], keep = Math.max(3, c.pop * VM.CFG.AI_KEEP);
      if (total(c.garrison) - keep >= 6) exec(state, f, { type: 'reinforceArmy', army: a.id, keep });
    }
  }

  function guardDuty(state, f, D) {
    const mine = mineOf(state, f); if (!mine.length) return;
    const cap = state.cities[f.capital] && state.cities[f.capital].owner === f.id ? f.capital : mine.sort((a, b) => b.pop - a.pop)[0].id;
    const guards = armiesOf(state, f).filter(a => a.ai === 'guard' && !a.routed);
    const used = new Set();
    guards.forEach((a, i) => {
      // Each guard takes a different post: the most threatened cities first, then the capital.
      const posts = mine.slice().sort((x, y) => threatScore(state, y) - threatScore(state, x) || (y.id === cap) - (x.id === cap)).map(c => c.id);
      const post = posts.find(p => !used.has(p)) ?? cap; used.add(post);
      if (a.fighting.length) return;
      if (a.station !== post || a.order !== 'defend') {
        if (a.at === post) exec(state, f, { type: 'setOrder', army: a.id, mode: 'defend' }), a.station = post;
        else if (a.dest !== post && !a.fighting.length) { a.order = 'hold'; VM.Armies.move(state, a, post); }
      }
    });
  }

  function weary(state, a) { return !!VM.War.retreatReason(state, a); }

  function strikeForce(state, f, D) {
    const m = f.ai, strikes = armiesOf(state, f).filter(a => a.ai === 'strike' && !a.routed);
    const mine = mineOf(state, f); if (!mine.length) return;
    // Abilities and rest
    for (const a of strikes) {
      const o = state.officers[a.officer];
      if (D.abilities && (a.fighting.length || (a.at !== null && VM.War.sieging(a) && VM.Diplo.hostile(state, state.cities[a.at].owner, f.id))) && state.time >= a.abilityReady) exec(state, f, { type: 'ability', army: a.id });
      if (!a.fighting.length) {
        if (weary(state, a) && !a.rest) { a.rest = true; m.plan = m.plan && m.plan.armies.includes(a.id) ? null : m.plan; }
        if (a.rest) {
          if (a.morale >= 85 && !(a.supply && a.supply.line !== 'ok')) a.rest = false;
          else { const home = nearestOwn(state, f, originOf(a)); if (home >= 0 && a.dest !== home && !(a.at === home)) VM.Armies.move(state, a, home); }
        }
      }
    }
    const ready = strikes.filter(a => !a.rest && !a.fighting.length && a.morale >= 60);
    let plan = m.plan;
    if (plan && state.cities[plan.target].owner === f.id) { m.lastGain = state.time; plan = m.plan = null; m.cool = state.time + 8; }
    const odds = D.odds * clamp(1 - 0.1 * Math.floor((state.time - m.lastGain) / 360), 0.6, 1);
    if (plan) plan.armies = plan.armies.filter(id => state.armies.some(a => a.id === id));
    if (plan && !plan.armies.length) plan = m.plan = null;
    if (!plan) {
      if (!strikes.length) { chooseTarget(state, f, D, [{ troops: {}, at: null, officer: 0 }], odds); return; }
      if (!ready.length || state.time < (m.cool || 0)) return;
      const best = chooseTarget(state, f, D, ready, odds);
      if (best === null) return;
      plan = m.plan = { target: best, stage: nearestOwn(state, f, best), phase: 'gather', armies: ready.map(a => a.id), since: state.time };
      if (D.depots && !state.cities[plan.stage].depot && f.gold > VM.CFG.WAR.depotCost + 900) { exec(state, f, { type: 'buildDepot', city: plan.stage }); exec(state, f, { type: 'setDepot', city: plan.stage, target: 1500 }); }
    }
    const target = state.cities[plan.target], mem = plan.armies.map(id => state.armies.find(a => a.id === id)).filter(a => !a.rest && !a.routed);
    if (!mem.length) { m.plan = null; return; }
    if (plan.phase === 'gather') {
      for (const a of mem) if (a.at !== plan.stage && a.dest !== plan.stage && !a.fighting.length) { a.order = 'hold'; VM.Armies.move(state, a, plan.stage); }
      const here = mem.filter(a => a.at === plan.stage && !a.fighting.length);
      if (state.time - plan.since > 80 && !here.length) { m.plan = null; m.cool = state.time + 20; return; }
      if (here.length && (here.length === mem.length || state.time - plan.since > 40)) {
        for (const o of here.slice(1)) exec(state, f, { type: 'mergeArmies', army: here[0].id, with: o.id });
        plan.phase = 'march'; plan.armies = [here[0].id];
      }
    }
    if (plan.phase === 'march') {
      const a = state.armies.find(x => x.id === plan.armies[0]); if (!a) { m.plan = null; return; }
      if (a.fighting.length || (a.at !== null && VM.Diplo.hostile(state, state.cities[a.at].owner, f.id) && VM.War.sieging(a))) return;     // fighting, or besieging the target or a city in the way
      if (a.dest !== plan.target && !a.rest) {
        // Re-check the odds on the day it leaves.
        if (ratio(state, a, target) < odds * 0.85) { m.plan = null; m.cool = state.time + 20; return; }
        VM.Armies.move(state, a, plan.target);
      }
    }
  }

  function ratio(state, a, c) {
    const g = c.garrison, mine = VM.War.power(a.troops, g) * VM.War.armyMods(state, a);
    const theirs = Math.max(1, VM.War.power(g, a.troops) * VM.War.garrisonMods(state, c)) + (c.wallHp > 0 ? c.wallHp * ((a.troops.siege || 0) > 0 ? 0.02 : 0.08) : 0);
    let help = 0;
    for (const e of state.armies) if (e.owner === c.owner && !e.routed && dist(state, VM.Armies.zoneOf(e), c.id) <= 220) help += VM.War.power(e.troops, a.troops);
    return mine / (theirs + help);
  }

  // Pick the most valuable hostile city the ready armies can take with margin, close enough to supply.
  function chooseTarget(state, f, D, ready, odds) {
    const probe = { troops: {}, owner: f.id, at: null, morale: 100, officer: ready[0].officer, edge: { prog: 0, len: 1, from: ready[0].at === null ? 0 : ready[0].at, to: 0 }, buff: null };
    for (const a of ready) for (const k in a.troops) probe.troops[k] = (probe.troops[k] || 0) + a.troops[k];
    let best = null, bs = -Infinity, goal = null, gs = -Infinity;
    const rivals = {}; for (const c of state.cities) if (c.owner > 0 && !VM.Diplo.friendly(state, c.owner, f.id)) rivals[c.owner] = (rivals[c.owner] || 0) + 1;
    for (const c of state.cities) {
      if (VM.Diplo.friendly(state, c.owner, f.id)) continue;
      const near = nearestOwn(state, f, c.id), d = near >= 0 ? dist(state, near, c.id) : Infinity;
      if (d > D.reach) continue;
      const g = c.garrison, mine = VM.War.power(probe.troops, g), theirs = Math.max(1, VM.War.power(g, probe.troops) * VM.War.garrisonMods(state, c)) + (c.wallHp > 0 ? c.wallHp * ((probe.troops.siege || 0) > 0 ? 0.02 : 0.08) : 0);
      let help = 0; for (const e of state.armies) if (e.owner === c.owner && !e.routed && dist(state, VM.Armies.zoneOf(e), c.id) <= 220) help += VM.War.power(e.troops, probe.troops);
      const r = mine * (1 + VM.CFG.WAR.cmdBonus * 0.6) / (theirs + help);
      let value = 100 + c.pop / 10 + (c.spec === 'capital' ? 160 : 0) + (c.owner === 0 ? 0 : 25);
      if (c.owner > 0 && rivals[c.owner] <= 2) value += 90;                           // finish a weak rival
      const gscore = value / (1 + d / 150);
      if (gscore > gs) { gs = gscore; goal = c.id; }                                     // what the AI is building toward, even if it cannot take it yet
      if (r < odds) continue;
      const score = gscore - theirs * 0.02;
      if (score > bs) { bs = score; best = c.id; }
    }
    state.factions[f.id].ai.goal = goal;
    return best;
  }

  function think(state, f) {
    const D = levelOf(state, f), m = f.ai; m.thinks++;
    const n = mineOf(state, f).length; if (n > m.cities) m.lastGain = state.time; m.cities = n;
    staff(state, f, D);
    recruitOfficers(state, f, D);
    recruitTroops(state, f, D);
    formArmies(state, f, D);
    topUp(state, f);
    guardDuty(state, f, D);
    strikeForce(state, f, D);
  }

  function step(state) {
    if (state.over || !state.aiOn) return;
    for (const f of state.factions) {
      if (f.neutral || !f.alive || !f.ai) continue;
      if (f.id === state.player && !state.aiAll) continue;
      if (state.time < f.ai.next) continue;
      const D = levelOf(state, f);
      f.ai.next = state.time + D.think;
      think(state, f);
    }
  }

  return { step, think, strengthOf, chooseTarget };
})();
