// Small per-device preferences (text size), remembered in localStorage.
var VM = globalThis.VM = globalThis.VM || {};

VM.UIPrefs = (function () {
  const P = { size: 'normal', ui: 'mixed', det: false };
  try { Object.assign(P, JSON.parse(localStorage.getItem('vexmarch.prefs')) || {}); } catch (e) { /* defaults */ }
  const apply = () => { const h = document.documentElement; h.dataset.size = P.size; h.dataset.ui = P.ui || 'mixed'; h.classList.toggle('det', !!P.det); };
  return {
    get: k => P[k],
    set(k, v) { P[k] = v; try { localStorage.setItem('vexmarch.prefs', JSON.stringify(P)); } catch (e) { /* optional */ } apply(); },
    apply
  };
})();
