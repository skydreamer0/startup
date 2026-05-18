import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';
import { differenceInDays, format, addDays } from 'date-fns';
import type {
    RfmSegment,
    RfmCustomer,
    RfmResult,
    ChurnRiskCustomer,
} from './analytics.types';

/**
 * CRM-domain analytics: RFM segmentation and Churn risk.
 *
 * Extracted from `analytics.service.ts` as part of C-04 to bound the
 * service's responsibility and reduce merge-conflict churn.
 */
export class CrmAnalyticsService {
    /**
     * Segments all customers into RFM tiers based on:
     * - Recency (days since last purchase)
     * - Frequency (purchaseCount)
     * - Monetary (totalSpent)
     *
     * Thresholds (from design doc 20260302):
     * - VIP:      R ≤ 7d,  F ≥ 5,  M in Top 20%
     * - Loyal:    R ≤ 30d, F ≥ 3,  M above median
     * - New:      F = 1
     * - Dormant:  R 31–60d
     * - At Risk:  R > 60d
     */
    static async getRfmSegmentation(): Promise<RfmResult> {
        requireTenantId();
        const customers = await prisma.customer.findMany({
            select: {
                id: true,
                name: true,
                phone: true,
                totalSpent: true,
                purchaseCount: true,
                lastPurchaseDate: true,
            },
        });

        if (customers.length === 0) {
            return {
                summary: { vip: 0, loyal: 0, new: 0, dormant: 0, at_risk: 0 },
                customers: [],
            };
        }

        const now = new Date();

        // Calculate monetary thresholds
        const spentValues = customers
            .map((c) => c.totalSpent)
            .filter((v) => v > 0)
            .sort((a, b) => a - b);

        const medianSpent = spentValues.length > 0
            ? spentValues[Math.floor(spentValues.length / 2)]
            : 0;
        const top20PctThreshold = spentValues.length > 0
            ? spentValues[Math.floor(spentValues.length * 0.8)]
            : 0;

        const segmentedCustomers: RfmCustomer[] = customers.map((c) => {
            const recencyDays = c.lastPurchaseDate
                ? differenceInDays(now, c.lastPurchaseDate)
                : 9999; // Never purchased — treat as very old

            let segment: RfmSegment;

            if (c.purchaseCount === 0) {
                // Registered but never purchased
                segment = 'new';
            } else if (c.purchaseCount === 1) {
                segment = 'new';
            } else if (recencyDays <= 7 && c.purchaseCount >= 5 && c.totalSpent >= top20PctThreshold) {
                segment = 'vip';
            } else if (recencyDays <= 30 && c.purchaseCount >= 3 && c.totalSpent >= medianSpent) {
                segment = 'loyal';
            } else if (recencyDays > 60) {
                segment = 'at_risk';
            } else if (recencyDays > 30) {
                segment = 'dormant';
            } else {
                // R ≤ 30 but doesn't meet loyal thresholds
                segment = 'loyal';
            }

            return {
                id: c.id,
                name: c.name,
                phone: c.phone,
                segment,
                recencyDays,
                frequency: c.purchaseCount,
                monetary: c.totalSpent,
                lastPurchaseDate: c.lastPurchaseDate,
            };
        });

        // Build summary counts
        const summary: Record<RfmSegment, number> = { vip: 0, loyal: 0, new: 0, dormant: 0, at_risk: 0 };
        for (const c of segmentedCustomers) {
            summary[c.segment]++;
        }

        return { summary, customers: segmentedCustomers };
    }

    /**
     * Calculates churn risk for customers with ≥ 2 orders.
     * Logic:
     * 1. Compute average repurchase interval per customer.
     * 2. If daysSinceLastPurchase > 1.5 × avgInterval → high risk.
     * 3. If daysSinceLastPurchase > 1.0 × avgInterval → medium risk.
     * 4. Otherwise → low risk.
     */
    static async getChurnRisk(): Promise<ChurnRiskCustomer[]> {
        requireTenantId();
        // Fetch customers who have at least 2 completed orders
        const customers = await prisma.customer.findMany({
            where: { purchaseCount: { gte: 2 } },
            select: {
                id: true,
                name: true,
                phone: true,
                purchaseCount: true,
                lastPurchaseDate: true,
                orders: {
                    where: { status: 'completed' },
                    select: { createdAt: true },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        const now = new Date();
        const results: ChurnRiskCustomer[] = [];

        for (const customer of customers) {
            const orderDates = customer.orders.map((o) => o.createdAt);

            if (orderDates.length < 2) continue;

            // Calculate intervals between consecutive orders
            let totalInterval = 0;
            for (let i = 1; i < orderDates.length; i++) {
                totalInterval += differenceInDays(orderDates[i], orderDates[i - 1]);
            }
            const avgIntervalDays = Math.round(totalInterval / (orderDates.length - 1));

            const daysSinceLastPurchase = customer.lastPurchaseDate
                ? differenceInDays(now, customer.lastPurchaseDate)
                : 9999;

            let riskLevel: 'high' | 'medium' | 'low';
            if (daysSinceLastPurchase > avgIntervalDays * 1.5) {
                riskLevel = 'high';
            } else if (daysSinceLastPurchase > avgIntervalDays) {
                riskLevel = 'medium';
            } else {
                riskLevel = 'low';
            }

            // Estimate when the customer would churn (avgInterval * 1.5 from last purchase)
            const estimatedChurnDate = customer.lastPurchaseDate
                ? format(addDays(customer.lastPurchaseDate, Math.round(avgIntervalDays * 1.5)), 'yyyy-MM-dd')
                : null;

            results.push({
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                avgIntervalDays,
                daysSinceLastPurchase,
                riskLevel,
                estimatedChurnDate,
                purchaseCount: customer.purchaseCount,
            });
        }

        // Sort by risk: high first, then medium, then low
        const riskOrder = { high: 0, medium: 1, low: 2 };
        results.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

        return results;
    }
}
