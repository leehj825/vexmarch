// Alerts: turns sim events into readable messages, keeps the feed, and pauses the game for the urgent kinds you choose.
var VM = globalThis.VM = globalThis.VM || {};

VM.Alerts = (function () {
  const CATS = {
    attack:   { label: 'Cities attacked or lost', pause: true },
    army:     { label: 'Armies cut off, routed or lost', pause: true },
    officer:  { label: 'Officers defecting', pause: true },
    proposal: { label: 'Officers asking permission', pause: true },
    battle:   { label: 'Battles joined', pause: false },
    famine:   { label: 'Famine', pause: false },
    diplo:    { label: 'Diplomatic offers and betrayals', pause: true }
  };
  const SOUND = { diploOffer: 'alert', allyBroken: 'danger', allied: 'coin', attacked: 'danger', battle: 'clash', rout: 'rout', destroyed: 'danger', cut: 'alert', defected: 'alert', proposal: 'alert', built: 'build', recruited: 'pick', found: 'coin', wanderer: 'click', starving: 'danger' };
  let ui, items = [], unread = 0, settings = { pause: {} };

  function load() {
    try { const s = JSON.parse(localStorage.getItem('vexmarch.settings')); if (s && s.pause) settings = s; } catch (e) { /* defaults */ }
    for (const k in CATS) if (settings.pause[k] === undefined) settings.pause[k] = CATS[k].pause;
  }
  function save() { try { localStorage.setItem('vexmarch.settings', JSON.stringify(settings)); } catch (e) { /* optional */ } }

  function init(uiRef) { ui = uiRef; load(); }

  // Returns { text, cat, urgent, loc, toast } or null for events that are not shown.
  function describe(state, ev) {
    const me = state.player, N = state.map.nodes, mine = ev.owner === me, nm = id => state.factions[id].name, on = id => state.officers[id].name;
    const spec = (text, cat, urgent, loc, toast) => ({ text, cat, urgent, loc: loc === undefined ? null : loc, toast: toast !== false });
    switch (ev.type) {
      case 'built': return mine ? spec(`${VM.CFG.BUILD[ev.building].label} Lv${ev.level} finished in ${N[ev.city].name}`, 'info', false, ev.city, false) : null;
      case 'starving': return mine ? spec('Your people are starving! Build farms or reduce your armies.', 'famine', true, null) : null;
      case 'attacked': return mine ? spec(`${N[ev.city].name} is ${ev.besieged ? 'under siege' : 'under threat'}!`, 'attack', true, ev.city) : null;
      case 'battle': return (mine || ev.enemy === me) ? spec(`Battle near ${N[ev.at].name}: ${nm(ev.owner)} against ${nm(ev.enemy)}`, 'battle', false, ev.at) : null;
      case 'rout': return mine ? spec(`Your army broke near ${N[ev.at].name} and is fleeing!`, 'army', true, ev.at) : spec(`${nm(ev.owner)}'s army routed near ${N[ev.at].name}`, 'info', false, ev.at, false);
      case 'destroyed': return mine ? spec(`Your army was destroyed near ${N[ev.at].name}`, 'army', true, ev.at) : null;
      case 'captured':
        if (ev.from === me) return spec(`${N[ev.city].name} has fallen to ${nm(ev.owner)}!`, 'attack', true, ev.city);
        if (ev.owner === me) return spec(`${N[ev.city].name} captured!`, 'info', false, ev.city);
        return spec(`${nm(ev.owner)} took ${N[ev.city].name}`, 'info', false, ev.city, false);
      case 'breach': return ev.owner === me ? spec(`The gate of ${N[ev.city].name} has been broken! Your defenders come out to fight.`, 'attack', true, ev.city) : (state.armies.some(x => x.owner === me && x.at === ev.city) ? spec(`The gate of ${N[ev.city].name} is down!`, 'info', false, ev.city, false) : null);
      case 'blocked': return mine ? spec(`Your army halted at ${N[ev.at].name}: a hostile city stands in the way and must be taken first`, 'info', false, ev.at) : null;
      case 'cut': return mine ? spec('An army of yours has been cut off from supply!', 'army', true, null) : null;
      case 'officerCaptured': return mine ? spec(`${on(ev.officer)} was captured and joins you`, 'info', false, null) : (ev.from === me ? spec(`${on(ev.officer)} was captured by ${nm(ev.owner)}`, 'info', false, null) : null);
      case 'officerDied': return ev.owner === me ? spec(`${on(ev.officer)} fell in battle`, 'info', false, null) : null;
      case 'eliminated': return mine ? null : spec(`${nm(ev.owner)} has been destroyed`, 'info', false, null);
      case 'defected': return mine ? spec(`${on(ev.officer)} has deserted to ${ev.to ? nm(ev.to) : 'the wilds'}!`, 'officer', true, null) : (ev.to === me ? spec(`${on(ev.officer)} defected to you from ${nm(ev.owner)}`, 'info', false, ev.city) : null);
      case 'loyaltyLow': return mine ? spec(`${on(ev.officer)}'s loyalty is low. A gift might help.`, 'info', false, null) : null;
      case 'wanderer': return mine ? spec(`A wandering officer, ${on(ev.officer)}, has come to ${N[ev.city].name}`, 'info', false, ev.city) : null;
      case 'found': return mine ? spec(`Your search found ${on(ev.officer)} near ${N[ev.city].name}`, 'info', false, ev.city) : null;
      case 'searchFailed': return mine ? spec(`${on(ev.officer)} found no one worth recruiting`, 'info', false, ev.city) : null;
      case 'recruited': return mine ? spec(`${on(ev.officer)} has joined you in ${N[ev.city].name}`, 'info', false, ev.city) : null;
      case 'arrived': return mine ? spec(`${on(ev.officer)} arrived in ${N[ev.city].name}`, 'info', false, ev.city, false) : null;
      case 'diploOffer': return ev.owner === me ? spec(ev.kind === 'alliance' ? `${nm(ev.from)} offers you an alliance` : `${nm(ev.from)} asks you to bend the knee and join them`, 'diplo', true, null) : null;
      case 'allied': return (ev.a === me || ev.b === me) ? spec(`You are now allied with ${nm(ev.a === me ? ev.b : ev.a)}`, 'info', false, null) : spec(`${nm(ev.a)} and ${nm(ev.b)} have allied`, 'info', false, null, false);
      case 'aid': return ev.owner === me ? spec(`${nm(ev.from)} sends ${ev.armies > 1 ? 'armies' : 'an army'} to help ${N[ev.city].name}`, 'diplo', false, ev.city) : (ev.from === me ? spec(`Your ${ev.armies > 1 ? 'armies go' : 'army goes'} to help ${nm(ev.owner)} at ${N[ev.city].name}`, 'info', false, ev.city) : null);
      case 'hazard': {
        if (!mine) return null; const nme = N[ev.city].name;
        if (ev.kind === 'blight') return spec(`The harvest at ${nme} has failed: half the food for a while`, 'famine', false, ev.city);
        if (ev.kind === 'bounty') return spec(`A bountiful harvest at ${nme}: more food for a while`, 'info', false, ev.city);
        if (ev.kind === 'plague') return spec(`Plague in ${nme}: ${ev.lost} people have died`, 'famine', false, ev.city);
        if (ev.kind === 'bandits') return spec(`Bandits on the roads near ${nme}: trade pays less until they are driven off (an army stationed there does it)`, 'info', false, ev.city);
        if (ev.kind === 'unrest') return spec(`Unrest in ${nme}: the garrison lost ${ev.lost} men to rioters. Keep the people fed and the governor loyal.`, 'attack', true, ev.city);
        return null;
      }
      case 'allyBroken': return ev.other === me ? spec(`${nm(ev.by)} has broken the pact with you!`, 'diplo', true, null) : (ev.by === me ? spec(`You broke the pact with ${nm(ev.other)}`, 'info', false, null) : spec(`${nm(ev.by)} broke the pact with ${nm(ev.other)}`, 'info', false, null, false));
      case 'merged': return ev.from === me ? null : spec(`${nm(ev.from)} has joined ${nm(ev.owner)}`, 'info', false, null, ev.owner === me);
      case 'proposal': {
        const p = state.proposals.find(x => x.id === ev.proposal); if (!p) return null;
        return spec(proposalText(state, p), 'proposal', true, p.type === 'attack' ? p.target : p.city);
      }
    }
    return null;
  }

  function proposalText(state, p) {
    const N = state.map.nodes, o = state.officers[p.officer];
    if (p.type === 'attack') { const c = state.cities[p.target]; return `${o.name} asks permission to attack ${N[p.target].name} (garrison about ${Math.round(VM.Eco.troopsOf(c.garrison))}).`; }
    return `${o.name} asks to build a wall in ${N[p.city].name} (${p.cost} gold).`;
  }

  function process() {
    const st = ui.state;
    for (const ev of st.events) {
      if (ev.n <= ui.lastEvent) continue;
      ui.lastEvent = ev.n;
      const d = describe(st, ev); if (!d) continue;
      const N = st.map.nodes, fn = id => st.factions[id] ? st.factions[id].name : '', short = d.loc !== null ? N[d.loc].name : ev.officer !== undefined ? st.officers[ev.officer].name
        : ev.a !== undefined ? fn(ev.a) + ' · ' + fn(ev.b) : ev.by !== undefined ? fn(ev.by) + ' · ' + fn(ev.other) : ev.from !== undefined && ev.owner !== undefined ? fn(ev.from) + ' → ' + fn(ev.owner) : ev.from !== undefined ? fn(ev.from) : '';
      items.unshift({ n: ev.n, t: ev.t, text: d.text, cat: d.cat, urgent: d.urgent, loc: d.loc, type: ev.type, short, proposal: ev.type === 'proposal' ? ev.proposal : null });
      if (items.length > 40) items.pop();
      unread++;
      if (d.toast) VM.Panels.toast(d.text);
      if (ev.type === 'captured') VM.Audio.play(ev.owner === st.player ? 'capture' : (ev.from === st.player ? 'lose' : 'click')); else if (SOUND[ev.type] && (d.urgent || ev.owner === st.player)) VM.Audio.play(SOUND[ev.type]);
      if (d.urgent && settings.pause[d.cat] && ui.speed > 0) { ui.speed = 0; VM.Panels.toast('Paused: ' + d.text); }
    }
  }

  function reset() { items = []; unread = 0; }
  const read = () => { unread = 0; };

  return { init, process, describe, proposalText, reset, read, items: () => items, unread: () => unread, settings: () => settings, setPause(k, v) { settings.pause[k] = v; save(); }, CATS };
})();
