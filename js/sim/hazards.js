// Random events: a failed harvest, a bounty, plague, bandits on the roads, unrest in a badly kept city. Optional per game (state.hazards), seeded and deterministic.
// A city carries short-lived effects in city.mods = [{ kind, food, gold, until }]; Economy reads them through mult(). Every house is rolled the same way.
var VM = globalThis.VM = globalThis.VM || {};

VM.Hazards = (function () {
  const H = () => VM.CFG.HAZARDS;
  const on = state => !!state.hazards;

  // the product of the active effects of one kind ('food' or 'gold') on a city
  function mult(city, key) {
    if (!city.mods) return 1;
    let m = 1; for (const e of city.mods) if (e[key]) m *= e[key]; return m;
  }
  const add = (state, city, kind, fx, days) => {
    city.mods = (city.mods || []).filter(e => e.kind !== kind);
    city.mods.push(Object.assign({ kind, until: state.time + days }, fx));
  };
  const say = (state, kind, city, extra) => VM.Eco.pushEvent(state, Object.assign({ type: 'hazard', kind, city: city.id, owner: city.owner }, extra || {}));

  function step(state, dd) {
    if (!on(state) || state.over) return;
    const C = H(); let changed = false;
    for (const city of state.cities) {
      if (city.mods && city.mods.length) {
        const keep = city.mods.filter(e => e.until > state.time && !(e.kind === 'bandits' && state.armies.some(a => a.owner === city.owner && a.at === city.id && !a.routed)));
        if (keep.length !== city.mods.length) { city.mods = keep; changed = true; }
      }
      if (city.owner === 0) continue;                                        // free places are left alone
      const roll = VM.RNG.next(state);
      let k = null, p = C.blight * dd;
      if (roll < p) k = 'blight'; else if (roll < (p += C.bounty * dd)) k = 'bounty'; else if (roll < (p += C.plague * dd * (1 - 0.3 * city.buildings.temple))) k = city.pop >= C.plagueMinPop ? 'plague' : null; else if (roll < (p += C.bandits * dd)) k = 'bandits';
      if (k === 'blight') { add(state, city, k, { food: C.blightFood }, C.blightDays); say(state, k, city); changed = true; }
      else if (k === 'bounty') { add(state, city, k, { food: C.bountyFood }, C.bountyDays); say(state, k, city); changed = true; }
      else if (k === 'plague') { const lost = Math.round(city.pop * C.plagueLoss); city.pop -= lost; add(state, city, k, { gold: C.plagueGold }, C.plagueDays); say(state, k, city, { lost }); changed = true; }
      else if (k === 'bandits' && !state.armies.some(a => a.owner === city.owner && a.at === city.id && !a.routed)) { add(state, city, k, { gold: C.banditGold }, C.banditDays); say(state, k, city); changed = true; }
      // unrest: a city whose governor has lost heart, or whose people are taxed hard and badly kept
      const gov = city.governor !== null && city.governor !== undefined ? state.officers[city.governor] : null;
      if ((gov && gov.loyalty < C.unrestLoyalty) || (city.tax === 'high' && city.stats && city.stats.security < C.unrestSecurity)) {
        if (VM.RNG.next(state) < C.unrest * dd) {
          let lost = 0; for (const t in city.garrison) { const l = city.garrison[t] * C.unrestLoss; city.garrison[t] -= l; lost += l; }
          city.devastation = Math.min(1, city.devastation + C.unrestDevastation); if (gov) VM.Officers.bump(state, gov.id, -8);
          say(state, 'unrest', city, { lost: Math.round(lost) }); changed = true;
        }
      }
    }
    if (changed) VM.Eco.refresh(state);
  }
  const setOn = (state, v) => { if (v) state.hazards = true; else delete state.hazards; };

  return { on, mult, step, setOn };
})();
