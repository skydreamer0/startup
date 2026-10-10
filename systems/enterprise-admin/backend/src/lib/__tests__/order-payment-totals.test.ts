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
});
