/** Store calendar: Asia/Taipei, midnight rollover. A clock is injectable at
 * service boundaries; callers must re-read it after waits rather than freezing
 * expiry eligibility at command arrival. Refund accounting remains separate. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

const calendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric',
});

export function taipeiBusinessDay(now = systemClock()) {
  const parts = calendar.formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const start = new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month - 1, day + 1) - 8 * 60 * 60 * 1000);
  return { date, start, end };
}
