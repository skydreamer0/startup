/**
 * Analytics API contract types.
 *
 * These interfaces define the return type contract for each public analytics
 * service method. They are consumed by the frontend (admin-ui) and must be
 * kept stable — breaking changes require a coordinated update with the UI.
 *
 * Extracted from the legacy 744-line `analytics.service.ts` as part of C-04.
 */

// ─── RFM (CRM) ───────────────────────────────────────────
export type RfmSegment = 'vip' | 'loyal' | 'new' | 'dormant' | 'at_risk';

export interface RfmCustomer {
    id: string;
    name: string | null;
    phone: string | null;
    segment: RfmSegment;
    recencyDays: number;
    frequency: number;
    monetary: number;
    lastPurchaseDate: Date | null;
}

export interface RfmResult {
    summary: Record<RfmSegment, number>;
    customers: RfmCustomer[];
}

// ─── Churn Risk (CRM) ────────────────────────────────────
export interface ChurnRiskCustomer {
    id: string;
    name: string | null;
    phone: string | null;
    avgIntervalDays: number;
    daysSinceLastPurchase: number;
    riskLevel: 'high' | 'medium' | 'low';
    estimatedChurnDate: string | null;
    purchaseCount: number;
}

// ─── ABC Product Analysis (Product) ──────────────────────
export type AbcQuadrant = 'star' | 'cash_cow' | 'hidden_gem' | 'underperformer';

export interface AbcProduct {
    id: string;
    name: string;
    sku: string;
    categoryName: string | null;
    supplierName: string | null;
    totalRevenue: number;
    totalQuantity: number;
    marginPct: number;
    quadrant: AbcQuadrant;
}

export interface AbcResult {
    summary: Record<AbcQuadrant, number>;
    medianRevenue: number;
    medianMargin: number;
    products: AbcProduct[];
}

// ─── Supplier Ranking (Product) ──────────────────────────
export interface RankedSupplier {
    id: string;
    name: string;
    totalRevenue: number;
    revenueShare: number;
    avgMarginPct: number;
    deliveryReliability: number | null;
    defectRate: number | null;
    compositeScore: number;
    productCount: number;
}

// Reorder Forecast (Product)
export type ReorderUrgency = 'THIS_WEEK' | 'SOON' | 'OK';

export interface ReorderForecastItem {
    productId: string;
    name: string;
    sku: string;
    stockQuantity: number;
    safetyStock: number;
    dailySalesVelocity: number;
    estimatedDaysUntilStockout: number | null;
    urgency: ReorderUrgency;
}

// ─── KPI Snapshot / Trend (Operations) ───────────────────
export interface KpiSnapshot {
    gross_margin_pct: number;
    cac_twd: number;
    aov_twd: number;
    ccc_days: number;
    ltv_twd: number;
    bonus_gate_pass: boolean;
    periodStart: string;
    periodEnd: string;
}

export interface KpiTrendPoint {
    period: string;
    gross_margin_pct: number;
    cac_twd: number;
    aov_twd: number;
    ccc_days: number;
    ltv_twd: number;
    bonus_gate_pass: boolean;
}

// ─── Sales Heatmap (Operations) ──────────────────────────
export interface HeatmapCell {
    weekday: number; // 0=Sun, 6=Sat
    hour: number;    // 0-23
    orderCount: number;
    revenue: number;
}

// ─── Bonus Gate (Operations) ─────────────────────────────
export interface BonusGateResult {
    period: string;
    grossMarginPct: number;
    grossMarginPass: boolean;
    cccDays: number;
    cccPass: boolean;
    gatePass: boolean;
    estimatedBonusPool: number;
    totalRevenue: number;
}
