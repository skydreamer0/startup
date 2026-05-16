import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CartItem from '../components/CartItem';
import { useCartStore } from '../store/cartStore';
import { PosProduct } from '../api/pos';

const product: PosProduct = {
  id: 'p1',
  name: 'Panadol',
  sku: 'PAN',
  retailPrice: 100,
  stockQuantity: 20,
};

function setup(quantity = 1, discountRate = 0) {
  useCartStore.setState({
    items: [{ product, quantity, discountRate }],
    orderDiscountAmount: 0,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
  });
  const item = useCartStore.getState().items[0];
  return render(<CartItem item={item} />);
}

beforeEach(() => {
  useCartStore.setState({
    items: [],
    orderDiscountAmount: 0,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
  });
});

describe('CartItem display', () => {
  it('renders product name', () => {
    setup();
    expect(screen.getByText('Panadol')).toBeInTheDocument();
  });

  it('renders line total: price x quantity', () => {
    setup(2);
    expect(screen.getByText('$200')).toBeInTheDocument();
  });

  it('renders line total with discount applied', () => {
    setup(1, 10);
    expect(screen.getByText('$90')).toBeInTheDocument();
  });
});

describe('CartItem + button', () => {
  it('increments quantity in store when + clicked', async () => {
    const user = userEvent.setup();
    setup(1);
    await user.click(screen.getByRole('button', { name: '+' }));
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('caps quantity at stockQuantity', async () => {
    const user = userEvent.setup();
    setup(20);
    await user.click(screen.getByRole('button', { name: '+' }));
    expect(useCartStore.getState().items[0].quantity).toBe(20);
  });
});

describe('CartItem - button', () => {
  it('decrements quantity when - clicked', async () => {
    const user = userEvent.setup();
    setup(3);
    await user.click(screen.getByRole('button', { name: '−' }));
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('removes item from cart when quantity reaches 0', async () => {
    const user = userEvent.setup();
    setup(1);
    await user.click(screen.getByRole('button', { name: '−' }));
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});

describe('CartItem quantity input (direct typing)', () => {
  it('updates quantity when user clears and types new number', async () => {
    const user = userEvent.setup();
    setup(2);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '5');
    await user.tab();
    expect(useCartStore.getState().items[0].quantity).toBe(5);
  });

  it('updates quantity without clearing first', async () => {
    const user = userEvent.setup();
    setup(1);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '8');
    await user.tab();
    expect(useCartStore.getState().items[0].quantity).toBe(8);
  });

  it('respects stockQuantity max when typing large number', async () => {
    const user = userEvent.setup();
    setup(1);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '999');
    await user.tab();
    expect(useCartStore.getState().items[0].quantity).toBe(product.stockQuantity);
  });

  it('sets quantity to 1 if user types 0', async () => {
    const user = userEvent.setup();
    setup(1);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '0');
    await user.tab();
    expect(useCartStore.getState().items[0].quantity).toBe(1);
  });
});

describe('CartItem discount input', () => {
  it('updates discountRate when typing in discount field', async () => {
    const user = userEvent.setup();
    setup(1, 0);
    const discountInput = within(screen.getByText('折扣').parentElement!).getByPlaceholderText('0');
    await user.clear(discountInput);
    await user.type(discountInput, '20');
    expect(useCartStore.getState().items[0].discountRate).toBe(20);
  });
});

describe('CartItem x remove button', () => {
  it('removes item when x clicked', async () => {
    const user = userEvent.setup();
    setup(2);
    await user.click(screen.getByRole('button', { name: '×' }));
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});
