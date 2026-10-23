// The Diplomacy sheet: every other house with its strength and opinion of you, alliance and gift buttons, terms for the weak, offers waiting for your answer.
var VM = globalThis.VM = globalThis.VM || {};

VM.DiploUI = (function () {
  let ui;
  const num = v => Math.round(v).toLocaleString('en-US');
  const bar = frac => `<div class="bar"><i style="width:${Math.max(2, Math.min(100, frac * 100)).toFixed(0)}%"></i></div>`;
  const WHY = { opinion: 'they do not know you well enough', oathbreaker: 'they do not trust a breaker of oaths', schemer: 'they keep their hands free', 'no need': 'they see no need for it' };
  const TIPS = {
    strength: 'Soldiers in the field and in garrisons, plus a tenth of the population. A house three times stronger than another may offer it terms.',
    opinion: 'How the house feels about you. Gifts and shared enemies raise it; taking their cities and breaking pacts lowers it. It fades toward neutral over time.',
    oath: 'This house has broken a pact before. Others are slow to trust it.',
    ally: 'Ask for an alliance. Allies do not fight each other and may pass through each other\'s land. A house accepts when it likes you, or when a bigger threat looms.',
    gift: 'Give 100 gold to raise their opinion of you. One gift every ten days.',
    merge: 'Offer terms: a much weaker house may join you, with all its cities, armies and officers, rather than be destroyed. It may refuse.',
    breakIt: 'End the alliance at once. You lose their trust and everybody else\'s, and your officers grumble. You cannot ally with them again for 90 days.'
  };
  const feel = v => v <= -40 ? 'Hostile' : v < -10 ? 'Cold' : v <= 10 ? 'Neutral' : v < 40 ? 'Warm' : 'Friendly';

  function init(u) { ui = u; }
  const offers = () => ui.state.diplo ? ui.state.diplo.offers.filter(o => o.to === ui.state.player) : [];
  const pending = () => offers().length;

  function html() {
    const st = ui.state, D = VM.Diplo, me = st.player, C = VM.CFG.DIPLO; D.ensure(st);
    let h = `<div class="ph"><b>Diplomacy</b><span class="sub">allies and terms</span><button data-act="sheetClose" class="x">✕</button></div>`;
    h += `<div class="row dim">Allies and enemies${VM.Panels.info('Every house is your enemy until you ally. A pact can be broken at any time, at the price of your name. A house that is much weaker may be offered terms.')}</div>`;
    for (const o of offers()) {
      const f = st.factions[o.from];
      h += `<div class="card2 hot"><div class="row"><span class="dot" style="background:${f.color}"></span><b>${f.name}</b> ${o.kind === 'alliance' ? 'offers you an alliance.' : 'asks you to bend the knee and join them. If you accept, your game ends here; refuse, and you fight on.'}</div>`
        + `<div class="row dim">Open for ${Math.ceil(o.until - st.time)} days</div><div class="row"><button data-act="dAnswer" data-o="${o.id}" data-yes="1" class="btn sm">${o.kind === 'alliance' ? 'Accept' : 'Bend the knee'}</button> <button data-act="dAnswer" data-o="${o.id}" data-yes="0" class="btn sm">${o.kind === 'alliance' ? 'Decline' : 'Fight on'}</button></div></div>`;
    }
    const ally = D.allyOf(st, me), facs = st.factions.filter(f => !f.neutral && f.id !== me && f.alive), top = Math.max(1, ...st.factions.filter(f => !f.neutral && f.alive).map(f => D.power(st, f.id)));
    if (!facs.length) h += `<div class="row dim">Nobody is left.</div>`;
    for (const f of facs) {
      const isAlly = ally === f.id, cities = st.cities.filter(c => c.owner === f.id).length, o = D.op(st, f.id, me), why = D.whyNot(st, me, f.id), merge = D.canMerge(st, me, f.id);
      h += `<div class="card2"><div class="row between"><b><span class="dot" style="background:${f.color}"></span>${f.name}</b><span class="${isAlly ? 'good' : 'dim'}">${isAlly ? 'Ally' : 'Enemy'}</span></div>`;
      h += `<div class="row dim">${cities} cities · <span data-tip="${VM.Panels.esc(TIPS.strength)}">Strength</span> ${num(D.power(st, f.id))}</div>${bar(D.power(st, f.id) / top)}`;
      h += `<div class="row dim"><span data-tip="${VM.Panels.esc(TIPS.opinion)}">Opinion of you:</span> <b>${feel(o)}</b> (${Math.round(o)}) · <span>Leader:</span> ${VM.Panels.traitSpan(D.traitOf(st, f.id))}${D.trust(st, f.id) < -30 ? ' · <span class="bad" data-tip="' + VM.Panels.esc(TIPS.oath) + '">oath-breaker</span>' : ''}</div><div class="row">`;
      if (isAlly) {
        h += ui.confirmBreak === f.id ? `<span class="bad">Break the pact?</span> <button data-act="dBreakYes" class="btn sm">Yes, break it</button> <button data-act="dBreakNo" class="btn sm">No</button>` : `<button data-act="dBreak" data-f="${f.id}" data-tip="${VM.Panels.esc(TIPS.breakIt)}" class="btn sm">Break the pact</button>`;
      } else h += `<button data-act="dAlly" data-f="${f.id}" class="btn sm"${why ? ' disabled data-tip="' + VM.Panels.esc(why.charAt(0).toUpperCase() + why.slice(1)) + '"' : ' data-tip="' + VM.Panels.esc(TIPS.ally) + '"'}>Propose alliance</button> `;
      h += `<button data-act="dGift" data-f="${f.id}" data-tip="${VM.Panels.esc(TIPS.gift)}" class="btn sm"${st.factions[me].gold < C.giftSmall ? ' disabled' : ''}>Gift ${C.giftSmall}g</button> `;
      if (!merge) h += `<button data-act="dMerge" data-f="${f.id}" data-tip="${VM.Panels.esc(TIPS.merge)}" class="btn sm">Offer terms</button>`;
      h += `</div></div>`;
    }
    const log = st.diplo.log.slice(-6).reverse();
    if (log.length) { h += `<div class="sec">Recent</div>`; for (const l of log) h += `<div class="alert"><span class="when">D${Math.floor(l.t)}</span> ${l.text}</div>`; }
    return h;
  }

  function act(d, cmd) {
    const st = ui.state, f = +d.f, name = id => st.factions[id].name;
    switch (d.act) {
      case 'dAlly': { const r = cmd({ type: 'proposeAlliance', to: f }); if (r.ok) VM.Panels.toast(r.accepted ? `${name(f)} accepts the alliance` : `${name(f)} declines: ` + (WHY[r.why] || 'they see no need for it')); break; }
      case 'dGift': { const r = cmd({ type: 'giftFaction', to: f, gold: VM.CFG.DIPLO.giftSmall }); if (r.ok) VM.Panels.toast(`${name(f)} thanks you`); break; }
      case 'dMerge': { const r = cmd({ type: 'proposeMerge', to: f }); if (r.ok) VM.Panels.toast(r.accepted ? `${name(f)} joins you` : `${name(f)} will fight on`); break; }
      case 'dBreak': ui.confirmBreak = f; break;
      case 'dBreakNo': ui.confirmBreak = null; break;
      case 'dBreakYes': { ui.confirmBreak = null; const r = cmd({ type: 'breakAlliance' }); if (r.ok) VM.Panels.toast('The pact is broken'); break; }
      case 'dAnswer': { const r = cmd({ type: 'answerOffer', offer: +d.o, accept: d.yes === '1' }); break; }
    }
  }
  return { init, html, act, pending };
})();
