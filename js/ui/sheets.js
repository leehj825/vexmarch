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
      case 'mute': VM.Audio.toggleMute(); lastHTML = ''; break;
      case 'lang': VM.I18N.set(d.l); lastHTML = ''; break;
      case 'size': VM.UIPrefs.set('size', d.v); lastHTML = ''; break;
      case 'tutorial': VM.Tutorial.finish(false); ui.sheet = null; VM.Title.startTutorial(); break;
      case 'delsave': try { localStorage.removeItem('vexmarch.save'); VM.Panels.toast('Saved game deleted'); } catch (e) { /* ignore */ } break;
      case 'answer': { const r = cmd({ type: 'answerProposal', proposal: +d.p, accept: d.yes === '1' }); if (r.ok && d.yes === '1') VM.Panels.toast('Approved'); break; }
    }
  }

  function statusOf(o) {
    const st = ui.state, N = st.map.nodes;
    if (o.travel) return `travelling to ${N[o.travel.to].name} (${Math.ceil(o.travel.arrive - st.time)}d)`;
    if (o.searching) return `searching near ${N[o.searching.city].name} (${Math.ceil(o.searching.until - st.time)}d)`;
    if (o.role === 'governor') { const c = st.cities.find(x => x.governor === o.id); return c ? `governs ${N[c.id].name}` : 'governor'; }
    if (o.role === 'commander') { const a = st.armies.find(x => x.id === o.army); return a ? `leads an army (${num(VM.Armies.sizeOf(a))})` : 'commander'; }
    return `idle in ${N[o.loc].name}`;
  }

  function officersHTML() {
    const st = ui.state, me = st.player, fac = st.factions[me], N = st.map.nodes;
    let h = `<div class="ph"><b>Officers</b><span class="sub">${fac.name}</span><button data-act="sheetClose" class="x">✕</button></div>`;
    const mine = st.officers.filter(o => o.owner === me);
    const cities = st.cities.filter(c => c.owner === me);
    for (const o of mine) {
      const busy = o.role !== 'idle' || o.travel || o.searching, since = st.time - o.gift;
      h += `<div class="card2"><div class="row between"><b>${o.name}</b><span class="dim">${o.trait}</span></div>`;
      h += `<div class="row dim">Cmd ${o.command} · Might ${o.might} · Pol ${o.politics} · Int ${o.intellect} · ${VM.War.abilityOf(o)}</div>`;
      h += `<div class="row">Loyalty <b>${Math.round(o.loyalty)}</b>${bar(o.loyalty / 100, o.loyalty < VM.CFG.OFFICERS.warnBelow ? 'low' : '')}</div>`;
      h += `<div class="row dim">${statusOf(o)}</div><div class="row">`;
      h += `<button data-act="gift" data-o="${o.id}" class="btn sm"${since < VM.CFG.OFFICERS.giftCooldown || fac.gold < VM.CFG.OFFICERS.giftCost ? ' disabled' : ''}>Gift ${VM.CFG.OFFICERS.giftCost}g</button> `;
      if (o.role === 'idle' && !o.travel && !o.searching && o.army === null) {
        h += `<button data-act="search" data-o="${o.id}" class="btn sm"${fac.gold < VM.CFG.OFFICERS.searchCost || st.cities[o.loc].owner !== me ? ' disabled' : ''}>Search ${VM.CFG.OFFICERS.searchCost}g</button> `;
        h += `<select id="send-${o.id}"><option value="">Send to…</option>` + cities.filter(c => c.id !== o.loc).map(c => `<option value="${c.id}">${N[c.id].name}</option>`).join('') + `</select> <button data-act="send" data-o="${o.id}" class="btn sm">Go</button>`;
      }
      h += `</div></div>`;
    }
    const w = VM.Officers.wanderersFor(st, me);
    h += `<div class="sec">Wandering officers you know of</div>`;
    if (!w.length) h += `<div class="row dim">None right now. Wanderers drift between nodes; send an idle officer to search a city to find more.</div>`;
    for (const o of w) h += `<div class="card2"><div class="row between"><b>${o.name}</b><span class="dim">${o.trait} · near ${N[o.loc].name}</span></div><div class="row dim">Cmd ${o.command} · Might ${o.might} · Pol ${o.politics} · Int ${o.intellect}</div><div class="row"><button data-act="recruitO" data-o="${o.id}" class="btn sm"${fac.gold < VM.Officers.recruitCost(o) ? ' disabled' : ''}>Recruit ${VM.Officers.recruitCost(o)}g</button> <button data-act="center" data-loc="${o.loc}" class="btn sm">Show</button> <span class="dim">Your best Politics sets the odds.</span></div></div>`;
    return h;
  }

  function alertsHTML() {
    const st = ui.state;
    let h = `<div class="ph"><b>Alerts</b><span class="sub">newest first</span><button data-act="sheetClose" class="x">✕</button></div>`;
    h += `<div class="row dim">Pause the game automatically for:</div>`;
    const S = VM.Alerts.settings();
    for (const k in VM.Alerts.CATS) h += `<label class="chk"><input type="checkbox" data-pause="${k}"${S.pause[k] ? ' checked' : ''}> ${VM.Alerts.CATS[k].label}</label>`;
    if (st.proposals.length) {
      h += `<div class="sec">Waiting for your answer</div>`;
      for (const p of st.proposals) h += `<div class="card2"><div class="row">${VM.Alerts.proposalText(st, p)}</div><div class="row dim">Expires in ${Math.ceil(p.expires - st.time)} days</div><div class="row"><button data-act="answer" data-p="${p.id}" data-yes="1" class="btn">Approve</button> <button data-act="answer" data-p="${p.id}" data-yes="0" class="btn">Decline</button> <button data-act="center" data-loc="${p.type === 'attack' ? p.target : p.city}" class="btn sm">Show</button></div></div>`;
    }
    h += `<div class="sec">Recent</div>`;
    const items = VM.Alerts.items();
    if (!items.length) h += `<div class="row dim">Nothing yet.</div>`;
    for (const a of items) h += `<div class="alert${a.urgent ? ' urgent' : ''}"><span class="when">D${Math.floor(a.t)}</span> ${a.text}${a.loc !== null ? ` <button data-act="center" data-loc="${a.loc}" class="btn sm">Show</button>` : ''}</div>`;
    return h;
  }

  function settingsHTML() {
    const A = VM.Audio, vol = (k, label) => `<div class="row between"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(A.get(k) * 100)}" data-vol="${k}"></div>`;
    let h = `<div class="ph"><b>Settings</b><span class="sub">Vexmarch</span><button data-act="sheetClose" class="x">✕</button></div>`;
    h += vol('master', 'Master volume') + vol('music', 'Music') + vol('sfx', 'Effects');
    h += `<div class="row"><button data-act="mute" class="chip${A.get('mute') ? ' on' : ''}">${A.get('mute') ? 'Sound off' : 'Sound on'}</button></div>`;
    h += `<div class="sec">Language</div><div class="row">` + VM.I18N.NAMES.map(([l, n]) => `<button data-act="lang" data-l="${l}" class="chip${VM.I18N.lang === l ? ' on' : ''}" translate="no">${n}</button>`).join('') + `</div>`;
    h += `<div class="sec">Text size</div><div class="row">` + [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']].map(([v, n]) => `<button data-act="size" data-v="${v}" class="chip${VM.UIPrefs.get('size') === v ? ' on' : ''}">${n}</button>`).join('') + `</div>`;
    h += `<div class="sec">Help</div><div class="row"><button data-act="tutorial" class="btn">Replay the tutorial</button></div>`;
    h += `<div class="row"><button data-act="delsave" class="btn">Delete saved game</button></div>`;
    h += `<div class="row dim">Pausing for alerts is chosen in the Alerts list.</div>`;
    return h;
  }

  function update() {
    const st = ui.state, n = VM.Alerts.unread() + st.proposals.length;
    const ab = $('alertBtn'); ab.textContent = n ? 'Alerts ' + n : 'Alerts'; ab.classList.toggle('hot', n > 0);
    $('offBtn').classList.toggle('on', ui.sheet === 'officers'); ab.classList.toggle('on', ui.sheet === 'alerts'); $('setBtn').classList.toggle('on', ui.sheet === 'settings');
    box.classList.toggle('open', !!ui.sheet);
    if (!ui.sheet) { lastHTML = ''; return; }
    if (ui.sheet === 'alerts') VM.Alerts.read();
    const h = ui.sheet === 'officers' ? officersHTML() : (ui.sheet === 'settings' ? settingsHTML() : alertsHTML());
    const typing = document.activeElement && box.contains(document.activeElement) && (document.activeElement.tagName === 'SELECT' || document.activeElement.type === 'range');
    if (h !== lastHTML && !typing) { box.innerHTML = h; lastHTML = h; }
  }

  return { init, update };
})();
