/**
 * Editorial dates use UTC, like the content schema and machine projections.
 * The day is not zero-padded: "8 сентября" is how a person writes a date in a
 * journal, and "08" is how a machine does. Tabular figures in the listing keep
 * the columns aligned without the padding.
 */
export function displayDate(date: Date, includeYear = true): string {
  const day = String(date.getUTCDate());
  const month = new Intl.DateTimeFormat('ru', { month: 'long', day: 'numeric', timeZone: 'UTC' })
    .formatToParts(date).find((part) => part.type === 'month')!.value;
  return `${day} ${month}${includeYear ? ` ${date.getUTCFullYear()}` : ''}`;
}
