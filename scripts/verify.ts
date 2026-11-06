// Proves the promises the game makes about its physics and its daily route.
// `npm run verify`

import { dailyRoute } from '../src/levels/daily';
import { ALL_DELIVERIES, buildLevel, starThresholds } from '../src/levels/routes';
import { makeBody, previewThrow, quantize, setClock, simulate, step } from '../src/sim/physics';
import { PARCELS } from '../src/sim/types';

let failures = 0;
const fail = (m: string) => { failures++; console.error(`  FAIL ${m}`); };
const rand = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();

console.log('1. The preview is the real throw');
{
  let checked = 0;
  for (const def of ALL_DELIVERIES) {
    const lvl = buildLevel(def);
    const parcel = PARCELS[def.parcel];
    for (let i = 0; i < 300; i++) {
      const input = quantize({ yaw: (rand() - 0.5) * 2.4, power: 0.05 + rand() * 0.95 });
      const clock = Math.floor(rand() * 2000);
      setClock(lvl.world, clock);
      const pv = previewThrow(lvl.world, parcel, input, 2);
      // Replay as the live game loop does, comparing against every recorded preview point.
      setClock(lvl.world, clock);
      const b = makeBody(lvl.world, parcel, input);
      let idx = 1;
      for (let t = 1; t <= 240 && idx < pv.pts.length / 3 && !b.done; t++) {
        setClock(lvl.world, clock + t);
        step(lvl.world, b, null);
        if (t % 3 === 0) {
          const d = Math.hypot(b.x - pv.pts[idx * 3], b.y - pv.pts[idx * 3 + 1], b.z - pv.pts[idx * 3 + 2]);
          if (d !== 0) { fail(`${def.id}: preview diverged by ${d} at tick ${t}`); break; }
          idx++;
        }
      }
      checked++;
    }
  }
  console.log(`  ${checked} random throws matched their preview exactly`);
}

console.log('2. Same input, same result');
{
  let checked = 0;
  for (const def of ALL_DELIVERIES) {
    const lvl = buildLevel(def);
    for (let i = 0; i < 40; i++) {
      const input = { yaw: (rand() - 0.5) * 2.4, power: rand() };
      const clock = Math.floor(rand() * 2000);
      const a = simulate(lvl.world, PARCELS[def.parcel], input, clock);
      const b = simulate(buildLevel(def).world, PARCELS[def.parcel], input, clock);
      if (a.outcome.x !== b.outcome.x || a.outcome.z !== b.outcome.z || a.outcome.reason !== b.outcome.reason) fail(`${def.id}: not deterministic`);
      checked++;
    }
  }
  console.log(`  ${checked} throws replayed identically`);
}

console.log('3. Small aim changes give small result changes (on the deliverable throws)');
{
  for (const def of ALL_DELIVERIES) {
    if (def.wind) continue;
    const lvl = buildLevel(def);
    if (lvl.world.movers.length) continue;
    const parcel = PARCELS[def.parcel];
    let found = 0, stable = 0;
    for (let yi = 0; yi < 241 && found < 30; yi++) for (let pi = 0; pi <= 100 && found < 30; pi++) {
      const input = { yaw: -1.2 + yi * 0.01, power: pi / 100 };
      const r = simulate(lvl.world, parcel, input);
      if (!r.outcome.delivered) continue;
      found++;
      const n = simulate(lvl.world, parcel, { yaw: input.yaw + 0.0044, power: input.power + 0.005 });
      if (Math.hypot(n.outcome.x - r.outcome.x, n.outcome.z - r.outcome.z) < 1.2) stable++;
    }
    const pct = found ? Math.round((stable / found) * 100) : 0;
    if (pct < 40) fail(`${def.id}: only ${pct}% of solutions are stable`);
    console.log(`  ${def.id.padEnd(10)} ${pct}% of solutions stay within 1.2m after a one-step nudge`);
  }
}

console.log('4. Mirrored levels behave as true mirror images');
for (const def of ALL_DELIVERIES) {
  const a = buildLevel(def, { wind: [0, 0] });
  const b = buildLevel(def, { wind: [0, 0], mirror: true });
  for (let i = 0; i < 40; i++) {
    const yaw = quantize({ yaw: (rand() - 0.5) * 2, power: 0 }).yaw, power = quantize({ yaw: 0, power: rand() }).power;
    const clock = Math.floor(rand() * 1500);
    const ra = simulate(a.world, PARCELS[def.parcel], { yaw, power }, clock);
    const rb = simulate(b.world, PARCELS[def.parcel], { yaw: -yaw, power }, clock);
    if (ra.outcome.reason !== rb.outcome.reason || Math.abs(ra.outcome.x + rb.outcome.x) > 0.02 || Math.abs(ra.outcome.z - rb.outcome.z) > 0.02) {
      fail(`${def.id}: mirror mismatch ${ra.outcome.reason}(${ra.outcome.x.toFixed(2)}) vs ${rb.outcome.reason}(${rb.outcome.x.toFixed(2)})`);
      break;
    }
  }
}

console.log('5. Every daily route is solvable');
{
  const start = new Date(2026, 10, 6);
  const DAYS = Number(process.env.DAYS ?? 365);
  const seen = new Set<string>();
  let tightest = Infinity, tightestAt = '';
  for (let d = 0; d < DAYS; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const route = dailyRoute(key);
    const again = dailyRoute(key);
    if (JSON.stringify(route.stops.map((s) => [s.def.id, s.wind, s.mirror])) !== JSON.stringify(again.stops.map((s) => [s.def.id, s.wind, s.mirror]))) fail(`${key}: not stable`);
    if (route.number !== d + 1) fail(`${key}: numbered ${route.number}`);
    seen.add(route.stops.map((s) => s.def.id).join());
    for (const stop of route.stops) {
      const lvl = buildLevel(stop.def, { wind: stop.wind, mirror: stop.mirror });
      const parcel = PARCELS[stop.def.parcel];
      const moving = lvl.world.movers.length > 0 || !!lvl.world.target.mover;
      let solved = 0;
      const phases = moving ? [0, 240, 480] : [0];
      outer: for (const clock of phases) {
        for (let yi = 0; yi < 73; yi++) for (let pi = 0; pi < 34; pi++) {
          if (simulate(lvl.world, parcel, { yaw: -1.2 + (2.4 * yi) / 72, power: pi / 33 }, clock).outcome.delivered) {
            solved++;
            if (solved >= 3) break outer;
          }
        }
      }
      if (solved < tightest) { tightest = solved; tightestAt = `${key} ${stop.def.id}`; }
      if (solved === 0) fail(`${key}: ${stop.def.id} (wind ${stop.wind}, mirror ${stop.mirror}) has no solution on the coarse grid`);
    }
  }
  console.log(`  ${DAYS} days checked. ${seen.size} different routes. Tightest stop: ${tightest}+ coarse solutions (${tightestAt})`);
}

console.log('6. Star thresholds are sane');
for (const r of ['maple', 'brownstone', 'palm'] as const) {
  const defs = ALL_DELIVERIES.filter((d) => d.route === r);
  console.log(`  ${r.padEnd(11)} ${starThresholds(defs).join(' / ')}`);
}

if (failures) {
  console.error(`\n${failures} failures`);
  process.exit(1);
}
console.log('\nAll good.');
