// Trade routes: a road between two of your cities, or between one of yours and an ally's, that runs only through land friendly to both houses.
// Each open route pays both houses gold every day. A route is cut as soon as an enemy holds a city on its road, and comes back when the road is clear.
// Routes are plain data on state.trade (saved with the game). Every change is a command (open, close). Nothing here is random.
var VM = globalThis.VM = globalThis.VM || {};

VM.Trade = (function () {
  const C = () => VM.CFG.TRADE;
  const friendly = (state, f, owner) => owner === f || VM.Diplo.friendly(state, f, owner);
  const routes = state => state.trade || (state.trade = []);
  const limitOf = city => C().base + city.buildings.market * C().perMarket;             // more markets, more routes out of a city
  const onRoad = (state, route) => {
    const p = VM.Armies.path(state, route.a, route.b); if (!p) return null;
    return p.every(id => friendly(state, route.owner, state.cities[id].owner)) ? p : null;
  };

  // open a route from city a (yours) to city b (yours or an ally's): returns { ok } or { ok: false, reason }
  function open(state, f, a, b) {
    const A = state.cities[a], B = state.cities[b];
    if (!A || !B || a === b) return { ok: false, reason: 'no such city' };
    if (A.owner !== f || f === 0) return { ok: false, reason: 'not your city' };
    if (!friendly(state, f, B.owner) || B.owner === 0) return { ok: false, reason: 'not your city or an ally\'s' };
    if (A.contested || A.besieged || B.contested || B.besieged) return { ok: false, reason: 'the city is under threat' };
    const R = routes(state);
    if (R.some(r => (r.a === a && r.b === b) || (r.a === b && r.b === a))) return { ok: false, reason: 'already linked' };
    if (R.filter(r => r.a === a || r.b === a).length >= limitOf(A)) return { ok: false, reason: 'no more routes from here (build markets)' };
    if (!onRoad(state, { owner: f, a, b })) return { ok: false, reason: 'no clear road between them' };
    if (state.factions[f].gold < C().setup) return { ok: false, reason: 'not enough gold' };
    const r = { id: state.nextTrade = (state.nextTrade || 0) + 1, owner: f, a, b, since: state.time, open: true };
    state.factions[f].gold -= C().setup; R.push(r); VM.Eco.refresh(state);
    return { ok: true, route: r.id };
  }
  function close(state, f, id) {
    const R = routes(state), r = R.find(x => x.id === id && x.owner === f);
    if (!r) return { ok: false, reason: 'no such route' };
    R.splice(R.indexOf(r), 1); return { ok: true };
  }

  // each day: the open routes pay their owners and the partner (the ally gets its share)
  function step(state, dd) {
    if (!state.trade || !state.trade.length) return;
    for (const r of state.trade) {
      const road = onRoad(state, r); r.open = !!road;
      if (!road) continue;
      const A = state.cities[r.a], B = state.cities[r.b], pay = C().perDay * dd;
      const fa = state.factions[A.owner], fb = state.factions[B.owner];
      const bonusA = A.spec === 'market' || A.spec === 'port' ? C().bonus : 1, bonusB = B.spec === 'market' || B.spec === 'port' ? C().bonus : 1;
      const cara = 1 + VM.Doctrine.bonus(state, A.owner, 'trade'), carb = 1 + VM.Doctrine.bonus(state, B.owner, 'trade');
      if (fa === fb) fa.gold += pay * Math.max(bonusA, bonusB) * cara;          // both ends are one house's
      else { fa.gold += pay * bonusA * 0.6 * cara; fb.gold += pay * bonusB * 0.4 * carb; }   // an ally's route: the house whose city it starts from earns a bit more
    }
  }
  const listFor = (state, city) => routes(state).filter(r => r.a === city || r.b === city);
  return { open, close, step, listFor, limitOf, onRoad, routes };
})();
