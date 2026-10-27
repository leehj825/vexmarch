// Doctrines: once a year each house is offered three doctrines and takes one (the player chooses; an AI house takes the first). A doctrine is a lasting
// bonus: drill (armies), fortifications (walls and garrisons), granaries (food), levies (gold), caravans (trade) or mobility (marching). Offers come from a
// seeded shuffle of the doctrines the house does not have yet, so a game is the same for the same seed. Stored on the faction (f.doctrine), saved with the game.
var VM = globalThis.VM = globalThis.VM || {};

VM.Doctrine = (function () {
  const C = () => VM.CFG.DOCTRINE;
  const LIST = {
    drill:       { name: { en: 'Drill', ko: '훈련' }, text: { en: 'Armies fight 8% harder.', ko: '군대가 8% 더 강하게 싸운다.' }, key: 'army', v: 0.08 },
    fortify:     { name: { en: 'Fortifications', ko: '축성' }, text: { en: 'Walls and garrisons hold 12% better.', ko: '성벽과 수비대가 12% 더 잘 막는다.' }, key: 'wall', v: 0.12 },
    granary:     { name: { en: 'Granaries', ko: '곡창' }, text: { en: 'Fields give 10% more food.', ko: '밭에서 식량이 10% 더 난다.' }, key: 'food', v: 0.10 },
    levy:        { name: { en: 'Levies', ko: '징세' }, text: { en: 'Cities pay 10% more gold.', ko: '도시가 금을 10% 더 낸다.' }, key: 'gold', v: 0.10 },
    caravan:     { name: { en: 'Caravans', ko: '대상' }, text: { en: 'Trade routes pay 25% more.', ko: '교역로가 25% 더 많이 준다.' }, key: 'trade', v: 0.25 },
    mobility:    { name: { en: 'Mobility', ko: '기동' }, text: { en: 'Armies march 10% faster.', ko: '군대가 10% 더 빨리 행군한다.' }, key: 'speed', v: 0.10 }
  };
  const ids = Object.keys(LIST);
  const rec = f => f.doctrine || (f.doctrine = { owned: [], offer: null, next: C().first });

  // the offer for a house: three of the doctrines it does not have, drawn with the game's seeded RNG
  function makeOffer(state, f) {
    const left = ids.filter(id => !rec(f).owned.includes(id)); if (!left.length) return null;
    const pool = left.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = VM.RNG.int(state, i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, Math.min(3, pool.length));
  }
  // what the doctrines give a house for one effect ('army', 'wall', 'food', 'gold', 'trade', 'speed')
  function bonus(state, owner, key) {
    if (!state || !state.factions) return 0;
    const f = state.factions[owner]; if (!f || !f.doctrine) return 0;
    let v = 0; for (const id of f.doctrine.owned) if (LIST[id].key === key) v += LIST[id].v; return v;
  }
  function pick(state, owner, id) {
    const f = state.factions[owner], r = f && f.doctrine;
    if (!f || f.neutral || !r || !r.offer) return { ok: false, reason: 'no doctrine to choose' };
    if (!r.offer.includes(id)) return { ok: false, reason: 'not offered' };
    r.owned.push(id); r.offer = null; r.next = state.time + C().every;
    VM.Eco.pushEvent(state, { type: 'doctrine', owner, id });
    return { ok: true };
  }
  // each day: offers come a year apart; an AI house takes the first at once
  function step(state) {
    for (const f of state.factions) {
      if (f.neutral || !f.alive) continue;
      const r = rec(f);
      if (r.offer === null && state.time >= r.next) {
        r.offer = makeOffer(state, f);
        if (r.offer === null) r.next = Infinity;
        else if (f.id !== state.player || state.aiAll) pick(state, f.id, r.offer[0]);
        else VM.Eco.pushEvent(state, { type: 'doctrineOffer', owner: f.id });
      }
    }
  }
  return { LIST, bonus, pick, step, rec, ids };
})();
