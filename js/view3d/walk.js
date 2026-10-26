// Walk mode: step into a city of your own and walk its streets as your ruler. The game clock is paused while you walk, so nothing here costs you anything.
// You can meet the officers who are in the city and the townsfolk, talk, and give a gift. WASD / arrows move (Shift runs), Q and E (or dragging) turn the
// view, F or Enter talks, Esc leaves; on a phone use the thumb stick and drag to look.
//   VM.Walk.init(ui);  VM.Walk.start();  VM.Walk.stop();
// Pure logic (collisions, the pick of who is near) is separate from the DOM so the tests can drive it in Node: VM.Walk.logic.
var VM = globalThis.VM = globalThis.VM || {};
VM.Walk = (function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const R_AVATAR = 0.5, TALK_RANGE = 3.4, SPEED = 4.6, RUN = 8;

  // ---------- pure logic ----------
  // The things you cannot walk through: circles. Taken from the same layout the city is drawn from.
  function colliders(L) {
    const c = [{ x: 0, z: 0, r: 6.2, name: 'keep' }];
    for (const h of L.houses) c.push({ x: h.x, z: h.z, r: Math.max(h.w, h.d) * 0.5 + 0.35, name: 'house' });
    for (const h of L.suburb || []) c.push({ x: h.x, z: h.z, r: Math.max(h.w, h.d) * 0.5 + 0.3, name: 'house' });
    for (const s of L.stalls) c.push({ x: s.x, z: s.z, r: 1.2, name: 'market' });
    c.push({ x: L.barracks.x, z: L.barracks.z, r: 3.2, name: 'barracks' });
    c.push({ x: L.temple.x, z: L.temple.z, r: 2.4, name: 'temple' });
    if (L.depot) c.push({ x: L.depot.x, z: L.depot.z, r: 1.9, name: 'depot' });
    if (L.smith && L.smith.on) c.push({ x: L.smith.x, z: L.smith.z, r: L.radius < 20 ? 2 : 2.9, name: 'smith' });
    c.push({ x: L.well.x, z: L.well.z, r: 1.4, name: 'well' });
    if (L.monument) c.push({ x: L.monument.x, z: L.monument.z, r: 1.6, name: 'monument' });
    return c;
  }
  // Move (x, z) by (dx, dz): stay inside the walls and slide round the circles
  function move(p, dx, dz, L, cols) {
    let x = p.x + dx, z = p.z + dz;
    const lim = L.radius - 1.3, d = Math.hypot(x, z); if (d > lim) { x *= lim / d; z *= lim / d; }
    for (let pass = 0; pass < 2; pass++) for (const o of cols) {
      const ox = x - o.x, oz = z - o.z, dd = Math.hypot(ox, oz), min = o.r + R_AVATAR;
      if (dd < min) { const k = dd < 1e-4 ? 1 : min / dd; x = o.x + (dd < 1e-4 ? min : ox * k); z = o.z + (dd < 1e-4 ? 0 : oz * k); }
    }
    p.x = x; p.z = z; return p;
  }
  // the nearest thing to talk to or look at: an officer or townsperson first, then a building
  function nearest(p, npcs, cols) {
    let best = null, bd = TALK_RANGE;
    for (const n of npcs) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = { kind: n.officer !== undefined ? 'officer' : 'folk', npc: n, d }; } }
    if (best) return best;
    bd = 1.8;
    for (const o of cols) { if (o.name === 'house') continue; const d = Math.hypot(o.x - p.x, o.z - p.z) - o.r; if (d < bd) { bd = d; best = { kind: 'place', place: o.name, d }; } }
    return best;
  }
  const LINES = {
    Rash: 'Say the word and I will ride out at dawn. Waiting is for old men.',
    Cautious: 'Let us count the grain and the spears before we count the glory.',
    Loyal: 'My house is yours. Ask, and it is done.',
    Greedy: 'A full treasury keeps an army faithful. Not that I am thinking of my own purse.',
    Brave: 'I have never turned my back on a wall, and I do not mean to begin now.',
    Schemer: 'Some doors open better when no one hears the hinge.',
    none: 'The city is quiet. I hope it stays so.'
  };
  const FOLK = ['The harvest looks good this year.', 'They say the enemy is gathering beyond the hills.', 'Taxes are heavy, but the walls are strong.', 'My son joined the guard last spring.', 'Is it true the ruler walks among us?', 'Peace is a fine thing. May it last.', 'The market was busy today.'];
  const PLACE = {
    barracks: c => `The barracks. {0} soldiers are quartered in the city.`.replace('{0}', Math.floor(Object.values(c.garrison).reduce((a, b) => a + b, 0))),
    market: c => 'The market stalls. Trade here is at level {0}.'.replace('{0}', c.buildings.market),
    temple: c => 'The temple. Its level is {0}; the faithful are calm.'.replace('{0}', c.buildings.temple),
    depot: () => 'The supply depot, where grain is stored for the army.',
    smith: () => 'The smithy rings with hammers.',
    well: () => 'The town well. The water is cold and sweet.',
    monument: () => 'A monument to the city\'s past glory.',
    keep: c => 'The keep. {0} people live under its walls.'.replace('{0}', Math.round(c.pop))
  };
  const lineFor = o => LINES[o.trait] || LINES.none;
  const logic = { colliders, move, nearest, lineFor, LINES, FOLK, PLACE, TALK_RANGE };

  // ---------- the live mode ----------
  let ui = null, on = false, S = null, dom = null;
  const keys = {};
  function el(tag, id, cls, html) { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }

  function init(u) {
    ui = u; if (dom) return;
    dom = {
      root: el('div', 'walkUI'), labels: el('div', 'walkLabels'),
      stop: el('button', 'walkStop', 'btn', '■ Stop walking'), act: el('button', 'walkAct', 'btn', ''), hint: el('div', 'walkHint', '', ''),
      joy: el('div', 'joy', '', '<i></i>'), talk: el('div', 'talk')
    };
    dom.root.append(dom.labels, dom.stop, dom.act, dom.hint, dom.joy, dom.talk); document.body.appendChild(dom.root);
    dom.stop.addEventListener('click', stop); dom.act.addEventListener('click', interact);
    dom.talk.addEventListener('click', e => {
      const a = e.target.dataset.act;
      if (a === 'talkClose') closeTalk();
      else if (a === 'talkGift') { const r = VM.Commands.exec(ui.state, { type: 'giftOfficer', officer: +e.target.dataset.o, faction: ui.state.player }); VM.Panels.toast(r.ok ? 'A gift is given' : r.reason.charAt(0).toUpperCase() + r.reason.slice(1)); VM.Audio.play(r.ok ? 'coin' : 'error'); showTalk(S.talking); }
    });
    // thumb stick
    let jid = null; const knob = dom.joy.firstChild;
    const jset = e => { const r = dom.joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, m = r.width / 2; let x = (e.clientX - cx) / m, y = (e.clientY - cy) / m; const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; } S.joy = { x, y }; knob.style.transform = `translate(${x * m * 0.6}px,${y * m * 0.6}px)`; };
    dom.joy.addEventListener('pointerdown', e => { if (!S) return; jid = e.pointerId; dom.joy.setPointerCapture(jid); jset(e); e.stopPropagation(); });
    dom.joy.addEventListener('pointermove', e => { if (e.pointerId === jid) jset(e); });
    const jend = e => { if (e.pointerId === jid) { jid = null; if (S) S.joy = { x: 0, y: 0 }; knob.style.transform = ''; } };
    dom.joy.addEventListener('pointerup', jend); dom.joy.addEventListener('pointercancel', jend);
    addEventListener('keydown', onKey, true); addEventListener('keyup', e => { delete keys[e.key.toLowerCase()]; }, true);
  }
  const KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e', 'f', 'enter', 'escape', ' '];
  function onKey(e) {
    if (!on) return; const k = e.key.toLowerCase(); if (!KEYS.includes(k)) return;
    e.preventDefault(); e.stopPropagation(); keys[k] = true;
    if (k === 'escape') { if (S.talking !== null) closeTalk(); else stop(); }
    else if ((k === 'f' || k === 'enter') && !e.repeat) interact();
  }

  function start() {
    if (on || !ui || ui.cityView === null) return false;
    const T = VM.City3D.internals(), st = ui.state, city = st.cities[T.cityId];
    if (!T.layout || city.owner !== st.player) return false;
    const { THREE, scene, camera, crowd, layout: L } = T, tint = new THREE.Color(L.color);
    camera.clearViewOffset();
    const cols = colliders(L), o = new THREE.Object3D();
    const place = (mesh, i, x, z, yaw) => { o.position.set(x, 0, z); o.rotation.set(0, yaw, 0); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); mesh.instanceMatrix.needsUpdate = true; };
    // the ruler
    const me = crowd.mesh('sword', 1); me.setColorAt(0, tint); me.instanceColor.needsUpdate = true; scene.add(me);
    // the officers in this city, standing round the plaza
    const offs = st.officers.filter(x => x.owner === st.player && x.loc === T.cityId && (x.role === 'idle' || x.role === 'governor') && !x.travel && !x.searching && x.army === null);
    const npcs = [], om = crowd.mesh('spear', Math.max(1, offs.length)); om.count = offs.length; scene.add(om);
    offs.forEach((x, i) => {
      const a = Math.PI * 0.2 + i * (Math.PI * 2 / Math.max(offs.length, 3)), r = 8.6 + (i % 2) * 1.3;
      let p = { x: Math.cos(a) * r, z: Math.sin(a) * r }; move(p, 0, 0, L, cols);
      om.setColorAt(i, tint); npcs.push({ officer: x.id, name: x.name, x: p.x, z: p.z, yaw: Math.atan2(-p.x, -p.z), idx: i });
      place(om, i, p.x, p.z, npcs[i].yaw); crowd.play(om, i, 'spIdle', i * 0.7);
    });
    om.instanceColor && (om.instanceColor.needsUpdate = true);
    // townsfolk strolling about
    const nf = clamp(Math.round(city.pop / 40), 4, 12), fm = crowd.mesh('civ', nf); scene.add(fm);
    const folk = [];
    for (let i = 0; i < nf; i++) {
      const a = (i * 2.399) % (Math.PI * 2), r = 10 + (i * 1.7) % (L.radius - 12), p = { x: Math.cos(a) * r, z: Math.sin(a) * r }; move(p, 0, 0, L, cols);
      const f = { x: p.x, z: p.z, yaw: a, tx: p.x, tz: p.z, wait: i * 0.4, ph: i, line: FOLK[i % FOLK.length], name: 'Townsperson' };
      folk.push(f); place(fm, i, f.x, f.z, f.yaw);
    }
    const labels = npcs.map(n => { const d = el('div', null, 'wl', ''); d.textContent = n.name; dom.labels.appendChild(d); return d; });
    S = { T, L, cols, me, om, fm, npcs, folk, labels, pos: { x: 0, z: L.radius * 0.45 }, yaw: Math.PI, face: 0, cyaw: 0.2, cpitch: 0.38, dist: 7, joy: { x: 0, y: 0 }, moving: 0, talking: null, near: null, t: 0, drag: new Map(), place, tint };
    S.pos.x = 0; S.pos.z = L.radius - 5;                           // enter by the gate on the south side
    move(S.pos, 0, 0, L, cols); S.cyaw = 0;
    ui.walking = true; ui.sheet = null; on = true; document.body.classList.add('walk');
    VM.City3D.setWalk(mod); dom.root.classList.add('on'); closeTalk(); VM.Audio.play('pick');
    dom.hint.textContent = 'WASD or the stick to walk · Shift runs · drag to look · F to talk · Esc to stop';
    return true;
  }

  function stop() {
    if (!on) return; on = false; ui.walking = false; document.body.classList.remove('walk');
    const { scene } = S.T; for (const m of [S.me, S.om, S.fm]) { scene.remove(m); m.geometry.dispose(); m.dispose && m.dispose(); }
    dom.labels.innerHTML = ''; dom.root.classList.remove('on'); closeTalk(); S.T.camera.clearViewOffset(); VM.City3D.setWalk(null); S = null; for (const k in keys) delete keys[k];
    if (ui.state.story) ui.speed = ui.speed || 1;
  }

  function interact() {
    if (!on) return;
    if (S.talking !== null) { closeTalk(); return; }
    const n = S.near; if (!n) return;
    const c = ui.state.cities[S.T.cityId];
    if (n.kind === 'officer') { S.talking = n.npc.officer; showTalk(S.talking); }
    else if (n.kind === 'folk') VM.Panels.toast(n.npc.line);
    else if (n.kind === 'place') VM.Panels.toast((PLACE[n.place] || (() => ''))(c));
  }
  function closeTalk() { if (S) S.talking = null; if (dom) dom.talk.classList.remove('on'); }
  function showTalk(id) {
    const st = ui.state, o = st.officers[id]; if (!o) return closeTalk();
    const info = VM.Story && st.story ? VM.Story.officerInfo(o) : null, C = VM.CFG.OFFICERS, since = st.time - o.gift, fac = st.factions[st.player];
    let h = `<div class="tk"><b>${o.name}</b><span class="dim"> ${o.trait}</span></div>`;
    if (info) { h += `<div class="dim">${VM.Story.tx(info.role)}. ${VM.Story.tx(info.bio)}</div>`; const ties = VM.Story.tiesView(st, o); if (ties.length) h += `<div class="dim">` + ties.map(t => `${VM.Story.tx(t.label)}: ${VM.Story.tx(t.who)}`).join(' · ') + `</div>`; }
    h += `<div class="say">“${lineFor(o)}”</div>`;
    h += `<div class="dim">Cmd ${o.command} · Might ${o.might} · Pol ${o.politics} · Int ${o.intellect} · Loyalty ${Math.round(o.loyalty)}</div>`;
    h += `<div class="row"><button class="btn sm" data-act="talkGift" data-o="${o.id}"${since < C.giftCooldown || fac.gold < C.giftCost ? ' disabled' : ''}>Gift ${C.giftCost}g</button> <button class="btn sm" data-act="talkClose">Close</button></div>`;
    dom.talk.innerHTML = h; dom.talk.classList.add('on');
  }

  // ---- pointer: drag to look (one pointer), wheel to zoom ----
  function down(e) { if (!S) return; S.T.canvas.setPointerCapture(e.pointerId); S.drag.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
  function pmove(e) { const p = S && S.drag.get(e.pointerId); if (!p) return; S.cyaw -= (e.clientX - p.x) * 0.008; S.cpitch = clamp(S.cpitch + (e.clientY - p.y) * 0.005, 0.08, 1.2); p.x = e.clientX; p.y = e.clientY; }
  function up(e) { if (S) S.drag.delete(e.pointerId); }
  function wheel(e) { if (S) S.dist = clamp(S.dist * Math.exp(e.deltaY * 0.001), 3, 16); }

  function frame(dt) {
    const st = ui.state, c = st.cities[S.T.cityId];
    if (ui.cityView !== S.T.cityId || c.owner !== st.player) { stop(); return; }
    dt = Math.min(dt, 0.1); S.t += dt;
    const { THREE, camera, crowd } = S.T;
    // turning
    if (keys.q) S.cyaw += dt * 1.8; if (keys.e) S.cyaw -= dt * 1.8;
    // movement relative to the view
    let fx = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0) - S.joy.y, rx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + S.joy.x;
    const mag = Math.hypot(fx, rx); if (mag > 1) { fx /= mag; rx /= mag; }
    const sy = Math.sin(S.cyaw), cy = Math.cos(S.cyaw), dx = -sy * fx + cy * rx, dz = -cy * fx - sy * rx, run = keys.shift || mag > 0.85 && S.joy.x * S.joy.x + S.joy.y * S.joy.y > 0.7;
    const sp = (keys.shift ? RUN : SPEED) * Math.min(1, mag) * (S.talking !== null ? 0 : 1);
    if (mag > 0.05 && sp > 0) {
      const l = Math.hypot(dx, dz) || 1; move(S.pos, dx / l * sp * dt, dz / l * sp * dt, S.L, S.cols);
      let d = Math.atan2(dx, dz) - S.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); S.yaw += d * Math.min(1, dt * 12);
    }
    const moving = mag > 0.05 && sp > 0 ? (keys.shift ? 2 : 1) : 0;
    S.place(S.me, 0, S.pos.x, S.pos.z, S.yaw); crowd.play(S.me, 0, moving === 2 ? 'swRun' : moving ? 'swWalk' : 'swIdle', S.t);
    // townsfolk
    S.folk.forEach((f, i) => {
      if (f.wait > 0) { f.wait -= dt; crowd.play(S.fm, i, 'cvIdle', S.t + i); }
      else {
        const ddx = f.tx - f.x, ddz = f.tz - f.z, dd = Math.hypot(ddx, ddz);
        if (dd < 0.4) { f.wait = 2 + (i * 1.3 + S.t) % 4; const a = (S.t * 0.7 + i * 2.1) % (Math.PI * 2), r = 10 + (i * 3.1 + S.t) % (S.L.radius - 12); f.tx = Math.cos(a) * r; f.tz = Math.sin(a) * r; }
        else { move(f, ddx / dd * 1.1 * dt, ddz / dd * 1.1 * dt, S.L, S.cols); f.yaw = Math.atan2(ddx, ddz); crowd.play(S.fm, i, 'cvWalk', S.t + i); }
      }
      S.place(S.fm, i, f.x, f.z, f.yaw);
    });
    S.fm.geometry.attributes.aAnim.needsUpdate = true;
    // who is near
    const near = nearest(S.pos, S.npcs.concat(S.folk), S.cols); S.near = near;
    const nm = near ? near.kind === 'officer' ? near.npc.name : near.kind === 'folk' ? 'Townsperson' : near.place[0].toUpperCase() + near.place.slice(1) : '';
    const txt = near ? (near.kind === 'place' ? 'Look at ' : 'Talk to ') + nm : '';
    if (S.shown !== txt) { S.shown = txt; dom.act.innerHTML = txt ? `<span>${near.kind === 'place' ? 'Look at' : 'Talk to'}</span> <b></b>` : ''; if (txt) dom.act.lastChild.textContent = nm; dom.act.style.display = txt && S.talking === null ? 'block' : 'none'; }
    if (S.talking !== null) dom.act.style.display = 'none';
    // camera follows from behind
    const cp = Math.cos(S.cpitch), tx = S.pos.x, tz = S.pos.z;
    camera.position.set(tx + Math.sin(S.cyaw) * cp * S.dist, 1.6 + Math.sin(S.cpitch) * S.dist, tz + Math.cos(S.cyaw) * cp * S.dist); camera.lookAt(tx, 1.4, tz);
    // names over the officers
    const v = new THREE.Vector3(), w = innerWidth, h = innerHeight;
    S.npcs.forEach((n, i) => { v.set(n.x, 2.3, n.z).project(camera); const lab = S.labels[i], vis = v.z < 1 && Math.hypot(n.x - tx, n.z - tz) < 30; lab.style.display = vis ? 'block' : 'none'; if (vis) lab.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * w}px,${(-v.y * 0.5 + 0.5) * h}px)`; });
    S.om.geometry.attributes.aAnim.needsUpdate = true;
  }

  const mod = { down, move: pmove, up, frame };
  // the wheel handler is on the canvas already (zoom of the orbit camera); route it to the walk camera instead
  function onWheel(e) { if (on) wheel(e); }
  addEventListener('wheel', onWheel, { passive: true });

  return { init, start, stop, isOn: () => on, logic, state: () => S };
})();
