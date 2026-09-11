import { describe, expect, it } from 'vitest';

import { author } from '../src/schema/site.ts';

/**
 * The author's portrait — optional, and a path into the content images.
 *
 * A path under `/images/` rather than any URL, for the same reason article
 * pictures are: `check-outputs.ts` verifies every `/images/` reference exists in
 * the build, and a portrait hotlinked from somewhere else fails silently the day
 * that somewhere else moves it — while telling that host about every reader.
 */
const base = {
  name: 'Имя',
  bio: 'Строка.',
  contact: { label: 'почта', href: 'mailto:a@example.invalid' },
};

describe('author.avatar', () => {
  it('is optional', () => {
    expect(author.safeParse(base).success).toBe(true);
  });

  it('accepts a picture from the content images', () => {
    expect(author.safeParse({ ...base, avatar: '/images/author/avatar.webp' }).success).toBe(true);
  });

  it('refuses a picture hosted somewhere else', () => {
    expect(author.safeParse({ ...base, avatar: 'https://cdn.example.com/avatar.jpg' }).success).toBe(false);
  });

  it('refuses a path that is not an image', () => {
    expect(author.safeParse({ ...base, avatar: '/images/author/avatar.html' }).success).toBe(false);
  });
});

/**
 * A QR code beside a link, for the reader on a desktop who wants to write from
 * their phone. Static, so it is a file in the content images rather than
 * something generated at build — and for the same reasons as the portrait, never
 * a URL on someone else's host.
 */
describe('link.qr', () => {
  const telegram = (qr?: string) => ({ ...base, links: [{ label: 'telegram', href: 'https://t.me/x', qr }] });

  it('is optional', () => {
    expect(author.safeParse(telegram()).success).toBe(true);
  });

  it('accepts an SVG from the content images', () => {
    expect(author.safeParse(telegram('/images/author/telegram-qr.svg')).success).toBe(true);
  });

  it('refuses a code hosted somewhere else', () => {
    expect(author.safeParse(telegram('https://cdn.example.com/qr.svg')).success).toBe(false);
  });
});

describe('site identity', () => {
  it('accepts a site name separate from the author name', () => {
    expect(author.safeParse({ ...base, site_name: 'журнал' }).success).toBe(true);
  });

  it('accepts an icon from the content images and refuses one hosted elsewhere', () => {
    expect(author.safeParse({ ...base, icon: '/images/site/icon.svg' }).success).toBe(true);
    expect(author.safeParse({ ...base, icon: 'https://cdn.example.com/icon.svg' }).success).toBe(false);
  });

  it('takes a homepage greeting of its own, short enough to read under the motto', () => {
    expect(author.safeParse({ ...base, intro: 'Привет, я автор этого журнала.' }).success).toBe(true);
    expect(author.safeParse({ ...base, intro: 'x'.repeat(301) }).success).toBe(false);
  });

  it('takes one headline or several mottos, each short enough for the masthead', () => {
    expect(author.safeParse({ ...base, headline: 'Одна строка' }).success).toBe(true);
    expect(author.safeParse({ ...base, headline: ['Первая', 'Вторая'] }).success).toBe(true);
    expect(author.safeParse({ ...base, headline: [] }).success).toBe(false);
    expect(author.safeParse({ ...base, headline: ['x'.repeat(121)] }).success).toBe(false);
  });
});
