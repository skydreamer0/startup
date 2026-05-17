import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CloseShiftDialog from '../components/CloseShiftDialog';

describe('CloseShiftDialog', () => {
  it('updates closing cash through the numeric input', async () => {
    const user = userEvent.setup();
    const onClosingCashChange = vi.fn();
    render(
      <CloseShiftDialog
        closingCash={0}
        onClosingCashChange={onClosingCashChange}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        loading={false}
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1234' } });

    expect(onClosingCashChange).toHaveBeenLastCalledWith(1234);
  });

  it('calls cancel and confirm actions', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <CloseShiftDialog
        closingCash={500}
        onClosingCashChange={vi.fn()}
        onConfirm={onConfirm}
        onCancel={onCancel}
        loading={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: '取消' }));
    await user.click(screen.getByRole('button', { name: '確認交班' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('disables confirm while loading', () => {
    render(
      <CloseShiftDialog
        closingCash={500}
        onClosingCashChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        loading
      />,
    );

    expect(screen.getByRole('button', { name: '交班中...' })).toBeDisabled();
  });
});
