import { describe, expect, it } from 'vitest';
import { productIdentifierSchema } from '../modules/pos/product-identifier.schema';

const validGtins = [
  ['GTIN-8', '12345670'],
  ['GTIN-12', '036000291452'],
  ['GTIN-13', '6291041500213'],
  ['GTIN-14', '10012345678902'],
] as const;

describe('productIdentifierSchema', () => {
  it.each([
    ['SKU', '000AbC '],
    ['MANUFACTURER', '000AbC '],
  ] as const)('preserves the literal %s identifier %j', (namespace, value) => {
    const parsed = productIdentifierSchema.parse({ namespace, value });
    expect(parsed).toEqual({ namespace, value });
  });

  it('keeps numeric manufacturer identifiers in their declared namespace', () => {
    const value = '036000291452';
    expect(productIdentifierSchema.parse({ namespace: 'MANUFACTURER', value })).toEqual({
      namespace: 'MANUFACTURER',
      value,
    });
    expect(productIdentifierSchema.safeParse({ namespace: 'MANUFACTURER', value: 36000291452 }).success).toBe(false);
  });

  it.each(['SKU', 'MANUFACTURER', 'GTIN'] as const)('rejects an empty %s identifier', (namespace) => {
    expect(productIdentifierSchema.safeParse({ namespace, value: '' }).success).toBe(false);
  });

  it.each(validGtins)('accepts %s with its supplied representation unchanged', (_name, value) => {
    const parsed = productIdentifierSchema.parse({ namespace: 'GTIN', value });
    expect(parsed).toEqual({ namespace: 'GTIN', value });
    expect(parsed.value).toHaveLength(value.length);
  });

  it.each(validGtins)('rejects an incorrect check digit for %s', (_name, value) => {
    const invalid = `${value.slice(0, -1)}${(Number(value.at(-1)) + 1) % 10}`;
    expect(productIdentifierSchema.safeParse({ namespace: 'GTIN', value: invalid }).success).toBe(false);
  });

  it.each(['1234567', '00000000\n', '123456789', '12345678901', '123456789012345'])('rejects unsupported GTIN length %j', (value) => {
    expect(productIdentifierSchema.safeParse({ namespace: 'GTIN', value }).success).toBe(false);
  });

  it.each([
    '１２３４５６７０',
    '1234567８',
    '1234567a',
    ' 12345670',
    '12345670 ',
    '123 5670',
    '\n12345670',
    '12345670\n',
    '123456\n70',
  ])('rejects non-ASCII digits or whitespace in GTIN %j', (value) => {
    expect(productIdentifierSchema.safeParse({ namespace: 'GTIN', value }).success).toBe(false);
  });

  it.each([
    undefined,
    { value: '00123' },
    { namespace: 'BARCODE', value: '00123' },
    { namespace: null, value: '00123' },
    { namespace: 1, value: '00123' },
    { namespace: 'sku', value: '00123' },
    { namespace: 'manufacturer', value: '00123' },
    { namespace: 'gtin', value: '00000000' },
    { namespace: 'SKU', value: '00123', tenantId: 'tenant-a' },
    { namespace: 'SKU', value: ['00123'] },
    { namespace: 'SKU', value: 123 },
    { namespace: 'MANUFACTURER', value: 123 },
    [{ namespace: 'SKU', value: '00123' }],
  ])('rejects missing, unknown, extra, array or nonstring identifier input %#', (input) => {
    expect(productIdentifierSchema.safeParse(input).success).toBe(false);
  });
});
