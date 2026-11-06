// Local progress. Everything is wrapped so the game still runs if storage is denied,
// which is common in sandboxed iframes and private windows.

import type { RouteId } from './levels/routes';

const KEY = 'curbside.save';
const VERSION = 1;

export interface Save {
  v: number;
  /** Best score and stars per route. */
  routes: Partial<Record<RouteId, { best: number; stars: number }>>;
  /** Best daily results, by date. Pruned to the last 60 days. */
  daily: Record<string, { best: number; stars: number; pips: string }>;
  streak: number;
  lastDaily: string;
  muted: boolean;
  seenTutorial: boolean;
}

function blank(): Save {
  return { v: VERSION, routes: {}, daily: {}, streak: 0, lastDaily: '', muted: false, seenTutorial: false };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw) as Save;
    if (!s || s.v !== VERSION) return blank();
    return { ...blank(), ...s };
  } catch {
    return blank();
  }
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Progress just lasts for this session.
  }
}

export function totalStars(s: Save): number {
  return Object.values(s.routes).reduce((n, r) => n + (r?.stars ?? 0), 0);
}
