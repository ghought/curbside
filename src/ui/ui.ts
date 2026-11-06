// The DOM layer: everything is a shipping label, delivery slip or rubber stamp.

import type { Game } from '../game';
import type { RouteId } from '../levels/routes';
import type { ScoreBreakdown, Trick } from '../sim/scoring';
import type { Parcel } from '../sim/types';
import { DONE_LINES, FAIL_STAMP, GIVE_UP_LINES } from './copy';

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.5v11h-13V10zm2.4 0h5.2V7a2.6 2.6 0 0 0-5.2 0z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zm6.4 0H17v14h-3.6z"/></svg>';
const SOUND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5zM15 8.2a5 5 0 0 1 0 7.6l-1.2-1.4a3.2 3.2 0 0 0 0-4.8zM17.3 5.6a8.4 8.4 0 0 1 0 12.8l-1.2-1.4a6.6 6.6 0 0 0 0-10z"/></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5zM15 9.4l1.2-1.2 2 2 2-2 1.2 1.2-2 2 2 2-1.2 1.2-2-2-2 2-1.2-1.2 2-2z"/></svg>';

function stars(n: number, of = 3) {
  let s = '';
  for (let i = 0; i < of; i++) s += `<span class="star${i < n ? ' on' : ''}">${STAR}</span>`;
  return `<span class="stars">${s}</span>`;
}

function barcode(seed: number) {
  let s = '';
  let v = seed * 2654435761;
  for (let i = 0; i < 26; i++) {
    v = (v ^ (v << 13)) >>> 0;
    v = (v ^ (v >>> 7)) >>> 0;
    s += `<i style="width:${1 + (v % 3)}px;margin-right:${1 + ((v >> 3) % 3)}px"></i>`;
  }
  return `<span class="barcode" aria-hidden="true">${s}</span>`;
}

const fmt = (n: number) => n.toLocaleString('en-US');

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

interface MenuData {
  routes: { id: RouteId; name: string; blurb: string; need: number; unlocked: boolean; best: number; stars: number }[];
  daily: { number: number; best: number; stars: number; streak: number };
  totalStars: number;
}

export class UI {
  game!: Game;
  private root: HTMLElement;
  private hud: HTMLElement;
  private menu: HTMLElement | null = null;
  private note: HTMLElement | null = null;
  private result: HTMLElement | null = null;
  private pause: HTMLElement | null = null;
  private summary: HTMLElement | null = null;
  private tutorial: HTMLElement | null = null;
  private keyPower: HTMLElement | null = null;
  private svg: SVGSVGElement;
  private band: SVGLineElement;
  private knob: SVGCircleElement;
  private home: SVGCircleElement;
  private powerLabel: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.hud = el(`
      <div class="hud" hidden>
        <div class="hud-row">
          <div class="hud-tag">
            <div class="hud-name"></div>
            <div class="hud-pips"></div>
          </div>
          <div class="hud-right">
            <div class="hud-score"><small>SCORE</small><b>0</b></div>
            <button class="icon-btn" data-act="pause" aria-label="Pause">${PAUSE}</button>
          </div>
        </div>
        <div class="hud-row2">
          <div class="hud-throws" aria-label="Throws left"></div>
          <div class="hud-wind" hidden></div>
        </div>
      </div>`);
    root.appendChild(this.hud);

    const ns = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(ns, 'svg');
    this.svg.setAttribute('class', 'aim-svg');
    this.band = document.createElementNS(ns, 'line');
    this.knob = document.createElementNS(ns, 'circle');
    this.home = document.createElementNS(ns, 'circle');
    this.home.setAttribute('r', '9');
    this.home.setAttribute('class', 'aim-home');
    this.knob.setAttribute('r', '17');
    this.knob.setAttribute('class', 'aim-knob');
    this.band.setAttribute('class', 'aim-band');
    this.svg.append(this.band, this.home, this.knob);
    this.svg.style.display = 'none';
    root.appendChild(this.svg);
    this.powerLabel = el('<div class="aim-power" hidden></div>');
    root.appendChild(this.powerLabel);

    root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (btn) {
        this.game.audio.unlock();
        this.game.audio.tick();
        this.action(btn.dataset.act!, btn.dataset.arg);
      }
    });
  }

  private action(act: string, arg?: string) {
    const g = this.game;
    switch (act) {
      case 'route': g.startRoute(arg as RouteId); break;
      case 'daily': g.startDaily(); break;
      case 'pause': g.togglePause(); break;
      case 'resume': g.togglePause(); break;
      case 'restart': this.hidePause(); g.restartRun(); break;
      case 'menu': g.toMenu(); break;
      case 'mute': g.toggleMute(); break;
      case 'next': g.advance(); break;
      case 'share': void this.share(arg ?? ''); break;
      case 'replay': this.hideSummary(); g.ui.showHud(true); g.restartRun(); break;
      case 'nextRoute': this.hideSummary(); g.startRoute(arg as RouteId); break;
    }
  }

  hideOverlays() {
    this.hideResult();
    this.hideSummary();
    this.hidePause();
  }

  // Menu --------------------------------------------------------------------------------

  showMenu(d: MenuData) {
    this.hideMenu();
    const routes = d.routes.map((r, i) => `
      <button class="label route ${r.unlocked ? '' : 'locked'}" ${r.unlocked ? `data-act="route" data-arg="${r.id}"` : 'disabled'}>
        <span class="route-no">${i + 1}</span>
        <span class="route-main">
          <b>${esc(r.name)}</b>
          <small>${r.unlocked ? esc(r.blurb) : `Needs ${r.need} stars. You have ${d.totalStars}.`}</small>
        </span>
        <span class="route-side">
          ${r.unlocked ? stars(r.stars) : `<span class="lock">${LOCK}</span>`}
          ${r.best ? `<small>${fmt(r.best)}</small>` : ''}
        </span>
      </button>`).join('');
    this.menu = el(`
      <div class="menu">
        <div class="menu-top">
          <div class="logo">
            <div class="logo-tape"></div>
            <h1>CURB<br>SIDE</h1>
            <p>Ridiculous trick-shot deliveries</p>
            ${barcode(77)}
          </div>
        </div>
        <div class="menu-list">
          <button class="label ticket" data-act="daily">
            <span class="ticket-main">
              <small>TODAY'S ROUTE No. ${d.daily.number}</small>
              <b>Same five drops for everyone</b>
            </span>
            <span class="route-side">
              ${stars(d.daily.stars)}
              <small>${d.daily.best ? fmt(d.daily.best) : d.daily.streak > 1 ? `${d.daily.streak} day streak` : 'Not played'}</small>
            </span>
          </button>
          ${routes}
        </div>
      </div>`);
    this.root.appendChild(this.menu);
  }

  hideMenu() {
    this.menu?.remove();
    this.menu = null;
  }

  // HUD ---------------------------------------------------------------------------------

  showHud(on: boolean) {
    this.hud.hidden = !on;
    if (!on) {
      this.collapseNote(true);
      this.showTutorial(false);
    }
  }

  updateHud(d: { stop: number; stops: number; pips: string[]; throwsLeft: number; score: number; wind: [number, number]; name: string }) {
    this.hud.querySelector('.hud-name')!.textContent = d.name;
    let pips = '';
    for (let i = 0; i < d.stops; i++) {
      const p = d.pips[i];
      const cls = p === 'x' ? 'bad' : p ? 'good' : i === d.stop - 1 ? 'now' : '';
      pips += `<i class="${cls}"></i>`;
    }
    this.hud.querySelector('.hud-pips')!.innerHTML = pips;
    this.hud.querySelector('.hud-score b')!.textContent = fmt(d.score);
    let throws = '';
    for (let i = 0; i < 3; i++) throws += `<i class="${i < d.throwsLeft ? 'on' : ''}"></i>`;
    this.hud.querySelector('.hud-throws')!.innerHTML = throws;
    const wind = this.hud.querySelector('.hud-wind') as HTMLElement;
    const speed = Math.hypot(d.wind[0], d.wind[1]);
    wind.hidden = speed < 0.05;
    if (speed >= 0.05) {
      const deg = (Math.atan2(d.wind[0], -d.wind[1]) * 180) / Math.PI;
      wind.innerHTML = `<svg viewBox="0 0 24 24" style="transform:rotate(${deg.toFixed(0)}deg)"><path d="M12 3l6 8h-4v10h-4V11H6z"/></svg><span>WIND ${speed.toFixed(1)}</span>`;
    }
  }

  setMuted(m: boolean) {
    const b = this.pause?.querySelector('[data-act="mute"]');
    if (b) b.innerHTML = `${m ? SOUND_OFF : SOUND}<span>Sound ${m ? 'off' : 'on'}</span>`;
  }

  // Customer note -----------------------------------------------------------------------

  showNote(n: { title: string; note: string; from: string; parcel: Parcel; stop: number; stops: number }) {
    this.collapseNote(true);
    this.note = el(`
      <div class="note">
        <div class="note-head"><span>STOP ${n.stop} OF ${n.stops}</span><span>${esc(n.parcel.label.toUpperCase())}</span></div>
        <h2>${esc(n.title)}</h2>
        <p class="note-text">${esc(n.note)}</p>
        <p class="note-from">${esc(n.from)}</p>
        <p class="note-hint">${esc(n.parcel.hint)}</p>
      </div>`);
    this.root.appendChild(this.note);
  }

  collapseNote(instant = false) {
    const n = this.note;
    if (!n) return;
    this.note = null;
    if (instant) n.remove();
    else {
      n.classList.add('out');
      setTimeout(() => n.remove(), 220);
    }
  }

  showTutorial(on: boolean) {
    if (on && !this.tutorial) {
      this.tutorial = el('<div class="tutorial"><div class="tut-dot"></div><p>Drag back and let go</p></div>');
      this.root.appendChild(this.tutorial);
    } else if (!on && this.tutorial) {
      this.tutorial.remove();
      this.tutorial = null;
    }
  }

  // Aim ---------------------------------------------------------------------------------

  showAim(ax: number, ay: number, x: number, y: number, power: number) {
    this.svg.style.display = 'block';
    this.band.setAttribute('x1', String(ax));
    this.band.setAttribute('y1', String(ay));
    this.band.setAttribute('x2', String(x));
    this.band.setAttribute('y2', String(y));
    this.band.style.strokeWidth = String(9 - power * 5);
    this.home.setAttribute('cx', String(ax));
    this.home.setAttribute('cy', String(ay));
    this.knob.setAttribute('cx', String(x));
    this.knob.setAttribute('cy', String(y));
    const hot = power > 0.85 ? 'hot' : power > 0.55 ? 'warm' : '';
    this.svg.setAttribute('class', `aim-svg ${hot}`);
    const label = this.powerLabel;
    label.hidden = power <= 0;
    label.textContent = `${Math.round(power * 100)}%`;
    label.style.transform = `translate(${x}px, ${y - 58}px) translate(-50%, 0)`;
  }

  hideAim() {
    this.svg.style.display = 'none';
    this.powerLabel.hidden = true;
  }

  showKeyPower(p: number) {
    if (!this.keyPower) {
      this.keyPower = el('<div class="key-power"><div class="kp-track"><i></i></div><small>Arrows aim. Space throws.</small></div>');
      this.root.appendChild(this.keyPower);
    }
    (this.keyPower.querySelector('i') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
  }

  hideKeyPower() {
    this.keyPower?.remove();
    this.keyPower = null;
  }

  trickPop(text: string, x: number, y: number) {
    const w = this.root.clientWidth;
    const p = el(`<div class="trick">${esc(text)}</div>`);
    p.style.left = `${Math.min(w - 70, Math.max(70, x))}px`;
    p.style.top = `${Math.max(120, y - 30)}px`;
    this.root.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }

  // Results -----------------------------------------------------------------------------

  showDelivered(s: ScoreBreakdown, lastStop: boolean, chimney: boolean) {
    this.hideResult();
    this.hideKeyPower();
    const rows = [
      ['Accuracy', s.accuracy],
      ['Condition', `${s.condition} <em>${s.conditionPct}%</em>`],
      ...s.tricks.map((t): [string, number | string] => [t.name, t.pts ? `+${t.pts}` : 'PERFECT']),
    ];
    const mult = s.throwMult < 1 ? `<div class="row dim"><span>Throw penalty</span><span>x${s.throwMult}</span></div>` : '';
    this.result = el(`
      <div class="slip slip-good" data-act="next">
        <div class="stamp stamp-good">${chimney ? 'HO HO HO' : 'DELIVERED'}</div>
        <div class="rows">
          ${rows.map(([a, b], i) => `<div class="row" style="animation-delay:${0.14 + i * 0.09}s"><span>${esc(String(a))}</span><span>${b}</span></div>`).join('')}
          ${mult}
        </div>
        <div class="slip-total"><span>${esc(DONE_LINES[s.total % DONE_LINES.length])}</span><b>${fmt(s.total)}</b></div>
        <button class="btn" data-act="next">${lastStop ? 'Finish route' : 'Next stop'}</button>
      </div>`);
    this.root.appendChild(this.result);
  }

  showFailed(f: { reason: string; line: string; missBy: number; left: number; tricks: Trick[] }) {
    this.hideResult();
    this.hideKeyPower();
    const stamp = FAIL_STAMP[f.reason] ?? 'ATTEMPTED';
    const near = f.missBy > 0.02 && f.missBy < 25 ? `Missed by ${f.missBy.toFixed(1)}m. ` : '';
    const giveUp = f.left === 0;
    const tail = giveUp ? GIVE_UP_LINES[Math.round(f.missBy * 10) % GIVE_UP_LINES.length] : `${near}${f.left} ${f.left === 1 ? 'throw' : 'throws'} left.`;
    this.result = el(`
      <div class="slip slip-bad" data-act="next">
        <div class="stamp stamp-bad">${esc(stamp)}</div>
        <p class="slip-kicker">Sorry we missed you</p>
        <p class="slip-line">${esc(f.line)}</p>
        <p class="slip-tail">${esc(tail)}</p>
        <button class="btn btn-quiet" data-act="next">${giveUp ? 'Next stop' : 'Try again'}</button>
      </div>`);
    this.root.appendChild(this.result);
  }

  hideResult() {
    this.result?.remove();
    this.result = null;
  }

  // Pause -------------------------------------------------------------------------------

  showPause(muted: boolean) {
    this.hidePause();
    this.pause = el(`
      <div class="scrim">
        <div class="label dialog">
          <h2>On Break</h2>
          <button class="btn" data-act="resume">Back to work</button>
          <button class="btn btn-quiet" data-act="restart">Restart route</button>
          <button class="btn btn-quiet" data-act="mute">${muted ? SOUND_OFF : SOUND}<span>Sound ${muted ? 'off' : 'on'}</span></button>
          <button class="btn btn-quiet" data-act="menu">Back to depot</button>
        </div>
      </div>`);
    this.root.appendChild(this.pause);
  }

  hidePause() {
    this.pause?.remove();
    this.pause = null;
  }

  // Summary -----------------------------------------------------------------------------

  showSummary(d: {
    title: string; score: number; stars: number; thresholds: number[]; pips: string[]; newBest: boolean; unlocked: string | null;
    daily: boolean; streak: number; nextRoute: RouteId | null; nextName: string | null; share: string | null;
  }) {
    this.hideSummary();
    this.collapseNote(true);
    const pips = d.pips.map((p) => `<i class="${p === 'x' ? 'bad' : 'good'}"></i>`).join('');
    const delivered = d.pips.filter((p) => p !== 'x').length;
    const next = d.stars < 3 ? d.thresholds.find((t) => t > d.score) : null;
    this.summary = el(`
      <div class="scrim">
        <div class="label dialog summary">
          <small class="kicker">ROUTE MANIFEST</small>
          <h2>${esc(d.title)}</h2>
          <div class="sum-stars">${stars(d.stars)}</div>
          <div class="sum-score">${fmt(d.score)}</div>
          ${d.newBest ? '<div class="sum-best">New personal best</div>' : ''}
          <div class="sum-pips">${pips}<span>${delivered} of ${d.pips.length} delivered</span></div>
          ${next ? `<p class="sum-goal">${fmt(next - d.score)} more for the next star</p>` : ''}
          ${d.unlocked ? `<div class="stamp stamp-good stamp-small">${esc(d.unlocked)} unlocked</div>` : ''}
          ${d.daily && d.streak > 1 ? `<p class="sum-goal">${d.streak} day streak</p>` : ''}
          ${d.daily ? '<p class="sum-goal">New route tomorrow.</p>' : ''}
          ${d.share ? `<button class="btn" data-act="share" data-arg="${esc(d.share)}">Share result</button>` : ''}
          ${d.nextRoute ? `<button class="btn" data-act="nextRoute" data-arg="${d.nextRoute}">On to ${esc(d.nextName!)}</button>` : ''}
          <button class="btn btn-quiet" data-act="replay">Run it again</button>
          <button class="btn btn-quiet" data-act="menu">Back to depot</button>
          <div class="toast" hidden></div>
        </div>
      </div>`);
    this.root.appendChild(this.summary);
  }

  hideSummary() {
    this.summary?.remove();
    this.summary = null;
  }

  private async share(text: string) {
    const toast = this.summary?.querySelector('.toast') as HTMLElement | null;
    const say = (m: string) => {
      if (toast) {
        toast.hidden = false;
        toast.textContent = m;
      }
    };
    // The async clipboard is blocked by policy in the arcade's frame, so don't even ask there.
    if (window.self === window.top) {
      try {
        await navigator.clipboard.writeText(text);
        say('Copied to clipboard');
        return;
      } catch {
        // Fall through to the old way.
      }
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'share-box';
    if (toast) {
      toast.hidden = false;
      toast.textContent = '';
      toast.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      if (ok) say('Copied to clipboard');
    }
  }
}
