import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { aggregateOrderPayments } from '../order-payment-totals';

const split = {
  status: 'completed', totalAmount: '100', paymentMethod: 'CASH',
  payments: [{ method: 'CASH', amount: '60' }, { method: 'CARD', amount: '40' }],
};

describe('persisted order-payment aggregation', () => {
  it('counts order totals once and uses split rows regardless of primary method or row order', () => {
    const expected = { totalSales: 100, paymentBreakdown: { CASH: 60, CARD: 40 } };
    expect(aggregateOrderPayments([split])).toEqual(expected);
    expect(aggregateOrderPayments([{ ...split, paymentMethod: 'CARD', payments: [...split.payments].reverse() }])).toEqual(expected);
  });
  it('adds repeated methods and keeps every stored method without reallocation', () => {
    expect(aggregateOrderPayments([{ ...split, payments: [
      { method: 'CASH', amount: '10' }, { method: 'CASH', amount: '20' },
      { method: 'CARD', amount: '25' }, { method: 'LINE_PAY', amount: '15' },
      { method: 'TRANSFER', amount: '20' }, { method: 'OTHER', amount: '10' },
    ] }])).toEqual({ totalSales: 100, paymentBreakdown: { CASH: 30, CARD: 25, LINE_PAY: 15, TRANSFER: 20, OTHER: 10 } });
  });
  it('uses the explicit primary-method fallback only when completed orders have no rows', () => {
    expect(aggregateOrderPayments([{ ...split, paymentMethod: 'CARD', payments: [] }]))
      .toEqual({ totalSales: 100, paymentBreakdown: { CARD: 100 } });
  });
  it.each(['refunded', 'pending', 'paid', 'shipped', 'cancelled'])('preserves old classification for %s until policy is decided', status => {
    expect(aggregateOrderPayments([{ ...split, status }]))
      .toEqual({ totalSales: 100, paymentBreakdown: { CASH: 100 } });
  });
  it('does not invent a fallback for a persisted zero row or normalize inconsistent payment amounts', () => {
    expect(aggregateOrderPayments([{ ...split, payments: [{ method: 'CARD', amount: '0' }] }]))
      .toEqual({ totalSales: 100, paymentBreakdown: { CARD: 0 } });
  });
  it('supports an empty cohort and does not mutate the facts', () => {
    expect(aggregateOrderPayments([])).toEqual({ totalSales: 0, paymentBreakdown: {} });
    const before = JSON.stringify(split);
    aggregateOrderPayments([split]);
    expect(JSON.stringify(split)).toBe(before);
  });
  it('treats unusual stored methods as data, not inherited object properties', () => {
    const result = aggregateOrderPayments([{ ...split, payments: [{ method: '__proto__', amount: '100' }] }]);
    expect(Object.entries(result.paymentBreakdown)).toEqual([['__proto__', 100]]);
  });
  it('adds stored Decimal 0.1 and 0.2 in the same method without binary intermediate drift', () => {
    const result = aggregateOrderPayments([{
      ...split, totalAmount: new Prisma.Decimal('0.3'),
      payments: [{ method: 'CASH', amount: new Prisma.Decimal('0.1') }, { method: 'CASH', amount: new Prisma.Decimal('0.2') }],
    }]);
    expect(result).toEqual({ totalSales: 0.3, paymentBreakdown: { CASH: 0.3 } });
  });

  it('aggregates order totals and repeated same-method rows across orders without binary intermediate drift', () => {
    const orders = ['0.1', '0.2'].map(amount => ({
      ...split, totalAmount: amount, payments: [{ method: 'CASH', amount }],
    }));
    const result = aggregateOrderPayments(orders);
    expect(result.paymentBreakdown).toEqual({ CASH: 0.3 });
    expect(result.totalSales).toBe(0.3);
  });
  it.each([
    ['Decimal', [new Prisma.Decimal('0.1'), new Prisma.Decimal('0.2')]],
    ['number', [0.1, 0.2]],
    ['mixed', [new Prisma.Decimal('0.1'), '0.2', 0]],
  ])('adds %s order totals before the numeric response boundary', (_, amounts) => {
    const result = aggregateOrderPayments(amounts.map(totalAmount => ({ ...split, totalAmount, payments: [] })));
    expect(result).toEqual({ totalSales: 0.3, paymentBreakdown: { CASH: 0.3 } });
    expect(typeof result.totalSales).toBe('number');
  });
  it.each([
    ['negative stored facts', ['-0.1', '-0.2'], -0.3],
    ['signed cancellation', ['0.1', '0.2', '-0.3'], 0],
    ['zero amounts', ['0', '-0.0000'], 0],
    ['four-place stored precision', ['0.1001', '0.2002'], 0.3003],
    ['unrounded fractional values', ['0.00001', '0.00002'], 0.00003],
  ])('preserves %s without introducing rounding or refund policy', (_, amounts, expected) => {
    const orders = amounts.map(totalAmount => ({ ...split, totalAmount, payments: [] }));
    const before = JSON.stringify(orders);
    expect(aggregateOrderPayments(orders)).toEqual({ totalSales: expected, paymentBreakdown: { CASH: expected } });
    expect(JSON.stringify(orders)).toBe(before);
  });
  it('retains Number conversion limits rather than promising an exact decimal API', () => {
    const totalAmount = '9007199254740993';
    const result = aggregateOrderPayments([{ ...split, totalAmount, payments: [] }]);
    expect(result.totalSales).toBe(new Prisma.Decimal(totalAmount).toNumber());
    expect(result.totalSales).toBe(9007199254740992);
    // This pure-helper input is outside Order Decimal(12, 4), not a DB range acceptance case.
    expect(typeof result.totalSales).toBe('number');
  });
  it('keeps order totals independent from zero or inconsistent stored payment rows', () => {
    expect(aggregateOrderPayments([
      { ...split, totalAmount: '0.1', payments: [{ method: 'CARD', amount: '0' }] },
      { ...split, totalAmount: '0.2', payments: [{ method: 'CARD', amount: '9.995' }] },
    ])).toEqual({ totalSales: 0.3, paymentBreakdown: { CARD: 9.995 } });
  });
  it('keeps fallback classification and ignores out-of-scope status payment rows', () => {
    const result = aggregateOrderPayments([
      { ...split, totalAmount: '0.1', payments: [] },
      { ...split, status: 'refunded', totalAmount: '0.2', payments: [{ method: 'CARD', amount: '99' }] },
    ]);
    expect(result.paymentBreakdown).toEqual({ CASH: 0.3 });
    expect(result.totalSales).toBe(0.3);
  });

});
