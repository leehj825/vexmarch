// Builds js/view3d/crowd_clips.js from the animation data of Nightfall Settlement (Mixamo clips retargeted to its 13-bone stick-figure rig, and its
// jointed horse). Usage: node tools/extract_crowd.js [path to Nightfall-Settlement]
// Every clip is resampled to ~10 frames a second and stored as quaternions, so the whole set stays small enough to ship in the app and to bake into
// one texture at start-up. Add or drop clips by editing PICK below, then run this again.
const fs = require('fs'), path = require('path');
const NF = process.argv[2] || path.join(__dirname, '..', '..', 'Nightfall-Settlement');
const FPS = 10;
const BONES = ['hips', 'spine', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR', 'hipL', 'hipR', 'kneeL', 'kneeR'];

const load = (file, name) => { const src = fs.readFileSync(path.join(NF, 'js', file), 'utf8'); const m = src.match(new RegExp('const ' + name + ' = (\\{.*\\});?\\s*$', 'm')); if (!m) throw new Error('no ' + name + ' in ' + file); return JSON.parse(m[1]); };
const CLIPS = load('anims.js', 'MIXAMO_CLIPS'), LIB = load('anims_lib.js', 'MIXAMO_LIB'), HORSE = load('horse_anim.js', 'HORSE_ANIM');
const src = k => CLIPS[k] || LIB[k];

// logical name -> source clip. Comments say what each is used for in the game.
const PICK = {
  // sword and shield: infantry
  swIdle: 'ssIdle', swWalk: 'ssWalk', swRun: 'ssRun', swAtk1: 'ssAttack1', swAtk2: 'ssAttack2', swBlock: 'ssBlock', swHit: 'ssImpact', swDie: 'die', swCheer: 'ss_sword_and_shield_power_up',
  // spear: spearmen
  spIdle: 'idle', spWalk: 'walk', spRun: 'run', spStab: 'spearStab', spSlash: 'spearSlash',
  // bow: archers
  bwIdle: 'bowIdle', bwWalk: 'bowWalk', bwRun: 'bowRun', bwShoot: 'bowDraw', bwHit: 'bowReact', bwDie: 'dieBow',
  // civilians: villagers, farmers, woodcutters
  cvIdle: 'loco_idle', cvWalk: 'walk', cvPlant: 'farmPlant', cvPull: 'farmPull', cvChop: 'chopMocap', cvCarry: 'farm_holding_walk'
};

// ---- helpers ----
function eq(x, y, z) { const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2); return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3]; }      // Euler XYZ, as three.js
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1; if (d < 0) { d = -d; s = -1; }
  let k0, k1; if (d > 0.9995) { k0 = 1 - t; k1 = t * s; } else { const th = Math.acos(d), sn = Math.sin(th); k0 = Math.sin((1 - t) * th) / sn; k1 = Math.sin(t * th) * s / sn; }
  const o = [k0 * a[0] + k1 * b[0], k0 * a[1] + k1 * b[1], k0 * a[2] + k1 * b[2], k0 * a[3] + k1 * b[3]], l = Math.hypot(...o) || 1; return o.map(v => v / l);
}
const R3 = v => Math.round(v * 200) / 200;                                  // quaternion parts to 0.005: invisible on a figure this small

// A source clip as per-frame quaternions per bone, then resampled to FPS.
function fromSource(c) {
  const frames = c.n + 1, q = {}, y = c.t.hipsY, z = c.t.hipsZ;
  for (const b of BONES) q[b] = Array.from({ length: frames }, (_, i) => { const e = c.t[b] ? c.t[b][i] : [0, 0, 0]; return eq(e[0], e[1], e[2]); });
  return { d: c.d, loop: !!c.loop, hit: c.hit, frames, q, y, z };
}
function resample(c) {
  const n = Math.max(6, Math.round(c.d * FPS)), out = { d: c.d, n, loop: c.loop, hit: c.hit, q: [], y: [], z: [] };
  for (let i = 0; i <= n; i++) {
    const f = i / n * (c.frames - 1), a = Math.min(c.frames - 2, Math.floor(f)), t = f - a;
    for (const b of BONES) out.q.push(...slerp(c.q[b][a], c.q[b][a + 1], t).map(R3));
    out.y.push(R3(c.y[a] + (c.y[a + 1] - c.y[a]) * t)); out.z.push(R3(c.z[a] + (c.z[a + 1] - c.z[a]) * t));
  }
  return out;
}

// ---- clips made here: riding, cheering ----
function made(name, d, n, loop, fn) {
  const q = {}; for (const b of BONES) q[b] = [];
  const y = [], z = [];
  for (let i = 0; i <= n; i++) { const u = i / n, pose = fn(u, Math.sin(u * Math.PI * 2)); for (const b of BONES) { const e = pose[b] || [0, 0, 0]; q[b].push(eq(e[0], e[1], e[2])); } y.push(pose.y === undefined ? 0.9 : pose.y); z.push(pose.z || 0); }
  return { d, loop, hit: 0.5, frames: n + 1, q, y, z };
}
const RIDE_LEGS = (s, k) => ({ hipL: [-1.25, 0, 0.32], hipR: [-1.25, 0, -0.32], kneeL: [1.2 + 0.05 * k, 0, 0], kneeR: [1.2 - 0.05 * k, 0, 0] });
const EXTRA = {
  ride: made('ride', 1.0, 10, true, (u, s) => Object.assign({ spine: [0.06 + 0.02 * s, 0, 0], head: [-0.05, 0, 0], shoulderL: [-0.75, 0, 0.12], shoulderR: [-0.75, 0, -0.12], elbowL: [-0.95 + 0.05 * s, 0, 0], elbowR: [-0.95 + 0.05 * s, 0, 0], y: 0.9 + 0.025 * Math.abs(s) }, RIDE_LEGS(s, s))),
  cheer: made('cheer', 1.0, 10, true, (u, s) => { const hop = Math.abs(Math.sin(u * Math.PI * 2)); return { shoulderL: [-2.7 + 0.25 * s, 0, 0.3], shoulderR: [-2.7 - 0.25 * s, 0, -0.3], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], head: [-0.25, 0, 0], spine: [-0.1, 0, 0], hipL: [-0.15 * hop, 0, 0], hipR: [-0.15 * hop, 0, 0], kneeL: [0.3 * (1 - hop), 0, 0], kneeR: [0.3 * (1 - hop), 0, 0], y: 0.86 + 0.16 * hop }; }),
  kneelSurrender: made('kneelSurrender', 2.0, 8, true, (u, s) => ({ hipL: [-1.55, 0, 0.1], hipR: [-0.9, 0, -0.1], kneeL: [1.5, 0, 0], kneeR: [1.7, 0, 0], spine: [0.35, 0, 0], head: [0.35 + 0.05 * s, 0, 0], shoulderL: [-0.3, 0, 0.2], shoulderR: [-0.3, 0, -0.2], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], y: 0.56 }))
};
// riding while attacking: the legs of the riding pose under the upper body of a stab
function rideWith(srcKey, name) {
  const up = fromSource(src(srcKey)), ride = EXTRA.ride, n = Math.max(6, Math.round(up.d * FPS));
  const c = { d: up.d, loop: false, hit: up.hit, frames: n + 1, q: {}, y: [], z: [] };
  const LOW = ['hips', 'hipL', 'hipR', 'kneeL', 'kneeR'];
  for (const b of BONES) c.q[b] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n * (up.frames - 1), a = Math.min(up.frames - 2, Math.floor(f)), t = f - a;
    for (const b of BONES) c.q[b].push(LOW.includes(b) ? ride.q[b][i % ride.frames] : slerp(up.q[b][a], up.q[b][a + 1], t));
    c.y.push(0.9); c.z.push(0);
  }
  return c;
}

const out = { fps: FPS, bones: BONES, clips: {}, horse: null };
for (const [name, key] of Object.entries(PICK)) { const s = src(key); if (!s) { console.error('missing source clip', key); process.exit(1); } out.clips[name] = resample(fromSource(s)); }
for (const [name, c] of Object.entries(EXTRA)) out.clips[name] = resample(c);
out.clips.rideStab = resample(rideWith('spearStab', 'rideStab')); out.clips.rideSlash = resample(rideWith('ssAttack1', 'rideSlash'));
// the horse: its own jointed skeleton with a walk and a gallop (kept as in the source, only rounded)
out.horse = { bones: HORSE.bones, rest: HORSE.rest.map(r => r.map(R3)), clips: {} };
for (const k of Object.keys(HORSE.clips)) { const c = HORSE.clips[k]; out.horse.clips[k] = { dur: c.dur, n: c.n, q: c.q.map(R3), p: c.p.map(R3) }; }

const body = JSON.stringify(out);
fs.writeFileSync(path.join(__dirname, '..', 'js/view3d/crowd_clips.js'), `// Generated by tools/extract_crowd.js from Nightfall Settlement's Mixamo clips (10 frames a second, quaternions per bone) and its horse animation pack. Do not edit by hand.\nvar VM = globalThis.VM = globalThis.VM || {};\nVM.CrowdClips = ${body};\n`);
const names = Object.keys(out.clips); console.log(names.length + ' human clips, ' + names.reduce((n, k) => n + out.clips[k].n + 1, 0) + ' frames, horse clips ' + Object.keys(out.horse.clips).join(', ') + '; ' + Math.round(body.length / 1024) + ' KB');
