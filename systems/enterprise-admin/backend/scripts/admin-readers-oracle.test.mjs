import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildReaderFixture } from './admin-readers-fixture.mjs';
import { readerExpected, assertReaderResponse } from './admin-readers-oracle.mjs';
const f = buildReaderFixture(randomUUID()), a = readerExpected(f, 'readerA'), b = readerExpected(f, 'readerB'), empty = readerExpected(f, 'readerEmpty');
test('A oracle fixes every numerator, denominator, count and order, with same-SKU/supplier B excluded', () => {
    assert.deepEqual([a.revenue, a.cost, a.margin, a.marginPct, a.inflows, a.outflows, a.investing, a.net], [67, 16, 51, 76.12, 67, 7, 5, 55]);
    assert.deepEqual(a.aggregated.map(row => [row.quantity, row.revenue, row.cost]), [[3, 30, 3], [4, 32, 12], [1, 5, 1]]);
    assert.deepEqual([a.medianRevenue, a.medianMargin, a.summary], [30, 80, { star: 1, cash_cow: 1, hidden_gem: 1, underperformer: 0 }]);
    assert.deepEqual(a.ranking.map(row => [row.id, row.revenueShare, row.productCount, row.compositeScore]), [[f.ids.supplierA, 48.39, 1, 82], [f.ids.supplierA2, 51.61, 1, 84.75]].sort((x, y) => y[3] - x[3]));
    assert.equal(a.aggregated[2].categoryName, null);
    assert.equal(a.aggregated[2].supplierName, null);
    assert.equal(a.suppliers.length, 2);
    assert.deepEqual(a.categories, [{ category: '合成讀取分類', revenue: 62, quantity: 7 }, { category: 'Uncategorized', revenue: 5, quantity: 1 }]);
});
test('B and empty oracles cannot inherit A quantities, cost, median, denominator or cash', () => {
    assert.deepEqual([b.revenue, b.cost, b.margin, b.inflows, b.outflows, b.net], [10000, 9000, 1000, 10000, 999, 9001]);
    assert.deepEqual([empty.revenue, empty.cost, empty.net, empty.medianRevenue, empty.medianMargin, empty.aggregated.length, empty.suppliers.length], [0, 0, 0, 0, 0, 0, 0]);
});
test('cash oracle rejects foreign totals and estimated-cost drift', () => {
    const body = { period: '2026-01', beginningCash: 300000, operatingInflows: 67, operatingOutflows: 7, investingOutflows: 5, financingCashFlow: 0, netCashFlow: 55, endingCash: 300055, expensesBreakdown: [{ amount: 7 }] };
    assertReaderResponse('/reports/cashflow', body, a);
    for (const key of ['beginningCash', 'operatingInflows', 'operatingOutflows', 'investingOutflows', 'netCashFlow', 'endingCash'])
        assert.throws(() => assertReaderResponse('/reports/cashflow', { ...body, [key]: body[key] + 10000 }, a));
});
test('supplier oracle rejects foreign denominator, count, score and order even if names are the same', () => {
    assertReaderResponse('/analytics/supplier-ranking', a.ranking, a);
    for (const key of ['totalRevenue', 'avgMarginPct', 'revenueShare', 'productCount', 'compositeScore']) {
        const data = structuredClone(a.ranking);
        data[0][key] += 1;
        assert.throws(() => assertReaderResponse('/analytics/supplier-ranking', data, a));
    }
    assert.throws(() => assertReaderResponse('/analytics/supplier-ranking', [...a.ranking].reverse(), a));
});
test('unknown oracle endpoint and foreign supplier contact fail closed', () => {
    assert.throws(() => assertReaderResponse('/unknown', {}, a));
    const data = structuredClone(a.suppliers);
    data[0].contactName = 'FOREIGN_READER_CONTACT';
    assert.throws(() => assertReaderResponse('/inventory/suppliers', data, a));
});
