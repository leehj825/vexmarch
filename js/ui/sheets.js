// Side sheets: the officers roster (with wanderers to recruit) and the alerts feed (with proposals to answer and auto-pause settings).
var VM = globalThis.VM = globalThis.VM || {};

VM.Sheets = (function () {
  let ui, box, lastHTML = '';
  const $ = id => document.getElementById(id);
  const num = v => Math.round(v).toLocaleString('en-US');
  const bar = (frac, cls) => `<div class="bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(0)}%"></i></div>`;

  function init(uiRef) {
    ui = uiRef; box = $('sheet');
    box.addEventListener('click', onClick);
    box.addEventListener('change', e => { if (e.target.dataset.pause) VM.Alerts.setPause(e.target.dataset.pause, e.target.checked); });
    $('offBtn').addEventListener('click', () => toggle('officers'));
    $('idleBtn').addEventListener('click', () => {                          // jump to the next army with no orders
      const st = ui.state, list = VM.Armies.idleOf(st, st.player).sort((a, b) => a.id - b.id); if (!list.length) { VM.Panels.toast('Every army has orders'); return; }
      const next = list.find(a => a.id > (ui.idleLast || 0)) || list[0]; ui.idleLast = next.id;
      ui.selectedCity = -1; ui.selectedArmy = next.id; ui.sheet = null; ui.centerOn(next.at);
    });
    $('dipBtn').addEventListener('click', () => toggle('diplo'));
    $('alertBtn').addEventListener('click', () => toggle('alerts'));
    $('setBtn').addEventListener('click', () => toggle('settings'));
    box.addEventListener('input', e => { const k = e.target.dataset.vol; if (k) { VM.Audio.set(k, +e.target.value / 100); } });
  }

  function toggle(which) { ui.sheet = ui.sheet === which ? null : which; if (ui.sheet === 'alerts') VM.Alerts.read(); lastHTML = ''; VM.Audio.play('click'); }

  function cmd(c) {
    c.faction = ui.state.player;
    const r = VM.Commands.exec(ui.state, c);
    if (!r.ok) { VM.Panels.toast(r.reason.charAt(0).toUpperCase() + r.reason.slice(1)); VM.Audio.play('error'); }
    else VM.Audio.play('coin');
    lastHTML = ''; return r;
  }

  const STAT = (label, tip) => VM.Panels.T(label, tip);
  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const d = b.dataset;
    switch (d.act) {
      case 'sheetClose': ui.sheet = null; lastHTML = ''; break;
      case 'gift': cmd({ type: 'giftOfficer', officer: +d.o }); break;
      case 'search': { const r = cmd({ type: 'searchOfficers', officer: +d.o }); if (r.ok) VM.Panels.toast('Searching for wandering officers…'); break; }
      case 'send': { const sel = $('send-' + d.o); if (!sel || sel.value === '') { VM.Panels.toast('Choose a city first'); break; } const r = cmd({ type: 'sendOfficer', officer: +d.o, to: +sel.value }); if (r.ok) VM.Panels.toast(`On the road: ${r.days} days`); break; }
      case 'recruitO': { const r = cmd({ type: 'recruitOfficer', officer: +d.o }); if (r.ok) VM.Panels.toast(r.joined ? 'They accepted your offer!' : 'They refused and moved on'); break; }
      case 'center': ui.centerOn(+d.loc); break;
      case 'detailsToggle': VM.UIPrefs.set('det', !VM.UIPrefs.get('det')); lastHTML = ''; break;
      case 'uimode': VM.UIPrefs.set('ui', d.v); lastHTML = ''; break;
      case 'pauseToggle': VM.Alerts.setPause(d.k, !VM.Alerts.settings().pause[d.k]); lastHTML = ''; break;
      case 'mute': VM.Audio.toggleMute(); lastHTML = ''; break;
      case 'lang': VM.I18N.set(d.l); lastHTML = ''; break;
      case 'size': VM.UIPrefs.set('size', d.v); lastHTML = ''; break;
      case 'map3d': VM.UIPrefs.set('map3d', d.v); lastHTML = ''; break;
      case 'tutorial': VM.Tutorial.finish(false); ui.sheet = null; VM.Title.startTutorial(); break;
      case 'delsave': try { localStorage.removeItem('vexmarch.save'); VM.Panels.toast('Saved game deleted'); } catch (e) { /* ignore */ } break;
      case 'dAlly': case 'dGift': case 'dMerge': case 'dBreak': case 'dBreakNo': case 'dBreakYes': case 'dAnswer': VM.DiploUI.act(d, cmd); lastHTML = ''; break;
      case 'answer': { const r = cmd({ type: 'answerProposal', proposal: +d.p, accept: d.yes === '1' }); if (r.ok && d.yes === '1') VM.Panels.toast('Approved'); break; }
    }
  }

  function statusOf(o) {
    const st = ui.state, N = st.map.nodes;
    if (o.travel) return `travelling to ${N[o.travel.to].name} (${Math.ceil(o.travel.arrive - st.time)}d)`;
    if (o.searching) return `searching near ${N[o.searching.city].name} (${Math.ceil(o.searching.until - st.time)}d)`;
    if (o.role === 'hostage') return `held as a hostage by ${st.factions[o.hostage].name}`;
    if (o.role === 'governor') { const c = st.cities.find(x => x.governor === o.id); return c ? `governs ${N[c.id].name}` : 'governor'; }
    if (o.role === 'commander') { const a = st.armies.find(x => x.id === o.army); return a ? `leads an army (${num(VM.Armies.sizeOf(a))})` : 'commander'; }
    return `idle in ${N[o.loc].name}`;
  }

  function officersHTML() {
    const st = ui.state, me = st.player, fac = st.factions[me], N = st.map.nodes, I = VM.Icons, M = I.MAP, P = VM.Panels, esc = I.esc;
    let h = `<div class="ph">${I.t('pop', 'Officers', '', '', true)}<span class="dot" style="background:${fac.color}"></span><b>${fac.name}</b><span class="sub"></span>${I.btn('list', 'Details', { 'data-act': 'detailsToggle' }, 'sm' + (VM.UIPrefs.get('det') ? ' on' : ''))}${I.btn('close', 'Close', { 'data-act': 'sheetClose' }, 'sm x')}</div>`;
    const mine = st.officers.filter(o => o.owner === me);
    const cities = st.cities.filter(c => c.owner === me), C = VM.CFG.OFFICERS;
    for (const o of mine) {
      const since = st.time - o.gift, info = VM.Story && st.story ? VM.Story.officerInfo(o) : null;
      let story = '';
      if (info) {
        story = `${o.name}\n${VM.Story.tx(info.role)}. ${VM.Story.tx(info.bio)}`;
        const ties = VM.Story.tiesView(st, o); if (ties.length) story += '\n' + ties.map(t => `${VM.Story.tx(t.label)}: ${VM.Story.tx(t.who)}`).join(' · ');
      }
      const role = o.travel ? 'go' : o.searching ? 'search' : (M.role[o.role] || 'zzz');
      h += `<div class="card2"><div class="ir"><span class="icw"${story ? ` data-tip="${esc(story)}"` : ''}>${I.portrait(o.name, fac.color, 38)}</span><b>${o.name}</b>${P.traitIcon(o.trait)}${story ? I.t('info', 'Story', story.split('\n').slice(1).join('\n')) : ''}</div><div class="ir">${I.t(role, statusOf(o), '', '', true)}</div>`;
      h += `<div class="ir stats">${P.stats4(o)}${P.loyal(o)}</div><div class="ir">`;
      h += `<button class="ibtn sm" data-act="gift" data-o="${o.id}" data-tip="${esc('Gift\nA gift raises their loyalty.')}"${since < C.giftCooldown || fac.gold < C.giftCost ? ' disabled' : ''}>${I.svg('gift')}${I.w('Gift')}${I.svg('gold')}<b>${C.giftCost}</b></button>`;
      if (o.role === 'idle' && !o.travel && !o.searching && o.army === null) {
        h += `<button class="ibtn sm" data-act="search" data-o="${o.id}" data-tip="${esc('Search\nLook for wandering officers near this city.')}"${fac.gold < C.searchCost || st.cities[o.loc].owner !== me ? ' disabled' : ''}>${I.svg('search')}${I.w('Search')}${I.svg('gold')}<b>${C.searchCost}</b></button>`;
        h += `${I.t('go', 'Send to', '', '', true)}<select id="send-${o.id}"><option value="">…</option>` + cities.filter(c => c.id !== o.loc).map(c => `<option value="${c.id}">${N[c.id].name}</option>`).join('') + `</select>${I.btn('go', 'Go', { 'data-act': 'send', 'data-o': o.id }, 'sm', undefined, true)}`;
      }
      h += `</div></div>`;
    }
    const w = VM.Officers.wanderersFor(st, me);
    h += `<div class="sec">${I.t('search', 'Wandering officers you know of', 'Wanderers drift between nodes; send an idle officer to search a city to find more.', '', true)}</div>`;
    for (const o of w) h += `<div class="card2"><div class="ir">${I.portrait(o.name, '#888', 34)}<b>${o.name}</b>${P.traitIcon(o.trait)}${I.t('pin', 'Near', N[o.loc].name)}<span class="dim">${N[o.loc].name}</span></div><div class="ir stats">${P.stats4(o)}<button class="ibtn sm" data-act="recruitO" data-o="${o.id}" data-tip="${esc('Recruit\nOffer them a place.')}"${fac.gold < VM.Officers.recruitCost(o) ? ' disabled' : ''}>${I.svg('plus')}${I.w('Recruit')}${I.svg('gold')}<b>${VM.Officers.recruitCost(o)}</b></button></div></div>`;
    return h;
  }

  function alertsHTML() {
    const st = ui.state, I = VM.Icons, M = I.MAP, esc = I.esc;
    let h = `<div class="ph">${I.t('bell', 'Alerts', '', '', true)}<span class="sub"></span>${I.btn('close', 'Close', { 'data-act': 'sheetClose' }, 'sm x')}</div>`;
    const S = VM.Alerts.settings();
    h += `<div class="ir">${I.t('stop', 'Pause the game automatically for', '', '', true)}` + Object.keys(VM.Alerts.CATS).map(k => `<button class="ibtn sm${S.pause[k] ? ' on' : ''}" data-act="pauseToggle" data-k="${k}" data-tip="${esc(VM.Alerts.CATS[k].label + '\nPause the game when this happens.')}">${I.svg(M.alert[k] || 'info')}</button>`).join('') + `</div>`;
    if (st.proposals.length) {
      h += `<div class="sec">${I.t('ask', 'Waiting for your answer', '', '', true)}</div>`;
      for (const p of st.proposals) {
        const o = st.officers[p.officer], N = st.map.nodes, att = p.type === 'attack', tgt = att ? p.target : p.city;
        h += `<div class="card2"><div class="ir" data-tip="${esc(VM.Alerts.proposalText(st, p))}">${I.portrait(o.name, '#888', 28)}<b>${o.name}</b>${I.svg(att ? 'swords' : 'wall')}<span class="w">${att ? 'asks to attack' : 'asks to build a wall in'}</span><b>${N[tgt].name}</b>${att ? I.stat('helmet', Math.round(VM.Eco.troopsOf(st.cities[tgt].garrison)), 'Garrison') : I.stat('gold', p.cost, 'Cost')}${I.stat('clock', Math.ceil(p.expires - st.time), 'Expires in days', 'Days left to answer.', 'dim')}</div>`
          + `<div class="ir">${I.btn('all', 'Approve', { 'data-act': 'answer', 'data-p': p.id, 'data-yes': '1' }, 'sm', undefined, true)}${I.btn('none', 'Refuse', { 'data-act': 'answer', 'data-p': p.id, 'data-yes': '0' }, 'sm', undefined, true)}</div></div>`;
      }
    }
    h += `<div class="sec">${I.t('calendar', 'Recent', 'Newest first. Hold an item to read it.', '', true)}</div>`;
    const items = VM.Alerts.items();
    if (!items.length) h += `<div class="ir dim">${I.svg('info')}</div>`;
    for (const a of items) h += `<div class="alert ir${a.urgent ? ' urgent' : ''}" data-tip="${esc(a.text)}"><span class="st dim">${I.svg('calendar')}<b>${Math.floor(a.t)}</b></span>${I.svg(M.event[a.type] || M.alert[a.cat] || 'info', a.urgent ? 'bad' : '')}<span class="w">${a.text}</span><span class="ws">${a.short || ''}</span>${a.loc !== null ? I.btn('pin', 'Show on the map', { 'data-act': 'center', 'data-loc': a.loc }, 'sm') : ''}</div>`;
    return h;
  }

  function settingsHTML() {
    const A = VM.Audio, vol = (k, label) => `<div class="row between"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(A.get(k) * 100)}" data-vol="${k}"></div>`;
    let h = `<div class="ph"><b>Settings</b><span class="sub">Vexmarch</span><button data-act="sheetClose" class="x">✕</button></div>`;
    h += vol('master', 'Master volume') + vol('music', 'Music') + vol('sfx', 'Effects');
    h += `<div class="row"><button data-act="mute" class="chip${A.get('mute') ? ' on' : ''}">${A.get('mute') ? 'Sound off' : 'Sound on'}</button></div>`;
    h += `<div class="sec">Language</div><div class="row">` + VM.I18N.NAMES.map(([l, n]) => `<button data-act="lang" data-l="${l}" class="chip${VM.I18N.lang === l ? ' on' : ''}" translate="no">${n}</button>`).join('') + `</div>`;
    h += `<div class="sec">Text size</div><div class="row">` + [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']].map(([v, n]) => `<button data-act="size" data-v="${v}" class="chip${VM.UIPrefs.get('size') === v ? ' on' : ''}">${n}</button>`).join('') + `</div>`;
    h += `<div class="sec">Interface</div><div class="row">` + [['icons', 'Icons only'], ['mixed', 'Icons and words'], ['text', 'Words and labels']].map(([v, n]) => `<button data-act="uimode" data-v="${v}" class="chip${(VM.UIPrefs.get('ui') || 'mixed') === v ? ' on' : ''}">${n}</button>`).join('') + `</div>`;
    h += `<div class="sec">Map</div><div class="row">` + [['on', '3D terrain'], ['off', 'Flat map']].map(([v, n]) => `<button data-act="map3d" data-v="${v}" class="chip${(VM.UIPrefs.get('map3d') || 'on') === v ? ' on' : ''}">${n}</button>`).join('') + `</div><div class="row dim">The map style changes the next time the game starts.</div>`;
    h += `<div class="sec">Help</div><div class="row"><button data-act="tutorial" class="btn">Replay the tutorial</button></div>`;
    h += `<div class="row"><button data-act="delsave" class="btn">Delete saved game</button></div>`;
    h += `<div class="row dim">Pausing for alerts is chosen in the Alerts list.</div>`;
    return h;
  }

  function update() {
    const st = ui.state, n = VM.Alerts.unread() + st.proposals.length;
    const db = $('dipBtn'), dn = VM.DiploUI.pending(), badge = c => c ? `<i class="badge">${c}</i>` : '';
    const dh = VM.Icons.svg('handshake') + VM.Icons.w('Diplomacy', 'tbw') + badge(dn); if (db.dataset.h !== dh) { db.dataset.h = dh; db.innerHTML = dh; } db.classList.toggle('hot', dn > 0); db.classList.toggle('on', ui.sheet === 'diplo');
    const ab = $('alertBtn'), ah = VM.Icons.svg('bell') + VM.Icons.w('Alerts', 'tbw') + badge(n); if (ab.dataset.h !== ah) { ab.dataset.h = ah; ab.innerHTML = ah; } ab.classList.toggle('hot', n > 0);
    const ib = $('idleBtn'), idn = VM.Armies.idleOf(st, st.player).length, ih = VM.Icons.svg('flag') + VM.Icons.w('Idle', 'tbw') + badge(idn); if (ib.dataset.h !== ih) { ib.dataset.h = ih; ib.innerHTML = ih; } ib.classList.toggle('hot', idn > 0);
    const oh = VM.Icons.svg('pop') + VM.Icons.w('Officers', 'tbw'); if ($('offBtn').dataset.h !== oh) { $('offBtn').dataset.h = oh; $('offBtn').innerHTML = oh; }
    $('offBtn').classList.toggle('on', ui.sheet === 'officers'); ab.classList.toggle('on', ui.sheet === 'alerts'); $('setBtn').classList.toggle('on', ui.sheet === 'settings');
    box.classList.toggle('open', !!ui.sheet);
    if (!ui.sheet) { lastHTML = ''; return; }
    if (ui.sheet === 'alerts') VM.Alerts.read();
    const h = ui.sheet === 'officers' ? officersHTML() : ui.sheet === 'diplo' ? VM.DiploUI.html() : (ui.sheet === 'settings' ? settingsHTML() : alertsHTML());
    const typing = document.activeElement && box.contains(document.activeElement) && (document.activeElement.tagName === 'SELECT' || document.activeElement.type === 'range');
    if (h !== lastHTML && !typing) { box.innerHTML = h; lastHTML = h; }
  }

  return { init, update };
})();
