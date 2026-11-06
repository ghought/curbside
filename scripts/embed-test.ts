// Loads the production build the way the arcade does: a sandboxed cross-origin iframe on the
// real hub origin, from a subpath, and drives the whole bridge protocol. `npm run test:embed`

import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, type BrowserContext, type Frame, type Page } from 'playwright-core';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SUB = '/games/curbside/';
const ORIGIN = 'https://game.curbside.test';
// Set GAME_URL to test a real deployment instead of the local build.
const LIVE = process.env.GAME_URL;
const GAME = LIVE ?? `${ORIGIN}${SUB}`;
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };

/** Serves dist/ from a subpath on a separate https origin, like a real game host. */
async function serveGame(ctx: BrowserContext) {
  if (LIVE) return;
  await ctx.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith(SUB)) return route.fulfill({ status: 404 });
    let file = join(DIST, path.slice(SUB.length) || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } });
  });
}

let failures = 0;
const check = (name: string, ok: unknown, extra = '') => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name} ${extra}`);
  if (!ok) failures++;
};

const HOST = `<!doctype html><html><body style="margin:0;background:#222">
<iframe id="g" sandbox="allow-scripts allow-same-origin" src="${GAME}" style="width:390px;height:844px;border:0"></iframe>
<script>
  const f = document.getElementById('g');
  const session = 's-' + Math.random().toString(36).slice(2);
  window.msgs = [];
  window.send = (type, payload) => f.contentWindow.postMessage({ namespace: 'pckt-games', version: 1, gameId: 'curbside', sessionId: session, eventId: Math.random().toString(36), type, payload }, new URL(f.src).origin);
  window.addEventListener('message', (e) => { if (e.data && e.data.namespace === 'pckt-games') window.msgs.push(e.data); });
  f.addEventListener('load', () => {
    const t = setInterval(() => {
      if (window.msgs.some((m) => m.type === 'READY')) return clearInterval(t);
      window.send('INIT', { canonicalUrl: 'https://pckt.up.railway.app/games/curbside' });
    }, 150);
  });
</script></body></html>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function hostPage(block?: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await serveGame(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push(`dialog: ${d.message()}`); void d.dismiss(); });
  if (block) {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
    });
  }
  await page.route('https://pckt.up.railway.app/**', (r) => r.fulfill({ contentType: 'text/html', body: HOST }));
  await page.goto('https://pckt.up.railway.app/games/curbside');
  await page.waitForFunction(() => (window as unknown as { msgs: { type: string }[] }).msgs.some((m) => m.type === 'READY'), null, { timeout: 15000 });
  const frame = page.frames().find((f) => f.url().startsWith(GAME))!;
  return { page, frame, errors, ctx };
}

const msgs = (p: Page) => p.evaluate(() => (window as unknown as { msgs: { type: string; payload?: Record<string, unknown> }[] }).msgs);
const send = (p: Page, type: string, payload?: unknown) => p.evaluate(([t, d]) => (window as unknown as { send(t: unknown, d: unknown): void }).send(t, d), [type, payload] as const);

/** A quick deliberate miss: throw it into the road, then tap through the slip. */
async function throwAway(page: Page, frame: Frame) {
  await page.mouse.move(195, 420);
  await page.mouse.down();
  await page.mouse.move(195, 340, { steps: 3 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await frame.locator('.slip .btn').click({ timeout: 8000 });
}

{
  console.log('\n-- In the arcade --');
  const { page, frame, errors, ctx } = await hostPage();
  let m = await msgs(page);
  const ready = m.find((x) => x.type === 'READY');
  check('READY arrives with the real capabilities', JSON.stringify(ready?.payload) === '{"capabilities":{"pause":true,"mute":true,"restart":true}}', JSON.stringify(ready?.payload));
  check('Assets load from a subpath', (await frame.locator('.menu').count()) === 1);

  await frame.locator('.ticket').click();
  await page.waitForTimeout(300);
  m = await msgs(page);
  check('PLAY_STARTED when a round begins', m.some((x) => x.type === 'PLAY_STARTED'));
  check('Starts with the customer note', (await frame.locator('.note').count()) === 1);

  await send(page, 'PAUSE');
  await page.waitForTimeout(200);
  m = await msgs(page);
  check('PAUSE is answered with PAUSED', m.some((x) => x.type === 'PAUSED'));
  check('The pause dialog shows', (await frame.locator('.dialog').count()) === 1);
  await send(page, 'RESUME');
  await page.waitForTimeout(200);
  m = await msgs(page);
  check('RESUME is answered with resumed PLAY_STARTED', m.some((x) => x.type === 'PLAY_STARTED' && x.payload?.resumed));
  check('The pause dialog closes', (await frame.locator('.dialog').count()) === 0);

  await send(page, 'SET_MUTED', { muted: true });
  await page.waitForTimeout(100);
  await frame.locator('[data-act="pause"]').click();
  check('SET_MUTED reaches the game', (await frame.locator('[data-act="mute"]').textContent())?.includes('off'));
  await frame.locator('[data-act="resume"]').click();

  await throwAway(page, frame);
  await send(page, 'RESTART');
  await page.waitForTimeout(300);
  const started = (await msgs(page)).filter((x) => x.type === 'PLAY_STARTED' && !x.payload?.resumed).length;
  check('RESTART restarts the route', started >= 2, `(${started} round starts)`);

  for (let i = 0; i < 15; i++) await throwAway(page, frame);
  await frame.locator('.summary').waitFor({ timeout: 8000 });
  m = await msgs(page);
  const end = m.find((x) => x.type === 'ROUND_ENDED');
  check('ROUND_ENDED with a score at the end of the route', end && typeof end.payload?.score === 'number', JSON.stringify(end?.payload));

  await frame.locator('[data-act="share"]').click();
  await page.waitForTimeout(250);
  const shareBox = await frame.locator('.share-box').count();
  const shared = shareBox ? await frame.locator('.share-box').inputValue() : await frame.locator('[data-act="share"]').getAttribute('data-arg');
  check('Share link is the canonical arcade URL', shared?.includes('https://pckt.up.railway.app/games/curbside'), JSON.stringify(shared));
  check('No errors or dialogs', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

{
  console.log('\n-- Storage denied --');
  const { page, frame, errors, ctx } = await hostPage(true);
  await frame.locator('.route').first().click();
  await page.waitForTimeout(300);
  await throwAway(page, frame);
  check('Runs with localStorage throwing', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

{
  console.log('\n-- On its own URL --');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await serveGame(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(GAME);
  await page.locator('.route').first().click();
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  check('Resizing keeps the game going', (await page.locator('.hud').isVisible()) && (await page.locator('.note').count()) === 1);
  check('Plays standalone with no errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nAll embed checks passed.');
process.exit(failures ? 1 : 0);
