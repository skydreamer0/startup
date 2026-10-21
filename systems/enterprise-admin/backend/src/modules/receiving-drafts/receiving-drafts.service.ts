import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';
import { AppError } from '../../lib/errors';
import { receivingPayloadSchema, saveReceivingDraftSchema } from './receiving-drafts.schema';
function scope(ownerId: string) {
  if (!ownerId) throw new AppError(401, 'Authentication required');
  return { tenantId: requireTenantId(), ownerId };
}
function view(row: { id: string; revision: number; tenantId: string; ownerId: string; updatedAt: Date; payload: unknown }) {
  return { ...row, updatedAt: row.updatedAt.toISOString(), payload: receivingPayloadSchema.parse(row.payload) };
}
export class ReceivingDraftService {
  static async list(ownerId: string, page: number) {
    const where = scope(ownerId);
    return prisma.$transaction(async tx => {
      const [data, total] = await Promise.all([
        tx.receivingDraft.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50,
          select: { id: true, revision: true, title: true, updatedAt: true } }),
        tx.receivingDraft.count({ where }),
      ]);
      return { ...where, data, total, page, limit: 50 };
    }, { isolationLevel: 'RepeatableRead' });
  }
  static async get(id: string, ownerId: string) {
    const row = await prisma.receivingDraft.findFirst({ where: { id, ...scope(ownerId) } });
    if (!row) throw new AppError(404, 'Draft not found');
    return view(row);
  }
  static async history(id: string, ownerId: string, page: number) {
    const where = { draftId: id, ...scope(ownerId) };
    await this.get(id, ownerId);
    return prisma.receivingDraftRevision.findMany({ where, orderBy: { revision: 'desc' }, skip: (page - 1) * 50, take: 50,
      select: { revision: true, createdAt: true } });
  }
  static async version(id: string, ownerId: string, revision: number) {
    await this.get(id, ownerId);
    const row = await prisma.receivingDraftRevision.findFirst({ where: { draftId: id, ...scope(ownerId), revision } });
    if (!row) throw new AppError(404, 'Draft version not found');
    return { id, revision: row.revision, tenantId: row.tenantId, ownerId: row.ownerId,
      updatedAt: row.createdAt.toISOString(), payload: receivingPayloadSchema.parse(row.payload) };
  }
  static async save(id: string, ownerId: string, raw: unknown) {
    const parsed = saveReceivingDraftSchema.safeParse(raw);
    if (!parsed.success) throw new AppError(400, 'Invalid draft data');
    const { expectedRevision, payload } = parsed.data, owner = scope(ownerId);
    try {
      return await prisma.$transaction(async tx => {
        const productIds = [...new Set(payload.lines.map(line => line.fields.productId).filter(Boolean))];
        const count = await tx.product.count({ where: { id: { in: productIds }, tenantId: owner.tenantId } });
        if (count !== productIds.length) throw new AppError(400, 'One or more products are unavailable');
        const revision = expectedRevision + 1;
        const data = { revision, title: payload.title, payload };
        if (expectedRevision === 0) {
          await tx.receivingDraft.create({ data: { id, ...owner, ...data } });
        } else {
          const updated = await tx.receivingDraft.updateMany({ where: { id, ...owner, revision: expectedRevision }, data });
          if (updated.count !== 1) {
            const existing = await tx.receivingDraft.findFirst({ where: { id, ...owner }, select: { id: true } });
            throw new AppError(existing ? 409 : 404, existing ? 'Draft changed; reload and compare before saving' : 'Draft not found');
          }
        }
        await tx.receivingDraftRevision.create({ data: { draftId: id, ...owner, revision, payload } });
        const row = await tx.receivingDraft.findFirstOrThrow({ where: { id, ...owner } });
        return view(row);
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new AppError(409, 'Draft changed; reload and compare before saving');
      }
      throw error;
    }
  }
}
