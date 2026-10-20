// The strategy map: Canvas 2D drawing plus mouse and touch input (drag to pan, wheel or pinch to zoom, tap to select).
var VM = globalThis.VM = globalThis.VM || {};

VM.MapView = (function () {
  const RES = 4, LAND = 118, MARG = 130;                    // territory raster: map units per pixel, and how far land reaches from a node
  let canvas, ctx, ui, view = { s: 1, ox: 0, oy: 0 }, fitScale = 1, dpr = 1;
  let terr = null, terrKey = '', nearest = null, pointers = new Map(), drag = null, pinch = null;

  const sx = x => x * view.s + view.ox, sy = y => y * view.s + view.oy;
  const toMap = (px, py) => ({ x: (px - view.ox) / view.s, y: (py - view.oy) / view.s });
  const S = () => ui.state;

  function init(c, uiRef) {
    canvas = c; ctx = c.getContext('2d'); ui = uiRef;
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0012)); }, { passive: false });
    canvas.addEventListener('contextmenu', e => { e.preventDefault(); const h = hit(e.clientX, e.clientY); if (h && h.kind === 'node') ui.onOrder(h.id); });
    addEventListener('resize', resize); resize();
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    if (S()) fit();
  }

  function fit() {
    const m = S().map, pad = Math.min(60, innerWidth * 0.06), topPad = 56;
    fitScale = Math.min((innerWidth - pad * 2) / m.w, (innerHeight - pad * 2 - topPad) / m.h);
    view.s = fitScale; view.ox = (innerWidth - m.w * fitScale) / 2; view.oy = topPad + (innerHeight - topPad - m.h * fitScale) / 2;
    terrKey = ''; nearest = null;
  }

  function zoomAt(px, py, k) {
    const ns = Math.max(fitScale * 0.7, Math.min(fitScale * 3.5, view.s * k)), r = ns / view.s;
    view.ox = px - (px - view.ox) * r; view.oy = py - (py - view.oy) * r; view.s = ns;
  }

  function centerOn(id) {
    const n = S().map.nodes[id]; view.s = Math.max(view.s, fitScale * 1.35);
    const cx = innerWidth > 720 ? (innerWidth + 360) / 2 : innerWidth / 2;      // keep clear of the side panel
    view.ox = cx - n.x * view.s; view.oy = (innerWidth > 720 ? innerHeight / 2 : innerHeight * 0.36) - n.y * view.s;
  }

  // ---- Input ----
  function down(e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { sx: e.clientX, sy: e.clientY, moved: false, button: e.button };
    else { drag = null; const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
  }
  function move(e) {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d); pinch.d = d;
    } else if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
      if (drag.moved) { view.ox += dx; view.oy += dy; }
    }
  }
  function up(e) {
    const was = pointers.has(e.pointerId); pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (was && drag && !drag.moved && pointers.size === 0 && drag.button !== 2) tap(e.clientX, e.clientY);
    if (pointers.size === 0) drag = null;
  }

  function armyScreenPos(a, slot) {
    const p = VM.Armies.position(S(), a);
    return { x: sx(p.x) + slot * 16, y: sy(p.y) - (a.at !== null ? 18 : 10) };
  }

  function hit(px, py) {
    const st = S(), slots = {};
    let best = null, bd = 20 * 20;
    for (const a of st.armies) {
      const k = a.at !== null ? a.at : -1 - a.id, slot = slots[k] || 0; slots[k] = slot + 1;
      const pos = armyScreenPos(a, slot), dx = pos.x - px, dy = pos.y - 6 - py, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { kind: 'army', id: a.id }; }
    }
    if (best) return best;
    bd = 26 * 26;
    for (const n of st.map.nodes) { const dx = sx(n.x) - px, dy = sy(n.y) - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { kind: 'node', id: n.id }; } }
    return best;
  }

  function tap(px, py) {
    const h = hit(px, py);
    if (!h) ui.onTap(null);
    else ui.onTap(h);
  }

  // ---- Territory raster (derived borders: every point of land belongs to its nearest node) ----
  function buildTerritory() {
    const st = S(), m = st.map, w = Math.ceil((m.w + MARG * 2) / RES), h = Math.ceil((m.h + MARG * 2) / RES);
    if (!nearest || nearest.w !== w) {
      nearest = { w, h, idx: new Int8Array(w * h) };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const mx = (x + 0.5) * RES - MARG, my = (y + 0.5) * RES - MARG; let best = -1, bd = LAND * LAND;
        for (const n of m.nodes) { const dx = n.x - mx, dy = n.y - my, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n.id; } }
        nearest.idx[y * w + x] = best;
      }
      terr = document.createElement('canvas'); terr.width = w; terr.height = h; terrKey = '';
    }
    const key = st.cities.map(c => c.owner).join('') + '|' + st.player;
    if (key === terrKey) return;
    terrKey = key;
    const t = terr.getContext('2d'), img = t.createImageData(w, h), d = img.data;
    const rgb = st.factions.map(f => [parseInt(f.color.slice(1, 3), 16), parseInt(f.color.slice(3, 5), 16), parseInt(f.color.slice(5, 7), 16)]);
    const own = i => (i < 0 || nearest.idx[i] < 0) ? -1 : st.cities[nearest.idx[i]].owner;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, n = nearest.idx[i]; if (n < 0) continue;
      const o = st.cities[n].owner, c = rgb[o];
      let border = false;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) { const oo = own(j); if (oo !== -1 && oo !== o) border = true; }
      const p = i * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2];
      d[p + 3] = border ? 200 : (o === 0 ? 34 : 70);
    }
    t.putImageData(img, 0, 0);
  }

  // ---- Drawing ----
  function dashed(on) { ctx.setLineDash(on ? [4, 5] : []); }

  // Little vector icons for the specialties, drawn in dark ink on the node.
  function drawMark(spec, x, y, r) {
    const k = r * 0.52; ctx.save(); ctx.translate(x, y); ctx.fillStyle = ctx.strokeStyle = 'rgba(10,8,12,0.88)'; ctx.lineWidth = Math.max(1.4, r * 0.14); ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (spec) {
      case 'capital': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? k * 0.45 : k * 1.05; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + 1); } ctx.closePath(); ctx.fill(); break;
      case 'farmland': for (const dx of [-k * 0.6, 0, k * 0.6]) { ctx.moveTo(dx, k * 0.9); ctx.lineTo(dx, -k * 0.7); ctx.moveTo(dx, -k * 0.2); ctx.lineTo(dx - k * 0.3, -k * 0.5); ctx.moveTo(dx, -k * 0.2); ctx.lineTo(dx + k * 0.3, -k * 0.5); } ctx.stroke(); break;
      case 'market': ctx.arc(0, 0, k * 0.9, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-k * 0.4, 0); ctx.lineTo(k * 0.4, 0); ctx.moveTo(0, -k * 0.45); ctx.lineTo(0, k * 0.45); ctx.stroke(); break;
      case 'pass': ctx.moveTo(-k, k * 0.8); ctx.lineTo(-k * 0.25, -k * 0.8); ctx.lineTo(k * 0.2, k * 0.1); ctx.lineTo(k * 0.55, -k * 0.35); ctx.lineTo(k, k * 0.8); ctx.closePath(); ctx.fill(); break;
      case 'port': ctx.moveTo(-k, -k * 0.2); ctx.quadraticCurveTo(-k * 0.5, -k * 0.7, 0, -k * 0.2); ctx.quadraticCurveTo(k * 0.5, k * 0.3, k, -k * 0.2); ctx.moveTo(-k, k * 0.5); ctx.quadraticCurveTo(-k * 0.5, 0, 0, k * 0.5); ctx.quadraticCurveTo(k * 0.5, k, k, k * 0.5); ctx.stroke(); break;
      case 'iron': ctx.moveTo(0, -k); ctx.lineTo(k * 0.85, 0); ctx.lineTo(0, k); ctx.lineTo(-k * 0.85, 0); ctx.closePath(); ctx.fill(); break;
      case 'horse': ctx.arc(0, -k * 0.1, k * 0.85, 0.2 * Math.PI, 0.8 * Math.PI, true); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-k * 0.75, -k * 0.1); ctx.lineTo(-k * 0.75, k * 0.6); ctx.moveTo(k * 0.75, -k * 0.1); ctx.lineTo(k * 0.75, k * 0.6); ctx.stroke(); break;
      case 'holy': ctx.moveTo(0, -k); ctx.lineTo(0, k); ctx.moveTo(-k * 0.65, -k * 0.25); ctx.lineTo(k * 0.65, -k * 0.25); ctx.stroke(); break;
      default: ctx.moveTo(-k * 0.8, k * 0.7); ctx.lineTo(-k * 0.8, -k * 0.1); ctx.lineTo(0, -k * 0.85); ctx.lineTo(k * 0.8, -k * 0.1); ctx.lineTo(k * 0.8, k * 0.7); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawFlag(x, y, color, count, selected, label) {
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x, y - 8); ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(x, y - 8, 15, 10);
    ctx.lineWidth = selected ? 2.5 : 1; ctx.strokeStyle = selected ? '#f2d27a' : 'rgba(255,255,255,0.8)'; ctx.strokeRect(x, y - 8, 15, 10);
    ctx.fillStyle = '#eee6d6'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'left'; ctx.fillText(label, x + 18, y + 2);
  }

  function polyline(pts, style, width) {
    ctx.strokeStyle = style; ctx.lineWidth = width; dashed(true); ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); dashed(false);
  }

  function render() {
    const st = S(); if (!st) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
    const N = st.map.nodes, me = st.player;
    buildTerritory();
    ctx.imageSmoothingEnabled = true; ctx.drawImage(terr, view.ox - MARG * view.s, view.oy - MARG * view.s, terr.width * RES * view.s, terr.height * RES * view.s);

    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(238,230,214,0.32)'; ctx.lineWidth = Math.max(1.5, 2.2 * view.s / fitScale);
    for (const [a, b] of st.map.edges) { ctx.beginPath(); ctx.moveTo(sx(N[a].x), sy(N[a].y)); ctx.lineTo(sx(N[b].x), sy(N[b].y)); ctx.stroke(); }

    // Selected army: its march route and its supply line.
    const sel = ui.selectedArmy !== null ? st.armies.find(a => a.id === ui.selectedArmy) : null;
    for (const a of st.armies) {
      if (a.owner !== me && a !== sel) continue;
      if (a.dest === null && !a.path.length) continue;
      const pos = VM.Armies.position(st, a), pts = [{ x: sx(pos.x), y: sy(pos.y) }];
      if (a.edge) pts.push({ x: sx(N[a.edge.to].x), y: sy(N[a.edge.to].y) });
      for (const id of a.path) pts.push({ x: sx(N[id].x), y: sy(N[id].y) });
      polyline(pts, a === sel ? '#f2d27a' : 'rgba(242,210,122,0.4)', a === sel ? 3 : 2);
    }
    if (sel) {
      const sp = VM.Armies.supplyPath(st, sel);
      if (sp && sp.length > 1) {
        const pos = VM.Armies.position(st, sel), pts = [{ x: sx(pos.x), y: sy(pos.y) }].concat(sp.map(id => ({ x: sx(N[id].x), y: sy(N[id].y) })));
        polyline(pts, sel.supply && sel.supply.line !== 'ok' ? '#e0483a' : 'rgba(200,224,112,0.85)', 2.5);
      }
    }

    // Nodes
    const zoom = view.s / fitScale, fs = Math.max(10, Math.min(14, 11 * zoom));
    for (const c of st.cities) {
      const n = N[c.id], f = st.factions[c.owner], x = sx(n.x), y = sy(n.y);
      const r = (c.spec === 'capital' ? 13 : 9 + 3 * Math.min(1, c.pop / Math.max(1, c.stats ? c.stats.cap : 1))) * Math.min(1.5, Math.max(0.85, zoom));
      if (c.owner === me) { ctx.strokeStyle = '#f2d27a'; ctx.lineWidth = 2; dashed(true); ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 7); ctx.stroke(); dashed(false); }
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = f.color; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
      if (c.id === ui.selectedCity) { ctx.beginPath(); ctx.arc(x, y, r + 8, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke(); }
      if (c.build) { ctx.beginPath(); ctx.arc(x, y, r + 2.5, -Math.PI / 2, -Math.PI / 2 + 6.283 * (1 - c.build.left / c.build.total)); ctx.strokeStyle = '#c8e070'; ctx.lineWidth = 3; ctx.stroke(); }
      const wmax = VM.War.wallMax(c);
      if (wmax > 0) {                                           // wall hit points
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 13, y - r - 9, 26, 4);
        ctx.fillStyle = c.wallHp < wmax * 0.35 ? '#e0483a' : '#d0b080'; ctx.fillRect(x - 13, y - r - 9, 26 * Math.max(0, Math.min(1, c.wallHp / wmax)), 4);
      }
      if (c.depot) { ctx.fillStyle = '#f2d27a'; ctx.fillRect(x + r - 2, y - r - 2, 7, 7); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(x + r - 2, y - r - 2, 7, 7); }
      if (c.besieged || c.contested) { ctx.strokeStyle = '#e0483a'; ctx.lineWidth = 2.5; dashed(true); ctx.beginPath(); ctx.arc(x, y, r + 11 + (Math.sin(Date.now() / 250) + 1) * 1.5, 0, 7); ctx.stroke(); dashed(false); }
      drawMark(c.spec, x, y, r);
      ctx.font = fs + 'px system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(7,6,10,0.8)'; ctx.fillText(n.name, x + 1, y + r + fs + 5); ctx.fillStyle = c.owner === me ? '#f2d27a' : 'rgba(238,230,214,0.9)'; ctx.fillText(n.name, x, y + r + fs + 4);
    }

    const fo = VM.Tutorial.focus();                                           // the node the tutorial wants you to look at
    if (fo >= 0) { const n = N[fo], r = 22 + (Math.sin(Date.now() / 200) + 1) * 5; ctx.strokeStyle = '#f2d27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx(n.x), sy(n.y), r, 0, 7); ctx.stroke(); }

    // Armies
    const slots = {};
    for (const a of st.armies) {
      const k = a.at !== null ? a.at : -1 - a.id, slot = slots[k] = slots[k] || 0; slots[k]++;
      const pos = armyScreenPos(a, slot);
      const n = VM.Armies.sizeOf(a), lbl = n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
      ctx.globalAlpha = a.routed ? 0.5 : 1;
      drawFlag(pos.x, pos.y, st.factions[a.owner].color, n, a.id === ui.selectedArmy, lbl + (a.routed ? ' R' : ''));
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(pos.x, pos.y + 4, 15, 3);
      ctx.fillStyle = a.morale < 30 ? '#e0483a' : '#c8e070'; ctx.fillRect(pos.x, pos.y + 4, 15 * Math.max(0, Math.min(1, a.morale / 100)), 3);
      if (a.supply && a.supply.line !== 'ok' && !a.supply.depot) { ctx.fillStyle = '#e0483a'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'left'; ctx.fillText('!', pos.x + 18, pos.y - 8); }
    }
    // Battles: a red cross between armies in contact
    for (const a of st.armies) for (const id of a.fighting) {
      if (id < a.id) continue;
      const e = st.armies.find(x => x.id === id); if (!e) continue;
      const p = VM.Armies.position(st, a), q = VM.Armies.position(st, e), bx = sx((p.x + q.x) / 2), by = sy((p.y + q.y) / 2) - 4, z = 7 + Math.sin(Date.now() / 120);
      ctx.strokeStyle = '#ff5a48'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx - z, by - z); ctx.lineTo(bx + z, by + z); ctx.moveTo(bx + z, by - z); ctx.lineTo(bx - z, by + z); ctx.stroke();
    }
    const vg = ctx.createRadialGradient(innerWidth / 2, innerHeight / 2, Math.min(innerWidth, innerHeight) * 0.45, innerWidth / 2, innerHeight / 2, Math.max(innerWidth, innerHeight) * 0.75);
    vg.addColorStop(0, 'rgba(7,6,10,0)'); vg.addColorStop(1, 'rgba(7,6,10,0.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, innerWidth, innerHeight);
  }

  return { init, render, fit, centerOn, resize, view: () => view };
})();
