import { describe, expect, it } from 'vitest';

import { footnoteProblems } from '../src/footnotes.ts';

describe('footnotes, the sources of an article', () => {
  it('accepts references numbered in reading order, each with its definition', () => {
    const body = 'Первое[^1], второе[^2] и снова первое[^1].\n\n[^1]: [Источник](https://example.org/a) — «цитата»\n[^2]: [Другой](https://example.org/b)\n';
    expect(footnoteProblems(body)).toEqual([]);
  });

  it('accepts an article with no footnotes at all', () => {
    expect(footnoteProblems('Просто текст.\n')).toEqual([]);
  });

  it('refuses a reference with no definition, which would print as [^3] in the text', () => {
    expect(footnoteProblems('Текст[^1] и[^2].\n\n[^1]: Один\n')).toEqual(['footnote [^2] is referenced but never defined']);
  });

  it('refuses a definition nothing refers to, which a reader would never see', () => {
    expect(footnoteProblems('Текст[^1].\n\n[^1]: Один\n[^2]: Два\n')).toEqual(['footnote [^2] is defined but never referenced']);
  });

  it('refuses a label that is not a number', () => {
    expect(footnoteProblems('Текст[^llms].\n\n[^llms]: Один\n')).toEqual([
      'footnote [^llms] must be a number: the text shows the label, so it has to be the number the list shows',
    ]);
  });

  it('refuses numbers out of reading order, because the list renumbers and the text would not match', () => {
    expect(footnoteProblems('Текст[^2] и[^1].\n\n[^1]: Один\n[^2]: Два\n')).toEqual([
      'footnote [^2] is the 1st one referenced, so it must be [^1]',
      'footnote [^1] is the 2nd one referenced, so it must be [^2]',
    ]);
  });

  it('ignores footnote syntax inside code', () => {
    const body = 'Пример: `[^9]`.\n\n```markdown\nТекст[^7]\n[^8]: x\n```\n';
    expect(footnoteProblems(body)).toEqual([]);
  });
});
