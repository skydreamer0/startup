import type { Page } from '@playwright/test';

type LoginCredentials = { email: string; password: string };

export async function loginToReceiving(page: Page, origin: string, credentials: LoginCredentials) {
  await page.goto(`${origin}/receiving`);
  const email = page.locator('#login-email');
  // Auth hydration may still be pending after goto; do not mistake it for an existing session.
  await email.or(page.getByRole('button', { name: '新增私人草稿', exact: true }))
    .waitFor({ state: 'visible', timeout: 10_000 });
  if (await email.isVisible()) {
    await email.fill(credentials.email);
    await page.locator('#login-password').fill(credentials.password);
    await page.locator('#login-submit').click();
    // PublicRoute intentionally lands at Dashboard; exercise the normal Admin navigation.
    await page.waitForURL(`${origin}/dashboard`, { timeout: 10_000 });
    await page.getByRole('link', { name: '人工收貨草稿', exact: true }).click();
  }
  await page.waitForURL(`${origin}/receiving`, { timeout: 10_000 });
}
