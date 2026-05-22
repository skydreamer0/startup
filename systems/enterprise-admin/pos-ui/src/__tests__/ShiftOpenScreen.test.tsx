import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShiftOpenScreen from '../pages/ShiftOpenScreen';

describe('ShiftOpenScreen', () => {
  beforeEach(() => {
    localStorage.setItem('pos_accessToken', 'token');
  });

  it('updates opening cash through the numeric input', async () => {
    const user = userEvent.setup();
    const onOpeningCashChange = vi.fn();
    render(
      <ShiftOpenScreen
        openingCash={0}
        onOpeningCashChange={onOpeningCashChange}
        onOpenShift={vi.fn()}
        shiftOpening={false}
        toast={null}
        onDismissToast={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1000' } });

    expect(onOpeningCashChange).toHaveBeenLastCalledWith(1000);
  });

  it('calls open shift when the primary button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenShift = vi.fn();
    render(
      <ShiftOpenScreen
        openingCash={0}
        onOpeningCashChange={vi.fn()}
        onOpenShift={onOpenShift}
        shiftOpening={false}
        toast={null}
        onDismissToast={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('shift-open-button'));

    expect(onOpenShift).toHaveBeenCalledOnce();
  });

  it('disables the primary button while opening', () => {
    render(
      <ShiftOpenScreen
        openingCash={0}
        onOpeningCashChange={vi.fn()}
        onOpenShift={vi.fn()}
        shiftOpening
        toast={null}
        onDismissToast={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '開班中...' })).toBeDisabled();
  });

  it('logs out by clearing token', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ShiftOpenScreen
        openingCash={0}
        onOpeningCashChange={vi.fn()}
        onOpenShift={vi.fn()}
        shiftOpening={false}
        toast={null}
        onDismissToast={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '登出' }));

    expect(localStorage.getItem('pos_accessToken')).toBeNull();
  });
});
