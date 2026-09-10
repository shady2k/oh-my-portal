/** Editorial dates use UTC, like the content schema and machine projections. */
export function displayDate(date: Date, includeYear = true): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = new Intl.DateTimeFormat('ru', { month: 'long', day: 'numeric', timeZone: 'UTC' })
    .formatToParts(date).find((part) => part.type === 'month')!.value;
  return `${day} ${month}${includeYear ? ` ${date.getUTCFullYear()}` : ''}`;
}
