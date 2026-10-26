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
      case 'detailsToggle': VM.UIPrefs.set('det', !VM.UIPrefs.get('det')); lastHTML = ''; break;
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
  const TRAIT_TIP = { Rash: 'Eager to fight. Attacks on worse odds and holds out less in a siege.', Cautious: 'Careful. Wants clear odds before attacking and pulls back early when worn down.', Loyal: 'Steadfast. Loyalty drops less and rises faster.', Greedy: 'Loves gold. Loyalty falls if the treasury is empty and a gift pleases them.', Brave: 'Fights on when others would retreat and takes risks.', Schemer: 'Clever and ambitious. A little less loyal, and hard to trust.' };
  const traitSpan = t => TRAIT_TIP[t] ? `<span data-tip="${esc(TRAIT_TIP[t])}">${t}</span>` : t;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const T = (label, tip) => `<span data-tip="${esc(tip)}">${label}</span>`;                       // a label with a hold-to-read explanation (js/ui/tips.js)
  const info = tip => `<i class="info" data-tip="${esc(tip)}">i</i>`;
  const TIPS = {
    pop: 'People living here. Taxes and recruits come from them. The number after the slash is how many the city can hold; farms, markets and a temple raise it.',
    wall: 'The wall slows an attacker and lets your archers shoot down from it. Siege engines break it fastest. When it falls, the enemy storms the gate.',
    garrison: 'Soldiers stationed in the city. They defend it and are the pool you draw armies from.',
    prosperity: 'How well the city does: markets, a calm population and a temple raise it. It multiplies the gold the city earns.',
    security: 'How safe the people feel. It falls while an enemy stands nearby and when the city is devastated, and it lowers tax income and growth.',
    gold: 'Gold the city earns each day, minus the upkeep of its soldiers and buildings.',
    food: 'Food grown each day minus the food eaten by the people and soldiers. If it stays negative, the faction starves.',
    tax: 'Higher tax brings more gold but slows growth and lowers contentment. Low tax does the opposite.',
    governor: 'A governor runs the city by the policy you choose, so you do not have to micromanage it. A governor cannot lead an army.',
    depot: 'Stores food so armies near here eat at the normal rate while in enemy land. Fill it before a campaign.',
    recruit: 'Training costs gold and takes people from the population. Recruits join the garrison.',
    form: 'Choose how many of the garrison go with the army, pick a free officer to lead it, then form it. The army marches out and eats its own rations.',
    siegeHere: 'Select one of your armies, then tap this node to march on it.',
    morale: 'An army that loses morale breaks and runs. Battles, hunger and a cut supply line wear it down; rest in a friendly city restores it.',
    loyalty: 'How loyal the officer is to you. Low loyalty can make them desert; a gift raises it.',
    supply: 'Food reaches an army along a road line from its home city. If an enemy army stands on that line, the supply is cut and the army starves.',
    rations: 'How many days the army can eat from the food it carries.',
    xfer: "Move recruits between the army and the city's garrison. Only possible while the army stands in your own city.",
    armyHelp: 'Tap a node to march there (right-click works too). Moving out of a battle costs morale. Tap empty ground to deselect.',
    ability: 'The officer\'s special move, used in battle or a siege. It needs time to recharge.'
  };
  const ABILITY = { charge: 'Charge', fire: 'Fire attack', rally: 'Rally' };

  // ---- the panels are made of icons; hold or hover an icon for its name and explanation (js/ui/icons.js, js/ui/tips.js) ----
  const I = VM.Icons, M = VM.Icons.MAP;
  const tipOf = (label, tip) => esc(tip ? label + '\n' + tip : label);
  const TAXN = { low: 'Low tax', normal: 'Normal tax', high: 'High tax' };
  const traitIcon = t => TRAIT_TIP[t] ? I.t(M.trait[t], t, TRAIT_TIP[t], '', true) : '';
  const stats4 = o => I.stat('star', o.command, 'Command', 'How well they lead an army. It adds to the army\'s strength.') + I.stat('fist', o.might, 'Might', 'Personal strength. Decides who wins a duel and how hard a charge hits.')
    + I.stat('scroll', o.politics, 'Politics', 'How well they govern a city. A good governor earns more and keeps order.') + I.stat('bulb', o.intellect, 'Intellect', 'Cunning. Helps with fire attacks and with finding wanderers.');
  const loyal = o => I.stat('heart', Math.round(o.loyalty), 'Loyalty', TIPS.loyalty) + I.meter(o.loyalty / 100);
  const officerRow = (o, color) => `<div class="ir">${I.portrait(o.name, color, 30)}<b>${o.name}</b>${traitIcon(o.trait)}</div><div class="ir stats">${stats4(o)}${loyal(o)}</div>`;
  const hbtn = (name, label, attrs, cls, word) => I.btn(name, label, attrs, 'sm ' + (cls || ''), undefined, word);
  const detBtn = () => hbtn('list', 'Details', { 'data-act': 'detailsToggle' }, 'tog' + (VM.UIPrefs.get('det') ? ' on' : ''));
  const costTip = (a, b, c) => `Level {0}: {1} gold, {2} days`.replace('{0}', a).replace('{1}', b).replace('{2}', c);

  function cityHTML(c) {
    const st = ui.state, me = st.player, N = st.map.nodes[c.id], S = VM.CFG.SPEC[c.spec], f = st.factions[c.owner], s = c.stats;
    const mine = c.owner === me, fac = st.factions[me], wmax = VM.War.wallMax(c), here = st.armies.filter(a => a.at === c.id && a.owner === me);
    let h = `<div class="ph"><b>${N.name}</b>${I.t(M.spec[c.spec] || 'house', S.label, '', '', true)}<span class="sub"></span>`
      + detBtn() + hbtn(ui.panelMin ? 'down' : 'up', 'Show or hide the details', { 'data-act': 'panelToggle' }, 'tog');
    h += ui.cityView === c.id ? `${mine ? hbtn('walk', 'Walk', { 'data-act': 'walk' }, '', true) : ''}${hbtn('back', 'Back to map', { 'data-act': 'backmap' }, '', true)}` : `${mine || VM.Fog.seesCity(st, me, c) ? hbtn('eye', 'View city', { 'data-act': 'view3d', 'data-city': c.id }, '', true) : ''}${hbtn('close', 'Close', { 'data-act': 'close' }, 'x')}`;
    h += `</div><div class="ir"><span class="dot" style="background:${f.color}"></span><span>${f.name}</span>${mine ? I.t('star', 'You', 'Your city.', '', true) : (VM.Diplo.allied(st, c.owner, me) ? I.t('handshake', 'Ally', 'Allies do not fight each other.', '', true) : '')}`
      + `${c.besieged ? I.t('swords', 'Under siege', 'Enemy armies are at the gates.', 'bad', true) : (c.contested ? I.t('alert', 'Contested', 'Enemy armies stand in its land and none of its own.', 'bad', true) : '')}</div>`;
    if (!mine && !VM.Fog.seesCity(st, me, c)) {                       // out of sight: only what was last seen
      const m = VM.Fog.memory(st, me, c.id);
      return h + `<div class="ir stats">${I.stat('pop', m ? num(m.pop) : '?', 'Population', TIPS.pop)}${I.stat('helmet', m ? num(m.troops) : '?', 'Garrison', TIPS.garrison)}</div><div class="ir">${I.t('eye', m ? 'Last seen day {0}'.replace('{0}', Math.floor(m.t)) : 'Never seen', 'Out of sight. Send an army or take a city nearby to see it.', '', true)}</div>`;
    }
    h += `<div class="ir stats">${I.stat('pop', `${num(c.pop)}<small class="dim">/${num(s.cap)}</small>`, 'Population', TIPS.pop)}`;
    if (wmax > 0) h += `<span class="st">${I.t('wall', 'Wall', TIPS.wall)}${I.meter(c.wallHp / wmax, 'wall')}<small class="dim">${num(c.wallHp)}</small></span>`;
    h += `${I.stat('helmet', num(VM.Eco.troopsOf(c.garrison)), 'Garrison', TIPS.garrison)}`;
    for (const k of Object.keys(VM.CFG.TROOPS)) if (c.garrison[k] >= 0.5) h += I.stat(M.troop[k], num(c.garrison[k]), VM.CFG.TROOPS[k].label, '', 'dim');
    h += `</div>`;
    if (!mine) {
      const hostile = VM.Diplo.hostile(st, me, c.owner), mineArmies = st.armies.filter(a => a.owner === me && !a.routed && VM.Armies.sizeOf(a) > 0 && !(a.at === c.id));
      if (hostile && mineArmies.length) {                                // what an attack by each of your armies would come to
        const VERD = { overwhelming: ['star', 'Overwhelming', 'good'], favourable: ['trend', 'Favourable', 'good'], even: ['swords', 'Even', ''], risky: ['alert', 'Risky', 'bad'], hopeless: ['skull', 'Hopeless', 'bad'] };
        mineArmies.sort((x, y) => VM.Armies.distance(st, VM.Armies.zoneOf(x), c.id) - VM.Armies.distance(st, VM.Armies.zoneOf(y), c.id));
        h += `<div class="sec">${I.t('swords', 'If attacked by', 'A forecast from the strengths on both sides: the attacker, the garrison and defending armies, the wall and enemy armies close by. The fight itself still has surprises.', '', true)}</div>`;
        for (const a of mineArmies.slice(0, 3)) {
          const f2 = VM.War.forecast(st, a, c), v = VERD[f2.verdict];
          h += `<div class="ir">${I.stat('helmet', num(VM.Armies.sizeOf(a)), st.officers[a.officer].name, '')}${I.t(v[0], v[1], 'Strength ratio {0}'.replace('{0}', f2.ratio.toFixed(1)) + (f2.help ? ' (relief armies counted)' : ''), v[2], true)}</div>`;
        }
      }
      return h + `<div class="ir">${here.length ? I.t('siege', 'Your army is here and will lay siege.', '', '', true) : I.t('info', 'Not yours', TIPS.siegeHere, '', true)}</div>`;
    }
    h += `<div class="ir stats">${I.stat('trend', s.prosperity.toFixed(2), 'Prosperity', TIPS.prosperity)}${I.stat('shield', s.security.toFixed(2), 'Security', TIPS.security)}`
      + `${I.stat('gold', sgn(s.gold - s.upkeep) + '<small class="dim">/d</small>', 'Gold', TIPS.gold)}`
      + `<span class="st" data-tip="${tipOf('Food', TIPS.food + '\n' + '{0} made, {1} eaten'.replace('{0}', num(s.foodProd)).replace('{1}', num(s.foodCons)))}">${I.svg('food')}<small class="sl">Food</small><b>${sgn(s.foodProd - s.foodCons)}</b><small class="dim">/d</small></span></div>`;
    h += `<div class="ir">${I.t('coins', 'Tax', TIPS.tax, '', true)}` + ['low', 'normal', 'high'].map((k, i) => `<button class="ibtn sm${c.tax === k ? ' on' : ''}" data-act="tax" data-city="${c.id}" data-tax="${k}" data-tip="${tipOf(TAXN[k], TIPS.tax)}">${I.svg('coins')}${I.pips(i + 1, 3)}${I.w(VM.CFG.TAX[k].label)}</button>`).join('') + `</div>`;
    const offs = st.officers.filter(o => o.owner === me && o.army === null);
    h += `<div class="ir">${I.t('crown', 'Governor', TIPS.governor, '', true)}<select id="govSel" data-city="${c.id}"><option value="">(none)</option>` + offs.map(o => `<option value="${o.id}"${c.governor === o.id ? ' selected' : ''}>${o.name} · ${o.politics}</option>`).join('') + `</select>`;
    if (c.governor !== null) { const g = st.officers[c.governor]; h += `${traitIcon(g.trait)}${loyal(g)}`; }
    h += `</div>`;
    if (c.governor !== null) h += `<div class="ir">` + VM.Officers.POLICIES.map(k => `<button class="ibtn sm${c.policy === k ? ' on' : ''}" data-act="policy" data-city="${c.id}" data-mode="${k}" data-tip="${tipOf(k[0].toUpperCase() + k.slice(1), POLICY_TIP[k])}">${I.svg(M.policy[k])}${I.w(k[0].toUpperCase() + k.slice(1))}</button>`).join('') + `</div>`;
    h += `<div class="sec">${I.t('house', 'Buildings', '', '', true)}</div><div class="ir">`;
    for (const k of Object.keys(VM.CFG.BUILD)) {
      const B = VM.CFG.BUILD[k], lvl = c.buildings[k], building = c.build && c.build.type === k;
      let act;
      if (building) act = `<span class="st dim" data-tip="${tipOf('Building…')}">${I.svg('clock')}<b>${Math.ceil(c.build.left)}</b></span>`;
      else if (lvl >= VM.CFG.MAX_BUILD_LEVEL) act = `<span class="st dim" data-tip="${tipOf('Highest level')}">${I.svg('star')}</span>`;
      else act = `<button class="ibtn sm" data-act="build" data-city="${c.id}" data-b="${k}" data-tip="${tipOf(B.label, costTip(lvl + 1, B.cost[lvl], B.days[lvl]))}"${c.build || fac.gold < B.cost[lvl] ? ' disabled' : ''}>${I.svg('plus')}${I.svg('gold')}<b>${B.cost[lvl]}</b></button>`;
      h += `<div class="tile">${I.t(M.build[k], B.label, '', '', true)}${I.pips(lvl, VM.CFG.MAX_BUILD_LEVEL)}${act}</div>`;
    }
    h += `</div><div class="sec">${I.t('crate', 'Forward depot', TIPS.depot, '', true)}</div><div class="ir">`;
    if (!c.depot) h += `<span class="dim">${I.t('crate', 'Not built', '', '', true)}</span><button class="ibtn sm" data-act="depot" data-city="${c.id}" data-tip="${tipOf('Build a depot')}"${fac.gold < VM.CFG.WAR.depotCost ? ' disabled' : ''}>${I.svg('plus')}${I.svg('gold')}<b>${VM.CFG.WAR.depotCost}</b></button>`;
    else h += `${I.stat('crate', num(c.depot.food), 'Stock', 'Food stored here.')}<span class="dim">${I.svg('go')}</span>${I.stat('food', num(c.depot.target), 'Target', 'The depot is filled up to this much food.')}${hbtn('minus', 'Lower the target by 500', { 'data-act': 'depotTarget', 'data-city': c.id, 'data-n': -500 })}${hbtn('plus', 'Raise the target by 500', { 'data-act': 'depotTarget', 'data-city': c.id, 'data-n': 500 })}`;
    h += `</div><div class="sec">${I.t('pop', 'Recruit', TIPS.recruit, '', true)}</div>`;
    for (const k of Object.keys(VM.CFG.TROOPS)) {
      const cost = VM.Eco.troopCost(c, k);
      h += `<div class="ir between"><span class="ir">${I.t(M.troop[k], VM.CFG.TROOPS[k].label, '{0} gold each'.replace('{0}', Math.round(cost)), '', true)}${I.stat('gold', Math.round(cost), 'Price', 'Gold for each soldier.', 'dim')}</span><span>` +
        [1, 5, 10].map(n => `<button class="ibtn sm" data-act="recruit" data-city="${c.id}" data-t="${k}" data-n="${n}" data-tip="${tipOf('Recruit {0}'.replace('{0}', n))}"><b>+${n}</b></button>`).join('') + `</span></div>`;
    }
    const free = st.officers.filter(o => o.owner === me && o.army === null && o.loc === c.id && c.governor !== o.id);
    h += `<div class="sec">${I.t('flag', 'Form an army', TIPS.form, '', true)}</div>`;
    if (!VM.Eco.troopsOf(c.garrison)) h += `<div class="ir dim">${I.t('helmet', 'No soldiers', 'Recruit troops to form an army from the garrison.', '', true)}</div>`;
    else if (!free.length) h += `<div class="ir dim">${I.t('crown', 'No free officer', 'No free officer in this city (the governor cannot lead an army).', '', true)}</div>`;
    else {
      const d = draftFor(c); let total = 0, speed = Infinity;
      for (const k of Object.keys(VM.CFG.TROOPS)) {
        const have = Math.floor(c.garrison[k] + 1e-9); if (have < 1) continue;
        const n = d.take[k] || 0; total += n; if (n > 0) speed = Math.min(speed, VM.CFG.TROOPS[k].speed);
        h += `<div class="ir between"><span class="ir">${I.t(M.troop[k], VM.CFG.TROOPS[k].label, '', '', true)}<small class="dim">${num(have)}</small></span><span class="nowrap">` +
          [-5, -1].map(x => `<button class="ibtn sm" data-act="draft" data-t="${k}" data-n="${x}"><b>${x < 0 ? '−' + (-x) : '+' + x}</b></button>`).join('') +
          `<input type="number" class="num" min="0" max="${have}" value="${n}" data-draft="${k}">` +
          [1, 5].map(x => `<button class="ibtn sm" data-act="draft" data-t="${k}" data-n="${x}"><b>+${x}</b></button>`).join('') +
          hbtn('all', 'All', { 'data-act': 'draftAll', 'data-t': k }, '', true) + `</span></div>`;
      }
      h += `<div class="ir stats">${I.stat('helmet', num(total), 'Taking', 'Soldiers that go with the army.')}${total > 0 ? I.stat('go', speed, 'Speed', 'The army moves at the speed of its slowest troops.', 'dim') : ''}${hbtn('all', 'Take all', { 'data-act': 'draftAll', 'data-t': '*' }, '', true)}${hbtn('none', 'Take none', { 'data-act': 'draftNone' }, '', true)}</div>`;
      h += `<div class="ir">${I.t('star', 'Leader', '', '', true)}<select id="formOfficer">` + free.map(o => `<option value="${o.id}">${o.name} · ${o.command}</option>`).join('') + `</select><button class="ibtn" data-act="form" data-city="${c.id}" data-tip="${tipOf('Form army')}"${total < 1 ? ' disabled' : ''}>${I.svg('flag')}${I.w('Form army')}</button></div>`;
    }
    return h;
  }

  function armyHTML(a) {
    const st = ui.state, o = st.officers[a.officer], f = st.factions[a.owner], mine = a.owner === st.player, N = st.map.nodes, n = VM.Armies.sizeOf(a);
    let h = `<div class="ph"><span class="dot" style="background:${f.color}"></span><b>${f.name}</b>${I.stat('helmet', num(n), 'Troops', 'Soldiers in the army.')}<span class="sub"></span>${detBtn()}${hbtn(ui.panelMin ? 'down' : 'up', 'Show or hide the details', { 'data-act': 'panelToggle' }, 'tog')}${hbtn('close', 'Close', { 'data-act': 'close' }, 'x')}</div>`;
    h += officerRow(o, f.color);
    h += `<div class="ir stats">` + Object.keys(VM.CFG.TROOPS).filter(k => a.troops[k] >= 0.5).map(k => I.stat(M.troop[k], num(a.troops[k]), VM.CFG.TROOPS[k].label)).join('') + `${I.stat('banner', Math.round(a.morale), 'Morale', TIPS.morale)}${I.meter(a.morale / 100)}</div>`;
    h += `<div class="ir">${I.t('pin', 'Location')}<span>${a.at !== null ? N[a.at].name : N[a.edge.to].name}</span>${a.at === null ? I.t('go', 'On the road', '', '', true) : ''}${a.dest !== null && !a.routed ? I.t('go', 'Heading to', '', '', true) + `<b>${N[a.dest].name}</b>` : ''}</div>`;
    if (a.routed) h += `<div class="ir bad">${I.t('back', 'Routed', 'Fleeing to safety.', '', true)}</div>`;
    else if (a.reserve) h += `<div class="ir">${I.t('shield', 'In reserve', 'The front is full: only the three biggest armies of a house fight at once. This army waits and steps in as the front thins.', '', true)}</div>`;
    else if (a.fighting.length) h += `<div class="ir bad">${I.t('swords', 'In battle', '', '', true)}` + a.fighting.map(id => { const e = st.armies.find(x => x.id === id); return e ? `<span class="st"><span class="dot" style="background:${st.factions[e.owner].color}"></span><b>${num(VM.Armies.sizeOf(e))}</b></span>` : ''; }).join('') + `</div>`;
    else if (VM.War.sieging(a) && VM.Diplo.hostile(st, a.owner, st.cities[a.at].owner)) h += `<div class="ir bad">${I.t('siege', 'Besieging', '', '', true)}<b>${N[a.at].name}</b></div>`;
    const s = a.supply;
    if (s) {
      const days = n > 0 ? a.rations / (n * VM.CFG.ECON.foodPerHead) : 0;
      h += `<div class="ir">${s.line === 'ok' ? `<span class="good">${I.t('link', 'Supply line open', TIPS.supply, '', true)}</span>` : `<span class="bad">${I.t('unlink', s.line === 'cut' ? 'Supply cut' : 'No supply source', TIPS.supply, '', true)}</span>`}`;
      if (s.depot != null) h += I.t('crate', 'Fed by a depot', N[s.depot].name, '', true);
      else if (s.foreign) h += I.stat('food', '×' + s.mult, 'Enemy land', 'The army eats more in enemy land.', 'warn');
      h += `${I.stat('bread', days.toFixed(1), 'Rations', TIPS.rations, s.starving ? 'bad' : '')}${I.t('house', 'Supplied from', N[a.home].name)}<span class="dim w">${N[a.home].name}</span></div>`;
    }
    if (!mine) return h;
    h += `<div class="ir">` + VM.Officers.ORDERS.map(k => `<button class="ibtn sm${a.order === k ? ' on' : ''}" data-act="order" data-army="${a.id}" data-mode="${k}" data-tip="${tipOf(k[0].toUpperCase() + k.slice(1), ORDER_TIP[k])}">${I.svg(M.order[k])}${I.w(k[0].toUpperCase() + k.slice(1))}</button>`).join('') + (a.rest ? I.t('zzz', 'Resting', '', '', true) : '') + `</div>`;
    const kind = VM.War.abilityOf(o), wait = Math.max(0, a.abilityReady - st.time);
    h += `<div class="ir"><button class="ibtn" data-act="ability" data-army="${a.id}" data-tip="${tipOf(ABILITY[kind], TIPS.ability)}"${wait > 0 || a.routed ? ' disabled' : ''}>${I.svg(M.ability[kind])}${I.w(ABILITY[kind])}</button>${wait > 0 ? I.stat('clock', Math.ceil(wait), 'Recharging', 'Days until it can be used again.', 'dim') : ''}</div>`;
    const home = a.at !== null && st.cities[a.at].owner === a.owner && !a.fighting.length && !a.routed ? st.cities[a.at] : null;
    if (home) {
      h += `<div class="sec">${I.t('house', N[home.id].name, TIPS.xfer, '', true)}</div>`;
      for (const k of Object.keys(VM.CFG.TROOPS)) {
        const inArmy = Math.floor((a.troops[k] || 0) + 1e-9), inCity = Math.floor(home.garrison[k] + 1e-9); if (inArmy < 1 && inCity < 1) continue;
        h += `<div class="ir between"><span class="ir">${I.t(M.troop[k], VM.CFG.TROOPS[k].label, '', '', true)}${I.stat('flag', num(inArmy), 'In the army')}${I.stat('house', num(inCity), 'In the city')}</span><span class="nowrap">` +
          [-5, -1, 1, 5].map(x => `<button class="ibtn sm" data-act="xfer" data-army="${a.id}" data-t="${k}" data-n="${x}"${(x < 0 ? inArmy : inCity) < 1 ? ' disabled' : ''}><b>${x < 0 ? '−' + (-x) : '+' + x}</b></button>`).join('') + `</span></div>`;
      }
      const mates = st.armies.filter(x => x.owner === a.owner && x.id !== a.id && x.at === a.at && !x.fighting.length && !x.routed);
      if (mates.length) h += `<div class="ir">${I.t('merge', 'Join with', '', '', true)}<select id="mergeWith"><option value="">(choose)</option>` + mates.map(x => `<option value="${x.id}">${st.officers[x.officer].name} · ${num(VM.Armies.sizeOf(x))}</option>`).join('') + `</select>${hbtn('merge', 'Merge', { 'data-act': 'merge', 'data-army': a.id }, '', true)}</div>`;
    }
    h += `<div class="ir">${hbtn('stop', 'Halt', { 'data-act': 'stop', 'data-army': a.id }, '', true)}`
      + `<button class="ibtn sm" data-act="disband" data-army="${a.id}" data-tip="${tipOf('Disband into city')}"${a.at === null || st.cities[a.at].owner !== a.owner || a.fighting.length ? ' disabled' : ''}>${I.svg('disband')}${I.w('Disband into city')}</button>${I.t('info', 'Orders', TIPS.armyHelp)}</div>`;
    return h;
  }

  function update() {
    const st = ui.state, me = st.factions[st.player], d = VM.Sim.date(st);
    $('fname').textContent = me.name; $('fdot').style.background = me.color;
    $('gold').innerHTML = `${I.svg('gold')} ${num(me.gold)} <small class="${me.income.gold < 0 ? 'bad' : 'good'}">${sgn(me.income.gold)}/d</small>`;
    $('food').innerHTML = `${I.svg('food')} ${num(me.food)} <small class="${me.income.food < 0 ? 'bad' : 'good'}">${sgn(me.income.food)}/d</small>${me.starving ? ' ' + I.svg('alert', 'bad') : ''}`;
    const ds = `${I.svg('calendar')} Y${d.year} · M${d.month} · D${d.day}`; if ($('date').innerHTML !== ds) { $('date').innerHTML = ds; $('date').setAttribute('data-tip', `Date\nYear ${d.year} · Month ${d.month} · Day ${d.day}\nOne year has 360 days. Use the speed buttons to run time faster.`); }
    document.querySelectorAll('#speed button[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === '0' ? ui.speed === 0 : ui.speed > 0));
    let h = '';
    const army = ui.selectedArmy !== null ? st.armies.find(a => a.id === ui.selectedArmy) : null;
    if (ui.selectedArmy !== null && !army) ui.selectedArmy = null;
    if (army) h = armyHTML(army); else if (ui.selectedCity >= 0) h = cityHTML(st.cities[ui.selectedCity]);
    panel.classList.toggle('open', !!h); panel.classList.toggle('min', !!ui.panelMin);
    if (h !== lastHTML && !(document.activeElement && panel.contains(document.activeElement) && (document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'INPUT') && h && lastHTML)) { panel.innerHTML = h; lastHTML = h; }
  }

  return { init, update, toast, T, info, TIPS, traitSpan, traitIcon, stats4, loyal, esc, TRAIT_TIP };
})();
