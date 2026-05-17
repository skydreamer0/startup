import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StaffSwitchModal from '../components/StaffSwitchModal';
import { PosStaff } from '../api/pos';

const staffList: PosStaff[] = [
  { id: 's1', fullName: 'Alice Chen', email: 'alice@example.com', employeeCode: 'A001' },
  { id: 's2', fullName: 'Bob Lin', email: 'bob@example.com', employeeCode: 'B002' },
];

function setup(overrides = {}) {
  const props = {
    staffList,
    currentStaffId: 's1',
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<StaffSwitchModal {...props} />);
  return props;
}

describe('StaffSwitchModal', () => {
  it('filters staff by name, email, and employee code', async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByRole('textbox');

    await user.type(input, 'Bob');
    expect(screen.getByRole('button', { name: /Bob Lin/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alice Chen/ })).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'alice@example.com');
    expect(screen.getByRole('button', { name: /Alice Chen/ })).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'B002');
    expect(screen.getByRole('button', { name: /Bob Lin/ })).toBeInTheDocument();
  });

  it('selects the only filtered staff when Enter is pressed', async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.type(screen.getByRole('textbox'), 'Bob{Enter}');

    expect(props.onSelect).toHaveBeenCalledWith('s2');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.keyboard('{Escape}');

    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('selects staff when a row is clicked', async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole('button', { name: /Bob Lin/ }));

    expect(props.onSelect).toHaveBeenCalledWith('s2');
  });
});
