// The daily route is pure maths on the date, so it needs no server and never runs out,
// and everyone on the same date gets identical layouts, parcels and wind.

import { ROUTES, type Delivery, type RouteId } from './routes';

export interface DailyStop {
  def: Delivery;
  wind: [number, number];
  mirror: boolean;
}

export interface DailyRoute {
  date: string;
  number: number;
  stops: DailyStop[];
  /** Used for the look of the summary only. */
  route: RouteId;
}

const FIRST_DAY = Date.UTC(2026, 10, 6);

export function localDate(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyRoute(date: string): DailyRoute {
  const r = mulberry(hash(`curbside:${date}`));
  const [y, m, d] = date.split('-').map(Number);
  const number = Math.floor((Date.UTC(y, m - 1, d) - FIRST_DAY) / 864e5) + 1;

  // Early to late in a route is roughly easy to hard, so build a ramp: two early, two
  // middle and one late stop, across neighbourhoods.
  const pool = ROUTES.flatMap((route) => route.deliveries.map((def, i) => ({ def, tier: i < 2 ? 0 : i < 4 ? 1 : 2 })));
  const take = (tier: number) => {
    const opts = pool.filter((p) => p.tier === tier);
    const pick = opts[Math.floor(r() * opts.length)];
    pool.splice(pool.indexOf(pick), 1);
    return pick.def;
  };
  const defs = [take(0), take(0), take(1), take(1), take(2)];

  const stops = defs.map((def): DailyStop => {
    const base = def.wind ?? [0, 0];
    const strength = r() * 1.1;
    const angle = r() * Math.PI * 2;
    const calm = r() < 0.3;
    return {
      def,
      wind: calm ? base : [base[0] + Math.cos(angle) * strength, base[1] + Math.sin(angle) * strength * 0.6],
      mirror: r() < 0.5,
    };
  });
  return { date, number, stops, route: defs[4].route };
}
