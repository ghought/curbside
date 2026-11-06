// Owns the WebGL context: lights, camera framing, the miniature-look post pass, and the
// conversion from screen drags to world aim.

import {
  ACESFilmicToneMapping, BackSide, CanvasTexture, DirectionalLight, Fog, Group, HalfFloatType, HemisphereLight, Mesh,
  type Material, MeshBasicMaterial, MeshStandardMaterial, NoToneMapping, OrthographicCamera, PCFShadowMap, PMREMGenerator, PerspectiveCamera, PlaneGeometry,
  Raycaster, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer,
} from 'three';
import type { BuiltLevel, RouteId } from '../levels/routes';
import { AimLine, Particles, TargetMarker } from './fx';
import { GROUND, paintGround } from './ground';
import { groundMaterial, gloss, leaf, matte, shared } from './materials';
import { buildProps, makeCourier, type Courier, type LevelProps } from './props';
import { THEMES, type Theme } from './themes';

const AZIMUTH = 0.4;
const PITCH = (47 * Math.PI) / 180;
const FOV = 24;

const POST_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform vec2 uTexel;
  uniform float uBlur;

  vec3 aces(vec3 x) {
    x *= 0.72;
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  void main() {
    // Tilt-shift: sharp where the action is, soft at the far top and near bottom.
    float band = abs(vUv.y - 0.52);
    float amt = smoothstep(0.3, 0.52, band) * uBlur;
    vec3 c = texture2D(tScene, vUv).rgb;
    if (amt > 0.02) {
      vec3 sum = c;
      float a = 2.399;
      for (int i = 1; i <= 8; i++) {
        float r = sqrt(float(i) / 8.0) * amt;
        vec2 o = vec2(cos(a * float(i)), sin(a * float(i))) * r * uTexel;
        sum += texture2D(tScene, vUv + o).rgb;
      }
      c = sum / 9.0;
    }
    vec2 q = vUv - 0.5;
    float vig = 1.0 - dot(q, q) * 0.5;
    c = aces(c) * vig;
    // Gentle lift and warmth, then sRGB.
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
    c = pow(c, vec3(1.0 / 2.2));
    gl_FragColor = vec4(c, 1.0);
  }`;

export class Stage {
  renderer: WebGLRenderer;
  scene = new Scene();
  camera = new PerspectiveCamera(FOV, 1, 5, 400);
  particles = new Particles();
  aim = new AimLine();
  marker = new TargetMarker();
  courier: Courier = makeCourier();
  props: LevelProps | null = null;
  theme: Theme = THEMES.maple;

  private sun = new DirectionalLight('#fff', 3);
  private hemi = new HemisphereLight('#fff', '#888', 1);
  private levelRoot = new Group();
  private ground: Mesh;
  private farGround: Mesh;
  private farRoad: Mesh;
  private farWalk: Mesh;
  private canvas2d = document.createElement('canvas');
  private sky: Mesh;
  private skyTex: CanvasTexture | null = null;
  private groundMat = groundMaterial();

  private post = true;
  private rt: WebGLRenderTarget | null = null;
  private postScene = new Scene();
  private postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: ShaderMaterial;

  width = 1;
  height = 1;
  private pixelRatio = 1;
  private maxRatio = 2;

  // Camera rig. `base` is the framing for aiming; `focus` eases toward whatever is interesting.
  private baseTarget = new Vector3(0, 0, -6);
  private baseDist = 60;
  private lookAt = new Vector3(0, 0, -6);
  private dist = 60;
  private wantTarget = new Vector3(0, 0, -6);
  private wantDist = 60;
  private dir = new Vector3(Math.sin(AZIMUTH) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(AZIMUTH) * Math.cos(PITCH));
  private shake = 0;
  private focusPts: Vector3[] = [];
  private frameTime = 16;
  private frameCount = 0;
  private slowFrames = 0;
  private ray = new Raycaster();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFShadowMap;
    r.shadowMap.autoUpdate = false;

    const s = this.scene;
    s.fog = new Fog('#ffffff', 50, 120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    s.add(this.sun, this.sun.target, this.hemi);

    const skyMat = new MeshBasicMaterial({ side: BackSide, fog: false, depthWrite: false });
    this.sky = new Mesh(new SphereGeometry(300, 16, 12), skyMat);
    s.add(this.sky);

    this.ground = new Mesh(new PlaneGeometry(GROUND.size, GROUND.size), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(GROUND.x0 + GROUND.size / 2, 0, GROUND.z0 + GROUND.size / 2);
    this.ground.receiveShadow = true;

    const flat = (color: string) => new MeshStandardMaterial({ color, roughness: 1 });
    this.farGround = new Mesh(new PlaneGeometry(500, 500), flat('#6a9a3e'));
    this.farGround.rotation.x = -Math.PI / 2;
    this.farGround.position.set(0, -0.03, -180);
    this.farRoad = new Mesh(new PlaneGeometry(500, 160), flat('#4b4d55'));
    this.farRoad.rotation.x = -Math.PI / 2;
    this.farRoad.position.set(0, -0.02, 79.65);
    this.farWalk = new Mesh(new PlaneGeometry(500, 2.55), flat('#c9c2b4'));
    this.farWalk.rotation.x = -Math.PI / 2;
    this.farWalk.position.set(0, -0.02, -1.625);
    s.add(this.farGround, this.farRoad, this.farWalk);
    s.add(this.levelRoot, this.particles.mesh, this.aim.group, this.marker.group, this.courier);

    this.postMat = new ShaderMaterial({
      uniforms: { tScene: { value: null }, uTexel: { value: new Vector2() }, uBlur: { value: 3.2 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);

    this.buildEnvironment();
  }

  /** A tiny gradient room, prefiltered once, so car paint and glass have something to reflect. */
  private buildEnvironment() {
    const env = new Scene();
    const c = document.createElement('canvas');
    c.width = 4; c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#9fd0ff');
    g.addColorStop(0.47, '#fff6e8');
    g.addColorStop(0.53, '#7a8a5a');
    g.addColorStop(1, '#3a3f30');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 128);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    env.add(new Mesh(new SphereGeometry(10, 16, 12), new MeshBasicMaterial({ map: tex, side: BackSide })));
    const pm = new PMREMGenerator(this.renderer);
    const rt = pm.fromScene(env, 0.02);
    gloss.envMap = rt.texture;
    gloss.envMapIntensity = 1.1;
    pm.dispose();
  }

  private applyTheme(t: Theme) {
    this.theme = t;
    const s = this.scene;
    (s.fog as Fog).color.set(t.fog);
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunI;
    this.hemi.color.set(t.hemiSky);
    this.hemi.groundColor.set(t.hemiGround);
    this.hemi.intensity = t.hemiI;
    shared.uGlow.value = t.glow;
    (this.farGround.material as MeshStandardMaterial).color.set(t.grass[1]);
    (this.farRoad.material as MeshStandardMaterial).color.set(t.asphalt);
    (this.farWalk.material as MeshStandardMaterial).color.set(t.concrete);

    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, t.skyTop);
    g.addColorStop(0.5, t.skyBottom);
    g.addColorStop(1, t.fog);
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 256);
    this.skyTex?.dispose();
    this.skyTex = new CanvasTexture(c);
    this.skyTex.colorSpace = SRGBColorSpace;
    const m = this.sky.material as MeshBasicMaterial;
    m.map = this.skyTex;
    m.needsUpdate = true;

    const sd = new Vector3(...t.sunDir).normalize();
    this.sun.position.copy(sd).multiplyScalar(60).add(new Vector3(0, 0, -9));
    this.sun.target.position.set(0, 0, -9);
    const cam = this.sun.shadow.camera;
    cam.left = -24; cam.right = 24; cam.top = 24; cam.bottom = -24;
    cam.near = 5; cam.far = 130;
    cam.updateProjectionMatrix();
  }

  private disposeLevel() {
    if (!this.props) return;
    this.props.root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || m === this.ground) return;
      m.geometry.dispose();
      const mat = m.material as Material;
      if (mat !== matte && mat !== gloss && mat !== leaf) mat.dispose();
    });
    this.levelRoot.remove(this.props.root);
    this.props = null;
  }

  setLevel(lvl: BuiltLevel, route: RouteId, seed: number) {
    this.disposeLevel();
    const t = THEMES[route];
    this.applyTheme(t);
    const originX = lvl.world.origin[0];
    this.props = buildProps(lvl.visuals, t, seed, originX, lvl.mirror);
    this.levelRoot.add(this.props.root);

    const old = this.groundMat.map;
    this.groundMat.map = paintGround(this.canvas2d, lvl.visuals, t, seed);
    this.groundMat.needsUpdate = true;
    old?.dispose();
    this.props.root.add(this.ground);

    this.focusPts = lvl.focus.map(([x, y, z]) => new Vector3(x, y, z));
    const tg = lvl.world.target;
    this.focusPts.push(new Vector3(tg.x, tg.y + 2.6, tg.z));
    this.focusPts.push(new Vector3(lvl.world.origin[0], 0, 0.8));
    this.frame();
    this.lookAt.copy(this.baseTarget);
    this.dist = this.baseDist;
    this.wantTarget.copy(this.baseTarget);
    this.wantDist = this.baseDist;
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.allocatePost();
    if (this.focusPts.length) {
      this.frame();
      this.wantTarget.copy(this.baseTarget);
      this.wantDist = this.baseDist;
    }
  }

  private allocatePost() {
    this.rt?.dispose();
    this.rt = null;
    if (!this.post) {
      this.renderer.toneMapping = ACESFilmicToneMapping;
      return;
    }
    this.renderer.toneMapping = NoToneMapping;
    const w = Math.round(this.width * this.pixelRatio), h = Math.round(this.height * this.pixelRatio);
    this.rt = new WebGLRenderTarget(w, h, { samples: 4, type: HalfFloatType, depthBuffer: true });
    this.postMat.uniforms.tScene.value = this.rt.texture;
    this.postMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  /** Fits the delivery between the HUD and the thumb zone, on any aspect ratio. */
  private frame() {
    const cam = this.camera;
    const portrait = this.width < this.height;
    const top = portrait ? 0.7 : 0.62, bottom = portrait ? -0.7 : -0.76, side = 0.9;
    const target = new Vector3();
    for (const p of this.focusPts) target.add(p);
    target.divideScalar(this.focusPts.length);
    const halfTan = Math.tan((FOV * Math.PI) / 360);
    // Never closer than a comfortable view of the lot.
    const minDist = 13 / (2 * halfTan * Math.min(cam.aspect, 1.6));
    let dist = 60;
    const right = new Vector3(), up = new Vector3(), v = new Vector3();
    for (let i = 0; i < 8; i++) {
      cam.position.copy(target).addScaledVector(this.dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of this.focusPts) {
        v.copy(p).project(cam);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      const k = Math.max((x1 - x0) / (side * 2), (y1 - y0) / (top - bottom));
      dist = Math.max(minDist, dist * k);
      right.setFromMatrixColumn(cam.matrixWorld, 0);
      up.setFromMatrixColumn(cam.matrixWorld, 1);
      const hh = halfTan * dist, hw = hh * cam.aspect;
      target.addScaledVector(right, ((x0 + x1) / 2) * hw);
      // Sit the curb at the bottom of the safe area. Spare height goes to the far end of
      // the lot, not to more road.
      target.addScaledVector(up, (y0 - bottom) * hh);
    }
    // Wide windows have room to spare, so step back and show more of the street.
    if (!portrait) dist *= 1.22;
    this.baseTarget.copy(target);
    this.baseDist = dist;
    const f = this.scene.fog as Fog;
    f.near = dist + 18;
    f.far = dist + 120;
    cam.near = Math.max(4, dist - 40);
    cam.far = dist + 260;
    cam.updateProjectionMatrix();
  }

  /** World units per pixel at the action, so markers keep a constant screen size. */
  get unitScale() {
    return Math.max(1, this.dist / 60);
  }

  focusOn(x: number, y: number, z: number, zoom: number, blend = 1) {
    this.wantTarget.set(
      this.baseTarget.x + (x - this.baseTarget.x) * blend,
      this.baseTarget.y + (y - this.baseTarget.y) * blend,
      this.baseTarget.z + (z - this.baseTarget.z) * blend,
    );
    this.wantDist = this.baseDist * zoom;
  }

  focusBase() {
    this.wantTarget.copy(this.baseTarget);
    this.wantDist = this.baseDist;
  }

  addShake(a: number) {
    this.shake = Math.min(0.6, this.shake + a);
  }

  private updateCamera(dt: number) {
    const k = 1 - Math.exp(-dt * 4.2);
    this.lookAt.lerp(this.wantTarget, k);
    this.dist += (this.wantDist - this.dist) * k;
    this.shake *= Math.exp(-dt * 7);
    const s = this.shake;
    const cam = this.camera;
    cam.position.copy(this.lookAt).addScaledVector(this.dir, this.dist);
    cam.position.x += (Math.random() - 0.5) * s;
    cam.position.y += (Math.random() - 0.5) * s;
    cam.lookAt(this.lookAt);
  }

  project(x: number, y: number, z: number): [number, number] {
    const v = new Vector3(x, y, z).project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.width, (-v.y * 0.5 + 0.5) * this.height];
  }

  /** Turns a screen-space direction at the throw origin into a world yaw. */
  screenDirToYaw(origin: [number, number, number], dx: number, dy: number): number {
    const [sx, sy] = this.project(origin[0], origin[1], origin[2]);
    const len = Math.hypot(dx, dy) || 1;
    const px = sx + (dx / len) * 90, py = sy + (dy / len) * 90;
    const ndc = new Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    const t = (origin[1] - o.y) / d.y;
    const wx = o.x + d.x * t, wz = o.z + d.z * t;
    return Math.atan2(wx - origin[0], -(wz - origin[2]));
  }

  render(dt: number, wall: number, levelSeconds: number) {
    shared.uTime.value = wall;
    this.particles.update(dt);
    this.props?.update(levelSeconds, wall, dt);
    this.updateCamera(dt);

    const r = this.renderer;
    // Under load, redraw shadows on every other frame. It's the cheapest quality to give up.
    this.frameCount++;
    r.shadowMap.needsUpdate = this.frameTime < 19 || this.frameCount % 2 === 0;
    if (this.post && this.rt) {
      r.setRenderTarget(this.rt);
      r.render(this.scene, this.camera);
      r.setRenderTarget(null);
      r.render(this.postScene, this.postCam);
    } else {
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
    }
    this.watchPerformance(dt);
  }

  /** Steps quality down rather than letting a slow phone stutter. */
  private watchPerformance(dt: number) {
    this.frameTime += (dt * 1000 - this.frameTime) * 0.05;
    if (this.frameTime > 26) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames < 90) return;
    this.slowFrames = 0;
    this.frameTime = 16;
    if (this.maxRatio > 1.5) this.maxRatio = 1.5;
    else if (this.post) this.post = false;
    else if (this.maxRatio > 1) this.maxRatio = 1;
    else {
      this.sun.shadow.mapSize.set(1024, 1024);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      return;
    }
    this.resize(this.width, this.height);
  }
}
