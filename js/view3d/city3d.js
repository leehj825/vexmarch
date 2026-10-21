// The 3D city view (Three.js r128, every model built in code, no asset files). It draws what VM.CityLayout describes: the keep, walls with
// damage, houses, fields, stalls, barracks, temple, depot, soldiers and siege engines. All the static buildings are merged into ONE mesh
// with vertex colours (one draw call); soldiers are instanced; the scene is rebuilt only when the layout's signature changes.
var VM = globalThis.VM = globalThis.VM || {};

VM.City3D = (function () {
  const TAU = Math.PI * 2;
  const COL = {
    stone: '#a39cb0', stoneDark: '#706a80', stoneLight: '#c4bfcf', wood: '#8a6040', woodDark: '#5e4129', plaster: '#eadfc3', plaster2: '#e0c9a0', plaster3: '#d7d3c8',
    roofs: ['#c0583c', '#b8863c', '#5a7aa0'], dirt: '#8f7d5a', soil: '#5a4630', wheat: '#d8b24a', crop: '#7fae3c', leaf: '#4f8a3a', leaf2: '#3f7430', rock: '#7d7886', rockDark: '#5f5a6b',
    sand: '#d8c890', water: '#4f86b8', door: '#3a2a22', hay: '#d9bf6a', canvas: '#e8dcb8', gold: '#f2d27a', glow: '#8fd8ff'
  };
  let renderer, scene, camera, canvas, ui, ok = false, layout = null, sig = '', cityId = -1, t = 0, shown = false;
  let staticMesh = null, ground = null, water = null, dyn = null;
  const cam = { yaw: 0.8, pitch: 0.82, dist: 40, minD: 20, maxD: 120, auto: true, tx: 0, tz: 0 };
  const pointers = new Map(); let pinch = 0;

  // ---------------- geometry helpers ----------------
  function Merger() { this.pos = []; this.nor = []; this.col = []; this.tris = 0; }
  Merger.prototype.add = function (g, color, shade) {
    const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals();
    const p = ng.attributes.position.array, n = ng.attributes.normal.array, c = new THREE.Color(color), k = shade === undefined ? 1 : shade;
    for (let i = 0; i < p.length; i++) { this.pos.push(p[i]); this.nor.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) this.col.push(c.r * k, c.g * k, c.b * k);
    this.tris += p.length / 9; g.dispose(); if (ng !== g) ng.dispose();
  };
  Merger.prototype.mesh = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  };
  const yawFor = (dx, dz) => -Math.atan2(dz, dx);                 // rotation about Y that turns local +x toward (dx, dz) in the x/z plane
  const place = (g, x, y, z, rot) => { if (rot) g.rotateY(rot); g.translate(x, y, z); return g; };
  const box = (M, x, yb, z, w, h, d, color, rot, shade) => M.add(place(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, yb, z, rot), color, shade);
  const cyl = (M, x, yb, z, rt, rb, h, color, seg, shade) => M.add(place(new THREE.CylinderGeometry(rt, rb, h, seg || 8).translate(0, h / 2, 0), x, yb, z, 0), color, shade);
  const cone = (M, x, yb, z, r, h, color, seg, shade) => M.add(place(new THREE.ConeGeometry(r, h, seg || 8).translate(0, h / 2, 0), x, yb, z, 0), color, shade);
  const ball = (M, x, y, z, r, color, seg) => M.add(new THREE.SphereGeometry(r, seg || 6, 5).translate(x, y, z), color);
  function gable(M, x, yb, z, w, d, h, rot, color) {            // a roof: a triangular prism, ridge along local x
    const g = new THREE.BufferGeometry(), a = w / 2 + 0.25, b = d / 2 + 0.25;
    const v = [
      -a, 0, -b, a, 0, -b, a, 0, b, -a, 0, -b, a, 0, b, -a, 0, b,                       // underside
      -a, 0, -b, -a, 0, b, -a, h, 0, a, 0, b, a, 0, -b, a, h, 0,                         // gable ends
      -a, 0, -b, a, 0, -b, a, h, 0, -a, 0, -b, a, h, 0, -a, h, 0,                        // back slope
      a, 0, b, -a, 0, b, -a, h, 0, a, 0, b, -a, h, 0, a, h, 0];                          // front slope
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    M.add(place(g, x, yb, z, rot), color);
  }
  const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; };
  const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];

  // ---------------- the static city ----------------
  function wallHeight(level) { return [0, 2.2, 3.2, 4.2][level]; }

  function house(M, h, ci, accent) {
    const base = [COL.plaster, COL.plaster2, COL.plaster3][ci % 3];
    box(M, h.x, 0, h.z, h.w, h.h, h.d, base, h.rot, 0.96 + (ci % 3) * 0.02);
    gable(M, h.x, h.h, h.z, h.w, h.d, 0.9, h.rot, h.roof === 2 ? accent : COL.roofs[h.roof]);
    if (h.chimney) { const c = Math.cos(h.rot) * h.w * 0.25, s = -Math.sin(h.rot) * h.w * 0.25; box(M, h.x + c, h.h + 0.2, h.z + s, 0.35, 0.9, 0.35, COL.stoneDark); }
  }

  function buildKeep(M, L) {
    const w = { capital: 10, city: 8, town: 7, hamlet: 6 }[L.tier], hh = { capital: 4.4, city: 3.8, town: 3.4, hamlet: 3 }[L.tier];
    box(M, 0, 0, 0, w, hh, w, COL.stone);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      cyl(M, sx * w / 2, 0, sz * w / 2, 1.2, 1.4, hh + 1.2, COL.stoneLight, 8);
      cone(M, sx * w / 2, hh + 1.2, sz * w / 2, 1.6, 1.7, L.color, 8);
    }
    for (let i = -2; i <= 2; i++) for (const side of [-1, 1]) { box(M, i * (w / 5), hh, side * (w / 2 - 0.2), 0.8, 0.6, 0.5, COL.stoneDark); box(M, side * (w / 2 - 0.2), hh, i * (w / 5), 0.5, 0.6, 0.8, COL.stoneDark); }
    const dh = L.tier === 'capital' ? 6.5 : 4.6;
    box(M, 0, hh, 0, w * 0.45, dh, w * 0.45, COL.stoneLight);
    cone(M, 0, hh + dh, 0, w * 0.4, 3.2, L.color, 4, 1.0);
    box(M, 0, 0, w / 2 + 0.05, 1.8, 2.2, 0.3, COL.door);
    cyl(M, 0, hh + dh + 3.2, 0, 0.07, 0.07, 2.2, COL.woodDark, 4);          // flagpole (the flag itself is animated)
  }

  function buildWalls(M, L, accent) {
    const W = L.wall, N = W.segments.length, R = W.radius, lvl = W.level, wh = wallHeight(lvl), th = [0, 0.9, 1.2, 1.7][lvl], chord = 2 * R * Math.sin(Math.PI / N) * 1.03;
    for (const g of L.gates) {                                              // roads into each gate, and gate posts when there is no wall
      const dx = Math.cos(g.angle), dz = Math.sin(g.angle), len = 70, cx = dx * (R + len / 2 - 4), cz = dz * (R + len / 2 - 4);
      box(M, cx, 0, cz, len, 0.05, 2.8, COL.dirt, yawFor(dx, dz), 0.95);
      box(M, dx * R * 0.5, 0, dz * R * 0.5, R, 0.05, 2.4, COL.dirt, yawFor(dx, dz), 0.9);
    }
    if (lvl === 0) {
      for (const g of L.gates) for (const side of [-1, 1]) { const a = g.angle + side * 0.11, p = polar(R, a); cyl(M, p[0], 0, p[1], 0.22, 0.25, 3, COL.woodDark, 6); box(M, p[0], 2.8, p[1], 0.1, 0.7, 0.5, L.color, 0); }
      return;
    }
    W.segments.forEach((s, i) => {
      if (s.gate) return;
      const [x, z] = polar(R, s.angle), rot = yawFor(-Math.sin(s.angle), Math.cos(s.angle));
      if (s.damage === 2) { for (let k = 0; k < 4; k++) box(M, x + (k - 1.5) * 0.5, 0, z + (k % 2) * 0.4, 0.8, 0.5 + (k % 3) * 0.3, 0.8, COL.rockDark, k); return; }
      const h = s.damage === 1 ? wh * 0.62 : wh;
      box(M, x, 0, z, chord, h, th, COL.stone, rot, s.damage ? 0.8 : 1);
      if (s.damage === 1) box(M, x + 0.3, 0, z, 0.9, 0.5, 0.9, COL.rockDark, 0.6);
      else if (lvl >= 2 && i % 2 === 0) { for (const off of [-0.55, 0.55]) { const ox = Math.cos(s.angle + Math.PI / 2) * chord * off * 0.5, oz = Math.sin(s.angle + Math.PI / 2) * chord * off * 0.5; box(M, x + ox - 0.0, h, z + oz, 0.7, 0.5, th * 0.5, COL.stoneDark, rot); } }
    });
    for (const a of W.towers) {
      const [x, z] = polar(R, a), th2 = lvl >= 2 ? 1.5 : 1.1, hh = wh + (lvl >= 2 ? 1.4 : 0.8);
      cyl(M, x, 0, z, th2, th2 * 1.1, hh, COL.stoneLight, 8);
      if (lvl >= 2) cone(M, x, hh, z, th2 * 1.3, 1.7, accent, 8); else cyl(M, x, hh, z, th2 * 1.15, th2 * 1.15, 0.35, COL.stoneDark, 8);
    }
    for (const g of L.gates) {                                              // the gate: an arch between two heavier towers
      const [x, z] = polar(R, g.angle), rot = yawFor(-Math.sin(g.angle), Math.cos(g.angle)), broken = L.wall.hpFrac <= 0 && L.besieged;
      box(M, x, wh * 0.72, z, 3.8, wh * 0.28, th + 0.3, COL.stone, rot);
      if (!broken) box(M, x - Math.cos(g.angle) * 0.0, 0, z, 0.35, wh * 0.72, 3.0, COL.door, rot + Math.PI / 2, 0.9);
      else box(M, x + 0.5, 0, z + 0.3, 1.1, 0.7, 1.1, COL.rockDark, 0.4);
      box(M, x, wh + 0.3, z, 0.12, 1.6, 0.12, COL.woodDark, 0);
      box(M, x, wh + 1.2, z, 0.1, 0.7, 1.0, L.color, rot);
    }
  }

  function buildCity(M, L) {
    const accent = L.color, R = L.radius, rnd = mulberry(L.id * 7919 + 5);
    buildKeep(M, L);
    buildWalls(M, L, accent);
    L.houses.forEach((h, i) => house(M, h, i, accent));
    // Market stalls
    for (const s of L.stalls) {
      for (const [ox, oz] of [[-0.9, -0.7], [0.9, -0.7], [0.9, 0.7], [-0.9, 0.7]]) { const c = Math.cos(s.rot), sn = Math.sin(s.rot); cyl(M, s.x + ox * c - oz * sn, 0, s.z + ox * sn + oz * c, 0.06, 0.06, 1.8, COL.woodDark, 4); }
      box(M, s.x, 1.8, s.z, 2.3, 0.18, 1.9, s.color, -s.rot); box(M, s.x, 0, s.z, 1.7, 0.7, 0.8, COL.wood, -s.rot);
      ball(M, s.x, 0.95, s.z, 0.25, COL.gold, 5);
    }
    // Barracks
    const B = L.barracks;
    if (B.level >= 1) {
      const len = 5 + B.level, rot = -B.rot + Math.PI / 2;
      box(M, B.x, 0, B.z, len, 2.4, 3, COL.plaster3, rot); gable(M, B.x, 2.4, B.z, len, 3, 1.4, rot, COL.roofs[2]);
      cyl(M, B.x - Math.cos(B.rot) * 3, 0, B.z - Math.sin(B.rot) * 3, 0.08, 0.08, 4.4, COL.woodDark, 4);
      box(M, B.x - Math.cos(B.rot) * 3, 3.2, B.z - Math.sin(B.rot) * 3, 0.06, 1.0, 1.4, accent, rot);
    }
    for (const tnt of B.tents) cone(M, tnt.x, 0, tnt.z, 1.7, 1.9, '#d9c79a', 6);
    for (const d of B.dummies) { cyl(M, d.x, 0, d.z, 0.1, 0.12, 1.5, COL.woodDark, 5); box(M, d.x, 1.1, d.z, 1.0, 0.12, 0.12, COL.wood); ball(M, d.x, 1.7, d.z, 0.22, COL.hay, 5); }
    // Temple
    const T = L.temple;
    if (T.level >= 1) {
      cyl(M, T.x, 0, T.z, 1.7, 1.9, 0.6, COL.stoneLight, 8);
      if (T.level === 1) { cyl(M, T.x, 0.6, T.z, 1.1, 1.2, 1.6, COL.plaster, 8); ball(M, T.x, 2.3, T.z, 1.2, COL.gold, 7); }
      else { box(M, T.x, 0.6, T.z, 2.2, 3.6 + T.level, 2.2, COL.plaster); cone(M, T.x, 4.2 + T.level, T.z, 1.8, 2.6, COL.roofs[2], 6); if (T.level >= 3) { ball(M, T.x, 8.9, T.z, 0.45, COL.glow, 6); for (const k of [0, 1, 2, 3]) { const p = polar(2.6, k * Math.PI / 2 + 0.7); cyl(M, T.x + p[0], 0, T.z + p[1], 0.25, 0.3, 3.2, COL.stoneLight, 6); } } }
    }
    // Depot
    if (L.depot) {
      const D = L.depot;
      for (let i = 0; i < D.crates; i++) box(M, D.x + (i % 3) * 1.05 - 1, Math.floor(i / 3) * 0.9, D.z + (i % 2) * 0.2, 1, 0.9, 1, i % 2 ? COL.wood : COL.woodDark, i * 0.2);
      cyl(M, D.x + 1.8, 0, D.z - 0.6, 0.7, 0.8, 1.3, COL.hay, 7);
    }
    // Fields and farmhouses
    for (const f of L.fields) {
      box(M, f.x, 0, f.z, f.w, 0.08, f.d, COL.soil, f.rot);
      for (let r = 0; r < 5; r++) { const o = (r - 2) * (f.d / 5.2), c = Math.cos(f.rot + Math.PI / 2), sn = Math.sin(f.rot + Math.PI / 2); box(M, f.x + c * o, 0.08, f.z + sn * o, f.w * 0.9, 0.35, 0.45, f.crop ? COL.wheat : COL.crop, f.rot); }
    }
    for (const fh of L.farmhouses) { box(M, fh.x, 0, fh.z, 3.2, 1.8, 2.4, COL.plaster2, -fh.rot); gable(M, fh.x, 1.8, fh.z, 3.2, 2.4, 1.3, -fh.rot, COL.roofs[1]); cyl(M, fh.x + 2.6, 0, fh.z, 0.55, 0.65, 2.2, COL.hay, 7); }
    // Features
    for (const f of L.features) {
      if (f.kind === 'tree') { cyl(M, f.x, 0, f.z, 0.18, 0.24, 1.3 * f.size / 2.2, COL.woodDark, 5); cone(M, f.x, 1.0 * f.size / 2.2, f.z, 1.1 * f.size / 2.2, 2.2 * f.size / 2.2, rnd() < 0.5 ? COL.leaf : COL.leaf2, 6); }
      else if (f.kind === 'rock') { cone(M, f.x, 0, f.z, f.size * 0.7, f.size * 1.3, COL.rock, 5); cone(M, f.x + f.size * 0.6, 0, f.z, f.size * 0.45, f.size * 0.8, COL.rockDark, 5); }
      else if (f.kind === 'ore') { box(M, f.x, 0, f.z, f.size, f.size * 0.7, f.size, COL.rockDark, f.rot); box(M, f.x + 0.2, f.size * 0.6, f.z, f.size * 0.4, f.size * 0.4, f.size * 0.4, '#d2823a', f.rot); }
      else if (f.kind === 'paddock') { for (let k = 0; k < 14; k++) { const p = polar(f.size * 0.7, k * TAU / 14); cyl(M, f.x + p[0], 0, f.z + p[1], 0.07, 0.07, 1.0, COL.woodDark, 4); } for (let k = 0; k < 3; k++) { const p = polar(f.size * 0.3, k * 2.1 + f.rot); box(M, f.x + p[0], 0.5, f.z + p[1], 1.4, 0.7, 0.5, k % 2 ? '#8a5a3a' : '#c9b8a0', f.rot + k); box(M, f.x + p[0] + 0.7, 0.9, f.z + p[1], 0.35, 0.6, 0.3, k % 2 ? '#8a5a3a' : '#c9b8a0', f.rot + k); } }
      else if (f.kind === 'stones') { for (let k = 0; k < 8; k++) { const p = polar(f.size, k * TAU / 8); box(M, f.x + p[0], 0, f.z + p[1], 0.7, 2.2 + (k % 2), 0.5, COL.stoneLight, k * 0.8); } box(M, f.x, 0, f.z, 1.2, 0.8, 1.2, COL.stone); ball(M, f.x, 1.3, f.z, 0.35, COL.glow, 6); }
      else if (f.kind === 'banner') { cyl(M, f.x, 0, f.z, 0.06, 0.06, 3, COL.woodDark, 4); box(M, f.x + 0.5, 1.7, f.z, 1.0, 1.2, 0.05, COL.gold, 0); }
      else if (f.kind === 'well') { cyl(M, f.x, 0, f.z, 0.8, 0.9, 0.8, COL.stone, 8); cyl(M, f.x - 0.7, 0, f.z, 0.06, 0.06, 1.8, COL.woodDark, 4); cyl(M, f.x + 0.7, 0, f.z, 0.06, 0.06, 1.8, COL.woodDark, 4); box(M, f.x, 1.8, f.z, 1.9, 0.12, 0.8, COL.roofs[0]); }
    }
    if (L.water) {                                                           // a pier into the water
      const p = polar(L.water.r - L.water.radius + 6, L.water.angle), dx = Math.cos(L.water.angle), dz = Math.sin(L.water.angle);
      box(M, p[0] + dx * 6, 0.1, p[1] + dz * 6, 14, 0.2, 2.2, COL.wood, yawFor(dx, dz));
      const bx = p[0] + dx * 14 - dz * 3, bz = p[1] + dz * 14 + dx * 3; box(M, bx, 0.1, bz, 4, 0.7, 1.6, COL.woodDark, yawFor(dx, dz)); box(M, bx, 0.8, bz, 0.1, 3.4, 0.1, COL.wood, 0); box(M, bx, 2.2, bz, 0.05, 1.8, 1.6, COL.canvas, yawFor(dx, dz));
    }
    // Scaffolding
    if (L.construction) {
      const C = L.construction, hgt = 1 + 4 * C.progress;
      for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) cyl(M, C.x + ox, 0, C.z + oz, 0.08, 0.08, 5.2, COL.wood, 4);
      for (let k = 1; k <= 3; k++) { box(M, C.x, k * 1.5, C.z - 1.6, 3.4, 0.1, 0.1, COL.wood, 0); box(M, C.x, k * 1.5, C.z + 1.6, 3.4, 0.1, 0.1, COL.wood, 0); box(M, C.x - 1.6, k * 1.5, C.z, 0.1, 0.1, 3.4, COL.wood, 0); box(M, C.x + 1.6, k * 1.5, C.z, 0.1, 0.1, 3.4, COL.wood, 0); }
      box(M, C.x, 0, C.z, 2.6, hgt * 0.6, 2.6, COL.plaster2, 0.2);
    }
  }

  function buildGround(L) {
    // A polar grid (rings x spokes) so the lighting is smooth; hills rise only well away from the city.
    const rings = 28, spokes = 56, pos = [], col = [], idx = [];
    const base = new THREE.Color({ farmland: '#6d9a42', pass: '#8a8a78', port: '#86a45a', iron: '#8a8062', horse: '#759f4a', holy: '#78a67c', market: '#74a044', capital: '#6b9944', town: '#729f46' }[L.spec] || '#709c45');
    const alt = new THREE.Color(base).multiplyScalar(0.86);
    for (let i = 0; i <= rings; i++) {
      const r = 95 * Math.pow(i / rings, 1.35);
      for (let j = 0; j < spokes; j++) {
        const a = j / spokes * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r, k = Math.min(1, Math.max(0, (r - (L.radius + 34)) / 40));
        const h = (Math.sin(x * 0.11 + L.id) * Math.cos(z * 0.09 + 1.7) + Math.sin(x * 0.05 - z * 0.07) * 0.8) * 3.2 * k * k;
        pos.push(x, h - 0.03, z);
        const n = 0.5 + 0.5 * Math.sin(x * 0.23 + L.id * 1.7) * Math.cos(z * 0.19 - L.id), c = base.clone().lerp(alt, n * 0.7).multiplyScalar(1 + h * 0.02);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < spokes; j++) {
      const a = i * spokes + j, b = i * spokes + (j + 1) % spokes, c = (i + 1) * spokes + j, d = (i + 1) * spokes + (j + 1) % spokes;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  }

  // ---------------- dynamic parts: soldiers by type, engines, flags, shots ----------------
  // Four kinds of soldier with their own silhouette (infantry with a shield, spearmen with a long spear, archers with a bow and quiver, cavalry
  // on horses). Each kind is two instanced meshes: the body, tinted with the faction colour, and its gear in fixed colours; heads are shared.
  let models = null;
  const shared = o => { o.userData.shared = true; return o; };
  function soldierModels() {
    if (models) return models;
    const mk = fn => { const M = new Merger(); fn(M); return shared(M.mesh().geometry); };
    const WH = '#ffffff';
    const m = {
      infantry: { tint: mk(M => cyl(M, 0, 0, 0, 0.26, 0.32, 0.95, WH, 6)), gear: mk(M => { box(M, -0.36, 0.3, 0.05, 0.08, 0.62, 0.5, '#7a5a38'); box(M, 0.32, 0.45, 0.12, 0.05, 0.05, 0.75, '#d0ccd8'); }), head: 1.15 },
      spear: { tint: mk(M => cyl(M, 0, 0, 0, 0.25, 0.3, 0.95, WH, 6)), gear: mk(M => { cyl(M, 0.34, 0, 0.1, 0.035, 0.035, 2.4, '#8a6040', 4); cone(M, 0.34, 2.4, 0.1, 0.08, 0.3, '#d0ccd8', 4); }), head: 1.15 },
      archer: { tint: mk(M => cyl(M, 0, 0, 0, 0.23, 0.28, 0.95, WH, 6)), gear: mk(M => { box(M, -0.34, 0.25, 0.1, 0.04, 0.95, 0.04, '#8a6040'); box(M, -0.34, 0.2, 0.0, 0.03, 0.03, 0.4, '#d9d2b8'); box(M, 0.0, 0.4, -0.27, 0.13, 0.5, 0.13, '#5e4129'); }), head: 1.15 },
      cavalry: { tint: mk(M => cyl(M, 0, 0.72, 0, 0.25, 0.3, 0.7, WH, 6)), gear: mk(M => { cyl(M, 0.36, 0.5, 0.2, 0.035, 0.035, 2.6, '#8a6040', 4); cone(M, 0.36, 3.1, 0.2, 0.08, 0.3, '#d0ccd8', 4); }), head: 1.85,
        horse: mk(M => { box(M, 0, 0.55, 0, 0.55, 0.62, 1.5, '#7a5238'); for (const [x, z] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]]) cyl(M, x, 0, z, 0.07, 0.06, 0.6, '#5e3f2a', 4); box(M, 0, 0.9, 0.85, 0.28, 0.6, 0.35, '#7a5238'); box(M, 0, 1.25, 1.1, 0.26, 0.28, 0.55, '#6b4630'); box(M, 0, 0.6, -0.8, 0.1, 0.5, 0.1, '#3e2a1d'); }) }
    };
    m.headGeo = shared(new THREE.SphereGeometry(0.24, 6, 5));
    m.mats = { tint: shared(new THREE.MeshLambertMaterial({ vertexColors: true })), fixed: shared(new THREE.MeshLambertMaterial({ vertexColors: true })), head: shared(new THREE.MeshLambertMaterial({ color: '#e8c9a0' })) };
    m.engineBase = mk(M => { box(M, 0, 0.35, 0, 1.6, 0.35, 2.6, COL.woodDark); for (const [wx, wz] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]]) cyl(M, wx, 0, wz, 0.4, 0.4, 0.2, COL.wood, 8); box(M, 0, 0.6, 0, 0.2, 1.4, 0.2, COL.wood); });
    m.engineArm = mk(M => { box(M, 0, 0, 0.1, 0.2, 0.2, 3.0, COL.wood); box(M, 0, -0.1, 1.5, 0.7, 0.4, 0.7, COL.woodDark); });
    models = m; return m;
  }
  const TYPES = ['infantry', 'spear', 'archer', 'cavalry'];
  const anchors = new Map();                                              // army id -> { d, angle }: where the army is drawn, eased toward where it should be
  const polarXZ = (d, a, lat) => [Math.cos(a) * d - Math.sin(a) * lat, Math.sin(a) * d + Math.cos(a) * lat];

  function buildDynamic(L) {
    const m = soldierModels(), D = { group: new THREE.Group(), entries: [], engines: [], flags: [], shots: [], puffs: [], armies: L.armies };
    const wallH = wallHeight(L.wall.level), gc = new THREE.Color(L.color), E = D.entries;
    // Garrison
    for (let i = 0; i < L.garrison.visible; i++) {
      const type = ['infantry', 'archer', 'spear'][i % 3];
      if (L.garrison.onWall) { const a = (i + 0.5) / L.garrison.visible * TAU, p = polar(L.radius, a); E.push({ type, fx: p[0], fz: p[1], fy: wallH, yaw: Math.atan2(Math.cos(a), Math.sin(a)), color: gc, phase: i, mode: 'guard' }); }
      else { const a = i * 2.4, p = polar(9 + (i % 4) * 1.8, a); E.push({ type, fx: p[0], fz: p[1], fy: 0, yaw: Math.atan2(Math.cos(a), Math.sin(a)), color: gc, phase: i, mode: 'guard' }); }
    }
    // Armies
    L.armies.forEach((A, ai) => {
      const col = new THREE.Color(A.color), keys = ['infantry', 'spear', 'archer', 'cavalry'];
      let order = []; for (const k of keys) for (let n = 0; n < A.mix[k]; n++) order.push(k);
      const cols = Math.max(2, Math.ceil(Math.sqrt(A.soldiers * 1.6)));
      // cavalry on the flanks, archers behind, foot in front
      const rank = { infantry: 0, spear: 1, archer: 2, cavalry: 0 };
      order = order.map((type, i) => ({ type, i })).sort((p, q) => rank[p.type] - rank[q.type] || p.i - q.i);
      order.forEach(({ type }, i) => {
        const r = Math.floor(i / cols), c = i % cols, lat = (c - (cols - 1) / 2) * (type === 'cavalry' ? 1.8 : 1.3);
        E.push({ type, aid: A.id, lat, depth: r * 1.5, color: col, phase: i + ai * 7, mode: A.mode, hostile: A.hostile, routed: A.routed, out: A.moving === 'out' });
      });
      for (let k = 0; k < A.fallen; k++) E.push({ type: 'infantry', aid: A.id, lat: ((k * 37) % 11 - 5) * 1.2, depth: -2 - (k % 3) * 1.2, color: col.clone().multiplyScalar(0.55), phase: k, mode: 'fallen', fallen: true });
      for (let k = 0; k < A.siege; k++) {
        const grp = new THREE.Group(), base = new THREE.Mesh(m.engineBase, m.mats.fixed), arm = new THREE.Group(); arm.position.set(0, 1.6, 0); arm.add(new THREE.Mesh(m.engineArm, m.mats.fixed)); grp.add(base); grp.add(arm); D.group.add(grp);
        D.engines.push({ grp, arm, aid: A.id, lat: (k - (A.siege - 1) / 2) * 4.2, depth: -6, phase: k * 1.7 + ai, firing: A.mode === 'besieging', hostile: A.hostile, fired: false, out: A.moving === 'out' });
      }
      if (!anchors.has(A.id)) anchors.set(A.id, { d: A.d, angle: A.angle });
    });
    // Instanced meshes: per type a tinted body and its gear, plus heads for everyone and horses for the cavalry
    D.groups = {};
    for (const type of TYPES) {
      const list = E.filter(e => e.type === type); if (!list.length) continue;
      const body = new THREE.InstancedMesh(m[type].tint, m.mats.tint, list.length), gear = new THREE.InstancedMesh(m[type].gear, m.mats.fixed, list.length);
      list.forEach((e, i) => body.setColorAt(i, e.color));
      D.group.add(body); D.group.add(gear);
      let horse = null; if (type === 'cavalry') { horse = new THREE.InstancedMesh(m.cavalry.horse, m.mats.fixed, list.length); D.group.add(horse); }
      D.groups[type] = { list, body, gear, horse };
    }
    D.heads = new THREE.InstancedMesh(m.headGeo, m.mats.head, Math.max(1, E.length)); D.heads.count = E.length; D.group.add(D.heads);
    // Waving flags
    const fl = (x, y, z, w, h, color) => { const g = new THREE.PlaneGeometry(w, h, 6, 1); g.translate(w / 2, 0, 0); const mm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })); mm.position.set(x, y, z); D.group.add(mm); D.flags.push({ m: mm, base: g.attributes.position.array.slice(), w }); };
    const kh = { capital: 4.4, city: 3.8, town: 3.4, hamlet: 3 }[L.tier] + (L.tier === 'capital' ? 6.5 : 4.6) + 3.2 + 1.7;
    fl(0.05, kh, 0, 2.4, 1.2, L.color);
    return D;
  }

  const o3 = () => o3.o || (o3.o = new THREE.Object3D());
  function pose(e, A, dt) {
    // where one soldier stands this frame: [x, y, z, yaw, tilt]
    const ph = t * 2.2 + e.phase;
    if (e.fx !== undefined) return [e.fx, e.fy + Math.abs(Math.sin(ph * 0.5)) * 0.03, e.fz, e.yaw, 0];
    const an = anchors.get(e.aid); if (!an) return [0, -50, 0, 0, 0];
    let depth = e.depth, lat = e.lat, y = 0, tilt = 0;
    const toCity = Math.atan2(-Math.cos(an.angle), -Math.sin(an.angle)), outward = Math.atan2(Math.cos(an.angle), Math.sin(an.angle));
    let yaw = e.hostile || !A || A.moving === 'in' || A.mode === 'camp' ? toCity : outward;
    if (e.out) yaw = outward;
    if (A && A.clash && !A.hostile) yaw = outward;
    switch (e.mode) {
      case 'march': y = Math.abs(Math.sin(ph * 2.0)) * 0.1; lat += Math.sin(ph * 0.7) * 0.06; break;
      case 'camp': y = Math.max(0, Math.sin(ph * 0.4)) * 0.04; break;
      case 'besieging': y = Math.abs(Math.sin(ph)) * 0.07; depth -= Math.sin(t * 0.8 + e.phase * 0.3) * 0.5; break;
      case 'fighting': y = Math.abs(Math.sin(ph * 2.6)) * 0.14; depth += (A && A.hostile ? -1 : 1) * Math.max(0, Math.sin(ph * 2.1)) * 0.5; lat += Math.sin(ph * 3) * 0.15; break;
      case 'fallen': y = 0.18; tilt = -1.5; yaw = e.phase; break;
    }
    if (e.routed) tilt = 0.8;
    const p = polarXZ(an.d + depth, an.angle, lat);
    return [p[0], y, p[1], yaw, tilt];
  }

  function animate(dt) {
    if (!dyn) return;
    const o = o3(), m = soldierModels(), byId = {}; for (const A of dyn.armies) byId[A.id] = A;
    for (const A of layout.armies) { const an = anchors.get(A.id); if (an) { an.d += (A.d - an.d) * Math.min(1, dt * 3); an.angle = A.angle; } }
    for (const type of TYPES) {
      const g = dyn.groups[type]; if (!g) continue;
      g.list.forEach((e, i) => {
        const [x, y, z, yaw, tilt] = pose(e, byId[e.aid], dt);
        o.position.set(x, y, z); o.rotation.set(tilt, yaw, 0); o.updateMatrix();
        g.body.setMatrixAt(i, o.matrix); g.gear.setMatrixAt(i, o.matrix); if (g.horse) g.horse.setMatrixAt(i, o.matrix);
        e._m = o.matrix.elements.slice(); e._x = x; e._y = y; e._z = z;
      });
      g.body.instanceMatrix.needsUpdate = true; g.gear.instanceMatrix.needsUpdate = true; if (g.horse) g.horse.instanceMatrix.needsUpdate = true;
    }
    dyn.entries.forEach((e, i) => { if (e._x === undefined) return; o.position.set(e._x, e._y + (e.fallen ? 0.25 : (m[e.type] ? m[e.type].head : 1.15)), e._z); o.rotation.set(0, 0, 0); o.updateMatrix(); dyn.heads.setMatrixAt(i, o.matrix); });
    dyn.heads.instanceMatrix.needsUpdate = true;
    for (const f of dyn.flags) { const a = f.m.geometry.attributes.position, b = f.base; for (let i = 0; i < a.count; i++) a.setZ(i, b[i * 3 + 2] + Math.sin(t * 4 + b[i * 3] * 2.2) * 0.12 * (b[i * 3] / f.w)); a.needsUpdate = true; }
    for (const e of dyn.engines) {
      const an = anchors.get(e.aid); if (!an) continue;
      const p = polarXZ(an.d + e.depth, an.angle, e.lat); e.grp.position.set(p[0], 0, p[1]); e.x = p[0]; e.z = p[1];
      e.grp.rotation.y = e.out ? Math.atan2(Math.cos(an.angle), Math.sin(an.angle)) : Math.atan2(-Math.cos(an.angle), -Math.sin(an.angle));
      const cyc = (t * 0.5 + e.phase) % 3.2, pull = cyc < 1.8 ? cyc / 1.8 : Math.max(0, 1 - (cyc - 1.8) / 0.25);
      e.arm.rotation.x = e.firing ? -0.6 + pull * 1.2 : -0.3;
      if (e.firing && cyc >= 1.8 && !e.fired) { e.fired = true; shoot(e, an.angle); } if (cyc < 1.8) e.fired = false;
    }
    // Battle effects: arrows from archers, sparks where lines meet
    shotTimer -= dt; sparkTimer -= dt;
    if (shotTimer <= 0) { shotTimer = 0.9; volley(byId); }
    if (sparkTimer <= 0) { sparkTimer = 0.3; sparks(); }
    for (const sh of dyn.shots) { sh.u += dt / sh.dur; if (sh.u >= 1) { sh.done = true; if (sh.puff) puff(sh.tx, sh.ty, sh.tz, sh.puff); continue; } sh.m.position.set(sh.x0 + (sh.tx - sh.x0) * sh.u, sh.y0 + (sh.ty - sh.y0) * sh.u + Math.sin(sh.u * Math.PI) * sh.arc, sh.z0 + (sh.tz - sh.z0) * sh.u); if (sh.arrow) sh.m.rotation.y = Math.atan2(sh.tx - sh.x0, sh.tz - sh.z0); }
    dyn.shots = dyn.shots.filter(s => { if (s.done) dyn.group.remove(s.m); return !s.done; });
    for (const p of dyn.puffs) { p.u += dt * p.speed; p.m.scale.setScalar(p.s0 + p.u * p.grow); p.m.material.opacity = Math.max(0, 0.75 - p.u * 0.75); if (p.u >= 1) p.done = true; }
    dyn.puffs = dyn.puffs.filter(p => { if (p.done) { dyn.group.remove(p.m); p.m.material.dispose(); } return !p.done; });
  }
  let shotMat = null, arrowMat = null, shotTimer = 0, sparkTimer = 0;
  function shoot(e, angle) {                                                // a stone from a siege engine toward the wall
    if (!layout || dyn.shots.length > 12) return;
    const R = layout.radius, a = angle + (Math.random() - 0.5) * 0.5, tx = Math.cos(a) * R, tz = Math.sin(a) * R;
    if (!shotMat) shotMat = shared(new THREE.MeshLambertMaterial({ color: '#4a4650' }));
    const mm = new THREE.Mesh(sharedGeo('stone', () => new THREE.SphereGeometry(0.35, 6, 5)), shotMat); dyn.group.add(mm);
    dyn.shots.push({ m: mm, u: 0, dur: 1.1, arc: 9, x0: e.x, y0: 1.8, z0: e.z, tx, ty: 2, tz, puff: '#d8d0c0' });
  }
  const geos = {}; const sharedGeo = (k, f) => geos[k] || (geos[k] = shared(f()));
  function volley(byId) {                                                    // archers of armies in battle or besieging shoot at the other side
    if (dyn.shots.length > 14) return;
    const g = dyn.groups.archer; if (!g) return;
    if (!arrowMat) arrowMat = shared(new THREE.MeshLambertMaterial({ color: '#e8e0c8' }));
    const picks = g.list.filter(e => e._x !== undefined && !e.fallen && (e.mode === 'fighting' || e.mode === 'besieging') && Math.random() < 0.25).slice(0, 3);
    for (const e of picks) {
      const A = byId[e.aid]; if (!A) continue;
      let tx, tz;
      if (A.mode === 'fighting') { const foe = dyn.armies.find(x => x.hostile !== A.hostile && x.mode === 'fighting' && (x.engaged.includes(A.id) || A.engaged.includes(x.id))); const an = foe && anchors.get(foe.id); if (!an) continue; const p = polarXZ(an.d, an.angle, (Math.random() - 0.5) * 8); tx = p[0]; tz = p[1]; }
      else { const R = layout.radius, a = A.angle + (Math.random() - 0.5) * 0.4; tx = Math.cos(a) * R; tz = Math.sin(a) * R; }
      const mm = new THREE.Mesh(sharedGeo('arrow', () => new THREE.BoxGeometry(0.05, 0.05, 0.8)), arrowMat); dyn.group.add(mm);
      dyn.shots.push({ m: mm, arrow: true, u: 0, dur: 0.8, arc: 5, x0: e._x, y0: 1.4, z0: e._z, tx, ty: 1.2, tz, puff: null });
    }
  }
  function sparks() {
    for (const A of dyn.armies) {
      if (!A.clash || A.hostile) continue;
      const an = anchors.get(A.id); if (!an) continue;
      const p = polarXZ(an.d + 2.5, an.angle, (Math.random() - 0.5) * 10); puff(p[0], 1.2 + Math.random(), p[1], '#ffd070', 0.25, 1.1, 3.2);
    }
  }
  function puff(x, y, z, color, s0, grow, speed) {
    if (dyn.puffs.length > 40) return;
    const mm = new THREE.Mesh(sharedGeo('puff', () => new THREE.SphereGeometry(0.7, 6, 5)), new THREE.MeshBasicMaterial({ color: color || '#d8d0c0', transparent: true, opacity: 0.75 })); mm.position.set(x, y, z); dyn.group.add(mm);
    dyn.puffs.push({ m: mm, u: 0, s0: s0 || 0.6, grow: grow || 2.2, speed: speed || 1.6 });
  }

  // ---------------- scene lifecycle ----------------
  function dispose(obj) { obj.traverse(n => { if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose(); if (n.material) { (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => { if (!m.userData.shared) m.dispose(); }); } }); }

  function rebuildStatic(L) {
    for (const o of [staticMesh, ground, water]) if (o) { scene.remove(o); dispose(o); }
    const M = new Merger(); buildCity(M, L); staticMesh = M.mesh(); scene.add(staticMesh);
    ground = buildGround(L); scene.add(ground);
    water = null;
    if (L.water) { const g = new THREE.CircleGeometry(L.water.radius, 28); g.rotateX(-Math.PI / 2); const p = polar(L.water.r, L.water.angle); g.translate(p[0], 0.08, p[1]); water = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: COL.water, transparent: true, opacity: 0.88 })); scene.add(water); }
    const ext = Math.max(L.radius + 14, 36, ...L.armies.map(a => a.d + 8));                   // wide enough to see the armies outside the walls
    cam.minD = L.radius * 1.2; cam.maxD = Math.max(L.radius * 5.5, ext * 4.5); cam.dist = Math.min(cam.maxD, Math.max(cam.minD, cam.dist || ext * (innerWidth < innerHeight ? 3.0 : 2.0)));
    stats.tris = M.tris;
  }
  function rebuildDynamic(L) {
    if (dyn) { scene.remove(dyn.group); dispose(dyn.group); }
    dyn = buildDynamic(L); scene.add(dyn.group);
    const live = new Set(L.armies.map(a => a.id)); for (const k of [...anchors.keys()]) if (!live.has(k)) anchors.delete(k);
  }
  const stats = { tris: 0 };

  function init(canvasEl, uiRef) { canvas = canvasEl; ui = uiRef; }

  function ensureRenderer() {
    if (renderer) return ok;
    try {
      if (!window.THREE) throw new Error('three.js is missing');
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      scene = new THREE.Scene(); scene.background = new THREE.Color('#5b6fa0'); scene.fog = new THREE.Fog('#5b6fa0', 90, 230);
      camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
      scene.add(new THREE.HemisphereLight('#dfe6ff', '#4a3f30', 0.62));
      const sun = new THREE.DirectionalLight('#fff0d0', 0.62); sun.position.set(30, 50, 22); scene.add(sun);
      canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); cam.auto = false; }, { passive: false });
      addEventListener('resize', resize); resize(); ok = true;
    } catch (e) { ok = false; renderer = null; }
    return ok;
  }

  function resize() {
    if (!renderer) return; renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight;
    if (innerWidth > 720) camera.setViewOffset(innerWidth, innerHeight, -185, 0, innerWidth, innerHeight);      // keep the city clear of the side panel
    else camera.setViewOffset(innerWidth, innerHeight, 0, 70, innerWidth, innerHeight);                         // on a phone the panel is a sheet at the bottom
    camera.updateProjectionMatrix();
  }
  const zoom = k => { cam.dist = Math.max(cam.minD, Math.min(cam.maxD, cam.dist * k)); };
  function down(e) { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); cam.auto = false; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } }
  function move(e) {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoom(pinch / d); pinch = d; }
    else { cam.yaw -= dx * 0.008; cam.pitch = Math.max(0.3, Math.min(1.3, cam.pitch + dy * 0.005)); }
  }
  function up(e) { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; }

  function open(id) {
    if (!ensureRenderer()) return false;
    cityId = id; sig = ''; sigA = ''; anchors.clear(); shown = true; cam.auto = false; cam.yaw = 0; cam.dist = 0;      // yaw 0 looks north from the south, so the roads point the way they do on the map
    canvas.classList.add('on'); resize(); refresh(true);
    const foe = layout.armies.find(a => a.hostile) || layout.armies[0];                  // start by looking at the action
    if (foe) { cam.yaw = Math.atan2(-Math.cos(foe.angle), -Math.sin(foe.angle)) + 0.3; cam.auto = false; }
    return true;
  }
  function close() { shown = false; cityId = -1; canvas.classList.remove('on'); }

  let sigA = '';
  function refresh(force) {
    if (cityId < 0) return;
    const L = VM.CityLayout.build(ui.state, cityId); layout = L;
    if (force || L.sigStatic !== sig) { sig = L.sigStatic; rebuildStatic(L); sigA = null; }
    if (force || L.sigArmies !== sigA) { sigA = L.sigArmies; rebuildDynamic(L); }
  }

  let acc = 0;
  function frame(dt) {
    if (!shown || !renderer) return;
    t += dt; acc += dt; if (acc > 0.3) { acc = 0; refresh(false); }
    if (cam.auto) cam.yaw += dt * 0.05;
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, 1.5, cam.tz);
    animate(dt);
    renderer.render(scene, camera);
  }

  return {
    init, open, close, frame, refresh, supported: () => ensureRenderer(), isOpen: () => shown, id: () => cityId, layout: () => layout,
    info: () => renderer ? { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, staticTriangles: stats.tris, soldiers: dyn ? dyn.entries.length : 0, calls3d: 0 } : null,
    camera: cam
  };
})();
