# Enterprise Admin Test Coverage Backfill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Backfill focused regression tests for recently completed `systems/enterprise-admin` commits so POS UX phases, backend Arch-Fix changes, analytics fixes, and dashboard refresh behavior are covered by repeatable tests.

**Architecture:** Keep coverage close to the affected package: backend middleware/controller/service tests stay in `backend/src/__tests__`, POS interaction tests stay in `pos-ui/src/__tests__`, and admin dashboard tests stay in `admin-ui/src`. Prefer unit tests for pure middleware/controller behavior and React Testing Library tests for operator workflows. Do not broaden production refactors while adding tests.

**Tech Stack:** TypeScript, Vitest, React Testing Library, Supertest, Express, Prisma mocks where possible, jsdom, Vite.

---

## Current Progress Snapshot

Recent relevant commits already on `master` / `origin/master`:

- `c4911da test(analytics): mock tenant context in analytics.service.test`
- `bd48af3 perf+fix(arch): Arch-Fix Phase 3 - JWT optimization and rate limiting`
- `7dde0cf refactor(arch): Arch-Fix Phase 2 - type safety and consistency`
- `d9c5dee fix(arch): Arch-Fix Phase 1 - P0 critical fixes`
- `f65ea7c Merge pull request #6 from skydreamer0/feature/pos-ui-improvements`
- POS commits before the merge: Phase 1 checkout flow, Phase 2 payment/receipt confidence, Phase 3 responsive layout, Phase 4 offline/printer status, Phase 5 manager controls/shift management.

Existing test coverage:

- POS UI already has tests for `CartItem`, `CartPanel`, `cartStore`, `PaymentModal`, `POSLoginPage`, and `ReceiptModal`.
- Backend already has tests for analytics service, auth integration, JWT utilities, password, checkout, RBAC, validation, CRM, and inventory.
- Admin UI currently has only `src/hooks/authDemo.test.ts`; dashboard refresh and KPI rendering are not covered.

Primary uncovered or under-covered areas:

- Backend tenant context, JWT-permission fast path, and rate-limit middleware from Arch-Fix Phase 3.
- Backend analytics controller period parsing from Arch-Fix Phase 1.
- Admin UI `DashboardPage` refresh invalidation and bonus/heatmap rendering.
- POS Phase 3-5 operational flows: responsive status components, offline queue behavior, printer status, shift open/close, barcode handling.

## Verification Baseline

**Files:**
- Read: `systems/enterprise-admin/backend/package.json`
- Read: `systems/enterprise-admin/admin-ui/package.json`
- Read: `systems/enterprise-admin/pos-ui/package.json`

**Step 1: Run backend baseline tests**

Run:

```powershell
Set-Location 'systems\enterprise-admin\backend'
npm.cmd run test
```

Expected: either PASS, or a documented environment/sandbox failure. If the failure is `vitest.config` / esbuild access noise, record it and continue with targeted test commands after each task.

**Step 2: Run POS baseline tests**

Run:

```powershell
Set-Location 'systems\enterprise-admin\pos-ui'
npm.cmd run test
```

Expected: PASS. If current mojibake assertions or source strings fail compilation, fix only the test selectors needed for stable semantic coverage before adding new tests.

**Step 3: Run admin-ui baseline tests**

Run:

```powershell
Set-Location 'systems\enterprise-admin\admin-ui'
npm.cmd run test
```

Expected: PASS for existing `authDemo.test.ts`.

---

### Task 1: Backend Tenant Context Middleware Coverage

**Commit Coverage:** `bd48af3`

**Files:**
- Test: `systems/enterprise-admin/backend/src/__tests__/tenant.middleware.test.ts`
- Read: `systems/enterprise-admin/backend/src/middleware/tenant.middleware.ts`
- Read: `systems/enterprise-admin/backend/src/lib/tenant.context.ts`

**Step 1: Write failing tests**

Create `tenant.middleware.test.ts` with mocked `basePrisma` and `verifyAccessToken`.

Cover:

- `x-tenant-id` header resolves tenant and plan from DB.
- JWT payload containing `tenantId` and `plan` avoids user/tenant lookup for the user fallback.
- JWT payload without `tenantId` falls back to user lookup and tenant lookup.
- no tenant header/token falls back to the `default` tenant.
- missing explicit tenant returns `TENANT_NOT_FOUND` when DB lookup fails.

Example shape:

```ts
it('uses tenantId and plan from JWT payload without querying user fallback', async () => {
  vi.mocked(verifyAccessToken).mockReturnValue({
    userId: 'u1',
    email: 'admin@example.com',
    tenantId: 'tenant-1',
    plan: 'pro',
  });

  const { req, res, next, json } = createMocks({
    authorization: 'Bearer token',
  });

  await setTenantContext(req, res, next);

  expect(basePrisma.user.findUnique).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalled();
  expect(json).not.toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails before any needed production changes**

Run:

```powershell
Set-Location 'systems\enterprise-admin\backend'
npm.cmd run test -- src/__tests__/tenant.middleware.test.ts
```

Expected: new tests execute; failures should identify missing mock wiring or real behavior mismatch.

**Step 3: Minimal implementation adjustment if needed**

Only edit `tenant.middleware.ts` if a test exposes a real behavior bug. Do not alter tenant model assumptions unless the test proves the current behavior cannot work.

**Step 4: Verify**

Run:

```powershell
npm.cmd run test -- src/__tests__/tenant.middleware.test.ts
npm.cmd run build
```

Expected: tests pass and TypeScript compiles.

**Step 5: Commit**

```powershell
git add systems/enterprise-admin/backend/src/__tests__/tenant.middleware.test.ts systems/enterprise-admin/backend/src/middleware/tenant.middleware.ts
git commit -m "test(backend): cover tenant context resolution"
```

---

### Task 2: Backend Auth Middleware JWT Fast Path Coverage

**Commit Coverage:** `bd48af3`

**Files:**
- Test: `systems/enterprise-admin/backend/src/__tests__/auth.middleware.test.ts`
- Read: `systems/enterprise-admin/backend/src/middleware/auth.middleware.ts`
- Read: `systems/enterprise-admin/backend/src/lib/jwt.ts`

**Step 1: Write failing tests**

Cover:

- payload with `permissions` still verifies the user exists and is active, then attaches permissions without role joins.
- payload without `permissions` performs role-permission join and deduplicates permissions.
- inactive or missing users return `401`.
- invalid token returns `TOKEN_INVALID`.

Example assertion:

```ts
expect(req.user).toEqual({
  userId: 'u1',
  email: 'admin@example.com',
  permissions: ['read:orders', 'create:orders'],
});
expect(prisma.user.findUnique).toHaveBeenCalledWith({
  where: { id: 'u1', deletedAt: null },
  select: { id: true, email: true, status: true },
});
```

**Step 2: Run targeted test**

```powershell
Set-Location 'systems\enterprise-admin\backend'
npm.cmd run test -- src/__tests__/auth.middleware.test.ts
```

Expected: tests fail only where implementation or mocks are incomplete.

**Step 3: Minimal implementation adjustment if needed**

Only change `auth.middleware.ts` if the fast path skips required active-user validation or returns inconsistent error shape.

**Step 4: Verify**

```powershell
npm.cmd run test -- src/__tests__/auth.middleware.test.ts
npm.cmd run test -- src/__tests__/jwt.test.ts
npm.cmd run build
```

Expected: all pass.

**Step 5: Commit**

```powershell
git add systems/enterprise-admin/backend/src/__tests__/auth.middleware.test.ts systems/enterprise-admin/backend/src/middleware/auth.middleware.ts
git commit -m "test(backend): cover JWT permission auth path"
```

---

### Task 3: Backend Rate Limit Middleware Configuration Coverage

**Commit Coverage:** `bd48af3`

**Files:**
- Test: `systems/enterprise-admin/backend/src/__tests__/rate-limit.middleware.test.ts`
- Read: `systems/enterprise-admin/backend/src/middleware/rate-limit.middleware.ts`
- Read: `systems/enterprise-admin/backend/src/app.ts`

**Step 1: Write failing tests**

Mock `express-rate-limit` and assert each exported limiter is configured with the intended limits:

- `posRateLimit`: `windowMs = 60000`, `max = 120`
- `analyticsRateLimit`: `windowMs = 60000`, `max = 30`
- `defaultRateLimit`: `windowMs = 60000`, `max = 300`
- all use `standardHeaders: true`, `legacyHeaders: false`
- all return error code `RATE_LIMIT_EXCEEDED`

Example:

```ts
vi.mock('express-rate-limit', () => ({
  default: vi.fn((options) => ({ kind: 'limiter', options })),
}));

it('configures analytics limiter for expensive dashboard requests', async () => {
  const { analyticsRateLimit } = await import('../middleware/rate-limit.middleware');
  expect(analyticsRateLimit.options.max).toBe(30);
  expect(analyticsRateLimit.options.message.error.code).toBe('RATE_LIMIT_EXCEEDED');
});
```

**Step 2: Run targeted test**

```powershell
Set-Location 'systems\enterprise-admin\backend'
npm.cmd run test -- src/__tests__/rate-limit.middleware.test.ts
```

Expected: PASS after mock shape is correct.

**Step 3: Add route mounting check**

Add one app-level test in `src/__tests__/api.integration.test.ts` or a new lightweight `app.routes.test.ts` that mocks the limiter and verifies analytics/POS route modules are mounted behind the intended middleware. Prefer a new isolated `app.routes.test.ts` if integration test DB setup makes this brittle.

**Step 4: Verify**

```powershell
npm.cmd run test -- src/__tests__/rate-limit.middleware.test.ts
npm.cmd run build
```

Expected: pass.

**Step 5: Commit**

```powershell
git add systems/enterprise-admin/backend/src/__tests__/rate-limit.middleware.test.ts
git commit -m "test(backend): lock rate limit configuration"
```

---

### Task 4: Backend Analytics Controller Period Parsing Coverage

**Commit Coverage:** `d9c5dee`, `c4911da`

**Files:**
- Test: `systems/enterprise-admin/backend/src/__tests__/analytics.controller.test.ts`
- Read: `systems/enterprise-admin/backend/src/modules/analytics/analytics.controller.ts`
- Read: `systems/enterprise-admin/backend/src/__tests__/analytics.service.test.ts`

**Step 1: Write failing tests**

Mock `AnalyticsService` and call controller methods with mock request/response objects.

Cover:

- `getProductAbc`, `getSupplierRanking`, and `getHeatmap` use first-of-month inclusive start and first-of-next-month exclusive end for `period=2026-05`.
- invalid/missing period defaults to current month; use fake timers for stable expectations.
- `getKpis` keeps its current end-of-month behavior, so the test documents the difference from shared `parsePeriod`.

Example:

```ts
vi.setSystemTime(new Date('2026-05-17T08:00:00.000Z'));
await AnalyticsController.getSupplierRanking(reqWithPeriod('2026-04'), res, next);
expect(AnalyticsService.getSupplierRanking).toHaveBeenCalledWith(
  new Date('2026-04-01T00:00:00.000Z'),
  new Date('2026-05-01T00:00:00.000Z'),
);
```

**Step 2: Run targeted test**

```powershell
Set-Location 'systems\enterprise-admin\backend'
npm.cmd run test -- src/__tests__/analytics.controller.test.ts
```

Expected: tests should pass if current parsing is correct.

**Step 3: Verify analytics suite**

```powershell
npm.cmd run test -- src/__tests__/analytics.controller.test.ts src/__tests__/analytics.service.test.ts
npm.cmd run build
```

Expected: pass.

**Step 4: Commit**

```powershell
git add systems/enterprise-admin/backend/src/__tests__/analytics.controller.test.ts
git commit -m "test(analytics): cover controller period boundaries"
```

---

### Task 5: Admin Dashboard Refresh and KPI Rendering Coverage

**Commit Coverage:** `d9c5dee`

**Files:**
- Test: `systems/enterprise-admin/admin-ui/src/pages/DashboardPage.test.tsx`
- Optional Create: `systems/enterprise-admin/admin-ui/src/setupTests.ts`
- Modify if needed: `systems/enterprise-admin/admin-ui/vitest.config.ts`
- Read: `systems/enterprise-admin/admin-ui/src/pages/DashboardPage.tsx`
- Read: `systems/enterprise-admin/admin-ui/src/api/dashboard.ts`
- Read: `systems/enterprise-admin/admin-ui/src/components/Toast.tsx`

**Step 1: Add test setup if missing**

If `@testing-library/jest-dom` is not globally loaded for admin-ui, create:

```ts
import '@testing-library/jest-dom/vitest';
```

and add `setupFiles: ['./src/setupTests.ts']` to `vitest.config.ts`.

**Step 2: Write dashboard tests**

Mock:

- `../api/dashboard`
- `../components/Toast`
- `recharts` responsive/chart primitives as simple renderable components if jsdom sizing causes failures.

Cover:

- initial KPI cards render from mocked query data.
- clicking `Refresh Data` calls `queryClient.invalidateQueries({ queryKey: ['dashboard'] })`.
- refresh also calls `toast.info`.
- bonus gate PASS/FAIL status renders from data.
- heatmap renders 7 x 24 cells with titles when data is present.

Example:

```tsx
const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries }),
  };
});

it('invalidates dashboard queries when refresh is clicked', async () => {
  renderWithClient(<DashboardPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Refresh Data' }));
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  expect(toastInfo).toHaveBeenCalled();
});
```

**Step 3: Run targeted test**

```powershell
Set-Location 'systems\enterprise-admin\admin-ui'
npm.cmd run test -- src/pages/DashboardPage.test.tsx
```

Expected: PASS.

**Step 4: Verify admin-ui package**

```powershell
npm.cmd run test
npm.cmd run build
```

Expected: pass; if Vite/esbuild sandbox fails, record exact environment error and keep the targeted Vitest pass as code evidence.

**Step 5: Commit**

```powershell
git add systems/enterprise-admin/admin-ui/src/pages/DashboardPage.test.tsx systems/enterprise-admin/admin-ui/src/setupTests.ts systems/enterprise-admin/admin-ui/vitest.config.ts
git commit -m "test(admin-ui): cover dashboard refresh and KPI rendering"
```

---

### Task 6: POS Offline Queue Service Coverage

**Commit Coverage:** POS Phase 4, `f65ea7c`

**Files:**
- Test: `systems/enterprise-admin/pos-ui/src/__tests__/offlineQueue.test.ts`
- Read: `systems/enterprise-admin/pos-ui/src/services/offlineQueue.ts`

**Step 1: Write failing tests**

Use a small in-memory IndexedDB mock. If no dependency is installed, implement a local mock in the test file rather than adding a dependency.

Cover:

- `enqueuePending` stores payload and returns a `LOCAL-YYYYMMDD-xxxxx` order number.
- `getPending` filters out synced records.
- `getPendingCount` returns unsynced count.
- `markSynced` marks the record synced.
- `enqueuePending` throws when `MAX_PENDING` is reached.

Example:

```ts
vi.setSystemTime(new Date('2026-05-17T10:00:00.000Z'));
const record = await enqueuePending(payload);
expect(record.localOrderNumber).toMatch(/^LOCAL-20260517-[A-Z0-9]{5}$/);
expect(await getPendingCount()).toBe(1);
```

**Step 2: Run targeted test**

```powershell
Set-Location 'systems\enterprise-admin\pos-ui'
npm.cmd run test -- src/__tests__/offlineQueue.test.ts
```

Expected: PASS after the IndexedDB mock is stable.

**Step 3: Verify POS package**

```powershell
npm.cmd run test
npm.cmd run build
```

Expected: pass.

**Step 4: Commit**

```powershell
git add systems/enterprise-admin/pos-ui/src/__tests__/offlineQueue.test.ts
git commit -m "test(pos-ui): cover offline queue persistence"
```

---

### Task 7: POS Shift Hook and Manager Controls Coverage

**Commit Coverage:** POS Phase 5, `7dde0cf`, `f65ea7c`

**Files:**
- Test: `systems/enterprise-admin/pos-ui/src/__tests__/useShift.test.tsx`
- Read: `systems/enterprise-admin/pos-ui/src/hooks/useShift.ts`
- Read: `systems/enterprise-admin/pos-ui/src/components/CloseShiftDialog.tsx`
- Read: `systems/enterprise-admin/pos-ui/src/pages/ShiftOpenScreen.tsx`

**Step 1: Write failing hook tests**

Use a tiny test component that calls `useShift` and exposes buttons for `handleOpenShift`, `handleCloseShift`, and state setters.

Cover:

- initial mount loads active shift and sets sales staff.
- opening shift reads `pos_accessToken` userId and calls `posApi.openShift`.
- missing/invalid token shows an error toast and does not call API.
- closing active shift calls `posApi.closeShift`, clears active shift, and hides dialog.

Example:

```tsx
function Harness() {
  const shift = useShift(showToast, setSalesStaff);
  return (
    <>
      <button onClick={() => shift.setOpeningCash(1000)}>set cash</button>
      <button onClick={shift.handleOpenShift}>open</button>
      <button onClick={() => shift.setShowCloseShift(true)}>show close</button>
      <button onClick={shift.handleCloseShift}>close</button>
      <output>{shift.activeShift?.id ?? 'no-shift'}</output>
    </>
  );
}
```

**Step 2: Run targeted test**

```powershell
Set-Location 'systems\enterprise-admin\pos-ui'
npm.cmd run test -- src/__tests__/useShift.test.tsx
```

Expected: PASS.

**Step 3: Add component smoke tests if hook behavior is not enough**

If the hook test does not cover disabled/loading UI, add tests to:

- `src/__tests__/ShiftOpenScreen.test.tsx`
- `src/__tests__/CloseShiftDialog.test.tsx`

Cover button disabled states and numeric cash input behavior.

**Step 4: Verify**

```powershell
npm.cmd run test -- src/__tests__/useShift.test.tsx
npm.cmd run test
npm.cmd run build
```

Expected: pass.

**Step 5: Commit**

```powershell
git add systems/enterprise-admin/pos-ui/src/__tests__/useShift.test.tsx systems/enterprise-admin/pos-ui/src/__tests__/ShiftOpenScreen.test.tsx systems/enterprise-admin/pos-ui/src/__tests__/CloseShiftDialog.test.tsx
git commit -m "test(pos-ui): cover shift open and close flows"
```

---

### Task 8: POS Barcode Scanner and Checkout Keyboard Coverage

**Commit Coverage:** POS Phase 1, Phase 5, `7dde0cf`, `f65ea7c`

**Files:**
- Test: `systems/enterprise-admin/pos-ui/src/__tests__/useBarcodeScanner.test.tsx`
- Test: `systems/enterprise-admin/pos-ui/src/__tests__/POSCheckoutPage.keyboard.test.tsx`
- Read: `systems/enterprise-admin/pos-ui/src/hooks/useBarcodeScanner.ts`
- Read: `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`
- Read: `systems/enterprise-admin/pos-ui/src/services/barcodeService.ts`

**Step 1: Write barcode hook tests**

Mock `barcodeService`, `posApi.getProducts`, and cart store.

Cover:

- matching SKU from loaded products adds item, clears search, focuses search input, and shows success toast.
- out-of-stock match does not add item and shows warning toast.
- unknown barcode calls `posApi.getProducts`.
- API no-result path shows error toast.
- cleanup calls `stopBarcodeListener` and unsubscribe.

**Step 2: Run barcode test**

```powershell
Set-Location 'systems\enterprise-admin\pos-ui'
npm.cmd run test -- src/__tests__/useBarcodeScanner.test.tsx
```

Expected: PASS.

**Step 3: Write checkout keyboard tests**

Render `POSCheckoutPage` with mocked active shift and API data.

Cover:

- `F2` focuses search.
- `F3` focuses order discount input.
- `F6` opens staff switch modal.
- `Enter` opens payment modal only when cart has items.
- `Escape` closes staff/payment modal.

**Step 4: Run checkout keyboard test**

```powershell
npm.cmd run test -- src/__tests__/POSCheckoutPage.keyboard.test.tsx
```

Expected: PASS.

**Step 5: Verify**

```powershell
npm.cmd run test
npm.cmd run build
```

Expected: pass.

**Step 6: Commit**

```powershell
git add systems/enterprise-admin/pos-ui/src/__tests__/useBarcodeScanner.test.tsx systems/enterprise-admin/pos-ui/src/__tests__/POSCheckoutPage.keyboard.test.tsx
git commit -m "test(pos-ui): cover barcode and keyboard checkout flows"
```

---

### Task 9: POS Printer and Receipt Confidence Coverage

**Commit Coverage:** POS Phase 2, Phase 4, `f65ea7c`

**Files:**
- Test: `systems/enterprise-admin/pos-ui/src/__tests__/receiptService.test.ts`
- Test: `systems/enterprise-admin/pos-ui/src/__tests__/PrinterStatus.test.tsx`
- Read: `systems/enterprise-admin/pos-ui/src/services/receiptService.ts`
- Read: `systems/enterprise-admin/pos-ui/src/components/PrinterStatus.tsx`
- Read: `systems/enterprise-admin/pos-ui/src/components/ReceiptModal.tsx`

**Step 1: Write service tests**

Cover `printReceipt` behavior:

- writes receipt buffer to a new browser window or document path as currently implemented.
- rejects or surfaces a stable error when printing is unavailable.

**Step 2: Write component tests**

Cover `PrinterStatus`:

- renders available/unavailable state.
- reacts to online/offline or print capability changes if implemented.

**Step 3: Run targeted tests**

```powershell
Set-Location 'systems\enterprise-admin\pos-ui'
npm.cmd run test -- src/__tests__/receiptService.test.ts src/__tests__/PrinterStatus.test.tsx
```

Expected: PASS.

**Step 4: Verify**

```powershell
npm.cmd run test
npm.cmd run build
```

Expected: pass.

**Step 5: Commit**

```powershell
git add systems/enterprise-admin/pos-ui/src/__tests__/receiptService.test.ts systems/enterprise-admin/pos-ui/src/__tests__/PrinterStatus.test.tsx
git commit -m "test(pos-ui): cover printer and receipt confidence"
```

---

### Task 10: POS Responsive Layout and Status Surface Smoke Tests

**Commit Coverage:** POS Phase 3, Phase 4, `f65ea7c`

**Files:**
- Test: `systems/enterprise-admin/pos-ui/src/__tests__/POSCheckoutPage.layout.test.tsx`
- Read: `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`
- Read: `systems/enterprise-admin/pos-ui/src/components/OfflineStatus.tsx`
- Read: `systems/enterprise-admin/pos-ui/src/components/ProductGrid.tsx`
- Read: `systems/enterprise-admin/pos-ui/src/index.css`

**Step 1: Write layout smoke tests**

Because jsdom does not compute CSS layout reliably, test stable DOM contracts:

- `pos-shell`, `pos-topbar`, `pos-searchbar`, `pos-body`, `pos-category`, `pos-product-area`, `pos-cart`, and `pos-statusbar` render when shift is active.
- offline status and printer status are present in topbar.
- product grid and cart are both present with active shift.
- statusbar includes expected keyboard command labels.

**Step 2: Run targeted test**

```powershell
Set-Location 'systems\enterprise-admin\pos-ui'
npm.cmd run test -- src/__tests__/POSCheckoutPage.layout.test.tsx
```

Expected: PASS.

**Step 3: Optional browser verification**

If implementing code changes alongside tests, start POS dev server and verify HTML:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Expected local URL: `http://127.0.0.1:5174/`.

**Step 4: Verify**

```powershell
npm.cmd run test
npm.cmd run build
```

Expected: pass.

**Step 5: Commit**

```powershell
git add systems/enterprise-admin/pos-ui/src/__tests__/POSCheckoutPage.layout.test.tsx
git commit -m "test(pos-ui): cover checkout layout status surfaces"
```

---

## Final Cross-Package Verification

Run each package from its own directory:

```powershell
Set-Location 'systems\enterprise-admin\backend'
npm.cmd run test
npm.cmd run build
```

```powershell
Set-Location 'systems\enterprise-admin\admin-ui'
npm.cmd run test
npm.cmd run build
```

```powershell
Set-Location 'systems\enterprise-admin\pos-ui'
npm.cmd run test
npm.cmd run build
```

Expected:

- All targeted tests pass.
- Builds compile.
- If sandbox tooling blocks Vite/Vitest/esbuild, record exact error and rerun with approved outside-sandbox command before claiming completion.

## Coverage Matrix

| Commit / Area | Planned Tests |
| --- | --- |
| `c4911da` analytics tenant test fix | Task 4 verifies analytics controller + existing service suite |
| `bd48af3` JWT optimization and rate limiting | Tasks 1, 2, 3 |
| `7dde0cf` type safety and POS consistency | Tasks 7, 8 plus backend build |
| `d9c5dee` P0 dashboard / analytics fixes | Tasks 4, 5 |
| `f65ea7c` POS Phase 1-5 merge | Tasks 6, 7, 8, 9, 10 |
| Existing POS cart/payment/receipt tests | Kept as baseline; only adjust selectors if current mojibake or accessible labels make tests brittle |

## Execution Order

1. Backend tests first: Tasks 1-4. These are mostly unit-level and de-risk Arch-Fix commits.
2. Admin dashboard test: Task 5. This fills the largest admin-ui coverage gap.
3. POS operational tests: Tasks 6-10. These are more jsdom/mock heavy and should be done after baseline failures are understood.
4. Run final cross-package verification and commit any remaining test-only cleanup.

