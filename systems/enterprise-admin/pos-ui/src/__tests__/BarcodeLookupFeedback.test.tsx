import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarcodeLookupFeedback } from '../components/BarcodeLookupFeedback';

afterEach(cleanup);

describe('BarcodeLookupFeedback', () => {
  it('renders no live region when there is no lookup status', () => {
    const { container } = render(<BarcodeLookupFeedback status={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['loading', 'info', 'status', 'polite', '正在查詢 SKU…'],
    ['not-found', 'neutral', 'status', 'polite', '沒有完全相符的商品，請使用人工搜尋'],
    ['ambiguous', 'warning', 'status', 'polite', '找到多筆完全相符商品，請選擇商品或返回人工搜尋'],
    ['found', 'neutral', 'status', 'polite', '已找到商品，但庫存不足，未加入購物車'],
    ['error', 'danger', 'alert', 'assertive', '查詢商品失敗，請保留草稿並重新掃描或使用人工搜尋'],
    ['forbidden', 'danger', 'alert', 'assertive', '沒有商品查詢權限，請聯絡管理員；草稿已保留'],
  ] as const)('preserves the %s message and announcement', (kind, tone, role, live, message) => {
    render(<BarcodeLookupFeedback status={{ kind, message }} />);
    const notice = screen.getByRole(role);
    expect(notice).toHaveTextContent(message);
    expect(notice).toHaveAttribute('aria-live', live);
    expect(notice).toHaveClass('pos-barcode-feedback--' + tone);
    expect(screen.queryByRole(role === 'alert' ? 'status' : 'alert')).not.toBeInTheDocument();
  });
});
