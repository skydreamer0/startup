import { prisma } from '../../lib/prisma';
import { tenantPersistence } from '../../lib/tenant-persistence';
import { productLookupSchema } from './product-lookup.schema';

/** Exact SKU only: Product does not yet have a manufacturer barcode field. */
export class ProductLookupService {
  static async lookup(code: string) {
    const tenant = tenantPersistence();
    const query = productLookupSchema.query.parse({ code });
    return prisma.product.findMany({
      where: tenant.where({ sku: query.code }),
      include: { category: { select: { id: true, name: true } } },
      orderBy: { id: 'asc' },
    });
  }
}
