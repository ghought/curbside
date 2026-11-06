// Turns visual records into the street. Static props bake into three merged meshes;
// anything that moves (dog, gates, ornaments) gets its own small group.

import {
  BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, SphereGeometry,
} from 'three';
import type { Visual } from '../levels/builder';
import { moverPose } from '../sim/physics';
import type { Mover } from '../sim/types';
import { Kit, blob, prism, rand, shapePrism } from './geo';
import { gloss, leaf, matte } from './materials';
import type { Theme } from './themes';
import type { WindowSpec } from '../levels/builder';
import { makeWater } from './water';

export function kitToGroup(k: Kit, shadows = true): Group {
  const g = new Group();
  const a = k.matte.build(matte, shadows);
  const b = k.gloss.build(gloss, shadows);
  const c = k.leaf.build(leaf, shadows);
  if (a) g.add(a);
  if (b) g.add(b);
  if (c) g.add(c);
  return g;
}

export function kitMesh(fn: (k: Kit) => void, shadows = true): Group {
  const k = new Kit();
  fn(k);
  return kitToGroup(k, shadows);
}

// ---------------------------------------------------------------------------------------
// Vehicles

function carBody(k: Kit, color: string, kind: string) {
  const body = shapePrism('car-body', (s) => {
    s.moveTo(-2.2, 0.36);
    s.lineTo(-2.26, 0.66);
    s.quadraticCurveTo(-2.26, 0.98, -1.86, 1.02);
    s.lineTo(-1.1, 1.08);
    s.lineTo(0.95, 1.08);
    s.quadraticCurveTo(1.7, 1.02, 2.06, 0.86);
    s.quadraticCurveTo(2.3, 0.76, 2.26, 0.52);
    s.lineTo(2.2, 0.36);
    s.closePath();
  }, 1.9, 0.09);
  const glass = shapePrism('car-glass', (s) => {
    s.moveTo(-1.42, 1.04);
    s.quadraticCurveTo(-1.1, 1.58, -0.72, 1.64);
    s.lineTo(0.42, 1.64);
    s.quadraticCurveTo(0.74, 1.56, 1.2, 1.04);
    s.closePath();
  }, 1.62, 0.07);
  const sy = kind === 'suv' ? 1.1 : 1;
  const sx = kind === 'hatch' ? 0.9 : 1;
  const yaw = Math.PI / 2;
  k.geo(body, 0, 0, 0, color, { yaw, sy, sx }, 'gloss');
  k.geo(glass, 0, 0, 0, '#2c3a44', { yaw, sy, sx }, 'gloss');
  k.shiny(1.44, 0.07, 1.34, 0, 1.66 * sy, 0.14 * sx, color, {}, 0.03);
  for (const side of [-1, 1]) {
    k.box(0.05, 0.56 * sy, 0.1, side * 0.82, 1.34 * sy, 0.12, color);
    k.shiny(0.14, 0.05, 0.05, side * 0.96, 0.88 * sy, 0.1, '#e8e8ea');
    k.shiny(0.05, 0.1, 0.2, side * 1, 1.14 * sy, 0.92 * sx, color);
    for (const wz of [-1.32, 1.38]) {
      k.cyl(0.38, 0.38, 0.3, side * 0.84, 0.38, wz * sx, '#1b1c20', { roll: Math.PI / 2 }, 16);
      k.cyl(0.21, 0.21, 0.32, side * 0.85, 0.38, wz * sx, '#c9ccd1', { roll: Math.PI / 2 }, 12);
    }
    k.shiny(0.42, 0.14, 0.06, side * 0.62, 0.74, 2.25 * sx, '#fff3cf');
    k.shiny(0.42, 0.14, 0.06, side * 0.62, 0.8, -2.25 * sx, '#c81e1e');
  }
  k.shiny(1.76, 0.12, 0.1, 0, 0.42, 2.22 * sx, '#2a2b30');
  k.shiny(1.76, 0.12, 0.1, 0, 0.42, -2.2 * sx, '#2a2b30');
}

function van(k: Kit) {
  const body = shapePrism('van-body', (s) => {
    s.moveTo(-2.9, 0.42);
    s.lineTo(-2.9, 2.5);
    s.quadraticCurveTo(-2.9, 2.62, -2.7, 2.62);
    s.lineTo(1.1, 2.62);
    s.quadraticCurveTo(1.7, 2.56, 2.2, 1.56);
    s.quadraticCurveTo(2.9, 1.42, 2.92, 0.9);
    s.lineTo(2.9, 0.42);
    s.closePath();
  }, 2.1, 0.08);
  k.geo(body, 0, 0, 0, '#f4efe4', {}, 'gloss');
  k.shiny(2.0, 0.34, 2.14, -0.75, 1.12, 0, '#e4572e', {}, 0.02);
  k.shiny(1.98, 0.08, 2.15, -0.75, 1.36, 0, '#f2c14e', {}, 0.01);
  for (const side of [-1, 1]) {
    k.shiny(0.9, 0.7, 0.05, 1.42, 1.96, side * 1.05, '#2c3a44', { roll: 0 });
    for (const wx of [-1.9, 1.9]) {
      k.cyl(0.42, 0.42, 0.26, wx, 0.42, side * 0.96, '#1b1c20', { pitch: Math.PI / 2 }, 16);
      k.cyl(0.22, 0.22, 0.28, wx, 0.42, side * 0.97, '#d4d6da', { pitch: Math.PI / 2 }, 12);
    }
  }
  k.shiny(0.05, 0.6, 1.8, 2.5, 1.84, 0, '#2c3a44', { roll: -0.5 });
}

// ---------------------------------------------------------------------------------------
// Buildings

function windowUnit(k: Kit, x: number, y: number, z: number, w: number, h: number, trim: string, shutter?: string) {
  k.box(w + 0.2, h + 0.2, 0.1, x, y, z, trim);
  k.shiny(w, h, 0.06, x, y, z + 0.04, '#5f8aa6', { pat: 'glow' }, 0.005);
  k.box(0.05, h, 0.05, x, y, z + 0.08, trim, {}, 0.01);
  k.box(w, 0.05, 0.05, x, y, z + 0.08, trim, {}, 0.01);
  k.box(w + 0.36, 0.09, 0.2, x, y - h / 2 - 0.12, z + 0.06, trim);
  if (shutter) {
    for (const s of [-1, 1]) k.box(0.34, h + 0.08, 0.05, x + s * (w / 2 + 0.3), y, z + 0.02, shutter, { pat: 'slats' });
  }
}

function drawHouse(k: Kit, v: Visual) {
  const { x, z } = v;
  const w = v.w as number, d = v.d as number, H = v.H as number, rise = v.rise as number, ov = v.ov as number;
  const front = v.front as number, doorX = v.doorX as number;
  const color = v.color as string, roof = v.roof as string, trim = v.trim as string, door = v.door as string;
  k.box(w + 0.16, 0.34, d + 0.16, x, 0.17, z, '#8f867a', { pat: 'rough' });
  k.box(w, H, d, x, H / 2, z, color, { pat: 'siding' }, 0.02);
  const gable = prism([[-d / 2, 0], [d / 2, 0], [0, rise]], w, 0, `gable${d}${w}${rise}`);
  k.geo(gable, x, H, z, color, { yaw: Math.PI / 2, pat: 'siding' });

  const theta = Math.atan2(rise, d / 2);
  const run = d / 2 + ov;
  const L = run / Math.cos(theta);
  const midY = H + rise - (run / 2) * Math.tan(theta) + 0.1;
  k.box(w + ov * 2, 0.2, L, x, midY, z + run / 2, roof, { pitch: theta, pat: 'shingle' }, 0.03);
  k.box(w + ov * 2, 0.2, L, x, midY, z - run / 2, roof, { pitch: -theta, pat: 'shingle' }, 0.03);
  k.box(w + ov * 2 + 0.05, 0.14, 0.34, x, H + rise + 0.14, z, new Color(roof).multiplyScalar(0.78));
  // Eaves and corner boards.
  k.box(w + ov * 2, 0.14, 0.12, x, H - 0.28, z + run, trim);
  for (const sx of [-1, 1]) k.box(0.16, H, 0.16, x + (sx * w) / 2, H / 2, front - 0.02, trim);

  for (const win of (v.wins as WindowSpec[])) {
    windowUnit(k, win.x, win.y, front + 0.04, win.w, win.h, trim, new Color(door).multiplyScalar(0.8).getStyle());
    if (win.y < 3) {
      k.box(win.w + 0.34, 0.22, 0.3, win.x, win.y - win.h / 2 - 0.3, front + 0.17, '#6d4a31', { pat: 'plank' });
      for (let i = 0; i < 5; i++) {
        k.foliage(blob(0.15, 0), win.x - win.w / 2 + (i + 0.5) * (win.w / 5), win.y - win.h / 2 - 0.16, front + 0.2, i % 2 ? '#e0584b' : '#f2c14e', { vary: 0.2 }, 0.2);
      }
    }
  }
  // Door.
  k.box(1.34, 2.5, 0.12, doorX, 1.27, front + 0.03, trim);
  k.box(1.05, 2.28, 0.1, doorX, 1.2, front + 0.07, door, { pat: 'plank' });
  k.box(0.74, 0.8, 0.03, doorX, 1.68, front + 0.12, new Color(door).multiplyScalar(0.8));
  k.box(0.74, 0.7, 0.03, doorX, 0.72, front + 0.12, new Color(door).multiplyScalar(0.8));
  k.geo(blob(0.06, 1), doorX + 0.38, 1.2, front + 0.16, '#e3c26a', {}, 'gloss');
  if (v.porch) {
    k.box(3.6, 0.4, 1.7, doorX, 0.2, front + 0.85, '#b89a78', { pat: 'plank' });
    k.box(2, 0.2, 0.5, doorX, 0.1, front + 1.95, '#a88a68', { pat: 'plank' });
    k.box(3.95, 0.14, 2.14, doorX, 2.95, front + 0.95, roof, { pitch: 0.2, pat: 'shingle' });
    k.box(3.7, 0.16, 0.12, doorX, 2.72, front + 1.66, trim);
    for (const px of [-1.65, 1.65]) {
      k.box(0.2, 2.4, 0.2, doorX + px, 1.6, front + 1.6, trim);
      for (let i = 0; i < 4; i++) k.box(0.04, 0.72, 0.04, doorX + px * (0.72 + i * 0.075), 0.76, front + 1.62, trim, {}, 0.01);
      k.box(0.46, 0.05, 0.08, doorX + px * 0.82, 1.1, front + 1.62, trim);
    }
  }
  const ch = v.chimney as [number, number] | null;
  if (ch) {
    const top = H + rise + 0.55;
    const bh = top - H;
    k.box(1.3, bh, 1.3, ch[0], H + bh / 2, ch[1], '#8c4a39', { pat: 'brick' }, 0.02);
    k.box(1.44, 0.14, 1.44, ch[0], top, ch[1], '#6f675e');
    k.box(0.8, 0.08, 0.8, ch[0], top + 0.05, ch[1], '#1c1b1e', {}, 0.01);
  }
}

/** Vents, skylights and AC units, so a flat roof looks like somewhere. */
function roofJunk(k: Kit, x: number, y: number, z: number, w: number, d: number, seed: number) {
  const r = rand(seed * 977 + 5);
  const spots = 3 + ((r() * 3) | 0);
  for (let i = 0; i < spots; i++) {
    const px = x + (r() - 0.5) * (w - 2), pz = z + (r() - 0.5) * (d - 2);
    const kind = r();
    if (kind < 0.4) {
      k.box(1.1, 0.6, 0.8, px, y + 0.3, pz, '#b9bcc0');
      k.cyl(0.26, 0.26, 0.05, px, y + 0.62, pz, '#44474c', {}, 12);
    } else if (kind < 0.7) {
      k.box(1.5, 0.22, 1.1, px, y + 0.11, pz, '#6b6660');
      k.shiny(1.3, 0.05, 0.9, px, y + 0.24, pz, '#86b3c8', {}, 0.01);
    } else {
      k.cyl(0.14, 0.14, 0.7, px, y + 0.35, pz, '#7c7f84', {}, 8);
      k.cyl(0.24, 0.2, 0.12, px, y + 0.74, pz, '#5e6166', {}, 8);
    }
  }
}

function drawRow(k: Kit, v: Visual) {
  const { x, z } = v;
  const w = v.w as number, d = v.d as number, H = v.H as number, front = v.front as number;
  const sh = v.sh as number, doorX = v.doorX as number;
  const color = v.color as string, trim = v.trim as string, door = v.door as string;
  const pat = v.pattern as 'brick' | 'stucco';
  k.box(w, H, d, x, H / 2, z, color, { pat }, 0.015);
  k.box(w + 0.05, Math.max(sh, 0.9), 0.1, x, Math.max(sh, 0.9) / 2, front + 0.02, new Color(trim).multiplyScalar(0.7), { pat: 'rough' });
  // Cornice with brackets.
  k.box(w + 0.1, 0.62, 0.22, x, H + 0.3, front - 0.1, color, { pat });
  k.box(w + 0.42, 0.14, 0.62, x, H + 0.68, front + 0.02, trim);
  k.box(w + 0.26, 0.12, 0.42, x, H + 0.52, front + 0.0, new Color(trim).multiplyScalar(0.9));
  const n = Math.round(w / 1.15);
  for (let i = 0; i <= n; i++) {
    k.box(0.14, 0.34, 0.3, x - w / 2 + 0.1 + (i * (w - 0.2)) / n, H + 0.3, front + 0.1, trim);
  }
  k.box(w - 0.1, 0.08, d - 0.1, x, H + 0.05, z, '#8d8580', { pat: 'rough' });
  roofJunk(k, x, H + 0.09, z, w, d, ((x * 7 + w) | 0) + 3);
  for (const win of (v.wins as WindowSpec[])) {
    const bright = trim;
    k.box(win.w + 0.52, 0.2, 0.16, win.x, win.y + win.h / 2 + 0.2, front + 0.08, bright);
    windowUnit(k, win.x, win.y, front + 0.04, win.w, win.h, bright);
  }
  if (!v.noDoor) {
    k.box(1.7, 2.9, 0.14, doorX, sh + 1.45, front + 0.05, trim);
    k.box(2.02, 0.2, 0.42, doorX, sh + 2.96, front + 0.14, trim);
    k.box(1.1, 2.38, 0.1, doorX, sh + 1.2, front + 0.1, door, { pat: 'plank' });
    k.geo(blob(0.06, 1), doorX + 0.42, sh + 1.2, front + 0.18, '#e3c26a', {}, 'gloss');
  }
  if (sh > 0) {
    const depth = 1.7, run = sh * 1.5;
    k.box(2.2, sh, depth, doorX, sh / 2, front + depth / 2, '#b0a698', { pat: 'rough' }, 0.02);
    const steps = Math.round(sh / 0.2);
    for (let i = 0; i < steps; i++) {
      const stepH = sh * (1 - (i + 1) / (steps + 1));
      const sz = front + depth + ((i + 0.5) * run) / steps;
      k.box(2.2, stepH, run / steps + 0.02, doorX, stepH / 2, sz, '#b9afa0', { pat: 'rough' }, 0.012);
    }
    for (const sx of [-1.1, 1.1]) {
      k.box(0.3, sh + 0.05, depth + run * 0.15, doorX + sx, (sh + 0.05) / 2, front + depth / 2 + run * 0.075, '#a39a8c', { pat: 'rough' });
      k.shiny(0.07, 0.07, depth, doorX + sx, sh + 0.84, front + depth / 2, '#23252a');
      for (let i = 0; i <= 5; i++) k.shiny(0.03, 0.84, 0.03, doorX + sx, sh + 0.42, front + (i * depth) / 5, '#23252a', {}, 0.008);
      const ang = Math.atan2(sh, run);
      const L = Math.hypot(sh, run);
      k.shiny(0.07, 0.07, L, doorX + sx, sh / 2 + 0.84, front + depth + run / 2, '#23252a', { pitch: ang });
      for (let i = 1; i <= 4; i++) {
        const t = i / 4;
        k.shiny(0.03, 0.84, 0.03, doorX + sx, sh * (1 - t) + 0.42, front + depth + run * t, '#23252a', {}, 0.008);
      }
    }
  }
}

function drawVilla(k: Kit, v: Visual) {
  const { x, z } = v;
  const w = v.w as number, d = v.d as number, h = v.h as number, front = v.front as number;
  const doorX = v.doorX as number, color = v.color as string, accent = v.accent as string;
  const u = v.upper as { x: number; w: number; d: number; h: number } | null;
  k.box(w, h, d, x, h / 2, z, color, { pat: 'stucco' }, 0.03);
  k.box(w + 0.8, 0.2, d + 1.4, x, h + 0.1, z + 0.5, '#fbf8f2', {}, 0.05);
  k.box(w + 0.86, 0.08, d + 1.46, x, h - 0.02, z + 0.5, accent, { pat: 'plank' }, 0.02);
  // Inset gravel roof with a run of solar panels.
  const sx = x + (u ? -u.x * 0.35 : 0);
  k.box(w - 0.6, 0.04, d + 0.2, x, h + 0.2, z + 0.5, '#cfc8ba', { pat: 'rough' }, 0.01);
  const n = Math.max(2, Math.floor(((u ? w - u.w : w) - 3) / 1.9));
  for (let i = 0; i < n; i++) {
    for (const row of [0, 1]) {
      const px = sx + (i - (n - 1) / 2) * 1.9, pz = z - d * 0.26 + row * 1.5;
      if (!u || Math.abs(px - (x + u.x)) > u.w / 2 + 1) {
        k.shiny(1.74, 0.07, 1.3, px, h + 0.32, pz, '#1f3350', { pitch: 0.16 }, 0.02);
        k.box(1.8, 0.04, 1.36, px, h + 0.28, pz, '#c9ccd1', { pitch: 0.16 }, 0.01);
      }
    }
  }
  for (const win of (v.wins as WindowSpec[])) {
    k.box(win.w + 0.14, win.h + 0.14, 0.08, win.x, win.y, front + 0.03, '#2e2f33');
    k.shiny(win.w, win.h, 0.05, win.x, win.y, front + 0.07, '#7fb3c8', { pat: 'glow' }, 0.005);
    const panes = Math.round(win.w / 1.3);
    for (let i = 1; i < panes; i++) k.box(0.05, win.h, 0.05, win.x - win.w / 2 + (i * win.w) / panes, win.y, front + 0.1, '#2e2f33', {}, 0.01);
  }
  k.box(2.1, 2.9, 0.12, doorX, 1.45, front + 0.03, accent, { pat: 'plank' });
  k.box(1.4, 2.5, 0.1, doorX, 1.28, front + 0.08, '#3b2c22', { pat: 'plank' });
  k.shiny(0.05, 0.9, 0.06, doorX + 0.52, 1.25, front + 0.17, '#d9c28a');
  if (u) {
    const uy = h + 0.2 + u.h / 2, uz = z - 0.2;
    k.box(u.w, u.h, u.d, x + u.x, uy, uz, color, { pat: 'stucco' }, 0.03);
    k.box(u.w + 0.5, 0.2, u.d + 0.5, x + u.x, h + 0.3 + u.h, uz, '#fbf8f2', {}, 0.05);
    k.box(u.w - 0.3, 0.04, u.d - 0.3, x + u.x, h + 0.42 + u.h, uz, '#cfc8ba', { pat: 'rough' }, 0.01);
    k.box(u.w * 0.55, u.h * 0.66, 0.08, x + u.x + u.w * 0.1, uy, uz + u.d / 2 + 0.02, '#2e2f33');
    k.shiny(u.w * 0.52, u.h * 0.62, 0.05, x + u.x + u.w * 0.1, uy, uz + u.d / 2 + 0.06, '#7fb3c8', { pat: 'glow' }, 0.005);
    k.box(u.w * 0.22, u.h, 0.06, x + u.x - u.w * 0.32, uy, uz + u.d / 2 + 0.03, accent, { pat: 'plank' });
  }
}

// ---------------------------------------------------------------------------------------
// Greenery

function drawTree(k: Kit, v: Visual, t: Theme, r: () => number) {
  const s = (v.s as number) ?? 1;
  const kind = v.kind as string;
  const { x, z } = v;
  if (kind === 'palm') {
    const segs = 7;
    let px = x, pz = z, py = 0;
    const lean = r() * 6.28, dx = Math.cos(lean), dz = Math.sin(lean);
    for (let i = 0; i < segs; i++) {
      const u = i / segs;
      const hSeg = (5.2 * s) / segs;
      const off = u * u * 0.5;
      k.cyl(0.17 - u * 0.05, 0.22 - u * 0.05, hSeg * 1.02, px + dx * off, py + hSeg / 2, pz + dz * off, '#8e7355', { pat: 'rough', pitch: dz * u * 0.14, roll: -dx * u * 0.14 }, 8);
      py += hSeg;
    }
    px += dx * 0.5; pz += dz * 0.5;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + r() * 0.3;
      const col = t.leaves[(r() * t.leaves.length) | 0];
      frond(k, px, py - 0.05, pz, a, (1.9 + r() * 0.5) * s, col, 0.2 + r() * 0.5);
    }
    k.ball(0.3, px, py - 0.05, pz, '#6f5a3f', { sy: 0.8 });
    return;
  }
  if (kind === 'cypress') {
    k.cyl(0.14, 0.18, 1, x, 0.5, z, '#6a4f3a', { pat: 'rough' }, 8);
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      k.foliage(blob(0.95 - u * 0.5, 1), x, (1 + u * 3.9) * s, z, '#2d6a41', { sy: 1.45, pat: 'leafy', vary: 0.14 }, 0.4 + u * 0.6);
    }
    return;
  }
  const trunkH = 2.8 * s;
  k.cyl(0.14 * s, 0.26 * s, trunkH, x, trunkH / 2, z, '#6b4d38', { pat: 'rough' }, 9);
  k.cyl(0.07 * s, 0.1 * s, 1.2 * s, x + 0.45 * s, 2.5 * s, z, '#6b4d38', { roll: -0.75, pat: 'rough' }, 7);
  k.cyl(0.07 * s, 0.1 * s, 1.2 * s, x - 0.42 * s, 2.7 * s, z + 0.2 * s, '#6b4d38', { roll: 0.7, pat: 'rough' }, 7);
  const pal = kind === 'maple' ? t.leaves.slice(0, 3) : t.leaves;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283, rad = (i === 0 ? 0 : 0.5 + r() * 0.95) * s;
    const y = (3.3 + r() * 1.7) * s;
    const size = (0.85 + r() * 0.6) * s;
    k.foliage(blob(size, 1), x + Math.cos(a) * rad, y, z + Math.sin(a) * rad, pal[(r() * pal.length) | 0], { pat: 'leafy', vary: 0.2, sy: 0.88 }, 0.5 + r() * 0.5);
  }
}

function frond(k: Kit, x: number, y: number, z: number, a: number, len: number, color: string, droop: number) {
  // An arching ribbon, wider in the middle.
  const n = 7;
  const pos: number[] = [];
  const nor: number[] = [];
  const ca = Math.cos(a), sa = Math.sin(a);
  const pt = (t: number, side: number): [number, number, number] => {
    const along = t * len;
    const lift = Math.sin(t * 1.5) * 0.45 - t * t * (0.9 + droop) * len * 0.5;
    const width = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.34 + 0.02;
    return [ca * along - sa * side * width, lift - Math.abs(side) * 0.1, sa * along + ca * side * width];
  };
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const corners = [pt(t0, -1), pt(t0, 0), pt(t0, 1), pt(t1, -1), pt(t1, 0), pt(t1, 1)];
    for (const [a0, b0, c0] of [[0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4]]) {
      // Both windings with an upward normal: lit from above whichever side you see.
      pos.push(...corners[a0], ...corners[b0], ...corners[c0], ...corners[a0], ...corners[c0], ...corners[b0]);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  k.foliage(g, x, y, z, color, { vary: 0.18 }, 0.9);
}

function drawHedge(k: Kit, v: Visual, t: Theme, r: () => number) {
  const len = v.len as number, h = v.h as number, th = v.t as number;
  const color = t.leaves[t.leaves.length - 1];
  const base = '#3f7a3c';
  k.at(v.x, 0, v.z, v.yaw ?? 0, () => {
    k.box(len, h - 0.1, th, 0, (h - 0.1) / 2, 0, base, { pat: 'leafy' }, 0.12);
    const n = Math.ceil(len / 0.8);
    for (let i = 0; i < n; i++) {
      const lx = -len / 2 + (i + 0.5) * (len / n);
      k.foliage(blob(0.42 + r() * 0.2, 1), lx, h - 0.12, (r() - 0.5) * th * 0.5, r() > 0.5 ? base : color === base ? '#4f8a45' : base, { pat: 'leafy', vary: 0.2, sy: 0.7 }, 0.12);
      for (const side of [-1, 1]) {
        k.foliage(blob(0.3 + r() * 0.2, 0), lx + (r() - 0.5) * 0.5, 0.3 + r() * (h - 0.6), side * th * 0.46, base, { pat: 'leafy', vary: 0.22 }, 0.06);
      }
    }
  });
}

function drawFlowers(k: Kit, v: Visual, r: () => number) {
  const x0 = Math.min(v.x0 as number, v.x1 as number), x1 = Math.max(v.x0 as number, v.x1 as number);
  const z0 = Math.min(v.z0 as number, v.z1 as number), z1 = Math.max(v.z0 as number, v.z1 as number);
  const n = Math.round((x1 - x0) * (z1 - z0) * 3.2);
  const colors = ['#f25f5c', '#ffd166', '#f7f3e3', '#c77dff', '#ff9f68'];
  for (let i = 0; i < n; i++) {
    const x = x0 + 0.1 + r() * (x1 - x0 - 0.2), z = z0 + 0.1 + r() * (z1 - z0 - 0.2);
    k.foliage(blob(0.2, 0), x, 0.22, z, '#4a8a3f', { vary: 0.25, sy: 1.25 }, 0.25);
    k.foliage(blob(0.1, 0), x + (r() - 0.5) * 0.14, 0.5 + r() * 0.12, z + (r() - 0.5) * 0.14, colors[(r() * colors.length) | 0], { vary: 0.1 }, 0.5);
  }
}

// ---------------------------------------------------------------------------------------
// Fences and furniture

function drawFence(k: Kit, v: Visual) {
  const len = v.len as number, h = v.h as number, style = v.style as string;
  k.at(v.x, 0, v.z, v.yaw ?? 0, () => {
    if (style === 'picket') {
      const n = Math.floor(len / 0.27);
      for (let i = 0; i <= n; i++) {
        const lx = -len / 2 + (i * len) / n;
        k.box(0.17, h, 0.05, lx, h / 2, 0.03, '#f6efe0', { vary: 0.05 }, 0.015);
        k.geo(prism([[-0.085, 0], [0.085, 0], [0, 0.12]], 0.05, 0, 'pick'), lx, h, 0.03, '#f6efe0');
      }
      k.box(len, 0.09, 0.05, 0, h * 0.72, -0.02, '#e9e0cf', {}, 0.012);
      k.box(len, 0.09, 0.05, 0, h * 0.26, -0.02, '#e9e0cf', {}, 0.012);
    } else if (style === 'iron') {
      const n = Math.floor(len / 0.2);
      k.shiny(len, 0.05, 0.05, 0, h, 0, '#23252a', {}, 0.01);
      k.shiny(len, 0.05, 0.05, 0, 0.14, 0, '#23252a', {}, 0.01);
      for (let i = 0; i <= n; i++) {
        k.shiny(0.03, h, 0.03, -len / 2 + (i * len) / n, h / 2, 0, '#23252a', {}, 0.008);
      }
    } else if (style === 'wall') {
      k.box(len, h, 0.34, 0, h / 2, 0, '#e5dac6', { pat: 'stucco' }, 0.03);
      k.box(len + 0.08, 0.12, 0.46, 0, h + 0.03, 0, '#c9b89b', {}, 0.03);
    }
  });
}

function makeGlassFence(v: Visual): Group {
  const g = new Group();
  const len = v.len as number, h = v.h as number;
  const glass = new MeshStandardMaterial({ color: '#bfe6ee', transparent: true, opacity: 0.2, roughness: 0.06, metalness: 0.5, depthWrite: false });
  const pane = new Mesh(new PlaneGeometry(len, h), glass);
  pane.position.y = h / 2;
  g.add(pane);
  g.add(kitMesh((k) => {
    k.shiny(len, 0.1, 0.1, 0, h, 0, '#d7dade');
    k.shiny(len, 0.14, 0.14, 0, 0.07, 0, '#d7dade');
    for (let i = -12; i <= 12; i += 3) k.shiny(0.08, h, 0.1, i, h / 2, 0, '#d7dade', {}, 0.01);
  }));
  g.position.set(v.x, 0, v.z);
  g.rotation.y = v.yaw ?? 0;
  return g;
}

function drawBin(k: Kit, v: Visual) {
  k.at(v.x, 0, v.z, 0.3, () => {
    k.cyl(0.37, 0.31, 1, 0, 0.5, 0, v.color as string, {}, 14);
    k.cyl(0.4, 0.4, 0.09, 0, 1.03, 0, new Color(v.color as string).multiplyScalar(0.72), {}, 14);
    k.box(0.3, 0.05, 0.08, 0, 1.1, 0, '#2a2b2f');
  });
}

function drawMailbox(k: Kit, v: Visual) {
  k.at(v.x, 0, v.z, 0, () => {
    k.box(0.14, 1.2, 0.14, 0, 0.6, 0, '#e9e0cf', { pat: 'plank' });
    const top = shapePrism('mailtop', (s) => {
      s.moveTo(-0.22, 0);
      s.lineTo(-0.22, 0.2);
      s.quadraticCurveTo(0, 0.42, 0.22, 0.2);
      s.lineTo(0.22, 0);
      s.closePath();
    }, 0.62, 0.02);
    k.geo(top, 0, 1.2, 0, v.color as string, {}, 'gloss');
    k.shiny(0.04, 0.26, 0.1, 0.25, 1.46, 0.1, '#e4572e', {}, 0.01);
  });
}

function drawStreet(k: Kit, t: Theme, originX: number, r: () => number) {
  // Curb runs the full street.
  k.box(170, 0.2, 0.34, 0, 0.1, -0.2, new Color(t.concrete).multiplyScalar(0.92), {}, 0.05);
  // Lamps, placed so they frame the lot on any aspect ratio.
  for (const lx of [-13.5, 13.5, -30, 30]) {
    k.at(lx, 0, -0.75, 0, () => {
      k.cyl(0.07, 0.11, 5, 0, 2.5, 0, '#2e3238', {}, 8);
      k.box(1.3, 0.08, 0.08, 0.6, 5, 0, '#2e3238');
      k.shiny(0.46, 0.1, 0.24, 1.2, 4.93, 0, '#fff0c8');
    });
  }
  k.at(originX - 3.6, 0, 1.9, 0, () => van(k));

  drawBackdrop(k, t, r);
}

/** What fills the top of a tall phone, different for each neighbourhood. */
function drawBackdrop(k: Kit, t: Theme, r: () => number) {
  const trees = (z0: number, spread: number, gap: number, size: number) => {
    for (let x = -60; x < 60; x += gap) {
      const px = x + r() * gap * 0.5, pz = z0 - r() * spread;
      const s = size * (0.8 + r() * 0.5);
      const c = t.leaves[(r() * t.leaves.length) | 0];
      k.cyl(0.2, 0.3, 3, px, 1.5, pz, '#5c4432', {}, 6);
      for (let j = 0; j < 3; j++) {
        k.foliage(blob((1.3 + r() * 0.8) * s, 1), px + (r() - 0.5) * 2, (3 + r() * 2) * s, pz + (r() - 0.5) * 2, c, { pat: 'leafy', vary: 0.16 }, 0.5);
      }
    }
  };
  if (t.backdrop === 'suburb') {
    for (let x = -36; x < 36; x += 2.6) {
      k.box(2.56, 1.5, 0.1, x, 0.75, -22.5, '#a07a54', { pat: 'plank' }, 0.02);
      k.box(0.14, 1.7, 0.14, x + 1.3, 0.85, -22.5, '#8a6846');
    }
    k.at(-7.5, 0, -24.5, 0, () => {
      k.box(3.2, 2.2, 2.4, 0, 1.1, 0, '#c9543c', { pat: 'plank' }, 0.03);
      k.box(3.6, 0.14, 1.6, 0, 2.5, 0.62, '#59372c', { pitch: 0.5, pat: 'shingle' });
      k.box(3.6, 0.14, 1.6, 0, 2.5, -0.62, '#59372c', { pitch: -0.5, pat: 'shingle' });
    });
    trees(-25, 8, 4.4, 1.5);
  } else if (t.backdrop === 'city') {
    const browns = ['#7d4a3b', '#91604a', '#6f4a44', '#a0705a', '#5e4648'];
    for (let x = -48; x < 50; x += 10) {
      const h = 10 + r() * 7, w = 9.6;
      const c = browns[(r() * browns.length) | 0];
      const z = -26 - r() * 2;
      k.box(w, h, 7, x, h / 2, z, c, { pat: 'brick' }, 0.02);
      k.box(w + 0.2, 0.2, 7.2, x, h + 0.1, z, '#7c7670');
      for (let wy = 2; wy < h - 1; wy += 3) {
        for (let wx = -3; wx <= 3; wx += 3) k.shiny(1.1, 1.6, 0.06, x + wx, wy, z + 3.53, '#5f8aa6', { pat: 'glow' }, 0.005);
      }
      if (r() > 0.5) {
        // A rooftop water tank.
        const tx = x + (r() - 0.5) * 4;
        k.cyl(1, 1, 2, tx, h + 2.2, z, '#8c6b4c', { pat: 'plank' }, 12);
        k.cyl(0.02, 1.15, 0.8, tx, h + 3.6, z, '#5a5550', {}, 12);
        for (const lx of [-0.7, 0.7]) k.box(0.1, 1.3, 0.1, tx + lx, h + 0.65, z, '#35383f');
      }
      roofJunk(k, x, h + 0.2, z, w, 7, (x + 60) | 0);
    }
  } else {
    for (let x = -40; x < 40; x += 1.5) {
      k.foliage(blob(1.25, 1), x + r() * 0.5, 1.3, -23.5 + r() * 0.5, '#2f7a45', { pat: 'leafy', vary: 0.14, sy: 1.25 }, 0.1);
    }
    const palm = (px: number, pz: number) => drawTree(k, { type: 'tree', x: px, z: pz, s: 1.3 + r() * 0.4, kind: 'palm' }, t, r);
    for (let x = -30; x < 30; x += 5.5) palm(x + r() * 3, -26 - r() * 6);
  }
}

function drawGrassTufts(k: Kit, visuals: Visual[], t: Theme, r: () => number) {
  const blocked: [number, number, number, number][] = [];
  for (const v of visuals) {
    if (v.type === 'paint') {
      const x0 = v.x0 as number, x1 = v.x1 as number, z0 = v.z0 as number, z1 = v.z1 as number;
      blocked.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
    } else if (v.type === 'house' || v.type === 'rowhouse' || v.type === 'villa') {
      const w = v.w as number, d = v.d as number;
      blocked.push([v.x - w / 2, v.z - d / 2, v.x + w / 2, v.z + d / 2 + 2.5]);
    } else if (v.type === 'pool') {
      const w = v.w as number, d = v.d as number;
      blocked.push([v.x - w / 2 - 1.2, v.z - d / 2 - 1.2, v.x + w / 2 + 1.2, v.z + d / 2 + 1.2]);
    }
  }
  const tuft = (() => {
    const pos: number[] = [];
    const nor: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7, c = Math.cos(a) * 0.09, s = Math.sin(a) * 0.09;
      const ox = Math.cos(a * 3) * 0.08, oz = Math.sin(a * 3) * 0.08;
      const tipX = ox + c * 0.4, tipZ = oz + s * 0.4;
      pos.push(ox - c, 0, oz - s, ox + c, 0, oz + s, tipX, 0.32, tipZ, ox + c, 0, oz + s, ox - c, 0, oz - s, tipX, 0.32, tipZ);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    return g;
  })();
  for (let i = 0; i < 1500; i++) {
    const x = (r() - 0.5) * 34, z = -3 - r() * 24;
    if (blocked.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)) continue;
    k.foliage(tuft, x, 0, z, r() > 0.5 ? t.grass[0] : t.grassDark, { yaw: r() * 6, vary: 0.25, sy: 0.7 + r() * 0.7 }, 0.3);
  }
}

// ---------------------------------------------------------------------------------------
// Ornaments, animals and other moving parts

function ornamentMesh(kind: string): Group {
  return kitMesh((k) => {
    if (kind === 'gnome') {
      k.cyl(0.2, 0.26, 0.42, 0, 0.26, 0, '#2f6fb0', {}, 10);
      k.cyl(0.08, 0.26, 0.1, 0, 0.5, 0, '#6b4a2f', {}, 10);
      k.ball(0.17, 0, 0.62, 0, '#f2c9a0');
      k.ball(0.2, 0, 0.5, 0.1, '#f7f3e9', { sy: 1.1, sz: 0.7 });
      k.cyl(0.01, 0.2, 0.52, 0, 0.98, -0.02, '#d7352b', { pitch: -0.12 }, 10);
      k.ball(0.05, 0, 0.66, 0.17, '#e79f86');
    } else if (kind === 'flamingo') {
      const pink = '#f47f9f';
      k.shiny(0.03, 0.9, 0.03, 0.06, 0.45, 0, '#2a2b2f');
      k.shiny(0.03, 0.9, 0.03, -0.06, 0.45, 0, '#2a2b2f');
      k.ball(0.26, 0, 0.98, 0, pink, { sz: 1.5, sy: 0.85 });
      k.cyl(0.05, 0.07, 0.5, 0, 1.3, 0.3, pink, { pitch: 0.3 }, 7);
      k.ball(0.11, 0, 1.56, 0.4, pink);
      k.cyl(0.015, 0.05, 0.16, 0, 1.51, 0.54, '#2a2b2f', { pitch: 2 }, 6);
    } else if (kind === 'cone') {
      k.box(0.5, 0.05, 0.5, 0, 0.03, 0, '#26272b');
      k.cyl(0.04, 0.22, 0.72, 0, 0.4, 0, '#ee6c2d', {}, 10);
      k.cyl(0.13, 0.15, 0.13, 0, 0.42, 0, '#f6f2ea', {}, 10);
    } else {
      k.cyl(0.3, 0.2, 0.46, 0, 0.23, 0, '#b86a44', {}, 12);
      k.cyl(0.33, 0.33, 0.08, 0, 0.46, 0, '#c47a54', {}, 12);
      for (let i = 0; i < 4; i++) k.foliage(blob(0.2, 0), Math.cos(i * 1.57) * 0.14, 0.6, Math.sin(i * 1.57) * 0.14, '#4a8a3f', { vary: 0.2 }, 0.3);
      k.foliage(blob(0.1, 0), 0, 0.82, 0, '#e0584b');
    }
  });
}

function makeDog(): Group & { tail: Group; legs: Group[]; head: Group } {
  const g = new Group() as Group & { tail: Group; legs: Group[]; head: Group };
  const brown = '#c98a3e', cream = '#f4e6cf';
  g.add(kitMesh((k) => {
    k.box(0.58, 0.46, 1.12, 0, 0.66, 0, brown, {}, 0.16);
    k.box(0.5, 0.2, 1, 0, 0.5, 0, cream, {}, 0.08);
  }));
  const head = new Group();
  head.position.set(0, 0.98, 0.56);
  head.add(kitMesh((k) => {
    k.box(0.48, 0.42, 0.46, 0, 0, 0, brown, {}, 0.14);
    k.box(0.3, 0.2, 0.28, 0, -0.08, 0.3, cream, {}, 0.07);
    k.ball(0.07, 0, -0.01, 0.45, '#1e1b1a');
    k.box(0.15, 0.3, 0.07, -0.22, 0.28, -0.04, '#a86d2d', { roll: 0.14 }, 0.03);
    k.box(0.15, 0.3, 0.07, 0.22, 0.28, -0.04, '#a86d2d', { roll: -0.14 }, 0.03);
    k.ball(0.05, -0.13, 0.08, 0.22, '#1e1b1a');
    k.ball(0.05, 0.13, 0.08, 0.22, '#1e1b1a');
    k.box(0.12, 0.03, 0.14, 0, -0.2, 0.34, '#e5697c', { pitch: 0.2 }, 0.012);
  }));
  g.add(head);
  const tail = new Group();
  tail.position.set(0, 0.86, -0.56);
  tail.add(kitMesh((k) => k.box(0.11, 0.4, 0.11, 0, 0.2, 0, brown, { pitch: -0.3 }, 0.05)));
  g.add(tail);
  const legs: Group[] = [];
  for (const [lx, lz] of [[-0.2, 0.4], [0.2, 0.4], [-0.2, -0.4], [0.2, -0.4]]) {
    const leg = new Group();
    leg.position.set(lx, 0.46, lz);
    leg.add(kitMesh((k) => {
      k.box(0.15, 0.42, 0.15, 0, -0.22, 0, cream, {}, 0.05);
    }));
    g.add(leg);
    legs.push(leg);
  }
  g.tail = tail; g.legs = legs; g.head = head;
  return g;
}

export type Courier = Group & { arm: Group; torso: Group; hand: Group; legs: Group[] };

export function makeCourier(): Courier {
  const g = new Group() as Courier;
  const uni = '#e4572e', dark = '#2d3142', skin = '#e9b48f';
  const torso = new Group();
  torso.position.y = 0.92;
  torso.add(kitMesh((k) => {
    k.box(0.62, 0.74, 0.4, 0, 0.3, 0, uni, {}, 0.1);
    k.box(0.66, 0.1, 0.44, 0, 0.0, 0, dark, {}, 0.03);
    k.box(0.16, 0.12, 0.03, 0.15, 0.46, 0.21, '#f2c14e');
    k.ball(0.27, 0, 0.92, 0, skin);
    k.box(0.56, 0.17, 0.56, 0, 1.08, 0, uni, {}, 0.07);
    k.box(0.42, 0.05, 0.3, 0, 1.03, 0.36, dark, {}, 0.02);
    k.ball(0.04, -0.1, 0.94, 0.25, '#1e1b1a');
    k.ball(0.04, 0.1, 0.94, 0.25, '#1e1b1a');
    k.box(0.14, 0.03, 0.02, 0, 0.8, 0.26, '#9a5a44', {}, 0.008);
    k.box(0.16, 0.58, 0.18, -0.4, 0.34, 0, uni, { roll: -0.14 }, 0.06);
    k.ball(0.09, -0.46, 0.04, 0, skin);
  }));
  g.add(torso);
  const arm = new Group();
  arm.position.set(0.38, 0.6, 0);
  arm.add(kitMesh((k) => {
    k.box(0.16, 0.58, 0.18, 0, -0.24, 0, uni, {}, 0.06);
    k.ball(0.09, 0, -0.58, 0, skin);
  }));
  const hand = new Group();
  hand.position.set(0, -0.68, 0);
  arm.add(hand);
  torso.add(arm);
  const legs: Group[] = [];
  for (const lx of [-0.17, 0.17]) {
    const leg = new Group();
    leg.position.set(lx, 0.94, 0);
    leg.add(kitMesh((k) => {
      k.box(0.23, 0.76, 0.26, 0, -0.42, 0, dark, {}, 0.07);
      k.box(0.25, 0.14, 0.42, 0, -0.84, 0.06, '#f6f2ea', {}, 0.05);
    }));
    g.add(leg);
    legs.push(leg);
  }
  g.arm = arm; g.torso = torso; g.hand = hand; g.legs = legs;
  g.scale.setScalar(1.3);
  return g;
}

export function makeParcel(kind: string): Group {
  return kitMesh((k) => {
    if (kind === 'pizza') {
      k.box(0.9, 0.1, 0.9, 0, 0, 0, '#f6efe0', {}, 0.02);
      k.box(0.74, 0.012, 0.74, 0, 0.052, 0, '#d7352b', {}, 0.004);
      k.ball(0.14, 0, 0.056, 0, '#f6efe0', { sy: 0.04 });
    } else if (kind === 'ball') {
      k.geo(blob(0.37, 2), 0, 0, 0, '#3f8fd1', {}, 'gloss');
      k.box(0.76, 0.1, 0.1, 0, 0, 0, '#f6efe0', {}, 0.02);
      k.box(0.1, 0.76, 0.1, 0, 0, 0, '#f6efe0', {}, 0.02);
    } else if (kind === 'vase') {
      k.box(0.46, 0.66, 0.46, 0, 0, 0, '#d9b98a', {}, 0.03);
      k.box(0.48, 0.14, 0.48, 0, 0.08, 0, '#d7352b', {}, 0.02);
      k.box(0.2, 0.2, 0.02, 0, -0.14, 0.24, '#f6efe0', {}, 0.005);
      k.geo(blob(0.1, 1), 0, -0.14, 0.25, '#d7352b', { sz: 0.1 });
      k.box(0.09, 0.66, 0.48, 0, 0, 0, '#c8a56c', {}, 0.01);
    } else if (kind === 'weights') {
      k.box(0.62, 0.42, 0.5, 0, 0, 0, '#5b5f68', {}, 0.04);
      k.box(0.64, 0.1, 0.52, 0, 0.04, 0, '#f2c14e', {}, 0.01);
    } else {
      k.box(0.62, 0.46, 0.52, 0, 0, 0, '#cfa56e', {}, 0.035);
      k.box(0.13, 0.475, 0.535, 0, 0, 0, '#b48a52', {}, 0.008);
      k.box(0.24, 0.02, 0.17, 0.17, 0.235, 0.1, '#f6efe0', {}, 0.004);
      k.box(0.17, 0.022, 0.03, 0.17, 0.238, 0.08, '#2d3142', {}, 0.002);
      k.box(0.1, 0.022, 0.02, 0.14, 0.238, 0.13, '#e4572e', {}, 0.002);
    }
  });
}

function drawMat(k: Kit, v: Visual) {
  const w = v.w as number, d = v.d as number;
  const style = v.style as string;
  const colors: Record<string, [string, string]> = {
    welcome: ['#8d6a3f', '#e4572e'], plain: ['#8d6a3f', '#d9b98a'], cloth: ['#f6f2ea', '#c7392f'], towel: ['#2f9fb5', '#f6f2ea'],
  };
  const [a, b] = colors[style] ?? colors.welcome;
  k.box(w, 0.05, d, 0, 0.025, 0, a, { pat: 'plank' }, 0.015);
  k.box(w - 0.22, 0.056, d - 0.22, 0, 0.026, 0, b, {}, 0.01);
  k.box(w - 0.4, 0.06, d - 0.4, 0, 0.027, 0, a, {}, 0.01);
}

// ---------------------------------------------------------------------------------------

export interface Knockable {
  obj: Group;
  home: [number, number, number, number];
  vel: [number, number, number];
  spin: [number, number, number];
  flying: boolean;
}

export interface Alarm {
  lights: Mesh[];
  until: number;
}

export interface LevelProps {
  root: Group;
  update(seconds: number, wall: number, dt: number): void;
  knock(key: string, dx: number, dz: number): void;
  resetKnocks(): void;
  /** Sets off the nearest car alarm. Returns true if one started. */
  alarmNear(x: number, z: number, wall: number): boolean;
  /** The dog takes the parcel and runs for it. */
  dogSteal(parcel: Group, wall: number): void;
  matGroup: Group | null;
}

export function buildProps(visuals: Visual[], t: Theme, seed: number, originX: number, mirror: boolean): LevelProps {
  const root = new Group();
  if (mirror) root.scale.x = -1;
  const k = new Kit();
  const r = rand(seed * 2654435761);
  const moving: { obj: Group; mover: Mover; base: [number, number, number]; pivot?: boolean }[] = [];
  const knocks = new Map<string, Knockable>();
  const alarms: { x: number; z: number; a: Alarm }[] = [];
  let dogObj: ReturnType<typeof makeDog> | null = null;
  let dogMover: Mover | null = null;
  let dogBase: [number, number, number] = [0, 0, 0];
  let dogSteal: { start: number; x: number; dir: number } | null = null;
  let lastDogX = 0;
  let matGroup: Group | null = null;
  const water: { update(t: number): void }[] = [];

  const placeMoving = (obj: Group, mover: Mover | undefined, x: number, y: number, z: number) => {
    obj.position.set(x, y, z);
    root.add(obj);
    if (mover) moving.push({ obj, mover, base: [x, y, z] });
  };

  for (const v of visuals) {
    const y = v.y ?? 0;
    switch (v.type) {
      case 'street': drawStreet(k, t, originX * (mirror ? -1 : 1), r); break;
      case 'house': drawHouse(k, v); break;
      case 'rowhouse': drawRow(k, v); break;
      case 'villa': drawVilla(k, v); break;
      case 'tree': drawTree(k, v, t, r); break;
      case 'hedge': drawHedge(k, v, t, r); break;
      case 'flowers': drawFlowers(k, v, r); break;
      case 'bin': drawBin(k, v); break;
      case 'mailbox': drawMailbox(k, v); break;
      case 'fence':
        if (v.style === 'glass') root.add(makeGlassFence(v));
        else drawFence(k, v);
        break;
      case 'car': {
        k.at(v.x, 0, v.z, v.yaw ?? 0, () => carBody(k, v.color as string, v.kind as string));
        const lights: Mesh[] = [];
        const lamp = new MeshBasicMaterial({ color: '#ffb23e' });
        const c = Math.cos(v.yaw ?? 0), s = Math.sin(v.yaw ?? 0);
        for (const [lx, lz] of [[-0.7, 2.2], [0.7, 2.2], [-0.7, -2.2], [0.7, -2.2]]) {
          const m = new Mesh(new SphereGeometry(0.2, 8, 6), lamp);
          m.position.set(v.x + lx * c + lz * s, 0.8, v.z - lx * s + lz * c);
          m.visible = false;
          root.add(m);
          lights.push(m);
        }
        alarms.push({ x: v.x, z: v.z, a: { lights, until: 0 } });
        break;
      }
      case 'mat': {
        const g = kitMesh((kk) => drawMat(kk, v), false);
        g.rotation.y = v.yaw ?? 0;
        placeMoving(g, v.mover, v.x, y + 0.012, v.z);
        matGroup = g;
        break;
      }
      case 'balcony': {
        const w = v.w as number, d = v.d as number, rail = v.rail as number;
        const wood = v.style === 'wood';
        const col = wood ? '#f1e6d2' : '#23252a';
        k.box(w, 0.16, d, v.x, y - 0.08, v.z, wood ? '#b89a78' : '#35383f', { pat: wood ? 'plank' : 'none' });
        for (const [cx, cz, lw, ld] of [[0, d / 2, w, 0.06], [-w / 2, 0, 0.06, d], [w / 2, 0, 0.06, d]] as const) {
          k.box(lw + 0.03, 0.06, ld + 0.03, v.x + cx, y + rail, v.z + cz, col);
          const n = Math.round(Math.max(lw, ld) / 0.17);
          for (let i = 0; i <= n; i++) {
            const u = i / n - 0.5;
            k.box(0.03, rail, 0.03, v.x + cx + u * lw, y + rail / 2, v.z + cz + u * ld, col, {}, 0.008);
          }
        }
        for (const sx of [-1, 1]) {
          k.box(0.08, 0.5, d * 0.8, v.x + sx * (w / 2 - 0.1), y - 0.38, v.z - d * 0.05, col, { pitch: 0 });
        }
        break;
      }
      case 'ladder': {
        const y0 = v.y0 as number, y1 = v.y1 as number;
        for (const sx of [-0.28, 0.28]) k.box(0.05, y1 - y0, 0.05, v.x + sx, (y0 + y1) / 2, v.z, '#23252a');
        for (let ly = y0 + 0.25; ly < y1; ly += 0.3) k.box(0.56, 0.035, 0.035, v.x, ly, v.z, '#23252a', {}, 0.01);
        break;
      }
      case 'awning': {
        const w = v.w as number, d = v.d as number, tilt = v.tilt as number;
        k.box(w, 0.1, d / Math.cos(tilt), v.x, y, v.z, v.color as string, { pitch: tilt, pat: 'stripe' }, 0.03);
        const edgeZ = v.z + d / 2, edgeY = y - Math.tan(tilt) * (d / 2);
        k.box(w, 0.26, 0.04, v.x, edgeY - 0.13, edgeZ, v.color as string, { pat: 'stripe' }, 0.01);
        break;
      }
      case 'cafeTable': {
        if (v.small) {
          k.cyl(0.62, 0.62, 0.06, v.x, 0.94, v.z, '#f2ece1', {}, 16);
          k.cyl(0.06, 0.08, 0.9, v.x, 0.46, v.z, '#26282e', {}, 8);
          k.cyl(0.32, 0.36, 0.05, v.x, 0.03, v.z, '#26282e', {}, 12);
        } else {
          k.box(1.9, 0.08, 1.5, v.x, 0.94, v.z, '#7a5136', { pat: 'plank' });
          k.box(0.14, 0.9, 0.14, v.x, 0.46, v.z, '#26282e');
          k.box(1, 0.05, 0.8, v.x, 0.03, v.z, '#26282e');
        }
        for (const [cx, cz] of [[-1.25, 0.1], [1.25, -0.1]]) {
          k.box(0.5, 0.06, 0.5, v.x + cx, 0.56, v.z + cz, '#c7392f', {}, 0.02);
          k.box(0.05, 0.56, 0.05, v.x + cx, 0.28, v.z + cz, '#26282e', {}, 0.01);
          k.box(0.5, 0.5, 0.05, v.x + cx + (cx > 0 ? 0.24 : -0.24), 0.84, v.z + cz, '#c7392f', { yaw: Math.PI / 2 }, 0.02);
        }
        break;
      }
      case 'pool': {
        const w = v.w as number, d = v.d as number;
        for (const [cx, cz, lw, ld] of [[0, -d / 2 - 0.15, w + 0.6, 0.3], [0, d / 2 + 0.15, w + 0.6, 0.3], [-w / 2 - 0.15, 0, 0.3, d], [w / 2 + 0.15, 0, 0.3, d]] as const) {
          k.box(lw, 0.1, ld, v.x + cx, 0.05, v.z + cz, '#f6f2ea', {}, 0.03);
        }
        const wm = makeWater(w, d);
        wm.mesh.position.set(v.x, 0.03, v.z);
        root.add(wm.mesh);
        water.push(wm);
        k.at(v.x - w * 0.28, 0.1, v.z - d * 0.2, 0.5, () => {
          k.geo(blob(0.5, 1), 0, 0.08, 0, '#ffcf3f', { sy: 0.55, sx: 1.2 }, 'gloss');
          k.geo(blob(0.26, 1), 0.46, 0.44, 0, '#ffcf3f', {}, 'gloss');
          k.box(0.22, 0.05, 0.1, 0.72, 0.42, 0, '#ee6c2d', {}, 0.02);
        });
        break;
      }
      case 'pergola': {
        const w = v.w as number, d = v.d as number, h = v.h as number;
        const wood = '#a97c50';
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.2, h, 0.2, v.x + (sx * w) / 2, h / 2, v.z + (sz * d) / 2, wood, { pat: 'plank' });
        for (const sz of [-1, 1]) k.box(w + 0.5, 0.2, 0.14, v.x, h, v.z + (sz * d) / 2, wood);
        for (const sx of [-1, 1]) k.box(0.14, 0.2, d + 0.5, v.x + (sx * w) / 2, h, v.z, wood);
        for (let lx = -w / 2 + 0.24; lx < w / 2; lx += 0.48) k.box(0.1, 0.12, d + 0.3, v.x + lx, h + 0.12, v.z, wood, { vary: 0.1 });
        for (let i = 0; i < 12; i++) {
          k.foliage(blob(0.3 + r() * 0.26, 0), v.x + (r() - 0.5) * w, h + 0.26, v.z + (r() - 0.5) * d, i % 4 ? '#4f8a45' : '#c77dff', { vary: 0.2, sy: 0.6 }, 0.2);
        }
        break;
      }
      case 'trampoline': {
        const rad = v.r as number;
        k.cyl(rad + 0.08, rad + 0.08, 0.1, v.x, 0.66, v.z, '#2e6db4', {}, 28);
        k.cyl(rad - 0.08, rad - 0.08, 0.04, v.x, 0.715, v.z, '#34363e', {}, 24);
        k.cyl(rad * 0.46, rad * 0.46, 0.042, v.x, 0.718, v.z, '#f2c14e', {}, 20);
        k.cyl(rad * 0.3, rad * 0.3, 0.044, v.x, 0.72, v.z, '#34363e', {}, 20);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * 6.283;
          k.box(0.09, 0.64, 0.09, v.x + Math.cos(a) * rad, 0.32, v.z + Math.sin(a) * rad, '#b4b8bf');
        }
        break;
      }
      case 'lounger':
        k.at(v.x, 0, v.z, 0, () => {
          k.box(0.8, 0.14, 2, 0, 0.34, 0, '#f2ece1', {}, 0.05);
          k.box(0.8, 0.14, 0.8, 0, 0.56, -0.86, '#f2ece1', { pitch: -0.65 }, 0.05);
          k.box(0.86, 0.1, 2.06, 0, 0.24, 0, '#8b5e3c', { pat: 'plank' });
          for (const [lx, lz] of [[-0.34, 0.8], [0.34, 0.8], [-0.34, -0.8], [0.34, -0.8]]) k.box(0.07, 0.24, 0.07, lx, 0.12, lz, '#8b5e3c');
        });
        break;
      case 'terraceRail': {
        const w = v.w as number;
        k.shiny(w, 0.05, 0.05, v.x, y + 0.5, v.z, '#d7dade');
        const n = Math.round(w / 0.5);
        for (let i = 0; i <= n; i++) k.shiny(0.04, 0.5, 0.04, v.x - w / 2 + (i * w) / n, y + 0.25, v.z, '#d7dade', {}, 0.01);
        break;
      }
      case 'ornament': {
        const obj = ornamentMesh(v.kind as string);
        obj.position.set(v.x, 0, v.z);
        obj.rotation.y = v.yaw ?? 0;
        root.add(obj);
        knocks.set(v.key as string, { obj, home: [v.x, 0, v.z, v.yaw ?? 0], vel: [0, 0, 0], spin: [0, 0, 0], flying: false });
        break;
      }
      case 'dog': {
        dogObj = makeDog();
        dogMover = v.mover as Mover;
        dogBase = [v.x, 0, v.z];
        dogObj.position.set(v.x, 0, v.z);
        root.add(dogObj);
        break;
      }
      case 'slideGate': {
        const w = v.w as number, h = v.h as number;
        const g = kitMesh((kk) => {
          kk.shiny(w, 0.12, 0.1, 0, h - 0.06, 0, '#23252a');
          kk.shiny(w, 0.12, 0.1, 0, 0.1, 0, '#23252a');
          kk.shiny(w, 0.08, 0.08, 0, h * 0.6, 0, '#23252a');
          const n = Math.round(w / 0.2);
          for (let i = 0; i <= n; i++) kk.shiny(0.05, h, 0.05, -w / 2 + (i * w) / n, h / 2, 0, '#23252a', {}, 0.012);
          for (const x of [-w / 2, w / 2]) kk.shiny(0.12, h, 0.12, x, h / 2, 0, '#c9a24a');
        });
        placeMoving(g, v.mover, v.x, 0, v.z);
        break;
      }
      case 'cradle': {
        const g = kitMesh((kk) => {
          kk.box(3, 0.16, 1.3, 0, -0.08, 0, '#b4b8bf');
          for (const [cx, cz, lw, ld] of [[0, 0.65, 3, 0.05], [-1.5, 0, 0.05, 1.3], [1.5, 0, 0.05, 1.3]] as const) {
            kk.box(lw + 0.03, 0.05, ld + 0.03, cx, 0.5, cz, '#e4572e');
          }
          for (const cx of [-1.4, -0.7, 0, 0.7, 1.4]) kk.box(0.04, 0.5, 0.04, cx, 0.25, 0.65, '#e4572e', {}, 0.01);
          for (const cx of [-1.3, 1.3]) kk.box(0.03, 16, 0.03, cx, 8, 0.1, '#30333a', {}, 0.008);
          // Dale.
          kk.box(0.46, 0.8, 0.32, -1, 0.46, 0, '#4f8dc2', {}, 0.08);
          kk.ball(0.2, -1, 1.05, 0, '#e9b48f');
          kk.box(0.42, 0.1, 0.42, -1, 1.2, 0, '#f2c14e', {}, 0.04);
          kk.box(0.12, 0.6, 0.12, -1.3, 0.72, 0.1, '#4f8dc2', { roll: 0.5 }, 0.04);
        });
        placeMoving(g, v.mover, v.x, y, v.z);
        break;
      }
      case 'golfCart': {
        const g = kitMesh((kk) => {
          kk.box(3, 0.5, 1.4, 0, 0.5, 0, '#f6f2ea', {}, 0.1);
          kk.box(1.2, 0.5, 1.2, 0.5, 1, 0, '#2f6f73', {}, 0.08);
          kk.box(1.7, 0.1, 1.4, 0.6, 1.9, 0, '#f6f2ea', {}, 0.04);
          for (const [px, pz] of [[1.3, 0.6], [1.3, -0.6], [-0.2, 0.6], [-0.2, -0.6]]) kk.box(0.05, 1.1, 0.05, px, 1.4, pz, '#2a2b2f', {}, 0.01);
          for (const [wx, wz] of [[1, 0.72], [1, -0.72], [-1, 0.72], [-1, -0.72]]) {
            kk.cyl(0.26, 0.26, 0.18, wx, 0.26, wz, '#1b1c20', { pitch: Math.PI / 2 }, 12);
          }
          for (const [cx, cz, lw, ld] of [[-1.5, 0, 0.06, 1.4], [-0.45, 0.7, 1.1, 0.06], [-0.45, -0.7, 1.1, 0.06]] as const) {
            kk.box(lw, 0.6, ld, cx, 1.05, cz, '#8b5e3c', { pat: 'plank' }, 0.015);
          }
          // Gary.
          kk.box(0.46, 0.7, 0.4, 0.9, 1.25, 0, '#f47f9f', {}, 0.08);
          kk.ball(0.2, 0.9, 1.75, 0, '#e9b48f');
          kk.box(0.4, 0.09, 0.4, 0.92, 1.9, 0, '#f6f2ea', {}, 0.04);
        });
        placeMoving(g, v.mover, v.x, 0, v.z);
        break;
      }
      default:
        break;
    }
  }

  drawGrassTufts(k, visuals, t, r);
  root.add(kitToGroup(k));

  const update = (seconds: number, wall: number, dt: number) => {
    for (const m of moving) {
      const p = moverPose(m.mover, seconds);
      m.obj.position.set(m.base[0] + p.dx, m.base[1] + p.dy, m.base[2] + p.dz);
    }
    for (const w of water) w.update(wall);

    for (const n of knocks.values()) {
      if (!n.flying) continue;
      n.vel[1] -= 13 * dt;
      n.obj.position.x += n.vel[0] * dt;
      n.obj.position.y += n.vel[1] * dt;
      n.obj.position.z += n.vel[2] * dt;
      n.obj.rotation.x += n.spin[0] * dt;
      n.obj.rotation.z += n.spin[2] * dt;
      if (n.obj.position.y < 0.08) {
        n.obj.position.y = 0.08;
        n.vel[1] = Math.abs(n.vel[1]) * 0.32;
        n.vel[0] *= 0.6; n.vel[2] *= 0.6;
        n.spin[0] *= 0.5; n.spin[2] *= 0.5;
        if (n.vel[1] < 0.6) {
          n.flying = false;
          n.obj.rotation.x = Math.PI / 2;
          n.obj.position.y = 0.2;
        }
      }
    }

    for (const { a } of alarms) {
      const on = wall < a.until && Math.floor(wall * 4) % 2 === 0;
      for (const l of a.lights) l.visible = on;
    }

    if (dogObj && dogMover) {
      if (dogSteal) {
        // Ends the throw by legging it off the lot with the goods.
        const u = wall - dogSteal.start;
        dogObj.position.x = dogSteal.x + Math.max(0, u - 0.3) * 7.5 * dogSteal.dir;
        dogObj.rotation.y = (dogSteal.dir * Math.PI) / 2;
        const leg = Math.sin(wall * 26);
        dogObj.legs[0].rotation.x = dogObj.legs[3].rotation.x = leg * 0.9;
        dogObj.legs[1].rotation.x = dogObj.legs[2].rotation.x = -leg * 0.9;
        dogObj.tail.rotation.z = Math.sin(wall * 32) * 0.8;
        dogObj.position.y = Math.abs(Math.sin(wall * 13)) * 0.12;
      } else {
        const p = moverPose(dogMover, seconds);
        const nx = dogBase[0] + p.dx, nz = dogBase[2] + p.dz;
        const speed = dt > 0 ? (nx - lastDogX) / dt : 0;
        lastDogX = nx;
        dogObj.position.set(nx, 0, nz);
        const moving2 = Math.abs(speed) > 0.2;
        if (moving2) dogObj.rotation.y = speed > 0 ? Math.PI / 2 : -Math.PI / 2;
        else dogObj.rotation.y *= 0.9;
        const leg = moving2 ? Math.sin(wall * 15) : 0;
        dogObj.legs[0].rotation.x = dogObj.legs[3].rotation.x = leg * 0.7;
        dogObj.legs[1].rotation.x = dogObj.legs[2].rotation.x = -leg * 0.7;
        dogObj.position.y = moving2 ? Math.abs(Math.sin(wall * 15)) * 0.06 : 0;
        dogObj.tail.rotation.z = Math.sin(wall * 18) * 0.6;
        dogObj.head.rotation.y = moving2 ? 0 : Math.sin(wall * 1.3) * 0.5;
      }
    }
  };

  return {
    root,
    update,
    matGroup,
    knock(key, dx, dz) {
      const n = knocks.get(key);
      if (!n || n.flying) return;
      const len = Math.hypot(dx, dz) || 1;
      const sx = mirror ? -1 : 1;
      n.flying = true;
      n.vel = [(sx * dx / len) * 5.5, 6.5, (dz / len) * 5.5];
      n.spin = [8 + r() * 8, 0, 6 + r() * 8];
    },
    resetKnocks() {
      if (dogObj) {
        dogSteal = null;
        dogObj.head.rotation.set(0, 0, 0);
      }
      for (const n of knocks.values()) {
        n.flying = false;
        n.obj.position.set(n.home[0], n.home[1], n.home[2]);
        n.obj.rotation.set(0, n.home[3], 0);
      }
    },
    alarmNear(x, z, wall) {
      const px = mirror ? -x : x;
      let best: Alarm | null = null;
      let bd = 16;
      for (const a of alarms) {
        const d = (a.x - px) ** 2 + (a.z - z) ** 2;
        if (d < bd) { bd = d; best = a.a; }
      }
      if (!best || best.until > wall) return false;
      best.until = wall + 2.6;
      return true;
    },
    dogSteal(parcel, wall) {
      if (!dogObj) return;
      dogSteal = { start: wall, x: dogObj.position.x, dir: dogObj.position.x > 0 ? 1 : -1 };
      dogObj.head.add(parcel);
      parcel.position.set(0, -0.05, 0.55);
      parcel.rotation.set(0, 0, 0);
    },
  };
}

export function makeTruck(): Group {
  const g = kitMesh((k) => {
    k.box(6.4, 2.6, 2.4, -0.6, 2, 0, '#e9e4d8', { pat: 'plank' }, 0.06);
    k.shiny(2, 2, 2.3, 3.2, 1.6, 0, '#2f6fb0');
    k.shiny(0.06, 0.9, 1.9, 4.22, 2, 0, '#2c3a44');
    k.box(8, 0.3, 2.3, 0, 0.62, 0, '#2a2b2f');
    for (const x of [-2.6, -1.2, 3]) {
      for (const s of [-1, 1]) k.cyl(0.52, 0.52, 0.34, x, 0.52, s * 1.08, '#1b1c20', { pitch: Math.PI / 2 }, 14);
    }
  });
  return g;
}
