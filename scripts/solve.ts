// Brute-forces every delivery with the real sim. Prints each level's reachable outcomes
// and tricks, so a layout can't ship unsolvable. `--write` updates src/levels/par.json.

import { writeFileSync } from 'node:fs';
import { ALL_DELIVERIES, buildLevel } from '../src/levels/routes';
import { simulate } from '../src/sim/physics';
import { detectTricks, scoreThrow } from '../src/sim/scoring';
import { PARCELS } from '../src/sim/types';

const args = process.argv.slice(2);
const write = args.includes('--write');
const map = args.includes('--map');
const only = args.find((a) => !a.startsWith('--'));

const YAWS = 121, POWERS = 51;
const SPAN = 1.25;
const par: Record<string, number> = {};
let failed = 0;

for (const def of ALL_DELIVERIES) {
  if (only && def.id !== only) continue;
  const lvl = buildLevel(def);
  const parcel = PARCELS[def.parcel];
  const moving = lvl.world.movers.length > 0 || !!lvl.world.target.mover;
  const phases = moving ? [0, 120, 240, 360, 480, 600, 720, 840] : [0];

  const reasons: Record<string, number> = {};
  const tricks: Record<string, number> = {};
  let solved = 0, total = 0, best = 0;
  let bestAt = '';
  const grid: string[] = [];
  for (let pi = 0; pi < POWERS; pi++) grid.push('');

  for (const clock of phases) {
    for (let yi = 0; yi < YAWS; yi++) {
      const yaw = -SPAN + (2 * SPAN * yi) / (YAWS - 1);
      for (let pi = 0; pi < POWERS; pi++) {
        const power = pi / (POWERS - 1);
        const r = simulate(lvl.world, parcel, { yaw, power }, clock);
        total++;
        reasons[r.outcome.reason] = (reasons[r.outcome.reason] ?? 0) + 1;
        if (clock === 0) {
          const c = r.outcome.delivered ? '#' : r.outcome.reason[0];
          grid[pi] += c;
        }
        if (r.outcome.delivered) {
          solved++;
          const s = scoreThrow(lvl.world, r.body, r.events, r.outcome, 0);
          for (const t of detectTricks(r.body, r.events, r.outcome)) tricks[t.name] = (tricks[t.name] ?? 0) + 1;
          if (s.total > best) {
            best = s.total;
            bestAt = `yaw ${yaw.toFixed(2)} power ${power.toFixed(2)} clock ${clock} (${s.tricks.map((t) => t.name).join(', ') || 'clean'})`;
          }
        }
      }
    }
  }

  par[def.id] = best;
  const pct = ((solved / total) * 100).toFixed(2);
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 9)
    .map(([k, v]) => `${k} ${((v / total) * 100).toFixed(1)}%`).join('  ');
  console.log(`\n[${def.route}] ${def.id} (${def.parcel})  solved ${solved}/${total} = ${pct}%  best ${best}`);
  console.log(`   best: ${bestAt}`);
  console.log(`   ends: ${top}`);
  console.log(`   tricks on delivered throws: ${Object.entries(tricks).map(([k, v]) => `${k}:${v}`).join('  ') || 'none'}`);
  if (map) for (let pi = POWERS - 1; pi >= 0; pi -= 2) console.log('   ' + grid[pi]);
  if (solved === 0) failed++;
}

if (write && !only) {
  writeFileSync(new URL('../src/levels/par.json', import.meta.url), JSON.stringify(par, null, 2) + '\n');
  console.log('\nWrote src/levels/par.json');
}
if (failed) {
  console.error(`\n${failed} deliveries have no solution.`);
  process.exit(1);
}
