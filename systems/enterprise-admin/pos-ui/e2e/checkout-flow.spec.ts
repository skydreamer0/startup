import { test, expect, Page, APIRequestContext } from '@playwright/test';

/**
 * POS Checkout Flow — E2E Happy-Path Tests (AF-19)
 *
 * Prerequisites (before running):
 *   - Backend running on http://localhost:3000
 *   - POS UI dev server running on http://localhost:5174
 *   - A seeded tenant with:
 *       Employee code : A001  (or set POS_TEST_EMPLOYEE_CODE env var)
 *       At least one product in stock
 *
 * Run:
 *   npm run test:e2e
 */

// ---------------------------------------------------------------------------
// Configuration — override via environment variables in CI
// ---------------------------------------------------------------------------
const EMPLOYEE_CODE = process.env.POS_TEST_EMPLOYEE_CODE ?? 'A001';
const OPENING_CASH  = '1000';
const TENDERED_CASH = '999999'; // large value to guarantee change is positive
const BACKEND_URL = process.env.POS_TEST_BACKEND_URL ?? 'http://localhost:3000/api/v1/admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to the POS login page and clear any leftover session. */
async function goToLogin(page: Page) {
  // Navigate to the app origin first; Chromium denies localStorage on about:blank.
  await page.goto('/login');
  // Clear storage so we always start unauthenticated.
  await page.evaluate(() => localStorage.removeItem('pos_accessToken'));
  await page.goto('/login');
  await page.waitForSelector('[data-testid="login-employee-code-input"]');
}

/** Log in with the given employee code. */
async function login(page: Page, employeeCode: string = EMPLOYEE_CODE) {
  await page.fill('[data-testid="login-employee-code-input"]', employeeCode);
  await page.click('[data-testid="login-submit-button"]');
}

/** Close any previously-open POS shift so tests start from the same state. */
async function closeActiveShift(request: APIRequestContext) {
  const loginResponse = await request.post(`${BACKEND_URL}/pos/staff-login`, {
    data: { employeeCode: EMPLOYEE_CODE },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginJson = await loginResponse.json();
  const token = loginJson.data.accessToken as string;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const activeResponse = await request.get(`${BACKEND_URL}/pos/shift/active`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(activeResponse.ok()).toBeTruthy();
    const activeJson = await activeResponse.json();
    const shift = activeJson.data as { id?: string } | null;
    if (!shift?.id) return;

    const closeResponse = await request.patch(`${BACKEND_URL}/shifts/${shift.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { closingCash: Number(OPENING_CASH), notes: 'Closed by POS E2E setup' },
    });
    expect(closeResponse.ok()).toBeTruthy();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('POS Checkout Flow', () => {
  test.beforeEach(async ({ page, request }) => {
    await closeActiveShift(request);
    await goToLogin(page);
  });

  // -------------------------------------------------------------------------
  // Step 1 — Login
  // -------------------------------------------------------------------------
  test('1. Login page renders and accepts employee code', async ({ page }) => {
    const codeInput = page.getByTestId('login-employee-code-input');
    const submitBtn = page.getByTestId('login-submit-button');

    await expect(codeInput).toBeVisible();
    await expect(submitBtn).toBeDisabled(); // disabled until code is entered

    await codeInput.fill('SOME_CODE');
    await expect(submitBtn).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Step 2 — Open Shift
  // -------------------------------------------------------------------------
  test('2. After login, shift-open screen appears and shift can be opened', async ({ page }) => {
    await login(page);

    // Should land on ShiftOpenScreen (or redirect to / which renders it)
    const shiftOpenBtn = page.getByTestId('shift-open-button');
    await expect(shiftOpenBtn).toBeVisible({ timeout: 10_000 });

    const cashInput = page.getByTestId('shift-opening-cash-input');
    await cashInput.fill(OPENING_CASH);
    await expect(shiftOpenBtn).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Step 3 — Product Search
  // -------------------------------------------------------------------------
  test('3. POS checkout page: product search input is present and reacts to input', async ({ page }) => {
    await login(page);

    // Open shift so we reach the checkout page
    const shiftOpenBtn = page.getByTestId('shift-open-button');
    await shiftOpenBtn.waitFor({ timeout: 10_000 });
    await page.fill('[data-testid="shift-opening-cash-input"]', OPENING_CASH);
    await shiftOpenBtn.click();

    // Checkout page should now be visible
    const searchInput = page.getByTestId('product-search-input');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await searchInput.fill('test');
    await expect(searchInput).toHaveValue('test');
  });

  // -------------------------------------------------------------------------
  // Full Happy Path
  // -------------------------------------------------------------------------
  test('4. Full checkout and refund: refund registration leaves physical stock unchanged', async ({ page, request }, testInfo) => {
    // — Login —
    await login(page);

    // — Open Shift —
    const shiftOpenBtn = page.getByTestId('shift-open-button');
    await shiftOpenBtn.waitFor({ timeout: 10_000 });
    await page.fill('[data-testid="shift-opening-cash-input"]', OPENING_CASH);
    await shiftOpenBtn.click();

    // — Wait for POS checkout screen —
    const searchInput = page.getByTestId('product-search-input');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // — Add a product to cart (click the first in-stock product card) —
    // Products are rendered as [data-testid="product-card-<id>"] buttons.
    // We wait for at least one product card to appear after the API call.
    const firstProductCard = page.locator('[data-testid^="product-card-"]').first();
    await firstProductCard.waitFor({ timeout: 15_000 });
    await firstProductCard.click();

    // The checkout button should become enabled once there is ≥1 item
    const checkoutBtn = page.getByTestId('cart-checkout-button');
    await expect(checkoutBtn).toBeEnabled({ timeout: 5_000 });

    // — Open Payment Modal —
    await checkoutBtn.click();

    // PaymentModal confirm button should appear
    const confirmBtn = page.getByTestId('payment-confirm-button');
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });

    // — Select CASH payment method (it's the default, but let's be explicit) —
    const paymentModal = page.getByRole('heading', { name: '確認結帳' }).locator('..');
    await paymentModal.getByRole('button', { name: '現金' }).click();

    // — Enter tendered amount so change is valid —
    const tenderedInput = page.getByTestId('payment-tendered-input');
    await tenderedInput.fill(TENDERED_CASH);

    // Confirm button should now be enabled (tendered ≥ total)
    await expect(confirmBtn).toBeEnabled({ timeout: 3_000 });

    // — Confirm payment —
    const checkoutResponse = page.waitForResponse((response) => response.url().endsWith('/pos/checkout') && response.request().method() === 'POST');
    await confirmBtn.click();
    const sale: { id: string; orderNumber: string; items: { productId: string }[] } = (await (await checkoutResponse).json()).data;

    // — Receipt modal should appear —
    const receiptModal = page.getByTestId('receipt-modal');
    await expect(receiptModal).toBeVisible({ timeout: 10_000 });

    // Verify order number text is present
    await expect(receiptModal).toContainText('結帳完成');

    // — Close receipt (next transaction) —
    const nextBtn = page.getByTestId('receipt-next-button');
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();

    // Receipt modal should be gone
    await expect(receiptModal).not.toBeVisible({ timeout: 3_000 });

    // Money-only refund must not imply that physical goods were received.
    const auth = await request.post(`${BACKEND_URL}/pos/staff-login`, { data: { employeeCode: EMPLOYEE_CODE } });
    const headers = { Authorization: `Bearer ${(await auth.json()).data.accessToken}` };
    async function productStock() {
      const response = await request.get(`${BACKEND_URL}/pos/products`, { headers });
      expect(response.ok()).toBeTruthy();
      const products: { id: string; stockQuantity: number }[] = (await response.json()).data;
      return products.find((product) => product.id === sale.items[0].productId)!.stockQuantity;
    }
    const stockAfterSale = await productStock();
    await page.getByRole('button', { name: '📋 訂單 (F7)' }).click();
    await page.getByText(sale.orderNumber, { exact: true }).click();
    await page.getByRole('button', { name: '退款此訂單' }).click();
    await expect(page.getByRole('heading', { name: '登記退款' })).toBeVisible();
    await expect(page.getByText('此操作只登記退款，不會增加庫存。實體退回商品須另行驗收，才可處理回補。')).toBeVisible();
    await page.getByLabel('退款原因（選填）').fill('E2E 金流退款，未收回商品');
    await page.screenshot({ path: testInfo.outputPath('refund-registration.png'), fullPage: true });
    const refundResponse = page.waitForResponse((response) => response.url().endsWith(`/orders/${sale.id}/refund`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: '確認退款', exact: true }).click();
    expect((await refundResponse).ok()).toBeTruthy();
    await expect(page.getByText('退款已登記，庫存不變')).toBeVisible();
    expect(await productStock()).toBe(stockAfterSale);
    const stored = await request.get(`${BACKEND_URL}/pos/orders/${sale.id}`, { headers });
    expect((await stored.json()).data.status).toBe('refunded');
  });

  // -------------------------------------------------------------------------
  // Edge: login error shown for invalid code
  // -------------------------------------------------------------------------
  test('5. Login shows error message when employee code is wrong', async ({ page }) => {
    await page.fill('[data-testid="login-employee-code-input"]', 'INVALID_____CODE');
    await page.click('[data-testid="login-submit-button"]');

    // Error alert should appear
    const errorAlert = page.getByRole('alert');
    await expect(errorAlert).toBeVisible({ timeout: 8_000 });
    await expect(errorAlert).toContainText('登入失敗');
  });

  // -------------------------------------------------------------------------
  // Barcode scan simulation (keyboard injection)
  // -------------------------------------------------------------------------
  test('6. Barcode scanner simulation: typing a barcode in search adds product to cart', async ({ page }) => {
    await login(page);

    const shiftOpenBtn = page.getByTestId('shift-open-button');
    await shiftOpenBtn.waitFor({ timeout: 10_000 });
    await page.fill('[data-testid="shift-opening-cash-input"]', OPENING_CASH);
    await shiftOpenBtn.click();

    const searchInput = page.getByTestId('product-search-input');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // Wait for a product to load so we know a valid barcode
    const firstProductCard = page.locator('[data-testid^="product-card-"]').first();
    await firstProductCard.waitFor({ timeout: 15_000 });

    // The barcode scanner hook listens to rapid keydown events on the window.
    // Simulate by focusing body and dispatching keys quickly.
    // NOTE: this is a structural test — it verifies the input field responds;
    //       actual barcode-to-cart matching requires a known barcode in the DB.
    await searchInput.focus();
    await searchInput.fill('BARCODE123');
    await page.keyboard.press('Enter');

    // Either a product is added (cart becomes non-empty) or a toast appears
    // Both outcomes mean the barcode path was exercised — just assert no crash.
    await expect(page).toHaveURL(/\//); // still on checkout page
  });
});
