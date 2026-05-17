import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryNav from '../components/CategoryNav';

const categories = [
  { id: 'pain', name: 'Pain Relief' },
  { id: 'cold', name: 'Cold Care' },
];

describe('CategoryNav', () => {
  it('renders an all-category button before real categories', () => {
    render(<CategoryNav categories={categories} selectedId={null} onSelect={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[1]).toHaveTextContent('Pain Relief');
    expect(buttons[2]).toHaveTextContent('Cold Care');
  });

  it('selects a category by id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CategoryNav categories={categories} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Cold Care' }));

    expect(onSelect).toHaveBeenCalledWith('cold');
  });

  it('selects null when the all-category button is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CategoryNav categories={categories} selectedId="pain" onSelect={onSelect} />);

    await user.click(screen.getAllByRole('button')[0]);

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('marks the selected category as active', () => {
    render(<CategoryNav categories={categories} selectedId="pain" onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Pain Relief' })).toHaveClass('pos-category-btn--active');
  });
});
