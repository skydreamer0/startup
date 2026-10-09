import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BarcodeCandidates } from '../components/BarcodeCandidates';

describe('BarcodeCandidates', () => {
  it('renders nothing without a selection', () => {
    const { container } = render(<BarcodeCandidates selection={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('offers labelled native buttons and never selects on render', () => {
    const select = vi.fn(); const dismiss = vi.fn();
    render(<BarcodeCandidates selection={{ code: '00123', select, dismiss, products: [
      { id: 'a', sku: '00123', name: '第一商品', stockQuantity: 3, retailPrice: 120 },
      { id: 'b', sku: 'OTHER', barcode: '00123', name: '無庫存商品', stockQuantity: 0, retailPrice: 90 },
    ] }} />);
    expect(select).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /無庫存商品/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /第一商品/ }));
    expect(select).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: '取消選擇' }));
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
