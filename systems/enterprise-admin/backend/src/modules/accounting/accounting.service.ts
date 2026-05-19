import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';
import { AppError } from '../../lib/errors';
import { getProviderForTenant } from './provider.factory';
import type {
    AccountingProvider,
    OrderSyncPayload,
    ExpenseSyncPayload,
} from './providers/types';

type EntityType = 'order' | 'expense';

interface SyncStatusFilters {
    entityType?: EntityType;
    status?: 'pending' | 'synced' | 'failed';
    page?: string;
    limit?: string;
}

/**
 * Accounting sync service — INT-03.
 *
 * Responsibilities:
 *   - Map domain entities (Order, Expense) to provider-agnostic payloads
 *   - Delegate to the tenant's configured AccountingProvider
 *   - Persist an AccountingSyncLog row for every attempt (success or failure)
 *   - Idempotency: if a row with status='synced' already exists for the
 *     (entityType, entityId) pair, return it without calling the provider again
 *
 * See ADR-009.
 */
export class AccountingService {
    /** Sync an order to the tenant's configured accounting provider. */
    static async syncOrder(orderId: string) {
        requireTenantId();

        // Idempotency check first — cheap exit if already synced.
        const existing = await prisma.accountingSyncLog.findFirst({
            where: { entityType: 'order', entityId: orderId, status: 'synced' },
            orderBy: { createdAt: 'desc' },
        });
        if (existing) {
            return { log: existing, alreadySynced: true };
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customer: { select: { name: true, phone: true } },
                items: {
                    include: { product: { select: { sku: true, name: true } } },
                },
            },
        });
        if (!order) throw new AppError(404, 'Order not found');

        const payload: OrderSyncPayload = {
            orderId: order.id,
            orderNumber: order.orderNumber ?? null,
            customerName: order.customer?.name || order.customer?.phone || 'Unknown',
            totalAmount: order.totalAmount,
            discountAmount: order.discountAmount,
            paymentMethod: order.paymentMethod,
            occurredAt: order.createdAt.toISOString(),
            lineItems: order.items.map((item) => ({
                productSku: item.product.sku,
                productName: item.product.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
            })),
        };

        const provider = await getProviderForTenant();
        return await this.performSync(provider, 'order', orderId, () =>
            provider.syncOrder(payload),
        );
    }

    /** Sync an expense to the tenant's configured accounting provider. */
    static async syncExpense(expenseId: string) {
        requireTenantId();

        const existing = await prisma.accountingSyncLog.findFirst({
            where: { entityType: 'expense', entityId: expenseId, status: 'synced' },
            orderBy: { createdAt: 'desc' },
        });
        if (existing) {
            return { log: existing, alreadySynced: true };
        }

        const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
        if (!expense) throw new AppError(404, 'Expense not found');

        const payload: ExpenseSyncPayload = {
            expenseId: expense.id,
            type: expense.type,
            amount: expense.amount,
            description: expense.description ?? null,
            period: expense.period,
        };

        const provider = await getProviderForTenant();
        return await this.performSync(provider, 'expense', expenseId, () =>
            provider.syncExpense(payload),
        );
    }

    /** List sync logs for the current tenant, with optional filters. */
    static async getSyncStatus(filters: SyncStatusFilters) {
        requireTenantId();

        const page = Math.max(1, parseInt(filters.page || '1'));
        const limit = Math.min(200, Math.max(1, parseInt(filters.limit || '50')));
        const skip = (page - 1) * limit;

        const where: { entityType?: EntityType; status?: string } = {};
        if (filters.entityType) where.entityType = filters.entityType;
        if (filters.status) where.status = filters.status;

        const [total, data] = await Promise.all([
            prisma.accountingSyncLog.count({ where }),
            prisma.accountingSyncLog.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        return { total, page, limit, data };
    }

    /**
     * Inspect the provider currently configured for this tenant.
     * Used by the UI to decide whether to show a "configure provider" prompt.
     */
    static async getProviderInfo() {
        requireTenantId();
        const provider = await getProviderForTenant();
        return {
            name: provider.name,
            configured: provider.isConfigured(),
        };
    }

    // ─── Internal helpers ──────────────────────────────────

    private static async performSync(
        provider: AccountingProvider,
        entityType: EntityType,
        entityId: string,
        run: () => Promise<{ externalId: string }>,
    ) {
        // tenantId is auto-injected by the Prisma client extension (lib/prisma.ts),
        // but we pass it explicitly so the typed `create` accepts the payload.
        const tenantId = requireTenantId();
        try {
            const result = await run();
            const log = await prisma.accountingSyncLog.create({
                data: {
                    tenantId,
                    provider: provider.name,
                    entityType,
                    entityId,
                    externalId: result.externalId,
                    status: 'synced',
                    syncedAt: new Date(),
                },
            });
            return { log, alreadySynced: false };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await prisma.accountingSyncLog.create({
                data: {
                    tenantId,
                    provider: provider.name,
                    entityType,
                    entityId,
                    status: 'failed',
                    errorMessage: message.slice(0, 1000),
                },
            });
            // Re-throw so the controller can return the right status to the
            // client; the failure is already persisted for the UI to display.
            throw err;
        }
    }
}
