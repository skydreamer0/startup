import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESERVED_PACKAGE_URI_SCHEMES } from '../modules/inventory/product-packages-identifier-policy';
import { ProductPackagesService } from '../modules/inventory/product-packages.service';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { productPackageRevision: { findMany } } }));
vi.mock('../lib/tenant-persistence', () => ({
  tenantPersistence: () => ({ where: (where = {}) => ({ ...where, tenantId: 'synthetic-tenant' }) }),
}));

const persistedCandidate = {
  id: 'synthetic-revision', packageId: 'synthetic-package', revision: 1,
  label: 'Synthetic box', contents: '10 units', unitsPerPackage: 10,
  source: 'Synthetic review', validFrom: new Date('2026-01-01T00:00:00Z'), validUntil: null,
  package: { product: { id: 'synthetic-product', stockUnitLabel: 'unit' } },
};

beforeEach(() => { vi.resetAllMocks(); findMany.mockResolvedValue([persistedCandidate]); });

describe('package lookup URI boundary', () => {
  it.each([
    ...RESERVED_PACKAGE_URI_SCHEMES.flatMap(scheme => [`${scheme}:synthetic`, ` ${scheme.toUpperCase()}:synthetic `]),
    'mailto:synthetic@example.test', 'MaIlTo:synthetic@example.test',
    'data:text/plain,synthetic', 'DATA:text/plain,synthetic',
    'tel:+886200000000', 'TEL:+886200000000',
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' sms:+886200000000',
    'urn:uuid:synthetic', 'URN:uuid:synthetic', 'file:/synthetic',
    'https://example.test/code', 'P1:synthetic', 'B2:synthetic', ' P1:synthetic ', '\tB2:synthetic',
  ])('rejects lookup and resolve of an already mapped unsupported value %s', async value => {
    const identifier = { namespace: 'MANUFACTURER', value };
    await expect(ProductPackagesService.lookup(identifier)).rejects.toMatchObject({ statusCode: 422 });
    await expect(ProductPackagesService.resolve(identifier, 'synthetic-package', 1))
      .rejects.toMatchObject({ statusCode: 422 });
    // Even if persistence would return a reviewed mapping, it cannot bypass the boundary.
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each(['Maker:AbC ', ' maker:AbC ', 'Maker:abc ', 'Maker:AbC', '批號:００１', 'unknown-prefix:part', ' Maker:part ']) (
    'keeps the exact manufacturer colon literal %j for lookup and resolve', async value => {
      const identifier = { namespace: 'MANUFACTURER', value };
      await expect(ProductPackagesService.lookup(identifier)).resolves.toHaveLength(1);
      await expect(ProductPackagesService.resolve(identifier, 'synthetic-package', 1))
        .resolves.toMatchObject({ packageId: 'synthetic-package', revision: 1 });
      for (const [query] of findMany.mock.calls) {
        expect(query.where.identifiers.some).toEqual({ ...identifier, tenantId: 'synthetic-tenant' });
      }
    },
  );
});
