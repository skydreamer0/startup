import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '../api/inventory';
import MedicineLabelDialog from '../components/MedicineLabelDialog';

const product: Product = { id: 'medicine-1', name: '測試藥品', sku: 'MED-001', costPrice: '1', retailPrice: '2', stockQuantity: 1, safetyStock: 1 };
const png = 'iVBORw0KGgo=';
const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'same-job-key-123456789' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('requires a matching preview and operator confirmation before one local print', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'dry_run', sent: false, job_bytes: 240, job_sha256: 'a'.repeat(64), preview_png_base64: png }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ job: { job_id: 'job-1', status: 'queued', job_sha256: 'a'.repeat(64), physical_print_verified: false } }) });
    render(<MedicineLabelDialog product={product} onClose={vi.fn()} />);
    expect(screen.getByLabelText('藥品／商品名稱')).toHaveValue('測試藥品');
    expect(screen.getByLabelText('SKU')).toHaveValue('MED-001');
    expect(screen.queryByRole('button', { name: '確認送印一張' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('本機代理權杖'), { target: { value: 'local-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '取得列印預覽雜湊' }));
    await screen.findByAltText('本機渲染的 30 × 50 mm 標籤預覽');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '確認送印一張' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('內容及版面已核對，送印一張'));
    fireEvent.click(screen.getByRole('button', { name: '確認送印一張' }));
    await screen.findByText('已排入本機佇列，尚未送至標籤機。');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent).toMatchObject({ send: true, approved_sha256: 'a'.repeat(64), idempotency_key: 'same-job-key-123456789', copies: 1 });
    expect(screen.queryByRole('button', { name: '確認送印一張' })).not.toBeInTheDocument();
});

it('invalidates the preview when label content changes', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'dry_run', sent: false, job_bytes: 240, job_sha256: 'b'.repeat(64), preview_png_base64: png }) });
    render(<MedicineLabelDialog product={product} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('本機代理權杖'), { target: { value: 'local-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '取得列印預覽雜湊' }));
    await screen.findByAltText('本機渲染的 30 × 50 mm 標籤預覽');
    fireEvent.change(screen.getByLabelText('藥品／商品名稱'), { target: { value: '已修改' } });
    await waitFor(() => expect(screen.queryByAltText('本機渲染的 30 × 50 mm 標籤預覽')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
