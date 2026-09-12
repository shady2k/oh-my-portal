/**
 * Footnotes are how an article cites its sources: `[^1]` in the text, and
 * `[^1]: [Title](url) — «quote»` at the end of the body. Standard GFM, so the
 * markdown twin carries them as written and any reader of markdown understands
 * them; the HTML renders them as the numbered «Источники» list.
 *
 * GFM numbers the list by the order of first reference, whatever the labels
 * say. The text shows the label as the author wrote it, so a label that is not
 * that number would point a reader at the wrong source. A reference with no
 * definition prints as literal `[^3]`, and a definition nothing refers to is
 * dropped from the page. All three are refused here rather than shipped.
 */

/** Everything wrong with the footnotes of one body, in reading order. */
export function footnoteProblems(body: string): string[] {
  const text = withoutCode(body);
  const definitions = new Set<string>();
  const prose = text.replace(/^ {0,3}\[\^([^\]\s]+)\]:/gm, (_, label: string) => {
    definitions.add(label);
    return '';
  });

  const referenced: string[] = [];
  for (const [, label] of prose.matchAll(/\[\^([^\]\s]+)\]/g)) {
    if (!referenced.includes(label!)) referenced.push(label!);
  }

  const problems: string[] = [];
  referenced.forEach((label, index) => {
    if (!definitions.has(label)) problems.push(`footnote [^${label}] is referenced but never defined`);
    if (!/^[1-9][0-9]*$/.test(label)) {
      problems.push(`footnote [^${label}] must be a number: the text shows the label, so it has to be the number the list shows`);
    } else if (Number(label) !== index + 1) {
      problems.push(`footnote [^${label}] is the ${ordinal(index + 1)} one referenced, so it must be [^${index + 1}]`);
    }
  });
  for (const label of definitions) {
    if (!referenced.includes(label)) problems.push(`footnote [^${label}] is defined but never referenced`);
  }
  return problems;
}

/** Fenced blocks and inline code spans hold examples, not citations. */
const withoutCode = (body: string) =>
  body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** The GFM footnote strings, in the language the site is written in. */
export const FOOTNOTES = {
  label: 'Источники',
  backLabel: 'Вернуться к месту в тексте {reference}',
};

