import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextType } from '../hooks/authContext';
import ProductPackagesDialog from '../pages/Inventory/ProductPackagesDialog';
import { productPackagesApi } from '../api/productPackages';

const apiMock = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), revise: vi.fn(), retire: vi.fn() }));
vi.mock('../api/productPackages', () => ({ productPackagesApi: apiMock }));

const productId = 'product-a';
const revision = {
  id: 'revision-a', packageId: 'package-a', tenantId: 'tenant-a', revision: 2, label: '原廠瓶', contents: '30 tablets',
  unitsPerPackage: 30, source: 'synthetic label v2', reason: '店內人工覆核', validFrom: '2026-10-01T00:00:00.000Z',
  validUntil: null, actorId: 'reviewer-a', createdAt: '2026-10-01T00:00:00.000Z', retiredAt: null,
  retiredById: null, retirementReason: null, identifiers: [{ namespace: 'MANUFACTURER' as const, value: ' 000AbC ' }],
};
const history = {
  product: { id: productId, name: '合成商品', sku: 'SKU-001', costPrice: '10', retailPrice: '20',
    stockQuantity: 4, safetyStock: 1, stockUnitLabel: 'tablet' },
  packages: [{ id: 'package-a', revision: 2, revisions: [revision] }],
};
function auth(permissions = ['read:products', 'update:products'], userId = 'reviewer-a', loading = false): AuthContextType {
  return { user: { id: userId, email: 'reviewer@example.test', fullName: 'Synthetic reviewer', roles: ['tenant-admin'], permissions },
    loading, hasPermission: permission => permissions.includes(permission), login: vi.fn(), demoLogin: vi.fn(), logout: vi.fn() };
}
function axiosError(status: number) {
  return new AxiosError('synthetic failure', undefined, undefined, undefined, {
    status, statusText: 'synthetic', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() }, data: {},
  });
}
const clients: QueryClient[] = [];
function setup(context = auth(), id = productId) {
  const opener = document.createElement('button'); opener.textContent = 'packages opener'; document.body.append(opener); opener.focus();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const close = vi.fn();
  const view = render(<AuthContext.Provider value={context}><QueryClientProvider client={client}>
    <ProductPackagesDialog productId={id} onClose={close} />
  </QueryClientProvider></AuthContext.Provider>);
  return { ...view, client, close, opener, rerenderWith: (next: AuthContextType, nextId = id) => view.rerender(
    <AuthContext.Provider value={next}><QueryClientProvider client={client}>
      <ProductPackagesDialog productId={nextId} onClose={close} />
    </QueryClientProvider></AuthContext.Provider>) };
}
function fillNewDraft() {
  fireEvent.change(screen.getByLabelText('包裝名稱'), { target: { value: '新原廠盒' } });
  fireEvent.change(screen.getByLabelText('規格／劑型／內容量（供辨識差異）'), { target: { value: '12 tablets' } });
  fireEvent.change(screen.getByLabelText('權威資料來源／文件版本'), { target: { value: 'synthetic approved label' } });
  fireEvent.change(screen.getByLabelText('人工覆核原因'), { target: { value: '人工比對包裝內容' } });
  fireEvent.change(screen.getByLabelText('識別碼 1'), { target: { value: ' 000Mfr ' } });
}
beforeEach(() => {
  vi.resetAllMocks();
  apiMock.list.mockResolvedValue({ product: history.product, packages: history.packages });
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear());
  document.querySelectorAll('button').forEach(button => { if (button.textContent === 'packages opener') button.remove(); });
});

describe('tenant-reviewed product package maintenance', () => {
  it('loads only for a signed-in reader and exposes history without write controls to read-only staff', async () => {
    setup(auth(['read:products']));
    expect(await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）')).toBeInTheDocument();
    expect(screen.getByText(/來源：synthetic label v2/)).toBeInTheDocument();
    expect(screen.getByText(/" 000AbC "/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '確認覆核並儲存新 revision' })).not.toBeInTheDocument();
    expect(productPackagesApi.list).toHaveBeenCalledWith(productId, expect.any(AbortSignal));
    expect(productPackagesApi.create).not.toHaveBeenCalled();
  });

  it('fails closed while auth is loading or read permission is absent', () => {
    setup(auth(['read:products'], 'reviewer-a', true));
    expect(screen.getByRole('alert')).toHaveTextContent('無權讀取商品包裝');
    expect(productPackagesApi.list).not.toHaveBeenCalled();
    cleanup();
    setup(auth([], 'reviewer-a'));
    expect(screen.getByRole('alert')).toHaveTextContent('無權讀取商品包裝');
    expect(productPackagesApi.list).not.toHaveBeenCalled();
  });

  it('preserves an exact identifier and confirmed source/reason when creating a new package', async () => {
    setup();
    await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）');
    fireEvent.click(screen.getByRole('button', { name: '新增獨立包裝' }));
    fillNewDraft();
    apiMock.create.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByRole('button', { name: '確認覆核並儲存新 revision' }));
    await waitFor(() => expect(productPackagesApi.create).toHaveBeenCalledOnce());
    const data = vi.mocked(productPackagesApi.create).mock.calls[0][1];
    expect(data).toMatchObject({
      label: '新原廠盒', contents: '12 tablets', stockUnitLabel: 'tablet', source: 'synthetic approved label',
      reason: '人工比對包裝內容', identifiers: [{ namespace: 'MANUFACTURER', value: ' 000Mfr ' }],
      unitsPerPackage: null, validUntil: null,
    });
    await screen.findByText('已儲存。請核對更新後的包裝歷史。');
    expect(productPackagesApi.list).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/請先重新讀取歷史並核對結果/)).toBeInTheDocument();
    expect(screen.getByLabelText('包裝名稱')).toHaveValue('新原廠盒');
  });

  it('replaces the full identifier from pasted text and submits the exact CRLF literal', async () => {
    setup();
    await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）');
    fireEvent.click(screen.getByRole('button', { name: '新增獨立包裝' }));
    fillNewDraft();
    const original = ' 00Ab\r\n ';
    fireEvent.paste(screen.getByLabelText('識別碼 1'), {
      clipboardData: { getData: vi.fn(() => original) },
    });
    expect(screen.getByLabelText('識別碼 1 原文')).toHaveTextContent(JSON.stringify(original));
    apiMock.create.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByRole('button', { name: '確認覆核並儲存新 revision' }));
    await waitFor(() => expect(productPackagesApi.create).toHaveBeenCalledOnce());
    expect(vi.mocked(productPackagesApi.create).mock.calls[0][1].identifiers).toEqual([
      { namespace: 'MANUFACTURER', value: original },
    ]);
  });

  it('creates a new immutable revision from selected history and sends the expected revision', async () => {
    setup();
    await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）');
    fireEvent.click(screen.getByRole('button', { name: '以 revision 2 建立新版本' }));
    expect(screen.getByRole('heading', { name: '建立新 revision（原版本 2）' })).toBeInTheDocument();
    expect(screen.getByLabelText('包裝名稱')).toHaveValue('原廠瓶');
    expect(screen.getByLabelText('識別碼 1')).toHaveValue(' 000AbC ');
    fillNewDraft(); apiMock.revise.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByRole('button', { name: '確認覆核並儲存新 revision' }));
    await waitFor(() => expect(productPackagesApi.revise).toHaveBeenCalledOnce());
    expect(productPackagesApi.revise).toHaveBeenCalledWith(productId, 'package-a', 2, expect.objectContaining({
      label: '新原廠盒', identifiers: [{ namespace: 'MANUFACTURER', value: ' 000Mfr ' }],
    }));
  });

  it.each([[403, '權限不足'], [409, '版本或庫存單位已變更']])('keeps the draft and blocks resubmission after HTTP %s', async (status, message) => {
    setup();
    await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）');
    fireEvent.click(screen.getByRole('button', { name: '新增獨立包裝' })); fillNewDraft();
    apiMock.create.mockRejectedValue(axiosError(status));
    fireEvent.click(screen.getByRole('button', { name: '確認覆核並儲存新 revision' }));
    expect(await screen.findByRole('status')).toHaveTextContent(message);
    expect(screen.getByLabelText('包裝名稱')).toHaveValue('新原廠盒');
    expect(screen.getByRole('button', { name: '確認覆核並儲存新 revision' })).toBeDisabled();
    expect(productPackagesApi.list).toHaveBeenCalledOnce();
  });

  it.each([['new package', 'create'], ['revision', 'revise']] as const)(
    'preserves and locks the %s draft after an unknown HTTP 500 result', async (_label, kind) => {
      setup();
      await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）');
      if (kind === 'revise') fireEvent.click(screen.getByRole('button', { name: '以 revision 2 建立新版本' }));
      else fireEvent.click(screen.getByRole('button', { name: '新增獨立包裝' }));
      fillNewDraft();
      const write = kind === 'create' ? apiMock.create : apiMock.revise;
      write.mockRejectedValue(axiosError(500));
      fireEvent.click(screen.getByRole('button', { name: '確認覆核並儲存新 revision' }));
      await waitFor(() => expect(write).toHaveBeenCalledOnce());
      expect(await screen.findByRole('status')).toHaveTextContent('操作未確認成功');
      expect(screen.getByLabelText('包裝名稱')).toHaveValue('新原廠盒');
      expect(screen.getByLabelText('識別碼 1 原文')).toHaveTextContent(JSON.stringify(' 000Mfr '));
      expect(screen.getByRole('button', { name: '新增獨立包裝' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '以 revision 2 建立新版本' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '確認覆核並儲存新 revision' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: '確認覆核並儲存新 revision' }));
      expect(write).toHaveBeenCalledOnce();
    },
  );

  it('stays locked after refresh GET fails and requires refreshed history plus explicit selection before writing', async () => {
    setup();
    await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）');
    fireEvent.click(screen.getByRole('button', { name: '新增獨立包裝' })); fillNewDraft();
    apiMock.create.mockRejectedValue(axiosError(500));
    fireEvent.click(screen.getByRole('button', { name: '確認覆核並儲存新 revision' }));
    expect(await screen.findByRole('status')).toHaveTextContent('操作未確認成功');

    apiMock.list.mockRejectedValueOnce(axiosError(500));
    fireEvent.click(screen.getByRole('button', { name: '重新載入歷史' }));
    await waitFor(() => expect(productPackagesApi.list).toHaveBeenCalledTimes(2));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('包裝名稱')).toHaveValue('新原廠盒');
    expect(screen.getByRole('button', { name: '新增獨立包裝' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '確認覆核並儲存新 revision' })).toBeDisabled();

    apiMock.list.mockResolvedValueOnce({ product: history.product, packages: history.packages });
    fireEvent.click(screen.getByRole('button', { name: '重新載入歷史' }));
    await waitFor(() => expect(productPackagesApi.list).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增獨立包裝' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '以 revision 2 建立新版本' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '確認覆核並儲存新 revision' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '以 revision 2 建立新版本' }));
    expect(screen.getByRole('button', { name: '確認覆核並儲存新 revision' })).toBeEnabled();
    expect(apiMock.create).toHaveBeenCalledOnce();
  });

  it('blocks concurrent writes and requires an explicit reason to retire a current revision', async () => {
    setup();
    await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）');
    expect(screen.getByRole('button', { name: '停用此 revision' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('停用原因（停用前必填）'), { target: { value: '停售，建立新版本' } });
    let resolve!: () => void;
    apiMock.retire.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    const retire = screen.getByRole('button', { name: '停用此 revision' });
    fireEvent.click(retire); fireEvent.click(retire);
    await waitFor(() => expect(productPackagesApi.retire).toHaveBeenCalledOnce());
    expect(retire).toBeDisabled();
    await act(async () => resolve());
    await screen.findByText('已儲存。請核對更新後的包裝歷史。');
    expect(productPackagesApi.retire).toHaveBeenCalledWith(productId, 'package-a', 2, '停售，建立新版本');
  });

  it('keeps authorization and data scoped to current user and product and discards drafts on identity change', async () => {
    const view = setup();
    await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）');
    fireEvent.click(screen.getByRole('button', { name: '新增獨立包裝' }));
    fireEvent.change(screen.getByLabelText('包裝名稱'), { target: { value: 'private draft' } });
    view.rerenderWith(auth(['read:products', 'update:products'], 'reviewer-b'), 'product-b');
    await waitFor(() => expect(productPackagesApi.list).toHaveBeenCalledWith('product-b', expect.any(AbortSignal)));
    expect(productPackagesApi.list).toHaveBeenLastCalledWith('product-b', expect.any(AbortSignal));
    expect(screen.queryByDisplayValue('private draft')).not.toBeInTheDocument();
  });

  it('discards a draft when the same reviewer switches to a different product', async () => {
    const context = auth();
    const view = setup(context);
    await screen.findByText('原廠瓶 · revision 2 · 未停用（仍須符合有效期）');
    fireEvent.click(screen.getByRole('button', { name: '新增獨立包裝' }));
    fireEvent.change(screen.getByLabelText('包裝名稱'), { target: { value: 'product-a private draft' } });
    apiMock.list.mockImplementation(async (id: string) => ({
      product: { ...history.product, id, name: '商品 B' }, packages: [],
    }));
    view.rerenderWith(context, 'product-b');
    expect(await screen.findByText('商品 B · SKU SKU-001')).toBeInTheDocument();
    expect(productPackagesApi.list).toHaveBeenLastCalledWith('product-b', expect.any(AbortSignal));
    expect(screen.queryByDisplayValue('product-a private draft')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '新增包裝草稿' })).toBeInTheDocument();
    expect(screen.getByLabelText('包裝名稱')).toHaveValue('');
  });

  it('shows query failures and restores the opener on close', async () => {
    apiMock.list.mockRejectedValueOnce(axiosError(403));
    const { opener } = setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('權限不足');
    fireEvent.click(screen.getByRole('button', { name: '關閉包裝維護' }));
    expect(opener).toHaveFocus();
  });
});
