// Geometry kit. Everything static in a level is baked into a few vertex-coloured meshes,
// so a whole street costs a handful of draw calls and no texture downloads.

import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, ExtrudeGeometry, IcosahedronGeometry,
  Material, Matrix4, Mesh, Quaternion, Shape, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PAT = {
  none: 0, siding: 1, brick: 2, shingle: 3, stucco: 4, plank: 5, leafy: 6, paver: 7, glow: 8, stripe: 9, slats: 10, rough: 11,
} as const;
export type Pattern = keyof typeof PAT;

const cache = new Map<string, BufferGeometry>();

/**
 * A box with chamfered edges and interpolated normals: 44 triangles that catch light along
 * every edge like a rounded box ten times the size.
 */
export function chamferBox(w: number, h: number, d: number, c: number): BufferGeometry {
  const key = `cb${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${c.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const ch = Math.min(c, hx * 0.45, hy * 0.45, hz * 0.45);
  const pos: number[] = [];
  const nor: number[] = [];
  type V = { p: [number, number, number]; n: [number, number, number] };
  const vert = (axis: 0 | 1 | 2, sx: number, sy: number, sz: number): V => {
    if (axis === 0) return { p: [sx * hx, sy * (hy - ch), sz * (hz - ch)], n: [sx, 0, 0] };
    if (axis === 1) return { p: [sx * (hx - ch), sy * hy, sz * (hz - ch)], n: [0, sy, 0] };
    return { p: [sx * (hx - ch), sy * (hy - ch), sz * hz], n: [0, 0, sz] };
  };
  const tri = (a: V, b: V, cc: V) => {
    const ux = b.p[0] - a.p[0], uy = b.p[1] - a.p[1], uz = b.p[2] - a.p[2];
    const vx = cc.p[0] - a.p[0], vy = cc.p[1] - a.p[1], vz = cc.p[2] - a.p[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const nx = a.n[0] + b.n[0] + cc.n[0], ny = a.n[1] + b.n[1] + cc.n[1], nz = a.n[2] + b.n[2] + cc.n[2];
    const flip = gx * nx + gy * ny + gz * nz < 0;
    for (const v of flip ? [a, cc, b] : [a, b, cc]) {
      pos.push(...v.p);
      nor.push(...v.n);
    }
  };
  const quad = (a: V, b: V, cc: V, dd: V) => { tri(a, b, cc); tri(a, cc, dd); };
  const S = [-1, 1];
  for (const s of S) {
    quad(vert(0, s, -1, -1), vert(0, s, 1, -1), vert(0, s, 1, 1), vert(0, s, -1, 1));
    quad(vert(1, -1, s, -1), vert(1, 1, s, -1), vert(1, 1, s, 1), vert(1, -1, s, 1));
    quad(vert(2, -1, -1, s), vert(2, 1, -1, s), vert(2, 1, 1, s), vert(2, -1, 1, s));
  }
  for (const a of S) for (const b of S) {
    quad(vert(1, -1, a, b), vert(1, 1, a, b), vert(2, 1, a, b), vert(2, -1, a, b));
    quad(vert(0, a, -1, b), vert(0, a, 1, b), vert(2, a, 1, b), vert(2, a, -1, b));
    quad(vert(0, a, b, -1), vert(0, a, b, 1), vert(1, a, b, 1), vert(1, a, b, -1));
  }
  for (const sx of S) for (const sy of S) for (const sz of S) {
    tri(vert(0, sx, sy, sz), vert(1, sx, sy, sz), vert(2, sx, sy, sz));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  cache.set(key, g);
  return g;
}

function clean(g: BufferGeometry): BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(n.attributes)) {
    if (name !== 'position' && name !== 'normal') n.deleteAttribute(name);
  }
  return n;
}

export function cylinder(rt: number, rb: number, h: number, seg = 12): BufferGeometry {
  const key = `cy${rt},${rb},${h},${seg}`;
  let g = cache.get(key);
  if (!g) {
    g = clean(new CylinderGeometry(rt, rb, h, seg));
    cache.set(key, g);
  }
  return g;
}

export function blob(r: number, detail = 1): BufferGeometry {
  const key = `bl${r},${detail}`;
  let g = cache.get(key);
  if (!g) {
    g = clean(new IcosahedronGeometry(r, detail));
    cache.set(key, g);
  }
  return g;
}

/** Extrudes a side profile (x, y) along z, centred. */
export function prism(points: [number, number][], depth: number, bevel = 0.04, keyName?: string): BufferGeometry {
  const key = keyName ?? `pr${points.join('|')}${depth}${bevel}`;
  let g = cache.get(key);
  if (!g) {
    const s = new Shape();
    points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    const e = new ExtrudeGeometry(s, {
      depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, steps: 1,
    });
    e.translate(0, 0, -(depth - bevel * 2) / 2);
    g = clean(e);
    cache.set(key, g);
  }
  return g;
}

export function shapePrism(key: string, make: (s: Shape) => void, depth: number, bevel = 0.05, segs = 10): BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    const s = new Shape();
    make(s);
    const e = new ExtrudeGeometry(s, {
      depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: segs, steps: 1,
    });
    e.translate(0, 0, -(depth - bevel * 2) / 2);
    g = clean(e);
    cache.set(key, g);
  }
  return g;
}

// ---------------------------------------------------------------------------------------

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

export interface Place {
  yaw?: number; pitch?: number; roll?: number;
  sx?: number; sy?: number; sz?: number;
  pat?: Pattern;
  /** Random brightness variation. */
  vary?: number;
}

/** Collects geometry with baked transforms, colours and pattern ids, then merges it. */
export class Batch {
  private parts: BufferGeometry[] = [];

  add(g: BufferGeometry, m: Matrix4, color: Color, pat: number, sway = 0) {
    const copy = g.clone();
    copy.applyMatrix4(m);
    const n = copy.attributes.position.count;
    const col = new Float32Array(n * 3);
    const att = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
      att[i * 2] = pat; att[i * 2 + 1] = sway;
    }
    copy.setAttribute('color', new BufferAttribute(col, 3));
    copy.setAttribute('aInfo', new BufferAttribute(att, 2));
    this.parts.push(copy);
  }

  get empty() {
    return this.parts.length === 0;
  }

  build(material: Material, shadows = true): Mesh | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    const mesh = new Mesh(merged, material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** A deterministic hash so decoration is the same on every load. */
export function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Drawing API on top of a Batch trio, with a transform stack for building props locally. */
export class Kit {
  matte = new Batch();
  gloss = new Batch();
  leaf = new Batch();
  private stack: Matrix4[] = [new Matrix4()];
  private r = rand(1234);

  get top() {
    return this.stack[this.stack.length - 1];
  }

  at(x: number, y: number, z: number, yaw: number, fn: () => void, scale = 1) {
    const m = new Matrix4().compose(
      _p.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(scale, scale, scale),
    );
    this.stack.push(this.top.clone().multiply(m));
    fn();
    this.stack.pop();
  }

  private matrix(x: number, y: number, z: number, o: Place): Matrix4 {
    _e.set(o.pitch ?? 0, o.yaw ?? 0, o.roll ?? 0, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _m.compose(_p.set(x, y, z), _q, _s);
    return _m.premultiply(this.top);
  }

  private tone(color: string | Color, vary = 0): Color {
    _c.set(color);
    if (vary) _c.multiplyScalar(1 + (this.r() - 0.5) * vary);
    return _c;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string | Color, o: Place = {}, c = 0.035) {
    this.matte.add(chamferBox(w, h, d, c), this.matrix(x, y, z, o), this.tone(color, o.vary), PAT[o.pat ?? 'none']);
  }

  shiny(w: number, h: number, d: number, x: number, y: number, z: number, color: string | Color, o: Place = {}, c = 0.03) {
    this.gloss.add(chamferBox(w, h, d, c), this.matrix(x, y, z, o), this.tone(color, o.vary), PAT[o.pat ?? 'none']);
  }

  geo(g: BufferGeometry, x: number, y: number, z: number, color: string | Color, o: Place = {}, target: 'matte' | 'gloss' = 'matte') {
    this[target].add(g, this.matrix(x, y, z, o), this.tone(color, o.vary), PAT[o.pat ?? 'none']);
  }

  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: string | Color, o: Place = {}, seg = 12) {
    this.matte.add(cylinder(rt, rb, h, seg), this.matrix(x, y, z, o), this.tone(color, o.vary), PAT[o.pat ?? 'none']);
  }

  ball(r: number, x: number, y: number, z: number, color: string | Color, o: Place = {}, detail = 1) {
    this.matte.add(blob(r, detail), this.matrix(x, y, z, o), this.tone(color, o.vary), PAT[o.pat ?? 'none']);
  }

  /** Foliage: goes in the swaying batch. `sway` is 0 at the root and 1 at the tips. */
  foliage(g: BufferGeometry, x: number, y: number, z: number, color: string | Color, o: Place = {}, sway = 1) {
    this.leaf.add(g, this.matrix(x, y, z, o), this.tone(color, o.vary), PAT[o.pat ?? 'none'], sway);
  }
}
