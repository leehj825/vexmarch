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
  // opts: cav = the cavalry's multiplier this moment (it charges, falls back and swings round), arch = what archers add when they can shoot freely
  function power(att, def, opts) {
    const dt = total(def); let p = 0, cm = (opts && opts.cav) || 1, am = (opts && opts.arch) || 1;
    for (const k in att) {
      if (!att[k]) continue;
      let m = 1;
      if (dt > 0) { m = 0; for (const j in def) m += def[j] / dt * matchup(k, j); }
      if (VM.CFG.TROOPS[k].siege) m *= W().siegeField; else if (k === 'cavalry') m *= cm; else if (k === 'archer') m *= am;
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
      if (VM.Diplo.friendly(state, a.owner, c.owner)) { if (!a.routed) friendly.add(z); } else if (c.owner !== 0) enemy[z] = true;
      if (VM.Diplo.hostile(state, a.owner, c.owner) && a.at !== null) c.besieged = true;
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
      if (VM.Diplo.friendly(state, e.owner, a.owner) || e.routed) continue;
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
      const zoneOwner = state.cities[VM.Armies.zoneOf(a)].owner, foreign = !VM.Diplo.friendly(state, zoneOwner, a.owner);
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
        if (line === 'ok') { poolDraw = need / dd; a.rations = Math.min(eat * (a.rationDays || W().rationDays), a.rations + eat * dd * W().refill); }
        else { a.rations -= need; if (a.rations <= 0) { a.rations = 0; starving = true; } }
      }
      if (line === 'ok' && state.factions[a.owner].starving && poolDraw > 0) starving = true;
      a.supply = { line, foreign, depot: useDepot ? depot.id : null, mult, poolDraw, starving, dist: best ? best.d : null };
      if (line === 'cut' && !wasCut) VM.Eco.pushEvent(state, { type: 'cut', owner: a.owner, army: a.id });
    }
  }

  // ---- Damage helpers ----
  // Soldiers are counted one by one: the damage of every step adds to a fraction carried on the army (or garrison), and each whole point kills one soldier, picked
  // at random (by the game's own seeded numbers) among the kinds present. `w` says how exposed each kind is (archers behind a firm line are hard to reach),
  // so a run still repeats exactly.
  function hurt(state, t, carry, amount, w) {
    const n = total(t); if (n <= 0 || !(amount > 0)) return 0;
    amount = Math.min(n, amount); carry.x = (carry.x || 0) + amount;
    const k = Math.min(Math.floor(carry.x + 1e-9), n); carry.x -= k;
    for (let i = 0; i < k; i++) {
      let sum = 0; for (const kind in t) sum += t[kind] * (w && w[kind] !== undefined ? w[kind] : 1);
      let r = VM.RNG.next(state) * sum;
      for (const kind in t) { if (t[kind] <= 0) continue; r -= t[kind] * (w && w[kind] !== undefined ? w[kind] : 1); if (r < 0) { t[kind] -= 1; break; } }
    }
    return amount;
  }
  const carryOf = o => o.carry || (o.carry = {});

  // Why an officer would pull his army back from a campaign, if at all: the food would run out, or the men have lost heart (the limit depends on his nature)
  function retreatReason(state, a) {
    const o = state.officers[a.officer], s = a.supply, n = VM.Armies.sizeOf(a);
    if (s && s.starving) return 'food';
    if (s && s.line !== 'ok' && !s.depot) { const eat = n * VM.CFG.ECON.foodPerHead * (s.mult || 1); if (eat > 0 && a.rations / eat < W().retreatFoodDays) return 'food'; }
    const lim = W().retreatMorale;
    if (a.morale < (o && lim[o.trait] !== undefined ? lim[o.trait] : lim.other)) return 'morale';
    return null;
  }

  // ---- Roles in the field: infantry hold the line, archers shoot from behind it, cavalry charge, fall back and swing round, engines stay out of it ----
  const cavPhase = (state, a) => ((state.time + a.id * 1.7) % 8) / 8;
  function flanker(state, a) { const o = state.officers[a.officer]; return !!o && (o.trait === 'Rash' || o.trait === 'Brave' || (o.command >= 55 && o.trait !== 'Cautious')); }
  function cavMult(state, a) { const ph = cavPhase(state, a), fl = flanker(state, a); return ph < 0.3 ? 2.0 : ph < 0.55 ? 0.2 : ph < 0.8 ? (fl ? 0.3 : 0.9) : (fl ? 2.2 : 1.0); }
  const roleOpts = (state, a) => ({ cav: cavMult(state, a), arch: W().archerField });
  // how exposed each kind of an army is to the enemy's blows right now
  function weightsOf(state, a, foes) {
    const t = a.troops, line = (t.infantry || 0) + (t.spear || 0), foot = line + (t.archer || 0) + (t.cavalry || 0), holds = line >= 0.25 * foot;
    const ph = cavPhase(state, a), engaged = ph < 0.3 || (ph >= 0.8 && flanker(state, a));
    const w = { infantry: 1, spear: 1, archer: holds ? 0.35 : 1, cavalry: engaged ? 1 : 0.4, siege: holds ? 0.12 : 0.5 };
    for (const e of foes || []) if ((e.troops.cavalry || 0) > 0 && flanker(state, e) && cavPhase(state, e) >= 0.8) { w.archer = Math.min(1.2, w.archer * 3); break; }   // riders behind the line find the archers
    return w;
  }
  const WALLW = () => ({ infantry: 1, spear: 1, archer: 0.3, cavalry: 0.6, siege: 0.3 });                // behind a wall the archers on it are hard to hit
  // an army inside its own walled city fights from the walls with the garrison, unless its officer has sent it out
  const inWalls = (state, a) => a.at !== null && !a.routed && !a.sortie && state.cities[a.at].owner === a.owner && state.cities[a.at].wallHp > 0;

  function fate(state, o, victor, from) {
    const r = VM.RNG.next(state);
    o.army = null; o.role = 'idle';
    if (r < W().fateDead) { o.owner = -1; o.loc = null; VM.Eco.pushEvent(state, { type: 'officerDied', officer: o.id, owner: from }); return; }
    const bonus = VM.Story && state.story ? VM.Story.tieBonus(state, o, victor) : 0;
    if (r < W().fateCaptured + bonus && victor !== 0) {
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
    VM.Diplo.drop(state, f.id);
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
    VM.Diplo.onCapture(state, city, by, old);
    for (const a of state.armies) if (a.owner === by && a.at === city.id) VM.Officers.bump(state, a.officer, 10);
    if (old !== 0 && !state.cities.some(c => c.owner === old)) eliminate(state, state.factions[old]);
    checkOver(state);
  }

  function checkOver(state) {
    if (state.over) return;
    const mine = state.cities.filter(c => c.owner === state.player).length;
    const first = state.cities[0].owner;
    if (first > 0 && state.cities.every(c => c.owner === first)) state.over = { type: first === state.player ? 'win' : 'lose', winner: first, t: state.time };   // someone holds every node
    else if (mine === 0 && !state.aiAll) state.over = { type: 'lose', winner: null, t: state.time };
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
      if (VM.Diplo.friendly(state, a.owner, b.owner) || a.routed || b.routed) continue;
      if (dist(ps.get(a.id), ps.get(b.id)) > W().contact) continue;
      if (inWalls(state, a) || inWalls(state, b)) continue;                    // the wall is between them: see the siege below
      if (a.retreat <= 0) a.fighting.push(b.id);
      if (b.retreat <= 0) b.fighting.push(a.id);
      if (a.retreat > 0) b.fighting.push(a.id);      // a retreating army is still chased and struck, but does not strike back
      if (b.retreat > 0) a.fighting.push(b.id);
    }
    const byId = new Map(armies.map(a => [a.id, a]));
    // Army against army: the front line trades blows, archers shoot over it, cavalry come and go (see the roles above); siege engines do not fight here
    for (const a of armies) {
      if (a.retreat > 0 || !a.fighting.length) continue;
      const mods = armyMods(state, a), ro = roleOpts(state, a);
      for (const eid of a.fighting) {
        const e = byId.get(eid), p = power(a.troops, e.troops, ro) * mods * (VM.Story && state.story ? VM.Story.rivalMult(state, a, e) : 1) / a.fighting.length;
        add(incoming, e.id, p); add(enemyPow, e.id, p); add(outPow, a.id, p);
      }
    }
    // A besieged city: its garrison, and the armies inside it that stay behind the walls, shoot from the wall tops and hold the gate. Besiegers hit the gate with
    // their numbers or their engines; when it falls everybody fights in the open.
    const sieges = {};
    for (const a of armies) if (sieging(a) && VM.Diplo.hostile(state, a.owner, state.cities[a.at].owner)) (sieges[a.at] = sieges[a.at] || []).push(a);
    for (const cid in sieges) {
      const city = state.cities[cid], list = sieges[cid], walled = city.wallHp > 0;
      const holders = walled ? armies.filter(h => h.owner === city.owner && h.at === city.id && inWalls(state, h)) : [];
      const pool = {}; for (const src of [city.garrison].concat(holders.map(h => h.troops))) for (const k in src) pool[k] = (pool[k] || 0) + src[k];
      const gt = total(pool), poolPow = walled ? Object.assign({}, pool, { archer: (pool.archer || 0) * W().wallArcher }) : pool;
      for (const a of list) {
        if (gt > 0) { const p = power(poolPow, a.troops, { arch: W().archerField }) * garrisonMods(state, city) / list.length; add(incoming, a.id, p); add(enemyPow, a.id, p); }
        if (a.fighting.length) continue;
        const mods = armyMods(state, a);
        if (city.wallHp > 0) {
          const sg = a.troops.siege || 0, rest = total(a.troops) - sg;
          city.wallHp = Math.max(0, city.wallHp - (sg * W().siegeWall + rest * W().chip) * mods * dd);
          if (city.wallHp <= 0) VM.Eco.pushEvent(state, { type: 'breach', owner: city.owner, city: city.id });
        }
        const full = power(a.troops, pool, roleOpts(state, a)) * mods;
        add(outPow, a.id, full); city._dmg = (city._dmg || 0) + full * (walled ? W().wallProtect : 1);
      }
      city._pool = { holders, n: gt, walled };
    }
    // Apply damage and morale
    for (const a of armies) {
      const inc = incoming.get(a.id) || 0;
      if (inc > 0) {
        hurt(state, a.troops, carryOf(a), inc * K * dd, weightsOf(state, a, a.fighting.map(id => byId.get(id)).filter(Boolean)));
        const own = Math.max(1, outPow.get(a.id) || 0), ratio = clamp(inc / own, 0.3, 3);
        a.morale = Math.max(0, a.morale - W().moraleRate * ratio * dd);
      }
      if (a.fighting.length && !was.get(a.id)) VM.Eco.pushEvent(state, { type: 'battle', owner: a.owner, army: a.id, at: VM.Armies.zoneOf(a), enemy: byId.get(a.fighting[0]).owner });
    }
    for (const cid in sieges) {
      const city = state.cities[cid], P = city._pool;
      if (city._dmg && P && P.n > 0) {                                           // the damage is shared among everyone behind the wall by their numbers
        const dmg = city._dmg * K * dd, members = [{ t: city.garrison, c: carryOf(city) }].concat(P.holders.map(h => ({ t: h.troops, c: carryOf(h) })));
        for (const m of members) hurt(state, m.t, m.c, dmg * total(m.t) / P.n, P.walled ? WALLW() : null);
      }
      delete city._dmg; delete city._pool;
    }
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
        const hostile = state.armies.find(a => a.at === c.id && VM.Diplo.hostile(state, a.owner, c.owner) && sieging(a) && !a.fighting.length);
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
      if (s && s.starving) { a.morale = Math.max(0, a.morale - W().starveDrain * dd); hurt(state, a.troops, carryOf(a), VM.Armies.sizeOf(a) * W().desert * dd); }
      else if (s && s.line !== 'ok' && !s.depot) a.morale = Math.max(0, a.morale - W().cutDrain * dd);
      else if (!sieging(a) || !state.cities[a.at].besieged || VM.Diplo.friendly(state, a.owner, state.cities[a.at].owner)) a.morale = Math.min(100, a.morale + W().recover * dd);
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
    const inBattle = a.fighting.length > 0 || (sieging(a) && VM.Diplo.hostile(state, a.owner, target.owner) && (total(target.garrison) > 0 || target.wallHp > 0));
    if (kind === 'rally') a.morale = Math.min(100, a.morale + 30);
    else {
      if (!inBattle) return { ok: false, reason: 'no battle to use it in' };
      if (kind === 'charge') a.buff = { kind: 'charge', until: state.time + W().chargeDays, mult: W().chargeMult };
      else {
        const pct = 0.06 + 0.08 * o.intellect / 100;
        if (a.fighting.length) for (const e of state.armies) { if (a.fighting.includes(e.id)) { hurt(state, e.troops, carryOf(e), VM.Armies.sizeOf(e) * pct); e.morale = Math.max(0, e.morale - 15); } }
        else { const c = state.cities[a.at]; hurt(state, c.garrison, carryOf(c), total(c.garrison) * pct); c.wallHp = Math.max(0, c.wallHp - wallMax(c) * pct); }
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

  return { step, hurt, carryOf, retreatReason, cavMult, cavPhase, flanker, inWalls, power, matchup, wallMax, armyMods, garrisonMods, abilityOf, useAbility, buildDepot, capture, sieging, total, updateZones, nearestOwnCity, checkOver };
})();
