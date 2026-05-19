import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock tenant context ─────────────────────────────────
vi.mock('../lib/tenant.context', () => ({
    requireTenantId: vi.fn(() => 'test-tenant-id'),
    tenantContext: { getStore: vi.fn(() => ({ tenantId: 'test-tenant-id', plan: 'pro' })) },
}));

// ─── Mock Prisma (basePrisma is what the factory uses) ───
vi.mock('../lib/prisma', () => ({
    basePrisma: {
        tenant: {
            findUnique: vi.fn(),
        },
    },
    prisma: {},
}));

import { getProviderForTenant } from '../modules/accounting/provider.factory';
import { basePrisma } from '../lib/prisma';
import { MockProvider } from '../modules/accounting/providers/mock.provider';
import { QuickBooksProvider } from '../modules/accounting/providers/quickbooks.provider';
import { XeroProvider } from '../modules/accounting/providers/xero.provider';

const mockTenantFindUnique = vi.mocked(basePrisma.tenant.findUnique);

describe('getProviderForTenant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns MockProvider by default when settings is null', async () => {
        mockTenantFindUnique.mockResolvedValue({ settings: null } as never);

        const provider = await getProviderForTenant('tenant-1');

        expect(provider).toBeInstanceOf(MockProvider);
        expect(provider.name).toBe('mock');
    });

    it('returns MockProvider when tenant is missing', async () => {
        mockTenantFindUnique.mockResolvedValue(null);

        const provider = await getProviderForTenant('tenant-missing');

        expect(provider).toBeInstanceOf(MockProvider);
    });

    it('returns MockProvider when settings JSON is malformed', async () => {
        mockTenantFindUnique.mockResolvedValue({ settings: '{not valid json' } as never);

        const provider = await getProviderForTenant('tenant-bad');

        expect(provider).toBeInstanceOf(MockProvider);
    });

    it('returns QuickBooksProvider when settings.accountingProvider is "quickbooks"', async () => {
        mockTenantFindUnique.mockResolvedValue({
            settings: JSON.stringify({ accountingProvider: 'quickbooks' }),
        } as never);

        const provider = await getProviderForTenant('tenant-qb');

        expect(provider).toBeInstanceOf(QuickBooksProvider);
        expect(provider.name).toBe('quickbooks');
    });

    it('returns XeroProvider when settings.accountingProvider is "xero"', async () => {
        mockTenantFindUnique.mockResolvedValue({
            settings: JSON.stringify({ accountingProvider: 'xero' }),
        } as never);

        const provider = await getProviderForTenant('tenant-xero');

        expect(provider).toBeInstanceOf(XeroProvider);
        expect(provider.name).toBe('xero');
    });

    it('falls back to MockProvider when accountingProvider value is unknown', async () => {
        mockTenantFindUnique.mockResolvedValue({
            settings: JSON.stringify({ accountingProvider: 'sage' }),
        } as never);

        const provider = await getProviderForTenant('tenant-sage');

        expect(provider).toBeInstanceOf(MockProvider);
    });
});
