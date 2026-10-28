// Generals' duels: while your army is fighting an enemy army, you may send your general out to meet theirs. The duel is decided at once: the stronger
// general is likelier to win (command, might and intellect, a little for the trait, and a bonus for a story rival), with the game's seeded RNG. The loser's
// army loses morale and its general loses loyalty; the winner's army gains morale. Each general may duel once every `cool` days.
var VM = globalThis.VM = globalThis.VM || {};

VM.Duel = (function () {
  const C = () => VM.CFG.DUEL;
  const TRAIT = { Brave: 5, Rash: 3, Cautious: -3, Loyal: 0, Greedy: -2, Schemer: -2 };
  const score = (state, o, foe) => {
    let s = o.command + o.might + o.intellect + (TRAIT[o.trait] || 0);
    if (VM.Story && state.story && o.key && foe.key && VM.Story.rivalMult(state, { officer: o.id }, { officer: foe.id }) > 1) s *= 1.1;
    return s;
  };
  function duel(state, f, armyId, targetId) {
    const A = state.armies.find(a => a.id === armyId), B = state.armies.find(a => a.id === targetId);
    if (!A || !B || A.owner !== f || f === 0) return { ok: false, reason: 'not your army' };
    if (!A.fighting.includes(B.id) || !VM.Diplo.hostile(state, A.owner, B.owner)) return { ok: false, reason: 'they are not fighting you' };
    if (A.routed || B.routed) return { ok: false, reason: 'a routed army cannot duel' };
    const oa = state.officers[A.officer], ob = state.officers[B.officer];
    if ((oa.duelReady || 0) > state.time) return { ok: false, reason: 'your general is still recovering from a duel' };
    if ((ob.duelReady || 0) > state.time) return { ok: false, reason: 'their general is still recovering' };
    const p = 1 / (1 + Math.exp(-(score(state, oa, ob) - score(state, ob, oa)) / 25));
    const won = VM.RNG.next(state) < p, W = won ? A : B, L = won ? B : A, ow = won ? oa : ob, ol = won ? ob : oa;
    L.morale = Math.max(0, L.morale - C().loserMorale); W.morale = Math.min(100, W.morale + C().winnerMorale);
    VM.Officers.bump(state, ol.id, -C().loserLoyalty); VM.Officers.bump(state, ow.id, C().winnerLoyalty);
    oa.duelReady = ob.duelReady = state.time + C().cool;
    VM.Eco.pushEvent(state, { type: 'duel', winner: ow.id, loser: ol.id, owner: f, foe: B.owner === f ? A.owner : B.owner, won: won ? 1 : 0, army: A.id });
    return { ok: true, won: won === true, winner: ow.name, loser: ol.name };
  }
  return { duel, score };
})();
