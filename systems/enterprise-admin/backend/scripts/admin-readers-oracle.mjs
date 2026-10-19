import assert from 'node:assert/strict';
import { readerPeriod } from './admin-readers-fixture.mjs';
export const readerEndpoints = ['/reports/cashflow', '/reports/cashflow/trend', '/reports/margin', '/reports/margin/trend', '/reports/sales-ranking', '/analytics/product-abc', '/analytics/supplier-ranking', '/inventory/suppliers'];
const round = value => Number(value.toFixed(2));
export function readerExpected(f, actor) {
    const tenantId = f.ids[actor === 'readerA' ? 'tenantA' : actor === 'readerB' ? 'tenantB' : 'tenantEmpty'];
    const orders = f.order.filter(row => row.tenantId === tenantId && row.status === 'completed');
    const products = f.product.filter(row => row.tenantId === tenantId), suppliers = f.supplier.filter(row => row.tenantId === tenantId);
    const rows = f.orderItem.filter(row => orders.some(o => o.id === row.orderId) && products.some(p => p.id === row.productId));
    const aggregated = products.flatMap(product => {
        const items = rows.filter(row => row.productId === product.id);
        if (!items.length)
            return [];
        const quantity = items.reduce((sum, row) => sum + row.quantity, 0), revenue = items.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0), cost = quantity * product.costPrice;
        return [{ id: product.id, name: product.name, sku: product.sku, quantity, revenue, cost, margin: revenue - cost, marginPct: round((revenue - cost) / revenue * 100), supplierId: product.supplierId, categoryName: f.productCategory.find(c => c.id === product.categoryId && c.tenantId === tenantId)?.name ?? null, supplierName: suppliers.find(s => s.id === product.supplierId)?.name ?? null }];
    });
    const revenue = aggregated.reduce((sum, row) => sum + row.revenue, 0), cost = aggregated.reduce((sum, row) => sum + row.cost, 0), margin = revenue - cost;
    const inflows = orders.reduce((sum, row) => sum + row.totalAmount, 0), outflows = f.expense.filter(row => row.tenantId === tenantId).reduce((sum, row) => sum + row.amount, 0);
    const investing = f.inventoryTransaction.filter(row => row.tenantId === tenantId && products.some(p => p.id === row.productId)).reduce((sum, row) => sum + row.quantity * products.find(p => p.id === row.productId).costPrice, 0);
    const categories = [];
    for (const row of aggregated) {
        const category = row.categoryName ?? 'Uncategorized';
        let item = categories.find(c => c.category === category);
        if (!item)
            categories.push(item = { category, revenue: 0, quantity: 0 });
        item.revenue += row.revenue;
        item.quantity += row.quantity;
    }
    categories.sort((a, b) => b.revenue - a.revenue);
    const median = values => values.length ? values.sort((a, b) => a - b)[Math.floor(values.length / 2)] : 0;
    const medianRevenue = median(aggregated.map(row => row.revenue)), medianMargin = median(aggregated.map(row => row.marginPct));
    const abcProducts = aggregated.map(row => ({ ...row, quadrant: row.revenue >= medianRevenue ? (row.marginPct >= medianMargin ? 'star' : 'cash_cow') : (row.marginPct >= medianMargin ? 'hidden_gem' : 'underperformer') })).sort((a, b) => b.revenue - a.revenue);
    const summary = { star: 0, cash_cow: 0, hidden_gem: 0, underperformer: 0 };
    abcProducts.forEach(row => summary[row.quadrant]++);
    const supplierRevenue = aggregated.filter(row => suppliers.some(s => s.id === row.supplierId)).reduce((sum, row) => sum + row.revenue, 0);
    const ranking = suppliers.map(s => {
        const items = aggregated.filter(row => row.supplierId === s.id), totalRevenue = items.reduce((sum, row) => sum + row.revenue, 0), totalCost = items.reduce((sum, row) => sum + row.cost, 0), avgMarginPct = totalRevenue ? round((totalRevenue - totalCost) / totalRevenue * 100) : 0, revenueShare = supplierRevenue ? totalRevenue / supplierRevenue * 100 : 0;
        return { id: s.id, name: s.name, totalRevenue, avgMarginPct, revenueShare: round(revenueShare), deliveryReliability: s.deliveryReliability, defectRate: s.defectRate, productCount: products.filter(row => row.supplierId === s.id).length, compositeScore: round(Math.min(revenueShare * 5, 100) * 0.4 + Math.min(avgMarginPct, 100) * 0.3 + (s.deliveryReliability ?? 50) * 0.2 + (s.defectRate === null ? 50 : Math.max(100 - s.defectRate * 10, 0)) * 0.1) };
    }).sort((a, b) => b.compositeScore - a.compositeScore);
    return { tenantId, aggregated, revenue, cost, margin, marginPct: revenue ? round(margin / revenue * 100) : 0, inflows, outflows, investing, net: inflows - outflows - investing, categories, abcProducts, summary, medianRevenue, medianMargin, ranking, suppliers };
}
export function assertReaderResponse(endpoint, data, expected, { sort = 'revenue', limit = 20, period = readerPeriod } = {}) {
    if (endpoint === '/reports/cashflow') {
        const { inflows, outflows, investing, net } = expected;
        for (const [key, value] of Object.entries({ period, beginningCash: 300000, operatingInflows: inflows, operatingOutflows: outflows, investingOutflows: investing, financingCashFlow: 0, netCashFlow: net, endingCash: 300000 + net }))
            assert.equal(data[key], value, key);
        assert.equal(data.expensesBreakdown.reduce((sum, row) => sum + row.amount, 0), outflows);
    }
    else if (endpoint === '/reports/margin') {
        assert.equal(data.period, period);
        assert.deepEqual(data.summary, { totalRevenue: expected.revenue, totalCogs: expected.cost, totalMargin: expected.margin, totalMarginPct: expected.marginPct });
        const rows = [...expected.aggregated].sort((a, b) => b.margin - a.margin);
        assert.deepEqual(data.products.map(row => row.id), rows.map(row => row.id));
        rows.forEach((row, index) => { for (const [key, value] of Object.entries({ name: row.name, sku: row.sku, qty: row.quantity, revenue: row.revenue, cogs: row.cost, margin: row.margin, marginPct: row.marginPct, contributionPct: expected.margin > 0 ? round(row.margin / expected.margin * 100) : 0 }))
            assert.equal(data.products[index][key], value, key); });
    }
    else if (endpoint.endsWith('/trend')) {
        assert.deepEqual(data.map(row => row.period), ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
        data.forEach((row, index) => { const last = index === 5; if (endpoint.includes('margin'))
            assert.deepEqual(row, { period: row.period, revenue: last ? expected.revenue : 0, margin: last ? expected.margin : 0, marginPct: last ? expected.marginPct : 0 });
        else {
            assert.equal(row.beginningCash, 300000);
            assert.equal(row.endingCash, 300000 + (last ? expected.net : 0));
            assert.equal(row.operatingInflows, last ? expected.inflows : 0);
            assert.equal(row.operatingOutflows, last ? expected.outflows : 0);
            assert.equal(row.investingOutflows, last ? expected.investing : 0);
            assert.equal(row.netCashFlow, last ? expected.net : 0);
        } });
    }
    else if (endpoint === '/reports/sales-ranking') {
        assert.equal(data.period, period);
        const rows = [...expected.aggregated].sort((a, b) => b[sort] - a[sort]).slice(0, limit);
        assert.deepEqual(data.topProducts.map(row => row.id), rows.map(row => row.id));
        assert.deepEqual(data.categories, expected.categories);
        rows.forEach((row, index) => { for (const key of ['name', 'sku', 'quantity', 'revenue', 'margin', 'marginPct'])
            assert.equal(data.topProducts[index][key], row[key], key); assert.equal(data.topProducts[index].categoryName, row.categoryName ?? 'Uncategorized'); });
    }
    else if (endpoint === '/analytics/product-abc') {
        assert.deepEqual(data.summary, expected.summary);
        assert.equal(data.medianRevenue, expected.medianRevenue);
        assert.equal(data.medianMargin, expected.medianMargin);
        assert.deepEqual(data.products.map(row => row.id), expected.abcProducts.map(row => row.id));
        expected.abcProducts.forEach((row, index) => assert.deepEqual(data.products[index], { id: row.id, name: row.name, sku: row.sku, categoryName: row.categoryName, supplierName: row.supplierName, totalRevenue: row.revenue, totalQuantity: row.quantity, marginPct: row.marginPct, quadrant: row.quadrant }));
    }
    else if (endpoint === '/analytics/supplier-ranking')
        assert.deepEqual(data, expected.ranking);
    else if (endpoint === '/inventory/suppliers') {
        assert.deepEqual(data.map(row => row.id).sort(), expected.suppliers.map(row => row.id).sort());
        for (const row of data) {
            const supplier = expected.suppliers.find(s => s.id === row.id);
            for (const key of ['tenantId', 'name', 'contactName', 'deliveryReliability', 'defectRate'])
                assert.equal(row[key], supplier[key], key);
        }
        if (expected.supplierOrder)
            assert.deepEqual(data.map(row => row.id), expected.supplierOrder);
    }
    else
        assert.fail('Unknown reader oracle endpoint');
    if (expected.suppliers.every(s => s.contactName !== 'FOREIGN_READER_CONTACT'))
        assert.ok(!JSON.stringify(data).includes('FOREIGN_READER_'));
}
