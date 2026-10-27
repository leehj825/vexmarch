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
  let staticMesh = null, ground = null, water = null, dyn = null, texMeshes = [];
  const cam = { yaw: 0.8, pitch: 0.82, dist: 40, minD: 20, maxD: 120, auto: true, tx: 0, tz: 0 };
  const pointers = new Map(); let pinch = 0, mid = null, panning = false;

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
  // The textured models of Nightfall Settlement (tree, tent, well, smithy, range, campfire, fence, wall): decoded once, then merged per texture, so the
  // whole set costs four draw calls however many are placed.
  const structGeos = {}, structMats = {};
  function structGeo(key) {
    if (structGeos[key]) return structGeos[key];
    const d = VM.StructModels.parts[key], u = (s, T) => { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new T(a.buffer); };
    const p = u(d.pos, Int16Array), uv = u(d.uv, Uint16Array), nr = u(d.nor, Int8Array), idx = u(d.idx, Uint16Array);
    return (structGeos[key] = { t: d.t, p: Float32Array.from(p, v => v / 1000), n: Float32Array.from(nr, v => v / 127), uv: Float32Array.from(uv, v => v / 65535), idx });
  }
  function TexMerger() { this.by = {}; this.tris = 0; }
  TexMerger.prototype.add = function (key, x, y, z, rot, sx, sy, sz) {            // model with its front toward +z, scaled, turned about Y by rot, set down at (x, y, z)
    if (!VM.StructModels) return;
    const g = structGeo(key), gk = key === 'wall' ? 'wall' : g.t, B = this.by[gk] || (this.by[gk] = { pos: [], nor: [], uv: [], idx: [] }), base = B.pos.length / 3, c = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    sx = sx || 1; sy = sy || sx; sz = sz || sx;
    for (let i = 0; i < g.p.length; i += 3) {
      const px = g.p[i] * sx, py = g.p[i + 1] * sy, pz = g.p[i + 2] * sz, nx = g.n[i], ny = g.n[i + 1], nz = g.n[i + 2];
      B.pos.push(px * c + pz * sn + x, py + y, -px * sn + pz * c + z); B.nor.push(nx * c + nz * sn, ny, -nx * sn + nz * c);
    }
    for (let i = 0; i < g.uv.length; i++) B.uv.push(g.uv[i]);
    for (let i = 0; i < g.idx.length; i++) B.idx.push(g.idx[i] + base);
    this.tris += g.idx.length / 3;
  };
  // a plain geometry (a box, a tower) with its base at yb and turned about Y by rot, into the stone bucket; the UVs are planar, so the stone texture runs on every face
  TexMerger.prototype.addGeo = function (g, x, yb, z, rot, U) {
    const P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index ? g.index.array : null, unit = U || 2.2;
    const B = this.by.wall || (this.by.wall = { pos: [], nor: [], uv: [], idx: [] }), base = B.pos.length / 3, c = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    for (let i = 0; i < P.length; i += 3) {
      const px = P[i], py = P[i + 1], pz = P[i + 2], nx = N[i], ny = N[i + 1], nz = N[i + 2];
      B.pos.push(px * c + pz * sn + x, py + yb, -px * sn + pz * c + z); B.nor.push(nx * c + nz * sn, ny, -nx * sn + nz * c);
      B.uv.push((Math.abs(nx) > Math.abs(nz) ? pz : px) / unit, py / unit);
    }
    if (I) for (let i = 0; i < I.length; i++) B.idx.push(I[i] + base);
    else for (let i = 0; i < P.length / 3; i++) B.idx.push(base + i);
    this.tris += (I ? I.length : P.length / 3) / 3;
  };
  TexMerger.prototype.meshes = function () {
    return Object.keys(this.by).map(t => {
      const B = this.by[t], geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      geo.setIndex(B.idx);
      if (t === 'wall' && !structMats.wall) {                                      // the brick wall, turned into grey castle stone: the texture's light and dark, none of its red
        const tex = new THREE.TextureLoader().load(VM.StructModels.tex.t3); tex.flipY = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        const m = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(0x2c2c30), side: THREE.DoubleSide });
        m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); l = clamp((l - 0.5) * 2.4 + 0.5, 0.0, 1.0); diffuseColor.rgb = vec3(l) * 0.9; }'); };
        m.customProgramCacheKey = () => 'vmwall'; m.userData.shared = true; structMats.wall = m;
      }
      if (t !== 'wall' && !structMats[t]) { const tex = new THREE.TextureLoader().load(VM.StructModels.tex[t]); tex.flipY = true; structMats[t] = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(0x585858), emissiveMap: tex, side: THREE.DoubleSide }); structMats[t].userData.shared = true; }
      return new THREE.Mesh(geo, structMats[t]);
    });
  };
  let tx = null;                                                                  // the TexMerger of the city being built
  const facing = (x, z) => Math.atan2(-x, -z);                                     // turn about Y that points a model's front (+z) at the city centre
  const yawFor = (dx, dz) => -Math.atan2(dz, dx);                 // rotation about Y that turns local +x toward (dx, dz) in the x/z plane
  const place = (g, x, y, z, rot) => { if (rot) g.rotateY(rot); g.translate(x, y, z); return g; };
  // a stone piece of the wall, tower or gate: the stone texture of the Nightfall wall when the models are loaded, the plain colour otherwise
  const stonePiece = (M, g, x, yb, z, rot, shade) => { if (VM.StructModels && tx) tx.addGeo(g, x, yb, z, rot); else M.add(place(g, x, yb, z, rot), COL.stone, shade); };
  const stoneBox = (M, x, yb, z, w, h, d, rot, shade) => stonePiece(M, new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, yb, z, rot, shade);
  const stoneCyl = (M, x, yb, z, rt, rb, h, seg, shade) => stonePiece(M, new THREE.CylinderGeometry(rt, rb, h, seg || 8).translate(0, h / 2, 0), x, yb, z, 0, shade);
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

  // A house in Nightfall's village style: plaster walls in a timber frame, a gabled roof, a door with a lintel, shuttered windows with flower boxes, a
  // chimney with a cap, and now and then a lean-to shed. In hamlets some of the homes are tents.
  // h.style: 0 a tent, 1 a timber house, 2 a stone house with a slate roof (the stage of the place decides, see CityLayout)
  const STONE = ['#bdb7aa', '#aeab9f', '#c8bfae'], SLATE = ['#5f6777', '#6d5c52', '#52706a'];
  function house(M, h, ci, accent) {
    if (h.style === 0 && VM.StructModels) { tx.add('tent', h.x, 0, h.z, facing(h.x, h.z) + (ci % 2 ? 0.3 : -0.3), 0.85); if (ci % 2) box(M, h.x + 1.6, 0, h.z + 0.9, 0.5, 0.45, 0.5, COL.wood, ci); return; }
    const stone = h.style === 2, post = stone ? '#d6d1c4' : COL.woodDark;
    const dist = h.district !== undefined ? h.district : ci, base = stone ? STONE[dist % 3] : [COL.plaster, COL.plaster2, COL.plaster3][dist % 3], c = Math.cos(h.rot), sn = Math.sin(h.rot);     // a district (the houses facing one street) shares its facade colour
    const lb = (lx, yb, lz, w, hh, d, color, shade) => M.add(place(new THREE.BoxGeometry(w, hh, d).translate(lx, yb + hh / 2, lz), h.x, 0, h.z, h.rot), color, shade);
    box(M, h.x, 0, h.z, h.w + 0.12, 0.2, h.d + 0.12, COL.stoneDark, h.rot);                                    // stone footing
    box(M, h.x, 0.2, h.z, h.w, h.h - 0.2, h.d, base, h.rot, 0.96 + (ci % 3) * 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lb(sx * h.w / 2, 0.2, sz * h.d / 2, 0.14, h.h - 0.2, 0.14, post);   // corner posts
    for (const sz of [-1, 1]) lb(0, h.h - 0.14, sz * h.d / 2, h.w + 0.08, 0.1, 0.1, post);                // beams under the roof
    for (const sx of [-1, 1]) lb(sx * h.w / 2, h.h - 0.14, 0, 0.1, 0.1, h.d + 0.08, post);
    if (ci % 2 === 0) for (const sx of [-1, 1]) lb(sx * h.w * 0.28, 0.35, h.d / 2 + 0.03, 0.08, h.h - 0.6, 0.06, COL.woodDark);   // a brace pair on the front
    gable(M, h.x, h.h, h.z, h.w, h.d, 0.9, h.rot, stone ? SLATE[h.roof % 3] : h.roof === 2 ? accent : COL.roofs[h.roof]);
    lb(0, h.h + 0.88, 0, h.w + 0.5, 0.08, 0.1, COL.woodDark);                                                      // ridge beam
    const dOff = ((ci * 7) % 3 - 1) * h.w * 0.18;
    lb(dOff, 0.2, h.d / 2 + 0.03, 0.42, 0.85, 0.06, COL.door); lb(dOff, 1.05, h.d / 2 + 0.05, 0.56, 0.08, 0.1, COL.woodDark);   // door and lintel
    for (const sx of [-1, 1]) {
      const wx = sx * h.w * 0.32; if (Math.abs(wx - dOff) < 0.5) continue;
      lb(wx, 0.55, h.d / 2 + 0.03, 0.3, 0.3, 0.06, '#f2c879');                                                    // a lit window with shutters and a flower box
      for (const k of [-1, 1]) lb(wx + k * 0.24, 0.5, h.d / 2 + 0.05, 0.1, 0.4, 0.06, COL.woodDark);
      lb(wx, 0.42, h.d / 2 + 0.12, 0.38, 0.1, 0.14, (ci + sx) % 2 ? '#c0504a' : '#d8a02a');
    }
    if (h.chimney) { const cx = c * h.w * 0.25, cz = -sn * h.w * 0.25; box(M, h.x + cx, h.h + 0.2, h.z + cz, 0.35, 0.9, 0.35, COL.stoneDark); box(M, h.x + cx, h.h + 1.1, h.z + cz, 0.46, 0.1, 0.46, COL.stone); }
    if (ci % 4 === 1) { const side = ci % 8 === 1 ? 1 : -1; lb(side * (h.w / 2 + 0.45), 0, -0.1, 0.9, 0.9, h.d * 0.6, base, 0.92); lb(side * (h.w / 2 + 0.45), 0.9, -0.1, 1.05, 0.08, h.d * 0.7, COL.woodDark); }
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
      box(M, dx * R * 0.5, 0, dz * R * 0.5, R, 0.05, L.paved ? 3.2 : 2.4, L.paved ? '#a39d8e' : COL.dirt, yawFor(dx, dz), L.paved ? 1 : 0.9);
    }
    for (const st of L.streets) if (!st.gate) {                            // cross streets between the gates: the same road as a gate's, from the keep to the wall
      const dx = Math.cos(st.angle), dz = Math.sin(st.angle);
      box(M, dx * R * 0.5, 0, dz * R * 0.5, R, 0.05, L.paved ? 3.2 : 2.4, L.paved ? '#a39d8e' : COL.dirt, yawFor(dx, dz), L.paved ? 1 : 0.9);
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
      stoneBox(M, x, 0, z, chord, h, th, rot, s.damage ? 0.8 : 1);
      if (s.damage === 1) box(M, x + 0.3, 0, z, 0.9, 0.5, 0.9, COL.rockDark, 0.6);
      else if (lvl >= 2 && i % 2 === 0) { for (const off of [-0.55, 0.55]) { const ox = Math.cos(s.angle + Math.PI / 2) * chord * off * 0.5, oz = Math.sin(s.angle + Math.PI / 2) * chord * off * 0.5; box(M, x + ox - 0.0, h, z + oz, 0.7, 0.5, th * 0.5, COL.stoneDark, rot); } }
    });
    for (const a of W.towers) {
      const [x, z] = polar(R, a), th2 = lvl >= 2 ? 1.5 : 1.1, hh = wh + (lvl >= 2 ? 1.4 : 0.8);
      stoneCyl(M, x, 0, z, th2, th2 * 1.1, hh, 8);
      if (lvl >= 2) cone(M, x, hh, z, th2 * 1.3, 1.7, accent, 8); else cyl(M, x, hh, z, th2 * 1.15, th2 * 1.15, 0.35, COL.stoneDark, 8);
    }
    for (const g of L.gates) {                                              // the gate: an arch between two heavier towers
      const [x, z] = polar(R, g.angle), rot = yawFor(-Math.sin(g.angle), Math.cos(g.angle)), broken = L.wall.hpFrac <= 0 && L.besieged;
      stoneBox(M, x, wh * 0.72, z, 3.8, wh * 0.28, th + 0.3, rot);
      if (!broken) box(M, x - Math.cos(g.angle) * 0.0, 0, z, 0.35, wh * 0.72, 3.0, COL.door, rot + Math.PI / 2, 0.9);
      else box(M, x + 0.5, 0, z + 0.3, 1.1, 0.7, 1.1, COL.rockDark, 0.4);
      box(M, x, wh + 0.3, z, 0.12, 1.6, 0.12, COL.woodDark, 0);
      box(M, x, wh + 1.2, z, 0.1, 0.7, 1.0, L.color, rot);
    }
  }

  // The plaza round the keep (paved from the second stage), the well, and the monument of a great city
  function buildSquare(M, L) {
    if (L.plaza) { cyl(M, 0, 0, 0, L.plaza.r, L.plaza.r, 0.07, '#b3ad9d', 28, 1); cyl(M, 0, 0.07, 0, L.plaza.r - 1.2, L.plaza.r - 1.2, 0.02, '#a49e8f', 28, 1); }
    if (VM.StructModels) tx.add('well', L.well.x, 0, L.well.z, 0, 0.8);
    else { cyl(M, L.well.x, 0, L.well.z, 0.8, 0.9, 0.8, COL.stone, 8); }
    if (L.monument) {
      const m = L.monument;
      box(M, m.x, 0, m.z, 2.6, 0.5, 2.6, COL.stoneLight); box(M, m.x, 0.5, m.z, 1.9, 0.5, 1.9, COL.stone); cyl(M, m.x, 1.0, m.z, 0.5, 0.75, 4.2, COL.stoneLight, 4); ball(M, m.x, 5.4, m.z, 0.42, COL.gold, 6);
      box(M, m.x, 3.6, m.z + 0.52, 0.8, 1.1, 0.06, L.color, 0);
    }
  }

  // Works outside the walls that a city's buildings and trade bring: a windmill, a lumber camp and a quarry
  function buildWork(M, w) {
    const rot = facing(w.x, w.z), lg = (g, color, shade) => { g.rotateY(rot); g.translate(w.x, 0, w.z); M.add(g, color, shade); };
    const lbx = (lx, yb, lz, bw, bh, bd, color, rz) => { const g = new THREE.BoxGeometry(bw, bh, bd); if (rz) g.rotateZ(rz); g.translate(lx, yb + bh / 2, lz); lg(g, color); };
    if (w.kind === 'windmill') {
      M.add(place(new THREE.CylinderGeometry(1.15, 1.9, 5.4, 8).translate(0, 2.7, 0), w.x, 0, w.z, 0), COL.plaster3);
      M.add(place(new THREE.ConeGeometry(1.6, 1.8, 8).translate(0, 0.9, 0), w.x, 5.4, w.z, 0), COL.woodDark);
      lbx(0, 0, 1.75, 0.8, 1.5, 0.12, COL.door); lbx(0, 4.3, 1.2, 0.4, 0.4, 0.8, COL.woodDark);
      for (let k = 0; k < 4; k++) { const g = new THREE.BoxGeometry(0.75, 3.6, 0.07); g.translate(0, 1.8, 0); g.rotateZ(k * Math.PI / 2 + 0.5); g.translate(0, 4.5, 1.7); lg(g, k % 2 ? '#d8cfae' : '#c8bd94'); }
      for (let k = 0; k < 3; k++) cyl(M, w.x + Math.cos(k * 2.1) * 2.6, 0, w.z + Math.sin(k * 2.1) * 2.6, 0.38, 0.38, 0.6, COL.hay, 6);
    } else if (w.kind === 'lumber') {
      lbx(0, 0, 0, 3.2, 1.9, 2.5, COL.wood); lbx(0, 1.9, 0, 3.6, 0.2, 2.9, COL.woodDark, 0.0);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1.9, 0, -1.5, 1.9, 0, -1.5, 1.9, 0, 1.5, -1.9, 0, -1.5, 1.9, 0, 1.5, -1.9, 0, 1.5, -1.9, 0, -1.5, -1.9, 0, 1.5, 0, 1.1, 0, 1.9, 0, 1.5, 1.9, 0, -1.5, 0, 1.1, 0, -1.9, 0, -1.5, 1.9, 0, -1.5, 0, 1.1, 0, -1.9, 0, -1.5, 0, 1.1, 0, -1.9, 0, 1.5, 1.9, 0, 1.5, -1.9, 0, 1.5, 0, 1.1, 0, 1.9, 0, 1.5, 0, 1.1, 0, 1.9, 0, -1.5], 3)); g.translate(0, 2.0, 0); lg(g, COL.roofs[1]);
      for (let k = 0; k < 6; k++) { const lg2 = new THREE.CylinderGeometry(0.28, 0.28, 3.0, 6); lg2.rotateZ(Math.PI / 2); lg2.translate(0.2, 0.28 + Math.floor(k / 3) * 0.5, 3.0 + (k % 3) * 0.56 - (k > 2 ? 0.28 : 0)); lg(lg2, k % 2 ? '#8a6040' : '#79532f'); }
      for (const k of [-1, 1]) { const st = new THREE.CylinderGeometry(0.4, 0.45, 0.5, 7); st.translate(k * 3.4, 0.25, -1.4); lg(st, '#9a7650'); }
      lbx(3.4, 0.5, -1.4, 0.08, 0.7, 0.08, COL.woodDark); lbx(3.0, 1.0, -1.4, 0.6, 0.08, 0.1, COL.stoneDark);
    } else if (w.kind === 'quarry') {
      for (let k = 0; k < 4; k++) { const c = new THREE.ConeGeometry(1.2 - k * 0.15, 1.7 + (k % 2), 5); c.translate(-1.6 + k * 1.2, 0.9, -1.1 + (k % 2) * 0.9); lg(c, k % 2 ? COL.rock : COL.rockDark); }
      for (let k = 0; k < 5; k++) lbx(-2.3 + (k % 3) * 1.15, Math.floor(k / 3) * 0.55, 1.6, 1.0, 0.55, 0.8, k % 2 ? COL.stoneLight : COL.stone);
      for (const k of [-1, 1]) lbx(2.6 + k * 0.8, 0, -0.2, 0.18, 2.6, 0.18, COL.woodDark); lbx(2.6, 2.5, -0.2, 2.1, 0.16, 0.16, COL.woodDark); lbx(2.6, 1.0, -0.2, 0.05, 1.5, 0.05, COL.stoneDark);
      lbx(2.7, 0.0, 1.7, 1.4, 0.7, 1.0, COL.wood); for (const k of [-1, 1]) { const wh = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 8); wh.rotateX(Math.PI / 2); wh.translate(2.7 + k * 0.5, 0.3, 2.2); lg(wh, COL.woodDark); wh.dispose; }
    }
  }

  function buildCity(M, L) {
    const accent = L.color, R = L.radius, rnd = mulberry(L.id * 7919 + 5);
    buildKeep(M, L);
    buildWalls(M, L, accent);
    buildSquare(M, L);
    L.works.forEach(w => buildWork(M, w));
    L.houses.forEach((h, i) => house(M, h, i, accent));
    L.suburb.forEach((h, i) => house(M, h, i + 3, accent));
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
    for (const tnt of B.tents) { if (VM.StructModels) tx.add('tent', tnt.x, 0, tnt.z, facing(tnt.x, tnt.z), 0.8); else cone(M, tnt.x, 0, tnt.z, 1.7, 1.9, '#d9c79a', 6); }
    if (L.smith.on && VM.StructModels) tx.add('smith', L.smith.x, 0, L.smith.z, facing(L.smith.x, L.smith.z), 0.85);
    B.dummies.forEach((d, di) => {
      if (VM.StructModels && di === 0) { tx.add('campfire', d.x, 0, d.z, 0, 0.9); return; }
      if (VM.StructModels && B.level >= 3) { tx.add('range', d.x, 0, d.z, facing(d.x, d.z), 0.85); return; }
      cyl(M, d.x, 0, d.z, 0.1, 0.12, 1.5, COL.woodDark, 5); box(M, d.x, 1.1, d.z, 1.0, 0.12, 0.12, COL.wood); ball(M, d.x, 1.7, d.z, 0.22, COL.hay, 5);
    });
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
      for (let r = 0; r < 5; r++) { const o = (r - 2) * (f.d / 5.2), c = Math.sin(f.rot), sn = Math.cos(f.rot); box(M, f.x + c * o, 0.08, f.z + sn * o, f.w * 0.88, 0.3, 0.5, f.crop ? COL.wheat : COL.crop, f.rot); }
    }
    for (const fh of L.farmhouses) { box(M, fh.x, 0, fh.z, 3.2, 1.8, 2.4, COL.plaster2, -fh.rot); gable(M, fh.x, 1.8, fh.z, 3.2, 2.4, 1.3, -fh.rot, COL.roofs[1]); cyl(M, fh.x + 2.6, 0, fh.z, 0.55, 0.65, 2.2, COL.hay, 7); }
    // Features
    for (const f of L.features) {
      if (f.kind === 'tree' && VM.StructModels) tx.add('tree', f.x, 0, f.z, f.rot, 0.85 * f.size / 2.2 + 0.15);
      else if (f.kind === 'tree') { cyl(M, f.x, 0, f.z, 0.18, 0.24, 1.3 * f.size / 2.2, COL.woodDark, 5); cone(M, f.x, 1.0 * f.size / 2.2, f.z, 1.1 * f.size / 2.2, 2.2 * f.size / 2.2, rnd() < 0.5 ? COL.leaf : COL.leaf2, 6); }
      else if (f.kind === 'rock') { cone(M, f.x, 0, f.z, f.size * 0.7, f.size * 1.3, COL.rock, 5); cone(M, f.x + f.size * 0.6, 0, f.z, f.size * 0.45, f.size * 0.8, COL.rockDark, 5); }
      else if (f.kind === 'ore') { box(M, f.x, 0, f.z, f.size, f.size * 0.7, f.size, COL.rockDark, f.rot); box(M, f.x + 0.2, f.size * 0.6, f.z, f.size * 0.4, f.size * 0.4, f.size * 0.4, '#d2823a', f.rot); }
      else if (f.kind === 'paddock') { for (let k = 0; k < 14; k++) { const a = k * TAU / 14, p = polar(f.size * 0.7, a); if (VM.StructModels) tx.add('fence', f.x + p[0], 0, f.z + p[1], yawFor(-Math.sin(a), Math.cos(a)), 0.8); else cyl(M, f.x + p[0], 0, f.z + p[1], 0.07, 0.07, 1.0, COL.woodDark, 4); } for (let k = 0; k < 3; k++) { const p = polar(f.size * 0.3, k * 2.1 + f.rot); box(M, f.x + p[0], 0.5, f.z + p[1], 1.4, 0.7, 0.5, k % 2 ? '#8a5a3a' : '#c9b8a0', f.rot + k); box(M, f.x + p[0] + 0.7, 0.9, f.z + p[1], 0.35, 0.6, 0.3, k % 2 ? '#8a5a3a' : '#c9b8a0', f.rot + k); } }
      else if (f.kind === 'stones') { for (let k = 0; k < 8; k++) { const p = polar(f.size, k * TAU / 8); box(M, f.x + p[0], 0, f.z + p[1], 0.7, 2.2 + (k % 2), 0.5, COL.stoneLight, k * 0.8); } box(M, f.x, 0, f.z, 1.2, 0.8, 1.2, COL.stone); ball(M, f.x, 1.3, f.z, 0.35, COL.glow, 6); }
      else if (f.kind === 'banner') { cyl(M, f.x, 0, f.z, 0.06, 0.06, 3, COL.woodDark, 4); box(M, f.x + 0.5, 1.7, f.z, 1.0, 1.2, 0.05, COL.gold, 0); }
      else if (f.kind === 'well' && VM.StructModels) tx.add('well', f.x, 0, f.z, 0, 0.8);
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
  // The soldiers are the simple animated figures of js/view3d/crowd.js: sword and shield, spear, bow, and spearmen on horses, all playing the clips of
  // Nightfall Settlement and Deepward. Each kind is one instanced mesh (plus one for the horses), tinted with the faction colour.
  let models = null, CR = null;
  const crowd = () => CR || (CR = VM.Crowd.create(THREE));
  const shared = o => { o.userData.shared = true; return o; };
  function soldierModels() {
    if (models) return models;
    const mk = fn => { const M = new Merger(); fn(M); return shared(M.mesh().geometry); };
    const m = { mats: { fixed: shared(new THREE.MeshLambertMaterial({ vertexColors: true })) } };
    m.ladder = mk(M => { for (const x of [-0.3, 0.3]) box(M, x, 0, 0, 0.08, 4.4, 0.1, COL.wood); for (let i = 0; i < 9; i++) box(M, 0, 0.3 + i * 0.47, 0, 0.62, 0.06, 0.08, COL.woodDark); });
    m.engineBase = mk(M => { box(M, 0, 0.35, 0, 1.6, 0.35, 2.6, COL.woodDark); for (const [wx, wz] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]]) cyl(M, wx, 0, wz, 0.4, 0.4, 0.2, COL.wood, 8); box(M, 0, 0.6, 0, 0.2, 1.4, 0.2, COL.wood); });
    m.engineArm = mk(M => { box(M, 0, 0, 0.1, 0.2, 0.2, 3.0, COL.wood); box(M, 0, -0.1, 1.5, 0.7, 0.4, 0.7, COL.woodDark); });
    models = m; return m;
  }
  const TYPES = ['infantry', 'spear', 'archer', 'cavalry'], ROLE = { infantry: 'sword', spear: 'spear', archer: 'archer', cavalry: 'rider' };
  let conq = null, prevOwner = null, fleeing = [];
  const assaultSince = new Map();                                         // army id -> when its assault began (kept across rebuilds, so the waves never restart)
  const anchors = new Map();                                              // army id -> { d, angle }: where the army is drawn, eased toward where it should be
  const polarXZ = (d, a, lat) => [Math.cos(a) * d - Math.sin(a) * lat, Math.sin(a) * d + Math.cos(a) * lat];

  function buildDynamic(L) {
    const m = soldierModels(), D = { group: new THREE.Group(), entries: [], engines: [], flags: [], shots: [], puffs: [], armies: L.armies };
    const wallH = wallHeight(L.wall.level), gc = new THREE.Color(L.color), E = D.entries;
    // Garrison: archers on the wall top and the rest behind the gate on the side that is attacked (a calm city has them spread round the wall); when the gate
    // falls the foot come forward to meet the attackers in the breach
    const att = L.armies.find(a => a.assault), breach = L.armies.some(a => a.breach), gl = [];
    for (const k of ['archer', 'spear', 'infantry', 'cavalry']) for (let n = 0; n < (L.garrison.mix[k] || 0); n++) gl.push(k);
    let ia = 0, ib = 0;
    gl.forEach((type, i) => {
      const spread = (n, step) => ((n % 9) - 4) * step + (Math.floor(n / 9) % 2) * step * 0.5;
      if (L.garrison.onWall && att && type === 'archer') { const a = att.angle + spread(ia++, 0.075), p = polar(L.radius, a); E.push({ type, fx: p[0], fz: p[1], fy: wallH, ang: a, yaw: Math.atan2(Math.cos(a), Math.sin(a)), color: gc, phase: i, mode: 'guard' }); }
      else if (L.garrison.onWall && att) {
        const row = Math.floor(ib / 9), a = att.angle + spread(ib++, 0.09), p = polar(breach ? L.radius * 0.8 - row * 1.5 : L.radius - 3.4 - row * 1.5, a);
        E.push({ type, fx: p[0], fz: p[1], fy: 0, ang: a, yaw: Math.atan2(Math.cos(a), Math.sin(a)), color: gc, phase: i, mode: 'guard' });
      } else if (L.garrison.onWall) { const a = (i + 0.5) / gl.length * TAU, p = polar(L.radius, a); E.push({ type, fx: p[0], fz: p[1], fy: wallH, ang: a, yaw: Math.atan2(Math.cos(a), Math.sin(a)), color: gc, phase: i, mode: 'guard' }); }
      else { const a = i * 2.4, p = polar(9 + (i % 4) * 1.8, a); E.push({ type, fx: p[0], fz: p[1], fy: 0, ang: a, yaw: Math.atan2(Math.cos(a), Math.sin(a)), color: gc, phase: i, mode: 'guard' }); }
    });
    // Armies
    L.armies.forEach((A, ai) => {
      const col = new THREE.Color(A.color), keys = ['infantry', 'spear', 'archer', 'cavalry'];
      let order = []; for (const k of keys) for (let n = 0; n < A.mix[k]; n++) order.push(k);
      // Roles: infantry and spearmen form the front, archers stand in the rows behind them, cavalry wait on the wings (and charge, fall back and swing round: see pose)
      const foot = order.filter(t => t !== 'cavalry'), horse = order.filter(t => t === 'cavalry').length, cols = Math.max(2, Math.ceil(Math.sqrt(foot.length * 1.6)));
      const line = foot.filter(t => t !== 'archer'), rowsLine = Math.ceil(line.length / cols);
      let li = 0, ar = 0, ci = 0, idx = 0;
      order.forEach((type, i) => {
        let lat, depth, rank = idx++;
        if (type === 'cavalry') { const side = ci % 2 ? 1 : -1; lat = side * ((cols - 1) / 2 * 1.3 + 3.2 + Math.floor(ci / 2) * 1.9); depth = 0; ci++; E.push({ type, aid: A.id, lat, depth, color: col, phase: i + ai * 7, rank, mode: A.mode, hostile: A.hostile, routed: A.routed, out: A.moving === 'out', cav: true, side }); return; }
        if (type === 'archer') { const r = Math.floor(ar / cols), c = ar % cols; lat = (c - (cols - 1) / 2) * 1.3; depth = rowsLine * 1.5 + 3 + r * 1.5; ar++; }
        else { const r = Math.floor(li / cols), c = li % cols; lat = (c - (cols - 1) / 2) * 1.3; depth = r * 1.5; li++; }
        E.push({ type, aid: A.id, lat, depth, color: col, phase: i + ai * 7, rank, mode: A.mode, hostile: A.hostile, routed: A.routed, out: A.moving === 'out' });
      });
      for (let k = 0; k < A.fallen; k++) E.push({ type: 'infantry', aid: A.id, lat: ((k * 37) % 11 - 5) * 1.2, depth: -2 - (k % 3) * 1.2, color: col.clone().multiplyScalar(0.55), phase: k, mode: 'fallen', fallen: true });
      for (let k = 0; k < A.siege; k++) {
        const grp = new THREE.Group(), base = new THREE.Mesh(m.engineBase, m.mats.fixed), arm = new THREE.Group(); arm.position.set(0, 1.6, 0); arm.add(new THREE.Mesh(m.engineArm, m.mats.fixed)); grp.add(base); grp.add(arm); D.group.add(grp);
        D.engines.push({ grp, arm, aid: A.id, lat: (k - (A.siege - 1) / 2) * 4.2, depth: (rowsLine + Math.ceil(Math.max(0, foot.length - line.length) / cols)) * 1.5 + 6, phase: k * 1.7 + ai, firing: A.mode === 'besieging', hostile: A.hostile, fired: false, out: A.moving === 'out' });
      }
      if (A.assault && !A.breach && L.wall.level > 0) {                      // ladders against the wall where the army attacks
        for (let k = -1; k <= 1; k++) {
          const a = A.angle + k * 0.16, p = polar(L.radius + 1.6, a), lad = new THREE.Mesh(m.ladder, m.mats.fixed);
          lad.position.set(p[0], 0, p[1]); lad.rotation.order = 'YZX'; lad.rotation.y = -Math.atan2(-Math.sin(a), -Math.cos(a)) ; lad.rotation.z = -0.3; D.group.add(lad);
        }
      }
      if (!anchors.has(A.id)) anchors.set(A.id, { d: A.d, angle: A.angle });
    });
    // Instanced meshes: per kind of soldier one animated mesh tinted with the faction colour, plus the horses under the cavalry
    D.groups = {}; const CRW = crowd();
    for (const type of TYPES) {
      const list = E.filter(e => e.type === type); if (!list.length) continue;
      const body = CRW.mesh(ROLE[type], list.length), horse = type === 'cavalry' ? CRW.mesh('horse', list.length) : null;
      list.forEach((e, i) => { body.setColorAt(i, e.color); if (horse) horse.setColorAt(i, e.color); });
      D.group.add(body); if (horse) D.group.add(horse);
      D.groups[type] = { list, body, horse };
    }
    // Waving flags
    const fl = (x, y, z, w, h, color) => { const g = new THREE.PlaneGeometry(w, h, 6, 1); g.translate(w / 2, 0, 0); const mm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })); mm.position.set(x, y, z); D.group.add(mm); D.flags.push({ m: mm, base: g.attributes.position.array.slice(), w }); };
    const kh = { capital: 4.4, city: 3.8, town: 3.4, hamlet: 3 }[L.tier] + (L.tier === 'capital' ? 6.5 : 4.6) + 3.2 + 1.7;
    fl(0.05, kh, 0, 2.4, 1.2, L.color);
    return D;
  }

  const o3 = () => o3.o || (o3.o = new THREE.Object3D());
  // what each kind of soldier plays for a state (the clips are in js/view3d/crowd_clips.js); a list is a choice of variants, picked per soldier
  const CLIP = {
    infantry: { idle: 'swIdle', walk: 'swWalk', run: 'swRun', attack: ['swAtk1', 'swAtk2'], block: 'swBlock', die: 'swDie', cheer: 'swCheer' },
    spear: { idle: 'spIdle', walk: 'spWalk', run: 'spRun', attack: ['spStab', 'spSlash'], block: 'spIdle', die: 'swDie', cheer: 'swCheer' },
    archer: { idle: 'bwIdle', walk: 'bwWalk', run: 'bwRun', attack: 'bwShoot', block: 'bwIdle', die: 'bwDie', cheer: 'swCheer' },
    cavalry: { idle: 'ride', walk: 'ride', run: 'ride', attack: ['rideStab', 'rideSlash'], block: 'ride', die: 'swDie', cheer: 'cheer' }
  };
  const HORSE_CLIP = { walk: 'hWalk', run: 'hRun' };
  function pose(e, A, dt) {
    // where one soldier stands this frame and what it is doing: [x, y, z, yaw, unused, state]
    const ph = t * 2.2 + e.phase;
    if (e.fx !== undefined) {                                                          // the garrison: it stands guard, and fights back when the city is stormed
      if (!layout.assault) return [e.fx, e.fy, e.fz, e.yaw, 0, 'idle'];
      return [e.fx, e.fy, e.fz, e.yaw, 0, e.phase % 4 === 3 ? 'block' : 'attack'];
    }
    const an = anchors.get(e.aid); if (!an) return [0, -50, 0, 0, 0, 'idle'];
    let depth = e.depth, lat = e.lat, st = 'idle';
    const toCity = Math.atan2(-Math.cos(an.angle), -Math.sin(an.angle)), outward = Math.atan2(Math.cos(an.angle), Math.sin(an.angle));
    let yaw = e.hostile || !A || A.moving === 'in' || A.mode === 'camp' ? toCity : outward;
    if (e.out) yaw = outward;
    if (A && A.clash && !A.hostile) yaw = outward;
    const conquering = conq && A && !A.hostile && A.owner === layout.owner, ct = conq ? t - conq.t0 : 0;
    if (conquering && ct < 7.5) {                                                      // the city has fallen: the victors run in, then cheer
      if (ct < 3) { st = 'run'; yaw = toCity; }
      else { st = 'cheer'; yaw = e.phase; }
      const p = polarXZ(an.d + depth * 0.6, an.angle, lat * 0.7); return [p[0], 0, p[1], yaw, 0, st];
    }
    switch (e.mode) {
      case 'march': st = 'walk'; lat += Math.sin(ph * 0.7) * 0.06; break;
      case 'camp': st = 'idle'; break;
      case 'besieging': {
        if (!A || !A.assault) { st = 'idle'; break; }
        // Waves: the soldiers go in three waves, a few seconds apart; each runs at the wall (or through the breach) and keeps fighting there until the city falls or the assault ends
        const R = layout.radius, wave = (e.rank || 0) % 3, u = Math.max(0, t - (assaultSince.get(A.id) || t) - wave * 2.5 - (e.phase % 7) * 0.12) / 3.2;
        const tgtD = A.breach ? R * 0.55 + (e.rank % 5) * 0.6 : R + 1.4 + (e.rank % 3) * 0.5, tgtLat = lat * 0.45, f = Math.min(1, u), fight = u >= 1, k = f * f * (3 - 2 * f);
        const dd2 = (an.d + depth) + (tgtD - (an.d + depth)) * k, ll = lat + (tgtLat - lat) * k, p = polarXZ(dd2, an.angle, ll);
        return [p[0], 0, p[1], toCity, 0, u <= 0 ? 'idle' : fight ? (e.phase % 5 === 4 ? 'block' : 'attack') : 'run'];
      }
      case 'fighting': {
        if (e.cav && A && A.cavPh !== undefined) {                                  // cavalry charge into the line, fall back, then swing round the flank to strike from behind (or regroup and charge again)
          const foe = layout.armies.find(x => A.engaged.includes(x.id)), F = (foe ? foe.rows : 4) * 1.5, ph = A.cavPh, w = e.side, lerp = (a, b, u) => a + (b - a) * u * u * (3 - 2 * u);
          let fwd, lt = lat;
          if (ph < 0.3) { const u = ph / 0.3; fwd = lerp(-6, 4.2, u); lt = lat * lerp(1, 0.55, u); st = u > 0.55 ? 'attack' : 'run'; }
          else if (ph < 0.55) { const u = (ph - 0.3) / 0.25; fwd = lerp(4.2, -8, u); lt = lat * lerp(0.55, 1.2, u); st = 'run'; }
          else if (ph < 0.8) { const u = (ph - 0.55) / 0.25; if (A.flank) { fwd = lerp(-8, 2.2 + F * 0.55, u); lt = w * lerp(Math.abs(lat), Math.abs(lat) + 9, Math.sin(u * Math.PI)) + (lat - w * Math.abs(lat)) * 0; st = 'run'; } else { fwd = lerp(-8, -5, u); lt = lat; st = 'walk'; } }
          else { const u = (ph - 0.8) / 0.2; if (A.flank) { fwd = lerp(2.2 + F * 0.55, 2.2 + F + 2.5, u); lt = lerp(w * (Math.abs(lat) + 5), w * 2.5, u); st = u > 0.35 ? 'attack' : 'run'; } else { fwd = lerp(-5, 3, u); lt = lerp(lat, lat * 0.6, u); st = u > 0.6 ? 'attack' : 'run'; } }
          depth = -fwd; lat = lt;
        } else { st = (e.phase + Math.floor(t * 0.4)) % 5 === 4 ? 'block' : 'attack'; depth -= 0.3; }
        break;
      }
      case 'fallen': st = 'die'; yaw = e.phase; break;
    }
    if (e.routed) { st = 'run'; yaw = outward; }
    if (A && A.clash && !A.hostile) depth = -depth;                                  // a defender meeting the attacker faces outward: its ranks stand behind the front line, toward the city
    const p = polarXZ(an.d + depth, an.angle, lat);
    return [p[0], 0, p[1], yaw, 0, st];
  }
  // the clip a soldier plays for a state
  function clipOf(e, st) {
    const c = CLIP[e.type][st] || CLIP[e.type].idle;
    return Array.isArray(c) ? c[e.phase % c.length] : c;
  }
  function playSoldier(g, i, e, st) {
    const CRW = crowd(), name = clipOf(e, st), clip = CRW.clips[name], tt = t + e.phase * 0.37;
    CRW.play(g.body, i, name, clip.loop ? tt : st === 'die' ? clip.d : tt % clip.d);
    if (g.horse) CRW.play(g.horse, i, HORSE_CLIP[st] || 'hStand', tt);
  }

  function animate(dt) {
    if (!dyn) return;
    const o = o3(), byId = {}; for (const A of layout.armies) byId[A.id] = A;
    for (const A of layout.armies) { if (A.assault) { if (!assaultSince.has(A.id)) assaultSince.set(A.id, t); } else assaultSince.delete(A.id); }
    for (const A of layout.armies) {
      const an = anchors.get(A.id); if (!an) continue;
      let tgt = A.d, ang = A.angle;
      if (conq && !A.hostile && A.owner === layout.owner && t - conq.t0 < 7.5) { tgt = layout.radius * 0.5; ang = conq.angle; }      // the victors go into the city
      an.d += (tgt - an.d) * Math.min(1, dt * (conq && t - conq.t0 < 7.5 ? 1.2 : 3)); an.angle = ang;
    }
    if (conq) conquestEffects(dt);
    for (const type of TYPES) {
      const g = dyn.groups[type]; if (!g) continue;
      g.list.forEach((e, i) => {
        const [x, y, z, yaw, , st] = pose(e, byId[e.aid], dt);
        o.position.set(x, y + (g.horse ? 0.78 : 0), z); o.rotation.set(0, yaw, 0); o.updateMatrix(); g.body.setMatrixAt(i, o.matrix);
        if (g.horse) { o.position.y = y; o.updateMatrix(); g.horse.setMatrixAt(i, o.matrix); }
        e._x = x; e._y = y; e._z = z; playSoldier(g, i, e, st);
      });
      g.body.instanceMatrix.needsUpdate = true; if (g.horse) g.horse.instanceMatrix.needsUpdate = true;
    }
    for (const f of dyn.flags) { const a = f.m.geometry.attributes.position, b = f.base; for (let i = 0; i < a.count; i++) a.setZ(i, b[i * 3 + 2] + Math.sin(t * 4 + b[i * 3] * 2.2) * 0.12 * (b[i * 3] / f.w)); a.needsUpdate = true; }
    for (const e of dyn.engines) {
      const an = anchors.get(e.aid); if (!an) continue;
      const Ae = byId[e.aid], p = polarXZ(an.d + (Ae && Ae.clash && !Ae.hostile ? -e.depth : e.depth), an.angle, e.lat); e.grp.position.set(p[0], 0, p[1]); e.x = p[0]; e.z = p[1];
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
  let shotMat = null, arrowMat = null, shotTimer = 0, sparkTimer = 0, confetti = 0;
  // The city falls: the flag changes colour, defenders run out of the far gate, and the victors celebrate with sparks of their colour.
  function conquestEffects(dt) {
    const ct = t - conq.t0, f = dyn.flags[0];
    if (f) f.m.material.color.set(conq.from).lerp(new THREE.Color(conq.to), Math.min(1, Math.max(0, (ct - 1) / 2)));
    if (ct > 2 && ct < 7) { confetti -= dt; if (confetti <= 0) { confetti = 0.12; const a = Math.random() * TAU, r = 2 + Math.random() * 6; puff(Math.cos(a) * r, 4 + Math.random() * 6, Math.sin(a) * r, Math.random() < 0.5 ? conq.to : '#f2d27a', 0.25, 0.7, 1.0); } }
    if (fleeing.length) {
      const o = o3(), CRW = crowd(), fm = fleeing[0].mesh;
      fleeing.forEach((q, i) => {
        q.u += dt / 5; const k = Math.min(1, q.u);
        o.position.set(q.x0 + (q.x1 - q.x0) * k, 0, q.z0 + (q.z1 - q.z0) * k); o.rotation.set(0, Math.atan2(q.x1 - q.x0, q.z1 - q.z0), 0); o.updateMatrix(); fm.setMatrixAt(i, o.matrix); CRW.play(fm, i, 'swRun', t + q.ph * 0.3);
      });
      fm.instanceMatrix.needsUpdate = true;
    }
    if (ct > 8) { if (fleeing.length) { dyn.group.remove(fleeing[0].mesh); fleeing[0].mesh.geometry.dispose(); } fleeing = []; conq = null; }
  }
  function startConquest(L, prev, from, to) {
    const A = L.armies.find(a => !a.hostile && a.owner === L.owner); if (!A) return;
    conq = { t0: t, from, to, angle: prevAssaultAngle !== null ? prevAssaultAngle : A.angle };
    const out = (conq.angle + Math.PI), fm = crowd().mesh('sword', 7);                    // the old defenders flee through the gate on the far side
    fleeing = []; dyn.group.add(fm);
    for (let i = 0; i < 7; i++) {
      const a0 = i * 0.9, p0 = polar(3 + (i % 3), a0), p1 = polar(L.radius + 26, out + (i - 3) * 0.12);
      fm.setColorAt(i, new THREE.Color(from)); fleeing.push({ mesh: fm, x0: p0[0], z0: p0[1], x1: p1[0], z1: p1[1], u: 0, ph: i });
    }
  }
  let prevAssaultAngle = null;
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
    const picks = g.list.filter(e => e._x !== undefined && !e.fallen && (e.mode === 'fighting' || e.mode === 'besieging' || (e.mode === 'guard' && layout.assault)) && Math.random() < 0.25).slice(0, 3);
    for (const e of picks) {
      const A = byId[e.aid];
      if (e.mode === 'guard') {                                                    // defenders on the wall shoot at the attackers
        const att = dyn.armies.find(x => x.assault), an2 = att && anchors.get(att.id); if (!an2) continue;
        const p2 = polarXZ(an2.d + 3, an2.angle, (Math.random() - 0.5) * 10);
        const m2 = new THREE.Mesh(sharedGeo('arrow', () => new THREE.BoxGeometry(0.05, 0.05, 0.8)), arrowMat); dyn.group.add(m2);
        dyn.shots.push({ m: m2, arrow: true, u: 0, dur: 0.8, arc: 5, x0: e._x, y0: e._y + 1.4, z0: e._z, tx: p2[0], ty: 1.0, tz: p2[1], puff: null }); continue;
      }
      if (!A) continue;
      let tx, tz;
      if (A.mode === 'fighting') { const foe = dyn.armies.find(x => x.hostile !== A.hostile && x.mode === 'fighting' && (x.engaged.includes(A.id) || A.engaged.includes(x.id))); const an = foe && anchors.get(foe.id); if (!an) continue; const p = polarXZ(an.d, an.angle, (Math.random() - 0.5) * 8); tx = p[0]; tz = p[1]; }
      else { const R = layout.radius, a = A.angle + (Math.random() - 0.5) * 0.4; tx = Math.cos(a) * R; tz = Math.sin(a) * R; }
      const mm = new THREE.Mesh(sharedGeo('arrow', () => new THREE.BoxGeometry(0.05, 0.05, 0.8)), arrowMat); dyn.group.add(mm);
      dyn.shots.push({ m: mm, arrow: true, u: 0, dur: 0.8, arc: 5, x0: e._x, y0: 1.4, z0: e._z, tx, ty: 1.2, tz, puff: null });
    }
  }
  function sparks() {
    for (const A of dyn.armies) {
      if (A.assault) { const an = anchors.get(A.id); if (an && Math.random() < 0.7) { const p = polarXZ(layout.radius + (A.breach ? -layout.radius * 0.35 : 1.3), an.angle, (Math.random() - 0.5) * 8); puff(p[0], 1.4 + Math.random() * 1.5, p[1], '#ffd070', 0.2, 0.9, 3.2); } }
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
    for (const o of [staticMesh, ground, water].concat(texMeshes)) if (o) { scene.remove(o); dispose(o); }
    tx = new TexMerger(); const M = new Merger(); buildCity(M, L); staticMesh = M.mesh(); scene.add(staticMesh);
    texMeshes = tx.meshes(); texMeshes.forEach(m => scene.add(m));
    ground = buildGround(L); scene.add(ground);
    water = null;
    if (L.water) { const g = new THREE.CircleGeometry(L.water.radius, 28); g.rotateX(-Math.PI / 2); const p = polar(L.water.r, L.water.angle); g.translate(p[0], 0.08, p[1]); water = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: COL.water, transparent: true, opacity: 0.88 })); scene.add(water); }
    const ext = Math.max(L.radius + 14, 36, ...L.armies.map(a => a.d + 8));                   // wide enough to see the armies outside the walls
    cam.minD = 7; cam.maxD = Math.max(L.radius * 5.5, ext * 4.5); cam.dist = Math.min(cam.maxD, Math.max(cam.minD, cam.dist || ext * (innerWidth < innerHeight ? 3.0 : 2.0)));
    stats.tris = M.tris + tx.tris;
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
      canvas.addEventListener('webglcontextlost', e => e.preventDefault()); canvas.addEventListener('contextmenu', e => e.preventDefault()); canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
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
  // Two fingers pinch to zoom and, moving together, pan the view over the ground (the right mouse button or shift-drag pans on a desktop)
  const pan = (dx, dy) => {
    const k = cam.dist * 0.0016, lim = (layout ? layout.radius : 30) + 70;
    cam.tx = Math.max(-lim, Math.min(lim, cam.tx - Math.cos(cam.yaw) * dx * k - Math.sin(cam.yaw) * dy * k));
    cam.tz = Math.max(-lim, Math.min(lim, cam.tz + Math.sin(cam.yaw) * dx * k - Math.cos(cam.yaw) * dy * k));
  };
  let walk = null;                                                                       // walk mode (js/view3d/walk.js) takes over the camera and the pointer
  function down(e) { if (walk) return walk.down(e); canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); cam.auto = false; panning = e.button === 2 || e.shiftKey; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; } }
  function move(e) {
    if (walk) return walk.move(e);
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch) zoom(pinch / d); pinch = d; if (mid) pan(m.x - mid.x, m.y - mid.y); mid = m;
    } else if (panning) pan(dx, dy);
    else { cam.yaw -= dx * 0.008; cam.pitch = Math.max(0.12, Math.min(1.35, cam.pitch + dy * 0.005)); }
  }
  function up(e) { if (walk) return walk.up(e); pointers.delete(e.pointerId); if (pointers.size < 2) { pinch = 0; mid = null; } if (!pointers.size) panning = false; }

  function open(id) {
    if (!ensureRenderer()) return false;
    cityId = id; sig = ''; sigA = ''; anchors.clear(); assaultSince.clear(); conq = null; fleeing = []; layout = null; prevAssaultAngle = null; shown = true; cam.auto = false; cam.yaw = 0; cam.dist = 0; cam.tx = 0; cam.tz = 0;      // yaw 0 looks north from the south, so the roads point the way they do on the map
    canvas.classList.add('on'); resize(); refresh(true);
    const foe = layout.armies.find(a => a.hostile) || layout.armies[0];                  // start by looking at the action
    if (foe) { cam.yaw = Math.atan2(-Math.cos(foe.angle), -Math.sin(foe.angle)) + 0.3; cam.auto = false; }
    return true;
  }
  function close() { shown = false; cityId = -1; canvas.classList.remove('on'); }

  let sigA = '';
  function refresh(force) {
    if (cityId < 0) return;
    const old = layout, L = VM.CityLayout.build(ui.state, cityId); layout = L;
    const assaulter = L.armies.find(a => a.assault); if (assaulter) prevAssaultAngle = assaulter.angle;
    if (!force && old && old.id === L.id && old.owner !== L.owner && L.armies.some(a => !a.hostile && a.owner === L.owner)) {        // the city changed hands while we watch
      const from = old.color, to = L.color; sig = ''; sigA = null;
      rebuildStatic(L); sig = L.sigStatic; rebuildDynamic(L); sigA = L.sigArmies; startConquest(L, old, from, to); return;
    }
    if (force || L.sigStatic !== sig) { sig = L.sigStatic; rebuildStatic(L); sigA = null; }
    if (force || L.sigArmies !== sigA) { sigA = L.sigArmies; rebuildDynamic(L); }
  }

  let acc = 0;
  function frame(dt) {
    if (!shown || !renderer) return;
    t += dt; acc += dt; if (acc > 0.3) { acc = 0; refresh(false); }
    if (walk) { walk.frame(dt); animate(dt); renderer.render(scene, camera); return; }
    if (cam.auto) cam.yaw += dt * 0.05;
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, 1.5, cam.tz);
    animate(dt);
    renderer.render(scene, camera);
  }

  return {
    init, open, close, frame, refresh, supported: () => ensureRenderer(), isOpen: () => shown, id: () => cityId, layout: () => layout,
    cam, setWalk: m => { walk = m; if (!m) resize(); },
    internals: () => ({ THREE, scene, camera, canvas, crowd: crowd(), layout, cityId, resize }),
    info: () => renderer ? { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, staticTriangles: stats.tris, soldiers: dyn ? dyn.entries.length : 0, frames: dyn ? Object.values(dyn.groups).map(g => Array.from(g.body.geometry.attributes.aAnim.array.slice(0, 12)).filter((v, i) => i % 4 === 2)) : [], conquest: !!conq, assaultRadii: dyn ? dyn.entries.filter(e => e.mode === 'besieging' && e._x !== undefined).map(e => Math.hypot(e._x, e._z)) : [] } : null,
    camera: cam
  };
})();
