import { expect, type Locator, type Page } from '@playwright/test';

export async function assertCategoryFullyVisible(button: Locator) {
  const result = await button.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const nav = node.closest('nav')!.getBoundingClientRect();
    const css = getComputedStyle(node);
    const ring = css.outlineStyle === 'none' ? 0 : parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset);
    const edgeHits = [rect.left + 3, rect.right - 3].map(x => {
      const hit = document.elementFromPoint(x, rect.top + rect.height / 2);
      return hit === node || !!hit && node.contains(hit);
    });
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, ring,
      navLeft: nav.left, navRight: nav.right, navTop: nav.top, navBottom: nav.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight, scrollY,
      edgeHits, focused: document.activeElement === node };
  });
  expect(result.left - result.ring).toBeGreaterThanOrEqual(Math.max(0, result.navLeft) - 0.5);
  expect(result.right + result.ring).toBeLessThanOrEqual(Math.min(result.viewportWidth, result.navRight) + 0.5);
  expect(result.top - result.ring).toBeGreaterThanOrEqual(Math.max(0, result.navTop) - 0.5);
  expect(result.bottom + result.ring).toBeLessThanOrEqual(Math.min(result.viewportHeight, result.navBottom) + 0.5);
  expect(result.edgeHits).toEqual([true, true]);
  return result;
}

export async function assertCartControlsVisible(page: Page) {
  const controls = [page.getByTestId('cart-checkout-button'), page.getByTitle('拆單付款', { exact: true }),
    page.getByRole('button', { name: '清空購物車 (F5)', exact: true })];
  const receipts = [];
  for (const control of controls) {
    const result = await control.evaluate(node => {
      const r = node.getBoundingClientRect();
      const panel = node.closest('.pos-cart-panel')!.getBoundingClientRect();
      const footer = document.querySelector('.pos-statusbar')!.getBoundingClientRect();
      const recommendation = document.querySelector('.pos-recommendation-strip')!.getBoundingClientRect();
      // Test the edges as well as the center; a partly hidden button can pass a center-only check.
      const points = [[r.left + 3, r.top + r.height / 2], [r.right - 3, r.top + r.height / 2],
        [r.left + r.width / 2, r.top + 3], [r.left + r.width / 2, r.bottom - 3]];
      return { text: node.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        panelTop: panel.top, panelBottom: panel.bottom, footerTop: footer.top,
        recommendationHeight: recommendation.height, recommendationBottom: recommendation.bottom,
        viewportWidth: innerWidth, viewportHeight: innerHeight,
        edgeHits: points.map(([x, y]) => { const hit = document.elementFromPoint(x, y); return hit === node || !!hit && node.contains(hit); }) };
    });
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.right).toBeLessThanOrEqual(result.viewportWidth);
    expect(result.top).toBeGreaterThanOrEqual(Math.max(0, result.panelTop));
    expect(result.bottom).toBeLessThanOrEqual(Math.min(result.viewportHeight, result.panelBottom, result.footerTop));
    expect(result.edgeHits).toEqual([true, true, true, true]);
    expect(result.panelTop).toBeGreaterThanOrEqual(result.recommendationBottom);
    await control.click({ trial: true }); // Ordinary pointer actionability, without submitting or clearing.
    receipts.push(result);
  }
  return receipts;
}
