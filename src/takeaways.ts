/**
 * Takeaways are the conclusions an article marks, written as a GitHub-style
 * callout inside an ordinary quote:
 *
 *   > [!TAKEAWAY]
 *   > An error tells the agent what to do next.
 *
 * Outside the site — the markdown twin, GitHub, an editor, an agent — it stays a
 * readable quote. On the site it renders as the design system's authored
 * observation (`EditorialNote` with the accent bar), labelled «Вывод»: red is
 * the author's mark (design §12). The marker is English so it survives any
 * tool; the label is the site's language.
 */

export const TAKEAWAY_MARKER = 'TAKEAWAY';
export const TAKEAWAY_LABEL = 'Вывод';

/**
 * A marker this site does not render would show as `[!TAKEWAY]` at the top of a
 * plain quote, and a conclusion would lose its mark without anyone noticing.
 */
export function calloutProblems(body: string): string[] {
  const text = body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
  const problems: string[] = [];
  for (const [, marker] of text.matchAll(/^ {0,3}>[ \t]*\[!([A-Za-z]+)\]/gm)) {
    if (marker !== TAKEAWAY_MARKER) {
      problems.push(`callout [!${marker}] is not one this site renders; the only one is [!${TAKEAWAY_MARKER}]`);
    }
  }
  return problems;
}
