import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackageCandidate, PosProduct, ScanResultV1 } from '@pharmasaas/types';
import PackageLookupDialog from '../components/PackageLookupDialog';
import { gs1Proposal } from '../services/gs1Proposal';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';

const apiMock = vi.hoisted(() => ({ lookup: vi.fn(), resolve: vi.fn() }));
vi.mock('../api/productPackages', () => ({ productPackagesApi: apiMock }));

const product: PosProduct = { id: 'prod-a', name: '合成商品', sku: 'SKU-001', retailPrice: '12.50', stockQuantity: 200 };
const candidate: PackageCandidate = {
  packageId: 'package-a', revisionId: 'revision-a', revision: 3, label: '原廠瓶', contents: '30 tablets',
  unitsPerPackage: 30, stockUnitLabel: 'tablet', source: 'synthetic reviewed label',
  validFrom: '2026-10-01T00:00:00.000Z', validUntil: null, product,
};
const scan: ScanResultV1 = {
  contractVersion: 1, source: 'manual', literal: '  000AbC  ',
  bytes: { status: 'unknown' }, symbology: { status: 'unknown' }, gs1: { status: 'unknown' },
  decoder: { name: 'manual-text', version: '1' }, evidence: { inputRoute: 'manual-text', hardwareVerified: false },
};
function reset() {
  useCartStore.setState({ items: [], draftRevision: 0, draftScope: 'tenant-a:cashier', orderDiscountAmount: 0,
    orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: null, customerId: null, selectedCustomer: null });
  useCheckoutRecoveryStore.setState({ scope: 'tenant-a:cashier', pending: null });
}
function setup(onClose = vi.fn(), initialScan: ScanResultV1 | undefined = scan) {
  const opener = document.createElement('button'); opener.textContent = 'opener'; document.body.append(opener); opener.focus();
  const view = render(<PackageLookupDialog onClose={onClose} scan={initialScan} />);
  return { ...view, onClose, opener, input: screen.getByLabelText('原始識別碼'), namespace: screen.getByLabelText('識別碼種類') };
}
function axiosStatus(status: number) {
  return new AxiosError('synthetic response', undefined, undefined, undefined, { status, data: {}, headers: {}, config: {} } as AxiosResponse);
}
async function findOne() {
  apiMock.lookup.mockResolvedValue([candidate]);
  await userEvent.setup().click(screen.getByRole('button', { name: '查找完全相符包裝' }));
  return screen.findByRole('button', { name: /原廠瓶/ });
}
beforeEach(() => { vi.resetAllMocks(); apiMock.lookup.mockResolvedValue([candidate]); apiMock.resolve.mockResolvedValue(candidate); reset(); });
afterEach(() => { cleanup(); document.querySelectorAll('button').forEach(button => { if (button.textContent === 'opener') button.remove(); }); });

describe('package lookup POS confirmation dialog', () => {
  it('does not infer GS1 from unknown metadata, even for GS1-looking data or ASCII 29', () => {
    const raw = `01${'09504000059118'}17${'270101'}10LOT\x1d21SERIAL`;
    expect(gs1Proposal({ ...scan, literal: raw, gs1: { status: 'unknown' } })).toEqual({ status: 'unknown' });
    expect(gs1Proposal({ ...scan, literal: raw, gs1: { status: 'observed', value: { separatorOffsets: [] } } })).toEqual({ status: 'unsupported' });
  });

  it('proposes only observed AI 01, 17, 10 and 21 fields with decoder-confirmed separators', () => {
    for (const gtin of ['09504000059118', '09501101020917']) {
      const raw = `01${gtin}1727022810LOT-7\x1d21SER-2`;
      const separatorOffsets = raw.split('\x1d').slice(0, -1).reduce<number[]>((offsets, part) => {
        offsets.push((offsets.at(-1) ?? -1) + part.length + 1); return offsets;
      }, []);
      expect(gs1Proposal({ ...scan, literal: raw, gs1: { status: 'observed', value: { separatorOffsets } } })).toEqual({
        status: 'proposal', gtin, expiryYYMMDD: '270228', lot: 'LOT-7', serial: 'SER-2',
      });
    }
  });

  it.each([
    ['unsupported AI', `01${'09504000059118'}17270101\x1d99X`],
    ['duplicate AI', `01${'09504000059118'}01${'09501101020917'}`],
    ['bad checksum', `01${'09504000059119'}`],
    ['invalid date', `01${'09504000059118'}17270230`],
  ])('fails closed for %s without returning a partial GTIN', (_name, raw) => {
    const separatorOffsets = raw.split('\x1d').slice(0, -1).reduce<number[]>((offsets, part) => {
      offsets.push((offsets.at(-1) ?? -1) + part.length + 1); return offsets;
    }, []);
    expect(gs1Proposal({ ...scan, literal: raw, gs1: { status: 'observed', value: { separatorOffsets } } })).toEqual({ status: 'unsupported' });
  });

  it('requires observed, ordered, exact separator offsets', () => {
    const raw = `01${'09504000059118'}10LOT\x1d21SER`;
    for (const separatorOffsets of [[], [raw.length - 1], [raw.indexOf('\x1d'), raw.indexOf('\x1d')]]) {
      expect(gs1Proposal({ ...scan, literal: raw, gs1: { status: 'observed', value: { separatorOffsets } } })).toEqual({ status: 'unsupported' });
    }
  });

  it('runs lookup on Enter in the literal textarea but leaves Shift+Enter as multiline input', async () => {
    setup();
    const input = screen.getByLabelText('原始識別碼');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(apiMock.lookup).toHaveBeenCalledOnce());
    apiMock.lookup.mockClear();
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: true });
    expect(apiMock.lookup).not.toHaveBeenCalled();
  });

  it('keeps scanned literal exact, defaults to manufacturer namespace, and has no cart effect before explicit confirmation', async () => {
    const user = userEvent.setup(); setup(vi.fn(), scan);
    expect(screen.getByLabelText('識別碼種類')).toHaveValue('MANUFACTURER');
    expect(screen.getByLabelText('原始識別碼')).toHaveValue('  000AbC  ');
    expect(JSON.parse(screen.getByText(/本次輸入來源與原始證據/).parentElement!.querySelector('pre')!.textContent!)).toMatchObject({ literal: '  000AbC  ' });
    await user.click(screen.getByRole('button', { name: '查找完全相符包裝' }));
    expect(apiMock.lookup).toHaveBeenCalledWith({ namespace: 'MANUFACTURER', value: '  000AbC  ' }, expect.any(AbortSignal));
    const row = await screen.findByRole('button', { name: /原廠瓶/ });
    expect(row).toBeEnabled(); expect(useCartStore.getState().items).toEqual([]);
    expect(apiMock.resolve).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('人工確認');
  });

  it('uses the edited literal and namespace exactly and refreshes candidates after edits', async () => {
    const user = userEvent.setup(); setup(vi.fn(), scan);
    await user.click(screen.getByRole('button', { name: '查找完全相符包裝' }));
    await screen.findByRole('button', { name: /原廠瓶/ });
    await user.selectOptions(screen.getByLabelText('識別碼種類'), 'GTIN');
    expect(screen.queryByRole('button', { name: /原廠瓶/ })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('原始識別碼')); await user.type(screen.getByLabelText('原始識別碼'), '00036000291452');
    apiMock.lookup.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: '查找完全相符包裝' }));
    expect(apiMock.lookup).toHaveBeenLastCalledWith({ namespace: 'GTIN', value: '00036000291452' }, expect.any(AbortSignal));
    expect(await screen.findByRole('status')).toHaveTextContent('沒有完全相符');
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('requires manual confirmation and adds exactly the freshly resolved package quantity once', async () => {
    const user = userEvent.setup(); setup();
    const row = await findOne();
    expect(useCartStore.getState().items).toEqual([]);
    apiMock.resolve.mockResolvedValue(candidate);
    await user.dblClick(row);
    await waitFor(() => expect(apiMock.resolve).toHaveBeenCalledOnce());
    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1));
    expect(apiMock.resolve).toHaveBeenCalledWith({ namespace: 'MANUFACTURER', value: scan.literal }, candidate, expect.any(AbortSignal));
    expect(useCartStore.getState().items[0]).toMatchObject({ product, quantity: 30, discountRate: 0 });
    expect(screen.getByRole('status')).toHaveTextContent('已加入 1 個 原廠瓶：30 tablet');
  });

  it('does not expose confirmation for unknown conversion or insufficient current stock', async () => {
    setup();
    const unknown = { ...candidate, unitsPerPackage: null };
    apiMock.lookup.mockResolvedValue([unknown]);
    await userEvent.setup().click(screen.getByRole('button', { name: '查找完全相符包裝' }));
    expect(await screen.findByRole('button', { name: /換算未知/ })).toBeDisabled();
    expect(apiMock.resolve).not.toHaveBeenCalled();
    cleanup(); reset();
    useCartStore.setState({ items: [{ product, quantity: 1, discountRate: 0 }] });
    const low = { ...candidate, unitsPerPackage: 30, product: { ...product, stockQuantity: 30 } };
    apiMock.lookup.mockResolvedValue([low]);
    render(<PackageLookupDialog onClose={vi.fn()} scan={scan} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '查找完全相符包裝' }));
    expect(await screen.findByRole('button', { name: /原廠瓶/ })).toBeDisabled();
    expect(apiMock.resolve).not.toHaveBeenCalled();
    expect(useCartStore.getState().items[0].quantity).toBe(1);
  });

  it.each([[403, '權限不足'], [409, '已變更或失效']])('shows fail-closed lookup message for HTTP %s', async (status, message) => {
    setup(); apiMock.lookup.mockRejectedValue(axiosStatus(status));
    await userEvent.setup().click(screen.getByRole('button', { name: '查找完全相符包裝' }));
    expect(await screen.findByRole('status')).toHaveTextContent(message);
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('keeps cart unchanged if revision resolution fails with conflict', async () => {
    setup(); const row = await findOne(); apiMock.resolve.mockRejectedValue(axiosStatus(409));
    await userEvent.setup().click(row);
    expect(await screen.findByRole('status')).toHaveTextContent('已變更或失效');
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('invalidates an in-flight lookup when the checkout draft changes and ignores its late response', async () => {
    let resolve!: (rows: PackageCandidate[]) => void;
    apiMock.lookup.mockImplementation((_id, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return new Promise<PackageCandidate[]>(yes => { resolve = yes; });
    });
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: '查找完全相符包裝' }));
    const signal = apiMock.lookup.mock.calls[0][1] as AbortSignal;
    act(() => useCartStore.setState(state => ({ draftRevision: state.draftRevision + 1 })));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve([candidate]));
    expect(screen.queryByRole('button', { name: /原廠瓶/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('草稿已變更');
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('aborts pending lookup and restores opener when unmounted', async () => {
    const user = userEvent.setup();
    let signal!: AbortSignal;
    apiMock.lookup.mockImplementation((_id, requestSignal: AbortSignal) => { signal = requestSignal; return new Promise(() => {}); });
    const { unmount, opener } = setup();
    await user.click(screen.getByRole('button', { name: '查找完全相符包裝' }));
    expect(screen.getByRole('status')).toHaveTextContent('正在查找');
    expect(opener).toHaveAttribute('inert');
    unmount();
    expect(signal.aborted).toBe(true); expect(opener).toHaveFocus(); expect(opener).not.toHaveAttribute('inert');
  });

  it('blocks lookup while a checkout recovery intent is pending', async () => {
    useCheckoutRecoveryStore.setState({ pending: { payload: { commandId: 'pending-1' } } as never });
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('草稿已變更');
    expect(screen.getByRole('button', { name: '查找完全相符包裝' })).toBeDisabled();
    expect(apiMock.lookup).not.toHaveBeenCalled();
  });
});
