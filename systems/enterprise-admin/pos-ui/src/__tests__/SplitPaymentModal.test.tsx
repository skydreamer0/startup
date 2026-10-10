import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SplitPaymentModal from '../components/SplitPaymentModal';
import AdminPinModal from '../components/AdminPinModal';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';

beforeEach(() => {
  useCheckoutRecoveryStore.setState({ scope: null, pending: null });
  useCartStore.setState({
    items: [{ product: { id: 'synthetic-product', name: 'Synthetic product', sku: 'TEST', retailPrice: 100, stockQuantity: 20 }, quantity: 2, discountRate: 0 }],
    orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH',
    currentSalesStaffId: null, heldCarts: [],
  });
});
afterEach(cleanup);

function Flow({ confirm = vi.fn(), authorize = vi.fn() }: { confirm?: () => void; authorize?: (pin: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState(false);
  return <main>
    <section data-testid="background"><button onClick={() => setOpen(true)}>開啟拆單</button></section>
    {open && <SplitPaymentModal loading={false} suspended={pin} onClose={() => setOpen(false)}
      onConfirm={() => { confirm(); setPin(true); }} />}
    {pin && <AdminPinModal reason="合成授權測試" onClose={() => setPin(false)}
      onConfirm={(value) => { authorize(value); setPin(false); setOpen(false); }} />}
  </main>;
}

describe('split-payment dialog keyboard ownership (synthetic JSDOM)', () => {
  it('names the dialog and fields, moves focus inside, and hides only the background', async () => {
    const user = userEvent.setup();
    render(<Flow />);
    await user.click(screen.getByRole('button', { name: '開啟拆單' }));
    const dialog = screen.getByRole('dialog', { name: '拆單付款' });
    expect(within(dialog).getByRole('spinbutton', { name: '第 1 筆付款金額' })).toHaveFocus();
    expect(within(dialog).getByRole('combobox', { name: '第 1 筆付款方式' })).toBeInTheDocument();
    expect(screen.getByTestId('background')).toHaveAttribute('inert');
    expect(screen.getByTestId('background')).toHaveAttribute('aria-hidden', 'true');
    expect(dialog.closest('[inert]')).toBeNull();
  });

  it('cycles Tab and Shift+Tab across enabled controls', async () => {
    const user = userEvent.setup();
    render(<SplitPaymentModal onConfirm={vi.fn()} onClose={vi.fn()} loading={false} />);
    const first = screen.getByRole('combobox');
    const last = screen.getByRole('button', { name: '確認付款' });
    first.focus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
  });

  it.each(['Escape', 'pointer'])('cancels with %s, preserves the cart, and restores the opener over repeated openings', async (method) => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    const cart = useCartStore.getState();
    render(<Flow confirm={confirm} />);
    const opener = screen.getByRole('button', { name: '開啟拆單' });
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await user.click(opener);
      expect(screen.getByRole('heading', { name: '拆單付款' })).toBeInTheDocument();
      if (method === 'Escape') await user.keyboard('{Escape}');
      else await user.click(screen.getByRole('button', { name: '取消' }));
      expect(screen.queryByRole('heading', { name: '拆單付款' })).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
      expect(screen.getByTestId('background')).not.toHaveAttribute('inert');
      expect(screen.getByTestId('background')).not.toHaveAttribute('aria-hidden');
    }
    expect(confirm).not.toHaveBeenCalled();
    expect(useCartStore.getState()).toBe(cart);
  });

  it('does not leak page shortcuts or input Enter into a checkout', async () => {
    const user = userEvent.setup();
    const shortcut = vi.fn();
    const confirm = vi.fn();
    window.addEventListener('keydown', shortcut);
    try {
      render(<SplitPaymentModal onConfirm={confirm} onClose={vi.fn()} loading={false} />);
      await user.keyboard('{F2}{F4}{F7}{Enter}');
      expect(shortcut).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    } finally { window.removeEventListener('keydown', shortcut); }
  });

  it('freezes editing and cancellation while loading without losing the split draft', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    const close = vi.fn();
    const view = render(<SplitPaymentModal onConfirm={confirm} onClose={close} loading={false} />);
    await user.click(screen.getByRole('button', { name: '+ 加入第二付款方式' }));
    view.rerender(<SplitPaymentModal onConfirm={confirm} onClose={close} loading />);
    const dialog = screen.getByRole('dialog', { name: '拆單付款' });
    for (const control of dialog.querySelectorAll('input, select, button')) expect(control).toBeDisabled();
    expect(dialog).toHaveFocus();
    await user.keyboard('{Escape}{Tab}');
    expect(dialog).toHaveFocus();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(close).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    view.rerender(<SplitPaymentModal onConfirm={confirm} onClose={close} loading={false} />);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
    expect(screen.getByRole('spinbutton', { name: '第 1 筆付款金額' })).toHaveValue(200);
    expect(screen.getByRole('button', { name: '取消' })).toBeEnabled();
  });

  it('restores pre-existing inert and aria-hidden attribute values exactly', () => {
    const view = render(<main>
      <div data-testid="old-state" inert aria-hidden="false"><button>原有背景</button></div>
      <SplitPaymentModal onConfirm={vi.fn()} onClose={vi.fn()} loading={false} />
    </main>);
    const background = screen.getByTestId('old-state');
    expect(background).toHaveAttribute('aria-hidden', 'true');
    view.rerender(<main><div data-testid="old-state" inert aria-hidden="false"><button>原有背景</button></div></main>);
    expect(background).toHaveAttribute('inert', '');
    expect(background).toHaveAttribute('aria-hidden', 'false');
  });

  it('does not steal focus from a newer sibling dialog on unmount', () => {
    const view = render(<main>
      <SplitPaymentModal onConfirm={vi.fn()} onClose={vi.fn()} loading={false} />
    </main>);
    const newer = document.createElement('button');
    newer.textContent = '後來的對話框';
    view.container.querySelector('main')!.appendChild(newer);
    newer.focus();
    view.rerender(<main />);
    expect(newer).toHaveFocus();
    newer.remove();
  });

  it('keeps manager PIN reachable, owns its keyboard, and returns to the split confirmation', async () => {
    const user = userEvent.setup();
    const authorize = vi.fn();
    render(<Flow authorize={authorize} />);
    await user.click(screen.getByRole('button', { name: '開啟拆單' }));
    const split = screen.getByRole('dialog', { name: '拆單付款' });
    const confirm = within(split).getByRole('button', { name: '確認付款' });
    await user.click(confirm);
    const pin = screen.getByRole('dialog', { name: '管理員授權' });
    const firstDigit = within(pin).getByRole('button', { name: '1' });
    expect(firstDigit).toHaveFocus();
    expect(pin.closest('[inert], [aria-hidden="true"]')).toBeNull();
    expect(split.closest('[inert]')).not.toBeNull();
    await user.tab({ shift: true });
    expect(within(pin).getByRole('button', { name: '取消' })).toHaveFocus();
    await user.tab();
    expect(firstDigit).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '管理員授權' })).not.toBeInTheDocument();
    expect(confirm).toHaveFocus();
    expect(split.closest('[inert]')).toBeNull();
    expect(screen.getByTestId('background')).toHaveAttribute('inert');
    expect(authorize).not.toHaveBeenCalled();
  });

  it('does not change the existing four-digit PIN authorization and releases background after both close', async () => {
    const user = userEvent.setup();
    const authorize = vi.fn();
    render(<Flow authorize={authorize} />);
    await user.click(screen.getByRole('button', { name: '開啟拆單' }));
    await user.click(screen.getByRole('button', { name: '確認付款' }));
    const pin = screen.getByRole('dialog', { name: '管理員授權' });
    for (const digit of ['1', '2', '3', '4']) await user.click(within(pin).getByRole('button', { name: digit }));
    await user.click(within(pin).getByRole('button', { name: '確認授權' }));
    expect(authorize).toHaveBeenCalledExactlyOnceWith('1234');
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    expect(screen.getByTestId('background')).not.toHaveAttribute('inert');
    expect(screen.getByTestId('background')).not.toHaveAttribute('aria-hidden');
  });

  it('never confirms from a backdrop click', () => {
    const confirm = vi.fn();
    const close = vi.fn();
    render(<SplitPaymentModal onConfirm={confirm} onClose={close} loading={false} />);
    fireEvent.click(screen.getByRole('dialog', { name: '拆單付款' }).parentElement!);
    expect(confirm).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
