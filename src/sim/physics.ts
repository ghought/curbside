// Fixed-step sphere physics. The parcel is a sphere for collision and a box for looks, so
// a given input always gives the same result, and the preview is the real thing.

import {
  DT, GRAVITY, MATS, type Body, type Collider, type Material, type MatName, type Mover, type Outcome,
  type Parcel, type Pose, type SimEvent, type ThrowInput, type World, type Zone,
} from './types';

const AIM_STEP = (0.25 * Math.PI) / 180;
const POWER_STEP = 1 / 200;

/** Inputs snap to a fine grid, so a replayed aim is bit-for-bit the same throw. */
export function quantize(input: ThrowInput): ThrowInput {
  return {
    yaw: Math.round(input.yaw / AIM_STEP) * AIM_STEP,
    power: Math.round(Math.min(1, Math.max(0, input.power)) / POWER_STEP) * POWER_STEP,
  };
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Ping-pong from 0 to 1 and back, with optional holds at each end. */
function pingPong(period: number, phase: number, hold: number, seconds: number): number {
  const u = (((seconds / period + phase) % 1) + 1) % 1;
  const span = 0.5 - hold;
  if (u < span) return ease(u / span);
  if (u < 0.5) return 1;
  if (u < 0.5 + span) return 1 - ease((u - 0.5) / span);
  return 0;
}

export function moverPose(m: Mover, seconds: number): Pose {
  const u = pingPong(m.period, m.phase ?? 0, m.hold ?? 0, seconds);
  if (m.kind === 'slide') {
    return { dx: m.dx * u, dy: (m.dy ?? 0) * u, dz: m.dz * u, dyaw: 0, px: 0, pz: 0 };
  }
  return { dx: 0, dy: 0, dz: 0, dyaw: m.a0 + (m.a1 - m.a0) * u, px: m.px, pz: m.pz };
}

function updateAxes(c: Collider, yaw: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const cr = Math.cos(c.roll), sr = Math.sin(c.roll);
  // Columns of Ry(yaw) * Rx(pitch) * Rz(roll).
  c.ax[0] = cy * cr + sy * sp * sr; c.ax[1] = cp * sr; c.ax[2] = -sy * cr + cy * sp * sr;
  c.ax[3] = -cy * sr + sy * sp * cr; c.ax[4] = cp * cr; c.ax[5] = sy * sr + cy * sp * cr;
  c.ax[6] = sy * cp; c.ax[7] = -sp; c.ax[8] = cy * cp;
}

export function computeBounds(c: Collider) {
  if (c.kind === 'box') {
    const ex = Math.abs(c.ax[0]) * c.hx + Math.abs(c.ax[3]) * c.hy + Math.abs(c.ax[6]) * c.hz;
    const ey = Math.abs(c.ax[1]) * c.hx + Math.abs(c.ax[4]) * c.hy + Math.abs(c.ax[7]) * c.hz;
    const ez = Math.abs(c.ax[2]) * c.hx + Math.abs(c.ax[5]) * c.hy + Math.abs(c.ax[8]) * c.hz;
    c.min = [c.x - ex, c.y - ey, c.z - ez];
    c.max = [c.x + ex, c.y + ey, c.z + ez];
  } else if (c.kind === 'cyl') {
    c.min = [c.x - c.r, c.y0, c.z - c.r];
    c.max = [c.x + c.r, c.y1, c.z + c.r];
  } else {
    c.min = [c.x - c.r, c.y - c.r, c.z - c.r];
    c.max = [c.x + c.r, c.y + c.r, c.z + c.r];
  }
}

export function initCollider(c: Collider) {
  updateAxes(c, c.yaw);
  computeBounds(c);
}

export function setClock(w: World, clock: number) {
  w.clock = clock;
  const s = clock * DT;
  for (const m of w.movers) {
    const mover = m.mover!;
    const p = moverPose(mover, s);
    if ('kind' in m) {
      const ox = m.x, oy = m.y, oz = m.z;
      if (p.dyaw !== 0 || mover.kind === 'swing') {
        const c = Math.cos(p.dyaw), sn = Math.sin(p.dyaw);
        const rx = m.bx - p.px, rz = m.bz - p.pz;
        m.x = p.px + rx * c + rz * sn;
        m.z = p.pz - rx * sn + rz * c;
        m.y = m.by;
        updateAxes(m, m.byaw + p.dyaw);
      } else {
        m.x = m.bx + p.dx; m.y = m.by + p.dy; m.z = m.bz + p.dz;
      }
      m.vx = (m.x - ox) / DT; m.vy = (m.y - oy) / DT; m.vz = (m.z - oz) / DT;
      // A big jump means the clock was reset, not that the thing moved fast.
      if (Math.abs(m.vx) + Math.abs(m.vy) + Math.abs(m.vz) > 40) m.vx = m.vy = m.vz = 0;
      computeBounds(m);
    } else {
      m.x = m.bx + p.dx; m.y = m.by + p.dy; m.z = m.bz + p.dz;
    }
  }
  const t = w.target;
  if (t.mover) {
    const p = moverPose(t.mover, s);
    t.x = t.bx + p.dx; t.y = t.by + p.dy; t.z = t.bz + p.dz;
  }
}

export function moverIsLive(w: World): boolean {
  return !!w.target.mover;
}

export function launchSpeed(parcel: Parcel, power: number): number {
  return parcel.vmin + (parcel.vmax - parcel.vmin) * power;
}

export function makeBody(w: World, parcel: Parcel, input: ThrowInput, startClock = w.clock): Body {
  const { yaw, power } = quantize(input);
  const speed = launchSpeed(parcel, power);
  const el = (parcel.elev * Math.PI) / 180;
  const h = Math.cos(el) * speed;
  return {
    parcel,
    x: w.origin[0], y: w.origin[1], z: w.origin[2],
    vx: Math.sin(yaw) * h, vy: Math.sin(el) * speed, vz: -Math.cos(yaw) * h,
    wx: -6 - power * 8, wy: Math.sin(yaw) * 3, wz: 1.5,
    tick: 0, startClock,
    condition: 100, restTicks: 0, contactTick: -999, supportTag: '', svx: 0, svz: 0,
    bounces: 0, lastHitTag: '', lastHitTick: -999,
    zonesHit: new Set(), firstTouchTick: -1, skips: 0, springs: 0, done: null,
  };
}

function finish(w: World, b: Body, delivered: boolean, reason: string) {
  const t = w.target;
  const out: Outcome = {
    delivered, reason, x: b.x, y: b.y, z: b.z, tick: b.tick,
    missBy: Math.max(0, Math.hypot(b.x - t.x, b.z - t.z) - Math.max(t.w, t.d) / 2),
  };
  b.done = out;
}

function surfaceAt(w: World, x: number, z: number): { kind: MatName; tag: string } {
  for (let i = w.surfaces.length - 1; i >= 0; i--) {
    const s = w.surfaces[i];
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s;
  }
  return { kind: 'grass', tag: 'lawn' };
}

function resolve(
  w: World, b: Body, ev: SimEvent[] | null,
  nx: number, ny: number, nz: number, pen: number,
  matName: MatName, tag: string, cvx: number, cvy: number, cvz: number,
) {
  const mat: Material = MATS[matName];
  b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;
  const rvx = b.vx - cvx, rvy = b.vy - cvy, rvz = b.vz - cvz;
  const vn = rvx * nx + rvy * ny + rvz * nz;
  if (ny > 0.5) {
    b.contactTick = b.tick;
    b.supportTag = tag;
    b.svx = cvx; b.svz = cvz;
  }
  if (vn >= 0) return;

  const P = b.parcel;
  // Mats are sticky for everything, or the bouncy parcels could never be delivered.
  const onMat = tag === 'mat';
  let e = onMat ? 0.04 : Math.min(mat.e * P.bounce, 0.92);
  if (-vn < 1.1) e = 0;
  let rebound = -vn * e;
  if (mat.boost && -vn > 2) {
    rebound = Math.max(rebound, mat.boost * Math.pow(0.6, b.springs));
    b.springs++;
  }
  const j = -vn + rebound;

  b.vx += nx * j; b.vy += ny * j; b.vz += nz * j;

  // Coulomb friction against the tangential slip.
  const tvx = rvx - vn * nx, tvy = rvy - vn * ny, tvz = rvz - vn * nz;
  const slip = Math.hypot(tvx, tvy, tvz);
  if (slip > 1e-5) {
    const mu = onMat ? 1.3 : mat.mu * P.mu;
    const df = Math.min(slip, mu * j);
    b.vx -= (tvx / slip) * df; b.vy -= (tvy / slip) * df; b.vz -= (tvz / slip) * df;
  }

  if (j > 2.4) {
    const repeat = b.lastHitTag === tag && b.tick - b.lastHitTick < 10;
    if (!repeat) {
      if (b.firstTouchTick < 0) b.firstTouchTick = b.tick;
      b.bounces++;
      const dmg = Math.max(0, j - mat.soft) * 2.6 * P.fragile;
      b.condition = Math.max(0, b.condition - dmg);
      ev?.push({ type: 'hit', tick: b.tick, tag, mat: matName, x: b.x - nx * P.r, y: b.y - ny * P.r, z: b.z - nz * P.r, j, nx, ny, nz });
      // Tumble: an impact kicks the visual spin around.
      const k = 0.8 + slip * 0.5;
      b.wx = (nz * b.vy - ny * b.vz) * k * 0.4 + b.wx * 0.3;
      b.wz = (ny * b.vx - nx * b.vy) * k * 0.4 + b.wz * 0.3;
      b.wy = b.wy * 0.5 + (nx * b.vz - nz * b.vx) * 0.3;
    }
    b.lastHitTag = tag;
    b.lastHitTick = b.tick;
    if (tag === 'window' && j > 5) finish(w, b, false, 'window');
    else if (b.condition <= 0) finish(w, b, false, 'crushed');
  }
}

function collide(w: World, b: Body, c: Collider, ev: SimEvent[] | null) {
  const r = b.parcel.r;
  if (
    b.x + r < c.min[0] || b.x - r > c.max[0] ||
    b.y + r < c.min[1] || b.y - r > c.max[1] ||
    b.z + r < c.min[2] || b.z - r > c.max[2]
  ) return;

  if (c.kind === 'box') {
    const a = c.ax;
    const dx = b.x - c.x, dy = b.y - c.y, dz = b.z - c.z;
    const lx = dx * a[0] + dy * a[1] + dz * a[2];
    const ly = dx * a[3] + dy * a[4] + dz * a[5];
    const lz = dx * a[6] + dy * a[7] + dz * a[8];
    const qx = Math.max(-c.hx, Math.min(c.hx, lx));
    const qy = Math.max(-c.hy, Math.min(c.hy, ly));
    const qz = Math.max(-c.hz, Math.min(c.hz, lz));
    let ox = lx - qx, oy = ly - qy, oz = lz - qz;
    let d2 = ox * ox + oy * oy + oz * oz;
    let pen: number;
    if (d2 > 1e-10) {
      if (d2 >= r * r) return;
      const d = Math.sqrt(d2);
      ox /= d; oy /= d; oz /= d;
      pen = r - d;
    } else {
      // Centre is inside: push out through the nearest face.
      const fx = c.hx - Math.abs(lx), fy = c.hy - Math.abs(ly), fz = c.hz - Math.abs(lz);
      ox = oy = oz = 0;
      if (fx <= fy && fx <= fz) { ox = Math.sign(lx) || 1; pen = fx + r; }
      else if (fy <= fz) { oy = Math.sign(ly) || 1; pen = fy + r; }
      else { oz = Math.sign(lz) || 1; pen = fz + r; }
    }
    const nx = ox * a[0] + oy * a[3] + oz * a[6];
    const ny = ox * a[1] + oy * a[4] + oz * a[7];
    const nz = ox * a[2] + oy * a[5] + oz * a[8];
    resolve(w, b, ev, nx, ny, nz, pen, c.mat, c.tag, c.vx, c.vy, c.vz);
  } else if (c.kind === 'cyl') {
    const dx = b.x - c.x, dz = b.z - c.z;
    const qy = Math.max(c.y0, Math.min(c.y1, b.y));
    const dy = b.y - qy;
    const radial = Math.hypot(dx, dz);
    const ex = radial > c.r ? radial - c.r : 0;
    if (ex === 0 && dy !== 0) {
      // Directly above or below the disc.
      if (Math.abs(dy) >= r) return;
      resolve(w, b, ev, 0, Math.sign(dy), 0, r - Math.abs(dy), c.mat, c.tag, 0, 0, 0);
      return;
    }
    const d = Math.hypot(ex, dy);
    if (d >= r && ex > 0) return;
    const inv = radial > 1e-6 ? 1 / radial : 0;
    if (ex > 0) {
      const nh = ex / d;
      resolve(w, b, ev, dx * inv * nh, dy / d, dz * inv * nh, r - d, c.mat, c.tag, 0, 0, 0);
    } else {
      resolve(w, b, ev, dx * inv, 0, dz * inv, c.r - radial + r, c.mat, c.tag, 0, 0, 0);
    }
  } else {
    const dx = b.x - c.x, dy = b.y - c.y, dz = b.z - c.z;
    const d = Math.hypot(dx, dy, dz);
    const lim = c.r + r;
    if (d >= lim || d < 1e-6) return;
    resolve(w, b, ev, dx / d, dy / d, dz / d, lim - d, c.mat, c.tag, 0, 0, 0);
  }
}

function inZone(z: Zone, b: Body): boolean {
  const dx = b.x - z.x, dy = b.y - z.y, dz = b.z - z.z;
  if (Math.abs(dy) > z.hy) return false;
  if (z.shape === 'cyl') return dx * dx + dz * dz < z.r * z.r;
  const c = Math.cos(z.yaw), s = Math.sin(z.yaw);
  return Math.abs(dx * c - dz * s) < z.hx && Math.abs(dx * s + dz * c) < z.hz;
}

function runZones(w: World, b: Body, ev: SimEvent[] | null) {
  for (const z of w.zones) {
    if (!inZone(z, b)) continue;

    if (z.effect === 'water') {
      const P = b.parcel;
      const flat = Math.abs(b.vy) < Math.hypot(b.vx, b.vz) * 0.62;
      const fast = Math.hypot(b.vx, b.vz) > 4.2;
      if (P.skim > 0 && flat && fast && b.vy < 0) {
        b.vy = Math.abs(b.vy) * 0.62 + 1.1;
        b.vx *= 0.84 * (0.7 + 0.3 * P.skim);
        b.vz *= 0.84 * (0.7 + 0.3 * P.skim);
        b.y = z.y + z.hy + 0.02;
        b.skips++;
        ev?.push({ type: 'skip', tick: b.tick, x: b.x, y: b.y, z: b.z });
      } else if (b.vy < 0 || !flat) {
        finish(w, b, false, z.tag);
        return;
      }
      continue;
    }

    if (b.zonesHit.has(z.id)) continue;
    if (z.effect === 'bonk' && b.tick < 50) continue;
    b.zonesHit.add(z.id);
    ev?.push({ type: 'zone', tick: b.tick, tag: z.tag, key: z.key, x: b.x, y: b.y, z: b.z });

    if (z.effect === 'catch' || z.effect === 'stick' || z.effect === 'road' || z.effect === 'bonk') {
      finish(w, b, false, z.tag);
      return;
    }
    if (z.effect === 'chimney') {
      finish(w, b, true, 'chimney');
      return;
    }
    if (z.effect === 'knock') {
      b.vx *= 0.93; b.vz *= 0.93;
    }
  }
}

function targetContains(w: World, b: Body): boolean {
  const t = w.target;
  const c = Math.cos(t.yaw), s = Math.sin(t.yaw);
  const dx = b.x - t.x, dz = b.z - t.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= t.w / 2 + 0.08 && Math.abs(lz) <= t.d / 2 + 0.08 && b.y > t.y - 0.1 && b.y < t.y + 1.1;
}

function settle(w: World, b: Body) {
  if (targetContains(w, b)) {
    finish(w, b, true, 'delivered');
    return;
  }
  const tag = b.supportTag || 'lawn';
  if (tag === 'lawn' || tag === 'path' || tag === 'walk') {
    const offLot = b.x < w.lotX[0] || b.x > w.lotX[1];
    finish(w, b, false, offLot ? 'neighbour' : tag);
  } else {
    finish(w, b, false, tag);
  }
}

/** Advances one tick. Call setClock first when anything in the world moves. */
export function step(w: World, b: Body, ev: SimEvent[] | null) {
  if (b.done) return;
  const P = b.parcel;
  b.tick++;

  b.vy -= GRAVITY * DT;
  const airborne = b.tick - b.contactTick > 4;
  if (airborne) {
    const k = 1 - P.drag * DT;
    b.vx = b.vx * k + w.wind[0] * P.wind * DT;
    b.vz = b.vz * k + w.wind[1] * P.wind * DT;
  }
  b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;

  const cols = w.colliders;
  for (let i = 0; i < cols.length; i++) {
    collide(w, b, cols[i], ev);
    if (b.done) return;
  }

  // Zones go first, so water gets a say before the ground under it does.
  runZones(w, b, ev);
  if (b.done) return;

  if (b.y < P.r) {
    const s = surfaceAt(w, b.x, b.z);
    resolve(w, b, ev, 0, 1, 0, P.r - b.y, s.kind, s.tag, 0, 0, 0);
    if (b.done) return;
  }

  const rvx = b.vx - b.svx, rvz = b.vz - b.svz;
  const resting = b.tick - b.contactTick <= 2 && rvx * rvx + rvz * rvz + b.vy * b.vy < 0.09;
  b.restTicks = resting ? b.restTicks + 1 : 0;
  if (b.restTicks > 28 || b.tick > 120 * 11) settle(w, b);

  if (Math.abs(b.x) > 60 || b.z < -70 || b.z > 30) finish(w, b, false, 'lost');
}

export interface Preview {
  pts: number[];
  /** Index into pts (in points) of the first impact, or -1. */
  hit: number;
  hitPos: [number, number, number] | null;
  ended: boolean;
}

/** Runs the real sim from the current clock and records a short stretch of it. */
export function previewThrow(w: World, parcel: Parcel, input: ThrowInput, seconds: number): Preview {
  const clock = w.clock;
  const moving = w.movers.length > 0 || !!w.target.mover;
  const b = makeBody(w, parcel, input, clock);
  const ev: SimEvent[] = [];
  const pts: number[] = [b.x, b.y, b.z];
  let hit = -1;
  let hitPos: Preview['hitPos'] = null;
  const ticks = Math.round(seconds / DT);
  for (let i = 1; i <= ticks; i++) {
    if (moving) setClock(w, clock + i);
    step(w, b, ev);
    if (i % 3 === 0) pts.push(b.x, b.y, b.z);
    if (hit < 0 && ev.length > 0) {
      const e = ev[0];
      hit = pts.length / 3 - 1;
      hitPos = [e.x, e.y, e.z];
    }
    if (b.done) break;
    // Past the first impact, only show a short taste of the rebound.
    if (hit >= 0 && pts.length / 3 - 1 - hit > 10) break;
  }
  if (moving) setClock(w, clock);
  return { pts, hit, hitPos, ended: !!b.done };
}

export interface ThrowResult {
  body: Body;
  events: SimEvent[];
  outcome: Outcome;
}

/** Plays a whole throw instantly. Used by the solver. */
export function simulate(w: World, parcel: Parcel, input: ThrowInput, startClock = 0): ThrowResult {
  const moving = w.movers.length > 0 || !!w.target.mover;
  setClock(w, startClock);
  const b = makeBody(w, parcel, input, startClock);
  const events: SimEvent[] = [];
  while (!b.done) {
    if (moving) setClock(w, startClock + b.tick + 1);
    step(w, b, events);
  }
  return { body: b, events, outcome: b.done! };
}
