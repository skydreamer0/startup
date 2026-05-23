import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReorderForecastBadge from '../components/ReorderForecastBadge';

const forecasts = [
  {
    productId: 'p-mask',
    name: 'Surgical Masks',
    sku: 'MASK',
    stockQuantity: 8,
    safetyStock: 12,
    dailySalesVelocity: 4,
    estimatedDaysUntilStockout: 2,
    urgency: 'THIS_WEEK' as const,
  },
  {
    productId: 'p-saline',
    name: 'Saline Spray',
    sku: 'SALINE',
    stockQuantity: 14,
    safetyStock: 8,
    dailySalesVelocity: 1,
    estimatedDaysUntilStockout: 14,
    urgency: 'SOON' as const,
  },
];

describe('ReorderForecastBadge', () => {
  it('shows a compact topbar badge with the urgent forecast count', () => {
    render(<ReorderForecastBadge forecasts={forecasts} />);

    expect(screen.getByRole('button', { name: /reorder forecast: 2 items need attention/i })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('This week')).toBeInTheDocument();
  });

  it('opens a forecast detail list from the badge', async () => {
    const user = userEvent.setup();
    render(<ReorderForecastBadge forecasts={forecasts} />);

    await user.click(screen.getByRole('button', { name: /reorder forecast/i }));

    const popover = screen.getByRole('dialog', { name: /reorder forecast/i });
    expect(within(popover).getByText('Surgical Masks')).toBeInTheDocument();
    expect(within(popover).getByText('Stock 8')).toBeInTheDocument();
    expect(within(popover).getByText('Safety 12')).toBeInTheDocument();
    expect(within(popover).getByText('2d left · 4/day')).toBeInTheDocument();
  });

  it('renders nothing when there are no forecast items', () => {
    const { container } = render(<ReorderForecastBadge forecasts={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
