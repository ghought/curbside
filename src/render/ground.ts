// Paints each level's ground into one canvas: lawn, paths, soft contact shadows under props.

import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import type { Visual } from '../levels/builder';
import { rand } from './geo';
import type { Theme } from './themes';

export const GROUND = { x0: -26, z0: -36, size: 52, px: 2048 };

const S = GROUND.px / GROUND.size;
const X = (x: number) => (x - GROUND.x0) * S;
const Z = (z: number) => (z - GROUND.z0) * S;

function speckle(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, count: number, colors: string[], r: () => number, size = 2) {
  for (let i = 0; i < count; i++) {
    c.fillStyle = colors[(r() * colors.length) | 0];
    c.fillRect(x + r() * w, y + r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, rad);
}

function softShadow(c: CanvasRenderingContext2D, x: number, z: number, w: number, d: number, yaw = 0, strength = 0.42, blur = 0.9) {
  // Drawn off-canvas so only the blurred shadow lands on it. ctx.filter would be simpler,
  // but Safari doesn't support it.
  const OFF = 8000;
  c.save();
  c.translate(X(x) - OFF, Z(z));
  c.rotate(-yaw);
  c.shadowColor = `rgba(16, 20, 28, ${strength})`;
  c.shadowBlur = blur * S;
  c.shadowOffsetX = OFF;
  c.fillStyle = '#000';
  c.fillRect((-w / 2) * S, (-d / 2) * S, w * S, d * S);
  c.restore();
}

function paintPath(c: CanvasRenderingContext2D, v: Visual, t: Theme, r: () => number) {
  const x0 = X(v.x0 as number), z0 = Z(v.z0 as number), x1 = X(v.x1 as number), z1 = Z(v.z1 as number);
  const x = Math.min(x0, x1), y = Math.min(z0, z1), w = Math.abs(x1 - x0), h = Math.abs(z1 - z0);
  const style = v.style as string;
  c.save();
  // A little soil edge so the path sits in the lawn.
  c.fillStyle = 'rgba(40, 34, 20, 0.28)';
  roundRect(c, x - 5, y - 5, w + 10, h + 10, 10);
  c.fill();
  roundRect(c, x, y, w, h, 6);
  c.clip();
  if (style === 'bed') {
    c.fillStyle = '#4a3324';
    c.fillRect(x, y, w, h);
    speckle(c, x, y, w, h, (w * h) / 16, ['#5e4230', '#3b271b', '#6d4d38'], r, 4);
  } else if (style === 'drive') {
    c.fillStyle = t.asphalt;
    c.fillRect(x, y, w, h);
    speckle(c, x, y, w, h, (w * h) / 30, ['#00000022', '#ffffff14'], r, 3);
  } else if (style === 'deck' || style === 'plaza' || style === 'yard') {
    const tile = style === 'deck' ? 1 * S : 0.75 * S;
    const base = style === 'deck' ? '#ece2cf' : style === 'plaza' ? '#b9a78f' : '#8d8580';
    c.fillStyle = base;
    c.fillRect(x, y, w, h);
    for (let ty = y - (y % tile); ty < y + h; ty += tile) {
      for (let tx = x - (x % tile); tx < x + w; tx += tile) {
        c.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.07})`;
        c.fillRect(tx, ty, tile, tile);
      }
    }
    c.strokeStyle = 'rgba(0,0,0,0.13)';
    c.lineWidth = 2;
    for (let ty = y - (y % tile); ty < y + h; ty += tile) { c.beginPath(); c.moveTo(x, ty); c.lineTo(x + w, ty); c.stroke(); }
    for (let tx = x - (x % tile); tx < x + w; tx += tile) { c.beginPath(); c.moveTo(tx, y); c.lineTo(tx, y + h); c.stroke(); }
  } else {
    // Concrete slabs.
    c.fillStyle = t.concrete;
    c.fillRect(x, y, w, h);
    speckle(c, x, y, w, h, (w * h) / 40, ['#00000014', '#ffffff18'], r, 3);
    c.strokeStyle = 'rgba(0,0,0,0.16)';
    c.lineWidth = 2.5;
    const step = 1.5 * S;
    if (h > w) {
      for (let ty = y + h; ty > y; ty -= step) { c.beginPath(); c.moveTo(x, ty); c.lineTo(x + w, ty); c.stroke(); }
    } else {
      for (let tx = x; tx < x + w; tx += step) { c.beginPath(); c.moveTo(tx, y); c.lineTo(tx, y + h); c.stroke(); }
    }
  }
  c.restore();
}

export function paintGround(canvas: HTMLCanvasElement, visuals: Visual[], t: Theme, seed: number): CanvasTexture {
  canvas.width = canvas.height = GROUND.px;
  const c = canvas.getContext('2d')!;
  const r = rand(seed * 7919 + 13);
  const P = GROUND.px;

  // Lawn with mowing stripes along the street.
  c.fillStyle = t.grass[0];
  c.fillRect(0, 0, P, P);
  const band = 1.25 * S;
  for (let i = 0; i < P / band; i++) {
    if (i % 2 === 0) continue;
    c.fillStyle = t.grass[1];
    c.fillRect(0, i * band, P, band);
  }
  // Big soft blotches so it doesn't look like a carpet.
  for (let i = 0; i < 90; i++) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    const dark = r() > 0.5;
    g.addColorStop(0, dark ? 'rgba(30,60,20,0.14)' : 'rgba(235,240,130,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save();
    c.translate(r() * P, r() * P);
    c.scale(60 + r() * 220, 40 + r() * 130);
    c.fillStyle = g;
    c.fillRect(-1, -1, 2, 2);
    c.restore();
  }
  speckle(c, 0, 0, P, P, 26000, [t.grassDark + '55', '#ffffff10', t.grass[0], '#dfe88a22'], r, 3);

  // Sidewalk.
  const walkTop = Z(-2.9), walkBottom = Z(-0.35);
  c.fillStyle = 'rgba(30,30,20,0.3)';
  c.fillRect(0, walkTop - 5, P, 6);
  c.fillStyle = t.concrete;
  c.fillRect(0, walkTop, P, walkBottom - walkTop);
  speckle(c, 0, walkTop, P, walkBottom - walkTop, 5000, ['#00000014', '#ffffff1a'], r, 3);
  c.strokeStyle = 'rgba(0,0,0,0.2)';
  c.lineWidth = 3;
  for (let x = X(-26); x < P; x += 2.2 * S) {
    c.beginPath(); c.moveTo(x, walkTop); c.lineTo(x, walkBottom); c.stroke();
  }

  // Road.
  c.fillStyle = t.asphalt;
  c.fillRect(0, Z(-0.35), P, P - Z(-0.35));
  speckle(c, 0, Z(0), P, P - Z(0), 16000, ['#00000030', '#ffffff14', '#ffffff0c'], r, 3);
  for (let i = 0; i < 9; i++) {
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(r() * P, Z(0.4 + r() * 9), 80 + r() * 300, 3 + r() * 5);
  }
  c.fillStyle = '#e8d9a0';
  for (let x = X(-26); x < P; x += 4.4 * S) c.fillRect(x, Z(8), 2.4 * S, 0.16 * S);

  for (const v of visuals) if (v.type === 'paint') paintPath(c, v, t, r);

  // Contact shadows. Real-time shadows do the directional part; these do the ambient part.
  for (const v of visuals) {
    const yaw = v.yaw ?? 0;
    if (v.type === 'house' || v.type === 'rowhouse' || v.type === 'villa') {
      softShadow(c, v.x, v.z, (v.w as number) + 0.8, (v.d as number) + 0.8, 0, 0.5, 1.1);
    } else if (v.type === 'car') softShadow(c, v.x, v.z, 2.2, 4.7, yaw, 0.55, 0.5);
    else if (v.type === 'hedge') softShadow(c, v.x, v.z, (v.len as number) + 0.5, (v.t as number) + 0.6, yaw, 0.46, 0.5);
    else if (v.type === 'fence') softShadow(c, v.x, v.z, v.len as number, v.style === 'wall' ? 0.8 : 0.34, yaw, 0.32, 0.25);
    else if (v.type === 'tree') {
      const s = (v.s as number) ?? 1;
      if (v.kind !== 'palm') softShadow(c, v.x, v.z, 3.2 * s, 3.2 * s, 0, 0.14, 1.2);
      softShadow(c, v.x, v.z, 0.8, 0.8, 0, 0.4, 0.3);
    } else if (v.type === 'bin' || v.type === 'mailbox' || v.type === 'ornament') {
      softShadow(c, v.x, v.z, 0.7, 0.7, 0, 0.36, 0.25);
    } else if (v.type === 'trampoline') {
      softShadow(c, v.x, v.z, 3.1, 3.1, 0, 0.26, 0.6);
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  return tex;
}
