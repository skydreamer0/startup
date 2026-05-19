import { AppError } from '../../../lib/errors';
import type {
    AccountingProvider,
    OrderSyncPayload,
    ExpenseSyncPayload,
} from './types';

/**
 * QuickBooks Online provider — STUB.
 *
 * Real implementation (deferred) would use `intuit-oauth` + `node-quickbooks`:
 *   1. OAuth 2.0 callback flow + token refresh store
 *   2. Map OrderSyncPayload → QuickBooks Invoice
 *   3. Map ExpenseSyncPayload → QuickBooks Purchase
 *
 * TODO: implement — see ADR-009 (adr_009_accounting_adapter.md).
 *
 * Until then, this stub looks at env vars and either reports "not configured"
 * (so the UI can render a setup prompt) or throws so we never silently no-op.
 */
export class QuickBooksProvider implements AccountingProvider {
    readonly name = 'quickbooks' as const;

    isConfigured(): boolean {
        return Boolean(
            process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET,
        );
    }

    async syncOrder(_payload: OrderSyncPayload): Promise<{ externalId: string }> {
        if (!this.isConfigured()) {
            throw new AppError(
                503,
                'QuickBooks is not configured. Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET.',
                'INTEGRATION_NOT_CONFIGURED',
            );
        }
        // TODO: implement — see ADR-009
        throw new AppError(
            501,
            'QuickBooks live integration is not implemented yet (scaffold only).',
            'INTEGRATION_NOT_IMPLEMENTED',
        );
    }

    async syncExpense(_payload: ExpenseSyncPayload): Promise<{ externalId: string }> {
        if (!this.isConfigured()) {
            throw new AppError(
                503,
                'QuickBooks is not configured. Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET.',
                'INTEGRATION_NOT_CONFIGURED',
            );
        }
        // TODO: implement — see ADR-009
        throw new AppError(
            501,
            'QuickBooks live integration is not implemented yet (scaffold only).',
            'INTEGRATION_NOT_IMPLEMENTED',
        );
    }
}
