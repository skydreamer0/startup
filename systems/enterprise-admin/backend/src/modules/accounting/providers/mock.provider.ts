import { randomUUID } from 'crypto';
import type {
    AccountingProvider,
    OrderSyncPayload,
    ExpenseSyncPayload,
} from './types';

/**
 * In-memory accounting provider used by default for every tenant and for tests.
 * Generates fake external IDs without any network calls.
 *
 * See ADR-009 — mock provider is the safe default while real SDKs are deferred.
 */
export class MockProvider implements AccountingProvider {
    readonly name = 'mock' as const;

    isConfigured(): boolean {
        return true;
    }

    async syncOrder(_payload: OrderSyncPayload): Promise<{ externalId: string }> {
        return { externalId: `MOCK-${randomUUID()}` };
    }

    async syncExpense(_payload: ExpenseSyncPayload): Promise<{ externalId: string }> {
        return { externalId: `MOCK-${randomUUID()}` };
    }
}
