// Shared types for the simulation. Nothing in src/sim may touch the DOM or three.js:
// the solver in scripts/ runs the exact same code headlessly.

export const DT = 1 / 120;
export const GRAVITY = 13;

export interface Material {
  /** Restitution. */
  e: number;
  /** Friction. */
  mu: number;
  /** Impacts softer than this cause no damage. */
  soft: number;
  /** Minimum rebound speed, for springy things. */
  boost?: number;
}

export const MATS = {
  grass: { e: 0.22, mu: 0.62, soft: 7 },
  concrete: { e: 0.32, mu: 0.5, soft: 3 },
  asphalt: { e: 0.34, mu: 0.55, soft: 2.5 },
  mulch: { e: 0.08, mu: 0.8, soft: 9 },
  wood: { e: 0.28, mu: 0.55, soft: 4 },
  tile: { e: 0.3, mu: 0.42, soft: 3 },
  wall: { e: 0.42, mu: 0.32, soft: 2.5 },
  car: { e: 0.58, mu: 0.22, soft: 4 },
  metal: { e: 0.42, mu: 0.3, soft: 3 },
  hedge: { e: 0.08, mu: 0.9, soft: 11 },
  roof: { e: 0.16, mu: 0.8, soft: 4 },
  glass: { e: 0.2, mu: 0.2, soft: 1 },
  mat: { e: 0.05, mu: 1.05, soft: 9 },
  cushion: { e: 0.12, mu: 0.95, soft: 13 },
  awning: { e: 0.7, mu: 0.3, soft: 14, boost: 6 },
  trampoline: { e: 0.5, mu: 0.12, soft: 18, boost: 13.5 },
} satisfies Record<string, Material>;

export type MatName = keyof typeof MATS;

export type ParcelKind = 'box' | 'pizza' | 'ball' | 'vase' | 'weights';

export interface Parcel {
  kind: ParcelKind;
  label: string;
  hint: string;
  /** Launch elevation in degrees. Each parcel has a signature arc, so the gesture stays 2D. */
  elev: number;
  vmin: number;
  vmax: number;
  r: number;
  bounce: number;
  mu: number;
  fragile: number;
  drag: number;
  wind: number;
  /** How readily it skips off water. 0 means it just sinks. */
  skim: number;
}

export const PARCELS: Record<ParcelKind, Parcel> = {
  box: {
    kind: 'box', label: 'Cardboard box', hint: 'Medium arc. A reliable citizen.',
    elev: 44, vmin: 3.5, vmax: 18, r: 0.3, bounce: 1, mu: 1, fragile: 1, drag: 0.04, wind: 1, skim: 0,
  },
  pizza: {
    kind: 'pizza', label: 'Large pizza', hint: 'Flies flat and slides far. Skips on water.',
    elev: 14, vmin: 5, vmax: 23, r: 0.26, bounce: 0.75, mu: 0.42, fragile: 0.5, drag: 0.1, wind: 1.5, skim: 1,
  },
  ball: {
    kind: 'ball', label: 'Exercise ball', hint: 'Bounces like it has somewhere to be.',
    elev: 38, vmin: 3.5, vmax: 16, r: 0.36, bounce: 2.1, mu: 0.3, fragile: 0.15, drag: 0.09, wind: 1.3, skim: 0.5,
  },
  vase: {
    kind: 'vase', label: 'Fragile vase', hint: 'High lob. Please, be gentle.',
    elev: 60, vmin: 5, vmax: 19, r: 0.28, bounce: 0.6, mu: 1.1, fragile: 3, drag: 0.03, wind: 0.8, skim: 0,
  },
  weights: {
    kind: 'weights', label: 'Dumbbell set', hint: 'Low, heavy, and does not bounce. At all.',
    elev: 33, vmin: 3.5, vmax: 15, r: 0.3, bounce: 0.25, mu: 1.25, fragile: 0.1, drag: 0.01, wind: 0.15, skim: 0,
  },
};

export type Mover =
  | { kind: 'slide'; dx: number; dy?: number; dz: number; period: number; phase?: number; hold?: number }
  | { kind: 'swing'; a0: number; a1: number; period: number; phase?: number; hold?: number; px: number; pz: number };

export interface Pose {
  dx: number;
  dy: number;
  dz: number;
  dyaw: number;
  /** World pivot for dyaw. */
  px: number;
  pz: number;
}

export interface Collider {
  id: number;
  kind: 'box' | 'cyl' | 'sph';
  tag: string;
  mat: MatName;
  // Box: centre, half extents, and axis columns of the rotation.
  x: number; y: number; z: number;
  hx: number; hy: number; hz: number;
  yaw: number; pitch: number; roll: number;
  ax: [number, number, number, number, number, number, number, number, number];
  // Cylinder and sphere.
  r: number; y0: number; y1: number;
  mover?: Mover;
  // Current pose and velocity (kept up to date for movers).
  bx: number; by: number; bz: number; byaw: number;
  vx: number; vy: number; vz: number;
  // Broad phase.
  min: [number, number, number];
  max: [number, number, number];
}

export type ZoneEffect =
  | 'sensor' // Records that the parcel passed through.
  | 'water'
  | 'catch' // The dog.
  | 'stick' // Tree canopy, bins: the throw ends here.
  | 'road'
  | 'bonk' // The courier.
  | 'chimney'
  | 'knock'; // Lawn ornaments that fly when hit.

export interface Zone {
  id: number;
  tag: string;
  effect: ZoneEffect;
  shape: 'box' | 'cyl';
  x: number; y: number; z: number;
  hx: number; hy: number; hz: number;
  yaw: number;
  r: number;
  mover?: Mover;
  bx: number; by: number; bz: number;
  /** Key linking this to a visual, for knocked-over props. */
  key?: string;
}

export interface Surface {
  x0: number; z0: number; x1: number; z1: number;
  kind: MatName;
  tag: string;
}

export interface Target {
  x: number; y: number; z: number;
  w: number; d: number;
  yaw: number;
  mover?: Mover;
  bx: number; by: number; bz: number;
}

export interface World {
  colliders: Collider[];
  movers: (Collider | Zone)[];
  zones: Zone[];
  surfaces: Surface[];
  target: Target;
  origin: [number, number, number];
  wind: [number, number];
  /** Parcels resting past these x limits are in the neighbour's yard. */
  lotX: [number, number];
  /** Level clock in ticks. */
  clock: number;
}

export interface Body {
  parcel: Parcel;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  wx: number; wy: number; wz: number;
  tick: number;
  startClock: number;
  condition: number;
  restTicks: number;
  contactTick: number;
  supportTag: string;
  svx: number; svz: number;
  bounces: number;
  lastHitTag: string;
  lastHitTick: number;
  zonesHit: Set<number>;
  firstTouchTick: number;
  skips: number;
  /** Times it has been sprung, since each spring gives less than the last. */
  springs: number;
  done: Outcome | null;
}

export type SimEvent =
  | { type: 'hit'; tick: number; tag: string; mat: MatName; x: number; y: number; z: number; j: number; nx: number; ny: number; nz: number }
  | { type: 'zone'; tick: number; tag: string; key?: string; x: number; y: number; z: number }
  | { type: 'skip'; tick: number; x: number; y: number; z: number }
  | { type: 'jump'; tick: number; tag: string; x: number; y: number; z: number };

export interface Outcome {
  delivered: boolean;
  /** Why the throw ended, used to pick the failure joke and the effect. */
  reason: string;
  x: number; y: number; z: number;
  missBy: number;
  tick: number;
}

export interface ThrowInput {
  /** Radians. 0 points up-street at -z, positive turns toward +x. */
  yaw: number;
  /** 0 to 1. */
  power: number;
}
