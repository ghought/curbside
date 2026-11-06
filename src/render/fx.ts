// Particles, the aim preview, and the target marker.

import {
  AdditiveBlending, Color, CircleGeometry, ConeGeometry, DoubleSide, DynamicDrawUsage, Group, IcosahedronGeometry,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, RingGeometry, SphereGeometry,
} from 'three';

const dummy = new Object3D();
const col = new Color();
const MAX = 420;

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; spin: number;
  life: number; max: number;
  size: number; grow: number;
  g: number; drag: number;
  flat: boolean;
}

export type Burst = 'dust' | 'grassy' | 'cardboard' | 'glass' | 'water' | 'leaves' | 'confetti' | 'peanuts' | 'sparks' | 'feathers';

const PALETTES: Record<Burst, string[]> = {
  dust: ['#efe6d2', '#dcd2bc', '#f7f1e2'],
  grassy: ['#7fae4a', '#6b9a3e', '#c6b98a', '#efe6d2'],
  cardboard: ['#cfa56e', '#b48a52', '#e2c08c', '#f6efe0'],
  glass: ['#d9f1fa', '#a9dcec', '#ffffff', '#86c3d9'],
  water: ['#d4f6fa', '#8fe3ee', '#ffffff', '#4fc2dc'],
  leaves: ['#6f9e3d', '#558a3a', '#d9832e', '#e5a93b'],
  confetti: ['#e4572e', '#f2c14e', '#2f9fb5', '#f6f2ea', '#76b041', '#c77dff'],
  peanuts: ['#fbf7ec', '#f1ead8', '#e8dfca'],
  sparks: ['#ffd98a', '#ffb23e', '#fff3cf'],
  feathers: ['#f7a3b8', '#f47f9f', '#ffffff'],
};

export class Particles {
  mesh: InstancedMesh;
  private items: P[] = [];
  private colors: Color[] = [];

  constructor() {
    const geo = new IcosahedronGeometry(1, 0);
    const mat = new MeshStandardMaterial({ roughness: 0.75, metalness: 0, flatShading: true });
    this.mesh = new InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, col.set('#fff'));
  }

  burst(kind: Burst, x: number, y: number, z: number, n: number, power = 1, nx = 0, ny = 1, nz = 0) {
    const pal = PALETTES[kind];
    for (let i = 0; i < n; i++) {
      if (this.items.length >= MAX) {
        this.items.shift();
        this.colors.shift();
      }
      const a = Math.random() * 6.283;
      const spread = Math.random();
      const puff = kind === 'dust';
      const sp = (puff ? 1.4 : 3.4) * power * (0.4 + Math.random());
      const up = puff ? 0.7 : kind === 'confetti' ? 5.5 : 3.4;
      const p: P = {
        x, y, z,
        vx: Math.cos(a) * sp * spread + nx * sp, vy: up * power * (0.3 + Math.random()) + ny * sp * 0.4, vz: Math.sin(a) * sp * spread + nz * sp,
        rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 16,
        life: 0, max: puff ? 0.45 + Math.random() * 0.4 : 0.8 + Math.random() * 0.9,
        size: puff ? 0.14 + Math.random() * 0.16 : kind === 'peanuts' ? 0.08 : kind === 'confetti' ? 0.07 : 0.055 + Math.random() * 0.05,
        grow: puff ? 2.4 : 0,
        g: puff ? -0.6 : kind === 'confetti' || kind === 'feathers' || kind === 'leaves' ? 4.5 : 13,
        drag: puff ? 3 : kind === 'confetti' || kind === 'feathers' || kind === 'leaves' ? 1.6 : 0.2,
        flat: kind === 'confetti' || kind === 'leaves' || kind === 'feathers',
      };
      this.items.push(p);
      this.colors.push(new Color(pal[(Math.random() * pal.length) | 0]));
    }
  }

  /** One small mote left hanging behind a flying parcel. */
  streak(x: number, y: number, z: number) {
    if (this.items.length >= MAX) return;
    this.items.push({
      x, y, z, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, life: 0, max: 0.34, size: 0.075, grow: 0, g: 0, drag: 0, flat: false,
    });
    this.colors.push(new Color('#fff6e2'));
  }

  update(dt: number) {
    let n = 0;
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy -= p.g * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.04) {
        p.y = 0.04;
        p.vy = Math.abs(p.vy) * 0.3;
        p.vx *= 0.6; p.vz *= 0.6;
      }
      p.rx += p.spin * dt;
      const u = p.life / p.max;
      const s = p.size * (1 + p.grow * u) * Math.min(1, (1 - u) * 3);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, 0);
      dummy.scale.set(s, p.flat ? s * 0.2 : s, s);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n, dummy.matrix);
      this.mesh.setColorAt(n, this.colors[i]);
      if (n !== i) {
        items[n] = p;
        this.colors[n] = this.colors[i];
      }
      n++;
    }
    items.length = n;
    this.colors.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const zero = new Matrix4().makeScale(0, 0, 0);

/** The dotted arc, its shadow on the ground, the impact ring, and the ghost of the last throw. */
export class AimLine {
  group = new Group();
  private dots: InstancedMesh;
  private shadow: InstancedMesh;
  private ghost: InstancedMesh;
  private ring: Mesh;
  private N = 72;
  private ghostPts: number[] = [];

  constructor() {
    const dotMat = new MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, toneMapped: false });
    this.dots = new InstancedMesh(new SphereGeometry(1, 8, 6), dotMat, this.N);
    this.dots.renderOrder = 20;
    this.dots.frustumCulled = false;
    const shMat = new MeshBasicMaterial({ color: '#10141c', transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.shadow = new InstancedMesh(new CircleGeometry(1, 10).rotateX(-Math.PI / 2), shMat, this.N);
    this.shadow.renderOrder = 19;
    this.shadow.frustumCulled = false;
    const ghMat = new MeshBasicMaterial({ color: '#ffd166', depthTest: false, transparent: true, opacity: 0.55, toneMapped: false });
    this.ghost = new InstancedMesh(new SphereGeometry(1, 6, 5), ghMat, 96);
    this.ghost.renderOrder = 18;
    this.ghost.frustumCulled = false;
    this.ring = new Mesh(
      new RingGeometry(0.34, 0.46, 28).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, side: DoubleSide, toneMapped: false }),
    );
    this.ring.renderOrder = 21;
    this.group.add(this.ghost, this.shadow, this.dots, this.ring);
    this.hide();
    this.setGhost([]);
  }

  hide() {
    this.dots.visible = this.shadow.visible = this.ring.visible = false;
  }

  /** Sized to stay readable however far the camera has to pull back. */
  show(pts: number[], hit: number, hitPos: [number, number, number] | null, scale: number, tint: string) {
    const count = Math.min(this.N, pts.length / 3);
    const stride = Math.max(1, Math.floor(pts.length / 3 / this.N));
    this.dots.visible = this.shadow.visible = true;
    (this.dots.material as MeshBasicMaterial).color.set(tint);
    for (let i = 0; i < this.N; i++) {
      if (i >= count) {
        this.dots.setMatrixAt(i, zero);
        this.shadow.setMatrixAt(i, zero);
        continue;
      }
      const j = i * stride * 3;
      const u = i / Math.max(1, count - 1);
      const after = hit >= 0 && i * stride > hit;
      const s = (i % 2 ? 0.055 : 0.085) * scale * (1 - u * 0.5) * (after ? 0.7 : 1);
      dummy.position.set(pts[j], pts[j + 1], pts[j + 2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      this.dots.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 0.05;
      dummy.scale.setScalar(s * 0.9);
      dummy.updateMatrix();
      this.shadow.setMatrixAt(i, dummy.matrix);
    }
    this.dots.instanceMatrix.needsUpdate = true;
    this.shadow.instanceMatrix.needsUpdate = true;
    if (hitPos) {
      this.ring.visible = true;
      this.ring.position.set(hitPos[0], hitPos[1] + 0.08, hitPos[2]);
      this.ring.scale.setScalar(scale * 0.9);
    } else this.ring.visible = false;
  }

  setGhost(pts: number[]) {
    this.ghostPts = pts;
    const n = pts.length / 3;
    const stride = Math.max(1, Math.ceil(n / 96));
    let i = 0;
    for (let p = 0; p < n && i < 96; p += stride) {
      dummy.position.set(pts[p * 3], pts[p * 3 + 1], pts[p * 3 + 2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.05);
      dummy.updateMatrix();
      this.ghost.setMatrixAt(i++, dummy.matrix);
    }
    for (; i < 96; i++) this.ghost.setMatrixAt(i, zero);
    this.ghost.instanceMatrix.needsUpdate = true;
    this.ghost.visible = n > 0;
  }

  get hasGhost() {
    return this.ghostPts.length > 0;
  }

  showGhost(on: boolean) {
    this.ghost.visible = on && this.hasGhost;
  }
}

export class TargetMarker {
  group = new Group();
  private pin: Mesh;
  private ring: Mesh;
  private ring2: Mesh;

  constructor() {
    const mat = new MeshBasicMaterial({ color: '#ffd166', depthTest: false, transparent: true, toneMapped: false });
    this.pin = new Mesh(new ConeGeometry(0.36, 0.72, 4).rotateX(Math.PI), mat);
    this.pin.renderOrder = 16;
    const ringMat = new MeshBasicMaterial({ color: '#fff3cf', transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    this.ring = new Mesh(new RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2), ringMat);
    this.ring2 = new Mesh(new RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2), ringMat.clone());
    this.group.add(this.pin, this.ring, this.ring2);
  }

  place(x: number, y: number, z: number, radius: number, t: number, scale: number) {
    this.group.position.set(x, y, z);
    const bob = Math.sin(t * 3) * 0.14;
    this.pin.position.y = 1.5 * scale + bob;
    this.pin.rotation.y = t * 1.4;
    this.pin.scale.setScalar(scale);
    const u = (t * 0.7) % 1;
    this.ring.position.y = this.ring2.position.y = 0.09;
    this.ring.scale.setScalar(radius * (1 + u * 0.5));
    (this.ring.material as MeshBasicMaterial).opacity = (1 - u) * 0.9;
    this.ring2.scale.setScalar(radius);
    (this.ring2.material as MeshBasicMaterial).opacity = 0.5;
  }
}
