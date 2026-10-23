// Icons: one small set of line icons (inline SVG symbols, 24x24, drawn with the current text colour) used by every panel instead of words.
// Every icon that carries meaning has a tip (js/ui/tips.js): hold or hover it to read the name and the explanation.
//   VM.Icons.svg('gold')                 the bare icon
//   VM.Icons.t('gold', 'Gold', 'text')   icon wrapped with a tip: first line is the name, the rest explains
//   VM.Icons.btn('flag', 'Form army', { 'data-act': 'form' }, 'btn')   an icon button with a name tip
var VM = globalThis.VM = globalThis.VM || {};

VM.Icons = (function () {
  const S = {                                                    // name -> the shapes of a 24x24 icon (stroke only unless fill="currentColor")
    gold: '<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="5"/><path d="M12 9.500v5"/>',
    coins: '<circle cx="9" cy="9" r="5.500"/><path d="M14.500 7.500A5.500 5.500 0 1 1 8 17M9 7v4"/>',
    food: '<path d="M12 21V8M12 8c-3 0-4-2-4-4 3 0 4 2 4 4zM12 8c3 0 4-2 4-4-3 0-4 2-4 4zM12 13c-3 0-4-2-4-4 3 0 4 2 4 4zM12 13c3 0 4-2 4-4-3 0-4 2-4 4zM12 18c-3 0-4-2-4-4 3 0 4 2 4 4zM12 18c3 0 4-2 4-4-3 0-4 2-4 4z"/>',
    pop: '<circle cx="9" cy="8" r="3.200"/><path d="M3 20c0-3.800 2.700-6.200 6-6.200s6 2.400 6 6.200"/><circle cx="17" cy="9" r="2.500"/><path d="M16.500 14.200c2.700.3 4.500 2.300 4.500 5.800"/>',
    wall: '<path d="M4 20V9h3V6h2v3h6V6h2v3h3v11zM10 20v-5h4v5"/>',
    helmet: '<path d="M5 15a7 7 0 0 1 14 0v3H5zM12 8v5M5 18h14"/>',
    shield: '<path d="M12 3l7 3v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z"/>',
    trend: '<path d="M3 17l6-6 4 4 8-9M15 6h6v6"/>',
    crown: '<path d="M3 18L2 8l5.500 4.500L12 5l4.500 7.500L22 8l-1 10zM4 21h16"/>',
    crate: '<path d="M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9"/>',
    flag: '<path d="M6 21V4M6 5h12l-2.500 4 2.500 4H6"/>',
    banner: '<path d="M6 21V4M6 5c4-2.500 7 2.500 12 0v8c-5 2.500-8-2.500-12 0"/>',
    heart: '<path d="M12 20s-8-5-8-11a4.500 4.500 0 0 1 8-2.700A4.500 4.500 0 0 1 20 9c0 6-8 11-8 11z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.600 0l3-3a4 4 0 0 0-5.600-5.600l-1 1M14 10a4 4 0 0 0-5.600 0l-3 3a4 4 0 0 0 5.600 5.600l1-1"/>',
    unlink: '<path d="M10 14a4 4 0 0 0 5.600 0l3-3a4 4 0 0 0-5.600-5.600l-1 1M14 10a4 4 0 0 0-5.600 0l-3 3a4 4 0 0 0 5.600 5.600l1-1M4 4l16 16"/>',
    bread: '<path d="M4 15a8 6 0 0 1 16 0v3H4zM8 11.500V15M12 10v5M16 11.500V15"/>',
    sword: '<path d="M14.500 4.500L20 4l-.5 5.500-9 9-4-4zM7 15l-3 3 2 2 3-3M5 21l2-2"/>',
    spear: '<path d="M4 20L17 7"/><path d="M14 3.500l6.500 0 0 6.500z" fill="currentColor"/>',
    bow: '<path d="M7 3.500c9 3 9 14 0 17M7 3.500v17M7 12h13M17 9l3 3-3 3"/>',
    horse: '<path d="M6 21v-8l3-6 4-3 1.500 3 3.500 2v3.500l-3.500 1-1.500-2-2.500 4.500V21z"/>',
    siege: '<path d="M3 20h18M6 20l4-9M18 20l-3-7M10 11l8-7M17 3l3 3"/>',
    hold: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M7.500 11H16.500M5 15.500c.5 3 3.500 5 7 5s6.500-2 7-5"/>',
    reinforce: '<path d="M3 12h7M7 8l3 4-3 4M21 12h-7M17 8l-3 4 3 4"/>',
    raid: '<path d="M5 19L18 6l1-3-3 1L3 17zM4 16l4 4"/>',
    flame: '<path d="M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-2 1-3.500 2-4.500.2 2 1 3 2 3 0-3 0-6 2-8.500z"/>',
    bolt: '<path d="M13 3L5 13.500h6L10 21l8-10.500h-6z"/>',
    horn: '<path d="M3 10l12-5v14L3 14zM15 8.500c3 1 5 2 5 3.500s-2 2.500-5 3.500"/>',
    star: '<path d="M12 3l2.700 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.9z"/>',
    fist: '<path d="M7 11V7.500a1.500 1.500 0 0 1 3 0V6a1.500 1.500 0 0 1 3 0v1.500a1.500 1.500 0 0 1 3 0V9a1.500 1.500 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-3a1.500 1.500 0 0 1 2.500-1.500z"/>',
    scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h7M9 13h7M9 17h4"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.500c.7.700 1 1.500 1 2.500h6c0-1 .3-1.800 1-2.500A6 6 0 0 0 12 3z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    handshake: '<circle cx="8.500" cy="12" r="5.500"/><circle cx="15.500" cy="12" r="5.500"/>',
    swords: '<path d="M4 4l10 10M3 7l4-4M11 16l-4 4M20 4L10 14M21 7l-4-4M13 16l4 4M4 20l3-3M20 20l-3-3"/>',
    bag: '<path d="M9 3.500h6l-1.500 3.500c4 1.800 5.500 5.500 5.500 9a4 4 0 0 1-4 4.500H9A4 4 0 0 1 5 16c0-3.500 1.500-7.200 5.500-9zM10 7h4"/>',
    chevrons: '<path d="M5 13l7-6 7 6M5 19l7-6 7 6"/>',
    mask: '<path d="M4 7c4-2 12-2 16 0 0 7-3 11-8 11S4 14 4 7zM8 11h2.500M13.500 11H16"/>',
    gift: '<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-3.500 0-4.500-4-2-4.500S12 6 12 7zM12 7c3.500 0 4.500-4 2-4.500S12 6 12 7z"/>',
    mail: '<path d="M3 6h18v12H3zM3 7l9 7 9-7"/>',
    skull: '<path d="M12 3a8 8 0 0 0-5 14.200V20h10v-2.800A8 8 0 0 0 12 3zM10 20v-3M14 20v-3"/><circle cx="9" cy="11.500" r="1.500"/><circle cx="15" cy="11.500" r="1.500"/>',
    alert: '<path d="M12 3l10 18H2zM12 10v5M12 17.500v.5"/>',
    back: '<path d="M20 12H5M11 6l-6 6 6 6"/>',
    go: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.5"/>',
    ask: '<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 1-1 1.700M12 17v.5"/>',
    pin: '<path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    disband: '<path d="M4 11l8-7 8 7v9H4zM12 9v6M9 12.500l3 3 3-3"/>',
    merge: '<path d="M5 4l7 7v9M19 4l-7 7"/>',
    walk: '<circle cx="13" cy="4.500" r="2"/><path d="M12 8l-2 6 3 3v4M12 8l4 3 3 1M10 14l-4 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/>',
    zzz: '<path d="M5 6h6l-6 6h6M13 12h5l-5 5h5"/>',
    farm: '<path d="M12 21V8M12 8c-3 0-4-2-4-4 3 0 4 2 4 4zM12 8c3 0 4-2 4-4-3 0-4 2-4 4zM12 13c-3 0-4-2-4-4 3 0 4 2 4 4zM12 13c3 0 4-2 4-4-3 0-4 2-4 4z"/>',
    market: '<path d="M3 9l2-5h14l2 5c0 2-1.500 3-3 3s-3-1-3-3c0 2-1.500 3-3 3S9 11 9 9c0 2-1.500 3-3 3S3 11 3 9zM5 12v8h14v-8"/>',
    tent: '<path d="M3 20L12 4l9 16zM12 4v16M9 20l3-6 3 6"/>',
    temple: '<path d="M3 9l9-5 9 5zM5.500 10.500v7M10 10.500v7M14 10.500v7M18.500 10.500v7M3 20h18"/>',
    mountain: '<path d="M2 20l7-13 4 7 3-4 6 10z"/>',
    anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M7.500 11H16.500M5 15.500c.5 3 3.500 5 7 5s6.500-2 7-5"/>',
    gem: '<path d="M12 3l8 9-8 9-8-9z"/>',
    cross: '<path d="M12 3v18M6 9h12"/>',
    house: '<path d="M4 11l8-7 8 7v9H4zM10 20v-5h4v5"/>',
    sprout: '<path d="M12 21v-9M12 12C12 8 9 6 5 6c0 4 3 6 7 6zM12 15c0-3 2-5 6-5 0 3-2 5-6 5z"/>',
    hand: '<path d="M8 12V6.500a1.500 1.500 0 0 1 3 0V11V5a1.500 1.500 0 0 1 3 0v6V6.500a1.500 1.500 0 0 1 3 0V14a6 6 0 0 1-6 6 6 6 0 0 1-5-3l-3-4.500a1.500 1.500 0 0 1 2.500-1.500z"/>',
    faceGood: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 2 2.500 3 4 3s3-1 4-3M9 9.500v.5M15 9.500v.5"/>',
    faceOk: '<circle cx="12" cy="12" r="9"/><path d="M8.500 15.500h7M9 9.500v.5M15 9.500v.5"/>',
    faceBad: '<circle cx="12" cy="12" r="9"/><path d="M8 17c1-2 2.500-3 4-3s3 1 4 3M9 9.500v.5M15 9.500v.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5"/>',
    all: '<path d="M4 12l5 5L20 6"/>',
    none: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  let ready = false;
  function sprite() {
    if (ready || typeof document === 'undefined') return; ready = true;
    const el = document.createElement('div'); el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><defs>' + Object.keys(S).map(k => `<symbol id="i-${k}" viewBox="0 0 24 24">${S[k]}</symbol>`).join('') + '</defs></svg>';
    document.body.insertBefore(el, document.body.firstChild);
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const svg = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  // an icon that tells what it is when held or hovered: name on the first line, then the explanation
  const w = (label, cls) => `<span class="w${cls ? ' ' + cls : ''}">${label}</span>`;                       // a word: shown in the Icons + words and Words modes, hidden in Icons only
  const t = (name, label, tip, cls, word) => `<span class="icw${cls ? ' ' + cls : ''}" data-tip="${esc(tip ? label + '\n' + tip : label)}">${svg(name)}${word ? w(label) : ''}</span>`;
  // a number or short text next to an icon, the pair sharing one tip
  const stat = (name, value, label, tip, cls) => `<span class="st${cls ? ' ' + cls : ''}" data-tip="${esc(tip ? label + '\n' + tip : label)}">${svg(name)}<small class="sl">${label}</small><b>${value}</b></span>`;   // the label shows when Details is on
  const btn = (name, label, attrs, cls, tip, word) => {
    let a = ''; for (const k in attrs || {}) a += ` ${k}="${esc(attrs[k])}"`;
    return `<button class="ibtn${cls ? ' ' + cls : ''}"${a} data-tip="${esc(tip ? label + '\n' + tip : label)}" aria-label="${esc(label)}">${svg(name)}${word ? w(label) : ''}</button>`;
  };
  // a small meter: fraction 0..1, colour class low/mid/high chosen by fraction unless given
  const meter = (frac, cls) => { const f = Math.max(0, Math.min(1, frac)); return `<span class="mt ${cls || (f < 0.3 ? 'low' : f < 0.6 ? 'mid' : 'high')}"><i style="width:${(f * 100).toFixed(0)}%"></i></span>`; };
  // pips for a level: ●●○
  const pips = (lvl, max) => { let h = ''; for (let i = 0; i < max; i++) h += `<i class="pp${i < lvl ? ' on' : ''}"></i>`; return `<span class="pips">${h}</span>`; };
  const MAP = {
    troop: { infantry: 'sword', spear: 'spear', cavalry: 'horse', archer: 'bow', siege: 'siege' },
    build: { farm: 'farm', market: 'market', barracks: 'tent', wall: 'wall', temple: 'temple' },
    spec: { capital: 'crown', farmland: 'farm', market: 'coins', pass: 'mountain', port: 'anchor', iron: 'gem', horse: 'horse', holy: 'cross', town: 'house' },
    policy: { manual: 'hand', develop: 'sprout', fortify: 'wall', recruit: 'tent' },
    order: { hold: 'hold', defend: 'shield', reinforce: 'reinforce', raid: 'raid' },
    ability: { charge: 'bolt', fire: 'flame', rally: 'horn' },
    trait: { Rash: 'flame', Cautious: 'eye', Loyal: 'handshake', Greedy: 'bag', Brave: 'chevrons', Schemer: 'mask' },
    role: { governor: 'crown', commander: 'flag', idle: 'zzz', traveling: 'go', searching: 'search' },
    alert: { attack: 'alert', army: 'flag', officer: 'mask', proposal: 'ask', battle: 'swords', famine: 'bread', diplo: 'handshake', info: 'info' },
    event: { attacked: 'alert', battle: 'swords', rout: 'back', destroyed: 'skull', captured: 'flag', breach: 'wall', blocked: 'stop', cut: 'unlink', officerCaptured: 'mask', officerDied: 'skull', eliminated: 'skull',
      defected: 'mask', loyaltyLow: 'heart', wanderer: 'pop', found: 'search', searchFailed: 'search', recruited: 'pop', arrived: 'go', built: 'house', starving: 'bread', proposal: 'ask',
      diploOffer: 'mail', allied: 'handshake', allyBroken: 'unlink', merged: 'crown' }
  };
  // A made-up face for an officer: the same name always gives the same one. `color` is the house colour of the shoulders.
  function portrait(seed, color, size) {
    let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } h >>>= 0;
    const skin = ['#f1c9a5', '#e0ac82', '#c68b62', '#9b6a47', '#6e4a32'][h % 5], hair = ['#1e1612', '#4a3020', '#8a5a2a', '#b8a070', '#a0a0a0', '#6a2a1a'][(h >> 3) % 6], bg = `hsl(${(h >> 6) % 360},28%,26%)`;
    const style = (h >> 9) % 3, w = size || 36;
    const hairShape = style === 0 ? '<path d="M7.500 11c0-5 3-7 4.500-7s4.500 2 4.500 7c-1-2-3-3-4.500-3S8.500 9 7.500 11z"/>' : style === 1 ? '<path d="M7 13V9c0-4 2.500-6 5-6s5 2 5 6v4c-.5-3-2-5-5-5s-4.500 2-5 5z"/>' : '<path d="M7.500 10.500c1-4 3-5 4.500-5s3.500 1 4.500 5c-2-1-3-1.500-4.500-1.500s-2.500.5-4.500 1.500z"/>';
    return `<svg class="pt" width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="${bg}"/><path d="M3 24c0-5 4-8 9-8s9 3 9 8z" fill="${color || '#888'}"/><rect x="10.500" y="13" width="3" height="3.500" fill="${skin}"/><ellipse cx="12" cy="10" rx="4" ry="4.600" fill="${skin}"/><g fill="${hair}">${hairShape}</g><circle cx="10.200" cy="10.200" r=".6" fill="#1a1210"/><circle cx="13.800" cy="10.200" r=".6" fill="#1a1210"/></svg>`;
  }
  if (typeof document !== 'undefined' && document.body) sprite();
  return { MAP, portrait, S, sprite, svg, w, t, stat, btn, meter, pips, esc, has: n => !!S[n] };
})();
