// DOM panels: top bar, node panel, army panel, toasts. Panels are rebuilt as HTML strings and only written to the DOM when the text changes;
// buttons carry data-act attributes and one delegated click handler turns them into commands.
var VM = globalThis.VM = globalThis.VM || {};

VM.Panels = (function () {
  let ui, panel, lastHTML = '', toastTimer = 0;
  const SPEND = { build: 'coin', recruit: 'recruit', buildDepot: 'coin', setDepot: 'click', moveArmy: 'order', stopArmy: 'order', setOrder: 'order', formArmy: 'horn', ability: 'ability', disbandArmy: 'click' };
  const $ = id => document.getElementById(id);
  const num = v => Math.round(v).toLocaleString('en-US');
  const sgn = v => (v >= 0 ? '+' : '') + Math.round(v);

  function init(uiRef) {
    ui = uiRef; panel = $('panel');
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    panel.addEventListener('input', e => { const k = e.target.dataset.draft; if (!k || !ui.draft) return; const c = ui.state.cities[ui.draft.city]; ui.draft.take[k] = Math.max(0, Math.min(Math.floor(c.garrison[k] + 1e-9), Math.floor(+e.target.value || 0))); });
  }

  function cmd(c) {
    c.faction = ui.state.player;
    const r = VM.Commands.exec(ui.state, c);
    if (!r.ok) { toast(r.reason.charAt(0).toUpperCase() + r.reason.slice(1)); VM.Audio.play('error'); }
    else VM.Audio.play(SPEND[c.type] || 'click');
    lastHTML = ''; return r;
  }

  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const d = b.dataset, st = ui.state;
    switch (d.act) {
      case 'close': ui.selectedCity = -1; ui.selectedArmy = null; break;
      case 'tax': cmd({ type: 'setTax', city: +d.city, tax: d.tax }); break;
      case 'build': cmd({ type: 'build', city: +d.city, building: d.b }); break;
      case 'recruit': cmd({ type: 'recruit', city: +d.city, troop: d.t, count: +d.n }); break;
      case 'form': {
        const sel = $('formOfficer'); if (!sel || sel.value === '') { toast('Choose an officer to lead the army'); break; }
        const c = st.cities[+d.city], take = {}; for (const k in draftFor(c).take) if (ui.draft.take[k] > 0) take[k] = ui.draft.take[k];
        const r = cmd({ type: 'formArmy', city: +d.city, officer: +sel.value, troops: take });
        if (r.ok) { ui.draft = null; ui.selectedCity = -1; ui.selectedArmy = r.army; }
        break;
      }
      case 'draft': { const c = st.cities[ui.selectedCity]; if (!c) break; const dr = draftFor(c); dr.take[d.t] = Math.max(0, Math.min(Math.floor(c.garrison[d.t] + 1e-9), (dr.take[d.t] || 0) + +d.n)); lastHTML = ''; break; }
      case 'draftAll': { const c = st.cities[ui.selectedCity]; if (!c) break; const dr = draftFor(c); for (const k in VM.CFG.TROOPS) if (d.t === '*' || d.t === k) dr.take[k] = Math.floor(c.garrison[k] + 1e-9); lastHTML = ''; break; }
      case 'draftNone': { const c = st.cities[ui.selectedCity]; if (!c) break; const dr = draftFor(c); for (const k in dr.take) dr.take[k] = 0; lastHTML = ''; break; }
      case 'xfer': cmd({ type: 'transferTroops', army: +d.army, troop: d.t, count: +d.n }); break;
      case 'merge': { const sel = $('mergeWith'); if (!sel || sel.value === '') break; const r = cmd({ type: 'mergeArmies', army: +d.army, with: +sel.value }); if (r.ok) toast('The armies are now one'); break; }
      case 'stop': cmd({ type: 'stopArmy', army: +d.army }); break;
      case 'disband': { const r = cmd({ type: 'disbandArmy', army: +d.army }); if (r.ok) ui.selectedArmy = null; break; }
      case 'ability': { const r = cmd({ type: 'ability', army: +d.army }); if (r.ok) toast(({ charge: 'Charge! Your troops hit harder for a few days', fire: 'Fire attack!', rally: 'Rally! Morale restored' })[r.kind]); break; }
      case 'depot': cmd({ type: 'buildDepot', city: +d.city }); break;
      case 'depotTarget': { const c = st.cities[+d.city]; cmd({ type: 'setDepot', city: +d.city, target: (c.depot ? c.depot.target : 0) + +d.n }); break; }
      case 'policy': cmd({ type: 'setPolicy', city: +d.city, mode: d.mode }); break;
      case 'order': cmd({ type: 'setOrder', army: +d.army, mode: d.mode }); break;
      case 'view3d': ui.openCity(+d.city); break;
      case 'panelToggle': ui.panelMin = !ui.panelMin; lastHTML = ''; break;
      case 'backmap': ui.closeCity(); break;
      case 'walk': if (!VM.Walk.start()) toast('You can only walk in your own cities'); break;
      case 'goto': ui.centerOn(+d.city); break;
    }
  }

  function onChange(e) {
    if (e.target.id === 'govSel') cmd({ type: 'setGovernor', city: +e.target.dataset.city, officer: e.target.value === '' ? null : +e.target.value });
  }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }

  const officerLine = o => `${o.name} · Cmd ${o.command} Mig ${o.might} Pol ${o.politics} Int ${o.intellect} · ${o.trait}`;
  const troopList = (t, all) => Object.keys(VM.CFG.TROOPS).filter(k => all || t[k] >= 0.5).map(k => `${VM.CFG.TROOPS[k].label} ${num(t[k])}`).join(' · ') || 'none';
  const bar = (frac, cls) => `<div class="bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(0)}%"></i></div>`;
  // The troops chosen for the next army, per city (kept while the panel redraws).
  function draftFor(c) {
    if (!ui.draft || ui.draft.city !== c.id) { ui.draft = { city: c.id, take: {} }; for (const k in VM.CFG.TROOPS) ui.draft.take[k] = Math.floor(c.garrison[k] + 1e-9); }
    for (const k in VM.CFG.TROOPS) ui.draft.take[k] = Math.max(0, Math.min(Math.floor(c.garrison[k] + 1e-9), ui.draft.take[k] || 0));
    return ui.draft;
  }
  const POLICY_TIP = { manual: 'You decide everything here.', develop: 'The governor builds, sets taxes and keeps a small garrison, saving a gold reserve.', fortify: 'Walls first, then archers and a larger garrison.', recruit: 'Barracks first, then a large standing garrison to draw armies from.' };
  const ORDER_TIP = { hold: 'Stays where it is.', defend: 'Guards its station and meets intruders when the odds suit the officer.', reinforce: 'Marches to your cities that are under attack.', raid: 'Seeks weak hostile towns nearby, falls back to rest when worn down or cut off.' };
  const ABILITY = { charge: 'Charge', fire: 'Fire attack', rally: 'Rally' };

  function cityHTML(c) {
    const st = ui.state, me = st.player, N = st.map.nodes[c.id], S = VM.CFG.SPEC[c.spec], f = st.factions[c.owner], s = c.stats;
    const mine = c.owner === me, fac = st.factions[me], wmax = VM.War.wallMax(c);
    let h = `<div class="ph"><b>${N.name}</b><span class="sub">${S.label}</span><button data-act="panelToggle" class="tog" title="Show or hide the details">${ui.panelMin ? '▴' : '▾'}</button>${ui.cityView === c.id ? `${c.owner === ui.state.player ? `<button data-act="walk" class="btn sm">Walk</button>` : ''}<button data-act="backmap" class="btn sm">← Back to map</button>` : `<button data-act="view3d" data-city="${c.id}" class="btn sm">View city</button><button data-act="close" class="x">✕</button>`}</div>`;
    h += `<div class="row"><span class="dot" style="background:${f.color}"></span>${f.name}${mine ? ' (you)' : (VM.Diplo.allied(st, c.owner, me) ? ' (ally)' : '')}${c.besieged ? ' · <span class="bad">UNDER SIEGE</span>' : (c.contested ? ' · <span class="bad">CONTESTED</span>' : '')}</div>`;
    h += `<div class="row">Population <b>${num(c.pop)}</b> / ${num(s.cap)}</div>`;
    if (wmax > 0) h += `<div class="row">Wall <b>${num(c.wallHp)}</b> / ${num(wmax)}${bar(c.wallHp / wmax, 'wall')}</div>`;
    h += `<div class="row">Garrison <b>${num(VM.Eco.troopsOf(c.garrison))}</b> <span class="dim">${troopList(c.garrison)}</span></div>`;
    if (!mine) {
      const here = st.armies.filter(a => a.at === c.id && a.owner === me);
      return h + `<div class="row dim">${here.length ? 'Your army is here and will lay siege.' : 'Select one of your armies, then tap this node to march on it.'}</div>`;
    }
    h += `<div class="row">Prosperity <b>${s.prosperity.toFixed(2)}</b> · Security ${s.security.toFixed(2)}</div>`;
    h += `<div class="row">Gold <b>${sgn(s.gold - s.upkeep)}</b>/day · Food ${sgn(s.foodProd - s.foodCons)}/day <span class="dim">(${num(s.foodProd)} made, ${num(s.foodCons)} eaten)</span></div>`;
    h += `<div class="row">Tax ` + ['low', 'normal', 'high'].map(k => `<button data-act="tax" data-city="${c.id}" data-tax="${k}" class="chip${c.tax === k ? ' on' : ''}">${VM.CFG.TAX[k].label}</button>`).join('') + `</div>`;
    const offs = st.officers.filter(o => o.owner === me && o.army === null);
    h += `<div class="row">Governor <select id="govSel" data-city="${c.id}"><option value="">(none)</option>` + offs.map(o => `<option value="${o.id}"${c.governor === o.id ? ' selected' : ''}>${o.name} · Pol ${o.politics}</option>`).join('') + `</select></div>`;
    if (c.governor !== null) {
      const g = st.officers[c.governor];
      h += `<div class="row dim">${g.name} · ${g.trait} · loyalty ${Math.round(g.loyalty)}</div>`;
      h += `<div class="row">Policy ` + VM.Officers.POLICIES.map(k => `<button data-act="policy" data-city="${c.id}" data-mode="${k}" class="chip${c.policy === k ? ' on' : ''}" title="${POLICY_TIP[k]}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('') + `</div>`;
      h += `<div class="row dim">${POLICY_TIP[c.policy]}</div>`;
    }
    h += `<div class="sec">Buildings</div>`;
    for (const k of Object.keys(VM.CFG.BUILD)) {
      const B = VM.CFG.BUILD[k], lvl = c.buildings[k], building = c.build && c.build.type === k;
      let act = '';
      if (building) act = `<span class="dim">building… ${Math.ceil(c.build.left)}d</span>`;
      else if (lvl >= VM.CFG.MAX_BUILD_LEVEL) act = '<span class="dim">max</span>';
      else act = `<button data-act="build" data-city="${c.id}" data-b="${k}" class="btn"${c.build || fac.gold < B.cost[lvl] ? ' disabled' : ''}>Lv${lvl + 1} · ${B.cost[lvl]}g · ${B.days[lvl]}d</button>`;
      h += `<div class="row between"><span>${B.label} <b>Lv${lvl}</b></span>${act}</div>`;
    }
    h += `<div class="sec">Forward depot</div>`;
    if (!c.depot) h += `<div class="row between"><span class="dim">Stores food so armies near here eat at the normal rate in enemy land.</span><button data-act="depot" data-city="${c.id}" class="btn"${fac.gold < VM.CFG.WAR.depotCost ? ' disabled' : ''}>Build · ${VM.CFG.WAR.depotCost}g</button></div>`;
    else h += `<div class="row between"><span>Stock <b>${num(c.depot.food)}</b> → target ${num(c.depot.target)}</span><span><button data-act="depotTarget" data-city="${c.id}" data-n="-500" class="btn sm">−500</button><button data-act="depotTarget" data-city="${c.id}" data-n="500" class="btn sm">+500</button></span></div>`;
    h += `<div class="sec">Recruit</div>`;
    for (const k of Object.keys(VM.CFG.TROOPS)) {
      const cost = VM.Eco.troopCost(c, k);
      h += `<div class="row between"><span>${VM.CFG.TROOPS[k].label} <span class="dim">${Math.round(cost)}g each</span></span><span>` +
        [1, 5, 10].map(n => `<button data-act="recruit" data-city="${c.id}" data-t="${k}" data-n="${n}" class="btn sm">+${n}</button>`).join('') + `</span></div>`;
    }
    const free = st.officers.filter(o => o.owner === me && o.army === null && o.loc === c.id && c.governor !== o.id);
    h += `<div class="sec">Form an army</div>`;
    if (!VM.Eco.troopsOf(c.garrison)) h += `<div class="row dim">Recruit troops to form an army from the garrison.</div>`;
    else if (!free.length) h += `<div class="row dim">No free officer in this city (the governor cannot lead an army).</div>`;
    else {
      const d = draftFor(c); let total = 0, speed = Infinity;
      h += `<div class="row dim">Choose how many of the garrison go with the army.</div>`;
      for (const k of Object.keys(VM.CFG.TROOPS)) {
        const have = Math.floor(c.garrison[k] + 1e-9); if (have < 1) continue;
        const n = d.take[k] || 0; total += n; if (n > 0) speed = Math.min(speed, VM.CFG.TROOPS[k].speed);
        h += `<div class="row between"><span>${VM.CFG.TROOPS[k].label} <span class="dim">${num(have)} here</span></span><span class="nowrap">` +
          [-5, -1].map(x => `<button data-act="draft" data-t="${k}" data-n="${x}" class="btn sm">${x < 0 ? '−' + (-x) : '+' + x}</button>`).join('') +
          `<input type="number" class="num" min="0" max="${have}" value="${n}" data-draft="${k}">` +
          [1, 5].map(x => `<button data-act="draft" data-t="${k}" data-n="${x}" class="btn sm">+${x}</button>`).join('') +
          `<button data-act="draftAll" data-t="${k}" class="btn sm">All</button></span></div>`;
      }
      h += `<div class="row dim">Taking ${num(total)} troops${total > 0 ? ' · speed ' + speed : ''} <button data-act="draftAll" data-t="*" class="btn sm">Take all</button> <button data-act="draftNone" class="btn sm">None</button></div>`;
      h += `<div class="row">Leader <select id="formOfficer">` + free.map(o => `<option value="${o.id}">${o.name} · Cmd ${o.command}</option>`).join('') + `</select> <button data-act="form" data-city="${c.id}" class="btn"${total < 1 ? ' disabled' : ''}>Form army</button></div>`;
    }
    return h;
  }

  function armyHTML(a) {
    const st = ui.state, o = st.officers[a.officer], f = st.factions[a.owner], mine = a.owner === st.player, N = st.map.nodes, n = VM.Armies.sizeOf(a);
    let h = `<div class="ph"><b>Army of ${f.name}</b><span class="sub">${num(n)} troops</span><button data-act="panelToggle" class="tog" title="Show or hide the details">${ui.panelMin ? '▴' : '▾'}</button><button data-act="close" class="x">✕</button></div>`;
    h += `<div class="row dim">${officerLine(o)} · loyalty ${Math.round(o.loyalty)}</div>`;
    h += `<div class="row">${troopList(a.troops)}</div>`;
    h += `<div class="row">Morale <b>${Math.round(a.morale)}</b>${bar(a.morale / 100, a.morale < 30 ? 'low' : '')}</div>`;
    const where = a.at !== null ? 'in ' + N[a.at].name : 'on the road to ' + N[a.edge.to].name;
    h += `<div class="row">${where}${a.dest !== null && !a.routed ? ' · heading to <b>' + N[a.dest].name + '</b>' : ''}</div>`;
    if (a.routed) h += `<div class="row bad"><b>ROUTED</b> — fleeing to safety</div>`;
    else if (a.fighting.length) h += `<div class="row bad"><b>In battle</b> against ${a.fighting.map(id => { const e = st.armies.find(x => x.id === id); return e ? st.factions[e.owner].name + ' (' + num(VM.Armies.sizeOf(e)) + ')' : ''; }).join(', ')}</div>`;
    else if (VM.War.sieging(a) && st.cities[a.at].owner !== a.owner) h += `<div class="row bad"><b>Besieging</b> ${N[a.at].name}</div>`;
    const s = a.supply;
    if (s) {
      const days = n > 0 ? a.rations / (n * VM.CFG.ECON.foodPerHead) : 0;
      let line = s.line === 'ok' ? '<span class="good">supply line open</span>' : (s.line === 'cut' ? '<span class="bad"><b>SUPPLY CUT</b></span>' : '<span class="bad">no supply source</span>');
      if (s.depot != null) line += ` · fed by depot at ${N[s.depot].name}`;
      else if (s.foreign) line += ` · enemy land: eats ${s.mult}x`;
      h += `<div class="row">${line}</div><div class="row dim">Rations ${days.toFixed(1)} days · supplied from ${N[a.home].name}${s.starving ? ' · <span class="bad">STARVING</span>' : ''}</div>`;
    }
    if (!mine) return h;
    h += `<div class="row">Orders ` + VM.Officers.ORDERS.map(k => `<button data-act="order" data-army="${a.id}" data-mode="${k}" class="chip${a.order === k ? ' on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('') + `</div><div class="row dim">${ORDER_TIP[a.order]}${a.rest ? ' Resting now.' : ''}</div>`;
    const kind = VM.War.abilityOf(o), wait = Math.max(0, a.abilityReady - st.time);
    h += `<div class="row"><button data-act="ability" data-army="${a.id}" class="btn"${wait > 0 || a.routed ? ' disabled' : ''}>${ABILITY[kind]}</button> <span class="dim">${wait > 0 ? 'ready in ' + Math.ceil(wait) + ' days' : 'ready'}</span></div>`;
    const home = a.at !== null && st.cities[a.at].owner === a.owner && !a.fighting.length && !a.routed ? st.cities[a.at] : null;
    if (home) {
      h += `<div class="sec">Troops in ${N[home.id].name}</div><div class="row dim">Move recruits between the army and the city's garrison.</div>`;
      for (const k of Object.keys(VM.CFG.TROOPS)) {
        const inArmy = Math.floor((a.troops[k] || 0) + 1e-9), inCity = Math.floor(home.garrison[k] + 1e-9); if (inArmy < 1 && inCity < 1) continue;
        h += `<div class="row between"><span>${VM.CFG.TROOPS[k].label} <span class="dim">army ${num(inArmy)} · city ${num(inCity)}</span></span><span class="nowrap">` +
          [-5, -1, 1, 5].map(x => `<button data-act="xfer" data-army="${a.id}" data-t="${k}" data-n="${x}" class="btn sm"${(x < 0 ? inArmy : inCity) < 1 ? ' disabled' : ''}>${x < 0 ? '−' + (-x) : '+' + x}</button>`).join('') + `</span></div>`;
      }
      const mates = st.armies.filter(x => x.owner === a.owner && x.id !== a.id && x.at === a.at && !x.fighting.length && !x.routed);
      if (mates.length) h += `<div class="row">Join with <select id="mergeWith"><option value="">(choose)</option>` + mates.map(x => `<option value="${x.id}">${st.officers[x.officer].name} · ${num(VM.Armies.sizeOf(x))}</option>`).join('') + `</select> <button data-act="merge" data-army="${a.id}" class="btn">Merge</button></div>`;
    }
    h += `<div class="row dim">Tap a node to march there (right-click works too). Moving out of a battle costs morale. Tap empty ground to deselect.</div>`;
    h += `<div class="row"><button data-act="stop" data-army="${a.id}" class="btn">Halt</button> <button data-act="disband" data-army="${a.id}" class="btn"${a.at === null || st.cities[a.at].owner !== a.owner || a.fighting.length ? ' disabled' : ''}>Disband into city</button></div>`;
    return h;
  }

  function update() {
    const st = ui.state, me = st.factions[st.player], d = VM.Sim.date(st);
    $('fname').textContent = me.name; $('fdot').style.background = me.color;
    $('gold').innerHTML = `Gold ${num(me.gold)} <small class="${me.income.gold < 0 ? 'bad' : 'good'}">${sgn(me.income.gold)}/d</small>`;
    $('food').innerHTML = `Food ${num(me.food)} <small class="${me.income.food < 0 ? 'bad' : 'good'}">${sgn(me.income.food)}/d</small>${me.starving ? ' <small class="bad">STARVING</small>' : ''}`;
    $('date').textContent = `Year ${d.year} · Month ${d.month} · Day ${d.day}`;
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.s === ui.speed));
    let h = '';
    const army = ui.selectedArmy !== null ? st.armies.find(a => a.id === ui.selectedArmy) : null;
    if (ui.selectedArmy !== null && !army) ui.selectedArmy = null;
    if (army) h = armyHTML(army); else if (ui.selectedCity >= 0) h = cityHTML(st.cities[ui.selectedCity]);
    panel.classList.toggle('open', !!h); panel.classList.toggle('min', !!ui.panelMin);
    if (h !== lastHTML && !(document.activeElement && panel.contains(document.activeElement) && (document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'INPUT') && h && lastHTML)) { panel.innerHTML = h; lastHTML = h; }
  }

  return { init, update, toast };
})();
