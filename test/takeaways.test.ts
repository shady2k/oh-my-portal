import { describe, expect, it } from 'vitest';

import { calloutProblems } from '../src/takeaways.ts';

describe('takeaways, the conclusions an article marks', () => {
  it('accepts a quote marked as a takeaway', () => {
    expect(calloutProblems('Текст.\n\n> [!TAKEAWAY]\n> Вывод.\n')).toEqual([]);
  });

  it('accepts an ordinary quote', () => {
    expect(calloutProblems('> Просто цитата.\n')).toEqual([]);
  });

  it('refuses a marker it does not know, so a typo does not become a plain quote', () => {
    expect(calloutProblems('> [!TAKEWAY]\n> Вывод.\n')).toEqual([
      'callout [!TAKEWAY] is not one this site renders; the only one is [!TAKEAWAY]',
    ]);
  });

  it('ignores markers inside code', () => {
    expect(calloutProblems('```markdown\n> [!NOTE]\n> x\n```\n')).toEqual([]);
  });
});
