/** Browser checks of the public theme preference and real computed palette. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { resolveChromium } from './browser.ts';

const base = process.argv[2] ?? 'http://127.0.0.1:4322';
const out = process.argv[3];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: resolveChromium() });
const luminance = (color: string) => {
  const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const contrast = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

try {
  const context = await browser.newContext({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const scheme = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await scheme(), 'dark', 'system dark on first visit');
  await page.locator('.theme-picker input:checked').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await scheme(), 'light', 'arrow keys change the native radio group');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await scheme(), 'dark');
  await page.locator(`.theme-picker label:has(input[value=${'light'}])`).click();
  assert.equal(await scheme(), 'light');
  await page.goto(base + '/projects/', { waitUntil: 'networkidle' });
  assert.equal(await scheme(), 'light', 'explicit preference survives navigation');
  assert.equal(await page.locator('.theme-picker input:checked').inputValue(), 'light');
  await page.locator(`.theme-picker label:has(input[value=${'system'}])`).click();
  assert.equal(await scheme(), 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await scheme(), 'light', 'Auto follows live system changes');
  await page.locator(`.theme-picker label:has(input[value=${'dark'}])`).click();
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await scheme(), 'dark', 'explicit dark overrides light OS');
  const second = await context.newPage();
  await second.goto(base + '/about/');
  await second.locator(`.theme-picker label:has(input[value=${'light'}])`).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await second.close();

  for (const theme of ['light', 'dark']) {
    await page.locator(`.theme-picker label:has(input[value=${theme}])`).click();
    const pairs = await page.evaluate(() => {
      const tokens = ['ink', 'ink-quiet', 'accent', 'being', 'syntax-green', 'syntax-violet', 'syntax-blue', 'syntax-magenta', 'syntax-rust', 'syntax-comment'];
      return tokens.map((token) => {
        const probe = document.createElement('span');
        probe.style.color = `var(--${token})`;
        probe.style.backgroundColor = `var(--${token.startsWith('syntax') ? 'paper-sunk' : 'paper'})`;
        document.body.append(probe);
        const { color, backgroundColor } = getComputedStyle(probe);
        probe.remove();
        return { token, color, backgroundColor };
      });
    });
    for (const pair of pairs) assert.ok(contrast(pair.color, pair.backgroundColor) >= 4.5, `${theme} ${pair.token}: contrast ${contrast(pair.color, pair.backgroundColor).toFixed(2)}`);
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, name] of [['/', 'home'], ['/projects/', 'projects'], ['/posts/scheduled-volume-backups/', 'code']]) {
        await page.goto(base + route, { waitUntil: 'networkidle' });
        assert.equal(await scheme(), theme);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${theme} ${route} ${width}: no overflow`);
        await page.evaluate(() => document.fonts.ready);
        for (const img of await page.locator('img').all()) {
          await img.evaluate((image: HTMLImageElement) => image.decode());
          await img.scrollIntoViewIfNeeded();
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        if (out) await page.screenshot({ path: `${out}/${theme}-${name}-${width}.png`, fullPage: true });
        if (name === 'code') {
          const tokens = await page.locator('.astro-code span[style]').evaluateAll((spans) => spans.map((span) => ({ style: span.getAttribute('style'), color: getComputedStyle(span).color, ground: getComputedStyle(span.closest('pre')!).backgroundColor })));
          assert.ok(tokens.length > 0);
          for (const token of tokens) {
            assert.ok(token.style?.includes('var(--'), 'built syntax uses semantic tokens');
            assert.ok(contrast(token.color, token.ground) >= 4.5, 'rendered code is readable');
          }
        }
        if (name === 'projects' && theme === 'dark') {
          await page.locator('.art-link').first().click();
          await page.locator('dialog img').evaluate((img: HTMLImageElement) => img.decode());
          const drawing = await page.locator('dialog .art-plane').evaluate((plane) => ({ ground: getComputedStyle(plane).backgroundColor, annotation: getComputedStyle(plane.querySelector('.annotation')!).color }));
          assert.ok(contrast(drawing.annotation, drawing.ground) >= 4.5, 'red annotations on paper stay readable');
          if (out) await page.screenshot({ path: `${out}/dark-viewer-${width}.png` });
          await page.keyboard.press('Escape');
        }
      }
    }
    console.log(`${theme}: palette, code, responsive pages and illustrations passed`);
  }

  // Persisted choice must apply even before deferred component scripts execute.
  await page.locator(`.theme-picker label:has(input[value=${'dark'}])`).click();
  const initial = await context.newPage();
  await initial.route('**/*.js', (route) => route.abort());
  await initial.goto(base + '/about/', { waitUntil: 'domcontentloaded' });
  assert.equal(await initial.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await initial.close();

  const plain = await browser.newPage({ javaScriptEnabled: false, colorScheme: 'dark' });
  await plain.goto(base + '/projects/');
  assert.equal(await plain.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
  assert.equal(await plain.locator('.theme-picker').isVisible(), false);
  const blocked = await browser.newPage({ colorScheme: 'dark' });
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } });
  });
  await blocked.goto(base);
  await blocked.locator(`.theme-picker label:has(input[value=${'light'}])`).click();
  assert.equal(await blocked.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light');
  assert.deepEqual(errors, []);
  console.log('Persistence, system changes, cross-tab sync, early initialization, no JS and blocked storage passed');
} finally {
  await browser.close();
}
