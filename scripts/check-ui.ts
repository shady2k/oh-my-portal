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
    for (const route of ['/', '/projects/', '/projects/example-engine/', '/about/', '/archive/', '/tag/ai-agents/', '/search/']) {
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

      // The current section wears the same ink bar as the chosen theme, and nothing else does.
      const marks = await page.evaluate(() => [...document.querySelectorAll('.masthead a')].map((a) => ({
        current: a.getAttribute('aria-current') === 'page',
        bar: getComputedStyle(a).boxShadow !== 'none',
        bottom: a.getBoundingClientRect().bottom,
      })));
      const current = marks.filter((mark) => mark.current);
      assert.equal(current.length, route === '/' ? 0 : 1, `${route}: one section is current`);
      for (const mark of marks) {
        assert.equal(mark.bar, mark.current, `${route} at ${width}: only the current section carries the bar`);
      }
      if (width === 1440 && current[0]) {
        const theme = await page.evaluate(() => document.querySelector('.theme-picker input:checked + .theme-option')!.getBoundingClientRect().bottom);
        assert.ok(Math.abs(current[0].bottom - theme) <= 1, `${route}: the section bar lines up with the theme bar`);
      }
    }
    // Handwritten notes stay on the drawing, in their bands, whatever the text
    // and whatever the picture — tried with the longest annotation the schema
    // accepts (50 characters) on a picture three times wider than tall.
    for (const route of ['/', '/projects/', '/projects/example-engine/']) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      const wide = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><rect width="300" height="100" fill="#ccc"/></svg>');
      await page.locator('.art-plane img').first().evaluate((img: HTMLImageElement, src) => {
        img.removeAttribute('srcset');
        img.src = src;
        return img.decode();
      }, wide);
      const drawing = await page.evaluate(() => {
        const longest = 'длинная пометка на полях рисунка про самое главное'.slice(0, 50);
        const plane = document.querySelector('.art-plane');
        if (!plane) return null;
        plane.querySelectorAll<HTMLElement>('.annotation').forEach((note) => { note.textContent = longest; });
        const box = plane.getBoundingClientRect();
        return { square: Math.abs(box.width - box.height) <= 1, notes: [...plane.querySelectorAll<HTMLElement>('.annotation')].map((note, index) => {
          const r = note.getBoundingClientRect();
          return {
            index,
            inside: r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1,
            topBand: r.bottom <= box.top + box.height * 0.25,
            bottomBand: r.top >= box.top + box.height * 0.75,
            // Handwriting ink always pokes a few pixels past its line box; a
            // clipped note is one whose box hides at least half a line.
            clipped: getComputedStyle(note).overflow !== 'visible' && note.scrollHeight - note.clientHeight > parseFloat(getComputedStyle(note).lineHeight) / 2,
          };
        }) };
      });
      assert.ok(drawing && drawing.notes.length === 3, `${route}: the drawing has three notes to check`);
      assert.ok(drawing.square, `${route} at ${width}: the drawing keeps its square sheet whatever the picture`);
      for (const note of drawing.notes) {
        assert.ok(note.inside, `${route} at ${width}: note ${note.index} stays inside the drawing`);
        assert.ok(note.index < 2 ? note.topBand : note.bottomBand, `${route} at ${width}: note ${note.index} stays in its band`);
        assert.equal(note.clipped, false, `${route} at ${width}: note ${note.index} is not clipped`);
      }
    }

    // A link that leaves the site says so with an arrow; one that stays does not.
    await page.goto(base + '/about/', { waitUntil: 'networkidle' });
    const arrows = await page.evaluate(() => [...document.querySelectorAll('main a[href]')].map((a) => ({
      external: a.getAttribute('target') === '_blank',
      arrow: getComputedStyle(a, '::after').content.includes('↗'),
    })));
    assert.ok(arrows.some((link) => link.external), 'about page has an external link to check');
    for (const link of arrows) assert.equal(link.arrow, link.external, `at ${width}: the arrow marks exactly the external links`);

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

  // Page jump: each control shows only while it is useful, the jumps are plain
  // fragments so Back returns to the reading place, and a short article shows
  // neither control.
  {
    const settled = (up: boolean, down: boolean, why: string) =>
      page.waitForFunction(([u, d]) => {
        const shows = (name: string) => getComputedStyle(document.querySelector(`[data-jump="${name}"]`)!).visibility === 'visible';
        return shows('up') === u && shows('down') === d;
      }, [up, down], { timeout: 2000 }).catch(() => { throw new Error(`page jump: ${why}`); });
    const article = '/posts/scheduled-volume-backups/';

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + article, { waitUntil: 'networkidle' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${article} at ${width}: no overflow`);
      if (width === 1440) {
        const edge = await page.evaluate(() => ({
          jump: document.querySelector('.page-jump')!.getBoundingClientRect().right,
          frame: document.querySelector('main')!.getBoundingClientRect().right,
        }));
        assert.ok(edge.jump <= edge.frame + 1, 'page jump stays inside the frame on a wide screen');
      }
      if (width === 390) {
        // On a narrow screen the inset is the frame's own margin, --space-3.
        // clientWidth, not innerWidth: the fixed control's 100% excludes a
        // classic scrollbar, and innerWidth includes it.
        const inset = await page.evaluate(() => document.documentElement.clientWidth - document.querySelector('.page-jump')!.getBoundingClientRect().right);
        assert.ok(Math.abs(inset - 24) <= 1, `page jump sits 1.5rem from the edge at 390 (got ${inset}px)`);
      }
    }

    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto(base + article, { waitUntil: 'networkidle' });
    const end = await page.evaluate(() => document.getElementById('page:end')!.getBoundingClientRect().top + scrollY);
    assert.ok(end > 600 * 3, 'the long example article scrolls several screens before its end');
    assert.equal(await page.locator('.page-jump').evaluate((nav: HTMLElement) => nav.hidden), false, 'the script reveals the page jump');
    await settled(false, true, 'at the top only ↓ shows');
    assert.equal(
      await page.locator('[data-jump="up"]').evaluate((a: HTMLElement) => { a.focus(); return document.activeElement === a; }),
      false,
      'a hidden control takes no focus',
    );

    await page.evaluate((y) => scrollTo(0, y), Math.round(end / 2));
    await settled(true, true, 'midway both show');
    const reading = await page.evaluate(() => scrollY);
    await page.locator('[data-jump="down"]').click();
    assert.equal(new URL(page.url()).hash, '#page:end', '↓ is a plain fragment link');
    assert.ok(
      await page.evaluate(() => { const r = document.getElementById('page:end')!.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }),
      '↓ brings the neighbours block into view',
    );
    await settled(true, false, 'at the end only ↑ shows');
    await page.evaluate(() => history.back());
    await page.waitForFunction((y) => Math.abs(scrollY - y) <= 2, reading, { timeout: 2000 });
    await page.locator('[data-jump="up"]').click();
    await page.waitForFunction(() => scrollY === 0, null, { timeout: 2000 });

    // A link into the end of an article: the browser scrolls to the fragment on
    // load, before the script runs, and the controls must still settle right.
    await page.goto(base + article + '#page:end', { waitUntil: 'networkidle' });
    assert.ok(
      await page.evaluate(() => { const r = document.getElementById('page:end')!.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }),
      'a direct load with #page:end opens at the end block',
    );
    await settled(true, false, 'a direct load with #page:end shows only ↑');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const name of ['up', 'down']) {
      assert.equal(await page.locator(`[data-jump="${name}"]`).evaluate((a) => getComputedStyle(a).transitionDuration), '0s', `reduced motion: no fade on ${name}`);
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // The short article must really be short, or "shows neither" proves nothing.
    // Raise the viewport rather than trust a guess about where its end falls.
    const short = '/posts/memory-reset-check/';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + short, { waitUntil: 'networkidle' });
    const reach = await page.evaluate(() => document.getElementById('page:end')!.getBoundingClientRect().top);
    assert.ok(reach < 2000, `${short} is short enough to test`);
    if (reach >= 900) {
      await page.setViewportSize({ width: 1440, height: Math.ceil(reach) + 40 });
    }
    await settled(false, false, 'a short article shows neither control');
    await page.setViewportSize({ width: 1440, height: 900 });
    console.log('Page jump: visibility, fragments, Back, frame edge, reduced motion');
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
  // The examples set no intro, so the homepage falls back to the bio.
  assert.match((await page.locator('.intro-text').textContent()) ?? '', /Демонстрационный журнал/, 'homepage without intro shows the bio');
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
  await plain.goto(base + '/posts/scheduled-volume-backups/');
  assert.notEqual(await plain.locator('.page-jump').getAttribute('hidden'), null, 'no-JS keeps the page jump hidden');
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
