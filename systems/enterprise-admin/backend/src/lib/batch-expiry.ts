import { taipeiBusinessDay } from './business-day';

/** The pharmacy's confirmed calendar policy: unusable on the expiry day.
 * Datetimes are interpreted as calendar dates in Asia/Taipei, independent of
 * the server's timezone. Unknown / month-only dates are not inferred here.
 */
export function saleExpiryCutoff(now = new Date()) {
  return taipeiBusinessDay(now).end;
}
