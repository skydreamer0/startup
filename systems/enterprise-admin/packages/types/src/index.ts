/**
 * @pharmasaas/types
 *
 * Shared TypeScript types for the PharmaSaaS monorepo.
 *
 * Types here are hand-crafted to match the shapes produced by the backend Zod
 * schemas and Prisma queries. They serve as the single source of truth for
 * both admin-ui and pos-ui — neither UI should define its own duplicate
 * interfaces for these domain entities.
 *
 * Alignment with backend schemas:
 *   - Product / Supplier  → backend/src/modules/inventory/inventory.schema.ts
 *   - Customer            → backend/src/modules/crm/crm.schema.ts
 *   - Order / OrderItem   → backend/src/modules/orders/order.service.ts
 *   - POS types           → backend/src/modules/pos/pos.schema.ts
 *   - Analytics           → backend/src/modules/analytics/analytics.types.ts
 *   - Reports             → backend/src/modules/reports/
 *   - Dashboard           → backend/src/modules/dashboard/dashboard.service.ts
 */

// ─── Shared enums ────────────────────────────────────────────────────────────

export type PaymentMethod = 'CASH' | 'CARD' | 'LINE_PAY' | 'TRANSFER' | 'OTHER';

export type InteractionType =
  | 'LINE_MESSAGE'
  | 'STORE_VISIT'
  | 'PHONE_CALL'
  | 'SYSTEM_NOTICE';

// ─── Inventory ───────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  rating?: number;
  deliveryReliability?: number;
  defectRate?: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  costPrice: number | string;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  retailPrice: number | string;
  stockQuantity: number;
  safetyStock: number;
  supplier?: Supplier | null;
  category?: { id: string; name: string } | null;
  isLowStock?: boolean;
}

/** Exact inventory products payload inside ApiSuccess; distinct from meta/items pagination. */
export interface InventoryProductPage {
  total: number;
  page: number;
  limit: number;
  data: Product[];
}

/** Lightweight product shape returned by the POS products endpoint */
export interface PosProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  retailPrice: number | string;
  stockQuantity: number;
  safetyStock?: number;
  category?: { id: string; name: string };
}

// ─── CRM / Customers ─────────────────────────────────────────────────────────

export interface Interaction {
  id: string;
  customerId: string;
  type: InteractionType | string;
  content?: string;
  interactedAt: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name?: string;
  phone?: string;
  lineUid?: string;
  gender?: string;
  birthday?: string;
  totalSpent: number;
  purchaseCount: number;
  lastInteractionDate?: string;
  lastPurchaseDate?: string;
  interactions?: Interaction[];
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  unitPrice: number | string;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  finalUnitPrice?: number | string;
  product?: {
    name: string;
    sku: string;
  };
}

export interface Order {
  id: string;
  orderNumber?: string;
  customerId?: string;
  status: string;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  totalAmount: number | string;
  paymentMethod?: PaymentMethod | string;
  paymentStatus: string;
  shippingAddress?: string;
  createdAt: string;
  customer?: {
    name: string;
    phone: string;
  };
  _count?: {
    items: number;
  };
  items?: OrderItem[];
}

// ─── POS / Checkout ──────────────────────────────────────────────────────────

export interface CartItemPayload {
  productId: string;
  quantity: number;
  discountRate: number;
}

export interface CheckoutPayload {
  commandId: string;
  cartItems: CartItemPayload[];
  paymentMethod: PaymentMethod;
  payments?: PaymentEntry[];
  orderDiscountAmount: number;
  orderDiscountNote?: string;
  customerId?: string;
  shiftId: string;
  salesStaffId?: string;
  adminPin?: string;
}

export interface CheckoutResult {
  id: string;
  orderNumber: string;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  totalAmount: number | string;
  paymentMethod: string;
  items: {
    productId: string;
    quantity: number;
    /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
    unitPrice: number | string;
    /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
    finalUnitPrice: number | string;
  }[];
}

export type CheckoutCommandResult =
  | { commandId: string; status: 'UNKNOWN' }
  | { commandId: string; status: 'SUCCEEDED'; payloadHash: string; result: CheckoutResult };

export interface CheckoutContext {
  tenantId: string;
  userId: string;
}

// ─── Shifts / Staff ──────────────────────────────────────────────────────────

export interface PosStaff {
  id: string;
  fullName: string;
  email: string;
  employeeCode?: string;
}

export type PosCustomerSegment = 'vip' | 'loyal' | 'new' | 'at_risk';

export interface PosCustomerLookup {
  id: string;
  name: string | null;
  phone: string | null;
  rfmSegment: PosCustomerSegment;
  totalSpent: number;
  purchaseCount: number;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  recentPurchases: {
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    purchasedAt: string;
  }[];
  supplementDueItems: {
    productId: string;
    name: string;
    sku: string;
    daysSincePurchase: number;
  }[];
}

export interface PosRecommendation {
  productId: string;
  name: string;
  sku: string;
  retailPrice: number;
  stockQuantity: number;
  lastPurchasedAt?: string;
  daysSincePurchase?: number;
  quantitySold?: number;
  reason: 'REPLENISHMENT_DUE' | 'HOT_SELLER';
}

export interface ActiveShift {
  id: string;
  status: string;
  openedAt: string;
  staff: { id: string; fullName: string };
}

export interface Shift {
  id: string;
  staffId: string;
  status: 'OPEN' | 'CLOSED';
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  openingCash: number | string | null;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  closingCash: number | string | null;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  staff?: {
    id: string;
    fullName: string;
    email: string;
  };
  _count?: {
    orders: number;
  };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardKPIs {
  customers: { total: number; newThisMonth: number };
  revenue: { totalLifetime: number };
  inventory: {
    totalProducts: number;
    lowStockCount: number;
    lowStockItems: {
      name: string;
      sku: string;
      stockQuantity: number;
      safetyStock: number;
    }[];
  };
  suppliers: {
    avgDeliveryReliability: number | null;
    avgDefectRate: number | null;
  };
  recentInteractions: {
    id: string;
    type: string;
    content: string;
    interactedAt: string;
    customer: { name: string; phone: string };
  }[];
}

export interface CrmMetrics {
  totalCustomers: number;
  repeatCustomers: number;
  repurchaseRate: number;
  averageLTV: number;
  totalRevenue: number;
  churnRate90d: number;
  atRiskCustomers: number;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export type RfmSegment = 'vip' | 'loyal' | 'new' | 'dormant' | 'at_risk';

export interface RfmCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  segment: RfmSegment;
  recencyDays: number;
  frequency: number;
  monetary: number;
  lastPurchaseDate: string | null;
}

export interface RfmResult {
  summary: Record<RfmSegment, number>;
  customers: RfmCustomer[];
}

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

export interface HeatmapCell {
  weekday: number; // 0=Sun, 6=Sat
  hour: number;    // 0–23
  orderCount: number;
  revenue: number;
}

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

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface MarginProduct {
  id: string;
  sku: string;
  name: string;
  revenue: number;
  cogs: number;
  qty: number;
  margin: number;
  marginPct: number;
  contributionPct: number;
}

export interface MarginAnalysis {
  period: string;
  summary: {
    totalRevenue: number;
    totalCogs: number;
    totalMargin: number;
    totalMarginPct: number;
  };
  products: MarginProduct[];
}

export interface CashFlowStatement {
  period: string;
  beginningCash: number;
  operatingInflows: number;
  operatingOutflows: number;
  investingOutflows: number;
  financingCashFlow: number;
  netCashFlow: number;
  endingCash: number;
  expensesBreakdown: { type: string; amount: number; description?: string }[];
}

export interface SalesRankingProduct {
  id: string;
  sku: string;
  name: string;
  categoryName: string;
  revenue: number;
  quantity: number;
  margin: number;
  marginPct: number;
}

// ─── POS extended types ───────────────────────────────────────────────────────

export interface PosOrderItem {
  id: string;
  productId: string;
  quantity: number;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  unitPrice: number | string;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  finalUnitPrice: number | string;
  product: { id: string; name: string; sku: string };
}

export interface PosOrderSummary {
  id: string;
  orderNumber: string | null;
  status: string;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  totalAmount: number | string;
  /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
  discountAmount: number | string;
  paymentMethod: string;
  createdAt: string;
  items: PosOrderItem[];
}

export interface ShiftReport {
  shiftId: string;
  staffName: string;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  closingCash: number | null;
  orderCount: number;
  refundCount: number;
  grossSales: number;
  discountTotal: number;
  refundTotal: number;
  netTotal: number;
  paymentBreakdown: Record<string, number>;
  cashBalance: number;
}

// ─── Split Payment ────────────────────────────────────────────────────────────

export interface PaymentEntry {
  method: PaymentMethod;
  amount: number;
}

export interface SplitCheckoutPayload extends CheckoutPayload {
  payments: PaymentEntry[];
}

// ─── API response wrappers ────────────────────────────────────────────────────

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** Standard success envelope used by the backend API contract. */
export interface ApiSuccess<T, M = ApiMeta | undefined> {
  success: true;
  data: T;
  meta?: M;
}

/** Standard error envelope used by the backend API contract. */
export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T, M = ApiMeta | undefined> = ApiSuccess<T, M> | ApiFailure;

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
}

/** Common paginated payload shape used by legacy list endpoints. */
export interface PaginatedData<T> {
  data: T[];
  meta?: ApiMeta;
}

/** Standard paginated list response */
export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
