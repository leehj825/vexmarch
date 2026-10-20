// Commands are the only way to change the simulation from outside (player input, UI and AI all use these).
// Each returns { ok: true } or { ok: false, reason }.
var VM = globalThis.VM = globalThis.VM || {};

VM.Commands = (function () {
  const fail = reason => ({ ok: false, reason });

  function ownCity(state, cmd) {
    const city = state.cities[cmd.city];
    if (!city) return [null, fail('no such city')];
    if (city.owner !== cmd.faction || cmd.faction === 0) return [null, fail('not your city')];
    return [city, null];
  }

  function ownArmy(state, cmd) {
    const army = state.armies.find(a => a.id === cmd.army);
    if (!army || army.owner !== cmd.faction) return { err: fail('not your army') };
    return { army };
  }

  const handlers = {
    build(state, cmd) {
      const [city, err] = ownCity(state, cmd); if (err) return err;
      const B = VM.CFG.BUILD[cmd.building]; if (!B) return fail('unknown building');
      if (city.build) return fail('already building');
      const lvl = city.buildings[cmd.building];
      if (lvl >= VM.CFG.MAX_BUILD_LEVEL) return fail('max level');
      const f = state.factions[cmd.faction], cost = B.cost[lvl];
      if (f.gold < cost) return fail('not enough gold');
      f.gold -= cost;
      city.build = { type: cmd.building, left: B.days[lvl], total: B.days[lvl] };
      return { ok: true };
    },
    setTax(state, cmd) {
      const [city, err] = ownCity(state, cmd); if (err) return err;
      if (!VM.CFG.TAX[cmd.tax]) return fail('unknown tax level');
      city.tax = cmd.tax; return { ok: true };
    },
    recruit(state, cmd) {
      const [city, err] = ownCity(state, cmd); if (err) return err;
      const T = VM.CFG.TROOPS[cmd.troop]; if (!T) return fail('unknown troop');
      const n = cmd.count | 0; if (n <= 0) return fail('bad count');
      const floor = VM.Eco.cap(city) * VM.CFG.ECON.minPopFrac;
      if (city.pop - n < floor) return fail('not enough population');
      const f = state.factions[cmd.faction], cost = VM.Eco.troopCost(city, cmd.troop) * n;
      if (f.gold < cost) return fail('not enough gold');
      f.gold -= cost; city.pop -= n; city.garrison[cmd.troop] += n;
      return { ok: true, cost };
    },
    setGovernor(state, cmd) {
      const [city, err] = ownCity(state, cmd); if (err) return err;
      if (cmd.officer === null) { const o = state.officers[city.governor]; if (o) o.role = 'idle'; city.governor = null; return { ok: true }; }
      const o = state.officers[cmd.officer];
      if (!o || o.owner !== cmd.faction) return fail('not your officer');
      if (o.army !== null) return fail('officer leads an army');
      if (o.role === 'traveling' || o.role === 'searching') return fail('officer is busy');
      state.cities.forEach(c => { if (c.governor === o.id) c.governor = null; });
      const old = state.officers[city.governor]; if (old) old.role = 'idle';
      city.governor = o.id; o.role = 'governor'; o.loc = city.id;
      return { ok: true };
    },
    formArmy(state, cmd) {
      const [city, err] = ownCity(state, cmd); if (err) return err;
      return VM.Armies.form(state, cmd.faction, city.id, cmd.officer, cmd.keep);
    },
    moveArmy(state, cmd) {
      const a = ownArmy(state, cmd); if (a.err) return a.err;
      return VM.Armies.move(state, a.army, cmd.to);
    },
    stopArmy(state, cmd) {
      const a = ownArmy(state, cmd); if (a.err) return a.err;
      return VM.Armies.stop(state, a.army);
    },
    disbandArmy(state, cmd) {
      const a = ownArmy(state, cmd); if (a.err) return a.err;
      return VM.Armies.disband(state, a.army);
    },
    reinforceArmy(state, cmd) {
      const a = ownArmy(state, cmd); if (a.err) return a.err;
      return VM.Armies.reinforce(state, a.army, cmd.keep);
    },
    mergeArmies(state, cmd) {
      const a = ownArmy(state, cmd); if (a.err) return a.err;
      const b = state.armies.find(x => x.id === cmd.with);
      if (!b || b.owner !== cmd.faction) return fail('not your army');
      return VM.Armies.merge(state, a.army, b);
    },
    ability(state, cmd) {
      const a = ownArmy(state, cmd); if (a.err) return a.err;
      return VM.War.useAbility(state, a.army);
    },
    buildDepot(state, cmd) {
      const [city, err] = ownCity(state, cmd); if (err) return err;
      return VM.War.buildDepot(state, cmd.faction, city.id);
    },
    setPolicy(state, cmd) { return VM.Officers.setPolicy(state, cmd.faction, cmd.city, cmd.mode); },
    setOrder(state, cmd) { return VM.Officers.setOrder(state, cmd.faction, cmd.army, cmd.mode); },
    sendOfficer(state, cmd) { return VM.Officers.sendOfficer(state, cmd.faction, cmd.officer, cmd.to); },
    searchOfficers(state, cmd) { return VM.Officers.search(state, cmd.faction, cmd.officer); },
    recruitOfficer(state, cmd) { return VM.Officers.recruit(state, cmd.faction, cmd.officer); },
    giftOfficer(state, cmd) { return VM.Officers.gift(state, cmd.faction, cmd.officer); },
    answerProposal(state, cmd) { return VM.Officers.answer(state, cmd.faction, cmd.proposal, !!cmd.accept); },
    setDepot(state, cmd) {
      const [city, err] = ownCity(state, cmd); if (err) return err;
      if (!city.depot) return fail('no depot here');
      city.depot.target = Math.max(0, Math.min(20000, cmd.target | 0)); return { ok: true };
    }
  };

  function exec(state, cmd) {
    const h = handlers[cmd.type];
    const res = h ? h(state, cmd) : fail('unknown command');
    if (res.ok) VM.Eco.refresh(state);
    return res;
  }

  return { exec };
})();
