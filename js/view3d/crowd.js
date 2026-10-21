// The animated crowd: simple low-poly people and horses that play the real animation clips of Nightfall Settlement and Deepward (js/view3d/crowd_clips.js).
// Every figure is a handful of boxes, each hung rigidly on one of 13 bones (12 for the horse). All the clips are baked once into a float texture of
// skin matrices (one row per frame), and the vertex shader reads the rows for the clip each instance is playing, so a whole army is one draw call per
// kind of figure and the animation costs nothing on the CPU beyond writing four numbers per soldier a frame.
//   var crowd = VM.Crowd.create(THREE);
//   var mesh = crowd.mesh('sword', count);            // roles: sword, spear, archer, rider, civ, horse
//   crowd.play(mesh, i, 'swWalk', seconds, hold);     // clip name, time in the clip; hold=true stays on the last frame of a one-shot clip
// Needs THREE (r128) and VM.CrowdClips. Pure browser code, no module system.
var VM = globalThis.VM = globalThis.VM || {};
VM.Crowd = (function () {
  const BONES = ['hips', 'spine', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR', 'hipL', 'hipR', 'kneeL', 'kneeR'];
  const PARENT = [-1, 0, 1, 1, 1, 3, 4, 5, 6, 0, 0, 9, 10];
  // bone offsets from the parent in the rest pose (Nightfall's rig)
  const OFFSET = [[0, 0.9, 0], [0, 0.05, 0], [0, 0.66, 0], [-0.34, 0.58, 0], [0.34, 0.58, 0], [0, -0.3, 0], [0, -0.3, 0], [0, -0.3, 0], [0, -0.3, 0], [-0.14, -0.04, 0], [0.14, -0.04, 0], [0, -0.45, 0], [0, -0.45, 0]];
  const B = {}; BONES.forEach((n, i) => { B[n] = i; });
  const REST = [];                                                                            // rest position of each bone in the figure's space
  OFFSET.forEach((o, i) => { const p = PARENT[i] < 0 ? [0, 0, 0] : REST[PARENT[i]]; REST.push([p[0] + o[0], p[1] + o[1], p[2] + o[2]]); });
  const WIDTH = 52;                                                                           // texels a row: 13 bones x 4 columns of a 4x4 matrix

  // ---- column-major 4x4 helpers (plain arrays, 16 numbers) ----
  const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const trans = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  const fromQuat = (x, y, z, w) => { const n = Math.hypot(x, y, z, w) || 1; x /= n; y /= n; z /= n; w /= n;
    return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1]; };
  const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };

  // ---- the texture of skin matrices ----
  // clips[name] = { row, count, d, loop, hit, once } : `count` frames from `row`. A loop cycles through `count` frames; a one-shot clip ends on its last.
  function bake(CC) {
    const rows = [], clips = {};
    const push = (name, count, d, loop, hit, frames) => { clips[name] = { row: rows.length, count, d, loop, hit: hit || 0.5 }; for (let f = 0; f < count; f++) rows.push(frames(f)); };
    // a human frame: rotations q (13 x 4) and hips height/depth -> 13 skin matrices
    const human = (q, o, y, z) => {
      const W = [], row = new Array(WIDTH * 4);
      for (let b = 0; b < 13; b++) {
        const off = b === 0 ? [0, y, z] : OFFSET[b], local = mul(trans(off[0], off[1], off[2]), fromQuat(q[o + b * 4], q[o + b * 4 + 1], q[o + b * 4 + 2], q[o + b * 4 + 3]));
        W[b] = PARENT[b] < 0 ? local : mul(W[PARENT[b]], local);
        const S = mul(W[b], trans(-REST[b][0], -REST[b][1], -REST[b][2]));
        for (let k = 0; k < 16; k++) row[b * 16 + k] = S[k];
      }
      return row;
    };
    for (const name of Object.keys(CC.clips)) {
      const c = CC.clips[name], count = c.loop ? c.n : c.n + 1;
      push(name, count, c.d, c.loop, c.hit, f => human(c.q, f * 52, c.y[f], c.z[f]));
    }
    // the horse: the figure faces +x in its source, so every matrix is turned a quarter to face +z like the people
    const H = CC.horse, nb = H.bones.length, face = rotY(-Math.PI / 2), hr = H.rest;
    const horse = (q, o, p) => {
      const W = [], row = new Array(WIDTH * 4).fill(0);
      for (let b = 0; b < nb; b++) {
        const par = H.bones[b][1], off = par < 0 ? [hr[b][0] + p[0], hr[b][1] + p[1], hr[b][2] + p[2]] : [hr[b][0] - hr[par][0], hr[b][1] - hr[par][1], hr[b][2] - hr[par][2]];
        const local = mul(trans(off[0], off[1], off[2]), fromQuat(q[o + b * 4], q[o + b * 4 + 1], q[o + b * 4 + 2], q[o + b * 4 + 3]));
        W[b] = par < 0 ? local : mul(W[par], local);
        const S = mul(face, mul(W[b], trans(-hr[b][0], -hr[b][1], -hr[b][2])));
        for (let k = 0; k < 16; k++) row[b * 16 + k] = S[k];
      }
      return row;
    };
    const ident = new Array(nb * 4).fill(0); for (let b = 0; b < nb; b++) ident[b * 4 + 3] = 1;
    push('hStand', 1, 1, true, 0, () => horse(ident, 0, [0, 0, 0]));
    for (const k of Object.keys(H.clips)) { const c = H.clips[k]; push('h' + k[0].toUpperCase() + k.slice(1), c.n, c.dur, true, 0, f => horse(c.q, f * nb * 4, [c.p[f * 3], c.p[f * 3 + 1], c.p[f * 3 + 2]])); }
    return { rows, clips };
  }

  // ---- geometry: boxes and prisms in the rest pose, each tagged with its bone, whether the faction colour shows on it, and a flat colour ----
  function Builder(THREE) {
    const pos = [], nor = [], col = [], bone = [], tint = [], c = new THREE.Color(), m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
    const add = (geo, mat, b, color, t) => {
      const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, N = g.attributes.normal; c.set(color); nm.getNormalMatrix(mat);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(mat); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b); bone.push(b); tint.push(t ? 1 : 0);
      }
    };
    const rot = (rx, ry, rz) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    const place = (x, y, z, rx, ry, rz) => m.copy(rot(rx || 0, ry || 0, rz || 0)).setPosition(x, y, z);
    const box = new THREE.BoxGeometry(1, 1, 1);
    return {
      // a box of w x h x d centred at (x, y, z) in figure space, turned by (rx, ry, rz) about its centre
      box(bone_, x, y, z, w, h, d, color, t, rx, ry, rz) { place(x, y, z, rx, ry, rz); m.multiply(new THREE.Matrix4().makeScale(w, h, d)); add(box, m, bone_, color, t); },
      // a box whose local origin is a point on a rotated frame: `frame` is a Matrix4 placed first (hand and elbow attachments)
      boxIn(bone_, frame, x, y, z, w, h, d, color, t, rx, ry, rz) { place(x, y, z, rx, ry, rz); m.multiply(new THREE.Matrix4().makeScale(w, h, d)); m.premultiply(frame); add(box, m, bone_, color, t); },
      prism(bone_, frame, x, y, z, rTop, rBot, h, sides, color, t, rx, ry, rz) { const g = new THREE.CylinderGeometry(rTop, rBot, h, sides); place(x, y, z, rx, ry, rz); m.premultiply(frame); add(g, m, bone_, color, t); g.dispose(); },
      frame: (x, y, z, rx, ry, rz) => place(x, y, z, rx, ry, rz).clone(),
      geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setAttribute('aBone', new THREE.Float32BufferAttribute(bone, 1)); g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
        g.userData.shared = true; return g;
      }
    };
  }

  const SKIN = '#e2b88e', PANTS = '#4b4036', BOOT = '#2e241c', STEEL = '#b9bec8', DARKSTEEL = '#7f8590', WOOD = '#7a5a38', WOODD = '#5e4129';
  const at = b => REST[B[b]];

  // the body every person shares: legs, torso with the faction colour, arms, head. `hat` adds headgear on the head bone.
  function person(K, o) {
    const T = true, F = false, hip = at('hips');
    K.box(B.hips, 0, hip[1], 0, 0.38, 0.2, 0.22, PANTS, F);
    K.box(B.spine, 0, 1.3, 0, 0.5, 0.6, 0.27, o.shirt || '#ffffff', T);
    K.box(B.head, 0, 1.78, 0, 0.21, 0.23, 0.21, SKIN, F);
    for (const [s, sh, el] of [['L', 'shoulderL', 'elbowL'], ['R', 'shoulderR', 'elbowR']]) {
      const x = at(sh)[0];
      K.box(B[sh], x, 1.39, 0, 0.14, 0.31, 0.14, o.sleeve === false ? SKIN : '#ffffff', o.sleeve !== false);
      K.box(B[el], x, 1.05, 0, 0.115, 0.38, 0.115, o.forearm || SKIN, F);
      const hx = s === 'L' ? -0.14 : 0.14;
      K.box(B['hip' + s], hx, 0.64, 0, 0.18, 0.46, 0.2, PANTS, F);
      K.box(B['knee' + s], hx, 0.2, 0, 0.155, 0.42, 0.17, PANTS, F);
      K.box(B['knee' + s], hx, 0.04, 0.045, 0.17, 0.1, 0.28, BOOT, F);
    }
    if (o.helmet) { K.box(B.head, 0, 1.9, 0, 0.25, 0.11, 0.25, STEEL, F); K.box(B.head, 0, 1.83, 0.1, 0.06, 0.14, 0.05, DARKSTEEL, F); }
    if (o.cap) K.box(B.head, 0, 1.9, -0.01, 0.24, 0.08, 0.24, o.cap, F);
    if (o.hair) K.box(B.head, 0, 1.87, -0.03, 0.23, 0.1, 0.22, o.hair, F);
  }
  const handFrame = (K, b, rx) => K.frame(at(b)[0], at(b)[1], at(b)[2], rx || 0, 0, 0);

  const ROLES = {
    // infantry: sword in the right hand, a round shield in the faction colour on the left forearm, an iron cap
    sword(K) {
      person(K, { helmet: true });
      const h = handFrame(K, 'handR');
      K.boxIn(B.handR, h, 0, 0, 0.5, 0.04, 0.1, 0.85, STEEL, false); K.boxIn(B.handR, h, 0, 0, 0.07, 0.04, 0.26, 0.05, '#caa84a', false); K.boxIn(B.handR, h, 0, 0, -0.02, 0.05, 0.05, 0.14, WOODD, false);
      const e = K.frame(at('elbowL')[0], at('elbowL')[1], at('elbowL')[2]);
      K.prism(B.elbowL, e, -0.13, -0.14, 0.02, 0.27, 0.27, 0.06, 10, '#ffffff', true, 0, 0, Math.PI / 2);
      K.prism(B.elbowL, e, -0.17, -0.14, 0.02, 0.07, 0.07, 0.05, 6, STEEL, false, 0, 0, Math.PI / 2);
    },
    // spearmen: a long spear held tilted forward (Nightfall's attach angle), a conical cap
    spear(K) {
      person(K, { cap: '#6a5a48' });
      const h = handFrame(K, 'handR', 1.05);
      K.boxIn(B.handR, h, 0, 0.45, 0, 0.045, 2.1, 0.045, WOOD, false); K.boxIn(B.handR, h, 0, 1.58, 0, 0.1, 0.28, 0.03, STEEL, false, 0, 0, 0); K.boxIn(B.handR, h, 0, 1.4, 0, 0.1, 0.07, 0.1, '#a8302a', false);
    },
    // archers: a bow in the left hand, a quiver on the back, a hood
    archer(K) {
      person(K, { cap: '#58452a', shirt: '#ffffff' });
      K.box(B.spine, 0.1, 1.32, -0.2, 0.12, 0.5, 0.12, WOODD, false, 0, 0, 0.25);
      K.box(B.spine, 0.14, 1.6, -0.2, 0.09, 0.06, 0.09, '#d9d2b8', false);
      const h = handFrame(K, 'handL');
      K.boxIn(B.handL, h, 0, 0.0, 0.09, 0.04, 0.5, 0.045, WOOD, false); K.boxIn(B.handL, h, 0, 0.38, 0.04, 0.04, 0.4, 0.04, WOOD, false, 0.35, 0, 0); K.boxIn(B.handL, h, 0, -0.38, 0.04, 0.04, 0.4, 0.04, WOOD, false, -0.35, 0, 0);
      K.boxIn(B.handL, h, 0, 0, -0.03, 0.012, 1.0, 0.012, '#efe8d0', false);
    },
    // a mounted spearman: the same top half as a spearman, in an iron helmet (the legs follow the horse)
    rider(K) {
      person(K, { helmet: true });
      const h = handFrame(K, 'handR', 1.05);
      K.boxIn(B.handR, h, 0, 0.45, 0, 0.045, 2.1, 0.045, WOOD, false); K.boxIn(B.handR, h, 0, 1.58, 0, 0.1, 0.28, 0.03, STEEL, false); K.boxIn(B.handR, h, 0, 1.4, 0, 0.1, 0.07, 0.1, '#a8302a', false);
    },
    // villagers: plain clothes in the faction colour or its neighbours, a hat or hair
    civ(K) { person(K, { cap: '#b79a52', shirt: '#ffffff' }); }
  };
  // the horse hangs boxes on its 12 joints exactly as Nightfall does, a few boxes fewer
  function horseModel(K, H) {
    const R = H.rest, RP = {}; H.bones.forEach((b, i) => { RP[b[0]] = R[i]; }); const bi = n => H.bones.findIndex(b => b[0] === n);
    const coat = '#7a4a2a', dark = '#2a2018', white = '#f4efe4';
    const seg = (bone, pa, pb, w, d, color, grow) => { const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy) + (grow || 0); K.box(bi(bone), (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2, w, L, d, color, false, 0, 0, Math.atan2(-dx, dy)); };
    K.box(bi('body'), -0.02, 1.2, 0, 1.7, 0.62, 0.46, coat, false);
    seg('neck', [RP.neck[0] - 0.05, RP.neck[1] - 0.05, 0], RP.head, 0.3, 0.22, coat, 0.16);
    const hx = RP.head[0], hy = RP.head[1], ca = Math.cos(-0.5), sa = Math.sin(-0.5), pt = (d, dy) => [hx + ca * d - sa * (dy || 0), hy + sa * d + ca * (dy || 0)];
    const sk = pt(0.14), mz = pt(0.4, -0.02), ns = pt(0.56, -0.025), hb = bi('head');
    K.box(hb, sk[0], sk[1], 0, 0.36, 0.31, 0.27, coat, false, 0, 0, -0.5); K.box(hb, mz[0], mz[1], 0, 0.34, 0.24, 0.2, coat, false, 0, 0, -0.5); K.box(hb, ns[0], ns[1], 0, 0.12, 0.2, 0.17, dark, false, 0, 0, -0.5);
    for (const z of [-1, 1]) { const e = pt(0.18, 0.05); K.box(hb, e[0], e[1], z * 0.14, 0.05, 0.05, 0.04, white, false, 0, 0, -0.5); K.box(hb, hx - 0.02, hy + 0.2, z * 0.09, 0.08, 0.22, 0.06, coat, false, 0, 0, z * -0.12); }
    K.box(bi('neck'), RP.neck[0] + 0.28, RP.neck[1] + 0.28, 0, 0.14, 0.5, 0.2, dark, false, 0, 0, -0.55);                   // mane
    K.box(bi('tail'), RP.tail[0] - 0.05, RP.tail[1] - 0.22, 0, 0.1, 0.55, 0.1, dark, false, 0, 0, 0.15);
    for (const sd of ['L', 'R']) {
      const fu = RP['f' + sd + 'U'], fl = RP['f' + sd + 'L'], hu = RP['h' + sd + 'U'], hl = RP['h' + sd + 'L'];
      seg('f' + sd + 'U', [fu[0] + 0.05, fu[1] + 0.2, fu[2]], fl, 0.27, 0.27, coat, 0.04); seg('f' + sd + 'L', fl, [fl[0], 0, fl[2]], 0.19, 0.19, dark, 0.02);
      seg('h' + sd + 'U', hu, hl, 0.31, 0.29, coat, 0.1); seg('h' + sd + 'L', hl, [hl[0], 0, hl[2]], 0.19, 0.19, dark, 0.02);
    }
    K.box(bi('body'), 0.05, 1.52, 0, 0.7, 0.08, 0.52, '#ffffff', true); K.box(bi('body'), 0.05, 1.58, 0, 0.55, 0.12, 0.36, '#4a301c', false);        // blanket in the faction colour, saddle
  }

  // ---- the material: MeshLambert, with the skinning and the tint mask patched in ----
  function material(THREE, tex, size) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.userData.shared = true;
    mat.onBeforeCompile = sh => {
      sh.uniforms.uSkin = { value: tex }; sh.uniforms.uSkinSize = { value: new THREE.Vector2(size[0], size[1]) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aBone; attribute float aTint; attribute vec4 aAnim;
uniform sampler2D uSkin; uniform vec2 uSkinSize;
vec4 skinTexel(float row, float col) { return texture2D(uSkin, vec2((col + 0.5) / uSkinSize.x, (row + 0.5) / uSkinSize.y)); }
mat4 skinBone(float row, float b) { float c = b * 4.0; return mat4(skinTexel(row, c), skinTexel(row, c + 1.0), skinTexel(row, c + 2.0), skinTexel(row, c + 3.0)); }
mat4 skinMatrix() {
  float cnt = aAnim.y, f0 = min(floor(aAnim.z), cnt - 1.0), fr = aAnim.z - floor(aAnim.z);
  float f1 = aAnim.w > 0.5 ? mod(f0 + 1.0, cnt) : min(f0 + 1.0, cnt - 1.0);
  return skinBone(aAnim.x + f0, aBone) * (1.0 - fr) + skinBone(aAnim.x + f1, aBone) * fr;
}`)
        .replace('#include <beginnormal_vertex>', 'mat4 skinM = skinMatrix(); vec3 objectNormal = mat3(skinM) * normal;')
        .replace('#include <begin_vertex>', 'vec3 transformed = (skinM * vec4(position, 1.0)).xyz;')
        .replace('#include <color_vertex>', `vColor = color;
#ifdef USE_INSTANCING_COLOR
  vColor *= mix(vec3(1.0), instanceColor, aTint);
#endif`);
    };
    mat.customProgramCacheKey = () => 'vmcrowd';
    return mat;
  }

  function create(THREE) {
    const CC = VM.CrowdClips, baked = bake(CC), rows = baked.rows, H = rows.length;
    const data = new Float32Array(WIDTH * 4 * H); rows.forEach((r, i) => data.set(r, i * WIDTH * 4));
    const tex = new THREE.DataTexture(data, WIDTH, H, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false; tex.needsUpdate = true;
    const mat = material(THREE, tex, [WIDTH, H]), geos = {};
    const geo = role => {
      if (geos[role]) return geos[role];
      const K = Builder(THREE); if (role === 'horse') horseModel(K, CC.horse); else ROLES[role](K);
      return (geos[role] = K.geometry());
    };
    const clips = baked.clips;
    return {
      clips, texture: tex, material: mat, rows: H,
      // an instanced mesh of `count` figures of a role; each starts in its idle pose
      mesh(role, count) {
        const g = geo(role).clone(); g.userData.shared = false;
        const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 4), 4); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aAnim', a);
        const m = new THREE.InstancedMesh(g, mat, Math.max(1, count)); m.count = count; m.frustumCulled = false;
        const col = new THREE.Color('#ffffff'); for (let i = 0; i < count; i++) m.setColorAt(i, col);
        m.userData.role = role; return m;
      },
      // put figure i of a mesh into clip `name` at `t` seconds. A loop wraps; a one-shot clip ends on its last frame.
      play(mesh, i, name, t) {
        const c = clips[name]; if (!c) return;
        const a = mesh.geometry.attributes.aAnim, f = c.loop ? ((t / c.d) % 1 + 1) % 1 * c.count : Math.min(c.count - 1, Math.max(0, t / c.d * (c.count - 1)));
        a.setXYZW(i, c.row, c.count, f, c.loop ? 1 : 0); a.needsUpdate = true;
      },
      has: name => !!clips[name],
      duration: name => clips[name] ? clips[name].d : 1,
      hit: name => clips[name] ? clips[name].hit * clips[name].d : 0,                                     // when in the clip the blow lands
      roles: Object.keys(ROLES).concat('horse')
    };
  }
  return { create, bake, BONES, REST, OFFSET, PARENT };
})();
