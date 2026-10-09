/**
 * Prisma models that must be constrained by the active tenant context.
 *
 * Keep this list aligned with every Prisma model that owns a `tenantId` field.
 * Backend tests derive the expected list from `prisma/schema.prisma` so tenant
 * isolation drift fails locally instead of leaking into service tests.
 */
export const TENANT_SCOPED_MODELS = [
    'User',
    'Role',
    'AuditLog',
    'Customer',
    'Tag',
    'Interaction',
    'Supplier',
    'ProductCategory',
    'Product',
    'Order',
    'OrderPayment',
    'CheckoutCommand',
    'OrderNumberCounter',
    'InventoryTransaction',
    'Expense',
    'Shift',
    'ProductBatch',
    'SaleBatchAllocation',
    'DailySettlement',
    'AccountingSyncLog',
    'MessageBroadcast',
] as const;

export type TenantScopedModel = typeof TENANT_SCOPED_MODELS[number];

export function isTenantScopedModel(model: string | undefined): model is TenantScopedModel {
    return typeof model === 'string' && (TENANT_SCOPED_MODELS as readonly string[]).includes(model);
}
