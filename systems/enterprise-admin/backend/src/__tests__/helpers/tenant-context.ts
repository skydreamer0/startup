import { tenantContext, type TenantContextData } from '../../lib/tenant.context';

export const TEST_TENANT_ID = 'test-tenant-id';

export const TEST_TENANT_CONTEXT: TenantContextData = {
    tenantId: TEST_TENANT_ID,
    plan: 'pro',
};

export function withTenantContext<T>(
    fn: () => T | Promise<T>,
    override: Partial<TenantContextData> = {},
): Promise<T> {
    const context = { ...TEST_TENANT_CONTEXT, ...override };
    return tenantContext.run(context, async () => fn());
}
