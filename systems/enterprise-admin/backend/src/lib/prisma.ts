import { PrismaClient } from '@prisma/client';
import { tenantContext } from './tenant.context';

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// List of models that contain tenantId (exclude models like Tenant itself)
const MappedModels = [
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
    'InventoryTransaction',
    'Expense',
    'Shift',
    'ProductBatch',
    'DailySettlement',
] as const;

export const basePrisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

// Create an extended Prisma Client that auto-injects tenantId
export const prisma = basePrisma.$extends({
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                // If this model isn't multi-tenant, execute normally
                if (!MappedModels.includes(model as any)) {
                    return query(args);
                }

                // Get current tenant context
                const context = tenantContext.getStore();

                // If no context exists (e.g., seeding, startup scripts), we must fail safe 
                // UNLESS it's a known non-tenant operation. For now, enforce it.
                if (!context || !context.tenantId) {
                    throw new Error(`[Security] Missing tenant context for operation ${operation} on ${model}`);
                }

                const { tenantId } = context;

                // Auto-inject tenantId based on operation type
                const argsAny = args as any;
                if (['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
                    // Read operations: add to 'where'
                    argsAny.where = { ...argsAny.where, tenantId };
                } else if (['create', 'createMany'].includes(operation)) {
                    // Create operations: add to 'data'
                    if (Array.isArray(argsAny.data)) {
                        argsAny.data = argsAny.data.map((d: any) => ({ ...d, tenantId }));
                    } else {
                        argsAny.data = { ...argsAny.data, tenantId };
                    }
                } else if (['update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(operation)) {
                    // Update/Delete operations: add to 'where'
                    argsAny.where = { ...argsAny.where, tenantId };
                }

                return query(argsAny);
            },
        },
    },
});

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = basePrisma;
}
