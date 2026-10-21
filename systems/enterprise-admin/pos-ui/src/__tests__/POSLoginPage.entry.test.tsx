import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import POSLoginPage from '../pages/POSLoginPage';
import api from '../api/client';

vi.mock('../api/client', () => ({ default: { post: vi.fn() } }));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.post).mockReset();
  // jsdom cannot perform the unchanged full-page navigation. Native QA owns that assertion.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function fillAndSubmit(value = 'SYNTHETIC-EMPLOYEE') {
  fireEvent.change(screen.getByTestId('login-employee-code-input'), { target: { value } });
  fireEvent.click(screen.getByTestId('login-submit-button'));
}
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  vi.mocked(api.post).mockImplementation(() => new Promise((yes, no) => { resolve = yes; reject = no; }) as ReturnType<typeof api.post>);
  return { resolve: (body: unknown) => resolve({ data: body }), reject: (error: Error) => reject(error) };
}
const success = (token = 'synthetic-valid-session') => ({ success: true, data: { accessToken: token } });
const settle = async (action: () => void) => { await act(async () => { action(); await Promise.resolve(); }); };

it('existing employee-code textbox has a programmatic accessible name and initial focus', () => {
  render(<POSLoginPage />);
  expect(screen.getByRole('textbox', { name: '員工條碼 / 員工代碼' })).toHaveFocus();
});

it('blank input cannot dispatch, and the real request retains trimmed code and an abort signal', () => {
  deferred(); render(<POSLoginPage />); fillAndSubmit('   ');
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(api.post).not.toHaveBeenCalled();
  fillAndSubmit('  SYNTHETIC-EMPLOYEE  ');
  expect(api.post).toHaveBeenCalledWith('/pos/staff-login', { employeeCode: 'SYNTHETIC-EMPLOYEE' }, { signal: expect.any(AbortSignal) });
});

it('repeated Enter and click while pending dispatch exactly one request', () => {
  deferred(); render(<POSLoginPage />); fillAndSubmit();
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  fireEvent.click(screen.getByTestId('login-submit-button'));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('textbox')).toBeDisabled();
  expect(screen.getByTestId('login-submit-button')).toHaveTextContent('登入中');
});

it.each(['resolve', 'reject'] as const)('unmount aborts the request and an adapter ignoring cancellation cannot publish a late %s', async outcome => {
  const pending = deferred(); const view = render(<POSLoginPage />); fillAndSubmit();
  const signal = vi.mocked(api.post).mock.calls[0][2]?.signal as AbortSignal;
  view.unmount(); expect(signal.aborted).toBe(true);
  localStorage.setItem('pos_accessToken', 'synthetic-new-session');
  await settle(() => outcome === 'resolve' ? pending.resolve(success('synthetic-stale-session')) : pending.reject(new Error('synthetic late failure')));
  expect(localStorage.getItem('pos_accessToken')).toBe('synthetic-new-session');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each(['resolve', 'reject'] as const)('another session created while mounted is not replaced or given a stale %s error', async outcome => {
  const pending = deferred(); render(<POSLoginPage />); fillAndSubmit();
  localStorage.setItem('pos_accessToken', 'synthetic-new-session');
  await settle(() => outcome === 'resolve' ? pending.resolve(success('synthetic-stale-session')) : pending.reject(new Error('synthetic late failure')));
  expect(localStorage.getItem('pos_accessToken')).toBe('synthetic-new-session');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).not.toBeDisabled();
});

it.each([
  undefined, null, {}, { success: true }, { success: true, data: {} },
  { success: true, data: { accessToken: null } }, { success: true, data: { accessToken: '' } },
  { success: true, data: { accessToken: '  ' } }, { success: true, data: { accessToken: 1 } },
  { success: true, data: { accessToken: {} } }, { success: true, data: { accessToken: false } },
  { success: false, data: { accessToken: 'synthetic-rejected-session' } },
  { success: 'true', data: { accessToken: 'synthetic-rejected-session' } },
])('malformed or unsuccessful body cannot publish an authenticated session (%j)', async body => {
  vi.mocked(api.post).mockResolvedValue({ data: body } as never);
  render(<POSLoginPage />); fillAndSubmit(); await settle(() => {});
  expect(localStorage.getItem('pos_accessToken')).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('登入失敗');
  expect(screen.getByRole('textbox')).toHaveValue('');
});

it('a valid response is accepted under StrictMode without modifying the token value', async () => {
  vi.mocked(api.post).mockResolvedValue({ data: success('synthetic-exact-token') } as never);
  render(<StrictMode><POSLoginPage /></StrictMode>); fillAndSubmit(); await settle(() => {});
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('pos_accessToken')).toBe('synthetic-exact-token');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('ordinary error resets the code, restores focus, and a fresh retry can succeed', async () => {
  vi.useFakeTimers();
  vi.mocked(api.post).mockRejectedValueOnce(new Error('synthetic failure')).mockResolvedValueOnce({ data: success() } as never);
  render(<POSLoginPage />); fillAndSubmit(); await settle(() => {});
  expect(screen.getByRole('alert')).toHaveTextContent('登入失敗');
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  expect(screen.getByRole('textbox')).toHaveFocus();
  fillAndSubmit(); await settle(() => {});
  expect(localStorage.getItem('pos_accessToken')).toBe('synthetic-valid-session');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('the owned error focus timer cannot focus an unmounted or newly pending view', async () => {
  vi.useFakeTimers(); vi.mocked(api.post).mockRejectedValueOnce(new Error('synthetic failure'));
  const view = render(<POSLoginPage />); fillAndSubmit(); await settle(() => {});
  const oldFocus = vi.spyOn(screen.getByRole('textbox'), 'focus');
  view.unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(oldFocus).not.toHaveBeenCalled();
  deferred(); render(<POSLoginPage />); fillAndSubmit();
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(screen.getByRole('textbox')).toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
