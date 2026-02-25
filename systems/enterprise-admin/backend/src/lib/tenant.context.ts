import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContextData {
    tenantId: string;
    plan: string;
}

// Global context to hold tenant information for the current async execution context
export const tenantContext = new AsyncLocalStorage<TenantContextData>();

/**
 * Helper to get the current tenant ID. Throws if not in a tenant context.
 */
export function requireTenantId(): string {
    const context = tenantContext.getStore();
    if (!context || !context.tenantId) {
        throw new Error('Tenant context missing. Ensure the operation is wrapped in tenantContext.run()');
    }
    return context.tenantId;
}
