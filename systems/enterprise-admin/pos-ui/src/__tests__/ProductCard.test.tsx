import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductCard from '../components/ProductCard';
import { useCartStore } from '../store/cartStore';
import { PosProduct } from '../api/pos';

const baseProduct: PosProduct = {
  id: 'p1',
  name: 'Panadol',
  sku: 'PAN',
  retailPrice: 100,
  stockQuantity: 20,
};

beforeEach(() => {
  useCartStore.setState({
    items: [],
    orderDiscountAmount: 0,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
  });
});

describe('ProductCard', () => {
  it('adds the product to the cart when clicked', async () => {
    const user = userEvent.setup();
    render(<ProductCard product={baseProduct} />);

    await user.click(screen.getByRole('button', { name: /Panadol/ }));

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].product.id).toBe('p1');
  });

  it('disables out-of-stock products and does not add them to the cart', async () => {
    const user = userEvent.setup();
    render(<ProductCard product={{ ...baseProduct, stockQuantity: 0 }} />);

    const button = screen.getByRole('button', { name: /Panadol/ });
    expect(button).toBeDisabled();
    await user.click(button);

    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('shows the low-stock quantity when stock is at or below safety stock', () => {
    render(<ProductCard product={{ ...baseProduct, stockQuantity: 3, safetyStock: 5 }} />);

    expect(screen.getByText(/3/)).toBeInTheDocument();
  });
});
