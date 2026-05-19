import { basePrisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';
import { MockProvider } from './providers/mock.provider';
import { QuickBooksProvider } from './providers/quickbooks.provider';
import { XeroProvider } from './providers/xero.provider';
import type {
    AccountingProvider,
    AccountingProviderName,
} from './providers/types';

const VALID_PROVIDERS: readonly AccountingProviderName[] = ['mock', 'quickbooks', 'xero'];

/**
 * Defensively parse `Tenant.settings` (JSON-as-text) and extract the configured
 * accounting provider name. Returns 'mock' if anything goes wrong.
 *
 * See ADR-009 for the rationale on co-locating provider choice in
 * Tenant.settings rather than a dedicated table.
 */
function parseProviderName(settings: string | null | undefined): AccountingProviderName {
    if (!settings) return 'mock';
    try {
        const parsed = JSON.parse(settings) as Record<string, unknown>;
        const candidate = parsed?.accountingProvider;
        if (
            typeof candidate === 'string' &&
            (VALID_PROVIDERS as readonly string[]).includes(candidate)
        ) {
            return candidate as AccountingProviderName;
        }
    } catch {
        // Malformed JSON — fall back to mock.
    }
    return 'mock';
}

function instantiate(name: AccountingProviderName): AccountingProvider {
    switch (name) {
        case 'quickbooks':
            return new QuickBooksProvider();
        case 'xero':
            return new XeroProvider();
        case 'mock':
        default:
            return new MockProvider();
    }
}

/**
 * Resolve the accounting provider configured for a specific tenant.
 *
 * Uses `basePrisma` rather than the tenant-scoped `prisma` because the
 * `Tenant` table itself is not tenant-scoped (the extension would recurse).
 *
 * Calls `requireTenantId()` first to enforce that we are inside a request
 * context (matches the security policy in CLAUDE.md).
 */
export async function getProviderForTenant(tenantId?: string): Promise<AccountingProvider> {
    // Establish that we are inside a tenant context. The argument is allowed
    // (some callers already know their tenantId), but if it's missing we
    // fall back to the AsyncLocalStorage value.
    const effectiveTenantId = tenantId ?? requireTenantId();

    const tenant = await basePrisma.tenant.findUnique({
        where: { id: effectiveTenantId },
        select: { settings: true },
    });

    const providerName = parseProviderName(tenant?.settings);
    return instantiate(providerName);
}
