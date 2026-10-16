import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import {
  packageIdentifierSchema,
  packageLookupSchema,
  packageRevisionBody,
  packageRevisionSchema,
} from '../modules/inventory/product-packages.schema';
import { ProductPackagesService } from '../modules/inventory/product-packages.service';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    product: { findFirst: vi.fn(), updateMany: vi.fn() },
    productPackage: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    productPackageRevision: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/tenant-persistence', () => ({
  tenantPersistence: () => ({
    tenantId: 'tenant-a',
    where: (where = {}) => ({ ...where, tenantId: 'tenant-a' }),
    data: (data) => ({ ...data, tenantId: 'tenant-a' }),
    many: (data) => data.map((item) => ({ ...item, tenantId: 'tenant-a' })),
  }),
}));

const validFrom = '2026-10-01T00:00:00.000Z';
const validUntil = '2026-11-01T00:00:00.000Z';
const validRevision = {
  label: 'Bottle',
  contents: '30 tablets',
  stockUnitLabel: 'tablet',
  unitsPerPackage: 30,
  source: 'reviewed label',
  reason: 'Initial reviewed mapping',
  validFrom,
  validUntil: null,
  identifiers: [{ namespace: 'MANUFACTURER' as const, value: '000AbC ' }],
};

const revisionCandidate = (overrides = {}) => ({
  packageId: 'package-a',
  revision: 1,
  id: 'revision-a',
  label: 'Bottle',
  contents: '30 tablets',
  unitsPerPackage: 30,
  source: 'reviewed label',
  validFrom: new Date(validFrom),
  validUntil: new Date(validUntil),
  package: { product: { id: 'product-a', tenantId: 'tenant-a', stockUnitLabel: 'tablet' } },
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.$transaction.mockImplementation((work) => work(prismaMock));
  prismaMock.productPackageRevision.findFirst.mockResolvedValue({ retiredAt: null });
});

describe('product package identifier and revision schemas', () => {
  it.each([
    { namespace: 'MANUFACTURER', value: '000AbC ' },
    { namespace: 'GTIN', value: '036000291452' },
  ])('preserves declared namespace and literal identifier %#', (identifier) => {
    expect(packageIdentifierSchema.parse(identifier)).toEqual(identifier);
  });

  it.each([
    { namespace: 'SKU', value: '000123' },
    { namespace: 'MANUFACTURER', value: '' },
    { namespace: 'GTIN', value: 'not-a-gtin' },
    { namespace: 'MANUFACTURER', value: `x${'a'.repeat(256)}` },
    { namespace: 'MANUFACTURER', value: 'manufacturer\u0000code' },
  ])('rejects invalid package identifier %#', (identifier) => {
    expect(packageIdentifierSchema.safeParse(identifier).success).toBe(false);
  });

  it('preserves lookup namespace/value and accepts a value at the length limit', () => {
    const query = { namespace: 'MANUFACTURER', value: ` ${'x'.repeat(255)}` };
    expect(packageLookupSchema.query.parse(query)).toEqual(query);
    expect(packageLookupSchema.query.safeParse({ ...query, value: `${query.value}x` }).success).toBe(false);
  });

  it('defaults revision requests to an active head and validates explicit retirement state', () => {
    expect(packageRevisionSchema.body.parse({ expectedRevision: 1, data: validRevision }).expectedRetired).toBe(false);
    expect(packageRevisionSchema.body.parse({ expectedRevision: 1, expectedRetired: true, data: validRevision }).expectedRetired).toBe(true);
    expect(packageRevisionSchema.body.safeParse({ expectedRevision: 1, expectedRetired: 'true', data: validRevision }).success).toBe(false);
  });

  it('requires a half-open valid-time interval and distinct identifiers per revision', () => {
    expect(packageRevisionBody.safeParse(validRevision).success).toBe(true);
    expect(packageRevisionBody.safeParse({
      ...validRevision,
      validUntil: validFrom,
    }).success).toBe(false);
    expect(packageRevisionBody.safeParse({
      ...validRevision,
      validUntil: '2026-09-30T23:59:59.999Z',
    }).success).toBe(false);
    expect(packageRevisionBody.safeParse({
      ...validRevision,
      identifiers: [validRevision.identifiers[0], validRevision.identifiers[0]],
    }).success).toBe(false);
  });

  it.each([0, 1.5, 2147483648])('rejects invalid units-per-package value %s', (unitsPerPackage) => {
    expect(packageRevisionBody.safeParse({ ...validRevision, unitsPerPackage }).success).toBe(false);
  });
});

describe('ProductPackagesService.lookup and resolve', () => {
  it('uses exact namespace/value, tenant scope, half-open validity and no result cap', async () => {
    const at = new Date(validFrom);
    prismaMock.productPackageRevision.findMany.mockResolvedValue([revisionCandidate()]);

    const rows = await ProductPackagesService.lookup({ namespace: 'MANUFACTURER', value: ' 000AbC ' }, at);

    const [query] = prisma.productPackageRevision.findMany.mock.calls[0];
    expect(query.where).toMatchObject({
      tenantId: 'tenant-a',
      retiredAt: null,
      validFrom: { lte: at },
      OR: [{ validUntil: null }, { validUntil: { gt: at } }],
      identifiers: { some: { tenantId: 'tenant-a', namespace: 'MANUFACTURER', value: ' 000AbC ' } },
    });
    expect(query).not.toHaveProperty('take');
    expect(rows[0]).toMatchObject({
      packageId: 'package-a', revision: 1, stockUnitLabel: 'tablet',
      product: { id: 'product-a' },
    });
  });

  it('rejects internal labels and links without falling back to SKU lookup', async () => {
    for (const value of ['P1:SKU-123', 'B1:PACKAGE-123', 'https://example.test/code']) {
      await expect(ProductPackagesService.lookup({ namespace: 'MANUFACTURER', value }))
        .rejects.toMatchObject({ statusCode: 422 });
    }
    expect(prisma.productPackageRevision.findMany).not.toHaveBeenCalled();
  });

  it('rejects unknown or stale package revision selection', async () => {
    prismaMock.productPackageRevision.findMany.mockResolvedValue([]);
    await expect(ProductPackagesService.resolve(
      { namespace: 'MANUFACTURER', value: 'MFR-1' }, 'package-a', 1,
    )).rejects.toMatchObject({ statusCode: 409 });
  });

  it('does not resolve a package whose unit conversion is unknown', async () => {
    prismaMock.productPackageRevision.findMany.mockResolvedValue([
      revisionCandidate({ unitsPerPackage: null, package: { product: { id: 'product-a', stockUnitLabel: 'tablet' } } }),
    ]);
    await expect(ProductPackagesService.resolve(
      { namespace: 'MANUFACTURER', value: 'MFR-1' }, 'package-a', 1,
    )).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('ProductPackagesService mutations', () => {
  it('creates a reviewed revision without changing product quantity', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ id: 'product-a', stockQuantity: 12 });
    prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.productPackage.create.mockResolvedValue({ id: 'package-a' });
    prismaMock.productPackageRevision.create.mockResolvedValue({ id: 'revision-a', revision: 1 });

    await ProductPackagesService.save('product-a', validRevision, 'actor-a');

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 'product-a', tenantId: 'tenant-a' },
    });
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'product-a', tenantId: 'tenant-a',
        OR: [{ stockUnitLabel: null }, { stockUnitLabel: 'tablet' }],
      },
      data: { stockUnitLabel: 'tablet' },
    });
    expect(prisma.productPackage.create).toHaveBeenCalledWith({
      data: { productId: 'product-a', tenantId: 'tenant-a' },
    });
    expect(prisma.productPackageRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a', packageId: 'package-a', revision: 1, actorId: 'actor-a',
        identifiers: { create: [{ namespace: 'MANUFACTURER', value: '000AbC ' }] },
      }),
    }));
    expect(prisma.product.updateMany.mock.calls[0][0].data).not.toHaveProperty('stockQuantity');
  });

  it('uses optimistic revision checks and retires the previous active revision', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ id: 'product-a' });
    prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.productPackage.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.productPackageRevision.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.productPackageRevision.create.mockResolvedValue({ id: 'revision-b', revision: 2 });

    await ProductPackagesService.save('product-a', validRevision, 'actor-b', {
      packageId: 'package-a', expectedRevision: 1,
    });

    expect(prisma.productPackage.updateMany).toHaveBeenCalledWith({
      where: { id: 'package-a', productId: 'product-a', revision: 1, tenantId: 'tenant-a' },
      data: { revision: { increment: 1 } },
    });
    expect(prisma.productPackageRevision.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { packageId: 'package-a', retiredAt: null, tenantId: 'tenant-a' },
      data: expect.objectContaining({ retiredById: 'actor-b', retirementReason: validRevision.reason }),
    }));
    expect(prisma.productPackageRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ packageId: 'package-a', revision: 2 }),
    }));
  });

  it('rejects an active draft after retirement without creating a replacement', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ id: 'product-a' });
    prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.productPackage.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.productPackageRevision.findFirst.mockResolvedValue({ retiredAt: new Date(validFrom) });
    await expect(ProductPackagesService.save('product-a', validRevision, 'actor-a', {
      packageId: 'package-a', expectedRevision: 1,
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.productPackageRevision.create).not.toHaveBeenCalled();
    expect(prisma.productPackageRevision.updateMany).not.toHaveBeenCalled();
  });

  it('allows explicit replacement of a refreshed retired head', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ id: 'product-a' });
    prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.productPackage.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.productPackageRevision.findFirst.mockResolvedValue({ retiredAt: new Date(validFrom) });
    prismaMock.productPackageRevision.create.mockResolvedValue({ revision: 2 });
    await expect(ProductPackagesService.save('product-a', validRevision, 'actor-a', {
      packageId: 'package-a', expectedRevision: 1, expectedRetired: true,
    })).resolves.toEqual({ revision: 2 });
  });

  it('requires a tenant-scoped revision check when retiring', async () => {
    prismaMock.productPackage.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.productPackageRevision.updateMany.mockResolvedValue({ count: 1 });

    await expect(ProductPackagesService.retire('product-a', 'package-a', 2, 'retired', 'actor-a'))
      .resolves.toEqual({ packageId: 'package-a', revision: 2, retired: true });
    expect(prisma.productPackage.updateMany).toHaveBeenCalledWith({
      where: { id: 'package-a', productId: 'product-a', revision: 2, tenantId: 'tenant-a' },
      data: { revision: 2 },
    });
    expect(prisma.productPackageRevision.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { packageId: 'package-a', revision: 2, retiredAt: null, tenantId: 'tenant-a' },
      data: expect.objectContaining({ retiredById: 'actor-a', retirementReason: 'retired' }),
    }));
  });

  it('returns a conflict when an expected revision is stale', async () => {
    prismaMock.productPackage.updateMany.mockResolvedValue({ count: 0 });
    await expect(ProductPackagesService.retire('product-a', 'package-a', 1, 'retired', 'actor-a'))
      .rejects.toBeInstanceOf(AppError);
    expect(prisma.productPackageRevision.updateMany).not.toHaveBeenCalled();
  });
});
