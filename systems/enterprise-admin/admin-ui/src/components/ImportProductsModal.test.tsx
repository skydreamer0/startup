import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImportProductsModal from './ImportProductsModal';
import { excelApi, type ImportPreview, type ImportSummary } from '../api/excel';

vi.mock('../api/excel', () => ({ excelApi: { previewImportProducts: vi.fn(), confirmImportProducts: vi.fn() } }));
function preview(token: string): ImportPreview {
  return { created: 1, updated: 0, errors: [], warnings: ['庫存數量不匯入'], previewToken: token,
    fileHash: 'a'.repeat(64), normalizedRevision: 'b'.repeat(64), expiresAt: Date.now() + 900_000 };
}
function setup() {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <ImportProductsModal onClose={onClose} onSuccess={onSuccess} />
  </QueryClientProvider>);
  return { ...view, onClose, input: screen.getByLabelText('Excel File (.xlsx)'), onSuccess };
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
describe('Reviewed product import', () => {
  it('requires a new preview when the file changes and confirms the matching reviewed file/token', async () => {
    const { input, onSuccess } = setup();
    const first = new File(['first'], 'first.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const second = new File(['second'], 'second.xlsx', { type: first.type });
    vi.mocked(excelApi.previewImportProducts).mockResolvedValueOnce(preview('first-token')).mockResolvedValueOnce(preview('second-token'));
    vi.mocked(excelApi.confirmImportProducts).mockResolvedValue({ created: 1, updated: 0, errors: [], warnings: [] });
    fireEvent.change(input, { target: { files: [first] } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('button', { name: 'Confirm Import' });
    fireEvent.change(input, { target: { files: [second] } });
    expect(screen.queryByRole('button', { name: 'Confirm Import' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Import' }));
    await screen.findByText('Import Complete');
    expect(excelApi.confirmImportProducts).toHaveBeenCalledExactlyOnceWith(second, 'second-token');
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('lets the user preview again when confirmation rejects an expired or changed revision', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    try {
      const { input, onSuccess } = setup();
      vi.mocked(excelApi.previewImportProducts).mockResolvedValue(preview('expired-token'));
      vi.mocked(excelApi.confirmImportProducts).mockRejectedValue({ response: { data: { error: { message: '匯入預覽已過期，請重新預覽' } } } });
      fireEvent.change(input, { target: { files: [new File(['xlsx'], 'products.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] } });
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm Import' }));
      expect(await screen.findByRole('button', { name: 'Preview' })).toBeEnabled();
      expect(alert).toHaveBeenCalledWith('匯入預覽已過期，請重新預覽');
      expect(input).toHaveFocus();
      expect(onSuccess).not.toHaveBeenCalled();
    } finally { alert.mockRestore(); }
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function selectFile(input: HTMLElement) {
  const file = new File(['synthetic'], 'products.xlsx');
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe('Import dialog keyboard and request ownership', () => {
  it('names the dialog, focuses the file, cycles Tab/Shift+Tab and returns to its opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener); opener.focus();
    const view = setup();
    const dialog = screen.getByRole('dialog', { name: 'Import Products from Excel' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.parentElement).toHaveClass('import-products-overlay');
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(view.input).toHaveFocus();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.keyDown(view.input, { key: 'Tab', shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Tab' });
    expect(view.input).toHaveFocus();
    selectFile(view.input);
    const previewButton = screen.getByRole('button', { name: 'Preview' });
    previewButton.focus();
    fireEvent.keyDown(previewButton, { key: 'Tab' });
    expect(view.input).toHaveFocus();
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it.each(['Escape', 'Cancel', 'backdrop'])('%s dismisses without importing', (action) => {
    const view = setup(); selectFile(view.input);
    if (action === 'Escape') fireEvent.keyDown(view.input, { key: 'Escape' });
    else if (action === 'Cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    else fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(view.onClose).toHaveBeenCalledOnce();
    expect(excelApi.previewImportProducts).not.toHaveBeenCalled();
    expect(excelApi.confirmImportProducts).not.toHaveBeenCalled();
  });

  it('locks same-tick preview, dismissal and file changes, then restores interaction after failure', async () => {
    const pending = deferred<ImportPreview>();
    vi.mocked(excelApi.previewImportProducts).mockReturnValue(pending.promise);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const view = setup(); const file = selectFile(view.input);
    const button = screen.getByRole('button', { name: 'Preview' });
    act(() => {
      button.click(); button.click();
      fireEvent.keyDown(view.input, { key: 'Escape' });
      fireEvent.click(screen.getByRole('dialog').parentElement!);
      fireEvent.change(view.input, { target: { files: [new File(['other'], 'other.xlsx')] } });
    });
    await waitFor(() => expect(excelApi.previewImportProducts).toHaveBeenCalledExactlyOnceWith(file));
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('dialog')).toHaveFocus();
    expect(fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)).toBe(false);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('dialog')).toHaveFocus();
    await act(async () => pending.reject(new Error('preview offline')));
    await waitFor(() => expect(view.input).toBeEnabled());
    expect(view.input).toHaveFocus();
    expect(alert).toHaveBeenCalledWith('preview offline');
    alert.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(view.onClose).toHaveBeenCalledOnce();
  });

  it('locks confirmation and restores Close focus on success without duplicate writes', async () => {
    const pending = deferred<ImportSummary>();
    vi.mocked(excelApi.previewImportProducts).mockResolvedValue(preview('owned-token'));
    vi.mocked(excelApi.confirmImportProducts).mockReturnValue(pending.promise);
    const view = setup(); const file = selectFile(view.input);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm Import' });
    act(() => { confirm.click(); confirm.click(); fireEvent.keyDown(confirm, { key: 'Escape' }); });
    await waitFor(() => expect(excelApi.confirmImportProducts).toHaveBeenCalledExactlyOnceWith(file, 'owned-token'));
    expect(view.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => pending.resolve({ created: 1, updated: 0, errors: [], warnings: [] }));
    const close = await screen.findByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    expect(view.onSuccess).toHaveBeenCalledOnce();
  });

  it.each(['success', 'error'])('ignores late confirmation %s after external unmount/reopen', async (outcome) => {
    const pending = deferred<ImportSummary>();
    vi.mocked(excelApi.previewImportProducts).mockResolvedValue(preview('old-token'));
    vi.mocked(excelApi.confirmImportProducts).mockReturnValue(pending.promise);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const old = setup(); selectFile(old.input);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Import' }));
    await waitFor(() => expect(excelApi.confirmImportProducts).toHaveBeenCalledOnce());
    old.unmount();
    const current = setup();
    await act(async () => {
      if (outcome === 'success') pending.resolve({ created: 1, updated: 0, errors: [], warnings: [] });
      else pending.reject(new Error('detached failure'));
    });
    expect(current.input).toHaveFocus();
    expect(screen.queryByText('Import Complete')).not.toBeInTheDocument();
    expect(old.onSuccess).not.toHaveBeenCalled();
    expect(current.onSuccess).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });


  it('discards late preview after an external close/reopen', async () => {
    const pending = deferred<ImportPreview>();
    vi.mocked(excelApi.previewImportProducts).mockReturnValue(pending.promise);
    const old = setup(); selectFile(old.input);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(excelApi.previewImportProducts).toHaveBeenCalledOnce());
    old.unmount();
    const current = setup();
    await act(async () => pending.resolve(preview('detached-token')));
    expect(current.input).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Confirm Import' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    expect(excelApi.confirmImportProducts).not.toHaveBeenCalled();
  });

  it('does not restore an opener over focus deliberately moved outside on navigation', () => {
    const view = setup();
    const newer = document.createElement('button');
    document.body.append(newer); newer.focus();
    view.unmount();
    expect(newer).toHaveFocus();
    newer.remove();
  });
});
