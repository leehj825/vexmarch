// The simulation clock. advance() steps in fixed increments, so a run is identical whatever the frame rate.
var VM = globalThis.VM = globalThis.VM || {};

VM.Sim = (function () {
  function create(opts) { return VM.World.create(opts); }

  function stepOnce(state) {
    const dd = VM.CFG.STEP_DAYS;
    VM.Armies.step(state, dd);
    VM.War.step(state, dd);
    VM.Report.step(state);
    VM.Officers.step(state, dd);
    VM.Diplo.step(state, dd);
    VM.Fog.update(state);
    VM.Hazards.step(state, dd);
    VM.AI.step(state);
    VM.Eco.step(state, dd);
    VM.Trade.step(state, dd);
    VM.Doctrine.step(state);
    state.time += dd;
    if (state.story && VM.Story) VM.Story.step(state);
  }

  // Advance by a number of in-game days (headless runs and tests).
  function advance(state, days, each) {
    const steps = Math.round(days / VM.CFG.STEP_DAYS);
    for (let i = 0; i < steps && !state.over; i++) { stepOnce(state); if (each) each(state); }
  }

  // Advance by real seconds at a speed multiplier (the browser loop). Leftover time is kept in state.acc.
  function update(state, dtSeconds, speed) {
    const stepSec = VM.CFG.STEP_DAYS * VM.CFG.DAY_SECONDS;
    if (state.over) return;
    state.acc += Math.min(dtSeconds, 0.25) * speed;
    let n = 0;
    while (state.acc >= stepSec && n < 40 && !state.over) { stepOnce(state); state.acc -= stepSec; n++; }
    if (n === 40) state.acc = 0;
  }

  function hash(state) {
    const s = JSON.stringify(state); let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }

  function save(state) { return JSON.stringify(state); }
  function load(text) { return JSON.parse(text); }

  function date(state) {
    const D = VM.CFG.DAYS_PER_YEAR, day = Math.floor(state.time);
    return { year: Math.floor(day / D) + 1, month: Math.floor((day % D) / 30) + 1, day: (day % 30) + 1 };
  }

  return { create, stepOnce, advance, update, hash, save, load, date };
})();
