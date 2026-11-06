// The game loop and state machine: menu -> aim -> fly -> result -> ... -> summary.

import { Euler, Group, Quaternion, Vector3 } from 'three';
import type { Audio } from './audio';
import { dailyRoute, localDate, type DailyRoute } from './levels/daily';
import { ROUTES, buildLevel, starThresholds, type BuiltLevel, type Delivery, type RouteId, type RouteInfo } from './levels/routes';
import { makeParcel, makeTruck } from './render/props';
import type { Stage } from './render/stage';
import { totalStars, writeSave, type Save } from './save';
import { makeBody, moverIsLive, previewThrow, quantize, setClock, step } from './sim/physics';
import { THROWS_PER_DELIVERY, detectTricks, scoreThrow, type ScoreBreakdown, type Trick } from './sim/scoring';
import { DT, PARCELS, type Body, type Outcome, type ParcelKind, type SimEvent, type ThrowInput } from './sim/types';
import type { UI } from './ui/ui';
import { failLine } from './ui/copy';

export interface Bridge {
  embedded: boolean;
  canonicalUrl(): string | null;
  playStarted(): void;
  roundEnded(p: { score: number }): void;
  score(s: number): void;
  error(m: string): void;
}

type Mode = 'menu' | 'aim' | 'fly' | 'settle' | 'result' | 'summary';

interface Stop {
  def: Delivery;
  wind?: [number, number];
  mirror?: boolean;
}

interface Run {
  kind: 'route' | 'daily';
  route: RouteInfo | null;
  daily: DailyRoute | null;
  stops: Stop[];
  index: number;
  throwIndex: number;
  total: number;
  /** 'd' delivered with a trick, 'o' delivered, 'x' failed. */
  pips: string[];
}

const REST_HEIGHT: Record<ParcelKind, number> = { box: 0.23, pizza: 0.06, ball: 0.37, vase: 0.33, weights: 0.21 };

export class Game {
  mode: Mode = 'menu';
  paused = false;
  run: Run | null = null;
  level: BuiltLevel | null = null;
  input: ThrowInput = { yaw: 0, power: 0 };

  private body: Body | null = null;
  private events: SimEvent[] = [];
  private seen = 0;
  private acc = 0;
  private timeScale = 1;
  private parcelMesh: Group | null = null;
  private parcelCache = new Map<ParcelKind, Group>();
  private prev = new Vector3();
  private cur = new Vector3();
  private spin = new Quaternion();
  private flatYaw = 0;
  private settle = 0;
  private squash = 0;
  private trail: number[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private wall = 0;
  private last = 0;
  private dragging = false;
  private keyAim = false;
  private anchor = [0, 0];
  private keys = new Set<string>();
  private armAnim = 0;
  private courierDown = 0;
  private menuDrift = 0;
  private truck = makeTruck();
  private trickCount = 0;
  private lastPower = 0;
  private rideX = 0;
  private rideY = 0;
  private rideZ = 0;

  constructor(
    public stage: Stage,
    public audio: Audio,
    public ui: UI,
    public save: Save,
    public bridge: Bridge,
  ) {
    this.stage.scene.add(this.truck);
    this.truck.visible = false;
  }

  // -------------------------------------------------------------------------------------
  // Flow

  start() {
    this.showMenu();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private loadStop(def: Delivery, wind: [number, number] | undefined, mirror: boolean | undefined, seed: number) {
    this.level = buildLevel(def, { wind, mirror });
    this.stage.setLevel(this.level, def.route, seed);
    this.timers = [];
    this.truck.visible = false;
    this.acc = 0;
    this.stage.aim.setGhost([]);
    this.stage.aim.hide();
    this.body = null;
    this.placeCourier();
  }

  private placeCourier() {
    const w = this.level!.world;
    const c = this.stage.courier;
    c.position.set(w.origin[0], 0, w.origin[2]);
    c.rotation.set(0, Math.PI, 0);
    this.courierDown = 0;
    this.armAnim = 0;
  }

  showMenu() {
    this.mode = 'menu';
    this.run = null;
    this.stage.courier.visible = true;
    this.stage.marker.group.visible = false;
    this.loadStop(ROUTES[0].deliveries[0], undefined, false, 1);
    this.hideParcel();
    this.stage.focusBase();
    this.ui.showMenu(this.menuData());
  }

  menuData() {
    const stars = totalStars(this.save);
    const today = localDate();
    const daily = dailyRoute(today);
    return {
      routes: ROUTES.map((r) => ({
        id: r.id, name: r.name, blurb: r.blurb, need: r.unlock, unlocked: stars >= r.unlock,
        best: this.save.routes[r.id]?.best ?? 0, stars: this.save.routes[r.id]?.stars ?? 0,
      })),
      daily: {
        number: daily.number,
        best: this.save.daily[today]?.best ?? 0,
        stars: this.save.daily[today]?.stars ?? 0,
        streak: this.save.streak,
      },
      totalStars: stars,
    };
  }

  startRoute(id: RouteId) {
    const route = ROUTES.find((r) => r.id === id)!;
    this.beginRun({ kind: 'route', route, daily: null, stops: route.deliveries.map((def) => ({ def })), index: 0, throwIndex: 0, total: 0, pips: [] });
  }

  startDaily() {
    const daily = dailyRoute(localDate());
    this.beginRun({ kind: 'daily', route: null, daily, stops: daily.stops, index: 0, throwIndex: 0, total: 0, pips: [] });
  }

  private beginRun(run: Run) {
    this.run = run;
    this.ui.hideMenu();
    this.ui.showHud(true);
    this.bridge.playStarted();
    this.enterStop();
  }

  restartRun() {
    if (!this.run) return;
    this.run.index = 0;
    this.run.throwIndex = 0;
    this.run.total = 0;
    this.run.pips = [];
    this.ui.hideOverlays();
    this.setPaused(false);
    this.bridge.playStarted();
    this.enterStop();
  }

  private enterStop() {
    const run = this.run!;
    const stop = run.stops[run.index];
    run.throwIndex = 0;
    this.loadStop(stop.def, stop.wind, stop.mirror, 11 + run.index + stop.def.id.length * 3);
    this.stage.focusBase();
    this.ui.showNote({
      title: stop.def.title,
      note: stop.def.note,
      from: stop.def.from,
      parcel: PARCELS[stop.def.parcel],
      stop: run.index + 1,
      stops: run.stops.length,
    });
    this.ui.showTutorial(!this.save.seenTutorial);
    this.beginAim();
  }

  private beginAim() {
    const lvl = this.level!;
    this.mode = 'aim';
    this.dragging = false;
    this.keyAim = false;
    this.timeScale = 1;
    this.lastPower = 0;
    this.stage.props?.resetKnocks();
    this.stage.marker.group.visible = true;
    this.stage.aim.hide();
    this.stage.aim.showGhost(true);
    this.body = null;
    this.placeCourier();
    this.stage.focusBase();
    this.useParcel(lvl.def.parcel);
    this.updateHud();
  }

  private updateHud() {
    const run = this.run!;
    const lvl = this.level!;
    this.ui.updateHud({
      stop: run.index + 1,
      stops: run.stops.length,
      pips: run.pips,
      throwsLeft: THROWS_PER_DELIVERY - run.throwIndex,
      score: run.total,
      wind: lvl.world.wind,
      name: run.kind === 'daily' ? `Daily #${run.daily!.number}` : run.route!.name,
    });
  }

  private useParcel(kind: ParcelKind) {
    this.hideParcel();
    let m = this.parcelCache.get(kind);
    if (!m) {
      m = makeParcel(kind);
      this.parcelCache.set(kind, m);
    }
    this.stage.scene.add(m);
    m.visible = true;
    m.scale.setScalar(1);
    m.rotation.set(0, 0, 0);
    this.parcelMesh = m;
    this.spin.identity();
    this.settle = 0;
  }

  private hideParcel() {
    if (this.parcelMesh) {
      this.parcelMesh.removeFromParent();
      this.parcelMesh.visible = false;
    }
    this.parcelMesh = null;
  }

  // -------------------------------------------------------------------------------------
  // Input

  pointerDown(x: number, y: number) {
    this.audio.unlock();
    if (this.paused) return;
    if (this.mode === 'result') {
      this.advance();
      return;
    }
    if (this.mode !== 'aim') return;
    this.dragging = true;
    this.keyAim = false;
    this.anchor = [x, y];
    this.input = { yaw: 0, power: 0 };
    this.ui.collapseNote();
    this.ui.showAim(x, y, x, y, 0);
  }

  pointerMove(x: number, y: number) {
    if (!this.dragging || this.paused) return;
    const dx = x - this.anchor[0], dy = y - this.anchor[1];
    const len = Math.hypot(dx, dy);
    const maxDrag = this.maxDrag();
    const power = Math.min(1, Math.max(0, (len - 12) / maxDrag));
    if (len > 12) {
      const yaw = this.stage.screenDirToYaw(this.level!.world.origin, -dx, -dy);
      this.input = quantize({ yaw, power });
    } else {
      this.input = { yaw: this.input.yaw, power: 0 };
    }
    this.ui.showAim(this.anchor[0], this.anchor[1], x, y, power);
    if (power > 0 && Math.abs(power - this.lastPower) > 0.06) {
      this.audio.stretch(power);
      this.lastPower = power;
    }
    this.ui.showTutorial(false);
  }

  pointerUp() {
    if (!this.dragging) return;
    this.dragging = false;
    this.ui.hideAim();
    if (this.paused || this.mode !== 'aim') return;
    if (this.input.power < 0.04) {
      this.stage.aim.hide();
      this.input.power = 0;
      return;
    }
    this.release();
  }

  private maxDrag() {
    const { width, height } = this.stage;
    return Math.max(110, Math.min(260, Math.min(height * 0.28, width * 0.62)));
  }

  keyDown(code: string) {
    this.audio.unlock();
    this.keys.add(code);
    if (code === 'KeyP' || code === 'Escape') {
      if (this.run && this.mode !== 'summary') this.togglePause();
      return;
    }
    if (code === 'KeyM') {
      this.toggleMute();
      return;
    }
    if (this.paused) return;
    if (code === 'Space' || code === 'Enter') {
      if (this.mode === 'result') {
        this.advance();
      } else if (this.mode === 'aim') {
        if (this.keyAim && this.input.power >= 0.04) this.release();
        else this.startKeyAim();
      }
    }
    if (this.mode === 'aim' && !this.keyAim && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(code)) {
      this.startKeyAim();
    }
  }

  keyUp(code: string) {
    this.keys.delete(code);
  }

  private startKeyAim() {
    const w = this.level!.world;
    this.keyAim = true;
    this.ui.collapseNote();
    this.ui.showTutorial(false);
    this.input = quantize({ yaw: Math.atan2(w.target.x - w.origin[0], -(w.target.z - w.origin[2])), power: 0.45 });
  }

  private keyboardAim(dt: number) {
    if (!this.keyAim) return;
    const k = this.keys;
    const left = k.has('ArrowLeft') || k.has('KeyA'), right = k.has('ArrowRight') || k.has('KeyD');
    const up = k.has('ArrowUp') || k.has('KeyW'), down = k.has('ArrowDown') || k.has('KeyS');
    const fine = k.has('ShiftLeft') || k.has('ShiftRight') ? 0.3 : 1;
    let { yaw, power } = this.input;
    if (left) yaw -= 0.42 * dt * fine;
    if (right) yaw += 0.42 * dt * fine;
    if (up) power += 0.34 * dt * fine;
    if (down) power -= 0.34 * dt * fine;
    this.input = { yaw, power: Math.min(1, Math.max(0.04, power)) };
  }

  // -------------------------------------------------------------------------------------
  // Throwing

  private release() {
    const lvl = this.level!;
    const parcel = PARCELS[lvl.def.parcel];
    this.input = quantize(this.input);
    this.body = makeBody(lvl.world, parcel, this.input);
    this.events = [];
    this.seen = 0;
    this.trail = [];
    this.trickCount = 0;
    this.prev.set(this.body.x, this.body.y, this.body.z);
    this.cur.copy(this.prev);
    this.mode = 'fly';
    this.keyAim = false;
    this.stage.aim.hide();
    this.stage.aim.showGhost(false);
    this.armAnim = 1;
    this.settle = 0;
    this.audio.whoosh(this.input.power);
    this.ui.collapseNote();
    if (!this.save.seenTutorial) {
      this.save.seenTutorial = true;
      writeSave(this.save);
    }
  }

  private tick() {
    const lvl = this.level;
    if (!lvl) return;
    const w = lvl.world;
    w.clock++;
    if (w.movers.length || moverIsLive(w)) setClock(w, w.clock);
    const b = this.body;
    if (this.mode === 'fly' && b) {
      this.prev.copy(this.cur);
      step(w, b, this.events);
      this.cur.set(b.x, b.y, b.z);
      if (b.tick % 3 === 0) this.trail.push(b.x, b.y, b.z);
      if (b.tick % 7 === 0 && !b.done && b.tick - b.contactTick > 8) this.stage.particles.streak(b.x, b.y, b.z);
      this.consumeEvents();
      if (b.done) this.finishThrow(b.done);
    }
  }

  private consumeEvents() {
    const stage = this.stage;
    const b = this.body!;
    for (; this.seen < this.events.length; this.seen++) {
      const e = this.events[this.seen];
      if (e.type === 'hit') {
        this.audio.thud(e.j, e.mat);
        const hard = Math.min(1, e.j / 16);
        this.squash = Math.max(this.squash, 0.5 * hard + 0.1);
        stage.addShake(hard * 0.16);
        const grassy = e.mat === 'grass' || e.mat === 'mulch';
        stage.particles.burst(grassy ? 'grassy' : 'dust', e.x, e.y, e.z, 4 + Math.round(hard * 8), 0.7 + hard);
        if (hard > 0.3) stage.particles.burst('cardboard', e.x, e.y, e.z, Math.round(hard * 6), 0.9, e.nx, e.ny, e.nz);
        if (e.tag === 'hedge') stage.particles.burst('leaves', e.x, e.y, e.z, 10, 1);
        if (e.mat === 'car' && e.j > 5 && stage.props?.alarmNear(e.x, e.z, this.wall)) this.audio.alarm();
        if (e.tag === 'car' || e.mat === 'metal') stage.particles.burst('sparks', e.x, e.y, e.z, 5, 1, e.nx, e.ny, e.nz);
      } else if (e.type === 'skip') {
        this.audio.skip();
        stage.particles.burst('water', e.x, 0.1, e.z, 14, 1);
        this.trickPop('Skip!', e.x, e.y, e.z);
      } else if (e.type === 'zone') {
        if (e.key) {
          stage.props?.knock(e.key, b.vx, b.vz);
          this.audio.thud(7, 'wood');
          stage.particles.burst(e.tag === 'flamingo' ? 'feathers' : 'dust', e.x, e.y, e.z, 12, 1);
        }
      }
    }
    // Pop trick names the moment they're earned, not at the end.
    const live = detectTricks(b, this.events, { delivered: false, reason: '', x: 0, y: 0, z: 0, missBy: 0, tick: b.tick });
    for (; this.trickCount < live.length; this.trickCount++) {
      const t = live[this.trickCount];
      if (t.name.startsWith('Stone Skipper')) continue;
      this.audio.trick(this.trickCount);
      this.trickPop(t.name, b.x, b.y, b.z);
    }
  }

  private trickPop(name: string, x: number, y: number, z: number) {
    const [sx, sy] = this.stage.project(x, y, z);
    this.ui.trickPop(name, sx, sy);
  }

  private finishThrow(o: Outcome) {
    const lvl = this.level!;
    const run = this.run!;
    const b = this.body!;
    this.mode = 'settle';
    const t = lvl.world.target;
    this.rideX = o.x - t.x;
    this.rideY = t.y;
    this.rideZ = o.z - t.z;
    const score = scoreThrow(lvl.world, b, this.events, o, run.throwIndex);
    this.stage.aim.setGhost(this.trail);
    this.playOutcome(o);
    const wait = o.delivered ? 0.75 : o.reason === 'road' ? 1.5 : o.reason === 'dog' ? 1.7 : 0.9;
    this.after(wait, () => this.showResult(o, score));
  }

  /** The funny part. */
  private playOutcome(o: Outcome) {
    const s = this.stage;
    const a = this.audio;
    const p = this.parcelMesh;
    s.focusOn(o.x, o.y, o.z, o.delivered ? 0.74 : 0.82, 0.8);
    this.timeScale = 1;
    if (o.delivered) {
      s.particles.burst('confetti', o.x, o.y + 0.5, o.z, 42, 1);
      a.delivered();
      this.settle = 0.001;
      return;
    }
    switch (o.reason) {
      case 'pool':
        a.splash();
        s.particles.burst('water', o.x, 0.1, o.z, 46, 1.5);
        s.addShake(0.2);
        this.after(0.2, () => { if (p) p.visible = false; });
        break;
      case 'window':
        a.glass();
        s.particles.burst('glass', o.x, o.y, o.z, 56, 1.5, 0, 0, 1);
        s.addShake(0.4);
        if (p) p.visible = false;
        break;
      case 'crushed':
        a.squish();
        s.particles.burst('peanuts', o.x, o.y, o.z, 60, 1.6);
        s.particles.burst('cardboard', o.x, o.y, o.z, 26, 1.4);
        s.addShake(0.35);
        if (p) p.visible = false;
        break;
      case 'tree':
        a.rustle();
        s.particles.burst('leaves', o.x, o.y, o.z, 34, 1.2);
        s.addShake(0.08);
        break;
      case 'bin':
        a.clang();
        s.addShake(0.08);
        this.after(0.08, () => { if (p) p.visible = false; });
        break;
      case 'dog':
        a.bark();
        if (p) s.props?.dogSteal(p, this.wall);
        this.parcelMesh = null;
        break;
      case 'courier':
        a.bonk();
        s.particles.burst('sparks', o.x, o.y + 0.6, o.z, 18, 1);
        s.addShake(0.2);
        this.courierDown = 0.001;
        break;
      case 'road':
        this.runOver(o);
        break;
      case 'lost':
        if (p) p.visible = false;
        break;
      default:
        this.settle = 0.001;
        break;
    }
    if (o.reason !== 'road') this.after(0.35, () => a.sad());
  }

  private runOver(o: Outcome) {
    const t = this.truck;
    t.visible = true;
    const dir = o.x > 0 ? -1 : 1;
    t.position.set(o.x - dir * 24, 0, Math.max(1.2, o.z));
    t.rotation.y = dir > 0 ? 0 : Math.PI;
    this.settle = 0.001;
    const start = this.wall;
    const dur = 1.15;
    this.audio.truck();
    const p = this.parcelMesh;
    const anim = () => {
      const u = (this.wall - start) / dur;
      t.position.x = o.x + dir * (-24 + 48 * u);
      if (u >= 0.5 && p && p.scale.y > 0.3) {
        p.scale.set(1.5, 0.12, 1.5);
        p.position.y = 0.05;
        this.audio.squish();
        this.stage.particles.burst('cardboard', o.x, 0.2, o.z, 18, 1.2);
        this.stage.addShake(0.3);
      }
      if (u < 1) this.after(0, anim);
      else t.visible = false;
    };
    anim();
  }

  private showResult(o: Outcome, score: ScoreBreakdown) {
    const run = this.run;
    if (!run) return;
    this.mode = 'result';
    const lastThrow = run.throwIndex >= THROWS_PER_DELIVERY - 1;
    if (o.delivered) {
      run.total += score.total;
      run.pips.push(score.tricks.some((t) => t.pts > 0) ? 'd' : 'o');
      this.bridge.score(run.total);
      this.audio.stamp();
      this.ui.showDelivered(score, run.index === run.stops.length - 1, o.reason === 'chimney');
    } else {
      if (lastThrow) run.pips.push('x');
      const tricks: Trick[] = score.tricks;
      this.audio.stamp();
      this.ui.showFailed({
        reason: o.reason,
        line: failLine(o.reason, o.tick + run.throwIndex),
        missBy: o.missBy,
        left: THROWS_PER_DELIVERY - run.throwIndex - 1,
        tricks,
      });
    }
    this.updateHud();
    this.resultDelivered = o.delivered;
  }

  private resultDelivered = false;

  /** Tap after a result. */
  advance() {
    const run = this.run;
    if (!run || this.mode !== 'result') return;
    this.ui.hideResult();
    const moveOn = this.resultDelivered || run.throwIndex >= THROWS_PER_DELIVERY - 1;
    if (!moveOn) {
      run.throwIndex++;
      this.beginAim();
      return;
    }
    run.index++;
    if (run.index >= run.stops.length) {
      this.finishRun();
      return;
    }
    this.enterStop();
  }

  private finishRun() {
    const run = this.run!;
    this.mode = 'summary';
    this.ui.showHud(false);
    this.stage.marker.group.visible = false;
    const score = run.total;
    const thresholds = starThresholds(run.stops.map((s) => s.def));
    const stars = thresholds.filter((t) => score >= t).length;
    let unlocked: string | null = null;
    let newBest = false;

    if (run.kind === 'route') {
      const before = totalStars(this.save);
      const id = run.route!.id;
      const prev = this.save.routes[id] ?? { best: 0, stars: 0 };
      newBest = score > prev.best;
      this.save.routes[id] = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, stars) };
      const after = totalStars(this.save);
      const next = ROUTES.find((r) => r.unlock > before && r.unlock <= after);
      if (next) unlocked = next.name;
    } else {
      const d = run.daily!;
      const prev = this.save.daily[d.date];
      newBest = !prev || score > prev.best;
      if (!prev) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        this.save.streak = this.save.lastDaily === localDate(yesterday) ? this.save.streak + 1 : 1;
        this.save.lastDaily = d.date;
      }
      if (newBest) this.save.daily[d.date] = { best: score, stars: Math.max(stars, prev?.stars ?? 0), pips: run.pips.join('') };
      const keys = Object.keys(this.save.daily).sort();
      for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete this.save.daily[k];
    }
    writeSave(this.save);
    this.bridge.roundEnded({ score });

    const idx = run.route ? ROUTES.indexOf(run.route) : -1;
    const nextRoute = idx >= 0 ? ROUTES[idx + 1] : undefined;
    const canNext = !!nextRoute && totalStars(this.save) >= nextRoute.unlock;
    this.audio.fanfare();
    this.ui.showSummary({
      title: run.kind === 'daily' ? `Daily Route #${run.daily!.number}` : run.route!.name,
      score, stars, thresholds, pips: run.pips, newBest, unlocked,
      daily: run.kind === 'daily',
      streak: this.save.streak,
      nextRoute: canNext ? nextRoute!.id : null,
      nextName: canNext ? nextRoute!.name : null,
      share: run.kind === 'daily' ? this.shareText(run, score, stars) : null,
    });
    this.after(0.25, () => { for (let i = 0; i < stars; i++) this.after(i * 0.32, () => this.audio.star(i)); });
  }

  private shareText(run: Run, score: number, stars: number) {
    const marks: Record<string, string> = { d: '\u{1F4E6}', o: '\u{1F7E9}', x: '\u{1F4A5}' };
    const url = this.bridge.canonicalUrl() || location.href;
    const row = run.pips.map((p) => marks[p]).join('');
    return `Curbside Daily #${run.daily!.number}\n${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} ${score.toLocaleString('en-US')}\n${row}\n${url}`;
  }

  toMenu() {
    this.setPaused(false);
    this.ui.hideOverlays();
    this.ui.showHud(false);
    this.showMenu();
  }

  // -------------------------------------------------------------------------------------
  // Pause and mute

  togglePause() {
    this.setPaused(!this.paused);
    if (this.paused) this.ui.showPause(this.audio.muted);
    else this.ui.hidePause();
  }

  /** The one pause flag. It freezes the sim, the timers and the audio. */
  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    this.audio.setPaused(p);
    if (p && this.dragging) {
      this.dragging = false;
      this.ui.hideAim();
    }
    this.last = performance.now();
  }

  pauseFromHost() {
    this.setPaused(true);
    if (this.run && this.mode !== 'summary') this.ui.showPause(this.audio.muted);
  }

  resumeFromHost() {
    this.ui.hidePause();
    this.setPaused(false);
  }

  /** The arcade's sound button is the player's choice in the arcade, not a saved setting here. */
  setMuted(m: boolean, persist = true) {
    this.audio.setMuted(m);
    if (persist) {
      this.save.muted = m;
      writeSave(this.save);
    }
    this.ui.setMuted(m);
  }

  toggleMute() {
    this.setMuted(!this.audio.muted);
  }

  restartFromHost() {
    if (this.run) this.restartRun();
    else this.showMenu();
  }

  // -------------------------------------------------------------------------------------
  // Frame

  private after(seconds: number, fn: () => void) {
    this.timers.push({ at: this.wall + seconds, fn });
  }

  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    const raw = (now - this.last) / 1000;
    this.last = now;
    if (this.paused) return;
    // A clamped delta means resuming, or a dropped frame, can't jump the game forward.
    const dt = Math.min(raw, 0.05);
    this.wall += dt;

    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.wall);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.wall);
        for (const t of due) t.fn();
      }
    }

    this.updateSlowMo(dt);
    this.acc += dt * this.timeScale;
    let guard = 0;
    while (this.acc >= DT && guard++ < 16) {
      this.acc -= DT;
      this.tick();
    }
    if (guard >= 16) this.acc = 0;

    this.updateAim(dt);
    this.updateParcel(dt);
    this.updateCourier(dt);
    this.updateMarker();
    if (this.mode === 'menu') this.menuCamera(dt);
    this.audio.ambience(dt);
    const seconds = (this.level?.world.clock ?? 0) * DT;
    this.stage.render(dt, this.wall, seconds);
  };

  private updateSlowMo(dt: number) {
    const b = this.body;
    let want = 1;
    if (this.mode === 'fly' && b) {
      const t = this.level!.world.target;
      const d = Math.hypot(b.x - t.x, b.y - t.y, b.z - t.z);
      // A beat of slow motion as it comes in over the target.
      if (d < 3 && b.vy < 2) want = 0.5;
    }
    this.timeScale += (want - this.timeScale) * Math.min(1, dt * 10);
  }

  private menuCamera(dt: number) {
    this.menuDrift += dt;
    const w = this.level!.world;
    this.stage.focusOn(Math.sin(this.menuDrift * 0.2) * 1.2, 0, w.target.z - 1, 1.04, 0.6);
  }

  private updateAim(dt: number) {
    if (this.mode !== 'aim' || !this.level) return;
    const w = this.level.world;
    if (this.keyAim) this.keyboardAim(dt);
    const aiming = this.dragging || this.keyAim;
    if (aiming && this.input.power > 0) {
      const def = this.level.def;
      const q = quantize(this.input);
      const pv = previewThrow(w, PARCELS[def.parcel], q, def.preview);
      const tint = this.input.power > 0.85 ? '#ffb23e' : this.input.power > 0.55 ? '#ffe28a' : '#ffffff';
      this.stage.aim.show(pv.pts, pv.hit, pv.hitPos, this.stage.unitScale, tint);
      if (this.keyAim) this.ui.showKeyPower(this.input.power);
    } else {
      this.stage.aim.hide();
      if (!this.keyAim) this.ui.hideKeyPower();
    }
  }

  private updateParcel(dt: number) {
    const m = this.parcelMesh;
    if (!m) return;
    const lvl = this.level!;
    const w = lvl.world;
    const kind = lvl.def.parcel;

    if (this.mode === 'aim' || this.mode === 'menu') {
      const yaw = this.input.yaw;
      const pull = this.input.power * 0.42;
      const dx = Math.sin(yaw), dz = -Math.cos(yaw);
      m.position.set(w.origin[0] - dx * pull, w.origin[1] - pull * 0.12, w.origin[2] - dz * pull);
      m.rotation.set(0, -yaw, 0);
      return;
    }

    const b = this.body;
    if (!b) return;
    const a = this.acc / DT;
    if (this.mode === 'fly') {
      m.position.lerpVectors(this.prev, this.cur, a);
      const q = new Quaternion().setFromEuler(new Euler(b.wx * dt, b.wy * dt, b.wz * dt));
      this.spin.premultiply(q);
      m.quaternion.copy(this.spin);
      if (kind === 'pizza') {
        // Frisbees stay flat, with just a wobble.
        m.rotation.set(Math.sin(b.tick * 0.09) * 0.14, b.tick * 0.14, Math.cos(b.tick * 0.07) * 0.14);
      }
      this.flatYaw = Math.round(m.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
    } else if (this.settle > 0 && b.done) {
      // Ease the tumbling sphere-with-a-box-skin onto a flat face.
      this.settle = Math.min(1, this.settle + dt * 7);
      const flat = new Quaternion().setFromEuler(new Euler(0, this.flatYaw, 0));
      m.quaternion.slerp(flat, this.settle);
      const drop = b.parcel.r - REST_HEIGHT[kind];
      m.position.y = m.scale.y < 0.3 ? 0.05 : b.done.y - drop * this.settle;
      // A parcel delivered onto something moving leaves with it.
      if (b.done.delivered && w.target.mover) {
        const t = w.target;
        m.position.x = t.x + this.rideX;
        m.position.y += t.y - this.rideY;
        m.position.z = t.z + this.rideZ;
      }
    }

    this.squash *= Math.exp(-dt * 11);
    if (m.scale.y > 0.3) {
      const s = this.squash;
      m.scale.set(1 + s * 0.45, 1 - s * 0.6, 1 + s * 0.45);
    }

    if (this.mode === 'fly') {
      // Drift the camera with the parcel, without losing the target.
      this.stage.focusOn(b.x, b.y * 0.5, b.z, 0.92, 0.35);
    }
  }

  private updateCourier(dt: number) {
    const c = this.stage.courier;
    if (!this.level) return;
    const yaw = this.input.yaw;
    if (this.mode === 'aim' && (this.dragging || this.keyAim) && this.input.power > 0) {
      c.rotation.y = Math.atan2(Math.sin(yaw), -Math.cos(yaw));
      c.arm.rotation.x = 0.8 + this.input.power * 1.7;
      c.torso.rotation.x = -this.input.power * 0.16;
    } else if (this.armAnim > 0) {
      this.armAnim = Math.max(0, this.armAnim - dt * 2.4);
      c.arm.rotation.x = -2.6 * this.armAnim * this.armAnim - 0.2;
      c.torso.rotation.x = 0.3 * this.armAnim;
    } else if (this.mode !== 'fly') {
      c.arm.rotation.x *= 0.85;
      c.torso.rotation.x *= 0.85;
    }
    if (this.courierDown > 0) {
      this.courierDown = Math.min(1, this.courierDown + dt * 5);
      c.rotation.x = (-Math.PI / 2) * this.courierDown;
      c.position.y = 0.24 * this.courierDown;
    } else {
      c.rotation.x = 0;
      c.position.y = 0;
    }
  }

  private updateMarker() {
    const lvl = this.level;
    if (!lvl || this.mode === 'menu') return;
    const t = lvl.world.target;
    const scale = this.stage.unitScale;
    this.stage.marker.group.visible = this.mode === 'aim' || this.mode === 'fly';
    this.stage.marker.place(t.x, t.y, t.z, Math.max(t.w, t.d) * 0.62, this.wall, scale);
  }
}

