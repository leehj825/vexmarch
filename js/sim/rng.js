// Seeded RNG (mulberry32). The generator state lives in state.rng so saves replay exactly.
var VM = globalThis.VM = globalThis.VM || {};

VM.RNG = {
  next(state) {
    state.rng = (state.rng + 0x6D2B79F5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  int(state, n) { return Math.floor(VM.RNG.next(state) * n); },
  range(state, a, b) { return a + VM.RNG.next(state) * (b - a); },
  pick(state, arr) { return arr[VM.RNG.int(state, arr.length)]; },
  shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = VM.RNG.int(state, i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
};
