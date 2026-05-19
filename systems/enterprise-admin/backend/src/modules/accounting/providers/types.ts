/**
 * Accounting Provider Adapter — type contracts.
 * See ADR-009 (External Accounting System Adapter Pattern).
 *
 * Concrete implementations live in this folder:
 *   - mock.provider.ts        (default — always configured)
 *   - quickbooks.provider.ts  (stub — env-gated)
 *   - xero.provider.ts        (stub — env-gated)
 */

export type AccountingProviderName = 'mock' | 'quickbooks' | 'xero';

/** Mapped order shape that any provider can accept. */
export interface OrderSyncPayload {
    orderId: string;
    orderNumber: string | null;
    customerName: string;
    totalAmount: number;
    discountAmount: number;
    paymentMethod: string;
    /** ISO-8601 datetime string */
    occurredAt: string;
    lineItems: Array<{
        productSku: string;
        productName: string;
        quantity: number;
        unitPrice: number;
    }>;
}

/** Mapped expense shape that any provider can accept. */
export interface ExpenseSyncPayload {
    expenseId: string;
    /** e.g. RENT | SALARY | MARKETING | LOGISTICS | OTHER */
    type: string;
    amount: number;
    description: string | null;
    /** YYYY-MM */
    period: string;
}

export interface AccountingProvider {
    readonly name: AccountingProviderName;
    syncOrder(payload: OrderSyncPayload): Promise<{ externalId: string }>;
    syncExpense(payload: ExpenseSyncPayload): Promise<{ externalId: string }>;
    isConfigured(): boolean;
}
