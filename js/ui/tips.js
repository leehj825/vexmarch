// Tips: a short text appears while you touch (hold) or hover an element that carries data-tip="...". One shared box, so any panel can use it.
// Touch: hold for a moment, the tip stays while the finger is down; a short tap still does what the element does, and a tap that showed a tip is swallowed.
// Mouse: hover. The text goes through the language layer like everything else (data-tip is a translated attribute).
var VM = globalThis.VM = globalThis.VM || {};

VM.Tips = (function () {
  const HOLD = 280, HOVER = 350, SLOP = 10;
  let box, cur = null, timer = 0, down = null, swallow = 0;
  const find = t => t && t.closest ? t.closest('[data-tip]') : null;

  function show(el) {
    const text = el.getAttribute('data-tip'); if (!text) return;
    cur = el; box.textContent = '';
    const tr = s => (VM.I18N && VM.I18N.tr ? VM.I18N.tr(s) : s), lines = text.split('\n');
    lines.forEach((ln, i) => { const d = document.createElement(i === 0 && lines.length > 1 ? 'b' : 'span'); d.textContent = tr(ln); box.appendChild(d); if (i < lines.length - 1) box.appendChild(document.createElement('br')); });
    box.classList.add('on');
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect(), M = 8;
    let x = r.left + r.width / 2 - b.width / 2, y = r.top - b.height - 10;
    if (y < M) y = r.bottom + 10;                                              // no room above: below
    x = Math.max(M, Math.min(innerWidth - b.width - M, x)); y = Math.max(M, Math.min(innerHeight - b.height - M, y));
    box.style.left = x + 'px'; box.style.top = y + 'px';
  }
  function hide() { clearTimeout(timer); timer = 0; cur = null; if (box) box.classList.remove('on'); }

  function init() {
    if (box) return;
    box = document.createElement('div'); box.id = 'tip'; document.body.appendChild(box);
    document.addEventListener('pointerdown', e => {
      const el = find(e.target); hide(); down = null; if (!el || e.pointerType === 'mouse') return;
      down = { x: e.clientX, y: e.clientY, el };
      timer = setTimeout(() => { timer = 0; if (down && document.contains(el)) { show(el); down.shown = true; } }, HOLD);
    }, true);
    document.addEventListener('pointermove', e => { if (down && !down.shown && Math.hypot(e.clientX - down.x, e.clientY - down.y) > SLOP) { clearTimeout(timer); timer = 0; down = null; } }, true);
    const end = () => { if (down && down.shown) swallow = Date.now() + 150; down = null; hide(); };
    document.addEventListener('pointerup', end, true); document.addEventListener('pointercancel', end, true);
    document.addEventListener('click', e => { if (swallow > Date.now()) { swallow = 0; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } }, true);
    document.addEventListener('contextmenu', e => { if (find(e.target)) e.preventDefault(); }, true);   // the long press must not open the phone's menu
    document.addEventListener('pointerover', e => {
      if (e.pointerType !== 'mouse') return; const el = find(e.target); if (!el || el === cur) return;
      hide(); timer = setTimeout(() => { timer = 0; if (document.contains(el)) show(el); }, HOVER);
    }, true);
    document.addEventListener('pointerout', e => { if (e.pointerType === 'mouse' && find(e.target)) hide(); }, true);
    document.addEventListener('wheel', hide, { passive: true, capture: true });
    setInterval(() => { if (cur && !document.contains(cur)) hide(); }, 400);        // the panel was redrawn under the tip
  }
  return { init, hide, isOn: () => !!cur };
})();
