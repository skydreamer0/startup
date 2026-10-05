import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { issueProductImportPreview } from '../lib/product-import-preview';
import { ExcelService } from '../modules/excel/excel.service';
import { OrderService } from '../modules/orders/order.service';

const tenants: string[] = [];
async function fixture() {
  const tenantId = randomUUID();
  await basePrisma.tenant.create({ data: { id: tenantId, name: 'Import regression', slug: tenantId } });
  tenants.push(tenantId);
  const customer = await basePrisma.customer.create({ data: { tenantId, phone: 'IMPORT-TEST' } });
  const product = await basePrisma.product.create({ data: {
    tenantId, sku: 'EXISTING', name: 'Original product', costPrice: 40, retailPrice: 100, stockQuantity: 7,
  } });
  const batch = await basePrisma.productBatch.create({ data: {
    tenantId, productId: product.id, batchNumber: 'ORIGINAL-LOT', expiryDate: new Date('2099-01-01'),
    status: 'RELEASED', quantity: 7, costPrice: 40,
  } });
  return { tenantId, product, batch, customer };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function inTenant<T>(f: Fixture, work: () => T) {
  return tenantContext.run({ tenantId: f.tenantId, plan: 'starter' }, work);
}
async function workbook(sku = 'EXISTING', name = 'Approved metadata', stock = 999) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Products');
  sheet.addRow(['sku', 'name', 'cost_price', 'retail_price', 'stock_quantity', 'safety_stock']);
  sheet.addRow([sku, name, 40, 100, stock, 10]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
afterEach(async () => {
  vi.useRealTimers();
  for (const tenantId of tenants.splice(0)) {
    await basePrisma.saleBatchAllocation.deleteMany({ where: { tenantId } });
    await basePrisma.order.deleteMany({ where: { tenantId } });
    await basePrisma.inventoryTransaction.deleteMany({ where: { tenantId } });
    await basePrisma.interaction.deleteMany({ where: { tenantId } });
    await basePrisma.productBatch.deleteMany({ where: { tenantId } });
    await basePrisma.product.deleteMany({ where: { tenantId } });
    await basePrisma.customer.deleteMany({ where: { tenantId } });
    await basePrisma.tenant.delete({ where: { id: tenantId } });
  }
});
afterAll(() => basePrisma.$disconnect());

describe('Reviewed master-data import (real PostgreSQL)', () => {
  it('issues a file/normalized revision identity without writing inventory', async () => {
    const f = await fixture();
    const buffer = await workbook();
    const preview = await inTenant(f, () => ExcelService.previewImport(buffer));
    expect(preview.fileHash).toBe(createHash('sha256').update(buffer).digest('hex'));
    expect(preview.normalizedRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.warnings[0]).toContain('不匯入庫存數量');
    expect(preview.updated).toBe(1);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).name).toBe('Original product');
  });

  it('does not overwrite a real sale committed after preview or alter its lot/movement/allocation', async () => {
    const f = await fixture();
    const buffer = await workbook();
    const preview = await inTenant(f, () => ExcelService.previewImport(buffer));
    const sale = await inTenant(f, () => OrderService.createOrder({ customerId: f.customer.id, items: [{ productId: f.product.id, quantity: 4 }] }));
    const allocations = await basePrisma.saleBatchAllocation.findMany({ where: { orderId: sale.id } });
    const movements = await basePrisma.inventoryTransaction.findMany({ where: { referenceId: sale.id } });
    expect(await inTenant(f, () => ExcelService.importProducts(buffer, preview.previewToken))).toMatchObject({ updated: 1, errors: [] });
    const product = await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } });
    expect(product.name).toBe('Approved metadata');
    expect(product.stockQuantity).toBe(3);
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(3);
    expect(await basePrisma.saleBatchAllocation.findMany({ where: { orderId: sale.id } })).toEqual(allocations);
    expect(await basePrisma.inventoryTransaction.findMany({ where: { referenceId: sale.id } })).toEqual(movements);
  });

  it('creates new product metadata at zero stock instead of inventing an opening lot', async () => {
    const f = await fixture();
    const buffer = await workbook('NEW', 'New product', 99);
    const preview = await inTenant(f, () => ExcelService.previewImport(buffer));
    await inTenant(f, () => ExcelService.importProducts(buffer, preview.previewToken));
    const product = await basePrisma.product.findFirstOrThrow({ where: { tenantId: f.tenantId, sku: 'NEW' } });
    expect(product.stockQuantity).toBe(0);
    expect(await basePrisma.productBatch.count({ where: { productId: product.id } })).toBe(0);
    expect(await basePrisma.inventoryTransaction.count({ where: { productId: product.id } })).toBe(0);
  });

  it('rejects a different file using the old reviewed token before any write', async () => {
    const f = await fixture();
    const original = await workbook();
    const changed = await workbook('EXISTING', 'Unreviewed change');
    const preview = await inTenant(f, () => ExcelService.previewImport(original));
    await expect(inTenant(f, () => ExcelService.importProducts(changed, preview.previewToken))).rejects.toMatchObject({ statusCode: 409 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).name).toBe('Original product');
  });

  it.each(['missing', 'tampered'] as const)('rejects %s preview authorization', async (kind) => {
    const f = await fixture();
    const buffer = await workbook();
    const preview = await inTenant(f, () => ExcelService.previewImport(buffer));
    const [payload, signature] = preview.previewToken.split('.');
    const token = kind === 'missing' ? '' : `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    await expect(inTenant(f, () => ExcelService.importProducts(buffer, token))).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(7);
  });

  it('rejects an approved preview from another tenant', async () => {
    const f = await fixture();
    const other = await fixture();
    const buffer = await workbook();
    const preview = await inTenant(f, () => ExcelService.previewImport(buffer));
    await expect(inTenant(other, () => ExcelService.importProducts(buffer, preview.previewToken))).rejects.toMatchObject({ statusCode: 403 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: other.product.id } })).name).toBe('Original product');
  });

  it('rejects a valid older normalization revision even when file bytes match', async () => {
    const f = await fixture();
    const buffer = await workbook();
    const oldRevision = inTenant(f, () => issueProductImportPreview(createHash('sha256').update(buffer).digest('hex'), '0'.repeat(64)));
    await expect(inTenant(f, () => ExcelService.importProducts(buffer, oldRevision.previewToken))).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('解析版本') });
  });

  it('requires a new preview after expiration', async () => {
    const f = await fixture();
    const buffer = await workbook();
    const preview = await inTenant(f, () => ExcelService.previewImport(buffer));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(preview.expiresAt));
    await expect(inTenant(f, () => ExcelService.importProducts(buffer, preview.previewToken))).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('已過期') });
  });
});
