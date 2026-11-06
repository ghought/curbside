# Curbside

**[Play it now](https://ghought.github.io/curbside/)**

Ridiculous trick-shot deliveries. Flick parcels from the curb onto increasingly awkward
doorsteps: bank off parked cars, thread open gates, skip pizzas across pools, and land on
tiny balconies.

## Run it

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-checks, then builds static files to `dist/` |
| `npm run solve` | Brute-forces every delivery with the real physics. `-- --write` updates `src/levels/par.json`, which sets the star thresholds. `-- --map` prints an outcome map |
| `npm run verify` | Proves the preview matches the throw, throws are deterministic, mirrored levels are true mirrors, and a year of daily routes is solvable. About 3 minutes. `DAYS=730` checks more |
| `npm run test:embed` | Runs the production build in a sandboxed iframe on the arcade origin and drives the whole bridge. Needs a build and installed Chrome. Set `GAME_URL` to test a live deployment instead |
| `npx tsx scripts/replay.ts <outdir>` | Plays a winning throw for all 15 deliveries through the live game and checks it scores what the solver said. Needs the dev server on port 5199 |

Pushing to `main` deploys to GitHub Pages through
[.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## How it works

- `src/sim/` is the game: a fixed-step (120 Hz) sphere physics core with no DOM or three.js
  in it. Aim inputs snap to a fine grid, so a replayed aim is the same throw exactly.
- The trajectory preview runs that same sim, so it can't disagree with the throw.
- `src/levels/builder.ts` prefabs emit colliders and a visual record from one call, so what
  you see and what you hit can't drift apart. `src/levels/routes.ts` holds the 15 deliveries.
- `src/render/` builds everything procedurally: no textures or models to download. Static
  props merge into three vertex-coloured meshes, and brick, siding and shingles are drawn in
  the shader in world space. Quality steps itself down on slow devices.
- All audio is synthesized in `src/audio.ts`, through one master gain.

If you change physics or a layout, run `npm run solve -- --write`, then `npm run verify`.

## The daily route

`src/levels/daily.ts` derives the route from the date alone: five of the 15 deliveries from
easy to hard, with seeded wind and mirroring. Everyone on the same calendar date gets the
same route. It needs no server and never runs out.

## PCKT Games

`public/pckt-bridge.js` is copied from `ghought/pckt-games`, and loads before the game. The
game declares pause, mute and restart. It reports `playStarted()` when a route begins and
`roundEnded({ score })` when it ends. Bridge setup is in `src/main.ts`.

Fonts are self-hosted through Fontsource, under the SIL Open Font License.
