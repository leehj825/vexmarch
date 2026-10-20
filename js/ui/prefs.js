// Small per-device preferences (text size), remembered in localStorage.
var VM = globalThis.VM = globalThis.VM || {};

VM.UIPrefs = (function () {
  const P = { size: 'normal' };
  try { Object.assign(P, JSON.parse(localStorage.getItem('vexmarch.prefs')) || {}); } catch (e) { /* defaults */ }
  const apply = () => { document.documentElement.dataset.size = P.size; };
  return {
    get: k => P[k],
    set(k, v) { P[k] = v; try { localStorage.setItem('vexmarch.prefs', JSON.stringify(P)); } catch (e) { /* optional */ } apply(); },
    apply
  };
})();
