// The field battle view (Three.js r128): the ground where two armies met on the road, the armies facing each other in the animated crowd of js/view3d/crowd.js,
// archers shooting over the front line, cavalry charging and swinging round, the reserve waiting behind. It draws what VM.FieldLayout describes and never changes
// the game. Once open it stays open until the player leaves: the fight ends, the loser leaves the field, the fallen lie where they stood.
var VM = globalThis.VM = globalThis.VM || {};

VM.Field3D = (function () {
  const TAU = Math.PI * 2;
  let renderer, scene, camera, canvas, ui, ok = false, anchor = null, layout = null, shown = false, t = 0, sig = '', dyn = null, ground = null, props = [], acc = 0;
  const cam = { yaw: 0.6, pitch: 0.62, dist: 52, minD: 12, maxD: 160 };
  const pointers = new Map(); let pinch = 0, panning = false, mid = null, look = { x: 0, z: 0 };
  const eased = new Map();                                              // army id -> { x, z, yaw }: where it is drawn, eased toward where it should be
  const o3 = () => o3.o || (o3.o = new THREE.Object3D());
  const geos = {}, shared = o => { o.userData.shared = true; return o; }, sharedGeo = (k, f) => geos[k] || (geos[k] = shared(f()));
  let CR = null; const crowd = () => CR || (CR = VM.Crowd.create(THREE));
  const TYPES = ['infantry', 'spear', 'archer', 'cavalry'], ROLE = { infantry: 'sword', spear: 'spear', archer: 'archer', cavalry: 'rider' };
  const CLIP = {
    infantry: { idle: 'swIdle', walk: 'swWalk', run: 'swRun', attack: ['swAtk1', 'swAtk2'], block: 'swBlock', die: 'swDie' },
    spear: { idle: 'spIdle', walk: 'spWalk', run: 'spRun', attack: ['spStab', 'spSlash'], block: 'spIdle', die: 'swDie' },
    archer: { idle: 'bwIdle', walk: 'bwWalk', run: 'bwRun', attack: 'bwShoot', block: 'bwIdle', die: 'bwDie' },
    cavalry: { idle: 'ride', walk: 'ride', run: 'ride', attack: ['rideStab', 'rideSlash'], block: 'ride', die: 'swDie' }
  };
  const HORSE_CLIP = { walk: 'hWalk', run: 'hRun' };
  const GROUND = { farmland: '#6d9a42', pass: '#8a8a78', port: '#86a45a', iron: '#8a8062', horse: '#759f4a', holy: '#78a67c', market: '#74a044', capital: '#6b9944', town: '#729f46' };

  // ---------------- the ground ----------------
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ (s >>> 15), s | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
  function buildGround(L) {
    const rings = 26, spokes = 56, pos = [], col = [], idx = [], base = new THREE.Color(GROUND[L.spec] || '#709c45'), alt = base.clone().multiplyScalar(0.86), s = L.seed % 97;
    for (let i = 0; i <= rings; i++) {
      const r = 170 * Math.pow(i / rings, 1.4);
      for (let j = 0; j < spokes; j++) {
        const a = j / spokes * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r, k = Math.min(1, Math.max(0, (r - 48) / 50));
        const h = (Math.sin(x * 0.1 + s) * Math.cos(z * 0.08 + 1.7) + Math.sin(x * 0.045 - z * 0.06) * 0.8) * 5 * k * k;
        pos.push(x, h - 0.03, z);
        const n = 0.5 + 0.5 * Math.sin(x * 0.21 + s * 1.7) * Math.cos(z * 0.17 - s), c = base.clone().lerp(alt, n * 0.7).multiplyScalar(1 + h * 0.02); col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < spokes; j++) { const a = i * spokes + j, b = i * spokes + (j + 1) % spokes, c = (i + 1) * spokes + j, d = (i + 1) * spokes + (j + 1) % spokes; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  }
  function buildProps(L) {
    const out = [], R = rng(L.seed + 11), road = L.road;
    if (road !== null) {                                                // the road the armies came along
      const g = new THREE.BoxGeometry(3.4, 0.05, 340), m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#9a8660' })); m.rotation.y = road; m.position.y = 0.02; out.push(m);
    }
    const off = (x, z) => road === null ? 99 : Math.abs(x * Math.cos(road) - z * Math.sin(road));    // distance from the road line
    const rocky = L.spec === 'pass' || L.spec === 'iron', nt = rocky ? 14 : 44, nr = rocky ? 26 : 8, trees = [], rocks = [];
    for (let k = 0; k < 300 && (trees.length < nt || rocks.length < nr); k++) {
      const a = R() * TAU, r = 30 + R() * 100, x = Math.cos(a) * r, z = Math.sin(a) * r; if (off(x, z) < 5) continue;
      const hgt = Math.sin(x * 0.1 + L.seed % 97) * Math.cos(z * 0.08 + 1.7) + Math.sin(x * 0.045 - z * 0.06) * 0.8, kk = Math.min(1, Math.max(0, (r - 48) / 50)), y = hgt * 5 * kk * kk;
      if (trees.length < nt && R() < 0.65) trees.push({ x, y, z, s: 0.8 + R() * 0.9 }); else if (rocks.length < nr) rocks.push({ x, y, z, s: 0.7 + R() * 1.6 });
    }
    const dummy = new THREE.Object3D();
    if (trees.length) {
      const crown = new THREE.InstancedMesh(sharedGeo('crown', () => new THREE.ConeGeometry(1.5, 4.2, 6)), new THREE.MeshLambertMaterial({ color: '#3f7430' }), trees.length);
      const trunk = new THREE.InstancedMesh(sharedGeo('trunk', () => new THREE.CylinderGeometry(0.25, 0.3, 1.6, 5)), new THREE.MeshLambertMaterial({ color: '#5e4129' }), trees.length);
      trees.forEach((q, i) => { dummy.position.set(q.x, q.y + 3.2 * q.s, q.z); dummy.scale.setScalar(q.s); dummy.rotation.set(0, i, 0); dummy.updateMatrix(); crown.setMatrixAt(i, dummy.matrix); dummy.position.set(q.x, q.y + 0.8 * q.s, q.z); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix); });
      out.push(crown, trunk);
    }
    if (rocks.length) {
      const m = new THREE.InstancedMesh(sharedGeo('rock', () => new THREE.IcosahedronGeometry(1.2, 0)), new THREE.MeshLambertMaterial({ color: '#7d7886' }), rocks.length);
      rocks.forEach((q, i) => { dummy.position.set(q.x, q.y + 0.5 * q.s, q.z); dummy.scale.set(q.s, q.s * 0.7, q.s); dummy.rotation.set(i, i * 2, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
      out.push(m);
    }
    return out;
  }

  // ---------------- the soldiers ----------------
  function buildDynamic(L) {
    const D = { group: new THREE.Group(), entries: [], shots: [], puffs: [], armies: L.armies }, E = D.entries;
    L.armies.forEach((A, ai) => {
      const col = new THREE.Color(A.color), order = []; for (const k of ['infantry', 'spear', 'archer', 'cavalry']) for (let n = 0; n < (A.mix[k] || 0); n++) order.push(k);
      const foot = order.filter(k => k !== 'cavalry'), cols = VM.FieldLayout.colsOf(foot.length), line = foot.filter(k => k !== 'archer'), rowsLine = Math.ceil(line.length / cols);
      let li = 0, ar = 0, ci = 0;
      order.forEach((type, i) => {
        if (type === 'cavalry') { const side = ci % 2 ? 1 : -1, lat = side * ((cols - 1) / 2 * 1.3 + 3.2 + Math.floor(ci / 2) * 1.9); ci++; E.push({ type, aid: A.id, lat, depth: 0, color: col, phase: i + ai * 7, cav: true, side }); return; }
        let lat, depth;
        if (type === 'archer') { const r = Math.floor(ar / cols), c = ar % cols; lat = (c - (cols - 1) / 2) * 1.3; depth = rowsLine * 1.5 + 3 + r * 1.5; ar++; }
        else { const r = Math.floor(li / cols), c = li % cols; lat = (c - (cols - 1) / 2) * 1.3; depth = r * 1.5; li++; }
        E.push({ type, aid: A.id, lat, depth, color: col, phase: i + ai * 7 });
      });
      const dead = col.clone().multiplyScalar(0.55);
      for (let k = 0; k < A.fallen; k++) E.push({ type: 'infantry', aid: A.id, lat: ((k * 37) % 13 - 6) * 1.3, depth: -1 - (k % 5) * 1.4, color: dead, phase: k, fallen: true });
      if (!eased.has(A.id)) eased.set(A.id, { x: A.x, z: A.z, yaw: A.heading });
    });
    D.groups = {}; const CRW = crowd();
    for (const type of TYPES) {
      const list = E.filter(e => e.type === type); if (!list.length) continue;
      const body = CRW.mesh(ROLE[type], list.length), horse = type === 'cavalry' ? CRW.mesh('horse', list.length) : null;
      list.forEach((e, i) => { body.setColorAt(i, e.color); if (horse) horse.setColorAt(i, e.color); });
      D.group.add(body); if (horse) D.group.add(horse);
      D.groups[type] = { list, body, horse };
    }
    return D;
  }
  // where one soldier stands and what it is doing
  function pose(e, A, an) {
    const ph = t * 2.2 + e.phase; let lat = e.lat, depth = e.depth, st = 'idle', yaw = an.yaw;
    if (e.fallen) { st = 'die'; yaw = e.phase; }
    else if (A.mode === 'fighting') {
      if (e.cav) {                                                         // charge into the line, fall back, then swing round the flank (or regroup and charge again)
        const ph2 = A.cavPh, w = e.side, lerp = (a, b, u) => a + (b - a) * u * u * (3 - 2 * u); let fwd, lt = lat;
        if (ph2 < 0.3) { const u = ph2 / 0.3; fwd = lerp(-6, 4.2, u); lt = lat * lerp(1, 0.55, u); st = u > 0.55 ? 'attack' : 'run'; }
        else if (ph2 < 0.55) { const u = (ph2 - 0.3) / 0.25; fwd = lerp(4.2, -8, u); lt = lat * lerp(0.55, 1.2, u); st = 'run'; }
        else if (ph2 < 0.8) { const u = (ph2 - 0.55) / 0.25; if (A.flank) { fwd = lerp(-8, 6, u); lt = w * lerp(Math.abs(lat), Math.abs(lat) + 9, Math.sin(u * Math.PI)); st = 'run'; } else { fwd = lerp(-8, -5, u); lt = lat; st = 'idle'; } }
        else { const u = (ph2 - 0.8) / 0.2; if (A.flank) { fwd = lerp(6, 9, u); lt = lerp(w * (Math.abs(lat) + 5), w * 2.5, u); st = u > 0.35 ? 'attack' : 'run'; } else { fwd = lerp(-5, 3, u); lt = lerp(lat, lat * 0.6, u); st = u > 0.5 ? 'attack' : 'run'; } }
        depth = -fwd; lat = lt;
      } else if (e.type === 'archer') st = 'attack';
      else { st = (e.phase + Math.floor(t * 0.4)) % 5 === 4 ? 'block' : 'attack'; depth -= 0.3; }
    } else if (A.mode === 'march') { st = 'walk'; lat += Math.sin(ph * 0.7) * 0.06; }
    if (A.routed || A.retreating) st = 'run';
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    return [an.x + rx * lat - fx * depth, 0, an.z + rz * lat - fz * depth, yaw, st];
  }
  const clipOf = (e, st) => { const c = CLIP[e.type][st] || CLIP[e.type].idle; return Array.isArray(c) ? c[e.phase % c.length] : c; };
  function animate(dt) {
    if (!dyn) return;
    const o = o3(), CRW = crowd(), byId = {}; for (const A of layout.armies) byId[A.id] = A;
    for (const A of layout.armies) {                                         // ease every army toward its place; the facing turns the short way
      const an = eased.get(A.id); if (!an) continue;
      const k = Math.min(1, dt * (A.mode === 'fighting' || A.mode === 'reserve' ? 3 : 2.2)); an.x += (A.x - an.x) * k; an.z += (A.z - an.z) * k;
      let d = A.heading - an.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); an.yaw += d * Math.min(1, dt * 3);
    }
    for (const type of TYPES) {
      const g = dyn.groups[type]; if (!g) continue;
      g.list.forEach((e, i) => {
        const A = byId[e.aid], an = A && eased.get(A.id); if (!A || !an) return;
        const [x, y, z, yaw, st] = pose(e, A, an);
        o.position.set(x, y + (g.horse ? 0.78 : 0), z); o.rotation.set(0, yaw, 0); o.updateMatrix(); g.body.setMatrixAt(i, o.matrix);
        if (g.horse) { o.position.y = y; o.updateMatrix(); g.horse.setMatrixAt(i, o.matrix); }
        e._x = x; e._z = z; e._st = st;
        const name = clipOf(e, st), clip = CRW.clips[name], tt = t + e.phase * 0.37;
        CRW.play(g.body, i, name, clip.loop ? tt : st === 'die' ? clip.d : tt % clip.d); if (g.horse) CRW.play(g.horse, i, HORSE_CLIP[st] || 'hStand', tt);
      });
      g.body.instanceMatrix.needsUpdate = true; if (g.horse) g.horse.instanceMatrix.needsUpdate = true;
    }
    shotT -= dt; sparkT -= dt;
    if (shotT <= 0) { shotT = 0.8; volley(byId); } if (sparkT <= 0) { sparkT = 0.3; sparks(); }
    for (const s of dyn.shots) { s.u += dt / s.dur; if (s.u >= 1) { s.done = true; continue; } s.m.position.set(s.x0 + (s.tx - s.x0) * s.u, s.y0 + (s.ty - s.y0) * s.u + Math.sin(s.u * Math.PI) * s.arc, s.z0 + (s.tz - s.z0) * s.u); s.m.rotation.y = Math.atan2(s.tx - s.x0, s.tz - s.z0); }
    dyn.shots = dyn.shots.filter(s => { if (s.done) dyn.group.remove(s.m); return !s.done; });
    for (const p of dyn.puffs) { p.u += dt * p.speed; p.m.scale.setScalar(p.s0 + p.u * p.grow); p.m.material.opacity = Math.max(0, 0.75 - p.u * 0.75); if (p.u >= 1) p.done = true; }
    dyn.puffs = dyn.puffs.filter(p => { if (p.done) { dyn.group.remove(p.m); p.m.material.dispose(); } return !p.done; });
  }
  let shotT = 0, sparkT = 0, arrowMat = null;
  function volley(byId) {                                                    // archers of armies in a fight shoot at the army opposite
    if (dyn.shots.length > 14) return; const g = dyn.groups.archer; if (!g) return;
    if (!arrowMat) arrowMat = shared(new THREE.MeshLambertMaterial({ color: '#e8e0c8' }));
    const picks = g.list.filter(e => e._x !== undefined && !e.fallen && byId[e.aid] && byId[e.aid].mode === 'fighting' && Math.random() < 0.25).slice(0, 3);
    for (const e of picks) {
      const A = byId[e.aid], foe = layout.armies.find(x => x.mode === 'fighting' && x.side !== A.side), an = foe && eased.get(foe.id); if (!an) continue;
      const m = new THREE.Mesh(sharedGeo('arrow', () => new THREE.BoxGeometry(0.05, 0.05, 0.8)), arrowMat); dyn.group.add(m);
      dyn.shots.push({ m, u: 0, dur: 0.8, arc: 5, x0: e._x, y0: 1.4, z0: e._z, tx: an.x + (Math.random() - 0.5) * 8, ty: 1.2, tz: an.z + (Math.random() - 0.5) * 8 });
    }
  }
  function sparks() {
    if (!layout.armies.some(a => a.mode === 'fighting') || dyn.puffs.length > 30) return;
    const a = Math.random() * TAU, r = Math.random() * 4, m = new THREE.Mesh(sharedGeo('puff', () => new THREE.SphereGeometry(0.7, 6, 5)), new THREE.MeshBasicMaterial({ color: '#ffd070', transparent: true, opacity: 0.75 }));
    m.position.set(Math.cos(a) * r, 1.2 + Math.random(), Math.sin(a) * r); dyn.group.add(m); dyn.puffs.push({ m, u: 0, s0: 0.25, grow: 1.1, speed: 3.2 });
  }

  // ---------------- the HUD above the view: where, who, and how it stands ----------------
  const $ = id => document.getElementById(id);
  function hud() {
    const L = layout, st = ui.state, bar = $('fieldbar'); if (!L || !bar) return;
    const nm = id => st.factions[id].name;
    $('fbT').textContent = `Battle near ${L.nearName}`;
    let s = 'The battle rages';
    if (L.over) {
      const r = L.result, parts = [];
      if (r.holders.length === 1) parts.push(`${nm(r.holders[0])} holds the field`);
      for (const o of [...new Set(r.destroyed)]) parts.push(`An army of ${nm(o)} was destroyed`);
      for (const o of [...new Set(r.routed)]) parts.push(`An army of ${nm(o)} is leaving the field`);
      s = parts.length ? 'The battle is over: ' + parts.join('. ') : 'The battle is over';
    }
    if ($('fbS').textContent !== s) $('fbS').textContent = s;
    const rows = L.armies.filter(a => !a.ghost).map(a => `<div class="ir"><span class="dot" style="background:${a.color}"></span><b>${nm(a.owner)}</b> ${a.name ? '<span class="dim">' + a.name + '</span>' : ''} <span>${a.size}</span> <span class="dim">${a.mode === 'reserve' ? 'In reserve' : a.routed ? 'Routed' : a.retreating ? 'Retreating' : a.mode === 'fighting' ? '' : 'Nearby'}</span> <i class="mb"><i style="width:${Math.max(0, Math.min(100, a.morale))}%"></i></i></div>`).join('');
    if ($('fbArmies').dataset.h !== rows) { $('fbArmies').dataset.h = rows; $('fbArmies').innerHTML = rows; if (VM.I18N && VM.I18N.flush) VM.I18N.flush(); }
  }

  // ---------------- scene lifecycle ----------------
  const dispose = obj => obj.traverse(n => { if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose(); if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => { if (!m.userData.shared) m.dispose(); }); });
  function refresh(force) {
    if (!anchor) return;
    const L = VM.FieldLayout.build(ui.state, anchor), first = !layout; layout = L;
    if (first || force) {
      if (ground) { scene.remove(ground); dispose(ground); } for (const p of props) { scene.remove(p); dispose(p); }
      ground = buildGround(L); scene.add(ground); props = buildProps(L); props.forEach(p => scene.add(p));
    }
    if (force || L.sig !== sig) {
      sig = L.sig; if (dyn) { scene.remove(dyn.group); dispose(dyn.group); } dyn = buildDynamic(L); scene.add(dyn.group);
      const live = new Set(L.armies.map(a => a.id)); for (const k of [...eased.keys()]) if (!live.has(k)) eased.delete(k);
    }
  }
  function init(canvasEl, uiRef) { canvas = canvasEl; ui = uiRef; }
  function ensureRenderer() {
    if (renderer) return ok;
    try {
      if (!window.THREE) throw new Error('three.js is missing');
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      scene = new THREE.Scene(); scene.background = new THREE.Color('#6b86b8'); scene.fog = new THREE.Fog('#6b86b8', 110, 260);
      camera = new THREE.PerspectiveCamera(42, 1, 0.5, 420);
      scene.add(new THREE.HemisphereLight('#dfe6ff', '#4a3f30', 0.66)); const sun = new THREE.DirectionalLight('#fff0d0', 0.66); sun.position.set(30, 50, 22); scene.add(sun);
      canvas.addEventListener('webglcontextlost', e => e.preventDefault()); canvas.addEventListener('contextmenu', e => e.preventDefault());
      canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
      addEventListener('resize', resize); resize(); ok = true;
    } catch (e) { ok = false; renderer = null; }
    return ok;
  }
  function resize() { if (!renderer) return; renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  const zoom = k => { cam.dist = Math.max(cam.minD, Math.min(cam.maxD, cam.dist * k)); };
  const pan = (dx, dy) => { const k = cam.dist * 0.0016; look.x = Math.max(-60, Math.min(60, look.x - Math.cos(cam.yaw) * dx * k - Math.sin(cam.yaw) * dy * k)); look.z = Math.max(-60, Math.min(60, look.z + Math.sin(cam.yaw) * dx * k - Math.cos(cam.yaw) * dy * k)); };
  function down(e) { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); panning = e.button === 2 || e.shiftKey; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; } }
  function move(e) {
    const p = pointers.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; if (pinch) zoom(pinch / d); pinch = d; if (mid) pan(m.x - mid.x, m.y - mid.y); mid = m; }
    else if (panning) pan(dx, dy); else { cam.yaw -= dx * 0.008; cam.pitch = Math.max(0.12, Math.min(1.35, cam.pitch + dy * 0.005)); }
  }
  function up(e) { pointers.delete(e.pointerId); if (pointers.size < 2) { pinch = 0; mid = null; } if (!pointers.size) panning = false; }

  // Opens the view at a battle (the anchor comes from VM.FieldLayout.start). Returns false when the 3D view is not available.
  function open(a) {
    if (!ensureRenderer()) return false;
    anchor = a; layout = null; sig = ''; eased.clear(); shown = true; t = 0; look = { x: 0, z: 0 }; cam.dist = innerWidth < innerHeight ? 85 : 52; cam.pitch = 0.62;
    cam.yaw = Math.atan2(a.axis.x, a.axis.z) + Math.PI / 2 + 0.5;                    // look across the line, a little from the side
    canvas.classList.add('on'); resize(); refresh(true); hud();
    return true;
  }
  function close() { shown = false; anchor = null; layout = null; canvas.classList.remove('on'); if (dyn) { scene.remove(dyn.group); dispose(dyn.group); dyn = null; } }
  function frame(dt) {
    if (!shown || !renderer) return;
    t += dt; acc += dt; if (acc > 0.3) { acc = 0; refresh(false); hud(); }
    const cp = Math.cos(cam.pitch);
    camera.position.set(look.x + Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, look.z + Math.cos(cam.yaw) * cp * cam.dist); camera.lookAt(look.x, 1.5, look.z);
    animate(dt); renderer.render(scene, camera);
  }
  return { init, open, close, frame, supported: () => ensureRenderer(), isOpen: () => shown, layout: () => layout, cam, info: () => renderer ? { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, soldiers: dyn ? dyn.entries.length : 0 } : null };
})();
