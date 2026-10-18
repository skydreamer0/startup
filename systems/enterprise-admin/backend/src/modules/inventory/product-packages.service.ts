import { Prisma } from '@prisma/client';
import { isUnsupportedPackageIdentifier } from './product-packages-identifier-policy';
import { prisma } from '../../lib/prisma';
import { tenantPersistence } from '../../lib/tenant-persistence';
import { AppError } from '../../lib/errors';
import { packageIdentifierSchema, packageRevisionBody, type PackageRevisionInput } from './product-packages.schema';

const candidateInclude = { package: { include: { product: { include: {
  category: { select: { id: true, name: true } },
} } } } } as const;
type RevisionCandidate = Prisma.ProductPackageRevisionGetPayload<{ include: typeof candidateInclude }>;
function candidate(row: RevisionCandidate) {
  return {
    packageId: row.packageId, revision: row.revision, revisionId: row.id,
    label: row.label, contents: row.contents, unitsPerPackage: row.unitsPerPackage,
    stockUnitLabel: row.package.product.stockUnitLabel,
    source: row.source, validFrom: row.validFrom, validUntil: row.validUntil,
    product: row.package.product,
  };
}

export class ProductPackagesService {
  static async list(productId: string) {
    const tenant = tenantPersistence();
    const product = await prisma.product.findFirst({ where: tenant.where({ id: productId }) });
    if (!product) throw new AppError(404, '找不到商品');
    const packages = await prisma.productPackage.findMany({
      where: tenant.where({ productId }), orderBy: { id: 'asc' },
      include: { revisions: { orderBy: { revision: 'desc' }, include: {
        identifiers: { orderBy: [{ namespace: 'asc' }, { value: 'asc' }] },
      } } },
    });
    return { product, packages };
  }

  static async save(productId: string, input: PackageRevisionInput, actorId: string,
    previous?: { packageId: string; expectedRevision: number; expectedRetired?: boolean }) {
    const tenant = tenantPersistence();
    const data = packageRevisionBody.parse(input);
    return prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: tenant.where({ id: productId }) });
      if (!product) throw new AppError(404, '找不到商品');
      // The first reviewed mapping declares the existing stock unit. It never
      // changes quantities, and later package revisions must use that same unit.
      const unit = await tx.product.updateMany({
        where: tenant.where({ id: productId, OR: [{ stockUnitLabel: null }, { stockUnitLabel: data.stockUnitLabel }] }),
        data: { stockUnitLabel: data.stockUnitLabel },
      });
      if (unit.count !== 1) throw new AppError(409, '庫存計量單位已由其他對照確定，請重新讀取商品');
      const now = new Date();
      let packageId: string;
      let revision: number;
      if (previous) {
        const changed = await tx.productPackage.updateMany({
          where: tenant.where({ id: previous.packageId, productId, revision: previous.expectedRevision }),
          data: { revision: { increment: 1 } },
        });
        if (changed.count !== 1) throw new AppError(409, '包裝版本已變更，請重新讀取後再建立 revision');
        // Retirement keeps the revision number. Check the observed retirement
        // state after taking the identity lock shared with retire(), so a draft
        // opened before retirement cannot silently create a replacement.
        const head = await tx.productPackageRevision.findFirst({
          where: tenant.where({ packageId: previous.packageId, revision: previous.expectedRevision }),
          select: { retiredAt: true },
        });
        if (!head || (head.retiredAt !== null) !== (previous.expectedRetired ?? false)) {
          throw new AppError(409, '包裝停用狀態已變更，請重新讀取並核對後再建立 revision');
        }
        packageId = previous.packageId;
        revision = previous.expectedRevision + 1;
        await tx.productPackageRevision.updateMany({
          where: tenant.where({ packageId, retiredAt: null }),
          data: { retiredAt: now, retiredById: actorId, retirementReason: data.reason },
        });
      } else {
        const created = await tx.productPackage.create({ data: tenant.data({ productId }) });
        packageId = created.id;
        revision = 1;
      }
      return tx.productPackageRevision.create({ data: tenant.data({
        packageId, revision, label: data.label, contents: data.contents,
        unitsPerPackage: data.unitsPerPackage, source: data.source, reason: data.reason,
        identifierCount: data.identifiers.length,
        validFrom: new Date(data.validFrom), validUntil: data.validUntil ? new Date(data.validUntil) : null,
        actorId,
        // Prisma propagates both revisionId and tenantId through the composite
        // parent relation. Supplying tenantId again is rejected by its engine.
        identifiers: { create: data.identifiers.map(identifier => ({
          namespace: identifier.namespace, value: identifier.value,
        })) },
      }), include: { identifiers: true } });
    });
  }

  static async retire(productId: string, packageId: string, expectedRevision: number, reason: string, actorId: string) {
    const tenant = tenantPersistence();
    return prisma.$transaction(async tx => {
      // A conditional update locks the identity row for both retirement and
      // revision creation. A second retirement cannot silently succeed.
      const locked = await tx.productPackage.updateMany({
        where: tenant.where({ id: packageId, productId, revision: expectedRevision }),
        data: { revision: expectedRevision },
      });
      if (locked.count !== 1) throw new AppError(409, '包裝版本已變更，請重新讀取');
      const retired = await tx.productPackageRevision.updateMany({
        where: tenant.where({ packageId, revision: expectedRevision, retiredAt: null }),
        data: { retiredAt: new Date(), retiredById: actorId, retirementReason: reason },
      });
      if (retired.count !== 1) throw new AppError(409, '此 revision 已停用，重新啟用須建立新 revision');
      return { packageId, revision: expectedRevision, retired: true };
    });
  }

  static async lookup(input: unknown, at = new Date()) {
    const tenant = tenantPersistence();
    const identifier = packageIdentifierSchema.parse(input);
    // Explicit namespace selection never routes an unsupported internal QR or
    // a URL to a product code, nor does it fall back to the legacy SKU endpoint.
    // Classification only: preserve the original identifier for exact matching.
    if (isUnsupportedPackageIdentifier(identifier.value)) {
      throw new AppError(422, '此內容屬內部標籤或連結，不能當作原廠碼查找');
    }
    const rows = await prisma.productPackageRevision.findMany({
      where: tenant.where({
        retiredAt: null, validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
        identifiers: { some: tenant.where({ namespace: identifier.namespace, value: identifier.value }) },
      }),
      include: candidateInclude, orderBy: [{ packageId: 'asc' }, { revision: 'asc' }],
    });
    return rows.map(candidate);
  }

  static async resolve(identifier: unknown, packageId: string, revision: number) {
    const rows = await this.lookup(identifier);
    const selected = rows.find(row => row.packageId === packageId && row.revision === revision);
    if (!selected) throw new AppError(409, '對照已變更、停用或超過有效期，請重新查找');
    if (selected.unitsPerPackage === null || !selected.stockUnitLabel) {
      throw new AppError(422, '包裝換算尚未覆核，禁止加入購物車');
    }
    return selected;
  }
}
