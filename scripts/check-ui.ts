/** Behavior checks against a production example preview: npm run test:ui -- URL */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { resolveChromium } from './browser.ts';

const base = process.argv[2] ?? 'http://127.0.0.1:4321';
const screenshots = process.argv[3];
if (screenshots) mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch({ executablePath: resolveChromium() });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/projects/', '/about/', '/archive/', '/tag/ai-agents/', '/search/']) {
      assert.equal((await page.goto(base + route, { waitUntil: 'networkidle' }))?.status(), 200);
      const layout = await page.evaluate(() => {
        const rect = (selector: string) => {
          const box = document.querySelector(selector)!.getBoundingClientRect();
          return { x: box.x, width: box.width };
        };
        return { main: rect('main'), header: rect('.site-header'), footer: rect('.site-footer'), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.deepEqual(layout.main, layout.header, `${route}: main and header share frame`);
      assert.deepEqual(layout.main, layout.footer, `${route}: main and footer share frame`);
      assert.equal(layout.overflow, false, `${route} at ${width}: no overflow`);
    }
    await page.goto(base + '/projects/', { waitUntil: 'networkidle' });
    assert.ok((await page.locator('.experiment-sketch').first().boundingBox())!.width <= 400);
    for (const selector of ['.art-link', '.art-hint a']) {
      const trigger = page.locator(selector).first();
      await trigger.click();
      const dialog = page.locator('#image-viewer');
      assert.equal(await dialog.evaluate((node: HTMLDialogElement) => node.open), true);
      assert.equal(await page.locator('[data-viewer-close]').evaluate((node) => node === document.activeElement), true);
      assert.equal(await dialog.locator('.annotation').count(), 3, 'retain authored annotations');
      await dialog.locator('img').evaluate((img: HTMLImageElement) => img.decode());
      if (screenshots && selector === '.art-link') await page.screenshot({ path: `${screenshots}/viewer-${width}.png` });
      await page.keyboard.press('Shift+Tab');
      assert.equal(await dialog.locator('.viewer-original').evaluate((node) => node === document.activeElement), true, 'native focus stays inside dialog');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('[data-viewer-close]').evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press('/');
      assert.equal(new URL(page.url()).pathname, '/projects/', 'search shortcut must not leave modal');
      await dialog.locator('img').click();
      assert.equal(await dialog.evaluate((node: HTMLDialogElement) => node.open), true, 'image click keeps dialog open');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog[open]'));
      assert.equal(await trigger.evaluate((node) => node === document.activeElement), true, 'restore exact trigger focus');
      assert.notEqual(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
      await trigger.click();
      await page.locator('[data-viewer-close]').click();
      await page.waitForFunction(() => !document.querySelector('dialog[open]'));
      await trigger.click();
      await page.mouse.click(2, 2);
      await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    }
    console.log(`Frame, modal, focus and dismissal: ${width}px`);
  }

  // Measure after fonts settle: typing must never move the content below it.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const before = await page.locator('.feature').boundingBox();
  await page.waitForFunction(() => !document.querySelector('[data-typed-headline].typing, [data-typed-headline].finished'));
  const after = await page.locator('.feature').boundingBox();
  assert.equal(before!.y, after!.y, 'typing preserves layout height');
  const headline = await page.locator('[data-typed-text]').textContent();
  assert.equal(headline, 'Собираю свою цифровую жизнь');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-typed-text]').textContent(), headline);
  assert.equal(await page.locator('.typing, .finished').count(), 0, 'reduced motion stays static');
  await page.locator('.art-link').first().click();
  assert.equal(await page.locator('dialog[open]').count(), 1, 'homepage also uses shared viewer');
  await page.keyboard.press('Escape');

  const plain = await browser.newPage({ javaScriptEnabled: false });
  await plain.goto(base + '/projects/');
  const imageUrl = await plain.locator('.art-link').first().getAttribute('href');
  await plain.locator('.art-hint a').first().click();
  assert.equal(new URL(plain.url()).pathname, imageUrl, 'no-JS opens original image');
  await plain.goto(base + '/');
  assert.equal(await plain.locator('[data-typed-text]').textContent(), headline, 'no-JS heading is complete');
  assert.equal((await plain.request.get(base + '/rss/index.xml')).status(), 200);
  assert.deepEqual(errors, [], 'no browser errors');
  if (screenshots && (await page.request.get(base + '/_ui/')).status() === 200) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + '/_ui/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.querySelector('.typing, .finished'));
    await page.screenshot({ path: `${screenshots}/catalog.png`, fullPage: true });
  }
  console.log('Typing, reduced motion, no-JS fallback and RSS: passed');
} finally {
  await browser.close();
}
