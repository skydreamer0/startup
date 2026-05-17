import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShift } from '../hooks/useShift';
import { ActiveShift } from '../api/pos';

const posApiMocks = vi.hoisted(() => ({
  getActiveShift: vi.fn(),
  openShift: vi.fn(),
  closeShift: vi.fn(),
}));
const { getActiveShift, openShift, closeShift } = posApiMocks;

vi.mock('../api/pos', () => ({
  posApi: posApiMocks,
}));

const activeShift: ActiveShift = {
  id: 'shift-1',
  status: 'OPEN',
  openedAt: '2026-05-17T00:00:00.000Z',
  staff: { id: 'staff-1', fullName: 'Alice Chen' },
};

function tokenWithUser(userId: string) {
  return `header.${btoa(JSON.stringify({ userId }))}.sig`;
}

function Harness({ showToast = vi.fn(), setSalesStaff = vi.fn() }) {
  const shift = useShift(showToast, setSalesStaff);
  return (
    <div>
      <output data-testid="active-shift">{shift.activeShift?.id ?? 'none'}</output>
      <output data-testid="opening">{String(shift.shiftOpening)}</output>
      <output data-testid="closing">{String(shift.shiftClosing)}</output>
      <output data-testid="show-close">{String(shift.showCloseShift)}</output>
      <button type="button" onClick={() => shift.setOpeningCash(1000)}>set opening</button>
      <button type="button" onClick={() => shift.setClosingCash(2500)}>set closing</button>
      <button type="button" onClick={() => shift.setActiveShift(activeShift)}>set active</button>
      <button type="button" onClick={() => shift.setShowCloseShift(true)}>show close</button>
      <button type="button" onClick={shift.handleOpenShift}>open</button>
      <button type="button" onClick={shift.handleCloseShift}>close</button>
    </div>
  );
}

describe('useShift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getActiveShift.mockResolvedValue({ data: { data: null } });
  });

  it('loads an active shift on mount and sets sales staff', async () => {
    const setSalesStaff = vi.fn();
    getActiveShift.mockResolvedValue({ data: { data: activeShift } });

    render(<Harness setSalesStaff={setSalesStaff} />);

    await waitFor(() => expect(screen.getByTestId('active-shift')).toHaveTextContent('shift-1'));
    expect(setSalesStaff).toHaveBeenCalledWith('staff-1');
  });

  it('opens a shift from the current POS token user', async () => {
    const user = userEvent.setup();
    const setSalesStaff = vi.fn();
    const showToast = vi.fn();
    localStorage.setItem('pos_accessToken', tokenWithUser('staff-2'));
    openShift.mockResolvedValue({ data: { data: { ...activeShift, id: 'shift-2', staff: { id: 'staff-2', fullName: 'Bob' } } } });
    render(<Harness showToast={showToast} setSalesStaff={setSalesStaff} />);

    await user.click(screen.getByRole('button', { name: 'set opening' }));
    await user.click(screen.getByRole('button', { name: 'open' }));

    await waitFor(() => expect(openShift).toHaveBeenCalledWith('staff-2', 1000));
    expect(screen.getByTestId('active-shift')).toHaveTextContent('shift-2');
    expect(setSalesStaff).toHaveBeenCalledWith('staff-2');
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('does not call openShift when token is missing', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    render(<Harness showToast={showToast} />);

    await user.click(screen.getByRole('button', { name: 'open' }));

    expect(openShift).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('closes an active shift and hides the close dialog', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    closeShift.mockResolvedValue({ data: { data: { ...activeShift, status: 'CLOSED' } } });
    render(<Harness showToast={showToast} />);

    await user.click(screen.getByRole('button', { name: 'set active' }));
    await user.click(screen.getByRole('button', { name: 'show close' }));
    await user.click(screen.getByRole('button', { name: 'set closing' }));
    await user.click(screen.getByRole('button', { name: 'close' }));

    await waitFor(() => expect(closeShift).toHaveBeenCalledWith('shift-1', 2500));
    expect(screen.getByTestId('active-shift')).toHaveTextContent('none');
    expect(screen.getByTestId('show-close')).toHaveTextContent('false');
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('shows API error messages when opening fails', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    localStorage.setItem('pos_accessToken', tokenWithUser('staff-2'));
    openShift.mockRejectedValue({ response: { data: { error: { message: 'already open' } } } });
    render(<Harness showToast={showToast} />);

    await user.click(screen.getByRole('button', { name: 'open' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith({ type: 'error', message: 'already open' }));
  });
});
