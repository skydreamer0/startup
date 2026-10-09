import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CloseShiftDialog from '../components/CloseShiftDialog';
import PaymentModal from '../components/PaymentModal';

describe('CloseShiftDialog', () => {
  it('consumes function keys and text Enter without invoking page or submit actions', () => {
    const onConfirm = vi.fn(); const onCancel = vi.fn(); const pageKey = vi.fn();
    const view = render(<CloseShiftDialog closingCash={500} onClosingCashChange={vi.fn()} onConfirm={onConfirm} onCancel={onCancel} loading={false} />);
    window.addEventListener('keydown', pageKey);
    try {
      for (const key of ['F2', 'F8', 'Enter']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        screen.getByRole('spinbutton', { name: '結帳金額' }).dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
      expect(pageKey).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled(); expect(onCancel).not.toHaveBeenCalled();
    } finally { window.removeEventListener('keydown', pageKey); view.unmount(); }
  });

  it.each(['{Enter}', ' '])('only activates the focused cancel button with %s', async (key) => {
    const user = userEvent.setup(); const onCancel = vi.fn(); const onConfirm = vi.fn();
    render(<CloseShiftDialog closingCash={500} onClosingCashChange={vi.fn()} onConfirm={onConfirm} onCancel={onCancel} loading={false} />);
    await user.tab(); await user.keyboard(key);
    expect(onCancel).toHaveBeenCalledOnce(); expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each(['{Enter}', ' '])('only activates the focused confirm button with %s', async (key) => {
    const user = userEvent.setup(); const onCancel = vi.fn(); const onConfirm = vi.fn();
    render(<CloseShiftDialog closingCash={500} onClosingCashChange={vi.fn()} onConfirm={onConfirm} onCancel={onCancel} loading={false} />);
    await user.tab({ shift: true }); await user.keyboard(key);
    expect(onConfirm).toHaveBeenCalledOnce(); expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not reclaim focus when loading completes behind a newer real payment modal', () => {
    const props = { closingCash: 500, onClosingCashChange: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() };
    const old = render(<CloseShiftDialog {...props} loading />);
    const newer = render(<PaymentModal loading={false} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const tendered = screen.getByRole('spinbutton', { name: '收取金額' });
    expect(tendered).toHaveFocus();
    old.rerender(<CloseShiftDialog {...props} loading={false} />);
    expect(tendered).toHaveFocus();
    old.unmount(); expect(tendered).toHaveFocus();
    newer.unmount();
  });

  it('keeps background inert until the newer close-shift dialog also releases it', () => {
    const props = { closingCash: 500, onClosingCashChange: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn(), loading: true };
    const view = render(<><button aria-hidden="false">背景</button><CloseShiftDialog key="old" {...props} /></>);
    const background = screen.getByText('背景');
    view.rerender(<><button aria-hidden="false">背景</button><CloseShiftDialog key="old" {...props} /><CloseShiftDialog key="new" {...props} /></>);
    const newer = screen.getAllByRole('dialog')[1];
    expect(newer).toHaveFocus();
    view.rerender(<><button aria-hidden="false">背景</button><CloseShiftDialog key="new" {...props} /></>);
    expect(newer).toHaveFocus();
    expect(background).toHaveAttribute('inert'); expect(background).toHaveAttribute('aria-hidden', 'true');
    view.rerender(<><button aria-hidden="false">背景</button></>);
    expect(background).not.toHaveAttribute('inert'); expect(background).toHaveAttribute('aria-hidden', 'false');
  });

  it('does not steal focus from a newer screen when the old dialog unmounts late', () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const view = render(<CloseShiftDialog closingCash={500} onClosingCashChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} loading />);
    const newer = document.createElement('button'); document.body.append(newer); newer.focus();
    view.unmount(); expect(newer).toHaveFocus();
    opener.remove(); newer.remove();
  });

  it('does not restore to a disconnected opener and restores preexisting inert state', () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const background = document.createElement('div'); background.setAttribute('inert', 'existing'); background.setAttribute('aria-hidden', 'true'); document.body.append(background);
    const view = render(<CloseShiftDialog closingCash={500} onClosingCashChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />);
    opener.remove(); view.unmount();
    expect(background).toHaveAttribute('inert', 'existing'); expect(background).toHaveAttribute('aria-hidden', 'true'); background.remove();
  });

  it('makes background controls inert and restores their prior attributes on close', () => {
    const background = document.createElement('button');
    background.textContent = '另一區域';
    background.setAttribute('aria-hidden', 'false');
    document.body.append(background);
    background.focus();
    const view = render(<CloseShiftDialog closingCash={500} onClosingCashChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />);
    expect(background).toHaveAttribute('inert');
    expect(background).toHaveAttribute('aria-hidden', 'true');
    view.unmount();
    expect(background).not.toHaveAttribute('inert');
    expect(background).toHaveAttribute('aria-hidden', 'false');
    expect(background).toHaveFocus();
    background.remove();
  });

  it('locks all controls and Escape while busy, keeps focus, then allows retry after failure', async () => {
    const user = userEvent.setup();
    const props = { closingCash: 500, onClosingCashChange: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn(), loading: false };
    const view = render(<CloseShiftDialog {...props} />);
    await user.click(screen.getByRole('button', { name: '確認交班' }));
    view.rerender(<CloseShiftDialog {...props} loading />);
    const dialog = screen.getByRole('dialog', { name: '確認交班' });
    const input = screen.getByRole('spinbutton', { name: '結帳金額' });
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(dialog).toHaveFocus();
    await user.tab(); await user.tab({ shift: true });
    expect(dialog).toHaveFocus();
    fireEvent.change(input, { target: { value: '900' } });
    await user.click(screen.getByRole('button', { name: '取消' }));
    await user.click(screen.getByRole('button', { name: '交班中...' }));
    await user.keyboard('{Escape}{Enter} ');
    expect(props.onClosingCashChange).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(props.onConfirm).toHaveBeenCalledOnce();
    view.rerender(<CloseShiftDialog {...props} />);
    expect(input).toHaveValue(500);
    expect(input).toHaveFocus();
    await user.click(screen.getByRole('button', { name: '確認交班' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab and Shift+Tab inside, dismisses with Escape, and restores the opener', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>開啟交班</button><button>背景操作</button>{open && <CloseShiftDialog closingCash={500} onClosingCashChange={vi.fn()} onConfirm={onConfirm} onCancel={() => setOpen(false)} loading={false} />}</>;
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: '開啟交班' });
    await user.click(opener);
    const input = screen.getByRole('spinbutton', { name: '結帳金額' });
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '確認交班' })).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('names the modal and its cash field and moves initial focus inside', () => {
    render(<CloseShiftDialog closingCash={500} onClosingCashChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />);
    expect(screen.getByRole('dialog', { name: '確認交班' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('spinbutton', { name: '結帳金額' })).toHaveFocus();
  });

  it('updates closing cash through the numeric input', async () => {
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
