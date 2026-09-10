/**
 * Screenshots of a running site, so a change to the design can be looked at
 * instead of reasoned about.
 *
 * Design §12 is a visual specification, and until this existed the only way to
 * check it was to ask the maintainer to open a browser — which is how a redesign
 * shipped twice without anyone seeing it (oh-my-portal-tzo).
 *
 *   npm run preview &          # or any server; dev works too
 *   node scripts/screenshot.ts [outDir] [baseUrl]
 *
 * NixOS: the browsers come from the nix store rather than from `npx playwright
 * install`, and the store's chromium build rarely matches the revision the npm
 * package expects — playwright then reports "Executable doesn't exist" for a
 * path with a different number in it. PLAYWRIGHT_BROWSERS_PATH is already set by
 * the system, so the fix is to hand playwright the binary directly and let it
 * skip the revision check. That is what resolveChromium does; on any other
 * platform it returns nothing and playwright uses its own download.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright';

const out = process.argv[2] ?? 'screenshots';
const base = process.argv[3] ?? 'http://127.0.0.1:4321';

/** Every viewport worth a look, and why it is worth one. */
const SHOTS: { path: string; name: string; width: number; height: number }[] = [
  { path: '/', name: 'index-desktop', width: 1440, height: 900 },
  { path: '/', name: 'index-mobile', width: 390, height: 844 },
  { path: '/', name: 'index-small', width: 320, height: 740 },
  { path: '/posts/reverse-proxy-behind-wireguard/', name: 'article-desktop', width: 1440, height: 900 },
  { path: '/posts/reverse-proxy-behind-wireguard/', name: 'article-mobile', width: 390, height: 844 },
  { path: '/projects/', name: 'projects-desktop', width: 1440, height: 900 },
  { path: '/archive/', name: 'archive-mobile', width: 390, height: 844 },
  { path: '/posts/why-i-stopped-tuning-my-setup/', name: 'revision-desktop', width: 1440, height: 900 },
  { path: '/posts/why-i-stopped-tuning-my-setup/', name: 'revision-mobile', width: 390, height: 844 },
  /* The code-heavy article: §12's syntax palette is the thing most easily broken
     by a change nobody thought touched it. */
  { path: '/posts/scheduled-volume-backups/', name: 'code-desktop', width: 1440, height: 900 },
  { path: '/posts/scheduled-volume-backups/', name: 'code-mobile', width: 390, height: 844 },
];

/** The nix-store chromium, when there is one. Empty on every other platform. */
function resolveChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dir = readdirSync(root).find((entry) => entry.startsWith('chromium-'));
  if (!dir) return undefined;
  const binary = join(root, dir, 'chrome-linux64', 'chrome');
  return existsSync(binary) ? binary : undefined;
}

mkdirSync(out, { recursive: true });

const executablePath = resolveChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});

let failed = false;
for (const { path, name, width, height } of SHOTS) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  const response = await page.goto(base + path, { waitUntil: 'networkidle' });
  const status = response?.status() ?? 0;
  if (status !== 200) failed = true;
  await page.evaluate(() => document.fonts.ready);
  const brokenImages = await page.evaluate(() => Array.from(document.images).filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src));
  if (brokenImages.length) {
    failed = true;
    console.error(`Images failed to load: ${name}`, brokenImages);
  }
  const brokenFonts = await page.evaluate(() => Array.from(document.fonts)
    .filter((face) => face.status === 'error')
    .map((face) => `${face.family} ${face.weight} ${face.style}`));
  if (brokenFonts.length) {
    failed = true;
    console.error(`Fonts failed to load: ${name}`, brokenFonts);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) {
    failed = true;
    console.error(`Horizontal page overflow: ${name}`);
  }
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await page.close();
  console.log(`${status} ${name}`);
}

await browser.close();

/*
 * A 404 here means an address moved and something else still points at the old
 * one, which is R1 territory — worth failing over rather than logging.
 */
if (failed) {
  console.error('A page failed its HTTP, image, font or viewport-width check.');
  process.exit(1);
}
