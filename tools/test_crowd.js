// Checks the animation data behind the 3D soldiers: every clip the city view asks for exists, the baked skin matrices are sound, and a standing
// figure keeps its feet on the ground. Usage: node tools/test_crowd.js
const fs = require('fs'), path = require('path'), assert = require('assert');
require('../js/view3d/crowd_clips.js'); require('../js/view3d/crowd.js');
const VM = globalThis.VM, CC = VM.CrowdClips;
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

const { rows, clips } = VM.Crowd.bake(CC);
ok(Object.keys(clips).length >= 30, 'clips baked: ' + Object.keys(clips).length);
for (const k of ['hStand', 'hWalk', 'hRun']) ok(clips[k], 'horse clip ' + k);
ok(rows.every(r => r.length === 52 * 4 && r.every(Number.isFinite)), 'every row is 52 finite texels');
ok(rows.length < 1200, 'the texture stays small: ' + rows.length + ' rows');

// every clip name the city view mentions exists
const src = fs.readFileSync(path.join(__dirname, '..', 'js/view3d/city3d.js'), 'utf8');
const names = new Set((src.match(/'(?:sw|sp|bw|cv|h)[A-Z]\w*'|'ride(?:Stab|Slash)?'|'cheer'/g) || []).map(s => s.slice(1, -1)));
for (const nm of names) ok(clips[nm], 'city3d uses clip ' + nm);
ok(names.size >= 20, 'found the clip names in city3d: ' + names.size);

// standing still: the skin matrix of the knee carries the rest-pose foot to near the ground, and the head stays above the hips
const B = VM.Crowd.BONES, apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
for (const nm of ['swIdle', 'spIdle', 'bwIdle', 'cvIdle', 'swWalk']) {
  const c = clips[nm], row = rows[c.row], m = b => row.slice(B.indexOf(b) * 16, B.indexOf(b) * 16 + 16);
  const foot = apply(m('kneeL'), [-0.14, 0.04, 0]), head = apply(m('head'), [0, 1.78, 0]);
  ok(foot[1] > -0.15 && foot[1] < 0.45, nm + ' foot height ' + foot[1].toFixed(2)); ok(head[1] > 1.3 && head[1] < 2.1, nm + ' head height ' + head[1].toFixed(2));
}
// a one-shot death ends lying down
const die = clips.swDie, last = rows[die.row + die.count - 1], hd = apply(last.slice(2 * 16, 2 * 16 + 16), [0, 1.78, 0]);
ok(hd[1] < 0.9, 'a fallen soldier lies low: head at ' + hd[1].toFixed(2));
// a horse standing: the matrices are a quarter turn (faces +z) and keep the back at about the same height
const hs = rows[clips.hStand.row], headPt = apply(hs.slice(2 * 16, 2 * 16 + 16), CC.horse.rest[2]);
ok(Math.abs(headPt[2] - CC.horse.rest[2][0]) < 0.01 && Math.abs(headPt[0]) < 0.01 && Math.abs(headPt[1] - CC.horse.rest[2][1]) < 0.01, 'the horse faces +z: its head is at ' + headPt.map(v => v.toFixed(2)));
console.log(`crowd test: ${n} checks passed`);
