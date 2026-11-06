// The 15 handcrafted deliveries. Coordinates: x runs along the street, the road is z > 0,
// and house fronts sit at negative z. `npm run solve` brute-forces every one of these.

import type { Mover, ParcelKind, World } from '../sim/types';
import {
  Builder, awning, balcony, bed, bin, car, dog, fence, gateSensor, hedge, house, mailbox, mat, openGate,
  ornament, path, paving, pergola, pool, rowhouse, street, trampoline, tree, villa,
} from './builder';
import type { Visual } from './builder';
import par from './par.json';

export type RouteId = 'maple' | 'brownstone' | 'palm';

export interface Delivery {
  id: string;
  route: RouteId;
  title: string;
  /** The customer's delivery instructions. */
  note: string;
  from: string;
  parcel: ParcelKind;
  /** Seconds of trajectory shown while aiming. Shrinks as the game gets harder. */
  preview: number;
  wind?: [number, number];
  build(b: Builder): void;
}

export interface BuiltLevel {
  def: Delivery;
  world: World;
  visuals: Visual[];
  focus: [number, number, number][];
  mirror: boolean;
}

export function buildLevel(def: Delivery, opts: { wind?: [number, number]; mirror?: boolean } = {}): BuiltLevel {
  const b = new Builder();
  def.build(b);
  const mirror = !!opts.mirror;
  const world = b.world(opts.wind ?? def.wind ?? [0, 0], mirror);
  return { def, world, visuals: b.visuals, focus: b.focus, mirror };
}

const maple: Delivery[] = [
  {
    id: 'welcome', route: 'maple', title: 'Welcome Mat', parcel: 'box', preview: 1.5, from: 'The Hendersons',
    note: 'Just the mat, please. We are simple people.',
    build(b) {
      street(b);
      house(b, { front: -11, porch: true, chimney: true, color: '#e8d3a8', roof: '#8a4b38', door: '#b8352a' });
      path(b, -0.9, -2.9, 0.9, -9);
      mat(b, { x: 0, z: -8.1 });
      bed(b, -4.6, -10.6, -2.1, -9.6);
      bed(b, 2.1, -10.6, 4.6, -9.6);
      tree(b, { x: -5.6, z: -6, kind: 'maple' });
      ornament(b, 'gnome', { x: 3.2, z: -6.4, yaw: -0.5 });
      mailbox(b, { x: 2.1, z: -3.3 });
      bin(b, { x: 6.2, z: -3.5 });
    },
  },
  {
    id: 'gate', route: 'maple', title: 'Mind the Gate', parcel: 'pizza', preview: 1.3, from: 'Marcy, No. 12',
    note: 'Pizza flies flat. Our fence is tall. The gate is open. You do the maths.',
    build(b) {
      street(b, 1);
      house(b, { front: -13.5, porch: true, color: '#b9d0c9', roof: '#4c5a66', door: '#e0a12f' });
      path(b, 2.3, -2.9, 3.9, -12);
      fence(b, { x0: -11, z0: -5.4, x1: 2.2, z1: -5.4, h: 2.1 });
      fence(b, { x0: 4, z0: -5.4, x1: 11, z1: -5.4, h: 2.1 });
      openGate(b, { x: 4, z: -5.4, h: 2.1, len: 1.7, yaw: -2.1 });
      gateSensor(b, { x: 3.1, z: -5.4, w: 1.8 });
      mat(b, { x: 5.7, z: -10.2 });
      tree(b, { x: -5.5, z: -9, kind: 'round', s: 1.05 });
      ornament(b, 'gnome', { x: 1.4, z: -8.2 });
      bed(b, -4.5, -13, -1.8, -12.1);
      bin(b, { x: -7.6, z: -3.5 });
    },
  },
  {
    id: 'bank', route: 'maple', title: 'Bank Shot', parcel: 'pizza', preview: 1.0, from: 'Ted (behind the hedge)',
    note: 'Hedge is 3m tall and I am not trimming it. Try the neighbour\'s car. It is insured.',
    build(b) {
      street(b, -1);
      house(b, { x: -2, front: -13.5, w: 9, color: '#d7b7a1', roof: '#59372c', door: '#2e6b5a' });
      hedge(b, { x0: -11, z0: -6.6, x1: 2.4, z1: -6.6, h: 3, t: 1 });
      path(b, 3.2, -2.9, 7.4, -13.5, 'asphalt', 'drive');
      car(b, { x: 5.6, z: -8.2, yaw: 0.34, color: '#2f6fb0' });
      mat(b, { x: 0.7, z: -9.6, w: 2.2, d: 1.5 });
      tree(b, { x: 9, z: -4.6, kind: 'maple', s: 0.9 });
      ornament(b, 'flamingo', { x: -3.2, z: -9.4, yaw: 0.6 });
      bin(b, { x: 2.6, z: -3.6 });
    },
  },
  {
    id: 'dog', route: 'maple', title: 'Beware of Biscuit', parcel: 'box', preview: 1.0, from: 'Biscuit\'s Mum',
    note: 'Biscuit is friendly. Biscuit also eats parcels. Land it when he is not looking.',
    build(b) {
      street(b);
      house(b, { front: -12, porch: true, floors: 1, color: '#efe0c2', roof: '#3f6f5e', door: '#7d3c98' });
      fence(b, { x0: -11, z0: -3.3, x1: -1.1, z1: -3.3, h: 0.9 });
      fence(b, { x0: 1.1, z0: -3.3, x1: 11, z1: -3.3, h: 0.9 });
      path(b, -0.9, -3.3, 0.9, -10);
      mat(b, { x: 0, z: -8.6, w: 1.6 });
      dog(b, { x: -3.8, z: -8.2, dx: 7.6, period: 5.6, hold: 0.12 });
      tree(b, { x: -7, z: -5.6, kind: 'maple', s: 0.9 });
      ornament(b, 'gnome', { x: 5.5, z: -5.2, yaw: 0.8 });
      bed(b, 2.3, -11.6, 4.8, -10.8);
    },
  },
  {
    id: 'upstairs', route: 'maple', title: 'Upstairs, Please', parcel: 'vase', preview: 1.0, from: 'Mrs. Abernathy',
    note: 'Balcony only. My knees do not do stairs. It is a priceless vase. No pressure!',
    build(b) {
      street(b, 0.5);
      house(b, {
        front: -10.5, floors: 2, chimney: true, color: '#c9a58b', roof: '#5a3f33', door: '#2e5a88',
        wins: [{ x: -3.3, y: 1.75, w: 1.35, h: 1.45 }, { x: 3.3, y: 1.75, w: 1.35, h: 1.45 }, { x: -3.3, y: 4.65, w: 1.35, h: 1.45 }, { x: 3.3, y: 4.65, w: 1.35, h: 1.45 }],
      });
      balcony(b, { x: 0, y: 3.2, z: -9.85, w: 2.5, d: 1.3, style: 'wood' });
      mat(b, { x: 0, y: 3.2, z: -9.85, w: 1.8, d: 0.9, style: 'plain' });
      path(b, -0.9, -2.9, 0.9, -10.5);
      tree(b, { x: 6.4, z: -6.4, kind: 'maple' });
      car(b, { x: -5, z: -6.8, yaw: 1.57, color: '#d2b13c', kind: 'hatch' });
      bed(b, -4.8, -10.4, -1.6, -9.6);
    },
  },
];

const brownstone: Delivery[] = [
  {
    id: 'stoop', route: 'brownstone', title: 'The Stoop', parcel: 'box', preview: 1.0, from: 'Apt 2B',
    note: 'Top of the stoop. Not the steps. Last guy said "close enough". He is gone now.',
    build(b) {
      street(b, -0.5);
      paving(b, -8);
      rowhouse(b, { x: 0, front: -8, stoop: 1.5, color: '#9a5340' });
      rowhouse(b, { x: -7, front: -8, floors: 4, color: '#7c4a3a', door: '#3a2e5f', stoop: 1.5 });
      rowhouse(b, { x: 7, front: -8, floors: 3, color: '#b0654a', door: '#7a2e2e', stoop: 1.5 });
      mat(b, { x: 0, y: 1.5, z: -7.2, w: 1.5, d: 1 });
      tree(b, { x: 4.2, z: -3.3, kind: 'round', s: 0.75 });
      bin(b, { x: -3.2, z: -3.4, color: '#444b52' });
      bin(b, { x: -2.3, z: -3.4, color: '#3c6e91' });
      b.lotX = [-3.5, 3.5];
    },
  },
  {
    id: 'alley', route: 'brownstone', title: 'Round the Corner', parcel: 'ball', preview: 0.9, from: 'Gym (rear entrance)',
    note: 'Ball goes under the pergola. Throwing over it won\'t work. Use the wall, like a pro.',
    build(b) {
      street(b, -2.2);
      paving(b, -26);
      rowhouse(b, { x: -13.4, front: -5.6, w: 12, d: 12, floors: 3, color: '#8a4d3b', noDoor: true });
      rowhouse(b, { x: 9.6, front: -5.6, w: 9, d: 14, floors: 3, color: '#6f4436', noDoor: true });
      fence(b, { x0: -7.4, z0: -5.6, x1: -0.6, z1: -5.6, h: 1.7, style: 'wall' });
      fence(b, { x0: -7.4, z0: -15.4, x1: 5.1, z1: -15.4, h: 2.2, style: 'wall' });
      pergola(b, { x: -3.9, z: -10.2, w: 6.2, d: 5.4 });
      mat(b, { x: -4.4, z: -10.4, w: 2.8, d: 2.2 });
      gateSensor(b, { x: 2.3, z: -5.6, w: 5.4, h: 6 });
      bin(b, { x: 4.4, z: -14.4, color: '#444b52' });
      ornament(b, 'cone', { x: 1.4, z: -7.4 });
      b.focus.push([-7, 0, -14], [5, 0, -14]);
      b.lotX = [-14, 14];
    },
  },
  {
    id: 'cafe', route: 'brownstone', title: 'Table for One', parcel: 'box', preview: 0.9, from: 'Luigi\'s Café',
    note: 'Bring it to table 4, under the awning edge. Roll it down the awning for style points.',
    build(b) {
      street(b, 1);
      paving(b, -9);
      rowhouse(b, { x: 0, front: -9, w: 10, floors: 3, color: '#c9b08a', pattern: 'stucco', door: '#274c3a' });
      rowhouse(b, { x: -9, front: -9, w: 8, floors: 4, color: '#8c4f3d' });
      rowhouse(b, { x: 9, front: -9, w: 8, floors: 3, color: '#a65d48' });
      path(b, -5, -2.9, 5, -9, 'tile', 'plaza');
      awning(b, { x: -1.4, y: 2.95, z: -7.65, w: 6.4, d: 2.7, tilt: 0.36, color: '#b23a30' });
      b.box({ x: -1.4, y: 0.47, z: -5.75, w: 0.14, h: 0.9, d: 0.14, mat: 'metal', tag: 'table' });
      b.box({ x: -1.4, y: 0.94, z: -5.75, w: 1.9, h: 0.08, d: 1.5, mat: 'wood', tag: 'table' });
      b.vis('cafeTable', { x: -1.4, z: -5.75 });
      mat(b, { x: -1.4, y: 0.98, z: -5.75, w: 1.7, d: 1.3, style: 'cloth' });
      b.vis('cafeTable', { x: 2.8, z: -6.2, small: true });
      b.box({ x: 2.8, y: 0.47, z: -6.2, w: 1.2, h: 0.9, d: 1.2, mat: 'wood', tag: 'table' });
      ornament(b, 'pot', { x: -4.2, z: -6.2 });
      b.lotX = [-5.5, 5.5];
    },
  },
  {
    id: 'fire', route: 'brownstone', title: 'Fire Escape', parcel: 'vase', preview: 0.8, wind: [-1.2, 0], from: 'Sal, 3rd floor',
    note: 'Elevator is broke. Ma\'s urn goes on the fire escape. Windy up here. Do not spill Ma.',
    build(b) {
      street(b, -1);
      paving(b, -8.5);
      rowhouse(b, { x: 1, front: -8.5, w: 11, floors: 4, color: '#7e4636', door: '#35383f' });
      rowhouse(b, { x: -9, front: -8.5, w: 9, floors: 3, color: '#a96a4e' });
      balcony(b, { x: 2.2, y: 4.6, z: -7.85, w: 2.6, d: 1.3, style: 'iron', rail: 0.45 });
      balcony(b, { x: 2.2, y: 1.9, z: -7.85, w: 2.6, d: 1.3, style: 'iron', rail: 0.45 });
      mat(b, { x: 2.2, y: 4.6, z: -7.85, w: 2, d: 1, style: 'plain' });
      b.vis('ladder', { x: 2.2, z: -7.3, y0: 1.9, y1: 4.6 });
      car(b, { x: -5.6, z: -5.2, yaw: 1.57, color: '#6b7a4f', kind: 'hatch' });
      bin(b, { x: 5.6, z: -3.5, color: '#3c6e91' });
      tree(b, { x: 7, z: -5, kind: 'round', s: 0.8 });
      b.lotX = [-4.5, 7];
    },
  },
  {
    id: 'cradle', route: 'brownstone', title: 'Lunch for Dale', parcel: 'box', preview: 0.8, from: 'Dale\'s Wife',
    note: 'He has been cleaning those windows since Tuesday. Please land his lunch on the cradle.',
    build(b) {
      street(b, 0);
      paving(b, -11);
      rowhouse(b, { x: 0, front: -11, w: 16, floors: 4, color: '#8b5a48', door: '#2b3b5c' });
      const mover: Mover = { kind: 'slide', dx: 7, dz: 0, period: 8, hold: 0.06 };
      const y = 2.9, x = -3.5, z = -10.25;
      b.box({ x, y: y - 0.08, z, w: 3, h: 0.16, d: 1.3, mat: 'metal', tag: 'cradle', mover });
      b.box({ x, y: y + 0.25, z: z + 0.65, w: 3, h: 0.5, d: 0.06, mat: 'metal', tag: 'rail', mover });
      b.box({ x: x - 1.5, y: y + 0.25, z, w: 0.06, h: 0.5, d: 1.3, mat: 'metal', tag: 'rail', mover });
      b.box({ x: x + 1.5, y: y + 0.25, z, w: 0.06, h: 0.5, d: 1.3, mat: 'metal', tag: 'rail', mover });
      b.vis('cradle', { x, y, z, mover });
      mat(b, { x: x + 0.4, y, z, w: 1.9, d: 1, mover, style: 'plain' });
      ornament(b, 'cone', { x: -6, z: -5 });
      ornament(b, 'cone', { x: 6, z: -5 });
      b.focus.push([-5.5, 0, -9], [5.5, 0, -9]);
      b.lotX = [-8, 8];
    },
  },
];

const palm: Delivery[] = [
  {
    id: 'skip', route: 'palm', title: 'Skip It', parcel: 'pizza', preview: 0.9, from: 'Chad, Poolside',
    note: 'Pizza to the cabana. Skip it across the pool like a stone, bro. Do NOT sink it.',
    build(b) {
      street(b);
      villa(b, { front: -18, w: 15, color: '#f4eee2', accent: '#c78550' });
      pool(b, { x0: -5, z0: -5.6, x1: 5, z1: -12.2 });
      path(b, -6.1, -12, 6.1, -18, 'tile', 'deck');
      mat(b, { x: 0, z: -14.6, w: 2, d: 1.3, style: 'towel' });
      tree(b, { x: -7.8, z: -8.6, kind: 'palm' });
      tree(b, { x: 7.8, z: -5, kind: 'palm', s: 0.9 });
      ornament(b, 'flamingo', { x: 3.6, z: -13.6, yaw: 2.4 });
      ornament(b, 'flamingo', { x: -3.9, z: -13.9, yaw: 0.6 });
      b.vis('lounger', { x: -3, z: -15.9 });
      b.vis('lounger', { x: 3, z: -15.9 });
    },
  },
  {
    id: 'autogate', route: 'palm', title: 'Gated Community', parcel: 'pizza', preview: 0.8, from: 'The Estate Manager',
    note: 'The gate opens for nobody. It does, however, open. Be quick.',
    build(b) {
      street(b, 0);
      villa(b, { front: -16, w: 13, color: '#efe6d6', accent: '#7b8f8a', upper: { x: -2, w: 7, d: 6, h: 2.9 } });
      fence(b, { x0: -12, z0: -5.6, x1: -1.7, z1: -5.6, h: 3.4, style: 'wall' });
      fence(b, { x0: 1.7, z0: -5.6, x1: 12, z1: -5.6, h: 3.4, style: 'wall' });
      const mover: Mover = { kind: 'slide', dx: 3.2, dz: 0, period: 4.4, hold: 0.14 };
      b.box({ x: 0, y: 1.5, z: -5.6, w: 3.4, h: 3, d: 0.16, mat: 'metal', tag: 'fence', mover });
      b.vis('slideGate', { x: 0, z: -5.6, w: 3.4, h: 3, mover });
      gateSensor(b, { x: 0, z: -5.6, w: 3.3 });
      path(b, -1.7, -2.9, 1.7, -16, 'tile', 'drive');
      mat(b, { x: 0, z: -13.2 });
      tree(b, { x: -5, z: -10, kind: 'palm' });
      tree(b, { x: 5, z: -10, kind: 'palm' });
      b.vis('fountainPad', { x: 0, z: 0 });
    },
  },
  {
    id: 'boing', route: 'palm', title: 'The Glass Fence', parcel: 'box', preview: 0.8, from: 'Dr. & Dr. Whitlock',
    note: 'Our 5m glass fence is for privacy. Yes, we know. Use the kids\' trampoline.',
    build(b) {
      street(b, -0.5);
      villa(b, { front: -15, w: 13, color: '#f3efe6', accent: '#b5805a' });
      fence(b, { x0: -12, z0: -8.8, x1: 12, z1: -8.8, h: 5.2, style: 'glass' });
      trampoline(b, { x: 0.2, z: -6.1, r: 1.6 });
      path(b, -6, -8.9, 6, -15, 'tile', 'deck');
      mat(b, { x: 0.2, z: -11.3, w: 2, d: 1.4 });
      ornament(b, 'gnome', { x: -2.9, z: -5.2 });
      tree(b, { x: -8, z: -5.6, kind: 'palm' });
      tree(b, { x: 7.5, z: -5.2, kind: 'cypress' });
    },
  },
  {
    id: 'cart', route: 'palm', title: 'Moving Target', parcel: 'box', preview: 0.8, from: 'Gary, Hole 7',
    note: 'I am on the golf cart and I am not stopping. Basket on the back. Fore!',
    build(b) {
      street(b, 0);
      villa(b, { front: -17, w: 13, color: '#f1e9dc', accent: '#a7695a' });
      path(b, -11, -9.4, 11, -12.2, 'concrete', 'cartpath');
      const mover: Mover = { kind: 'slide', dx: 13, dz: 0, period: 9, hold: 0.05 };
      const x = -6.5, z = -10.8;
      b.box({ x, y: 0.5, z, w: 3, h: 0.5, d: 1.4, mat: 'metal', tag: 'cart', mover });
      b.box({ x: x + 0.6, y: 1.9, z, w: 1.7, h: 0.1, d: 1.4, mat: 'metal', tag: 'cart', mover });
      b.box({ x: x - 1.5, y: 1.05, z, w: 0.06, h: 0.6, d: 1.4, mat: 'metal', tag: 'rail', mover });
      b.box({ x: x - 0.45, y: 1.05, z: z + 0.7, w: 1.1, h: 0.6, d: 0.06, mat: 'metal', tag: 'rail', mover });
      b.box({ x: x - 0.45, y: 1.05, z: z - 0.7, w: 1.1, h: 0.6, d: 0.06, mat: 'metal', tag: 'rail', mover });
      b.vis('golfCart', { x, z, mover });
      mat(b, { x: x - 0.9, y: 0.76, z, w: 1.15, d: 1.32, mover, style: 'plain' });
      tree(b, { x: -8.4, z: -5.4, kind: 'palm' });
      tree(b, { x: 8.2, z: -6, kind: 'palm', s: 1.1 });
      ornament(b, 'flamingo', { x: 2.6, z: -6.6, yaw: 1.1 });
      b.focus.push([-8, 0, -10.8], [8, 0, -10.8]);
    },
  },
  {
    id: 'finale', route: 'palm', title: 'Penthouse Delivery', parcel: 'box', preview: 0.7, wind: [0.9, 0], from: 'Unit PH, c/o Butler',
    note: 'Rooftop terrace. The butler has declined the stairs. There is a trampoline, if you are brave.',
    build(b) {
      street(b, 0);
      villa(b, { front: -11, w: 15, h: 3.6, color: '#efe7da', accent: '#2f6f73', upper: { x: 3.8, w: 7, d: 6, h: 2.8 }, wins: [
        { x: -4.8, y: 1.7, w: 3.6, h: 2.4 }, { x: 4.6, y: 1.7, w: 3.8, h: 2.4 },
      ] });
      // The terrace is the villa roof left of the upper floor, with a low rail around it.
      b.box({ x: -3.2, y: 4.05, z: -10.2, w: 8.2, h: 0.5, d: 0.08, mat: 'metal', tag: 'rail' });
      b.vis('terraceRail', { x: -3.2, z: -10.2, y: 3.8, w: 8.2 });
      mat(b, { x: -3.2, y: 3.82, z: -12.2, w: 2.6, d: 1.9, style: 'towel' });
      trampoline(b, { x: -3.1, z: -5.6, r: 1.6 });
      fence(b, { x0: -12, z0: -3.2, x1: -1.8, z1: -3.2, h: 1, style: 'iron' });
      fence(b, { x0: 1.8, z0: -3.2, x1: 12, z1: -3.2, h: 1, style: 'iron' });
      gateSensor(b, { x: 0, z: -3.2, w: 3.4 });
      car(b, { x: 4.3, z: -7.1, yaw: 1.3, color: '#16161a', kind: 'suv' });
      path(b, 1, -3.2, 8.4, -9, 'tile', 'drive');
      tree(b, { x: -9.8, z: -6.2, kind: 'palm' });
      ornament(b, 'flamingo', { x: -1.4, z: -7.2, yaw: 2 });
    },
  },
];

export interface RouteInfo {
  id: RouteId;
  name: string;
  blurb: string;
  deliveries: Delivery[];
  /** Total stars needed to unlock. */
  unlock: number;
}

export const ROUTES: RouteInfo[] = [
  { id: 'maple', name: 'Maple Court', blurb: 'Lawns, gnomes and a dog named Biscuit.', deliveries: maple, unlock: 0 },
  { id: 'brownstone', name: 'Brownstone Row', blurb: 'Stoops, balconies and nowhere to park.', deliveries: brownstone, unlock: 2 },
  { id: 'palm', name: 'Palm Vista', blurb: 'Pools, gates and glass fences.', deliveries: palm, unlock: 4 },
];

export const ALL_DELIVERIES: Delivery[] = ROUTES.flatMap((r) => r.deliveries);

/** Best first-throw score per delivery, from `npm run solve -- --write`. */
export const PAR: Record<string, number> = par;

export function starThresholds(deliveries: Delivery[]): [number, number, number] {
  const best = deliveries.reduce((s, d) => s + (PAR[d.id] ?? 1200), 0);
  const round = (n: number) => Math.round(n / 50) * 50;
  return [round(best * 0.3), round(best * 0.52), round(best * 0.72)];
}
