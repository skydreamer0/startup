/** The pharmacy's confirmed calendar policy: unusable on the expiry day.
 * Datetimes are interpreted as calendar dates in Asia/Taipei, independent of
 * the server's timezone. Unknown / month-only dates are not inferred here.
 */
export function saleExpiryCutoff(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day') + 1) - 8 * 60 * 60 * 1000);
}
