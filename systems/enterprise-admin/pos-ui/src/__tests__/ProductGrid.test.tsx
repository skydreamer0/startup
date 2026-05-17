import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProductGrid from '../components/ProductGrid';
import { PosProduct } from '../api/pos';

const products: PosProduct[] = [
  { id: 'p1', name: 'Panadol', sku: 'PAN', retailPrice: 100, stockQuantity: 20 },
  { id: 'p2', name: 'Aspirin', sku: 'ASP', retailPrice: 80, stockQuantity: 10 },
];

describe('ProductGrid', () => {
  it('shows a loading state', () => {
    render(<ProductGrid products={[]} loading />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/載入|Loading|loading/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no products', () => {
    render(<ProductGrid products={[]} loading={false} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/沒有|No|no/i)).toBeInTheDocument();
  });

  it('renders product cards for each product', () => {
    render(<ProductGrid products={products} loading={false} />);

    expect(screen.getByRole('button', { name: /Panadol/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aspirin/ })).toBeInTheDocument();
  });
});
