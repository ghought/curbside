import type { Body, Outcome, SimEvent, World } from './types';
import { DT } from './types';

export interface Trick {
  name: string;
  pts: number;
}

export interface ScoreBreakdown {
  delivered: boolean;
  accuracy: number;
  condition: number;
  conditionPct: number;
  tricks: Trick[];
  throwMult: number;
  total: number;
}

export const THROWS_PER_DELIVERY = 3;
const THROW_MULT = [1, 0.7, 0.5];

const HIT_TRICKS: Record<string, Trick> = {
  car: { name: 'Bank Shot', pts: 250 },
  cart: { name: 'Fore!', pts: 150 },
  house: { name: 'Off the Wall', pts: 150 },
  wall: { name: 'Off the Wall', pts: 150 },
  door: { name: 'Ding Dong', pts: 200 },
  awning: { name: 'Awning Assist', pts: 300 },
  trampoline: { name: 'Boing!', pts: 300 },
  glasswall: { name: 'Bird Strike', pts: 100 },
  fence: { name: 'Rattled the Fence', pts: 100 },
  roof: { name: 'Roof Roll', pts: 200 },
};

const ZONE_TRICKS: Record<string, Trick> = {
  gate: { name: 'Through the Gate', pts: 250 },
  gnome: { name: 'Gnome Down', pts: 75 },
  flamingo: { name: 'Plucked', pts: 75 },
  cone: { name: 'Cone Zone', pts: 50 },
  pot: { name: 'Sorry, Luigi', pts: 50 },
};

export function detectTricks(body: Body, events: SimEvent[], outcome: Outcome): Trick[] {
  const seen = new Set<string>();
  const tricks: Trick[] = [];
  const add = (t: Trick) => {
    if (seen.has(t.name)) return;
    seen.add(t.name);
    tricks.push(t);
  };
  let surfaces = 0;
  let onlyMat = true;
  for (const e of events) {
    if (e.type === 'hit') {
      if (e.tag !== 'mat') onlyMat = false;
      const t = HIT_TRICKS[e.tag];
      if (t && e.j > 3) add(t);
      if (e.tag !== 'mat' && e.j > 3) surfaces++;
    } else if (e.type === 'zone') {
      const t = ZONE_TRICKS[e.tag];
      if (t) add(t);
    }
  }
  if (body.skips > 0) {
    add({ name: body.skips > 1 ? `Stone Skipper x${body.skips}` : 'Stone Skipper', pts: 200 * body.skips });
  }
  if (outcome.reason === 'chimney') add({ name: 'Down the Chimney', pts: 900 });
  if (onlyMat && outcome.reason === 'delivered') add({ name: 'Nothing But Mat', pts: 150 });
  if (surfaces >= 3) add({ name: 'Pinball', pts: 200 });
  if (outcome.tick * DT > 3.2) add({ name: 'Hang Time', pts: 100 });
  return tricks;
}

export function scoreThrow(w: World, body: Body, events: SimEvent[], outcome: Outcome, throwIndex: number): ScoreBreakdown {
  const tricks = detectTricks(body, events, outcome);
  const mult = THROW_MULT[Math.min(throwIndex, THROW_MULT.length - 1)];
  if (!outcome.delivered) {
    return { delivered: false, accuracy: 0, condition: 0, conditionPct: Math.round(body.condition), tricks, throwMult: mult, total: 0 };
  }
  const t = w.target;
  const dist = Math.hypot(outcome.x - t.x, outcome.z - t.z);
  const reach = Math.max(t.w, t.d) / 2 + 0.1;
  const closeness = outcome.reason === 'chimney' ? 0 : Math.max(0, 1 - dist / reach);
  let accuracy = Math.round((150 + 350 * closeness) / 5) * 5;
  if (outcome.reason === 'chimney') accuracy = 0;
  else if (dist < 0.22) {
    accuracy += 100;
    tricks.unshift({ name: 'Dead Centre', pts: 0 });
  }
  const condition = Math.round((body.condition / 100) * 300 / 5) * 5;
  const trickPts = tricks.reduce((s, k) => s + k.pts, 0);
  const total = Math.round(((accuracy + condition + trickPts) * mult) / 5) * 5;
  return { delivered: true, accuracy, condition, conditionPct: Math.round(body.condition), tricks, throwMult: mult, total };
}
