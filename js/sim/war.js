// War: territory zones, supply, battles between armies, sieges, morale, officer abilities, capture and elimination.
// Runs once per step after armies have moved and before the economy, so contested cities and army food are up to date.
var VM = globalThis.VM = globalThis.VM || {};

VM.War = (function () {
  const W = () => VM.CFG.WAR;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const total = t => { let n = 0; for (const k in t) n += t[k]; return n; };
  const BEATS = { spear: 'cavalry', cavalry: 'archer', archer: 'infantry', infantry: 'spear' };   // key beats value

  function matchup(a, d) { return BEATS[a] === d ? W().strong : (BEATS[d] === a ? W().weak : 1); }

  // Effective strength of troops `att` against troops `def`: each type is weighted by how it fares against the enemy's mix.
  function power(att, def) {
    const dt = total(def); let p = 0;
    for (const k in att) {
      if (!att[k]) continue;
      let m = 1;
      if (dt > 0) { m = 0; for (const j in def) m += def[j] / dt * matchup(k, j); }
      if (VM.CFG.TROOPS[k].siege) m *= W().siegeField;
      p += att[k] * m;
    }
    return p;
  }

  const wallMax = city => {
    const lvl = city.buildings.wall, S = VM.CFG.SPEC[city.spec];
    return Math.max(0, W().wallHp[Math.max(0, lvl)] || 0) * (S.defense || 1);
  };

  function armyMods(state, a) {
    const o = state.officers[a.officer], city = state.cities[VM.Armies.zoneOf(a)];
    let m = (1 + W().cmdBonus * o.command / 100) * (0.5 + 0.5 * a.morale / 100);
    if (a.buff && a.buff.until > state.time) m *= a.buff.mult;
    if (city.owner === a.owner) m *= W().home * (VM.CFG.SPEC[city.spec].defense || 1);
    return m;
  }

  function garrisonMods(state, city) {
    const gov = city.governor !== null ? state.officers[city.governor].command / 100 : 0;
    let m = 1 + 0.2 * gov;
    if (city.wallHp > 0) m *= W().wallBonus;
    return m * (VM.CFG.SPEC[city.spec].defense || 1);
  }

  const pos = (state, a) => VM.Armies.position(state, a);
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const sieging = a => a.at !== null && a.path.length === 0 && !a.routed && a.retreat <= 0;

  function nearestOwnCity(state, from, owner, skip) {
    let best = -1, bd = Infinity;
    for (const c of state.cities) {
      if (c.owner !== owner || c.id === skip) continue;
      const d = VM.Armies.distance(state, from, c.id); if (d < bd) { bd = d; best = c.id; }
    }
    return best;
  }

  // ---- Zones: a city is contested while an enemy army stands in its territory and none of its own does ----
  function updateZones(state) {
    for (const c of state.cities) { c.contested = false; c.besieged = false; }
    const friendly = new Set(), enemy = {};
    for (const a of state.armies) {
      const z = VM.Armies.zoneOf(a), c = state.cities[z];
      if (a.owner === c.owner) { if (!a.routed) friendly.add(z); } else if (c.owner !== 0) enemy[z] = true;
      if (a.owner !== c.owner && a.at !== null) c.besieged = true;
    }
    for (const c of state.cities) if (c.owner !== 0 && enemy[c.id] && !friendly.has(c.id)) c.contested = true;
    for (const c of state.cities) {
      const hot = c.contested || c.besieged;
      if (hot && !c.warn) VM.Eco.pushEvent(state, { type: 'attacked', owner: c.owner, city: c.id, besieged: c.besieged });
      c.warn = hot;
    }
  }

  // ---- Supply: food reaches an army along a road line from a city of its own; enemy armies on the line cut it ----
  function lineCut(state, a, route) {
    for (const e of state.armies) {
      if (e.owner === a.owner || e.routed) continue;
      if (e.at !== null) { if (route.includes(e.at)) return true; continue; }
      for (let i = 0; i < route.length - 1; i++) {
        const u = route[i], v = route[i + 1];
        if ((e.edge.from === u && e.edge.to === v) || (e.edge.from === v && e.edge.to === u)) return true;
      }
    }
    return false;
  }

  function updateSupply(state, dd) {
    const E = VM.CFG.ECON;
    for (const a of state.armies) {
      const n = VM.Armies.sizeOf(a), eat = n * E.foodPerHead;
      const ends = a.at !== null ? [a.at] : [a.edge.from, a.edge.to];
      // Nearest city of its own that is not under attack.
      let best = null;
      for (const o of ends) for (const c of state.cities) {
        if (c.owner !== a.owner || c.contested) continue;
        const d = VM.Armies.distance(state, o, c.id);
        if (!best || d < best.d) best = { d, origin: o, city: c.id };
      }
      const route = best ? VM.Armies.path(state, best.origin, best.city) : null;
      const zoneOwner = state.cities[VM.Armies.zoneOf(a)].owner, foreign = zoneOwner !== a.owner;
      const line = !route ? 'none' : (lineCut(state, a, route) ? 'cut' : 'ok');
      // A forward depot with stock close by feeds the army at the normal rate, even deep in enemy land.
      let depot = null;
      for (const c of state.cities) {
        if (c.owner !== a.owner || !c.depot || c.depot.food <= 0) continue;
        const d = Math.min(...ends.map(o => VM.Armies.distance(state, o, c.id)));
        if (d <= W().depotRange && (!depot || d < depot.d)) depot = { d, id: c.id };
      }
      const wasCut = a.supply && a.supply.line === 'cut';
      const useDepot = foreign && depot, mult = foreign && !useDepot ? W().foreignFood : 1;
      let need = eat * mult * dd, poolDraw = 0, starving = false;
      if (useDepot) { const d = state.cities[depot.id].depot, take = Math.min(need, d.food); d.food -= take; need -= take; }
      if (need > 1e-9) {
        if (line === 'ok') { poolDraw = need / dd; a.rations = Math.min(eat * W().rationDays, a.rations + eat * dd * W().refill); }
        else { a.rations -= need; if (a.rations <= 0) { a.rations = 0; starving = true; } }
      }
      if (line === 'ok' && state.factions[a.owner].starving && poolDraw > 0) starving = true;
      a.supply = { line, foreign, depot: useDepot ? depot.id : null, mult, poolDraw, starving, dist: best ? best.d : null };
      if (line === 'cut' && !wasCut) VM.Eco.pushEvent(state, { type: 'cut', owner: a.owner, army: a.id });
    }
  }

  // ---- Damage helpers ----
  function hurt(t, amount) {
    const n = total(t); if (n <= 0) return 0;
    const f = Math.max(0, 1 - amount / n);
    for (const k in t) t[k] *= f;
    return Math.min(n, amount);
  }

  function fate(state, o, victor, from) {
    const r = VM.RNG.next(state);
    o.army = null; o.role = 'idle';
    if (r < W().fateDead) { o.owner = -1; o.loc = null; VM.Eco.pushEvent(state, { type: 'officerDied', officer: o.id, owner: from }); return; }
    if (r < W().fateCaptured && victor !== 0) {
      o.owner = victor; o.loyalty = 40; const c = nearestOwnCity(state, o.loc, victor, -1); o.loc = c >= 0 ? c : o.loc;
      VM.Eco.pushEvent(state, { type: 'officerCaptured', officer: o.id, owner: victor, from }); return;
    }
    const c = nearestOwnCity(state, o.loc, from, -1);
    if (c >= 0) o.loc = c; else o.owner = 0;
    VM.Eco.pushEvent(state, { type: 'officerEscaped', officer: o.id, owner: from });
  }

  function destroy(state, a, victor) {
    const o = state.officers[a.officer];
    state.armies.splice(state.armies.indexOf(a), 1);
    VM.Eco.pushEvent(state, { type: 'destroyed', owner: a.owner, army: a.id, at: VM.Armies.zoneOf(a) });
    fate(state, o, victor, a.owner);
  }

  function eliminate(state, f) {
    f.alive = false;
    for (const a of state.armies.filter(x => x.owner === f.id)) { state.officers[a.officer].army = null; state.armies.splice(state.armies.indexOf(a), 1); }
    for (const o of state.officers) if (o.owner === f.id) { o.owner = 0; o.role = 'idle'; o.army = null; }
    VM.Eco.pushEvent(state, { type: 'eliminated', owner: f.id });
  }

  function capture(state, city, by) {
    const old = city.owner;
    city.owner = by; city.pop *= 1 - W().captureLoss; city.devastation = 0.5; city.build = null; city.tax = 'normal';
    for (const k in city.garrison) city.garrison[k] = 0;
    city.wallHp = wallMax(city) * 0.25; city.depot = null; city.contested = false; city.besieged = false;
    if (city.governor !== null) { state.officers[city.governor].role = 'idle'; city.governor = null; }
    for (const o of state.officers) if (o.owner === old && o.loc === city.id && o.army === null && old !== 0) fate(state, o, by, old);
    VM.Eco.pushEvent(state, { type: 'captured', city: city.id, owner: by, from: old });
    for (const a of state.armies) if (a.owner === by && a.at === city.id) VM.Officers.bump(state, a.officer, 10);
    if (old !== 0 && !state.cities.some(c => c.owner === old)) eliminate(state, state.factions[old]);
    checkOver(state);
  }

  function checkOver(state) {
    if (state.over) return;
    const mine = state.cities.filter(c => c.owner === state.player).length;
    if (mine === 0) state.over = { type: 'lose', t: state.time };
    else if (mine === state.cities.length) state.over = { type: 'win', t: state.time };
  }

  // ---- Battles and sieges ----
  function fight(state, dd) {
    const K = W().k, armies = state.armies;
    const incoming = new Map(), outPow = new Map(), enemyPow = new Map();
    const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    const was = new Map(armies.map(a => [a.id, a.fighting.length > 0]));
    for (const a of armies) a.fighting = [];
    const ps = new Map(armies.map(a => [a.id, pos(state, a)]));
    for (let i = 0; i < armies.length; i++) for (let j = i + 1; j < armies.length; j++) {
      const a = armies[i], b = armies[j];
      if (a.owner === b.owner || a.routed || b.routed) continue;
      if (dist(ps.get(a.id), ps.get(b.id)) > W().contact) continue;
      if (a.retreat <= 0) a.fighting.push(b.id);
      if (b.retreat <= 0) b.fighting.push(a.id);
      if (a.retreat > 0) b.fighting.push(a.id);      // a retreating army is still chased and struck, but does not strike back
      if (b.retreat > 0) a.fighting.push(b.id);
    }
    const byId = new Map(armies.map(a => [a.id, a]));
    // Army against army
    for (const a of armies) {
      if (a.retreat > 0 || !a.fighting.length) continue;
      const mods = armyMods(state, a);
      for (const eid of a.fighting) {
        const e = byId.get(eid), p = power(a.troops, e.troops) * mods / a.fighting.length;
        add(incoming, e.id, p); add(enemyPow, e.id, p); add(outPow, a.id, p);
      }
    }
    // Garrisons strike armies besieging them; besiegers strike the garrison and its wall when no army is in the way.
    const sieges = {};
    for (const a of armies) if (sieging(a) && state.cities[a.at].owner !== a.owner) (sieges[a.at] = sieges[a.at] || []).push(a);
    for (const cid in sieges) {
      const city = state.cities[cid], list = sieges[cid], g = city.garrison, gt = total(g);
      for (const a of list) {
        if (gt > 0) { const p = power(g, a.troops) * garrisonMods(state, city) / list.length; add(incoming, a.id, p); add(enemyPow, a.id, p); }
        if (a.fighting.length) continue;
        const mods = armyMods(state, a);
        if (city.wallHp > 0) {
          let sg = a.troops.siege || 0, rest = total(a.troops) - sg;
          city.wallHp = Math.max(0, city.wallHp - (sg * W().siegeWall + rest * W().chip) * mods * dd);
        }
        const p = power(a.troops, g) * mods * (city.wallHp > 0 ? W().wallProtect : 1);
        add(outPow, a.id, p); city._dmg = (city._dmg || 0) + p;
      }
    }
    // Apply damage and morale
    const dead = [];
    for (const a of armies) {
      const inc = incoming.get(a.id) || 0;
      if (inc > 0) {
        hurt(a.troops, inc * K * dd);
        const own = Math.max(1, outPow.get(a.id) || 0), ratio = clamp(inc / own, 0.3, 3);
        a.morale = Math.max(0, a.morale - W().moraleRate * ratio * dd);
      }
      if (a.fighting.length && !was.get(a.id)) VM.Eco.pushEvent(state, { type: 'battle', owner: a.owner, army: a.id, at: VM.Armies.zoneOf(a), enemy: byId.get(a.fighting[0]).owner });
    }
    for (const cid in sieges) {
      const city = state.cities[cid];
      if (city._dmg) hurt(city.garrison, city._dmg * K * dd);
      delete city._dmg;
    }
    return { byId, dead };
  }

  function cleanup(state) {
    // Destroyed armies, routs, rout arrivals, captures.
    for (const a of state.armies.slice()) {
      if (VM.Armies.sizeOf(a) < 1) {
        const killer = state.armies.find(e => a.fighting.includes(e.id));
        const z = state.cities[VM.Armies.zoneOf(a)];
        destroy(state, a, killer ? killer.owner : z.owner);
        continue;
      }
      if (a.morale <= 0 && !a.routed) {
        const from = VM.Armies.zoneOf(a), home = nearestOwnCity(state, from, a.owner, state.cities[from].owner === a.owner ? from : -1);
        a.fighting = []; a.buff = null;
        if (home >= 0) VM.Armies.move(state, a, home);     // order the retreat before the rout flag blocks further orders
        a.routed = true;
        VM.Eco.pushEvent(state, { type: 'rout', owner: a.owner, army: a.id, at: from });
        VM.Officers.bump(state, a.officer, -8);
      }
      if (a.routed && a.at !== null && !a.path.length) {
        if (state.cities[a.at].owner === a.owner) { a.routed = false; a.morale = W().routRecover; } else a.morale = Math.max(a.morale, 1);
      }
    }
    for (const c of state.cities) {
      if (c.besieged && VM.Eco.troopsOf(c.garrison) <= W().captureMin) {
        const hostile = state.armies.find(a => a.at === c.id && a.owner !== c.owner && sieging(a) && !a.fighting.length);
        const defended = state.armies.some(a => a.owner === c.owner && a.at === c.id);
        if (hostile && !defended) capture(state, c, hostile.owner);
      }
    }
  }

  function morale(state, dd) {
    for (const a of state.armies) {
      if (a.retreat > 0) a.retreat = Math.max(0, a.retreat - dd);
      if (a.fighting.length || a.routed) continue;
      const s = a.supply;
      if (s && s.starving) { a.morale = Math.max(0, a.morale - W().starveDrain * dd); for (const k in a.troops) a.troops[k] *= 1 - W().desert * dd; }
      else if (s && s.line !== 'ok' && !s.depot) a.morale = Math.max(0, a.morale - W().cutDrain * dd);
      else if (!sieging(a) || !state.cities[a.at].besieged || state.cities[a.at].owner === a.owner) a.morale = Math.min(100, a.morale + W().recover * dd);
    }
  }

  function depots(state, dd) {
    for (const c of state.cities) {
      if (!c.depot) continue;
      const f = state.factions[c.owner], want = c.depot.target - c.depot.food;
      if (want > 0 && !c.contested) { const mv = Math.min(W().depotRate * dd, want, f.food); c.depot.food += mv; f.food -= mv; }
    }
  }

  function walls(state, dd) {
    for (const c of state.cities) {
      const max = wallMax(c);
      if (c.wallHp > max) c.wallHp = max;
      if (!c.besieged && !c.contested && c.wallHp < max) c.wallHp = Math.min(max, c.wallHp + max * W().wallRepair * dd);
    }
  }

  function step(state, dd) {
    if (state.over) return;
    updateZones(state);
    updateSupply(state, dd);
    fight(state, dd);
    morale(state, dd);
    cleanup(state);
    depots(state, dd);
    walls(state, dd);
    if (state.armies.length || state.cities.some(c => c.besieged)) updateZones(state);
  }

  // ---- Officer abilities (the player or AI triggers them; each has a cooldown) ----
  function abilityOf(o) {
    const best = Math.max(o.command, o.might, o.intellect);
    return o.might === best ? 'charge' : (o.intellect === best ? 'fire' : 'rally');
  }

  function useAbility(state, a) {
    if (state.time < a.abilityReady) return { ok: false, reason: 'ability is recharging' };
    if (a.routed) return { ok: false, reason: 'army is routed' };
    const o = state.officers[a.officer], kind = abilityOf(o);
    const target = a.at !== null ? state.cities[a.at] : null;
    const inBattle = a.fighting.length > 0 || (sieging(a) && target.owner !== a.owner && (total(target.garrison) > 0 || target.wallHp > 0));
    if (kind === 'rally') a.morale = Math.min(100, a.morale + 30);
    else {
      if (!inBattle) return { ok: false, reason: 'no battle to use it in' };
      if (kind === 'charge') a.buff = { kind: 'charge', until: state.time + W().chargeDays, mult: W().chargeMult };
      else {
        const pct = 0.06 + 0.08 * o.intellect / 100;
        if (a.fighting.length) for (const e of state.armies) { if (a.fighting.includes(e.id)) { hurt(e.troops, VM.Armies.sizeOf(e) * pct); e.morale = Math.max(0, e.morale - 15); } }
        else { const c = state.cities[a.at]; hurt(c.garrison, total(c.garrison) * pct); c.wallHp = Math.max(0, c.wallHp - wallMax(c) * pct); }
      }
    }
    a.abilityReady = state.time + W().abilityCooldown;
    VM.Eco.pushEvent(state, { type: 'ability', owner: a.owner, army: a.id, kind });
    return { ok: true, kind };
  }

  function buildDepot(state, faction, cityId) {
    const c = state.cities[cityId], f = state.factions[faction];
    if (c.depot) return { ok: false, reason: 'already has a depot' };
    if (f.gold < W().depotCost) return { ok: false, reason: 'not enough gold' };
    f.gold -= W().depotCost; c.depot = { food: 0, target: 0 };
    return { ok: true };
  }

  return { step, power, matchup, wallMax, armyMods, garrisonMods, abilityOf, useAbility, buildDepot, capture, sieging, total, updateZones, nearestOwnCity };
})();
