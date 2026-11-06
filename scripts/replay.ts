// Finds a winning throw for every delivery headlessly, then plays it through the live game
// in a real browser and checks the two agree. Expects the dev server on :5199.

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { ROUTES, buildLevel } from '../src/levels/routes';
import { simulate } from '../src/sim/physics';
import { scoreThrow } from '../src/sim/scoring';
import { PARCELS } from '../src/sim/types';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
await page.goto('http://localhost:5199');
await page.waitForTimeout(800);

let bad = 0;
for (const route of ROUTES) {
  for (let i = 0; i < route.deliveries.length; i++) {
    const def = route.deliveries[i];
    const lvl = buildLevel(def);
    const moving = lvl.world.movers.length > 0 || !!lvl.world.target.mover;
    let best: { yaw: number; power: number; clock: number; total: number } | null = null;
    for (const clock of moving ? [300, 500, 700] : [300]) {
      for (let yi = 0; yi < 121; yi++) for (let pi = 0; pi <= 50; pi++) {
        const yaw = -1.25 + (2.5 * yi) / 120, power = pi / 50;
        const r = simulate(lvl.world, PARCELS[def.parcel], { yaw, power }, clock);
        if (!r.outcome.delivered) continue;
        const s = scoreThrow(lvl.world, r.body, r.events, r.outcome, 0).total;
        if (!best || s > best.total) best = { yaw, power, clock, total: s };
      }
    }
    const win = best!;
    const live = await page.evaluate(async ([rid, idx, b]) => {
      const g = (window as any).__curbside;
      g.save.seenTutorial = true;
      g.toMenu();
      g.startRoute(rid);
      g.run.index = idx;
      g.enterStop();
      g.ui.collapseNote(true);
      await new Promise((r) => setTimeout(r, 150));
      const w = g.level.world;
      g.input = { yaw: b.yaw, power: b.power };
      w.clock = b.clock;
      g.release();
      for (let t = 0; t < 400 && g.mode !== 'result'; t++) await new Promise((r) => setTimeout(r, 50));
      return { done: g.body?.done, total: g.run.total, mode: g.mode };
    }, [route.id, i, win] as const);
    await page.waitForTimeout(650);
    await page.screenshot({ path: `${out}/${def.id}.png` });
    const ok = live.done?.delivered && live.total === best!.total;
    if (!ok) bad++;
    console.log(`${ok ? 'pass' : 'FAIL'}  ${def.id.padEnd(10)} headless ${best!.total}  live ${live.total}  ${live.done?.reason}`);
  }
}
await browser.close();
if (bad) { console.error(`${bad} mismatches`); process.exit(1); }
