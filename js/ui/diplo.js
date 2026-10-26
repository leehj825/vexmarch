// The Diplomacy sheet: every other house as a banner with strength, opinion and a few icon buttons; offers waiting for your answer. Hold an icon to read it.
var VM = globalThis.VM = globalThis.VM || {};

VM.DiploUI = (function () {
  let ui;
  const num = v => Math.round(v).toLocaleString('en-US');
  const WHY = { opinion: 'they do not know you well enough', oathbreaker: 'they do not trust a breaker of oaths', schemer: 'they keep their hands free', 'no need': 'they see no need for it' };
  const feel = v => v <= -40 ? 'Hostile' : v < -10 ? 'Cold' : v <= 10 ? 'Neutral' : v < 40 ? 'Warm' : 'Friendly';
  const TIPS = {
    strength: 'Soldiers in the field and in garrisons, plus a tenth of the population. A house three times stronger than another may offer it terms.',
    opinion: 'How the house feels about you. Gifts and shared enemies raise it; taking their cities and breaking pacts lowers it. It fades toward neutral over time.',
    oath: 'This house has broken a pact before. Others are slow to trust it.',
    ally: 'Ask for an alliance. Allies do not fight each other and may pass through each other\'s land. A house accepts when it likes you, or when a bigger threat looms.',
    gift: 'Give 100 gold to raise their opinion of you. One gift every ten days.',
    merge: 'Offer terms: a much weaker house may join you, with all its cities, armies and officers, rather than be destroyed. It may refuse.',
    breakIt: 'End the alliance at once. You lose their trust and everybody else\'s, and your officers grumble. You cannot ally with them again for 90 days.',
    intro: 'Every house is your enemy until you ally. A pact can be broken at any time, at the price of your name. A house that is much weaker may be offered terms.'
  };

  function init(u) { ui = u; }
  const offers = () => ui.state.diplo ? ui.state.diplo.offers.filter(o => o.to === ui.state.player) : [];
  const pending = () => offers().length;

  function html() {
    const st = ui.state, D = VM.Diplo, me = st.player, C = VM.CFG.DIPLO, I = VM.Icons, M = I.MAP, esc = I.esc, P = VM.Panels; D.ensure(st);
    const dot = f => `<span class="dot" style="background:${f.color}"></span>`;
    let h = `<div class="ph">${I.t('handshake', 'Diplomacy', TIPS.intro, '', true)}<span class="sub"></span>${I.btn('close', 'Close', { 'data-act': 'sheetClose' }, 'sm x')}</div>`;
    for (const o of offers()) {
      const f = st.factions[o.from], al = o.kind === 'alliance';
      h += `<div class="card2 hot"><div class="ir">${dot(f)}<b>${f.name}</b>${I.t(al ? 'handshake' : 'crown', al ? 'Offers an alliance' : 'Asks you to bend the knee', al ? 'Allies do not fight each other.' : 'If you accept, your game ends here; refuse, and you fight on.', '', true)}`
        + `${I.stat('clock', Math.ceil(o.until - st.time), 'Open for days', 'Days left to answer.', 'dim')}</div><div class="ir">${I.btn('all', al ? 'Accept' : 'Bend the knee', { 'data-act': 'dAnswer', 'data-o': o.id, 'data-yes': '1' }, 'sm', undefined, true)}${I.btn('none', al ? 'Decline' : 'Fight on', { 'data-act': 'dAnswer', 'data-o': o.id, 'data-yes': '0' }, 'sm', undefined, true)}</div></div>`;
    }
    const ally = D.allyOf(st, me), facs = st.factions.filter(f => !f.neutral && f.id !== me && f.alive), top = Math.max(1, ...st.factions.filter(f => !f.neutral && f.alive).map(f => D.power(st, f.id)));
    for (const f of facs) {
      const isAlly = ally === f.id, cities = st.cities.filter(c => c.owner === f.id).length, o = D.op(st, f.id, me), why = D.whyNot(st, me, f.id), merge = D.canMerge(st, me, f.id);
      const mood = o <= -10 ? 'faceBad' : o < 10 ? 'faceOk' : 'faceGood';
      h += `<div class="card2"><div class="ir">${dot(f)}<b>${f.name}</b>${isAlly ? I.t('handshake', 'Ally', 'Allies do not fight each other.', 'good', true) : I.t('swords', 'Enemy', 'At war with you.', 'bad', true)}${D.trust(st, f.id) < -30 ? I.t('unlink', 'Oath-breaker', TIPS.oath, 'bad', true) : ''}${P.traitIcon(D.traitOf(st, f.id))}</div>`;
      h += `<div class="ir stats">${I.stat('house', cities, 'Cities')}<span class="st" data-tip="${esc('Strength\n' + TIPS.strength + '\n' + num(D.power(st, f.id)))}">${I.svg('helmet')}${I.meter(D.power(st, f.id) / top)}<b>${num(D.power(st, f.id))}</b></span>`
        + `<span class="st" data-tip="${esc('Opinion of you\n' + TIPS.opinion + '\n' + feel(o))}">${I.svg(mood)}<b>${Math.round(o)}</b></span></div><div class="ir">`;
      if (isAlly) h += ui.confirmBreak === f.id ? `${I.t('unlink', 'Break the pact?', 'You will lose trust.', 'bad', true)}${I.btn('all', 'Yes, break it', { 'data-act': 'dBreakYes' }, 'sm', undefined, true)}${I.btn('none', 'No', { 'data-act': 'dBreakNo' }, 'sm', undefined, true)}` : I.btn('unlink', 'Break the pact', { 'data-act': 'dBreak', 'data-f': f.id }, 'sm', TIPS.breakIt, true);
      else h += I.btn('handshake', 'Propose alliance', Object.assign({ 'data-act': 'dAlly', 'data-f': f.id }, why ? { disabled: '' } : {}), 'sm', why ? why.charAt(0).toUpperCase() + why.slice(1) : TIPS.ally, true);
      h += `<button class="ibtn sm" data-act="dGift" data-f="${f.id}" data-tip="${esc('Gift\n' + TIPS.gift)}"${st.factions[me].gold < C.giftSmall ? ' disabled' : ''}>${I.svg('gift')}${I.w('Gift')}${I.svg('gold')}<b>${C.giftSmall}</b></button>`;
      if (!merge) h += I.btn('scroll', 'Offer terms', { 'data-act': 'dMerge', 'data-f': f.id }, 'sm', TIPS.merge, true);
      h += `</div></div>`;
    }
    const log = st.diplo.log.slice(-6).reverse();
    if (log.length) {
      h += `<div class="sec">${I.t('calendar', 'Recent', '', '', true)}</div>`;
      for (const l of log) { const A = l.a ? st.factions[l.a] : null, B = l.b ? st.factions[l.b] : null; h += `<div class="alert ir" data-tip="${esc(l.text)}"><span class="st dim">${I.svg('calendar')}<b>${Math.floor(l.t)}</b></span>${I.svg(l.kind === 'allied' ? 'handshake' : l.kind === 'broken' ? 'unlink' : 'crown')}${A ? dot(A) + A.name : ''}${B ? '<span class="dim">' + I.svg('go') + '</span>' + dot(B) + B.name : ''}<span class="w dim">${l.text}</span></div>`; }
    }
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
      case 'dAnswer': cmd({ type: 'answerOffer', offer: +d.o, accept: d.yes === '1' }); break;
    }
  }
  return { init, html, act, pending };
})();
