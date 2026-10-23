// Diplomacy: two states, enemy and ally, no truce (docs/DIPLOMACY.md). A faction has at most one ally. Allies do not fight, besiege or capture each other,
// may pass through each other's cities and feed on each other's land. Breaking a pact is always possible and costs trust. A strong faction may offer terms
// (merge) to a weak one; the player may refuse, an AI accepts when it is a matter of survival. All answers are deterministic; every action is a command.
var VM = globalThis.VM = globalThis.VM || {};

VM.Diplo = (function () {
  const D = () => VM.CFG.DIPLO;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const key = (a, b) => a < b ? a + '-' + b : b + '-' + a;
  const fail = reason => ({ ok: false, reason });
  const total = t => { let n = 0; for (const k in t) n += t[k]; return n; };

  function ensure(state) {
    if (!state.diplo) {
      state.diplo = { allies: [], opinion: {}, trust: {}, cool: {}, offers: [], nextOffer: 1, mergeCool: {}, start: {}, giftAt: {}, log: [] };
      for (const f of state.factions) if (!f.neutral) state.diplo.start[f.id] = state.cities.filter(c => c.owner === f.id).length;
      if (state.story) for (const a of state.factions) for (const b of state.factions) if (!a.neutral && !b.neutral && a.id !== b.id) { const v = storyOpinion(state, a.id, b.id); if (v) setOp(state, a.id, b.id, v); }
    }
    return state.diplo;
  }

  // ---- who is who ----
  const live = (state, f) => { const x = state.factions[f]; return !!x && !x.neutral && x.alive; };
  function allyOf(state, f) {
    const d = state.diplo; if (!d) return 0;
    for (const p of d.allies) { if (p.a === f) return p.b; if (p.b === f) return p.a; }
    return 0;
  }
  const allied = (state, a, b) => { const d = state.diplo; if (!d || !d.allies.length || a === b) return false; for (const p of d.allies) if ((p.a === a && p.b === b) || (p.a === b && p.b === a)) return true; return false; };
  const friendly = (state, a, b) => a === b || allied(state, a, b);
  const hostile = (state, a, b) => !friendly(state, a, b);
  const pactOf = (state, f) => state.diplo && state.diplo.allies.find(p => p.a === f || p.b === f) || null;

  // ---- opinion and trust ----
  const op = (state, a, b) => { const d = ensure(state); return d.opinion[a] && d.opinion[a][b] || 0; };
  function setOp(state, a, b, v) { const d = ensure(state); (d.opinion[a] = d.opinion[a] || {})[b] = clamp(v, -100, 100); }
  const addOp = (state, a, b, v) => setOp(state, a, b, op(state, a, b) + v);
  const trust = (state, f) => ensure(state).trust[f] || 0;
  function log(state, text) { const d = ensure(state); d.log.push({ t: state.time, text }); if (d.log.length > 30) d.log.shift(); }

  // ---- strength and character ----
  function power(state, f) {
    let n = 0;
    for (const a of state.armies) if (a.owner === f) n += VM.Armies.sizeOf(a);
    let pop = 0; for (const c of state.cities) if (c.owner === f) { n += total(c.garrison); pop += c.pop; }
    return n + pop * D().popWeight;
  }
  const citiesOf = (state, f) => state.cities.filter(c => c.owner === f);
  function leaderOf(state, f) {
    const fac = state.factions[f], cap = fac.capital >= 0 ? state.cities[fac.capital] : null;
    if (cap && cap.owner === f && cap.governor !== null) return state.officers[cap.governor];
    let best = null; for (const o of state.officers) if (o.owner === f && (!best || o.command + o.politics > best.command + best.politics)) best = o;
    return best;
  }
  const traitOf = (state, f) => { const o = leaderOf(state, f); return o ? o.trait : 'none'; };
  // campaign: ties of friendship, kin, love or rivalry between the officers of two houses move their opinion of each other
  function storyOpinion(state, a, b) {
    if (!state.story || !VM.Story) return 0;
    let v = 0;
    for (const o of state.officers) {
      if (o.owner !== a || !o.key) continue;
      for (const t of VM.Story.tiesOf(o.key)) {
        const other = state.officers.find(x => x.key === (t[1] === o.key ? t[2] : t[1])); if (!other || other.owner !== b) continue;
        v += t[0] === 'rival' ? -8 : t[0] === 'love' ? 12 : t[0] === 'debt' ? 0 : 8;
      }
    }
    return v;
  }
  const houseBonus = (state, f, what) => { const h = state.story && VM.StoryData && VM.StoryData.FACTIONS[f - 1]; return h && h.diplo && h.diplo[what] || 0; };

  // ---- alliance ----
  // How much faction a wants a pact with b (the same score serves as the answer when b asks a)
  function allianceScore(state, a, b) {
    const pa = power(state, a), pb = power(state, b), parts = [];
    let s = 0.4 * op(state, a, b); parts.push(['opinion', s]);
    // a third faction that is the bigger threat to both
    let threat = 0; for (const f of state.factions) if (!f.neutral && f.alive && f.id !== a && f.id !== b && power(state, f.id) >= 1.5 * Math.max(pa, pb)) threat = 30;
    s += threat; if (threat) parts.push(['threat', threat]);
    if (Math.max(pa, pb) <= 2.2 * Math.min(pa, pb)) { s += 10; parts.push(['even', 10]); }
    if (trust(state, b) < -30) { s -= 40; parts.push(['oathbreaker', -40]); }
    if (traitOf(state, a) === 'Schemer') { s -= 25; parts.push(['schemer', -25]); }
    s += storyOpinion(state, a, b) + houseBonus(state, a, 'ally'); 
    return { score: s, parts };
  }
  function whyNot(state, from, to) {
    if (!live(state, from) || !live(state, to) || from === to) return 'no such faction';
    if (allyOf(state, from) || allyOf(state, to)) return 'already has an ally';
    const c = ensure(state).cool[key(from, to)]; if (c && c > state.time) return 'they will not hear you yet';
    return null;
  }
  const isHuman = (state, f) => f === state.player && !state.aiAll;
  function offer(state, from, to, kind) {
    const d = ensure(state);
    if (d.offers.some(o => o.from === from && o.to === to && o.kind === kind)) return;
    d.offers.push({ id: d.nextOffer++, from, to, kind, t: state.time, until: state.time + D().offerDays });
    VM.Eco.pushEvent(state, { type: 'diploOffer', owner: to, from, kind });
  }
  function proposeAlliance(state, from, to) {
    const bad = whyNot(state, from, to); if (bad) return fail(bad);
    if (isHuman(state, to)) { offer(state, from, to, 'alliance'); return { ok: true, pending: true }; }
    const r = allianceScore(state, to, from);
    if (r.score >= D().allyAt) { makeAlliance(state, from, to); return { ok: true, accepted: true }; }
    ensure(state).cool[key(from, to)] = state.time + D().refuseCool;
    const top = r.parts.slice().sort((x, y) => x[1] - y[1])[0];
    return { ok: true, accepted: false, why: top && top[1] < 0 ? top[0] : 'no need' };
  }
  function makeAlliance(state, a, b) {
    const d = ensure(state); d.allies.push({ a, b, since: state.time });
    addOp(state, a, b, 10); addOp(state, b, a, 10);
    d.offers = d.offers.filter(o => o.kind !== 'alliance' || (![a, b].includes(o.from) && ![a, b].includes(o.to)));
    VM.Eco.pushEvent(state, { type: 'allied', a, b }); log(state, `${state.factions[a].name} and ${state.factions[b].name} allied`);
  }
  function breakAlliance(state, f) {
    const p = pactOf(state, f); if (!p) return fail('no alliance to break');
    const d = ensure(state), other = p.a === f ? p.b : p.a;
    d.allies.splice(d.allies.indexOf(p), 1);
    d.trust[f] = clamp(trust(state, f) + D().breakTrust, -100, 0);
    for (const x of state.factions) if (!x.neutral && x.alive && x.id !== f) addOp(state, x.id, f, x.id === other ? D().breakOpinionAlly : D().breakOpinion);
    d.cool[key(f, other)] = state.time + D().breakCool;
    for (const o of state.officers) if (o.owner === f) VM.Officers.bump(state, o.id, o.trait === 'Loyal' ? -12 : -5);
    VM.Eco.pushEvent(state, { type: 'allyBroken', by: f, other }); log(state, `${state.factions[f].name} broke the pact with ${state.factions[other].name}`);
    return { ok: true };
  }
  function gift(state, from, to, gold) {
    if (!live(state, from) || !live(state, to) || from === to) return fail('no such faction');
    const C = D(), d = ensure(state), amt = gold === C.giftBig ? C.giftBig : C.giftSmall, f = state.factions[from], gk = from + '>' + to;
    if (d.giftAt[gk] !== undefined && state.time - d.giftAt[gk] < C.giftEvery) return fail('they were given a gift not long ago');
    if (f.gold < amt) return fail('not enough gold');
    f.gold -= amt; state.factions[to].gold += amt; d.giftAt[gk] = state.time;
    addOp(state, to, from, amt === C.giftBig ? C.giftOpinion * 3 : C.giftOpinion);
    return { ok: true };
  }

  // ---- merge ----
  function canMerge(state, strong, weak) {
    if (!live(state, strong) || !live(state, weak) || strong === weak) return 'no such faction';
    const d = ensure(state);
    if ((d.mergeCool[strong] || 0) > state.time) return 'they cannot take in another house yet';
    if (power(state, strong) < D().mergeRatio * power(state, weak)) return 'they are not weak enough';
    if (!citiesOf(state, weak).length) return 'no such faction';
    return null;
  }
  // How strongly a faction wants to survive by joining the stronger one
  function survival(state, weak, strong) {
    const parts = [], add = (k, v) => { if (v) parts.push([k, v]); };
    const cs = citiesOf(state, weak), cap = state.cities[state.factions[weak].capital], start = ensure(state).start[weak] || cs.length;
    if (cap && cap.owner === weak && (cap.besieged || cap.contested)) add('besieged', 30);
    if (cs.length <= start * 2 / 3) add('shrinking', 25);
    if (cs.length <= 2) add('tiny', 20);
    const r = power(state, strong) / Math.max(1, power(state, weak)); add('outmatched', r >= 5 ? 20 : r >= 3 ? 10 : 0);
    add('character', D().mergeTrait[traitOf(state, weak)] || 0);
    if (op(state, weak, strong) >= 20) add('liked', 10);
    if (trust(state, strong) < -30) add('oathbreaker', -40);
    add('house', houseBonus(state, weak, 'merge'));
    return { score: parts.reduce((s, p) => s + p[1], 0), parts };
  }
  function proposeMerge(state, from, to) {
    const bad = canMerge(state, from, to); if (bad) return fail(bad);
    const c = ensure(state).cool['m' + key(from, to)]; if (c && c > state.time) return fail('they will not hear you yet');
    if (isHuman(state, to)) { offer(state, from, to, 'merge'); return { ok: true, pending: true }; }
    const r = survival(state, to, from);
    if (r.score >= D().mergeAt) { doMerge(state, from, to); return { ok: true, accepted: true }; }
    ensure(state).cool['m' + key(from, to)] = state.time + D().mergeRefuseCool;
    return { ok: true, accepted: false, why: 'they fight on' };
  }
  function doMerge(state, S, W) {
    const d = ensure(state), sf = state.factions[S], wf = state.factions[W];
    const p = pactOf(state, W); if (p) d.allies.splice(d.allies.indexOf(p), 1);
    const ps = pactOf(state, S); if (ps && (ps.a === W || ps.b === W)) d.allies.splice(d.allies.indexOf(ps), 1);
    for (const c of state.cities) if (c.owner === W) { c.owner = S; c.contested = false; c.besieged = false; }
    for (const a of state.armies) if (a.owner === W) a.owner = S;
    for (const o of state.officers) {
      if (o.owner !== W) continue;
      o.owner = S; let l = 50;
      if (state.story && o.key && VM.Story) for (const t of VM.Story.tiesOf(o.key)) { const other = state.officers.find(x => x.key === (t[1] === o.key ? t[2] : t[1])); if (!other || other.owner !== S) continue; l += t[0] === 'rival' ? -10 : t[0] === 'debt' ? 0 : 6; }
      o.loyalty = clamp(l, 10, 90);
    }
    sf.gold += wf.gold; sf.food += wf.food; wf.gold = 0; wf.food = 0; wf.alive = false; wf.merged = S;
    d.offers = d.offers.filter(o => o.from !== W && o.to !== W);
    d.mergeCool[S] = state.time + D().mergeCool;
    VM.Eco.pushEvent(state, { type: 'merged', from: W, owner: S }); log(state, `${wf.name} joined ${sf.name}`);
    VM.Eco.refresh(state);
    if (W === state.player && !state.aiAll) state.over = { type: 'merged', winner: S, t: state.time };
    else VM.War.checkOver(state);
  }
  function answerOffer(state, f, id, accept) {
    const d = ensure(state), o = d.offers.find(x => x.id === id && x.to === f); if (!o) return fail('that offer is no longer open');
    d.offers.splice(d.offers.indexOf(o), 1);
    if (!accept) { d.cool[(o.kind === 'merge' ? 'm' : '') + key(o.from, o.to)] = state.time + (o.kind === 'merge' ? D().mergeRefuseCool : D().refuseCool); return { ok: true }; }
    if (!live(state, o.from)) return fail('that faction is gone');
    if (o.kind === 'alliance') { if (allyOf(state, o.from) || allyOf(state, o.to)) return fail('already has an ally'); makeAlliance(state, o.from, o.to); }
    else { const bad = canMerge(state, o.from, o.to); if (bad) return fail(bad); doMerge(state, o.from, o.to); }
    return { ok: true, accepted: true };
  }

  // ---- called by the war code ----
  function onCapture(state, city, by, from) {
    if (from > 0 && by > 0) { addOp(state, from, by, D().captureOpinion); const ally = allyOf(state, from); if (ally && ally !== by) addOp(state, ally, by, -5); }
  }
  function drop(state, f) {                                              // a faction is gone: its pact and offers go with it
    const d = state.diplo; if (!d) return;
    d.allies = d.allies.filter(p => p.a !== f && p.b !== f); d.offers = d.offers.filter(o => o.from !== f && o.to !== f);
  }

  // ---- the daily step: opinions settle, offers lapse, the AI makes its moves ----
  function step(state, dd) {
    const d = ensure(state), C = D();
    for (const a in d.opinion) for (const b in d.opinion[a]) { const v = d.opinion[a][b], k = Math.min(Math.abs(v), C.decay * dd); d.opinion[a][b] = v - Math.sign(v) * k; }
    for (const f in d.trust) d.trust[f] = Math.min(0, d.trust[f] + C.trustHeal * dd);
    for (const p of d.allies) { const up = (x, y) => { if (op(state, x, y) < C.driftMax) addOp(state, x, y, C.drift * dd + C.decay * dd); }; up(p.a, p.b); up(p.b, p.a); }
    if (d.offers.length) d.offers = d.offers.filter(o => o.until > state.time);
    if (state.over || !state.aiOn) return;
    for (const f of state.factions) {
      if (f.neutral || !f.alive || !f.ai || (f.id === state.player && !state.aiAll)) continue;
      if (f.ai.dnext === undefined) f.ai.dnext = f.id * 2.5 + C.aiEvery;
      if (state.time < f.ai.dnext) continue;
      f.ai.dnext = state.time + C.aiEvery;
      think(state, f);
    }
  }

  function nodeShare(state, f) { const n = state.cities.length; return citiesOf(state, f).length / n; }
  function think(state, f) {
    const C = D(), id = f.id, ally = allyOf(state, id);
    if (ally) {                                                          // betray at the end
      const p = pactOf(state, id), mine = power(state, id), theirs = power(state, ally);
      const held = citiesOf(state, id).length + citiesOf(state, ally).length, left = state.cities.length - held;
      const strong = mine >= C.betrayRatio * theirs && nodeShare(state, id) >= C.betrayShare;
      if (state.time - p.since >= C.betrayAge && traitOf(state, id) !== 'Loyal' && (left <= C.betrayLeft || strong)) breakAlliance(state, id);
      return;
    }
    // terms for the weak
    let weak = null;
    for (const g of state.factions) {
      if (g.neutral || !g.alive || g.id === id || canMerge(state, id, g.id)) continue;
      const c = d0(state).cool['m' + key(id, g.id)]; if (c && c > state.time) continue;
      if (!weak || power(state, g.id) < power(state, weak)) weak = g.id;
    }
    if (weak) { const r = isHuman(state, weak) ? (offer(state, id, weak, 'merge'), null) : proposeMerge(state, id, weak); if (!r || r.accepted) return; }
    // a pact with the best liked
    let best = null, bs = C.allyAt;
    for (const g of state.factions) {
      if (g.neutral || !g.alive || g.id === id || whyNot(state, id, g.id)) continue;
      const s = allianceScore(state, id, g.id).score; if (s >= bs) { bs = s; best = g.id; }
    }
    if (best !== null) proposeAlliance(state, id, best);
  }
  const d0 = state => ensure(state);

  return { ensure, allyOf, allied, friendly, hostile, pactOf, op, addOp, trust, power, leaderOf, traitOf, allianceScore, survival, canMerge, whyNot,
    proposeAlliance, breakAlliance, gift, proposeMerge, doMerge, answerOffer, onCapture, drop, step, think, storyOpinion };
})();
