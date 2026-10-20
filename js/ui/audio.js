// Vexmarch - synthesized sound effects and a small generative score (WebAudio, no asset files).
// Mood follows the game: calm on the map, war when your armies are fighting or a city of yours is attacked.
var VM = globalThis.VM = globalThis.VM || {};

VM.Audio = (function () {
  let ctx = null, master, sfx, mus, noiseBuf, timer = 0, bar = 0, mood = 'calm', nextBar = 0;
  const S = { master: 0.8, music: 0.5, sfx: 0.8, mute: false };
  try { Object.assign(S, JSON.parse(localStorage.getItem('vexmarch.audio')) || {}); } catch (e) { /* defaults */ }
  const save = () => { try { localStorage.setItem('vexmarch.audio', JSON.stringify(S)); } catch (e) { /* optional */ } };
  const NF = n => 440 * Math.pow(2, (n - 69) / 12);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.connect(master); mus = ctx.createGain(); mus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    levels(); nextBar = ctx.currentTime + 0.1; timer = setInterval(schedule, 250);
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  }

  function levels() {
    if (!ctx) return;
    master.gain.value = S.mute ? 0 : S.master; sfx.gain.value = S.sfx; mus.gain.value = S.music;
  }

  function tone(f, dur, type, vol, slide, delay, dest) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfx); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, type, f0, f1, delay) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0), src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f0, t0); fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(fl); fl.connect(g); g.connect(sfx); src.start(t0); src.stop(t0 + dur + 0.05);
  }

  const SFX = {
    click: () => tone(660, 0.07, 'triangle', 0.12),
    pick: () => { tone(520, 0.08, 'triangle', 0.14); tone(780, 0.1, 'triangle', 0.1, null, 0.05); },
    coin: () => { tone(1320, 0.08, 'square', 0.07); tone(1760, 0.14, 'square', 0.07, null, 0.07); },
    build: () => { noise(0.08, 0.25, 'bandpass', 900, 500); noise(0.08, 0.25, 'bandpass', 900, 500, 0.14); tone(392, 0.25, 'triangle', 0.12, null, 0.3); tone(523, 0.35, 'triangle', 0.12, null, 0.4); },
    recruit: () => { tone(196, 0.12, 'sawtooth', 0.1); tone(247, 0.18, 'sawtooth', 0.1, null, 0.1); },
    order: () => { tone(330, 0.1, 'square', 0.08); tone(440, 0.14, 'square', 0.08, null, 0.08); },
    horn: () => { tone(147, 0.7, 'sawtooth', 0.14, 160); tone(220, 0.7, 'sawtooth', 0.08, 235); },
    clash: () => { noise(0.25, 0.4, 'highpass', 3000, 900); tone(240, 0.12, 'square', 0.1, 120); },
    alert: () => { tone(880, 0.12, 'square', 0.12); tone(660, 0.18, 'square', 0.12, null, 0.14); },
    danger: () => { tone(220, 0.3, 'sawtooth', 0.14, 160); tone(165, 0.45, 'sawtooth', 0.14, 120, 0.28); },
    capture: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, null, i * 0.11)); },
    lose: () => { [330, 294, 262, 196].forEach((f, i) => tone(f, 0.5, 'triangle', 0.15, null, i * 0.3)); },
    win: () => { [262, 330, 392, 523, 392, 523, 659].forEach((f, i) => tone(f, 0.35, 'triangle', 0.16, null, i * 0.16)); },
    ability: () => { tone(300, 0.4, 'sawtooth', 0.12, 900); noise(0.4, 0.15, 'bandpass', 400, 3000); },
    rout: () => { tone(300, 0.5, 'sawtooth', 0.1, 90); },
    error: () => tone(150, 0.14, 'square', 0.1)
  };
  function play(name) { if (!ctx || S.mute || !SFX[name]) return; try { SFX[name](); } catch (e) { /* sound is never allowed to break the game */ } }

  // ---- Music: one chord per bar, a pad, a slow arpeggio and bell notes; war adds a bass and drums and moves to a minor key ----
  const MOODS = {
    calm: { bpm: 66, prog: [[50, 54, 57], [55, 59, 62], [47, 50, 54], [45, 49, 52]], scale: [74, 76, 78, 81, 83, 86], mix: { pad: 0.5, arp: 0.5, mel: 0.45, bass: 0, drum: 0 } },
    war:  { bpm: 96, prog: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], scale: [74, 77, 79, 81, 84], mix: { pad: 0.35, arp: 0.3, mel: 0.1, bass: 0.6, drum: 0.7 } }
  };
  function pad(chord, t, dur, vol) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const n of chord) for (const dt of [-3, 3]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NF(n - 12); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }
    lp.connect(g); g.connect(mus);
  }
  function note(f, t, dur, vol, type) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(mus); o.start(t); o.stop(t + dur + 0.05);
  }
  function drum(t, kind, vol) {
    if (kind === 'k') { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g); g.connect(mus); o.start(t); o.stop(t + 0.2); }
    else { const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noiseBuf; fl.type = 'highpass'; fl.frequency.value = 2500; g.gain.setValueAtTime(vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); src.connect(fl); fl.connect(g); g.connect(mus); src.start(t); src.stop(t + 0.1); }
  }

  function playBar(t) {
    const M = MOODS[mood], beat = 60 / M.bpm, len = beat * 4, chord = M.prog[bar % M.prog.length];
    if (M.mix.pad) pad(chord, t, len + 0.4, 0.035 * M.mix.pad);
    if (M.mix.arp) for (let i = 0; i < 8; i++) note(NF(chord[i % 3] + 12 + (i > 5 ? 12 : 0)), t + i * beat / 2, beat * 0.9, 0.03 * M.mix.arp);
    if (M.mix.mel && bar % 2 === 0) for (let i = 0; i < 3; i++) if (Math.random() < 0.7) note(NF(M.scale[Math.floor(Math.random() * M.scale.length)]), t + (i * 1.3 + Math.random() * 0.5) * beat, beat * 1.6, 0.04 * M.mix.mel, 'sine');
    if (M.mix.bass) for (let i = 0; i < 4; i++) note(NF(chord[0] - 12), t + i * beat, beat * 0.8, 0.07 * M.mix.bass, 'sawtooth');
    if (M.mix.drum) for (let i = 0; i < 8; i++) { if (i % 4 === 0) drum(t + i * beat / 2, 'k', 0.25 * M.mix.drum); else if (i % 2 === 1) drum(t + i * beat / 2, 's', 0.12 * M.mix.drum); }
    bar++; nextBar = t + len;
  }
  function schedule() {
    if (!ctx || ctx.state !== 'running' || S.mute || S.music <= 0.001) { if (ctx) nextBar = Math.max(nextBar, ctx.currentTime + 0.1); return; }
    while (nextBar < ctx.currentTime + 1.2) playBar(Math.max(nextBar, ctx.currentTime + 0.05));
  }

  return {
    init, play, tone, levels,
    setMood(m) { if (MOODS[m]) mood = m; },
    get: k => S[k],
    set(k, v) { S[k] = v; save(); levels(); },
    toggleMute() { S.mute = !S.mute; save(); levels(); return S.mute; }
  };
})();
