# ADR-010: Float → Decimal Migration for Monetary Fields

**Date:** 2026-05-20
**Status:** Accepted
**Branch:** master (AF-15, AF-16, AF-17)

## Context

Since the project's inception all monetary amounts (product prices, order totals, expense amounts, shift cash, settlement figures) were stored as PostgreSQL `DOUBLE PRECISION` (Prisma `Float`). This caused two categories of compounding problems as the codebase grew:

1. **IEEE 754 rounding errors accumulate.** `0.1 + 0.2 === 0.30000000000000004` in JavaScript and similar artifacts appear in PostgreSQL binary floating-point. For a pharmacy POS processing hundreds of daily transactions the cumulative drift corrupts daily settlement totals and financial reports.

2. **Frontend precision loss.** When Prisma returns a `Float`, JavaScript silently truncates values that exceed 15–16 significant digits. Because TWD prices regularly reach values like `9,999,999.9999`, the last digits are lost during serialisation.

3. **Audit and accounting correctness.** The `AccountingSyncLog` pushes `totalAmount` and `unit_price` to external accounting systems. Floating-point noise in those fields breaks reconciliation in QuickBooks / Xero.

Fields affected:
- `Product`: `costPrice`, `retailPrice`
- `Order`: `totalAmount`, `discountAmount`
- `OrderItem`: `unitPrice`, `finalUnitPrice`
- `Expense`: `amount`
- `Shift`: `openingCash`, `closingCash`
- `ProductBatch`: `costPrice`
- `DailySettlement`: `totalSales`, `cashAmount`, `cardAmount`, `linePayAmount`, `otherAmount`

## Decision

### 1. Prisma type: `Decimal` with `@db.Decimal(12,4)`

All monetary columns are changed from `Float` to `Decimal @db.Decimal(12,4)` in `schema.prisma`. The `(12,4)` precision stores values up to `99,999,999.9999` — sufficient for TWD amounts. Prisma maps this to `Prisma.Decimal` in TypeScript.

### 2. Rationale for `Decimal(12,4)` over `Decimal(18,2)`

- **4 decimal places** are needed because POS discounts can produce sub-cent `finalUnitPrice` values (e.g. 99 × 0.9% = 89.1).
- **12 integer digits** covers TWD amounts up to ~99 million, comfortable for pharmacy revenue.
- Using `18,2` would waste storage and make math slightly slower for no practical benefit at this scale.

### 3. Migration

A manual migration SQL file `20260520000001_arch_fix_5_float_to_decimal/migration.sql` uses `ALTER TABLE … ALTER COLUMN … TYPE DECIMAL(12,4) USING "column"::DECIMAL(12,4)` to preserve all existing data with exact conversion.

### 4. Service layer: `Number()` wrapping

Prisma returns `Decimal` values as `Prisma.Decimal` objects. When JavaScript arithmetic is needed (e.g. computing `revenue = quantity * unitPrice`), the values are converted with `Number(x)` at the computation boundary. This is the standard pattern recommended by the Prisma team and avoids polluting the rest of the codebase with `Prisma.Decimal` arithmetic methods.

```ts
// Before (Float — silent precision loss)
const rev = item.quantity * item.unitPrice;

// After (Decimal — explicit conversion at JS boundary)
const rev = item.quantity * Number(item.unitPrice);
```

### 5. JSON serialisation: `string` in API responses

Prisma serialises `Decimal` as a string (`"1234.5000"`) when it appears in a JSON response. This is intentional — it preserves all decimal digits without floating-point loss during transit.

**Consequence for frontend:** all TypeScript interfaces for monetary fields are widened to `number | string`. Display code and arithmetic must wrap the value with `Number()` before calling `.toFixed()`, `.toLocaleString()`, or performing arithmetic:

```ts
// Display
${Number(order.totalAmount).toLocaleString()}

// Arithmetic
const finalPrice = Number(product.retailPrice) * (1 - discountRate / 100);
```

Frontend components updated: `CartItem.tsx`, `ProductCard.tsx`, `ReceiptModal.tsx`, `ShiftListPage.tsx`, `BatchListPage.tsx`, `OrderListPage.tsx`, `cartStore.ts`.

Shared type package `@pharmasaas/types` updated: `Product.costPrice`, `Product.retailPrice`, `PosProduct.retailPrice`, `OrderItem.unitPrice/finalUnitPrice`, `Order.totalAmount`, `CheckoutResult.totalAmount/items[].unitPrice/items[].finalUnitPrice`.

## Consequences

**Positive**
- POS checkout, daily settlement totals, and financial reports are now arithmetically exact within the `Decimal(12,4)` range.
- Accounting sync payloads carry exact amounts — reconciliation in QuickBooks/Xero is reliable.
- No more invisible rounding drift across 6-month margin trend calculations.

**Negative / Trade-offs**
- `Number()` wrapping is required wherever service code or frontend code does arithmetic. Failing to wrap produces a `TypeError` at runtime (cannot multiply `Prisma.Decimal` by a JS `number` with `*`). ESLint rules or Zod `.transform()` could enforce this boundary more rigorously in a future phase.
- JSON responses now carry price fields as strings (`"99.9900"`). Any existing clients that assumed `typeof totalAmount === 'number'` will receive `"99.9900"` instead. All known admin-ui and pos-ui consumers are updated in this PR; unknown external API clients may need a versioned migration.
- The `ALTER COLUMN … USING … ::DECIMAL` migration is non-transactional in PostgreSQL for column type changes — it rewrites each row. On a large dataset this may require a maintenance window. For current scale (< 100k orders) it completes in under a second.

## Alternatives Considered

- **Integer cents (`Int`).** Store amounts as integer multiples of the smallest currency unit (e.g. 0.01 TWD). Eliminates floating-point issues and avoids string serialisation. Rejected for this migration because it requires dividing by 100 everywhere in the UI and backend, changing all seed data, and updating every Zod schema — a larger blast radius than switching to `Decimal`.
- **`decimal.js` in JS only, keep `Float` in DB.** Keeps the schema unchanged but only solves the frontend half of the problem. DB-side aggregates (`SUM`, `AVG`) still accumulate IEEE 754 errors. Rejected.
- **`Decimal(18,2)`.** Two decimal places are insufficient for per-unit prices after percentage discounts. Rejected in favour of `(12,4)`.

## References

- `systems/enterprise-admin/backend/prisma/schema.prisma` — field definitions
- `systems/enterprise-admin/backend/prisma/migrations/20260520000001_arch_fix_5_float_to_decimal/migration.sql` — DDL
- `systems/enterprise-admin/packages/types/src/index.ts` — shared type widening
- ROADMAP Phase Arch-Fix 5 (AF-15, AF-16, AF-17)
- [Prisma Decimal documentation](https://www.prisma.io/docs/orm/prisma-schema/data-model/scalar-types#decimal)
