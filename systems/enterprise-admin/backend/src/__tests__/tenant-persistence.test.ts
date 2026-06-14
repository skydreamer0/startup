import { describe, expect, it } from 'vitest';
import { tenantContext } from '../lib/tenant.context';
import { tenantPersistence } from '../lib/tenant-persistence';

describe('tenantPersistence', () => {
  it('concentrates tenant where and data injection behind one interface', () => {
    tenantContext.run({ tenantId: 'tenant-1', plan: 'pro' }, () => {
      const tenant = tenantPersistence();

      expect(tenant.tenantId).toBe('tenant-1');
      expect(tenant.where({ id: 'product-1' })).toEqual({ id: 'product-1', tenantId: 'tenant-1' });
      expect(tenant.data({ name: 'Cold medicine' })).toEqual({ name: 'Cold medicine', tenantId: 'tenant-1' });
      expect(tenant.many([{ id: 'a' }, { id: 'b' }])).toEqual([
        { id: 'a', tenantId: 'tenant-1' },
        { id: 'b', tenantId: 'tenant-1' },
      ]);
    });
  });

  it('fails safe outside a tenant context', () => {
    expect(() => tenantPersistence()).toThrow(/Tenant context missing/);
  });
});
