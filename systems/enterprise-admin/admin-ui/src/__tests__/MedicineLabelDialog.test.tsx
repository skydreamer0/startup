import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '../api/inventory';
import MedicineLabelDialog from '../components/MedicineLabelDialog';

const product: Product = { id: 'medicine-1', name: '測試藥品', englishName: 'Example Medicine', strength: '10 mg', dosageForm: '錠', genericName: 'Test ingredient', nhiCode: 'NHI-001', licenseNumber: '衛部藥製字第000001號', sku: 'MED-001', costPrice: '1', retailPrice: '2', stockQuantity: 1, safetyStock: 1 };
const png = 'iVBORw0KGgo=';
const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'same-job-key-123456789' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('requires a matching preview and operator confirmation before one local print', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'dry_run', sent: false, job_bytes: 240, job_sha256: 'a'.repeat(64), preview_png_base64: png, layout: 'medicine-landscape-v8' }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ job: { job_id: 'job-1', status: 'queued', job_sha256: 'a'.repeat(64), physical_print_verified: false } }) });
    render(<MedicineLabelDialog product={product} onClose={vi.fn()} />);
    expect(screen.getByLabelText('資料庫藥品標籤內容')).toHaveTextContent('測試藥品');
    expect(screen.getByLabelText('資料庫藥品標籤內容')).toHaveTextContent('Example Medicine');
    expect(screen.getByLabelText('資料庫藥品標籤內容')).toHaveTextContent('本次實際儲位');
    expect(screen.getByLabelText('資料庫藥品標籤內容')).toHaveTextContent('P1:MED-001');
    expect(screen.queryByRole('button', { name: '確認送印一張' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('本機代理權杖'), { target: { value: 'local-secret' } });
    expect(screen.getByRole('button', { name: '取得列印預覽雜湊' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('本次實際儲位'), { target: { value: 'A01-02' } });
    fireEvent.click(screen.getByRole('button', { name: '取得列印預覽雜湊' }));
    await screen.findByAltText('本機渲染的 50 × 30 mm 橫式藥品標籤預覽');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '確認送印一張' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('內容及版面已核對，送印一張'));
    fireEvent.click(screen.getByRole('button', { name: '確認送印一張' }));
    await screen.findByText('已排入本機佇列，尚未送至標籤機。');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent).toMatchObject({ width_mm: 50, height_mm: 30, send: true, approved_sha256: 'a'.repeat(64), idempotency_key: 'same-job-key-123456789', copies: 1,
        medicine: { name: '測試藥品', english_name: 'Example Medicine', generic_name: 'Test ingredient', nhi_code: 'NHI-001', license_number: '衛部藥製字第000001號', sku: 'MED-001', storage_location: 'A01-02' } });
    expect(screen.queryByRole('button', { name: '確認送印一張' })).not.toBeInTheDocument();
});

it('blocks preview when a required medicine field is missing', async () => {
    render(<MedicineLabelDialog product={{ ...product, licenseNumber: null }} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('本機代理權杖'), { target: { value: 'local-secret' } });
    fireEvent.change(screen.getByLabelText('本次實際儲位'), { target: { value: 'A01-02' } });
    expect(screen.getByRole('alert')).toHaveTextContent('完整藥證');
    expect(screen.getByRole('button', { name: '取得列印預覽雜湊' })).toBeDisabled();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
});

it('invalidates the approved preview when the print-time location changes', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'dry_run', sent: false, job_bytes: 240,
        job_sha256: 'b'.repeat(64), preview_png_base64: png, layout: 'medicine-landscape-v8' }) });
    render(<MedicineLabelDialog product={product} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('本機代理權杖'), { target: { value: 'local-secret' } });
    fireEvent.change(screen.getByLabelText('本次實際儲位'), { target: { value: 'A01-02' } });
    fireEvent.click(screen.getByRole('button', { name: '取得列印預覽雜湊' }));
    await screen.findByAltText('本機渲染的 50 × 30 mm 橫式藥品標籤預覽');
    fireEvent.change(screen.getByLabelText('本次實際儲位'), { target: { value: 'B03-04' } });
    expect(screen.queryByAltText('本機渲染的 50 × 30 mm 橫式藥品標籤預覽')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '確認送印一張' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
