// Economy: gold, food, population growth, construction. Rates are per day; step() scales them by the fraction of a day passed.
var VM = globalThis.VM = globalThis.VM || {};

VM.Eco = (function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const troopsOf = g => g.infantry + g.spear + g.cavalry + g.archer;

  function cap(city) {
    const E = VM.CFG.ECON, S = VM.CFG.SPEC[city.spec], b = city.buildings;
    return Math.round(E.baseCap * S.cap * (1 + 0.08 * b.farm + 0.05 * b.market + 0.05 * b.temple));
  }

  function upkeepOf(city) {
    let u = 0; for (const k in city.garrison) u += city.garrison[k] * VM.CFG.TROOPS[k].upkeep; return u;
  }

  // Everything a city produces right now, given how safe the faction's food supply is (0 to 1).
  function cityStats(state, city, foodSec) {
    const C = VM.CFG, E = C.ECON, S = C.SPEC[city.spec], T = C.TAX[city.tax], b = city.buildings;
    const gov = city.governor !== null ? state.officers[city.governor].politics / 100 : 0;
    const troops = troopsOf(city.garrison);
    const capacity = cap(city);
    const security = clamp(0.6 + 0.4 * Math.min(1, troops / Math.max(1, city.pop * E.garrisonRatio)) + 0.05 * b.wall - (city.contested ? 0.6 : 0), 0, 1);
    const prosperity = clamp(E.prosBase + E.prosFood * foodSec + E.prosSec * security + T.pros + E.prosGov * gov
      + 0.05 * b.temple + 0.03 * b.market + S.pros - city.devastation, 0.1, 1.3);
    return {
      cap: capacity, security, prosperity, target: capacity * prosperity,
      gold: city.contested ? 0 : city.pop * E.tax * T.gold * S.gold * (1 + 0.25 * b.market),
      foodProd: capacity * (E.foodBase + E.foodFarm * b.farm) * S.food,
      foodCons: (city.pop + troops) * E.foodPerHead,
      upkeep: upkeepOf(city), troops
    };
  }

  function buildTime(state, city, type) {
    const B = VM.CFG.BUILD[type], lvl = city.buildings[type];
    return B.days[lvl];
  }

  function factionCities(state, f) { return state.cities.filter(c => c.owner === f.id); }

  function pushEvent(state, ev) { ev.t = state.time; ev.n = state.nextEvent = (state.nextEvent || 0) + 1; state.events.push(ev); if (state.events.length > 200) state.events.shift(); }

  function step(state, dd) {
    const C = VM.CFG, E = C.ECON;
    for (const f of state.factions) {
      const cities = factionCities(state, f);
      f.alive = f.neutral || cities.length > 0;
      let gold = 0, upkeep = 0, prod = 0, cons = 0;
      for (const city of cities) {
        let st = cityStats(state, city, f.neutral ? 1 : f.foodSec);
        if (f.neutral) st = cityStats(state, city, clamp(st.foodProd / Math.max(1e-9, st.foodCons), 0, 1));   // neutral cities live off their own land
        const diff = st.target - city.pop;
        city.pop += diff * (diff > 0 ? E.popGrow : E.popShrink) * dd;
        if (f.starving) city.pop -= city.pop * E.starveLoss * dd;
        city.pop = Math.max(0, city.pop);
        city.devastation = Math.max(0, city.devastation - E.devastationDecay * dd);
        if (city.build) {
          const gov = city.governor !== null ? state.officers[city.governor].politics / 100 : 0;
          city.build.left -= dd * (1 + C.GOVERNOR_BUILD_SPEED * gov);
          if (city.build.left <= 0) {
            city.buildings[city.build.type]++;
            if (!f.neutral) pushEvent(state, { type: 'built', city: city.id, owner: f.id, building: city.build.type, level: city.buildings[city.build.type] });
            city.build = null;
          }
        }
        city.stats = st;
        gold += st.gold; upkeep += st.upkeep; prod += st.foodProd; cons += st.foodCons;
      }
      if (f.neutral) continue;
      for (const a of state.armies) if (a.owner === f.id) {      // armies eat and draw pay like garrisons
        const n = a.troops.infantry + a.troops.spear + a.troops.cavalry + a.troops.archer;
        cons += n * E.foodPerHead;
        for (const k in a.troops) upkeep += a.troops[k] * C.TROOPS[k].upkeep;
      }
      const salary = state.officers.filter(o => o.owner === f.id).length * E.officerSalary;
      const netGold = gold - upkeep - salary, netFood = prod - cons;
      f.gold += netGold * dd; f.food += netFood * dd;
      f.income = { gold: netGold, food: netFood };
      f.broke = false;
      if (f.gold < 0) {                                  // broke: troops desert instead of being paid
        f.gold = 0; f.broke = true;
        for (const city of cities) for (const k in city.garrison) city.garrison[k] = Math.floor(city.garrison[k] * (1 - E.desertion * dd));
        for (const a of state.armies) if (a.owner === f.id) for (const k in a.troops) a.troops[k] = Math.floor(a.troops[k] * (1 - E.desertion * dd));
      }
      const wasStarving = f.starving;
      if (f.food <= 0 && netFood < 0) { f.food = 0; f.starving = true; f.foodSec = 0; }
      else {
        f.starving = false;
        f.foodSec = netFood >= 0 ? 1 : clamp(f.food / (-netFood * E.runwayDays), 0, 1);
      }
      if (f.starving && !wasStarving) pushEvent(state, { type: 'starving', owner: f.id });
    }
  }

  // Recompute displayed stats without advancing time (used on creation and after commands).
  function refresh(state) {
    for (const f of state.factions) for (const city of factionCities(state, f)) {
      let st = cityStats(state, city, f.neutral ? 1 : f.foodSec);
      if (f.neutral) st = cityStats(state, city, clamp(st.foodProd / Math.max(1e-9, st.foodCons), 0, 1));
      city.stats = st;
    }
  }

  function troopCost(city, type) {
    const C = VM.CFG, S = C.SPEC[city.spec];
    let c = C.TROOPS[type].cost * (1 - C.BUILD.barracks.troopDiscount * city.buildings.barracks);
    if (S.troopCost && type !== 'cavalry') c *= S.troopCost;
    if (S.cavalryCost && type === 'cavalry') c *= S.cavalryCost;
    return c;
  }

  return { cap, cityStats, step, refresh, troopCost, troopsOf, buildTime, pushEvent, clamp };
})();
