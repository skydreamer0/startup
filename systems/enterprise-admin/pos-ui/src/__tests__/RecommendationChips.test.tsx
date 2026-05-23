import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecommendationChips from '../components/RecommendationChips';

const recommendations = [
  {
    productId: 'p-vita',
    name: 'Vitamin C',
    sku: 'VIT-C',
    retailPrice: 240,
    stockQuantity: 12,
    lastPurchasedAt: '2026-04-20T00:00:00.000Z',
    daysSincePurchase: 33,
    reason: 'REPLENISHMENT_DUE' as const,
  },
  {
    productId: 'p-probiotic',
    name: 'Probiotic Sachets',
    sku: 'PROBIO',
    retailPrice: 680,
    stockQuantity: 8,
    lastPurchasedAt: '2026-04-10T00:00:00.000Z',
    daysSincePurchase: 43,
    reason: 'REPLENISHMENT_DUE' as const,
  },
];

describe('RecommendationChips', () => {
  it('renders compact recommendation chips with reasons and confidence', () => {
    render(<RecommendationChips recommendations={recommendations} onAdd={vi.fn()} />);

    expect(screen.getByText('Vitamin C')).toBeInTheDocument();
    expect(screen.getAllByText('上次購買，可能需要補貨')[0]).toBeInTheDocument();
    expect(screen.getByText('33d')).toBeInTheDocument();
    expect(screen.getByText('$240')).toBeInTheDocument();
  });

  it('calls onAdd with the selected product id', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<RecommendationChips recommendations={recommendations} onAdd={onAdd} />);

    await user.click(screen.getByRole('button', { name: /add vitamin c/i }));

    expect(onAdd).toHaveBeenCalledWith('p-vita');
  });

  it('renders nothing when there are no recommendations', () => {
    const { container } = render(<RecommendationChips recommendations={[]} onAdd={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
