import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReceiptModal from '../components/ReceiptModal';

describe('ReceiptModal', () => {
  it('shows a readable checkout success summary', () => {
    render(
      <ReceiptModal
        order={{
          id: 'o1',
          orderNumber: 'ORD-001',
          totalAmount: 250,
          paymentMethod: 'CARD',
          items: [],
        }}
        onClose={vi.fn()}
        onPrint={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '結帳完成' })).toBeInTheDocument();
    expect(screen.getByText('ORD-001')).toBeInTheDocument();
    expect(screen.getByText('$250 元')).toBeInTheDocument();
    expect(screen.getByText('付款方式：信用卡')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '列印收據' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一筆交易' })).toBeInTheDocument();
  });
});
