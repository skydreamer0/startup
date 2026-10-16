import type { ScanResultV1 } from '@pharmasaas/types';

export type Gs1Proposal = { status: 'unknown' } | { status: 'unsupported' }
  | { status: 'proposal'; gtin: string; lot?: string; expiryYYMMDD?: string; serial?: string };

/** Bounded AI 01/10/17/21 reader. Decoder-confirmed boundaries are mandatory.
 * Dates stay YYMMDD observations: no century, expiry or receipt decision here.
 * Unsupported/duplicate AIs fail closed, without partial GTIN fallback.
 */
export function gs1Proposal(scan?: ScanResultV1): Gs1Proposal {
  if (!scan || scan.gs1.status !== 'observed') return { status: 'unknown' };
  const unsupported = { status: 'unsupported' } as const;
  const offsets = scan.gs1.value.separatorOffsets;
  if (!Array.isArray(offsets) || offsets.some((offset, index) => !Number.isSafeInteger(offset)
    || offset < 1 || offset >= scan.literal.length - 1 || (index > 0 && offset <= offsets[index - 1])
    || scan.literal[offset] !== '\x1d')) return unsupported;
  const actual = [...scan.literal].flatMap((character, index) => character === '\x1d' ? [index] : []);
  if (actual.length !== offsets.length || actual.some((offset, index) => offset !== offsets[index])) return unsupported;
  const values = new Map<string, string>();
  for (const segment of scan.literal.split('\x1d')) {
    let cursor = 0;
    while (cursor < segment.length) {
      const ai = segment.slice(cursor, cursor + 2);
      if (values.has(ai) || !['01', '10', '17', '21'].includes(ai)) return unsupported;
      const length = ai === '01' ? 14 : ai === '17' ? 6 : segment.length - cursor - 2;
      const value = segment.slice(cursor + 2, cursor + 2 + length);
      if (value.length !== length || length < 1 || (ai === '10' || ai === '21') && (length > 20 || /[^\x20-\x7e]/.test(value))) return unsupported;
      if ((ai === '01' || ai === '17') && /[^0-9]/.test(value)) return unsupported;
      values.set(ai, value); cursor += 2 + length;
    }
  }
  const gtin = values.get('01');
  if (!gtin) return unsupported;
  const sum = [...gtin].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  if (sum % 10 !== 0) return unsupported;
  const expiryYYMMDD = values.get('17');
  if (expiryYYMMDD) {
    const month = Number(expiryYYMMDD.slice(2, 4)), day = Number(expiryYYMMDD.slice(4));
    // GS1 day 00 is retained literally, never converted to a receipt date.
    if (month < 1 || month > 12 || day > new Date(Date.UTC(2000 + Number(expiryYYMMDD.slice(0, 2)), month, 0)).getUTCDate()) return unsupported;
  }
  return { status: 'proposal', gtin, lot: values.get('10'), expiryYYMMDD, serial: values.get('21') };
}
