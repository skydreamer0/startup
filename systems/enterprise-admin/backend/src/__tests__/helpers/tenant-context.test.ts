import { describe, expect, it } from 'vitest';
import { requireTenantId, tenantContext } from '../../lib/tenant.context';
import { TEST_TENANT_CONTEXT, TEST_TENANT_ID, withTenantContext } from './tenant-context';

describe('withTenantContext', () => {
    it('runs test code inside the default tenant context', async () => {
        const result = await withTenantContext(async () => ({
            tenantId: requireTenantId(),
            store: tenantContext.getStore(),
        }));

        expect(result).toEqual({
            tenantId: TEST_TENANT_ID,
            store: TEST_TENANT_CONTEXT,
        });
    });

    it('allows tests to override tenant context fields locally', async () => {
        const result = await withTenantContext(
            async () => tenantContext.getStore(),
            { tenantId: 'tenant-override', plan: 'starter' },
        );

        expect(result).toEqual({ tenantId: 'tenant-override', plan: 'starter' });
    });
});
