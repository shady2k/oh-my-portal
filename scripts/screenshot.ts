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
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright';
import { resolveChromium } from './browser.ts';

/*
 * `--path` exists for the writing agent: design §5 step 7 is "build, then
 * screenshot.ts, and the model looks", and the fixed list below cannot show a
 * page that was written five minutes ago. Repeatable, and each address is shot
 * at the two viewports that matter — desktop and a phone.
 */
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};
const VALUE_FLAGS = new Set(['--path', '--out', '--base']);
const positional = argv.filter((arg, i) => !VALUE_FLAGS.has(arg) && !VALUE_FLAGS.has(argv[i - 1] ?? ''));
const paths = argv.reduce<string[]>((acc, arg, i) => (arg === '--path' ? [...acc, argv[i + 1]] : acc), []);

const VIEWS = [
  { suffix: 'desktop', width: 1440, height: 900 },
  { suffix: 'mobile', width: 390, height: 844 },
];

const out = flag('out') ?? positional[0] ?? 'screenshots';
const base = flag('base') ?? positional[1] ?? 'http://127.0.0.1:4321';

/** Every viewport worth a look, and why it is worth one. */
const SHOTS: { path: string; name: string; width: number; height: number }[] = [
  { path: '/', name: 'index-desktop', width: 1440, height: 900 },
  { path: '/', name: 'index-mobile', width: 390, height: 844 },
  { path: '/', name: 'index-small', width: 320, height: 740 },
  { path: '/posts/reverse-proxy-behind-wireguard/', name: 'article-desktop', width: 1440, height: 900 },
  { path: '/posts/reverse-proxy-behind-wireguard/', name: 'article-mobile', width: 390, height: 844 },
  { path: '/projects/', name: 'projects-desktop', width: 1440, height: 900 },
  { path: '/projects/', name: 'projects-mobile', width: 390, height: 844 },
  { path: '/projects/', name: 'projects-small', width: 320, height: 740 },
  { path: '/about/', name: 'about-desktop', width: 1440, height: 900 },
  { path: '/about/', name: 'about-mobile', width: 390, height: 844 },
  { path: '/search/', name: 'search-mobile', width: 390, height: 844 },
  { path: '/tag/ai-agents/', name: 'tag-desktop', width: 1440, height: 900 },
  { path: '/archive/', name: 'archive-mobile', width: 390, height: 844 },
  { path: '/posts/why-i-stopped-tuning-my-setup/', name: 'revision-desktop', width: 1440, height: 900 },
  { path: '/posts/why-i-stopped-tuning-my-setup/', name: 'revision-mobile', width: 390, height: 844 },
  /* The code-heavy article: §12's syntax palette is the thing most easily broken
     by a change nobody thought touched it. */
  { path: '/posts/scheduled-volume-backups/', name: 'code-desktop', width: 1440, height: 900 },
  { path: '/posts/scheduled-volume-backups/', name: 'code-mobile', width: 390, height: 844 },
];

/*
 * With no `--path` this is the fixed list, unchanged. With one, only the named
 * addresses: a draft has no entry in that list, and shooting all of it to look
 * at one page would spend the part of the run a human is waiting on.
 */
const shots = paths.length
  ? paths.flatMap((path) => {
      const name = path.replace(/^\/|\/$/g, '').replace(/\//g, '-');
      return VIEWS.map((view) => ({ path, name: `${name}-${view.suffix}`, width: view.width, height: view.height }));
    })
  : SHOTS;


mkdirSync(out, { recursive: true });

const executablePath = resolveChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});

let failed = false;
for (const { path, name, width, height } of shots) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  const response = await page.goto(base + path, { waitUntil: 'networkidle' });
  const status = response?.status() ?? 0;
  if (status !== 200) failed = true;
  await page.evaluate(() => document.fonts.ready);
  /*
   * Scroll through the page *first*: an image with `loading="lazy"` that is below
   * the fold has not started loading, and `decode()` on it never settles — the
   * article footer's avatar hung this whole run forever, measured 2026-09-12,
   * which is the worst possible failure for a tool whose job is to notice broken
   * pictures. Scrolling starts the loads; the bound below makes sure that even an
   * image which never begins (hidden, or in a collapsed element) cannot stall the
   * run. A picture that is still incomplete afterwards fails the image check
   * below, by name, which is what should happen.
   */
  for (const image of await page.locator('img').all()) await image.scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    Promise.race([
      Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {}))),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]),
  );
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.waitForFunction(() => !document.querySelector('[data-typed-headline].typing, [data-typed-headline].finished'));
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
