import { AppError } from '../../../lib/errors';
import type {
    AccountingProvider,
    OrderSyncPayload,
    ExpenseSyncPayload,
} from './types';

/**
 * Xero provider — STUB.
 *
 * Real implementation (deferred) would use `xero-node`:
 *   1. OAuth 2.0 with PKCE + token refresh store
 *   2. Map OrderSyncPayload → Xero Invoice (ACCREC)
 *   3. Map ExpenseSyncPayload → Xero Bill (ACCPAY) or BankTransaction
 *
 * TODO: implement — see ADR-009 (adr_009_accounting_adapter.md).
 */
export class XeroProvider implements AccountingProvider {
    readonly name = 'xero' as const;

    isConfigured(): boolean {
        return Boolean(
            process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET,
        );
    }

    async syncOrder(_payload: OrderSyncPayload): Promise<{ externalId: string }> {
        if (!this.isConfigured()) {
            throw new AppError(
                503,
                'Xero is not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET.',
                'INTEGRATION_NOT_CONFIGURED',
            );
        }
        // TODO: implement — see ADR-009
        throw new AppError(
            501,
            'Xero live integration is not implemented yet (scaffold only).',
            'INTEGRATION_NOT_IMPLEMENTED',
        );
    }

    async syncExpense(_payload: ExpenseSyncPayload): Promise<{ externalId: string }> {
        if (!this.isConfigured()) {
            throw new AppError(
                503,
                'Xero is not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET.',
                'INTEGRATION_NOT_CONFIGURED',
            );
        }
        // TODO: implement — see ADR-009
        throw new AppError(
            501,
            'Xero live integration is not implemented yet (scaffold only).',
            'INTEGRATION_NOT_IMPLEMENTED',
        );
    }
}
