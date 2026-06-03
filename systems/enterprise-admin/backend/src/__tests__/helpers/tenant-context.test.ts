import { describe, expect, it } from 'vitest';
import { requireTenantId, tenantContext } from '../../lib/tenant.context';
import { TEST_TENANT_CONTEXT, TEST_TENANT_ID, withTenantContext } from './tenant-context';
import { TENANT_SCOPED_MODELS, isTenantScopedModel } from '../../lib/tenant-scoped-models';
import { tenantScopedModelsFromPrismaSchema } from './tenant-model-map';

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

describe('tenant-scoped model map', () => {
    it('stays aligned with Prisma models that declare tenantId', () => {
        expect([...TENANT_SCOPED_MODELS].sort()).toEqual(tenantScopedModelsFromPrismaSchema());
    });

    it('classifies tenant and non-tenant Prisma models for scoped client tests', () => {
        expect(isTenantScopedModel('Order')).toBe(true);
        expect(isTenantScopedModel('OrderPayment')).toBe(true);
        expect(isTenantScopedModel('Tenant')).toBe(false);
        expect(isTenantScopedModel('OrderItem')).toBe(false);
    });
});
