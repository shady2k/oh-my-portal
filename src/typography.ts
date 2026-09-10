/**
 * A display heading omits the sentence's closing period, and keeps `?`, `!` and
 * an ellipsis — those carry tone, a full stop only carries grammar.
 *
 * It lives here rather than inside the component that first needed it because
 * the same headline reaches the reader twice: once as the homepage `<h1>` and
 * once inside `<title>`. Two copies of this rule means one of them eventually
 * keeps the period, and the page's tab disagrees with the page.
 */
export const displayHeading = (text: string) => text.replace(/(?<!\.)\.$/u, '');
