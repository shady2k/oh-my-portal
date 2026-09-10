/**
 * The anonymous journal cover, independent of content and the Astro build.
 * Run: node scripts/og-card.ts (or npm run og).
 *
 * Paper is deliberately fixed to light: a chat preview has its own theme.
 * Type and spacing are enlarged from the site tokens for a 320px unfurl.
 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveChromium } from './browser.ts';

const root = new URL('../', import.meta.url);
const output = new URL('public/og.png', root);
const tokens = readFileSync(new URL('src/styles/tokens.css', root), 'utf8');
const fontsURL = new URL('src/styles/fonts.css', root);
// Keep the site's face declarations, weights and Unicode ranges. Data URLs
// make this render fully local, without a server or file-origin restrictions.
const fonts = readFileSync(fontsURL, 'utf8').replace(
  /url\('([^']+)'\)/g,
  (_, path: string) => `url('data:font/woff2;base64,${readFileSync(new URL(path, fontsURL)).toString('base64')}')`,
);

const html = `<!doctype html>
<html lang="ru" data-theme="light">
<meta charset="utf-8">
<title>Полевой журнал</title>
<style>
${tokens}
${fonts}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--face-prose);
}
main {
  width: 1200px;
  height: 630px;
  padding: var(--space-4);
  display: grid;
  grid-template-columns: var(--measure) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: center;
}
h1 {
  margin: 0;
  font-size: calc(var(--step-3) * 2.5);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.035em;
}
.subjects {
  margin: var(--space-4) 0 0;
  font-size: calc(var(--step-1) * 2);
  line-height: 1.25;
  color: var(--ink-quiet);
}
.article-margin {
  padding-left: var(--space-3);
  border-left: 1px solid var(--rule);
}
.pencil-rule {
  display: block;
  width: calc(var(--space-5) + var(--space-4));
  height: var(--space-2);
  margin-bottom: var(--space-3);
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linecap: round;
}
.pencil-rule path { vector-effect: non-scaling-stroke; }
.pencil-rule .trace { opacity: 0.4; stroke-width: 1.2; }
.margin-label {
  margin: 0 0 var(--space-2);
  font-size: calc(var(--step-0) * 2);
  font-weight: 400;
  color: var(--ink-quiet);
  line-height: 1.25;
}
.margin-note {
  margin: 0;
  font-size: calc(var(--step-1) * 2);
  line-height: 1.25;
}
.formats {
  margin: var(--space-5) 0 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--rule);
  font-family: var(--face-utility);
  font-size: calc(var(--step-0) * 2);
  line-height: 1.25;
  color: var(--ink-quiet);
}
</style>
<main>
  <header>
    <h1><span data-font="sans">Полевой</span><br><span data-font="sans">журнал</span></h1>
    <p class="subjects" data-font="sans">Домашняя инфраструктура,<br>инструменты и ИИ-агенты</p>
  </header>
  <aside class="article-margin">
    <!-- The two irregular paths from src/components/PencilRule.astro,
         used as a short editorial mark, independent of the title's width. -->
    <svg class="pencil-rule" viewBox="0 0 1000 12" preserveAspectRatio="none" fill="none" aria-hidden="true">
      <path d="M2 7 C128 4 208 8 337 5 S552 7 682 5 S862 7 998 3" />
      <path class="trace" d="M12 9 C150 6 245 10 364 7 S585 9 720 7 S878 8 981 6" />
    </svg>
    <h2 class="margin-label" data-font="sans">Каждый рецепт</h2>
    <p class="margin-note" data-font="sans">Версии и дата<br>проверки</p>
    <p class="formats" data-font="mono">HTML + Markdown</p>
  </aside>
</main>
</html>`;

const executablePath = resolveChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);

  // CSS font-family and document.fonts.check alone cannot prove which face
  // painted the glyphs. Chromium reports the actual fonts used for each node.
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const { root: documentNode } = await session.send('DOM.getDocument');
  for (const [kind, family] of [['sans', 'IBM Plex Sans'], ['mono', 'IBM Plex Mono']]) {
    const { nodeIds } = await session.send('DOM.querySelectorAll', {
      nodeId: documentNode.nodeId, selector: `[data-font="${kind}"]`,
    });
    if (!nodeIds.length) throw new Error(`Missing ${kind} text`);
    for (const nodeId of nodeIds) {
      const { fonts: rendered } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
      if (!rendered.length || rendered.some((font) =>
        !font.isCustomFont || !font.familyName.startsWith(family) || font.glyphCount === 0)) {
        throw new Error(`Font fallback on ${kind}: ${JSON.stringify(rendered)}`);
      }
      console.log(`Rendered ${kind}: ${JSON.stringify(rendered)}`);
    }
  }
  const overflow = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('[data-font]'));
    return document.documentElement.scrollHeight > innerHeight ||
      document.documentElement.scrollWidth > innerWidth || elements.some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight;
      });
  });
  if (overflow) throw new Error('Card text exceeds the canvas');

  mkdirSync(new URL('public/', root), { recursive: true });
  const png = await page.screenshot({ path: fileURLToPath(output) });
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== 1200 || height !== 630) throw new Error(`Unexpected PNG dimensions: ${width}×${height}`);
  console.log(`${fileURLToPath(output)}: ${width}×${height}, deviceScaleFactor 1`);

  // Inspect the actual PNG at chat size, not a reflowed version of the HTML.
  // A unique scratch directory keeps this review artifact outside the repo.
  const preview = join(mkdtempSync(join(tmpdir(), 'og-card-')), 'og-320.png');
  await page.setViewportSize({ width: 320, height: 168 });
  await page.setContent(`<!doctype html><html><style>
    html, body { margin: 0; }
    img { display: block; width: 320px; height: 168px; }
    </style><img alt="" src="data:image/png;base64,${png.toString('base64')}"></html>`);
  await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  const thumbnail = await page.screenshot({ path: preview });
  if (thumbnail.readUInt32BE(16) !== 320 || thumbnail.readUInt32BE(20) !== 168) {
    throw new Error('Unexpected thumbnail dimensions');
  }
  console.log(`320px visual review: ${preview}`);
} finally {
  await browser.close();
}
