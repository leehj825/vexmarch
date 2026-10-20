// Boot and main loop. Phase 0 placeholder view: draws the road map and a resource readout so the whole script chain is proven to load.
(function () {
  const canvas = document.getElementById('map'), ctx = canvas.getContext('2d');
  const state = VM.Sim.create({ seed: (Date.now() & 0xffff) || 1 });
  let speed = 1, selected = -1, last = performance.now(), view = { s: 1, ox: 0, oy: 0 };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    const m = state.map, pad = 50;
    view.s = Math.min((innerWidth - pad * 2) / m.w, (innerHeight - pad * 2) / m.h);
    view.ox = (innerWidth - m.w * view.s) / 2; view.oy = (innerHeight - m.h * view.s) / 2 + 20;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const px = n => n.x * view.s + view.ox, py = n => n.y * view.s + view.oy;

  function draw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const N = state.map.nodes;
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(238,230,214,0.25)';
    for (const [a, b] of state.map.edges) { ctx.beginPath(); ctx.moveTo(px(N[a]), py(N[a])); ctx.lineTo(px(N[b]), py(N[b])); ctx.stroke(); }
    for (const c of state.cities) {
      const n = N[c.id], f = state.factions[c.owner];
      ctx.beginPath(); ctx.arc(px(n), py(n), c.spec === 'capital' ? 13 : 9, 0, 7);
      ctx.fillStyle = f.color; ctx.fill();
      ctx.lineWidth = c.id === selected ? 3 : 1; ctx.strokeStyle = c.id === selected ? '#fff' : 'rgba(0,0,0,0.6)'; ctx.stroke();
      ctx.fillStyle = 'rgba(238,230,214,0.8)'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(n.name, px(n), py(n) + 24);
    }
  }

  function hud() {
    const f = state.factions[state.player], d = VM.Sim.date(state);
    document.getElementById('gold').textContent = 'Gold ' + Math.floor(f.gold);
    document.getElementById('food').textContent = 'Food ' + Math.floor(f.food);
    document.getElementById('date').textContent = 'Y' + d.year + ' M' + d.month + ' D' + d.day;
    const c = state.cities[selected];
    document.getElementById('info').textContent = c
      ? state.map.nodes[c.id].name + ' - ' + VM.CFG.SPEC[c.spec].label + '\nOwner: ' + state.factions[c.owner].name + '\nPopulation ' + Math.round(c.pop) + ' / ' + (c.stats ? Math.round(c.stats.cap) : '') + '\nProsperity ' + (c.stats ? c.stats.prosperity.toFixed(2) : '')
      : 'Tap a node. (Phase 0 placeholder view)';
  }

  function frame(now) {
    VM.Sim.update(state, (now - last) / 1000, speed); last = now;
    draw(); hud(); requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', e => {
    let best = -1, bd = 24 * 24;
    state.map.nodes.forEach(n => { const dx = px(n) - e.clientX, dy = py(n) - e.clientY, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n.id; } });
    selected = best;
  });
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => {
    speed = +b.dataset.s; document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('on', x === b));
  }));
  addEventListener('resize', resize); resize();
  window.__vm = { state };    // test hook
  requestAnimationFrame(frame);
})();
