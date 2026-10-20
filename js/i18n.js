// Vexmarch - other languages. The game is written in English; this layer watches the page and swaps every text it shows for the
// chosen language's (js/lang_ko.js: English text -> translation), so the game code stays as it is. Numbers in a text match as {0}, {1}...
// ("Rations {0} days"), and names (cities, officers, factions) match as {a}, {b}, {c} and are kept as they are. Texts that are not in the
// table are tried in parts (split at " · ", ": " and so on). Switching back to English restores the original texts.
var VM = globalThis.VM = globalThis.VM || {};

VM.I18N = (function () {
  const TABLES = { ko: typeof LANG_KO !== 'undefined' ? LANG_KO : null };
  const NAMES = [['en', 'English'], ['ko', '한국어']];
  let T = null, lang = 'en', tmpl = null, pats = [], done = new WeakMap(), cache = new Map(), orig = new WeakMap(), started = false;
  const NUM = /[-+−]?\d+(?:[.,]\d+)?/g;
  try { lang = localStorage.getItem('vexmarch.lang') || 'en'; } catch (e) { /* default */ }

  function use(l) {
    lang = TABLES[l] ? l : 'en'; T = TABLES[lang]; cache.clear(); done = new WeakMap();
    tmpl = new Map(); pats = [];
    if (T) for (const k in T) {
      if (/\{[a-c]\}/.test(k)) {                                                // a phrase around names: "Battle near {a}: {b} against {c}"
        const names = [], re = new RegExp('^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d|[a-c])\}/g, (_, n) => { names.push(n); return /\d/.test(n) ? '([-+]?\\d+(?:[.,]\\d+)?)' : '(.+?)'; }) + '$');
        pats.push({ re, names, to: T[k] });
      } else if (k.includes('{0}')) tmpl.set(k, T[k]);
    }
    pats.sort((a, b) => b.re.source.length - a.re.source.length);
    document.documentElement.lang = lang;
  }

  function tr(s) {
    if (!T || !s || !/[A-Za-z]/.test(s)) return s;
    if (cache.has(s)) return cache.get(s);
    const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim();
    let r = find(core);
    r = r === null ? s : lead + r + tail;
    if (cache.size > 5000) cache.clear();
    cache.set(s, r); return r;
  }

  function find(c) {
    if (T[c] !== undefined) return T[c];
    const nums = c.match(NUM);
    if (nums) { const k = c.replace(NUM, (() => { let i = 0; return () => '{' + i++ + '}'; })()); if (tmpl.has(k)) return tmpl.get(k).replace(/\{(\d)\}/g, (_, i) => nums[+i]); }
    for (const P of pats) {
      const m = c.match(P.re); if (!m) continue;
      const v = {}; P.names.forEach((n, i) => { v[n] = /\d/.test(n) ? m[i + 1] : (find(m[i + 1]) ?? m[i + 1]); });
      return P.to.replace(/\{(\d|[a-c])\}/g, (_, n) => v[n] ?? '');
    }
    const pre = c.match(/^([^A-Za-z0-9{"'(]+)(.+)$/u); if (pre) { const r = find(pre[2]); if (r !== null) return pre[1] + r; }
    const post = c.match(/^(.+?)([.:!,]+)$/); if (post) { const r = find(post[1]); if (r !== null) return r + post[2]; }
    for (const sep of [' · ', ': ', ' — ', ' - ']) {
      if (!c.includes(sep)) continue;
      const parts = c.split(sep), out = parts.map(p => { const t = p.trim() ? find(p.trim()) : p; return t === null ? null : t; });
      if (out.every(x => x !== null) || out.filter(x => x !== null).length >= Math.ceil(parts.length / 2)) return out.map((x, i) => x === null ? parts[i] : x).join(sep);
    }
    return null;
  }

  const ATTRS = ['title', 'placeholder', 'aria-label'];
  function node(n) {
    if (n.nodeType === 3) {
      const v = n.data; if (done.get(n) === v) return;
      const t = tr(v); done.set(n, t); if (t !== v) { if (!orig.has(n)) orig.set(n, v); n.data = t; }
    } else if (n.nodeType === 1) {
      if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'CANVAS' || n.tagName === 'TEXTAREA' || n.getAttribute('translate') === 'no') return;
      for (const a of ATTRS) { const v = n.getAttribute && n.getAttribute(a); if (v) { const t = tr(v); if (t !== v) { if (!n.hasAttribute('data-en-' + a)) n.setAttribute('data-en-' + a, v); n.setAttribute(a, t); } } }
      for (let c = n.firstChild; c; c = c.nextSibling) node(c);
    }
  }
  function restore(n) {
    if (n.nodeType === 3) { if (orig.has(n)) { n.data = orig.get(n); orig.delete(n); } }
    else if (n.nodeType === 1) {
      for (const a of ATTRS) if (n.hasAttribute && n.hasAttribute('data-en-' + a)) { n.setAttribute(a, n.getAttribute('data-en-' + a)); n.removeAttribute('data-en-' + a); }
      for (let c = n.firstChild; c; c = c.nextSibling) restore(c);
    }
  }

  function start() {
    if (started) return; started = true;
    use(lang);
    new MutationObserver(list => {
      if (!T) return;
      for (const m of list) {
        if (m.type === 'characterData' || m.type === 'attributes') node(m.target);
        else for (const a of m.addedNodes) node(a);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    if (T) node(document.body);
  }

  function set(l) {
    try { localStorage.setItem('vexmarch.lang', l); } catch (e) { /* optional */ }
    if (l === 'en' || !TABLES[l]) { restore(document.body); use('en'); done = new WeakMap(); }
    else { restore(document.body); use(l); node(document.body); }
  }

  return { start, set, tr, flush() { if (T) node(document.body); }, get lang() { return lang; }, NAMES, has: l => l === 'en' || !!TABLES[l] };
})();
