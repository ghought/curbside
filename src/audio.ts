// All sound is synthesized, so there is nothing to download. Everything goes through one
// master gain, and the context only starts after a user gesture.

type Ctx = AudioContext;

export class Audio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private birdTimer = 0;
  muted = false;
  private paused = false;

  /** Call from a pointer or key handler. */
  unlock() {
    if (this.ctx) {
      if (!this.paused && this.ctx.state !== 'running') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbience();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!this.ctx) return;
    if (p) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private startAmbience() {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0.012;
    src.connect(f).connect(g).connect(master);
    src.start();
  }

  /** Occasional birdsong. Called every frame with the frame delta. */
  ambience(dt: number) {
    if (!this.ctx || this.paused) return;
    this.birdTimer -= dt;
    if (this.birdTimer > 0) return;
    this.birdTimer = 3 + Math.random() * 7;
    const base = 2200 + Math.random() * 1600;
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      this.tone(base * (1 + Math.random() * 0.2), base * 1.25, 0.09, 0.012, 'sine', i * 0.14);
    }
  }

  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0) {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number, delay = 0) {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.8);
    s.stop(t + dur + 0.02);
  }

  tick() { this.tone(900, 700, 0.03, 0.05, 'triangle'); }
  stretch(power: number) { this.tone(180 + power * 340, 200 + power * 360, 0.05, 0.022, 'triangle'); }
  whoosh(power: number) { this.hiss(0.32, 0.11 + power * 0.1, 500, 1.1, 'bandpass', 2600); }

  thud(j: number, mat: string) {
    const v = Math.min(1, j / 14);
    if (mat === 'car' || mat === 'metal') {
      this.tone(420, 190, 0.2, 0.2 * v, 'square');
      this.tone(1180, 620, 0.16, 0.08 * v, 'triangle');
      this.hiss(0.06, 0.1 * v, 2400, 2);
    } else if (mat === 'grass' || mat === 'hedge' || mat === 'mulch' || mat === 'cushion') {
      this.tone(120, 62, 0.12, 0.3 * v, 'sine');
      this.hiss(0.09, 0.09 * v, 500, 0.8);
    } else if (mat === 'trampoline' || mat === 'awning') {
      this.tone(160, 640, 0.32, 0.22, 'sine');
      this.tone(320, 900, 0.22, 0.06, 'triangle');
    } else if (mat === 'glass') {
      this.tone(1500, 1100, 0.12, 0.14 * v, 'sine');
      this.tone(300, 150, 0.1, 0.2 * v, 'sine');
    } else {
      this.tone(170, 72, 0.13, 0.36 * v, 'sine');
      this.hiss(0.07, 0.14 * v, 1100, 0.9);
    }
  }

  glass() {
    this.hiss(0.5, 0.3, 3800, 0.6, 'highpass');
    for (let i = 0; i < 9; i++) {
      const f = 2200 + Math.random() * 4200;
      this.tone(f, f * 0.8, 0.12 + Math.random() * 0.2, 0.05, 'sine', Math.random() * 0.26);
    }
  }

  splash() {
    this.hiss(0.6, 0.3, 900, 0.5, 'lowpass', 300);
    this.tone(200, 70, 0.26, 0.2, 'sine');
    this.hiss(0.3, 0.1, 3000, 1, 'bandpass', 900, 0.12);
  }

  skip() {
    this.tone(760, 1120, 0.08, 0.08, 'sine');
    this.hiss(0.1, 0.12, 2000, 1);
  }

  bark() {
    for (const d of [0, 0.17]) {
      this.tone(520, 210, 0.11, 0.2, 'sawtooth', d);
      this.hiss(0.09, 0.09, 1200, 1.2, 'bandpass', undefined, d);
    }
  }

  alarm() {
    const { ctx } = this;
    if (!ctx) return;
    for (let i = 0; i < 5; i++) {
      this.tone(700, 1250, 0.24, 0.05, 'square', i * 0.5);
      this.tone(1250, 700, 0.24, 0.05, 'square', i * 0.5 + 0.25);
    }
  }

  bonk() {
    this.tone(880, 120, 0.2, 0.26, 'triangle');
    this.tone(1760, 1320, 0.16, 0.05, 'sine', 0.1);
  }

  squish() {
    this.tone(90, 42, 0.28, 0.42, 'sawtooth');
    this.hiss(0.18, 0.2, 700, 0.7);
  }

  truck() {
    this.hiss(0.9, 0.22, 240, 0.7, 'lowpass', 900);
    this.tone(70, 110, 0.5, 0.16, 'sawtooth');
    this.tone(460, 380, 0.5, 0.08, 'square', 0.04);
    this.tone(370, 310, 0.5, 0.08, 'square', 0.04);
  }

  rustle() { this.hiss(0.4, 0.14, 2400, 0.7, 'bandpass', 800); }
  clang() { this.tone(240, 200, 0.4, 0.2, 'square'); this.tone(640, 560, 0.36, 0.08, 'triangle'); }
  stamp() { this.tone(150, 56, 0.1, 0.42, 'sine'); this.hiss(0.05, 0.14, 1500, 0.8); }

  sad() {
    [392, 370, 349, 262].forEach((f, i) => this.tone(f, f * 0.98, i === 3 ? 0.46 : 0.15, 0.08, 'triangle', i * 0.16));
  }

  delivered() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.22, 0.09, 'triangle', i * 0.075));
  }

  trick(i: number) {
    const f = 620 * Math.pow(1.122, i * 2);
    this.tone(f, f * 1.5, 0.12, 0.08, 'triangle');
  }

  fanfare() {
    [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.28, 0.08, 'triangle', i * 0.12));
  }

  star(i: number) {
    this.tone(880 * Math.pow(1.26, i), 1400 * Math.pow(1.26, i), 0.26, 0.1, 'sine');
  }
}
