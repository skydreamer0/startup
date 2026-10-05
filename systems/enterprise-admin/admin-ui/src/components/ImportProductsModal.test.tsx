import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImportProductsModal from './ImportProductsModal';
import { excelApi, type ImportPreview } from '../api/excel';

vi.mock('../api/excel', () => ({ excelApi: { previewImportProducts: vi.fn(), confirmImportProducts: vi.fn() } }));
function preview(token: string): ImportPreview {
  return { created: 1, updated: 0, errors: [], warnings: ['庫存數量不匯入'], previewToken: token,
    fileHash: 'a'.repeat(64), normalizedRevision: 'b'.repeat(64), expiresAt: Date.now() + 900_000 };
}
function setup() {
  const onSuccess = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <ImportProductsModal onClose={vi.fn()} onSuccess={onSuccess} />
  </QueryClientProvider>);
  return { input: screen.getByLabelText('Excel File (.xlsx)'), onSuccess };
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
      expect(onSuccess).not.toHaveBeenCalled();
    } finally { alert.mockRestore(); }
  });
});
