// The 3D ground under the strategy map: a low-poly height field made once from the game's seed and its nodes (mountains round passes and iron hills,
// sea off the edges, lakes, bays at the ports), coloured by height, with the roads laid on it and the territory colours painted over it as a texture.
// The map's 2D layer (nodes, armies, labels) is still drawn on a canvas above it; this module projects map coordinates to the screen for it.
// The scene is static, so it is drawn only when the camera or the territory changes. Needs THREE (r128). Pure browser code.
var VM = globalThis.VM = globalThis.VM || {};

VM.MapTerrain = (function () {
  const MX = 300, GW = 140, GH = 108, SEA = 1.2, BG = '#0b0a10';
  const cam = { tx: 500, tz: 350, yaw: 0, pitch: 0.9, dist: 900, fit: 900 };
  let canvas = null, renderer = null, scene = null, camera = null, mesh = null, water = null, roads = null, trees = null, tex = null, sizeKey = '', key = '';
  const extras = []; let H = null, area = null, dirty = true, W3 = 1, H3 = 1, refPpu = 1, panelShift = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---- seeded value noise ----
  function noiser(seed) {
    const hash = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const val = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v; };
    return { fbm(x, y, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < (o || 3); i++) { s += val(x * f, y * f) * a; n += a; a *= 0.5; f *= 2; } return s / n; }, val };
  }

  // ---- the height field ----
  function makeField(st) {
    const m = st.map, N = m.nodes, nz = noiser(st.seed * 31 + 7), nz2 = noiser(st.seed * 17 + 3);
    const x0 = -MX, y0 = -MX, aw = m.w + MX * 2, ah = m.h + MX * 2, cw = aw / GW, ch = ah / GH;
    const cx = N.reduce((s, n) => s + n.x, 0) / N.length, cy = N.reduce((s, n) => s + n.y, 0) / N.length;
    // bumps: mountains round passes and iron hills, a bay beside each port, lakes in the emptiest places
    const bumps = [];
    N.forEach((n, i) => {
      const spec = st.cities[i].spec;
      if (spec === 'pass') bumps.push({ x: n.x, y: n.y, r: 95, a: 46 });
      if (spec === 'iron') bumps.push({ x: n.x, y: n.y, r: 80, a: 30 });
      if (spec === 'port') { const dx = n.x - cx, dy = n.y - cy, d = Math.hypot(dx, dy) || 1; bumps.push({ x: n.x + dx / d * 84, y: n.y + dy / d * 84, r: 46, a: -30 }); }
    });
    const dn = (x, y) => { let d = 1e9; for (const n of N) d = Math.min(d, Math.hypot(n.x - x, n.y - y)); return d; };
    const dedge = (x, y) => { let d = 1e9; for (const [a, b] of m.edges) { const p = N[a], q = N[b], vx = q.x - p.x, vy = q.y - p.y, t = clamp(((x - p.x) * vx + (y - p.y) * vy) / (vx * vx + vy * vy), 0, 1); d = Math.min(d, Math.hypot(x - p.x - vx * t, y - p.y - vy * t)); } return d; };
    let lakes = 0;
    for (let tries = 0, best = []; tries < 400 && lakes < 2; tries++) {
      const x = 80 + nz2.val(tries * 1.7, 3.1) * (m.w - 160), y = 80 + nz2.val(tries * 2.3, 9.7) * (m.h - 160);
      if (dn(x, y) < 95 || dedge(x, y) < 70 || bumps.some(b => b.a < 0 && Math.hypot(b.x - x, b.y - y) < 190)) continue;
      bumps.push({ x, y, r: 52, a: -26 }); lakes++;
    }
    const base = (x, y) => {
      let h = (nz.fbm(x * 0.0042, y * 0.0042, 4) - 0.46) * 34 + 3.5;
      const d = dn(x, y); h -= smooth(100, 250, d) * 60;                                            // open sea beyond the edge of the realm
      h += Math.max(0, nz2.fbm(x * 0.006 + 40, y * 0.006, 3) - 0.56) * 110 * smooth(55, 150, d);     // ranges in the gaps between the nodes
      for (const b of bumps) { const dd = Math.hypot(x - b.x, y - b.y) / b.r; if (dd < 2.2) h += b.a * Math.exp(-dd * dd * 1.6); }
      return h;
    };
    const nodeH = N.map((n, i) => { const spec = st.cities[i].spec, h = base(n.x, n.y); return spec === 'pass' ? clamp(h, 9, 22) : spec === 'port' ? clamp(h, 3, 6) : clamp(h, 4, 13); });
    const field = new Float32Array((GW + 1) * (GH + 1));
    for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) {
      const x = x0 + i * cw, y = y0 + j * ch; let h = base(x, y), w = 0, tgt = h;
      for (let k = 0; k < N.length; k++) { const d = Math.hypot(N[k].x - x, N[k].y - y), f = 1 - smooth(14, 40, d); if (f > w) { w = f; tgt = nodeH[k]; } }
      for (const [a, b] of m.edges) {
        const p = N[a], q = N[b], vx = q.x - p.x, vy = q.y - p.y, t = clamp(((x - p.x) * vx + (y - p.y) * vy) / (vx * vx + vy * vy), 0, 1);
        const d = Math.hypot(x - p.x - vx * t, y - p.y - vy * t), f = 1 - smooth(7, 24, d);
        if (f > w) { w = f; tgt = nodeH[a] + (nodeH[b] - nodeH[a]) * t; }
      }
      const de = Math.min(i, GW - i, j, GH - j) * Math.min(cw, ch);                                   // the ground sinks into deep water at the edge of the model, so it has no visible edge
      field[j * (GW + 1) + i] = Math.min(h + (tgt - h) * w, -2 - 60 * (1 - smooth(0, 150, de)) + (h + (tgt - h) * w + 2) * smooth(0, 150, de));
    }
    return { field, x0, y0, cw, ch, aw, ah, nodeH };
  }
  const heightAt = (x, y) => {
    if (!area) return 0;
    const fx = clamp((x - area.x0) / area.cw, 0, GW - 0.001), fy = clamp((y - area.y0) / area.ch, 0, GH - 0.001), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, f = area.field, w = GW + 1;
    return (f[j * w + i] * (1 - u) + f[j * w + i + 1] * u) * (1 - v) + (f[(j + 1) * w + i] * (1 - u) + f[(j + 1) * w + i + 1] * u) * v;
  };

  const SAND = [0.84, 0.78, 0.55], GRASS = [0.42, 0.62, 0.27], GRASS2 = [0.36, 0.55, 0.24], FOREST = [0.25, 0.43, 0.2], ROCK = [0.55, 0.53, 0.5], ROCK2 = [0.45, 0.43, 0.42], SNOW = [0.93, 0.95, 0.97], BED = [0.45, 0.5, 0.42], DEEP = [0.1, 0.22, 0.36];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function colourAt(h, slope, n1, n2) {
    if (h < SEA - 0.2) return mix(DEEP, mix(BED, SAND, smooth(-6, SEA, h)), smooth(-30, -4, h));
    let c = mix(SAND, mix(GRASS, GRASS2, n1), smooth(SEA + 0.3, SEA + 2.2, h));
    c = mix(c, FOREST, smooth(0.6, 0.72, n2) * smooth(4, 7, h) * (1 - smooth(18, 26, h)));
    c = mix(c, mix(ROCK, ROCK2, n1), Math.max(smooth(17, 28, h), smooth(0.55, 1.1, slope)));
    return mix(c, SNOW, smooth(40, 50, h) * (1 - smooth(1.1, 1.8, slope) * 0.6));
  }

  // ---- building the scene ----
  function supported() { try { return !!window.THREE && !!(window.WebGLRenderingContext); } catch (e) { return false; } }
  function init(c) {
    canvas = c; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' }); } catch (e) { renderer = null; return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setClearColor(BG, 1);
    camera = new THREE.PerspectiveCamera(38, 1, 8, 9000);
    scene = new THREE.Scene(); scene.fog = new THREE.Fog(BG, 1700, 4200);
    scene.add(new THREE.HemisphereLight('#e8eeff', '#554a3a', 0.78)); const sun = new THREE.DirectionalLight('#fff1d6', 0.7); sun.position.set(-300, 600, 250); scene.add(sun);
    return true;
  }

  function build(st) {
    if (!renderer) return false;
    const k = st.seed + ':' + st.map.nodes.map(n => Math.round(n.x) + ',' + Math.round(n.y)).join(';') + ':' + st.cities.map(c => c.spec[0]).join('');
    if (k === key && mesh) return true;
    key = k;
    for (const o of [mesh, water, roads, trees].concat(extras)) if (o) { scene.remove(o); o.geometry.dispose(); }
    extras.length = 0;
    area = makeField(st); const f = area.field, w = GW + 1, nz = noiser(st.seed * 5 + 11), nz2 = noiser(st.seed * 13 + 1), m = st.map;
    const pos = new Float32Array(w * (GH + 1) * 3), col = new Float32Array(w * (GH + 1) * 3), uv = new Float32Array(w * (GH + 1) * 2), idx = [];
    const MARG = 130, uw = m.w + MARG * 2, uh = m.h + MARG * 2;
    for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) {
      const p = j * w + i, x = area.x0 + i * area.cw, y = area.y0 + j * area.ch, h = f[p];
      const hx = f[j * w + Math.min(GW, i + 1)] - f[j * w + Math.max(0, i - 1)], hy = f[Math.min(GH, j + 1) * w + i] - f[Math.max(0, j - 1) * w + i], slope = Math.hypot(hx, hy) / (2 * area.cw) * 3;
      const c = colourAt(h, slope, nz.fbm(x * 0.03, y * 0.03, 2), nz2.fbm(x * 0.012 + 9, y * 0.012, 3));
      pos[p * 3] = x; pos[p * 3 + 1] = h; pos[p * 3 + 2] = y; col[p * 3] = c[0]; col[p * 3 + 1] = c[1]; col[p * 3 + 2] = c[2];
      uv[p * 2] = clamp((x + MARG) / uw, 0, 1); uv[p * 2 + 1] = clamp((y + MARG) / uh, 0, 1);
    }
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; if ((i + j) % 2) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (!tex) { tex = new THREE.CanvasTexture(document.createElement('canvas')); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.flipY = false; }
    mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: tex })); scene.add(mesh);
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2).translate(m.w / 2, -62, m.h / 2), new THREE.MeshLambertMaterial({ color: '#17324f' })); scene.add(deep); extras.push(deep);
    water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2).translate(m.w / 2, SEA, m.h / 2), new THREE.MeshLambertMaterial({ color: '#3b78b4', transparent: true, opacity: 0.82, depthWrite: false })); scene.add(water);
    // roads: a ribbon laid on the ground along every edge of the map
    const rp = [], rc = [], ri = []; const rcol = new THREE.Color('#e4d6b0');
    for (const [a, b] of m.edges) {
      const p = m.nodes[a], q = m.nodes[b], len = Math.hypot(q.x - p.x, q.y - p.y), n = Math.max(2, Math.ceil(len / 9)), nx = -(q.y - p.y) / len, ny = (q.x - p.x) / len, base = rp.length / 3;
      for (let s = 0; s <= n; s++) { const t = s / n, x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t, h = heightAt(x, y) + 0.45; for (const sd of [-1, 1]) { rp.push(x + nx * 1.5 * sd, h, y + ny * 1.5 * sd); rc.push(rcol.r, rcol.g, rcol.b); } }
      for (let s = 0; s < n; s++) { const o = base + s * 2; ri.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3)); rg.setIndex(ri);
    roads = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); scene.add(roads);
    // trees: small cones scattered over the forests, one mesh
    const tp = [], tcn = [], tr = noiser(st.seed * 3 + 5); let seed = st.seed * 7 + 1; const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let n = 0; n < 2600 && tp.length < 2400 * 3; n++) {
      const x = rnd() * m.w * 1.1 - m.w * 0.05, y = rnd() * m.h * 1.1 - m.h * 0.05, h = heightAt(x, y);
      if (h < 4 || h > 24 || nz2.fbm(x * 0.012 + 9, y * 0.012, 3) < 0.6) continue;
      let near = false; for (const nd of m.nodes) if (Math.hypot(nd.x - x, nd.y - y) < 34) { near = true; break; } if (near) continue;
      tp.push(x, h, y);
    }
    const tv = [], tcol = [], tc = new THREE.Color(); const cone = new THREE.ConeGeometry(3.2, 11, 5).translate(0, 5.5, 0).toNonIndexed();
    const cp = cone.attributes.position.array;
    for (let i = 0; i < tp.length; i += 3) { const s = 0.7 + rnd() * 0.7; tc.set(rnd() < 0.5 ? '#2f5a2a' : '#3b6b2f'); for (let v = 0; v < cp.length; v += 3) { tv.push(tp[i] + cp[v] * s, tp[i + 1] + cp[v + 1] * s, tp[i + 2] + cp[v + 2] * s); tcol.push(tc.r, tc.g, tc.b); } }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tv, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3)); tg.computeVertexNormals();
    trees = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true })); scene.add(trees);
    dirty = true; return true;
  }

  // The territory raster (white where nobody owns the land, tinted by the owner, darker on borders) laid over the ground
  function setTerritory(terr) {
    if (!tex) return;
    const c = tex.image; if (c.width !== terr.width) { c.width = terr.width; c.height = terr.height; }
    const t = c.getContext('2d'); t.fillStyle = '#fff'; t.fillRect(0, 0, c.width, c.height); t.drawImage(terr, 0, 0);
    tex.needsUpdate = true; dirty = true;
  }

  // ---- the camera ----
  function resize() {
    if (!renderer) return;
    W3 = innerWidth; H3 = innerHeight; renderer.setSize(W3, H3, false); camera.aspect = W3 / H3;
    panelShift = innerWidth > 720 ? 180 : 0;                                                  // on a desktop the panel covers the left: shift the picture into the free part
    if (panelShift) camera.setViewOffset(W3, H3, -panelShift, 0, W3, H3);
    else if (innerWidth <= 720) camera.setViewOffset(W3, H3, 0, Math.round(H3 * 0.14), W3, H3);              // on a phone the panel is a sheet at the bottom: lift the picture
    else camera.clearViewOffset();
    camera.updateProjectionMatrix(); dirty = true;
  }
  function fit(st) {
    const m = st.map, t = Math.tan(camera.fov * Math.PI / 360), aspect = Math.max(0.3, (W3 - panelShift * 2) / H3);
    cam.fit = Math.max(m.h * 0.78 / t, m.w * 0.56 / (t * aspect)) * 0.9; cam.dist = cam.fit; cam.tx = m.w / 2; cam.tz = m.h / 2; cam.yaw = 0; cam.pitch = 0.95;
    place(); refPpu = ppuAt(cam.tx, cam.tz); dirty = true;
  }
  function place() {
    cam.pitch = clamp(cam.pitch, 0.18, 1.45); cam.dist = clamp(cam.dist, 90, cam.fit * 1.5);
    const cp = Math.cos(cam.pitch), ty = heightAt(cam.tx, cam.tz);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, ty + Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, ty, cam.tz); camera.updateMatrixWorld(true); dirty = true;
  }
  const V = () => V.v || (V.v = new THREE.Vector3());
  // screen position of a map point on the ground, and how many pixels one map unit is there (relative to the first view, so 1 = the starting size)
  function project(x, y, lift) {
    const v = V().set(x, heightAt(x, y) + (lift || 0), y).project(camera);
    return { x: (v.x + 1) / 2 * W3, y: (1 - v.y) / 2 * H3, depth: v.z, k: ppuAt(x, y) / refPpu };
  }
  function ppuAt(x, y) {
    const h = heightAt(x, y), a = new THREE.Vector3(x, h, y).project(camera), b = new THREE.Vector3(x + 1, h, y).project(camera), c = new THREE.Vector3(x, h, y + 1).project(camera);
    return Math.max(Math.hypot((b.x - a.x) * W3 / 2, (b.y - a.y) * H3 / 2), Math.hypot((c.x - a.x) * W3 / 2, (c.y - a.y) * H3 / 2));
  }
  // the map point under a screen position (the ray meets a flat plane at the height of the view's centre)
  function groundAt(px, py) {
    const nx = px / W3 * 2 - 1, ny = -(py / H3 * 2 - 1), o = camera.position, d = new THREE.Vector3(nx, ny, 0.5).unproject(camera).sub(o).normalize();
    const plane = heightAt(cam.tx, cam.tz); if (Math.abs(d.y) < 1e-4) return null;
    const t = (plane - o.y) / d.y; if (t < 0) return null;
    return { x: o.x + d.x * t, y: o.z + d.z * t };
  }
  const bounds = st => { const m = st.map; cam.tx = clamp(cam.tx, -60, m.w + 60); cam.tz = clamp(cam.tz, -60, m.h + 60); };

  function render() {
    if (!renderer || !dirty || !mesh) return;
    dirty = false; renderer.render(scene, camera);
  }

  return {
    supported, init, build, setTerritory, resize, fit, place, project, groundAt, render, heightAt, cam, bounds,
    markDirty() { dirty = true; }, ready: () => !!(renderer && mesh)
  };
})();
