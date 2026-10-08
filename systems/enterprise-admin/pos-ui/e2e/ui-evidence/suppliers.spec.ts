import type { Page } from '@playwright/test';
import { test, expect, intercept, success, screenshot, type Guard } from './fixtures';

const origin = 'http://127.0.0.1:4273';
const original = { id: 'supplier-original', name: '合成原供應商', email: 'original@example.test' };
const other = { id: 'supplier-other', name: '合成另一供應商', email: 'other@example.test' };
const item = { id: 'synthetic-product', sku: 'SYNTHETIC', name: '合成商品', costPrice: '40', retailPrice: '100',
  stockQuantity: 5, safetyStock: 2, supplierId: original.id, supplier: original };
type SupplierMode = 'success' | 'empty' | 'missing-current' | 403 | 500 | 'offline';

async function setup(page: Page, guard: Guard, initial: SupplierMode) {
  let mode = initial;
  await intercept(page, guard, origin, async (route, url) => {
    const path = url.pathname;
    if (path === '/api/v1/admin/auth/me') {
      await success(route, { id: 'synthetic-user', fullName: '合成測試員', email: 'qa@example.test', roles: ['Admin'], permissions: ['*'] }); return true;
    }
    if (path === '/api/v1/admin/tenants/me/plan') { await success(route, { plan: 'starter', features: [] }); return true; }
    if (path === '/api/v1/admin/inventory/products') {
      await success(route, { total: 1, page: 1, limit: 50, data: [item] }); return true;
    }
    if (path === '/api/v1/admin/inventory/suppliers') {
      if (mode === 'offline') await route.abort('connectionreset');
      else if (typeof mode === 'number') await route.fulfill({ status: mode, json: { success: false, error: { message: 'Synthetic supplier failure' } } });
      else await success(route, mode === 'empty' ? [] : mode === 'missing-current' ? [other] : [original, other]);
      return true;
    }
    return false;
  });
  await page.addInitScript(() => localStorage.setItem('accessToken', 'synthetic-ui-qa-token'));
  return { setMode(next: SupplierMode) { mode = next; } };
}

test('real supplier envelope renders product options and supplier table rows', async ({ page, guard }, info) => {
  await setup(page, guard, 'success');
  await page.goto(origin + '/inventory');
  await page.getByRole('button', { name: 'Add Product', exact: true }).click();
  const select = page.getByLabel('Supplier', { exact: true });
  await expect(select.locator('option')).toHaveCount(3);
  await select.selectOption(original.id);
  await expect(select).toHaveValue(original.id);
  await screenshot(page, info, 'supplier-options-success.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto(origin + '/suppliers');
  await expect(page.getByRole('row').filter({ hasText: original.name })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: other.name })).toBeVisible();
  await screenshot(page, info, 'supplier-table-success.png');
});

test('successful empty results remain distinct from an unavailable supplier list', async ({ page, guard }, info) => {
  await setup(page, guard, 'empty');
  await page.goto(origin + '/suppliers');
  await expect(page.getByText('No suppliers found', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await screenshot(page, info, 'supplier-table-empty.png');
  await page.goto(origin + '/inventory');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Supplier', { exact: true })).toHaveValue(original.id);
  await expect(page.getByLabel('Supplier', { exact: true }).locator('option:checked')).toContainText(original.name);
  await expect(page.getByText('No suppliers found', { exact: true })).toBeVisible();
  await screenshot(page, info, 'supplier-empty-retains-selection.png');
});

for (const failure of [403, 500, 'offline'] as const) {
  test(`${failure}: retry keeps the edited draft and missing original selection with zero submissions`, async ({ page, guard }, info) => {
    const api = await setup(page, guard, failure);
    await page.goto(origin + '/inventory');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const name = page.locator('.modal-content .input-group').filter({ has: page.getByText('Name', { exact: true }) }).locator('input');
    await name.fill('合成未儲存草稿');
    const select = page.getByLabel('Supplier', { exact: true });
    await expect(select).toHaveValue(original.id);
    await expect(select).toBeDisabled();
    await expect(select.locator('option:checked')).toContainText(original.name);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('No suppliers found', { exact: true })).toHaveCount(0);
    await screenshot(page, info, `supplier-${failure}-draft-retained.png`);
    const retry = page.getByRole('button', { name: 'Retry suppliers', exact: true });
    await expect(retry).toHaveAttribute('type', 'button');
    api.setMode('missing-current');
    await retry.click();
    await expect(select).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(name).toHaveValue('合成未儲存草稿');
    await expect(select).toHaveValue(original.id);
    await expect(select.locator('option:checked')).toContainText(original.name);
    await expect(select.locator(`option[value="${other.id}"]`)).toHaveCount(1);
    await screenshot(page, info, `supplier-${failure}-retry-retains-selection.png`);
    expect(guard.writes).toEqual([]);
  });
}

test('supplier table error is unavailable and retry restores actual rows', async ({ page, guard }, info) => {
  const api = await setup(page, guard, 403);
  await page.goto(origin + '/suppliers');
  await expect(page.getByRole('alert')).toContainText('403');
  await expect(page.getByText('Supplier list unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('No suppliers found', { exact: true })).toHaveCount(0);
  await screenshot(page, info, 'supplier-table-error.png');
  api.setMode('success');
  await page.getByRole('button', { name: 'Retry suppliers', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: original.name })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await screenshot(page, info, 'supplier-table-retry-success.png');
});
