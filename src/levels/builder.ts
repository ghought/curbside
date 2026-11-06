// Prefabs emit two things at once: colliders for the sim and a visual record for the
// renderer. Keeping them in one call is what stops what you see drifting from what you hit.

import { computeBounds, initCollider } from '../sim/physics';
import type { Collider, MatName, Mover, Surface, Target, World, Zone, ZoneEffect } from '../sim/types';

export interface Visual {
  type: string;
  x: number;
  z: number;
  y?: number;
  yaw?: number;
  key?: string;
  mover?: Mover;
  [k: string]: unknown;
}

export interface BoxArgs {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  yaw?: number; pitch?: number; roll?: number;
  mat: MatName; tag: string;
  mover?: Mover;
}

export const ORIGIN_Y = 1.35;

export class Builder {
  colliders: Collider[] = [];
  zones: Zone[] = [];
  surfaces: Surface[] = [];
  visuals: Visual[] = [];
  focus: [number, number, number][] = [];
  origin: [number, number, number] = [0, ORIGIN_Y, -1.5];
  lotX: [number, number] = [-10, 10];
  target: Target = { x: 0, y: 0, z: -8, w: 1.6, d: 1.1, yaw: 0, bx: 0, by: 0, bz: -8 };
  private nextId = 1;

  private blank(): Collider {
    return {
      id: this.nextId++, kind: 'box', tag: '', mat: 'wall',
      x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 0, yaw: 0, pitch: 0, roll: 0,
      ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], r: 0, y0: 0, y1: 0,
      bx: 0, by: 0, bz: 0, byaw: 0, vx: 0, vy: 0, vz: 0,
      min: [0, 0, 0], max: [0, 0, 0],
    };
  }

  box(o: BoxArgs) {
    const c = this.blank();
    c.tag = o.tag; c.mat = o.mat;
    c.x = c.bx = o.x; c.y = c.by = o.y; c.z = c.bz = o.z;
    c.hx = o.w / 2; c.hy = o.h / 2; c.hz = o.d / 2;
    c.yaw = c.byaw = o.yaw ?? 0; c.pitch = o.pitch ?? 0; c.roll = o.roll ?? 0;
    c.mover = o.mover;
    initCollider(c);
    this.colliders.push(c);
    return c;
  }

  cyl(o: { x: number; z: number; y0: number; y1: number; r: number; mat: MatName; tag: string }) {
    const c = this.blank();
    c.kind = 'cyl'; c.tag = o.tag; c.mat = o.mat;
    c.x = c.bx = o.x; c.z = c.bz = o.z; c.y0 = o.y0; c.y1 = o.y1; c.r = o.r;
    computeBounds(c);
    this.colliders.push(c);
    return c;
  }

  sph(o: { x: number; y: number; z: number; r: number; mat: MatName; tag: string }) {
    const c = this.blank();
    c.kind = 'sph'; c.tag = o.tag; c.mat = o.mat;
    c.x = c.bx = o.x; c.y = c.by = o.y; c.z = c.bz = o.z; c.r = o.r;
    computeBounds(c);
    this.colliders.push(c);
    return c;
  }

  zoneBox(o: { x: number; y: number; z: number; w: number; h: number; d: number; yaw?: number; tag: string; effect: ZoneEffect; mover?: Mover; key?: string }) {
    const z: Zone = {
      id: this.nextId++, tag: o.tag, effect: o.effect, shape: 'box',
      x: o.x, y: o.y, z: o.z, hx: o.w / 2, hy: o.h / 2, hz: o.d / 2, yaw: o.yaw ?? 0, r: 0,
      mover: o.mover, bx: o.x, by: o.y, bz: o.z, key: o.key,
    };
    this.zones.push(z);
    return z;
  }

  zoneCyl(o: { x: number; z: number; y0: number; y1: number; r: number; tag: string; effect: ZoneEffect; mover?: Mover; key?: string }) {
    const y = (o.y0 + o.y1) / 2;
    const z: Zone = {
      id: this.nextId++, tag: o.tag, effect: o.effect, shape: 'cyl',
      x: o.x, y, z: o.z, hx: 0, hy: (o.y1 - o.y0) / 2, hz: 0, yaw: 0, r: o.r,
      mover: o.mover, bx: o.x, by: y, bz: o.z, key: o.key,
    };
    this.zones.push(z);
    return z;
  }

  surface(x0: number, z0: number, x1: number, z1: number, kind: MatName, tag: string) {
    this.surfaces.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), kind, tag });
  }

  vis(type: string, v: Partial<Visual> & { x: number; z: number }) {
    this.visuals.push({ type, ...v });
  }

  world(wind: [number, number], mirror: boolean): World {
    if (mirror) this.applyMirror();
    const movers: World['movers'] = [
      ...this.colliders.filter((c) => c.mover),
      ...this.zones.filter((z) => z.mover),
    ];
    const t = this.target;
    t.bx = t.x; t.by = t.y; t.bz = t.z;
    return {
      colliders: this.colliders, movers, zones: this.zones, surfaces: this.surfaces, target: t,
      origin: this.origin, wind: mirror ? [-wind[0], wind[1]] : wind, lotX: this.lotX, clock: 0,
    };
  }

  /** Flips the whole level across x. Used by the daily route. The renderer flips its root group. */
  private applyMirror() {
    const flipMover = (m?: Mover): Mover | undefined => {
      if (!m) return m;
      if (m.kind === 'slide') return { ...m, dx: -m.dx };
      return { ...m, a0: -m.a0, a1: -m.a1, px: -m.px };
    };
    for (const c of this.colliders) {
      c.x = c.bx = -c.bx;
      c.yaw = c.byaw = -c.byaw;
      c.roll = -c.roll;
      c.mover = flipMover(c.mover);
      initCollider(c);
    }
    for (const z of this.zones) {
      z.x = z.bx = -z.bx;
      z.yaw = -z.yaw;
      z.mover = flipMover(z.mover);
    }
    for (const s of this.surfaces) {
      const x0 = -s.x1, x1 = -s.x0;
      s.x0 = x0; s.x1 = x1;
    }
    this.target.x = -this.target.x;
    this.target.yaw = -this.target.yaw;
    this.target.mover = flipMover(this.target.mover);
    this.origin = [-this.origin[0], this.origin[1], this.origin[2]];
    this.lotX = [-this.lotX[1], -this.lotX[0]];
    this.focus = this.focus.map(([x, y, z]) => [-x, y, z]);
  }
}

// ---------------------------------------------------------------------------------------
// Street furniture

export function street(b: Builder, originX = 0, originZ = -1.5) {
  b.origin = [originX, ORIGIN_Y, originZ];
  b.surface(-80, -2.9, 80, -0.35, 'concrete', 'walk');
  b.surface(-80, -0.35, 80, 40, 'asphalt', 'road');
  b.zoneBox({ x: 0, y: 0.2, z: 20, w: 200, h: 0.9, d: 40, tag: 'road', effect: 'road' });
  b.zoneCyl({ x: originX, z: originZ, y0: 0, y1: 1.9, r: 0.42, tag: 'courier', effect: 'bonk' });
  b.box({ x: originX - 3.6, y: 1.5, z: 1.9, w: 5.8, h: 2.2, d: 2.1, mat: 'car', tag: 'van' });
  b.vis('street', { x: 0, z: 0 });
  b.focus.push([originX, 0, originZ + 0.6]);
}

/** Paints a mat on the ground or on any flat surface, and makes it the target. */
export function mat(b: Builder, o: { x: number; y?: number; z: number; w?: number; d?: number; yaw?: number; mover?: Mover; style?: string }) {
  const w = o.w ?? 1.7, d = o.d ?? 1.15, y = o.y ?? 0;
  b.target = { x: o.x, y, z: o.z, w, d, yaw: o.yaw ?? 0, mover: o.mover, bx: o.x, by: y, bz: o.z };
  b.box({ x: o.x, y: y + 0.015, z: o.z, w, h: 0.05, d, yaw: o.yaw, mat: 'mat', tag: 'mat', mover: o.mover });
  b.vis('mat', { x: o.x, y, z: o.z, w, d, yaw: o.yaw ?? 0, mover: o.mover, style: o.style ?? 'welcome' });
  b.focus.push([o.x, y, o.z]);
}

export function path(b: Builder, x0: number, z0: number, x1: number, z1: number, kind: 'concrete' | 'tile' | 'asphalt' | 'wood' = 'concrete', style = 'path') {
  b.surface(x0, z0, x1, z1, kind, 'path');
  b.vis('paint', { x: 0, z: 0, x0, z0, x1, z1, style });
}

export function bed(b: Builder, x0: number, z0: number, x1: number, z1: number) {
  b.surface(x0, z0, x1, z1, 'mulch', 'bed');
  b.vis('paint', { x: 0, z: 0, x0, z0, x1, z1, style: 'bed' });
  b.vis('flowers', { x: 0, z: 0, x0, z0, x1, z1 });
}

export function car(b: Builder, o: { x: number; z: number; yaw?: number; color?: string; kind?: 'sedan' | 'hatch' | 'suv' }) {
  const yaw = o.yaw ?? 0;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // Car length runs along local z.
  const at = (lz: number): [number, number] => [o.x + s * lz, o.z + c * lz];
  b.box({ x: o.x, y: 0.72, z: o.z, w: 1.9, h: 0.84, d: 4.5, yaw, mat: 'car', tag: 'car' });
  const [cx, cz] = at(0.15);
  b.box({ x: cx, y: 1.4, z: cz, w: 1.62, h: 0.56, d: 2.4, yaw, mat: 'car', tag: 'car' });
  b.vis('car', { x: o.x, z: o.z, yaw, color: o.color ?? '#d8452e', kind: o.kind ?? 'sedan' });
}

export function fence(
  b: Builder,
  o: { x0: number; z0: number; x1: number; z1: number; h?: number; style?: 'picket' | 'iron' | 'wall' | 'glass' },
) {
  const h = o.h ?? 1.1;
  const style = o.style ?? 'picket';
  const dx = o.x1 - o.x0, dz = o.z1 - o.z0;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  const thick = style === 'wall' ? 0.34 : 0.14;
  const mat: MatName = style === 'wall' ? 'wall' : style === 'picket' ? 'wood' : style === 'glass' ? 'glass' : 'metal';
  const tag = style === 'glass' ? 'glasswall' : style === 'wall' ? 'wall' : 'fence';
  b.box({ x: (o.x0 + o.x1) / 2, y: h / 2, z: (o.z0 + o.z1) / 2, w: len, h, d: thick, yaw, mat, tag });
  b.vis('fence', { x: (o.x0 + o.x1) / 2, z: (o.z0 + o.z1) / 2, yaw, len, h, style });
}

/** Records passage through an opening, for the Through the Gate bonus. */
export function gateSensor(b: Builder, o: { x: number; z: number; w: number; h?: number; yaw?: number }) {
  b.zoneBox({ x: o.x, y: (o.h ?? 2.4) / 2, z: o.z, w: o.w, h: o.h ?? 2.4, d: 0.5, yaw: o.yaw, tag: 'gate', effect: 'sensor' });
}

export function openGate(b: Builder, o: { x: number; z: number; h?: number; len?: number; yaw?: number; style?: 'picket' | 'iron' }) {
  // A leaf swung wide open, hinged at (x, z).
  const len = o.len ?? 1.4, h = o.h ?? 1.1, yaw = o.yaw ?? -1.9;
  const cx = o.x + (Math.cos(yaw) * len) / 2, cz = o.z - (Math.sin(yaw) * len) / 2;
  b.box({ x: cx, y: h / 2, z: cz, w: len, h, d: 0.08, yaw, mat: 'wood', tag: 'fence' });
  b.vis('fence', { x: cx, z: cz, yaw, len, h, style: o.style ?? 'picket', gate: true });
}

export function hedge(b: Builder, o: { x0: number; z0: number; x1: number; z1: number; h?: number; t?: number }) {
  const h = o.h ?? 1.6, t = o.t ?? 0.9;
  const dx = o.x1 - o.x0, dz = o.z1 - o.z0;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  const x = (o.x0 + o.x1) / 2, z = (o.z0 + o.z1) / 2;
  b.box({ x, y: h / 2, z, w: len, h, d: t, yaw, mat: 'hedge', tag: 'hedge' });
  b.vis('hedge', { x, z, yaw, len, h, t });
}

export function tree(b: Builder, o: { x: number; z: number; s?: number; kind?: 'round' | 'palm' | 'cypress' | 'maple' }) {
  const s = o.s ?? 1, kind = o.kind ?? 'round';
  if (kind === 'palm') {
    b.cyl({ x: o.x, z: o.z, y0: 0, y1: 5.2 * s, r: 0.2, mat: 'wood', tag: 'tree' });
    b.zoneCyl({ x: o.x, z: o.z, y0: 4.6 * s, y1: 6.2 * s, r: 1.5 * s, tag: 'tree', effect: 'stick' });
  } else if (kind === 'cypress') {
    b.cyl({ x: o.x, z: o.z, y0: 0, y1: 5 * s, r: 0.5 * s, mat: 'hedge', tag: 'tree' });
  } else {
    b.cyl({ x: o.x, z: o.z, y0: 0, y1: 2.6 * s, r: 0.24 * s, mat: 'wood', tag: 'tree' });
    b.zoneCyl({ x: o.x, z: o.z, y0: 2.1 * s, y1: 5.6 * s, r: 1.9 * s, tag: 'tree', effect: 'stick' });
  }
  b.vis('tree', { x: o.x, z: o.z, s, kind });
}

export function bin(b: Builder, o: { x: number; z: number; color?: string }) {
  b.cyl({ x: o.x, z: o.z, y0: 0, y1: 1.05, r: 0.36, mat: 'metal', tag: 'binside' });
  b.zoneCyl({ x: o.x, z: o.z, y0: 1.05, y1: 1.45, r: 0.3, tag: 'bin', effect: 'stick' });
  b.vis('bin', { x: o.x, z: o.z, color: o.color ?? '#2f6b52' });
}

export function mailbox(b: Builder, o: { x: number; z: number; color?: string }) {
  b.cyl({ x: o.x, z: o.z, y0: 0, y1: 1.3, r: 0.12, mat: 'wood', tag: 'mailbox' });
  b.vis('mailbox', { x: o.x, z: o.z, color: o.color ?? '#3a5ea8' });
}

let knockCount = 0;
/** Lawn ornaments. No real collision: they just go flying and cost the parcel a little speed. */
export function ornament(b: Builder, kind: 'gnome' | 'flamingo' | 'cone' | 'pot', o: { x: number; z: number; yaw?: number }) {
  const key = `${kind}-${knockCount++}`;
  b.zoneCyl({ x: o.x, z: o.z, y0: 0, y1: kind === 'flamingo' ? 1.4 : 1, r: 0.5, tag: kind, effect: 'knock', key });
  b.vis('ornament', { x: o.x, z: o.z, yaw: o.yaw ?? 0, kind, key });
}

export function dog(b: Builder, o: { x: number; z: number; dx: number; dz?: number; period: number; phase?: number; hold?: number; name?: string }) {
  const mover: Mover = { kind: 'slide', dx: o.dx, dz: o.dz ?? 0, period: o.period, phase: o.phase, hold: o.hold ?? 0.08 };
  b.zoneCyl({ x: o.x, z: o.z, y0: 0, y1: 1.15, r: 1.05, tag: 'dog', effect: 'catch', mover });
  b.vis('dog', { x: o.x, z: o.z, mover });
}

export function pool(b: Builder, o: { x0: number; z0: number; x1: number; z1: number }) {
  const x = (o.x0 + o.x1) / 2, z = (o.z0 + o.z1) / 2;
  const w = Math.abs(o.x1 - o.x0), d = Math.abs(o.z1 - o.z0);
  b.surface(o.x0 - 1.1, o.z0 + 1.1, o.x1 + 1.1, o.z1 - 1.1, 'tile', 'path');
  b.vis('paint', { x: 0, z: 0, x0: o.x0 - 1.1, z0: o.z0 + 1.1, x1: o.x1 + 1.1, z1: o.z1 - 1.1, style: 'deck' });
  b.zoneBox({ x, y: 0, z, w, h: 0.72, d, tag: 'pool', effect: 'water' });
  b.vis('pool', { x, z, w, d });
}

/** Paves the strip between the sidewalk and a row of buildings. */
export function paving(b: Builder, front: number) {
  b.surface(-60, -2.9, 60, front, 'concrete', 'path');
  b.vis('paint', { x: 0, z: 0, x0: -26, z0: -2.9, x1: 26, z1: front, style: 'yard' });
}

/** Slatted shade: you can see through it, but a lob can't get through it. */
export function pergola(b: Builder, o: { x: number; z: number; w: number; d: number; h?: number }) {
  const h = o.h ?? 2.7;
  b.box({ x: o.x, y: h + 0.06, z: o.z, w: o.w, h: 0.14, d: o.d, mat: 'wood', tag: 'pergola' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.cyl({ x: o.x + (sx * o.w) / 2, z: o.z + (sz * o.d) / 2, y0: 0, y1: h, r: 0.1, mat: 'wood', tag: 'post' });
  }
  b.vis('pergola', { x: o.x, z: o.z, w: o.w, d: o.d, h });
}

export function trampoline(b: Builder, o: { x: number; z: number; r?: number }) {
  const r = o.r ?? 1.5;
  b.cyl({ x: o.x, z: o.z, y0: 0.62, y1: 0.7, r, mat: 'trampoline', tag: 'trampoline' });
  b.vis('trampoline', { x: o.x, z: o.z, r });
}

export function balcony(b: Builder, o: { x: number; y: number; z: number; w: number; d: number; rail?: number; style?: 'wood' | 'iron' | 'glass'; open?: boolean }) {
  const rail = o.rail ?? 0.55;
  const t = 0.16;
  b.box({ x: o.x, y: o.y - t / 2, z: o.z, w: o.w, h: t, d: o.d, mat: 'wood', tag: 'balcony' });
  const ry = o.y + rail / 2;
  b.box({ x: o.x, y: ry, z: o.z + o.d / 2, w: o.w, h: rail, d: 0.06, mat: 'metal', tag: 'rail' });
  b.box({ x: o.x - o.w / 2, y: ry, z: o.z, w: 0.06, h: rail, d: o.d, mat: 'metal', tag: 'rail' });
  b.box({ x: o.x + o.w / 2, y: ry, z: o.z, w: 0.06, h: rail, d: o.d, mat: 'metal', tag: 'rail' });
  b.vis('balcony', { x: o.x, y: o.y, z: o.z, w: o.w, d: o.d, rail, style: o.style ?? 'iron' });
}

export function awning(b: Builder, o: { x: number; y: number; z: number; w: number; d: number; tilt?: number; color?: string }) {
  const tilt = o.tilt ?? 0.34;
  b.box({ x: o.x, y: o.y, z: o.z, w: o.w, h: 0.1, d: o.d / Math.cos(tilt), pitch: tilt, mat: 'awning', tag: 'awning' });
  b.vis('awning', { x: o.x, y: o.y, z: o.z, w: o.w, d: o.d, tilt, color: o.color ?? '#c73e3a' });
}

// ---------------------------------------------------------------------------------------
// Buildings

export interface WindowSpec { x: number; y: number; w: number; h: number }

function addWindows(b: Builder, front: number, wins: WindowSpec[]) {
  for (const w of wins) {
    b.box({ x: w.x, y: w.y, z: front + 0.03, w: w.w, h: w.h, d: 0.08, mat: 'glass', tag: 'window' });
  }
}

export function house(
  b: Builder,
  o: {
    x?: number; front: number; w?: number; d?: number; floors?: number; color?: string; roof?: string; trim?: string; door?: string;
    doorX?: number; porch?: boolean; chimney?: boolean; rise?: number; wins?: WindowSpec[]; noWins?: boolean;
  },
) {
  const x = o.x ?? 0, w = o.w ?? 10, d = o.d ?? 7, floors = o.floors ?? 1;
  const H = floors * 2.9 + 0.3, rise = o.rise ?? 2.3, ov = 0.45;
  const cz = o.front - d / 2;
  const doorX = x + (o.doorX ?? 0);
  b.box({ x, y: H / 2, z: cz, w, h: H, d, mat: 'wall', tag: 'house' });
  // The roof is two tilted slabs meeting at a ridge that runs along x.
  const theta = Math.atan2(rise, d / 2);
  const run = d / 2 + ov;
  const L = run / Math.cos(theta);
  const midY = H + rise - (run / 2) * Math.tan(theta) + 0.08;
  b.box({ x, y: midY, z: cz + run / 2, w: w + ov * 2, h: 0.2, d: L, pitch: theta, mat: 'roof', tag: 'roof' });
  b.box({ x, y: midY, z: cz - run / 2, w: w + ov * 2, h: 0.2, d: L, pitch: -theta, mat: 'roof', tag: 'roof' });
  b.box({ x, y: H + rise * 0.3, z: cz, w, h: rise * 0.6, d: d * 0.62, mat: 'wall', tag: 'house' });

  b.box({ x: doorX, y: 1.25, z: o.front + 0.03, w: 1.05, h: 2.3, d: 0.08, mat: 'wood', tag: 'door' });

  const wins: WindowSpec[] = o.wins ?? [];
  if (!o.wins && !o.noWins) {
    for (let f = 0; f < floors; f++) {
      const y = 1.75 + f * 2.9;
      for (const wx of [-w * 0.33, w * 0.33, ...(f > 0 ? [0] : [])]) {
        if (f === 0 && Math.abs(x + wx - doorX) < 1.3) continue;
        wins.push({ x: x + wx, y, w: 1.35, h: 1.45 });
      }
    }
  }
  addWindows(b, o.front, wins);

  let chimney: [number, number] | null = null;
  if (o.chimney) {
    const chx = x + w * 0.28, chz = cz + 0.9;
    const top = H + rise + 0.55;
    b.box({ x: chx - 0.5, y: top / 2, z: chz, w: 0.2, h: top, d: 1.2, mat: 'wall', tag: 'chimney' });
    b.box({ x: chx + 0.5, y: top / 2, z: chz, w: 0.2, h: top, d: 1.2, mat: 'wall', tag: 'chimney' });
    b.box({ x: chx, y: top / 2, z: chz + 0.5, w: 1.2, h: top, d: 0.2, mat: 'wall', tag: 'chimney' });
    b.box({ x: chx, y: top / 2, z: chz - 0.5, w: 1.2, h: top, d: 0.2, mat: 'wall', tag: 'chimney' });
    b.zoneBox({ x: chx, y: top - 0.5, z: chz, w: 0.8, h: 0.5, d: 0.8, tag: 'chimney', effect: 'chimney' });
    chimney = [chx, chz];
  }

  if (o.porch) {
    b.box({ x: doorX, y: 0.2, z: o.front + 0.85, w: 3.6, h: 0.4, d: 1.7, mat: 'wood', tag: 'porch' });
    b.box({ x: doorX, y: 0.1, z: o.front + 1.95, w: 2, h: 0.2, d: 0.5, mat: 'wood', tag: 'porch' });
    b.box({ x: doorX, y: 2.95, z: o.front + 0.95, w: 3.9, h: 0.14, d: 2.1, pitch: 0.2, mat: 'roof', tag: 'roof' });
    for (const px of [-1.65, 1.65]) b.cyl({ x: doorX + px, z: o.front + 1.6, y0: 0.4, y1: 2.8, r: 0.1, mat: 'wood', tag: 'post' });
  }

  b.vis('house', {
    x, z: cz, front: o.front, w, d, H, rise, ov, floors, doorX, porch: !!o.porch, chimney, wins,
    color: o.color ?? '#e9d8b4', roof: o.roof ?? '#7d4634', trim: o.trim ?? '#fff6e6', door: o.door ?? '#c0392b',
  });
  b.focus.push([x, 0, o.front + 0.5], [x + w * 0.4, 0, o.front], [x - w * 0.4, 0, o.front]);
}

export function rowhouse(
  b: Builder,
  o: {
    x: number; front: number; w?: number; d?: number; floors?: number; color?: string; trim?: string; door?: string;
    doorX?: number; stoop?: number; wins?: WindowSpec[]; pattern?: 'brick' | 'stucco'; noDoor?: boolean;
  },
) {
  const w = o.w ?? 7, d = o.d ?? 9, floors = o.floors ?? 3, sh = o.stoop ?? 0;
  const H = floors * 3 + sh + 0.6;
  const doorX = o.x + (o.doorX ?? 0);
  b.box({ x: o.x, y: H / 2, z: o.front - d / 2, w, h: H, d, mat: 'wall', tag: 'house' });
  b.box({ x: o.x, y: H + 0.03, z: o.front - d / 2, w, h: 0.1, d, mat: 'roof', tag: 'roof' });
  // Parapet: keeps a parcel on the roof, which is funnier.
  b.box({ x: o.x, y: H + 0.3, z: o.front - 0.1, w, h: 0.6, d: 0.2, mat: 'wall', tag: 'roof' });

  if (!o.noDoor) b.box({ x: doorX, y: sh + 1.2, z: o.front + 0.03, w: 1.1, h: 2.4, d: 0.08, mat: 'wood', tag: 'door' });

  const wins: WindowSpec[] = o.wins ?? [];
  if (!o.wins) {
    for (let f = 0; f < floors; f++) {
      const y = sh + 1.7 + f * 3;
      for (const wx of [-w * 0.3, 0, w * 0.3]) {
        if (f === 0 && !o.noDoor && Math.abs(o.x + wx - doorX) < 1.2) continue;
        wins.push({ x: o.x + wx, y, w: 1.15, h: 1.7 });
      }
    }
  }
  addWindows(b, o.front, wins);

  if (sh > 0) {
    const depth = 1.7, run = sh * 1.5;
    b.box({ x: doorX, y: sh / 2, z: o.front + depth / 2, w: 2.2, h: sh, d: depth, mat: 'concrete', tag: 'stoop' });
    const ang = Math.atan2(sh, run);
    const L = Math.hypot(sh, run);
    b.box({ x: doorX, y: sh / 2 - 0.1, z: o.front + depth + run / 2, w: 2.2, h: 0.2, d: L, pitch: ang, mat: 'concrete', tag: 'stoop' });
    for (const sx of [-1.1, 1.1]) {
      b.box({ x: doorX + sx, y: sh + 0.42, z: o.front + depth / 2, w: 0.08, h: 0.84, d: depth, mat: 'metal', tag: 'rail' });
    }
  }

  b.vis('rowhouse', {
    x: o.x, z: o.front - d / 2, front: o.front, w, d, H, floors, doorX, sh, wins, noDoor: !!o.noDoor,
    color: o.color ?? '#a4563f', trim: o.trim ?? '#efe2cc', door: o.door ?? '#1f4d46', pattern: o.pattern ?? 'brick',
  });
  b.focus.push([o.x, 0, o.front + 0.5]);
}

export function villa(
  b: Builder,
  o: { x?: number; front: number; w?: number; d?: number; h?: number; doorX?: number; color?: string; accent?: string; upper?: { x: number; w: number; d: number; h: number }; wins?: WindowSpec[] },
) {
  const x = o.x ?? 0, w = o.w ?? 13, d = o.d ?? 8, h = o.h ?? 3.4;
  const doorX = x + (o.doorX ?? 0);
  b.box({ x, y: h / 2, z: o.front - d / 2, w, h, d, mat: 'wall', tag: 'house' });
  b.box({ x, y: h + 0.1, z: o.front - d / 2 + 0.5, w: w + 0.8, h: 0.2, d: d + 1.4, mat: 'roof', tag: 'roof' });
  b.box({ x: doorX, y: 1.3, z: o.front + 0.03, w: 1.4, h: 2.5, d: 0.08, mat: 'wood', tag: 'door' });
  const wins: WindowSpec[] = o.wins ?? [
    { x: x - w * 0.27, y: 1.6, w: w * 0.32, h: 2.5 },
    { x: x + w * 0.29, y: 1.6, w: w * 0.28, h: 2.5 },
  ];
  addWindows(b, o.front, wins);
  const u = o.upper;
  if (u) {
    b.box({ x: x + u.x, y: h + 0.2 + u.h / 2, z: o.front - d / 2 - 0.2, w: u.w, h: u.h, d: u.d, mat: 'wall', tag: 'house' });
    b.box({ x: x + u.x, y: h + 0.3 + u.h, z: o.front - d / 2 - 0.2, w: u.w + 0.5, h: 0.2, d: u.d + 0.5, mat: 'roof', tag: 'roof' });
  }
  b.vis('villa', { x, z: o.front - d / 2, front: o.front, w, d, h, doorX, wins, upper: u ?? null, color: o.color ?? '#f2ece1', accent: o.accent ?? '#c8894f' });
  b.focus.push([x, 0, o.front + 0.5], [x + w * 0.33, 0, o.front], [x - w * 0.33, 0, o.front]);
}
