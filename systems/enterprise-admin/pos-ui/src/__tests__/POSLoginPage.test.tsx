import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import POSLoginPage from '../pages/POSLoginPage';
import api from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    post: vi.fn(),
  },
}));

const mockedPost = vi.mocked(api.post);

beforeEach(() => {
  mockedPost.mockReset();
});

describe('POSLoginPage', () => {
  it('shows readable login copy and input label', () => {
    render(<POSLoginPage />);

    expect(screen.getByRole('heading', { name: 'PharmaSaaS POS' })).toBeInTheDocument();
    expect(screen.getByText('請掃描員工條碼或輸入員工代碼登入')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('員工條碼 / 員工代碼')).toBeInTheDocument();
    expect(screen.getByTestId('login-submit-button')).toBeDisabled();
  });

  it('shows a readable error when login fails', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce(new Error('bad code'));
    render(<POSLoginPage />);

    await user.type(screen.getByPlaceholderText('員工條碼 / 員工代碼'), 'BAD{Enter}');

    await waitFor(() => {
      expect(screen.getByText('登入失敗，請確認員工代碼後再試')).toBeInTheDocument();
    });
  });
});
